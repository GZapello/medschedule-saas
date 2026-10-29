// Teste dos 10 fluxos obrigatórios da integração Google Calendar no Zemda
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.NODE_ENV = 'test';
process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY = 'test-dedicated-encryption-key-32-bytes-min';
process.env.GOOGLE_CALENDAR_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'test-client-secret-123';
process.env.GOOGLE_CALENDAR_REDIRECT_URI = 'https://zemda.test/api/v1/integrations/google-calendar/callback';

const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();

const { GoogleCalendarService } = require('./dist/services/google-calendar.service');
const { encryptRefreshToken, decryptRefreshToken } = require('./dist/utils/google-calendar-crypto');
const { google } = require('googleapis');

console.log('\n======================================================');
console.log('🧪 BATERIA DOS 10 FLUXOS OBRIGATÓRIOS DO GOOGLE CALENDAR');
console.log('======================================================\n');

// Mock do transporte Google Calendar API
const mockCalls = {
  inserts: [],
  patches: [],
  deletes: [],
  gets: [],
  lists: []
};

let nextMeetPending = false;
let nextCallFails = null;

const fakeCalendar = {
  calendarList: {
    get: async ({ calendarId }) => ({ data: { id: calendarId, summary: 'Agenda Consultório' } }),
    list: async () => ({
      data: {
        items: [
          { id: 'primary', summary: 'Agenda Principal', primary: true, accessRole: 'owner' },
          { id: 'cal-consultorio', summary: 'Consultório Particular', accessRole: 'writer' }
        ]
      }
    })
  },
  channels: {
    stop: async () => ({})
  },
  freebusy: {
    query: async () => ({ data: { calendars: { primary: { busy: [] } } } })
  },
  events: {
    watch: async () => ({ data: { resourceId: 'res-watch-123', expiration: String(Date.now() + 86400000) } }),
    list: async (args) => {
      mockCalls.lists.push(args);
      return { data: { items: [] } };
    },
    get: async (args) => {
      mockCalls.gets.push(args);
      return {
        data: {
          id: args.eventId,
          status: 'confirmed',
          hangoutLink: 'https://meet.google.com/abc-defg-hij',
          conferenceData: {
            entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' }]
          }
        }
      };
    },
    insert: async (args) => {
      mockCalls.inserts.push(args);
      if (nextCallFails) {
        const err = nextCallFails;
        nextCallFails = null;
        throw err;
      }
      const eventId = args.requestBody.id || `g-evt-${Date.now()}`;
      const hasMeetRequest = Boolean(args.requestBody?.conferenceData?.createRequest);
      return {
        data: {
          id: eventId,
          status: 'confirmed',
          ...args.requestBody,
          hangoutLink: hasMeetRequest ? 'https://meet.google.com/abc-defg-hij' : undefined,
          conferenceData: hasMeetRequest
            ? { entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' }] }
            : undefined
        }
      };
    },
    patch: async (args) => {
      mockCalls.patches.push(args);
      if (nextCallFails) {
        const err = nextCallFails;
        nextCallFails = null;
        throw err;
      }
      return {
        data: {
          id: args.eventId,
          status: 'confirmed',
          ...args.requestBody,
          hangoutLink: 'https://meet.google.com/abc-defg-hij'
        }
      };
    },
    delete: async (args) => {
      mockCalls.deletes.push(args);
      if (nextCallFails) {
        const err = nextCallFails;
        nextCallFails = null;
        throw err;
      }
      return { data: {} };
    }
  }
};

google.calendar = () => fakeCalendar;

async function run() {
  const runId = Date.now();
  const tenantA = `ten-a-${runId}`;
  const tenantB = `ten-b-${runId}`;
  const userA = `usr-a-${runId}`;
  const userB = `usr-b-${runId}`;
  const profA = `pro-a-${runId}`;
  const profB = `pro-b-${runId}`;
  const patA = `pat-a-${runId}`;
  const servPres = `srv-pres-${runId}`;
  const servTele = `srv-tele-${runId}`;

  // Semeia base de teste
  db.prepare("INSERT INTO tenants(id, name, slug, email) VALUES (?, 'Clínica Vida', ?, ?)").run(tenantA, `vida-${runId}`, `vida-${runId}@zemda.test`);
  db.prepare("INSERT INTO tenants(id, name, slug, email) VALUES (?, 'Clínica Saúde', ?, ?)").run(tenantB, `saude-${runId}`, `saude-${runId}@zemda.test`);
  
  db.prepare("INSERT INTO users(id, tenant_id, name, email, password_hash, role) VALUES (?, ?, 'Dra. Ana', ?, 'hash', 'professional')").run(userA, tenantA, `ana-${runId}@zemda.test`);
  db.prepare("INSERT INTO users(id, tenant_id, name, email, password_hash, role) VALUES (?, ?, 'Dr. Bruno', ?, 'hash', 'professional')").run(userB, tenantB, `bruno-${runId}@zemda.test`);

  db.prepare("INSERT INTO professionals(id, tenant_id, user_id, name) VALUES (?, ?, ?, 'Dra. Ana')").run(profA, tenantA, userA);
  db.prepare("INSERT INTO professionals(id, tenant_id, user_id, name) VALUES (?, ?, ?, 'Dr. Bruno')").run(profB, tenantB, userB);

  db.prepare("INSERT INTO patients(id, tenant_id, full_name, phone) VALUES (?, ?, 'Carlos Silva', '11988887777')").run(patA, tenantA);
  db.prepare("INSERT INTO services(id, tenant_id, name, duration_minutes, price, active) VALUES (?, ?, 'Consulta Presencial', 50, 200, 1)").run(servPres, tenantA);
  db.prepare("INSERT INTO services(id, tenant_id, name, duration_minutes, price, active) VALUES (?, ?, 'Teleconsulta', 50, 200, 1)").run(servTele, tenantA);

  // -------------------------------------------------------------------
  // CENÁRIO 1: Conectar o Google Calendar
  // -------------------------------------------------------------------
  console.log('--- CENÁRIO 1: Conectar o Google Calendar ---');
  const authRes = GoogleCalendarService.generateAuthUrl(tenantA, userA, profA, '/configuracoes');
  assert.ok(authRes.url.includes('access_type=offline'));
  assert.ok(authRes.url.includes('prompt=consent'));

  // Mock do OAuth callback com troca de tokens
  const mockOAuthClient = {
    setCredentials: () => {},
    getToken: async () => ({
      tokens: {
        access_token: 'fake-access-token',
        refresh_token: 'fake-refresh-token-ana',
        id_token: 'fake-id-token',
        scope: 'openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.freebusy'
      }
    }),
    verifyIdToken: async () => ({
      getPayload: () => ({ sub: `sub-ana-${runId}`, email: 'ana.medica@gmail.com', email_verified: true })
    })
  };
  const originalCreateClient = GoogleCalendarService.createOAuth2Client;
  GoogleCalendarService.createOAuth2Client = () => mockOAuthClient;

  const cbResult = await GoogleCalendarService.handleCallback('valid-code', authRes.state);
  assert.strictEqual(cbResult.success, true);
  assert.strictEqual(cbResult.email, 'ana.medica@gmail.com');

  const connA = GoogleCalendarService.getConnection(tenantA, userA);
  assert.ok(connA);
  assert.strictEqual(connA.google_account_email, 'ana.medica@gmail.com');
  assert.strictEqual(connA.sync_enabled, 1, 'A sincronização deve ser ativada automaticamente no callback');
  assert.strictEqual(connA.calendar_id, 'primary', 'A agenda principal deve ser selecionada automaticamente');
  assert.strictEqual(connA.sync_direction, 'both', 'A direção padrão deve ser Zemda ↔ Google');
  console.log('  ✅ [PASS] Conexão OAuth realizada, agenda selecionada e sincronização ativada automaticamente.');

  // -------------------------------------------------------------------
  // CENÁRIO 2: Selecionar uma agenda e ativar sincronização
  // -------------------------------------------------------------------
  console.log('\n--- CENÁRIO 2: Selecionar agenda e preferências de sincronização ---');
  const calendars = await GoogleCalendarService.listCalendars(tenantA, userA);
  assert.strictEqual(calendars.length, 2);

  await GoogleCalendarService.updateSettings(tenantA, userA, {
    calendar_id: 'cal-consultorio',
    calendar_name: 'Consultório Particular',
    sync_enabled: true,
    sync_direction: 'both',
    create_google_meet: true,
    privacy_mode: 'show_patient_name',
    sync_interval_option: 'future'
  });

  const updatedConn = GoogleCalendarService.getConnection(tenantA, userA);
  assert.strictEqual(updatedConn.sync_enabled, 1);
  assert.strictEqual(updatedConn.calendar_id, 'cal-consultorio');
  assert.strictEqual(updatedConn.create_google_meet, 1);

  const status = GoogleCalendarService.getStatus(tenantA, userA, profA);
  assert.strictEqual(status.connected, true);
  assert.strictEqual(status.syncEnabled, true);
  assert.strictEqual(status.syncStatus, 'synced');
  console.log('  ✅ [PASS] Agenda selecionada e sincronização ativada com sucesso.');

  // -------------------------------------------------------------------
  // CENÁRIO 3: Criar agendamento no Zemda
  // -------------------------------------------------------------------
  console.log('\n--- CENÁRIO 3: Criar agendamento no Zemda ---');
  const appt1Id = `apt-1-${runId}`;
  const startIso = '2030-10-15T09:00:00';
  const endIso = '2030-10-15T09:50:00';

  db.prepare(`
    INSERT INTO appointments (
      id, tenant_id, appointment_number, patient_id, professional_id, service_id,
      start_time, end_time, status, modality
    ) VALUES (?, ?, 'AG-2030-001', ?, ?, ?, ?, ?, 'scheduled', 'presential')
  `).run(appt1Id, tenantA, patA, profA, servPres, startIso, endIso);

  await GoogleCalendarService.syncAppointmentCreated(appt1Id, tenantA);
  assert.strictEqual(mockCalls.inserts.length, 1);
  const insertPayload = mockCalls.inserts[0].requestBody;
  assert.strictEqual(mockCalls.inserts[0].calendarId, 'cal-consultorio');
  console.log('  ✅ [PASS] Evento enviado à Google Calendar API com sucesso.');

  // -------------------------------------------------------------------
  // CENÁRIO 4: Confirmar que o evento realmente aparece no Google Calendar
  // -------------------------------------------------------------------
  console.log('\n--- CENÁRIO 4: Validação do evento Google (Fuso, Dados, Vínculo) ---');
  assert.strictEqual(insertPayload.start.dateTime, '2030-10-15T09:00:00-03:00');
  assert.strictEqual(insertPayload.end.dateTime, '2030-10-15T09:50:00-03:00');
  assert.strictEqual(insertPayload.start.timeZone, 'America/Sao_Paulo');
  assert.strictEqual(insertPayload.summary, 'Atendimento Zemda — Carlos Silva');
  assert.ok(!insertPayload.description.includes('prontuário'), 'Sem dados clínicos no evento Google');

  const link1 = db.prepare('SELECT * FROM google_calendar_event_links WHERE appointment_id = ?').get(appt1Id);
  assert.ok(link1);
  assert.strictEqual(link1.sync_status, 'synced');
  assert.ok(link1.google_event_id);
  console.log('  ✅ [PASS] Vínculo salvo como synced com identificador Google correspondente.');

  // -------------------------------------------------------------------
  // CENÁRIO 5: Editar o horário e verificar a atualização
  // -------------------------------------------------------------------
  console.log('\n--- CENÁRIO 5: Editar horário / remarcação ---');
  const newStart = '2030-10-15T10:00:00';
  const newEnd = '2030-10-15T10:50:00';
  db.prepare('UPDATE appointments SET start_time = ?, end_time = ? WHERE id = ?').run(newStart, newEnd, appt1Id);

  await GoogleCalendarService.syncAppointmentUpdated(appt1Id, tenantA);
  assert.strictEqual(mockCalls.patches.length, 1);
  const patchPayload = mockCalls.patches[0].requestBody;
  assert.strictEqual(patchPayload.start.dateTime, '2030-10-15T10:00:00-03:00');
  assert.strictEqual(patchPayload.end.dateTime, '2030-10-15T10:50:00-03:00');
  assert.strictEqual(mockCalls.patches[0].eventId, link1.google_event_id);
  console.log('  ✅ [PASS] Remarcação atualizou o mesmo evento Google sem duplicidade.');

  // -------------------------------------------------------------------
  // CENÁRIO 6: Cancelar e verificar o comportamento esperado
  // -------------------------------------------------------------------
  console.log('\n--- CENÁRIO 6: Cancelamento de agendamento ---');
  db.prepare("UPDATE appointments SET status = 'cancelled' WHERE id = ?").run(appt1Id);
  await GoogleCalendarService.syncAppointmentCancelled(appt1Id, tenantA);

  assert.strictEqual(mockCalls.deletes.length, 1);
  assert.strictEqual(mockCalls.deletes[0].eventId, link1.google_event_id);
  const linkAfterCancel = db.prepare('SELECT * FROM google_calendar_event_links WHERE appointment_id = ?').get(appt1Id);
  assert.strictEqual(linkAfterCancel, undefined, 'Vínculo local deve ser removido após cancelamento');
  console.log('  ✅ [PASS] Evento excluído do Google e vínculo limpo com sucesso.');

  // -------------------------------------------------------------------
  // CENÁRIO 7: Criar teleconsulta e confirmar geração do Meet
  // -------------------------------------------------------------------
  console.log('\n--- CENÁRIO 7: Teleconsulta com criação do Google Meet ---');
  const apptOnlineId = `apt-online-${runId}`;
  db.prepare(`
    INSERT INTO appointments (
      id, tenant_id, appointment_number, patient_id, professional_id, service_id,
      start_time, end_time, status, modality
    ) VALUES (?, ?, 'AG-2030-002', ?, ?, ?, '2030-10-16T14:00:00', '2030-10-16T14:50:00', 'scheduled', 'online')
  `).run(apptOnlineId, tenantA, patA, profA, servTele);

  await GoogleCalendarService.syncAppointmentCreated(apptOnlineId, tenantA);
  const onlineInsert = mockCalls.inserts[mockCalls.inserts.length - 1];
  assert.strictEqual(onlineInsert.conferenceDataVersion, 1);
  assert.strictEqual(onlineInsert.requestBody.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet');

  const apptRow = db.prepare('SELECT meeting_url FROM appointments WHERE id = ?').get(apptOnlineId);
  assert.ok(apptRow.meeting_url?.startsWith('https://meet.google.com/'));
  console.log(`  ✅ [PASS] Google Meet gerado e vinculado: ${apptRow.meeting_url}`);

  // -------------------------------------------------------------------
  // CENÁRIO 8: Testar token expirado e reconexão necessária
  // -------------------------------------------------------------------
  console.log('\n--- CENÁRIO 8: Tratamento de token expirado / invalid_grant ---');
  const apptFailId = `apt-fail-${runId}`;
  db.prepare(`
    INSERT INTO appointments (
      id, tenant_id, appointment_number, patient_id, professional_id, service_id,
      start_time, end_time, status, modality
    ) VALUES (?, ?, 'AG-2030-003', ?, ?, ?, '2030-10-17T11:00:00', '2030-10-17T11:50:00', 'scheduled', 'presential')
  `).run(apptFailId, tenantA, patA, profA, servPres);

  // Simula erro de autenticação do Google (invalid_grant)
  nextCallFails = Object.assign(new Error('invalid_grant: Bad Request'), { code: 401 });
  await GoogleCalendarService.syncAppointmentCreated(apptFailId, tenantA);

  const failLink = db.prepare('SELECT * FROM google_calendar_event_links WHERE appointment_id = ?').get(apptFailId);
  assert.strictEqual(failLink.sync_status, 'error');
  assert.ok(failLink.last_error.includes('Reconexão necessária'));

  const failStatus = GoogleCalendarService.getStatus(tenantA, userA, profA);
  assert.strictEqual(failStatus.syncStatus, 'reconnection_required');
  assert.ok(failStatus.lastSyncError.includes('Reconexão necessária'));
  console.log('  ✅ [PASS] Falha 401 classificada como "reconnection_required" sem derrubar agendamento Zemda.');

  // -------------------------------------------------------------------
  // CENÁRIO 9: Falha temporária e retry sem duplicar eventos
  // -------------------------------------------------------------------
  console.log('\n--- CENÁRIO 9: Falhas temporárias e retry idempotente ---');
  // Limpa erro anterior da conexão
  db.prepare("UPDATE google_calendar_connections SET last_sync_error = NULL WHERE id = ?").run(updatedConn.id);

  const apptRetryId = `apt-retry-${runId}`;
  db.prepare(`
    INSERT INTO appointments (
      id, tenant_id, appointment_number, patient_id, professional_id, service_id,
      start_time, end_time, status, modality
    ) VALUES (?, ?, 'AG-2030-004', ?, ?, ?, '2030-10-18T15:00:00', '2030-10-18T15:50:00', 'scheduled', 'presential')
  `).run(apptRetryId, tenantA, patA, profA, servPres);

  // 1ª tentativa: falha 500 do Google
  nextCallFails = Object.assign(new Error('Google Backend Error'), { code: 500 });
  await GoogleCalendarService.syncAppointmentCreated(apptRetryId, tenantA);

  const pendingLink = db.prepare('SELECT * FROM google_calendar_event_links WHERE appointment_id = ?').get(apptRetryId);
  assert.strictEqual(pendingLink.sync_status, 'pending');

  // 2ª tentativa (retry seguro): Google responde normalmente
  const countInsertsBefore = mockCalls.inserts.length;
  await GoogleCalendarService.syncAppointmentCreated(apptRetryId, tenantA);
  assert.strictEqual(mockCalls.inserts.length, countInsertsBefore + 1);

  const syncedLink = db.prepare('SELECT * FROM google_calendar_event_links WHERE appointment_id = ?').get(apptRetryId);
  assert.strictEqual(syncedLink.sync_status, 'synced');
  assert.strictEqual(syncedLink.last_error, null);

  // 3ª tentativa imediata (idempotência): não duplica insert
  await GoogleCalendarService.syncAppointmentCreated(apptRetryId, tenantA);
  assert.strictEqual(mockCalls.inserts.length, countInsertsBefore + 1, 'Chamada repetida não deve duplicar insert');
  console.log('  ✅ [PASS] Retry idempotente recuperou sincronização sem duplicar evento.');

  // -------------------------------------------------------------------
  // CENÁRIO 10: Isolamento Multi-Clínica
  // -------------------------------------------------------------------
  console.log('\n--- CENÁRIO 10: Isolamento Multi-Clínica ---');
  // Profissional B na Clínica B tenta consultar status ou agenda
  const statusB = GoogleCalendarService.getStatus(tenantB, userB, profB);
  assert.strictEqual(statusB.connected, false, 'Clínica B não deve ver a conexão da Clínica A');

  // Eventos da Clínica A não devem ser acessíveis nem sincronizados pela conexão da Clínica B
  const linkClinicA = db.prepare('SELECT tenant_id FROM google_calendar_event_links WHERE appointment_id = ?').get(apptRetryId);
  assert.strictEqual(linkClinicA.tenant_id, tenantA);

  const connForProfBInTenantA = GoogleCalendarService.getConnectionForProfessional(tenantA, profB);
  assert.strictEqual(connForProfBInTenantA, null, 'Profissional B não tem conexão na Clínica A');
  console.log('  ✅ [PASS] Isolamento rigoroso entre clínicas e contas confirmado.');

  console.log('\n======================================================');
  console.log('🎉 TODOS OS 10 CENÁRIOS PASSARAM COM 100% DE SUCESSO!');
  console.log('======================================================\n');
}

run().catch(err => {
  console.error('❌ Falha na execução do teste:', err);
  process.exit(1);
});
