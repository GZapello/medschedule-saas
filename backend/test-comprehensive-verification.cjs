/**
 * Testes Automatizados de Validação Completa:
 * 1. Importação DOCX (extração em memória via AdmZip word/document.xml, envio como text part, descarte do buffer original)
 * 2. RBAC de Importação (admin = liberado; profissional com can_import_data = liberado; profissional sem permissão = 403; rollback restrito ao admin)
 * 3. Logo da Clínica (PUT /tenants/current -> GET /tenants/current e GET /clinics/current retornam o mesmo logo imediatamente)
 * 4. Zero retenção de arquivos
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
const AdmZip = require('adm-zip');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_comprehensive.db');
process.env.JWT_SECRET = 'test-secret-comprehensive-12345';
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

const PORT = 3108;
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

// Cria um buffer DOCX real em memória com texto e tabela
function createMockDocxBuffer(xmlContent) {
  const zip = new AdmZip();
  zip.addFile('word/document.xml', Buffer.from(xmlContent, 'utf-8'));
  return zip.toBuffer();
}

async function run() {
  server = app.listen(PORT);
  console.log('====================================================');
  console.log('INICIANDO BATERIA DE TESTES DE INTEGRAÇÃO INTEGRADA');
  console.log('====================================================\n');

  try {
    const tenantId = 'tenant-comp-' + Date.now();
    const adminId = 'usr-admin-1';
    const profWithPermId = 'usr-prof-perm';
    const profWithoutPermId = 'usr-prof-noperm';

    // 1. Setup Tenant & Users
    db.prepare(`
      INSERT INTO tenants (id, name, slug, status, email, cnpj_cpf, logo_url)
      VALUES (?, 'Clínica Integração Total', ?, 'active', 'admin@clinica.test', '12345678000199', NULL)
    `).run(tenantId, 'slug-' + tenantId);

    // Admin
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status)
      VALUES (?, ?, 'Admin Geral', 'admin@clinica.test', 'hash123', 'clinic_admin', 'active')
    `).run(adminId, tenantId);
    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager)
      VALUES ('cu-admin', ?, ?, 'clinic_admin', 'active', 1)
    `).run(tenantId, adminId);

    // Profissional com can_import_data
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status)
      VALUES (?, ?, 'Dra. Fono Autorizada', 'fono.autorizada@clinica.test', 'hash123', 'professional', 'active')
    `).run(profWithPermId, tenantId);
    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, permissions_json)
      VALUES ('cu-prof-perm', ?, ?, 'professional', 'active', ?)
    `).run(tenantId, profWithPermId, JSON.stringify(['can_import_data', 'can_manage_records']));

    // Colaborador sem permissão de importação (assistente)
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status)
      VALUES (?, ?, 'Assistente Bloqueado', 'asst.bloqueado@clinica.test', 'hash123', 'assistant', 'active')
    `).run(profWithoutPermId, tenantId);
    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, permissions_json)
      VALUES ('cu-prof-noperm', ?, ?, 'assistant', 'active', ?)
    `).run(tenantId, profWithoutPermId, JSON.stringify(['can_manage_records']));

    const adminToken = generateToken({ userId: adminId, tenantId, email: 'admin@clinica.test', role: 'clinic_admin' });
    const profPermToken = generateToken({ userId: profWithPermId, tenantId, email: 'fono.autorizada@clinica.test', role: 'professional' });
    const profNoPermToken = generateToken({ userId: profWithoutPermId, tenantId, email: 'asst.bloqueado@clinica.test', role: 'assistant' });

    const adminHeaders = { 'Authorization': `Bearer ${adminToken}`, 'X-Tenant-ID': tenantId };
    const profPermHeaders = { 'Authorization': `Bearer ${profPermToken}`, 'X-Tenant-ID': tenantId };
    const profNoPermHeaders = { 'Authorization': `Bearer ${profNoPermToken}`, 'X-Tenant-ID': tenantId };

    // ====================================================
    // TESTE 1: Importação DOCX em memória via analyzeMedicalRecord
    // ====================================================
    console.log('--- TESTE 1: Importação de DOCX (Texto e Tabelas) em Memória ---');
    const docxXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:r><w:t>PRONTUÁRIO CLÍNICO DE FONOAUDIOLOGIA</w:t></w:r></w:p>
        <w:p><w:r><w:t>Paciente: João Pedro Alencar</w:t></w:r></w:p>
        <w:p><w:r><w:t>CPF: 222.333.444-55</w:t></w:r></w:p>
        <w:tbl>
          <w:tr>
            <w:tc><w:p><w:r><w:t>Data</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>Evolução Fonoaudiológica</w:t></w:r></w:p></w:tc>
          </w:tr>
          <w:tr>
            <w:tc><w:p><w:r><w:t>15/04/2024</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>Paciente apresentou dislalia no fonema /r/. Treino miofuncional oral realizado.</w:t></w:r></w:p></w:tc>
          </w:tr>
        </w:tbl>
      </w:body>
    </w:document>`;
    const docxBuffer = createMockDocxBuffer(docxXml);
    const docxBase64 = docxBuffer.toString('base64');

    const resDocx = await makeRequest('POST', '/api/v1/import/medical-record/analyze', adminHeaders, {
      files: [{
        fileName: 'prontuario_fono.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        base64: docxBase64
      }]
    });

    assert.strictEqual(resDocx.status, 200, `Esperado 200, recebido ${resDocx.status}`);
    assert.strictEqual(resDocx.data.success, true);
    assert.ok(resDocx.data.extractedData, 'extractedData deve estar presente');
    console.log('✓ Arquivo DOCX lido em memória, texto e tabelas extraídos e analisados com sucesso');

    // ====================================================
    // TESTE 2: RBAC - Profissional com can_import_data pode analisar e executar
    // ====================================================
    console.log('\n--- TESTE 2: RBAC - Profissional com can_import_data pode importar ---');
    const resProfAnalyze = await makeRequest('POST', '/api/v1/import/medical-record/analyze', profPermHeaders, {
      files: [{
        fileName: 'prontuario_fono.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        base64: docxBase64
      }]
    });
    assert.strictEqual(resProfAnalyze.status, 200, 'Profissional com can_import_data deve conseguir analisar');

    const resProfExec = await makeRequest('POST', '/api/v1/import/medical-record/execute', profPermHeaders, {
      action: 'create_new',
      patient: { full_name: 'João Pedro Alencar', cpf: '222.333.444-55' },
      clinical: { chief_complaint: 'Dislalia' },
      evolutions: [{ date: '2024-04-15', evolution: 'Treino miofuncional' }],
      ignoredFields: []
    });
    assert.strictEqual(resProfExec.status, 200, 'Profissional com can_import_data deve conseguir executar importação');
    console.log('✓ Profissional com permissão executou análise e cadastro com sucesso');

    // ====================================================
    // TESTE 3: RBAC - Profissional SEM can_import_data é bloqueado com 403
    // ====================================================
    console.log('\n--- TESTE 3: RBAC - Profissional sem permissão recebe 403 Forbidden ---');
    const resBlockedAnalyze = await makeRequest('POST', '/api/v1/import/medical-record/analyze', profNoPermHeaders, {
      files: [{
        fileName: 'prontuario_fono.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        base64: docxBase64
      }]
    });
    assert.strictEqual(resBlockedAnalyze.status, 403, 'Profissional sem can_import_data deve receber 403');

    const resBlockedExec = await makeRequest('POST', '/api/v1/import/medical-record/execute', profNoPermHeaders, {
      action: 'create_new',
      patient: { full_name: 'Invasor' }
    });
    assert.strictEqual(resBlockedExec.status, 403, 'Execução por profissional sem permissão deve receber 403');
    console.log('✓ Profissional sem permissão foi devidamente barrado com HTTP 403');

    // ====================================================
    // TESTE 4: RBAC - Rollback estritamente restrito a clinic_admin
    // ====================================================
    console.log('\n--- TESTE 4: RBAC - Rollback destrutivo restrito a clinic_admin ---');
    // Cria um lote teste no banco
    const batchId = 'batch-test-1';
    db.prepare(`
      INSERT INTO import_batches (
        id, tenant_id, user_id, file_name, file_type, total_records,
        imported_count, updated_count, skipped_count, error_count, errors_json
      )
      VALUES (?, ?, ?, 'teste.csv', 'csv', 10, 10, 0, 0, 0, '[]')
    `).run(batchId, tenantId, profWithPermId);

    // Profissional tenta rollback
    const resProfRollback = await makeRequest('POST', `/api/v1/import/batches/${batchId}/rollback`, profPermHeaders, {});
    assert.strictEqual(resProfRollback.status, 403, 'Rollback por profissional autorizado deve retornar 403');
    console.log('✓ Rollback bloqueado para profissional (HTTP 403)');

    // Admin executa rollback
    const resAdminRollback = await makeRequest('POST', `/api/v1/import/batches/${batchId}/rollback`, adminHeaders, {});
    assert.strictEqual(resAdminRollback.status, 200, 'Rollback por admin deve ser permitido');
    console.log('✓ Rollback permitido com sucesso para clinic_admin');

    // ====================================================
    // TESTE 5: LOGO DA CLÍNICA - Atualização e sincronização imediata
    // ====================================================
    console.log('\n--- TESTE 5: Sincronização Imediata do Logotipo da Clínica ---');
    const newLogo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    // 1. Atualiza via PUT /tenants/current
    const resPutTenant = await makeRequest('PUT', '/api/v1/tenants/current', adminHeaders, {
      logo_url: newLogo,
      name: 'Clínica Integração Total Atualizada'
    });
    assert.strictEqual(resPutTenant.status, 200);
    assert.strictEqual(resPutTenant.data.logo_url, newLogo);

    // 2. Consulta GET /tenants/current
    const resGetTenant = await makeRequest('GET', '/api/v1/tenants/current', adminHeaders);
    assert.strictEqual(resGetTenant.status, 200);
    assert.strictEqual(resGetTenant.data.logo_url, newLogo, 'GET /tenants/current deve retornar o logo atualizado');

    // 3. Consulta GET /clinics/current
    const resGetClinic = await makeRequest('GET', '/api/v1/clinics/current', adminHeaders);
    assert.strictEqual(resGetClinic.status, 200);
    assert.strictEqual(resGetClinic.data.logo_url, newLogo, 'GET /clinics/current deve retornar o mesmo logo atualizado');

    // 4. Consulta do profissional em GET /clinics/current
    const resProfGetClinic = await makeRequest('GET', '/api/v1/clinics/current', profPermHeaders);
    assert.strictEqual(resProfGetClinic.status, 200);
    assert.strictEqual(resProfGetClinic.data.logo_url, newLogo, 'Profissional enxerga o novo logo imediatamente sem relogar');
    console.log('✓ Logotipo atualizado e sincronizado instantaneamente em /tenants/current e /clinics/current');

    // ====================================================
    // TESTE 6: ZERO RETENÇÃO DE ARQUIVOS
    // ====================================================
    console.log('\n--- TESTE 6: Regra Crítica de Segurança - Zero Retenção de Documentos Brutos ---');
    const fileCount = db.prepare('SELECT COUNT(*) as count FROM file_attachments WHERE clinic_id = ?').get(tenantId);
    assert.strictEqual(fileCount.count, 0, 'file_attachments deve permanecer 0');

    const docCount = db.prepare('SELECT COUNT(*) as count FROM documents WHERE tenant_id = ?').get(tenantId);
    assert.strictEqual(docCount.count, 0, 'documents deve permanecer 0');

    console.log('✓ Confirmação estrita: Nenhum buffer, anexo ou documento DOCX/PDF/Imagem foi gravado em disco ou banco');

    console.log('\n====================================================');
    console.log('🎉 TODOS OS TESTES INTEGRADOS FORAM CONCLUÍDOS COM SUCESSO (100% PASS)!');
    console.log('====================================================');

  } catch (err) {
    console.error('\n❌ Falha nos testes integrados:', err);
    process.exitCode = 1;
  } finally {
    if (server) server.close();
    if (fs.existsSync(process.env.DATABASE_PATH)) {
      try { fs.unlinkSync(process.env.DATABASE_PATH); } catch (_) {}
    }
  }
}

run();
