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

  // Tokens com escopo restrito de WhatsApp NUNCA têm acesso a nenhuma rota operacional do sistema
  if (payload.scope === 'whatsapp_update_only') {
    res.status(403).json({
      error: 'Acesso restrito exclusivamente à regularização do WhatsApp cadastrado.',
      code: 'WHATSAPP_UPDATE_RESTRICTED'
    });
    return;
  }

  const account = db.prepare('SELECT id, role, status, tenant_id, session_version, onboarding_status FROM users WHERE id = ?').get(payload.userId) as any;
  const isOnboarding = Boolean(account && account.onboarding_status && account.onboarding_status !== 'active');
  if (!account || ['blocked','inactive','rejected'].includes(account.status) || (account.status !== 'active' && !pendingBillingManager(account) && !isOnboarding) || (account.role === 'superadmin') !== (payload.role === 'superadmin') ||
    (payload.userSessionVersion || 0) !== (account.session_version || 0)) {
    res.status(401).json({ error: 'Sessão inválida. Entre novamente.' }); return;
  }
  if (payload.role !== 'superadmin') {
    const requested = req.headers['x-tenant-id'];
    if (requested !== undefined && (typeof requested !== 'string' || !requested.trim())) {
      res.status(403).json({error: 'Clínica inválida'}); return;
    }
    const selectedTenant = requested || payload.tenantId;
    const tenant = db.prepare('SELECT status, session_version, onboarding_status FROM tenants WHERE id = ?').get(selectedTenant) as any;
    // Idempotent compatibility backfill for legacy accounts provisioned after bootstrap.
    // Existing inactive/rejected memberships are never changed or recreated.
    if (selectedTenant === account.tenant_id && tenant && !db.prepare('SELECT 1 FROM clinic_users WHERE user_id=? LIMIT 1').get(account.id)) {
      db.prepare(`INSERT INTO clinic_users(id,tenant_id,user_id,role,status,is_manager) VALUES(?,?,?,?,?,?)`)
        .run('legacy-'+account.id,selectedTenant,account.id,account.role,account.status,account.role==='clinic_admin'?1:0);
    }
    const membership = db.prepare('SELECT status, role FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(payload.userId, selectedTenant) as any;
    const isTenantOnboarding = Boolean((tenant && tenant.onboarding_status && tenant.onboarding_status !== 'active') || isOnboarding);
    if (!tenant || (tenant.status !== 'active' && !(tenant.status === 'pending' && (pendingBillingManager(account) || isTenantOnboarding))) || (selectedTenant === payload.tenantId && (payload.sessionVersion || 0) !== tenant.session_version) ||
      (!membership || (membership.status !== 'active' && !(selectedTenant === account.tenant_id && (pendingBillingManager(account) || isTenantOnboarding))))) {
      res.status(403).json({ error: 'Acesso à clínica bloqueado ou sessão invalidada.' }); return;
    }
    payload.tenantId = selectedTenant;
    payload.role = membership.role;
  }
  req.user = payload;
  if (payload.tenantId) {
    req.tenantId = payload.tenantId;
  }

  next();
}

/**
 * Middleware de autorização restrita para consulta e atualização de WhatsApp.
 * Permite:
 * 1. Usuários ativos normais com sessão válida.
 * 2. Usuários com bloqueio por WhatsApp que possuem token restrito (scope === 'whatsapp_update_only')
 *    com verificação válida de integridade da conta e sessão.
 */
export function whatsappUpdateAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
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

  const account = db.prepare('SELECT id, name, email, role, status, tenant_id, session_version FROM users WHERE id = ?').get(payload.userId) as any;
  if (!account) {
    res.status(401).json({ error: 'Usuário não encontrado' });
    return;
  }

  // Validação de versão de sessão
  if ((payload.userSessionVersion || 0) !== (account.session_version || 0)) {
    res.status(401).json({ error: 'Sessão expirada ou invalidada. Faça login novamente.' });
    return;
  }

  // Se o usuário estiver bloqueado
  if (account.status === 'blocked') {
    // Só é autorizado se o token for especificamente para regularização de WhatsApp
    if (payload.scope !== 'whatsapp_update_only') {
      res.status(403).json({
        error: 'Sua conta de usuário está bloqueada pela administração.',
        code: 'USER_BLOCKED'
      });
      return;
    }

    // Verifica se há solicitação pendente no banco
    const pending = db.prepare(`
      SELECT id FROM user_whatsapp_requests
      WHERE user_id = ? AND status IN ('pending', 'awaiting_correction')
      LIMIT 1
    `).get(account.id);

    if (!pending) {
      res.status(403).json({
        error: 'Não há solicitação pendente de atualização de WhatsApp para esta conta.',
        code: 'NO_PENDING_WHATSAPP_UPDATE'
      });
      return;
    }
  } else if (account.status !== 'active') {
    res.status(403).json({ error: 'Conta em estado inválido para esta operação.' });
    return;
  }

  req.user = payload;
  if (account.tenant_id) {
    req.tenantId = account.tenant_id;
  }

  next();
}

export function onboardingGate(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role === 'superadmin') {
    next();
    return;
  }

  const isAllowed = /^\/(?:v1\/)?(?:auth\/(?:me|accept-legal|logout|profile|whatsapp-update-request|update-whatsapp)|onboarding|user-onboarding|public|tenants\/current|clinics\/current|taxonomy|capabilities|plans|subscriptions|support)(?:\/|$)/.test(req.path);
  if (isAllowed) {
    next();
    return;
  }

  const userId = req.user?.userId;
  if (userId) {
    const userRow = db.prepare('SELECT onboarding_status, status FROM users WHERE id = ?').get(userId) as any;
    if (userRow && userRow.onboarding_status && userRow.onboarding_status !== 'active') {
      res.status(403).json({
        code: 'ONBOARDING_INCOMPLETE',
        error: 'Conclua as etapas obrigatórias de cadastro para acessar esta funcionalidade.',
        onboardingStatus: userRow.onboarding_status
      });
      return;
    }
  }

  next();
}
