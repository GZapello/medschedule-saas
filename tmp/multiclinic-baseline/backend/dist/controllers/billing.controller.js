"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.respondBillingError = respondBillingError;
exports.subscriptionGate = subscriptionGate;
exports.mountBillingRoutes = mountBillingRoutes;
const crypto_1 = require("crypto");
const database_1 = require("../config/database");
const billing_service_1 = require("../services/billing.service");
const asaas_service_1 = require("../services/asaas.service");
const billing_webhook_service_1 = require("../services/billing-webhook.service");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const tenant_middleware_1 = require("../middlewares/tenant.middleware");
const rbac_middleware_1 = require("../middlewares/rbac.middleware");
function respondBillingError(res, error) {
    if (error?.message?.includes('PLAN_USER_LIMIT_REACHED')) {
        res.status(409).json({ code: 'PLAN_USER_LIMIT_REACHED', error: 'Limite de acessos do seu plano atingido.' });
        return true;
    }
    if (error instanceof billing_service_1.BillingError) {
        res.status(error.httpStatus).json({ code: error.code, error: error.message });
        return true;
    }
    return false;
}
function handler(fn) {
    return async (req, res) => {
        try {
            await fn(req, res);
        }
        catch (e) {
            if (respondBillingError(res, e))
                return;
            if (e instanceof asaas_service_1.AsaasError && [400, 422].includes(e.status)) {
                res.status(422).json({ success: false, code: 'ASAAS_VALIDATION_ERROR', error: 'O Asaas recusou os dados de cobrança. Confira CPF/CNPJ e endereço completo, incluindo CEP, número e bairro.' });
                return;
            }
            res.status(e instanceof asaas_service_1.AsaasError ? 502 : 500).json({ code: 'BILLING_UNAVAILABLE', error: 'Não foi possível concluir a operação. Verifique a integração ou tente novamente após a conciliação.' });
        }
    };
}
function manager(req, res, next) {
    if (!req.tenantId) {
        res.status(400).json({ error: 'Selecione uma clínica.' });
        return;
    }
    if (req.user?.role === 'superadmin' || req.user?.role === 'clinic_admin') {
        next();
        return;
    }
    const membership = database_1.db.prepare('SELECT is_manager,permissions_json FROM clinic_users WHERE tenant_id=? AND user_id=? AND status=\'active\'').get(req.tenantId, req.user?.userId);
    let permissions = [];
    try {
        permissions = JSON.parse(membership?.permissions_json || '[]');
    }
    catch { }
    if (membership?.is_manager || permissions.includes('manage_subscription')) {
        next();
        return;
    }
    res.status(403).json({ error: 'Somente o responsável ou gerenciador autorizado pode administrar a assinatura.' });
}
function subscriptionGate(req, res, next) {
    if (req.user?.role === 'superadmin' && /^\/(?:v1\/)?(?:admin|tenants|taxonomy|audit)(?:\/|$)/.test(req.path)) {
        next();
        return;
    }
    if (/^\/(?:v1\/)?(?:subscriptions|auth\/me|auth\/accept-legal|auth\/logout|auth\/change-password|tenants\/current|onboarding|user-onboarding)(?:\/|$)/.test(req.path)) {
        next();
        return;
    }
    if (req.tenantId) {
        billing_service_1.BillingService.expireGrace();
        billing_service_1.BillingService.expireTrials();
        const t = database_1.db.prepare('SELECT billing_required FROM tenants WHERE id=?').get(req.tenantId);
        if (t?.billing_required && !(0, billing_service_1.canOperate)(req.tenantId)) {
            const sub = (0, billing_service_1.currentSubscription)(req.tenantId);
            const isTrialExpired = sub?.status === 'TRIAL_EXPIRED';
            const errorMsg = isTrialExpired
                ? 'Período de teste grátis encerrado. Assine o plano para continuar.'
                : 'Acesse Assinatura e Plano para regularizar o pagamento.';
            res.status(402).json({ code: isTrialExpired ? 'TRIAL_EXPIRED' : 'SUBSCRIPTION_REQUIRED', error: errorMsg });
            return;
        }
    }
    next();
}
function mountBillingRoutes(api) {
    api.get(['/plans', '/v1/plans'], handler((_req, res) => res.json(billing_service_1.BillingService.plans())));
    api.post(['/webhooks/asaas', '/v1/webhooks/asaas'], (req, res) => {
        const expected = process.env.ASAAS_WEBHOOK_TOKEN || '', provided = req.headers['asaas-access-token'];
        if (expected.length < 32 || typeof provided !== 'string' || Buffer.byteLength(expected) !== Buffer.byteLength(provided) || !(0, crypto_1.timingSafeEqual)(Buffer.from(expected), Buffer.from(provided))) {
            res.status(401).json({ error: 'Webhook não autorizado.' });
            return;
        }
        try {
            const duplicate = billing_webhook_service_1.BillingWebhookService.receive(req.body);
            res.status(200).json({ received: true, duplicate });
            void billing_webhook_service_1.BillingWebhookService.processPending().catch(() => { });
        }
        catch {
            res.status(400).json({ error: 'Evento inválido.' });
        }
    });
    const guard = [auth_middleware_1.authMiddleware, tenant_middleware_1.tenantMiddleware];
    api.get(['/subscriptions/profile', '/v1/subscriptions/profile'], ...guard, manager, handler((req, res) => {
        const t = database_1.db.prepare('SELECT COALESCE(billing_name,corporate_name,name) AS name,cnpj_cpf AS cpfCnpj,COALESCE(responsible_email,email) AS email,COALESCE(responsible_phone,phone) AS phone FROM tenants WHERE id=?').get(req.tenantId);
        const address = (0, billing_service_1.billingAddress)(database_1.db.prepare('SELECT billing_address_json,street,address,number,zip_code,neighborhood,complement FROM tenants WHERE id=?').get(req.tenantId));
        res.json({ ...t, ...address });
    }));
    api.put(['/subscriptions/profile', '/v1/subscriptions/profile'], ...guard, manager, handler(async (req, res) => {
        const { name, cpfCnpj, email, phone } = req.body;
        const document = typeof cpfCnpj === 'string' ? cpfCnpj.replace(/\D/g, '') : '';
        if (typeof name !== 'string' || !name.trim() || name.length > 160 || ![11, 14].includes(document.length) || typeof email !== 'string' || email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof phone !== 'string' || phone.length > 30)
            throw new billing_service_1.BillingError('BILLING_PROFILE_INVALID', 'Confira nome, CPF/CNPJ, e-mail e telefone.', 422);
        const address = {};
        for (const key of ['address', 'addressNumber', 'postalCode', 'province', 'complement']) {
            const value = req.body[key];
            if (typeof value !== 'string' || value.length > 160)
                throw new billing_service_1.BillingError('BILLING_ADDRESS_REQUIRED', 'Confira o endereço completo nos Dados de cobrança.', 422);
            address[key] = value.trim();
        }
        address.postalCode = address.postalCode.replace(/\D/g, '');
        (0, billing_service_1.billingAddress)({ billing_address_json: JSON.stringify(address) }, true);
        const customer = database_1.db.prepare('SELECT asaas_customer_id FROM billing_customers WHERE clinic_id=? AND environment=?').get(req.tenantId, asaas_service_1.AsaasService.getEnvironment());
        if (customer?.asaas_customer_id) {
            const updated = await asaas_service_1.AsaasService.request(`/customers/${encodeURIComponent(customer.asaas_customer_id)}`, { method: 'PUT', body: { name: name.trim(), cpfCnpj: document, email, mobilePhone: phone.replace(/\D/g, '') || undefined, ...address } });
            if (!updated.city)
                throw new billing_service_1.BillingError('BILLING_ADDRESS_REQUIRED', 'O Asaas não identificou a cidade. Confira o CEP informado.', 422);
        }
        database_1.db.prepare('UPDATE tenants SET billing_name=?,cnpj_cpf=?,responsible_email=?,responsible_phone=?,billing_address_json=?,updated_at=datetime(\'now\') WHERE id=?').run(name.trim(), document, email.trim().toLowerCase(), phone, JSON.stringify(address), req.tenantId);
        res.json({ message: 'Dados de cobrança atualizados.' });
    }));
    api.get(['/subscriptions/current', '/v1/subscriptions/current'], ...guard, handler((req, res) => {
        if (!req.tenantId)
            throw new billing_service_1.BillingError('CLINIC_REQUIRED', 'Selecione uma clínica.', 400);
        const summary = billing_service_1.BillingService.summary(req.tenantId);
        const member = database_1.db.prepare('SELECT is_manager,permissions_json FROM clinic_users WHERE tenant_id=? AND user_id=?').get(req.tenantId, req.user?.userId);
        let permissions = [];
        try {
            permissions = JSON.parse(member?.permissions_json || '[]');
        }
        catch { }
        const canManage = ['superadmin', 'clinic_admin'].includes(req.user.role) || !!member?.is_manager || permissions.includes('manage_subscription');
        if (!canManage) {
            summary.payments = [];
            summary.confirmedPurchase = null;
        }
        res.json({ ...summary, canManage });
    }));
    api.post(['/subscriptions/checkout', '/v1/subscriptions/checkout'], ...guard, manager, handler(async (req, res) => res.json(await billing_service_1.BillingService.checkout(req.tenantId, req.body.planCode, req.user.userId))));
    api.post(['/subscriptions/change-plan', '/v1/subscriptions/change-plan'], ...guard, manager, handler(async (req, res) => res.json(await billing_service_1.BillingService.changePlan(req.tenantId, req.body.planCode, req.user.userId))));
    api.post(['/subscriptions/cancel', '/v1/subscriptions/cancel'], ...guard, manager, handler(async (req, res) => {
        if (req.body.confirmation !== 'CANCELAR')
            throw new billing_service_1.BillingError('CONFIRMATION_REQUIRED', 'Digite CANCELAR para confirmar.', 400);
        try {
            res.json(await billing_service_1.BillingService.cancel(req.tenantId, req.user.userId, typeof req.body.reason === 'string' ? req.body.reason.slice(0, 1000) : ''));
        }
        catch (e) {
            if (e instanceof asaas_service_1.AsaasError) {
                res.status(502).json({ success: false, code: 'SUBSCRIPTION_CANCELLATION_FAILED', error: 'Não foi possível cancelar a assinatura.' });
                return;
            }
            throw e;
        }
    }));
    api.get(['/admin/subscriptions', '/v1/admin/subscriptions'], ...guard, (0, rbac_middleware_1.requireRole)('superadmin'), handler((req, res) => {
        billing_service_1.BillingService.expireGrace();
        const where = ['s.managed=1', 's.is_current=1'], params = [];
        for (const [key, column] of Object.entries({ clinic: 't.name', plan: 'p.code', status: 's.status' }))
            if (typeof req.query[key] === 'string' && req.query[key]) {
                where.push(key === 'clinic' ? `${column} LIKE ?` : `${column}=?`);
                params.push(key === 'clinic' ? `%${req.query[key]}%` : req.query[key]);
            }
        for (const [key, operator] of [['from', '>='], ['to', '<=']])
            if (typeof req.query[key] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query[key])) {
                where.push(`date(s.created_at)${operator}?`);
                params.push(req.query[key]);
            }
        const rows = database_1.db.prepare(`SELECT s.id,s.clinic_id,t.name AS clinic_name,p.code,p.name AS plan_name,p.monthly_price,p.max_users,s.status,s.next_due_date,s.created_at,s.gateway_environment,
      s.pending_plan_id,s.plan_change_state FROM subscriptions s JOIN tenants t ON t.id=s.clinic_id JOIN plans p ON p.id=s.plan_id WHERE ${where.join(' AND ')} ORDER BY s.created_at DESC LIMIT 500`).all(...params);
        const counts = database_1.db.prepare('SELECT status,COUNT(*) total FROM subscriptions WHERE managed=1 AND is_current=1 GROUP BY status').all();
        const byPlan = database_1.db.prepare('SELECT p.code,COUNT(*) total FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.managed=1 AND s.is_current=1 GROUP BY p.code').all();
        const mrr = database_1.db.prepare("SELECT COALESCE(SUM(p.monthly_price),0) value FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.managed=1 AND s.is_current=1 AND s.status='ACTIVE'").get().value;
        const pendingEvents = database_1.db.prepare("SELECT COUNT(*) n FROM asaas_webhook_events WHERE processing_status IN ('PENDING','RETRY','PROCESSING')").get().n;
        res.json({ rows, counts, byPlan, mrr, pendingEvents, total: counts.reduce((n, r) => n + r.total, 0) });
    }));
    api.get(['/admin/integrations/asaas/status', '/v1/admin/integrations/asaas/status'], ...guard, (0, rbac_middleware_1.requireRole)('superadmin'), handler((_req, res) => {
        const environment = asaas_service_1.AsaasService.getEnvironment();
        const row = database_1.db.prepare('SELECT connected,last_test_at,error FROM billing_integration_status WHERE environment=?').get(environment);
        res.json({ environment, connected: row ? !!row.connected : null, lastTest: row?.last_test_at || null, error: row?.error || null });
    }));
    api.post(['/admin/integrations/asaas/test', '/v1/admin/integrations/asaas/test'], ...guard, (0, rbac_middleware_1.requireRole)('superadmin'), handler(async (_req, res) => {
        const result = await asaas_service_1.AsaasService.checkConnection(), lastTest = new Date().toISOString();
        database_1.db.prepare('INSERT INTO billing_integration_status(environment,connected,last_test_at,error) VALUES(?,?,?,?) ON CONFLICT(environment) DO UPDATE SET connected=excluded.connected,last_test_at=excluded.last_test_at,error=excluded.error').run(result.environment, result.connected ? 1 : 0, lastTest, result.error || null);
        res.json({ ...result, lastTest });
    }));
    api.post(['/subscriptions/start-trial', '/v1/subscriptions/start-trial'], ...guard, manager, handler(async (req, res) => res.json(await billing_service_1.BillingService.startSoloTrial(req.tenantId, req.user.userId))));
    api.get(['/admin/solo-trials', '/v1/admin/solo-trials'], ...guard, (0, rbac_middleware_1.requireRole)('superadmin'), handler((req, res) => res.json(billing_service_1.BillingService.listSoloTrials(req.query))));
    api.post(['/admin/subscriptions/sync-prices', '/v1/admin/subscriptions/sync-prices'], ...guard, (0, rbac_middleware_1.requireRole)('superadmin'), handler(async (_req, res) => {
        const result = await billing_service_1.BillingService.syncActiveSubscriptionPrices();
        res.json({ success: true, ...result });
    }));
}
