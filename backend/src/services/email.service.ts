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
  status: 'pending' | 'verified' | 'consumed' | 'expired' | 'blocked' | 'invalidated';
  attempts: number;
  resend_count: number;
  expires_at: string;
  verified_at: string | null;
  consumed_at: string | null;
  last_sent_at: string | null;
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

  private static getOtpSecret(): string {
    return process.env.EMAIL_OTP_SECRET || process.env.JWT_SECRET || 'zemda-email-otp-secret-2026-x88';
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
  private static buildOtpHtml(code: string): string {
    const formattedCode = code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Seu código de verificação Zemda</title>
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
                Confirme seu e-mail
              </h1>
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #475569;">
                Para continuar seu cadastro no Zemda, utilize o código de verificação abaixo:
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

              <p style="margin: 0 0 16px; font-size: 13px; line-height: 1.5; color: #64748b;">
                O código expira em 10 minutos. Se você não solicitou este cadastro, ignore esta mensagem com segurança.
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
   */
  static async requestVerificationCode(
    rawEmail: string,
    purpose: string = 'clinic_registration'
  ): Promise<{ success: boolean; error?: string; remainingSeconds?: number }> {
    const email = (rawEmail || '').trim().toLowerCase();

    if (!email || !email.includes('@') || !email.includes('.')) {
      return { success: false, error: 'E-mail informado é inválido' };
    }

    if (purpose !== 'clinic_registration') {
      return { success: false, error: 'Finalidade de verificação não suportada' };
    }

    // 1. Verifica se o e-mail já pertence a uma conta de usuário ativa/existente
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return { success: false, error: 'Este e-mail já está cadastrado na plataforma. Faça login ou use outro e-mail.' };
    }

    // 2. Proteção contra envio repetitivo: Cooldown de 60 segundos
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

    // 3. Limite de segurança: máximo de 5 envios por hora para o mesmo e-mail
    const hourlyCountRow = db.prepare(`
      SELECT count(*) as total
      FROM email_verifications
      WHERE email = ? AND datetime(created_at) >= datetime('now', '-1 hour')
    `).get(email) as { total: number };

    if (hourlyCountRow && hourlyCountRow.total >= 5) {
      return {
        success: false,
        error: 'Limite de tentativas de envio por hora atingido para este e-mail. Aguarde antes de tentar novamente.'
      };
    }

    // 4. Invalida qualquer código anterior ainda pendente para este e-mail e propósito
    db.prepare(`
      UPDATE email_verifications
      SET status = 'invalidated'
      WHERE email = ? AND purpose = ? AND status = 'pending'
    `).run(email, purpose);

    // 5. Gera código numérico de 6 dígitos (100000 a 999999) e calcula o hash HMAC
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = this.hashCode(email, code, purpose);
    const verificationId = 'ev_' + uuidv4().replace(/-/g, '').slice(0, 16);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const nowIso = new Date().toISOString();

    const previousCountRow = db.prepare(`
      SELECT COALESCE(MAX(resend_count), 0) as last_count
      FROM email_verifications
      WHERE email = ? AND purpose = ?
    `).get(email, purpose) as { last_count: number } | undefined;

    const resendCount = (previousCountRow?.last_count || 0) + 1;

    // 6. Registra no banco de dados com hash seguro (código puro NUNCA é persistido nem logado)
    db.prepare(`
      INSERT INTO email_verifications (
        id, email, purpose, code_hash, status, attempts, resend_count,
        expires_at, verified_at, consumed_at, last_sent_at, created_at
      ) VALUES (?, ?, ?, ?, 'pending', 0, ?, ?, NULL, NULL, ?, datetime('now'))
    `).run(verificationId, email, purpose, codeHash, resendCount, expiresAt, nowIso);

    // 7. Envio real via Resend
    const resend = this.getResendClient();
    if (resend) {
      try {
        const sendResult = await resend.emails.send({
          from: this.getFromAddress(),
          replyTo: this.getReplyToAddress(),
          to: email,
          subject: 'Seu código de verificação Zemda',
          html: this.buildOtpHtml(code)
        });

        if (sendResult.error) {
          console.error('[EmailService] Erro retornado pela API do Resend:', sendResult.error.message);
          return {
            success: false,
            error: 'Não foi possível enviar o e-mail de verificação. Verifique se o endereço é válido e tente novamente.'
          };
        }
      } catch (sendErr: any) {
        console.error('[EmailService] Falha de comunicação com Resend:', sendErr?.message || sendErr);
        return {
          success: false,
          error: 'Falha ao conectar ao serviço de e-mail. Tente novamente em alguns instantes.'
        };
      }
    } else {
      // Se RESEND_API_KEY não estiver configurada no ambiente (ex: teste inicial local), registra aviso
      console.warn(`[EmailService] AVISO: RESEND_API_KEY não configurada. E-mail não pôde ser despachado para ${email}.`);
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
        error: 'Nenhum código pendente encontrado para este e-mail. Solicite um novo código.'
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

    const secret = this.getOtpSecret();
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
   * Marca a verificação como consumida após a criação da clínica/usuário.
   */
  static markVerificationConsumed(verificationId: string): void {
    db.prepare(`
      UPDATE email_verifications
      SET status = 'consumed', consumed_at = datetime('now')
      WHERE id = ?
    `).run(verificationId);
  }
}
