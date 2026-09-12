import { Request, Response } from 'express';
import { db } from '../config/database';
import { logAudit } from '../middlewares/audit.middleware';
import { hashPassword } from '../utils/password';
import { v4 as uuidv4 } from 'uuid';

export class TenantController {
  // 0. Lista pública de clínicas ativas para seleção no cadastro de usuários ("Clínica que deseja integrar")
  static listPublic(req: Request, res: Response): void {
    try {
      const stmt = db.prepare(`
        SELECT id, name, trade_name, city, state, slug, logo_url, client_term_label
        FROM tenants
        WHERE status = 'active'
        ORDER BY name ASC
      `);
      const clinics = stmt.all();
      res.json(clinics);
    } catch (err: any) {
      console.error('[TenantController.listPublic] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar clínicas disponíveis' });
    }
  }

  // 1. Cadastro Público de Nova Clínica ("Criar Minha Clínica" - status inicial 'pending')
  static async registerPublic(req: Request, res: Response): Promise<void> {
    try {
      const {
        responsibleName,
        email,
        phone,
        password,
        clinicName,
        tradeName,
        cnpjCpf,
        city,
        state,
        termsAccepted,
        privacyAccepted
      } = req.body;

      if (!responsibleName || !email || !password || !clinicName) {
        res.status(400).json({ error: 'Nome do responsável, e-mail, senha e nome da clínica são obrigatórios' });
        return;
      }

      if (!termsAccepted || !privacyAccepted) {
        res.status(400).json({ error: 'É obrigatório aceitar os Termos de Uso e a Política de Privacidade' });
        return;
      }

      const cleanEmail = email.trim().toLowerCase();

      // Verifica se o e-mail já existe
      const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
      if (existingUser) {
        res.status(409).json({ error: 'Este e-mail já está cadastrado na plataforma' });
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

      // Insere o tenant com status PENDENTE
      const insertTenant = db.prepare(`
        INSERT INTO tenants (
          id, slug, name, corporate_name, trade_name, cnpj_cpf, email, phone,
          city, state, responsible_name, responsible_email, responsible_phone,
          status, onboarding_completed, onboarding_step, manager_confirmed,
          terms_accepted, terms_accepted_at, privacy_accepted, privacy_accepted_at,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          'pending', 0, 1, 0,
          1, datetime('now'), 1, datetime('now'),
          datetime('now'), datetime('now')
        )
      `);

      insertTenant.run(
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
        phone || null
      );

      // Insere o usuário gestor com status PENDENTE e role 'clinic_admin'
      const insertUser = db.prepare(`
        INSERT INTO users (
          id, tenant_id, name, email, password_hash, role, phone, status, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, 'clinic_admin', ?, 'pending', datetime('now'), datetime('now')
        )
      `);

      insertUser.run(userId, tenantId, responsibleName, cleanEmail, hashedPassword, phone || null);

      // Associa em clinic_users
      db.prepare(`
        INSERT INTO clinic_users (
          id, tenant_id, user_id, role, status, is_manager, created_at
        ) VALUES (
          ?, ?, ?, 'clinic_admin', 'pending', 1, datetime('now')
        )
      `).run('cu-' + uuidv4().slice(0, 8), tenantId, userId);

      logAudit(req, 'REGISTER_CLINIC_REQUEST', 'tenants', tenantId, {
        clinicName,
        responsibleName,
        email: cleanEmail
      });

      res.status(201).json({
        message: 'Cadastro da clínica recebido com sucesso! Seu acesso está pendente de aprovação pelo Administrador do SaaS.',
        clinicId: tenantId,
        slug,
        status: 'pending'
      });
    } catch (err: any) {
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

      logAudit(req, 'ADMIN_APPROVE_CLINIC', 'tenants', id, { clinicName: tenant.name });

      res.json({
        message: `Clínica "${tenant.name}" aprovada com sucesso! O gestor já pode acessar para concluir a configuração inicial.`,
        status: 'active'
      });
    } catch (err: any) {
      console.error('[TenantController.adminApprove] Erro:', err);
      res.status(500).json({ error: 'Erro ao aprovar clínica' });
    }
  }

  // 3. Recusa de Cadastro de Clínica pelo ADM do SaaS
  static adminReject(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const tenant = db.prepare('SELECT id, name FROM tenants WHERE id = ?').get(id) as any;
      if (!tenant) {
        res.status(404).json({ error: 'Clínica não encontrada' });
        return;
      }

      db.prepare("UPDATE tenants SET status = 'rejected', rejection_reason = ?, updated_at = datetime('now') WHERE id = ?").run(reason || 'Não atende aos critérios da plataforma', id);
      db.prepare("UPDATE users SET status = 'rejected', updated_at = datetime('now') WHERE tenant_id = ?").run(id);
      db.prepare("UPDATE clinic_users SET status = 'rejected' WHERE tenant_id = ?").run(id);

      logAudit(req, 'ADMIN_REJECT_CLINIC', 'tenants', id, { reason });

      res.json({ message: `Cadastro da clínica "${tenant.name}" foi recusado.`, status: 'rejected' });
    } catch (err: any) {
      console.error('[TenantController.adminReject] Erro:', err);
      res.status(500).json({ error: 'Erro ao recusar clínica' });
    }
  }

  // 4. Bloqueio de Clínica pelo ADM do SaaS
  static adminBlock(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenant = db.prepare('SELECT id, name FROM tenants WHERE id = ?').get(id) as any;
      if (!tenant) {
        res.status(404).json({ error: 'Clínica não encontrada' });
        return;
      }

      db.prepare("UPDATE tenants SET status = 'blocked', updated_at = datetime('now') WHERE id = ?").run(id);
      db.prepare("UPDATE users SET status = 'blocked', updated_at = datetime('now') WHERE tenant_id = ?").run(id);

      logAudit(req, 'ADMIN_BLOCK_CLINIC', 'tenants', id);
      res.json({ message: `Clínica "${tenant.name}" bloqueada com sucesso.` });
    } catch (err: any) {
      console.error('[TenantController.adminBlock] Erro:', err);
      res.status(500).json({ error: 'Erro ao bloquear clínica' });
    }
  }

  // 5. Desbloqueio de Clínica pelo ADM do SaaS
  static adminUnblock(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenant = db.prepare('SELECT id, name FROM tenants WHERE id = ?').get(id) as any;
      if (!tenant) {
        res.status(404).json({ error: 'Clínica não encontrada' });
        return;
      }

      db.prepare("UPDATE tenants SET status = 'active', updated_at = datetime('now') WHERE id = ?").run(id);
      db.prepare("UPDATE users SET status = 'active', updated_at = datetime('now') WHERE tenant_id = ?").run(id);

      logAudit(req, 'ADMIN_UNBLOCK_CLINIC', 'tenants', id);
      res.json({ message: `Clínica "${tenant.name}" desbloqueada com sucesso.` });
    } catch (err: any) {
      console.error('[TenantController.adminUnblock] Erro:', err);
      res.status(500).json({ error: 'Erro ao desbloquear clínica' });
    }
  }

  // 6. Métricas Globais do SaaS para o Dashboard do SuperAdmin
  static adminMetrics(req: Request, res: Response): void {
    try {
      const totalClinics = (db.prepare('SELECT COUNT(*) as c FROM tenants').get() as any).c;
      const pendingClinics = (db.prepare("SELECT COUNT(*) as c FROM tenants WHERE status = 'pending'").get() as any).c;
      const activeClinics = (db.prepare("SELECT COUNT(*) as c FROM tenants WHERE status = 'active'").get() as any).c;
      const blockedClinics = (db.prepare("SELECT COUNT(*) as c FROM tenants WHERE status = 'blocked'").get() as any).c;
      const totalUsers = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c;
      const totalProfessionals = (db.prepare('SELECT COUNT(*) as c FROM professionals WHERE active = 1').get() as any).c;
      const totalAppointments = (db.prepare('SELECT COUNT(*) as c FROM appointments').get() as any).c;
      const totalRevenueEstimate = (db.prepare("SELECT SUM(amount) as s FROM payments WHERE status = 'paid'").get() as any)?.s || 0;

      // Últimos logs de auditoria administrativa
      const recentLogs = db.prepare(`
        SELECT id, action, entity, entity_id, ip_address, created_at
        FROM audit_logs
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
        totalUsers,
        totalProfessionals,
        totalAppointments,
        totalRevenueEstimate,
        recentLogs,
        alerts
      });
    } catch (err: any) {
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
      res.json(tenants);
    } catch (err: any) {
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
        logoUrl, primaryColor, clientTermLabel, businessHoursJson, businessHours, settings
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
      console.error('[TenantController.getPublicProfile] Erro:', err);
      res.status(500).json({ error: 'Erro ao carregar página pública da clínica' });
    }
  }
}
