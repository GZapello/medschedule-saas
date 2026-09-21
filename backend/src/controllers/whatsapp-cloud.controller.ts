import { Request, Response } from 'express';
import { WhatsAppCloudService } from '../services/whatsapp-cloud.service';

export class WhatsAppCloudController {
  /**
   * Retorna os dados de configuração pública para inicialização do Meta SDK no SuperAdmin.
   * Não expõe segredos.
   * GET /v1/admin/whatsapp-cloud/config
   */
  public static async getConfig(req: Request, res: Response): Promise<void> {
    try {
      if ((req as any).user?.role !== 'superadmin') {
        res.status(403).json({
          success: false,
          error: 'Apenas superadministradores do SaaS possuem permissão para gerenciar a infraestrutura central de WhatsApp.',
          code: 'FORBIDDEN'
        });
        return;
      }

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
   * Retorna o status atual da conexão oficial central do Zemda com a WhatsApp Cloud API.
   * GET /v1/admin/whatsapp-cloud/status
   */
  public static async getStatus(req: Request, res: Response): Promise<void> {
    try {
      if ((req as any).user?.role !== 'superadmin') {
        res.status(403).json({
          success: false,
          error: 'Apenas superadministradores do SaaS possuem permissão para acessar o status do WhatsApp central.',
          code: 'FORBIDDEN'
        });
        return;
      }

      const status = WhatsAppCloudService.getSystemIntegration();
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
        error: 'Erro interno ao consultar status da integração central.'
      });
    }
  }

  /**
   * Recebe o authorization code emitido pelo Meta Embedded Signup do número central do Zemda.
   * Realiza a troca server-to-server por access token, valida WABA e Phone Number ID (sem permitir pending)
   * e persiste criptografado com AES-256-GCM.
   * POST /v1/admin/whatsapp-cloud/exchange-code
   */
  public static async exchangeCode(req: Request, res: Response): Promise<void> {
    try {
      if ((req as any).user?.role !== 'superadmin') {
        res.status(403).json({
          success: false,
          error: 'Apenas superadministradores do SaaS possuem permissão para conectar o WhatsApp central da plataforma.',
          code: 'FORBIDDEN'
        });
        return;
      }

      const userId = (req as any).user?.id;
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

      // 2. Descoberta e validação server-to-server de WABA ID e Phone Number ID (rejeita pending)
      const validatedIds = await WhatsAppCloudService.discoverAndValidateIds(
        tokenResult.accessToken,
        wabaId,
        phoneNumberId
      );

      // 3. Salva a integração central do sistema em modo de coexistência
      const integration = await WhatsAppCloudService.saveSystemIntegration({
        wabaId: validatedIds.wabaId,
        phoneNumberId: validatedIds.phoneNumberId,
        businessId,
        accessToken: tokenResult.accessToken,
        expiresIn: tokenResult.expiresIn,
        displayPhoneNumber: validatedIds.displayPhoneNumber || displayPhoneNumber,
        createdBy: userId
      });

      console.log(
        `[WhatsAppCloud] Integração Central do Zemda salva com sucesso. WABA: ${validatedIds.wabaId}, PhoneId: ${validatedIds.phoneNumberId}, Modo de Coexistência ATIVO.`
      );

      res.status(200).json({
        success: true,
        message: 'WhatsApp Central Oficial Zemda conectado com sucesso em modo de coexistência!',
        data: integration
      });
    } catch (err: any) {
      console.error('[WhatsAppCloudController] Erro no exchange-code:', err.message || err);
      res.status(400).json({
        success: false,
        error: err.message || 'Falha ao processar autorização do WhatsApp Central com a Meta.'
      });
    }
  }

  /**
   * Desconecta a integração central e apaga imediatamente o token criptografado e dados locais.
   * POST /v1/admin/whatsapp-cloud/disconnect
   */
  public static async disconnect(req: Request, res: Response): Promise<void> {
    try {
      if ((req as any).user?.role !== 'superadmin') {
        res.status(403).json({
          success: false,
          error: 'Apenas superadministradores do SaaS possuem permissão para desconectar o WhatsApp central.',
          code: 'FORBIDDEN'
        });
        return;
      }

      WhatsAppCloudService.disconnectSystemIntegration();

      res.status(200).json({
        success: true,
        message: 'WhatsApp Central Oficial Zemda desconectado e credenciais apagadas com sucesso.'
      });
    } catch (err: any) {
      console.error('[WhatsAppCloudController] Erro ao desconectar:', err.message || err);
      res.status(500).json({
        success: false,
        error: 'Erro interno ao desconectar integração central.'
      });
    }
  }
}
