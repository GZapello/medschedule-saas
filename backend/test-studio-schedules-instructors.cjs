const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_studio_schedules_instructors.db');
process.env.JWT_SECRET = 'test-studio-sched-instr-secret-2026';
process.env.ZEMDA_FILES_SIGNING_SECRET = 'test-studio-sched-instr-files-secret';
process.env.PORT = '3109';

for (const ext of ['', '-wal', '-shm']) {
  const f = process.env.DATABASE_PATH + ext;
  if (fs.existsSync(f)) fs.unlinkSync(f);
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

function assert(cond, msg, extra) {
  if (cond) {
    console.log(`  ✅ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${msg}`, extra ? JSON.stringify(extra).slice(0, 300) : '');
    failed++;
  }
}

function makeReq(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3109,
        path: urlPath,
        method,
        headers: { 'Content-Type': 'application/json', ...headers }
      },
      res => {
        let data = '';
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        });
      }
    );
    req.on('error', reject);
    if (body !== null) req.write(JSON.stringify(body));
    req.end();
  });
}

function getNextWeekdayIso(targetWeekday, offsetWeeks = 1) {
  const now = new Date(Date.now() - 3 * 3600 * 1000);
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
  const diff = (targetWeekday - base.getUTCDay() + 7) % 7 || 7;
  base.setUTCDate(base.getUTCDate() + diff + (offsetWeeks - 1) * 7);
  return base.toISOString().slice(0, 10);
}

async function runTests() {
  const server = app.listen(3109);
  console.log('\n====================================================================');
  console.log('SUÍTE DE TESTES: GRADE SEMANAL E MÚLTIPLOS INSTRUTORES (ZEMDA STUDIO)');
  console.log('====================================================================\n');

  try {
    const studioA = 'ten-st-a-' + uuidv4().slice(0, 6);
    const studioB = 'ten-st-b-' + uuidv4().slice(0, 6);
    const clinicC = 'ten-cl-c-' + uuidv4().slice(0, 6);
    const mixedD = 'ten-mx-d-' + uuidv4().slice(0, 6);

    const insTenant = db.prepare(`
      INSERT INTO tenants (id, name, trade_name, slug, email, status, billing_required, public_booking_enabled, establishment_profile, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', 0, 1, ?, datetime('now'), datetime('now'))
    `);
    insTenant.run(studioA, 'Studio Movimento A', 'Studio Movimento A', 'studio-mov-a', 'a@studio.test', 'studio');
    insTenant.run(studioB, 'Studio Vizinho B', 'Studio Vizinho B', 'studio-viz-b', 'b@studio.test', 'studio');
    insTenant.run(clinicC, 'Clínica Médica C', 'Clínica C', 'clinica-c', 'c@clinica.test', 'clinic');
    insTenant.run(mixedD, 'Espaço Misto D', 'Espaço D', 'espaco-d', 'd@misto.test', 'mixed');

    const admA = 'usr-adm-a';
    const mgrA = 'usr-mgr-a';
    const admB = 'usr-adm-b';
    const admC = 'usr-adm-c';
    const admD = 'usr-adm-d';
    const insUser = db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, 'hash', ?, 'active')`);
    insUser.run(admA, studioA, 'Admin Studio A', 'adma@test.com', 'clinic_admin');
    insUser.run(mgrA, studioA, 'Gerente Studio A', 'mgra@test.com', 'receptionist');
    insUser.run(admB, studioB, 'Admin Studio B', 'admb@test.com', 'clinic_admin');
    insUser.run(admC, clinicC, 'Admin Clínica C', 'admc@test.com', 'clinic_admin');
    insUser.run(admD, mixedD, 'Admin Misto D', 'admd@test.com', 'clinic_admin');

    const insCu = db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json) VALUES (?, ?, ?, ?, 'active', ?, ?)`);
    insCu.run('cu-a1', studioA, admA, 'clinic_admin', 1, '["manage_services","view_all_schedules"]');
    insCu.run('cu-a2', studioA, mgrA, 'receptionist', 0, '["manage_services","view_all_schedules"]');
    insCu.run('cu-b1', studioB, admB, 'clinic_admin', 1, '["manage_services","view_all_schedules"]');
    insCu.run('cu-c1', clinicC, admC, 'clinic_admin', 1, '["manage_services","view_all_schedules"]');
    insCu.run('cu-d1', mixedD, admD, 'clinic_admin', 1, '["manage_services","view_all_schedules"]');

    const authA = { Authorization: `Bearer ${generateToken({ userId: admA, tenantId: studioA, email: 'adma@test.com', role: 'clinic_admin', name: 'Admin A' })}`, 'x-tenant-id': studioA };
    const authMgrA = { Authorization: `Bearer ${generateToken({ userId: mgrA, tenantId: studioA, email: 'mgra@test.com', role: 'receptionist', name: 'Gerente A' })}`, 'x-tenant-id': studioA };
    const authB = { Authorization: `Bearer ${generateToken({ userId: admB, tenantId: studioB, email: 'admb@test.com', role: 'clinic_admin', name: 'Admin B' })}`, 'x-tenant-id': studioB };
    const authC = { Authorization: `Bearer ${generateToken({ userId: admC, tenantId: clinicC, email: 'admc@test.com', role: 'clinic_admin', name: 'Admin C' })}`, 'x-tenant-id': clinicC };
    const authD = { Authorization: `Bearer ${generateToken({ userId: admD, tenantId: mixedD, email: 'admd@test.com', role: 'clinic_admin', name: 'Admin D' })}`, 'x-tenant-id': mixedD };

    // Professionals in Studio A
    const profA1 = 'prof-a1-' + uuidv4().slice(0, 6);
    const profA2 = 'prof-a2-' + uuidv4().slice(0, 6);
    const profA3 = 'prof-a3-' + uuidv4().slice(0, 6);
    const profA4 = 'prof-a4-' + uuidv4().slice(0, 6);
    const profA5Private = 'prof-a5-priv-' + uuidv4().slice(0, 6);
    const profB1 = 'prof-b1-' + uuidv4().slice(0, 6);
    const profC1 = 'prof-c1-' + uuidv4().slice(0, 6);
    const profD1 = 'prof-d1-' + uuidv4().slice(0, 6);
    const profD2 = 'prof-d2-' + uuidv4().slice(0, 6);

    const insProf = db.prepare(`INSERT INTO professionals (id, tenant_id, name, slug, profession_id, profession_name, active, public_booking_enabled) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`);
    insProf.run(profA1, studioA, 'Instrutora Ana', 'ana-a', 'prof-instrutor', 'Instrutor de Pilates', 1);
    insProf.run(profA2, studioA, 'Instrutor Bruno', 'bruno-a', 'prof-instrutor', 'Instrutor de Pilates', 1);
    insProf.run(profA3, studioA, 'Instrutora Carla', 'carla-a', 'prof-instrutor', 'Instrutor de Pilates', 1);
    insProf.run(profA4, studioA, 'Instrutor Diego', 'diego-a', 'prof-instrutor', 'Instrutor', 1);
    insProf.run(profA5Private, studioA, 'Instrutor Sem Público', 'priv-a', 'prof-instrutor', 'Instrutor', 0);
    insProf.run(profB1, studioB, 'Instrutor Outro Studio', 'outro-b', 'prof-instrutor', 'Instrutor', 1);
    insProf.run(profC1, clinicC, 'Dra. Clínica', 'dra-c', 'prof-medico', 'Médico', 1);
    insProf.run(profD1, mixedD, 'Prof Misto 1', 'misto-1', 'prof-fisioterapeuta', 'Fisioterapeuta', 1);
    insProf.run(profD2, mixedD, 'Prof Misto 2', 'misto-2', 'prof-instrutor', 'Instrutor', 1);

    // Schedules: Seg-Sex 07:00-21:00 for A1..A4, B1, C1, D1, D2; ONLY Segunda 07:00-12:00 for A5Private
    const insSched = db.prepare(`INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)`);
    for (let dow = 1; dow <= 5; dow++) {
      for (const pid of [profA1, profA2, profA3, profA4]) insSched.run(uuidv4(), studioA, pid, dow, '07:00', '21:00');
      insSched.run(uuidv4(), studioB, profB1, dow, '07:00', '21:00');
      insSched.run(uuidv4(), clinicC, profC1, dow, '07:00', '21:00');
      insSched.run(uuidv4(), mixedD, profD1, dow, '07:00', '21:00');
      insSched.run(uuidv4(), mixedD, profD2, dow, '07:00', '21:00');
    }
    insSched.run(uuidv4(), studioA, profA5Private, 1, '07:00', '12:00');

    // -----------------------------------------------------------------
    // TESTE 1: Serviço único com 3 instrutores vinculados
    // -----------------------------------------------------------------
    console.log('--- TESTE 1: Serviço Único com 3 Instrutores Vinculados ---');
    const createPilates = await makeReq('POST', '/api/v1/services', authA, {
      professionalId: profA1,
      linkedProfessionalIds: [profA1, profA2, profA3, profA2], // inclui duplicata proposital
      name: 'Pilates Studio',
      durationMinutes: 50,
      bufferMinutes: 10,
      price: 120,
      modality: 'presential',
      serviceKind: 'group',
      defaultCapacity: 8,
      serviceDomain: 'studio',
      classSchedules: [
        { weekdays: [1], startTime: '08:00', endTime: '08:50', professionalId: profA1, capacity: 8, modality: 'presential', effectiveStartDate: '2026-01-01' },
        { weekdays: [3], startTime: '10:00', endTime: '10:50', professionalId: profA2, capacity: 8, modality: 'presential', effectiveStartDate: '2026-01-01' },
        { weekdays: [5], startTime: '18:00', endTime: '18:50', professionalId: profA3, capacity: 8, modality: 'presential', effectiveStartDate: '2026-01-01' }
      ]
    });
    assert(createPilates.status === 201 && createPilates.data?.id, 'Serviço Pilates Studio criado em transação única', createPilates.data);
    const srvPilates = createPilates.data.id;

    const srvCount = db.prepare(`SELECT COUNT(*) as c FROM services WHERE tenant_id = ? AND name = 'Pilates Studio'`).get(studioA).c;
    const psCount = db.prepare(`SELECT COUNT(*) as c FROM professional_services WHERE service_id = ?`).get(srvPilates).c;
    assert(srvCount === 1, 'Existe exatamente 1 registro do serviço Pilates no catálogo (sem duplicação)');
    assert(psCount === 3, 'Existem exatamente 3 vínculos únicos na tabela professional_services');

    const listAllA = await makeReq('GET', '/api/v1/services', authA);
    const pilatesListed = (listAllA.data || []).find(s => s.id === srvPilates);
    assert(
      pilatesListed &&
      Array.isArray(pilatesListed.linked_professional_ids) &&
      pilatesListed.linked_professional_ids.length === 3 &&
      pilatesListed.linked_professionals?.length === 3,
      'GET /v1/services retorna 1 serviço com linked_professional_ids (3) e linked_professionals (3)'
    );

    const listByBruno = await makeReq('GET', `/api/v1/services?professionalId=${profA2}`, authA);
    assert(
      Array.isArray(listByBruno.data) && listByBruno.data.filter(s => s.id === srvPilates).length === 1,
      'Filtro por instrutor vinculado (Bruno) retorna Pilates sem duplicação'
    );

    // -----------------------------------------------------------------
    // TESTE 2: Grade semanal Seg/Qua/Sex com instrutores distintos
    // -----------------------------------------------------------------
    console.log('\n--- TESTE 2: Grade Semanal Persistida (Seg 08h, Qua 10h, Sex 18h) ---');
    const schedListRes = await makeReq('GET', `/api/v1/services/${srvPilates}/class-schedules?includeInactive=1`, authA);
    const schs = schedListRes.data?.schedules || [];
    assert(
      schedListRes.status === 200 &&
      schs.length === 3 &&
      schs.some(s => s.day_of_week === 1 && s.start_time === '08:00' && s.professional_id === profA1) &&
      schs.some(s => s.day_of_week === 3 && s.start_time === '10:00' && s.professional_id === profA2) &&
      schs.some(s => s.day_of_week === 5 && s.start_time === '18:00' && s.professional_id === profA3) &&
      schedListRes.data?.diagnostics?.isPublicReady === true &&
      schedListRes.data?.diagnostics?.publishableCount === 3,
      'Grade semanal Seg/Qua/Sex com instrutores A1/A2/A3 persistida e diagnosticada como pública'
    );

    // -----------------------------------------------------------------
    // TESTE 3: Disponibilização pública real vs Rascunho sem grade
    // -----------------------------------------------------------------
    console.log('\n--- TESTE 3: Agendamento Público Real & Bloqueio de Aula Sem Horários ---');
    const createDraftYoga = await makeReq('POST', '/api/v1/services', authA, {
      professionalId: profA1,
      name: 'Yoga Rascunho Sem Horário',
      durationMinutes: 50,
      price: 90,
      modality: 'presential',
      serviceKind: 'group',
      defaultCapacity: 10,
      serviceDomain: 'studio',
      classSchedules: []
    });
    assert(
      createDraftYoga.status === 201 &&
      createDraftYoga.data.schedule_diagnostics?.isPublicReady === false &&
      createDraftYoga.data.schedule_diagnostics?.blockers?.[0]?.includes('não possui dias e horários cadastrados'),
      'Aula coletiva sem grade pode ser salva como rascunho interno com aviso claro de indisponibilidade pública'
    );
    const srvYogaDraft = createDraftYoga.data.id;

    const pubProfileA = await makeReq('GET', '/api/v1/public/tenants/studio-mov-a');
    const pubServicesA = pubProfileA.data?.services || [];
    assert(
      pubServicesA.some(s => s.id === srvPilates && s.has_public_schedules === true && s.linked_professionals?.length === 3) &&
      !pubServicesA.some(s => s.id === srvYogaDraft),
      'Perfil público expõe Pilates (3 instrutores e grade) e oculta aula coletiva sem horários cadastrados'
    );

    const draftPublicBook = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'studio-mov-a',
      mode: 'service',
      serviceId: srvYogaDraft,
      startTime: `${getNextWeekdayIso(1, 2)}T09:00:00`,
      student: { fullName: 'Teste Bloqueio', phone: '11988887777' }
    });
    assert(draftPublicBook.status === 409 && draftPublicBook.data.code === 'CLASS_SCHEDULE_REQUIRED', 'Booking direto para aula sem grade é bloqueado (409 CLASS_SCHEDULE_REQUIRED)');

    // -----------------------------------------------------------------
    // TESTE 4: Filtro por instrutor no agendamento público (Todos vs Bruno)
    // -----------------------------------------------------------------
    console.log('\n--- TESTE 4: Filtro por Instrutor no Agendamento Público ---');
    const upcomingStart = getNextWeekdayIso(1, 1);
    const pubSlotsAny = await makeReq('GET', `/api/v1/public/studio/slots?tenantSlug=studio-mov-a&serviceId=${srvPilates}&includeUpcoming=1&startDate=${upcomingStart}`);
    const upcomingAny = pubSlotsAny.data?.upcomingSlots || [];
    assert(
      pubSlotsAny.status === 200 &&
      pubSlotsAny.data?.professionals?.length === 3 &&
      upcomingAny.some(u => u.professionalId === profA1 && u.time === '08:00') &&
      upcomingAny.some(u => u.professionalId === profA2 && u.time === '10:00') &&
      upcomingAny.some(u => u.professionalId === profA3 && u.time === '18:00'),
      'Filtro "Qualquer instrutor" exibe turmas de Ana (08h), Bruno (10h) e Carla (18h)'
    );

    const pubSlotsBruno = await makeReq('GET', `/api/v1/public/studio/slots?tenantSlug=studio-mov-a&serviceId=${srvPilates}&professionalId=${profA2}&includeUpcoming=1&startDate=${upcomingStart}`);
    const upcomingBruno = pubSlotsBruno.data?.upcomingSlots || [];
    assert(
      pubSlotsBruno.status === 200 &&
      upcomingBruno.length > 0 &&
      upcomingBruno.every(u => u.professionalId === profA2 && u.dayOfWeek === 3 && u.time === '10:00'),
      'Filtro específico por Bruno retorna somente as turmas de Quarta 10:00'
    );

    // -----------------------------------------------------------------
    // TESTE 5: Criação completa pelo modal rápido (NewServiceModal payload)
    // -----------------------------------------------------------------
    console.log('\n--- TESTE 5: Payload do Modal Rápido (Serviço + Instrutores + Horários) ---');
    const quickModalRes = await makeReq('POST', '/api/v1/services', authA, {
      professionalId: profA1,
      linkedProfessionalIds: [profA1, profA2],
      name: 'Zumba Express',
      durationMinutes: 50,
      bufferMinutes: 0,
      price: 75,
      modality: 'both',
      serviceKind: 'group',
      defaultCapacity: 12,
      serviceDomain: 'studio',
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['weekly', 'custom_weekdays'],
      defaultRecurrenceFrequency: 'weekly',
      classSchedules: [
        { weekdays: [2, 4], startTime: '09:00', endTime: '09:50', professionalId: profA2, capacity: 12, modality: 'presential' }
      ]
    });
    assert(
      quickModalRes.status === 201 &&
      quickModalRes.data.linked_professional_ids?.length === 2 &&
      quickModalRes.data.class_schedules?.length === 2 &&
      quickModalRes.data.schedule_diagnostics?.publishableCount === 2,
      'Modal rápido cria serviço + 2 instrutores + grade Ter/Qui 09:00 em operação única'
    );

    // -----------------------------------------------------------------
    // TESTE 6: Edição preservando horários anteriores & proteção ao desvincular
    // -----------------------------------------------------------------
    console.log('\n--- TESTE 6: Edição (Adicionar 4º Instrutor + Novo Horário + Bloqueio ao Remover Instrutor Ativo) ---');
    // Usuário com permissão manage_services edita serviço adicionando 4º instrutor (Diego)
    const editAddDiego = await makeReq('PUT', `/api/v1/services/${srvPilates}`, authMgrA, {
      linkedProfessionalIds: [profA1, profA2, profA3, profA4]
    });
    assert(
      editAddDiego.status === 200 &&
      editAddDiego.data.linked_professional_ids?.length === 4,
      'PUT /v1/services/:id com permissão manage_services adiciona 4º instrutor (Diego) sem duplicar serviço'
    );

    const addTueDiego = await makeReq('POST', `/api/v1/services/${srvPilates}/class-schedules`, authMgrA, {
      weekdays: [2],
      startTime: '14:00',
      endTime: '14:50',
      professionalId: profA4,
      capacity: 8,
      modality: 'presential',
      effectiveStartDate: '2026-01-01'
    });
    assert(
      addTueDiego.status === 201 && addTueDiego.data.schedules?.length === 4,
      'Novo horário (Terça 14h com Diego) adicionado preservando os 3 horários anteriores'
    );

    // Tentar remover instrutor Ana (profA1) que tem horário ativo na Segunda -> 409!
    const failUnlinkActive = await makeReq('PUT', `/api/v1/services/${srvPilates}`, authMgrA, {
      professionalId: profA2,
      linkedProfessionalIds: [profA2, profA3, profA4]
    });
    assert(
      failUnlinkActive.status === 409 && failUnlinkActive.data.code === 'INSTRUCTOR_HAS_ACTIVE_SCHEDULES',
      'Bloqueia desvincular instrutor com horário ativo na grade (HTTP 409 INSTRUCTOR_HAS_ACTIVE_SCHEDULES)'
    );

    // Remover horário de Terça de Diego -> depois desvincular Diego com sucesso
    const diegoSch = (addTueDiego.data.schedules || []).find(s => s.professional_id === profA4);
    await makeReq('DELETE', `/api/v1/services/${srvPilates}/class-schedules/${diegoSch.id}`, authMgrA);
    const unlinkDiegoOk = await makeReq('PUT', `/api/v1/services/${srvPilates}`, authMgrA, {
      linkedProfessionalIds: [profA1, profA2, profA3]
    });
    assert(
      unlinkDiegoOk.status === 200 && unlinkDiegoOk.data.linked_professional_ids?.length === 3,
      'Permite desvincular instrutor sem horários ativos ou reservas futuras'
    );

    // -----------------------------------------------------------------
    // TESTE 7: Diagnóstico de Indisponibilidade (Instrutor Sem Agendamento Público / Fora da Escala)
    // -----------------------------------------------------------------
    console.log('\n--- TESTE 7: Diagnóstico Claro de Indisponibilidade Pública ---');
    const srvDiag = await makeReq('POST', '/api/v1/services', authA, {
      professionalId: profA5Private,
      name: 'Alongamento Restrito',
      durationMinutes: 50,
      price: 70,
      modality: 'presential',
      serviceKind: 'group',
      defaultCapacity: 8,
      serviceDomain: 'studio',
      classSchedules: [
        { weekdays: [1], startTime: '09:00', endTime: '09:50', professionalId: profA5Private, capacity: 8, modality: 'presential', effectiveStartDate: '2026-01-01' }
      ]
    });
    const diagId = srvDiag.data.id;
    const slotsDiagRes = await makeReq('GET', `/api/v1/public/studio/slots?tenantSlug=studio-mov-a&serviceId=${diagId}&includeUpcoming=1&startDate=${upcomingStart}`);
    assert(
      slotsDiagRes.status === 200 &&
      (slotsDiagRes.data.upcomingSlots || []).length === 0 &&
      typeof slotsDiagRes.data.emptyReason === 'string' &&
      slotsDiagRes.data.emptyReason.includes('agendamento público desativado') &&
      !slotsDiagRes.data.emptyReason.toLowerCase().includes('sql'),
      'Diagnóstico explica em linguagem clara que o instrutor está com agendamento público desativado (sem expor SQL)',
      slotsDiagRes.data.emptyReason
    );

    // Horário fora da escala geral de profA1 (sábado dow=6 não tem expediente)
    const srvOutShift = await makeReq('POST', '/api/v1/services', authA, {
      professionalId: profA1,
      name: 'Pilates Sábado Sem Escala',
      durationMinutes: 50,
      price: 90,
      modality: 'presential',
      serviceKind: 'group',
      defaultCapacity: 8,
      serviceDomain: 'studio',
      classSchedules: [
        { weekdays: [6], startTime: '09:00', endTime: '09:50', professionalId: profA1, capacity: 8, modality: 'presential', effectiveStartDate: '2026-01-01' }
      ]
    });
    assert(
      srvOutShift.data.schedule_warnings?.length > 0 &&
      srvOutShift.data.schedule_diagnostics?.publishableCount === 0 &&
      srvOutShift.data.schedule_diagnostics?.blockers?.[0]?.includes('fora da escala geral'),
      'Detecta horário fora da escala geral do instrutor com blocker claro',
      srvOutShift.data.schedule_diagnostics
    );

    // -----------------------------------------------------------------
    // TESTE 8: Capacidade e Lotação (8 vagas, 9º aluno bloqueado)
    // -----------------------------------------------------------------
    console.log('\n--- TESTE 8: Capacidade Máxima (8 vagas) & Bloqueio do 9º Aluno ---');
    const monNext = getNextWeekdayIso(1, 2);
    const monSch = schs.find(s => s.day_of_week === 1);
    for (let i = 1; i <= 8; i++) {
      const b = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
        tenantSlug: 'studio-mov-a',
        mode: 'service',
        serviceId: srvPilates,
        classScheduleId: monSch.id,
        startTime: `${monNext}T08:00:00`,
        endTime: `${monNext}T08:50:00`,
        student: { fullName: `Aluno Pilates ${i}`, phone: `1199100000${i}` }
      });
      if (b.status !== 201) assert(false, `Falha inesperada na vaga ${i}/8`, b.data);
    }

    const fullDaySlots = await makeReq('GET', `/api/v1/public/studio/slots?tenantSlug=studio-mov-a&serviceId=${srvPilates}&date=${monNext}`);
    assert(
      fullDaySlots.status === 200 &&
      fullDaySlots.data.slots[0]?.isFull === true &&
      fullDaySlots.data.slots[0]?.remainingSpots === 0 &&
      fullDaySlots.data.slots[0]?.enrolledCount === 8 &&
      fullDaySlots.data.slots[0]?.statusLabel === 'Turma lotada',
      'Após 8 matrículas, turma exibe 8/8 ocupadas, 0 vagas restantes e status Turma lotada'
    );

    const ninthBooking = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'studio-mov-a',
      mode: 'service',
      serviceId: srvPilates,
      classScheduleId: monSch.id,
      startTime: `${monNext}T08:00:00`,
      endTime: `${monNext}T08:50:00`,
      student: { fullName: '9º Aluno Bloqueado', phone: '11991000099' }
    });
    assert(ninthBooking.status === 409 && ninthBooking.data.code === 'CLASS_FULL', '9º aluno bloqueado com HTTP 409 CLASS_FULL');

    // -----------------------------------------------------------------
    // TESTE 9: Isolamento Multi-Tenant e Misto
    // -----------------------------------------------------------------
    console.log('\n--- TESTE 9: Isolamento Multi-Tenant & Estabelecimento Misto ---');
    const crossLinkRes = await makeReq('POST', '/api/v1/services', authA, {
      professionalId: profA1,
      linkedProfessionalIds: [profA1, profB1], // profB1 pertence ao Studio B!
      name: 'Tentativa Cross Tenant',
      durationMinutes: 50,
      price: 100,
      modality: 'presential',
      serviceKind: 'group',
      defaultCapacity: 8,
      serviceDomain: 'studio'
    });
    assert(
      crossLinkRes.status === 400 && crossLinkRes.data.code === 'CROSS_TENANT_OR_MISSING_INSTRUCTOR',
      'Rejeita vínculo de instrutor de outro estabelecimento (HTTP 400)'
    );

    const crossMutateSchedule = await makeReq('POST', `/api/v1/services/${srvPilates}/class-schedules`, authB, {
      weekdays: [4],
      startTime: '15:00',
      endTime: '15:50',
      professionalId: profB1
    });
    assert(crossMutateSchedule.status === 404, 'Studio B não acessa/altera grade de serviço do Studio A (404)');

    const mixedClinicalMultiFail = await makeReq('POST', '/api/v1/services', authD, {
      professionalId: profD1,
      linkedProfessionalIds: [profD1, profD2],
      name: 'Consulta Fisioterapia Clínica',
      durationMinutes: 50,
      price: 200,
      modality: 'presential',
      serviceDomain: 'clinical'
    });
    assert(
      mixedClinicalMultiFail.status === 400,
      'Em estabelecimento Misto, serviço de domínio clínico não permite múltiplos instrutores'
    );

    const mixedStudioMultiOk = await makeReq('POST', '/api/v1/services', authD, {
      professionalId: profD2,
      linkedProfessionalIds: [profD1, profD2],
      name: 'Pilates Misto Studio',
      durationMinutes: 50,
      price: 110,
      modality: 'presential',
      serviceDomain: 'studio',
      serviceKind: 'group',
      defaultCapacity: 6,
      classSchedules: [
        { weekdays: [3], startTime: '09:00', endTime: '09:50', professionalId: profD2, capacity: 6, modality: 'presential' }
      ]
    });
    assert(
      mixedStudioMultiOk.status === 201 && mixedStudioMultiOk.data.linked_professional_ids?.length === 2,
      'Em estabelecimento Misto, serviço de domínio Studio permite múltiplos instrutores e grade semanal'
    );

    // -----------------------------------------------------------------
    // TESTE 10: Preservação de Clínicas Tradicionais
    // -----------------------------------------------------------------
    console.log('\n--- TESTE 10: Preservação Total de Clínicas Tradicionais ---');
    const clinicOk = await makeReq('POST', '/api/v1/services', authC, {
      professionalId: profC1,
      name: 'Consulta Médica Tradicional',
      durationMinutes: 30,
      price: 350,
      modality: 'presential'
    });
    assert(clinicOk.status === 201 && clinicOk.data.service_domain === 'clinical', 'Clínica tradicional cria consulta individual normalmente');

    const clinicBlockGroup = await makeReq('POST', '/api/v1/services', authC, {
      professionalId: profC1,
      name: 'Turma Clínica Proibida',
      durationMinutes: 50,
      price: 100,
      serviceKind: 'group',
      defaultCapacity: 10
    });
    assert(clinicBlockGroup.status === 400, 'Clínica tradicional bloqueada de criar aula coletiva / turma');

    const clinicList = await makeReq('GET', '/api/v1/services', authC);
    const listedClinSrv = (clinicList.data || []).find(s => s.id === clinicOk.data.id);
    assert(
      listedClinSrv &&
      listedClinSrv.service_kind === 'individual' &&
      listedClinSrv.class_schedules.length === 0,
      'Listagem da clínica tradicional preserva fluxo clínico sem recursos de Studio'
    );

    console.log('\n====================================================================');
    console.log(`RESULTADO FINAL: ${passed} PASSARAM, ${failed} FALHARAM.`);
    console.log('====================================================================\n');
    process.exitCode = failed > 0 ? 1 : 0;
  } catch (err) {
    console.error('Erro fatal durante execução dos testes:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

runTests();
