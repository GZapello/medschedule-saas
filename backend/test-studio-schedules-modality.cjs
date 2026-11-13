const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_studio_schedules_modality.db');
process.env.JWT_SECRET = 'test-studio-schedules-modality-secret-2026';
process.env.ZEMDA_FILES_SIGNING_SECRET = 'test-studio-schedules-files-secret-123456';
process.env.PORT = '3103';

for (const ext of ['', '-wal', '-shm']) {
  if (fs.existsSync(process.env.DATABASE_PATH + ext)) {
    fs.unlinkSync(process.env.DATABASE_PATH + ext);
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
    console.error(`  [FAIL] ${msg}${detail ? ' -> ' + JSON.stringify(detail) : ''}`);
    failed++;
  }
}

function makeReq(method, reqPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 3103,
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
            resolve({ status: res.statusCode, data: JSON.parse(data), raw: data });
          } catch {
            resolve({ status: res.statusCode, data, raw: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function getNextWeekdayIso(targetDow, weekOffset = 1) {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
  const diff = (targetDow - base.getUTCDay() + 7) % 7 || 7;
  base.setUTCDate(base.getUTCDate() + diff + (weekOffset - 1) * 7);
  return base.toISOString().slice(0, 10);
}

async function runTests() {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(3103, resolve));
  console.log('\n==============================================================');
  console.log('TESTES: Modalidade Concreta + Grade Semanal de Aulas Coletivas');
  console.log('==============================================================\n');

  try {
    // -----------------------------------------------------------------
    // SETUP MULTI-TENANT (Studio A, Estabelecimento Misto B, Clínica C)
    // -----------------------------------------------------------------
    const studioA = 'ten-studio-a-' + uuidv4().slice(0, 6);
    const mixedB = 'ten-mixed-b-' + uuidv4().slice(0, 6);
    const clinicC = 'ten-clinic-c-' + uuidv4().slice(0, 6);

    db.prepare(`INSERT OR IGNORE INTO professions (id, name) VALUES ('prof-instrutor', 'Instrutor'), ('prof-medico', 'Médico')`).run();

    const insTenant = db.prepare(`
      INSERT INTO tenants (
        id, name, trade_name, slug, email, status, billing_required,
        public_booking_enabled, establishment_profile, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'active', 0, 1, ?, datetime('now'), datetime('now'))
    `);
    insTenant.run(studioA, 'Studio Teste A', 'Studio Teste A', 'studio-teste-a', 'studioa@zemda.test', 'studio');
    insTenant.run(mixedB, 'Espaço Misto B', 'Espaço Misto B', 'misto-b', 'mistob@zemda.test', 'mixed');
    insTenant.run(clinicC, 'Clínica Tradicional C', 'Clínica C', 'clinica-c', 'clinicac@zemda.test', 'clinic');

    const admStudioUser = 'usr-sa-' + uuidv4().slice(0, 6);
    const admMixedUser = 'usr-mb-' + uuidv4().slice(0, 6);
    const admClinicUser = 'usr-cc-' + uuidv4().slice(0, 6);
    db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES (?, ?, 'Adm Studio A', 'adma@zemda.test', 'h', 'clinic_admin', 'active')`).run(admStudioUser, studioA);
    db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES (?, ?, 'Adm Misto B', 'admb@zemda.test', 'h', 'clinic_admin', 'active')`).run(admMixedUser, mixedB);
    db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES (?, ?, 'Adm Clínica C', 'admc@zemda.test', 'h', 'clinic_admin', 'active')`).run(admClinicUser, clinicC);

    db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json) VALUES (?, ?, ?, 'clinic_admin', 'active', 1, '["manage_services","view_financial"]')`).run('cu-' + uuidv4().slice(0, 8), studioA, admStudioUser);
    db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json) VALUES (?, ?, ?, 'clinic_admin', 'active', 1, '["manage_services","view_financial"]')`).run('cu-' + uuidv4().slice(0, 8), mixedB, admMixedUser);
    db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json) VALUES (?, ?, ?, 'clinic_admin', 'active', 1, '["manage_services","view_financial"]')`).run('cu-' + uuidv4().slice(0, 8), clinicC, admClinicUser);

    const authStudioA = { Authorization: `Bearer ${generateToken({ userId: admStudioUser, tenantId: studioA, email: 'adma@zemda.test', role: 'clinic_admin' })}`, 'x-tenant-id': studioA };
    const authMixedB = { Authorization: `Bearer ${generateToken({ userId: admMixedUser, tenantId: mixedB, email: 'admb@zemda.test', role: 'clinic_admin' })}`, 'x-tenant-id': mixedB };
    const authClinicC = { Authorization: `Bearer ${generateToken({ userId: admClinicUser, tenantId: clinicC, email: 'admc@zemda.test', role: 'clinic_admin' })}`, 'x-tenant-id': clinicC };

    // Salas
    const roomPilates = 'rm-pil-' + uuidv4().slice(0, 6);
    const roomDanca = 'rm-dan-' + uuidv4().slice(0, 6);
    db.prepare(`INSERT INTO rooms (id, tenant_id, name, active) VALUES (?, ?, 'Sala Pilates 1', 1)`).run(roomPilates, studioA);
    db.prepare(`INSERT INTO rooms (id, tenant_id, name, active) VALUES (?, ?, 'Sala Dança 2', 1)`).run(roomDanca, studioA);

    // Profissionais (expediente aberto Seg-Sáb 07:00-21:00 — propositalmente amplo!)
    const profAna = 'prof-ana-' + uuidv4().slice(0, 6);
    const profBruno = 'prof-bru-' + uuidv4().slice(0, 6);
    const profMisto = 'prof-mis-' + uuidv4().slice(0, 6);
    const profClinica = 'prof-cli-' + uuidv4().slice(0, 6);
    db.prepare(`INSERT INTO professionals (id, tenant_id, name, slug, profession_id, profession_name, active, public_booking_enabled) VALUES (?, ?, 'Instrutora Ana', 'ana-studio', 'prof-instrutor', 'Instrutor', 1, 1)`).run(profAna, studioA);
    db.prepare(`INSERT INTO professionals (id, tenant_id, name, slug, profession_id, profession_name, active, public_booking_enabled) VALUES (?, ?, 'Instrutor Bruno', 'bruno-studio', 'prof-instrutor', 'Instrutor', 1, 1)`).run(profBruno, studioA);
    db.prepare(`INSERT INTO professionals (id, tenant_id, name, slug, profession_id, profession_name, active, public_booking_enabled) VALUES (?, ?, 'Prof. Misto', 'misto-prof', 'prof-instrutor', 'Instrutor', 1, 1)`).run(profMisto, mixedB);
    db.prepare(`INSERT INTO professionals (id, tenant_id, name, slug, profession_id, profession_name, active, public_booking_enabled) VALUES (?, ?, 'Dra. Clínica', 'dra-clinica', 'prof-medico', 'Médico', 1, 1)`).run(profClinica, clinicC);

    const insSched = db.prepare(`INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active) VALUES (?, ?, ?, ?, '07:00', '21:00', 1)`);
    for (let dow = 1; dow <= 6; dow++) {
      insSched.run(uuidv4(), studioA, profAna, dow);
      insSched.run(uuidv4(), studioA, profBruno, dow);
      insSched.run(uuidv4(), mixedB, profMisto, dow);
      insSched.run(uuidv4(), clinicC, profClinica, dow);
    }

    // Serviços no Studio A:
    // 1. Aula coletiva com modality='both' (caso exato que quebrava CHECK constraint!), capacidade=8
    const srvPilatesGroupBoth = 'srv-pil-grp-' + uuidv4().slice(0, 6);
    // 2. Aula coletiva online (Zumba Live)
    const srvZumbaGroupOnline = 'srv-zum-onl-' + uuidv4().slice(0, 6);
    // 3. Aula coletiva Dança (presential) para pacote multissserviços
    const srvDancaGroup = 'srv-dan-grp-' + uuidv4().slice(0, 6);
    // 4. Aula coletiva SEM grade cadastrada
    const srvYogaNoSchedule = 'srv-yog-nosch-' + uuidv4().slice(0, 6);
    // 5. Serviço individual com modality='both' e home
    const srvPersonalBoth = 'srv-per-both-' + uuidv4().slice(0, 6);
    const srvPersonalHome = 'srv-per-home-' + uuidv4().slice(0, 6);
    // 6. Clínica C & Misto B services
    const srvMistoGroup = 'srv-mis-grp-' + uuidv4().slice(0, 6);
    const srvClinica = 'srv-cli-' + uuidv4().slice(0, 6);

    db.prepare(`INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, buffer_minutes, price, modality, service_kind, default_capacity, allow_recurrence, active) VALUES (?, ?, ?, 'Pilates Experimental Turma', 60, 0, 90, 'both', 'group', 8, 1, 1)`).run(srvPilatesGroupBoth, studioA, profAna);
    db.prepare(`INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, buffer_minutes, price, modality, service_kind, default_capacity, allow_recurrence, active) VALUES (?, ?, ?, 'Zumba Live Turma', 60, 0, 60, 'online', 'group', 12, 1, 1)`).run(srvZumbaGroupOnline, studioA, profBruno);
    db.prepare(`INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, buffer_minutes, price, modality, service_kind, default_capacity, allow_recurrence, active) VALUES (?, ?, ?, 'Dança Contemporânea', 60, 0, 75, 'presential', 'group', 6, 1, 1)`).run(srvDancaGroup, studioA, profBruno);
    db.prepare(`INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, buffer_minutes, price, modality, service_kind, default_capacity, allow_recurrence, active) VALUES (?, ?, ?, 'Yoga Sem Grade', 60, 0, 70, 'presential', 'group', 10, 1, 1)`).run(srvYogaNoSchedule, studioA, profAna);
    db.prepare(`INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, buffer_minutes, price, modality, service_kind, default_capacity, allow_recurrence, active) VALUES (?, ?, ?, 'Personal Trainer 1:1 Flexível', 50, 10, 140, 'both', 'individual', 1, 1, 1)`).run(srvPersonalBoth, studioA, profAna);
    db.prepare(`INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, buffer_minutes, price, modality, service_kind, default_capacity, allow_recurrence, active) VALUES (?, ?, ?, 'Atendimento Domiciliar', 50, 10, 180, 'home', 'individual', 1, 0, 1)`).run(srvPersonalHome, studioA, profAna);
    db.prepare(`INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, buffer_minutes, price, modality, service_kind, default_capacity, allow_recurrence, active) VALUES (?, ?, ?, 'Mat Pilates Misto', 50, 10, 85, 'both', 'group', 5, 1, 1)`).run(srvMistoGroup, mixedB, profMisto);
    db.prepare(`INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, buffer_minutes, price, modality, service_kind, default_capacity, allow_recurrence, active) VALUES (?, ?, ?, 'Consulta Médica', 50, 10, 250, 'both', 'individual', 1, 0, 1)`).run(srvClinica, clinicC, profClinica);

    const monday1 = getNextWeekdayIso(1, 2); // usar semana +2 para evitar conflito com janela de antecedência de hoje
    const tuesday1 = getNextWeekdayIso(2, 2);
    const wednesday1 = getNextWeekdayIso(3, 2);
    const thursday1 = getNextWeekdayIso(4, 2);
    const friday1 = getNextWeekdayIso(5, 2);
    const saturday1 = getNextWeekdayIso(6, 2);

    // -----------------------------------------------------------------
    // TESTE 1: API CRUD Grade Semanal + Isolamento Estabelecimento & Conflitos
    // -----------------------------------------------------------------
    console.log('--- TESTE 1: CRUD da Grade Semanal & Conflitos de Instrutor/Sala ---');

    // Clínica tradicional NÃO pode criar grade semanal
    const clinicCreateSched = await makeReq('POST', `/api/v1/services/${srvClinica}/class-schedules`, authClinicC, {
      weekdays: [1, 3],
      startTime: '08:00',
      endTime: '09:00',
      professionalId: profClinica,
      capacity: 5
    });
    assert(clinicCreateSched.status === 403, 'Clínica tradicional bloqueada de criar grade semanal (403)', clinicCreateSched.data);

    // Criar grade do Pilates Experimental (service.modality='both') nas Segundas e Quartas 08:00-09:00 (presencial, cap=8, Sala Pilates 1)
    const pilSchMonWed = await makeReq('POST', `/api/v1/services/${srvPilatesGroupBoth}/class-schedules`, authStudioA, {
      weekdays: [1, 3],
      startTime: '08:00',
      endTime: '09:00',
      professionalId: profAna,
      roomId: roomPilates,
      capacity: 8
      // modality omitido com serviço 'both' => resolve para 'presential'
    });
    assert(
      pilSchMonWed.status === 201 &&
      pilSchMonWed.data.created.length === 2 &&
      pilSchMonWed.data.created.every(c => c.modality === 'presential'),
      'Grade semanal Seg/Qua 08h-09h criada; serviço both resolve para modalidade concreta presential',
      pilSchMonWed.data
    );
    const schMonId = pilSchMonWed.data.created.find(c => c.day_of_week === 1).id;

    // Criar grade adicional na Sexta 17:00-18:00 para o mesmo serviço
    const pilSchFri = await makeReq('POST', `/api/v1/services/${srvPilatesGroupBoth}/class-schedules`, authStudioA, {
      weekdays: [5],
      startTime: '17:00',
      endTime: '18:00',
      professionalId: profAna,
      roomId: roomPilates,
      capacity: 8,
      modality: 'presential'
    });
    assert(pilSchFri.status === 201 && pilSchFri.data.created.length === 1, 'Grade Sexta 17h-18h criada para Pilates');

    // Conflito de instrutor: tentar criar outra turma para Ana na Segunda 08:30-09:30 -> 409
    const conflictInstr = await makeReq('POST', `/api/v1/services/${srvYogaNoSchedule}/class-schedules`, authStudioA, {
      weekdays: [1],
      startTime: '08:30',
      endTime: '09:30',
      professionalId: profAna,
      capacity: 6
    });
    assert(conflictInstr.status === 409 && conflictInstr.data.code === 'CLASS_SCHEDULE_CONFLICT', 'Bloqueia sobreposição de horário do mesmo instrutor na grade semanal (409)', conflictInstr.data);

    // Conflito de sala: tentar criar turma do Bruno usando a MESMA sala Sala Pilates 1 na Segunda 08:00-09:00 -> 409
    const conflictRoom = await makeReq('POST', `/api/v1/services/${srvDancaGroup}/class-schedules`, authStudioA, {
      weekdays: [1],
      startTime: '08:00',
      endTime: '09:00',
      professionalId: profBruno,
      roomId: roomPilates,
      capacity: 6
    });
    assert(conflictRoom.status === 409 && conflictRoom.data.code === 'CLASS_SCHEDULE_ROOM_CONFLICT', 'Bloqueia sobreposição de sala na grade semanal (409)', conflictRoom.data);

    // Criar grade válida para Dança Contemporânea (Ter/Qui 19:00-20:00, Sala Dança 2) e Zumba Live (Sáb 10:00-11:00, online)
    const dancaSch = await makeReq('POST', `/api/v1/services/${srvDancaGroup}/class-schedules`, authStudioA, {
      weekdays: [2, 4],
      startTime: '19:00',
      endTime: '20:00',
      professionalId: profBruno,
      roomId: roomDanca,
      capacity: 6,
      modality: 'presential'
    });
    assert(dancaSch.status === 201, 'Grade Ter/Qui 19h-20h criada para Dança Contemporânea');

    const zumbaSch = await makeReq('POST', `/api/v1/services/${srvZumbaGroupOnline}/class-schedules`, authStudioA, {
      weekdays: [6],
      startTime: '10:00',
      endTime: '11:00',
      professionalId: profBruno,
      capacity: 12,
      modality: 'online'
    });
    assert(zumbaSch.status === 201 && zumbaSch.data.created[0].modality === 'online', 'Grade Sáb 10h-11h criada para Zumba Live com modality=online');

    // Misto B também suporta grade semanal
    const mistoSch = await makeReq('POST', `/api/v1/services/${srvMistoGroup}/class-schedules`, authMixedB, {
      weekdays: [2],
      startTime: '09:00',
      endTime: '09:50',
      professionalId: profMisto,
      capacity: 5
    });
    assert(mistoSch.status === 201, 'Estabelecimento Misto cria grade semanal normalmente');

    // Isolamento Cross-Tenant nas rotas da grade
    const crossGet = await makeReq('GET', `/api/v1/services/${srvPilatesGroupBoth}/class-schedules`, authMixedB);
    assert(crossGet.status === 404, 'Multi-tenant: Studio B não acessa grade de serviço do Studio A (404)');

    // -----------------------------------------------------------------
    // TESTE 2: Regressão do Erro de Modalidade (CHECK constraint) + Rollback
    // -----------------------------------------------------------------
    console.log('\n--- TESTE 2: Resolução de Modalidade Concreta & Ausência de Erro SQL ---');

    // Confirmar agendamento público de aula coletiva com serviço modality='both' (caso original da falha)
    const bookGroupBothOk = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'studio-teste-a',
      mode: 'service',
      serviceId: srvPilatesGroupBoth,
      classScheduleId: schMonId,
      startTime: `${monday1}T08:00:00`,
      endTime: `${monday1}T09:00:00`,
      student: { fullName: 'Aluno Um Teste', phone: '11990000001' }
    });
    assert(
      bookGroupBothOk.status === 201 &&
      bookGroupBothOk.data.appointments?.[0]?.modality === 'presential',
      'Agendamento público de serviço both salvo com modality=presential (sem CHECK constraint error)',
      bookGroupBothOk.data
    );
    const appt1Row = db.prepare(`SELECT a.modality, o.modality as occ_mod, o.class_schedule_id FROM appointments a LEFT JOIN class_occurrences o ON o.id = a.occurrence_id WHERE a.id = ?`).get(bookGroupBothOk.data.appointments[0].id);
    assert(
      appt1Row?.modality === 'presential' && appt1Row?.occ_mod === 'presential' && appt1Row?.class_schedule_id === schMonId,
      'Persistido appointments.modality=presential, class_occurrences.modality=presential e class_schedule_id vinculado',
      appt1Row
    );

    // Serviço individual both: escolher explicitamente 'online' e também testar padrão omitido ('presential')
    const bookIndOnline = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'studio-teste-a',
      mode: 'service',
      serviceId: srvPersonalBoth,
      professionalId: profAna,
      modality: 'online',
      startTime: `${tuesday1}T10:00:00`,
      student: { fullName: 'Aluno Individual Online', phone: '11990000010' }
    });
    assert(bookIndOnline.status === 201 && bookIndOnline.data.appointments[0].modality === 'online', 'Serviço individual both aceita escolha explícita online');

    // Serviço individual home
    const bookIndHome = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'studio-teste-a',
      mode: 'service',
      serviceId: srvPersonalHome,
      professionalId: profAna,
      startTime: `${tuesday1}T11:00:00`,
      student: { fullName: 'Aluno Domiciliar', phone: '11990000011' }
    });
    assert(bookIndHome.status === 201 && bookIndHome.data.appointments[0].modality === 'home', 'Serviço home resolve e salva modality=home');

    // Payload adulterado enviando modality='both' (nunca aceito no agendamento, sem vazar erro SQLite!)
    const patientsBeforeTamper = db.prepare(`SELECT COUNT(*) as c FROM patients WHERE tenant_id = ?`).get(studioA).c;
    const apptsBeforeTamper = db.prepare(`SELECT COUNT(*) as c FROM appointments WHERE tenant_id = ?`).get(studioA).c;
    const tamperBoth = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'studio-teste-a',
      mode: 'service',
      serviceId: srvPilatesGroupBoth,
      classScheduleId: schMonId,
      modality: 'both',
      startTime: `${monday1}T08:00:00`,
      endTime: `${monday1}T09:00:00`,
      student: { fullName: 'Aluno Adulterado Both', phone: '11990000099' }
    });
    assert(
      tamperBoth.status === 400 &&
      !String(tamperBoth.raw).includes('CHECK constraint') &&
      !String(tamperBoth.raw).includes('SQLITE'),
      'Rejeita payload com modality=both retornando 400 amigável e zero erro SQLite interno',
      tamperBoth.data
    );
    const patientsAfterTamper = db.prepare(`SELECT COUNT(*) as c FROM patients WHERE tenant_id = ?`).get(studioA).c;
    const apptsAfterTamper = db.prepare(`SELECT COUNT(*) as c FROM appointments WHERE tenant_id = ?`).get(studioA).c;
    assert(
      patientsBeforeTamper === patientsAfterTamper && apptsBeforeTamper === apptsAfterTamper,
      'Rollback preservado: nenhum aluno ou reserva parcial persistiu após falha de modalidade'
    );

    // Escolha incompatível: serviço somente presencial recebendo modality='online' -> 400
    const mismatchMod = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'studio-teste-a',
      mode: 'service',
      serviceId: srvDancaGroup,
      modality: 'online',
      startTime: `${thursday1}T19:00:00`,
      endTime: `${thursday1}T20:00:00`,
      student: { fullName: 'Aluno Incompatível', phone: '11990000098' }
    });
    assert(mismatchMod.status === 400, 'Rejeita modalidade online para aula exclusivamente presencial (400)', mismatchMod.data);

    // Recorrência pública com serviço 'both' (2 semanas: wednesday1 e semana seguinte)
    const recurBoth = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'studio-teste-a',
      mode: 'service',
      serviceId: srvPilatesGroupBoth,
      startTime: `${wednesday1}T08:00:00`,
      endTime: `${wednesday1}T09:00:00`,
      recurrence: { frequency: 'weekly', maxOccurrences: 2 },
      student: { fullName: 'Aluno Recorrente Both', phone: '11990000012' }
    });
    assert(recurBoth.status === 201 && recurBoth.data.appointments.length === 2, 'Agendamento recorrente com serviço both cria 2 aulas concretas');
    const serModRow = db.prepare(`SELECT modality FROM class_series WHERE id = (SELECT series_id FROM appointments WHERE id = ?)`).get(recurBoth.data.appointments[0].id);
    assert(serModRow?.modality === 'presential', 'class_series.modality gravado como presential (nunca both)', serModRow);

    // -----------------------------------------------------------------
    // TESTE 3: Isolamento da Grade Semanal vs Horários Livres do Instrutor
    // -----------------------------------------------------------------
    console.log('\n--- TESTE 3: Disponibilidade Estrita pela Grade Semanal ---');

    // Terça-feira: Ana trabalha 07h-21h, mas Pilates Experimental só existe Seg/Qua/Sex!
    const tuesdaySlots = await makeReq('GET', `/api/v1/public/studio/slots?tenantSlug=studio-teste-a&serviceId=${srvPilatesGroupBoth}&date=${tuesday1}`);
    assert(
      tuesdaySlots.status === 200 && Array.isArray(tuesdaySlots.data.slots) && tuesdaySlots.data.slots.length === 0,
      'Terça-feira NÃO exibe horários para Pilates Experimental mesmo com expediente aberto do instrutor'
    );

    // Segunda-feira: somente o horário de 08:00 às 09:00 deve aparecer (com 7 de 8 vagas livres, 1 ocupada)
    const mondaySlots = await makeReq('GET', `/api/v1/public/studio/slots?tenantSlug=studio-teste-a&serviceId=${srvPilatesGroupBoth}&date=${monday1}`);
    assert(
      mondaySlots.status === 200 &&
      mondaySlots.data.slots.length === 1 &&
      mondaySlots.data.slots[0].time === '08:00' &&
      mondaySlots.data.slots[0].enrolledCount === 1 &&
      mondaySlots.data.slots[0].remainingSpots === 7 &&
      mondaySlots.data.slots[0].roomName === 'Sala Pilates 1',
      'Segunda-feira retorna apenas 08:00-09:00 com 1/8 ocupada, 7 vagas restantes e sala',
      mondaySlots.data.slots
    );

    // Consulta SEM data (Próximas turmas disponíveis)
    const upcomingRes = await makeReq('GET', `/api/v1/public/studio/slots?tenantSlug=studio-teste-a&serviceId=${srvPilatesGroupBoth}&includeUpcoming=1&startDate=${monday1}`);
    assert(
      upcomingRes.status === 200 &&
      upcomingRes.data.upcomingSlots.length >= 3 &&
      upcomingRes.data.weeklySummary.length >= 2,
      'Endpoint sem date retorna upcomingSlots e weeklySummary diretamente',
      { len: upcomingRes.data.upcomingSlots?.length, summary: upcomingRes.data.weeklySummary?.length }
    );

    // Tentativa de forçar reserva fora da grade (Terça 10h)
    const forceOffSchedule = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'studio-teste-a',
      mode: 'service',
      serviceId: srvPilatesGroupBoth,
      professionalId: profAna,
      startTime: `${tuesday1}T10:00:00`,
      endTime: `${tuesday1}T11:00:00`,
      student: { fullName: 'Aluno Fora Grade', phone: '11990000013' }
    });
    assert(
      forceOffSchedule.status === 409 && forceOffSchedule.data.code === 'SLOT_NOT_IN_CLASS_SCHEDULE',
      'Backend bloqueia agendamento em dia/horário fora da grade semanal (SLOT_NOT_IN_CLASS_SCHEDULE)',
      forceOffSchedule.data
    );

    // Aula coletiva sem nenhuma grade configurada
    const noScheduleSlots = await makeReq('GET', `/api/v1/public/studio/slots?tenantSlug=studio-teste-a&serviceId=${srvYogaNoSchedule}&includeUpcoming=1`);
    assert(noScheduleSlots.status === 200 && noScheduleSlots.data.upcomingSlots.length === 0, 'Aula coletiva sem grade cadastrada não exibe turmas falsas');
    const forceNoSchedule = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'studio-teste-a',
      mode: 'service',
      serviceId: srvYogaNoSchedule,
      startTime: `${monday1}T10:00:00`,
      student: { fullName: 'Aluno Sem Grade', phone: '11990000014' }
    });
    assert(forceNoSchedule.status === 409 && forceNoSchedule.data.code === 'CLASS_SCHEDULE_REQUIRED', 'Bloqueia agendamento público para aula coletiva sem grade (CLASS_SCHEDULE_REQUIRED)');

    // Conflito com bloqueio de agenda na Sexta 17:00 deve remover/bloquear essa turma
    db.prepare(`INSERT INTO blocked_times (id, tenant_id, professional_id, title, start_datetime, end_datetime, reason) VALUES (?, ?, ?, 'Bloqueio instrutora', ?, ?, 'Férias instrutora')`).run(
      'blk-' + uuidv4().slice(0, 6), studioA, profAna, `${friday1}T17:00:00`, `${friday1}T18:00:00`
    );
    const fridayBlockedSlots = await makeReq('GET', `/api/v1/public/studio/slots?tenantSlug=studio-teste-a&serviceId=${srvPilatesGroupBoth}&date=${friday1}`);
    assert(fridayBlockedSlots.status === 200 && fridayBlockedSlots.data.slots.length === 0, 'Bloqueio na agenda do instrutor remove automaticamente a turma da data afetada');

    // -----------------------------------------------------------------
    // TESTE 4: Capacidade (8 vagas) + Lotação + Cancelamento + Concorrência
    // -----------------------------------------------------------------
    console.log('\n--- TESTE 4: Capacidade Máxima, Lotação & Concorrência Atômica ---');

    // Já temos 1 aluno matriculado na segunda1 08:00. Matricular mais 7 alunos (total = 8/8)
    const bookedMonIds = [bookGroupBothOk.data.appointments[0].id];
    for (let i = 2; i <= 8; i++) {
      const r = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
        tenantSlug: 'studio-teste-a',
        mode: 'service',
        serviceId: srvPilatesGroupBoth,
        classScheduleId: schMonId,
        startTime: `${monday1}T08:00:00`,
        endTime: `${monday1}T09:00:00`,
        student: { fullName: `Aluno Vaga ${i}`, phone: `1199001000${i}` }
      });
      if (r.status !== 201) {
        assert(false, `Falha inesperada ao preencher vaga ${i}/8`, r.data);
      } else {
        bookedMonIds.push(r.data.appointments[0].id);
      }
    }

    const fullSlotsRes = await makeReq('GET', `/api/v1/public/studio/slots?tenantSlug=studio-teste-a&serviceId=${srvPilatesGroupBoth}&date=${monday1}`);
    assert(
      fullSlotsRes.status === 200 &&
      fullSlotsRes.data.slots[0]?.isFull === true &&
      fullSlotsRes.data.slots[0]?.remainingSpots === 0 &&
      fullSlotsRes.data.slots[0]?.statusLabel === 'Turma lotada' &&
      fullSlotsRes.data.totalAvailable === 0,
      'Turma com 8/8 alunos aparece marcada como Turma lotada (0 vagas restantes)',
      fullSlotsRes.data.slots[0]
    );

    // 9º aluno bloqueado
    const ninthTry = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'studio-teste-a',
      mode: 'service',
      serviceId: srvPilatesGroupBoth,
      classScheduleId: schMonId,
      startTime: `${monday1}T08:00:00`,
      endTime: `${monday1}T09:00:00`,
      student: { fullName: 'Aluno Nono Bloqueado', phone: '11990010099' }
    });
    assert(ninthTry.status === 409 && ninthTry.data.code === 'CLASS_FULL', '9º aluno bloqueado com 409 CLASS_FULL');

    // Cancelar 1 matrícula (8 -> 7) libera 1 vaga e testar concorrência na última vaga
    db.prepare(`UPDATE appointments SET status = 'cancelled' WHERE id = ? AND tenant_id = ?`).run(bookedMonIds[1], studioA);
    const reopenedRes = await makeReq('GET', `/api/v1/public/studio/slots?tenantSlug=studio-teste-a&serviceId=${srvPilatesGroupBoth}&date=${monday1}`);
    assert(reopenedRes.data.slots[0]?.remainingSpots === 1 && reopenedRes.data.slots[0]?.isFull === false, 'Cancelamento de 1 aluno reabre exatamente 1 vaga');

    // Disparo simultâneo de 2 solicitações concorrentes para a última vaga
    const [race1, race2] = await Promise.all([
      makeReq('POST', '/api/v1/public/studio/bookings', {}, {
        tenantSlug: 'studio-teste-a',
        mode: 'service',
        serviceId: srvPilatesGroupBoth,
        classScheduleId: schMonId,
        startTime: `${monday1}T08:00:00`,
        endTime: `${monday1}T09:00:00`,
        student: { fullName: 'Concorrente A', phone: '11990020001' }
      }),
      makeReq('POST', '/api/v1/public/studio/bookings', {}, {
        tenantSlug: 'studio-teste-a',
        mode: 'service',
        serviceId: srvPilatesGroupBoth,
        classScheduleId: schMonId,
        startTime: `${monday1}T08:00:00`,
        endTime: `${monday1}T09:00:00`,
        student: { fullName: 'Concorrente B', phone: '11990020002' }
      })
    ]);
    const raceStatuses = [race1.status, race2.status].sort();
    assert(
      raceStatuses[0] === 201 && raceStatuses[1] === 409,
      'Reserva simultânea para última vaga: exatamente 1 vence (201) e 1 recebe lotação (409)',
      { race1: race1.status, race2: race2.status }
    );

    // -----------------------------------------------------------------
    // TESTE 5: Pacote Multisserviços com Grades Independentes + Zero Cobrança Extra
    // -----------------------------------------------------------------
    console.log('\n--- TESTE 5: Pacote Multisserviços com Grades Separadas ---');

    const pkgCreateRes = await makeReq('POST', '/api/v1/packages', authStudioA, {
      name: 'Combo Pilates + Dança + Zumba',
      billingType: 'recurring_monthly',
      price: 250,
      creditMode: 'per_service',
      validityDays: 30,
      allowPublicBooking: true,
      items: [
        { serviceId: srvPilatesGroupBoth, includedCredits: 4 },
        { serviceId: srvDancaGroup, includedCredits: 4 },
        { serviceId: srvZumbaGroupOnline, includedCredits: 4 }
      ]
    });
    assert(pkgCreateRes.status === 201, 'Pacote multissserviços criado para grades distintas');
    const pkgId = pkgCreateRes.data.package.id;

    // Verificar exposição de grade semanal no perfil público do Studio
    const pubProfile = await makeReq('GET', '/api/v1/public/tenants/studio-teste-a');
    const pubPilatesSrv = (pubProfile.data.services || []).find(s => s.id === srvPilatesGroupBoth);
    assert(
      pubProfile.status === 200 &&
      pubPilatesSrv?.weekly_schedule_summary?.length >= 2,
      'Perfil público expõe weekly_schedule_summary por serviço'
    );

    // Semana +3 (monday2 / thursday2 / saturday2) livre para contratar o pacote completo
    const wednesday2 = getNextWeekdayIso(3, 3);
    const thursday2 = getNextWeekdayIso(4, 3);
    const saturday2 = getNextWeekdayIso(6, 3);

    const pkgBookRes = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'studio-teste-a',
      mode: 'package',
      packageId: pkgId,
      schedules: [
        { serviceId: srvPilatesGroupBoth, modality: 'presential', startTime: `${wednesday2}T08:00:00`, endTime: `${wednesday2}T09:00:00` },
        { serviceId: srvDancaGroup, modality: 'presential', startTime: `${thursday2}T19:00:00`, endTime: `${thursday2}T20:00:00` },
        { serviceId: srvZumbaGroupOnline, modality: 'online', startTime: `${saturday2}T10:00:00`, endTime: `${saturday2}T11:00:00` }
      ],
      student: { fullName: 'Helena Pacote Grades', phone: '11998887766' }
    });
    assert(
      pkgBookRes.status === 201 &&
      pkgBookRes.data.appointments.length === 3 &&
      pkgBookRes.data.appointments[0].modality === 'presential' &&
      pkgBookRes.data.appointments[1].modality === 'presential' &&
      pkgBookRes.data.appointments[2].modality === 'online',
      'Pacote agenda cada modalidade conforme sua própria grade (Quarta 08h, Quinta 19h, Sábado 10h) com modalidades concretas',
      pkgBookRes.data
    );

    const extraPayments = db.prepare(`SELECT COUNT(*) as c FROM payments WHERE appointment_id IN (?, ?, ?)`).get(
      pkgBookRes.data.appointments[0].id,
      pkgBookRes.data.appointments[1].id,
      pkgBookRes.data.appointments[2].id
    ).c;
    assert(extraPayments === 0, 'Aulas agendadas dentro do pacote não geram cobrança avulsa por sessão');

    // Tentar usar modalidade 'both' dentro de pacote -> bloqueado e rollback completo (sem contrato órfão!)
    const contractsBeforeFail = db.prepare(`SELECT COUNT(*) as c FROM student_package_contracts WHERE tenant_id = ?`).get(studioA).c;
    const pkgTamper = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'studio-teste-a',
      mode: 'package',
      packageId: pkgId,
      schedules: [
        { serviceId: srvPilatesGroupBoth, modality: 'both', startTime: `${wednesday2}T08:00:00`, endTime: `${wednesday2}T09:00:00` }
      ],
      student: { fullName: 'Helena Tamper', phone: '11998880000' }
    });
    const contractsAfterFail = db.prepare(`SELECT COUNT(*) as c FROM student_package_contracts WHERE tenant_id = ?`).get(studioA).c;
    assert(
      pkgTamper.status === 400 &&
      !String(pkgTamper.raw).includes('CHECK constraint') &&
      contractsBeforeFail === contractsAfterFail,
      'Pacote com modality=both falha de forma limpa (400) e faz rollback integral sem contrato órfão'
    );

    // Preservação do fluxo tradicional de Clínica
    const clinicSlots = await makeReq('GET', `/api/v1/public/slots/available?tenantSlug=clinica-c&professionalId=${profClinica}&serviceId=${srvClinica}&date=${monday1}`);
    assert(clinicSlots.status === 200 && Array.isArray(clinicSlots.data.slots) && clinicSlots.data.slots.length > 0, 'Clínica tradicional continua funcionando com slots padrão');

    console.log('\n==============================================================');
    console.log(`RESULTADO FINAL: ${passed} PASSARAM, ${failed} FALHARAM.`);
    console.log('==============================================================\n');
    process.exitCode = failed > 0 ? 1 : 0;
  } catch (err) {
    console.error('Erro fatal durante execução dos testes:', err);
    process.exitCode = 1;
  } finally {
    server.close();
    for (const ext of ['', '-wal', '-shm']) {
      try {
        if (fs.existsSync(process.env.DATABASE_PATH + ext)) {
          fs.unlinkSync(process.env.DATABASE_PATH + ext);
        }
      } catch (_) {}
    }
  }
}

runTests();
