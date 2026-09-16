const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const bcrypt = require('bcryptjs');
const express = require('express');

// Usar banco SQLite isolado para testes
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-test-admin-'));
process.env.DATABASE_PATH = path.join(tempDir, 'test.sqlite');

const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');

const app = express();
app.use(express.json());
app.use('/api', require('./dist/routes').default);

// Auxiliares de teste
const createUser = (id, tenantId, role, email) => {
  db.prepare(`
    INSERT INTO users (id, tenant_id, name, email, password_hash, role, status)
    VALUES (?, ?, ?, ?, ?, ?, 'active')
  `).run(id, tenantId, id, email, bcrypt.hashSync('123456', 4), role);

  if (tenantId) {
    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager)
      VALUES (?, ?, ?, ?, 'active', ?)
    `).run('cu-' + id, tenantId, id, role, role === 'clinic_admin' ? 1 : 0);
  }
};

const createTenant = (id, name, slug) => {
  db.prepare(`
    INSERT INTO tenants (id, name, slug, trade_name, email, status)
    VALUES (?, ?, ?, ?, ?, 'active')
  `).run(id, name, slug, name, `${slug}@clinica.test`);
};

// Seed de dados iniciais para o teste
createTenant('clinic-a', 'Clínica A', 'clinica-a');
createTenant('clinic-b', 'Clínica B', 'clinica-b');

createUser('user-super', null, 'superadmin', 'super@zemda.test');
createUser('user-admin-a', 'clinic-a', 'clinic_admin', 'admin@clinica-a.test');
createUser('user-prof-a', 'clinic-a', 'professional', 'prof@clinica-a.test');
createUser('user-admin-b', 'clinic-b', 'clinic_admin', 'admin@clinica-b.test');

const tokenSuper = generateToken({ userId: 'user-super', tenantId: null, role: 'superadmin', email: 'super@zemda.test', name: 'SuperAdmin' });
const tokenAdminA = generateToken({ userId: 'user-admin-a', tenantId: 'clinic-a', role: 'clinic_admin', email: 'admin@clinica-a.test', name: 'Admin A' });
const tokenProfA = generateToken({ userId: 'user-prof-a', tenantId: 'clinic-a', role: 'professional', email: 'prof@clinica-a.test', name: 'Prof A' });
const tokenAdminB = generateToken({ userId: 'user-admin-b', tenantId: 'clinic-b', role: 'clinic_admin', email: 'admin@clinica-b.test', name: 'Admin B' });

let server;
let baseUrl;

async function api(method, route, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(baseUrl + route, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let data;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  return { status: res.status, data };
}

async function runTests() {
  console.log('====================================================');
  console.log('INICIANDO TESTES DE CORREÇÕES ADMINISTRATIVAS');
  console.log('====================================================');

  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  let passed = 0;
  let failed = 0;

  function assertTest(condition, testName) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  try {
    // ----------------------------------------------------
    // TESTE 1: ABERTURA E VISUALIZAÇÃO DE CHAMADOS
    // ----------------------------------------------------
    console.log('\n--- 1. ABERTURA E VISUALIZAÇÃO DE CHAMADOS ---');

    // Usuário Profissional da Clínica A abre chamado
    const createTicketRes = await api('POST', '/v1/support/tickets', {
      title: 'Dúvida no prontuário eletrônico',
      category: 'doubt',
      priority: 'medium',
      description: 'Gostaria de tirar uma dúvida sobre a evolução clínica.'
    }, tokenProfA);

    assertTest(createTicketRes.status === 201, 'Profissional da clínica consegue abrir chamado (HTTP 201)');
    const ticketId = createTicketRes.data.id;
    assertTest(Boolean(ticketId), `Chamado criado com ID: ${ticketId}`);

    // Usuário Profissional lista seus próprios chamados
    const listProfRes = await api('GET', '/v1/support/tickets', null, tokenProfA);
    assertTest(listProfRes.status === 200, 'Profissional lista chamados com sucesso (HTTP 200)');
    assertTest(Array.isArray(listProfRes.data) && listProfRes.data.length === 1, 'Profissional vê exatamente 1 chamado');
    assertTest(listProfRes.data[0].id === ticketId, 'ID do chamado corresponde ao criado');
    assertTest(listProfRes.data[0].status === 'open', 'Status do chamado é open');
    assertTest(Boolean(listProfRes.data[0].created_at), 'Possui data de abertura (created_at)');
    assertTest(Boolean(listProfRes.data[0].updated_at), 'Possui data de última atualização (updated_at)');

    // Usuário obtém detalhes do chamado
    const getTicketRes = await api('GET', `/v1/support/tickets/${ticketId}`, null, tokenProfA);
    assertTest(getTicketRes.status === 200, 'Profissional obtém detalhes do chamado (HTTP 200)');
    assertTest(getTicketRes.data.ticket.id === ticketId, 'Detalhes contêm o chamado correto');

    // ISOLAMENTO: Usuário de OUTRA clínica (Clínica B) NÃO visualiza o chamado
    const listAdminBRes = await api('GET', '/v1/support/tickets', null, tokenAdminB);
    assertTest(listAdminBRes.status === 200 && listAdminBRes.data.length === 0, 'Usuário de outra clínica NÃO vê o chamado de outra clínica na listagem');

    const getTicketAdminB = await api('GET', `/v1/support/tickets/${ticketId}`, null, tokenAdminB);
    assertTest(getTicketAdminB.status === 403, 'Usuário de outra clínica é bloqueado ao tentar ver chamado alheio (HTTP 403)');

    // ----------------------------------------------------
    // TESTE 2: RESPOSTA E ALTERAÇÃO DE STATUS
    // ----------------------------------------------------
    console.log('\n--- 2. RESPOSTA E STATUS DO CHAMADO ---');

    // SuperAdmin vê o chamado globalmente
    const listSuperRes = await api('GET', '/v1/support/tickets', null, tokenSuper);
    assertTest(listSuperRes.status === 200 && listSuperRes.data.some(t => t.id === ticketId), 'SuperAdmin visualiza o chamado globalmente');

    // SuperAdmin responde ao chamado
    const replyAdminRes = await api('POST', `/v1/support/tickets/${ticketId}/messages`, {
      message: 'Olá! Nossa equipe já está verificando sua solicitação de evolução.'
    }, tokenSuper);
    assertTest(replyAdminRes.status === 201, 'SuperAdmin envia resposta no chamado (HTTP 201)');

    // SuperAdmin altera o status para 'analyzing'
    const statusUpdateRes = await api('PATCH', `/v1/support/tickets/${ticketId}/status`, {
      status: 'analyzing'
    }, tokenSuper);
    assertTest(statusUpdateRes.status === 200, 'SuperAdmin atualiza status para analyzing (HTTP 200)');

    // Usuário comum tenta alterar status (deve ser bloqueado)
    const userStatusUpdateRes = await api('PATCH', `/v1/support/tickets/${ticketId}/status`, {
      status: 'closed'
    }, tokenProfA);
    assertTest(userStatusUpdateRes.status === 403, 'Usuário comum NÃO pode alterar status diretamente (HTTP 403)');

    // Usuário acompanha detalhes: vê novo status, data de última atualização e a resposta do SuperAdmin
    const getTicketAfterReply = await api('GET', `/v1/support/tickets/${ticketId}`, null, tokenProfA);
    assertTest(getTicketAfterReply.data.ticket.status === 'analyzing', 'Usuário visualiza status atualizado (analyzing)');
    assertTest(getTicketAfterReply.data.messages.length >= 1, 'Usuário acompanha respostas recebidas');
    assertTest(getTicketAfterReply.data.messages[0].message.includes('Nossa equipe já está verificando'), 'Conteúdo da resposta confere');

    // Usuário envia tréplica no próprio chamado
    const userReplyRes = await api('POST', `/v1/support/tickets/${ticketId}/messages`, {
      message: 'Obrigado pelo retorno rápido!'
    }, tokenProfA);
    assertTest(userReplyRes.status === 201, 'Usuário consegue responder no próprio chamado (HTTP 201)');

    // Usuário de outra clínica tenta responder (deve ser bloqueado)
    const adminBReplyRes = await api('POST', `/v1/support/tickets/${ticketId}/messages`, {
      message: 'Invasão'
    }, tokenAdminB);
    assertTest(adminBReplyRes.status === 403, 'Usuário de outra clínica NÃO pode responder chamado alheio (HTTP 403)');

    // ----------------------------------------------------
    // TESTE 3: EDIÇÃO DE SERVIÇO
    // ----------------------------------------------------
    console.log('\n--- 3. CATÁLOGO DE SERVIÇOS: EDIÇÃO ---');

    // Gestor da Clínica A cria serviço
    const createServiceRes = await api('POST', '/v1/services', {
      name: 'Fisioterapia Motora Inicial',
      price: 150.0,
      durationMinutes: 50,
      bufferMinutes: 10,
      modality: 'both',
      description: 'Sessão individual inicial'
    }, tokenAdminA);
    assertTest(createServiceRes.status === 201, 'Gestor cria serviço com sucesso (HTTP 201)');
    const serviceId = createServiceRes.data.id;

    // Gestor da Clínica A edita o serviço
    const editServiceRes = await api('PUT', `/v1/services/${serviceId}`, {
      name: 'Fisioterapia Motora Avançada',
      price: 220.0,
      durationMinutes: 60,
      bufferMinutes: 15,
      modality: 'presential',
      description: 'Sessão personalizada avançada'
    }, tokenAdminA);
    assertTest(editServiceRes.status === 200, 'Gestor edita serviço com sucesso (HTTP 200)');

    // Validação da alteração
    const listServicesRes = await api('GET', '/v1/services', null, tokenAdminA);
    const updatedSrv = listServicesRes.data.find(s => s.id === serviceId);
    assertTest(updatedSrv && updatedSrv.name === 'Fisioterapia Motora Avançada', 'Nome do serviço atualizado');
    assertTest(updatedSrv && Number(updatedSrv.price) === 220, 'Preço do serviço atualizado para 220.00');
    assertTest(updatedSrv && updatedSrv.duration_minutes === 60, 'Duração do serviço atualizada para 60 min');
    assertTest(updatedSrv && updatedSrv.modality === 'presential', 'Modalidade atualizada para presencial');

    // ----------------------------------------------------
    // TESTE 4: EXCLUSÃO E INATIVAÇÃO DE SERVIÇO
    // ----------------------------------------------------
    console.log('\n--- 4. CATÁLOGO DE SERVIÇOS: EXCLUSÃO / INATIVAÇÃO ---');

    // Cenário A: Serviço com histórico (agendamento / atendimento vinculado)
    db.prepare("INSERT INTO professionals (id, tenant_id, name) VALUES ('prof-1', 'clinic-a', 'Dra. Ana')").run();
    db.prepare("INSERT INTO patients (id, tenant_id, full_name, phone) VALUES ('patient-1', 'clinic-a', 'Carlos Souza', '11999998888')").run();

    // Inserir agendamento vinculado ao serviceId
    db.prepare(`
      INSERT INTO appointments (
        id, tenant_id, appointment_number, patient_id, professional_id, service_id,
        start_time, end_time, status, modality, created_at, updated_at
      ) VALUES (
        'appt-test-1', 'clinic-a', 'AG-2026-001', 'patient-1', 'prof-1', ?,
        '2026-09-16T10:00:00Z', '2026-09-16T11:00:00Z', 'completed', 'presential', datetime('now'), datetime('now')
      )
    `).run(serviceId);

    // Tentar excluir serviço com vínculos históricos
    const deleteLinkedRes = await api('DELETE', `/v1/services/${serviceId}`, null, tokenAdminA);
    assertTest(deleteLinkedRes.status === 200, 'Requisição de exclusão processada (HTTP 200)');
    assertTest(deleteLinkedRes.data.action === 'inactivated', 'Serviço com histórico foi INATIVADO em vez de excluído');

    // Conferir no banco se o registro foi preservado com active = 0
    const checkDbService = db.prepare('SELECT id, active FROM services WHERE id = ?').get(serviceId);
    assertTest(checkDbService && checkDbService.active === 0, 'Serviço preservado no banco com active = 0 (inativo)');

    // Conferir se o agendamento histórico continuou intacto
    const checkAppt = db.prepare('SELECT id, service_id FROM appointments WHERE id = ?').get('appt-test-1');
    assertTest(checkAppt && checkAppt.service_id === serviceId, 'Histórico de agendamento/atendimento preservado intacto');

    // Cenário B: Serviço sem nenhum vínculo histórico
    const createServiceCleanRes = await api('POST', '/v1/services', {
      name: 'Serviço Temporário Sem Vínculo',
      price: 80.0,
      durationMinutes: 30
    }, tokenAdminA);
    const cleanServiceId = createServiceCleanRes.data.id;

    const deleteCleanRes = await api('DELETE', `/v1/services/${cleanServiceId}`, null, tokenAdminA);
    assertTest(deleteCleanRes.status === 200, 'Exclusão de serviço sem vínculos processada (HTTP 200)');
    assertTest(deleteCleanRes.data.action === 'deleted', 'Serviço sem vínculos foi EXCLUÍDO definitivamente');

    // Conferir no banco se foi removido
    const checkCleanDb = db.prepare('SELECT id FROM services WHERE id = ?').get(cleanServiceId);
    assertTest(!checkCleanDb, 'Registro do serviço sem vínculos removido com sucesso do banco');

    // Cenário C: Permissão - Profissional (sem clinic_admin) tenta excluir serviço
    const deleteNoPermRes = await api('DELETE', `/v1/services/${serviceId}`, null, tokenProfA);
    assertTest(deleteNoPermRes.status === 403, 'Usuário sem cargo clinic_admin é bloqueado ao tentar excluir (HTTP 403)');

  } catch (err) {
    console.error('Erro durante execução dos testes:', err);
    failed++;
  } finally {
    if (server) server.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}

    console.log('\n====================================================');
    console.log(`RESULTADO DOS TESTES: ${passed} PASSOU, ${failed} FALHOU`);
    console.log('====================================================');
    if (failed > 0) process.exit(1);
  }
}

runTests();
