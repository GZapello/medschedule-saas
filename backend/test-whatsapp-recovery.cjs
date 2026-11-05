const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-wa-rec-')), 'test.db');
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long-123456';
process.env.R2_MOCK_STORAGE = 'true';

const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();

const { AuthController } = require('./dist/controllers/auth.controller');
const { UserModerationController, checkExclusiveWhatsAppBlock } = require('./dist/controllers/user-moderation.controller');
const { authMiddleware, whatsappUpdateAuthMiddleware } = require('./dist/middlewares/auth.middleware');
const { hashPassword } = require('./dist/utils/password');
const { verifyToken } = require('./dist/utils/jwt');

let checks = 0;
function check(condition, label) {
  assert.ok(condition, label);
  checks++;
  console.log(`PASS: ${label}`);
}

function mockResponse() {
  let statusCode = 200;
  let responseData = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    }
  };
  return { res, getResult: () => ({ status: statusCode, data: responseData }) };
}

async function main() {
  console.log('=== INICIANDO TESTES DO FLUXO DE RECUPERAÇÃO DE WHATSAPP ===');

  // 1. Criação de Tenant e Usuário de Teste
  const tenantId = 'wa-tenant-test';
  const userId = 'wa-user-test';
  const userEmail = 'doutor.teste@zemda.com.br';
  const passwordPlain = 'SenhaCorreta@123';
  const passwordHash = await hashPassword(passwordPlain);

  db.prepare(`
    INSERT INTO tenants (id, name, slug, corporate_name, trade_name, email, status, session_version)
    VALUES (?, 'Clínica Bem Viver', 'clinica-bem-viver', 'Bem Viver Saúde LTDA', 'Bem Viver', 'clinica@bemviver.com.br', 'active', 0)
  `).run(tenantId);

  db.prepare(`
    INSERT INTO users (
      id, tenant_id, name, email, password_hash, role, phone, status,
      onboarding_status, moderation_flag, whatsapp_status, session_version, created_at, updated_at
    ) VALUES (
      ?, ?, 'Dr. Carlos Silveira', ?, ?, 'clinic_admin', '5511999990000', 'active',
      'active', 'clean', 'unverified', 0, datetime('now'), datetime('now')
    )
  `).run(userId, tenantId, userEmail, passwordHash);

  db.prepare(`
    INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager)
    VALUES ('cu-test-1', ?, ?, 'clinic_admin', 'active', 1)
  `).run(tenantId, userId);

  // 2. Teste de Login Normal de Usuário Ativo
  {
    const { res, getResult } = mockResponse();
    const req = {
      body: { email: userEmail, password: passwordPlain },
      headers: {},
      ip: '127.0.0.1'
    };
    await AuthController.login(req, res);
    const result = getResult();
    check(result.status === 200, 'Login de usuário ativo retorna HTTP 200');
    check(Boolean(result.data.token), 'Login retorna token de autenticação');
    check(result.data.user.id === userId, 'Dados do usuário retornados corretamente');
  }

  // 3. SuperAdmin suspende acesso solicitando atualização de WhatsApp
  {
    const adminReq = {
      params: { userId },
      body: {
        reason: 'O número informado não recebe mensagens e falhou no contato com o paciente.',
        suspendAccess: true,
        confirmSoleManager: true
      },
      user: { userId: 'superadmin-master', name: 'Administrador Geral', role: 'superadmin' },
      headers: {},
      ip: '127.0.0.1'
    };
    const { res, getResult } = mockResponse();
    await UserModerationController.requestWhatsAppUpdate(adminReq, res);
    const result = getResult();
    check(result.status === 200, 'SuperAdmin registra solicitação com suspensão de acesso');

    const updatedUser = db.prepare('SELECT status, blocked_reason, session_version FROM users WHERE id = ?').get(userId);
    check(updatedUser.status === 'blocked', 'Status da conta alterado para "blocked"');
    check(updatedUser.session_version > 0, 'session_version incrementado para invalidar sessões antigas');

    const pending = db.prepare('SELECT status, suspended_access, reason FROM user_whatsapp_requests WHERE user_id = ?').get(userId);
    check(pending.status === 'pending' && pending.suspended_access === 1, 'Registro em user_whatsapp_requests criado como pendente com suspended_access=1');
  }

  // 4. Verificação de detecção de bloqueio exclusivo
  {
    const waCheck = checkExclusiveWhatsAppBlock(userId);
    check(waCheck.isExclusiveWhatsAppBlock === true, 'checkExclusiveWhatsAppBlock detecta que o bloqueio é exclusivo por WhatsApp');
    check(Boolean(waCheck.request), 'Retorna a solicitação pendente');
  }

  // 5. Tentativa de login com senha incorreta por usuário bloqueado
  {
    const { res, getResult } = mockResponse();
    const req = {
      body: { email: userEmail, password: 'SenhaErrada' },
      headers: {},
      ip: '127.0.0.1'
    };
    await AuthController.login(req, res);
    const result = getResult();
    check(result.status === 401, 'Tentativa com senha incorreta é rejeitada com HTTP 401');
  }

  // 6. Login com credenciais válidas do usuário bloqueado por WhatsApp
  let restrictedToken = null;
  {
    const { res, getResult } = mockResponse();
    const req = {
      body: { email: userEmail, password: passwordPlain },
      headers: {},
      ip: '127.0.0.1'
    };
    await AuthController.login(req, res);
    const result = getResult();
    check(result.status === 403, 'Login responde HTTP 403 com código especial');
    check(result.data.code === 'WHATSAPP_UPDATE_REQUIRED', 'Código de resposta é WHATSAPP_UPDATE_REQUIRED');
    check(Boolean(result.data.restrictedToken), 'Token restrito é emitido');
    check(Boolean(result.data.reason), 'Motivo do administrador é apresentado');
    restrictedToken = result.data.restrictedToken;

    const payload = verifyToken(restrictedToken);
    check(payload.scope === 'whatsapp_update_only', 'Token restrito possui scope="whatsapp_update_only"');
  }

  // 7. Teste de isolamento de segurança: Token restrito NÃO pode acessar rotas operacionais
  {
    const req = {
      headers: { authorization: `Bearer ${restrictedToken}` },
      query: {},
      path: '/v1/patients'
    };
    const { res, getResult } = mockResponse();
    let nextCalled = false;
    authMiddleware(req, res, () => { nextCalled = true; });
    const result = getResult();
    check(!nextCalled && result.status === 403, 'authMiddleware bloqueia token restrito com HTTP 403');
    check(result.data.code === 'WHATSAPP_UPDATE_RESTRICTED', 'Código é WHATSAPP_UPDATE_RESTRICTED (sem acesso a prontuários/pacientes)');
  }

  // 8. Consulta de solicitação pendente com token restrito através de whatsappUpdateAuthMiddleware
  {
    const req = {
      headers: { authorization: `Bearer ${restrictedToken}` },
      query: {}
    };
    const { res: midRes, getResult: getMidResult } = mockResponse();
    let nextCalled = false;
    whatsappUpdateAuthMiddleware(req, midRes, () => { nextCalled = true; });
    check(nextCalled === true, 'whatsappUpdateAuthMiddleware autoriza a rota de atualização com token restrito');

    const { res: ctrlRes, getResult: getCtrlResult } = mockResponse();
    await UserModerationController.getMyWhatsAppUpdateRequest(req, ctrlRes);
    const result = getCtrlResult();
    check(result.status === 200, 'getMyWhatsAppUpdateRequest responde HTTP 200');
    check(result.data.hasPending === true, 'hasPending é true');
  }

  // 9. Submissão de número inválido (DDD inexistente, menos dígitos, etc.)
  {
    const invalidNumbers = ['123', '(00) 98765-4321', '(11) 11111-1111', '(11) 88765-4321'];
    for (const inv of invalidNumbers) {
      const req = {
        user: { userId },
        body: { phone: inv },
        headers: { authorization: `Bearer ${restrictedToken}` }
      };
      const { res, getResult } = mockResponse();
      await UserModerationController.submitMyWhatsAppUpdate(req, res);
      const result = getResult();
      check(result.status === 400, `Número inválido "${inv}" é rejeitado com HTTP 400`);
    }
  }

  // 10. Submissão de número válido com DDD brasileiro
  let newFullToken = null;
  {
    const validPhone = '(11) 98765-4321';
    const req = {
      user: { userId },
      body: { phone: validPhone },
      headers: { authorization: `Bearer ${restrictedToken}` }
    };
    const { res, getResult } = mockResponse();
    await UserModerationController.submitMyWhatsAppUpdate(req, res);
    const result = getResult();

    check(result.status === 200, 'Atualização de WhatsApp responde HTTP 200');
    check(result.data.success === true, 'success é true');
    check(result.data.accessRestored === true, 'accessRestored é true');
    check(result.data.message.includes('Número atualizado — não verificado'), 'Aviso claro "Número atualizado — não verificado" presente');
    check(Boolean(result.data.token), 'Token de sessão completo emitido após regularização');
    newFullToken = result.data.token;

    // Validações no Banco de Dados
    const restoredUser = db.prepare('SELECT status, phone, phone_verified, whatsapp_status, moderation_flag, blocked_reason FROM users WHERE id = ?').get(userId);
    check(restoredUser.status === 'active', 'Conta foi reativada com status="active"');
    check(restoredUser.phone === '5511987654321', 'Novo telefone salvo com formato DDI 55');
    check(restoredUser.phone_verified === 0, 'phone_verified salvo como 0');
    check(restoredUser.whatsapp_status === 'unverified', 'whatsapp_status salvo como "unverified"');
    check(restoredUser.moderation_flag === 'clean', 'moderation_flag limpa para "clean"');
    check(restoredUser.blocked_reason === null, 'blocked_reason limpo');

    const completedReq = db.prepare('SELECT status, new_phone, resolved_at FROM user_whatsapp_requests WHERE user_id = ?').get(userId);
    check(completedReq.status === 'completed', 'Solicitação pendente concluída com status="completed"');
    check(completedReq.new_phone === '5511987654321', 'new_phone gravado na solicitação');
    check(Boolean(completedReq.resolved_at), 'resolved_at registrado');

    const unblockLog = db.prepare("SELECT action, reason_code FROM user_moderation_logs WHERE user_id = ? AND action = 'unblock_user'").get(userId);
    check(Boolean(unblockLog), 'Log de moderação "unblock_user" registrado no histórico');

    const updateLog = db.prepare("SELECT action, reason_code FROM user_moderation_logs WHERE user_id = ? AND action = 'whatsapp_updated'").get(userId);
    check(Boolean(updateLog), 'Log de moderação "whatsapp_updated" registrado no histórico');
  }

  // 11. Invalidação de sessões antigas: restrictedToken antigo não pode mais ser reutilizado
  {
    const req = {
      headers: { authorization: `Bearer ${restrictedToken}` },
      query: {}
    };
    const { res, getResult } = mockResponse();
    let nextCalled = false;
    whatsappUpdateAuthMiddleware(req, res, () => { nextCalled = true; });
    const result = getResult();
    check(!nextCalled && result.status === 401, 'Token restrito antigo é rejeitado com 401 devido ao incremento de session_version');
  }

  // 12. Novo token gerado tem acesso total ao sistema
  {
    const req = {
      headers: { authorization: `Bearer ${newFullToken}` },
      query: {},
      path: '/v1/auth/me'
    };
    const { res, getResult } = mockResponse();
    let nextCalled = false;
    authMiddleware(req, res, () => { nextCalled = true; });
    check(nextCalled === true, 'Novo token de sessão completo é aceito pelo authMiddleware');
  }

  // 13. Teste de usuário com outro motivo de bloqueio ativo (Ex: suspected_spam)
  {
    const userSpamId = 'user-spam-test';
    const userSpamEmail = 'spam@teste.com';
    const spamPassHash = await hashPassword('SpamPass123');

    db.prepare(`
      INSERT INTO users (
        id, tenant_id, name, email, password_hash, role, phone, status,
        onboarding_status, moderation_flag, whatsapp_status, session_version, created_at, updated_at
      ) VALUES (
        ?, ?, 'Usuário Spam', ?, ?, 'clinic_admin', '5511988887777', 'blocked',
        'active', 'suspected_spam', 'pending_correction', 0, datetime('now'), datetime('now')
      )
    `).run(userSpamId, tenantId, userSpamEmail, spamPassHash);

    // Registra solicitação de WhatsApp
    db.prepare(`
      INSERT INTO user_whatsapp_requests (
        id, user_id, tenant_id, requested_by_user_id, requested_by_name,
        reason, status, suspended_access, created_at, updated_at
      ) VALUES ('req-spam-1', ?, ?, 'admin', 'Admin', 'Telefone incorreto', 'pending', 1, datetime('now'), datetime('now'))
    `).run(userSpamId, tenantId);

    // Registra bloqueio por spam em moderation logs
    db.prepare(`
      INSERT INTO user_moderation_logs (
        id, user_id, tenant_id, action, reason_code, reason_details, performed_by_user_id, performed_by_name, created_at
      ) VALUES ('log-spam-1', ?, ?, 'block_user', 'suspected_spam', 'Envio massivo de mensagens suspeitas', 'admin', 'Admin', datetime('now'))
    `).run(userSpamId, tenantId);

    const waCheck = checkExclusiveWhatsAppBlock(userSpamId);
    check(waCheck.isExclusiveWhatsAppBlock === false, 'checkExclusiveWhatsAppBlock detecta que NÃO é bloqueio exclusivo de WhatsApp (há outro motivo)');

    // Login tenta autenticar: não dá bypass no bloqueio
    const { res: loginRes, getResult: getLoginResult } = mockResponse();
    const loginReq = {
      body: { email: userSpamEmail, password: 'SpamPass123' },
      headers: {},
      ip: '127.0.0.1'
    };
    await AuthController.login(loginReq, loginRes);
    const loginResult = getLoginResult();
    check(loginResult.status === 403 && loginResult.data.code === 'USER_BLOCKED', 'Usuário com bloqueio não-exclusivo recebe USER_BLOCKED e não WHATSAPP_UPDATE_REQUIRED');

    // Se o usuário atualizar telefone com token restrito ou admin
    const updateReq = {
      user: { userId: userSpamId },
      body: { phone: '(21) 98765-4321' },
      headers: {}
    };
    const { res: updRes, getResult: getUpdResult } = mockResponse();
    await UserModerationController.submitMyWhatsAppUpdate(updateReq, updRes);
    const updResult = getUpdResult();
    check(updResult.status === 200, 'Atualização de telefone é registrada');
    check(updResult.data.accessRestored === false, 'accessRestored é false (permanece bloqueado)');
    check(updResult.data.message.includes('permanece suspensa aguardando análise administrativa'), 'Mensagem informa que permanece suspenso aguardando análise');

    const spamUserDb = db.prepare('SELECT status FROM users WHERE id = ?').get(userSpamId);
    check(spamUserDb.status === 'blocked', 'Status da conta continua "blocked" no banco de dados');
  }

  console.log(`\n========================================`);
  console.log(`TODOS OS ${checks} TESTES PASSARAM COM SUCESSO!`);
  console.log(`========================================\n`);
}

main().catch(err => {
  console.error('FALHA NOS TESTES:', err);
  process.exit(1);
});
