const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.resolve(__dirname, 'test_studio_recurrence_coinstructors.db');
process.env.DATABASE_PATH = DB_PATH;
process.env.JWT_SECRET = 'test-studio-rec-coinst-secret-2026';
process.env.ZEMDA_FILES_SIGNING_SECRET = 'test-studio-rec-coinst-files-2026';
const TEST_PORT = 3119;
process.env.PORT = String(TEST_PORT);

for (const ext of ['', '-wal', '-shm']) {
  if (fs.existsSync(DB_PATH + ext)) {
    fs.unlinkSync(DB_PATH + ext);
  }
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');
const express = require('express');
const app = express();
app.use(express.json());
app.use('/api', require('./dist/routes').default);

let passed = 0;
let failed = 0;

function assert(cond, msg, detail) {
  if (cond) {
    console.log(`  [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${msg}${detail !== undefined ? ' -> ' + JSON.stringify(detail).slice(0, 500) : ''}`);
    failed++;
  }
}

function makeReq(method, reqPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: reqPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      },
      res => {
        let data = '';
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {}, raw: data });
          } catch {
            resolve({ status: res.statusCode, data, raw: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (body !== null) req.write(JSON.stringify(body));
    req.end();
  });
}

function getNextWeekdayIso(targetDow, weekOffset = 1) {
  const now = new Date(Date.now() - 3 * 3600 * 1000);
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
  const diff = (targetDow - base.getUTCDay() + 7) % 7 || 7;
  base.setUTCDate(base.getUTCDate() + diff + (weekOffset - 1) * 7);
  return base.toISOString().slice(0, 10);
}

function addDaysIso(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0)).toISOString().slice(0, 10);
}

function getIsoDow(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

async function runTests() {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(TEST_PORT, resolve));

  console.log('\n=========================================================================================');
  console.log('TESTES COMPLETOS: Separação Frequência x Duração + Grade Multi-Horário + Co-Instrutores & Folha');
  console.log('=========================================================================================\n');

  try {
    const studioId = 'ten-rec-' + uuidv4().slice(0, 6);
    const otherStudioId = 'ten-oth-' + uuidv4().slice(0, 6);
    const clinicId = 'ten-cli-' + uuidv4().slice(0, 6);

    let profType = db.prepare(`SELECT id FROM professions WHERE lower(name) = lower('Educação Física')`).get()?.id;
    if (!profType) {
      profType = 'prof-type-' + uuidv4().slice(0, 6);
      db.prepare(`INSERT OR IGNORE INTO professions (id, name) VALUES (?, 'Educação Física')`).run(profType);
    }

    const hours = JSON.stringify({
      monday: { enabled: true, open: '07:00', close: '22:00' },
      tuesday: { enabled: true, open: '07:00', close: '22:00' },
      wednesday: { enabled: true, open: '07:00', close: '22:00' },
      thursday: { enabled: true, open: '07:00', close: '22:00' },
      friday: { enabled: true, open: '07:00', close: '22:00' },
      saturday: { enabled: true, open: '08:00', close: '14:00' },
      sunday: { enabled: false, open: '08:00', close: '12:00' }
    });

    const insTenant = db.prepare(`
      INSERT INTO tenants (
        id, name, trade_name, slug, email, status, billing_required,
        public_booking_enabled, establishment_profile, business_hours_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'active', 0, 1, ?, ?, datetime('now'), datetime('now'))
    `);
    insTenant.run(studioId, 'Studio Zen Pilates', 'Studio Zen Pilates', 'studio-zen-rec', 'zen@studio.test', 'studio', hours);
    insTenant.run(otherStudioId, 'Outro Studio Isolado', 'Outro Studio', 'outro-studio-rec', 'outro@rec.test', 'studio', hours);
    insTenant.run(clinicId, 'Clínica Médica Padrão', 'Clínica Padrão', 'clinica-padrao-rec', 'cli@rec.test', 'clinic', hours);

    const admUserId = 'usr-adm-' + uuidv4().slice(0, 6);
    const profUser1 = 'usr-p1-' + uuidv4().slice(0, 6);
    const profUser2 = 'usr-p2-' + uuidv4().slice(0, 6);
    const profUser3 = 'usr-p3-' + uuidv4().slice(0, 6);

    const insUser = db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, 'h', ?, 'active')`);
    insUser.run(admUserId, studioId, 'Admin Zen', 'adm@zen.test', 'clinic_admin');
    insUser.run(profUser1, studioId, 'Instrutor Bruno', 'bruno@zen.test', 'professional');
    insUser.run(profUser2, studioId, 'Instrutora Carla', 'carla@zen.test', 'professional');
    insUser.run(profUser3, studioId, 'Instrutor Diego', 'diego@zen.test', 'professional');

    const insCU = db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json) VALUES (?, ?, ?, ?, 'active', ?, ?)`);
    for (const tid of [studioId, otherStudioId, clinicId]) {
      insCU.run('cu-' + uuidv4().slice(0, 8), tid, admUserId, 'clinic_admin', 1, '["manage_services","view_financial","view_schedule","manage_patients"]');
    }
    insCU.run('cu-' + uuidv4().slice(0, 8), studioId, profUser2, 'professional', 0, '["view_schedule"]');

    const authStudio = {
      Authorization: `Bearer ${generateToken({ userId: admUserId, tenantId: studioId, email: 'adm@zen.test', role: 'clinic_admin' })}`,
      'x-tenant-id': studioId
    };
    const authProf2 = {
      Authorization: `Bearer ${generateToken({ userId: profUser2, tenantId: studioId, email: 'carla@zen.test', role: 'professional' })}`,
      'x-tenant-id': studioId
    };
    const authClinic = {
      Authorization: `Bearer ${generateToken({ userId: admUserId, tenantId: clinicId, email: 'adm@zen.test', role: 'clinic_admin' })}`,
      'x-tenant-id': clinicId
    };

    const prof1 = 'prof-1-' + uuidv4().slice(0, 6);
    const prof2 = 'prof-2-' + uuidv4().slice(0, 6);
    const prof3 = 'prof-3-' + uuidv4().slice(0, 6);
    const profOther = 'prof-oth-' + uuidv4().slice(0, 6);
    const profClinic = 'prof-cli-' + uuidv4().slice(0, 6);

    const insProf = db.prepare(`
      INSERT INTO professionals (
        id, tenant_id, user_id, name, slug, profession_id, profession_name,
        active, public_booking_enabled, remuneration_type, commission_percentage, fixed_salary
      ) VALUES (?, ?, ?, ?, ?, ?, 'Educador Físico', 1, 1, 'commission', ?, 0)
    `);
    insProf.run(prof1, studioId, profUser1, 'Instrutor Bruno', 'bruno-zen', profType, 50);
    insProf.run(prof2, studioId, profUser2, 'Instrutora Carla', 'carla-zen', profType, 30);
    insProf.run(prof3, studioId, profUser3, 'Instrutor Diego', 'diego-zen', profType, 60);
    insProf.run(profOther, otherStudioId, null, 'Instrutor Outro', 'outro-zen', profType, 50);
    insProf.run(profClinic, clinicId, null, 'Dr. Clínica', 'dr-clinica', profType, 40);

    const insSched = db.prepare(`INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active) VALUES (?, ?, ?, ?, '07:00', '22:00', 1)`);
    for (let dow = 1; dow <= 6; dow++) {
      insSched.run(uuidv4(), studioId, prof1, dow);
      insSched.run(uuidv4(), studioId, prof2, dow);
      insSched.run(uuidv4(), studioId, prof3, dow);
      insSched.run(uuidv4(), otherStudioId, profOther, dow);
      insSched.run(uuidv4(), clinicId, profClinic, dow);
    }

    const pat1 = 'pat-1-' + uuidv4().slice(0, 6);
    const pat2 = 'pat-2-' + uuidv4().slice(0, 6);
    const pat3 = 'pat-3-' + uuidv4().slice(0, 6);
    const patCli = 'pat-cli-' + uuidv4().slice(0, 6);
    const insPat = db.prepare(`INSERT INTO patients (id, tenant_id, full_name, phone, cpf, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`);
    insPat.run(pat1, studioId, 'Aluna Helena', '11990001001', '10000000001');
    insPat.run(pat2, studioId, 'Aluno Igor', '11990001002', '10000000002');
    insPat.run(pat3, studioId, 'Aluna Júlia', '11990001003', '10000000003');
    insPat.run(patCli, clinicId, 'Paciente Clínica', '11990001099', '10000000099');

    // =========================================================================
    // 1. SERVIÇO COLETIVO COM DURAÇÕES PERMITIDAS + GRADE COM CO-INSTRUTORES
    // =========================================================================
    console.log('1) Serviço Studio: Frequência vs Duração de Plano + Grade Multi-Horário com Co-Instrutores...');

    const resGroupSrv = await makeReq('POST', '/api/v1/services', authStudio, {
      name: 'Pilates Studio Coletivo',
      durationMinutes: 60,
      price: 100,
      modality: 'presential',
      serviceKind: 'group',
      serviceDomain: 'studio',
      defaultCapacity: 4,
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['weekly', 'biweekly'],
      defaultRecurrenceFrequency: 'weekly',
      allowedPlanDurations: ['1_month', '3_months', '6_months', '12_months', '24_months', 'custom_date', 'count'],
      defaultPlanDuration: '12_months',
      professionalId: prof1,
      professionalIds: [prof1, prof2]
    });
    assert(resGroupSrv.status === 201, 'Cria serviço coletivo com allowedPlanDurations e defaultPlanDuration', resGroupSrv.data);
    const groupSrvId = resGroupSrv.data.id;

    // Verificar persistência ao listar
    const resListSrvs = await makeReq('GET', '/api/v1/services', authStudio);
    const fetchedGroup = (resListSrvs.data || []).find(s => s.id === groupSrvId);
    assert(
      fetchedGroup &&
        Array.isArray(fetchedGroup.allowed_plan_durations) &&
        fetchedGroup.allowed_plan_durations.includes('12_months') &&
        fetchedGroup.default_plan_duration === '12_months',
      'GET /v1/services retorna allowed_plan_durations e default_plan_duration corretamente',
      fetchedGroup
    );

    // Grade semanal:
    // - Segunda (1) 08:00-09:00 | Titular: Bruno (prof1) | Coinstrutor: Carla (prof2)
    // - Quarta  (3) 18:00-19:00 | Titular: Carla (prof2) | Coinstrutor: Bruno (prof1)
    const resSchedMon = await makeReq('POST', `/api/v1/services/${groupSrvId}/class-schedules`, authStudio, {
      dayOfWeek: 1,
      startTime: '08:00',
      endTime: '09:00',
      professionalId: prof1,
      coInstructorIds: [prof2],
      capacity: 4,
      modality: 'presential'
    });
    const resSchedWed = await makeReq('POST', `/api/v1/services/${groupSrvId}/class-schedules`, authStudio, {
      dayOfWeek: 3,
      startTime: '18:00',
      endTime: '19:00',
      professionalId: prof2,
      coInstructorIds: [prof1],
      capacity: 4,
      modality: 'presential'
    });
    assert(
      resSchedMon.status === 201 && resSchedWed.status === 201,
      'Cria grade Segunda 08:00 (Bruno + Carla) e Quarta 18:00 (Carla + Bruno)',
      { mon: resSchedMon.data, wed: resSchedWed.data }
    );
    const schedMonId = resSchedMon.data.created?.[0]?.id;
    const schedWedId = resSchedWed.data.created?.[0]?.id;

    const resGetScheds = await makeReq('GET', `/api/v1/services/${groupSrvId}/class-schedules`, authStudio);
    const schedMonLoaded = (resGetScheds.data?.schedules || []).find(s => s.id === schedMonId);
    assert(
      schedMonLoaded &&
        Array.isArray(schedMonLoaded.co_instructor_ids) &&
        schedMonLoaded.co_instructor_ids.includes(prof2) &&
        Array.isArray(schedMonLoaded.co_instructors) &&
        schedMonLoaded.co_instructors.some(i => i.professionalId === prof2 && i.role === 'co_instructor'),
      'GET /v1/services/:id/class-schedules retorna equipe (primary + co_instructor)',
      schedMonLoaded
    );

    // =========================================================================
    // 2. SEPARAÇÃO FREQUÊNCIA x DURAÇÃO + MULTI-HORÁRIO + NOVOS LIMITES + CANCELAMENTO
    // =========================================================================
    console.log('\n2) Frequência Semanal x Duração Anual / Trimestral / Quinzenal + Multi-Horário...');

    const nextMonday = getNextWeekdayIso(1, 2); // segunda futura
    const nextWed = addDaysIso(nextMonday, 2);

    // Preview Semanal Seg+Qua por 12_months (Anual -> ~104-105 aulas, NÃO 1 por ano!)
    const resPreviewAnnual = await makeReq('POST', '/api/v1/appointments/recurrence-preview', authStudio, {
      patientId: pat1,
      professionalId: prof1,
      serviceId: groupSrvId,
      startTime: `${nextMonday}T08:00:00`,
      endTime: `${nextMonday}T09:00:00`,
      modality: 'presential',
      recurrence: {
        frequency: 'weekly',
        weekdays: [1, 3],
        durationCode: '12_months',
        seriesMode: 'schedule_plan',
        scheduleEntries: [
          { classScheduleId: schedMonId, dayOfWeek: 1, startTime: '08:00', endTime: '09:00', professionalId: prof1, coInstructorIds: [prof2], modality: 'presential' },
          { classScheduleId: schedWedId, dayOfWeek: 3, startTime: '18:00', endTime: '19:00', professionalId: prof2, coInstructorIds: [prof1], modality: 'presential' }
        ]
      }
    });
    assert(
      resPreviewAnnual.status === 200 &&
        resPreviewAnnual.data.totalCount >= 100 &&
        resPreviewAnnual.data.totalCount <= 108 &&
        resPreviewAnnual.data.seriesMode === 'schedule_plan' &&
        resPreviewAnnual.data.durationCode === '12_months',
      'Preview Semanal (Seg+Qua) + Plano Anual (12_months) gera ~104 aulas (nunca 1 aula por ano)',
      { totalCount: resPreviewAnnual.data.totalCount, seriesMode: resPreviewAnnual.data.seriesMode, durationCode: resPreviewAnnual.data.durationCode }
    );

    const monItem = (resPreviewAnnual.data.occurrences || []).find(i => getIsoDow(i.date) === 1);
    const wedItem = (resPreviewAnnual.data.occurrences || []).find(i => getIsoDow(i.date) === 3);
    assert(
      monItem && monItem.startTime.includes('T08:00') && monItem.professionalId === prof1 &&
        wedItem && wedItem.startTime.includes('T18:00') && wedItem.professionalId === prof2,
      'Preview multi-grade preserva 08:00+Bruno na Segunda e 18:00+Carla na Quarta',
      { monItem, wedItem }
    );

    // Preview Quinzenal + 6_months (~13 aulas para Seg)
    const resPreviewBiweekly6m = await makeReq('POST', '/api/v1/appointments/recurrence-preview', authStudio, {
      patientId: pat1,
      professionalId: prof1,
      serviceId: groupSrvId,
      startTime: `${nextMonday}T08:00:00`,
      endTime: `${nextMonday}T09:00:00`,
      modality: 'presential',
      recurrence: {
        frequency: 'biweekly',
        durationCode: '6_months',
        seriesMode: 'schedule_plan'
      }
    });
    assert(
      resPreviewBiweekly6m.status === 200 &&
        resPreviewBiweekly6m.data.totalCount >= 12 &&
        resPreviewBiweekly6m.data.totalCount <= 14,
      'Preview Quinzenal + Semestral (6_months) gera ~13 aulas a cada 14 dias',
      { totalCount: resPreviewBiweekly6m.data.totalCount }
    );

    // Efetivar criação da série Anual (Semanal Seg+Qua, 12 meses) para Aluna Helena (pat1)
    const resBookAnnual = await makeReq('POST', '/api/v1/appointments/recurring', authStudio, {
      patientId: pat1,
      professionalId: prof1,
      serviceId: groupSrvId,
      startTime: `${nextMonday}T08:00:00`,
      endTime: `${nextMonday}T09:00:00`,
      modality: 'presential',
      recurrence: {
        frequency: 'weekly',
        weekdays: [1, 3],
        durationCode: '12_months',
        seriesMode: 'schedule_plan',
        scheduleEntries: [
          { classScheduleId: schedMonId, dayOfWeek: 1, startTime: '08:00', endTime: '09:00', professionalId: prof1, coInstructorIds: [prof2], modality: 'presential' },
          { classScheduleId: schedWedId, dayOfWeek: 3, startTime: '18:00', endTime: '19:00', professionalId: prof2, coInstructorIds: [prof1], modality: 'presential' }
        ]
      }
    });
    assert(
      resBookAnnual.status === 201 && resBookAnnual.data.createdCount >= 100 && resBookAnnual.data.durationCode === '12_months',
      'POST /v1/appointments/recurring cria série anual semanal Seg+Qua com >100 aulas sem erro',
      { createdCount: resBookAnnual.data.createdCount, seriesId: resBookAnnual.data.seriesId, error: resBookAnnual.data.error }
    );
    const annualSeriesId = resBookAnnual.data.seriesId;

    // Verificar class_series persistida com metadata e session_instructor_participants herdado
    const seriesRow = db.prepare(`SELECT series_mode, plan_duration_code FROM class_series WHERE id = ?`).get(annualSeriesId);
    assert(
      seriesRow && seriesRow.series_mode === 'schedule_plan' && seriesRow.plan_duration_code === '12_months',
      'class_series persiste series_mode = schedule_plan e plan_duration_code = 12_months',
      seriesRow
    );

    const firstMonAppt = db.prepare(`
      SELECT id, occurrence_id, professional_id, start_time FROM appointments
      WHERE series_id = ? AND date(start_time) = ?
    `).get(annualSeriesId, nextMonday);
    const firstWedAppt = db.prepare(`
      SELECT id, occurrence_id, professional_id, start_time FROM appointments
      WHERE series_id = ? AND date(start_time) = ?
    `).get(annualSeriesId, nextWed);

    assert(
      firstMonAppt && firstMonAppt.professional_id === prof1 && firstMonAppt.start_time.includes('T08:00') &&
        firstWedAppt && firstWedAppt.professional_id === prof2 && firstWedAppt.start_time.includes('T18:00'),
      'Agendamentos gravados preservam horários e titulares distintos por dia da semana',
      { firstMonAppt, firstWedAppt }
    );

    const monParts = db.prepare(`SELECT professional_id, role, attendance_status FROM session_instructor_participants WHERE occurrence_id = ?`).all(firstMonAppt.occurrence_id);
    assert(
      monParts.some(p => p.professional_id === prof1 && p.role === 'primary') &&
        monParts.some(p => p.professional_id === prof2 && p.role === 'co_instructor'),
      'Ocorrência gerada herda Titular + Coinstrutor da grade semanal',
      monParts
    );

    // Agendamento público trimestral Seg+Qua (> 24 aulas, dentro do novo cap 260)
    const nextMonWeek3 = addDaysIso(nextMonday, 14);
    const resPublicQuarterly = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'studio-zen-rec',
      mode: 'service',
      serviceId: groupSrvId,
      professionalId: prof1,
      modality: 'presential',
      startTime: `${nextMonWeek3}T08:00:00`,
      endTime: `${nextMonWeek3}T09:00:00`,
      recurrence: {
        frequency: 'weekly',
        weekdays: [1, 3],
        durationCode: '3_months',
        seriesMode: 'schedule_plan',
        scheduleEntries: [
          { classScheduleId: schedMonId, dayOfWeek: 1, startTime: '08:00', endTime: '09:00', professionalId: prof1, coInstructorIds: [prof2], modality: 'presential' },
          { classScheduleId: schedWedId, dayOfWeek: 3, startTime: '18:00', endTime: '19:00', professionalId: prof2, coInstructorIds: [prof1], modality: 'presential' }
        ]
      },
      student: { fullName: 'Aluna Trimestral Pública', phone: '11988887777' }
    });
    const publicQtyCount = Array.isArray(resPublicQuarterly.data?.appointments) ? resPublicQuarterly.data.appointments.length : 0;
    assert(
      resPublicQuarterly.status === 201 && publicQtyCount >= 25 && publicQtyCount <= 28,
      'Agendamento público aceita série trimestral Seg+Qua (>24 ocorrências, cap 260)',
      resPublicQuarterly.data
    );

    // Preservar aulas concluídas em cancelamento 'series' & 'this_and_following' + atomicidade em conflito
    const resIndSrv = await makeReq('POST', '/api/v1/services', authStudio, {
      name: 'Personal Dual Individual',
      durationMinutes: 60,
      price: 200,
      modality: 'presential',
      serviceKind: 'individual',
      serviceDomain: 'studio',
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['weekly'],
      defaultRecurrenceFrequency: 'weekly',
      allowedPlanDurations: ['1_month', '3_months', 'count'],
      defaultPlanDuration: '1_month',
      professionalId: prof3,
      professionalIds: [prof3, prof2]
    });
    assert(resIndSrv.status === 201, 'Cria serviço individual Studio para testes de co-instrutor e cancelamento', resIndSrv.data);
    const indSrvId = resIndSrv.data.id;

    // Criar agendamento conflitante na 3ª quarta futura para testar atomicidade (strictConflicts: true)
    const blockDay = addDaysIso(nextWed, 14);
    const conflictApptId = uuidv4();
    db.prepare(`
      INSERT INTO appointments (
        id, appointment_number, tenant_id, patient_id, professional_id, service_id,
        start_time, end_time, status, modality, created_at
      ) VALUES (?, 'AG-8999', ?, ?, ?, ?, ?, ?, 'scheduled', 'presential', datetime('now'))
    `).run(conflictApptId, studioId, pat1, prof3, indSrvId, `${blockDay}T10:00:00`, `${blockDay}T11:00:00`);

    const countBeforeAtomic = db.prepare(`SELECT COUNT(*) AS cnt FROM appointments WHERE patient_id = ?`).get(pat2).cnt;
    const resAtomicConflict = await makeReq('POST', '/api/v1/appointments/recurring', authStudio, {
      patientId: pat2,
      professionalId: prof3,
      serviceId: indSrvId,
      startTime: `${nextWed}T10:00:00`,
      endTime: `${nextWed}T11:00:00`,
      modality: 'presential',
      recurrence: {
        frequency: 'weekly',
        durationCode: 'count',
        maxOccurrences: 4,
        strictConflicts: true
      }
    });
    const countAfterAtomic = db.prepare(`SELECT COUNT(*) AS cnt FROM appointments WHERE patient_id = ?`).get(pat2).cnt;
    assert(
      resAtomicConflict.status === 409 && countBeforeAtomic === countAfterAtomic,
      'Conflito parcial com strictConflicts=true aborta criação atomicamente (0 agendamentos residuais)',
      { status: resAtomicConflict.status, countBeforeAtomic, countAfterAtomic }
    );

    // Remover agendamento conflitante após validar atomicidade
    db.prepare(`DELETE FROM appointments WHERE id = ?`).run(conflictApptId);

    // Série com 4 aulas para testar preservação de concluída ao cancelar a série (mês futuro isolado)
    const nextThu = getNextWeekdayIso(4, 9);
    const resCancelSeriesSetup = await makeReq('POST', '/api/v1/appointments/recurring', authStudio, {
      patientId: pat2,
      professionalId: prof3,
      serviceId: indSrvId,
      startTime: `${nextThu}T14:00:00`,
      endTime: `${nextThu}T15:00:00`,
      modality: 'presential',
      coInstructorIds: [prof2],
      recurrence: { frequency: 'weekly', durationCode: 'count', maxOccurrences: 4 }
    });
    assert(
      resCancelSeriesSetup.status === 201 && resCancelSeriesSetup.data.createdCount === 4,
      'Cria série de 4 aulas individuais com coinstrutor Carla',
      resCancelSeriesSetup.data
    );
    const createdApptIds = (resCancelSeriesSetup.data.appointments || []).map(a => a.id);

    // Marcar 1ª aula como 'completed' para validar preservação histórica no cancelamento em série
    db.prepare(`UPDATE appointments SET status = 'completed' WHERE id = ?`).run(createdApptIds[0]);
    // Cancelar usando escopo 'series' pela 2ª aula (deve preservar a 1ª concluída)
    const resCancelRest = await makeReq('PUT', `/api/v1/appointments/${createdApptIds[1]}/status`, authStudio, {
      status: 'cancelled',
      cancelScope: 'series'
    });
    assert(resCancelRest.status === 200, 'Cancela série preservando aulas concluídas', resCancelRest.data);
    const appt0St = db.prepare(`SELECT status FROM appointments WHERE id = ?`).get(createdApptIds[0]).status;
    const appt1St = db.prepare(`SELECT status FROM appointments WHERE id = ?`).get(createdApptIds[1]).status;
    const appt3St = db.prepare(`SELECT status FROM appointments WHERE id = ?`).get(createdApptIds[3]).status;
    assert(
      appt0St === 'completed' && appt1St === 'cancelled' && appt3St === 'cancelled',
      'Cancelamento da série manteve aula 1 como completed e cancelou apenas futuras',
      { appt0St, appt1St, appt3St }
    );

    // =========================================================================
    // 3. ZEMDAPERSONAL: VISIBILIDADE DO CO-INSTRUTOR, CONFIRMAÇÃO E AUDITORIA
    // =========================================================================
    console.log('\n3) ZemdaPersonal: Participação de Instrutores, Ausência e Auditoria...');

    const targetMonth = new Date().toISOString().slice(0, 7);
    const todayDate = new Date().toISOString().slice(0, 10);
    // Criar 2 ocorrências no mês atual para apurar folha no período corrente:
    // Ocorrência A (hoje): Pilates Studio Coletivo (R$ 100 por aluno x 2 alunos = R$ 200), Bruno (primary, 50% = R$ 100) + Carla (co_instructor, R$ 40 fixo/aula)
    // Ocorrência B (hoje 18h): Pilates Studio Coletivo (1 aluno R$ 100), Bruno (primary) + Carla (co_instructor -> MARCADA AUSENTE!)
    const occA = 'occ-a-' + uuidv4().slice(0, 6);
    const occB = 'occ-b-' + uuidv4().slice(0, 6);

    const insOcc = db.prepare(`
      INSERT INTO class_occurrences (id, tenant_id, service_id, professional_id, start_time, end_time, capacity, modality, status)
      VALUES (?, ?, ?, ?, ?, ?, 4, 'presential', 'scheduled')
    `);
    insOcc.run(occA, studioId, groupSrvId, prof1, `${todayDate}T09:00:00`, `${todayDate}T10:00:00`);
    insOcc.run(occB, studioId, groupSrvId, prof1, `${todayDate}T18:00:00`, `${todayDate}T19:00:00`);

    const insAppt = db.prepare(`
      INSERT INTO appointments (
        id, appointment_number, tenant_id, patient_id, professional_id, service_id,
        occurrence_id, start_time, end_time, status, modality, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', 'presential', datetime('now'))
    `);
    const insPay = db.prepare(`
      INSERT INTO payments (
        id, tenant_id, appointment_id, patient_id, amount, payment_method, status,
        due_date, service_id, base_amount, professional_id
      ) VALUES (?, ?, ?, ?, ?, 'pix', 'paid', ?, ?, ?, ?)
    `);
    const apptA1 = uuidv4();
    const apptA2 = uuidv4();
    const apptB1 = uuidv4();
    insAppt.run(apptA1, 'AG-9001', studioId, pat1, prof1, groupSrvId, occA, `${todayDate}T09:00:00`, `${todayDate}T10:00:00`);
    insAppt.run(apptA2, 'AG-9002', studioId, pat2, prof1, groupSrvId, occA, `${todayDate}T09:00:00`, `${todayDate}T10:00:00`);
    insAppt.run(apptB1, 'AG-9003', studioId, pat3, prof1, groupSrvId, occB, `${todayDate}T18:00:00`, `${todayDate}T19:00:00`);
    insPay.run(uuidv4(), studioId, apptA1, pat1, 100, todayDate, groupSrvId, 100, prof1);
    insPay.run(uuidv4(), studioId, apptA2, pat2, 100, todayDate, groupSrvId, 100, prof1);
    insPay.run(uuidv4(), studioId, apptB1, pat3, 100, todayDate, groupSrvId, 100, prof1);

    // Registrar equipe (Bruno Titular, Carla Coinstrutora) nas ocorrências A e B
    const insPart = db.prepare(`
      INSERT INTO session_instructor_participants (id, tenant_id, occurrence_id, professional_id, role, attendance_status)
      VALUES (?, ?, ?, ?, ?, 'scheduled')
    `);
    insPart.run(uuidv4(), studioId, occA, prof1, 'primary');
    insPart.run(uuidv4(), studioId, occA, prof2, 'co_instructor');
    insPart.run(uuidv4(), studioId, occB, prof1, 'primary');
    insPart.run(uuidv4(), studioId, occB, prof2, 'co_instructor');

    // Carla (professional, co-instrutora) consegue visualizar occA no Personal e abrir roster
    const resCarlaOccs = await makeReq('GET', `/api/v1/classes/occurrences?startDate=${todayDate}&endDate=${todayDate}`, authProf2);
    const carlaOccList = Array.isArray(resCarlaOccs.data?.occurrences) ? resCarlaOccs.data.occurrences : [];
    assert(
      resCarlaOccs.status === 200 &&
        carlaOccList.some(o => o.occurrence_id === occA && Array.isArray(o.participants) && o.participants.length === 2),
      'Co-instrutora (Carla) enxerga ocorrência no ZemdaPersonal com lista participants',
      resCarlaOccs.data
    );

    const resCarlaRoster = await makeReq('GET', `/api/v1/classes/occurrences/${occA}/roster`, authProf2);
    assert(
      resCarlaRoster.status === 200 &&
        Array.isArray(resCarlaRoster.data.participants) &&
        resCarlaRoster.data.participants.length === 2,
      'Co-instrutora consegue abrir roster de occA e recebe participants',
      resCarlaRoster.data
    );

    // Finalizar Ocorrência A com Bruno = present e Carla = present
    const resFinishA = await makeReq('POST', `/api/v1/classes/occurrences/${occA}/finish`, authStudio, {
      markPendingAsPresent: true,
      participantStatuses: [
        { professionalId: prof1, role: 'primary', attendanceStatus: 'present' },
        { professionalId: prof2, role: 'co_instructor', attendanceStatus: 'present' }
      ]
    });
    assert(resFinishA.status === 200, 'Finaliza Ocorrência A confirmando Bruno e Carla presentes', resFinishA.data);

    // Finalizar Ocorrência B com Bruno = present e Carla = ABSENT!
    const resFinishB = await makeReq('POST', `/api/v1/classes/occurrences/${occB}/finish`, authStudio, {
      markPendingAsPresent: true,
      participantStatuses: [
        { professionalId: prof1, role: 'primary', attendanceStatus: 'present' },
        { professionalId: prof2, role: 'co_instructor', attendanceStatus: 'absent' }
      ]
    });
    assert(resFinishB.status === 200, 'Finaliza Ocorrência B com Carla marcada AUSENTE (absent)', resFinishB.data);

    const auditCount = db.prepare(`SELECT COUNT(*) AS cnt FROM session_participant_audit WHERE occurrence_id IN (?, ?)`).get(occA, occB).cnt;
    assert(auditCount >= 4, 'Registra auditoria de confirmação de instrutores em session_participant_audit', { auditCount });

    // =========================================================================
    // 4. REGRAS DE COMISSÃO, RATEIO DE PACOTES, SEM DUPLICIDADE DE RECEITA, WARNINGS & LOCK PAGO
    // =========================================================================
    console.log('\n4) Folha & Comissões Multi-Instrutor, Pacotes, Sem Duplicidade, Alertas e Lock Pago...');

    // Regras de comissão por serviço para Pilates Studio Coletivo:
    // - Bruno (prof1): 50% (percentage) -> Occ A (200 * 50% = 100), Occ B (100 * 50% = 50)
    // - Carla (prof2): R$ 40 fixed_per_class -> Occ A = R$ 40 (present), Occ B = R$ 0 (absent!)
    db.prepare(`
      INSERT INTO professional_service_commissions (id, tenant_id, professional_id, service_id, commission_type, commission_value)
      VALUES (?, ?, ?, ?, 'percentage', 50)
    `).run(uuidv4(), studioId, prof1, groupSrvId);

    db.prepare(`
      INSERT INTO professional_service_commissions (id, tenant_id, professional_id, service_id, commission_type, group_payout_basis, commission_value)
      VALUES (?, ?, ?, ?, 'fixed', 'per_class', 40)
    `).run(uuidv4(), studioId, prof2, groupSrvId);

    // Criar sessão individual Studio coberta por PACOTE (R$ 400 / 4 créditos = R$ 100 por sessão)
    // Com Titular = Diego (prof3, regra 60%) e Coinstrutor = Carla (prof2, regra 60% via custom -> 60 + 60 = 120 > 100 => WARNING!)
    const pkgId = 'pkg-' + uuidv4().slice(0, 6);
    db.prepare(`
      INSERT INTO service_packages (id, tenant_id, name, total_credits, price, billing_type, credit_mode, validity_days, active)
      VALUES (?, ?, 'Pacote Pilates 4 Aulas', 4, 400, 'one_time', 'shared_pool', 90, 1)
    `).run(pkgId, studioId);

    const pkgContractId = 'spc-' + uuidv4().slice(0, 6);
    db.prepare(`
      INSERT INTO student_package_contracts (
        id, tenant_id, package_id, student_id, package_name_snapshot, billing_type_snapshot,
        credit_mode_snapshot, contracted_price, total_credits_snapshot, start_date,
        contract_status, payment_status
      ) VALUES (?, ?, ?, ?, 'Pacote Pilates 4 Aulas', 'one_time', 'shared_pool', 400, 4, ?, 'active', 'paid')
    `).run(pkgContractId, studioId, pkgId, pat1, todayDate);

    // Regra de comissão para Personal Dual Individual: Diego 60%, Carla 60% (proposital para somar 120% e disparar COMMISSION_EXCEEDS_BASIS)
    db.prepare(`
      INSERT INTO professional_service_commissions (id, tenant_id, professional_id, service_id, commission_type, commission_value)
      VALUES (?, ?, ?, ?, 'percentage', 60)
    `).run(uuidv4(), studioId, prof3, indSrvId);
    db.prepare(`
      INSERT INTO professional_service_commissions (id, tenant_id, professional_id, service_id, commission_type, commission_value)
      VALUES (?, ?, ?, ?, 'percentage', 60)
    `).run(uuidv4(), studioId, prof2, indSrvId);

    const apptPkgId = uuidv4();
    db.prepare(`
      INSERT INTO appointments (
        id, appointment_number, tenant_id, patient_id, professional_id, service_id,
        is_package_covered, package_contract_id, start_time, end_time, status, modality, created_at
      ) VALUES (?, 'AG-9004', ?, ?, ?, ?, 1, ?, ?, ?, 'completed', 'presential', datetime('now'))
    `).run(apptPkgId, studioId, pat1, prof3, indSrvId, pkgContractId, `${todayDate}T11:00:00`, `${todayDate}T12:00:00`);

    // Vincular Diego (primary, present) e Carla (co_instructor, present) na sessão individual do pacote
    db.prepare(`
      INSERT INTO session_instructor_participants (id, tenant_id, appointment_id, professional_id, role, attendance_status)
      VALUES (?, ?, ?, ?, 'primary', 'present')
    `).run(uuidv4(), studioId, apptPkgId, prof3);
    db.prepare(`
      INSERT INTO session_instructor_participants (id, tenant_id, appointment_id, professional_id, role, attendance_status)
      VALUES (?, ?, ?, ?, 'co_instructor', 'present')
    `).run(uuidv4(), studioId, apptPkgId, prof2);

    // Calcular Folha
    const resCalc = await makeReq('POST', '/api/v1/payroll/calculate', authStudio, { periodMonth: targetMonth });
    assert(resCalc.status === 200 && Array.isArray(resCalc.data.results), 'POST /v1/payroll/calculate executa com sucesso', resCalc.data);

    const rowBruno = resCalc.data.results.find(r => r.professionalId === prof1);
    const rowCarla = resCalc.data.results.find(r => r.professionalId === prof2);
    const rowDiego = resCalc.data.results.find(r => r.professionalId === prof3);

    // Esperado:
    // Bruno: Occ A (200*50%=100) + Occ B (100*50%=50) => produced = 300, commission = 150
    // Carla: Occ A (40 fixo) + Occ B (0 porque absent!) + PkgIndividual (100*60%=60) => commission = 100, produced = 0 (ambas titular já contabilizado!)
    // Diego: PkgIndividual (100*60%=60, credit rateado 400/4=100!) => produced = 100, commission = 60
    // Summary uniqueProducedAmount = 200 + 100 + 100 = 400 (ZERO duplicação de receita!)
    assert(
      rowBruno && Number(rowBruno.producedAmount) === 300 && Number(rowBruno.commissionAmount) === 150,
      'Bruno (Titular): producedAmount=300 e comissão 50%=150',
      rowBruno
    );
    assert(
      rowCarla && Number(rowCarla.commissionAmount) === 100 && Number(rowCarla.producedAmount) === 0,
      'Carla (Coinstrutora): recebeu R$ 40 (Occ A) + R$ 0 (Occ B ausente) + R$ 60 (Pacote) = R$ 100, sem duplicar faturamento (produced=0)',
      rowCarla
    );
    assert(
      rowDiego && Number(rowDiego.producedAmount) === 100 && Number(rowDiego.commissionAmount) === 60,
      'Diego (Titular Pacote): base financeira rateada = R$ 100 (400/4) e comissão 60% = R$ 60 (não duplica R$ 400)',
      rowDiego
    );
    assert(
      resCalc.data.summary && Number(resCalc.data.summary.uniqueProducedAmount) === 400,
      'Summary uniqueProducedAmount = R$ 400 (faturamento bruto único sem duplicidade)',
      resCalc.data.summary
    );
    assert(
      Array.isArray(resCalc.data.warnings) &&
        resCalc.data.warnings.some(w => w.code === 'COMMISSION_EXCEEDS_BASIS'),
      'Emite warning COMMISSION_EXCEEDS_BASIS quando soma das comissões (120) excede base (100)',
      resCalc.data.warnings
    );

    // Salvar folhas de Bruno e Carla + testar Lock de folha já paga
    const resSaveBruno = await makeReq('POST', '/api/v1/payroll', authStudio, {
      professionalId: prof1,
      periodMonth: targetMonth,
      remunerationType: rowBruno.remunerationType,
      appointmentsCount: rowBruno.appointmentsCount,
      producedAmount: rowBruno.producedAmount,
      commissionPercentage: rowBruno.commissionPercentage,
      commissionAmount: rowBruno.commissionAmount,
      fixedSalary: rowBruno.fixedSalary,
      adjustments: 0,
      totalPayable: rowBruno.totalPayable,
      dueDate: rowBruno.dueDate,
      status: 'pending',
      commissionBreakdown: rowBruno.commissionBreakdown,
      warnings: rowBruno.warnings
    });
    const brunoPayrollId = resSaveBruno.data.id;

    const resSaveCarla = await makeReq('POST', '/api/v1/payroll', authStudio, {
      professionalId: prof2,
      periodMonth: targetMonth,
      remunerationType: rowCarla.remunerationType,
      appointmentsCount: rowCarla.appointmentsCount,
      producedAmount: rowCarla.producedAmount,
      commissionPercentage: rowCarla.commissionPercentage,
      commissionAmount: rowCarla.commissionAmount,
      fixedSalary: rowCarla.fixedSalary,
      adjustments: 0,
      totalPayable: rowCarla.totalPayable,
      dueDate: rowCarla.dueDate,
      status: 'pending',
      commissionBreakdown: rowCarla.commissionBreakdown,
      warnings: rowCarla.warnings
    });
    assert(resSaveCarla.status === 200 || resSaveCarla.status === 201, 'Salva folha de Carla com breakdown e warnings', resSaveCarla.data);
    const carlaPayrollId = resSaveCarla.data.id;

    const resGetItems = await makeReq('GET', `/api/v1/payroll/${carlaPayrollId}/items`, authStudio);
    assert(
      resGetItems.status === 200 &&
        Array.isArray(resGetItems.data.items) &&
        resGetItems.data.items.length === 2 &&
        resGetItems.data.items.every(it => it.participant_role === 'co_instructor'),
      'GET /v1/payroll/:id/items lista os 2 itens detalhados de co-instrutora (Occ A e Pacote)',
      resGetItems.data
    );

    // Marcar folha de Carla como PAGA
    const resPayCarla = await makeReq('PATCH', `/api/v1/payroll/${carlaPayrollId}/pay`, authStudio, {
      paidDate: todayDate,
      notes: 'PIX efetuado'
    });
    assert(resPayCarla.status === 200 && resPayCarla.data.status === 'paid', 'Quita folha de Carla', resPayCarla.data);

    // Tentar sobrescrever folha PAGA retorna 409 PAYROLL_ALREADY_PAID e calculate marca isLocked=true
    const resOverwritePaid = await makeReq('POST', '/api/v1/payroll', authStudio, {
      professionalId: prof2,
      periodMonth: targetMonth,
      remunerationType: 'commission',
      appointmentsCount: 99,
      producedAmount: 999,
      commissionAmount: 999,
      totalPayable: 999
    });
    assert(
      resOverwritePaid.status === 409 && resOverwritePaid.data.code === 'PAYROLL_ALREADY_PAID',
      'Bloqueia sobrescrita de folha já paga (HTTP 409 PAYROLL_ALREADY_PAID)',
      resOverwritePaid.data
    );

    const resRecalcAfterPay = await makeReq('POST', '/api/v1/payroll/calculate', authStudio, { periodMonth: targetMonth });
    const carlaLocked = (resRecalcAfterPay.data.results || []).find(r => r.professionalId === prof2);
    assert(
      carlaLocked && carlaLocked.isLocked === true && Number(carlaLocked.totalPayable) === 100,
      'Recálculo preserva folha já paga de Carla com isLocked=true',
      carlaLocked
    );

    // =========================================================================
    // 5. SEGURANÇA: ROLE 403 E NÃO REGRESSÃO DE CLÍNICA TRADICIONAL
    // =========================================================================
    console.log('\n5) Controle de Acesso (403) e Não Regressão de Clínica Tradicional...');

    const resProfCalc = await makeReq('POST', '/api/v1/payroll/calculate', authProf2, { periodMonth: targetMonth });
    const resProfOwnItems = await makeReq('GET', `/api/v1/payroll/${carlaPayrollId}/items`, authProf2);
    const resProfOtherItems = await makeReq('GET', `/api/v1/payroll/${brunoPayrollId}/items`, authProf2);
    assert(
      resProfCalc.status === 403 && resProfOwnItems.status === 200 && resProfOtherItems.status === 403,
      'Profissional não-admin recebe 403 em calculate e na folha de outro profissional (mas acessa a própria)',
      { calc: resProfCalc.status, ownItems: resProfOwnItems.status, otherItems: resProfOtherItems.status }
    );

    // Cross-tenant co-instructor rejeitado ao criar escala
    const resCrossTenantSched = await makeReq('POST', `/api/v1/services/${groupSrvId}/class-schedules`, authStudio, {
      dayOfWeek: 5,
      startTime: '09:00',
      endTime: '10:00',
      professionalId: prof1,
      coInstructorIds: [profOther],
      capacity: 4
    });
    assert(resCrossTenantSched.status === 400, 'Rejeita co-instrutor de outro tenant (HTTP 400)', resCrossTenantSched.data);

    // Clínica tradicional calcula folha padrão intacta
    const resCliSrv = await makeReq('POST', '/api/v1/services', authClinic, {
      name: 'Consulta Clínica',
      durationMinutes: 50,
      price: 250,
      modality: 'presential',
      serviceKind: 'individual',
      professionalId: profClinic
    });
    const cliSrvId = resCliSrv.data.id;
    const apptCliId = uuidv4();
    db.prepare(`
      INSERT INTO appointments (
        id, appointment_number, tenant_id, patient_id, professional_id, service_id,
        start_time, end_time, status, modality, created_at
      ) VALUES (?, 'AG-9501', ?, ?, ?, ?, ?, ?, 'completed', 'presential', datetime('now'))
    `).run(apptCliId, clinicId, patCli, profClinic, cliSrvId, `${todayDate}T15:00:00`, `${todayDate}T16:00:00`);
    insPay.run(uuidv4(), clinicId, apptCliId, patCli, 250, todayDate, cliSrvId, 250, profClinic);

    const resCliPayroll = await makeReq('POST', '/api/v1/payroll/calculate', authClinic, { periodMonth: targetMonth });
    const drCliRow = (resCliPayroll.data.results || []).find(r => r.professionalId === profClinic);
    assert(
      resCliPayroll.status === 200 && drCliRow && Number(drCliRow.producedAmount) === 250 && Number(drCliRow.commissionAmount) === 100,
      'Clínica tradicional calcula comissão padrão intacta (250 * 40% = 100)',
      drCliRow
    );
  } catch (err) {
    console.error('EXCEÇÃO NO TESTE:', err);
    failed++;
  } finally {
    server.close();
    console.log('\n-----------------------------------------------------------------------------------------');
    console.log(`RESULTADO: ${passed} PASSOU | ${failed} FALHOU`);
    console.log('-----------------------------------------------------------------------------------------\n');
    try { db.close(); } catch {}
    for (const ext of ['', '-wal', '-shm']) {
      if (fs.existsSync(DB_PATH + ext)) {
        try { fs.unlinkSync(DB_PATH + ext); } catch {}
      }
    }
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
