// Deterministic integration tests for the SuperAdmin Sandbox Laboratory rearchitecture.
// Uses an isolated temporary SQLite database and mocked local storage; zero production/external side effects.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-sandbox-test-'));
const uploadRoot = path.join(root, 'uploads');
fs.mkdirSync(uploadRoot, { recursive: true });

process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = path.join(root, 'test.sqlite');
process.env.UPLOADS_DIR = uploadRoot;
process.env.JWT_SECRET = 'local-test-jwt-secret-must-be-long-enough-12345';
process.env.EMAIL_OTP_SECRET = 'local-test-otp-secret-must-be-long-enough-12345';
process.env.ASAAS_ENV = 'sandbox';
process.env.ASAAS_API_KEY = '$aact_hmlg_test_only';
process.env.RESEND_API_KEY = 're_test_key_disabled_network';
process.env.APP_URL = 'https://zemda.test';

const actualFetch = global.fetch;
global.fetch = async (url, options = {}) => {
  const s = String(url);
  if (s.startsWith('http://127.0.0.1:')) {
    return actualFetch(url, options);
  }
  throw new Error(`FORBIDDEN_EXTERNAL_NETWORK_CALL: ${s}`);
};

const bcrypt = require('bcryptjs');
const express = require('express');
const { db, initializeDatabase } = require('./dist/config/database');
const { generateToken } = require('./dist/utils/jwt');
const { SandboxService } = require('./dist/services/sandbox.service');
const { EmailService } = require('./dist/services/email.service');
const { InfobipService } = require('./dist/services/infobip.service');
const { NotificationService } = require('./dist/services/notification.service');
const { TrialNotificationService } = require('./dist/services/trial-notification.service');
const { AdminNotificationService } = require('./dist/services/admin-notification.service');
const { GoogleCalendarService } = require('./dist/services/google-calendar.service');
const { BillingService } = require('./dist/services/billing.service');
const { r2StorageService } = require('./dist/services/r2-storage.service');

// Seed database & test idempotency of initializeDatabase
initializeDatabase();
initializeDatabase();

// Spy/stub R2 deletion cleanly without network calls
let deletedPrefixes = [];
let forceR2Fail = false;
r2StorageService.deletePrefix = async (prefix) => {
  deletedPrefixes.push(prefix);
  if (forceR2Fail) {
    throw new Error('SIMULATED_R2_DELETE_FAILURE');
  }
  return 1;
};

const app = express();
app.use(express.json());
app.use('/api', require('./dist/routes').default);

async function main() {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const call = async (route, { method = 'GET', body = null, token = '', headers = {} } = {}) => {
    const res = await fetch(base + route, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    return { status: res.status, body: json };
  };

  try {
    // 1. Seed SuperAdmin + 1 Real Clinic + 1 Historical Legacy Sandbox (pre-existing)
    const superAdminId = 'sa-root-1';
    const realTenantId = 'real-clinic-1';
    const realAdminId = 'real-admin-1';
    const realProfUserId = 'real-prof-user-1';
    const realProfId = 'real-prof-1';
    const legacyTenantId = 'sbx-tenant-legacy-1';
    const legacyUserId = 'sbx-user-legacy-1';

    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status)
      VALUES (?, NULL, 'SuperAdmin Test', 'root@zemda.test', ?, 'superadmin', 'active')
    `).run(superAdminId, bcrypt.hashSync('Secret123!', 4));

    db.prepare(`
      INSERT INTO tenants (id, slug, name, email, status, establishment_profile, onboarding_completed, onboarding_status, billing_required)
      VALUES (?, 'clinica-real', 'Clinica Vida Real', 'contato@realclinic.test', 'active', 'clinic', 1, 'completed', 0)
    `).run(realTenantId);

    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status)
      VALUES (?, ?, 'Gestor Real', 'gestor@realclinic.test', ?, 'clinic_admin', 'active')
    `).run(realAdminId, realTenantId, bcrypt.hashSync('Secret123!', 4));

    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, profession_id)
      VALUES (?, ?, ?, 'clinic_admin', 'active', 1, 'prof-medico')
    `).run('cu-real-admin', realTenantId, realAdminId);

    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status)
      VALUES (?, ?, 'Dra Real', 'dra@realclinic.test', ?, 'professional', 'active')
    `).run(realProfUserId, realTenantId, bcrypt.hashSync('Secret123!', 4));

    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, profession_id)
      VALUES (?, ?, ?, 'professional', 'active', 0, 'prof-fisioterapeuta')
    `).run('cu-real-prof', realTenantId, realProfUserId);

    db.prepare(`
      INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, active)
      VALUES (?, ?, ?, 'Dra Real', 'prof-fisioterapeuta', 1)
    `).run(realProfId, realTenantId, realProfUserId);

    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, email, phone)
      VALUES ('real-pat-1', ?, 'Paciente Real', 'pat@realclinic.test', '11999990001')
    `).run(realTenantId);

    // Seed legacy sandbox row explicitly marked is_sandbox = 1 (read-only preserved)
    db.prepare(`
      INSERT INTO tenants (id, slug, name, email, status, is_sandbox, billing_required)
      VALUES (?, 'sbx-legacy-1', 'Sandbox Legado Historico', 'legacy@zemda.test', 'active', 1, 0)
    `).run(legacyTenantId);

    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, is_sandbox)
      VALUES (?, ?, 'Usuario Legado Sandbox', 'legacy@zemda.test', ?, 'professional', 'active', 1)
    `).run(legacyUserId, legacyTenantId, bcrypt.hashSync('Secret123!', 4));

    const superToken = generateToken({
      userId: superAdminId,
      tenantId: null,
      role: 'superadmin',
      email: 'root@zemda.test',
      name: 'SuperAdmin Test'
    });

    const realAdminToken = generateToken({
      userId: realAdminId,
      tenantId: realTenantId,
      role: 'clinic_admin',
      email: 'gestor@realclinic.test',
      name: 'Gestor Real'
    });

    const realProfToken = generateToken({
      userId: realProfUserId,
      tenantId: realTenantId,
      role: 'professional',
      email: 'dra@realclinic.test',
      name: 'Dra Real'
    });

    db.prepare(`
      INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, start_time, end_time, status)
      VALUES ('real-appt-1', ?, 'AG-REAL-0001', 'real-pat-1', ?, datetime('now', '+1 day'), datetime('now', '+1 day', '+1 hour'), 'scheduled')
    `).run(realTenantId, realProfId);

    // Capture baseline admin metrics BEFORE provisioning sandbox or counting sandbox rows
    const baselineMetricsRes = await call('/v1/admin/metrics', { token: superToken });
    assert.equal(baselineMetricsRes.status, 200);
    const baselineMetrics = baselineMetricsRes.body;

    console.log('[1/9] Checking initial status and legacy report...');
    const initialStatus = await call('/v1/sandbox/status', { token: superToken });
    assert.equal(initialStatus.status, 200);
    assert.equal(initialStatus.body.provisioned, false);
    assert.equal(initialStatus.body.status, 'unprovisioned');

    const legacyReport = await call('/v1/sandbox/legacy-report', { token: superToken });
    assert.equal(legacyReport.status, 200);
    assert.equal(legacyReport.body.totalLegacyTenants, 1);
    assert.equal(legacyReport.body.legacyTenants[0].id, legacyTenantId);

    console.log('[2/9] Checking idempotency & concurrency of provisioning (10 sequential + 5 parallel)...');
    const firstManager = await call('/v1/sandbox/create-session', {
      method: 'POST',
      token: superToken,
      body: { mode: 'manager', establishmentProfile: 'clinic', planCode: 'CLINIC' }
    });
    assert.equal(firstManager.status, 200);
    assert.equal(firstManager.body.mode, 'manager');
    assert.equal(firstManager.body.user.role, 'clinic_admin');
    assert.notEqual(firstManager.body.user.role, 'superadmin');
    assert.equal(firstManager.body.user.isSandbox, true);
    assert.equal(firstManager.body.tenant.is_sandbox, 1);

    const sandboxTenantId = firstManager.body.sandboxTenantId;
    const managerToken = firstManager.body.token;
    const managerUserId = firstManager.body.sandboxUserId;

    // 10 repeated sequential sessions alternating modes
    for (let i = 0; i < 10; i++) {
      const mode = i % 2 === 0 ? 'manager' : 'professional';
      const r = await call('/v1/sandbox/create-session', {
        method: 'POST',
        token: superToken,
        body: {
          mode,
          establishmentProfile: mode === 'manager' ? 'studio' : 'mixed',
          professionId: mode === 'professional' ? 'prof-fisioterapeuta' : undefined,
          planCode: 'ALL'
        }
      });
      assert.equal(r.status, 200);
      assert.equal(r.body.sandboxTenantId, sandboxTenantId);
    }

    // 5 parallel calls
    const parallelResults = await Promise.all(
      Array.from({ length: 5 }, (_, idx) =>
        call('/v1/sandbox/create-session', {
          method: 'POST',
          token: superToken,
          body: {
            mode: idx % 2 === 0 ? 'manager' : 'professional',
            establishmentProfile: 'clinic',
            professionId: 'prof-psicologo',
            planCode: 'TEAM'
          }
        })
      )
    );
    for (const pr of parallelResults) {
      assert.equal(pr.status, 200);
      assert.equal(pr.body.sandboxTenantId, sandboxTenantId);
    }

    // Check database counts of reusable environment (excluding the pre-existing legacy row)
    const activeSandboxTenants = db.prepare(`SELECT id FROM tenants WHERE is_sandbox = 1 AND id != ?`).all(legacyTenantId);
    assert.equal(activeSandboxTenants.length, 1, 'Expected exactly 1 reusable sandbox tenant');
    const activeSandboxUsers = db.prepare(`SELECT id, role FROM users WHERE is_sandbox = 1 AND id != ?`).all(legacyUserId);
    assert.equal(activeSandboxUsers.length, 2, 'Expected exactly 2 reusable sandbox users (manager + professional)');
    assert.ok(activeSandboxUsers.every((u) => u.role !== 'superadmin'), 'No sandbox user may have superadmin role');

    console.log('[3/9] Verifying Gestor de Teste operations, plans, establishment profiles & profession switch...');
    const latestMgr = await call('/v1/sandbox/create-session', {
      method: 'POST',
      token: superToken,
      body: { mode: 'manager', establishmentProfile: 'mixed', planCode: 'CLINIC' }
    });
    assert.equal(latestMgr.status, 200);
    const activeMgrToken = latestMgr.body.token;

    const meMgr = await call('/v1/auth/me', { token: activeMgrToken });
    assert.equal(meMgr.status, 200);
    assert.equal(meMgr.body.user.isSandbox, true);
    assert.equal(meMgr.body.user.sandboxAccountType, 'manager');
    assert.equal(meMgr.body.tenant.establishment_profile, 'mixed');
    assert.notEqual(meMgr.body.user.professionId, 'prof-fonoaudiologo');

    // Create sandbox patient, service, appointment, custom exercise + workout
    const createPat = await call('/v1/patients', {
      method: 'POST',
      token: activeMgrToken,
      body: { name: 'Paciente Sandbox Criado', phone: '11988887777', email: 'patsbx@zemda.test' }
    });
    assert.equal(createPat.status, 201);

    const sandboxProfRow = db.prepare(`SELECT id FROM professionals WHERE tenant_id = ? LIMIT 1`).get(sandboxTenantId);
    const createSvc = await call('/v1/services', {
      method: 'POST',
      token: activeMgrToken,
      body: { name: 'Consulta Teste Sandbox', professionalId: sandboxProfRow.id, durationMinutes: 50, price: 200 }
    });
    assert.equal(createSvc.status, 201);

    // Ensure 0 real commercial subscriptions exist for sandbox tenant
    const subCount = db.prepare(`SELECT COUNT(*) as total FROM subscriptions WHERE clinic_id = ?`).get(sandboxTenantId).total;
    assert.equal(subCount, 0, 'Sandbox must never create commercial subscriptions');

    // Switch profession on Profissional de Teste
    const profFisio = await call('/v1/sandbox/create-session', {
      method: 'POST',
      token: superToken,
      body: { mode: 'professional', professionId: 'prof-fisioterapeuta', planCode: 'SOLO' }
    });
    assert.equal(profFisio.status, 200);
    const profUserId = profFisio.body.sandboxUserId;

    const profPsico = await call('/v1/sandbox/create-session', {
      method: 'POST',
      token: superToken,
      body: { mode: 'professional', professionId: 'prof-psicologo', planCode: 'CLINIC' }
    });
    assert.equal(profPsico.status, 200);
    assert.equal(profPsico.body.sandboxUserId, profUserId, 'Profession switch must reuse same sandbox professional account');

    console.log('[4/9] Verifying authorization, anti-spoofing, and cross-tenant isolation...');
    // Re-open manager session to test manager reset and cross-tenant guards
    const mgrSession2 = await call('/v1/sandbox/create-session', {
      method: 'POST',
      token: superToken,
      body: { mode: 'manager', establishmentProfile: 'clinic', planCode: 'ALL' }
    });
    const mgrTok2 = mgrSession2.body.token;

    // Normal clinic admin / professional rejected from sandbox endpoints
    assert.equal((await call('/v1/sandbox/status', { token: realAdminToken })).status, 403);
    assert.equal((await call('/v1/sandbox/create-session', { method: 'POST', token: realAdminToken, body: { mode: 'manager' } })).status, 403);
    assert.equal((await call('/v1/sandbox/reset', { method: 'POST', token: realAdminToken })).status, 403);
    assert.equal((await call('/v1/sandbox/reset', { method: 'POST', token: realProfToken })).status, 403);

    // Gestor Sandbox spoofing realTenantId in body or header is blocked (403)
    const spoofBody = await call('/v1/sandbox/reset', {
      method: 'POST',
      token: mgrTok2,
      body: { tenantId: realTenantId }
    });
    assert.equal(spoofBody.status, 403);
    const spoofHeader = await call('/v1/sandbox/reset', {
      method: 'POST',
      token: mgrTok2,
      headers: { 'X-Tenant-ID': realTenantId }
    });
    assert.equal(spoofHeader.status, 403);

    // SuperAdmin attempting to reset a real clinic is blocked (403)
    const resetRealBySA = await call('/v1/sandbox/reset', {
      method: 'POST',
      token: superToken,
      body: { tenantId: realTenantId }
    });
    assert.equal(resetRealBySA.status, 403);

    // Cross-tenant data access blocked in both directions
    assert.equal((await call('/v1/patients', { token: mgrTok2, headers: { 'X-Tenant-ID': realTenantId } })).status, 403);
    assert.equal((await call('/v1/patients', { token: realAdminToken, headers: { 'X-Tenant-ID': sandboxTenantId } })).status, 403);

    // Sandbox user blocked from direct password login
    const directLogin = await call('/v1/auth/login', {
      method: 'POST',
      body: { email: meMgr.body.user.email, password: 'any-password' }
    });
    assert.equal(directLogin.status, 403);

    // Public booking blocked on sandbox tenant
    const publicBookingAttempt = await call('/v1/tenants/current', {
      method: 'PUT',
      token: mgrTok2,
      body: { name: 'Clinica Teste Sandbox', publicBookingEnabled: true }
    });
    assert.equal(publicBookingAttempt.status, 403);

    console.log('[5/9] Verifying backend exclusion from all real lists, searches, and admin metrics...');
    // Add 10 extra sandbox appointments to prove metrics aren't inflated
    db.prepare(`
      INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, start_time, end_time, status)
      SELECT 'sbx-extra-appt-' || value, ?, 'SBX-APT-' || value, p.id, pr.id, datetime('now', '+1 day'), datetime('now', '+1 day', '+1 hour'), 'scheduled'
      FROM json_each('[1,2,3,4,5,6,7,8,9,10]')
      JOIN patients p ON p.tenant_id = ?
      JOIN professionals pr ON pr.tenant_id = ?
      LIMIT 10
    `).run(sandboxTenantId, sandboxTenantId, sandboxTenantId);

    const allTenantsRes = await call('/v1/tenants', { token: superToken });
    assert.equal(allTenantsRes.status, 200);
    const tenantIdsInList = (Array.isArray(allTenantsRes.body) ? allTenantsRes.body : allTenantsRes.body.data || []).map((t) => t.id);
    assert.ok(tenantIdsInList.includes(realTenantId), 'Real clinic must appear in listAll');
    assert.ok(!tenantIdsInList.includes(sandboxTenantId), 'Reusable sandbox must NEVER appear in listAll');
    assert.ok(!tenantIdsInList.includes(legacyTenantId), 'Legacy sandbox must NEVER appear in listAll');

    const metricsRes = await call('/v1/admin/metrics', { token: superToken });
    assert.equal(metricsRes.status, 200);
    assert.equal(metricsRes.body.totalClinics, baselineMetrics.totalClinics, 'adminMetrics totalClinics must exclude sandboxes');
    assert.equal(metricsRes.body.totalUsers, baselineMetrics.totalUsers, 'adminMetrics totalUsers must exclude superadmin and sandbox users');
    assert.equal(metricsRes.body.totalAppointments, baselineMetrics.totalAppointments, 'adminMetrics totalAppointments must exclude sandbox appointments');

    const trialsRes = await call('/v1/admin/free-trials', { token: superToken });
    assert.equal(trialsRes.status, 200);
    const trialList = Array.isArray(trialsRes.body) ? trialsRes.body : (trialsRes.body.trials || []);
    assert.ok(!trialList.some((t) => t.id === sandboxTenantId || t.id === legacyTenantId), 'Free trials list must exclude sandboxes');

    const subsRes = await call('/v1/admin/subscriptions', { token: superToken });
    assert.equal(subsRes.status, 200);
    const subsList = Array.isArray(subsRes.body) ? subsRes.body : (subsRes.body.subscriptions || subsRes.body.items || []);
    assert.ok(!subsList.some((s) => s.clinic_id === sandboxTenantId || s.id === sandboxTenantId), 'Admin subscriptions must exclude sandboxes');

    const soloTrialsRes = await call('/v1/admin/solo-trials', { token: superToken });
    assert.equal(soloTrialsRes.status, 200);
    const soloTrialsList = Array.isArray(soloTrialsRes.body) ? soloTrialsRes.body : (soloTrialsRes.body.trials || soloTrialsRes.body.items || []);
    assert.ok(!soloTrialsList.some((s) => s.clinic_id === sandboxTenantId || s.id === sandboxTenantId), 'Admin solo trials must exclude sandboxes');

    const searchLinkRes = await call('/v1/admin/visits/search-tenants?q=Sandbox', { token: superToken });
    assert.equal(searchLinkRes.status, 200);
    const linkList = Array.isArray(searchLinkRes.body) ? searchLinkRes.body : (searchLinkRes.body.tenants || []);
    assert.equal(linkList.length, 0, 'CRM tenant link search must never surface sandboxes');

    console.log('[6/9] Verifying complete transactional reset + Exercise Library protection + local/R2 cleanup...');
    // Check Protected Exercise Library before reset
    const globalExercisesBefore = db.prepare(`SELECT COUNT(*) as c FROM personal_exercises WHERE tenant_id = 'global' AND is_custom = 0`).get().c;
    const sampleExercise = db.prepare(`SELECT id FROM personal_exercises WHERE tenant_id = 'global' LIMIT 1`).get();

    // Stage local sandbox upload file
    const sbxClinicUploadDir = path.join(uploadRoot, 'clinics', sandboxTenantId);
    fs.mkdirSync(sbxClinicUploadDir, { recursive: true });
    const dummyFile = path.join(sbxClinicUploadDir, 'temp-test-file.png');
    fs.writeFileSync(dummyFile, 'fake-png-bytes');
    assert.equal(fs.existsSync(dummyFile), true);

    deletedPrefixes = [];
    const resetOk = await call('/v1/sandbox/reset', { method: 'POST', token: mgrTok2 });
    assert.equal(resetOk.status, 200);
    assert.equal(resetOk.body.success, true);

    // Local & R2 cleanup verified
    assert.equal(fs.existsSync(dummyFile), false, 'Local sandbox uploads must be deleted during reset');
    assert.ok(deletedPrefixes.includes(`clinics/${sandboxTenantId}/`), 'R2 prefix delete must run for sandbox tenant');

    // Created patient & custom service wiped; baseline seed restored
    const createdPatientStillExists = db.prepare(`SELECT id FROM patients WHERE tenant_id = ? AND email = 'patsbx@zemda.test'`).get(sandboxTenantId);
    assert.equal(createdPatientStillExists, undefined, 'Custom created patient must be cleared by reset');
    const createdServiceStillExists = db.prepare(`SELECT id FROM services WHERE tenant_id = ? AND name = 'Consulta Teste Sandbox'`).get(sandboxTenantId);
    assert.equal(createdServiceStillExists, undefined, 'Custom created service must be cleared by reset');
    const baselinePatientsAfter = db.prepare(`SELECT COUNT(*) as c FROM patients WHERE tenant_id = ?`).get(sandboxTenantId).c;
    assert.ok(baselinePatientsAfter >= 2, 'Initial mock patients must be re-seeded after reset');

    // Core sandbox identities + audit logs + real clinic + Global Exercise Library preserved
    const mgrUserStillExists = db.prepare(`SELECT id, role FROM users WHERE id = ?`).get(managerUserId);
    assert.equal(mgrUserStillExists?.id, managerUserId, 'Gestor Sandbox identity must be preserved after reset');
    assert.equal(mgrUserStillExists?.role, 'clinic_admin');
    const realPatStillExists = db.prepare(`SELECT id FROM patients WHERE id = 'real-pat-1'`).get();
    assert.ok(realPatStillExists, 'Real clinic patient must NEVER be touched by reset');
    const globalExercisesAfter = db.prepare(`SELECT COUNT(*) as c FROM personal_exercises WHERE tenant_id = 'global' AND is_custom = 0`).get().c;
    assert.equal(globalExercisesAfter, globalExercisesBefore, 'Global Exercise Library count must remain untouched');
    if (sampleExercise) {
      assert.ok(db.prepare(`SELECT id FROM personal_exercises WHERE id = ?`).get(sampleExercise.id));
    }

    console.log('[7/9] Verifying storage failure fail-closed status reporting...');
    forceR2Fail = true;
    const failedReset = await call('/v1/sandbox/reset', { method: 'POST', token: mgrTok2 });
    forceR2Fail = false;
    assert.equal(failedReset.status, 500, 'Reset must fail closed when R2 storage cleanup fails');
    const statusAfterFail = await call('/v1/sandbox/status', { token: superToken });
    assert.equal(statusAfterFail.status, 200);
    assert.equal(statusAfterFail.body.status, 'error');
    assert.ok(statusAfterFail.body.lastError);

    // Recover cleanly with a successful reset
    assert.equal((await call('/v1/sandbox/reset', { method: 'POST', token: superToken })).status, 200);

    console.log('[8/9] Verifying outbound side effects are 100% suppressed in sandbox...');
    const emailSuppressed = await EmailService.sendEmailRaw({
      to: meMgr.body.user.email,
      subject: 'Teste Sandbox',
      html: '<p>Oi</p>'
    });
    assert.equal(emailSuppressed.success, true);
    assert.equal(emailSuppressed.messageId, 'sandbox-suppressed');

    const waSuppressed = await InfobipService.sendTextMessage('5511999999999', 'Mensagem Sandbox', {
      tenantId: sandboxTenantId
    });
    assert.equal(waSuppressed.success, true);
    assert.equal(waSuppressed.status?.name, 'SANDBOX_MOCK');

    const notifScheduleRes = await call('/v1/notifications/schedule', {
      method: 'POST',
      token: mgrTok2,
      body: {
        channel: 'whatsapp',
        recipient: '5511999999999',
        content: 'Lembrete teste'
      }
    });
    assert.equal(notifScheduleRes.status, 201);
    assert.equal(notifScheduleRes.body.sandboxSuppressed, true);

    // Even if a pending notification row exists for sandbox tenant, processPendingQueue suppresses it cleanly
    db.prepare(`
      INSERT INTO notifications (id, tenant_id, type, channel, recipient, content, status, scheduled_for)
      VALUES ('not-sbx-q1', ?, 'reminder_1h', 'email', 'any@example.com', 'Teste', 'pending', datetime('now', '-5 minutes'))
    `).run(sandboxTenantId);
    await NotificationService.processPendingQueue();
    const qRow = db.prepare(`SELECT status, delivery_status, last_error FROM notifications WHERE id = 'not-sbx-q1'`).get();
    assert.equal(qRow.status, 'cancelled');
    assert.equal(qRow.last_error, 'sandbox_suppressed');

    await TrialNotificationService.notifyTrialStarted(sandboxTenantId, meMgr.body.user.email, 'Gestor Sandbox', new Date().toISOString());
    assert.equal(AdminNotificationService.isSandbox({ tenantId: sandboxTenantId }), true);

    await assert.rejects(
      () => Promise.resolve().then(() => GoogleCalendarService.generateAuthUrl(sandboxTenantId, managerUserId, null)),
      /Teste|bloqueada/i
    );
    await GoogleCalendarService.syncAppointmentCreated('nonexistent-id', sandboxTenantId);

    const checkoutBlocked = await call('/v1/subscriptions/checkout', {
      method: 'POST',
      token: mgrTok2,
      body: { planCode: 'SOLO' }
    });
    assert.equal(checkoutBlocked.status, 403, 'Billing checkout must be rejected with 403 in sandbox');

    const trialBlocked = await call('/v1/subscriptions/start-trial', {
      method: 'POST',
      token: mgrTok2,
      body: { planCode: 'SOLO' }
    });
    assert.equal(trialBlocked.status, 403, 'Commercial solo trial start must be rejected with 403 in sandbox');

    console.log('[9/9] Verifying explicit session exit & token revocation...');
    const exitRes = await call('/v1/sandbox/exit', { method: 'POST', token: mgrTok2 });
    assert.equal(exitRes.status, 200);
    assert.equal(exitRes.body.success, true);

    const afterExitAuth = await call('/v1/auth/me', { token: mgrTok2 });
    assert.equal(afterExitAuth.status, 401);
    assert.equal(afterExitAuth.body.code, 'SANDBOX_SESSION_REVOKED');

    console.log('\nPASS: All 9 sandbox rearchitecture test suites succeeded!');
  } finally {
    await new Promise((r) => server.close(r));
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch (_) {}
  }
}

main().catch((err) => {
  console.error('\nFAIL:', err);
  process.exit(1);
});
