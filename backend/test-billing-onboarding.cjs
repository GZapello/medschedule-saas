// Real router/controllers/SQLite, disposable DB, no external payments or messages.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
process.env.DATABASE_PATH=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'zemda-entitlement-')),'test.sqlite');
process.env.JWT_SECRET='synthetic-jwt-secret-12345678901234567890';
process.env.EMAIL_OTP_SECRET='synthetic-otp-secret-12345678901234567890';
process.env.ASAAS_ENV='sandbox';process.env.ASAAS_API_KEY='';
const {db,initializeDatabase}=require('./dist/config/database');initializeDatabase();initializeDatabase();
const {BillingService,canOperate,assertTrialEligibility,currentSubscription}=require('./dist/services/billing.service');
const {generateToken}=require('./dist/utils/jwt');
const {EmailService}=require('./dist/services/email.service');
EmailService.requestVerificationCode=async()=>({success:true});
const {TrialNotificationService}=require('./dist/services/trial-notification.service');
for(const name of ['notifyTrialStarted','notifyTrialExpired'])TrialNotificationService[name]=async()=>{};
const {AdminNotificationService}=require('./dist/services/admin-notification.service');
for(const name of Object.getOwnPropertyNames(AdminNotificationService))if(name.startsWith('notify'))AdminNotificationService[name]=async()=>{};
const {GoogleAuthService}=require('./dist/services/google-auth.service');
GoogleAuthService.verifyIdToken=async id=>({email:id,sub:'google-'+id,emailVerified:true,name:'Google QA'});
const express=require('express'),app=express();app.use(express.json());app.use('/api',require('./dist/routes').default);
const actualFetch=global.fetch;global.fetch=(url,options)=>{
  assert.match(String(url),/^http:\/\/127\.0\.0\.1:/,'External traffic prohibited');return actualFetch(url,options);
};
let server,checks=0;
const check=(value,expected,message)=>{assert.deepEqual(value,expected,message);checks++;};
(async()=>{
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const call=async(route,body,token,method=body?'POST':'GET',headers={})=>{
    const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body?JSON.stringify(body):undefined});
    return {status:r.status,body:await r.json()};
  };
  const signup=async(name)=>{
    const email=(name+'@test.invalid').toLowerCase();
    const r=await call('/v1/public/tenants/register',{email,password:'Synthetic123',responsibleName:'QA '+name,phone:'11999999999',clinicName:'QA '+name,
      professionId:'prof-fonoaudiologo',profession:'Fonoaudiólogo',termsAccepted:true,privacyAccepted:true});
    check(r.status,201,JSON.stringify(r));
    const code='123456',hash=crypto.createHmac('sha256',process.env.EMAIL_OTP_SECRET).update(`${email}:${code}:clinic_registration`).digest('hex');
    db.prepare("INSERT INTO email_verifications(id,email,purpose,code_hash,status,expires_at) VALUES(?,?,'clinic_registration',?,'pending',datetime('now','+1 hour'))").run(crypto.randomUUID(),email,hash);
    const verified=await call('/v1/onboarding/verify-email',{code},r.body.token);check(verified.status,200,JSON.stringify(verified));
    return {id:r.body.clinicId,uid:r.body.user.id,token:r.body.token,email};
  };
  const operational=['/v1/dashboard/metrics','/v1/appointments','/v1/patients','/v1/patient-sharing','/v1/patient-sharing/sources','/v1/clinical-records/patient/preserved'];
  for(const code of ['TEAM','CLINIC']) {
    const c=await signup('unpaid-'+code);
    const selected=await call('/v1/onboarding/select-plan',{planCode:code},c.token);
    check(selected.status,200);check(selected.body.onboardingStatus,'pending_payment');check(selected.body.requiresCheckout,true);
    check(canOperate(c.id),false);check(currentSubscription(c.id),undefined);
    check((await call('/v1/onboarding/current-state',null,c.token)).body.hasPlan,false);
    check((await call('/v1/onboarding/complete-profile',{practiceAreaIds:[]},c.token)).status,402);
    // Exact historic inconsistency: force technically active account/onboarding, no entitlement.
    db.prepare("UPDATE tenants SET status='active',onboarding_status='active' WHERE id=?").run(c.id);
    db.prepare("UPDATE users SET status='active',onboarding_status='active' WHERE id=?").run(c.uid);
    db.prepare("UPDATE clinic_users SET status='active' WHERE tenant_id=?").run(c.id);
    for(const route of operational) {
      const blocked=await call(route,null,c.token);check(blocked.status,402,route);check(blocked.body.code,'BILLING_ACCESS_REQUIRED');
    }
    check((await call('/v1/subscriptions/current',null,c.token)).status,200);
    check((await call('/v1/subscriptions/profile',null,c.token)).status,200);
    check((await call('/v1/auth/me',null,c.token)).status,200);
    check((await call('/v1/plans')).status,200);
    check((await call('/v1/support/tickets',null,c.token)).status,200);
    check(db.prepare('SELECT COUNT(*) n FROM users WHERE tenant_id=?').get(c.id).n,1);
    // Switching plan intent must never erase evidence of trial use.
    db.prepare('UPDATE tenants SET trial_used=1 WHERE id=?').run(c.id);
    await call('/v1/onboarding/select-plan',{planCode:'SOLO'},c.token);
    check(db.prepare('SELECT trial_used FROM tenants WHERE id=?').get(c.id).trial_used,1);
  }
  const c=await signup('solo');
  const started=await call('/v1/onboarding/select-plan',{planCode:'SOLO',startTrial:true},c.token);
  check(started.status,200);check(started.body.onboardingStatus,'pending_profile');
  check((await call('/v1/onboarding/complete-profile',{practiceAreaIds:[]},c.token)).status,200);
  const trial=currentSubscription(c.id),ends=trial.trial_ends_at;
  check(Date.parse(ends)-Date.parse(trial.trial_started_at),7*86400000);
  check(BillingService.summary(c.id).trialDaysRemaining,7);check(canOperate(c.id),true);
  check((await call('/v1/patients',null,c.token)).status,200);
  for(let i=0;i<2;i++) {
    const again=await call('/v1/subscriptions/start-trial',{},c.token);
    check(again.status,400);check(again.body.code,'TRIAL_ALREADY_USED');
  }
  check(currentSubscription(c.id).trial_ends_at,ends);
  db.prepare("INSERT INTO patients(id,tenant_id,full_name,phone) VALUES('preserved',?,'Synthetic preserved record','11999999999')").run(c.id);
  db.prepare("UPDATE subscriptions SET trial_ends_at=? WHERE id=?").run(new Date(Date.now()-1000).toISOString(),trial.id);
  check(BillingService.summary(c.id).status,'TRIAL_EXPIRED');check(canOperate(c.id),false);
  check((await call('/v1/patients',null,c.token)).status,402);
  check(db.prepare("SELECT full_name FROM patients WHERE id='preserved'").get().full_name,'Synthetic preserved record');
  const ended=await call('/v1/subscriptions/start-trial',{},c.token);
  check(ended.body.code,'TRIAL_ALREADY_USED');check(BillingService.summary(c.id).trialEligible,false);
  check(db.prepare('SELECT COUNT(*) n FROM trial_history WHERE tenant_id=?').get(c.id).n,1);
  // All history statuses consume eligibility, even if the flag was damaged/reset.
  for(const status of ['ACTIVE','EXPIRED','CONVERTED']) {
    db.prepare('UPDATE trial_history SET status=? WHERE tenant_id=?').run(status,c.id);
    db.prepare('UPDATE tenants SET trial_used=0 WHERE id=?').run(c.id);
    assert.throws(()=>assertTrialEligibility({clinicId:c.id}),e=>e.code==='TRIAL_ALREADY_USED');checks++;
    assert.throws(()=>assertTrialEligibility({email:'  SOLO@TEST.INVALID  '}),e=>e.code==='TRIAL_ALREADY_USED');checks++;
  }
  db.prepare("UPDATE trial_history SET cnpj_cpf='123.456.789-09' WHERE tenant_id=?").run(c.id);
  assert.throws(()=>assertTrialEligibility({document:'12345678909'}),e=>e.code==='TRIAL_ALREADY_USED');checks++;
  const googleBody={idToken:'other-google@test.invalid',context:'signup',additionalData:{responsibleName:'Google QA',clinicName:'Google QA',phone:'11999999999',
    cnpjCpf:'12345678909',startTrial:true,planCode:'SOLO',professionId:'prof-fonoaudiologo',profession:'Fonoaudiólogo',termsAccepted:true,privacyAccepted:true}};
  const googleRejected=await call('/v1/auth/google',googleBody);
  check(googleRejected.status,400,JSON.stringify(googleRejected));check(googleRejected.body.code,'TRIAL_ALREADY_USED');
  // Google cannot gain another seven days via a second signup path and a changed email.
  googleBody.idToken='fresh-google@test.invalid';delete googleBody.additionalData.cnpjCpf;
  const google=await call('/v1/auth/google',googleBody);check(google.status,201,JSON.stringify(google));
  const gid=google.body.tenant?.id || google.body.user?.tenantId;
  check(db.prepare('SELECT COUNT(*) n FROM trial_history WHERE tenant_id=?').get(gid).n,1);
  check((await call('/v1/subscriptions/start-trial',{},google.body.token)).body.code,'TRIAL_ALREADY_USED');
  const concurrent=await signup('concurrent');
  const concurrentResults=await Promise.all([call('/v1/subscriptions/start-trial',{},concurrent.token),call('/v1/subscriptions/start-trial',{},concurrent.token)]);
  check(concurrentResults.filter(r=>r.status===200).length,1);
  check(db.prepare('SELECT COUNT(*) n FROM trial_history WHERE tenant_id=?').get(concurrent.id).n,1);
  check(db.prepare("SELECT COUNT(*) n FROM subscriptions WHERE clinic_id=? AND status='TRIAL'").get(concurrent.id).n,1);
  // Financial state matrix; no status of users/onboarding is used to grant billing.
  const future=new Date(Date.now()+10*86400000).toISOString().slice(0,10),past='2000-01-01';
  const matrix=[['PENDING_PAYMENT',future,null,false],['TRIAL_EXPIRED',future,null,false],['SUSPENDED',future,null,false],
    ['ACTIVE',future,null,true],['ACTIVE',past,null,false],['PAST_DUE',future,future,true],['PAST_DUE',future,past,false],
    ['CANCELED',future,null,true],['CANCELED',past,null,false]];
  for(const [status,end,grace,allowed] of matrix) {
    db.prepare('UPDATE subscriptions SET status=?,current_period_end=?,grace_period_until=? WHERE id=?').run(status,end,grace,trial.id);
    check(canOperate(c.id),allowed,status+' '+end);
  }
  // Membership-based admin statistics, including another account's primary clinic.
  const other=await signup('other-clinic');
  db.prepare('UPDATE tenants SET billing_required=0,status=\'active\',onboarding_status=\'active\' WHERE id=?').run(other.id);
  db.prepare("UPDATE users SET status='active',onboarding_status='active' WHERE id=?").run(other.uid);
  db.prepare("UPDATE clinic_users SET status='active' WHERE tenant_id=?").run(other.id);
  db.prepare("INSERT INTO clinic_users(id,tenant_id,user_id,role,status,is_manager,profession_name) VALUES(?,?,?,'professional','active',0,'Fonoaudiólogo')")
    .run('cross-member',other.id,c.uid);
  db.prepare("INSERT INTO professionals(id,tenant_id,user_id,name,profession_name,active) VALUES('duplicate-prof',?,?,?,'Fonoaudiólogo',1)").run(other.id,c.uid,'QA solo');
  db.prepare("INSERT INTO users(id,name,email,password_hash,role,status) VALUES('qa-root','Root','qa-root@test.invalid','x','superadmin','active')").run();
  const rootToken=generateToken({userId:'qa-root',role:'superadmin',email:'qa-root@test.invalid',name:'Root'});
  db.prepare("INSERT INTO users(id,tenant_id,name,email,password_hash,role,status) VALUES('patient-account',?,'Patient','patient-account@test.invalid','x','patient','active')").run(other.id);
  db.prepare("INSERT INTO clinic_users(id,tenant_id,user_id,role,status,is_manager) VALUES('patient-membership',?,'patient-account','patient','active',0)").run(other.id);
  const summary=await call(`/v1/admin/tenants/${other.id}/summary`,null,rootToken);
  check(summary.status,200,JSON.stringify(summary));check(summary.body.users.active,2);
  check(summary.body.activeProfessionals.filter(p=>p.id===c.uid).length,1);
  check(summary.body.activeProfessionals.find(p=>p.id===c.uid).email,c.email);
  check(summary.body.subscription.activeUsers,2);check(summary.body.subscription.canOperate,true); // Legacy billing_required=0 is preserved.
  check((await call(`/v1/admin/tenants/${other.id}/summary`,null,other.token)).status,403);
  const listed=await call('/v1/tenants',null,rootToken);check(listed.status,200);
  check(listed.body.find(t=>t.id===c.id).subscription_status,'CANCELED');
  // An explicit administrative grant keeps its own lifecycle, but cannot be restarted by a commercial button.
  db.prepare(`INSERT INTO free_trials(id,token,target_name,target_email,duration_days,duration_label,status,created_by,
    link_expires_at,activated_at,trial_end_at,tenant_id,user_id) VALUES('admin-grant','admin-grant-token','QA',?,30,'30 dias','used','qa-root',?,?,?, ?,?)`)
    .run(other.email,new Date().toISOString(),new Date().toISOString(),past,other.id,other.uid);
  assert.throws(()=>assertTrialEligibility({clinicId:other.id,userId:other.uid}),e=>e.code==='TRIAL_ALREADY_USED');checks++;
  check(canOperate(other.id),true); // No commercial gate is imposed on billing_required=0.
  check(db.prepare('PRAGMA foreign_key_check').all(),[]);
  console.log(`PASS: ${checks} billing/onboarding assertions: unpaid TEAM/CLINIC, OTP, account-active bypass, protected APIs, unique 7-day trial, expiration/data retention, direct retries, history statuses, normalized identities, Google signup, financial states, legacy clinics, multi-clinic SuperAdmin.`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{global.fetch=actualFetch;server?.close();});
