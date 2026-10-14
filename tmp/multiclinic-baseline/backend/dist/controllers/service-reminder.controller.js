"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceReminderController = void 0;
const database_1 = require("../config/database");
const service_reminder_service_1 = require("../services/service-reminder.service");
const audit_middleware_1 = require("../middlewares/audit.middleware");
class ServiceReminderController {
    static resolveProfessionalId(req) {
        const tenantId = req.tenantId;
        if (!tenantId || !req.user)
            return null;
        // Se profissional, sempre busca o próprio perfil
        const userProf = database_1.db.prepare(`
      SELECT id FROM professionals
      WHERE user_id = ? AND tenant_id = ? AND active = 1
    `).get(req.user.userId, tenantId);
        if (userProf?.id) {
            return userProf.id;
        }
        // Se admin e passou query param específico
        if (req.user.role === 'clinic_admin' && req.query.professionalId && typeof req.query.professionalId === 'string') {
            return req.query.professionalId;
        }
        // Se solo admin (único profissional cadastrado na clínica)
        if (req.user.role === 'clinic_admin') {
            const allProfs = database_1.db.prepare(`
        SELECT id FROM professionals
        WHERE tenant_id = ? AND active = 1
      `).all(tenantId);
            if (allProfs.length === 1) {
                return allProfs[0].id;
            }
        }
        return null;
    }
    static list(req, res) {
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
            const reminders = service_reminder_service_1.ServiceReminderService.listReminders(tenantId, professionalId, {
                status,
                limit,
                offset
            });
            res.json(reminders);
        }
        catch (err) {
            console.error('[ServiceReminderController.list] Erro:', err);
            res.status(500).json({ error: 'Erro ao listar lembretes de contato' });
        }
    }
    static complete(req, res) {
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
            service_reminder_service_1.ServiceReminderService.completeReminder(id, tenantId, scopeProfId);
            (0, audit_middleware_1.logAudit)(req, 'COMPLETE_SERVICE_REMINDER', 'service_reminders', id, { reminderId: id });
            res.json({ success: true, message: 'Lembrete concluído com sucesso' });
        }
        catch (err) {
            console.error('[ServiceReminderController.complete] Erro:', err);
            res.status(400).json({ error: err.message || 'Erro ao concluir lembrete' });
        }
    }
    static postpone(req, res) {
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
            const result = service_reminder_service_1.ServiceReminderService.postponeReminder(id, tenantId, newDueDate, notes, scopeProfId);
            (0, audit_middleware_1.logAudit)(req, 'POSTPONE_SERVICE_REMINDER', 'service_reminders', id, { reminderId: id, newDueDate });
            res.json({ success: true, message: 'Lembrete adiado com sucesso', newDueDate: result.newDueDate });
        }
        catch (err) {
            console.error('[ServiceReminderController.postpone] Erro:', err);
            res.status(400).json({ error: err.message || 'Erro ao adiar lembrete' });
        }
    }
}
exports.ServiceReminderController = ServiceReminderController;
