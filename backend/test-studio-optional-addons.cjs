const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-studio-addons-')), 'test.db');
process.env.JWT_SECRET = 'zemda-studio-addons-secret-2026-xyz';
process.env.NODE_ENV = 'test';

const { initializeDatabase, db } = require('./dist/config/database');
const { normalizeProposal } = require('./dist/services/studio-catalog-proposal');
const { generateToken } = require('./dist/utils/jwt');
const { calculatePlanWithAddonsBreakdown } = require('./dist/utils/studio-access-and-commercial');

initializeDatabase();

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use('/api', require('./dist/routes').default);

async function req(server, method, urlPath, headers, body) {
  const addr = server.address();
  const res = await fetch(`http://127.0.0.1:${addr.port}/api${urlPath}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let data = null;
  try {
    data = await res.json();
  } catch (_) {}
  return { status: res.status, data };
}

function nextWeekdayYmd(targetDow, weeksAhead = 1) {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + weeksAhead * 7, 12, 0, 0));
  const diff = (targetDow - base.getUTCDay() + 7) % 7;
  base.setUTCDate(base.getUTCDate() + diff);
  return base.toISOString().slice(0, 10);
}

function seedTenant(id, profile, slug) {
  const adminId = 'usr-adm-' + id;
  const profUserId = 'usr-prf-' + id;
  db.prepare(`
    INSERT INTO tenants (
      id, slug, public_booking_slug, public_booking_sequence, public_booking_enabled,
      name, email, status, onboarding_completed, onboarding_status, manager_confirmed,
      billing_required, establishment_profile
    ) VALUES (?, ?, ?, 1, 1, ?, ?, 'active', 1, 'active', 1, 0, ?)
  `).run(id, slug, slug, `Estabelecimento ${id}`, `${id}@test.invalid`, profile);

  db.prepare(`
    INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, onboarding_status, email_verified)
    VALUES (?, ?, ?, ?, 'x', 'clinic_admin', 'active', 'active', 1)
  `).run(adminId, id, `Admin ${id}`, `${adminId}@test.invalid`);

  db.prepare(`
    INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, onboarding_status, email_verified)
    VALUES (?, ?, ?, ?, 'x', 'professional', 'active', 'active', 1)
  `).run(profUserId, id, `Instrutor ${id}`, `${profUserId}@test.invalid`);

  db.prepare(`
    INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json)
    VALUES (?, ?, ?, 'clinic_admin', 'active', 1, NULL)
  `).run('mem-adm-' + id, id, adminId);

  db.prepare(`
    INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json)
    VALUES (?, ?, ?, 'professional', 'active', 0, NULL)
  `).run('mem-prf-' + id, id, profUserId);

  const profId = 'prof-' + id;
  db.prepare(`
    INSERT INTO professionals (id, tenant_id, user_id, name, slug, profession_id, profession_name, active, public_booking_enabled)
    VALUES (?, ?, ?, 'Prof Carlos Personal', ?, 'prof-personal-trainer', 'Educador Físico', 1, 1)
  `).run(profId, id, profUserId, 'carlos-' + id);

  for (const dow of [1, 2, 3, 4, 5]) {
    db.prepare(`
      INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active)
      VALUES (?, ?, ?, ?, '07:00', '21:00', 1)
    `).run(`sh-${id}-${dow}`, id, profId, dow);
  }

  const pat1 = 'pat-' + id + '-1';
  const pat2 = 'pat-' + id + '-2';
  const pat3 = 'pat-' + id + '-3';
  const insPat = db.prepare(`INSERT INTO patients (id, tenant_id, full_name, phone) VALUES (?, ?, ?, ?)`);
  insPat.run(pat1, id, 'Aluno Alfa', '11991112201');
  insPat.run(pat2, id, 'Aluno Beta', '11991112202');
  insPat.run(pat3, id, 'Aluno Gama', '11991112203');

  return {
    adminId,
    profUserId,
    profId,
    pat1,
    pat2,
    pat3,
    adminToken: generateToken({ userId: adminId, tenantId: id, role: 'clinic_admin', email: `${adminId}@test.invalid` }),
    profToken: generateToken({ userId: profUserId, tenantId: id, role: 'professional', email: `${profUserId}@test.invalid` })
  };
}

async function run() {
  const studioA = seedTenant('ten-studio-a', 'studio', 'academia-addons-a');
  const studioB = seedTenant('ten-studio-b', 'studio', 'academia-addons-b');
  const clinicC = seedTenant('ten-clinic-c', 'clinic', 'clinica-trad-c');

  const server = app.listen(0);
  const authA = { Authorization: `Bearer ${studioA.adminToken}`, 'x-tenant-id': 'ten-studio-a' };
  const authProfA = { Authorization: `Bearer ${studioA.profToken}`, 'x-tenant-id': 'ten-studio-a' };
  const authB = { Authorization: `Bearer ${studioB.adminToken}`, 'x-tenant-id': 'ten-studio-b' };
  const authC = { Authorization: `Bearer ${clinicC.adminToken}`, 'x-tenant-id': 'ten-clinic-c' };

  try {
    console.log('1. Testando criação dos serviços complementares existentes e bloqueio clínico/cross-tenant...');
    const resPersonal = await req(server, 'POST', '/v1/services', authA, {
      name: 'Acompanhamento Personal',
      studioServiceType: 'individual',
      serviceKind: 'individual',
      durationMinutes: 60,
      bufferMinutes: 0,
      price: 180,
      modality: 'presential',
      professionalId: studioA.profId,
      allowPublicBooking: true
    });
    assert.equal(resPersonal.status, 201);
    const personalId = resPersonal.data.id;

    const resEval = await req(server, 'POST', '/v1/services', authA, {
      name: 'Avaliação Física Completa',
      studioServiceType: 'non_scheduled',
      serviceKind: 'individual',
      durationMinutes: 0,
      price: 80,
      modality: 'presential',
      billingMode: 'monthly',
      periodicPrice: 80,
      allowPublicBooking: true
    });
    assert.equal(resEval.status, 201);
    const evalId = resEval.data.id;

    const resGroup = await req(server, 'POST', '/v1/services', authA, {
      name: 'Funcional em Turma',
      studioServiceType: 'group',
      serviceKind: 'group',
      defaultCapacity: 2,
      durationMinutes: 50,
      price: 0,
      modality: 'presential',
      professionalId: studioA.profId,
      billingMode: 'monthly',
      periodicPrice: 150,
      classSchedules: [
        { dayOfWeek: 3, startTime: '10:00', endTime: '10:50', professionalId: studioA.profId, capacity: 2 }
      ],
      allowPublicBooking: true
    });
    assert.equal(resGroup.status, 201);
    const groupId = resGroup.data.id;

    // Clínica tradicional não aceita optionalAddons
    const clinDeny = await req(server, 'POST', '/v1/services', authC, {
      name: 'Consulta Clínica',
      durationMinutes: 50,
      price: 200,
      optionalAddons: {
        enabled: true,
        options: [{ id: 'x', addonServiceId: personalId, label: 'Teste', additionalPriceCents: 1000 }]
      }
    });
    assert.equal(clinDeny.status, 400);

    // Cross-tenant não pode vincular serviço do Tenant A em Tenant B
    const crossDeny = await req(server, 'POST', '/v1/services', authB, {
      name: 'Plano B',
      studioServiceType: 'facility_access',
      serviceDomain: 'studio',
      billingMode: 'monthly',
      periodicPrice: 120,
      optionalAddons: {
        enabled: true,
        options: [{ id: 'x1', addonServiceId: personalId, label: 'Cross', additionalPriceCents: 10000 }]
      }
    });
    assert.equal(crossDeny.status, 400);

    console.log('2. Configurando Musculação com opções comerciais e complementos opcionais genéricos...');
    const resMusc = await req(server, 'POST', '/v1/services', authA, {
      name: 'Musculação',
      studioServiceType: 'facility_access',
      serviceKind: 'individual',
      durationMinutes: 0,
      price: 0,
      billingMode: 'monthly',
      periodicPrice: 120,
      accessConfig: { accessMode: 'unlimited', allowSameDayReentry: true, allowedWeekdays: [1, 2, 3, 4, 5, 6] },
      commercialPriceOptions: [
        {
          id: 'musc-mensal',
          label: 'Mensal Livre',
          accessType: 'unlimited',
          frequencyType: 'unlimited',
          frequencyCount: null,
          contractDurationCode: '1_month',
          paymentPeriodicity: 'monthly',
          commercialUnit: 'per_month',
          amountCents: 12000,
          autoRenew: true,
          active: true
        },
        {
          id: 'musc-trim',
          label: 'Trimestral Livre',
          accessType: 'unlimited',
          frequencyType: 'unlimited',
          frequencyCount: null,
          contractDurationCode: '3_months',
          paymentPeriodicity: 'quarterly',
          commercialUnit: 'contract_total',
          amountCents: 30000,
          autoRenew: false,
          active: true
        }
      ],
      optionalAddons: {
        enabled: true,
        allowMultiple: true,
        promptTitle: 'Deseja adicionar acompanhamento personalizado?',
        noAddonLabel: 'Não adicionar',
        options: [
          {
            id: 'pers-1x',
            addonServiceId: personalId,
            label: 'Personal 1 vez por semana',
            acceptedBaseOptionIds: [],
            frequencyType: 'weekly',
            frequencyCount: 1,
            creditsPerCycle: 4,
            additionalPriceCents: 20000,
            comboDiscountType: 'fixed_cents',
            comboDiscountValue: 2000,
            billingPeriodicity: 'monthly',
            durationMode: 'match_base',
            autoRenew: null,
            scheduleTiming: 'after_confirmation',
            active: true
          },
          {
            id: 'eval-once',
            addonServiceId: evalId,
            label: 'Avaliação Física Inicial',
            acceptedBaseOptionIds: ['musc-mensal'],
            frequencyType: 'fixed_count',
            frequencyCount: 1,
            creditsPerCycle: 1,
            additionalPriceCents: 8000,
            comboDiscountType: 'none',
            comboDiscountValue: 0,
            billingPeriodicity: 'one_time',
            durationMode: '1_month',
            scheduleTiming: 'not_applicable',
            active: true
          },
          {
            id: 'func-during',
            addonServiceId: groupId,
            label: 'Funcional em Turma 1x/sem (escolha agora)',
            acceptedBaseOptionIds: [],
            frequencyType: 'weekly',
            frequencyCount: 1,
            creditsPerCycle: 4,
            additionalPriceCents: 15000,
            comboDiscountType: 'percentage',
            comboDiscountValue: 10,
            billingPeriodicity: 'monthly',
            durationMode: 'match_base',
            scheduleTiming: 'during_purchase',
            active: true
          }
        ]
      }
    });
    assert.equal(resMusc.status, 201);
    const muscId = resMusc.data.id;

    // Auto-vinculação deve falhar
    const selfErr = await req(server, 'PUT', `/v1/services/${muscId}`, authA, {
      optionalAddons: {
        enabled: true,
        options: [{ id: 'self', addonServiceId: muscId, label: 'Self', additionalPriceCents: 1000 }]
      }
    });
    assert.equal(selfErr.status, 400);

    // Nenhuma duplicação de serviço ocorreu
    const listSrvRes = await req(server, 'GET', '/v1/services', authA);
    assert.equal(listSrvRes.status, 200);
    assert.equal(listSrvRes.data.length, 4, 'Não deve criar serviços duplicados para representar complementos');

    console.log('3. Validando normalização de periodicidades mistas (Trimestral + Mensal / Mensal + Pagamento Único)...');
    const muscRow = listSrvRes.data.find(s => s.id === muscId);
    const mensOpt = muscRow.commercial_price_options.find(o => o.id === 'musc-mensal');
    const trimOpt = muscRow.commercial_price_options.find(o => o.id === 'musc-trim');
    const persAddon = muscRow.optional_addons.options.find(o => o.id === 'pers-1x');
    const evalAddon = muscRow.optional_addons.options.find(o => o.id === 'eval-once');

    const bdMensalPers = calculatePlanWithAddonsBreakdown({ baseOption: mensOpt, selectedAddons: [persAddon] });
    assert.equal(bdMensalPers.consolidatedMonthlyCents, 30000); // 120 + (200 - 20)
    assert.equal(bdMensalPers.hasMixedPeriodicities, false);
    assert.equal(bdMensalPers.totalContractAmountCents, 30000);

    const bdTrimMensal = calculatePlanWithAddonsBreakdown({ baseOption: trimOpt, selectedAddons: [persAddon] });
    assert.equal(bdTrimMensal.consolidatedMonthlyCents, null, 'Nunca somar Trimestral + Mensal como mensalidade única');
    assert.equal(bdTrimMensal.hasMixedPeriodicities, true);
    assert.equal(bdTrimMensal.recurringSchedules.length, 2);
    assert.equal(bdTrimMensal.firstChargeDueCents, 48000); // 300 1º trimestre + 180 1º mês
    assert.equal(bdTrimMensal.totalContractAmountCents, 84000); // 300 + (3 * 180)

    const bdMensalOneTime = calculatePlanWithAddonsBreakdown({ baseOption: mensOpt, selectedAddons: [persAddon, evalAddon] });
    assert.equal(bdMensalOneTime.hasMixedPeriodicities, true);
    assert.equal(bdMensalOneTime.consolidatedMonthlyCents, 30000); // Recorrente mensal fica R$ 300/mês
    assert.equal(bdMensalOneTime.oneTimeAddonsTotalCents, 8000);
    assert.equal(bdMensalOneTime.firstChargeDueCents, 38000);

    console.log('4. Verificando catálogo público (/public/tenants/:slug)...');
    const pubRes = await req(server, 'GET', '/v1/public/tenants/academia-addons-a');
    assert.equal(pubRes.status, 200);
    const pubMusc = pubRes.data.services.find(s => s.id === muscId);
    assert.ok(pubMusc.optional_addons?.enabled);
    assert.equal(pubMusc.optional_addons.options.length, 3);
    assert.ok(pubRes.data.addon_services.some(s => s.id === personalId));

    console.log('5. Contratação pública SEM complemento ("Não adicionar")...');
    const reqNoneRes = await req(server, 'POST', '/v1/public/studio/bookings', {}, {
      tenantSlug: 'academia-addons-a',
      mode: 'access_plan',
      bookingIntent: 'access_plan',
      serviceId: muscId,
      commercialOptionId: 'musc-mensal',
      selectedAddonOptionIds: [],
      startDate: nextWeekdayYmd(1, 0),
      student: { fullName: 'Aluno Sem Addon', phone: '11988887001' }
    });
    assert.equal(reqNoneRes.status, 201);
    const confNoneRes = await req(server, 'POST', `/v1/studio/enrollments/public-requests/${reqNoneRes.data.id}/approve`, authA, {});
    assert.equal(confNoneRes.status, 200);
    assert.equal(confNoneRes.data.contractId, null);
    assert.ok(confNoneRes.data.billingPlanId);

    console.log('6. Contratação pública com 1 complemento (Musculação + Personal 1x/sem pós-aprovação)...');
    const reqOneRes = await req(server, 'POST', '/v1/public/studio/bookings', {}, {
      tenantSlug: 'academia-addons-a',
      mode: 'access_plan',
      bookingIntent: 'access_plan',
      serviceId: muscId,
      commercialOptionId: 'musc-mensal',
      selectedAddonOptionIds: ['pers-1x'],
      startDate: nextWeekdayYmd(1, 0),
      student: { fullName: 'Aluno Combo 1', phone: '11988887002' }
    });
    assert.equal(reqOneRes.status, 201);
    assert.equal(reqOneRes.data.appointments.length, 0, 'Plano base sem agendamento + addon pós-aprovação não cria agendamento prévio');
    const confOneRes = await req(server, 'POST', `/v1/studio/enrollments/public-requests/${reqOneRes.data.id}/approve`, authA, {});
    assert.equal(confOneRes.status, 200);
    const comboCtr1Id = confOneRes.data.contractId;
    assert.ok(comboCtr1Id && comboCtr1Id.startsWith('ctr-'));
    assert.equal(confOneRes.data.appointmentIds.length, 0);

    // Conferir financeiro: exatamente 1 pagamento de R$ 300,00 (sem duplicação!)
    const pays1 = db.prepare(`SELECT * FROM payments WHERE package_contract_id = ?`).all(comboCtr1Id);
    assert.equal(pays1.length, 1);
    assert.equal(Number(pays1[0].amount), 300);

    console.log('7. Testando /matriculas detalhamento + proteção RBAC financeiro...');
    const enrProfList = await req(server, 'GET', '/v1/studio/enrollments', authProfA);
    assert.equal(enrProfList.status, 200);
    const itemProf = enrProfList.data.enrollments.find(e => e.id === comboCtr1Id);
    assert.ok(itemProf);
    assert.equal(itemProf.amount, null, 'Profissional sem permissão financeira não vê valor');
    assert.equal(itemProf.commercialBreakdown, null);
    assert.equal(itemProf.entitlements.length, 2);
    assert.ok(itemProf.entitlements.some(e => e.entitlement_role === 'base' && e.service_id === muscId));
    assert.ok(itemProf.entitlements.some(e => e.entitlement_role === 'addon' && e.service_id === personalId && e.credits_total === 4));

    const enrAdmDetail = await req(server, 'GET', `/v1/studio/enrollments/${comboCtr1Id}`, authA);
    assert.equal(enrAdmDetail.status, 200);
    assert.equal(enrAdmDetail.data.enrollment.commercialBreakdown.consolidatedMonthlyCents, 30000);

    console.log('8. Testando reserva pós-aprovação (bloqueada antes de aprovar, liberada após aprovação, limite semanal preservado)...');
    // Cria matrícula administrativa com status 'requested' (aguardando aprovação)
    const pendingAdmEnr = await req(server, 'POST', '/v1/studio/enrollments', authA, {
      studentId: studioA.pat1,
      serviceId: muscId,
      commercialOptionId: 'musc-trim',
      selectedAddonOptionIds: ['pers-1x'],
      startDate: nextWeekdayYmd(1, 0),
      contractStatus: 'requested',
      paymentMethod: 'pix',
      initialPaymentStatus: 'pending',
      allowDuplicateAccessBenefit: true
    });
    assert.equal(pendingAdmEnr.status, 201);
    const ctrRequestedId = pendingAdmEnr.data.contractId;
    const paysReqBefore = db.prepare(`SELECT * FROM payments WHERE package_contract_id = ?`).all(ctrRequestedId);
    assert.equal(paysReqBefore.length, 0, 'Contrato solicitado não deve gerar cobrança antecipada antes de aprovação');

    const slotMon = nextWeekdayYmd(1, 2);
    const slotTue = nextWeekdayYmd(2, 2);
    const blockUnapproved = await req(server, 'POST', '/v1/appointments', authA, {
      patientId: studioA.pat1,
      professionalId: studioA.profId,
      serviceId: personalId,
      startTime: `${slotMon}T09:00:00`,
      endTime: `${slotMon}T10:00:00`,
      modality: 'presential',
      packageContractId: ctrRequestedId
    });
    assert.equal(blockUnapproved.status, 409, 'Agendamento de Personal via complemento deve bloquear antes da aprovação do contrato');

    // Aprovar matrícula: deve gerar cobranças discriminadas (R$ 300 trimestral + R$ 180 mensal = 2 registros distintos, sem somar indevidamente)
    const approveRes = await req(server, 'POST', `/v1/studio/enrollments/${ctrRequestedId}/lifecycle`, authA, {
      action: 'approve'
    });
    assert.equal(approveRes.status, 200);
    const paysAfterApprove = db.prepare(`SELECT * FROM payments WHERE package_contract_id = ? ORDER BY amount DESC`).all(ctrRequestedId);
    assert.equal(paysAfterApprove.length, 2, 'Periodicidades distintas (Trimestral + Mensal) devem gerar cobranças separadas sem soma indevida');
    assert.equal(Number(paysAfterApprove[0].amount), 300);
    assert.equal(Number(paysAfterApprove[1].amount), 180);

    // Após aprovação, agendamento de Personal usa crédito sem cobrança avulsa duplicada
    const bookPers1 = await req(server, 'POST', '/v1/appointments', authA, {
      patientId: studioA.pat1,
      professionalId: studioA.profId,
      serviceId: personalId,
      startTime: `${slotMon}T09:00:00`,
      endTime: `${slotMon}T10:00:00`,
      modality: 'presential',
      packageContractId: ctrRequestedId
    });
    assert.equal(bookPers1.status, 201);
    const apptPays = db.prepare(`SELECT * FROM payments WHERE appointment_id = ?`).all(bookPers1.data.id);
    assert.equal(apptPays.length, 0, 'Agendamento coberto pelo complemento não deve gerar cobrança avulsa duplicada');

    // 2ª aula na mesma semana quando limite semanal do complemento é 1x/sem deve respeitar limite
    const bookPers2SameWeek = await req(server, 'POST', '/v1/appointments', authA, {
      patientId: studioA.pat1,
      professionalId: studioA.profId,
      serviceId: personalId,
      startTime: `${slotTue}T09:00:00`,
      endTime: `${slotTue}T10:00:00`,
      modality: 'presential',
      packageContractId: ctrRequestedId
    });
    assert.equal(bookPers2SameWeek.status, 409);

    console.log('9. Testando escolha de horários durante a contratação + validação de vagas da turma...');
    const schedRow = db.prepare(`SELECT id FROM class_schedules WHERE service_id = ? AND tenant_id = ?`).get(groupId, 'ten-studio-a');
    const wedYmd = nextWeekdayYmd(3, 1);
    const submitComboDur = async (studentName, phone) => {
      const r = await req(server, 'POST', '/v1/public/studio/bookings', {}, {
        tenantSlug: 'academia-addons-a',
        mode: 'access_plan',
        bookingIntent: 'access_plan',
        serviceId: muscId,
        commercialOptionId: 'musc-mensal',
        selectedAddonOptionIds: ['eval-once', 'func-during'],
        addonSchedules: [
          {
            serviceId: groupId,
            professionalId: studioA.profId,
            classScheduleId: schedRow.id,
            modality: 'presential',
            startTime: `${wedYmd}T10:00:00`,
            endTime: `${wedYmd}T10:50:00`
          }
        ],
        startDate: nextWeekdayYmd(1, 0),
        student: { fullName: studentName, phone }
      });
      return r;
    };

    const g1 = await submitComboDur('Aluna Vaga 1', '11988887010');
    assert.equal(g1.status, 201);
    assert.equal(g1.data.appointments.length, 1);
    const cg1 = await req(server, 'POST', `/v1/studio/enrollments/public-requests/${g1.data.id}/approve`, authA, {});
    assert.equal(cg1.status, 200);
    assert.equal(cg1.data.appointments?.length || cg1.data.appointmentIds?.length, 1);

    // Conferir múltiplos pagamentos discriminados (Mensal consolidado R$ 255 + Pagamento único Avaliação R$ 80)
    // Musculação R$ 120 + Funcional 150 com 10% desconto (R$ 135) = R$ 255 mensal; Avaliação = R$ 80 único
    const g1Pays = db.prepare(`SELECT amount, notes FROM payments WHERE package_contract_id = ? ORDER BY amount DESC`).all(cg1.data.contractId);
    assert.equal(g1Pays.length, 2);
    assert.equal(Number(g1Pays[0].amount), 255);
    assert.equal(Number(g1Pays[1].amount), 80);

    // Preenche 2ª vaga
    const g2 = await submitComboDur('Aluna Vaga 2', '11988887011');
    assert.equal(g2.status, 201);
    const cg2 = await req(server, 'POST', `/v1/studio/enrollments/public-requests/${g2.data.id}/approve`, authA, {});
    assert.equal(cg2.status, 200);

    // 3ª tentativa para a mesma turma de capacidade 2 deve bloquear por lotação!
    const g3Full = await submitComboDur('Aluna Sem Vaga', '11988887012');
    assert.equal(g3Full.status, 409);

    console.log('10. Testando Importação Inteligente com IA (normalizeProposal + applyStudioCatalog + mandatoryUnclear)...');
    const rawProposal = normalizeProposal(
      {
        services: [
          {
            name: 'Pilates Solo',
            activity: 'pilates',
            type: 'group',
            modality: 'presential',
            durationMinutes: 50,
            capacity: 6,
            professionalNames: ['Prof Carlos Personal'],
            prices: [
              {
                label: 'Mensal 2x/sem',
                amountCents: 22000,
                unit: 'per_month',
                paymentPeriod: 'monthly',
                duration: '1_month',
                frequencyType: 'weekly',
                frequencyCount: 2,
                evidence: 'Pilates Solo 2x/sem R$ 220/mês'
              }
            ],
            schedules: [
              { dayOfWeek: 4, startTime: '09:00', endTime: '09:50', capacity: 6, professionalName: 'Prof Carlos Personal', evidence: 'Qui 9h' }
            ],
            optionalAddons: [
              {
                label: 'Personal Complementar 1x/sem',
                addonServiceName: 'Acompanhamento Personal',
                frequencyType: 'weekly',
                frequencyCount: 1,
                creditsPerCycle: 4,
                additionalPriceCents: 18000,
                comboDiscountType: 'fixed_cents',
                comboDiscountValue: 2000,
                billingPeriodicity: 'monthly',
                durationMode: 'match_base',
                scheduleTiming: 'after_confirmation',
                mandatoryUnclear: true,
                ambiguousReason: 'Confirme se Personal é opcional ou pacote obrigatório.',
                evidence: 'Mais Personal opcional por R$ 180 (-R$ 20 combo)'
              }
            ]
          }
        ],
        packages: []
      },
      1,
      false
    );

    assert.equal(rawProposal.services[0].optionalAddons.length, 1);
    assert.equal(rawProposal.services[0].optionalAddons[0].mandatoryUnclear, true);

    rawProposal.services[0].action = 'create';
    rawProposal.services[0].reviewed = true;
    rawProposal.services[0].professionalId = studioA.profId;
    rawProposal.services[0].schedules[0].professionalId = studioA.profId;
    rawProposal.services[0].optionalAddons[0].addonServiceRef = `existing:${personalId}`;

    // Enquanto mandatoryUnclear === true, deve ser bloqueado na aplicação
    const { applyStudioCatalog } = require('./dist/services/studio-catalog-confirmation');
    assert.throws(() => {
      applyStudioCatalog({ tenantId: 'ten-studio-a', user: { userId: studioA.adminId } }, rawProposal);
    }, /opcional ou pacote obrigatório/i);

    // Após confirmação explícita pelo gestor (mandatoryUnclear = false)
    rawProposal.services[0].optionalAddons[0].mandatoryUnclear = false;
    rawProposal.services[0].issues = [];
    const applied = applyStudioCatalog({ tenantId: 'ten-studio-a', user: { userId: studioA.adminId } }, rawProposal);
    assert.equal(applied.services.length, 1);

    const afterImportSrvs = await req(server, 'GET', '/v1/services', authA);
    const pilatesImported = afterImportSrvs.data.find(s => s.id === applied.services[0].id);
    assert.ok(pilatesImported.optional_addons?.enabled);
    assert.equal(pilatesImported.optional_addons.options[0].addonServiceId, personalId);
    assert.equal(afterImportSrvs.data.length, 5, 'Deve reaproveitar Personal existente sem duplicar serviços');

    console.log('11. Verificando isolamento facility_access SEM Personal/clínica + migração segura...');
    const muscDb = db.prepare(`SELECT professional_id, clinical_module, requires_appointment FROM services WHERE id = ?`).get(muscId);
    assert.equal(muscDb.professional_id, null, 'Musculação não deve possuir professional_id');
    assert.equal(muscDb.clinical_module, null, 'Musculação não deve possuir clinical_module');
    assert.equal(Number(muscDb.requires_appointment), 0, 'Musculação não deve exigir agendamento');
    const muscLinks = db.prepare(`SELECT COUNT(*) AS cnt FROM professional_services WHERE service_id = ?`).get(muscId);
    assert.equal(Number(muscLinks.cnt), 0, 'Musculação não deve ter vínculos em professional_services');

    // Simular legado corrompido em facility_access + verificar que migrateStudioImprovements limpa só facility_access e preserva agendáveis
    const { migrateStudioImprovements } = require('./dist/config/studio-improvements.migration');
    db.prepare(`UPDATE services SET professional_id = ?, clinical_module = 'ZemdaPersonal', requires_appointment = 1 WHERE id = ?`).run(studioA.profId, muscId);
    db.prepare(`INSERT OR IGNORE INTO professional_services (id, professional_id, service_id) VALUES ('ps-legacy-dirty', ?, ?)`).run(studioA.profId, muscId);
    db.prepare(`INSERT OR IGNORE INTO professional_services (id, professional_id, service_id) VALUES ('ps-keep-personal', ?, ?)`).run(studioA.profId, personalId);
    migrateStudioImprovements(db);
    const muscCleaned = db.prepare(`SELECT professional_id, clinical_module, requires_appointment FROM services WHERE id = ?`).get(muscId);
    assert.equal(muscCleaned.professional_id, null, 'Migration deve limpar professional_id indevido de facility_access');
    assert.equal(muscCleaned.clinical_module, null, 'Migration deve limpar clinical_module de facility_access');
    assert.equal(Number(muscCleaned.requires_appointment), 0, 'Migration deve manter requires_appointment = 0 para facility_access');
    assert.equal(Number(db.prepare(`SELECT COUNT(*) AS cnt FROM professional_services WHERE service_id = ?`).get(muscId).cnt), 0);
    const persKept = db.prepare(`SELECT professional_id FROM services WHERE id = ?`).get(personalId);
    assert.equal(persKept.professional_id, studioA.profId, 'Serviço agendável deve preservar professional_id intacto');

    console.log('12. Testando configuração avançada de complementos (profissionais, formato, capacidade, dias, link público)...');
    const prof2Id = 'prof-ten-studio-a-2';
    const prof2UserId = 'usr-prf2-ten-studio-a';
    db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, onboarding_status, email_verified) VALUES (?, 'ten-studio-a', 'Prof Marina Personal', 'marina@test.invalid', 'x', 'professional', 'active', 'active', 1)`).run(prof2UserId);
    db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager) VALUES ('mem-prf2-a', 'ten-studio-a', ?, 'professional', 'active', 0)`).run(prof2UserId);
    db.prepare(`INSERT INTO professionals (id, tenant_id, user_id, name, slug, profession_id, profession_name, active, public_booking_enabled) VALUES (?, 'ten-studio-a', ?, 'Prof Marina Personal', 'marina-studio-a', 'prof-personal-trainer', 'Educador Físico', 1, 1)`).run(prof2Id, prof2UserId);
    for (const dow of [1, 2, 3, 4, 5]) {
      db.prepare(`INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active) VALUES (?, 'ten-studio-a', ?, ?, '07:00', '21:00', 1)`).run(`sh-a2-${dow}`, prof2Id, dow);
    }
    db.prepare(`INSERT OR IGNORE INTO professional_services (id, professional_id, service_id) VALUES ('ps-marina-pers', ?, ?)`).run(prof2Id, personalId);

    // Rejeitar complemento em grupo sem capacidade >= 2
    const invalidGroupAddonRes = await req(server, 'PUT', `/v1/services/${muscId}`, authA, {
      optionalAddons: {
        enabled: true,
        options: [{
          id: 'bad-group',
          addonServiceId: personalId,
          label: 'Grupo inválido',
          attendanceFormat: 'group',
          sessionCapacity: 1,
          additionalPriceCents: 10000
        }]
      }
    });
    assert.equal(invalidGroupAddonRes.status, 400, 'Complemento group exige sessionCapacity >= 2');

    const updMuscRes = await req(server, 'PUT', `/v1/services/${muscId}`, authA, {
      commercialPriceOptions: [
        {
          id: 'musc-mensal',
          label: 'Mensal Livre',
          accessType: 'unlimited',
          frequencyType: 'unlimited',
          frequencyCount: null,
          contractDurationCode: '1_month',
          paymentPeriodicity: 'monthly',
          commercialUnit: 'per_month',
          amountCents: 12000,
          autoRenew: true,
          active: true
        },
        {
          id: 'musc-trim',
          label: 'Trimestral Livre',
          accessType: 'unlimited',
          frequencyType: 'unlimited',
          frequencyCount: null,
          contractDurationCode: '3_months',
          paymentPeriodicity: 'quarterly',
          commercialUnit: 'contract_total',
          amountCents: 30000,
          autoRenew: false,
          active: true
        },
        {
          id: 'musc-anual',
          label: 'Anual Livre',
          accessType: 'unlimited',
          frequencyType: 'unlimited',
          frequencyCount: null,
          contractDurationCode: '12_months',
          paymentPeriodicity: 'annual',
          commercialUnit: 'contract_total',
          amountCents: 120000,
          autoRenew: false,
          active: true
        }
      ],
      optionalAddons: {
        enabled: true,
        allowMultiple: true,
        promptTitle: 'Deseja adicionar acompanhamento personalizado?',
        noAddonLabel: 'Não adicionar',
        options: [
          {
            id: 'pers-1x',
            addonServiceId: personalId,
            label: 'Personal 1 vez por semana',
            acceptedBaseOptionIds: [],
            frequencyType: 'weekly',
            frequencyCount: 1,
            creditsPerCycle: 4,
            additionalPriceCents: 20000,
            comboDiscountType: 'fixed_cents',
            comboDiscountValue: 2000,
            billingPeriodicity: 'monthly',
            durationMode: 'match_base',
            scheduleTiming: 'after_confirmation',
            active: true,
            allowPublicBooking: true
          },
          {
            id: 'pers-duo-filtered',
            addonServiceId: personalId,
            label: 'Personal Dupla 2x/sem (Ter/Qui)',
            acceptedBaseOptionIds: ['musc-mensal', 'musc-trim'],
            frequencyType: 'weekly',
            frequencyCount: 2,
            creditsPerCycle: 8,
            additionalPriceCents: 26000,
            comboDiscountType: 'none',
            comboDiscountValue: 0,
            billingPeriodicity: 'monthly',
            durationMode: 'match_base',
            scheduleTiming: 'during_purchase',
            attendanceFormat: 'duo',
            sessionCapacity: 2,
            professionalSelectionMode: 'student_picks',
            enabledProfessionalIds: [prof2Id],
            allowedWeekdays: [2, 4],
            allowPublicBooking: true,
            active: true
          },
          {
            id: 'pers-hidden-pub',
            addonServiceId: personalId,
            label: 'Personal Interno Oculto no Link',
            acceptedBaseOptionIds: [],
            frequencyType: 'weekly',
            frequencyCount: 1,
            creditsPerCycle: 4,
            additionalPriceCents: 15000,
            billingPeriodicity: 'monthly',
            durationMode: 'match_base',
            scheduleTiming: 'after_confirmation',
            allowPublicBooking: false,
            active: true
          },
          {
            id: 'pers-auto-group',
            addonServiceId: personalId,
            label: 'Personal Pequeno Grupo (até 3)',
            acceptedBaseOptionIds: [],
            frequencyType: 'weekly',
            frequencyCount: 1,
            creditsPerCycle: 4,
            additionalPriceCents: 12000,
            billingPeriodicity: 'monthly',
            durationMode: 'match_base',
            scheduleTiming: 'during_purchase',
            attendanceFormat: 'group',
            sessionCapacity: 3,
            professionalSelectionMode: 'auto_assign',
            enabledProfessionalIds: [studioA.profId, prof2Id],
            allowedWeekdays: [5],
            allowPublicBooking: true,
            active: true
          }
        ]
      }
    });
    assert.equal(updMuscRes.status, 200);
    const muscAfterUpd = db.prepare(`SELECT professional_id, clinical_module FROM services WHERE id = ?`).get(muscId);
    assert.equal(muscAfterUpd.professional_id, null, 'PUT em facility_access não pode vincular profissional');
    assert.equal(muscAfterUpd.clinical_module, null, 'PUT em facility_access não pode vincular módulo clínico');

    const pubCatCheck = await req(server, 'GET', '/v1/public/tenants/academia-addons-a');
    assert.equal(pubCatCheck.status, 200);
    const pubMuscCheck = pubCatCheck.data.services.find(s => s.id === muscId);
    assert.ok(pubMuscCheck.optional_addons.options.every(o => o.id !== 'pers-hidden-pub'), 'Complemento com allowPublicBooking=false deve ficar oculto no link público');
    const pubDuoOpt = pubMuscCheck.optional_addons.options.find(o => o.id === 'pers-duo-filtered');
    assert.equal(pubDuoOpt.attendanceFormat, 'duo');
    assert.equal(pubDuoOpt.sessionCapacity, 2);

    console.log('13. Testando slots públicos de complementos (filtro de dia, profissional, capacidade e holds)...');
    const monDate = nextWeekdayYmd(1, 3);
    const addDaysYmd = (ymd, days) => {
      const dt = new Date(Date.parse(`${ymd}T12:00:00Z`) + days * 86400000);
      return dt.toISOString().slice(0, 10);
    };
    const tueDate = addDaysYmd(monDate, 1);
    const thuDate = addDaysYmd(monDate, 3);
    const friDate = addDaysYmd(monDate, 4);

    const monDisallowed = await req(server, 'GET', `/v1/public/studio/slots?tenantSlug=academia-addons-a&serviceId=${personalId}&baseServiceId=${muscId}&addonOptionId=pers-duo-filtered&date=${monDate}`);
    assert.equal(monDisallowed.status, 200);
    assert.equal(monDisallowed.data.slots.length, 0, 'Segunda não permitida em allowedWeekdays [2,4] deve retornar 0 slots');

    const tueSlotsRes = await req(server, 'GET', `/v1/public/studio/slots?tenantSlug=academia-addons-a&serviceId=${personalId}&baseServiceId=${muscId}&addonOptionId=pers-duo-filtered&date=${tueDate}`);
    assert.equal(tueSlotsRes.status, 200);
    assert.ok(tueSlotsRes.data.slots.length > 0);
    assert.ok(tueSlotsRes.data.slots.every(sl => sl.professionalId === prof2Id), 'Somente profissionais habilitados no complemento devem retornar');
    assert.equal(tueSlotsRes.data.slots[0].capacity, 2, 'Formato duo aplica sessionCapacity = 2 nos slots');
    assert.equal(tueSlotsRes.data.slots[0].remainingSpots, 2);

    const friSlotsRes = await req(server, 'GET', `/v1/public/studio/slots?tenantSlug=academia-addons-a&serviceId=${personalId}&baseServiceId=${muscId}&addonOptionId=pers-auto-group&date=${friDate}`);
    assert.equal(friSlotsRes.status, 200);
    assert.equal(friSlotsRes.data.professionalSelectionMode, 'auto_assign');
    assert.equal(friSlotsRes.data.slots[0].capacity, 3);

    console.log('14. Testando multi-slot 2x/sem, hold temporário e corrida concorrente na última vaga do Duo...');
    const duoPickReq1 = await req(server, 'POST', '/v1/public/studio/bookings', {}, {
      tenantSlug: 'academia-addons-a',
      mode: 'access_plan',
      bookingIntent: 'access_plan',
      serviceId: muscId,
      commercialOptionId: 'musc-mensal',
      selectedAddonOptionIds: ['pers-duo-filtered'],
      addonSchedules: [
        { addonOptionId: 'pers-duo-filtered', serviceId: personalId, professionalId: prof2Id, modality: 'presential', startTime: `${tueDate}T09:00:00`, endTime: `${tueDate}T10:00:00`, recurrence: { frequency: 'weekly', durationCode: '1_month' } },
        { addonOptionId: 'pers-duo-filtered', serviceId: personalId, professionalId: prof2Id, modality: 'presential', startTime: `${thuDate}T09:00:00`, endTime: `${thuDate}T10:00:00`, recurrence: { frequency: 'weekly', durationCode: '1_month' } }
      ],
      startDate: tueDate,
      student: { fullName: 'Aluno Duo 1', phone: '11988887051' }
    });
    assert.equal(duoPickReq1.status, 201);
    const duoReq1Id = duoPickReq1.data.id;
    assert.ok(duoPickReq1.data.appointments.length >= 2, 'Prévia deve listar os horários recorrentes escolhidos (Ter e Qui)');

    // Enquanto pendente (hold ativo), disponibilidade restante cai de 2 para 1
    const tueSlotsDuringHold = await req(server, 'GET', `/v1/public/studio/slots?tenantSlug=academia-addons-a&serviceId=${personalId}&baseServiceId=${muscId}&addonOptionId=pers-duo-filtered&date=${tueDate}`);
    const slot0900 = tueSlotsDuringHold.data.slots.find(s => s.time === '09:00' || s.startTime === '09:00');
    assert.equal(slot0900.remainingSpots, 1, 'Hold ativo deve reduzir vagas restantes de 2 para 1');

    // Disputa simultânea pela última vaga (2 pedidos idênticos ao mesmo tempo -> exatamente 1 vence e 1 recebe 409)
    const [race1, race2] = await Promise.all([
      req(server, 'POST', '/v1/public/studio/bookings', {}, {
        tenantSlug: 'academia-addons-a',
        mode: 'access_plan',
        bookingIntent: 'access_plan',
        serviceId: muscId,
        commercialOptionId: 'musc-mensal',
        selectedAddonOptionIds: ['pers-duo-filtered'],
        addonSchedules: [
          { addonOptionId: 'pers-duo-filtered', serviceId: personalId, professionalId: prof2Id, modality: 'presential', startTime: `${tueDate}T09:00:00`, endTime: `${tueDate}T10:00:00`, recurrence: { frequency: 'weekly', durationCode: '1_month' } },
          { addonOptionId: 'pers-duo-filtered', serviceId: personalId, professionalId: prof2Id, modality: 'presential', startTime: `${thuDate}T09:00:00`, endTime: `${thuDate}T10:00:00`, recurrence: { frequency: 'weekly', durationCode: '1_month' } }
        ],
        startDate: tueDate,
        student: { fullName: 'Aluno Corrida A', phone: '11988887052' }
      }),
      req(server, 'POST', '/v1/public/studio/bookings', {}, {
        tenantSlug: 'academia-addons-a',
        mode: 'access_plan',
        bookingIntent: 'access_plan',
        serviceId: muscId,
        commercialOptionId: 'musc-mensal',
        selectedAddonOptionIds: ['pers-duo-filtered'],
        addonSchedules: [
          { addonOptionId: 'pers-duo-filtered', serviceId: personalId, professionalId: prof2Id, modality: 'presential', startTime: `${tueDate}T09:00:00`, endTime: `${tueDate}T10:00:00`, recurrence: { frequency: 'weekly', durationCode: '1_month' } },
          { addonOptionId: 'pers-duo-filtered', serviceId: personalId, professionalId: prof2Id, modality: 'presential', startTime: `${thuDate}T09:00:00`, endTime: `${thuDate}T10:00:00`, recurrence: { frequency: 'weekly', durationCode: '1_month' } }
        ],
        startDate: tueDate,
        student: { fullName: 'Aluno Corrida B', phone: '11988887053' }
      })
    ]);
    const raceStatuses = [race1.status, race2.status].sort();
    assert.deepEqual(raceStatuses, [201, 409], 'Somente 1 candidato pode obter a última vaga sob concorrência simultânea');
    const raceWinnerId = race1.status === 201 ? race1.data.id : race2.data.id;

    // Expirar hold do vencedor devolve vaga imediatamente no cálculo de disponibilidade
    db.prepare(`UPDATE public_booking_requests SET hold_expires_at = datetime('now', '-5 minutes') WHERE id = ?`).run(raceWinnerId);
    const tueSlotsAfterExpire = await req(server, 'GET', `/v1/public/studio/slots?tenantSlug=academia-addons-a&serviceId=${personalId}&baseServiceId=${muscId}&addonOptionId=pers-duo-filtered&date=${tueDate}`);
    const slotAfterExpire = tueSlotsAfterExpire.data.slots.find(s => s.time === '09:00' || s.startTime === '09:00');
    assert.equal(slotAfterExpire.remainingSpots, 1, 'Hold expirado deve liberar a vaga novamente');

    // Aprovar duoReq1Id e um 2o aluno para preencher 2/2 na turma Duo compartilhada
    const approveDuo1 = await req(server, 'POST', `/v1/studio/enrollments/public-requests/${duoReq1Id}/approve`, authA, {});
    assert.equal(approveDuo1.status, 200);
    const duoContract1Id = approveDuo1.data.contractId;
    assert.ok(approveDuo1.data.appointmentIds.length >= 2, 'Deve gerar recorrência dos dias escolhidos do addon');

    const duoPickReq2 = await req(server, 'POST', '/v1/public/studio/bookings', {}, {
      tenantSlug: 'academia-addons-a',
      mode: 'access_plan',
      bookingIntent: 'access_plan',
      serviceId: muscId,
      commercialOptionId: 'musc-mensal',
      selectedAddonOptionIds: ['pers-duo-filtered'],
      addonSchedules: [
        { addonOptionId: 'pers-duo-filtered', serviceId: personalId, professionalId: prof2Id, modality: 'presential', startTime: `${tueDate}T09:00:00`, endTime: `${tueDate}T10:00:00`, recurrence: { frequency: 'weekly', durationCode: '1_month' } },
        { addonOptionId: 'pers-duo-filtered', serviceId: personalId, professionalId: prof2Id, modality: 'presential', startTime: `${thuDate}T09:00:00`, endTime: `${thuDate}T10:00:00`, recurrence: { frequency: 'weekly', durationCode: '1_month' } }
      ],
      startDate: tueDate,
      student: { fullName: 'Aluno Duo 2', phone: '11988887054' }
    });
    assert.equal(duoPickReq2.status, 201);
    const approveDuo2 = await req(server, 'POST', `/v1/studio/enrollments/public-requests/${duoPickReq2.data.id}/approve`, authA, {});
    assert.equal(approveDuo2.status, 200);

    const duo3Blocked = await req(server, 'POST', '/v1/public/studio/bookings', {}, {
      tenantSlug: 'academia-addons-a',
      mode: 'access_plan',
      bookingIntent: 'access_plan',
      serviceId: muscId,
      commercialOptionId: 'musc-mensal',
      selectedAddonOptionIds: ['pers-duo-filtered'],
      addonSchedules: [
        { addonOptionId: 'pers-duo-filtered', serviceId: personalId, professionalId: prof2Id, modality: 'presential', startTime: `${tueDate}T09:00:00`, endTime: `${tueDate}T10:00:00`, recurrence: { frequency: 'weekly', durationCode: '1_month' } },
        { addonOptionId: 'pers-duo-filtered', serviceId: personalId, professionalId: prof2Id, modality: 'presential', startTime: `${thuDate}T09:00:00`, endTime: `${thuDate}T10:00:00`, recurrence: { frequency: 'weekly', durationCode: '1_month' } }
      ],
      startDate: tueDate,
      student: { fullName: 'Aluno Duo 3 Barrado', phone: '11988887055' }
    });
    assert.equal(duo3Blocked.status, 409, 'Duo com 2/2 aprovados deve bloquear 3o aluno no horário');

    console.log('15. Testando plano Anual Base + Complemento semanal recorrente (match_base, sem estourar créditos)...');
    const annualReq = await req(server, 'POST', '/v1/public/studio/bookings', {}, {
      tenantSlug: 'academia-addons-a',
      mode: 'access_plan',
      bookingIntent: 'access_plan',
      serviceId: muscId,
      commercialOptionId: 'musc-anual',
      selectedAddonOptionIds: ['pers-auto-group'],
      addonSchedules: [
        { addonOptionId: 'pers-auto-group', serviceId: personalId, modality: 'presential', startTime: `${friDate}T11:00:00`, endTime: `${friDate}T12:00:00`, recurrence: { frequency: 'weekly', durationCode: '12_months' } }
      ],
      startDate: friDate,
      student: { fullName: 'Aluno Anual Grupo', phone: '11988887056' }
    });
    assert.equal(annualReq.status, 201);
    const annualApprove = await req(server, 'POST', `/v1/studio/enrollments/public-requests/${annualReq.data.id}/approve`, authA, {});
    assert.equal(annualApprove.status, 200, 'Aprovação anual com addon semanal não deve falhar em 52+ ocorrências');
    const annualAddonEnt = db.prepare(`SELECT * FROM student_package_entitlements WHERE contract_id = ? AND entitlement_role = 'addon'`).get(annualApprove.data.contractId);
    assert.ok(annualAddonEnt.credits_total >= annualApprove.data.appointmentIds.length);
    assert.ok(annualApprove.data.appointmentIds.length >= 48, 'Plano anual 1x/sem deve agendar todo o ciclo anual');

    console.log('16. Testando cancelamento independente de complemento, inclusão posterior, RBAC e cancelamento do plano-base...');
    const duoDetailBefore = await req(server, 'GET', `/v1/studio/enrollments/${duoContract1Id}`, authA);
    assert.equal(duoDetailBefore.status, 200);
    const duoAddonEnt = duoDetailBefore.data.entitlements.find(e => e.entitlement_role === 'addon');
    assert.ok(duoAddonEnt && duoAddonEnt.schedule_snapshot.length === 2, 'Snapshot deve registrar os 2 dias/horários escolhidos do complemento');

    // Simula 1 pagamento já quitado + 1 pagamento futuro pendente + 1 aula já concluída do addon
    const firstApptId = duoDetailBefore.data.appointments[0].id;
    db.prepare(`UPDATE appointments SET status = 'completed' WHERE id = ?`).run(firstApptId);
    db.prepare(`INSERT INTO payments (id, tenant_id, patient_id, package_contract_id, amount, base_amount, status, due_date, payment_date, payment_method, notes) VALUES ('pay-paid-hist', 'ten-studio-a', ?, ?, 380, 380, 'paid', date('now'), date('now'), 'pix', 'Pago anterior')`)
      .run(duoDetailBefore.data.enrollment.studentId, duoContract1Id);

    const cancelAddonRes = await req(server, 'POST', `/v1/studio/enrollments/${duoContract1Id}/entitlements/${duoAddonEnt.id}/cancel`, authA, {
      cancelFuturePendingPayments: true,
      cancelFutureScheduledAppointments: true,
      reason: 'Aluno optou por seguir somente na musculação'
    });
    assert.equal(cancelAddonRes.status, 200);
    assert.equal(cancelAddonRes.data.detail.enrollment.contractStatus, 'active', 'Status contratual deve permanecer ativo após cancelar somente complemento');
    assert.ok(['active', 'future'].includes(cancelAddonRes.data.detail.enrollment.lifecycleCategory), 'Plano-base não deve ser marcado como cancelado após cancelar somente complemento');
    const cancelledEntRow = cancelAddonRes.data.detail.entitlements.find(e => e.id === duoAddonEnt.id);
    assert.equal(cancelledEntRow.entitlement_status, 'cancelled');
    const baseEntAfterCancel = cancelAddonRes.data.detail.entitlements.find(e => e.entitlement_role === 'base');
    assert.equal(baseEntAfterCancel.entitlement_status, 'active');
    assert.equal(db.prepare(`SELECT status FROM appointments WHERE id = ?`).get(firstApptId).status, 'completed', 'Aula já realizada deve permanecer intacta');
    assert.equal(db.prepare(`SELECT status FROM payments WHERE id = 'pay-paid-hist'`).get().status, 'paid', 'Pagamento já quitado deve permanecer intacto');

    // Incluir complemento posteriormente no contrato ativo combinado
    const addLateAddonRes = await req(server, 'POST', `/v1/studio/enrollments/${duoContract1Id}/addons`, authA, {
      addonOptionId: 'pers-auto-group'
    });
    assert.equal(addLateAddonRes.status, 201);
    assert.ok(addLateAddonRes.data.addedEntitlementId);

    // RBAC em detalhe com availableAddons
    const profDetailRedacted = await req(server, 'GET', `/v1/studio/enrollments/${duoContract1Id}`, authProfA);
    assert.equal(profDetailRedacted.status, 200);
    assert.equal(profDetailRedacted.data.enrollment.amount, null);
    assert.deepEqual(profDetailRedacted.data.payments, []);
    assert.ok(profDetailRedacted.data.availableAddons.every(a => a.additionalPriceCents === null));

    // Incluir complemento em matrícula originalmente AVULSA/SOLO (Sem complemento -> Com complemento)
    const soloEnrollmentList = await req(server, 'GET', '/v1/studio/enrollments', authA);
    const soloCtr = soloEnrollmentList.data.enrollments.find(e => e.studentName === 'Aluno Sem Addon');
    assert.ok(soloCtr);
    const promoteSoloRes = await req(server, 'POST', `/v1/studio/enrollments/${soloCtr.id}/addons`, authA, {
      addonOptionId: 'pers-auto-group'
    });
    assert.equal(promoteSoloRes.status, 201);
    assert.equal(promoteSoloRes.data.detail.entitlements.length, 2, 'Contrato solo deve passar a ter plano-base + complemento');

    // Cancelar o plano-base deve encerrar explicitamente o complemento ativo vinculado (zero órfãos ativos)
    const cancelBaseRes = await req(server, 'POST', `/v1/studio/enrollments/${duoContract1Id}/lifecycle`, authA, {
      action: 'cancel',
      reason: 'Encerramento completo'
    });
    assert.equal(cancelBaseRes.status, 200);
    const activeAddonsLeft = db.prepare(`SELECT COUNT(*) AS cnt FROM student_package_entitlements WHERE contract_id = ? AND entitlement_status != 'cancelled'`).get(duoContract1Id);
    assert.equal(Number(activeAddonsLeft.cnt), 0, 'Cancelamento do contrato principal deve encerrar também os complementos ativos vinculados');

    console.log('17. Testando Importação Inteligente com IA para Musculação + Personal em grupo reduzido (sem vincular Personal à Musculação)...');
    const gymPersonalAiNorm = normalizeProposal({
      services: [
        {
          name: 'Academia Livre Nova',
          type: 'access_unlimited',
          modality: 'presential',
          prices: [{ amountCents: 12000, unit: 'per_month', paymentPeriod: 'monthly', duration: '1_month', frequencyType: 'unlimited', frequencyCount: null, evidence: 'R$ 120/mês' }],
          optionalAddons: [{
            label: 'Personal Grupo Até 4',
            addonServiceName: 'Personal Grupo Reduzido Novo',
            attendanceFormat: 'group',
            sessionCapacity: 4,
            frequencyType: 'weekly',
            frequencyCount: 2,
            additionalPriceCents: 24000,
            billingPeriodicity: 'monthly',
            durationMode: 'match_base',
            scheduleTiming: 'during_purchase',
            allowedWeekdays: [1, 3, 5],
            allowPublicBooking: true,
            mandatoryUnclear: false,
            evidence: '+R$ 240/mês em pequeno grupo até 4'
          }]
        },
        {
          name: 'Personal Grupo Reduzido Novo',
          type: 'group',
          modality: 'presential',
          durationMinutes: 60,
          capacity: 4,
          prices: [{ amountCents: 30000, unit: 'per_month', paymentPeriod: 'monthly', duration: '1_month', frequencyType: 'weekly', frequencyCount: 2, evidence: 'R$ 300/mês avulso' }]
        }
      ],
      packages: []
    }, false);
    const srvBaseAi = {
      ...gymPersonalAiNorm.services[0],
      action: 'create',
      reviewed: true,
      professionalId: studioA.profId, // mesmo se vier poluído na UI, facility_access nunca pode vincular Personal
      optionalAddons: [{
        ...gymPersonalAiNorm.services[0].optionalAddons[0],
        addonServiceRef: gymPersonalAiNorm.services[1].key
      }]
    };
    const srvPersAi = {
      ...gymPersonalAiNorm.services[1],
      action: 'create',
      reviewed: true,
      professionalId: studioA.profId
    };
    const { buildProposalDiagnostics, readStudioImportCatalog } = require('./dist/services/studio-catalog-confirmation');
    const studioImportCatalog = readStudioImportCatalog('ten-studio-a');
    const badGroupDiag = buildProposalDiagnostics(
      'ten-studio-a',
      {
        services: [{
          ...srvBaseAi,
          optionalAddons: [{ ...srvBaseAi.optionalAddons[0], attendanceFormat: 'group', sessionCapacity: 1 }]
        }, srvPersAi],
        packages: []
      },
      studioImportCatalog,
      { services: {}, packages: {} }
    );
    assert.ok(badGroupDiag.alerts.some(al => al.id.startsWith('addon-cap-')), 'Diagnóstico deve alertar complemento group com capacidade < 2');

    const appliedAi = applyStudioCatalog(
      { tenantId: 'ten-studio-a', user: { userId: studioA.adminId } },
      { services: [srvBaseAi, srvPersAi], packages: [] }
    );
    assert.equal(appliedAi.services.length, 2);
    const gymImportedRow = db.prepare(`SELECT * FROM services WHERE id = ?`).get(appliedAi.services[0].id);
    assert.equal(gymImportedRow.professional_id, null, 'Importação IA jamais deve vincular Personal ao serviço-base de Musculação');
    assert.equal(gymImportedRow.clinical_module, null);
    const gymAddonsCfg = JSON.parse(gymImportedRow.optional_addons_json);
    assert.equal(gymAddonsCfg.options[0].addonServiceId, appliedAi.services[1].id);
    assert.equal(gymAddonsCfg.options[0].attendanceFormat, 'group');
    assert.equal(gymAddonsCfg.options[0].sessionCapacity, 4);
    assert.deepEqual(gymAddonsCfg.options[0].allowedWeekdays, [1, 3, 5]);

    console.log('ALL 17 OPTIONAL ADDONS COMPREHENSIVE SCENARIOS PASSED!');
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
