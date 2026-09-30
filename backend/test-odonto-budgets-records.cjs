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
      INSERT INTO tenants (id, name, trade_name, cnpj_cpf, status, zemda_odonto_enabled)
      VALUES (?, 'Clínica Odonto Prime', 'Odonto Prime', '12345678000199', 'active', 1)
    `).run(tenantId);

    // 2. Cria Usuário Dentista
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, profession_name)
      VALUES (?, ?, 'Dr. Silva Dentista', 'dentista@odonto.test', ?, 'professional', 'active', 'Cirurgião-Dentista')
    `).run(dentistUserId, tenantId, bcrypt.hashSync('pass123', 4));

    // 3. Cria Profissional Dentista
    db.prepare(`
      INSERT INTO professionals (id, tenant_id, user_id, name, email, profession_id, practice_areas, registration_type, registration_number, active)
      VALUES (?, ?, ?, 'Dr. Silva Dentista', 'dentista@odonto.test', 'prof-dentista', 'Odontologia, Prótese Dentária', 'CRO', 'SP-12345', 1)
    `).run(dentistProfId, tenantId, dentistUserId);

    // 4. Cria Paciente
    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, cpf, phone, email, status)
      VALUES (?, ?, 'Paciente Odonto Silva', '11122233344', '11988887777', 'paciente@odonto.test', 'active')
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
    const itemsRows = db.prepare('SELECT * FROM budget_items WHERE budget_id = ? ORDER BY id ASC').all(planCreated.budgetId);
    assert.equal(itemsRows.length, 2, 'Deve ter criado 2 itens em budget_items');
    assert.ok(itemsRows[0].description.includes('Dente 16'), 'Descrição deve incluir dente 16');
    assert.ok(itemsRows[0].description.includes('(MOD)'), 'Descrição deve incluir face MOD');
    assert.equal(itemsRows[0].unit_price, 250);
    assert.ok(itemsRows[1].description.includes('Dente 21'));
    assert.equal(itemsRows[1].unit_price, 600);
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

    console.log('\n✅ TODOS OS TESTES DE INTEGRAÇÃO PASSARAM COM SUCESSO!\n');
  } catch (err) {
    console.error('❌ Erro no teste de integração:', err);
    process.exitCode = 1;
  } finally {
    server.closeAllConnections();
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
})();
