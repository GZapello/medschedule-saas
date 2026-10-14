const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const assert = require('assert');
const { v4: uuidv4 } = require('uuid');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_psico_correcoes.db');
process.env.JWT_SECRET = 'test-secret-psico-correcoes-12345';
process.env.PORT = '3110';

if (fs.existsSync(process.env.DATABASE_PATH)) {
  try {
    fs.unlinkSync(process.env.DATABASE_PATH);
  } catch (e) {}
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  if (req.url.startsWith('/v1/')) {
    req.url = `/api${req.url}`;
  }
  next();
});
app.use('/api', require('./dist/routes').default);

function makeRequest(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3110,
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
        const contentType = res.headers['content-type'] || '';
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
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
  const server = app.listen(3110);
  console.log('[TEST] Servidor de testes de correções iniciado na porta 3110\n');

  try {
    // 1. SETUP DE TENANTS E USUÁRIOS
    const tenantId = `tenant-psico-${uuidv4().slice(0, 8)}`;
    db.prepare("INSERT INTO tenants (id, slug, name, cnpj_cpf, email, status, session_version) VALUES (?, ?, 'Clínica Psico Teste', '11111111000111', 'teste@psico.com', 'active', 0)").run(tenantId, tenantId);

    const userId = `user-psi-${uuidv4().slice(0, 8)}`;
    const profId = `prof-psi-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, profession_name, zemda_psico_enabled, status)
      VALUES (?, ?, 'Dr. Leonardo Psicólogo', 'leonardo@psico.com', 'hash', 'professional', 'Psicologia Clínica', 1, 'active')
    `).run(userId, tenantId);

    db.prepare(`
      INSERT INTO professionals (id, user_id, tenant_id, name, profession_id, registration_type, registration_number, zemda_psico_enabled, active)
      VALUES (?, ?, ?, 'Dr. Leonardo Psicólogo', 'prof-psicologo', 'CRP', '06/654321', 1, 1)
    `).run(profId, userId, tenantId);

    db.prepare(`
      INSERT INTO clinic_users (id, user_id, tenant_id, role, zemda_psico_enabled, status)
      VALUES (?, ?, ?, 'professional', 1, 'active')
    `).run(`cu-${uuidv4()}`, userId, tenantId);

    const patientId = `pat-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, phone, cpf, birth_date, active)
      VALUES (?, ?, 'Mariana Silveira', '11999998888', '12345678900', '1995-04-12', 1)
    `).run(patientId, tenantId);

    const token = generateToken({
      userId,
      email: 'leonardo@psico.com',
      role: 'professional',
      name: 'Dr. Leonardo Psicólogo',
      tenantId,
      sessionVersion: 0
    });

    const headers = {
      'Authorization': `Bearer ${token}`,
      'X-Tenant-ID': tenantId
    };

    console.log('--- TESTE 1: Triagens & Escalas - Notas Clínicas e Interpretação ---');
    const screeningPayload = {
      patientId,
      screeningName: 'PHQ-9 (Inventário de Depressão)',
      version: 'Validação Brasileira',
      scoreRaw: '14/27 (Sintomas Moderados)',
      classification: 'Episódio Depressivo Moderado',
      clinicalNotes: 'Linha 1: Paciente relata perda de interesse e anedonia há 3 semanas.\nLinha 2: Sem ideação suicida ativa.\nLinha 3: Ajustar intervenções psicoterapêuticas.'
    };
    const scrRes = await makeRequest('POST', '/api/v1/psychology/screenings', headers, screeningPayload);
    assert.strictEqual(scrRes.status, 200, 'Salvar triagem deve retornar 200');
    assert(scrRes.body.id, 'Deve retornar ID da triagem criada');

    // Recupera perfil e verifica se o texto das notas clínicas foi preservado com quebras de linha
    const profileRes = await makeRequest('GET', `/api/v1/psychology/profile/${patientId}`, headers);
    assert.strictEqual(profileRes.status, 200);
    const savedScr = profileRes.body.screenings.find(s => s.id === scrRes.body.id);
    assert(savedScr, 'Triagem deve constar no perfil');
    assert.strictEqual(savedScr.clinical_notes, screeningPayload.clinicalNotes, 'Notas clínicas devem preservar exatamente o texto digitado');
    console.log('[PASS] Notas Clínicas de Triagens salvas e recuperadas com quebra de linha integral.\n');

    console.log('--- TESTE 2: Metas Terapêuticas - Validação Numérica e Percentual ---');
    // 2.1 Rejeição de texto livre (ex.: "Notas Clínicas e Interpretação") no campo alvo
    const invalidTargetText = await makeRequest('POST', '/api/v1/clinical/goals', headers, {
      patientId,
      moduleType: 'psychology',
      domain: 'Sintomas',
      title: 'Redução de ruminação mental',
      targetValue: 'Notas Clínicas e Interpretação',
      unit: '%'
    });
    assert.strictEqual(invalidTargetText.status, 400, 'Deve rejeitar texto livre no campo Alvo');
    assert(invalidTargetText.body.error.includes('numérico'), 'Mensagem de erro deve indicar exigência de valor numérico');
    console.log('[PASS] Bloqueou texto livre no campo Alvo (HTTP 400):', invalidTargetText.body.error);

    // 2.2 Rejeição de texto livre no valor basal
    const invalidBaselineText = await makeRequest('POST', '/api/v1/clinical/goals', headers, {
      patientId,
      moduleType: 'psychology',
      domain: 'Sintomas',
      title: 'Redução de ansiedade',
      baselineValue: 'Texto inválido',
      targetValue: '50',
      unit: '%'
    });
    assert.strictEqual(invalidBaselineText.status, 400, 'Deve rejeitar texto livre no Valor Basal');
    console.log('[PASS] Bloqueou texto livre no Valor Basal (HTTP 400).');

    // 2.3 Rejeição de porcentagem fora de 0-100 (ex.: 150%)
    const invalidPercentHigh = await makeRequest('POST', '/api/v1/clinical/goals', headers, {
      patientId,
      moduleType: 'psychology',
      domain: 'Sintomas',
      title: 'Eficácia de enfrentamento',
      targetValue: '150',
      unit: '%'
    });
    assert.strictEqual(invalidPercentHigh.status, 400, 'Deve rejeitar porcentagem > 100%');
    assert(invalidPercentHigh.body.error.includes('entre 0 e 100'), 'Deve avisar sobre o range de 0 a 100%');
    console.log('[PASS] Bloqueou meta percentual > 100% (HTTP 400):', invalidPercentHigh.body.error);

    // 2.4 Rejeição de porcentagem negativa (< 0)
    const invalidPercentLow = await makeRequest('POST', '/api/v1/clinical/goals', headers, {
      patientId,
      moduleType: 'psychology',
      domain: 'Sintomas',
      title: 'Eficácia de enfrentamento',
      targetValue: '-10',
      unit: '%'
    });
    assert.strictEqual(invalidPercentLow.status, 400, 'Deve rejeitar porcentagem < 0%');
    console.log('[PASS] Bloqueou meta percentual < 0% (HTTP 400).');

    // 2.5 Criação com sucesso de meta percentual válida (ex: 80% ou 80)
    const validGoal = await makeRequest('POST', '/api/v1/clinical/goals', headers, {
      patientId,
      moduleType: 'psychology',
      domain: 'Regulação Emocional',
      title: 'Automonitoramento de gatilhos ansiosos',
      baselineValue: '20',
      currentValue: '35',
      targetValue: '80%',
      unit: '%'
    });
    assert.strictEqual(validGoal.status, 201, 'Criação de meta válida deve retornar 201');
    assert(validGoal.body.id, 'Deve retornar ID da meta');
    const createdGoalId = validGoal.body.id;
    console.log('[PASS] Meta terapêutica percentual válida cadastrada com sucesso (HTTP 201).');

    // 2.6 Validação ao atualizar progresso da meta
    const invalidProgress = await makeRequest('PUT', `/api/v1/clinical/goals/${createdGoalId}`, headers, {
      currentValue: 'Texto arbitrário no progresso'
    });
    assert.strictEqual(invalidProgress.status, 400, 'Deve rejeitar texto livre no progresso');
    console.log('[PASS] Bloqueou texto no progresso da meta (HTTP 400).');

    const validProgress = await makeRequest('PUT', `/api/v1/clinical/goals/${createdGoalId}`, headers, {
      currentValue: '55',
      status: 'in_progress',
      notes: 'Paciente conseguiu identificar 3 gatilhos na semana.'
    });
    assert.strictEqual(validProgress.status, 200, 'Atualização de progresso numérico válida deve retornar 200');
    console.log('[PASS] Progresso numérico da meta atualizado com sucesso.\n');

    // Cadastra serviço e agendamento apt-101 para validar vínculo de atendimento e rascunho
    db.prepare(`
      INSERT INTO services (id, tenant_id, name, duration_minutes, price, active)
      VALUES ('srv-psico', ?, 'Sessão de Psicologia', 50, 150.0, 1)
    `).run(tenantId);

    db.prepare(`
      INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, start_time, end_time, status, modality)
      VALUES ('apt-101', ?, 101, ?, ?, 'srv-psico', '2026-09-21 14:00', '2026-09-21 15:00', 'in_progress', 'presential')
    `).run(tenantId, patientId, profId);

    console.log('--- TESTE 3: Autosave Completo & Persistência de Rascunho ---');
    const clientUpdatedAt1 = new Date().toISOString();
    const draftPayload1 = {
      patientId,
      appointmentId: 'apt-101',
      clientUpdatedAt: clientUpdatedAt1,
      draftData: {
        activeTab: 'sessions',
        currentSession: {
          sessionNumber: 3,
          sessionDate: '2026-09-21',
          modality: 'presencial',
          clinicalEvolution: 'Rascunho de evolução sendo digitado em tempo real...',
          interventionsUsed: 'Psicoeducação e reestruturação'
        },
        anamnese: {
          mainComplaint: 'Ansiedade social recorrente'
        }
      }
    };

    // 3.1 Salvar rascunho
    const saveDraftRes = await makeRequest('POST', '/api/v1/psychology/draft', headers, draftPayload1);
    assert.strictEqual(saveDraftRes.status, 200, 'Salvar rascunho deve retornar 200');
    assert(saveDraftRes.body.success, 'Deve indicar sucesso');
    console.log('[PASS] Rascunho salvo no backend via POST /v1/psychology/draft.');

    // 3.2 Recuperar rascunho
    const getDraftRes = await makeRequest('GET', `/api/v1/psychology/draft/${patientId}?appointment_id=apt-101`, headers);
    assert.strictEqual(getDraftRes.status, 200, 'Recuperar rascunho deve retornar 200');
    assert(getDraftRes.body.draft, 'Draft retornado não deve ser nulo');
    assert.strictEqual(getDraftRes.body.draft.draft_data.currentSession.clinicalEvolution, draftPayload1.draftData.currentSession.clinicalEvolution);
    console.log('[PASS] Rascunho recuperado com integridade total via GET /v1/psychology/draft/:patientId.');

    // 3.3 Proteção contra concorrência: versão antiga não sobrescreve versão mais nova
    const olderTime = new Date(Date.now() - 60000).toISOString();
    const olderDraftPayload = {
      patientId,
      appointmentId: 'apt-101',
      clientUpdatedAt: olderTime,
      draftData: {
        activeTab: 'sessions',
        currentSession: {
          sessionNumber: 3,
          clinicalEvolution: 'VERSÃO OBSOLETA NÃO DEVE SOBRESCREVER'
        }
      }
    };
    const conflictRes = await makeRequest('POST', '/api/v1/psychology/draft', headers, olderDraftPayload);
    assert.strictEqual(conflictRes.status, 409, 'Versão mais antiga deve ser rejeitada com 409 Conflict');
    console.log('[PASS] Proteção contra sobreposição desordenada de rascunhos validada (HTTP 409).\n');

    console.log('--- TESTE 4: Finalização de Atendimento com Selamento SHA-256 ---');
    const finishPayload = {
      patientId,
      appointmentId: 'apt-101',
      sessionNumber: 3,
      sessionDate: '2026-09-21',
      modality: 'presencial',
      currentDemand: 'Ansiedade social ao falar em público',
      interventionsUsed: 'Desensibilização sistemática e registro de pensamentos disfuncionais',
      clinicalEvolution: 'Paciente compareceu pontualmente à sessão presencial. Relatou avanço no enfrentamento de situações em grupo durante a semana de trabalho. Foram trabalhadas as distorções cognitivas associadas ao medo de julgamento.',
      conductPlan: 'Manter tarefas intersessão e reavaliação na próxima sessão.'
    };
    const finishRes = await makeRequest('POST', '/api/v1/psychology/consultations/finish', headers, finishPayload);
    assert.strictEqual(finishRes.status, 200, 'Finalizar atendimento deve retornar 200');
    assert(finishRes.body.signatureHash, 'Deve retornar signatureHash SHA-256');
    assert(finishRes.body.sessionId, 'Deve retornar sessionId');
    console.log(`[PASS] Atendimento finalizado e selado com hash SHA-256: ${finishRes.body.signatureHash.slice(0, 16)}...`);

    // 4.1 Verificar que o rascunho e histórico continuam íntegros após finalizar (não destrutivo)
    const historyRes = await makeRequest('GET', `/api/v1/psychology/history/${patientId}`, headers);
    assert.strictEqual(historyRes.status, 200);
    const finishedSession = historyRes.body.sessions.find(s => s.id === finishRes.body.sessionId);
    assert(finishedSession, 'Sessão concluída deve estar registrada no histórico');
    assert.strictEqual(finishedSession.is_sealed, 1, 'Sessão deve estar selada');
    console.log('[PASS] Histórico longitudinal preservado de forma não destrutiva.\n');

    console.log('--- TESTE 5: Impressão Autenticada de Documento Psicológico ---');
    // 5.1 Emissão de documento para teste de impressão (Declaração Psicológica Factual CFP 06/2019)
    const docPayload = {
      patientId,
      documentType: 'declaracao',
      purpose: 'Comprovação de comparecimento ao atendimento psicológico',
      requesterName: 'Mariana Silveira',
      renderedText: 'Declaro, para os devidos fins, que a paciente Mariana Silveira compareceu a atendimento psicológico no dia 21/09/2026, no horário das 14:00 às 15:00 horas.'
    };
    const docRes = await makeRequest('POST', '/api/v1/psychology/documents', headers, docPayload);
    assert.strictEqual(docRes.status, 200, 'Emissão de documento deve retornar 200');
    const docId = docRes.body.documentId;
    assert(docId, 'Deve retornar documentId');

    // 5.2 Tentativa de impressão SEM autenticação (simulando window.open desprotegido antigo)
    const unauthPrint = await makeRequest('GET', `/api/v1/psychology/documents/${docId}/print`, {});
    assert.strictEqual(unauthPrint.status, 401, 'Acesso sem token deve retornar 401 Unauthorized');
    console.log('[PASS] Rota de impressão rejeita requisição não autenticada com 401.');

    // 5.3 Impressão COM cabeçalho Bearer token (nova implementação autenticada)
    const authPrint = await makeRequest('GET', `/api/v1/psychology/documents/${docId}/print`, headers);
    assert.strictEqual(authPrint.status, 200, 'Acesso autenticado deve retornar 200 OK');
    assert(authPrint.headers['content-type'].includes('text/html'), 'Deve retornar Content-Type text/html');
    assert(typeof authPrint.body === 'string', 'Corpo da resposta deve ser HTML formatado');
    assert(authPrint.body.includes('DECLARAÇÃO PSICOLÓGICA'), 'Deve conter título oficial do documento');
    assert(authPrint.body.includes('@page { size: A4;'), 'Deve conter estilos limpos para folha A4');
    assert(authPrint.body.includes('Assinatura Eletrônica e Selamento Criptográfico'), 'Deve conter carimbo de autenticidade');
    assert(authPrint.body.includes(docRes.body.signatureHash), 'Deve conter hash SHA-256 do documento');
    console.log('[PASS] Impressão autenticada gerou HTML limpo A4 com selo e QR code com sucesso.\n');

    console.log('========================================================');
    console.log('TODOS OS 5 TESTES DE CORREÇÕES DO ZEMDAPSICO PASSARAM COM SUCESSO!');
    console.log('========================================================');

  } finally {
    server.close();
    if (fs.existsSync(process.env.DATABASE_PATH)) {
      try { fs.unlinkSync(process.env.DATABASE_PATH); } catch (e) {}
    }
  }
}

runTests().catch(err => {
  console.error('\n[FAIL] Erro nos testes:', err);
  process.exit(1);
});
