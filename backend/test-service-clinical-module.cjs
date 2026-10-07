const assert = require('assert');
const { db } = require('./dist/config/database');
const { getAvailableModulesForProfessional, resolveClinicalModule, isPrimaryClinicalModule } = require('./dist/utils/clinical-module');
const { v4: uuidv4 } = require('uuid');

console.log('=== TESTE DE VÍNCULO DE SERVIÇO COM MÓDULO CLÍNICO & VALIDAÇÃO ===\n');

const testTenantId = 'tenant-srv-test-' + Date.now();

// 1. Criar tenant para teste
db.prepare(`
  INSERT INTO tenants (id, name, slug, email, status, onboarding_completed)
  VALUES (?, 'Clínica Multi Módulos', ?, 'teste@clinicateste.com', 'active', 1)
`).run(testTenantId, 'clinica-test-' + Date.now());

// 2. Criar profissionais de teste:
// - Dentista Geral (apenas ZemdaOdonto)
const dentistGeralId = 'prof-dg-' + uuidv4().slice(0, 8);
db.prepare(`
  INSERT INTO professionals (id, tenant_id, name, profession_id, profession_name, active, zemda_odonto_enabled, zemda_estetic_enabled)
  VALUES (?, ?, 'Dr. Carlos Dentista Geral', 'prof-dentista', 'Cirurgião-Dentista', 1, 1, 0)
`).run(dentistGeralId, testTenantId);

// - Dentista HOF (ZemdaOdonto + ZemdaEstetic)
const dentistHofId = 'prof-dh-' + uuidv4().slice(0, 8);
db.prepare(`
  INSERT INTO professionals (id, tenant_id, name, profession_id, profession_name, active, zemda_odonto_enabled, zemda_estetic_enabled, specialty_custom)
  VALUES (?, ?, 'Dra. Julia Dentista HOF', 'prof-dentista', 'Cirurgião-Dentista', 1, 1, 1, 'Harmonização Orofacial')
`).run(dentistHofId, testTenantId);

// - Fisioterapeuta (apenas ZemdaFisio)
const fisioId = 'prof-fis-' + uuidv4().slice(0, 8);
db.prepare(`
  INSERT INTO professionals (id, tenant_id, name, profession_id, profession_name, active, zemda_fisio_enabled)
  VALUES (?, ?, 'Dr. Renato Fisioterapeuta', 'prof-fisioterapeuta', 'Fisioterapeuta', 1, 1)
`).run(fisioId, testTenantId);

// TESTE 1: Módulos disponíveis por profissional
const modulesDG = getAvailableModulesForProfessional(dentistGeralId, testTenantId);
console.log('Módulos Dentista Geral:', modulesDG);
assert.strictEqual(modulesDG.length, 1);
assert.strictEqual(modulesDG[0].code, 'ZemdaOdonto');
console.log('  [PASS] Dentista Geral possui apenas ZemdaOdonto');

const modulesDH = getAvailableModulesForProfessional(dentistHofId, testTenantId);
console.log('Módulos Dentista HOF:', modulesDH);
assert.strictEqual(modulesDH.length, 2);
const codesDH = modulesDH.map(m => m.code);
assert(codesDH.includes('ZemdaOdonto'));
assert(codesDH.includes('ZemdaEstetic'));
console.log('  [PASS] Dentista HOF possui ZemdaOdonto e ZemdaEstetic');

const modulesFisio = getAvailableModulesForProfessional(fisioId, testTenantId);
console.log('Módulos Fisioterapeuta:', modulesFisio);
assert.strictEqual(modulesFisio.length, 1);
assert.strictEqual(modulesFisio[0].code, 'ZemdaFisio');
console.log('  [PASS] Fisioterapeuta possui apenas ZemdaFisio');

// TESTE 2: Cadastro de Serviços com vínculo de módulo
// Serviço 1: Limpeza Dental (Dentista HOF -> ZemdaOdonto)
const srvLimpezaId = 'srv-limp-' + uuidv4().slice(0, 8);
db.prepare(`
  INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, price, clinical_module, active)
  VALUES (?, ?, ?, 'Limpeza Dental', 45, 200, 'ZemdaOdonto', 1)
`).run(srvLimpezaId, testTenantId, dentistHofId);

// Serviço 2: Toxina Botulínica Facial (Mesmo Dentista HOF -> ZemdaEstetic)
const srvToxinaId = 'srv-tox-' + uuidv4().slice(0, 8);
db.prepare(`
  INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, price, clinical_module, active)
  VALUES (?, ?, ?, 'Toxina Botulínica Facial', 60, 1200, 'ZemdaEstetic', 1)
`).run(srvToxinaId, testTenantId, dentistHofId);

// Serviço 3: Serviço Legado sem clinical_module (Dentista Geral -> NULL)
const srvLegadoId = 'srv-leg-' + uuidv4().slice(0, 8);
db.prepare(`
  INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, price, clinical_module, active)
  VALUES (?, ?, ?, 'Restauração Legada', 30, 150, NULL, 1)
`).run(srvLegadoId, testTenantId, dentistGeralId);

// Criar paciente para agendamentos
const patId = 'pat-' + uuidv4().slice(0, 8);
db.prepare(`
  INSERT INTO patients (id, tenant_id, full_name, phone, active)
  VALUES (?, ?, 'Paciente de Teste', '11999999999', 1)
`).run(patId, testTenantId);

// TESTE 3: Resolução do agendamento para Serviço Estético de Dentista HOF -> ZemdaEstetic
const apptEsteticId = 'apt-est-' + uuidv4().slice(0, 8);
db.prepare(`
  INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, start_time, end_time, status)
  VALUES (?, ?, 'AG-2026-001', ?, ?, ?, '2026-10-07T14:00:00', '2026-10-07T15:00:00', 'scheduled')
`).run(apptEsteticId, testTenantId, patId, dentistHofId, srvToxinaId);

const resolvedEstetic = resolveClinicalModule({ id: apptEsteticId, service_id: srvToxinaId, professional_id: dentistHofId }, testTenantId);
console.log('Resolução Dentista HOF + Serviço Estético:', resolvedEstetic);
assert.strictEqual(resolvedEstetic, 'ZemdaEstetic', 'Deve resolver para ZemdaEstetic');
console.log('  [PASS] Dentista com serviço estético resolve prioritariamente para ZemdaEstetic');

// TESTE 4: Resolução do agendamento para Serviço Odontológico de Dentista HOF -> ZemdaOdonto
const apptOdontoId = 'apt-odo-' + uuidv4().slice(0, 8);
db.prepare(`
  INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, start_time, end_time, status)
  VALUES (?, ?, 'AG-2026-002', ?, ?, ?, '2026-10-07T15:00:00', '2026-10-07T15:45:00', 'scheduled')
`).run(apptOdontoId, testTenantId, patId, dentistHofId, srvLimpezaId);

const resolvedOdonto = resolveClinicalModule({ id: apptOdontoId, service_id: srvLimpezaId, professional_id: dentistHofId }, testTenantId);
console.log('Resolução Dentista HOF + Limpeza Dental:', resolvedOdonto);
assert.strictEqual(resolvedOdonto, 'ZemdaOdonto', 'Deve resolver para ZemdaOdonto');
console.log('  [PASS] Dentista com serviço odontológico resolve para ZemdaOdonto');

// TESTE 5: Fallback para serviço legado sem vínculo explícito de módulo
const apptLegadoId = 'apt-leg-' + uuidv4().slice(0, 8);
db.prepare(`
  INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, start_time, end_time, status)
  VALUES (?, ?, 'AG-2026-003', ?, ?, ?, '2026-10-07T16:00:00', '2026-10-07T16:30:00', 'scheduled')
`).run(apptLegadoId, testTenantId, patId, dentistGeralId, srvLegadoId);

const resolvedLegado = resolveClinicalModule({ id: apptLegadoId, service_id: srvLegadoId, professional_id: dentistGeralId }, testTenantId);
console.log('Resolução Serviço Legado:', resolvedLegado);
assert.strictEqual(resolvedLegado, 'ZemdaOdonto', 'Deve cair no fallback canônico do profissional');
console.log('  [PASS] Serviço legado mantém fallback seguro para a profissão (ZemdaOdonto)');

// Limpar dados de teste
db.prepare('DELETE FROM appointments WHERE tenant_id = ?').run(testTenantId);
db.prepare('DELETE FROM services WHERE tenant_id = ?').run(testTenantId);
db.prepare('DELETE FROM patients WHERE tenant_id = ?').run(testTenantId);
db.prepare('DELETE FROM professionals WHERE tenant_id = ?').run(testTenantId);
db.prepare('DELETE FROM tenants WHERE id = ?').run(testTenantId);

console.log('\n==================================================');
console.log('TODOS OS TESTES DE SERVIÇO E MÓDULO PASSARAM!');
console.log('==================================================');
