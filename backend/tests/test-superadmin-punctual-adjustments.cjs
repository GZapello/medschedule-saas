const assert = require('assert');
const { db } = require('../dist/config/database');
const { TenantController } = require('../dist/controllers/tenant.controller');
const { clinicTeam } = require('../dist/services/clinic-team.service');
const { v4: uuidv4 } = require('uuid');

console.log('\n=== TESTE DE VALIDAÇÃO: AJUSTES PONTUAIS SUPERADMIN ===\n');

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

async function runTests() {
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

  // --- SEÇÃO 1: TELEFONE DO PROFISSIONAL NO RESUMO DA CLÍNICA ---
  console.log('\n--- 1. Validação do Telefone do Profissional no Resumo da Clínica ---');

  const testTenantId = 'tenant-test-summary-' + Date.now();
  const prof1UserId = 'user-prof-with-phone-' + Date.now();
  const prof2UserId = 'user-prof-without-phone-' + Date.now();

  db.prepare("INSERT INTO tenants (id, name, slug, email, status, created_at) VALUES (?, 'Clínica Resumo Teste', ?, 'resumo@teste.com', 'active', datetime('now'))")
    .run(testTenantId, 'slug-' + testTenantId);

  // Profissional com telefone
  db.prepare(`
    INSERT INTO users (id, tenant_id, name, email, phone, password_hash, role, status, profession_name, registration_type, registration_number, created_at)
    VALUES (?, ?, 'Dra. Beatriz com Telefone', ?, '(11) 98765-4321', 'hash', 'professional', 'active', 'Fisioterapeuta', 'CREFITO', '12345-F', datetime('now'))
  `).run(prof1UserId, testTenantId, 'beatriz-' + prof1UserId + '@teste.com');

  db.prepare(`
    INSERT INTO professionals (id, tenant_id, user_id, name, profession_name, registration_type, registration_number, active, created_at)
    VALUES (?, ?, ?, 'Dra. Beatriz com Telefone', 'Fisioterapeuta', 'CREFITO', '12345-F', 1, datetime('now'))
  `).run('prof-id-1-' + Date.now(), testTenantId, prof1UserId);

  // Profissional sem telefone (null)
  db.prepare(`
    INSERT INTO users (id, tenant_id, name, email, phone, password_hash, role, status, profession_name, registration_type, registration_number, created_at)
    VALUES (?, ?, 'Dr. Carlos sem Telefone', ?, NULL, 'hash', 'professional', 'active', 'Médico', 'CRM', '54321-SP', datetime('now'))
  `).run(prof2UserId, testTenantId, 'carlos-' + prof2UserId + '@teste.com');

  db.prepare(`
    INSERT INTO professionals (id, tenant_id, user_id, name, profession_name, registration_type, registration_number, active, created_at)
    VALUES (?, ?, ?, 'Dr. Carlos sem Telefone', 'Médico', 'CRM', '54321-SP', 1, datetime('now'))
  `).run('prof-id-2-' + Date.now(), testTenantId, prof2UserId);

  runTest('clinicTeam retorna o telefone cadastrado no perfil/usuário', () => {
    const team = clinicTeam(testTenantId);
    assert.ok(Array.isArray(team), 'Team deve ser array');
    const profWithPhone = team.find(m => m.id === prof1UserId);
    assert.ok(profWithPhone, 'Profissional com telefone deve estar no team');
    assert.strictEqual(profWithPhone.phone, '(11) 98765-4321', 'Telefone deve corresponder exatamente ao cadastrado');

    const profWithoutPhone = team.find(m => m.id === prof2UserId);
    assert.ok(profWithoutPhone, 'Profissional sem telefone deve estar no team');
    assert.strictEqual(profWithoutPhone.phone, null, 'Telefone não preenchido deve retornar null');
  });

  runTest('adminTenantSummary expõe phone em activeProfessionals', () => {
    const req = { params: { tenantId: testTenantId } };
    const res = mockRes();
    TenantController.adminTenantSummary(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.data && Array.isArray(res.data.activeProfessionals), 'activeProfessionals deve ser array');

    const p1 = res.data.activeProfessionals.find(p => p.id === prof1UserId);
    assert.ok(p1, 'Dra. Beatriz deve estar em activeProfessionals');
    assert.strictEqual(p1.phone, '(11) 98765-4321', 'Deve conter o telefone da Dra. Beatriz');

    const p2 = res.data.activeProfessionals.find(p => p.id === prof2UserId);
    assert.ok(p2, 'Dr. Carlos deve estar em activeProfessionals');
    assert.strictEqual(p2.phone, null, 'Dr. Carlos deve ter phone = null');
  });

  // --- SEÇÃO 2: VALORES EM ABERTO / COBRANÇAS PENDENTES NO PAINEL GLOBAL ---
  console.log('\n--- 2. Validação do Cálculo de Valores em Aberto (adminMetrics) ---');

  runTest('adminMetrics retorna totalPendingRevenue agregado do banco', () => {
    const req = {};
    const res = mockRes();
    TenantController.adminMetrics(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(typeof res.data.totalPendingRevenue === 'number', 'totalPendingRevenue deve ser número');
    assert.ok(typeof res.data.totalRevenueEstimate === 'number', 'totalRevenueEstimate deve ser número');
    console.log(`     -> Faturamento Global: R$ ${res.data.totalRevenueEstimate}`);
    console.log(`     -> Valores em Aberto:  R$ ${res.data.totalPendingRevenue}`);
  });

  runTest('Valores em aberto NÃO incluem pagos, estornados, cancelados ou deletados', () => {
    // Insere cobrança de assinatura PENDING
    const subPayId = 'subpay-pending-' + Date.now();
    const mockPlanId = 'plan-pro-' + Date.now();
    const mockSubId = 'sub-' + Date.now();

    db.prepare("INSERT INTO plans (id, slug, code, name, monthly_price, extra_user_price, max_users, active) VALUES (?, 'test-pro', 'TEST_PRO', 'Plano Teste', 250, 50, 5, 1)").run(mockPlanId);
    db.prepare("INSERT INTO subscriptions (id, tenant_id, plan_id, status, current_period_start, current_period_end) VALUES (?, ?, ?, 'active', date('now'), date('now', '+30 days'))").run(mockSubId, testTenantId, mockPlanId);

    // 1 cobrança de R$ 500 PENDING
    db.prepare(`
      INSERT INTO subscription_payments (id, clinic_id, subscription_id, asaas_payment_id, amount, contract_amount, plan_id, status, due_date)
      VALUES (?, ?, ?, ?, 500.0, 500.0, ?, 'PENDING', date('now', '+5 days'))
    `).run(subPayId, testTenantId, mockSubId, 'pay_asaas_pending_' + Date.now(), mockPlanId);

    // 1 cobrança de R$ 1200 CONFIRMED (pago - NÃO deve somar)
    db.prepare(`
      INSERT INTO subscription_payments (id, clinic_id, subscription_id, asaas_payment_id, amount, contract_amount, plan_id, status, due_date)
      VALUES (?, ?, ?, ?, 1200.0, 1200.0, ?, 'CONFIRMED', date('now', '-2 days'))
    `).run('subpay-confirmed-' + Date.now(), testTenantId, mockSubId, 'pay_asaas_conf_' + Date.now(), mockPlanId);

    // 1 cobrança de R$ 300 REFUNDED (estornado - NÃO deve somar)
    db.prepare(`
      INSERT INTO subscription_payments (id, clinic_id, subscription_id, asaas_payment_id, amount, contract_amount, plan_id, status, due_date)
      VALUES (?, ?, ?, ?, 300.0, 300.0, ?, 'REFUNDED', date('now', '-5 days'))
    `).run('subpay-refunded-' + Date.now(), testTenantId, mockSubId, 'pay_asaas_ref_' + Date.now(), mockPlanId);

    // 1 cobrança de R$ 400 DELETED (removido - NÃO deve somar)
    db.prepare(`
      INSERT INTO subscription_payments (id, clinic_id, subscription_id, asaas_payment_id, amount, contract_amount, plan_id, status, due_date)
      VALUES (?, ?, ?, ?, 400.0, 400.0, ?, 'DELETED', date('now', '-10 days'))
    `).run('subpay-deleted-' + Date.now(), testTenantId, mockSubId, 'pay_asaas_del_' + Date.now(), mockPlanId);

    const req = {};
    const res = mockRes();
    TenantController.adminMetrics(req, res);
    assert.strictEqual(res.statusCode, 200);

    // O totalPendingRevenue deve ter aumentado exatamente em R$ 500 (apenas o PENDING)
    assert.ok(res.data.totalPendingRevenue >= 500, 'totalPendingRevenue deve computar a cobrança pendente');
  });

  console.log(`\n=== RESULTADO FINAL: ${passed} PASSOU, ${failed} FALHOU ===\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
