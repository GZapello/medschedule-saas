// Isolated integration fixture. Never opens a clinic database.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-finish-')), 'test.db');
process.env.JWT_SECRET = 'isolated-integration-test-secret-not-for-production';
const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();
const express = require('express'), jwt = require('jsonwebtoken');
const app = express(); app.use(express.json()); app.use('/api', require('./dist/routes').default);
const modules = [
  ['Med','medical/finish-consultation'], ['Odonto','dentistry/consultations/finish'],
  ['Nutri','nutrition/consultations/finish'], ['TO','occupational-therapy/consultations/finish'],
  ['Fono','speech-therapy/consultations/finish'], ['Psico','psychology/consultations/finish'],
  ['PP','psychopedagogy/consultations/finish'], ['Fisio','physiotherapy/consultations/finish'],
  ['Estetic'], ['Personal'], ['general']
];
db.prepare("INSERT INTO tenants (id,slug,name,email,status,onboarding_completed,manager_profession) VALUES ('clinic','finish-test','Teste','clinic@example.invalid','active',1,'Medicina')").run();
db.prepare("INSERT INTO users (id,tenant_id,name,email,password_hash,role,status) VALUES ('user','clinic','Teste','test@example.invalid','unused','clinic_admin','active')").run();
db.prepare("INSERT INTO clinic_users (id,tenant_id,user_id,role,status) VALUES ('membership','clinic','user','clinic_admin','active')").run();
db.prepare("INSERT INTO professionals (id,tenant_id,user_id,name) VALUES ('professional','clinic','user','Teste')").run();
db.prepare("INSERT INTO patients (id,tenant_id,full_name,phone) VALUES ('patient','clinic','Paciente teste','11999990000')").run();
db.prepare("INSERT INTO services (id,tenant_id,name,duration_minutes,price) VALUES ('service','clinic','Consulta',50,0)").run();
const token = jwt.sign({userId:'user',tenantId:'clinic',role:'clinic_admin',name:'Teste'}, process.env.JWT_SECRET);
let server;
(async () => {
  server = app.listen(0,'127.0.0.1'); await new Promise(r => server.once('listening',r));
  const call = async (url, body, method='POST') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/${url}`, {method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    return {status:response.status, data:await response.json()};
  };
  for (const [key, route] of modules) {
    const professions={Med:'Medicina',Odonto:'Odontologia',Nutri:'Nutrição',TO:'Terapia Ocupacional',Fono:'Fonoaudiologia',Psico:'Psicologia',PP:'Psicopedagogia',Fisio:'Fisioterapia',Estetic:'Estética',Personal:'Educação Física',general:'Medicina'};
    db.prepare('UPDATE tenants SET manager_profession=? WHERE id=?').run(professions[key],'clinic');
    db.prepare('UPDATE professionals SET practice_areas=? WHERE id=?').run(professions[key],'professional');
    const moduleType = key === 'general' ? key : 'Zemda'+key;
    db.prepare("INSERT INTO appointments (id,tenant_id,appointment_number,patient_id,professional_id,service_id,start_time,end_time,status,modality,clinical_module) VALUES (?,'clinic',?,'patient','professional','service',datetime('now'),datetime('now','+50 minutes'),'in_progress','presential',?)").run(key,key,moduleType);
    const blocked = await call(`appointments/${key}/status`,{status:'completed'},'PUT');
    assert.equal(blocked.status,409,JSON.stringify(blocked));
    const evolution = {patientId:'patient',professionalId:'professional',appointmentId:key,moduleType,clinicalEvolution:'Evolução '+key,technicalNotes:'Notas '+key,moduleData:{observations:'Dados '+key},assessmentData:{notes:'Avaliação '+key},sessionData:{activities_developed:'Atividades '+key}};
    const endpoint = route || `appointments/${key}/finish`;
    const body = route ? evolution : {evolution};
    const result = await call(endpoint,body);
    assert.ok(result.status===200 || result.status===201,key+': '+JSON.stringify(result));
    assert.equal(db.prepare('SELECT status FROM appointments WHERE id=?').get(key).status,'completed',key);
    const records = db.prepare('SELECT * FROM records WHERE appointment_id=?').all(key);
    assert.ok(records.some(r => r.clinical_evolution?.includes('Evolução '+key)),key+' clinical record retained');
    const repeated = await call(endpoint,body);
    assert.ok(repeated.status===409 || repeated.data.alreadyCompleted,key+' repeated finish rejected: '+JSON.stringify(repeated));
    assert.equal(db.prepare('SELECT count(*) n FROM records WHERE appointment_id=?').get(key).n,records.length,key+' no duplicate records');
    const reopened = await call(`appointments/${key}/completion`,null,'GET');
    assert.equal(reopened.data.alreadyCompleted,true,key+' reopen');
    console.log('PASS',moduleType,'record persistence, completed, direct-status guard, duplicate and reopen');
  }
  const body={patientId:'patient',moduleType:'ZemdaEstetic',walkIn:true};
  const started=await call('clinical/consultations/start',body);
  assert.equal(started.status,201,JSON.stringify(started));
  assert.equal(started.data.appointment.professional_id,'professional');
  const resumed=await call('clinical/consultations/start',body);
  assert.equal(resumed.data.appointmentId,started.data.appointmentId);
  assert.equal(resumed.data.created,false);
  const finished=await call(`appointments/${started.data.appointmentId}/finish`,{evolution:{moduleType:'ZemdaEstetic',clinicalEvolution:'Sem horário marcado',moduleData:{assessmentForm:{observations:'Dados preservados'}}}});
  assert.equal(finished.status,200,JSON.stringify(finished));
  const saved=db.prepare('SELECT * FROM records WHERE appointment_id=?').get(started.data.appointmentId);
  assert.equal(saved.clinical_evolution,'Sem horário marcado');
  assert.ok(saved.module_data_json.includes('Dados preservados'));
  console.log('PASS walk-in creation, authenticated professional, reuse and clinical persistence');
})().catch(error => {console.error(error); process.exitCode=1;}).finally(()=>server?.close());
