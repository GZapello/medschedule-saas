// Isolated synthetic databases; never touches the application's database.
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { migrateClinicBooking } = require('./dist/config/slug-migration');
const { ensureClinicBookingIdentity, clinicBookingSlug } = require('./dist/utils/clinic-booking-identity');
assert(!require.cache[require.resolve('./dist/config/database')], 'Migration must not import singleton');
assert.equal(clinicBookingSlug(' Á Clínica!!! '), 'a-clinica');
assert.equal(clinicBookingSlug('!!!'), 'clinica');
const snapshot = db => JSON.stringify(db.prepare('SELECT * FROM tenants ORDER BY id').all());
for (const count of [2, 3]) for (const withColumns of [false, true]) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE tenants(id TEXT PRIMARY KEY, slug TEXT, name TEXT, trade_name TEXT, created_at TEXT ${withColumns ? ', public_booking_enabled INTEGER NOT NULL DEFAULT 0, public_booking_slug TEXT, public_booking_sequence INTEGER' : ''})`);
  for (const id of ['a', 'b', 'c'].slice(0,count).reverse()) db.prepare('INSERT INTO tenants(id,slug,name,created_at) VALUES(?,?,?,?)').run(id, 'legacy-'+id, 'Clínica Psicom', '2020-01-01');
  migrateClinicBooking(db);
  const rows = db.prepare('SELECT * FROM tenants ORDER BY id').all();
  assert.deepEqual(rows.map(r=>r.public_booking_sequence), [1,2,3].slice(0,count));
  assert(rows.every(r=>r.public_booking_slug === 'clinica-psicom' && r.public_booking_enabled === 0 && r.slug === 'legacy-'+r.id));
  const before = snapshot(db); migrateClinicBooking(db); assert.equal(snapshot(db), before);
  db.prepare("UPDATE tenants SET name='Renamed',public_booking_enabled=1 WHERE id='a'").run();
  migrateClinicBooking(db); ensureClinicBookingIdentity(db, 'a');
  assert.equal(db.prepare("SELECT public_booking_slug FROM tenants WHERE id='a'").get().public_booking_slug, 'clinica-psicom');
  assert.equal(db.prepare("SELECT public_booking_enabled FROM tenants WHERE id='a'").get().public_booking_enabled, 1);
  db.prepare("INSERT INTO tenants(id,slug,name,created_at) VALUES('d','legacy-d','Clínica Psicom','2021')").run();
  ensureClinicBookingIdentity(db, 'd');
  assert.equal(db.prepare("SELECT public_booking_sequence FROM tenants WHERE id='d'").get().public_booking_sequence, count+1);
  assert.throws(()=>db.exec("UPDATE tenants SET public_booking_sequence=1 WHERE id='d'"));
  db.close();
}
const duplicate = new DatabaseSync(':memory:');
duplicate.exec("CREATE TABLE tenants(id TEXT PRIMARY KEY,slug TEXT,name TEXT,created_at TEXT,public_booking_enabled INTEGER NOT NULL DEFAULT 0,public_booking_slug TEXT,public_booking_sequence INTEGER); INSERT INTO tenants VALUES('a','legacy-a','PrivateName','2020',0,'shared',2),('b','legacy-b','PrivateName','2021',1,'shared',2),('c','legacy-c','Other','2022',0,'shared',9)");
const warnings = [], originalWarn = console.warn; console.warn = message => warnings.push(message);
duplicate.exec("CREATE TRIGGER fail_repair BEFORE UPDATE ON tenants WHEN old.id='b' BEGIN SELECT RAISE(ABORT,'PrivateName secret'); END");
assert.doesNotThrow(()=>migrateClinicBooking(duplicate));
assert(warnings.length >= 2); assert(warnings.every(w=>!w.includes('PrivateName') && !w.includes('secret')));
duplicate.exec('DROP TRIGGER fail_repair'); migrateClinicBooking(duplicate); console.warn = originalWarn;
assert.deepEqual(duplicate.prepare('SELECT public_booking_sequence FROM tenants ORDER BY id').all().map(r=>r.public_booking_sequence),[2,10,9]);
const repaired = snapshot(duplicate); migrateClinicBooking(duplicate); assert.equal(snapshot(duplicate), repaired); duplicate.close();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-booking-infrastructure-'));
process.env.DATABASE_PATH = path.join(temp, 'legacy.db'); process.env.NODE_ENV='test';
process.env.JWT_SECRET='synthetic-infrastructure-test-secret';process.env.RESEND_API_KEY='';process.env.GEMINI_API_KEY='';
const legacy = new DatabaseSync(process.env.DATABASE_PATH);
let schema = fs.readFileSync(path.join(__dirname,'src/config/schema.sql'),'utf8');
schema = schema.replace(/CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_booking_identity[^;]*;/,'')
  .replace(/\s*public_booking_enabled INTEGER NOT NULL DEFAULT 0,/, '')
  .replace(/\s*public_booking_slug TEXT,/, '').replace(/\s*public_booking_sequence INTEGER,/, '');
legacy.exec(schema); legacy.prepare("INSERT INTO tenants(id,slug,name,status,email) VALUES('infra-a','legacy-a','Clínica Infra','active','a@test.invalid'),('infra-b','legacy-b','Clínica Infra','active','b@test.invalid')").run();legacy.close();
const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase(); const before = snapshot(db); initializeDatabase(); assert.equal(snapshot(db), before);
const { resolveBookingTenant, publicBookingProfessional } = require('./dist/utils/public-booking');
assert.equal(resolveBookingTenant('clinica-infra',1).id,'infra-a');assert.equal(resolveBookingTenant('clinica-infra',2).id,'infra-b');assert.equal(resolveBookingTenant('legacy-a').id,'infra-a');
db.prepare("INSERT INTO professionals(id,tenant_id,name,slug,active,public_booking_enabled) VALUES('infra-prof','infra-a','Professional','legacy-prof',1,1)").run();
assert.equal(publicBookingProfessional('infra-a','infra-prof','legacy-prof').id,'infra-prof');
const { TenantController } = require('./dist/controllers/tenant.controller');
let response, status=200;const res={status(code){status=code;return this},json(body){response=body;return this}};
TenantController.getCurrent({tenantId:'infra-a'},res);assert.equal(status,200);assert.equal(response.public_booking_enabled,0);assert.equal(response.public_booking_sequence,1);
TenantController.updateCurrent({tenantId:'infra-a',user:{role:'clinic_admin'},body:{publicBookingEnabled:true}},res);assert.equal(status,200);assert.equal(db.prepare("SELECT public_booking_enabled FROM tenants WHERE id='infra-a'").get().public_booking_enabled,1);
TenantController.getCurrent({tenantId:'infra-a'},res);assert.equal(response.public_booking_enabled,1);assert.equal(response.slug,'legacy-a');
console.log('PASS: old/new columns, three same-name clinics, repeated migration/bootstrap, identity preservation, duplicate repair, sanitized failures, unique index, new tenant, default/toggle/GET, sequences 1/2 and legacy professional lookup.');

