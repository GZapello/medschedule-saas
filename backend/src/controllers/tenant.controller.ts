import { REGISTRATION_PROFESSION_ALIASES } from '../types/registration-professions';
import { respondBillingError } from './billing.controller';
import { requireCapacity, pendingBillingManager, BillingService, today, addDays, SOLO_TRIAL_DAYS } from '../services/billing.service';
import { Request, Response } from 'express';
import { db, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from '../config/database';
import { logAudit } from '../middlewares/audit.middleware';
import { hashPassword, comparePassword } from '../utils/password';
import { generateToken } from '../utils/jwt';
import { v4 as uuidv4 } from 'uuid';
import { globalAudit, purgeClinic, purgeTenantCompletely } from '../services/clinic-control.service';
import { ensureDefaultClinicService } from '../services/default-service.service';
import { EmailService } from '../services/email.service';
import { TrialNotificationService } from '../services/trial-notification.service';
import { CapabilityService } from '../services/capability.service';
import { MedicalTreeService } from '../services/medical-tree.service';
import { resolveProfessionModule, resolveCanonicalProfession } from '../utils/profession-module';
import { REGISTRATION_PROFESSIONS } from '../types/professions';



export class TenantController {
  // 0. Lista pública de clínicas ativas para seleção no cadastro de usuários ("Clínica que deseja integrar")
  static listPublic(req: Request, res: Response): void {
    try {
      const stmt = db.prepare(`
        SELECT id, name, trade_name, city, state, slug, logo_url, client_term_label
        FROM tenants
        WHERE status = 'active' AND COALESCE(registrations_blocked, 0) = 0
        ORDER BY name ASC
      `);
      const clinics = stmt.all();
      res.json(clinics);
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[TenantController.listPublic] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar clínicas disponíveis' });
    }
  }

  // 1. Cadastro Público de Nova Clínica ("Criar Minha Clínica" - status inicial 'pending')
  static async registerPublic(req: Request, res: Response): Promise<void> {
    try {
      const responsibleName = (req.body.responsibleName || req.body.adminName || req.body.name || '').trim();
      const email = (req.body.email || req.body.adminEmail || '').trim();
      const phone = req.body.phone;
      const password = req.body.password;
      const clinicName = (req.body.clinicName || (responsibleName ? `Consultório ${responsibleName}` : 'Meu Consultório')).trim();
      const tradeName = req.body.tradeName;
      const cnpjCpf = req.body.cnpjCpf;
      const city = req.body.city;
      const state = req.body.state;
      const termsAccepted = req.body.termsAccepted !== undefined ? req.body.termsAccepted : true;
      const privacyAccepted = req.body.privacyAccepted !== undefined ? req.body.privacyAccepted : true;
      const marketingAccepted = req.body.marketingAccepted;
      const marketingOptIn = req.body.marketingOptIn;

      const rawProfession = (req.body.profession || req.body.managerProfession || req.body.professionName || '').trim();
      const professionIdInput = (req.body.professionId || req.body.managerProfessionId || '').trim();

      let matchedCatalogProf = REGISTRATION_PROFESSIONS.find(p => p.id === professionIdInput);
      if (!matchedCatalogProf && professionIdInput && REGISTRATION_PROFESSION_ALIASES[professionIdInput]) {
        matchedCatalogProf = REGISTRATION_PROFESSIONS.find(p => p.id === REGISTRATION_PROFESSION_ALIASES[professionIdInput]);
      }
      if (!matchedCatalogProf) {
        matchedCatalogProf = REGISTRATION_PROFESSIONS.find(
          p => (p.id === 'prof-dentista' && (professionIdInput === 'prof-dentista' || rawProfession.toLowerCase() === 'dentista')) ||
               (p.id === 'prof-personal-trainer' && (professionIdInput === 'prof-personal-trainer' || rawProfession.toLowerCase() === 'personal trainer')) ||
               (p.id === 'prof-outro-saude' && (professionIdInput === 'other_health' || rawProfession.toLowerCase() === 'outra profissão da saúde')) ||
               p.label.toLowerCase() === rawProfession.toLowerCase()
        );
      }

      const resolvedProfId = matchedCatalogProf?.id || (professionIdInput ? professionIdInput : null);
      const resolvedProfName = rawProfession || matchedCatalogProf?.label || null;
      const resolvedProfSlug = matchedCatalogProf?.slug || (resolvedProfName ? resolvedProfName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-') : null);
      const resolvedBoardLabel = req.body.registrationType || req.body.managerRegistrationType || matchedCatalogProf?.boardLabel || 'Registro';
      const managerPracticeAreas = req.body.managerPracticeAreas || req.body.practiceAreas || null;
      const managerRegistrationNumber = req.body.managerRegistrationNumber || req.body.registrationNumber || null;
      const zemdaBodyEnabled = req.body.zemdaBodyEnabled;

      const professionResolution = resolveCanonicalProfession({
        id: resolvedProfId,
        name: resolvedProfName,
        slug: resolvedProfSlug,
        registrationType: resolvedBoardLabel
      });
      const activeModule = professionResolution.commercialModule;
      const modFlags = professionResolution.flags;

      if (req.body.practiceAreaIds && Array.isArray(req.body.practiceAreaIds) && req.body.practiceAreaIds.length > 0) {
        const areaValidation = CapabilityService.validatePracticeAreasForProfession(
          resolvedProfId || resolvedProfName,
          req.body.practiceAreaIds
        );
        if (!areaValidation.valid) {
          res.status(400).json({ error: areaValidation.error });
          return;
        }
      }

      if (!responsibleName || !email || !password) {
        res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
        return;
      }

      if (!termsAccepted || !privacyAccepted) {
        res.status(400).json({ error: 'É obrigatório aceitar os Termos de Uso e a Política de Privacidade' });
        return;
      }

      const cleanEmail = email.toLowerCase();

      // Validação obrigatória do token de verificação de e-mail por código de 6 dígitos
      const emailVerificationToken = req.body.emailVerificationToken;
      if (!emailVerificationToken) {
        res.status(400).json({ error: 'É obrigatório validar o e-mail com o código de 6 dígitos antes de concluir o cadastro' });
        return;
      }

      const tokenValidation = EmailService.verifyVerificationToken(
        emailVerificationToken,
        cleanEmail,
        'clinic_registration'
      );

      if (!tokenValidation.valid) {
        res.status(400).json({ code: 'EMAIL_VERIFICATION_EXPIRED', error: tokenValidation.error || 'Token de verificação de e-mail inválido ou expirado' });
        return;
      }

      // Gera slug único a partir do nome da clínica
      let baseSlug = clinicName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      if (!baseSlug) baseSlug = 'clinica';

      let slug = baseSlug;
      let counter = 1;
      while (db.prepare('SELECT id FROM tenants WHERE slug = ?').get(slug)) {
        slug = `${baseSlug}-${counter++}`;
      }

      const tenantId = 'ten-' + uuidv4().slice(0, 8);
      const userId = 'usr-' + uuidv4().slice(0, 8);
      const hashedPassword = await hashPassword(password);
      const identity = String(cnpjCpf || '').replace(/\D/g, '');
      const banned = db.prepare("SELECT slug, cnpj_cpf, email, responsible_email FROM tenants WHERE status = 'banned'").all();
      if (banned.some(t => t.slug === baseSlug || (identity && String(t.cnpj_cpf || '').replace(/\D/g, '') === identity) || t.email === cleanEmail || t.responsible_email === cleanEmail)) {
        res.status(403).json({ error: 'Esta clínica está banida. Somente o Administrador do Sistema pode liberar seu cadastro.' }); return;
      }

      // Validação de Teste Grátis Solo (7 dias)
      const startTrial = req.body.startTrial === true || req.body.startTrial === 'true';
      const planCode = req.body.planCode ? String(req.body.planCode).toUpperCase() : null;
      const selectedPlan = planCode ? BillingService.plans().find(p => p.code === planCode) : null;
      if (planCode && !selectedPlan) {
        res.status(400).json({ error: 'Selecione um plano válido.' }); return;
      }

      if (startTrial) {
        if (planCode && planCode !== 'SOLO') {
          res.status(400).json({ error: 'O teste grátis de 7 dias é exclusivo para o plano Zemda Solo.' });
          return;
        }

        const usedEmail = db.prepare('SELECT id FROM trial_history WHERE email = ?').get(cleanEmail);
        if (usedEmail) {
          res.status(400).json({ error: 'O teste grátis já foi utilizado para este e-mail. Escolha um plano para assinar.' });
          return;
        }
        if (identity && identity.length >= 11) {
          const usedDoc = db.prepare('SELECT id FROM trial_history WHERE cnpj_cpf = ?').get(identity);
          if (usedDoc) {
            res.status(400).json({ error: 'O teste grátis já foi utilizado para este CPF/CNPJ. Escolha um plano para assinar.' });
            return;
          }
        }
      }

      const now = new Date();
      const trialStartedAt = now.toISOString();
      const trialEndsAt = new Date(now.getTime() + SOLO_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const trialStartDay = today();
      const trialEndDay = addDays(trialStartDay, SOLO_TRIAL_DAYS);
      const soloPlan = startTrial ? db.prepare("SELECT id, code, name FROM plans WHERE code = 'SOLO' AND active = 1").get() as any : null;
      if (startTrial && !soloPlan) {
        res.status(400).json({ error: 'O plano Solo não está disponível para cadastro.' }); return;
      }
      const subId = 'sub-' + uuidv4().slice(0, 8);

      // Preparação dos dados auxiliares antes da transação (obtém IP seguro via req.ip/trust proxy)
      const ipAddress = (req.ip || req.socket?.remoteAddress || null)?.replace(/^::ffff:/, '') || null;
      const userAgent = (req.headers['user-agent'] as string) || null;
      const optInMarketing = (marketingAccepted || marketingOptIn) ? 1 : 0;
      const initialPermissions = JSON.stringify([]);
      const verificationId = tokenValidation.payload?.verificationId;

      let createdProfId: string | null = null;
      // Execução transacional atômica única: se qualquer etapa falhar, executa rollback integral
      const executeRegistrationTransaction = db.transaction(() => {
        // 1. Consumo atômico da verificação de e-mail (exige rigorosamente changes === 1)
        if (!verificationId) {
          throw new Error('VERIFICATION_ID_MISSING');
        }

        const consumeRes = db.prepare(`
          UPDATE email_verifications
          SET status = 'consumed', consumed_at = datetime('now')
          WHERE id = ? AND status = 'verified' AND consumed_at IS NULL
        `).run(verificationId);

        if (consumeRes.changes !== 1) {
          throw new Error('VERIFICATION_ALREADY_CONSUMED_OR_INVALID');
        }

        // 2. Verificação de unicidade do e-mail dentro da transação para isolamento perfeito
        const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
        if (existingUser) {
          throw new Error('EMAIL_ALREADY_EXISTS');
        }

        const initialTenantStatus = startTrial ? 'active' : 'pending';
        const initialUserStatus = startTrial ? 'active' : 'pending';

        // 3. Insere o tenant com status PENDENTE ou ACTIVE (se trial) e registro dos termos aceitos
        db.prepare(`
          INSERT INTO tenants (
            id, slug, name, corporate_name, trade_name, cnpj_cpf, email, phone,
            city, state, responsible_name, responsible_email, responsible_phone,
            manager_profession, manager_practice_areas,
            status, onboarding_completed, onboarding_step, manager_confirmed,
            terms_accepted, terms_accepted_at, privacy_accepted, privacy_accepted_at,
            terms_version, privacy_version, plan_id, trial_used, billing_required,
            created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?,
            ?, 1, 5, 1,
            1, datetime('now'), 1, datetime('now'),
            ?, ?, ?, ?, 1,
            datetime('now'), datetime('now')
          )
        `).run(
          tenantId,
          slug,
          clinicName,
          clinicName,
          tradeName || clinicName,
          cnpjCpf || null,
          cleanEmail,
          phone || null,
          city || null,
          state || null,
          responsibleName,
          cleanEmail,
          phone || null,
          resolvedProfName || null,
          managerPracticeAreas || null,
          initialTenantStatus,
          CURRENT_TERMS_VERSION,
          CURRENT_PRIVACY_VERSION,
          startTrial ? soloPlan?.id : selectedPlan?.id || null,
          startTrial ? 1 : 0
        );

        // 4. Insere o usuário gestor com role 'clinic_admin' e termos aceitos
        db.prepare(`
          INSERT INTO users (
            id, tenant_id, name, email, password_hash, role, phone, status,
            profession_id, profession_name, practice_areas, registration_type, registration_number,
            terms_version_accepted, privacy_version_accepted, terms_accepted_at, privacy_accepted_at,
            zemda_fisio_enabled, zemda_odonto_enabled, zemda_nutri_enabled, zemda_to_enabled,
            zemda_fono_enabled, zemda_pp_enabled, zemda_psico_enabled, zemda_personal_enabled, zemda_med_enabled,
            created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?, 'clinic_admin', ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, datetime('now'), datetime('now'),
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            datetime('now'), datetime('now')
          )
        `).run(
          userId, tenantId, responsibleName, cleanEmail, hashedPassword, phone || null, initialUserStatus,
          resolvedProfId, resolvedProfName, managerPracticeAreas || null, resolvedBoardLabel, managerRegistrationNumber || null,
          CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION,
          modFlags.zemda_fisio_enabled, modFlags.zemda_odonto_enabled, modFlags.zemda_nutri_enabled, modFlags.zemda_to_enabled,
          modFlags.zemda_fono_enabled, modFlags.zemda_pp_enabled, modFlags.zemda_psico_enabled, modFlags.zemda_personal_enabled, modFlags.zemda_med_enabled
        );

        // 5. Salva a prova documental do aceite legal na tabela legal_acceptances
        db.prepare(`
          INSERT INTO legal_acceptances (
            id, user_id, clinic_id, terms_version, privacy_version, marketing_opt_in, accepted_at, ip_address, user_agent, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, datetime('now'))
        `).run(
          'la-' + uuidv4().slice(0, 8),
          userId,
          tenantId,
          CURRENT_TERMS_VERSION,
          CURRENT_PRIVACY_VERSION,
          optInMarketing,
          ipAddress,
          userAgent
        );

        // 6. Associa em clinic_users com a profissão e área clínica do gestor
        db.prepare(`
          INSERT INTO clinic_users (
            id, tenant_id, user_id, role, status, is_manager,
            profession_id, profession_name, profession_custom, practice_areas, permissions_json,
            zemda_body_enabled, zemda_fisio_enabled, zemda_odonto_enabled, zemda_nutri_enabled, zemda_to_enabled,
            zemda_fono_enabled, zemda_pp_enabled, zemda_psico_enabled, zemda_personal_enabled, zemda_med_enabled, created_at
          ) VALUES (
            ?, ?, ?, 'clinic_admin', ?, 1,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, datetime('now')
          )
        `).run(
          'cu-' + uuidv4().slice(0, 8),
          tenantId,
          userId,
          initialUserStatus,
          resolvedProfId,
          resolvedProfName,
          resolvedProfName,
          managerPracticeAreas || null,
          initialPermissions,
          1,
          modFlags.zemda_fisio_enabled, modFlags.zemda_odonto_enabled, modFlags.zemda_nutri_enabled, modFlags.zemda_to_enabled,
          modFlags.zemda_fono_enabled, modFlags.zemda_pp_enabled, modFlags.zemda_psico_enabled, modFlags.zemda_personal_enabled, modFlags.zemda_med_enabled
        );

        // 7. Se o gestor também for profissional de saúde clínico, cria o registro em professionals
        if (resolvedProfName && resolvedProfName !== 'Gestor / Administrador' && !matchedCatalogProf?.administrative) {
          createdProfId = 'pro-' + uuidv4().slice(0, 8);
          db.prepare(`
            INSERT INTO professionals (
              id, tenant_id, user_id, name, profession_id, profession_name,
              registration_type, registration_number, practice_areas, bio, active,
              zemda_fisio_enabled, zemda_odonto_enabled, zemda_nutri_enabled, zemda_to_enabled,
              zemda_fono_enabled, zemda_pp_enabled, zemda_psico_enabled, zemda_personal_enabled, zemda_med_enabled
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            createdProfId,
            tenantId,
            userId,
            responsibleName,
            resolvedProfId,
            resolvedProfName,
            resolvedBoardLabel,
            managerRegistrationNumber || null,
            managerPracticeAreas || null,
            managerPracticeAreas || null,
            modFlags.zemda_fisio_enabled,
            modFlags.zemda_odonto_enabled,
            modFlags.zemda_nutri_enabled,
            modFlags.zemda_to_enabled,
            modFlags.zemda_fono_enabled,
            modFlags.zemda_pp_enabled,
            modFlags.zemda_psico_enabled,
            modFlags.zemda_personal_enabled,
            modFlags.zemda_med_enabled
          );
        }

        // 8. Marca cobrança obrigatória
        db.prepare('UPDATE tenants SET billing_required=1 WHERE id=?').run(tenantId);

        // 9. Criação automática e idempotente do serviço inicial padrão em modo estrito (falhas geram rollback)
        ensureDefaultClinicService(tenantId, true);

        // 10. Se for Teste Grátis Solo, cria a assinatura TRIAL e o registro em trial_history
        if (startTrial && soloPlan) {
          db.prepare(`
            INSERT INTO subscriptions (
              id, tenant_id, clinic_id, plan_id, status, current_period_start, current_period_end,
              managed, is_current, trial_started_at, trial_ends_at, updated_at
            ) VALUES (?, ?, ?, ?, 'TRIAL', ?, ?, 1, 1, ?, ?, datetime('now'))
          `).run(subId, tenantId, tenantId, soloPlan.id, trialStartDay, trialEndDay, trialStartedAt, trialEndsAt);

          db.prepare(`
            INSERT INTO trial_history (
              id, tenant_id, user_id, subscription_id, email, cnpj_cpf, started_at, ends_at, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
          `).run('th-' + uuidv4().slice(0, 8), tenantId, userId, subId, cleanEmail, identity || null, trialStartedAt, trialEndsAt);

          db.prepare(`
            INSERT INTO subscription_audit (id, clinic_id, subscription_id, user_id, action, previous_status, next_status, details_json)
            VALUES (?, ?, ?, ?, 'TRIAL_STARTED', NULL, 'TRIAL', ?)
          `).run(uuidv4(), tenantId, subId, userId, JSON.stringify({ planCode: 'SOLO', trialStartedAt, trialEndsAt }));
        }
      });

      try {
        executeRegistrationTransaction();
      } catch (txErr: any) {
        if (txErr.message === 'VERIFICATION_ALREADY_CONSUMED_OR_INVALID') {
          res.status(400).json({ error: 'Esta verificação de e-mail já foi utilizada ou não é mais válida. Solicite um novo código.' });
          return;
        }
        if (txErr.message === 'EMAIL_ALREADY_EXISTS') {
          res.status(409).json({ error: 'Este e-mail já está cadastrado na plataforma' });
          return;
        }
        throw txErr;
      }

      let rawPracticeAreas: string[] = [];
      if (req.body.practiceAreaIds && Array.isArray(req.body.practiceAreaIds)) {
        rawPracticeAreas = req.body.practiceAreaIds.filter(Boolean);
      }

      // Separa áreas médicas de áreas de atuação gerais
      const medSpecsFromAreas = rawPracticeAreas.filter(a => typeof a === 'string' && a.startsWith('med-spec-'));
      const medPasFromAreas = rawPracticeAreas.filter(a => typeof a === 'string' && a.startsWith('med-pa-'));
      let generalPracticeAreas = rawPracticeAreas.filter(a => typeof a === 'string' && !a.startsWith('med-spec-') && !a.startsWith('med-pa-'));

      if (generalPracticeAreas.length === 0 && (professionResolution.automaticPracticeAreaId || professionResolution.inferredAreaId)) {
        const autoId = professionResolution.automaticPracticeAreaId || professionResolution.inferredAreaId;
        if (autoId && !autoId.startsWith('med-spec-') && !autoId.startsWith('med-pa-')) {
          generalPracticeAreas = [autoId];
        }
      }

      if (generalPracticeAreas.length > 0) {
        try {
          CapabilityService.setUserPracticeAreas(userId, tenantId, generalPracticeAreas);
        } catch (capErr) {
          console.warn('[TenantController.registerPublic] Aviso ao gravar áreas de atuação gerais:', capErr);
        }
      }

      // Persistência da Árvore Clínica de Medicina (ZemdaMed)
      if (professionResolution.canonicalId === 'prof-medico' || professionResolution.commercialModule === 'ZemdaMed') {
        try {
          let medSpecs: string[] = [];
          if (req.body.medicalSpecialtyIds && Array.isArray(req.body.medicalSpecialtyIds)) {
            medSpecs = req.body.medicalSpecialtyIds.filter(Boolean);
          }
          if (professionResolution.isSpecificAlias && professionResolution.medicalSpecialtyId) {
            if (!medSpecs.includes(professionResolution.medicalSpecialtyId)) {
              medSpecs.push(professionResolution.medicalSpecialtyId);
            }
          }
          // Se nenhuma especialidade médica foi explicitada, verifica se veio nas áreas ou usa padrão
          if (medSpecs.length === 0) {
            const specFromAreas = medSpecsFromAreas[0];
            medSpecs = [specFromAreas || 'med-spec-clinica'];
          }

          let medPas: string[] = [];
          if (req.body.medicalPracticeAreaIds && Array.isArray(req.body.medicalPracticeAreaIds)) {
            medPas = req.body.medicalPracticeAreaIds.filter(Boolean);
          }
          for (const pa of medPasFromAreas) {
            if (!medPas.includes(pa)) medPas.push(pa);
          }

          MedicalTreeService.setUserMedicalHierarchy(userId, tenantId, medSpecs, medPas);
        } catch (medErr) {
          console.warn('[TenantController.registerPublic] Aviso ao gravar hierarquia médica:', medErr);
        }
      }

      if (startTrial) {
        void TrialNotificationService.notifyTrialStarted(tenantId, cleanEmail, responsibleName, trialEndsAt);
      }

      logAudit(req, 'REGISTER_CLINIC_REQUEST', 'tenants', tenantId, {
        clinicName,
        responsibleName,
        email: cleanEmail,
        termsVersion: CURRENT_TERMS_VERSION,
        privacyVersion: CURRENT_PRIVACY_VERSION
      });

      // Criação automática de sessão autenticada segura
      const token = generateToken({
        userId,
        tenantId,
        role: 'clinic_admin',
        email: cleanEmail,
        name: responsibleName
      });

      const tenantData = db.prepare(`
        SELECT 
          id, slug, name, corporate_name, trade_name, email, phone, logo_url,
          primary_color, client_term_label, status, banned_reason, registrations_blocked,
          onboarding_completed, onboarding_step, manager_confirmed, manager_profession, manager_practice_areas
        FROM tenants
        WHERE id = ?
      `).get(tenantId);

      const userPayload = {
        id: userId,
        name: responsibleName,
        email: cleanEmail,
        role: 'clinic_admin' as const,
        status: startTrial ? 'active' : 'pending',
        phone: phone || null,
        avatarUrl: null,
        tenantId: tenantId,
        needsOnboarding: false,
        needsLegalAcceptance: false,
        professionalId: createdProfId,
        professionId: resolvedProfId,
        professionName: resolvedProfName,
        professionSlug: resolvedProfSlug,
        practiceAreas: managerPracticeAreas || '',
        registrationType: resolvedBoardLabel,
        registrationNumber: managerRegistrationNumber || null,
        termsVersionAccepted: CURRENT_TERMS_VERSION,
        privacyVersionAccepted: CURRENT_PRIVACY_VERSION,
        permissions: [],
        zemdaBodyEnabled: true,
        zemdaFisioEnabled: modFlags.zemda_fisio_enabled === 1,
        zemdaOdontoEnabled: modFlags.zemda_odonto_enabled === 1,
        zemdaNutriEnabled: modFlags.zemda_nutri_enabled === 1,
        zemdaToEnabled: modFlags.zemda_to_enabled === 1,
        zemdaFonoEnabled: modFlags.zemda_fono_enabled === 1,
        zemdaPsicoEnabled: modFlags.zemda_psico_enabled === 1,
        zemdaPPEnabled: modFlags.zemda_pp_enabled === 1,
        zemdaPersonalEnabled: modFlags.zemda_personal_enabled === 1,
        zemdaMedEnabled: modFlags.zemda_med_enabled === 1
      };

      res.status(201).json({
        message: startTrial
          ? 'Teste grátis de 7 dias do Zemda Solo ativado com sucesso!'
          : 'Clínica cadastrada com sucesso. Redirecionando para escolha do plano.',
        token,
        user: userPayload,
        tenant: tenantData,
        clinicId: tenantId,
        slug,
        status: startTrial ? 'active' : 'pending',
        isTrial: startTrial,
        trialEndsAt: startTrial ? trialEndsAt : null
      });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[TenantController.registerPublic] Erro:', err);
      res.status(500).json({ error: 'Erro ao cadastrar nova clínica' });
    }
  }

  // 2. Aprovação de Clínica pelo ADM do SaaS
  static adminApprove(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenant = db.prepare('SELECT id, name, email, status FROM tenants WHERE id = ?').get(id) as any;

      if (!tenant) {
        res.status(404).json({ error: 'Clínica não encontrada' });
        return;
      }

      if (tenant.status === 'banned') { res.status(409).json({ error: 'Remova o banimento antes de alterar o status da clínica.' }); return; }

      requireCapacity(String(id), (db.prepare("SELECT COUNT(*) n FROM users WHERE tenant_id=? AND status='pending' AND role!='superadmin'").get(id) as any).n);
      // 1. Atualiza clínica para 'active'
      db.prepare("UPDATE tenants SET status = 'active', updated_at = datetime('now') WHERE id = ?").run(id);

      // 2. Ativa os usuários associados (incluindo o primeiro gestor)
      db.prepare("UPDATE users SET status = 'active', updated_at = datetime('now') WHERE tenant_id = ? AND status = 'pending'").run(id);
      db.prepare("UPDATE clinic_users SET status = 'active', approved_by = ?, approved_at = datetime('now') WHERE tenant_id = ? AND status = 'pending'").run(req.user?.userId || 'admin', id);

      // 3. Inicializa configurações padrão de recibos se ainda não existirem
      db.prepare(`
        INSERT OR IGNORE INTO receipt_settings (
          id, tenant_id, emitter_type, emitter_name, emitter_trade_name, emitter_document,
          receipt_prefix, next_sequence, is_configured
        ) VALUES (
          ?, ?, 'pj', ?, ?, '00.000.000/0001-00', 'REC-', 1, 0
        )
      `).run('rec-set-' + id, id, tenant.name, tenant.name);

      // 4. Garante de forma idempotente que a clínica possui o serviço inicial padrão 'Atendimento / Consulta' (R$ 180,00)
      ensureDefaultClinicService(String(id));

      logAudit(req, 'ADMIN_APPROVE_CLINIC', 'tenants', id, { clinicName: tenant.name });

      res.json({
        message: `Clínica "${tenant.name}" aprovada com sucesso! O gestor já pode acessar para concluir a configuração inicial.`,
        status: 'active'
      });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[TenantController.adminApprove] Erro:', err);
      res.status(500).json({ error: 'Erro ao aprovar clínica' });
    }
  }

  // 3. Recusa de Cadastro de Clínica pelo ADM do SaaS
  static adminReject(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const tenant = db.prepare('SELECT id, name, status FROM tenants WHERE id = ?').get(id) as any;
      if (!tenant) {
        res.status(404).json({ error: 'Clínica não encontrada' });
        return;
      }

      if (tenant.status === 'banned') { res.status(409).json({ error: 'Remova o banimento antes de alterar o status da clínica.' }); return; }

      db.prepare("UPDATE tenants SET status = 'rejected', rejection_reason = ?, updated_at = datetime('now') WHERE id = ?").run(reason || 'Não atende aos critérios da plataforma', id);
      db.prepare("UPDATE users SET status = 'rejected', updated_at = datetime('now') WHERE tenant_id = ?").run(id);
      db.prepare("UPDATE clinic_users SET status = 'rejected' WHERE tenant_id = ?").run(id);

      logAudit(req, 'ADMIN_REJECT_CLINIC', 'tenants', id, { reason });

      res.json({ message: `Cadastro da clínica "${tenant.name}" foi recusado.`, status: 'rejected' });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[TenantController.adminReject] Erro:', err);
      res.status(500).json({ error: 'Erro ao recusar clínica' });
    }
  }

  // 4. Bloqueio de Clínica pelo ADM do SaaS
  static adminBlock(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenant = db.prepare('SELECT id, name, status FROM tenants WHERE id = ?').get(id) as any;
      if (!tenant) {
        res.status(404).json({ error: 'Clínica não encontrada' });
        return;
      }

      if (tenant.status === 'banned') { res.status(409).json({ error: 'Remova o banimento antes de alterar o status da clínica.' }); return; }

      db.prepare("UPDATE tenants SET status = 'blocked', updated_at = datetime('now') WHERE id = ?").run(id);
      db.prepare("UPDATE users SET status = 'blocked', updated_at = datetime('now') WHERE tenant_id = ?").run(id);

      logAudit(req, 'ADMIN_BLOCK_CLINIC', 'tenants', id);
      res.json({ message: `Clínica "${tenant.name}" bloqueada com sucesso.` });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[TenantController.adminBlock] Erro:', err);
      res.status(500).json({ error: 'Erro ao bloquear clínica' });
    }
  }

  // 5. Desbloqueio de Clínica pelo ADM do SaaS
  static adminUnblock(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenant = db.prepare('SELECT id, name, status FROM tenants WHERE id = ?').get(id) as any;
      if (!tenant) {
        res.status(404).json({ error: 'Clínica não encontrada' });
        return;
      }

      if (tenant.status === 'banned') { res.status(409).json({ error: 'Remova o banimento antes de alterar o status da clínica.' }); return; }

      db.prepare("UPDATE tenants SET status = 'active', updated_at = datetime('now') WHERE id = ?").run(id);
      requireCapacity(String(id), (db.prepare("SELECT COUNT(*) n FROM users WHERE tenant_id=? AND status!='active' AND role!='superadmin'").get(id) as any).n);
      db.prepare("UPDATE users SET status = 'active', updated_at = datetime('now') WHERE tenant_id = ?").run(id);

      logAudit(req, 'ADMIN_UNBLOCK_CLINIC', 'tenants', id);
      res.json({ message: `Clínica "${tenant.name}" desbloqueada com sucesso.` });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[TenantController.adminUnblock] Erro:', err);
      res.status(500).json({ error: 'Erro ao desbloquear clínica' });
    }
  }

  // 5.1 Banimento de Clínica pelo ADM do SaaS
  static adminBan(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const adminId = (req as any).user?.userId;

      if (typeof reason !== 'string' || !reason.trim()) {
        res.status(400).json({ error: 'O motivo do banimento é obrigatório.' });
        return;
      }

      const tenant = db.prepare('SELECT id, name FROM tenants WHERE id = ?').get(id) as any;
      if (!tenant) {
        res.status(404).json({ error: 'Clínica não encontrada' });
        return;
      }

      db.transaction(() => {
        db.prepare(`UPDATE tenants SET pre_ban_status = CASE WHEN status = 'banned' THEN pre_ban_status ELSE status END,
          status = 'banned', banned_at = datetime('now'), banned_by = ?, banned_reason = ?,
          session_version = session_version + 1, updated_at = datetime('now') WHERE id = ?`).run(adminId, reason.trim(), id);
        globalAudit(adminId, String(id), tenant.name, 'BAN', reason.trim());
      })();
      res.json({ message: `Clínica "${tenant.name}" foi banida com sucesso.`, status: 'banned' });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[TenantController.adminBan] Erro:', err);
      res.status(500).json({ error: 'Erro ao banir clínica' });
    }
  }

  // 5.2 Remoção de Banimento de Clínica pelo ADM do SaaS
  static adminUnban(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenant = db.prepare('SELECT id, name FROM tenants WHERE id = ?').get(id) as any;
      if (!tenant) {
        res.status(404).json({ error: 'Clínica não encontrada' });
        return;
      }

      db.transaction(() => {
        db.prepare(`UPDATE tenants SET status = COALESCE(pre_ban_status, 'active'), pre_ban_status = NULL,
          banned_at = NULL, banned_by = NULL, banned_reason = NULL, updated_at = datetime('now') WHERE id = ? AND status = 'banned'`).run(id);
        globalAudit(req.user!.userId, String(id), tenant.name, 'UNBAN', 'Banimento removido');
      })();
      res.json({ message: `Banimento da clínica "${tenant.name}" foi removido com sucesso.`, status: 'active' });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[TenantController.adminUnban] Erro:', err);
      res.status(500).json({ error: 'Erro ao remover banimento da clínica' });
    }
  }

  // 5.3 Bloquear / Liberar Novos Cadastros da Clínica
  static adminToggleRegistrations(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenant = db.prepare('SELECT id, name, registrations_blocked FROM tenants WHERE id = ?').get(id) as any;
      if (!tenant) {
        res.status(404).json({ error: 'Clínica não encontrada' });
        return;
      }

      if (typeof req.body.blocked !== 'boolean') { res.status(400).json({ error: 'Informe blocked como booleano.' }); return; }
      const nextState = req.body.blocked ? 1 : 0;
      db.prepare("UPDATE tenants SET registrations_blocked = ?, updated_at = datetime('now') WHERE id = ?").run(nextState, id);

      globalAudit(req.user!.userId, String(id), tenant.name, nextState ? 'BLOCK_REGISTRATIONS' : 'ALLOW_REGISTRATIONS', 'Controle de novos cadastros');
      res.json({
        message: nextState === 1
          ? `Novos cadastros foram bloqueados para a clínica "${tenant.name}".`
          : `Novos cadastros foram liberados para a clínica "${tenant.name}".`,
        registrations_blocked: nextState
      });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[TenantController.adminToggleRegistrations] Erro:', err);
      res.status(500).json({ error: 'Erro ao alternar bloqueio de cadastros da clínica' });
    }
  }

  // 5.4 Exclusão Rápida e DEFINITIVA de uma Clínica (Exclusivo SuperAdmin com validação de senha real)
  static async adminDeletePermanently(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { password, confirmation, reason } = req.body;
      const currentUserId = (req as any).user?.userId;

      if (!currentUserId) {
        res.status(401).json({ error: 'Usuário não autenticado.' });
        return;
      }

      // Valida credenciais do SuperAdmin no banco de dados
      const adminUser = db.prepare('SELECT id, email, password_hash, role FROM users WHERE id = ?').get(currentUserId) as any;
      if (!adminUser || adminUser.role !== 'superadmin') {
        res.status(403).json({ error: 'Acesso negado. Apenas o Administrador do Sistema pode executar esta operação.' });
        return;
      }

      // Validação rigorosa da senha atual do administrador
      const isPasswordValid = await comparePassword(typeof password === 'string' ? password : '', adminUser.password_hash || '');
      if (!isPasswordValid) {
        res.status(403).json({ error: 'Senha do Administrador inválida. Nenhuma alteração foi realizada.' });
        return;
      }
      const freshAdmin = db.prepare('SELECT role, status, password_hash FROM users WHERE id = ?').get(currentUserId);
      if (!freshAdmin || freshAdmin.role !== 'superadmin' || freshAdmin.status !== 'active' || freshAdmin.password_hash !== adminUser.password_hash) {
        res.status(403).json({ error: 'Reautenticação inválida. Entre novamente.' }); return;
      }

      // Validação da confirmação por texto explícito e motivo
      if (typeof reason !== 'string' || !reason.trim()) {
        res.status(400).json({ error: 'O motivo da exclusão definitiva é obrigatório.' });
        return;
      }

      if (confirmation !== 'EXCLUIR') {
        res.status(400).json({ error: 'Confirmação inválida. Digite exatamente a palavra EXCLUIR para confirmar.' });
        return;
      }

      // 1. Tentar cancelar assinatura gerenciada se ativa (não impede a exclusão se offline/sandbox)
      try {
        const billing = db.prepare('SELECT managed,status FROM subscriptions WHERE clinic_id=? AND is_current=1').get(id) as any;
        if (billing?.managed && billing.status !== 'CANCELED') {
          await BillingService.cancel(String(id), adminUser.id, 'Exclusão administrativa da clínica');
        }
      } catch (billingErr) {
        console.warn('[TenantController.adminDeletePermanently] Aviso ao cancelar assinatura antes do purge:', billingErr);
      }

      // 2. Executar o PURGE real e completo de todas as tabelas e storage
      await purgeTenantCompletely(String(id), adminUser.id, reason.trim());
      res.json({ message: 'Clínica excluída definitivamente', deleted_clinic_id: id });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[TenantController.adminDeletePermanently] Erro:', err);
      res.status(500).json({ error: err?.message || 'Exclusão não concluída. Ocorreu uma falha durante o processo de limpeza.' });
    }
  }

  // 6. Métricas Globais do SaaS para o Dashboard do SuperAdmin
  static adminMetrics(req: Request, res: Response): void {
    try {
      const totalClinics = (db.prepare('SELECT COUNT(*) as c FROM tenants').get() as any).c;
      const pendingClinics = (db.prepare("SELECT COUNT(*) as c FROM tenants WHERE status = 'pending'").get() as any).c;
      const activeClinics = (db.prepare("SELECT COUNT(*) as c FROM tenants WHERE status = 'active'").get() as any).c;
      const blockedClinics = (db.prepare("SELECT COUNT(*) as c FROM tenants WHERE status = 'blocked'").get() as any).c;
      const bannedClinics = (db.prepare("SELECT COUNT(*) as c FROM tenants WHERE status = 'banned'").get() as any).c;
      const totalUsers = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c;
      const totalProfessionals = (db.prepare('SELECT COUNT(*) as c FROM professionals WHERE active = 1').get() as any).c;
      const totalAppointments = (db.prepare('SELECT COUNT(*) as c FROM appointments').get() as any).c;
      const totalRevenueEstimate = (db.prepare("SELECT SUM(amount) as s FROM payments WHERE status = 'paid'").get() as any)?.s || 0;

      // Últimos logs de auditoria administrativa
      const recentLogs = db.prepare(`
        SELECT id, action, clinic_id AS entity_id, clinic_name, reason, reauthenticated, created_at
        FROM global_clinic_audit
        ORDER BY created_at DESC
        LIMIT 10
      `).all();

      // Alertas do sistema (ex: clínicas pendentes aguardando aprovação)
      const alerts = [];
      if (pendingClinics > 0) {
        alerts.push({
          type: 'warning',
          message: `Existem ${pendingClinics} clínica(s) com cadastro pendente aguardando sua aprovação.`
        });
      }

      res.json({
        totalClinics,
        pendingClinics,
        activeClinics,
        blockedClinics,
        bannedClinics,
        totalUsers,
        totalProfessionals,
        totalAppointments,
        totalRevenueEstimate,
        recentLogs,
        alerts
      });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[TenantController.adminMetrics] Erro:', err);
      res.status(500).json({ error: 'Erro ao calcular métricas do SaaS' });
    }
  }

  // 7. Lista todas as clínicas (com filtros para o SuperAdmin)
  static listAll(req: Request, res: Response): void {
    try {
      const { status, search } = req.query;

      let query = `
        SELECT 
          t.id, t.slug, t.name, t.corporate_name, t.trade_name, t.cnpj_cpf, t.email, t.phone, 
          t.city, t.state, t.logo_url, t.status, t.onboarding_completed, t.manager_confirmed,
          t.registrations_blocked, t.banned_at, t.banned_by, t.banned_reason,
          t.responsible_name, t.responsible_email, t.created_at,
          p.name as plan_name, p.slug as plan_slug,
          (SELECT COUNT(*) FROM professionals WHERE tenant_id = t.id AND active = 1) as total_professionals,
          (SELECT COUNT(*) FROM patients WHERE tenant_id = t.id AND active = 1) as total_patients,
          (SELECT COUNT(*) FROM appointments WHERE tenant_id = t.id) as total_appointments
        FROM tenants t
        LEFT JOIN plans p ON p.id = t.plan_id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (status) {
        query += ' AND t.status = ?';
        params.push(status);
      }

      if (search) {
        query += ' AND (t.name LIKE ? OR t.email LIKE ? OR t.city LIKE ? OR t.responsible_name LIKE ?)';
        const term = `%${search}%`;
        params.push(term, term, term, term);
      }

      query += ' ORDER BY t.created_at DESC';

      const stmt = db.prepare(query);
      const tenants = stmt.all(...params);
      const pendingCleanup = db.prepare(`SELECT j.clinic_id AS id, a.clinic_name AS name, 'cleanup_pending' AS status
        FROM clinic_deletion_jobs j JOIN global_clinic_audit a ON a.clinic_id = j.clinic_id AND a.action = 'DELETE_REQUESTED'`).all();
      tenants.push(...pendingCleanup);
      res.json(tenants);
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[TenantController.listAll] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar clínicas' });
    }
  }

  // 8. Dados da clínica atual (autenticada)
  static getCurrent(req: Request, res: Response): void {
    try {
      if (!req.tenantId) {
        res.status(400).json({ error: 'Nenhum tenant associado' });
        return;
      }

      const stmt = db.prepare(`
        SELECT 
          t.id, t.slug, t.name, t.corporate_name, t.trade_name, t.person_type, t.cnpj_cpf,
          t.municipal_registration, t.state_registration, t.professional_board, t.professional_registry,
          t.manager_profession, t.manager_practice_areas,
          t.email, t.phone, t.mobile, t.whatsapp, t.website, t.description,
          t.address, t.street, t.number, t.complement, t.neighborhood, t.city, t.state, t.zip_code, t.country,
          t.responsible_name, t.responsible_cpf, t.responsible_email, t.responsible_phone, t.responsible_role,
          t.logo_url, t.primary_color, t.client_term_label, t.status,
          t.business_hours_json,
          t.onboarding_completed, t.onboarding_step, t.manager_confirmed, t.created_at,
          p.name as plan_name, p.slug as plan_slug, p.features_json
        FROM tenants t
        LEFT JOIN plans p ON p.id = t.plan_id
        WHERE t.id = ?
      `);
      const tenant = stmt.get(req.tenantId) as any;

      if (!tenant) {
        res.status(404).json({ error: 'Clínica não encontrada' });
        return;
      }

      // Configurações adicionais
      const settingsStmt = db.prepare('SELECT setting_key, setting_value FROM settings WHERE tenant_id = ?');
      const settingsRows = settingsStmt.all(req.tenantId) as { setting_key: string; setting_value: string }[];
      const settingsMap: Record<string, string> = {};
      for (const row of settingsRows) {
        settingsMap[row.setting_key] = row.setting_value;
      }

      // Status dos recibos
      const rec = db.prepare('SELECT is_configured FROM receipt_settings WHERE tenant_id = ?').get(req.tenantId) as any;

      res.json({
        ...tenant,
        settings: settingsMap,
        receiptsConfigured: rec?.is_configured === 1
      });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[TenantController.getCurrent] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar dados da clínica' });
    }
  }

  // 9. Atualiza dados da clínica atual
  static updateCurrent(req: Request, res: Response): void {
    try {
      if (!req.tenantId) {
        res.status(400).json({ error: 'Nenhum tenant associado' });
        return;
      }

      const {
        name, corporateName, tradeName, personType, cnpjCpf, municipalRegistration, stateRegistration,
        professionalBoard, professionalRegistry, email, phone, mobile, whatsapp, website, description,
        street, number, complement, neighborhood, city, state, zipCode, country,
        responsibleName, responsibleCpf, responsibleEmail, responsiblePhone, responsibleRole,
        logoUrl, primaryColor, clientTermLabel, businessHoursJson, businessHours, settings,
        managerProfession, managerPracticeAreas
      } = req.body;

      const rawBusinessHours = businessHoursJson 
        ? (typeof businessHoursJson === 'string' ? businessHoursJson : JSON.stringify(businessHoursJson))
        : (businessHours ? JSON.stringify(businessHours) : null);

      const fullAddress = street && city ? `${street}, ${number || 'S/N'} - ${neighborhood || ''}, ${city}/${state || ''}` : null;

      const updateStmt = db.prepare(`
        UPDATE tenants SET
          name = COALESCE(?, name),
          corporate_name = COALESCE(?, corporate_name),
          trade_name = COALESCE(?, trade_name),
          person_type = COALESCE(?, person_type),
          cnpj_cpf = COALESCE(?, cnpj_cpf),
          municipal_registration = COALESCE(?, municipal_registration),
          state_registration = COALESCE(?, state_registration),
          professional_board = COALESCE(?, professional_board),
          professional_registry = COALESCE(?, professional_registry),
          manager_profession = COALESCE(?, manager_profession),
          manager_practice_areas = COALESCE(?, manager_practice_areas),
          email = COALESCE(?, email),
          phone = COALESCE(?, phone),
          mobile = COALESCE(?, mobile),
          whatsapp = COALESCE(?, whatsapp),
          website = COALESCE(?, website),
          description = COALESCE(?, description),
          street = COALESCE(?, street),
          number = COALESCE(?, number),
          complement = COALESCE(?, complement),
          neighborhood = COALESCE(?, neighborhood),
          city = COALESCE(?, city),
          state = COALESCE(?, state),
          zip_code = COALESCE(?, zip_code),
          country = COALESCE(?, country),
          address = COALESCE(?, address),
          responsible_name = COALESCE(?, responsible_name),
          responsible_cpf = COALESCE(?, responsible_cpf),
          responsible_email = COALESCE(?, responsible_email),
          responsible_phone = COALESCE(?, responsible_phone),
          responsible_role = COALESCE(?, responsible_role),
          logo_url = COALESCE(?, logo_url),
          primary_color = COALESCE(?, primary_color),
          client_term_label = COALESCE(?, client_term_label),
          business_hours_json = COALESCE(?, business_hours_json),
          updated_at = datetime('now')
        WHERE id = ?
      `);

      updateStmt.run(
        name || null,
        corporateName || null,
        tradeName || null,
        personType || null,
        cnpjCpf || null,
        municipalRegistration || null,
        stateRegistration || null,
        professionalBoard || null,
        professionalRegistry || null,
        managerProfession || null,
        managerPracticeAreas || null,
        email || null,
        phone || null,
        mobile || null,
        whatsapp || null,
        website || null,
        description || null,
        street || null,
        number || null,
        complement || null,
        neighborhood || null,
        city || null,
        state || null,
        zipCode || null,
        country || null,
        fullAddress,
        responsibleName || null,
        responsibleCpf || null,
        responsibleEmail || null,
        responsiblePhone || null,
        responsibleRole || null,
        logoUrl || null,
        primaryColor || null,
        clientTermLabel || null,
        rawBusinessHours,
        req.tenantId
      );

      if (req.user?.userId) {
        db.prepare(`
          UPDATE users SET
            profession_name = COALESCE(?, profession_name),
            practice_areas = COALESCE(?, practice_areas),
            registration_type = COALESCE(?, registration_type),
            registration_number = COALESCE(?, registration_number),
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(
          managerProfession || null,
          managerPracticeAreas || null,
          professionalBoard || null,
          professionalRegistry || null,
          req.user.userId,
          req.tenantId
        );
      }

      // Atualiza configurações se enviadas
      if (settings && typeof settings === 'object') {
        const upsertSetting = db.prepare(`
          INSERT INTO settings (id, tenant_id, setting_key, setting_value, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(tenant_id, setting_key) DO UPDATE SET
            setting_value = excluded.setting_value,
            updated_at = datetime('now')
        `);

        for (const [key, value] of Object.entries(settings)) {
          upsertSetting.run(`set-${key}-${req.tenantId}`, req.tenantId, key, String(value));
        }
      }

      logAudit(req, 'UPDATE_TENANT_SETTINGS', 'tenants', req.tenantId);
      res.json({ message: 'Configurações atualizadas com sucesso' });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[TenantController.updateCurrent] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar dados da clínica' });
    }
  }

  // 10. Perfil público da clínica para a landing page e agendamento online (/c/:slug)
  static getPublicProfile(req: Request, res: Response): void {
    try {
      const { slug } = req.params;
      const tenantStmt = db.prepare(`
        SELECT 
          id, slug, name, trade_name, email, phone, address, city, state, zip_code,
          logo_url, primary_color, client_term_label, status
        FROM tenants
        WHERE slug = ? AND status = 'active'
      `);
      const tenant = tenantStmt.get(String(slug)) as any;

      if (!tenant) {
        res.status(404).json({ error: 'Estabelecimento ou clínica não encontrado ou inativo' });
        return;
      }

      // Profissionais ativos da clínica
      const profStmt = db.prepare(`
        SELECT 
          p.id, p.name, p.photo_url, p.registration_type, p.registration_number, p.bio,
          spec.id as specialty_id, spec.name as specialty_name, spec.color as specialty_color,
          prof.name as profession_name
        FROM professionals p
        LEFT JOIN specialties spec ON spec.id = p.specialty_id
        LEFT JOIN professions prof ON prof.id = p.profession_id
        WHERE p.tenant_id = ? AND p.active = 1
        ORDER BY p.name ASC
      `);
      const professionals = profStmt.all(tenant.id);

      // Serviços ativos
      const srvStmt = db.prepare(`
        SELECT 
          s.id, s.name, s.description, s.duration_minutes, s.buffer_minutes, s.price, s.modality,
          spec.name as specialty_name
        FROM services s
        LEFT JOIN specialties spec ON spec.id = s.specialty_id
        WHERE s.tenant_id = ? AND s.active = 1
        ORDER BY s.name ASC
      `);
      const services = srvStmt.all(tenant.id);

      res.json({
        tenant,
        professionals,
        services
      });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[TenantController.getPublicProfile] Erro:', err);
      res.status(500).json({ error: 'Erro ao carregar página pública da clínica' });
    }
  }
}
