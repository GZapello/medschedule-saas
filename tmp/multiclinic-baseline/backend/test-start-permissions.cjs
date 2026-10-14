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
// Staff approval may store the profession in clinic_users rather than the catalog.
for (const [key,name] of modules) {
  db.prepare('UPDATE professionals SET profession_id=NULL, practice_areas=NULL WHERE id=?').run('pro-'+key);
  db.prepare('UPDATE clinic_users SET profession_custom=?, permissions_json=? WHERE user_id=?').run(name,JSON.stringify(['view_schedule','access_zemda_'+key]),key);
}
let server;
(async()=>{
  server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
  const call=async(url,body,token,method=body?'POST':'GET',headers={})=>{
    const r=await fetch(`http://127.0.0.1:${server.address().port}/api${url}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...headers},body:body?JSON.stringify(body):undefined});
    return {status:r.status,data:await r.json()};
  };
  let fonoToken;
  for (const [key,name,module,route,flag] of modules) {
    const login=await call('/v1/auth/login',{email:`${key}@test.invalid`,password});
    assert.equal(login.status,200,JSON.stringify(login));
    assert.equal(login.data.user[flag],true,`${name}: profession in clinic membership must be recognized at login`);
    const token=login.data.token; if(key==='fono') fonoToken=token;
    const me=await call('/v1/auth/me',null,token);
    assert.equal(me.data.user[flag],true,`${name}: refreshed session agrees with login`);
    assert.equal(me.data.user.professionalId,'pro-'+key);
    assert.ok(me.data.user.permissions.includes('access_zemda_'+key));
    if(key!=='nutri') assert.equal(me.data.user.zemdaNutriEnabled,false,'Do not inherit manager profession');
    const start=await call('/v1/appointments/apt-'+key+'/status',{status:'in_progress',clinicalModule:module},token,'PUT');
    assert.equal(start.status,200,JSON.stringify(start));
    const opened=await call('/v1/appointments/apt-'+key+'/completion',null,token);
    assert.equal(opened.status,200,JSON.stringify(opened)); assert.equal(opened.data.moduleType,module);
    const payload=route?{appointmentId:'apt-'+key,patientId:'pat-'+key,clinicalEvolution:'Teste autorizado',saveOnly:true}:{evolution:{moduleType:module,clinicalEvolution:'Teste autorizado'},saveOnly:true};
    const saved=await call(route?`/v1/${route}/consultations/finish`:`/v1/appointments/apt-${key}/finish`,payload,token);
    assert.equal(saved.status,200,JSON.stringify(saved));
    console.log('PASS membership profession:',module,'login, me, start, open and save');
  }
  assert.equal((await call('/v1/appointments/apt-nutri/status',{status:'in_progress'},fonoToken,'PUT')).status,403,'Cannot start another professional consultation');
  db.prepare("UPDATE professionals SET active=0 WHERE id='pro-fono'").run();
  assert.equal((await call('/v1/appointments/apt-fono/status',{status:'in_progress'},fonoToken,'PUT')).status,403,'Inactive professional blocked');
  assert.equal((await call('/v1/appointments/apt-fono/completion',null,fonoToken)).status,403);
  db.prepare("UPDATE professionals SET active=1 WHERE id='pro-fono'").run();
  for (const status of ['pending','blocked','inactive','rejected']) {
    db.prepare('UPDATE clinic_users SET status=? WHERE user_id=?').run(status,'fono');
    assert.equal((await call('/v1/appointments/apt-fono/status',{status:'in_progress'},fonoToken,'PUT')).status,403,'Membership '+status+' blocked');
  }
  db.prepare("UPDATE clinic_users SET status='active' WHERE user_id='fono'").run();
  assert.equal((await call('/v1/appointments/apt-fono/status',{status:'in_progress'},fonoToken,'PUT',{'X-Tenant-ID':'another-clinic'})).status,403,'Cross-tenant header blocked');
  db.prepare("UPDATE users SET status='inactive' WHERE id='fono'").run();
  assert.equal((await call('/v1/appointments/apt-fono/status',{status:'in_progress'},fonoToken,'PUT')).status,401,'Inactive user blocked');
  db.prepare("UPDATE users SET status='active' WHERE id='fono'").run();
  db.prepare("UPDATE professionals SET user_id=NULL WHERE id='pro-fono'").run();
  assert.equal((await call('/v1/appointments/apt-fono/status',{status:'in_progress'},fonoToken,'PUT')).status,403,'Missing professional link is not guessed');
  const list=await call('/v1/appointments',null,fonoToken); assert.equal(list.status,200); assert.equal(list.data.length,0);
  db.prepare("UPDATE professionals SET user_id='fono' WHERE id='pro-fono'").run();
  const manager=await call('/v1/auth/login',{email:'manager@test.invalid',password});
  assert.equal((await call('/v1/staff/fono/role-profession',{professionName:'Fonoaudiologia',practiceAreas:'Voz'},manager.data.token,'PUT')).status,200);
  const refreshed=await call('/v1/auth/me',null,fonoToken);
  assert.equal(refreshed.data.user.zemdaFonoEnabled,true,'Manager edit takes effect without a new token');
  assert.equal(refreshed.data.user.zemdaNutriEnabled,false);
  // Recognize the profession saved by self-registration in users as well.
  db.prepare("UPDATE clinic_users SET profession_custom=NULL, practice_areas=NULL WHERE user_id='fono'").run();
  db.prepare("UPDATE professionals SET practice_areas=NULL WHERE id='pro-fono'").run();
  db.prepare("UPDATE users SET profession_name='Fonoaudiologia' WHERE id='fono'").run();
  assert.equal((await call('/v1/auth/me',null,fonoToken)).data.user.zemdaFonoEnabled,true);
  // The module is also resolved correctly before a module has been selected.
  db.prepare("UPDATE appointments SET clinical_module=NULL WHERE id='apt-fono'").run();
  assert.equal((await call('/v1/appointments/apt-fono/completion',null,fonoToken)).data.moduleType,'ZemdaFono');
  // Non-clinical roles do not gain consultation access from a complementary tool grant.
  db.prepare("INSERT INTO users (id,tenant_id,name,email,password_hash,role,status) VALUES ('reception','test-clinic','Reception','reception@test.invalid',?,'receptionist','active')").run(bcrypt.hashSync(password,4));
  db.prepare("INSERT INTO clinic_users (id,tenant_id,user_id,role,status,permissions_json) VALUES ('cu-reception','test-clinic','reception','receptionist','active','[\"access_zemda_body\"]')").run();
  const reception=await call('/v1/auth/login',{email:'reception@test.invalid',password});
  assert.equal((await call('/v1/appointments/apt-fono/status',{status:'in_progress'},reception.data.token,'PUT')).status,403);
  db.prepare("UPDATE tenants SET manager_profession=NULL, manager_practice_areas=NULL WHERE id='test-clinic'").run();
  assert.equal((await call('/v1/appointments/apt-fono/status',{status:'in_progress'},manager.data.token,'PUT')).status,403,'Administrative manager alone cannot start a clinical consultation');
  db.prepare("INSERT INTO tenants (id,slug,name,email,status) VALUES ('foreign','foreign','Foreign','foreign@test.invalid','active')").run();
  db.prepare("INSERT INTO professionals (id,tenant_id,name) VALUES ('foreign-pro','foreign','Foreign professional')").run();
  db.prepare("INSERT INTO patients (id,tenant_id,full_name,phone) VALUES ('foreign-patient','foreign','Foreign patient','11999990000')").run();
  db.prepare("INSERT INTO services (id,tenant_id,name,duration_minutes) VALUES ('foreign-service','foreign','Foreign service',50)").run();
  db.prepare("INSERT INTO appointments (id,tenant_id,appointment_number,patient_id,professional_id,service_id,start_time,end_time,status) VALUES ('foreign-apt','foreign','F-1','foreign-patient','foreign-pro','foreign-service','2026-09-16T10:00:00','2026-09-16T10:50:00','scheduled')").run();
  assert.equal((await call('/v1/appointments/foreign-apt/status',{status:'in_progress'},fonoToken,'PUT')).status,404,'Foreign appointment is not exposed');
  assert.equal((await call('/v1/appointments/foreign-apt/completion',null,fonoToken)).status,404);
  console.log('PASS active status, ownership, clinic isolation, missing link and manager updates');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server?.close());
