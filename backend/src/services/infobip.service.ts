import { normalizePhoneWithDDI, isValidPhoneNumber } from '../utils/phone.utils';

export interface InfobipStatus {
  provider: 'infobip';
  hasApiKey: boolean;
  hasBaseUrl: boolean;
  baseUrlHost: string | null;
  hasSender: boolean;
  sender: string | null;
  isConfigured: boolean;
}

export interface InfobipSendResult {
  success: boolean;
  messageId?: string;
  status?: {
    groupId?: number;
    groupName?: string;
    id?: number;
    name?: string;
    description?: string;
  };
  error?: string;
  rawResponse?: any;
}

export class InfobipService {
  /**
   * Obtém a chave de API da Infobip com remoção de espaços em branco.
   */
  public static getApiKey(): string {
    return (process.env.INFOBIP_API_KEY || '').trim();
  }

  /**
   * Obtém e normaliza a URL base da Infobip.
   * Suporta formatos como:
   * - "xxxxx.api.infobip.com" -> "https://xxxxx.api.infobip.com"
   * - "https://xxxxx.api.infobip.com/" -> "https://xxxxx.api.infobip.com"
   */
  public static getBaseUrl(): string {
    const raw = (process.env.INFOBIP_BASE_URL || '').trim();
    if (!raw) return '';

    let url = raw.replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }
    return url;
  }

  /**
   * Extrai apenas o host público da Base URL para exibição segura sem path ou credenciais.
   */
  public static getBaseUrlHost(): string | null {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) return null;
    try {
      const parsed = new URL(baseUrl);
      return parsed.host;
    } catch {
      return baseUrl.replace(/^https?:\/\//i, '').split('/')[0] || null;
    }
  }

  /**
   * Obtém o número ou sender configurado para envio de mensagens WhatsApp.
   */
  public static getSender(): string {
    return (process.env.INFOBIP_WHATSAPP_SENDER || '').trim();
  }

  /**
   * Retorna se a infraestrutura da Infobip possui todas as credenciais necessárias configuradas.
   */
  public static isConfigured(): boolean {
    const apiKey = this.getApiKey();
    const baseUrl = this.getBaseUrl();
    const sender = this.getSender();
    return Boolean(apiKey && baseUrl && sender);
  }

  /**
   * Retorna o diagnóstico de configuração da Infobip sem expor segredos.
   */
  public static getStatus(): InfobipStatus {
    const apiKey = this.getApiKey();
    const baseUrl = this.getBaseUrl();
    const sender = this.getSender();

    return {
      provider: 'infobip',
      hasApiKey: Boolean(apiKey),
      hasBaseUrl: Boolean(baseUrl),
      baseUrlHost: this.getBaseUrlHost(),
      hasSender: Boolean(sender),
      sender: sender ? sender : null,
      isConfigured: Boolean(apiKey && baseUrl && sender)
    };
  }

  /**
   * Envia uma mensagem de texto via API oficial do WhatsApp da Infobip.
   * Endpoint: POST {INFOBIP_BASE_URL}/whatsapp/1/message/text
   * Headers:
   *   Authorization: App {INFOBIP_API_KEY}
   *   Content-Type: application/json
   *   Accept: application/json
   */
  public static async sendTextMessage(to: string, message: string): Promise<InfobipSendResult> {
    const apiKey = this.getApiKey();
    const baseUrl = this.getBaseUrl();
    const sender = this.getSender();

    // 1. Validação de Credenciais no Ambiente
    if (!apiKey) {
      return {
        success: false,
        error: 'Chave de API da Infobip (INFOBIP_API_KEY) não configurada no ambiente.'
      };
    }

    if (!baseUrl) {
      return {
        success: false,
        error: 'URL base da Infobip (INFOBIP_BASE_URL) não configurada no ambiente.'
      };
    }

    if (!sender) {
      return {
        success: false,
        error: 'WhatsApp Sender da Infobip (INFOBIP_WHATSAPP_SENDER) não configurado no ambiente.'
      };
    }

    // 2. Validação e Normalização do Destinatário
    const rawTo = String(to || '').trim();
    if (!rawTo) {
      return {
        success: false,
        error: 'Número do destinatário não informado.'
      };
    }

    const normalizedPhone = normalizePhoneWithDDI(rawTo);
    if (!isValidPhoneNumber(rawTo) || !normalizedPhone) {
      return {
        success: false,
        error: `Número de telefone inválido para envio via WhatsApp: "${rawTo}".`
      };
    }

    // 3. Validação do Conteúdo
    const text = String(message || '').trim();
    if (!text) {
      return {
        success: false,
        error: 'Texto da mensagem não pode ser vazio.'
      };
    }

    // 4. Interceptação segura de Sandbox e Telefones Fictícios
    if (
      normalizedPhone.includes('999990000') ||
      normalizedPhone.includes('988881111') ||
      normalizedPhone.includes('977772222') ||
      rawTo.toLowerCase().includes('sandbox')
    ) {
      console.log('[SANDBOX MOCK] Disparo de WhatsApp suprimido no modo teste/sandbox para:', normalizedPhone);
      return {
        success: true,
        messageId: `mock-infobip-${Date.now()}`,
        status: {
          groupId: 1,
          groupName: 'PENDING',
          id: 7,
          name: 'SANDBOX_MOCK',
          description: 'Disparo mockado com sucesso no ambiente Sandbox/Teste'
        }
      };
    }

    // 5. Montagem da Requisição HTTP para a API da Infobip
    const targetUrl = `${baseUrl}/whatsapp/1/message/text`;
    const payload = {
      from: sender,
      to: normalizedPhone,
      content: {
        text
      }
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Authorization': `App ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();
      let responseData: any = null;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { raw: responseText };
      }

      if (!response.ok) {
        // Formato padrão de erro da Infobip:
        // { "requestError": { "serviceException": { "messageId": "...", "text": "..." } } }
        const serviceException = responseData?.requestError?.serviceException;
        const errorDetail =
          serviceException?.text ||
          serviceException?.messageId ||
          responseData?.message ||
          responseData?.error ||
          `HTTP ${response.status} (${response.statusText})`;

        console.error(`[InfobipService.sendTextMessage] Falha Infobip (HTTP ${response.status}):`, errorDetail);

        return {
          success: false,
          error: `Falha no envio via Infobip: ${errorDetail}`,
          rawResponse: responseData
        };
      }

      // 6. Extração de messageId e status da resposta de sucesso
      const firstMessage = Array.isArray(responseData?.messages) ? responseData.messages[0] : null;
      const messageId = firstMessage?.messageId || responseData?.messageId || `ibp-${Date.now()}`;
      const status = firstMessage?.status || {
        groupName: 'PENDING',
        name: 'PENDING_ENROUTE',
        description: 'Mensagem recebida e em processamento pela Infobip'
      };

      return {
        success: true,
        messageId,
        status,
        rawResponse: responseData
      };
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError';
      const errMsg = isTimeout
        ? 'Tempo limite de resposta excedido ao comunicar com a Infobip (15s).'
        : (err?.message || 'Erro inesperado de comunicação com a Infobip.');

      console.error('[InfobipService.sendTextMessage] Exceção:', errMsg);

      return {
        success: false,
        error: errMsg
      };
    }
  }
}
