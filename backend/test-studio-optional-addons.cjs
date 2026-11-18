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

    console.log('ALL 14 OPTIONAL ADDONS TEST SCENARIOS PASSED!');
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
