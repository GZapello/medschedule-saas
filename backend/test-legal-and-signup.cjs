// Test for Legal Acceptance (LGPD & Terms) and New Signup Flow
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-legal-test-'));
process.env.DATABASE_PATH = path.join(root, 'test.sqlite');
process.env.APP_URL = 'http://127.0.0.1:3000';
process.env.NODE_ENV = 'test';

const { db, initializeDatabase, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } = require('./dist/config/database');
initializeDatabase();

const express = require('express');
const app = express();
app.use(express.json());
app.use('/api', require('./dist/routes').default);

(async () => {
  console.log('--- Starting Legal & Signup Integration Tests ---');

  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const request = async (endpoint, method = 'GET', body = null, token = null, headers = {}) => {
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (token) reqHeaders['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${base}${endpoint}`, {
      method,
      headers: reqHeaders,
      body: body ? JSON.stringify(body) : undefined
    });

    const resBody = await res.json().catch(() => ({}));
    return { status: res.status, body: resBody, headers: res.headers };
  };

  try {
    // 1. Rejection of registration without legal acceptance
    console.log('Test 1: Registration rejected without termsAccepted/privacyAccepted');
    const rej1 = await request('/v1/public/tenants/register', 'POST', {
      clinicName: 'Clínica Sem Aceite',
      responsibleName: 'Dr. Teste',
      email: 'semaceite@teste.com',
      password: 'password123',
      termsAccepted: false,
      privacyAccepted: false
    });
    assert.equal(rej1.status, 400, 'Should reject with 400 when terms not accepted');
    assert.match(rej1.body.error, /Termos de Uso.*Privacidade/i);

    const rej2 = await request('/v1/public/tenants/register', 'POST', {
      clinicName: 'Clínica Só Termos',
      responsibleName: 'Dr. Teste',
      email: 'sotermos@teste.com',
      password: 'password123',
      termsAccepted: true,
      privacyAccepted: false
    });
    assert.equal(rej2.status, 400, 'Should reject with 400 when privacy not accepted');

    console.log('✓ Rejection without legal acceptance verified');

    // 2. Successful registration with legal acceptance & auto-login session
    console.log('Test 2: Registration with legal acceptance & immediate session token');
    const userAgent = 'ZemdaTestAgent/2026.1';
    const regRes = await request('/v1/public/tenants/register', 'POST', {
      clinicName: 'Clínica Alpha Saúde',
      responsibleName: 'Dra. Roberta Alpha',
      email: 'roberta@alphasaude.com',
      password: 'SenhaForte2026!',
      phone: '11999998888',
      termsAccepted: true,
      privacyAccepted: true,
      marketingAccepted: true
    }, null, { 'User-Agent': userAgent });

    assert.equal(regRes.status, 201, 'Registration should succeed with 201');
    assert.ok(regRes.body.token, 'Response must include JWT session token');
    assert.ok(regRes.body.user, 'Response must include user object');
    assert.equal(regRes.body.user.email, 'roberta@alphasaude.com');
    assert.equal(regRes.body.user.role, 'clinic_admin');
    assert.equal(regRes.body.tenant.slug, 'clinica-alpha-saude');
    assert.equal(regRes.body.status, 'pending');

    const authToken = regRes.body.token;
    const userId = regRes.body.user.id;
    const tenantId = regRes.body.tenant.id;

    console.log('✓ Signup returned authenticated session token & user payload');

    // 3. Verifying legal_acceptances audit table
    console.log('Test 3: Verify legal_acceptances audit log in database');
    const acceptance = db.prepare('SELECT * FROM legal_acceptances WHERE user_id = ?').get(userId);
    assert.ok(acceptance, 'Legal acceptance record must exist in DB');
    assert.equal(acceptance.clinic_id, tenantId);
    assert.equal(acceptance.terms_version, CURRENT_TERMS_VERSION);
    assert.equal(acceptance.privacy_version, CURRENT_PRIVACY_VERSION);
    assert.equal(acceptance.marketing_opt_in, 1);
    assert.equal(acceptance.user_agent, userAgent);
    assert.ok(acceptance.accepted_at, 'Timestamp accepted_at must be populated');
    assert.ok(acceptance.ip_address, 'IP address must be captured');

    console.log('✓ Legal acceptance proof logged with IP, UA, versions, and timestamp');

    // 4. Token can immediately authenticate via /v1/auth/me
    console.log('Test 4: Verify session token works immediately on /v1/auth/me');
    const meRes = await request('/v1/auth/me', 'GET', null, authToken);
    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.user.id, userId);
    assert.equal(meRes.body.user.needsLegalAcceptance, false, 'Freshly registered user should not need legal acceptance');
    assert.equal(meRes.body.user.termsVersionAccepted, CURRENT_TERMS_VERSION);
    assert.equal(meRes.body.user.privacyVersionAccepted, CURRENT_PRIVACY_VERSION);

    console.log('✓ Token successfully authenticated on /v1/auth/me');

    // 5. Access plans and billing route immediately without re-login
    console.log('Test 5: Access billing plans route with signup token');
    const plansRes = await request('/v1/plans', 'GET', null, authToken);
    assert.equal(plansRes.status, 200, 'Authenticated new clinic owner should be able to fetch plans');
    assert.ok(Array.isArray(plansRes.body), 'Plans must be an array');
    assert.ok(plansRes.body.length >= 3, 'Must return at least 3 plans (Solo, Equipe, Clínica)');

    console.log('✓ Billing plans accessible immediately with signup session token');

    // 6. Test legal version upgrade detection and re-acceptance endpoint
    console.log('Test 6: Test legal version upgrade and re-acceptance endpoint');
    // Simulate user having accepted an older version
    db.prepare('UPDATE users SET terms_version_accepted = ?, privacy_version_accepted = ? WHERE id = ?')
      .run('2025.0', '2025.0', userId);

    const meOutdated = await request('/v1/auth/me', 'GET', null, authToken);
    assert.equal(meOutdated.status, 200);
    assert.equal(meOutdated.body.user.needsLegalAcceptance, true, 'User with outdated version must flag needsLegalAcceptance');

    // Test rejection of re-acceptance if checkboxes not true
    const reAcceptFail = await request('/v1/auth/accept-legal', 'POST', {
      termsAccepted: false,
      privacyAccepted: true
    }, authToken);
    assert.equal(reAcceptFail.status, 400);

    // Test successful re-acceptance
    const reAcceptSuccess = await request('/v1/auth/accept-legal', 'POST', {
      termsAccepted: true,
      privacyAccepted: true
    }, authToken, { 'User-Agent': 'ZemdaReAcceptAgent/1.0' });

    assert.equal(reAcceptSuccess.status, 200);
    assert.equal(reAcceptSuccess.body.needsLegalAcceptance, false);

    // Verify DB updated
    const userAfterReAccept = db.prepare('SELECT terms_version_accepted, privacy_version_accepted FROM users WHERE id = ?').get(userId);
    assert.equal(userAfterReAccept.terms_version_accepted, CURRENT_TERMS_VERSION);
    assert.equal(userAfterReAccept.privacy_version_accepted, CURRENT_PRIVACY_VERSION);

    const acceptancesCount = db.prepare('SELECT COUNT(*) as count FROM legal_acceptances WHERE user_id = ?').get(userId);
    assert.equal(acceptancesCount.count, 2, 'Should have 2 acceptance records in audit log');

    console.log('✓ Legal version upgrade detection and re-acceptance passed flawlessly');

    console.log('\n=========================================');
    console.log('ALL LEGAL & SIGNUP TESTS PASSED SUCCESSFULLY!');
    console.log('=========================================\n');
  } finally {
    server.close();
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch (_) {}
  }
})().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
