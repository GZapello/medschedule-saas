import { Request, Response } from 'express';
import { requireOpenRegistration } from '../services/clinic-control.service';
import { db } from '../config/database';
import { comparePassword, hashPassword } from '../utils/password';
import { generateToken } from '../utils/jwt';
import { logAudit } from '../middlewares/audit.middleware';
import { v4 as uuidv4 } from 'uuid';

export class AuthController {
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'Email e senha são obrigatórios' });
        return;
      }

      const userStmt = db.prepare(`
        SELECT id, tenant_id, name, email, password_hash, role, phone, avatar_url, status
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
      } | undefined;

      if (!user) {
        res.status(401).json({ error: 'Credenciais inválidas' });
        return;
      }

      const valid = await comparePassword(password, user.password_hash);
      if (!valid) {
        res.status(401).json({ error: 'Credenciais inválidas' });
        return;
      }

      // Validação de status do usuário
      if (user.status === 'pending') {
        res.status(403).json({
          error: 'Sua solicitação de acesso está aguardando aprovação pelo gestor da clínica.',
          code: 'USER_PENDING'
        });
        return;
      }

      if (user.status === 'rejected') {
        res.status(403).json({
          error: 'Sua solicitação de acesso a esta clínica foi recusada pela administração.',
          code: 'USER_REJECTED'
        });
        return;
      }

      if (user.status === 'blocked' || user.status === 'inactive') {
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
            onboarding_completed, onboarding_step, manager_confirmed
          FROM tenants
          WHERE id = ?
        `);
        tenantData = tenantStmt.get(user.tenant_id);

        if (tenantData) {
          if (tenantData.status === 'banned') {
            res.status(403).json({
              error: 'Esta clínica foi banida pelo Administrador do Sistema. O acesso está permanentemente bloqueado.',
              code: 'CLINIC_BANNED',
              banned_reason: tenantData.banned_reason
            });
            return;
          }

          if (tenantData.status === 'pending') {
            res.status(403).json({
              error: 'O cadastro da sua clínica está em análise e pendente de aprovação pelo Administrador do SaaS. Você será notificado assim que o acesso for liberado.',
              code: 'CLINIC_PENDING'
            });
            return;
          }

          if (tenantData.status === 'blocked' || tenantData.status === 'suspended') {
            res.status(403).json({
              error: 'O acesso a esta clínica está temporariamente suspenso ou bloqueado. Entre em contato com o suporte.',
              code: 'CLINIC_BLOCKED'
            });
            return;
          }

          if (tenantData.status === 'rejected') {
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
            p.id as professional_id, p.profession_id, p.specialty_id, p.registration_type, p.registration_number,
            p.practice_areas, p.slug as professional_slug, p.zemda_fisio_enabled,
            prof.name as profession_name, prof.slug as profession_slug,
            spec.name as specialty_name
          FROM professionals p
          LEFT JOIN professions prof ON prof.id = p.profession_id
          LEFT JOIN specialties spec ON spec.id = p.specialty_id
          WHERE p.user_id = ?
        `).get(user.id);

        // Se não houver registro formal em professionals, verifica clinic_users / users / tenant
        if (!profDetails && user.role === 'clinic_admin') {
          const cu = db.prepare(`
            SELECT cu.profession_custom, cu.practice_areas, cu.zemda_fisio_enabled,
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
            profDetails = {
              profession_id: (pName.toLowerCase().includes('fisio') ? 'prof-fisioterapeuta' : undefined),
              profession_name: pName,
              profession_slug: pSlug,
              practice_areas: pAreas,
              registration_type: cu?.registration_type,
              registration_number: cu?.registration_number,
              zemda_fisio_enabled: cu?.zemda_fisio_enabled ?? 1
            };
          }
        }
      }

      const needsOnboarding = user.role === 'clinic_admin' && tenantData?.onboarding_completed !== 1;

      let userPermissions: string[] = [];
      let cuRow: any = null;
      if (user.tenant_id) {
        cuRow = db.prepare('SELECT permissions_json, zemda_fisio_enabled FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(user.id, user.tenant_id) as any;
        if (cuRow?.permissions_json) {
          try { userPermissions = JSON.parse(cuRow.permissions_json); } catch {}
        }
      }

      const checkPhysioText = [
        profDetails?.profession_id,
        profDetails?.profession_slug,
        profDetails?.profession_name,
        profDetails?.practice_areas,
        tenantData?.manager_profession,
        tenantData?.manager_practice_areas
      ].filter(Boolean).join(' ').toLowerCase();

      const isPhysioUser =
        profDetails?.profession_id === 'prof-fisioterapeuta' ||
        profDetails?.profession_id === 'prof-fisioterapia' ||
        checkPhysioText.includes('fisio') ||
        checkPhysioText.includes('physio');

      const isManagerUser = user.role === 'clinic_admin';

      const zemdaFisioEnabled = user.role !== 'superadmin' && isPhysioUser && (
        isManagerUser ||
        userPermissions.includes('access_zemda_fisio') ||
        Number(profDetails?.zemda_fisio_enabled) === 1 ||
        Number(cuRow?.zemda_fisio_enabled) === 1
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
          professionalId: profDetails?.professional_id,
          professionId: profDetails?.profession_id,
          professionName: profDetails?.profession_name,
          professionSlug: profDetails?.profession_slug,
          registrationType: profDetails?.registration_type,
          registrationNumber: profDetails?.registration_number,
          specialtyName: profDetails?.specialty_name,
          professionalSlug: profDetails?.professional_slug,
          practiceAreas: profDetails?.practice_areas,
          permissions: userPermissions,
          zemdaFisioEnabled
        },
        tenant: tenantData
      });
    } catch (err: any) {
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
        SELECT id, tenant_id, name, email, role, phone, avatar_url, status
        FROM users
        WHERE id = ?
      `);
      const user = userStmt.get(req.user.userId) as any;

      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      let tenantData: any = null;
      if (user.tenant_id) {
        const tenantStmt = db.prepare(`
          SELECT 
            id, slug, name, corporate_name, trade_name, email, phone, logo_url,
            primary_color, client_term_label, status,
            onboarding_completed, onboarding_step, manager_confirmed
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
            p.id as professional_id, p.profession_id, p.specialty_id, p.registration_type, p.registration_number,
            p.practice_areas, p.slug as professional_slug, p.zemda_fisio_enabled,
            prof.name as profession_name, prof.slug as profession_slug,
            spec.name as specialty_name
          FROM professionals p
          LEFT JOIN professions prof ON prof.id = p.profession_id
          LEFT JOIN specialties spec ON spec.id = p.specialty_id
          WHERE p.user_id = ?
        `).get(user.id);

        if (!profDetails && user.role === 'clinic_admin') {
          const cu = db.prepare(`
            SELECT cu.profession_custom, cu.practice_areas, cu.zemda_fisio_enabled,
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
            profDetails = {
              profession_id: (pName.toLowerCase().includes('fisio') ? 'prof-fisioterapeuta' : undefined),
              profession_name: pName,
              profession_slug: pSlug,
              practice_areas: pAreas,
              registration_type: cu?.registration_type,
              registration_number: cu?.registration_number,
              zemda_fisio_enabled: cu?.zemda_fisio_enabled ?? 1
            };
          }
        }
      }

      let userPermissions: string[] = [];
      let cuRow: any = null;
      if (user.tenant_id) {
        cuRow = db.prepare('SELECT permissions_json, zemda_fisio_enabled FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(user.id, user.tenant_id) as any;
        if (cuRow?.permissions_json) {
          try { userPermissions = JSON.parse(cuRow.permissions_json); } catch {}
        }
      }
      const needsOnboarding = user.role === 'clinic_admin' && tenantData?.onboarding_completed !== 1;

      const checkPhysioText = [
        profDetails?.profession_id,
        profDetails?.profession_slug,
        profDetails?.profession_name,
        profDetails?.practice_areas,
        tenantData?.manager_profession,
        tenantData?.manager_practice_areas
      ].filter(Boolean).join(' ').toLowerCase();

      const isPhysioUser =
        profDetails?.profession_id === 'prof-fisioterapeuta' ||
        profDetails?.profession_id === 'prof-fisioterapia' ||
        checkPhysioText.includes('fisio') ||
        checkPhysioText.includes('physio');

      const isManagerUser = user.role === 'clinic_admin';

      const zemdaFisioEnabled = user.role !== 'superadmin' && isPhysioUser && (
        isManagerUser ||
        userPermissions.includes('access_zemda_fisio') ||
        Number(profDetails?.zemda_fisio_enabled) === 1 ||
        Number(cuRow?.zemda_fisio_enabled) === 1
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
          professionalId: profDetails?.professional_id,
          professionId: profDetails?.profession_id,
          professionName: profDetails?.profession_name,
          professionSlug: profDetails?.profession_slug,
          registrationType: profDetails?.registration_type,
          registrationNumber: profDetails?.registration_number,
          specialtyName: profDetails?.specialty_name,
          professionalSlug: profDetails?.professional_slug,
          practiceAreas: profDetails?.practice_areas,
          permissions: userPermissions,
          zemdaFisioEnabled
        },
        tenant: tenantData
      });
    } catch (err: any) {
      console.error('[AuthController.me] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar usuário autenticado' });
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
      try { requireOpenRegistration(tenantId); } catch { res.status(403).json({ error: 'Novos cadastros estão bloqueados para esta clínica.' }); return; }
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
      db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(hashedPassword, user.id);

      logAudit(req, 'UPDATE_OWN_PASSWORD', 'users', user.id);
      res.json({ message: 'Sua senha foi alterada com sucesso!' });
    } catch (err: any) {
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
        name,
        email,
        password,
        phone,
        prefix,
        professionName,
        practiceAreas,
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

      // Executa inserções e consome o convite em transação
      const completeRegister = db.transaction(() => {
        requireOpenRegistration(tenantId);
        const currentInvite = db.prepare('SELECT status, used_count, max_uses, expires_at FROM clinic_invites WHERE token = ?').get(token);
        if (!currentInvite || currentInvite.status !== 'pending' || currentInvite.used_count >= currentInvite.max_uses || new Date(currentInvite.expires_at) < new Date()) throw new Error('Convite indisponível.');
        // 1. users (ativo, já aprovado via convite oficial da clínica)
        db.prepare(`
          INSERT INTO users (
            id, tenant_id, name, email, password_hash, role, phone, status,
            profession_name, practice_areas, registration_type, registration_number
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
        `).run(
          userId, tenantId, finalName, cleanEmail, hashedPassword, userRole, phone || null,
          professionName || null, practiceAreas || null, registrationType || null, registrationNumber || null
        );

        // 2. clinic_users
        db.prepare(`
          INSERT INTO clinic_users (
            id, tenant_id, user_id, role, status, is_manager, permissions_json,
            profession_custom, practice_areas, approved_at, approved_by, created_at
          ) VALUES (?, ?, ?, ?, 'active', 0, ?, ?, ?, datetime('now'), ?, datetime('now'))
        `).run(
          'cu-' + uuidv4().slice(0, 8),
          tenantId,
          userId,
          userRole,
          defaultPerms,
          professionName || null,
          practiceAreas || null,
          inviteData.created_by || 'invite'
        );

        // 3. professionals (se for professional ou tiver área de saúde)
        if (userRole === 'professional' || professionName) {
          const profId = 'pro-' + uuidv4().slice(0, 8);
          // Gera slug
          const baseSlug = finalName
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
          const finalSlug = `${baseSlug}-${profId.slice(-4)}`;

          db.prepare(`
            INSERT INTO professionals (
              id, tenant_id, user_id, name, registration_type, registration_number,
              practice_areas, bio, slug, active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
          `).run(
            profId,
            tenantId,
            userId,
            finalName,
            registrationType || 'Registro',
            registrationNumber || null,
            practiceAreas || null,
            practiceAreas || null,
            finalSlug
          );
        }

        // 4. Marca o convite como utilizado (uso único por padrão)
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
          tenantId
        },
        clinic: {
          id: tenantId,
          name: inviteData.clinic_name
        }
      });
    } catch (err: any) {
      console.error('[AuthController.registerWithInvite] Erro:', err);
      res.status(500).json({ error: 'Erro ao concluir cadastro por convite' });
    }
  }
}
