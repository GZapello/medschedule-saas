const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_external_tests_universal.db');
process.env.JWT_SECRET = 'test-secret-universal-tests-123';
process.env.PORT = '3098';
process.env.R2_MOCK_STORAGE = 'true';

if (fs.existsSync(process.env.DATABASE_PATH)) {
  fs.unlinkSync(process.env.DATABASE_PATH);
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');
const express = require('express');
const app = express();
app.use(express.json());
app.use('/api', require('./dist/routes').default);

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failedTests++;
  }
}

function makeRequest(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3098,
      path: urlPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data });
        }
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
  console.log('🚀 INICIANDO TESTES: UNIVERSAL EXTERNAL TESTS & ANEXOS MULTI-FORMATO\n');

  const server = app.listen(3098);

  try {
    // 1. Setup seed data: tenant, user, professional, patient
    const tenantId = uuidv4();
    const userId = uuidv4();
    const professionalId = uuidv4();
    const patientId = uuidv4();

    db.prepare(`
      INSERT INTO tenants (id, name, slug, email, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(tenantId, 'Clínica Universal Multidisciplinar', 'clinica-universal', 'contato@universal.med.br', 'active');

    db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, role, name, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, tenantId, 'clinico@universal.med.br', 'hash', 'professional', 'Dr. Roberto Multiprofissional', 'active');

    db.prepare(`
      INSERT INTO professionals (id, tenant_id, user_id, name, active)
      VALUES (?, ?, ?, ?, ?)
    `).run(professionalId, tenantId, userId, 'Dr. Roberto Multiprofissional', 1);

    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, email, phone, active)
      VALUES (?, ?, ?, 'paciente@teste.com', '11999990000', 1)
    `).run(patientId, tenantId, 'Paciente Teste Universal');

    const token = generateToken({
      userId: userId,
      tenantId: tenantId,
      role: 'professional',
      professionalId: professionalId
    });

    const headers = { Authorization: `Bearer ${token}` };

    console.log('📁 1. TESTE DE EXPANSÃO DE FORMATOS DE ARQUIVO (PDF, DOCX, XLSX, CSV, IMAGENS)');

    const supportedFormats = [
      { ext: 'pdf', mime: 'application/pdf', cat: 'external_tests' },
      { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', cat: 'external_tests' },
      { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', cat: 'external_tests' },
      { ext: 'csv', mime: 'text/csv', cat: 'external_tests' },
      { ext: 'jpg', mime: 'image/jpeg', cat: 'external_tests' },
      { ext: 'png', mime: 'image/png', cat: 'external_tests' }
    ];

    const generatedTickets = [];

    for (const fmt of supportedFormats) {
      const res = await makeRequest('POST', '/api/v1/files/upload/ticket', headers, {
        category: fmt.cat,
        mimeType: fmt.mime,
        fileName: `relatorio_exame.${fmt.ext}`,
        fileSize: 1024 * 50,
        patientId: patientId
      });

      assert(res.status === 200, `Ticket gerado para formato .${fmt.ext} (${fmt.mime}) com status 200`);
      assert(res.data && res.data.fileId, `Retornou fileId para .${fmt.ext}`);
      assert(res.data && res.data.uploadUrl, `Retornou uploadUrl para .${fmt.ext}`);
      assert(res.data && res.data.objectKey && res.data.objectKey.endsWith(`.${fmt.ext}`), `Preservou extensão .${fmt.ext} no objectKey: ${res.data.objectKey}`);

      generatedTickets.push({ ...fmt, ...res.data });
    }

    // Test rejection of disallowed format (e.g. .exe / application/x-msdownload)
    const rejectRes = await makeRequest('POST', '/api/v1/files/upload/ticket', headers, {
      category: 'external_tests',
      mimeType: 'application/x-msdownload',
      fileName: 'virus.exe',
      fileSize: 1024
    });
    assert(rejectRes.status === 400, 'Rejeitou formato não autorizado (.exe / application/x-msdownload) com status 400');

    console.log('\n💾 2. TESTE DE CONCLUSÃO DE UPLOAD COM METADADOS PROFISSIONAIS');

    const pdfTicket = generatedTickets.find(t => t.ext === 'pdf');
    const docxTicket = generatedTickets.find(t => t.ext === 'docx');
    const testUuid = uuidv4();

    const completeRes = await makeRequest('POST', '/api/v1/files/upload/complete', headers, {
      fileId: pdfTicket.fileId,
      patientId: patientId,
      category: 'external_tests',
      moduleType: 'ZemdaPsico',
      professionalId: professionalId,
      testId: testUuid,
      clientChecksum: 'abc123mock'
    });

    assert(completeRes.status === 200, 'Upload de PDF concluído com status 200');
    assert(completeRes.data && completeRes.data.file, 'Retornou objeto do arquivo');
    assert(completeRes.data.file.module_type === 'ZemdaPsico', 'Gravou module_type = ZemdaPsico no file_attachments');
    assert(completeRes.data.file.test_id === testUuid, 'Gravou test_id no file_attachments');
    assert(completeRes.data.file.professional_id === professionalId, 'Gravou professional_id no file_attachments');

    console.log('\n🌐 3. TESTE CRUD UNIVERSAL DE TESTES EXTERNOS EM TODOS OS MÓDULOS');

    const modulesToTest = [
      { mod: 'ZemdaPsico', cat: 'Teste/Instrumento Externo', name: 'Escala Beck de Depressão (BDI-II)', notes: 'Pontuação: 18 - Sintomas leves' },
      { mod: 'ZemdaFono', cat: 'Protocolo', name: 'Audiometria Tonal Liminar Externa', notes: 'Limiares auditivos dentro da normalidade' },
      { mod: 'ZemdaTO', cat: 'Protocolo', name: 'Medida de Independência Funcional (MIF)', notes: 'Escore motor 78/91' },
      { mod: 'ZemdaNutri', cat: 'Documento Externo', name: 'Exame de Sangue - Perfil Lipídico e Glicemia', notes: 'Glicemia de jejum 88 mg/dL, Colesterol normal' },
      { mod: 'ZemdaFisio', cat: 'Escala', name: 'Escala Visual Analógica de Dor (EVA) e DASH', notes: 'DASH 22 pontos' },
      { mod: 'ZemdaOdonto', cat: 'Documento Externo', name: 'Tomografia Computadorizada Cone Beam', notes: 'Região 36 e 46 para implante' },
      { mod: 'ZemdaPP', cat: 'Protocolo', name: 'Teste de Desempenho Escolar (TDE-II)', notes: 'Escrita e aritmética adequadas para série' },
      { mod: 'ZemdaPersonal', cat: 'Planilha de Resultados', name: 'Teste Ergoespirométrico e VO2 Máximo', notes: 'VO2 max = 46.5 ml/kg/min' }
    ];

    const createdTestIds = {};

    for (const item of modulesToTest) {
      const createRes = await makeRequest('POST', '/api/v1/external-tests', headers, {
        patientId: patientId,
        professionalId: professionalId,
        moduleType: item.mod,
        category: item.cat,
        testName: item.name,
        testDate: '2026-09-20',
        professionalName: 'Dra. Especialista Externa',
        referredBy: 'Clínica Parceira',
        resultSummary: item.notes,
        notes: `Observações adicionais para ${item.mod}`,
        fileId: docxTicket.fileId,
        fileName: 'laudo_completo.docx',
        fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileSize: 1024 * 40
      });

      assert(createRes.status === 200, `Criou teste externo para ${item.mod} com status 200`);
      assert(createRes.data && createRes.data.test && createRes.data.test.id, `Retornou ID do teste para ${item.mod}`);
      createdTestIds[item.mod] = createRes.data.test.id;

      // Consulta GET filtrada pelo módulo
      const listRes = await makeRequest('GET', `/api/v1/external-tests?patientId=${patientId}&moduleType=${item.mod}`, headers);
      assert(listRes.status === 200, `Listou testes de ${item.mod} com status 200`);
      assert(Array.isArray(listRes.data) && listRes.data.length >= 1, `Encontrou pelo menos 1 teste para ${item.mod}`);
      const found = listRes.data.find(t => t.id === createdTestIds[item.mod]);
      assert(found && found.test_name === item.name, `Registro recuperado confere com o nome cadastrado (${item.name})`);
      assert(found && found.file_url, `Retornou file_url assinado para download seguro`);
    }

    console.log('\n🔒 4. TESTE DE PROTEÇÃO DE ATENDIMENTO SELADO (is_sealed = 1)');

    // Cria um teste selado
    const sealedTestRes = await makeRequest('POST', '/api/v1/external-tests', headers, {
      patientId: patientId,
      moduleType: 'ZemdaPsico',
      category: 'Documento Externo',
      testName: 'Laudo Pericial Judicial Selado',
      testDate: '2026-09-15',
      professionalName: 'Perito Judicial',
      resultSummary: 'Conclusão pericial definitiva',
      isSealed: true
    });

    assert(sealedTestRes.status === 200, 'Criou teste com isSealed = true');
    const sealedTestId = sealedTestRes.data.test.id;

    // Tentar excluir teste selado deve retornar 403 Forbidden
    const deleteSealedRes = await makeRequest('DELETE', `/api/v1/external-tests/${sealedTestId}`, headers);
    assert(deleteSealedRes.status === 403, 'Bloqueou exclusão de teste selado com status 403');
    assert(deleteSealedRes.data && deleteSealedRes.data.error, 'Retornou mensagem de erro justificando prontuário selado');

    // Testar exclusão de teste não selado (deve retornar 200)
    const unsealedTestId = createdTestIds['ZemdaPsico'];
    const deleteUnsealedRes = await makeRequest('DELETE', `/api/v1/external-tests/${unsealedTestId}`, headers);
    assert(deleteUnsealedRes.status === 200, 'Exclusão de teste não selado autorizada com status 200');

    // Verificar se foi removido da lista
    const checkListRes = await makeRequest('GET', `/api/v1/external-tests?patientId=${patientId}&moduleType=ZemdaPsico`, headers);
    const stillExists = checkListRes.data.find(t => t.id === unsealedTestId);
    assert(!stillExists, 'Teste não selado foi devidamente removido do banco de dados');

    console.log('\n📊 RESUMO DOS TESTES UNIVERSAIS DE TESTES EXTERNOS:');
    console.log(`  Total Passaram: ${passedTests}`);
    console.log(`  Total Falharam: ${failedTests}`);

    if (failedTests > 0) {
      console.error('\n❌ ALGUNS TESTES FALHARAM!');
      process.exit(1);
    } else {
      console.log('\n🎉 TODOS OS TESTES PASSARAM COM SUCESSO!');
      process.exit(0);
    }

  } catch (err) {
    console.error('Erro na execução dos testes:', err);
    process.exit(1);
  } finally {
    server.close();
    if (fs.existsSync(process.env.DATABASE_PATH)) {
      try { fs.unlinkSync(process.env.DATABASE_PATH); } catch (_) {}
    }
  }
}

runTests();
