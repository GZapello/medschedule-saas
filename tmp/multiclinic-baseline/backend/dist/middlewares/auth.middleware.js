"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
exports.onboardingGate = onboardingGate;
const billing_service_1 = require("../services/billing.service");
const database_1 = require("../config/database");
const jwt_1 = require("../utils/jwt");
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    let token = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }
    else if (req.query.token && typeof req.query.token === 'string') {
        token = req.query.token;
    }
    if (!token) {
        res.status(401).json({ error: 'Token de autenticação não fornecido ou inválido' });
        return;
    }
    const payload = (0, jwt_1.verifyToken)(token);
    if (!payload) {
        res.status(401).json({ error: 'Token expirado ou inválido' });
        return;
    }
    const account = database_1.db.prepare('SELECT id, role, status, tenant_id, session_version, onboarding_status FROM users WHERE id = ?').get(payload.userId);
    const isOnboarding = Boolean(account && account.onboarding_status && account.onboarding_status !== 'active');
    if (!account || (account.status !== 'active' && !(0, billing_service_1.pendingBillingManager)(account) && !isOnboarding) || account.role !== payload.role ||
        (payload.userSessionVersion || 0) !== (account.session_version || 0)) {
        res.status(401).json({ error: 'Sessão inválida. Entre novamente.' });
        return;
    }
    if (payload.role !== 'superadmin') {
        const tenant = database_1.db.prepare('SELECT status, session_version, onboarding_status FROM tenants WHERE id = ?').get(payload.tenantId);
        const membership = database_1.db.prepare('SELECT status FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(payload.userId, payload.tenantId);
        const isTenantOnboarding = Boolean((tenant && tenant.onboarding_status && tenant.onboarding_status !== 'active') || isOnboarding);
        if (!tenant || (tenant.status !== 'active' && !(tenant.status === 'pending' && ((0, billing_service_1.pendingBillingManager)(account) || isTenantOnboarding))) || (payload.sessionVersion || 0) !== tenant.session_version ||
            (membership ? (membership.status !== 'active' && !(0, billing_service_1.pendingBillingManager)(account) && !isTenantOnboarding) : account.tenant_id !== payload.tenantId)) {
            res.status(403).json({ error: 'Acesso à clínica bloqueado ou sessão invalidada.' });
            return;
        }
    }
    req.user = payload;
    if (payload.tenantId) {
        req.tenantId = payload.tenantId;
    }
    next();
}
function onboardingGate(req, res, next) {
    if (req.user?.role === 'superadmin') {
        next();
        return;
    }
    const isAllowed = /^\/(?:v1\/)?(?:auth\/(?:me|accept-legal|logout|profile)|onboarding|user-onboarding|public|tenants\/current|clinics\/current|taxonomy|capabilities|plans|subscriptions|support)(?:\/|$)/.test(req.path);
    if (isAllowed) {
        next();
        return;
    }
    const userId = req.user?.userId;
    if (userId) {
        const userRow = database_1.db.prepare('SELECT onboarding_status, status FROM users WHERE id = ?').get(userId);
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
