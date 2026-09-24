import { Resend } from 'resend';
import { randomUUID } from 'crypto';
import { db } from '../config/database';
import { buildZemdaEmailLayout } from './email-template.service';

export class TrialNotificationService {
  private static getResendClient(): Resend | null {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || !apiKey.trim()) return null;
    return new Resend(apiKey.trim());
  }

  private static getFromAddress(): string {
    return process.env.EMAIL_FROM || 'Zemda <acesso@notify.zemda.com.br>';
  }

  private static getReplyToAddress(): string {
    return process.env.EMAIL_REPLY_TO || 'suporte@zemda.com.br';
  }

  private static shouldSend(tenantId: string, stage: string): boolean {
    const existing = db.prepare('SELECT id FROM trial_notifications WHERE tenant_id = ? AND stage = ?').get(tenantId, stage);
    return !existing;
  }

  private static markSent(tenantId: string, stage: string): void {
    db.prepare(`
      INSERT INTO trial_notifications (id, tenant_id, stage, sent_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(tenant_id, stage) DO NOTHING
    `).run(randomUUID(), tenantId, stage);
  }

  private static async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    const resend = this.getResendClient();
    if (!resend) {
      // E-mail service not configured; do not block trial execution.
      return false;
    }
    try {
      const res = await resend.emails.send({
        from: this.getFromAddress(),
        replyTo: this.getReplyToAddress(),
        to,
        subject,
        html
      });
      return !res.error;
    } catch (err) {
      console.warn('[TrialNotificationService] Falha ao enviar e-mail:', err);
      return false;
    }
  }

  static async notifyTrialStarted(tenantId: string, email: string, name: string, trialEndsAt: string): Promise<void> {
    if (!this.shouldSend(tenantId, 'TRIAL_STARTED')) return;
    this.markSent(tenantId, 'TRIAL_STARTED');

    const formattedDate = new Date(trialEndsAt).toLocaleDateString('pt-BR');
    const contentHtml = `
      <p>Olá <strong>${name}</strong>,</p>
      <p>Seu período de teste grátis de 7 dias do <strong>Zemda Solo</strong> já está ativo.</p>
      <p>Você tem acesso integral a todas as funcionalidades do sistema para sua atuação: agenda inteligente, prontuário eletrônico, documentos, financeiro e os recursos do seu módulo clínico especializado.</p>
      <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 14px 16px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0; font-size: 13px; color: #166534;">
          <strong>Validade do teste:</strong> até <strong>${formattedDate}</strong> (7 dias). Sem cobrança durante este período.
        </p>
      </div>
    `;

    const html = buildZemdaEmailLayout({
      title: 'Bem-vindo(a) ao seu teste grátis de 7 dias - Zemda Solo',
      preheader: 'Seu período de teste grátis já está ativo na plataforma Zemda.',
      headline: 'Bem-vindo(a) ao seu Teste Grátis!',
      badge: 'Teste Grátis · 7 Dias',
      contentHtml,
      ctaText: 'Acessar o Zemda',
      ctaUrl: 'https://zemda.com.br',
      footerNote: 'Dúvidas ou suporte? Entre em contato pelo e-mail suporte@zemda.com.br.'
    });

    await this.sendEmail(email, 'Bem-vindo(a) ao seu teste grátis de 7 dias - Zemda Solo', html);
  }

  static async notifyTrial3Days(tenantId: string, email: string, name: string, trialEndsAt: string): Promise<void> {
    if (!this.shouldSend(tenantId, 'TRIAL_3_DAYS')) return;
    this.markSent(tenantId, 'TRIAL_3_DAYS');

    const formattedDate = new Date(trialEndsAt).toLocaleDateString('pt-BR');
    const contentHtml = `
      <p>Olá <strong>${name}</strong>,</p>
      <p>Lembramos que seu teste grátis do <strong>Zemda Solo</strong> encerra em <strong>${formattedDate}</strong>.</p>
      <p>Para garantir que sua rotina de atendimentos, prontuários e agenda continue sem interrupções, você pode assinar o plano Solo a qualquer momento.</p>
    `;

    const html = buildZemdaEmailLayout({
      title: 'Faltam 3 dias para o fim do seu teste grátis - Zemda Solo',
      preheader: `Seu teste grátis do Zemda Solo encerra em ${formattedDate}.`,
      headline: 'Faltam 3 dias para o término do seu teste',
      badge: 'Aviso de Teste Grátis',
      contentHtml,
      ctaText: 'Assinar Zemda Solo',
      ctaUrl: 'https://zemda.com.br/assinatura',
      footerNote: 'Precisa de informações sobre outros planos? Fale conosco em suporte@zemda.com.br.'
    });

    await this.sendEmail(email, 'Faltam 3 dias para o fim do seu teste grátis - Zemda Solo', html);
  }

  static async notifyTrial1Day(tenantId: string, email: string, name: string, trialEndsAt: string): Promise<void> {
    if (!this.shouldSend(tenantId, 'TRIAL_1_DAY')) return;
    this.markSent(tenantId, 'TRIAL_1_DAY');

    const contentHtml = `
      <p>Olá <strong>${name}</strong>,</p>
      <p>Seu teste grátis termina amanhã. Ao término dos 7 dias, a criação de novos atendimentos será temporariamente pausada até a ativação da sua assinatura.</p>
      <div style="background-color: #fefce8; border-left: 4px solid #f59e0b; padding: 14px 16px; border-radius: 8px; margin: 18px 0;">
        <p style="margin: 0; font-size: 13px; color: #854d0e;">
          <strong>Fique tranquilo:</strong> todos os seus dados clínicos, pacientes, agendamentos e prontuários permanecem intactos e seguros.
        </p>
      </div>
    `;

    const html = buildZemdaEmailLayout({
      title: 'Seu teste grátis termina amanhã - Assine o Zemda Solo',
      preheader: 'Último dia do seu teste grátis no Zemda Solo.',
      headline: 'Último dia do seu teste grátis',
      badge: 'Aviso Importante',
      contentHtml,
      ctaText: 'Assinar Zemda Solo Agora',
      ctaUrl: 'https://zemda.com.br/assinatura',
      footerNote: 'Dúvidas? Entre em contato pelo e-mail suporte@zemda.com.br.'
    });

    await this.sendEmail(email, 'Seu teste grátis termina amanhã - Assine o Zemda Solo', html);
  }

  static async notifyTrialExpired(tenantId: string, email: string, name: string): Promise<void> {
    if (!this.shouldSend(tenantId, 'TRIAL_EXPIRED')) return;
    this.markSent(tenantId, 'TRIAL_EXPIRED');

    const contentHtml = `
      <p>Olá <strong>${name}</strong>,</p>
      <p>Seus 7 dias de teste grátis do Zemda Solo chegaram ao fim.</p>
      <p>Para continuar utilizando o sistema, cadastrando pacientes e emitindo prontuários, ative sua assinatura.</p>
      <p style="margin-top: 14px; font-size: 13px; color: #475569;">
        Todos os seus registros, prontuários, pacientes e agenda continuam preservados e estarão imediatamente disponíveis assim que o plano for ativado.
      </p>
    `;

    const html = buildZemdaEmailLayout({
      title: 'Seu teste grátis do Zemda encerrou - Ative sua assinatura',
      preheader: 'Seu período de teste grátis encerrou. Reative seu acesso.',
      headline: 'Seu período de teste encerrou',
      badge: 'Encerramento de Teste',
      contentHtml,
      ctaText: 'Reativar Acesso · Assinar Zemda Solo',
      ctaUrl: 'https://zemda.com.br/assinatura',
      footerNote: 'Suporte e atendimento: suporte@zemda.com.br.'
    });

    await this.sendEmail(email, 'Seu teste grátis do Zemda encerrou - Ative sua assinatura', html);
  }

  /**
   * Varredura periódica para processar avisos de expiração (3 dias, 1 dia e expirado).
   */
  static async processDueNotifications(): Promise<void> {
    try {
      const activeTrials = db.prepare(`
        SELECT s.id as sub_id, s.clinic_id, s.trial_ends_at, t.name as clinic_name, t.responsible_name, t.responsible_email, t.email
        FROM subscriptions s
        JOIN tenants t ON t.id = s.clinic_id
        WHERE s.managed = 1 AND s.is_current = 1 AND s.status = 'TRIAL' AND s.trial_ends_at IS NOT NULL
      `).all() as any[];

      const now = Date.now();

      for (const trial of activeTrials) {
        const endsMs = new Date(trial.trial_ends_at).getTime();
        const diffHours = (endsMs - now) / (1000 * 60 * 60);
        const recipientEmail = trial.responsible_email || trial.email;
        const recipientName = trial.responsible_name || trial.clinic_name || 'Profissional';

        if (!recipientEmail) continue;

        // Aviso de 3 dias restantes (entre 48h e 72h)
        if (diffHours <= 72 && diffHours > 48) {
          await this.notifyTrial3Days(trial.clinic_id, recipientEmail, recipientName, trial.trial_ends_at);
        }
        // Aviso de 1 dia restante (entre 0h e 24h)
        else if (diffHours <= 24 && diffHours > 0) {
          await this.notifyTrial1Day(trial.clinic_id, recipientEmail, recipientName, trial.trial_ends_at);
        }
      }
    } catch (err) {
      console.warn('[TrialNotificationService.processDueNotifications] Erro ao processar:', err);
    }
  }
}
