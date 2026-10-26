import crypto from 'crypto';

const SECRET_KEY_SEED =
  process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY ||
  process.env.JWT_SECRET ||
  'zemda-google-calendar-aes256-default-seed';

// Deriva chave de 32 bytes (256 bits) para AES-256-GCM
const DERIVED_KEY = crypto.createHash('sha256').update(SECRET_KEY_SEED).digest();
const IV_LENGTH = 12; // 12 bytes recomendado para GCM

/**
 * Criptografa o refresh token em repouso utilizando AES-256-GCM.
 * Formato retornado: iv_hex:authTag_hex:ciphertext_hex
 */
export function encryptRefreshToken(token: string): string {
  if (!token) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', DERIVED_KEY, iv);

  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decifra o refresh token seguro.
 * Retorna null em caso de falha de autenticação ou integridade.
 */
export function decryptRefreshToken(payload: string): string | null {
  if (!payload) return null;
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
    console.error('[GoogleCalendarCrypto] Falha ao decifrar token em repouso:', err);
    return null;
  }
}
