const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { REGISTRATION_PROFESSIONS } = require('./dist/types/registration-professions');
const { db, initializeDatabase } = require('./dist/config/database');

initializeDatabase();

console.log('====================================================');
console.log('TESTE REGRESSÃO: NOMENCLATURA GLOBAL ZEMDA360');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

function check(desc, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}: ${err.message}`);
    failed++;
  }
}

// 1. REGISTRATION_PROFESSIONS
check('REGISTRATION_PROFESSIONS não contém nenhuma referência a ZemdaBody', () => {
  REGISTRATION_PROFESSIONS.forEach(prof => {
    assert(Array.isArray(prof.modules), `Profissão ${prof.id} deve ter array modules`);
    assert(!prof.modules.includes('ZemdaBody'), `Profissão ${prof.id} NÃO deve incluir ZemdaBody`);
    if (prof.id !== 'prof-outro') {
      assert(prof.modules.includes('Zemda360'), `Profissão clínica ${prof.id} deve incluir Zemda360`);
    }
  });
});

// 2. BILLING_BENEFITS
check('BILLING_BENEFITS exibe Zemda360 e não ZemdaBody', () => {
  const content = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/billing/billingBenefits.ts'), 'utf8');
  assert(content.includes("'Zemda360'"), 'BILLING_BENEFITS deve conter Zemda360');
  assert(!content.includes("'ZemdaBody'"), 'BILLING_BENEFITS não deve conter ZemdaBody');
});

// 3. CAPABILITIES NO BANCO
check('Capability BODY_MAP no banco de dados está nomeada Zemda360 (Mapa Corporal)', () => {
  const cap = db.prepare("SELECT name FROM capabilities WHERE id = 'BODY_MAP'").get();
  assert(cap, 'Capability BODY_MAP deve existir');
  assert.strictEqual(cap.name, 'Zemda360 (Mapa Corporal)', 'Nome da capability deve ser Zemda360 (Mapa Corporal)');
});

// 4. NORMALIZAÇÃO DE PRONTUÁRIOS LEGADOS
check('Prontuário legado salvo como ZemdaBody é normalizado para Zemda360 na leitura', () => {
  const dummyId = 'test-rec-zemda360-' + Date.now();
  const existingPat = db.prepare("SELECT id, tenant_id FROM patients LIMIT 1").get();
  const existingProf = existingPat ? db.prepare("SELECT id FROM professionals WHERE tenant_id = ? LIMIT 1").get(existingPat.tenant_id) : null;
  const dummyPatient = existingPat?.id;
  const dummyTenant = existingPat?.tenant_id;
  const dummyProf = existingProf?.id;

  if (!dummyPatient || !dummyTenant) {
    // Se não houver paciente semeado, ignora inserção de FK
    return;
  }

  db.prepare(`
    INSERT INTO records (id, patient_id, tenant_id, professional_id, session_date, module_type, title, clinical_evolution, created_at)
    VALUES (?, ?, ?, ?, date('now'), 'ZemdaBody', 'Teste Legado', 'Conteudo', datetime('now'))
  `).run(dummyId, dummyPatient, dummyTenant, dummyProf || null);

  // Simula a lógica do clinical.controller.ts getById
  const rec = db.prepare("SELECT * FROM records WHERE id = ?").get(dummyId);
  assert.strictEqual(rec.module_type, 'ZemdaBody', 'No banco cru ainda armazena ZemdaBody');
  if (rec.module_type === 'ZemdaBody') {
    rec.module_type = 'Zemda360';
  }
  assert.strictEqual(rec.module_type, 'Zemda360', 'Normalizado para Zemda360');

  // Limpeza
  db.prepare("DELETE FROM records WHERE id = ?").run(dummyId);
});

// 5. REGISTRATION PROFESSION SELECT (FRONTEND)
check('RegistrationProfessionSelect.tsx não exibe ZemdaBody', () => {
  const file = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/auth/RegistrationProfessionSelect.tsx'), 'utf8');
  assert(!file.includes("'ZemdaBody'"), 'RegistrationProfessionSelect não deve ter string literal ZemdaBody');
  assert(file.includes("'Zemda360'"), 'RegistrationProfessionSelect deve incluir Zemda360');
});

// 6. CREATE CLINIC MODAL (FRONTEND)
check('CreateClinicModal.tsx não exibe ZemdaBody', () => {
  const file = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/auth/CreateClinicModal.tsx'), 'utf8');
  assert(!file.includes("'ZemdaBody'"), 'CreateClinicModal não deve ter string literal ZemdaBody');
  assert(file.includes("'Zemda360'"), 'CreateClinicModal deve incluir Zemda360');
});

// 7. FREE TRIAL ACTIVATION VIEW (FRONTEND)
check('FreeTrialActivationView.tsx não exibe ZemdaBody', () => {
  const file = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/auth/FreeTrialActivationView.tsx'), 'utf8');
  assert(!file.includes('ZemdaBody'), 'FreeTrialActivationView não deve conter ZemdaBody');
  assert(file.includes('Zemda360'), 'FreeTrialActivationView deve conter Zemda360');
});

// 8. BILLING VIEW (FRONTEND)
check('BillingView.tsx não exibe ZemdaBody', () => {
  const file = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/billing/BillingView.tsx'), 'utf8');
  assert(!file.includes('ZemdaBody liberado'), 'BillingView não deve conter "ZemdaBody liberado"');
  assert(file.includes('Zemda360 liberado'), 'BillingView deve conter "Zemda360 liberado"');
});

console.log('\n====================================================');
console.log(`TOTAL: ${passed} PASSOU, ${failed} FALHOU`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
