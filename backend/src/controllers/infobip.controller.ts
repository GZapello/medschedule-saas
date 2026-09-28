import { Request, Response } from 'express';
import { InfobipService } from '../services/infobip.service';
import { WhatsAppService } from '../services/whatsapp.service';
import { formatPhoneDisplay, cleanPhoneDigits, normalizePhoneWithDDI } from '../utils/phone.utils';

function maskPhoneNumber(phone: string): string {
  const digits = cleanPhoneDigits(phone);
  if (!digits || digits.length < 8) return '****';
  const prefix = digits.slice(0, 4);
  const suffix = digits.slice(-4);
  return `${prefix}****${suffix}`;
}

export class InfobipController {
  /**
   * Retorna os dados de diagnóstico de integração da Infobip (Exclusivo SuperAdmin do SaaS).
   * GET /v1/admin/integrations/infobip/status
   */
  public static async getStatus(req: Request, res: Response): Promise<void> {
    try {
      if ((req as any).user?.role !== 'superadmin') {
        res.status(403).json({
          success: false,
          error: 'Apenas superadministradores do SaaS possuem permissão para verificar a infraestrutura da Infobip.',
          code: 'FORBIDDEN'
        });
        return;
      }

      const status = InfobipService.getStatus();
      res.status(200).json({
        success: true,
        data: status
      });
    } catch (err: any) {
      console.error('[InfobipController.getStatus] Erro:', err.message || err);
      res.status(500).json({
        success: false,
        error: 'Erro interno ao consultar status da integração Infobip.'
      });
    }
  }

  /**
   * Disparo de teste oficial via WhatsApp Infobip (Exclusivo SuperAdmin).
   * POST /v1/admin/integrations/infobip/test
   * POST /api/admin/integrations/infobip/test
   */
  public static async sendTest(req: Request, res: Response): Promise<void> {
    try {
      if ((req as any).user?.role !== 'superadmin') {
        res.status(403).json({
          success: false,
          error: 'Apenas superadministradores do SaaS possuem permissão para realizar testes de disparo.',
          code: 'FORBIDDEN'
        });
        return;
      }

      const { to, message } = req.body || {};

      if (!to || typeof to !== 'string' || !to.trim()) {
        res.status(400).json({
          success: false,
          error: 'Número de telefone de destino (to) é obrigatório.'
        });
        return;
      }

      const testMessage = (typeof message === 'string' && message.trim())
        ? message.trim()
        : 'Olá! Esta é uma mensagem de teste do Zemda — Saúde & Gestão. 💚';

      const result = await InfobipService.sendTextMessage(to.trim(), testMessage);

      if (!result.success) {
        res.status(502).json({
          success: false,
          provider: 'infobip',
          error: result.error || 'Falha ao enviar mensagem de teste via Infobip.',
          rawResponse: result.rawResponse || null
        });
        return;
      }

      const normalized = normalizePhoneWithDDI(to.trim());

      res.status(200).json({
        success: true,
        provider: 'infobip',
        message: 'Mensagem de teste enviada com sucesso pela Infobip!',
        messageId: result.messageId,
        status: result.status,
        recipient: maskPhoneNumber(normalized),
        recipientFormatted: formatPhoneDisplay(normalized),
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('[InfobipController.sendTest] Erro:', err.message || err);
      res.status(500).json({
        success: false,
        provider: 'infobip',
        error: err.message || 'Erro interno ao processar disparo de teste Infobip.'
      });
    }
  }

  /**
   * Consulta autorizada para clínicas sobre a disponibilidade do WhatsApp oficial.
   * Não expõe tokens, segredos ou chaves.
   * GET /v1/whatsapp/status
   */
  public static async getClientStatus(req: Request, res: Response): Promise<void> {
    try {
      const isConnected = WhatsAppService.isConnected();
      const status = WhatsAppService.getStatus();

      res.status(200).json({
        success: true,
        data: {
          officialAvailable: isConnected,
          provider: 'infobip',
          sender: status.sender || null
        }
      });
    } catch (err: any) {
      console.error('[InfobipController.getClientStatus] Erro:', err.message || err);
      res.status(500).json({
        success: false,
        error: 'Erro ao verificar disponibilidade do WhatsApp'
      });
    }
  }
}
