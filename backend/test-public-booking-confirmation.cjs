// Comprehensive verification of the public booking confirmation workflow across Clinic, Studio, and Mixed establishments.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-booking-confirm-'));
process.env.DATABASE_PATH = path.join(tempDir, 'test.db');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'public-booking-confirm-test-secret-2026';
process.env.RESEND_API_KEY = '';
process.env.GEMINI_API_KEY = '';

const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();
const billing = require('./dist/services/billing.service');
billing.canOperate = () => true;

const { migrateClinicBooking, migrateProfessionalSlugs } = require('./dist/config/slug-migration');
const { migrateIntegratedImprovements } = require('./dist/config/integrated-improvements-migration');
migrateIntegratedImprovements(db);

const { AppointmentController } = require('./dist/controllers/appointment.controller');
const { PackageController } = require('./dist/controllers/package.controller');
const { InternalNotificationController } = require('./dist/controllers/internal-notification.controller');
const { InternalNotificationService } = require('./dist/services/internal-notification.service');
const { requireRole } = require('./dist/middlewares/rbac.middleware');

function nextWeekdayYmd(targetDow, weeksAhead = 1) {
  const dt = new Date();
  dt.setUTCHours(12, 0, 0, 0);
  dt.setUTCDate(dt.getUTCDate() + weeksAhead * 7);
  while (dt.getUTCDay() !== targetDow) {
    dt.setUTCDate(dt.getUTCDate() + 1);
  }
  return dt.toISOString().slice(0, 10);
}

// Setup Tenants: Clinic, Studio, Mixed, and Other Clinic (isolation check)
const TENANT_CLINIC = 't-clinic-conf';
const TENANT_STUDIO = 't-studio-conf';
const TENANT_MIXED = 't-mixed-conf';
const TENANT_OTHER = 't-other-conf';

for (const [id, slug, name, profile] of [
  [TENANT_CLINIC, 'clinica-conf', 'Clínica Vida', 'clinic'],
  [TENANT_STUDIO, 'studio-conf', 'Studio Movimento', 'studio'],
  [TENANT_MIXED, 'misto-conf', 'Espaço Integrado', 'mixed'],
  [TENANT_OTHER, 'outra-conf', 'Clínica Externa', 'clinic']
]) {
  db.prepare(`
    INSERT INTO tenants (id, slug, name, trade_name, email, status, establishment_profile, public_booking_enabled, logo_url)
    VALUES (?, ?, ?, ?, ?, 'active', ?, 1, '/brand/zemda-logo.png')
  `).run(id, slug, name, name, `${slug}@test.invalid`, profile);
}
migrateClinicBooking(db);

// Helper to create user + clinic_users + optional professional
function seedUser({ userId, tenantId, name, email, role, isManager = 0 }) {
  db.prepare(`
    INSERT INTO users (id, tenant_id, name, email, password_hash, role, status)
    VALUES (?, ?, ?, ?, 'hash', ?, 'active')
  `).run(userId, tenantId, name, email, role);
  db.prepare(`
    INSERT INTO clinic_users (id, user_id, tenant_id, role, is_manager, status)
    VALUES (?, ?, ?, ?, ?, 'active')
  `).run('cu-' + userId, userId, tenantId, role, isManager);
}

seedUser({ userId: 'u-clinic-admin', tenantId: TENANT_CLINIC, name: 'Gestora Clínica', email: 'gestor@clinica.test', role: 'clinic_admin', isManager: 1 });
seedUser({ userId: 'u-clinic-prof1', tenantId: TENANT_CLINIC, name: 'Dr. Marcos', email: 'marcos@clinica.test', role: 'professional', isManager: 0 });
seedUser({ userId: 'u-clinic-prof2', tenantId: TENANT_CLINIC, name: 'Dra. Julia', email: 'julia@clinica.test', role: 'professional', isManager: 0 });
seedUser({ userId: 'u-clinic-recep', tenantId: TENANT_CLINIC, name: 'Recep Paula', email: 'paula@clinica.test', role: 'receptionist', isManager: 0 });

seedUser({ userId: 'u-studio-admin', tenantId: TENANT_STUDIO, name: 'Gestor Studio', email: 'gestor@studio.test', role: 'clinic_admin', isManager: 1 });
seedUser({ userId: 'u-studio-prof1', tenantId: TENANT_STUDIO, name: 'Prof. Carla', email: 'carla@studio.test', role: 'professional', isManager: 0 });
seedUser({ userId: 'u-studio-co', tenantId: TENANT_STUDIO, name: 'Co. Lucas', email: 'lucas@studio.test', role: 'professional', isManager: 0 });

seedUser({ userId: 'u-mixed-admin', tenantId: TENANT_MIXED, name: 'Gestora Misto', email: 'gestor@misto.test', role: 'clinic_admin', isManager: 1 });
seedUser({ userId: 'u-other-admin', tenantId: TENANT_OTHER, name: 'Outro Gestor', email: 'gestor@outra.test', role: 'clinic_admin', isManager: 1 });

for (const [profId, tenantId, userId, name, profType] of [
  ['prof-c1', TENANT_CLINIC, 'u-clinic-prof1', 'Dr. Marcos', 'prof-psicologia'],
  ['prof-c2', TENANT_CLINIC, 'u-clinic-prof2', 'Dra. Julia', 'prof-fisioterapia'],
  ['prof-s1', TENANT_STUDIO, 'u-studio-prof1', 'Prof. Carla', 'prof-educacao-fisica'],
  ['prof-s2', TENANT_STUDIO, 'u-studio-co', 'Prof. Lucas', 'prof-educacao-fisica'],
  ['prof-m1', TENANT_MIXED, null, 'Dr. Misto Clínico', 'prof-psicologia'],
  ['prof-m2', TENANT_MIXED, null, 'Prof. Misto Studio', 'prof-educacao-fisica']
]) {
  db.prepare(`
    INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, slug, public_booking_enabled, active)
    VALUES (?, ?, ?, ?, ?, ?, 1, 1)
  `).run(profId, tenantId, userId, name, profType, profId);
  for (let dow = 0; dow < 7; dow++) {
    db.prepare(`
      INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, break_start, break_end, is_active)
      VALUES (?, ?, ?, ?, '08:00', '18:00', '12:00', '13:00', 1)
    `).run(`${profId}-d-${dow}`, tenantId, profId, dow);
  }
}
migrateProfessionalSlugs(db);

// Clinic service
db.prepare(`
  INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, buffer_minutes, price, modality, service_domain, service_kind, min_lead_time_hours, max_advance_days, active)
  VALUES ('srv-clinic-1', ?, 'prof-c1', 'Consulta Psicológica', 50, 10, 180, 'both', 'clinic', 'individual', 0, 90, 1)
`).run(TENANT_CLINIC);

// Studio services: Individual + Group (cap=1 to test race!) + Recurring with frequency pricing
db.prepare(`
  INSERT INTO services (
    id, tenant_id, professional_id, name, duration_minutes, buffer_minutes, price, modality,
    service_domain, service_kind, default_capacity, billing_mode, allow_recurrence,
    allowed_recurrence_frequencies_json, default_recurrence_frequency,
    allowed_plan_durations_json, default_plan_duration, min_lead_time_hours, max_advance_days, active
  ) VALUES ('srv-studio-ind', ?, 'prof-s1', 'Personal Trainer', 60, 0, 120, 'presential', 'studio', 'individual', 1, 'per_session', 1, '["weekly"]', 'weekly', '["1_month"]', '1_month', 0, 90, 1)
`).run(TENANT_STUDIO);

const monDow = 1;
const wedDow = 3;
const freqPricingJson = JSON.stringify({
  version: 1,
  enabled: true,
  unit: 'per_period',
  tables: { monthly: { 1: 22000, 2: 38000 } }
});

db.prepare(`
  INSERT INTO services (
    id, tenant_id, professional_id, name, duration_minutes, buffer_minutes, price, modality,
    service_domain, service_kind, default_capacity, billing_mode, allow_recurrence,
    allowed_recurrence_frequencies_json, default_recurrence_frequency,
    allowed_plan_durations_json, default_plan_duration, frequency_pricing_json,
    min_lead_time_hours, max_advance_days, active
  ) VALUES ('srv-studio-grp', ?, 'prof-s1', 'Pilates Turma', 50, 0, 90, 'both', 'studio', 'group', 1, 'monthly', 1, '["weekly","custom_weekdays"]', 'custom_weekdays', '["1_month"]', '1_month', ?, 0, 90, 1)
`).run(TENANT_STUDIO, freqPricingJson);

const monDate = nextWeekdayYmd(monDow, 2);
db.prepare(`
  INSERT INTO class_schedules (id, tenant_id, service_id, professional_id, day_of_week, start_time, end_time, capacity, modality, effective_start_date, active)
  VALUES ('cs-pil-mon', ?, 'srv-studio-grp', 'prof-s1', ?, '08:00', '08:50', 1, 'online', '2025-01-01', 1)
`).run(TENANT_STUDIO, monDow);
db.prepare(`
  INSERT INTO class_schedules (id, tenant_id, service_id, professional_id, day_of_week, start_time, end_time, capacity, modality, effective_start_date, active)
  VALUES ('cs-pil-wed', ?, 'srv-studio-grp', 'prof-s1', ?, '08:00', '08:50', 2, 'presential', '2025-01-01', 1)
`).run(TENANT_STUDIO, wedDow);
db.prepare(`
  INSERT INTO class_schedule_instructors (id, tenant_id, schedule_id, professional_id, role)
  VALUES ('csi-1', ?, 'cs-pil-mon', 'prof-s2', 'co_instructor')
`).run(TENANT_STUDIO);

// Studio Package
db.prepare(`
  INSERT INTO service_packages (id, tenant_id, name, description, billing_type, price, credit_mode, total_credits, validity_days, active, allow_public_booking, created_by)
  VALUES ('pkg-studio-1', ?, 'Pacote 2x Pilates', 'Duas sessões', 'one_time', 160, 'per_service', 1, 60, 1, 1, 'u-studio-admin')
`).run(TENANT_STUDIO);
db.prepare(`
  INSERT INTO service_package_items (id, tenant_id, package_id, service_id, included_credits)
  VALUES ('pkgi-1', ?, 'pkg-studio-1', 'srv-studio-grp', 1)
`).run(TENANT_STUDIO);

// Mixed tenant services (1 clinic + 1 studio)
db.prepare(`
  INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, buffer_minutes, price, modality, service_domain, service_kind, min_lead_time_hours, max_advance_days, active)
  VALUES ('srv-mixed-clinic', ?, 'prof-m1', 'Avaliação Clínica Mista', 50, 10, 200, 'presential', 'clinic', 'individual', 0, 90, 1)
`).run(TENANT_MIXED);
db.prepare(`
  INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, buffer_minutes, price, modality, service_domain, service_kind, default_capacity, min_lead_time_hours, max_advance_days, active)
  VALUES ('srv-mixed-studio', ?, 'prof-m2', 'Treino Studio Misto', 60, 0, 110, 'presential', 'studio', 'individual', 1, 0, 90, 1)
`).run(TENANT_MIXED);

// Express App mirroring production RBAC for tests
const app = express();
app.use(express.json());
const api = express.Router();

const testAuth = (req, res, next) => {
  const hdr = req.headers.authorization || '';
  if (!hdr.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token ausente' });
    return;
  }
  const decoded = jwt.verify(hdr.slice(7), process.env.JWT_SECRET);
  req.user = decoded;
  req.tenantId = req.headers['x-tenant-id'] || decoded.tenantId;
  next();
};

api.post('/v1/public/appointments', AppointmentController.create);
api.post('/v1/public/studio/bookings', PackageController.createPublicStudioBooking);
api.get('/v1/internal-notifications/unread-count', testAuth, requireRole('clinic_admin', 'professional'), InternalNotificationController.unreadCount);
api.get('/v1/internal-notifications', testAuth, requireRole('clinic_admin', 'professional'), InternalNotificationController.list);
api.post('/v1/internal-notifications/mark-read', testAuth, requireRole('clinic_admin', 'professional'), InternalNotificationController.markRead);
api.post('/v1/internal-notifications/:id/confirm', testAuth, requireRole('clinic_admin', 'professional'), InternalNotificationController.confirm);
app.use('/api', api);

function makeToken(userId, tenantId, role, name = 'Test') {
  return jwt.sign({ userId, tenantId, role, name }, process.env.JWT_SECRET);
}

const server = app.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const reqJson = async (method, urlPath, body, token, tenantOverride) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (tenantOverride) headers['x-tenant-id'] = tenantOverride;
    const res = await fetch(base + urlPath, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { status: res.status, data };
  };

  try {
    const clinicSlug = db.prepare(`SELECT public_booking_slug, public_booking_sequence FROM tenants WHERE id = ?`).get(TENANT_CLINIC);
    const studioSlug = db.prepare(`SELECT public_booking_slug, public_booking_sequence FROM tenants WHERE id = ?`).get(TENANT_STUDIO);
    const mixedSlug = db.prepare(`SELECT public_booking_slug, public_booking_sequence FROM tenants WHERE id = ?`).get(TENANT_MIXED);

    const tokenClinicAdmin = makeToken('u-clinic-admin', TENANT_CLINIC, 'clinic_admin');
    const tokenClinicProf1 = makeToken('u-clinic-prof1', TENANT_CLINIC, 'professional');
    const tokenClinicProf2 = makeToken('u-clinic-prof2', TENANT_CLINIC, 'professional');
    const tokenClinicRecep = makeToken('u-clinic-recep', TENANT_CLINIC, 'receptionist');
    const tokenStudioAdmin = makeToken('u-studio-admin', TENANT_STUDIO, 'clinic_admin');
    const tokenStudioProf1 = makeToken('u-studio-prof1', TENANT_STUDIO, 'professional');
    const tokenStudioCo = makeToken('u-studio-co', TENANT_STUDIO, 'professional');
    const tokenMixedAdmin = makeToken('u-mixed-admin', TENANT_MIXED, 'clinic_admin');
    const tokenOtherAdmin = makeToken('u-other-admin', TENANT_OTHER, 'clinic_admin');

    // =========================================================================
    // 1. CLINIC PENDING REQUEST -> NO DEFINITIVE APPOINTMENT BEFORE CONFIRM
    // =========================================================================
    const clinicDate = nextWeekdayYmd(2, 2); // Tuesday
    const clinicReq1 = await reqJson('POST', '/v1/public/appointments', {
      tenantSlug: clinicSlug.public_booking_slug,
      bookingSequence: clinicSlug.public_booking_sequence,
      professionalId: 'prof-c1',
      serviceId: 'srv-clinic-1',
      startTime: `${clinicDate}T09:00:00`,
      endTime: `${clinicDate}T09:50:00`,
      modality: 'presential',
      newPatientData: { fullName: 'Maria Paciente', phone: '11991112222', email: 'maria@test.invalid' }
    });
    assert.equal(clinicReq1.status, 201, JSON.stringify(clinicReq1.data));
    assert.equal(clinicReq1.data.status, 'awaiting_confirmation');
    assert.equal(clinicReq1.data.requiresConfirmation, true);
    assert(clinicReq1.data.requestNumber.startsWith('SOL-'));
    assert.equal(db.prepare('SELECT COUNT(*) c FROM appointments WHERE tenant_id = ?').get(TENANT_CLINIC).c, 0, 'Zero definitive appointments while pending');
    assert.equal(db.prepare('SELECT COUNT(*) c FROM patients WHERE tenant_id = ?').get(TENANT_CLINIC).c, 0, 'Zero patient rows inserted prematurely');
    assert.equal(db.prepare('SELECT COUNT(*) c FROM payments WHERE tenant_id = ?').get(TENANT_CLINIC).c, 0, 'Zero payments before confirm');

    // Second competing clinic request for the SAME slot from another patient
    const clinicReqCompetitor = await reqJson('POST', '/v1/public/appointments', {
      tenantSlug: clinicSlug.public_booking_slug,
      bookingSequence: clinicSlug.public_booking_sequence,
      professionalId: 'prof-c1',
      serviceId: 'srv-clinic-1',
      startTime: `${clinicDate}T09:00:00`,
      endTime: `${clinicDate}T09:50:00`,
      modality: 'online',
      newPatientData: { fullName: 'João Concorrente', phone: '11993334444' }
    });
    assert.equal(clinicReqCompetitor.status, 201, 'Competing pending request allowed until one is confirmed');

    // Security checks on notifications & confirm
    assert.equal((await reqJson('GET', '/v1/internal-notifications', null, tokenClinicRecep)).status, 403, 'Reception-only denied');
    const adminListBefore = await reqJson('GET', '/v1/internal-notifications', null, tokenClinicAdmin);
    assert.equal(adminListBefore.status, 200);
    assert.equal(adminListBefore.data.notifications.length, 2);
    const notifForReq1 = adminListBefore.data.notifications.find(n => n.requestId === clinicReq1.data.requestId);
    const notifForCompetitor = adminListBefore.data.notifications.find(n => n.requestId === clinicReqCompetitor.data.requestId);
    assert.equal(notifForReq1.title, 'Nova solicitação de agendamento');
    assert.equal(notifForReq1.requestStatus, 'awaiting_confirmation');
    assert.equal(notifForReq1.appointmentId, null);

    // Unlinked professional (Dra. Julia) CANNOT view or confirm Dr. Marcos' request
    const prof2List = await reqJson('GET', '/v1/internal-notifications', null, tokenClinicProf2);
    assert.equal(prof2List.data.notifications.length, 0, 'Unlinked prof sees 0 notifications');
    assert.equal((await reqJson('POST', `/v1/internal-notifications/${notifForReq1.id}/confirm`, {}, tokenClinicProf2)).status, 403, 'Unlinked prof cannot confirm');
    assert.equal((await reqJson('POST', `/v1/internal-notifications/${notifForReq1.id}/confirm`, {}, tokenOtherAdmin)).status, 404, 'Other tenant cannot confirm');

    // Marking read MUST NOT confirm or remove pending notifications!
    const markRes = await reqJson('POST', '/v1/internal-notifications/mark-read', { markAll: true }, tokenClinicAdmin);
    assert.equal(markRes.status, 200);
    assert.equal(markRes.data.unreadCount, 0);
    assert.equal(markRes.data.activeCount, 2, 'Active count preserved while awaiting_confirmation');
    assert.equal(markRes.data.pendingCount, 2);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM appointments WHERE tenant_id = ?').get(TENANT_CLINIC).c, 0);

    // Pending notifications NEVER expire even if created_at is > 60 min ago
    db.prepare(`UPDATE internal_notifications SET created_at = '2025-01-01T10:00:00Z' WHERE tenant_id = ?`).run(TENANT_CLINIC);
    const stillPendingList = await reqJson('GET', '/v1/internal-notifications', null, tokenClinicAdmin);
    assert.equal(stillPendingList.data.notifications.length, 2, 'Old pending notifications never expire before confirmation');

    // Linked Prof1 (Dr. Marcos) sees and can confirm Req1
    const prof1List = await reqJson('GET', '/v1/internal-notifications', null, tokenClinicProf1);
    const prof1Notif1 = prof1List.data.notifications.find(n => n.requestId === clinicReq1.data.requestId);
    const [confWin, confLose] = await Promise.all([
      reqJson('POST', `/v1/internal-notifications/${prof1Notif1.id}/confirm`, {}, tokenClinicProf1),
      reqJson('POST', `/v1/internal-notifications/${notifForReq1.id}/confirm`, {}, tokenClinicAdmin)
    ]);
    assert.deepEqual([confWin.status, confLose.status].sort(), [200, 409], 'Simultaneous confirm race strictly prevented');
    const winBody = confWin.status === 200 ? confWin.data : confLose.data;
    assert(winBody.appointmentId, 'Definitive appointment created');
    assert(winBody.expiresAt && winBody.confirmedAt);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM appointments WHERE tenant_id = ?').get(TENANT_CLINIC).c, 1);
    const createdPayment = db.prepare('SELECT status, amount FROM payments WHERE appointment_id = ?').get(winBody.appointmentId);
    assert.equal(createdPayment.status, 'pending', 'Never marks payment as paid automatically');
    assert.equal(createdPayment.amount, 180);

    // Confirming competitor request on same now-occupied slot MUST fail with 409 conflict & zero extra rows
    const confCompetitor = await reqJson('POST', `/v1/internal-notifications/${notifForCompetitor.id}/confirm`, {}, tokenClinicAdmin);
    assert.equal(confCompetitor.status, 409);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM appointments WHERE tenant_id = ?').get(TENANT_CLINIC).c, 1);

    // Confirm notification updated across ALL recipients and survives F5 / read status during 10-min TTL
    const adminAfterConf = await reqJson('GET', '/v1/internal-notifications', null, tokenClinicAdmin);
    const updatedNotifForAdmin = adminAfterConf.data.notifications.find(n => n.requestId === clinicReq1.data.requestId);
    assert.equal(updatedNotifForAdmin.requestStatus, 'confirmed');
    assert.equal(updatedNotifForAdmin.appointmentId, winBody.appointmentId);
    assert(updatedNotifForAdmin.whatsappPhone);

    // Simulate > 10 minutes elapsed from confirmed_at: disappears from active bell while preserving DB history!
    db.prepare(`
      UPDATE internal_notifications
      SET confirmed_at = '2025-01-01T10:00:00.000Z', expires_at = '2025-01-01T10:10:00.000Z'
      WHERE request_id = ? AND tenant_id = ?
    `).run(clinicReq1.data.requestId, TENANT_CLINIC);
    const afterExpiry = await reqJson('GET', '/v1/internal-notifications', null, tokenClinicAdmin);
    assert(!afterExpiry.data.notifications.some(n => n.requestId === clinicReq1.data.requestId), 'Expired confirmed notification excluded after 10 min');
    assert.equal(db.prepare('SELECT COUNT(*) c FROM appointments WHERE id = ?').get(winBody.appointmentId).c, 1, 'Definitive appointment preserved');
    assert.equal(db.prepare("SELECT COUNT(*) c FROM public_booking_requests WHERE id = ? AND status = 'confirmed'").get(clinicReq1.data.requestId).c, 1, 'Request history preserved');

    // =========================================================================
    // 2. CLINIC BLOCK ADDED BETWEEN REQUEST & CONFIRM -> BLOCKS CONFIRMATION
    // =========================================================================
    const reqBlocked = await reqJson('POST', '/v1/public/appointments', {
      tenantSlug: clinicSlug.public_booking_slug,
      bookingSequence: clinicSlug.public_booking_sequence,
      professionalId: 'prof-c2',
      serviceId: 'srv-clinic-1'.replace('c1', 'c2'), // Wait: need service for prof-c2!
      startTime: `${clinicDate}T14:00:00`,
      endTime: `${clinicDate}T14:50:00`,
      modality: 'presential',
      newPatientData: { fullName: 'Teste Bloqueio', phone: '11995556666' }
    });
    // Expect 404 since prof-c2 wasn't linked to srv-clinic-1; let's test block on prof-c1 at 15:00!
    assert.equal(reqBlocked.status, 404);
    const reqForBlock = await reqJson('POST', '/v1/public/appointments', {
      tenantSlug: clinicSlug.public_booking_slug,
      bookingSequence: clinicSlug.public_booking_sequence,
      professionalId: 'prof-c1',
      serviceId: 'srv-clinic-1',
      startTime: `${clinicDate}T15:00:00`,
      endTime: `${clinicDate}T15:50:00`,
      modality: 'presential',
      newPatientData: { fullName: 'Paciente Bloqueio', phone: '11995556666' }
    });
    assert.equal(reqForBlock.status, 201);
    db.prepare(`INSERT INTO blocked_times (id, tenant_id, professional_id, title, start_datetime, end_datetime) VALUES ('blk-1', ?, 'prof-c1', 'Férias', ?, ?)`)
      .run(TENANT_CLINIC, `${clinicDate}T15:00:00`, `${clinicDate}T16:00:00`);
    const listBeforeBlock = await reqJson('GET', '/v1/internal-notifications', null, tokenClinicAdmin);
    const notifBlock = listBeforeBlock.data.notifications.find(n => n.requestId === reqForBlock.data.requestId);
    const confirmBlock = await reqJson('POST', `/v1/internal-notifications/${notifBlock.id}/confirm`, {}, tokenClinicAdmin);
    assert.equal(confirmBlock.status, 409, 'Block created after request must block confirmation');

    // =========================================================================
    // 3. STUDIO: RECURRING PLAN (CONSOLIDATED NOTIFICATION) + GROUP RACE + PACKAGE
    // =========================================================================
    const studioRecReq = await reqJson('POST', '/v1/public/studio/bookings', {
      tenantSlug: studioSlug.public_booking_slug,
      bookingSequence: studioSlug.public_booking_sequence,
      bookingIntent: 'recurring',
      mode: 'service',
      serviceId: 'srv-studio-grp',
      professionalId: 'prof-s1',
      classScheduleId: 'cs-pil-mon',
      modality: 'online',
      startTime: `${monDate}T08:00:00`,
      endTime: `${monDate}T08:50:00`,
      recurrence: {
        frequency: 'custom_weekdays',
        durationCode: '1_month',
        seriesMode: 'schedule_plan',
        scheduleEntries: [
          { weekday: monDow, startTime: '08:00', endTime: '08:50', classScheduleId: 'cs-pil-mon', professionalId: 'prof-s1', modality: 'online' },
          { weekday: wedDow, startTime: '08:00', endTime: '08:50', classScheduleId: 'cs-pil-wed', professionalId: 'prof-s1', modality: 'presential' }
        ],
        weekdays: [monDow, wedDow]
      },
      student: { fullName: 'Ana Aluna Recorrente', phone: '11988887777', whatsapp: '11988887777' }
    });
    assert.equal(studioRecReq.status, 201, JSON.stringify(studioRecReq.data));
    assert.equal(studioRecReq.data.status, 'awaiting_confirmation');
    assert.equal(studioRecReq.data.paymentPending, false, 'Must NOT return paymentPending on receipt');
    assert(studioRecReq.data.appointments.length > 2, 'Preview lists recurring slots');
    assert.equal(db.prepare('SELECT COUNT(*) c FROM appointments WHERE tenant_id = ?').get(TENANT_STUDIO).c, 0);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM recurring_billing_plans WHERE tenant_id = ?').get(TENANT_STUDIO).c, 0);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM class_series WHERE tenant_id = ?').get(TENANT_STUDIO).c, 0);

    // Duplicate same student pending request must be rejected cleanly
    const dupStudioReq = await reqJson('POST', '/v1/public/studio/bookings', {
      tenantSlug: studioSlug.public_booking_slug,
      bookingSequence: studioSlug.public_booking_sequence,
      bookingIntent: 'recurring',
      mode: 'service',
      serviceId: 'srv-studio-grp',
      professionalId: 'prof-s1',
      classScheduleId: 'cs-pil-mon',
      modality: 'online',
      startTime: `${monDate}T08:00:00`,
      endTime: `${monDate}T08:50:00`,
      recurrence: {
        frequency: 'custom_weekdays',
        durationCode: '1_month',
        seriesMode: 'schedule_plan',
        scheduleEntries: [
          { weekday: monDow, startTime: '08:00', endTime: '08:50', classScheduleId: 'cs-pil-mon', professionalId: 'prof-s1' },
          { weekday: wedDow, startTime: '08:00', endTime: '08:50', classScheduleId: 'cs-pil-wed', professionalId: 'prof-s1' }
        ],
        weekdays: [monDow, wedDow]
      },
      student: { fullName: 'Ana Aluna Recorrente', phone: '11988887777' }
    });
    assert.equal(dupStudioReq.status, 409);

    // Consolidated notification check: MUST be exactly 1 notification per authorized recipient!
    const studioAdminList = await reqJson('GET', '/v1/internal-notifications', null, tokenStudioAdmin);
    assert.equal(studioAdminList.data.notifications.length, 1, 'Multi-session recurring plan creates ONE consolidated notification');
    const recNotif = studioAdminList.data.notifications[0];
    assert.equal(recNotif.establishmentMode, 'studio');
    assert.equal(recNotif.weeklyFrequency, 2);
    assert(recNotif.planDurationLabel);
    assert.equal(recNotif.requestStatus, 'awaiting_confirmation');

    // Co-instructor (prof-s2 on cs-pil-mon) ALSO received the consolidated pending notification!
    const studioCoList = await reqJson('GET', '/v1/internal-notifications', null, tokenStudioCo);
    assert.equal(studioCoList.data.notifications.length, 1, 'Co-instructor receives pending notification');

    // Second student requests the SAME Monday capacity=1 class BEFORE first is confirmed
    const studioCapComp = await reqJson('POST', '/v1/public/studio/bookings', {
      tenantSlug: studioSlug.public_booking_slug,
      bookingSequence: studioSlug.public_booking_sequence,
      bookingIntent: 'single',
      mode: 'service',
      serviceId: 'srv-studio-grp',
      professionalId: 'prof-s1',
      classScheduleId: 'cs-pil-mon',
      modality: 'online',
      startTime: `${monDate}T08:00:00`,
      endTime: `${monDate}T08:50:00`,
      student: { fullName: 'Bruno Segundo', phone: '11977776666' }
    });
    assert.equal(studioCapComp.status, 201);

    // Prof1 confirms Ana's recurring plan -> creates class_series + recurring_billing_plan (R$ 380) + appointments + 1 initial cycle payment
    const studioProfList = await reqJson('GET', '/v1/internal-notifications', null, tokenStudioProf1);
    const profRecNotif = studioProfList.data.notifications.find(n => n.requestId === studioRecReq.data.requestId);
    const confStudioRec = await reqJson('POST', `/v1/internal-notifications/${profRecNotif.id}/confirm`, {}, tokenStudioProf1);
    assert.equal(confStudioRec.status, 200, JSON.stringify(confStudioRec.data));
    assert(confStudioRec.data.seriesId);
    assert(confStudioRec.data.billingPlanId);
    assert.equal(db.prepare('SELECT amount, weekly_frequency FROM recurring_billing_plans WHERE id = ?').get(confStudioRec.data.billingPlanId).amount, 380);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM appointments WHERE series_id = ?').get(confStudioRec.data.seriesId).c, studioRecReq.data.appointments.length);

    // Attempting to confirm Bruno's competing request for capacity=1 Monday class MUST fail with 409!
    const brunoNotif = (await reqJson('GET', '/v1/internal-notifications', null, tokenStudioAdmin)).data.notifications
      .find(n => n.requestId === studioCapComp.data.requestId);
    const confBruno = await reqJson('POST', `/v1/internal-notifications/${brunoNotif.id}/confirm`, {}, tokenStudioAdmin);
    assert.equal(confBruno.status, 409, 'Full capacity group class blocks confirming competing request');

    // Package request -> Zero contracts until confirmed -> Confirm creates contract + reserved entitlement
    const pkgDate = nextWeekdayYmd(wedDow, 5);
    const pkgReq = await reqJson('POST', '/v1/public/studio/bookings', {
      tenantSlug: studioSlug.public_booking_slug,
      bookingSequence: studioSlug.public_booking_sequence,
      mode: 'package',
      packageId: 'pkg-studio-1',
      schedules: [
        {
          serviceId: 'srv-studio-grp',
          professionalId: 'prof-s1',
          classScheduleId: 'cs-pil-wed',
          modality: 'presential',
          startTime: `${pkgDate}T08:00:00`,
          endTime: `${pkgDate}T08:50:00`
        }
      ],
      student: { fullName: 'Carlos Pacote', phone: '11966665555' }
    });
    assert.equal(pkgReq.status, 201, JSON.stringify(pkgReq.data));
    assert.equal(pkgReq.data.paymentPending, false);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM student_package_contracts WHERE tenant_id = ?').get(TENANT_STUDIO).c, 0);
    const pkgNotif = (await reqJson('GET', '/v1/internal-notifications', null, tokenStudioAdmin)).data.notifications
      .find(n => n.requestId === pkgReq.data.requestId);
    const confPkg = await reqJson('POST', `/v1/internal-notifications/${pkgNotif.id}/confirm`, {}, tokenStudioAdmin);
    assert.equal(confPkg.status, 200, JSON.stringify(confPkg.data));
    assert(confPkg.data.contractId);
    assert.equal(db.prepare('SELECT payment_status FROM student_package_contracts WHERE id = ?').get(confPkg.data.contractId).payment_status, 'pending');

    // =========================================================================
    // 4. MIXED ESTABLISHMENT DOMAIN ROUTING (CLINIC VS STUDIO)
    // =========================================================================
    const mixedClinicReq = await reqJson('POST', '/v1/public/appointments', {
      tenantSlug: mixedSlug.public_booking_slug,
      bookingSequence: mixedSlug.public_booking_sequence,
      professionalId: 'prof-m1',
      serviceId: 'srv-mixed-clinic',
      startTime: `${clinicDate}T10:00:00`,
      endTime: `${clinicDate}T10:50:00`,
      modality: 'presential',
      newPatientData: { fullName: 'Laura Misto Clínica', phone: '11955554444' }
    });
    assert.equal(mixedClinicReq.status, 201);

    const mixedStudioReq = await reqJson('POST', '/v1/public/studio/bookings', {
      tenantSlug: mixedSlug.public_booking_slug,
      bookingSequence: mixedSlug.public_booking_sequence,
      mode: 'service',
      serviceId: 'srv-mixed-studio',
      professionalId: 'prof-m2',
      modality: 'presential',
      startTime: `${clinicDate}T11:00:00`,
      endTime: `${clinicDate}T12:00:00`,
      student: { fullName: 'Pedro Misto Studio', phone: '11944443333' }
    });
    assert.equal(mixedStudioReq.status, 201);

    const mixedList = await reqJson('GET', '/v1/internal-notifications', null, tokenMixedAdmin);
    const nMixedClinic = mixedList.data.notifications.find(n => n.requestId === mixedClinicReq.data.requestId);
    const nMixedStudio = mixedList.data.notifications.find(n => n.requestId === mixedStudioReq.data.requestId);
    assert.equal(nMixedClinic.establishmentMode, 'clinic');
    assert.equal(nMixedStudio.establishmentMode, 'studio');
    assert.equal((await reqJson('POST', `/v1/internal-notifications/${nMixedClinic.id}/confirm`, {}, tokenMixedAdmin)).status, 200);
    assert.equal((await reqJson('POST', `/v1/internal-notifications/${nMixedStudio.id}/confirm`, {}, tokenMixedAdmin)).status, 200);

    console.log('PASS: All Clinic, Studio, Mixed, RBAC, Concurrency, Capacity, Block, Recurring Plan, Package, and 10-min TTL expiration checks passed!');
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
