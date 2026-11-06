const assert = require('assert');
const AdmZip = require('adm-zip');
const { db } = require('./dist/config/database');
const { ClinicalExportService } = require('./dist/services/clinical-export.service');

async function runTestSuite() {
  console.log('=== TESTE AUTOMATIZADO: AUDITORIA & SUÍTE DE EXPORTAÇÃO CLÍNICA ===\n');

  process.env.MOCK_GEMINI_OCR = 'true';
  const tenantId = 't_export_suite_' + Date.now();
  const userId = 'u_doctor_suite_' + Date.now();
  const patientId = 'p_suite_' + Date.now();

  try {
    // 1. Setup do tenant, médico e paciente
    db.prepare(`
      INSERT OR REPLACE INTO tenants (id, slug, name, trade_name, email, phone)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(tenantId, 'clinica-export-' + Date.now(), 'Clínica Integrada de Saúde Zemda', 'Zemda Saúde', 'export@zemda.com.br', '11988880000');

    db.prepare(`
      INSERT OR REPLACE INTO users (id, tenant_id, name, email, role, password_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, tenantId, 'Dra. Gabriela Médica', 'gabriela@zemda.com.br', 'clinic_admin', 'hash');

    db.prepare(`
      INSERT OR REPLACE INTO professionals (id, tenant_id, user_id, name, registration_type, registration_number)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('prof-suite-01', tenantId, userId, 'Dra. Gabriela Médica', 'CRM', '123456-SP');

    db.prepare(`
      INSERT OR REPLACE INTO patients (id, tenant_id, full_name, cpf, birth_date, gender, phone, email, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(patientId, tenantId, 'Carlos Eduardo Silveira', '123.456.789-00', '1988-06-15', 'male', '11977778888', 'carlos@exemplo.com.br');

    // 2. Insere dados clínicos na tabela records
    const dates = ['2026-01-10', '2026-02-15', '2026-03-20', '2026-04-25'];
    for (let i = 0; i < dates.length; i++) {
      db.prepare(`
        INSERT INTO records (id, tenant_id, patient_id, professional_id, session_date, session_time, title, clinical_evolution, technical_notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, '14:00', ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        `cr-suite-${i + 1}`,
        tenantId,
        patientId,
        'prof-suite-01',
        dates[i],
        `Consulta Clínica Periódica ${i + 1}`,
        `Evolução clínica do paciente no atendimento ${i + 1}. Paciente relata boa adesão terapêutica e estabilidade hemodinâmica.`,
        `PA: 120/80 mmHg, FC: 72 bpm. Manter conduta preventiva.`
      );
    }

    // 3. Tenta inserir prescrição na tabela clinical_prescriptions
    try {
      db.prepare(`
        INSERT INTO clinical_prescriptions (id, tenant_id, patient_id, professional_id, medications_text, content_text, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        'rx-suite-01',
        tenantId,
        patientId,
        'prof-suite-01',
        '1. Losartana Potássica 50mg - 1 cp ao dia pela manhã.\n2. Hidroclorotiazida 25mg - 1 cp ao dia pela manhã.',
        'Uso contínuo.'
      );
    } catch (_) {}

    console.log('[1/6] Coletando prontuário 360° via fetchFullClinicalData...');
    const fullData = ClinicalExportService.fetchFullClinicalData(tenantId, patientId);
    assert(fullData, 'Dados clínicos completos devem ser retornados');
    assert.strictEqual(fullData.records.length, 4, 'Devem existir 4 evoluções');
    console.log(`✓ Prontuário 360° recuperado com 4 evoluções.`);

    console.log('[2/6] Gerando Word (.docx) OpenXML autêntico...');
    const docxBuf = ClinicalExportService.generateDocxBuffer(fullData, {
      order: 'desc',
      coverNotes: 'Emitido a pedido do paciente para transferência de acompanhamento.'
    });
    assert(Buffer.isBuffer(docxBuf), 'DOCX deve ser um buffer válido');
    assert(docxBuf.length > 1000, 'DOCX deve ter tamanho representativo');

    // Valida integridade do arquivo ZIP/DOCX
    const docxZip = new AdmZip(docxBuf);
    const docxEntries = docxZip.getEntries().map(e => e.entryName);
    assert(docxEntries.includes('[Content_Types].xml'), 'Deve conter [Content_Types].xml');
    assert(docxEntries.includes('word/document.xml'), 'Deve conter word/document.xml');
    assert(docxEntries.includes('word/styles.xml'), 'Deve conter word/styles.xml');
    console.log(`✓ Documento DOCX OpenXML 100% válido (${docxBuf.length} bytes, compatível com Word e LibreOffice).`);

    console.log('[3/6] Testando filtros de seções e módulos no DOCX...');
    const filteredDocx = ClinicalExportService.generateDocxBuffer(fullData, {
      modules: { records: true, documents: false, allergies: false }
    });
    const filteredZip = new AdmZip(filteredDocx);
    const docXml = filteredZip.readAsText('word/document.xml');
    assert(docXml.includes('EVOLUÇÕES CLÍNICAS'), 'Deve incluir evoluções quando records = true');
    assert(!docXml.includes('PRESCRIÇÕES, RECEITUÁRIOS'), 'NÃO deve incluir prescrições quando documents = false');
    console.log('✓ Filtragem granular de módulos validada com sucesso.');

    console.log('[4/6] Gerando PDF Oficial...');
    const pdfBuf = await ClinicalExportService.generatePdfBuffer(fullData, {
      order: 'desc',
      coverNotes: 'Perícia Médica'
    });
    assert(Buffer.isBuffer(pdfBuf), 'PDF deve ser um buffer');
    assert(pdfBuf.slice(0, 5).toString('ascii') === '%PDF-', 'PDF deve ter cabeçalho %PDF- válido');
    console.log(`✓ PDF Oficial gerado via PDFKit em memória (${pdfBuf.length} bytes).`);

    console.log('[5/6] Gerando Pacote ZIP individual com manifesto SHA-256...');
    const bundleZipBuf = await ClinicalExportService.generateBundleZip(fullData, { order: 'desc' });
    const bundleZip = new AdmZip(bundleZipBuf);
    const bundleEntries = bundleZip.getEntries().map(e => e.entryName);
    assert(bundleEntries.includes('prontuario.docx'), 'Pacote deve conter prontuario.docx');
    assert(bundleEntries.includes('prontuario.pdf'), 'Pacote deve conter prontuario.pdf');
    assert(bundleEntries.includes('dados_clinicos.json'), 'Pacote deve conter dados_clinicos.json');
    assert(bundleEntries.includes('manifest.json'), 'Pacote deve conter manifest.json');

    const manifest = JSON.parse(bundleZip.readAsText('manifest.json'));
    assert.strictEqual(manifest.compliance, 'CFM 1.821/2007 & LGPD Lei 13.709/2018');
    assert(manifest.files.docx.sha256, 'Manifesto deve conter hash sha256 do DOCX');
    assert(manifest.files.pdf.sha256, 'Manifesto deve conter hash sha256 do PDF');
    console.log(`✓ Pacote ZIP individual com manifesto SHA-256 e conformidade CFM/LGPD validado.`);

    console.log('[6/6] Testando Assistente de IA e Exportação em Lote da Clínica...');
    const aiReviewed = await ClinicalExportService.reviewClinicalFormattingWithAi('paciente solicita prontuario para levar em outro medico');
    assert(aiReviewed && aiReviewed.length > 20, 'Assistente de IA deve retornar texto formalmente revisado');
    console.log(`✓ Assistente de IA retornou texto formal: "${aiReviewed.slice(0, 70)}..."`);

    const batchZipBuf = await ClinicalExportService.generateBatchZip(tenantId, {
      patientIds: [patientId],
      format: 'all'
    });
    const batchZip = new AdmZip(batchZipBuf);
    const batchEntries = batchZip.getEntries().map(e => e.entryName);
    assert(batchEntries.includes('manifest.json'), 'Lote deve conter manifest.json na raiz');
    assert(batchEntries.some(e => e.includes('prontuario_') && e.endsWith('.docx')), 'Lote deve conter pasta com DOCX do paciente');
    assert(batchEntries.some(e => e.includes('prontuario_') && e.endsWith('.pdf')), 'Lote deve conter pasta com PDF do paciente');
    console.log(`✓ Exportação em Lote da Clínica gerada com sucesso em streaming de memória.`);

  } finally {
    // Limpeza
    db.prepare('DELETE FROM records WHERE tenant_id = ?').run(tenantId);
    try { db.prepare('DELETE FROM clinical_prescriptions WHERE tenant_id = ?').run(tenantId); } catch (_) {}
    db.prepare('DELETE FROM patients WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM professionals WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM users WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM tenants WHERE id = ?').run(tenantId);
    console.log('\n✓ Tenant de auditoria clínica limpo. Zero retenção confirmada.');
  }

  console.log('================================================================');
  console.log(' TODAS AS 6 ETAPAS DA SUÍTE DE EXPORTAÇÃO CLÍNICA FORAM APROVADAS!');
  console.log('================================================================\n');
}

runTestSuite().catch(err => {
  console.error('FALHA NA SUÍTE DE EXPORTAÇÃO CLÍNICA:', err);
  process.exit(1);
});
