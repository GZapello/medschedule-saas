import { Request, Response } from 'express';
import { EmailService } from '../services/email.service';

export class EmailVerificationController {
  /**
   * POST /v1/public/email/request-code
   * Body: { email: string, purpose?: string }
   */
  static async requestCode(req: Request, res: Response): Promise<void> {
    try {
      const email = (req.body.email || '').trim();
      const purpose = (req.body.purpose || 'clinic_registration').trim();

      if (!email) {
        res.status(400).json({ error: 'O e-mail é obrigatório para envio do código de verificação' });
        return;
      }

      if (purpose !== 'clinic_registration') {
        res.status(400).json({ error: 'Finalidade de verificação não suportada' });
        return;
      }

      const result = await EmailService.requestVerificationCode(email, purpose);

      if (!result.success) {
        if (result.error?.includes('já está cadastrado')) {
          res.status(409).json({ error: result.error });
          return;
        }
        if (result.remainingSeconds) {
          res.status(429).json({
            error: result.error,
            remainingSeconds: result.remainingSeconds
          });
          return;
        }
        if (result.error?.includes('Limite de tentativas')) {
          res.status(429).json({ error: result.error });
          return;
        }
        res.status(400).json({ error: result.error || 'Erro ao processar solicitação de verificação' });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Código de verificação enviado com sucesso para o seu e-mail'
      });
    } catch (err: any) {
      console.error('[EmailVerificationController.requestCode] Erro inesperado:', err?.message || err);
      res.status(500).json({ error: 'Erro interno ao solicitar código de verificação de e-mail' });
    }
  }

  /**
   * POST /v1/public/email/verify-code
   * Body: { email: string, code: string, purpose?: string }
   */
  static verifyCode(req: Request, res: Response): void {
    try {
      const email = (req.body.email || '').trim();
      const code = (req.body.code || '').toString().trim();
      const purpose = (req.body.purpose || 'clinic_registration').trim();

      if (!email) {
        res.status(400).json({ error: 'O e-mail é obrigatório' });
        return;
      }

      if (!code) {
        res.status(400).json({ error: 'O código de verificação de 6 dígitos é obrigatório' });
        return;
      }

      const result = EmailService.verifyCode(email, code, purpose);

      if (!result.success) {
        res.status(400).json({ error: result.error || 'Código de verificação inválido' });
        return;
      }

      res.status(200).json({
        success: true,
        emailVerificationToken: result.emailVerificationToken
      });
    } catch (err: any) {
      console.error('[EmailVerificationController.verifyCode] Erro inesperado:', err?.message || err);
      res.status(500).json({ error: 'Erro interno ao validar código de verificação' });
    }
  }
}
