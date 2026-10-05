/**
 * Testes Automatizados de Validação:
 * - Permissões Padrão do Recepcionista (14 permissões exatas)
 * - Orçamentos para Todos os Profissionais (view_budgets, manage_budgets)
 * - Sem criação de registro em professionals para recepcionista
 * - Sem concessão de módulos clínicos para recepcionista
 * - Rotas de Estoque e Orçamentos permitidas para recepcionista e profissional
 * - Refletido em listStaff, me, login, invites, aprovação e alteração de cargo
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const TEST_DB_PATH = path.resolve(__dirname, 'test_receptionist_and_budget_permissions.db');
process.env.DATABASE_PATH = TEST_DB_PATH;
process.env.JWT_SECRET = 'test-secret-recep-budget-12345';
process.env.EMAIL_OTP_SECRET = 'zemda_otp_secret_key_prod_2026';
const PORT = 3199;
process.env.PORT = String(PORT);

if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { DEFAULT_RECEPTIONIST_PERMISSIONS, DEFAULT_PROFESSIONAL_PERMISSIONS, getDefaultPermissionsForRole } = require('./dist/utils/role-permissions');

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

function createVerificationToken(email, purpose = 'invite_registration') {
  const cleanEmail = email.trim().toLowerCase();
  const vId = 'ver-' + uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO email_verifications (id, email, purpose, code_hash, status, attempts, resend_count, expires_at, verified_at, created_at)
    VALUES (?, ?, ?, 'dummy_hash', 'verified', 0, 0, datetime('now', '+15 minutes'), datetime('now'), datetime('now'))
  `).run(vId, cleanEmail, purpose);

  return jwt.sign(
    {
      email: cleanEmail,
      purpose,
      verified: true,
      verificationId: vId
    },
    process.env.EMAIL_OTP_SECRET,
    { expiresIn: '15m' }
  );
}

const EXPECTED_RECEPTIONIST_PERMS = [
  'view_schedule',
  'create_appointment',
  'edit_appointment',
  'cancel_appointment',
  'create_patient',
  'edit_patient',
  'view_exams',
  'view_financial',
  'issue_receipt',
  'view_receipts',
  'view_budgets',
  'manage_budgets',
  'view_inventory',
  'manage_inventory'
];

async function run() {
  server = app.listen(PORT);
  console.log(`Servidor de teste rodando na porta ${PORT}`);

  try {
    // -----------------------------------------------------------------
    // TEST 1: Preset Canônico de Permissões
    // -----------------------------------------------------------------
    assert(
      Array.isArray(DEFAULT_RECEPTIONIST_PERMISSIONS) &&
      DEFAULT_RECEPTIONIST_PERMISSIONS.length === 14 &&
      EXPECTED_RECEPTIONIST_PERMS.every(p => DEFAULT_RECEPTIONIST_PERMISSIONS.includes(p)),
      1,
      'DEFAULT_RECEPTIONIST_PERMISSIONS contém exatamente as 14 permissões canônicas especificadas'
    );

    assert(
      DEFAULT_PROFESSIONAL_PERMISSIONS.includes('view_budgets') &&
      DEFAULT_PROFESSIONAL_PERMISSIONS.includes('manage_budgets') &&
      !DEFAULT_PROFESSIONAL_PERMISSIONS.includes('view_financial') &&
      !DEFAULT_PROFESSIONAL_PERMISSIONS.includes('view_inventory') &&
      !DEFAULT_PROFESSIONAL_PERMISSIONS.includes('view_exams'),
      2,
      'DEFAULT_PROFESSIONAL_PERMISSIONS contém view_budgets e manage_budgets, e NÃO concede financial/inventory/exams indiscriminadamente'
    );

    // Setup Tenant & Admin
    const tenantId = 't-test-perms';
    db.prepare(`
      INSERT OR REPLACE INTO tenants (id, name, slug, email, status, created_at, updated_at)
      VALUES (?, 'Clínica Bem Viver', 'bem-viver', 'contato@bemviver.com', 'active', datetime('now'), datetime('now'))
    `).run(tenantId);

    const adminToken = jwt.sign(
      { userId: 'usr-admin', email: 'admin@bemviver.com', role: 'clinic_admin', tenantId },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    db.prepare(`
      INSERT OR REPLACE INTO users (id, tenant_id, name, email, password_hash, role, status)
      VALUES ('usr-admin', ?, 'Admin Gestor', 'admin@bemviver.com', 'hash123', 'clinic_admin', 'active')
    `).run(tenantId);

    db.prepare(`
      INSERT OR REPLACE INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json, created_at)
      VALUES ('cu-admin', ?, 'usr-admin', 'clinic_admin', 'active', 1, ?, datetime('now'))
    `).run(tenantId, JSON.stringify(getDefaultPermissionsForRole('clinic_admin')));

    // -----------------------------------------------------------------
    // TEST 3 & 4: Convite de Recepcionista -> Cadastro com Invite
    // -----------------------------------------------------------------
    const recepToken = 'inv-recep-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO clinic_invites (id, tenant_id, token, role, max_uses, used_count, expires_at, status, created_by, created_at, updated_at)
      VALUES ('cinv-recep-1', ?, ?, 'receptionist', 1, 0, datetime('now', '+7 days'), 'pending', 'usr-admin', datetime('now'), datetime('now'))
    `).run(tenantId, recepToken);

    const recepEmail = 'recepcao@bemviver.com';
    const vTokenRecep = createVerificationToken(recepEmail);

    const recepRegRes = await makeRequest('POST', '/api/v1/auth/register-invite', {
      token: recepToken,
      emailVerificationToken: vTokenRecep,
      name: 'Carla Silva',
      email: recepEmail,
      password: 'StrongPassword123!',
      phone: '11999990001'
    });

    if (recepRegRes.status !== 201) {
      console.log('Falha na resposta do recepRegRes:', recepRegRes.status, recepRegRes.body);
    }
    assert(recepRegRes.status === 201, 3, 'Cadastro com convite de recepcionista realizado com sucesso (HTTP 201)');

    const recepUser = db.prepare("SELECT * FROM users WHERE email = ?").get(recepEmail);
    const recepCu = db.prepare("SELECT * FROM clinic_users WHERE user_id = ?").get(recepUser.id);
    const recepProf = db.prepare("SELECT * FROM professionals WHERE user_id = ?").get(recepUser.id);

    const recepPerms = JSON.parse(recepCu.permissions_json || '[]');
    assert(
      recepUser.role === 'receptionist' &&
      recepProf === undefined &&
      EXPECTED_RECEPTIONIST_PERMS.every(p => recepPerms.includes(p)) &&
      recepPerms.length === 14,
      4,
      'Recepcionista via convite recebe 14 permissões padrão em clinic_users.permissions_json e NÃO cria registro em professionals'
    );

    // -----------------------------------------------------------------
    // TEST 5 & 6: Login e /v1/auth/me do Recepcionista
    // -----------------------------------------------------------------
    const recepAuthToken = jwt.sign(
      { userId: recepUser.id, email: recepEmail, role: 'receptionist', tenantId },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const recepMeRes = await makeRequest('GET', '/api/v1/auth/me', null, {
      'Authorization': `Bearer ${recepAuthToken}`
    });

    assert(recepMeRes.status === 200, 5, 'GET /v1/auth/me para recepcionista responde HTTP 200');
    assert(
      recepMeRes.body.user &&
      recepMeRes.body.user.role === 'receptionist' &&
      EXPECTED_RECEPTIONIST_PERMS.every(p => recepMeRes.body.user.permissions.includes(p)),
      6,
      'GET /v1/auth/me retorna todas as 14 permissões canônicas para o recepcionista'
    );

    // -----------------------------------------------------------------
    // TEST 7: Auto-cadastro de Recepcionista + Aprovação pelo Gestor
    // -----------------------------------------------------------------
    const selfRecepRes = await makeRequest('POST', '/api/v1/auth/register', {
      name: 'Ana Recepcionista',
      email: 'ana.recep@bemviver.com',
      password: 'StrongPassword123!',
      role: 'receptionist',
      tenantId: tenantId
    });

    if (selfRecepRes.status !== 201) {
      console.log('Falha na resposta do selfRecepRes:', selfRecepRes.status, selfRecepRes.body);
    }
    assert(selfRecepRes.status === 201, 7, 'Auto-cadastro com role receptionist concluído com HTTP 201 (pendente)');

    const anaUser = db.prepare("SELECT * FROM users WHERE email = 'ana.recep@bemviver.com'").get();
    const anaCuBefore = db.prepare("SELECT * FROM clinic_users WHERE user_id = ?").get(anaUser.id);
    const anaPermsBefore = JSON.parse(anaCuBefore.permissions_json || '[]');
    assert(
      EXPECTED_RECEPTIONIST_PERMS.every(p => anaPermsBefore.includes(p)),
      8,
      'Auto-cadastro salva as 14 permissões padrão para recepcionista pendente'
    );

    // Gestor aprova a recepcionista
    const approveRes = await makeRequest('PUT', `/api/v1/staff/${anaUser.id}/approve`, {}, {
      'Authorization': `Bearer ${adminToken}`
    });
    assert(approveRes.status === 200, 9, 'Aprovação de recepcionista pelo gestor retorna HTTP 200');

    const anaCuAfter = db.prepare("SELECT * FROM clinic_users WHERE user_id = ?").get(anaUser.id);
    const anaPermsAfter = JSON.parse(anaCuAfter.permissions_json || '[]');
    const anaProf = db.prepare("SELECT * FROM professionals WHERE user_id = ?").get(anaUser.id);

    assert(
      anaCuAfter.status === 'active' &&
      anaProf === undefined &&
      EXPECTED_RECEPTIONIST_PERMS.every(p => anaPermsAfter.includes(p)),
      10,
      'Após aprovação, recepcionista está ativa com 14 permissões e SEM registro na tabela professionals'
    );

    // -----------------------------------------------------------------
    // TEST 11 & 12: Convite de Profissional -> Cadastro com Invite
    // -----------------------------------------------------------------
    const profToken = 'inv-prof-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO clinic_invites (id, tenant_id, token, role, max_uses, used_count, expires_at, status, created_by, created_at, updated_at)
      VALUES ('cinv-prof-1', ?, ?, 'professional', 1, 0, datetime('now', '+7 days'), 'pending', 'usr-admin', datetime('now'), datetime('now'))
    `).run(tenantId, profToken);

    const profEmail = 'dr.marcelo@bemviver.com';
    const vTokenProf = createVerificationToken(profEmail);

    const profRegRes = await makeRequest('POST', '/api/v1/auth/register-invite', {
      token: profToken,
      emailVerificationToken: vTokenProf,
      name: 'Dr. Marcelo Dentista',
      email: profEmail,
      password: 'StrongPassword123!',
      professionId: 'prof-dentista',
      professionName: 'Cirurgião-Dentista',
      registrationType: 'CRO',
      registrationNumber: '12345-SP'
    });

    if (profRegRes.status !== 201) {
      console.log('Falha na resposta do profRegRes:', profRegRes.status, profRegRes.body);
    }
    assert(profRegRes.status === 201, 11, 'Cadastro de profissional com convite concluído com HTTP 201');

    const drUser = db.prepare("SELECT * FROM users WHERE email = ?").get(profEmail);
    const drCu = db.prepare("SELECT * FROM clinic_users WHERE user_id = ?").get(drUser.id);
    const drProf = db.prepare("SELECT * FROM professionals WHERE user_id = ?").get(drUser.id);
    const drPerms = JSON.parse(drCu.permissions_json || '[]');

    assert(
      drUser.role === 'professional' &&
      drProf !== undefined &&
      drProf.active === 1 &&
      drPerms.includes('view_budgets') &&
      drPerms.includes('manage_budgets') &&
      !drPerms.includes('view_financial') &&
      !drPerms.includes('view_inventory') &&
      !drPerms.includes('view_exams'),
      12,
      'Profissional via convite tem view_budgets/manage_budgets por padrão, cria registro em professionals, e não recebe financeiro/estoque/exames'
    );

    // -----------------------------------------------------------------
    // TEST 13: GET /v1/auth/me do Profissional
    // -----------------------------------------------------------------
    const drAuthToken = jwt.sign(
      { userId: drUser.id, email: profEmail, role: 'professional', tenantId },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const drMeRes = await makeRequest('GET', '/api/v1/auth/me', null, {
      'Authorization': `Bearer ${drAuthToken}`
    });

    assert(drMeRes.status === 200, 13, 'GET /v1/auth/me para profissional responde HTTP 200');
    assert(
      drMeRes.body.user &&
      drMeRes.body.user.role === 'professional' &&
      drMeRes.body.user.permissions.includes('view_budgets') &&
      drMeRes.body.user.permissions.includes('manage_budgets') &&
      !drMeRes.body.user.permissions.includes('view_financial') &&
      !drMeRes.body.user.permissions.includes('view_inventory') &&
      !drMeRes.body.user.permissions.includes('view_exams'),
      14,
      'GET /v1/auth/me para profissional retorna view_budgets/manage_budgets enriquecidos sem depender do diretor'
    );

    // -----------------------------------------------------------------
    // TEST 15: StaffController.listStaff reflete permissões corretas
    // -----------------------------------------------------------------
    const staffListRes = await makeRequest('GET', '/api/v1/staff', null, {
      'Authorization': `Bearer ${adminToken}`
    });

    assert(staffListRes.status === 200, 15, 'GET /v1/staff responde HTTP 200 para admin');

    const staffMembers = staffListRes.body.staff || [];
    const carlaStaff = staffMembers.find(s => s.email === recepEmail);
    const drStaff = staffMembers.find(s => s.email === profEmail);

    assert(
      carlaStaff &&
      EXPECTED_RECEPTIONIST_PERMS.every(p => carlaStaff.permissions.includes(p)),
      16,
      'listStaff retorna recepcionista com todas as 14 permissões canônicas preenchidas'
    );

    assert(
      drStaff &&
      drStaff.permissions.includes('view_budgets') &&
      drStaff.permissions.includes('manage_budgets'),
      17,
      'listStaff retorna profissional com view_budgets e manage_budgets preenchidos'
    );

    // -----------------------------------------------------------------
    // TEST 18: StaffController.updateRoleProfession para recepcionista
    // -----------------------------------------------------------------
    // Cria um profissional temporário e depois troca o cargo dele para recepcionista
    const updateRoleRes = await makeRequest('PUT', `/api/v1/staff/${drUser.id}/role-profession`, {
      role: 'receptionist',
      professionName: 'Recepcionista'
    }, {
      'Authorization': `Bearer ${adminToken}`
    });

    assert(updateRoleRes.status === 200, 18, 'Alteração de cargo para recepcionista via updateRoleProfession responde HTTP 200');

    const drCuUpdated = db.prepare("SELECT * FROM clinic_users WHERE user_id = ?").get(drUser.id);
    const drProfUpdated = db.prepare("SELECT * FROM professionals WHERE user_id = ?").get(drUser.id);
    const drPermsUpdated = JSON.parse(drCuUpdated.permissions_json || '[]');

    assert(
      drCuUpdated.role === 'receptionist' &&
      drProfUpdated.active === 0 &&
      EXPECTED_RECEPTIONIST_PERMS.every(p => drPermsUpdated.includes(p)),
      19,
      'Ao alterar cargo para recepcionista, registro em professionals é desativado (active=0) e permissões de recepção são mescladas'
    );

    // -----------------------------------------------------------------
    // TEST 20 & 21: Acesso de Rotas de Estoque (Inventory) pelo Recepcionista
    // -----------------------------------------------------------------
    const inventoryListRes = await makeRequest('GET', '/api/v1/inventory', null, {
      'Authorization': `Bearer ${recepAuthToken}`
    });
    assert(inventoryListRes.status === 200, 20, 'Recepcionista consegue acessar GET /v1/inventory (HTTP 200, não 403)');

    const inventoryCreateRes = await makeRequest('POST', '/api/v1/inventory/items', {
      name: 'Luvas de Procedimento P',
      category: 'Insumos',
      quantity: 100,
      unit: 'cx'
    }, {
      'Authorization': `Bearer ${recepAuthToken}`
    });
    assert(inventoryCreateRes.status === 201 || inventoryCreateRes.status === 200, 21, 'Recepcionista consegue criar item no estoque (POST /v1/inventory/items)');

    // -----------------------------------------------------------------
    // TEST 22 & 23: Acesso de Rotas de Orçamentos (Budgets) pelo Profissional e Recepcionista
    // -----------------------------------------------------------------
    // Restaura Dr. Marcelo como profissional para testar rota de orçamentos
    db.prepare("UPDATE users SET role = 'professional' WHERE id = ?").run(drUser.id);
    db.prepare("UPDATE clinic_users SET role = 'professional' WHERE user_id = ?").run(drUser.id);
    db.prepare("UPDATE professionals SET active = 1 WHERE user_id = ?").run(drUser.id);

    const budgetsListProfRes = await makeRequest('GET', '/api/v1/budgets', null, {
      'Authorization': `Bearer ${drAuthToken}`
    });
    assert(budgetsListProfRes.status === 200, 22, 'Profissional consegue listar orçamentos GET /v1/budgets (HTTP 200)');

    const budgetsListRecepRes = await makeRequest('GET', '/api/v1/budgets', null, {
      'Authorization': `Bearer ${recepAuthToken}`
    });
    assert(budgetsListRecepRes.status === 200, 23, 'Recepcionista consegue listar orçamentos GET /v1/budgets (HTTP 200)');

    console.log('\n==============================================');
    console.log(`TOTAL DE TESTES: ${passedTests + failedTests}`);
    console.log(`PASSOU: ${passedTests}`);
    console.log(`FALHOU: ${failedTests}`);
    console.log('==============================================\n');

    if (failedTests > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Erro na execução dos testes:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      try { fs.unlinkSync(TEST_DB_PATH); } catch (_) {}
    }
  }
}

run();
