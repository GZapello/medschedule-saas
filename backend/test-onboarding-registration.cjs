/**
 * Automated Test Suite: Registration & Post-Registration Onboarding Flow
 *
 * Verifies:
 * 1. Immediate account creation with essential data (status = pending_verification)
 * 2. 409 ACCOUNT_EXISTS_ONBOARDING_PENDING on duplicate registration with pending onboarding
 * 3. 403 ONBOARDING_INCOMPLETE on operational routes (e.g. /v1/patients) for pending accounts
 * 4. Resend OTP (/v1/onboarding/resend-otp)
 * 5. Invalid OTP handling (/v1/onboarding/verify-email)
 * 6. Valid OTP verification transitioning to pending_plan
 * 7. Querying onboarding state (/v1/onboarding/current-state)
 * 8. Plan selection (/v1/onboarding/select-plan) transitioning to pending_profile
 * 9. Operational access still blocked in pending_profile
 * 10. Complete profile (/v1/onboarding/complete-profile) activating account
 * 11. Operational access permitted once active
 * 12. Login and /auth/me return correct onboardingStatus and needsOnboarding
 * 13. Existing active accounts remain 100% functional and bypass onboarding
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_onboarding_reg.db');
process.env.JWT_SECRET = 'test-secret-onboarding-123';
process.env.EMAIL_OTP_SECRET = 'test-otp-secret-must-be-long-enough-12345';
process.env.PORT = '3099';

if (fs.existsSync(process.env.DATABASE_PATH)) {
  fs.unlinkSync(process.env.DATABASE_PATH);
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { EmailService } = require('./dist/services/email.service');

// Intercept requestVerificationCode for hermetic testing without needing live external Resend API
let lastGeneratedOtp = '123456';
EmailService.requestVerificationCode = async function(email, purpose = 'clinic_registration', ip = undefined, isExisting = false) {
  const code = '123456';
  lastGeneratedOtp = code;
  const codeHash = EmailService.hashCode(email, code, purpose);
  const verificationId = 'ev_' + uuidv4().replace(/-/g, '').slice(0, 16);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  db.prepare(`
    UPDATE email_verifications
    SET status = 'invalidated'
    WHERE email = ? AND purpose = ? AND (status = 'pending' OR (status = 'verified' AND consumed_at IS NULL))
  `).run(email, purpose);

  db.prepare(`
    INSERT INTO email_verifications (
      id, email, purpose, code_hash, status, attempts, resend_count,
      expires_at, verified_at, consumed_at, last_sent_at, ip_address, created_at
    ) VALUES (?, ?, ?, ?, 'pending', 0, 1, ?, NULL, NULL, datetime('now'), ?, datetime('now'))
  `).run(verificationId, email, purpose, codeHash, expiresAt, ip || null);

  return { success: true };
};

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
      port: 3099,
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
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data });
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
  const server = app.listen(3099);
  console.log('\n====================================================');
  console.log('TESTES AUTOMATIZADOS: FLUXO DE CADASTRO E ONBOARDING');
  console.log('====================================================\n');

  try {
    // -------------------------------------------------------------------------
    // 1. CRIAÇÃO IMEDIATA DA CONTA COM DADOS ESSENCIAIS
    // -------------------------------------------------------------------------
    console.log('--- 1. CADASTRO INICIAL (DADOS ESSENCIAIS) ---');

    const regPayload = {
      clinicName: 'Clínica Cardio Vida',
      adminName: 'Dra. Roberta Santos',
      email: 'roberta@cardiovida.com',
      phone: '11988887777',
      professionId: 'medico',
      password: 'SenhaSegura123!',
      acceptTerms: true,
      acceptPrivacy: true
    };

    const regRes = await makeRequest('POST', '/api/v1/public/tenants/register', {}, regPayload);
    assert(regRes.status === 201, `Status do cadastro deve ser 201 Created (recebeu ${regRes.status})`);
    assert(!!regRes.data.token, 'Token JWT retornado no cadastro imediato');
    assert(regRes.data.onboardingStatus === 'pending_verification', 'onboardingStatus inicial deve ser pending_verification');

    const userToken = regRes.data.token;
    const authHeaders = { Authorization: `Bearer ${userToken}` };

    const dbUser = db.prepare('SELECT * FROM users WHERE email = ?').get('roberta@cardiovida.com');
    assert(dbUser && dbUser.onboarding_status === 'pending_verification', 'Usuário criado no banco com onboarding_status = pending_verification');
    assert(dbUser && dbUser.email_verified === 0, 'Usuário criado com email_verified = 0');

    const dbTenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(dbUser.tenant_id);
    assert(dbTenant && dbTenant.onboarding_status === 'pending_verification', 'Tenant criado com onboarding_status = pending_verification');

    const otpCodeRow = db.prepare('SELECT * FROM email_verifications WHERE email = ? ORDER BY rowid DESC LIMIT 1').get('roberta@cardiovida.com');
    assert(!!otpCodeRow && otpCodeRow.status === 'pending', 'Registro de verificação OTP criado com status pending');

    // -------------------------------------------------------------------------
    // 2. TENTATIVA DE CADASTRO COM EMAIL PENDENTE DEVE RETORNAR 409
    // -------------------------------------------------------------------------
    console.log('\n--- 2. TENTATIVA DE CADASTRO COM MESMO EMAIL (PENDENTE) ---');
    const dupRes = await makeRequest('POST', '/api/v1/public/tenants/register', {}, regPayload);
    assert(dupRes.status === 409, `Cadastro duplicado deve retornar 409 (recebeu ${dupRes.status})`);
    assert(dupRes.data.code === 'ACCOUNT_EXISTS_ONBOARDING_PENDING', 'Código de erro deve ser ACCOUNT_EXISTS_ONBOARDING_PENDING');

    // -------------------------------------------------------------------------
    // 3. BLOQUEIO DE ROTAS OPERACIONAIS EM pending_verification
    // -------------------------------------------------------------------------
    console.log('\n--- 3. GATE DE ONBOARDING: BLOQUEIO DE ROTAS OPERACIONAIS ---');
    const patRes = await makeRequest('GET', '/api/v1/patients', authHeaders);
    assert(patRes.status === 403, `Acesso a /v1/patients deve retornar 403 Forbidden (recebeu ${patRes.status})`);
    assert(patRes.data.code === 'ONBOARDING_INCOMPLETE', 'Código do erro deve ser ONBOARDING_INCOMPLETE');

    // -------------------------------------------------------------------------
    // 4. REENVIO DE OTP
    // -------------------------------------------------------------------------
    console.log('\n--- 4. REENVIO DE CÓDIGO OTP ---');
    const resendRes = await makeRequest('POST', '/api/v1/onboarding/resend-otp', authHeaders);
    assert(resendRes.status === 200, `Reenvio de OTP deve retornar 200 OK (recebeu ${resendRes.status})`);

    const newOtpRow = db.prepare('SELECT * FROM email_verifications WHERE email = ? ORDER BY rowid DESC LIMIT 1').get('roberta@cardiovida.com');
    assert(!!newOtpRow && newOtpRow.status === 'pending', 'Novo registro de OTP com status pending');

    // -------------------------------------------------------------------------
    // 5. CÓDIGO OTP INVÁLIDO
    // -------------------------------------------------------------------------
    console.log('\n--- 5. VERIFICAÇÃO DE OTP COM CÓDIGO INVÁLIDO ---');
    const badOtpRes = await makeRequest('POST', '/api/v1/onboarding/verify-email', authHeaders, { code: '000000' });
    assert(badOtpRes.status === 400, `Código incorreto deve retornar 400 (recebeu ${badOtpRes.status})`);

    // -------------------------------------------------------------------------
    // 6. CÓDIGO OTP VÁLIDO -> TRANSIÇÃO PARA pending_plan
    // -------------------------------------------------------------------------
    console.log('\n--- 6. VERIFICAÇÃO DE OTP COM CÓDIGO VÁLIDO ---');
    const goodOtpRes = await makeRequest('POST', '/api/v1/onboarding/verify-email', authHeaders, { code: lastGeneratedOtp });
    assert(goodOtpRes.status === 200, `Código correto deve retornar 200 OK (recebeu ${goodOtpRes.status})`);
    assert(goodOtpRes.data.onboardingStatus === 'pending_plan', 'Novo onboardingStatus retornado deve ser pending_plan');

    const dbUserAfterOtp = db.prepare('SELECT * FROM users WHERE email = ?').get('roberta@cardiovida.com');
    assert(dbUserAfterOtp.email_verified === 1, 'Banco: email_verified atualizado para 1');
    assert(dbUserAfterOtp.onboarding_status === 'pending_plan', 'Banco: user.onboarding_status = pending_plan');

    // -------------------------------------------------------------------------
    // 7. CONSULTA DO ESTADO ATUAL DO ONBOARDING
    // -------------------------------------------------------------------------
    console.log('\n--- 7. CONSULTA DE ESTADO ATUAL (/v1/onboarding/current-state) ---');
    const stateRes = await makeRequest('GET', '/api/v1/onboarding/current-state', authHeaders);
    assert(stateRes.status === 200, `current-state retorna 200 (recebeu ${stateRes.status})`);
    assert(stateRes.data.onboardingStatus === 'pending_plan', 'current-state retorna pending_plan');
    assert(stateRes.data.emailVerified === true, 'current-state retorna emailVerified: true');
    assert(stateRes.data.professionId === 'prof-medico', `current-state retorna professionId correspondente (recebeu ${stateRes.data.professionId})`);

    // -------------------------------------------------------------------------
    // 8. ESCOLHA DE PLANO / TRIAL -> TRANSIÇÃO PARA pending_profile
    // -------------------------------------------------------------------------
    console.log('\n--- 8. SELEÇÃO DE PLANO / TRIAL ---');
    const planRes = await makeRequest('POST', '/api/v1/onboarding/select-plan', authHeaders, { planCode: 'SOLO', startTrial: true });
    assert(planRes.status === 200, `select-plan retorna 200 OK (recebeu ${planRes.status})`);
    assert(planRes.data.onboardingStatus === 'pending_profile', 'onboardingStatus atualizado para pending_profile');

    const dbUserAfterPlan = db.prepare('SELECT * FROM users WHERE email = ?').get('roberta@cardiovida.com');
    assert(dbUserAfterPlan.onboarding_status === 'pending_profile', 'Banco: user.onboarding_status = pending_profile');

    // -------------------------------------------------------------------------
    // 9. ACESSO OPERACIONAL AINDA BLOQUEADO EM pending_profile
    // -------------------------------------------------------------------------
    console.log('\n--- 9. ACESSO OPERACIONAL BLOQUEADO EM pending_profile ---');
    const patRes2 = await makeRequest('GET', '/api/v1/patients', authHeaders);
    assert(patRes2.status === 403, `Rotas clínicas continuam bloqueadas em pending_profile (recebeu ${patRes2.status})`);

    // -------------------------------------------------------------------------
    // 10. CONCLUSÃO DO PERFIL PROFISSIONAL -> TRANSIÇÃO PARA active
    // -------------------------------------------------------------------------
    console.log('\n--- 10. CONCLUSÃO DE PERFIL PROFISSIONAL ---');
    const profRes = await makeRequest('POST', '/api/v1/onboarding/complete-profile', authHeaders, {
      specialties: ['Cardiologia', 'Clínica Médica'],
      registrationType: 'CRM',
      registrationNumber: '998877-SP'
    });
    assert(profRes.status === 200, `complete-profile retorna 200 OK (recebeu ${profRes.status})`);
    assert(profRes.data.onboardingStatus === 'active', 'onboardingStatus atualizado para active');

    const dbUserFinal = db.prepare('SELECT * FROM users WHERE email = ?').get('roberta@cardiovida.com');
    assert(dbUserFinal.onboarding_status === 'active', 'Banco: user.onboarding_status = active');

    const dbTenantFinal = db.prepare('SELECT * FROM tenants WHERE id = ?').get(dbUserFinal.tenant_id);
    assert(dbTenantFinal.onboarding_status === 'active', 'Banco: tenant.onboarding_status = active');

    const dbProf = db.prepare('SELECT * FROM professionals WHERE user_id = ?').get(dbUserFinal.id);
    assert(dbProf && dbProf.active === 1, 'Banco: professional ativado (active = 1)');
    assert(dbProf && dbProf.registration_number === '998877-SP', 'Banco: número de registro gravado no profissional');
    assert(dbProf && dbProf.registration_type === 'CRM', 'Banco: tipo de registro CRM gravado no profissional');

    // -------------------------------------------------------------------------
    // 11. ACESSO OPERACIONAL LIBERADO APÓS ONBOARDING ATIVO
    // -------------------------------------------------------------------------
    console.log('\n--- 11. ACESSO OPERACIONAL LIBERADO APÓS ATIVAÇÃO ---');
    const patResActive = await makeRequest('GET', '/api/v1/patients', authHeaders);
    assert(patResActive.status === 200, `Acesso a /v1/patients liberado com 200 OK (recebeu ${patResActive.status})`);

    // -------------------------------------------------------------------------
    // 12. LOGIN E RESUMO DE CONTA PENDENTE (REENTRADA)
    // -------------------------------------------------------------------------
    console.log('\n--- 12. REENTRADA: LOGIN DE USUÁRIO COM ONBOARDING PENDENTE ---');
    // Registra outro usuário pendente
    const pendingReg = await makeRequest('POST', '/api/v1/public/tenants/register', {}, {
      clinicName: 'Clínica Fono Foco',
      adminName: 'Fga. Amanda Costa',
      email: 'amanda@fonofoco.com',
      phone: '11977776666',
      professionId: 'fonoaudiologia',
      password: 'SenhaFono123!',
      acceptTerms: true,
      acceptPrivacy: true
    });
    assert(pendingReg.status === 201, 'Segundo usuário cadastrado com sucesso');

    // Login com esse usuário pendente
    const loginRes = await makeRequest('POST', '/api/v1/auth/login', {}, {
      email: 'amanda@fonofoco.com',
      password: 'SenhaFono123!'
    });
    assert(loginRes.status === 200, `Login do usuário pendente permitido com 200 OK (recebeu ${loginRes.status})`);
    assert(loginRes.data.needsOnboarding === true, 'needsOnboarding retornado como true');
    assert(loginRes.data.onboardingStatus === 'pending_verification', 'onboardingStatus retornado como pending_verification');

    // GET /v1/auth/me do usuário pendente
    const meRes = await makeRequest('GET', '/api/v1/auth/me', { Authorization: `Bearer ${loginRes.data.token}` });
    assert(meRes.status === 200, `GET /auth/me do pendente retorna 200 OK (recebeu ${meRes.status})`);
    assert(meRes.data.user.needsOnboarding === true, '/auth/me retorna user.needsOnboarding: true');
    assert(meRes.data.user.onboardingStatus === 'pending_verification', '/auth/me retorna user.onboardingStatus: pending_verification');

    // -------------------------------------------------------------------------
    // 13. COMPATIBILIDADE COM USUÁRIOS E CLÍNICAS JÁ ATIVAS
    // -------------------------------------------------------------------------
    console.log('\n--- 13. USUÁRIO JÁ ATIVO (LEGADO OU CONCLUÍDO) ---');
    const activeLogin = await makeRequest('POST', '/api/v1/auth/login', {}, {
      email: 'roberta@cardiovida.com',
      password: 'SenhaSegura123!'
    });
    assert(activeLogin.status === 200, 'Login do usuário ativo realizado com sucesso');
    assert(activeLogin.data.needsOnboarding === false, 'needsOnboarding retornado como false para usuário ativo');
    assert(activeLogin.data.onboardingStatus === 'active', 'onboardingStatus retornado como active para usuário ativo');

    console.log('\n====================================================');
    console.log(`RESULTADO FINAL: ${passedTests} PASSOU | ${failedTests} FALHOU`);
    console.log('====================================================\n');

  } catch (err) {
    console.error('ERRO FATAL NA EXECUÇÃO:', err);
    failedTests++;
  } finally {
    server.close();
    if (fs.existsSync(process.env.DATABASE_PATH)) {
      try {
        fs.unlinkSync(process.env.DATABASE_PATH);
      } catch (e) {}
    }
    process.exit(failedTests > 0 ? 1 : 0);
  }
}

runTests();
