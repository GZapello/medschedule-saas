// Teste de Validação da Fase 2 (Seção 1): Relatórios, Ocupação Real, Continuidade do Cuidado e Acesso Seguro da Recepção
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-phase2-'));
process.env.DATABASE_PATH = path.join(tempDir, 'test.db');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'phase2-test-secret-2026';

const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();
const { generateToken } = require('./dist/utils/jwt');

const express = require('express');
const app = express();
app.use(express.json());

let currentRole = 'clinic_admin';
let currentUserId = 'usr-admin';

app.use('/api', require('./dist/routes').default);

// Setup fixture
db.prepare(`
  INSERT INTO tenants (id, slug, name, email, status)
  VALUES ('clinic-p2', 'clinica-p2', 'Clínica Fase 2', 'p2@zemda.test', 'active')
`).run();

db.prepare(`
  INSERT INTO users (id, tenant_id, name, email, password_hash, role, status)
  VALUES
    ('usr-admin', 'clinic-p2', 'Admin P2', 'admin@p2.test', 'hash', 'clinic_admin', 'active'),
    ('usr-recep', 'clinic-p2', 'Recepcionista P2', 'recep@p2.test', 'hash', 'receptionist', 'active')
`).run();

db.prepare(`
  INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, active)
  VALUES ('pro-p2', 'clinic-p2', 'usr-admin', 'Dra. Helena', 'prof-medicina', 1)
`).run();

// Escala na segunda-feira (day 1): 08:00 às 18:00 com intervalo 12:00 às 14:00 = 8h líquidas (480 min)
db.prepare(`
  INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, break_start, break_end, is_active)
  VALUES ('sch-p2-mon', 'clinic-p2', 'pro-p2', 1, '08:00', '18:00', '12:00', '14:00', 1)
`).run();

// Bloqueio de 1h na segunda-feira 2026-11-09 das 16:00 às 17:00 -> capacidade líquida no dia = 480 - 60 = 420 min (7h)
db.prepare(`
  INSERT INTO blocked_times (id, tenant_id, professional_id, title, start_datetime, end_datetime)
  VALUES ('blk-p2', 'clinic-p2', 'pro-p2', 'Reunião', '2026-11-09T16:00:00', '2026-11-09T17:00:00')
`).run();

db.prepare(`
  INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, price, active, return_periodicity_days)
  VALUES ('srv-p2', 'clinic-p2', 'pro-p2', 'Consulta Clínica', 60, 300, 1, 30)
`).run();

// Pacientes para teste de desempenho e faixas de Continuidade do Cuidado
db.prepare(`
  INSERT INTO patients (id, tenant_id, full_name, phone, active, follow_up_status)
  VALUES
    ('pat-15d', 'clinic-p2', 'Ana (15 dias)', '11911111111', 1, 'active'),
    ('pat-45d', 'clinic-p2', 'Bruno (45 dias - pendente)', '11922222222', 1, 'active'),
    ('pat-75d-alta', 'clinic-p2', 'Carla (75 dias - Com Alta)', '11933333333', 1, 'discharged'),
    ('pat-100d', 'clinic-p2', 'Diego (100 dias)', '11944444444', 1, 'active')
`).run();

// No dia 2026-11-09 (segunda-feira):
// - 1 concluído (60 min)
// - 1 falta no_show (60 min)
// - 1 cancelado (60 min)
// Total agendado não-cancelado = 120 min; Total realizado = 60 min; Capacidade líquida = 420 min.
db.prepare(`
  INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, start_time, end_time, status, modality)
  VALUES
    ('apt-comp', 'clinic-p2', 'AG-1', 'pat-15d', 'pro-p2', 'srv-p2', '2026-11-09T08:00:00', '2026-11-09T09:00:00', 'completed', 'presential'),
    ('apt-noshow', 'clinic-p2', 'AG-2', 'pat-45d', 'pro-p2', 'srv-p2', '2026-11-09T09:00:00', '2026-11-09T10:00:00', 'no_show', 'presential'),
    ('apt-canc', 'clinic-p2', 'AG-3', 'pat-100d', 'pro-p2', 'srv-p2', '2026-11-09T10:00:00', '2026-11-09T11:00:00', 'cancelled', 'presential')
`).run();

// Pagamento real quitado (R$ 250,00 — diferente do preço teórico de R$ 300,00 para provar uso do registro financeiro real)
db.prepare(`
  INSERT INTO payments (id, tenant_id, appointment_id, patient_id, amount, payment_method, status, created_at)
  VALUES
    ('pay-real-1', 'clinic-p2', 'apt-comp', 'pat-15d', 250.00, 'pix', 'paid', '2026-11-09 09:00:00'),
    ('pay-pend-2', 'clinic-p2', 'apt-noshow', 'pat-45d', 300.00, 'credit_card', 'pending', '2026-11-09 09:00:00')
`).run();

// Atendimentos históricos concluídos para Continuidade do Cuidado (45d, 75d, 100d atrás)
const daysAgoIso = (days) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return `${d.toISOString().slice(0, 10)}T10:00:00`;
};
db.prepare(`
  INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, start_time, end_time, status, modality)
  VALUES
    ('apt-h45', 'clinic-p2', 'AG-H45', 'pat-45d', 'pro-p2', 'srv-p2', ?, ?, 'completed', 'presential'),
    ('apt-h75', 'clinic-p2', 'AG-H75', 'pat-75d-alta', 'pro-p2', 'srv-p2', ?, ?, 'completed', 'presential'),
    ('apt-h100', 'clinic-p2', 'AG-H100', 'pat-100d', 'pro-p2', 'srv-p2', ?, ?, 'completed', 'presential')
`).run(daysAgoIso(45), daysAgoIso(45), daysAgoIso(75), daysAgoIso(75), daysAgoIso(100), daysAgoIso(100));

const server = app.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, url, body) => {
    const token = generateToken({
      userId: currentUserId,
      tenantId: 'clinic-p2',
      role: currentRole,
      email: `${currentUserId}@p2.test`,
      name: currentUserId
    });
    const res = await fetch(base + url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Tenant-Id': 'clinic-p2'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let json = text;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, body: json };
  };

  try {
    // 1. Indicadores de Desempenho como Admin (incluindo receita real e ocupação descontando intervalo e bloqueio)
    currentRole = 'clinic_admin';
    currentUserId = 'usr-admin';
    const perfRes = await call('GET', '/v1/reports/attendance?startDate=2026-11-09&endDate=2026-11-09');
    assert.equal(perfRes.status, 200);
    const s = perfRes.body.summary;
    assert.equal(s.totalScheduled, 3);
    assert.equal(s.totalCompleted, 1);
    assert.equal(s.noShowCount, 1);
    assert.equal(s.cancelledCount, 1);
    assert.equal(s.attendanceRatePercent, 50); // 1 comparecimento em 2 agendamentos válidos (1 completed + 1 no_show)
    assert.equal(s.totalAvailableMinutes, 420); // 10h bruta - 2h intervalo - 1h bloqueio = 7h (420 min)
    assert.equal(s.totalScheduledMinutes, 120); // 2h agendadas ativas
    assert.equal(s.totalRealizedMinutes, 60);   // 1h efetivamente realizada
    assert.equal(s.unusedAvailableMinutes, 300); // 5h livres não utilizadas
    assert.equal(s.receivedRevenue, 250);       // Somente o pagamento 'paid' real de R$ 250,00
    console.log('✓ [1] Indicadores de desempenho, ocupação real (descontando pausa e bloqueio) e receita real validados');

    // 2. Continuidade do Cuidado: faixas informativas e respeito à alta/tratamento concluído
    const contRes = await call('GET', '/v1/reports/care-continuity');
    assert.equal(contRes.status, 200);
    assert.equal(contRes.body.bandCounts.all, 4);
    assert.equal(contRes.body.bandCounts['31_to_60'], 1);
    assert.equal(contRes.body.bandCounts['61_to_90'], 1);
    assert.equal(contRes.body.bandCounts.over_90, 1);

    const dischargedPatient = contRes.body.items.find(i => i.patientId === 'pat-75d-alta');
    assert.ok(dischargedPatient);
    assert.equal(dischargedPatient.nextAppointmentSituation, 'treatment_completed');
    assert.equal(dischargedPatient.needsFollowUpContact, false, 'Paciente com alta NUNCA deve ser sinalizado como atrasado');

    const pending45 = contRes.body.items.find(i => i.patientId === 'pat-45d');
    assert.equal(pending45.nextAppointmentSituation, 'return_pending');
    assert.equal(pending45.needsFollowUpContact, true);
    console.log('✓ [2] Continuidade do Cuidado, faixas de 30/60/90+ dias e proteção de pacientes com alta validados');

    // 3. Acesso da Recepção: acessa relatórios operacionais e continuidade, mas NÃO recebe dados financeiros
    currentRole = 'receptionist';
    currentUserId = 'usr-recep';
    const recepPerf = await call('GET', '/v1/reports/attendance?startDate=2026-11-09&endDate=2026-11-09');
    assert.equal(recepPerf.status, 200, 'Recepção deve acessar indicadores operacionais');
    assert.equal(recepPerf.body.permissions.canViewFinancial, false);
    assert.equal(recepPerf.body.summary.receivedRevenue, null, 'Recepção não deve receber receita financeira nos relatórios');
    assert.equal(recepPerf.body.byService[0].received_revenue, null);

    const recepCont = await call('GET', '/v1/reports/care-continuity');
    assert.equal(recepCont.status, 200, 'Recepção deve acessar Continuidade do Cuidado');

    const recepFin = await call('GET', '/v1/reports/financial');
    assert.equal(recepFin.status, 403, 'Recepção deve ser bloqueada no relatório financeiro');

    const recepFinCsv = await call('GET', '/v1/reports/export-csv?type=payments');
    assert.equal(recepFinCsv.status, 403, 'Recepção deve ser bloqueada na exportação CSV financeira');

    const recepApptCsv = await call('GET', '/v1/reports/export-csv?type=appointments');
    assert.equal(recepApptCsv.status, 200, 'Recepção pode exportar CSV operacional de agendamentos');
    console.log('✓ [3] Acesso operacional da recepção permitido com bloqueio estrito de dados financeiros');

    console.log('\n✅ TODOS OS TESTES DA FASE 2 PASSARAM COM SUCESSO!');
  } catch (err) {
    console.error('❌ Falha nos testes da Fase 2:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
