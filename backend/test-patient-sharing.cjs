const assert=require('node:assert/strict');
const {initializeDatabase,db}=require('./dist/config/database');initializeDatabase();
const {PatientSharingController:C}=require('./dist/controllers/patient-sharing.controller');
const {canAccessPatient,sharedOrigins,SHARE_CONSENT_VERSION}=require('./dist/services/patient-sharing.service');
const {SHARED_CLINICAL_CATALOG}=require('./dist/services/shared-clinical-catalog');
for(const entry of SHARED_CLINICAL_CATALOG) db.prepare(`SELECT ${entry.columns.join(',')} FROM ${entry.table} WHERE patient_id=? AND tenant_id=?`).all('missing','missing');
const {SharedHistoryController,projectClinicalValue}=require('./dist/controllers/shared-history.controller');
assert.deepEqual(projectClinicalValue({clinical:'preserved',privateNotes:'secret',payment:50,details:{url:'secret',symptom:'pain'}}),{clinical:'preserved',details:{symptom:'pain'}});
const {ClinicalController}=require('./dist/controllers/clinical.controller');
function res(){return {statusCode:200,status(n){this.statusCode=n;return this},json(x){this.body=x;return this},setHeader(){return this}}}
db.exec("PRAGMA foreign_keys=OFF;");
for (const id of ['share-a', 'share-b', 'share-c']) {
  db.prepare("DELETE FROM clinic_data_shares WHERE source_tenant_id=? OR target_tenant_id=?").run(id, id);
  db.prepare("DELETE FROM patients WHERE tenant_id=?").run(id);
  db.prepare("DELETE FROM records WHERE tenant_id=?").run(id);
  db.prepare("DELETE FROM file_attachments WHERE clinic_id=?").run(id);
  db.prepare("DELETE FROM clinic_patient_contexts WHERE tenant_id=? OR source_tenant_id=?").run(id, id);
  db.prepare("DELETE FROM professionals WHERE tenant_id=?").run(id);
  db.prepare("DELETE FROM clinic_users WHERE tenant_id=?").run(id);
  db.prepare("DELETE FROM users WHERE tenant_id=?").run(id);
  db.prepare("DELETE FROM tenants WHERE id=?").run(id);
}
for (const id of ['share-p1', 'share-p2']) {
  db.prepare("DELETE FROM shared_patient_links WHERE patient_id=?").run(id);
  db.prepare("DELETE FROM clinic_patient_contexts WHERE patient_id=?").run(id);
  db.prepare("DELETE FROM patients WHERE id=?").run(id);
  db.prepare("DELETE FROM records WHERE patient_id=?").run(id);
  db.prepare("DELETE FROM file_attachments WHERE patient_id=?").run(id);
  db.prepare("DELETE FROM fono_anamnesis WHERE patient_id=?").run(id);
  db.prepare("DELETE FROM nutrition_anamnesis WHERE patient_id=?").run(id);
}
for (const id of ['share-owner', 'share-employee']) {
  db.prepare("DELETE FROM clinic_users WHERE user_id=?").run(id);
  db.prepare("DELETE FROM professionals WHERE user_id=?").run(id);
  db.prepare("DELETE FROM users WHERE id=?").run(id);
}
db.exec("PRAGMA foreign_keys=ON;");
for(const id of ['share-a','share-b','share-c']) db.prepare("INSERT INTO tenants(id,name,slug,email,status,onboarding_status) VALUES(?,?,?,?,'active','active')").run(id,id,id,id+'@test.invalid');
for(const [id,role] of [['share-owner','clinic_admin'],['share-employee','professional']]) {
 db.prepare("INSERT INTO users(id,tenant_id,name,email,password_hash,role,status,onboarding_status) VALUES(?,'share-a',?,?, 'unused',?,'active','active')").run(id,id,id+'@test.invalid',role);
 for(const tenant of ['share-a','share-b']){
  db.prepare("INSERT INTO clinic_users(id,tenant_id,user_id,role,status,is_manager) VALUES(?,?,?,?,'active',?)").run(id+tenant,tenant,id,tenant==='share-b'?'professional':role,tenant==='share-a'&&role==='clinic_admin'?1:0);
  db.prepare("INSERT INTO professionals(id,tenant_id,user_id,name,active) VALUES(?,?,?,?,1)").run(id+tenant,tenant,id,id);
 }
}
for(const id of ['share-p1','share-p2'])db.prepare("INSERT INTO patients(id,tenant_id,full_name,phone,active) VALUES(?,'share-a',?,'11999999999',1)").run(id,id);
const req={user:{userId:'share-owner',role:'professional'},tenantId:'share-b',headers:{},params:{},body:{sourceTenantId:'share-a',targetTenantId:'share-b',patientIds:['share-p1'],scopes:['patient','records','appointments'],consentVersion:SHARE_CONSENT_VERSION,confirmed:true}};
let r=res();C.create({...req,user:{userId:'share-employee',role:'professional'}},r);assert.equal(r.statusCode,403,'employee cannot share clinic patients');
r=res();C.create({...req,body:{...req.body,confirmed:false}},r);assert.equal(r.statusCode,400);
r=res();C.create({...req,body:{...req.body,scopes:['patient','financial']}},r);assert.equal(r.statusCode,400);
r=res();C.create({...req,body:{...req.body,patientIds:['foreign-patient']}},r);assert.equal(r.statusCode,403);
r=res();C.create(req,r);assert.equal(r.statusCode,201,JSON.stringify(r.body));const share=r.body.id;
assert.equal(canAccessPatient('share-owner','share-b','share-p1'),true);
for (const table of ['fono_anamnesis','nutrition_anamnesis']) {
 for (const tenant of ['share-a','share-b']) db.prepare(`INSERT INTO ${table}(id,tenant_id,patient_id,data_json) VALUES(?,?,'share-p1','{}')`).run(table+tenant,tenant);
 assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE patient_id='share-p1'`).get().n,2,'anamnesis per clinic');
}
r=res();SharedHistoryController.list({...req,params:{patientId:'share-p1'}},r);assert.equal(r.statusCode,200,JSON.stringify(r.body));assert.equal(r.body.history.length,0,'module data needs explicit module scope');
assert.equal(canAccessPatient('share-owner','share-b','share-p2'),false);
assert.equal(canAccessPatient('share-owner','share-c','share-p1'),false);
assert.deepEqual(sharedOrigins('share-owner','share-a','share-p1','records'),['share-b']);
assert.deepEqual(sharedOrigins('share-owner','share-b','share-p1','documents'),[]);
assert.equal(db.prepare("SELECT COUNT(*) n FROM patients WHERE id LIKE 'share-p%'").get().n,2,'no copied patients');
for(const tenant of ['share-a','share-b'])db.prepare(`INSERT INTO records(id,tenant_id,patient_id,professional_id,session_date,title,clinical_evolution,private_notes,module_type) VALUES(?,?,'share-p1',?,'2026-10-14',?,'Clinical','SECRET','general')`).run('record-'+tenant,tenant,'share-owner'+tenant,tenant);
r=res();ClinicalController.listByPatient({...req,params:{patientId:'share-p1'}},r);assert.equal(r.statusCode,200);assert.equal(r.body.length,2);assert.equal(r.body.find(x=>x.tenant_id==='share-a').private_notes,undefined);
r=res();C.revoke({...req,user:{userId:'share-employee'},params:{id:share}},r);assert.equal(r.statusCode,403);
r=res();C.revoke({...req,params:{id:share}},r);assert.equal(r.statusCode,200);
assert.equal(canAccessPatient('share-owner','share-b','share-p1'),false);
const {PatientController}=require('./dist/controllers/patient.controller');
r=res();PatientController.getById({...req,params:{id:'share-p1'}},r);assert.equal(r.statusCode,200);assert.equal(r.body.patient.retained,true);
db.prepare("UPDATE patients SET full_name='CHANGED IN SOURCE' WHERE id='share-p1'").run();
r=res();PatientController.getById({...req,params:{id:'share-p1'}},r);assert.equal(r.body.patient.full_name,'share-p1','retained identity does not read new source information');
r=res();ClinicalController.listByPatient({...req,params:{patientId:'share-p1'}},r);assert.equal(r.statusCode,200);assert.equal(r.body.length,1);assert.equal(r.body[0].tenant_id,'share-b');

assert.equal(db.prepare("SELECT COUNT(*) n FROM records WHERE patient_id='share-p1'").get().n,2);
assert.equal(db.prepare("SELECT tenant_id FROM patients WHERE id='share-p1'").get().tenant_id,'share-a');
assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE entity_id=? AND action IN ('SHARE_PATIENTS','REVOKE_SHARE')").get(share).n,2);
console.log('Patient sharing: authority, explicit consent, allowlist, IDOR, isolation, bidirectional origins, projection and revocation passed.');
const {r2StorageService}=require('./dist/services/r2-storage.service');
(async()=>{
  db.prepare("UPDATE professionals SET profession_id='prof-fonoaudiologo' WHERE user_id='share-owner' AND tenant_id='share-b'").run();
  const more={...req,body:{...req.body,scopes:['patient','records','module:ZemdaFono','files']}};
  let result=res();C.create(more,result);assert.equal(result.statusCode,201);const extendedShare=result.body.id;
  result=res();SharedHistoryController.list({...req,params:{patientId:'share-p1'}},result);
  assert.equal(result.statusCode,200,JSON.stringify(result.body));assert.ok(result.body.history.some(x=>x.type==='fono_anamnesis'));
  assert.equal(result.body.history.some(x=>x.type==='nutrition_anamnesis'),false,'another profession remains hidden');
  const objectKey='clinics/share-a/patients/share-p1/exams/mock.pdf';
  process.env.R2_MOCK_STORAGE='true';
  await r2StorageService.uploadFile(objectKey,Buffer.from('clinical file'),'application/pdf');
  db.prepare("INSERT INTO file_attachments(id,clinic_id,patient_id,uploaded_by,object_key,original_filename,mime_type,file_size,module_type) VALUES('shared-file','share-a','share-p1','share-owner',?,'exam.pdf','application/pdf',13,'ZemdaFono')").run(objectKey);
  result=res();await SharedHistoryController.file({...req,params:{id:'shared-file'}},result);assert.equal(result.statusCode,200);assert.equal(Buffer.from(result.body.base64,'base64').toString(),'clinical file');
  result=res();await SharedHistoryController.file({...req,user:{userId:'share-owner',role:'receptionist'},params:{id:'shared-file'}},result);assert.equal(result.statusCode,403);
  result=res();SharedHistoryController.list({...req,params:{patientId:'share-p1'}},result);assert.equal(result.body.files.length,1);assert.equal(result.body.files[0].object_key,undefined);
  const originalRead=r2StorageService.getObjectBuffer;
  r2StorageService.getObjectBuffer=async()=>{C.revoke({...req,params:{id:extendedShare}},res());return Buffer.from('revoked during I/O')};
  result=res();await SharedHistoryController.file({...req,params:{id:'shared-file'}},result);assert.equal(result.statusCode,403,'revocation while fetching prevents delivery');
  r2StorageService.getObjectBuffer=originalRead;
  result=res();await SharedHistoryController.file({...req,params:{id:'shared-file'}},result);assert.equal(result.statusCode,403,'no cached signed URL bypass');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM file_attachments WHERE id='shared-file'").get().n,1,'revocation preserves original file');
  console.log('PASS module scopes, profession isolation, retained identity, authenticated file delivery and immediate revocation.');
})().catch(error=>{console.error(error);process.exitCode=1});
