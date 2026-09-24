import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';
import { EmailService } from '../services/email.service';
import { buildZemdaEmailLayout } from '../services/email-template.service';

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

      // Notificação imediata por e-mail para a equipe de suporte
      try {
        const superadmin = db.prepare("SELECT email FROM users WHERE role = 'superadmin' LIMIT 1").get() as any;
        const adminEmail = superadmin?.email || process.env.SUPPORT_EMAIL || 'suporte@zemda.com.br';
        if (adminEmail) {
          EmailService.sendCustomEmail(
            adminEmail,
            `[Suporte] Novo chamado #${ticketId}: ${title.trim()}`,
            buildZemdaEmailLayout({
              title: 'Novo Chamado Aberto',
              headline: 'Novo chamado aberto no suporte',
              badge: 'Central de Chamados',
              contentHtml: `
                <p style="margin: 0 0 16px; font-size: 16px; line-height: 24px; color: #334155;">
                  Um novo chamado foi aberto por <strong>${user.name || 'Usuário'}</strong> (${user.email || ''}).
                </p>
                <p style="margin: 0 0 8px; font-size: 14px; font-weight: bold; color: #1e293b;">
                  Título: ${title.trim()}
                </p>
                <div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 14px 18px; margin: 0 0 24px; border-radius: 6px; font-size: 14px; color: #1e293b; line-height: 22px;">
                  <em>"${description.trim()}"</em>
                </div>
              `,
              ctaText: 'Acessar Central de Suporte',
              ctaUrl: 'https://app.zemda.com.br'
            })
          ).catch(e => console.error('[SupportEmail] Erro ao notificar novo chamado:', e));
        }
      } catch (e) {
        console.error('[SupportEmail] Erro no disparo de novo chamado:', e);
      }

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

      // Trava conversa após resolução / fechamento (Itens 18 e 19)
      if (ticket.status === 'resolved' || ticket.status === 'closed') {
        res.status(400).json({
          success: false,
          error: 'Este chamado está encerrado/resolvido e não aceita novas mensagens ou anexos. Para novo atendimento, abra um novo chamado.'
        });
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

      // Prevenção de duplicidade: checar se mensagem idêntica foi salva nos últimos 3 segundos
      const recentDup = db.prepare(`
        SELECT id FROM support_ticket_messages
        WHERE ticket_id = ? AND user_id = ? AND message = ?
          AND datetime(created_at) >= datetime('now', '-3 seconds')
        LIMIT 1
      `).get(id, user.userId, message.trim()) as any;

      if (recentDup) {
        res.status(200).json({ success: true, id: recentDup.id, message: 'Resposta já registrada' });
        return;
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

      // Notificação por e-mail da nova mensagem (Item 16 e Item 4)
      try {
        const ticketFull = db.prepare(`
          SELECT t.id, t.title, t.tenant_id, u.email as creator_email, u.name as creator_name,
                 u.role as creator_role, ten.name as clinic_name
          FROM support_tickets t
          LEFT JOIN users u ON u.id = t.user_id
          LEFT JOIN tenants ten ON ten.id = t.tenant_id
          WHERE t.id = ?
        `).get(id) as any;

        const roleLabels: Record<string, string> = {
          superadmin: 'SuperAdmin',
          clinic_admin: 'Administrador da Clínica',
          professional: 'Profissional de Saúde',
          receptionist: 'Recepcionista',
          patient: 'Paciente / Aluno'
        };
        const senderRoleLabel = roleLabels[user.role] || user.role || 'Usuário';
        const senderName = user.name || (isSuper ? 'Suporte Técnico Zemda' : 'Usuário');
        const clinicName = ticketFull?.clinic_name || 'Clínica Geral';
        const formattedDate = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const appBaseUrl = process.env.FRONTEND_URL || 'https://app.zemda.com.br';
        const ticketDirectUrl = `${appBaseUrl}/?view=support&ticketId=${id}`;
        const snippet = message.trim().length > 180 ? `${message.trim().slice(0, 180)}...` : message.trim();

        if (isSuper && !shouldBeInternal) {
          // Suporte/admin respondeu -> notifica o usuário criador
          if (ticketFull?.creator_email) {
            const bodyHtml = `
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 24px; color: #334155;">
                Olá, <strong>${ticketFull.creator_name || 'Usuário'}</strong>.
              </p>
              <p style="margin: 0 0 20px; font-size: 14px; line-height: 22px; color: #475569;">
                A equipe de suporte respondeu ao seu chamado <strong>#${id}</strong> ("${ticketFull.title}"):
              </p>
              <div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 14px 18px; margin: 0 0 24px; border-radius: 6px; font-size: 14px; color: #1e293b; line-height: 22px;">
                <em>"${snippet}"</em>
              </div>
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 20px; color: #64748b;">
                Acesse o painel do Zemda para visualizar a resposta completa ou enviar novas informações.
              </p>
            `;
            EmailService.sendCustomEmail(
              ticketFull.creator_email,
              `Nova resposta no chamado #${id}: ${ticketFull.title}`,
              buildZemdaEmailLayout({
                title: 'Nova Resposta no Chamado',
                headline: 'Nova resposta da equipe de suporte',
                badge: 'Suporte Zemda',
                contentHtml: bodyHtml,
                ctaText: 'Ver Chamado no Painel',
                ctaUrl: ticketDirectUrl
              })
            ).catch(err => console.error('[SupportEmail] Erro ao notificar usuário:', err));
          }
        } else if (!isSuper) {
          // Usuário enviou -> notifica superadmin / equipe com todos os metadados requeridos
          const superadmin = db.prepare("SELECT email FROM users WHERE role = 'superadmin' LIMIT 1").get() as any;
          const adminEmail = superadmin?.email || process.env.SUPPORT_EMAIL || 'suporte@zemda.com.br';
          if (adminEmail) {
            const bodyHtml = `
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 22px; color: #334155;">
                Nova mensagem recebida no chamado de suporte <strong>#${id}</strong>:
              </p>
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 0 0 20px;">
                <p style="margin: 0 0 8px; font-size: 13px; color: #475569;"><strong>ID do Chamado:</strong> #${id}</p>
                <p style="margin: 0 0 8px; font-size: 13px; color: #475569;"><strong>Assunto:</strong> ${ticketFull?.title || 'Chamado de Suporte'}</p>
                <p style="margin: 0 0 8px; font-size: 13px; color: #475569;"><strong>Quem enviou:</strong> ${senderName} (${senderRoleLabel})</p>
                <p style="margin: 0 0 8px; font-size: 13px; color: #475569;"><strong>Clínica / Empresa:</strong> ${clinicName}</p>
                <p style="margin: 0; font-size: 13px; color: #475569;"><strong>Data e Hora:</strong> ${formattedDate}</p>
              </div>
              <div style="background-color: #f1f5f9; border-left: 4px solid #4f46e5; padding: 14px 18px; margin: 0 0 24px; border-radius: 6px; font-size: 14px; color: #1e293b; line-height: 22px;">
                <em>"${snippet}"</em>
              </div>
            `;
            EmailService.sendCustomEmail(
              adminEmail,
              `[Suporte] Nova mensagem no chamado #${id}: ${ticketFull?.title || ''}`,
              buildZemdaEmailLayout({
                title: 'Nova Mensagem no Suporte',
                headline: 'Nova mensagem recebida no chamado',
                badge: 'Central de Chamados',
                contentHtml: bodyHtml,
                ctaText: 'Acessar Chamado no Painel',
                ctaUrl: ticketDirectUrl
              })
            ).catch(err => console.error('[SupportEmail] Erro ao notificar admin:', err));
          }
        }
      } catch (e) {
        console.error('[SupportEmail] Erro ao processar envio de email:', e);
      }

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

      // Mensagem automática e notificação por e-mail ao finalizar chamado (Item 17)
      if (status === 'resolved' || status === 'closed') {
        const closeMsgId = 'msg-' + uuidv4().slice(0, 8);
        const statusLabel = status === 'resolved' ? 'Resolvido' : 'Concluído/Fechado';
        const nowFormatted = new Intl.DateTimeFormat('pt-BR', {
          dateStyle: 'short',
          timeStyle: 'medium',
          timeZone: 'America/Sao_Paulo'
        }).format(new Date());

        const autoCloseText = `🔒 Chamado marcado como **${statusLabel}** por ${user.name || 'Suporte Técnico'} em ${nowFormatted}. O chat deste chamado foi encerrado e travado para novas mensagens. Caso necessite de novo suporte, por favor abra um novo chamado.`;

        db.prepare(`
          INSERT INTO support_ticket_messages (id, ticket_id, user_id, message, attachments_json, is_internal, created_at)
          VALUES (?, ?, ?, ?, NULL, 0, datetime('now'))
        `).run(closeMsgId, id, user.userId, autoCloseText);

        try {
          const ticketFull = db.prepare(`
            SELECT t.id, t.title, u.email as creator_email, u.name as creator_name
            FROM support_tickets t
            JOIN users u ON u.id = t.user_id
            WHERE t.id = ?
          `).get(id) as any;

          if (ticketFull?.creator_email) {
            const bodyHtml = `
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 24px; color: #334155;">
                Olá, <strong>${ticketFull.creator_name || 'Usuário'}</strong>.
              </p>
              <p style="margin: 0 0 16px; font-size: 14px; line-height: 22px; color: #475569;">
                O seu chamado <strong>#${id}</strong> ("${ticketFull.title}") foi marcado como <strong>${statusLabel}</strong> por ${user.name || 'Suporte Técnico'} em ${nowFormatted}.
              </p>
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 20px; color: #64748b;">
                A conversa foi finalizada com sucesso. Caso precise de novas orientações ou suporte para outro assunto, fique à vontade para abrir um novo chamado em nossa central.
              </p>
            `;
            EmailService.sendCustomEmail(
              ticketFull.creator_email,
              `Chamado #${id} ${statusLabel}: ${ticketFull.title}`,
              buildZemdaEmailLayout({
                title: `Chamado ${statusLabel}`,
                headline: `Chamado #${id} foi finalizado`,
                badge: `Status: ${statusLabel}`,
                contentHtml: bodyHtml,
                ctaText: 'Ver Histórico do Chamado',
                ctaUrl: 'https://app.zemda.com.br'
              })
            ).catch(err => console.error('[SupportEmail] Erro ao enviar email de encerramento:', err));
          }
        } catch (e) {
          console.error('[SupportEmail] Erro ao enviar email de encerramento:', e);
        }
      }

      logAudit(req, 'UPDATE_TICKET_STATUS', 'support_tickets', id, { status });
      res.json({ success: true, message: 'Status do chamado atualizado com sucesso', status });
    } catch (err: any) {
      console.error('[SupportController.updateStatus] Erro:', err);
      res.status(500).json({ success: false, error: 'Erro ao atualizar status do chamado' });
    }
  }
}
