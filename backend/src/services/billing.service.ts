import { db } from '../config/database';
import { randomUUID } from 'crypto';
import { AsaasService, AsaasError } from './asaas.service';

export class BillingError extends Error {
  constructor(public code: string, message: string, public httpStatus = 409) { super(message); }
}
export function billingAddress(t:any, required=false) {
  let saved:any={};try {saved=JSON.parse(t.billing_address_json || '{}');} catch {}
  const address={address:saved.address ?? t.street ?? t.address ?? '',addressNumber:saved.addressNumber ?? t.number ?? '',
    postalCode:String(saved.postalCode ?? t.zip_code ?? '').replace(/\D/g,''),province:saved.province ?? t.neighborhood ?? '',complement:saved.complement ?? t.complement ?? ''};
  if(required && (!/^\d{8}$/.test(address.postalCode) || ['address','addressNumber','province'].some(k=>typeof (address as any)[k]!=='string' || !(address as any)[k].trim())))
    throw new BillingError('BILLING_ADDRESS_REQUIRED','Complete o endereço nos Dados de cobrança: CEP, logradouro, número e bairro. O Asaas identifica a cidade pelo CEP.',422);
  return address;
}
export const today = () => new Date().toISOString().slice(0,10);
export function addDays(date: string, days: number): string { const d=new Date(date.slice(0,10)+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); }
export function addMonth(date: string): string {
  const d=new Date(date.slice(0,10)+'T12:00:00Z'); const day=d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth()+1);
  const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate(); d.setUTCDate(Math.min(day,end)); return d.toISOString().slice(0,10);
}
export function activeUsers(clinic: string): number { return db.prepare('SELECT COUNT(*) n FROM billing_active_users WHERE clinic_id=?').get(clinic).n; }
export function currentSubscription(clinic: string): any { return db.prepare('SELECT * FROM subscriptions WHERE clinic_id=? AND is_current=1').get(clinic); }
export function billingAudit(s: any, action: string, before: string | null, after: string, user: string | null=null, details: any={}) {
  db.prepare(`INSERT INTO subscription_audit(id,clinic_id,subscription_id,user_id,action,previous_status,next_status,details_json)
    VALUES(?,?,?,?,?,?,?,?)`).run(randomUUID(),s.clinic_id,s.id,user,action,before,after,JSON.stringify(details));
}
export function requireCapacity(clinic: string, additional=1, excludeUser?: string): void {
  const limit=db.prepare('SELECT max_users FROM billing_user_limits WHERE clinic_id=?').get(clinic);
  if (!limit) return; // Preserve legacy clinics until they subscribe.
  if (excludeUser && db.prepare('SELECT 1 FROM billing_active_users WHERE clinic_id=? AND user_id=?').get(clinic,excludeUser)) return;
  if (activeUsers(clinic)+additional > limit.max_users) throw new BillingError('PLAN_USER_LIMIT_REACHED','Limite do seu plano atingido.');
}
export function canOperate(clinic: string): boolean {
  const tenant=db.prepare('SELECT status,billing_required FROM tenants WHERE id=?').get(clinic);
  if (!tenant || tenant.status !== 'active') return false;
  if (!tenant.billing_required) return true;
  const s=currentSubscription(clinic); if (!s?.managed) return false;
  if (s.status==='ACTIVE') return !!s.current_period_end && s.current_period_end > today();
  if (s.status==='PAST_DUE') return !!s.current_period_end && !!s.grace_period_until && s.grace_period_until > today();
  return s.status==='CANCELED' && !!s.current_period_end && s.current_period_end > today();
}
export function pendingBillingManager(user: any): boolean {
  return user?.role==='clinic_admin' && user.status==='pending' && !!db.prepare("SELECT 1 FROM tenants t JOIN clinic_users cu ON cu.tenant_id=t.id WHERE t.id=? AND cu.user_id=? AND t.status='pending' AND t.billing_required=1 AND cu.is_manager=1 AND cu.status='pending'").get(user.tenant_id,user.id);
}

async function withOperation<T>(clinic: string, work:()=>Promise<T>):Promise<T> {
  const token=randomUUID();
  // Every remote request has a bounded timeout. Durable REQUESTED/UNKNOWN rows
  // still prevent duplicate creates after recovering an abandoned process lease.
  db.prepare("DELETE FROM billing_operations WHERE clinic_id=? AND created_at<datetime('now','-5 minutes')").run(clinic);
  try { db.prepare('INSERT INTO billing_operations(clinic_id,token) VALUES(?,?)').run(clinic,token); }
  catch { throw new BillingError('BILLING_OPERATION_PENDING','Já existe uma operação de assinatura em andamento. Aguarde ou solicite a conferência ao administrador.'); }
  try { return await work(); } finally { db.prepare('DELETE FROM billing_operations WHERE clinic_id=? AND token=?').run(clinic,token); }
}
function clinicForBilling(clinic: string): any {
  const t=db.prepare('SELECT * FROM tenants WHERE id=?').get(clinic);
  if (!t || !['active','pending'].includes(t.status)) throw new BillingError('CLINIC_BLOCKED','Esta clínica não está liberada para iniciar uma assinatura.',403);
  return t;
}
function chosenPlan(code: unknown): any {
  const p=typeof code==='string' ? db.prepare('SELECT * FROM plans WHERE code=? AND active=1').get(code) : null;
  if (!p) throw new BillingError('PLAN_INVALID','Selecione um plano válido.',400); return p;
}
function checkPlanSize(clinic: string, plan: any) {
  const count=activeUsers(clinic);
  if (count>plan.max_users) throw new BillingError('PLAN_USER_LIMIT_REACHED',`Você possui ${count} usuários ativos. O plano escolhido permite até ${plan.max_users}. Desative ${count-plan.max_users} usuários antes de continuar.`);
}
async function customer(t: any): Promise<string> {
  const environment=AsaasService.getEnvironment();
  let local=db.prepare('SELECT * FROM billing_customers WHERE clinic_id=? AND environment=?').get(t.id,environment);
  if (local?.asaas_customer_id) return local.asaas_customer_id;
  const reference=`ZEMDA_CLINIC_${t.id}`;
  const matches=await AsaasService.request(`/customers?externalReference=${encodeURIComponent(reference)}&limit=100`);
  const exact=(matches.data || []).filter((c:any)=>c.externalReference===reference && !c.deleted);
  if (exact.length>1) throw new BillingError('CUSTOMER_REVIEW_REQUIRED','Há mais de um cliente vinculado à clínica no gateway. Solicite uma conferência.');
  if (exact[0]) {
    db.prepare("INSERT INTO billing_customers(id,clinic_id,environment,asaas_customer_id,state,external_reference) VALUES(?,?,?,?,'READY',?) ON CONFLICT(clinic_id,environment) DO UPDATE SET asaas_customer_id=excluded.asaas_customer_id,state='READY'").run(randomUUID(),t.id,environment,exact[0].id,reference);
    return exact[0].id;
  }
  if (local?.state==='REQUESTED' || local?.state==='UNKNOWN') throw new BillingError('CUSTOMER_REVIEW_REQUIRED','A criação do cliente aguarda confirmação do Asaas. Não foi criado um cliente duplicado.');
  const cpfCnpj=String(t.cnpj_cpf || t.responsible_cpf || '').replace(/\D/g,'');
  if (![11,14].includes(cpfCnpj.length)) throw new BillingError('BILLING_PROFILE_REQUIRED','Preencha um CPF/CNPJ válido nos dados da clínica antes de assinar.',422);
  db.prepare("INSERT INTO billing_customers(id,clinic_id,environment,state,external_reference) VALUES(?,?,?,'REQUESTED',?) ON CONFLICT(clinic_id,environment) DO UPDATE SET state='REQUESTED'").run(randomUUID(),t.id,environment,reference);
  try {
    const result=await AsaasService.request('/customers',{method:'POST',body:{name:t.billing_name || t.corporate_name || t.name,cpfCnpj,email:t.responsible_email || t.email,
      mobilePhone:String(t.responsible_phone || t.phone || '').replace(/\D/g,'') || undefined,externalReference:reference}});
    if (typeof result.id!=='string') throw new AsaasError(0,true);
    db.prepare("UPDATE billing_customers SET asaas_customer_id=?,state='READY' WHERE clinic_id=? AND environment=?").run(result.id,t.id,environment);
    return result.id;
  } catch(e) {
    db.prepare('UPDATE billing_customers SET state=? WHERE clinic_id=? AND environment=?').run(e instanceof AsaasError && !e.ambiguous?'FAILED':'UNKNOWN',t.id,environment); throw e;
  }
}

export class BillingService {
  static plans() { return db.prepare('SELECT code,name,monthly_price,max_users FROM plans WHERE code IS NOT NULL AND active=1 ORDER BY monthly_price').all(); }
  static summary(clinic: string) {
    this.expireGrace();
    const s=currentSubscription(clinic);
    const plan=s?.managed ? db.prepare('SELECT code,name,monthly_price,max_users FROM plans WHERE id=?').get(s.plan_id) : null;
    const pending=s?.pending_plan_id ? db.prepare('SELECT code,name,monthly_price,max_users FROM plans WHERE id=?').get(s.pending_plan_id) : null;
    return {clinicName:db.prepare('SELECT name FROM tenants WHERE id=?').get(clinic)?.name,plan,status:s?.managed?s.status:'NOT_SUBSCRIBED',activeUsers:activeUsers(clinic),maxUsers:plan?.max_users || null,
      nextDueDate:s?.next_due_date || null,gracePeriodUntil:s?.grace_period_until || null,currentPeriodEnd:s?.current_period_end || null,
      pendingPlan:pending,changeEffectiveOn:s?.pending_plan_effective_on || null,canOperate:canOperate(clinic),
      environment:s?.gateway_environment || AsaasService.getEnvironment(),managed:!!s?.managed,
      payments:db.prepare('SELECT id,amount,billing_type,status,due_date,confirmed_at,received_at,invoice_url FROM subscription_payments WHERE clinic_id=? ORDER BY due_date DESC LIMIT 100').all(clinic)};
  }
  static async checkout(clinic:string,code:unknown,user:string):Promise<{url:string}> {
    AsaasService.config(); const app=AsaasService.appUrl();
    if ((process.env.ASAAS_WEBHOOK_TOKEN || '').length<32) throw new BillingError('WEBHOOK_NOT_CONFIGURED','Configure a autenticação do webhook antes de iniciar assinaturas.',503);
    return withOperation(clinic,async()=> {
      const t=clinicForBilling(clinic),plan=chosenPlan(code);checkPlanSize(clinic,plan);
      const environment=AsaasService.getEnvironment(); let s=currentSubscription(clinic);
      if (s?.managed && s.gateway_environment!==environment) throw new BillingError('ENVIRONMENT_MISMATCH','Esta assinatura pertence a outro ambiente. A migração exige uma nova contratação controlada.');
      if (s?.managed && s.status==='CANCELED' && s.current_period_end>today()) throw new BillingError('PAID_PERIOD_REMAINS',`Seu acesso pago permanece até ${s.current_period_end}. Inicie uma nova assinatura após esse período.`);
      if (s?.managed && s.asaas_subscription_id && s.status!=='CANCELED') throw new BillingError('SUBSCRIPTION_EXISTS','Use Alterar plano ou regularize a cobrança atual, sem criar uma assinatura duplicada.');
      const open=db.prepare("SELECT * FROM billing_checkouts WHERE clinic_id=? AND state IN ('REQUESTED','OPEN','UNKNOWN')").get(clinic);
      if (open) {
        if (open.plan_id===plan.id && open.state==='OPEN' && open.expires_at>new Date().toISOString()) return {url:AsaasService.safeUrl(open.url)};
        throw new BillingError('CHECKOUT_PENDING','Há um checkout pendente. Cancele-o ou aguarde a confirmação antes de iniciar outro.');
      }
      const address=billingAddress(t,true);
      const customerId=await customer(t);
      // Existing customers may predate address collection. Keep the same gateway ID.
      const updatedCustomer=await AsaasService.request(`/customers/${encodeURIComponent(customerId)}`,{method:'PUT',body:address});
      if(!updatedCustomer.city) throw new BillingError('BILLING_ADDRESS_REQUIRED','O Asaas não identificou a cidade. Confira o CEP e o endereço nos Dados de cobrança.',422);
      clinicForBilling(clinic);checkPlanSize(clinic,plan);
      const start=s?.status==='CANCELED' && s.current_period_end>today() ? s.current_period_end : today();
      const sid=randomUUID(),cid=randomUUID(),reference=`ZEMDA_CLINIC_${clinic}_SUB_${sid}`;
      db.transaction(()=>{
        if (s) db.prepare('UPDATE subscriptions SET is_current=0 WHERE id=?').run(s.id);
        db.prepare(`INSERT INTO subscriptions(id,tenant_id,clinic_id,plan_id,status,current_period_start,current_period_end,managed,is_current,
          asaas_customer_id,gateway_environment,next_due_date,external_reference,updated_at)
          VALUES(?,?,?,?,'PENDING_PAYMENT',?,'',1,1,?,?,?,?,datetime('now'))`).run(sid,clinic,clinic,plan.id,start,customerId,environment,start,reference);
        db.prepare("INSERT INTO billing_checkouts(id,clinic_id,subscription_id,environment,external_reference,plan_id,state) VALUES(?,?,?,?,?,?,'REQUESTED')").run(cid,clinic,sid,environment,reference,plan.id);
        s=db.prepare('SELECT * FROM subscriptions WHERE id=?').get(sid);
        billingAudit(s,'SUBSCRIPTION_CREATED',null,'PENDING_PAYMENT',user,{planCode:plan.code});
      })();
      try {
        const result=await AsaasService.request('/checkouts',{method:'POST',body:{customer:customerId,externalReference:reference,billingTypes:['CREDIT_CARD'],chargeTypes:['RECURRENT'],minutesToExpire:60,
          subscription:{cycle:'MONTHLY',nextDueDate:start+' 12:00:00'},
          items:[{name:plan.name,description:`Assinatura mensal Zemda - até ${plan.max_users} usuários`,quantity:1,value:plan.monthly_price}],
          callback:{successUrl:app+'/assinatura/sucesso',cancelUrl:app+'/assinatura/cancelada',expiredUrl:app+'/assinatura/expirada'}}});
        if (typeof result.id!=='string') throw new AsaasError(0,true);
        const url=AsaasService.checkoutUrl(result.id,result.link);
        db.transaction(()=>{
          db.prepare("UPDATE billing_checkouts SET asaas_checkout_id=?,url=?,state=CASE WHEN state='REQUESTED' THEN 'OPEN' ELSE state END,expires_at=? WHERE id=?").run(result.id,url,new Date(Date.now()+3600000).toISOString(),cid);
          db.prepare('UPDATE subscriptions SET asaas_checkout_id=?,checkout_url=?,updated_at=datetime(\'now\') WHERE id=?').run(result.id,url,sid);
          db.prepare('UPDATE tenants SET billing_required=1 WHERE id=?').run(clinic);
        })();
        return {url};
      } catch(e) {
        db.prepare("UPDATE billing_checkouts SET state=? WHERE id=? AND state='REQUESTED'").run(e instanceof AsaasError && !e.ambiguous?'FAILED':'UNKNOWN',cid); throw e;
      }
    });
  }
  static async changePlan(clinic:string,code:unknown,user:string) {
    return withOperation(clinic,async()=>{
      clinicForBilling(clinic);const s=currentSubscription(clinic),plan=chosenPlan(code);checkPlanSize(clinic,plan);
      if (!s?.managed || s.status!=='ACTIVE' || !s.asaas_subscription_id || s.cancelled_at) throw new BillingError('SUBSCRIPTION_NOT_ACTIVE','Regularize ou inicie uma assinatura antes de alterar o plano.');
      if(s.gateway_environment!==AsaasService.getEnvironment()) throw new BillingError('ENVIRONMENT_MISMATCH','Ambiente da assinatura incompatível.');
      if(s.plan_id===plan.id && !s.pending_plan_id) return {message:'Este já é o plano atual.'};
      if(s.pending_plan_id && s.pending_plan_id!==plan.id) throw new BillingError('PLAN_CHANGE_PENDING','Já existe uma mudança programada. Aguarde sua conclusão.');
      const due=s.current_period_end;
      if(!due || due<=today()) throw new BillingError('RENEWAL_PENDING','Aguarde a confirmação da renovação para alterar o plano.');
      // Do not alter an overdue invoice. All open charges must be future renewals.
      const charges=await AsaasService.request(`/subscriptions/${encodeURIComponent(s.asaas_subscription_id)}/payments?limit=100`);
      if(charges.hasMore || (charges.data || []).some((p:any)=>!['CONFIRMED','RECEIVED','REFUNDED','DELETED'].includes(p.status) && p.dueDate<due)) throw new BillingError('PAYMENTS_REVIEW_REQUIRED','Há cobranças pendentes que precisam ser regularizadas antes da mudança.');
      db.prepare("UPDATE subscriptions SET pending_plan_id=?,pending_plan_effective_on=?,plan_change_state='REQUESTED' WHERE id=?").run(plan.id,due,s.id);
      try {
        await AsaasService.request(`/subscriptions/${encodeURIComponent(s.asaas_subscription_id)}`,{method:'PUT',body:{value:plan.monthly_price,description:plan.name,updatePendingPayments:true}});
        db.transaction(()=>{
          db.prepare("UPDATE subscriptions SET plan_change_state='SCHEDULED',updated_at=datetime('now') WHERE id=?").run(s.id);
          billingAudit(s,'PLAN_CHANGE_SCHEDULED',s.status,s.status,user,{planCode:plan.code,effectiveOn:due});
        })();
      } catch(e) {
        if(e instanceof AsaasError && !e.ambiguous) db.prepare('UPDATE subscriptions SET pending_plan_id=NULL,pending_plan_effective_on=NULL,plan_change_state=NULL WHERE id=?').run(s.id);
        throw e;
      }
      return {message:'Mudança programada para o próximo ciclo. O limite será atualizado após a confirmação do pagamento.',effectiveOn:due};
    });
  }
  static async cancel(clinic:string,user:string,reason:string) {
    return withOperation(clinic,async()=>{
      const s=currentSubscription(clinic);if(!s?.managed) throw new BillingError('SUBSCRIPTION_NOT_FOUND','Assinatura não encontrada.',404);
      if(s.gateway_environment!==AsaasService.getEnvironment()) throw new BillingError('ENVIRONMENT_MISMATCH','Ambiente incompatível.');
      if(s.cancelled_at) return {message:'Assinatura já cancelada.'};
      const open=db.prepare("SELECT * FROM billing_checkouts WHERE subscription_id=? AND state IN ('REQUESTED','UNKNOWN','OPEN')").get(s.id);
      if(open && !open.asaas_checkout_id) throw new BillingError('CHECKOUT_UNKNOWN','A criação do checkout aguarda conciliação com o gateway.');
      if(open) await AsaasService.request(`/checkouts/${encodeURIComponent(open.asaas_checkout_id)}/cancel`,{method:'POST'});
      if(s.asaas_subscription_id) {
        try { await AsaasService.request(`/subscriptions/${encodeURIComponent(s.asaas_subscription_id)}`,{method:'DELETE'}); }
        catch(e) { if(!(e instanceof AsaasError && e.status===404)) throw e; }
      }
      db.transaction(()=>{
        db.prepare("UPDATE subscriptions SET status='CANCELED',cancelled_at=datetime('now'),cancelled_by=?,cancel_reason=?,pending_plan_id=NULL,pending_plan_effective_on=NULL,updated_at=datetime('now') WHERE id=?").run(user,reason,s.id);
        if(open) db.prepare("UPDATE billing_checkouts SET state='CANCELED' WHERE id=?").run(open.id);
        billingAudit(s,'CANCELED',s.status,'CANCELED',user,{planId:s.plan_id,reason});
      })();
      return {message:'Renovação cancelada. Os dados serão preservados e o acesso pago permanece até o fim do período.'};
    });
  }
  static expireGrace(): void {
    db.transaction(()=>{
      for(const s of db.prepare("SELECT * FROM subscriptions WHERE managed=1 AND is_current=1 AND ((status='ACTIVE' AND current_period_end!='' AND current_period_end<=?) OR (status='PAST_DUE' AND grace_period_until<=?))").all(today(),today())) {
        let status=s.status,grace=s.grace_period_until;
        if(status==='ACTIVE' && s.current_period_end && s.current_period_end<=today()) {status='PAST_DUE';grace=addDays(s.current_period_end,5);}
        if(status==='PAST_DUE' && grace && grace<=today()) status='SUSPENDED';
        if(status!==s.status) {
          db.prepare("UPDATE subscriptions SET status=?,grace_period_until=?,updated_at=datetime('now') WHERE id=?").run(status,grace,s.id);
          billingAudit(s,status,s.status,status);
        }
      }
    })();
  }
}
