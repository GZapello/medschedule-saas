// Autorização do responsável por menores (LGPD art. 14): o sistema só registra a autorização
// quando ela é informada; edições preservam o valor já registrado; o agendamento público não a presume.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

if (!process.env.DATABASE_PATH) {
  process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-guardian-')), 'test.sqlite');
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-guardian-secret';

const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();
const { generateToken } = require('./dist/utils/jwt');

const TENANT = 'ten-guardian-test';
const ADMIN = 'usr-guardian-admin';
const PROFESSIONAL = 'pro-guardian-test';
const SERVICE = 'srv-guardian-test';

db.prepare(`INSERT INTO tenants (id, slug, name, email, status) VALUES (?, 'clinica-guardian-test', 'Clínica Teste Responsáveis', 'contato@guardian.test', 'active')`).run(TENANT);
db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES (?, ?, 'Gestora', 'gestora@guardian.test', 'x', 'clinic_admin', 'active')`).run(ADMIN, TENANT);
db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager) VALUES ('cu-guardian-admin', ?, ?, 'clinic_admin', 'active', 1)`).run(TENANT, ADMIN);
db.prepare(`INSERT INTO professionals (id, tenant_id, name, active) VALUES (?, ?, 'Dra. Teste', 1)`).run(PROFESSIONAL, TENANT);
db.prepare(`INSERT INTO services (id, tenant_id, name, duration_minutes, price, active) VALUES (?, ?, 'Avaliação Infantil', 50, 150, 1)`).run(SERVICE, TENANT);
for (let day = 0; day <= 6; day++) {
  db.prepare(`INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active) VALUES (?, ?, ?, ?, '08:00', '18:00', 1)`)
    .run(`sch-guardian-${day}`, TENANT, PROFESSIONAL, day);
}

const token = generateToken({ userId: ADMIN, tenantId: TENANT, role: 'clinic_admin', email: 'gestora@guardian.test', name: 'Gestora' });

const app = express();
app.use(express.json());
app.use('/api', require('./dist/routes').default);

const guardiansOf = (patientId) =>
  db.prepare('SELECT id, full_name, cpf, relationship, authorization_signed FROM guardians WHERE patient_id = ? ORDER BY full_name').all(patientId);

let passed = 0;
const check = async (label, fn) => { await fn(); passed++; console.log(`  ✅ ${label}`); };

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, url, body, auth = true) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', Connection: 'close', ...(auth ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
  const createChild = async (name, guardian) => {
    const res = await call('POST', '/v1/patients', { fullName: name, phone: '(11) 98888-0000', isChild: true, guardians: [guardian] });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    return res.data.id;
  };

  try {
    let pending, authorized, notInformed;

    await check('Criação com authorizationSigned=false grava autorização pendente (0)', async () => {
      pending = await createChild('Criança Pendente', { fullName: 'Mãe Pendente', phone: '(11) 97777-0001', cpf: '111.111.111-11', relationship: 'mother', isPrimary: true, authorizationSigned: false });
      assert.equal(guardiansOf(pending)[0].authorization_signed, 0);
    });

    await check('Criação com authorizationSigned=true grava autorização registrada (1)', async () => {
      authorized = await createChild('Criança Autorizada', { fullName: 'Pai Autorizado', phone: '(11) 97777-0002', cpf: '222.222.222-22', relationship: 'father', isPrimary: true, authorizationSigned: true });
      assert.equal(guardiansOf(authorized)[0].authorization_signed, 1);
    });

    await check('Criação sem informar a autorização não a presume (0)', async () => {
      notInformed = await createChild('Criança Sem Campo', { fullName: 'Tutora Sem Campo', phone: '(11) 97777-0003', relationship: 'legal_guardian', isPrimary: true });
      assert.equal(guardiansOf(notInformed)[0].authorization_signed, 0);
    });

    await check('Edição sem o campo preserva a autorização já registrada e o id do responsável', async () => {
      const [before] = guardiansOf(authorized);
      const res = await call('PUT', `/v1/patients/${authorized}`, {
        fullName: 'Criança Autorizada', isChild: true,
        guardians: [{ fullName: 'Pai Autorizado', phone: '(11) 96666-0002', cpf: '222.222.222-22', relationship: 'father' }]
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      const [after] = guardiansOf(authorized);
      assert.equal(after.authorization_signed, 1);
      assert.equal(after.id, before.id);
    });

    await check('Edição sem o campo mantém pendente quem estava pendente (não vira 1)', async () => {
      const res = await call('PUT', `/v1/patients/${pending}`, { isChild: true, guardians: [{ fullName: 'Mãe Pendente', phone: '(11) 97777-0001', cpf: '111.111.111-11' }] });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal(guardiansOf(pending)[0].authorization_signed, 0);
    });

    await check('Edição sem parentesco mantém o parentesco anterior (antes: erro 500 e responsáveis apagados)', async () => {
      assert.equal(guardiansOf(pending)[0].relationship, 'mother');
    });

    await check('Responsável renomeado é reconhecido pelo CPF', async () => {
      await call('PUT', `/v1/patients/${authorized}`, { isChild: true, guardians: [{ fullName: 'Pai Autorizado da Silva', phone: '(11) 96666-0002', cpf: '22222222222' }] });
      assert.equal(guardiansOf(authorized)[0].authorization_signed, 1);
    });

    await check('Clínica confirma a autorização coletada (0 → 1)', async () => {
      await call('PUT', `/v1/patients/${pending}`, { isChild: true, guardians: [{ fullName: 'Mãe Pendente', phone: '(11) 97777-0001', authorizationSigned: true }] });
      assert.equal(guardiansOf(pending)[0].authorization_signed, 1);
    });

    await check('Clínica corrige uma autorização registrada por engano (1 → 0)', async () => {
      await call('PUT', `/v1/patients/${pending}`, { isChild: true, guardians: [{ fullName: 'Mãe Pendente', phone: '(11) 97777-0001', authorizationSigned: false }] });
      assert.equal(guardiansOf(pending)[0].authorization_signed, 0);
    });

    await check('Payload em snake_case (como devolvido pelo GET) é respeitado', async () => {
      const { data } = await call('GET', `/v1/patients/${notInformed}`);
      const guardians = data.guardians.map((g) => ({ ...g, authorization_signed: 1 }));
      await call('PUT', `/v1/patients/${notInformed}`, { isChild: true, guardians });
      assert.equal(guardiansOf(notInformed)[0].authorization_signed, 1);
    });

    await check('Novo responsável adicionado na edição começa pendente, sem afetar o existente', async () => {
      await call('PUT', `/v1/patients/${authorized}`, {
        isChild: true,
        guardians: [
          { fullName: 'Pai Autorizado da Silva', phone: '(11) 96666-0002', cpf: '222.222.222-22' },
          { fullName: 'Avó Nova', phone: '(11) 95555-0009', relationship: 'grandparent' }
        ]
      });
      const byName = Object.fromEntries(guardiansOf(authorized).map((g) => [g.full_name, [g.authorization_signed, g.relationship]]));
      assert.deepEqual(byName, { 'Avó Nova': [0, 'other'], 'Pai Autorizado da Silva': [1, 'father'] });
    });

    await check('Falha no meio da regravação não apaga os responsáveis existentes', async () => {
      db.exec(`CREATE TEMP TRIGGER falha_simulada BEFORE INSERT ON guardians WHEN NEW.full_name = 'FALHA'
               BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;`);
      try {
        const before = guardiansOf(authorized);
        const res = await call('PUT', `/v1/patients/${authorized}`, {
          isChild: true,
          guardians: [{ fullName: 'Pai Autorizado da Silva', phone: '(11) 96666-0002' }, { fullName: 'FALHA', phone: '(11) 90000-0000' }]
        });
        assert.equal(res.status, 500);
        assert.deepEqual(guardiansOf(authorized), before);
      } finally {
        db.exec('DROP TRIGGER falha_simulada');
      }
    });

    await check('Agendamento público de criança grava o responsável com autorização pendente (0)', async () => {
      const day = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const res = await call('POST', '/v1/public/appointments', {
        tenantSlug: 'clinica-guardian-test',
        professionalId: PROFESSIONAL,
        serviceId: SERVICE,
        startTime: `${day}T10:00:00`,
        endTime: `${day}T10:50:00`,
        newPatientData: { fullName: 'Criança do Site', phone: '(11) 94444-0000', isChild: true, guardianName: 'Responsável do Site', guardianPhone: '(11) 94444-0001' }
      }, false);
      assert.equal(res.status, 201, JSON.stringify(res.data));
      const patient = db.prepare("SELECT id FROM patients WHERE full_name = 'Criança do Site'").get();
      assert.equal(guardiansOf(patient.id)[0].authorization_signed, 0);
    });

    console.log(`\nRESULTADO: ${passed} verificações de autorização do responsável passaram.`);
  } catch (err) {
    console.error('❌ Falha no teste de autorização do responsável:', err);
    process.exitCode = 1;
  } finally {
    server.closeAllConnections();
    server.close();
  }
})();
