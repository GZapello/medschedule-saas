import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';
import { isValidPhoneNumber, normalizePhoneWithDDI } from '../utils/phone.utils';
import { EmailService } from '../services/email.service';
import { buildZemdaEmailLayout } from '../services/email-template.service';

export const MODERATION_REASONS = {
  suspected_spam: 'Suspeita de spam',
  invalid_phone: 'Telefone inválido',
  whatsapp_inaccessible: 'WhatsApp inexistente ou inacessível',
  inconsistent_data: 'Dados cadastrais inconsistentes',
  duplicate_account: 'Cadastro duplicado',
  suspicious_activity: 'Atividade suspeita',
  terms_violation: 'Violação dos termos de uso',
  other: 'Outros motivos'
};

export class UserModerationController {
  /**
   * Consulta os detalhes administrativos de um usuário (Exclusivo SuperAdmin)
   * NUNCA expõe dados clínicos de pacientes.
   */
  static async getUserModerationDetails(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      const user = db.prepare(`
        SELECT id, tenant_id, name, email, phone, role, status, phone_verified,
               moderation_flag, whatsapp_status, blocked_reason, blocked_at, blocked_by, blocked_until,
               created_at, last_login_at, last_login_provider
        FROM users WHERE id = ?
      `).get(userId) as any;

      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      // Se last_login_at não estiver gravado na coluna, busca o registro confiável em audit_logs
      if (!user.last_login_at) {
        const auditLogin = db.prepare(`
          SELECT created_at, action FROM audit_logs
          WHERE user_id = ? AND action IN ('USER_LOGIN', 'USER_LOGIN_GOOGLE')
          ORDER BY created_at DESC LIMIT 1
        `).get(user.id) as any;

        if (auditLogin) {
          user.last_login_at = auditLogin.created_at;
          user.last_login_provider = auditLogin.action === 'USER_LOGIN_GOOGLE' ? 'google' : 'local';
        }
      }

      // Vínculos com clínicas (apenas dados administrativos)
      const clinics = db.prepare(`
        SELECT cu.id, cu.tenant_id, cu.role, cu.status, cu.is_manager, cu.created_at,
               t.name as clinic_name, t.slug as clinic_slug, t.status as clinic_status
        FROM clinic_users cu
        JOIN tenants t ON t.id = cu.tenant_id
        WHERE cu.user_id = ?
        ORDER BY cu.created_at DESC
      `).all(userId);

      // Histórico de solicitações de WhatsApp
      const whatsappRequests = db.prepare(`
        SELECT id, tenant_id, requested_by_user_id, requested_by_name, reason,
               previous_phone, new_phone, status, suspended_access, verified,
               created_at, updated_at, resolved_at
        FROM user_whatsapp_requests
        WHERE user_id = ?
        ORDER BY created_at DESC
      `).all(userId);

      // Histórico de ocorrências de moderação
      const moderationLogs = db.prepare(`
        SELECT id, tenant_id, action, reason_code, reason_details, blocked_until,
               performed_by_user_id, performed_by_name, metadata_json, created_at
        FROM user_moderation_logs
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 50
      `).all(userId);

      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone || null,
          role: user.role,
          status: user.status,
          phoneVerified: Boolean(user.phone_verified),
          moderationFlag: user.moderation_flag || 'clean',
          whatsappStatus: user.whatsapp_status || (user.phone ? 'unverified' : null),
          blockedReason: user.blocked_reason || null,
          blockedAt: user.blocked_at || null,
          blockedBy: user.blocked_by || null,
          blockedUntil: user.blocked_until || null,
          createdAt: user.created_at,
          lastLoginAt: user.last_login_at || null,
          lastLoginProvider: user.last_login_provider || null
        },
        clinics,
        whatsappRequests,
        moderationLogs
      });
    } catch (err: any) {
      console.error('[UserModerationController.getUserModerationDetails] Erro:', err);
      res.status(500).json({ error: 'Erro ao carregar detalhes administrativos do usuário' });
    }
  }

  /**
   * Sinalizar usuário como spam ou cadastro suspeito / telefone inválido
   * Não produz bloqueio definitivo automaticamente.
   */
  static async flagUser(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { flag, reasonCode, reasonDetails, clinicId } = req.body;

      if (!flag || !reasonCode) {
        res.status(400).json({ error: 'Sinalização e motivo são obrigatórios' });
        return;
      }

      if (req.user?.userId === userId) {
        res.status(400).json({ error: 'Não é permitido sinalizar a própria conta de administrador' });
        return;
      }

      const user = db.prepare('SELECT id, name, email, phone FROM users WHERE id = ?').get(userId) as any;
      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      const currentAdminId = req.user?.userId || 'system';
      const currentAdminName = req.user?.name || 'SuperAdmin';

      let newWhatsappStatus: string | undefined = undefined;
      if (flag === 'invalid_phone') {
        newWhatsappStatus = 'invalid';
      }

      db.prepare(`
        UPDATE users
        SET moderation_flag = ?,
            whatsapp_status = COALESCE(?, whatsapp_status),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(flag, newWhatsappStatus, userId);

      const action = flag === 'suspected_spam' ? 'flag_spam' : (flag === 'invalid_phone' ? 'flag_invalid_phone' : 'flag_suspicious');

      db.prepare(`
        INSERT INTO user_moderation_logs (
          id, user_id, tenant_id, action, reason_code, reason_details,
          performed_by_user_id, performed_by_name, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        uuidv4(),
        userId,
        clinicId || null,
        action,
        reasonCode,
        reasonDetails || null,
        currentAdminId,
        currentAdminName,
        JSON.stringify({ flag, userEmail: user.email, currentPhone: user.phone })
      );

      logAudit(req, 'USER_MODERATION_FLAGGED', 'users', userId, { flag, reasonCode, reasonDetails });

      res.json({
        success: true,
        message: 'Usuário sinalizado na moderação com sucesso.'
      });
    } catch (err: any) {
      console.error('[UserModerationController.flagUser] Erro:', err);
      res.status(500).json({ error: 'Erro ao sinalizar usuário' });
    }
  }

  /**
   * Remove sinalização administrativa (restaura status limpo)
   */
  static async clearFlag(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { clinicId, reasonDetails } = req.body;

      const user = db.prepare('SELECT id, name, email, phone, whatsapp_status FROM users WHERE id = ?').get(userId) as any;
      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      const currentAdminId = req.user?.userId || 'system';
      const currentAdminName = req.user?.name || 'SuperAdmin';

      const resetWhatsappStatus = user.whatsapp_status === 'invalid' ? 'unverified' : user.whatsapp_status;

      db.prepare(`
        UPDATE users
        SET moderation_flag = 'clean',
            whatsapp_status = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(resetWhatsappStatus, userId);

      db.prepare(`
        INSERT INTO user_moderation_logs (
          id, user_id, tenant_id, action, reason_code, reason_details,
          performed_by_user_id, performed_by_name, metadata_json, created_at
        ) VALUES (?, ?, ?, 'clear_flag', 'cleared_by_admin', ?, ?, ?, ?, datetime('now'))
      `).run(
        uuidv4(),
        userId,
        clinicId || null,
        reasonDetails || 'Sinalização removida pelo SuperAdmin',
        currentAdminId,
        currentAdminName,
        JSON.stringify({ previousPhone: user.phone })
      );

      logAudit(req, 'USER_MODERATION_CLEARED', 'users', userId, { reasonDetails });

      res.json({
        success: true,
        message: 'Sinalização de moderação removida com sucesso.'
      });
    } catch (err: any) {
      console.error('[UserModerationController.clearFlag] Erro:', err);
      res.status(500).json({ error: 'Erro ao remover sinalização do usuário' });
    }
  }

  /**
   * Bloqueio individual de usuário (global ou de vínculo com clínica)
   * Invalida sessões imediatamente via session_version.
   * Não bloqueia a clínica inteira nem outros usuários.
   */
  static async blockUser(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const {
        scope = 'global',
        clinicId,
        reasonCode,
        reasonDetails,
        isTemporary = false,
        blockedUntil,
        confirmSoleManager = false
      } = req.body;

      if (!reasonCode && !reasonDetails) {
        res.status(400).json({ error: 'O motivo do bloqueio é obrigatório' });
        return;
      }

      // Regra de segurança: Não permitir que o SuperAdmin bloqueie a própria conta por engano
      if (req.user?.userId === userId) {
        res.status(400).json({ error: 'Você não pode bloquear a sua própria conta de SuperAdmin.' });
        return;
      }

      const user = db.prepare('SELECT id, name, email, role, status, session_version FROM users WHERE id = ?').get(userId) as any;
      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      const currentAdminId = req.user?.userId || 'system';
      const currentAdminName = req.user?.name || 'SuperAdmin';
      const fullReason = [reasonCode ? (MODERATION_REASONS[reasonCode as keyof typeof MODERATION_REASONS] || reasonCode) : null, reasonDetails].filter(Boolean).join(' — ');

      // Verificação de único gestor da clínica (apenas se o usuário for gestor)
      const targetClinicId = clinicId || user.tenant_id;
      if (targetClinicId) {
        const isManager = user.role === 'clinic_admin' || Boolean(db.prepare(`
          SELECT 1 FROM clinic_users WHERE tenant_id = ? AND user_id = ? AND (role = 'clinic_admin' OR is_manager = 1)
        `).get(targetClinicId, userId));

        if (isManager) {
          const otherManagers = db.prepare(`
            SELECT COUNT(*) as count FROM clinic_users
            WHERE tenant_id = ? AND (role = 'clinic_admin' OR is_manager = 1) AND status = 'active' AND user_id != ?
          `).get(targetClinicId, userId) as any;

          if (otherManagers?.count === 0 && !confirmSoleManager) {
            res.status(400).json({
              code: 'SOLE_MANAGER_CONFIRMATION_REQUIRED',
              error: 'Este usuário é o único administrador/gestor ativo desta clínica. O bloqueio deixará a clínica sem gestor ativo.',
              requiresConfirmation: true
            });
            return;
          }
        }
      }

      const untilDateStr = isTemporary && blockedUntil ? new Date(blockedUntil).toISOString() : null;

      if (scope === 'global') {
        // Bloqueio global da conta: invalida todas as sessões ativas incrementando session_version
        db.prepare(`
          UPDATE users
          SET status = 'blocked',
              blocked_reason = ?,
              blocked_at = datetime('now'),
              blocked_by = ?,
              blocked_until = ?,
              session_version = COALESCE(session_version, 0) + 1,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(fullReason, currentAdminId, untilDateStr, userId);

        db.prepare(`
          INSERT INTO user_moderation_logs (
            id, user_id, tenant_id, action, reason_code, reason_details, blocked_until,
            performed_by_user_id, performed_by_name, metadata_json, created_at
          ) VALUES (?, ?, ?, 'block_user', ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          uuidv4(),
          userId,
          targetClinicId || null,
          reasonCode || 'other',
          reasonDetails || null,
          untilDateStr,
          currentAdminId,
          currentAdminName,
          JSON.stringify({ scope: 'global', userName: user.name, userEmail: user.email })
        );

        logAudit(req, 'USER_BLOCKED', 'users', userId, { scope: 'global', reason: fullReason, until: untilDateStr });

        res.json({
          success: true,
          message: `Usuário ${user.name} bloqueado globalmente com sucesso. Todas as sessões foram invalidadas.`
        });
      } else {
        // Suspensão restrita ao vínculo com a clínica específica
        if (!targetClinicId) {
          res.status(400).json({ error: 'Identificador da clínica é obrigatório para suspensão de vínculo' });
          return;
        }

        db.prepare(`
          UPDATE clinic_users
          SET status = 'blocked'
          WHERE user_id = ? AND tenant_id = ?
        `).run(userId, targetClinicId);

        // Invalida sessão para forçar reautenticação / recálculo do vínculo
        db.prepare(`
          UPDATE users
          SET session_version = COALESCE(session_version, 0) + 1,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(userId);

        db.prepare(`
          INSERT INTO user_moderation_logs (
            id, user_id, tenant_id, action, reason_code, reason_details, blocked_until,
            performed_by_user_id, performed_by_name, metadata_json, created_at
          ) VALUES (?, ?, ?, 'suspend_membership', ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          uuidv4(),
          userId,
          targetClinicId,
          reasonCode || 'other',
          reasonDetails || null,
          untilDateStr,
          currentAdminId,
          currentAdminName,
          JSON.stringify({ scope: 'clinic', clinicId: targetClinicId, userName: user.name })
        );

        logAudit(req, 'CLINIC_MEMBERSHIP_SUSPENDED', 'clinic_users', userId, { clinicId: targetClinicId, reason: fullReason });

        res.json({
          success: true,
          message: `Acesso de ${user.name} à clínica foi suspenso com sucesso. Vínculos em outras clínicas foram preservados.`
        });
      }
    } catch (err: any) {
      console.error('[UserModerationController.blockUser] Erro:', err);
      res.status(500).json({ error: 'Erro ao bloquear usuário' });
    }
  }

  /**
   * Desbloqueio individual de usuário (global ou de clínica)
   */
  static async unblockUser(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { scope = 'global', clinicId, reasonDetails } = req.body;

      const user = db.prepare('SELECT id, name, email, status FROM users WHERE id = ?').get(userId) as any;
      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      const currentAdminId = req.user?.userId || 'system';
      const currentAdminName = req.user?.name || 'SuperAdmin';
      const targetClinicId = clinicId || user.tenant_id;

      if (scope === 'global') {
        db.prepare(`
          UPDATE users
          SET status = 'active',
              blocked_reason = NULL,
              blocked_at = NULL,
              blocked_by = NULL,
              blocked_until = NULL,
              session_version = COALESCE(session_version, 0) + 1,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(userId);

        db.prepare(`
          INSERT INTO user_moderation_logs (
            id, user_id, tenant_id, action, reason_code, reason_details,
            performed_by_user_id, performed_by_name, metadata_json, created_at
          ) VALUES (?, ?, ?, 'unblock_user', 'unblocked_by_admin', ?, ?, ?, ?, datetime('now'))
        `).run(
          uuidv4(),
          userId,
          targetClinicId || null,
          reasonDetails || 'Desbloqueado pelo SuperAdmin',
          currentAdminId,
          currentAdminName,
          JSON.stringify({ scope: 'global', userName: user.name })
        );

        logAudit(req, 'USER_UNBLOCKED', 'users', userId, { scope: 'global', reasonDetails });

        res.json({
          success: true,
          message: `Usuário ${user.name} desbloqueado com sucesso.`
        });
      } else {
        if (!targetClinicId) {
          res.status(400).json({ error: 'Identificador da clínica é obrigatório' });
          return;
        }

        db.prepare(`
          UPDATE clinic_users
          SET status = 'active'
          WHERE user_id = ? AND tenant_id = ?
        `).run(userId, targetClinicId);

        db.prepare(`
          UPDATE users
          SET session_version = COALESCE(session_version, 0) + 1,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(userId);

        db.prepare(`
          INSERT INTO user_moderation_logs (
            id, user_id, tenant_id, action, reason_code, reason_details,
            performed_by_user_id, performed_by_name, metadata_json, created_at
          ) VALUES (?, ?, ?, 'unsuspend_membership', 'unblocked_by_admin', ?, ?, ?, ?, datetime('now'))
        `).run(
          uuidv4(),
          userId,
          targetClinicId,
          reasonDetails || 'Acesso à clínica reativado pelo SuperAdmin',
          currentAdminId,
          currentAdminName,
          JSON.stringify({ scope: 'clinic', clinicId: targetClinicId })
        );

        logAudit(req, 'CLINIC_MEMBERSHIP_UNSUSPENDED', 'clinic_users', userId, { clinicId: targetClinicId });

        res.json({
          success: true,
          message: `Acesso de ${user.name} à clínica reativado com sucesso.`
        });
      }
    } catch (err: any) {
      console.error('[UserModerationController.unblockUser] Erro:', err);
      res.status(500).json({ error: 'Erro ao desbloquear usuário' });
    }
  }

  /**
   * SuperAdmin solicita atualização de WhatsApp
   * Opção entre "Somente solicitar atualização" e "Solicitar e suspender o acesso".
   * Não envia mensagens ao WhatsApp inválido.
   * Envia e-mail de notificação se houver e-mail válido.
   */
  static async requestWhatsAppUpdate(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { reason, suspendAccess = false, clinicId, confirmSoleManager = false } = req.body;

      if (!reason || !String(reason).trim()) {
        res.status(400).json({ error: 'O motivo da solicitação é obrigatório' });
        return;
      }

      if (suspendAccess && req.user?.userId === userId) {
        res.status(400).json({ error: 'Você não pode suspender a sua própria conta de SuperAdmin.' });
        return;
      }

      const user = db.prepare('SELECT id, name, email, phone, role, status, session_version FROM users WHERE id = ?').get(userId) as any;
      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      const currentAdminId = req.user?.userId || 'system';
      const currentAdminName = req.user?.name || 'SuperAdmin';
      const targetClinicId = clinicId || user.tenant_id;

      if (suspendAccess && targetClinicId) {
        const isManager = user.role === 'clinic_admin' || Boolean(db.prepare(`
          SELECT 1 FROM clinic_users WHERE tenant_id = ? AND user_id = ? AND (role = 'clinic_admin' OR is_manager = 1)
        `).get(targetClinicId, userId));

        if (isManager) {
          const otherManagers = db.prepare(`
            SELECT COUNT(*) as count FROM clinic_users
            WHERE tenant_id = ? AND (role = 'clinic_admin' OR is_manager = 1) AND status = 'active' AND user_id != ?
          `).get(targetClinicId, userId) as any;

          if (otherManagers?.count === 0 && !confirmSoleManager) {
            res.status(400).json({
              code: 'SOLE_MANAGER_CONFIRMATION_REQUIRED',
              error: 'Este usuário é o único gestor ativo desta clínica. A suspensão deixará a clínica sem gestor.',
              requiresConfirmation: true
            });
            return;
          }
        }
      }

      const requestId = uuidv4();

      db.prepare(`
        INSERT INTO user_whatsapp_requests (
          id, user_id, tenant_id, requested_by_user_id, requested_by_name,
          reason, previous_phone, status, suspended_access, verified, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0, datetime('now'), datetime('now'))
      `).run(
        requestId,
        userId,
        targetClinicId || null,
        currentAdminId,
        currentAdminName,
        reason.trim(),
        user.phone || null,
        suspendAccess ? 1 : 0
      );

      // Marca o WhatsApp do usuário como pendente de correção
      db.prepare(`
        UPDATE users
        SET whatsapp_status = 'pending_correction',
            moderation_flag = CASE WHEN moderation_flag = 'clean' THEN 'invalid_phone' ELSE moderation_flag END,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(userId);

      if (suspendAccess) {
        db.prepare(`
          UPDATE users
          SET status = 'blocked',
              blocked_reason = 'Acesso suspenso aguardando atualização cadastral do WhatsApp',
              blocked_at = datetime('now'),
              blocked_by = ?,
              session_version = COALESCE(session_version, 0) + 1,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(currentAdminId, userId);

        db.prepare(`
          INSERT INTO user_moderation_logs (
            id, user_id, tenant_id, action, reason_code, reason_details,
            performed_by_user_id, performed_by_name, metadata_json, created_at
          ) VALUES (?, ?, ?, 'block_user', 'invalid_phone', 'Suspensão vinculada à solicitação de atualização de WhatsApp', ?, ?, ?, datetime('now'))
        `).run(
          uuidv4(),
          userId,
          targetClinicId || null,
          currentAdminId,
          currentAdminName,
          JSON.stringify({ requestId, reason })
        );
      }

      db.prepare(`
        INSERT INTO user_moderation_logs (
          id, user_id, tenant_id, action, reason_code, reason_details,
          performed_by_user_id, performed_by_name, metadata_json, created_at
        ) VALUES (?, ?, ?, 'request_whatsapp_update', 'invalid_phone', ?, ?, ?, ?, datetime('now'))
      `).run(
        uuidv4(),
        userId,
        targetClinicId || null,
        reason.trim(),
        currentAdminId,
        currentAdminName,
        JSON.stringify({ requestId, previousPhone: user.phone, suspendAccess })
      );

      logAudit(req, 'USER_REQUEST_WHATSAPP_UPDATE', 'users', userId, { reason, suspendAccess });

      // Envia notificação por e-mail quando o usuário possui e-mail válido
      // NUNCA envia mensagem para o WhatsApp considerado inválido
      if (user.email && user.email.includes('@')) {
        const appUrl = process.env.APP_URL || 'https://zemda.com.br';
        const html = buildZemdaEmailLayout({
          title: 'Atualização de Telefone/WhatsApp Requerida',
          headline: 'Solicitação de Atualização Cadastral',
          badge: 'Segurança da Conta',
          contentHtml: `
            <p>Olá, <strong>${user.name}</strong>,</p>
            <p>A administração da Plataforma Zemda identificou que o seu número de WhatsApp / telefone precisa ser atualizado.</p>
            <div style="background-color: #f8fafc; border-left: 4px solid #0d9488; padding: 12px 16px; margin: 16px 0; border-radius: 6px;">
              <p style="margin: 0; font-size: 13px; color: #475569;"><strong>Motivo informado:</strong></p>
              <p style="margin: 4px 0 0; font-size: 14px; color: #1e293b;">${reason}</p>
            </div>
            <p>Por favor, acesse a sua conta no Zemda e informe um número válido com DDD para manter suas comunicações e notificações em dia.</p>
          `,
          ctaText: 'Acessar Minha Conta',
          ctaUrl: appUrl
        });

        EmailService.sendCustomEmail(
          user.email,
          '[Zemda] Solicitação de Atualização de WhatsApp / Telefone',
          html
        ).catch(err => {
          console.warn('[UserModerationController.requestWhatsAppUpdate] Falha no envio do e-mail:', err);
        });
      }

      res.json({
        success: true,
        message: 'Solicitação de atualização de WhatsApp registrada com sucesso.'
      });
    } catch (err: any) {
      console.error('[UserModerationController.requestWhatsAppUpdate] Erro:', err);
      res.status(500).json({ error: 'Erro ao registrar solicitação de atualização de WhatsApp' });
    }
  }

  /**
   * Consulta histórico de moderação de um usuário (Exclusivo SuperAdmin)
   */
  static async getUserModerationLogs(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const logs = db.prepare(`
        SELECT id, tenant_id, action, reason_code, reason_details, blocked_until,
               performed_by_user_id, performed_by_name, metadata_json, created_at
        FROM user_moderation_logs
        WHERE user_id = ?
        ORDER BY created_at DESC
      `).all(userId);

      res.json({ logs });
    } catch (err: any) {
      console.error('[UserModerationController.getUserModerationLogs] Erro:', err);
      res.status(500).json({ error: 'Erro ao carregar histórico de moderação' });
    }
  }

  // ==========================================================================
  // OPERAÇÕES DO PRÓPRIO USUÁRIO (Autoatendimento autenticado com authMiddleware)
  // Sem privilégios administrativos.
  // ==========================================================================

  /**
   * Consulta se o usuário logado tem alguma solicitação pendente de atualização de WhatsApp
   */
  static async getMyWhatsAppUpdateRequest(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Usuário não autenticado' });
        return;
      }

      const pendingRequest = db.prepare(`
        SELECT id, reason, previous_phone, suspended_access, created_at
        FROM user_whatsapp_requests
        WHERE user_id = ? AND status IN ('pending', 'awaiting_correction')
        ORDER BY created_at DESC
        LIMIT 1
      `).get(userId) as any;

      res.json({
        hasPending: Boolean(pendingRequest),
        request: pendingRequest || null
      });
    } catch (err: any) {
      console.error('[UserModerationController.getMyWhatsAppUpdateRequest] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar solicitações pendentes' });
    }
  }

  /**
   * O próprio usuário submete um novo número de WhatsApp com DDD.
   * Valida formato, salva com histórico e conclui a solicitação.
   * Apresenta 'Número atualizado — não verificado'.
   * Não realiza desbloqueio automático indevido de contas bloqueadas.
   */
  static async submitMyWhatsAppUpdate(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Usuário não autenticado' });
        return;
      }

      const { phone } = req.body;
      if (!phone || typeof phone !== 'string' || !phone.trim()) {
        res.status(400).json({ error: 'Informe um número de telefone com DDD' });
        return;
      }

      // Validação estrita de formato brasileiro e DDD
      if (!isValidPhoneNumber(phone)) {
        res.status(400).json({ error: 'Número de telefone inválido. Informe um número com DDD válido (ex: (11) 98765-4321)' });
        return;
      }

      const normalized = normalizePhoneWithDDI(phone);
      const user = db.prepare('SELECT id, name, phone, moderation_flag FROM users WHERE id = ?').get(userId) as any;
      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      // Atualiza o telefone do usuário mantendo o histórico
      // Status fica 'unverified' e phone_verified = 0 conforme especificação de segurança
      const newFlag = user.moderation_flag === 'invalid_phone' ? 'clean' : user.moderation_flag;

      db.prepare(`
        UPDATE users
        SET phone = ?,
            phone_verified = 0,
            whatsapp_status = 'unverified',
            moderation_flag = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(normalized, newFlag, userId);

      // Marca as solicitações pendentes como concluídas
      db.prepare(`
        UPDATE user_whatsapp_requests
        SET status = 'completed',
            new_phone = ?,
            resolved_at = datetime('now'),
            updated_at = datetime('now')
        WHERE user_id = ? AND status IN ('pending', 'awaiting_correction')
      `).run(normalized, userId);

      // Registra evento de histórico
      db.prepare(`
        INSERT INTO user_moderation_logs (
          id, user_id, action, reason_code, reason_details,
          performed_by_user_id, performed_by_name, metadata_json, created_at
        ) VALUES (?, ?, 'whatsapp_updated', 'user_updated_phone', 'Número de WhatsApp atualizado pelo próprio usuário no perfil', ?, ?, ?, datetime('now'))
      `).run(
        uuidv4(),
        userId,
        userId,
        user.name,
        JSON.stringify({ previousPhone: user.phone, newPhone: normalized })
      );

      logAudit(req, 'USER_UPDATE_WHATSAPP', 'users', userId, { previousPhone: user.phone, newPhone: normalized });

      res.json({
        success: true,
        message: 'Número atualizado — não verificado.',
        phone: normalized
      });
    } catch (err: any) {
      console.error('[UserModerationController.submitMyWhatsAppUpdate] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar número de WhatsApp' });
    }
  }
}
