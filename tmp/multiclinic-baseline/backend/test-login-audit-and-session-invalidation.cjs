// Teste de auditoria de login falho (LGPD 6.3) e invalidação de sessão por usuário (LGPD 5.8).
//
// Cobre:
// 1. Login com senha errada gera audit_logs com ação de falha e o e-mail tentado,
//    mas NUNCA grava a senha usada na tentativa.
// 2. Login com sucesso continua funcionando e continua gravando seu audit_logs de sempre.
// 3. Ao trocar a própria senha (token A), o token A antigo deixa de autenticar,
//    mas um novo login (token B) funciona normalmente.
// 4. Um usuário DIFERENTE da MESMA clínica, autenticado antes da troca de senha do
//    primeiro usuário, NÃO é deslogado por essa troca (regressão-chave a evitar).
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

if (!process.env.DATABASE_PATH) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-login-audit-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'test.sqlite');
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-jwt-secret-login-audit';

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();
const { hashPassword } = require('./dist/utils/password');

const app = express();
app.use(express.json());
app.use('/api', require('./dist/routes').default);

let failures = 0;
function check(cond, msg) {
  if (cond) {
    console.log(`  ✅ ${msg}`);
  } else {
    failures++;
    console.log(`  ❌ ${msg}`);
  }
}

async function run() {
  const T = 'tenant-login-audit';
  const U1 = 'user-login-audit-1';
  const U2 = 'user-login-audit-2';
  const EMAIL1 = 'usuario1@login-audit.test';
  const EMAIL2 = 'usuario2@login-audit.test';
  const OLD_PASSWORD = 'SenhaAntiga123';
  const NEW_PASSWORD = 'SenhaNova456';

  db.prepare(`INSERT INTO tenants (id, slug, name, email, status) VALUES (?, 'clinica-login-audit', 'Clinica Login Audit', 'c@login-audit.test', 'active')`).run(T);

  const hash1 = await hashPassword(OLD_PASSWORD);
  const hash2 = await hashPassword('OutraSenha789');
  db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES (?, ?, 'Usuario Um', ?, ?, 'professional', 'active')`).run(U1, T, EMAIL1, hash1);
  db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES (?, ?, 'Usuario Dois', ?, ?, 'professional', 'active')`).run(U2, T, EMAIL2, hash2);
  db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager) VALUES ('cu-1', ?, ?, 'professional', 'active', 0)`).run(T, U1);
  db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager) VALUES ('cu-2', ?, ?, 'professional', 'active', 0)`).run(T, U2);

  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function post(p, body, token) {
    const headers = { 'Content-Type': 'application/json', Connection: 'close' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}${p}`, { method: 'POST', headers, body: JSON.stringify(body) });
    let json = null;
    try { json = await res.json(); } catch (_) {}
    return { status: res.status, body: json };
  }

  async function put(p, body, token) {
    const headers = { 'Content-Type': 'application/json', Connection: 'close' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}${p}`, { method: 'PUT', headers, body: JSON.stringify(body) });
    let json = null;
    try { json = await res.json(); } catch (_) {}
    return { status: res.status, body: json };
  }

  async function get(p, token) {
    const headers = { Connection: 'close' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}${p}`, { method: 'GET', headers });
    let json = null;
    try { json = await res.json(); } catch (_) {}
    return { status: res.status, body: json };
  }

  try {
    // ── 1. Login com senha errada: deve auditar e nunca gravar a senha ──────
    console.log('\n[1] Login com senha errada');
    const before = db.prepare("SELECT COUNT(*) as c FROM audit_logs WHERE action = 'LOGIN_FAILED'").get().c;
    const wrongAttempt = 'SenhaErradaXPTO999';
    const fail = await post('/v1/auth/login', { email: EMAIL1, password: wrongAttempt });
    check(fail.status === 401, `login com senha errada respondeu 401 (recebido ${fail.status})`);

    const after = db.prepare("SELECT * FROM audit_logs WHERE action = 'LOGIN_FAILED' ORDER BY rowid DESC LIMIT 1").get();
    check(!!after, 'audit_logs recebeu uma linha de LOGIN_FAILED');
    const countAfter = db.prepare("SELECT COUNT(*) as c FROM audit_logs WHERE action = 'LOGIN_FAILED'").get().c;
    check(countAfter === before + 1, `contagem de LOGIN_FAILED incrementou em 1 (antes=${before}, depois=${countAfter})`);
    check(after && after.details_json && after.details_json.includes(EMAIL1), 'details_json contém o e-mail tentado');
    check(after && !(after.details_json || '').includes(wrongAttempt), 'details_json NÃO contém a senha tentada');
    // Verifica em TODAS as colunas texto da linha, não só details_json.
    const rowStr = JSON.stringify(after);
    check(!rowStr.includes(wrongAttempt), 'nenhuma coluna da linha de auditoria contém a senha tentada');

    // ── 2. Login com sucesso continua funcionando e continua auditando ──────
    console.log('\n[2] Login com sucesso (usuário 1)');
    const loginCountBefore = db.prepare("SELECT COUNT(*) as c FROM audit_logs WHERE entity_id = ? AND action != 'LOGIN_FAILED'").get(U1).c;
    const ok1 = await post('/v1/auth/login', { email: EMAIL1, password: OLD_PASSWORD });
    check(ok1.status === 200, `login correto respondeu 200 (recebido ${ok1.status})`);
    const tokenA = ok1.body && ok1.body.token;
    check(!!tokenA, 'login correto retornou token');
    const loginCountAfter = db.prepare("SELECT COUNT(*) as c FROM audit_logs WHERE entity_id = ? AND action != 'LOGIN_FAILED'").get(U1).c;
    check(loginCountAfter === loginCountBefore + 1, `login correto gerou nova linha de auditoria de sucesso (antes=${loginCountBefore}, depois=${loginCountAfter})`);

    // Segundo usuário loga ANTES da troca de senha do usuário 1.
    console.log('\n[2b] Login com sucesso (usuário 2, mesma clínica)');
    const ok2 = await post('/v1/auth/login', { email: EMAIL2, password: 'OutraSenha789' });
    check(ok2.status === 200, `login do usuário 2 respondeu 200 (recebido ${ok2.status})`);
    const tokenB2 = ok2.body && ok2.body.token;
    check(!!tokenB2, 'login do usuário 2 retornou token');

    // Confirma que token A funciona antes da troca de senha.
    const meBefore = await get('/v1/auth/me', tokenA);
    check(meBefore.status === 200, `token A autentica /v1/auth/me antes da troca de senha (recebido ${meBefore.status})`);

    // ── 3. Troca da própria senha invalida o token A antigo ──────────────────
    console.log('\n[3] Usuário 1 troca a própria senha usando token A');
    const changeRes = await put('/v1/auth/profile/password', { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD }, tokenA);
    check(changeRes.status === 200, `troca de senha respondeu 200 (recebido ${changeRes.status})`);

    const meAfterOldToken = await get('/v1/auth/me', tokenA);
    check(meAfterOldToken.status === 401 || meAfterOldToken.status === 403,
      `token A antigo deixou de autenticar após a troca de senha (recebido ${meAfterOldToken.status})`);

    // Login novo (token B) deve funcionar com a nova senha.
    const ok1New = await post('/v1/auth/login', { email: EMAIL1, password: NEW_PASSWORD });
    check(ok1New.status === 200, `novo login com a senha nova respondeu 200 (recebido ${ok1New.status})`);
    const tokenBNew = ok1New.body && ok1New.body.token;
    check(!!tokenBNew, 'novo login retornou token novo');
    const meNewToken = await get('/v1/auth/me', tokenBNew);
    check(meNewToken.status === 200, `token novo (pós troca de senha) autentica normalmente (recebido ${meNewToken.status})`);

    // Se a troca de senha devolveu um token fresco, ele também deve continuar
    // funcionando (a sessão que fez a troca não precisa relogar).
    const freshTokenFromChange = changeRes.body && changeRes.body.token;
    if (freshTokenFromChange) {
      const meFresh = await get('/v1/auth/me', freshTokenFromChange);
      check(meFresh.status === 200, `token fresco retornado pela troca de senha continua autenticando (recebido ${meFresh.status})`);
    }

    // ── 4. Usuário 2 (mesma clínica) NÃO foi afetado pela troca do usuário 1 ─
    console.log('\n[4] Usuário 2 continua autenticado após a troca de senha do usuário 1');
    const meU2 = await get('/v1/auth/me', tokenB2);
    check(meU2.status === 200, `token do usuário 2 (emitido antes da troca) continua válido (recebido ${meU2.status})`);
  } catch (err) {
    failures++;
    console.error('❌ Erro inesperado no teste:', err);
  } finally {
    server.closeAllConnections();
    server.close();
  }

  if (failures > 0) {
    console.log(`\n❌ ${failures} verificação(ões) falharam.`);
    process.exitCode = 1;
  } else {
    console.log('\n✅ Auditoria de login falho e invalidação de sessão por usuário verificadas com sucesso.');
  }
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
