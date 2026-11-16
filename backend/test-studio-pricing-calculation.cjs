const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.resolve(__dirname, 'test_studio_pricing_calculation.db');
process.env.DATABASE_PATH = DB_PATH;
process.env.JWT_SECRET = 'test-studio-pricing-secret-2026';
process.env.ZEMDA_FILES_SIGNING_SECRET = 'test-studio-pricing-files-2026';
const TEST_PORT = 3137;
process.env.PORT = String(TEST_PORT);

for (const ext of ['', '-wal', '-shm']) {
  if (fs.existsSync(DB_PATH + ext)) {
    fs.unlinkSync(DB_PATH + ext);
  }
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');
const {
  calculateStudioRecurringPrice,
  countWeekdayOccurrencesBetweenDates
} = require('./dist/utils/studio-pricing');
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
    console.error(`  [FAIL] ${msg}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`);
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

function getFutureWeekdayIso(targetDow, minDaysAhead = 7) {
  const now = new Date(Date.now() - 3 * 3600 * 1000);
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + minDaysAhead, 12, 0, 0));
  const diff = (targetDow - base.getUTCDay() + 7) % 7;
  base.setUTCDate(base.getUTCDate() + diff);
  return base.toISOString().slice(0, 10);
}

async function runTests() {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(TEST_PORT, resolve));

  console.log('\n=========================================================================================');
  console.log('TESTES: Calculo Automatico dos Valores de Planos e Cobrancas no Zemda Studio');
  console.log('=========================================================================================\n');

  try {
    // -------------------------------------------------------------------------
    // BLOCO 1: Testes unitários da engine studio-pricing.ts (Criterios 1 a 10)
    // -------------------------------------------------------------------------
    console.log('--- Bloco 1: Motor de calculo (studio-pricing.ts) ---');

    const c1 = calculateStudioRecurringPrice({
      serviceName: 'Pilates',
      sessionPrice: 80,
      billingMode: 'per_session'
    });
    assert(c1.suggestedPrice === 80 && c1.effectivePrice === 80 && c1.averagePricePerSession === 80, '1. Aula avulsa retorna R$ 80,00');

    const c2 = calculateStudioRecurringPrice({
      serviceName: 'Yoga',
      sessionPrice: 80,
      weeklySessionsCount: 1,
      billingMode: 'monthly',
      pricingRule: 'four_weeks'
    });
    assert(c2.suggestedPrice === 320 && c2.referenceSessionsCount === 4 && c2.averagePricePerSession === 80, '2. 1x/sem mensal (4 semanas): R$ 80 x 1 x 4 = R$ 320,00', c2);

    const c3 = calculateStudioRecurringPrice({
      serviceName: 'Yoga',
      sessionPrice: 80,
      weeklySessionsCount: 2,
      billingMode: 'monthly',
      pricingRule: 'four_weeks'
    });
    assert(c3.suggestedPrice === 640 && c3.referenceSessionsCount === 8 && c3.averagePricePerSession === 80, '3. 2x/sem mensal (4 semanas): R$ 80 x 2 x 4 = R$ 640,00', c3);

    const c4a = calculateStudioRecurringPrice({
      serviceName: 'Funcional',
      sessionPrice: 70,
      weeklySessionsCount: 3,
      billingMode: 'monthly',
      pricingRule: 'four_weeks'
    });
    const c4b = calculateStudioRecurringPrice({
      serviceName: 'Funcional',
      sessionPrice: 70,
      weeklySessionsCount: 5,
      billingMode: 'monthly',
      pricingRule: 'four_weeks'
    });
    assert(c4a.suggestedPrice === 840 && c4b.suggestedPrice === 1400, '4. 3x/sem e 5x/sem calculam R$ 840,00 e R$ 1.400,00', { c4a: c4a.suggestedPrice, c4b: c4b.suggestedPrice });

    const bim = calculateStudioRecurringPrice({ sessionPrice: 80, weeklySessionsCount: 2, billingMode: 'bimonthly', pricingRule: 'four_weeks' });
    const tri = calculateStudioRecurringPrice({ sessionPrice: 80, weeklySessionsCount: 2, billingMode: 'quarterly', pricingRule: 'four_weeks' });
    const sem = calculateStudioRecurringPrice({ sessionPrice: 80, weeklySessionsCount: 2, billingMode: 'semiannual', pricingRule: 'four_weeks' });
    const anu = calculateStudioRecurringPrice({ sessionPrice: 80, weeklySessionsCount: 2, billingMode: 'annual', pricingRule: 'four_weeks' });
    const bie = calculateStudioRecurringPrice({ sessionPrice: 80, weeklySessionsCount: 2, billingMode: 'biennial', pricingRule: 'four_weeks' });
    assert(
      bim.suggestedPrice === 1280 &&
      tri.suggestedPrice === 1920 &&
      sem.suggestedPrice === 3840 &&
      anu.suggestedPrice === 7680 &&
      bie.suggestedPrice === 15360,
      '5. Periodicidades bimestral/trimestral/semestral/anual/bienal (4 sem/mês)',
      { bim: bim.suggestedPrice, tri: tri.suggestedPrice, sem: sem.suggestedPrice, anu: anu.suggestedPrice, bie: bie.suggestedPrice }
    );

    const avgMonthly = calculateStudioRecurringPrice({
      serviceName: 'Yoga',
      sessionPrice: 80,
      weeklySessionsCount: 2,
      billingMode: 'monthly',
      pricingRule: 'annual_average'
    });
    const expectedAvgMonthly = Math.round(((80 * 2 * 52) / 12) * 100) / 100; // 693.33
    const avgAnnual = calculateStudioRecurringPrice({
      serviceName: 'Yoga',
      sessionPrice: 80,
      weeklySessionsCount: 2,
      billingMode: 'annual',
      pricingRule: 'annual_average'
    });
    assert(
      avgMonthly.suggestedPrice === expectedAvgMonthly &&
      avgMonthly.referenceSessionsText.includes('~8 a 9 aulas') &&
      avgAnnual.suggestedPrice === 8320 &&
      avgAnnual.referenceSessionsCount === 104,
      '6/7. Regra de média anual (52 sem / 12 meses) calcula R$ 693,33 mensal e R$ 8.320,00 anual (104 aulas)',
      { avgMonthly, avgAnnual }
    );

    // Regra B (calendário real): março/2026 seg (1) e qua (3) -> 2026-03-02..2026-03-31
    const realDaysMar = countWeekdayOccurrencesBetweenDates('2026-03-02', '2026-03-31', [1, 3]);
    const cReal = calculateStudioRecurringPrice({
      serviceName: 'Pilates Real',
      sessionPrice: 90,
      weeklySessionsCount: 2,
      billingMode: 'custom_date',
      pricingRule: 'scheduled_sessions',
      startDate: '2026-03-02',
      endDate: '2026-03-31',
      scheduleWeekdays: [1, 3]
    });
    const cScheduledMonthly = calculateStudioRecurringPrice({
      serviceName: 'Pilates Real',
      sessionPrice: 90,
      weeklySessionsCount: 2,
      billingMode: 'monthly',
      pricingRule: 'scheduled_sessions',
      scheduledSessionsCount: 9
    });
    assert(
      realDaysMar === 9 &&
      cReal.suggestedPrice === 810 &&
      cReal.referenceSessionsCount === 9 &&
      cScheduledMonthly.suggestedPrice === 810,
      '8. Regra calendário real / custom_date contabiliza exatamente 9 aulas previstas (R$ 810,00)',
      { realDaysMar, cReal, cScheduledMonthly }
    );

    const cCount = calculateStudioRecurringPrice({
      serviceName: 'Lote Fixo',
      sessionPrice: 75,
      billingMode: 'count',
      includedSessionsCount: 10
    });
    assert(cCount.suggestedPrice === 750 && cCount.referenceSessionsCount === 10, '8b. Quantidade fixa de aulas (10 x R$ 75 = R$ 750,00)');

    const cCustom = calculateStudioRecurringPrice({
      serviceName: 'Pilates',
      sessionPrice: 80,
      weeklySessionsCount: 2,
      billingMode: 'quarterly',
      pricingRule: 'four_weeks',
      customPrice: 1680,
      isPriceCustomized: true
    });
    assert(
      cCustom.suggestedPrice === 1920 &&
      cCustom.effectivePrice === 1680 &&
      cCustom.isPriceCustomized === true &&
      cCustom.averagePricePerSession === 70 &&
      cCustom.discountPercent === 12.5,
      '9. Valor personalizado calcula valor médio por aula (R$ 70) e economia (12,5%) sem perder sugerido (R$ 1.920)',
      cCustom
    );

    const cNotCustomWithStalePrice = calculateStudioRecurringPrice({
      serviceName: 'Pilates',
      sessionPrice: 80,
      weeklySessionsCount: 2,
      billingMode: 'monthly',
      pricingRule: 'four_weeks',
      customPrice: 320,
      isPriceCustomized: false
    });
    assert(
      cNotCustomWithStalePrice.isPriceCustomized === false &&
      cNotCustomWithStalePrice.effectivePrice === 640 &&
      cNotCustomWithStalePrice.suggestedPrice === 640,
      '9b. Quando isPriceCustomized=false explícito, alteração de frequência atualiza effectivePrice mesmo se customPrice antigo for passado',
      cNotCustomWithStalePrice
    );

    // -------------------------------------------------------------------------
    // BLOCO 2: Integração completa via API HTTP (Services + Appointments + Billing)
    // -------------------------------------------------------------------------
    console.log('\n--- Bloco 2: Integração API (Serviços, Edição, Agendamento e Cobrança) ---');

    const studioId = 'ten-sp-' + uuidv4().slice(0, 6);
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
      saturday: { enabled: true, open: '07:00', close: '18:00' },
      sunday: { enabled: false, open: '08:00', close: '12:00' }
    });

    const insTenant = db.prepare(`
      INSERT INTO tenants (
        id, name, trade_name, slug, email, status, billing_required,
        public_booking_enabled, establishment_profile, business_hours_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'active', 0, 1, ?, ?, datetime('now'), datetime('now'))
    `);
    insTenant.run(studioId, 'Studio Pricing', 'Studio Pricing', 'studio-pr-' + uuidv4().slice(0, 5), 'studio-pr@test.com', 'studio', hours);
    insTenant.run(clinicId, 'Clinica Normal', 'Clinica Normal', 'clinica-pr-' + uuidv4().slice(0, 5), 'clinica-pr@test.com', 'clinic', hours);

    const adminStudio = { userId: 'usr-st-' + uuidv4().slice(0, 6), profId: 'prf-st-' + uuidv4().slice(0, 6) };
    const adminClinic = { userId: 'usr-cl-' + uuidv4().slice(0, 6), profId: 'prf-cl-' + uuidv4().slice(0, 6) };

    db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES (?, ?, 'Gestora Ana', 'ana-pr@studio.test', 'h', 'clinic_admin', 'active')`).run(adminStudio.userId, studioId);
    db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json) VALUES (?, ?, ?, 'clinic_admin', 'active', 1, '["manage_services","view_financial","manage_financial","view_schedule","manage_patients","manage_payroll"]')`).run('cu-st-' + uuidv4().slice(0, 6), studioId, adminStudio.userId);
    db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json) VALUES (?, ?, ?, 'clinic_admin', 'active', 1, '["manage_services","view_financial","manage_financial","view_schedule","manage_patients","manage_payroll"]')`).run('cu-cl-' + uuidv4().slice(0, 6), clinicId, adminStudio.userId);

    const insProf = db.prepare(`
      INSERT INTO professionals (
        id, tenant_id, user_id, name, slug, profession_id, profession_name,
        active, public_booking_enabled, remuneration_type, commission_percentage, fixed_salary
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, 1, 1, 'commission', 50, 0)
    `);
    insProf.run(adminStudio.profId, studioId, 'Instrutora Ana', 'ana-pr-' + uuidv4().slice(0, 5), profType, 'Educador Físico');
    insProf.run(adminClinic.profId, clinicId, 'Dr. Carlos', 'carlos-pr-' + uuidv4().slice(0, 5), profType, 'Fisioterapia');

    const insSched = db.prepare(`INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active) VALUES (?, ?, ?, ?, '07:00', '21:00', 1)`);
    for (let dow = 1; dow <= 5; dow++) {
      insSched.run(uuidv4(), studioId, adminStudio.profId, dow);
      insSched.run(uuidv4(), clinicId, adminClinic.profId, dow);
    }

    const tokenStudio = generateToken({ userId: adminStudio.userId, tenantId: studioId, email: 'ana-pr@studio.test', role: 'clinic_admin' });
    const tokenClinic = generateToken({ userId: adminStudio.userId, tenantId: clinicId, email: 'ana-pr@studio.test', role: 'clinic_admin' });
    const authStudio = { Authorization: `Bearer ${tokenStudio}`, 'x-tenant-id': studioId };
    const authClinic = { Authorization: `Bearer ${tokenClinic}`, 'x-tenant-id': clinicId };

    const patient1Id = 'pat-1-' + uuidv4().slice(0, 6);
    const patient2Id = 'pat-2-' + uuidv4().slice(0, 6);
    db.prepare(`INSERT INTO patients (id, tenant_id, full_name, phone, cpf, created_at) VALUES (?, ?, 'Aluno Joao', '11999990001', '21111111101', datetime('now'))`).run(patient1Id, studioId);
    db.prepare(`INSERT INTO patients (id, tenant_id, full_name, phone, cpf, created_at) VALUES (?, ?, 'Aluna Maria', '11999990002', '21111111102', datetime('now'))`).run(patient2Id, studioId);

    // Teste 10: Criar serviço mensal 2x/semana sem passar periodicPrice explicito -> backend calcula R$ 640
    const yogaCreateRes = await makeReq('POST', '/api/v1/services', authStudio, {
      professionalId: adminStudio.profId,
      name: 'Yoga Coletiva',
      price: 80,
      durationMinutes: 55,
      serviceKind: 'group',
      defaultCapacity: 8,
      billingMode: 'monthly',
      pricingRule: 'four_weeks',
      weeklySessionsCount: 2,
      defaultBillingDueDay: 10
    });
    const yogaSrv = yogaCreateRes.data;
    assert(
      yogaCreateRes.status === 201 &&
      yogaSrv.periodic_price === 640 &&
      yogaSrv.suggested_price === 640 &&
      yogaSrv.is_price_customized === 0 &&
      yogaSrv.weekly_sessions_count === 2 &&
      yogaSrv.pricing_rule === 'four_weeks',
      '10. POST /v1/services calcula e persiste periodic_price=640, suggested_price=640, is_price_customized=0',
      yogaSrv
    );

    // Teste 11: Editar preço avulso de R$ 80 -> R$ 90 sem informar periodicPrice explicito -> recalcula para R$ 720
    const yogaUpdAuto = await makeReq('PUT', `/api/v1/services/${yogaSrv.id}`, authStudio, {
      price: 90
    });
    const srv11 = yogaUpdAuto.data.service || yogaUpdAuto.data;
    assert(
      yogaUpdAuto.status === 200 &&
      srv11.price === 90 &&
      srv11.periodic_price === 720 &&
      srv11.suggested_price === 720 &&
      srv11.is_price_customized === 0,
      '11. Edição de preço avulso (80 -> 90) em serviço não personalizado recalcula mensalidade para R$ 720,00',
      yogaUpdAuto.data
    );

    // Teste 12: Alteração manual do valor (R$ 650) -> marca is_price_customized=1 e preserva ao mudar frequência/preço
    const yogaCustomRes = await makeReq('PUT', `/api/v1/services/${yogaSrv.id}`, authStudio, {
      periodicPrice: 650,
      isPriceCustomized: true
    });
    const srv12 = yogaCustomRes.data.service || yogaCustomRes.data;
    assert(
      yogaCustomRes.status === 200 &&
      srv12.periodic_price === 650 &&
      srv12.suggested_price === 720 &&
      srv12.is_price_customized === 1,
      '12. Alteração manual define periodic_price=650, is_price_customized=1 e mantém suggested_price=720',
      yogaCustomRes.data
    );

    const yogaPreserveCustomRes = await makeReq('PUT', `/api/v1/services/${yogaSrv.id}`, authStudio, {
      price: 100
    });
    const srv12b = yogaPreserveCustomRes.data.service || yogaPreserveCustomRes.data;
    assert(
      yogaPreserveCustomRes.status === 200 &&
      srv12b.price === 100 &&
      srv12b.periodic_price === 650 &&
      srv12b.suggested_price === 800 &&
      srv12b.is_price_customized === 1,
      '12b. Preservação do valor personalizado (R$ 650) mesmo ao alterar preço avulso para R$ 100 (sugerido vira R$ 800)',
      yogaPreserveCustomRes.data
    );

    // Teste 13: Botão "Recalcular valor sugerido" (enviando isPriceCustomized: false sem periodicPrice)
    const yogaResetRes = await makeReq('PUT', `/api/v1/services/${yogaSrv.id}`, authStudio, {
      isPriceCustomized: false
    });
    const srv13 = yogaResetRes.data.service || yogaResetRes.data;
    assert(
      yogaResetRes.status === 200 &&
      srv13.periodic_price === 800 &&
      srv13.suggested_price === 800 &&
      srv13.is_price_customized === 0,
      '13. Recalcular valor sugerido restaura periodic_price=800 e is_price_customized=0',
      yogaResetRes.data
    );

    // Criar class schedules para Yoga (Seg 08h e Qua 08h)
    await makeReq('POST', `/api/v1/services/${yogaSrv.id}/class-schedules`, authStudio, {
      dayOfWeek: 1, startTime: '08:00', endTime: '08:55', professionalId: adminStudio.profId, capacity: 8
    });
    await makeReq('POST', `/api/v1/services/${yogaSrv.id}/class-schedules`, authStudio, {
      dayOfWeek: 3, startTime: '08:00', endTime: '08:55', professionalId: adminStudio.profId, capacity: 8
    });

    // Teste 14: Criação de contratação recorrente a partir do serviço (trimestral sem passar amount -> calcula 100*2*4*3 = R$ 2.400)
    const nextMonday = getFutureWeekdayIso(1, 10);
    const recEnrollRes = await makeReq('POST', '/api/v1/appointments/recurring', authStudio, {
      patientId: patient1Id,
      professionalId: adminStudio.profId,
      serviceId: yogaSrv.id,
      startTime: `${nextMonday}T08:00:00`,
      endTime: `${nextMonday}T08:55:00`,
      modality: 'presential',
      isCustomTime: true,
      billingChoice: 'enroll_periodic',
      enrollBillingPlan: {
        billingFrequency: 'quarterly',
        dueDay: 10,
        startDate: nextMonday,
        paymentMethod: 'pix',
        generateInitialCycle: true,
        generateAllContractCycles: true
      },
      recurrence: {
        frequency: 'custom_weekdays',
        weekdays: [1, 3],
        durationCode: '3_months',
        seriesMode: 'cadence_duration'
      }
    });

    const enrolledPlan = db.prepare(`SELECT * FROM recurring_billing_plans WHERE id = ?`).get(recEnrollRes.data?.billingPlanId);
    const planPayments = db.prepare(`SELECT * FROM payments WHERE recurring_plan_id = ?`).all(recEnrollRes.data?.billingPlanId);
    const perApptPayments = db.prepare(`SELECT * FROM payments WHERE tenant_id = ? AND patient_id = ? AND appointment_id IS NOT NULL`).all(studioId, patient1Id);
    const seriesAppts = db.prepare(`SELECT * FROM appointments WHERE series_id = ?`).all(recEnrollRes.data?.seriesId);

    assert(
      recEnrollRes.status === 201 &&
      enrolledPlan &&
      enrolledPlan.amount === 2400 &&
      enrolledPlan.pricing_rule_snapshot === 'four_weeks' &&
      enrolledPlan.weekly_sessions_snapshot === 2 &&
      enrolledPlan.reference_sessions_count === 24 &&
      planPayments.length === 1 &&
      planPayments[0].amount === 2400 &&
      perApptPayments.length === 0 &&
      seriesAppts.length > 0 &&
      seriesAppts.every(a => a.billing_coverage_type === 'periodic_plan' && a.recurring_plan_id === enrolledPlan.id),
      '14. Contratação recorrente trimestral calcula R$ 2.400,00, grava snapshots, gera 1 pagamento e zera cobrança avulsa das aulas',
      { status: recEnrollRes.status, enrolledPlan, paymentsCount: planPayments.length, apptsCount: seriesAppts.length, sampleAppt: seriesAppts[0] }
    );

    // Teste 15: Alterar serviço após contratação NÃO altera contrato nem pagamento existente
    await makeReq('PUT', `/api/v1/services/${yogaSrv.id}`, authStudio, {
      price: 150,
      billingMode: 'monthly',
      pricingRule: 'annual_average'
    });
    const planAfterSrvEdit = db.prepare(`SELECT * FROM recurring_billing_plans WHERE id = ?`).get(enrolledPlan.id);
    const payAfterSrvEdit = db.prepare(`SELECT * FROM payments WHERE recurring_plan_id = ?`).all(enrolledPlan.id);
    assert(
      planAfterSrvEdit.amount === 2400 &&
      planAfterSrvEdit.pricing_rule_snapshot === 'four_weeks' &&
      payAfterSrvEdit.length === 1 &&
      payAfterSrvEdit[0].amount === 2400,
      '15. Edição posterior do serviço preserva integralmente contratos e pagamentos existentes'
    );

    // Teste 16: Clínica tradicional permanece isolada (bloqueia cobrança periódica)
    const clinicFailRes = await makeReq('POST', '/api/v1/services', authClinic, {
      professionalId: adminClinic.profId,
      name: 'Sessão Clínica',
      price: 120,
      durationMinutes: 50,
      billingMode: 'monthly',
      weeklySessionsCount: 2
    });
    const clinicOkRes = await makeReq('POST', '/api/v1/services', authClinic, {
      professionalId: adminClinic.profId,
      name: 'Sessão Clínica Padrão',
      price: 120,
      durationMinutes: 50
    });
    assert(
      clinicFailRes.status === 400 &&
      clinicOkRes.status === 201 &&
      clinicOkRes.data.billing_mode === 'per_session',
      '16. Clínica tradicional permanece isolada (não permite cobrança periódica e mantém atendimento avulso)',
      { failStatus: clinicFailRes.status, okStatus: clinicOkRes.status, okBilling: clinicOkRes.data?.billing_mode }
    );

    console.log('\n=========================================================================================');
    console.log(`RESULTADO: ${passed} passed, ${failed} failed`);
    console.log('=========================================================================================\n');
  } catch (err) {
    console.error('Erro inesperado nos testes:', err);
    failed++;
  } finally {
    server.close();
    for (const ext of ['', '-wal', '-shm']) {
      if (fs.existsSync(DB_PATH + ext)) {
        try {
          fs.unlinkSync(DB_PATH + ext);
        } catch {}
      }
    }
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
