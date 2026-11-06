/**
 * Test Suite: Medical Record Import Execution & Timeline Integration
 * Validates that /v1/import/medical-record/execute creates 4 distinct evolutions,
 * returns the patientId, links to existing patients without duplication,
 * and ensures that the timeline retrieves all 4 records immediately.
 */

const assert = require('assert');

process.env.DATABASE_URL = ':memory:';
process.env.JWT_SECRET = 'test-secret-audit-1234567890';
process.env.NODE_ENV = 'test';

const { db } = require('./dist/config/database');
const { ImportController } = require('./dist/controllers/import.controller');
const { PatientClinicalController } = require('./dist/controllers/patient-clinical.controller');

async function runTests() {
  console.log('=== TESTE DE IMPORTAÇÃO DE PRONTUÁRIO & NAVEGAÇÃO ===\n');

  const tenantId = 't_import_test_01';
  const userId = 'u_doctor_import_01';

  db.prepare(`
    INSERT OR REPLACE INTO tenants (id, slug, name, trade_name, email, phone)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(tenantId, 'clinica-import-test', 'Clínica Importadora', 'Zemda Medical', 'import@zemda.com.br', '11988887777');

  db.prepare(`
    INSERT OR REPLACE INTO users (id, tenant_id, name, email, role, password_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, tenantId, 'Dr. Roberto Clínico', 'roberto@zemda.com.br', 'clinic_admin', 'hash');

  db.prepare(`
    INSERT OR REPLACE INTO professionals (id, tenant_id, user_id, name, registration_type, registration_number)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('prof_imp_01', tenantId, userId, 'Dr. Roberto Clínico', 'CRM', '654321');

  // Caso 1: Importar novo paciente com 4 evoluções em datas distintas
  let resStatus = 200;
  let resJson = null;
  const mockRes = {
    status: (s) => { resStatus = s; return mockRes; },
    json: (j) => { resJson = j; return mockRes; }
  };

  const evolutionsToImport = [
    { date: '2026-01-10', time: '09:00', title: 'Primeira Consulta', notes: 'Paciente com sintomas gripais leves e febre baixa.' },
    { date: '2026-02-15', time: '14:30', title: 'Retorno Clínico', notes: 'Sintomas remitidos. Solicitação de exames de rotina.' },
    { date: '2026-03-20', time: '10:15', title: 'Avaliação de Exames', notes: 'Hemograma e colesterol dentro da normalidade.' },
    { date: '2026-04-25', time: '16:00', title: 'Consulta Trimestral', notes: 'Paciente assintomático. Alta do acompanhamento agudo.' }
  ];

  const mockReqNew = {
    tenantId,
    user: { userId, role: 'clinic_admin' },
    body: {
      action: 'create_new',
      patient: {
        full_name: 'Ana Maria Braga de Oliveira',
        cpf: '98765432100',
        birth_date: '1975-08-20',
        phone: '11977776666'
      },
      evolutions: evolutionsToImport
    }
  };

  ImportController.executeMedicalRecord(mockReqNew, mockRes);
  assert.strictEqual(resStatus, 200, 'Importação deve retornar status 200');
  assert.strictEqual(resJson.success, true);
  assert.ok(resJson.patientId, 'Deve retornar o patientId criado');
  assert.strictEqual(resJson.recordsCreated, 4, 'Devem ser criados exatamente 4 registros de prontuário');
  assert.strictEqual(resJson.isNewPatient, true, 'Deve identificar como novo paciente');

  const createdPatientId = resJson.patientId;
  console.log(`PASS [1] Novo paciente importado com 4 evoluções: ID ${createdPatientId}`);

  // Verificar na linha do tempo se os 4 registros existem e foram salvos nas datas corretas
  const recordsInDb = db.prepare(`
    SELECT id, session_date, session_time, title, clinical_evolution
    FROM records
    WHERE patient_id = ? AND tenant_id = ?
    ORDER BY session_date ASC
  `).all(createdPatientId, tenantId);

  assert.strictEqual(recordsInDb.length, 4, 'Banco de dados deve conter os 4 registros na linha do tempo');
  assert.strictEqual(recordsInDb[0].session_date, '2026-01-10');
  assert.strictEqual(recordsInDb[1].session_date, '2026-02-15');
  assert.strictEqual(recordsInDb[2].session_date, '2026-03-20');
  assert.strictEqual(recordsInDb[3].session_date, '2026-04-25');
  console.log('PASS [2] Linha do tempo contém as 4 evoluções ordenadas com datas exatas');

  // Caso 2: Importar novas evoluções vinculadas a paciente existente
  const mockReqExisting = {
    tenantId,
    user: { userId, role: 'clinic_admin' },
    body: {
      action: 'link_existing',
      existingPatientId: createdPatientId,
      patient: {
        full_name: 'Ana Maria Braga de Oliveira'
      },
      evolutions: [
        { date: '2026-05-30', time: '11:00', title: 'Consulta Extra', notes: 'Queixa de dor lombar postural.' }
      ]
    }
  };

  resStatus = 200;
  resJson = null;
  ImportController.executeMedicalRecord(mockReqExisting, mockRes);
  assert.strictEqual(resStatus, 200);
  assert.strictEqual(resJson.patientId, createdPatientId, 'Deve manter o ID do paciente existente');
  assert.strictEqual(resJson.isNewPatient, false, 'Deve identificar como paciente existente');
  assert.strictEqual(resJson.recordsCreated, 1);

  const updatedRecords = db.prepare(`
    SELECT count(*) as total FROM records WHERE patient_id = ? AND tenant_id = ?
  `).get(createdPatientId, tenantId);
  assert.strictEqual(updatedRecords.total, 5, 'Total de registros deve ser 5 (4 anteriores + 1 nova)');
  console.log('PASS [3] Paciente existente atualizado com sucesso e ID preservado');

  console.log('\n============================================================');
  console.log('🎯 TODOS OS TESTES DO FLUXO DE IMPORTAÇÃO PASSARAM COM SUCESSO (3/3)');
  console.log('============================================================\n');
}

runTests().catch(err => {
  console.error('❌ Falha nos testes de importação:', err);
  process.exit(1);
});
