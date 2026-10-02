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
      const clientId = process.env.GOOGLE_CLIENT_ID;
      this.client = new OAuth2Client(clientId);
    }
    return this.client;
  }

  /**
   * Valida ID Token (JWT) emitido pelo Google Identity Services.
   * Valida estritamente: assinatura, audience, issuer, expiração, email e email_verified.
   */
  static async verifyIdToken(idToken: string): Promise<VerifiedGoogleUser> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new Error('GOOGLE_CLIENT_ID não configurado no servidor.');
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
      console.error('[GoogleAuthService] Falha na validação do idToken:', err?.message || err);
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
