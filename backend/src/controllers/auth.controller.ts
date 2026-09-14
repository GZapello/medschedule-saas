import { Request, Response } from 'express';
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
            primary_color, client_term_label, status,
            onboarding_completed, onboarding_step, manager_confirmed
          FROM tenants
          WHERE id = ?
        `);
        tenantData = tenantStmt.get(user.tenant_id);

        if (tenantData) {
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
            p.practice_areas, p.slug as professional_slug,
            prof.name as profession_name, prof.slug as profession_slug,
            spec.name as specialty_name
          FROM professionals p
          LEFT JOIN professions prof ON prof.id = p.profession_id
          LEFT JOIN specialties spec ON spec.id = p.specialty_id
          WHERE p.user_id = ?
        `).get(user.id);

        // Se não houver registro formal em professionals, verifica clinic_users / users
        if (!profDetails && user.role === 'clinic_admin') {
          const cu = db.prepare(`
            SELECT cu.profession_custom, cu.practice_areas, u.profession_name, u.practice_areas as user_practice_areas,
                   u.registration_type, u.registration_number
            FROM clinic_users cu
            LEFT JOIN users u ON u.id = cu.user_id
            WHERE cu.user_id = ? AND cu.tenant_id = ?
          `).get(user.id, user.tenant_id) as any;

          if (cu && (cu.profession_custom || cu.profession_name || cu.practice_areas || cu.user_practice_areas)) {
            const pName = cu.profession_custom || cu.profession_name || '';
            const pSlug = pName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
            profDetails = {
              profession_name: pName,
              profession_slug: pSlug,
              practice_areas: cu.practice_areas || cu.user_practice_areas,
              registration_type: cu.registration_type,
              registration_number: cu.registration_number
            };
          }
        }
      }

      const needsOnboarding = user.role === 'clinic_admin' && tenantData?.onboarding_completed !== 1;

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
          practiceAreas: profDetails?.practice_areas
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
            p.practice_areas, p.slug as professional_slug,
            prof.name as profession_name, prof.slug as profession_slug,
            spec.name as specialty_name
          FROM professionals p
          LEFT JOIN professions prof ON prof.id = p.profession_id
          LEFT JOIN specialties spec ON spec.id = p.specialty_id
          WHERE p.user_id = ?
        `).get(user.id);

        if (!profDetails && user.role === 'clinic_admin') {
          const cu = db.prepare(`
            SELECT cu.profession_custom, cu.practice_areas, u.profession_name, u.practice_areas as user_practice_areas,
                   u.registration_type, u.registration_number
            FROM clinic_users cu
            LEFT JOIN users u ON u.id = cu.user_id
            WHERE cu.user_id = ? AND cu.tenant_id = ?
          `).get(user.id, user.tenant_id) as any;

          if (cu && (cu.profession_custom || cu.profession_name || cu.practice_areas || cu.user_practice_areas)) {
            const pName = cu.profession_custom || cu.profession_name || '';
            const pSlug = pName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
            profDetails = {
              profession_name: pName,
              profession_slug: pSlug,
              practice_areas: cu.practice_areas || cu.user_practice_areas,
              registration_type: cu.registration_type,
              registration_number: cu.registration_number
            };
          }
        }
      }

      const needsOnboarding = user.role === 'clinic_admin' && tenantData?.onboarding_completed !== 1;

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
          practiceAreas: profDetails?.practice_areas
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
}
