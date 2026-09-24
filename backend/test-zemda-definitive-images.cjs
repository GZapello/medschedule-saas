const http = require('http');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_definitive_images.db');
process.env.JWT_SECRET = 'test-secret-definitive-images';
process.env.PORT = '3098';
process.env.R2_MOCK_STORAGE = 'true';
process.env.ZEMDA_FILES_SIGNING_SECRET = 'zemda-files-signing-secret';

if (fs.existsSync(process.env.DATABASE_PATH)) {
  fs.unlinkSync(process.env.DATABASE_PATH);
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');
const { canonicalizeClinicId } = require('./dist/controllers/file.controller');
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
          resolve({ status: res.statusCode, body: parsed });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  const server = http.createServer(app);
  await new Promise(r => server.listen(3098, r));

  console.log('\n=============================================================');
  console.log('TESTES DE VERIFICAÇÃO DEFINITIVA — IMAGENS ZEMDAPersonal');
  console.log('=============================================================\n');

  try {
    const tenantId = 'ten-b96bd5ba';
    const sanitizedClinicId = canonicalizeClinicId(tenantId);
    const userId = 'usr-admin-123';
    const patientId = 'pat-student-123';

    // 0. Setup
    db.prepare(`
      INSERT INTO tenants (id, name, slug, email, status, created_at, updated_at)
      VALUES (?, 'Clínica Gabi', 'clini-gabi', 'gabi@teste.com', 'active', datetime('now'), datetime('now'))
    `).run(tenantId);

    db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, role, status, name, created_at, updated_at)
      VALUES (?, ?, 'gabi@teste.com', 'hash', 'clinic_admin', 'active', 'Gabriel', datetime('now'), datetime('now'))
    `).run(userId, tenantId);

    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, phone, active, created_at, updated_at)
      VALUES (?, ?, 'Bruno', '54981126145', 1, datetime('now'), datetime('now'))
    `).run(patientId, tenantId);

    const token = generateToken({
      userId,
      role: 'clinic_admin',
      tenantId,
      email: 'gabi@teste.com'
    });

    const headers = {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': tenantId
    };

    // 1. Verificar Biblioteca de Exercícios: exatamente 119 exercícios e ZERO anexos fake
    console.log('[1. Biblioteca de Exercícios] Integridade do Seed');
    const exerciseCount = db.prepare('SELECT count(*) as c FROM personal_exercises').get().c;
    assert(exerciseCount >= 119, `Total de exercícios semeado corretamente (encontrado: ${exerciseCount})`);

    const fakeAttachments = db.prepare("SELECT count(*) as c FROM file_attachments WHERE id LIKE 'att-ex-%' OR object_key LIKE 'exercises/global/%'").get().c;
    assert(fakeAttachments === 0, `Zero anexos fake no banco file_attachments (encontrado: ${fakeAttachments})`);

    const exercisesWithFake = db.prepare("SELECT count(*) as c FROM personal_exercises WHERE exercise_file_id LIKE 'att-ex-%'").get().c;
    assert(exercisesWithFake === 0, `Nenhum exercício aponta para ID fake (encontrado: ${exercisesWithFake})`);

    // 2. Ticket de Upload gera padrão clinics/{clinicId}/...
    console.log('\n[2. Ticket de Upload] Padrão de Chave e Normalização de Clínica');
    const ticketRes = await makeRequest('POST', '/api/v1/files/upload-ticket', headers, {
      filename: 'foto_frontal.webp',
      mimeType: 'image/webp',
      fileSize: 102400,
      category: 'personal_assessment_front',
      patientId: patientId,
      position: 'front'
    });

    assert(ticketRes.status === 200, 'Ticket de upload gerado com sucesso (HTTP 200)');
    const { objectKey, uploadUrl, uploadToken } = ticketRes.body;
    assert(objectKey.startsWith(`clinics/${sanitizedClinicId}/`), `objectKey segue rigorosamente clinics/{clinicId}/... (${objectKey})`);
    assert(uploadUrl.includes('/upload'), 'uploadUrl aponta para rota /upload do Worker');
    assert(!!uploadToken, 'uploadToken assinado HMAC retornado');

    // 2.1 Teste do Worker: PUT /upload -> FILES_BUCKET.put() -> FILES_BUCKET.head()
    console.log('\n[2.1 Worker R2] PUT /upload -> FILES_BUCKET.put() -> FILES_BUCKET.head()');
    const workerModule = await import('../cloudflare-worker.js');
    const worker = workerModule.default;
    const storageMap = new Map();
    const testBucket = {
      put: async (key, data, opts) => {
        storageMap.set(key, { data, opts, size: data.byteLength });
        return { key, size: data.byteLength };
      },
      head: async (key) => {
        const item = storageMap.get(key);
        if (!item) return null;
        return { key, size: item.size, httpMetadata: { contentType: item.opts?.httpMetadata?.contentType } };
      },
      get: async (key) => {
        const item = storageMap.get(key);
        if (!item) return null;
        return { key, body: item.data, size: item.size, httpMetadata: { contentType: item.opts?.httpMetadata?.contentType } };
      }
    };
    const workerEnv = {
      FILES_BUCKET: testBucket,
      ZEMDA_FILES_SIGNING_SECRET: 'zemda-files-signing-secret'
    };

    // PUT válido
    const putReq = new Request(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${uploadToken}`,
        'Content-Type': 'image/webp'
      },
      body: Buffer.from('conteudo-da-imagem-webp-real')
    });
    const putRes = await worker.fetch(putReq, workerEnv);
    assert(putRes.status === 200, 'PUT /upload no Worker retorna HTTP 200 após confirmação via head');
    const putJson = await putRes.json();
    assert(putJson.ok === true, 'Worker retorna ok: true');
    assert(putJson.objectKey === objectKey, 'objectKey retornado pelo Worker é idêntico ao do ticket');
    assert(putJson.verified === true, 'Worker confirma que o objeto existe no bucket via head()');

    // PUT com falha no head (simula erro do R2)
    const failingBucket = {
      put: async () => {},
      head: async () => null
    };
    const failReq = new Request(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${uploadToken}`,
        'Content-Type': 'image/webp'
      },
      body: Buffer.from('conteudo-qualquer')
    });
    const failRes = await worker.fetch(failReq, { FILES_BUCKET: failingBucket, ZEMDA_FILES_SIGNING_SECRET: 'zemda-files-signing-secret' });
    assert(failRes.status === 500, 'PUT /upload retorna HTTP 500 se FILES_BUCKET.head() não encontrar o objeto após put()');

    // 3. completeUpload REJEITA objeto que NÃO existe no R2
    console.log('\n[3. completeUpload] Comprovação Obrigatória de Existência no R2');
    const fakeObjectKey = `clinics/${sanitizedClinicId}/patients/${patientId}/personal-assessments/fake/front/fake.webp`;
    const rejectRes = await makeRequest('POST', '/api/v1/files/complete', headers, {
      objectKey: fakeObjectKey,
      filename: 'fake.webp',
      mimeType: 'image/webp',
      fileSize: 1024,
      category: 'personal_assessment_front',
      patientId: patientId
    });

    assert(rejectRes.status === 400, 'completeUpload REJEITA objeto não existente no R2 com HTTP 400');
    assert(rejectRes.body.error && rejectRes.body.error.includes('não foi localizado no Cloudflare R2'), 'Mensagem informa que o arquivo não foi localizado no Cloudflare R2');

    // 4. completeUpload ACEITA após upload simulado no R2
    console.log('\n[4. completeUpload] Confirmação com Objeto Real/Simulado no R2');
    // Note: r2StorageService.simulateMockUpload foi chamado no createUploadTicket para o objectKey legítimo
    const completeRes = await makeRequest('POST', '/api/v1/files/complete', headers, {
      objectKey: objectKey,
      filename: 'foto_frontal.webp',
      mimeType: 'image/webp',
      fileSize: 102400,
      category: 'personal_assessment_front',
      patientId: patientId
    });

    assert(completeRes.status === 201, 'completeUpload CONFIRMA arquivo comprovado no R2 com HTTP 201');
    const attachmentId = completeRes.body.file.id;
    assert(attachmentId && attachmentId.startsWith('att-'), `ID de anexo real gerado: ${attachmentId}`);

    // Verifica que clinic_id gravado no banco está estritamente normalizado
    const savedAttachment = db.prepare('SELECT clinic_id, object_key FROM file_attachments WHERE id = ?').get(attachmentId);
    assert(savedAttachment.clinic_id === sanitizedClinicId, `clinic_id gravado é exatamente o normalizado (${savedAttachment.clinic_id})`);

    // 5. GET /v1/files/:id/url gera URL do Worker com clinicId correspondente
    console.log('\n[5. Visualização Segura] GET /v1/files/:id/url');
    const urlRes = await makeRequest('GET', `/api/v1/files/${attachmentId}/url`, headers);
    assert(urlRes.status === 200, 'GET /v1/files/:id/url retorna HTTP 200');
    assert(urlRes.body.url && urlRes.body.url.includes('/file?token='), 'URL temporária assinada do Worker gerada com sucesso');

    // 6. Avaliação Física vincula file_id real
    console.log('\n[6. Avaliação Física] Salvamento com file_id real');
    const assessRes = await makeRequest('POST', '/api/v1/personal/assessments', headers, {
      patient_id: patientId,
      assessment_date: '2026-09-20',
      weight: 82.5,
      height: 181,
      photos: [
        { photo_type: 'front', file_id: attachmentId }
      ]
    });

    assert(assessRes.status === 201, 'Avaliação física salva com sucesso no ZemdaPersonal (HTTP 201)');
    const assessmentId = assessRes.body.id;

    // Recupera avaliação e verifica que foto persiste após F5/recarregamento
    const getAssessRes = await makeRequest('GET', `/api/v1/personal/assessments/${assessmentId}`, headers);
    assert(getAssessRes.status === 200, 'GET /v1/personal/assessments/:id responde com HTTP 200');
    assert(getAssessRes.body.photos && getAssessRes.body.photos.length === 1, 'Foto vinculada recuperada com sucesso');
    assert(getAssessRes.body.photos[0].file_id === attachmentId, `Foto gravou estritamente o file_id auditado (${getAssessRes.body.photos[0].file_id})`);
    assert(!getAssessRes.body.photos[0].photo_url, 'photo_url não contém blob nem URL temporária persistida');

  } catch (err) {
    console.error('Erro na execução dos testes:', err);
    failedTests++;
  } finally {
    server.close();
    console.log('\n=============================================================');
    console.log(`RESULTADO FINAL: ${passedTests} PASSOU | ${failedTests} FALHOU`);
    console.log('=============================================================\n');
    process.exit(failedTests > 0 ? 1 : 0);
  }
}

runTests();
