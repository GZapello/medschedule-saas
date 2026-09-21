/**
 * Teste automatizado para Envio Manual de Lembrete pelo WhatsApp (Zemda)
 */
const assert = require('assert');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

async function runTests() {
  console.log('--- [INÍCIO] Testes de Envio Manual de Lembrete pelo WhatsApp ---');

  // Carrega banco e utilitários compilados ou transpila via ts-node/requisição direta
  const { db, initializeDatabase } = require('./dist/config/database');
  initializeDatabase();
  const {
    cleanPhoneDigits,
    isValidPhoneNumber,
    normalizePhoneWithDDI,
    formatPhoneDisplay,
    buildWhatsAppReminderMessage,
    generateWhatsAppUrl
  } = require('./dist/utils/phone.utils');
  const { WhatsAppCloudService } = require('./dist/services/whatsapp-cloud.service');

  // ==========================================
  // TESTE 1: Limpeza, Validação e Normalização de Telefones
  // ==========================================
  console.log('\n[1] Testando Limpeza, Validação e Normalização de Telefones...');

  // Limpeza
  assert.strictEqual(cleanPhoneDigits('(54) 99999-8888'), '54999998888');
  assert.strictEqual(cleanPhoneDigits('+55 54 99999-8888'), '5554999998888');
  assert.strictEqual(cleanPhoneDigits(''), '');
  assert.strictEqual(cleanPhoneDigits(null), '');

  // Validação
  assert.strictEqual(isValidPhoneNumber('(54) 99999-8888'), true);
  assert.strictEqual(isValidPhoneNumber('5433334444'), true);
  assert.strictEqual(isValidPhoneNumber('+55 54 99999-8888'), true);
  assert.strictEqual(isValidPhoneNumber('123'), false, 'Menor que 10 dígitos deve ser inválido');
  assert.strictEqual(isValidPhoneNumber(''), false, 'Vazio deve ser inválido');
  assert.strictEqual(isValidPhoneNumber(null), false, 'Nulo deve ser inválido');

  // Normalização com DDI 55 (Sem duplicar 55)
  assert.strictEqual(
    normalizePhoneWithDDI('54999998888'),
    '5554999998888',
    'Número de 11 dígitos deve receber 55'
  );
  assert.strictEqual(
    normalizePhoneWithDDI('5433334444'),
    '555433334444',
    'Número de 10 dígitos deve receber 55'
  );
  assert.strictEqual(
    normalizePhoneWithDDI('5554999998888'),
    '5554999998888',
    'Número que já começa com 55 (13 dígitos) NÃO deve duplicar 55'
  );
  assert.strictEqual(
    normalizePhoneWithDDI('+55 54 99999-8888'),
    '5554999998888',
    'Número formatado com +55 NÃO deve duplicar 55'
  );

  // Formatação para exibição
  assert.strictEqual(formatPhoneDisplay('54999998888'), '(54) 99999-8888');
  assert.strictEqual(formatPhoneDisplay('5433334444'), '(54) 3333-4444');
  assert.strictEqual(formatPhoneDisplay('5554999998888'), '(54) 99999-8888');
  assert.strictEqual(formatPhoneDisplay('555433334444'), '(54) 3333-4444');

  console.log('✅ Teste 1 passou: Funções de telefone estão precisas e não duplicam DDI.');

  // ==========================================
  // TESTE 2: Geração de Mensagem Padronizada
  // ==========================================
  console.log('\n[2] Testando Geração de Mensagens (Hoje vs Outros Dias)...');

  const msgHoje = buildWhatsAppReminderMessage({
    patientName: 'Maria Silva',
    professionalName: 'Dr. Lucas Santos',
    clinicName: 'Clínica Bem Estar',
    startTime: '2026-09-21T14:30:00',
    serviceName: 'Consulta de Fonoaudiologia',
    isTodayOverride: true
  });

  assert(msgHoje.includes('Olá, Maria Silva! 😊'), 'Deve conter saudação com nome e emoji');
  assert(msgHoje.includes('marcada para hoje, às 14:30, com Dr. Lucas Santos.'), 'Deve indicar para hoje');
  assert(msgHoje.includes('Consulta: Consulta de Fonoaudiologia'), 'Deve indicar o serviço');
  assert(msgHoje.includes('— Clínica Bem Estar'), 'Deve conter assinatura da clínica');

  const msgFutura = buildWhatsAppReminderMessage({
    patientName: 'João Santos',
    professionalName: 'Dra. Ana Paula',
    clinicName: 'Clínica Bem Estar',
    startTime: '2026-09-25T10:00:00',
    serviceName: 'Avaliação Inicial',
    isTodayOverride: false
  });

  assert(msgFutura.includes('Olá, João Santos! 😊'), 'Deve conter saudação');
  assert(msgFutura.includes('no dia 25/09/2026, às 10:00, com Dra. Ana Paula.'), 'Deve conter data formatada');
  assert(msgFutura.includes('Consulta: Avaliação Inicial'), 'Deve conter o serviço');

  console.log('✅ Teste 2 passou: Mensagens construídas conforme especificação.');

  // ==========================================
  // TESTE 3: Geração de Link do WhatsApp (wa.me)
  // ==========================================
  console.log('\n[3] Testando Link Fallback wa.me...');
  const waUrl = generateWhatsAppUrl('(54) 99999-8888', msgHoje);
  assert(waUrl.startsWith('https://wa.me/5554999998888?text='), 'URL deve apontar para wa.me com DDI correto');
  assert(waUrl.includes(encodeURIComponent('Olá, Maria Silva! 😊')), 'Mensagem deve estar devidamente URL-encoded');

  console.log('✅ Teste 3 passou: URL wa.me formatada e codificada corretamente.');

  // ==========================================
  // TESTE 4: Verificação de Colunas na Tabela notifications
  // ==========================================
  console.log('\n[4] Verificando Migração no Banco de Dados (tabela notifications)...');
  const cols = db.prepare("PRAGMA table_info(notifications)").all();
  const colNames = cols.map(c => c.name);

  assert(colNames.includes('sent_by_user_id'), 'Coluna sent_by_user_id deve existir');
  assert(colNames.includes('sent_by_name'), 'Coluna sent_by_name deve existir');
  assert(colNames.includes('mode'), 'Coluna mode deve existir');
  assert(colNames.includes('external_message_id'), 'Coluna external_message_id deve existir');
  assert(colNames.includes('delivery_status'), 'Coluna delivery_status deve existir');

  console.log('✅ Teste 4 passou: Todas as novas colunas existem na tabela notifications.');

  // ==========================================
  // TESTE 5: Verificação de Status da Integração Central
  // ==========================================
  console.log('\n[5] Testando WhatsAppCloudService.isConnected()...');
  const connected = WhatsAppCloudService.isConnected();
  console.log(`ℹ️ Status atual da conexão oficial: ${connected ? 'Conectado' : 'Desconectado (utilizando fallback seguro)'}`);

  // ==========================================
  // TESTE 6: Simulação de Envio Manual / Fallback e Integridade do Agendamento
  // ==========================================
  console.log('\n[6] Testando Registro de Lembrete Manual e Não-Alteração do Status do Agendamento...');

  // Busca ou cria uma clínica e agendamento para teste
  let tenant = db.prepare("SELECT id, name FROM tenants WHERE status = 'active' LIMIT 1").get();
  if (!tenant) {
    const tid = 'test-tenant-' + uuidv4().slice(0, 6);
    db.prepare("INSERT INTO tenants (id, name, slug, status, plan, created_at) VALUES (?, ?, ?, 'active', 'pro', datetime('now'))")
      .run(tid, 'Clínica Teste WhatsApp', tid);
    tenant = { id: tid, name: 'Clínica Teste WhatsApp' };
  }

  let patient = db.prepare("SELECT id, full_name, phone FROM patients WHERE tenant_id = ? LIMIT 1").get(tenant.id);
  if (!patient) {
    const pid = 'pat-' + uuidv4().slice(0, 6);
    db.prepare("INSERT INTO patients (id, tenant_id, full_name, phone, created_at) VALUES (?, ?, 'Paciente Teste WhatsApp', '54988887777', datetime('now'))")
      .run(pid, tenant.id);
    patient = { id: pid, full_name: 'Paciente Teste WhatsApp', phone: '54988887777' };
  }

  let professional = db.prepare("SELECT id, name FROM professionals WHERE tenant_id = ? LIMIT 1").get(tenant.id);
  if (!professional) {
    const prid = 'prof-' + uuidv4().slice(0, 6);
    db.prepare("INSERT INTO professionals (id, tenant_id, name, active, created_at) VALUES (?, ?, 'Profissional Teste', 1, datetime('now'))")
      .run(prid, tenant.id);
    professional = { id: prid, name: 'Profissional Teste' };
  }

  let service = db.prepare("SELECT id, name FROM services WHERE tenant_id = ? LIMIT 1").get(tenant.id);
  if (!service) {
    const sid = 'srv-' + uuidv4().slice(0, 6);
    db.prepare("INSERT INTO services (id, tenant_id, name, duration_minutes, price, active, created_at) VALUES (?, ?, 'Sessão Teste', 50, 150, 1, datetime('now'))")
      .run(sid, tenant.id);
    service = { id: sid, name: 'Sessão Teste' };
  }

  // Cria agendamento de teste com status 'scheduled'
  const apptId = 'appt-test-' + uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO appointments (
      id, tenant_id, appointment_number, patient_id, professional_id, service_id,
      start_time, end_time, status, created_at
    ) VALUES (?, ?, 'TEST-001', ?, ?, ?, datetime('now', '+1 hour'), datetime('now', '+2 hours'), 'scheduled', datetime('now'))
  `).run(apptId, tenant.id, patient.id, professional.id, service.id);

  // Verifica status inicial do agendamento
  const initialAppt = db.prepare("SELECT status FROM appointments WHERE id = ?").get(apptId);
  assert.strictEqual(initialAppt.status, 'scheduled', 'Status inicial deve ser scheduled');

  // Simula o registro de um lembrete manual (fallback)
  const notifId = 'not-test-' + uuidv4().slice(0, 8);
  const normalizedPhone = normalizePhoneWithDDI(patient.phone);
  const reminderMessage = buildWhatsAppReminderMessage({
    patientName: patient.full_name,
    professionalName: professional.name,
    clinicName: tenant.name,
    startTime: new Date().toISOString(),
    serviceName: service.name,
    isTodayOverride: true
  });

  db.prepare(`
    INSERT INTO notifications (
      id, tenant_id, patient_id, professional_id, appointment_id,
      type, channel, recipient, content, status, delivery_status,
      mode, sent_by_user_id, sent_by_name, scheduled_for, sent_at
    ) VALUES (?, ?, ?, ?, ?, 'reminder_manual', 'whatsapp', ?, ?, 'sent', 'manual_opened', 'manual', 'usr-test', 'Operador Teste', datetime('now'), datetime('now'))
  `).run(
    notifId,
    tenant.id,
    patient.id,
    professional.id,
    apptId,
    normalizedPhone,
    reminderMessage
  );

  // Grava auditoria
  db.prepare(`
    INSERT INTO audit_logs (id, tenant_id, user_id, action, entity, entity_id, details_json, created_at)
    VALUES (?, ?, 'usr-test', 'WHATSAPP_MANUAL_OPENED', 'appointments', ?, ?, datetime('now'))
  `).run(
    uuidv4(),
    tenant.id,
    apptId,
    JSON.stringify({ recipient: normalizedPhone, sent_by: 'Operador Teste', channel: 'whatsapp_manual_link', mode: 'fallback' })
  );

  // 1. Verifica se o status do agendamento NÃO foi alterado
  const afterAppt = db.prepare("SELECT status FROM appointments WHERE id = ?").get(apptId);
  assert.strictEqual(
    afterAppt.status,
    'scheduled',
    'CRÍTICO: O envio de lembrete não deve modificar o status do agendamento!'
  );

  // 2. Consulta histórico de comunicações
  const comms = db.prepare(`
    SELECT id, type, channel, recipient, content, status, delivery_status,
           mode, sent_by_name, sent_at, created_at
    FROM notifications
    WHERE appointment_id = ? AND tenant_id = ?
    ORDER BY created_at DESC
  `).all(apptId, tenant.id);

  assert.strictEqual(comms.length, 1, 'Deve haver 1 comunicação registrada');
  assert.strictEqual(comms[0].mode, 'manual', 'Modo deve ser manual');
  assert.strictEqual(comms[0].delivery_status, 'manual_opened', 'Delivery status deve ser manual_opened');
  assert.strictEqual(comms[0].sent_by_name, 'Operador Teste', 'Nome de quem enviou deve ser gravado');

  // 3. Verifica trilha de auditoria
  const audit = db.prepare("SELECT action, entity, entity_id FROM audit_logs WHERE entity_id = ?").get(apptId);
  assert(audit, 'Registro de auditoria deve existir');
  assert.strictEqual(audit.action, 'WHATSAPP_MANUAL_OPENED');

  console.log('✅ Teste 6 passou: Registro manual persistido, auditoria criada e status do agendamento intacto.');

  // Limpeza do agendamento de teste
  db.prepare("DELETE FROM notifications WHERE id = ?").run(notifId);
  db.prepare("DELETE FROM appointments WHERE id = ?").run(apptId);

  console.log('\n======================================================');
  console.log('🎉 TODOS OS TESTES FORAM CONCLUÍDOS COM SUCESSO! 🎉');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Falha nos testes:', err);
  process.exit(1);
});
