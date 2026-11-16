import { Request, Response } from 'express';
import { db } from '../config/database';
import { InternalNotificationService } from '../services/internal-notification.service';
import { isUserReceptionOnly } from './report.controller';

function canReceiveInternalBookingNotifications(req: Request, tenantId: string): boolean {
  if (!req.user || !tenantId) return false;
  if (isUserReceptionOnly(req, tenantId)) return false;

  const role = String(req.user.role || '').toLowerCase();
  if (role === 'superadmin') return Boolean(req.isSandboxSession);
  if (role === 'clinic_admin' || role === 'professional') return true;

  try {
    const cu = db
      .prepare('SELECT is_manager, role, status, deactivated_at FROM clinic_users WHERE user_id = ? AND tenant_id = ? LIMIT 1')
      .get(req.user.userId, tenantId) as any;
    if (cu && COALESCE_ACTIVE(cu.status) && !cu.deactivated_at) {
      return cu.is_manager === 1 || ['clinic_admin', 'professional'].includes(String(cu.role || '').toLowerCase());
    }
  } catch (_) {}

  return false;
}

function COALESCE_ACTIVE(status?: string | null): boolean {
  return !status || String(status).toLowerCase() === 'active';
}

export class InternalNotificationController {
  static unreadCount(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId as string;
      const userId = req.user?.userId;
      if (!tenantId || !userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      if (!canReceiveInternalBookingNotifications(req, tenantId)) {
        res.status(403).json({
          error: 'Notificações de agendamento público são destinadas apenas a gestores e profissionais.'
        });
        return;
      }

      const unreadCount = InternalNotificationService.getUnreadCountForUser(tenantId, userId);
      res.json({ unreadCount });
    } catch (err: any) {
      console.error('[InternalNotificationController.unreadCount] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar notificações não lidas' });
    }
  }

  static list(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId as string;
      const userId = req.user?.userId;
      if (!tenantId || !userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      if (!canReceiveInternalBookingNotifications(req, tenantId)) {
        res.status(403).json({
          error: 'Notificações de agendamento público são destinadas apenas a gestores e profissionais.'
        });
        return;
      }

      const limit = Number(req.query.limit) || 30;
      const result = InternalNotificationService.listForUser(tenantId, userId, limit);
      res.json(result);
    } catch (err: any) {
      console.error('[InternalNotificationController.list] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar notificações internas' });
    }
  }

  static markRead(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId as string;
      const userId = req.user?.userId;
      if (!tenantId || !userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      if (!canReceiveInternalBookingNotifications(req, tenantId)) {
        res.status(403).json({
          error: 'Notificações de agendamento público são destinadas apenas a gestores e profissionais.'
        });
        return;
      }

      const { notificationIds, markAll } = req.body || {};
      const result = InternalNotificationService.markReadForUser(tenantId, userId, {
        notificationIds: Array.isArray(notificationIds) ? notificationIds : undefined,
        markAll: Boolean(markAll)
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error('[InternalNotificationController.markRead] Erro:', err);
      res.status(500).json({ error: 'Erro ao marcar notificações como visualizadas' });
    }
  }
}
