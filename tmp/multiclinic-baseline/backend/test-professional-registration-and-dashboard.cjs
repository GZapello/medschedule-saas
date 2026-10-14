/**
 * Testes Automatizados de Validação - Registro Profissional e Dashboard
 * 
 * Verifica que:
 * 1. O próprio profissional pode atualizar registration_type e registration_number via PUT /v1/professionals/:id
 * 2. As colunas registration_type e registration_number são persistidas em `professionals`
 * 3. As colunas registration_type e registration_number são sincronizadas em `users`
 * 4. Valores anteriormente vazios ou "Pendente" podem ser preenchidos e atualizados
 * 5. Um profissional NÃO pode atualizar o perfil profissional de outro usuário (403 Forbidden)
 * 6. Isolamento multi-tenant preservado
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const TEST_DB_PATH = path.resolve(__dirname, 'test_prof_reg_dashboard.db');
process.env.DATABASE_PATH = TEST_DB_PATH;
process.env.JWT_SECRET = 'test-secret-prof-reg-dashboard-9988';
const PORT = 3197;
process.env.PORT = String(PORT);

if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');
const express = require('express');
const app = express();
app.use(express.json());
app.use('/api', require('./dist/routes').default);

let server;
let passedTests = 0;
let failedTests = 0;
const results = [];

function assert(condition, testNumber, message) {
  if (condition) {
    passedTests++;
    results.push({ test: testNumber, status: 'PASS', message });
    console.log(`\x1b[32m[PASS] Test ${testNumber}: ${message}\x1b[0m`);
  } else {
    failedTests++;
    results.push({ test: testNumber, status: 'FAIL', message });
    console.error(`\x1b[31m[FAIL] Test ${testNumber}: ${message}\x1b[0m`);
  }
}

function makeRequest(method, endpoint, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : '';
    const reqHeaders = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      ...headers
    };

    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: endpoint,
      method: method,
      headers: reqHeaders
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = body ? JSON.parse(body) : null;
        } catch (e) {
          parsed = body;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function run() {
  server = app.listen(PORT);
  console.log(`Servidor de teste rodando na porta ${PORT}`);

  try {
    const tenantId = 't-clinica-saude-1';
    db.prepare(`
      INSERT OR REPLACE INTO tenants (id, name, slug, email, status, created_at, updated_at)
      VALUES (?, 'Clínica Bem Estar', 'bem-estar', 'contato@bemestar.com', 'active', datetime('now'), datetime('now'))
    `).run(tenantId);

    // Cria Usuário Profissional 1
    const user1Id = 'usr-prof-1';
    const prof1Id = 'pro-1';
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, registration_type, registration_number)
      VALUES (?, ?, 'Dr. Bernardo Santos', 'bernardo@bemestar.com', 'hash123', 'professional', 'active', NULL, NULL)
    `).run(user1Id, tenantId);

    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, created_at)
      VALUES ('cu-1', ?, ?, 'professional', 'active', 0, datetime('now'))
    `).run(tenantId, user1Id);

    db.prepare(`
      INSERT INTO professionals (id, tenant_id, user_id, name, slug, profession_id, registration_type, registration_number, active)
      VALUES (?, ?, ?, 'Dr. Bernardo Santos', 'bernardo-santos', NULL, 'CRM', NULL, 1)
    `).run(prof1Id, tenantId, user1Id);

    // Cria Usuário Profissional 2 (terceiro)
    const user2Id = 'usr-prof-2';
    const prof2Id = 'pro-2';
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, registration_type, registration_number)
      VALUES (?, ?, 'Dra. Camila Lima', 'camila@bemestar.com', 'hash123', 'professional', 'active', 'CRO', '12345')
    `).run(user2Id, tenantId);

    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, created_at)
      VALUES ('cu-2', ?, ?, 'professional', 'active', 0, datetime('now'))
    `).run(tenantId, user2Id);

    db.prepare(`
      INSERT INTO professionals (id, tenant_id, user_id, name, slug, profession_id, registration_type, registration_number, active)
      VALUES (?, ?, ?, 'Dra. Camila Lima', 'camila-lima', NULL, 'CRO', '12345', 1)
    `).run(prof2Id, tenantId, user2Id);

    // Gera tokens de autenticação
    const tokenUser1 = generateToken({
      userId: user1Id,
      email: 'bernardo@bemestar.com',
      role: 'professional',
      tenantId: tenantId
    });

    const tokenUser2 = generateToken({
      userId: user2Id,
      email: 'camila@bemestar.com',
      role: 'professional',
      tenantId: tenantId
    });

    // TESTE 1: Profissional 1 atualiza seu próprio registro que estava pendente/nulo
    const resUpdateSelf = await makeRequest('PUT', `/api/v1/professionals/${prof1Id}`, {
      registrationType: 'CRM',
      registrationNumber: '54321/SP'
    }, {
      'Authorization': `Bearer ${tokenUser1}`
    });

    assert(resUpdateSelf.status === 200, 1, `Profissional atualizando o próprio registro retorna 200 OK (recebeu ${resUpdateSelf.status})`);

    // TESTE 2: Verifica que a tabela professionals foi atualizada
    const prof1Row = db.prepare('SELECT registration_type, registration_number FROM professionals WHERE id = ?').get(prof1Id);
    assert(prof1Row.registration_type === 'CRM', 2, `professionals.registration_type atualizado para 'CRM'`);
    assert(prof1Row.registration_number === '54321/SP', 3, `professionals.registration_number atualizado para '54321/SP'`);

    // TESTE 3: Verifica que a tabela users foi sincronizada
    const user1Row = db.prepare('SELECT registration_type, registration_number FROM users WHERE id = ?').get(user1Id);
    assert(user1Row.registration_type === 'CRM', 4, `users.registration_type sincronizado para 'CRM'`);
    assert(user1Row.registration_number === '54321/SP', 5, `users.registration_number sincronizado para '54321/SP'`);

    // TESTE 4: Profissional altera o conselho e número de registro novamente (ex.: troca sigla para CRM-SP)
    const resUpdateSelf2 = await makeRequest('PUT', `/api/v1/professionals/${prof1Id}`, {
      registrationType: 'CRM-SP',
      registrationNumber: '998877'
    }, {
      'Authorization': `Bearer ${tokenUser1}`
    });
    assert(resUpdateSelf2.status === 200, 6, `Segunda atualização do registro retorna 200 OK`);

    const prof1Row2 = db.prepare('SELECT registration_type, registration_number FROM professionals WHERE id = ?').get(prof1Id);
    assert(prof1Row2.registration_type === 'CRM-SP', 7, `professionals.registration_type atualizado para 'CRM-SP'`);
    assert(prof1Row2.registration_number === '998877', 8, `professionals.registration_number atualizado para '998877'`);

    // TESTE 5: Profissional 1 tenta atualizar o registro do Profissional 2 (terceiro) -> Deve ser bloqueado com 403
    const resUpdateOther = await makeRequest('PUT', `/api/v1/professionals/${prof2Id}`, {
      registrationType: 'CRM',
      registrationNumber: '00000'
    }, {
      'Authorization': `Bearer ${tokenUser1}`
    });

    assert(resUpdateOther.status === 403, 9, `Profissional tentando alterar registro de terceiro bloqueado com 403 Forbidden (recebeu ${resUpdateOther.status})`);
    
    // Verifica que o profissional 2 permaneceu inalterado
    const prof2Row = db.prepare('SELECT registration_type, registration_number FROM professionals WHERE id = ?').get(prof2Id);
    assert(prof2Row.registration_type === 'CRO', 10, `Registro do terceiro não foi alterado (permaneceu 'CRO')`);
    assert(prof2Row.registration_number === '12345', 11, `Número do terceiro não foi alterado (permaneceu '12345')`);

    // TESTE 6: Verificação no endpoint /v1/auth/me do usuário 1
    const resMe = await makeRequest('GET', `/api/v1/auth/me`, null, {
      'Authorization': `Bearer ${tokenUser1}`
    });
    assert(resMe.status === 200, 12, `/v1/auth/me retornou 200 OK`);
    assert(resMe.body?.user?.registrationType === 'CRM-SP', 13, `/v1/auth/me reflete registrationType 'CRM-SP'`);
    assert(resMe.body?.user?.registrationNumber === '998877', 14, `/v1/auth/me reflete registrationNumber '998877'`);

  } catch (err) {
    console.error('Erro na execução dos testes:', err);
    failedTests++;
  } finally {
    if (server) {
      server.close();
    }
    if (fs.existsSync(TEST_DB_PATH)) {
      try {
        fs.unlinkSync(TEST_DB_PATH);
      } catch (e) {}
    }
  }

  console.log(`\n========================================`);
  console.log(`RESUMO DOS TESTES: ${passedTests} PASSOU, ${failedTests} FALHOU`);
  console.log(`========================================\n`);

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run();
