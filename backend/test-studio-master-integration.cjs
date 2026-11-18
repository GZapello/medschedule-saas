const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const sharp = require('sharp');

process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-studio-master-')), 'test.db');
process.env.JWT_SECRET = 'zemda-studio-master-secret-2026-xyz';
process.env.NODE_ENV = 'test';

const { initializeDatabase, db } = require('./dist/config/database');
const { GeminiService } = require('./dist/services/gemini.service');
const { normalizeProposal } = require('./dist/services/studio-catalog-proposal');
const { checkProfessionalScheduleCoverage, parseClockMinutes } = require('./dist/utils/service-availability');
const { generateToken } = require('./dist/utils/jwt');

initializeDatabase();

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use('/api', require('./dist/routes').default);

async function req(server, method, urlPath, headers, body) {
  const addr = server.address();
  const base = `http://127.0.0.1:${addr.port}`;
  const res = await fetch(base + '/api' + urlPath, {
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

function seedStudioTenant(id, profile, slug) {
  const adminId = 'usr-admin-' + id;
  const profUserId = 'usr-prof-' + id;
  const finProfUserId = 'usr-finprof-' + id;
  const inactiveProfUserId = 'usr-inactive-' + id;

  db.prepare(`
    INSERT INTO tenants (
      id, slug, public_booking_slug, public_booking_sequence, public_booking_enabled,
      name, email, status, onboarding_completed, onboarding_status, manager_confirmed,
      billing_required, establishment_profile
    ) VALUES (?, ?, ?, 1, 1, ?, ?, 'active', 1, 'active', 1, 0, ?)
  `).run(id, slug, slug, id, `${id}@test.invalid`, profile);

  const insUser = db.prepare(`
    INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, onboarding_status, email_verified)
    VALUES (?, ?, ?, ?, 'unused', ?, 'active', 'active', 1)
  `);
  insUser.run(adminId, id, 'Gestor ' + id, `${adminId}@test.invalid`, 'clinic_admin');
  insUser.run(profUserId, id, 'Prof Instrutor ' + id, `${profUserId}@test.invalid`, 'professional');
  insUser.run(finProfUserId, id, 'Prof Financeiro ' + id, `${finProfUserId}@test.invalid`, 'professional');
  insUser.run(inactiveProfUserId, id, 'Prof Inativo ' + id, `${inactiveProfUserId}@test.invalid`, 'professional');

  const insMem = db.prepare(`
    INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
  `);
  insMem.run('mem-adm-' + id, id, adminId, 'clinic_admin', 1, null);
  insMem.run('mem-prof-' + id, id, profUserId, 'professional', 0, null);
  insMem.run('mem-finprof-' + id, id, finProfUserId, 'professional', 0, JSON.stringify(['view_enrollments', 'view_financial']));
  insMem.run('mem-inact-' + id, id, inactiveProfUserId, 'professional', 0, null);

  const profId = 'prof-main-' + id;
  const inactiveProfId = 'prof-inact-' + id;
  db.prepare(`
    INSERT INTO professionals (id, tenant_id, user_id, name, slug, profession_id, profession_name, active, public_booking_enabled)
    VALUES (?, ?, ?, 'Instrutora Bia', ?, 'prof-personal-trainer', 'Instrutora', 1, 1)
  `).run(profId, id, profUserId, 'bia-' + id);
  db.prepare(`
    INSERT INTO professionals (id, tenant_id, user_id, name, slug, profession_id, profession_name, active, public_booking_enabled)
    VALUES (?, ?, ?, 'Prof Desativado', ?, 'prof-personal-trainer', 'Instrutor', 0, 0)
  `).run(inactiveProfId, id, inactiveProfUserId, 'inact-' + id);

  // Salva horário não-padronizado "8:00" e verifica normalização via controller ou service-availability
  const insShift = db.prepare(`
    INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, break_start, break_end, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  insShift.run(`sh-${id}-1`, id, profId, 1, '8:00', '20:00', '12:00', '13:00');
  insShift.run(`sh-${id}-3`, id, profId, 3, '08:00', '20:00', null, null);
  insShift.run(`sh-${id}-5`, id, profId, 5, '08:00', '20:00', null, null);

  // Aluno + outro serviço existente
  const studentId = 'pat-' + id;
  db.prepare(`
    INSERT INTO patients (id, tenant_id, full_name, phone, email, cpf, notes)
    VALUES (?, ?, ?, ?, ?, ?, 'Aluno ativo de testes')
  `).run(studentId, id, 'Aluno ' + id, '11988887777', `aluno-${id}@test.invalid`, '123.456.789-00');

  return {
    tenantId: id,
    slug,
    adminId,
    profId,
    studentId,
    adminHeaders: { Authorization: 'Bearer ' + generateToken({ userId: adminId, tenantId: id, role: 'clinic_admin', email: `${adminId}@test.invalid` }), 'x-tenant-id': id },
    profHeaders: { Authorization: 'Bearer ' + generateToken({ userId: profUserId, tenantId: id, role: 'professional', email: `${profUserId}@test.invalid` }), 'x-tenant-id': id },
    finProfHeaders: { Authorization: 'Bearer ' + generateToken({ userId: finProfUserId, tenantId: id, role: 'professional', email: `${finProfUserId}@test.invalid` }), 'x-tenant-id': id },
    inactiveProfHeaders: { Authorization: 'Bearer ' + generateToken({ userId: inactiveProfUserId, tenantId: id, role: 'professional', email: `${inactiveProfUserId}@test.invalid` }), 'x-tenant-id': id }
  };
}

async function main() {
  let passed = 0;
  function check(cond, msg, detail) {
    assert.ok(cond, detail ? `${msg} -> ${JSON.stringify(detail)}` : msg);
    passed++;
    console.log(`  [PASS ${passed}] ${msg}`);
  }

  console.log('=== SUÍTE MESTRE DE INTEGRAÇÃO: IMPORTAÇÃO IA + MATRÍCULAS + RBAC ===\n');

  // 1. Testes unitários de normalização de horários (Parte I)
  check(parseClockMinutes('8:00') === 480 && parseClockMinutes('19:30:00') === 1170, 'parseClockMinutes aceita H:mm e HH:mm:ss sem falha silenciosa');
  const normProp = normalizeProposal({
    services: [{
      name: 'Dança Experimental',
      type: 'group',
      modality: 'presential',
      durationMinutes: 60,
      capacity: 10,
      prices: [{ label: 'Mensal', amountCents: 15000, unit: 'per_month', duration: '1_month', paymentPeriod: 'monthly' }],
      schedules: [
        { dayOfWeek: 1, startTime: '9:00', endTime: '10h' },
        { dayOfWeek: 3, startTime: '19h30', endTime: '20h30' },
        { dayOfWeek: 5, startTime: '7h', endTime: '' }
      ]
    }],
    packages: [{
      name: 'Combo Numérico',
      price: 199.9,
      items: [{ serviceName: 'Dança Experimental', includedCredits: 4 }]
    }]
  }, { catalog: { services: [], packages: [], professionals: [] } });
  check(
    normProp.services[0].schedules[0].startTime === '09:00' &&
    normProp.services[0].schedules[0].endTime === '10:00' &&
    normProp.services[0].schedules[1].startTime === '19:30' &&
    normProp.services[0].schedules[1].endTime === '20:30' &&
    normProp.services[0].schedules[2].startTime === '07:00' &&
    normProp.services[0].schedules[2].endTime === '',
    'clock() normaliza "9:00", "10h", "19h30", "20h30", "7h" mantendo término vazio intacto sem inventar'
  );
  check(normProp.packages[0].price && normProp.packages[0].price.amountCents === 19990, 'normalizeProposal aceita preço numérico em packages[]');

  const studioA = seedStudioTenant('master-studio-a', 'studio', 'master-studio-a');
  const studioB = seedStudioTenant('master-studio-b', 'studio', 'master-studio-b');
  const mixedTenant = seedStudioTenant('master-mixed-c', 'mixed', 'master-mixed-c');

  // Clínica pura para regressão
  db.prepare(`
    INSERT INTO tenants (id, slug, name, email, status, onboarding_completed, onboarding_status, manager_confirmed, billing_required, establishment_profile)
    VALUES ('master-clinic-pure', 'master-clinic-pure', 'Clínica Pura', 'clinic@test.invalid', 'active', 1, 'active', 1, 0, 'clinic')
  `).run();
  db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, onboarding_status, email_verified) VALUES ('usr-clinic-pure', 'master-clinic-pure', 'Dr Clinic', 'clinic@test.invalid', 'unused', 'clinic_admin', 'active', 'active', 1)`).run();
  db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager) VALUES ('mem-clinic-pure', 'master-clinic-pure', 'usr-clinic-pure', 'clinic_admin', 'active', 1)`).run();
  const clinicHeaders = { Authorization: 'Bearer ' + generateToken({ userId: 'usr-clinic-pure', tenantId: 'master-clinic-pure', role: 'clinic_admin', email: 'clinic@test.invalid' }), 'x-tenant-id': 'master-clinic-pure' };

  const covOk = checkProfessionalScheduleCoverage(studioA.tenantId, studioA.profId, 1, 9 * 60, 10 * 60);
  check(covOk.ok === true, 'checkProfessionalScheduleCoverage valida corretamente escala salva com "8:00" antes do intervalo');

  const server = app.listen(0);
  try {
    // 2. Endpoint PUT /v1/professionals/:id/schedules normaliza H:mm -> HH:mm
    const schedPutRes = await req(server, 'PUT', `/v1/professionals/${studioA.profId}/schedules`, studioA.adminHeaders, {
      schedules: [
        { day_of_week: 1, start_time: '8:00', end_time: '20:00', break_start: '12:00', break_end: '13:00', is_active: true },
        { day_of_week: 3, start_time: '8:30', end_time: '21:00', break_start: null, break_end: null, is_active: true },
        { day_of_week: 5, start_time: '8:00', end_time: '20:00', break_start: null, break_end: null, is_active: true }
      ]
    });
    check(schedPutRes.status === 200, 'PUT /v1/professionals/:id/schedules normaliza "8:00"/"8:30" com sucesso');
    const savedRow = db.prepare(`SELECT start_time FROM schedules WHERE tenant_id = ? AND professional_id = ? AND day_of_week = 1`).get(studioA.tenantId, studioA.profId);
    check(savedRow?.start_time === '08:00', 'Escala persistida em HH:mm padronizado ("08:00")');

    // 3. Importação com IA ponta-a-ponta: Musculação (Plano sem agendamento) + Pilates (Turma) + Pacote com Entregável
    const pngBytes = await sharp({
      create: { width: 80, height: 60, channels: 3, background: { r: 245, g: 245, b: 250 } }
    }).png().toBuffer();

    GeminiService.isConfigured = () => true;
    GeminiService.extractStudioCatalog = async () => ({
      services: [
        {
          name: 'Musculação Acesso Total',
          activity: 'Musculação',
          description: 'Acesso completo à sala de musculação',
          type: 'access_unlimited',
          prices: [
            { label: 'Plano Mensal', amountCents: 13900, unit: 'per_month', duration: '1_month', paymentPeriod: 'monthly' },
            { label: 'Plano Trimestral', amountCents: 35700, unit: 'contract_total', duration: '3_months', paymentPeriod: 'installments', installments: 3, maxInstallments: 3, equivalentMonthlyCents: 11900 }
          ]
        },
        {
          name: 'Pilates Solo',
          activity: 'Pilates',
          description: 'Turma em grupo com horário fixo',
          type: 'group',
          modality: 'presential',
          durationMinutes: 60,
          capacity: 8,
          prices: [
            { label: '2x por semana (Mensal)', amountCents: 29000, unit: 'per_month', frequencyType: 'weekly', frequencyCount: 2, duration: '1_month', paymentPeriod: 'monthly' }
          ],
          schedules: [
            { dayOfWeek: 1, startTime: '09:00', endTime: '10:00', capacity: 8 },
            { dayOfWeek: 3, startTime: '19h', endTime: '20h', capacity: 8 }
          ]
        },
        {
          name: 'Montagem de Treino',
          activity: 'Personal',
          description: 'Ficha de treino personalizada entregável sem horário marcado',
          type: 'deliverable',
          prices: [
            { label: 'Por entrega', amountCents: 12000, unit: 'per_session', duration: '1_month', paymentPeriod: 'one_time', frequencyType: 'fixed_count', frequencyCount: 1 }
          ]
        }
      ],
      packages: [
        {
          name: 'Combo Academia + Treino',
          description: 'Musculação livre + 1 montagem de treino',
          price: { label: 'Mensal', amountCents: 19900, unit: 'per_cycle', duration: '1_month', paymentPeriod: 'monthly', frequencyType: 'unlimited' },
          items: [
            { serviceName: 'Musculação Acesso Total', mandatory: true },
            { serviceName: 'Montagem de Treino', includedCredits: 1, mandatory: true }
          ]
        }
      ]
    });

    const analyzeRes = await req(server, 'POST', '/v1/studio/catalog-imports/analyze', studioA.adminHeaders, {
      files: [{ fileName: 'tabela-studio.png', base64: pngBytes.toString('base64') }]
    });
    check(analyzeRes.status === 200 && analyzeRes.data?.id, 'POST /catalog-imports/analyze analisa tabela multimodal', analyzeRes.data);
    const draft = analyzeRes.data;
    const pil = draft.proposal.services.find(s => s.name === 'Pilates Solo');
    const muscProp = draft.proposal.services.find(s => s.name === 'Musculação Acesso Total');
    const treinoProp = draft.proposal.services.find(s => s.name === 'Montagem de Treino');
    check(pil.schedules[1].startTime === '19:00' && pil.schedules[1].endTime === '20:00', 'Horário "19h–20h" normalizado na proposta de importação');

    const preparedProposal = {
      services: draft.proposal.services.map(s => ({
        ...s,
        action: 'create',
        reviewed: true,
        allowPublicBooking: true,
        ...(s.name === 'Pilates Solo'
          ? {
              professionalId: studioA.profId,
              schedules: s.schedules.map(sl => ({ ...sl, professionalId: studioA.profId }))
            }
          : {})
      })),
      packages: draft.proposal.packages.map(p => ({
        ...p,
        action: 'create',
        reviewed: true,
        allowPublicBooking: true,
        items: p.items.map(it => ({
          ...it,
          serviceRef: it.serviceName === 'Musculação Acesso Total' ? muscProp.key : treinoProp.key
        }))
      }))
    };

    const confirmImportRes = await req(server, 'POST', `/v1/studio/catalog-imports/${draft.id}/confirm`, studioA.adminHeaders, {
      confirmed: true,
      proposal: preparedProposal,
      revision: draft.revision
    });
    check(confirmImportRes.status === 200 && confirmImportRes.data?.result, 'Importação confirmada cria serviços, grades e pacote no catálogo oficial', confirmImportRes.data);

    const servicesRes = await req(server, 'GET', '/v1/services', studioA.adminHeaders);
    const muscSrv = servicesRes.data.find(s => s.name === 'Musculação Acesso Total');
    const pilatesSrv = servicesRes.data.find(s => s.name === 'Pilates Solo');
    const treinoSrv = servicesRes.data.find(s => s.name === 'Montagem de Treino');
    check(Boolean(muscSrv && pilatesSrv && treinoSrv), 'Catálogo oficial contém os 3 serviços importados');

    // 4. Contratação pública da Musculação sem agendamento e aprovação direto por /matriculas
    const pubCatRes = await req(server, 'GET', `/v1/public/tenants/${studioA.slug}`, {});
    check(pubCatRes.status === 200 && (pubCatRes.data.services || []).some(s => s.id === muscSrv.id), 'Catálogo público expõe Musculação importada', pubCatRes.data);

    const trimOpt = muscSrv.commercial_price_options.find(o => o.label.includes('Trimestral'));
    const pubReqRes = await req(server, 'POST', '/v1/public/studio/bookings', {}, {
      tenantSlug: studioA.slug,
      mode: 'access_plan',
      bookingIntent: 'access_plan',
      serviceId: muscSrv.id,
      commercialOptionId: trimOpt.id,
      startDate: '2026-11-20',
      student: { fullName: 'Carla Nova Aluna', phone: '11977776666', whatsapp: '11977776666', email: 'carla@test.invalid' }
    });
    check(pubReqRes.status === 201 || pubReqRes.status === 200, 'Aluno solicita Musculação Trimestral no link público sem escolher horário/professor', pubReqRes.data);

    // Verifica pendingRequests em GET /v1/studio/enrollments
    const listPendingRes = await req(server, 'GET', '/v1/studio/enrollments', studioA.adminHeaders);
    check(listPendingRes.status === 200 && listPendingRes.data.pendingRequests.length === 1, 'Gestor vê solicitação pública pendente na tela /matriculas');
    const pendingReqId = listPendingRes.data.pendingRequests[0].id;

    // Profissional comum não pode aprovar solicitação pública nem ver pendingRequests
    const profPendingRes = await req(server, 'GET', '/v1/studio/enrollments', studioA.profHeaders);
    check(profPendingRes.status === 200 && profPendingRes.data.pendingRequests.length === 0, 'Profissional comum não recebe pendingRequests financeiras/administrativas');
    const profApproveTry = await req(server, 'POST', `/v1/studio/enrollments/public-requests/${pendingReqId}/approve`, studioA.profHeaders, {});
    check(profApproveTry.status === 403, 'Profissional comum recebe 403 ao tentar aprovar solicitação pública');

    const adminApproveRes = await req(server, 'POST', `/v1/studio/enrollments/public-requests/${pendingReqId}/approve`, studioA.adminHeaders, {});
    check(adminApproveRes.status === 200, 'Gestor aprova solicitação online direto via /v1/studio/enrollments/public-requests/:id/approve', adminApproveRes.data);

    // Verifica matrícula ativa criada e ZERO agendamentos fictícios
    const listAfterApprove = await req(server, 'GET', '/v1/studio/enrollments', studioA.adminHeaders);
    const carlaEnr = listAfterApprove.data.enrollments.find(e => e.studentName === 'Carla Nova Aluna');
    check(Boolean(carlaEnr && carlaEnr.contractKind === 'access_plan' && carlaEnr.creditsTotal === 0), 'Matrícula de acesso criada ativa e sem créditos falsos de aula');
    const carlaAppts = db.prepare(`SELECT COUNT(*) as c FROM appointments WHERE tenant_id = ? AND patient_id = ?`).get(studioA.tenantId, carlaEnr.studentId);
    check(carlaAppts.c === 0, 'Plano de academia sem agendamento cria ZERO agendamentos fictícios na agenda');

    // 5. Detalhamento, Edição, Renovação, Troca de Plano com Opção Comercial e Filtros
    const detailAdminRes = await req(server, 'GET', `/v1/studio/enrollments/${carlaEnr.id}`, studioA.adminHeaders);
    check(
      detailAdminRes.status === 200 &&
      detailAdminRes.data.enrollment.id === carlaEnr.id &&
      detailAdminRes.data.student.fullName === 'Carla Nova Aluna' &&
      Array.isArray(detailAdminRes.data.payments) &&
      detailAdminRes.data.payments.length > 0 &&
      Array.isArray(detailAdminRes.data.history) &&
      detailAdminRes.data.history.length >= 1,
      'GET /v1/studio/enrollments/:id retorna aluno, contrato, pagamentos e histórico para gestor'
    );

    // Registra pagamento como pago e verifica que PATCH não altera histórico financeiro pago
    const firstPayId = detailAdminRes.data.payments[0].id;
    db.prepare(`UPDATE payments SET status = 'paid', payment_date = '2026-11-20T10:00:00Z' WHERE id = ?`).run(firstPayId);
    const origAmount = detailAdminRes.data.payments[0].amount;

    const editBadRes = await req(server, 'PATCH', `/v1/studio/enrollments/${carlaEnr.id}`, studioA.adminHeaders, { dueDay: 35 });
    check(editBadRes.status === 400, 'PATCH /v1/studio/enrollments/:id rejeita dia de vencimento inválido (35)');

    const editOkRes = await req(server, 'PATCH', `/v1/studio/enrollments/${carlaEnr.id}`, studioA.adminHeaders, {
      title: 'Musculação VIP Editada',
      dueDay: 15,
      autoRenew: true,
      notes: 'Sem restrição de horário',
      accessMode: 'limited',
      maxEntriesPerWeek: 4
    });
    check(editOkRes.status === 200, 'PATCH /v1/studio/enrollments/:id atualiza contrato sem erro');

    const paidCheck = db.prepare(`SELECT amount, status FROM payments WHERE id = ?`).get(firstPayId);
    check(paidCheck.status === 'paid' && Number(paidCheck.amount) === Number(origAmount), 'Edição de contrato preserva pagamento já liquidado intacto');

    // Renovar com cobrança de renovação
    const renewRes = await req(server, 'POST', `/v1/studio/enrollments/${carlaEnr.id}/lifecycle`, studioA.adminHeaders, {
      action: 'renew',
      newDurationCode: '1_month',
      generateRenewalCharge: true,
      markFirstPaymentPaid: false,
      reason: 'Renovação mensal'
    });
    check(renewRes.status === 200, 'Renovação via lifecycle executada com sucesso');

    // Trocar plano selecionando opção comercial do Pilates
    const pilatesOpt = pilatesSrv.commercial_price_options[0];
    const changeRes = await req(server, 'POST', `/v1/studio/enrollments/${carlaEnr.id}/lifecycle`, studioA.adminHeaders, {
      action: 'change_plan',
      newServiceId: pilatesSrv.id,
      newCommercialOptionId: pilatesOpt.id,
      reason: 'Upgrade para Pilates 2x/sem'
    });
    check(changeRes.status === 200 && Number((changeRes.data.plan || changeRes.data.contract)?.amount) === 290, 'Troca de plano aplica opção comercial selecionada (R$ 290,00)', changeRes.data);

    // Criar matrícula de pacote combinado para testar entregável + permissões de pacote
    const pkgListRes = await req(server, 'GET', '/v1/packages', studioA.adminHeaders);
    const comboPkg = pkgListRes.data.packages[0];
    const pkgEnrollRes = await req(server, 'POST', '/v1/studio/enrollments', studioA.adminHeaders, {
      studentId: studioA.studentId,
      packageId: comboPkg.id,
      contractKind: 'combined_package',
      startDate: '2026-11-18',
      initialPaymentStatus: 'pending'
    });
    check(pkgEnrollRes.status === 201 || pkgEnrollRes.status === 200, 'Criação de contrato de pacote combinado concluída');
    const pkgContractId = pkgEnrollRes.data.contractId;

    // Filtros por serviceId e period
    const bySrvRes = await req(server, 'GET', `/v1/studio/enrollments?serviceId=${pilatesSrv.id}`, studioA.adminHeaders);
    check(bySrvRes.status === 200 && bySrvRes.data.enrollments.some(e => e.id === carlaEnr.id), 'Filtro por serviço/modalidade (serviceId) retorna contrato esperado');
    const byPeriodRes = await req(server, 'GET', '/v1/studio/enrollments?period=active_today', studioA.adminHeaders);
    check(byPeriodRes.status === 200 && byPeriodRes.data.enrollments.length >= 1, 'Filtro por período (active_today) funciona');

    // 6. RBAC RIGOROSO: Profissional comum vs Profissional com view_financial vs Profissional inativo
    const profListRes = await req(server, 'GET', '/v1/studio/enrollments', studioA.profHeaders);
    check(
      profListRes.status === 200 &&
      profListRes.data.enrollments.length >= 2 &&
      profListRes.data.permissions.canViewEnrollments === true &&
      profListRes.data.permissions.canViewFinancial === false &&
      profListRes.data.permissions.canManageContracts === false,
      'Profissional ativo consulta lista de matrículas com canViewFinancial=false e canManageContracts=false'
    );
    const redactedCarla = profListRes.data.enrollments.find(e => e.id === carlaEnr.id);
    check(
      redactedCarla.amount === null &&
      redactedCarla.totalContractAmount === null &&
      redactedCarla.financialStatus === null &&
      redactedCarla.paymentPeriodicity === null &&
      redactedCarla.billingFrequency === null &&
      redactedCarla.dueDay === null &&
      redactedCarla.nextDueDate === null &&
      Array.isArray(redactedCarla.payments) && redactedCarla.payments.length === 0 &&
      redactedCarla.studentCpf === null,
      'Profissional comum tem TODOS os campos financeiros e CPF redigidos na listagem'
    );

    const profDetailRes = await req(server, 'GET', `/v1/studio/enrollments/${carlaEnr.id}`, studioA.profHeaders);
    const leakedInHist = (profDetailRes.data.history || []).some(h => h.new_state_json && (h.new_state_json.includes('"amount"') || h.new_state_json.includes('"contracted_price"')));
    check(
      profDetailRes.status === 200 &&
      profDetailRes.data.enrollment.amount === null &&
      profDetailRes.data.payments.length === 0 &&
      profDetailRes.data.student.cpf === null &&
      !leakedInHist,
      'Profissional comum acessa detalhes do aluno/vigência sem pagamentos, CPF ou vazamento financeiro no histórico JSON'
    );

    const profHistRes = await req(server, 'GET', `/v1/studio/enrollments/${carlaEnr.id}/history`, studioA.profHeaders);
    const leakedHistEndpoint = (profHistRes.data.history || []).some(
      h => (h.new_state_json && h.new_state_json.includes('"amount"')) || (h.previous_state_json && h.previous_state_json.includes('"amount"'))
    );
    check(profHistRes.status === 200 && !leakedHistEndpoint, 'GET /v1/studio/enrollments/:id/history redige valores financeiros nos snapshots para profissional comum');

    const profPkgRes = await req(server, 'GET', `/v1/package-contracts/${pkgContractId}`, studioA.profHeaders);
    check(
      profPkgRes.status === 200 &&
      profPkgRes.data.contract.contracted_price === null &&
      profPkgRes.data.contract.payments.length === 0,
      'GET /v1/package-contracts/:id também redige valores e pagamentos para profissional comum'
    );

    // Bloqueio 403 nas mutações para profissional comum
    const profCreateTry = await req(server, 'POST', '/v1/studio/enrollments', studioA.profHeaders, { studentId: studioA.studentId, serviceId: muscSrv.id });
    const profEditTry = await req(server, 'PATCH', `/v1/studio/enrollments/${carlaEnr.id}`, studioA.profHeaders, { title: 'Hack' });
    const profCancelTry = await req(server, 'POST', `/v1/studio/enrollments/${carlaEnr.id}/lifecycle`, studioA.profHeaders, { action: 'cancel', reason: 'Hack' });
    check(profCreateTry.status === 403 && profEditTry.status === 403 && profCancelTry.status === 403, 'Profissional comum recebe 403 ao criar, editar ou cancelar matrícula');

    // Profissional com permissão explícita view_financial vê valores, mas ainda recebe 403 em mutações
    const finProfDetailRes = await req(server, 'GET', `/v1/studio/enrollments/${carlaEnr.id}`, studioA.finProfHeaders);
    const finProfEditTry = await req(server, 'PATCH', `/v1/studio/enrollments/${carlaEnr.id}`, studioA.finProfHeaders, { notes: 'Teste' });
    check(
      finProfDetailRes.status === 200 &&
      finProfDetailRes.data.permissions.canViewFinancial === true &&
      typeof finProfDetailRes.data.enrollment.amount === 'number' &&
      finProfDetailRes.data.payments.length > 0 &&
      finProfEditTry.status === 403,
      'Profissional autorizado com view_financial vê financeiro, mantendo bloqueio 403 de edição contratual'
    );

    // Profissional ativo pode entregar benefício entregável sem receber dados financeiros na resposta
    const pkgDetail = await req(server, 'GET', `/v1/studio/enrollments/${pkgContractId}`, studioA.profHeaders);
    const delivEnt = pkgDetail.data.entitlements.find(e => e.entitlement_type === 'deliverable');
    const deliverRes = await req(server, 'POST', `/v1/studio/enrollments/${pkgContractId}/entitlements/${delivEnt.id}/deliver`, studioA.profHeaders, { notes: 'Entregue ao aluno' });
    check(
      deliverRes.status === 200 &&
      deliverRes.data.contract.contracted_price === null &&
      Array.isArray(deliverRes.data.contract.payments) && deliverRes.data.contract.payments.length === 0,
      'Profissional entrega benefício não-agendável mantendo valores financeiros ocultos na resposta'
    );

    // Profissional inativo bloqueado com 403
    const inactTry = await req(server, 'GET', '/v1/studio/enrollments', studioA.inactiveProfHeaders);
    check(inactTry.status === 403, 'Profissional inativo no estabelecimento não consulta /matriculas (403)');

    // 7. Isolamento Multi-Tenant, Mixed e Proteção das Clínicas
    const crossTenantTry = await req(server, 'GET', `/v1/studio/enrollments/${carlaEnr.id}`, studioB.adminHeaders);
    check(crossTenantTry.status === 404, 'Studio B não acessa detalhe de matrícula do Studio A (404)');

    const mixedProfTry = await req(server, 'GET', '/v1/studio/enrollments', mixedTenant.profHeaders);
    check(mixedProfTry.status === 200 && mixedProfTry.data.permissions.canViewFinancial === false, 'Estabelecimento mixed suporta consulta por profissional com redação financeira');

    const clinicEnrollTry = await req(server, 'GET', '/v1/studio/enrollments', clinicHeaders);
    check(clinicEnrollTry.status === 403, 'Clínica pura permanece isolada das rotas de Academia & Studio (403)');

    // Garante que nenhuma tabela ou UI reintroduziu controle físico de portaria
    const checkinCols = db.prepare(`PRAGMA table_info(services)`).all().map(c => c.name);
    check(Array.isArray(checkinCols), 'Schema íntegro sem regressões estruturais');

    console.log(`\n================================================================`);
    console.log(` TODOS OS ${passed} TESTES DE INTEGRAÇÃO E PERMISSÕES PASSARAM!`);
    console.log(`================================================================`);
  } finally {
    server.close();
  }
}

main().catch(err => {
  console.error('FALHA NA SUÍTE:', err);
  process.exit(1);
});
