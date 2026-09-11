import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'medschedule_super_secret_jwt_key_2026';

function verifyToken(token: string): { userId: string; role: string; email: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64url');
    if (signature !== expectedSig) return null;

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticação não fornecido.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  // Suporte a token demo local se necessário
  if (token === 'demo_token_admin') {
    (req as any).user = { userId: 'user-admin-1', role: 'admin', email: 'admin@medschedule.com' };
    return next();
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: 'Sessão expirada ou token inválido.' });
    return;
  }

  // Verificação estrita de RBAC
  if (decoded.role !== 'admin') {
    res.status(403).json({
      error: 'Acesso negado (403 Forbidden). Apenas administradores possuem autorização para este recurso.',
      currentRole: decoded.role
    });
    return;
  }

  (req as any).user = decoded;
  next();
}
