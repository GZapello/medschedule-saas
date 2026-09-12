import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export interface NotificationPayload {
  tenantId: string;
  patientId: string;
  professionalId?: string;
  appointmentId?: string;
  type: 'reminder_1h' | 'confirmation' | 'cancellation' | 'reschedule';
  channel: 'email' | 'sms' | 'whatsapp';
  recipient: string;
  content: string;
  scheduledFor: string;
  idempotencyKey?: string;
}

// 1. Interfaces e Adaptadores Desacoplados de Envio
export interface NotificationChannelAdapter {
  send(recipient: string, content: string, metadata?: any): Promise<{ success: boolean; externalId?: string; error?: string }>;
}

export class EmailAdapter implements NotificationChannelAdapter {
  async send(recipient: string, content: string, metadata?: any) {
    // Integração desacoplada de E-mail (SMTP / Transacional)
    console.log(`[EmailAdapter] Enviando e-mail para: ${recipient} | Assunto: Lembrete de Consulta Zemda`);
    // Simulação robusta com registro transparente
    return { success: true, externalId: `eml-${Date.now()}` };
  }
}

export class SmsAdapter implements NotificationChannelAdapter {
  async send(recipient: string, content: string, metadata?: any) {
    // Integração desacoplada de SMS
    console.log(`[SmsAdapter] Disparando SMS para: ${recipient}`);
    return { success: true, externalId: `sms-${Date.now()}` };
  }
}

export class WhatsAppAdapter implements NotificationChannelAdapter {
  async send(recipient: string, content: string, metadata?: any) {
    // Integração desacoplada de WhatsApp Gateway
    console.log(`[WhatsAppAdapter] Enviando mensagem WhatsApp para: ${recipient}`);
    return { success: true, externalId: `wpp-${Date.now()}` };
  }
}

export class NotificationService {
  private static emailAdapter = new EmailAdapter();
  private static smsAdapter = new SmsAdapter();
  private static whatsAppAdapter = new WhatsAppAdapter();
  private static workerTimer: NodeJS.Timeout | null = null;

  /**
   * Agenda lembrete de consulta de 1 hora antes (ou imediato se criada faltando menos de 1h)
   */
  static scheduleAppointmentReminder(appointmentId: string): void {
    try {
      const appt = db.prepare(`
        SELECT 
          a.id, a.tenant_id, a.patient_id, a.professional_id, a.service_id, a.start_time, a.status,
          pat.full_name as patient_name, pat.phone as patient_phone, pat.email as patient_email,
          pat.communication_preferences_json,
          p.name as professional_name,
          s.name as service_name,
          t.name as clinic_name
        FROM appointments a
        JOIN patients pat ON pat.id = a.patient_id
        JOIN professionals p ON p.id = a.professional_id
        JOIN services s ON s.id = a.service_id
        JOIN tenants t ON t.id = a.tenant_id
        WHERE a.id = ?
      `).get(appointmentId) as any;

      if (!appt || ['cancelled', 'completed', 'no_show'].includes(appt.status)) {
        return;
      }

      // Calcula data programada: 1 hora antes da consulta
      const apptDate = new Date(appt.start_time);
      const now = new Date();
      const oneHourBefore = new Date(apptDate.getTime() - 60 * 60 * 1000);

      // Regra de segurança (Item 50): se a consulta foi criada faltando menos de 60 minutos, envia imediatamente!
      let scheduledForIso: string;
      if (oneHourBefore <= now) {
        scheduledForIso = now.toISOString().replace('T', ' ').slice(0, 19);
      } else {
        scheduledForIso = oneHourBefore.toISOString().replace('T', ' ').slice(0, 19);
      }

      // Analisa preferências de comunicação do paciente
      let prefs = { email: true, sms: true, whatsapp: true };
      try {
        if (appt.communication_preferences_json) {
          prefs = { ...prefs, ...JSON.parse(appt.communication_preferences_json) };
        }
      } catch (_) {}

      // Formata data e hora amigáveis
      const dateFormatted = apptDate.toLocaleDateString('pt-BR');
      const timeFormatted = appt.start_time.includes('T') ? appt.start_time.split('T')[1].slice(0, 5) : '00:00';

      // Modelo de mensagem seguro e desprovido de dados clínicos sensíveis (Item 29 & 32)
      const messageContent = `Olá, ${appt.patient_name}! Este é um lembrete da sua consulta na ${appt.clinic_name}.\n\n` +
        `🗓 Data: ${dateFormatted}\n` +
        `⏰ Horário: ${timeFormatted}\n` +
        `👨‍⚕️ Profissional: ${appt.professional_name}\n` +
        `📋 Serviço: ${appt.service_name}\n\n` +
        `Esperamos por você! Em caso de imprevisto, avise a clínica com antecedência.`;

      // 1. Canal WhatsApp ou SMS se possuir telefone
      if (appt.patient_phone && (prefs.whatsapp || prefs.sms)) {
        const channel = prefs.whatsapp ? 'whatsapp' : 'sms';
        const idempotencyKey = `REMINDER-1H-${appt.id}-${channel}`;

        const existing = db.prepare('SELECT id FROM notifications WHERE idempotency_key = ?').get(idempotencyKey) as any;
        if (!existing) {
          const id = 'not-' + uuidv4().slice(0, 8);
          db.prepare(`
            INSERT INTO notifications (
              id, tenant_id, patient_id, professional_id, appointment_id,
              type, channel, recipient, content, status, scheduled_for,
              idempotency_key, retry_count
            )
            VALUES (?, ?, ?, ?, ?, 'reminder_1h', ?, ?, ?, 'pending', ?, ?, 0)
          `).run(id, appt.tenant_id, appt.patient_id, appt.professional_id, appt.id, channel, appt.patient_phone, messageContent, scheduledForIso, idempotencyKey);
        }
      }

      // 2. Canal E-mail se possuir e-mail válido
      if (appt.patient_email && appt.patient_email.includes('@') && prefs.email) {
        const idempotencyKey = `REMINDER-1H-${appt.id}-email`;
        const existing = db.prepare('SELECT id FROM notifications WHERE idempotency_key = ?').get(idempotencyKey) as any;
        if (!existing) {
          const id = 'not-' + uuidv4().slice(0, 8);
          db.prepare(`
            INSERT INTO notifications (
              id, tenant_id, patient_id, professional_id, appointment_id,
              type, channel, recipient, content, status, scheduled_for,
              idempotency_key, retry_count
            )
            VALUES (?, ?, ?, ?, ?, 'reminder_1h', 'email', ?, ?, 'pending', ?, ?, 0)
          `).run(id, appt.tenant_id, appt.patient_id, appt.professional_id, appt.id, appt.patient_email, messageContent, scheduledForIso, idempotencyKey);
        }
      }
    } catch (err: any) {
      console.error('[NotificationService.scheduleAppointmentReminder] Erro:', err);
    }
  }

  /**
   * Cancela lembretes pendentes de uma consulta (reagendamento ou cancelamento)
   */
  static cancelAppointmentReminders(appointmentId: string): void {
    try {
      db.prepare(`
        UPDATE notifications SET
          status = 'cancelled',
          last_error = 'Consulta reagendada ou cancelada pelo usuário'
        WHERE appointment_id = ? AND status = 'pending'
      `).run(appointmentId);
    } catch (err: any) {
      console.error('[NotificationService.cancelAppointmentReminders] Erro:', err);
    }
  }

  /**
   * Processa itens pendentes da fila respeitando o horário agendado e limite de 3 tentativas
   */
  static async processPendingQueue(): Promise<number> {
    try {
      // Localiza mensagens com scheduled_for <= agora e status pending
      const pendingList = db.prepare(`
        SELECT * FROM notifications
        WHERE status = 'pending' AND scheduled_for <= datetime('now')
        ORDER BY scheduled_for ASC
        LIMIT 25
      `).all() as any[];

      if (pendingList.length === 0) return 0;

      for (const item of pendingList) {
        try {
          // Marca temporariamente como processando
          db.prepare("UPDATE notifications SET status = 'processing' WHERE id = ?").run(item.id);

          let result: { success: boolean; externalId?: string; error?: string };

          if (item.channel === 'email') {
            result = await this.emailAdapter.send(item.recipient, item.content, { id: item.id });
          } else if (item.channel === 'sms') {
            result = await this.smsAdapter.send(item.recipient, item.content, { id: item.id });
          } else {
            result = await this.whatsAppAdapter.send(item.recipient, item.content, { id: item.id });
          }

          if (result.success) {
            db.prepare(`
              UPDATE notifications SET
                status = 'sent',
                delivery_status = 'delivered',
                sent_at = datetime('now'),
                last_error = NULL
              WHERE id = ?
            `).run(item.id);
          } else {
            const currentRetries = (item.retry_count || 0) + 1;
            if (currentRetries >= 3) {
              // Falha definitiva após 3 tentativas
              db.prepare(`
                UPDATE notifications SET
                  status = 'failed',
                  delivery_status = 'failed',
                  retry_count = ?,
                  last_error = ?
                WHERE id = ?
              `).run(currentRetries, result.error || 'Falha após 3 tentativas controladas', item.id);
            } else {
              // Reagenda para nova tentativa em 2 minutos
              db.prepare(`
                UPDATE notifications SET
                  status = 'pending',
                  retry_count = ?,
                  scheduled_for = datetime('now', '+2 minutes'),
                  last_error = ?
                WHERE id = ?
              `).run(currentRetries, result.error || `Tentativa ${currentRetries} falhou`, item.id);
            }
          }
        } catch (itemErr: any) {
          db.prepare(`
            UPDATE notifications SET
              status = 'failed',
              last_error = ?
            WHERE id = ?
          `).run(itemErr.message || 'Exceção não tratada ao enviar', item.id);
        }
      }

      return pendingList.length;
    } catch (err: any) {
      console.error('[NotificationService.processPendingQueue] Erro no worker:', err);
      return 0;
    }
  }

  /**
   * Inicia o processamento contínuo em segundo plano (roda no servidor mesmo sem usuário conectado)
   */
  static startBackgroundWorker(intervalMs: number = 30000): void {
    if (this.workerTimer) return;
    console.log(`[Zemda Notifications API] Worker de lembretes automáticos iniciado (polling: ${intervalMs / 1000}s)...`);
    
    // Execução inicial imediata
    this.processPendingQueue().catch(() => {});

    this.workerTimer = setInterval(() => {
      this.processPendingQueue().catch(() => {});
    }, intervalMs);
  }

  static stopBackgroundWorker(): void {
    if (this.workerTimer) {
      clearInterval(this.workerTimer);
      this.workerTimer = null;
    }
  }
}
