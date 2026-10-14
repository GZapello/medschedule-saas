import { InfobipService, InfobipSendResult, InfobipStatus } from './infobip.service';

/**
 * Serviço Unificado de Mensageria WhatsApp (Zemda)
 * Provider Oficial Exclusivo: Infobip
 */
export class WhatsAppService {
  /**
   * Indica se a integração oficial de WhatsApp com a Infobip está operante e configurada.
   */
  public static isConnected(): boolean {
    return InfobipService.isConfigured();
  }

  /**
   * Retorna os metadados de status e conectividade do provedor oficial Infobip.
   */
  public static getStatus(): InfobipStatus {
    return InfobipService.getStatus();
  }

  /**
   * Envia uma mensagem de texto simples via Infobip WhatsApp.
   */
  public static async sendTextMessage(params: {
    recipientPhone: string;
    messageText: string;
  }): Promise<InfobipSendResult> {
    return InfobipService.sendTextMessage(params.recipientPhone, params.messageText);
  }
}
