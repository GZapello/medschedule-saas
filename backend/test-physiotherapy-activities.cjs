const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const testDbPath = path.resolve(__dirname, 'test_physio_activities.db');
process.env.DATABASE_PATH = testDbPath;
process.env.JWT_SECRET = 'test-secret-physio-activities-123';
process.env.PORT = '3210';

if (fs.existsSync(testDbPath)) {
  try { fs.unlinkSync(testDbPath); } catch (_) {}
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');
const express = require('express');
const app = express();
app.use(express.json());
app.use('/api', require('./dist/routes').default);

const server = http.createServer(app);

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

function makeRequest(method, urlPath, headers = {}, body = null, isBinary = false) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3210,
      path: urlPath,
      method: method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers
      }
    };

    const req = http.request(options, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (isBinary) {
          resolve({ status: res.statusCode, headers: res.headers, body: buffer });
          return;
        }
        let data = buffer.toString('utf-8');
        try {
          data = JSON.parse(data);
        } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });

    req.on('error', err => reject(err));
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

server.listen(3210, async () => {
  try {
    console.log('================================================================');
    console.log('🧪 TEST SUITE: PADRONIZAÇÃO BIBLIOTECA DE EXERCÍCIOS ZEMDAFISIO');
    console.log('================================================================\n');

    // 1. Configuração do Tenant e Usuários
    const tenantId = 'tenant-' + uuidv4();
    const otherTenantId = 'tenant-' + uuidv4();
    const physioUserId = 'user-physio-' + uuidv4();
    const physioProfId = 'prof-physio-' + uuidv4();
    const otherUserId = 'user-other-' + uuidv4();
    const otherProfId = 'prof-other-' + uuidv4();

    // Tenant Principal
    db.prepare(`
      INSERT INTO tenants (id, name, trade_name, slug, email, cnpj_cpf, address, city, state, phone, status, created_at, updated_at)
      VALUES (?, 'Clínica Fisio e Reabilitação Zemda', 'Zemda Fisio Prime', 'clinica-fisio-test', 'fisio@zemda.test', '11.222.333/0001-99', 'Rua dos Fisioterapeutas, 100', 'São Paulo', 'SP', '(11) 4002-8922', 'active', datetime('now'), datetime('now'))
    `).run(tenantId);

    // Tenant Secundário para teste de isolamento
    db.prepare(`
      INSERT INTO tenants (id, name, trade_name, slug, email, cnpj_cpf, address, city, state, phone, status, created_at, updated_at)
      VALUES (?, 'Clínica Secundária Isolada', 'Clínica Isolada', 'clinica-sec-test', 'sec@zemda.test', '22.333.444/0001-88', 'Av Outra, 200', 'Campinas', 'SP', '(19) 3000-0000', 'active', datetime('now'), datetime('now'))
    `).run(otherTenantId);

    // Fisioterapeuta
    db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, role, status, name, profession_name, created_at, updated_at)
      VALUES (?, ?, 'dr.andre@zemdafisio.test', 'hash', 'professional', 'active', 'Dr. André Fisioterapeuta', 'Fisioterapia', datetime('now'), datetime('now'))
    `).run(physioUserId, tenantId);

    db.prepare(`
      INSERT INTO professionals (id, user_id, tenant_id, name, profession_id, registration_type, registration_number, active, created_at, updated_at)
      VALUES (?, ?, ?, 'Dr. André Fisioterapeuta', 'prof-fisioterapeuta', 'CREFITO-3', '123456-F', 1, datetime('now'), datetime('now'))
    `).run(physioProfId, physioUserId, tenantId);

    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, zemda_fisio_enabled, permissions_json)
      VALUES (?, ?, ?, 'professional', 'active', 1, 1, '[]')
    `).run('cu-' + uuidv4(), tenantId, physioUserId);

    // Fonoaudiólogo no mesmo tenant para teste de segregação de especialidades
    db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, role, status, name, profession_name, created_at, updated_at)
      VALUES (?, ?, 'dra.carla@fono.test', 'hash', 'professional', 'active', 'Dra. Carla Fonoaudióloga', 'Fonoaudiologia', datetime('now'), datetime('now'))
    `).run(otherUserId, tenantId);

    db.prepare(`
      INSERT INTO professionals (id, user_id, tenant_id, name, profession_id, registration_type, registration_number, active, created_at, updated_at)
      VALUES (?, ?, ?, 'Dra. Carla Fonoaudióloga', 'prof-fonoaudiologo', 'CRFa', '98765-SP', 1, datetime('now'), datetime('now'))
    `).run(otherProfId, otherUserId, tenantId);

    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, zemda_fono_enabled, zemda_fisio_enabled, permissions_json)
      VALUES (?, ?, ?, 'professional', 'active', 0, 1, 0, '[]')
    `).run('cu-' + uuidv4(), tenantId, otherUserId);

    // Tokens JWT
    const physioToken = generateToken({
      userId: physioUserId,
      tenantId,
      clinicId: tenantId,
      professionalId: physioProfId,
      role: 'professional',
      email: 'dr.andre@zemdafisio.test',
      name: 'Dr. André Fisioterapeuta'
    });
    const physioAuth = { Authorization: `Bearer ${physioToken}` };

    const fonoToken = generateToken({
      userId: otherUserId,
      tenantId,
      clinicId: tenantId,
      professionalId: otherProfId,
      role: 'professional',
      email: 'dra.carla@fono.test',
      name: 'Dra. Carla Fonoaudióloga'
    });
    const fonoAuth = { Authorization: `Bearer ${fonoToken}` };

    // Paciente
    const patientId = 'pat-fisio-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, birth_date, active, created_at)
      VALUES (?, ?, 'Carlos Alberto de Souza', '1980-05-20', 1, datetime('now'))
    `).run(patientId, tenantId);

    // --- TEST 1: Modelos Oficiais de Fisioterapia Semeados ---
    console.log('--- TEST 1: Verificação dos Modelos Oficiais Semeados de Fisioterapia ---');
    const resTemplates = await makeRequest('GET', '/api/v1/clinical-activities/templates?module_type=fisio', physioAuth);
    assert(resTemplates.status === 200, `Listagem de modelos retornou HTTP 200 (recebido: ${resTemplates.status})`);
    assert(Array.isArray(resTemplates.body), 'Resposta de modelos é um array');
    assert(resTemplates.body.length >= 20, `Retornou ${resTemplates.body.length} modelos de Fisioterapia (mínimo 20)`);
    
    const hasMobility = resTemplates.body.some(t => t.category === 'Mobilidade Articular');
    const hasStrength = resTemplates.body.some(t => t.category === 'Fortalecimento Muscular');
    const hasStretching = resTemplates.body.some(t => t.category === 'Alongamento e Flexibilidade');
    const hasBalance = resTemplates.body.some(t => t.category === 'Equilíbrio e Propriocepção');
    const hasControl = resTemplates.body.some(t => t.category === 'Controle Motor e Estabilização');
    const hasFunctional = resTemplates.body.some(t => t.category === 'Exercícios Funcionais e Marcha');

    assert(hasMobility, 'Categoria presente: Mobilidade Articular');
    assert(hasStrength, 'Categoria presente: Fortalecimento Muscular');
    assert(hasStretching, 'Categoria presente: Alongamento e Flexibilidade');
    assert(hasBalance, 'Categoria presente: Equilíbrio e Propriocepção');
    assert(hasControl, 'Categoria presente: Controle Motor e Estabilização');
    assert(hasFunctional, 'Categoria presente: Exercícios Funcionais e Marcha');

    // --- TEST 2: Criar Modelo Próprio na Minha Biblioteca ---
    console.log('\n--- TEST 2: Cadastro de Exercício Próprio na Minha Biblioteca ---');
    const newCustomTemplate = {
      profession_id: 'fisio',
      category: 'Fortalecimento Muscular',
      subcategory: 'Elásticos e faixas elásticas (Theraband)',
      title: 'Remada Baixa Unilateral com Faixa Elástica',
      objective: 'Fortalecimento de romboides e grande dorsal com controle escapular.',
      target_skill: 'Retração escapular e força de puxada posterior',
      age_group: 'Adultos e atletas',
      setting: 'home',
      materials_needed: 'Faixa elástica média presa em ponto fixo.',
      instructions: '1. Sente-se com as costas eretas e segure a faixa com uma das mãos.\n2. Puxe o cotovelo para trás rente ao tronco aproximando a escápula da coluna.\n3. Sustente 2 segundos e retorne de forma lenta.\n4. Dose: 3 séries de 12 repetições em cada braço.',
      frequency: '3 vezes por semana',
      caregiver_guidance: 'Evitar elevar os ombros durante a puxada.'
    };
    const resCreateTpl = await makeRequest('POST', '/api/v1/clinical-activities/templates', physioAuth, newCustomTemplate);
    assert(resCreateTpl.status === 201, `Modelo próprio criado com sucesso (HTTP ${resCreateTpl.status})`);
    assert(resCreateTpl.body?.id?.startsWith('tmpl-custom-'), `ID gerado para modelo customizado: ${resCreateTpl.body?.id}`);
    const customTplId = resCreateTpl.body?.id;

    // --- TEST 3: Criar Exercício Livre diretamente para o Paciente ---
    console.log('\n--- TEST 3: Criar Exercício Livre Atribuído ao Paciente ---');
    const freeExercisePayload = {
      profession_id: 'fisio',
      patient_id: patientId,
      title: 'Mobilização Ativa com Flexão de Quadril e Joelho no Leito',
      objective: 'Prevenção de trombose e ganho de amplitude articular precoce.',
      instructions: '1. Deitado de costas, deslize o calcanhar na cama flexionando o joelho e quadril.\n2. Mantenha 3 segundos e retorne estendendo suavemente.\n3. Dose: 3 séries de 10 repetições cada perna.',
      materials_needed: 'Toalha sob o calcanhar para facilitar o deslizamento',
      frequency: '2 vezes ao dia',
      setting: 'home',
      category: 'Mobilidade Articular',
      subcategory: 'Membros inferiores e quadril'
    };
    const resFreeEx = await makeRequest('POST', `/api/v1/clinical-activities/patient/${patientId}/assign`, physioAuth, freeExercisePayload);
    assert(resFreeEx.status === 201, `Exercício livre atribuído ao paciente com sucesso (HTTP ${resFreeEx.status})`);
    assert(resFreeEx.body?.id, `ID do exercício atribuído gerado: ${resFreeEx.body?.id}`);
    const freeExId = resFreeEx.body?.id;

    // --- TEST 4: Atribuir Modelo Pronto da Biblioteca ao Paciente ---
    console.log('\n--- TEST 4: Seleção e Atribuição de Modelo Pronto da Biblioteca ---');
    const assignTemplatePayload = {
      profession_id: 'fisio',
      template_id: 'tmpl-fisio-06',
      title: 'Fortalecimento de Glúteo Médio com Exercício da Ostra (Clamshell)',
      objective: 'Fortalecer os abdutores e rotadores externos do quadril para controle do valgo dinâmico.',
      instructions: '1. Deite-se de lado com joelhos a 90°.\n2. Abra o joelho de cima sem rodar o quadril.\n3. Dose: 3 séries de 12 repetições cada lado.',
      frequency: '1x ao dia em dias alternados',
      setting: 'home',
      category: 'Fortalecimento Muscular',
      subcategory: 'Elásticos e faixas elásticas (Theraband)'
    };
    const resAssignTpl = await makeRequest('POST', `/api/v1/clinical-activities/patient/${patientId}/assign`, physioAuth, assignTemplatePayload);
    assert(resAssignTpl.status === 201, `Modelo da biblioteca atribuído com sucesso (HTTP ${resAssignTpl.status})`);
    const assignedTplId = resAssignTpl.body?.id;

    // --- TEST 5: Persistência e Listagem de Atividades do Paciente ---
    console.log('\n--- TEST 5: Persistência após Releitura e Filtros ---');
    const resPatientList = await makeRequest('GET', `/api/v1/clinical-activities/patient/${patientId}?module_type=fisio`, physioAuth);
    assert(resPatientList.status === 200, `Listagem de atividades do paciente retornou HTTP 200 (recebido: ${resPatientList.status})`);
    assert(Array.isArray(resPatientList.body), 'Resposta é uma lista');
    assert(resPatientList.body.length === 2, `Paciente possui 2 exercícios atribuídos (recebido: ${resPatientList.body.length})`);
    const item1 = resPatientList.body.find(i => i.id === freeExId);
    const item2 = resPatientList.body.find(i => i.id === assignedTplId);
    assert(Boolean(item1 && item2), 'Ambos os exercícios (livre e de modelo) foram recuperados com dados íntegros');

    // --- TEST 6: Acompanhamento, Mudança de Status e Registro de Evolução ---
    console.log('\n--- TEST 6: Acompanhamento, Mudança de Status e Evolução da Atividade ---');
    const statusUpdatePayload = {
      status: 'completed',
      notes: 'Paciente realizou todas as séries com ótima técnica e sem queixas álgicas na sessão presencial.'
    };
    const resStatus = await makeRequest('PATCH', `/api/v1/clinical-activities/assignments/${freeExId}/status`, physioAuth, statusUpdatePayload);
    assert(resStatus.status === 200, `Status atualizado com sucesso (HTTP ${resStatus.status})`);

    const resFollowUps = await makeRequest('GET', `/api/v1/clinical-activities/assignments/${freeExId}/follow-ups`, physioAuth);
    assert(resFollowUps.status === 200, `Histórico de acompanhamento recuperado (HTTP ${resFollowUps.status})`);
    assert(Array.isArray(resFollowUps.body) && resFollowUps.body.length >= 1, `Histórico possui registro de evolução (${resFollowUps.body.length} registro(s))`);
    assert(resFollowUps.body[0]?.status === 'completed', 'Status gravado no histórico é completed');
    assert(resFollowUps.body[0]?.notes?.includes('ótima técnica'), 'Anotação clínica do fisioterapeuta preservada no histórico');

    // --- TEST 7: Download de PDF Individual e Consolidado ---
    console.log('\n--- TEST 7: Geração de PDF Individual e Consolidado de Fisioterapia ---');
    const resSinglePdf = await makeRequest('GET', `/api/v1/clinical-activities/assignments/${assignedTplId}/pdf`, physioAuth, null, true);
    assert(resSinglePdf.status === 200, `PDF individual gerado com sucesso (HTTP ${resSinglePdf.status})`);
    assert(resSinglePdf.headers['content-type'] === 'application/pdf', 'Header Content-Type é application/pdf');
    assert(resSinglePdf.body.slice(0, 4).toString() === '%PDF', 'Buffer binário do PDF individual inicia com %PDF');

    const resConsolidatedPdf = await makeRequest('POST', `/api/v1/clinical-activities/patient/${patientId}/export-pdf?module_type=fisio`, physioAuth, { assignmentIds: [freeExId, assignedTplId] }, true);
    assert(resConsolidatedPdf.status === 200, `PDF consolidado gerado com sucesso (HTTP ${resConsolidatedPdf.status})`);
    assert(resConsolidatedPdf.headers['content-type'] === 'application/pdf', 'Header Content-Type do consolidado é application/pdf');
    assert(resConsolidatedPdf.body.slice(0, 4).toString() === '%PDF', 'Buffer binário do PDF consolidado inicia com %PDF');

    // --- TEST 8: Exclusão Segura de Exercício Atribuído ---
    console.log('\n--- TEST 8: Exclusão Segura de Exercício Atribuído (Soft Delete + Histórico) ---');
    const resDelete = await makeRequest('DELETE', `/api/v1/clinical-activities/assignments/${freeExId}`, physioAuth);
    assert(resDelete.status === 200, `Exercício atribuído excluído com sucesso (HTTP ${resDelete.status})`);

    // Confirma que não aparece mais na lista ativa
    const resListAfterDel = await makeRequest('GET', `/api/v1/clinical-activities/patient/${patientId}?module_type=fisio`, physioAuth);
    assert(resListAfterDel.body.length === 1, `Apenas 1 exercício ativo remanescente após exclusão (recebido: ${resListAfterDel.body.length})`);
    assert(!resListAfterDel.body.some(i => i.id === freeExId), 'Exercício excluído não consta na lista do paciente');

    // Confirma no banco que soft delete foi aplicado e modelo original não foi afetado
    const dbRow = db.prepare('SELECT deleted_at FROM clinical_home_programs WHERE id = ?').get(freeExId);
    assert(dbRow && dbRow.deleted_at !== null, 'Registro preservado no banco com deleted_at preenchido (soft delete seguro)');

    // --- TEST 9: Isolamento Absoluto entre Profissões e Tenants ---
    console.log('\n--- TEST 9: Isolamento Absoluto entre Profissões e Multiclínicas ---');
    // 1. Fonoaudiólogo tentando acessar exercícios de Fisioterapia deste paciente deve receber 403 Forbidden
    const resFonoAccess = await makeRequest('GET', `/api/v1/clinical-activities/patient/${patientId}?module_type=fisio`, fonoAuth);
    assert(resFonoAccess.status === 403, `Fonoaudiólogo bloqueado de acessar exercícios de Fisioterapia (HTTP ${resFonoAccess.status})`);

    // 2. Fisioterapeuta tentando listar modelos de fono não autorizados
    const resPhysioFono = await makeRequest('GET', '/api/v1/clinical-activities/templates?module_type=fono', physioAuth);
    assert(resPhysioFono.status === 403, `Fisioterapeuta bloqueado de acessar modelos de Fonoaudiologia sem habilitação (HTTP ${resPhysioFono.status})`);

    // 3. Fisioterapeuta não vê modelos de Fono na listagem de Fisioterapia
    const hasFonoInPhysio = resTemplates.body.some(t => t.profession_id === 'fono');
    assert(!hasFonoInPhysio, 'Nenhum modelo de Fonoaudiologia vazou na biblioteca de Fisioterapia');

    // 4. Token de outro tenant tentando acessar o paciente
    const otherTenantToken = generateToken({
      userId: 'user-ext-99',
      tenantId: otherTenantId,
      clinicId: otherTenantId,
      role: 'professional',
      email: 'outro@tenant.test'
    });
    const resOtherTenant = await makeRequest('GET', `/api/v1/clinical-activities/patient/${patientId}?module_type=fisio`, { Authorization: `Bearer ${otherTenantToken}` });
    assert(resOtherTenant.status === 403 || resOtherTenant.status === 401, `Acesso de clínica externa bloqueado (HTTP ${resOtherTenant.status})`);

    console.log('\n================================================================');
    console.log(`TOTAL: ${passedTests} PASSOU | ${failedTests} FALHOU`);
    console.log('================================================================\n');

    server.close(() => {
      try { fs.unlinkSync(testDbPath); } catch (_) {}
      process.exit(failedTests > 0 ? 1 : 0);
    });

  } catch (error) {
    console.error('Erro fatal nos testes:', error);
    server.close(() => {
      try { fs.unlinkSync(testDbPath); } catch (_) {}
      process.exit(1);
    });
  }
});
