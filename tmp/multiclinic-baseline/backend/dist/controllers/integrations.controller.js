"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationsController = void 0;
const asaas_service_1 = require("../services/asaas.service");
// ============================================================================
// INTEGRATIONS CONTROLLER — Gestão e Monitoramento de Integrações Externas
// ============================================================================
class IntegrationsController {
    /**
     * Valida conectividade e autenticação com a API do Asaas Sandbox.
     * Endpoint administrativo protegido: GET /api/admin/integrations/asaas/status
     */
    static async getAsaasStatus(req, res) {
        try {
            const status = await asaas_service_1.AsaasService.checkConnection();
            if (status.connected) {
                res.status(200).json({
                    connected: true,
                    environment: status.environment
                });
            }
            else {
                res.status(200).json({
                    connected: false,
                    environment: status.environment,
                    error: status.error || 'Falha ao autenticar na API do Asaas Sandbox'
                });
            }
        }
        catch (err) {
            console.error('[IntegrationsController] Erro inesperado ao verificar status Asaas:', err.message || err);
            res.status(500).json({
                connected: false,
                environment: asaas_service_1.AsaasService.getEnvironment(),
                error: 'Erro interno ao consultar o serviço de pagamentos'
            });
        }
    }
}
exports.IntegrationsController = IntegrationsController;
