const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-prof-visibility-test-'));
process.env.DATABASE_PATH = path.join(tempDir, 'test.sqlite');
process.env.JWT_SECRET = 'test-visibility-jwt-secret';
process.env.NODE_ENV = 'test';

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { REGISTRATION_PROFESSIONS, REGISTRATION_PROFESSION_ALIASES } = require('./dist/types/registration-professions');
const { resolveCanonicalProfession } = require('./dist/utils/profession-module');
const { CapabilityService } = require('./dist/services/capability.service');
const { TaxonomyController } = require('./dist/controllers/taxonomy.controller');

console.log('================================================================');
console.log('🧪 TEST SUITE: VISIBILIDADE DE PROFISSÕES E ALIASES NO CADASTRO/SUPERADMIN');
console.log('================================================================\n');

// 1. REGISTRATION_PROFESSIONS (Estático / Fonte Unificada)
console.log('--- TEST 1: REGISTRATION_PROFESSIONS Catalog ---');

const fonoReg = REGISTRATION_PROFESSIONS.find(p => p.id === 'prof-fonoaudiologo');
assert(fonoReg, 'prof-fonoaudiologo deve estar em REGISTRATION_PROFESSIONS');
assert.equal(fonoReg.label, 'Fonoaudiólogo(a)');
assert.equal(fonoReg.module, 'ZemdaFono');
assert.equal(fonoReg.boardLabel, 'CRFa');
assert.equal(fonoReg.canonicalId, 'prof-fonoaudiologo');
console.log('  ✅ [PASS] prof-fonoaudiologo em REGISTRATION_PROFESSIONS:', fonoReg.label, fonoReg.module, fonoReg.boardLabel);

const ppReg = REGISTRATION_PROFESSIONS.find(p => p.id === 'prof-psicopedagogo');
assert(ppReg, 'prof-psicopedagogo deve estar em REGISTRATION_PROFESSIONS');
assert.equal(ppReg.label, 'Psicopedagogo(a)');
assert.equal(ppReg.module, 'ZemdaPP');
assert.equal(ppReg.boardLabel, 'ABPp');
assert.equal(ppReg.canonicalId, 'prof-psicopedagogo');
console.log('  ✅ [PASS] prof-psicopedagogo em REGISTRATION_PROFESSIONS:', ppReg.label, ppReg.module, ppReg.boardLabel);

const toReg = REGISTRATION_PROFESSIONS.find(p => p.id === 'prof-terapeuta-ocupacional');
assert(toReg, 'prof-terapeuta-ocupacional deve estar em REGISTRATION_PROFESSIONS');
assert.equal(toReg.label, 'Terapeuta Ocupacional');
assert.equal(toReg.module, 'ZemdaTO');
assert.equal(toReg.boardLabel, 'CREFITO');
assert.equal(toReg.canonicalId, 'prof-terapeuta-ocupacional');
console.log('  ✅ [PASS] prof-terapeuta-ocupacional em REGISTRATION_PROFESSIONS:', toReg.label, toReg.module, toReg.boardLabel);

const psicanalReg = REGISTRATION_PROFESSIONS.find(p => p.id === 'prof-psicanalista');
assert(psicanalReg, 'prof-psicanalista deve estar em REGISTRATION_PROFESSIONS');
assert.equal(psicanalReg.label, 'Psicanalista');
assert.equal(psicanalReg.canonicalId, 'prof-psicologo');
assert.equal(psicanalReg.canonicalName, 'Psicólogo');
assert.equal(psicanalReg.module, 'ZemdaPsico');
assert.equal(psicanalReg.clinicalWorkspace, 'ZemdaPsico');
assert.equal(psicanalReg.taxonomyCategory, 'APPROACH_ALIAS');
console.log('  ✅ [PASS] prof-psicanalista em REGISTRATION_PROFESSIONS:', psicanalReg.label, psicanalReg.canonicalId, psicanalReg.module);

const psicoterapReg = REGISTRATION_PROFESSIONS.find(p => p.id === 'prof-psicoterapeuta');
assert(psicoterapReg, 'prof-psicoterapeuta deve estar em REGISTRATION_PROFESSIONS');
assert.equal(psicoterapReg.label, 'Psicoterapeuta');
assert.equal(psicoterapReg.canonicalId, 'prof-psicologo');
assert.equal(psicoterapReg.canonicalName, 'Psicólogo');
assert.equal(psicoterapReg.module, 'ZemdaPsico');
assert.equal(psicoterapReg.clinicalWorkspace, 'ZemdaPsico');
assert.equal(psicoterapReg.taxonomyCategory, 'APPROACH_ALIAS');
assert.equal(psicoterapReg.isSpecificAlias, true);
console.log('  ✅ [PASS] prof-psicoterapeuta em REGISTRATION_PROFESSIONS:', psicoterapReg.label, psicoterapReg.canonicalId, psicoterapReg.module);

// 2. /v1/taxonomy/professions (Endpoint Dinâmico do Cadastro)
console.log('\n--- TEST 2: /v1/taxonomy/professions (Endpoint Dinâmico do Cadastro) ---');

let taxonomyList = [];
const fakeRes = {
  json: (data) => { taxonomyList = data; },
  status: () => fakeRes
};

TaxonomyController.listProfessions({ query: {} }, fakeRes);

const fonoApi = taxonomyList.find(p => p.id === 'prof-fonoaudiologo');
assert(fonoApi, 'prof-fonoaudiologo deve ser retornado por /v1/taxonomy/professions');
assert.equal(fonoApi.label, 'Fonoaudiólogo(a)');
assert.equal(fonoApi.module, 'ZemdaFono');
assert.equal(fonoApi.boardLabel, 'CRFa');
assert.equal(fonoApi.canonicalId, 'prof-fonoaudiologo');
console.log('  ✅ [PASS] prof-fonoaudiologo retornado dinamicamente:', fonoApi.label, fonoApi.module);

const ppApi = taxonomyList.find(p => p.id === 'prof-psicopedagogo');
assert(ppApi, 'prof-psicopedagogo deve ser retornado por /v1/taxonomy/professions');
assert.equal(ppApi.label, 'Psicopedagogo(a)');
assert.equal(ppApi.module, 'ZemdaPP');
assert.equal(ppApi.boardLabel, 'ABPp');
assert.equal(ppApi.canonicalId, 'prof-psicopedagogo');
console.log('  ✅ [PASS] prof-psicopedagogo retornado dinamicamente:', ppApi.label, ppApi.module);

const toApi = taxonomyList.find(p => p.id === 'prof-terapeuta-ocupacional');
assert(toApi, 'prof-terapeuta-ocupacional deve ser retornado por /v1/taxonomy/professions');
assert.equal(toApi.label, 'Terapeuta Ocupacional');
assert.equal(toApi.module, 'ZemdaTO');
assert.equal(toApi.boardLabel, 'CREFITO');
assert.equal(toApi.canonicalId, 'prof-terapeuta-ocupacional');
console.log('  ✅ [PASS] prof-terapeuta-ocupacional retornado dinamicamente:', toApi.label, toApi.module);

const psicanalApi = taxonomyList.find(p => p.id === 'prof-psicanalista');
assert(psicanalApi, 'prof-psicanalista deve ser retornado por /v1/taxonomy/professions');
assert.equal(psicanalApi.label, 'Psicanalista');
assert.equal(psicanalApi.canonicalId, 'prof-psicologo');
assert.equal(psicanalApi.canonicalName, 'Psicólogo');
assert.equal(psicanalApi.module, 'ZemdaPsico');
assert.equal(psicanalApi.clinicalWorkspace, 'ZemdaPsico');
assert.equal(psicanalApi.taxonomyCategory, 'APPROACH_ALIAS');
console.log('  ✅ [PASS] prof-psicanalista retornado dinamicamente:', psicanalApi.label, psicanalApi.canonicalId, psicanalApi.module);

const psicoterapApi = taxonomyList.find(p => p.id === 'prof-psicoterapeuta');
assert(psicoterapApi, 'prof-psicoterapeuta deve ser retornado por /v1/taxonomy/professions');
assert.equal(psicoterapApi.label, 'Psicoterapeuta');
assert.equal(psicoterapApi.canonicalId, 'prof-psicologo');
assert.equal(psicoterapApi.canonicalName, 'Psicólogo');
assert.equal(psicoterapApi.module, 'ZemdaPsico');
assert.equal(psicoterapApi.clinicalWorkspace, 'ZemdaPsico');
assert.equal(psicoterapApi.taxonomyCategory, 'APPROACH_ALIAS');
assert.equal(psicoterapApi.isSpecificAlias, true);
console.log('  ✅ [PASS] prof-psicoterapeuta retornado dinamicamente:', psicoterapApi.label, psicoterapApi.canonicalId, psicoterapApi.module);

// 3. /v1/taxonomy/professions?all=true (SuperAdmin Global)
console.log('\n--- TEST 3: /v1/taxonomy/professions?all=true (SuperAdmin) ---');

let superAdminList = [];
const fakeResAdmin = {
  json: (data) => { superAdminList = data; },
  status: () => fakeResAdmin
};

TaxonomyController.listProfessions({ query: { all: 'true' } }, fakeResAdmin);

const targetProfessions = ['prof-fonoaudiologo', 'prof-psicopedagogo', 'prof-terapeuta-ocupacional', 'prof-psicanalista', 'prof-psicoterapeuta'];
for (const tId of targetProfessions) {
  const pAdmin = superAdminList.find(p => p.id === tId);
  assert(pAdmin, `${tId} deve aparecer no SuperAdmin`);
  assert.equal(pAdmin.is_canonical, 1);
  assert.equal(pAdmin.active, 1);
  console.log(`  ✅ [PASS] ${tId} no SuperAdmin com is_canonical=1 e active=1`);
}

// 4. Áreas de Atuação e Inferred Area para Psicanalista e Psicoterapeuta
console.log('\n--- TEST 4: Áreas de Atuação para Psicanalista e Psicoterapeuta ---');

const psicanalAreas = CapabilityService.getPracticeAreas('prof-psicanalista');
assert(psicanalAreas.length > 0, 'Deve retornar área vinculada para prof-psicanalista');
const psiArea = psicanalAreas.find(a => a.id === 'pa-psico-psicanalise');
assert(psiArea, 'Área pa-psico-psicanalise deve estar presente');
assert.equal(psiArea.isInferredForAlias, true);
assert.equal(psiArea.isSpecificLocked, true);
console.log('  ✅ [PASS] Áreas de Psicanalista mapeadas com sucesso (pa-psico-psicanalise, auto-inferido e travado).');

const psicoterapAreas = CapabilityService.getPracticeAreas('prof-psicoterapeuta');
assert(psicoterapAreas.length > 0, 'Deve retornar área vinculada para prof-psicoterapeuta');
const terapArea = psicoterapAreas.find(a => a.id === 'pa-psico-clinica');
assert(terapArea, 'Área pa-psico-clinica deve estar presente');
assert.equal(terapArea.isInferredForAlias, true);
assert.equal(terapArea.isSpecificLocked, true);
console.log('  ✅ [PASS] Áreas de Psicoterapeuta mapeadas com sucesso (pa-psico-clinica, auto-inferido e travado).');

// 5. Auditoria de deleted_global_professions
console.log('\n--- TEST 5: Auditoria de deleted_global_professions ---');
const deletedRows = db.prepare(`SELECT id FROM deleted_global_professions WHERE id IN ('prof-fonoaudiologo', 'prof-psicopedagogo', 'prof-terapeuta-ocupacional', 'prof-psicanalista', 'prof-psicoterapeuta')`).all();
assert.equal(deletedRows.length, 0, 'Nenhuma das 5 profissões deve estar em deleted_global_professions');
console.log('  ✅ [PASS] deleted_global_professions limpa para as 5 profissões.');

console.log('\n================================================================');
console.log('🎉 TODOS OS TESTES DE VISIBILIDADE DE PROFISSÕES FORAM APROVADOS! 🚀');
console.log('================================================================');
