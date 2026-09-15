import { Request,Response,NextFunction,Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { db } from '../config/database';
import { BillingError,BillingService,canOperate } from '../services/billing.service';
import { AsaasService,AsaasError } from '../services/asaas.service';
import { BillingWebhookService } from '../services/billing-webhook.service';
import { authMiddleware } from '../middlewares/auth.middleware';
import { tenantMiddleware } from '../middlewares/tenant.middleware';
import { requireRole } from '../middlewares/rbac.middleware';

export function respondBillingError(res:Response,error:any):boolean {
  if(error?.message?.includes('PLAN_USER_LIMIT_REACHED')) {res.status(409).json({code:'PLAN_USER_LIMIT_REACHED',error:'Limite do seu plano atingido.'});return true;}
  if(error instanceof BillingError) {res.status(error.httpStatus).json({code:error.code,error:error.message});return true;}
  return false;
}
function handler(fn:(req:Request,res:Response)=>any) {
  return async(req:Request,res:Response)=>{try {await fn(req,res);} catch(e) {
    if(respondBillingError(res,e)) return;
    res.status(e instanceof AsaasError?502:500).json({code:'BILLING_UNAVAILABLE',error:'Não foi possível concluir a operação. Verifique a integração ou tente novamente após a conciliação.'});
  }};
}
function manager(req:Request,res:Response,next:NextFunction) {
  if(!req.tenantId) {res.status(400).json({error:'Selecione uma clínica.'});return;}
  if(req.user?.role==='superadmin' || req.user?.role==='clinic_admin') {next();return;}
  const membership=db.prepare('SELECT is_manager,permissions_json FROM clinic_users WHERE tenant_id=? AND user_id=? AND status=\'active\'').get(req.tenantId,req.user?.userId);
  let permissions:string[]=[];try {permissions=JSON.parse(membership?.permissions_json || '[]');} catch {}
  if(membership?.is_manager || permissions.includes('manage_subscription')) {next();return;}
  res.status(403).json({error:'Somente o responsável ou gerenciador autorizado pode administrar a assinatura.'});
}
export function subscriptionGate(req:Request,res:Response,next:NextFunction) {
  if(req.user?.role==='superadmin' && /^\/(?:v1\/)?(?:admin|tenants|taxonomy|audit)(?:\/|$)/.test(req.path)) {next();return;}
  if(/^\/(?:v1\/)?(?:subscriptions|auth\/me|auth\/logout|auth\/change-password|tenants\/current)(?:\/|$)/.test(req.path) && (req.method==='GET' || req.path.includes('subscriptions') || req.path.includes('auth'))) {next();return;}
  if(req.tenantId) {
    BillingService.expireGrace();
    const t=db.prepare('SELECT billing_required FROM tenants WHERE id=?').get(req.tenantId);
    if(t?.billing_required && !canOperate(req.tenantId)) {res.status(402).json({code:'SUBSCRIPTION_REQUIRED',error:'Acesse Assinatura e Plano para regularizar o pagamento.'});return;}
  }
  next();
}
export function mountBillingRoutes(api:Router) {
  api.get(['/plans','/v1/plans'],handler((_req,res)=>res.json(BillingService.plans())));
  api.post(['/webhooks/asaas','/v1/webhooks/asaas'],(req,res)=>{
    const expected=process.env.ASAAS_WEBHOOK_TOKEN || '',provided=req.headers['asaas-access-token'];
    if(expected.length<32 || typeof provided!=='string' || Buffer.byteLength(expected)!==Buffer.byteLength(provided) || !timingSafeEqual(Buffer.from(expected),Buffer.from(provided))) {res.status(401).json({error:'Webhook não autorizado.'});return;}
    try {const duplicate=BillingWebhookService.receive(req.body);res.status(200).json({received:true,duplicate});void BillingWebhookService.processPending().catch(()=>{});}
    catch {res.status(400).json({error:'Evento inválido.'});}
  });
  const guard=[authMiddleware,tenantMiddleware];
  api.get(['/subscriptions/profile','/v1/subscriptions/profile'],...guard,manager,handler((req,res)=>{
    const t=db.prepare('SELECT COALESCE(billing_name,corporate_name,name) AS name,cnpj_cpf AS cpfCnpj,COALESCE(responsible_email,email) AS email,COALESCE(responsible_phone,phone) AS phone FROM tenants WHERE id=?').get(req.tenantId);
    res.json(t);
  }));
  api.put(['/subscriptions/profile','/v1/subscriptions/profile'],...guard,manager,handler(async(req,res)=>{
    const {name,cpfCnpj,email,phone}=req.body;
    const document=typeof cpfCnpj==='string'?cpfCnpj.replace(/\D/g,''):'';
    if(typeof name!=='string' || !name.trim() || name.length>160 || ![11,14].includes(document.length) || typeof email!=='string' || email.length>200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof phone!=='string' || phone.length>30) throw new BillingError('BILLING_PROFILE_INVALID','Confira nome, CPF/CNPJ, e-mail e telefone.',422);
    const customer=db.prepare('SELECT asaas_customer_id FROM billing_customers WHERE clinic_id=? AND environment=?').get(req.tenantId,AsaasService.getEnvironment());
    if(customer?.asaas_customer_id) await AsaasService.request(`/customers/${encodeURIComponent(customer.asaas_customer_id)}`,{method:'PUT',body:{name:name.trim(),cpfCnpj:document,email,mobilePhone:phone.replace(/\D/g,'') || undefined}});
    db.prepare('UPDATE tenants SET billing_name=?,cnpj_cpf=?,responsible_email=?,responsible_phone=?,updated_at=datetime(\'now\') WHERE id=?').run(name.trim(),document,email.trim().toLowerCase(),phone,req.tenantId);
    res.json({message:'Dados de cobrança atualizados.'});
  }));
  api.get(['/subscriptions/current','/v1/subscriptions/current'],...guard,handler((req,res)=>{
    if(!req.tenantId) throw new BillingError('CLINIC_REQUIRED','Selecione uma clínica.',400);
    const summary=BillingService.summary(req.tenantId);
    const member=db.prepare('SELECT is_manager,permissions_json FROM clinic_users WHERE tenant_id=? AND user_id=?').get(req.tenantId,req.user?.userId);
    let permissions:string[]=[];try {permissions=JSON.parse(member?.permissions_json || '[]');} catch {}
    const canManage=['superadmin','clinic_admin'].includes(req.user!.role) || !!member?.is_manager || permissions.includes('manage_subscription');
    if(!canManage) summary.payments=[];
    res.json({...summary,canManage});
  }));
  api.post(['/subscriptions/checkout','/v1/subscriptions/checkout'],...guard,manager,handler(async(req,res)=>res.json(await BillingService.checkout(req.tenantId!,req.body.planCode,req.user!.userId))));
  api.post(['/subscriptions/change-plan','/v1/subscriptions/change-plan'],...guard,manager,handler(async(req,res)=>res.json(await BillingService.changePlan(req.tenantId!,req.body.planCode,req.user!.userId))));
  api.post(['/subscriptions/cancel','/v1/subscriptions/cancel'],...guard,manager,handler(async(req,res)=>{
    if(req.body.confirmation!=='CANCELAR') throw new BillingError('CONFIRMATION_REQUIRED','Digite CANCELAR para confirmar.',400);
    res.json(await BillingService.cancel(req.tenantId!,req.user!.userId,typeof req.body.reason==='string'?req.body.reason.slice(0,1000):''));
  }));
  api.get(['/admin/subscriptions','/v1/admin/subscriptions'],...guard,requireRole('superadmin'),handler((req,res)=>{
    BillingService.expireGrace();
    const where=['s.managed=1','s.is_current=1'],params:any[]=[];
    for(const [key,column] of Object.entries({clinic:'t.name',plan:'p.code',status:'s.status'})) if(typeof req.query[key]==='string' && req.query[key]) {
      where.push(key==='clinic'?`${column} LIKE ?`:`${column}=?`);params.push(key==='clinic'?`%${req.query[key]}%`:req.query[key]);
    }
    for(const [key,operator] of [['from','>='],['to','<=']]) if(typeof req.query[key]==='string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query[key] as string)) {where.push(`date(s.created_at)${operator}?`);params.push(req.query[key]);}
    const rows=db.prepare(`SELECT s.id,s.clinic_id,t.name AS clinic_name,p.code,p.name AS plan_name,p.monthly_price,p.max_users,s.status,s.next_due_date,s.created_at,s.gateway_environment,
      s.pending_plan_id,s.plan_change_state FROM subscriptions s JOIN tenants t ON t.id=s.clinic_id JOIN plans p ON p.id=s.plan_id WHERE ${where.join(' AND ')} ORDER BY s.created_at DESC LIMIT 500`).all(...params);
    const counts=db.prepare('SELECT status,COUNT(*) total FROM subscriptions WHERE managed=1 AND is_current=1 GROUP BY status').all();
    const byPlan=db.prepare('SELECT p.code,COUNT(*) total FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.managed=1 AND s.is_current=1 GROUP BY p.code').all();
    const mrr=db.prepare("SELECT COALESCE(SUM(p.monthly_price),0) value FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.managed=1 AND s.is_current=1 AND s.status='ACTIVE'").get().value;
    const pendingEvents=db.prepare("SELECT COUNT(*) n FROM asaas_webhook_events WHERE processing_status IN ('PENDING','RETRY','PROCESSING')").get().n;
    res.json({rows,counts,byPlan,mrr,pendingEvents,total:counts.reduce((n:any,r:any)=>n+r.total,0)});
  }));
  api.get(['/admin/integrations/asaas/status','/v1/admin/integrations/asaas/status'],...guard,requireRole('superadmin'),handler((_req,res)=>{
    const environment=AsaasService.getEnvironment();const row=db.prepare('SELECT connected,last_test_at,error FROM billing_integration_status WHERE environment=?').get(environment);
    res.json({environment,connected:row?!!row.connected:null,lastTest:row?.last_test_at || null,error:row?.error || null});
  }));
  api.post(['/admin/integrations/asaas/test','/v1/admin/integrations/asaas/test'],...guard,requireRole('superadmin'),handler(async(_req,res)=>{
    const result=await AsaasService.checkConnection(),lastTest=new Date().toISOString();
    db.prepare('INSERT INTO billing_integration_status(environment,connected,last_test_at,error) VALUES(?,?,?,?) ON CONFLICT(environment) DO UPDATE SET connected=excluded.connected,last_test_at=excluded.last_test_at,error=excluded.error').run(result.environment,result.connected?1:0,lastTest,result.error || null);
    res.json({...result,lastTest});
  }));
}
