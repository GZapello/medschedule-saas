const assert = require('assert');
const { v4: uuidv4 } = require('uuid');
const { db } = require('./dist/config/database');
const { ClinicalRecordService } = require('./dist/services/clinical-record.service');
const { DentistryController } = require('./dist/controllers/dentistry.controller');

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
}

async function runTests() {
  console.log('========================================================');
  console.log('TEST SUITE: Vínculo Estrito de Próteses aos Pacientes');
  console.log('========================================================\n');

  const tenantId = 'tenant-test-prosthetics-' + Date.now();
  const userIdDentist = 'user-dentist-' + Date.now();
  const userIdOther = 'user-other-' + Date.now();
  const dentistProfId = 'prof-dentist-' + Date.now();
  const otherProfId = 'prof-other-' + Date.now();
  const serviceId = 'srv-' + Date.now();

  try {
    // 0. Setup tenant, usuários e profissionais
    db.prepare(`
      INSERT INTO tenants (id, slug, name, email, status, session_version, billing_required, trial_used, public_booking_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', 1, 0, 0, 0, datetime('now'), datetime('now'))
    `).run(tenantId, 'clinica-odonto-' + Date.now(), 'Clínica Odonto Teste', `odonto_${Date.now()}@teste.com`);

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, status, created_at)
      VALUES (?, ?, ?, 'hash', 'professional', 'active', datetime('now'))
    `).run(userIdDentist, 'Dr. Dentista Responsável', `dentist_${Date.now()}@teste.com`);

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, status, created_at)
      VALUES (?, ?, ?, 'hash', 'professional', 'active', datetime('now'))
    `).run(userIdOther, 'Dra. Sem Vínculo', `other_${Date.now()}@teste.com`);

    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, zemda_odonto_enabled, created_at)
      VALUES (?, ?, ?, 'professional', 'active', 1, datetime('now'))
    `).run(uuidv4(), tenantId, userIdDentist);

    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, zemda_odonto_enabled, created_at)
      VALUES (?, ?, ?, 'professional', 'active', 1, datetime('now'))
    `).run(uuidv4(), tenantId, userIdOther);

    db.prepare(`
      INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, active, zemda_odonto_enabled, created_at)
      VALUES (?, ?, ?, ?, 'prof-dentista', 1, 1, datetime('now'))
    `).run(dentistProfId, tenantId, userIdDentist, 'Dr. Dentista Responsável');

    db.prepare(`
      INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, active, zemda_odonto_enabled, created_at)
      VALUES (?, ?, ?, ?, 'prof-dentista', 1, 1, datetime('now'))
    `).run(otherProfId, tenantId, userIdOther, 'Dra. Sem Vínculo');

    db.prepare(`
      INSERT INTO services (
        id, tenant_id, name, duration_minutes, buffer_minutes, price, modality, active,
        min_lead_time_hours, max_advance_days, reminder_enabled, created_at, updated_at
      ) VALUES (
        ?, ?, 'Consulta Odontológica', 30, 0, 150.00, 'presential', 1, 0, 30, 0, datetime('now'), datetime('now')
      )
    `).run(serviceId, tenantId);

    // 1. Criar Pacientes A, B e C
    const patientAId = 'patient-a-' + Date.now();
    const patientBId = 'patient-b-' + Date.now();
    const patientCId = 'patient-c-' + Date.now();

    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, active, created_at)
      VALUES (?, ?, ?, 1, datetime('now'))
    `).run(patientAId, tenantId, 'Paciente A - Prótese Múltipla');

    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, active, created_at)
      VALUES (?, ?, ?, 1, datetime('now'))
    `).run(patientBId, tenantId, 'Paciente B - Prótese Única');

    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, active, created_at)
      VALUES (?, ?, ?, 1, datetime('now'))
    `).run(patientCId, tenantId, 'Paciente C - Sem Próteses');

    console.log('✓ Cenário de base configurado:');
    console.log(`  - Tenant: ${tenantId}`);
    console.log(`  - Paciente A: ${patientAId}`);
    console.log(`  - Paciente B: ${patientBId}`);
    console.log(`  - Paciente C: ${patientCId}`);

    // Vínculo assistencial de Dr. Dentista com Pacientes A, B e C via agendamento concluído
    let apptNum = 1;
    for (const patId of [patientAId, patientBId, patientCId]) {
      db.prepare(`
        INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, start_time, end_time, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, '2026-10-29T09:00:00', '2026-10-29T09:30:00', 'completed', datetime('now'))
      `).run(uuidv4(), tenantId, apptNum++, patId, dentistProfId, serviceId);
    }

    // 2. Criar Próteses para Paciente A (2 trabalhos)
    const workA1Id = 'work-a1-' + Date.now();
    const workA2Id = 'work-a2-' + Date.now();

    db.prepare(`
      INSERT INTO dental_prosthetics_lab (
        id, tenant_id, patient_id, professional_id, lab_name, work_type,
        tooth_number, shade_color, material, sent_date, expected_date, cost_value, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-10-01', '2026-10-15', 850.00, 'in_production', datetime('now'))
    `).run(workA1Id, tenantId, patientAId, dentistProfId, 'Lab Dental Elite', 'Coroa Zircônia', '11', 'A2', 'Zircônia');

    db.prepare(`
      INSERT INTO dental_prosthetics_lab (
        id, tenant_id, patient_id, professional_id, lab_name, work_type,
        tooth_number, shade_color, material, sent_date, expected_date, cost_value, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-10-05', '2026-10-20', 1200.00, 'delivered_to_clinic', datetime('now'))
    `).run(workA2Id, tenantId, patientAId, dentistProfId, 'Lab Dental Elite', 'Protocolo Superior', 'Maxila', 'BL2', 'Metalocerâmica');

    // Registrar no Prontuário Universal para Paciente A
    ClinicalRecordService.recordClinicalEvent({
      tenantId,
      patientId: patientAId,
      professionalId: dentistProfId,
      moduleType: 'ZemdaOdonto',
      sourceId: workA1Id,
      sourceType: 'dental_prosthetics_lab',
      title: 'Laboratório de Prótese: Coroa Zircônia',
      procedureName: 'Coroa Zircônia',
      clinicalEvolution: 'Confecção de coroa cerâmica',
      createdBy: 'Cirurgião-Dentista'
    });

    ClinicalRecordService.recordClinicalEvent({
      tenantId,
      patientId: patientAId,
      professionalId: dentistProfId,
      moduleType: 'ZemdaOdonto',
      sourceId: workA2Id,
      sourceType: 'dental_prosthetics_lab',
      title: 'Laboratório de Prótese: Protocolo Superior',
      procedureName: 'Protocolo Superior',
      clinicalEvolution: 'Confecção de protocolo superior',
      createdBy: 'Cirurgião-Dentista'
    });

    // 3. Criar Prótese para Paciente B (1 trabalho)
    const workB1Id = 'work-b1-' + Date.now();
    db.prepare(`
      INSERT INTO dental_prosthetics_lab (
        id, tenant_id, patient_id, professional_id, lab_name, work_type,
        tooth_number, shade_color, material, sent_date, expected_date, cost_value, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-10-10', '2026-10-25', 450.00, 'sent_to_lab', datetime('now'))
    `).run(workB1Id, tenantId, patientBId, dentistProfId, 'Lab Protetico Central', 'Inlay E-max', '26', 'A1', 'Dissilicato');

    ClinicalRecordService.recordClinicalEvent({
      tenantId,
      patientId: patientBId,
      professionalId: dentistProfId,
      moduleType: 'ZemdaOdonto',
      sourceId: workB1Id,
      sourceType: 'dental_prosthetics_lab',
      title: 'Laboratório de Prótese: Inlay E-max',
      procedureName: 'Inlay E-max',
      clinicalEvolution: 'Inlay bloco cerâmico',
      createdBy: 'Cirurgião-Dentista'
    });

    console.log('✓ Próteses e prontuários registrados:');
    console.log(`  - Paciente A: 2 trabalhos (IDs: ${workA1Id}, ${workA2Id})`);
    console.log(`  - Paciente B: 1 trabalho (ID: ${workB1Id})`);
    console.log(`  - Paciente C: 0 trabalhos`);

    // TESTE 1: Controller listProsthetics para Paciente A
    console.log('\n--- TESTE 1: Controller listProsthetics para Paciente A ---');
    const reqA = {
      tenantId,
      user: { userId: userIdDentist, role: 'professional', name: 'Dr. Dentista' },
      professionalId: dentistProfId,
      params: { patientId: patientAId },
      query: {}
    };
    const resA = createMockRes();
    DentistryController.listProsthetics(reqA, resA);

    assert.strictEqual(resA.statusCode, 200, 'Status HTTP deve ser 200');
    assert.ok(Array.isArray(resA.body), 'Resposta deve ser um array');
    assert.strictEqual(resA.body.length, 2, 'Paciente A deve ter exatamente 2 trabalhos');
    assert.strictEqual(resA.body.some(w => w.id === workB1Id), false, 'Paciente A NUNCA deve conter o trabalho do Paciente B');
    assert.strictEqual(resA.body.every(w => w.patient_id === patientAId), true, 'Todos os registros devem pertencer ao Paciente A');
    console.log('✓ Paciente A: 2 trabalhos retornados com sucesso via controller. Isolamento garantido.');

    // TESTE 2: Controller listProsthetics para Paciente B
    console.log('\n--- TESTE 2: Controller listProsthetics para Paciente B ---');
    const reqB = {
      tenantId,
      user: { userId: userIdDentist, role: 'professional', name: 'Dr. Dentista' },
      professionalId: dentistProfId,
      params: { patientId: patientBId },
      query: {}
    };
    const resB = createMockRes();
    DentistryController.listProsthetics(reqB, resB);

    assert.strictEqual(resB.statusCode, 200, 'Status HTTP deve ser 200');
    assert.strictEqual(resB.body.length, 1, 'Paciente B deve ter exatamente 1 trabalho');
    assert.strictEqual(resB.body[0].id, workB1Id, 'Trabalho do Paciente B deve ser workB1');
    assert.strictEqual(resB.body.some(w => w.id === workA1Id || w.id === workA2Id), false, 'Paciente B NUNCA deve conter trabalhos do Paciente A');
    console.log('✓ Paciente B: 1 trabalho retornado com sucesso via controller. Isolamento garantido.');

    // TESTE 3: Controller listProsthetics para Paciente C
    console.log('\n--- TESTE 3: Controller listProsthetics para Paciente C ---');
    const reqC = {
      tenantId,
      user: { userId: userIdDentist, role: 'professional', name: 'Dr. Dentista' },
      professionalId: dentistProfId,
      params: { patientId: patientCId },
      query: {}
    };
    const resC = createMockRes();
    DentistryController.listProsthetics(reqC, resC);

    assert.strictEqual(resC.statusCode, 200, 'Status HTTP deve ser 200');
    assert.strictEqual(resC.body.length, 0, 'Paciente C deve retornar array vazio');
    console.log('✓ Paciente C: 0 trabalhos retornados via controller. Estado vazio garantido.');

    // TESTE 4: Tentativa de transferir patient_id no updateProsthetic
    console.log('\n--- TESTE 4: Tentativa de transferir patient_id no updateProsthetic ---');
    const reqUpdate = {
      tenantId,
      user: { userId: userIdDentist, role: 'professional', name: 'Dr. Dentista' },
      professionalId: dentistProfId,
      params: { id: workA1Id },
      body: {
        patientId: patientBId, // TENTATIVA DE TRANSFERÊNCIA DE PACIENTE
        status: 'delivered_to_clinic'
      }
    };
    const resUpdate = createMockRes();
    DentistryController.updateProsthetic(reqUpdate, resUpdate);

    assert.strictEqual(resUpdate.statusCode, 400, 'Tentativa de trocar patientId deve retornar HTTP 400');
    assert.ok(resUpdate.body.error.includes('Não é permitido alterar o paciente vinculado a um trabalho protético existente'));
    console.log(`✓ Bloqueio de segurança acionado: "${resUpdate.body.error}"`);

    // Verificar se no banco de dados o patient_id se manteve intacto
    const checkDb = db.prepare('SELECT patient_id FROM dental_prosthetics_lab WHERE id = ?').get(workA1Id);
    assert.strictEqual(checkDb.patient_id, patientAId, 'patient_id no banco deve permanecer imutável');
    console.log('✓ Imutabilidade do vínculo confirmada no banco de dados.');

    // TESTE 5: Profissional sem vínculo assistencial (LGPD / Sigilo Clínico)
    console.log('\n--- TESTE 5: Tentativa de acesso por usuário sem autorização assistencial ---');
    const otherTenantId = 'tenant-other-' + Date.now();
    db.prepare(`
      INSERT INTO tenants (id, slug, name, email, status, session_version, billing_required, trial_used, public_booking_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', 1, 0, 0, 0, datetime('now'), datetime('now'))
    `).run(otherTenantId, 'clinica-outra-' + Date.now(), 'Outra Clínica', `outra_${Date.now()}@teste.com`);

    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, zemda_odonto_enabled, created_at)
      VALUES (?, ?, ?, 'professional', 'active', 1, datetime('now'))
    `).run(uuidv4(), otherTenantId, userIdOther);

    db.prepare(`
      INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, active, zemda_odonto_enabled, created_at)
      VALUES (?, ?, ?, ?, 'prof-dentista', 1, 1, datetime('now'))
    `).run('prof-outra-' + Date.now(), otherTenantId, userIdOther, 'Dra. Outra Clínica');

    const reqNoAccess = {
      tenantId: otherTenantId,
      user: { userId: userIdOther, role: 'professional', name: 'Dra. Outra Clínica' },
      professionalId: otherProfId,
      params: { patientId: patientAId },
      query: {}
    };
    const resNoAccess = createMockRes();
    DentistryController.listProsthetics(reqNoAccess, resNoAccess);

    assert.strictEqual(resNoAccess.statusCode, 403, 'Profissional sem vínculo deve receber 403');
    assert.strictEqual(resNoAccess.body.code, 'CLINICAL_PRIVACY_RESTRICTION');
    console.log(`✓ Sigilo clínico validado: 403 CLINICAL_PRIVACY_RESTRICTION acionado.`);

    db.prepare('DELETE FROM professionals WHERE tenant_id = ?').run(otherTenantId);
    db.prepare('DELETE FROM clinic_users WHERE tenant_id = ?').run(otherTenantId);
    db.prepare('DELETE FROM tenants WHERE id = ?').run(otherTenantId);

    // TESTE 6: Controller listPendingProsthetics filtrando por patientId
    console.log('\n--- TESTE 6: listPendingProsthetics com patientId ---');
    const reqPendingA = {
      tenantId,
      user: { userId: userIdDentist, role: 'professional', name: 'Dr. Dentista' },
      professionalId: dentistProfId,
      query: { patientId: patientAId, all: 'true' }
    };
    const resPendingA = createMockRes();
    DentistryController.listPendingProsthetics(reqPendingA, resPendingA);

    assert.strictEqual(resPendingA.statusCode, 200);
    assert.strictEqual(resPendingA.body.length, 2, 'Deve retornar apenas as 2 próteses do paciente A');
    assert.strictEqual(resPendingA.body.every(p => p.patient_id === patientAId), true);
    console.log('✓ listPendingProsthetics filtra com rigor por patientId quando fornecido.');

    // TESTE 7: Prontuário Universal Longitudinal
    console.log('\n--- TESTE 7: Prontuário Universal e Histórico Clínico ---');
    const recordsA = db.prepare(`
      SELECT * FROM records WHERE tenant_id = ? AND patient_id = ? AND source_type = 'dental_prosthetics_lab'
    `).all(tenantId, patientAId);

    const recordsB = db.prepare(`
      SELECT * FROM records WHERE tenant_id = ? AND patient_id = ? AND source_type = 'dental_prosthetics_lab'
    `).all(tenantId, patientBId);

    const recordsC = db.prepare(`
      SELECT * FROM records WHERE tenant_id = ? AND patient_id = ? AND source_type = 'dental_prosthetics_lab'
    `).all(tenantId, patientCId);

    assert.strictEqual(recordsA.length, 2, 'Prontuário do Paciente A deve ter exatamente 2 registros');
    assert.strictEqual(recordsB.length, 1, 'Prontuário do Paciente B deve ter exatamente 1 registro');
    assert.strictEqual(recordsC.length, 0, 'Prontuário do Paciente C deve ter 0 registros');
    assert.strictEqual(recordsA.some(r => r.source_id === workB1Id), false, 'Prontuário do Paciente A não deve conter trabalhos do Paciente B');
    assert.strictEqual(recordsB.some(r => r.source_id === workA1Id || r.source_id === workA2Id), false, 'Prontuário do Paciente B não deve conter trabalhos do Paciente A');
    console.log('✓ Prontuário universal isolado perfeitamente entre os pacientes.');

    console.log('\n========================================================');
    console.log('TODOS OS TESTES DE ISOLAMENTO PASSARAM COM SUCESSO (100%)');
    console.log('========================================================');
  } finally {
    // Limpeza dos dados de teste
    db.prepare('DELETE FROM records WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM dental_prosthetics_lab WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM appointments WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM services WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM patients WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM professionals WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM clinic_users WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(userIdDentist, userIdOther);
    db.prepare('DELETE FROM tenants WHERE id = ?').run(tenantId);
    console.log('\nLimpeza do banco de teste concluída.');
  }
}

runTests().catch(err => {
  console.error('FALHA NO TESTE:', err);
  process.exit(1);
});
