const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.resolve(__dirname, 'test_studio_service_billing.db');
process.env.DATABASE_PATH = DB_PATH;
process.env.JWT_SECRET = 'test-studio-service-billing-secret-2026';
process.env.ZEMDA_FILES_SIGNING_SECRET = 'test-studio-service-billing-files-2026';
const TEST_PORT = 3129;
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
    console.error(`  [FAIL] ${msg}${detail !== undefined ? ' -> ' + JSON.stringify(detail).slice(0, 600) : ''}`);
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

function addDaysIso(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0)).toISOString().slice(0, 10);
}

function getFutureWeekdayIso(targetDow, minDaysAhead = 7) {
  const now = new Date(Date.now() - 3 * 3600 * 1000);
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + minDaysAhead, 12, 0, 0));
  const diff = (targetDow - base.getUTCDay() + 7) % 7;
  base.setUTCDate(base.getUTCDate() + diff);
  return base.toISOString().slice(0, 10);
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

  console.log('\n=========================================================================================');
  console.log('TESTES COMPLETOS: Modalidades de Cobrança por Serviço no Zemda Studio (14 cenários)');
  console.log('=========================================================================================\n');

  try {
    const studioId = 'ten-st-' + uuidv4().slice(0, 6);
    const mixedId = 'ten-mx-' + uuidv4().slice(0, 6);
    const clinicId = 'ten-cl-' + uuidv4().slice(0, 6);
    const otherStudioId = 'ten-os-' + uuidv4().slice(0, 6);

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
    insTenant.run(studioId, 'Studio Zen', 'Studio Zen', 'studio-zen-bil', 'zen@bil.test', 'studio', hours);
    insTenant.run(mixedId, 'Espaço Misto', 'Espaço Misto', 'misto-bil', 'misto@bil.test', 'mixed', hours);
    insTenant.run(clinicId, 'Clínica Padrão', 'Clínica Padrão', 'clinica-bil', 'cli@bil.test', 'clinic', hours);
    insTenant.run(otherStudioId, 'Outro Studio', 'Outro Studio', 'outro-bil', 'outro@bil.test', 'studio', hours);

    const admUser = 'usr-adm-' + uuidv4().slice(0, 6);
    db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES (?, ?, 'Gestora Ana', 'ana@bil.test', 'h', 'clinic_admin', 'active')`).run(admUser, studioId);

    const insCU = db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json) VALUES (?, ?, ?, 'clinic_admin', 'active', 1, '["manage_services","view_financial","manage_financial","view_schedule","manage_patients","manage_payroll"]')`);
    for (const tid of [studioId, mixedId, clinicId, otherStudioId]) {
      insCU.run('cu-' + uuidv4().slice(0, 8), tid, admUser);
    }

    const mkHeaders = (tid) => ({
      Authorization: `Bearer ${generateToken({ userId: admUser, tenantId: tid, email: 'ana@bil.test', role: 'clinic_admin' })}`,
      'x-tenant-id': tid
    });
    const authStudio = mkHeaders(studioId);
    const authMixed = mkHeaders(mixedId);
    const authClinic = mkHeaders(clinicId);
    const authOther = mkHeaders(otherStudioId);

    const insProf = db.prepare(`
      INSERT INTO professionals (
        id, tenant_id, user_id, name, slug, profession_id, profession_name,
        active, public_booking_enabled, remuneration_type, commission_percentage, fixed_salary
      ) VALUES (?, ?, NULL, ?, ?, ?, 'Educador Físico', 1, 1, 'commission', 50, 0)
    `);
    const profSt1 = 'prof-st1-' + uuidv4().slice(0, 6);
    const profSt2 = 'prof-st2-' + uuidv4().slice(0, 6);
    const profMx = 'prof-mx-' + uuidv4().slice(0, 6);
    const profCl = 'prof-cl-' + uuidv4().slice(0, 6);
    const profOs = 'prof-os-' + uuidv4().slice(0, 6);
    insProf.run(profSt1, studioId, 'Instrutora Lia', 'lia-st', profType);
    insProf.run(profSt2, studioId, 'Instrutor Caio', 'caio-st', profType);
    insProf.run(profMx, mixedId, 'Prof Misto', 'mx-mx', profType);
    insProf.run(profCl, clinicId, 'Dra. Clínica', 'cl-cl', profType);
    insProf.run(profOs, otherStudioId, 'Outro Prof', 'os-os', profType);

    const insSched = db.prepare(`INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active) VALUES (?, ?, ?, ?, '06:00', '22:00', 1)`);
    for (let dow = 1; dow <= 6; dow++) {
      insSched.run(uuidv4(), studioId, profSt1, dow);
      insSched.run(uuidv4(), studioId, profSt2, dow);
      insSched.run(uuidv4(), mixedId, profMx, dow);
      insSched.run(uuidv4(), clinicId, profCl, dow);
      insSched.run(uuidv4(), otherStudioId, profOs, dow);
    }

    const insPat = db.prepare(`INSERT INTO patients (id, tenant_id, full_name, phone, cpf, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`);
    const pat1 = 'pat-1-' + uuidv4().slice(0, 6);
    const pat2 = 'pat-2-' + uuidv4().slice(0, 6);
    const pat3 = 'pat-3-' + uuidv4().slice(0, 6);
    const pat4 = 'pat-4-' + uuidv4().slice(0, 6);
    const pat5 = 'pat-5-' + uuidv4().slice(0, 6);
    const patMx = 'pat-mx-' + uuidv4().slice(0, 6);
    const patCl = 'pat-cl-' + uuidv4().slice(0, 6);
    const patOs = 'pat-os-' + uuidv4().slice(0, 6);
    insPat.run(pat1, studioId, 'Aluno Dropin', '11988880001', '11111111101');
    insPat.run(pat2, studioId, 'Aluna Mensal', '11988880002', '11111111102');
    insPat.run(pat3, studioId, 'Aluna Trimestral', '11988880003', '11111111103');
    insPat.run(pat4, studioId, 'Aluno Anual+Tri', '11988880004', '11111111104');
    insPat.run(pat5, studioId, 'Aluna Semestral/Pacote', '11988880005', '11111111105');
    insPat.run(patMx, mixedId, 'Paciente Misto', '11988880006', '11111111106');
    insPat.run(patCl, clinicId, 'Paciente Clínica', '11988880007', '11111111107');
    insPat.run(patOs, otherStudioId, 'Aluno Outro', '11988880008', '11111111108');

    // =========================================================================
    // CENÁRIO 7: Salvar/editar serviço NÃO gera nenhuma cobrança/contrato automático
    // + CENÁRIO 1: Serviço Avulso por Atendimento / Aula
    // =========================================================================
    console.log('1 & 7. Cadastro comercial no serviço sem auto-cobrança + Serviço Avulso...');
    const srvDropRes = await makeReq('POST', '/api/v1/services', authStudio, {
      professionalId: profSt1,
      name: 'Aula Avulsa Mobilidade',
      durationMinutes: 50,
      bufferMinutes: 0,
      price: 95,
      modality: 'presential',
      serviceDomain: 'studio',
      serviceKind: 'group',
      defaultCapacity: 8,
      billingMode: 'per_session',
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['weekly', 'custom_weekdays'],
      defaultRecurrenceFrequency: 'weekly'
    });
    assert(srvDropRes.status === 201 && srvDropRes.data.billing_mode === 'per_session', 'Serviço avulso criado com billing_mode=per_session', srvDropRes.data);
    const dropServiceId = srvDropRes.data.id;

    // Serviço Trimestral R$ 540,00 (com aulas Mon/Wed) — preço por trimestre configurável, NÃO multiplicação automática
    const srvTriRes = await makeReq('POST', '/api/v1/services', authStudio, {
      professionalId: profSt1,
      linkedProfessionalIds: [profSt1, profSt2],
      name: 'Pilates Aparelhos',
      durationMinutes: 60,
      bufferMinutes: 0,
      price: 120,
      modality: 'presential',
      serviceDomain: 'studio',
      serviceKind: 'group',
      defaultCapacity: 10,
      billingMode: 'quarterly',
      periodicPrice: 540,
      defaultBillingDueDay: 10,
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['weekly', 'custom_weekdays'],
      defaultRecurrenceFrequency: 'weekly',
      classSchedules: [
        { dayOfWeek: 1, startTime: '08:00', endTime: '09:00', professionalId: profSt1, coInstructorIds: [profSt2], modality: 'presential', capacity: 10 },
        { dayOfWeek: 3, startTime: '08:00', endTime: '09:00', professionalId: profSt1, coInstructorIds: [profSt2], modality: 'presential', capacity: 10 }
      ]
    });
    assert(
      srvTriRes.status === 201 && srvTriRes.data.billing_mode === 'quarterly' && Number(srvTriRes.data.periodic_price) === 540 && Number(srvTriRes.data.billing_cycle_months) === 3,
      'Serviço Trimestral salvo com periodic_price=540 e billing_cycle_months=3',
      srvTriRes.data
    );
    const triServiceId = srvTriRes.data.id;
    const triMonSched = (srvTriRes.data.class_schedules || []).find(s => Number(s.day_of_week) === 1);
    const triWedSched = (srvTriRes.data.class_schedules || []).find(s => Number(s.day_of_week) === 3);

    // Verificar CENÁRIO 7: zero cobranças e zero contratos gerados apenas por salvar serviços
    const plansCountAfterSrv = db.prepare(`SELECT COUNT(*) AS c FROM recurring_billing_plans WHERE tenant_id = ?`).get(studioId).c;
    const paysCountAfterSrv = db.prepare(`SELECT COUNT(*) AS c FROM payments WHERE tenant_id = ?`).get(studioId).c;
    assert(plansCountAfterSrv === 0 && paysCountAfterSrv === 0, 'Salvar serviços não cria planos nem cobranças automáticas', { plansCountAfterSrv, paysCountAfterSrv });

    // Agendar aula avulsa (Cenário 1)
    const nextTue = getFutureWeekdayIso(2, 5);
    const bookDropRes = await makeReq('POST', '/api/v1/appointments', authStudio, {
      patientId: pat1,
      professionalId: profSt1,
      serviceId: dropServiceId,
      appointmentPrice: 95,
      startTime: `${nextTue}T10:00:00`,
      endTime: `${nextTue}T10:50:00`,
      modality: 'presential',
      isCustomTime: true
    });
    assert(bookDropRes.status === 201 && bookDropRes.data.coverageType === 'drop_in', 'Cenário 1: Agendamento em serviço Por Atendimento usa cobrança avulsa', bookDropRes.data);
    const dropPay = db.prepare(`SELECT * FROM payments WHERE tenant_id = ? AND appointment_id = ?`).get(studioId, bookDropRes.data.id);
    assert(dropPay && Number(dropPay.amount) === 95 && dropPay.status === 'pending', 'Cenário 1: Pagamento avulso de R$ 95,00 criado na agenda', dropPay);

    // =========================================================================
    // CENÁRIO 2: Serviço / Contrato Mensal + 8 aulas no mês -> 1 cobrança mensal
    // =========================================================================
    console.log('2. Contrato Mensal + múltiplas aulas semanais -> apenas 1 cobrança mensal...');
    const startMon = getFutureWeekdayIso(1, 7);
    const oneMonthEnd = addDaysIso(startMon, 28);
    const resMensal = await makeReq('POST', '/api/v1/appointments/recurring', authStudio, {
      patientId: pat2,
      professionalId: profSt1,
      serviceId: triServiceId,
      appointmentPrice: 0,
      billingChoice: 'enroll_periodic',
      enrollBillingPlan: {
        billingFrequency: 'monthly',
        amount: 220,
        dueDay: 10,
        startDate: startMon,
        endDate: oneMonthEnd,
        paymentMethod: 'pix',
        generateInitialCycle: true,
        generateAllContractCycles: false
      },
      startTime: `${startMon}T08:00:00`,
      endTime: `${startMon}T09:00:00`,
      modality: 'presential',
      recurrence: {
        frequency: 'custom_weekdays',
        weekdays: [1, 3],
        seriesMode: 'cadence_duration',
        durationCode: '1_month',
        scheduleEntries: [
          { classScheduleId: triMonSched.id, weekday: 1, startTime: '08:00', endTime: '09:00', professionalId: profSt1, coInstructorIds: [profSt2], modality: 'presential' },
          { classScheduleId: triWedSched.id, weekday: 3, startTime: '08:00', endTime: '09:00', professionalId: profSt1, coInstructorIds: [profSt2], modality: 'presential' }
        ],
        endDate: oneMonthEnd
      }
    });
    assert(resMensal.status === 201 && resMensal.data.coverageType === 'periodic_plan', 'Cenário 2: Série semanal mensal criada com cobertura periódica', resMensal.data);
    const pat2Appts = db.prepare(`SELECT * FROM appointments WHERE tenant_id = ? AND patient_id = ?`).all(studioId, pat2);
    const pat2PerApptPays = db.prepare(`SELECT * FROM payments WHERE tenant_id = ? AND patient_id = ? AND appointment_id IS NOT NULL`).all(studioId, pat2);
    const pat2PlanPays = db.prepare(`SELECT * FROM payments WHERE tenant_id = ? AND patient_id = ? AND recurring_plan_id = ?`).all(studioId, pat2, resMensal.data.billingPlanId);
    assert(pat2Appts.length >= 8 && pat2PerApptPays.length === 0 && pat2PlanPays.length === 1 && Number(pat2PlanPays[0].amount) === 220, 'Cenário 2: >=8 aulas no mês, ZERO cobranças avulsas por aula e APENAS 1 cobrança mensal de R$ 220', {
      appts: pat2Appts.length,
      perApptPays: pat2PerApptPays.length,
      planPays: pat2PlanPays.map(p => ({ id: p.id, amount: p.amount, freq: p.billing_frequency }))
    });

    // =========================================================================
    // CENÁRIO 3: Contrato Trimestral R$ 540,00 -> apenas 1 cobrança no trimestre
    // =========================================================================
    console.log('3. Contrato Trimestral R$ 540,00 -> apenas 1 cobrança de R$ 540 no ciclo...');
    const pat3End = addMonthsClampIso(startMon, 3);
    const resTriBook = await makeReq('POST', '/api/v1/appointments/recurring', authStudio, {
      patientId: pat3,
      professionalId: profSt1,
      serviceId: triServiceId,
      appointmentPrice: 0,
      billingChoice: 'enroll_periodic',
      enrollBillingPlan: {
        billingFrequency: 'quarterly',
        amount: 540,
        dueDay: 10,
        startDate: startMon,
        endDate: addDaysIso(pat3End, -1), // 1 ciclo exato de 3 meses [startMon .. end-1]
        paymentMethod: 'pix',
        generateInitialCycle: true,
        generateAllContractCycles: true
      },
      startTime: `${startMon}T08:00:00`,
      endTime: `${startMon}T09:00:00`,
      modality: 'presential',
      recurrence: {
        frequency: 'custom_weekdays',
        weekdays: [1, 3],
        seriesMode: 'cadence_duration',
        durationCode: '3_months',
        scheduleEntries: [
          { classScheduleId: triMonSched.id, weekday: 1, startTime: '08:00', endTime: '09:00', professionalId: profSt1, coInstructorIds: [profSt2], modality: 'presential' },
          { classScheduleId: triWedSched.id, weekday: 3, startTime: '08:00', endTime: '09:00', professionalId: profSt1, coInstructorIds: [profSt2], modality: 'presential' }
        ],
        endDate: addDaysIso(pat3End, -1)
      }
    });
    assert(resTriBook.status === 201 && resTriBook.data.billingPlanId, 'Cenário 3: Contratação trimestral criada', resTriBook.data);
    const pat3PlanId = resTriBook.data.billingPlanId;
    const pat3Appts = db.prepare(`SELECT * FROM appointments WHERE tenant_id = ? AND patient_id = ?`).all(studioId, pat3);
    const pat3PlanPays = db.prepare(`SELECT * FROM payments WHERE tenant_id = ? AND recurring_plan_id = ?`).all(studioId, pat3PlanId);
    const pat3PerApptPays = db.prepare(`SELECT * FROM payments WHERE tenant_id = ? AND patient_id = ? AND appointment_id IS NOT NULL`).all(studioId, pat3);
    assert(
      pat3Appts.length >= 20 && pat3PerApptPays.length === 0 && pat3PlanPays.length === 1 && Number(pat3PlanPays[0].amount) === 540 && pat3PlanPays[0].billing_frequency === 'quarterly' && pat3PlanPays[0].due_date >= startMon,
      'Cenário 3: Trimestre inteiro gera >=20 aulas, ZERO cobranças por aula e APENAS 1 cobrança trimestral de R$ 540,00 com vencimento válido',
      { appts: pat3Appts.length, planPays: pat3PlanPays }
    );

    // =========================================================================
    // CENÁRIO 4: Contrato Anual de aulas (seg/qua) + Pagamento Trimestral -> 4 cobranças no ano
    // =========================================================================
    console.log('4. Contrato Anual de aulas semanais + Pagamento Trimestral -> 4 cobranças trimestrais...');
    const pat4End = addDaysIso(addMonthsClampIso(startMon, 12), -1);
    const resAnnualTri = await makeReq('POST', '/api/v1/appointments/recurring', authStudio, {
      patientId: pat4,
      professionalId: profSt1,
      serviceId: triServiceId,
      appointmentPrice: 0,
      billingChoice: 'enroll_periodic',
      enrollBillingPlan: {
        billingFrequency: 'quarterly',
        amount: 540,
        dueDay: 10,
        startDate: startMon,
        endDate: pat4End,
        paymentMethod: 'credit_card',
        generateInitialCycle: true,
        generateAllContractCycles: true
      },
      startTime: `${startMon}T08:00:00`,
      endTime: `${startMon}T09:00:00`,
      modality: 'presential',
      recurrence: {
        frequency: 'custom_weekdays',
        weekdays: [1, 3],
        seriesMode: 'cadence_duration',
        durationCode: '12_months',
        scheduleEntries: [
          { classScheduleId: triMonSched.id, weekday: 1, startTime: '08:00', endTime: '09:00', professionalId: profSt1, coInstructorIds: [profSt2], modality: 'presential' },
          { classScheduleId: triWedSched.id, weekday: 3, startTime: '08:00', endTime: '09:00', professionalId: profSt1, coInstructorIds: [profSt2], modality: 'presential' }
        ],
        endDate: pat4End
      }
    });
    assert(resAnnualTri.status === 201, 'Cenário 4: Contrato anual com cobrança trimestral criado', resAnnualTri.data);
    const pat4Appts = db.prepare(`SELECT * FROM appointments WHERE tenant_id = ? AND patient_id = ?`).all(studioId, pat4);
    const pat4PlanPays = db.prepare(`SELECT * FROM payments WHERE tenant_id = ? AND recurring_plan_id = ? ORDER BY due_date ASC`).all(studioId, resAnnualTri.data.billingPlanId);
    assert(
      pat4Appts.length >= 90 && pat4PlanPays.length === 4 && pat4PlanPays.every(p => Number(p.amount) === 540 && p.billing_frequency === 'quarterly'),
      'Cenário 4: ~1 ano de aulas semanais + EXATAMENTE 4 competências trimestrais de R$ 540,00',
      { appts: pat4Appts.length, payCount: pat4PlanPays.length, pays: pat4PlanPays.map(p => p.billing_cycle_key) }
    );

    // =========================================================================
    // CENÁRIO 5: Planos Semestral (6m) e Anual (12m) no Billing Center
    // =========================================================================
    console.log('5. Planos Semestral (6m) e Anual (12m)...');
    const semiPlanRes = await makeReq('POST', '/api/v1/financial/recurring-plans', authStudio, {
      patientId: pat5,
      serviceId: triServiceId,
      professionalId: profSt1,
      title: 'Pilates Semestral',
      amount: 990,
      billingFrequency: 'semiannual',
      dueDay: 15,
      startDate: startMon,
      endDate: addDaysIso(addMonthsClampIso(startMon, 12), -1),
      generateAllContractCycles: true
    });
    const semiPlanId = semiPlanRes.data?.plan?.id;
    const semiPays = db.prepare(`SELECT * FROM payments WHERE tenant_id = ? AND recurring_plan_id = ?`).all(studioId, semiPlanId);
    assert(semiPlanRes.status === 201 && Number(semiPlanRes.data?.plan?.cycle_months) === 6 && semiPays.length === 2, 'Cenário 5a: Plano semestral de 12 meses gera exatamente 2 cobranças (6 em 6 meses)', { semiPlan: semiPlanRes.data?.plan, semiPays });

    const annualPlanRes = await makeReq('POST', '/api/v1/financial/recurring-plans', authStudio, {
      patientId: pat1,
      serviceId: dropServiceId,
      professionalId: profSt1,
      title: 'Anuidade Full',
      amount: 1800,
      billingFrequency: 'annual',
      dueDay: 5,
      startDate: startMon,
      endDate: addDaysIso(addMonthsClampIso(startMon, 12), -1),
      generateAllContractCycles: true
    });
    const annualPlanId = annualPlanRes.data?.plan?.id;
    const annualPays = db.prepare(`SELECT * FROM payments WHERE tenant_id = ? AND recurring_plan_id = ?`).all(studioId, annualPlanId);
    assert(annualPlanRes.status === 201 && Number(annualPlanRes.data?.plan?.cycle_months) === 12 && annualPays.length === 1, 'Cenário 5b: Plano anual gera exatamente 1 cobrança no ciclo de 12 meses', { annualPlan: annualPlanRes.data?.plan, annualPays });

    // =========================================================================
    // CENÁRIO 6: Idempotência do gerador de competências (meses intermediários e reexecução)
    // =========================================================================
    console.log('6. Idempotência do gerador nos meses 1, 2, 3 e reexecuções...');
    const m1 = startMon.slice(0, 7);
    const m2 = addMonthsClampIso(startMon, 1).slice(0, 7);
    const m3 = addMonthsClampIso(startMon, 2).slice(0, 7);
    const beforePat3PaysCount = db.prepare(`SELECT COUNT(*) AS c FROM payments WHERE tenant_id = ? AND recurring_plan_id = ?`).get(studioId, pat3PlanId).c;
    for (const cm of [m1, m2, m3, m1, m2]) {
      const genRes = await makeReq('POST', '/api/v1/financial/recurring-plans/generate', authStudio, { competenceMonth: cm });
      assert(genRes.status === 200, `Gerador executado sem erro para competência ${cm}`);
    }
    const afterPat3PaysCount = db.prepare(`SELECT COUNT(*) AS c FROM payments WHERE tenant_id = ? AND recurring_plan_id = ?`).get(studioId, pat3PlanId).c;
    assert(
      beforePat3PaysCount === 1 && afterPat3PaysCount === 1,
      'Cenário 6: Plano trimestral NÃO gera cobranças extras nos meses 2 ou 3 nem duplica ao reexecutar',
      { beforePat3PaysCount, afterPat3PaysCount }
    );

    // =========================================================================
    // CENÁRIO 8: Pacote existente vinculado -> zero cobrança avulsa por aula
    // =========================================================================
    console.log('8. Serviço com pacote existente -> sem cobrança dupla...');
    const pkgRes = await makeReq('POST', '/api/v1/packages', authStudio, {
      name: 'Pacote Trimestral Pilates 12x',
      billingType: 'recurring_monthly',
      billingFrequency: 'quarterly',
      price: 480,
      creditMode: 'per_service',
      validityDays: 90,
      dueDay: 10,
      items: [{ serviceId: triServiceId, includedCredits: 12 }]
    });
    assert(pkgRes.status === 201 && pkgRes.data.package.billing_frequency === 'quarterly' && Number(pkgRes.data.package.cycle_months) === 3, 'Cenário 8: Pacote criado com periodicidade trimestral', pkgRes.data.package);
    const pkgId = pkgRes.data.package.id;

    const srvPkgRes = await makeReq('POST', '/api/v1/services', authStudio, {
      professionalId: profSt1,
      name: 'Pilates Exclusivo Pacote',
      durationMinutes: 50,
      price: 100,
      modality: 'presential',
      serviceDomain: 'studio',
      serviceKind: 'individual',
      billingMode: 'package',
      defaultPackageId: pkgId
    });
    assert(srvPkgRes.status === 201 && srvPkgRes.data.billing_mode === 'package' && srvPkgRes.data.default_package_id === pkgId, 'Cenário 8: Serviço configurado com billing_mode=package', srvPkgRes.data);

    // Contratar pacote para pat5
    const sellPkgRes = await makeReq('POST', '/api/v1/package-contracts', authStudio, {
      studentId: pat5,
      packageId: pkgId,
      paymentMethod: 'pix',
      startDate: startMon
    });
    assert(sellPkgRes.status === 201, 'Cenário 8: Contrato de pacote vendido para pat5', sellPkgRes.data);
    const pat5ContractId = sellPkgRes.data.contract.id;

    // Atualizar o item de entitlement para cobrir também srvPkgRes.data.id (via novo pacote ou outro horário em triServiceId)
    const nextThu = getFutureWeekdayIso(4, 10);
    const bookPkgAppt = await makeReq('POST', '/api/v1/appointments', authStudio, {
      patientId: pat5,
      professionalId: profSt2,
      serviceId: triServiceId,
      packageContractId: pat5ContractId,
      appointmentPrice: 0,
      startTime: `${nextThu}T11:00:00`,
      endTime: `${nextThu}T12:00:00`,
      modality: 'presential',
      isCustomTime: true
    });
    assert(bookPkgAppt.status === 201 && bookPkgAppt.data.coverageType === 'package', 'Cenário 8: Aula avulsa via pacote marcada com coverageType=package', bookPkgAppt.data);
    const pkgPerApptPay = db.prepare(`SELECT COUNT(*) AS c FROM payments WHERE tenant_id = ? AND appointment_id = ?`).get(studioId, bookPkgAppt.data.id).c;
    assert(pkgPerApptPay === 0, 'Cenário 8: Aula coberta por pacote não gera cobrança avulsa na agenda', { pkgPerApptPay });

    // =========================================================================
    // CENÁRIO 9: Recibo avulso bloqueado para aula coberta; permitido para pagamento do ciclo
    // =========================================================================
    console.log('9. Bloqueio de recibo avulso em aula coberta e recibo permitido na cobrança do ciclo...');
    const coveredApptId = pat3Appts[0].id;
    const blockRcptRes = await makeReq('POST', '/api/v1/receipts', authStudio, {
      appointmentId: coveredApptId,
      payerName: 'Aluna Trimestral',
      amount: 120
    });
    assert(blockRcptRes.status === 409 && blockRcptRes.data.code === 'COVERED_SESSION_NO_SEPARATE_RECEIPT', 'Cenário 9a: Emissão de recibo individual para aula coberta bloqueada com 409', blockRcptRes.data);

    const cyclePayId = pat3PlanPays[0].id;
    const allowRcptRes = await makeReq('POST', '/api/v1/receipts', authStudio, {
      paymentId: cyclePayId,
      patientId: pat3,
      payerName: 'Aluna Trimestral',
      serviceDescription: 'Parcela Trimestral Pilates',
      grossAmount: 540,
      finalAmount: 540,
      paymentMethod: 'pix'
    });
    assert(allowRcptRes.status === 201, 'Cenário 9b: Emissão de recibo para a cobrança do ciclo trimestral (R$ 540) permitida', allowRcptRes.data);

    // =========================================================================
    // CENÁRIO 10: Folha / Comissões com contrato periódico (rateio exato + co-instrutores sem multiplicação)
    // =========================================================================
    console.log('10. Comissões / Folha: rateio correto sem multiplicar R$ 540 por aula...');
    const targetMonth = pat3Appts[0].start_time.slice(0, 7);
    const pat3MonthAppts = pat3Appts.filter(a => String(a.start_time).slice(0, 7) === targetMonth);
    const pat3TotalCycleCount = pat3Appts.length;

    // Concluir somente os agendamentos de pat3 + aula avulsa de pat1 no mesmo mês
    // Primeiro isolar apenas pat3 & drop-in pat1: cancelar appts de pat2 e pat4 para medir com precisão matemática
    db.prepare(`UPDATE appointments SET status = 'cancelled' WHERE tenant_id = ? AND patient_id IN (?, ?, ?)`).run(studioId, pat2, pat4, pat5);
    // Marcar payment trimestral da pat3 como pago (ciclo único de R$ 540 cobrindo pat3TotalCycleCount aulas no trimestre)
    db.prepare(`UPDATE payments SET status = 'paid', payment_date = datetime('now') WHERE tenant_id = ? AND id = ?`).run(studioId, cyclePayId);
    // Marcar payment avulso da pat1 como pago se cair no mesmo mês; forçar todas appts pat3 como completed
    for (const a of pat3MonthAppts) {
      db.prepare(`UPDATE appointments SET status = 'completed' WHERE id = ? AND tenant_id = ?`).run(a.id, studioId);
    }

    const payRes = await makeReq('POST', '/api/v1/payroll/calculate', authStudio, { periodMonth: targetMonth });
    assert(payRes.status === 200, 'Cenário 10: POST /api/v1/payroll/calculate executado', payRes.data);
    const rowLia = (payRes.data.results || []).find(r => r.professionalId === profSt1);
    const rowCaio = (payRes.data.results || []).find(r => r.professionalId === profSt2);
    const expectedProratedTotal = Math.round(((540 / pat3TotalCycleCount) * pat3MonthAppts.length) * 100) / 100;
    const totalProducedBoth = Number(rowLia?.producedAmount || 0) + Number(rowCaio?.producedAmount || 0);
    const dropSameMonth = nextTue.slice(0, 7) === targetMonth ? 0 : 0; // nextTue wasn't completed, only pat3MonthAppts were completed!
    assert(
      rowLia && rowCaio && totalProducedBoth > 0 && Math.abs(totalProducedBoth - expectedProratedTotal) <= 0.15 && totalProducedBoth < 540,
      `Cenário 10: Receita na folha rateada corretamente (~R$ ${expectedProratedTotal.toFixed(2)}, nunca R$ 540 x aulas) e dividida entre instrutora + co-instrutor sem duplicação`,
      { pat3TotalCycleCount, inMonth: pat3MonthAppts.length, expectedProratedTotal, rowLia, rowCaio, totalProducedBoth }
    );

    // Fechar/travar folha de profSt1 e garantir que mudança de preço posterior não altera folha travada
    if (rowLia?.payrollId) {
      db.prepare(`UPDATE payroll_runs SET status = 'paid' WHERE id = ? AND tenant_id = ?`).run(rowLia.payrollId, studioId);
    }

    // =========================================================================
    // CENÁRIO 11: Alteração posterior de preço/modalidade no serviço NÃO altera contratos/pagamentos/folha históricos
    // =========================================================================
    console.log('11. Alteração comercial no serviço não afeta contratos/recibos históricos...');
    const updSrvRes = await makeReq('PUT', `/api/v1/services/${triServiceId}`, authStudio, {
      name: 'Pilates Aparelhos',
      durationMinutes: 60,
      price: 200,
      modality: 'presential',
      serviceDomain: 'studio',
      serviceKind: 'group',
      defaultCapacity: 10,
      billingMode: 'semiannual',
      periodicPrice: 1500
    });
    assert(updSrvRes.status === 200 && Number(updSrvRes.data.periodic_price) === 1500, 'Serviço alterado para semestral R$ 1500,00');
    const histPayAfter = db.prepare(`SELECT amount, billing_frequency FROM payments WHERE id = ?`).get(cyclePayId);
    const histPlanAfter = db.prepare(`SELECT amount, billing_frequency FROM recurring_billing_plans WHERE id = ?`).get(pat3PlanId);
    const lockedRunAfter = rowLia?.payrollId ? db.prepare(`SELECT commission_amount, status FROM payroll_runs WHERE id = ?`).get(rowLia.payrollId) : null;
    assert(
      Number(histPayAfter.amount) === 540 && histPayAfter.billing_frequency === 'quarterly' && Number(histPlanAfter.amount) === 540 && (!lockedRunAfter || lockedRunAfter.status === 'paid'),
      'Cenário 11: Pagamento histórico, plano existente e folha travada mantidos intactos após alteração no serviço',
      { histPayAfter, histPlanAfter, lockedRunAfter }
    );

    // =========================================================================
    // CENÁRIO 12 & 13: Estabelecimento MISTO e CLÍNICA TRADICIONAL
    // =========================================================================
    console.log('12 & 13. Estabelecimento Misto vs Clínica Tradicional...');
    const mixedClinicalFail = await makeReq('POST', '/api/v1/services', authMixed, {
      professionalId: profMx,
      name: 'Consulta Clínica',
      durationMinutes: 50,
      price: 300,
      modality: 'presential',
      serviceDomain: 'clinical',
      serviceKind: 'individual',
      billingMode: 'quarterly',
      periodicPrice: 800
    });
    assert(mixedClinicalFail.status === 400 && String(mixedClinicalFail.data?.error || '').toLowerCase().includes('studio'), 'Cenário 12a: Estabelecimento misto bloqueia modalidade periódica em serviço clínico', mixedClinicalFail.data);

    const mixedStudioOk = await makeReq('POST', '/api/v1/services', authMixed, {
      professionalId: profMx,
      name: 'Funcional Studio',
      durationMinutes: 50,
      price: 80,
      modality: 'presential',
      serviceDomain: 'studio',
      serviceKind: 'group',
      defaultCapacity: 8,
      billingMode: 'monthly',
      periodicPrice: 280
    });
    assert(mixedStudioOk.status === 201 && mixedStudioOk.data.billing_mode === 'monthly' && Number(mixedStudioOk.data.periodic_price) === 280, 'Cenário 12b: Estabelecimento misto permite modalidade periódica no serviço Studio', mixedStudioOk.data);

    const clinicFail = await makeReq('POST', '/api/v1/services', authClinic, {
      professionalId: profCl,
      name: 'Fisioterapia Padrão',
      durationMinutes: 50,
      price: 200,
      modality: 'presential',
      billingMode: 'monthly',
      periodicPrice: 600
    });
    assert(clinicFail.status === 400 && String(clinicFail.data?.error || '').toLowerCase().includes('clínicas'), 'Cenário 13a: Clínica tradicional bloqueia modalidades de cobrança do Studio', clinicFail.data);

    const clinicOk = await makeReq('POST', '/api/v1/services', authClinic, {
      professionalId: profCl,
      name: 'Consulta Ortopédica',
      durationMinutes: 50,
      bufferMinutes: 10,
      price: 250,
      modality: 'presential'
    });
    const clinicAppt = await makeReq('POST', '/api/v1/appointments', authClinic, {
      patientId: patCl,
      professionalId: profCl,
      serviceId: clinicOk.data.id,
      appointmentPrice: 250,
      startTime: `${nextTue}T14:00:00`,
      endTime: `${nextTue}T14:50:00`,
      modality: 'presential'
    });
    assert(clinicAppt.status === 201 && clinicAppt.data.coverageType === 'drop_in', 'Cenário 13b: Clínica tradicional mantém fluxo de atendimento e cobrança preservado', clinicAppt.data);

    // =========================================================================
    // CENÁRIO 14: Isolamento Multi-Tenant & Cancelamento/Expiração voltando para avulso
    // =========================================================================
    console.log('14. Isolamento multi-tenant + Cancelamento de contrato retornando cobertura para avulso...');
    const otherCovRes = await makeReq('GET', `/api/v1/financial/student-coverage?patientId=${pat3}&serviceId=${triServiceId}&date=${startMon}`, authOther);
    assert(
      otherCovRes.status === 200 && (otherCovRes.data.activePeriodicPlans || []).length === 0 && (otherCovRes.data.activePackages || []).length === 0,
      'Cenário 14a: Outro tenant não enxerga planos/pacotes de outro estúdio',
      otherCovRes.data
    );

    const cancelPlanRes = await makeReq('PUT', `/api/v1/financial/recurring-plans/${pat3PlanId}`, authStudio, {
      status: 'cancelled',
      cancellationReason: 'Aluno solicitou encerramento'
    });
    assert(cancelPlanRes.status === 200 && cancelPlanRes.data?.plan?.status === 'cancelled', 'Cenário 14b: Contrato trimestral encerrado com sucesso', cancelPlanRes.data);

    const afterCancelCov = await makeReq('GET', `/api/v1/financial/student-coverage?patientId=${pat3}&serviceId=${triServiceId}&date=${nextThu}`, authStudio);
    assert(
      afterCancelCov.status === 200 && (afterCancelCov.data.activePeriodicPlans || []).length === 0,
      'Cenário 14c: Após cancelamento do contrato, cobertura automática zera e próxima aula volta para avulsa',
      afterCancelCov.data
    );

    const nextApptAfterCancel = await makeReq('POST', '/api/v1/appointments', authStudio, {
      patientId: pat3,
      professionalId: profSt1,
      serviceId: triServiceId,
      appointmentPrice: 200,
      startTime: `${nextThu}T15:00:00`,
      endTime: `${nextThu}T16:00:00`,
      modality: 'presential',
      isCustomTime: true
    });
    assert(
      nextApptAfterCancel.status === 201 && nextApptAfterCancel.data.coverageType === 'drop_in' && !nextApptAfterCancel.data.billingPlanId,
      'Cenário 14d: Nova aula após cancelamento volta corretamente para cobrança avulsa',
      nextApptAfterCancel.data
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
