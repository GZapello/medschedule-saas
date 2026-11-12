// Teste obrigatório da Fase 1 (Seção 3.4): Disponibilidade de Horários, Intervalo de Almoço, Antecedência Mínima e Horário Avulso
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-phase1-'));
process.env.DATABASE_PATH = path.join(tempDir, 'test.db');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'phase1-test-secret-2026';
process.env.RESEND_API_KEY = '';
process.env.GEMINI_API_KEY = '';

const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();
require('./dist/services/billing.service').canOperate = () => true;

const { calculateAvailableSlots, explainEmptySlots } = require('./dist/utils/slot-calculator');
const { SlotController } = require('./dist/controllers/slot.controller');
const { AppointmentController } = require('./dist/controllers/appointment.controller');
const { ServiceController } = require('./dist/controllers/service.controller');

const express = require('express');
const app = express();
app.use(express.json());
const api = express.Router();

api.get('/v1/public/slots/available', SlotController.getAvailableSlots);
api.use((req, _res, next) => {
  req.tenantId = 'clinic-p1';
  req.user = { userId: 'user-p1', tenantId: 'clinic-p1', role: 'clinic_admin' };
  next();
});
api.get('/v1/slots/available', SlotController.getAvailableSlots);
api.post('/v1/appointments', AppointmentController.create);
api.post('/v1/services', ServiceController.create);
api.put('/v1/services/:id', ServiceController.update);
app.use('/api', api);

// Setup fixture: Clínica 08:00 às 18:00 com intervalo de almoço 12:00 às 13:30
db.prepare(`
  INSERT INTO tenants (id, slug, name, email, status, public_booking_enabled, public_booking_slug, public_booking_sequence)
  VALUES ('clinic-p1', 'clinica-p1', 'Clínica Fase 1', 'p1@zemda.test', 'active', 1, 'clinica-p1', 1)
`).run();

db.prepare(`
  INSERT INTO users (id, tenant_id, name, email, password_hash, role, status)
  VALUES ('user-p1', 'clinic-p1', 'Admin P1', 'admin@p1.test', 'hash', 'clinic_admin', 'active')
`).run();

db.prepare(`
  INSERT INTO professionals (id, tenant_id, user_id, name, active, public_booking_enabled, slug)
  VALUES ('pro-lunch', 'clinic-p1', 'user-p1', 'Dra. Clara (Intervalo)', 1, 1, 'clara')
`).run();

db.prepare(`
  INSERT INTO professionals (id, tenant_id, name, active, public_booking_enabled, slug)
  VALUES ('pro-two-shifts', 'clinic-p1', 'Dr. Bruno (Dois Turnos)', 1, 1, 'bruno')
`).run();

// Escala Dra. Clara: 08:00 às 18:00 com intervalo 12:00 às 13:30
for (let d = 0; d < 7; d++) {
  db.prepare(`
    INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, break_start, break_end, is_active)
    VALUES (?, 'clinic-p1', 'pro-lunch', ?, '08:00', '18:00', '12:00', '13:30', 1)
  `).run(`sched-lunch-${d}`, d);

  // Escala Dr. Bruno: Dois turnos separados (08:00-12:00 e 13:30-18:00)
  db.prepare(`
    INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, break_start, break_end, is_active)
    VALUES (?, 'clinic-p1', 'pro-two-shifts', ?, '08:00', '12:00', NULL, NULL, 1)
  `).run(`sched-shift1-${d}`, d);
  db.prepare(`
    INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, break_start, break_end, is_active)
    VALUES (?, 'clinic-p1', 'pro-two-shifts', ?, '13:30', '18:00', NULL, NULL, 1)
  `).run(`sched-shift2-${d}`, d);
}

db.prepare(`
  INSERT INTO patients (id, tenant_id, full_name, phone, active)
  VALUES ('pat-p1', 'clinic-p1', 'Paciente Teste', '11999998888', 1)
`).run();

// Data de teste (segunda-feira simulada às 09:00 da manhã no fuso -03:00)
const testDate = '2026-11-16';
const mockNow09h = new Date(`${testDate}T09:00:00-03:00`);

const server = app.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: res.status, body: await res.json() };
  };

  try {
    // 1. ServiceController deve preservar minLeadTimeHours = 0
    const createdSrv0 = await call('POST', '/v1/services', {
      professionalId: 'pro-lunch',
      name: 'Consulta 50min (Lead 0h)',
      durationMinutes: 50,
      bufferMinutes: 0,
      price: 150,
      minLeadTimeHours: 0
    });
    assert.equal(createdSrv0.status, 201);
    assert.equal(createdSrv0.body.min_lead_time_hours, 0, 'minLeadTimeHours = 0 deve ser preservado na criação');
    const srvId = createdSrv0.body.id;
    const dbSrv0 = db.prepare('SELECT min_lead_time_hours FROM services WHERE id = ?').get(srvId);
    assert.equal(dbSrv0.min_lead_time_hours, 0);

    // Segundo serviço (30 min) para testar mudança de serviço
    const createdSrv30 = await call('POST', '/v1/services', {
      professionalId: 'pro-two-shifts',
      name: 'Retorno Rápido 30min',
      durationMinutes: 30,
      bufferMinutes: 0,
      price: 100,
      minLeadTimeHours: 2
    });
    assert.equal(createdSrv30.status, 201);
    assert.equal(createdSrv30.body.min_lead_time_hours, 2);
    const srv30Id = createdSrv30.body.id;

    // 2. Consulta às 09:00 sem antecedência mínima (0h) com intervalo de almoço 12:00-13:30
    const slots0h = calculateAvailableSlots('clinic-p1', 'pro-lunch', srvId, testDate, undefined, mockNow09h);
    const times0h = slots0h.map(s => s.time);
    assert.ok(times0h.includes('09:40') && times0h.includes('10:30'), `Deve oferecer horários da manhã às 09h sem antecedência: ${times0h.join(', ')}`);
    assert.ok(!times0h.includes('08:00') && !times0h.includes('08:50'), 'Não deve oferecer horários que já passaram (08:00, 08:50)');
    assert.ok(times0h.includes('13:30'), `Retorno do almoço deve começar exatamente às 13:30 (e não pular para 13:50): ${times0h.join(', ')}`);
    console.log('✓ [1] Sem antecedência mínima (0h) às 09h + início exato pós-almoço às 13:30');

    // 3. Antecedência mínima de 2h às 09:00 (corte 11:00):
    // Público respeita 2h (oferece 11:00 antes do almoço e 13:30 após); Interno com ignoreLeadTime=1 oferece desde 09:40!
    await call('PUT', `/v1/services/${srvId}`, { minLeadTimeHours: 2 });
    const slots2hPublic = calculateAvailableSlots('clinic-p1', 'pro-lunch', srvId, testDate, undefined, mockNow09h);
    const times2hPublic = slots2hPublic.map(s => s.time);
    assert.ok(!times2hPublic.includes('09:40') && !times2hPublic.includes('10:30'), 'Público com 2h de antecedência às 09h não oferece < 11:00');
    assert.ok(times2hPublic.includes('11:00'), `Com 2h de antecedência às 09h (corte 11:00), o horário 11:00-11:50 cabe antes do almoço (12:00): ${times2hPublic.join(', ')}`);
    assert.ok(times2hPublic.includes('13:30'), 'Tarde começa às 13:30');

    const res2hInternal = await call(
      'GET',
      `/v1/slots/available?professionalId=pro-lunch&serviceId=${srvId}&date=${testDate}&ignoreLeadTime=1&_mockNow=${encodeURIComponent(mockNow09h.toISOString())}`
    );
    assert.equal(res2hInternal.status, 200);
    const times2hInternal = res2hInternal.body.slots.map(s => s.time);
    assert.ok(times2hInternal.includes('09:40') && times2hInternal.includes('10:30'), 'Agendamento administrativo interno ignora antecedência pública e exibe manhã (09:40, 10:30)');

    // Rota pública NUNCA ignora antecedência mínima mesmo se tentar passar ignoreLeadTime=1
    const res2hPublicRoute = await call(
      'GET',
      `/v1/public/slots/available?tenantSlug=clinica-p1&bookingSequence=1&professionalId=pro-lunch&serviceId=${srvId}&date=${testDate}&ignoreLeadTime=1&_mockNow=${encodeURIComponent(mockNow09h.toISOString())}`
    );
    assert.equal(res2hPublicRoute.status, 200);
    assert.ok(!res2hPublicRoute.body.slots.some(s => s.time === '09:40'), 'Link público preserva restrição de antecedência mínima');
    console.log('✓ [2] Antecedência mínima de 2h (público vs administrativo interno)');

    // 4. Antecedência mínima de 4h às 09:00 (corte 13:00 -> primeiro horário público é 13:30)
    await call('PUT', `/v1/services/${srvId}`, { minLeadTimeHours: 4 });
    const slots4hPublic = calculateAvailableSlots('clinic-p1', 'pro-lunch', srvId, testDate, undefined, mockNow09h);
    assert.equal(slots4hPublic[0].time, '13:30', 'Com 4h de antecedência às 09h, o primeiro horário público é 13:30');
    const slots4hInternal = calculateAvailableSlots('clinic-p1', 'pro-lunch', srvId, testDate, undefined, mockNow09h, undefined, undefined, { ignoreLeadTime: true });
    assert.equal(slots4hInternal[0].time, '09:40', 'Interno com ignoreLeadTime continua oferecendo 09:40');
    console.log('✓ [3] Antecedência mínima de 4h');

    // Volta para 0h para testar consultas agendadas, dois turnos e Google Agenda
    await call('PUT', `/v1/services/${srvId}`, { minLeadTimeHours: 0 });

    // 5. Com e sem consultas já agendadas
    const bookMorning = await call('POST', '/v1/appointments', {
      patientId: 'pat-p1',
      professionalId: 'pro-lunch',
      serviceId: srvId,
      startTime: `${testDate}T09:40:00`,
      endTime: `${testDate}T10:30:00`,
      appointmentPrice: 150,
      modality: 'presential',
      _mockNow: mockNow09h.toISOString()
    });
    assert.equal(bookMorning.status, 201);

    const slotsAfterBook = calculateAvailableSlots('clinic-p1', 'pro-lunch', srvId, testDate, undefined, mockNow09h);
    assert.ok(!slotsAfterBook.some(s => s.time === '09:40'), 'Horário 09:40 ocupado não deve aparecer');
    assert.ok(slotsAfterBook.some(s => s.time === '10:30'), 'Horário 10:30 livre deve continuar disponível');
    console.log('✓ [4] Com e sem consultas já agendadas');

    // 6. Profissional em dois turnos (08:00-12:00 e 13:30-18:00) e mudança de profissional/serviço
    const slotsTwoShifts = calculateAvailableSlots('clinic-p1', 'pro-two-shifts', srv30Id, testDate, undefined, mockNow09h, undefined, undefined, { ignoreLeadTime: true });
    const timesTwoShifts = slotsTwoShifts.map(s => s.time);
    assert.ok(timesTwoShifts.includes('09:00') && timesTwoShifts.includes('11:30'), 'Primeiro turno de 30min oferece de 09:00 a 11:30');
    assert.ok(!timesTwoShifts.some(t => t >= '12:00' && t < '13:30'), 'Intervalo entre turnos (12:00-13:30) respeitado');
    assert.ok(timesTwoShifts.includes('13:30') && timesTwoShifts.includes('17:30'), 'Segundo turno começa às 13:30 e vai até 17:30');
    console.log('✓ [5] Profissional em dois turnos e mudança de serviço/profissional');

    // 7. Compromissos da Google Agenda (FreeBusy às 10:30-11:30 bloqueia 10:30 mas preserva 13:30)
    const googleBusy = [{ startMin: 10 * 60 + 30, endMin: 11 * 60 + 30 }];
    const slotsWithGoogle = calculateAvailableSlots('clinic-p1', 'pro-lunch', srvId, testDate, undefined, mockNow09h, googleBusy);
    assert.ok(!slotsWithGoogle.some(s => s.time === '10:30'), 'Compromisso externo Google das 10:30-11:30 deve bloquear slot 10:30');
    assert.ok(slotsWithGoogle.some(s => s.time === '13:30'), 'Slots livres à tarde permanecem disponíveis');
    console.log('✓ [6] Compromissos da Google Agenda respeitados');

    // 8. Agendamento em horário avulso (fora da grade habitual, ex: 18:30, mas não pode sobrepor outra consulta)
    const customValid = await call('POST', '/v1/appointments', {
      patientId: 'pat-p1',
      professionalId: 'pro-lunch',
      serviceId: srvId,
      startTime: `${testDate}T18:30:00`,
      endTime: `${testDate}T19:20:00`,
      appointmentPrice: 150,
      modality: 'presential',
      isCustomTime: true,
      _mockNow: mockNow09h.toISOString()
    });
    assert.equal(customValid.status, 201, 'Horário avulso futuro sem conflito deve ser permitido');

    const customConflict = await call('POST', '/v1/appointments', {
      patientId: 'pat-p1',
      professionalId: 'pro-lunch',
      serviceId: srvId,
      startTime: `${testDate}T09:50:00`,
      endTime: `${testDate}T10:40:00`,
      appointmentPrice: 150,
      modality: 'presential',
      isCustomTime: true,
      _mockNow: mockNow09h.toISOString()
    });
    assert.equal(customConflict.status, 409, 'Horário avulso NÃO pode agendar sobre outra consulta existente (09:40-10:30)');
    console.log('✓ [7] Horário avulso permite exceção à grade, mas bloqueia conflitos');

    // 9. Tentativa de agendar no passado sem fluxo retroativo deve ser bloqueada
    const pastCustomAttempt = await call('POST', '/v1/appointments', {
      patientId: 'pat-p1',
      professionalId: 'pro-lunch',
      serviceId: srvId,
      startTime: `${testDate}T08:00:00`,
      endTime: `${testDate}T08:50:00`,
      appointmentPrice: 150,
      modality: 'presential',
      isCustomTime: true,
      _mockNow: mockNow09h.toISOString()
    });
    assert.equal(pastCustomAttempt.status, 400, 'Não deve permitir agendar horário avulso no passado (08:00 quando são 09:00)');
    assert.equal(pastCustomAttempt.body.code, 'PAST_BOOKING_NOT_ALLOWED');
    console.log('✓ [8] Tentativa de agendar no passado bloqueada com segurança');

    // 10. Explicação adequada quando não há horários disponíveis (sem vazar dados sigilosos)
    const emptyCheck = explainEmptySlots('clinic-p1', 'pro-lunch', srvId, '2026-11-10', undefined, mockNow09h);
    assert.equal(emptyCheck.reasonCode, 'PAST_DATE');
    assert.ok(emptyCheck.message.length > 10);
    console.log('✓ [9] Explicação clara para ausência de horários');

    console.log('\n✅ TODOS OS TESTES OBRIGATÓRIOS DA FASE 1 PASSARAM COM SUCESSO!');
  } catch (err) {
    console.error('❌ Falha nos testes da Fase 1:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
