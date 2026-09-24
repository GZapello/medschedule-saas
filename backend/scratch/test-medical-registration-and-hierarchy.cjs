const path = require('path');
process.env.DATABASE_PATH = path.resolve(__dirname, '../saas_schedule.db');

const { db, initializeDatabase } = require('../dist/config/database.js');
const { MedicalTreeService } = require('../dist/services/medical-tree.service.js');
const { CapabilityService } = require('../dist/services/capability.service.js');
const { resolveCanonicalProfession } = require('../dist/utils/profession-module.js');

initializeDatabase();

console.log('=== TEST: REGISTRATION & HIERARCHY SIMULATION ===');

// 1. Obter usuário e clínica existentes no banco para o teste
const cu = db.prepare('SELECT user_id, tenant_id FROM clinic_users LIMIT 1').get();
if (!cu) {
  console.log('Nenhum clinic_user no banco para teste.');
  process.exit(0);
}
const testUserId = cu.user_id;
const testTenantId = cu.tenant_id;

// Cleanup prévio
db.prepare('DELETE FROM user_medical_specialties WHERE user_id = ?').run(testUserId);
db.prepare('DELETE FROM user_medical_practice_areas WHERE user_id = ?').run(testUserId);

// Grava hierarquia médica: Cardiologia + Clínica Médica e subáreas de arritmia e hipertensão
const chosenSpecs = ['med-spec-cardio', 'med-spec-clinica'];
const chosenPas = ['med-pa-car-arritmias', 'med-pa-car-hipertensao'];

MedicalTreeService.setUserMedicalHierarchy(testUserId, testTenantId, chosenSpecs, chosenPas);

const savedHierarchy = MedicalTreeService.getUserMedicalHierarchy(testUserId, testTenantId);
console.log('Saved Specialty IDs:', savedHierarchy.specialtyIds);
console.log('Saved Practice Area IDs:', savedHierarchy.practiceAreaIds);

if (savedHierarchy.specialtyIds.length !== 2 || !savedHierarchy.specialtyIds.includes('med-spec-cardio') || !savedHierarchy.specialtyIds.includes('med-spec-clinica')) {
  throw new Error('Falha ao gravar especialidades médicas múltiplas');
}
if (savedHierarchy.practiceAreaIds.length !== 2 || !savedHierarchy.practiceAreaIds.includes('med-pa-car-arritmias')) {
  throw new Error('Falha ao gravar subáreas médicas');
}
console.log('✓ Multi-specialty hierarchy correctly stored in DB.');

// 2. Simular atualização via PUT /v1/capabilities/my-medical-hierarchy
const newSpecs = ['med-spec-neuro', 'med-spec-psiquiatria'];
const newPas = ['med-pa-neuro-avc', 'med-pa-psic-infancia'];
MedicalTreeService.setUserMedicalHierarchy(testUserId, testTenantId, newSpecs, newPas);

const updatedHierarchy = MedicalTreeService.getUserMedicalHierarchy(testUserId, testTenantId);
console.log('Updated Specialty IDs:', updatedHierarchy.specialtyIds);
console.log('Updated Practice Area IDs:', updatedHierarchy.practiceAreaIds);

if (updatedHierarchy.specialtyIds.length !== 2 || !updatedHierarchy.specialtyIds.includes('med-spec-neuro')) {
  throw new Error('Falha ao atualizar hierarquia médica');
}
console.log('✓ Hierarchy update (PUT simulation) succeeded.');

// Cleanup
db.prepare('DELETE FROM user_medical_specialties WHERE user_id = ?').run(testUserId);
db.prepare('DELETE FROM user_medical_practice_areas WHERE user_id = ?').run(testUserId);

console.log('ALL REGISTRATION & HIERARCHY TESTS PASSED WITH 100% SUCCESS!');
