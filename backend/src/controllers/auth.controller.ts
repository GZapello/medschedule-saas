import { completeProfessionalProfile } from '../utils/professional-profile';
import { resolveProfessionModule, resolveCanonicalProfession } from '../utils/profession-module';
import { respondBillingError } from './billing.controller';
import { requireCapacity, pendingBillingManager, BillingService } from '../services/billing.service';
import { Request, Response } from 'express';
import { requireOpenRegistration } from '../services/clinic-control.service';
import { db, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from '../config/database';
import { comparePassword, hashPassword } from '../utils/password';
import { generateToken } from '../utils/jwt';
import { logAudit } from '../middlewares/audit.middleware';
import { v4 as uuidv4 } from 'uuid';
import { createDefaultSchedules } from '../utils/schedule-defaults';
import { EmailService } from '../services/email.service';
import { CapabilityService } from '../services/capability.service';

export class AuthController {
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'Email e senha são obrigatórios' });
        return;
      }

      const attemptedEmail = String(email).trim().toLowerCase();

      const userStmt = db.prepare(`
        SELECT id, tenant_id, name, email, password_hash, role, phone, avatar_url, status,
               terms_version_accepted, privacy_version_accepted, terms_accepted_at, privacy_accepted_at
        FROM users
        WHERE email = ?
      `);
      const user = userStmt.get(email.trim().toLowerCase()) as {
        id: string;
        tenant_id: string | null;
        name: string;
        email: string;
        password_hash: string;
        role: 'superadmin' | 'clinic_admin' | 'professional' | 'receptionist' | 'patient';
        phone: string | null;
        avatar_url: string | null;
        status: string;
        terms_version_accepted?: string | null;
        privacy_version_accepted?: string | null;
        terms_accepted_at?: string | null;
        privacy_accepted_at?: string | null;
      } | undefined;

      if (!user) {
        logAudit(req, 'LOGIN_FAILED', 'users', undefined, { email: attemptedEmail, reason: 'invalid_credentials' });
        res.status(401).json({ error: 'Credenciais inválidas' });
        return;
      }

      const valid = await comparePassword(password, user.password_hash);
      if (!valid) {
        logAudit(req, 'LOGIN_FAILED', 'users', user.id, { email: attemptedEmail, reason: 'invalid_credentials' });
        res.status(401).json({ error: 'Credenciais inválidas' });
        return;
      }

      // Validação de status do usuário
      if (user.status === 'pending' && !pendingBillingManager(user)) {
        logAudit(req, 'LOGIN_FAILED', 'users', user.id, { email: attemptedEmail, reason: 'account_pending' });
        res.status(403).json({
          error: 'Sua solicitação de acesso está aguardando aprovação pelo gestor da clínica.',
          code: 'USER_PENDING'
        });
        return;
      }

      if (user.status === 'rejected') {
        logAudit(req, 'LOGIN_FAILED', 'users', user.id, { email: attemptedEmail, reason: 'account_rejected' });
        res.status(403).json({
          error: 'Sua solicitação de acesso a esta clínica foi recusada pela administração.',
          code: 'USER_REJECTED'
        });
        return;
      }

      if (user.status === 'blocked' || user.status === 'inactive') {
        logAudit(req, 'LOGIN_FAILED', 'users', user.id, { email: attemptedEmail, reason: 'account_inactive' });
        res.status(403).json({
          error: 'Sua conta de usuário está desativada ou bloqueada. Entre em contato com o gestor da clínica.',
          code: 'USER_BLOCKED'
        });
        return;
      }

      // Busca dados do tenant se o usuário for vinculado a um
      let tenantData: any = null;
      if (user.tenant_id) {
        const tenantStmt = db.prepare(`
          SELECT 
            id, slug, name, corporate_name, trade_name, email, phone, logo_url,
            primary_color, client_term_label, status, banned_reason, registrations_blocked,
            onboarding_completed, onboarding_step, manager_confirmed, manager_profession, manager_practice_areas
          FROM tenants
          WHERE id = ?
        `);
        tenantData = tenantStmt.get(user.tenant_id);

        if (tenantData) {
          if (tenantData.status === 'banned') {
            logAudit(req, 'LOGIN_FAILED', 'users', user.id, { email: attemptedEmail, reason: 'clinic_banned' });
            res.status(403).json({
              error: 'Esta clínica foi banida pelo Administrador do Sistema. O acesso está permanentemente bloqueado.',
              code: 'CLINIC_BANNED',
              banned_reason: tenantData.banned_reason
            });
            return;
          }

          if (tenantData.status === 'pending' && !pendingBillingManager(user)) {
            logAudit(req, 'LOGIN_FAILED', 'users', user.id, { email: attemptedEmail, reason: 'clinic_pending' });
            res.status(403).json({
              error: 'O cadastro da sua clínica está em análise e pendente de aprovação pelo Administrador do SaaS. Você será notificado assim que o acesso for liberado.',
              code: 'CLINIC_PENDING'
            });
            return;
          }

          if (tenantData.status === 'blocked' || tenantData.status === 'suspended') {
            logAudit(req, 'LOGIN_FAILED', 'users', user.id, { email: attemptedEmail, reason: 'clinic_blocked' });
            res.status(403).json({
              error: 'O acesso a esta clínica está temporariamente suspenso ou bloqueado. Entre em contato com o suporte.',
              code: 'CLINIC_BLOCKED'
            });
            return;
          }

          if (tenantData.status === 'rejected') {
            logAudit(req, 'LOGIN_FAILED', 'users', user.id, { email: attemptedEmail, reason: 'clinic_rejected' });
            res.status(403).json({
              error: 'O cadastro desta clínica foi recusado pela administração do SaaS.',
              code: 'CLINIC_REJECTED'
            });
            return;
          }
        }
      }

      const token = generateToken({
        userId: user.id,
        tenantId: user.tenant_id,
        role: user.role,
        email: user.email,
        name: user.name
      });

      // Log de auditoria
      logAudit(req, 'USER_LOGIN', 'users', user.id, { email: user.email, role: user.role });

      // Busca dados profissionais se for professional ou se o clinic_admin atuar como profissional
      let profDetails: any = null;
      if (user.role === 'professional' || user.role === 'clinic_admin') {
        profDetails = db.prepare(`
          SELECT 
            p.id as professional_id, p.active as professional_active, p.profession_id, p.specialty_id, p.registration_type, p.registration_number,
            p.practice_areas, p.slug as professional_slug, p.zemda_fisio_enabled, p.zemda_odonto_enabled, p.zemda_nutri_enabled, p.zemda_to_enabled, p.zemda_fono_enabled, p.zemda_pp_enabled, p.zemda_psico_enabled, p.zemda_personal_enabled,
            prof.name as profession_name, prof.slug as profession_slug,
            spec.name as specialty_name
          FROM professionals p
          LEFT JOIN professions prof ON prof.id = p.profession_id
          LEFT JOIN specialties spec ON spec.id = p.specialty_id
          WHERE p.user_id = ? AND p.tenant_id = ? ORDER BY p.active DESC, p.id
        `).get(user.id, user.tenant_id);

        // Se não houver registro formal em professionals, verifica clinic_users / users / tenant
        if (!profDetails && user.role === 'clinic_admin') {
          const cu = db.prepare(`
            SELECT cu.profession_custom, cu.practice_areas, cu.zemda_fisio_enabled, cu.zemda_odonto_enabled, cu.zemda_pp_enabled, cu.zemda_psico_enabled, cu.zemda_personal_enabled,
                   u.profession_name, u.practice_areas as user_practice_areas,
                   u.registration_type, u.registration_number
            FROM clinic_users cu
            LEFT JOIN users u ON u.id = cu.user_id
            WHERE cu.user_id = ? AND cu.tenant_id = ?
          `).get(user.id, user.tenant_id) as any;

          const pName = cu?.profession_custom || cu?.profession_name || tenantData?.manager_profession || '';
          const pAreas = cu?.practice_areas || cu?.user_practice_areas || tenantData?.manager_practice_areas || '';

          if (pName || pAreas) {
            const pSlug = pName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
            let deducedProfId: string | undefined = undefined;
            if (pName.toLowerCase().includes('psicopedag')) deducedProfId = 'prof-psicopedagogo';
            else if (pName.toLowerCase().includes('psicolog') || pName.toLowerCase().includes('psicólog')) deducedProfId = 'prof-psicologo';
            else if (pName.toLowerCase().includes('fisio')) deducedProfId = 'prof-fisioterapeuta';
            else if (pName.toLowerCase().includes('odonto') || pName.toLowerCase().includes('dentis')) deducedProfId = 'prof-dentista';
            else if (pName.toLowerCase().includes('nutri')) deducedProfId = 'prof-nutricionista';
            else if (pName.toLowerCase().includes('ocupacional')) deducedProfId = 'prof-terapeuta-ocupacional';
            else if (pName.toLowerCase().includes('fono')) deducedProfId = 'prof-fonoaudiologo';
            else if (pName.toLowerCase().includes('personal')) deducedProfId = 'prof-personal-trainer';

            profDetails = {
              profession_id: deducedProfId,
              profession_name: pName,
              profession_slug: pSlug,
              practice_areas: pAreas,
              registration_type: cu?.registration_type,
              registration_number: cu?.registration_number,
              zemda_fisio_enabled: cu?.zemda_fisio_enabled ?? 0,
              zemda_odonto_enabled: cu?.zemda_odonto_enabled ?? 0,
              zemda_nutri_enabled: cu?.zemda_nutri_enabled ?? 0,
              zemda_to_enabled: cu?.zemda_to_enabled ?? 0,
              zemda_fono_enabled: cu?.zemda_fono_enabled ?? 0,
              zemda_pp_enabled: cu?.zemda_pp_enabled ?? 0,
              zemda_psico_enabled: cu?.zemda_psico_enabled ?? 0,
              zemda_personal_enabled: cu?.zemda_personal_enabled ?? 0
            };
          }
        }
      }

      const needsOnboarding = false;

      let userPermissions: string[] = [];
      let cuRow: any = null;
      if (user.tenant_id) {
        cuRow = db.prepare('SELECT permissions_json, zemda_fisio_enabled, zemda_odonto_enabled, zemda_nutri_enabled, zemda_to_enabled, zemda_fono_enabled, zemda_pp_enabled, zemda_psico_enabled, zemda_personal_enabled, zemda_body_enabled FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(user.id, user.tenant_id) as any;
        if (cuRow?.permissions_json) {
          try { userPermissions = JSON.parse(cuRow.permissions_json); } catch {}
        }
      }

      if (user.role === 'professional' || user.role === 'clinic_admin') {
        profDetails = completeProfessionalProfile(user.id, user.tenant_id, profDetails);
      }

      const isProfessionalUser = user.role === 'professional' && !!profDetails?.professional_id && profDetails?.professional_active === 1;
      const isManagerUser = user.role === 'clinic_admin' && profDetails?.professional_active !== 0;
      const isEligibleUser = user.role !== 'superadmin' && (isProfessionalUser || isManagerUser);

      // Resolução centralizada com exclusividade mútua baseada na profissão oficial atual
      const professionResolution = resolveCanonicalProfession({
        id: profDetails?.profession_id,
        name: profDetails?.profession_name,
        slug: profDetails?.profession_slug,
        registrationType: profDetails?.registration_type
      });
      const modFlags = professionResolution.flags;

      const zemdaFisioEnabled = isEligibleUser && modFlags.zemda_fisio_enabled === 1;
      const zemdaOdontoEnabled = isEligibleUser && modFlags.zemda_odonto_enabled === 1;
      const zemdaNutriEnabled = isEligibleUser && modFlags.zemda_nutri_enabled === 1;
      const zemdaToEnabled = isEligibleUser && modFlags.zemda_to_enabled === 1;
      const zemdaFonoEnabled = isEligibleUser && modFlags.zemda_fono_enabled === 1;
      const zemdaPsicoEnabled = isEligibleUser && modFlags.zemda_psico_enabled === 1;
      const zemdaPPEnabled = isEligibleUser && modFlags.zemda_pp_enabled === 1;
      const zemdaPersonalEnabled = isEligibleUser && modFlags.zemda_personal_enabled === 1;
      const zemdaBodyEnabled = user.role !== 'superadmin' && (
        user.role === 'clinic_admin' || user.role === 'professional'
      );

      const computedCaps = (user.tenant_id && user.role !== 'superadmin')
        ? CapabilityService.computeUserCapabilities(user.id, user.tenant_id)
        : null;

      const zemdaMedEnabled = isEligibleUser && modFlags.zemda_med_enabled === 1;

      const needsLegalAcceptance = user.role !== 'superadmin' && (
        user.terms_version_accepted !== CURRENT_TERMS_VERSION ||
        user.privacy_version_accepted !== CURRENT_PRIVACY_VERSION
      );

      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          phone: user.phone,
          avatarUrl: user.avatar_url,
          tenantId: user.tenant_id,
          needsOnboarding,
          needsLegalAcceptance,
          termsVersionAccepted: user.terms_version_accepted || null,
          privacyVersionAccepted: user.privacy_version_accepted || null,
          termsAcceptedAt: user.terms_accepted_at || null,
          privacyAcceptedAt: user.privacy_accepted_at || null,
          professionalId: profDetails?.professional_id,
          professionId: profDetails?.profession_id,
          canonicalProfessionId: professionResolution.canonicalId,
          canonicalProfessionName: professionResolution.canonicalName,
          professionName: profDetails?.profession_name,
          professionSlug: profDetails?.profession_slug,
          registrationType: profDetails?.registration_type,
          registrationNumber: profDetails?.registration_number,
          specialtyName: profDetails?.specialty_name,
          professionalSlug: profDetails?.professional_slug,
          practiceAreas: [profDetails?.practice_areas, user.role === 'clinic_admin' ? tenantData?.manager_profession : '', user.role === 'clinic_admin' ? tenantData?.manager_practice_areas : ''].filter(Boolean).join(', '),
          permissions: userPermissions,
          zemdaFisioEnabled,
          zemdaOdontoEnabled,
          zemdaNutriEnabled,
          zemdaToEnabled,
          zemdaFonoEnabled,
          zemdaPPEnabled,
          zemdaPsicoEnabled,
          zemdaPersonalEnabled,
          zemdaMedEnabled: !!zemdaMedEnabled,
          zemdaBodyEnabled,
          commercialModule: professionResolution.commercialModule || computedCaps?.commercialModule || null,
          clinicalWorkspace: professionResolution.clinicalWorkspace || computedCaps?.clinicalWorkspace || null,
          taxonomyCategory: professionResolution.taxonomyCategory || computedCaps?.taxonomyCategory || null,
          capabilities: computedCaps?.activeCapabilities || [],
          practiceAreaIds: computedCaps?.practiceAreaIds || [],
          selectedOptionalCapabilities: computedCaps?.selectedOptionalCapabilities || []
        },
        tenant: tenantData
      });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[AuthController.login] Erro:', err);
      res.status(500).json({ error: 'Erro interno ao realizar login' });
    }
  }

  static async me(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const userStmt = db.prepare(`
        SELECT id, tenant_id, name, email, role, phone, avatar_url, status,
               terms_version_accepted, privacy_version_accepted, terms_accepted_at, privacy_accepted_at
        FROM users
        WHERE id = ?
      `);
      const user = userStmt.get(req.user.userId) as any;

      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      if (req.user.role !== 'superadmin') user.tenant_id = req.tenantId;

      let tenantData: any = null;
      if (user.tenant_id) {
        const tenantStmt = db.prepare(`
          SELECT 
            id, slug, name, corporate_name, trade_name, email, phone, logo_url,
            primary_color, client_term_label, status,
            onboarding_completed, onboarding_step, manager_confirmed, manager_profession, manager_practice_areas
          FROM tenants
          WHERE id = ?
        `);
        tenantData = tenantStmt.get(user.tenant_id);
      }

      // Busca dados profissionais se for professional ou se o clinic_admin atuar como profissional
      let profDetails: any = null;
      if (user.role === 'professional' || user.role === 'clinic_admin') {
        profDetails = db.prepare(`
          SELECT 
            p.id as professional_id, p.active as professional_active, p.profession_id, p.specialty_id, p.registration_type, p.registration_number,
            p.practice_areas, p.slug as professional_slug, p.zemda_fisio_enabled, p.zemda_odonto_enabled, p.zemda_nutri_enabled, p.zemda_to_enabled, p.zemda_fono_enabled, p.zemda_pp_enabled, p.zemda_psico_enabled, p.zemda_personal_enabled,
            prof.name as profession_name, prof.slug as profession_slug,
            spec.name as specialty_name
          FROM professionals p
          LEFT JOIN professions prof ON prof.id = p.profession_id
          LEFT JOIN specialties spec ON spec.id = p.specialty_id
          WHERE p.user_id = ? AND p.tenant_id = ? ORDER BY p.active DESC, p.id
        `).get(user.id, user.tenant_id);

        if (!profDetails && user.role === 'clinic_admin') {
          const cu = db.prepare(`
            SELECT cu.profession_custom, cu.practice_areas, cu.zemda_fisio_enabled, cu.zemda_odonto_enabled, cu.zemda_pp_enabled, cu.zemda_psico_enabled, cu.zemda_personal_enabled,
                   u.profession_name, u.practice_areas as user_practice_areas,
                   u.registration_type, u.registration_number
            FROM clinic_users cu
            LEFT JOIN users u ON u.id = cu.user_id
            WHERE cu.user_id = ? AND cu.tenant_id = ?
          `).get(user.id, user.tenant_id) as any;

          const pName = cu?.profession_custom || cu?.profession_name || tenantData?.manager_profession || '';
          const pAreas = cu?.practice_areas || cu?.user_practice_areas || tenantData?.manager_practice_areas || '';

          if (pName || pAreas) {
            const pSlug = pName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
            let deducedProfId: string | undefined = undefined;
            if (pName.toLowerCase().includes('psicopedag')) deducedProfId = 'prof-psicopedagogo';
            else if (pName.toLowerCase().includes('psicolog') || pName.toLowerCase().includes('psicólog')) deducedProfId = 'prof-psicologo';
            else if (pName.toLowerCase().includes('fisio')) deducedProfId = 'prof-fisioterapeuta';
            else if (pName.toLowerCase().includes('odonto') || pName.toLowerCase().includes('dentis')) deducedProfId = 'prof-dentista';
            else if (pName.toLowerCase().includes('nutri')) deducedProfId = 'prof-nutricionista';
            else if (pName.toLowerCase().includes('ocupacional')) deducedProfId = 'prof-terapeuta-ocupacional';
            else if (pName.toLowerCase().includes('fono')) deducedProfId = 'prof-fonoaudiologo';
            else if (pName.toLowerCase().includes('personal')) deducedProfId = 'prof-personal-trainer';

            profDetails = {
              profession_id: deducedProfId,
              profession_name: pName,
              profession_slug: pSlug,
              practice_areas: pAreas,
              registration_type: cu?.registration_type,
              registration_number: cu?.registration_number,
              zemda_fisio_enabled: cu?.zemda_fisio_enabled ?? 0,
              zemda_odonto_enabled: cu?.zemda_odonto_enabled ?? 0,
              zemda_nutri_enabled: cu?.zemda_nutri_enabled ?? 0,
              zemda_to_enabled: cu?.zemda_to_enabled ?? 0,
              zemda_fono_enabled: cu?.zemda_fono_enabled ?? 0,
              zemda_pp_enabled: cu?.zemda_pp_enabled ?? 0,
              zemda_psico_enabled: cu?.zemda_psico_enabled ?? 0,
              zemda_personal_enabled: cu?.zemda_personal_enabled ?? 0
            };
          }
        }
      }

      let userPermissions: string[] = [];
      let cuRow: any = null;
      if (user.tenant_id) {
        cuRow = db.prepare('SELECT permissions_json, zemda_fisio_enabled, zemda_odonto_enabled, zemda_nutri_enabled, zemda_to_enabled, zemda_fono_enabled, zemda_pp_enabled, zemda_psico_enabled, zemda_personal_enabled, zemda_body_enabled FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(user.id, user.tenant_id) as any;
        if (cuRow?.permissions_json) {
          try { userPermissions = JSON.parse(cuRow.permissions_json); } catch {}
        }
      }
      const needsOnboarding = false;

      if (user.role === 'professional' || user.role === 'clinic_admin') {
        profDetails = completeProfessionalProfile(user.id, user.tenant_id, profDetails);
      }

      const isProfessionalUser = user.role === 'professional' && !!profDetails?.professional_id && profDetails?.professional_active === 1;
      const isManagerUser = user.role === 'clinic_admin' && profDetails?.professional_active !== 0;
      const isEligibleUser = user.role !== 'superadmin' && (isProfessionalUser || isManagerUser);

      // Resolução centralizada com exclusividade mútua baseada na profissão oficial atual
      const professionResolution = resolveCanonicalProfession({
        id: profDetails?.profession_id,
        name: profDetails?.profession_name,
        slug: profDetails?.profession_slug,
        registrationType: profDetails?.registration_type
      });
      const modFlags = professionResolution.flags;

      const zemdaFisioEnabled = isEligibleUser && modFlags.zemda_fisio_enabled === 1;
      const zemdaOdontoEnabled = isEligibleUser && modFlags.zemda_odonto_enabled === 1;
      const zemdaNutriEnabled = isEligibleUser && modFlags.zemda_nutri_enabled === 1;
      const zemdaToEnabled = isEligibleUser && modFlags.zemda_to_enabled === 1;
      const zemdaFonoEnabled = isEligibleUser && modFlags.zemda_fono_enabled === 1;
      const zemdaPsicoEnabled = isEligibleUser && modFlags.zemda_psico_enabled === 1;
      const zemdaPPEnabled = isEligibleUser && modFlags.zemda_pp_enabled === 1;
      const zemdaPersonalEnabled = isEligibleUser && modFlags.zemda_personal_enabled === 1;
      const zemdaBodyEnabled = user.role !== 'superadmin' && (
        user.role === 'clinic_admin' || user.role === 'professional'
      );

      const computedCaps = (user.tenant_id && user.role !== 'superadmin')
        ? CapabilityService.computeUserCapabilities(user.id, user.tenant_id)
        : null;

      const zemdaMedEnabled = isEligibleUser && modFlags.zemda_med_enabled === 1;

      const needsLegalAcceptance = user.role !== 'superadmin' && (
        user.terms_version_accepted !== CURRENT_TERMS_VERSION ||
        user.privacy_version_accepted !== CURRENT_PRIVACY_VERSION
      );

      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          phone: user.phone,
          avatarUrl: user.avatar_url,
          tenantId: user.tenant_id,
          needsOnboarding,
          needsLegalAcceptance,
          termsVersionAccepted: user.terms_version_accepted || null,
          privacyVersionAccepted: user.privacy_version_accepted || null,
          termsAcceptedAt: user.terms_accepted_at || null,
          privacyAcceptedAt: user.privacy_accepted_at || null,
          professionalId: profDetails?.professional_id,
          professionId: profDetails?.profession_id,
          canonicalProfessionId: professionResolution.canonicalId,
          canonicalProfessionName: professionResolution.canonicalName,
          professionName: profDetails?.profession_name,
          professionSlug: profDetails?.profession_slug,
          registrationType: profDetails?.registration_type,
          registrationNumber: profDetails?.registration_number,
          specialtyName: profDetails?.specialty_name,
          professionalSlug: profDetails?.professional_slug,
          practiceAreas: [profDetails?.practice_areas, user.role === 'clinic_admin' ? tenantData?.manager_profession : '', user.role === 'clinic_admin' ? tenantData?.manager_practice_areas : ''].filter(Boolean).join(', '),
          permissions: userPermissions,
          zemdaFisioEnabled,
          zemdaOdontoEnabled,
          zemdaNutriEnabled,
          zemdaToEnabled,
          zemdaFonoEnabled,
          zemdaPPEnabled,
          zemdaPsicoEnabled,
          zemdaPersonalEnabled,
          zemdaMedEnabled: !!zemdaMedEnabled,
          zemdaBodyEnabled,
          commercialModule: professionResolution.commercialModule || computedCaps?.commercialModule || null,
          clinicalWorkspace: professionResolution.clinicalWorkspace || computedCaps?.clinicalWorkspace || null,
          taxonomyCategory: professionResolution.taxonomyCategory || computedCaps?.taxonomyCategory || null,
          capabilities: computedCaps?.activeCapabilities || [],
          practiceAreaIds: computedCaps?.practiceAreaIds || [],
          selectedOptionalCapabilities: computedCaps?.selectedOptionalCapabilities || []
        },
        tenant: tenantData
      });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[AuthController.me] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar usuário autenticado' });
    }
  }

  // 1.1 Aceite de Novos Termos de Uso e Política de Privacidade (Re-aceite em atualizações materiais)
  static async acceptLegal(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const { termsAccepted, privacyAccepted } = req.body;

      if (!termsAccepted || !privacyAccepted) {
        res.status(400).json({ error: 'É obrigatório aceitar os Termos de Uso e a Política de Privacidade' });
        return;
      }

      const userId = req.user.userId;
      const tenantId = req.user.tenantId;

      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || null;
      const userAgent = (req.headers['user-agent'] as string) || null;
      const acceptanceId = 'la-' + uuidv4().slice(0, 8);

      db.prepare(`
        INSERT INTO legal_acceptances (
          id, user_id, clinic_id, terms_version, privacy_version, accepted_at, ip_address, user_agent, created_at
        ) VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?, datetime('now'))
      `).run(
        acceptanceId,
        userId,
        tenantId || 'global',
        CURRENT_TERMS_VERSION,
        CURRENT_PRIVACY_VERSION,
        ipAddress,
        userAgent
      );

      db.prepare(`
        UPDATE users
        SET terms_version_accepted = ?, privacy_version_accepted = ?,
            terms_accepted_at = datetime('now'), privacy_accepted_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION, userId);

      if (tenantId) {
        db.prepare(`
          UPDATE tenants
          SET terms_version = ?, privacy_version = ?,
              terms_accepted = 1, terms_accepted_at = datetime('now'),
              privacy_accepted = 1, privacy_accepted_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = ?
        `).run(CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION, tenantId);
      }

      logAudit(req, 'LEGAL_ACCEPTANCE', 'users', userId, {
        termsVersion: CURRENT_TERMS_VERSION,
        privacyVersion: CURRENT_PRIVACY_VERSION
      });

      res.json({
        success: true,
        message: 'Termos de Uso e Política de Privacidade aceitos com sucesso.',
        termsVersion: CURRENT_TERMS_VERSION,
        privacyVersion: CURRENT_PRIVACY_VERSION,
        needsLegalAcceptance: false
      });
    } catch (err: any) {
      console.error('[AuthController.acceptLegal] Erro:', err);
      res.status(500).json({ error: 'Erro ao registrar aceite legal' });
    }
  }

  static async register(req: Request, res: Response): Promise<void> {
    try {
      const {
        name,
        email,
        password,
        phone,
        role,
        tenantId,
        professionName,
        practiceAreas,
        registrationType,
        registrationNumber
      } = req.body;

      if (!name || !email || !password) {
        res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
        return;
      }

      if (!tenantId) {
        res.status(400).json({ error: 'É obrigatório selecionar a clínica à qual deseja solicitar acesso' });
        return;
      }

      // Valida se a clínica existe e está ativa
      const tenant = db.prepare('SELECT id, name, status FROM tenants WHERE id = ?').get(tenantId) as any;
      if (!tenant) {
        res.status(404).json({ error: 'Clínica selecionada não foi encontrada' });
        return;
      }

      if (tenant.status !== 'active') {
        res.status(400).json({ error: 'A clínica selecionada não está ativa no momento' });
        return;
      }

      const cleanEmail = email.trim().toLowerCase();

      // Verifica se o email já existe
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
      if (existing) {
        res.status(409).json({ error: 'Este e-mail já está cadastrado na plataforma' });
        return;
      }

      const hashedPassword = await hashPassword(password);
      try { requireOpenRegistration(tenantId); requireCapacity(tenantId); } catch (err) { if (respondBillingError(res,err)) return; res.status(403).json({ error: 'Novos cadastros estão bloqueados para esta clínica.' }); return; }
      const userId = 'usr-' + uuidv4().slice(0, 8);

      // Mapeamento de papel
      let userRole: any = 'receptionist';
      const profLower = (professionName || '').toLowerCase();
      if (role === 'clinic_admin' || profLower.includes('gestor') || profLower.includes('administrador') || profLower.includes('direção')) {
        userRole = 'clinic_admin';
      } else if (
        role === 'professional' ||
        profLower.includes('médic') ||
        profLower.includes('psic') ||
        profLower.includes('fono') ||
        profLower.includes('fisio') ||
        profLower.includes('terap') ||
        profLower.includes('nutri') ||
        profLower.includes('dent') ||
        profLower.includes('enferm') ||
        profLower.includes('biomed') ||
        profLower.includes('farmac') ||
        profLower.includes('saúde')
      ) {
        userRole = 'professional';
      } else if (role && ['receptionist', 'secretary', 'financial', 'assistant'].includes(role)) {
        userRole = role;
      }

      const defaultPerms = JSON.stringify([
        'view_schedule', 'create_appointment', 'create_patient'
      ]);

      // Insere na tabela users como PENDENTE de aprovação pelo gestor
      const insertStmt = db.prepare(`
        INSERT INTO users (
          id, tenant_id, name, email, password_hash, role, phone, status,
          profession_name, practice_areas, registration_type, registration_number
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
      `);
      insertStmt.run(
        userId, tenantId, name, cleanEmail, hashedPassword, userRole, phone || null,
        professionName || null, practiceAreas || null, registrationType || null, registrationNumber || null
      );

      // Insere na tabela clinic_users com a profissão estruturada e áreas de atuação livres
      db.prepare(`
        INSERT INTO clinic_users (
          id, tenant_id, user_id, role, status, is_manager, permissions_json,
          profession_custom, practice_areas, created_at
        )
        VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, datetime('now'))
      `).run(
        'cu-' + uuidv4().slice(0, 8),
        tenantId,
        userId,
        userRole,
        userRole === 'clinic_admin' ? 1 : 0,
        defaultPerms,
        professionName || null,
        practiceAreas || null
      );

      // Se for profissional ou gestor com área de saúde informada, registra na tabela professionals com active = 0 (aguardando aprovação ou ativação)
      if (userRole === 'professional' || (userRole === 'clinic_admin' && professionName && professionName !== 'Gestor / Administrador')) {
        const profId = 'pro-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO professionals (
            id, tenant_id, user_id, name, registration_type, registration_number,
            practice_areas, bio, active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).run(
          profId,
          tenantId,
          userId,
          name,
          registrationType || 'Registro',
          registrationNumber || null,
          practiceAreas || null,
          practiceAreas || null
        );
      }

      logAudit(req, 'REQUEST_CLINIC_ACCESS', 'users', userId, {
        tenantId,
        clinicName: tenant.name,
        name,
        email: cleanEmail,
        professionName,
        practiceAreas
      });

      res.status(201).json({
        message: `Solicitação de acesso enviada com sucesso para a clínica "${tenant.name}"! Sua conta foi criada e está com status "Aguardando aprovação". O gestor da clínica analisará seus dados para liberar seu acesso.`,
        status: 'pending',
        userId
      });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[AuthController.register] Erro:', err);
      res.status(500).json({ error: 'Erro ao cadastrar usuário' });
    }
  }

  // Atualiza a própria senha do usuário autenticado
  static async updateProfilePassword(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user || !req.user.userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const { currentPassword, newPassword } = req.body;
      if (!newPassword || newPassword.trim().length < 6) {
        res.status(400).json({ error: 'A nova senha deve possuir pelo menos 6 caracteres' });
        return;
      }

      const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.user.userId) as any;
      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      // Se forneceu senha atual, valida
      if (currentPassword) {
        const valid = await comparePassword(currentPassword, user.password_hash);
        if (!valid) {
          res.status(400).json({ error: 'Senha atual incorreta' });
          return;
        }
      }

      const hashedPassword = await hashPassword(newPassword.trim());
      // Invalida sessões (tokens JWT) emitidas antes da troca, apenas para este usuário.
      db.prepare("UPDATE users SET password_hash = ?, session_version = session_version + 1, updated_at = datetime('now') WHERE id = ?").run(hashedPassword, user.id);

      logAudit(req, 'UPDATE_OWN_PASSWORD', 'users', user.id);

      // Emite um novo token (já com a session_version atualizada) para que a sessão atual,
      // que acabou de trocar a própria senha, continue funcionando sem precisar logar de novo.
      const freshToken = generateToken({
        userId: req.user.userId,
        tenantId: req.user.tenantId,
        role: req.user.role,
        email: req.user.email,
        name: req.user.name
      });

      res.json({ message: 'Sua senha foi alterada com sucesso!', token: freshToken });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[AuthController.updateProfilePassword] Erro:', err);
      res.status(500).json({ error: 'Erro ao alterar senha' });
    }
  }

  // Atualiza o próprio e-mail do usuário autenticado
  static async updateProfileEmail(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user || !req.user.userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const { email } = req.body;
      if (!email || !email.trim()) {
        res.status(400).json({ error: 'O novo endereço de e-mail é obrigatório' });
        return;
      }

      const cleanEmail = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        res.status(400).json({ error: 'Formato de e-mail inválido' });
        return;
      }

      const user = db.prepare('SELECT id, email, tenant_id, role FROM users WHERE id = ?').get(req.user.userId) as any;
      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      if (user.email === cleanEmail) {
        res.json({ message: 'O e-mail informado já é o e-mail atual da sua conta', email: cleanEmail });
        return;
      }

      // Verifica se o e-mail já pertence a outro usuário
      const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(cleanEmail, user.id) as any;
      if (existing) {
        res.status(409).json({ error: 'Este e-mail já está em uso por outra conta no sistema' });
        return;
      }

      // Atualiza usuário mantendo mesmo id, tenant_id, role, status e permissões
      db.prepare("UPDATE users SET email = ?, updated_at = datetime('now') WHERE id = ?").run(cleanEmail, user.id);

      // Se for o gestor responsável da clínica, sincroniza tenants.responsible_email
      if (user.tenant_id) {
        db.prepare(`
          UPDATE tenants SET responsible_email = ?, updated_at = datetime('now')
          WHERE id = ? AND responsible_email = ?
        `).run(cleanEmail, user.tenant_id, user.email);
      }

      logAudit(req, 'UPDATE_OWN_EMAIL', 'users', user.id, { oldEmail: user.email, newEmail: cleanEmail });
      res.json({
        message: 'Seu e-mail foi atualizado com sucesso!',
        email: cleanEmail
      });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[AuthController.updateProfileEmail] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar e-mail' });
    }
  }

  // =========================================================================
  // VALIDAÇÃO E CADASTRO POR CONVITE ÚNICO (Itens 14 a 23)
  // =========================================================================

  /**
   * Valida publicamente o token do convite.
   * Verifica existência, data de expiração, status e contagem de usos.
   */
  static async validateInvite(req: Request, res: Response): Promise<void> {
    try {
      const tokenParam = req.params.token;
      const tokenStr = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;
      if (!tokenStr || !tokenStr.trim()) {
        res.status(400).json({ valid: false, error: 'Token de convite não informado' });
        return;
      }

      const cleanToken = tokenStr.trim();

      // Busca o convite no banco
      const invite = db.prepare(`
        SELECT 
          ci.id, ci.tenant_id, ci.token, ci.role, ci.expires_at, ci.status,
          ci.max_uses, ci.used_count, ci.created_at,
          t.name as clinic_name, t.slug as clinic_slug, t.logo_url as clinic_logo_url,
          t.status as clinic_status, t.registrations_blocked
        FROM clinic_invites ci
        JOIN tenants t ON t.id = ci.tenant_id
        WHERE ci.token = ?
      `).get(cleanToken) as any;

      if (!invite) {
        res.status(404).json({
          valid: false,
          code: 'INVITE_NOT_FOUND',
          error: 'Convite não encontrado ou inválido.'
        });
        return;
      }

      // Verifica banimento da clínica
      if (invite.clinic_status === 'banned') {
        res.status(403).json({
          valid: false,
          code: 'CLINIC_BANNED',
          error: 'A clínica associada a este convite foi banida pelo Administrador do Sistema.'
        });
        return;
      }

      // Verifica bloqueio de novos cadastros
      if (invite.registrations_blocked === 1) {
        res.status(403).json({
          valid: false,
          code: 'REGISTRATIONS_BLOCKED',
          error: 'Novos cadastros estão temporariamente bloqueados para esta clínica pelo Administrador do Sistema.'
        });
        return;
      }

      // Verifica status da clínica
      if (invite.clinic_status !== 'active') {
        res.status(400).json({
          valid: false,
          code: 'CLINIC_INACTIVE',
          error: 'A clínica associada a este convite está inativa ou suspensa.'
        });
        return;
      }

      // Verifica cancelamento
      if (invite.status === 'cancelled') {
        res.status(410).json({
          valid: false,
          code: 'INVITE_CANCELLED',
          error: 'Este convite foi cancelado pela clínica.'
        });
        return;
      }

      // Verifica uso prévio
      if (invite.status === 'used' || (invite.used_count >= invite.max_uses)) {
        res.status(410).json({
          valid: false,
          code: 'INVITE_ALREADY_USED',
          error: 'Este convite já foi utilizado.'
        });
        return;
      }

      // Verifica expiração
      const now = new Date();
      const expiresAt = new Date(invite.expires_at.replace(' ', 'T') + 'Z');
      if (invite.status === 'expired' || now > expiresAt) {
        // Atualiza status no banco caso ainda constasse pending
        if (invite.status === 'pending') {
          db.prepare("UPDATE clinic_invites SET status = 'expired', updated_at = datetime('now') WHERE id = ?").run(invite.id);
        }
        res.status(410).json({
          valid: false,
          code: 'INVITE_EXPIRED',
          error: 'Este convite expirou. Solicite um novo convite à clínica.'
        });
        return;
      }

      res.json({
        valid: true,
        tenant: {
          id: invite.tenant_id,
          name: invite.clinic_name,
          slug: invite.clinic_slug,
          logoUrl: invite.clinic_logo_url
        },
        role: invite.role,
        expiresAt: invite.expires_at
      });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[AuthController.validateInvite] Erro:', err);
      res.status(500).json({ valid: false, error: 'Erro ao validar convite' });
    }
  }

  /**
   * Conclui o cadastro do colaborador através do link único do convite.
   * Cria o usuário vinculado à clínica do convite e invalida o convite.
   */
  static async registerWithInvite(req: Request, res: Response): Promise<void> {
    try {
      const {
        token,
        emailVerificationToken,
        name,
        email,
        password,
        phone,
        prefix,
        professionId,
        professionName,
        practiceAreas,
        practiceAreaIds,
        registrationType,
        registrationNumber
      } = req.body;

      if (!token || !token.trim()) {
        res.status(400).json({ error: 'Token de convite obrigatório' });
        return;
      }

      if (!name || !email || !password) {
        res.status(400).json({ error: 'Nome completo, e-mail e senha são obrigatórios' });
        return;
      }

      if (password.trim().length < 6) {
        res.status(400).json({ error: 'A senha deve possuir pelo menos 6 caracteres' });
        return;
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanToken = token.trim();

      // Validação obrigatória do token de confirmação de e-mail (código de 6 dígitos)
      if (!emailVerificationToken) {
        res.status(400).json({ error: 'É obrigatório validar o e-mail com o código de 6 dígitos antes de concluir o cadastro' });
        return;
      }

      const tokenValidation = EmailService.verifyVerificationToken(
        emailVerificationToken,
        cleanEmail,
        'invite_registration'
      );

      if (!tokenValidation.valid) {
        res.status(400).json({
          code: 'EMAIL_VERIFICATION_EXPIRED',
          error: tokenValidation.error || 'Token de verificação de e-mail inválido ou expirado'
        });
        return;
      }

      // Transação atômica para validar o convite e registrar o usuário
      const transaction = db.transaction(() => {
        const invite = db.prepare(`
          SELECT 
            ci.id, ci.tenant_id, ci.token, ci.role, ci.expires_at, ci.status,
            ci.max_uses, ci.used_count, t.name as clinic_name, t.status as clinic_status,
            t.registrations_blocked
          FROM clinic_invites ci
          JOIN tenants t ON t.id = ci.tenant_id
          WHERE ci.token = ?
        `).get(cleanToken) as any;

        if (!invite) {
          throw new Error('INVITE_NOT_FOUND: Convite não encontrado ou inválido.');
        }

        if (invite.clinic_status === 'banned') {
          throw new Error('CLINIC_BANNED: A clínica associada a este convite foi banida pelo Administrador do Sistema.');
        }

        if (invite.registrations_blocked === 1) {
          throw new Error('REGISTRATIONS_BLOCKED: Novos cadastros estão temporariamente bloqueados para esta clínica pelo Administrador do Sistema.');
        }

        if (invite.clinic_status !== 'active') {
          throw new Error('CLINIC_INACTIVE: A clínica associada a este convite não está ativa.');
        }

        if (invite.status === 'cancelled') {
          throw new Error('INVITE_CANCELLED: Este convite foi cancelado pela clínica.');
        }

        if (invite.status === 'used' || invite.used_count >= invite.max_uses) {
          throw new Error('INVITE_ALREADY_USED: Este convite já foi utilizado.');
        }

        // Verifica expiração
        const now = new Date();
        const expiresAt = new Date(invite.expires_at.replace(' ', 'T') + 'Z');
        if (invite.status === 'expired' || now > expiresAt) {
          db.prepare("UPDATE clinic_invites SET status = 'expired', updated_at = datetime('now') WHERE id = ?").run(invite.id);
          throw new Error('INVITE_EXPIRED: Este convite expirou. Solicite um novo convite à clínica.');
        }

        // Verifica se o e-mail já existe
        const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
        if (existingUser) {
          throw new Error('EMAIL_EXISTS: Este e-mail já está cadastrado na plataforma.');
        }

        return invite;
      });

      let inviteData: any;
      try {
        inviteData = transaction();
      } catch (txErr: any) {
        const msg = txErr.message || '';
        if (msg.startsWith('CLINIC_BANNED:')) {
          res.status(403).json({ error: 'A clínica associada a este convite foi banida pelo Administrador do Sistema.' });
          return;
        }
        if (msg.startsWith('REGISTRATIONS_BLOCKED:')) {
          res.status(403).json({ error: 'Novos cadastros estão temporariamente bloqueados para esta clínica pelo Administrador do Sistema.' });
          return;
        }
        if (msg.startsWith('INVITE_EXPIRED:')) {
          res.status(410).json({ error: 'Este convite expirou. Solicite um novo convite à clínica.' });
          return;
        }
        if (msg.startsWith('INVITE_ALREADY_USED:')) {
          res.status(410).json({ error: 'Este convite já foi utilizado.' });
          return;
        }
        if (msg.startsWith('INVITE_CANCELLED:')) {
          res.status(410).json({ error: 'Este convite foi cancelado pela clínica.' });
          return;
        }
        if (msg.startsWith('INVITE_NOT_FOUND:')) {
          res.status(404).json({ error: 'Convite não encontrado ou inválido.' });
          return;
        }
        if (msg.startsWith('EMAIL_EXISTS:')) {
          res.status(409).json({ error: 'Este e-mail já está cadastrado na plataforma' });
          return;
        }
        res.status(400).json({ error: msg || 'Erro ao validar convite' });
        return;
      }

      const tenantId = inviteData.tenant_id;
      const hashedPassword = await hashPassword(password);
      const userId = 'usr-' + uuidv4().slice(0, 8);

      // Mapeamento de cargo
      let userRole = inviteData.role || 'professional';
      if (userRole === 'superadmin') {
        res.status(403).json({ error: 'Convites de clínica não podem conceder administração global.' }); return;
      }
      const profLower = (professionName || '').toLowerCase();
      if (profLower.includes('médic') || profLower.includes('psic') || profLower.includes('fono') ||
          profLower.includes('fisio') || profLower.includes('terap') || profLower.includes('nutri') ||
          profLower.includes('dent') || profLower.includes('enferm') || profLower.includes('biomed') ||
          profLower.includes('farmac') || profLower.includes('saúde')) {
        userRole = 'professional';
      } else if (['receptionist', 'secretary', 'financial', 'assistant'].includes(userRole)) {
        // mantém role
      }

      // Permissões padrão
      const defaultPerms = JSON.stringify([
        'view_schedule', 'create_appointment', 'create_patient'
      ]);

      // Monta nome com prefixo de sexo / tratamento se informado (Dr., Dra., etc.)
      let finalName = name.trim();
      if (prefix && !finalName.startsWith('Dr.') && !finalName.startsWith('Dra.')) {
        if (prefix === 'Dra.') finalName = `Dra. ${finalName}`;
        else if (prefix === 'Dr.') finalName = `Dr. ${finalName}`;
      }

      // Resolução Canônica de Profissão e Módulo
      const professionResolution = resolveCanonicalProfession({
        id: professionId,
        name: professionName,
        registrationType: registrationType
      });
      const canonicalProfessionId = professionResolution.canonicalId;
      const canonicalProfessionName = professionResolution.canonicalName;
      const modFlags = professionResolution.flags;

      // Monta string de áreas para campos legados de texto e lista de IDs para user_practice_areas
      let areasStr: string | null = null;
      let targetAreaIds: string[] = [];
      if (Array.isArray(practiceAreaIds) && practiceAreaIds.length > 0) {
        targetAreaIds = practiceAreaIds.map(String).map(s => s.trim()).filter(Boolean);
      }
      if (typeof practiceAreas === 'string' && practiceAreas.trim()) {
        areasStr = practiceAreas.trim();
        if (targetAreaIds.length === 0) {
          const names = areasStr.split(',').map(s => s.trim()).filter(Boolean);
          for (const nm of names) {
            const row = db.prepare('SELECT id FROM practice_areas WHERE name = ? OR slug = ? COLLATE NOCASE').get(nm, nm) as any;
            if (row?.id && !targetAreaIds.includes(row.id)) targetAreaIds.push(row.id);
          }
        }
      } else if (targetAreaIds.length > 0) {
        const ph = targetAreaIds.map(() => '?').join(',');
        const rows = db.prepare(`SELECT name FROM practice_areas WHERE id IN (${ph})`).all(...targetAreaIds) as any[];
        areasStr = rows.map(r => r.name).join(', ');
      }

      if (professionResolution.inferredAreaId && !targetAreaIds.includes(professionResolution.inferredAreaId)) {
        targetAreaIds.push(professionResolution.inferredAreaId);
      }
      if (professionResolution.automaticPracticeAreaId && !targetAreaIds.includes(professionResolution.automaticPracticeAreaId)) {
        targetAreaIds.push(professionResolution.automaticPracticeAreaId);
      }

      let createdProfessionalId: string | null = null;

      // Executa inserções e consome o convite em transação
      const completeRegister = db.transaction(() => {
        requireOpenRegistration(tenantId); requireCapacity(tenantId);
        const currentInvite = db.prepare('SELECT status, used_count, max_uses, expires_at FROM clinic_invites WHERE token = ?').get(token);
        if (!currentInvite || currentInvite.status !== 'pending' || currentInvite.used_count >= currentInvite.max_uses || new Date(currentInvite.expires_at) < new Date()) throw new Error('Convite indisponível.');

        // 1. users (ativo, já aprovado via convite oficial da clínica)
        db.prepare(`
          INSERT INTO users (
            id, tenant_id, name, email, password_hash, role, phone, status,
            profession_id, profession_name, practice_areas, registration_type, registration_number,
            zemda_fisio_enabled, zemda_odonto_enabled, zemda_nutri_enabled, zemda_to_enabled,
            zemda_fono_enabled, zemda_pp_enabled, zemda_psico_enabled, zemda_personal_enabled,
            zemda_med_enabled
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          userId, tenantId, finalName, cleanEmail, hashedPassword, userRole, phone || null,
          canonicalProfessionId, canonicalProfessionName, areasStr || null,
          registrationType || professionResolution.boardLabel || null,
          registrationNumber || null,
          modFlags.zemda_fisio_enabled,
          modFlags.zemda_odonto_enabled,
          modFlags.zemda_nutri_enabled,
          modFlags.zemda_to_enabled,
          modFlags.zemda_fono_enabled,
          modFlags.zemda_pp_enabled,
          modFlags.zemda_psico_enabled,
          modFlags.zemda_personal_enabled,
          modFlags.zemda_med_enabled || 0
        );

        // 2. clinic_users
        db.prepare(`
          INSERT INTO clinic_users (
            id, tenant_id, user_id, role, status, is_manager, permissions_json,
            profession_id, profession_name, profession_custom, practice_areas,
            zemda_fisio_enabled, zemda_odonto_enabled, zemda_nutri_enabled, zemda_to_enabled,
            zemda_fono_enabled, zemda_pp_enabled, zemda_psico_enabled, zemda_personal_enabled,
            zemda_med_enabled,
            approved_at, approved_by, created_at
          ) VALUES (?, ?, ?, ?, 'active', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'))
        `).run(
          'cu-' + uuidv4().slice(0, 8),
          tenantId,
          userId,
          userRole,
          defaultPerms,
          canonicalProfessionId,
          canonicalProfessionName,
          canonicalProfessionName,
          areasStr || null,
          modFlags.zemda_fisio_enabled,
          modFlags.zemda_odonto_enabled,
          modFlags.zemda_nutri_enabled,
          modFlags.zemda_to_enabled,
          modFlags.zemda_fono_enabled,
          modFlags.zemda_pp_enabled,
          modFlags.zemda_psico_enabled,
          modFlags.zemda_personal_enabled,
          modFlags.zemda_med_enabled || 0,
          inviteData.created_by || 'invite'
        );

        // 3. professionals (se for professional ou tiver área de saúde ou profissão selecionada)
        if (userRole === 'professional' || professionName || professionId) {
          const profId = 'pro-' + uuidv4().slice(0, 8);
          createdProfessionalId = profId;
          const baseSlug = finalName
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
          const finalSlug = `${baseSlug}-${profId.slice(-4)}`;

          db.prepare(`
            INSERT INTO professionals (
              id, tenant_id, user_id, name, registration_type, registration_number,
              practice_areas, bio, slug, active,
              profession_id, profession_name,
              zemda_fisio_enabled, zemda_odonto_enabled, zemda_nutri_enabled, zemda_to_enabled,
              zemda_fono_enabled, zemda_pp_enabled, zemda_psico_enabled, zemda_personal_enabled,
              zemda_med_enabled
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            profId,
            tenantId,
            userId,
            finalName,
            registrationType || professionResolution.boardLabel || 'Registro',
            registrationNumber || null,
            areasStr || null,
            areasStr || null,
            finalSlug,
            canonicalProfessionId,
            canonicalProfessionName,
            modFlags.zemda_fisio_enabled,
            modFlags.zemda_odonto_enabled,
            modFlags.zemda_nutri_enabled,
            modFlags.zemda_to_enabled,
            modFlags.zemda_fono_enabled,
            modFlags.zemda_pp_enabled,
            modFlags.zemda_psico_enabled,
            modFlags.zemda_personal_enabled,
            modFlags.zemda_med_enabled || 0
          );

          createDefaultSchedules(db, tenantId, profId);
        }

        // 4. Inserir áreas em user_practice_areas
        if (targetAreaIds.length > 0) {
          CapabilityService.setUserPracticeAreas(userId, tenantId, targetAreaIds);
        }

        // 5. Marca o convite como utilizado (uso único por padrão)
        const nextUsedCount = inviteData.used_count + 1;
        const newStatus = nextUsedCount >= inviteData.max_uses ? 'used' : 'pending';
        db.prepare(`
          UPDATE clinic_invites
          SET used_count = ?,
              status = ?,
              used_at = datetime('now'),
              used_by = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(nextUsedCount, newStatus, userId, inviteData.id);
      });

      completeRegister();

      // Consome o token de verificação de e-mail agora que o cadastro foi concluído com sucesso
      if (tokenValidation.payload?.verificationId) {
        EmailService.consumeVerificationToken(tokenValidation.payload.verificationId);
      }

      // Computa capabilities completas imediatamente no primeiro login
      const computedCaps = CapabilityService.computeUserCapabilities(userId, tenantId);

      // Gera token de autenticação
      const jwtToken = generateToken({
        userId,
        tenantId,
        role: userRole,
        email: cleanEmail,
        name: finalName
      });

      logAudit(req, 'REGISTER_WITH_INVITE', 'users', userId, {
        tenantId,
        clinicName: inviteData.clinic_name,
        inviteId: inviteData.id,
        role: userRole,
        email: cleanEmail
      });

      res.status(201).json({
        message: `Cadastro concluído com sucesso na clínica ${inviteData.clinic_name}!`,
        token: jwtToken,
        user: {
          id: userId,
          name: finalName,
          email: cleanEmail,
          role: userRole,
          status: 'active',
          tenantId,
          professionalId: createdProfessionalId,
          professionId: canonicalProfessionId,
          canonicalProfessionId,
          professionName: canonicalProfessionName,
          registrationType: registrationType || professionResolution.boardLabel || null,
          registrationNumber: registrationNumber || null,
          commercialModule: professionResolution.commercialModule,
          capabilities: computedCaps?.activeCapabilities || [],
          practiceAreaIds: computedCaps?.practiceAreaIds || [],
          selectedOptionalCapabilities: computedCaps?.selectedOptionalCapabilities || [],
          zemdaPersonalEnabled: modFlags.zemda_personal_enabled === 1,
          isPersonalTrainer: modFlags.zemda_personal_enabled === 1,
          zemdaFisioEnabled: modFlags.zemda_fisio_enabled === 1,
          zemdaOdontoEnabled: modFlags.zemda_odonto_enabled === 1,
          zemdaNutriEnabled: modFlags.zemda_nutri_enabled === 1,
          zemdaToEnabled: modFlags.zemda_to_enabled === 1,
          zemdaFonoEnabled: modFlags.zemda_fono_enabled === 1,
          zemdaPsicoEnabled: modFlags.zemda_psico_enabled === 1,
          zemdaPPEnabled: modFlags.zemda_pp_enabled === 1,
          zemdaMedEnabled: (modFlags.zemda_med_enabled || 0) === 1
        },
        clinic: {
          id: tenantId,
          name: inviteData.clinic_name
        }
      });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[AuthController.registerWithInvite] Erro:', err);
      res.status(500).json({ error: 'Erro ao concluir cadastro por convite' });
    }
  }

  /**
   * POST /v1/public/auth/reset-password
   * Body: { email: string, emailVerificationToken: string, newPassword: string }
   */
  static async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const email = (req.body.email || '').trim().toLowerCase();
      const token = (req.body.emailVerificationToken || '').trim();
      const newPassword = (req.body.newPassword || '').toString();

      if (!email || !token || !newPassword) {
        res.status(400).json({ error: 'E-mail, token de verificação e nova senha são obrigatórios.' });
        return;
      }

      if (newPassword.length < 6) {
        res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres.' });
        return;
      }

      // Validação criptográfica e temporal do token para o propósito 'password_reset'
      const tokenValidation = EmailService.verifyVerificationToken(token, email, 'password_reset');
      if (!tokenValidation.valid || !tokenValidation.payload) {
        res.status(400).json({ error: tokenValidation.error || 'Token de verificação inválido ou expirado.' });
        return;
      }

      // Localiza o usuário correspondente
      const user = db.prepare('SELECT id, email, status FROM users WHERE email = ?').get(email) as {
        id: string;
        email: string;
        status: string;
      } | undefined;

      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado no sistema.' });
        return;
      }

      // Consome atomicamente o token (garante uso único contra repetição)
      const consumed = EmailService.consumeVerificationToken(tokenValidation.payload.verificationId);
      if (!consumed) {
        res.status(400).json({ error: 'Esta solicitação de redefinição já foi utilizada ou expirou. Solicite um novo código.' });
        return;
      }

      // Atualiza a senha do usuário e invalida sessões (tokens JWT) anteriores, apenas deste usuário.
      const hashedPassword = await hashPassword(newPassword.trim());
      db.prepare("UPDATE users SET password_hash = ?, session_version = session_version + 1, updated_at = datetime('now') WHERE id = ?").run(hashedPassword, user.id);

      logAudit(req, 'RESET_PASSWORD_PUBLIC', 'users', user.id);

      res.status(200).json({
        success: true,
        message: 'Senha alterada com sucesso. Faça login com sua nova senha.'
      });
    } catch (err: any) {
      console.error('[AuthController.resetPassword] Erro:', err);
      res.status(500).json({ error: 'Erro interno ao redefinir a senha. Tente novamente mais tarde.' });
    }
  }
}
