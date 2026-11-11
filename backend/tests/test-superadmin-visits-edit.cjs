const assert = require('assert');
const { db } = require('../dist/config/database');
const { AdminVisitsController } = require('../dist/controllers/admin-visits.controller');
const { v4: uuidv4 } = require('uuid');

console.log('\n=== TESTE DE VALIDAÇÃO: EDIÇÃO DE ESTABELECIMENTOS E VISITAS SUPERADMIN ===\n');

function mockRes() {
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
    }
  };
  return res;
}

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Erro: ${err.message}`);
    if (err.stack) console.error(err.stack);
    failed++;
  }
}

// 1. Teste de Edição de Estabelecimento: preservação de campos omitidos
console.log('\n--- 1. Edição de Estabelecimento (preservação de campos omitidos e tenant_id) ---');

const estId = 'est-test-' + Date.now();
const testTenantId = 'tenant-linked-' + Date.now();

db.prepare(`
  INSERT INTO superadmin_visit_establishments (
    id, name, trade_name, corporate_name, cnpj, establishment_type,
    city, state, address, website, instagram, estimated_professionals,
    primary_contact_name, primary_contact_role, primary_contact_phone,
    primary_contact_whatsapp, primary_contact_email, best_contact_time,
    preferred_channel, current_status, tenant_id, next_action, next_return_date,
    created_at, updated_at
  )
  VALUES (
    ?, 'Clínica Saúde Total Original', 'Saúde Total', 'Saúde Total Ltda', '12345678000199', 'Clínica Privada',
    'Curitiba', 'PR', 'Rua das Flores, 123', 'https://saudetotal.com', '@saudetotal', 5,
    'Dra. Ana', 'Sócia Diretora', '(41) 3333-4444',
    '(41) 9999-8888', 'ana@saudetotal.com', 'Manhã',
    'whatsapp', 'first_contact', ?, 'Ligar após análise', '2026-11-20',
    datetime('now'), datetime('now')
  )
`).run(estId, testTenantId);

runTest('updateEstablishment deve atualizar apenas campos enviados e NÃO sobrescrever omitidos com null', () => {
  const req = {
    params: { id: estId },
    body: {
      name: 'Clínica Saúde Total Atualizada',
      city: 'Pinhais'
      // Omitidos: tradeName, corporateName, cnpj, address, website, instagram, tenantId, etc.
    },
    user: { id: 'admin-1', role: 'superadmin', name: 'SuperAdmin' }
  };
  const res = mockRes();

  AdminVisitsController.updateEstablishment(req, res);

  assert.strictEqual(res.statusCode, 200, 'Status deve ser 200');
  assert.ok(res.data && res.data.establishment, 'Deve retornar o estabelecimento atualizado');

  const inDb = db.prepare('SELECT * FROM superadmin_visit_establishments WHERE id = ?').get(estId);

  assert.strictEqual(inDb.name, 'Clínica Saúde Total Atualizada', 'Nome deve ser atualizado');
  assert.strictEqual(inDb.city, 'Pinhais', 'Cidade deve ser atualizada');
  assert.strictEqual(inDb.trade_name, 'Saúde Total', 'trade_name não enviado deve ser preservado');
  assert.strictEqual(inDb.corporate_name, 'Saúde Total Ltda', 'corporate_name não enviado deve ser preservado');
  assert.strictEqual(inDb.cnpj, '12345678000199', 'cnpj não enviado deve ser preservado');
  assert.strictEqual(inDb.address, 'Rua das Flores, 123', 'address não enviado deve ser preservado');
  assert.strictEqual(inDb.website, 'https://saudetotal.com', 'website não enviado deve ser preservado');
  assert.strictEqual(inDb.tenant_id, testTenantId, 'tenant_id não enviado deve ser rigorosamente preservado');
});

// 2. Teste de Edição de Visitas e Recálculo Derivado Inteligente
console.log('\n--- 2. Edição de Visita e Recálculo de Campos Derivados do Estabelecimento ---');

const visit1Id = 'vis-edit-1-' + Date.now();
const visit2Id = 'vis-edit-2-' + Date.now();

// Cria visita antiga (Visita 1 - 2026-11-01)
db.prepare(`
  INSERT INTO superadmin_visits (
    id, establishment_id, visit_date, visit_time, modality,
    responsible_name, objective, notes, result, status_after_visit,
    next_action, next_return_date, created_by, created_at, updated_at
  )
  VALUES (
    ?, ?, '2026-11-01', '10:00', 'presential',
    'SuperAdmin 1', 'Primeiro contato presencial', 'Apresentado o Zemda', 'Interessado', 'first_contact',
    'Retorno para demo', '2026-11-05', 'SuperAdmin', '2026-11-01 10:00:00', '2026-11-01 10:00:00'
  )
`).run(visit1Id, estId);

// Cria visita mais recente (Visita 2 - 2026-11-10)
db.prepare(`
  INSERT INTO superadmin_visits (
    id, establishment_id, visit_date, visit_time, modality,
    responsible_name, objective, notes, result, status_after_visit,
    next_action, next_return_date, created_by, created_at, updated_at
  )
  VALUES (
    ?, ?, '2026-11-10', '15:00', 'online_meeting',
    'SuperAdmin 2', 'Demonstração online', 'Demonstrado prontuário', 'Muito interessado', 'proposal_sent',
    'Enviar proposta comercial', '2026-11-15', 'SuperAdmin', '2026-11-10 15:00:00', '2026-11-10 15:00:00'
  )
`).run(visit2Id, estId);

// Atualiza o estabelecimento para refletir a visita 2
db.prepare(`
  UPDATE superadmin_visit_establishments
  SET last_visit_date = '2026-11-10', current_status = 'proposal_sent', next_action = 'Enviar proposta comercial', next_return_date = '2026-11-15'
  WHERE id = ?
`).run(estId);

runTest('updateVisit deve atualizar dados da Visita 1 sem criar novo registro e sem sobrescrever dados da Visita 2 mais recente no estabelecimento', () => {
  const req = {
    params: { id: estId, visitId: visit1Id },
    body: {
      objective: 'Primeiro contato corrigido e enriquecido',
      notes: 'Notas revisadas da visita 1'
    },
    user: { id: 'admin-1', role: 'superadmin', name: 'SuperAdmin' }
  };
  const res = mockRes();

  AdminVisitsController.updateVisit(req, res);

  assert.strictEqual(res.statusCode, 200, 'Status deve ser 200');
  assert.ok(res.data && res.data.visit, 'Deve retornar visita atualizada');

  // Verifica visita 1 atualizada
  const v1 = db.prepare('SELECT * FROM superadmin_visits WHERE id = ?').get(visit1Id);
  assert.strictEqual(v1.objective, 'Primeiro contato corrigido e enriquecido', 'Objetivo deve ser atualizado');
  assert.strictEqual(v1.notes, 'Notas revisadas da visita 1', 'Notas devem ser atualizadas');
  assert.strictEqual(v1.visit_date, '2026-11-01', 'Data da visita 1 preservada');

  // Verifica que o estabelecimento NÃO regrediu para a visita 1 antiga
  const est = db.prepare('SELECT * FROM superadmin_visit_establishments WHERE id = ?').get(estId);
  assert.strictEqual(est.last_visit_date, '2026-11-10', 'last_visit_date deve continuar sendo da visita 2 (mais recente)');
  assert.strictEqual(est.current_status, 'proposal_sent', 'current_status deve continuar sendo da visita 2');
  assert.strictEqual(est.next_action, 'Enviar proposta comercial', 'next_action deve continuar sendo da visita 2');
});

runTest('updateVisit deve atualizar a visita mais recente (Visita 2) e recalcular os dados derivados do estabelecimento', () => {
  const req = {
    params: { id: estId, visitId: visit2Id },
    body: {
      statusAfterVisit: 'won',
      nextAction: 'Onboarding e implantação',
      nextReturnDate: '2026-11-25'
    },
    user: { id: 'admin-1', role: 'superadmin', name: 'SuperAdmin' }
  };
  const res = mockRes();

  AdminVisitsController.updateVisit(req, res);

  assert.strictEqual(res.statusCode, 200, 'Status deve ser 200');

  // Verifica estabelecimento recalculado
  const est = db.prepare('SELECT * FROM superadmin_visit_establishments WHERE id = ?').get(estId);
  assert.strictEqual(est.current_status, 'won', 'current_status do estabelecimento deve ter sido atualizado para won');
  assert.strictEqual(est.next_action, 'Onboarding e implantação', 'next_action do estabelecimento deve ter sido atualizado');
  assert.strictEqual(est.next_return_date, '2026-11-25', 'next_return_date do estabelecimento deve ter sido atualizado');
});

// Limpeza dos dados de teste
try {
  db.prepare('DELETE FROM superadmin_visits WHERE establishment_id = ?').run(estId);
  db.prepare('DELETE FROM superadmin_visit_establishments WHERE id = ?').run(estId);
} catch (_) {}

console.log(`\n========================================`);
console.log(`RESULTADO FINAL: ${passed} PASSOU | ${failed} FALHOU`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
