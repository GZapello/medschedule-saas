"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = exports.WhatsAppAdapter = exports.SmsAdapter = exports.EmailAdapter = void 0;
const billing_service_1 = require("./billing.service");
const database_1 = require("../config/database");
const uuid_1 = require("uuid");
const error_monitor_service_1 = require("./error-monitor.service");
class EmailAdapter {
    async send(recipient, content, metadata) {
        // Integração desacoplada de E-mail (SMTP / Transacional)
        console.log(`[EmailAdapter] Enviando e-mail para: ${recipient} | Assunto: Lembrete de Consulta Zemda`);
        // Simulação robusta com registro transparente
        return { success: true, externalId: `eml-${Date.now()}` };
    }
}
exports.EmailAdapter = EmailAdapter;
class SmsAdapter {
    async send(recipient, content, metadata) {
        // Integração desacoplada de SMS
        console.log(`[SmsAdapter] Disparando SMS para: ${recipient}`);
        return { success: true, externalId: `sms-${Date.now()}` };
    }
}
exports.SmsAdapter = SmsAdapter;
class WhatsAppAdapter {
    async send(recipient, content, metadata) {
        // Integração desacoplada de WhatsApp Gateway
        console.log(`[WhatsAppAdapter] Enviando mensagem WhatsApp para: ${recipient}`);
        return { success: true, externalId: `wpp-${Date.now()}` };
    }
}
exports.WhatsAppAdapter = WhatsAppAdapter;
class NotificationService {
    static emailAdapter = new EmailAdapter();
    static smsAdapter = new SmsAdapter();
    static whatsAppAdapter = new WhatsAppAdapter();
    static workerTimer = null;
    /**
     * Agenda lembrete de consulta de 1 hora antes (ou imediato se criada faltando menos de 1h)
     */
    static scheduleAppointmentReminder(appointmentId) {
        try {
            const appt = database_1.db.prepare(`
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
        WHERE a.id = ? AND t.status = 'active'
      `).get(appointmentId);
            if (!appt || !(0, billing_service_1.canOperate)(appt.tenant_id) || ['cancelled', 'completed', 'no_show'].includes(appt.status)) {
                return;
            }
            // Calcula data programada: 1 hora antes da consulta
            const apptDate = new Date(appt.start_time);
            const now = new Date();
            const oneHourBefore = new Date(apptDate.getTime() - 60 * 60 * 1000);
            // Regra de segurança (Item 50): se a consulta foi criada faltando menos de 60 minutos, envia imediatamente!
            let scheduledForIso;
            if (oneHourBefore <= now) {
                scheduledForIso = now.toISOString().replace('T', ' ').slice(0, 19);
            }
            else {
                scheduledForIso = oneHourBefore.toISOString().replace('T', ' ').slice(0, 19);
            }
            // Analisa preferências de comunicação do paciente
            let prefs = { email: true, sms: true, whatsapp: true };
            try {
                if (appt.communication_preferences_json) {
                    prefs = { ...prefs, ...JSON.parse(appt.communication_preferences_json) };
                }
            }
            catch (_) { }
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
                const existing = database_1.db.prepare('SELECT id FROM notifications WHERE idempotency_key = ?').get(idempotencyKey);
                if (!existing) {
                    const id = 'not-' + (0, uuid_1.v4)().slice(0, 8);
                    database_1.db.prepare(`
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
                const existing = database_1.db.prepare('SELECT id FROM notifications WHERE idempotency_key = ?').get(idempotencyKey);
                if (!existing) {
                    const id = 'not-' + (0, uuid_1.v4)().slice(0, 8);
                    database_1.db.prepare(`
            INSERT INTO notifications (
              id, tenant_id, patient_id, professional_id, appointment_id,
              type, channel, recipient, content, status, scheduled_for,
              idempotency_key, retry_count
            )
            VALUES (?, ?, ?, ?, ?, 'reminder_1h', 'email', ?, ?, 'pending', ?, ?, 0)
          `).run(id, appt.tenant_id, appt.patient_id, appt.professional_id, appt.id, appt.patient_email, messageContent, scheduledForIso, idempotencyKey);
                }
            }
        }
        catch (err) {
            console.error('[NotificationService.scheduleAppointmentReminder] Erro:', err);
        }
    }
    /**
     * Cancela lembretes pendentes de uma consulta (reagendamento ou cancelamento)
     */
    static cancelAppointmentReminders(appointmentId) {
        try {
            database_1.db.prepare(`
        UPDATE notifications SET
          status = 'cancelled',
          last_error = 'Consulta reagendada ou cancelada pelo usuário'
        WHERE appointment_id = ? AND status = 'pending'
      `).run(appointmentId);
        }
        catch (err) {
            console.error('[NotificationService.cancelAppointmentReminders] Erro:', err);
        }
    }
    /**
     * Processa itens pendentes da fila respeitando o horário agendado e limite de 3 tentativas
     */
    static async processPendingQueue() {
        try {
            // Localiza mensagens com scheduled_for <= agora e status pending
            const pendingList = database_1.db.prepare(`
        SELECT * FROM notifications
        WHERE status = 'pending' AND scheduled_for <= datetime('now')
        ORDER BY scheduled_for ASC
        LIMIT 25
      `).all();
            if (pendingList.length === 0)
                return 0;
            for (const item of pendingList) {
                if (!(0, billing_service_1.canOperate)(item.tenant_id))
                    continue;
                try {
                    if (!database_1.db.prepare("SELECT 1 FROM notifications n JOIN tenants t ON t.id = n.tenant_id WHERE n.id = ? AND n.status = 'pending' AND t.status = 'active'").get(item.id))
                        continue;
                    // Marca temporariamente como processando
                    database_1.db.prepare("UPDATE notifications SET status = 'processing' WHERE id = ?").run(item.id);
                    let result;
                    if (item.channel === 'email') {
                        result = await this.emailAdapter.send(item.recipient, item.content, { id: item.id });
                    }
                    else if (item.channel === 'sms') {
                        result = await this.smsAdapter.send(item.recipient, item.content, { id: item.id });
                    }
                    else {
                        result = await this.whatsAppAdapter.send(item.recipient, item.content, { id: item.id });
                    }
                    if (result.success) {
                        database_1.db.prepare(`
              UPDATE notifications SET
                status = 'sent',
                delivery_status = 'delivered',
                sent_at = datetime('now'),
                last_error = NULL
              WHERE id = ?
            `).run(item.id);
                    }
                    else {
                        const currentRetries = (item.retry_count || 0) + 1;
                        if (currentRetries >= 3) {
                            // Falha definitiva após 3 tentativas
                            database_1.db.prepare(`
                UPDATE notifications SET
                  status = 'failed',
                  delivery_status = 'failed',
                  retry_count = ?,
                  last_error = ?
                WHERE id = ?
              `).run(currentRetries, result.error || 'Falha após 3 tentativas controladas', item.id);
                        }
                        else {
                            // Reagenda para nova tentativa em 2 minutos
                            database_1.db.prepare(`
                UPDATE notifications SET
                  status = 'pending',
                  retry_count = ?,
                  scheduled_for = datetime('now', '+2 minutes'),
                  last_error = ?
                WHERE id = ?
              `).run(currentRetries, result.error || `Tentativa ${currentRetries} falhou`, item.id);
                        }
                    }
                }
                catch (itemErr) {
                    database_1.db.prepare(`
            UPDATE notifications SET
              status = 'failed',
              last_error = ?
            WHERE id = ?
          `).run(itemErr.message || 'Exceção não tratada ao enviar', item.id);
                }
            }
            return pendingList.length;
        }
        catch (err) {
            console.error('[NotificationService.processPendingQueue] Erro no worker:', err);
            error_monitor_service_1.ErrorMonitor.captureException(err, { source: 'notification-worker' });
            return 0;
        }
    }
    /**
     * Inicia o processamento contínuo em segundo plano (roda no servidor mesmo sem usuário conectado)
     */
    static startBackgroundWorker(intervalMs = 30000) {
        if (this.workerTimer)
            return;
        console.log(`[Zemda Notifications API] Worker de lembretes automáticos iniciado (polling: ${intervalMs / 1000}s)...`);
        // Execução inicial imediata
        this.processPendingQueue().catch(() => { });
        this.workerTimer = setInterval(() => {
            this.processPendingQueue().catch(() => { });
        }, intervalMs);
    }
    static stopBackgroundWorker() {
        if (this.workerTimer) {
            clearInterval(this.workerTimer);
            this.workerTimer = null;
        }
    }
}
exports.NotificationService = NotificationService;
