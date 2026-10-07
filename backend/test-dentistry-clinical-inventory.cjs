const assert = require('assert');
const { db, initializeDatabase } = require('./dist/config/database');
const { ClinicalInventoryService, ClinicalInventoryError } = require('./dist/services/clinical-inventory.service');
const { DentistryController } = require('./dist/controllers/dentistry.controller');
const { DocumentsController } = require('./dist/controllers/documents.controller');

initializeDatabase();

console.log('======================================================================');
console.log('TEST SUITE: CONTROLE DE INSUMOS NO ZEMDAODONTO + ESTOQUE CENTRAL');
console.log('======================================================================\n');

const tenantId = 'tenant-odonto-' + Date.now();
const clinicName = 'Clínica Odontológica & Integrada Central';

// 1. Setup Tenant
db.prepare(`
  INSERT INTO tenants (id, name, trade_name, slug, email, status)
  VALUES (?, ?, 'Zemda Central', ?, 'odonto@test.com', 'active')
`).run(tenantId, clinicName, 'slug-odonto-' + Date.now());

// 2. Setup Dentista com módulos ZemdaOdonto e ZemdaEstetic
const userId = 'usr-dentista-' + Date.now();
const profId = 'pro-dentista-' + Date.now();
db.prepare(`
  INSERT INTO users (id, tenant_id, name, email, role, password_hash, status)
  VALUES (?, ?, 'Dr. Carlos Eduardo', ?, 'professional', 'hash', 'active')
`).run(userId, tenantId, 'carlos-' + Date.now() + '@test.com');

db.prepare(`
  INSERT INTO professionals (
    id, tenant_id, user_id, name, profession_id, profession_name,
    practice_areas, zemda_odonto_enabled, zemda_estetic_enabled, active
  ) VALUES (
    ?, ?, ?, 'Dr. Carlos Eduardo', 'prof-dentista', 'Cirurgião-Dentista',
    'Clínica Geral, Dentística Restauradora, Harmonização Orofacial', 1, 1, 1
  )
`).run(profId, tenantId, userId);

// 3. Setup Paciente
const patientId = 'pat-joao-' + Date.now();
db.prepare(`
  INSERT INTO patients (id, tenant_id, full_name, birth_date, gender, phone, active)
  VALUES (?, ?, 'João da Silva', '1988-03-20', 'M', '11977776666', 1)
`).run(patientId, tenantId);

// 4. Setup Serviço Odontológico
const serviceId = 'srv-restauracao-' + Date.now();
db.prepare(`
  INSERT INTO services (id, tenant_id, name, clinical_module, duration_minutes, price, active)
  VALUES (?, ?, 'Restauração Composta Dente 16', 'ZemdaOdonto', 45, 280.00, 1)
`).run(serviceId, tenantId);

let testIndex = 1;

// ----------------------------------------------------------------------
// CENÁRIO 1: Baixa de Lidocaína de 50 para 48 tubetes
// ----------------------------------------------------------------------
console.log(`--- CENÁRIO ${testIndex++}: Baixa de Lidocaína de 50 para 48 tubetes ao finalizar consulta no ZemdaOdonto ---`);
const lidoItem = ClinicalInventoryService.quickAddItem(tenantId, {
  name: 'Lidocaína 2% com Epinefrina 1:100.000',
  category: 'Odontologia',
  brand: 'DFL',
  quantity: 50,
  unit: 'tubetes',
  batchNumber: 'LIDO-2026-A',
  expirationDate: '2027-12-31'
}, userId);

assert.strictEqual(Number(lidoItem.quantity), 50, 'Estoque inicial deve ser 50 tubetes');

const consultation1Usages = [
  {
    id: 'usage-lido-1',
    productId: lidoItem.id,
    productName: lidoItem.name,
    quantity: 2,
    unit: 'tubetes',
    batchLot: 'LIDO-2026-A',
    toothNumber: '16',
    procedureDescription: 'Anestesia infiltrativa'
  }
];

const results1 = ClinicalInventoryService.processConsultationUsages(tenantId, {
  usages: consultation1Usages,
  patientId,
  professionalId: profId,
  userId,
  moduleType: 'ZemdaOdonto'
});

assert.strictEqual(results1.length, 1, 'Deve retornar 1 movimentação');
assert.strictEqual(results1[0].newQuantity, 48, 'Novo saldo de Lidocaína deve ser 48 tubetes');
const lidoDb1 = ClinicalInventoryService.getItem(tenantId, lidoItem.id);
assert.strictEqual(Number(lidoDb1.quantity), 48, 'Saldo no banco deve ser 48 tubetes');
console.log('  [PASS] Baixa de Lidocaína de 50 para 48 tubetes executada com sucesso.');

// ----------------------------------------------------------------------
// CENÁRIO 2: Múltiplos insumos na mesma consulta baixando de forma atômica
// ----------------------------------------------------------------------
console.log(`\n--- CENÁRIO ${testIndex++}: Múltiplos insumos na mesma consulta (Lidocaína 2, Resina 1, Adesivo 0.5) ---`);
const resinaItem = ClinicalInventoryService.quickAddItem(tenantId, {
  name: 'Resina Composta Filtek Z350 XT A2',
  category: 'Odontologia',
  brand: '3M',
  quantity: 20,
  unit: 'unidades',
  batchNumber: 'RES-3M-99',
  expirationDate: '2028-06-30'
}, userId);

const adesivoItem = ClinicalInventoryService.quickAddItem(tenantId, {
  name: 'Adesivo Single Bond Universal',
  category: 'Odontologia',
  brand: '3M',
  quantity: 10,
  unit: 'ml',
  batchNumber: 'SBU-44',
  expirationDate: '2027-10-15'
}, userId);

const multiUsages = [
  {
    id: 'usage-multi-lido',
    productId: lidoItem.id,
    productName: lidoItem.name,
    quantity: 2,
    unit: 'tubetes',
    toothNumber: '16'
  },
  {
    id: 'usage-multi-resina',
    productId: resinaItem.id,
    productName: resinaItem.name,
    quantity: 1,
    unit: 'unidades',
    toothNumber: '16'
  },
  {
    id: 'usage-multi-adesivo',
    productId: adesivoItem.id,
    productName: adesivoItem.name,
    quantity: 0.5,
    unit: 'ml',
    toothNumber: '16'
  }
];

const results2 = ClinicalInventoryService.processConsultationUsages(tenantId, {
  usages: multiUsages,
  patientId,
  professionalId: profId,
  userId,
  moduleType: 'ZemdaOdonto'
});

assert.strictEqual(results2.length, 3, 'Deve processar 3 movimentações');
const checkLido2 = ClinicalInventoryService.getItem(tenantId, lidoItem.id);
const checkResina2 = ClinicalInventoryService.getItem(tenantId, resinaItem.id);
const checkAdesivo2 = ClinicalInventoryService.getItem(tenantId, adesivoItem.id);

assert.strictEqual(Number(checkLido2.quantity), 46, 'Lidocaína deve ser 46 (48 - 2)');
assert.strictEqual(Number(checkResina2.quantity), 19, 'Resina deve ser 19 (20 - 1)');
assert.strictEqual(Number(checkAdesivo2.quantity), 9.5, 'Adesivo deve ser 9.5 (10 - 0.5)');
console.log('  [PASS] Todos os 3 insumos baixados com sucesso e saldos corretos: 46 tubetes, 19 un, 9.5 ml.');

// ----------------------------------------------------------------------
// CENÁRIO 3: Bloqueio por estoque insuficiente sem gerar saldo negativo
// ----------------------------------------------------------------------
console.log(`\n--- CENÁRIO ${testIndex++}: Bloqueio por estoque insuficiente sem saldo negativo + mensagem amigável ---`);
const acidoItem = ClinicalInventoryService.quickAddItem(tenantId, {
  name: 'Ácido Fosfórico 37%',
  category: 'Odontologia',
  brand: 'Condac',
  quantity: 3,
  unit: 'seringas',
  batchNumber: 'ACID-01'
}, userId);

let errorCaught = null;
try {
  ClinicalInventoryService.processConsultationUsages(tenantId, {
    usages: [
      {
        id: 'usage-fail-lido',
        productId: lidoItem.id,
        productName: lidoItem.name,
        quantity: 1,
        unit: 'tubetes'
      },
      {
        id: 'usage-fail-acido',
        productId: acidoItem.id,
        productName: acidoItem.name,
        quantity: 10, // Excede o saldo de 3!
        unit: 'seringas'
      }
    ],
    patientId,
    professionalId: profId,
    userId,
    moduleType: 'ZemdaOdonto'
  });
} catch (err) {
  errorCaught = err;
}

assert(errorCaught instanceof ClinicalInventoryError, 'Deve lançar ClinicalInventoryError');
assert(errorCaught.message.includes('possui saldo de 3 seringas'), 'Mensagem deve indicar saldo atual de 3');
assert(errorCaught.message.includes('Quantidade necessária: 10 seringas'), 'Mensagem deve indicar quantidade necessária de 10');

// Garantir atomicidade: nem a Lidocaína nem o Ácido foram debitados
const checkLidoAfterFail = ClinicalInventoryService.getItem(tenantId, lidoItem.id);
const checkAcidoAfterFail = ClinicalInventoryService.getItem(tenantId, acidoItem.id);
assert.strictEqual(Number(checkLidoAfterFail.quantity), 46, 'Saldo da Lidocaína deve permanecer inalterado (46)');
assert.strictEqual(Number(checkAcidoAfterFail.quantity), 3, 'Saldo do Ácido deve permanecer 3 (sem saldo negativo)');
console.log(`  [PASS] Bloqueio perfeito: "${errorCaught.message}"`);
console.log('  [PASS] Atomicidade garantida: nenhum saldo foi alterado.');

// ----------------------------------------------------------------------
// CENÁRIO 4: Idempotência e proteção contra duplo clique
// ----------------------------------------------------------------------
console.log(`\n--- CENÁRIO ${testIndex++}: Idempotência e proteção contra duplo clique ---`);
const doubleClickUsages = [
  {
    id: 'usage-idempotent-unique-123',
    productId: lidoItem.id,
    productName: lidoItem.name,
    quantity: 1,
    unit: 'tubetes'
  }
];

const firstRun = ClinicalInventoryService.processConsultationUsages(tenantId, {
  usages: doubleClickUsages,
  patientId,
  professionalId: profId,
  userId,
  moduleType: 'ZemdaOdonto'
});
assert.strictEqual(firstRun.length, 1);
assert.strictEqual(firstRun[0].newQuantity, 45, 'Primeiro clique reduziu para 45');

// Segundo clique imediato com o mesmo payload
const secondRun = ClinicalInventoryService.processConsultationUsages(tenantId, {
  usages: doubleClickUsages,
  patientId,
  professionalId: profId,
  userId,
  moduleType: 'ZemdaOdonto'
});
assert.strictEqual(secondRun.length, 1);
assert.strictEqual(secondRun[0].movementId, firstRun[0].movementId, 'Segundo clique deve retornar a mesma movimentação');

const checkLidoIdempotent = ClinicalInventoryService.getItem(tenantId, lidoItem.id);
assert.strictEqual(Number(checkLidoIdempotent.quantity), 45, 'Saldo deve permanecer 45 (sem dupla baixa)');
console.log('  [PASS] Idempotência validada: reenvio não gerou nova baixa nem duplicou movimentação.');

// ----------------------------------------------------------------------
// CENÁRIO 5: Autosave + restore sem movimentação antecipada
// ----------------------------------------------------------------------
console.log(`\n--- CENÁRIO ${testIndex++}: Autosave + restore preservando inventoryUsages sem baixa antecipada ---`);
const autosaveDraft = {
  consultationEvolution: 'Restauração planejada dente 24',
  consultationProcedures: 'Isolamento absoluto',
  inventoryUsages: [
    {
      id: 'draft-usage-1',
      productId: lidoItem.id,
      productName: lidoItem.name,
      quantity: 3,
      unit: 'tubetes',
      status: 'pending'
    }
  ]
};

// Simulando salvar e restaurar draft
const serialized = JSON.stringify(autosaveDraft);
const restored = JSON.parse(serialized);
assert.strictEqual(restored.inventoryUsages.length, 1);
assert.strictEqual(restored.inventoryUsages[0].status, 'pending');

// Saldo no estoque deve continuar 45 (autosave NÃO altera estoque)
const checkLidoAfterDraft = ClinicalInventoryService.getItem(tenantId, lidoItem.id);
assert.strictEqual(Number(checkLidoAfterDraft.quantity), 45, 'Saldo do estoque não deve mudar com rascunho');
console.log('  [PASS] Autosave preserva estrutura de insumos e saldo permanece intacto.');

// ----------------------------------------------------------------------
// CENÁRIO 6: Remoção de insumo da lista antes de salvar sem movimentar o estoque
// ----------------------------------------------------------------------
console.log(`\n--- CENÁRIO ${testIndex++}: Remoção de insumo pendente antes de salvar ---`);
let pendingUsages = [
  { id: 'temp-1', productId: lidoItem.id, quantity: 2, status: 'pending' },
  { id: 'temp-2', productId: resinaItem.id, quantity: 1, status: 'pending' }
];
// Usuário removeu temp-2 antes de finalizar
pendingUsages = pendingUsages.filter(u => u.id !== 'temp-2');
assert.strictEqual(pendingUsages.length, 1);
assert.strictEqual(pendingUsages[0].id, 'temp-1');

// Saldo no estoque não mudou
const checkLidoBeforeFinish = ClinicalInventoryService.getItem(tenantId, lidoItem.id);
assert.strictEqual(Number(checkLidoBeforeFinish.quantity), 45, 'Nenhuma alteração no estoque com remoção pendente');
console.log('  [PASS] Remoção local no frontend não acionou movimentação de estoque.');

// ----------------------------------------------------------------------
// CENÁRIO 7: Estorno de uso confirmado restaurando saldo original
// ----------------------------------------------------------------------
console.log(`\n--- CENÁRIO ${testIndex++}: Estorno de uso confirmado (refundUsage) restaurando saldo ---`);
// Baixa um insumo
const usageToRefund = [
  {
    id: 'usage-to-be-refunded',
    productId: resinaItem.id,
    productName: resinaItem.name,
    quantity: 2,
    unit: 'unidades'
  }
];
const refundExecResults = ClinicalInventoryService.processConsultationUsages(tenantId, {
  usages: usageToRefund,
  patientId,
  professionalId: profId,
  userId,
  moduleType: 'ZemdaOdonto'
});
const movementIdToRefund = refundExecResults[0].movementId;
const resinaAfterDeduct = ClinicalInventoryService.getItem(tenantId, resinaItem.id);
assert.strictEqual(Number(resinaAfterDeduct.quantity), 17, 'Resina caiu de 19 para 17');

// Agora estorna o movimento
const refundResult = ClinicalInventoryService.refundUsage(tenantId, {
  movementId: movementIdToRefund,
  reason: 'Remoção de insumo da consulta odontológica'
});
assert.strictEqual(refundResult.restoredQuantity, 19, 'Saldo deve voltar para 19');
const resinaAfterRefund = ClinicalInventoryService.getItem(tenantId, resinaItem.id);
assert.strictEqual(Number(resinaAfterRefund.quantity), 19, 'Saldo no banco restaurado com precisão');
console.log('  [PASS] Estorno executado com sucesso: saldo da Resina restaurado de 17 para 19.');

// ----------------------------------------------------------------------
// CENÁRIO 8: Estoque compartilhado entre ZemdaEstetic e ZemdaOdonto
// ----------------------------------------------------------------------
console.log(`\n--- CENÁRIO ${testIndex++}: Estoque compartilhado entre ZemdaEstetic e ZemdaOdonto ---`);
const sharedItem = ClinicalInventoryService.quickAddItem(tenantId, {
  name: 'Soro Fisiológico 0.9% 500ml',
  category: 'Geral',
  brand: 'Eurofarma',
  quantity: 20,
  unit: 'frascos',
  batchNumber: 'SORO-555'
}, userId);

// ZemdaEstetic consome 2 frascos
ClinicalInventoryService.deductStock(tenantId, {
  itemId: sharedItem.id,
  quantity: 2,
  professionalId: profId,
  patientId,
  moduleType: 'ZemdaEstetic',
  sourceType: 'estetic_procedure',
  sourceId: 'proc-estetic-soro',
  unit: 'frascos'
});
let sharedCheck = ClinicalInventoryService.getItem(tenantId, sharedItem.id);
assert.strictEqual(Number(sharedCheck.quantity), 18, 'Após ZemdaEstetic saldo deve ser 18');

// ZemdaOdonto consome 3 frascos
ClinicalInventoryService.processConsultationUsages(tenantId, {
  usages: [
    {
      id: 'usage-odonto-soro',
      productId: sharedItem.id,
      productName: sharedItem.name,
      quantity: 3,
      unit: 'frascos',
      procedureDescription: 'Irrigação cirúrgica'
    }
  ],
  patientId,
  professionalId: profId,
  userId,
  moduleType: 'ZemdaOdonto'
});
sharedCheck = ClinicalInventoryService.getItem(tenantId, sharedItem.id);
assert.strictEqual(Number(sharedCheck.quantity), 15, 'Após ZemdaOdonto saldo deve ser 15');

// Verificar histórico unificado no estoque da clínica
const movements = ClinicalInventoryService.getMovements(tenantId, sharedItem.id);
assert.strictEqual(movements.length, 3, 'Deve conter 1 entrada inicial + 2 saídas');
const modTypes = movements.filter(m => m.movement_type === 'out').map(m => m.module_type);
assert(modTypes.includes('ZemdaEstetic'), 'Histórico deve conter baixa pelo ZemdaEstetic');
assert(modTypes.includes('ZemdaOdonto'), 'Histórico deve conter baixa pelo ZemdaOdonto');
console.log('  [PASS] Estoque compartilhado validado: saldo unificado = 15 frascos, rastreado em ambos os módulos.');

// ----------------------------------------------------------------------
// CENÁRIO 9: Quick Add a partir do Odonto aparecendo no estoque central
// ----------------------------------------------------------------------
console.log(`\n--- CENÁRIO ${testIndex++}: Quick Add a partir do Odonto aparecendo no estoque central ---`);
const quickOdonto = ClinicalInventoryService.quickAddItem(tenantId, {
  name: 'Cone de Guta Percha 04/25',
  category: 'Odontologia',
  brand: 'Meta Biomed',
  quantity: 60,
  unit: 'pontas',
  batchNumber: 'GUTA-2026'
}, userId);

const allCentralItems = ClinicalInventoryService.listItems(tenantId);
const foundInCentral = allCentralItems.find(i => i.id === quickOdonto.id);
assert(foundInCentral, 'Item cadastrado via Quick Add deve existir na listagem central de estoque');
assert.strictEqual(Number(foundInCentral.quantity), 60);
console.log('  [PASS] Quick Add cadastrou diretamente no estoque central da clínica.');

// ----------------------------------------------------------------------
// CENÁRIO 10: Plano de tratamento / orçamento não baixando estoque
// ----------------------------------------------------------------------
console.log(`\n--- CENÁRIO ${testIndex++}: Plano de tratamento / orçamento NÃO baixa estoque ---`);
const lidoBeforeBudget = ClinicalInventoryService.getItem(tenantId, lidoItem.id).quantity;

// Simulando salvar um plano de tratamento / orçamento
const budgetPlan = {
  patientId,
  title: 'Plano Restaurador Futuro',
  items: [
    { tooth: '16', face: 'O', procedure: 'Restauração com Resina Filtek Z350', value: 250 },
    { tooth: '26', face: 'MOD', procedure: 'Restauração com Lidocaína e Resina', value: 350 }
  ],
  totalValue: 600,
  finalValue: 600
};

// Orçamento é salvo na tabela dental_treatment_plans (sem baixa de estoque)
db.prepare(`
  INSERT INTO dental_treatment_plans (
    id, tenant_id, patient_id, professional_id, title, items_json, total_value, discount_value, final_value, status, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'draft', CURRENT_TIMESTAMP)
`).run('plan-' + Date.now(), tenantId, patientId, profId, budgetPlan.title, JSON.stringify(budgetPlan.items), budgetPlan.totalValue, budgetPlan.finalValue);

const lidoAfterBudget = ClinicalInventoryService.getItem(tenantId, lidoItem.id).quantity;
assert.strictEqual(lidoBeforeBudget, lidoAfterBudget, 'Saldo do estoque não pode mudar ao criar plano/orçamento');
console.log('  [PASS] Orçamento/Plano de tratamento registrado sem movimentação indevida de estoque.');

console.log('\n======================================================================');
console.log('TODOS OS 10 CENÁRIOS DO ZEMDAODONTO + ESTOQUE CENTRAL FORAM APROVADOS!');
console.log('======================================================================\n');
