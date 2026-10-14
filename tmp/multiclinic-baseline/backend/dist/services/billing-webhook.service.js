"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingWebhookService = void 0;
exports.safeEvent = safeEvent;
const database_1 = require("../config/database");
const crypto_1 = require("crypto");
const asaas_service_1 = require("./asaas.service");
const billing_service_1 = require("./billing.service");
const registration_cleanup_service_1 = require("./registration-cleanup.service");
const trial_notification_service_1 = require("./trial-notification.service");
const error_monitor_service_1 = require("./error-monitor.service");
const events = new Set(['PAYMENT_CREATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED', 'PAYMENT_REFUNDED', 'PAYMENT_DELETED',
    'SUBSCRIPTION_CREATED', 'SUBSCRIPTION_UPDATED', 'SUBSCRIPTION_INACTIVATED', 'SUBSCRIPTION_DELETED', 'CHECKOUT_CREATED', 'CHECKOUT_PAID', 'CHECKOUT_CANCELED', 'CHECKOUT_EXPIRED']);
const str = (v) => typeof v === 'string' && v.length <= 500 ? v : null;
const date = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && Number.isFinite(Date.parse(v.slice(0, 10) + 'T12:00:00Z')) ? v.slice(0, 10) : null;
// Deliberately store an allowlist, not the raw gateway object (card tokens and PII
// can be present even when a hosted checkout is used).
function safeEvent(input) {
    const clean = { id: str(input?.id), event: str(input?.event), dateCreated: str(input?.dateCreated) };
    for (const key of ['payment', 'subscription', 'checkout'])
        if (input?.[key] && typeof input[key] === 'object') {
            const obj = input[key], out = {};
            for (const field of ['id', 'customer', 'subscription', 'checkoutSession', 'externalReference', 'status', 'billingType', 'dueDate', 'nextDueDate', 'paymentDate', 'confirmedDate', 'clientPaymentDate', 'dateCreated'])
                out[field] = str(obj[field]);
            for (const field of ['value', 'originalValue'])
                if (typeof obj[field] === 'number' && Number.isFinite(obj[field]))
                    out[field] = obj[field];
            clean[key] = out;
        }
    return clean;
}
class BillingWebhookService {
    static running = false;
    static timer = null;
    static receive(input) {
        const safe = safeEvent(input);
        if (!safe.id || !safe.event || safe.id.length > 200)
            throw new Error('INVALID_EVENT');
        const result = database_1.db.prepare(`INSERT OR IGNORE INTO asaas_webhook_events(id,asaas_event_id,event_type,payload,processing_status)
      VALUES(?,?,?,?,?)`).run((0, crypto_1.randomUUID)(), safe.id, safe.event, JSON.stringify(safe), events.has(safe.event) ? 'PENDING' : 'IGNORED');
        return result.changes === 0;
    }
    static async processPending() {
        if (this.running)
            return;
        this.running = true;
        try {
            database_1.db.prepare("UPDATE asaas_webhook_events SET processing_status='RETRY' WHERE processing_status='PROCESSING' AND next_attempt_at<datetime('now','-10 minutes')").run();
            const pending = database_1.db.prepare("SELECT * FROM asaas_webhook_events WHERE processing_status IN ('PENDING','RETRY') AND next_attempt_at<=datetime('now') ORDER BY received_at LIMIT 30").all();
            for (const row of pending) {
                if (!database_1.db.prepare("UPDATE asaas_webhook_events SET processing_status='PROCESSING',attempts=attempts+1 WHERE id=? AND processing_status IN ('PENDING','RETRY')").run(row.id).changes)
                    continue;
                try {
                    await this.process(row);
                }
                catch {
                    // Fixed code only; gateway payloads/keys never enter logs or errors.
                    database_1.db.prepare("UPDATE asaas_webhook_events SET processing_status='RETRY',last_error='RECONCILIATION_PENDING',next_attempt_at=datetime('now',?) WHERE id=?").run(`+${Math.min(1800, 30 * Math.pow(2, Math.min(row.attempts, 6)))} seconds`, row.id);
                }
            }
            billing_service_1.BillingService.expireGrace();
            billing_service_1.BillingService.expireTrials();
            void trial_notification_service_1.TrialNotificationService.processDueNotifications().catch((err) => error_monitor_service_1.ErrorMonitor.captureException(err, { source: 'trial-notifications' }));
            // Reuse the existing scheduler; expiry has its own hourly throttle.
            void registration_cleanup_service_1.RegistrationCleanupService.runDue().catch((err) => { console.error('[RegistrationCleanup] RETRY'); error_monitor_service_1.ErrorMonitor.captureException(err, { source: 'registration-cleanup' }); });
        }
        finally {
            this.running = false;
        }
    }
    static async process(row) {
        const event = JSON.parse(row.payload), type = event.event;
        let payment = null, remoteSub = null;
        if (type.startsWith('PAYMENT_')) {
            if (!event.payment?.id)
                throw new Error('PAYMENT_MISSING');
            try {
                payment = await asaas_service_1.AsaasService.request(`/payments/${encodeURIComponent(event.payment.id)}`);
            }
            catch (e) {
                if (type === 'PAYMENT_DELETED' && e instanceof asaas_service_1.AsaasError && e.status === 404)
                    payment = { ...event.payment, status: 'DELETED' };
                else
                    throw e;
            }
        }
        if (type.startsWith('SUBSCRIPTION_')) {
            if (!event.subscription?.id)
                throw new Error('SUBSCRIPTION_MISSING');
            try {
                remoteSub = await asaas_service_1.AsaasService.request(`/subscriptions/${encodeURIComponent(event.subscription.id)}`);
            }
            catch (e) {
                if (type === 'SUBSCRIPTION_DELETED' && e instanceof asaas_service_1.AsaasError && e.status === 404)
                    remoteSub = { ...event.subscription, deleted: true };
                else
                    throw e;
            }
        }
        const object = payment || remoteSub || event.checkout;
        if (!object)
            throw new Error('OBJECT_MISSING');
        const checkoutId = event.checkout?.id || payment?.checkoutSession;
        let checkout = checkoutId ? database_1.db.prepare('SELECT * FROM billing_checkouts WHERE asaas_checkout_id=?').get(checkoutId) : null;
        if (!checkout && object.externalReference)
            checkout = database_1.db.prepare('SELECT * FROM billing_checkouts WHERE external_reference=?').get(object.externalReference);
        let s = checkout ? database_1.db.prepare('SELECT * FROM subscriptions WHERE id=?').get(checkout.subscription_id) : null;
        const gatewayId = payment?.subscription || remoteSub?.id;
        if (!s && gatewayId)
            s = database_1.db.prepare('SELECT * FROM subscriptions WHERE asaas_subscription_id=?').get(gatewayId);
        // Some subscription events omit checkout/reference. Resolve by a charge with
        // a known checkout, never by customer alone (a customer can own many products).
        if (!s && remoteSub?.id) {
            const list = await asaas_service_1.AsaasService.request(`/subscriptions/${encodeURIComponent(remoteSub.id)}/payments?limit=100`);
            for (const p of list.data || []) {
                const c = p.checkoutSession ? database_1.db.prepare('SELECT * FROM billing_checkouts WHERE asaas_checkout_id=?').get(p.checkoutSession) : null;
                if (c) {
                    checkout = c;
                    s = database_1.db.prepare('SELECT * FROM subscriptions WHERE id=?').get(c.subscription_id);
                    break;
                }
            }
        }
        if (!s) {
            // Unrelated account events are not applied. Keep early events retryable so
            // webhook delivery before checkout persistence does not lose confirmation.
            if (row.received_at < new Date(Date.now() - 48 * 3600000).toISOString().replace('T', ' ').slice(0, 19)) {
                database_1.db.prepare("UPDATE asaas_webhook_events SET processing_status='IGNORED',processed_at=datetime('now') WHERE id=?").run(row.id);
                return;
            }
            throw new Error('MATCH_PENDING');
        }
        if (s.gateway_environment !== asaas_service_1.AsaasService.getEnvironment() || !object.customer || object.customer !== s.asaas_customer_id)
            throw new Error('GATEWAY_SCOPE_MISMATCH');
        if (gatewayId && s.asaas_subscription_id && gatewayId !== s.asaas_subscription_id)
            throw new Error('SUBSCRIPTION_MISMATCH');
        // CHECKOUT_PAID is authenticated, but reconcile its real payments as well;
        // visiting the success page never reaches this code.
        let checkoutPayments = [];
        if (type === 'CHECKOUT_PAID') {
            if (!checkoutId)
                throw new Error('CHECKOUT_MISSING');
            const list = await asaas_service_1.AsaasService.request(`/payments?checkoutSession=${encodeURIComponent(checkoutId)}&limit=100`);
            checkoutPayments = list.data || [];
            if (!checkoutPayments.length || list.hasMore)
                throw new Error('PAYMENTS_NOT_READY');
        }
        database_1.db.transaction(() => {
            s = database_1.db.prepare('SELECT * FROM subscriptions WHERE id=?').get(s.id);
            if (!s)
                throw new Error('SUBSCRIPTION_REMOVED');
            database_1.db.prepare('UPDATE asaas_webhook_events SET clinic_id=? WHERE id=?').run(s.clinic_id, row.id);
            if (checkout && checkoutId && !checkout.asaas_checkout_id) {
                const url = asaas_service_1.AsaasService.checkoutUrl(checkoutId);
                const expires = new Date(Date.parse(checkout.created_at.replace(' ', 'T') + 'Z') + 3600000).toISOString();
                database_1.db.prepare('UPDATE billing_checkouts SET asaas_checkout_id=?,url=?,expires_at=COALESCE(expires_at,?) WHERE id=?').run(checkoutId, url, expires, checkout.id);
                database_1.db.prepare('UPDATE subscriptions SET asaas_checkout_id=?,checkout_url=? WHERE id=?').run(checkoutId, url, s.id);
            }
            if (gatewayId && !s.asaas_subscription_id) {
                database_1.db.prepare('UPDATE subscriptions SET asaas_subscription_id=? WHERE id=?').run(gatewayId, s.id);
                s.asaas_subscription_id = gatewayId;
            }
            if (type.startsWith('CHECKOUT_') && checkout) {
                const state = type === 'CHECKOUT_PAID' ? 'PAID' : type === 'CHECKOUT_CANCELED' ? 'CANCELED' : type === 'CHECKOUT_EXPIRED' ? 'EXPIRED' : 'OPEN';
                if (checkout.state !== 'PAID')
                    database_1.db.prepare('UPDATE billing_checkouts SET state=? WHERE id=?').run(state, checkout.id);
                if (['CANCELED', 'EXPIRED'].includes(state) && s.status === 'PENDING_PAYMENT') {
                    database_1.db.prepare("UPDATE subscriptions SET status='CANCELED',cancelled_at=datetime('now') WHERE id=?").run(s.id);
                    (0, billing_service_1.billingAudit)(s, 'CHECKOUT_' + state, s.status, 'CANCELED');
                }
            }
            if (payment)
                this.storePayment(s, payment, event.id);
            for (const p of checkoutPayments)
                this.storePayment(s, p, event.id);
            if (remoteSub?.deleted || remoteSub?.status === 'INACTIVE') {
                if (!s.cancelled_at) {
                    database_1.db.prepare("UPDATE subscriptions SET status='CANCELED',cancelled_at=datetime('now'),pending_plan_id=NULL,pending_plan_effective_on=NULL WHERE id=?").run(s.id);
                    (0, billing_service_1.billingAudit)(s, 'CANCELED_BY_GATEWAY', s.status, 'CANCELED');
                }
            }
            this.recalculate(s.id);
            if (remoteSub && date(remoteSub.nextDueDate))
                database_1.db.prepare('UPDATE subscriptions SET next_due_date=? WHERE id=?').run(date(remoteSub.nextDueDate), s.id);
            database_1.db.prepare("UPDATE asaas_webhook_events SET processing_status='PROCESSED',processed_at=datetime('now'),last_error=NULL WHERE id=?").run(row.id);
        })();
    }
    static storePayment(s, p, eventId) {
        if (typeof p.id !== 'string' || p.customer !== s.asaas_customer_id || !p.subscription || (s.asaas_subscription_id && p.subscription !== s.asaas_subscription_id))
            throw new Error('PAYMENT_SCOPE_MISMATCH');
        const due = date(p.dueDate);
        if (!due || !Number.isFinite(p.value))
            throw new Error('PAYMENT_INVALID');
        const existing = database_1.db.prepare('SELECT * FROM subscription_payments WHERE asaas_payment_id=?').get(p.id);
        const historical = existing && ['CONFIRMED', 'RECEIVED', 'REFUNDED', 'DELETED'].includes(existing.status);
        const plan = database_1.db.prepare('SELECT * FROM plans WHERE id=?').get(historical ? existing.plan_id : s.pending_plan_id && due >= s.pending_plan_effective_on ? s.pending_plan_id : s.plan_id);
        // Asaas may add interest to value; originalValue is the contract price.
        const contractAmount = historical ? existing.contract_amount : plan.monthly_price;
        const legacyPrices = { SOLO: 59.90, TEAM: 119.90, CLINIC: 359.90 };
        const legacyPrice = legacyPrices[plan.code];
        const val = p.originalValue ?? p.value;
        const matchesCurrent = Math.abs(val - contractAmount) <= 0.005;
        const matchesLegacy = legacyPrice !== undefined && Math.abs(val - legacyPrice) <= 0.005;
        if ((!matchesCurrent && !matchesLegacy) || p.billingType !== 'CREDIT_CARD')
            throw new Error('PAYMENT_CONTRACT_MISMATCH');
        const effectiveContractAmount = matchesCurrent ? contractAmount : (legacyPrice || contractAmount);
        if (existing && existing.subscription_id !== s.id)
            throw new Error('PAYMENT_ALREADY_ASSIGNED');
        const state = p.deleted ? 'DELETED' : p.status;
        if (!['PENDING', 'CONFIRMED', 'RECEIVED', 'OVERDUE', 'REFUNDED', 'DELETED', 'REFUND_REQUESTED', 'REFUND_IN_PROGRESS', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL', 'DUNNING_REQUESTED', 'DUNNING_RECEIVED', 'AWAITING_RISK_ANALYSIS'].includes(state))
            return;
        // A confirmed payment must not regress on an older non-financial notification.
        if (existing && ['CONFIRMED', 'RECEIVED'].includes(existing.status) && ['PENDING', 'OVERDUE', 'AWAITING_RISK_ANALYSIS'].includes(state))
            return;
        if (existing && ['REFUNDED', 'DELETED'].includes(existing.status) && !['REFUNDED', 'DELETED'].includes(state))
            return;
        const url = p.invoiceUrl ? asaas_service_1.AsaasService.safeUrl(p.invoiceUrl) : null;
        database_1.db.prepare(`INSERT INTO subscription_payments(id,clinic_id,subscription_id,asaas_payment_id,asaas_event_id,amount,billing_type,status,due_date,confirmed_at,received_at,invoice_url,contract_amount,plan_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(asaas_payment_id) DO UPDATE SET asaas_event_id=excluded.asaas_event_id,amount=excluded.amount,contract_amount=excluded.contract_amount,plan_id=excluded.plan_id,
      status=excluded.status,confirmed_at=COALESCE(excluded.confirmed_at,subscription_payments.confirmed_at),received_at=COALESCE(excluded.received_at,subscription_payments.received_at),
      invoice_url=COALESCE(excluded.invoice_url,subscription_payments.invoice_url),updated_at=datetime('now')`).run(existing?.id || (0, crypto_1.randomUUID)(), s.clinic_id, s.id, p.id, eventId, p.value, p.billingType, state, due, ['CONFIRMED', 'RECEIVED'].includes(state) ? date(p.confirmedDate || p.paymentDate || p.clientPaymentDate) || (0, billing_service_1.today)() : null, state === 'RECEIVED' ? date(p.paymentDate) || (0, billing_service_1.today)() : null, url, effectiveContractAmount, plan.id);
        if (!s.asaas_subscription_id) {
            database_1.db.prepare('UPDATE subscriptions SET asaas_subscription_id=? WHERE id=?').run(p.subscription, s.id);
            s.asaas_subscription_id = p.subscription;
        }
    }
    static recalculate(id) {
        const s = database_1.db.prepare('SELECT * FROM subscriptions WHERE id=?').get(id);
        const paid = database_1.db.prepare("SELECT * FROM subscription_payments WHERE subscription_id=? AND status IN ('CONFIRMED','RECEIVED') ORDER BY due_date DESC LIMIT 1").get(id);
        let status = s.status, grace = null, start = s.current_period_start, end = s.current_period_end;
        if (paid) {
            start = paid.due_date;
            end = (0, billing_service_1.addMonth)(start);
            status = end > (0, billing_service_1.today)() ? 'ACTIVE' : 'PAST_DUE';
            grace = status === 'PAST_DUE' ? (0, billing_service_1.addDays)(end, 5) : null;
            const overdue = database_1.db.prepare("SELECT due_date FROM subscription_payments WHERE subscription_id=? AND status='OVERDUE' AND due_date>? AND due_date<=? ORDER BY due_date LIMIT 1").get(id, start, (0, billing_service_1.today)());
            if (overdue) {
                status = 'PAST_DUE';
                grace = (0, billing_service_1.addDays)(overdue.due_date, 5);
            }
            if (s.pending_plan_id && paid.due_date >= s.pending_plan_effective_on) {
                const plan = database_1.db.prepare('SELECT * FROM plans WHERE id=?').get(s.pending_plan_id);
                if ((0, billing_service_1.activeUsers)(s.clinic_id) > plan.max_users)
                    throw new Error('DOWNGRADE_LIMIT_CHANGED');
                database_1.db.prepare('UPDATE subscriptions SET plan_id=?,pending_plan_id=NULL,pending_plan_effective_on=NULL,plan_change_state=NULL WHERE id=?').run(plan.id, id);
                s.plan_id = plan.id;
                (0, billing_service_1.billingAudit)(s, 'PLAN_CHANGED', s.status, status, null, { planCode: plan.code });
            }
        }
        else if (s.current_period_end) {
            status = 'SUSPENDED';
            end = '';
        }
        else {
            const overdue = database_1.db.prepare("SELECT due_date FROM subscription_payments WHERE subscription_id=? AND status='OVERDUE' ORDER BY due_date LIMIT 1").get(id);
            if (overdue) {
                status = 'PAST_DUE';
                grace = (0, billing_service_1.addDays)(overdue.due_date, 5);
            }
        }
        if (status === 'PAST_DUE' && grace && grace <= (0, billing_service_1.today)())
            status = 'SUSPENDED';
        if (s.cancelled_at)
            status = 'CANCELED'; // Old events cannot undo explicit cancellation.
        database_1.db.prepare("UPDATE subscriptions SET status=?,current_period_start=?,current_period_end=?,next_due_date=?,grace_period_until=?,updated_at=datetime('now') WHERE id=?").run(status, start, end, end || s.next_due_date, grace, id);
        if (s.is_current && status === 'ACTIVE') {
            // Never change banned/blocked/rejected status. Only the initial subscription
            // flow may approve the new clinic and its single responsible manager.
            database_1.db.prepare("UPDATE tenants SET plan_id=?,billing_required=1 WHERE id=?").run(s.plan_id, s.clinic_id);
            const initial = database_1.db.prepare("SELECT 1 FROM tenants WHERE id=? AND status='pending' AND billing_required=1").get(s.clinic_id);
            if (initial) {
                database_1.db.prepare("UPDATE tenants SET status='active',updated_at=datetime('now') WHERE id=? AND status='pending'").run(s.clinic_id);
                const manager = database_1.db.prepare("SELECT user_id FROM clinic_users WHERE tenant_id=? AND is_manager=1 AND status='pending' ORDER BY created_at LIMIT 1").get(s.clinic_id);
                if (manager) {
                    database_1.db.prepare("UPDATE users SET status='active' WHERE id=? AND status='pending'").run(manager.user_id);
                    database_1.db.prepare("UPDATE clinic_users SET status='active' WHERE tenant_id=? AND user_id=? AND status='pending'").run(s.clinic_id, manager.user_id);
                }
            }
            if (['TRIAL', 'TRIAL_EXPIRED'].includes(s.status)) {
                database_1.db.prepare("UPDATE trial_history SET status = 'CONVERTED', converted_at = datetime('now'), updated_at = datetime('now') WHERE subscription_id = ? OR tenant_id = ?").run(s.id, s.clinic_id);
                (0, billing_service_1.billingAudit)(s, 'TRIAL_CONVERTED_TO_ACTIVE', s.status, 'ACTIVE');
            }
            else {
                database_1.db.prepare("UPDATE trial_history SET status = 'CONVERTED', converted_at = datetime('now'), updated_at = datetime('now') WHERE tenant_id = ? AND status IN ('ACTIVE', 'EXPIRED')").run(s.clinic_id);
            }
        }
        if (status !== s.status)
            (0, billing_service_1.billingAudit)(s, status === 'ACTIVE' && ['SUSPENDED', 'PAST_DUE'].includes(s.status) ? 'REACTIVATED' : status, s.status, status);
    }
    static start() {
        if (this.timer)
            return;
        this.timer = setInterval(() => this.processPending().catch((err) => { console.error('[Billing] Reconciliação pendente.'); error_monitor_service_1.ErrorMonitor.captureException(err, { source: 'billing-reconciliation' }); }), 30000);
        this.timer.unref();
        void this.processPending();
    }
    static stop() { if (this.timer)
        clearInterval(this.timer); this.timer = null; }
}
exports.BillingWebhookService = BillingWebhookService;
