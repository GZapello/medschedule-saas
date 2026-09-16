// Isolated integration test: no real accounts, credentials, or gateway requests.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'zemda-registration-'));
process.env.DATABASE_PATH=path.join(temp,'test.sqlite');
process.env.CLINIC_UPLOAD_ROOT=path.join(temp,'uploads');
process.env.ASAAS_ENV='sandbox';
const {db,initializeDatabase}=require('./dist/config/database');initializeDatabase();initializeDatabase();
const {RegistrationCleanupService:cleanup}=require('./dist/services/registration-cleanup.service');
const {BillingWebhookService}=require('./dist/services/billing-webhook.service');
const {AsaasService}=require('./dist/services/asaas.service');
const express=require('express'),app=express();app.use(express.json());app.use('/api',require('./dist/routes').default);
const plan=db.prepare("SELECT id FROM plans WHERE code='SOLO'").get().id;
const remote=new Map();let requests=0;
AsaasService.request=async endpoint=>{
  requests++;
  const u=new URL('https://test.invalid'+endpoint),customer=u.searchParams.get('customer') || u.pathname.split('/')[2];
  const value=remote.get(customer);assert.ok(value,'Unexpected gateway request');
  if(value.fail)throw new Error('simulated unavailable gateway');
  if(value.mutate){value.mutate();delete value.mutate;}
  if(u.pathname.startsWith('/customers/'))return {id:customer,externalReference:`ZEMDA_CLINIC_${value.clinic}`};
  const data=u.pathname==='/subscriptions'?(value.subscriptions||[]):(value.payments||[]);
  return {data,hasMore:!!value.more,totalCount:data.length};
};
const exists=id=>!!db.prepare('SELECT 1 FROM tenants WHERE id=?').get(id);
const run=async()=>{cleanup.nextRun=0;await cleanup.runDue();};
function subscription(id,status='PENDING_PAYMENT'){
  const sid='sub-'+id;
  db.prepare(`INSERT INTO subscriptions(id,tenant_id,clinic_id,plan_id,status,current_period_start,current_period_end,managed,gateway_environment,asaas_customer_id)
    VALUES(?,?,?,?,?,date('now'),'',1,'sandbox',?)`).run(sid,id,id,plan,status,'cus-'+id);
  return sid;
}
function gateway(id,values={}){
  subscription(id);
  db.prepare(`INSERT INTO billing_customers(id,clinic_id,environment,asaas_customer_id,state,external_reference)
    VALUES(?,?,'sandbox',?,'READY',?)`).run('bc-'+id,id,'cus-'+id,`ZEMDA_CLINIC_${id}`);
  remote.set('cus-'+id,{clinic:id,...values});
}
let server;
(async()=>{
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const register=async(name,email=name+'@test.invalid')=>{
    const r=await fetch(base+'/v1/public/tenants/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      responsibleName:name,email,password:'password123',clinicName:name,termsAccepted:true,privacyAccepted:true,managerProfession:'Fisioterapeuta'
    })});const body=await r.json();return {...body,status:r.status};
  };
  const create=async(name,age='-6 days')=>{
    const result=await register(name);assert.equal(result.status,201,JSON.stringify(result));
    db.prepare("UPDATE tenants SET created_at=datetime('now',?) WHERE id=?").run(age,result.clinicId);return result.clinicId;
  };
  const abandoned=await create('abandoned');
  assert.equal((await register('retry','abandoned@test.invalid')).status,409);
  const recent=await create('recent','-4 days');
  const boundary=await create('boundary','-5 days');
  const active=await create('active');db.prepare("UPDATE tenants SET status='active' WHERE id=?").run(active);
  const paid=await create('paid');const paidSub=subscription(paid);
  db.prepare(`INSERT INTO subscription_payments(id,clinic_id,subscription_id,asaas_payment_id,amount,contract_amount,plan_id,status,due_date,confirmed_at)
    VALUES('paid',?,?, 'pay-paid',59.9,59.9,?,'REFUNDED',date('now'),datetime('now'))`).run(paid,paidSub,plan);
  const activeSub=await create('active-sub');subscription(activeSub,'ACTIVE');
  const historical=await create('historical');subscription(historical,'CANCELED');
  db.prepare("UPDATE subscriptions SET current_period_end='2020-01-01' WHERE clinic_id=?").run(historical);
  const used=await create('used');db.prepare("INSERT INTO patients(id,tenant_id,full_name,phone) VALUES('patient-used',?,'Patient','11999999999')").run(used);
  const onboarding=await create('onboarding');db.prepare('UPDATE tenants SET onboarding_completed=1 WHERE id=?').run(onboarding);
  const approved=await create('approved');db.prepare(`INSERT INTO audit_logs(id,tenant_id,action,entity,entity_id) VALUES('approved',?,'ADMIN_APPROVE_CLINIC','tenants',?)`).run(approved,approved);
  const legacy=await create('legacy');db.prepare('UPDATE tenants SET billing_required=0 WHERE id=?').run(legacy);
  const shared=await create('shared');const sharedUser=db.prepare('SELECT id FROM users WHERE tenant_id=?').get(shared).id;
  db.prepare("INSERT INTO clinic_users(id,tenant_id,user_id,role,status,is_manager) VALUES('shared-link',?,?,'clinic_admin','pending',1)").run(recent,sharedUser);
  const expired=await create('expired');gateway(expired);
  db.prepare(`INSERT INTO billing_checkouts(id,clinic_id,subscription_id,environment,external_reference,asaas_checkout_id,plan_id,state,expires_at)
    VALUES('expired',?,?,'sandbox','expired-ref','checkout-expired',?,'OPEN',datetime('now','-5 days'))`).run(expired,'sub-'+expired,plan);
  db.prepare(`INSERT INTO asaas_webhook_events(id,asaas_event_id,event_type,payload,processing_status)
    VALUES('expired-event','expired-event','CHECKOUT_EXPIRED',?,'PROCESSED')`).run(JSON.stringify({checkout:{id:'checkout-expired'}}));
  const remotePaid=await create('remote-paid');gateway(remotePaid,{payments:[{id:'pay',status:'CONFIRMED'}]});
  const remoteActive=await create('remote-active');gateway(remoteActive,{subscriptions:[{id:'remote-sub',status:'ACTIVE'}]});
  const unavailable=await create('unavailable');gateway(unavailable,{fail:true});
  const paginated=await create('paginated');gateway(paginated,{more:true});
  const wrongEnv=await create('environment');gateway(wrongEnv);db.prepare("UPDATE billing_customers SET environment='production' WHERE clinic_id=?").run(wrongEnv);
  const racing=await create('racing');gateway(racing,{mutate:()=>db.prepare("UPDATE tenants SET status='active' WHERE id=?").run(racing)});
  const changing=await create('changing');gateway(changing,{mutate:()=>db.prepare("UPDATE subscriptions SET external_reference='changed' WHERE clinic_id=?").run(changing)});
  const busy=await create('busy');db.prepare("INSERT INTO billing_operations(clinic_id,token) VALUES(?,'busy')").run(busy);
  const futureTable=await create('future-table');
  db.exec('CREATE TABLE cleanup_test_clinical_child (id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id))');
  db.prepare("INSERT INTO cleanup_test_clinical_child SELECT 'future-child',id FROM users WHERE tenant_id=?").run(futureTable);
  await run();
  for(const id of [abandoned,boundary,expired])assert.equal(exists(id),false,'Should expire '+id);
  for(const id of [recent,active,paid,activeSub,historical,used,onboarding,approved,legacy,shared,remotePaid,remoteActive,unavailable,paginated,wrongEnv,racing,changing,busy,futureTable])assert.equal(exists(id),true,'Must preserve '+id);
  assert.equal(db.prepare("SELECT 1 FROM users WHERE email='abandoned@test.invalid'").get(),undefined);
  assert.equal(db.prepare("SELECT 1 FROM asaas_webhook_events WHERE id='expired-event'").get(),undefined);
  for(const table of ['clinic_users','professionals'])assert.equal(db.prepare(`SELECT 1 FROM ${table} WHERE tenant_id=?`).get(abandoned),undefined);
  assert.equal(db.prepare('SELECT 1 FROM legal_acceptances WHERE clinic_id=?').get(abandoned),undefined);
  assert.equal(db.prepare("SELECT action,reauthenticated FROM global_clinic_audit WHERE clinic_id=?").get(abandoned).action,'DELETE_COMPLETED');
  assert.equal(db.prepare("SELECT reauthenticated FROM global_clinic_audit WHERE clinic_id=?").get(abandoned).reauthenticated,0);
  assert.equal((await register('recreated','abandoned@test.invalid')).status,201,'Email must be reusable through real registration API');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  const before=requests;await cleanup.runDue();assert.equal(requests,before,'Hourly throttle');
  // An unassigned payment notification blocks deletion until reconciled.
  const waiting=await create('waiting');gateway(waiting);
  db.prepare(`INSERT INTO asaas_webhook_events(id,asaas_event_id,event_type,payload,processing_status)
    VALUES('waiting-event','waiting-event','PAYMENT_CONFIRMED',?,'RETRY')`).run(JSON.stringify({payment:{customer:'cus-'+waiting}}));
  await run();assert.equal(exists(waiting),true);
  db.prepare("DELETE FROM asaas_webhook_events WHERE id='waiting-event'").run();
  cleanup.nextRun=0;await BillingWebhookService.processPending();
  for(let i=0;cleanup.running && i<100;i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(exists(waiting),false,'Existing billing worker triggers cleanup');
  // The optional guard leaves the existing administrator deletion contract intact.
  const manual=await create('manual','-1 day');
  require('./dist/services/clinic-control.service').purgeClinic(manual,'test-admin','Isolated regression test');
  assert.equal(exists(manual),false);
  assert.equal(db.prepare('SELECT reauthenticated FROM global_clinic_audit WHERE clinic_id=?').get(manual).reauthenticated,1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  console.log('PASS registration cleanup: five-day boundary, email reuse, linked records, paid/active/used/shared accounts, remote reconciliation, races, scheduler and throttle');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{BillingWebhookService.stop();server?.close();db.close?.();});
