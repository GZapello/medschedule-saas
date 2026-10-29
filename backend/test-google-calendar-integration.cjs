process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY = 'test-only-google-key-32-bytes-minimum';
const assert = require('node:assert');
const crypto = require('node:crypto');
const path = require('node:path');

// Carrega backend compilado
const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();
const { encryptRefreshToken, decryptRefreshToken } = require('./dist/utils/google-calendar-crypto');
const { GoogleCalendarService } = require('./dist/services/google-calendar.service');
const { calculateAvailableSlots } = require('./dist/utils/slot-calculator');

console.log('\n======================================================');
console.log('🧪 TESTES DA INTEGRAÇÃO GOOGLE CALENDAR ↔ AGENDA ZEMDA');
console.log('======================================================\n');

async function runTests() {
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`✓ [TESTE ${total}] ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ [TESTE ${total}] ${name} FALHOU:`, err);
      throw err;
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✓ [TESTE ${total}] ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ [TESTE ${total}] ${name} FALHOU:`, err);
      throw err;
    }
  }

  // ----------------------------------------------------
  // TESTE 1: Criptografia AES-256-GCM do Refresh Token
  // ----------------------------------------------------
  test('Criptografia AES-256-GCM do Refresh Token em repouso', () => {
    const rawToken = '1//0gX_secret_google_refresh_token_xyz987654321';
    const encrypted = encryptRefreshToken(rawToken);

    assert.ok(encrypted, 'Token criptografado não pode ser vazio');
    assert.notStrictEqual(encrypted, rawToken, 'Token criptografado não pode ser igual ao puro');

    const parts = encrypted.split(':');
    assert.strictEqual(parts.length, 3, 'Formato deve ser iv:authTag:ciphertext');
    assert.strictEqual(parts[0].length, 24, 'IV deve ter 12 bytes (24 hex chars)');
    assert.strictEqual(parts[1].length, 32, 'AuthTag deve ter 16 bytes (32 hex chars)');

    const decrypted = decryptRefreshToken(encrypted);
    assert.strictEqual(decrypted, rawToken, 'Token decifrado deve ser exatamente o original');

    // Integridade: se o ciphertext for adulterado, a decifragem falha e retorna null
    const tampered = `${parts[0]}:${parts[1]}:badbeef${parts[2].slice(7)}`;
    const tamperedResult = decryptRefreshToken(tampered);
    assert.strictEqual(tamperedResult, null, 'Ciphertext adulterado deve falhar na autenticação GCM');
  });

  // ----------------------------------------------------
  // TESTE 2: Migração das Tabelas do Google Calendar
  // ----------------------------------------------------
  test('Tabelas e índices do Google Calendar existem no banco SQLite', () => {
    const tables = ['google_calendar_connections', 'google_calendar_event_links', 'google_calendar_oauth_states'];
    for (const t of tables) {
      const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
      assert.ok(row, `Tabela ${t} deve existir`);
    }

    const indexes = ['idx_gcal_conn_tenant_prof', 'idx_gcal_links_appt', 'idx_gcal_links_gevent', 'idx_gcal_oauth_state'];
    for (const idx of indexes) {
      const row = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?").get(idx);
      assert.ok(row, `Índice ${idx} deve existir`);
    }
  });

  // ----------------------------------------------------
  // TESTE 3: Estado Não Configurado (isConfigured = false)
  // ----------------------------------------------------
  test('Status quando credenciais não estão configuradas pelo administrador', () => {
    delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
    delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;

    assert.strictEqual(GoogleCalendarService.isConfigured(), false);
    const status = GoogleCalendarService.getStatus('tenant-test', 'user-test');
    assert.strictEqual(status.configured, false);
    assert.strictEqual(status.connected, false);
    assert.ok(status.message.includes('ainda não configurado pelo administrador'));
  });

  // ----------------------------------------------------
  // TESTE 4: Geração de State OAuth e Redirecionamento
  // ----------------------------------------------------
  test('Geração segura de state OAuth vinculado ao usuário e tenant', () => {
    process.env.GOOGLE_CALENDAR_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'test-client-secret';

    const { url, state } = GoogleCalendarService.generateAuthUrl('tenant-alpha', 'user-100', 'prof-100');

    assert.ok(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth'));
    assert.ok(url.includes('access_type=offline'), 'Deve solicitar access_type=offline');
    assert.ok(url.includes('prompt=consent'), 'Deve solicitar prompt=consent');
    assert.ok(url.includes(encodeURIComponent('https://www.googleapis.com/auth/calendar.events')), 'Escopo de eventos requerido');
    assert.ok(url.includes(encodeURIComponent('https://www.googleapis.com/auth/calendar.freebusy')), 'Escopo de freebusy requerido');
    assert.ok(!url.includes('calendar%20'), 'NÃO deve solicitar escopo com acesso total');

    // Valida persistência do state no banco
    const stateRow = db.prepare('SELECT * FROM google_calendar_oauth_states WHERE state = ?').get(state);
    assert.ok(stateRow, 'State deve estar persistido no banco');
    assert.strictEqual(stateRow.tenant_id, 'tenant-alpha');
    assert.strictEqual(stateRow.user_id, 'user-100');
    assert.strictEqual(stateRow.professional_id, 'prof-100');
  });

  // ----------------------------------------------------
  // TESTE 5: Callback com State Inválido/Expirado é Rejeitado
  // ----------------------------------------------------
  await testAsync('Callback com state inválido é rejeitado de forma segura', async () => {
    const result = await GoogleCalendarService.handleCallback('code-fake', 'state-inexistente-123');
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('inválida ou expirada'));
  });

  // ----------------------------------------------------
  // Fixtures globais para os testes multi-tenant
  // ----------------------------------------------------
  const runId = Date.now();
  const tenantA = `t-a-${runId}`;
  const tenantB = `t-b-${runId}`;
  const userId = `u-gab-${runId}`;
  const profA = `p-a-${runId}`;
  const profB = `p-b-${runId}`;

  // Cria tenants e users de teste com chaves válidas
  db.prepare(`INSERT INTO tenants (id, name, slug, email) VALUES (?, 'Clínica A', ?, ?)`).run(tenantA, `slug-a-${runId}`, `clinica-a-${runId}@zemda.test`);
  db.prepare(`INSERT INTO tenants (id, name, slug, email) VALUES (?, 'Clínica B', ?, ?)`).run(tenantB, `slug-b-${runId}`, `clinica-b-${runId}@zemda.test`);
  db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role) VALUES (?, ?, 'Gabriel', ?, 'hash', 'professional')`).run(userId, tenantA, `gab-${runId}@zemda.test`);
  db.prepare(`INSERT INTO professionals (id, tenant_id, user_id, name) VALUES (?, ?, ?, 'Gabriel Prof A')`).run(profA, tenantA, userId);
  db.prepare(`INSERT INTO professionals (id, tenant_id, user_id, name) VALUES (?, ?, ?, 'Gabriel Prof B')`).run(profB, tenantB, userId);

  // ----------------------------------------------------
  // TESTE 6: Isolamento Multi-Clínica e Multi-Profissional
  // ----------------------------------------------------
  test('Isolamento Multi-Clínica: Conexões individuais por usuário e clínica', () => {
    const tokenA = encryptRefreshToken('refresh-token-clinica-a');
    const tokenB = encryptRefreshToken('refresh-token-clinica-b');

    // Conexão do profissional na Clínica A
    db.prepare(`
      INSERT OR REPLACE INTO google_calendar_connections (
        id, tenant_id, user_id, professional_id, google_account_email,
        calendar_id, calendar_name, encrypted_refresh_token, sync_enabled,
        block_external_events, create_google_meet, privacy_mode
      ) VALUES ('conn-a', ?, ?, ?, 'gabriel.a@gmail.com', 'primary', 'Agenda A', ?, 1, 1, 1, 'private')
    `).run(tenantA, userId, profA, tokenA);

    // Conexão do profissional na Clínica B
    db.prepare(`
      INSERT OR REPLACE INTO google_calendar_connections (
        id, tenant_id, user_id, professional_id, google_account_email,
        calendar_id, calendar_name, encrypted_refresh_token, sync_enabled,
        block_external_events, create_google_meet, privacy_mode
      ) VALUES ('conn-b', ?, ?, ?, 'gabriel.b@gmail.com', 'primary', 'Agenda B', ?, 1, 1, 1, 'private')
    `).run(tenantB, userId, profB, tokenB);

    const connA = GoogleCalendarService.getConnection(tenantA, userId);
    const connB = GoogleCalendarService.getConnection(tenantB, userId);

    assert.ok(connA && connB, 'Ambas conexões devem existir isoladas');
    assert.strictEqual(connA.tenant_id, tenantA);
    assert.strictEqual(connB.tenant_id, tenantB);
    assert.strictEqual(connA.google_account_email, 'gabriel.a@gmail.com');
    assert.strictEqual(connB.google_account_email, 'gabriel.b@gmail.com');
    assert.notStrictEqual(connA.encrypted_refresh_token, connB.encrypted_refresh_token);
  });

  // ----------------------------------------------------
  // TESTE 7: Atualização de Configurações
  // ----------------------------------------------------
  await testAsync('Atualização de preferências da Google Agenda (Privacidade, Meet, FreeBusy)', async () => {
    GoogleCalendarService.listCalendars = async () => [{id:'cal-secundaria-99', summary:'Consultório Principal'}];
    GoogleCalendarService.ensureWatch = async () => {};
    await GoogleCalendarService.updateSettings(tenantA, userId, {
      calendar_id: 'cal-secundaria-99',
      calendar_name: 'Consultório Principal',
      privacy_mode: 'show_patient_name',
      create_google_meet: false,
      block_external_events: true,
      sync_interval_option: 'next_30_days'
    });

    const conn = GoogleCalendarService.getConnection(tenantA, userId);
    assert.strictEqual(conn.calendar_id, 'cal-secundaria-99');
    assert.strictEqual(conn.calendar_name, 'Consultório Principal');
    assert.strictEqual(conn.privacy_mode, 'show_patient_name');
    assert.strictEqual(conn.create_google_meet, 0);
    assert.strictEqual(conn.block_external_events, 1);
    assert.strictEqual(conn.sync_interval_option, 'next_30_days');
  });

  // ----------------------------------------------------
  // TESTE 8: Formatação de Timezone RFC3339 sem distorção
  // ----------------------------------------------------
  test('Formatação correta para RFC3339 com fuso America/Sao_Paulo (-03:00)', () => {
    const formatted = GoogleCalendarService.formatRFC3339('2026-10-26 14:30:00');
    assert.strictEqual(formatted, '2026-10-26T14:30:00-03:00');

    const formattedIso = GoogleCalendarService.formatRFC3339('2026-10-26T09:00:00');
    assert.strictEqual(formattedIso, '2026-10-26T09:00:00-03:00');
  });

  // ----------------------------------------------------
  // TESTE 9: Cálculo de Slots com FreeBusy Google
  // ----------------------------------------------------
  test('Compromissos externos do Google bloqueiam horários no cálculo de slots Zemda', () => {
    // Configura serviço e grade no banco para profA
    const servId = `serv-${runId}`;

    db.prepare(`INSERT OR IGNORE INTO services (id, tenant_id, name, duration_minutes, buffer_minutes, active) VALUES (?, ?, 'Consulta Geral', 60, 0, 1)`).run(servId, tenantA);
    
    // Segunda-feira (day_of_week = 1) das 14:00 às 18:00
    db.prepare(`DELETE FROM schedules WHERE tenant_id = ? AND professional_id = ?`).run(tenantA, profA);
    db.prepare(`
      INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active)
      VALUES (?, ?, ?, 1, '14:00', '18:00', 1)
    `).run(`sched-${runId}`, tenantA, profA);

    // Data de teste: 2026-11-02 é uma segunda-feira
    const testDate = '2026-11-02';

    // 1. Sem bloqueios externos: slots 14:00, 15:00, 16:00, 17:00 (total 4)
    const normalSlots = calculateAvailableSlots(tenantA, profA, servId, testDate);
    assert.strictEqual(normalSlots.length, 4);

    // 2. Com compromisso externo na Google Agenda: 15:00 às 16:00 (startMin = 900, endMin = 960)
    const externalBusy = [{ startMin: 15 * 60, endMin: 16 * 60 }];
    const slotsWithExternalBusy = calculateAvailableSlots(tenantA, profA, servId, testDate, undefined, undefined, externalBusy);

    assert.strictEqual(slotsWithExternalBusy.length, 3, 'Deve bloquear o slot das 15:00');
    assert.ok(!slotsWithExternalBusy.some(s => s.time === '15:00'), 'Slot 15:00 não pode estar disponível');
    assert.ok(slotsWithExternalBusy.some(s => s.time === '14:00'), 'Slot 14:00 deve permanecer disponível');
    assert.ok(slotsWithExternalBusy.some(s => s.time === '16:00'), 'Slot 16:00 deve permanecer disponível');
    assert.ok(slotsWithExternalBusy.some(s => s.time === '17:00'), 'Slot 17:00 deve permanecer disponível');
  });

  // ----------------------------------------------------
  // TESTE 10: Desconexão Preserva Atendimentos do Zemda
  // ----------------------------------------------------
  await testAsync('Desconexão remove apenas conexão e tokens, preservando atendimentos intactos', async () => {
    // Insere agendamento de teste
    const apptId = `appt-${runId}`;
    const patId = `pat-${runId}`;
    const servId = `serv-${runId}`;
    db.prepare(`INSERT OR IGNORE INTO patients (id, tenant_id, full_name, phone) VALUES (?, ?, 'Paciente Teste', '11999998888')`).run(patId, tenantA);
    db.prepare(`
      INSERT OR REPLACE INTO appointments (
        id, tenant_id, appointment_number, patient_id, professional_id, service_id,
        start_time, end_time, status, modality
      ) VALUES (?, ?, 'AG-2026-999', ?, ?, ?, '2026-11-05 10:00:00', '2026-11-05 11:00:00', 'scheduled', 'presential')
    `).run(apptId, tenantA, patId, profA, servId);

    // Desconecta a Google Agenda
    GoogleCalendarService.createOAuth2Client = () => ({ revokeToken: async () => {} });
    await GoogleCalendarService.disconnect(tenantA, userId);

    // Conexão Google foi apagada
    const conn = GoogleCalendarService.getConnection(tenantA, userId);
    assert.strictEqual(conn, null, 'Conexão deve ser removida');

    // Agendamento no Zemda continua intacto!
    const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(apptId);
    assert.ok(appt, 'Agendamento Zemda DEVE continuar intacto');
    assert.strictEqual(appt.status, 'scheduled');
  });

  // ----------------------------------------------------
  // TESTE 11: Auditoria sem Vazamento de Tokens
  // ----------------------------------------------------
  test('Logs de auditoria registram ações do Google Calendar sem expor tokens', () => {
    const logs = db.prepare(`
      SELECT action, details_json FROM audit_logs
      WHERE tenant_id = ? AND action LIKE 'GOOGLE_CALENDAR_%'
    `).all(tenantA);

    assert.ok(logs.length > 0, 'Deve ter registrado logs de auditoria');
    for (const log of logs) {
      const details = log.details_json || '';
      assert.ok(!details.includes('refresh_token'), 'Log de auditoria NÃO pode conter refresh_token');
      assert.ok(!details.includes('access_token'), 'Log de auditoria NÃO pode conter access_token');
      assert.ok(!details.includes('client_secret'), 'Log de auditoria NÃO pode conter client_secret');
    }
  });

  console.log(`\n🎉 TODOS OS ${passed}/${total} TESTES DA INTEGRAÇÃO GOOGLE CALENDAR PASSARAM COM SUCESSO!\n`);
}

runTests().catch(err => {
  console.error('\n❌ ERRO NA EXECUÇÃO DOS TESTES:', err);
  process.exit(1);
});
