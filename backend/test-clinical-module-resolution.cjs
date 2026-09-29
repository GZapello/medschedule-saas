const assert = require('assert');
const { v4: uuidv4 } = require('uuid');
const { db } = require('./dist/config/database');
const { resolveClinicalModule, resolveProfessionalCanonicalModule, isPrimaryClinicalModule } = require('./dist/utils/clinical-module');
const { resolveCanonicalProfession } = require('./dist/utils/profession-module');

console.log('=== TESTE DE RESOLUÇÃO E PROMOÇÃO DE MÓDULOS CLÍNICOS ===\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
  }
}

const testTenantId = 'tenant-test-mod-' + Date.now();
const testPatientId = 'pat-test-' + Date.now();

// Setup tenant e paciente
db.prepare("INSERT INTO tenants (id, name, slug, email, plan_id, status) VALUES (?, 'Clínica Modular Teste', ?, 'clinica@teste.com', 'plan-pro', 'active')")
  .run(testTenantId, 'slug-' + Date.now());

db.prepare("INSERT INTO patients (id, tenant_id, full_name, email, phone) VALUES (?, ?, 'Paciente Teste Modulos', 'paciente@teste.com', '11999999999')")
  .run(testPatientId, testTenantId);

const testServiceId = 'srv-test-' + Date.now();
db.prepare(`
  INSERT INTO services (id, tenant_id, name, duration_minutes, buffer_minutes, price, modality, active)
  VALUES (?, ?, 'Consulta Teste', 50, 10, 150, 'presential', 1)
`).run(testServiceId, testTenantId);

// 1. Matriz de Profissões Canônicas (Item 6 do Requisito)
const canonicalCases = [
  { name: 'Odontologia / Cirurgião-Dentista', profId: 'prof-dentista', profName: 'Cirurgião-Dentista', expected: 'ZemdaOdonto' },
  { name: 'Fisioterapia / Fisioterapeuta', profId: 'prof-fisioterapeuta', profName: 'Fisioterapeuta', expected: 'ZemdaFisio' },
  { name: 'Nutrição / Nutricionista', profId: 'prof-nutricionista', profName: 'Nutricionista', expected: 'ZemdaNutri' },
  { name: 'Psicologia / Psicólogo', profId: 'prof-psicologo', profName: 'Psicólogo', expected: 'ZemdaPsico' },
  { name: 'Fonoaudiologia / Fonoaudiólogo', profId: 'prof-fonoaudiologo', profName: 'Fonoaudiólogo', expected: 'ZemdaFono' },
  { name: 'Psicopedagogia / Psicopedagogo', profId: 'prof-psicopedagogo', profName: 'Psicopedagogo', expected: 'ZemdaPP' },
  { name: 'Personal Trainer / Educação Física', profId: 'prof-personal-trainer', profName: 'Personal Trainer', expected: 'ZemdaPersonal' },
  { name: 'Estética / Esteticista', profId: 'prof-esteticista', profName: 'Esteticista', expected: 'ZemdaEstetic' },
  { name: 'Medicina / Médico', profId: 'prof-medico', profName: 'Médico', expected: 'ZemdaMed' },
  { name: 'Terapia Ocupacional / Terapeuta Ocupacional', profId: 'prof-terapeuta-ocupacional', profName: 'Terapeuta Ocupacional', expected: 'ZemdaTO' }
];

console.log('--- 1. Verificação das 10 Profissões Canônicas ---');
for (const c of canonicalCases) {
  test(`Profissão canônica: ${c.name} -> ${c.expected}`, () => {
    // 1. Resolução canônica pura
    const canon = resolveCanonicalProfession({ id: c.profId, name: c.profName });
    assert.strictEqual(canon.commercialModule, c.expected, `commercialModule deveria ser ${c.expected}`);

    // 2. Criação de profissional no banco e teste de resolveProfessionalCanonicalModule
    const pId = 'p-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, profession_name, active)
      VALUES (?, ?, NULL, ?, ?, ?, 1)
    `).run(pId, testTenantId, 'Dra. ' + c.profName, c.profId, c.profName);

    const resolved = resolveProfessionalCanonicalModule(pId, testTenantId);
    assert.strictEqual(resolved, c.expected, `resolveProfessionalCanonicalModule retornou ${resolved}, esperado ${c.expected}`);

    // 3. Teste de agendamento novo com este profissional
    const appt = { professional_id: pId };
    const apptMod = resolveClinicalModule(appt, testTenantId);
    assert.strictEqual(apptMod, c.expected, `resolveClinicalModule no agendamento retornou ${apptMod}`);
  });
}

console.log('\n--- 2. Promoção Segura de Registros Legados ("general" -> Módulo Canônico) ---');

// Cria dentista específico para testes de atendimento
const dentistProfId = 'pro-dent-' + Date.now();
db.prepare(`
  INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, profession_name, active, zemda_odonto_enabled)
  VALUES (?, ?, NULL, 'Dr. Carlos Odonto', 'prof-dentista', 'Cirurgião-Dentista', 1, 1)
`).run(dentistProfId, testTenantId);

test('Agendamento legado com clinical_module="general" é promovido para ZemdaOdonto por resolveClinicalModule', () => {
  const apptId = 'apt-legacy-gen-' + Date.now();
  db.prepare(`
    INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, status, clinical_module, start_time, end_time)
    VALUES (?, ?, 'LEGACY-001', ?, ?, ?, 'scheduled', 'general', '2026-09-29T10:00:00', '2026-09-29T10:50:00')
  `).run(apptId, testTenantId, testPatientId, dentistProfId, testServiceId);

  const row = db.prepare('SELECT * FROM appointments WHERE id = ?').get(apptId);
  assert.strictEqual(row.clinical_module, 'general', 'No banco deve iniciar com general');

  const resolved = resolveClinicalModule(row, testTenantId);
  assert.strictEqual(resolved, 'ZemdaOdonto', `Deveria promover de general para ZemdaOdonto, retornou ${resolved}`);
});

test('Simulação de Início de Atendimento (Agenda) com Agendamento "general" não bloqueia e grava ZemdaOdonto', () => {
  const apptId = 'apt-start-promo-' + Date.now();
  db.prepare(`
    INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, status, clinical_module, start_time, end_time)
    VALUES (?, ?, 'LEGACY-002', ?, ?, ?, 'scheduled', 'general', '2026-09-29T11:00:00', '2026-09-29T11:50:00')
  `).run(apptId, testTenantId, testPatientId, dentistProfId, testServiceId);

  const current = db.prepare('SELECT * FROM appointments WHERE id = ?').get(apptId);
  const rawCurrentModule = current.clinical_module;
  const requestedModule = 'ZemdaOdonto';
  const resolvedProfModule = resolveClinicalModule(current, testTenantId);

  let clinicalModule = undefined;
  if (isPrimaryClinicalModule(requestedModule)) {
    clinicalModule = requestedModule;
  } else if (isPrimaryClinicalModule(resolvedProfModule)) {
    clinicalModule = resolvedProfModule;
  }

  // Regra de Imutabilidade
  const isConflict =
    isPrimaryClinicalModule(rawCurrentModule) &&
    isPrimaryClinicalModule(clinicalModule) &&
    rawCurrentModule !== clinicalModule;

  assert.strictEqual(isConflict, false, 'Não deve apontar conflito ao promover de general para ZemdaOdonto!');

  // Executa update no banco
  db.prepare(`
    UPDATE appointments SET
      status = 'in_progress',
      clinical_module = COALESCE(?, NULLIF(clinical_module, 'ZemdaBody')),
      updated_at = datetime('now')
    WHERE id = ? AND tenant_id = ?
  `).run(clinicalModule, apptId, testTenantId);

  const updated = db.prepare('SELECT status, clinical_module FROM appointments WHERE id = ?').get(apptId);
  assert.strictEqual(updated.status, 'in_progress');
  assert.strictEqual(updated.clinical_module, 'ZemdaOdonto', 'O agendamento no banco agora deve estar com ZemdaOdonto!');
});

console.log('\n--- 3. Proteção Real e Imutabilidade (Bloqueio de Troca Conflitante) ---');

test('Tentativa de trocar ZemdaOdonto para ZemdaFisio em atendimento em andamento deve ser bloqueada', () => {
  const apptId = 'apt-locked-odonto-' + Date.now();
  db.prepare(`
    INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, status, clinical_module, start_time, end_time)
    VALUES (?, ?, 'LOCK-001', ?, ?, ?, 'in_progress', 'ZemdaOdonto', '2026-09-29T14:00:00', '2026-09-29T14:50:00')
  `).run(apptId, testTenantId, testPatientId, dentistProfId, testServiceId);

  const current = db.prepare('SELECT * FROM appointments WHERE id = ?').get(apptId);
  const rawCurrentModule = current.clinical_module;
  const requestedModule = 'ZemdaFisio'; // Tentativa indevida

  let clinicalModule = isPrimaryClinicalModule(requestedModule) ? requestedModule : current.clinical_module;

  const isConflict =
    isPrimaryClinicalModule(rawCurrentModule) &&
    isPrimaryClinicalModule(clinicalModule) &&
    rawCurrentModule !== clinicalModule;

  assert.strictEqual(isConflict, true, 'Deve identificar conflito real entre ZemdaOdonto e ZemdaFisio!');
});

test('Tentativa de salvar prontuário em ZemdaPsico para atendimento ZemdaOdonto deve ser bloqueada', () => {
  const apptId = 'apt-rec-conflict-' + Date.now();
  db.prepare(`
    INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, status, clinical_module, start_time, end_time)
    VALUES (?, ?, 'REC-001', ?, ?, ?, 'in_progress', 'ZemdaOdonto', '2026-09-29T15:00:00', '2026-09-29T15:50:00')
  `).run(apptId, testTenantId, testPatientId, dentistProfId, testServiceId);

  const apptRow = db.prepare('SELECT id, professional_id, clinical_module FROM appointments WHERE id = ?').get(apptId);
  const incomingModule = 'ZemdaPsico';

  const isBlocked =
    apptRow?.clinical_module &&
    isPrimaryClinicalModule(apptRow.clinical_module) &&
    isPrimaryClinicalModule(incomingModule) &&
    apptRow.clinical_module !== incomingModule;

  assert.strictEqual(isBlocked, true, 'Deve bloquear registro em módulo diferente do atendimento iniciado!');
});

test('Atendimento com evolução salva em ZemdaOdonto bloqueia troca mesmo que solicitada', () => {
  const apptId = 'apt-rec-saved-' + Date.now();
  db.prepare(`
    INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, status, clinical_module, start_time, end_time)
    VALUES (?, ?, 'REC-002', ?, ?, ?, 'in_progress', 'ZemdaOdonto', '2026-09-29T16:00:00', '2026-09-29T16:50:00')
  `).run(apptId, testTenantId, testPatientId, dentistProfId, testServiceId);

  const recId = 'rec-' + Date.now();
  db.prepare(`
    INSERT INTO records (id, tenant_id, patient_id, appointment_id, professional_id, session_date, title, module_type, clinical_evolution)
    VALUES (?, ?, ?, ?, ?, '2026-09-29', 'Evolução Odontológica', 'ZemdaOdonto', 'Paciente realizou restauração no dente 16.')
  `).run(recId, testTenantId, testPatientId, apptId, dentistProfId);

  const existingRec = db.prepare("SELECT module_type FROM records WHERE appointment_id = ?").get(apptId);
  const targetModule = 'ZemdaFisio';

  const conflict =
    existingRec &&
    isPrimaryClinicalModule(existingRec.module_type) &&
    isPrimaryClinicalModule(targetModule) &&
    existingRec.module_type !== targetModule;

  assert.strictEqual(conflict, true, 'Deve barrar com erro de prontuário já gravado em outro módulo!');
});

console.log('\n--- 4. Criação Antecipada de Agendamento ---');

test('Novo agendamento criado para Dentista grava diretamente ZemdaOdonto e profession_id', () => {
  const newApptId = 'apt-created-' + Date.now();
  const initialModule = resolveClinicalModule({ professional_id: dentistProfId }, testTenantId);
  assert.strictEqual(initialModule, 'ZemdaOdonto');

  db.prepare(`
    INSERT INTO appointments (
      id, tenant_id, appointment_number, patient_id, professional_id, service_id,
      status, clinical_module, profession_id, start_time, end_time
    )
    VALUES (?, ?, 'AG-2026-9999', ?, ?, ?, 'scheduled', ?, 'prof-dentista', '2026-09-30T09:00:00', '2026-09-30T09:50:00')
  `).run(newApptId, testTenantId, testPatientId, dentistProfId, testServiceId, initialModule);

  const created = db.prepare('SELECT clinical_module, profession_id FROM appointments WHERE id = ?').get(newApptId);
  assert.strictEqual(created.clinical_module, 'ZemdaOdonto');
  assert.strictEqual(created.profession_id, 'prof-dentista');
});

console.log('\n--- 5. Profissional sem Módulo Específico (Fallback Seguro) ---');

test('Profissional de apoio sem módulo específico usa "general" sem quebrar', () => {
  const genericProfId = 'pro-gen-' + Date.now();
  db.prepare(`
    INSERT INTO professionals (id, tenant_id, name, profession_id, profession_name, active)
    VALUES (?, ?, 'Secretária / Apoio', 'prof-outro-saude', 'Apoio Administrativo', 1)
  `).run(genericProfId, testTenantId);

  const resolved = resolveClinicalModule({ professional_id: genericProfId }, testTenantId);
  assert.strictEqual(resolved, 'general', 'Profissional sem módulo específico deve retornar general');
});

// Limpeza de testes
db.prepare('DELETE FROM records WHERE tenant_id = ?').run(testTenantId);
db.prepare('DELETE FROM appointments WHERE tenant_id = ?').run(testTenantId);
db.prepare('DELETE FROM professionals WHERE tenant_id = ?').run(testTenantId);
db.prepare('DELETE FROM patients WHERE tenant_id = ?').run(testTenantId);
db.prepare('DELETE FROM tenants WHERE id = ?').run(testTenantId);

console.log(`\n==================================================`);
console.log(`RESULTADO FINAL: ${passedTests}/${totalTests} testes passaram com sucesso!`);
console.log(`==================================================\n`);
if (passedTests !== totalTests) {
  process.exit(1);
}
