import { Request, Response, NextFunction } from 'express';
import { pendingBillingManager } from '../services/billing.service';
import { db } from '../config/database';
import { verifyToken, TokenPayload } from '../utils/jwt';

// Extensão da tipagem de Request para carregar o usuário autenticado e o tenant
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      tenantId?: string;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let token: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    res.status(401).json({ error: 'Token de autenticação não fornecido ou inválido' });
    return;
  }
  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({ error: 'Token expirado ou inválido' });
    return;
  }

  const account = db.prepare('SELECT id, role, status, tenant_id FROM users WHERE id = ?').get(payload.userId);
  if (!account || (account.status !== 'active' && !pendingBillingManager(account)) || account.role !== payload.role) {
    res.status(401).json({ error: 'Sessão inválida. Entre novamente.' }); return;
  }
  if (payload.role !== 'superadmin') {
    const tenant = db.prepare('SELECT status, session_version FROM tenants WHERE id = ?').get(payload.tenantId);
    const membership = db.prepare('SELECT status FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(payload.userId, payload.tenantId);
    if (!tenant || (tenant.status !== 'active' && !(tenant.status === 'pending' && pendingBillingManager(account))) || (payload.sessionVersion || 0) !== tenant.session_version ||
      (membership ? (membership.status !== 'active' && !pendingBillingManager(account)) : account.tenant_id !== payload.tenantId)) {
      res.status(403).json({ error: 'Acesso à clínica bloqueado ou sessão invalidada.' }); return;
    }
  }
  req.user = payload;
  if (payload.tenantId) {
    req.tenantId = payload.tenantId;
  }

  next();
}
