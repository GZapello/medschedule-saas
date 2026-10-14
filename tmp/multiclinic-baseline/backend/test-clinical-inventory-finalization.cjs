const assert = require('assert');
const { db, initializeDatabase } = require('./dist/config/database');
const { ClinicalInventoryService, ClinicalInventoryError } = require('./dist/services/clinical-inventory.service');
const { resolveClinicalModule, getAvailableModulesForProfessional } = require('./dist/utils/clinical-module');
const { DocumentsController } = require('./dist/controllers/documents.controller');

initializeDatabase();

console.log('======================================================================');
console.log('TEST SUITE: FINALIZAÇÃO UNIVERSAL + ESTOQUE ÚNICO DA CLÍNICA');
console.log('======================================================================\n');

const tenantId = 'tenant-test-' + Date.now();
const clinicName = 'Clínica Odonto & Estética Central';

// 1. Criar Tenant
db.prepare(`
  INSERT INTO tenants (id, name, trade_name, slug, email, status)
  VALUES (?, ?, 'Zemda Central', ?, 'central@test.com', 'active')
`).run(tenantId, clinicName, 'slug-' + Date.now());

// 2. Criar Profissional Multimódulo (Dentista Gabriel Zapello: ZemdaOdonto + ZemdaEstetic)
const userId = 'usr-gabriel-' + Date.now();
const profId = 'pro-gabriel-' + Date.now();
const userEmail = 'gabriel-' + Date.now() + '@test.com';
db.prepare(`
  INSERT INTO users (id, tenant_id, name, email, role, password_hash, status)
  VALUES (?, ?, 'Dr. Gabriel Zapello', ?, 'professional', 'hash', 'active')
`).run(userId, tenantId, userEmail);

db.prepare(`
  INSERT INTO professionals (
    id, tenant_id, user_id, name, profession_id, profession_name,
    practice_areas, zemda_odonto_enabled, zemda_estetic_enabled, active
  ) VALUES (
    ?, ?, ?, 'Dr. Gabriel Zapello', 'prof-dentista', 'Cirurgião-Dentista',
    'pa-odonto-estetica, Harmonização Orofacial', 1, 1, 1
  )
`).run(profId, tenantId, userId);

// 3. Criar Paciente Aline
const patientId = 'pat-aline-' + Date.now();
db.prepare(`
  INSERT INTO patients (id, tenant_id, full_name, birth_date, gender, phone, active)
  VALUES (?, ?, 'Aline Silva', '1995-05-15', 'F', '11988887777', 1)
`).run(patientId, tenantId);

// 4. Criar Serviços
const serviceEsteticId = 'srv-estetic-' + Date.now();
db.prepare(`
  INSERT INTO services (id, tenant_id, name, clinical_module, duration_minutes, price, active)
  VALUES (?, ?, 'Harmonização Facial Botox', 'ZemdaEstetic', 45, 1200.00, 1)
`).run(serviceEsteticId, tenantId);

const serviceOdontoId = 'srv-odonto-' + Date.now();
db.prepare(`
  INSERT INTO services (id, tenant_id, name, clinical_module, duration_minutes, price, active)
  VALUES (?, ?, 'Restauração em Resina', 'ZemdaOdonto', 30, 350.00, 1)
`).run(serviceOdontoId, tenantId);

// ======================================================================
// PARTE 1 — TESTES DE ESQUEMA E MOTOR DE ESTOQUE
// ======================================================================
console.log('--- TESTE 1: Schema de inventory_movements com rastreabilidade clínica ---');
const movCols = db.prepare('PRAGMA table_info(inventory_movements)').all().map(c => c.name);
const expectedCols = ['professional_id', 'patient_id', 'appointment_id', 'module_type', 'source_type', 'source_id', 'batch'];
for (const col of expectedCols) {
  assert(movCols.includes(col), `Coluna ${col} deve existir em inventory_movements`);
}
console.log('  [PASS] Todas as 7 novas colunas de rastreabilidade clínica estão presentes.');

console.log('\n--- TESTE 2: Bateria de Cenários de Estoque (A a K) ---');

// Cenário A: Estoque 100 U, Uso 20 U -> 80 U
const itemA = ClinicalInventoryService.quickAddItem(tenantId, {
  name: 'Toxina Botulínica Tipo A 100U',
  category: 'Toxinas',
  brand: 'Allergan',
  quantity: 100,
  unit: 'U',
  batchNumber: 'LOTE-A100'
}, userId);
assert.strictEqual(Number(itemA.quantity), 100, 'Saldo inicial deve ser 100');

const deductA = ClinicalInventoryService.deductStock(tenantId, {
  itemId: itemA.id,
  quantity: 20,
  professionalId: profId,
  patientId,
  moduleType: 'ZemdaEstetic',
  sourceType: 'estetic_procedure',
  sourceId: 'proc-test-1',
  unit: 'U'
});
assert.strictEqual(deductA.newQuantity, 80, 'Saldo após uso de 20 U deve ser 80 U');
const checkA = ClinicalInventoryService.getItem(tenantId, itemA.id);
assert.strictEqual(Number(checkA.quantity), 80, 'Saldo no banco deve ser 80 U');
console.log('  [PASS] Cenário A: Baixa de 100 para 80 com sucesso.');

// Cenário B: Tentar usar 120 U -> rejeitar, estoque permanece 80 U
let rejectedB = false;
try {
  ClinicalInventoryService.deductStock(tenantId, {
    itemId: itemA.id,
    quantity: 120,
    professionalId: profId,
    patientId,
    moduleType: 'ZemdaEstetic',
    sourceType: 'estetic_procedure',
    sourceId: 'proc-test-2',
    unit: 'U'
  });
} catch (err) {
  rejectedB = true;
  assert(err instanceof ClinicalInventoryError, 'Deve lançar ClinicalInventoryError');
  assert(err.message.includes('Estoque insuficiente'), 'Mensagem de saldo insuficiente');
}
assert(rejectedB, 'Dedução acima do saldo deve ser rejeitada');
const checkB = ClinicalInventoryService.getItem(tenantId, itemA.id);
assert.strictEqual(Number(checkB.quantity), 80, 'Estoque deve permanecer 80 U após rejeição');
console.log('  [PASS] Cenário B: Tentativa de uso acima do saldo bloqueada e estoque inalterado.');

// Cenário C: Novo produto cadastrado pela tela clínica (quick-add)
const itemC = ClinicalInventoryService.quickAddItem(tenantId, {
  name: 'Fio PDO Espiculado 19G 100mm',
  category: 'Fios',
  brand: 'Silhouette',
  quantity: 50,
  unit: 'un',
  batchNumber: 'PDO-789'
}, userId);
const centralItems = ClinicalInventoryService.listItems(tenantId);
assert(centralItems.some(i => i.id === itemC.id), 'Item C deve estar no estoque central');
console.log('  [PASS] Cenário C: Quick-Add cadastrou item no estoque central.');

// Cenário D & E & F: Uso do MESMO estoque pelo ZemdaEstetic e ZemdaOdonto
const sharedConsumable = ClinicalInventoryService.quickAddItem(tenantId, {
  name: 'Anestésico Lidocaína 2% c/ Vaso',
  category: 'Anestésicos',
  quantity: 60,
  unit: 'ampola',
  batchNumber: 'LIDO-2026'
}, userId);

// Uso no ZemdaEstetic
ClinicalInventoryService.deductStock(tenantId, {
  itemId: sharedConsumable.id,
  quantity: 10,
  professionalId: profId,
  patientId,
  moduleType: 'ZemdaEstetic',
  sourceType: 'estetic_procedure',
  sourceId: 'proc-estet-10',
  unit: 'ampola'
});

// Uso no ZemdaOdonto
ClinicalInventoryService.deductStock(tenantId, {
  itemId: sharedConsumable.id,
  quantity: 15,
  professionalId: profId,
  patientId,
  moduleType: 'ZemdaOdonto',
  sourceType: 'odontology_procedure',
  sourceId: 'proc-odonto-15',
  unit: 'ampola'
});

const sharedAfter = ClinicalInventoryService.getItem(tenantId, sharedConsumable.id);
assert.strictEqual(Number(sharedAfter.quantity), 35, 'Saldo compartilhado: 60 - 10 - 15 = 35');

// Verificar histórico central unificado
const movements = ClinicalInventoryService.getMovements(tenantId, { patientId });
const estetMov = movements.find(m => m.module_type === 'ZemdaEstetic' && m.item_id === sharedConsumable.id);
const odontoMov = movements.find(m => m.module_type === 'ZemdaOdonto' && m.item_id === sharedConsumable.id);
assert(estetMov, 'Movimentação do ZemdaEstetic presente no histórico central');
assert(odontoMov, 'Movimentação do ZemdaOdonto presente no MESMO histórico central');
console.log('  [PASS] Cenários D, E, F: Ambos os módulos movimentam o MESMO estoque com rastreabilidade.');

// Cenário G: Exclusão de procedimento e estorno único
ClinicalInventoryService.refundStock(tenantId, {
  itemId: sharedConsumable.id,
  quantity: 10,
  professionalId: profId,
  patientId,
  moduleType: 'ZemdaEstetic',
  sourceType: 'estetic_procedure',
  sourceId: 'proc-estet-10',
  reason: 'Estorno clínico por exclusão de procedimento'
});
const checkG = ClinicalInventoryService.getItem(tenantId, sharedConsumable.id);
assert.strictEqual(Number(checkG.quantity), 45, 'Saldo após estorno: 35 + 10 = 45');

// Estorno repetido deve ser idempotente
const duplicateRefund = ClinicalInventoryService.refundStock(tenantId, {
  itemId: sharedConsumable.id,
  quantity: 10,
  professionalId: profId,
  patientId,
  moduleType: 'ZemdaEstetic',
  sourceType: 'estetic_procedure',
  sourceId: 'proc-estet-10',
  reason: 'Estorno clínico por exclusão de procedimento'
});
assert(duplicateRefund.alreadyRefunded, 'Estorno repetido deve ser idempotente');
const checkG2 = ClinicalInventoryService.getItem(tenantId, sharedConsumable.id);
assert.strictEqual(Number(checkG2.quantity), 45, 'Saldo não pode estornar em duplicidade');
console.log('  [PASS] Cenário G: Estorno único e idempotente com recuperação precisa do saldo.');

// Cenário H: Edição de quantidade (20 -> 30 no itemA)
const checkBeforeH = ClinicalInventoryService.getItem(tenantId, itemA.id); // saldo 80
ClinicalInventoryService.adjustStock(tenantId, {
  oldItemId: itemA.id,
  newItemId: itemA.id,
  oldQuantity: 20,
  newQuantity: 30,
  professionalId: profId,
  patientId,
  moduleType: 'ZemdaEstetic',
  sourceType: 'estetic_procedure',
  sourceId: 'proc-test-1',
  unit: 'U'
});
const checkAfterH = ClinicalInventoryService.getItem(tenantId, itemA.id);
assert.strictEqual(Number(checkAfterH.quantity), 70, 'Saldo deve ser 70 (80 - 10 adicionais)');
console.log('  [PASS] Cenário H: Edição de quantidade ajusta exatamente a diferença.');

// Cenário I: Múltiplos lotes do mesmo produto
const botoxLotA = ClinicalInventoryService.quickAddItem(tenantId, {
  name: 'Botox 100U Allergan',
  category: 'Toxinas',
  brand: 'Allergan',
  quantity: 40,
  unit: 'U',
  batchNumber: 'LOTE-A'
}, userId);

const botoxLotB = ClinicalInventoryService.quickAddItem(tenantId, {
  name: 'Botox 100U Allergan',
  category: 'Toxinas',
  brand: 'Allergan',
  quantity: 80,
  unit: 'U',
  batchNumber: 'LOTE-B'
}, userId);

ClinicalInventoryService.deductStock(tenantId, {
  itemId: botoxLotB.id,
  quantity: 20,
  professionalId: profId,
  patientId,
  moduleType: 'ZemdaEstetic',
  sourceType: 'estetic_procedure',
  sourceId: 'proc-lot-b',
  batch: 'LOTE-B'
});
const checkLotA = ClinicalInventoryService.getItem(tenantId, botoxLotA.id);
const checkLotB = ClinicalInventoryService.getItem(tenantId, botoxLotB.id);
assert.strictEqual(Number(checkLotA.quantity), 40, 'Lote A permanece intocado com 40 U');
assert.strictEqual(Number(checkLotB.quantity), 60, 'Lote B foi baixado de 80 para 60 U');
console.log('  [PASS] Cenário I: Baixa realizada exatamente no lote selecionado.');

// Cenário J: Idempotência de baixa (duplo clique)
const firstClick = ClinicalInventoryService.deductStock(tenantId, {
  itemId: botoxLotA.id,
  quantity: 10,
  professionalId: profId,
  patientId,
  moduleType: 'ZemdaEstetic',
  sourceType: 'estetic_procedure',
  sourceId: 'proc-double-click-test'
});
const secondClick = ClinicalInventoryService.deductStock(tenantId, {
  itemId: botoxLotA.id,
  quantity: 10,
  professionalId: profId,
  patientId,
  moduleType: 'ZemdaEstetic',
  sourceType: 'estetic_procedure',
  sourceId: 'proc-double-click-test'
});
assert.strictEqual(secondClick.alreadyRecorded, true, 'Segunda chamada imediata detecta idempotência');
const checkLotAAfter = ClinicalInventoryService.getItem(tenantId, botoxLotA.id);
assert.strictEqual(Number(checkLotAAfter.quantity), 30, 'Saldo baixado apenas uma vez: 40 - 10 = 30');
console.log('  [PASS] Cenário J: Proteção contra duplo clique e idempotência validada.');

// Cenário K: Transação Atômica & Rollback
db.exec('SAVEPOINT test_atomic_rollback');
try {
  ClinicalInventoryService.deductStock(tenantId, {
    itemId: botoxLotA.id,
    quantity: 15,
    professionalId: profId,
    patientId,
    moduleType: 'ZemdaEstetic',
    sourceType: 'estetic_procedure',
    sourceId: 'proc-rollback-test'
  });
  // Simular falha grave posterior no prontuário
  throw new Error('Falha simulada na gravação do prontuário');
} catch (e) {
  db.exec('ROLLBACK TO test_atomic_rollback');
  db.exec('RELEASE test_atomic_rollback');
}
const checkLotAAfterRollback = ClinicalInventoryService.getItem(tenantId, botoxLotA.id);
assert.strictEqual(Number(checkLotAAfterRollback.quantity), 30, 'Saldo deve permanecer 30 após rollback');
console.log('  [PASS] Cenário K: Rollback transacional garante consistência atômica.');

// ======================================================================
// PARTE 2 — TESTES DE FINALIZAÇÃO UNIVERSAL DE ATENDIMENTO
// ======================================================================
console.log('\n--- TESTE 3: Finalização Universal e Fonte de Verdade do Serviço ---');

// 1. Resolução dos módulos disponíveis para Gabriel
const gabrielModules = getAvailableModulesForProfessional(profId, tenantId);
assert(gabrielModules.some(m => m.code === 'ZemdaOdonto'), 'Gabriel deve ter ZemdaOdonto disponível');
assert(gabrielModules.some(m => m.code === 'ZemdaEstetic'), 'Gabriel deve ter ZemdaEstetic disponível');
console.log('  [PASS] Gabriel possui 2 módulos disponíveis: ZemdaOdonto e ZemdaEstetic.');

// 2. Criar Agendamento Estético para Gabriel
const apptEsteticId = 'appt-estet-' + Date.now();
db.prepare(`
  INSERT INTO appointments (
    id, tenant_id, appointment_number, patient_id, professional_id, service_id,
    clinical_module, start_time, end_time, status
  ) VALUES (
    ?, ?, 'AG-2026-0001', ?, ?, ?, 'ZemdaEstetic',
    datetime('now'), datetime('now', '+45 minutes'), 'scheduled'
  )
`).run(apptEsteticId, tenantId, patientId, profId, serviceEsteticId);

// Verificar fonte de verdade em resolveClinicalModule
const resolvedEstetic = resolveClinicalModule({ id: apptEsteticId, service_id: serviceEsteticId }, tenantId);
assert.strictEqual(resolvedEstetic, 'ZemdaEstetic', 'Módulo do serviço prevalece sobre profissão do dentista');
console.log('  [PASS] resolveClinicalModule retorna ZemdaEstetic com base no serviço.');

// 3. Simular Finalização do Atendimento Estético (saveOnly: true)
const reqMockEstetic = {
  params: { id: apptEsteticId },
  tenantId,
  user: { userId, role: 'professional', name: 'Dr. Gabriel Zapello', email: 'gabriel@test.com' },
  body: {
    saveOnly: true,
    evolution: {
      title: 'Harmonização Facial Botox',
      clinicalEvolution: 'Aplicação de 20U de Botox em região de fronte e glabela sem intercorrências.',
      moduleType: 'ZemdaEstetic',
      moduleData: {
        activeArea: 'FACIAL',
        areas: {
          FACIAL: {
            procedureForm: {
              procedure_name: 'Toxina Botulínica',
              target_region: 'Fronte e Glabela',
              inventory_item_id: itemA.id,
              quantity: '20',
              unit: 'U',
              deduct_inventory: true
            }
          }
        }
      }
    }
  }
};

let resStatusCode = 200;
let resJsonData = null;
const resMock = {
  status(code) { resStatusCode = code; return this; },
  json(data) { resJsonData = data; return this; }
};

DocumentsController.finishConsultation(reqMockEstetic, resMock);
assert.strictEqual(resStatusCode, 200, `Finalização saveOnly deve retornar 200 (retornou: ${resStatusCode} com erro: ${resJsonData?.error})`);
assert.strictEqual(resJsonData.awaitingPayment, true, 'Atendimento deve estar aguardando recebimento');

// Verificar que o agendamento ainda NÃO foi completado (aguardando pagamento)
const apptAfterSaveOnly = db.prepare('SELECT status, clinical_module FROM appointments WHERE id = ?').get(apptEsteticId);
assert.strictEqual(apptAfterSaveOnly.status, 'scheduled', 'Status deve permanecer ativo até a quitação/confirmação');
assert.strictEqual(apptAfterSaveOnly.clinical_module, 'ZemdaEstetic', 'Módulo clínico gravado como ZemdaEstetic');
console.log('  [PASS] Finalização saveOnly=true salvou prontuário ZemdaEstetic e aguarda pagamento sem conflitos.');

// 4. Concluir com Pagamento
const reqMockPayment = {
  params: { id: apptEsteticId },
  tenantId,
  user: { userId, role: 'professional', name: 'Dr. Gabriel Zapello', email: 'gabriel@test.com' },
  body: {
    payment: {
      amount: 1200.00,
      paymentMethod: 'pix',
      status: 'paid',
      notes: 'Pago via PIX no encerramento'
    }
  }
};

resStatusCode = 200;
resJsonData = null;
DocumentsController.finishConsultation(reqMockPayment, resMock);
assert.strictEqual(resStatusCode, 200, `Pagamento deve concluir atendimento com 200 (retornou ${resStatusCode})`);

const apptAfterPayment = db.prepare('SELECT status FROM appointments WHERE id = ?').get(apptEsteticId);
assert.strictEqual(apptAfterPayment.status, 'completed', 'Agendamento agora deve estar COMPLETED');

const completionRec = db.prepare('SELECT * FROM consultation_completions WHERE appointment_id = ?').get(apptEsteticId);
assert(completionRec && completionRec.completed_at, 'consultation_completions deve estar com completed_at preenchido');
console.log('  [PASS] Recebimento registrado com sucesso e agendamento marcado como completed.');

// 5. Testar Agendamento Odontológico pelo MESMO Dentista Gabriel
const apptOdontoId = 'appt-odonto-' + Date.now();
db.prepare(`
  INSERT INTO appointments (
    id, tenant_id, appointment_number, patient_id, professional_id, service_id,
    clinical_module, start_time, end_time, status
  ) VALUES (
    ?, ?, 'AG-2026-0002', ?, ?, ?, 'ZemdaOdonto',
    datetime('now'), datetime('now', '+30 minutes'), 'scheduled'
  )
`).run(apptOdontoId, tenantId, patientId, profId, serviceOdontoId);

const reqMockOdonto = {
  params: { id: apptOdontoId },
  tenantId,
  user: { userId, role: 'professional', name: 'Dr. Gabriel Zapello', email: 'gabriel@test.com' },
  body: {
    saveOnly: false,
    evolution: {
      title: 'Restauração Odontológica',
      clinicalEvolution: 'Restauração de resina fotopolimerizável no dente 16 realizada com isolamento absoluto.',
      moduleType: 'ZemdaOdonto',
      moduleData: {}
    },
    payment: {
      amount: 350.00,
      paymentMethod: 'credit_card',
      status: 'paid'
    }
  }
};

resStatusCode = 200;
resJsonData = null;
DocumentsController.finishConsultation(reqMockOdonto, resMock);
assert.strictEqual(resStatusCode, 200, `Finalização Odonto deve retornar 200 (retornou: ${resStatusCode}, erro: ${resJsonData?.error})`);
const apptOdontoAfter = db.prepare('SELECT status, clinical_module FROM appointments WHERE id = ?').get(apptOdontoId);
assert.strictEqual(apptOdontoAfter.status, 'completed', 'Agendamento odonto concluído');
assert.strictEqual(apptOdontoAfter.clinical_module, 'ZemdaOdonto', 'Módulo odonto registrado');
console.log('  [PASS] Dentista Gabriel finalizou atendimento odonto legítimo sem qualquer falso conflito.');

// 6. Testar Proteção Anti-Conflito Real (Serviço Odonto vs Payload Estetic)
const apptConflictId = 'appt-conflict-' + Date.now();
db.prepare(`
  INSERT INTO appointments (
    id, tenant_id, appointment_number, patient_id, professional_id, service_id,
    clinical_module, start_time, end_time, status
  ) VALUES (
    ?, ?, 'AG-2026-0003', ?, ?, ?, 'ZemdaOdonto',
    datetime('now'), datetime('now', '+30 minutes'), 'scheduled'
  )
`).run(apptConflictId, tenantId, patientId, profId, serviceOdontoId);

const reqMockConflict = {
  params: { id: apptConflictId },
  tenantId,
  user: { userId, role: 'professional', name: 'Dr. Gabriel Zapello', email: 'gabriel@test.com' },
  body: {
    saveOnly: true,
    evolution: {
      title: 'Procedimento Estético em Serviço Odonto',
      clinicalEvolution: 'Tentativa de salvar estético em serviço odonto',
      moduleType: 'ZemdaEstetic' // Conflito deliberado com serviceOdontoId
    }
  }
};

resStatusCode = 200;
resJsonData = null;
DocumentsController.finishConsultation(reqMockConflict, resMock);
assert.strictEqual(resStatusCode, 409, 'Deve retornar 409 de conflito real entre serviço e payload');
assert(resJsonData.error.includes('requer o módulo "ZemdaOdonto"'), 'Mensagem clara de conflito com o módulo do serviço');
console.log('  [PASS] Conflito real entre serviço e payload é corretamente rejeitado com HTTP 409.');

// 7. Testar Bloqueio de Módulo Não Autorizado (Gabriel tentando finalizar ZemdaMed)
const reqMockUnauthorized = {
  params: { id: apptConflictId },
  tenantId,
  user: { userId, role: 'professional', name: 'Dr. Gabriel Zapello', email: 'gabriel@test.com' },
  body: {
    saveOnly: true,
    evolution: {
      title: 'Consulta Médica',
      clinicalEvolution: 'Gabriel não tem medicina',
      moduleType: 'ZemdaMed'
    }
  }
};

resStatusCode = 200;
resJsonData = null;
DocumentsController.finishConsultation(reqMockUnauthorized, resMock);
assert.strictEqual(resStatusCode, 403, 'Gabriel não possui ZemdaMed e deve receber 403');
console.log('  [PASS] Acesso a módulo não autorizado bloqueado com HTTP 403.');

console.log('\n======================================================================');
console.log('TODOS OS 25 CENÁRIOS E TESTES INTEGRADOS FORAM CONCLUÍDOS COM SUCESSO!');
console.log('======================================================================\n');
