const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.resolve(__dirname, 'test_studio_flexible_recurrence.db');
process.env.DATABASE_PATH = DB_PATH;
process.env.JWT_SECRET = 'test-studio-flex-recurrence-secret-2026';
process.env.ZEMDA_FILES_SIGNING_SECRET = 'test-studio-flex-files-secret-123456';
process.env.PORT = '3112';

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
    console.error(`  [FAIL] ${msg}${detail !== undefined ? ' -> ' + JSON.stringify(detail).slice(0, 400) : ''}`);
    failed++;
  }
}

function makeReq(method, reqPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 3112,
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

async function runTests() {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(3112, resolve));

  console.log('\n===========================================================================');
  console.log('TESTES: Recorrência Flexível e Inteligente por Serviço (Zemda Studio)');
  console.log('===========================================================================\n');

  try {
    const studioId = 'ten-flex-stu-' + uuidv4().slice(0, 6);
    const otherStudioId = 'ten-flex-oth-' + uuidv4().slice(0, 6);
    const clinicId = 'ten-flex-cli-' + uuidv4().slice(0, 6);
    const mixedId = 'ten-flex-mix-' + uuidv4().slice(0, 6);

    let profType = db.prepare(`SELECT id FROM professions WHERE lower(name) = lower('Educação Física')`).get()?.id;
    if (!profType) {
      profType = 'prof-type-edfis-' + uuidv4().slice(0, 6);
      db.prepare(`INSERT OR IGNORE INTO professions (id, name) VALUES (?, 'Educação Física')`).run(profType);
    }

    const insTenant = db.prepare(`
      INSERT INTO tenants (
        id, name, trade_name, slug, email, status, billing_required,
        public_booking_enabled, establishment_profile, business_hours_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'active', 0, 1, ?, ?, datetime('now'), datetime('now'))
    `);

    const studioHours = JSON.stringify({
      monday: { enabled: true, open: '07:00', close: '21:00' },
      tuesday: { enabled: true, open: '07:00', close: '21:00' },
      wednesday: { enabled: true, open: '07:00', close: '21:00' },
      thursday: { enabled: true, open: '07:00', close: '21:00' },
      friday: { enabled: true, open: '07:00', close: '21:00' },
      saturday: { enabled: true, open: '08:00', close: '14:00' },
      sunday: { enabled: false, open: '08:00', close: '12:00' }
    });

    insTenant.run(studioId, 'Studio Flex Move', 'Studio Flex Move', 'studio-flex-move', 'flex@studio.test', 'studio', studioHours);
    insTenant.run(otherStudioId, 'Outro Studio Isolado', 'Outro Studio', 'outro-studio-flex', 'outro@studio.test', 'studio', studioHours);
    insTenant.run(clinicId, 'Clínica Médica Tradicional', 'Clínica Tradicional', 'clinica-trad-flex', 'cli@trad.test', 'clinic', studioHours);
    insTenant.run(mixedId, 'Centro Misto Corpo', 'Centro Misto', 'centro-misto-flex', 'misto@corpo.test', 'mixed', studioHours);

    const admUserId = 'usr-flex-adm-' + uuidv4().slice(0, 6);
    const profUser1 = 'usr-flex-p1-' + uuidv4().slice(0, 6);
    const profUser2 = 'usr-flex-p2-' + uuidv4().slice(0, 6);

    const insUser = db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, 'h', ?, 'active')`);
    insUser.run(admUserId, studioId, 'Admin Flex', 'admin@flex.test', 'clinic_admin');
    insUser.run(profUser1, studioId, 'Instrutor Bruno', 'bruno@flex.test', 'professional');
    insUser.run(profUser2, studioId, 'Instrutora Elisa', 'elisa@flex.test', 'professional');

    const insCU = db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json) VALUES (?, ?, ?, 'clinic_admin', 'active', 1, '["manage_services","view_financial","view_schedule","manage_patients"]')`);
    for (const tid of [studioId, otherStudioId, clinicId, mixedId]) {
      insCU.run('cu-' + uuidv4().slice(0, 8), tid, admUserId);
    }

    const makeAuth = (tenantId) => ({
      Authorization: `Bearer ${generateToken({ userId: admUserId, tenantId, email: 'admin@flex.test', role: 'clinic_admin' })}`,
      'x-tenant-id': tenantId
    });
    const authStudio = makeAuth(studioId);
    const authOther = makeAuth(otherStudioId);
    const authClinic = makeAuth(clinicId);
    const authMixed = makeAuth(mixedId);

    const profStudio1 = 'prof-flex-1-' + uuidv4().slice(0, 6);
    const profStudio2 = 'prof-flex-2-' + uuidv4().slice(0, 6);
    const profClinic = 'prof-flex-cli-' + uuidv4().slice(0, 6);
    const profMixed = 'prof-flex-mix-' + uuidv4().slice(0, 6);
    const profOther = 'prof-flex-oth-' + uuidv4().slice(0, 6);

    const insProf = db.prepare(`INSERT INTO professionals (id, tenant_id, user_id, name, slug, profession_id, profession_name, active, public_booking_enabled) VALUES (?, ?, ?, ?, ?, ?, 'Instrutor Studio', 1, 1)`);
    insProf.run(profStudio1, studioId, profUser1, 'Instrutor Bruno', 'instrutor-bruno-flex', profType);
    insProf.run(profStudio2, studioId, profUser2, 'Instrutora Elisa', 'instrutora-elisa-flex', profType);
    insProf.run(profClinic, clinicId, null, 'Dr. Clínica', 'dr-clinica-flex', profType);
    insProf.run(profMixed, mixedId, null, 'Instrutor Misto', 'instrutor-misto-flex', profType);
    insProf.run(profOther, otherStudioId, null, 'Instrutor Outro', 'instrutor-outro-flex', profType);

    // Profissional Bruno atende seg(1), ter(2), qua(3), qui(4), sex(5), sab(6) (NÃO atende domingo 0)
    // Profissional Elisa atende apenas ter(2) e qui(4)
    const insSched = db.prepare(`INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active) VALUES (?, ?, ?, ?, '07:00', '21:00', 1)`);
    for (let dow = 1; dow <= 6; dow++) {
      insSched.run(uuidv4(), studioId, profStudio1, dow);
      insSched.run(uuidv4(), mixedId, profMixed, dow);
      insSched.run(uuidv4(), otherStudioId, profOther, dow);
      insSched.run(uuidv4(), clinicId, profClinic, dow);
    }
    for (const dow of [2, 4]) {
      insSched.run(uuidv4(), studioId, profStudio2, dow);
    }

    // Alunos
    const studentA = 'pat-flex-a-' + uuidv4().slice(0, 6);
    const studentB = 'pat-flex-b-' + uuidv4().slice(0, 6);
    const studentC = 'pat-flex-c-' + uuidv4().slice(0, 6);
    const insPat = db.prepare(`INSERT INTO patients (id, tenant_id, full_name, phone, cpf, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`);
    insPat.run(studentA, studioId, 'Aluno Carlos Flex', '11999990001', '11111111111');
    insPat.run(studentB, studioId, 'Aluna Mariana Flex', '11999990002', '22222222222');
    insPat.run(studentC, mixedId, 'Aluna Lucia Mista', '11999990003', '33333333333');

    // =====================================================================
    // 1. CADASTRO / EDIÇÃO DE SERVIÇO COM RECORRÊNCIA FLEXÍVEL & ISOLAMENTO CLÍNICA
    // =====================================================================
    console.log('1) Configuração de Recorrência Flexível por Serviço (Studio / Misto / Clínica)...');

    const resClinicBlock = await makeReq('POST', '/api/v1/services', authClinic, {
      name: 'Consulta Clínica Com Custom Interval',
      durationMinutes: 50,
      price: 200,
      modality: 'presential',
      serviceKind: 'individual',
      serviceDomain: 'clinic',
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['weekly', 'custom_interval'],
      customRecurrenceIntervals: [{ value: 3, unit: 'days' }],
      professionalId: profClinic
    });
    assert(resClinicBlock.status === 400, 'Clínica tradicional NÃO pode habilitar custom_interval de Studio', resClinicBlock.data);

    const resFlexSrv = await makeReq('POST', '/api/v1/services', authStudio, {
      name: 'Treino Funcional Flexível',
      durationMinutes: 60,
      bufferMinutes: 0,
      price: 140,
      modality: 'presential',
      serviceKind: 'individual',
      serviceDomain: 'studio',
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'custom_weekdays', 'custom_interval'],
      defaultRecurrenceFrequency: 'custom_interval',
      customRecurrenceIntervals: [
        { value: 3, unit: 'days' },
        { value: 4, unit: 'weeks' },
        { value: 5, unit: 'months' }
      ],
      defaultRecurrenceInterval: { value: 3, unit: 'days' },
      professionalId: profStudio1,
      linkedProfessionalIds: [profStudio1, profStudio2]
    });
    assert(resFlexSrv.status === 201 || resFlexSrv.status === 200, 'Studio cria serviço com presets expandidos + customRecurrenceIntervals', resFlexSrv.data);
    const flexSrvId = resFlexSrv.data.id;
    assert(
      Array.isArray(resFlexSrv.data.custom_recurrence_intervals) &&
        resFlexSrv.data.custom_recurrence_intervals.length === 3 &&
        resFlexSrv.data.default_recurrence_interval?.intervalValue === 3 &&
        resFlexSrv.data.default_recurrence_interval?.intervalUnit === 'days',
      'Serviço retorna custom_recurrence_intervals e default_recurrence_interval salvos corretamente',
      resFlexSrv.data
    );

    // Atualiza serviço sem enviar customRecurrenceIntervals (compatibilidade) e depois restaura
    const resNoIntervalResend = await makeReq('PUT', `/api/v1/services/${flexSrvId}`, authStudio, {
      name: 'Treino Funcional Flexível',
      durationMinutes: 60,
      price: 145,
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual', 'custom_weekdays', 'custom_interval'],
      defaultRecurrenceFrequency: 'custom_interval',
      customRecurrenceIntervals: [
        { value: 3, unit: 'days' },
        { value: 4, unit: 'weeks' },
        { value: 5, unit: 'months' }
      ],
      defaultRecurrenceInterval: { value: 3, unit: 'days' }
    });
    assert(resNoIntervalResend.status === 200 && resNoIntervalResend.data.allowed_recurrence_frequencies.includes('semiannual'), 'PUT /v1/services/:id preserva todas as frequências e intervalos flexíveis', resNoIntervalResend.data);

    // Serviço legado com apenas ['weekly'] para testar bloqueio de frequência não autorizada
    const resWeeklyOnlySrv = await makeReq('POST', '/api/v1/services', authStudio, {
      name: 'Pilates Solo Semanal Restrito',
      durationMinutes: 60,
      price: 120,
      modality: 'presential',
      serviceKind: 'individual',
      serviceDomain: 'studio',
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['weekly'],
      defaultRecurrenceFrequency: 'weekly',
      professionalId: profStudio1
    });
    const weeklyOnlySrvId = resWeeklyOnlySrv.data.id;

    // Serviço Misto (Studio domain)
    const resMixedStudioSrv = await makeReq('POST', '/api/v1/services', authMixed, {
      name: 'Funcional Misto Quadrimestral/Mensal',
      durationMinutes: 60,
      price: 160,
      modality: 'presential',
      serviceKind: 'individual',
      serviceDomain: 'studio',
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['monthly', 'quarterly', 'custom_interval'],
      defaultRecurrenceFrequency: 'custom_interval',
      customRecurrenceIntervals: [{ value: 4, unit: 'weeks' }],
      defaultRecurrenceInterval: { value: 4, unit: 'weeks' },
      professionalId: profMixed
    });
    assert(resMixedStudioSrv.status === 201 || resMixedStudioSrv.status === 200, 'Estabelecimento Misto cria serviço Studio com recorrência flexível', resMixedStudioSrv.data);

    // =====================================================================
    // 2. PREVIEW E CRIAÇÃO: CADA 3 DIAS, 4 SEMANAS, 5 MESES, VIRADA FEVEREIRO & DIA 31
    // =====================================================================
    console.log('\n2) Geração de Datas, Clamp de Fim de Mês / Ano Bissexto & Endpoints Preview...');

    // Próxima segunda-feira distante 2 semanas -> +0 (Mon), +3 (Thu), +6 (Sun - fechado!) vs base Quinta -> +0(Thu), +3(Sun - fechado!) vs base Segunda 09:00 com 2 ocorrências (+0 Mon, +3 Thu -> ambos abertos!)
    const nextMonday = getNextWeekdayIso(1, 2);
    const resPreview3Days = await makeReq('POST', '/api/v1/appointments/recurrence-preview', authStudio, {
      patientId: studentA,
      professionalId: profStudio1,
      serviceId: flexSrvId,
      startTime: `${nextMonday}T09:00:00`,
      endTime: `${nextMonday}T10:00:00`,
      modality: 'presential',
      recurrence: {
        frequency: 'custom_interval',
        intervalValue: 3,
        intervalUnit: 'days',
        maxOccurrences: 2
      }
    });
    assert(
      resPreview3Days.status === 200 &&
        resPreview3Days.data.valid === true &&
        resPreview3Days.data.totalCount === 2 &&
        resPreview3Days.data.occurrences[1].date === addDaysIso(nextMonday, 3),
      'Preview "a cada 3 dias" (Seg -> Qui) valida ambos dias autorizados',
      resPreview3Days.data
    );

    // Quando a 3ª ocorrência cai no Domingo (Seg + 6 dias = Domingo), o preview DEVE marcar Domingo como indisponível (não mudar de data silenciosamente!)
    const resPreview3DaysSunday = await makeReq('POST', '/api/v1/appointments/recurrence-preview', authStudio, {
      patientId: studentA,
      professionalId: profStudio1,
      serviceId: flexSrvId,
      startTime: `${nextMonday}T09:00:00`,
      endTime: `${nextMonday}T10:00:00`,
      modality: 'presential',
      recurrence: {
        frequency: 'custom_interval',
        intervalValue: 3,
        intervalUnit: 'days',
        maxOccurrences: 3
      }
    });
    assert(
      resPreview3DaysSunday.status === 200 &&
        resPreview3DaysSunday.data.valid === false &&
        resPreview3DaysSunday.data.conflictCount === 1 &&
        resPreview3DaysSunday.data.occurrences[2].available === false &&
        resPreview3DaysSunday.data.occurrences[2].date === addDaysIso(nextMonday, 6),
      'Preview detecta Domingo (Seg + 6 dias) como indisponível SEM ajustar data silenciosamente',
      resPreview3DaysSunday.data
    );

    // Tentativa de criar a série com conflito de Domingo deve falhar (409) e não criar nenhum agendamento parcial
    const resCreateSundayConflict = await makeReq('POST', '/api/v1/appointments/recurring', authStudio, {
      patientId: studentA,
      professionalId: profStudio1,
      serviceId: flexSrvId,
      startTime: `${nextMonday}T09:00:00`,
      endTime: `${nextMonday}T10:00:00`,
      modality: 'presential',
      recurrence: {
        frequency: 'custom_interval',
        intervalValue: 3,
        intervalUnit: 'days',
        maxOccurrences: 3
      }
    });
    assert(resCreateSundayConflict.status === 409, 'createRecurring rejeita com HTTP 409 quando qualquer ocorrência cai em dia fechado', resCreateSundayConflict.data);
    const partialCheck = db.prepare(`SELECT COUNT(*) AS cnt FROM appointments WHERE tenant_id = ? AND patient_id = ?`).get(studioId, studentA);
    assert(partialCheck.cnt === 0, 'Nenhum agendamento parcial foi inserido após rejeição da série');

    // Criar série válida a cada 3 dias (Seg e Qui, 2 ocorrências)
    const resCreate3Days = await makeReq('POST', '/api/v1/appointments/recurring', authStudio, {
      patientId: studentA,
      professionalId: profStudio1,
      serviceId: flexSrvId,
      startTime: `${nextMonday}T09:00:00`,
      endTime: `${nextMonday}T10:00:00`,
      modality: 'presential',
      recurrence: {
        frequency: 'custom_interval',
        intervalValue: 3,
        intervalUnit: 'days',
        maxOccurrences: 2
      }
    });
    assert(
      (resCreate3Days.status === 201 || resCreate3Days.status === 200) && resCreate3Days.data.createdCount === 2,
      'createRecurring cria série válida "a cada 3 dias"',
      resCreate3Days.data
    );
    const createdSeriesRow = db.prepare(`SELECT * FROM class_series WHERE id = ?`).get(resCreate3Days.data.seriesId);
    assert(
      createdSeriesRow && createdSeriesRow.frequency === 'custom_interval' && createdSeriesRow.interval_value === 3 && createdSeriesRow.interval_unit === 'days',
      'class_series persiste frequency=custom_interval, interval_value=3 e interval_unit=days',
      createdSeriesRow
    );

    // Testar cancelamento de uma ocorrência única preservando a outra
    const firstApptId = resCreate3Days.data.appointments[0].id;
    const secondApptId = resCreate3Days.data.appointments[1].id;
    await makeReq('PUT', `/api/v1/appointments/${firstApptId}/status`, authStudio, { status: 'cancelled' });
    const secondRowAfter = db.prepare(`SELECT status, series_id FROM appointments WHERE id = ?`).get(secondApptId);
    assert(
      secondRowAfter && secondRowAfter.status !== 'cancelled' && secondRowAfter.series_id === resCreate3Days.data.seriesId,
      'Cancelar uma ocorrência individual preserva o restante da série ativa',
      secondRowAfter
    );

    // Testar virada de mês (dia 31 -> fevereiro 28/29 -> março 31) via preview/service em ano não bissexto e bissexto
    const { generateRecurrenceDates } = require('./dist/services/class-group.service');
    const jan31Dates = generateRecurrenceDates({
      startDate: '2027-01-31',
      startTime: '10:00',
      endTime: '11:00',
      frequency: 'monthly',
      maxOccurrences: 4
    });
    assert(
      JSON.stringify(jan31Dates) === JSON.stringify(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']),
      'Virada de mês dia 31 (Jan->Fev 28->Mar 31->Abr 30) preserva âncora no dia 31 sem pular mês',
      jan31Dates
    );

    const leapFeb29 = generateRecurrenceDates({
      startDate: '2028-02-29',
      startTime: '10:00',
      endTime: '11:00',
      frequency: 'annual',
      maxOccurrences: 2
    });
    assert(
      JSON.stringify(leapFeb29) === JSON.stringify(['2028-02-29', '2029-02-28']),
      'Recorrência anual em ano bissexto (29/02/2028 -> 28/02/2029) ajusta corretamente',
      leapFeb29
    );

    const every5Months = generateRecurrenceDates({
      startDate: '2027-01-31',
      startTime: '10:00',
      endTime: '11:00',
      frequency: 'custom_interval',
      intervalValue: 5,
      intervalUnit: 'months',
      maxOccurrences: 3
    });
    assert(
      JSON.stringify(every5Months) === JSON.stringify(['2027-01-31', '2027-06-30', '2027-11-30']),
      'Recorrência "a cada 5 meses" gera datas exatas com clamp em meses de 30 dias',
      every5Months
    );

    // Every 4 weeks (> 60 dias na 3ª ocorrência -> ignoreAdvanceCap garante que não falha pelo limite avulso de 60 dias)
    const nextTuesday = getNextWeekdayIso(2, 3);
    const resPreview4Weeks = await makeReq('POST', '/api/v1/appointments/recurrence-preview', authStudio, {
      patientId: studentB,
      professionalId: profStudio1,
      serviceId: flexSrvId,
      startTime: `${nextTuesday}T15:00:00`,
      endTime: `${nextTuesday}T16:00:00`,
      modality: 'presential',
      recurrence: {
        frequency: 'custom_interval',
        intervalValue: 4,
        intervalUnit: 'weeks',
        maxOccurrences: 4
      }
    });
    assert(
      resPreview4Weeks.status === 200 && resPreview4Weeks.data.valid === true && resPreview4Weeks.data.totalCount === 4,
      'Preview "a cada 4 semanas" (horizonte de 84+ dias) passa do cap avulso de 60 dias e retorna todas 4 válidas',
      resPreview4Weeks.data
    );

    // =====================================================================
    // 3. VALIDAÇÕES RÍGIDAS DE BLOQUEIOS, FERIADOS, PROFISSIONAL NÃO VINCULADO E GRADE COLETIVA
    // =====================================================================
    console.log('\n3) Validação contra Feriados, Bloqueios, Instrutor sem vínculo, Grade Semanal e Limites...');

    // Feriado na 2ª semana de nextTuesday (+7 dias)
    const holidayId = uuidv4();
    const holidayTuesday = addDaysIso(nextTuesday, 7);
    db.prepare(`INSERT INTO holidays (id, tenant_id, date, name, is_national, active) VALUES (?, ?, ?, 'Feriado Municipal Teste', 0, 1)`).run(
      holidayId,
      studioId,
      holidayTuesday
    );

    const resHolidayConflict = await makeReq('POST', '/api/v1/appointments/recurrence-preview', authStudio, {
      patientId: studentB,
      professionalId: profStudio1,
      serviceId: flexSrvId,
      startTime: `${nextTuesday}T15:00:00`,
      endTime: `${nextTuesday}T16:00:00`,
      modality: 'presential',
      recurrence: { frequency: 'weekly', maxOccurrences: 3 }
    });
    assert(
      resHolidayConflict.status === 200 &&
        resHolidayConflict.data.valid === false &&
        resHolidayConflict.data.occurrences[1].available === false &&
        resHolidayConflict.data.occurrences[1].reasonCode === 'HOLIDAY',
      'Preview detecta feriado na 2ª ocorrência (HOLIDAY)',
      resHolidayConflict.data
    );
    db.prepare(`DELETE FROM holidays WHERE id = ?`).run(holidayId);

    // Bloqueio do instrutor na quinta seguinte ao holidayTuesday
    const blockedThu = addDaysIso(nextTuesday, 9);
    db.prepare(`INSERT INTO blocked_times (id, tenant_id, professional_id, title, start_datetime, end_datetime, reason) VALUES (?, ?, ?, 'Reunião Interna', ?, ?, 'Reunião Interna')`).run(
      uuidv4(),
      studioId,
      profStudio1,
      `${blockedThu}T14:00:00`,
      `${blockedThu}T17:00:00`
    );

    const resBlockedPreview = await makeReq('POST', '/api/v1/appointments/recurrence-preview', authStudio, {
      patientId: studentB,
      professionalId: profStudio1,
      serviceId: flexSrvId,
      startTime: `${addDaysIso(nextTuesday, 2)}T15:00:00`,
      endTime: `${addDaysIso(nextTuesday, 2)}T16:00:00`,
      modality: 'presential',
      recurrence: { frequency: 'weekly', maxOccurrences: 2 }
    });
    assert(
      resBlockedPreview.status === 200 &&
        resBlockedPreview.data.valid === false &&
        resBlockedPreview.data.occurrences[1].reasonCode === 'BLOCKED_TIME',
      'Preview detecta bloqueio pontual de agenda na 2ª ocorrência (BLOCKED_TIME)',
      resBlockedPreview.data
    );

    // Instrutor Elisa só atende Ter(2) e Qui(4) -> pedir custom_weekdays [2, 3, 4] deve rejeitar Qua(3)!
    const resElisaWeekdays = await makeReq('POST', '/api/v1/appointments/recurrence-preview', authStudio, {
      patientId: studentB,
      professionalId: profStudio2,
      serviceId: flexSrvId,
      startTime: `${nextTuesday}T10:00:00`,
      endTime: `${nextTuesday}T11:00:00`,
      modality: 'presential',
      recurrence: { frequency: 'custom_weekdays', weekdays: [2, 3, 4], maxOccurrences: 3 }
    });
    assert(
      resElisaWeekdays.status === 200 &&
        resElisaWeekdays.data.valid === false &&
        resElisaWeekdays.data.occurrences[1].available === false &&
        resElisaWeekdays.data.occurrences[1].reasonCode === 'INSTRUCTOR_SCHEDULE_CLOSED',
      'Preview rejeita dia em que Instrutora Elisa não possui expediente (Quarta)',
      resElisaWeekdays.data
    );

    // Serviço que não permite custom_interval ou frequência não autorizada -> HTTP 400
    const resUnauthFreq = await makeReq('POST', '/api/v1/appointments/recurring', authStudio, {
      patientId: studentB,
      professionalId: profStudio1,
      serviceId: weeklyOnlySrvId,
      startTime: `${nextTuesday}T10:00:00`,
      endTime: `${nextTuesday}T11:00:00`,
      modality: 'presential',
      recurrence: { frequency: 'custom_interval', intervalValue: 3, intervalUnit: 'days', maxOccurrences: 2 }
    });
    assert(
      resUnauthFreq.status === 400 && resUnauthFreq.data.code === 'RECURRENCE_FREQUENCY_NOT_ALLOWED',
      'Serviço que só permite Semanal rejeita custom_interval com HTTP 400',
      resUnauthFreq.data
    );

    // Limites inválidos: intervalValue = 0 e maxOccurrences > 104
    const resInvalidInterval = await makeReq('POST', '/api/v1/appointments/recurring', authStudio, {
      patientId: studentB,
      professionalId: profStudio1,
      serviceId: flexSrvId,
      startTime: `${nextTuesday}T10:00:00`,
      endTime: `${nextTuesday}T11:00:00`,
      modality: 'presential',
      recurrence: { frequency: 'custom_interval', intervalValue: 0, intervalUnit: 'days', maxOccurrences: 3 }
    });
    assert(resInvalidInterval.status === 400, 'Rejeita intervalValue = 0 (HTTP 400)', resInvalidInterval.data);

    const resExceedCap = await makeReq('POST', '/api/v1/appointments/recurring', authStudio, {
      patientId: studentB,
      professionalId: profStudio1,
      serviceId: flexSrvId,
      startTime: `${nextTuesday}T10:00:00`,
      endTime: `${nextTuesday}T11:00:00`,
      modality: 'presential',
      recurrence: { frequency: 'weekly', maxOccurrences: 200 }
    });
    assert(resExceedCap.status === 400 && resExceedCap.data.code === 'RECURRENCE_LIMIT_EXCEEDED', 'Rejeita série acima do limite de 104 ocorrências (HTTP 400)', resExceedCap.data);

    // Multi-tenant isolation: tentar usar serviço do Outro Studio pelo Studio principal
    const resOtherTenantSrv = await makeReq('POST', '/api/v1/services', authOther, {
      name: 'Serviço Outro Tenant',
      durationMinutes: 60,
      price: 100,
      modality: 'presential',
      serviceKind: 'individual',
      serviceDomain: 'studio',
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['weekly'],
      professionalId: profOther
    });
    const resCrossTenantPreview = await makeReq('POST', '/api/v1/appointments/recurrence-preview', authStudio, {
      patientId: studentB,
      professionalId: profStudio1,
      serviceId: resOtherTenantSrv.data.id,
      startTime: `${nextTuesday}T10:00:00`,
      endTime: `${nextTuesday}T11:00:00`,
      recurrence: { frequency: 'weekly', maxOccurrences: 2 }
    });
    assert(resCrossTenantPreview.status === 404, 'Isolamento multi-tenant impede acesso a serviço de outro tenant', resCrossTenantPreview.data);

    // =====================================================================
    // 4. AULA COLETIVA COM GRADE SEMANAL + LOTAÇÃO + AGENDAMENTO PÚBLICO (SERVIÇO E PACOTE)
    // =====================================================================
    console.log('\n4) Grade Semanal Coletiva, Lotação e Agendamento Público (Studio Public Preview & Booking)...');

    const resGroupSrv = await makeReq('POST', '/api/v1/services', authStudio, {
      name: 'Pilates Aparelhos Ter/Qui',
      durationMinutes: 60,
      price: 130,
      modality: 'presential',
      serviceKind: 'group',
      serviceDomain: 'studio',
      defaultCapacity: 1,
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['weekly', 'custom_weekdays', 'custom_interval'],
      defaultRecurrenceFrequency: 'weekly',
      customRecurrenceIntervals: [{ value: 2, unit: 'days' }, { value: 2, unit: 'weeks' }],
      defaultRecurrenceInterval: { value: 2, unit: 'days' },
      professionalId: profStudio2,
      linkedProfessionalIds: [profStudio1, profStudio2],
      classSchedules: [
        { dayOfWeek: 2, startTime: '08:00', endTime: '09:00', professionalId: profStudio2, modality: 'presential', capacity: 1, isActive: true },
        { dayOfWeek: 4, startTime: '08:00', endTime: '09:00', professionalId: profStudio2, modality: 'presential', capacity: 1, isActive: true }
      ]
    });
    assert(resGroupSrv.status === 201 || resGroupSrv.status === 200, 'Aula coletiva com grade Ter/Qui 08:00 criada com sucesso', resGroupSrv.data);
    const groupSrvId = resGroupSrv.data.id;

    // A cada 2 dias começando numa Terça (Ter=ok, Qui=ok, Sab=NÃO tem grade às 08:00!)
    const nextTueWk4 = getNextWeekdayIso(2, 4);
    const resPublicPreviewConflict = await makeReq('POST', '/api/v1/public/studio/recurrence-preview', {}, {
      tenantSlug: 'studio-flex-move',
      serviceId: groupSrvId,
      professionalId: profStudio2,
      modality: 'presential',
      startTime: `${nextTueWk4}T08:00:00`,
      endTime: `${nextTueWk4}T09:00:00`,
      recurrence: {
        frequency: 'custom_interval',
        intervalValue: 2,
        intervalUnit: 'days',
        maxOccurrences: 3
      }
    });
    assert(
      resPublicPreviewConflict.status === 200 &&
        resPublicPreviewConflict.data.valid === false &&
        resPublicPreviewConflict.data.occurrences[0].available === true &&
        resPublicPreviewConflict.data.occurrences[1].available === true &&
        resPublicPreviewConflict.data.occurrences[2].available === false,
      'Preview público aprova Ter e Qui na grade, mas reprova Sábado (fora da grade da aula)',
      resPublicPreviewConflict.data
    );

    // Public booking valid 2-occurrence series (Ter + Qui "a cada 2 dias") with capacity = 1
    const resPublicBookValid = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'studio-flex-move',
      mode: 'service',
      serviceId: groupSrvId,
      professionalId: profStudio2,
      modality: 'presential',
      startTime: `${nextTueWk4}T08:00:00`,
      endTime: `${nextTueWk4}T09:00:00`,
      recurrence: {
        frequency: 'custom_interval',
        intervalValue: 2,
        intervalUnit: 'days',
        maxOccurrences: 2
      },
      student: {
        fullName: 'Aluna Publica Flex',
        phone: '11988887777',
        whatsapp: '11988887777',
        email: 'publica.flex@test.com'
      }
    });
    assert(
      resPublicBookValid.status === 201 &&
        Array.isArray(resPublicBookValid.data.appointments) &&
        resPublicBookValid.data.appointments.length === 2,
      'Agendamento público cria série válida "a cada 2 dias" em turma coletiva',
      resPublicBookValid.data
    );

    // Outro aluno tentando na semana anterior -> Qui igual -> turma lotada na 2ª ocorrência (Ter livre 1 semana antes, mas vamos pegar mesma Ter -> lotada!)
    const resPublicPreviewFull = await makeReq('POST', '/api/v1/public/studio/recurrence-preview', {}, {
      tenantSlug: 'studio-flex-move',
      serviceId: groupSrvId,
      professionalId: profStudio2,
      modality: 'presential',
      startTime: `${addDaysIso(nextTueWk4, -7)}T08:00:00`,
      endTime: `${addDaysIso(nextTueWk4, -7)}T09:00:00`,
      recurrence: {
        frequency: 'weekly',
        maxOccurrences: 2
      }
    });
    assert(
      resPublicPreviewFull.status === 200 &&
        resPublicPreviewFull.data.valid === false &&
        resPublicPreviewFull.data.occurrences[0].available === true &&
        resPublicPreviewFull.data.occurrences[1].available === false &&
        resPublicPreviewFull.data.occurrences[1].reasonCode === 'CLASS_FULL',
      'Preview público detecta turma lotada na 2ª ocorrência (CLASS_FULL)',
      resPublicPreviewFull.data
    );

    // Tentativa de exceder cap público (24 ocorrências)
    const resPublicTooMany = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'studio-flex-move',
      mode: 'service',
      serviceId: flexSrvId,
      professionalId: profStudio1,
      modality: 'presential',
      startTime: `${addDaysIso(nextTueWk4, 14)}T11:00:00`,
      endTime: `${addDaysIso(nextTueWk4, 14)}T12:00:00`,
      recurrence: { frequency: 'weekly', maxOccurrences: 30 },
      student: { fullName: 'Aluna Limite', phone: '11977776666' }
    });
    assert(
      resPublicTooMany.status === 400 && resPublicTooMany.data.code === 'RECURRENCE_LIMIT_EXCEEDED',
      'Agendamento público bloqueia > 24 ocorrências na recorrência (HTTP 400 RECURRENCE_LIMIT_EXCEEDED)',
      resPublicTooMany.data
    );

    // Pacote Studio usando custom_interval via /api/v1/public/studio/bookings (mode: package)
    const resPkg = await makeReq('POST', '/api/v1/packages', authStudio, {
      name: 'Pacote Flex 4 Aulas',
      description: 'Pacote com recorrência personalizada',
      price: 480,
      billingType: 'single',
      totalCredits: 4,
      creditMode: 'shared',
      validityDays: 180,
      publicBookingEnabled: true,
      items: [{ serviceId: flexSrvId, includedCredits: 4 }]
    });
    assert(resPkg.status === 201 || resPkg.status === 200, 'Pacote Studio criado para teste de recorrência customizada', resPkg.data);

    const pkgWed = getNextWeekdayIso(3, 5); // 5 semanas à frente na quarta 16:00 -> +0(Wed), +4w(Wed)
    const createdPkgId = resPkg.data?.package?.id || resPkg.data?.id;
    const resPkgBook = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'studio-flex-move',
      mode: 'package',
      packageId: createdPkgId,
      schedules: [
        {
          serviceId: flexSrvId,
          professionalId: profStudio1,
          modality: 'presential',
          startTime: `${pkgWed}T16:00:00`,
          endTime: `${pkgWed}T17:00:00`,
          recurrence: {
            frequency: 'custom_interval',
            intervalValue: 4,
            intervalUnit: 'weeks',
            maxOccurrences: 2
          }
        }
      ],
      student: {
        fullName: 'Aluno Pacote Flex',
        phone: '11966665555',
        whatsapp: '11966665555'
      }
    });
    assert(
      resPkgBook.status === 201 &&
        (resPkgBook.data.createdCount === 2 ||
          (Array.isArray(resPkgBook.data.appointments) && resPkgBook.data.appointments.length === 2)),
      'Pacote público cria série recorrente custom_interval (a cada 4 semanas)',
      resPkgBook.data
    );

    // Checa catálogo & slots públicos expõem customRecurrenceIntervals
    const resSlots = await makeReq(
      'GET',
      `/api/v1/public/studio/slots?tenantSlug=studio-flex-move&serviceId=${encodeURIComponent(flexSrvId)}&date=${pkgWed}`
    );
    assert(
      resSlots.status === 200 &&
        Array.isArray(resSlots.data.customRecurrenceIntervals) &&
        resSlots.data.customRecurrenceIntervals.length === 3 &&
        resSlots.data.defaultRecurrenceInterval?.intervalValue === 3,
      'GET /v1/public/studio/slots retorna customRecurrenceIntervals e defaultRecurrenceInterval',
      resSlots.data
    );

  } finally {
    server.close();
    try {
      db.close();
    } catch {}
    for (const ext of ['', '-wal', '-shm']) {
      if (fs.existsSync(DB_PATH + ext)) {
        try {
          fs.unlinkSync(DB_PATH + ext);
        } catch {}
      }
    }
  }

  console.log(`\nResultado: ${passed} passou / ${failed} falhou.`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
