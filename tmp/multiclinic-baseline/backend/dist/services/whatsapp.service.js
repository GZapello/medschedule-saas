"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppService = void 0;
const infobip_service_1 = require("./infobip.service");
/**
 * Serviço Unificado de Mensageria WhatsApp (Zemda)
 * Provider Oficial Exclusivo: Infobip
 */
class WhatsAppService {
    /**
     * Indica se a integração oficial de WhatsApp com a Infobip está operante e configurada.
     */
    static isConnected() {
        return infobip_service_1.InfobipService.isConfigured();
    }
    /**
     * Retorna os metadados de status e conectividade do provedor oficial Infobip.
     */
    static getStatus() {
        return infobip_service_1.InfobipService.getStatus();
    }
    /**
     * Envia uma mensagem de texto simples via Infobip WhatsApp.
     */
    static async sendTextMessage(params) {
        return infobip_service_1.InfobipService.sendTextMessage(params.recipientPhone, params.messageText);
    }
}
exports.WhatsAppService = WhatsAppService;
