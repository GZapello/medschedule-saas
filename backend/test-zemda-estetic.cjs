const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');
const http = require('http');

process.env.JWT_SECRET = 'test-secret-estetic-2026';
process.env.PORT = '4099';
process.env.NODE_ENV = 'test';

const { initializeDatabase, db } = require('./dist/config/database');
const { CapabilityService } = require('./dist/services/capability.service');
const { resolveCanonicalProfession } = require('./dist/utils/profession-module');

initializeDatabase();

console.log('--- TESTE 1: Resolução Canônica de Esteticista e Cirurgião-Dentista ---');

// 1. Esteticista -> ZemdaEstetic
const estRes = resolveCanonicalProfession({ id: 'prof-esteticista', name: 'Esteticista' });
assert.strictEqual(estRes.commercialModule, 'ZemdaEstetic', 'Esteticista deve ter módulo comercial ZemdaEstetic');
assert.strictEqual(estRes.flags.zemda_estetic_enabled, 1, 'zemda_estetic_enabled deve ser 1');
assert.strictEqual(estRes.canonicalId, 'prof-esteticista', 'canonicalId deve ser prof-esteticista');
console.log('  [PASS] Esteticista mapeado corretamente para ZemdaEstetic.');

// 2. Cirurgião-Dentista -> ZemdaOdonto (preservado)
const dentRes = resolveCanonicalProfession({ id: 'prof-dentista', name: 'Cirurgião-Dentista' });
assert.strictEqual(dentRes.commercialModule, 'ZemdaOdonto', 'Dentista deve manter ZemdaOdonto');
assert.strictEqual(dentRes.flags.zemda_odonto_enabled, 1, 'zemda_odonto_enabled deve ser 1');
assert.strictEqual(dentRes.flags.zemda_estetic_enabled, 0, 'Dentista sem HOF não tem zemda_estetic_enabled por padrão');
console.log('  [PASS] Cirurgião-Dentista preserva estritamente ZemdaOdonto.');

console.log('--- TESTE 2: Capabilities e Áreas no Banco de Dados ---');

// Capabilities Estéticas
const estCaps = db.prepare("SELECT count(id) as cnt FROM capabilities WHERE category = 'ESTETIC'").get();
assert(estCaps.cnt >= 14, `Deve conter ao menos 14 capacidades estéticas (encontradas: ${estCaps.cnt})`);
console.log(`  [PASS] ${estCaps.cnt} capacidades estéticas ativas no catálogo.`);

// Catálogo de Procedimentos Padrão
const procCatalog = db.prepare("SELECT count(id) as cnt FROM estetic_procedure_catalog WHERE tenant_id IS NULL").get();
assert(procCatalog.cnt >= 15, `Deve conter ao menos 15 procedimentos padrão no catálogo (encontrados: ${procCatalog.cnt})`);
console.log(`  [PASS] ${procCatalog.cnt} procedimentos clínicos semeados no catálogo padrão.`);

// Área Capilar cadastrada
const capilarArea = db.prepare("SELECT id, name FROM practice_areas WHERE id = 'pa-estet-capilar'").get();
assert(capilarArea, 'Área pa-estet-capilar deve existir no banco');
console.log('  [PASS] Área pa-estet-capilar verificada.');

console.log('--- TESTE 3: Regras de Capabilities de Esteticista e Dentista ---');

// Tenant e Usuários de Teste
const t1 = 'tenant-estet-test-' + Date.now();
const t2 = 'tenant-estet-other-' + Date.now();

db.prepare("INSERT INTO tenants (id, name, trade_name, slug, email) VALUES (?, 'Clínica Estética Alpha', 'Alpha Estética', ?, ?)").run(t1, 'alpha-' + Date.now(), 'alpha@test.com');
db.prepare("INSERT INTO tenants (id, name, trade_name, slug, email) VALUES (?, 'Clínica Beta', 'Beta Saúde', ?, ?)").run(t2, 'beta-' + Date.now(), 'beta@test.com');

const userEstetId = 'usr-estet-' + Date.now();
const profEstetId = 'pro-estet-' + Date.now();
const userDentistId = 'usr-dent-' + Date.now();
const profDentistId = 'pro-dent-' + Date.now();
const userDentistNoHofId = 'usr-dent-nohof-' + Date.now();
const profDentistNoHofId = 'pro-dent-nohof-' + Date.now();
const patientId1 = 'pat-estet-1-' + Date.now();
const patientId2 = 'pat-estet-2-' + Date.now();

const emailEstet = 'julia_' + Date.now() + '@estetica.com';
const emailDent = 'marcos_' + Date.now() + '@hof.com';
const emailNoHof = 'carlos_' + Date.now() + '@odonto.com';

// Usuário Esteticista com Facial e Corporal
db.prepare(`
  INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, profession_id, profession_name, zemda_estetic_enabled)
  VALUES (?, ?, 'Dra. Julia Esteticista', ?, 'hash', 'professional', 'active', 'prof-esteticista', 'Esteticista', 1)
`).run(userEstetId, t1, emailEstet);

db.prepare(`
  INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, profession_name, active, zemda_estetic_enabled)
  VALUES (?, ?, ?, 'Dra. Julia Esteticista', 'prof-esteticista', 'Esteticista', 1, 1)
`).run(profEstetId, t1, userEstetId);

db.prepare(`
  INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json, zemda_estetic_enabled)
  VALUES (?, ?, ?, 'professional', 'active', 0, '["access_zemda_estetic"]', 1)
`).run('cu-' + userEstetId, t1, userEstetId);

// Seleciona áreas Facial e Corporal
CapabilityService.setUserPracticeAreas(userEstetId, t1, ['pa-estet-facial', 'pa-estet-corporal']);
const estetCapsComputed = CapabilityService.computeUserCapabilities(userEstetId, t1);

assert(estetCapsComputed.activeCapabilities.includes('ESTETIC_FACIAL'), 'Esteticista deve ter ESTETIC_FACIAL');
assert(estetCapsComputed.activeCapabilities.includes('ESTETIC_BODY'), 'Esteticista deve ter ESTETIC_BODY');
assert(estetCapsComputed.activeCapabilities.includes('ESTETIC_360_FACE'), 'Esteticista deve ter ESTETIC_360_FACE');
assert(estetCapsComputed.activeCapabilities.includes('ESTETIC_360_BODY'), 'Esteticista deve ter ESTETIC_360_BODY');
console.log('  [PASS] Esteticista multiarea possui capacidades faciais e corporais.');

// Cirurgião-Dentista COM Harmonização Orofacial (pa-odonto-estetica)
db.prepare(`
  INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, profession_id, profession_name, zemda_odonto_enabled, zemda_estetic_enabled)
  VALUES (?, ?, 'Dr. Marcos Dentista HOF', ?, 'hash', 'professional', 'active', 'prof-dentista', 'Cirurgião-Dentista', 1, 1)
`).run(userDentistId, t1, emailDent);

db.prepare(`
  INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, profession_name, active, zemda_odonto_enabled, zemda_estetic_enabled)
  VALUES (?, ?, ?, 'Dr. Marcos Dentista HOF', 'prof-dentista', 'Cirurgião-Dentista', 1, 1, 1)
`).run(profDentistId, t1, userDentistId);

db.prepare(`
  INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json, zemda_odonto_enabled, zemda_estetic_enabled)
  VALUES (?, ?, ?, 'professional', 'active', 0, '["access_zemda_odonto", "access_zemda_estetic"]', 1, 1)
`).run('cu-' + userDentistId, t1, userDentistId);

CapabilityService.setUserPracticeAreas(userDentistId, t1, ['pa-odonto-estetica']);
const dentistHofCaps = CapabilityService.computeUserCapabilities(userDentistId, t1);

assert.strictEqual(dentistHofCaps.commercialModule, 'ZemdaOdonto', 'Dentista com HOF deve manter ZemdaOdonto');
assert(dentistHofCaps.activeCapabilities.includes('ESTETIC_FACIAL'), 'Dentista com HOF deve receber ESTETIC_FACIAL');
assert(dentistHofCaps.activeCapabilities.includes('ESTETIC_360_FACE'), 'Dentista com HOF deve ter ESTETIC_360_FACE');
assert(!dentistHofCaps.activeCapabilities.includes('ESTETIC_BODY'), 'Dentista com HOF NÃO deve receber ESTETIC_BODY por padrão');
console.log('  [PASS] Cirurgião-Dentista com HOF recebe estritamente ESTETIC_FACIAL e mantém ZemdaOdonto.');

// Cirurgião-Dentista SEM especialidade HOF e sem permissão estética
db.prepare(`
  INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, profession_id, profession_name, zemda_odonto_enabled, zemda_estetic_enabled)
  VALUES (?, ?, 'Dr. Carlos Dentista Geral', ?, 'hash', 'professional', 'active', 'prof-dentista', 'Cirurgião-Dentista', 1, 0)
`).run(userDentistNoHofId, t1, emailNoHof);

db.prepare(`
  INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, profession_name, active, zemda_odonto_enabled, zemda_estetic_enabled)
  VALUES (?, ?, ?, 'Dr. Carlos Dentista Geral', 'prof-dentista', 'Cirurgião-Dentista', 1, 1, 0)
`).run(profDentistNoHofId, t1, userDentistNoHofId);

db.prepare(`
  INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json, zemda_odonto_enabled, zemda_estetic_enabled)
  VALUES (?, ?, ?, 'professional', 'active', 0, '["access_zemda_odonto"]', 1, 0)
`).run('cu-' + userDentistNoHofId, t1, userDentistNoHofId);

CapabilityService.setUserPracticeAreas(userDentistNoHofId, t1, ['pa-odonto-cirurgia']);
const dentistNoHofCaps = CapabilityService.computeUserCapabilities(userDentistNoHofId, t1);

assert.strictEqual(dentistNoHofCaps.commercialModule, 'ZemdaOdonto');
assert(!dentistNoHofCaps.activeCapabilities.includes('ESTETIC_FACIAL'), 'Dentista sem HOF NÃO deve receber ESTETIC_FACIAL');
assert(!dentistNoHofCaps.activeCapabilities.includes('ESTETIC_BODY'), 'Dentista sem HOF NÃO deve receber ESTETIC_BODY');
console.log('  [PASS] Cirurgião-Dentista comum não recebe nenhuma capability estética.');

// Pacientes de teste
db.prepare("INSERT INTO patients (id, tenant_id, full_name, phone) VALUES (?, ?, 'Mariana Silva', '11999991111')").run(patientId1, t1);
db.prepare("INSERT INTO patients (id, tenant_id, full_name, phone) VALUES (?, ?, 'Paciente Outra Clínica', '11999992222')").run(patientId2, t2);

console.log('--- TESTE 4: Validação de Acesso a Áreas no Controller ---');

const { getEsteticAccess } = require('./dist/controllers/estetic.controller');

// Esteticista com Facial e Corporal
const reqEstetFacial = { user: { userId: userEstetId, role: 'professional' }, tenantId: t1 };
const accessFacial = getEsteticAccess(reqEstetFacial, 'FACIAL');
assert(accessFacial.allowed, 'Esteticista deve ter acesso Facial');

const accessCorporal = getEsteticAccess(reqEstetFacial, 'CORPORAL');
assert(accessCorporal.allowed, 'Esteticista deve ter acesso Corporal');

const accessCapilar = getEsteticAccess(reqEstetFacial, 'CAPILAR');
assert(!accessCapilar.allowed, 'Esteticista sem Capilar não deve acessar Capilar');
console.log('  [PASS] Acesso restrito a áreas autorizadas validado no backend.');

// Dentista com HOF
const reqDentistHof = { user: { userId: userDentistId, role: 'professional' }, tenantId: t1 };
const accessDentistFacial = getEsteticAccess(reqDentistHof, 'FACIAL');
assert(accessDentistFacial.allowed, 'Dentista com HOF deve acessar Facial');
const accessDentistCorporal = getEsteticAccess(reqDentistHof, 'CORPORAL');
assert(!accessDentistCorporal.allowed, 'Dentista com HOF NÃO deve acessar Corporal');
console.log('  [PASS] Dentista com HOF bloqueado para Corporal e liberado para Facial.');

// Dentista comum
const reqDentistNoHof = { user: { userId: userDentistNoHofId, role: 'professional' }, tenantId: t1 };
const accessDentistNoHof = getEsteticAccess(reqDentistNoHof, 'FACIAL');
assert(!accessDentistNoHof.allowed, 'Dentista comum deve ter acesso estético NEGADO');
console.log('  [PASS] Dentista comum expressamente bloqueado do ZemdaEstetic.');

console.log('--- TESTE 5: Fluxo Completo de Atendimento no ZemdaEstetic ---');

const { EsteticController } = require('./dist/controllers/estetic.controller');

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; }
  };
  return res;
}

// 1. Criar Avaliação Facial
const resAst = mockRes();
EsteticController.createAssessment({
  user: { userId: userEstetId, role: 'professional' },
  tenantId: t1,
  body: {
    patientId: patientId1,
    area: 'FACIAL',
    assessmentDate: '2026-09-28',
    chiefComplaint: 'Linhas de expressão na fronte e flacidez leve no terço médio',
    objectives: 'Rejuvenescimento e harmonização natural',
    clinicalHistory: 'Sem alergias conhecidas',
    specificData: {
      skinType: 'Mista',
      fitzpatrick: 'III',
      glogau: 'II',
      interestRegions: ['forehead', 'glabella', 'crows_feet']
    },
    observations: 'Pele hidratada'
  }
}, resAst);

assert.strictEqual(resAst.statusCode, 201);
assert(resAst.body.id, 'Deve retornar ID da avaliação criada');
const assessmentId = resAst.body.id;
console.log('  [PASS] Avaliação facial criada com sucesso ID:', assessmentId);

// 2. Criar Planejamento
const resPlan = mockRes();
EsteticController.createPlan({
  user: { userId: userEstetId, role: 'professional' },
  tenantId: t1,
  body: {
    patientId: patientId1,
    area: 'FACIAL',
    title: 'Protocolo Rejuvenescimento Facial',
    items: [
      {
        id: 'item-1',
        area: 'FACIAL',
        region: 'forehead',
        procedure_name: 'Toxina Botulínica (Terço Superior)',
        objective: 'Suavização de rugas frontais',
        planned_product: 'Botox 100UI',
        planned_quantity: 30,
        unit: 'UI',
        status: 'PLANEJADO'
      },
      {
        id: 'item-2',
        area: 'FACIAL',
        region: 'lips_upper',
        procedure_name: 'Preenchimento Labial',
        objective: 'Definição de contorno labial',
        planned_product: 'Ácido Hialurônico Reticulado',
        planned_quantity: 1,
        unit: 'ml',
        status: 'PLANEJADO'
      }
    ],
    notes: 'Iniciar pela toxina e reavaliar lábios após 15 dias'
  }
}, resPlan);

assert.strictEqual(resPlan.statusCode, 201);
const planId = resPlan.body.id;
console.log('  [PASS] Planejamento estético criado com sucesso ID:', planId);

// 3. Cadastrar insumo no estoque para testar rastreabilidade e baixa automática
const itemId = 'inv-botox-' + Date.now();
db.prepare(`
  INSERT INTO inventory_items (id, tenant_id, name, category, brand, quantity, unit, batch_number, expiration_date)
  VALUES (?, ?, 'Toxina Botulínica 100UI', 'Injetáveis', 'Allergan', 50, 'UI', 'LOTE-BTX-9942', '2027-12-31')
`).run(itemId, t1);

// 4. Registrar Procedimento Realizado com Baixa no Estoque e Vínculo ao Plano
const resProc = mockRes();
EsteticController.createProcedure({
  user: { userId: userEstetId, role: 'professional' },
  tenantId: t1,
  body: {
    patientId: patientId1,
    area: 'FACIAL',
    region: 'forehead',
    procedureName: 'Toxina Botulínica (Terço Superior)',
    productId: itemId,
    productName: 'Toxina Botulínica 100UI',
    manufacturer: 'Allergan',
    batchLot: 'LOTE-BTX-9942',
    expiryDate: '2027-12-31',
    quantity: 30,
    unit: 'UI',
    observation: 'Aplicação padrão em pontos frontais e glabelares sem intercorrências',
    returnDate: '2026-10-14',
    planId: planId,
    planItemId: 'item-1',
    deductInventory: true
  }
}, resProc);

assert.strictEqual(resProc.statusCode, 201);
const procId = resProc.body.id;
console.log('  [PASS] Procedimento realizado registrado com sucesso ID:', procId);

// Verifica baixa no estoque
const updatedInv = db.prepare('SELECT quantity FROM inventory_items WHERE id = ?').get(itemId);
assert.strictEqual(updatedInv.quantity, 20, 'Estoque deve ter baixado de 50 para 20 UI');
const mov = db.prepare('SELECT quantity, reason, document_reference FROM inventory_movements WHERE item_id = ?').get(itemId);
assert(mov && mov.document_reference === procId, 'Movimentação de estoque deve estar vinculada ao procedimento');
console.log('  [PASS] Rastreabilidade de estoque e baixa automática confirmadas.');

// Verifica atualização do item do plano para REALIZADO
const updatedPlan = db.prepare('SELECT items_json FROM estetic_plans WHERE id = ?').get(planId);
const parsedItems = JSON.parse(updatedPlan.items_json);
const item1 = parsedItems.find(i => i.id === 'item-1');
assert.strictEqual(item1.status, 'REALIZADO', 'Item do plano deve ter sido marcado como REALIZADO');
console.log('  [PASS] Item do plano atualizado automaticamente para REALIZADO.');

// 5. Registrar Fotografias (Frontal e Perfil)
const resPhoto1 = mockRes();
EsteticController.createPhoto({
  user: { userId: userEstetId, role: 'professional' },
  tenantId: t1,
  body: {
    patientId: patientId1,
    area: 'FACIAL',
    viewType: 'FRONTAL',
    fileUrl: 'https://cdn.zemda.com.br/photos/antes_frontal.jpg',
    photoDate: '2026-09-28',
    observation: 'Foto inicial antes do procedimento'
  }
}, resPhoto1);
assert.strictEqual(resPhoto1.statusCode, 201);

const resPhoto2 = mockRes();
EsteticController.createPhoto({
  user: { userId: userEstetId, role: 'professional' },
  tenantId: t1,
  body: {
    patientId: patientId1,
    area: 'FACIAL',
    viewType: 'FRONTAL',
    fileUrl: 'https://cdn.zemda.com.br/photos/depois_frontal.jpg',
    photoDate: '2026-10-14',
    observation: 'Foto de retorno após 15 dias'
  }
}, resPhoto2);
assert.strictEqual(resPhoto2.statusCode, 201);
console.log('  [PASS] Fotografias clínicas antes e depois registradas na galeria.');

// 6. Consultar Comparador Antes x Depois
const resBA = mockRes();
EsteticController.getBeforeAfter({
  user: { userId: userEstetId, role: 'professional' },
  tenantId: t1,
  query: { patientId: patientId1, area: 'FACIAL' }
}, resBA);

assert.strictEqual(resBA.statusCode, 200);
assert(resBA.body.groupsByView['FACIAL • FRONTAL'], 'Deve haver grupo de comparação FACIAL • FRONTAL');
assert.strictEqual(resBA.body.groupsByView['FACIAL • FRONTAL'].length, 2, 'Deve conter 2 fotos para comparação');
console.log('  [PASS] Comparador Antes × Depois agrupou fotos da mesma vista com sucesso.');

// 7. Registrar Evolução Clínica
const resEvo = mockRes();
EsteticController.createEvolution({
  user: { userId: userEstetId, role: 'professional' },
  tenantId: t1,
  body: {
    patientId: patientId1,
    area: 'FACIAL',
    procedureId: procId,
    evolutionText: 'Paciente relata excelente adaptação, sem hematomas ou queixas.',
    observedResponse: 'Redução visível de rugas estáticas na fronte com tônus preservado',
    conduct: 'Agendado retorno de 15 dias para conferência',
    returnDate: '2026-10-14'
  }
}, resEvo);
assert.strictEqual(resEvo.statusCode, 201);
console.log('  [PASS] Evolução clínica registrada.');

// 8. Registrar Retorno Pós-Procedimento
const resRet = mockRes();
EsteticController.createReturn({
  user: { userId: userEstetId, role: 'professional' },
  tenantId: t1,
  body: {
    patientId: patientId1,
    area: 'FACIAL',
    procedureRecordId: procId,
    returnAssessment: 'Mímica facial harmoniosa, sem assimetrias. Resultado ótimo.',
    conduct: 'Sem necessidade de retoque. Alta temporária com retorno semestral.',
    nextReturnDate: '2027-03-28'
  }
}, resRet);
assert.strictEqual(resRet.statusCode, 201);
console.log('  [PASS] Retorno estético registrado com sucesso.');

// 9. Histórico e Linha do Tempo Unificada
const resHist = mockRes();
EsteticController.getHistory({
  user: { userId: userEstetId, role: 'professional' },
  tenantId: t1,
  query: { patientId: patientId1, area: 'TODOS' }
}, resHist);

assert.strictEqual(resHist.statusCode, 200);
assert(resHist.body.length >= 6, `Timeline deve conter ao menos 6 eventos (encontrados: ${resHist.body.length})`);
const types = resHist.body.map(e => e.type);
assert(types.includes('ASSESSMENT'), 'Deve conter avaliação na timeline');
assert(types.includes('PROCEDURE'), 'Deve conter procedimento na timeline');
assert(types.includes('PLAN'), 'Deve conter plano na timeline');
assert(types.includes('EVOLUTION'), 'Deve conter evolução na timeline');
assert(types.includes('RETURN'), 'Deve conter retorno na timeline');
assert(types.includes('PHOTO'), 'Deve conter fotos na timeline');
console.log('  [PASS] Histórico / Timeline consolidada com todos os tipos de eventos clínicos.');

// 10. Visão Geral do Paciente
const resOver = mockRes();
EsteticController.getPatientOverview({
  user: { userId: userEstetId, role: 'professional' },
  tenantId: t1,
  params: { patientId: patientId1 }
}, resOver);

assert.strictEqual(resOver.statusCode, 200);
assert(resOver.body.lastAssessment, 'Deve conter última avaliação');
assert(resOver.body.lastProcedure, 'Deve conter último procedimento');
assert(resOver.body.usedAreas.includes('FACIAL'), 'Deve listar FACIAL nas áreas utilizadas');
console.log('  [PASS] Visão Geral do Paciente (Overview) validada com sucesso.');

console.log('--- TESTE 6: Isolamento Multi-Clínica (Tenant Isolation) ---');

// Usuário da Clínica Beta tentando acessar paciente da Clínica Alpha
const resIsol = mockRes();
EsteticController.getAssessments({
  user: { userId: 'usr-beta-1', role: 'clinic_admin' },
  tenantId: t2,
  query: { patientId: patientId1 }
}, resIsol);

assert([403, 404].includes(resIsol.statusCode), 'Clínica Beta não pode acessar paciente de outra clínica');
console.log('  [PASS] Isolamento absoluto entre clínicas confirmado.');

console.log('\n==================================================');
console.log('TODOS OS 6 TESTES DE BACKEND PASSARAM COM SUCESSO!');
console.log('==================================================\n');

console.log('--- Regressões da auditoria funcional ---');
const callEstetic = (method, body = {}, params = {}, query = {}, user = userEstetId) => {
  const res = mockRes();
  EsteticController[method]({ user: { userId: user, role: 'professional' }, tenantId: t1, body, params, query }, res);
  return res;
};
const quantityBefore = () => db.prepare('SELECT quantity FROM inventory_items WHERE id = ?').get(itemId).quantity;
const input = { patientId: patientId1, area: 'FACIAL', procedureName: 'Procedimento auditado', region: 'Fronte', productId: itemId, quantity: 2, unit: 'UI', deductInventory: true, datePerformed: '2026-10-01', postInstructions: 'Orientações completas', clientRequestId: 'audit-idempotency' };
const stockBefore = quantityBefore();
const created = callEstetic('createProcedure', input); assert.equal(created.statusCode, 201);
const repeated = callEstetic('createProcedure', input); assert.equal(repeated.body.id, created.body.id); assert.equal(quantityBefore(), stockBefore - 2);
const auditProc = db.prepare('SELECT * FROM estetic_procedures WHERE id = ?').get(created.body.id);
assert.equal(auditProc.date_performed, '2026-10-01'); assert.equal(auditProc.post_instructions, 'Orientações completas'); assert.equal(auditProc.batch_lot, 'LOTE-BTX-9942');
const edited = callEstetic('updateProcedure', { quantity: 3 }, {id: created.body.id}); assert.equal(edited.statusCode, 200); assert.equal(quantityBefore(), stockBefore - 3);
const unchanged = callEstetic('updateProcedure', { quantity: 3 }, {id: created.body.id}); assert.equal(unchanged.statusCode, 200); assert.equal(quantityBefore(), stockBefore - 3);
assert.equal(callEstetic('updateProcedure', {unit: 'ml'}, {id:created.body.id}).statusCode, 400);
const insufficient = callEstetic('createProcedure', {...input, clientRequestId:'audit-insufficient', quantity:9999}); assert.equal(insufficient.statusCode,400); assert.equal(quantityBefore(),stockBefore-3);
const missing = callEstetic('createProcedure', {...input, clientRequestId:'audit-missing', region:' '}); assert.equal(missing.statusCode,400); assert.equal(missing.body.field,'region');
assert.equal(callEstetic('createProcedure', {...input, clientRequestId:'audit-bad-date', datePerformed:'2026-02-31'}).statusCode,400);
assert.equal(callEstetic('createProcedure', {...input, clientRequestId:'audit-bad-patient', patientId:'missing-patient'}).statusCode,404);
db.exec("CREATE TRIGGER fail_estetic_test BEFORE INSERT ON estetic_procedures WHEN NEW.procedure_name = 'FAIL-PROC' BEGIN SELECT RAISE(ABORT,'synthetic persistence failure'); END");
assert.equal(callEstetic('createProcedure', {...input, clientRequestId:'audit-rollback', procedureName:'FAIL-PROC'}).statusCode,500); assert.equal(quantityBefore(),stockBefore-3);
db.exec('DROP TRIGGER fail_estetic_test');
assert.equal(callEstetic('deleteProcedure', {}, {id:created.body.id}).statusCode,200); assert.equal(quantityBefore(),stockBefore);
assert.equal(callEstetic('deleteProcedure', {}, {id:created.body.id}).statusCode,404); assert.equal(quantityBefore(),stockBefore);
// --- Teste específico: Produto desativado pós-baixa e proteção de remoção de itens ---
const procForDeactivated = callEstetic('createProcedure', { ...input, clientRequestId: 'deactivated-prod-test', quantity: 4 });
assert.equal(procForDeactivated.statusCode, 201);
assert.equal(quantityBefore(), stockBefore - 4);

// Desativa o produto no estoque
db.prepare('UPDATE inventory_items SET active = 0 WHERE id = ?').run(itemId);

// Nova baixa com produto desativado DEVE falhar (400)
const blockedNewDeduction = callEstetic('createProcedure', { ...input, clientRequestId: 'blocked-new-inactive', quantity: 1 });
assert.equal(blockedNewDeduction.statusCode, 400);

// Estorno ao excluir procedimento realizado cujo produto foi desativado DEVE funcionar perfeitamente
const refundDeactivated = callEstetic('deleteProcedure', {}, { id: procForDeactivated.body.id });
assert.equal(refundDeactivated.statusCode, 200);
assert.equal(quantityBefore(), stockBefore);

// Excluir novamente deve retornar 404 sem duplicar estorno
assert.equal(callEstetic('deleteProcedure', {}, { id: procForDeactivated.body.id }).statusCode, 404);
assert.equal(quantityBefore(), stockBefore);

// Reativa o produto para os testes seguintes
db.prepare('UPDATE inventory_items SET active = 1 WHERE id = ?').run(itemId);

// Teste de integridade de itens do planejamento:
const testPlan = callEstetic('createPlan', {
  patientId: patientId1,
  area: 'FACIAL',
  title: 'Plano com Procedimento Vinculado',
  items: [
    { id: 'item-exec-1', procedure_name: 'Proc 1' },
    { id: 'item-free-2', procedure_name: 'Proc 2' }
  ]
});
assert.equal(testPlan.statusCode, 201);
const testPlanId = testPlan.body.id;

// Vincula um procedimento realizado ao item-exec-1
const procLinkedTest = callEstetic('createProcedure', {
  patientId: patientId1,
  area: 'FACIAL',
  procedureName: 'Proc 1',
  region: 'Fronte',
  planId: testPlanId,
  planItemId: 'item-exec-1',
  datePerformed: '2026-10-01'
});
assert.equal(procLinkedTest.statusCode, 201);

// Tentar remover item-exec-1 do plano DEVE falhar (400)
const failRemoveExec = callEstetic('updatePlan', {
  items: [{ id: 'item-free-2', procedure_name: 'Proc 2' }]
}, { id: testPlanId });
assert.equal(failRemoveExec.statusCode, 400);

// Remover item-free-2 (que não tem procedimento executado) DEVE suceder (200)
const okRemoveFree = callEstetic('updatePlan', {
  items: [{ id: 'item-exec-1', procedure_name: 'Proc 1' }]
}, { id: testPlanId });
assert.equal(okRemoveFree.statusCode, 200);
const scheduled = callEstetic('createReturn',{patientId:patientId1,area:'FACIAL',scheduledDate:'2026-11-01',status:'AGENDADO'}); assert.equal(scheduled.statusCode,201);
assert.equal(callEstetic('updateReturn',{status:'COMPARECEU',actualDate:'2026-11-01',returnAssessment:'Reavaliação'}, {id:scheduled.body.id}).statusCode,200);
assert.equal(db.prepare('SELECT actual_date FROM estetic_returns WHERE id=?').get(scheduled.body.id).actual_date,'2026-11-01');
assert.equal(callEstetic('updateReturn',{status:'INEXISTENTE'}, {id:scheduled.body.id}).statusCode,400);
assert.equal(callEstetic('deleteReturn',{}, {id:scheduled.body.id}).statusCode,200);
const assessmentUpdate = callEstetic('updateAssessment',{chiefComplaint:'Queixa revisada',specificData:{fitzpatrick:'IV',clinicalConduct:'Conduta revisada'}},{id:assessmentId}); assert.equal(assessmentUpdate.statusCode,200);
assert.equal(db.prepare('SELECT chief_complaint FROM estetic_assessments WHERE id=?').get(assessmentId).chief_complaint,'Queixa revisada');
const forbidden = callEstetic('updateAssessment',{area:'CORPORAL'}, {id:assessmentId}, {}, userDentistId); assert.equal(forbidden.statusCode,403);
console.log('PASS: idempotência, edição, estorno único, rollback, validações específicas, datas, retornos e autorização de áreas.');

const deniedReception = mockRes(); EsteticController.getConfig({user:{userId:userEstetId,role:'receptionist'},tenantId:t1,query:{}},deniedReception); assert.equal(deniedReception.statusCode,403);
const deniedRoot = mockRes(); EsteticController.getConfig({user:{userId:userEstetId,role:'superadmin'},tenantId:t1,query:{}},deniedRoot); assert.equal(deniedRoot.statusCode,403);
const corporal = callEstetic('createAssessment',{patientId:patientId1,area:'CORPORAL',chiefComplaint:'Corporal isolada'}); assert.equal(corporal.statusCode,201);
const scoped = callEstetic('getAssessments',{}, {}, {patientId:patientId1,area:'TODOS'},userDentistId); assert.equal(scoped.statusCode,200); assert(scoped.body.every(row=>row.area==='FACIAL'));
assert.equal(callEstetic('deleteAssessment',{}, {id:corporal.body.id},{},userDentistId).statusCode,403);
const photoBody = {patientId:patientId1,area:'FACIAL',fileUrl:'https://example.test/synthetic.png',photoType:'ANTES',photoDate:'2026-10-01'};
const duplicatePhotoA=callEstetic('createPhoto',photoBody),duplicatePhotoB=callEstetic('createPhoto',photoBody); assert.equal(duplicatePhotoA.body.id,duplicatePhotoB.body.id);
assert.equal(callEstetic('createEvolution',{patientId:patientId2,area:'FACIAL',evolutionText:'Sem mistura',procedureId:procId}).statusCode,404);
const sameClinicPatient = 'audit-second-patient-' + Date.now(); db.prepare("INSERT OR REPLACE INTO patients(id,tenant_id,full_name,phone) VALUES(?,?,?,?)").run(sameClinicPatient,t1,'Segundo paciente da auditoria','11999990002');
assert.equal(callEstetic('createEvolution',{patientId:sameClinicPatient,area:'FACIAL',evolutionText:'Sem mistura',procedureId:procId}).statusCode,400);
console.log('PASS: recepção, SuperAdmin real, leituras sem filtro de área, exclusão não autorizada, fotos duplicadas e vínculos entre pacientes.');
