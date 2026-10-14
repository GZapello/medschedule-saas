const path = require('path');
process.env.DATABASE_PATH = path.resolve(__dirname, '../saas_schedule.db');

const { db, initializeDatabase } = require('../dist/config/database.js');
const { resolveCanonicalProfession } = require('../dist/utils/profession-module.js');
const { MedicalTreeService } = require('../dist/services/medical-tree.service.js');
const { CapabilityService } = require('../dist/services/capability.service.js');

initializeDatabase();

console.log('=== TEST 1: MEDICAL TREE API & TAXONOMY ===');
const tree = MedicalTreeService.getMedicalTree();
if (tree.specialties.length !== 15) {
  throw new Error(`Expected 15 specialties, found ${tree.specialties.length}`);
}
console.log(`✓ MedicalTreeService returned ${tree.specialties.length} specialties.`);

const neuroSpec = tree.specialties.find(s => s.id === 'med-spec-neuro');
if (!neuroSpec || neuroSpec.practiceAreas.length === 0) {
  throw new Error('Neurology specialty or practice areas not found');
}
console.log(`✓ Neurologia has ${neuroSpec.practiceAreas.length} practice areas:`, neuroSpec.practiceAreas.map(p => p.name));
console.log(`✓ Neurologia default capabilities:`, neuroSpec.defaultCapabilities);

console.log('\n=== TEST 2: RESOLUTION OF MEDICAL ALIASES ===');
const aliasesToTest = [
  { id: 'prof-neurologista', expectedSpec: 'med-spec-neuro', name: 'Neurologista' },
  { id: 'prof-cardiologista', expectedSpec: 'med-spec-cardio', name: 'Cardiologista' },
  { id: 'prof-psiquiatra', expectedSpec: 'med-spec-psiquiatria', name: 'Psiquiatra' },
  { id: 'prof-pediatra', expectedSpec: 'med-spec-pediatria', name: 'Pediatra' },
  { id: 'prof-geriatra', expectedSpec: 'med-spec-geriatria', name: 'Geriatra' },
  { id: 'prof-endocrinologista', expectedSpec: 'med-spec-endocrino', name: 'Endocrinologista' },
  { id: 'prof-ortopedista', expectedSpec: 'med-spec-ortopedia', name: 'Ortopedista' },
  { id: 'prof-reumatologista', expectedSpec: 'med-spec-reumato', name: 'Reumatologista' },
  { id: 'prof-ginecologista', expectedSpec: 'med-spec-gineco', name: 'Ginecologista' },
  { id: 'prof-gastroenterologista', expectedSpec: 'med-spec-gastro', name: 'Gastroenterologista' },
  { id: 'prof-oftalmologista', expectedSpec: 'med-spec-oftalmo', name: 'Oftalmologista' },
  { id: 'prof-otorrinolaringologista', expectedSpec: 'med-spec-otorrino', name: 'Otorrinolaringologista' },
  { id: 'prof-urologista', expectedSpec: 'med-spec-urologia', name: 'Urologista' },
  { id: 'prof-clinico-geral', expectedSpec: 'med-spec-clinica', name: 'Clínico Geral' },
  { id: 'prof-medico', expectedSpec: undefined, name: 'Médico (Genérico)' }
];

for (const alias of aliasesToTest) {
  const res = resolveCanonicalProfession(alias.id);
  if (res.canonicalId !== 'prof-medico') {
    throw new Error(`Alias ${alias.id} failed canonicalId check. Got: ${res.canonicalId}`);
  }
  if (res.commercialModule !== 'ZemdaMed') {
    throw new Error(`Alias ${alias.id} failed commercialModule check. Got: ${res.commercialModule}`);
  }
  if (alias.expectedSpec) {
    if (res.medicalSpecialtyId !== alias.expectedSpec) {
      throw new Error(`Alias ${alias.id} expected specialty ${alias.expectedSpec}, got: ${res.medicalSpecialtyId}`);
    }
    if (!res.isSpecificAlias) {
      throw new Error(`Alias ${alias.id} should be specific alias`);
    }
  } else {
    if (res.isSpecificAlias) {
      throw new Error(`Generic ${alias.id} should NOT be specific alias`);
    }
    if (res.medicalSpecialtyId !== undefined) {
      throw new Error(`Generic ${alias.id} should have undefined medicalSpecialtyId`);
    }
  }
  console.log(`✓ ${alias.name} -> canonical: ${res.canonicalId}, module: ${res.commercialModule}, spec: ${res.medicalSpecialtyId || 'None (Generic)'}`);
}

console.log('\n=== TEST 3: PRACTICE AREAS SELECTION PER ALIAS ===');
// Neurologist selection returns its practice areas
const neuroAreas = CapabilityService.getPracticeAreas('prof-neurologista');
if (neuroAreas.length === 0 || !neuroAreas.some(a => a.name.includes('AVC'))) {
  throw new Error('Expected Neurologist to return Neurologia practice areas (AVC, etc.)');
}
console.log(`✓ getPracticeAreas('prof-neurologista') returned ${neuroAreas.length} neurology subareas.`);

// Generic doctor returns all 15 specialties as choices
const genericMedAreas = CapabilityService.getPracticeAreas('prof-medico');
if (genericMedAreas.length !== 15) {
  throw new Error(`Expected generic doctor to receive 15 specialties, received ${genericMedAreas.length}`);
}
console.log(`✓ getPracticeAreas('prof-medico') returned 15 medical specialties for selection.`);

console.log('\n=== TEST 4: STRICT ISOLATION WITH SHARED CAPABILITIES ===');
// Neurologia has MOBILITY_ASSESSMENT, POSTURE_GAIT, COMMUNICATION_ASSESSMENT
const neuroCapsCalc = CapabilityService.calculateCapabilities({
  professionId: 'prof-medico',
  commercialModule: 'ZemdaMed',
  practiceAreaIds: [],
  medicalSpecialtyIds: ['med-spec-neuro'],
  medicalPracticeAreaIds: ['med-pa-neuro-avc', 'med-pa-neuro-epilepsia']
});

console.log('Active capabilities in Neurologia:', neuroCapsCalc.activeCapabilities);
if (!neuroCapsCalc.activeCapabilities.includes('MOBILITY_ASSESSMENT')) {
  throw new Error('Neurology should have MOBILITY_ASSESSMENT capability');
}
if (!neuroCapsCalc.activeCapabilities.includes('MEDICAL_NEURO')) {
  throw new Error('Neurology should have MEDICAL_NEURO capability');
}

// Check resolution flags for Neurologista
const neuroRes = resolveCanonicalProfession('prof-neurologista');
if (neuroRes.flags.zemda_fisio_enabled !== 0) {
  throw new Error('Neurologist must have zemda_fisio_enabled = 0');
}
if (neuroRes.flags.zemda_fono_enabled !== 0) {
  throw new Error('Neurologist must have zemda_fono_enabled = 0');
}
if (neuroRes.flags.zemda_to_enabled !== 0) {
  throw new Error('Neurologist must have zemda_to_enabled = 0');
}
if (neuroRes.flags.zemda_psico_enabled !== 0) {
  throw new Error('Neurologist must have zemda_psico_enabled = 0');
}
if (neuroRes.flags.zemda_med_enabled !== 1) {
  throw new Error('Neurologist must have zemda_med_enabled = 1');
}
console.log('✓ Commercial flags verified: only zemda_med_enabled = 1. Shared capabilities DO NOT unlock ZemdaFisio!');

console.log('\n=== TEST 5: MULTI-SPECIALTY DOCTOR ===');
const multiCaps = CapabilityService.calculateCapabilities({
  professionId: 'prof-medico',
  commercialModule: 'ZemdaMed',
  practiceAreaIds: [],
  medicalSpecialtyIds: ['med-spec-neuro', 'med-spec-psiquiatria'],
  medicalPracticeAreaIds: ['med-pa-neuro-avc', 'med-pa-psic-humor']
});

if (!multiCaps.activeCapabilities.includes('MEDICAL_NEURO') || !multiCaps.activeCapabilities.includes('BEHAVIOR_ASSESSMENT')) {
  throw new Error('Multi-specialty doctor must have capabilities of both Neurologia and Psiquiatria');
}
console.log('✓ Multi-specialty doctor successfully inherits union of capabilities from Neurologia and Psiquiatria.');

console.log('\nALL ISOLATION & MEDICAL TREE TESTS PASSED WITH 100% SUCCESS!');
