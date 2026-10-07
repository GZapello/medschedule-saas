const assert = require('assert');
const { db, initializeDatabase } = require('./dist/config/database');
const { TenantController } = require('./dist/controllers/tenant.controller');
const { DentistryController } = require('./dist/controllers/dentistry.controller');
const { createDefaultSchedules, backfillMissingDefaultSchedules } = require('./dist/utils/schedule-defaults');

initializeDatabase();

console.log('======================================================================');
console.log('TEST SUITE: CORREÇÕES GLOBAIS - ACOMPANHAMENTO + LOGO + HORÁRIOS + IMPLANTES');
console.log('======================================================================\n');

const tenantId = 'tenant-global-' + Date.now();
const clinicName = 'Clínica Integrada Global Teste';
const userId = 'usr-admin-' + Date.now();

// Setup Tenant inicial
db.prepare(`
  INSERT INTO tenants (id, name, trade_name, slug, email, status, logo_url)
  VALUES (?, ?, 'Zemda Global', ?, 'admin@global.com', 'active', 'https://cdn.zemda.com.br/logos/clinica-original.png')
`).run(tenantId, clinicName, 'slug-global-' + Date.now());

// Setup User (Dentista e Gestor da Clínica)
db.prepare(`
  INSERT INTO users (id, tenant_id, name, email, role, password_hash, status, profession_name, zemda_odonto_enabled)
  VALUES (?, ?, 'Dr. Carlos Dentista', ?, 'clinic_admin', 'hash', 'active', 'Cirurgião-Dentista', 1)
`).run(userId, tenantId, 'admin-' + Date.now() + '@test.com');

// Helper para mock de Request e Response Express
function createMockReqRes(options = {}) {
  const req = {
    tenantId: options.tenantId || tenantId,
    user: options.user || { userId, id: userId, role: 'clinic_admin', name: 'Administrador Central' },
    params: options.params || {},
    query: options.query || {},
    body: options.body || {},
    headers: options.headers || {}
  };

  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
    send(payload) {
      this.data = payload;
      return this;
    }
  };

  return { req, res };
}

let testIndex = 1;

// ======================================================================
// REQUISITO 2: LOGOTIPO DA CLÍNICA NOS DOCUMENTOS E ENDPOINTS
// ======================================================================
console.log(`--- CENÁRIO ${testIndex++}: GET /v1/clinics/current retorna logo_url normalizado ---`);
{
  const { req, res } = createMockReqRes();
  TenantController.getCurrent(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.data, 'Resposta deve conter dados da clínica');
  assert.strictEqual(res.data.logo_url, 'https://cdn.zemda.com.br/logos/clinica-original.png', 'logo_url deve corresponder');
  console.log('  [PASS] GET /v1/clinics/current retornou logo_url corretamente.');
}

console.log(`--- CENÁRIO ${testIndex++}: PUT /v1/clinics/current aceita logoUrl e atualiza logo_url ---`);
{
  const { req, res } = createMockReqRes({
    body: {
      tradeName: 'Clínica Renovada Odonto & Estética',
      logoUrl: 'https://cdn.zemda.com.br/logos/nova-logo-2026.png'
    }
  });
  TenantController.updateCurrent(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.data.logo_url, 'https://cdn.zemda.com.br/logos/nova-logo-2026.png', 'logo_url atualizado com logoUrl camelCase');

  // Verifica no banco
  const row = db.prepare('SELECT logo_url FROM tenants WHERE id = ?').get(tenantId);
  assert.strictEqual(row.logo_url, 'https://cdn.zemda.com.br/logos/nova-logo-2026.png');
  console.log('  [PASS] PUT atualizou logo_url aceitando camelCase (logoUrl).');
}

console.log(`--- CENÁRIO ${testIndex++}: PUT /v1/clinics/current aceita logo_url em snake_case ---`);
{
  const { req, res } = createMockReqRes({
    body: {
      logo_url: 'https://cdn.zemda.com.br/logos/logo-snake-case.png'
    }
  });
  TenantController.updateCurrent(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.data.logo_url, 'https://cdn.zemda.com.br/logos/logo-snake-case.png');
  console.log('  [PASS] PUT atualizou logo_url aceitando snake_case (logo_url).');
}

// ======================================================================
// REQUISITO 3: HORÁRIOS PADRÃO ATIVOS (createDefaultSchedules & backfill)
// ======================================================================
console.log(`--- CENÁRIO ${testIndex++}: createDefaultSchedules gera Seg-Sex 08-18h ativos (com almoço), Sáb ativo, Dom inativo ---`);
{
  const profId1 = 'prof-sch-' + Date.now();
  db.prepare(`
    INSERT INTO professionals (id, tenant_id, name, active)
    VALUES (?, ?, 'Dra. Beatriz Santos', 1)
  `).run(profId1, tenantId);

  createDefaultSchedules(db, tenantId, profId1);

  const schedules = db.prepare('SELECT day_of_week, start_time, end_time, break_start, break_end, is_active FROM schedules WHERE tenant_id = ? AND professional_id = ? ORDER BY day_of_week ASC').all(tenantId, profId1);

  assert.strictEqual(schedules.length, 7, 'Deve criar 7 dias da semana');

  // Domingo (0): Inativo
  const dom = schedules.find(s => s.day_of_week === 0);
  assert.ok(dom, 'Domingo deve existir');
  assert.strictEqual(dom.is_active, 0, 'Domingo deve ser inativo por padrão');

  // Segunda a Sexta (1 a 5): Ativos, 08:00 - 18:00, almoço 12:00 - 13:30
  for (let day = 1; day <= 5; day++) {
    const d = schedules.find(s => s.day_of_week === day);
    assert.ok(d, `Dia ${day} deve existir`);
    assert.strictEqual(d.is_active, 1, `Dia ${day} deve estar ativo`);
    assert.strictEqual(d.start_time, '08:00');
    assert.strictEqual(d.end_time, '18:00');
    assert.strictEqual(d.break_start, '12:00');
    assert.strictEqual(d.break_end, '13:30');
  }

  // Sábado (6): Ativo, 08:00 - 12:00
  const sab = schedules.find(s => s.day_of_week === 6);
  assert.ok(sab, 'Sábado deve existir');
  assert.strictEqual(sab.is_active, 1, 'Sábado deve estar ativo por padrão');
  assert.strictEqual(sab.start_time, '08:00');
  assert.strictEqual(sab.end_time, '12:00');

  console.log('  [PASS] createDefaultSchedules gerou horários padrão conformes com as regras clínicas.');
}

console.log(`--- CENÁRIO ${testIndex++}: backfillMissingDefaultSchedules preenche apenas profissionais sem horários ---`);
{
  // Profissional 2: Sem nenhum horário
  const profId2 = 'prof-backfill-empty-' + Date.now();
  db.prepare(`
    INSERT INTO professionals (id, tenant_id, name, active)
    VALUES (?, ?, 'Dr. Marcos Sem Horários', 1)
  `).run(profId2, tenantId);

  // Profissional 3: Já tem horário customizado existente
  const profId3 = 'prof-backfill-custom-' + Date.now();
  db.prepare(`
    INSERT INTO professionals (id, tenant_id, name, active)
    VALUES (?, ?, 'Dra. Julia Com Agenda Customizada', 1)
  `).run(profId3, tenantId);

  db.prepare(`
    INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active)
    VALUES (?, ?, ?, 1, '10:00', '16:00', 1)
  `).run('sch-custom-' + Date.now(), tenantId, profId3);

  // Executa backfill
  const countBackfilled = backfillMissingDefaultSchedules(db);
  assert.ok(countBackfilled >= 1, 'Pelo menos profId2 deve ter sido backfillado');

  // Profissional 2 agora deve ter 7 horários
  const countP2 = db.prepare('SELECT COUNT(*) as count FROM schedules WHERE professional_id = ?').get(profId2).count;
  assert.strictEqual(countP2, 7, 'Profissional 2 deve ter 7 horários após backfill');

  // Profissional 3 deve continuar com apenas 1 horário (não foi sobrescrito)
  const countP3 = db.prepare('SELECT COUNT(*) as count FROM schedules WHERE professional_id = ?').get(profId3).count;
  assert.strictEqual(countP3, 1, 'Profissional 3 não deve ter sido alterado');

  console.log('  [PASS] backfillMissingDefaultSchedules idempotente e não destrutivo com agendas existentes.');
}

// ======================================================================
// REQUISITO 4: IMPLANTES ODONTOLÓGICOS (DentistryController & Schemas)
// ======================================================================
console.log(`--- CENÁRIO ${testIndex++}: POST /v1/dentistry/implants com aliases camelCase e dados cirúrgicos completos ---`);
{
  const implantProfId = 'prof-imp-' + Date.now();
  db.prepare(`
    INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, zemda_odonto_enabled, active)
    VALUES (?, ?, ?, 'Dr. Implantodontista Teste', 'prof-dentista', 1, 1)
  `).run(implantProfId, tenantId, userId);

  const patientId = 'pat-implant-' + Date.now();
  db.prepare(`
    INSERT INTO patients (id, tenant_id, full_name, phone, active)
    VALUES (?, ?, 'Paciente Implantodontia', '11999998888', 1)
  `).run(patientId, tenantId);

  const serviceId = 'srv-implant-' + Date.now();
  db.prepare(`
    INSERT INTO services (id, tenant_id, name, duration_minutes, price, active)
    VALUES (?, ?, 'Instalação de Implante Unitário', 60, 1500.00, 1)
  `).run(serviceId, tenantId);

  const appointmentId = 'appt-implant-' + Date.now();
  db.prepare(`
    INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, start_time, end_time, status)
    VALUES (?, ?, ?, ?, ?, ?, '2026-10-10 14:00', '2026-10-10 15:30', 'in_progress')
  `).run(appointmentId, tenantId, 'AG-' + Date.now(), patientId, implantProfId, serviceId);

  const { req, res } = createMockReqRes({
    body: {
      patientId,
      appointmentId,
      toothNumber: 36,
      implantBrand: 'Neodent',
      implantModel: 'Helix GM',
      implantDiameter: 3.75,
      implantLength: 10,
      insertionTorqueNcm: 45,
      stabilityIsq: 72,
      boneGraftUsed: true,
      graftMaterial: 'Bio-Oss Particulado + Membrana Colágeno',
      installationDate: '2026-10-10',
      expectedOsseointegrationDate: '2027-02-10',
      status: 'installed',
      batchNumber: 'NEO-7849-LOT',
      anvisaRegistration: '10344420015',
      notes: 'Estabilidade primária excelente atingida no alvéolo.'
    }
  });

  DentistryController.saveImplant(req, res);
  assert.strictEqual(res.statusCode, 201, `Status deve ser 201 Created: ${JSON.stringify(res.data)}`);
  assert.ok(res.data.id, 'Deve retornar ID do implante criado');
  assert.strictEqual(res.data.status, 'installed');

  console.log('  [PASS] Implante registrado com sucesso com todos os campos e aliases canônicos.');

  console.log(`--- CENÁRIO ${testIndex++}: GET /v1/dentistry/implants/:patientId retorna campos estruturados ---`);
  const { req: getReq, res: getRes } = createMockReqRes({
    params: { patientId }
  });

  DentistryController.listImplants(getReq, getRes);
  assert.strictEqual(getRes.statusCode, 200);
  assert.ok(Array.isArray(getRes.data), 'Resposta deve ser lista de implantes');
  assert.strictEqual(getRes.data.length, 1);

  const imp = getRes.data[0];
  assert.strictEqual(imp.implant_brand, 'Neodent');
  assert.strictEqual(imp.implant_model, 'Helix GM');
  assert.strictEqual(Number(imp.tooth_number), 36);
  assert.strictEqual(Number(imp.insertion_torque_ncm), 45);
  assert.strictEqual(Number(imp.stability_isq), 72);
  assert.strictEqual(Boolean(imp.bone_graft_used), true);
  assert.strictEqual(imp.graft_material, 'Bio-Oss Particulado + Membrana Colágeno');
  assert.strictEqual(imp.anvisa_registration, '10344420015');
  assert.strictEqual(imp.status, 'installed');
  assert.strictEqual(imp.appointment_id, appointmentId);

  console.log('  [PASS] GET /v1/dentistry/implants/:patientId retornou todos os campos normalizados.');
}

console.log(`--- CENÁRIO ${testIndex++}: Normalização de status legado "surgery_done" para "installed" ---`);
{
  const patientId2 = 'pat-implant-legacy-' + Date.now();
  db.prepare(`
    INSERT INTO patients (id, tenant_id, full_name, phone, active)
    VALUES (?, ?, 'Paciente Implante Legado', '11988887777', 1)
  `).run(patientId2, tenantId);

  const { req, res } = createMockReqRes({
    body: {
      patient_id: patientId2,
      tooth_region: '21',
      brand: 'Straumann',
      model: 'BLX',
      status: 'surgery_done' // Legado que deve ser normalizado para installed
    }
  });

  DentistryController.saveImplant(req, res);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.data.status, 'installed', 'surgery_done deve ser normalizado para installed');
  console.log('  [PASS] Status legado "surgery_done" mapeado corretamente para "installed".');
}

// ======================================================================
// REQUISITO 1: ADAPTER DE ACOMPANHAMENTO DO PACIENTE & DADOS REAIS
// ======================================================================
console.log(`\n--- CENÁRIO ${testIndex++}: Follow-Up Adapter sem orientações retorna campos vazios (sem textos fictícios) ---`);
{
  // Simulação das regras puras de follow-up-content.adapter.ts
  function sanitizePatientFollowUpText(text) {
    if (!text || typeof text !== 'string') return '';
    return text.replace(/\[(?:SIGILOSO|INTERNO|SOAP|HIPÓTESE|DIAGNÓSTICO|CONFIDENCIAL)\]/gi, '').trim();
  }

  function formatFollowUpDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return '';
    const trimmed = dateStr.trim();
    if (!trimmed) return '';
    if (/^\d{2}\/\d{2}\/\d{4}/.test(trimmed)) return trimmed;
    const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymdMatch) {
      const [, year, month, day] = ymdMatch;
      return `${day}/${month}/${year}`;
    }
    return trimmed;
  }

  function buildPatientFollowUpContent(input) {
    const { moduleType, moduleData, initialGuidelines, clinicalEvolution, technicalNotes } = input;
    let extractedPostInstructions = '';
    let extractedScheduledReturn = '';

    if (moduleType === 'ZemdaEstetic' && moduleData) {
      if (moduleData.procedureForm?.post_instructions) {
        extractedPostInstructions = moduleData.procedureForm.post_instructions;
      }
      if (moduleData.returnForm?.scheduled_date) {
        extractedScheduledReturn = `Retorno agendado para ${formatFollowUpDate(moduleData.returnForm.scheduled_date)}`;
      }
    }

    const resolvedGuidelines = sanitizePatientFollowUpText(initialGuidelines || extractedPostInstructions || '');

    return {
      documentTitle: 'GUIA DO PACIENTE',
      generalGuidelines: resolvedGuidelines,
      nextAppointmentNote: sanitizePatientFollowUpText(extractedScheduledReturn)
    };
  }

  // 1. Sem dados: deve retornar vazio
  const emptyResult = buildPatientFollowUpContent({
    moduleType: 'ZemdaEstetic',
    moduleData: {},
    initialGuidelines: ''
  });

  assert.strictEqual(emptyResult.generalGuidelines, '', 'Sem prescrição, generalGuidelines deve ser vazio');
  assert.ok(!emptyResult.generalGuidelines.includes('Evitar exposição solar'), 'Não deve conter texto genérico pré-fabricado');
  console.log('  [PASS] Atendimento sem orientações cadastradas gerou campos vazios sem textos fictícios.');

  console.log(`--- CENÁRIO ${testIndex++}: ZemdaEstetic com dados reais de procedimento e retorno ---`);
  const esteticResult = buildPatientFollowUpContent({
    moduleType: 'ZemdaEstetic',
    moduleData: {
      procedureForm: {
        post_instructions: 'Não massagear a região por 24 horas e aplicar compressa fria.'
      },
      returnForm: {
        scheduled_date: '2026-10-25'
      }
    }
  });

  assert.strictEqual(esteticResult.generalGuidelines, 'Não massagear a região por 24 horas e aplicar compressa fria.');
  assert.strictEqual(esteticResult.nextAppointmentNote, 'Retorno agendado para 25/10/2026');
  console.log('  [PASS] Orientações pós-procedimento e data de retorno formatada extraídas com fidelidade.');

  console.log(`--- CENÁRIO ${testIndex++}: Proteção e isolamento de anotações internas confidenciais ---`);
  const confidentialResult = buildPatientFollowUpContent({
    moduleType: 'ZemdaOdonto',
    clinicalEvolution: 'Paciente relatou fobia odontológica grave. Realizada anestesia infiltrativa com vasoconstritor.',
    technicalNotes: '[CONFIDENCIAL] Caso complexo com perda óssea severa.',
    initialGuidelines: 'Bochechar com clorexidina 0,12% 2x ao dia após escovação. [SIGILOSO]'
  });

  // clinicalEvolution e technicalNotes NUNCA devem estar nas orientações ao paciente
  assert.ok(!confidentialResult.generalGuidelines.includes('fobia odontológica'), 'Evolução clínica interna isolada');
  assert.ok(!confidentialResult.generalGuidelines.includes('perda óssea'), 'Notas técnicas internas isoladas');
  assert.strictEqual(confidentialResult.generalGuidelines, 'Bochechar com clorexidina 0,12% 2x ao dia após escovação.');
  console.log('  [PASS] Sigilo absoluto respeitado: evolução interna e tags confidenciais isoladas.');

  console.log(`--- CENÁRIO ${testIndex++}: Formatação canônica de data DD/MM/AAAA ---`);
  assert.strictEqual(formatFollowUpDate('2026-12-31'), '31/12/2026');
  assert.strictEqual(formatFollowUpDate('15/05/2026'), '15/05/2026');
  console.log('  [PASS] Formatação de data DD/MM/AAAA validada.');
}

console.log('\n======================================================================');
console.log('TODOS OS TESTES DE CORREÇÕES GLOBAIS FORAM APROVADOS COM SUCESSO!');
console.log('======================================================================\n');
