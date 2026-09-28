const assert = require('assert');
const { initializeDatabase, db } = require('./dist/config/database');
const { resolveClinicalModule, isPrimaryClinicalModule } = require('./dist/utils/clinical-module');
const { resolveCanonicalProfession } = require('./dist/utils/profession-module');
const { PhysiotherapyController } = require('./dist/controllers/physiotherapy.controller');

initializeDatabase();

console.log('================================================================');
console.log('🧪 TEST SUITE: ZEMDAESTETIC EM RESOLUÇÃO & ZEMDAFISIO × ZEMDA360');
console.log('================================================================\n');

// -------------------------------------------------------------
// GRUPO 1: Validação de ZemdaEstetic na Resolução Clínica
// -------------------------------------------------------------
console.log('--- TEST GROUP 1: ZemdaEstetic na Resolução Clínica Primária ---');

assert.strictEqual(isPrimaryClinicalModule('ZemdaEstetic'), true, 'ZemdaEstetic deve ser um módulo clínico primário');
assert.strictEqual(isPrimaryClinicalModule('ZemdaFisio'), true, 'ZemdaFisio deve ser um módulo clínico primário');
assert.strictEqual(isPrimaryClinicalModule('general'), false, 'general não é módulo de nicho');

const esteticProf = resolveCanonicalProfession({ id: 'prof-esteticista', name: 'Esteticista' });
assert.strictEqual(esteticProf.commercialModule, 'ZemdaEstetic');
assert.strictEqual(esteticProf.clinicalWorkspace, 'zemda-estetic');

// Simula resolução de appointment para profissional esteticista
const tenantId = 't-test-' + Date.now();
const profId = 'p-estet-' + Date.now();
const userId = 'u-estet-' + Date.now();

db.prepare(`
  INSERT INTO tenants (id, slug, name, email, status, onboarding_completed, onboarding_step, manager_confirmed)
  VALUES (?, ?, 'Clínica Estética Teste', 'estetica@teste.invalid', 'active', 1, 5, 1)
`).run(tenantId, 'slug-' + tenantId);

db.prepare(`
  INSERT INTO users (id, tenant_id, name, email, password_hash, role, profession_id, profession_name)
  VALUES (?, ?, 'Dra. Esteta', ?, 'hash', 'professional', 'prof-esteticista', 'Esteticista')
`).run(userId, tenantId, `esteta_${userId}@teste.com`);

db.prepare(`
  INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, profession_name, active)
  VALUES (?, ?, ?, 'Dra. Esteta', 'prof-esteticista', 'Esteticista', 1)
`).run(profId, tenantId, userId);

const resolvedModule = resolveClinicalModule({ professional_id: profId }, tenantId);
assert.strictEqual(resolvedModule, 'ZemdaEstetic', `resolveClinicalModule deve retornar ZemdaEstetic para esteticista (retornou: ${resolvedModule})`);
console.log('  ✅ [PASS] ZemdaEstetic reconhecido em PRIMARY_CLINICAL_MODULES e resolveClinicalModule()');

// -------------------------------------------------------------
// GRUPO 2: Avaliações Regionais Fisioterapêuticas no Banco
// -------------------------------------------------------------
console.log('\n--- TEST GROUP 2: Avaliações Regionais ZemdaFisio × Zemda360 ---');

const physioUserId = 'u-fisio-' + Date.now();
const physioProfId = 'p-fisio-' + Date.now();
const patientId = 'pat-fisio-' + Date.now();

db.prepare(`
  INSERT INTO users (id, tenant_id, name, email, password_hash, role, profession_id, profession_name, zemda_fisio_enabled)
  VALUES (?, ?, 'Dr. Fisioterapeuta', ?, 'hash', 'professional', 'prof-fisioterapeuta', 'Fisioterapeuta', 1)
`).run(physioUserId, tenantId, `fisio_${physioUserId}@teste.com`);

db.prepare(`
  INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, profession_name, active, zemda_fisio_enabled)
  VALUES (?, ?, ?, 'Dr. Fisioterapeuta', 'prof-fisioterapeuta', 'Fisioterapeuta', 1, 1)
`).run(physioProfId, tenantId, physioUserId);

db.prepare(`
  INSERT INTO patients (id, tenant_id, full_name, phone, birth_date)
  VALUES (?, ?, 'Paciente Reabilitação', '11999999999', '1990-05-15')
`).run(patientId, tenantId);

const serviceId = 'srv-fisio-' + Date.now();
db.prepare(`
  INSERT INTO services (id, tenant_id, name, duration_minutes, price, active)
  VALUES (?, ?, 'Sessão de Fisioterapia', 50, 150, 1)
`).run(serviceId, tenantId);

// Cria vínculo assistencial inserindo um agendamento prévio para liberar hasClinicalAccess
const apptId = 'apt-fisio-' + Date.now();
db.prepare(`
  INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, start_time, end_time, status)
  VALUES (?, ?, 'AG-TEST-001', ?, ?, ?, '2026-09-28 10:00', '2026-09-28 11:00', 'completed')
`).run(apptId, tenantId, patientId, physioProfId, serviceId);

// 1. Cria Avaliação 1 (Baseline - Ombro Direito)
let eval1ResData = null;
const req1 = {
  tenantId,
  user: { userId: physioUserId, name: 'Dr. Fisioterapeuta', role: 'professional' },
  body: {
    patientId,
    regionId: 'shoulder_right',
    regionLabel: 'Ombro direito',
    side: 'right',
    evaluationDate: '2026-09-01',
    pain: {
      score: 8,
      rest: 'Leve (3/10)',
      movement: 'Intensa ao abduzir > 60° (8/10)',
      palpation: 'Forte dor na inserção do supraespinhal',
      characteristics: 'Pontada e queimação',
      frequency: 'Diária / Constante ao elevar o braço',
      duration: '4 semanas',
      betterFactors: 'Gelo e repouso em adução',
      worseFactors: 'Elevação acima de 90° e carregar peso',
      notes: 'Piora noturna ao deitar sobre o ombro'
    },
    adm: [
      { movement: 'Flexão', side: 'right', activeRom: '105', passiveRom: '120', normalRange: '0 - 180°', painDuring: 'Sim', unit: '°' },
      { movement: 'Abdução', side: 'right', activeRom: '90', passiveRom: '110', normalRange: '0 - 180°', painDuring: 'Sim', unit: '°' },
      { movement: 'Rotação Externa', side: 'right', activeRom: '45', passiveRom: '60', normalRange: '0 - 90°', painDuring: 'Não', unit: '°' }
    ],
    strength: [
      { muscleGroup: 'Supraespinhal', side: 'right', grade: '3', pain: 'Sim', notes: 'Dor intensa e fraqueza' },
      { muscleGroup: 'Deltoide Médio', side: 'right', grade: '4-', pain: 'Não', notes: 'Leve déficit contra resistência' }
    ],
    tests: [
      { testName: 'Teste de Neer', side: 'right', result: 'positive', notes: 'Dor subacromial evidente' },
      { testName: 'Teste de Hawkins-Kennedy', side: 'right', result: 'positive', notes: 'Impacto subacromial' },
      { testName: 'Teste de Jobe (Empty Can)', side: 'right', result: 'positive', notes: 'Dor e incapacidade de manter elevação' }
    ],
    palpation: {
      pain: 'Presente no tendão supraespinhal',
      tension: 'Contratura protetora de trapézio superior',
      edema: 'Ausente',
      temperature: 'Normotérmico',
      sensitivity: 'Normal',
      stiffness: 'Rigidez capsular posterior',
      notes: 'Pontos gatilho ativos em trapézio e elevador da escápula'
    },
    edema: { present: false },
    planLink: {
      finding: 'Impacto subacromial e limitação de abdução ativa a 90°',
      goal: 'Alcançar abdução ativa de 150° e zerar dor noturna em 6 semanas',
      conduct: 'Terapia manual articular, liberação miofascial, exercícios pendulares de Codman'
    }
  }
};

const res1 = {
  status: (code) => ({
    json: (data) => {
      assert.strictEqual(code, 201);
      eval1ResData = data;
    }
  })
};

PhysiotherapyController.createRegionalEvaluation(req1, res1);
assert(eval1ResData?.id, 'ID da avaliação 1 gerado com sucesso');
console.log('  ✅ [PASS] Avaliação Regional Baseline (Ombro direito) criada com sucesso ID:', eval1ResData.id);

// 2. Cria Avaliação 2 (Atual / Evolução - Ombro Direito)
let eval2ResData = null;
const req2 = {
  tenantId,
  user: { userId: physioUserId, name: 'Dr. Fisioterapeuta', role: 'professional' },
  body: {
    patientId,
    regionId: 'shoulder_right',
    regionLabel: 'Ombro direito',
    side: 'right',
    evaluationDate: '2026-09-28',
    pain: {
      score: 3,
      rest: 'Ausente (0/10)',
      movement: 'Leve no final da amplitude (3/10)',
      palpation: 'Leve sensibilidade residual',
      characteristics: 'Sensação de estiramento',
      frequency: 'Ocasional',
      duration: 'Residual',
      betterFactors: 'Aquecimento',
      worseFactors: 'Cargas máximas',
      notes: 'Sono sem interrupções por dor'
    },
    adm: [
      { movement: 'Flexão', side: 'right', activeRom: '158', passiveRom: '170', normalRange: '0 - 180°', painDuring: 'Não', unit: '°' },
      { movement: 'Abdução', side: 'right', activeRom: '145', passiveRom: '160', normalRange: '0 - 180°', painDuring: 'Não', unit: '°' },
      { movement: 'Rotação Externa', side: 'right', activeRom: '80', passiveRom: '85', normalRange: '0 - 90°', painDuring: 'Não', unit: '°' }
    ],
    strength: [
      { muscleGroup: 'Supraespinhal', side: 'right', grade: '4+', pain: 'Não', notes: 'Recuperação substancial de força' },
      { muscleGroup: 'Deltoide Médio', side: 'right', grade: '5', pain: 'Não', notes: 'Força normal completa' }
    ],
    tests: [
      { testName: 'Teste de Neer', side: 'right', result: 'negative', notes: 'Sem reprodução de dor subacromial' },
      { testName: 'Teste de Hawkins-Kennedy', side: 'right', result: 'negative', notes: 'Negativo' },
      { testName: 'Teste de Jobe (Empty Can)', side: 'right', result: 'negative', notes: 'Mantém contração estável' }
    ]
  }
};

const res2 = {
  status: (code) => ({
    json: (data) => {
      assert.strictEqual(code, 201);
      eval2ResData = data;
    }
  })
};

PhysiotherapyController.createRegionalEvaluation(req2, res2);
assert(eval2ResData?.id, 'ID da avaliação 2 gerado com sucesso');
console.log('  ✅ [PASS] Avaliação Regional Atual (Ombro direito) criada com sucesso ID:', eval2ResData.id);

// -------------------------------------------------------------
// GRUPO 3: Sumário Regional para Badges no Zemda360
// -------------------------------------------------------------
console.log('\n--- TEST GROUP 3: Sumário Regional para Badges no Zemda360 ---');

let summaryData = null;
PhysiotherapyController.getRegionalSummary(
  { tenantId, user: { userId: physioUserId, role: 'professional' }, params: { patientId } },
  { json: (data) => { summaryData = data; } }
);

assert(summaryData['shoulder_right'], 'Sumário deve conter entrada para shoulder_right');
assert.strictEqual(summaryData['shoulder_right'].count, 2, 'Contagem de avaliações para shoulder_right deve ser 2');
assert.strictEqual(summaryData['shoulder_right'].latest_date, '2026-09-28');
assert.strictEqual(summaryData['shoulder_right'].latest_pain_score, 3);
console.log('  ✅ [PASS] Sumário retornou contagem e score mais recente para renderização de badges');

// -------------------------------------------------------------
// GRUPO 4: Comparação Longitudinal (Baseline × Atual)
// -------------------------------------------------------------
console.log('\n--- TEST GROUP 4: Comparação Longitudinal (Baseline × Atual) ---');

let comparisonData = null;
PhysiotherapyController.getRegionalComparison(
  {
    tenantId,
    user: { userId: physioUserId, role: 'professional' },
    params: { patientId, regionId: 'shoulder_right' },
    query: {}
  },
  { json: (data) => { comparisonData = data; } }
);

assert.strictEqual(comparisonData.regionId, 'shoulder_right');
assert.strictEqual(comparisonData.baseline.pain.score, 8);
assert.strictEqual(comparisonData.current.pain.score, 3);

// Variação de Dor: 3 - 8 = -5
assert.strictEqual(comparisonData.variations.painDiff, -5, 'Variação de dor deve ser -5');

// Variações de ADM:
// Flexão: 158 - 105 = +53
const flexaoDiff = comparisonData.variations.admDiffs.find(a => a.movement === 'Flexão');
assert.strictEqual(flexaoDiff.activeDiff, 53, 'Ganho de flexão ativa deve ser +53°');

// Abdução: 145 - 90 = +55
const abducaoDiff = comparisonData.variations.admDiffs.find(a => a.movement === 'Abdução');
assert.strictEqual(abducaoDiff.activeDiff, 55, 'Ganho de abdução ativa deve ser +55°');

// Força:
const supraStr = comparisonData.variations.strengthDiffs.find(s => s.muscleGroup === 'Supraespinhal');
assert.strictEqual(supraStr.baselineGrade, '3');
assert.strictEqual(supraStr.currentGrade, '4+');

assert.strictEqual(comparisonData.timeline.length, 2, 'Timeline deve ter 2 pontos para o gráfico');
console.log('  ✅ [PASS] Variações calculadas perfeitamente: Dor -5, Flexão +53°, Abdução +55°, Força 3 -> 4+');

// -------------------------------------------------------------
// GRUPO 5: Isolamento Multi-Clínica (Tenant Isolation)
// -------------------------------------------------------------
console.log('\n--- TEST GROUP 5: Isolamento Multi-Clínica (Tenant Isolation) ---');

const foreignTenant = 't-foreign-' + Date.now();
const foreignUser = 'u-foreign-' + Date.now();
let foreignError = null;

PhysiotherapyController.getRegionalComparison(
  {
    tenantId: foreignTenant,
    user: { userId: foreignUser, role: 'professional' },
    params: { patientId, regionId: 'shoulder_right' },
    query: {}
  },
  {
    status: (code) => ({
      json: (data) => {
        foreignError = { code, data };
      }
    })
  }
);

assert(foreignError && (foreignError.code === 403 || foreignError.code === 404), 'Outra clínica não pode acessar avaliações');
console.log('  ✅ [PASS] Isolamento entre clínicas garantido com sucesso');

console.log('\n================================================================');
console.log('🎉 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO! 🚀');
console.log('================================================================\n');
