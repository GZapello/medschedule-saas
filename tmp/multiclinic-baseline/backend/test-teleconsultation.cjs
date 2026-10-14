const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-teleconsulta-db-')), 'test.db');
const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();
const { AppointmentController: controller } = require('./dist/controllers/appointment.controller');
const { NotificationService } = require('./dist/services/notification.service');
NotificationService.scheduleAppointmentReminder = () => {};

async function call(method, body = {}, id, tenantId = 'tele-test') {
  let status = 200, data;
  const req = { path: '/v1/appointments', tenantId, params: { id }, query: {}, body, headers: {}, user: { userId: 'tele-user', role: 'clinic_admin', name: 'Profissional' } };
  const res = { status(code) { status = code; return this; }, json(value) { data = value; return this; } };
  await controller[method](req, res);
  return { status, data };
}

(async () => {
  assert.ok(db.prepare('PRAGMA table_info(appointments)').all().some(column => column.name === 'meeting_url' && column.type === 'TEXT' && !column.notnull));
  db.prepare("INSERT INTO tenants(id,name,slug,email,status) VALUES('tele-test','Teste','tele-test','tele@test.local','active')").run();
  db.prepare("INSERT INTO users(id,tenant_id,email,password_hash,role,name) VALUES('tele-user','tele-test','user@tele.test','test','clinic_admin','Profissional')").run();
  db.prepare("INSERT INTO professionals(id,user_id,tenant_id,name,active) VALUES('tele-pro','tele-user','tele-test','Profissional',1)").run();
  db.prepare("INSERT INTO patients(id,tenant_id,full_name,phone) VALUES('tele-patient','tele-test','Paciente','11999999999')").run();
  db.prepare("INSERT INTO services(id,tenant_id,name,duration_minutes,price) VALUES('tele-service','tele-test','Consulta',50,0)").run();
  for (let day = 0; day < 7; day++) db.prepare("INSERT INTO schedules(id,tenant_id,professional_id,day_of_week,start_time,end_time,is_active) VALUES(?,'tele-test','tele-pro',?,'08:00','18:00',1)").run('tele-shift-' + day, day);
  const base = { patientId: 'tele-patient', professionalId: 'tele-pro', serviceId: 'tele-service', startTime: '2026-11-10T10:00:00', endTime: '2026-11-10T10:50:00', modality: 'online' };
  const created = await call('create', { ...base, meeting_url: ' https://meet.google.com/abc-defg-hij ' });
  assert.equal(created.status, 201, JSON.stringify(created));
  const id = created.data.id;
  const row = () => db.prepare('SELECT * FROM appointments WHERE id=?').get(id);
  assert.equal(row().meeting_url, 'https://meet.google.com/abc-defg-hij');
  const listed = await call('list');
  assert.equal(listed.status, 200);
  assert.ok(JSON.stringify(listed.data).includes('https://meet.google.com/abc-defg-hij'));
  assert.equal((await call('update', { meeting_url: 'https://meet.google.com/edited-link' }, id)).status, 200);
  assert.equal(row().meeting_url, 'https://meet.google.com/edited-link');
  assert.equal((await call('update', { modality: 'presential' }, id)).status, 200);
  assert.equal(row().modality, 'presential');
  assert.equal(row().meeting_url, 'https://meet.google.com/edited-link', 'changing modality preserves the inactive link');
  assert.equal((await call('update', { modality: 'online', meeting_url: null }, id)).status, 200);
  assert.equal(row().meeting_url, null);
  assert.equal((await call('update', { meeting_url: 'https://meet.google.com/restored-link' }, id)).status, 200);
  assert.equal((await call('update', { meeting_url: 'javascript:alert(1)' }, id)).status, 400);
  assert.equal(row().meeting_url, 'https://meet.google.com/restored-link');
  assert.equal((await call('update', { meeting_url: 'https://meet.google.com/wrong-clinic' }, id, 'other-clinic')).status, 404);
  assert.equal(row().meeting_url, 'https://meet.google.com/restored-link');
  const next = { ...base, startTime: '2026-11-10T11:00:00', endTime: '2026-11-10T11:50:00' };
  assert.equal((await call('create', { ...next, meeting_url: 'javascript:alert(1)' })).status, 400);
  const noLink = await call('create', next);
  assert.equal(noLink.status, 201, JSON.stringify(noLink));
  assert.equal(db.prepare('SELECT meeting_url FROM appointments WHERE id=?').get(noLink.data.id).meeting_url, null);
  const { AIController } = require('./dist/controllers/ai.controller');
  const { GeminiService } = require('./dist/services/gemini.service');
  const { TELECONSULTATION_SECTIONS, teleconsultationPrompt } = require('./dist/utils/teleconsultation-ai');
  db.prepare("UPDATE professionals SET profession_name='Psicologia' WHERE id='tele-pro'").run();
  const aiCall = async (body={},tenantId='tele-test',role='clinic_admin') => {
    let status=200,data;
    await AIController.organizeEvolution({tenantId,user:{userId:'tele-user',role},body:{teleconsultation:true,transcript:'Paciente relata melhora.',appointmentId:id,patientId:'tele-patient',professionalId:'tele-pro',...body}},
      {status(code){status=code;return this},json(value){data=value;return this}});
    return {status,data};
  };
  db.prepare("UPDATE tenants SET manager_profession='Psicologia' WHERE id='tele-test'").run();
  let captured;
  GeminiService.isAvailable=()=>true;
  GeminiService.organizeClinicalEvolution=async params=>{captured=params;return {organizedText:'**Resumo**\nPaciente relata melhora.',mode:'organize'}};
  for (const module of Object.keys(TELECONSULTATION_SECTIONS)) {
    db.prepare('UPDATE appointments SET clinical_module=? WHERE id=?').run(module,id);
    if(module==='general') db.prepare("UPDATE professionals SET profession_name='Área desconhecida',zemda_psico_enabled=0 WHERE id='tele-pro'").run();
    const result=await aiCall({clinical_module:'ZemdaMed'});
    assert.equal(result.status,200,JSON.stringify(result));
    assert.equal(captured.teleconsultationModule,module);
    assert.equal(result.data.originalTranscript,undefined);
    assert.match(teleconsultationPrompt(module),/Não invente/);
    assert.ok(TELECONSULTATION_SECTIONS[module].every(field=>teleconsultationPrompt(module).includes(field)));
  }
  assert.equal((await aiCall({},'other-tenant')).status,403);
  assert.equal((await aiCall({},'tele-test','receptionist')).status,403);
  assert.equal((await aiCall({patientId:'other-patient'})).status,400);
  assert.equal((await aiCall({professionalId:'other-pro'})).status,400);
  db.prepare("UPDATE appointments SET modality='presential' WHERE id=?").run(id);
  assert.equal((await aiCall()).status,400);
  db.prepare("UPDATE appointments SET modality='online' WHERE id=?").run(id);
  GeminiService.isAvailable=()=>false;
  assert.equal((await aiCall()).status,503);
  console.log('PASS AI professions, trusted appointment context, access controls and safe unavailable response');
  console.log('PASS nullable schema, create/list/update, absent link, modality transitions, URL validation and tenant isolation');
})().catch(error => { console.error(error); process.exitCode = 1; });
