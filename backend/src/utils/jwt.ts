import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secure-secret-key-saas-platform-2026-x99';
const JWT_EXPIRES_IN = '7d';

export interface TokenPayload {
  userId: string;
  tenantId: string | null;
  role: 'superadmin' | 'clinic_admin' | 'professional' | 'receptionist' | 'patient';
  email: string;
  name: string;
}

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (err) {
    return null;
  }
}
