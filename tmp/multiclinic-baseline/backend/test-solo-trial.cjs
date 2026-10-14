// Deterministic unit & integration test for Zemda Solo 7-Day Free Trial.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-solo-trial-'));
process.env.DATABASE_PATH = path.join(root, 'test.sqlite');
process.env.ASAAS_ENV = 'sandbox';
process.env.ASAAS_API_URL = 'https://api-sandbox.asaas.com/v3';
process.env.ASAAS_API_KEY = '$aact_hmlg_test_only';
process.env.ASAAS_WEBHOOK_TOKEN = 'test-token-123';
process.env.APP_URL = 'https://zemda.test';

const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();
initializeDatabase(); // Verify idempotent migrations

const { BillingService, canOperate } = require('./dist/services/billing.service');
const { BillingWebhookService } = require('./dist/services/billing-webhook.service');
const bcrypt = require('bcryptjs');

async function run() {
  console.log('--- TEST 1: Setup Clinics and Users ---');
  const clinicId = 'clinic_solo_test_1';
  const userId = 'user_solo_test_1';
  const email = 'dr.silva@teste.com';
  const cnpjCpf = '12345678901';

  db.prepare(`
    INSERT INTO tenants (id, name, slug, status, email, cnpj_cpf, trial_used)
    VALUES (?, 'Consultório Dr. Silva', 'dr-silva', 'active', ?, ?, 0)
  `).run(clinicId, email, cnpjCpf);

  const hash = bcrypt.hashSync('senha123', 4);
  db.prepare(`
    INSERT INTO users (id, tenant_id, name, email, password_hash, role, status)
    VALUES (?, ?, 'Dr. Silva', ?, ?, 'clinic_admin', 'active')
  `).run(userId, clinicId, email, hash);

  console.log('✓ Clinic and user created');

  console.log('--- TEST 2: Start 7-Day Solo Free Trial ---');
  const trialResult = await BillingService.startSoloTrial(clinicId, userId);
  assert.equal(trialResult.success, true);
  assert.ok(trialResult.trialEndsAt);

  // Check database
  const sub = db.prepare('SELECT * FROM subscriptions WHERE tenant_id = ?').get(clinicId);
  assert.equal(sub.status, 'TRIAL');
  assert.equal(sub.plan_id.toUpperCase(), 'ZEMDA-SOLO');
  assert.ok(sub.trial_started_at);
  assert.ok(sub.trial_ends_at);

  const tenantAfter = db.prepare('SELECT trial_used FROM tenants WHERE id = ?').get(clinicId);
  assert.equal(tenantAfter.trial_used, 1);

  const history = db.prepare('SELECT * FROM trial_history WHERE tenant_id = ?').get(clinicId);
  assert.equal(history.status, 'ACTIVE');
  assert.equal(history.email, email);
  assert.equal(history.cnpj_cpf, cnpjCpf);

  console.log('✓ Solo trial started and recorded in database');

  console.log('--- TEST 3: canOperate and summary during trial ---');
  assert.equal(canOperate(clinicId), true);

  const sum = BillingService.summary(clinicId);
  assert.equal(sum.isTrial, true);
  assert.equal(sum.status, 'TRIAL');
  assert.equal(sum.canOperate, true);
  assert.equal(sum.maxUsers, 1);
  assert.equal(sum.trialDaysRemaining, 7);
  assert.equal(sum.trialUsed, true);

  console.log('✓ Summary reflects active trial and 7 days remaining');

  console.log('--- TEST 4: Enforce 1 user seat limit via database trigger ---');
  assert.throws(() => {
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status)
      VALUES ('user_solo_2', ?, 'Assistente', 'assistente@teste.com', ?, 'professional', 'active')
    `).run(clinicId, hash);
  }, (err) => {
    assert.ok(err.message.includes('PLAN_USER_LIMIT_REACHED') || err.message.includes('PLAN_LIMIT'), `Expected limit error, got ${err.message}`);
    return true;
  });

  console.log('✓ Second active user insertion blocked by PLAN_LIMIT_EXCEEDED trigger');

  console.log('--- TEST 5: Prevent trial repetition on same clinic ---');
  await assert.rejects(async () => {
    await BillingService.startSoloTrial(clinicId, userId);
  }, (err) => {
    assert.equal(err.code, 'TRIAL_ALREADY_USED');
    return true;
  });

  console.log('✓ Repetition on same clinic blocked');

  console.log('--- TEST 6: Prevent trial repetition by email or CPF/CNPJ ---');
  const clinic2Id = 'clinic_solo_test_2';
  const user2Id = 'user_solo_test_2';
  db.prepare(`
    INSERT INTO tenants (id, name, slug, status, email, cnpj_cpf, trial_used)
    VALUES (?, 'Outra Clínica', 'outra-clinica', 'active', ?, ?, 0)
  `).run(clinic2Id, email, '99999999999');

  db.prepare(`
    INSERT INTO users (id, tenant_id, name, email, password_hash, role, status)
    VALUES (?, ?, 'Outro Nome', 'doutor.outro@teste.com', ?, 'clinic_admin', 'active')
  `).run(user2Id, clinic2Id, hash);

  await assert.rejects(async () => {
    await BillingService.startSoloTrial(clinic2Id, user2Id);
  }, (err) => {
    assert.equal(err.code, 'TRIAL_ALREADY_USED');
    return true;
  });

  console.log('✓ Repetition by duplicate email blocked');

  console.log('--- TEST 7: Block trial upgrade to TEAM / CLINIC without contact ---');
  await assert.rejects(async () => {
    await BillingService.checkout(clinicId, 'TEAM');
  }, (err) => {
    assert.equal(err.code, 'TRIAL_UPGRADE_CONTACT_REQUIRED');
    assert.ok(err.message.includes('suporte@zemda.com.br'));
    return true;
  });

  await assert.rejects(async () => {
    await BillingService.checkout(clinicId, 'CLINIC');
  }, (err) => {
    assert.equal(err.code, 'TRIAL_UPGRADE_CONTACT_REQUIRED');
    assert.ok(err.message.includes('suporte@zemda.com.br'));
    return true;
  });

  console.log('✓ Direct checkout to TEAM/CLINIC blocked during trial');

  console.log('--- TEST 8: Solo Trial Expiration ---');
  // Set trial_ends_at to 1 hour ago
  const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
  db.prepare('UPDATE subscriptions SET trial_ends_at = ? WHERE tenant_id = ?').run(pastDate, clinicId);
  db.prepare('UPDATE trial_history SET ends_at = ? WHERE tenant_id = ?').run(pastDate, clinicId);

  // Trigger expiration
  const expiredCount = BillingService.expireTrials();
  assert.ok(expiredCount >= 1);

  const subExpired = db.prepare('SELECT * FROM subscriptions WHERE tenant_id = ?').get(clinicId);
  assert.equal(subExpired.status, 'TRIAL_EXPIRED');

  const historyExpired = db.prepare('SELECT * FROM trial_history WHERE tenant_id = ?').get(clinicId);
  assert.equal(historyExpired.status, 'EXPIRED');

  assert.equal(canOperate(clinicId), false);

  const sumExpired = BillingService.summary(clinicId);
  assert.equal(sumExpired.status, 'TRIAL_EXPIRED');
  assert.equal(sumExpired.canOperate, false);
  const limits = db.prepare('SELECT max_users FROM billing_user_limits WHERE clinic_id = ?').get(clinicId);
  assert.equal(limits.max_users, 0);
  assert.equal(sumExpired.maxUsers, 1);

  console.log('✓ Trial expiration executed, status TRIAL_EXPIRED, canOperate = false');

  console.log('--- TEST 9: Conversion to ACTIVE on payment ---');
  // Simulate Asaas subscription created and payment confirmed
  const currentSub = db.prepare('SELECT id FROM subscriptions WHERE tenant_id = ?').get(clinicId);
  db.prepare(`
    UPDATE subscriptions 
    SET asaas_subscription_id = 'sub_asaas_solo_1', asaas_customer_id = 'cus_1', plan_id = 'zemda-SOLO'
    WHERE tenant_id = ?
  `).run(clinicId);

  db.prepare(`
    INSERT INTO subscription_payments (
      id, clinic_id, subscription_id, asaas_payment_id, amount, contract_amount, plan_id, status, billing_type, due_date
    ) VALUES ('pay_1', ?, ?, 'pay_asaas_1', 69.90, 69.90, 'zemda-SOLO', 'CONFIRMED', 'CREDIT_CARD', date('now'))
  `).run(clinicId, currentSub.id);

  BillingWebhookService.recalculate(currentSub.id);

  const subConverted = db.prepare('SELECT * FROM subscriptions WHERE tenant_id = ?').get(clinicId);
  assert.equal(subConverted.status, 'ACTIVE');

  const historyConverted = db.prepare('SELECT * FROM trial_history WHERE tenant_id = ?').get(clinicId);
  assert.equal(historyConverted.status, 'CONVERTED');
  assert.ok(historyConverted.converted_at);

  assert.equal(canOperate(clinicId), true);
  console.log('✓ Trial converted to ACTIVE upon confirmed payment, history status CONVERTED');

  console.log('--- TEST 10: SuperAdmin Solo Trials Query ---');
  const adminList = BillingService.listSoloTrials({});
  assert.ok(adminList.trials.length >= 1);
  const foundTrial = adminList.trials.find(t => t.tenant_id === clinicId);
  assert.ok(foundTrial);
  assert.equal(foundTrial.clinic_name, 'Consultório Dr. Silva');
  assert.equal(foundTrial.computed_status, 'CONVERTED');

  assert.equal(adminList.summary.total >= 1, true);
  assert.equal(adminList.summary.converted >= 1, true);

  console.log('✓ SuperAdmin Solo trials list and summary metrics verified');

  console.log('\n========================================');
  console.log('🎉 ALL 10 SOLO TRIAL TESTS PASSED 100%!');
  console.log('========================================');
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
