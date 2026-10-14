import { OAuth2Client } from 'google-auth-library';

export interface VerifiedGoogleUser {
  sub: string;
  email: string;
  name: string;
  picture?: string | null;
  emailVerified: boolean;
}

export class GoogleAuthService {
  private static client: OAuth2Client | null = null;

  private static getClient(): OAuth2Client {
    if (!this.client) {
      const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
      this.client = new OAuth2Client(clientId);
    }
    return this.client;
  }

  /**
   * Valida ID Token (JWT) emitido pelo Google Identity Services.
   * Valida estritamente: assinatura, audience, issuer, expiração, email e email_verified.
   */
  static async verifyIdToken(idToken: string): Promise<VerifiedGoogleUser> {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!clientId || !/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
      throw Object.assign(new Error('Login Google indisponível: GOOGLE_CLIENT_ID ausente ou inválido no servidor.'), {status:503});
    }

    if (!idToken || typeof idToken !== 'string') {
      throw new Error('Token do Google não fornecido ou inválido.');
    }

    const client = this.getClient();

    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken,
        audience: clientId
      });
    } catch (err: any) {
      if (/audience|recipient/i.test(err?.message || '')) {
        console.error('[GoogleAuthService] Audience incompatível: confira GOOGLE_CLIENT_ID e VITE_GOOGLE_CLIENT_ID.');
        throw new Error('Configuração Google incompatível entre site e servidor. O administrador deve conferir os Client IDs.');
      }
      console.error('[GoogleAuthService] Credencial rejeitada na verificação de assinatura/validade.');
      throw new Error('Credencial do Google inválida ou expirada.');
    }

    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('Payload da credencial Google vazio.');
    }

    // 1. Validação obrigatória de emissor (issuer)
    const iss = payload.iss;
    if (iss !== 'accounts.google.com' && iss !== 'https://accounts.google.com') {
      throw new Error('Emissor (issuer) da credencial Google inválido.');
    }

    // 2. Validação obrigatória de expiração
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      throw new Error('Credencial do Google expirada.');
    }

    // 3. Validação do identificador único estável (sub)
    if (!payload.sub) {
      throw new Error('Identificador estável (sub) do Google ausente no token.');
    }

    // 4. Validação do e-mail
    if (!payload.email) {
      throw new Error('E-mail não fornecido pela conta Google.');
    }

    // 5. Validação de e-mail verificado
    if (payload.email_verified !== true) {
      throw new Error('O e-mail da conta Google não foi verificado.');
    }

    return {
      sub: payload.sub,
      email: payload.email.toLowerCase().trim(),
      name: (payload.name || payload.email.split('@')[0]).trim(),
      picture: payload.picture || null,
      emailVerified: true
    };
  }
}
