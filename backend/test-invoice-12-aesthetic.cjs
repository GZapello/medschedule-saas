const assert = require('assert');
const { db } = require('./dist/config/database');
const { InvoiceParserService } = require('./dist/services/invoice-parser.service');

async function runTest() {
  console.log('--- TESTE AUTOMATIZADO: IMPORTAÇÃO DE NOTA FISCAL (12 ITENS ESTÉTICA) ---');

  process.env.MOCK_GEMINI_OCR = 'true';
  const testTenant = 't_test_aesthetic_' + Date.now();
  const testUserId = 'u_test_admin_' + Date.now();

  try {
    // 0. Cria tenant e usuário para garantir integridade referencial
    db.prepare(`
      INSERT OR REPLACE INTO tenants (id, slug, name, trade_name, email, phone)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(testTenant, 'clinica-estetica-' + Date.now(), 'Clínica Estética Avançada', 'Zemda Estética', 'contato@zemda.com.br', '11999998888');

    db.prepare(`
      INSERT OR REPLACE INTO users (id, tenant_id, name, email, role, password_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(testUserId, testTenant, 'Dra. Vanessa Biomédica', 'vanessa@zemda.com.br', 'clinic_admin', 'hash');

    // 1. Prepara buffer simulado de DANFE PDF
    const fakePdfBuffer = Buffer.from('%PDF-1.4\n%DANFE NOTA FISCAL ELETRÔNICA\nDistrimed Distribuidora\nCNPJ: 12.345.678/0001-99\n%%EOF');

    console.log('[1/4] Executando InvoiceParserService.parseInvoice em memória...');
    const result = await InvoiceParserService.parseInvoice({
      buffer: fakePdfBuffer,
      fileName: 'NF-89452-distrimed-estetica.pdf',
      mimeType: 'application/pdf',
      tenantId: testTenant
    });

    assert(result, 'Resultado da extração não deve ser nulo');
    assert(result.invoiceInfo, 'invoiceInfo deve estar presente');
    assert.strictEqual(result.invoiceInfo.invoiceNumber, '89452', 'Número da nota deve ser 89452');
    assert.strictEqual(result.invoiceInfo.supplier.cnpj, '12.345.678/0001-99', 'CNPJ deve ser extraído');
    assert.strictEqual(result.items.length, 12, 'Deve extrair exatamente 12 itens de clínica de estética');

    console.log(`✓ 12 itens estéticos extraídos com sucesso:`);
    result.items.forEach((it, idx) => {
      console.log(`   ${idx + 1}. [${it.unit}] ${it.name} | Qtd: ${it.quantity} | Custo: R$ ${it.unitCost} | Lote: ${it.batchNumber || 'N/A'}${it.packMultiplier ? ` | Mult: ${it.packMultiplier}x` : ''}`);
    });

    // 2. Garantir Zero Retention antes da confirmação (nada inserido no banco ainda)
    console.log('[2/4] Verificando isolamento pré-confirmação (Zero Persistência)...');
    const itemsBefore = db.prepare('SELECT COUNT(*) as count FROM inventory_items WHERE tenant_id = ?').get(testTenant);
    assert.strictEqual(itemsBefore.count, 0, 'Nenhum item deve ter sido gravado antes da confirmação');
    console.log('✓ Zero persistência comprovada: 0 itens no banco antes da revisão.');

    // 3. Simula confirmação transacional da importação da nota fiscal
    console.log('[3/4] Executando confirmação transacional da importação...');
    const nfNum = result.invoiceInfo.invoiceNumber || '89452';
    const supplierName = result.invoiceInfo.supplier.name;

    const runImport = db.transaction(() => {
      for (const item of result.items) {
        const itemId = 'inv-' + Math.random().toString(36).slice(2, 10);
        const qty = Number(item.quantity) || 1;
        const unitCost = Number(item.unitCost) || 0;

        db.prepare(`
          INSERT INTO inventory_items (
            id, tenant_id, name, category, brand, quantity, unit,
            batch_number, expiration_date, unit_cost, supplier, ean, ncm, min_stock,
            notes, active, created_at, updated_at
          )
          VALUES (?, ?, ?, 'insumo', ?, ?, ?, ?, ?, ?, ?, ?, ?, 5, ?, 1, datetime('now'), datetime('now'))
        `).run(
          itemId,
          testTenant,
          item.cleanName || item.name,
          item.brand || null,
          qty,
          item.unit || 'UN',
          item.batchNumber || null,
          item.expirationDate || null,
          unitCost,
          supplierName,
          item.ean || null,
          item.ncm || null,
          item.packMultiplier ? `Multiplicador de embalagem original: ${item.packMultiplier} un` : null
        );

        db.prepare(`
          INSERT INTO inventory_movements (
            id, tenant_id, item_id, movement_type, quantity, previous_quantity, new_quantity,
            reason, user_id, invoice_number, unit_cost, batch_number, expiration_date, created_at
          )
          VALUES (?, ?, ?, 'in', ?, 0, ?, 'Entrada por importação de NF-e', ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          'mov-' + Math.random().toString(36).slice(2, 10),
          testTenant,
          itemId,
          qty,
          qty,
          testUserId,
          nfNum,
          unitCost,
          item.batchNumber || null,
          item.expirationDate || null
        );
      }
    });

    runImport();

    // 4. Validação pós-confirmação
    console.log('[4/4] Validando integridade no banco de dados...');
    const itemsAfter = db.prepare('SELECT COUNT(*) as count FROM inventory_items WHERE tenant_id = ?').get(testTenant);
    assert.strictEqual(itemsAfter.count, 12, 'Deve haver 12 itens no estoque após confirmação');

    const movementsAfter = db.prepare('SELECT COUNT(*) as count FROM inventory_movements WHERE tenant_id = ?').get(testTenant);
    assert.strictEqual(movementsAfter.count, 12, 'Deve haver 12 movimentações de entrada registradas');

    // Valida itens específicos e multiplicadores
    const microcanula = db.prepare('SELECT * FROM inventory_items WHERE tenant_id = ? AND name LIKE ?').get(testTenant, '%Microcânula%');
    assert(microcanula, 'Microcânula deve estar cadastrada');
    assert.strictEqual(microcanula.unit, 'CX', 'Unidade da microcânula deve ser CX');
    assert(microcanula.notes.includes('20 un'), 'Nota deve indicar multiplicador de 20 un');

    const toxina = db.prepare('SELECT * FROM inventory_items WHERE tenant_id = ? AND name LIKE ?').get(testTenant, '%Toxina Botulínica%');
    assert(toxina, 'Toxina deve estar cadastrada');
    assert.strictEqual(toxina.batch_number, 'TB2601', 'Lote da Toxina deve ser TB2601');
    assert.strictEqual(toxina.expiration_date, '2027-12-31', 'Validade da Toxina deve ser 2027-12-31');

    console.log('✓ Todos os 12 itens estéticos, lotes, validades e movimentações conferidos com 100% de sucesso!');
  } finally {
    // Limpeza
    db.prepare('DELETE FROM inventory_movements WHERE tenant_id = ?').run(testTenant);
    db.prepare('DELETE FROM inventory_items WHERE tenant_id = ?').run(testTenant);
    db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
    db.prepare('DELETE FROM tenants WHERE id = ?').run(testTenant);
    console.log('✓ Tenant de teste limpo.');
  }

  console.log('--- TESTE CONCLUÍDO COM SUCESSO (PASS 12/12) ---');
}

runTest().catch(err => {
  console.error('FALHA NO TESTE:', err);
  process.exit(1);
});
