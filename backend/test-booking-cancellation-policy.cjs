const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-policy-')), 'test.db');
process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'policy-test-only-secret'; process.env.RESEND_API_KEY = ''; process.env.GEMINI_API_KEY = '';
const { db, initializeDatabase } = require('./dist/config/database'); initializeDatabase();
const { generateToken } = require('./dist/utils/jwt');
const express = require('express'); const app = express(); app.use(express.json()); app.use('/api', require('./dist/routes').default);
for (const id of ['policy-a', 'policy-b']) db.prepare("INSERT INTO tenants(id,slug,name,status,billing_required,public_booking_enabled,email) VALUES(?,?,?,'active',0,1,?)").run(id, id, id, id + '@test.invalid');
for (const [id, role] of [['admin', 'clinic_admin'], ['owner', 'professional'], ['reception', 'receptionist']]) {
  db.prepare("INSERT INTO users(id,tenant_id,name,email,password_hash,role,status) VALUES(?,'policy-a',?,?,'hash',?,'active')").run(id, id, id + '@test.invalid', role);
  db.prepare("INSERT INTO clinic_users(id,tenant_id,user_id,role,status,is_manager,permissions_json) VALUES(?,'policy-a',?,?,'active',0,'[]')").run('link-' + id, id, role);
}
db.prepare("INSERT INTO professionals(id,tenant_id,user_id,name,slug,active,public_booking_enabled) VALUES('policy-prof','policy-a','owner','Ana','ana',1,1),('policy-peer','policy-a',NULL,'Bia','bia',1,1),('policy-foreign','policy-b',NULL,'Outro','outro',1,1)").run();
const token = role => generateToken({ userId: role === 'clinic_admin' ? 'admin' : role === 'professional' ? 'owner' : 'reception', tenantId: 'policy-a', role, email: 'test@test.invalid' });
(async () => {
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (route, role, body) => {
    const response = await fetch(base + route, { method: body ? 'PUT' : 'GET', headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: `Bearer ${token(role)}`, 'x-tenant-id': 'policy-a' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  try {
    let current = await call('/tenants/current', 'clinic_admin'); assert.equal(current.status, 200); assert.equal(current.data.booking_cancellation_policy_enabled, 0); assert.equal(current.data.booking_cancellation_policy_text, '');
    const text = 'Cancelar com antecedência.\n<script>window.executed=true</script>';
    const save = body => call('/tenants/current', 'clinic_admin', { bookingCancellationPolicy: body });
    assert.equal((await save({ enabled: true, text })).status, 200);
    current = await call('/tenants/current', 'clinic_admin'); assert.equal(current.data.booking_cancellation_policy_text, text);
    let publicPage = await call('/public/tenants/policy-a'); assert.equal(publicPage.data.tenant.booking_cancellation_policy_text, text);
    assert.equal((await save({ enabled: false })).status, 200);
    assert.equal((await call('/tenants/current', 'clinic_admin')).data.booking_cancellation_policy_text, text);
    publicPage = await call('/public/tenants/policy-a'); assert.equal(publicPage.data.tenant.booking_cancellation_policy_text, null);
    assert.equal((await save({ enabled: true })).status, 200);
    assert.equal((await save({ enabled: true, text: '' })).status, 400);
    assert.equal((await save({ enabled: 'true', text: 'x' })).status, 400);
    assert.equal((await save({ enabled: true, text: 'x'.repeat(10001) })).status, 400);
    for (const role of ['professional', 'receptionist']) assert.equal((await call('/tenants/current', role, { bookingCancellationPolicy: { enabled: false } })).status, 403);
    const body = { bookingCancellationPolicy: { enabled: true, text: 'Política individual de Ana.' } };
    assert.equal((await call('/professionals/policy-prof', 'professional', body)).status, 200);
    assert.equal((await call('/professionals/policy-peer', 'professional', body)).status, 403);
    assert.equal((await call('/professionals/policy-foreign', 'clinic_admin', body)).status, 404);
    assert.equal((await call('/professionals/policy-prof', 'receptionist', body)).status, 403);
    assert.equal((await call('/public/professionals/policy-a/ana')).data.professional.booking_cancellation_policy_text, body.bookingCancellationPolicy.text);
    assert.equal((await call('/public/professionals/policy-a/bia')).data.professional.booking_cancellation_policy_enabled, 0);
    assert.equal((await call('/public/tenants/policy-b')).data.tenant.booking_cancellation_policy_enabled, 0);
    assert.equal((await call('/public/tenants/policy-a')).data.tenant.booking_cancellation_policy_text, text);
    assert.equal((await call('/professionals/policy-prof', 'professional', { bookingCancellationPolicy: { enabled: false } })).status, 200);
    assert.equal((await call('/professionals/policy-prof', 'professional')).data.professional.booking_cancellation_policy_text, body.bookingCancellationPolicy.text);
    assert.equal((await call('/public/professionals/policy-a/ana')).data.professional.booking_cancellation_policy_text, null);
    // Exercise the existing public eligibility filter, without changing package rules.
    db.prepare("UPDATE tenants SET establishment_profile='studio' WHERE id='policy-a'").run();
    db.prepare("INSERT INTO services(id,tenant_id,professional_id,name,duration_minutes,price,active,service_domain) VALUES('policy-service','policy-a','policy-prof','Pilates',50,80,1,'studio')").run();
    for (const [id, active, visible] of [['eligible',1,1],['private',1,0],['inactive',0,1]]) {
      db.prepare("INSERT INTO service_packages(id,tenant_id,name,price,active,allow_public_booking) VALUES(?,'policy-a',?,200,?,?)").run(id,id,active,visible);
      db.prepare("INSERT INTO service_package_items(id,tenant_id,package_id,service_id,included_credits) VALUES(?,'policy-a',?,'policy-service',4)").run('item-'+id,id);
    }
    assert.deepEqual((await call('/public/tenants/policy-a')).data.packages.map(p=>p.id), ['eligible']);
    db.prepare("UPDATE service_packages SET allow_public_booking=0 WHERE id='eligible'").run();
    assert.equal((await call('/public/tenants/policy-a')).data.packages.length,0);
    db.prepare("UPDATE service_packages SET allow_public_booking=1 WHERE id='eligible'").run();
    db.prepare("UPDATE services SET active=0 WHERE id='policy-service'").run();
    assert.equal((await call('/public/tenants/policy-a')).data.packages.length,0);
    initializeDatabase();
    assert.equal(db.prepare("SELECT booking_cancellation_policy_text FROM professionals WHERE id='policy-prof'").get().booking_cancellation_policy_text, body.bookingCancellationPolicy.text);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM appointments WHERE tenant_id = ?').get('policy-a').n, 0);
    console.log('PASS: default, save/reload/rebootstrap, disable preserving text, public visibility, text validation, own-profile permissions, tenant isolation public package eligibility and no appointments changed.');
  } finally { server.close(); }
})().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
