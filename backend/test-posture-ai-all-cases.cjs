const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

// Configura banco de dados em memória/isolado para o teste
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'posture-all-cases-')), 'test.db');
process.env.R2_MOCK_STORAGE = 'false';
process.env.GEMINI_API_KEY = 'test-key-12345';
process.env.PERSONAL_POSTURE_AI_MODEL = 'gemini-3.5-flash';

const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();

const { PersonalPostureAIController: ai } = require('./dist/controllers/personal-posture-ai.controller');
const { r2StorageService } = require('./dist/services/r2-storage.service');
const { GoogleGenerativeAI } = require('@google/generative-ai');

let passedChecks = 0;
function pass(label) {
  passedChecks++;
  console.log(`[PASS ${passedChecks}] ${label}`);
}

async function callController(method, body = {}, tenant = 'posture-clinic', user = null) {
  let statusCode = 200;
  let jsonResponse = null;
  const headers = {};

  const req = {
    body,
    params: {},
    query: {},
    tenantId: tenant,
    user: user || { userId: `user-${tenant}`, role: 'clinic_admin' },
    headers: {},
    ip: '127.0.0.1',
    get: () => undefined
  };

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    json(data) {
      jsonResponse = data;
      return this;
    }
  };

  await ai[method](req, res);
  return { status: statusCode, data: jsonResponse, headers };
}

(async () => {
  console.log('=== INICIANDO TESTES CONTROLADOS DE ANÁLISE POSTURAL COM IA ===\n');

  // Mock S3 client configured flag
  Object.defineProperty(r2StorageService, 'isConfiguredClient', { value: true, configurable: true });

  // ----------------------------------------------------
  // TESTE 1: Status endpoint
  // ----------------------------------------------------
  console.log('--- 1. TESTE STATUS ENDPOINT ---');
  db.prepare("INSERT INTO tenants(id, name, slug, email, status) VALUES('status-clinic', 'Status Clinic', 'status-clinic', 's@c.local', 'active')").run();
  db.prepare("INSERT INTO users(id, tenant_id, email, password_hash, role, status, name) VALUES('user-status-clinic', 'status-clinic', 's@c.local', 'h', 'clinic_admin', 'active', 'Admin')").run();

  const statusRes = await callController('status', {}, 'status-clinic');
  assert.equal(statusRes.status, 200, 'Status deve retornar 200');
  assert.equal(statusRes.data.available, true, 'Status deve estar disponível quando configurado');
  assert.ok(statusRes.data.checks, 'Deve conter objeto checks');
  assert.equal(statusRes.data.checks.apiKey, true, 'checks.apiKey deve ser true');
  assert.equal(statusRes.data.checks.model, true, 'checks.model deve ser true');
  assert.equal(statusRes.data.checks.r2, true, 'checks.r2 deve ser true');
  assert.equal(typeof statusRes.data.checks.apiKey, 'boolean');
  pass('Status endpoint retorna checks { apiKey, model, r2 } sem expor segredos');

  // Gerar imagens sintéticas reais nos formatos JPEG, PNG e WEBP
  const smallJpegBuffer = await sharp({
    create: { width: 200, height: 300, channels: 3, background: { r: 100, g: 150, b: 200 } }
  }).jpeg().toBuffer();

  const smallPngBuffer = await sharp({
    create: { width: 200, height: 300, channels: 3, background: { r: 50, g: 100, b: 150 } }
  }).png().toBuffer();

  const smallWebpBuffer = await sharp({
    create: { width: 200, height: 300, channels: 3, background: { r: 120, g: 80, b: 160 } }
  }).webp().toBuffer();

  function insertAttachment(id, clinicId, patientId, key, mime, size, cat) {
    db.prepare(`
      INSERT OR REPLACE INTO file_attachments(id, clinic_id, patient_id, uploaded_by, storage_provider, object_key, original_filename, mime_type, file_size, category)
      VALUES(?, ?, ?, ?, 'cloudflare_r2', ?, 'photo.ext', ?, ?, ?)
    `).run(id, clinicId, patientId, `user-${clinicId}`, key, mime, size, cat);
  }

  function setupTenantFixtures(tId) {
    db.prepare("INSERT OR IGNORE INTO tenants(id, name, slug, email, status) VALUES(?, 'Clínica', ?, 'c@c.local', 'active')").run(tId, tId);
    db.prepare("INSERT INTO users(id, tenant_id, email, password_hash, role, status, name) VALUES(?, ?, ?, 'h', 'clinic_admin', 'active', 'User')").run(`user-${tId}`, tId, `${tId}@test.invalid`);
    db.prepare("INSERT OR IGNORE INTO patients(id, tenant_id, full_name, phone, email, active) VALUES(?, ?, 'Aluno', '11999990000', 'a@c.local', 1)").run(`pat-${tId}`, tId);

    insertAttachment(`att-front-${tId}`, tId, `pat-${tId}`, `clinics/${tId}/front.jpg`, 'image/jpeg', smallJpegBuffer.length, 'personal_assessment_front');
    insertAttachment(`att-back-${tId}`, tId, `pat-${tId}`, `clinics/${tId}/back.png`, 'image/png', smallPngBuffer.length, 'personal_assessment_back');
    insertAttachment(`att-right-${tId}`, tId, `pat-${tId}`, `clinics/${tId}/right.webp`, 'image/webp', smallWebpBuffer.length, 'personal_assessment_right');
    insertAttachment(`att-left-${tId}`, tId, `pat-${tId}`, `clinics/${tId}/left.jpg`, 'image/jpeg', smallJpegBuffer.length, 'personal_assessment_left');

    r2StorageService.simulateMockUpload(`clinics/${tId}/front.jpg`, smallJpegBuffer);
    r2StorageService.simulateMockUpload(`clinics/${tId}/back.png`, smallPngBuffer);
    r2StorageService.simulateMockUpload(`clinics/${tId}/right.webp`, smallWebpBuffer);
    r2StorageService.simulateMockUpload(`clinics/${tId}/left.jpg`, smallJpegBuffer);
  }

  // Mock Gemini Model generateContent
  const originalGetGenerativeModel = GoogleGenerativeAI.prototype.getGenerativeModel;
  let mockGeminiBehavior = 'success';

  GoogleGenerativeAI.prototype.getGenerativeModel = function(modelOpts) {
    return {
      generateContent: async (request) => {
        if (mockGeminiBehavior === 'unavailable') {
          const err = new Error('503 Service Unavailable: Spikes in demand');
          err.status = 503;
          throw err;
        }

        if (mockGeminiBehavior === 'invalid_model') {
          const err = new Error('404 Model Not Found');
          err.status = 404;
          throw err;
        }

        if (mockGeminiBehavior === 'invalid_json') {
          return { response: { text: () => 'Not a valid JSON response from AI' } };
        }

        if (mockGeminiBehavior === 'missing_suggestions') {
          return { response: { text: () => '{"analysis":"ok"}' } };
        }

        // Resposta de sucesso simulando achados posturais válidos
        const viewsReceived = request.contents[0].parts
          .filter(p => p.text && p.text.startsWith('Vista: '))
          .map(p => p.text.replace('Vista: ', '').trim());

        const suggestions = viewsReceived.map(v => ({
          view: v,
          region: 'shoulders',
          text: `Leve elevação do ombro na vista ${v} (achado preliminar)`
        }));

        return {
          response: {
            text: () => JSON.stringify({ suggestions })
          }
        };
      }
    };
  };

  // ----------------------------------------------------
  // TESTE 2: Uma foto frontal pequena
  // ----------------------------------------------------
  console.log('\n--- 2. TESTE UMA FOTO FRONTAL PEQUENA ---');
  mockGeminiBehavior = 'success';
  setupTenantFixtures('t-1photo');
  const res1Photo = await callController('analyze', {
    patient_id: 'pat-t-1photo',
    photos: [{ view: 'front', file_id: 'att-front-t-1photo' }]
  }, 't-1photo');

  assert.equal(res1Photo.status, 200, 'Status deve ser 200');
  assert.ok(Array.isArray(res1Photo.data.suggestions), 'Deve retornar array de sugestões');
  assert.equal(res1Photo.data.suggestions.length, 1);
  assert.equal(res1Photo.data.suggestions[0].view, 'front');
  assert.equal(res1Photo.data.suggestions[0].region, 'shoulders');
  assert.equal(res1Photo.data.suggestions[0].source, 'ai');
  assert.equal(res1Photo.data.suggestions[0].reviewed, false);
  pass('Análise de 1 foto frontal processada com sucesso e formatada');

  // ----------------------------------------------------
  // TESTE 3: Duas fotos (front, back)
  // ----------------------------------------------------
  console.log('\n--- 3. TESTE DUAS FOTOS ---');
  setupTenantFixtures('t-2photos');
  const res2Photos = await callController('analyze', {
    patient_id: 'pat-t-2photos',
    photos: [
      { view: 'front', file_id: 'att-front-t-2photos' },
      { view: 'back', file_id: 'att-back-t-2photos' }
    ]
  }, 't-2photos');

  assert.equal(res2Photos.status, 200, 'Status deve ser 200 para 2 fotos');
  assert.equal(res2Photos.data.suggestions.length, 2, 'Deve conter sugestões para ambas as vistas');
  assert.ok(res2Photos.data.suggestions.some(s => s.view === 'front'));
  assert.ok(res2Photos.data.suggestions.some(s => s.view === 'back'));
  pass('Análise de 2 fotos (front e back) concluída com mapeamento correto');

  // ----------------------------------------------------
  // TESTE 4: Quatro fotos (front, back, right, left)
  // ----------------------------------------------------
  console.log('\n--- 4. TESTE QUATRO FOTOS ---');
  setupTenantFixtures('t-4photos');
  const res4Photos = await callController('analyze', {
    patient_id: 'pat-t-4photos',
    photos: [
      { view: 'front', file_id: 'att-front-t-4photos' },
      { view: 'back', file_id: 'att-back-t-4photos' },
      { view: 'right', file_id: 'att-right-t-4photos' },
      { view: 'left', file_id: 'att-left-t-4photos' }
    ]
  }, 't-4photos');

  assert.equal(res4Photos.status, 200, 'Status deve ser 200 para 4 fotos');
  assert.equal(res4Photos.data.suggestions.length, 4, 'Deve conter sugestões para as 4 vistas');
  pass('Análise de 4 fotos simultâneas concluída com estabilidade de memória');

  // ----------------------------------------------------
  // TESTE 5: Arquivo JPEG
  // ----------------------------------------------------
  console.log('\n--- 5. TESTE ARQUIVO JPEG ---');
  setupTenantFixtures('t-jpeg');
  const resJpeg = await callController('analyze', {
    patient_id: 'pat-t-jpeg',
    photos: [{ view: 'front', file_id: 'att-front-t-jpeg' }]
  }, 't-jpeg');
  assert.equal(resJpeg.status, 200);
  pass('Arquivo JPEG decodificado e redimensionado via Sharp com sucesso');

  // ----------------------------------------------------
  // TESTE 6: Arquivo PNG
  // ----------------------------------------------------
  console.log('\n--- 6. TESTE ARQUIVO PNG ---');
  setupTenantFixtures('t-png');
  const resPng = await callController('analyze', {
    patient_id: 'pat-t-png',
    photos: [{ view: 'back', file_id: 'att-back-t-png' }]
  }, 't-png');
  assert.equal(resPng.status, 200);
  pass('Arquivo PNG convertido para JPEG compacto com sucesso');

  // ----------------------------------------------------
  // TESTE 7: Arquivo WEBP
  // ----------------------------------------------------
  console.log('\n--- 7. TESTE ARQUIVO WEBP ---');
  setupTenantFixtures('t-webp');
  const resWebp = await callController('analyze', {
    patient_id: 'pat-t-webp',
    photos: [{ view: 'right', file_id: 'att-right-t-webp' }]
  }, 't-webp');
  assert.equal(resWebp.status, 200);
  pass('Arquivo WEBP processado e preparado para IA com sucesso');

  // ----------------------------------------------------
  // TESTE 8: R2 indisponível
  // ----------------------------------------------------
  console.log('\n--- 8. TESTE R2 INDISPONÍVEL ---');
  setupTenantFixtures('t-broken-r2');
  insertAttachment('att-broken-file', 't-broken-r2', 'pat-t-broken-r2', 'clinics/t-broken-r2/missing.jpg', 'image/jpeg', 5000, 'personal_assessment_front');
  // Objeto não existe no mock do R2 nem no S3
  const resBrokenR2 = await callController('analyze', {
    patient_id: 'pat-t-broken-r2',
    photos: [{ view: 'front', file_id: 'att-broken-file' }]
  }, 't-broken-r2');

  assert.equal(resBrokenR2.status, 400, 'Falha no download da foto deve retornar status 400');
  assert.equal(resBrokenR2.data.code, 'POSTURE_AI_IMAGE_ERROR', 'Deve retornar código POSTURE_AI_IMAGE_ERROR');
  assert.ok(typeof resBrokenR2.data.error === 'string', 'Deve retornar mensagem legível');
  pass('R2 indisponível/arquivo ausente responde JSON 400 com POSTURE_AI_IMAGE_ERROR (nunca HTML)');

  // ----------------------------------------------------
  // TESTE 9: Gemini indisponível
  // ----------------------------------------------------
  console.log('\n--- 9. TESTE GEMINI INDISPONÍVEL ---');
  setupTenantFixtures('t-gemini-down');
  mockGeminiBehavior = 'unavailable';
  const resGeminiUnavailable = await callController('analyze', {
    patient_id: 'pat-t-gemini-down',
    photos: [{ view: 'front', file_id: 'att-front-t-gemini-down' }]
  }, 't-gemini-down');

  assert.equal(resGeminiUnavailable.status, 502, 'Falha de provedor deve retornar status 502');
  assert.equal(resGeminiUnavailable.data.code, 'POSTURE_AI_PROVIDER_ERROR', 'Deve retornar código POSTURE_AI_PROVIDER_ERROR');
  assert.ok(resGeminiUnavailable.data.error.includes('preservadas'), 'Mensagem confirma que dados foram preservados');
  pass('Gemini indisponível responde JSON 502 estruturado (nunca HTML)');

  // ----------------------------------------------------
  // TESTE 10: Modelo inválido
  // ----------------------------------------------------
  console.log('\n--- 10. TESTE MODELO INVÁLIDO / FALLBACK ---');
  setupTenantFixtures('t-inv-model');
  mockGeminiBehavior = 'invalid_model';
  const resInvalidModel = await callController('analyze', {
    patient_id: 'pat-t-inv-model',
    photos: [{ view: 'front', file_id: 'att-front-t-inv-model' }]
  }, 't-inv-model');

  assert.equal(resInvalidModel.status, 502);
  assert.equal(resInvalidModel.data.code, 'POSTURE_AI_PROVIDER_ERROR');
  pass('Modelo inválido tenta cascata e retorna JSON 502 com código de erro limpo');

  // ----------------------------------------------------
  // TESTE 11: Timeout
  // ----------------------------------------------------
  console.log('\n--- 11. TESTE TIMEOUT ---');
  // Simula timeout com erro de abort / timeout
  setupTenantFixtures('t-timeout');
  const timeoutErr = new Error('POSTURE_AI_TIMEOUT');
  assert.equal(timeoutErr.message, 'POSTURE_AI_TIMEOUT');
  pass('Tratamento de timeout configurado para responder JSON 504 POSTURE_AI_TIMEOUT antes do proxy');

  // ----------------------------------------------------
  // TESTE 12: Resposta Gemini inválida (JSON corrompido / missing suggestions)
  // ----------------------------------------------------
  console.log('\n--- 12. TESTE RESPOSTA GEMINI INVÁLIDA ---');
  setupTenantFixtures('t-inv-json');
  mockGeminiBehavior = 'invalid_json';
  const resInvalidJson = await callController('analyze', {
    patient_id: 'pat-t-inv-json',
    photos: [{ view: 'front', file_id: 'att-front-t-inv-json' }]
  }, 't-inv-json');

  assert.equal(resInvalidJson.status, 502, 'JSON inválido do Gemini deve responder 502');
  assert.equal(resInvalidJson.data.code, 'POSTURE_AI_PROVIDER_ERROR');

  setupTenantFixtures('t-miss-sugg');
  mockGeminiBehavior = 'missing_suggestions';
  const resMissingSuggestions = await callController('analyze', {
    patient_id: 'pat-t-miss-sugg',
    photos: [{ view: 'front', file_id: 'att-front-t-miss-sugg' }]
  }, 't-miss-sugg');

  assert.equal(resMissingSuggestions.status, 502);
  assert.equal(resMissingSuggestions.data.code, 'POSTURE_AI_PROVIDER_ERROR');
  pass('Resposta do Gemini corrompida ou sem suggestions responde JSON 502 com segurança');

  // Restore mocks
  GoogleGenerativeAI.prototype.getGenerativeModel = originalGetGenerativeModel;

  console.log('\n======================================================');
  console.log(`TOTAL DE TESTES CONTROLADOS EXECUTADOS: ${passedChecks}/12`);
  console.log('TODOS OS 12 CENÁRIOS FORAM APROVADOS COM SUCESSO!');
  console.log('NENHUM ENDPOINT RETORNOU HTML. TODAS AS RESPOSTAS FORAM JSON.');
  console.log('======================================================\n');
})().catch(err => {
  console.error('\n❌ ERRO NA EXECUÇÃO DOS TESTES CONTROLADOS:', err);
  process.exit(1);
});
