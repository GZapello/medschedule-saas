import jwt from 'jsonwebtoken';
import { db } from '../config/database';

function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET não configurado no ambiente. Defina a variável de ambiente JWT_SECRET antes de iniciar o servidor.');
  }
  return secret;
}

const JWT_SECRET: string = requireJwtSecret();
const JWT_EXPIRES_IN = '7d';

export interface TokenPayload {
  sessionVersion?: number;
  userSessionVersion?: number;
  userId: string;
  tenantId: string | null;
  role: 'superadmin' | 'clinic_admin' | 'professional' | 'receptionist' | 'patient';
  email: string;
  name: string;
  scope?: 'whatsapp_update_only' | undefined;
  isSandbox?: boolean;
  sandboxSessionId?: string;
  sandboxAccountType?: 'manager' | 'professional';
  sandboxPlanCode?: string;
}

export function generateToken(payload: TokenPayload): string {
  const tenant = payload.tenantId ? db.prepare('SELECT session_version FROM tenants WHERE id = ?').get(payload.tenantId) : null;
  const user = payload.userId ? db.prepare('SELECT session_version FROM users WHERE id = ?').get(payload.userId) : null;
  return jwt.sign({
    ...payload,
    sessionVersion: (tenant as any)?.session_version || 0,
    userSessionVersion: (user as any)?.session_version || 0
  }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function generateRestrictedWhatsAppToken(payload: Omit<TokenPayload, 'scope'>): string {
  const user = payload.userId ? db.prepare('SELECT session_version FROM users WHERE id = ?').get(payload.userId) : null;
  return jwt.sign({
    ...payload,
    scope: 'whatsapp_update_only',
    sessionVersion: 0,
    userSessionVersion: (user as any)?.session_version || 0
  }, JWT_SECRET, { expiresIn: '1h' });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (err) {
    return null;
  }
}
