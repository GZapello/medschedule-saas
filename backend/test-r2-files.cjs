const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_r2_storage.db');
process.env.JWT_SECRET = 'test-secret-r2-files-123';
process.env.PORT = '3099';
process.env.R2_MOCK_STORAGE = 'true'; // Garante ambiente de teste offline confiável

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
      port: 3099,
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
  const server = http.createServer(app);
  await new Promise(r => server.listen(3099, r));

  console.log('\n====================================================');
  console.log('INICIANDO TESTES OBRIGATÓRIOS: CLOUDFLARE R2 STORAGE');
  console.log('====================================================\n');

  try {
    // 0. SETUP: Criar Tenants e Usuários de teste
    const tenantA = 'tenant-r2-clinica-a';
    const tenantB = 'tenant-r2-clinica-b';

    db.prepare(`
      INSERT INTO tenants (id, name, slug, email, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
    `).run(tenantA, 'Clínica A', 'clinica-a', 'clinicaa@zemda.com.br');

    db.prepare(`
      INSERT INTO tenants (id, name, slug, email, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
    `).run(tenantB, 'Clínica B', 'clinica-b', 'clinicab@zemda.com.br');

    const userA = 'user-prof-a';
    const userB = 'user-prof-b';

    db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, role, status, name, created_at, updated_at)
      VALUES (?, ?, 'profa@clinicaa.com', 'hash', 'professional', 'active', 'Dra. Alice', datetime('now'), datetime('now'))
    `).run(userA, tenantA);

    db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, role, status, name, created_at, updated_at)
      VALUES (?, ?, 'profb@clinicab.com', 'hash', 'professional', 'active', 'Dr. Bob', datetime('now'), datetime('now'))
    `).run(userB, tenantB);

    const tokenA = generateToken({ userId: userA, tenantId: tenantA, role: 'professional' });
    const tokenB = generateToken({ userId: userB, tenantId: tenantB, role: 'professional' });

    // Paciente da Clínica A
    const patientA = 'patient-teste-a';
    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, email, phone, active, created_at, updated_at)
      VALUES (?, ?, 'Paciente da Clínica A', 'pacientea@teste.com', '11999991111', 1, datetime('now'), datetime('now'))
    `).run(patientA, tenantA);

    // Paciente da Clínica B
    const patientB = 'patient-teste-b';
    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, email, phone, active, created_at, updated_at)
      VALUES (?, ?, 'Paciente da Clínica B', 'pacienteb@teste.com', '11999992222', 1, datetime('now'), datetime('now'))
    `).run(patientB, tenantB);

    const authHeaderA = {
      'Authorization': `Bearer ${tokenA}`,
      'X-Tenant-ID': tenantA
    };

    const authHeaderB = {
      'Authorization': `Bearer ${tokenB}`,
      'X-Tenant-ID': tenantB
    };

    // -------------------------------------------------------------
    // TESTE 1: UPLOAD JPG
    // -------------------------------------------------------------
    console.log('--- 1. UPLOAD JPG ---');
    const resJpgUrl = await makeRequest('POST', '/api/files/upload-url', authHeaderA, {
      patientId: patientA,
      category: 'exames',
      filename: 'foto_exame_1.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1024 * 500 // 500 KB
    });

    assert(resJpgUrl.status === 200, 'Geração de URL de upload para JPEG retorna HTTP 200');
    assert(!!resJpgUrl.data.uploadUrl, 'uploadUrl assinado gerado com sucesso');
    assert(resJpgUrl.data.objectKey.startsWith(`clinics/${tenantA}/patients/${patientA}/exames/`), 'objectKey possui estrutura anônima e padronizada');
    assert(resJpgUrl.data.objectKey.endsWith('.jpg') || resJpgUrl.data.objectKey.endsWith('.jpeg'), 'objectKey preserva extensão de imagem');
    assert(!resJpgUrl.data.objectKey.includes('Paciente'), 'objectKey NUNCA contém dados pessoais do paciente');

    const jpgComplete = await makeRequest('POST', '/api/files/complete', authHeaderA, {
      objectKey: resJpgUrl.data.objectKey,
      patientId: patientA,
      category: 'exames',
      filename: 'foto_exame_1.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1024 * 500
    });

    assert(jpgComplete.status === 201, 'Confirmação do upload JPG retorna HTTP 201');
    assert(jpgComplete.data.success === true, 'Upload JPG confirmado com sucesso');
    const jpgAttachmentId = jpgComplete.data.file.id;
    assert(!!jpgAttachmentId, 'ID de anexo gerado');
    assert(jpgComplete.data.file.storage_provider === 'cloudflare_r2', 'storage_provider registrado como cloudflare_r2');

    // -------------------------------------------------------------
    // TESTE 2: UPLOAD PNG
    // -------------------------------------------------------------
    console.log('\n--- 2. UPLOAD PNG ---');
    const resPngUrl = await makeRequest('POST', '/api/files/upload-url', authHeaderA, {
      patientId: patientA,
      category: 'evolucao',
      filename: 'postura_lateral.png',
      mimeType: 'image/png',
      fileSize: 1024 * 800 // 800 KB
    });

    assert(resPngUrl.status === 200, 'Geração de URL de upload para PNG retorna HTTP 200');
    assert(resPngUrl.data.objectKey.endsWith('.png'), 'objectKey preserva extensão PNG');

    const pngComplete = await makeRequest('POST', '/api/files/complete', authHeaderA, {
      objectKey: resPngUrl.data.objectKey,
      patientId: patientA,
      category: 'evolucao',
      filename: 'postura_lateral.png',
      mimeType: 'image/png',
      fileSize: 1024 * 800
    });

    assert(pngComplete.status === 201, 'Confirmação do upload PNG retorna HTTP 201');
    assert(pngComplete.data.file.mime_type === 'image/png', 'Mime type registrado é image/png');
    const pngAttachmentId = pngComplete.data.file.id;

    // -------------------------------------------------------------
    // TESTE 3: UPLOAD WEBP
    // -------------------------------------------------------------
    console.log('\n--- 3. UPLOAD WEBP ---');
    const resWebpUrl = await makeRequest('POST', '/api/files/upload-url', authHeaderA, {
      patientId: patientA,
      category: 'zemdabody',
      filename: 'vista_frontal.webp',
      mimeType: 'image/webp',
      fileSize: 1024 * 250 // 250 KB
    });

    assert(resWebpUrl.status === 200, 'Geração de URL de upload para WebP retorna HTTP 200');
    assert(resWebpUrl.data.objectKey.endsWith('.webp'), 'objectKey preserva extensão WebP');

    const webpComplete = await makeRequest('POST', '/api/files/complete', authHeaderA, {
      objectKey: resWebpUrl.data.objectKey,
      patientId: patientA,
      category: 'zemdabody',
      filename: 'vista_frontal.webp',
      mimeType: 'image/webp',
      fileSize: 1024 * 250
    });

    assert(webpComplete.status === 201, 'Confirmação do upload WebP retorna HTTP 201');
    assert(webpComplete.data.file.category === 'zemdabody', 'Categoria zemdabody persistida');
    const webpAttachmentId = webpComplete.data.file.id;

    // -------------------------------------------------------------
    // TESTE 4: REJEIÇÃO DE ARQUIVO > 10 MB
    // -------------------------------------------------------------
    console.log('\n--- 4. REJEIÇÃO DE ARQUIVO > 10 MB ---');
    const resOversize = await makeRequest('POST', '/api/files/upload-url', authHeaderA, {
      patientId: patientA,
      category: 'exames',
      filename: 'imagem_gigante.jpg',
      mimeType: 'image/jpeg',
      fileSize: 11 * 1024 * 1024 // 11 MB (> 10 MB)
    });

    assert(resOversize.status === 400, 'Tentativa de upload de arquivo > 10 MB retorna HTTP 400');
    assert(resOversize.data.error.includes('10 MB'), 'Mensagem informa limite máximo de 10 MB');

    // -------------------------------------------------------------
    // TESTE 5: REJEIÇÃO DE TIPO NÃO PERMITIDO
    // -------------------------------------------------------------
    console.log('\n--- 5. REJEIÇÃO DE TIPO NÃO PERMITIDO ---');
    const resInvalidType = await makeRequest('POST', '/api/files/upload-url', authHeaderA, {
      patientId: patientA,
      category: 'documentos',
      filename: 'arquivo_executavel.exe',
      mimeType: 'application/x-msdownload',
      fileSize: 1024 * 50
    });

    assert(resInvalidType.status === 400, 'Tentativa de upload de tipo não permitido retorna HTTP 400');
    assert(resInvalidType.data.error.includes('JPEG, PNG ou WebP'), 'Mensagem informa apenas tipos de imagem aceitos');

    // -------------------------------------------------------------
    // TESTE 6: VISUALIZAÇÃO DA IMAGEM
    // -------------------------------------------------------------
    console.log('\n--- 6. VISUALIZAÇÃO DA IMAGEM ---');
    const resView = await makeRequest('GET', `/api/files/${jpgAttachmentId}/url`, authHeaderA);

    assert(resView.status === 200, 'Consulta de URL de visualização retorna HTTP 200');
    assert(!!resView.data.url, 'Retorna URL assinada temporária para visualização');
    assert(resView.data.filename === 'foto_exame_1.jpg', 'Nome original do arquivo retornado');
    assert(resView.data.mimeType === 'image/jpeg', 'Mime type retornado');

    // -------------------------------------------------------------
    // TESTE 7: EXCLUSÃO DA IMAGEM
    // -------------------------------------------------------------
    console.log('\n--- 7. EXCLUSÃO DA IMAGEM ---');
    const resDelete = await makeRequest('DELETE', `/api/files/${pngAttachmentId}`, authHeaderA);

    assert(resDelete.status === 200, 'Exclusão de anexo retorna HTTP 200');
    assert(resDelete.data.success === true, 'Flag success é true na exclusão');

    // Consulta do arquivo excluído deve falhar com 404
    const resViewDeleted = await makeRequest('GET', `/api/files/${pngAttachmentId}/url`, authHeaderA);
    assert(resViewDeleted.status === 404, 'Arquivo excluído não pode mais ser consultado (HTTP 404)');

    // -------------------------------------------------------------
    // TESTE 8: TENTATIVA DE ACESSO POR USUÁRIO DE OUTRA CLÍNICA
    // -------------------------------------------------------------
    console.log('\n--- 8. TENTATIVA DE ACESSO POR OUTRA CLÍNICA ---');
    // Usuário B da Clínica B tenta visualizar anexo da Clínica A
    const resCrossClinicView = await makeRequest('GET', `/api/files/${jpgAttachmentId}/url`, authHeaderB);
    assert(resCrossClinicView.status === 404, 'Usuário de outra clínica é estritamente bloqueado ao tentar visualizar arquivo (HTTP 404)');

    // Usuário B da Clínica B tenta excluir anexo da Clínica A
    const resCrossClinicDelete = await makeRequest('DELETE', `/api/files/${jpgAttachmentId}`, authHeaderB);
    assert(resCrossClinicDelete.status === 404, 'Usuário de outra clínica é estritamente bloqueado ao tentar excluir arquivo (HTTP 404)');

    // Usuário B tenta gerar uploadUrl para paciente da Clínica A
    const resCrossPatientUpload = await makeRequest('POST', '/api/files/upload-url', authHeaderB, {
      patientId: patientA, // paciente da clínica A!
      category: 'exames',
      filename: 'invasao.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1024 * 100
    });
    assert(resCrossPatientUpload.status === 404, 'Usuário de outra clínica não pode solicitar upload para paciente alheio (HTTP 404)');

    // -------------------------------------------------------------
    // TESTE 9: EXPIRAÇÃO DA URL ASSINADA
    // -------------------------------------------------------------
    console.log('\n--- 9. EXPIRAÇÃO DA URL ASSINADA ---');
    const resExp = await makeRequest('GET', `/api/files/${jpgAttachmentId}/url`, authHeaderA);

    assert(resExp.status === 200, 'Consulta de URL assinada retorna HTTP 200');
    assert(resExp.data.expiresIn === 300, 'Expiração padrão configurada estritamente para 300 segundos (5 minutos)');
    assert(resExp.data.url.includes('Expires=300') || resExp.data.url.includes('300'), 'URL assinada contém parâmetro de expiração temporal');

    // -------------------------------------------------------------
    // TESTE 10: COMPATIBILIDADE COM URLS ANTIGAS
    // -------------------------------------------------------------
    console.log('\n--- 10. COMPATIBILIDADE COM URLS ANTIGAS ---');
    const legacyAttachmentId = 'att-legacy-photo-123';
    const legacyExternalUrl = 'https://res.cloudinary.com/zemda/image/upload/v1600000000/foto_antiga_paciente.jpg';

    db.prepare(`
      INSERT INTO file_attachments (
        id, clinic_id, patient_id, appointment_id, uploaded_by,
        storage_provider, object_key, original_filename, mime_type,
        file_size, category, created_at, updated_at
      ) VALUES (?, ?, ?, null, ?, 'legacy_url', ?, 'foto_antiga.jpg', 'image/jpeg', 102400, 'prontuario', datetime('now'), datetime('now'))
    `).run(
      legacyAttachmentId,
      tenantA,
      patientA,
      userA,
      legacyExternalUrl
    );

    const resLegacy = await makeRequest('GET', `/api/files/${legacyAttachmentId}/url`, authHeaderA);
    assert(resLegacy.status === 200, 'Consulta de anexo legado retorna HTTP 200');
    assert(resLegacy.data.url === legacyExternalUrl, 'Retorna exatamente a URL externa original sem quebras');
    assert(resLegacy.data.expiresIn === null, 'expiresIn é null para URLs externas pré-existentes');

    console.log('\n====================================================');
    console.log(`RESULTADO DOS TESTES: ${passedTests} PASSOU, ${failedTests} FALHOU`);
    console.log('====================================================\n');

  } finally {
    server.close();
    if (fs.existsSync(process.env.DATABASE_PATH)) {
      try { fs.unlinkSync(process.env.DATABASE_PATH); } catch (_) {}
    }
  }

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro fatal nos testes:', err);
  process.exit(1);
});
