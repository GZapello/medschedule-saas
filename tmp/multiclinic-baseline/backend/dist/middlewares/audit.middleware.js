"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAudit = logAudit;
const database_1 = require("../config/database");
const uuid_1 = require("uuid");
function logAudit(req, action, entity, entityId, details) {
    try {
        const id = (0, uuid_1.v4)();
        const tenantId = req.tenantId || (req.user ? req.user.tenantId : null);
        const userId = req.user ? req.user.userId : null;
        const ipAddress = (req.headers && req.headers['x-forwarded-for']) || req.socket?.remoteAddress || req.ip || '127.0.0.1';
        const userAgent = (req.headers && req.headers['user-agent']) || 'Unknown';
        const detailsJson = details ? JSON.stringify(details) : null;
        const normalizedEntityId = Array.isArray(entityId) ? entityId[0] : (entityId || null);
        const stmt = database_1.db.prepare(`
      INSERT INTO audit_logs (id, tenant_id, user_id, action, entity, entity_id, ip_address, user_agent, details_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(id, tenantId, userId, action, entity, normalizedEntityId, ipAddress, userAgent, detailsJson);
    }
    catch (err) {
        console.error('[AuditLog] Erro ao registrar log de auditoria:', err);
    }
}
