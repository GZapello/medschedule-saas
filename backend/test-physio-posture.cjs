const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'physio-posture-')), 'test.db');
process.env.R2_MOCK_STORAGE = 'true';

const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();

const { PersonalController: p } = require('./dist/controllers/personal.controller');
const { PersonalPostureAIController: ai } = require('./dist/controllers/personal-posture-ai.controller');

let checks = 0;
function check(value, label) {
  assert.ok(value, label);
  checks++;
  console.log('PASS', label);
}

async function call(controller, method, body = {}, params = {}, query = {}, user = { userId: 'physio-user', role: 'professional' }, tenant = 'physio-tenant') {
  let status = 200, data;
  const req = {
    body,
    params,
    query,
    tenantId: tenant,
    user,
    headers: {},
    ip: '127.0.0.1',
    get: () => undefined
  };
  const res = {
    status(n) { status = n; return this; },
    json(d) { data = d; return this; }
  };
  await controller[method](req, res);
  return { status, data };
}

const posture = {
  version: 1,
  views: {
    front: { fileId: '', guides: true, strokes: [{ tool: 'pen', points: [[.1, .2], [.3, .4]] }] }
  },
  observations: [
    { id: 'note-fisio-1', view: 'front', region: 'spine', text: 'Escoliose postural leve em C torácica', source: 'manual', reviewed: true, evolution: 'stable' }
  ]
};

(async () => {
  // 1. Setup Tenant e Usuários
  db.prepare("INSERT INTO tenants(id, name, slug, email, status) VALUES('physio-tenant', 'Clínica Fisio', 'clinica-fisio', 'clinica@fisio.local', 'active')").run();

  // Fisioterapeuta
  db.prepare(`
    INSERT INTO users(id, tenant_id, email, password_hash, role, status, name, profession_id, profession_name, practice_areas, zemda_fisio_enabled)
    VALUES('physio-user', 'physio-tenant', 'fisio@local', 'hash', 'professional', 'active', 'Dr. Fisioterapeuta', 'prof-fisioterapia', 'Fisioterapia', 'Ortopedia', 1)
  `).run();

  db.prepare(`
    INSERT INTO clinic_users(id, tenant_id, user_id, role, status, is_manager, profession_custom, practice_areas, zemda_fisio_enabled)
    VALUES('cu-physio', 'physio-tenant', 'physio-user', 'professional', 'active', 0, 'Fisioterapia', 'Ortopedia', 1)
  `).run();

  db.prepare(`
    INSERT INTO professionals(id, tenant_id, user_id, name, profession_id, profession_name, practice_areas, zemda_fisio_enabled, active, slug)
    VALUES('pro-physio', 'physio-tenant', 'physio-user', 'Dr. Fisioterapeuta', 'prof-fisioterapia', 'Fisioterapia', 'Ortopedia', 1, 1, 'dr-fisio')
  `).run();

  // Psicólogo (sem acesso a Fisio e sem acesso a Personal)
  db.prepare(`
    INSERT INTO users(id, tenant_id, email, password_hash, role, status, name, profession_id, profession_name, practice_areas)
    VALUES('psico-user', 'physio-tenant', 'psico@local', 'hash', 'professional', 'active', 'Dra. Psicóloga', 'prof-psicologia', 'Psicologia', 'Clínica')
  `).run();

  db.prepare(`
    INSERT INTO clinic_users(id, tenant_id, user_id, role, status, is_manager, profession_custom, practice_areas)
    VALUES('cu-psico', 'physio-tenant', 'psico-user', 'professional', 'active', 0, 'Psicologia', 'Clínica')
  `).run();

  // Paciente
  db.prepare("INSERT INTO patients(id, tenant_id, full_name, phone) VALUES('pat-1', 'physio-tenant', 'Paciente Fisioterapia', '11988887777')").run();

  // Shared assessments require an actual care relationship with this patient.
  db.prepare("INSERT INTO services(id,tenant_id,name) VALUES('posture-service','physio-tenant','Avaliação')").run();
  db.prepare("INSERT INTO appointments(id,tenant_id,appointment_number,patient_id,professional_id,service_id,start_time,end_time) VALUES('posture-appt','physio-tenant','posture-appt','pat-1','pro-physio','posture-service','2026-03-10T12:00:00','2026-03-10T13:00:00')").run();

  const physioAuth = { userId: 'physio-user', role: 'professional' };
  const psicoAuth = { userId: 'psico-user', role: 'professional' };
  const superAdminAuth = { userId: 'super-user', role: 'superadmin' };

  // 2. Fisioterapeuta acessa status de IA postural
  const aiStatus = await call(ai, 'status', {}, {}, {}, physioAuth);
  check(aiStatus.status === 200, 'Physiotherapist can access Posture AI status (HTTP 200)');

  // 3. Fisioterapeuta cria Avaliação Postural
  const createRes = await call(p, 'createAssessment', {
    patient_id: 'pat-1',
    assessment_date: '2026-03-10',
    posture,
    source_module: 'ZemdaFisio'
  }, {}, {}, physioAuth);
  check(createRes.status === 201, 'Physiotherapist can create Postural Assessment (HTTP 201)');
  check(createRes.data.assessment.source_module === 'ZemdaFisio', 'source_module recorded as ZemdaFisio');
  const assessmentId = createRes.data.id;

  // 4. Fisioterapeuta lista avaliações do paciente
  const listRes = await call(p, 'listAssessments', {}, { studentId: 'pat-1' }, {}, physioAuth);
  check(listRes.status === 200, 'Physiotherapist can list assessments for patient (HTTP 200)');
  const item = listRes.data.assessments.find(a => a.id === assessmentId);
  check(item && item.has_posture === true, 'Assessment in list has has_posture=true');
  check(item && item.source_module === 'ZemdaFisio', 'Assessment in list has source_module=ZemdaFisio');
  check(item && item.posture_summary && item.posture_summary.count === 1, 'Assessment includes posture_summary');

  // 5. Fisioterapeuta obtém avaliação específica
  const getRes = await call(p, 'getAssessment', {}, { id: assessmentId }, {}, physioAuth);
  check(getRes.status === 200, 'Physiotherapist can get assessment details (HTTP 200)');
  assert.equal(getRes.data.assessment.source_module, 'ZemdaFisio');

  // 6. Fisioterapeuta atualiza avaliação
  const updatedPosture = {
    ...posture,
    observations: [
      ...posture.observations,
      { id: 'note-fisio-2', view: 'front', region: 'knees', text: 'Valgo dinâmico bilateral', source: 'manual', reviewed: true, evolution: 'stable' }
    ]
  };
  const updateRes = await call(p, 'updateAssessment', { posture: updatedPosture }, { id: assessmentId }, {}, physioAuth);
  check(updateRes.status === 200, 'Physiotherapist can update assessment posture (HTTP 200)');

  // 7. Fisioterapeuta compara avaliações
  const secondRes = await call(p, 'createAssessment', {
    patient_id: 'pat-1',
    assessment_date: '2026-04-10',
    posture: updatedPosture,
    source_module: 'ZemdaFisio'
  }, {}, {}, physioAuth);
  const compareRes = await call(p, 'compareAssessments', {}, { id: secondRes.data.id, compareId: assessmentId }, { posture_baseline: '1' }, physioAuth);
  check(compareRes.status === 200, 'Physiotherapist can compare postural assessments (HTTP 200)');
  check(compareRes.data.posture_history.length === 2, 'Posture history contains both assessments');

  // 8. ISOLAMENTO DE MÓDULO: Fisioterapeuta NÃO PODE acessar recursos de academia do ZemdaPersonal
  const workoutsRes = await call(p, 'listWorkouts', {}, {}, { studentId: 'pat-1' }, physioAuth);
  check(workoutsRes.status === 403, 'Physiotherapist is strictly FORBIDDEN from Personal Trainer workouts (HTTP 403)');

  const createWorkoutRes = await call(p, 'createWorkout', { patient_id: 'pat-1', title: 'Ficha Treino' }, {}, {}, physioAuth);
  check(createWorkoutRes.status === 403, 'Physiotherapist is strictly FORBIDDEN from creating gym workout sheets (HTTP 403)');

  // 9. SEGURANÇA: Profissões não autorizadas (ex: Psicólogo) NÃO PODEM acessar Avaliação Postural
  const psicoAiStatus = await call(ai, 'status', {}, {}, {}, psicoAuth);
  check(psicoAiStatus.status === 403, 'Psychologist is FORBIDDEN from Posture AI (HTTP 403)');

  const psicoListRes = await call(p, 'listAssessments', {}, { studentId: 'pat-1' }, {}, psicoAuth);
  check(psicoListRes.status === 403, 'Psychologist is FORBIDDEN from listing assessments (HTTP 403)');

  const psicoCreateRes = await call(p, 'createAssessment', { patient_id: 'pat-1', assessment_date: '2026-05-01', posture }, {}, {}, psicoAuth);
  check(psicoCreateRes.status === 403, 'Psychologist is FORBIDDEN from creating assessments (HTTP 403)');

  // 10. Superadmin não pode acessar prontuários clínicos
  const superAiStatus = await call(ai, 'status', {}, {}, {}, superAdminAuth);
  check(superAiStatus.status === 403, 'Superadmin is FORBIDDEN from Posture AI (HTTP 403)');

  const superListRes = await call(p, 'listAssessments', {}, { studentId: 'pat-1' }, {}, superAdminAuth);
  check(superListRes.status === 403, 'Superadmin is FORBIDDEN from listing assessments (HTTP 403)');

  console.log(`\nALL ${checks} PHYSIO POSTURE INTEGRATION CHECKS PASSED SUCCESSFULLY!`);
})();
