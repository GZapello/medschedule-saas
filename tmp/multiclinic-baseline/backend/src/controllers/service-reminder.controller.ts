import { Request, Response } from 'express';
import { db } from '../config/database';
import { ServiceReminderService } from '../services/service-reminder.service';
import { logAudit } from '../middlewares/audit.middleware';

export class ServiceReminderController {
  private static resolveProfessionalId(req: Request): string | null {
    const tenantId = req.tenantId;
    if (!tenantId || !req.user) return null;

    // Se profissional, sempre busca o próprio perfil
    const userProf = db.prepare(`
      SELECT id FROM professionals
      WHERE user_id = ? AND tenant_id = ? AND active = 1
    `).get(req.user.userId, tenantId) as any;

    if (userProf?.id) {
      return userProf.id;
    }

    // Se admin e passou query param específico
    if (req.user.role === 'clinic_admin' && req.query.professionalId && typeof req.query.professionalId === 'string') {
      return req.query.professionalId;
    }

    // Se solo admin (único profissional cadastrado na clínica)
    if (req.user.role === 'clinic_admin') {
      const allProfs = db.prepare(`
        SELECT id FROM professionals
        WHERE tenant_id = ? AND active = 1
      `).all(tenantId) as any[];

      if (allProfs.length === 1) {
        return allProfs[0].id;
      }
    }

    return null;
  }

  static list(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const professionalId = ServiceReminderController.resolveProfessionalId(req);
      if (!professionalId) {
        // Usuário administrativo sem perfil profissional associado não recebe lembretes clínicos de terceiros
        res.json([]);
        return;
      }

      const status = typeof req.query.status === 'string' ? req.query.status : 'active';
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const offset = req.query.offset ? Number(req.query.offset) : undefined;

      const reminders = ServiceReminderService.listReminders(tenantId, professionalId, {
        status,
        limit,
        offset
      });

      res.json(reminders);
    } catch (err: any) {
      console.error('[ServiceReminderController.list] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar lembretes de contato' });
    }
  }

  static complete(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const id = String(req.params.id);
      if (!tenantId || !id) {
        res.status(400).json({ error: 'Parâmetros incompletos' });
        return;
      }

      const professionalId = ServiceReminderController.resolveProfessionalId(req);
      // Se não for admin, garante restrição de escopo por profissional
      const scopeProfId = req.user?.role === 'clinic_admin' ? undefined : (professionalId || undefined);

      ServiceReminderService.completeReminder(id, tenantId, scopeProfId);

      logAudit(req, 'COMPLETE_SERVICE_REMINDER', 'service_reminders', id, { reminderId: id });
      res.json({ success: true, message: 'Lembrete concluído com sucesso' });
    } catch (err: any) {
      console.error('[ServiceReminderController.complete] Erro:', err);
      res.status(400).json({ error: err.message || 'Erro ao concluir lembrete' });
    }
  }

  static postpone(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const id = String(req.params.id);
      const { newDueDate, notes } = req.body;

      if (!tenantId || !id || !newDueDate) {
        res.status(400).json({ error: 'Data de retorno é obrigatória' });
        return;
      }

      const professionalId = ServiceReminderController.resolveProfessionalId(req);
      const scopeProfId = req.user?.role === 'clinic_admin' ? undefined : (professionalId || undefined);

      const result = ServiceReminderService.postponeReminder(id, tenantId, newDueDate, notes, scopeProfId);

      logAudit(req, 'POSTPONE_SERVICE_REMINDER', 'service_reminders', id, { reminderId: id, newDueDate });
      res.json({ success: true, message: 'Lembrete adiado com sucesso', newDueDate: result.newDueDate });
    } catch (err: any) {
      console.error('[ServiceReminderController.postpone] Erro:', err);
      res.status(400).json({ error: err.message || 'Erro ao adiar lembrete' });
    }
  }
}
