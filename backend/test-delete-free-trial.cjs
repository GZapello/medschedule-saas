const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { v4: uuidv4 } = require('uuid');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_delete_trials.db');
process.env.JWT_SECRET = 'test-secret-trials-delete-123';
process.env.PORT = '3097';

if (fs.existsSync(process.env.DATABASE_PATH)) {
  try {
    fs.unlinkSync(process.env.DATABASE_PATH);
  } catch (e) {}
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  if (req.url.startsWith('/v1/')) {
    req.url = `/api${req.url}`;
  }
  next();
});
app.use('/api', require('./dist/routes').default);

function makeRequest(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3097,
      path: urlPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✅ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${msg}`);
    failed++;
  }
}

async function runTests() {
  const server = app.listen(3097, async () => {
    console.log('===============================================================');
    console.log('TESTES DE EXCLUSÃO DE TESTES GRÁTIS — SUPERADMIN');
    console.log('===============================================================\n');

    try {
      const nowIso = new Date().toISOString();
      const superAdminId = 'usr-super-' + uuidv4().slice(0, 8);
      const regularAdminId = 'usr-reg-admin-' + uuidv4().slice(0, 8);
      const tenantId = 'ten-' + uuidv4().slice(0, 8);

      // Inserir tenant para regular admin
      db.prepare(`INSERT INTO tenants (id, name, slug, email, status, created_at, updated_at) VALUES (?, ?, ?, 'cli@test.com', 'active', ?, ?)`).run(
        tenantId, 'Clínica Regular', 'clinica-reg', nowIso, nowIso
      );

      // Inserir SuperAdmin e Regular Clinic Admin
      db.prepare(`INSERT INTO users (id, name, email, password_hash, role, status, created_at, updated_at) VALUES (?, 'Super Admin', 'super@zemda.com', 'hash', 'superadmin', 'active', ?, ?)`).run(
        superAdminId, nowIso, nowIso
      );
      db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, created_at, updated_at) VALUES (?, ?, 'Admin Comum', 'admin@cli.com', 'hash', 'clinic_admin', 'active', ?, ?)`).run(
        regularAdminId, tenantId, nowIso, nowIso
      );
      db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, created_at) VALUES (?, ?, ?, 'clinic_admin', 'active', 1, ?)`).run(
        uuidv4(), tenantId, regularAdminId, nowIso
      );

      const superToken = generateToken({
        userId: superAdminId,
        email: 'super@zemda.com',
        name: 'Super Admin',
        role: 'superadmin',
        tenantId: null
      });

      const regularToken = generateToken({
        userId: regularAdminId,
        email: 'admin@cli.com',
        name: 'Admin Comum',
        role: 'clinic_admin',
        tenantId
      });

      const superHeaders = { Authorization: `Bearer ${superToken}` };
      const regularHeaders = { Authorization: `Bearer ${regularToken}`, 'X-Tenant-Id': tenantId };

      // 1. Criar registros de teste grátis nos 5 status possíveis
      const trialPendingId = 'ft-pending-' + uuidv4().slice(0, 6);
      const trialActiveId = 'ft-active-' + uuidv4().slice(0, 6);
      const trialExpiredId = 'ft-expired-' + uuidv4().slice(0, 6);
      const trialEndedId = 'ft-ended-' + uuidv4().slice(0, 6);
      const trialRevokedId = 'ft-revoked-' + uuidv4().slice(0, 6);

      // Dados para teste ATIVO com clínica e usuário vinculados
      const activeTenantId = 'ten-active-' + uuidv4().slice(0, 6);
      const activeUserId = 'usr-active-' + uuidv4().slice(0, 6);

      db.prepare(`INSERT INTO tenants (id, name, slug, email, status, created_at, updated_at) VALUES (?, 'Clínica Teste Ativo', 'clinica-ativo', 'ativo@test.com', 'active', ?, ?)`).run(
        activeTenantId, nowIso, nowIso
      );
      db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, created_at, updated_at) VALUES (?, ?, 'Dr. Ativo', 'ativo@test.com', 'hash', 'clinic_admin', 'active', ?, ?)`).run(
        activeUserId, activeTenantId, nowIso, nowIso
      );
      const pastIso = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
      const futureIso = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

      db.prepare(`INSERT INTO subscriptions (id, tenant_id, clinic_id, plan_id, status, current_period_start, current_period_end, created_at) VALUES (?, ?, ?, 'zemda-SOLO', 'trial', ?, ?, ?)`).run(
        uuidv4(), activeTenantId, activeTenantId, nowIso, futureIso, nowIso
      );

      // Inserir os 5 testes grátis
      db.prepare(`INSERT INTO free_trials (id, token, target_name, target_email, duration_days, duration_label, status, created_by, created_at, link_expires_at) VALUES (?, 'tok-pending', 'Cliente Pendente', 'pending@test.com', 30, '30 dias', 'pending', ?, ?, ?)`).run(
        trialPendingId, superAdminId, nowIso, futureIso
      );

      db.prepare(`INSERT INTO free_trials (id, token, target_name, target_email, duration_days, duration_label, status, created_by, created_at, link_expires_at, activated_at, trial_end_at, tenant_id, user_id) VALUES (?, 'tok-active', 'Cliente Ativo', 'ativo@test.com', 30, '30 dias', 'active', ?, ?, ?, ?, ?, ?, ?)`).run(
        trialActiveId, superAdminId, nowIso, futureIso, nowIso, futureIso, activeTenantId, activeUserId
      );

      db.prepare(`INSERT INTO free_trials (id, token, target_name, target_email, duration_days, duration_label, status, created_by, created_at, link_expires_at) VALUES (?, 'tok-expired', 'Cliente Expirado', 'expired@test.com', 7, '7 dias', 'pending', ?, ?, ?)`).run(
        trialExpiredId, superAdminId, pastIso, pastIso
      ); // link_expires_at no passado -> computed status = expired

      db.prepare(`INSERT INTO free_trials (id, token, target_name, target_email, duration_days, duration_label, status, created_by, created_at, link_expires_at, activated_at, trial_end_at, tenant_id, user_id) VALUES (?, 'tok-ended', 'Cliente Encerrado', 'ended@test.com', 15, '15 dias', 'active', ?, ?, ?, ?, ?, ?, ?)`).run(
        trialEndedId, superAdminId, pastIso, pastIso, pastIso, pastIso, activeTenantId, activeUserId
      ); // trial_end_at no passado -> computed status = ended

      db.prepare(`INSERT INTO free_trials (id, token, target_name, target_email, duration_days, duration_label, status, created_by, created_at, link_expires_at, revoked_at, revoked_by) VALUES (?, 'tok-revoked', 'Cliente Revogado', 'revoked@test.com', 30, '30 dias', 'revoked', ?, ?, ?, ?, ?)`).run(
        trialRevokedId, superAdminId, nowIso, futureIso, nowIso, superAdminId
      );

      console.log('--- 1. Validar listagem inicial e métricas ---');
      const listBefore = await makeRequest('GET', '/v1/admin/free-trials', superHeaders);
      assert(listBefore.status === 200, 'GET /v1/admin/free-trials status 200');
      assert(listBefore.body.trials.length === 5, '5 testes grátis retornados na listagem');
      assert(listBefore.body.summary.total === 5, 'Total do sumário = 5');
      assert(listBefore.body.summary.pending === 1, 'Sumário pending = 1');
      assert(listBefore.body.summary.active === 1, 'Sumário active = 1');
      assert(listBefore.body.summary.expired === 1, 'Sumário expired = 1');
      assert(listBefore.body.summary.ended === 1, 'Sumário ended = 1');
      assert(listBefore.body.summary.revoked === 1, 'Sumário revoked = 1');

      console.log('\n--- 2. Segurança: Tentar excluir como usuário não-superadmin ---');
      const nonAdminDel = await makeRequest('DELETE', `/v1/admin/free-trials/${trialPendingId}`, regularHeaders);
      assert(nonAdminDel.status === 403, 'Acesso bloqueado com 403 para não-superadmin');

      console.log('\n--- 3. Excluir teste em status PENDENTE (Aguardando) ---');
      const delPending = await makeRequest('DELETE', `/v1/admin/free-trials/${trialPendingId}`, superHeaders);
      assert(delPending.status === 200, 'Exclusão de teste pendente retornou 200');
      const checkPending = db.prepare('SELECT * FROM free_trials WHERE id = ?').get(trialPendingId);
      assert(!checkPending, 'Registro pendente removido da tabela free_trials');

      console.log('\n--- 4. Excluir teste em status ATIVO (Sem afetar tenant/usuário/clínica) ---');
      const delActive = await makeRequest('DELETE', `/v1/admin/free-trials/${trialActiveId}`, superHeaders);
      assert(delActive.status === 200, 'Exclusão de teste ativo retornou 200');
      const checkActiveTrial = db.prepare('SELECT * FROM free_trials WHERE id = ?').get(trialActiveId);
      assert(!checkActiveTrial, 'Registro do teste ativo removido de free_trials');
      const checkTenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(activeTenantId);
      assert(Boolean(checkTenant), 'IMPORTANTE: Tenant / Clínica criada PERMANECE INTACTA no banco');
      const checkUser = db.prepare('SELECT * FROM users WHERE id = ?').get(activeUserId);
      assert(Boolean(checkUser), 'IMPORTANTE: Usuário gestor PERMANECE INTACTO no banco');
      const checkSub = db.prepare('SELECT * FROM subscriptions WHERE tenant_id = ?').get(activeTenantId);
      assert(Boolean(checkSub), 'IMPORTANTE: Assinatura PERMANECE INTACTA no banco');

      console.log('\n--- 5. Excluir teste em status EXPIRADO ---');
      const delExpired = await makeRequest('DELETE', `/v1/admin/free-trials/${trialExpiredId}`, superHeaders);
      assert(delExpired.status === 200, 'Exclusão de teste expirado retornou 200');
      const checkExpired = db.prepare('SELECT * FROM free_trials WHERE id = ?').get(trialExpiredId);
      assert(!checkExpired, 'Registro expirado removido de free_trials');

      console.log('\n--- 6. Excluir teste em status ENCERRADO ---');
      const delEnded = await makeRequest('DELETE', `/v1/admin/free-trials/${trialEndedId}`, superHeaders);
      assert(delEnded.status === 200, 'Exclusão de teste encerrado retornou 200');
      const checkEnded = db.prepare('SELECT * FROM free_trials WHERE id = ?').get(trialEndedId);
      assert(!checkEnded, 'Registro encerrado removido de free_trials');

      console.log('\n--- 7. Excluir teste em status REVOGADO ---');
      const delRevoked = await makeRequest('DELETE', `/v1/admin/free-trials/${trialRevokedId}`, superHeaders);
      assert(delRevoked.status === 200, 'Exclusão de teste revogado retornou 200');
      const checkRevoked = db.prepare('SELECT * FROM free_trials WHERE id = ?').get(trialRevokedId);
      assert(!checkRevoked, 'Registro revogado removido de free_trials');

      console.log('\n--- 8. Validar atualização imediata de métricas após todas as exclusões ---');
      const listAfter = await makeRequest('GET', '/v1/admin/free-trials', superHeaders);
      assert(listAfter.status === 200, 'GET /v1/admin/free-trials status 200');
      assert(listAfter.body.trials.length === 0, 'Lista agora vazia (0 testes)');
      assert(listAfter.body.summary.total === 0, 'Sumário total atualizado = 0');
      assert(listAfter.body.summary.pending === 0, 'Sumário pending atualizado = 0');
      assert(listAfter.body.summary.active === 0, 'Sumário active atualizado = 0');
      assert(listAfter.body.summary.expired === 0, 'Sumário expired atualizado = 0');
      assert(listAfter.body.summary.ended === 0, 'Sumário ended atualizado = 0');
      assert(listAfter.body.summary.revoked === 0, 'Sumário revoked atualizado = 0');

      console.log('\n--- 9. Verificar registro em logs de auditoria (DELETE_FREE_TRIAL) ---');
      const auditLogs = db.prepare("SELECT * FROM audit_logs WHERE action = 'DELETE_FREE_TRIAL'").all();
      assert(auditLogs.length === 5, '5 eventos DELETE_FREE_TRIAL registrados na tabela audit_logs');

      console.log('\n===============================================================');
      console.log(`TESTES FINALIZADOS: ${passed} APROVADOS, ${failed} FALHAS`);
      console.log('===============================================================');

      server.close();
      if (failed > 0) process.exit(1);
      process.exit(0);
    } catch (err) {
      console.error('\n❌ ERRO NA EXECUÇÃO DO TESTE:', err);
      server.close();
      process.exit(1);
    }
  });
}

runTests();
