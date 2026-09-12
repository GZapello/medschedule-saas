import { Request, Response, NextFunction } from 'express';
import { db } from '../config/database';

export function tenantMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 1. Se for SuperAdmin, permite definir/alternar o tenant pelo cabeçalho X-Tenant-ID
  if (req.user && req.user.role === 'superadmin') {
    const overrideTenant = req.headers['x-tenant-id'] as string;
    if (overrideTenant) {
      req.tenantId = overrideTenant;
    } else {
      // Fallback automático do SuperAdmin para a clínica ativa principal do sistema
      try {
        const defaultTenant = db.prepare("SELECT id FROM tenants WHERE status = 'active' ORDER BY created_at ASC LIMIT 1").get() as { id: string } | undefined;
        if (defaultTenant) {
          req.tenantId = defaultTenant.id;
        }
      } catch (_) {}
    }
    return next();
  }

  // 2. Se for usuário autenticado comum, valida contra spoofing cross-tenant
  if (req.user && req.user.tenantId) {
    const requestedTenant = req.headers['x-tenant-id'] as string;
    if (requestedTenant && requestedTenant !== req.user.tenantId) {
      res.status(403).json({ error: 'Acesso negado: você não tem autorização para acessar esta clínica' });
      return;
    }
    req.tenantId = req.user.tenantId;
    return next();
  }

  // 3. Se for requisição pública (ex: agendamento online por slug)
  const headerTenant = req.headers['x-tenant-id'] as string;
  const slugParam = (req.params.slug || req.query.tenantSlug || req.query.slug) as string;

  if (slugParam) {
    const stmt = db.prepare("SELECT id FROM tenants WHERE slug = ? AND status = 'active'");
    const row = stmt.get(slugParam) as { id: string } | undefined;
    if (row) {
      req.tenantId = row.id;
      return next();
    }
  }

  if (headerTenant) {
    req.tenantId = headerTenant;
    return next();
  }

  // Se nenhuma identificação de tenant foi encontrada e a rota exige tenant
  next();
}

export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  if (!req.tenantId) {
    res.status(400).json({ error: 'Identificação de clínica/tenant obrigatória para esta operação' });
    return;
  }
  next();
}
