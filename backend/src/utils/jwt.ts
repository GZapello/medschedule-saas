import jwt from 'jsonwebtoken';
import { db } from '../config/database';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secure-secret-key-saas-platform-2026-x99';
const JWT_EXPIRES_IN = '7d';

export interface TokenPayload {
  sessionVersion?: number;
  userId: string;
  tenantId: string | null;
  role: 'superadmin' | 'clinic_admin' | 'professional' | 'receptionist' | 'patient';
  email: string;
  name: string;
}

export function generateToken(payload: TokenPayload): string {
  const tenant = payload.tenantId ? db.prepare('SELECT session_version FROM tenants WHERE id = ?').get(payload.tenantId) : null;
  return jwt.sign({ ...payload, sessionVersion: tenant?.session_version || 0 }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (err) {
    return null;
  }
}
