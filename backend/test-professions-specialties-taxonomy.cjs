const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-taxonomy-test-'));
process.env.DATABASE_PATH = path.join(tempDir, 'test.sqlite');
process.env.JWT_SECRET = 'test-taxonomy-jwt-secret';
process.env.NODE_ENV = 'test';

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { REGISTRATION_PROFESSIONS, REGISTRATION_PROFESSION_ALIASES, SYSTEM_ROLE_OPTIONS } = require('./dist/types/registration-professions');
const { resolveCanonicalProfession } = require('./dist/utils/profession-module');
const { CapabilityService } = require('./dist/services/capability.service');
const { getEsteticAccess } = require('./dist/controllers/estetic.controller');

console.log('================================================================');
console.log('🧪 TEST SUITE: TAXONOMIA, ESPECIALIDADES E FUNÇÕES NO SISTEMA');
console.log('================================================================\n');

// -------------------------------------------------------------
// GRUPO 1: PADRONIZAÇÃO E CANONICALIDADE DE PROFISSÕES BASE
// -------------------------------------------------------------
console.log('--- TEST GROUP 1: Catálogo de Profissões Canônicas Base ---');

// 1.1 Verificar que profissões ativas do banco não contêm especialidades nem cargos administrativos
const canonicalProfessions = db.prepare(`
  SELECT id, name, slug, registration_board_label, is_canonical, category_id
  FROM professions
  WHERE active = 1 AND (is_canonical = 1 OR is_canonical IS NULL) AND (category_id != 'cat-admin' OR category_id IS NULL)
  ORDER BY name ASC
`).all();

assert(canonicalProfessions.length >= 20, 'Deve haver ao menos 20 profissões canônicas registradas');
console.log(`  ✅ [PASS] ${canonicalProfessions.length} profissões canônicas base carregadas.`);

// Não deve conter especialidades médicas no nível base
const forbiddenBaseNames = [
  'Cardiologista', 'Dermatologista', 'Endocrinologista', 'Neurologista', 'Pediatra', 'Psiquiatra',
  'Ortodontista', 'Odontologia', 'Psicologia', 'Fisioterapia', 'Fonoaudiologia',
  'Gestor da Clínica', 'Coordenação Clínica', 'Recursos Humanos'
];

for (const p of canonicalProfessions) {
  assert(!forbiddenBaseNames.includes(p.name), `Profissão '${p.name}' não deve existir como profissão base`);
}
console.log('  ✅ [PASS] Nenhuma especialidade médica/odontológica ou cargo administrativo no nível base de profissões.');

// 1.2 Nomes e Conselhos Canônicos Padronizados
const medico = canonicalProfessions.find(p => p.id === 'prof-medico');
assert(medico && medico.name === 'Médico' && medico.registration_board_label === 'CRM');

const dentista = canonicalProfessions.find(p => p.id === 'prof-dentista');
assert(dentista && dentista.name === 'Cirurgião-Dentista' && dentista.registration_board_label === 'CRO');

const psicologo = canonicalProfessions.find(p => p.id === 'prof-psicologo');
assert(psicologo && psicologo.name === 'Psicólogo' && psicologo.registration_board_label === 'CRP');

const fono = canonicalProfessions.find(p => p.id === 'prof-fonoaudiologo');
assert(fono && fono.name === 'Fonoaudiólogo' && fono.registration_board_label === 'CRFa');

const fisio = canonicalProfessions.find(p => p.id === 'prof-fisioterapeuta');
assert(fisio && fisio.name === 'Fisioterapeuta' && fisio.registration_board_label === 'CREFITO');

const edFisica = canonicalProfessions.find(p => p.id === 'prof-personal-trainer');
assert(edFisica && edFisica.name === 'Profissional de Educação Física' && edFisica.registration_board_label === 'CREF');

console.log('  ✅ [PASS] Nomenclaturas padronizadas: Cirurgião-Dentista (CRO), Psicólogo (CRP), Fonoaudiólogo (CRFa), Fisioterapeuta (CREFITO), Profissional de Educação Física (CREF).');

// -------------------------------------------------------------
// GRUPO 2: ESPECIALIDADES VINCULADAS (HIERARQUIA CASCATA)
// -------------------------------------------------------------
console.log('\n--- TEST GROUP 2: Especialidades Vinculadas por Profissão ---');

// 2.1 Especialidades Médicas sob prof-medico
const medSpecs = db.prepare(`
  SELECT id, name, slug FROM specialties WHERE profession_id = 'prof-medico' AND active = 1
`).all();

assert(medSpecs.length >= 10, 'Deve haver especialidades médicas vinculadas a prof-medico');
const medSpecNames = medSpecs.map(s => s.name);
assert(medSpecNames.includes('Cardiologia'), 'Cardiologia deve ser especialidade médica');
assert(medSpecNames.includes('Dermatologia'), 'Dermatologia deve ser especialidade médica');
assert(medSpecNames.includes('Neurologia'), 'Neurologia deve ser especialidade médica');
assert(medSpecNames.includes('Pediatria'), 'Pediatria deve ser especialidade médica');
assert(medSpecNames.includes('Psiquiatria'), 'Psiquiatria deve ser especialidade médica');
console.log(`  ✅ [PASS] ${medSpecs.length} especialidades médicas vinculadas a prof-medico.`);

// 2.2 Especialidades Odontológicas sob prof-dentista
const dentalSpecs = db.prepare(`
  SELECT id, name, slug FROM specialties WHERE profession_id = 'prof-dentista' AND active = 1
`).all();

assert(dentalSpecs.length >= 8, 'Deve haver especialidades odontológicas vinculadas a prof-dentista');
const dentalSpecNames = dentalSpecs.map(s => s.name);
assert(dentalSpecNames.includes('Ortodontia'), 'Ortodontia deve ser especialidade de Cirurgião-Dentista');
assert(dentalSpecNames.includes('Endodontia'), 'Endodontia deve ser especialidade de Cirurgião-Dentista');
assert(dentalSpecNames.includes('Implantodontia'), 'Implantodontia deve ser especialidade de Cirurgião-Dentista');
assert(dentalSpecNames.includes('Harmonização Orofacial'), 'Harmonização Orofacial deve ser especialidade de Cirurgião-Dentista');
console.log(`  ✅ [PASS] ${dentalSpecs.length} especialidades odontológicas vinculadas a prof-dentista.`);

// 2.3 Resolução de Aliases e Retrocompatibilidade
assert.equal(REGISTRATION_PROFESSION_ALIASES['prof-odontologia'], 'prof-dentista');
assert.equal(REGISTRATION_PROFESSION_ALIASES['prof-cardiologista'], 'prof-medico');
assert.equal(REGISTRATION_PROFESSION_ALIASES['prof-ortodontista'], 'prof-dentista');
assert.equal(REGISTRATION_PROFESSION_ALIASES['prof-educacao-fisica'], 'prof-personal-trainer');
console.log('  ✅ [PASS] Aliases legados mapeiam para as profissões canônicas corretas.');

// -------------------------------------------------------------
// GRUPO 3: DESACOPLAMENTO ENTRE PAPEL NO SISTEMA E PROFISSÃO CLÍNICA
// -------------------------------------------------------------
console.log('\n--- TEST GROUP 3: Desacoplamento RBAC (Função no Sistema x Profissão Clínica) ---');

const tenantId = 'ten-test-rbac-' + Date.now();
db.prepare(`
  INSERT INTO tenants (id, slug, name, email, status, onboarding_completed, onboarding_step, manager_confirmed)
  VALUES (?, 'clinica-rbac', 'Clínica RBAC Teste', 'rbac@teste.invalid', 'active', 1, 5, 1)
`).run(tenantId);

// Caso: Gestor da Clínica que também é Fonoaudiólogo
const userManagerFonoId = 'usr-manager-fono-' + Date.now();
db.prepare(`
  INSERT INTO users (id, tenant_id, name, email, password_hash, role, profession_id, profession_name, status, zemda_fono_enabled)
  VALUES (?, ?, 'Dr. Carlos Gestor e Fono', 'carlos.gestor@teste.invalid', 'hash', 'clinic_admin', 'prof-fonoaudiologo', 'Fonoaudiólogo', 'active', 1)
`).run(userManagerFonoId, tenantId);

const profCarlosId = 'pro-carlos-' + Date.now();
db.prepare(`
  INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, profession_name, registration_type, registration_number, active, zemda_fono_enabled)
  VALUES (?, ?, ?, 'Dr. Carlos Gestor e Fono', 'prof-fonoaudiologo', 'Fonoaudiólogo', 'CRFa', '12345', 1, 1)
`).run(profCarlosId, tenantId, userManagerFonoId);

db.prepare(`
  INSERT INTO clinic_users (id, tenant_id, user_id, role, is_manager, profession_id, profession_name, status, zemda_fono_enabled)
  VALUES (?, ?, ?, 'clinic_admin', 1, 'prof-fonoaudiologo', 'Fonoaudiólogo', 'active', 1)
`).run('cu-' + userManagerFonoId, tenantId, userManagerFonoId);

// Validação dos acessos simultâneos:
const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userManagerFonoId);
const cuRow = db.prepare('SELECT * FROM clinic_users WHERE user_id = ?').get(userManagerFonoId);
const profRow = db.prepare('SELECT * FROM professionals WHERE user_id = ?').get(userManagerFonoId);

assert.equal(userRow.role, 'clinic_admin', 'Função administrativa deve ser clinic_admin');
assert.equal(cuRow.is_manager, 1, 'is_manager deve ser 1');
assert.equal(userRow.profession_id, 'prof-fonoaudiologo', 'Profissão clínica deve ser Fonoaudiólogo');
assert.equal(userRow.zemda_fono_enabled, 1, 'Módulo ZemdaFono deve estar ativado para o gestor');
assert.ok(profRow, 'Perfil de atendimento profissional deve existir e estar ativo');
assert.equal(profRow.registration_type, 'CRFa');

console.log('  ✅ [PASS] Usuário clinic_admin com profissão clínica Fonoaudiólogo possui perfil administrativo e clínico ativos.');

// -------------------------------------------------------------
// GRUPO 4: ZEMDAESTETIC - ACESSO MULTI-ÁREA
// -------------------------------------------------------------
console.log('\n--- TEST GROUP 4: ZemdaEstetic - Acesso Multi-Área sem Bloqueio Indevido ---');

// 4.1 Biomédico com acesso a Facial, Corporal e Capilar
const userBiomedId = 'usr-biomed-' + Date.now();
db.prepare(`
  INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, profession_id, profession_name, zemda_estetic_enabled)
  VALUES (?, ?, 'Dra. Ana Biomédica Esteta', 'ana.biomed@teste.invalid', 'hash', 'professional', 'active', 'prof-biomedico', 'Biomédico', 1)
`).run(userBiomedId, tenantId);

db.prepare(`
  INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json, zemda_estetic_enabled)
  VALUES (?, ?, ?, 'professional', 'active', 0, '["access_zemda_estetic"]', 1)
`).run('cu-' + userBiomedId, tenantId, userBiomedId);

CapabilityService.setUserPracticeAreas(userBiomedId, tenantId, ['pa-biomed-estetica']);

const accessBiomedFacial = getEsteticAccess({ user: { userId: userBiomedId, role: 'professional' }, tenantId }, 'FACIAL');
assert(accessBiomedFacial.allowed, 'Biomédica esteta deve ter acesso Facial');

const accessBiomedCorporal = getEsteticAccess({ user: { userId: userBiomedId, role: 'professional' }, tenantId }, 'CORPORAL');
assert(accessBiomedCorporal.allowed, 'Biomédica esteta deve ter acesso Corporal');

const accessBiomedCapilar = getEsteticAccess({ user: { userId: userBiomedId, role: 'professional' }, tenantId }, 'CAPILAR');
assert(accessBiomedCapilar.allowed, 'Biomédica esteta deve ter acesso Capilar');

console.log('  ✅ [PASS] Biomédico(a) esteta tem acesso completo às 3 áreas: Facial, Corporal e Capilar.');

console.log('\n================================================================');
console.log('🎉 TODOS OS TESTES DA REFATORAÇÃO ESTRUTURAL FORAM APROVADOS! 🚀');
console.log('================================================================');
