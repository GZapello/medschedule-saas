const assert = require('assert');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../dist/config/database');
const { AppointmentController } = require('../dist/controllers/appointment.controller');
const { DashboardController } = require('../dist/controllers/dashboard.controller');

console.log('=== TESTES DE VALOR PERSONALIZADO NA AGENDA OPERACIONAL ===\n');

const tenantId = 'tenant-viver-bem';
const patientId = 'pat-mariana';
const profId = 'pro-camila';
const serviceId = 'srv-consulta-teste-' + Date.now();

// Cria serviço com preço padrão 180.00
const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

// Limpeza prévia
const oldAppts = db.prepare('SELECT id FROM appointments WHERE tenant_id = ? AND start_time IN (?, ?, ?)').all(tenantId, `${todayStr}T08:00:00`, `${todayStr}T09:00:00`, `${todayStr}T10:00:00`);
for (const a of oldAppts) {
  db.prepare('DELETE FROM payments WHERE appointment_id = ?').run(a.id);
  db.prepare('DELETE FROM appointment_status_history WHERE appointment_id = ?').run(a.id);
  db.prepare('DELETE FROM notifications WHERE appointment_id = ?').run(a.id);
  db.prepare('DELETE FROM appointments WHERE id = ?').run(a.id);
}

db.prepare(`
  INSERT INTO services (id, tenant_id, name, duration_minutes, price, active)
  VALUES (?, ?, 'Atendimento / Consulta Teste', 30, 180.00, 1)
`).run(serviceId, tenantId);

function mockResponse() {
  let statusCode = 200;
  let jsonBody = null;
  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      jsonBody = body;
      return this;
    },
    getStatusCode: () => statusCode,
    getBody: () => jsonBody
  };
}

// ---------------------------------------------------------------------------------
// TESTE 1: Serviço padrão R$ 180,00 sem alteração
// ---------------------------------------------------------------------------------
console.log('--- TESTE 1: Agendamento sem alterar preço padrão (R$ 180,00) ---');
const req1 = {
  tenantId,
  path: '/v1/appointments',
  body: {
    patientId,
    professionalId: profId,
    serviceId,
    startTime: `${todayStr}T08:00:00`,
    endTime: `${todayStr}T08:30:00`,
    modality: 'presential',
    isCustomTime: true
  },
  user: { userId: 'usr-admin', name: 'Admin Teste', role: 'clinic_admin' }
};
const res1 = mockResponse();
AppointmentController.create(req1, res1);
assert.strictEqual(res1.getStatusCode(), 201, 'Agendamento 1 deve ser criado com sucesso');

const appt1 = db.prepare(`
  SELECT a.id, pay.amount as payment_amount, pay.status as payment_status
  FROM appointments a
  LEFT JOIN payments pay ON pay.appointment_id = a.id AND pay.tenant_id = a.tenant_id
  WHERE a.tenant_id = ? AND a.service_id = ? AND a.start_time = ?
`).get(tenantId, serviceId, `${todayStr}T08:00:00`);

assert.ok(appt1, 'Agendamento 1 deve existir no banco');
assert.strictEqual(appt1.payment_amount, 180, 'Payment criado deve ter valor 180.00');
console.log('✔ Agendamento 1 criado com payment.amount = 180');

// ---------------------------------------------------------------------------------
// TESTE 2: Alterar para R$ 150,00
// ---------------------------------------------------------------------------------
console.log('\n--- TESTE 2: Agendamento com preço personalizado (R$ 150,00) ---');
const req2 = {
  tenantId,
  path: '/v1/appointments',
  body: {
    patientId,
    professionalId: profId,
    serviceId,
    appointmentPrice: 150.00,
    startTime: `${todayStr}T09:00:00`,
    endTime: `${todayStr}T09:30:00`,
    modality: 'presential',
    isCustomTime: true
  },
  user: { userId: 'usr-admin', name: 'Admin Teste', role: 'clinic_admin' }
};
const res2 = mockResponse();
AppointmentController.create(req2, res2);
assert.strictEqual(res2.getStatusCode(), 201, 'Agendamento 2 deve ser criado com sucesso');

const appt2 = db.prepare(`
  SELECT a.id, pay.amount as payment_amount, pay.status as payment_status
  FROM appointments a
  LEFT JOIN payments pay ON pay.appointment_id = a.id AND pay.tenant_id = a.tenant_id
  WHERE a.tenant_id = ? AND a.service_id = ? AND a.start_time = ?
`).get(tenantId, serviceId, `${todayStr}T09:00:00`);

assert.ok(appt2, 'Agendamento 2 deve existir no banco');
assert.strictEqual(appt2.payment_amount, 150, 'Payment criado deve ter valor acordado de 150.00');

// Verifica que serviço continua 180.00
const srvCheck = db.prepare('SELECT price FROM services WHERE id = ?').get(serviceId);
assert.strictEqual(srvCheck.price, 180, 'Serviço global deve continuar custando 180.00');
console.log('✔ Agendamento 2 criado com payment.amount = 150, e serviço global continua 180');

// ---------------------------------------------------------------------------------
// TESTE 3: Valor personalizado R$ 0,00 (Isenção intencional)
// ---------------------------------------------------------------------------------
console.log('\n--- TESTE 3: Agendamento com valor R$ 0,00 (Isenção) ---');
const req3 = {
  tenantId,
  path: '/v1/appointments',
  body: {
    patientId,
    professionalId: profId,
    serviceId,
    appointmentPrice: 0.00,
    startTime: `${todayStr}T10:00:00`,
    endTime: `${todayStr}T10:30:00`,
    modality: 'presential',
    isCustomTime: true
  },
  user: { userId: 'usr-admin', name: 'Admin Teste', role: 'clinic_admin' }
};
const res3 = mockResponse();
AppointmentController.create(req3, res3);
assert.strictEqual(res3.getStatusCode(), 201, 'Agendamento 3 deve ser criado com sucesso');

const appt3 = db.prepare(`
  SELECT a.id, pay.amount as payment_amount, pay.status as payment_status
  FROM appointments a
  LEFT JOIN payments pay ON pay.appointment_id = a.id AND pay.tenant_id = a.tenant_id
  WHERE a.tenant_id = ? AND a.service_id = ? AND a.start_time = ?
`).get(tenantId, serviceId, `${todayStr}T10:00:00`);

assert.ok(appt3, 'Agendamento 3 deve existir no banco');
assert.strictEqual(appt3.payment_amount, 0, 'Payment criado deve ter valor 0.00');
assert.strictEqual(appt3.payment_status, 'exempt', 'Status do payment 0.00 deve ser exempt');
console.log('✔ Agendamento 3 criado com payment.amount = 0 e status = exempt');

// ---------------------------------------------------------------------------------
// TESTE 4: Consulta na Agenda de Hoje (DashboardController.getMetrics)
// ---------------------------------------------------------------------------------
console.log('\n--- TESTE 4: Agenda de Hoje (DashboardController.getMetrics) ---');
const reqDash = {
  tenantId,
  query: { date: todayStr },
  user: { userId: 'usr-admin', name: 'Admin Teste', role: 'clinic_admin' }
};
const resDash = mockResponse();
DashboardController.getMetrics(reqDash, resDash);
assert.strictEqual(resDash.getStatusCode(), 200);

const dashData = resDash.getBody();
const todayAppts = dashData.today.appointments;

const item1 = todayAppts.find(a => a.id === appt1.id);
const item2 = todayAppts.find(a => a.id === appt2.id);
const item3 = todayAppts.find(a => a.id === appt3.id);

assert.ok(item1, 'Atendimento 1 deve estar na Agenda de Hoje');
assert.strictEqual(item1.payment_amount, 180);
assert.strictEqual(item1.display_amount, 180);
console.log(`✔ Atendimento 1 (sem alteração): display_amount = ${item1.display_amount} (R$ 180,00)`);

assert.ok(item2, 'Atendimento 2 deve estar na Agenda de Hoje');
assert.strictEqual(item2.payment_amount, 150);
assert.strictEqual(item2.display_amount, 150);
console.log(`✔ Atendimento 2 (personalizado): display_amount = ${item2.display_amount} (R$ 150,00)`);

assert.ok(item3, 'Atendimento 3 deve estar na Agenda de Hoje');
assert.strictEqual(item3.payment_amount, 0);
assert.strictEqual(item3.display_amount, 0, 'Zero não pode ser substituído pelo preço padrão 180');
console.log(`✔ Atendimento 3 (gratuito/isento): display_amount = ${item3.display_amount} (R$ 0,00)`);

// ---------------------------------------------------------------------------------
// TESTE 5: Alteração futura do serviço global não altera agendamentos passados
// ---------------------------------------------------------------------------------
console.log('\n--- TESTE 5: Alteração posterior do preço global do serviço para R$ 200,00 ---');
db.prepare('UPDATE services SET price = 200.00 WHERE id = ?').run(serviceId);

const resDashAfter = mockResponse();
DashboardController.getMetrics(reqDash, resDashAfter);
const dashDataAfter = resDashAfter.getBody();
const item2After = dashDataAfter.today.appointments.find(a => a.id === appt2.id);

assert.strictEqual(item2After.display_amount, 150, 'Agendamento anterior deve continuar exibindo R$ 150,00!');
assert.strictEqual(item2After.service_price, 200, 'Preço atual do serviço agora é 200, mas atendimento preservou 150');
console.log(`✔ Agendamento histórico preservou R$ 150,00 mesmo após serviço subir para R$ 200,00`);

// ---------------------------------------------------------------------------------
// TESTE 6: Fallback em agendamento legado sem payment
// ---------------------------------------------------------------------------------
console.log('\n--- TESTE 6: Agendamento legado sem registro de payment correspondente ---');
const legacyApptId = 'apt-legacy-' + Date.now();
db.prepare(`
  INSERT INTO appointments (
    id, tenant_id, appointment_number, patient_id, professional_id, service_id,
    start_time, end_time, status, modality, created_by
  )
  VALUES (?, ?, 'AG-LEGACY-001', ?, ?, ?, ?, ?, 'scheduled', 'presential', 'seed')
`).run(legacyApptId, tenantId, patientId, profId, serviceId, `${todayStr}T11:00:00`, `${todayStr}T11:30:00`);

const resDashLegacy = mockResponse();
DashboardController.getMetrics(reqDash, resDashLegacy);
const legacyItem = resDashLegacy.getBody().today.appointments.find(a => a.id === legacyApptId);

assert.ok(legacyItem, 'Agendamento legado deve constar na agenda');
assert.strictEqual(legacyItem.payment_amount, null, 'payment_amount deve ser null');
assert.strictEqual(legacyItem.display_amount, 200, 'display_amount deve usar fallback do serviço (200.00)');
console.log(`✔ Agendamento legado sem payment usou fallback correto: display_amount = ${legacyItem.display_amount}`);

// Limpeza de dados de teste
db.prepare('DELETE FROM payments WHERE appointment_id IN (?, ?, ?)').run(appt1.id, appt2.id, appt3.id);
db.prepare('DELETE FROM appointment_status_history WHERE appointment_id IN (?, ?, ?, ?)').run(appt1.id, appt2.id, appt3.id, legacyApptId);
db.prepare('DELETE FROM notifications WHERE appointment_id IN (?, ?, ?)').run(appt1.id, appt2.id, appt3.id);
db.prepare('DELETE FROM appointments WHERE id IN (?, ?, ?, ?)').run(appt1.id, appt2.id, appt3.id, legacyApptId);
db.prepare('DELETE FROM services WHERE id = ?').run(serviceId);

console.log('\n======================================================');
console.log('TODOS OS TESTES PASSARAM COM 100% DE SUCESSO! 🎉');
console.log('======================================================');
