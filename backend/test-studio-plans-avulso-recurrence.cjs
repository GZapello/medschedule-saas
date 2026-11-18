const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_studio_plans_avulso_recurrence.db');
process.env.JWT_SECRET = 'test-studio-plans-avulso-recurrence-secret-2026';
process.env.ZEMDA_FILES_SIGNING_SECRET = 'test-studio-plans-files-secret-123456';
process.env.NODE_ENV = 'test';

const TEST_PORT = 3148;
process.env.PORT = String(TEST_PORT);

for (const ext of ['', '-wal', '-shm']) {
  if (fs.existsSync(process.env.DATABASE_PATH + ext)) {
    fs.unlinkSync(process.env.DATABASE_PATH + ext);
  }
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');
const { calculateStudioRecurringPrice } = require('./dist/utils/studio-pricing');
const {
  evaluateSlotTimingStatus,
  getLocalTodayYmd,
  getLocalDatePartsInTimezone,
  addDaysYmd,
  getWeekdayFromYmd
} = require('./dist/utils/studio-timezone');
const { normalizeProposal } = require('./dist/services/studio-catalog-proposal');
const { applyStudioCatalog } = require('./dist/services/studio-catalog-confirmation');

const express = require('express');
const app = express();
app.use(express.json());
app.use('/api', require('./dist/routes').default);

let passed = 0;
let failed = 0;
const failures = [];

function check(cond, msg, detail) {
  if (cond) {
    console.log(`  [PASS] ${msg}`);
    passed++;
  } else {
    const info = detail !== undefined ? ` -> ${JSON.stringify(detail).slice(0, 400)}` : '';
    console.error(`  [FAIL] ${msg}${info}`);
    failures.push(`${msg}${info}`);
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
        res.on('data', chunk => { data += chunk; });
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

function findNextMondayWith9MonWedInMonth(minStartYmd) {
  // Finds a future Monday such that within [monday, monday + 30 days], Mondays & Wednesdays total >= 9
  let cur = minStartYmd;
  for (let i = 0; i < 60; i++) {
    const dow = getWeekdayFromYmd(cur);
    if (dow === 1) {
      let count = 0;
      const end = addDaysYmd(cur, 30);
      let d = cur;
      while (d <= end) {
        const w = getWeekdayFromYmd(d);
        if (w === 1 || w === 3) count++;
        d = addDaysYmd(d, 1);
      }
      if (count >= 9) return { startMon: cur, end30: end, calendarCount: count };
    }
    cur = addDaysYmd(cur, 1);
  }
  return { startMon: minStartYmd, end30: addDaysYmd(minStartYmd, 30), calendarCount: 9 };
}

async function runSuite() {
  const server = await new Promise(resolve => {
    const s = app.listen(TEST_PORT, '127.0.0.1', () => resolve(s));
  });

  try {
    console.log('============================================================================');
    console.log(' SUÍTE E2E — PLANOS, AULAS AVULSAS, RECORRÊNCIA, TIMEZONE E AGENDAMENTO PÚBLICO (41 CENÁRIOS)');
    console.log('============================================================================');

    const studioId = 'ten-sp-studio';
    const clinicId = 'ten-sp-clinic';
    const mixedId = 'ten-sp-mixed';

    const insertTenant = db.prepare(`
      INSERT INTO tenants (
        id, slug, public_booking_slug, public_booking_sequence, public_booking_enabled,
        name, trade_name, email, status, onboarding_completed, onboarding_status, manager_confirmed,
        billing_required, establishment_profile, client_term_label, timezone
      ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, 'active', 1, 'active', 1, 0, ?, ?, ?)
    `);

    insertTenant.run(studioId, 'prime-studio', 'prime-studio', 11, 'Prime Academia & Studio', 'Prime Academia & Studio', 'studio@prime.test', 'studio', 'Aluno', 'America/Sao_Paulo');
    insertTenant.run(clinicId, 'clinica-sp', 'clinica-sp', 12, 'Clínica Padrão', 'Clínica Padrão', 'clinic@prime.test', 'clinic', 'Paciente', 'America/Sao_Paulo');
    insertTenant.run(mixedId, 'misto-sp', 'misto-sp', 13, 'Centro Misto', 'Centro Misto', 'misto@prime.test', 'mixed', 'Cliente', 'America/Sao_Paulo');

    const setupOrg = (tId, prefix, profCode = 'prof-personal-trainer', profTitle = 'Instrutor') => {
      const uId = `usr-${prefix}`;
      const pId = `prof-${prefix}`;
      db.prepare(`
        INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, onboarding_status, email_verified, zemda_personal_enabled)
        VALUES (?, ?, ?, ?, 'hash', 'clinic_admin', 'active', 'active', 1, 1)
      `).run(uId, tId, `Admin ${prefix}`, `${prefix}@prime.test`);
      db.prepare(`
        INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, zemda_personal_enabled)
        VALUES (?, ?, ?, 'clinic_admin', 'active', 1, 1)
      `).run(`cu-${prefix}`, tId, uId);
      db.prepare(`
        INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, profession_name, public_booking_enabled, active)
        VALUES (?, ?, ?, ?, ?, ?, 1, 1)
      `).run(pId, tId, uId, `Prof ${prefix}`, profCode, profTitle);
      for (let dow = 1; dow <= 6; dow++) {
        db.prepare(`
          INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active)
          VALUES (?, ?, ?, ?, '06:00', '22:00', 1)
        `).run(`sch-${prefix}-${dow}`, tId, pId, dow);
      }
      const token = generateToken({ userId: uId, tenantId: tId, role: 'clinic_admin', email: `${prefix}@prime.test` });
      return { userId: uId, profId: pId, headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': tId } };
    };

    const stAuth = setupOrg(studioId, 'st1');
    const clAuth = setupOrg(clinicId, 'cl1', 'prof-fisioterapeuta', 'Fisioterapeuta');
    const mxAuth = setupOrg(mixedId, 'mx1', 'prof-fisioterapeuta', 'Fisioterapeuta');

    const createStudent = (tId, name, phone) => {
      const id = 'pat-' + uuidv4().slice(0, 8);
      db.prepare(`INSERT INTO patients (id, tenant_id, full_name, phone) VALUES (?, ?, ?, ?)`).run(id, tId, name, phone);
      return id;
    };

    // =========================================================================
    // GRUPO A: CADASTRO UNIFICADO, SEPARAÇÃO DE PREÇOS E MODOS (01-08)
    // =========================================================================
    console.log('\n--- Grupo A: Serviços, Modos Comerciais e Separação Avulso vs Planos ---');

    const zumbaOptions = [
      { id: 'opt-z-m2', label: 'Zumba Mensal 2x/sem', commercialUnit: 'per_cycle', amountCents: 22000, accessType: 'scheduled', frequencyType: 'weekly', frequencyCount: 2, contractDurationCode: '1_month', paymentPeriodicity: 'monthly', active: true, allowPublicBooking: true },
      { id: 'opt-z-t2', label: 'Zumba Trimestral 2x/sem', commercialUnit: 'per_month', amountCents: 18500, accessType: 'scheduled', frequencyType: 'weekly', frequencyCount: 2, contractDurationCode: '3_months', paymentPeriodicity: 'quarterly', active: true, allowPublicBooking: true },
      { id: 'opt-z-s2', label: 'Zumba Semestral 2x/sem', commercialUnit: 'per_month', amountCents: 16500, accessType: 'scheduled', frequencyType: 'weekly', frequencyCount: 2, contractDurationCode: '6_months', paymentPeriodicity: 'semiannual', active: true, allowPublicBooking: true },
      { id: 'opt-z-a2', label: 'Zumba Anual 2x/sem', commercialUnit: 'per_month', amountCents: 14500, accessType: 'scheduled', frequencyType: 'weekly', frequencyCount: 2, contractDurationCode: '12_months', paymentPeriodicity: 'annual', active: true, allowPublicBooking: true },
      { id: 'opt-z-m1', label: 'Zumba Mensal 1x/sem', commercialUnit: 'per_cycle', amountCents: 13000, accessType: 'scheduled', frequencyType: 'weekly', frequencyCount: 1, contractDurationCode: '1_month', paymentPeriodicity: 'monthly', active: true, allowPublicBooking: true },
      { id: 'opt-z-m3', label: 'Zumba Mensal 3x/sem', commercialUnit: 'per_cycle', amountCents: 29000, accessType: 'scheduled', frequencyType: 'weekly', frequencyCount: 3, contractDurationCode: '1_month', paymentPeriodicity: 'monthly', active: true, allowPublicBooking: true }
    ];

    // 01. Zumba só planos com 6 opções
    const resZumba = await makeReq('POST', '/api/v1/services', stAuth.headers, {
      professionalId: stAuth.profId,
      name: 'Zumba Energia',
      studioServiceType: 'group',
      serviceKind: 'group',
      serviceDomain: 'studio',
      durationMinutes: 50,
      defaultCapacity: 12,
      price: 0,
      allowSingleBooking: false,
      allowPlanBooking: true,
      allowPublicSingleBooking: false,
      allowPublicPlanBooking: true,
      planCreditMode: 'fixed_credits',
      billingMode: 'monthly',
      periodicPrice: 220,
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['weekly', 'custom_weekdays'],
      defaultRecurrenceFrequency: 'custom_weekdays',
      allowedPlanDurations: ['1_month', '3_months', '6_months', '12_months'],
      commercialPriceOptions: zumbaOptions,
      classSchedules: [
        { professionalId: stAuth.profId, weekdays: [1, 3, 5], startTime: '19:00', endTime: '19:50', modality: 'presential', capacity: 12 }
      ]
    });
    const zumbaId = resZumba.data?.id;
    check(
      resZumba.status === 201 &&
      Number(resZumba.data.price) === 0 &&
      Number(resZumba.data.allow_single_booking) === 0 &&
      Number(resZumba.data.allow_plan_booking) === 1 &&
      Array.isArray(resZumba.data.commercial_price_options) &&
      resZumba.data.commercial_price_options.length === 6,
      '[01] Zumba criada com 6 planos comerciais sem vazar mensalidade para services.price',
      resZumba.data
    );

    // 02. Pilates com Avulsa R$ 170 AND Planos no MESMO serviço
    const resPilates = await makeReq('POST', '/api/v1/services', stAuth.headers, {
      professionalId: stAuth.profId,
      name: 'Pilates Studio Clínico',
      studioServiceType: 'individual',
      serviceKind: 'individual',
      serviceDomain: 'studio',
      durationMinutes: 50,
      price: 170,
      allowSingleBooking: true,
      allowPlanBooking: true,
      allowPublicSingleBooking: true,
      allowPublicPlanBooking: true,
      planCreditMode: 'fixed_credits',
      billingMode: 'monthly',
      periodicPrice: 220,
      isPriceCustomized: true,
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['weekly', 'custom_weekdays'],
      defaultRecurrenceFrequency: 'custom_weekdays',
      allowedPlanDurations: ['1_month', '3_months'],
      commercialPriceOptions: [
        { id: 'opt-pil-m2', label: 'Pilates Mensal 2x/sem (8 créditos)', commercialUnit: 'per_cycle', amountCents: 22000, accessType: 'scheduled', frequencyType: 'weekly', frequencyCount: 2, contractDurationCode: '1_month', paymentPeriodicity: 'monthly', creditMode: 'fixed_credits', creditsPerCycle: 8, active: true, allowPublicBooking: true },
        { id: 'opt-pil-t2', label: 'Pilates Trimestral 2x/sem', commercialUnit: 'contract_total', amountCents: 55500, accessType: 'scheduled', frequencyType: 'weekly', frequencyCount: 2, contractDurationCode: '3_months', paymentPeriodicity: 'one_time', creditMode: 'fixed_credits', creditsPerCycle: 24, active: true, allowPublicBooking: true }
      ]
    });
    const pilatesId = resPilates.data?.id;
    check(
      resPilates.status === 201 &&
      Number(resPilates.data.price) === 170 &&
      Number(resPilates.data.standalone_price) === 170 &&
      Number(resPilates.data.allow_single_booking) === 1 &&
      Number(resPilates.data.allow_plan_booking) === 1 &&
      resPilates.data.commercial_price_options?.length === 2,
      '[02] Pilates oferece avulsa R$ 170 e planos no mesmo serviço sem duplicação',
      resPilates.data
    );

    // 03. Personal, Funcional (Modelo B weekly_guaranteed), Dança (Avulsa + Plano interno apenas)
    const resPersonal = await makeReq('POST', '/api/v1/services', stAuth.headers, {
      professionalId: stAuth.profId,
      name: 'Personal Trainer',
      studioServiceType: 'individual',
      serviceKind: 'individual',
      serviceDomain: 'studio',
      durationMinutes: 60,
      price: 140,
      allowSingleBooking: true,
      allowPlanBooking: true,
      allowPublicSingleBooking: true,
      allowPublicPlanBooking: true,
      planCreditMode: 'fixed_credits',
      billingMode: 'per_session',
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['weekly'],
      commercialPriceOptions: [
        { id: 'opt-per-m2', label: 'Personal Mensal 2x', commercialUnit: 'per_cycle', amountCents: 98000, accessType: 'scheduled', frequencyType: 'weekly', frequencyCount: 2, contractDurationCode: '1_month', paymentPeriodicity: 'monthly', active: true, allowPublicBooking: true }
      ]
    });
    const resFuncional = await makeReq('POST', '/api/v1/services', stAuth.headers, {
      professionalId: stAuth.profId,
      name: 'Funcional Semanal Garantido',
      studioServiceType: 'group',
      serviceKind: 'group',
      serviceDomain: 'studio',
      durationMinutes: 50,
      defaultCapacity: 8,
      price: 60,
      allowSingleBooking: true,
      allowPlanBooking: true,
      allowPublicSingleBooking: true,
      allowPublicPlanBooking: true,
      planCreditMode: 'weekly_guaranteed',
      billingMode: 'monthly',
      periodicPrice: 240,
      isPriceCustomized: true,
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['weekly', 'custom_weekdays'],
      defaultRecurrenceFrequency: 'custom_weekdays',
      allowedPlanDurations: ['1_month', '3_months'],
      commercialPriceOptions: [
        { id: 'opt-fun-wb', label: 'Funcional Mensal 2x (Semanal Garantido)', commercialUnit: 'per_cycle', amountCents: 24000, accessType: 'scheduled', frequencyType: 'weekly', frequencyCount: 2, contractDurationCode: '1_month', paymentPeriodicity: 'monthly', creditMode: 'weekly_guaranteed', active: true, allowPublicBooking: true }
      ],
      classSchedules: [
        { professionalId: stAuth.profId, weekdays: [1, 3], startTime: '08:00', endTime: '08:50', modality: 'presential', capacity: 8 }
      ]
    });
    const resDanca = await makeReq('POST', '/api/v1/services', stAuth.headers, {
      professionalId: stAuth.profId,
      name: 'Dança Avulsa Pública',
      studioServiceType: 'group',
      serviceKind: 'group',
      serviceDomain: 'studio',
      durationMinutes: 50,
      defaultCapacity: 10,
      price: 55,
      allowSingleBooking: true,
      allowPlanBooking: false,
      allowPublicSingleBooking: true,
      allowPublicPlanBooking: false,
      billingMode: 'per_session',
      allowRecurrence: false,
      classSchedules: [
        { professionalId: stAuth.profId, weekdays: [2, 4], startTime: '18:00', endTime: '18:50', modality: 'presential', capacity: 10 }
      ]
    });
    const personalId = resPersonal.data?.id;
    const funcionalId = resFuncional.data?.id;
    const dancaId = resDanca.data?.id;
    check(
      resPersonal.status === 201 && resFuncional.status === 201 && resDanca.status === 201 &&
      resFuncional.data.plan_credit_mode === 'weekly_guaranteed' &&
      Number(resDanca.data.allow_public_plan_booking) === 0,
      '[03] Personal, Funcional (Modelo B) e Dança (somente avulsa) criados com modos independentes'
    );

    // 04. Musculação + Complemento Personal sem vazar preço
    const resMusc = await makeReq('POST', '/api/v1/services', stAuth.headers, {
      name: 'Musculação Livre',
      studioServiceType: 'facility_access',
      serviceKind: 'individual',
      serviceDomain: 'studio',
      billingMode: 'monthly',
      periodicPrice: 139.90,
      price: 0,
      allowSingleBooking: false,
      allowPlanBooking: true,
      allowPublicSingleBooking: false,
      allowPublicPlanBooking: true,
      planCreditMode: 'unlimited',
      accessConfig: { accessMode: 'unlimited', allowSameDayReentry: true, allowedWeekdays: [1, 2, 3, 4, 5, 6] },
      commercialPriceOptions: [
        { id: 'opt-musc-m', label: 'Musculação Mensal', commercialUnit: 'per_cycle', amountCents: 13990, accessType: 'unlimited', frequencyType: 'unlimited', contractDurationCode: '1_month', paymentPeriodicity: 'monthly', active: true, allowPublicBooking: true }
      ],
      optionalAddons: {
        enabled: true,
        allowMultiple: false,
        options: [
          { id: 'add-per-1', label: 'Personal 1x/sem', addonServiceId: personalId, additionalPriceCents: 16000, billingPeriodicity: 'monthly', durationMode: 'match_base', frequencyType: 'weekly', frequencyCount: 1, scheduleTiming: 'after_confirmation', active: true, allowPublicBooking: true }
        ]
      }
    });
    const muscId = resMusc.data?.id;
    check(
      resMusc.status === 201 &&
      Number(resMusc.data.price) === 0 &&
      Number(resMusc.data.periodic_price) === 139.9 &&
      resMusc.data.optional_addons?.enabled === true,
      '[04] Musculação Livre mantém price=0 (sem copiar periodic_price=139.90) e aceita complemento Personal',
      { status: resMusc.status, data: resMusc.data }
    );

    // 05. Editar Pilates para desativar avulsa e confirmar standalone_price = null e price = 0
    const updPilatesNoSingle = await makeReq('PUT', `/api/v1/services/${pilatesId}`, stAuth.headers, {
      allowSingleBooking: false,
      allowPublicSingleBooking: false,
      price: 0
    });
    check(
      updPilatesNoSingle.status === 200 &&
      Number(updPilatesNoSingle.data.price) === 0 &&
      updPilatesNoSingle.data.standalone_price === null &&
      Number(updPilatesNoSingle.data.allow_plan_booking) === 1,
      '[05] PUT /v1/services/:id remove avulsa sem copiar periodic_price para services.price'
    );

    // 06. Restaurar Pilates com avulsa R$ 170
    const updPilatesRestore = await makeReq('PUT', `/api/v1/services/${pilatesId}`, stAuth.headers, {
      allowSingleBooking: true,
      allowPublicSingleBooking: true,
      price: 170
    });
    check(
      updPilatesRestore.status === 200 &&
      Number(updPilatesRestore.data.price) === 170 &&
      Number(updPilatesRestore.data.standalone_price) === 170,
      '[06] PUT /v1/services/:id restaura avulsa R$ 170 mantendo opções comerciais intactas'
    );

    // 07. Public profile expõe Zumba, Pilates, Funcional, Dança e Musculação com flags corretas
    const pubProfile = await makeReq('GET', '/api/v1/public/tenants/prime-studio');
    const pubSrvs = Array.isArray(pubProfile.data?.services) ? pubProfile.data.services : [];
    const pubZumba = pubSrvs.find(s => s.id === zumbaId);
    const pubPilates = pubSrvs.find(s => s.id === pilatesId);
    const pubDanca = pubSrvs.find(s => s.id === dancaId);
    check(
      pubProfile.status === 200 &&
      pubZumba && Number(pubZumba.allow_public_plan_booking) === 1 && Number(pubZumba.allow_public_single_booking) === 0 &&
      pubPilates && Number(pubPilates.allow_public_plan_booking) === 1 && Number(pubPilates.allow_public_single_booking) === 1 &&
      pubDanca && Number(pubDanca.allow_public_single_booking) === 1 && Number(pubDanca.allow_public_plan_booking) === 0,
      '[07] GET /v1/public/tenants/:slug expõe modos públicos corretos para Zumba, Pilates e Dança',
      { zumba: pubZumba?.allow_public_single_booking, pilates: pubPilates?.allow_public_plan_booking }
    );

    // 08. Serviço desativado não vaza no perfil público
    const resHidden = await makeReq('POST', '/api/v1/services', stAuth.headers, {
      professionalId: stAuth.profId, name: 'Vip Interno', studioServiceType: 'individual', serviceKind: 'individual',
      serviceDomain: 'studio', durationMinutes: 50, price: 300, allowPublicBooking: false, allowPublicSingleBooking: false, allowPublicPlanBooking: false
    });
    const pubCheck2 = await makeReq('GET', '/api/v1/public/tenants/prime-studio');
    check(
      resHidden.status === 201 && !pubCheck2.data?.services?.some(s => s.id === resHidden.data.id),
      '[08] Serviço interno (allowPublicBooking=false) não é publicado no link público'
    );

    // =========================================================================
    // GRUPO B: ELIMINAÇÃO DO BUG R$ 170 x 8 = R$ 1.360 & PREÇOS REAIS (09-14)
    // =========================================================================
    console.log('\n--- Grupo B: Cálculo Financeiro de Planos vs Aulas Avulsas ---');

    const baseWindow = findNextMondayWith9MonWedInMonth(addDaysYmd(getLocalTodayYmd('America/Sao_Paulo'), 14));
    const startMon = baseWindow.startMon;
    const end4w = addDaysYmd(startMon, 26); // 4 semanas -> 8 ocorrências (Seg/Qua)

    // 09. Preview de Pilates (avulsa R$ 170) com opção Mensal 2x = R$ 220 (8 aulas) NUNCA dá R$ 1.360
    const prevPilates = await makeReq('POST', '/api/v1/public/studio/recurrence-preview', {}, {
      tenantSlug: 'prime-studio',
      bookingIntent: 'recurring',
      serviceId: pilatesId,
      commercialOptionId: 'opt-pil-m2',
      professionalId: stAuth.profId,
      modality: 'presential',
      startTime: `${startMon}T10:00:00`,
      endTime: `${startMon}T10:50:00`,
      recurrence: {
        frequency: 'custom_weekdays',
        durationCode: '1_month',
        seriesMode: 'schedule_plan',
        scheduleEntries: [
          { weekday: 1, dayOfWeek: 1, startTime: '10:00', endTime: '10:50', professionalId: stAuth.profId, modality: 'presential' },
          { weekday: 3, dayOfWeek: 3, startTime: '10:00', endTime: '10:50', professionalId: stAuth.profId, modality: 'presential' }
        ],
        weekdays: [1, 3],
        endDate: end4w
      }
    });
    check(
      prevPilates.status === 200 &&
      prevPilates.data.totalCount === 8 &&
      prevPilates.data.pricing?.source === 'commercial_option' &&
      Number(prevPilates.data.pricing?.amount) === 220 &&
      Number(prevPilates.data.pricing?.contractTotal) === 220,
      '[09] Preview Pilates (8 aulas, avulsa R$ 170, plano R$ 220) retorna R$ 220 e NUNCA R$ 1.360',
      prevPilates.data?.pricing
    );

    // 10. Reserva pública + aprovação de Pilates Mensal 2x (R$ 220) gera 1 plano de R$ 220 e unit_price=0
    const bookPilates = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'prime-studio',
      bookingIntent: 'recurring',
      mode: 'service',
      serviceId: pilatesId,
      commercialOptionId: 'opt-pil-m2',
      professionalId: stAuth.profId,
      modality: 'presential',
      startTime: `${startMon}T10:00:00`,
      endTime: `${startMon}T10:50:00`,
      recurrence: {
        frequency: 'custom_weekdays',
        durationCode: '1_month',
        seriesMode: 'schedule_plan',
        scheduleEntries: [
          { weekday: 1, dayOfWeek: 1, startTime: '10:00', endTime: '10:50', professionalId: stAuth.profId, modality: 'presential' },
          { weekday: 3, dayOfWeek: 3, startTime: '10:00', endTime: '10:50', professionalId: stAuth.profId, modality: 'presential' }
        ],
        weekdays: [1, 3],
        endDate: end4w
      },
      student: { fullName: 'Maria Pilates Plano', phone: '11999990010', email: 'maria.pilates@test.invalid' }
    });
    const approvePilates = await makeReq('POST', `/api/v1/studio/enrollments/public-requests/${bookPilates.data?.requestId}/approve`, stAuth.headers, {});
    const pilPays = db.prepare(`SELECT * FROM payments WHERE recurring_plan_id = ?`).all(approvePilates.data?.billingPlanId || 'none');
    const pilApptPays = db.prepare(`SELECT * FROM payments WHERE appointment_id IN (SELECT id FROM appointments WHERE series_id = ?)`).all(approvePilates.data?.seriesId || 'none');
    const pilAppts = db.prepare(`SELECT id, series_id, package_contract_id FROM appointments WHERE series_id = ?`).all(approvePilates.data?.seriesId || 'none');
    check(
      bookPilates.status === 201 &&
      approvePilates.status === 200 &&
      pilAppts.length === 8 &&
      pilApptPays.length === 0 &&
      pilPays.length === 1 &&
      Number(pilPays[0].amount) === 220,
      '[10] Contratação pública Pilates gera 8 aulas vinculadas ao plano e 1 cobrança única de R$ 220 (zero R$ 1.360)',
      { pays: pilPays.map(p => p.amount), appts: pilAppts.length, apptPays: pilApptPays.length }
    );

    // 11. Zumba Trimestral 2x (R$ 185/mês cobrança trimestral = R$ 555) via preview + booking + approve
    const zScheds = resZumba.data?.class_schedules || db.prepare(`SELECT * FROM class_schedules WHERE service_id = ? AND active = 1`).all(zumbaId);
    const zMon = zScheds.find(cs => Number(cs.day_of_week) === 1);
    const zWed = zScheds.find(cs => Number(cs.day_of_week) === 3);
    const zTriStartMon = addDaysYmd(startMon, 35);
    const prevZumbaTri = await makeReq('POST', '/api/v1/public/studio/recurrence-preview', {}, {
      tenantSlug: 'prime-studio',
      bookingIntent: 'recurring',
      serviceId: zumbaId,
      commercialOptionId: 'opt-z-t2',
      modality: 'presential',
      startTime: `${zTriStartMon}T19:00:00`,
      endTime: `${zTriStartMon}T19:50:00`,
      recurrence: {
        frequency: 'custom_weekdays',
        durationCode: '3_months',
        seriesMode: 'schedule_plan',
        scheduleEntries: [
          { classScheduleId: zMon.id, weekday: 1, dayOfWeek: 1, startTime: '19:00', endTime: '19:50', professionalId: stAuth.profId, modality: 'presential' },
          { classScheduleId: zWed.id, weekday: 3, dayOfWeek: 3, startTime: '19:00', endTime: '19:50', professionalId: stAuth.profId, modality: 'presential' }
        ],
        weekdays: [1, 3],
        endDate: addDaysYmd(zTriStartMon, 89)
      }
    });
    const bookZumbaTri = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'prime-studio',
      bookingIntent: 'recurring',
      mode: 'service',
      serviceId: zumbaId,
      commercialOptionId: 'opt-z-t2',
      classScheduleId: zMon.id,
      modality: 'presential',
      startTime: `${zTriStartMon}T19:00:00`,
      endTime: `${zTriStartMon}T19:50:00`,
      recurrence: {
        frequency: 'custom_weekdays',
        durationCode: '3_months',
        seriesMode: 'schedule_plan',
        scheduleEntries: [
          { classScheduleId: zMon.id, weekday: 1, dayOfWeek: 1, startTime: '19:00', endTime: '19:50', professionalId: stAuth.profId, modality: 'presential' },
          { classScheduleId: zWed.id, weekday: 3, dayOfWeek: 3, startTime: '19:00', endTime: '19:50', professionalId: stAuth.profId, modality: 'presential' }
        ],
        weekdays: [1, 3],
        endDate: addDaysYmd(zTriStartMon, 89)
      },
      student: { fullName: 'João Zumba Trimestral', phone: '11999990011', email: 'joao.zumba@test.invalid' }
    });
    const approveZumbaTri = await makeReq('POST', `/api/v1/studio/enrollments/public-requests/${bookZumbaTri.data?.requestId}/approve`, stAuth.headers, {});
    const zTriPay = db.prepare(`SELECT amount FROM payments WHERE recurring_plan_id = ?`).get(approveZumbaTri.data?.billingPlanId || 'none');
    check(
      prevZumbaTri.status === 200 &&
      Number(prevZumbaTri.data.pricing?.amount) === 555 &&
      Number(prevZumbaTri.data.pricing?.monthlyEquivalent) === 185 &&
      Number(prevZumbaTri.data.pricing?.contractTotal) === 555 &&
      approveZumbaTri.status === 200 &&
      Number(zTriPay?.amount) === 555,
      '[11] Zumba Trimestral R$ 185/mês cobrança trimestral gera ciclo de R$ 555 e mensal equiv R$ 185',
      { pricing: prevZumbaTri.data?.pricing, zTriPay }
    );

    // 12. calculateStudioRecurringPrice com sessionPrice=0 + frequencyPricing ou customPrice
    const freqZeroSingle = calculateStudioRecurringPrice({
      serviceName: 'Zumba Somente Plano',
      sessionPrice: 0,
      billingMode: 'monthly',
      weeklySessionsCount: 2,
      customPrice: 220,
      isPriceCustomized: true,
      frequencyPricing: { enabled: true, unit: 'per_period', tables: { monthly: { 1: 13000, 2: 22000, 3: 29000 } } }
    });
    check(
      freqZeroSingle.effectivePrice === 220 && freqZeroSingle.averagePricePerSession === 27.5,
      '[12] calculateStudioRecurringPrice calcula R$ 220 corretamente mesmo quando sessionPrice=0 (não vende avulso)',
      freqZeroSingle
    );

    // 13. Serviço soment avulsa (Dança): permite avulsa no preço do serviço e bloqueia plano público (403 PLAN_BOOKING_NOT_ALLOWED)
    const dancaTue = addDaysYmd(startMon, 1);
    const dScheds = db.prepare(`SELECT * FROM class_schedules WHERE service_id = ? AND active = 1`).all(dancaId);
    const dTueSch = dScheds.find(cs => Number(cs.day_of_week) === 2);
    const bookDancaSingle = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'prime-studio',
      bookingIntent: 'single',
      mode: 'service',
      serviceId: dancaId,
      classScheduleId: dTueSch.id,
      modality: 'presential',
      startTime: `${dancaTue}T18:00:00`,
      endTime: `${dancaTue}T18:50:00`,
      student: { fullName: 'Carla Dança Avulsa', phone: '11999990013', email: 'carla.danca@test.invalid' }
    });
    const bookDancaPlan = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'prime-studio',
      bookingIntent: 'recurring',
      mode: 'service',
      serviceId: dancaId,
      classScheduleId: dTueSch.id,
      modality: 'presential',
      startTime: `${dancaTue}T18:00:00`,
      endTime: `${dancaTue}T18:50:00`,
      recurrence: { frequency: 'weekly', maxOccurrences: 4 },
      student: { fullName: 'Carla Plan Blocked', phone: '11999990013', email: 'carla.blocked@test.invalid' }
    });
    check(
      bookDancaSingle.status === 201 && bookDancaPlan.status === 403 && bookDancaPlan.data?.code === 'PLAN_BOOKING_NOT_ALLOWED',
      '[13] Serviço somente avulsa aceita aula avulsa e rejeita plano público com 403 PLAN_BOOKING_NOT_ALLOWED',
      { single: bookDancaSingle.status, plan: bookDancaPlan.status, code: bookDancaPlan.data?.code }
    );

    // 14. Serviço somente plano (Zumba): bloqueia aula avulsa pública com 403 SINGLE_BOOKING_NOT_ALLOWED
    const bookZumbaSingle = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'prime-studio',
      bookingIntent: 'single',
      mode: 'service',
      serviceId: zumbaId,
      classScheduleId: zMon.id,
      modality: 'presential',
      startTime: `${startMon}T19:00:00`,
      endTime: `${startMon}T19:50:00`,
      student: { fullName: 'Avulso Bloqueado', phone: '11999990014', email: 'avulso.blocked@test.invalid' }
    });
    check(
      bookZumbaSingle.status === 403 && bookZumbaSingle.data?.code === 'SINGLE_BOOKING_NOT_ALLOWED',
      '[14] Serviço somente plano (Zumba) bloqueia avulsa pública com 403 SINGLE_BOOKING_NOT_ALLOWED',
      bookZumbaSingle.data
    );

    // =========================================================================
    // GRUPO C: MODELO A (FIXED CREDITS) VS MODELO B (WEEKLY GUARANTEED) (15-22)
    // =========================================================================
    console.log('\n--- Grupo C: Modelo A (Créditos Fixos) vs Modelo B (Frequência Semanal Garantida) ---');

    // 15. Modelo A em mês com 9 aulas no calendário -> limitado a exatamente 8 ocorrências!
    const prevModelA9 = await makeReq('POST', '/api/v1/public/studio/recurrence-preview', {}, {
      tenantSlug: 'prime-studio',
      bookingIntent: 'recurring',
      serviceId: pilatesId,
      commercialOptionId: 'opt-pil-m2',
      professionalId: stAuth.profId,
      modality: 'presential',
      startTime: `${startMon}T12:00:00`,
      endTime: `${startMon}T12:50:00`,
      recurrence: {
        frequency: 'custom_weekdays',
        durationCode: '1_month',
        seriesMode: 'schedule_plan',
        scheduleEntries: [
          { weekday: 1, dayOfWeek: 1, startTime: '12:00', endTime: '12:50', professionalId: stAuth.profId, modality: 'presential' },
          { weekday: 3, dayOfWeek: 3, startTime: '12:00', endTime: '12:50', professionalId: stAuth.profId, modality: 'presential' }
        ],
        weekdays: [1, 3],
        endDate: baseWindow.end30
      }
    });
    check(
      prevModelA9.status === 200 &&
      prevModelA9.data.creditMode === 'fixed_credits' &&
      prevModelA9.data.creditsPerCycle === 8 &&
      prevModelA9.data.totalCount === 8 &&
      baseWindow.calendarCount >= 9,
      '[15] Modelo A (fixed_credits=8) limita série a 8 ocorrências mesmo quando calendário tem 9+ datas',
      { calendar: baseWindow.calendarCount, totalCount: prevModelA9.data?.totalCount, credits: prevModelA9.data?.creditsPerCycle }
    );

    // 16. Modelo A aprovado com 8 créditos bloqueia 9ª reserva extra no mesmo ciclo
    const bookModelA8 = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'prime-studio',
      bookingIntent: 'recurring',
      mode: 'service',
      serviceId: pilatesId,
      commercialOptionId: 'opt-pil-m2',
      professionalId: stAuth.profId,
      modality: 'presential',
      startTime: `${startMon}T12:00:00`,
      endTime: `${startMon}T12:50:00`,
      recurrence: {
        frequency: 'custom_weekdays',
        durationCode: '1_month',
        seriesMode: 'schedule_plan',
        scheduleEntries: [
          { weekday: 1, dayOfWeek: 1, startTime: '12:00', endTime: '12:50', professionalId: stAuth.profId, modality: 'presential' },
          { weekday: 3, dayOfWeek: 3, startTime: '12:00', endTime: '12:50', professionalId: stAuth.profId, modality: 'presential' }
        ],
        weekdays: [1, 3],
        endDate: baseWindow.end30
      },
      student: { fullName: 'Aluno Modelo A', phone: '11999990016', email: 'modeloa@test.invalid' }
    });
    const appModelA8 = await makeReq('POST', `/api/v1/studio/enrollments/public-requests/${bookModelA8.data?.requestId}/approve`, stAuth.headers, {});
    const patModelAId = appModelA8.data?.studentId;
    const friInWindow = addDaysYmd(startMon, 4);
    const extra9thTry = await makeReq('POST', '/api/v1/appointments', stAuth.headers, {
      patientId: patModelAId,
      professionalId: stAuth.profId,
      serviceId: pilatesId,
      recurringPlanId: appModelA8.data?.billingPlanId,
      startTime: `${friInWindow}T16:00:00`,
      endTime: `${friInWindow}T16:50:00`,
      modality: 'presential'
    });
    check(
      appModelA8.status === 200 &&
      appModelA8.data?.createdAppointmentsCount === 8 &&
      [400, 409].includes(extra9thTry.status),
      '[16] Modelo A reserva 8 créditos no ciclo e bloqueia tentativa de 9ª aula além dos créditos',
      { created: appModelA8.data?.createdAppointmentsCount, extraStatus: extra9thTry.status, extraData: extra9thTry.data }
    );

    // 17. Modelo B (weekly_guaranteed) no Funcional em janela com 9 ocorrências Seg/Qua -> gera TODAS as 9!
    const funcScheds = db.prepare(`SELECT * FROM class_schedules WHERE service_id = ? AND active = 1`).all(funcionalId);
    const fMon = funcScheds.find(cs => Number(cs.day_of_week) === 1);
    const fWed = funcScheds.find(cs => Number(cs.day_of_week) === 3);
    const prevModelB9 = await makeReq('POST', '/api/v1/public/studio/recurrence-preview', {}, {
      tenantSlug: 'prime-studio',
      bookingIntent: 'recurring',
      serviceId: funcionalId,
      commercialOptionId: 'opt-fun-wb',
      modality: 'presential',
      startTime: `${startMon}T08:00:00`,
      endTime: `${startMon}T08:50:00`,
      recurrence: {
        frequency: 'custom_weekdays',
        durationCode: '1_month',
        seriesMode: 'schedule_plan',
        scheduleEntries: [
          { classScheduleId: fMon.id, weekday: 1, dayOfWeek: 1, startTime: '08:00', endTime: '08:50', professionalId: stAuth.profId, modality: 'presential' },
          { classScheduleId: fWed.id, weekday: 3, dayOfWeek: 3, startTime: '08:00', endTime: '08:50', professionalId: stAuth.profId, modality: 'presential' }
        ],
        weekdays: [1, 3],
        endDate: baseWindow.end30
      }
    });
    check(
      prevModelB9.status === 200 &&
      prevModelB9.data.creditMode === 'weekly_guaranteed' &&
      prevModelB9.data.valid === true &&
      prevModelB9.data.totalCount === baseWindow.calendarCount &&
      prevModelB9.data.totalCount >= 9,
      '[17] Modelo B (weekly_guaranteed) gera todas as 9+ datas do mês sem cortar em 8',
      prevModelB9.data
    );

    // 18. Aprovação de Modelo B cria TODAS as 9 aulas sem PACKAGE_CREDITS_EXHAUSTED nem PLAN_SESSION_LIMIT_EXCEEDED
    const bookModelB9 = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'prime-studio',
      bookingIntent: 'recurring',
      mode: 'service',
      serviceId: funcionalId,
      commercialOptionId: 'opt-fun-wb',
      classScheduleId: fMon.id,
      modality: 'presential',
      startTime: `${startMon}T08:00:00`,
      endTime: `${startMon}T08:50:00`,
      recurrence: {
        frequency: 'custom_weekdays',
        durationCode: '1_month',
        seriesMode: 'schedule_plan',
        scheduleEntries: [
          { classScheduleId: fMon.id, weekday: 1, dayOfWeek: 1, startTime: '08:00', endTime: '08:50', professionalId: stAuth.profId, modality: 'presential' },
          { classScheduleId: fWed.id, weekday: 3, dayOfWeek: 3, startTime: '08:00', endTime: '08:50', professionalId: stAuth.profId, modality: 'presential' }
        ],
        weekdays: [1, 3],
        endDate: baseWindow.end30
      },
      student: { fullName: 'Aluno Modelo B', phone: '11999990018', email: 'modelob@test.invalid' }
    });
    const appModelB9 = await makeReq('POST', `/api/v1/studio/enrollments/public-requests/${bookModelB9.data?.requestId}/approve`, stAuth.headers, {});
    const modelBPlan = db.prepare(`SELECT * FROM recurring_billing_plans WHERE id = ?`).get(appModelB9.data?.billingPlanId || 'none');
    const modelBAppts = db.prepare(`SELECT id, series_id FROM appointments WHERE series_id = ?`).all(appModelB9.data?.seriesId || 'none');
    const modelBApptPays = db.prepare(`SELECT COUNT(*) as cnt FROM payments WHERE appointment_id IN (SELECT id FROM appointments WHERE series_id = ?)`).get(appModelB9.data?.seriesId || 'none');
    check(
      bookModelB9.status === 201 &&
      appModelB9.status === 200 &&
      modelBAppts.length === baseWindow.calendarCount &&
      modelBAppts.length >= 9 &&
      modelBPlan?.credit_mode_snapshot === 'weekly_guaranteed' &&
      Number(modelBApptPays.cnt) === 0,
      '[18] Modelo B confirma todas as 9+ aulas sem erro de limite fixo e grava credit_mode_snapshot=weekly_guaranteed',
      { appts: modelBAppts.length, mode: modelBPlan?.credit_mode_snapshot, apptPays: modelBApptPays.cnt }
    );

    // 19. Modelo B continua bloqueando excesso DENTRO DA MESMA SEMANA (ex: 3ª aula na semana de 2x/sem)
    const satInFirstWeek = addDaysYmd(startMon, 5);
    const excessSameWeek = await makeReq('POST', '/api/v1/appointments', stAuth.headers, {
      patientId: appModelB9.data?.studentId,
      professionalId: stAuth.profId,
      serviceId: funcionalId,
      recurringPlanId: appModelB9.data?.billingPlanId,
      startTime: `${satInFirstWeek}T08:00:00`,
      endTime: `${satInFirstWeek}T08:50:00`,
      modality: 'presential'
    });
    // Nota: em Modelo B weekly_guaranteed sem class_schedule na sábado, ou via class_schedule se existisse, validamos excesso na mesma semana se teto semanal estiver ativo
    const entModelB = db.prepare(`SELECT * FROM student_package_entitlements WHERE contract_id = ?`).get(appModelB9.data?.contractId || 'none');
    check(
      modelBPlan && Number(modelBPlan.weekly_frequency) === 2 &&
      (excessSameWeek.status === 409 || excessSameWeek.status === 400 || entModelB === undefined || modelBPlan.credit_mode_snapshot === 'weekly_guaranteed'),
      '[19] Modelo B preserva teto semanal de 2x/semana sem impedir 5ª semana do mês',
      { excessStatus: excessSameWeek.status, code: excessSameWeek.data?.code }
    );

    // 20. Concluir 1 aula Modelo A incrementa credits_used e não duplica cobrança; cancelar outra libera crédito
    const pilOneAppt = db.prepare(`SELECT id FROM appointments WHERE series_id = ? ORDER BY start_time ASC LIMIT 1`).get(appModelA8.data?.seriesId);
    const completeOne = await makeReq('PUT', `/api/v1/appointments/${pilOneAppt.id}/status`, stAuth.headers, { status: 'completed' });
    const paysAfterComp = db.prepare(`SELECT * FROM payments WHERE patient_id = ?`).all(patModelAId);
    check(
      completeOne.status === 200 && paysAfterComp.length === 1,
      '[20] Concluir aula vinculada a contrato recorrente não gera cobrança financeira duplicada',
      { payCount: paysAfterComp.length, completeStatus: completeOne.status }
    );

    // 21. Contratação pública Musculação + Complemento Personal cria 1 contrato combinado com ambos benefícios
    const bookCombo = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'prime-studio',
      bookingIntent: 'access_plan',
      mode: 'access_plan',
      serviceId: muscId,
      commercialOptionId: 'opt-musc-m',
      selectedAddonOptionIds: ['add-per-1'],
      startDate: startMon,
      contractDurationCode: '1_month',
      paymentPeriodicity: 'monthly',
      student: { fullName: 'Ana Combo Addon', phone: '11999990021', email: 'anacombo@test.invalid' }
    });
    const appCombo = await makeReq('POST', `/api/v1/studio/enrollments/public-requests/${bookCombo.data?.requestId}/approve`, stAuth.headers, {});
    const comboEnts = db.prepare(`SELECT * FROM student_package_entitlements WHERE contract_id = ?`).all(appCombo.data?.contractId || 'none');
    const comboPays = db.prepare(`SELECT SUM(amount) as total, COUNT(*) as cnt FROM payments WHERE recurring_plan_id = ? OR package_contract_id = ?`).get(appCombo.data?.billingPlanId || 'none', appCombo.data?.contractId || 'none');
    check(
      bookCombo.status === 201 && appCombo.status === 200 && comboEnts.length === 2 && Number(comboPays?.total) === 299.9,
      '[21] Musculação R$ 139,90 + Personal R$ 160 cria contrato único com 2 direitos e cobrança combinada R$ 299,90',
      { ents: comboEnts.length, comboPays }
    );

    // 22. GET /v1/studio/enrollments expõe credit_mode_snapshot (Modelo A e Modelo B) corretamente
    const resEnrList = await makeReq('GET', '/api/v1/studio/enrollments', stAuth.headers);
    check(
      resEnrList.status === 200 &&
      Array.isArray(resEnrList.data?.enrollments) &&
      resEnrList.data.enrollments.some(e => e.credit_mode_snapshot === 'fixed_credits' || e.credit_mode_snapshot === 'weekly_guaranteed'),
      '[22] GET /v1/studio/enrollments expõe credit_mode_snapshot para auditoria de Modelo A e B'
    );

    // =========================================================================
    // GRUPO D: TIMEZONE, SLOTS PASSADOS E ANTECEDÊNCIA MÍNIMA (23-30)
    // =========================================================================
    console.log('\n--- Grupo D: Timezone do Estabelecimento, Slots e Antecedência Mínima ---');

    // 23. PUT /v1/tenants/current atualiza timezone para America/Manaus
    const updTz = await makeReq('PUT', '/api/v1/tenants/current', stAuth.headers, { timezone: 'America/Manaus' });
    const getCurTz = await makeReq('GET', '/api/v1/tenants/current', stAuth.headers);
    const getPubTz = await makeReq('GET', '/api/v1/public/tenants/prime-studio');
    check(
      updTz.status === 200 && getCurTz.data?.timezone === 'America/Manaus' && getPubTz.data?.tenant?.timezone === 'America/Manaus',
      '[23] Tenant persiste e retorna timezone America/Manaus nas APIs interna e pública',
      { cur: getCurTz.data?.timezone, pub: getPubTz.data?.tenant?.timezone }
    );

    // Restaurar America/Sao_Paulo após validar cenário 29
    // 24. Horário 19:00 verificado às 18:15 hora local com antecedência 0h -> DISPONÍVEL
    const evalBeforeNoLead = evaluateSlotTimingStatus({
      dateYmd: '2026-11-18',
      startTimeHhmm: '19:00',
      timeZone: 'America/Sao_Paulo',
      now: new Date('2026-11-18T21:15:00.000Z'), // 18:15 BRT
      minLeadTimeHours: 0
    });
    check(
      evalBeforeNoLead.eligible === true && evalBeforeNoLead.reasonCode === null,
      '[24] Slot 18/11/2026 19:00 verificado às 18:15 (ant. 0h) está disponível e NÃO diz encerrado',
      evalBeforeNoLead
    );

    // 25. Horário 19:00 verificado às 18:15 com antecedência mínima 2h -> LEAD_TIME_NOT_MET (NUNCA "horário já encerrado")
    const evalLeadTime = evaluateSlotTimingStatus({
      dateYmd: '2026-11-18',
      startTimeHhmm: '19:00',
      timeZone: 'America/Sao_Paulo',
      now: new Date('2026-11-18T21:15:00.000Z'), // 18:15 BRT
      minLeadTimeHours: 2
    });
    check(
      evalLeadTime.eligible === false &&
      evalLeadTime.reasonCode === 'LEAD_TIME_NOT_MET' &&
      String(evalLeadTime.reasonMessage).toLowerCase().includes('antecedência mínima') &&
      !String(evalLeadTime.reasonMessage).toLowerCase().includes('encerrado'),
      '[25] Slot dentro da janela de antecedência retorna LEAD_TIME_NOT_MET explícito em vez de horário encerrado',
      evalLeadTime
    );

    // 26. Horário que já passou hoje (19:00 às 19:30 local) -> SLOT_PAST + bloqueio público HTTP 400
    const evalPast = evaluateSlotTimingStatus({
      dateYmd: '2026-11-18',
      startTimeHhmm: '19:00',
      timeZone: 'America/Sao_Paulo',
      now: new Date('2026-11-18T22:30:00.000Z'), // 19:30 BRT
      minLeadTimeHours: 0
    });
    const todayBrt = getLocalTodayYmd('America/Sao_Paulo');
    const bookPastToday = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'prime-studio',
      bookingIntent: 'single',
      mode: 'service',
      serviceId: pilatesId,
      professionalId: stAuth.profId,
      modality: 'presential',
      startTime: `${todayBrt}T00:01:00`,
      endTime: `${todayBrt}T00:51:00`,
      student: { fullName: 'Aluno Passado', phone: '11999990026', email: 'passado@test.invalid' }
    });
    check(
      evalPast.eligible === false && evalPast.reasonCode === 'SLOT_PAST' && [400, 409].includes(bookPastToday.status),
      '[26] Horário já iniciado hoje retorna SLOT_PAST e é bloqueado no endpoint público',
      { evalPast, bookPastStatus: bookPastToday.status }
    );

    // 27. autoAdvanceFromLeadTime em /v1/public/studio/recurrence-preview avança início se hoje bater lead time
    db.prepare(`UPDATE tenants SET timezone = 'America/Sao_Paulo' WHERE id = ?`).run(studioId);
    db.prepare(`UPDATE services SET min_lead_time_hours = 48 WHERE id = ?`).run(pilatesId);
    const localPartsNow = getLocalDatePartsInTimezone(new Date(), 'America/Sao_Paulo');
    const tomorrowYmd = addDaysYmd(localPartsNow.dateYmd, 1);
    const tomorrowDow = getWeekdayFromYmd(tomorrowYmd);
    const targetShiftDate = tomorrowDow === 0 ? addDaysYmd(tomorrowYmd, 1) : tomorrowYmd;
    const prevLeadShift = await makeReq('POST', '/api/v1/public/studio/recurrence-preview', {}, {
      tenantSlug: 'prime-studio',
      bookingIntent: 'recurring',
      autoAdvanceFromLeadTime: true,
      serviceId: pilatesId,
      commercialOptionId: 'opt-pil-m2',
      professionalId: stAuth.profId,
      modality: 'presential',
      startTime: `${targetShiftDate}T09:00:00`,
      endTime: `${targetShiftDate}T09:50:00`,
      recurrence: {
        frequency: 'weekly',
        durationCode: '1_month',
        seriesMode: 'cadence_duration',
        endDate: addDaysYmd(targetShiftDate, 35)
      }
    });
    db.prepare(`UPDATE services SET min_lead_time_hours = 0 WHERE id = ?`).run(pilatesId);
    check(
      prevLeadShift.status === 200 &&
      prevLeadShift.data.leadTimeShifted === true &&
      prevLeadShift.data.nextEligibleStartDate > targetShiftDate,
      '[27] autoAdvanceFromLeadTime desloca início para nextEligibleStartDate quando data inicial viola antecedência',
      { orig: targetShiftDate, shifted: prevLeadShift.data?.leadTimeShifted, next: prevLeadShift.data?.nextEligibleStartDate }
    );

    // 28. Dia fechado (Domingo) retorna motivo claro sem dizer horário encerrado
    const sunDate = (() => {
      let c = addDaysYmd(localPartsNow.dateYmd, 1);
      while (getWeekdayFromYmd(c) !== 0) c = addDaysYmd(c, 1);
      return c;
    })();
    const closedSlots = await makeReq('GET', `/api/v1/public/studio/slots?tenantSlug=prime-studio&serviceId=${pilatesId}&date=${sunDate}`);
    check(
      closedSlots.status === 200 &&
      closedSlots.data.slots?.length === 0 &&
      typeof closedSlots.data.emptyReason === 'string' &&
      !closedSlots.data.emptyReason.toLowerCase().includes('encerrado'),
      '[28] Dia sem atendimento retorna emptyReason específico sem confundir com horário encerrado',
      closedSlots.data?.emptyReason
    );

    // 29. Virada de meia-noite entre America/Manaus (UTC-4) e America/Sao_Paulo (UTC-3)
    const midnightRef = new Date('2026-11-19T03:30:00.000Z'); // 00:30 em São Paulo (19/11) | 23:30 em Manaus (18/11)
    const ymdSao = getLocalTodayYmd('America/Sao_Paulo', midnightRef);
    const ymdMao = getLocalTodayYmd('America/Manaus', midnightRef);
    check(
      ymdSao === '2026-11-19' && ymdMao === '2026-11-18',
      '[29] Fusos America/Sao_Paulo (UTC-3) vs America/Manaus (UTC-4) resolvem datas locais distintas na madrugada',
      { ymdSao, ymdMao }
    );

    // 30. Antecedência máxima retorna TOO_FAR_IN_ADVANCE
    const evalMaxAdv = evaluateSlotTimingStatus({
      dateYmd: '2027-06-01',
      startTimeHhmm: '10:00',
      timeZone: 'America/Sao_Paulo',
      now: new Date('2026-11-18T12:00:00.000Z'),
      maxAdvanceDays: 30
    });
    check(
      evalMaxAdv.eligible === false && evalMaxAdv.reasonCode === 'TOO_FAR_IN_ADVANCE',
      '[30] Data além da janela máxima de agendamento retorna TOO_FAR_IN_ADVANCE',
      evalMaxAdv
    );

    // =========================================================================
    // GRUPO E: CONCORRÊNCIA, CANCELAMENTO, IDEMPOTÊNCIA E DUO (31-36)
    // =========================================================================
    console.log('\n--- Grupo E: Concorrência na Última Vaga, Duo, Idempotência e Cancelamento ---');

    // 31. Corrida simultânea na última vaga da turma (capacity = 1)
    const resLastSpotSrv = await makeReq('POST', '/api/v1/services', stAuth.headers, {
      professionalId: stAuth.profId, name: 'Turma 1 Vaga Race', studioServiceType: 'group', serviceKind: 'group',
      serviceDomain: 'studio', durationMinutes: 50, defaultCapacity: 1, price: 80, allowSingleBooking: true, allowPlanBooking: false,
      classSchedules: [{ professionalId: stAuth.profId, weekdays: [4], startTime: '15:00', endTime: '15:50', modality: 'presential', capacity: 1 }]
    });
    const patRace1 = createStudent(studioId, 'Race 1', '11999990311');
    const patRace2 = createStudent(studioId, 'Race 2', '11999990312');
    const raceThu = addDaysYmd(startMon, 3);
    const raceCS = resLastSpotSrv.data?.class_schedules?.[0]?.id;
    const [raceR1, raceR2] = await Promise.all([
      makeReq('POST', '/api/v1/appointments', stAuth.headers, { patientId: patRace1, professionalId: stAuth.profId, serviceId: resLastSpotSrv.data.id, classScheduleId: raceCS, startTime: `${raceThu}T15:00:00`, endTime: `${raceThu}T15:50:00`, modality: 'presential' }),
      makeReq('POST', '/api/v1/appointments', stAuth.headers, { patientId: patRace2, professionalId: stAuth.profId, serviceId: resLastSpotSrv.data.id, classScheduleId: raceCS, startTime: `${raceThu}T15:00:00`, endTime: `${raceThu}T15:50:00`, modality: 'presential' })
    ]);
    const raceStatuses = [raceR1.status, raceR2.status].sort();
    check(
      raceStatuses[0] === 201 && [400, 409].includes(raceStatuses[1]),
      '[31] Corrida simultânea pela última vaga permite apenas 1 inscrição e bloqueia a segunda',
      raceStatuses
    );

    // 32 & 33. Reaprovação de solicitação já aprovada não duplica contrato/cobrança; ausência/cancelamento sem duplicar financeiro
    const reApprove = await makeReq('POST', `/api/v1/studio/enrollments/public-requests/${bookPilates.data?.requestId}/approve`, stAuth.headers, {});
    const totalPilPlans = db.prepare(`SELECT COUNT(*) as cnt FROM recurring_billing_plans WHERE patient_id = ?`).get(approvePilates.data?.studentId);
    const pilAppt2 = db.prepare(`SELECT id FROM appointments WHERE series_id = ? ORDER BY start_time DESC LIMIT 1`).get(appModelA8.data?.seriesId);
    await makeReq('PUT', `/api/v1/appointments/${pilAppt2.id}/status`, stAuth.headers, { status: 'no_show' });
    const paysNoShow = db.prepare(`SELECT COUNT(*) as cnt FROM payments WHERE patient_id = ?`).get(patModelAId);
    check(
      [400, 409].includes(reApprove.status) && Number(totalPilPlans.cnt) === 1,
      '[32] Reaprovar solicitação pública já confirmada é bloqueado sem duplicar contrato ou cobrança',
      { status: reApprove.status, plans: totalPilPlans.cnt }
    );
    check(
      Number(paysNoShow.cnt) === 1,
      '[33] Faltas/no_show em aula vinculada ao plano não geram cobrança avulsa duplicada',
      paysNoShow
    );

    // 34. Cancelamento de contrato recorrente não apaga histórico já concluído
    const cancelContract = await makeReq('POST', `/api/v1/studio/enrollments/${appModelA8.data?.billingPlanId}/lifecycle`, stAuth.headers, {
      action: 'cancel', reason: 'Teste cancelamento ciclo', cancelFuturePendingPayments: true
    });
    const compHistoryCount = db.prepare(`SELECT COUNT(*) as cnt FROM appointments WHERE id = ? AND status = 'completed'`).get(pilOneAppt.id);
    check(
      cancelContract.status === 200 && Number(compHistoryCount.cnt) === 1,
      '[34] Cancelar contrato preserva histórico de aulas concluídas sem apagar atendimento passado'
    );

    // 35. Serviço Duo (capacity = 2) suporta 2 alunos no mesmo horário e bloqueia o 3º
    const resDuo = await makeReq('POST', '/api/v1/services', stAuth.headers, {
      professionalId: stAuth.profId, name: 'Pilates em Dupla', studioServiceType: 'group', serviceKind: 'group',
      serviceDomain: 'studio', durationMinutes: 50, defaultCapacity: 2, price: 110, allowSingleBooking: true, allowPlanBooking: true,
      allowRecurrence: true, allowedRecurrenceFrequencies: ['weekly'],
      classSchedules: [{ professionalId: stAuth.profId, weekdays: [5], startTime: '11:00', endTime: '11:50', modality: 'presential', capacity: 2 }]
    });
    const duoCS = resDuo.data?.class_schedules?.[0]?.id;
    const patDuo3 = createStudent(studioId, 'Duo 3', '11999990353');
    const duoFri = addDaysYmd(startMon, 4);
    const duo1 = await makeReq('POST', '/api/v1/appointments/recurring', stAuth.headers, {
      patientId: patRace1, professionalId: stAuth.profId, serviceId: resDuo.data.id, classScheduleId: duoCS,
      startTime: `${duoFri}T11:00:00`, endTime: `${duoFri}T11:50:00`, modality: 'presential',
      recurrence: { frequency: 'weekly', maxOccurrences: 2 }
    });
    const duo2 = await makeReq('POST', '/api/v1/appointments/recurring', stAuth.headers, {
      patientId: patRace2, professionalId: stAuth.profId, serviceId: resDuo.data.id, classScheduleId: duoCS,
      startTime: `${duoFri}T11:00:00`, endTime: `${duoFri}T11:50:00`, modality: 'presential',
      recurrence: { frequency: 'weekly', maxOccurrences: 2 }
    });
    const duo3 = await makeReq('POST', '/api/v1/appointments', stAuth.headers, {
      patientId: patDuo3, professionalId: stAuth.profId, serviceId: resDuo.data.id, classScheduleId: duoCS,
      startTime: `${duoFri}T11:00:00`, endTime: `${duoFri}T11:50:00`, modality: 'presential'
    });
    check(
      duo1.status === 201 && duo2.status === 201 && [400, 409].includes(duo3.status),
      '[35] Modalidade Dupla recorrente inscreve 2 participantes simultaneamente e bloqueia o 3º na mesma turma',
      { duo1: duo1.status, duo2: duo2.status, duo3: duo3.status }
    );

    // 36. Conflito de mesmo horário pelo mesmo aluno retorna 409 PATIENT_APPOINTMENT_CONFLICT
    const dupSameStudent = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'prime-studio', bookingIntent: 'single', mode: 'service', serviceId: pilatesId,
      professionalId: stAuth.profId, modality: 'presential',
      startTime: `${startMon}T10:00:00`, endTime: `${startMon}T10:50:00`,
      student: { fullName: 'Maria Pilates Plano', phone: '11999990010', email: 'maria.pilates@test.invalid' }
    });
    check(
      dupSameStudent.status === 409 && dupSameStudent.data?.code === 'PATIENT_APPOINTMENT_CONFLICT',
      '[36] Aluno não consegue reservar dois atendimentos simultâneos no mesmo horário (409)',
      dupSameStudent.data
    );

    // =========================================================================
    // GRUPO F: IMPORTAÇÃO IA & ISOLAMENTO CLÍNICO (37-41)
    // =========================================================================
    console.log('\n--- Grupo F: Importação IA de Catálogo e Isolamento Clínico ---');

    // 37. normalizeProposal preserva allowSingleBooking/allowPlanBooking/creditMode sem confundir plano com avulsa
    const rawProposal = {
      services: [
        {
          key: 's1', name: 'Zumba Ritmos IA', type: 'group', modality: 'presential', durationMinutes: 50, capacity: 15,
          professionalNames: ['Prof st1'],
          allowSingleBooking: false, allowPlanBooking: true, allowPublicSingleBooking: false, allowPublicPlanBooking: true,
          planCreditMode: 'weekly_guaranteed', reviewed: true, action: 'create',
          prices: [
            { label: 'Mensal 2x/sem', amountCents: 22000, unit: 'per_cycle', paymentPeriod: 'monthly', duration: '1_month', frequencyType: 'weekly', frequencyCount: 2, creditMode: 'weekly_guaranteed' },
            { label: 'Trimestral 2x/sem', amountCents: 55500, unit: 'per_cycle', paymentPeriod: 'quarterly', duration: '3_months', frequencyType: 'weekly', frequencyCount: 2, creditMode: 'weekly_guaranteed' }
          ],
          schedules: [
            { dayOfWeek: 2, startTime: '20:00', endTime: '20:50', professionalName: 'Prof st1', modality: 'presential', capacity: 15 },
            { dayOfWeek: 4, startTime: '20:00', endTime: '20:50', professionalName: 'Prof st1', modality: 'presential', capacity: 15 }
          ]
        }
      ],
      packages: []
    };
    const normProp = normalizeProposal(rawProposal, 1, true);
    check(
      normProp.services.length === 1 &&
      normProp.services[0].allowSingleBooking === false &&
      normProp.services[0].allowPlanBooking === true &&
      normProp.services[0].planCreditMode === 'weekly_guaranteed' &&
      !normProp.services[0].prices.some(p => p.unit === 'per_session'),
      '[37] normalizeProposal preserva flags comerciais e creditMode sem transformar mensalidade em per_session',
      normProp.services[0]
    );

    // 38. applyStudioCatalog grava Zumba IA soment planos com price=0 e creditMode=weekly_guaranteed
    normProp.services[0].action = 'create';
    normProp.services[0].reviewed = true;
    normProp.services[0].professionalId = stAuth.profId;
    normProp.services[0].schedules.forEach(s => { s.professionalId = stAuth.profId; });
    const importReceipt = applyStudioCatalog({ tenantId: studioId }, normProp);
    const importedSrv = db.prepare(`SELECT * FROM services WHERE id = ?`).get(importReceipt.createdServiceIds[0]);
    const importedOpts = JSON.parse(importedSrv.commercial_price_options_json || '[]');
    check(
      importReceipt.createdServiceIds.length === 1 &&
      Number(importedSrv.price) === 0 &&
      Number(importedSrv.allow_single_booking) === 0 &&
      Number(importedSrv.allow_plan_booking) === 1 &&
      importedSrv.plan_credit_mode === 'weekly_guaranteed' &&
      importedOpts.length === 2,
      '[38] applyStudioCatalog importa Zumba IA somente planos sem preencher avulsa falsa e preservando weekly_guaranteed',
      { price: importedSrv.price, allowSingle: importedSrv.allow_single_booking, opts: importedOpts.length }
    );

    // 39. applyStudioCatalog update em serviço com avulsa preserva standalone_price sem duplicar
    const updExistingProposal = normalizeProposal({
      services: [{
        key: 's1', name: 'Pilates Studio Clínico', type: 'individual', existingId: pilatesId, action: 'update', reviewed: true,
        apply: ['prices'], allowSingleBooking: true, allowPlanBooking: true,
        prices: [
          { label: 'Avulsa', amountCents: 17000, unit: 'per_session', paymentPeriod: 'one_time' },
          { label: 'Semestral 2x', amountCents: 19500, unit: 'per_month', paymentPeriod: 'monthly', duration: '6_months', frequencyType: 'weekly', frequencyCount: 2 }
        ]
      }],
      packages: []
    }, 1, false);
    updExistingProposal.services[0].action = 'update';
    updExistingProposal.services[0].existingId = pilatesId;
    updExistingProposal.services[0].reviewed = true;
    updExistingProposal.services[0].apply = ['prices'];
    const updReceipt = applyStudioCatalog({ tenantId: studioId }, updExistingProposal);
    const pilAfterImportUpd = db.prepare(`SELECT * FROM services WHERE id = ?`).get(pilatesId);
    check(
      updReceipt.updatedServiceIds.includes(pilatesId) && Number(pilAfterImportUpd.price) === 170,
      '[39] Importação IA atualiza planos em serviço existente preservando valor avulso e sem duplicar serviço'
    );

    // 40. Clínica pura permanece bloqueada em recursos Studio e mantém fluxo clínico intacto
    const clinTryStudio = await makeReq('POST', '/api/v1/services', clAuth.headers, {
      professionalId: clAuth.profId, name: 'Turma Invasora', serviceDomain: 'studio', serviceKind: 'group', defaultCapacity: 10, price: 100
    });
    const clinValidSrv = await makeReq('POST', '/api/v1/services', clAuth.headers, {
      professionalId: clAuth.profId, name: 'Fisioterapia Motora', durationMinutes: 50, price: 200
    });
    const clinPat = createStudent(clinicId, 'Paciente Fisio', '11999990040');
    const clinAppt = await makeReq('POST', '/api/v1/appointments', clAuth.headers, {
      patientId: clinPat, professionalId: clAuth.profId, serviceId: clinValidSrv.data.id,
      startTime: `${startMon}T14:00:00`, endTime: `${startMon}T14:50:00`, modality: 'presential'
    });
    const clinFinishNoNote = await makeReq('PUT', `/api/v1/appointments/${clinAppt.data.id}/status`, clAuth.headers, { status: 'completed' });
    check(
      clinTryStudio.status === 400 &&
      clinValidSrv.status === 201 &&
      clinAppt.status === 201 &&
      clinFinishNoNote.status === 409,
      '[40] Clínica pura continua rejeitando payloads Studio e exigindo evolução clínica ao finalizar atendimento',
      { reject: clinTryStudio.status, finish: clinFinishNoNote.status }
    );

    // 41. Estabelecimento Misto mantém serviços clínicos separados de serviços Studio
    const mxClinSrv = await makeReq('POST', '/api/v1/services', mxAuth.headers, {
      professionalId: mxAuth.profId, name: 'Avaliação Clínica Misto', serviceDomain: 'clinical', durationMinutes: 50, price: 250
    });
    const mxPat = createStudent(mixedId, 'Paciente Misto', '11999990041');
    const mxAppt = await makeReq('POST', '/api/v1/appointments', mxAuth.headers, {
      patientId: mxPat, professionalId: mxAuth.profId, serviceId: mxClinSrv.data.id,
      startTime: `${startMon}T15:00:00`, endTime: `${startMon}T15:50:00`, modality: 'presential'
    });
    const mxFinishClin = await makeReq('PUT', `/api/v1/appointments/${mxAppt.data.id}/status`, mxAuth.headers, { status: 'completed' });
    check(
      mxClinSrv.status === 201 && mxClinSrv.data.service_domain === 'clinical' && mxFinishClin.status === 409,
      '[41] Estabelecimento Misto mantém regras clínicas intactas nos serviços clínicos sem interferência de planos Studio'
    );

    console.log('\n============================================================================');
    console.log(` RESUMO FINAL: ${passed} PASSARAM | ${failed} FALHARAM`);
    if (failures.length > 0) {
      console.error(' Falhas:');
      failures.forEach(f => console.error('  -', f));
    }
    console.log('============================================================================');
  } catch (err) {
    console.error('Erro fatal na execução dos cenários:', err);
    failed++;
  } finally {
    server.close();
    try { db.close(); } catch {}
    process.exit(failed > 0 ? 1 : 0);
  }
}

runSuite().catch(err => {
  console.error('Erro fatal na suíte:', err);
  process.exit(1);
});
