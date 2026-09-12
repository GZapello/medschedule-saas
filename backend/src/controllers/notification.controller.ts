import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { NotificationService } from '../services/notification.service';
import { logAudit } from '../middlewares/audit.middleware';

export class NotificationController {
  // 1. Lista histórico e fila de lembretes da clínica
  static list(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { status, channel, limit = 50 } = req.query;

      let query = `
        SELECT 
          n.*,
          pat.full_name as patient_name,
          p.name as professional_name,
          s.name as service_name,
          a.start_time as appointment_start_time
        FROM notifications n
        LEFT JOIN patients pat ON pat.id = n.patient_id
        LEFT JOIN professionals p ON p.id = n.professional_id
        LEFT JOIN appointments a ON a.id = n.appointment_id
        LEFT JOIN services s ON s.id = a.service_id
        WHERE n.tenant_id = ?
      `;

      const params: any[] = [tenantId];

      if (status && typeof status === 'string' && status !== 'all') {
        query += ' AND n.status = ?';
        params.push(status);
      }

      if (channel && typeof channel === 'string' && channel !== 'all') {
        query += ' AND n.channel = ?';
        params.push(channel);
      }

      query += ' ORDER BY n.scheduled_for DESC LIMIT ?';
      params.push(Number(limit) || 50);

      const notifications = db.prepare(query).all(...params);
      res.json(notifications);
    } catch (err: any) {
      console.error('[NotificationController.list] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar lembretes e notificações' });
    }
  }

  // 2. Detalhes de um lembrete
  static getById(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      const notif = db.prepare(`
        SELECT 
          n.*,
          pat.full_name as patient_name,
          p.name as professional_name,
          s.name as service_name,
          a.start_time as appointment_start_time
        FROM notifications n
        LEFT JOIN patients pat ON pat.id = n.patient_id
        LEFT JOIN professionals p ON p.id = n.professional_id
        LEFT JOIN appointments a ON a.id = n.appointment_id
        LEFT JOIN services s ON s.id = a.service_id
        WHERE n.id = ? AND n.tenant_id = ?
      `).get(id, tenantId);

      if (!notif) {
        res.status(404).json({ error: 'Notificação não encontrada' });
        return;
      }

      res.json(notif);
    } catch (err: any) {
      console.error('[NotificationController.getById] Erro:', err);
      res.status(500).json({ error: 'Erro ao buscar notificação' });
    }
  }

  // 3. Agendamento avulso / manual de notificação
  static schedule(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { patientId, appointmentId, professionalId, type, channel, recipient, content, scheduledFor } = req.body;

      if (!recipient || !content) {
        res.status(400).json({ error: 'Destinatário e conteúdo são obrigatórios' });
        return;
      }

      const id = 'not-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO notifications (
          id, tenant_id, patient_id, professional_id, appointment_id,
          type, channel, recipient, content, status, scheduled_for
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', COALESCE(?, datetime('now')))
      `).run(
        id,
        tenantId,
        patientId || null,
        professionalId || null,
        appointmentId || null,
        type || 'reminder_1h',
        channel || 'whatsapp',
        recipient,
        content,
        scheduledFor || null
      );

      logAudit(req, 'SCHEDULE_NOTIFICATION', 'notifications', id, { channel, recipient });
      res.status(201).json({ id, message: 'Notificação agendada com sucesso' });
    } catch (err: any) {
      console.error('[NotificationController.schedule] Erro:', err);
      res.status(500).json({ error: 'Erro ao agendar notificação' });
    }
  }

  // 4. Cancelar lembrete agendado
  static cancel(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      const result = db.prepare(`
        UPDATE notifications SET
          status = 'cancelled',
          last_error = 'Cancelado manualmente pelo operador'
        WHERE id = ? AND tenant_id = ? AND status = 'pending'
      `).run(id, tenantId);

      if (result.changes === 0) {
        res.status(400).json({ error: 'Notificação não está pendente ou não foi encontrada' });
        return;
      }

      logAudit(req, 'CANCEL_NOTIFICATION', 'notifications', id);
      res.json({ message: 'Lembrete cancelado com sucesso' });
    } catch (err: any) {
      console.error('[NotificationController.cancel] Erro:', err);
      res.status(500).json({ error: 'Erro ao cancelar notificação' });
    }
  }

  // 5. Reprocessar notificação com falha
  static retry(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      const result = db.prepare(`
        UPDATE notifications SET
          status = 'pending',
          retry_count = 0,
          scheduled_for = datetime('now'),
          last_error = NULL
        WHERE id = ? AND tenant_id = ?
      `).run(id, tenantId);

      if (result.changes === 0) {
        res.status(404).json({ error: 'Notificação não encontrada' });
        return;
      }

      logAudit(req, 'RETRY_NOTIFICATION', 'notifications', id);
      // Dispara o worker imediatamente para atender à solicitação
      NotificationService.processPendingQueue().catch(() => {});

      res.json({ message: 'Tentativa de reenvio iniciada imediatamente' });
    } catch (err: any) {
      console.error('[NotificationController.retry] Erro:', err);
      res.status(500).json({ error: 'Erro ao reenviar notificação' });
    }
  }
}
