const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-integrity-')), 'test.sqlite');
const { db, initializeDatabase } = require('./dist/config/database'); initializeDatabase();
const { SystemIntegrity: monitor } = require('./dist/services/system-integrity.service');
const { SystemIntegrityController: controller } = require('./dist/controllers/system-integrity.controller');
const req = { route: { path: '/v1/clinical/draft/:moduleType/:patientId' }, params: { moduleType: 'fisio', patientId: 'PRIVATE_PATIENT' }, method: 'POST', tenantId: 'synthetic-clinic', body: { diagnosis: 'PRIVATE_DIAGNOSIS', token: 'PRIVATE_TOKEN' }, originalUrl: '/private?password=PRIVATE_PASSWORD' };
monitor.observe(req, { statusCode: 200 }); monitor.observe(req, { statusCode: 503 }); monitor.observe(req, { statusCode: 503 });
for (const status of ['PENDING', 'PROCESSING', 'RETRY', 'PROCESSED']) {
  db.prepare("INSERT INTO asaas_webhook_events(id,asaas_event_id,event_type,payload,processing_status,processed_at) VALUES(?,?,'TEST',?,?,datetime('now'))")
    .run(status, status, '{"token":"PRIVATE_WEBHOOK_PAYLOAD"}', status);
}
const result = monitor.snapshot(1);
assert.deepEqual(result.jobs.webhookJobs.map(row => row.status).sort(), ['PENDING','PROCESSING','PROCESSED','RETRY'].sort());
assert.equal(result.services[0].attempts, 3); assert.equal(result.services[0].successes, 1); assert.equal(result.services[0].failures, 2);
assert.equal(result.affectedClinics, 1); assert.equal(result.autosave[0].module, 'fisio');
assert.equal(result.recent[0].occurrences, 2); assert.equal(result.frequent[0].occurrences, 2);
const allStored = JSON.stringify(db.prepare('SELECT * FROM technical_events').all());
for (const secret of ['PRIVATE_PATIENT','PRIVATE_DIAGNOSIS','PRIVATE_TOKEN','PRIVATE_PASSWORD','PRIVATE_WEBHOOK_PAYLOAD']) { assert(!allStored.includes(secret)); assert(!JSON.stringify(result).includes(secret)); }
for (const role of ['professional','clinic_admin','receptionist']) {
  let status; controller.get({user:{role},headers:{},query:{}}, {status(n){status=n;return this},json(){}}); assert.equal(status,403);
}
db.prepare("UPDATE technical_events SET last_seen=datetime('now','-2 days')").run(); assert.equal(monitor.snapshot(1).recent.length,0);
console.log('PASS integrity: aggregate counts, pagination, module, retention window, RBAC and no sensitive data');
