import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';
import { hashPassword } from '../utils/password';

export class StaffController {
  // Lista todos os funcionários e profissionais vinculados à clínica
  static listStaff(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Identificação de clínica obrigatória' });
        return;
      }

      // 1. Busca usuários vinculados à clínica
      const usersStmt = db.prepare(`
        SELECT 
          u.id, u.tenant_id, u.name, u.email, u.role, u.phone, u.avatar_url,
          COALESCE(cu.status, u.status) as status, u.created_at,
          cu.is_manager, cu.permissions_json, cu.approved_at, cu.approved_by,
          COALESCE(cu.profession_custom, prof.name, u.role) as profession_name,
          COALESCE(cu.practice_areas, p.practice_areas, p.bio) as practice_areas,
          p.id as professional_id, p.registration_type, p.registration_number,
          spec.name as specialty_name
        FROM users u
        JOIN clinic_users cu ON cu.user_id = u.id AND cu.tenant_id = ?
        LEFT JOIN professionals p ON p.user_id = u.id AND p.tenant_id = ?
        LEFT JOIN professions prof ON prof.id = p.profession_id
        LEFT JOIN specialties spec ON spec.id = p.specialty_id
        WHERE cu.tenant_id = ? AND u.role NOT IN ('patient')
        ORDER BY 
          CASE WHEN COALESCE(cu.status, u.status) = 'pending' THEN 0 ELSE 1 END,
          u.created_at DESC
      `);
      const staffList = usersStmt.all(tenantId, tenantId, tenantId) as any[];

      // Converte permissões em array
      for (const s of staffList) {
        try {
          s.permissions = s.permissions_json ? JSON.parse(s.permissions_json) : [];
        } catch {
          s.permissions = [];
        }
      }

      // 2. Busca convites pendentes
      const invitesStmt = db.prepare(`
        SELECT id, tenant_id, email, name, phone, role, registration_number, permissions_json, status, created_at, expires_at
        FROM invites
        WHERE tenant_id = ? AND status = 'pending'
        ORDER BY created_at DESC
      `);
      const invites = invitesStmt.all(tenantId) as any[];

      for (const inv of invites) {
        try {
          inv.permissions = inv.permissions_json ? JSON.parse(inv.permissions_json) : [];
        } catch {
          inv.permissions = [];
        }
      }

      res.json({
        staff: staffList,
        invites
      });
    } catch (err: any) {
      console.error('[StaffController.listStaff] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar funcionários da clínica' });
    }
  }

  // Cria e envia convite / cadastra novo funcionário com status pendente de aceite
  static async invite(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Identificação de clínica obrigatória' });
        return;
      }

      const {
        name, email, phone, role, password,
        professionId, specialtyId, registrationNumber, registrationType,
        permissions
      } = req.body;

      if (!name || !email) {
        res.status(400).json({ error: 'Nome e e-mail do funcionário são obrigatórios' });
        return;
      }

      const userRole = role || 'receptionist';
      const cleanEmail = email.trim().toLowerCase();

      // Verifica se usuário já existe
      const existingUser = db.prepare('SELECT id, tenant_id FROM users WHERE email = ?').get(cleanEmail) as any;
      if (existingUser) {
        if (existingUser.tenant_id === tenantId) {
          res.status(409).json({ error: 'Este e-mail já pertence a um usuário desta clínica' });
          return;
        } else {
          res.status(409).json({ error: 'Este e-mail já está em uso na plataforma' });
          return;
        }
      }

      const userId = 'usr-' + uuidv4().slice(0, 8);
      const hashedPassword = await hashPassword(password || '123456');
      const defaultPerms = Array.isArray(permissions) ? JSON.stringify(permissions) : JSON.stringify([
        'view_schedule', 'create_appointment', 'edit_appointment', 'create_patient', 'edit_patient'
      ]);

      // Insere usuário já vinculado à clínica
      const insertUser = db.prepare(`
        INSERT INTO users (id, tenant_id, name, email, password_hash, role, phone, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
      `);
      insertUser.run(userId, tenantId, name, cleanEmail, hashedPassword, userRole, phone || null);

      // Insere na tabela de clinic_users
      const insertClinicUser = db.prepare(`
        INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json, approved_by, approved_at)
        VALUES (?, ?, ?, ?, 'active', 0, ?, ?, datetime('now'))
      `);
      insertClinicUser.run('cu-' + uuidv4().slice(0, 8), tenantId, userId, userRole, defaultPerms, req.user?.userId || null);

      // Se for profissional de saúde ou atendimento, registra na tabela professionals
      if (userRole === 'professional' || professionId) {
        const profId = 'pro-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO professionals (
            id, tenant_id, user_id, name, profession_id, specialty_id,
            registration_type, registration_number, active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).run(
          profId, tenantId, userId, name, professionId || null, specialtyId || null,
          registrationType || 'CRP', registrationNumber || null
        );

        // Grade padrão segunda a sexta 08:00 às 18:00
        for (let d = 1; d <= 5; d++) {
          db.prepare(`
            INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, break_start, break_end, is_active)
            VALUES (?, ?, ?, ?, '08:00', '18:00', '12:00', '13:00', 1)
          `).run('sch-' + uuidv4().slice(0, 8), tenantId, profId, d);
        }
      }

      logAudit(req, 'ADD_STAFF', 'users', userId, { name, email: cleanEmail, role: userRole });

      res.status(201).json({
        message: 'Funcionário cadastrado e vinculado com sucesso à clínica',
        userId
      });
    } catch (err: any) {
      console.error('[StaffController.invite] Erro:', err);
      res.status(500).json({ error: 'Erro ao cadastrar funcionário' });
    }
  }

  // Aprova a solicitação de acesso de um funcionário pendente
  static approve(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;

      const user = db.prepare('SELECT id, tenant_id, name, status FROM users WHERE id = ?').get(id) as any;
      if (!user) {
        res.status(404).json({ error: 'Funcionário não encontrado' });
        return;
      }

      if (user.tenant_id !== tenantId) {
        res.status(403).json({ error: 'Acesso negado: funcionário não pertence a esta clínica' });
        return;
      }

      db.prepare("UPDATE users SET status = 'active', updated_at = datetime('now') WHERE id = ?").run(id);
      db.prepare(`
        UPDATE clinic_users SET
          status = 'active',
          approved_by = ?,
          approved_at = datetime('now')
        WHERE user_id = ? AND tenant_id = ?
      `).run(req.user?.userId || null, id, tenantId);

      // Ativa registro profissional caso exista
      db.prepare("UPDATE professionals SET active = 1 WHERE user_id = ? AND tenant_id = ?").run(id, tenantId);

      logAudit(req, 'APPROVE_STAFF', 'users', id, { name: user.name });
      res.json({ message: `Acesso do funcionário ${user.name} aprovado com sucesso.` });
    } catch (err: any) {
      console.error('[StaffController.approve] Erro:', err);
      res.status(500).json({ error: 'Erro ao aprovar funcionário' });
    }
  }

  // Recusa o acesso de um funcionário
  static reject(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;

      const user = db.prepare('SELECT id, tenant_id, name FROM users WHERE id = ?').get(id) as any;
      if (!user) {
        res.status(404).json({ error: 'Funcionário não encontrado' });
        return;
      }

      if (user.tenant_id !== tenantId) {
        res.status(403).json({ error: 'Acesso negado: funcionário não pertence a esta clínica' });
        return;
      }

      db.prepare("UPDATE users SET status = 'rejected', updated_at = datetime('now') WHERE id = ?").run(id);
      db.prepare("UPDATE clinic_users SET status = 'rejected' WHERE user_id = ? AND tenant_id = ?").run(id, tenantId);
      db.prepare("UPDATE professionals SET active = 0 WHERE user_id = ? AND tenant_id = ?").run(id, tenantId);

      logAudit(req, 'REJECT_STAFF', 'users', id, { name: user.name });
      res.json({ message: `Solicitação de ${user.name} foi recusada.` });
    } catch (err: any) {
      console.error('[StaffController.reject] Erro:', err);
      res.status(500).json({ error: 'Erro ao recusar funcionário' });
    }
  }

  // Atualiza cargo, profissão e áreas de atuação de um membro da equipe
  static updateRoleProfession(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;
      const { role, professionName, practiceAreas } = req.body;

      const user = db.prepare('SELECT id, tenant_id, name, role FROM users WHERE id = ?').get(id) as any;
      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      if (user.tenant_id !== tenantId) {
        res.status(403).json({ error: 'Acesso negado: usuário não pertence a esta clínica' });
        return;
      }

      const newRole = role || user.role;

      // Atualiza usuário
      db.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?").run(newRole, id);

      // Atualiza clinic_users
      db.prepare(`
        UPDATE clinic_users SET
          role = ?,
          profession_custom = ?,
          practice_areas = ?
        WHERE user_id = ? AND tenant_id = ?
      `).run(newRole, professionName || null, practiceAreas || null, id, tenantId);

      // Sincroniza tabela professionals
      const existingProf = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (existingProf) {
        db.prepare('UPDATE professionals SET practice_areas = ? WHERE user_id = ? AND tenant_id = ?').run(practiceAreas || null, id, tenantId);
      } else if (newRole === 'professional') {
        const profId = 'pro-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO professionals (id, tenant_id, user_id, name, registration_type, practice_areas, active)
          VALUES (?, ?, ?, ?, 'Conselho', ?, 1)
        `).run(profId, tenantId, id, user.name, practiceAreas || null);

        for (let d = 1; d <= 5; d++) {
          db.prepare(`
            INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, break_start, break_end, is_active)
            VALUES (?, ?, ?, ?, '08:00', '18:00', '12:00', '13:00', 1)
          `).run('sch-' + uuidv4().slice(0, 8), tenantId, profId, d);
        }
      }

      logAudit(req, 'UPDATE_ROLE_PROFESSION', 'users', id, { role: newRole, professionName, practiceAreas });
      res.json({ message: 'Cargo, profissão e áreas de atuação atualizados com sucesso' });
    } catch (err: any) {
      console.error('[StaffController.updateRoleProfession] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar cargo e profissão do membro da equipe' });
    }
  }

  // Atualiza as permissões específicas do funcionário
  static updatePermissions(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;
      const { permissions } = req.body;

      if (!Array.isArray(permissions)) {
        res.status(400).json({ error: 'Permissões devem ser enviadas como uma lista' });
        return;
      }

      const user = db.prepare('SELECT id, tenant_id, name FROM users WHERE id = ?').get(id) as any;
      if (!user || user.tenant_id !== tenantId) {
        res.status(403).json({ error: 'Acesso negado: usuário não pertence a esta clínica' });
        return;
      }

      const permsJson = JSON.stringify(permissions);
      db.prepare(`
        INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json)
        VALUES (?, ?, ?, 'receptionist', 'active', 0, ?)
        ON CONFLICT(tenant_id, user_id) DO UPDATE SET
          permissions_json = excluded.permissions_json
      `).run('cu-' + uuidv4().slice(0, 8), tenantId, id, permsJson);

      logAudit(req, 'UPDATE_STAFF_PERMISSIONS', 'users', id, { permissionsCount: permissions.length });
      res.json({ message: 'Permissões do funcionário atualizadas com sucesso' });
    } catch (err: any) {
      console.error('[StaffController.updatePermissions] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar permissões do funcionário' });
    }
  }

  // Bloqueia ou desbloqueia um funcionário
  static toggleStatus(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;

      const user = db.prepare('SELECT id, tenant_id, name, status FROM users WHERE id = ?').get(id) as any;
      if (!user || user.tenant_id !== tenantId) {
        res.status(403).json({ error: 'Acesso negado: usuário não pertence a esta clínica' });
        return;
      }

      const newStatus = user.status === 'active' ? 'blocked' : 'active';
      db.prepare("UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?").run(newStatus, id);
      db.prepare("UPDATE clinic_users SET status = ? WHERE user_id = ? AND tenant_id = ?").run(newStatus, id, tenantId);

      // Sincroniza active em professionals
      const profActive = newStatus === 'active' ? 1 : 0;
      db.prepare("UPDATE professionals SET active = ? WHERE user_id = ? AND tenant_id = ?").run(profActive, id, tenantId);

      logAudit(req, 'TOGGLE_STAFF_STATUS', 'users', id, { newStatus });
      res.json({
        message: `Status do funcionário alterado para ${newStatus === 'active' ? 'Ativo' : 'Bloqueado'}`,
        status: newStatus
      });
    } catch (err: any) {
      console.error('[StaffController.toggleStatus] Erro:', err);
      res.status(500).json({ error: 'Erro ao alterar status do funcionário' });
    }
  }
}
