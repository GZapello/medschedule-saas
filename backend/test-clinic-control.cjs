// Run after npm run build. Uses only a fresh temporary database and upload directory.
const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-control-'));
process.env.DATABASE_PATH = path.join(temp, 'test.db');
process.env.CLINIC_UPLOAD_ROOT = path.join(temp, 'uploads');
const { db, initializeDatabase } = require('./dist/config/database');
// Exercise upgrade from the legacy CHECK that does not allow banned.
db.exec(fs.readFileSync(path.join(__dirname,'src/config/schema.sql'),'utf8').replace("'suspended', 'banned'", "'suspended'"));
initializeDatabase();
initializeDatabase();
const bcrypt = require('bcryptjs');
const { generateToken } = require('./dist/utils/jwt');
const { NotificationService } = require('./dist/services/notification.service');
const express = require('express'); const app = express(); app.use(express.json()); app.use('/api', require('./dist/routes').default);
const quote = s => '"' + s.replaceAll('"', '""') + '"';
const tableNames = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(t => t.name);
const inserted = new Set();
function fixture(table, clinic) {
  const id = `${clinic}-${table}`; if (inserted.has(id)) return id;
  inserted.add(id);
  const cols = db.prepare(`PRAGMA table_info(${quote(table)})`).all();
  const foreign = db.prepare(`PRAGMA foreign_key_list(${quote(table)})`).all();
  const sql = db.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(table).sql;
  const values = { id };
  for (const c of cols) {
    if (c.name === 'id') continue;
    if (c.name === 'tenant_id') { values[c.name] = clinic; continue; }
    if (!c.notnull || c.dflt_value !== null) continue;
    const fk = foreign.find(f => f.from === c.name);
    if (fk) values[c.name] = fk.table === 'tenants' ? clinic : fixture(fk.table, clinic);
    else if (c.name === 'file_url') values[c.name] = 'data:text/plain;base64,WA==';
    else if (c.type.includes('INT') || c.type.includes('REAL')) values[c.name] = 1;
    else values[c.name] = `${id}-${c.name}`;
    const match = sql.match(new RegExp(`CHECK\\s*\\(\\s*${c.name}\\s+IN\\s*\\(\\s*'([^']+)'`, 'i'));
    if (match) values[c.name] = match[1];
  }
  if (table === 'users') Object.assign(values, { email: `${id}@test.invalid`.toLowerCase(), role: 'clinic_admin', status: 'active', password_hash: bcrypt.hashSync('test-password', 4) });
  if (table === 'clinic_users') values.status = 'active';
  try { db.prepare(`INSERT INTO ${quote(table)} (${Object.keys(values).map(quote).join(',')}) VALUES (${Object.keys(values).map(() => '?').join(',')})`).run(...Object.values(values)); }
  catch (e) { throw new Error(`Fixture ${table}: ${e.message}`); }
  return id;
}
for (const clinic of ['A', 'B']) {
  db.prepare("INSERT INTO tenants (id,slug,name,email,status) VALUES (?,?,?,?,'active')").run(clinic, clinic, clinic, `${clinic}@test.invalid`);
  for (const table of tableNames) {
    if (['tenants', 'global_clinic_audit', 'clinic_deletion_jobs'].includes(table)) continue;
    if (db.prepare(`PRAGMA table_info(${quote(table)})`).all().some(c => c.name === 'tenant_id')) fixture(table, clinic);
  }
  for (const table of ['professional_services', 'appointment_status_history', 'support_ticket_messages']) fixture(table, clinic);
}
db.prepare("INSERT INTO users (id,name,email,password_hash,role,status) VALUES ('root','Root','root@test.invalid',?,'superadmin','active')").run(bcrypt.hashSync('admin-password', 4));
db.prepare("INSERT INTO users (id,tenant_id,name,email,password_hash,role,status) VALUES ('shared','A','Shared','shared@test.invalid',?,'professional','active')").run(bcrypt.hashSync('shared-password', 4));
for (const clinic of ['A','B']) db.prepare("INSERT INTO clinic_users (id,tenant_id,user_id,role,status) VALUES (?,?,'shared','professional','active')").run(`shared-${clinic}`,clinic);
const token = (id, tenant, role) => generateToken({userId:id,tenantId:tenant,role,email:`${id}@test.invalid`,name:id});
const adminToken = token('root', null, 'superadmin');
const memberToken = token('A-users','A','clinic_admin');
let server;
(async () => {
  server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening',r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (suffix, body, auth = adminToken, method = 'PUT') => {
    const result = await fetch(base + suffix, {method, headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth}`},body:method === 'GET' ? undefined : JSON.stringify(body)});
    return { status: result.status, body: await result.json() };
  };
  const control = (action, body, auth, method) => call(`/v1/admin/tenants/A/${action}`, body, auth, method);
  const deletion = (body={}, auth=adminToken) => control('delete-permanently',{reason:'test', confirmation:'EXCLUIR',password:'admin-password',...body},auth,'POST');
  assert.equal((await deletion({password:'wrong'})).status,403);
  assert.equal((await deletion({confirmation:'excluir'})).status,400);
  assert.equal((await deletion({reason:'  '})).status,400);
  assert.equal((await deletion({},memberToken)).status,403);
  assert.equal((await call('/v1/staff/A-users/role-profession',{role:'superadmin'},memberToken)).status,403);
  assert.equal((await call('/v1/staff/invites',{role:'superadmin'},memberToken,'POST')).status,403);
  for (const role of ['professional','receptionist','patient']) {
    db.prepare('UPDATE users SET role=? WHERE id=?').run(role,'A-users');
    assert.equal((await deletion({},token('A-users','A',role))).status,403);
  }
  db.prepare("UPDATE users SET role='clinic_admin' WHERE id='A-users'").run();
  assert.equal((await control('ban',{reason:'moderation'})).status,200);
  assert.equal((await call('/v1/auth/login',{email:'a-users@test.invalid',password:'test-password'},adminToken,'POST')).status,403);
  assert.equal((await call('/v1/auth/me',{},memberToken,'GET')).status,403);
  assert.equal((await control('approve',{})).status,409);
  assert.equal((await control('unblock',{})).status,409);
  assert.equal(db.prepare("SELECT status FROM users WHERE id='A-users'").get().status,'active');
  assert.equal((await control('unban',{})).status,200);
  assert.equal((await call('/v1/auth/me',{},memberToken,'GET')).status,403,'old token stays invalid');
  assert.equal((await call('/v1/auth/me',{},token('A-users','A','clinic_admin'),'GET')).status,200);
  assert.equal((await control('toggle-registrations',{blocked:true})).status,200);
  db.prepare("UPDATE clinic_invites SET token='test-invite', expires_at='2099-01-01', status='pending' WHERE tenant_id='A'").run();
  assert.equal((await call('/v1/public/invites/test-invite',{},adminToken,'GET')).status,403);
  const registration = {tenantId:'A',name:'New',email:'new@test.invalid',password:'password123'};
  assert.equal((await call('/v1/auth/register',registration,adminToken,'POST')).status,403);
  assert.equal((await control('toggle-registrations',{blocked:false})).status,200);
  assert.equal((await call('/v1/public/invites/test-invite',{},adminToken,'GET')).status,200);
  assert.equal(db.prepare("SELECT registrations_blocked FROM tenants WHERE id='A'").get().registrations_blocked,0);
  // A cross-clinic FK must fail without changing either clinic.
  db.prepare("UPDATE documents SET record_id='A-records' WHERE id='B-documents'").run();
  assert.equal((await deletion()).status,500);
  assert.ok(db.prepare("SELECT id FROM patients WHERE tenant_id='A'").get());
  db.prepare("UPDATE documents SET record_id=NULL WHERE id='B-documents'").run();
  const otherSnapshot = () => JSON.stringify(tableNames.filter(t=>!['global_clinic_audit','clinic_deletion_jobs'].includes(t)).map(t=>[t,db.prepare(`SELECT * FROM ${quote(t)} ORDER BY rowid`).all().filter(r=>r.id !== 'shared' && (r.tenant_id==='B'||r.id==='B'||String(r.id).startsWith('B-')))]));
  const before = otherSnapshot();
  fs.mkdirSync(path.join(process.env.CLINIC_UPLOAD_ROOT,'A'),{recursive:true});
  fs.writeFileSync(path.join(process.env.CLINIC_UPLOAD_ROOT,'A','exam.txt'),'test');
  db.prepare("UPDATE documents SET file_url='/uploads/A/exam.txt' WHERE id='A-documents'").run();
  // Inject database failure: every earlier delete and audit must roll back.
  db.exec("CREATE TRIGGER fail_purge BEFORE DELETE ON patients WHEN OLD.tenant_id='A' BEGIN SELECT RAISE(ABORT,'injected'); END");
  assert.equal((await deletion()).status,500);
  assert.ok(fs.existsSync(path.join(process.env.CLINIC_UPLOAD_ROOT,'A','exam.txt')));
  assert.ok(db.prepare("SELECT id FROM records WHERE tenant_id='A'").get());
  db.exec('DROP TRIGGER fail_purge');
  const originalUnlink = fs.unlinkSync;
  fs.unlinkSync = () => { throw new Error('injected file cleanup failure'); };
  try { assert.equal((await deletion()).status,500); } finally { fs.unlinkSync = originalUnlink; }
  assert.ok(db.prepare("SELECT clinic_id FROM clinic_deletion_jobs WHERE clinic_id='A'").get());
  assert.equal(db.prepare("SELECT id FROM global_clinic_audit WHERE clinic_id='A' AND action='DELETE_COMPLETED'").get(),undefined);
  const pendingList = await call('/v1/tenants',{},adminToken,'GET');
  assert.ok(pendingList.body.some(t=>t.id==='A' && t.status==='cleanup_pending'));
  const result = await deletion(); assert.equal(result.status,200,JSON.stringify(result));
  assert.equal(otherSnapshot(),before,'all other clinic rows intact');
  for(const table of tableNames) if(db.prepare(`PRAGMA table_info(${quote(table)})`).all().some(c=>c.name==='tenant_id')) assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${quote(table)} WHERE tenant_id='A'`).get().n,0,table);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  assert.equal(db.prepare("SELECT id FROM users WHERE id='A-users'").get(),undefined);
  assert.equal(db.prepare("SELECT tenant_id FROM users WHERE id='shared'").get().tenant_id,'B');
  assert.ok(!fs.existsSync(path.join(process.env.CLINIC_UPLOAD_ROOT,'A','exam.txt')));
  assert.equal((await call('/v1/auth/me',{},memberToken,'GET')).status,401);
  assert.equal(await NotificationService.processPendingQueue(),0);
  const audit = db.prepare("SELECT * FROM global_clinic_audit WHERE clinic_id='A' AND action='DELETE_COMPLETED'").get();
  assert.equal(audit.reauthenticated,1); assert.ok(!JSON.stringify(audit).includes('admin-password'));
  console.log(`PASS: controls, reauthentication, RBAC, rollback, session invalidation, files, ${tableNames.length} tables, shared user and clinic B isolation. Database: ${process.env.DATABASE_PATH}`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server?.close());
