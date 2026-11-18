/* eslint-disable no-console */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const http = require('node:http');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-studio-temp-test-'));
const dbFile = path.join(tmpRoot, 'test.db');
const localTmpDir = path.join(tmpRoot, 'tmp-imports');

process.env.DATABASE_PATH = dbFile;
process.env.STUDIO_IMPORT_TMP_DIR = localTmpDir;
process.env.JWT_SECRET = 'test-jwt-secret-studio-catalog-temp-lifecycle-32chars';
process.env.GEMINI_API_KEY = 'test-gemini-key-lifecycle';
process.env.NODE_ENV = 'test';
process.env.R2_MOCK_STORAGE = 'true';

const express = require('express');
const sharp = require('sharp');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const { db } = require('./dist/config/database');
const apiRouter = require('./dist/routes').default;
const { generateToken } = require('./dist/utils/jwt');
const { GeminiService } = require('./dist/services/gemini.service');
const { r2StorageService } = require('./dist/services/r2-storage.service');
const {
  StudioCatalogTempStorageService,
  isSafeCatalogTempKey
} = require('./dist/services/studio-catalog-temp-storage.service');

function requestJson(baseUrl, method, urlPath, token, body) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const url = new URL(urlPath, baseUrl);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
        }
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text,
            json
          });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function pollUntilTerminal(baseUrl, batchId, token, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await requestJson(baseUrl, 'GET', `/api/v1/studio/catalog-imports/${batchId}`, token);
    assert.equal(res.status, 200, `Expected 200 polling batch ${batchId}, got ${res.status}: ${res.text}`);
    const st = res.json?.status;
    if (st === 'ready' || st === 'completed' || st === 'failed' || st === 'cancelled') {
      return res;
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error(`Timeout polling batch ${batchId}`);
}

async function makeSyntheticPngBase64(seedByte) {
  // Gera PNG legítimo com entropia alta ~195-215KB (2 imagens ~0.39-0.42MB combinadas)
  const side = 270;
  const raw = Buffer.alloc(side * side * 3);
  let state = (seedByte + 1) * 1103515245;
  for (let i = 0; i < raw.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    raw[i] = (state >>> 16) & 0xff;
  }
  const pngBuf = await sharp(raw, { raw: { width: side, height: side, channels: 3 } })
    .png({ compressionLevel: 1 })
    .toBuffer();
  return {
    buf: pngBuf,
    base64: pngBuf.toString('base64'),
    kb: Math.round(pngBuf.length / 1024)
  };
}

function createSampleProposal(name = 'Musculação Studio Imports', uniquePrice = 240) {
  return {
    services: [
      {
        name,
        activity: 'musculacao',
        description: 'Acesso livre com planos comerciais importados.',
        notes: 'Funcionamento seg a sab 06h-22h.',
        type: 'access_unlimited',
        modality: 'presential',
        capacity: null,
        durationMinutes: null,
        weeklyLimit: null,
        monthlyLimit: null,
        allowPublicBooking: true,
        prices: [
          {
            label: 'Mensal Livre',
            amountCents: uniquePrice * 100,
            unit: 'per_month',
            paymentPeriod: 'monthly',
            duration: '1_month',
            frequencyType: 'unlimited',
            evidence: `${name} Mensal R$ ${uniquePrice}`
          }
        ],
        schedules: []
      }
    ],
    packages: [
      {
        name: `Pacote ${name}`,
        description: 'Combo comercial importado.',
        allowPublicBooking: true,
        price: {
          label: 'Combo Mensal',
          amountCents: (uniquePrice + 50) * 100,
          unit: 'per_month',
          paymentPeriod: 'monthly',
          duration: '1_month',
          frequencyType: 'unlimited',
          evidence: `Pacote ${name} R$ ${uniquePrice + 50}`
        },
        items: [{ serviceName: name, mandatory: true }]
      }
    ]
  };
}

function seedTenantAndAdmin(idPrefix) {
  const tenantId = `ten-${idPrefix}-${randomUUID().slice(0, 6)}`;
  const userId = `usr-${idPrefix}-${randomUUID().slice(0, 6)}`;
  db.prepare(`
    INSERT INTO tenants (
      id, slug, name, person_type, email, status, onboarding_status, onboarding_completed,
      terms_accepted, privacy_accepted, public_booking_enabled, public_booking_slug, establishment_profile
    ) VALUES (?, ?, ?, 'pj', ?, 'active', 'active', 1, 1, 1, 1, ?, 'studio')
  `).run(tenantId, `${idPrefix}-${tenantId}`, `Studio ${idPrefix}`, `${idPrefix}-${tenantId}@zemda.test`, `${idPrefix}-${tenantId}`);

  db.prepare(`
    INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, onboarding_status)
    VALUES (?, ?, ?, ?, 'hash', 'clinic_admin', 'active', 'active')
  `).run(userId, tenantId, `Admin ${idPrefix}`, `admin-${tenantId}@zemda.test`);

  // Garante assinatura ativa caso alguma rota consulte subscriptions/plan
  const plan = db.prepare('SELECT id FROM plans LIMIT 1').get();
  if (plan?.id) {
    db.prepare(`
      INSERT INTO subscriptions (id, tenant_id, plan_id, status, current_period_start, current_period_end)
      VALUES (?, ?, ?, 'active', datetime('now', '-1 day'), datetime('now', '+30 days'))
    `).run(`sub-${tenantId}`, tenantId, plan.id);
  }

  const token = generateToken({
    userId,
    tenantId,
    role: 'clinic_admin',
    email: `admin-${tenantId}@zemda.test`,
    name: `Admin ${idPrefix}`
  });

  return { tenantId, userId, token };
}

(async () => {
  // DB já inicializa de forma síncrona na importação de ./dist/config/database

  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use((req, _res, next) => {
    if (req.url === '/v1' || req.url.startsWith('/v1/')) req.url = `/api${req.url}`;
    next();
  });
  app.use('/api', apiRouter);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message || 'Erro interno' });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const tenantA = seedTenantAndAdmin('alpha');
  const tenantB = seedTenantAndAdmin('beta');

  // Imagens reais sintéticas (~0.39 MB combinadas)
  const img1 = await makeSyntheticPngBase64(11);
  const img2 = await makeSyntheticPngBase64(29);
  console.log(`[Setup] Generated PNG #1=${img1.kb}KB, PNG #2=${img2.kb}KB, combined=${img1.kb + img2.kb}KB`);

  // Guarda objetos protegidos em mock R2 para comprovar que NUNCA são tocados pela limpeza temporária
  const r2Map = new Map();
  const r2Meta = new Map();
  r2Map.set('clinics/studio-a/patients/pat-1/prontuario.pdf', Buffer.from('%PDF-CLINICAL-PROTECTED'));
  r2Map.set('clinics/global/exercises/ex-agachamento.webp', Buffer.from('WEBP-EXERCISE-PROTECTED'));
  r2Map.set('backups/2026/nightly.db', Buffer.from('BACKUP-PROTECTED'));

  let r2ConfiguredFlag = false;
  const origR2Desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(r2StorageService), 'isConfiguredClient');
  Object.defineProperty(r2StorageService, 'isConfiguredClient', {
    configurable: true,
    get: () => r2ConfiguredFlag
  });
  const origUploadFile = r2StorageService.uploadFile.bind(r2StorageService);
  const origGetObjectBuffer = r2StorageService.getObjectBuffer.bind(r2StorageService);
  const origDeleteFile = r2StorageService.deleteFile.bind(r2StorageService);

  r2StorageService.uploadFile = async (key, buf, _mime, metadata) => {
    r2Map.set(key, Buffer.from(buf));
    if (metadata) r2Meta.set(key, metadata);
    return key;
  };
  r2StorageService.getObjectBuffer = async (key) => {
    const b = r2Map.get(key);
    if (!b) throw new Error(`Mock R2 key not found: ${key}`);
    return Buffer.from(b);
  };
  r2StorageService.deleteFile = async (key) => {
    if (!key.startsWith('tmp/studio-catalog-imports/')) {
      throw new Error(`SECURITY VIOLATION: Attempted to delete non-temp R2 key: ${key}`);
    }
    r2Map.delete(key);
    r2Meta.delete(key);
  };

  const origGetModel = GoogleGenerativeAI.prototype.getGenerativeModel;
  const origExtractCatalog = GeminiService.extractStudioCatalog.bind(GeminiService);

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Guarda de chaves seguras (isSafeCatalogTempKey)
    // ------------------------------------------------------------------------
    assert.equal(isSafeCatalogTempKey('tmp/studio-catalog-imports/t1/b1/f1.jpg', 't1', 'b1'), true);
    assert.equal(isSafeCatalogTempKey('clinics/t1/patients/p1/doc.pdf'), false);
    assert.equal(isSafeCatalogTempKey('backups/daily.sqlite'), false);
    assert.equal(isSafeCatalogTempKey('tmp/studio-catalog-imports/../clinics/secret.jpg'), false);
    assert.equal(isSafeCatalogTempKey('tmp/studio-catalog-imports/t1/b1/f1.jpg', 'other-tenant', 'b1'), false);
    console.log('[PASS] 1. Strict key isolation guards reject clinics/, backups/, traversal, cross-tenant');

    // ------------------------------------------------------------------------
    // TEST 2: GeminiService cascade real, cap de maxOutputTokens, classificação 429/503 e SEM HTTP 502
    // ------------------------------------------------------------------------
    const seenModels = [];
    const seenMaxTokens = [];
    GoogleGenerativeAI.prototype.getGenerativeModel = function ({ model }) {
      seenModels.push(model);
      return {
        generateContent: async (payload) => {
          seenMaxTokens.push({ model, max: payload?.generationConfig?.maxOutputTokens });
          const err = new Error('[429 Too Many Requests] RESOURCE_EXHAUSTED quota exceeded');
          err.status = 429;
          throw err;
        }
      };
    };

    const failSyncRes = await requestJson(
      baseUrl,
      'POST',
      '/api/v1/studio/catalog-imports/analyze',
      tenantA.token,
      {
        files: [
          { fileName: 'tabela-precos.png', base64: img1.base64 },
          { fileName: 'horarios-aulas.png', base64: img2.base64 }
        ]
      }
    );

    assert.notEqual(failSyncRes.status, 502, 'Backend must NEVER return HTTP 502 on Gemini failure');
    assert.equal(failSyncRes.status, 503, `Expected 503 JSON on 429 quota failure, got ${failSyncRes.status}: ${failSyncRes.text}`);
    assert.ok(failSyncRes.headers['content-type'].includes('application/json'), 'Error response must be JSON');
    assert.ok(failSyncRes.headers['x-request-id'], 'X-Request-ID header must be returned');
    assert.equal(failSyncRes.json.requestId, failSyncRes.headers['x-request-id']);
    assert.equal(failSyncRes.json.code, 'AI_RATE_LIMITED');
    assert.equal(failSyncRes.json.retryable, true);
    assert.ok(!seenModels.includes('gemini-1.5-flash'), 'Deprecated gemini-1.5-flash must not be queried');
    const token20 = seenMaxTokens.find((x) => x.model === 'gemini-2.0-flash');
    assert.ok(token20 && token20.max <= 8192, `gemini-2.0-flash maxOutputTokens must be capped <= 8192, got ${token20?.max}`);
    console.log('[PASS] 2. Real GeminiService cascade skips deprecated 1.5, caps 2.0 tokens, returns 503 JSON (never 502) + X-Request-ID');

    // Restaurar prototype após testar SDK real
    GoogleGenerativeAI.prototype.getGenerativeModel = origGetModel;

    // Teste 2b: resposta vazia ou não-legível -> 422 JSON (nunca 502)
    GeminiService.extractStudioCatalog = async () => ({ services: [], packages: [] });
    const emptyRes = await requestJson(
      baseUrl,
      'POST',
      '/api/v1/studio/catalog-imports/analyze',
      tenantA.token,
      { files: [{ fileName: 'vazio.png', base64: img1.base64 }] }
    );
    assert.equal(emptyRes.status, 422);
    assert.equal(emptyRes.json.code, 'AI_UNREADABLE_CONTENT');
    assert.equal(emptyRes.json.retryable, false);
    console.log('[PASS] 3. Unreadable/empty AI result returns 422 JSON cleanly');

    // ------------------------------------------------------------------------
    // TEST 3: Fluxo Assíncrono (202 Accepted) com R2 Mock + 2 imagens (~0.39MB) + Deduplicação + Exclusão imediata pós-extração
    // ------------------------------------------------------------------------
    r2ConfiguredFlag = true;
    process.env.R2_MOCK_STORAGE = 'false';

    let stagedKeysObservedDuringRun = [];
    let releaseExtraction;
    const extractionGate = new Promise((r) => { releaseExtraction = r; });

    GeminiService.extractStudioCatalog = async (_inst, inputs) => {
      // Verifica arquivos temporários no mock R2 ENQUANTO a análise roda
      stagedKeysObservedDuringRun = [...r2Map.keys()].filter((k) => k.startsWith('tmp/studio-catalog-imports/'));
      assert.equal(inputs.length, 2, 'Both PNG files must reach Gemini extractor');
      await extractionGate;
      return createSampleProposal('Pilates R2 Studio', 280);
    };

    const analyzeAsyncRes = await requestJson(
      baseUrl,
      'POST',
      '/api/v1/studio/catalog-imports/analyze',
      tenantA.token,
      {
        async: true,
        files: [
          { fileName: 'plano-1.png', base64: img1.base64 },
          { fileName: 'plano-2.png', base64: img2.base64 }
        ]
      }
    );

    assert.equal(analyzeAsyncRes.status, 202, `Expected 202 Accepted, got ${analyzeAsyncRes.status}: ${analyzeAsyncRes.text}`);
    assert.equal(analyzeAsyncRes.json.status, 'queued');
    assert.ok(analyzeAsyncRes.json.requestId);
    assert.ok(analyzeAsyncRes.json.tempExpiresAt);
    const batchId1 = analyzeAsyncRes.json.id;

    // Clique duplo enquanto em andamento -> deduplica (sem criar 2º lote!)
    const dupRes = await requestJson(
      baseUrl,
      'POST',
      '/api/v1/studio/catalog-imports/analyze',
      tenantA.token,
      {
        async: true,
        files: [
          { fileName: 'plano-1.png', base64: img1.base64 },
          { fileName: 'plano-2.png', base64: img2.base64 }
        ]
      }
    );
    assert.equal(dupRes.status, 202);
    assert.equal(dupRes.json.id, batchId1);
    assert.equal(dupRes.json.deduplicated, true);

    // Libera extração após confirmar criação temporária no R2
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(stagedKeysObservedDuringRun.length, 2, '2 temp objects must be staged in R2 during run');
    for (const key of stagedKeysObservedDuringRun) {
      assert.equal(isSafeCatalogTempKey(key, tenantA.tenantId, batchId1), true);
      assert.equal(r2Meta.get(key)?.['zemda-temporary'], 'true');
    }
    releaseExtraction();

    const polledReady = await pollUntilTerminal(baseUrl, batchId1, tenantA.token);
    assert.equal(polledReady.json.status, 'ready');
    assert.ok(polledReady.json.tempPurgedAt, 'tempPurgedAt must be set immediately upon extraction');
    assert.equal(polledReady.json.proposal.services.length, 1);

    // Garante ZERO arquivos temporários restantes no R2 e no DB para este lote
    const activeTempAfterReady = db.prepare(`
      SELECT COUNT(*) AS cnt FROM studio_catalog_import_temp_files WHERE batch_id = ? AND temp_state != 'deleted'
    `).get(batchId1).cnt;
    assert.equal(activeTempAfterReady, 0);
    const remainingTmpR2 = [...r2Map.keys()].filter((k) => k.startsWith('tmp/studio-catalog-imports/'));
    assert.equal(remainingTmpR2.length, 0, 'All temp objects in R2 must be deleted after extraction');

    // Garante que objetos permanentes (clinics/, backups/) continuam 100% intactos!
    assert.equal(r2Map.has('clinics/studio-a/patients/pat-1/prontuario.pdf'), true);
    assert.equal(r2Map.has('clinics/global/exercises/ex-agachamento.webp'), true);
    assert.equal(r2Map.has('backups/2026/nightly.db'), true);

    // Garante zero base64 nos registros do banco
    const dbDraftRow = db.prepare('SELECT sources_json, proposal_json FROM studio_catalog_imports WHERE id = ?').get(batchId1);
    assert.ok(!dbDraftRow.sources_json.includes('base64') && !dbDraftRow.sources_json.includes('iVBOR'), 'No base64 image persisted in sources_json');
    assert.ok(!dbDraftRow.proposal_json.includes('iVBOR'), 'No base64 persisted in proposal_json');
    console.log('[PASS] 4. Async 202 + dedup + R2 scoped staging + auto-delete after extraction + zero DB base64 + protected files preserved');

    // ------------------------------------------------------------------------
    // TEST 4: Falha temporária assíncrona -> retenção curta p/ Retry -> Retry -> Confirmação idempotente no catálogo oficial
    // ------------------------------------------------------------------------
    // Cria 2ª variação alterando buffer sutilmente
    const imgFail = await makeSyntheticPngBase64(77);
    // Utiliza o motor real GeminiService simulando 503 do provedor para validar fallback + backoff + diagnóstico assíncrono
    GeminiService.extractStudioCatalog = origExtractCatalog;
    GoogleGenerativeAI.prototype.getGenerativeModel = function () {
      return {
        generateContent: async () => {
          const err = new Error('[503 Service Unavailable] overloaded');
          err.status = 503;
          throw err;
        }
      };
    };

    const failAsyncRes = await requestJson(
      baseUrl,
      'POST',
      '/api/v1/studio/catalog-imports/analyze',
      tenantA.token,
      { async: true, files: [{ fileName: 'retry-flow.png', base64: imgFail.base64 }] }
    );
    assert.equal(failAsyncRes.status, 202);
    const retryBatchId = failAsyncRes.json.id;

    const failedPoll = await pollUntilTerminal(baseUrl, retryBatchId, tenantA.token);
    assert.equal(failedPoll.json.status, 'failed');
    assert.equal(failedPoll.json.errorCode, 'AI_PROVIDER_UNAVAILABLE');
    assert.equal(failedPoll.json.retryable, true);
    GoogleGenerativeAI.prototype.getGenerativeModel = origGetModel;
    const activeTempBeforeRetry = db.prepare(`
      SELECT COUNT(*) AS cnt FROM studio_catalog_import_temp_files WHERE batch_id = ? AND temp_state = 'retry_available'
    `).get(retryBatchId).cnt;
    assert.equal(activeTempBeforeRetry, 1, 'Failed retryable batch must hold temp file in retry_available within TTL');

    // Retry sem reenviar imagens
    GeminiService.extractStudioCatalog = async (_inst, inputs) => {
      assert.equal(inputs.length, 1);
      return createSampleProposal('Funcional Retry Verified', 199);
    };

    const retryRes = await requestJson(baseUrl, 'POST', `/api/v1/studio/catalog-imports/${retryBatchId}/retry`, tenantA.token, {});
    assert.equal(retryRes.status, 202);
    assert.equal(retryRes.json.attempts, 2);

    const readyAfterRetry = await pollUntilTerminal(baseUrl, retryBatchId, tenantA.token);
    assert.equal(readyAfterRetry.json.status, 'ready');
    assert.ok(readyAfterRetry.json.tempPurgedAt);

    // Marca serviços e pacotes como revisados e salva + confirma no catálogo oficial
    const proposalToConfirm = readyAfterRetry.json.proposal;
    const svcKey = proposalToConfirm.services[0].key;
    proposalToConfirm.services.forEach((s) => { s.action = 'create'; s.reviewed = true; });
    proposalToConfirm.packages.forEach((p) => {
      p.action = 'create';
      p.reviewed = true;
      p.items.forEach((it) => { it.serviceRef = svcKey; });
    });

    const saveRes = await requestJson(baseUrl, 'PUT', `/api/v1/studio/catalog-imports/${retryBatchId}`, tenantA.token, {
      proposal: proposalToConfirm,
      revision: readyAfterRetry.json.revision
    });
    assert.equal(saveRes.status, 200);

    const confirmRes = await requestJson(baseUrl, 'POST', `/api/v1/studio/catalog-imports/${retryBatchId}/confirm`, tenantA.token, {
      confirmed: true,
      proposal: saveRes.json.proposal,
      revision: saveRes.json.revision
    });
    assert.equal(confirmRes.status, 200, `Confirm returned ${confirmRes.status}: ${confirmRes.text}`);
    assert.equal(confirmRes.json.status, 'completed');
    assert.equal(confirmRes.json.result.services.length, 1);
    assert.equal(confirmRes.json.result.packages.length, 1);

    // Idempotência da confirmação (sem duplicação de serviços)
    const confirmIdem = await requestJson(baseUrl, 'POST', `/api/v1/studio/catalog-imports/${retryBatchId}/confirm`, tenantA.token, {
      confirmed: true,
      proposal: saveRes.json.proposal,
      revision: saveRes.json.revision
    });
    assert.equal(confirmIdem.status, 200);
    const createdServiceCount = db.prepare(`
      SELECT COUNT(*) AS cnt FROM services WHERE tenant_id = ? AND name = 'Funcional Retry Verified'
    `).get(tenantA.tenantId).cnt;
    assert.equal(createdServiceCount, 1, 'Service must not be duplicated across retry or idempotent confirm');

    // Deletar lote confirmado deve retornar 409 (preserva histórico)
    const delCompleted = await requestJson(baseUrl, 'DELETE', `/api/v1/studio/catalog-imports/${retryBatchId}`, tenantA.token);
    assert.equal(delCompleted.status, 409);
    console.log('[PASS] 5. Retry succeeds cleanly, purges temp files, confirms without duplicate services, protects completed audit');

    // ------------------------------------------------------------------------
    // TEST 5: Fallback local tmpdir + Cancelamento em voo exclui arquivo do disco imediatamente + Descarte
    // ------------------------------------------------------------------------
    r2ConfiguredFlag = false;
    process.env.R2_MOCK_STORAGE = 'true';

    const imgCancel = await makeSyntheticPngBase64(131);
    let signalObservedAborted = false;
    let signalPromiseResolve;
    const cancelSawAbort = new Promise((r) => { signalPromiseResolve = r; });

    GeminiService.extractStudioCatalog = async (_inst, _inputs, opts) => {
      await new Promise((resolve) => {
        const t = setTimeout(resolve, 1500);
        opts?.signal?.addEventListener('abort', () => {
          signalObservedAborted = true;
          clearTimeout(t);
          signalPromiseResolve();
          resolve();
        }, { once: true });
      });
      return null;
    };

    const cancelJobRes = await requestJson(
      baseUrl,
      'POST',
      '/api/v1/studio/catalog-imports/analyze',
      tenantB.token,
      { async: true, files: [{ fileName: 'cancel-local.png', base64: imgCancel.base64 }] }
    );
    assert.equal(cancelJobRes.status, 202);
    const cancelBatchId = cancelJobRes.json.id;

    // Aguarda um momento para o worker iniciar com arquivo gravado em localTmpDir
    await new Promise((r) => setTimeout(r, 80));
    const localFilesBeforeCancel = db.prepare(`
      SELECT object_key FROM studio_catalog_import_temp_files WHERE batch_id = ? AND storage_provider = 'local_tmp' AND temp_state != 'deleted'
    `).all(cancelBatchId);
    assert.equal(localFilesBeforeCancel.length, 1);

    // Cross-tenant security check antes de cancelar (Tenant A não pode cancelar lote de Tenant B)
    const crossCancel = await requestJson(baseUrl, 'POST', `/api/v1/studio/catalog-imports/${cancelBatchId}/cancel`, tenantA.token, {});
    assert.equal(crossCancel.status, 404);

    const cancelRes = await requestJson(baseUrl, 'POST', `/api/v1/studio/catalog-imports/${cancelBatchId}/cancel`, tenantB.token, {});
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.json.cancelled, true);
    assert.equal(cancelRes.json.status, 'cancelled');
    await Promise.race([cancelSawAbort, new Promise((r) => setTimeout(r, 400))]);
    assert.equal(signalObservedAborted, true, 'AbortController must fire to cancel active Gemini request');

    const activeLocalAfterCancel = db.prepare(`
      SELECT COUNT(*) AS cnt FROM studio_catalog_import_temp_files WHERE batch_id = ? AND temp_state != 'deleted'
    `).get(cancelBatchId).cnt;
    assert.equal(activeLocalAfterCancel, 0);
    const localBatchDir = path.join(localTmpDir, tenantB.tenantId, cancelBatchId);
    assert.equal(fs.existsSync(localBatchDir), false, 'Local temp directory for cancelled batch must be deleted');

    // Descarte de batch não confirmado
    const delCancelled = await requestJson(baseUrl, 'DELETE', `/api/v1/studio/catalog-imports/${cancelBatchId}`, tenantB.token);
    assert.equal(delCancelled.status, 200);
    assert.equal(delCancelled.json.deleted, true);
    console.log('[PASS] 6. Local tmpdir isolation, cross-tenant 404 guard, immediate abort+purge on cancel and delete');

    // ------------------------------------------------------------------------
    // TEST 6: Expiração TTL (410 TEMP_FILES_EXPIRED), limpeza em lote abandonado e recuperação após reinício do servidor
    // ------------------------------------------------------------------------
    // 6a: Stage lote expirado e lote ainda válido
    const expiredBatchId = `exp-${randomUUID().slice(0, 8)}`;
    const validBatchId = `val-${randomUUID().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO studio_catalog_imports (id, tenant_id, actor_id, fingerprint, sources_json, proposal_json, status, retryable)
      VALUES (?, ?, ?, ?, '[{"id":1,"fileName":"exp.png","copies":1}]', '{"services":[],"packages":[]}', 'failed', 1)
    `).run(expiredBatchId, tenantB.tenantId, tenantB.userId, `fp-${expiredBatchId}`);
    db.prepare(`
      INSERT INTO studio_catalog_imports (id, tenant_id, actor_id, fingerprint, sources_json, proposal_json, status, retryable)
      VALUES (?, ?, ?, ?, '[{"id":1,"fileName":"valid.png","copies":1}]', '{"services":[],"packages":[]}', 'processing', 0)
    `).run(validBatchId, tenantB.tenantId, tenantB.userId, `fp-${validBatchId}`);

    await StudioCatalogTempStorageService.stageBatchTempFiles({
      tenantId: tenantB.tenantId,
      batchId: expiredBatchId,
      inputs: [{ fileName: 'exp.png', mimeType: 'image/png', base64: img1.base64, fingerprint: 'f-exp' }],
      expiresAtIso: '2020-01-01 00:00:00'
    });
    await StudioCatalogTempStorageService.stageBatchTempFiles({
      tenantId: tenantB.tenantId,
      batchId: validBatchId,
      inputs: [{ fileName: 'valid.png', mimeType: 'image/png', base64: img2.base64, fingerprint: 'f-val' }],
      expiresAtIso: '2099-01-01 00:00:00'
    });

    // Chama worker de limpeza + startup recovery (simula reinício com lote interrompido `validBatchId`)
    const recovery = await StudioCatalogTempStorageService.recoverInterruptedJobsOnStartup();
    assert.ok(recovery.expiredCleaned >= 1, 'Expired temp file must be cleaned');
    assert.ok(recovery.interruptedMarkedRetryable >= 1, 'Interrupted processing job must become retryable after restart');

    // Tentar retry no lote expirado -> HTTP 410 TEMP_FILES_EXPIRED
    const expiredRetryRes = await requestJson(baseUrl, 'POST', `/api/v1/studio/catalog-imports/${expiredBatchId}/retry`, tenantB.token, {});
    assert.equal(expiredRetryRes.status, 410);
    assert.equal(expiredRetryRes.json.code, 'TEMP_FILES_EXPIRED');

    // Lote interrompido no restart (`validBatchId`) ainda tem arquivo válido e retry completa!
    GeminiService.extractStudioCatalog = async () => createSampleProposal('Recuperado Pos Reinicio', 310);
    const interruptedRetryRes = await requestJson(baseUrl, 'POST', `/api/v1/studio/catalog-imports/${validBatchId}/retry`, tenantB.token, {});
    assert.equal(interruptedRetryRes.status, 202);
    const interruptedDone = await pollUntilTerminal(baseUrl, validBatchId, tenantB.token);
    assert.equal(interruptedDone.json.status, 'ready');
    assert.equal(interruptedDone.json.proposal.services[0].name, 'Recuperado Pos Reinicio');

    // Lote pronto (`batchId1`) continua abrindo normalmente mesmo após exclusão dos arquivos originais
    const reopenReady = await requestJson(baseUrl, 'GET', `/api/v1/studio/catalog-imports/${batchId1}`, tenantA.token);
    assert.equal(reopenReady.status, 200);
    assert.equal(reopenReady.json.status, 'ready');
    assert.equal(reopenReady.json.proposal.services[0].name, 'Pilates R2 Studio');

    // Rota de histórico normal e rotas clínicas preservadas
    const listRes = await requestJson(baseUrl, 'GET', '/api/v1/studio/catalog-imports?includeCompleted=1', tenantA.token);
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.json) && listRes.json.length >= 2);
    console.log('[PASS] 7. Expired batch returns 410, startup recovery rescues interrupted jobs, ready drafts survive file deletion');

    // ------------------------------------------------------------------------
    // TEST 7: Nenhuma sobra ativa de arquivo temporário para nenhum lote concluído/pronto
    // ------------------------------------------------------------------------
    const leftoverActive = db.prepare(`
      SELECT COUNT(*) AS cnt FROM studio_catalog_import_temp_files WHERE temp_state != 'deleted'
    `).get().cnt;
    assert.equal(leftoverActive, 0, `Expected 0 active temp files across all finalized/expired batches, found ${leftoverActive}`);
    console.log('[PASS] 8. Zero remaining temp files across DB and storage');

    console.log('\nALL STUDIO AI IMPORT TEMP LIFECYCLE TESTS PASSED!');
  } finally {
    GeminiService.extractStudioCatalog = origExtractCatalog;
    GoogleGenerativeAI.prototype.getGenerativeModel = origGetModel;
    if (origR2Desc) Object.defineProperty(r2StorageService, 'isConfiguredClient', origR2Desc);
    r2StorageService.uploadFile = origUploadFile;
    r2StorageService.getObjectBuffer = origGetObjectBuffer;
    r2StorageService.deleteFile = origDeleteFile;
    await new Promise((r) => server.close(r));
    try { db.close(); } catch (_) {}
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
  }
})().catch((err) => {
  console.error('\n[FAIL] Test suite failed:', err);
  process.exit(1);
});
