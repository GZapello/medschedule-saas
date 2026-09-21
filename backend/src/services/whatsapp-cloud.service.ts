import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';
import { normalizePhoneWithDDI } from '../utils/phone.utils';

export interface WhatsAppCloudConfig {
  appId: string;
  configId: string;
  apiVersion: string;
  isConfigured: boolean;
}

export interface WhatsAppCloudSystemIntegrationView {
  id: string;
  wabaId: string;
  phoneNumberId: string;
  businessId?: string | null;
  phoneNumber?: string | null;
  displayPhoneNumber?: string | null;
  coexistenceMode: boolean;
  status: 'connected' | 'disconnected' | 'pending' | 'error';
  tokenExpiresAt?: string | null;
  connectedAt: string;
  updatedAt: string;
}

export interface WhatsAppCloudStatusResponse {
  connected: boolean;
  coexistenceActive: boolean;
  integration: WhatsAppCloudSystemIntegrationView | null;
}

export class WhatsAppCloudService {
  private static getAppId(): string {
    return (
      process.env.META_APP_ID ||
      process.env.VITE_META_APP_ID ||
      ''
    ).trim();
  }

  private static getAppSecret(): string {
    return (process.env.META_APP_SECRET || '').trim();
  }

  private static getConfigId(): string {
    return (
      process.env.META_WHATSAPP_CONFIG_ID ||
      process.env.VITE_META_WHATSAPP_CONFIG_ID ||
      ''
    ).trim();
  }

  public static getGraphApiVersion(): string {
    return (process.env.META_GRAPH_API_VERSION || 'v25.0').trim();
  }

  /**
   * Obtém a chave estrita para AES-256-GCM via WHATSAPP_TOKEN_ENCRYPTION_KEY.
   * FALHA DE FORMA SEGURA sem qualquer fallback quando não configurada.
   */
  public static getEncryptionKey(): Buffer {
    const rawKey = (process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY || '').trim();
    if (!rawKey) {
      throw new Error(
        'WHATSAPP_TOKEN_ENCRYPTION_KEY não configurada no ambiente. Criptografia segura indisponível.'
      );
    }
    // Deriva chave de 32 bytes (256 bits)
    return crypto.createHash('sha256').update(rawKey).digest();
  }

  /**
   * Criptografia autenticada AES-256-GCM com IV aleatório (12 bytes) e authentication tag (16 bytes).
   * Retorna no formato: `${ivHex}:${authTagHex}:${cipherHex}`.
   */
  public static encryptToken(plainText: string): string {
    if (!plainText) return '';
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decriptografia autenticada AES-256-GCM.
   * Valida a tag de autenticação e falha se houver adulteração.
   */
  public static decryptToken(encryptedPayload: string): string {
    if (!encryptedPayload) return '';
    const key = this.getEncryptionKey();
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) {
      throw new Error('Payload criptografado inválido para AES-256-GCM.');
    }
    const [ivHex, authTagHex, cipherHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Retorna os identificadores públicos para inicialização do Meta SDK no SuperAdmin.
   * NUNCA expõe o App Secret, tokens ou chaves criptográficas.
   */
  public static getConfig(): WhatsAppCloudConfig {
    const appId = this.getAppId();
    const configId = this.getConfigId();
    const appSecret = this.getAppSecret();
    const apiVersion = this.getGraphApiVersion();
    const hasKey = Boolean((process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY || '').trim());

    return {
      appId,
      configId,
      apiVersion,
      isConfigured: Boolean(appId && configId && appSecret && hasKey)
    };
  }

  /**
   * Troca segura server-to-server do authorization code pelo access token na Meta Graph API.
   * Utiliza a versão configurada em META_GRAPH_API_VERSION (v25.0 padrão).
   */
  public static async exchangeCodeForToken(code: string): Promise<{
    accessToken: string;
    tokenType: string;
    expiresIn?: number;
  }> {
    const appId = this.getAppId();
    const appSecret = this.getAppSecret();
    const apiVersion = this.getGraphApiVersion();

    if (!appId || !appSecret) {
      throw new Error(
        'Credenciais da Meta Cloud API (META_APP_ID e META_APP_SECRET) não configuradas no servidor.'
      );
    }

    if (!code || typeof code !== 'string') {
      throw new Error('Código de autorização inválido ou ausente do Embedded Signup.');
    }

    const url = `https://graph.facebook.com/${encodeURIComponent(
      apiVersion
    )}/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(
      appSecret
    )}&code=${encodeURIComponent(code)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });

    const data: any = await response.json();

    if (!response.ok || data.error) {
      const errorMessage =
        data.error?.message ||
        `Erro ${response.status} ao trocar authorization code na Meta Graph API ${apiVersion}.`;
      console.error(
        `[WhatsAppCloud] Falha na troca do code Meta: ${errorMessage}`
      );
      throw new Error(`Falha na autorização Meta: ${errorMessage}`);
    }

    return {
      accessToken: data.access_token,
      tokenType: data.token_type || 'Bearer',
      expiresIn: data.expires_in
    };
  }

  /**
   * Valida e descobre server-to-server WABA ID e Phone Number ID diretamente na Meta Graph API.
   * Regras estritas:
   * 1. NUNCA considera IDs válidos apenas porque vieram do frontend.
   * 2. Consulta server-to-server /{wabaId}/phone_numbers com o token autorizado.
   * 3. Se a Graph API retornar erro, timeout, 401/403/404 ou resposta inválida, aborta e lança exceção.
   * 4. Confirma obrigatoriamente que o phoneNumberId está presente na lista de números da WABA.
   * 5. Se houver múltiplos números na WABA e nenhum phoneNumberId tiver sido fornecido, NÃO seleciona data[0]; exige identificação inequívoca ou lança erro.
   * 6. Confirma os detalhes individuais do número via Graph API /{phoneNumberId}.
   */
  public static async discoverAndValidateIds(
    accessToken: string,
    candidateWabaId?: string,
    candidatePhoneNumberId?: string
  ): Promise<{
    wabaId: string;
    phoneNumberId: string;
    displayPhoneNumber?: string;
    verifiedName?: string;
  }> {
    const apiVersion = this.getGraphApiVersion();
    let resolvedWabaId = candidateWabaId && candidateWabaId !== 'pending_waba' ? candidateWabaId.trim() : '';
    const providedPhoneNumberId = candidatePhoneNumberId && candidatePhoneNumberId !== 'pending_phone_id' ? candidatePhoneNumberId.trim() : '';

    // 1. Se WABA ID não foi fornecido, tenta descobrir via /me/whatsapp_business_accounts
    if (!resolvedWabaId) {
      let wabaRes: Response;
      try {
        wabaRes = await fetch(`https://graph.facebook.com/${apiVersion}/me/whatsapp_business_accounts`, {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
        });
      } catch (netErr: any) {
        throw new Error(`Falha de comunicação com a Meta Graph API ao buscar WABA: ${netErr.message || netErr}`);
      }

      const wabaData: any = await wabaRes.json().catch(() => ({}));
      if (!wabaRes.ok || wabaData.error) {
        const errMsg = wabaData.error?.message || `Status HTTP ${wabaRes.status}`;
        throw new Error(`Falha na validação de WABA com a Meta Graph API (${wabaRes.status}): ${errMsg}`);
      }

      if (!wabaData.data || !Array.isArray(wabaData.data) || wabaData.data.length === 0) {
        throw new Error('Nenhuma conta de WhatsApp Business (WABA) encontrada associada a este token na Meta.');
      }

      resolvedWabaId = String(wabaData.data[0].id).trim();
    }

    // 2. Consulta server-to-server /{wabaId}/phone_numbers com o token autorizado
    let phoneListRes: Response;
    try {
      phoneListRes = await fetch(
        `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(resolvedWabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,status,quality_rating`,
        {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
        }
      );
    } catch (netErr: any) {
      throw new Error(`Falha de comunicação com a Meta Graph API ao consultar números da WABA: ${netErr.message || netErr}`);
    }

    const phoneListData: any = await phoneListRes.json().catch(() => ({}));

    // Se a Graph API retornar erro, timeout, 401/403/404 ou resposta inválida, aborta imediatamente
    if (!phoneListRes.ok || phoneListData.error) {
      const errMsg = phoneListData.error?.message || `Status HTTP ${phoneListRes.status}`;
      throw new Error(`WABA ID (${resolvedWabaId}) inválida ou não autorizada na Meta Graph API (${phoneListRes.status}): ${errMsg}`);
    }

    const phoneList: any[] = Array.isArray(phoneListData.data) ? phoneListData.data : [];

    if (phoneList.length === 0) {
      throw new Error(`Nenhum número de telefone registrado na WABA (${resolvedWabaId}) na Meta Graph API.`);
    }

    let resolvedPhoneNumberId = '';
    let matchedItem: any = null;

    if (providedPhoneNumberId) {
      // 3. Confirmar OBRIGATORIAMENTE que phoneNumberId está presente na lista de números pertencentes à WABA informada
      matchedItem = phoneList.find(p => String(p.id) === String(providedPhoneNumberId));
      if (!matchedItem) {
        throw new Error(
          `O Phone Number ID (${providedPhoneNumberId}) não pertence à WABA informada (${resolvedWabaId}) ou não está associado a esta conta na Meta Graph API.`
        );
      }
      resolvedPhoneNumberId = String(matchedItem.id);
    } else {
      // 4. Se não foi fornecido phoneNumberId:
      // Se houver mais de um número na WABA e nenhum phoneNumberId tiver sido fornecido pelo Embedded Signup,
      // NÃO selecionar automaticamente data[0]. Exigir identificação inequívoca do número correto ou retornar erro.
      if (phoneList.length > 1) {
        throw new Error(
          `A WABA (${resolvedWabaId}) possui múltiplos números de telefone (${phoneList.length}) e nenhum Phone Number ID foi selecionado no onboarding. Conclua novamente o fluxo selecionando o número específico.`
        );
      }
      // Se houver exatamente um número, a identificação é inequívoca
      matchedItem = phoneList[0];
      resolvedPhoneNumberId = String(matchedItem.id);
    }

    // 5. Confirmar também os detalhes do número pela Graph API /{phoneNumberId} antes de salvar
    let detailsRes: Response;
    try {
      detailsRes = await fetch(
        `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(resolvedPhoneNumberId)}?fields=id,display_phone_number,verified_name,status,quality_rating`,
        {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
        }
      );
    } catch (netErr: any) {
      throw new Error(`Falha de comunicação ao validar os detalhes do número na Meta Graph API: ${netErr.message || netErr}`);
    }

    const detailsData: any = await detailsRes.json().catch(() => ({}));
    if (!detailsRes.ok || detailsData.error) {
      const errMsg = detailsData.error?.message || `Status HTTP ${detailsRes.status}`;
      throw new Error(`Falha ao validar Phone Number ID (${resolvedPhoneNumberId}) na Meta Graph API (${detailsRes.status}): ${errMsg}`);
    }

    const displayPhoneNumber = detailsData.display_phone_number || matchedItem.display_phone_number;
    const verifiedName = detailsData.verified_name || matchedItem.verified_name;

    return {
      wabaId: resolvedWabaId,
      phoneNumberId: resolvedPhoneNumberId,
      displayPhoneNumber,
      verifiedName
    };
  }

  /**
   * Salva com segurança a integração central única do SaaS com AES-256-GCM e coexistência ativa.
   * NUNCA persiste 'pending_waba' ou 'pending_phone_id'.
   */
  public static async saveSystemIntegration(params: {
    wabaId: string;
    phoneNumberId: string;
    businessId?: string;
    accessToken: string;
    expiresIn?: number;
    displayPhoneNumber?: string;
    phoneNumber?: string;
    createdBy?: string;
  }): Promise<WhatsAppCloudSystemIntegrationView> {
    if (
      !params.wabaId ||
      params.wabaId === 'pending_waba' ||
      !params.phoneNumberId ||
      params.phoneNumberId === 'pending_phone_id'
    ) {
      throw new Error(
        'Tentativa inválida de salvar integração com identificadores pendentes. Apenas conexões confirmadas podem ser salvas.'
      );
    }

    const encryptedToken = this.encryptToken(params.accessToken);
    let expiresAt: string | null = null;
    if (params.expiresIn && Number(params.expiresIn) > 0) {
      expiresAt = new Date(Date.now() + Number(params.expiresIn) * 1000).toISOString();
    }

    const existing = db
      .prepare('SELECT id FROM whatsapp_cloud_system_integrations LIMIT 1')
      .get() as any;

    const id = existing?.id || uuidv4();

    if (existing) {
      db.prepare(
        `UPDATE whatsapp_cloud_system_integrations
         SET waba_id = ?,
             phone_number_id = ?,
             business_id = COALESCE(?, business_id),
             phone_number = COALESCE(?, phone_number),
             display_phone_number = COALESCE(?, display_phone_number),
             coexistence_mode = 1,
             status = 'connected',
             encrypted_access_token = ?,
             token_expires_at = ?,
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        params.wabaId,
        params.phoneNumberId,
        params.businessId || null,
        params.phoneNumber || null,
        params.displayPhoneNumber || null,
        encryptedToken,
        expiresAt,
        id
      );
    } else {
      db.prepare(
        `INSERT INTO whatsapp_cloud_system_integrations (
           id, waba_id, phone_number_id, business_id,
           phone_number, display_phone_number, coexistence_mode,
           status, encrypted_access_token, token_expires_at,
           connected_at, updated_at, created_by
         ) VALUES (?, ?, ?, ?, ?, ?, 1, 'connected', ?, ?, datetime('now'), datetime('now'), ?)`
      ).run(
        id,
        params.wabaId,
        params.phoneNumberId,
        params.businessId || null,
        params.phoneNumber || null,
        params.displayPhoneNumber || null,
        encryptedToken,
        expiresAt,
        params.createdBy || null
      );
    }

    const saved = db
      .prepare(
        `SELECT id, waba_id, phone_number_id, business_id,
                phone_number, display_phone_number, coexistence_mode,
                status, token_expires_at, connected_at, updated_at
         FROM whatsapp_cloud_system_integrations
         WHERE id = ?`
      )
      .get(id) as any;

    return {
      id: saved.id,
      wabaId: saved.waba_id,
      phoneNumberId: saved.phone_number_id,
      businessId: saved.business_id,
      phoneNumber: saved.phone_number,
      displayPhoneNumber: saved.display_phone_number,
      coexistenceMode: Boolean(saved.coexistence_mode),
      status: saved.status,
      tokenExpiresAt: saved.token_expires_at,
      connectedAt: saved.connected_at,
      updatedAt: saved.updated_at
    };
  }

  /**
   * Consulta o status da integração central única do SaaS.
   * Não expõe tokens ou credenciais.
   */
  public static getSystemIntegration(): WhatsAppCloudStatusResponse {
    const record = db
      .prepare(
        `SELECT id, waba_id, phone_number_id, business_id,
                phone_number, display_phone_number, coexistence_mode,
                status, token_expires_at, connected_at, updated_at
         FROM whatsapp_cloud_system_integrations
         WHERE status = 'connected'
         LIMIT 1`
      )
      .get() as any;

    if (!record) {
      return {
        connected: false,
        coexistenceActive: false,
        integration: null
      };
    }

    return {
      connected: true,
      coexistenceActive: Boolean(record.coexistence_mode),
      integration: {
        id: record.id,
        wabaId: record.waba_id,
        phoneNumberId: record.phone_number_id,
        businessId: record.business_id,
        phoneNumber: record.phone_number,
        displayPhoneNumber: record.display_phone_number,
        coexistenceMode: Boolean(record.coexistence_mode),
        status: record.status,
        tokenExpiresAt: record.token_expires_at,
        connectedAt: record.connected_at,
        updatedAt: record.updated_at
      }
    };
  }

  /**
   * Desconecta a integração central e APAGA IMEDIATAMENTE o token criptografado
   * e a data de expiração, garantindo que nenhum segredo permaneça utilizável localmente.
   */
  public static disconnectSystemIntegration(): boolean {
    const res = db
      .prepare(
        `UPDATE whatsapp_cloud_system_integrations
         SET encrypted_access_token = NULL,
             token_expires_at = NULL,
             status = 'disconnected',
             updated_at = datetime('now')
         WHERE status = 'connected'`
      )
      .run();
    return res.changes > 0;
  }

  /**
   * Verifica se a integração oficial com a WhatsApp Cloud API está ativa e operante.
   */
  public static isConnected(): boolean {
    try {
      const rawKey = (process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY || '').trim();
      if (!rawKey) return false;

      const record = db
        .prepare(
          `SELECT encrypted_access_token, phone_number_id, status
           FROM whatsapp_cloud_system_integrations
           WHERE status = 'connected'
           LIMIT 1`
        )
        .get() as any;

      if (!record || !record.encrypted_access_token || !record.phone_number_id) {
        return false;
      }

      const token = this.decryptToken(record.encrypted_access_token);
      return Boolean(token && token.trim().length > 0);
    } catch {
      return false;
    }
  }

  /**
   * Envia mensagem de texto simples através da API oficial do WhatsApp Cloud.
   * Utiliza o token criptografado com AES-256-GCM e o Phone Number ID registrado.
   */
  public static async sendTextMessage(params: {
    recipientPhone: string;
    messageText: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const rawKey = (process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY || '').trim();
      if (!rawKey) {
        return { success: false, error: 'Chave de criptografia WHATSAPP_TOKEN_ENCRYPTION_KEY não configurada no ambiente.' };
      }

      const record = db
        .prepare(
          `SELECT encrypted_access_token, phone_number_id, status
           FROM whatsapp_cloud_system_integrations
           WHERE status = 'connected'
           LIMIT 1`
        )
        .get() as any;

      if (!record || !record.encrypted_access_token || !record.phone_number_id) {
        return { success: false, error: 'Integração oficial do WhatsApp não está conectada no sistema.' };
      }

      const accessToken = this.decryptToken(record.encrypted_access_token);
      const phoneNumberId = record.phone_number_id;
      const apiVersion = this.getGraphApiVersion();
      const normalizedPhone = normalizePhoneWithDDI(params.recipientPhone);

      const url = `https://graph.facebook.com/${encodeURIComponent(apiVersion)}/${encodeURIComponent(phoneNumberId)}/messages`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: normalizedPhone,
          type: 'text',
          text: {
            preview_url: false,
            body: params.messageText
          }
        })
      });

      const data: any = await response.json().catch(() => ({}));

      if (!response.ok || data.error) {
        const errMsg =
          data.error?.message ||
          `Erro HTTP ${response.status} ao disparar mensagem pela Meta Graph API`;
        console.error(`[WhatsAppCloudService.sendTextMessage] Falha Meta:`, data.error || errMsg);
        return { success: false, error: errMsg };
      }

      const messageId = data.messages?.[0]?.id || `wamid-${Date.now()}`;
      return { success: true, messageId };
    } catch (err: any) {
      console.error('[WhatsAppCloudService.sendTextMessage] Exceção:', err);
      return { success: false, error: err.message || 'Exceção ao disparar mensagem oficial' };
    }
  }
}
