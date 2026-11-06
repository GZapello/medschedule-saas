const assert = require('assert');
const { db } = require('./dist/config/database');
const { InvoiceParserService } = require('./dist/services/invoice-parser.service');
const { InventoryController } = require('./dist/controllers/inventory.controller');

console.log('================================================================');
console.log(' INICIANDO TESTES DE IMPORTAÇÃO INTELIGENTE DE NOTAS FISCAIS');
console.log('================================================================\n');

const testTenant = 'test-tenant-inv-' + Date.now();
const testUser = 'user-inv-' + Date.now();

// Cadastrar tenant e usuário
db.prepare("INSERT OR IGNORE INTO tenants (id, slug, name, email) VALUES (?, ?, 'Clínica Estoque Teste', 'estoque@teste.com')").run(testTenant, 'slug-inv-' + Date.now());
db.prepare("INSERT OR IGNORE INTO users (id, tenant_id, name, email, password_hash, role) VALUES (?, ?, 'Gestor Estoque', ?, 'hash', 'clinic_admin')").run(testUser, testTenant, 'gestor' + Date.now() + '@teste.com');

// Cadastrar item pré-existente no estoque da clínica para testar correspondência automática
const existingItemId = 'item-existente-1';
db.prepare(`
  INSERT OR REPLACE INTO inventory_items (
    id, tenant_id, name, category, product_type, brand, presentation, volume_ml,
    quantity, unit, batch_number, expiration_date, unit_cost, supplier, min_stock, active, ean
  ) VALUES (?, ?, 'Luva Látex Procedimento Tam M', 'Descartáveis', 'insumo', 'Supermax', 'caixa', NULL, 10, 'CX', 'LOTE-ANTIGO', '2026-12-31', 35.00, 'Distribuidora Antiga', 5, 1, '7891234567890')
`).run(existingItemId, testTenant);

// Exemplo realístico de XML SEFAZ NF-e
const sampleNFeXml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe35240112345678000199550010000012341234567890" versao="4.00">
      <ide>
        <nNF>1234</nNF>
        <serie>1</serie>
        <dhEmi>2026-05-10T14:30:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>12345678000199</CNPJ>
        <xNome>MED SUPPLIES DISTRIBUIDORA HOSPITALAR LTDA</xNome>
        <xFant>MED SUPPLIES</xFant>
      </emit>
      <det nItem="1">
        <prod>
          <cProd>LUV-001</cProd>
          <cEAN>7891234567890</cEAN>
          <xProd>LUVA LATEX PROCEDIMENTO TAM M CX C/ 100</xProd>
          <NCM>40151900</NCM>
          <uCom>CX</uCom>
          <qCom>5.0000</qCom>
          <vUnCom>38.5000</vUnCom>
          <vProd>192.50</vProd>
          <rastro>
            <nLote>L2026-X1</nLote>
            <dVal>2028-05-01</dVal>
          </rastro>
        </prod>
      </det>
      <det nItem="2">
        <prod>
          <cProd>AGU-020</cProd>
          <cEAN>SEM GTIN</cEAN>
          <xProd>AGULHA DESCARTAVEL 25X7 MM EMB C/ 100</xProd>
          <NCM>90183219</NCM>
          <uCom>PCT</uCom>
          <qCom>2.0000</qCom>
          <vUnCom>22.0000</vUnCom>
          <vProd>44.00</vProd>
          <rastro>
            <nLote>AG-9988</nLote>
            <dVal>2029-01-15</dVal>
          </rastro>
        </prod>
      </det>
      <total>
        <ICMSTot>
          <vNF>236.50</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>`;

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
    }
  };
  return res;
}

// TESTE 1: Parser determinístico de XML SEFAZ em memória
(async () => {
  const result = await InvoiceParserService.parseInvoice({
    buffer: Buffer.from(sampleNFeXml, 'utf-8'),
    fileName: 'nota_fiscal_1234.xml',
    mimeType: 'text/xml',
    tenantId: testTenant
  });

  assert.strictEqual(result.invoiceInfo.invoiceNumber, '1234');
  assert.strictEqual(result.invoiceInfo.series, '1');
  assert.strictEqual(result.invoiceInfo.supplier.cnpj, '12345678000199');
  assert.strictEqual(result.invoiceInfo.totalAmount, 236.50);
  assert.strictEqual(result.items.length, 2);
  console.log('PASS [1] Extração estruturada de cabeçalho e totais da NF-e SEFAZ');

  // TESTE 2: Extração de Lote, Validade e Multiplicador de Embalagem
  const item1 = result.items[0];
  const item2 = result.items[1];
  assert.strictEqual(item1.batchNumber, 'L2026-X1');
  assert.strictEqual(item1.expirationDate, '2028-05-01');
  assert.strictEqual(item1.quantity, 5);
  assert.strictEqual(item1.unitCost, 38.50);
  assert.strictEqual(item1.packMultiplier, 100);
  console.log('PASS [2] Rastreabilidade de lote, data de validade e multiplicador de embalagem (100 un)');

  // TESTE 3: Correspondência inteligente com catálogo existente (Match por EAN)
  assert.strictEqual(item1.action, 'update', 'Item 1 possui mesmo EAN e deve sugerir update');
  assert.strictEqual(item1.matchedItemId, existingItemId);
  assert.strictEqual(item2.action, 'create', 'Item 2 é novo e deve sugerir create');
  console.log('PASS [3] Correspondência automática com estoque existente da clínica (Match por EAN 7891234567890)');

  // TESTE 4: Endpoint de Parsing via Controller
  {
    const req = {
      tenantId: testTenant,
      user: { userId: testUser },
      body: {
        fileBase64: Buffer.from(sampleNFeXml, 'utf-8').toString('base64'),
        fileName: 'nfe.xml',
        mimeType: 'text/xml'
      }
    };
    await InventoryController.parseInvoice(req, mockRes());
    assert.strictEqual(resStatus, 200);
    assert.strictEqual(resJson.items.length, 2);
    console.log('PASS [4] Endpoint POST /v1/inventory/invoices/parse responde com itens e metadados');
  }

  // TESTE 5: Confirmação e entrada transacional no estoque
  {
    const req = {
      tenantId: testTenant,
      user: { userId: testUser },
      body: {
        invoiceInfo: result.invoiceInfo,
        items: [
          {
            action: 'update',
            matchedItemId: existingItemId,
            name: item1.cleanName,
            quantity: 5,
            unitCost: 38.50,
            batchNumber: 'L2026-X1',
            expirationDate: '2028-05-01',
            ean: item1.ean,
            ncm: item1.ncm
          },
          {
            action: 'create',
            name: 'Agulha Descartável 25x7 mm',
            category: 'Injetáveis',
            productType: 'insumo',
            quantity: 2,
            unit: 'PCT',
            unitCost: 22.00,
            batchNumber: 'AG-9988',
            expirationDate: '2029-01-15',
            ncm: item2.ncm
          }
        ]
      }
    };

    InventoryController.confirmInvoiceImport(req, mockRes());
    assert.strictEqual(resStatus, 201);
    assert.strictEqual(resJson.createdCount, 1);
    assert.strictEqual(resJson.updatedCount, 1);
    console.log('PASS [5] Endpoint POST /v1/inventory/invoices/confirm executa transação com sucesso');
  }

  // TESTE 6: Verificação de persistência e saldo atualizado no banco
  const updatedExisting = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(existingItemId);
  assert.strictEqual(updatedExisting.quantity, 15, 'Saldo anterior 10 + 5 da NF = 15');
  assert.strictEqual(updatedExisting.unit_cost, 38.50, 'Custo atualizado para 38.50');
  assert.strictEqual(updatedExisting.batch_number, 'L2026-X1');

  const createdNew = db.prepare("SELECT * FROM inventory_items WHERE tenant_id = ? AND name LIKE '%Agulha%'").get(testTenant);
  assert.ok(createdNew, 'Item novo deve ter sido inserido');
  assert.strictEqual(createdNew.quantity, 2);
  assert.strictEqual(createdNew.unit_cost, 22.00);
  console.log('PASS [6] Saldo do item existente atualizado (10 -> 15) e novo item cadastrado no estoque');

  // TESTE 7: Verificação do Livro de Movimentações (inventory_movements)
  const movs = db.prepare('SELECT * FROM inventory_movements WHERE tenant_id = ? ORDER BY created_at DESC').all(testTenant);
  assert.strictEqual(movs.length, 2, 'Devem existir 2 movimentações de entrada');
  assert.strictEqual(movs[0].invoice_number, '1234');
  assert.strictEqual(movs[1].invoice_number, '1234');
  console.log('PASS [7] Rastreabilidade completa registrada no livro de movimentações com vínculo de NF nº 1234');

  console.log('\n================================================================');
  console.log(' TODOS OS 7 TESTES DE IMPORTAÇÃO DE NOTAS FISCAIS FORAM APROVADOS!');
  console.log('================================================================\n');
})();
