// Deterministic integration tests. No external gateway or production data is used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'zemda-billing-'));
process.env.DATABASE_PATH=path.join(root,'test.sqlite');
process.env.ASAAS_ENV='sandbox';process.env.ASAAS_API_URL='https://api-sandbox.asaas.com/v3';
process.env.ASAAS_API_KEY='$aact_hmlg_test_only';process.env.ASAAS_WEBHOOK_TOKEN='local-test-webhook-token-not-a-secret-12345';process.env.APP_URL='https://zemda.test';
process.env.EMAIL_OTP_SECRET='local-test-otp-secret-must-be-long-enough-12345';
process.env.JWT_SECRET='local-test-jwt-secret-must-be-long-enough-12345';
const jwt=require('jsonwebtoken');
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
  if(!String(url).startsWith('https://api-sandbox.asaas.com/v3')) {
    assert.equal(new URL(url).hostname,'127.0.0.1','External network forbidden in billing tests');return actualFetch(url,options);
  }
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
  assert.deepEqual(BillingService.plans().map(p=>[p.code,p.monthly_price,p.max_users]),[['SOLO',69.9,1],['TEAM',249.9,5],['CLINIC',619.9,15]]);
  const verificationId = 'verif_test_1';
  db.prepare(`
    INSERT INTO email_verifications (id, email, purpose, code_hash, status, verified_at, expires_at)
    VALUES (?, 'new@test.invalid', 'clinic_registration', 'dummy', 'verified', datetime('now'), datetime('now', '+15 minutes'))
  `).run(verificationId);
  const emailVerificationToken = jwt.sign(
    { email: 'new@test.invalid', purpose: 'clinic_registration', verified: true, verificationId },
    process.env.EMAIL_OTP_SECRET,
    { expiresIn: '15m' }
  );
  let r=await call('/v1/public/tenants/register',{responsibleName:'Owner',email:'new@test.invalid',password:'password123',clinicName:'New Clinic',cnpjCpf:'12345678909',termsAccepted:true,privacyAccepted:true,emailVerificationToken});
  assert.equal(r.status,201,JSON.stringify(r));const clinic=r.body.clinicId;
  r=await call('/v1/auth/login',{email:'new@test.invalid',password:'password123'});assert.equal(r.status,200,JSON.stringify(r));
  const signupToken=r.body.token;
  const pendingOnboarding = await call('/v1/patients',null,signupToken);
  assert.equal(pendingOnboarding.status,402);
  assert.equal(pendingOnboarding.body.code,'BILLING_ACCESS_REQUIRED');
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
  const completedProfile=await call('/v1/onboarding/complete-profile',{practiceAreaIds:[]},signupToken);
  assert.equal(completedProfile.status,200,JSON.stringify(completedProfile));
  assert.equal((await call('/v1/patients',null,signupToken)).status,200);
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
  for(let i=5;i<=14;i++)account('clinic-'+i,'C','professional');assert.equal(activeUsers('C'),15);assert.throws(()=>account('clinic-21','C'),/PLAN_USER_LIMIT_REACHED/);
  account('global-local','C','superadmin');assert.equal(activeUsers('C'),15);
  assert.equal((await call('/subscriptions/change-plan',{planCode:'TEAM'})).status,422);
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
  // Public final plan selection: persisted intent never grants paid access.
  failCheckout=false;
  require('./dist/services/trial-notification.service').TrialNotificationService.notifyTrialStarted=async()=>{};
  for(const plan of BillingService.plans()) {
    const email=`signup-${plan.code.toLowerCase()}@test.invalid`,vid=`verify-${plan.code}`;
    db.prepare("INSERT INTO email_verifications(id,email,purpose,code_hash,status,expires_at) VALUES(?,?,'clinic_registration','test','verified',datetime('now','+1 hour'))").run(vid,email);
    const verificationToken=jwt.sign({email,purpose:'clinic_registration',verified:true,verificationId:vid},process.env.EMAIL_OTP_SECRET,{expiresIn:'15m'});
    const created=await call('/v1/public/tenants/register',{responsibleName:'Plan QA',email,password:'Synthetic123',phone:'11999999999',professionId:'prof-fonoaudiologo',profession:'Fonoaudiólogo',termsAccepted:true,privacyAccepted:true,emailVerificationToken:verificationToken,planCode:plan.code,startTrial:plan.code==='SOLO'});
    assert.equal(created.status,201,JSON.stringify(created));
    const cid=created.body.clinicId,auth=created.body.token;
    assert.equal(db.prepare('SELECT plan_id FROM tenants WHERE id=?').get(cid).plan_id,plan.id);
    assert.equal(db.prepare('SELECT profession_id FROM users WHERE id=?').get(created.body.user.id).profession_id,'prof-fonoaudiologo');
    if(plan.code==='SOLO') {
      assert.equal(created.body.isTrial,true);assert.equal(canOperate(cid),false);
      const ready=await call('/v1/onboarding/complete-profile',{practiceAreaIds:[]},auth);
      assert.equal(ready.status,200,JSON.stringify(ready));assert.equal(canOperate(cid),true);
      const trial=db.prepare('SELECT * FROM subscriptions WHERE clinic_id=? AND is_current=1').get(cid);
      assert.equal(trial.status,'TRIAL');assert.equal(Date.parse(trial.trial_ends_at)-Date.parse(trial.trial_started_at),7*86400000);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM billing_checkouts WHERE clinic_id=?').get(cid).n,0);continue;
    }
    assert.equal(created.body.isTrial,false);assert.equal(canOperate(cid),false);
    const selected=await call('/v1/onboarding/select-plan',{planCode:plan.code},auth);
    assert.equal(selected.body.onboardingStatus,'pending_payment');assert.equal(selected.body.requiresCheckout,true);
    assert.equal((await call('/v1/onboarding/current-state',null,auth)).body.hasPlan,false);
    assert.equal((await call('/v1/onboarding/complete-profile',{practiceAreaIds:[]},auth)).status,402);

    assert.equal(BillingService.summary(cid).selectedPlan.id,plan.id);assert.equal(BillingService.summary(cid).confirmedPurchase,null);
    assert.equal((await call('/subscriptions/profile',{...profile,email},auth,'PUT')).status,200);
    rejectCheckout=true;assert.equal((await call('/subscriptions/checkout',{planCode:plan.code},auth)).status,422);rejectCheckout=false;
    assert.equal(canOperate(cid),false);assert.ok(db.prepare('SELECT id FROM users WHERE id=?').get(created.body.user.id));
    assert.equal((await call('/subscriptions/checkout',{planCode:plan.code},auth)).status,200);
    let pendingSub=db.prepare('SELECT * FROM subscriptions WHERE clinic_id=? AND is_current=1').get(cid);
    await event('CHECKOUT_CANCELED',{checkout:{id:pendingSub.asaas_checkout_id,customer:pendingSub.asaas_customer_id}});
    assert.equal(canOperate(cid),false);assert.equal(BillingService.summary(cid).confirmedPurchase,null);
    assert.equal((await call('/subscriptions/checkout',{planCode:plan.code},auth)).status,200);
    pendingSub=db.prepare('SELECT * FROM subscriptions WHERE clinic_id=? AND is_current=1').get(cid);
    const remote={id:'remote-'+plan.code,customer:pendingSub.asaas_customer_id,value:plan.monthly_price,status:'ACTIVE',cycle:'MONTHLY',externalReference:pendingSub.external_reference};remoteSubscriptions.set(remote.id,remote);
    const paid={id:'payment-'+plan.code,customer:remote.customer,subscription:remote.id,checkoutSession:pendingSub.asaas_checkout_id,status:'PENDING',billingType:'CREDIT_CARD',value:plan.monthly_price,dueDate:currentDay()};payments.set(paid.id,paid);
    await event('PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',{payment:paid});assert.equal(canOperate(cid),false);assert.equal(BillingService.summary(cid).confirmedPurchase,null);
    paid.status='CONFIRMED';await event('PAYMENT_CONFIRMED',{payment:paid});assert.equal(canOperate(cid),true);
    assert.equal(db.prepare('SELECT onboarding_status FROM users WHERE id=?').get(created.body.user.id).onboarding_status,'pending_profile');
    assert.equal((await call('/v1/onboarding/complete-profile',{practiceAreaIds:[]},auth)).status,200);
    assert.equal((await call('/v1/patients',null,auth)).status,200);
    const confirmed=BillingService.summary(cid);assert.equal(confirmed.plan.code,plan.code);assert.equal(confirmed.confirmedPurchase.value,plan.monthly_price);assert.deepEqual(Object.keys(confirmed.confirmedPurchase).sort(),['transaction_id','value']);
  }
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  // Contracted seats: exercise HTTP, database guards and authoritative gateway reads.
  async function seatClinic(code,total,expected,trial=false) {
    const cid=`seats-${code}-${total}`,uid=`owner-${cid}`,auth=token(uid,cid);
    db.prepare("INSERT INTO tenants(id,slug,name,email,status,cnpj_cpf,billing_address_json) VALUES(?,?,?,?,'active',?,?)")
      .run(cid,cid,cid,`${cid}@test.invalid`,String(10000000000+checkoutCounter),JSON.stringify(testAddress));
    account(uid,cid);
    if(trial) {
      db.prepare('INSERT INTO patients(id,tenant_id,full_name,phone) VALUES(?,?,?,?)').run(`patient-${cid}`,cid,'Paciente preservado','11999999999');
      await BillingService.startSoloTrial(cid,uid);
      const local=db.prepare('SELECT * FROM subscriptions WHERE clinic_id=? AND is_current=1').get(cid);
      assert.equal(local.gateway_environment,null);
      assert.equal(Date.parse(local.trial_ends_at)-Date.parse(local.trial_started_at),7*86400000);
    }
    let result=await call('/subscriptions/checkout',{planCode:code,contractedUsers:total,price:0.01,monthlyTotal:0.01},auth);
    assert.equal(result.status,200,JSON.stringify(result));
    const getSub=()=>db.prepare('SELECT * FROM subscriptions WHERE clinic_id=? AND is_current=1').get(cid);
    let local=getSub();assert.equal(checkouts.get(local.asaas_checkout_id).items[0].value,expected);
    const before=checkoutCounter;
    assert.equal((await call('/subscriptions/checkout',{planCode:code,contractedUsers:total},auth)).status,200);
    assert.equal(checkoutCounter,before);
    assert.equal(local.status,'PENDING_PAYMENT');
    if(trial) {
      assert.equal(db.prepare('SELECT status FROM trial_history WHERE tenant_id=?').get(cid).status,'ACTIVE');
      await event('CHECKOUT_CANCELED',{checkout:{id:local.asaas_checkout_id,customer:local.asaas_customer_id}});
      assert.notEqual(getSub().status,'ACTIVE');
      assert.equal(db.prepare('SELECT converted_at FROM trial_history WHERE tenant_id=?').get(cid).converted_at,null);
      assert.equal((await call('/subscriptions/checkout',{planCode:code,contractedUsers:total},auth)).status,200);
      local=getSub();
    }
    const remote={id:`sub-${cid}`,customer:local.asaas_customer_id,value:expected,status:'ACTIVE',cycle:'MONTHLY',externalReference:local.external_reference};
    remoteSubscriptions.set(remote.id,remote);
    const pay={id:`pay-${cid}`,customer:remote.customer,subscription:remote.id,checkoutSession:local.asaas_checkout_id,status:'CONFIRMED',billingType:'CREDIT_CARD',value:expected,dueDate:currentDay()};
    payments.set(pay.id,pay);
    if(total===2 && code==='SOLO') { pay.value=69.9;await event('PAYMENT_CONFIRMED',{payment:pay});assert.equal(getSub().status,'PENDING_PAYMENT');pay.value=expected; }
    await event('PAYMENT_CONFIRMED',{payment:pay});assert.equal(getSub().status,'ACTIVE');
    if(trial) {
      assert.equal(db.prepare('SELECT status FROM trial_history WHERE tenant_id=?').get(cid).status,'CONVERTED');
      assert.equal(db.prepare('SELECT full_name FROM patients WHERE id=?').get(`patient-${cid}`).full_name,'Paciente preservado');
      assert.ok(db.prepare('SELECT id FROM users WHERE id=?').get(uid));
    }
    for(let n=1;n<total;n++)account(`${cid}-${n}`,cid,'professional');
    assert.equal(activeUsers(cid),total);
    assert.equal((await call('/v1/staff/invites',{role:'professional'},auth)).body.code,'PLAN_USER_LIMIT_REACHED');
    assert.throws(()=>account(`${cid}-overflow`,cid),/PLAN_USER_LIMIT_REACHED/);
    if(total>1) {
      db.prepare("UPDATE users SET status='inactive' WHERE id=?").run(`${cid}-1`);
      assert.equal(activeUsers(cid),total-1);
      account(`${cid}-replacement`,cid,'professional');assert.equal(activeUsers(cid),total);
      assert.throws(()=>db.prepare("UPDATE users SET status='active' WHERE id=?").run(`${cid}-1`),/PLAN_USER_LIMIT_REACHED/);
    }
    assert.equal(BillingService.summary(cid).monthlyTotal,expected);
    assert.equal(BillingService.summary(cid).maxUsers,total);
    return {cid,uid,auth,getSub,remote};
  }
  const seatSolo=await seatClinic('SOLO',1,69.9,true);
  await seatClinic('SOLO',2,129.8);await seatClinic('SOLO',3,189.7);
  const seatTeam=await seatClinic('TEAM',7,339.7);await seatClinic('TEAM',12,564.2);
  await seatClinic('CLINIC',15,619.9);await seatClinic('CLINIC',18,709.6);
  for(const [code,total] of [['SOLO',4],['TEAM',13],['SOLO',1.5],['SOLO','2'],['CLINIC',14]]) {
    assert.equal((await call('/subscriptions/checkout',{planCode:code,contractedUsers:total},seatSolo.auth)).status,422);
  }
  async function renewSeats(fixture,code,total,price,omitQuantity=false) {
    const previous=fixture.getSub(),due=previous.current_period_end;
    const result=await call('/subscriptions/change-plan',{planCode:code,...(omitQuantity?{}:{contractedUsers:total}),price:0.01},fixture.auth);
    assert.equal(result.status,200,JSON.stringify(result));
    assert.equal(fixture.remote.value,price);
    assert.equal(fixture.getSub().pending_contracted_users,total);
    if(total<(previous.contracted_users || 1) && activeUsers(fixture.cid)===total) assert.throws(()=>account(`pending-reduction-${eventCounter}`,fixture.cid),/PLAN_USER_LIMIT_REACHED/);
    assert.equal((await call('/subscriptions/change-plan',{planCode:code,contractedUsers:total},fixture.auth)).body.code,'PLAN_CHANGE_PENDING');
    clock=Date.parse(due+'T13:00:00Z');fixture.auth=token(fixture.uid,fixture.cid);
    const payment={id:`renew-${fixture.cid}-${eventCounter}`,customer:fixture.remote.customer,subscription:fixture.remote.id,status:'CONFIRMED',billingType:'CREDIT_CARD',value:price,dueDate:due};
    payments.set(payment.id,payment);await event('PAYMENT_CONFIRMED',{payment});
    assert.equal(fixture.getSub().contracted_users,total);assert.equal(fixture.getSub().pending_plan_id,null);
    assert.equal(BillingService.summary(fixture.cid).monthlyTotal,price);
    if(fixture===seatSolo) assert.equal(db.prepare('SELECT status FROM trial_history WHERE tenant_id=?').get(fixture.cid).status,'CONVERTED');
  }
  await renewSeats(seatSolo,'SOLO',3,189.7);
  account('solo-renew-extra',seatSolo.cid,'professional');
  assert.equal((await call('/subscriptions/change-plan',{planCode:'SOLO',contractedUsers:1},seatSolo.auth)).status,409);
  db.prepare("UPDATE users SET status='inactive' WHERE id='solo-renew-extra'").run();
  await renewSeats(seatSolo,'SOLO',1,69.9);
  await renewSeats(seatSolo,'TEAM',7,339.7);
  // Omitted quantity preserves the seven contracted seats when possible.
  assert.equal((await call('/subscriptions/change-plan',{planCode:'SOLO'},seatSolo.auth)).status,422);
  await renewSeats(seatSolo,'CLINIC',15,619.9,true);
  await renewSeats(seatSolo,'CLINIC',18,709.6);
  assert.equal((await call('/subscriptions/change-plan',{planCode:'CLINIC'},seatSolo.auth)).status,200);
  assert.equal(seatSolo.getSub().contracted_users,18);
  const bound=seatSolo.getSub();
  db.prepare("UPDATE subscriptions SET gateway_environment='production' WHERE id=?").run(bound.id);
  assert.equal((await call('/subscriptions/checkout',{planCode:'CLINIC',contractedUsers:18},seatSolo.auth)).body.code,'ENVIRONMENT_MISMATCH');
  assert.equal((await call('/subscriptions/change-plan',{planCode:'CLINIC',contractedUsers:19},seatSolo.auth)).body.code,'ENVIRONMENT_MISMATCH');
  db.prepare("UPDATE subscriptions SET gateway_environment='sandbox' WHERE id=?").run(bound.id);
  require('./dist/config/billing-migration').migrateBilling(db);
  assert.equal(seatSolo.getSub().contracted_users,18);
  assert.equal(BillingService.summary(seatSolo.cid).monthlyTotal,709.6);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  console.log('PASS: billing, local trial checkout/cancellation/confirmed conversion, exact 7 days, 1/5/15 included + contracted seats, exact server prices, caps 3/12, clinic expansion, recurring increases/reductions, deactivation, plan changes, duplicate protection and gateway environment isolation (mock Asaas only).');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{global.fetch=actualFetch;global.Date=OriginalDate;BillingWebhookService.stop();server?.close();});
