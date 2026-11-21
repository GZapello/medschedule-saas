const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'zemda-svc-avail-')), 'test.db');
process.env.DATABASE_PATH = DB_PATH;
process.env.JWT_SECRET = 'test-studio-service-avail-secret-2026';
process.env.ZEMDA_FILES_SIGNING_SECRET = 'test-studio-service-avail-files-2026';
let TEST_PORT = 0;
process.env.PORT = String(TEST_PORT);

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');
const { calculateAvailableSlots, explainEmptySlots } = require('./dist/utils/slot-calculator');
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
  console.log('Zemda Studio: Disponibilidade de Horários por Serviço Individual');
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
      monday: { enabled: true, open: '07:00', close: '20:00' },
      tuesday: { enabled: true, open: '07:00', close: '20:00' },
      wednesday: { enabled: true, open: '07:00', close: '20:00' },
      thursday: { enabled: true, open: '07:00', close: '20:00' },
      friday: { enabled: true, open: '07:00', close: '20:00' },
      saturday: { enabled: true, open: '08:00', close: '14:00' },
      sunday: { enabled: false, open: '08:00', close: '12:00' }
    });

    const insTenant = db.prepare(`
      INSERT INTO tenants (
        id, name, trade_name, slug, email, status, billing_required,
        public_booking_enabled, establishment_profile, business_hours_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'active', 0, 1, ?, ?, datetime('now'), datetime('now'))
    `);
    insTenant.run(studioId, 'Studio Avail', 'Studio Avail', 'studio-avail-test', 'avail@studio.test', 'studio', hours);
    insTenant.run(mixedId, 'Espaço Misto Avail', 'Espaço Misto Avail', 'mixed-avail-test', 'avail@mixed.test', 'mixed', hours);
    insTenant.run(clinicId, 'Clínica Padrão Avail', 'Clínica Padrão Avail', 'clinic-avail-test', 'avail@clinic.test', 'clinic', hours);

    const admUser = 'usr-adm-' + uuidv4().slice(0, 6);
    db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES (?, ?, 'Gestor Studio', 'gestor@avail.test', 'h', 'clinic_admin', 'active')`).run(admUser, studioId);

    const insCU = db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json) VALUES (?, ?, ?, 'clinic_admin', 'active', 1, '["manage_services","view_financial","manage_financial","view_schedule","manage_patients","manage_appointments","manage_blocks"]')`);
    for (const tid of [studioId, mixedId, clinicId]) {
      insCU.run('cu-' + uuidv4().slice(0, 8), tid, admUser);
    }

    const mkHeaders = tid => ({
      Authorization: `Bearer ${generateToken({ userId: admUser, tenantId: tid, email: 'gestor@avail.test', role: 'clinic_admin' })}`,
      'x-tenant-id': tid
    });
    const authStudio = mkHeaders(studioId);
    const authMixed = mkHeaders(mixedId);
    const authClinic = mkHeaders(clinicId);

    const insProf = db.prepare(`
      INSERT INTO professionals (
        id, tenant_id, user_id, name, slug, profession_id, profession_name,
        active, public_booking_enabled, remuneration_type, commission_percentage, fixed_salary,
        practice_areas
      ) VALUES (?, ?, NULL, ?, ?, ?, 'Educador Físico', 1, 1, 'commission', 50, 0, ?)
    `);
    const profStudio = 'prof-st-' + uuidv4().slice(0, 6);
    const profMixed = 'prof-mx-' + uuidv4().slice(0, 6);
    const profClinic = 'prof-cl-' + uuidv4().slice(0, 6);
    insProf.run(profStudio, studioId, 'Instrutor Bruno', 'bruno-avail', profType, '["educacao_fisica"]');
    insProf.run(profMixed, mixedId, 'Pro Misto', 'misto-avail', profType, '["educacao_fisica"]');
    insProf.run(profClinic, clinicId, 'Dra. Sofia', 'sofia-avail', profType, '["educacao_fisica"]');

    // General work schedule for profStudio:
    // Mon-Fri 08:00-18:00 (with lunch break 12:00-14:00 on Tue/Thu only, continuous 08:00-18:00 on Mon/Wed/Fri so morning/afternoon tests work!)
    const insSched = db.prepare(`
      INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, break_start, break_end, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    for (const dow of [1, 3, 5]) {
      insSched.run(uuidv4(), studioId, profStudio, dow, '08:00', '18:00', null, null);
      insSched.run(uuidv4(), mixedId, profMixed, dow, '08:00', '18:00', null, null);
      insSched.run(uuidv4(), clinicId, profClinic, dow, '08:00', '18:00', null, null);
    }
    for (const dow of [2, 4]) {
      insSched.run(uuidv4(), studioId, profStudio, dow, '08:00', '18:00', '12:00', '14:00');
      insSched.run(uuidv4(), mixedId, profMixed, dow, '08:00', '18:00', '12:00', '14:00');
      insSched.run(uuidv4(), clinicId, profClinic, dow, '08:00', '18:00', '12:00', '14:00');
    }

    const insPat = db.prepare(`INSERT INTO patients (id, tenant_id, full_name, phone, cpf, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`);
    const patStudio1 = 'pat-st1-' + uuidv4().slice(0, 6);
    const patStudio2 = 'pat-st2-' + uuidv4().slice(0, 6);
    const patMixed = 'pat-mx-' + uuidv4().slice(0, 6);
    const patClinic = 'pat-cl-' + uuidv4().slice(0, 6);
    insPat.run(patStudio1, studioId, 'Aluno Carlos', '11991110001', '22233344401');
    insPat.run(patStudio2, studioId, 'Aluna Marina', '11991110002', '22233344402');
    insPat.run(patMixed, mixedId, 'Aluno Misto', '11991110003', '22233344403');
    insPat.run(patClinic, clinicId, 'Paciente Sofia', '11991110004', '22233344404');

    const monIso = getFutureWeekdayIso(1, 14); // future Monday
    const tueIso = addDaysIso(monIso, 1);
    const wedIso = addDaysIso(monIso, 2);
    const thuIso = addDaysIso(monIso, 3);
    const friIso = addDaysIso(monIso, 4);

    // 1) Create Service A (Option A - default full schedule)
    const fullRes = await makeReq('POST', '/api/v1/services', authStudio, {
      professionalId: profStudio,
      name: 'Avaliação Física Completa',
      durationMinutes: 60,
      bufferMinutes: 0,
      price: 120,
      modality: 'presential',
      serviceDomain: 'studio',
      serviceKind: 'individual'
    });
    assert(fullRes.status === 201 && fullRes.data.availability_mode === 'professional_schedule', '1. Padrão cria serviço com availability_mode = professional_schedule', fullRes.data);
    const fullSrvId = fullRes.data.id;
    const fullMonSlots = calculateAvailableSlots(studioId, profStudio, fullSrvId, monIso);
    assert(fullMonSlots.some(s => s.startTime.endsWith('08:00:00')) && fullMonSlots.some(s => s.startTime.endsWith('17:00:00')), '1b. Opção A usa toda a grade do profissional (08:00 até 17:00)', fullMonSlots.map(s => s.startTime));

    // 2) Same professional offering Personal Trainer (08:00-12:00) AND Yoga (14:00-18:00)
    const ptRes = await makeReq('POST', '/api/v1/services', authStudio, {
      professionalId: profStudio,
      name: 'Personal Trainer',
      durationMinutes: 60,
      bufferMinutes: 0,
      price: 150,
      modality: 'presential',
      serviceDomain: 'studio',
      serviceKind: 'individual',
      availabilityMode: 'custom_windows',
      availabilityWindows: [
        { dayOfWeek: 1, startTime: '08:00', endTime: '12:00' },
        { dayOfWeek: 3, startTime: '08:00', endTime: '12:00' }
      ]
    });
    assert(ptRes.status === 201 && ptRes.data.availability_mode === 'custom_windows' && ptRes.data.availability_windows.length === 2, '2. Criar Personal Trainer com janela 08:00-12:00 (Seg e Qua)', ptRes.data);
    const ptSrvId = ptRes.data.id;

    const yogaRes = await makeReq('POST', '/api/v1/services', authStudio, {
      professionalId: profStudio,
      name: 'Yoga Individual',
      // O cenário 9c contrata um plano pelo link público; habilitar essa oferta
      // explicitamente para testar disponibilidade, não o bloqueio comercial.
      allowPlanBooking: true,
      allowPublicPlanBooking: true,
      durationMinutes: 60,
      bufferMinutes: 0,
      price: 140,
      modality: 'presential',
      serviceDomain: 'studio',
      serviceKind: 'individual',
      availabilityMode: 'custom_windows',
      availabilityWindows: [
        { dayOfWeek: 1, startTime: '14:00', endTime: '18:00' },
        { dayOfWeek: 3, startTime: '14:00', endTime: '18:00' }
      ]
    });
    assert(yogaRes.status === 201 && yogaRes.data.availability_mode === 'custom_windows', '2b. Criar Yoga Individual com janela 14:00-18:00 (mesmo profissional)', yogaRes.data);
    const yogaSrvId = yogaRes.data.id;

    const ptMonTimes = calculateAvailableSlots(studioId, profStudio, ptSrvId, monIso).map(s => s.startTime.slice(11, 16));
    const yogaMonTimes = calculateAvailableSlots(studioId, profStudio, yogaSrvId, monIso).map(s => s.startTime.slice(11, 16));
    assert(JSON.stringify(ptMonTimes) === JSON.stringify(['08:00', '09:00', '10:00', '11:00']), '3. Personal Trainer retorna apenas horários das 08:00 às 12:00', ptMonTimes);
    assert(JSON.stringify(yogaMonTimes) === JSON.stringify(['14:00', '15:00', '16:00', '17:00']), '3b. Yoga retorna apenas horários das 14:00 às 18:00', yogaMonTimes);

    // Day with NO window on Personal Trainer (Friday) -> empty + SERVICE_AVAILABILITY_CLOSED
    const ptFriSlots = calculateAvailableSlots(studioId, profStudio, ptSrvId, friIso);
    const ptFriExplain = explainEmptySlots(studioId, profStudio, ptSrvId, friIso);
    assert(ptFriSlots.length === 0 && ptFriExplain.reasonCode === 'SERVICE_AVAILABILITY_CLOSED', '4. Dia sem janela configurada retorna zero slots e motivo claro', { ptFriSlots, ptFriExplain });

    // 5) Multiple windows on same weekday + buffer/duration boundaries
    const multiRes = await makeReq('POST', '/api/v1/services', authStudio, {
      professionalId: profStudio,
      name: 'Treino Funcional Fracionado',
      durationMinutes: 50,
      bufferMinutes: 10,
      price: 110,
      modality: 'presential',
      serviceDomain: 'studio',
      serviceKind: 'individual',
      availabilityMode: 'custom_windows',
      availabilityWindows: [
        { dayOfWeek: 1, startTime: '08:00', endTime: '10:00' },
        { dayOfWeek: 1, startTime: '16:00', endTime: '17:00' },
        { dayOfWeek: 3, startTime: '08:00', endTime: '08:40' } // smaller than duration 50min -> 0 slots!
      ]
    });
    assert(multiRes.status === 201, '5. Múltiplas janelas no mesmo dia salvas', multiRes.data);
    const multiSrvId = multiRes.data.id;
    const multiMonTimes = calculateAvailableSlots(studioId, profStudio, multiSrvId, monIso).map(s => s.startTime.slice(11, 16));
    const multiWedSlots = calculateAvailableSlots(studioId, profStudio, multiSrvId, wedIso);
    assert(JSON.stringify(multiMonTimes) === JSON.stringify(['08:00', '09:00', '16:00']), '5b. Respeita múltiplas faixas no mesmo dia + duração(50)+buffer(10)', multiMonTimes);
    assert(multiWedSlots.length === 0, '5c. Faixa menor que duração do atendimento não gera slot', multiWedSlots);

    // 6) Validation rejections: outside work hours, during break, overlapping windows, end <= start, empty windows
    const badOutside = await makeReq('POST', '/api/v1/services', authStudio, {
      professionalId: profStudio,
      name: 'Inválido Fora Escala',
      durationMinutes: 60,
      price: 100,
      serviceDomain: 'studio',
      serviceKind: 'individual',
      availabilityMode: 'custom_windows',
      availabilityWindows: [{ dayOfWeek: 1, startTime: '07:00', endTime: '10:00' }]
    });
    assert(badOutside.status === 400 && /fora da escala/i.test(badOutside.data.error), '6a. Rejeita horário fora da escala geral do profissional', badOutside.data);

    const badBreak = await makeReq('POST', '/api/v1/services', authStudio, {
      professionalId: profStudio,
      name: 'Inválido Almoço Terça',
      durationMinutes: 60,
      price: 100,
      serviceDomain: 'studio',
      serviceKind: 'individual',
      availabilityMode: 'custom_windows',
      availabilityWindows: [{ dayOfWeek: 2, startTime: '11:00', endTime: '14:00' }]
    });
    assert(badBreak.status === 400 && /fora da escala/i.test(badBreak.data.error), '6b. Rejeita janela que invade intervalo/pausa da escala', badBreak.data);

    const badOverlap = await makeReq('POST', '/api/v1/services', authStudio, {
      professionalId: profStudio,
      name: 'Inválido Sobreposição',
      durationMinutes: 60,
      price: 100,
      serviceDomain: 'studio',
      serviceKind: 'individual',
      availabilityMode: 'custom_windows',
      availabilityWindows: [
        { dayOfWeek: 1, startTime: '08:00', endTime: '12:00' },
        { dayOfWeek: 1, startTime: '11:00', endTime: '14:00' }
      ]
    });
    assert(badOverlap.status === 400 && /sobrepost/i.test(badOverlap.data.error), '6c. Rejeita faixas sobrepostas no mesmo dia', badOverlap.data);

    const badOrder = await makeReq('POST', '/api/v1/services', authStudio, {
      professionalId: profStudio,
      name: 'Inválido Fim Menor',
      durationMinutes: 60,
      price: 100,
      serviceDomain: 'studio',
      serviceKind: 'individual',
      availabilityMode: 'custom_windows',
      availabilityWindows: [{ dayOfWeek: 1, startTime: '12:00', endTime: '12:00' }]
    });
    assert(badOrder.status === 400 && /posterior|maior/i.test(badOrder.data.error), '6d. Rejeita término <= início', badOrder.data);

    // 7) Blocked times & holidays intersect with custom windows
    db.prepare(`INSERT INTO blocked_times (id, tenant_id, professional_id, title, start_datetime, end_datetime, type) VALUES (?, ?, ?, 'Reunião', ?, ?, 'meeting')`).run(
      uuidv4(), studioId, profStudio, `${monIso}T10:00:00`, `${monIso}T11:00:00`
    );
    const ptMonAfterBlock = calculateAvailableSlots(studioId, profStudio, ptSrvId, monIso).map(s => s.startTime.slice(11, 16));
    assert(JSON.stringify(ptMonAfterBlock) === JSON.stringify(['08:00', '09:00', '11:00']), '7a. Bloqueio de agenda subtrai de janela customizada', ptMonAfterBlock);

    db.prepare(`INSERT INTO holidays (id, tenant_id, name, date, is_national, active) VALUES (?, ?, 'Feriado Local', ?, 0, 1)`).run(
      uuidv4(), studioId, wedIso
    );
    const ptWedHoliday = calculateAvailableSlots(studioId, profStudio, ptSrvId, wedIso);
    assert(ptWedHoliday.length === 0, '7b. Feriado bloqueia slots mesmo em janela configurada', ptWedHoliday);

    // 8) Cross-service appointment conflict + Public & Internal Booking endpoints enforcement
    const nextMonIso = addDaysIso(monIso, 7);
    const nextWedIso = addDaysIso(nextMonIso, 2);

    // Public slots for Personal Trainer vs Yoga on nextMonIso
    const pubPtSlots = await makeReq('GET', `/api/v1/public/studio/slots?tenantSlug=studio-avail-test&serviceId=${ptSrvId}&date=${nextMonIso}`);
    const pubYogaSlots = await makeReq('GET', `/api/v1/public/studio/slots?tenantSlug=studio-avail-test&serviceId=${yogaSrvId}&date=${nextMonIso}`);
    assert(
      pubPtSlots.status === 200 &&
      pubPtSlots.data.availabilityMode === 'custom_windows' &&
      JSON.stringify(pubPtSlots.data.slots.map(s => s.startTime.slice(11, 16))) === JSON.stringify(['08:00', '09:00', '10:00', '11:00']),
      '8a. Endpoint público studio-slots devolve apenas horários do serviço Personal Trainer',
      pubPtSlots.data
    );
    assert(
      pubYogaSlots.status === 200 &&
      JSON.stringify(pubYogaSlots.data.slots.map(s => s.startTime.slice(11, 16))) === JSON.stringify(['14:00', '15:00', '16:00', '17:00']),
      '8b. Endpoint público studio-slots devolve apenas horários do serviço Yoga',
      pubYogaSlots.data
    );

    // Internal slots endpoint check
    const intPtSlots = await makeReq('GET', `/api/v1/slots/available?professionalId=${profStudio}&serviceId=${ptSrvId}&date=${nextMonIso}&ignoreLeadTime=1`, authStudio);
    assert(
      intPtSlots.status === 200 &&
      JSON.stringify((intPtSlots.data.slots || []).map(s => s.startTime.slice(11, 16))) === JSON.stringify(['08:00', '09:00', '10:00', '11:00']),
      '8c. Endpoint interno /slots/available respeita janela customizada do serviço',
      intPtSlots.data
    );

    // Direct API bypass attempt: try booking Personal Trainer at 15:00 (which belongs to Yoga, outside PT 08-12!)
    const pubBypass = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'studio-avail-test',
      mode: 'service',
      serviceId: ptSrvId,
      professionalId: profStudio,
      modality: 'presential',
      startTime: `${nextMonIso}T15:00:00`,
      endTime: `${nextMonIso}T16:00:00`,
      student: { fullName: 'Tentativa Pública Fora', phone: '11988887766', email: 'fora@test.com' }
    });
    assert(pubBypass.status >= 400 && !/nome completo|Selecione a aula/i.test(JSON.stringify(pubBypass.data)), '8d. Booking público bloqueia tentativa direta em horário fora da disponibilidade do serviço', pubBypass.data);

    const intBypass = await makeReq('POST', '/api/v1/appointments', authStudio, {
      patientId: patStudio1,
      professionalId: profStudio,
      serviceId: ptSrvId,
      startTime: `${nextMonIso}T15:00:00`,
      endTime: `${nextMonIso}T16:00:00`,
      modality: 'presential'
    });
    assert(intBypass.status >= 400, '8e. Booking interno bloqueia horário fora da janela do serviço', intBypass.data);

    // Book Personal Trainer inside its window (09:00-10:00) on Full service vs PT -> Full service sees 09:00 occupied!
    const validPtBook = await makeReq('POST', '/api/v1/appointments', authStudio, {
      patientId: patStudio1,
      professionalId: profStudio,
      serviceId: ptSrvId,
      startTime: `${nextMonIso}T09:00:00`,
      endTime: `${nextMonIso}T10:00:00`,
      modality: 'presential'
    });
    assert(validPtBook.status === 201, '8f. Booking interno aceita horário dentro da janela customizada (09:00)', validPtBook.data);

    const fullSlotsAfterPt = calculateAvailableSlots(studioId, profStudio, fullSrvId, nextMonIso).map(s => s.startTime.slice(11, 16));
    assert(!fullSlotsAfterPt.includes('09:00'), '8g. Agendamento em serviço customizado bloqueia horário correspondente para outros serviços do mesmo profissional', fullSlotsAfterPt);

    // 9) Recurring plans: valid inside custom window, rejected outside custom window
    const recValid = await makeReq('POST', '/api/v1/public/studio/recurrence-preview', {}, {
      tenantSlug: 'studio-avail-test',
      bookingIntent: 'recurring',
      serviceId: yogaSrvId,
      professionalId: profStudio,
      modality: 'presential',
      startTime: `${nextMonIso}T15:00:00`,
      endTime: `${nextMonIso}T16:00:00`,
      recurrence: {
        frequency: 'weekly',
        durationCode: '1_month',
        seriesMode: 'schedule_plan',
        scheduleEntries: [{ weekday: 1, dayOfWeek: 1, startTime: '15:00', endTime: '16:00', professionalId: profStudio, modality: 'presential' }],
        weekdays: [1],
        endDate: addMonthsClampIso(nextMonIso, 1)
      }
    });
    assert(recValid.status === 200 && recValid.data.valid === true && recValid.data.availableCount > 0, '9a. Recorrência pública dentro da janela do serviço é aprovada', recValid.data);

    const recOutside = await makeReq('POST', '/api/v1/appointments/recurring', authStudio, {
      patientId: patStudio2,
      professionalId: profStudio,
      serviceId: yogaSrvId,
      startTime: `${nextMonIso}T09:00:00`,
      endTime: `${nextMonIso}T10:00:00`,
      modality: 'presential',
      recurrence: {
        frequency: 'weekly',
        durationCode: '1_month',
        seriesMode: 'schedule_plan',
        scheduleEntries: [{ weekday: 1, startTime: '09:00', endTime: '10:00', professionalId: profStudio, modality: 'presential' }],
        weekdays: [1],
        endDate: addMonthsClampIso(nextMonIso, 1)
      }
    });
    assert(recOutside.status >= 400 && JSON.stringify(recOutside.data).includes('SERVICE_OUTSIDE_AVAILABILITY'), '9b. Recorrência interna em horário fora da disponibilidade do serviço é rejeitada com SERVICE_OUTSIDE_AVAILABILITY', recOutside.data);

    // Public recurring booking at 16:00 (Yoga window) succeeds
    const pubYogaRec = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'studio-avail-test',
      mode: 'service',
      bookingIntent: 'recurring',
      serviceId: yogaSrvId,
      professionalId: profStudio,
      modality: 'presential',
      startTime: `${nextMonIso}T16:00:00`,
      endTime: `${nextMonIso}T17:00:00`,
      recurrence: {
        frequency: 'weekly',
        durationCode: '1_month',
        seriesMode: 'schedule_plan',
        scheduleEntries: [{ weekday: 1, dayOfWeek: 1, startTime: '16:00', endTime: '17:00', professionalId: profStudio, modality: 'presential' }],
        weekdays: [1],
        endDate: addMonthsClampIso(nextMonIso, 1)
      },
      student: { fullName: 'Aluna Recorrente Yoga', phone: '11988887755', email: 'rec@yoga.test' }
    });
    assert(pubYogaRec.status === 201, '9c. Agendamento recorrente público dentro da janela Yoga funciona', pubYogaRec.data);

    // 10) Switch Option B -> Option A -> Option B preserves saved windows + Editing updates slots immediately
    const switchToA = await makeReq('PUT', `/api/v1/services/${ptSrvId}`, authStudio, {
      availabilityMode: 'professional_schedule'
    });
    assert(switchToA.status === 200 && switchToA.data.availability_mode === 'professional_schedule', '10a. Alternar para Opção A retorna toda a grade do profissional', switchToA.data);
    const dbPreservedCount = db.prepare(`SELECT COUNT(*) c FROM service_availability_windows WHERE tenant_id = ? AND service_id = ? AND active = 1`).get(studioId, ptSrvId).c;
    assert(dbPreservedCount === 2, '10b. Alternar para Opção A preserva horários específicos salvos anteriormente', { dbPreservedCount });
    const ptSlotsWhenModeA = calculateAvailableSlots(studioId, profStudio, ptSrvId, nextWedIso).map(s => s.startTime.slice(11, 16));
    assert(ptSlotsWhenModeA.includes('14:00'), '10c. Em Opção A, serviço volta a ofertar tarde (14:00)', ptSlotsWhenModeA);

    // Switch back to B without passing availabilityWindows -> restores preserved windows!
    const switchBackToB = await makeReq('PUT', `/api/v1/services/${ptSrvId}`, authStudio, {
      availabilityMode: 'custom_windows'
    });
    assert(switchBackToB.status === 200 && switchBackToB.data.availability_mode === 'custom_windows' && switchBackToB.data.availability_windows.length === 2, '10d. Alternar de volta para Opção B recupera janelas salvas', switchBackToB.data);

    // 11) General professional schedule shrinks later -> service windows stay in DB, dynamic intersection updates slots, diagnostics flags warning
    db.prepare(`UPDATE schedules SET start_time = '10:00', end_time = '12:00' WHERE tenant_id = ? AND professional_id = ? AND day_of_week = 1`).run(studioId, profStudio);
    db.prepare(`UPDATE schedules SET is_active = 0 WHERE tenant_id = ? AND professional_id = ? AND day_of_week = 3`).run(studioId, profStudio);

    const listedAfterShrink = await makeReq('GET', '/api/v1/services', authStudio);
    const ptAfterShrink = listedAfterShrink.data.find(s => s.id === ptSrvId);
    assert(
      ptAfterShrink &&
      ptAfterShrink.availability_windows.length === 2 &&
      ptAfterShrink.availability_diagnostics?.hasIncompatibleWindows === true &&
      ptAfterShrink.availability_diagnostics.warnings.length >= 1,
      '11a. Redução posterior da escala do profissional não apaga janela salva e gera alerta de incompatibilidade',
      ptAfterShrink?.availability_diagnostics
    );

    const ptSlotsIntersected = calculateAvailableSlots(studioId, profStudio, ptSrvId, addDaysIso(nextMonIso, 7)).map(s => s.startTime.slice(11, 16));
    const ptWedDisabledSlots = calculateAvailableSlots(studioId, profStudio, ptSrvId, nextWedIso);
    assert(JSON.stringify(ptSlotsIntersected) === JSON.stringify(['10:00', '11:00']), '11b. Interseção dinâmica reduz slots para 10:00-12:00 após alteração da escala geral', ptSlotsIntersected);
    assert(ptWedDisabledSlots.length === 0, '11c. Quarta desativada na escala geral não gera slots mesmo com janela salva', ptWedDisabledSlots);

    // Existing scheduled appointments remain intact!
    const existingApptStillThere = db.prepare(`SELECT status, start_time FROM appointments WHERE id = ?`).get(validPtBook.data.id);
    assert(existingApptStillThere && existingApptStillThere.status === 'scheduled', '12. Agendamentos já realizados permanecem preservados', existingApptStillThere);

    // 13) Mixed establishment isolation + Clinic isolation + Collective group class untouched
    const mixedStudioRes = await makeReq('POST', '/api/v1/services', authMixed, {
      professionalId: profMixed,
      name: 'Studio Misto Custom',
      durationMinutes: 60,
      price: 130,
      serviceDomain: 'studio',
      serviceKind: 'individual',
      availabilityMode: 'custom_windows',
      availabilityWindows: [{ dayOfWeek: 1, startTime: '08:00', endTime: '11:00' }]
    });
    assert(mixedStudioRes.status === 201 && mixedStudioRes.data.availability_mode === 'custom_windows', '13a. Estabelecimento misto aceita janela específica para serviço do domínio Studio', mixedStudioRes.data);

    const mixedClinicalReject = await makeReq('POST', '/api/v1/services', authMixed, {
      professionalId: profMixed,
      name: 'Consulta Clínica Misto',
      durationMinutes: 50,
      price: 200,
      serviceDomain: 'clinical',
      serviceKind: 'individual',
      availabilityMode: 'custom_windows',
      availabilityWindows: [{ dayOfWeek: 1, startTime: '08:00', endTime: '11:00' }]
    });
    assert(mixedClinicalReject.status === 400, '13b. Estabelecimento misto rejeita janela específica em serviço clínico', mixedClinicalReject.data);

    const clinicReject = await makeReq('POST', '/api/v1/services', authClinic, {
      professionalId: profClinic,
      name: 'Consulta Padrão Clínica',
      durationMinutes: 50,
      price: 220,
      availabilityMode: 'custom_windows',
      availabilityWindows: [{ dayOfWeek: 1, startTime: '08:00', endTime: '11:00' }]
    });
    assert(clinicReject.status === 400, '13c. Clínica tradicional rejeita custom_windows e permanece isolada', clinicReject.data);

    const groupRejectCustom = await makeReq('POST', '/api/v1/services', authStudio, {
      professionalId: profStudio,
      name: 'Turma Coletiva',
      durationMinutes: 60,
      price: 90,
      serviceDomain: 'studio',
      serviceKind: 'group',
      defaultCapacity: 10,
      availabilityMode: 'custom_windows',
      availabilityWindows: [{ dayOfWeek: 1, startTime: '08:00', endTime: '12:00' }]
    });
    assert(groupRejectCustom.status === 400, '13d. Aulas coletivas/turmas não aceitam custom_windows de individual (usam grade da turma)', groupRejectCustom.data);

    // Regular clinic appointment still books across whole work schedule
    const clinicValidRes = await makeReq('POST', '/api/v1/services', authClinic, {
      professionalId: profClinic,
      name: 'Sessão Clínica Normal',
      durationMinutes: 50,
      price: 200
    });
    assert(clinicValidRes.status === 201 && clinicValidRes.data.availability_mode === 'professional_schedule', '14. Fluxo clínico tradicional preservado', clinicValidRes.data);
    const clinicBook = await makeReq('POST', '/api/v1/appointments', authClinic, {
      patientId: patClinic,
      professionalId: profClinic,
      serviceId: clinicValidRes.data.id,
      startTime: `${nextMonIso}T14:00:00`,
      endTime: `${nextMonIso}T14:50:00`,
      modality: 'presential'
    });
    assert(clinicBook.status === 201, '14b. Agendamento clínico funciona normalmente', clinicBook.data);

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
