// Ativação de teste grátis precisa ser ATÔMICA:
//  (a) falha no meio da ativação (depois do hash da senha) não pode deixar linhas parciais
//      e o link continua ativável;
//  (b) duas ativações simultâneas do mesmo link => exatamente uma cria a clínica.
// Regressão do bug em que db.transaction recebia um callback async: tudo depois do
// primeiro await rodava fora da transação.
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const crypto = require('crypto');

if (!process.env.DATABASE_PATH) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-free-trial-atomic-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'test.sqlite');
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-jwt-secret-free-trial-atomic';

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const app = express();
app.use(express.json());
app.use('/api', require('./dist/routes').default);

let passed = 0;
let failed = 0;
function assert(cond, msg, extra) {
  if (cond) {
    console.log(`  ✅ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${msg}`, extra !== undefined ? JSON.stringify(extra) : '');
    failed++;
  }
}

function createTrialFixture(label) {
  const id = 'ft-' + crypto.randomUUID().slice(0, 8);
  const token = 'tok-' + label + '-' + crypto.randomBytes(8).toString('hex');
  const nowIso = new Date().toISOString();
  const linkExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO free_trials (
      id, token, target_name, target_email, duration_days, duration_label,
      status, created_by, created_at, link_expires_at, updated_at
    ) VALUES (?, ?, ?, NULL, 15, '15 dias', 'pending', 'usr-superadmin-teste', ?, ?, ?)
  `).run(id, token, 'Cliente ' + label, nowIso, linkExpiresAt, nowIso);
  // A coluna 'plan' pode não existir num banco recém-criado (migração roda antes do CREATE TABLE);
  // sem ela a ativação usa o padrão SOLO.
  try { db.prepare("UPDATE free_trials SET plan = 'SOLO' WHERE id = ?").run(id); } catch (_) {}
  return { id, token };
}

const count = (sql, ...params) => db.prepare(sql).get(...params).total;

async function main(baseUrl) {
  const profession = db.prepare('SELECT id FROM professions ORDER BY id LIMIT 1').get();
  const professionId = profession ? profession.id : 'prof-psicologo';

  const activate = async (token, email, clinicName) => {
    const res = await fetch(`${baseUrl}/api/v1/public/free-trials/activate/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Connection: 'close' },
      body: JSON.stringify({
        clinicName,
        managerName: 'Gestor Teste',
        managerEmail: email,
        managerPassword: 'senhaSegura123',
        managerPhone: '11999990000',
        professionId,
        termsAccepted: true,
        privacyAccepted: true
      })
    });
    let body = null;
    try { body = await res.json(); } catch (_) {}
    return { status: res.status, body };
  };

  console.log('===============================================================');
  console.log('ATIVAÇÃO DE TESTE GRÁTIS — ATOMICIDADE E CONCORRÊNCIA');
  console.log('===============================================================\n');

  // ---------------------------------------------------------------- (a)
  console.log('(a) Falha simulada depois do hash da senha não deixa dados parciais');
  const trialA = createTrialFixture('falha');
  const emailA = 'atomico-a@teste.com';

  db.exec("CREATE TEMP TRIGGER falha_simulada_subscriptions BEFORE INSERT ON subscriptions BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;");
  let resA;
  try {
    resA = await activate(trialA.token, emailA, 'Clínica Atômica');
  } finally {
    db.exec('DROP TRIGGER IF EXISTS temp.falha_simulada_subscriptions;');
  }

  assert(resA.status === 500, 'ativação com falha simulada responde 500', resA);
  assert(resA.body && resA.body.success === false && resA.body.code === 'INTERNAL_ERROR', 'corpo de erro mantém o contrato { success:false, code:INTERNAL_ERROR }', resA.body);

  const usersA = db.prepare('SELECT id FROM users WHERE email = ?').all(emailA);
  assert(usersA.length === 0, 'nenhum usuário criado para o e-mail', usersA);
  assert(count('SELECT COUNT(*) AS total FROM tenants WHERE email = ?', emailA) === 0, 'nenhum tenant criado para o e-mail');
  assert(count("SELECT COUNT(*) AS total FROM tenants WHERE name = 'Clínica Atômica'") === 0, 'nenhum tenant criado com o nome da clínica');
  assert(
    count("SELECT COUNT(*) AS total FROM clinic_users cu JOIN users u ON u.id = cu.user_id WHERE u.email = ?", emailA) === 0 &&
      count("SELECT COUNT(*) AS total FROM clinic_users WHERE tenant_id NOT IN (SELECT id FROM tenants)") === 0,
    'nenhum vínculo clinic_users criado'
  );
  assert(count("SELECT COUNT(*) AS total FROM professionals WHERE name = 'Gestor Teste'") === 0, 'nenhum profissional criado');
  assert(count('SELECT COUNT(*) AS total FROM subscriptions WHERE tenant_id NOT IN (SELECT id FROM tenants)') === 0 &&
    count("SELECT COUNT(*) AS total FROM subscriptions WHERE status = 'trial'") === 0, 'nenhuma assinatura criada');
  assert(count('SELECT COUNT(*) AS total FROM legal_acceptances') === 0, 'nenhum aceite legal registrado');

  const trialAfterFail = db.prepare('SELECT status, activated_at, tenant_id, user_id FROM free_trials WHERE id = ?').get(trialA.id);
  assert(
    trialAfterFail.status === 'pending' && !trialAfterFail.activated_at && !trialAfterFail.tenant_id && !trialAfterFail.user_id,
    'link continua pendente e não utilizado',
    trialAfterFail
  );

  const resA2 = await activate(trialA.token, emailA, 'Clínica Atômica');
  assert(resA2.status === 200 && resA2.body && resA2.body.success === true, 'sem o gatilho, o mesmo link ativa com sucesso', resA2);
  const trialAfterOk = db.prepare('SELECT status, activated_at, tenant_id, user_id FROM free_trials WHERE id = ?').get(trialA.id);
  assert(trialAfterOk.status === 'active' && trialAfterOk.activated_at && trialAfterOk.tenant_id, 'link marcado como ativo após sucesso', trialAfterOk);
  assert(count('SELECT COUNT(*) AS total FROM subscriptions WHERE tenant_id = ?', trialAfterOk.tenant_id) === 1, 'assinatura trial criada para o tenant');
  assert(count("SELECT COUNT(*) AS total FROM clinic_users WHERE tenant_id = ? AND is_manager = 1", trialAfterOk.tenant_id) === 1, 'vínculo de gestor criado');

  const resA3 = await activate(trialA.token, 'outro-a@teste.com', 'Outra Clínica');
  assert(resA3.status === 409 && resA3.body && resA3.body.code === 'LINK_ALREADY_USED', 'reusar link já ativado responde 409 LINK_ALREADY_USED', resA3);

  const resNF = await activate('tok-inexistente', 'nf@teste.com', 'Clínica NF');
  assert(resNF.status === 404 && resNF.body && resNF.body.code === 'LINK_NOT_FOUND', 'token inexistente responde 404 LINK_NOT_FOUND', resNF);

  const trialE = createTrialFixture('email');
  const resEmail = await activate(trialE.token, emailA, 'Clínica Email');
  assert(resEmail.status === 409 && resEmail.body && resEmail.body.code === 'EMAIL_ALREADY_EXISTS', 'e-mail já cadastrado responde 409 EMAIL_ALREADY_EXISTS', resEmail);

  // ---------------------------------------------------------------- (b)
  console.log('\n(b) Duas ativações simultâneas do mesmo link');
  const trialB = createTrialFixture('corrida');
  const [r1, r2] = await Promise.all([
    activate(trialB.token, 'corrida-1@teste.com', 'Clínica Corrida Um'),
    activate(trialB.token, 'corrida-2@teste.com', 'Clínica Corrida Dois')
  ]);
  const statuses = [r1.status, r2.status].sort();
  assert(statuses[0] === 200 && statuses[1] === 409, 'exatamente uma ativação com sucesso e uma rejeitada (409)', [r1, r2]);
  const loser = r1.status === 409 ? r1 : r2;
  assert(loser.body && loser.body.code === 'LINK_ALREADY_USED', 'a rejeitada retorna LINK_ALREADY_USED', loser.body);

  const raceTenants = count("SELECT COUNT(*) AS total FROM tenants WHERE email IN ('corrida-1@teste.com', 'corrida-2@teste.com')");
  const raceUsers = count("SELECT COUNT(*) AS total FROM users WHERE email IN ('corrida-1@teste.com', 'corrida-2@teste.com')");
  assert(raceTenants === 1, 'exatamente um tenant criado a partir do link', raceTenants);
  assert(raceUsers === 1, 'exatamente um usuário criado a partir do link', raceUsers);
  const trialBRow = db.prepare('SELECT status, tenant_id FROM free_trials WHERE id = ?').get(trialB.id);
  const winnerTenant = db.prepare("SELECT id FROM tenants WHERE email IN ('corrida-1@teste.com', 'corrida-2@teste.com')").get();
  assert(trialBRow.status === 'active' && winnerTenant && trialBRow.tenant_id === winnerTenant.id, 'link aponta para o tenant vencedor', { trialBRow, winnerTenant });
}

const server = app.listen(0, '127.0.0.1', async () => {
  const { port } = server.address();
  try {
    await main(`http://127.0.0.1:${port}`);
  } catch (err) {
    console.error('Erro inesperado no teste:', err);
    failed++;
  } finally {
    console.log(`\nResultado: ${passed} passaram, ${failed} falharam.`);
    if (failed > 0) process.exitCode = 1;
    server.closeAllConnections();
    server.close();
  }
});
