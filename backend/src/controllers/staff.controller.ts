import { respondBillingError } from './billing.controller';
import { requireCapacity, pendingBillingManager, BillingService } from '../services/billing.service';
import { Request, Response } from 'express';
import { requireOpenRegistration } from '../services/clinic-control.service';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { logAudit } from '../middlewares/audit.middleware';
import { hashPassword } from '../utils/password';

/**
 * Purga com segurança colaboradores desativados há mais de 30 dias (Item 3).
 * Preserva prontuários, documentos, registros financeiros e histórico de atendimentos
 * através da anonimização de dados pessoais e desvinculação da clínica.
 */
function purgeExpiredDeactivatedAccounts(tenantId: string): void {
  try {
    const expiredUsers = db.prepare(`
      SELECT u.id, u.name, u.email
      FROM users u
      JOIN clinic_users cu ON cu.user_id = u.id AND cu.tenant_id = ?
      WHERE (u.status IN ('inactive', 'blocked') OR cu.status IN ('inactive', 'blocked'))
        AND (
          (u.scheduled_deletion_at IS NOT NULL AND u.scheduled_deletion_at <= datetime('now'))
          OR (cu.scheduled_deletion_at IS NOT NULL AND cu.scheduled_deletion_at <= datetime('now'))
        )
    `).all(tenantId) as { id: string; name: string; email: string }[];

    for (const exp of expiredUsers) {
      const anonEmail = `anon_${exp.id}@zemda.internal`;
      const anonName = '[Colaborador Excluído]';
      db.prepare(`
        UPDATE users SET
          name = ?, email = ?, phone = NULL, avatar_url = NULL,
          status = 'deleted', updated_at = datetime('now')
        WHERE id = ?
      `).run(anonName, anonEmail, exp.id);

      db.prepare("UPDATE professionals SET active = 0 WHERE user_id = ?").run(exp.id);
      db.prepare("DELETE FROM clinic_users WHERE user_id = ? AND tenant_id = ?").run(exp.id, tenantId);
    }
  } catch (err) {
    console.error('[purgeExpiredDeactivatedAccounts] Erro ao purgar contas expiradas:', err);
  }
}

export class StaffController {
  // Lista todos os funcionários e profissionais vinculados à clínica
  static listStaff(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Identificação de clínica obrigatória' });
        return;
      }

      // 0. Executa purga de contas desativadas há mais de 30 dias (Item 3)
      purgeExpiredDeactivatedAccounts(tenantId);

      // 1. Busca usuários vinculados à clínica via clinic_users
      const usersStmt = db.prepare(`
        SELECT 
          u.id, u.tenant_id, u.name, u.email, u.role, u.phone, u.avatar_url,
          COALESCE(cu.status, u.status) as status, u.created_at,
          COALESCE(cu.deactivated_at, u.deactivated_at) as deactivated_at,
          COALESCE(cu.scheduled_deletion_at, u.scheduled_deletion_at) as scheduled_deletion_at,
          cu.is_manager, cu.permissions_json, cu.approved_at, cu.approved_by,
          COALESCE(cu.profession_custom, prof.name, u.role) as profession_name,
          COALESCE(cu.practice_areas, p.practice_areas, p.bio) as practice_areas,
          p.id as professional_id, p.registration_type, p.registration_number,
          p.zemda_fisio_enabled, p.zemda_odonto_enabled,
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
      if (respondBillingError(res, err)) return;
      console.error('[StaffController.listStaff] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar funcionários da clínica' });
    }
  }

  // Criação direta de membro descontinuada (Item 2)
  static async invite(req: Request, res: Response): Promise<void> {
    res.status(403).json({
      error: 'A criação direta de usuários pelo gerente foi descontinuada. Novos usuários devem se cadastrar na plataforma, selecionar a clínica e aguardar aprovação da solicitação.',
      code: 'DIRECT_MEMBER_CREATION_DISABLED'
    });
  }

  // Aprova a solicitação de acesso de um funcionário pendente
  static approve(req: Request, res: Response): void {
    try {
      requireOpenRegistration(req.tenantId!);
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

      requireCapacity(tenantId!, 1, String(id));
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
      if (respondBillingError(res, err)) return;
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
      if (respondBillingError(res, err)) return;
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
      if (newRole === 'superadmin' || user.role === 'superadmin') {
        res.status(403).json({ error: 'O Administrador do Sistema não pode ser criado ou alterado pelo controle de funcionários.' }); return;
      }

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
      if (respondBillingError(res, err)) return;
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
      const zemdaBodyActive = permissions.includes('access_zemda_body') ? 1 : 0;
      db.prepare(`
        INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json, zemda_body_enabled)
        VALUES (?, ?, ?, 'receptionist', 'active', 0, ?, ?)
        ON CONFLICT(tenant_id, user_id) DO UPDATE SET
          permissions_json = excluded.permissions_json,
          zemda_body_enabled = excluded.zemda_body_enabled
      `).run('cu-' + uuidv4().slice(0, 8), tenantId, id, permsJson, zemdaBodyActive);

      logAudit(req, 'UPDATE_STAFF_PERMISSIONS', 'users', id, { permissionsCount: permissions.length });
      res.json({ message: 'Permissões do funcionário atualizadas com sucesso' });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[StaffController.updatePermissions] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar permissões do funcionário' });
    }
  }

  // Desativa ou reativa um funcionário com agendamento de exclusão em 30 dias (Item 3)
  static toggleStatus(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;

      const user = db.prepare('SELECT id, tenant_id, name, status FROM users WHERE id = ?').get(id) as any;
      if (!user || user.tenant_id !== tenantId) {
        res.status(403).json({ error: 'Acesso negado: usuário não pertence a esta clínica' });
        return;
      }

      const isCurrentlyActive = user.status === 'active';
      const newStatus = isCurrentlyActive ? 'inactive' : 'active';
      if (newStatus === 'active') requireCapacity(tenantId!, 1, String(id));

      if (newStatus === 'inactive') {
        // Bloqueia o acesso imediatamente, registra data e agenda exclusão para +30 dias
        db.prepare(`
          UPDATE users SET
            status = 'inactive',
            deactivated_at = datetime('now'),
            scheduled_deletion_at = datetime('now', '+30 days'),
            updated_at = datetime('now')
          WHERE id = ?
        `).run(id);

        db.prepare(`
          UPDATE clinic_users SET
            status = 'inactive',
            deactivated_at = datetime('now'),
            scheduled_deletion_at = datetime('now', '+30 days')
          WHERE user_id = ? AND tenant_id = ?
        `).run(id, tenantId);

        db.prepare("UPDATE professionals SET active = 0 WHERE user_id = ? AND tenant_id = ?").run(id, tenantId);
      } else {
        // Reativação durante os 30 dias: cancela exclusão automaticamente e restaura acesso
        db.prepare(`
          UPDATE users SET
            status = 'active',
            deactivated_at = NULL,
            scheduled_deletion_at = NULL,
            updated_at = datetime('now')
          WHERE id = ?
        `).run(id);

        db.prepare(`
          UPDATE clinic_users SET
            status = 'active',
            deactivated_at = NULL,
            scheduled_deletion_at = NULL
          WHERE user_id = ? AND tenant_id = ?
        `).run(id, tenantId);

        db.prepare("UPDATE professionals SET active = 1 WHERE user_id = ? AND tenant_id = ?").run(id, tenantId);
      }

      logAudit(req, 'TOGGLE_STAFF_STATUS', 'users', id, { newStatus });
      res.json({
        message: newStatus === 'active' ? 'Conta reativada com sucesso' : 'Conta desativada. Exclusão programada para 30 dias.',
        status: newStatus
      });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[StaffController.toggleStatus] Erro:', err);
      res.status(500).json({ error: 'Erro ao alterar status do funcionário' });
    }
  }

  // =========================================================================
  // GESTÃO DE CONVITES POR LINK ÚNICO DA CLÍNICA (Itens 14 a 23)
  // =========================================================================

  /**
   * Gera um novo link de convite exclusivo e seguro para a clínica.
   */
  static async createInvite(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId;

      if (!tenantId || !userId) {
        res.status(400).json({ error: 'Identificação de clínica e usuário obrigatória' });
        return;
      }

      const { role = 'professional', validityDays = 7, maxUses = 1 } = req.body;
      if (role === 'superadmin') {
        res.status(403).json({ error: 'Convites de clínica não podem conceder administração global.' }); return;
      }

      // Busca dados do tenant para compor o slug e URL
      const tenant = db.prepare('SELECT id, name, slug, status, registrations_blocked FROM tenants WHERE id = ?').get(tenantId) as any;
      if (!tenant) {
        res.status(404).json({ error: 'Clínica não encontrada' });
        return;
      }

      if (tenant.status === 'banned') {
        res.status(403).json({ error: 'Esta clínica está banida pelo Administrador do Sistema. A geração de novos convites está bloqueada.' });
        return;
      }

      if (tenant.registrations_blocked === 1) {
        res.status(403).json({ error: 'Novos cadastros e convites estão bloqueados para esta clínica pelo Administrador do Sistema.' });
        return;
      }

      // Gera token seguro e imprevisível de 48 caracteres hexadecimais
      const token = crypto.randomBytes(24).toString('hex');
      const inviteId = 'cinv-' + uuidv4().slice(0, 8);
      const days = Math.max(1, Math.min(Number(validityDays) || 7, 30));

      const insertStmt = db.prepare(`
        INSERT INTO clinic_invites (
          id, tenant_id, created_by, token, role, expires_at, status, max_uses, used_count
        ) VALUES (
          ?, ?, ?, ?, ?, datetime('now', '+' || ? || ' days'), 'pending', ?, 0
        )
      `);
      insertStmt.run(inviteId, tenantId, userId, token, role, days, Number(maxUses) || 1);

      // Busca o registro recém-criado
      const createdInvite = db.prepare('SELECT * FROM clinic_invites WHERE id = ?').get(inviteId) as any;
      const clinicSlug = tenant.slug || tenant.id;
      const invitePath = `/convite/${clinicSlug}/${token}`;

      logAudit(req, 'CREATE_CLINIC_INVITE', 'clinic_invites', inviteId, {
        tenantId,
        role,
        validityDays: days,
        expiresAt: createdInvite.expires_at
      });

      res.status(201).json({
        message: 'Link de convite gerado com sucesso!',
        invite: {
          ...createdInvite,
          clinicName: tenant.name,
          clinicSlug,
          inviteUrl: invitePath
        }
      });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[StaffController.createInvite] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar link de convite' });
    }
  }

  /**
   * Lista todos os convites da clínica, auto-expirando links vencidos.
   */
  static listInvites(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Identificação de clínica obrigatória' });
        return;
      }

      // Auto-expira convites vencidos no banco
      db.prepare(`
        UPDATE clinic_invites
        SET status = 'expired', updated_at = datetime('now')
        WHERE tenant_id = ? AND status = 'pending' AND expires_at < datetime('now')
      `).run(tenantId);

      const tenant = db.prepare('SELECT id, name, slug FROM tenants WHERE id = ?').get(tenantId) as any;
      const clinicSlug = tenant?.slug || tenantId;

      const invites = db.prepare(`
        SELECT 
          ci.id, ci.tenant_id, ci.created_by, ci.token, ci.role, ci.expires_at,
          ci.status, ci.max_uses, ci.used_count, ci.used_at, ci.used_by,
          ci.created_at, ci.updated_at,
          u.name as creator_name,
          ub.name as used_by_name
        FROM clinic_invites ci
        LEFT JOIN users u ON u.id = ci.created_by
        LEFT JOIN users ub ON ub.id = ci.used_by
        WHERE ci.tenant_id = ?
        ORDER BY ci.created_at DESC
      `).all(tenantId) as any[];

      const formatted = invites.map(inv => ({
        ...inv,
        clinicSlug,
        inviteUrl: `/convite/${clinicSlug}/${inv.token}`
      }));

      res.json({ invites: formatted });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[StaffController.listInvites] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar links de convite' });
    }
  }

  /**
   * Cancela um link de convite antes de ser utilizado.
   */
  static cancelInvite(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;

      if (!tenantId || !id) {
        res.status(400).json({ error: 'Parâmetros obrigatórios ausentes' });
        return;
      }

      const invite = db.prepare('SELECT * FROM clinic_invites WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!invite) {
        res.status(404).json({ error: 'Convite não encontrado nesta clínica' });
        return;
      }

      if (invite.status === 'used') {
        res.status(400).json({ error: 'Não é possível cancelar um convite que já foi utilizado.' });
        return;
      }

      db.prepare(`
        UPDATE clinic_invites
        SET status = 'cancelled', updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(id, tenantId);

      logAudit(req, 'CANCEL_CLINIC_INVITE', 'clinic_invites', id, { tenantId });

      res.json({ message: 'Convite cancelado com sucesso' });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[StaffController.cancelInvite] Erro:', err);
      res.status(500).json({ error: 'Erro ao cancelar convite' });
    }
  }
}
