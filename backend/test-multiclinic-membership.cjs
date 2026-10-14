const assert = require('node:assert/strict');
const {initializeDatabase,db}=require('./dist/config/database');
initializeDatabase();
const {generateToken}=require('./dist/utils/jwt');
const {authMiddleware}=require('./dist/middlewares/auth.middleware');
const {MembershipController}=require('./dist/controllers/membership.controller');
const {StaffController}=require('./dist/controllers/staff.controller');
const {selectLoginClinic}=require('./dist/services/membership.service');
db.exec("PRAGMA foreign_keys=OFF;");
for (const id of ['multi-a', 'multi-b', 'multi-c']) {
  db.prepare("DELETE FROM clinic_invites WHERE tenant_id=?").run(id);
  db.prepare("DELETE FROM professionals WHERE tenant_id=?").run(id);
  db.prepare("DELETE FROM clinic_users WHERE tenant_id=?").run(id);
  db.prepare("DELETE FROM user_clinic_preferences WHERE tenant_id=?").run(id);
  db.prepare("DELETE FROM users WHERE tenant_id=?").run(id);
  db.prepare("DELETE FROM tenants WHERE id=?").run(id);
}
db.prepare("DELETE FROM users WHERE id='multi-user'").run();
db.prepare("DELETE FROM clinic_users WHERE user_id='multi-user'").run();
db.prepare("DELETE FROM professionals WHERE user_id='multi-user'").run();
db.prepare("DELETE FROM user_clinic_preferences WHERE user_id='multi-user'").run();
db.prepare("DELETE FROM clinic_invites WHERE id IN ('multi-invite','limit-invite')").run();
db.exec("PRAGMA foreign_keys=ON;");

for(const id of ['multi-a','multi-b','multi-c']) db.prepare("INSERT INTO tenants(id,name,slug,email,status,onboarding_status) VALUES(?,?,?,?,'active','active')").run(id,id,id,id+'@test.invalid');
db.prepare("INSERT INTO users(id,tenant_id,name,email,password_hash,role,status,onboarding_status) VALUES('multi-user','multi-a','Name','multi@test.invalid','unused','clinic_admin','active','active')").run();
db.prepare("INSERT INTO clinic_users(id,tenant_id,user_id,role,status,is_manager) VALUES('multi-link','multi-a','multi-user','clinic_admin','active',1)").run();
db.prepare("INSERT INTO professionals(id,tenant_id,user_id,name,active) VALUES('multi-pro','multi-a','multi-user','Name',1)").run();
db.prepare("INSERT INTO clinic_invites(id,tenant_id,token,role,status,expires_at,max_uses,used_count,created_by) VALUES('multi-invite','multi-b','multiclinic-test-token','professional','pending',datetime('now','+1 day'),1,0,'multi-user')").run();
require('./dist/config/multiclinic.migration').migrateMulticlinic(db);
require('./dist/config/multiclinic.migration').migrateMulticlinic(db);
assert.equal(db.prepare("SELECT COUNT(*) n FROM clinic_users WHERE user_id='multi-user'").get().n,1,'backfill idempotent');
const token=generateToken({userId:'multi-user',tenantId:'multi-a',role:'clinic_admin',email:'multi@test.invalid',name:'Name'});
function response(){return {statusCode:200,body:null,status(n){this.statusCode=n;return this},json(v){this.body=v;return this}}}
function request(tenant='multi-a'){const req={headers:{authorization:`Bearer ${token}`,'x-tenant-id':tenant},params:{},body:{},query:{}};const res=response();let next=false;authMiddleware(req,res,()=>next=true);return {req,res,next}}
assert.equal(request('multi-c').res.statusCode,403,'forged header blocked');
let {req,res}=request();req.params.token='multiclinic-test-token';MembershipController.accept(req,res);
assert.equal(res.statusCode,200,JSON.stringify(res.body));
assert.equal(db.prepare("SELECT tenant_id FROM users WHERE id='multi-user'").get().tenant_id,'multi-a');
assert.equal(db.prepare("SELECT COUNT(*) n FROM clinic_users WHERE user_id='multi-user'").get().n,2);
assert.equal(db.prepare("SELECT COUNT(*) n FROM professionals WHERE user_id='multi-user'").get().n,2);
res=response();MembershipController.accept(req,res);assert.equal(res.body.alreadyMember,true);
assert.equal(db.prepare("SELECT used_count FROM clinic_invites WHERE id='multi-invite'").get().used_count,1);
assert.equal(request('multi-b').req.user.role,'professional');
assert.equal(request('multi-a').req.user.role,'clinic_admin');
for (const [file,method] of [['physiotherapy','isPhysiotherapistOrClinicManager'],['dentistry','isDentistOrClinicManager'],['nutrition','isNutritionistOrClinicManager'],['occupational-therapy','isOccupationalTherapistOrClinicManager'],['speech-therapy','isSpeechTherapistOrClinicManager'],['psychology','hasPsychologyAccess'],['psychopedagogy','hasPsychopedagogyAccess'],['medical','isMedicalProfessionalOrClinicManager']]) {
 const gate=require('./dist/controllers/'+file+'.controller')[method];
 assert.doesNotThrow(()=>gate(request('multi-b').req),file+' clinic profession query');
}

assert.equal(request('multi-c').res.statusCode,403);
let session=request('multi-b');MembershipController.remember(session.req,response());
const user=db.prepare("SELECT * FROM users WHERE id='multi-user'").get();selectLoginClinic(user);assert.equal(user.tenant_id,'multi-b');assert.equal(user.role,'professional');
session=request('multi-b');session.req.params.id='multi-user';StaffController.toggleStatus(session.req,response());
assert.equal(db.prepare("SELECT status FROM users WHERE id='multi-user'").get().status,'active');
assert.equal(request('multi-b').res.statusCode,403);assert.equal(request('multi-a').next,true);
assert.equal(db.prepare("SELECT COUNT(*) n FROM professionals WHERE user_id='multi-user'").get().n,2);
session=request();session.req.params.token='multiclinic-test-token';res=response();MembershipController.accept(session.req,res);assert.equal(res.statusCode,403,'invite cannot bypass revoked membership');
db.prepare("INSERT INTO clinic_invites(id,tenant_id,token,role,status,expires_at,max_uses,used_count,created_by) VALUES('limit-invite','multi-c','multiclinic-limit-token','professional','pending',datetime('now','+1 day'),1,0,'multi-user')").run();
// Existing billing guard is driven by this view; exercise the no-seat transaction boundary.
db.exec("DROP VIEW billing_user_limits; CREATE VIEW billing_user_limits AS SELECT 'multi-c' AS clinic_id,0 AS max_users;");
session=request();session.req.params.token='multiclinic-limit-token';res=response();MembershipController.accept(session.req,res);assert.equal(res.statusCode,409);
assert.equal(db.prepare("SELECT COUNT(*) n FROM clinic_users WHERE tenant_id='multi-c'").get().n,0);
assert.equal(db.prepare("SELECT used_count FROM clinic_invites WHERE id='limit-invite'").get().used_count,0);
db.prepare("UPDATE clinic_invites SET expires_at=datetime('now','-1 day') WHERE id='limit-invite'").run();
res=response();MembershipController.accept(session.req,res);assert.equal(res.statusCode,409);
console.log('Multi-clinic membership: acceptance, role isolation, replay, local revocation, identity preservation and saved context passed.');
