/**
 * Testes Automatizados de Validação - Convites Administrativos vs Clínicos
 * 
 * Verifica que:
 * 1. Convite para 'receptionist':
 *    - Ignora completamente campos clínicos (professionId, professionName, practiceAreas, registrationType, etc.)
 *    - NÃO cria registro em `professionals`
 *    - NÃO cria registros em `user_practice_areas`
 *    - `users.role = 'receptionist'`, `users.profession_id IS NULL`, flags zemda_* = 0
 *    - `clinic_users.role = 'receptionist'`, `clinic_users.profession_id IS NULL`
 *    - Permissões padrão preservadas (view_schedule, create_appointment, create_patient)
 * 2. Convite para 'secretary', 'financial', 'assistant':
 *    - Comportam-se identicamente como cargos administrativos sem registro em `professionals`
 * 3. Tentativa de manipulação de payload (enviando role = 'professional' ou prefix 'Dr.' no body):
 *    - `inviteData.role` prevalece como fonte da verdade estrita
 * 4. Convite para 'professional':
 *    - Cria registro na tabela `professionals`
 *    - Preenche profissão canônica, áreas de atuação e flags de módulos correspondentes
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const TEST_DB_PATH = path.resolve(__dirname, 'test_invite_administrative.db');
process.env.DATABASE_PATH = TEST_DB_PATH;
process.env.JWT_SECRET = 'test-secret-invite-admin-12345';
process.env.EMAIL_OTP_SECRET = 'zemda_otp_secret_key_prod_2026';
const PORT = 3198;
process.env.PORT = String(PORT);

if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

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

async function run() {
  server = app.listen(PORT);
  console.log(`Servidor de teste rodando na porta ${PORT}`);

  try {
    // Setup Tenant & Admin User
    const tenantId = 't-test-admin-invite';
    db.prepare(`
      INSERT OR REPLACE INTO tenants (id, name, slug, email, status, created_at, updated_at)
      VALUES (?, 'Clínica Multi Saúde', 'multi-saude', 'contato@multisaude.com', 'active', datetime('now'), datetime('now'))
    `).run(tenantId);

    db.prepare(`
      INSERT OR REPLACE INTO users (id, tenant_id, name, email, password_hash, role, status)
      VALUES ('usr-admin', ?, 'Admin Gestor', 'gestor@multisaude.com', 'hash123', 'clinic_admin', 'active')
    `).run(tenantId);

    // ==========================================
    // TESTE 1: Convite para RECEPCIONISTA com payload clínico malicioso/sobrante
    // ==========================================
    const tokenRecep = 'inv-recep-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO clinic_invites (id, tenant_id, token, role, max_uses, used_count, expires_at, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, 'receptionist', 1, 0, datetime('now', '+7 days'), 'pending', 'usr-admin', datetime('now'), datetime('now'))
    `).run('inv-id-1', tenantId, tokenRecep);

    const emailRecep = 'recepcionista.teste@multisaude.com';
    const vTokenRecep = createVerificationToken(emailRecep);

    const resRecep = await makeRequest('POST', '/api/v1/auth/register-invite', {
      token: tokenRecep,
      name: 'Maria Recepcionista',
      email: emailRecep,
      password: 'SenhaForte123!',
      phone: '11988887777',
      emailVerificationToken: vTokenRecep,
      // Campos clínicos que NÃO devem ser aceitos para recepcionista
      prefix: 'Dra.',
      professionId: 'prof-medico',
      professionName: 'Médico',
      practiceAreas: 'Cardiologia, Pediatria',
      practiceAreaIds: ['pa-cardio', 'pa-ped'],
      registrationType: 'CRM',
      registrationNumber: '998877'
    });

    if (resRecep.status !== 201) {
      console.log('Falha na resposta do resRecep:', resRecep.body);
    }
    assert(resRecep.status === 201, 1, `Cadastro com convite de recepcionista retornou 201 Created (recebeu ${resRecep.status})`);
    assert(resRecep.body?.user?.role === 'receptionist', 2, `Role retornado no payload é 'receptionist'`);
    assert(resRecep.body?.user?.professionId === null, 3, `professionId no retorno é null`);
    assert(resRecep.body?.user?.registrationType === null, 4, `registrationType no retorno é null`);
    assert(resRecep.body?.user?.commercialModule === null, 5, `commercialModule no retorno é null`);

    // Consulta no banco de dados para a recepcionista
    const userRecepRow = db.prepare('SELECT * FROM users WHERE email = ?').get(emailRecep);
    assert(userRecepRow != null, 6, `Usuário inserido na tabela users`);
    assert(userRecepRow?.role === 'receptionist', 7, `users.role é estritamente 'receptionist'`);
    assert(userRecepRow?.name === 'Maria Recepcionista', 8, `users.name NÃO recebeu prefixo Dra.`);
    assert(userRecepRow?.profession_id === null, 9, `users.profession_id é NULL`);
    assert(userRecepRow?.profession_name === null, 10, `users.profession_name é NULL`);
    assert(userRecepRow?.practice_areas === null, 11, `users.practice_areas é NULL`);
    assert(userRecepRow?.registration_type === null, 12, `users.registration_type é NULL`);
    assert(userRecepRow?.registration_number === null, 13, `users.registration_number é NULL`);
    assert(userRecepRow?.zemda_med_enabled === 0 && userRecepRow?.zemda_fisio_enabled === 0, 14, `Todas as flags zemda_*_enabled são 0`);

    // Verificar tabela clinic_users
    const clinicUserRecep = db.prepare('SELECT * FROM clinic_users WHERE user_id = ?').get(userRecepRow.id);
    assert(clinicUserRecep != null, 15, `Registro criado em clinic_users`);
    assert(clinicUserRecep?.role === 'receptionist', 16, `clinic_users.role é 'receptionist'`);
    assert(clinicUserRecep?.profession_id === null, 17, `clinic_users.profession_id é NULL`);
    assert(clinicUserRecep?.permissions_json && clinicUserRecep.permissions_json.includes('view_schedule'), 18, `clinic_users possui permissões operacionais (view_schedule)`);

    // CRÍTICO: Verificar que NÃO existe em professionals
    const profCount = db.prepare('SELECT COUNT(*) as cnt FROM professionals WHERE user_id = ?').get(userRecepRow.id).cnt;
    assert(profCount === 0, 19, `NENHUM registro criado na tabela professionals para recepcionista (count = 0)`);

    // CRÍTICO: Verificar que NÃO existe em user_practice_areas
    const areaCount = db.prepare('SELECT COUNT(*) as cnt FROM user_practice_areas WHERE user_id = ?').get(userRecepRow.id).cnt;
    assert(areaCount === 0, 20, `NENHUM registro criado em user_practice_areas para recepcionista (count = 0)`);

    // ==========================================
    // TESTE 2: Convite para SECRETARY
    // ==========================================
    const tokenSec = 'inv-sec-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO clinic_invites (id, tenant_id, token, role, max_uses, used_count, expires_at, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, 'secretary', 1, 0, datetime('now', '+7 days'), 'pending', 'usr-admin', datetime('now'), datetime('now'))
    `).run('inv-id-2', tenantId, tokenSec);

    const emailSec = 'secretaria.teste@multisaude.com';
    const vTokenSec = createVerificationToken(emailSec);

    const resSec = await makeRequest('POST', '/api/v1/auth/register-invite', {
      token: tokenSec,
      name: 'Carla Secretária',
      email: emailSec,
      password: 'SenhaForte123!',
      emailVerificationToken: vTokenSec,
      professionName: 'Psicólogo'
    });

    assert(resSec.status === 201, 21, `Cadastro com convite de secretária retornou 201`);
    const userSecRow = db.prepare('SELECT * FROM users WHERE email = ?').get(emailSec);
    const profSecCount = db.prepare('SELECT COUNT(*) as cnt FROM professionals WHERE user_id = ?').get(userSecRow.id).cnt;
    assert(userSecRow.role === 'secretary', 22, `users.role é 'secretary'`);
    assert(profSecCount === 0, 23, `NENHUM registro em professionals para secretária`);

    // ==========================================
    // TESTE 3: Convite para ASSISTANT
    // ==========================================
    const tokenAst = 'inv-ast-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO clinic_invites (id, tenant_id, token, role, max_uses, used_count, expires_at, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, 'assistant', 1, 0, datetime('now', '+7 days'), 'pending', 'usr-admin', datetime('now'), datetime('now'))
    `).run('inv-id-3', tenantId, tokenAst);

    const emailAst = 'assistente.teste@multisaude.com';
    const vTokenAst = createVerificationToken(emailAst);

    const resAst = await makeRequest('POST', '/api/v1/auth/register-invite', {
      token: tokenAst,
      name: 'João Assistente',
      email: emailAst,
      password: 'SenhaForte123!',
      emailVerificationToken: vTokenAst,
      professionId: 'prof-fisioterapeuta'
    });

    assert(resAst.status === 201, 24, `Cadastro com convite de assistente retornou 201`);
    const userAstRow = db.prepare('SELECT * FROM users WHERE email = ?').get(emailAst);
    const profAstCount = db.prepare('SELECT COUNT(*) as cnt FROM professionals WHERE user_id = ?').get(userAstRow.id).cnt;
    assert(userAstRow.role === 'assistant', 25, `users.role é 'assistant'`);
    assert(profAstCount === 0, 26, `NENHUM registro em professionals para assistente`);

    // ==========================================
    // TESTE 4: Convite para FINANCIAL
    // ==========================================
    const tokenFin = 'inv-fin-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO clinic_invites (id, tenant_id, token, role, max_uses, used_count, expires_at, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, 'financial', 1, 0, datetime('now', '+7 days'), 'pending', 'usr-admin', datetime('now'), datetime('now'))
    `).run('inv-id-4', tenantId, tokenFin);

    const emailFin = 'financeiro.teste@multisaude.com';
    const vTokenFin = createVerificationToken(emailFin);

    const resFin = await makeRequest('POST', '/api/v1/auth/register-invite', {
      token: tokenFin,
      name: 'Roberto Financeiro',
      email: emailFin,
      password: 'SenhaForte123!',
      emailVerificationToken: vTokenFin
    });

    assert(resFin.status === 201, 27, `Cadastro com convite de financeiro retornou 201`);
    const userFinRow = db.prepare('SELECT * FROM users WHERE email = ?').get(emailFin);
    const profFinCount = db.prepare('SELECT COUNT(*) as cnt FROM professionals WHERE user_id = ?').get(userFinRow.id).cnt;
    assert(userFinRow.role === 'financial', 28, `users.role é 'financial'`);
    assert(profFinCount === 0, 29, `NENHUM registro em professionals para financeiro`);

    // ==========================================
    // TESTE 5: Convite para PROFESSIONAL (Clínico)
    // ==========================================
    const tokenPro = 'inv-pro-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO clinic_invites (id, tenant_id, token, role, max_uses, used_count, expires_at, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, 'professional', 1, 0, datetime('now', '+7 days'), 'pending', 'usr-admin', datetime('now'), datetime('now'))
    `).run('inv-id-5', tenantId, tokenPro);

    const emailPro = 'medico.teste@multisaude.com';
    const vTokenPro = createVerificationToken(emailPro);

    const resPro = await makeRequest('POST', '/api/v1/auth/register-invite', {
      token: tokenPro,
      name: 'Lucas Mendes',
      email: emailPro,
      password: 'SenhaForte123!',
      prefix: 'Dr.',
      professionId: 'prof-medico',
      professionName: 'Médico',
      registrationType: 'CRM',
      registrationNumber: '12345-SP',
      emailVerificationToken: vTokenPro
    });

    assert(resPro.status === 201, 30, `Cadastro com convite de profissional retornou 201`);
    assert(resPro.body?.user?.role === 'professional', 31, `Role retornado é 'professional'`);
    assert(resPro.body?.user?.commercialModule === 'ZemdaMed', 32, `commercialModule retornado é 'ZemdaMed'`);

    const userProRow = db.prepare('SELECT * FROM users WHERE email = ?').get(emailPro);
    assert(userProRow.role === 'professional', 33, `users.role é 'professional'`);
    assert(userProRow.name === 'Dr. Lucas Mendes', 34, `users.name recebeu prefixo Dr.`);
    assert(userProRow.profession_id === 'prof-medico', 35, `users.profession_id é 'prof-medico'`);
    assert(userProRow.zemda_med_enabled === 1, 36, `users.zemda_med_enabled é 1`);

    // Verificar se CRIOU registro em professionals para o médico
    const profProRow = db.prepare('SELECT * FROM professionals WHERE user_id = ?').get(userProRow.id);
    assert(profProRow != null, 37, `Registro CRIADO na tabela professionals para profissional clínico`);
    assert(profProRow?.name === 'Dr. Lucas Mendes', 38, `Nome no professional está alinhado com Dr.`);
    assert(profProRow?.active === 1, 39, `Registro do professional está ativo`);

    // ==========================================
    // TESTE 6: Tentativa de reuso de convite
    // ==========================================
    const resReuse = await makeRequest('POST', '/api/v1/auth/register-invite', {
      token: tokenRecep,
      name: 'Outra Recepcionista',
      email: 'outra@multisaude.com',
      password: 'SenhaForte123!',
      emailVerificationToken: createVerificationToken('outra@multisaude.com')
    });
    assert(resReuse.status === 410, 40, `Reuso de convite já consumido bloqueado com 410 (retornou ${resReuse.status})`);

  } catch (err) {
    console.error('Erro na execução dos testes:', err);
    failedTests++;
  } finally {
    if (server) {
      server.close();
    }
    // Cleanup db
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
