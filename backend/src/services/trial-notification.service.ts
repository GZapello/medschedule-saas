import { Resend } from 'resend';
import { randomUUID } from 'crypto';
import { db } from '../config/database';

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
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b;">
        <h2 style="color: #0d9488; font-size: 20px; font-weight: 700; margin-bottom: 16px;">Bem-vindo(a) ao seu Teste Grátis Zemda Solo!</h2>
        <p>Olá <strong>${name}</strong>,</p>
        <p>Seu período de teste grátis de 7 dias do <strong>Zemda Solo</strong> já está ativo.</p>
        <p>Você tem acesso integral a todas as funcionalidades do sistema para sua atuação individual: agenda inteligente, prontuário eletrônico, documentos, financeiro e os recursos do seu módulo clínico especializado.</p>
        <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 14px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #166534;">
            <strong>Validade do teste:</strong> até <strong>${formattedDate}</strong> (7 dias). Sem cobrança durante este período.
          </p>
        </div>
        <p>Acesse seu painel agora mesmo:</p>
        <p><a href="https://zemda.com.br" style="display: inline-block; background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">Acessar o Zemda</a></p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #64748b;">Dúvidas ou suporte? Entre em contato pelo e-mail <a href="mailto:suporte@zemda.com.br" style="color: #0d9488;">suporte@zemda.com.br</a>.</p>
      </div>
    `;

    await this.sendEmail(email, 'Bem-vindo(a) ao seu teste grátis de 7 dias - Zemda Solo', html);
  }

  static async notifyTrial3Days(tenantId: string, email: string, name: string, trialEndsAt: string): Promise<void> {
    if (!this.shouldSend(tenantId, 'TRIAL_3_DAYS')) return;
    this.markSent(tenantId, 'TRIAL_3_DAYS');

    const formattedDate = new Date(trialEndsAt).toLocaleDateString('pt-BR');
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b;">
        <h2 style="color: #0f172a; font-size: 18px; font-weight: 700; margin-bottom: 16px;">Faltam 3 dias para o término do seu teste grátis</h2>
        <p>Olá <strong>${name}</strong>,</p>
        <p>Lembramos que seu teste grátis do <strong>Zemda Solo</strong> encerra em <strong>${formattedDate}</strong>.</p>
        <p>Para garantir que sua rotina de atendimentos, prontuários e agenda continue sem interrupções, você pode assinar o plano Solo a qualquer momento.</p>
        <p><a href="https://zemda.com.br/assinatura" style="display: inline-block; background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">Assinar Zemda Solo</a></p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #64748b;">Precisa de informações sobre outros planos? Fale conosco em <a href="mailto:suporte@zemda.com.br" style="color: #0d9488;">suporte@zemda.com.br</a>.</p>
      </div>
    `;

    await this.sendEmail(email, 'Faltam 3 dias para o fim do seu teste grátis - Zemda Solo', html);
  }

  static async notifyTrial1Day(tenantId: string, email: string, name: string, trialEndsAt: string): Promise<void> {
    if (!this.shouldSend(tenantId, 'TRIAL_1_DAY')) return;
    this.markSent(tenantId, 'TRIAL_1_DAY');

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b;">
        <h2 style="color: #b45309; font-size: 18px; font-weight: 700; margin-bottom: 16px;">Último dia do seu teste grátis Zemda Solo</h2>
        <p>Olá <strong>${name}</strong>,</p>
        <p>Seu teste grátis termina amanhã. Ao término dos 7 dias, a criação de novos atendimentos será temporariamente pausada até a ativação da sua assinatura.</p>
        <p><strong>Fique tranquilo: todos os seus dados clínicos, pacientes, agendamentos e prontuários permanecem intactos e seguros.</strong></p>
        <p><a href="https://zemda.com.br/assinatura" style="display: inline-block; background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">Assinar Zemda Solo Agora</a></p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #64748b;">Dúvidas? <a href="mailto:suporte@zemda.com.br" style="color: #0d9488;">suporte@zemda.com.br</a></p>
      </div>
    `;

    await this.sendEmail(email, 'Seu teste grátis termina amanhã - Assine o Zemda Solo', html);
  }

  static async notifyTrialExpired(tenantId: string, email: string, name: string): Promise<void> {
    if (!this.shouldSend(tenantId, 'TRIAL_EXPIRED')) return;
    this.markSent(tenantId, 'TRIAL_EXPIRED');

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b;">
        <h2 style="color: #0f172a; font-size: 18px; font-weight: 700; margin-bottom: 16px;">Seu período de teste grátis encerrou</h2>
        <p>Olá <strong>${name}</strong>,</p>
        <p>Seus 7 dias de teste grátis do Zemda Solo chegaram ao fim.</p>
        <p>Para continuar utilizando o sistema, cadastrando pacientes e emitindo prontuários, ative sua assinatura:</p>
        <p><a href="https://zemda.com.br/assinatura" style="display: inline-block; background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">Reativar Acesso · Assinar Zemda Solo</a></p>
        <p style="margin-top: 16px; font-size: 13px; color: #475569;">
          Todos os seus registros, prontuários, pacientes e agenda continuam preservados e estarão imediatamente disponíveis assim que o plano for ativado.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #64748b;">Suporte e atendimento: <a href="mailto:suporte@zemda.com.br" style="color: #0d9488;">suporte@zemda.com.br</a>.</p>
      </div>
    `;

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
