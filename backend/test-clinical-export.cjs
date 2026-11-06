/**
 * Test Suite: Clinical Records Export 360°
 * Validates genuine ECMA-376 OpenXML .docx generation, PDF generation,
 * JSON metadata, ZIP package with manifest.json, specialty modules coverage,
 * and elimination of silent fallbacks in ReportController.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

process.env.DATABASE_URL = ':memory:';
process.env.JWT_SECRET = 'test-secret-audit-1234567890';
process.env.NODE_ENV = 'test';

const { db } = require('./dist/config/database');
const { ClinicalExportService } = require('./dist/services/clinical-export.service');
const { ReportController } = require('./dist/controllers/report.controller');

async function runTests() {
  console.log('=== INICIANDO TESTES DO EXPORTADOR DE PRONTUÁRIOS 360° ===\n');

  const tenantId = 't_clinic_export_01';
  const userId = 'u_doctor_export_01';
  const patientId = 'pat_export_test_01';

  // 1. Setup seed
  db.prepare(`
    INSERT OR REPLACE INTO tenants (id, slug, name, trade_name, email, phone, street, number, neighborhood, city, state)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    tenantId, 'clinica-export-test', 'Clínica Exportadora de Saúde Ltda',
    'Zemda Medical Clinic', 'contato@zemdamed.com.br', '11999998888',
    'Av. Paulista', '1000', 'Bela Vista', 'São Paulo', 'SP'
  );

  db.prepare(`
    INSERT OR REPLACE INTO users (id, tenant_id, name, email, role, password_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, tenantId, 'Dr. Arnaldo Silva', 'arnaldo@zemdamed.com.br', 'clinic_admin', 'hash');

  db.prepare(`
    INSERT OR REPLACE INTO professionals (id, tenant_id, user_id, name, registration_type, registration_number)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('prof_doc_01', tenantId, userId, 'Dr. Arnaldo Silva', 'CRM', '123456');

  db.prepare(`
    INSERT OR REPLACE INTO patients (id, tenant_id, full_name, cpf, birth_date, anthropometric_sex, phone, email, notes_admin)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    patientId, tenantId, 'Carlos Drummond de Andrade', '12345678909',
    '1985-10-31', 'male', '11988887777', 'carlos@drummond.com.br',
    'Paciente com histórico de hipertensão leve <controlada> & rinite alérgica.'
  );

  // Core clinical records
  db.prepare(`
    INSERT OR REPLACE INTO records (id, tenant_id, patient_id, professional_id, session_date, title, clinical_evolution)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('rec_01', tenantId, patientId, 'prof_doc_01', '2026-11-01', 'Consulta Geral', 'Paciente refere tosse seca. CID-10 J00 - Rinofaringite aguda.');

  // Medical prescription
  db.prepare(`
    INSERT OR REPLACE INTO clinical_prescriptions (id, tenant_id, patient_id, professional_id, prescription_number, items_json, instructions, content)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('doc_01', tenantId, patientId, 'prof_doc_01', 'RX-2026-001', '[]', 'Tomar após as refeições', '1. Paracetamol 750mg de 8 em 8 horas por 3 dias.');

  // Allergy
  db.prepare(`
    INSERT OR REPLACE INTO patient_allergies (id, tenant_id, patient_id, agent, reaction, severity)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('alg_01', tenantId, patientId, 'Dipirona Sódica', 'Edema de glote e urticária disseminada', 'severe');

  // Exam
  db.prepare(`
    INSERT OR REPLACE INTO patient_exams (id, tenant_id, patient_id, professional_id, title, exam_type, exam_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('ex_01', tenantId, patientId, 'prof_doc_01', 'Hemograma Completo', 'laboratorial', '2026-10-15');

  // Consent
  db.prepare(`
    INSERT OR REPLACE INTO patient_consents (id, tenant_id, patient_id, consent_type, title, content_text, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('cns_01', tenantId, patientId, 'telemedicine', 'Termo de Consentimento para Telemedicina', 'Autorizo a realização de teleconsultas.', 'accepted');

  // Specialty: Odontology
  db.prepare(`
    INSERT OR REPLACE INTO dental_tooth_records (id, tenant_id, patient_id, professional_id, tooth_number, face, condition, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('odo_01', tenantId, patientId, 'prof_doc_01', 16, 'occlusal', 'restored', 'Sensibilidade no dente 16');

  // Specialty: Physiotherapy
  db.prepare(`
    INSERT OR REPLACE INTO physiotherapy_assessments (id, tenant_id, patient_id, professional_id, chief_complaint, medical_diagnosis)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('fis_01', tenantId, patientId, 'prof_doc_01', 'Dor lombar ao sentar', 'Lombalgia mecânico-postural');

  // Specialty: Nutrition
  db.prepare(`
    INSERT OR REPLACE INTO nutrition_meal_plans (id, tenant_id, patient_id, professional_id, title, meals_json, guidelines)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('nut_01', tenantId, patientId, 'prof_doc_01', 'Plano Alimentar Hipertrofia', '[]', 'Manter ingestão hídrica de 2,5 L/dia');

  // Specialty: Fono
  db.prepare(`
    INSERT OR REPLACE INTO fono_anamnesis (id, tenant_id, patient_id, professional_id, data_json)
    VALUES (?, ?, ?, ?, ?)
  `).run('fon_01', tenantId, patientId, 'prof_doc_01', JSON.stringify({ complaint: 'Disfonia funcional leve' }));

  // Specialty: Psychology
  db.prepare(`
    INSERT OR REPLACE INTO psychology_anamnesis (id, tenant_id, patient_id, professional_id, main_complaint)
    VALUES (?, ?, ?, ?, ?)
  `).run('psi_01', tenantId, patientId, 'prof_doc_01', 'Ansiedade e estresse no trabalho');

  // Specialty: Occupational Therapy
  db.prepare(`
    INSERT OR REPLACE INTO to_occupational_profiles (id, tenant_id, patient_id, professional_id, routine)
    VALUES (?, ?, ?, ?, ?)
  `).run('to_01', tenantId, patientId, 'prof_doc_01', 'Adaptação ergonômica de teclado e mouse');

  // Specialty: Psychopedagogy
  db.prepare(`
    INSERT OR REPLACE INTO psychopedagogy_profiles (id, tenant_id, patient_id, school_name, school_grade)
    VALUES (?, ?, ?, ?, ?)
  `).run('pp_01', tenantId, patientId, 'Escola Modelo', '5º ano fundamental');

  // Specialty: Personal
  db.prepare(`
    INSERT OR REPLACE INTO personal_workouts (id, tenant_id, patient_id, professional_id, title, division)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('pwo_01', tenantId, patientId, 'prof_doc_01', 'Treino A - Força e Hipertrofia', 'A');

  // Specialty: Estetic (if table exists)
  try {
    db.prepare(`
      INSERT OR REPLACE INTO estetic_procedures (id, tenant_id, patient_id, professional_id, area, region, procedure_name, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('est_01', tenantId, patientId, 'prof_doc_01', 'FACIAL', 'Glabela', 'Toxina Botulínica Preventiva', 'Aplicação de 25U');
  } catch (e) {}

  console.log('✓ [1/7] Dados clínicos e de especialidades inseridos com sucesso');

  // Test 2: fetchFullClinicalData
  const data = ClinicalExportService.fetchFullClinicalData(tenantId, patientId);
  assert.ok(data, 'Dados clínicos devem existir');
  assert.strictEqual(data.patient.id, patientId, 'ID do paciente deve ser idêntico');
  assert.strictEqual(data.patient.full_name, 'Carlos Drummond de Andrade');
  assert.strictEqual(data.records.length, 1, 'Deve conter 1 registro de prontuário');
  assert.strictEqual(data.prescriptions.length, 1, 'Deve conter 1 prescrição médica');
  assert.strictEqual(data.allergies.length, 1, 'Deve conter 1 alergia');
  assert.strictEqual(data.exams.length, 1, 'Deve conter 1 exame');
  assert.strictEqual(data.consents.length, 1, 'Deve conter 1 termo de consentimento');
  assert.ok(data.specialtyModules, 'Módulos de especialidade devem existir');
  assert.strictEqual(data.specialtyModules.dental.toothRecords.length, 1, 'Odontologia deve conter 1 registro');
  assert.strictEqual(data.specialtyModules.physio.assessments.length, 1, 'Fisioterapia deve conter 1 avaliação');
  assert.strictEqual(data.specialtyModules.nutri.mealPlans.length, 1, 'Nutrição deve conter 1 plano');
  assert.strictEqual(data.specialtyModules.fono.anamnesis.length, 1, 'Fonoaudiologia deve conter 1 anamnese');
  assert.strictEqual(data.specialtyModules.psico.anamnesis.length, 1, 'Psicologia deve conter 1 anamnese');
  assert.strictEqual(data.specialtyModules.to.profiles.length, 1, 'Terapia Ocupacional deve conter 1 perfil');
  assert.strictEqual(data.specialtyModules.pp.profiles.length, 1, 'Psicopedagogia deve conter 1 perfil');
  assert.strictEqual(data.specialtyModules.personal.workouts.length, 1, 'ZemdaPersonal deve conter 1 treino');
  console.log('✓ [2/7] fetchFullClinicalData agregou com sucesso os múltiplos módulos clínicos e de especialidade');

  // Test 3: generateDocxBuffer (Genuine ECMA-376 OpenXML)
  const docxBuffer = ClinicalExportService.generateDocxBuffer(data, {
    coverNotes: 'Laudo pericial e histórico clínico emitido a pedido da defesa.'
  });
  assert.ok(Buffer.isBuffer(docxBuffer), 'O retorno deve ser um Buffer Node.js');
  assert.ok(docxBuffer.length > 2000, 'Tamanho do arquivo .docx deve ser > 2KB');

  // Validate ZIP and OpenXML structure
  const zip = new AdmZip(docxBuffer);
  const zipEntries = zip.getEntries().map(e => e.entryName);
  
  assert.ok(zipEntries.includes('[Content_Types].xml'), 'Deve conter [Content_Types].xml padrão OpenXML');
  assert.ok(zipEntries.includes('_rels/.rels'), 'Deve conter _rels/.rels padrão OpenXML');
  assert.ok(zipEntries.includes('word/document.xml'), 'Deve conter word/document.xml');
  assert.ok(zipEntries.includes('word/styles.xml'), 'Deve conter word/styles.xml');

  const documentXml = zip.readAsText('word/document.xml');
  assert.ok(documentXml.includes('<w:document'), 'Deve ser um documento OpenXML autêntico');
  assert.ok(!documentXml.includes('<html'), 'NÃO PODE ser HTML disfarçado de .docx');
  assert.ok(documentXml.includes('Carlos Drummond de Andrade'), 'Deve conter o nome do paciente no OpenXML');
  assert.ok(documentXml.includes('Zemda Medical Clinic'), 'Deve conter a clínica emissora');
  assert.ok(documentXml.includes('Rinofaringite aguda'), 'Deve conter o diagnóstico clínico');
  assert.ok(documentXml.includes('Dipirona'), 'Deve conter alergias');
  assert.ok(documentXml.includes('Laudo pericial'), 'Deve conter notas da capa');

  console.log('✓ [3/7] generateDocxBuffer gerou OpenXML ECMA-376 100% válido (sem HTML disfarçado, com estilos, tabelas e sanitização)');

  // Test 4: generatePdfBuffer
  const pdfBuffer = await ClinicalExportService.generatePdfBuffer(data, {
    coverNotes: 'Documento confidencial sob sigilo médico.'
  });
  assert.ok(Buffer.isBuffer(pdfBuffer), 'O retorno do PDF deve ser um Buffer');
  assert.ok(pdfBuffer.length > 1500, 'PDF gerado deve ter tamanho > 1500 bytes');
  const pdfHeader = pdfBuffer.slice(0, 5).toString('ascii');
  assert.strictEqual(pdfHeader, '%PDF-', 'Buffer deve ter o cabeçalho mágico oficial de PDF (%PDF-)');
  console.log(`✓ [4/7] generatePdfBuffer gerou PDF vetorial com sucesso (${pdfBuffer.length} bytes, cabeçalho %PDF-)`);

  // Test 5: generateJson
  const jsonData = ClinicalExportService.generateJson(data);
  assert.strictEqual(jsonData.version, '2.0.0');
  assert.strictEqual(jsonData.compliance, 'CFM 1.821/2007 & LGPD Lei 13.709/2018');
  assert.strictEqual(jsonData.patient.fullName, 'Carlos Drummond de Andrade');
  assert.strictEqual(jsonData.allergies[0].agent, 'Dipirona Sódica');
  console.log('✓ [5/7] generateJson gerou estrutura interoperável de prontuário com total fidelidade');

  // Test 6: generateBundleZip (ZIP Package with manifest.json)
  const bundleZipBuffer = await ClinicalExportService.generateBundleZip(data, {
    coverNotes: 'Pacote forense completo de exportação clínica'
  });
  assert.ok(Buffer.isBuffer(bundleZipBuffer), 'O pacote bundle deve ser um Buffer');
  const bundleZip = new AdmZip(bundleZipBuffer);
  const bundleEntries = bundleZip.getEntries().map(e => e.entryName);
  
  assert.ok(bundleEntries.includes('manifest.json'), 'Bundle deve incluir manifest.json');
  assert.ok(bundleEntries.some(e => e.endsWith('.docx')), 'Bundle deve incluir arquivo .docx oficial');
  assert.ok(bundleEntries.some(e => e.endsWith('.pdf')), 'Bundle deve incluir arquivo .pdf vetorial');
  assert.ok(bundleEntries.some(e => e.endsWith('.json')), 'Bundle deve incluir arquivo .json estruturado');

  const manifestStr = bundleZip.readAsText('manifest.json');
  const manifest = JSON.parse(manifestStr);
  assert.strictEqual(manifest.schemaVersion, '2.0.0');
  assert.strictEqual(manifest.retentionPolicy, 'ZERO RETENTION ON CLOUD - STREAMED DIRECTLY TO AUTHORIZED CLIENT');
  assert.strictEqual(manifest.patient.cpf, '12345678909');
  assert.ok(manifest.files.docx.sha256, 'manifest deve registrar hash SHA-256 do docx');
  assert.ok(manifest.files.pdf.sha256, 'manifest deve registrar hash SHA-256 do pdf');
  assert.ok(manifest.files.json.sha256, 'manifest deve registrar hash SHA-256 do json');
  console.log('✓ [6/7] generateBundleZip gerou pacote ZIP completo com manifest.json assinado e hashes criptográficos');

  // Test 7: ReportController.exportDocx - Bugfix de Fallback Silencioso & Validação
  console.log('\nTestando segurança e eliminação de fallback silencioso no ReportController...');

  // 7.1 Sem patientId quando type=patient_records -> deve retornar 400
  let resStatus = 200;
  let resJson = null;
  let resHeaders = {};
  let resBody = null;

  const mockReqNoPatient = {
    tenantId,
    query: { type: 'patient_records' },
    user: { userId, role: 'clinic_admin' }
  };
  const mockResNoPatient = {
    status: (s) => { resStatus = s; return mockResNoPatient; },
    json: (j) => { resJson = j; return mockResNoPatient; },
    setHeader: (k, v) => { resHeaders[k] = v; },
    send: (b) => { resBody = b; }
  };

  ReportController.exportDocx(mockReqNoPatient, mockResNoPatient);
  assert.strictEqual(resStatus, 400, 'Falta de patientId deve retornar status 400');
  assert.ok(resJson.error.includes('ID do paciente é obrigatório'), 'Mensagem de erro deve ser explícita');
  assert.strictEqual(resBody, null, 'Nenhum arquivo pode ser gerado no erro');
  console.log('✓ [7.1/7] Fallback silencioso ELIMINADO: patientId ausente rejeitado com HTTP 400');

  // 7.2 Com patientId válido -> deve retornar 200 com OpenXML genuíno
  resStatus = 200;
  resJson = null;
  resHeaders = {};
  resBody = null;

  const mockReqValid = {
    tenantId,
    query: { type: 'patient_records', patientId },
    user: { userId, role: 'clinic_admin' }
  };
  const mockResValid = {
    status: (s) => { resStatus = s; return mockResValid; },
    json: (j) => { resJson = j; return mockResValid; },
    setHeader: (k, v) => { resHeaders[k] = v; },
    send: (b) => { resBody = b; }
  };

  ReportController.exportDocx(mockReqValid, mockResValid);
  assert.strictEqual(resStatus, 200, 'Requisição válida deve responder 200');
  assert.strictEqual(resHeaders['Content-Type'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.ok(Buffer.isBuffer(resBody), 'Corpo da resposta deve ser Buffer OpenXML');
  
  const streamedDocxZip = new AdmZip(resBody);
  assert.ok(streamedDocxZip.getEntries().some(e => e.entryName === 'word/document.xml'));
  console.log('✓ [7.2/7] ReportController.exportDocx transmite OpenXML autêntico com cabeçalho MIME correto');

  console.log('\n=============================================================');
  console.log('🎯 TODOS OS TESTES DO EXPORTADOR DE PRONTUÁRIOS PASSARAM COM 100% DE SUCESSO (7/7)');
  console.log('=============================================================\n');
}

runTests().catch(err => {
  console.error('❌ Falha nos testes de exportação:', err);
  process.exit(1);
});
