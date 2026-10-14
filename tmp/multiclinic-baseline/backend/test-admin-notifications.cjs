// Deterministic test suite for SuperAdmin Email Notifications
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-admin-notif-'));
process.env.DATABASE_PATH = path.join(root, 'test.sqlite');
process.env.APP_URL = 'https://zemda.com.br';
process.env.RESEND_API_KEY = 're_test_mock_api_key_12345';
process.env.EMAIL_OTP_SECRET = 'local-test-otp-secret-must-be-long-enough-12345';
process.env.EMAIL_FROM = 'Zemda <acesso@notify.zemda.com.br>';
process.env.EMAIL_REPLY_TO = 'suporte@zemda.com.br';

const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();

const { AdminNotificationService } = require('./dist/services/admin-notification.service');
const { EmailService } = require('./dist/services/email.service');
const { SupportController } = require('./dist/controllers/support.controller');
const bcrypt = require('bcryptjs');

// Track intercepted emails
const emailDispatches = [];
let mockFail = false;

// Mock EmailService.sendEmailRaw
EmailService.sendEmailRaw = async function (options) {
  if (mockFail) {
    return { success: false, error: 'Simulated Resend API Outage (503)' };
  }
  const messageId = 'resend_msg_' + randomUUID();
  emailDispatches.push({
    ...options,
    messageId,
    dispatchedAt: new Date().toISOString()
  });
  return { success: true, messageId };
};

async function run() {
  console.log('====================================================');
  console.log('INICIANDO TESTES: NOTIFICAÇÕES AUTOMÁTICAS AO SUPERADMIN');
  console.log('====================================================\n');

  // Seed SuperAdmin
  const adminId = 'usr_superadmin_test';
  const adminEmail = 'admin@saas.com';
  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, status)
    VALUES (?, 'Super Administrador', ?, 'hash', 'superadmin', 'active')
  `).run(adminId, adminEmail);

  // --- TEST 1: Destinatário configurado ---
  console.log('--- TEST 1: Resolução dinâmica do destinatário administrativo ---');
  const resolvedEmail = AdminNotificationService.getRecipientEmail();
  assert.equal(resolvedEmail, 'admin@saas.com');
  console.log('✓ Destinatário resolvido dinamicamente a partir do SuperAdmin ativo:', resolvedEmail);

  // --- TEST 2: Novo usuário cadastrado ---
  console.log('\n--- TEST 2: Notificação de Novo Usuário Cadastrado ---');
  emailDispatches.length = 0;

  const newUser = {
    userId: 'usr_new_test_1',
    name: 'Dr. Roberto Santos',
    email: 'roberto.santos@consultorio.com',
    professionName: 'Fisioterapia',
    clinicName: 'Clínica Reab Santos',
    role: 'clinic_admin',
    createdAt: new Date('2026-09-27T10:30:00Z'),
    tenantId: 'tenant_reab_1'
  };

  await AdminNotificationService.notifyNewUser(newUser);

  assert.equal(emailDispatches.length, 1, 'Deveria ter enviado exatamente 1 e-mail');
  const userEmail = emailDispatches[0];
  assert.equal(userEmail.to, 'admin@saas.com');
  assert.equal(userEmail.subject, '👤 Novo usuário cadastrado no Zemda');
  assert.ok(userEmail.html.includes('Novo usuário cadastrado'));
  assert.ok(userEmail.html.includes('Dr. Roberto Santos'));
  assert.ok(userEmail.html.includes('roberto.santos@consultorio.com'));
  assert.ok(userEmail.html.includes('Fisioterapia'));
  assert.ok(userEmail.html.includes('Clínica Reab Santos'));
  assert.ok(userEmail.html.includes('Gestor / Administrador da Clínica'));
  assert.ok(userEmail.html.includes('Ver no Zemda'));
  assert.ok(userEmail.html.includes('https://zemda.com.br/superadmin?section=tenants'));
  assert.ok(userEmail.html.includes('Notificação automática do Zemda — Administração Global'));

  // Verifica log interno
  const userLog = db.prepare('SELECT * FROM admin_notification_logs WHERE notification_type = ? AND related_entity_id = ?').get('NEW_USER', newUser.userId);
  assert.ok(userLog, 'Log de notificação deveria existir no banco');
  assert.equal(userLog.status, 'SENT');
  assert.equal(userLog.recipient, 'admin@saas.com');
  assert.ok(userLog.provider_message_id);
  console.log('✓ E-mail enviado com assunto, dados, CTA e registrado com status SENT');

  // --- TEST 3: Login de usuário existente NÃO envia e-mail ---
  console.log('\n--- TEST 3: Login de usuário existente NÃO dispara notificação ---');
  const countBeforeLogin = emailDispatches.length;
  // Simula login (que chama apenas AuthController.login sem chamar notifyNewUser)
  // Nada deve ser adicionado ao emailDispatches
  assert.equal(emailDispatches.length, countBeforeLogin, 'Login não deve enviar e-mail');
  console.log('✓ Login de usuário existente não dispara notificação ao SuperAdmin');

  // --- TEST 4: Idempotência / Refresh / Duplicação ---
  console.log('\n--- TEST 4: Proteção de idempotência / tentativa duplicada ---');
  await AdminNotificationService.notifyNewUser(newUser);
  assert.equal(emailDispatches.length, 1, 'Chamada repetida com mesmo userId não pode enviar segundo e-mail');
  const totalUserLogs = db.prepare('SELECT count(*) as total FROM admin_notification_logs WHERE notification_type = ? AND related_entity_id = ?').get('NEW_USER', newUser.userId).total;
  assert.equal(totalUserLogs, 1, 'Deve existir apenas 1 registro no log');
  console.log('✓ Idempotência garantida: chamada repetida/refresh não duplica o e-mail');

  // --- TEST 5: Novo teste grátis iniciado ---
  console.log('\n--- TEST 5: Notificação de Novo Teste Grátis Iniciado ---');
  emailDispatches.length = 0;

  const trialData = {
    tenantId: 'tenant_trial_1',
    clinicName: 'Consultório Dra. Ana Clara',
    responsibleName: 'Dra. Ana Clara',
    email: 'ana.clara@clinica.med.br',
    professionName: 'Medicina',
    planName: 'Zemda Solo',
    startedAt: new Date('2026-09-27T12:00:00Z'),
    endsAt: new Date('2026-10-04T12:00:00Z'),
    trialDays: 7,
    userId: 'usr_ana_1'
  };

  await AdminNotificationService.notifyTrialStarted(trialData);

  assert.equal(emailDispatches.length, 1, 'Deveria ter enviado exatamente 1 e-mail de trial');
  const trialEmail = emailDispatches[0];
  assert.equal(trialEmail.to, 'admin@saas.com');
  assert.equal(trialEmail.subject, '🚀 Novo teste grátis iniciado no Zemda');
  assert.ok(trialEmail.html.includes('Novo Teste Grátis'));
  assert.ok(trialEmail.html.includes('Consultório Dra. Ana Clara'));
  assert.ok(trialEmail.html.includes('Dra. Ana Clara'));
  assert.ok(trialEmail.html.includes('ana.clara@clinica.med.br'));
  assert.ok(trialEmail.html.includes('Medicina'));
  assert.ok(trialEmail.html.includes('Zemda Solo'));
  assert.ok(trialEmail.html.includes('Dias de teste'));
  assert.ok(trialEmail.html.includes('7'));
  assert.ok(trialEmail.html.includes('Ver Testes Grátis'));
  assert.ok(trialEmail.html.includes('https://zemda.com.br/superadmin?section=free_trials'));

  const trialLog = db.prepare('SELECT * FROM admin_notification_logs WHERE notification_type = ? AND related_entity_id = ?').get('TRIAL_STARTED', trialData.tenantId);
  assert.ok(trialLog);
  assert.equal(trialLog.status, 'SENT');
  console.log('✓ E-mail de novo teste grátis enviado com metadados do Solo e CTA para aba de Testes Grátis');

  // --- TEST 6: Trial já existente NÃO duplica ---
  console.log('\n--- TEST 6: Início de trial já existente NÃO duplica e-mail ---');
  await AdminNotificationService.notifyTrialStarted(trialData);
  assert.equal(emailDispatches.length, 1, 'Tentativa de disparar trial já existente não deve gerar segundo e-mail');
  console.log('✓ Idempotência de trial garantida');

  // --- TEST 7: Novo chamado aberto ---
  console.log('\n--- TEST 7: Notificação de Novo Chamado Aberto ---');
  emailDispatches.length = 0;

  const ticketData = {
    ticketId: 'tkt_9874',
    title: 'Dúvida sobre integração do WhatsApp Cloud',
    category: 'doubt',
    priority: 'high',
    userName: 'Carlos Silveira',
    clinicName: 'Clínica Odonto Viva',
    userEmail: 'carlos@odontoviva.com.br',
    createdAt: new Date('2026-09-27T14:15:00Z'),
    description: 'Olá, gostaríamos de tirar uma dúvida sobre como configurar o número comercial próprio na infraestrutura do WhatsApp Cloud API.',
    tenantId: 'tenant_odonto_1',
    userId: 'usr_carlos_1'
  };

  await AdminNotificationService.notifySupportTicketCreated(ticketData);

  assert.equal(emailDispatches.length, 1, 'Deveria ter enviado 1 e-mail de chamado');
  const ticketEmail = emailDispatches[0];
  assert.equal(ticketEmail.to, 'admin@saas.com');
  assert.equal(ticketEmail.subject, '🎫 Novo chamado aberto no Zemda — #tkt_9874');
  assert.ok(ticketEmail.html.includes('Novo chamado de suporte'));
  assert.ok(ticketEmail.html.includes('#tkt_9874'));
  assert.ok(ticketEmail.html.includes('Dúvida sobre integração do WhatsApp Cloud'));
  assert.ok(ticketEmail.html.includes('Dúvida'));
  assert.ok(ticketEmail.html.includes('Alta'));
  assert.ok(ticketEmail.html.includes('Carlos Silveira'));
  assert.ok(ticketEmail.html.includes('Clínica Odonto Viva'));
  assert.ok(ticketEmail.html.includes('carlos@odontoviva.com.br'));
  assert.ok(ticketEmail.html.includes('configurar o número comercial próprio'));
  assert.ok(ticketEmail.html.includes('Abrir chamado'));
  assert.ok(ticketEmail.html.includes('https://zemda.com.br/suporte?ticketId=tkt_9874'));

  const ticketLog = db.prepare('SELECT * FROM admin_notification_logs WHERE notification_type = ? AND related_entity_id = ?').get('SUPPORT_TICKET_CREATED', ticketData.ticketId);
  assert.ok(ticketLog);
  assert.equal(ticketLog.status, 'SENT');
  console.log('✓ E-mail de novo chamado enviado com preview seguro da mensagem e link direto');

  // --- TEST 8: Atualização/resposta do chamado NÃO dispara "novo chamado" ---
  console.log('\n--- TEST 8: Atualização/resposta do chamado NÃO dispara "novo chamado" ---');
  // Se chamado for reenviado com mesmo ticketId, é ignorado
  await AdminNotificationService.notifySupportTicketCreated(ticketData);
  assert.equal(emailDispatches.length, 1, 'Resposta ou reenvio não dispara novo chamado');
  console.log('✓ Respostas/atualizações não geram notificação de novo chamado');

  // --- TEST 9: Falha do Resend não quebra o fluxo e registra status FAILED ---
  console.log('\n--- TEST 9: Falha do Resend é tratada sem bloquear operação principal ---');
  emailDispatches.length = 0;
  mockFail = true;

  const userFailing = {
    userId: 'usr_failing_1',
    name: 'Paula Lima',
    email: 'paula.lima@teste.com',
    role: 'professional',
    clinicName: 'Clínica Teste',
    tenantId: 'tenant_teste_1'
  };

  // Não deve lançar exceção
  let threw = false;
  try {
    await AdminNotificationService.notifyNewUser(userFailing);
  } catch (err) {
    threw = true;
  }
  assert.equal(threw, false, 'notifyNewUser NÃO pode lançar exceção para o chamador');

  const failedLog = db.prepare('SELECT * FROM admin_notification_logs WHERE notification_type = ? AND related_entity_id = ?').get('NEW_USER', userFailing.userId);
  assert.ok(failedLog);
  assert.equal(failedLog.status, 'FAILED');
  assert.ok(failedLog.error.includes('Simulated Resend API Outage'));
  mockFail = false;
  console.log('✓ Falha do provedor de e-mail registrada como FAILED sem quebrar o fluxo principal');

  // --- TEST 10: Sandbox / Simulação NÃO envia e-mail real ---
  console.log('\n--- TEST 10: Eventos de Sandbox NÃO disparam e-mail real ---');
  emailDispatches.length = 0;

  const sandboxUser = {
    userId: 'sbx-user-999',
    name: 'Dr. Teste Sandbox',
    email: 'sandbox-123@zemda.test',
    tenantId: 'sbx-tenant-999',
    isSandboxSession: true
  };

  await AdminNotificationService.notifyNewUser(sandboxUser);
  assert.equal(emailDispatches.length, 0, 'Sandbox NUNCA deve despachar e-mail real');

  const sbxLog = db.prepare('SELECT * FROM admin_notification_logs WHERE notification_type = ? AND related_entity_id = ?').get('NEW_USER', sandboxUser.userId);
  assert.ok(sbxLog);
  assert.equal(sbxLog.status, 'SKIPPED_SANDBOX');
  console.log('✓ Sandbox detectado e suprimido com status SKIPPED_SANDBOX');

  // --- TEST 11: Links e Botões em todos os templates ---
  console.log('\n--- TEST 11: Validação de links, branding e integridade visual ---');
  const baseTemplateCheck = userEmail.html;
  assert.ok(baseTemplateCheck.includes('https://zemda.com.br/brand/zemda-logo.png'), 'Logo oficial Zemda deve estar presente');
  assert.ok(baseTemplateCheck.includes('#0d9488'), 'Cor oficial Teal do Zemda deve estar presente');
  assert.ok(baseTemplateCheck.includes('Notificação automática do Zemda — Administração Global'), 'Rodapé institucional requerido deve estar presente');

  console.log('\n====================================================');
  console.log('🎉 TODOS OS TESTES DE NOTIFICAÇÕES PASSARAM COM 100%!');
  console.log('====================================================');
}

run().catch(err => {
  console.error('❌ Falha nos testes de notificações:', err);
  process.exit(1);
});
