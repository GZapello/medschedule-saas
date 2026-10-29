// Run via run-tests.cjs: isolated temporary database, fake Google transport only.
const assert = require('node:assert/strict');
if (process.env.NODE_ENV !== 'test' || !process.env.DATABASE_PATH) throw new Error('Use run-tests.cjs with an isolated database.');
process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY = 'test-only-dedicated-key-at-least-32-bytes';
process.env.GOOGLE_CALENDAR_CLIENT_ID = 'test.apps.googleusercontent.com';
process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'test-only';
process.env.GOOGLE_CALENDAR_REDIRECT_URI = 'https://zemda.test/api/v1/integrations/google-calendar/callback';
const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();
const { GoogleCalendarService: service } = require('./dist/services/google-calendar.service');
const { encryptRefreshToken, decryptRefreshToken } = require('./dist/utils/google-calendar-crypto');
const { google } = require('googleapis');
let inserts = 0, patches = 0, deletes = 0, listCalls = [], watches = 0, stops = 0;
let deleteFails = false, patchFails = false, freebusyFails = false, revokeFails = false, resetCursor = false;
let events = [], subject = 'subject-a', granted = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.freebusy', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly'];
let tokens = { access_token: 'fake-access', refresh_token: 'fake-refresh', id_token: 'fake-id' };
const client = { setCredentials() {}, getToken: async () => ({ tokens: { ...tokens, scope: granted.join(' ') } }),
  verifyIdToken: async () => ({ getPayload: () => ({ sub: subject, email: 'test@example.test', email_verified: true }) }),
  revokeToken: async () => { if (revokeFails) throw new Error('offline'); } };
const realClient = service.createOAuth2Client;
const fakeCalendar = {
  calendarList: { get: async () => ({ data: { summary: 'Principal' } }), list: async ({ pageToken }) => ({ data: pageToken ? { items: [{ id: 'second', summary: 'Second', accessRole: 'writer' }] } : { items: [{ id: 'primary', summary: 'Principal', primary: true }], nextPageToken: 'two' } }) },
  channels: { stop: async () => { stops++; } },
  freebusy: { query: async () => ({ data: { calendars: { primary: freebusyFails ? { errors: [{ reason: 'internalError' }] } : { busy: [{ start: '2030-11-04T15:00:00Z', end: '2030-11-04T16:00:00Z' }] } } } }) },
  events: {
    watch: async () => { watches++; return { data: { resourceId: 'resource', expiration: String(Date.now() + 86400000) } }; },
    list: async args => {
      listCalls.push(args);
      if (args.privateExtendedProperty) return { data: { items: [] } };
      if (resetCursor && args.syncToken) { resetCursor = false; throw { code: 410 }; }
      return { data: args.pageToken ? { items: events.slice(1), nextSyncToken: 'cursor-new' } : { items: events.slice(0, 1), nextPageToken: 'next' } };
    },
    insert: async ({ requestBody }) => { inserts++; return { data: { ...requestBody, hangoutLink: 'https://meet.google.com/aaa-bbbb-ccc' } }; },
    get: async ({ eventId }) => ({ data: events.find(e => e.id === eventId) || { id: eventId, start: { dateTime: '2030-11-04T15:00:00Z' }, end: { dateTime: '2030-11-04T16:00:00Z' } } }),
    patch: async ({ requestBody }) => { patches++; if (patchFails) throw new Error('offline'); return { data: { ...requestBody, hangoutLink: 'https://meet.google.com/aaa-bbbb-ccc' } }; },
    delete: async () => { deletes++; if (deleteFails) throw { code: 503 }; }
  }
};
google.calendar = () => fakeCalendar;
function connection() { return service.getConnection('oauth-tenant', 'oauth-user'); }
function link(id) { return db.prepare('SELECT * FROM google_calendar_event_links WHERE appointment_id = ?').get(id); }
function appointment(id, modality = 'presential') {
  db.prepare(`INSERT INTO appointments(id,tenant_id,appointment_number,patient_id,professional_id,service_id,start_time,end_time,status,modality)
    VALUES(?,'oauth-tenant',?,'oauth-patient','oauth-prof','oauth-service','2030-11-04T12:00:00','2030-11-04T13:00:00','scheduled',?)`).run(id, id, modality);
}
async function state() {
  service.createOAuth2Client = realClient;
  const value = service.generateAuthUrl('oauth-tenant', 'oauth-user', 'oauth-prof', 'https://evil.test/');
  service.createOAuth2Client = () => client;
  return value;
}
(async () => {
  const encrypted = encryptRefreshToken('test-refresh');
  delete process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY;
  assert.throws(() => encryptRefreshToken('test'), /chave dedicada/);
  assert.equal(service.isConfigured(), false);
  process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY = 'test-only-dedicated-key-at-least-32-bytes';
  assert.equal(decryptRefreshToken(encrypted), 'test-refresh');
  process.env.GOOGLE_CALENDAR_PREVIOUS_ENCRYPTION_KEYS = JSON.stringify([process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY]);
  process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY = 'new-test-key-at-least-thirty-two-bytes';
  assert.equal(decryptRefreshToken(encrypted), 'test-refresh');
  console.log('PASS dedicated encryption key and explicit rotation');

  db.prepare("INSERT INTO tenants(id,name,slug,email) VALUES('oauth-tenant','Test','oauth-tenant','tenant@example.test')").run();
  db.prepare("INSERT INTO users(id,tenant_id,name,email,password_hash,role) VALUES('oauth-user','oauth-tenant','Tester','user@example.test','hash','professional')").run();
  db.prepare("INSERT INTO professionals(id,tenant_id,user_id,name) VALUES('oauth-prof','oauth-tenant','oauth-user','Tester')").run();
  db.prepare("INSERT INTO patients(id,tenant_id,full_name,phone) VALUES('oauth-patient','oauth-tenant','Paciente Teste','11999999999')").run();
  db.prepare("INSERT INTO services(id,tenant_id,name,duration_minutes,price) VALUES('oauth-service','oauth-tenant','Consulta',60,0)").run();
  let auth = await state();
  const url = new URL(auth.url);
  assert.equal(url.searchParams.get('redirect_uri'), process.env.GOOGLE_CALENDAR_REDIRECT_URI);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(new URL(service.safeReturnUrl('https://evil.test')).origin, 'https://zemda.test');
  assert.equal(new URL(service.safeReturnUrl('//evil.test')).origin, 'https://zemda.test');
  db.prepare("UPDATE google_calendar_oauth_states SET expires_at = ? WHERE state = ?").run(new Date(Date.now() - 60000).toISOString(), auth.state);
  assert.equal((await service.handleCallback('code', auth.state)).success, false);
  auth = await state();
  const fullGranted = granted;
  granted = granted.slice(0, 1);
  await assert.rejects(service.handleCallback('code', auth.state), /três permissões/);
  assert.equal(connection(), null);
  granted = fullGranted;
  auth = await state();
  assert.equal((await service.handleCallback('code', auth.state)).success, true);
  assert.equal(connection().sync_enabled, 0);
  assert.equal((await service.handleCallback('code', auth.state)).success, false);
  subject = 'other-account'; auth = await state();
  await assert.rejects(service.handleCallback('code', auth.state), /Desconecte/);
  subject = 'subject-a';
  console.log('PASS expiry, PKCE, redirect origin, partial consent, identity and replay');

  assert.equal((await service.listCalendars('oauth-tenant', 'oauth-user')).length, 2);
  await assert.rejects(service.updateSettings('oauth-tenant', 'oauth-user', { sync_direction: 'invalid' }), /inválida/);
  await service.updateSettings('oauth-tenant', 'oauth-user', { sync_enabled: true });
  assert.equal(watches, 1);
  await service.ensureWatch(connection()); assert.equal(watches, 1);
  db.prepare('UPDATE google_calendar_connections SET watch_expiration = ? WHERE id = ?').run(String(Date.now() + 100), connection().id);
  await service.ensureWatch(connection()); assert.equal(watches, 2); assert.ok(stops);
  const before = listCalls.length;
  await service.handleWebhook({ 'x-goog-channel-id': connection().watch_channel_id, 'x-goog-channel-token': 'invalid' });
  assert.equal(listCalls.length, before);
  await service.handleWebhook({ 'x-goog-channel-id': connection().watch_channel_id, 'x-goog-channel-token': connection().watch_token, 'x-goog-resource-id': 'resource', 'x-goog-resource-state': 'exists' });
  assert.equal(connection().sync_token, 'cursor-new');
  resetCursor = true;
  await service.syncNow('oauth-tenant', 'oauth-user');
  assert.ok(listCalls.some(c => c.pageToken === 'next'));
  console.log('PASS paginated calendars, channel registration/renewal, authenticated webhook, cursor recovery');

  const busy = await service.getBusyIntervals('oauth-tenant', 'oauth-prof', '2030-11-04');
  assert.equal(busy[0].startMin, 720);
  freebusyFails = true; service.clearBusyCache('oauth-tenant');
  await assert.rejects(service.getBusyIntervals('oauth-tenant', 'oauth-prof', '2030-11-04'), /disponibilidade/);
  freebusyFails = false;
  assert.equal(service.toClinicTime('2030-11-04T15:00:00Z'), '2030-11-04T12:00:00');
  console.log('PASS timezone conversion and unavailable FreeBusy is not free');

  appointment('online', 'online');
  await Promise.all([service.syncAppointmentCreated('online', 'oauth-tenant'), service.syncAppointmentCreated('online', 'oauth-tenant')]);
  assert.equal(inserts, 1);
  assert.match(db.prepare("SELECT meeting_url FROM appointments WHERE id='online'").get().meeting_url, /^https:\/\/meet.google.com/);
  appointment('later-online'); await service.syncAppointmentCreated('later-online', 'oauth-tenant');
  db.prepare("UPDATE appointments SET modality='online' WHERE id='later-online'").run();
  await service.syncAppointmentUpdated('later-online', 'oauth-tenant');
  assert.ok(db.prepare("SELECT meeting_url FROM appointments WHERE id='later-online'").get().meeting_url);
  db.prepare("UPDATE google_calendar_event_links SET sync_status='divergent' WHERE appointment_id='online'").run();
  await assert.rejects(service.resolveDivergence('online', 'oauth-tenant', 'keep_zemda', 'other-user'), /permissão/);
  patchFails = true;
  await assert.rejects(service.resolveDivergence('online', 'oauth-tenant', 'keep_zemda', 'oauth-user'), /pendente/);
  assert.equal(link('online').sync_status, 'pending'); patchFails = false;
  await service.updateSettings('oauth-tenant', 'oauth-user', { sync_direction: 'google_to_zemda' });
  const prior = patches;
  await service.syncAppointmentUpdated('online', 'oauth-tenant'); assert.equal(patches, prior);
  await service.updateSettings('oauth-tenant', 'oauth-user', { sync_direction: 'both' });
  await assert.rejects(service.updateSettings('oauth-tenant', 'oauth-user', { calendar_id: 'second' }), /vinculados/);
  db.prepare("UPDATE appointments SET status='cancelled' WHERE id='online'").run();
  deleteFails = true; await service.syncAppointmentCancelled('online', 'oauth-tenant');
  assert.equal(link('online').sync_status, 'pending');
  deleteFails = false; await service.syncAppointmentCancelled('online', 'oauth-tenant'); assert.equal(link('online'), undefined);
  db.prepare("INSERT INTO schedules(id,tenant_id,professional_id,day_of_week,start_time,end_time,is_active) VALUES('oauth-shift','oauth-tenant','oauth-prof',1,'08:00','18:00',1)").run();
  events = [{ id: link('later-online').google_event_id, start: { dateTime: '2030-11-04T17:00:00Z' }, end: { dateTime: '2030-11-04T18:00:00Z' } }];
  await service.resolveDivergence('later-online', 'oauth-tenant', 'apply_google', 'oauth-user');
  assert.equal(db.prepare("SELECT start_time FROM appointments WHERE id='later-online'").get().start_time, '2030-11-04T14:00:00');
  appointment('conflict');
  events[0].start.dateTime = '2030-11-04T15:00:00Z'; events[0].end.dateTime = '2030-11-04T16:00:00Z';
  await assert.rejects(service.resolveDivergence('later-online', 'oauth-tenant', 'apply_google', 'oauth-user'), /conflita/);
  db.prepare("DELETE FROM appointments WHERE id='conflict'").run();
  events = [];
  console.log('PASS incoming timezone, schedule and collision validation');
  console.log('PASS idempotence, Meet creation/update, direction, ownership and recoverable cancellation');

  for (let i=0; i<105; i++) appointment(`bulk-${String(i).padStart(3,'0')}`);
  const result = await service.syncNow('oauth-tenant', 'oauth-user');
  assert.equal(result.syncedCount, 106); assert.equal(result.pendingCount, 0);
  revokeFails = true;
  const disconnected = await service.disconnect('oauth-tenant', 'oauth-user');
  assert.equal(disconnected.revoked, false); assert.equal(connection(), null);
  assert.ok(db.prepare("SELECT 1 FROM appointments WHERE id='later-online'").get());
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM google_calendar_event_links').get().n, 0);
  console.log('PASS more than 100 appointments, honest counts, local disconnect despite remote outage');
})().catch(error => { console.error(error); process.exitCode = 1; });
