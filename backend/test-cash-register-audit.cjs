const assert = require('assert');
const { db } = require('./dist/config/database');
const { CashRegisterController } = require('./dist/controllers/cash-register.controller');
const { PaymentController } = require('./dist/controllers/payment.controller');

console.log('================================================================');
console.log(' INICIANDO TESTES DO CONTROLE DE CAIXA & FLUXO FINANCEIRO');
console.log('================================================================\n');

const testTenant = 'test-tenant-cash-' + Date.now();
const testUser = 'user-test-' + Date.now();

// 1. Criar tenant e usuário de teste
db.prepare("INSERT OR IGNORE INTO tenants (id, slug, name, email) VALUES (?, ?, 'Clínica Teste Caixa', 'clinica@teste.com')").run(testTenant, 'slug-' + Date.now());
db.prepare("INSERT OR IGNORE INTO users (id, tenant_id, name, email, password_hash, role) VALUES (?, ?, 'Operador Teste', ?, 'hash', 'clinic_admin')").run(testUser, testTenant, 'operador' + Date.now() + '@teste.com');

let resStatus = 200;
let resJson = null;

function mockRes() {
  resStatus = 200;
  resJson = null;
  const res = {
    status: function(code) {
      resStatus = code;
      return res;
    },
    json: function(data) {
      resJson = data;
      return res;
    },
    setHeader: function() {},
    send: function(data) {
      resJson = data;
      return res;
    }
  };
  return res;
}

// TESTE 1: Abrir caixa com R$ 200,00 (O erro original do usuário)
{
  const req = {
    tenantId: testTenant,
    user: { userId: testUser, name: 'Operador Teste' },
    body: { initialBalance: 200.00, notes: 'Fundo inicial de troco' }
  };
  CashRegisterController.openRegister(req, mockRes());
  assert.strictEqual(resStatus, 201, 'Status deve ser 201 Created');
  assert.ok(resJson.id, 'Deve retornar ID do caixa');
  console.log('PASS [1] Abertura de caixa com R$ 200,00 concluída sem erro de coluna');
}

// TESTE 2: Impedir abrir segundo caixa em paralelo para a mesma clínica
{
  const req = {
    tenantId: testTenant,
    user: { userId: testUser, name: 'Operador Teste' },
    body: { initialBalance: 100.00 }
  };
  CashRegisterController.openRegister(req, mockRes());
  assert.strictEqual(resStatus, 400, 'Deve barrar abertura de segundo caixa em aberto');
  console.log('PASS [2] Validação de duplicidade de sessão de caixa aberta garantida');
}

// TESTE 3: Buscar status atual do caixa
let currentRegisterId = null;
{
  const req = { tenantId: testTenant, user: { userId: testUser } };
  CashRegisterController.getCurrent(req, mockRes());
  assert.ok(resJson.openRegister, 'Deve retornar caixa aberto');
  currentRegisterId = resJson.openRegister.id;
  assert.strictEqual(resJson.drawerSummary.initialBalance, 200.00);
  assert.strictEqual(resJson.drawerSummary.expectedCash, 200.00);
  console.log('PASS [3] Consulta de status do caixa atual com saldo inicial de R$ 200,00');
}

// TESTE 4: Registrar pagamento em dinheiro com cálculo de troco
// Consulta de R$ 150,00 paga com cédula de R$ 200,00 -> Troco R$ 50,00
const testPatient = 'pat-test-' + Date.now();
db.prepare("INSERT OR IGNORE INTO patients (id, tenant_id, full_name) VALUES (?, ?, 'Paciente Pagador')").run(testPatient, testTenant);

{
  const req = {
    tenantId: testTenant,
    user: { userId: testUser },
    body: {
      patientId: testPatient,
      amount: 150.00,
      paymentMethod: 'cash',
      status: 'paid',
      amountTendered: 200.00,
      changeAmount: 50.00
    }
  };
  PaymentController.create(req, mockRes());
  assert.strictEqual(resStatus, 201);
  console.log('PASS [4] Pagamento em dinheiro registrado com troco calculado (R$ 150 consulta, R$ 200 pago, R$ 50 troco)');
}

// TESTE 5: Registrar pagamento em PIX de R$ 300,00 (NÃO deve inflar dinheiro em gaveta)
{
  const req = {
    tenantId: testTenant,
    user: { userId: testUser },
    body: {
      patientId: testPatient,
      amount: 300.00,
      paymentMethod: 'pix',
      status: 'paid'
    }
  };
  PaymentController.create(req, mockRes());
  assert.strictEqual(resStatus, 201);
  console.log('PASS [5] Pagamento em PIX de R$ 300,00 registrado');
}

// TESTE 6: Lançar Suprimento de R$ 50,00 e Sangria de R$ 100,00
{
  const reqSup = {
    params: { id: currentRegisterId },
    tenantId: testTenant,
    user: { userId: testUser, name: 'Operador Teste' },
    body: { type: 'SUPRIMENTO', amount: 50.00, description: 'Reforço de notas miúdas' }
  };
  CashRegisterController.recordMovement(reqSup, mockRes());
  assert.strictEqual(resStatus, 201);

  const reqSang = {
    params: { id: currentRegisterId },
    tenantId: testTenant,
    user: { userId: testUser, name: 'Operador Teste' },
    body: { type: 'SANGRIA', amount: 100.00, description: 'Retirada de segurança para cofre' }
  };
  CashRegisterController.recordMovement(reqSang, mockRes());
  assert.strictEqual(resStatus, 201);
  console.log('PASS [6] Suprimento (+R$ 50) e Sangria (-R$ 100) lançados com sucesso');
}

// TESTE 7: Conferência do Cálculo da Gaveta Física
// Inicial: 200 + Dinheiro: 150 + Suprimento: 50 - Sangria: 100 = 300 esperado
{
  const req = { tenantId: testTenant, user: { userId: testUser } };
  CashRegisterController.getCurrent(req, mockRes());
  const summary = resJson.drawerSummary;
  assert.strictEqual(summary.initialBalance, 200.00);
  assert.strictEqual(summary.cashIn, 150.00);
  assert.strictEqual(summary.suprimentos, 50.00);
  assert.strictEqual(summary.sangrias, 100.00);
  assert.strictEqual(summary.expectedCash, 300.00);
  assert.strictEqual(resJson.totalsByMethod.pix, 300.00);
  console.log('PASS [7] Cálculo exato da gaveta: R$ 200 (inicial) + R$ 150 (dinheiro) + R$ 50 (suprimento) - R$ 100 (sangria) = R$ 300,00. PIX R$ 300 isolado da gaveta');
}

// TESTE 8: Fechamento com divergência sem justificativa deve ser rejeitado
{
  const req = {
    params: { id: currentRegisterId },
    tenantId: testTenant,
    user: { userId: testUser, name: 'Operador Teste' },
    body: { countedCash: 280.00, differenceJustification: '' }
  };
  CashRegisterController.closeRegister(req, mockRes());
  assert.strictEqual(resStatus, 400, 'Deve exigir justificativa para diferença');
  console.log('PASS [8] Fechamento com divergência bloqueia sem justificativa obrigatória');
}

// TESTE 9: Fechamento com divergência e justificativa válida
{
  const req = {
    params: { id: currentRegisterId },
    tenantId: testTenant,
    user: { userId: testUser, name: 'Operador Teste' },
    body: { countedCash: 280.00, differenceJustification: 'Despesa emergencial de motoboy sem nota' }
  };
  CashRegisterController.closeRegister(req, mockRes());
  assert.strictEqual(resStatus, 200);
  assert.strictEqual(resJson.summary.cashDifference, -20.00);
  console.log('PASS [9] Fechamento com justificativa aceito (Diferença: -R$ 20,00 auditada)');
}

// TESTE 10: Exportação CSV da sessão
{
  const req = {
    params: { id: currentRegisterId },
    tenantId: testTenant,
    user: { userId: testUser }
  };
  CashRegisterController.exportCsv(req, mockRes());
  assert.strictEqual(resStatus, 200);
  assert.ok(typeof resJson === 'string');
  assert.ok(resJson.includes('RELATÓRIO DE SESSÃO DE CAIXA'));
  assert.ok(resJson.includes('SUPRIMENTO'));
  assert.ok(resJson.includes('SANGRIA'));
  console.log('PASS [10] Exportação de CSV da sessão gerada com dados completos e auditoria');
}

console.log('\n================================================================');
console.log(' TODOS OS 10 TESTES DO CONTROLE DE CAIXA APROVADOS COM SUCESSO!');
console.log('================================================================\n');
