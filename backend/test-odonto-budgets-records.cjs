const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const express = require('express');
const bcrypt = require('bcryptjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-odonto-test-'));
process.env.DATABASE_PATH = path.join(root, 'test.sqlite');
process.env.JWT_SECRET = 'local-test-jwt-secret-must-be-long-enough-12345';

const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');

const app = express();
app.use(express.json());
app.use('/api', require('./dist/routes').default);

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const tenantId = 'ten-odonto-test';
  const dentistUserId = 'user-dentist-1';
  const dentistProfId = 'prof-dentist-1';
  const patientId = 'pat-test-1';

  try {
    console.log('--- Configurando fixtures de teste ---');

    // 1. Cria Tenant
    db.prepare(`
      INSERT INTO tenants (id, slug, name, trade_name, cnpj_cpf, status, email)
      VALUES (?, 'odonto-prime', 'Clínica Odonto Prime', 'Odonto Prime', '12345678000199', 'active', 'contato@odontoprime.test')
    `).run(tenantId);

    // 2. Cria Usuário Dentista
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, profession_name, zemda_odonto_enabled)
      VALUES (?, ?, 'Dr. Silva Dentista', 'dentista@odonto.test', ?, 'professional', 'active', 'Cirurgião-Dentista', 1)
    `).run(dentistUserId, tenantId, bcrypt.hashSync('pass123', 4));

    // 2b. Cria Vínculo em clinic_users
    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, zemda_odonto_enabled)
      VALUES ('cu-dentist-1', ?, ?, 'professional', 'active', 0, 1)
    `).run(tenantId, dentistUserId);

    // 3. Cria Profissional Dentista
    db.prepare(`
      INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, registration_type, registration_number, active, zemda_odonto_enabled)
      VALUES (?, ?, ?, 'Dr. Silva Dentista', 'prof-dentista', 'CRO', 'SP-12345', 1, 1)
    `).run(dentistProfId, tenantId, dentistUserId);

    // 4. Cria Paciente
    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, cpf, phone, email, active)
      VALUES (?, ?, 'Paciente Odonto Silva', '11122233344', '11988887777', 'paciente@odonto.test', 1)
    `).run(patientId, tenantId);

    // Gera token JWT do dentista
    const dentistToken = generateToken({
      userId: dentistUserId,
      tenantId,
      role: 'professional',
      email: 'dentista@odonto.test',
      name: 'Dr. Silva Dentista'
    });

    const headers = {
      'Authorization': `Bearer ${dentistToken}`,
      'Content-Type': 'application/json'
    };

    console.log('\n--- Teste 1: Validação do botão Gerar Orçamento / Salvar ---');

    // a. Sem paciente -> 400
    const resNoPatient = await fetch(`${base}/v1/dentistry/treatment-plans`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: 'Plano Sem Paciente', items: [{ procedure: 'Profilaxia', value: 100 }] })
    });
    assert.equal(resNoPatient.status, 400, 'Deve rejeitar criação sem paciente');
    const jsonNoPatient = await resNoPatient.json();
    assert.ok(jsonNoPatient.error.includes('Paciente'), 'Mensagem de erro deve ser explicativa');

    // b. Sem título -> 400
    const resNoTitle = await fetch(`${base}/v1/dentistry/treatment-plans`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ patientId, title: '  ', items: [{ procedure: 'Profilaxia', value: 100 }] })
    });
    assert.equal(resNoTitle.status, 400, 'Deve rejeitar criação sem título');

    // c. Sem itens -> 400
    const resNoItems = await fetch(`${base}/v1/dentistry/treatment-plans`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ patientId, title: 'Plano Sem Itens', items: [] })
    });
    assert.equal(resNoItems.status, 400, 'Deve rejeitar criação sem itens');

    // d. Salvar plano completo válido
    const planPayload = {
      patientId,
      title: 'Tratamento Reabilitador Misto',
      items: [
        { tooth: '16', face: 'MOD', procedure: 'Restauração Resina', value: 250 },
        { tooth: '21', face: 'V', procedure: 'Faceta Estética', value: 600 }
      ],
      totalValue: 850,
      discountValue: 50,
      finalValue: 800,
      paymentTerms: 'Entrada de R$ 300 + 2x R$ 250',
      notes: 'Iniciar após profilaxia e raspagem'
    };

    const resCreatePlan = await fetch(`${base}/v1/dentistry/treatment-plans`, {
      method: 'POST',
      headers,
      body: JSON.stringify(planPayload)
    });

    assert.equal(resCreatePlan.status, 201, 'Deve salvar o plano com 201');
    const planCreated = await resCreatePlan.json();
    assert.ok(planCreated.id, 'Deve retornar ID do plano');
    assert.ok(planCreated.budgetId, 'Deve retornar budgetId gerado');
    assert.ok(planCreated.budgetNumber, 'Deve retornar budgetNumber formatado');
    console.log('✓ Plano criado com sucesso:', planCreated.id, 'Orçamento:', planCreated.budgetNumber);

    console.log('\n--- Teste 2: Integração com tabela budgets e budget_items ---');

    // Verifica persistência na tabela dental_treatment_plans
    const planRow = db.prepare('SELECT * FROM dental_treatment_plans WHERE id = ?').get(planCreated.id);
    assert.ok(planRow, 'Plano deve existir em dental_treatment_plans');
    assert.equal(planRow.budget_id, planCreated.budgetId, 'Plano deve guardar o budget_id');
    assert.equal(planRow.total_value, 850);
    assert.equal(planRow.discount_value, 50);
    assert.equal(planRow.final_value, 800);

    // Verifica persistência na tabela budgets
    const budgetRow = db.prepare('SELECT * FROM budgets WHERE id = ?').get(planCreated.budgetId);
    assert.ok(budgetRow, 'Orçamento deve existir na tabela budgets');
    assert.equal(budgetRow.budget_type, 'patient');
    assert.equal(budgetRow.patient_id, patientId);
    assert.equal(budgetRow.total_amount, 800);
    assert.equal(budgetRow.discount, 50);
    assert.equal(budgetRow.status, 'draft');

    // Verifica mapeamento em budget_items com dente e face
    const itemsRows = db.prepare('SELECT * FROM budget_items WHERE budget_id = ?').all(planCreated.budgetId);
    assert.equal(itemsRows.length, 2, 'Deve ter criado 2 itens em budget_items');
    const item16 = itemsRows.find(i => i.description.includes('Dente 16'));
    assert.ok(item16, 'Item Dente 16 deve existir em budget_items');
    assert.ok(item16.description.includes('(MOD)'), 'Descrição deve incluir face MOD');
    assert.equal(item16.unit_price, 250);

    const item21 = itemsRows.find(i => i.description.includes('Dente 21'));
    assert.ok(item21, 'Item Dente 21 deve existir em budget_items');
    assert.equal(item21.unit_price, 600);
    console.log('✓ Procedimentos mapeados corretamente em budget_items:', itemsRows.map(i => i.description));

    // Verifica listagem de orçamentos pelo endpoint geral de orçamentos (Gestão -> Orçamentos)
    const resListBudgets = await fetch(`${base}/v1/budgets?budgetType=patient`, { headers });
    assert.equal(resListBudgets.status, 200);
    const budgetsList = await resListBudgets.json();
    const foundBudget = budgetsList.find(b => b.id === planCreated.budgetId);
    assert.ok(foundBudget, 'Orçamento odontológico deve aparecer na listagem geral de orçamentos');
    assert.equal(foundBudget.patient_name, 'Paciente Odonto Silva');
    assert.equal(foundBudget.total_amount, 800);

    // Verifica detalhes do orçamento geral com seus itens
    const resBudgetDetails = await fetch(`${base}/v1/budgets/${planCreated.budgetId}`, { headers });
    assert.equal(resBudgetDetails.status, 200);
    const budgetDetails = await resBudgetDetails.json();
    assert.equal(budgetDetails.items.length, 2);
    assert.equal(budgetDetails.tenant.name, 'Clínica Odonto Prime');
    console.log('✓ Orçamento odontológico perfeitamente integrado à área geral de Orçamentos');

    // Atualização de status: dental_treatment_plans <-> budgets sincronizados
    const resStatus = await fetch(`${base}/v1/dentistry/treatment-plans/${planCreated.id}/status`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ status: 'approved' })
    });
    assert.equal(resStatus.status, 200);

    const updatedBudget = db.prepare('SELECT status FROM budgets WHERE id = ?').get(planCreated.budgetId);
    assert.equal(updatedBudget.status, 'approved', 'Status em budgets deve sincronizar para approved');
    console.log('✓ Sincronização de status entre plano odontológico e orçamento geral OK');

    console.log('\n--- Teste 3: Laboratório de Prótese (Fluxo e 6 Colunas Kanban) ---');

    // a. Criar prótese com todas as datas e campos novos
    const prostheticPayload = {
      patientId,
      labName: 'Lab Zircônia Expert',
      workType: 'Coroa Zircônia Anatômica',
      toothNumber: '16',
      shadeColor: 'VITA 2M2',
      material: 'Zircônia Translúcida',
      sentDate: '2026-09-01',
      expectedDate: '2026-09-10', // Data no passado -> atrasado
      costValue: 420,
      status: 'sent_to_lab',
      notes: 'Capacho cerâmico espesso na face oclusal'
    };

    const resProsthetic = await fetch(`${base}/v1/dentistry/prosthetics`, {
      method: 'POST',
      headers,
      body: JSON.stringify(prostheticPayload)
    });
    assert.equal(resProsthetic.status, 201);
    const createdProsthetic = await resProsthetic.json();
    const labId = createdProsthetic.id;
    assert.ok(labId);
    console.log('✓ Prótese criada no laboratório:', labId);

    // b. Testa todos os 6 estados do Kanban
    const stages = ['in_production', 'delivered_to_clinic', 'tested_adjusted', 'installed', 'canceled'];
    for (const stage of stages) {
      const resStage = await fetch(`${base}/v1/dentistry/prosthetics/${labId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ status: stage })
      });
      assert.equal(resStage.status, 200, `Transição para status '${stage}' deve ser aceita`);
      const row = db.prepare('SELECT status FROM dental_prosthetics_lab WHERE id = ?').get(labId);
      assert.equal(row.status, stage);
    }
    console.log('✓ Todas as etapas do Kanban (inclusive canceled) persistem corretamente');

    // c. Testar detecção de atraso (isOverdue)
    // Reabre para in_production com expectedDate no passado
    await fetch(`${base}/v1/dentistry/prosthetics/${labId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ status: 'in_production', expectedDate: '2020-01-01' })
    });

    const resPending = await fetch(`${base}/v1/dentistry/prosthetics-lab/pending`, { headers });
    assert.equal(resPending.status, 200);
    const pendingList = await resPending.json();
    const itemPending = pendingList.find(p => p.id === labId);
    assert.ok(itemPending, 'Item deve constar na lista de pendentes');
    assert.equal(itemPending.isOverdue, true, 'isOverdue deve ser true para data prevista ultrapassada');
    assert.equal(itemPending.patient_name, 'Paciente Odonto Silva');
    console.log('✓ Cálculo de atraso (isOverdue) e dados do paciente OK');

    console.log('\n--- Teste 4: Prontuário Universal para Todos os Módulos Clínicos ---');

    // Consulta os registros universais em records gerados para o paciente
    const resClinicalRecords = await fetch(`${base}/v1/clinical-records/patient/${patientId}`, { headers });
    assert.equal(resClinicalRecords.status, 200);
    const records = await resClinicalRecords.json();

    assert.ok(records.length >= 2, 'Deve conter registros universais para plano de tratamento e prótese');

    const dentalPlanRecord = records.find(r => r.source_type === 'dental_treatment_plan');
    assert.ok(dentalPlanRecord, 'Registro universal do plano odontológico deve existir');
    assert.equal(dentalPlanRecord.module_type, 'ZemdaOdonto');
    assert.ok(dentalPlanRecord.title.includes('Plano de Tratamento'));
    assert.ok(dentalPlanRecord.clinical_evolution.includes('Valor Bruto'));
    assert.ok(dentalPlanRecord.clinical_evolution.includes('Dente 16'));
    assert.equal(dentalPlanRecord.source_id, planCreated.id);

    const prostheticRecord = records.find(r => r.source_type === 'dental_prosthetics_lab');
    assert.ok(prostheticRecord, 'Registro universal da prótese deve existir');
    assert.equal(prostheticRecord.module_type, 'ZemdaOdonto');
    assert.ok(prostheticRecord.title.includes('Laboratório de Prótese'));
    assert.equal(prostheticRecord.source_id, labId);

    // Teste de Idempotência: salvar/atualizar novamente não deve duplicar o registro no prontuário universal
    const initialRecordsCount = db.prepare('SELECT count(*) as count FROM records WHERE patient_id = ?').get(patientId).count;
    await fetch(`${base}/v1/dentistry/treatment-plans/${planCreated.id}/status`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ status: 'approved' })
    });
    const finalRecordsCount = db.prepare('SELECT count(*) as count FROM records WHERE patient_id = ?').get(patientId).count;
    assert.equal(finalRecordsCount, initialRecordsCount, 'Idempotência garantida: contagem de prontuários não deve aumentar');
    console.log('✓ Idempotência e Prontuário Universal verificados com sucesso (sem duplicidade)');

    console.log('\n--- Teste 5: Exclusão Segura de Orçamentos (DELETE /v1/budgets/:id) ---');

    // a. Tentar excluir ID inexistente -> 404
    const resDelNonExistent = await fetch(`${base}/v1/budgets/bdg-non-existent`, {
      method: 'DELETE',
      headers
    });
    assert.equal(resDelNonExistent.status, 404, 'Deve retornar 404 para orçamento inexistente');

    // b. Excluir o orçamento vinculado ao plano odontológico (planCreated.budgetId)
    const resDelOdontoBudget = await fetch(`${base}/v1/budgets/${planCreated.budgetId}`, {
      method: 'DELETE',
      headers
    });
    assert.equal(resDelOdontoBudget.status, 200, 'Deve excluir o orçamento com sucesso (200)');
    const delJson = await resDelOdontoBudget.json();
    assert.equal(delJson.id, planCreated.budgetId);

    // c. Verifica se o orçamento foi removido da tabela budgets
    const budgetDeletedRow = db.prepare('SELECT * FROM budgets WHERE id = ?').get(planCreated.budgetId);
    assert.equal(budgetDeletedRow, undefined, 'Orçamento não deve mais existir na tabela budgets');

    // d. Verifica se os itens de budget_items foram excluídos
    const budgetItemsDeletedRows = db.prepare('SELECT * FROM budget_items WHERE budget_id = ?').all(planCreated.budgetId);
    assert.equal(budgetItemsDeletedRows.length, 0, 'Itens do orçamento devem ter sido excluídos');

    // e. Verifica se o plano odontológico continuou existindo mas com budget_id = null
    const planAfterBudgetDelete = db.prepare('SELECT * FROM dental_treatment_plans WHERE id = ?').get(planCreated.id);
    assert.ok(planAfterBudgetDelete, 'Plano odontológico deve continuar existindo');
    assert.equal(planAfterBudgetDelete.budget_id, null, 'budget_id do plano deve ter sido desvinculado para NULL');
    assert.equal(planAfterBudgetDelete.final_value, 800, 'Dados clínicos do plano devem permanecer intactos');

    // f. Verifica se o prontuário universal não foi apagado
    const recordAfterBudgetDelete = db.prepare('SELECT * FROM records WHERE source_id = ?').get(planCreated.id);
    assert.ok(recordAfterBudgetDelete, 'Prontuário universal do paciente não deve ser apagado');

    console.log('✓ Exclusão de orçamento executada com sucesso, desvinculando plano odontológico e preservando prontuário');

    console.log('\n--- Teste 6: Produtos/Insumos do Estoque no Orçamento do ZemdaOdonto ---');

    // 1. Cadastra itens de estoque para o tenant e para outro tenant
    const itemResinaId = 'inv-resina-350';
    const itemLidoId = 'inv-lido-tubetes';
    const itemOtherTenantId = 'inv-other-item';

    db.prepare(`
      INSERT INTO inventory_items (id, tenant_id, name, brand, category, quantity, unit, unit_cost, active, created_at, updated_at)
      VALUES (?, ?, 'Resina Filtek Z350 XT', '3M', 'Odontologia', 25, 'un', 45.00, 1, datetime('now'), datetime('now'))
    `).run(itemResinaId, tenantId);

    db.prepare(`
      INSERT INTO inventory_items (id, tenant_id, name, brand, category, quantity, unit, unit_cost, active, created_at, updated_at)
      VALUES (?, ?, 'Anestésico Lidocaína 2%', 'DFL', 'Odontologia', 50, 'tubetes', 5.00, 1, datetime('now'), datetime('now'))
    `).run(itemLidoId, tenantId);

    db.prepare(`
      INSERT INTO tenants (id, slug, name, trade_name, cnpj_cpf, status, email)
      VALUES ('ten-other-tenant-999', 'other-clinic', 'Outra Clínica', 'Outra Clínica', '99999999000199', 'active', 'other@test.com')
    `).run();

    db.prepare(`
      INSERT INTO inventory_items (id, tenant_id, name, brand, category, quantity, unit, unit_cost, active, created_at, updated_at)
      VALUES (?, 'ten-other-tenant-999', 'Item de Outra Clínica', 'Marca X', 'Geral', 10, 'un', 10.00, 1, datetime('now'), datetime('now'))
    `).run(itemOtherTenantId);

    const initialResinaStock = db.prepare('SELECT quantity FROM inventory_items WHERE id = ?').get(itemResinaId).quantity;
    const initialLidoStock = db.prepare('SELECT quantity FROM inventory_items WHERE id = ?').get(itemLidoId).quantity;
    const initialMovementsCount = db.prepare('SELECT count(*) as count FROM inventory_movements WHERE tenant_id = ?').get(tenantId).count;

    // 2. Tentar criar orçamento com produto de outro tenant -> deve rejeitar com 400
    const resInvalidTenantProd = await fetch(`${base}/v1/dentistry/treatment-plans`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        patientId,
        title: 'Orçamento com Insumo de Outro Tenant',
        items: [
          { procedure: 'Consulta Avaliativa', value: 100 },
          { itemType: 'product', productId: itemOtherTenantId, productName: 'Item Outro Tenant', quantity: 1, unitPrice: 50 }
        ]
      })
    });
    assert.equal(resInvalidTenantProd.status, 400, 'Deve rejeitar produto pertencente a outro tenant');
    const errJsonOther = await resInvalidTenantProd.json();
    assert.ok(errJsonOther.error.includes('não encontrado no estoque'), 'Erro deve informar que o produto não foi encontrado');
    console.log('✓ Validação de segurança multi-tenant: rejeitou produto de outro tenant');

    // 3. Tentar criar orçamento com productId inexistente -> deve rejeitar com 400
    const resNonExistentProd = await fetch(`${base}/v1/dentistry/treatment-plans`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        patientId,
        title: 'Orçamento com Insumo Inexistente',
        items: [
          { itemType: 'product', productId: 'inv-fake-id-999', productName: 'Inexistente', quantity: 1, unitPrice: 50 }
        ]
      })
    });
    assert.equal(resNonExistentProd.status, 400, 'Deve rejeitar produto inexistente');
    console.log('✓ Validação de produto inexistente rejeitada com status 400');

    // 4. Salvar plano de tratamento misto válido (procedimentos + insumos de estoque)
    const mixedPlanPayload = {
      patientId,
      title: 'Plano Reabilitador com Insumos Previstos',
      items: [
        { tooth: '11', face: 'V', procedure: 'Clareamento Dental em Consultório', value: 800 },
        {
          itemType: 'product',
          productId: itemResinaId,
          productName: 'Resina Filtek Z350 XT',
          brand: '3M',
          quantity: 2,
          unit: 'un',
          unitPrice: 80,
          totalPrice: 160
        },
        {
          itemType: 'product',
          productId: itemLidoId,
          productName: 'Anestésico Lidocaína 2%',
          brand: 'DFL',
          quantity: 4,
          unit: 'tubetes',
          unitPrice: 15,
          totalPrice: 60
        }
      ],
      totalValue: 1020, // 800 + 160 + 60
      discountValue: 20,
      finalValue: 1000,
      paymentTerms: 'Entrada de R$ 500 + 1x R$ 500',
      notes: 'Valores comerciais de insumos calculados com margem'
    };

    const resMixedPlan = await fetch(`${base}/v1/dentistry/treatment-plans`, {
      method: 'POST',
      headers,
      body: JSON.stringify(mixedPlanPayload)
    });

    assert.equal(resMixedPlan.status, 201, 'Deve criar orçamento misto com sucesso');
    const mixedCreated = await resMixedPlan.json();
    assert.ok(mixedCreated.id);
    assert.ok(mixedCreated.budgetId);
    console.log('✓ Orçamento misto criado com sucesso:', mixedCreated.id, 'Orçamento:', mixedCreated.budgetNumber);

    // 5. REGRA CRÍTICA: Validar que NÃO HOUVE BAIXA NO ESTOQUE
    const resinaStockAfter = db.prepare('SELECT quantity FROM inventory_items WHERE id = ?').get(itemResinaId).quantity;
    const lidoStockAfter = db.prepare('SELECT quantity FROM inventory_items WHERE id = ?').get(itemLidoId).quantity;
    const movementsCountAfter = db.prepare('SELECT count(*) as count FROM inventory_movements WHERE tenant_id = ?').get(tenantId).count;

    assert.equal(resinaStockAfter, initialResinaStock, 'Saldo de Resina deve permanecer IDÊNTICO (25)');
    assert.equal(lidoStockAfter, initialLidoStock, 'Saldo de Lidocaína deve permanecer IDÊNTICO (50)');
    assert.equal(movementsCountAfter, initialMovementsCount, 'Nenhuma movimentação de estoque deve ter sido gerada');
    console.log('✓ REGRA CRÍTICA VALIDADA: Saldo de estoque 100% inalterado (25 un e 50 tubetes). Zero movimentações criadas.');

    // 6. Verificar mapeamento em budget_items com item_type correto
    const mixedBudgetItems = db.prepare('SELECT * FROM budget_items WHERE budget_id = ? ORDER BY id ASC').all(mixedCreated.budgetId);
    assert.equal(mixedBudgetItems.length, 3, 'Deve ter criado 3 itens em budget_items');

    const serviceItem = mixedBudgetItems.find(i => i.item_type === 'service');
    assert.ok(serviceItem, 'Item de serviço deve existir');
    assert.ok(serviceItem.description.includes('Clareamento Dental'));
    assert.equal(serviceItem.unit_price, 800);
    assert.equal(serviceItem.total_price, 800);

    const productResina = mixedBudgetItems.find(i => i.item_type === 'product' && i.reference_id === itemResinaId);
    assert.ok(productResina, 'Item de produto Resina deve existir com item_type = product');
    assert.equal(productResina.quantity, 2);
    assert.equal(productResina.unit_price, 80);
    assert.equal(productResina.total_price, 160);

    const productLido = mixedBudgetItems.find(i => i.item_type === 'product' && i.reference_id === itemLidoId);
    assert.ok(productLido, 'Item de produto Lidocaína deve existir com item_type = product');
    assert.equal(productLido.quantity, 4);
    assert.equal(productLido.unit_price, 15);
    assert.equal(productLido.total_price, 60);
    console.log('✓ Itens de produtos e procedimentos persistidos com item_type e valores corretos em budget_items');

    // 7. Verificar detalhes do orçamento via GET /v1/budgets/:id
    const resGetBudget = await fetch(`${base}/v1/budgets/${mixedCreated.budgetId}`, { headers });
    assert.equal(resGetBudget.status, 200);
    const budgetData = await resGetBudget.json();
    assert.equal(budgetData.items.length, 3);
    assert.equal(budgetData.budget.total_amount, 1000);
    console.log('✓ GET /v1/budgets/:id retorna todos os itens mistos com quantidades e valores para visualização/impressão');

    // 8. Verificar prontuário universal em records: seções separadas
    const resRecords = await fetch(`${base}/v1/clinical-records/patient/${patientId}`, { headers });
    assert.equal(resRecords.status, 200);
    const recordsList = await resRecords.json();
    const mixedPlanRecord = recordsList.find(r => r.source_id === mixedCreated.id);
    assert.ok(mixedPlanRecord, 'Registro universal do plano misto deve existir');
    assert.ok(mixedPlanRecord.clinical_evolution.includes('Procedimentos Propostos:'), 'Deve conter seção Procedimentos Propostos');
    assert.ok(mixedPlanRecord.clinical_evolution.includes('Produtos / Insumos Previstos:'), 'Deve conter seção Produtos / Insumos Previstos');
    assert.ok(mixedPlanRecord.clinical_evolution.includes('Clareamento Dental'), 'Deve listar o procedimento na seção adequada');
    assert.ok(mixedPlanRecord.clinical_evolution.includes('Resina Filtek Z350 XT'), 'Deve listar a resina na seção adequada');
    assert.ok(mixedPlanRecord.clinical_evolution.includes('Anestésico Lidocaína 2%'), 'Deve listar o anestésico na seção adequada');
    assert.ok(mixedPlanRecord.clinical_evolution.includes('Valor Bruto: R$ 1020.00'));
    assert.ok(mixedPlanRecord.clinical_evolution.includes('Desconto Concedido: R$ 20.00'));
    assert.ok(mixedPlanRecord.clinical_evolution.includes('Valor Final Líquido: R$ 1000.00'));
    console.log('✓ Prontuário universal estruturado com seções separadas de Procedimentos e Produtos/Insumos Previstos');

    // 9. Aprovar o orçamento e garantir que aprovação também NÃO BAIXA estoque
    const resApproveMixed = await fetch(`${base}/v1/dentistry/treatment-plans/${mixedCreated.id}/status`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ status: 'approved' })
    });
    assert.equal(resApproveMixed.status, 200);

    const resinaStockAfterApproval = db.prepare('SELECT quantity FROM inventory_items WHERE id = ?').get(itemResinaId).quantity;
    const lidoStockAfterApproval = db.prepare('SELECT quantity FROM inventory_items WHERE id = ?').get(itemLidoId).quantity;
    const movementsAfterApproval = db.prepare('SELECT count(*) as count FROM inventory_movements WHERE tenant_id = ?').get(tenantId).count;

    assert.equal(resinaStockAfterApproval, 25, 'Aprovação NÃO deve baixar estoque da Resina');
    assert.equal(lidoStockAfterApproval, 50, 'Aprovação NÃO deve baixar estoque da Lidocaína');
    assert.equal(movementsAfterApproval, initialMovementsCount, 'Aprovação NÃO deve gerar inventory_movements');
    console.log('✓ Aprovação do orçamento concluída com sucesso sem nenhuma baixa ou movimentação de estoque');

    console.log('\n✅ TODOS OS TESTES DE INTEGRAÇÃO PASSARAM COM SUCESSO!\n');
  } catch (err) {
    console.error('❌ Erro no teste de integração:', err);
    process.exitCode = 1;
  } finally {
    server.closeAllConnections();
    server.close();
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch (_) {}
  }
})();
