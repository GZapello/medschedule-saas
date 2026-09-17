// Deterministic integration tests. No external gateway or production data is used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'zemda-billing-'));
process.env.DATABASE_PATH=path.join(root,'test.sqlite');
process.env.ASAAS_ENV='sandbox';process.env.ASAAS_API_URL='https://api-sandbox.asaas.com/v3';
process.env.ASAAS_API_KEY='$aact_hmlg_test_only';process.env.ASAAS_WEBHOOK_TOKEN='local-test-webhook-token-not-a-secret-12345';process.env.APP_URL='https://zemda.test';
const {db,initializeDatabase}=require('./dist/config/database');initializeDatabase();initializeDatabase();
const {generateToken}=require('./dist/utils/jwt');
const {BillingService,activeUsers,canOperate,addMonth}=require('./dist/services/billing.service');
const {BillingWebhookService}=require('./dist/services/billing-webhook.service');
const {AsaasService}=require('./dist/services/asaas.service');
const bcrypt=require('bcryptjs'),express=require('express');
const app=express();app.use(express.json());app.use('/api',require('./dist/routes').default);
const OriginalDate=Date;let clock=OriginalDate.now();
global.Date=class extends OriginalDate {constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
const currentDay=()=>new Date().toISOString().slice(0,10);
const actualFetch=global.fetch,calls=[],customers=new Map(),checkouts=new Map(),remoteSubscriptions=new Map(),payments=new Map();
let customerCounter=0,checkoutCounter=0,failCheckout=false,rejectCheckout=false;
const testAddress={address:'Rua de Teste',addressNumber:'100',province:'Centro',postalCode:'01310930',complement:''};
global.fetch=async(url,options={})=>{
  if(!String(url).startsWith('https://api-sandbox.asaas.com/v3')) return actualFetch(url,options);
  assert.equal(options.headers.access_token,process.env.ASAAS_API_KEY);assert.equal(options.headers['User-Agent'],'Zemda/1.0');
  const u=new URL(url),resource=u.pathname.slice(3),body=options.body?JSON.parse(options.body):null;calls.push({resource,method:options.method,body});
  const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
  if(resource==='/finance/balance')return reply({balance:0});
  if(resource==='/customers' && options.method==='GET')return reply({data:[...customers.values()].filter(c=>c.externalReference===u.searchParams.get('externalReference'))});
  if(resource==='/customers' && options.method==='POST'){const c={...body,id:'cus_'+(++customerCounter)};customers.set(c.id,c);return reply(c);}
  if(resource.startsWith('/customers/') && options.method==='PUT') {
    const c=customers.get(resource.split('/')[2]);Object.assign(c,body,{city:123});return reply(c);
  }
  if(resource==='/checkouts' && options.method==='POST'){
    if(failCheckout)throw new Error('simulated network loss');
    if(rejectCheckout)return reply({errors:[{code:'invalid_object',description:'O campo address deve existir para o customer informado. PRIVATE_PROVIDER_DATA'}]},400);
    const customer=customers.get(body.customer);for(const k of ['address','addressNumber','postalCode','province','city'])assert.ok(customer[k],`Missing customer ${k}`);
    const c={...body,id:'checkout_'+(++checkoutCounter)};checkouts.set(c.id,c);return reply({id:c.id,link:'https://sandbox.asaas.com/checkoutSession/show?id='+c.id});
  }
  if(/^\/checkouts\/.+\/cancel$/.test(resource))return reply({deleted:true});
  if(resource==='/payments')return reply({data:[...payments.values()].filter(p=>p.checkoutSession===u.searchParams.get('checkoutSession'))});
  if(resource==='/subscriptions' && options.method==='GET') return reply({data:[...remoteSubscriptions.values()].filter(s=>s.customer===u.searchParams.get('customer') && s.externalReference===u.searchParams.get('externalReference'))});
  if(/^\/payments\//.test(resource)){const p=payments.get(decodeURIComponent(resource.split('/')[2]));return p?reply(p):reply({},404);}
  const subId=resource.split('/')[2];
  if(resource.endsWith('/payments'))return reply({data:[...payments.values()].filter(p=>p.subscription===subId)});
  if(resource.startsWith('/subscriptions/')){
    if(options.method==='DELETE'){remoteSubscriptions.delete(subId);return reply({deleted:true});}
    if(options.method==='PUT'){const s=remoteSubscriptions.get(subId);Object.assign(s,body);for(const p of payments.values())if(p.subscription===subId && p.status==='PENDING')p.value=body.value;return reply(s);}
    return remoteSubscriptions.has(subId)?reply(remoteSubscriptions.get(subId)):reply({},404);
  }
  throw new Error('Unexpected mock resource '+resource);
};
const account=(id,clinic,role='clinic_admin',status='active')=>{
  db.prepare('INSERT INTO users(id,tenant_id,name,email,password_hash,role,status) VALUES(?,?,?,?,?,?,?)').run(id,clinic,id,`${id}@test.invalid`,bcrypt.hashSync('test-password',4),role,status);
  if(clinic)db.prepare('INSERT INTO clinic_users(id,tenant_id,user_id,role,status,is_manager) VALUES(?,?,?,?,?,?)').run('cu-'+id,clinic,id,role,status,role==='clinic_admin'?1:0);
};
account('root',null,'superadmin');
const token=(id='owner',clinic='C',role='clinic_admin')=>generateToken({userId:id,tenantId:clinic,role,email:`${id}@test.invalid`,name:id});
let server,eventCounter=0;
(async()=>{
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api`;
  const call=async(route,body=null,auth=token(),method=body?'POST':'GET',headers={})=>{
    const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth,...headers},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};
  };
  const event=async(type,payload,id='evt_'+(++eventCounter))=>{
    const r=await call('/webhooks/asaas',{id,event:type,dateCreated:new Date().toISOString(),...payload},'', 'POST',{'asaas-access-token':process.env.ASAAS_WEBHOOK_TOKEN});assert.equal(r.status,200);
    for(let i=0;i<100;i++) {await BillingWebhookService.processPending();if(!BillingWebhookService.running)break;await new Promise(r=>setTimeout(r,5));}
    return {id,...r};
  };
  assert.deepEqual(BillingService.plans().map(p=>[p.code,p.monthly_price,p.max_users]),[['SOLO',69.9,1],['TEAM',249.9,5],['CLINIC',619.9,20]]);
  // End-to-end registration creates only a pending owner with access to billing.
  let r=await call('/v1/public/tenants/register',{responsibleName:'Owner',email:'new@test.invalid',password:'password123',clinicName:'New Clinic',cnpjCpf:'12345678909',termsAccepted:true,privacyAccepted:true});
  assert.equal(r.status,201,JSON.stringify(r));const clinic=r.body.clinicId;
  r=await call('/v1/auth/login',{email:'new@test.invalid',password:'password123'});assert.equal(r.status,200,JSON.stringify(r));
  const signupToken=r.body.token;
  assert.equal((await call('/v1/patients',null,signupToken)).status,402);
  assert.equal((await call('/subscriptions/current',null,signupToken)).status,200);
  assert.equal((await call('/admin/subscriptions',null,signupToken)).status,403);
  r=await call('/subscriptions/checkout',{planCode:'SOLO'},signupToken);assert.equal(r.status,422);assert.equal(r.body.code,'BILLING_ADDRESS_REQUIRED');assert.equal(customerCounter,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM billing_checkouts WHERE clinic_id=?').get(clinic).n,0);
  const profile={name:'Owner',cpfCnpj:'12345678909',email:'new@test.invalid',phone:'',...testAddress};
  r=await call('/subscriptions/profile',{...profile,postalCode:'123'},signupToken,'PUT');assert.equal(r.status,422);
  r=await call('/subscriptions/profile',profile,signupToken,'PUT');assert.equal(r.status,200,JSON.stringify(r));
  assert.equal((await call('/subscriptions/profile',null,signupToken)).body.address,testAddress.address);
  rejectCheckout=true;r=await call('/subscriptions/checkout',{planCode:'SOLO'},signupToken);assert.equal(r.status,422);assert.equal(r.body.code,'ASAAS_VALIDATION_ERROR');assert.ok(!JSON.stringify(r.body).includes('PRIVATE_PROVIDER_DATA'));
  assert.equal(db.prepare('SELECT state FROM billing_checkouts WHERE clinic_id=?').get(clinic).state,'FAILED');rejectCheckout=false;
  r=await call('/subscriptions/checkout',{planCode:'SOLO',price:0.01,maxUsers:999},signupToken);assert.equal(r.status,200,JSON.stringify(r));assert.deepEqual(Object.keys(r.body),['url']);
  const sid=db.prepare('SELECT id FROM subscriptions WHERE clinic_id=? AND managed=1 AND is_current=1').get(clinic).id;
  const sub=()=>db.prepare('SELECT * FROM subscriptions WHERE id=?').get(sid);
  const checkout=checkouts.get(sub().asaas_checkout_id);
  assert.equal(checkout.items[0].value,69.9);assert.deepEqual(checkout.billingTypes,['CREDIT_CARD']);assert.deepEqual(checkout.chargeTypes,['RECURRENT']);assert.equal(checkout.subscription.cycle,'MONTHLY');
  assert.equal(sub().status,'PENDING_PAYMENT'); // Callback rendering performs only a read.
  await call('/subscriptions/current',null,signupToken);assert.equal(sub().status,'PENDING_PAYMENT');
  const callsBefore=checkoutCounter;assert.equal((await call('/subscriptions/checkout',{planCode:'SOLO'},signupToken)).status,200);assert.equal(checkoutCounter,callsBefore);
  assert.equal(customerCounter,1);
  assert.equal((await call('/webhooks/asaas',{id:'forged',event:'CHECKOUT_PAID',checkout},{},'POST')).status,401);
  assert.equal(db.prepare("SELECT id FROM asaas_webhook_events WHERE asaas_event_id='forged'").get(),undefined);
  const gatewaySub={id:'sub_real',customer:sub().asaas_customer_id,value:69.9,status:'ACTIVE',cycle:'MONTHLY',externalReference:sub().external_reference};remoteSubscriptions.set(gatewaySub.id,gatewaySub);
  const payment={id:'pay_initial',customer:gatewaySub.customer,subscription:gatewaySub.id,checkoutSession:checkout.id,status:'CONFIRMED',billingType:'CREDIT_CARD',value:69.9,dueDate:currentDay(),invoiceUrl:'https://sandbox.asaas.com/i/pay_initial',creditCard:{creditCardToken:'NEVER_STORE',cvv:'999'}};payments.set(payment.id,payment);
  payment.status='PENDING';await event('PAYMENT_CREATED',{payment});assert.equal(sub().status,'PENDING_PAYMENT');
  await event('PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',{payment});assert.equal(sub().status,'PENDING_PAYMENT');
  payment.status='CONFIRMED';await event('CHECKOUT_PAID',{checkout:{id:checkout.id,customer:gatewaySub.customer}});assert.equal(sub().status,'ACTIVE');
  const paidEvent=await event('PAYMENT_CONFIRMED',{payment});assert.equal(sub().status,'ACTIVE');assert.equal(activeUsers(clinic),1);assert.equal(canOperate(clinic),true);
  assert.ok(!db.prepare('SELECT payload FROM asaas_webhook_events WHERE asaas_event_id=?').get(paidEvent.id).payload.includes('NEVER_STORE'));
  const end=sub().current_period_end;
  await event('PAYMENT_CONFIRMED',{payment},paidEvent.id);assert.equal(db.prepare('SELECT COUNT(*) n FROM subscription_payments WHERE subscription_id=?').get(sid).n,1);assert.equal(sub().current_period_end,end);
  payment.status='RECEIVED';await event('PAYMENT_RECEIVED',{payment});assert.equal(sub().current_period_end,end);
  assert.throws(()=>account('solo-extra',clinic),/PLAN_USER_LIMIT_REACHED/);assert.equal(activeUsers(clinic),1);
  // Isolated second clinic, with the official Team limit enforced by DB triggers.
  db.prepare("INSERT INTO tenants(id,slug,name,email,status,billing_required) VALUES('C','c','Clinic C','c@test.invalid','active',1)").run();
  account('owner','C');
  db.prepare("INSERT INTO subscriptions(id,tenant_id,clinic_id,plan_id,status,current_period_start,current_period_end,managed,is_current,gateway_environment) VALUES('team','C','C','zemda-TEAM','ACTIVE',?,?,1,1,'sandbox')").run(currentDay(),addMonth(currentDay()));
  for(let i=1;i<=4;i++)account('team-'+i,'C',i===1?'receptionist':'professional');
  assert.equal(activeUsers('C'),5);assert.throws(()=>account('team-six','C'),/PLAN_USER_LIMIT_REACHED/);
  assert.equal((await call('/subscriptions/checkout',{planCode:'TEAM'},token('team-1','C','receptionist'))).status,403);
  db.prepare("UPDATE subscriptions SET plan_id='zemda-CLINIC' WHERE id='team'").run();
  for(let i=5;i<=19;i++)account('clinic-'+i,'C','professional');assert.equal(activeUsers('C'),20);assert.throws(()=>account('clinic-21','C'),/PLAN_USER_LIMIT_REACHED/);
  account('global-local','C','superadmin');assert.equal(activeUsers('C'),20);
  assert.equal((await call('/subscriptions/change-plan',{planCode:'TEAM'})).status,409);
  // Upgrade is scheduled; no local entitlement is changed without payment.
  r=await call('/subscriptions/change-plan',{planCode:'TEAM'},signupToken);assert.equal(r.status,200,JSON.stringify(r));assert.equal(sub().plan_id,'zemda-SOLO');assert.equal(sub().pending_plan_id,'zemda-TEAM');
  clock=new OriginalDate(end+'T12:00:00Z').getTime();
  const renewal={...payment,id:'pay_renewal',status:'OVERDUE',value:249.9,dueDate:end,invoiceUrl:'https://sandbox.asaas.com/i/pay_renewal'};payments.set(renewal.id,renewal);
  await event('PAYMENT_OVERDUE',{payment:renewal});assert.equal(sub().status,'PAST_DUE');const grace=sub().grace_period_until;assert.equal(canOperate(clinic),true);
  // Duplicate/late events cannot extend the five day grace window.
  await event('PAYMENT_OVERDUE',{payment:renewal});assert.equal(sub().grace_period_until,grace);
  clock=new OriginalDate(grace+'T12:00:00Z').getTime();BillingService.expireGrace();assert.equal(sub().status,'SUSPENDED');assert.equal(canOperate(clinic),false);
  const ownerId=db.prepare('SELECT user_id FROM clinic_users WHERE tenant_id=? AND is_manager=1').get(clinic).user_id;
  const freshToken=token(ownerId,clinic);
  assert.equal((await call('/v1/patients',null,freshToken)).status,402);assert.equal((await call('/subscriptions/current',null,freshToken)).status,200);
  renewal.status='CONFIRMED';await event('PAYMENT_CONFIRMED',{payment:renewal});assert.equal(sub().status,'ACTIVE');assert.equal(sub().plan_id,'zemda-TEAM');assert.equal(canOperate(clinic),true);
  payment.status='REFUNDED';await event('PAYMENT_REFUNDED',{payment});assert.equal(sub().status,'ACTIVE','refunding an old cycle cannot revoke the paid current cycle');
  assert.equal(db.prepare('SELECT status FROM subscription_payments WHERE asaas_payment_id=?').get(payment.id).status,'REFUNDED');
  // Paying must never undo an administrator ban.
  db.prepare("UPDATE tenants SET status='banned' WHERE id=?").run(clinic);
  await event('PAYMENT_RECEIVED',{payment:renewal});assert.equal(db.prepare('SELECT status FROM tenants WHERE id=?').get(clinic).status,'banned');assert.equal(canOperate(clinic),false);
  db.prepare("UPDATE tenants SET status='active' WHERE id=?").run(clinic);
  // Cancellation reconciles a missing gateway ID by the bound customer/reference,
  // then deletes only that remote subscription. It never updates customer data.
  db.prepare('UPDATE subscriptions SET asaas_subscription_id=NULL WHERE id=?').run(sid);
  const updatesBeforeCancel=calls.filter(c=>/^\/customers\//.test(c.resource) && c.method==='PUT').length;
  const cancelled=await call('/subscriptions/cancel',{confirmation:'CANCELAR',reason:'test'},freshToken);
  assert.equal(cancelled.status,200);assert.equal(sub().status,'CANCELED');assert.equal(sub().asaas_subscription_id,'sub_real');
  assert.equal(updatesBeforeCancel,calls.filter(c=>/^\/customers\//.test(c.resource) && c.method==='PUT').length);
  assert.ok(calls.some(c=>c.resource==='/subscriptions' && c.method==='GET'));
  assert.ok(calls.some(c=>c.resource==='/subscriptions/sub_real' && c.method==='DELETE'));
  assert.ok(!calls.some(c=>/^\/checkouts\/.+\/cancel$/.test(c.resource) && c.method==='POST'));
  assert.equal(db.prepare("SELECT cancelled_by FROM subscriptions WHERE id=?").get(sid).cancelled_by,ownerId);
  await event('PAYMENT_CONFIRMED',{payment:renewal});assert.equal(sub().status,'CANCELED');assert.ok(db.prepare('SELECT id FROM tenants WHERE id=?').get(clinic));
  db.prepare("UPDATE subscriptions SET status='ACTIVE',current_period_end=? WHERE id='team'").run(addMonth(currentDay()));
  const admin=token('root',null,'superadmin');r=await call('/admin/subscriptions',null,admin);assert.equal(r.status,200);assert.equal(r.body.mrr,619.9);assert.equal(r.body.total,2);
  assert.equal((await call('/admin/integrations/asaas/test',{},admin)).body.connected,true);
  process.env.ASAAS_ENV='production';assert.throws(()=>AsaasService.config());process.env.ASAAS_ENV='sandbox';
  // New checkout cancellation never grants an active subscription.
  db.prepare("INSERT INTO tenants(id,slug,name,email,cnpj_cpf,status) VALUES('cancel','cancel','Cancel','cancel@test.invalid','12345678909','active')").run();account('cancel-owner','cancel');
  const cancelToken=token('cancel-owner','cancel');
  db.prepare('UPDATE tenants SET billing_address_json=? WHERE id=?').run(JSON.stringify(testAddress),'cancel');
  r=await call('/subscriptions/checkout',{planCode:'SOLO'},cancelToken);assert.equal(r.status,200);
  const cancelSub=db.prepare("SELECT * FROM subscriptions WHERE clinic_id='cancel' AND is_current=1").get();await event('CHECKOUT_CANCELED',{checkout:{id:cancelSub.asaas_checkout_id,customer:cancelSub.asaas_customer_id}});
  assert.equal(db.prepare('SELECT status FROM subscriptions WHERE id=?').get(cancelSub.id).status,'CANCELED');
  // Ambiguous create does not retry POST and create a second checkout.
  failCheckout=true;r=await call('/subscriptions/checkout',{planCode:'TEAM'},cancelToken);assert.equal(r.status,502);
  const count=calls.filter(c=>c.resource==='/checkouts').length;
  r=await call('/subscriptions/checkout',{planCode:'TEAM'},cancelToken);assert.equal(r.status,409);assert.equal(calls.filter(c=>c.resource==='/checkouts').length,count);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  console.log('PASS: registration → hosted checkout → authenticated webhook → activation; prices, 1/5/20 seats, duplicate events, grace/suspension/reactivation, next-cycle upgrade, downgrade, cancellation, ban isolation, ambiguous retries, admin metrics, environment and secret isolation. Sandbox live validation remains required.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{global.fetch=actualFetch;global.Date=OriginalDate;BillingWebhookService.stop();server?.close();});
