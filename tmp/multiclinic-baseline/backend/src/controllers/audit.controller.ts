import { Request, Response } from 'express';
import { db } from '../config/database';

export class AuditController {
  static list(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { entity, action, limit = 50 } = req.query;

      let query = `
        SELECT 
          a.id, a.tenant_id, a.user_id, a.action, a.entity, a.entity_id,
          a.ip_address, a.user_agent, a.details_json, a.created_at,
          u.name as user_name, u.email as user_email, u.role as user_role
        FROM audit_logs a
        LEFT JOIN users u ON u.id = a.user_id
        WHERE 1=1
      `;
      const params: any[] = [];

      // Se não for superadmin, restringe ao tenant atual
      if (req.user && req.user.role !== 'superadmin') {
        query += ' AND a.tenant_id = ?';
        params.push(tenantId);
      } else if (tenantId) {
        query += ' AND (a.tenant_id = ? OR a.tenant_id IS NULL)';
        params.push(tenantId);
      }

      if (entity) {
        query += ' AND a.entity = ?';
        params.push(entity);
      }

      if (action) {
        query += ' AND a.action = ?';
        params.push(action);
      }

      query += ' ORDER BY a.created_at DESC LIMIT ?';
      params.push(Number(limit));

      const stmt = db.prepare(query);
      const logs = stmt.all(...params);

      res.json(logs);
    } catch (err: any) {
      console.error('[AuditController.list] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar logs de auditoria' });
    }
  }
}
