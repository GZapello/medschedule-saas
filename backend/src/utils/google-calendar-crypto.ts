import crypto from 'crypto';

// Dedicated keys only. Previous keys are explicitly supplied during rotation.
function key(seed: string): Buffer {
  if (Buffer.byteLength(seed) < 32) throw new Error('Configure uma chave dedicada de pelo menos 32 bytes para Google Agenda.');
  return crypto.createHash('sha256').update(seed).digest();
}
export function calendarEncryptionConfigured(): boolean {
  return Buffer.byteLength(process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY || '') >= 32;
}
export function encryptRefreshToken(token: string): string {
  if (!token) throw new Error('Token ausente.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY || ''), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ciphertext.toString('hex')}`;
}
export function decryptRefreshToken(payload: string): string | null {
  const parts = payload.split(':');
  if (parts.length !== 3 || !/^[a-f0-9]{24}$/i.test(parts[0]) || !/^[a-f0-9]{32}$/i.test(parts[1]) || !/^(?:[a-f0-9]{2})+$/i.test(parts[2])) return null;
  let previous: string[] = [];
  try {
    const parsed = JSON.parse(process.env.GOOGLE_CALENDAR_PREVIOUS_ENCRYPTION_KEYS || '[]');
    if (Array.isArray(parsed)) previous = parsed.filter((v): v is string => typeof v === 'string');
  } catch { return null; }
  for (const seed of [process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY || '', ...previous]) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key(seed), Buffer.from(parts[0], 'hex'));
      decipher.setAuthTag(Buffer.from(parts[1], 'hex'));
      return Buffer.concat([decipher.update(Buffer.from(parts[2], 'hex')), decipher.final()]).toString('utf8');
    } catch { /* Never log credentials or crypto payloads. */ }
  }
  return null;
}
