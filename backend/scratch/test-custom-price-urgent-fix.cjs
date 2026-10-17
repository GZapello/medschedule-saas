const assert = require('assert');
const { db } = require('../dist/config/database');
const { AppointmentController } = require('../dist/controllers/appointment.controller');
const { DashboardController } = require('../dist/controllers/dashboard.controller');
const { PaymentController } = require('../dist/controllers/payment.controller');
const { DocumentsController } = require('../dist/controllers/documents.controller');

console.log('=== TESTE DE VALIDAÇÃO: VALOR PERSONALIZADO NA AGENDA DO PROFISSIONAL E ADMIN ===\n');

const tenantId = 'tenant-viver-bem';
const patientId = 'pat-mariana';
const profId = 'pro-camila';
const profUserId = 'usr-prof-camila';
const adminUserId = 'usr-admin-viverbem';
const testServiceId = 'srv-teste-urgente-' + Date.now();

// 1. Cadastrar serviço com preço padrão R$ 180,00
db.prepare(`
  INSERT INTO services (id, tenant_id, name, duration_minutes, price, active)
  VALUES (?, ?, 'Atendimento / Consulta Teste', 30, 180.00, 1)
`).run(testServiceId, tenantId);

console.log('✔ Serviço padrão cadastrado com sucesso: ID=' + testServiceId + ', price=180.00');

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

let appt220Id = null;
let appt0Id = null;

try {
  // =================================================================================
  // TESTE PRINCIPAL: R$ 180,00 -> alterado para R$ 220,00
  // =================================================================================
  console.log('\n--- 1. TESTE PRINCIPAL (R$ 180,00 -> R$ 220,00) ---');

  const reqCreate220 = {
    tenantId,
    path: '/v1/appointments',
    body: {
      patientId,
      professionalId: profId,
      serviceId: testServiceId,
      appointmentPrice: 220.00, // alterado no modal
      startTime: '2026-10-26T10:00:00',
      endTime: '2026-10-26T10:30:00',
      modality: 'presential',
      isCustomTime: true
    },
    user: { userId: profUserId, name: 'Dra. Camila Torres', role: 'professional' }
  };
  const resCreate220 = mockResponse();
  AppointmentController.create(reqCreate220, resCreate220);

  assert.strictEqual(resCreate220.getStatusCode(), 201, 'POST /v1/appointments deve responder 201');
  appt220Id = resCreate220.getBody().id;
  assert.ok(appt220Id, 'ID do agendamento deve ser retornado');
  console.log('✔ POST /v1/appointments criou o agendamento:', appt220Id);

  // Validar banco: payments.amount = 220.00
  const payment220 = db.prepare('SELECT * FROM payments WHERE appointment_id = ? AND tenant_id = ?').get(appt220Id, tenantId);
  assert.ok(payment220, 'Registro em payments deve existir');
  assert.strictEqual(payment220.amount, 220, 'Banco: payments.amount deve ser 220');
  assert.strictEqual(payment220.status, 'pending', 'Banco: payments.status deve ser pending');
  console.log('✔ Banco de dados validado: payments.amount = 220.00');

  // Validar banco: services.price continua 180.00
  const serviceCheck = db.prepare('SELECT price FROM services WHERE id = ?').get(testServiceId);
  assert.strictEqual(serviceCheck.price, 180, 'Preço padrão do serviço não deve ser alterado!');
  console.log('✔ Preço global do serviço preservado: services.price = 180.00');

  // Validar GET /v1/appointments consultado como clinic_admin
  const reqListAdmin = {
    tenantId,
    path: '/v1/appointments',
    query: { startDate: '2026-10-26T00:00:00', endDate: '2026-10-26T23:59:59' },
    user: { userId: adminUserId, name: 'Admin', role: 'clinic_admin' }
  };
  const resListAdmin = mockResponse();
  AppointmentController.list(reqListAdmin, resListAdmin);
  const adminAppt220 = resListAdmin.getBody().find(a => a.id === appt220Id);
  assert.ok(adminAppt220, 'Admin deve listar o agendamento');
  assert.strictEqual(adminAppt220.service_price, 180, 'Admin: service_price deve ser 180');
  assert.strictEqual(adminAppt220.payment_amount, 220, 'Admin: payment_amount deve ser 220');
  assert.strictEqual(adminAppt220.display_amount, 220, 'Admin: display_amount deve ser 220');
  console.log('✔ GET /v1/appointments (clinic_admin): service_price=180, payment_amount=220, display_amount=220');

  // Validar GET /v1/appointments consultado como professional
  const reqListProf = {
    tenantId,
    path: '/v1/appointments',
    query: { startDate: '2026-10-26T00:00:00', endDate: '2026-10-26T23:59:59' },
    user: { userId: profUserId, name: 'Dra. Camila Torres', role: 'professional' }
  };
  const resListProf = mockResponse();
  AppointmentController.list(reqListProf, resListProf);
  const profAppt220 = resListProf.getBody().find(a => a.id === appt220Id);
  assert.ok(profAppt220, 'Profissional deve listar o agendamento');
  assert.strictEqual(profAppt220.service_price, 180, 'Profissional: service_price deve ser 180');
  assert.strictEqual(profAppt220.payment_amount, 220, 'Profissional: payment_amount deve ser 220');
  assert.strictEqual(profAppt220.display_amount, 220, 'Profissional: display_amount deve ser 220');
  console.log('✔ GET /v1/appointments (professional): service_price=180, payment_amount=220, display_amount=220');

  // Validar GET /v1/appointments/:id (Detalhes do agendamento)
  const reqGet220 = {
    tenantId,
    params: { id: appt220Id },
    user: { userId: profUserId, name: 'Dra. Camila Torres', role: 'professional' }
  };
  const resGet220 = mockResponse();
  AppointmentController.getById(reqGet220, resGet220);
  const detailAppt220 = resGet220.getBody().appointment;
  assert.strictEqual(detailAppt220.service_price, 180, 'Detalhes: service_price deve ser 180');
  assert.strictEqual(detailAppt220.payment_amount, 220, 'Detalhes: payment_amount deve ser 220');
  assert.strictEqual(detailAppt220.display_amount, 220, 'Detalhes: display_amount deve ser 220');
  console.log('✔ Detalhes do atendimento (getById): payment_amount=220, display_amount=220');

  // Validar GET /v1/appointments/:id/completion (Atendimento iniciado)
  const reqCompletion220 = {
    tenantId,
    params: { id: appt220Id },
    user: { userId: profUserId, name: 'Dra. Camila Torres', role: 'professional' }
  };
  const resCompletion220 = mockResponse();
  DocumentsController.consultationStatus(reqCompletion220, resCompletion220);
  assert.strictEqual(resCompletion220.getBody().payment?.amount, 220, 'Atendimento iniciado: payment.amount deve ser 220');
  console.log('✔ Atendimento iniciado (/completion): payment.amount = 220.00');

  // Validar Financeiro: GET /v1/payments
  const reqPayments = {
    tenantId,
    query: {},
    user: { userId: adminUserId, name: 'Admin', role: 'clinic_admin' }
  };
  const resPayments = mockResponse();
  PaymentController.list(reqPayments, resPayments);
  const finPayment220 = resPayments.getBody().payments.find(p => p.appointment_id === appt220Id);
  assert.ok(finPayment220, 'Pagamento deve constar no Financeiro');
  assert.strictEqual(finPayment220.amount, 220, 'Financeiro: amount deve ser 220');
  console.log('✔ Financeiro (GET /v1/payments): amount = 220.00');

  // =================================================================================
  // TESTE R$ 0,00 (Isenção): Serviço R$ 180,00 -> alterado para R$ 0,00
  // =================================================================================
  console.log('\n--- 2. TESTE R$ 0,00 (Isenção de Atendimento) ---');

  const reqCreate0 = {
    tenantId,
    path: '/v1/appointments',
    body: {
      patientId,
      professionalId: profId,
      serviceId: testServiceId,
      appointmentPrice: 0.00, // gratuito/isento
      startTime: '2026-10-26T11:00:00',
      endTime: '2026-10-26T11:30:00',
      modality: 'presential',
      isCustomTime: true
    },
    user: { userId: profUserId, name: 'Dra. Camila Torres', role: 'professional' }
  };
  const resCreate0 = mockResponse();
  AppointmentController.create(reqCreate0, resCreate0);

  assert.strictEqual(resCreate0.getStatusCode(), 201, 'POST com R$ 0 deve responder 201');
  appt0Id = resCreate0.getBody().id;
  assert.ok(appt0Id, 'ID do agendamento isento deve ser retornado');

  // Validar banco: payments.amount = 0 e status = 'exempt'
  const payment0 = db.prepare('SELECT * FROM payments WHERE appointment_id = ? AND tenant_id = ?').get(appt0Id, tenantId);
  assert.ok(payment0, 'Registro em payments para R$ 0 deve existir');
  assert.strictEqual(payment0.amount, 0, 'Banco: payments.amount deve ser 0');
  assert.strictEqual(payment0.status, 'exempt', 'Banco: status deve ser exempt');
  console.log('✔ Banco de dados validado para R$ 0: payments.amount = 0.00, status = exempt');

  // Validar GET /v1/appointments para profissional com R$ 0
  const resListProf0 = mockResponse();
  AppointmentController.list(reqListProf, resListProf0);
  const profAppt0 = resListProf0.getBody().find(a => a.id === appt0Id);
  assert.ok(profAppt0, 'Profissional deve listar agendamento isento');
  assert.strictEqual(profAppt0.service_price, 180, 'service_price deve ser 180');
  assert.strictEqual(profAppt0.payment_amount, 0, 'payment_amount deve ser 0, NUNCA substituído por 180');
  assert.strictEqual(profAppt0.display_amount, 0, 'display_amount deve ser 0, NUNCA substituído por 180');
  console.log('✔ Agenda do profissional com R$ 0: display_amount = 0 (não reverte para 180)');

  // Validar GET /v1/appointments para admin com R$ 0
  const resListAdmin0 = mockResponse();
  AppointmentController.list(reqListAdmin, resListAdmin0);
  const adminAppt0 = resListAdmin0.getBody().find(a => a.id === appt0Id);
  assert.strictEqual(adminAppt0.payment_amount, 0, 'Admin: payment_amount deve ser 0');
  assert.strictEqual(adminAppt0.display_amount, 0, 'Admin: display_amount deve ser 0');
  console.log('✔ Agenda do admin com R$ 0: display_amount = 0');

  // Validar Detalhes (getById) com R$ 0
  const reqGet0 = {
    tenantId,
    params: { id: appt0Id },
    user: { userId: profUserId, name: 'Dra. Camila Torres', role: 'professional' }
  };
  const resGet0 = mockResponse();
  AppointmentController.getById(reqGet0, resGet0);
  assert.strictEqual(resGet0.getBody().appointment.payment_amount, 0, 'Detalhes: payment_amount deve ser 0');
  assert.strictEqual(resGet0.getBody().appointment.display_amount, 0, 'Detalhes: display_amount deve ser 0');
  console.log('✔ Detalhes do atendimento com R$ 0: display_amount = 0');

  console.log('\n======================================================');
  console.log('🎉 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!');
  console.log('======================================================');
} finally {
  // Limpeza
  if (appt220Id) {
    db.prepare('DELETE FROM payments WHERE appointment_id = ?').run(appt220Id);
    db.prepare('DELETE FROM appointment_status_history WHERE appointment_id = ?').run(appt220Id);
    db.prepare('DELETE FROM notifications WHERE appointment_id = ?').run(appt220Id);
    db.prepare('DELETE FROM appointments WHERE id = ?').run(appt220Id);
  }
  if (appt0Id) {
    db.prepare('DELETE FROM payments WHERE appointment_id = ?').run(appt0Id);
    db.prepare('DELETE FROM appointment_status_history WHERE appointment_id = ?').run(appt0Id);
    db.prepare('DELETE FROM notifications WHERE appointment_id = ?').run(appt0Id);
    db.prepare('DELETE FROM appointments WHERE id = ?').run(appt0Id);
  }
  db.prepare('DELETE FROM services WHERE id = ?').run(testServiceId);
  console.log('✔ Limpeza de dados temporários realizada com sucesso.');
}
