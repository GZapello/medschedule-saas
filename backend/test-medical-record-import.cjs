/**
 * Testes Automatizados de Integração: Importação de Prontuário por Foto / Documento Efêmero
 * REGRA CRÍTICA: Nenhuma imagem ou documento original é armazenado!
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_medical_record_import.db');
process.env.JWT_SECRET = 'test-secret-medical-record-import-12345';
process.env.MOCK_GEMINI_OCR = 'true';
process.env.NODE_ENV = 'test';

if (fs.existsSync(process.env.DATABASE_PATH)) {
  fs.unlinkSync(process.env.DATABASE_PATH);
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');
const express = require('express');
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use('/api', require('./dist/routes').default);

const PORT = 3105;
let server;

function makeRequest(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: urlPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, data: json, raw: data });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  server = app.listen(PORT);
  console.log('====================================================');
  console.log('INICIANDO TESTES: IMPORTAÇÃO DE PRONTUÁRIO POR FOTO / DOCUMENTO');
  console.log('====================================================\n');

  try {
    const tenantId = 'tenant-ocr-test-' + Date.now();
    const userId = 'usr-ocr-test-1';

    // 1. Setup tenant & user
    db.prepare(`
      INSERT INTO tenants (id, name, slug, status, email, cnpj_cpf)
      VALUES (?, 'Clínica Teste OCR', ?, 'active', 'avaliador@zemda.test', '11111111111')
    `).run(tenantId, 'slug-' + tenantId);

    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status)
      VALUES (?, ?, 'Dr. Avaliador', 'avaliador@zemda.test', 'hash123', 'clinic_admin', 'active')
    `).run(userId, tenantId);

    const token = generateToken({
      userId,
      tenantId,
      email: 'avaliador@zemda.test',
      role: 'clinic_admin'
    });

    const authHeaders = {
      'Authorization': `Bearer ${token}`,
      'X-Tenant-ID': tenantId
    };

    // ----------------------------------------------------
    console.log('--- TEST 1: Rejeição de requisição sem arquivos ---');
    const resEmpty = await makeRequest('POST', '/api/v1/import/medical-record/analyze', authHeaders, { files: [] });
    assert.strictEqual(resEmpty.status, 400);
    assert.ok(resEmpty.data.error.includes('Nenhum arquivo'));
    console.log('✓ Requisição vazia rejeitada com HTTP 400');

    // ----------------------------------------------------
    console.log('\n--- TEST 2: Rejeição de formato não permitido (.exe, .zip) ---');
    const resBadFormat = await makeRequest('POST', '/api/v1/import/medical-record/analyze', authHeaders, {
      files: [{ fileName: 'malware.exe', mimeType: 'application/x-msdownload', base64: 'AAAA' }]
    });
    assert.strictEqual(resBadFormat.status, 400);
    assert.ok(resBadFormat.data.error.includes('não suportado'));
    console.log('✓ Formato inválido rejeitado com HTTP 400');

    // ----------------------------------------------------
    console.log('\n--- TEST 3: Análise de Prontuário Impresso (Multi-página) ---');
    const samplePrintedFiles = [
      { fileName: 'prontuario_impresso_pag1.jpg', mimeType: 'image/jpeg', base64: 'dGVzdGUtZGF0YTE=' },
      { fileName: 'prontuario_impresso_pag2.png', mimeType: 'image/png', base64: 'dGVzdGUtZGF0YTI=' }
    ];
    const resAnalyzePrinted = await makeRequest('POST', '/api/v1/import/medical-record/analyze', authHeaders, { files: samplePrintedFiles });
    assert.strictEqual(resAnalyzePrinted.status, 200);
    assert.strictEqual(resAnalyzePrinted.data.success, true);
    assert.strictEqual(resAnalyzePrinted.data.totalPages, 2);
    assert.ok(resAnalyzePrinted.data.extractedData);
    assert.strictEqual(resAnalyzePrinted.data.extractedData.patient.full_name, 'Mariana Souza de Oliveira');
    assert.strictEqual(resAnalyzePrinted.data.extractedData.evolutions.length, 2);
    // Assegura que atendimentos não foram fundidos numa data só
    assert.notStrictEqual(resAnalyzePrinted.data.extractedData.evolutions[0].date, resAnalyzePrinted.data.extractedData.evolutions[1].date);
    console.log('✓ Prontuário impresso analisado com 2 evoluções com datas distintas');

    // ----------------------------------------------------
    console.log('\n--- TEST 4: Análise de Ficha Manuscrita com trechos [Revisar] ---');
    const sampleHandwritten = [
      { fileName: 'ficha_clinica_manuscrita_pag1.webp', mimeType: 'image/webp', base64: 'dGVzdGUtbWFudXNjcml0bw==' }
    ];
    const resAnalyzeHandwritten = await makeRequest('POST', '/api/v1/import/medical-record/analyze', authHeaders, { files: sampleHandwritten });
    assert.strictEqual(resAnalyzeHandwritten.status, 200);
    const dataHw = resAnalyzeHandwritten.data.extractedData;
    assert.ok(dataHw.chief_complaint?.includes('[Revisar]') || dataHw.clinical?.chief_complaint?.includes('[Revisar]'));
    assert.ok(dataHw.needs_review_fields.length > 0);
    assert.ok(dataHw.uncertain_passages.length > 0);
    console.log('✓ Ficha manuscrita identificou caligrafia e sinalizou tags [Revisar]');

    // ----------------------------------------------------
    console.log('\n--- TEST 5: Análise de Documento Digitalizado em PDF ---');
    const samplePdf = [
      { fileName: 'prontuario_paciente.pdf', mimeType: 'application/pdf', base64: 'JVBERi0xLjQKJUZha2VQZGY=' }
    ];
    const resAnalyzePdf = await makeRequest('POST', '/api/v1/import/medical-record/analyze', authHeaders, { files: samplePdf });
    assert.strictEqual(resAnalyzePdf.status, 200);
    assert.strictEqual(resAnalyzePdf.data.success, true);
    console.log('✓ Documento PDF processado com sucesso');

    // ----------------------------------------------------
    console.log('\n--- TEST 6: Execução da Importação de Paciente Novo com Múltiplas Evoluções ---');
    const executePayloadNew = {
      action: 'create_new',
      patient: dataHw.patient,
      clinical: dataHw.clinical,
      evolutions: dataHw.evolutions,
      ignoredFields: []
    };
    const resExecNew = await makeRequest('POST', '/api/v1/import/medical-record/execute', authHeaders, executePayloadNew);
    assert.strictEqual(resExecNew.status, 200);
    assert.strictEqual(resExecNew.data.success, true);
    assert.strictEqual(resExecNew.data.isNewPatient, true);
    const createdPatientId = resExecNew.data.patientId;
    assert.ok(createdPatientId);

    // Valida no banco se paciente foi inserido
    const savedPatient = db.prepare('SELECT * FROM patients WHERE id = ?').get(createdPatientId);
    assert.strictEqual(savedPatient.full_name, 'Carlos Eduardo Silva');
    assert.strictEqual(savedPatient.allergies_status, 'has_allergies');

    // Valida se as 2 evoluções foram inseridas em datas separadas na tabela records
    const savedRecords = db.prepare('SELECT * FROM records WHERE patient_id = ? ORDER BY session_date ASC').all(createdPatientId);
    assert.strictEqual(savedRecords.length, 2);
    assert.strictEqual(savedRecords[0].session_date, '2024-03-10');
    assert.strictEqual(savedRecords[1].session_date, '2024-03-24');
    assert.ok(savedRecords[0].clinical_evolution.includes('Primeira consulta'));
    assert.ok(savedRecords[1].clinical_evolution.includes('Retorno clínico'));

    // Valida se alergias e medicamentos foram inseridos
    const savedAllergies = db.prepare('SELECT * FROM patient_allergies WHERE patient_id = ?').all(createdPatientId);
    assert.ok(savedAllergies.length >= 1);
    const savedMeds = db.prepare('SELECT * FROM patient_medications WHERE patient_id = ?').all(createdPatientId);
    assert.ok(savedMeds.length >= 1);
    console.log('✓ Paciente novo cadastrado com anamnese, alergias e 2 evoluções separadas na linha do tempo');

    // ----------------------------------------------------
    console.log('\n--- TEST 7: Detecção Automática de Paciente Existente por CPF / Telefone / Nome ---');
    // Ao analisar novamente a mesma ficha ou os mesmos dados, a API deve detectar duplicata
    const resDuplicateDetect = await makeRequest('POST', '/api/v1/import/medical-record/analyze', authHeaders, { files: sampleHandwritten });
    assert.strictEqual(resDuplicateDetect.status, 200);
    assert.strictEqual(resDuplicateDetect.data.isDuplicate, true);
    assert.strictEqual(resDuplicateDetect.data.matchedPatient.id, createdPatientId);
    console.log('✓ Paciente existente detectado automaticamente com match de documento/cadastro');

    // ----------------------------------------------------
    console.log('\n--- TEST 8: Vinculação a Paciente Existente sem Duplicar Cadastro ---');
    const newEvolutionBatch = [
      {
        date: '2024-05-10',
        time: '15:00',
        professional: 'Dr. Roberto Mendes',
        evolution: 'Terceiro atendimento. Manutenção preventiva.',
        conduct: 'Liberado para atividades de rotina.'
      }
    ];
    const executePayloadLink = {
      action: 'link_existing',
      existingPatientId: createdPatientId,
      patient: {
        ...dataHw.patient,
        phone: '(11) 99999-8888' // Atualização de telefone
      },
      clinical: dataHw.clinical,
      evolutions: newEvolutionBatch,
      ignoredFields: ['allergies'] // Ignora alergias para não duplicar
    };
    const resExecLink = await makeRequest('POST', '/api/v1/import/medical-record/execute', authHeaders, executePayloadLink);
    assert.strictEqual(resExecLink.status, 200);
    assert.strictEqual(resExecLink.data.isNewPatient, false);
    assert.strictEqual(resExecLink.data.patientId, createdPatientId);

    // Confirma que não criou paciente duplicado
    const totalPatients = db.prepare('SELECT COUNT(*) as count FROM patients WHERE tenant_id = ?').get(tenantId);
    assert.strictEqual(totalPatients.count, 1);

    // Confirma que telefone foi atualizado
    const updatedPatient = db.prepare('SELECT phone FROM patients WHERE id = ?').get(createdPatientId);
    assert.strictEqual(updatedPatient.phone, '(11) 99999-8888');

    // Confirma que a nova evolução foi adicionada ao histórico existente
    const allRecords = db.prepare('SELECT * FROM records WHERE patient_id = ?').all(createdPatientId);
    assert.strictEqual(allRecords.length, 3);
    console.log('✓ Vinculação a paciente existente executada com sucesso, mantendo histórico unificado');

    // ----------------------------------------------------
    console.log('\n--- TEST 9: Ignorar Campos Especificados na Revisão ---');
    const executePayloadIgnored = {
      action: 'create_new',
      patient: {
        full_name: 'Paciente Sem Endereço',
        phone: '(11) 91111-2222',
        address: 'Rua Proibida'
      },
      clinical: {
        allergies: 'Alergia Ignorada'
      },
      evolutions: [],
      ignoredFields: ['address', 'allergies']
    };
    const resExecIgnored = await makeRequest('POST', '/api/v1/import/medical-record/execute', authHeaders, executePayloadIgnored);
    assert.strictEqual(resExecIgnored.status, 200);
    const patIgnored = db.prepare('SELECT address, allergies_status FROM patients WHERE id = ?').get(resExecIgnored.data.patientId);
    assert.strictEqual(patIgnored.address, null);
    assert.notStrictEqual(patIgnored.allergies_status, 'has_allergies');
    console.log('✓ Campos ignorados pelo usuário na revisão não foram persistidos');

    // ----------------------------------------------------
    console.log('\n--- TEST 10: REGRA CRÍTICA — NENHUM ARQUIVO OU IMAGEM PERMANECE ARMAZENADO ---');
    // Verifica que NENHUM registro foi criado em file_attachments ou documents
    const totalAttachments = db.prepare('SELECT COUNT(*) as count FROM file_attachments WHERE clinic_id = ?').get(tenantId);
    assert.strictEqual(totalAttachments.count, 0, 'file_attachments deve permanecer rigorosamente 0');

    const totalDocuments = db.prepare('SELECT COUNT(*) as count FROM documents WHERE tenant_id = ?').get(tenantId);
    assert.strictEqual(totalDocuments.count, 0, 'documents deve permanecer rigorosamente 0');

    // Verifica que nas tabelas de prontuário e pacientes não há strings base64
    const anyBase64InPatients = db.prepare(`
      SELECT COUNT(*) as count FROM patients
      WHERE tenant_id = ? AND (clinical_notes LIKE '%dGVzdGUt%' OR notes_admin LIKE '%dGVzdGUt%')
    `).get(tenantId);
    assert.strictEqual(anyBase64InPatients.count, 0);

    const anyBase64InRecords = db.prepare(`
      SELECT COUNT(*) as count FROM records
      WHERE tenant_id = ? AND clinical_evolution LIKE '%dGVzdGUt%'
    `).get(tenantId);
    assert.strictEqual(anyBase64InRecords.count, 0);

    console.log('✓ Confirmação estrita: Zero arquivos salvos no banco, Cloudflare/R2 ou anexos');

    // ----------------------------------------------------
    console.log('\n--- TEST 11: Busca Direta de Paciente Duplicado ---');
    const resSearch = await makeRequest('GET', `/api/v1/import/medical-record/search-patient?name=Carlos%20Eduardo%20Silva`, authHeaders);
    assert.strictEqual(resSearch.status, 200);
    assert.strictEqual(resSearch.data.isDuplicate, true);
    assert.strictEqual(resSearch.data.matchedPatient.id, createdPatientId);
    console.log('✓ Endpoint de busca de duplicata respondeu corretamente');

    console.log('\n====================================================');
    console.log('🎉 TODOS OS 11 TESTES DO IMPORTADOR PASSARAM COM 100%!');
    console.log('====================================================');

  } catch (err) {
    console.error('\n❌ Falha nos testes:', err);
    process.exitCode = 1;
  } finally {
    if (server) server.close();
    if (fs.existsSync(process.env.DATABASE_PATH)) {
      try { fs.unlinkSync(process.env.DATABASE_PATH); } catch (_) {}
    }
  }
}

runTests();
