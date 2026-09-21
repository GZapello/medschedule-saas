import { Request, Response } from 'express';
import { WhatsAppCloudService } from '../services/whatsapp-cloud.service';

export class WhatsAppCloudController {
  /**
   * Retorna os dados de configuração pública para inicialização do Meta SDK no frontend.
   * Não expõe segredos.
   * GET /v1/whatsapp-cloud/config
   */
  public static async getConfig(req: Request, res: Response): Promise<void> {
    try {
      const config = WhatsAppCloudService.getConfig();
      res.status(200).json({
        success: true,
        data: config
      });
    } catch (err: any) {
      console.error('[WhatsAppCloudController] Erro ao obter config:', err.message || err);
      res.status(500).json({
        success: false,
        error: 'Erro interno ao consultar configurações do WhatsApp Cloud.'
      });
    }
  }

  /**
   * Retorna o status atual da integração com a WhatsApp Cloud API para o tenant logado.
   * GET /v1/whatsapp-cloud/status
   */
  public static async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req as any).tenantId || (req as any).user?.tenant_id;
      if (!tenantId) {
        res.status(400).json({ success: false, error: 'Tenant ID não identificado na sessão.' });
        return;
      }

      const status = WhatsAppCloudService.getIntegration(tenantId);
      const config = WhatsAppCloudService.getConfig();

      res.status(200).json({
        success: true,
        data: {
          ...status,
          config
        }
      });
    } catch (err: any) {
      console.error('[WhatsAppCloudController] Erro ao obter status:', err.message || err);
      res.status(500).json({
        success: false,
        error: 'Erro interno ao consultar status da integração com WhatsApp Cloud.'
      });
    }
  }

  /**
   * Recebe o authorization code emitido pelo Meta Embedded Signup e os metadados
   * da sessão (waba_id, phone_number_id, business_id).
   * Realiza a troca server-to-server por access token permanente e persiste em modo coexistência.
   * POST /v1/whatsapp-cloud/exchange-code
   */
  public static async exchangeCode(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req as any).tenantId || (req as any).user?.tenant_id;
      const userId = (req as any).user?.id;

      if (!tenantId) {
        res.status(400).json({ success: false, error: 'Tenant ID não identificado na sessão.' });
        return;
      }

      const { code, wabaId, phoneNumberId, businessId, displayPhoneNumber } = req.body || {};

      if (!code || typeof code !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Código de autorização (code) da Meta não fornecido.'
        });
        return;
      }

      // 1. Troca server-to-server do code pelo access token
      const tokenResult = await WhatsAppCloudService.exchangeCodeForToken(code);

      // 2. Metadados do número de telefone (se phoneNumberId disponível)
      let resolvedPhoneDisplay = displayPhoneNumber;
      if (phoneNumberId) {
        const details = await WhatsAppCloudService.fetchPhoneNumberDetails(
          phoneNumberId,
          tokenResult.accessToken
        );
        if (details.displayPhoneNumber) {
          resolvedPhoneDisplay = details.displayPhoneNumber;
        }
      }

      // 3. Salva integração em modo de coexistência
      const integration = await WhatsAppCloudService.saveIntegration(tenantId, {
        wabaId: wabaId || 'pending_waba',
        phoneNumberId: phoneNumberId || 'pending_phone_id',
        businessId,
        accessToken: tokenResult.accessToken,
        expiresIn: tokenResult.expiresIn,
        displayPhoneNumber: resolvedPhoneDisplay,
        createdBy: userId
      });

      console.log(
        `[WhatsAppCloud] Integração salva com sucesso para o tenant ${tenantId}. Modo de Coexistência ATIVO.`
      );

      res.status(200).json({
        success: true,
        message: 'WhatsApp Business conectado com sucesso em modo de coexistência!',
        data: integration
      });
    } catch (err: any) {
      console.error('[WhatsAppCloudController] Erro no exchange-code:', err.message || err);
      res.status(400).json({
        success: false,
        error: err.message || 'Falha ao processar autorização do WhatsApp Business com a Meta.'
      });
    }
  }

  /**
   * Desconecta a integração do tenant.
   * POST /v1/whatsapp-cloud/disconnect
   */
  public static async disconnect(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req as any).tenantId || (req as any).user?.tenant_id;
      if (!tenantId) {
        res.status(400).json({ success: false, error: 'Tenant ID não identificado na sessão.' });
        return;
      }

      WhatsAppCloudService.disconnectIntegration(tenantId);

      res.status(200).json({
        success: true,
        message: 'Integração com WhatsApp Cloud API desconectada com sucesso.'
      });
    } catch (err: any) {
      console.error('[WhatsAppCloudController] Erro ao desconectar:', err.message || err);
      res.status(500).json({
        success: false,
        error: 'Erro interno ao desconectar integração.'
      });
    }
  }
}
