const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const assert = require('assert');
const { v4: uuidv4 } = require('uuid');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_psico_cfp.db');
process.env.JWT_SECRET = 'test-secret-psico-cfp-12345';
process.env.PORT = '3109';

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
      port: 3109,
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
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
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
  const server = app.listen(3109);
  console.log('[TEST] Servidor de testes iniciado na porta 3109');

  try {
    // 1. SETUP DE TENANTS E USUÁRIOS
    const tenantA = `tenant-psico-${uuidv4().slice(0, 8)}`;
    const tenantB = `tenant-psico-b-${uuidv4().slice(0, 8)}`;

    db.prepare("INSERT INTO tenants (id, slug, name, cnpj_cpf, email, status, session_version) VALUES (?, ?, 'Clínica Psico A', '11111111000111', 'a@psico.com', 'active', 0)").run(tenantA, tenantA);
    db.prepare("INSERT INTO tenants (id, slug, name, cnpj_cpf, email, status, session_version) VALUES (?, ?, 'Clínica Psico B', '22222222000122', 'b@psico.com', 'active', 0)").run(tenantB, tenantB);

    // Psicólogo Tenant A (com CRP e zemda_psico_enabled)
    const userPsiA = `user-psi-${uuidv4().slice(0, 8)}`;
    const profPsiA = `prof-psi-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, profession_name, practice_areas, zemda_psico_enabled, status)
      VALUES (?, ?, 'Dra. Luiza Psicóloga', 'luiza@psico.com', 'hash', 'professional', 'Psicologia Clínica', 'Terapia de Casal, Avaliação', 1, 'active')
    `).run(userPsiA, tenantA);
    db.prepare(`
      INSERT INTO professionals (id, user_id, tenant_id, name, profession_id, registration_type, registration_number, zemda_psico_enabled, active)
      VALUES (?, ?, ?, 'Dra. Luiza Psicóloga', 'prof-psicologo', 'CRP', '06/123456', 1, 1)
    `).run(profPsiA, userPsiA, tenantA);
    db.prepare(`
      INSERT INTO clinic_users (id, user_id, tenant_id, role, zemda_psico_enabled, status)
      VALUES (?, ?, ?, 'professional', 1, 'active')
    `).run(`cu-${uuidv4()}`, userPsiA, tenantA);

    // Recepcionista Tenant A (perfil puramente administrativo)
    const userRecepA = `user-recep-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status)
      VALUES (?, ?, 'Carlos Recepção', 'carlos@psico.com', 'hash', 'receptionist', 'active')
    `).run(userRecepA, tenantA);
    db.prepare(`
      INSERT INTO clinic_users (id, user_id, tenant_id, role, status)
      VALUES (?, ?, ?, 'receptionist', 'active')
    `).run(`cu-${uuidv4()}`, userRecepA, tenantA);

    // Psicólogo Tenant B (outro tenant)
    const userPsiB = `user-psi-b-${uuidv4().slice(0, 8)}`;
    const profPsiB = `prof-psi-b-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, profession_name, zemda_psico_enabled, status)
      VALUES (?, ?, 'Dr. Marcos Psicólogo B', 'marcos@psicob.com', 'hash', 'professional', 'Psicologia', 1, 'active')
    `).run(userPsiB, tenantB);
    db.prepare(`
      INSERT INTO professionals (id, user_id, tenant_id, name, profession_id, registration_type, registration_number, zemda_psico_enabled, active)
      VALUES (?, ?, ?, 'Dr. Marcos Psicólogo B', 'prof-psicologo', 'CRP', '06/999999', 1, 1)
    `).run(profPsiB, userPsiB, tenantB);
    db.prepare(`
      INSERT INTO clinic_users (id, user_id, tenant_id, role, zemda_psico_enabled, status)
      VALUES (?, ?, ?, 'professional', 1, 'active')
    `).run(`cu-${uuidv4()}`, userPsiB, tenantB);

    // Paciente em Tenant A
    const patientA = `pat-${uuidv4().slice(0, 8)}`;
    db.prepare("INSERT INTO patients (id, tenant_id, full_name, phone, cpf, birth_date) VALUES (?, ?, 'Mariana Silva', '11999998888', '12345678900', '1995-05-12')").run(patientA, tenantA);

    // Tokens JWT
    const tokenPsiA = generateToken({ userId: userPsiA, email: 'luiza@psico.com', role: 'professional', tenantId: tenantA, name: 'Dra. Luiza Psicóloga' });
    const tokenRecepA = generateToken({ userId: userRecepA, email: 'carlos@psico.com', role: 'receptionist', tenantId: tenantA, name: 'Carlos Recepção' });
    const tokenPsiB = generateToken({ userId: userPsiB, email: 'marcos@psicob.com', role: 'professional', tenantId: tenantB, name: 'Dr. Marcos Psicólogo B' });

    const headersPsiA = { Authorization: `Bearer ${tokenPsiA}`, 'x-tenant-id': tenantA };
    const headersRecepA = { Authorization: `Bearer ${tokenRecepA}`, 'x-tenant-id': tenantA };
    const headersPsiB = { Authorization: `Bearer ${tokenPsiB}`, 'x-tenant-id': tenantB };

    console.log('[TEST] 1. Setup de usuários e tokens concluído.');

    // 2. TESTE DE SIGILO E CONTROLE DE ACESSO (CFP 01/2009)
    // Recepcionista tenta acessar o prontuário psicológico
    const recepAttempt = await makeRequest('GET', `/api/v1/psychology/profile/${patientA}`, headersRecepA);
    assert.strictEqual(recepAttempt.status, 403, 'Recepcionista deve receber 403 ao tentar acessar prontuário psicológico');
    console.log('[PASS] Bloqueio estrito de acesso para recepcionista validado (HTTP 403).');

    // Psicólogo de outro tenant tenta acessar paciente de Tenant A
    const otherTenantAttempt = await makeRequest('GET', `/api/v1/psychology/profile/${patientA}`, headersPsiB);
    assert(otherTenantAttempt.status === 403 || otherTenantAttempt.status === 404, 'Psicólogo de outro tenant não pode acessar paciente de Tenant A');
    console.log('[PASS] Isolamento multitenant validado.');

    // Psicólogo autorizado acessa com sucesso
    const psiAccess = await makeRequest('GET', `/api/v1/psychology/profile/${patientA}`, headersPsiA);
    assert.strictEqual(psiAccess.status, 200, 'Psicólogo autorizado deve receber 200');
    assert.strictEqual(psiAccess.body.patient.name, 'Mariana Silva');
    console.log('[PASS] Acesso clínico de psicólogo autorizado com sucesso (HTTP 200).');

    // 3. ANAMNESE COMPLETA E NEUTRA
    const anamneseRes = await makeRequest('POST', '/api/v1/psychology/anamnesis', headersPsiA, {
      patientId: patientA,
      professionalId: profPsiA,
      mainComplaint: 'Dificuldades de regulação emocional e sintomas ansiosos em transição de carreira.',
      demandHistory: 'Início há 6 meses após mudança de cargo.',
      sleepPatterns: 'Insônia inicial frequente.',
      eatingHabits: 'Alimentação irregular.',
      substanceUse: 'Nega uso de álcool ou substâncias ilícitas.',
      theoreticalApproach: 'Psicanálise Contemporânea',
      supportNetwork: 'Família nuclear e amigos próximos.',
      protectiveFactors: 'Vínculos de amizade estáveis, prática de meditação.'
    });
    assert.strictEqual(anamneseRes.status, 200, 'Salvamento de anamnese deve retornar 200');
    console.log('[PASS] Anamnese psicológica completa e neutra salva com sucesso.');

    // 4. EXAME DO ESTADO MENTAL (EEM)
    const eemRes = await makeRequest('POST', '/api/v1/psychology/mental-state', headersPsiA, {
      patientId: patientA,
      professionalId: profPsiA,
      examDate: '2026-09-20',
      appearance: 'Aparência cuidada, postura tensa.',
      attitudeBehavior: 'Colaborativa, contato visual preservado.',
      consciousnessLevel: 'Vigil',
      orientation: 'Orientada auto e alopsiquicamente.',
      attention: 'Atenção sustentada diminuída com distratibilidade.',
      memory: 'Memória remota e recente preservadas.',
      mood: 'Ansioso',
      affect: 'Congruente com a narrativa',
      thoughtProcess: 'Curso acelerado, forma lógica, conteúdo voltado a preocupações futuras.',
      sensoryPerception: 'Sem alterações perceptivas',
      criticalJudgment: 'Juízo crítico preservado',
      insight: 'Bom insight sobre o próprio sofrimento psíquico.'
    });
    assert.strictEqual(eemRes.status, 200, 'EEM deve retornar 200');
    console.log('[PASS] Exame do Estado Mental (EEM) semiótico salvo com sucesso.');

    // 5. AVALIAÇÃO DE RISCO ESTRUTURADA
    const riskRes = await makeRequest('POST', '/api/v1/psychology/risk', headersPsiA, {
      patientId: patientA,
      professionalId: profPsiA,
      assessmentDate: '2026-09-20',
      suicidalIdeation: 'Ausente',
      selfHarm: 'Sem histórico',
      planning: 'Nenhum',
      protectiveFactors: 'Desejo de vida, projetos futuros, forte rede familiar',
      conductAdopted: 'Acompanhamento psicoterápico continuado, sem necessidade de contenção de crise.',
      safetyPlan: 'Contatar psicóloga ou familiar em caso de intensificação da angústia.'
    });
    assert.strictEqual(riskRes.status, 200, 'Avaliação de risco deve retornar 200');
    console.log('[PASS] Avaliação de risco estruturada salva com sucesso.');

    // 6. INSTRUMENTOS DE TRIAGEM / FONTES COMPLEMENTARES
    const screeningRes = await makeRequest('POST', '/api/v1/psychology/screenings', headersPsiA, {
      patientId: patientA,
      screeningName: 'GAD-7 (Escala de Ansiedade Generalizada)',
      version: 'Versão Brasileira Validada',
      bibliographic_reference: 'Spitzer et al., 2006; Kroenke et al., 2007',
      targetPopulation: 'Adultos',
      purpose: 'Rastreio de intensidade de sintomas ansiosos',
      scoreRaw: '11/21',
      classification: 'Sintomatologia ansiosa moderada',
      clinicalNotes: 'Utilizado exclusivamente como fonte complementar de triagem.'
    });
    assert.strictEqual(screeningRes.status, 200, 'Triagem deve retornar 200');
    console.log('[PASS] Instrumento de triagem complementar salvo com sucesso.');

    // 7. AVALIAÇÃO PSICOLÓGICA & SATEPSI (CFP 31/2022)
    const instrumentRes = await makeRequest('POST', '/api/v1/psychology/instruments', headersPsiA, {
      patientId: patientA,
      instrumentName: 'Bateria Fatorial de Personalidade (BFP)',
      version: '2ª Edição',
      publisher: 'Casa do Psicólogo / Pearson',
      purpose: 'Avaliação da estrutura de personalidade segundo o modelo dos Cinco Grandes Fatores',
      applicationDate: '2026-09-20',
      modality: 'presencial',
      satepsiStatus: 'favoravel',
      satepsiVerifiedAt: '2026-09-20',
      professionalSynthesis: 'Perfil revela alta abertura a experiências, extroversão moderada e níveis elevados de neuroticismo/vulnerabilidade emocional.',
      responsiblePsychologist: 'Dra. Luiza Psicóloga (CRP 06/123456)'
    });
    assert.strictEqual(instrumentRes.status, 200, 'Registro de instrumento deve retornar 200');
    console.log('[PASS] Instrumento com status SATEPSI favorável registrado.');

    // 8. METAS TERAPÊUTICAS NEUTRAS
    const goalRes = await makeRequest('POST', '/api/v1/psychology/goals', headersPsiA, {
      patientId: patientA,
      professionalId: profPsiA,
      title: 'Elaboração dos conflitos em torno da autonomia e exigência profissional',
      indicator: 'Redução da autocrítica paralisante em situações de tomada de decisão',
      targetPeriod: 'Médio Prazo',
      strategy: 'Associação livre e interpretação analítica dos padrões relacionais',
      status: 'em_andamento'
    });
    assert.strictEqual(goalRes.status, 200, 'Criação de meta deve retornar 200');
    console.log('[PASS] Meta terapêutica neutra criada com sucesso.');

    // 9. CONCLUIR ATENDIMENTO (Selamento Criptográfico & Sucesso)
    const finishRes = await makeRequest('POST', '/api/v1/psychology/consultations/finish', headersPsiA, {
      patientId: patientA,
      sessionNumber: 1,
      sessionDate: '2026-09-20',
      modality: 'online',
      tdicInfo: {
        consentConfirmed: true,
        technicalQuality: 'Conexão estável e canal de videoconferência seguro',
        patientLocation: 'Residência da paciente (São Paulo/SP)',
        emergencyContact: 'Irmão: (11) 98888-7777',
        incidents: 'Nenhuma intercorrência técnica ou de privacidade.'
      },
      currentDemand: 'Angústia intensa relacionada à apresentação de projeto profissional.',
      interventionsUsed: 'Escuta analítica, pontuações sobre as exigências ideais, acolhimento da ansiedade.',
      clinicalEvolution: 'Paciente compareceu ao atendimento pontualmente via plataforma segura. Apresentou fala fluida com angústia focada na transição profissional. Foi possível vincular a ansiedade atual a padrões de exigência familiar.',
      conductPlan: 'Manter sessões semanais às terças-feiras.'
    });
    assert.strictEqual(finishRes.status, 200, 'Conclusão de atendimento deve retornar 200');
    assert(finishRes.body.signatureHash, 'Deve retornar hash de selamento SHA-256');
    assert(finishRes.body.sessionId, 'Deve retornar sessionId selado');
    console.log(`[PASS] Atendimento concluído e selado com hash SHA-256: ${finishRes.body.signatureHash.slice(0, 16)}...`);

    // 10. TENTATIVA DE SOBRESCREVER SESSÃO SELADA (Imutabilidade)
    const overwriteAttempt = await makeRequest('POST', '/api/v1/psychology/sessions', headersPsiA, {
      id: finishRes.body.sessionId,
      patientId: patientA,
      clinicalEvolution: 'Tentativa indevida de alterar registro selado.'
    });
    assert.strictEqual(overwriteAttempt.status, 409, 'Sessão selada não pode ser sobrescrita diretamente (HTTP 409)');
    console.log('[PASS] Imutabilidade do registro selado garantida (HTTP 409).');

    // 11. INCLUSÃO DE ADENDO CLÍNICO EM SESSÃO SELADA
    const amendmentRes = await makeRequest('POST', `/api/v1/psychology/sessions/${finishRes.body.sessionId}/amendments`, headersPsiA, {
      amendmentText: 'Adendo: Paciente enviou mensagem posterior informando que a apresentação ocorreu de forma satisfatória.'
    });
    assert.strictEqual(amendmentRes.status, 200, 'Adendo deve retornar 200');
    console.log('[PASS] Adendo registrado com sucesso na sessão selada.');

    // 12. EMISSÃO DE DOCUMENTOS CFP — REGRAS E VEDAÇÕES ESTRITAS
    // a) Declaração com conteúdo clínico/sintoma -> DEVE SER REJEITADA
    const invalidDeclaracao = await makeRequest('POST', '/api/v1/psychology/documents', headersPsiA, {
      patientId: patientA,
      documentType: 'declaracao',
      purpose: 'Comprovação de horário de trabalho',
      requesterName: 'Empregador',
      renderedText: 'Declaro que Mariana compareceu e foi constatado sintoma de depressão e ansiedade.'
    });
    assert.strictEqual(invalidDeclaracao.status, 422, 'Declaração com sintomas/diagnósticos deve ser rejeitada');
    console.log('[PASS] Veto regulamentar a conteúdo clínico em Declaração validado (HTTP 422).');

    // b) Declaração estritamente factual -> AUTORIZADA
    const validDeclaracao = await makeRequest('POST', '/api/v1/psychology/documents', headersPsiA, {
      patientId: patientA,
      documentType: 'declaracao',
      purpose: 'Comprovação de comparecimento',
      requesterName: 'Empregador',
      renderedText: 'Declaro, para os devidos fins, que a paciente Mariana Silva esteve em atendimento psicológico nesta data, no período das 14:00 às 15:00 horas.'
    });
    assert.strictEqual(validDeclaracao.status, 200, 'Declaração factual deve ser aprovada');
    assert(validDeclaracao.body.documentNumber.startsWith('DOC-PSICO-'), 'Deve gerar número de documento oficial');
    console.log(`[PASS] Declaração válida emitida com número ${validDeclaracao.body.documentNumber}.`);

    // c) Laudo Psicológico em paciente sem Avaliação Psicológica estruturada -> DEVE SER REJEITADO
    const patientNoEval = `pat-no-eval-${uuidv4().slice(0, 8)}`;
    db.prepare("INSERT INTO patients (id, tenant_id, full_name, phone) VALUES (?, ?, 'Paciente Sem Avaliação', '11999990000')").run(patientNoEval, tenantA);

    const invalidLaudo = await makeRequest('POST', '/api/v1/psychology/documents', headersPsiA, {
      patientId: patientNoEval,
      documentType: 'laudo',
      purpose: 'Perícia',
      requesterName: 'Vara de Família',
      renderedText: 'Laudo pericial sem avaliação registrada.'
    });
    assert.strictEqual(invalidLaudo.status, 422, 'Laudo sem avaliação estruturada deve ser bloqueado');
    console.log('[PASS] Bloqueio obrigatório de Laudo sem Avaliação Psicológica validado (HTTP 422).');

    // d) Cadastra Avaliação Psicológica estruturada para Mariana e emite Laudo -> AUTORIZADO
    const evalRes = await makeRequest('POST', '/api/v1/psychology/assessments', headersPsiA, {
      patientId: patientA,
      assessmentTitle: 'Avaliação Psicológica Compreensiva do Funcionamento Afetivo',
      purpose: 'Compreensão da dinâmica de personalidade e recursos de enfrentamento',
      fundamentalSourcesJson: ['Entrevistas clínicas semiestruturadas', 'Observação clínica', 'BFP - Bateria Fatorial de Personalidade'],
      clinicalIntegrationAnalysis: 'A análise integrada dos dados quantitativos e qualitativos demonstra preservação das funções cognitivas e vulnerabilidade à sobrecarga afetiva.',
      conclusionSynthesis: 'Indica-se a continuidade do processo psicoterápico focalizado no fortalecimento da autoestima.'
    });
    assert.strictEqual(evalRes.status, 200, 'Processo de avaliação estruturada salvo');

    const validLaudo = await makeRequest('POST', '/api/v1/psychology/documents', headersPsiA, {
      patientId: patientA,
      documentType: 'laudo',
      purpose: 'Esclarecimento técnico de funcionamento psicológico',
      requesterName: 'Médico Assistente',
      renderedText: '1. IDENTIFICAÇÃO\nPaciente: Mariana Silva\n\n2. DESCRIÇÃO DA DEMANDA\nDemanda de avaliação afetiva e comportamental.\n\n3. PROCEDIMENTO\nForam realizadas 4 sessões avaliativas, aplicação da BFP com parecer favorável no SATEPSI e exame do estado mental.\n\n4. ANÁLISE\nOs achados revelam bom juízo crítico, afeto congruente e traços elevados de vulnerabilidade ao estresse.\n\n5. CONCLUSÃO\nRecomenda-se acompanhamento psicoterápico continuado.'
    });
    assert.strictEqual(validLaudo.status, 200, 'Laudo com avaliação prévia deve ser autorizado');
    console.log(`[PASS] Laudo Psicológico fundamentado emitido com sucesso: ${validLaudo.body.documentNumber}.`);

    // e) Registro de entrega de documento
    const deliveryRes = await makeRequest('POST', `/api/v1/psychology/documents/${validLaudo.body.documentId}/delivery`, headersPsiA, {
      recipientName: 'Mariana Silva',
      deliveryDate: '2026-09-20',
      deliveryChannel: 'em_maos',
      notes: 'Entregue cópia impressa devidamente assinada com protocolo assinado pela paciente.'
    });
    assert.strictEqual(deliveryRes.status, 200, 'Registro de entrega deve retornar 200');
    console.log('[PASS] Registro de entrega de documento psicológico formalizado.');

    // f) Impressão do documento oficial
    const printRes = await makeRequest('GET', `/api/v1/psychology/documents/${validLaudo.body.documentId}/print`, headersPsiA);
    assert.strictEqual(printRes.status, 200, 'Impressão deve retornar 200');
    assert(printRes.body.includes('LAUDO PSICOLÓGICO'), 'HTML deve conter título oficial');
    assert(printRes.body.includes('QR Code'), 'HTML deve conter QR code de verificação');
    assert(printRes.body.includes('Hash SHA-256'), 'HTML deve conter carimbo com hash SHA-256');
    console.log('[PASS] Geração de impressão oficial com QR Code e Hash SHA-256 validada.');

    // 13. ASSISTENTE DE IA ÉTICO (Com Guardrails do CFP)
    const aiRes = await makeRequest('POST', '/api/v1/psychology/ai-assist', headersPsiA, {
      patientId: patientA,
      mode: 'structure_topics',
      text: 'paciente relata ansiedade em reunioes executadas intervencao de acolhimento resposta paciente aliviada conduta manter sessoes'
    });
    assert.strictEqual(aiRes.status, 200, 'IA assist deve retornar 200');
    assert(aiRes.body.result.includes('[RASCUNHO GERADO POR IA'), 'Deve conter badge explícito de rascunho de IA');
    console.log('[PASS] Assistente de IA ético com marcação de rascunho validado.');

    // 14. HISTÓRICO LONGITUDINAL DO PACIENTE
    const historyRes = await makeRequest('GET', `/api/v1/psychology/history/${patientA}`, headersPsiA);
    assert.strictEqual(historyRes.status, 200, 'Histórico deve retornar 200');
    assert(historyRes.body.sessions.length >= 1, 'Deve conter sessões registradas');
    assert(historyRes.body.documents.length >= 2, 'Deve conter documentos emitidos');
    assert(historyRes.body.assessments.length >= 1, 'Deve conter avaliações estruturadas');
    console.log('[PASS] Histórico longitudinal sigiloso do paciente verificado com sucesso.');

    // 15. PERSISTÊNCIA REAL NO BANCO DE DADOS (Sem Dependência de localStorage)
    const countSessions = db.prepare('SELECT COUNT(*) as c FROM psychology_sessions WHERE patient_id = ?').get(patientA);
    const countDocs = db.prepare('SELECT COUNT(*) as c FROM psychology_documents WHERE patient_id = ?').get(patientA);
    const countAnamnesis = db.prepare('SELECT COUNT(*) as c FROM psychology_anamnesis WHERE patient_id = ?').get(patientA);
    assert(countSessions.c >= 1, 'Sessões devem estar gravadas no SQLite');
    assert(countDocs.c >= 2, 'Documentos devem estar gravados no SQLite');
    assert(countAnamnesis.c >= 1, 'Anamnese deve estar gravada no SQLite');
    console.log('[PASS] Persistência real no SQLite validada com integridade total.');

    console.log('\n======================================================');
    console.log(' TODOS OS 15 TESTES AUTOMATIZADOS PASSARAM COM SUCESSO! ');
    console.log('======================================================\n');
  } catch (err) {
    console.error('[FAIL] Erro nos testes:', err);
    process.exitCode = 1;
  } finally {
    server.close();
    if (fs.existsSync(process.env.DATABASE_PATH)) {
      try { fs.unlinkSync(process.env.DATABASE_PATH); } catch (e) {}
    }
  }
}

runTests();
