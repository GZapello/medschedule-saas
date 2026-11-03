// Teste automatizado abrangente para correção do cadastro com Google no Zemda
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// 1. Configurar banco temporário isolado
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-google-auth-test-'));
const testDbPath = path.join(tmpDir, 'test-auth.db');
process.env.DATABASE_PATH = testDbPath;
process.env.JWT_SECRET = 'test-jwt-secret-key-32-characters-minimum-for-testing';
process.env.APP_URL = 'http://localhost:3000';

const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();

const { AuthController } = require('./dist/controllers/auth.controller');
const { GoogleAuthService } = require('./dist/services/google-auth.service');
const { BillingService } = require('./dist/services/billing.service');

// Helper mock para requisição e resposta do Express
function createMockReqRes(body = {}, headers = {}) {
  let resStatus = 200;
  let resJson = null;
  const res = {
    status(s) {
      resStatus = s;
      return this;
    },
    json(data) {
      resJson = data;
      return this;
    }
  };
  const req = {
    body,
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0', ...headers },
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' }
  };
  return { req, res, getStatus: () => resStatus, getJson: () => resJson };
}

async function runTests() {
  console.log('\n=============================================================');
  console.log('--- TESTE CRÍTICO: CORREÇÃO DO CADASTRO COM GOOGLE NO ZEMDA ---');
  console.log('=============================================================\n');

  let passedCount = 0;
  const originalVerify = GoogleAuthService.verifyIdToken;

  try {
    // -------------------------------------------------------------
    // TESTE 1: Auditoria do SQL INSERT INTO users
    // -------------------------------------------------------------
    console.log('1. Validando contagem de colunas e valores no SQL do controller...');
    const authCode = fs.readFileSync(path.join(__dirname, 'src', 'controllers', 'auth.controller.ts'), 'utf8');

    // Extrai o bloco INSERT INTO users do fluxo signup (etapa 'user')
    const signupMatch = authCode.match(/currentStep = 'user';[\s\S]*?INSERT INTO users \(([\s\S]+?)\)\s*VALUES\s*\(([\s\S]+?)\)\s*`\s*\)\.run\(([\s\S]+?)\);/);
    assert.ok(signupMatch, 'Bloco INSERT INTO users da etapa user não encontrado em auth.controller.ts');

    const columnsPart = signupMatch[1];
    const valuesPart = signupMatch[2];
    const runArgsPart = signupMatch[3];

    const columns = columnsPart.split(',').map(c => c.trim()).filter(Boolean);
    const valueExprs = valuesPart.split(',').map(v => v.trim()).filter(Boolean);
    const runArgs = runArgsPart.split(',').map(a => a.trim()).filter(Boolean);

    console.log(`   - Colunas declaradas: ${columns.length}`);
    console.log(`   - Expressões em VALUES: ${valueExprs.length}`);
    console.log(`   - Argumentos passados em .run(): ${runArgs.length}`);

    assert.equal(columns.length, 36, 'A instrução SQL deve conter exatamente 36 colunas.');
    assert.equal(valueExprs.length, 36, 'A cláusula VALUES deve conter exatamente 36 expressões.');
    assert.equal(columns.length, valueExprs.length, 'Inconsistência entre colunas e valores!');

    const placeholdersCount = (valuesPart.match(/\?/g) || []).length;
    console.log(`   - Placeholders (?) em VALUES: ${placeholdersCount}`);
    assert.equal(placeholdersCount, 26, 'A cláusula VALUES deve conter 26 placeholders (?)');
    assert.equal(runArgs.length, 26, 'Devem ser passados 26 argumentos para .run()');

    const blockedReasonColIdx = columns.indexOf('blocked_reason');
    const blockedUntilColIdx = columns.indexOf('blocked_until');
    assert.ok(blockedReasonColIdx >= 0, 'Coluna blocked_reason ausente');
    assert.ok(blockedUntilColIdx >= 0, 'Coluna blocked_until ausente');
    assert.equal(valueExprs[blockedReasonColIdx].toUpperCase(), 'NULL', 'blocked_reason deve receber NULL');
    assert.equal(valueExprs[blockedUntilColIdx].toUpperCase(), 'NULL', 'blocked_until deve receber NULL');

    console.log('   ✓ SQL verificado: 36 colunas mapeadas 1:1 para 36 valores com NULL para moderação.');
    passedCount++;

    // -------------------------------------------------------------
    // TESTE 2: Cadastro Google Novo (fluxo completo)
    // -------------------------------------------------------------
    console.log('\n2. Testando cadastro de nova conta via Google...');
    GoogleAuthService.verifyIdToken = async (token) => {
      if (token === 'mock-google-token-new') {
        return {
          sub: 'google-sub-1001',
          email: 'dr.marcelo@zemdatest.com',
          name: 'Dr. Marcelo Silva',
          picture: 'https://lh3.googleusercontent.com/a/mock1',
          emailVerified: true
        };
      }
      throw new Error('Token inválido');
    };

    const { req: req1, res: res1, getStatus: getStatus1, getJson: getJson1 } = createMockReqRes({
      idToken: 'mock-google-token-new',
      context: 'signup',
      additionalData: {
        responsibleName: 'Dr. Marcelo Silva',
        phone: '11987654321',
        profession: 'Fisioterapeuta',
        professionId: 'prof-fisioterapeuta',
        termsAccepted: true,
        privacyAccepted: true,
        startTrial: true
      }
    });

    await AuthController.googleAuth(req1, res1);
    assert.equal(getStatus1(), 201, `Status esperado 201, recebeu ${getStatus1()}: ${JSON.stringify(getJson1())}`);
    const resBody1 = getJson1();
    assert.ok(resBody1.token, 'Token JWT ausente na resposta');
    assert.ok(resBody1.user, 'Dados do usuário ausentes na resposta');
    assert.ok(resBody1.tenant, 'Dados do tenant ausentes na resposta');

    // Valida dados no banco de dados SQLite
    const userInDb = db.prepare('SELECT * FROM users WHERE google_sub = ?').get('google-sub-1001');
    assert.ok(userInDb, 'Usuário não foi inserido no banco de dados');
    assert.equal(userInDb.email, 'dr.marcelo@zemdatest.com');
    assert.equal(userInDb.auth_provider, 'google');
    assert.equal(userInDb.email_verified, 1);
    assert.equal(userInDb.blocked_reason, null);
    assert.equal(userInDb.blocked_until, null);
    assert.equal(userInDb.zemda_fisio_enabled, 1);
    assert.equal(userInDb.onboarding_status, 'pending_plan');

    // Valida tenant
    const tenantInDb = db.prepare('SELECT * FROM tenants WHERE id = ?').get(userInDb.tenant_id);
    assert.ok(tenantInDb, 'Tenant não foi criado');
    assert.equal(tenantInDb.responsible_name, 'Dr. Marcelo Silva');

    // Valida clinic_user
    const clinicUserInDb = db.prepare('SELECT * FROM clinic_users WHERE user_id = ?').get(userInDb.id);
    assert.ok(clinicUserInDb, 'clinic_users não foi criado');
    assert.equal(clinicUserInDb.is_manager, 1);

    // Valida professional e agenda padrão
    const profInDb = db.prepare('SELECT * FROM professionals WHERE user_id = ?').get(userInDb.id);
    assert.ok(profInDb, 'professional não foi criado');
    assert.equal(profInDb.name, 'Dr. Marcelo Silva');
    const schedules = db.prepare('SELECT * FROM schedules WHERE professional_id = ?').all(profInDb.id);
    assert.ok(schedules.length > 0, 'Schedules padrão não foram criados');

    // Valida legal_acceptances
    const legalInDb = db.prepare('SELECT * FROM legal_acceptances WHERE user_id = ?').get(userInDb.id);
    assert.ok(legalInDb, 'legal_acceptances não foi criado');

    console.log('   ✓ Nova conta Google criada com sucesso (User, Tenant, ClinicUser, Professional, Schedules, Trial).');
    passedCount++;

    // -------------------------------------------------------------
    // TESTE 3: Idempotência de cliques repetidos / retentativa
    // -------------------------------------------------------------
    console.log('\n3. Testando idempotência para cliques repetidos com Google...');
    const { req: reqRetry, res: resRetry, getStatus: getStatusRetry, getJson: getJsonRetry } = createMockReqRes({
      idToken: 'mock-google-token-new',
      context: 'signup',
      additionalData: {
        responsibleName: 'Dr. Marcelo Silva',
        phone: '11987654321',
        profession: 'Fisioterapeuta',
        professionId: 'prof-fisioterapeuta',
        termsAccepted: true,
        privacyAccepted: true,
        startTrial: true
      }
    });

    await AuthController.googleAuth(reqRetry, resRetry);
    assert.equal(getStatusRetry(), 200, `Retentativa idempotente deve retornar 200, recebeu ${getStatusRetry()}`);
    const retryBody = getJsonRetry();
    assert.equal(retryBody.user.id, userInDb.id, 'Deve retornar a mesma conta sem duplicar');

    // Confirma que não duplicou no banco
    const userCount = db.prepare('SELECT count(*) as count FROM users WHERE google_sub = ?').get('google-sub-1001').count;
    assert.equal(userCount, 1, 'Não pode haver contas duplicadas!');
    console.log('   ✓ Idempotência confirmada: cliques repetidos retornam a sessão sem duplicar usuário.');
    passedCount++;

    // -------------------------------------------------------------
    // TESTE 4: E-mail duplicado de conta não vinculada
    // -------------------------------------------------------------
    console.log('\n4. Testando tentativa de cadastro com e-mail já existente (conta local)...');
    const localUserId = 'usr-local-1';
    const localTenantId = 'ten-local-1';
    db.prepare(`
      INSERT INTO tenants (id, slug, name, trade_name, email, status, created_at, updated_at)
      VALUES (?, 'clinica-local', 'Clínica Local', 'Clínica Local', 'existente@zemdatest.com', 'active', datetime('now'), datetime('now'))
    `).run(localTenantId);
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, auth_provider, created_at, updated_at)
      VALUES (?, ?, 'Usuário Local', 'existente@zemdatest.com', '$2a$10$abcdef', 'clinic_admin', 'active', 'local', datetime('now'), datetime('now'))
    `).run(localUserId, localTenantId);

    GoogleAuthService.verifyIdToken = async (token) => {
      if (token === 'mock-google-token-dup-email') {
        return {
          sub: 'google-sub-9999',
          email: 'existente@zemdatest.com',
          name: 'Nome Google',
          emailVerified: true
        };
      }
      throw new Error('Token inválido');
    };

    const { req: reqDup, res: resDup, getStatus: getStatusDup, getJson: getJsonDup } = createMockReqRes({
      idToken: 'mock-google-token-dup-email',
      context: 'signup',
      additionalData: {
        responsibleName: 'Dr. Outro',
        phone: '11988887777',
        termsAccepted: true,
        privacyAccepted: true
      }
    });

    await AuthController.googleAuth(reqDup, resDup);
    assert.equal(getStatusDup(), 409, 'Deve retornar 409 para e-mail já cadastrado');
    assert.equal(getJsonDup().code, 'EMAIL_ALREADY_EXISTS');
    console.log('   ✓ Bloqueio de e-mail duplicado retornou 409 com código EMAIL_ALREADY_EXISTS.');
    passedCount++;

    // -------------------------------------------------------------
    // TESTE 5: Token Google inválido ou expirado
    // -------------------------------------------------------------
    console.log('\n5. Testando rejeição de token Google expirado ou inválido...');
    GoogleAuthService.verifyIdToken = async () => {
      const err = new Error('Credencial do Google expirada.');
      err.status = 401;
      throw err;
    };

    const { req: reqInv, res: resInv, getStatus: getStatusInv, getJson: getJsonInv } = createMockReqRes({
      idToken: 'expired-token',
      context: 'signup',
      additionalData: {
        responsibleName: 'Dr. Teste',
        phone: '11987654321',
        termsAccepted: true,
        privacyAccepted: true
      }
    });

    await AuthController.googleAuth(reqInv, resInv);
    assert.equal(getStatusInv(), 401, 'Deve retornar 401');
    assert.equal(getJsonInv().code, 'INVALID_GOOGLE_TOKEN');
    assert.ok(getJsonInv().correlationId, 'Deve incluir correlationId');
    console.log('   ✓ Token inválido/expirado retorna 401 com INVALID_GOOGLE_TOKEN e correlationId.');
    passedCount++;

    // -------------------------------------------------------------
    // TESTE 6: E-mail não verificado pelo Google
    // -------------------------------------------------------------
    console.log('\n6. Testando rejeição de e-mail não verificado pelo Google...');
    GoogleAuthService.verifyIdToken = async () => ({
      sub: 'google-sub-unverified',
      email: 'naoverificado@gmail.com',
      name: 'Dr. Não Verificado',
      emailVerified: false
    });

    const { req: reqUnv, res: resUnv, getStatus: getStatusUnv, getJson: getJsonUnv } = createMockReqRes({
      idToken: 'mock-unverified-token',
      context: 'signup',
      additionalData: {
        responsibleName: 'Dr. Não Verificado',
        phone: '11987654321',
        termsAccepted: true,
        privacyAccepted: true
      }
    });

    await AuthController.googleAuth(reqUnv, resUnv);
    assert.equal(getStatusUnv(), 400, 'Deve retornar 400 para e-mail não verificado');
    assert.equal(getJsonUnv().code, 'EMAIL_NOT_VERIFIED');
    console.log('   ✓ E-mail não verificado retorna 400 com código EMAIL_NOT_VERIFIED.');
    passedCount++;

    // -------------------------------------------------------------
    // TESTE 7: Validação de campos obrigatórios (Telefone/WhatsApp e Termos)
    // -------------------------------------------------------------
    console.log('\n7. Testando validação de campos obrigatórios...');
    GoogleAuthService.verifyIdToken = async () => ({
      sub: 'google-sub-missing-phone',
      email: 'missing@gmail.com',
      name: 'Sem Telefone',
      emailVerified: true
    });

    const { req: reqNoPhone, res: resNoPhone, getStatus: getStatusNoPhone } = createMockReqRes({
      idToken: 'mock-token',
      context: 'signup',
      additionalData: {
        responsibleName: 'Sem Telefone',
        phone: '123',
        termsAccepted: true,
        privacyAccepted: true
      }
    });

    await AuthController.googleAuth(reqNoPhone, resNoPhone);
    assert.equal(getStatusNoPhone(), 400, 'Telefone curto deve retornar 400');

    const { req: reqNoTerms, res: resNoTerms, getStatus: getStatusNoTerms } = createMockReqRes({
      idToken: 'mock-token',
      context: 'signup',
      additionalData: {
        responsibleName: 'Sem Termos',
        phone: '11987654321',
        termsAccepted: false,
        privacyAccepted: true
      }
    });

    await AuthController.googleAuth(reqNoTerms, resNoTerms);
    assert.equal(getStatusNoTerms(), 400, 'Termos rejeitados devem retornar 400');
    console.log('   ✓ Validações de formulário funcionam corretamente.');
    passedCount++;

    // -------------------------------------------------------------
    // TESTE 8: Tratamento e sanitização de plan=[object Object]
    // -------------------------------------------------------------
    console.log('\n8. Testando sanitização de planCode com [object Object] e outros valores corrompidos...');
    GoogleAuthService.verifyIdToken = async () => ({
      sub: 'google-sub-object-param',
      email: 'dranalucia@zemdatest.com',
      name: 'Dra. Ana Lúcia',
      emailVerified: true
    });

    const { req: reqObjPlan, res: resObjPlan, getStatus: getStatusObjPlan, getJson: getJsonObjPlan } = createMockReqRes({
      idToken: 'mock-token',
      context: 'signup',
      additionalData: {
        responsibleName: 'Dra. Ana Lúcia',
        phone: '11988889999',
        profession: 'Médico',
        professionId: 'prof-medico',
        termsAccepted: true,
        privacyAccepted: true,
        planCode: '[object Object]',
        startTrial: true
      }
    });

    await AuthController.googleAuth(reqObjPlan, resObjPlan);
    assert.equal(getStatusObjPlan(), 201, `Status deve ser 201 após sanitizar [object Object], recebeu ${getStatusObjPlan()}: ${JSON.stringify(getJsonObjPlan())}`);

    const userWithSanitizedPlan = db.prepare('SELECT * FROM users WHERE google_sub = ?').get('google-sub-object-param');
    assert.ok(userWithSanitizedPlan, 'Usuário com planCode sanitizado deve ser criado');
    assert.equal(userWithSanitizedPlan.zemda_med_enabled, 1, 'Módulo médico deve estar ativo');
    console.log('   ✓ Cadastro com planCode="[object Object]" foi normalizado e concluído com sucesso.');
    passedCount++;

    // -------------------------------------------------------------
    // TESTE 9: Teste de rollback atômico e ausência de órfãos
    // -------------------------------------------------------------
    console.log('\n9. Testando rollback atômico sem registros órfãos...');
    GoogleAuthService.verifyIdToken = async () => ({
      sub: 'google-sub-fail-tx',
      email: 'fail-tx@zemdatest.com',
      name: 'Dr. Rollback',
      emailVerified: true
    });

    const totalTenantsBefore = db.prepare('SELECT count(*) as count FROM tenants').get().count;
    const totalUsersBefore = db.prepare('SELECT count(*) as count FROM users').get().count;

    const { req: reqFail, res: resFail, getStatus: getStatusFail, getJson: getJsonFail } = createMockReqRes({
      idToken: 'mock-token',
      context: 'signup',
      additionalData: {
        responsibleName: 'Dr. Rollback',
        phone: '11977776666',
        termsAccepted: true,
        privacyAccepted: true,
        planCode: 'PLANO_TOTALMENTE_INEXISTENTE_XYZ'
      }
    });

    await AuthController.googleAuth(reqFail, resFail);
    assert.equal(getStatusFail(), 400, 'Plano inexistente deve retornar 400');
    assert.equal(getJsonFail().code, 'PLAN_INVALID');

    const totalTenantsAfter = db.prepare('SELECT count(*) as count FROM tenants').get().count;
    const totalUsersAfter = db.prepare('SELECT count(*) as count FROM users').get().count;
    assert.equal(totalTenantsBefore, totalTenantsAfter, 'Não podem sobrar tenants órfãos após rollback');
    assert.equal(totalUsersBefore, totalUsersAfter, 'Não podem sobrar usuários órfãos após rollback');
    console.log('   ✓ Rollback atômico verificado: 0 tenants ou usuários órfãos em caso de falha.');
    passedCount++;

    // -------------------------------------------------------------
    // TESTE 10: Testes unitários do utilitário planUtils (frontend)
    // -------------------------------------------------------------
    console.log('\n10. Testando utilitário de sanitização de planos (planUtils)...');
    const { sanitizePlanCode } = await import('../frontend/src/utils/planUtils.ts');

    assert.equal(sanitizePlanCode('[object Object]'), undefined);
    assert.equal(sanitizePlanCode('[object MouseEvent]'), undefined);
    assert.equal(sanitizePlanCode('undefined'), undefined);
    assert.equal(sanitizePlanCode('null'), undefined);
    assert.equal(sanitizePlanCode(''), undefined);
    assert.equal(sanitizePlanCode(null), undefined);
    assert.equal(sanitizePlanCode(undefined), undefined);
    assert.equal(sanitizePlanCode({}), undefined);
    assert.equal(sanitizePlanCode('SOLO'), 'SOLO');
    assert.equal(sanitizePlanCode('solo'), 'SOLO');
    assert.equal(sanitizePlanCode('zemda-solo'), 'SOLO');
    assert.equal(sanitizePlanCode('plan-solo'), 'SOLO');
    assert.equal(sanitizePlanCode('DUO'), 'DUO');
    assert.equal(sanitizePlanCode('equipe'), 'EQUIPE');
    console.log('   ✓ sanitizePlanCode rejeita com precisão [object Object], undefined, null e normaliza planos válidos.');
    passedCount++;

    // -------------------------------------------------------------
    // TESTE 11: Mapeamento de mensagens de erro amigáveis (googleAuthErrors)
    // -------------------------------------------------------------
    console.log('\n11. Testando mapeador de mensagens amigáveis (googleAuthErrors)...');
    const { googleAuthError } = await import('../frontend/src/components/auth/googleAuthErrors.ts');

    // 1. GIS indisponível
    const msgGis = googleAuthError('Serviço de autenticação temporariamente indisponível.');
    assert.ok(msgGis.includes('temporariamente indisponível') && !msgGis.includes('navegador'), 'Mensagem de GIS deve ser amigável');

    // 2. Cancelamento pelo usuário
    const msgCancel = googleAuthError('popup_closed_by_user');
    assert.ok(msgCancel.includes('cancelada'), 'Cancelamento deve informar de forma acolhedora');

    // 3. Falha de rede
    const msgNet = googleAuthError(new Error('Failed to fetch'));
    assert.ok(msgNet.includes('conexão com a internet'), 'Falha de rede deve indicar internet');

    // 4. Token expirado
    const msgToken = googleAuthError({ code: 'INVALID_GOOGLE_TOKEN', message: 'Credencial expirada' });
    assert.ok(msgToken.includes('expirou') || msgToken.includes('inválida'), 'Deve avisar sobre token expirado');

    // 5. Erro interno do servidor (NUNCA culpar o navegador por erro SQL)
    const msgServer = googleAuthError({ status: 500, message: 'SqliteError: all VALUES must have the same number of terms' });
    assert.ok(!msgServer.includes('navegador'), 'Erro de servidor NÃO pode culpar o navegador');
    assert.ok(!msgServer.includes('SqliteError'), 'Erro de servidor NÃO pode vazar dados de SQL');
    assert.ok(msgServer.includes('servidor') || msgServer.includes('instabilidade'), 'Deve indicar instabilidade no servidor');

    console.log('   ✓ Mapeador de erros testado: mensagens claras e sem culpar indevidamente o navegador.');
    passedCount++;

    console.log('\n=============================================================');
    console.log(`TODOS OS ${passedCount} TESTES PASSARAM COM SUCESSO!`);
    console.log('=============================================================\n');

  } finally {
    GoogleAuthService.verifyIdToken = originalVerify;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runTests().catch(err => {
  console.error('\n❌ ERRO NA EXECUÇÃO DOS TESTES:', err);
  process.exit(1);
});
