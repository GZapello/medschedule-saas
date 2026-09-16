import { db } from '../config/database';
import { AsaasService } from './asaas.service';
import { purgeClinic } from './clinic-control.service';

const actor = 'system:registration-expiry';
const reason = 'Cadastro não ativado e sem pagamento, expirado após 5 dias.';
// Everything outside the initial registration/billing journey counts as use.
// New clinical tables are protected by default, including FK-only children.
const temporaryTables = new Set(['tenants', 'users', 'clinic_users', 'professionals',
  'legal_acceptances', 'audit_logs', 'subscriptions', 'billing_customers',
  'billing_checkouts', 'subscription_audit', 'asaas_webhook_events']);

function eligible(id: string): boolean {
  if (!db.prepare(`SELECT 1 FROM tenants WHERE id=? AND status='pending' AND billing_required=1
    AND datetime(created_at)<=datetime('now','-5 days')
    AND COALESCE(onboarding_completed,0)=0 AND COALESCE(manager_confirmed,0)=0`).get(id)) return false;
  if (db.prepare('SELECT 1 FROM billing_operations WHERE clinic_id=?').get(id)) return false;
  if (db.prepare(`SELECT 1 FROM users u WHERE (u.tenant_id=? OR u.id IN
    (SELECT user_id FROM clinic_users WHERE tenant_id=?)) AND
    (u.status<>'pending' OR u.role<>'clinic_admin' OR u.tenant_id IS NULL OR u.tenant_id<>?
     OR EXISTS(SELECT 1 FROM clinic_users cu WHERE cu.user_id=u.id AND cu.tenant_id<>?))`).get(id,id,id,id)) return false;
  if (db.prepare(`SELECT 1 FROM clinic_users WHERE tenant_id=? AND
    (status<>'pending' OR approved_at IS NOT NULL OR is_manager<>1)`).get(id)) return false;
  if (db.prepare(`SELECT 1 FROM professionals WHERE tenant_id=? AND
    (user_id IS NULL OR user_id NOT IN (SELECT id FROM users WHERE tenant_id=? AND status='pending' AND role='clinic_admin'))`).get(id,id)) return false;
  // Check ALL historical subscriptions, not only is_current. A canceled paid
  // account must never become an abandoned registration again.
  if (db.prepare(`SELECT 1 FROM subscriptions WHERE (clinic_id=? OR tenant_id=?) AND
    (managed<>1 OR UPPER(status) NOT IN ('PENDING_PAYMENT','CANCELED')
    OR COALESCE(current_period_end,'')<>'' OR COALESCE(asaas_subscription_id,'')<>'')`).get(id,id)) return false;
  // Preserve any charge, including refunded/deleted charges and unconfirmed
  // charges that could still settle. No financial history is discarded.
  if (db.prepare(`SELECT 1 FROM subscription_payments p WHERE p.clinic_id=? OR p.subscription_id IN
    (SELECT id FROM subscriptions WHERE clinic_id=? OR tenant_id=?)`).get(id,id,id)) return false;
  if (db.prepare(`SELECT 1 FROM subscription_audit WHERE clinic_id=? AND
    (UPPER(COALESCE(previous_status,'')) IN ('ACTIVE','PAST_DUE','SUSPENDED') OR
     UPPER(COALESCE(next_status,'')) IN ('ACTIVE','PAST_DUE','SUSPENDED'))`).get(id)) return false;
  if (db.prepare(`SELECT 1 FROM global_clinic_audit WHERE clinic_id=? AND action NOT IN
    ('DELETE_REQUESTED','DELETE_COMPLETED')`).get(id)) return false;
  if (db.prepare(`SELECT 1 FROM audit_logs WHERE (tenant_id=? OR (entity='tenants' AND entity_id=?))
    AND action NOT IN ('REGISTER_CLINIC_REQUEST','USER_LOGIN','LEGAL_ACCEPTANCE','UPDATE_OWN_PASSWORD','UPDATE_OWN_EMAIL')`).get(id,id)) return false;
  if (db.prepare(`SELECT 1 FROM billing_checkouts WHERE clinic_id=? AND
    (state NOT IN ('FAILED','CANCELED','EXPIRED','OPEN') OR
     (state='OPEN' AND (expires_at IS NULL OR datetime(expires_at) IS NULL OR datetime(expires_at)>datetime('now'))))`).get(id)) return false;
  // Unassigned/early webhook events must finish reconciliation before deletion.
  if (registrationEvents(id).some(row => ['PENDING','PROCESSING','RETRY'].includes(row.processing_status) ||
    !['CHECKOUT_CREATED','CHECKOUT_EXPIRED','CHECKOUT_CANCELED'].includes(row.event_type))) return false;
  return true;
}

function registrationEvents(id: string): any[] {
  const identifiers = new Set<string>([id, `ZEMDA_CLINIC_${id}`]);
  for (const table of ['subscriptions','billing_customers','billing_checkouts']) {
    for (const row of db.prepare(`SELECT * FROM ${table} WHERE clinic_id=?`).all(id)) {
      for (const key of ['asaas_customer_id','asaas_subscription_id','asaas_checkout_id','external_reference'])
        if (row[key]) identifiers.add(row[key]);
    }
  }
  return db.prepare(`SELECT rowid AS __rowid,* FROM asaas_webhook_events
    WHERE clinic_id=? OR clinic_id IS NULL`).all(id).filter((row:any) => {
    const e = JSON.parse(row.payload);
    const matches = row.clinic_id===id || ['payment','subscription','checkout'].some(key =>
      e[key] && ['id','customer','subscription','checkoutSession','externalReference'].some(field => identifiers.has(e[key][field])));
    return matches;
  });
}

// Read-only reconciliation: a missing webhook must not make a paid clinic
// look unpaid. Empty, complete lists are required; ambiguity fails closed.
async function gatewayIsEmpty(id: string): Promise<boolean> {
  const customers = db.prepare('SELECT * FROM billing_customers WHERE clinic_id=?').all(id);
  const subscriptions = db.prepare('SELECT * FROM subscriptions WHERE clinic_id=?').all(id);
  const checkouts = db.prepare('SELECT * FROM billing_checkouts WHERE clinic_id=?').all(id);
  if (!customers.length && !subscriptions.length && !checkouts.length) return true;
  const environment = AsaasService.getEnvironment();
  if (customers.some((c:any)=>c.environment!==environment || !c.asaas_customer_id || c.state!=='READY') ||
      subscriptions.some((s:any)=>s.gateway_environment!==environment || !s.asaas_customer_id) ||
      checkouts.some((c:any)=>c.environment!==environment)) return false;
  const ids = new Set<string>([...customers.map((c:any)=>c.asaas_customer_id), ...subscriptions.map((s:any)=>s.asaas_customer_id)]);
  if (!ids.size) return false;
  for (const customer of ids) {
    // Verify identity too: Asaas returns an empty list for an unknown customer.
    const remote = await AsaasService.request(`/customers/${encodeURIComponent(customer)}`);
    if (remote.id!==customer || remote.deleted || remote.externalReference!==`ZEMDA_CLINIC_${id}`) return false;
    for (const endpoint of ['subscriptions','payments']) {
      const result = await AsaasService.request(`/${endpoint}?customer=${encodeURIComponent(customer)}&limit=100${endpoint==='subscriptions'?'&includeDeleted=true':''}`);
      if (!Array.isArray(result.data) || result.data.length || result.hasMore!==false || result.totalCount!==0) return false;
    }
  }
  return true;
}

function snapshot(id: string): string {
  return JSON.stringify(['billing_customers','billing_checkouts','subscriptions'].map(table =>
    db.prepare(`SELECT * FROM ${table} WHERE clinic_id=? ORDER BY id`).all(id)));
}

export class RegistrationCleanupService {
  private static running = false;
  private static nextRun = 0;
  static async runDue(): Promise<void> {
    if (this.running || Date.now()<this.nextRun) return;
    this.running=true;
    this.nextRun=Date.now()+3600000;
    try {
      // Resume only this worker's already committed deletion manifests.
      const jobs=db.prepare(`SELECT j.clinic_id FROM clinic_deletion_jobs j WHERE EXISTS
        (SELECT 1 FROM global_clinic_audit a WHERE a.clinic_id=j.clinic_id AND a.admin_id=? AND a.action='DELETE_REQUESTED')`).all(actor);
      for (const job of jobs) {
        try { purgeClinic(job.clinic_id,actor,reason); }
        catch { console.warn('[RegistrationCleanup] FILE_CLEANUP_RETRY'); }
      }
      const candidates=db.prepare(`SELECT id FROM tenants WHERE status='pending' AND billing_required=1
        AND datetime(created_at)<=datetime('now','-5 days') ORDER BY created_at,id`).all();
      for (const {id} of candidates) {
        try {
          if (!eligible(id)) continue;
          const before=snapshot(id);
          if (!await gatewayIsEmpty(id)) continue;
          purgeClinic(id,actor,reason,{reauthenticated:false,guard:owned=>{
            if (!eligible(id) || before!==snapshot(id)) throw new Error('REGISTRATION_CHANGED');
            for (const [table,rows] of owned) if (rows.size && !temporaryTables.has(table)) throw new Error('CLINIC_ALREADY_USED');
            // Early checkout notifications can still lack clinic_id. Remove only
            // terminal, exactly matched registration events in this transaction.
            for (const row of registrationEvents(id)) owned.get('asaas_webhook_events')!.add(row);
          }});
        } catch {
          // Never log customer data, provider payloads, or credentials.
          console.warn('[RegistrationCleanup] REGISTRATION_PRESERVED');
        }
      }
    } finally { this.running=false; }
  }
}
