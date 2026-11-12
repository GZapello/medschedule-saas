// Teste de Validação da Fase 3 (Seção 2): Check-In de Pacientes, Avisos Flutuantes, Isolamento e Sincronização Clínica
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-phase3-'));
process.env.DATABASE_PATH = path.join(tempDir, 'test.db');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'phase3-test-secret-2026';

const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();
const { generateToken } = require('./dist/utils/jwt');

const express = require('express');
const app = express();
app.use(express.json());
app.use('/api', require('./dist/routes').default);

// Setup fixture: 2 clínicas para testar isolamento multi-tenant e 2 profissionais na mesma clínica
db.prepare(`
  INSERT INTO tenants (id, slug, name, email, status)
  VALUES
    ('clinic-p3', 'clinica-p3', 'Clínica Fase 3', 'p3@zemda.test', 'active'),
    ('clinic-other', 'clinica-other', 'Outra Clínica', 'other@zemda.test', 'active')
`).run();

db.prepare(`
  INSERT INTO users (id, tenant_id, name, email, password_hash, role, status)
  VALUES
    ('usr-pro-a', 'clinic-p3', 'Dr. Carlos (Prof A)', 'carlos@p3.test', 'hash', 'professional', 'active'),
    ('usr-pro-b', 'clinic-p3', 'Dra. Sofia (Prof B)', 'sofia@p3.test', 'hash', 'professional', 'active'),
    ('usr-other', 'clinic-other', 'Dr. Outro', 'outro@other.test', 'hash', 'professional', 'active')
`).run();

db.prepare(`
  INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, active)
  VALUES
    ('pro-a', 'clinic-p3', 'usr-pro-a', 'Dr. Carlos', 'prof-medicina', 1),
    ('pro-b', 'clinic-p3', 'usr-pro-b', 'Dra. Sofia', 'prof-medicina', 1),
    ('pro-other', 'clinic-other', 'usr-other', 'Dr. Outro', 'prof-medicina', 1)
`).run();

db.prepare(`
  INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, price, active)
  VALUES ('srv-p3', 'clinic-p3', 'pro-a', 'Consulta Médica', 50, 200, 1)
`).run();

db.prepare(`
  INSERT INTO patients (id, tenant_id, full_name, phone, active)
  VALUES
    ('pat-bruna', 'clinic-p3', 'Bruna Oliveira', '11988887777', 1),
    ('pat-lucas', 'clinic-p3', 'Lucas Mendes', '11977776666', 1)
`).run();

const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

db.prepare(`
  INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, start_time, end_time, status, modality)
  VALUES
    ('apt-bruna', 'clinic-p3', 'AG-B1', 'pat-bruna', 'pro-a', 'srv-p3', ?, ?, 'scheduled', 'presential'),
    ('apt-lucas', 'clinic-p3', 'AG-L2', 'pat-lucas', 'pro-a', 'srv-p3', ?, ?, 'scheduled', 'presential')
`).run(
  `${todayStr}T13:50:00`,
  `${todayStr}T14:40:00`,
  `${todayStr}T15:00:00`,
  `${todayStr}T15:50:00`
);

const server = app.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const callAs = async (user, method, url, body) => {
    const token = generateToken({
      userId: user.userId,
      tenantId: user.tenantId,
      role: user.role,
      email: `${user.userId}@test.com`,
      name: user.name || user.userId
    });
    const res = await fetch(base + url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Tenant-Id': user.tenantId
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let json = text;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, body: json };
  };

  const profA = { userId: 'usr-pro-a', tenantId: 'clinic-p3', role: 'professional', name: 'Dr. Carlos' };
  const profB = { userId: 'usr-pro-b', tenantId: 'clinic-p3', role: 'professional', name: 'Dra. Sofia' };
  const profOther = { userId: 'usr-other', tenantId: 'clinic-other', role: 'professional', name: 'Dr. Outro' };
  const recep = { userId: 'usr-recep-p3', tenantId: 'clinic-p3', role: 'receptionist', name: 'Recepção P3' };

  try {
    // 1. Sem recepção cadastrada, explica apropriadamente e não ativa comportamento inexistente
    const initialSettings = await callAs(profA, 'GET', '/v1/checkin/settings');
    assert.equal(initialSettings.status, 200);
    assert.equal(initialSettings.body.hasReceptionTeam, false);
    assert.ok(initialSettings.body.explanation.includes('não possui recepcionista'));

    const tryEnableNoRecep = await callAs(profA, 'PUT', '/v1/checkin/settings', { alertsEnabled: true });
    assert.equal(tryEnableNoRecep.status, 400);
    assert.equal(tryEnableNoRecep.body.code, 'NO_RECEPTION_TEAM');
    console.log('✓ [1] Clínica sem recepção apresenta explicação e impede ativação inexistente');

    // 2. Cadastra recepcionista na clínica e ativa preferência persistente por profissional
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status)
      VALUES ('usr-recep-p3', 'clinic-p3', 'Recepção P3', 'recep@p3.test', 'hash', 'receptionist', 'active')
    `).run();

    const enableRes = await callAs(profA, 'PUT', '/v1/checkin/settings', { alertsEnabled: true });
    assert.equal(enableRes.status, 200);
    assert.equal(enableRes.body.alertsEnabled, true);
    assert.equal(enableRes.body.soundEnabled, false, 'Não deve emitir som por padrão');
    console.log('✓ [2] Preferência de Check-In ativada por profissional (sem som por padrão)');

    // 3. Recepção registra chegada de Bruna (waiting_attendance) -> gera aviso flutuante sem duplicar
    const checkin1 = await callAs(recep, 'PATCH', '/v1/appointments/apt-bruna/reception-status', {
      receptionStatus: 'waiting_attendance'
    });
    assert.equal(checkin1.status, 200);
    assert.equal(checkin1.body.receptionStatus, 'waiting_attendance');
    assert.equal(checkin1.body.clinicalStatus, 'scheduled');
    assert.ok(checkin1.body.arrivedAt);
    assert.equal(checkin1.body.alert.message, 'Paciente chegou — Bruna, atendimento às 13h50. Aguardando na recepção.');

    // Repete o check-in no mesmo agendamento para garantir que NÃO duplica o aviso
    await callAs(recep, 'PATCH', '/v1/appointments/apt-bruna/reception-status', {
      receptionStatus: 'waiting_attendance'
    });

    const queueProfA = await callAs(profA, 'GET', '/v1/checkin/queue');
    assert.equal(queueProfA.status, 200);
    assert.equal(queueProfA.body.waitingCount, 1);
    assert.equal(queueProfA.body.activeAlerts.length, 1, 'Não deve duplicar avisos para o mesmo agendamento');
    assert.equal(queueProfA.body.activeAlerts[0].message, 'Paciente chegou — Bruna, atendimento às 13h50. Aguardando na recepção.');

    // 4. Isolamento estrito: Profissional B (mesma clínica) e Profissional de outra clínica NÃO recebem o aviso de Bruna
    await callAs(profB, 'PUT', '/v1/checkin/settings', { alertsEnabled: true });
    const queueProfB = await callAs(profB, 'GET', '/v1/checkin/queue');
    assert.equal(queueProfB.body.waitingCount, 0);
    assert.equal(queueProfB.body.activeAlerts.length, 0, 'Não deve enviar aviso ao profissional errado');

    const queueOtherClinic = await callAs(profOther, 'GET', '/v1/checkin/queue');
    assert.equal(queueOtherClinic.body.waitingCount, 0);
    assert.equal(queueOtherClinic.body.activeAlerts.length, 0, 'Não deve exibir notificações de outras clínicas');
    console.log('✓ [3] Aviso flutuante exato, sem duplicação e isolado por profissional e clínica');

    // 5. Fechar aviso imediatamente acessível + histórico de avisos anteriores preservado
    const alertId = queueProfA.body.activeAlerts[0].id;
    const dismissRes = await callAs(profA, 'POST', `/v1/checkin/alerts/${alertId}/dismiss`);
    assert.equal(dismissRes.status, 200);

    const queueAfterDismiss = await callAs(profA, 'GET', '/v1/checkin/queue');
    assert.equal(queueAfterDismiss.body.activeAlerts.length, 0, 'Aviso fechado não deve reaparecer como ativo');
    assert.equal(queueAfterDismiss.body.previousAlerts.length, 1, 'Deve permitir consultar avisos anteriores');
    console.log('✓ [4] Fechamento imediato de aviso e consulta a avisos anteriores validados');

    // 6. Regra 2.2: Registrar saída na recepção (checked_out) NÃO conclui clinicamente o agendamento!
    const checkoutLucas = await callAs(recep, 'PATCH', '/v1/appointments/apt-lucas/reception-status', {
      receptionStatus: 'checked_out'
    });
    assert.equal(checkoutLucas.status, 200);
    const lucasRow = db.prepare('SELECT status, reception_status FROM appointments WHERE id = ?').get('apt-lucas');
    assert.equal(lucasRow.reception_status, 'checked_out');
    assert.equal(lucasRow.status, 'scheduled', 'Saída na recepção NUNCA deve marcar o agendamento como clinicamente concluído');

    // 7. Quando o profissional inicia clinicamente o atendimento de Bruna, a situação da recepção muda automaticamente para in_attendance
    const startBruna = await callAs(profA, 'PUT', '/v1/appointments/apt-bruna/status', {
      status: 'in_progress'
    });
    assert.equal(startBruna.status, 200);
    const brunaInProg = db.prepare('SELECT status, reception_status, called_at FROM appointments WHERE id = ?').get('apt-bruna');
    assert.equal(brunaInProg.status, 'in_progress');
    assert.equal(brunaInProg.reception_status, 'in_attendance');
    assert.ok(brunaInProg.called_at);

    // E quando finaliza clinicamente o atendimento, atualiza automaticamente a recepção para checked_out
    const finishBruna = await callAs(profA, 'POST', '/v1/appointments/apt-bruna/finish', {
      evolution: {
        title: 'Consulta médica realizada',
        clinicalEvolution: 'Paciente avaliada sem intercorrências.',
        conducts: 'Retorno em 30 dias.'
      },
      payment: {
        amount: 200,
        paymentMethod: 'pix',
        status: 'paid'
      }
    });
    assert.equal(finishBruna.status, 200);
    const brunaDone = db.prepare('SELECT status, reception_status, checked_out_at FROM appointments WHERE id = ?').get('apt-bruna');
    assert.equal(brunaDone.status, 'completed');
    assert.equal(brunaDone.reception_status, 'checked_out');
    assert.ok(brunaDone.checked_out_at);
    console.log('✓ [5] Separação entre status clínico e administrativo + sincronização automática ao iniciar/finalizar validada');

    console.log('\n✅ TODOS OS TESTES DA FASE 3 PASSARAM COM SUCESSO!');
  } catch (err) {
    console.error('❌ Falha nos testes da Fase 3:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
