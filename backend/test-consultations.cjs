// Integration tests use a new temporary database; never the clinic database.
const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-consultations-'));
process.env.DATABASE_PATH = path.join(temp, 'test.db');
process.env.CLINIC_UPLOAD_ROOT = path.join(temp, 'uploads');
const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase(); initializeDatabase();
const bcrypt = require('bcryptjs'); const express = require('express');
const app = express(); app.use(express.json({limit:'50mb'})); app.use('/api', require('./dist/routes').default);
const password = 'Local-Test-Only-2026';
const modules = [
  ['fono','Fonoaudiologia','ZemdaFono','speech-therapy','zemdaFonoEnabled'],
  ['odonto','Odontologia','ZemdaOdonto','dentistry','zemdaOdontoEnabled'],
  ['fisio','Fisioterapia','ZemdaFisio',null,'zemdaFisioEnabled'],
  ['nutri','Nutrição','ZemdaNutri','nutrition','zemdaNutriEnabled'],
  ['to','Terapia Ocupacional','ZemdaTO','occupational-therapy','zemdaToEnabled']
];
db.prepare("INSERT INTO tenants (id,slug,name,email,status,onboarding_completed,manager_profession) VALUES ('test-clinic','test-clinic','Clínica de teste','clinic@test.invalid','active',1,'Nutrição')").run();
for (const [key,name] of modules) {
  db.prepare("INSERT INTO users (id,tenant_id,name,email,password_hash,role,status) VALUES (?,'test-clinic',?,?,?,'professional','active')").run(key, name,`${key}@test.invalid`,bcrypt.hashSync(password,4));
  db.prepare("INSERT INTO clinic_users (id,tenant_id,user_id,role,status) VALUES (?,'test-clinic',?,'professional','active')").run('cu-'+key,key);
  const profession = db.prepare('SELECT id FROM professions WHERE lower(name) LIKE ? OR lower(slug) LIKE ? LIMIT 1').get('%'+(key==='to'?'ocupacional':key)+'%','%'+(key==='to'?'ocupacional':key)+'%');
  db.prepare(`INSERT INTO professionals (id,tenant_id,user_id,name,profession_id,practice_areas,zemda_${key}_enabled) VALUES (?,'test-clinic',?,?,?,?,1)`)
    .run('pro-'+key,key,name,profession?.id || null,name);
  db.prepare("INSERT INTO patients (id,tenant_id,full_name,phone) VALUES (?,'test-clinic',?,'11999990000')").run('pat-'+key,'Paciente teste '+key);
  db.prepare("INSERT INTO services (id,tenant_id,name,duration_minutes,price) VALUES (?,'test-clinic',?,50,150)").run('svc-'+key,'Consulta '+name);
  db.prepare("INSERT INTO appointments (id,tenant_id,appointment_number,patient_id,professional_id,service_id,start_time,end_time,status,modality) VALUES (?,'test-clinic',?,?,?,?,?,?,'scheduled','presential')")
    .run('apt-'+key,'TEST-'+key,'pat-'+key,'pro-'+key,'svc-'+key,new Date().toISOString().slice(0,10)+'T10:00:00',new Date().toISOString().slice(0,10)+'T10:50:00');
  db.prepare("INSERT INTO payments (id,tenant_id,appointment_id,patient_id,amount,payment_method,status) VALUES (?,'test-clinic',?,?,150,'pix','pending')").run('pay-'+key,'apt-'+key,'pat-'+key);
}
db.prepare("INSERT INTO users (id,tenant_id,name,email,password_hash,role,status) VALUES ('manager','test-clinic','Gestor Teste','manager@test.invalid',?,'clinic_admin','active')").run(bcrypt.hashSync(password,4));
db.prepare("INSERT INTO clinic_users (id,tenant_id,user_id,role,status) VALUES ('cu-manager','test-clinic','manager','clinic_admin','active')").run();
// Body access now requires an explicit manager grant in the current application.
db.prepare("UPDATE clinic_users SET permissions_json='[\"access_zemda_body\"]' WHERE tenant_id='test-clinic' AND role='professional'").run();
let server;
(async()=>{
  if (process.argv.includes('--serve')) {
    const frontend = process.env.CLINICAL_FRONTEND_DIST;
    if(frontend) { app.use(express.static(frontend)); app.get('*',(_,res)=>res.sendFile(path.join(frontend,'index.html'))); }
    server=app.listen(4175,'127.0.0.1',()=>console.log('LOCAL TEST UI: http://127.0.0.1:4175 — test accounts fono/odonto/fisio/nutri/to@test.invalid; password '+password));
    return;
  }
  server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
  const call=async(url,body,token,method=body?'POST':'GET')=>{
    const r=await fetch(`http://127.0.0.1:${server.address().port}/api${url}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});
    return {status:r.status,data:await r.json()};
  };
  for (const [key,name,module,route,flag] of modules) {
    const login=await call('/v1/auth/login',{email:`${key}@test.invalid`,password}); assert.equal(login.status,200,JSON.stringify(login));
    assert.equal(login.data.user[flag],true,`${name} module access`);
    if(key!=='nutri') assert.equal(login.data.user.zemdaNutriEnabled,false,'Professional must not inherit manager area');
    const token=login.data.token;
    assert.equal((await call('/v1/appointments',null,token)).status,200);
    assert.equal((await call('/v1/appointments/apt-'+key+'/status',{status:'in_progress'},token,'PUT')).status,200);
    // Existing Body assignments recover the responsible professional's main module.
    if (key === 'fono') db.prepare("UPDATE appointments SET clinical_module='ZemdaBody' WHERE id=?").run('apt-'+key);
    else assert.equal((await call('/v1/appointments/apt-'+key+'/status',{status:'in_progress',clinicalModule:module},token,'PUT')).status,200);
    const state=await call('/v1/appointments/apt-'+key+'/completion',null,token);
    assert.equal(state.data.moduleType,module);
    const bodyNotes=JSON.stringify({selectedRegions:['cabeca'],drawings:[{tool:'pen',points:[{x:1,y:2}]}],clinicalNotes:'Complemento'});
    const bodyMap=await call('/v1/body-assessments',{patientId:'pat-'+key,appointmentId:'apt-'+key,professionalId:'pro-'+key,module,bodyModel:'female',notes:bodyNotes},token);
    assert.equal(bodyMap.status,200,JSON.stringify(bodyMap));
    const bodyReload=await call('/v1/body-assessments/appointment/apt-'+key,null,token);
    assert.equal(bodyReload.data.assessment.notes,bodyNotes);
    assert.equal((await call('/v1/appointments/apt-'+key+'/status',{status:'in_progress',clinicalModule:'ZemdaBody'},token,'PUT')).status,200);
    assert.equal(db.prepare('SELECT clinical_module FROM appointments WHERE id=?').get('apt-'+key).clinical_module,module);
    assert.equal((await call('/v1/appointments/apt-'+key+'/status',{status:'in_progress',clinicalModule:module==='ZemdaFono'?'ZemdaNutri':'ZemdaFono'},token,'PUT')).status,409);
    // Exercise recovery at save time as well, without requiring a restart from the agenda.
    if (key === 'fono') db.prepare("UPDATE appointments SET clinical_module='ZemdaBody' WHERE id=?").run('apt-'+key);
    const moduleData={anamnesisData:{complaint:'Anamnese '+key},assessmentData:{notes:'Avaliação '+key},proceduresPerformed:'Procedimento '+key,notes:'Observação '+key,adlData:{level:0},audioData:'data:audio/webm;base64,VEVTVA=='};
    const evolution={clinicalEvolution:'Evolução '+key,technicalNotes:'Técnica '+key,conducts:'Conduta '+key,moduleType:module,moduleData,...moduleData};
    const endpoint=route?`/v1/${route}/consultations/finish`:`/v1/appointments/apt-${key}/finish`;
    const body=route?{...evolution,patientId:'pat-'+key,appointmentId:'apt-'+key,saveOnly:true}:{evolution,saveOnly:true};
    db.prepare("INSERT INTO documents (id,tenant_id,patient_id,title,file_url) VALUES (?,'test-clinic',?,'Anexo teste','data:text/plain;base64,VEVTVA==')").run('doc-'+key,'pat-'+key);
    (route ? body : body.evolution).attachmentIds = ['doc-'+key];
    assert.equal((await call('/v1/appointments/apt-'+key+'/status',{status:'completed'},token,'PUT')).status,409);
    const save=await call(endpoint,body,token); assert.equal(save.status,200,JSON.stringify(save));
    assert.ok(save.data.generatedDocs.recordId);
    assert.equal(db.prepare('SELECT clinical_module FROM appointments WHERE id=?').get('apt-'+key).clinical_module,module);
    assert.equal(db.prepare('SELECT status FROM appointments WHERE id=?').get('apt-'+key).status,'in_progress');
    const resume=await call('/v1/appointments/apt-'+key+'/completion',null,token);assert.equal(resume.data.awaitingPayment,true);
    const retry=await call(endpoint,body,token); assert.equal(retry.data.generatedDocs.recordId,save.data.generatedDocs.recordId);
    const bad=await call(`/v1/appointments/apt-${key}/finish`,{payment:{amount:-1,paymentMethod:'cash',status:'paid'}},token);assert.equal(bad.status,400);
    assert.equal(db.prepare('SELECT status FROM appointments WHERE id=?').get('apt-'+key).status,'in_progress');
    const payment={amount:key==='to'?0:150,paymentMethod:key==='to'?'other':'cash',status:key==='to'?'exempt':key==='nutri'?'pending':'paid',notes:'Teste interno'};
    const finish=await call(`/v1/appointments/apt-${key}/finish`,{payment},token);assert.equal(finish.status,200,JSON.stringify(finish));
    const repeated=await call(`/v1/appointments/apt-${key}/finish`,{payment},token);assert.equal(repeated.data.alreadyCompleted,true);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM payments WHERE appointment_id=?').get('apt-'+key).n,1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM records WHERE appointment_id=?').get('apt-'+key).n,1);
    assert.equal(db.prepare('SELECT status FROM payments WHERE appointment_id=?').get('apt-'+key).status,payment.status);
    const records=await call('/v1/clinical-records/patient/pat-'+key,null,token);assert.equal(records.status,200,JSON.stringify(records));
    const record=records.data.find(r=>r.appointment_id==='apt-'+key);assert.ok(record,'Record visible after reopen');
    assert.equal(record.clinical_evolution,'Evolução '+key);assert.equal(record.technical_notes,'Técnica '+key);
    assert.equal(record.attachments.length,1);assert.equal(record.attachments[0].title,'Anexo teste');
    assert.ok(record.module_data_json.includes('Anamnese '+key));assert.ok(record.module_data_json.includes('Avaliação '+key));
    const forbidden=await call(`/v1/appointments/apt-${key==='fono'?'nutri':'fono'}/finish`,{saveOnly:true,evolution},token);assert.equal(forbidden.status,403);
    console.log('PASS',module,'login, agenda, save, receipt, reopen, retry and access control');
  }
  const manager=await call('/v1/auth/login',{email:'manager@test.invalid',password});
  assert.equal(manager.data.user.zemdaNutriEnabled,true,'Manager professional area enables only its module');
  const managerToken=manager.data.token;
  assert.equal((await call('/v1/auth/me',null,managerToken)).data.user.zemdaNutriEnabled,true);
  const finances=await call('/v1/payments',null,managerToken);
  assert.equal(finances.data.totalRecords,5);assert.equal(finances.data.totalPaid,450);assert.equal(finances.data.totalPending,150);
  assert.ok(finances.data.payments.every(p=>p.patient_name&&p.professional_name&&p.service_name));
  const metrics=await call('/v1/dashboard/metrics',null,managerToken);
  assert.equal(metrics.data.monthly.completed,5);assert.equal(metrics.data.monthly.revenue,450);
  const report=await call('/v1/reports/financial',null,managerToken);
  assert.equal(report.data.byStatus.find(s=>s.status==='exempt').count,1);
  // The general consultation uses the same save/payment/completion workflow.
  db.prepare("INSERT INTO appointments (id,tenant_id,appointment_number,patient_id,professional_id,service_id,start_time,end_time,status,modality,clinical_module) SELECT 'apt-general',tenant_id,'TEST-GENERAL',patient_id,professional_id,service_id,start_time,end_time,'in_progress',modality,'general' FROM appointments WHERE id='apt-nutri'").run();
  const generalSave=await call('/v1/appointments/apt-general/finish',{saveOnly:true,evolution:{moduleType:'general',clinicalEvolution:'Evolução geral'}},managerToken);
  assert.equal(generalSave.status,200,JSON.stringify(generalSave));
  const generalFinish=await call('/v1/appointments/apt-general/finish',{payment:{amount:0,paymentMethod:'other',status:'exempt'}},managerToken);
  assert.equal(generalFinish.status,200,JSON.stringify(generalFinish));
  assert.equal(db.prepare("SELECT status FROM appointments WHERE id='apt-general'").get().status,'completed');
  assert.equal(db.prepare("SELECT clinical_evolution FROM records WHERE appointment_id='apt-general'").get().clinical_evolution,'Evolução geral');
  console.log('PASS general consultation save and completion; complementary Body round trips and legacy recovery');
  db.prepare("UPDATE tenants SET manager_profession=NULL, manager_practice_areas=NULL WHERE id='test-clinic'").run();
  const adminOnly=await call('/v1/auth/login',{email:'manager@test.invalid',password});
  for(const [,,,,flag] of modules)assert.equal(adminOnly.data.user[flag],false,'Manager role alone must not grant clinical access');
  assert.equal((await call('/v1/appointments/apt-to/completion',null,adminOnly.data.token)).status,403);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  console.log('PASS consultation integration suite');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{if(server&&!process.argv.includes('--serve'))server.close();});
