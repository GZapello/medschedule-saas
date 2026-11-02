const assert = require('assert');
const { db } = require('../dist/config/database');
const { UserModerationController } = require('../dist/controllers/user-moderation.controller');
const { AuthController } = require('../dist/controllers/auth.controller');
const { authMiddleware } = require('../dist/middlewares/auth.middleware');
const { generateToken, verifyToken } = require('../dist/utils/jwt');
const { hashPassword } = require('../dist/utils/password');
const { clinicTeam } = require('../dist/services/clinic-team.service');
const { TenantController } = require('../dist/controllers/tenant.controller');

console.log('\n=== TESTE DE VALIDAÇÃO: MODERAÇÃO DE USUÁRIOS, WHATSAPP & HISTÓRICO DE ACESSOS ===\n');

function mockRes() {
  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    }
  };
  return res;
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  async function runTest(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    Erro: ${err.message}`);
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  const timestamp = Date.now();
  const testTenantIdA = 'tenant-mod-a-' + timestamp;
  const testTenantIdB = 'tenant-mod-b-' + timestamp;
  const superAdminId = 'user-superadmin-' + timestamp;
  const targetUserId = 'user-target-' + timestamp;
  const coworkerUserId = 'user-coworker-' + timestamp;
  const soleManagerUserId = 'user-sole-mgr-' + timestamp;

  const defaultPassword = 'TestPassword123!';
  const defaultPasswordHash = await hashPassword(defaultPassword);

  // Setup Tenants
  db.prepare("INSERT INTO tenants (id, name, slug, email, status, session_version, created_at) VALUES (?, 'Clínica Alfa', ?, 'alfa@teste.com', 'active', 0, datetime('now'))")
    .run(testTenantIdA, 'alfa-' + timestamp);
  db.prepare("INSERT INTO tenants (id, name, slug, email, status, session_version, created_at) VALUES (?, 'Clínica Beta', ?, 'beta@teste.com', 'active', 0, datetime('now'))")
    .run(testTenantIdB, 'beta-' + timestamp);

  // Setup SuperAdmin
  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, status, session_version, created_at)
    VALUES (?, 'Super Admin Teste', ?, ?, 'superadmin', 'active', 0, datetime('now'))
  `).run(superAdminId, `admin-${timestamp}@zemda.com.br`, defaultPasswordHash);

  // Setup Target User (membro da Clínica Alfa e Clínica Beta)
  db.prepare(`
    INSERT INTO users (id, tenant_id, name, email, phone, password_hash, role, status, session_version, created_at)
    VALUES (?, ?, 'Dr. Marcos Alvo', ?, '(11) 98888-7777', ?, 'professional', 'active', 0, '2026-05-10 10:00:00')
  `).run(targetUserId, testTenantIdA, `marcos-${timestamp}@teste.com`, defaultPasswordHash);

  db.prepare("INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, created_at) VALUES (?, ?, ?, 'professional', 'active', 0, datetime('now'))")
    .run('cu-a-' + timestamp, testTenantIdA, targetUserId);
  db.prepare("INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, created_at) VALUES (?, ?, ?, 'professional', 'active', 0, datetime('now'))")
    .run('cu-b-' + timestamp, testTenantIdB, targetUserId);

  // Setup Coworker (outro profissional da Clínica Alfa)
  db.prepare(`
    INSERT INTO users (id, tenant_id, name, email, phone, password_hash, role, status, session_version, created_at)
    VALUES (?, ?, 'Dra. Fernanda Colega', ?, '(11) 99999-1111', ?, 'professional', 'active', 0, datetime('now'))
  `).run(coworkerUserId, testTenantIdA, `fernanda-${timestamp}@teste.com`, defaultPasswordHash);
  db.prepare("INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, created_at) VALUES (?, ?, ?, 'professional', 'active', 0, datetime('now'))")
    .run('cu-c-' + timestamp, testTenantIdA, coworkerUserId);

  // Setup Sole Manager em Clínica Beta
  db.prepare(`
    INSERT INTO users (id, tenant_id, name, email, phone, password_hash, role, status, session_version, created_at)
    VALUES (?, ?, 'Gestor Único', ?, '(11) 97777-2222', ?, 'clinic_admin', 'active', 0, datetime('now'))
  `).run(soleManagerUserId, testTenantIdB, `gestor-${timestamp}@teste.com`, defaultPasswordHash);
  db.prepare("INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, created_at) VALUES (?, ?, ?, 'clinic_admin', 'active', 1, datetime('now'))")
    .run('cu-sm-' + timestamp, testTenantIdB, soleManagerUserId);

  // --- SEÇÃO 1: SINALIZAÇÃO DE MODERAÇÃO (SPAM & TELEFONE INVÁLIDO) ---
  console.log('\n--- 1. Validação de Sinalização de Moderação (Spam e Telefone Inválido) ---');

  await runTest('SuperAdmin pode sinalizar usuário como spam sem bloquear a conta', async () => {
    const req = {
      params: { userId: targetUserId },
      body: { flag: 'suspected_spam', reasonCode: 'suspected_spam', reasonDetails: 'Comportamento automatizado' },
      user: { userId: superAdminId, name: 'Super Admin', role: 'superadmin' }
    };
    const res = mockRes();
    await UserModerationController.flagUser(req, res);
    assert.strictEqual(res.statusCode, 200);

    const userInDb = db.prepare('SELECT status, moderation_flag FROM users WHERE id = ?').get(targetUserId);
    assert.strictEqual(userInDb.moderation_flag, 'suspected_spam');
    assert.strictEqual(userInDb.status, 'active', 'Sinalização não deve alterar status para blocked');

    const log = db.prepare('SELECT action, reason_code FROM user_moderation_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(targetUserId);
    assert.strictEqual(log.action, 'flag_spam');
    assert.strictEqual(log.reason_code, 'suspected_spam');
  });

  await runTest('SuperAdmin pode registrar telefone/WhatsApp inválido', async () => {
    const req = {
      params: { userId: targetUserId },
      body: { flag: 'invalid_phone', reasonCode: 'invalid_phone', reasonDetails: 'Número não atende' },
      user: { userId: superAdminId, name: 'Super Admin', role: 'superadmin' }
    };
    const res = mockRes();
    await UserModerationController.flagUser(req, res);
    assert.strictEqual(res.statusCode, 200);

    const userInDb = db.prepare('SELECT whatsapp_status, moderation_flag FROM users WHERE id = ?').get(targetUserId);
    assert.strictEqual(userInDb.moderation_flag, 'invalid_phone');
    assert.strictEqual(userInDb.whatsapp_status, 'invalid');
  });

  await runTest('SuperAdmin pode remover sinalização (clearFlag)', async () => {
    const req = {
      params: { userId: targetUserId },
      body: { reasonDetails: 'Telefone confirmado após contato' },
      user: { userId: superAdminId, name: 'Super Admin', role: 'superadmin' }
    };
    const res = mockRes();
    await UserModerationController.clearFlag(req, res);
    assert.strictEqual(res.statusCode, 200);

    const userInDb = db.prepare('SELECT moderation_flag, whatsapp_status FROM users WHERE id = ?').get(targetUserId);
    assert.strictEqual(userInDb.moderation_flag, 'clean');
    assert.strictEqual(userInDb.whatsapp_status, 'unverified');
  });

  await runTest('SuperAdmin é impedido de sinalizar a própria conta', async () => {
    const req = {
      params: { userId: superAdminId },
      body: { flag: 'suspected_spam', reasonCode: 'suspected_spam' },
      user: { userId: superAdminId, name: 'Super Admin', role: 'superadmin' }
    };
    const res = mockRes();
    await UserModerationController.flagUser(req, res);
    assert.strictEqual(res.statusCode, 400);
  });

  // --- SEÇÃO 2: BLOQUEIO INDIVIDUAL, SESSÕES E SEGURANÇA ---
  console.log('\n--- 2. Validação do Bloqueio Individual de Usuários & Invalidação de Sessão ---');

  await runTest('Impedir SuperAdmin de bloquear a própria conta', async () => {
    const req = {
      params: { userId: superAdminId },
      body: { scope: 'global', reasonCode: 'terms_violation' },
      user: { userId: superAdminId, name: 'Super Admin', role: 'superadmin' }
    };
    const res = mockRes();
    await UserModerationController.blockUser(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.data.error.includes('própria conta'));
  });

  await runTest('Exigir confirmação adicional caso seja o único gestor ativo da clínica', async () => {
    const req = {
      params: { userId: soleManagerUserId },
      body: { scope: 'clinic', clinicId: testTenantIdB, reasonCode: 'inconsistent_data', confirmSoleManager: false },
      user: { userId: superAdminId, name: 'Super Admin', role: 'superadmin' }
    };
    const res = mockRes();
    await UserModerationController.blockUser(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.data.code, 'SOLE_MANAGER_CONFIRMATION_REQUIRED');
  });

  let initialTargetToken = '';
  await runTest('Bloquear usuário globalmente invalida tokens existentes e impede login', async () => {
    // Gera token válido para o usuário antes do bloqueio
    initialTargetToken = generateToken({
      userId: targetUserId,
      tenantId: testTenantIdA,
      role: 'professional',
      email: `marcos-${timestamp}@teste.com`,
      name: 'Dr. Marcos Alvo'
    });

    const reqBlock = {
      params: { userId: targetUserId },
      body: {
        scope: 'global',
        reasonCode: 'terms_violation',
        reasonDetails: 'Uso não autorizado dos recursos',
        isTemporary: true,
        blockedUntil: '2026-12-31T23:59:59.000Z'
      },
      user: { userId: superAdminId, name: 'Super Admin', role: 'superadmin' }
    };
    const resBlock = mockRes();
    await UserModerationController.blockUser(reqBlock, resBlock);
    assert.strictEqual(resBlock.statusCode, 200);

    const userInDb = db.prepare('SELECT status, blocked_reason, blocked_until, session_version FROM users WHERE id = ?').get(targetUserId);
    assert.strictEqual(userInDb.status, 'blocked');
    assert.ok(userInDb.blocked_reason.includes('Violação dos termos'));
    assert.strictEqual(userInDb.session_version, 1);

    // 1. O token emitido anteriormente é rejeitado no authMiddleware
    let middlewareRejected = false;
    let middlewareStatus = 0;
    const reqAuth = { headers: { authorization: `Bearer ${initialTargetToken}` }, path: '/v1/appointments' };
    const resAuth = {
      status(code) { middlewareStatus = code; return this; },
      json() { middlewareRejected = true; }
    };
    authMiddleware(reqAuth, resAuth, () => {});
    assert.strictEqual(middlewareRejected, true);
    assert.strictEqual(middlewareStatus, 401);

    // 2. Nova tentativa de login é recusada com código USER_BLOCKED
    const reqLogin = {
      body: { email: `marcos-${timestamp}@teste.com`, password: defaultPassword }
    };
    const resLogin = mockRes();
    await AuthController.login(reqLogin, resLogin);
    assert.strictEqual(resLogin.statusCode, 403);
    assert.strictEqual(resLogin.data.code, 'USER_BLOCKED');
  });

  await runTest('Colega da mesma clínica e a clínica continuam com status ativo normal', async () => {
    const coworker = db.prepare('SELECT status FROM users WHERE id = ?').get(coworkerUserId);
    assert.strictEqual(coworker.status, 'active', 'Colega não deve ser afetado');

    const tenant = db.prepare('SELECT status FROM tenants WHERE id = ?').get(testTenantIdA);
    assert.strictEqual(tenant.status, 'active', 'Clínica não deve ser afetada');
  });

  await runTest('Desbloquear usuário restaura status ativo e permite novo login', async () => {
    const reqUnblock = {
      params: { userId: targetUserId },
      body: { scope: 'global', reasonDetails: 'Revisão concluída, conta restabelecida' },
      user: { userId: superAdminId, name: 'Super Admin', role: 'superadmin' }
    };
    const resUnblock = mockRes();
    await UserModerationController.unblockUser(reqUnblock, resUnblock);
    assert.strictEqual(resUnblock.statusCode, 200);

    const userInDb = db.prepare('SELECT status, blocked_reason FROM users WHERE id = ?').get(targetUserId);
    assert.strictEqual(userInDb.status, 'active');
    assert.strictEqual(userInDb.blocked_reason, null);

    // Tentativa de login após desbloqueio é bem-sucedida
    const reqLogin = {
      body: { email: `marcos-${timestamp}@teste.com`, password: defaultPassword }
    };
    const resLogin = mockRes();
    await AuthController.login(reqLogin, resLogin);
    assert.strictEqual(resLogin.statusCode, 200);
    assert.ok(resLogin.data.token, 'Deve retornar token após desbloqueio');
  });

  await runTest('Suspensão específica de clínica bloqueia acesso à Clínica A mas preserva Clínica B', async () => {
    const reqSuspend = {
      params: { userId: targetUserId },
      body: { scope: 'clinic', clinicId: testTenantIdA, reasonCode: 'inconsistent_data', reasonDetails: 'Vínculo pendente' },
      user: { userId: superAdminId, name: 'Super Admin', role: 'superadmin' }
    };
    const resSuspend = mockRes();
    await UserModerationController.blockUser(reqSuspend, resSuspend);
    assert.strictEqual(resSuspend.statusCode, 200);

    const membershipA = db.prepare('SELECT status FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(targetUserId, testTenantIdA);
    const membershipB = db.prepare('SELECT status FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(targetUserId, testTenantIdB);

    assert.strictEqual(membershipA.status, 'blocked', 'Vínculo na Clínica A deve estar blocked');
    assert.strictEqual(membershipB.status, 'active', 'Vínculo na Clínica B deve permanecer active');

    // A conta global do usuário permanece active
    const userGlobal = db.prepare('SELECT status FROM users WHERE id = ?').get(targetUserId);
    assert.strictEqual(userGlobal.status, 'active');
  });

  // --- SEÇÃO 3: SOLICITAÇÃO E ATUALIZAÇÃO DE WHATSAPP ---
  console.log('\n--- 3. Validação do Fluxo de Atualização de WhatsApp & Autoatendimento ---');

  await runTest('SuperAdmin solicita atualização de WhatsApp (registra pendência)', async () => {
    const req = {
      params: { userId: targetUserId },
      body: {
        reason: 'O número informado não recebe mensagens e DDD está inconsistente',
        suspendAccess: false,
        clinicId: testTenantIdA
      },
      user: { userId: superAdminId, name: 'Super Admin', role: 'superadmin' }
    };
    const res = mockRes();
    await UserModerationController.requestWhatsAppUpdate(req, res);
    assert.strictEqual(res.statusCode, 200);

    const userInDb = db.prepare('SELECT whatsapp_status, moderation_flag FROM users WHERE id = ?').get(targetUserId);
    assert.strictEqual(userInDb.whatsapp_status, 'pending_correction');
    assert.strictEqual(userInDb.moderation_flag, 'invalid_phone');

    const pendingReq = db.prepare('SELECT * FROM user_whatsapp_requests WHERE user_id = ? AND status = ?').get(targetUserId, 'pending');
    assert.ok(pendingReq, 'Solicitação deve estar registrada com status pending');
    assert.strictEqual(pendingReq.previous_phone, '(11) 98888-7777');
  });

  await runTest('Usuário consulta pendência de atualização através de seu perfil', async () => {
    const req = { user: { userId: targetUserId, role: 'professional' } };
    const res = mockRes();
    await UserModerationController.getMyWhatsAppUpdateRequest(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.hasPending, true);
    assert.ok(res.data.request);
    assert.strictEqual(res.data.request.previous_phone, '(11) 98888-7777');
  });

  await runTest('Usuário tenta enviar número com formato inválido (rejeita com 400)', async () => {
    const req = {
      body: { phone: '123' },
      user: { userId: targetUserId, role: 'professional' }
    };
    const res = mockRes();
    await UserModerationController.submitMyWhatsAppUpdate(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.data.error.includes('inválido'));
  });

  await runTest('Usuário informa número válido com DDD: atualiza cadastro e conclui solicitação', async () => {
    const req = {
      body: { phone: '(11) 97777-8888' },
      user: { userId: targetUserId, role: 'professional' }
    };
    const res = mockRes();
    await UserModerationController.submitMyWhatsAppUpdate(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.message, 'Número atualizado — não verificado.');

    // Confere se o número foi atualizado em users
    const updatedUser = db.prepare('SELECT phone, phone_verified, whatsapp_status, moderation_flag FROM users WHERE id = ?').get(targetUserId);
    assert.strictEqual(updatedUser.phone, '5511977778888');
    assert.strictEqual(updatedUser.phone_verified, 0, 'phone_verified deve permanecer 0 como não verificado');
    assert.strictEqual(updatedUser.whatsapp_status, 'unverified');
    assert.strictEqual(updatedUser.moderation_flag, 'clean', 'flag de telefone inválido deve ser limpa');

    // Confere se a solicitação foi marcada como completed
    const completedReq = db.prepare('SELECT status, new_phone, resolved_at FROM user_whatsapp_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(targetUserId);
    assert.strictEqual(completedReq.status, 'completed');
    assert.strictEqual(completedReq.new_phone, '5511977778888');
    assert.ok(completedReq.resolved_at);
  });

  // --- SEÇÃO 4: HISTÓRICO DE ACESSOS, DATAS E AUDITORIA ---
  console.log('\n--- 4. Validação das Datas de Cadastro, Último Login e Resumo da Clínica ---');

  await runTest('Data de criação real em users é preservada após updates de perfil', async () => {
    const userBefore = db.prepare('SELECT created_at FROM users WHERE id = ?').get(targetUserId);
    assert.strictEqual(userBefore.created_at, '2026-05-10 10:00:00');

    // Atualização de telefone / perfil não pode tocar created_at
    db.prepare("UPDATE users SET updated_at = datetime('now') WHERE id = ?").run(targetUserId);

    const userAfter = db.prepare('SELECT created_at FROM users WHERE id = ?').get(targetUserId);
    assert.strictEqual(userAfter.created_at, '2026-05-10 10:00:00', 'created_at não pode ter sido alterada');
  });

  await runTest('Login malsucedido NÃO atualiza last_login_at', async () => {
    const userBefore = db.prepare('SELECT last_login_at FROM users WHERE id = ?').get(targetUserId);

    const reqBad = {
      body: { email: `marcos-${timestamp}@teste.com`, password: 'WrongPassword!' }
    };
    const resBad = mockRes();
    await AuthController.login(reqBad, resBad);
    assert.strictEqual(resBad.statusCode, 401);

    const userAfter = db.prepare('SELECT last_login_at FROM users WHERE id = ?').get(targetUserId);
    assert.strictEqual(userAfter.last_login_at, userBefore.last_login_at);
  });

  await runTest('Login bem-sucedido atualiza last_login_at de forma consistente', async () => {
    const reqGood = {
      body: { email: `marcos-${timestamp}@teste.com`, password: defaultPassword }
    };
    const resGood = mockRes();
    await AuthController.login(reqGood, resGood);
    assert.strictEqual(resGood.statusCode, 200);

    const user = db.prepare('SELECT last_login_at, last_login_provider FROM users WHERE id = ?').get(targetUserId);
    assert.ok(user.last_login_at, 'last_login_at deve estar preenchido');
    assert.strictEqual(user.last_login_provider, 'local');
  });

  await runTest('SuperAdmin consulta detalhes de moderação (getUserModerationDetails) sem expor dados clínicos', async () => {
    const req = {
      params: { userId: targetUserId },
      user: { userId: superAdminId, role: 'superadmin' }
    };
    const res = mockRes();
    await UserModerationController.getUserModerationDetails(req, res);
    assert.strictEqual(res.statusCode, 200);

    assert.ok(res.data.user);
    assert.strictEqual(res.data.user.email, `marcos-${timestamp}@teste.com`);
    assert.strictEqual(res.data.user.createdAt, '2026-05-10 10:00:00');
    assert.ok(res.data.user.lastLoginAt);
    assert.ok(Array.isArray(res.data.clinics));
    assert.ok(Array.isArray(res.data.whatsappRequests));
    assert.ok(Array.isArray(res.data.moderationLogs));

    // NUNCA deve conter dados clínicos de pacientes
    assert.strictEqual(res.data.patients, undefined);
    assert.strictEqual(res.data.clinicalRecords, undefined);
    assert.strictEqual(res.data.medicalRecords, undefined);
  });

  await runTest('adminTenantSummary expõe datas de cadastro, último login e status de moderação na listagem', async () => {
    const req = { params: { tenantId: testTenantIdA } };
    const res = mockRes();
    TenantController.adminTenantSummary(req, res);
    assert.strictEqual(res.statusCode, 200);

    const prof = res.data.activeProfessionals.find(p => p.id === targetUserId);
    assert.ok(prof, 'Profissional deve estar listado no resumo');
    assert.strictEqual(prof.userCreatedAt, '2026-05-10 10:00:00');
    assert.ok(prof.lastLoginAt);
    assert.strictEqual(prof.whatsappStatus, 'unverified');
    assert.strictEqual(prof.moderationFlag, 'clean');
  });

  console.log(`\n=== RESULTADO FINAL: ${passed} PASSOU, ${failed} FALHOU ===\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
