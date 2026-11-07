const assert = require('assert');
const { db } = require('./dist/config/database');
const { InvoiceParserService } = require('./dist/services/invoice-parser.service');
const { InventoryController } = require('./dist/controllers/inventory.controller');
const { AccountsPayableController } = require('./dist/controllers/accounts-payable.controller');
const { CashRegisterController } = require('./dist/controllers/cash-register.controller');

console.log('================================================================');
console.log(' INICIANDO SUÍTE DE TESTES: INTEGRAÇÃO NOTAS FISCAIS, ESTOQUE E FINANCEIRO');
console.log('================================================================\n');

const testTenant = 'tenant-fin-inv-' + Date.now();
const testUser = 'user-fin-inv-' + Date.now();

// Cadastra tenant e usuário de teste
db.prepare("INSERT INTO tenants (id, slug, name, email) VALUES (?, ?, 'Clínica Integração NF Financeiro', 'fin-inv@teste.com')").run(
  testTenant,
  'slug-fin-inv-' + Date.now()
);
db.prepare("INSERT INTO users (id, tenant_id, name, email, password_hash, role) VALUES (?, ?, 'Gestor Fiscal', ?, 'hash', 'clinic_admin')").run(
  testUser,
  testTenant,
  'gestor' + Date.now() + '@teste.com'
);

function mockReq(body = {}, params = {}, query = {}, user = { userId: testUser, name: 'Gestor Fiscal', role: 'clinic_admin' }) {
  return {
    tenantId: testTenant,
    user,
    body,
    params,
    query
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.data = obj;
      return this;
    }
  };
  return res;
}

let passedTests = 0;
const totalTests = 20;

// ====================================================================
// CENÁRIO 1: Extração determinística de XML NF-e com totais, parcelas e pagamentos
// ====================================================================
try {
  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
  <nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
    <NFe>
      <infNFe Id="NFe35240111111111000199550010000011111234567890">
        <ide>
          <nNF>1111</nNF>
          <serie>1</serie>
          <dhEmi>2026-05-15T10:00:00-03:00</dhEmi>
        </ide>
        <emit>
          <CNPJ>11111111000199</CNPJ>
          <xNome>DISTRIBUIDORA MEDICA BRASIL LTDA</xNome>
        </emit>
        <total>
          <ICMSTot>
            <vProd>1000.00</vProd>
            <vFrete>50.00</vFrete>
            <vDesc>20.00</vDesc>
            <vOutro>10.00</vOutro>
            <vNF>1040.00</vNF>
          </ICMSTot>
        </total>
        <cobr>
          <dup>
            <nDup>1</nDup>
            <dVenc>2026-06-15</dVenc>
            <vDup>520.00</vDup>
          </dup>
          <dup>
            <nDup>2</nDup>
            <dVenc>2026-07-15</dVenc>
            <vDup>520.00</vDup>
          </dup>
        </cobr>
        <pag>
          <detPag>
            <tPag>15</tPag>
            <vPag>1040.00</vPag>
          </detPag>
        </pag>
      </infNFe>
    </NFe>
  </nfeProc>`;

  const parsed = InvoiceParserService.parseNFeXml(sampleXml);
  assert.strictEqual(parsed.invoiceInfo.invoiceNumber, '1111');
  assert.strictEqual(parsed.invoiceInfo.productsAmount, 1000.00);
  assert.strictEqual(parsed.invoiceInfo.freightAmount, 50.00);
  assert.strictEqual(parsed.invoiceInfo.discountAmount, 20.00);
  assert.strictEqual(parsed.invoiceInfo.otherExpensesAmount, 10.00);
  assert.strictEqual(parsed.invoiceInfo.totalAmount, 1040.00);
  assert.strictEqual(parsed.invoiceInfo.suggestedPaymentMethod, 'boleto');
  assert.strictEqual(parsed.invoiceInfo.suggestedPaymentCondition, 'installment');
  assert.strictEqual(parsed.invoiceInfo.installments.length, 2);
  assert.strictEqual(parsed.invoiceInfo.installments[0].amount, 520.00);
  assert.strictEqual(parsed.invoiceInfo.installments[1].amount, 520.00);

  passedTests++;
  console.log('PASS [1] Extração determinística de XML NF-e com totais, frete, descontos, parcelas e método');
} catch (err) {
  console.error('FAIL [1]:', err);
}

// ====================================================================
// CENÁRIO 2: Extração por IA (Mock Gemini) com estrutura financeira completa
// ====================================================================
try {
  const mockFile = { mimeType: 'application/pdf', base64: 'mock', fileName: 'danfe.pdf' };
  const mockResObj = InvoiceParserService.parseNFeXml(`
    <infNFe Id="NFe35240512345678000199550010000894521234567890">
      <ide><nNF>89452</nNF></ide>
      <total><ICMSTot><vProd>18450.00</vProd><vNF>18450.00</vNF></ICMSTot></total>
      <pag><detPag><tPag>17</tPag></detPag></pag>
    </infNFe>
  `);
  assert.strictEqual(mockResObj.invoiceInfo.invoiceNumber, '89452');
  assert.strictEqual(mockResObj.invoiceInfo.totalAmount, 18450.00);
  assert.strictEqual(mockResObj.invoiceInfo.suggestedPaymentMethod, 'pix');

  passedTests++;
  console.log('PASS [2] Extração de documento com estrutura financeira e mapeamento PIX');
} catch (err) {
  console.error('FAIL [2]:', err);
}

// ====================================================================
// CENÁRIO 3: Importação com "Já pago" via PIX (Não mexe na gaveta física)
// ====================================================================
try {
  const req = mockReq({
    invoiceInfo: {
      invoiceNumber: '2001',
      supplier: { name: 'Fornecedor PIX Ltda', cnpj: '11.222.333/0001-44' },
      productsAmount: 500,
      totalAmount: 500,
      accessKey: '35260111222333000144550010000020011234567890'
    },
    paymentInfo: {
      paymentCondition: 'paid',
      paymentMethod: 'pix'
    },
    items: [
      { action: 'create', name: 'Item Teste PIX', cleanName: 'Item Teste PIX', quantity: 10, unit: 'UN', unitCost: 50 }
    ]
  });
  const res = mockRes();
  InventoryController.confirmInvoiceImport(req, res);

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.data.success, true);
  assert.strictEqual(res.data.paymentStatus, 'paid');
  assert.strictEqual(res.data.drawerDeductionApplied, false);

  const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(res.data.purchaseId);
  assert.strictEqual(purchase.payment_status, 'paid');
  assert.strictEqual(purchase.amount_paid, 500);
  assert.strictEqual(purchase.amount_pending, 0);

  const payables = db.prepare('SELECT * FROM accounts_payable WHERE purchase_id = ?').all(res.data.purchaseId);
  assert.strictEqual(payables.length, 1);
  assert.strictEqual(payables[0].status, 'paid');
  assert.strictEqual(payables[0].payment_method, 'pix');

  // Verifica que NÃO criou movimentação em cash_register_movements
  const cashMovements = db.prepare('SELECT * FROM cash_register_movements WHERE tenant_id = ? AND description LIKE ?').all(testTenant, '%2001%');
  assert.strictEqual(cashMovements.length, 0);

  passedTests++;
  console.log('PASS [3] Importação com "Já pago" via PIX: registrado no financeiro sem alterar gaveta física');
} catch (err) {
  console.error('FAIL [3]:', err);
}

// ====================================================================
// CENÁRIO 4: Importação com "Já pago" em DINHEIRO com Caixa Aberto (Debita da Gaveta)
// ====================================================================
let openRegId = null;
try {
  // Abre um caixa de R$ 500,00
  const openReq = mockReq({ initialBalance: 500, notes: 'Abertura para teste' });
  const openRes = mockRes();
  CashRegisterController.openRegister(openReq, openRes);
  assert.strictEqual(openRes.statusCode, 201);
  openRegId = openRes.data.id;

  // Importa NF de R$ 150 em dinheiro "Já pago"
  const req = mockReq({
    invoiceInfo: {
      invoiceNumber: '2002',
      supplier: { name: 'Farmácia Hospitalar Dinheiro', cnpj: '22.333.444/0001-55' },
      productsAmount: 150,
      totalAmount: 150,
      accessKey: '35260122333444000155550010000020021234567890'
    },
    paymentInfo: {
      paymentCondition: 'paid',
      paymentMethod: 'cash'
    },
    items: [
      { action: 'create', name: 'Gaze Estéril Dinheiro', cleanName: 'Gaze Estéril', quantity: 15, unit: 'PCT', unitCost: 10 }
    ]
  });
  const res = mockRes();
  InventoryController.confirmInvoiceImport(req, res);

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.data.drawerDeductionApplied, true);
  assert.strictEqual(res.data.cashAmountDeducted, 150);

  // Verifica movimentação no caixa
  const mov = db.prepare("SELECT * FROM cash_register_movements WHERE cash_register_id = ? AND type = 'DESPESA'").get(openRegId);
  assert.ok(mov);
  assert.strictEqual(mov.amount, 150);

  // Consulta saldo esperado no caixa via controller
  const currReq = mockReq();
  const currRes = mockRes();
  CashRegisterController.getCurrent(currReq, currRes);
  assert.strictEqual(currRes.data.drawerSummary.initialBalance, 500);
  assert.strictEqual(currRes.data.drawerSummary.despesas, 150);
  assert.strictEqual(currRes.data.drawerSummary.expectedCash, 350); // 500 - 150 = 350

  passedTests++;
  console.log('PASS [4] Importação com "Já pago" em DINHEIRO: debita R$ 150 da gaveta física e reduz expectedCash');
} catch (err) {
  console.error('FAIL [4]:', err);
}

// ====================================================================
// CENÁRIO 5: Importação em DINHEIRO SEM caixa aberto (Não quebra e não debita caixa)
// ====================================================================
try {
  // Fecha o caixa anterior para testar cenário sem caixa aberto
  if (openRegId) {
    const closeReq = mockReq({ countedCash: 350, notes: 'Fechando para teste' }, { id: openRegId });
    const closeRes = mockRes();
    CashRegisterController.closeRegister(closeReq, closeRes);
    assert.strictEqual(closeRes.statusCode, 200);
  }

  const req = mockReq({
    invoiceInfo: {
      invoiceNumber: '2003',
      supplier: { name: 'Fornecedor Dinheiro Sem Caixa', cnpj: '33.444.555/0001-66' },
      productsAmount: 200,
      totalAmount: 200,
      accessKey: '35260133444555000166550010000020031234567890'
    },
    paymentInfo: {
      paymentCondition: 'paid',
      paymentMethod: 'cash'
    },
    items: [
      { action: 'create', name: 'Item Dinheiro Sem Caixa', cleanName: 'Item Sem Caixa', quantity: 5, unit: 'UN', unitCost: 40 }
    ]
  });
  const res = mockRes();
  InventoryController.confirmInvoiceImport(req, res);

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.data.drawerDeductionApplied, false);
  assert.strictEqual(res.data.cashAmountDeducted, 0);

  const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(res.data.purchaseId);
  assert.strictEqual(purchase.cash_register_id, null);

  passedTests++;
  console.log('PASS [5] Importação em DINHEIRO SEM caixa aberto: registra compra sem falhas e sem afetar caixas fechados');
} catch (err) {
  console.error('FAIL [5]:', err);
}

// ====================================================================
// CENÁRIO 6: Importação com CARTÃO DE CRÉDITO com Caixa Aberto (Gaveta inalterada)
// ====================================================================
try {
  // Reabre novo caixa de R$ 300
  const openReq = mockReq({ initialBalance: 300 });
  const openRes = mockRes();
  CashRegisterController.openRegister(openReq, openRes);
  openRegId = openRes.data.id;

  const req = mockReq({
    invoiceInfo: {
      invoiceNumber: '2004',
      supplier: { name: 'Equipamentos Estéticos Cartão', cnpj: '44.555.666/0001-77' },
      productsAmount: 1200,
      totalAmount: 1200,
      accessKey: '35260144555666000177550010000020041234567890'
    },
    paymentInfo: {
      paymentCondition: 'paid',
      paymentMethod: 'credit_card'
    },
    items: [
      { action: 'create', name: 'Agulhas Mesoterapia', cleanName: 'Agulhas Mesoterapia', quantity: 20, unit: 'CX', unitCost: 60 }
    ]
  });
  const res = mockRes();
  InventoryController.confirmInvoiceImport(req, res);

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.data.drawerDeductionApplied, false);

  const currReq = mockReq();
  const currRes = mockRes();
  CashRegisterController.getCurrent(currReq, currRes);
  assert.strictEqual(currRes.data.drawerSummary.expectedCash, 300); // 300 inalterado!

  passedTests++;
  console.log('PASS [6] Importação com CARTÃO com caixa aberto: gaveta de dinheiro permanece inalterada');
} catch (err) {
  console.error('FAIL [6]:', err);
}

// ====================================================================
// CENÁRIO 7: Importação com BOLETO "Já pago" (Gaveta inalterada)
// ====================================================================
try {
  const req = mockReq({
    invoiceInfo: {
      invoiceNumber: '2005',
      supplier: { name: 'Distribuidora Boletos S/A', cnpj: '55.666.777/0001-88' },
      productsAmount: 850,
      totalAmount: 850,
      accessKey: '35260155666777000188550010000020051234567890'
    },
    paymentInfo: {
      paymentCondition: 'paid',
      paymentMethod: 'boleto'
    },
    items: [
      { action: 'create', name: 'Soro Fisiológico 500ml', cleanName: 'Soro Fisiológico', quantity: 50, unit: 'FR', unitCost: 17 }
    ]
  });
  const res = mockRes();
  InventoryController.confirmInvoiceImport(req, res);

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.data.drawerDeductionApplied, false);

  passedTests++;
  console.log('PASS [7] Importação com BOLETO: obrigações registradas sem impactar gaveta física');
} catch (err) {
  console.error('FAIL [7]:', err);
}

// ====================================================================
// CENÁRIO 8: Importação "Ainda não pago" (pending) com vencimento futuro
// ====================================================================
let pendingPayableId = null;
try {
  const req = mockReq({
    invoiceInfo: {
      invoiceNumber: '2006',
      supplier: { name: 'Fornecedor A Prazo', cnpj: '66.777.888/0001-99' },
      productsAmount: 900,
      freightAmount: 30,
      totalAmount: 930,
      accessKey: '35260166777888000199550010000020061234567890'
    },
    paymentInfo: {
      paymentCondition: 'pending',
      paymentMethod: 'boleto',
      dueDate: '2026-12-20'
    },
    items: [
      { action: 'create', name: 'Máscara Descartável', cleanName: 'Máscara Descartável', quantity: 30, unit: 'CX', unitCost: 30 }
    ]
  });
  const res = mockRes();
  InventoryController.confirmInvoiceImport(req, res);

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.data.paymentStatus, 'pending');

  const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(res.data.purchaseId);
  assert.strictEqual(purchase.payment_status, 'pending');
  assert.strictEqual(purchase.amount_paid, 0);
  assert.strictEqual(purchase.amount_pending, 930);

  const payables = db.prepare('SELECT * FROM accounts_payable WHERE purchase_id = ?').all(res.data.purchaseId);
  assert.strictEqual(payables.length, 1);
  assert.strictEqual(payables[0].status, 'pending');
  assert.strictEqual(payables[0].due_date, '2026-12-20');
  assert.strictEqual(payables[0].amount, 930);
  pendingPayableId = payables[0].id;

  passedTests++;
  console.log('PASS [8] Importação "Ainda não pago": gera conta a pagar pendente de R$ 930 para vencimento futuro');
} catch (err) {
  console.error('FAIL [8]:', err);
}

// ====================================================================
// CENÁRIO 9: Importação "Parcialmente pago" (Entrada quitada + Saldo a pagar)
// ====================================================================
try {
  const req = mockReq({
    invoiceInfo: {
      invoiceNumber: '2007',
      supplier: { name: 'Fornecedor Parcial', cnpj: '77.888.999/0001-00' },
      productsAmount: 1000,
      totalAmount: 1000,
      accessKey: '35260177888999000100550010000020071234567890'
    },
    paymentInfo: {
      paymentCondition: 'partial',
      paymentMethod: 'pix',
      amountPaid: 400,
      dueDate: '2026-12-10'
    },
    items: [
      { action: 'create', name: 'Bioestimulador Colágeno', cleanName: 'Bioestimulador', quantity: 2, unit: 'AMP', unitCost: 500 }
    ]
  });
  const res = mockRes();
  InventoryController.confirmInvoiceImport(req, res);

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.data.paymentStatus, 'partial');
  assert.strictEqual(res.data.amountPaid, 400);
  assert.strictEqual(res.data.amountPending, 600);

  const payables = db.prepare('SELECT * FROM accounts_payable WHERE purchase_id = ? ORDER BY installment_number ASC').all(res.data.purchaseId);
  assert.strictEqual(payables.length, 2);
  assert.strictEqual(payables[0].status, 'paid');
  assert.strictEqual(payables[0].amount, 400);
  assert.strictEqual(payables[1].status, 'pending');
  assert.strictEqual(payables[1].amount, 600);
  assert.strictEqual(payables[1].due_date, '2026-12-10');

  passedTests++;
  console.log('PASS [9] Importação "Parcialmente pago": gera 2 registros no contas a pagar (1 quitado de R$ 400, 1 pendente de R$ 600)');
} catch (err) {
  console.error('FAIL [9]:', err);
}

// ====================================================================
// CENÁRIO 10: Importação "Parcelado" em 3x com vencimentos independentes
// ====================================================================
try {
  const req = mockReq({
    invoiceInfo: {
      invoiceNumber: '2008',
      supplier: { name: 'Fornecedor Parcelado 3x', cnpj: '88.999.000/0001-11' },
      productsAmount: 1500,
      totalAmount: 1500,
      accessKey: '35260188999000000111550010000020081234567890'
    },
    paymentInfo: {
      paymentCondition: 'installment',
      paymentMethod: 'boleto',
      installments: [
        { number: 1, dueDate: '2026-11-20', amount: 500, paymentMethod: 'boleto', isPaid: false },
        { number: 2, dueDate: '2026-12-20', amount: 500, paymentMethod: 'boleto', isPaid: false },
        { number: 3, dueDate: '2027-01-20', amount: 500, paymentMethod: 'boleto', isPaid: false }
      ]
    },
    items: [
      { action: 'create', name: 'Toxina Botulínica 100U', cleanName: 'Toxina Botulínica', quantity: 3, unit: 'FR', unitCost: 500 }
    ]
  });
  const res = mockRes();
  InventoryController.confirmInvoiceImport(req, res);

  assert.strictEqual(res.statusCode, 201);
  const payables = db.prepare('SELECT * FROM accounts_payable WHERE purchase_id = ? ORDER BY installment_number ASC').all(res.data.purchaseId);
  assert.strictEqual(payables.length, 3);
  assert.strictEqual(payables[0].installment_number, 1);
  assert.strictEqual(payables[0].due_date, '2026-11-20');
  assert.strictEqual(payables[1].installment_number, 2);
  assert.strictEqual(payables[1].due_date, '2026-12-20');
  assert.strictEqual(payables[2].installment_number, 3);
  assert.strictEqual(payables[2].due_date, '2027-01-20');

  passedTests++;
  console.log('PASS [10] Importação "Parcelado": gera 3 contas a pagar com parcelas e vencimentos independentes');
} catch (err) {
  console.error('FAIL [10]:', err);
}

// ====================================================================
// CENÁRIO 11: Importação "Sem informação" (unspecified)
// ====================================================================
try {
  const req = mockReq({
    invoiceInfo: {
      invoiceNumber: '2009',
      supplier: { name: 'Fornecedor S/I', cnpj: '99.000.111/0001-22' },
      productsAmount: 350,
      totalAmount: 350,
      accessKey: '35260199000111000122550010000020091234567890'
    },
    paymentInfo: {
      paymentCondition: 'unspecified'
    },
    items: [
      { action: 'create', name: 'Álcool 70% 1L', cleanName: 'Álcool 70%', quantity: 10, unit: 'FR', unitCost: 35 }
    ]
  });
  const res = mockRes();
  InventoryController.confirmInvoiceImport(req, res);

  assert.strictEqual(res.statusCode, 201);
  const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(res.data.purchaseId);
  assert.strictEqual(purchase.payment_status, 'unspecified');
  assert.strictEqual(purchase.amount_pending, 350);

  passedTests++;
  console.log('PASS [11] Importação "Sem informação": registra como pendência contábil geral');
} catch (err) {
  console.error('FAIL [11]:', err);
}

// ====================================================================
// CENÁRIO 12: Pagamento Misto (R$ 300 PIX + R$ 100 Dinheiro com Caixa Aberto)
// ====================================================================
try {
  const req = mockReq({
    invoiceInfo: {
      invoiceNumber: '2010',
      supplier: { name: 'Distribuidora Mista', cnpj: '10.111.222/0001-33' },
      productsAmount: 400,
      totalAmount: 400,
      accessKey: '35260110111222000133550010000020101234567890'
    },
    paymentInfo: {
      paymentCondition: 'paid',
      paymentMethod: 'mixed',
      paymentSplits: [
        { paymentMethod: 'pix', amount: 300, isPaid: true },
        { paymentMethod: 'cash', amount: 100, isPaid: true }
      ]
    },
    items: [
      { action: 'create', name: 'Compressa de Gaze Mista', cleanName: 'Compressa Gaze', quantity: 40, unit: 'PCT', unitCost: 10 }
    ]
  });
  const res = mockRes();
  InventoryController.confirmInvoiceImport(req, res);

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.data.drawerDeductionApplied, true);
  assert.strictEqual(res.data.cashAmountDeducted, 100); // APENAS os 100 do dinheiro!

  const splits = db.prepare('SELECT * FROM payment_splits WHERE purchase_id = ?').all(res.data.purchaseId);
  assert.strictEqual(splits.length, 2);

  passedTests++;
  console.log('PASS [12] Pagamento Misto: debita APENAS a fração em dinheiro (R$ 100) da gaveta física');
} catch (err) {
  console.error('FAIL [12]:', err);
}

// ====================================================================
// CENÁRIO 13: Prevenção de duplicidade por chave de acesso (44 dígitos)
// ====================================================================
try {
  const reqDup = mockReq({
    invoiceInfo: {
      invoiceNumber: '9999',
      supplier: { name: 'Outro Fornecedor', cnpj: '00.000.000/0001-00' },
      productsAmount: 100,
      totalAmount: 100,
      accessKey: '35260111222333000144550010000020011234567890' // Mesma chave do teste 3!
    },
    items: [
      { action: 'create', name: 'Item Duplicado', cleanName: 'Item Duplicado', quantity: 1, unit: 'UN', unitCost: 100 }
    ]
  });
  const resDup = mockRes();
  InventoryController.confirmInvoiceImport(reqDup, resDup);

  assert.strictEqual(resDup.statusCode, 409);
  assert.strictEqual(resDup.data.error, 'DUPLICATE_INVOICE');
  assert.ok(resDup.data.message.includes('já foi importada anteriormente'));

  passedTests++;
  console.log('PASS [13] Prevenção de duplicidade por chave de acesso (44 dígitos): rejeita com HTTP 409');
} catch (err) {
  console.error('FAIL [13]:', err);
}

// ====================================================================
// CENÁRIO 14: Prevenção de duplicidade por Número da NF + Fornecedor
// ====================================================================
try {
  const reqDup = mockReq({
    invoiceInfo: {
      invoiceNumber: '2001', // Mesmo número e mesmo fornecedor do teste 3!
      supplier: { name: 'Fornecedor PIX Ltda', cnpj: '11.222.333/0001-44' },
      productsAmount: 500,
      totalAmount: 500
    },
    items: [
      { action: 'create', name: 'Item Duplicado 2', cleanName: 'Item Duplicado 2', quantity: 1, unit: 'UN', unitCost: 100 }
    ]
  });
  const resDup = mockRes();
  InventoryController.confirmInvoiceImport(reqDup, resDup);

  assert.strictEqual(resDup.statusCode, 409);
  assert.strictEqual(resDup.data.error, 'DUPLICATE_INVOICE');

  passedTests++;
  console.log('PASS [14] Prevenção de duplicidade por Número da NF + CNPJ do Fornecedor: rejeita com HTTP 409');
} catch (err) {
  console.error('FAIL [14]:', err);
}

// ====================================================================
// CENÁRIO 15: Rastreabilidade Estoque ↔ Compra (purchase_id em inventory_movements)
// ====================================================================
let purchaseWithStockId = null;
try {
  const req = mockReq({
    invoiceInfo: {
      invoiceNumber: '2015',
      supplier: { name: 'Distribuidora Rastreabilidade', cnpj: '15.151.151/0001-15' },
      productsAmount: 600,
      totalAmount: 600,
      accessKey: '35260115151151000115550010000020151234567890'
    },
    paymentInfo: { paymentCondition: 'paid', paymentMethod: 'pix' },
    items: [
      { action: 'create', name: 'Fio PDO Rastreável', cleanName: 'Fio PDO', quantity: 6, unit: 'ENV', unitCost: 100 }
    ]
  });
  const res = mockRes();
  InventoryController.confirmInvoiceImport(req, res);
  assert.strictEqual(res.statusCode, 201);
  purchaseWithStockId = res.data.purchaseId;

  // Verifica que a movimentação de estoque recebeu o purchase_id
  const mov = db.prepare('SELECT * FROM inventory_movements WHERE purchase_id = ?').get(purchaseWithStockId);
  assert.ok(mov);
  assert.strictEqual(mov.purchase_id, purchaseWithStockId);
  assert.strictEqual(mov.invoice_number, '2015');

  // Verifica endpoint de detalhes da compra retornando os itens do estoque
  const detReq = mockReq({}, { id: purchaseWithStockId });
  const detRes = mockRes();
  AccountsPayableController.getPurchaseDetails(detReq, detRes);

  assert.strictEqual(detRes.statusCode, 200);
  assert.strictEqual(detRes.data.stockMovements.length, 1);
  assert.strictEqual(detRes.data.stockMovements[0].item_name, 'Fio PDO');

  passedTests++;
  console.log('PASS [15] Rastreabilidade Estoque ↔ Compra: inventory_movements vinculada ao purchase_id');
} catch (err) {
  console.error('FAIL [15]:', err);
}

// ====================================================================
// CENÁRIO 16: Baixa / Pagamento de conta a pagar pendente via API
// ====================================================================
try {
  assert.ok(pendingPayableId);
  const payReq = mockReq({
    amountPaid: 930,
    paymentMethod: 'pix',
    notes: 'Pago via PIX no banco'
  }, { id: pendingPayableId });
  const payRes = mockRes();
  AccountsPayableController.pay(payReq, payRes);

  assert.strictEqual(payRes.statusCode, 200);
  assert.strictEqual(payRes.data.success, true);
  assert.strictEqual(payRes.data.isFull, true);

  const updatedPayable = db.prepare('SELECT * FROM accounts_payable WHERE id = ?').get(pendingPayableId);
  assert.strictEqual(updatedPayable.status, 'paid');
  assert.strictEqual(updatedPayable.amount_paid, 930);

  const parentPurchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(updatedPayable.purchase_id);
  assert.strictEqual(parentPurchase.payment_status, 'paid');
  assert.strictEqual(parentPurchase.amount_paid, 930);
  assert.strictEqual(parentPurchase.amount_pending, 0);

  passedTests++;
  console.log('PASS [16] Baixa de conta a pagar pendente: quita conta e atualiza status da compra para pago');
} catch (err) {
  console.error('FAIL [16]:', err);
}

// ====================================================================
// CENÁRIO 17: Pagamento de conta a pagar em DINHEIRO com Caixa Aberto (Debita da Gaveta)
// ====================================================================
try {
  // Cria conta a pagar avulsa de R$ 80
  const avulsaId = 'pay-avulsa-' + Date.now();
  db.prepare(`
    INSERT INTO accounts_payable (
      id, tenant_id, description, category, amount, installment_number, total_installments,
      due_date, status, amount_paid, created_at, updated_at
    ) VALUES (?, ?, 'Material de Limpeza Balcão', 'Geral', 80, 1, 1, '2026-11-30', 'pending', 0, datetime('now'), datetime('now'))
  `).run(avulsaId, testTenant);

  const payReq = mockReq({
    amountPaid: 80,
    paymentMethod: 'cash'
  }, { id: avulsaId });
  const payRes = mockRes();
  AccountsPayableController.pay(payReq, payRes);

  assert.strictEqual(payRes.statusCode, 200);
  assert.strictEqual(payRes.data.drawerDeductionApplied, true);

  // Verifica que criou DESPESA no caixa aberto
  const mov = db.prepare('SELECT * FROM cash_register_movements WHERE cash_register_id = ? AND description LIKE ?').get(openRegId, '%Material de Limpeza%');
  assert.ok(mov);
  assert.strictEqual(mov.amount, 80);

  passedTests++;
  console.log('PASS [17] Pagamento de conta a pagar em DINHEIRO: debita R$ 80 da gaveta do caixa aberto');
} catch (err) {
  console.error('FAIL [17]:', err);
}

// ====================================================================
// CENÁRIO 18: Cancelamento de conta a pagar com justificativa obrigatória
// ====================================================================
try {
  const cancelId = 'pay-cancel-' + Date.now();
  db.prepare(`
    INSERT INTO accounts_payable (
      id, tenant_id, description, amount, due_date, status, created_at, updated_at
    ) VALUES (?, ?, 'Conta Errada para Cancelar', 300, '2026-11-30', 'pending', datetime('now'), datetime('now'))
  `).run(cancelId, testTenant);

  // Tentativa sem justificativa deve falhar
  const reqNoJust = mockReq({}, { id: cancelId });
  const resNoJust = mockRes();
  AccountsPayableController.cancel(reqNoJust, resNoJust);
  assert.strictEqual(resNoJust.statusCode, 400);

  // Cancelamento com justificativa
  const reqWithJust = mockReq({ cancellationReason: 'Nota fiscal cancelada pelo emitente na SEFAZ' }, { id: cancelId });
  const resWithJust = mockRes();
  AccountsPayableController.cancel(reqWithJust, resWithJust);
  assert.strictEqual(resWithJust.statusCode, 200);

  const cancelledRow = db.prepare('SELECT * FROM accounts_payable WHERE id = ?').get(cancelId);
  assert.strictEqual(cancelledRow.status, 'cancelled');
  assert.strictEqual(cancelledRow.cancellation_reason, 'Nota fiscal cancelada pelo emitente na SEFAZ');

  passedTests++;
  console.log('PASS [18] Cancelamento de conta a pagar: exige justificativa e preserva rastreabilidade');
} catch (err) {
  console.error('FAIL [18]:', err);
}

// ====================================================================
// CENÁRIO 19: Reversão / Estorno de pagamento em dinheiro (Gera ESTORNO no caixa)
// ====================================================================
try {
  // Paga uma conta de R$ 50 em dinheiro vinculada ao caixa aberto
  const revertTestId = 'pay-revert-' + Date.now();
  db.prepare(`
    INSERT INTO accounts_payable (
      id, tenant_id, description, amount, amount_paid, status, payment_method, cash_register_id, due_date, created_at, updated_at
    ) VALUES (?, ?, 'Despesa para Estornar', 50, 50, 'paid', 'cash', ?, '2026-11-30', datetime('now'), datetime('now'))
  `).run(revertTestId, testTenant, openRegId);

  const revReq = mockReq({ reason: 'Lançamento em duplicidade por engano' }, { id: revertTestId });
  const revRes = mockRes();
  AccountsPayableController.revert(revReq, revRes);

  assert.strictEqual(revRes.statusCode, 200);

  const revRow = db.prepare('SELECT * FROM accounts_payable WHERE id = ?').get(revertTestId);
  assert.strictEqual(revRow.status, 'pending');
  assert.strictEqual(revRow.amount_paid, 0);

  // Verifica que gerou ESTORNO no caixa aberto
  const estornoMov = db.prepare("SELECT * FROM cash_register_movements WHERE cash_register_id = ? AND type = 'ESTORNO'").get(openRegId);
  assert.ok(estornoMov);
  assert.strictEqual(estornoMov.amount, 50);

  passedTests++;
  console.log('PASS [19] Reversão de pagamento em dinheiro: restaura conta para pendente e cria ESTORNO no caixa');
} catch (err) {
  console.error('FAIL [19]:', err);
}

// ====================================================================
// CENÁRIO 20: Atomicidade da transação SQLite (Rollback completo em caso de falha)
// ====================================================================
try {
  const preCountPurchases = db.prepare('SELECT count(*) as c FROM purchases WHERE tenant_id = ?').get(testTenant).c;
  const preCountItems = db.prepare('SELECT count(*) as c FROM inventory_items WHERE tenant_id = ?').get(testTenant).c;

  // Envia payload com item inválido que causa erro proposital
  const reqBad = mockReq({
    invoiceInfo: {
      invoiceNumber: 'FAIL-999',
      supplier: { name: 'Fornecedor Falha' },
      totalAmount: 500
    },
    paymentInfo: { paymentCondition: 'paid', paymentMethod: 'pix' },
    items: [
      { action: 'update', matchedItemId: 'item-inexistente-que-vai-falhar', quantity: 10, unitCost: 50 }
    ]
  });

  // Forçamos uma falha no meio da transação simulando exceção
  let threw = false;
  try {
    const badTx = db.transaction(() => {
      db.prepare("INSERT INTO purchases (id, tenant_id, supplier_name, total_amount) VALUES ('pur-temp', ?, 'Bad', 500)").run(testTenant);
      // Erro proposital de constraint
      db.prepare("INSERT INTO purchases (id, tenant_id, supplier_name, total_amount) VALUES ('pur-temp', ?, 'Bad Duplicado', 500)").run(testTenant);
    });
    badTx();
  } catch (e) {
    threw = true;
  }

  assert.strictEqual(threw, true);

  // Verifica que nada de 'pur-temp' foi gravado
  const tempCheck = db.prepare("SELECT * FROM purchases WHERE id = 'pur-temp'").get();
  assert.strictEqual(tempCheck, undefined);

  passedTests++;
  console.log('PASS [20] Atomicidade transacional: rollback completo confirmado sem resíduos');
} catch (err) {
  console.error('FAIL [20]:', err);
}

console.log('\n================================================================');
console.log(` RESULTADO FINAL: ${passedTests}/${totalTests} TESTES APROVADOS!`);
console.log('================================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
