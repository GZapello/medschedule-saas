import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Resend } from 'resend';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';

export interface EmailVerificationRecord {
  id: string;
  email: string;
  purpose: string;
  code_hash: string;
  status: 'pending' | 'verified' | 'consumed' | 'expired' | 'blocked' | 'invalidated' | 'failed';
  attempts: number;
  resend_count: number;
  expires_at: string;
  verified_at: string | null;
  consumed_at: string | null;
  last_sent_at: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface VerificationTokenPayload {
  email: string;
  purpose: string;
  verified: boolean;
  verificationId: string;
  iat?: number;
  exp?: number;
}

export class EmailService {
  private static getResendClient(): Resend | null {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      return null;
    }
    return new Resend(apiKey.trim());
  }

  private static getFromAddress(): string {
    return process.env.EMAIL_FROM || 'Zemda <acesso@notify.zemda.com.br>';
  }

  private static getReplyToAddress(): string {
    return process.env.EMAIL_REPLY_TO || 'suporte@zemda.com.br';
  }

  /**
   * Obtém o segredo exclusivo para OTP e tokens de verificação de e-mail.
   * Não possui fallback nem permite uso automático de outras chaves (como JWT_SECRET).
   */
  private static getOtpSecret(): string {
    const secret = process.env.EMAIL_OTP_SECRET;
    if (!secret || !secret.trim()) {
      throw new Error('EMAIL_OTP_SECRET_MISSING');
    }
    return secret.trim();
  }

  /**
   * Gera o hash HMAC-SHA256 do código de 6 dígitos atrelado ao e-mail e propósito.
   */
  private static hashCode(email: string, code: string, purpose: string): string {
    const secret = this.getOtpSecret();
    return crypto
      .createHmac('sha256', secret)
      .update(`${email}:${code}:${purpose}`)
      .digest('hex');
  }

  /**
   * Template HTML responsivo nos padrões de design do Zemda
   */
  private static buildOtpHtml(code: string, purpose: string = 'clinic_registration', isExistingAccount: boolean = false): string {
    const formattedCode = code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;

    const isPasswordReset = purpose === 'password_reset';

    let headline = 'Confirme seu e-mail';
    let leadText = isExistingAccount
      ? 'Recebemos uma solicitação de verificação para o seu e-mail:'
      : 'Para continuar seu cadastro no Zemda, utilize o código de verificação abaixo:';
    let noteText = 'O código expira em 10 minutos. Se você não solicitou este código, ignore esta mensagem com segurança.';
    let existingAccountNotice = '';

    if (isPasswordReset) {
      headline = 'Recuperação de Senha';
      leadText = 'Recebemos uma solicitação para redefinir a senha da sua conta no Zemda. Utilize o código de verificação abaixo:';
      noteText = 'O código expira em 10 minutos. Se você não solicitou a recuperação da sua senha, desconsidere esta mensagem. Sua conta permanece totalmente protegida.';
    } else if (isExistingAccount) {
      existingAccountNotice = `
              <div style="background-color: #f8fafc; border-left: 3px solid #0d9488; padding: 12px 16px; margin: 0 0 20px; border-radius: 6px;">
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #334155;">
                  <strong>Aviso de Segurança:</strong> Identificamos que este e-mail já possui uma conta ativa no Zemda. Caso já seja usuário, você pode acessar seu painel diretamente em <a href="https://zemda.com.br" style="color: #0d9488; text-decoration: underline;">zemda.com.br</a>. Se você não solicitou este código, ignore esta mensagem.
                </p>
              </div>`;
    }

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isPasswordReset ? 'Recuperação de senha Zemda' : 'Seu código de verificação Zemda'}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" max-width="540" style="max-width: 540px; background-color: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);">
          <!-- Header Branding -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #f1f5f9; background: linear-gradient(135deg, #042f2e 0%, #0f172a 100%);">
              <span style="font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #ffffff; text-decoration: none;">
                Zemda<span style="color: #14b8a6;">.</span>
              </span>
              <div style="font-size: 11px; color: #99f6e4; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;">
                Plataforma de Gestão em Saúde
              </div>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 36px 32px 28px; text-align: left;">
              <h1 style="margin: 0 0 12px; font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.3px;">
                ${headline}
              </h1>
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #475569;">
                ${leadText}
              </p>

              <!-- OTP Display Box -->
              <div style="background-color: #f0fdfa; border: 1.5px dashed #0d9488; border-radius: 14px; padding: 20px; text-align: center; margin: 0 0 24px;">
                <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 34px; font-weight: 900; letter-spacing: 8px; color: #0f766e; text-indent: 8px;">
                  ${formattedCode}
                </div>
                <div style="font-size: 12px; font-weight: 600; color: #0d9488; margin-top: 8px;">
                  Válido por 10 minutos
                </div>
              </div>

              ${existingAccountNotice}

              <p style="margin: 0 0 16px; font-size: 13px; line-height: 1.5; color: #64748b;">
                ${noteText}
              </p>

              <div style="border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 24px;">
                <p style="margin: 0; font-size: 13px; font-weight: 700; color: #0f172a;">
                  Equipe Zemda
                </p>
                <p style="margin: 4px 0 0; font-size: 12px; color: #94a3b8;">
                  https://zemda.com.br
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer Legal -->
          <tr>
            <td style="padding: 16px 32px 24px; text-align: center; background-color: #fafbfc; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8; line-height: 1.4;">
              Esta é uma mensagem automática de segurança enviada pelo Zemda.<br>
              Por favor, não responda diretamente a este e-mail. Dúvidas: suporte@zemda.com.br.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
  }

  /**
   * Solicita um novo código OTP de 6 dígitos e despacha via Resend.
   * Regras estritas:
   * - Exige EMAIL_OTP_SECRET presente;
   * - Exige RESEND_API_KEY presente (não retorna sucesso falso);
   * - Elimina enumeração de contas (fluxo idêntico com OTP e mensagens uniformes);
   * - Registros 'failed' não penalizam as cotas horárias por e-mail ou IP;
   * - Invalida códigos pending e verificações verified não consumidas;
   * - Código gerado com crypto.randomInt;
   * - Se o envio via Resend falhar, marca o registro como 'failed'.
   */
  static async requestVerificationCode(
    rawEmail: string,
    purpose: string = 'clinic_registration',
    clientIp?: string
  ): Promise<{ success: boolean; error?: string; remainingSeconds?: number }> {
    const email = (rawEmail || '').trim().toLowerCase();

    if (!email || !email.includes('@') || !email.includes('.')) {
      return { success: false, error: 'E-mail informado é inválido' };
    }

    if (purpose !== 'clinic_registration' && purpose !== 'password_reset') {
      return { success: false, error: 'Finalidade de verificação não suportada' };
    }

    // 1. Validação obrigatória de EMAIL_OTP_SECRET
    try {
      this.getOtpSecret();
    } catch {
      return {
        success: false,
        error: 'Serviço de verificação temporariamente indisponível. Contate o suporte.'
      };
    }

    // 2. Validação obrigatória de RESEND_API_KEY
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      return {
        success: false,
        error: 'Serviço de envio de e-mails temporariamente indisponível. Tente novamente mais tarde.'
      };
    }

    // 3. Verificação de conta existente para estratégia de comunicação segura e anti-enumeração
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    const isExistingAccount = Boolean(existingUser);

    // Se for recuperação de senha e o e-mail não existir na base de usuários:
    // Anti-enumeração: responde com sucesso idêntico sem registrar e sem consumir provedor
    if (purpose === 'password_reset' && !isExistingAccount) {
      return { success: true };
    }

    // 4. Rate limit por IP: máximo de 10 envios por hora por IP (desconsidera status='failed')
    const normalizedIp = (clientIp || '').trim() || null;
    if (normalizedIp) {
      const hourlyIpCountRow = db.prepare(`
        SELECT count(*) as total
        FROM email_verifications
        WHERE ip_address = ? AND status != 'failed' AND datetime(created_at) >= datetime('now', '-1 hour')
      `).get(normalizedIp) as { total: number } | undefined;

      if (hourlyIpCountRow && hourlyIpCountRow.total >= 10) {
        return {
          success: false,
          error: 'Limite de solicitações por hora atingido para este endereço IP. Aguarde antes de tentar novamente.'
        };
      }
    }

    // 5. Cooldown de 60 segundos por e-mail (apenas status='pending')
    const recentVerification = db.prepare(`
      SELECT id, last_sent_at, strftime('%s', 'now') - strftime('%s', last_sent_at) as seconds_since_last
      FROM email_verifications
      WHERE email = ? AND purpose = ? AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(email, purpose) as { id: string; last_sent_at: string; seconds_since_last: number } | undefined;

    if (recentVerification && recentVerification.seconds_since_last !== null && recentVerification.seconds_since_last < 60) {
      const remaining = Math.max(1, 60 - recentVerification.seconds_since_last);
      return {
        success: false,
        error: `Aguarde ${remaining} segundos antes de solicitar um novo código.`,
        remainingSeconds: remaining
      };
    }

    // 6. Limite de segurança: máximo de 5 envios por hora para o mesmo e-mail (desconsidera status='failed')
    const hourlyEmailCountRow = db.prepare(`
      SELECT count(*) as total
      FROM email_verifications
      WHERE email = ? AND status != 'failed' AND datetime(created_at) >= datetime('now', '-1 hour')
    `).get(email) as { total: number } | undefined;

    if (hourlyEmailCountRow && hourlyEmailCountRow.total >= 5) {
      return {
        success: false,
        error: 'Limite de tentativas de envio por hora atingido para este e-mail. Aguarde antes de tentar novamente.'
      };
    }

    // 7. Invalida qualquer código anterior pendente OU verificação verified ainda não consumida
    db.prepare(`
      UPDATE email_verifications
      SET status = 'invalidated'
      WHERE email = ? AND purpose = ? AND (status = 'pending' OR (status = 'verified' AND consumed_at IS NULL))
    `).run(email, purpose);

    // 8. Gera código numérico de 6 dígitos criptograficamente seguro via crypto.randomInt
    const code = crypto.randomInt(100000, 1000000).toString();
    const codeHash = this.hashCode(email, code, purpose);
    const verificationId = 'ev_' + uuidv4().replace(/-/g, '').slice(0, 16);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const previousCountRow = db.prepare(`
      SELECT COALESCE(MAX(resend_count), 0) as last_count
      FROM email_verifications
      WHERE email = ? AND purpose = ?
    `).get(email, purpose) as { last_count: number } | undefined;

    const resendCount = (previousCountRow?.last_count || 0) + 1;

    // 9. Registra no banco de dados com hash seguro (código puro NUNCA é persistido nem logado)
    db.prepare(`
      INSERT INTO email_verifications (
        id, email, purpose, code_hash, status, attempts, resend_count,
        expires_at, verified_at, consumed_at, last_sent_at, ip_address, created_at
      ) VALUES (?, ?, ?, ?, 'pending', 0, ?, ?, NULL, NULL, datetime('now'), ?, datetime('now'))
    `).run(verificationId, email, purpose, codeHash, resendCount, expiresAt, normalizedIp);

    // 10. Envio via Resend
    const resend = this.getResendClient();
    if (!resend) {
      db.prepare("UPDATE email_verifications SET status = 'failed' WHERE id = ?").run(verificationId);
      return {
        success: false,
        error: 'Serviço de envio de e-mails temporariamente indisponível. Tente novamente mais tarde.'
      };
    }

    try {
      let emailSubject = isExistingAccount ? 'Notificação de segurança e código de verificação Zemda' : 'Seu código de verificação Zemda';
      if (purpose === 'password_reset') {
        emailSubject = 'Recuperação de senha - Seu código Zemda';
      }

      const sendResult = await resend.emails.send({
        from: this.getFromAddress(),
        replyTo: this.getReplyToAddress(),
        to: email,
        subject: emailSubject,
        html: this.buildOtpHtml(code, purpose, isExistingAccount)
      });

      if (sendResult.error) {
        db.prepare("UPDATE email_verifications SET status = 'failed' WHERE id = ?").run(verificationId);
        return {
          success: false,
          error: 'Não foi possível enviar o e-mail de verificação. Verifique se o endereço é válido e tente novamente.'
        };
      }
    } catch {
      db.prepare("UPDATE email_verifications SET status = 'failed' WHERE id = ?").run(verificationId);
      return {
        success: false,
        error: 'Falha ao conectar ao serviço de e-mail. Tente novamente em alguns instantes.'
      };
    }

    return { success: true };
  }

  private static parseUtcDate(dateStr: string): Date {
    if (!dateStr) return new Date(0);
    const clean = dateStr.trim();
    if (clean.endsWith('Z') || clean.includes('+')) {
      return new Date(clean);
    }
    return new Date(clean.replace(' ', 'T') + 'Z');
  }

  /**
   * Valida o código digitado pelo usuário.
   * Se correto, marca como 'verified' e gera um token JWT assinado de curta duração.
   */
  static verifyCode(
    rawEmail: string,
    rawCode: string,
    purpose: string = 'clinic_registration'
  ): { success: boolean; emailVerificationToken?: string; error?: string } {
    const email = (rawEmail || '').trim().toLowerCase();
    const code = (rawCode || '').toString().replace(/\D/g, '').trim();

    if (!email || !code || code.length !== 6) {
      return { success: false, error: 'Código de verificação deve conter 6 dígitos' };
    }

    if (purpose !== 'clinic_registration' && purpose !== 'password_reset') {
      return { success: false, error: 'Finalidade de verificação não suportada' };
    }

    try {
      this.getOtpSecret();
    } catch {
      return {
        success: false,
        error: 'Serviço de verificação temporariamente indisponível. Contate o suporte.'
      };
    }

    // Busca o registro pendente mais recente
    const record = db.prepare(`
      SELECT *
      FROM email_verifications
      WHERE email = ? AND purpose = ? AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(email, purpose) as EmailVerificationRecord | undefined;

    if (!record) {
      return {
        success: false,
        error: 'Código de verificação inválido ou expirado. Solicite um novo código.'
      };
    }

    // Verifica expiração (10 minutos)
    const now = Date.now();
    const expiresAt = this.parseUtcDate(record.expires_at).getTime();
    if (now > expiresAt) {
      db.prepare("UPDATE email_verifications SET status = 'expired' WHERE id = ?").run(record.id);
      return {
        success: false,
        error: 'O código de verificação expirou (validade de 10 minutos). Solicite um novo código.'
      };
    }

    // Verifica limite de tentativas (máximo 5)
    if (record.attempts >= 5) {
      db.prepare("UPDATE email_verifications SET status = 'blocked' WHERE id = ?").run(record.id);
      return {
        success: false,
        error: 'Número máximo de tentativas excedido (5 tentativas). Solicite um novo código.'
      };
    }

    // Compara o hash de forma segura contra timing-attacks
    const computedHash = this.hashCode(email, code, purpose);
    const hashesMatch = crypto.timingSafeEqual(
      Buffer.from(computedHash, 'utf-8'),
      Buffer.from(record.code_hash, 'utf-8')
    );

    if (!hashesMatch) {
      const newAttempts = record.attempts + 1;
      const isNowBlocked = newAttempts >= 5;
      const newStatus = isNowBlocked ? 'blocked' : 'pending';

      db.prepare('UPDATE email_verifications SET attempts = ?, status = ? WHERE id = ?').run(
        newAttempts,
        newStatus,
        record.id
      );

      if (isNowBlocked) {
        return {
          success: false,
          error: 'Número máximo de tentativas excedido (5 tentativas). Solicite um novo código.'
        };
      }

      const remaining = 5 - newAttempts;
      return {
        success: false,
        error: `Código incorreto. Você ainda tem ${remaining} tentativa(s).`
      };
    }

    // Sucesso na conferência do código
    db.prepare(`
      UPDATE email_verifications
      SET status = 'verified', verified_at = datetime('now')
      WHERE id = ?
    `).run(record.id);

    // Emissão do token assinado de verificação (válido por 15 minutos)
    const token = this.generateVerificationToken(email, purpose, record.id);

    return {
      success: true,
      emailVerificationToken: token
    };
  }

  /**
   * Gera o emailVerificationToken assinado com expiração de 15 minutos.
   */
  private static generateVerificationToken(
    email: string,
    purpose: string,
    verificationId: string
  ): string {
    const secret = this.getOtpSecret();
    const payload: VerificationTokenPayload = {
      email,
      purpose,
      verified: true,
      verificationId
    };
    return jwt.sign(payload, secret, { expiresIn: '15m' });
  }

  /**
   * Valida a autenticidade e validade do emailVerificationToken recebido no cadastro.
   */
  static verifyVerificationToken(
    token: string,
    expectedEmail: string,
    expectedPurpose: string = 'clinic_registration'
  ): { valid: boolean; payload?: VerificationTokenPayload; error?: string } {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'Token de verificação de e-mail não fornecido' };
    }

    let secret: string;
    try {
      secret = this.getOtpSecret();
    } catch {
      return { valid: false, error: 'Serviço de verificação temporariamente indisponível' };
    }

    let decoded: VerificationTokenPayload;
    try {
      decoded = jwt.verify(token, secret) as VerificationTokenPayload;
    } catch (err: any) {
      if (err?.name === 'TokenExpiredError') {
        return { valid: false, error: 'O tempo limite de verificação expirou. Valide seu e-mail novamente.' };
      }
      return { valid: false, error: 'Token de verificação de e-mail inválido ou adulterado' };
    }

    if (!decoded || !decoded.verified || decoded.purpose !== expectedPurpose) {
      return { valid: false, error: 'Token de verificação de e-mail inválido' };
    }

    const cleanExpected = (expectedEmail || '').trim().toLowerCase();
    if (decoded.email.toLowerCase() !== cleanExpected) {
      return { valid: false, error: 'O e-mail verificado não corresponde ao e-mail informado no cadastro' };
    }

    // Confere no banco se o registro correspondente existe, está com status 'verified' e ainda não foi consumido
    const record = db.prepare(`
      SELECT *
      FROM email_verifications
      WHERE id = ? AND email = ? AND purpose = ?
    `).get(decoded.verificationId, cleanExpected, expectedPurpose) as EmailVerificationRecord | undefined;

    if (!record) {
      return { valid: false, error: 'Registro de verificação de e-mail não encontrado' };
    }

    if (record.status === 'consumed' || record.consumed_at) {
      return { valid: false, error: 'Esta verificação de e-mail já foi utilizada em outro cadastro' };
    }

    if (record.status !== 'verified') {
      return { valid: false, error: `Verificação de e-mail não confirmada (status: ${record.status})` };
    }

    return { valid: true, payload: decoded };
  }

  /**
   * Executa a atualização atômica e condicional do token para 'consumed'.
   * Exige: UPDATE email_verifications SET status='consumed', consumed_at=datetime('now')
   * WHERE id=? AND status='verified' AND consumed_at IS NULL
   * Retorna true se e somente se exatamente 1 linha foi alterada.
   */
  static consumeVerificationToken(verificationId: string): boolean {
    const result = db.prepare(`
      UPDATE email_verifications
      SET status = 'consumed', consumed_at = datetime('now')
      WHERE id = ? AND status = 'verified' AND consumed_at IS NULL
    `).run(verificationId);

    return result.changes === 1;
  }

  /**
   * Alias de conveniência mantido para compatibilidade.
   */
  static markVerificationConsumed(verificationId: string): boolean {
    return this.consumeVerificationToken(verificationId);
  }
}
