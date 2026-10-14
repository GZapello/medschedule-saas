"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingService = exports.today = exports.BillingError = exports.SOLO_TRIAL_DAYS = void 0;
exports.billingAddress = billingAddress;
exports.addDays = addDays;
exports.addMonth = addMonth;
exports.activeUsers = activeUsers;
exports.currentSubscription = currentSubscription;
exports.billingAudit = billingAudit;
exports.requireCapacity = requireCapacity;
exports.canOperate = canOperate;
exports.pendingBillingManager = pendingBillingManager;
const database_1 = require("../config/database");
const crypto_1 = require("crypto");
const asaas_service_1 = require("./asaas.service");
const trial_notification_service_1 = require("./trial-notification.service");
const admin_notification_service_1 = require("./admin-notification.service");
exports.SOLO_TRIAL_DAYS = 7;
const BILLING_CYCLE = 'MONTHLY';
class BillingError extends Error {
    code;
    httpStatus;
    constructor(code, message, httpStatus = 409) {
        super(message);
        this.code = code;
        this.httpStatus = httpStatus;
    }
}
exports.BillingError = BillingError;
function billingAddress(t, required = false) {
    let saved = {};
    try {
        saved = JSON.parse(t.billing_address_json || '{}');
    }
    catch { }
    const address = { address: saved.address ?? t.street ?? t.address ?? '', addressNumber: saved.addressNumber ?? t.number ?? '',
        postalCode: String(saved.postalCode ?? t.zip_code ?? '').replace(/\D/g, ''), province: saved.province ?? t.neighborhood ?? '', complement: saved.complement ?? t.complement ?? '' };
    if (required && (!/^\d{8}$/.test(address.postalCode) || ['address', 'addressNumber', 'province'].some(k => typeof address[k] !== 'string' || !address[k].trim())))
        throw new BillingError('BILLING_ADDRESS_REQUIRED', 'Complete o endereço nos Dados de cobrança: CEP, logradouro, número e bairro. O Asaas identifica a cidade pelo CEP.', 422);
    return address;
}
const today = () => new Date().toISOString().slice(0, 10);
exports.today = today;
function addDays(date, days) { const d = new Date(date.slice(0, 10) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function addMonth(date) {
    const d = new Date(date.slice(0, 10) + 'T12:00:00Z');
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, end));
    return d.toISOString().slice(0, 10);
}
function activeUsers(clinic) { return database_1.db.prepare('SELECT COUNT(*) n FROM billing_active_users WHERE clinic_id=?').get(clinic).n; }
function currentSubscription(clinic) { return database_1.db.prepare('SELECT * FROM subscriptions WHERE clinic_id=? AND is_current=1').get(clinic); }
function billingAudit(s, action, before, after, user = null, details = {}) {
    database_1.db.prepare(`INSERT INTO subscription_audit(id,clinic_id,subscription_id,user_id,action,previous_status,next_status,details_json)
    VALUES(?,?,?,?,?,?,?,?)`).run((0, crypto_1.randomUUID)(), s.clinic_id, s.id, user, action, before, after, JSON.stringify(details));
}
function requireCapacity(clinic, additional = 1, excludeUser) {
    const limit = database_1.db.prepare('SELECT max_users FROM billing_user_limits WHERE clinic_id=?').get(clinic);
    if (!limit)
        return; // Preserve legacy clinics until they subscribe.
    if (excludeUser && database_1.db.prepare('SELECT 1 FROM billing_active_users WHERE clinic_id=? AND user_id=?').get(clinic, excludeUser))
        return;
    if (activeUsers(clinic) + additional > limit.max_users)
        throw new BillingError('PLAN_USER_LIMIT_REACHED', 'Limite de acessos do seu plano atingido.');
}
function canOperate(clinic) {
    const tenant = database_1.db.prepare('SELECT status,billing_required FROM tenants WHERE id=?').get(clinic);
    if (!tenant || tenant.status !== 'active')
        return false;
    if (!tenant.billing_required)
        return true;
    const s = currentSubscription(clinic);
    if (!s?.managed)
        return false;
    if (s.status === 'TRIAL')
        return !!s.trial_ends_at && new Date(s.trial_ends_at).getTime() > Date.now();
    if (s.status === 'ACTIVE')
        return !!s.current_period_end && s.current_period_end > (0, exports.today)();
    if (s.status === 'PAST_DUE')
        return !!s.current_period_end && !!s.grace_period_until && s.grace_period_until > (0, exports.today)();
    return s.status === 'CANCELED' && !!s.current_period_end && s.current_period_end > (0, exports.today)();
}
function pendingBillingManager(user) {
    return user?.role === 'clinic_admin' && user.status === 'pending' && !!database_1.db.prepare("SELECT 1 FROM tenants t JOIN clinic_users cu ON cu.tenant_id=t.id WHERE t.id=? AND cu.user_id=? AND t.status='pending' AND t.billing_required=1 AND cu.is_manager=1 AND cu.status='pending'").get(user.tenant_id, user.id);
}
async function withOperation(clinic, work) {
    const token = (0, crypto_1.randomUUID)();
    // Every remote request has a bounded timeout. Durable REQUESTED/UNKNOWN rows
    // still prevent duplicate creates after recovering an abandoned process lease.
    database_1.db.prepare("DELETE FROM billing_operations WHERE clinic_id=? AND created_at<datetime('now','-5 minutes')").run(clinic);
    try {
        database_1.db.prepare('INSERT INTO billing_operations(clinic_id,token) VALUES(?,?)').run(clinic, token);
    }
    catch {
        throw new BillingError('BILLING_OPERATION_PENDING', 'Já existe uma operação de assinatura em andamento. Aguarde ou solicite a conferência ao administrador.');
    }
    try {
        return await work();
    }
    finally {
        database_1.db.prepare('DELETE FROM billing_operations WHERE clinic_id=? AND token=?').run(clinic, token);
    }
}
function clinicForBilling(clinic) {
    const t = database_1.db.prepare('SELECT * FROM tenants WHERE id=?').get(clinic);
    if (!t || !['active', 'pending'].includes(t.status))
        throw new BillingError('CLINIC_BLOCKED', 'Esta clínica não está liberada para iniciar uma assinatura.', 403);
    return t;
}
function chosenPlan(code) {
    const p = typeof code === 'string' ? database_1.db.prepare('SELECT * FROM plans WHERE code=? AND active=1').get(code) : null;
    if (!p)
        throw new BillingError('PLAN_INVALID', 'Selecione um plano válido.', 400);
    return p;
}
function checkPlanSize(clinic, plan) {
    const count = activeUsers(clinic);
    if (count > plan.max_users)
        throw new BillingError('PLAN_USER_LIMIT_REACHED', `Você possui ${count} usuários ativos. O plano escolhido permite até ${plan.max_users}. Desative ${count - plan.max_users} usuários antes de continuar.`);
}
async function customer(t) {
    if (t?.id && String(t.id).startsWith('sbx-tenant-')) {
        throw new BillingError('SANDBOX_PAYMENT_BLOCKED', '[SANDBOX] Operações financeiras com gateway real estão bloqueadas no modo teste.');
    }
    const environment = asaas_service_1.AsaasService.getEnvironment();
    let local = database_1.db.prepare('SELECT * FROM billing_customers WHERE clinic_id=? AND environment=?').get(t.id, environment);
    if (local?.asaas_customer_id)
        return local.asaas_customer_id;
    const reference = `ZEMDA_CLINIC_${t.id}`;
    const matches = await asaas_service_1.AsaasService.request(`/customers?externalReference=${encodeURIComponent(reference)}&limit=100`);
    const exact = (matches.data || []).filter((c) => c.externalReference === reference && !c.deleted);
    if (exact.length > 1)
        throw new BillingError('CUSTOMER_REVIEW_REQUIRED', 'Há mais de um cliente vinculado à clínica no gateway. Solicite uma conferência.');
    if (exact[0]) {
        database_1.db.prepare("INSERT INTO billing_customers(id,clinic_id,environment,asaas_customer_id,state,external_reference) VALUES(?,?,?,?,'READY',?) ON CONFLICT(clinic_id,environment) DO UPDATE SET asaas_customer_id=excluded.asaas_customer_id,state='READY'").run((0, crypto_1.randomUUID)(), t.id, environment, exact[0].id, reference);
        return exact[0].id;
    }
    if (local?.state === 'REQUESTED' || local?.state === 'UNKNOWN')
        throw new BillingError('CUSTOMER_REVIEW_REQUIRED', 'A criação do cliente aguarda confirmação do Asaas. Não foi criado um cliente duplicado.');
    const cpfCnpj = String(t.cnpj_cpf || t.responsible_cpf || '').replace(/\D/g, '');
    if (![11, 14].includes(cpfCnpj.length))
        throw new BillingError('BILLING_PROFILE_REQUIRED', 'Preencha um CPF/CNPJ válido nos dados da clínica antes de assinar.', 422);
    database_1.db.prepare("INSERT INTO billing_customers(id,clinic_id,environment,state,external_reference) VALUES(?,?,?,'REQUESTED',?) ON CONFLICT(clinic_id,environment) DO UPDATE SET state='REQUESTED'").run((0, crypto_1.randomUUID)(), t.id, environment, reference);
    try {
        const result = await asaas_service_1.AsaasService.request('/customers', { method: 'POST', body: { name: t.billing_name || t.corporate_name || t.name, cpfCnpj, email: t.responsible_email || t.email,
                mobilePhone: String(t.responsible_phone || t.phone || '').replace(/\D/g, '') || undefined, externalReference: reference } });
        if (typeof result.id !== 'string')
            throw new asaas_service_1.AsaasError(0, true);
        database_1.db.prepare("UPDATE billing_customers SET asaas_customer_id=?,state='READY' WHERE clinic_id=? AND environment=?").run(result.id, t.id, environment);
        return result.id;
    }
    catch (e) {
        database_1.db.prepare('UPDATE billing_customers SET state=? WHERE clinic_id=? AND environment=?').run(e instanceof asaas_service_1.AsaasError && !e.ambiguous ? 'FAILED' : 'UNKNOWN', t.id, environment);
        throw e;
    }
}
class BillingService {
    static plans() { return database_1.db.prepare('SELECT id,code,name,monthly_price,max_users FROM plans WHERE code IS NOT NULL AND active=1 ORDER BY monthly_price').all().map(p => ({ ...p, cycle: BILLING_CYCLE, trial_days: p.code === 'SOLO' ? exports.SOLO_TRIAL_DAYS : 0 })); }
    static summary(clinic) {
        this.expireGrace();
        this.expireTrials();
        const s = currentSubscription(clinic);
        const tenant = database_1.db.prepare('SELECT name, trial_used, plan_id FROM tenants WHERE id=?').get(clinic);
        const selectedPlan = tenant?.plan_id ? this.plans().find(p => p.id === tenant.plan_id) || null : null;
        const plan = s?.managed ? database_1.db.prepare('SELECT code,name,monthly_price,max_users FROM plans WHERE id=?').get(s.plan_id) : null;
        const pending = s?.pending_plan_id ? database_1.db.prepare('SELECT code,name,monthly_price,max_users FROM plans WHERE id=?').get(s.pending_plan_id) : null;
        const isTrial = s?.managed && s.status === 'TRIAL';
        let trialDaysRemaining = null;
        if (isTrial && s.trial_ends_at) {
            const diffMs = new Date(s.trial_ends_at).getTime() - Date.now();
            trialDaysRemaining = Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
        }
        const confirmedPurchase = s?.managed && s.status === 'ACTIVE' ? database_1.db.prepare("SELECT id AS transaction_id,amount AS value FROM subscription_payments WHERE subscription_id=? AND status IN ('CONFIRMED','RECEIVED') ORDER BY due_date DESC LIMIT 1").get(s.id) : null;
        return { clinicName: tenant?.name, selectedPlan, confirmedPurchase, plan, status: s?.managed ? s.status : 'NOT_SUBSCRIBED', activeUsers: activeUsers(clinic), maxUsers: plan?.max_users || null,
            nextDueDate: s?.next_due_date || null, gracePeriodUntil: s?.grace_period_until || null, currentPeriodEnd: s?.current_period_end || null,
            pendingPlan: pending, changeEffectiveOn: s?.pending_plan_effective_on || null, canOperate: canOperate(clinic),
            environment: s?.gateway_environment || asaas_service_1.AsaasService.getEnvironment(), managed: !!s?.managed,
            isTrial, trialStartedAt: s?.trial_started_at || null, trialEndsAt: s?.trial_ends_at || null, trialDaysRemaining, trialUsed: !!tenant?.trial_used,
            payments: database_1.db.prepare('SELECT id,amount,billing_type,status,due_date,confirmed_at,received_at,invoice_url FROM subscription_payments WHERE clinic_id=? ORDER BY due_date DESC LIMIT 100').all(clinic) };
    }
    static async checkout(clinic, code, user) {
        const plan = chosenPlan(code);
        let s = currentSubscription(clinic);
        asaas_service_1.AsaasService.config();
        const app = asaas_service_1.AsaasService.appUrl();
        if ((process.env.ASAAS_WEBHOOK_TOKEN || '').length < 32)
            throw new BillingError('WEBHOOK_NOT_CONFIGURED', 'Configure a autenticação do webhook antes de iniciar assinaturas.', 503);
        return withOperation(clinic, async () => {
            const t = clinicForBilling(clinic);
            checkPlanSize(clinic, plan);
            const environment = asaas_service_1.AsaasService.getEnvironment();
            s = currentSubscription(clinic);
            if (s?.managed && s.gateway_environment !== environment)
                throw new BillingError('ENVIRONMENT_MISMATCH', 'Esta assinatura pertence a outro ambiente. A migração exige uma nova contratação controlada.');
            if (s?.managed && s.status === 'CANCELED' && s.current_period_end > (0, exports.today)())
                throw new BillingError('PAID_PERIOD_REMAINS', `Seu acesso pago permanece até ${s.current_period_end}. Inicie uma nova assinatura após esse período.`);
            if (s?.managed && s.asaas_subscription_id && s.status !== 'CANCELED')
                throw new BillingError('SUBSCRIPTION_EXISTS', 'Use Alterar plano ou regularize a cobrança atual, sem criar uma assinatura duplicada.');
            const open = database_1.db.prepare("SELECT * FROM billing_checkouts WHERE clinic_id=? AND state IN ('REQUESTED','OPEN','UNKNOWN')").get(clinic);
            if (open) {
                if (open.plan_id === plan.id && open.state === 'OPEN' && open.expires_at > new Date().toISOString())
                    return { url: asaas_service_1.AsaasService.safeUrl(open.url) };
                throw new BillingError('CHECKOUT_PENDING', 'Há um checkout pendente. Cancele-o ou aguarde a confirmação antes de iniciar outro.');
            }
            const address = billingAddress(t, true);
            const customerId = await customer(t);
            // Existing customers may predate address collection. Keep the same gateway ID.
            const updatedCustomer = await asaas_service_1.AsaasService.request(`/customers/${encodeURIComponent(customerId)}`, { method: 'PUT', body: address });
            if (!updatedCustomer.city)
                throw new BillingError('BILLING_ADDRESS_REQUIRED', 'O Asaas não identificou a cidade. Confira o CEP e o endereço nos Dados de cobrança.', 422);
            clinicForBilling(clinic);
            checkPlanSize(clinic, plan);
            const start = s?.status === 'CANCELED' && s.current_period_end > (0, exports.today)() ? s.current_period_end : (0, exports.today)();
            const sid = (0, crypto_1.randomUUID)(), cid = (0, crypto_1.randomUUID)(), reference = `ZEMDA_CLINIC_${clinic}_SUB_${sid}`;
            database_1.db.transaction(() => {
                if (s)
                    database_1.db.prepare('UPDATE subscriptions SET is_current=0 WHERE id=?').run(s.id);
                database_1.db.prepare(`INSERT INTO subscriptions(id,tenant_id,clinic_id,plan_id,status,current_period_start,current_period_end,managed,is_current,
          asaas_customer_id,gateway_environment,next_due_date,external_reference,updated_at)
          VALUES(?,?,?,?,'PENDING_PAYMENT',?,'',1,1,?,?,?,?,datetime('now'))`).run(sid, clinic, clinic, plan.id, start, customerId, environment, start, reference);
                database_1.db.prepare("INSERT INTO billing_checkouts(id,clinic_id,subscription_id,environment,external_reference,plan_id,state) VALUES(?,?,?,?,?,?,'REQUESTED')").run(cid, clinic, sid, environment, reference, plan.id);
                s = database_1.db.prepare('SELECT * FROM subscriptions WHERE id=?').get(sid);
                billingAudit(s, 'SUBSCRIPTION_CREATED', null, 'PENDING_PAYMENT', user, { planCode: plan.code });
            })();
            try {
                const result = await asaas_service_1.AsaasService.request('/checkouts', { method: 'POST', body: { customer: customerId, externalReference: reference, billingTypes: ['CREDIT_CARD'], chargeTypes: ['RECURRENT'], minutesToExpire: 60,
                        subscription: { cycle: BILLING_CYCLE, nextDueDate: start + ' 12:00:00' },
                        items: [{ name: plan.name, description: `Assinatura mensal Zemda - até ${plan.max_users} usuários`, quantity: 1, value: plan.monthly_price }],
                        callback: { successUrl: app + '/assinatura/sucesso', cancelUrl: app + '/assinatura/cancelada', expiredUrl: app + '/assinatura/expirada' } } });
                if (typeof result.id !== 'string')
                    throw new asaas_service_1.AsaasError(0, true);
                const url = asaas_service_1.AsaasService.checkoutUrl(result.id, result.link);
                database_1.db.transaction(() => {
                    database_1.db.prepare("UPDATE billing_checkouts SET asaas_checkout_id=?,url=?,state=CASE WHEN state='REQUESTED' THEN 'OPEN' ELSE state END,expires_at=? WHERE id=?").run(result.id, url, new Date(Date.now() + 3600000).toISOString(), cid);
                    database_1.db.prepare('UPDATE subscriptions SET asaas_checkout_id=?,checkout_url=?,updated_at=datetime(\'now\') WHERE id=?').run(result.id, url, sid);
                    database_1.db.prepare('UPDATE tenants SET billing_required=1 WHERE id=?').run(clinic);
                })();
                return { url };
            }
            catch (e) {
                database_1.db.prepare("UPDATE billing_checkouts SET state=? WHERE id=? AND state='REQUESTED'").run(e instanceof asaas_service_1.AsaasError && !e.ambiguous ? 'FAILED' : 'UNKNOWN', cid);
                throw e;
            }
        });
    }
    static async changePlan(clinic, code, user) {
        return withOperation(clinic, async () => {
            clinicForBilling(clinic);
            const s = currentSubscription(clinic), plan = chosenPlan(code);
            checkPlanSize(clinic, plan);
            if (!s?.managed || s.status !== 'ACTIVE' || !s.asaas_subscription_id || s.cancelled_at)
                throw new BillingError('SUBSCRIPTION_NOT_ACTIVE', 'Regularize ou inicie uma assinatura antes de alterar o plano.');
            if (s.gateway_environment !== asaas_service_1.AsaasService.getEnvironment())
                throw new BillingError('ENVIRONMENT_MISMATCH', 'Ambiente da assinatura incompatível.');
            if (s.plan_id === plan.id && !s.pending_plan_id)
                return { message: 'Este já é o plano atual.' };
            if (s.pending_plan_id && s.pending_plan_id !== plan.id)
                throw new BillingError('PLAN_CHANGE_PENDING', 'Já existe uma mudança programada. Aguarde sua conclusão.');
            const due = s.current_period_end;
            if (!due || due <= (0, exports.today)())
                throw new BillingError('RENEWAL_PENDING', 'Aguarde a confirmação da renovação para alterar o plano.');
            // Do not alter an overdue invoice. All open charges must be future renewals.
            const charges = await asaas_service_1.AsaasService.request(`/subscriptions/${encodeURIComponent(s.asaas_subscription_id)}/payments?limit=100`);
            if (charges.hasMore || (charges.data || []).some((p) => !['CONFIRMED', 'RECEIVED', 'REFUNDED', 'DELETED'].includes(p.status) && p.dueDate < due))
                throw new BillingError('PAYMENTS_REVIEW_REQUIRED', 'Há cobranças pendentes que precisam ser regularizadas antes da mudança.');
            database_1.db.prepare("UPDATE subscriptions SET pending_plan_id=?,pending_plan_effective_on=?,plan_change_state='REQUESTED' WHERE id=?").run(plan.id, due, s.id);
            try {
                await asaas_service_1.AsaasService.request(`/subscriptions/${encodeURIComponent(s.asaas_subscription_id)}`, { method: 'PUT', body: { value: plan.monthly_price, description: plan.name, updatePendingPayments: true } });
                database_1.db.transaction(() => {
                    database_1.db.prepare("UPDATE subscriptions SET plan_change_state='SCHEDULED',updated_at=datetime('now') WHERE id=?").run(s.id);
                    billingAudit(s, 'PLAN_CHANGE_SCHEDULED', s.status, s.status, user, { planCode: plan.code, effectiveOn: due });
                })();
            }
            catch (e) {
                if (e instanceof asaas_service_1.AsaasError && !e.ambiguous)
                    database_1.db.prepare('UPDATE subscriptions SET pending_plan_id=NULL,pending_plan_effective_on=NULL,plan_change_state=NULL WHERE id=?').run(s.id);
                throw e;
            }
            return { message: 'Mudança programada para o próximo ciclo. O limite será atualizado após a confirmação do pagamento.', effectiveOn: due };
        });
    }
    static async cancel(clinic, user, reason) {
        return withOperation(clinic, async () => {
            const s = database_1.db.prepare('SELECT * FROM subscriptions WHERE clinic_id=? AND is_current=1').get(clinic);
            if (!s?.managed)
                throw new BillingError('SUBSCRIPTION_NOT_FOUND', 'Assinatura não encontrada.', 404);
            if (s.gateway_environment !== asaas_service_1.AsaasService.getEnvironment())
                throw new BillingError('ENVIRONMENT_MISMATCH', 'Ambiente incompatível.');
            if (s.cancelled_at)
                return { message: 'Assinatura já cancelada.' };
            let subscriptionId = s.asaas_subscription_id;
            if (!subscriptionId) {
                if (!s.asaas_customer_id || !s.external_reference)
                    throw new BillingError('SUBSCRIPTION_RECONCILIATION_REQUIRED', 'Não foi possível localizar a assinatura no gateway. Solicite uma conferência antes de cancelar.', 409);
                const list = await asaas_service_1.AsaasService.request(`/subscriptions?customer=${encodeURIComponent(s.asaas_customer_id)}&externalReference=${encodeURIComponent(s.external_reference)}&limit=100`);
                const matches = (list.data || []).filter((remote) => remote && typeof remote.id === 'string' && remote.customer === s.asaas_customer_id && remote.externalReference === s.external_reference && !remote.deleted);
                if (matches.length !== 1)
                    throw new BillingError('SUBSCRIPTION_RECONCILIATION_REQUIRED', 'Não foi possível localizar uma única assinatura no gateway. Solicite uma conferência antes de cancelar.', 409);
                subscriptionId = matches[0].id;
                database_1.db.prepare('UPDATE subscriptions SET asaas_subscription_id=?,updated_at=datetime(\'now\') WHERE id=? AND clinic_id=?').run(subscriptionId, s.id, clinic);
            }
            const gatewaySubscriptionId = subscriptionId;
            try {
                await asaas_service_1.AsaasService.request(`/subscriptions/${encodeURIComponent(gatewaySubscriptionId)}`, { method: 'DELETE' });
            }
            catch (e) {
                if (e instanceof asaas_service_1.AsaasError)
                    console.warn('[Billing cancellation] gateway failure', JSON.stringify({ status: e.status, code: e.providerCode || null, subscriptionId: gatewaySubscriptionId }));
                throw e;
            }
            database_1.db.transaction(() => {
                database_1.db.prepare("UPDATE subscriptions SET status='CANCELED',cancelled_at=datetime('now'),cancelled_by=?,cancel_reason=?,pending_plan_id=NULL,pending_plan_effective_on=NULL,updated_at=datetime('now') WHERE id=?").run(user, reason, s.id);
                billingAudit(s, 'CANCELED', s.status, 'CANCELED', user, { planId: s.plan_id, reason, subscriptionId: gatewaySubscriptionId });
            })();
            return { message: 'Renovação cancelada. Os dados serão preservados e o acesso pago permanece até o fim do período.' };
        });
    }
    static expireGrace() {
        database_1.db.transaction(() => {
            for (const s of database_1.db.prepare("SELECT * FROM subscriptions WHERE managed=1 AND is_current=1 AND ((status='ACTIVE' AND current_period_end!='' AND current_period_end<=?) OR (status='PAST_DUE' AND grace_period_until<=?))").all((0, exports.today)(), (0, exports.today)())) {
                let status = s.status, grace = s.grace_period_until;
                if (status === 'ACTIVE' && s.current_period_end && s.current_period_end <= (0, exports.today)()) {
                    status = 'PAST_DUE';
                    grace = addDays(s.current_period_end, 5);
                }
                if (status === 'PAST_DUE' && grace && grace <= (0, exports.today)())
                    status = 'SUSPENDED';
                if (status !== s.status) {
                    database_1.db.prepare("UPDATE subscriptions SET status=?,grace_period_until=?,updated_at=datetime('now') WHERE id=?").run(status, grace, s.id);
                    billingAudit(s, status, s.status, status);
                }
            }
        })();
    }
    static async syncActiveSubscriptionPrices() {
        const activeSubs = database_1.db.prepare(`
      SELECT s.id, s.clinic_id, s.asaas_subscription_id, s.status, s.plan_id, p.code, p.name, p.monthly_price
      FROM subscriptions s
      JOIN plans p ON p.id = s.plan_id
      WHERE s.managed = 1 AND s.is_current = 1 AND s.status = 'ACTIVE' AND s.asaas_subscription_id IS NOT NULL
    `).all();
        let synced = 0, skipped = 0, errors = 0;
        for (const sub of activeSubs) {
            try {
                const remote = await asaas_service_1.AsaasService.request(`/subscriptions/${encodeURIComponent(sub.asaas_subscription_id)}`);
                if (remote && remote.value !== undefined && Math.abs(remote.value - sub.monthly_price) > 0.005) {
                    await asaas_service_1.AsaasService.request(`/subscriptions/${encodeURIComponent(sub.asaas_subscription_id)}`, {
                        method: 'PUT',
                        body: { value: sub.monthly_price, updatePendingPayments: false }
                    });
                    billingAudit(sub, 'PRICE_UPDATE_SYNC', sub.status, sub.status, null, {
                        previousPrice: remote.value,
                        newPrice: sub.monthly_price,
                        subscriptionId: sub.asaas_subscription_id
                    });
                    synced++;
                }
                else {
                    skipped++;
                }
            }
            catch (err) {
                console.warn(`[BillingService.syncActiveSubscriptionPrices] Erro na assinatura ${sub.id}:`, err);
                errors++;
            }
        }
        return { synced, skipped, errors };
    }
    static expireTrials() {
        return database_1.db.transaction(() => {
            const expired = database_1.db.prepare(`
        SELECT s.*, t.responsible_email, t.email, t.responsible_name, t.name as clinic_name
        FROM subscriptions s
        JOIN tenants t ON t.id = s.clinic_id
        WHERE s.managed = 1 AND s.is_current = 1 AND s.status = 'TRIAL'
          AND s.trial_ends_at IS NOT NULL AND datetime(s.trial_ends_at) <= datetime('now')
      `).all();
            for (const sub of expired) {
                database_1.db.prepare("UPDATE subscriptions SET status = 'TRIAL_EXPIRED', updated_at = datetime('now') WHERE id = ?").run(sub.id);
                database_1.db.prepare("UPDATE trial_history SET status = 'EXPIRED', updated_at = datetime('now') WHERE subscription_id = ?").run(sub.id);
                billingAudit(sub, 'TRIAL_EXPIRED', 'TRIAL', 'TRIAL_EXPIRED', null, {
                    trialStartedAt: sub.trial_started_at,
                    trialEndsAt: sub.trial_ends_at
                });
                const recipientEmail = sub.responsible_email || sub.email;
                const recipientName = sub.responsible_name || sub.clinic_name || 'Profissional';
                if (recipientEmail) {
                    void trial_notification_service_1.TrialNotificationService.notifyTrialExpired(sub.clinic_id, recipientEmail, recipientName);
                }
            }
            return expired.length;
        })();
    }
    static async startSoloTrial(clinicId, userId) {
        return withOperation(clinicId, async () => {
            const tenant = clinicForBilling(clinicId);
            if (tenant.trial_used) {
                throw new BillingError('TRIAL_ALREADY_USED', 'O teste grátis de 7 dias já foi utilizado para esta clínica.', 400);
            }
            const email = tenant.responsible_email || tenant.email;
            const cnpjCpf = tenant.cnpj_cpf ? String(tenant.cnpj_cpf).replace(/\D/g, '') : null;
            if (email) {
                const usedEmail = database_1.db.prepare('SELECT id FROM trial_history WHERE email = ?').get(email.trim().toLowerCase());
                if (usedEmail) {
                    throw new BillingError('TRIAL_ALREADY_USED', 'O teste grátis já foi utilizado para este e-mail.', 400);
                }
            }
            if (cnpjCpf && cnpjCpf.length >= 11) {
                const usedDoc = database_1.db.prepare('SELECT id FROM trial_history WHERE cnpj_cpf = ?').get(cnpjCpf);
                if (usedDoc) {
                    throw new BillingError('TRIAL_ALREADY_USED', 'O teste grátis já foi utilizado para este CPF/CNPJ.', 400);
                }
            }
            const soloPlan = chosenPlan('SOLO');
            const s = currentSubscription(clinicId);
            if (s?.managed && s.status === 'ACTIVE') {
                throw new BillingError('SUBSCRIPTION_ACTIVE', 'Esta clínica já possui uma assinatura ativa.', 400);
            }
            const sid = (0, crypto_1.randomUUID)();
            const now = new Date();
            const trialStartedAt = now.toISOString();
            const trialEndsAt = new Date(now.getTime() + exports.SOLO_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
            const startDay = (0, exports.today)();
            const endDay = addDays(startDay, exports.SOLO_TRIAL_DAYS);
            database_1.db.transaction(() => {
                if (s) {
                    database_1.db.prepare('UPDATE subscriptions SET is_current = 0 WHERE id = ?').run(s.id);
                }
                database_1.db.prepare(`
          INSERT INTO subscriptions (
            id, tenant_id, clinic_id, plan_id, status, current_period_start, current_period_end,
            managed, is_current, trial_started_at, trial_ends_at, updated_at
          ) VALUES (?, ?, ?, ?, 'TRIAL', ?, ?, 1, 1, ?, ?, datetime('now'))
        `).run(sid, clinicId, clinicId, soloPlan.id, startDay, endDay, trialStartedAt, trialEndsAt);
                database_1.db.prepare("UPDATE tenants SET plan_id = ?, trial_used = 1, billing_required = 1, status = 'active', updated_at = datetime('now') WHERE id = ?").run(soloPlan.id, clinicId);
                const manager = database_1.db.prepare("SELECT user_id FROM clinic_users WHERE tenant_id = ? AND is_manager = 1 AND status = 'pending' ORDER BY created_at LIMIT 1").get(clinicId);
                if (manager) {
                    database_1.db.prepare("UPDATE users SET status = 'active' WHERE id = ? AND status = 'pending'").run(manager.user_id);
                    database_1.db.prepare("UPDATE clinic_users SET status = 'active' WHERE tenant_id = ? AND user_id = ? AND status = 'pending'").run(clinicId, manager.user_id);
                }
                const historyId = (0, crypto_1.randomUUID)();
                database_1.db.prepare(`
          INSERT INTO trial_history (
            id, tenant_id, user_id, subscription_id, email, cnpj_cpf, started_at, ends_at, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
        `).run(historyId, clinicId, userId, sid, email?.trim().toLowerCase() || '', cnpjCpf || null, trialStartedAt, trialEndsAt);
                const newSub = database_1.db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(sid);
                billingAudit(newSub, 'TRIAL_STARTED', s?.status || null, 'TRIAL', userId, {
                    planCode: 'SOLO',
                    trialStartedAt,
                    trialEndsAt
                });
            })();
            const recipientEmail = tenant.responsible_email || tenant.email;
            const recipientName = tenant.responsible_name || tenant.name || 'Profissional';
            if (recipientEmail) {
                void trial_notification_service_1.TrialNotificationService.notifyTrialStarted(clinicId, recipientEmail, recipientName, trialEndsAt);
            }
            void admin_notification_service_1.AdminNotificationService.notifyTrialStarted({
                tenantId: clinicId,
                clinicName: tenant.name,
                responsibleName: tenant.responsible_name || tenant.name,
                email: recipientEmail || tenant.email,
                professionName: tenant.responsible_profession,
                planName: 'Zemda Solo',
                startedAt: trialStartedAt,
                endsAt: trialEndsAt,
                trialDays: 7,
                userId
            }).catch(err => console.error('[BillingService.startSoloTrial] Erro ao notificar SuperAdmin de início de trial:', err));
            return {
                success: true,
                message: 'Teste grátis de 7 dias do Zemda Solo ativado com sucesso!',
                trialEndsAt
            };
        });
    }
    static listSoloTrials(query) {
        this.expireTrials();
        let sql = `
      SELECT 
        th.id, th.tenant_id, th.user_id, th.subscription_id, th.email, th.cnpj_cpf,
        th.started_at, th.ends_at, th.status, th.converted_at, th.created_at,
        t.name as clinic_name, t.slug as clinic_slug,
        u.name as user_name,
        s.status as subscription_status,
        CASE
          WHEN th.status = 'CONVERTED' THEN 'CONVERTED'
          WHEN datetime(th.ends_at) <= datetime('now') THEN 'EXPIRED'
          ELSE 'ACTIVE'
        END as computed_status
      FROM trial_history th
      JOIN tenants t ON t.id = th.tenant_id
      JOIN users u ON u.id = th.user_id
      LEFT JOIN subscriptions s ON s.id = th.subscription_id
    `;
        const where = [];
        const params = [];
        if (query?.search && typeof query.search === 'string') {
            where.push('(t.name LIKE ? OR u.name LIKE ? OR th.email LIKE ?)');
            const term = `%${query.search.trim()}%`;
            params.push(term, term, term);
        }
        if (query?.status && typeof query.status === 'string') {
            if (query.status === 'ACTIVE') {
                where.push("th.status = 'ACTIVE' AND datetime(th.ends_at) > datetime('now')");
            }
            else if (query.status === 'EXPIRED') {
                where.push("(th.status = 'EXPIRED' OR (th.status = 'ACTIVE' AND datetime(th.ends_at) <= datetime('now')))");
            }
            else if (query.status === 'CONVERTED') {
                where.push("th.status = 'CONVERTED'");
            }
        }
        if (where.length > 0) {
            sql += ` WHERE ${where.join(' AND ')}`;
        }
        sql += ` ORDER BY th.created_at DESC LIMIT 500`;
        const rows = database_1.db.prepare(sql).all(...params);
        const now = Date.now();
        const formattedRows = rows.map(r => {
            let daysRemaining = 0;
            if (r.computed_status === 'ACTIVE' && r.ends_at) {
                const diffMs = new Date(r.ends_at).getTime() - now;
                daysRemaining = Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
            }
            return {
                ...r,
                days_remaining: daysRemaining
            };
        });
        const summary = {
            total: database_1.db.prepare('SELECT COUNT(*) total FROM trial_history').get()?.total || 0,
            active: database_1.db.prepare("SELECT COUNT(*) total FROM trial_history WHERE status = 'ACTIVE' AND datetime(ends_at) > datetime('now')").get()?.total || 0,
            expired: database_1.db.prepare("SELECT COUNT(*) total FROM trial_history WHERE status = 'EXPIRED' OR (status = 'ACTIVE' AND datetime(ends_at) <= datetime('now'))").get()?.total || 0,
            converted: database_1.db.prepare("SELECT COUNT(*) total FROM trial_history WHERE status = 'CONVERTED'").get()?.total || 0
        };
        return { trials: formattedRows, summary };
    }
}
exports.BillingService = BillingService;
