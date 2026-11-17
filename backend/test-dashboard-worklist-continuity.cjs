// Integration tests for Painel "Atendimentos e rascunhos"
// Validates: started, resumed, completed, cancelled, drafts, 48h backend visual expiration, data preservation, tenant/professional/RBAC isolation, and Studio/Mixed workflows
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-worklist-'));
process.env.DATABASE_PATH = path.join(tempDir, 'test.db');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'worklist-continuity-test-secret-2026';

const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();

const { DashboardController } = require('./dist/controllers/dashboard.controller');
const { ClinicalDraftController } = require('./dist/controllers/clinical-draft.controller');
const { PsychologyController } = require('./dist/controllers/psychology.controller');
const { AppointmentController } = require('./dist/controllers/appointment.controller');
const { ClassAttendanceController } = require('./dist/controllers/class-attendance.controller');
const { dashboardWorklist } = require('./dist/services/dashboard-worklist.service');
const { getClinicLocalNowIso } = require('./dist/services/document-context.service');

const TENANT_CLINIC = 't-wl-clinic';
const TENANT_MIXED = 't-wl-mixed';
const TENANT_STUDIO = 't-wl-studio';
const TENANT_OTHER = 't-wl-other';

for (const [id, slug, name, profile] of [
  [TENANT_CLINIC, 'cli-wl', 'Clínica A', 'clinic'],
  [TENANT_MIXED, 'mix-wl', 'Espaço Misto', 'mixed'],
  [TENANT_STUDIO, 'stu-wl', 'Studio B', 'studio'],
  [TENANT_OTHER, 'oth-wl', 'Clínica Isolada', 'clinic']
]) {
  db.prepare(`
    INSERT INTO tenants (id, slug, name, email, establishment_profile, status)
    VALUES (?, ?, ?, ?, ?, 'active')
  `).run(id, slug, name, `${slug}@wl.test`, profile);
}

function seedUser(id, tenantId, name, email, role, isManager = 0) {
  db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, 'h', ?, 'active')`)
    .run(id, tenantId, name, email, role);
  db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, is_manager, status) VALUES (?, ?, ?, ?, ?, 'active')`)
    .run('cu-' + id, tenantId, id, role, isManager);
}

seedUser('u-wl-adm', TENANT_CLINIC, 'Gestor Clínica', 'adm@wl.test', 'clinic_admin', 1);
seedUser('u-wl-fisio', TENANT_CLINIC, 'Dra. Sofia Fisio', 'sofia@wl.test', 'professional', 0);
seedUser('u-wl-psico', TENANT_CLINIC, 'Dr. Bruno Psico', 'bruno@wl.test', 'professional', 0);
seedUser('u-wl-rec', TENANT_CLINIC, 'Recepção Clara', 'rec@wl.test', 'receptionist', 0);
seedUser('u-wl-mix-adm', TENANT_MIXED, 'Gestor Misto', 'mix@wl.test', 'clinic_admin', 1);
seedUser('u-wl-mix-pers', TENANT_MIXED, 'Instrutor Lucas', 'lucas@wl.test', 'professional', 0);
seedUser('u-wl-stu-adm', TENANT_STUDIO, 'Gestor Studio', 'stu@wl.test', 'clinic_admin', 1);
seedUser('u-wl-oth-adm', TENANT_OTHER, 'Gestor Outro', 'oth@wl.test', 'clinic_admin', 1);

db.prepare(`
  INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, profession_name, zemda_fisio_enabled, zemda_psico_enabled, zemda_personal_enabled, active)
  VALUES
    ('pro-fisio', ?, 'u-wl-fisio', 'Dra. Sofia Fisio', 'prof-fisioterapia', 'Fisioterapeuta', 1, 0, 0, 1),
    ('pro-psico', ?, 'u-wl-psico', 'Dr. Bruno Psico', 'prof-psicologia', 'Psicólogo', 0, 1, 0, 1),
    ('pro-mix-pers', ?, 'u-wl-mix-pers', 'Instrutor Lucas', 'prof-instrutor', 'Personal Trainer', 0, 0, 1, 1),
    ('pro-stu-pers', ?, 'u-wl-stu-adm', 'Gestor Studio', 'prof-instrutor', 'Personal Trainer', 0, 0, 1, 1),
    ('pro-oth', ?, 'u-wl-oth-adm', 'Dr. Outro', 'prof-medicina', 'Médico', 0, 0, 0, 1)
`).run(TENANT_CLINIC, TENANT_CLINIC, TENANT_MIXED, TENANT_STUDIO, TENANT_OTHER);

db.prepare(`
  INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, price, clinical_module, service_domain, service_kind, active)
  VALUES
    ('srv-fisio', ?, 'pro-fisio', 'Sessão de Fisioterapia', 50, 180, 'ZemdaFisio', 'clinical', 'individual', 1),
    ('srv-psico', ?, 'pro-psico', 'Psicoterapia Individual', 50, 200, 'ZemdaPsico', 'clinical', 'individual', 1),
    ('srv-mix-pilates', ?, 'pro-mix-pers', 'Pilates Studio Coletivo', 50, 90, 'ZemdaPersonal', 'studio', 'group', 1),
    ('srv-stu-pers', ?, 'pro-stu-pers', 'Personal Individual', 60, 150, 'ZemdaPersonal', 'studio', 'individual', 1),
    ('srv-oth', ?, 'pro-oth', 'Consulta Médica', 30, 300, 'ZemdaMed', 'clinical', 'individual', 1)
`).run(TENANT_CLINIC, TENANT_CLINIC, TENANT_MIXED, TENANT_STUDIO, TENANT_OTHER);

db.prepare(`
  INSERT INTO patients (id, tenant_id, full_name, phone)
  VALUES
    ('pat-c1', ?, 'Paciente Helena Duarte', '11999990001'),
    ('pat-c2', ?, 'Paciente Marcos Vinícius', '11999990002'),
    ('pat-m1', ?, 'Aluna Camila Nogueira', '11999990003'),
    ('pat-s1', ?, 'Aluno Rafael Prado', '11999990004'),
    ('pat-o1', ?, 'Paciente Outra Clínica', '11999990005')
`).run(TENANT_CLINIC, TENANT_CLINIC, TENANT_MIXED, TENANT_STUDIO, TENANT_OTHER);

db.prepare(`
  INSERT INTO personal_workouts (id, tenant_id, patient_id, professional_id, title, division, is_active)
  VALUES ('pw-s1', ?, 'pat-s1', 'pro-stu-pers', 'Treino A - Hipertrofia', 'A', 1)
`).run(TENANT_STUDIO);

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    req.user = payload;
    req.tenantId = req.headers['x-tenant-id'] || payload.tenantId;
  }
  next();
});

app.get('/v1/dashboard/metrics', DashboardController.getMetrics);
app.put('/v1/appointments/:id/status', AppointmentController.updateStatus);
app.get('/v1/appointments/:id', AppointmentController.getById);
app.get('/v1/clinical/draft/:moduleType/:patientId', ClinicalDraftController.getDraft);
app.post('/v1/clinical/draft', ClinicalDraftController.saveDraft);
app.delete('/v1/clinical/draft/:moduleType/:patientId', ClinicalDraftController.deleteDraft);
app.post('/v1/psychology/draft', PsychologyController.saveDraft);
app.get('/v1/psychology/draft/:patientId', PsychologyController.getDraft);
app.post('/v1/classes/occurrences/:occurrenceId/finish', ClassAttendanceController.finishOccurrence);

function sign(userId, tenantId, role) {
  return jwt.sign({ userId, tenantId, role, email: `${userId}@wl.test`, name: userId }, process.env.JWT_SECRET);
}

function sqliteUtcOffset(hoursDelta) {
  const d = new Date(Date.now() + hoursDelta * 3600 * 1000);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function clinicIsoOffset(hoursDelta) {
  return getClinicLocalNowIso(new Date(Date.now() + hoursDelta * 3600 * 1000));
}

async function run() {
  const srv = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${srv.address().port}`;
  const reqJson = async (p, opts = {}) => {
    const res = await fetch(`${baseUrl}${p}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.tenantId ? { 'X-Tenant-ID': opts.tenantId } : {})
      }
    });
    const json = await res.json();
    return { status: res.status, json };
  };

  try {
    const tokFisio = sign('u-wl-fisio', TENANT_CLINIC, 'professional');
    const tokPsico = sign('u-wl-psico', TENANT_CLINIC, 'professional');
    const tokClinicAdm = sign('u-wl-adm', TENANT_CLINIC, 'clinic_admin');
    const tokRec = sign('u-wl-rec', TENANT_CLINIC, 'receptionist');
    const tokMixPers = sign('u-wl-mix-pers', TENANT_MIXED, 'professional');
    const tokStuAdm = sign('u-wl-stu-adm', TENANT_STUDIO, 'clinic_admin');
    const tokOthAdm = sign('u-wl-oth-adm', TENANT_OTHER, 'clinic_admin');

    // 1. Create scheduled appointments and start one via API (attendance_start_at set)
    const nowClinic = clinicIsoOffset(-1);
    const todayDate = nowClinic.slice(0, 10);
    db.prepare(`
      INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, start_time, end_time, status, clinical_module)
      VALUES
        ('apt-f-active', ?, 'AT-WL-001', 'pat-c1', 'pro-fisio', 'srv-fisio', ?, ?, 'scheduled', 'ZemdaFisio'),
        ('apt-p-sched', ?, 'AT-WL-002', 'pat-c2', 'pro-psico', 'srv-psico', ?, ?, 'confirmed', 'ZemdaPsico'),
        ('apt-o-active', ?, 'AT-WL-003', 'pat-o1', 'pro-oth', 'srv-oth', ?, ?, 'in_progress', 'ZemdaMed')
    `).run(
      TENANT_CLINIC, `${todayDate}T09:00:00`, `${todayDate}T09:50:00`,
      TENANT_CLINIC, `${todayDate}T10:00:00`, `${todayDate}T10:50:00`,
      TENANT_OTHER, `${todayDate}T11:00:00`, `${todayDate}T11:30:00`
    );

    const startRes = await reqJson('/v1/appointments/apt-f-active/status', {
      method: 'PUT',
      token: tokFisio,
      tenantId: TENANT_CLINIC,
      body: JSON.stringify({ status: 'in_progress' })
    });
    assert.equal(startRes.status, 200);

    // 2. Verify active attendance appears in Painel worklist with all required metadata
    const mFisio1 = await reqJson(`/v1/dashboard/metrics?date=${todayDate}`, { token: tokFisio, tenantId: TENANT_CLINIC });
    assert.equal(mFisio1.status, 200);
    assert.equal(mFisio1.json.worklist.unfinished.length, 1);
    const activeItem = mFisio1.json.worklist.unfinished[0];
    assert.equal(activeItem.id, 'apt-f-active');
    assert.equal(activeItem.patient_name, 'Paciente Helena Duarte');
    assert.equal(activeItem.service_name, 'Sessão de Fisioterapia');
    assert.equal(activeItem.professional_name, 'Dra. Sofia Fisio');
    assert.equal(activeItem.resolved_module, 'ZemdaFisio');
    assert.equal(activeItem.status_label, 'Em andamento');
    assert.ok(activeItem.reference_at && activeItem.elapsed_label);
    assert.equal(activeItem.is_studio_session, false);

    // 3. Save a draft linked to that SAME in_progress appointment -> deduplicated on worklist (has_draft=true, no duplicate card)
    const saveFisioDraft = await reqJson('/v1/clinical/draft', {
      method: 'POST',
      token: tokFisio,
      tenantId: TENANT_CLINIC,
      body: JSON.stringify({
        moduleType: 'ZemdaFisio',
        patientId: 'pat-c1',
        appointmentId: 'apt-f-active',
        draftData: { assessmentNotes: 'ADM preservada' }
      })
    });
    assert.equal(saveFisioDraft.status, 200);

    const mFisioDedup = await reqJson(`/v1/dashboard/metrics?date=${todayDate}`, { token: tokFisio, tenantId: TENANT_CLINIC });
    assert.equal(mFisioDedup.json.worklist.unfinished.length, 1);
    assert.equal(mFisioDedup.json.worklist.unfinished[0].has_draft, true);
    assert.equal(mFisioDedup.json.worklist.drafts.length, 0);

    // 4. Standalone & psychology drafts appear for their owners (clinical_drafts + psychology_drafts)
    const savePsicoDraft = await reqJson('/v1/psychology/draft', {
      method: 'POST',
      token: tokPsico,
      tenantId: TENANT_CLINIC,
      body: JSON.stringify({
        patientId: 'pat-c2',
        appointmentId: 'apt-p-sched',
        draftData: { currentSession: { notes: 'Sessão inicial' } }
      })
    });
    assert.equal(savePsicoDraft.status, 200);

    const mPsico1 = await reqJson(`/v1/dashboard/metrics?date=${todayDate}`, { token: tokPsico, tenantId: TENANT_CLINIC });
    assert.equal(mPsico1.json.worklist.unfinished.length, 0, 'Psico does not see Fisio unfinished attendance');
    assert.equal(mPsico1.json.worklist.drafts.length, 1);
    assert.equal(mPsico1.json.worklist.drafts[0].patient_name, 'Paciente Marcos Vinícius');
    assert.equal(mPsico1.json.worklist.drafts[0].resolved_module, 'ZemdaPsico');
    assert.equal(mPsico1.json.worklist.drafts[0].service_name, 'Psicoterapia Individual');
    assert.equal(mPsico1.json.worklist.drafts[0].professional_name, 'Dr. Bruno Psico');
    assert.equal(mPsico1.json.worklist.drafts[0].status_label, 'Rascunho');
    assert.ok(mPsico1.json.worklist.drafts[0].elapsed_label);

    // 5. Isolation: Receptionist gets ZERO items; Clinic Other cannot see Clinic A items
    const mRec = await reqJson(`/v1/dashboard/metrics?date=${todayDate}`, { token: tokRec, tenantId: TENANT_CLINIC });
    assert.equal(mRec.json.worklist.unfinished.length, 0);
    assert.equal(mRec.json.worklist.drafts.length, 0);

    const mOther = await reqJson(`/v1/dashboard/metrics?date=${todayDate}`, { token: tokOthAdm, tenantId: TENANT_OTHER });
    assert.equal(mOther.json.worklist.unfinished.length, 1);
    assert.equal(mOther.json.worklist.unfinished[0].id, 'apt-o-active');

    // 6. Cancel linked appointment -> draft AND appointment immediately excluded from Painel, data still in DB
    const cancelPsico = await reqJson('/v1/appointments/apt-p-sched/status', {
      method: 'PUT',
      token: tokPsico,
      tenantId: TENANT_CLINIC,
      body: JSON.stringify({ status: 'cancelled', reason: 'Remarcação' })
    });
    assert.equal(cancelPsico.status, 200);
    const mPsicoAfterCancel = await reqJson(`/v1/dashboard/metrics?date=${todayDate}`, { token: tokPsico, tenantId: TENANT_CLINIC });
    assert.equal(mPsicoAfterCancel.json.worklist.drafts.length, 0, 'Cancelled linked appointment draft hidden immediately');
    assert.ok(db.prepare('SELECT id FROM psychology_drafts WHERE appointment_id = ?').get('apt-p-sched'), 'Draft stays safely preserved in DB');

    // Also test cancelling an in_progress appointment removes it immediately from unfinished
    db.prepare(`
      INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, start_time, end_time, attendance_start_at, status, clinical_module)
      VALUES ('apt-f-cancel', ?, 'AT-WL-004', 'pat-c1', 'pro-fisio', 'srv-fisio', ?, ?, ?, 'in_progress', 'ZemdaFisio')
    `).run(TENANT_CLINIC, `${todayDate}T14:00:00`, `${todayDate}T14:50:00`, clinicIsoOffset(-0.5));
    await reqJson('/v1/appointments/apt-f-cancel/status', {
      method: 'PUT',
      token: tokFisio,
      tenantId: TENANT_CLINIC,
      body: JSON.stringify({ status: 'cancelled', reason: 'Paciente cancelou' })
    });
    const mFisioAfterCancel = await reqJson(`/v1/dashboard/metrics?date=${todayDate}`, { token: tokFisio, tenantId: TENANT_CLINIC });
    assert.ok(!mFisioAfterCancel.json.worklist.unfinished.some(x => x.id === 'apt-f-cancel'));

    // 7. 48-hour backend expiration (47h visible vs 49h expired from Painel ONLY, records preserved untouched in DB)
    db.prepare(`
      INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, start_time, end_time, attendance_start_at, status, clinical_module)
      VALUES
        ('apt-47h', ?, 'AT-WL-005', 'pat-c1', 'pro-fisio', 'srv-fisio', ?, ?, ?, 'in_progress', 'ZemdaFisio'),
        ('apt-49h', ?, 'AT-WL-006', 'pat-c2', 'pro-fisio', 'srv-fisio', ?, ?, ?, 'in_progress', 'ZemdaFisio')
    `).run(
      TENANT_CLINIC, clinicIsoOffset(-47), clinicIsoOffset(-46), clinicIsoOffset(-47),
      TENANT_CLINIC, clinicIsoOffset(-49), clinicIsoOffset(-48), clinicIsoOffset(-49)
    );

    await reqJson('/v1/clinical/draft', {
      method: 'POST',
      token: tokFisio,
      tenantId: TENANT_CLINIC,
      body: JSON.stringify({
        moduleType: 'ZemdaFisio',
        patientId: 'pat-c2',
        draftData: { note: 'Rascunho 47h' }
      })
    });
    db.prepare(`UPDATE clinical_drafts SET updated_at = ? WHERE tenant_id = ? AND patient_id = 'pat-c2' AND module_type = 'fisio' AND appointment_id IS NULL`)
      .run(sqliteUtcOffset(-47), TENANT_CLINIC);

    await reqJson('/v1/clinical/draft', {
      method: 'POST',
      token: tokPsico,
      tenantId: TENANT_CLINIC,
      body: JSON.stringify({
        moduleType: 'general',
        patientId: 'pat-c2',
        draftData: { chiefComplaint: 'Rascunho 49h' }
      })
    });
    db.prepare(`UPDATE clinical_drafts SET updated_at = ? WHERE tenant_id = ? AND patient_id = 'pat-c2' AND module_type = 'general' AND appointment_id IS NULL`)
      .run(sqliteUtcOffset(-49), TENANT_CLINIC);

    const mFisio48 = await reqJson(`/v1/dashboard/metrics?date=${todayDate}`, { token: tokFisio, tenantId: TENANT_CLINIC });
    assert.ok(mFisio48.json.worklist.unfinished.some(x => x.id === 'apt-47h'), '47h attendance must appear');
    assert.ok(!mFisio48.json.worklist.unfinished.some(x => x.id === 'apt-49h'), '49h attendance must be hidden from Painel');
    assert.ok(mFisio48.json.worklist.drafts.some(x => x.patient_id === 'pat-c2' && x.resolved_module === 'ZemdaFisio'), '47h draft must appear');

    const mPsico48 = await reqJson(`/v1/dashboard/metrics?date=${todayDate}`, { token: tokPsico, tenantId: TENANT_CLINIC });
    assert.ok(!mPsico48.json.worklist.drafts.some(x => x.patient_id === 'pat-c2' && x.resolved_module === 'general'), '49h draft must be hidden from Painel');

    // CRITICAL: verify 49h records are STILL intact & accessible in DB/Agenda/Draft endpoint!
    const oldApptDb = db.prepare(`SELECT status, attendance_start_at FROM appointments WHERE id = 'apt-49h'`).get();
    assert.equal(oldApptDb.status, 'in_progress', '49h appointment status NEVER altered automatically');
    const getOldAppt = await reqJson('/v1/appointments/apt-49h', { token: tokFisio, tenantId: TENANT_CLINIC });
    assert.equal(getOldAppt.status, 200);
    assert.equal(getOldAppt.json.appointment.id, 'apt-49h');
    const getOldDraft = await reqJson('/v1/clinical/draft/general/pat-c2', { token: tokPsico, tenantId: TENANT_CLINIC });
    assert.equal(getOldDraft.status, 200);
    assert.equal(getOldDraft.json.draft.draftData.chiefComplaint, 'Rascunho 49h');

    // 8. Studio & Mixed Establishment + Completion removal
    db.prepare(`
      INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, occurrence_id, service_kind, start_time, end_time, attendance_start_at, status, clinical_module)
      VALUES ('apt-mix-stu', ?, 'AT-WL-007', 'pat-m1', 'pro-mix-pers', 'srv-mix-pilates', 'occ-mix-1', 'group', ?, ?, ?, 'in_progress', 'ZemdaPersonal')
    `).run(TENANT_MIXED, `${todayDate}T16:00:00`, `${todayDate}T16:50:00`, clinicIsoOffset(-0.2));

    const mMixPers = await reqJson(`/v1/dashboard/metrics?date=${todayDate}`, { token: tokMixPers, tenantId: TENANT_MIXED });
    assert.equal(mMixPers.json.worklist.unfinished.length, 1);
    assert.equal(mMixPers.json.worklist.unfinished[0].is_studio_session, true);
    assert.equal(mMixPers.json.worklist.unfinished[0].resolved_module, 'ZemdaPersonal');
    assert.equal(mMixPers.json.worklist.unfinished[0].service_kind, 'group');

    // Finishing the Studio session removes it immediately from Painel, preserves completed row in DB
    const finishStu = await reqJson('/v1/classes/occurrences/occ-mix-1/finish', {
      method: 'POST',
      token: tokMixPers,
      tenantId: TENANT_MIXED,
      body: JSON.stringify({})
    });
    assert.equal(finishStu.status, 200);
    const mMixAfterFinish = await reqJson(`/v1/dashboard/metrics?date=${todayDate}`, { token: tokMixPers, tenantId: TENANT_MIXED });
    assert.equal(mMixAfterFinish.json.worklist.unfinished.length, 0, 'Completed Studio attendance disappears immediately from Painel');
    const stuDbAfter = db.prepare(`SELECT status FROM appointments WHERE id = 'apt-mix-stu'`).get();
    assert.equal(stuDbAfter.status, 'completed');

    // 9. Studio ZemdaPersonal Assessment & Workout drafts save/recover cleanly without 403
    const saveAssessDraft = await reqJson('/v1/clinical/draft', {
      method: 'POST',
      token: tokStuAdm,
      tenantId: TENANT_STUDIO,
      body: JSON.stringify({
        moduleType: 'ZemdaPersonal_Assessment',
        patientId: 'pat-s1',
        draftData: { weight: '78', notes: 'Dobras parciais' }
      })
    });
    assert.equal(saveAssessDraft.status, 200);

    const saveWorkoutDraft = await reqJson('/v1/clinical/draft', {
      method: 'POST',
      token: tokStuAdm,
      tenantId: TENANT_STUDIO,
      body: JSON.stringify({
        moduleType: 'ZemdaPersonal_Workout',
        patientId: 'pat-s1',
        appointmentId: 'pw-s1',
        draftData: { durationMinutes: 35, rpe: 8 }
      })
    });
    assert.equal(saveWorkoutDraft.status, 200);

    const mStu = await reqJson(`/v1/dashboard/metrics?date=${todayDate}`, { token: tokStuAdm, tenantId: TENANT_STUDIO });
    assert.equal(mStu.json.worklist.drafts.length, 2);
    const assessCard = mStu.json.worklist.drafts.find(d => d.draft_subtype === 'assessment');
    const workoutCard = mStu.json.worklist.drafts.find(d => d.draft_subtype === 'workout');
    assert.ok(assessCard && assessCard.resolved_module === 'ZemdaPersonal' && assessCard.module_label === 'ZemdaPersonal • Avaliação');
    assert.ok(workoutCard && workoutCard.resolved_module === 'ZemdaPersonal' && workoutCard.service_name === 'Treino A - Hipertrofia');

    // Clinic admin completing apt-f-active -> removes both attendance & orphaned draft from Painel
    db.prepare(`UPDATE appointments SET status = 'completed', attendance_end_at = ?, updated_at = datetime('now') WHERE id = 'apt-f-active'`).run(clinicIsoOffset(0));
    const mFisioAfterFinish = await reqJson(`/v1/dashboard/metrics?date=${todayDate}`, { token: tokFisio, tenantId: TENANT_CLINIC });
    assert.ok(!mFisioAfterFinish.json.worklist.unfinished.some(x => x.id === 'apt-f-active'));
    assert.ok(!mFisioAfterFinish.json.worklist.drafts.some(x => x.appointment_id === 'apt-f-active'));

    console.log('PASS: All Dashboard Atendimentos e Rascunhos continuity, 48h backend expiration, Studio/Mixed, and isolation checks passed!');
  } finally {
    srv.close();
    try { db.close?.(); } catch {}
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
