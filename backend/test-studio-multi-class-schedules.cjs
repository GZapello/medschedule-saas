const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'zemda-multi-class-')), 'test.db');
process.env.DATABASE_PATH = DB_PATH;
process.env.JWT_SECRET = 'test-multi-class-secret-2026';
process.env.ZEMDA_FILES_SIGNING_SECRET = 'test-multi-class-files-2026';
let TEST_PORT = 0;
process.env.PORT = String(TEST_PORT);

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');
const { quoteFrequencyPlan } = require('./dist/services/frequency-pricing.service');
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
    console.error(`  [FAIL] ${msg}${detail !== undefined ? ' -> ' + JSON.stringify(detail).slice(0, 600) : ''}`);
    failed++;
    throw new Error(msg);
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

function getFutureWeekdayIso(targetDow, minDaysAhead = 10) {
  const now = new Date(Date.now() - 3 * 3600 * 1000);
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + minDaysAhead, 12, 0, 0));
  const diff = (targetDow - base.getUTCDay() + 7) % 7;
  base.setUTCDate(base.getUTCDate() + diff);
  return base.toISOString().slice(0, 10);
}

function addDaysIso(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0)).toISOString().slice(0, 10);
}

function addMonthsClampIso(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1, 12, 0, 0));
  const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, lastDay));
  return dt.toISOString().slice(0, 10);
}

async function runTests() {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(TEST_PORT, resolve));
  TEST_PORT = server.address().port;

  console.log('\n=========================================================================================');
  console.log('Zemda Studio: Múltiplos Horários por Dia em Aulas Coletivas');
  console.log('=========================================================================================\n');

  try {
    const studioId = 'ten-st-' + uuidv4().slice(0, 6);
    const mixedId = 'ten-mx-' + uuidv4().slice(0, 6);
    const clinicId = 'ten-cl-' + uuidv4().slice(0, 6);

    let profType = db.prepare(`SELECT id FROM professions WHERE lower(name) = lower('Educação Física')`).get()?.id;
    if (!profType) {
      profType = 'prof-type-' + uuidv4().slice(0, 6);
      db.prepare(`INSERT OR IGNORE INTO professions (id, name) VALUES (?, 'Educação Física')`).run(profType);
    }

    const hours = JSON.stringify({
      monday: { enabled: true, open: '06:00', close: '22:00' },
      tuesday: { enabled: true, open: '06:00', close: '22:00' },
      wednesday: { enabled: true, open: '06:00', close: '22:00' },
      thursday: { enabled: true, open: '06:00', close: '22:00' },
      friday: { enabled: true, open: '06:00', close: '22:00' },
      saturday: { enabled: true, open: '08:00', close: '18:00' },
      sunday: { enabled: false, open: '08:00', close: '12:00' }
    });

    const insTenant = db.prepare(`
      INSERT INTO tenants (
        id, name, trade_name, slug, email, status, billing_required,
        public_booking_enabled, establishment_profile, business_hours_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'active', 0, 1, ?, ?, datetime('now'), datetime('now'))
    `);
    insTenant.run(studioId, 'Studio Yoga Multi', 'Studio Yoga Multi', 'studio-yoga-multi', 'yoga@multi.test', 'studio', hours);
    insTenant.run(mixedId, 'Espaço Misto Multi', 'Espaço Misto Multi', 'misto-multi', 'misto@multi.test', 'mixed', hours);
    insTenant.run(clinicId, 'Clínica Multi', 'Clínica Multi', 'clinica-multi', 'clinica@multi.test', 'clinic', hours);

    const admUser = 'usr-adm-' + uuidv4().slice(0, 6);
    db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES (?, ?, 'Gestor Gabriel', 'gabriel@multi.test', 'h', 'clinic_admin', 'active')`).run(admUser, studioId);
    const insCU = db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json) VALUES (?, ?, ?, 'clinic_admin', 'active', 1, '["manage_services","view_financial","manage_financial","view_schedule","manage_patients","manage_appointments"]')`);
    for (const tid of [studioId, mixedId, clinicId]) {
      insCU.run('cu-' + uuidv4().slice(0, 8), tid, admUser);
    }

    const mkHeaders = tid => ({
      Authorization: `Bearer ${generateToken({ userId: admUser, tenantId: tid, email: 'gabriel@multi.test', role: 'clinic_admin' })}`,
      'x-tenant-id': tid
    });
    const authStudio = mkHeaders(studioId);
    const authMixed = mkHeaders(mixedId);
    const authClinic = mkHeaders(clinicId);

    const insProf = db.prepare(`
      INSERT INTO professionals (
        id, tenant_id, user_id, name, slug, profession_id, profession_name,
        active, public_booking_enabled, remuneration_type, commission_percentage, fixed_salary, practice_areas
      ) VALUES (?, ?, NULL, ?, ?, ?, 'Educador Físico', 1, 1, 'commission', 50, 0, '["educacao_fisica"]')
    `);
    const profGabriel = 'prof-gab-' + uuidv4().slice(0, 6);
    const profAna = 'prof-ana-' + uuidv4().slice(0, 6);
    const profBulk = 'prof-blk-' + uuidv4().slice(0, 6);
    const profMisto = 'prof-mix-' + uuidv4().slice(0, 6);
    const profClinica = 'prof-cli-' + uuidv4().slice(0, 6);
    insProf.run(profGabriel, studioId, 'Instrutor Gabriel', 'gabriel-multi', profType);
    insProf.run(profAna, studioId, 'Instrutora Ana', 'ana-multi', profType);
    insProf.run(profBulk, studioId, 'Instrutor Lucas', 'lucas-multi', profType);
    insProf.run(profMisto, mixedId, 'Instrutor Misto', 'misto-multi-p', profType);
    insProf.run(profClinica, clinicId, 'Dra. Carla', 'carla-multi', profType);

    const insSched = db.prepare(`INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active) VALUES (?, ?, ?, ?, '06:00', '22:00', 1)`);
    for (let dow = 1; dow <= 6; dow++) {
      insSched.run(uuidv4(), studioId, profGabriel, dow);
      insSched.run(uuidv4(), studioId, profAna, dow);
      insSched.run(uuidv4(), studioId, profBulk, dow);
      insSched.run(uuidv4(), mixedId, profMisto, dow);
      insSched.run(uuidv4(), clinicId, profClinica, dow);
    }

    const roomA = 'room-a-' + uuidv4().slice(0, 6);
    const roomB = 'room-b-' + uuidv4().slice(0, 6);
    db.prepare(`INSERT INTO rooms (id, tenant_id, name, active) VALUES (?, ?, 'Sala Zen', 1)`).run(roomA, studioId);
    db.prepare(`INSERT INTO rooms (id, tenant_id, name, active) VALUES (?, ?, 'Sala Fluxo', 1)`).run(roomB, studioId);

    const insPat = db.prepare(`INSERT INTO patients (id, tenant_id, full_name, phone, cpf, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`);
    const pats = [];
    for (let i = 1; i <= 5; i++) {
      const pid = `pat-m${i}-${uuidv4().slice(0, 6)}`;
      pats.push(pid);
      insPat.run(pid, studioId, `Aluno ${i}`, `1199222000${i}`, `3334445550${i}`);
    }
    const patCli = 'pat-cli-' + uuidv4().slice(0, 6);
    insPat.run(patCli, clinicId, 'Paciente Clínico', '11992220099', '99988877766');

    const monIso = getFutureWeekdayIso(1, 14);
    const wedIso = addDaysIso(monIso, 2);
    const friIso = addDaysIso(monIso, 4);

    // 1) Create single collective class "Yoga" with 2 times on Mon (08h 10v, 17h 12v), 2 times on Wed (08h 10v, 18h 12v) + 1 afternoon slot by distinct instructor Prof Ana at 12h
    const yogaCreate = await makeReq('POST', '/api/v1/services', authStudio, {
      professionalId: profGabriel,
      linkedProfessionalIds: [profGabriel, profAna],
      name: 'Yoga Coletiva',
      durationMinutes: 50,
      bufferMinutes: 10,
      price: 80,
      modality: 'both',
      serviceDomain: 'studio',
      serviceKind: 'group',
      defaultCapacity: 10,
      billingMode: 'monthly',
      pricingRule: 'four_weeks',
      weeklySessionsCount: 2,
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['weekly', 'custom_weekdays'],
      defaultRecurrenceFrequency: 'weekly',
      frequencyPricing: {
        version: 1,
        enabled: true,
        unit: 'per_period',
        tables: { monthly: { 1: 18000, 2: 32000 } }
      },
      classSchedules: [
        { weekdays: [1, 3], startTime: '08:00', endTime: '08:50', professionalId: profGabriel, roomId: roomA, capacity: 10, modality: 'presential' },
        { weekdays: [1], startTime: '17:00', endTime: '17:50', professionalId: profGabriel, roomId: roomA, capacity: 12, modality: 'presential' },
        { weekdays: [3], startTime: '18:00', endTime: '18:50', professionalId: profAna, roomId: roomB, capacity: 15, modality: 'online' }
      ]
    });
    assert(yogaCreate.status === 201 && yogaCreate.data.class_schedules.length === 4, '1. Serviço único Yoga criado com 4 horários em class_schedules (Seg 08h/17h, Qua 08h/18h)', yogaCreate.data);
    const yogaId = yogaCreate.data.id;
    const scheds = yogaCreate.data.class_schedules;
    const csMon08 = scheds.find(s => s.day_of_week === 1 && s.start_time.slice(0, 5) === '08:00');
    const csMon17 = scheds.find(s => s.day_of_week === 1 && s.start_time.slice(0, 5) === '17:00');
    const csWed08 = scheds.find(s => s.day_of_week === 3 && s.start_time.slice(0, 5) === '08:00');
    const csWed18 = scheds.find(s => s.day_of_week === 3 && s.start_time.slice(0, 5) === '18:00');
    assert(csMon08.capacity === 10 && csMon17.capacity === 12 && csWed18.capacity === 15 && csWed18.professional_id === profAna, '2. Capacidades e instrutores independentes por turma', { csMon08, csMon17, csWed18 });

    // 2) Add a 3rd class on Monday (19:00) on the existing service without overwriting earlier ones!
    const addMon19 = await makeReq('POST', `/api/v1/services/${yogaId}/class-schedules`, authStudio, {
      weekdays: [1],
      startTime: '19:00',
      endTime: '19:50',
      professionalId: profAna,
      roomId: roomB,
      capacity: 8,
      modality: 'presential'
    });
    assert(addMon19.status === 201 && addMon19.data.schedules.length === 5, '3. Adiciona 3ª turma na segunda-feira ao mesmo serviço mantendo as anteriores', addMon19.data);
    const csMon19 = addMon19.data.created[0];

    // 3) Same-instructor conflict blocked, Room conflict blocked, DIFFERENT instructor & different room ALLOWED at same time (08:00 Mon)!
    const profConflict = await makeReq('POST', `/api/v1/services/${yogaId}/class-schedules`, authStudio, {
      weekdays: [1],
      startTime: '08:30',
      endTime: '09:20',
      professionalId: profGabriel,
      roomId: roomB,
      capacity: 10,
      modality: 'presential'
    });
    assert(profConflict.status === 409 && profConflict.data.code === 'CLASS_SCHEDULE_CONFLICT', '4a. Conflito de sobreposição do mesmo instrutor bloqueado (409)', profConflict.data);

    const roomConflict = await makeReq('POST', `/api/v1/services/${yogaId}/class-schedules`, authStudio, {
      weekdays: [1],
      startTime: '08:00',
      endTime: '08:50',
      professionalId: profAna,
      roomId: roomA,
      capacity: 10,
      modality: 'presential'
    });
    assert(roomConflict.status === 409 && roomConflict.data.code === 'CLASS_SCHEDULE_ROOM_CONFLICT', '4b. Conflito de mesma sala no mesmo horário bloqueado (409)', roomConflict.data);

    const parallelDifferentProfRoom = await makeReq('POST', `/api/v1/services/${yogaId}/class-schedules`, authStudio, {
      weekdays: [1],
      startTime: '08:00',
      endTime: '08:50',
      professionalId: profAna,
      roomId: roomB,
      capacity: 14,
      modality: 'presential'
    });
    assert(parallelDifferentProfRoom.status === 201 && parallelDifferentProfRoom.data.schedules.length === 6, '4c. Turmas paralelas às 08h com instrutor/sala distintos permitidas', parallelDifferentProfRoom.data);

    // 4) Independent occupancy per class + instructor linked to same class still allows adding multiple students up to capacity
    const bookMon08_1 = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'studio-yoga-multi',
      mode: 'service',
      bookingIntent: 'single',
      serviceId: yogaId,
      professionalId: profGabriel,
      classScheduleId: csMon08.id,
      modality: 'presential',
      startTime: `${monIso}T08:00:00`,
      endTime: `${monIso}T08:50:00`,
      student: { fullName: 'Aluno Manhã 1', phone: '11988881001', email: 'm1@test.com' }
    });
    const bookMon08_2 = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'studio-yoga-multi',
      mode: 'service',
      bookingIntent: 'single',
      serviceId: yogaId,
      professionalId: profGabriel,
      classScheduleId: csMon08.id,
      modality: 'presential',
      startTime: `${monIso}T08:00:00`,
      endTime: `${monIso}T08:50:00`,
      student: { fullName: 'Aluno Manhã 2', phone: '11988881002', email: 'm2@test.com' }
    });
    const { PublicBookingRequestService } = require('./dist/services/public-booking-request.service');
    assert(bookMon08_1.status === 201 && bookMon08_2.status === 201, '5a. Dois alunos matriculados na mesma turma 08h sem instrutor bloquear o 2º aluno', { b1: bookMon08_1.data, b2: bookMon08_2.data });
    await PublicBookingRequestService.confirmNotificationRequest({ tenantId: studioId, notificationOrRequestId: bookMon08_1.data.requestId, userId: admUser, role: 'clinic_admin' });
    await PublicBookingRequestService.confirmNotificationRequest({ tenantId: studioId, notificationOrRequestId: bookMon08_2.data.requestId, userId: admUser, role: 'clinic_admin' });

    const pubMonSlots = await makeReq('GET', `/api/v1/public/studio/slots?tenantSlug=studio-yoga-multi&serviceId=${yogaId}&date=${monIso}`);
    assert(pubMonSlots.status === 200, '5b. Consulta pública retorna todas as turmas da segunda-feira', pubMonSlots.data);
    const slotMon08Gab = pubMonSlots.data.slots.find(s => s.classScheduleId === csMon08.id);
    const slotMon17Gab = pubMonSlots.data.slots.find(s => s.classScheduleId === csMon17.id);
    const slotMon19Ana = pubMonSlots.data.slots.find(s => s.classScheduleId === csMon19.id);
    assert(
      slotMon08Gab.enrolledCount === 2 && slotMon08Gab.remainingSpots === 8 && slotMon08Gab.capacity === 10 &&
      slotMon17Gab.enrolledCount === 0 && slotMon17Gab.remainingSpots === 12 && slotMon17Gab.capacity === 12 &&
      slotMon19Ana.enrolledCount === 0 && slotMon19Ana.remainingSpots === 8 && slotMon19Ana.capacity === 8,
      '5c. Ocupação das 08h (2/10, 8 disp.) não reduz vagas das 17h (0/12) nem das 19h (0/8)',
      { slotMon08Gab, slotMon17Gab, slotMon19Ana }
    );

    // 5) Edit 1 class (Mon 17h capacity 12 -> 14) without deleting/altering other classes or future bookings
    const updMon17 = await makeReq('PUT', `/api/v1/services/${yogaId}/class-schedules/${csMon17.id}`, authStudio, {
      capacity: 14
    });
    assert(
      updMon17.status === 200 &&
      updMon17.data.schedule.capacity === 14 &&
      updMon17.data.schedules.length === 6 &&
      updMon17.data.schedules.find(s => s.id === csMon08.id).capacity === 10,
      '6a. Edição de 1 horário (17h -> 14 vagas) preserva os demais horários intocados',
      updMon17.data
    );

    // Deactivate Mon 19h (which has no appointments -> DELETE returns deleted or status toggle returns inactive) & test Mon 08h deactivation preserves future booking!
    const deactMon08 = await makeReq('PATCH', `/api/v1/services/${yogaId}/class-schedules/${csMon08.id}/status`, authStudio, { active: 0 });
    assert(
      deactMon08.status === 200 &&
      Number(deactMon08.data.schedule.active) === 0 &&
      db.prepare(`SELECT COUNT(*) c FROM appointments WHERE service_id = ? AND status != 'cancelled'`).get(yogaId).c === 2,
      '6b. Desativar horário preserva agendamentos futuros existentes',
      deactMon08.data
    );
    // Re-activate Mon 08h for recurring test
    await makeReq('PATCH', `/api/v1/services/${yogaId}/class-schedules/${csMon08.id}/status`, authStudio, { active: 1 });

    // 6) Public recurring plan selecting Mon 17h + Wed 08h (2x/week -> R$ 320,00 from frequencyPricing table)
    const recPlanBook = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'studio-yoga-multi',
      mode: 'service',
      bookingIntent: 'recurring',
      serviceId: yogaId,
      professionalId: 'any',
      classScheduleId: csMon17.id,
      modality: 'presential',
      startTime: `${monIso}T17:00:00`,
      endTime: `${monIso}T17:50:00`,
      recurrence: {
        frequency: 'weekly',
        durationCode: '1_month',
        seriesMode: 'schedule_plan',
        scheduleEntries: [
          { classScheduleId: csMon17.id, weekday: 1, dayOfWeek: 1, startTime: '17:00', endTime: '17:50', professionalId: profGabriel, modality: 'presential' },
          { classScheduleId: csWed08.id, weekday: 3, dayOfWeek: 3, startTime: '08:00', endTime: '08:50', professionalId: profGabriel, modality: 'presential' }
        ],
        weekdays: [1, 3],
        endDate: addMonthsClampIso(monIso, 1)
      },
      student: { fullName: 'Aluna Plano Yoga 2x', phone: '11988881009', email: 'rec2x@test.com' }
    });
    assert(recPlanBook.status === 201, '7a. Contratação recorrente pública combinando Seg 17h + Qua 08h funciona', recPlanBook.data);
    const recPlanConf = await PublicBookingRequestService.confirmNotificationRequest({ tenantId: studioId, notificationOrRequestId: recPlanBook.data.requestId, userId: admUser, role: 'clinic_admin' });
    const recPlanRow = db.prepare(`SELECT * FROM recurring_billing_plans WHERE id = ?`).get(recPlanConf.billingPlanId);
    assert(recPlanRow.weekly_sessions_snapshot === 2 && recPlanRow.amount === 320, '7b. Precificação por frequência aplica 2x (R$ 320,00) mesmo havendo 6 turmas cadastradas', recPlanRow);

    // 7) Studio with 30 class_schedules across Mon-Fri (6/day) MUST NOT accept 30x weekly frequency!
    const bulkSchedules = [];
    for (let dow = 1; dow <= 5; dow++) {
      for (let h = 8; h <= 13; h++) {
        bulkSchedules.push({
          weekdays: [dow],
          startTime: `${String(h).padStart(2, '0')}:00`,
          endTime: `${String(h).padStart(2, '0')}:50`,
          professionalId: profBulk,
          capacity: 10,
          modality: 'presential'
        });
      }
    }
    const bulkSrv = await makeReq('POST', '/api/v1/services', authStudio, {
      professionalId: profBulk,
      linkedProfessionalIds: [profBulk],
      name: 'Yoga 30 Horários',
      durationMinutes: 50,
      price: 80,
      modality: 'presential',
      serviceDomain: 'studio',
      serviceKind: 'group',
      defaultCapacity: 10,
      billingMode: 'monthly',
      pricingRule: 'four_weeks',
      weeklySessionsCount: 2,
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['weekly'],
      frequencyPricing: { version: 1, enabled: true, unit: 'per_period', tables: { monthly: { 1: 18000, 2: 32000 } } },
      classSchedules: bulkSchedules
    });
    assert(bulkSrv.status === 201 && bulkSrv.data.class_schedules.length === 30, '8a. Serviço com 30 horários (6/dia x 5 dias) criado sem perda', bulkSrv.data);
    let exceeded30Reject = false;
    const bulkSlotsPayload = bulkSrv.data.class_schedules.slice(0, 8).map(cs => ({
      startTime: `${addDaysIso(monIso, cs.day_of_week - 1)}T${cs.start_time.slice(0, 5)}:00`,
      endTime: `${addDaysIso(monIso, cs.day_of_week - 1)}T${cs.end_time.slice(0, 5)}:00`,
      classScheduleId: cs.id,
      professionalId: cs.professional_id
    }));
    try {
      quoteFrequencyPlan({
        tenantId: studioId,
        serviceId: bulkSrv.data.id,
        billingFrequency: 'monthly',
        startDate: monIso,
        slots: bulkSlotsPayload
      });
    } catch {
      exceeded30Reject = true;
    }
    assert(exceeded30Reject, '8b. Precificação por frequência não aceita frequências artificiais acima de 7x mesmo com 30 turmas na grade');

    // 8) Mixed establishment & Clinic traditional isolation preserved
    const mixedGroup = await makeReq('POST', '/api/v1/services', authMixed, {
      professionalId: profMisto,
      name: 'Pilates Turma Misto Multi',
      durationMinutes: 50,
      price: 90,
      modality: 'presential',
      serviceDomain: 'studio',
      serviceKind: 'group',
      defaultCapacity: 8,
      classSchedules: [
        { weekdays: [2], startTime: '08:00', endTime: '08:50', professionalId: profMisto, capacity: 8, modality: 'presential' },
        { weekdays: [2], startTime: '18:00', endTime: '18:50', professionalId: profMisto, capacity: 10, modality: 'presential' }
      ]
    });
    assert(mixedGroup.status === 201 && mixedGroup.data.class_schedules.length === 2, '9a. Estabelecimento misto suporta múltiplos horários por dia no domínio Studio', mixedGroup.data);

    const clinicAppt = await makeReq('POST', '/api/v1/appointments', authClinic, {
      patientId: patCli,
      professionalId: profClinica,
      serviceId: (await makeReq('POST', '/api/v1/services', authClinic, { professionalId: profClinica, name: 'Consulta Clínica Normal', durationMinutes: 50, price: 200 })).data.id,
      startTime: `${monIso}T10:00:00`,
      endTime: `${monIso}T10:50:00`,
      modality: 'presential'
    });
    assert(clinicAppt.status === 201, '9b. Agendamento clínico tradicional permanece inalterado', clinicAppt.data);

    console.log(`\nResumo: ${passed} checks passaram, ${failed} falharam.`);
    if (failed > 0) process.exit(1);
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('\n[FATAL]', err);
  process.exit(1);
});
