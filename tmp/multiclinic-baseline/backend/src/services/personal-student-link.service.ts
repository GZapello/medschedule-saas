import crypto from 'crypto';

const SECRET_KEY_SEED = process.env.JWT_SECRET || process.env.ENCRYPTION_KEY || 'zemda-personal-student-link-aes256-secret-salt';
const DERIVED_KEY = crypto.createHash('sha256').update(SECRET_KEY_SEED).digest(); // Exactly 32 bytes for AES-256
const IV_LENGTH = 12; // 12 bytes recommended for GCM

/**
 * Gera token de acesso criptograficamente seguro e URL-safe (Base64URL, 32 bytes de entropia)
 */
export function generateStudentAccessToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Gera hash SHA-256 do token para indexação e busca pública ultra-rápida sem expor texto puro
 */
export function hashStudentAccessToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Criptografa o token via AES-256-GCM para armazenamento seguro no banco
 */
export function encryptStudentAccessToken(token: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', DERIVED_KEY, iv);
  
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decifra o token armazenado para permitir que o profissional visualize/copie o link ativo
 */
export function decryptStudentAccessToken(payload: string): string | null {
  try {
    const parts = payload.split(':');
    if (parts.length !== 3) return null;
    
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', DERIVED_KEY, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[personal-student-link.service] Erro ao decifrar token:', err);
    return null;
  }
}

/**
 * Avalia se o link expirou por 30 dias consecutivos sem acesso
 * Referência: last_access_at (se existir) ou created_at (se nunca acessado)
 */
export function evaluateInactivity(link: {
  last_access_at: string | null;
  created_at: string;
  inactivity_days?: number;
  status: string;
}) {
  const refDateStr = link.last_access_at || link.created_at;
  const refTime = new Date(refDateStr).getTime();
  const maxDays = link.inactivity_days || 30;
  const maxInactivityMs = maxDays * 24 * 60 * 60 * 1000;
  const expiresAtMs = refTime + maxInactivityMs;
  const now = Date.now();
  
  const msRemaining = expiresAtMs - now;
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
  const isExpired = now >= expiresAtMs;

  return {
    isExpired,
    expiresAt: new Date(expiresAtMs).toISOString(),
    daysRemaining,
    lastAccessAt: link.last_access_at,
    createdAt: link.created_at
  };
}
