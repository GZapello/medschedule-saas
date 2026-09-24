const assert = require('assert');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

console.log('================================================================');
console.log('TEST SUITE: ÁRVORE CLÍNICA ZEMDA & REMOÇÃO DEFINITIVA FORA ESCOPO');
console.log('================================================================\n');

// 1. Carrega utils compilados
const { initializeDatabase } = require('../dist/config/database');
const { resolveCanonicalProfession, cleanPracticeAreasForNewProfession } = require('../dist/utils/profession-module');
const { CapabilityService } = require('../dist/services/capability.service');
const { migrateRemoveOutOfScopeProfessions } = require('../dist/config/remove-out-of-scope-professions.migration');
const { migrateModularArchitecture } = require('../dist/config/modular-architecture.migration');

// ============================================================================
// TESTE 1: REMOÇÃO E BLOQUEIO DE PROFISSÕES FORA DO ESCOPO & VETERINÁRIA
// ============================================================================
console.log('1. Testando bloqueio definitivo de profissões fora do escopo...');

const outOfScopeCases = [
  { id: 'prof-advogado', name: 'Advogado', reg: 'OAB' },
  { id: 'prof-contador', name: 'Contador', reg: 'CRC' },
  { id: 'prof-consultor', name: 'Consultor Empresarial' },
  { id: 'prof-coach', name: 'Coach de Carreira' },
  { id: 'prof-cabeleireiro', name: 'Cabeleireiro' },
  { id: 'prof-lash-designer', name: 'Lash Designer' },
  { id: 'prof-adestrador', name: 'Adestrador de Cães' },
  { id: 'prof-professor-particular', name: 'Professor Particular' },
  { id: 'prof-tutor-escolar', name: 'Tutor Escolar' },
  { id: 'prof-veterinario', name: 'Médico Veterinário', reg: 'CRMV' },
  { id: 'prof-medicina-veterinaria', name: 'Medicina Veterinária', reg: 'CRMV' }
];

for (const tc of outOfScopeCases) {
  const res = resolveCanonicalProfession({
    id: tc.id,
    name: tc.name,
    registrationType: tc.reg
  });

  assert.strictEqual(res.canonicalId, '', `Esperava canonicalId vazio para ${tc.name}, obteve: ${res.canonicalId}`);
  assert.strictEqual(res.commercialModule, null, `Esperava commercialModule null para ${tc.name}`);
  assert.strictEqual(res.clinicalWorkspace, null, `Esperava clinicalWorkspace null para ${tc.name}`);
  assert.strictEqual(res.taxonomyCategory, 'NON_CLINICAL', `Esperava taxonomyCategory NON_CLINICAL para ${tc.name}`);

  // Nenhuma flag comercial pode estar ativa
  for (const [flag, val] of Object.entries(res.flags)) {
    assert.strictEqual(val, 0, `Flag ${flag} deve ser 0 para ${tc.name}`);
  }
}
console.log('  ✓ Todas as 11 profissões fora do escopo e veterinárias foram rejeitadas categoricamente.');

// ============================================================================
// TESTE 2: RESOLUÇÃO CANÔNICA DAS 13 PROFISSÕES DE APOIO À SAÚDE (HEALTH_SUPPORT)
// ============================================================================
console.log('\n2. Testando resolução das 13 profissões de apoio à saúde (HEALTH_SUPPORT)...');

const healthSupportCases = [
  { id: 'prof-enfermeiro', name: 'Enfermeiro', board: 'COREN' },
  { id: 'prof-tec-enfermagem', name: 'Técnico de Enfermagem', board: 'COREN' },
  { id: 'prof-biomedicina', name: 'Biomédico', board: 'CRBM' },
  { id: 'prof-farmacia', name: 'Farmacêutico', board: 'CRF' },
  { id: 'prof-servico-social', name: 'Assistente Social', board: 'CRESS' },
  { id: 'prof-musicoterapia', name: 'Musicoterapeuta' },
  { id: 'prof-arteterapia', name: 'Arteterapeuta' },
  { id: 'prof-podologia', name: 'Podólogo' },
  { id: 'prof-acupuntura', name: 'Acupunturista' },
  { id: 'prof-esteticista', name: 'Esteticista' },
  { id: 'prof-doula', name: 'Doula / Consultora de Amamentação' },
  { id: 'prof-instrutor-pilates', name: 'Instrutor de Pilates' },
  { id: 'prof-outro-saude', name: 'Outro Profissional da Saúde' }
];

for (const hs of healthSupportCases) {
  const res = resolveCanonicalProfession({
    id: hs.id,
    name: hs.name,
    registrationType: hs.board
  });

  assert.strictEqual(res.taxonomyCategory, 'HEALTH_SUPPORT', `Esperava HEALTH_SUPPORT para ${hs.name}, obteve ${res.taxonomyCategory}`);
  assert.strictEqual(res.commercialModule, null, `Esperava commercialModule null para ${hs.name}`);
  assert.strictEqual(res.clinicalWorkspace, 'general', `Esperava clinicalWorkspace 'general' para ${hs.name}`);

  // Nenhuma flag comercial ativa
  for (const [flag, val] of Object.entries(res.flags)) {
    assert.strictEqual(val, 0, `Flag ${flag} deve ser 0 para ${hs.name}`);
  }
}
console.log('  ✓ Todas as 13 profissões HEALTH_SUPPORT mapeadas com commercialModule=null e clinicalWorkspace="general".');

// ============================================================================
// TESTE 3: ISOLAMENTO DOS 9 MÓDULOS COMERCIAIS EXISTENTES (ZERO REGRESSÃO)
// ============================================================================
console.log('\n3. Testando integridade e exclusividade mútua dos 9 módulos comerciais...');

const commercialCases = [
  { input: { id: 'prof-medico', name: 'Médico' }, expectedModule: 'ZemdaMed', expectedWorkspace: 'ZemdaMed' },
  { input: { id: 'prof-neurologista', name: 'Neurologista' }, expectedModule: 'ZemdaMed', expectedWorkspace: 'ZemdaMed' },
  { input: { id: 'prof-fonoaudiologo', name: 'Fonoaudiólogo' }, expectedModule: 'ZemdaFono', expectedWorkspace: 'ZemdaFono' },
  { input: { id: 'prof-fisioterapeuta', name: 'Fisioterapeuta' }, expectedModule: 'ZemdaFisio', expectedWorkspace: 'ZemdaFisio' },
  { input: { id: 'prof-psicologo', name: 'Psicólogo' }, expectedModule: 'ZemdaPsico', expectedWorkspace: 'ZemdaPsico' },
  { input: { id: 'prof-terapeuta-ocupacional', name: 'Terapeuta Ocupacional' }, expectedModule: 'ZemdaTO', expectedWorkspace: 'ZemdaTO' },
  { input: { id: 'prof-nutricionista', name: 'Nutricionista' }, expectedModule: 'ZemdaNutri', expectedWorkspace: 'ZemdaNutri' },
  { input: { id: 'prof-dentista', name: 'Cirurgião-Dentista' }, expectedModule: 'ZemdaOdonto', expectedWorkspace: 'ZemdaOdonto' },
  { input: { id: 'prof-psicopedagogo', name: 'Psicopedagogo' }, expectedModule: 'ZemdaPP', expectedWorkspace: 'ZemdaPP' },
  { input: { id: 'prof-personal-trainer', name: 'Personal Trainer' }, expectedModule: 'ZemdaPersonal', expectedWorkspace: 'ZemdaPersonal' }
];

for (const cc of commercialCases) {
  const res = resolveCanonicalProfession(cc.input);
  assert.strictEqual(res.commercialModule, cc.expectedModule, `Esperava ${cc.expectedModule} para ${cc.input.name}`);
  assert.strictEqual(res.clinicalWorkspace, cc.expectedWorkspace, `Esperava workspace ${cc.expectedWorkspace} para ${cc.input.name}`);

  // Exclusividade mútua estrita: exatamente 1 flag ligada
  const activeFlags = Object.entries(res.flags).filter(([_, v]) => v === 1);
  assert.strictEqual(activeFlags.length, 1, `Esperava exatamente 1 flag ativa para ${cc.input.name}`);
}
console.log('  ✓ Todos os 9 módulos comerciais preservados com estrita exclusividade mútua.');

// ============================================================================
// TESTE 4: BANCO DE DADOS, MIGRAÇÃO IDEMPOTENTE E CATÁLOGO DE PRACTICE AREAS
// ============================================================================
console.log('\n4. Testando migrações em banco isolado em memória...');

const memDb = new DatabaseSync(':memory:');
// Cria schema base simplificado
memDb.exec(`
  CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    icon TEXT,
    default_terminology TEXT DEFAULT 'patient',
    is_clinical INTEGER DEFAULT 1,
    description TEXT,
    active INTEGER DEFAULT 1
  );
  CREATE TABLE professions (
    id TEXT PRIMARY KEY,
    category_id TEXT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    registration_board_label TEXT,
    registration_required INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1
  );
  CREATE TABLE specialties (
    id TEXT PRIMARY KEY,
    profession_id TEXT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    color TEXT DEFAULT '#6366f1',
    active INTEGER DEFAULT 1
  );
  CREATE TABLE plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL
  );
  CREATE TABLE tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    name TEXT,
    profession_id TEXT,
    profession_name TEXT,
    practice_areas TEXT
  );
  CREATE TABLE professionals (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    user_id TEXT,
    name TEXT,
    profession_id TEXT,
    profession_name TEXT,
    practice_areas TEXT
  );
  CREATE TABLE clinic_users (
    user_id TEXT,
    tenant_id TEXT,
    profession_id TEXT,
    profession_name TEXT,
    practice_areas TEXT,
    PRIMARY KEY (user_id, tenant_id)
  );

  INSERT INTO plans (id, name, code) VALUES ('zemda-CLINIC', 'Clinic', 'CLINIC'), ('zemda-SOLO', 'Solo', 'SOLO');
`);

// Insere dados legados com profissão fora do escopo para testar neutralização
memDb.exec(`
  INSERT INTO professions (id, name, slug) VALUES ('prof-advogado', 'Advogado', 'advogado');
  INSERT INTO professions (id, name, slug) VALUES ('prof-veterinario', 'Médico Veterinário', 'veterinario');
  INSERT INTO users (id, name, profession_id, profession_name) VALUES ('user-adv', 'Dr. Jurídico', 'prof-advogado', 'Advogado Trabalhista');
  INSERT INTO professionals (id, user_id, name, profession_id, profession_name) VALUES ('prof-vet-1', 'user-vet', 'Dr. Pet', 'prof-veterinario', 'Veterinário');
`);

// Executa migração de remoção
migrateRemoveOutOfScopeProfessions(memDb);

// Verifica neutralização
const neutUser = memDb.prepare("SELECT profession_id, profession_name FROM users WHERE id = 'user-adv'").get();
assert.strictEqual(neutUser.profession_id, null, 'User com advogado deve ter profession_id null');
assert.strictEqual(neutUser.profession_name, 'Profissão precisa ser atualizada', 'User deve ter mensagem de atualização');

const neutProf = memDb.prepare("SELECT profession_id, profession_name FROM professionals WHERE id = 'prof-vet-1'").get();
assert.strictEqual(neutProf.profession_id, null, 'Professional com veterinário deve ter profession_id null');

const deletedAdv = memDb.prepare("SELECT count(*) as c FROM deleted_global_professions WHERE id = 'prof-advogado'").get();
assert.strictEqual(deletedAdv.c, 1, 'prof-advogado deve estar registrado em deleted_global_professions');
console.log('  ✓ Contas legadas com profissões fora do escopo foram neutralizadas com segurança sem exclusão de conta.');

// Executa migração modular
migrateModularArchitecture(memDb);

// Verifica se as 13 profissões HEALTH_SUPPORT foram inseridas em professions
for (const hs of healthSupportCases) {
  const row = memDb.prepare('SELECT id, name FROM professions WHERE id = ?').get(hs.id);
  assert.ok(row, `Profissão ${hs.id} deve existir no catálogo de professions`);
}
console.log('  ✓ Todas as 13 profissões HEALTH_SUPPORT presentes e ativas no banco de dados.');

// Verifica se as novas capabilities foram criadas
const newCaps = ['CLINICAL_EVOLUTION', 'THERAPEUTIC_GOALS', 'GESTATIONAL_FOLLOWUP', 'PHOTO_MONITORING'];
for (const capId of newCaps) {
  const capRow = memDb.prepare('SELECT id, name FROM capabilities WHERE id = ?').get(capId);
  assert.ok(capRow, `Capability ${capId} deve existir no catálogo de capabilities`);
}
console.log('  ✓ Capabilities transversais (CLINICAL_EVOLUTION, THERAPEUTIC_GOALS, GESTATIONAL_FOLLOWUP, PHOTO_MONITORING) criadas com sucesso.');

// Verifica se as practice_areas foram criadas para HEALTH_SUPPORT
const enfAreas = memDb.prepare("SELECT count(*) as c FROM practice_areas WHERE profession_id = 'prof-enfermeiro'").get();
assert.ok(enfAreas.c >= 6, `Enfermagem deve ter ao menos 6 áreas de atuação, encontrou ${enfAreas.c}`);

const podoAreas = memDb.prepare("SELECT count(*) as c FROM practice_areas WHERE profession_id = 'prof-podologia'").get();
assert.ok(podoAreas.c >= 5, `Podologia deve ter ao menos 5 áreas de atuação, encontrou ${podoAreas.c}`);

const doulaAreas = memDb.prepare("SELECT count(*) as c FROM practice_areas WHERE profession_id = 'prof-doula'").get();
assert.ok(doulaAreas.c >= 4, `Doula deve ter ao menos 4 áreas de atuação, encontrou ${doulaAreas.c}`);

const pilatesAreas = memDb.prepare("SELECT count(*) as c FROM practice_areas WHERE profession_id = 'prof-instrutor-pilates'").get();
assert.ok(pilatesAreas.c >= 5, `Pilates deve ter ao menos 5 áreas de atuação, encontrou ${pilatesAreas.c}`);

console.log('  ✓ Catálogo de practice_areas completo para todas as profissões de apoio à saúde.');

// Inicializa banco principal para testes de serviço
initializeDatabase();

// ============================================================================
// TESTE 5: MATRIZ DE CAPABILITIES PARA HEALTH_SUPPORT (NENHUM MÓDULO COMERCIAL)
// ============================================================================
console.log('\n5. Testando cálculo desacoplado de capabilities para HEALTH_SUPPORT...');

// Enfermagem com Estomaterapia
const enfCalc = CapabilityService.calculateCapabilities({
  professionId: 'prof-enfermeiro',
  commercialModule: 'ZemdaGestao',
  practiceAreaIds: ['pa-enf-estomaterapia']
});

assert.strictEqual(enfCalc.professionId, 'prof-enfermeiro');
assert.ok(enfCalc.activeCapabilities.includes('CLINICAL_EVOLUTION'), 'Enfermagem deve ter CLINICAL_EVOLUTION');
assert.ok(enfCalc.activeCapabilities.includes('MEDICAL_VITAL_SIGNS'), 'Enfermagem deve ter MEDICAL_VITAL_SIGNS');
assert.ok(enfCalc.activeCapabilities.includes('PHOTO_MONITORING'), 'Estomaterapia deve ter PHOTO_MONITORING');
assert.ok(enfCalc.activeCapabilities.includes('BODY_MAP'), 'Estomaterapia deve ter BODY_MAP');
assert.ok(!enfCalc.activeCapabilities.includes('ODONTO_SPECIFIC'), 'Enfermagem NÃO pode ter ODONTO_SPECIFIC');
assert.ok(!enfCalc.activeCapabilities.includes('FONO_SPECIFIC'), 'Enfermagem NÃO pode ter FONO_SPECIFIC');
assert.ok(!enfCalc.activeCapabilities.includes('TRAINING_PRESCRIBE'), 'Enfermagem NÃO pode ter TRAINING_PRESCRIBE');

// Doula com Acompanhamento de Parto
const doulaCalc = CapabilityService.calculateCapabilities({
  professionId: 'prof-doula',
  commercialModule: 'ZemdaGestao',
  practiceAreaIds: ['pa-doula-parto']
});

assert.ok(doulaCalc.activeCapabilities.includes('GESTATIONAL_FOLLOWUP'), 'Doula deve ter GESTATIONAL_FOLLOWUP');
assert.ok(doulaCalc.activeCapabilities.includes('THERAPEUTIC_GOALS'), 'Doula deve ter THERAPEUTIC_GOALS');
assert.ok(!doulaCalc.activeCapabilities.includes('ODONTO_SPECIFIC'), 'Doula NÃO pode ter ODONTO_SPECIFIC');
assert.ok(!doulaCalc.activeCapabilities.includes('MEDICAL_BASE'), 'Doula NÃO pode ter MEDICAL_BASE');

console.log('  ✓ Regras DEFAULT, OPTIONAL e HIDDEN calculadas corretamente para profissionais sem módulo comercial.');

// ============================================================================
// TESTE 6: TESTE DE LIMPEZA DE PRACTICE AREAS AO TROCAR DE PROFISSÃO
// ============================================================================
console.log('\n6. Testando sanitização de practice_areas residuais...');

const dirtyAreas = 'Fonoaudiologia Infantil, Terapia ABA, Traumato-Ortopédica, Musculação';
const cleanedForPsico = cleanPracticeAreasForNewProfession('prof-psicologo', dirtyAreas);
assert.strictEqual(cleanedForPsico, 'Terapia ABA', `Esperava apenas 'Terapia ABA', obteve '${cleanedForPsico}'`);

console.log('  ✓ Áreas incompatíveis purgadas com sucesso.');

console.log('\n================================================================');
console.log('TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!');
console.log('================================================================');
