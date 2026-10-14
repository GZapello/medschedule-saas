import { Request, Response } from 'express';
import { AsaasService } from '../services/asaas.service';

// ============================================================================
// INTEGRATIONS CONTROLLER — Gestão e Monitoramento de Integrações Externas
// ============================================================================

export class IntegrationsController {
  /**
   * Valida conectividade e autenticação com a API do Asaas Sandbox.
   * Endpoint administrativo protegido: GET /api/admin/integrations/asaas/status
   */
  public static async getAsaasStatus(req: Request, res: Response): Promise<void> {
    try {
      const status = await AsaasService.checkConnection();
      
      if (status.connected) {
        res.status(200).json({
          connected: true,
          environment: status.environment
        });
      } else {
        res.status(200).json({
          connected: false,
          environment: status.environment,
          error: status.error || 'Falha ao autenticar na API do Asaas Sandbox'
        });
      }
    } catch (err: any) {
      console.error('[IntegrationsController] Erro inesperado ao verificar status Asaas:', err.message || err);
      res.status(500).json({
        connected: false,
        environment: AsaasService.getEnvironment(),
        error: 'Erro interno ao consultar o serviço de pagamentos'
      });
    }
  }
}
