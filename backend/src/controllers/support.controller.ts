import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';

export class SupportController {
  // Listar chamados: SuperAdmin visualiza todos; usuário comum visualiza apenas os próprios chamados
  static list(req: Request, res: Response): void {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, error: 'Usuário não autenticado' });
        return;
      }

      const isSuper = user.role === 'superadmin';
      const { status, priority, category } = req.query;
      let query = `
        SELECT 
          t.id, t.tenant_id, t.user_id, t.title, t.category, t.description, t.priority,
          t.attachments_json, t.app_version, t.platform, t.status, t.created_at, t.updated_at,
          u.name as user_name, u.email as user_email, u.role as user_role,
          ten.name as clinic_name, ten.slug as clinic_slug
        FROM support_tickets t
        LEFT JOIN users u ON u.id = t.user_id
        LEFT JOIN tenants ten ON ten.id = t.tenant_id
        WHERE 1=1
      `;
      const params: any[] = [];

      // Usuários comuns visualizam apenas seus próprios chamados
      if (!isSuper) {
        query += ' AND t.user_id = ?';
        params.push(user.userId);
        const tenantId = req.tenantId || user.tenantId;
        if (tenantId) {
          query += ' AND (t.tenant_id = ? OR t.tenant_id IS NULL)';
          params.push(tenantId);
        }
      }

      if (status) {
        query += ' AND t.status = ?';
        params.push(status);
      }
      if (priority) {
        query += ' AND t.priority = ?';
        params.push(priority);
      }
      if (category) {
        query += ' AND t.category = ?';
        params.push(category);
      }

      query += ' ORDER BY t.created_at DESC';

      const tickets = db.prepare(query).all(...params);
      res.json(tickets);
    } catch (err: any) {
      console.error('[SupportController.list] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar chamados de suporte' });
    }
  }

  // Detalhes do chamado e mensagens associadas (SuperAdmin ou proprietário do chamado)
  static getById(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, error: 'Usuário não autenticado' });
        return;
      }

      const ticket = db.prepare(`
        SELECT 
          t.id, t.tenant_id, t.user_id, t.title, t.category, t.description, t.priority,
          t.attachments_json, t.app_version, t.platform, t.status, t.created_at, t.updated_at,
          u.name as user_name, u.email as user_email, u.role as user_role,
          ten.name as clinic_name, ten.slug as clinic_slug
        FROM support_tickets t
        LEFT JOIN users u ON u.id = t.user_id
        LEFT JOIN tenants ten ON ten.id = t.tenant_id
        WHERE t.id = ?
      `).get(id) as any;

      if (!ticket) {
        res.status(404).json({ success: false, error: 'Chamado não encontrado' });
        return;
      }

      const isSuper = user.role === 'superadmin';
      // Isolamento: se não for SuperAdmin, usuário só pode acessar o próprio chamado
      if (!isSuper) {
        const userTenant = req.tenantId || user.tenantId;
        const tenantMatches = !ticket.tenant_id || !userTenant || ticket.tenant_id === userTenant;
        if (ticket.user_id !== user.userId || !tenantMatches) {
          res.status(403).json({ success: false, error: 'Você não possui permissão para acessar este chamado.' });
          return;
        }
      }

      let msgQuery = `
        SELECT 
          m.id, m.ticket_id, m.user_id, m.message, m.attachments_json, m.is_internal, m.created_at,
          u.name as sender_name, u.role as sender_role
        FROM support_ticket_messages m
        JOIN users u ON u.id = m.user_id
        WHERE m.ticket_id = ?
      `;
      if (!isSuper) {
        msgQuery += ' AND m.is_internal = 0';
      }
      msgQuery += ' ORDER BY m.created_at ASC';

      const messages = db.prepare(msgQuery).all(id);

      res.json({ success: true, ticket, messages });
    } catch (err: any) {
      console.error('[SupportController.getById] Erro:', err);
      res.status(500).json({ success: false, error: 'Erro ao obter detalhes do chamado' });
    }
  }

  // Criar novo chamado (Disponível para qualquer usuário autenticado)
  static create(req: Request, res: Response): void {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, error: 'Usuário não autenticado' });
        return;
      }

      const { title, category, description, priority, attachments, appVersion, platform } = req.body;

      if (!title || !description) {
        res.status(400).json({ success: false, error: 'Título e descrição são obrigatórios para abrir um chamado' });
        return;
      }

      const ticketId = 'tkt-' + uuidv4().slice(0, 8);
      const attachmentsJson = Array.isArray(attachments) ? JSON.stringify(attachments) : null;
      const tenantId = req.tenantId || user.tenantId || null;

      db.prepare(`
        INSERT INTO support_tickets (
          id, tenant_id, user_id, title, category, description, priority,
          attachments_json, app_version, platform, status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', datetime('now'), datetime('now'))
      `).run(
        ticketId,
        tenantId,
        user.userId,
        title.trim(),
        category || 'duvida',
        description.trim(),
        priority || 'medium',
        attachmentsJson,
        appVersion || '1.1.2',
        platform || 'Web'
      );

      logAudit(req, 'CREATE_SUPPORT_TICKET', 'support_tickets', ticketId, { title, priority });

      res.status(201).json({
        id: ticketId,
        message: 'Chamado de suporte aberto com sucesso. Nossa equipe administrativa analisará a solicitação.',
        status: 'open'
      });
    } catch (err: any) {
      console.error('[SupportController.create] Erro:', err);
      res.status(500).json({ error: 'Erro ao abrir chamado de suporte' });
    }
  }

  // Adicionar mensagem / resposta no chamado (SuperAdmin ou proprietário do chamado)
  static addMessage(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, error: 'Usuário não autenticado' });
        return;
      }

      const { message, attachments, isInternal } = req.body;
      if (!message || !message.trim()) {
        res.status(400).json({ success: false, error: 'Mensagem não pode ser vazia' });
        return;
      }

      const ticket = db.prepare('SELECT id, tenant_id, user_id, status FROM support_tickets WHERE id = ?').get(id) as any;
      if (!ticket) {
        res.status(404).json({ success: false, error: 'Chamado não encontrado' });
        return;
      }

      const isSuper = user.role === 'superadmin';
      if (!isSuper) {
        const userTenant = req.tenantId || user.tenantId;
        const tenantMatches = !ticket.tenant_id || !userTenant || ticket.tenant_id === userTenant;
        if (ticket.user_id !== user.userId || !tenantMatches) {
          res.status(403).json({ success: false, error: 'Você não possui permissão para responder a este chamado.' });
          return;
        }
      }

      const messageId = 'msg-' + uuidv4().slice(0, 8);
      const attachmentsJson = Array.isArray(attachments) ? JSON.stringify(attachments) : null;
      const shouldBeInternal = isSuper && isInternal ? 1 : 0;

      db.prepare(`
        INSERT INTO support_ticket_messages (id, ticket_id, user_id, message, attachments_json, is_internal, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(messageId, id, user.userId, message.trim(), attachmentsJson, shouldBeInternal);

      // Atualiza timestamp de última atualização do chamado
      db.prepare("UPDATE support_tickets SET updated_at = datetime('now') WHERE id = ?").run(id);

      res.status(201).json({ success: true, id: messageId, message: 'Resposta registrada com sucesso' });
    } catch (err: any) {
      console.error('[SupportController.addMessage] Erro:', err);
      res.status(500).json({ success: false, error: 'Erro ao enviar resposta no chamado' });
    }
  }

  // Atualizar status do chamado (Exclusivo SuperAdmin)
  static updateStatus(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const user = req.user;

      if (!user || user.role !== 'superadmin') {
        res.status(403).json({ success: false, error: 'Você não possui permissão para acessar esta área.' });
        return;
      }

      const allowedStatuses = ['open', 'analyzing', 'in_progress', 'resolved', 'closed'];
      if (!allowedStatuses.includes(status)) {
        res.status(400).json({ success: false, error: `Status inválido. Permitidos: ${allowedStatuses.join(', ')}` });
        return;
      }

      db.prepare(`
        UPDATE support_tickets SET status = ?, updated_at = datetime('now') WHERE id = ?
      `).run(status, id);

      logAudit(req, 'UPDATE_TICKET_STATUS', 'support_tickets', id, { status });
      res.json({ success: true, message: 'Status do chamado atualizado com sucesso', status });
    } catch (err: any) {
      console.error('[SupportController.updateStatus] Erro:', err);
      res.status(500).json({ success: false, error: 'Erro ao atualizar status do chamado' });
    }
  }
}
