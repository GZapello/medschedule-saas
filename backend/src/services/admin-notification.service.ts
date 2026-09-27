import { randomUUID } from 'crypto';
import { db } from '../config/database';
import { EmailService } from './email.service';
import { buildZemdaEmailLayout } from './email-template.service';

export type AdminNotificationType = 'NEW_USER' | 'TRIAL_STARTED' | 'SUPPORT_TICKET_CREATED';

export interface NewUserNotificationData {
  userId: string;
  name: string;
  email: string;
  professionName?: string | null;
  clinicName?: string | null;
  role?: string | null;
  createdAt?: string | Date | null;
  tenantId?: string | null;
  isSandboxSession?: boolean;
}

export interface TrialStartedNotificationData {
  tenantId: string;
  clinicName: string;
  responsibleName?: string | null;
  email: string;
  professionName?: string | null;
  planName?: string | null;
  startedAt?: string | Date | null;
  endsAt?: string | Date | null;
  trialDays?: number;
  userId?: string | null;
  isSandboxSession?: boolean;
}

export interface SupportTicketCreatedNotificationData {
  ticketId: string;
  title: string;
  category?: string | null;
  priority?: string | null;
  userName?: string | null;
  clinicName?: string | null;
  userEmail?: string | null;
  createdAt?: string | Date | null;
  description: string;
  tenantId?: string | null;
  userId?: string | null;
  isSandboxSession?: boolean;
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateBr(dateInput?: string | Date | null): string {
  if (!dateInput) {
    return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }
  const dateObj = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(dateObj.getTime())) {
    return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }
  return dateObj.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatDateOnlyBr(dateInput?: string | Date | null): string {
  if (!dateInput) {
    return new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }
  const dateObj = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(dateObj.getTime())) {
    return new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }
  return dateObj.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function getRoleLabel(role?: string | null): string {
  if (!role) return 'Usuário';
  const roleMap: Record<string, string> = {
    superadmin: 'SuperAdmin',
    clinic_admin: 'Gestor / Administrador da Clínica',
    professional: 'Profissional de Saúde',
    receptionist: 'Recepcionista',
    secretary: 'Secretária',
    financial: 'Financeiro',
    assistant: 'Assistente',
    custom: 'Personalizado',
    patient: 'Paciente / Aluno'
  };
  return roleMap[role.toLowerCase()] || role;
}

function getCategoryLabel(category?: string | null): string {
  if (!category) return 'Dúvida';
  const catMap: Record<string, string> = {
    doubt: 'Dúvida',
    duvida: 'Dúvida',
    problem: 'Problema / Erro',
    problema: 'Problema / Erro',
    suggestion: 'Sugestão',
    sugestao: 'Sugestão',
    financial: 'Financeiro / Assinatura',
    financeiro: 'Financeiro / Assinatura',
    other: 'Outro',
    outro: 'Outro'
  };
  return catMap[category.toLowerCase()] || category;
}

function getPriorityLabel(priority?: string | null): string {
  if (!priority) return 'Média';
  const prioMap: Record<string, string> = {
    low: 'Baixa',
    baixa: 'Baixa',
    medium: 'Média',
    media: 'Média',
    high: 'Alta',
    alta: 'Alta',
    urgent: 'Urgente',
    urgente: 'Urgente'
  };
  return prioMap[priority.toLowerCase()] || priority;
}

function renderDetailsCard(items: Array<{ label: string; value?: string | number | null }>): string {
  const filtered = items.filter(
    item => item.value !== undefined && item.value !== null && String(item.value).trim() !== ''
  );

  const rows = filtered
    .map(
      item => `
      <tr>
        <td style="padding: 10px 14px; font-size: 13px; font-weight: 600; color: #475569; width: 140px; vertical-align: top; border-bottom: 1px solid #f1f5f9;">
          ${escapeHtml(item.label)}:
        </td>
        <td style="padding: 10px 14px; font-size: 13px; color: #0f172a; vertical-align: top; border-bottom: 1px solid #f1f5f9;">
          ${escapeHtml(String(item.value))}
        </td>
      </tr>
    `
    )
    .join('');

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin: 16px 0 20px;">
      ${rows}
    </table>
  `;
}

function renderMessageSnippet(label: string, text: string): string {
  const clean = text.trim();
  const snippet = clean.length > 240 ? `${clean.slice(0, 240)}...` : clean;
  return `
    <div style="background-color: #f0fdfa; border-left: 4px solid #0d9488; border-radius: 6px; padding: 14px 16px; margin: 16px 0 20px;">
      <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #0d9488;">
        ${escapeHtml(label)}:
      </p>
      <p style="margin: 0; font-size: 13px; line-height: 20px; color: #134e4a; white-space: pre-wrap;">
        ${escapeHtml(snippet)}
      </p>
    </div>
  `;
}

export class AdminNotificationService {
  /**
   * Obtém dinamicamente o e-mail administrativo/SuperAdmin configurado no sistema.
   * Prioridade:
   * 1. E-mail do SuperAdmin ativo registrado no banco de dados.
   * 2. Variável de ambiente (ADMIN_EMAIL, SUPPORT_EMAIL, EMAIL_REPLY_TO).
   * 3. Fallback oficial institucional 'suporte@zemda.com.br'.
   */
  public static getRecipientEmail(): string {
    try {
      const superadmin = db
        .prepare(
          "SELECT email FROM users WHERE role = 'superadmin' AND status = 'active' ORDER BY created_at ASC LIMIT 1"
        )
        .get() as { email: string } | undefined;

      if (superadmin?.email && superadmin.email.trim()) {
        return superadmin.email.trim().toLowerCase();
      }
    } catch {
      // Fallback para variáveis de ambiente caso banco esteja indisponível
    }

    const envAdmin = process.env.ADMIN_EMAIL || process.env.SUPPORT_EMAIL || process.env.EMAIL_REPLY_TO;
    if (envAdmin && envAdmin.trim()) {
      return envAdmin.trim().toLowerCase();
    }

    return 'suporte@zemda.com.br';
  }

  /**
   * Obtém a URL base pública do Zemda para links de ação nos e-mails.
   */
  public static getAppBaseUrl(): string {
    const raw = process.env.APP_URL || process.env.PUBLIC_APP_URL || 'https://zemda.com.br';
    return raw.replace(/\/$/, '');
  }

  /**
   * Verifica se o contexto atual pertence ao ambiente de Teste / Simulação / Sandbox.
   */
  public static isSandbox(params: {
    tenantId?: string | null;
    userId?: string | null;
    email?: string | null;
    isSandboxSession?: boolean;
  }): boolean {
    if (params.isSandboxSession) return true;
    if (params.tenantId && (params.tenantId.startsWith('sbx-tenant-') || params.tenantId.toLowerCase().includes('sandbox'))) {
      return true;
    }
    if (params.userId && (params.userId.startsWith('sbx-user-') || params.userId.toLowerCase().includes('sandbox'))) {
      return true;
    }
    if (
      params.email &&
      (params.email.toLowerCase().endsWith('@zemda.test') ||
        params.email.toLowerCase().includes('sandbox') ||
        params.email.toLowerCase().includes('@test.invalid'))
    ) {
      return true;
    }
    return false;
  }

  /**
   * Central de disparo idempotente, auditada e com salvaguarda contra falhas externas.
   */
  private static async dispatchAdminNotification(params: {
    notificationType: AdminNotificationType;
    relatedEntityId: string;
    subject: string;
    headline: string;
    badge: string;
    contentHtml: string;
    ctaText?: string;
    ctaUrl?: string;
    isSandbox?: boolean;
  }): Promise<{ sent: boolean; messageId?: string; error?: string }> {
    const recipient = this.getRecipientEmail();
    const logId = randomUUID();

    // 1. Bloqueio de Sandbox / Simulação
    if (params.isSandbox) {
      try {
        db.prepare(`
          INSERT INTO admin_notification_logs (
            id, notification_type, recipient, related_entity_id, status, error, created_at
          ) VALUES (?, ?, ?, ?, 'SKIPPED_SANDBOX', 'Envio real suprimido no modo teste/sandbox', datetime('now'))
        `).run(logId, params.notificationType, recipient, params.relatedEntityId);
      } catch (err: any) {
        console.warn('[AdminNotificationService] Aviso ao registrar log de sandbox:', err);
      }
      return { sent: false, error: 'SKIPPED_SANDBOX' };
    }

    // 2. Proteção de idempotência / Deduplicação persistente no banco de dados
    const existing = db
      .prepare('SELECT id, status FROM admin_notification_logs WHERE notification_type = ? AND related_entity_id = ?')
      .get(params.notificationType, params.relatedEntityId) as { id: string; status: string } | undefined;

    if (existing) {
      // Já foi disparada ou registrada para esta mesma entidade
      return { sent: false, error: 'SKIPPED_DUPLICATE' };
    }

    // 3. Reserva atômica da notificação para evitar condições de corrida (Strict Mode / re-render / retries)
    try {
      db.prepare(`
        INSERT INTO admin_notification_logs (
          id, notification_type, recipient, related_entity_id, status, created_at
        ) VALUES (?, ?, ?, ?, 'PENDING', datetime('now'))
      `).run(logId, params.notificationType, recipient, params.relatedEntityId);
    } catch (err: any) {
      if (err?.message?.includes('UNIQUE')) {
        return { sent: false, error: 'SKIPPED_DUPLICATE' };
      }
      console.warn('[AdminNotificationService] Erro ao reservar log de notificação:', err);
      return { sent: false, error: err?.message || 'LOG_RESERVATION_FAILED' };
    }

    // 4. Renderização do template visual unificado do Zemda
    const emailHtml = buildZemdaEmailLayout({
      title: params.subject,
      preheader: params.headline,
      headline: params.headline,
      badge: params.badge,
      contentHtml: params.contentHtml,
      ctaText: params.ctaText,
      ctaUrl: params.ctaUrl,
      footerNote: 'Notificação automática do Zemda — Administração Global'
    });

    // 5. Envio real via serviço integrado do Resend
    try {
      const sendResult = await EmailService.sendEmailRaw({
        to: recipient,
        subject: params.subject,
        html: emailHtml
      });

      if (sendResult.success) {
        db.prepare(`
          UPDATE admin_notification_logs
          SET status = 'SENT', provider_message_id = ?, sent_at = datetime('now')
          WHERE id = ?
        `).run(sendResult.messageId || null, logId);
        return { sent: true, messageId: sendResult.messageId };
      } else {
        const errorMsg = sendResult.error || 'Falha no envio pelo provedor';
        const finalStatus = errorMsg === 'RESEND_API_KEY_MISSING' ? 'SKIPPED_NO_PROVIDER' : 'FAILED';
        db.prepare(`
          UPDATE admin_notification_logs
          SET status = ?, error = ?
          WHERE id = ?
        `).run(finalStatus, errorMsg, logId);
        return { sent: false, error: errorMsg };
      }
    } catch (err: any) {
      const errorMsg = err?.message || 'Erro inesperado ao despachar e-mail';
      try {
        db.prepare(`
          UPDATE admin_notification_logs
          SET status = 'FAILED', error = ?
          WHERE id = ?
        `).run(errorMsg, logId);
      } catch {}
      return { sent: false, error: errorMsg };
    }
  }

  /**
   * 1. Notificação de Novo Usuário Cadastrado
   */
  public static async notifyNewUser(data: NewUserNotificationData): Promise<void> {
    try {
      const isSbx = this.isSandbox({
        tenantId: data.tenantId,
        userId: data.userId,
        email: data.email,
        isSandboxSession: data.isSandboxSession
      });

      const formattedDate = formatDateBr(data.createdAt);
      const roleLabel = getRoleLabel(data.role);
      const appUrl = this.getAppBaseUrl();

      const detailsHtml = renderDetailsCard([
        { label: 'Nome', value: data.name },
        { label: 'E-mail', value: data.email },
        { label: 'Profissão', value: data.professionName },
        { label: 'Clínica/consultório', value: data.clinicName },
        { label: 'Tipo de usuário', value: roleLabel },
        { label: 'Data e hora do cadastro', value: formattedDate }
      ]);

      const contentHtml = `
        <p style="margin: 0 0 16px; font-size: 15px; color: #334155; line-height: 22px;">
          Um novo usuário concluiu com sucesso o cadastro na plataforma Zemda.
        </p>
        ${detailsHtml}
        <p style="margin: 0 0 8px; font-size: 13px; color: #64748b; line-height: 18px;">
          Acesse o Painel Global para gerenciar clínicas, usuários e permissões do sistema.
        </p>
      `;

      await this.dispatchAdminNotification({
        notificationType: 'NEW_USER',
        relatedEntityId: data.userId,
        subject: '👤 Novo usuário cadastrado no Zemda',
        headline: 'Novo usuário cadastrado',
        badge: 'Administração Global',
        contentHtml,
        ctaText: 'Ver no Zemda',
        ctaUrl: `${appUrl}/superadmin?section=tenants`,
        isSandbox: isSbx
      });
    } catch (err) {
      console.error('[AdminNotificationService.notifyNewUser] Erro não impeditivo:', err);
    }
  }

  /**
   * 2. Notificação de Novo Teste Grátis Iniciado
   */
  public static async notifyTrialStarted(data: TrialStartedNotificationData): Promise<void> {
    try {
      const isSbx = this.isSandbox({
        tenantId: data.tenantId,
        userId: data.userId,
        email: data.email,
        isSandboxSession: data.isSandboxSession
      });

      const formattedStart = formatDateOnlyBr(data.startedAt);
      const formattedEnd = formatDateOnlyBr(data.endsAt);
      const appUrl = this.getAppBaseUrl();

      const detailsHtml = renderDetailsCard([
        { label: 'Clínica/Consultório', value: data.clinicName },
        { label: 'Responsável', value: data.responsibleName },
        { label: 'E-mail', value: data.email },
        { label: 'Profissão', value: data.professionName },
        { label: 'Plano/modalidade', value: data.planName || 'Zemda Solo' },
        { label: 'Início', value: formattedStart },
        { label: 'Término', value: formattedEnd },
        { label: 'Dias de teste', value: data.trialDays || 7 }
      ]);

      const contentHtml = `
        <p style="margin: 0 0 16px; font-size: 15px; color: #334155; line-height: 22px;">
          Uma clínica/profissional iniciou efetivamente o período de teste grátis de 7 dias do <strong>Zemda Solo</strong>.
        </p>
        ${detailsHtml}
        <p style="margin: 0 0 8px; font-size: 13px; color: #64748b; line-height: 18px;">
          Acompanhe o período de trial, contagem regressiva e conversões na aba de Testes Grátis.
        </p>
      `;

      await this.dispatchAdminNotification({
        notificationType: 'TRIAL_STARTED',
        relatedEntityId: data.tenantId,
        subject: '🚀 Novo teste grátis iniciado no Zemda',
        headline: 'Novo Teste Grátis',
        badge: 'Administração Global',
        contentHtml,
        ctaText: 'Ver Testes Grátis',
        ctaUrl: `${appUrl}/superadmin?section=free_trials`,
        isSandbox: isSbx
      });
    } catch (err) {
      console.error('[AdminNotificationService.notifyTrialStarted] Erro não impeditivo:', err);
    }
  }

  /**
   * 3. Notificação de Novo Chamado Aberto
   */
  public static async notifySupportTicketCreated(data: SupportTicketCreatedNotificationData): Promise<void> {
    try {
      const isSbx = this.isSandbox({
        tenantId: data.tenantId,
        userId: data.userId,
        email: data.userEmail,
        isSandboxSession: data.isSandboxSession
      });

      const formattedDate = formatDateBr(data.createdAt);
      const categoryLabel = getCategoryLabel(data.category);
      const priorityLabel = getPriorityLabel(data.priority);
      const appUrl = this.getAppBaseUrl();

      const detailsHtml = renderDetailsCard([
        { label: 'Chamado', value: `#${data.ticketId}` },
        { label: 'Assunto', value: data.title },
        { label: 'Categoria', value: categoryLabel },
        { label: 'Prioridade', value: priorityLabel },
        { label: 'Usuário', value: data.userName },
        { label: 'Clínica', value: data.clinicName },
        { label: 'E-mail', value: data.userEmail },
        { label: 'Data/hora', value: formattedDate }
      ]);

      const snippetHtml = renderMessageSnippet('Mensagem', data.description);

      const contentHtml = `
        <p style="margin: 0 0 16px; font-size: 15px; color: #334155; line-height: 22px;">
          Um novo chamado de suporte foi aberto na plataforma e requer atenção da equipe administrativa.
        </p>
        ${detailsHtml}
        ${snippetHtml}
        <p style="margin: 0 0 8px; font-size: 13px; color: #64748b; line-height: 18px;">
          Clique no botão abaixo para responder ou atualizar o status do chamado diretamente no painel.
        </p>
      `;

      await this.dispatchAdminNotification({
        notificationType: 'SUPPORT_TICKET_CREATED',
        relatedEntityId: data.ticketId,
        subject: `🎫 Novo chamado aberto no Zemda — #${data.ticketId}`,
        headline: 'Novo chamado de suporte',
        badge: 'Suporte & Atendimento',
        contentHtml,
        ctaText: 'Abrir chamado',
        ctaUrl: `${appUrl}/suporte?ticketId=${encodeURIComponent(data.ticketId)}`,
        isSandbox: isSbx
      });
    } catch (err) {
      console.error('[AdminNotificationService.notifySupportTicketCreated] Erro não impeditivo:', err);
    }
  }
}
