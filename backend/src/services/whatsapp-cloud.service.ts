import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';

export interface WhatsAppCloudConfig {
  appId: string;
  configId: string;
  isConfigured: boolean;
}

export interface WhatsAppCloudIntegrationView {
  id: string;
  tenantId: string;
  wabaId: string;
  phoneNumberId: string;
  businessId?: string | null;
  phoneNumber?: string | null;
  displayPhoneNumber?: string | null;
  coexistenceMode: boolean;
  status: 'connected' | 'disconnected' | 'pending' | 'error';
  connectedAt: string;
  updatedAt: string;
}

export interface WhatsAppCloudStatusResponse {
  connected: boolean;
  coexistenceActive: boolean;
  integration: WhatsAppCloudIntegrationView | null;
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

  /**
   * Retorna os identificadores públicos para inicialização segura do Meta JS SDK no frontend.
   * NUNCA expõe o App Secret ou access tokens.
   */
  public static getConfig(): WhatsAppCloudConfig {
    const appId = this.getAppId();
    const configId = this.getConfigId();
    const appSecret = this.getAppSecret();

    return {
      appId,
      configId,
      isConfigured: Boolean(appId && configId && appSecret)
    };
  }

  /**
   * Derivação de chave AES-256 a partir do META_APP_SECRET
   */
  private static getDerivedKey(): Buffer {
    const secret = this.getAppSecret() || 'zemda-cloud-api-internal-encryption-seed';
    return crypto.createHash('sha256').update(secret).digest();
  }

  /**
   * Criptografia simétrica AES-256-CBC para armazenamento seguro do access token.
   */
  public static encryptToken(plainText: string): string {
    if (!plainText) return '';
    const iv = crypto.randomBytes(16);
    const key = this.getDerivedKey();
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * Decriptografia segura do access token para operações server-to-server.
   */
  public static decryptToken(encryptedText: string): string {
    if (!encryptedText || !encryptedText.includes(':')) return '';
    try {
      const [ivHex, cipherHex] = encryptedText.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const key = this.getDerivedKey();
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      return '';
    }
  }

  /**
   * Troca segura server-to-server do authorization code recebido do Embedded Signup
   * por um token de acesso de longa duração na Meta Graph API.
   * Não emite logs com tokens ou segredos.
   */
  public static async exchangeCodeForToken(code: string): Promise<{
    accessToken: string;
    tokenType: string;
    expiresIn?: number;
  }> {
    const appId = this.getAppId();
    const appSecret = this.getAppSecret();

    if (!appId || !appSecret) {
      throw new Error(
        'Credenciais da Meta Cloud API (META_APP_ID e META_APP_SECRET) não configuradas nas variáveis de ambiente do servidor.'
      );
    }

    if (!code || typeof code !== 'string') {
      throw new Error('Código de autorização inválido ou ausente fornecido pelo Embedded Signup.');
    }

    const url = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${encodeURIComponent(
      appId
    )}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    });

    const data: any = await response.json();

    if (!response.ok || data.error) {
      const errorMessage =
        data.error?.message ||
        `Erro ${response.status} ao trocar authorization code na Meta Graph API.`;
      console.error(
        `[WhatsAppCloud] Falha na troca do code Meta (status ${response.status}, code ${data.error?.code}): ${errorMessage}`
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
   * Consulta os metadados do número de telefone conectado (display_phone_number, verified_name)
   */
  public static async fetchPhoneNumberDetails(
    phoneNumberId: string,
    accessToken: string
  ): Promise<{ displayPhoneNumber?: string; verifiedName?: string }> {
    try {
      const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(
        phoneNumberId
      )}?fields=display_phone_number,verified_name`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        }
      });
      if (response.ok) {
        const data: any = await response.json();
        return {
          displayPhoneNumber: data.display_phone_number,
          verifiedName: data.verified_name
        };
      }
    } catch {
      // Ignora erro silenciosamente para não travar o fluxo de salvamento
    }
    return {};
  }

  /**
   * Salva com segurança a integração do tenant em modo de coexistência.
   * O access token é persistido criptografado e jamais exposto nas consultas.
   */
  public static async saveIntegration(
    tenantId: string,
    params: {
      wabaId: string;
      phoneNumberId: string;
      businessId?: string;
      accessToken: string;
      expiresIn?: number;
      displayPhoneNumber?: string;
      phoneNumber?: string;
      createdBy?: string;
    }
  ): Promise<WhatsAppCloudIntegrationView> {
    const encryptedToken = this.encryptToken(params.accessToken);
    let expiresAt: string | null = null;
    if (params.expiresIn) {
      expiresAt = new Date(Date.now() + params.expiresIn * 1000).toISOString();
    }

    // Busca se já existe registro prévio para o tenant
    const existing = db
      .prepare('SELECT id FROM whatsapp_cloud_integrations WHERE tenant_id = ? LIMIT 1')
      .get(tenantId) as any;

    const id = existing?.id || uuidv4();

    if (existing) {
      db.prepare(
        `UPDATE whatsapp_cloud_integrations 
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
        `INSERT INTO whatsapp_cloud_integrations (
           id, tenant_id, waba_id, phone_number_id, business_id,
           phone_number, display_phone_number, coexistence_mode,
           status, encrypted_access_token, token_expires_at,
           connected_at, updated_at, created_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'connected', ?, ?, datetime('now'), datetime('now'), ?)`
      ).run(
        id,
        tenantId,
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
        `SELECT id, tenant_id, waba_id, phone_number_id, business_id,
                phone_number, display_phone_number, coexistence_mode,
                status, connected_at, updated_at
         FROM whatsapp_cloud_integrations
         WHERE id = ?`
      )
      .get(id) as any;

    return {
      id: saved.id,
      tenantId: saved.tenant_id,
      wabaId: saved.waba_id,
      phoneNumberId: saved.phone_number_id,
      businessId: saved.business_id,
      phoneNumber: saved.phone_number,
      displayPhoneNumber: saved.display_phone_number,
      coexistenceMode: Boolean(saved.coexistence_mode),
      status: saved.status,
      connectedAt: saved.connected_at,
      updatedAt: saved.updated_at
    };
  }

  /**
   * Consulta o status da integração do tenant sem vazar credenciais ou segredos.
   */
  public static getIntegration(tenantId: string): WhatsAppCloudStatusResponse {
    const record = db
      .prepare(
        `SELECT id, tenant_id, waba_id, phone_number_id, business_id,
                phone_number, display_phone_number, coexistence_mode,
                status, connected_at, updated_at
         FROM whatsapp_cloud_integrations
         WHERE tenant_id = ? AND status = 'connected'
         ORDER BY connected_at DESC
         LIMIT 1`
      )
      .get(tenantId) as any;

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
        tenantId: record.tenant_id,
        wabaId: record.waba_id,
        phoneNumberId: record.phone_number_id,
        businessId: record.business_id,
        phoneNumber: record.phone_number,
        displayPhoneNumber: record.display_phone_number,
        coexistenceMode: Boolean(record.coexistence_mode),
        status: record.status,
        connectedAt: record.connected_at,
        updatedAt: record.updated_at
      }
    };
  }

  /**
   * Desconecta a integração do tenant de forma segura.
   */
  public static disconnectIntegration(tenantId: string): boolean {
    const res = db
      .prepare(
        `UPDATE whatsapp_cloud_integrations
         SET status = 'disconnected', updated_at = datetime('now')
         WHERE tenant_id = ? AND status = 'connected'`
      )
      .run(tenantId);
    return res.changes > 0;
  }
}
