/**
 * Test suite for SuperAdmin clinic purge with consent immutability handling.
 * Validates:
 * A) Excluir clínica sem consentimentos -> funciona.
 * B) Excluir clínica com termo aguardando assinatura -> funciona.
 * C) Excluir clínica com termo assinado -> funciona.
 * D) Excluir clínica com assinatura + OTP + foto -> funciona.
 * E) Templates globais Zemda permanecem.
 * F) Dados de outras clínicas permanecem.
 * G) Tentar excluir diretamente um consentimento assinado fora do purge -> retorna CONSENT_IMMUTABLE.
 * H) PRAGMA foreign_key_check sem erros após o purge.
 * I) Clínica desaparece da lista do SuperAdmin após exclusão.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-purge-consents-'));
process.env.DATABASE_PATH = path.join(temp, 'test.db');
process.env.CLINIC_UPLOAD_ROOT = path.join(temp, 'uploads');
process.env.R2_MOCK_STORAGE = 'true';
process.env.JWT_SECRET = 'test-secret-purge-consents';

const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();

const bcrypt = require('bcryptjs');
const { generateToken } = require('./dist/utils/jwt');
const express = require('express');
const app = express();
app.use(express.json());
app.use('/api', require('./dist/routes').default);

const now = new Date().toISOString();

// 1. Inserir SuperAdmin e usuário de teste
db.prepare("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ('root', 'Super Admin', 'root@zemda.test', ?, 'superadmin', 'active')")
  .run(bcrypt.hashSync('admin-password', 4));
const adminToken = generateToken({ userId: 'root', tenantId: null, role: 'superadmin', email: 'root@zemda.test', name: 'Super Admin' });

// Contagem inicial de templates globais Zemda
const initialGlobalTemplates = db.prepare("SELECT COUNT(*) AS c FROM consent_templates WHERE tenant_id IS NULL").get().c;
const initialGlobalVersions = db.prepare("SELECT COUNT(*) AS c FROM consent_template_versions v JOIN consent_templates t ON t.id = v.template_id WHERE t.tenant_id IS NULL").get().c;
assert.ok(initialGlobalTemplates > 0, 'Templates globais padrão do Zemda devem existir inicialmente');
assert.ok(initialGlobalVersions > 0, 'Versões dos templates globais do Zemda devem existir inicialmente');

// 2. Setup Clínica A: sem consentimentos (Test A)
db.prepare("INSERT INTO tenants (id, slug, name, email, status) VALUES ('clinic-a', 'clinic-a', 'Clínica A Sem Consentimento', 'a@test.invalid', 'active')").run();
db.prepare("INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES ('user-a', 'clinic-a', 'Admin A', 'a-admin@test.invalid', ?, 'clinic_admin', 'active')")
  .run(bcrypt.hashSync('user-pass', 4));
db.prepare("INSERT INTO patients (id, tenant_id, full_name, phone, email, active) VALUES ('patient-a', 'clinic-a', 'Paciente A', '11999990001', 'paciente-a@test.invalid', 1)").run();

// 3. Setup Clínica B: controle de isolamento (Test F e G)
db.prepare("INSERT INTO tenants (id, slug, name, email, status) VALUES ('clinic-b', 'clinic-b', 'Clínica B Controle Outra Clínica', 'b@test.invalid', 'active')").run();
db.prepare("INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES ('user-b', 'clinic-b', 'Admin B', 'b-admin@test.invalid', ?, 'clinic_admin', 'active')")
  .run(bcrypt.hashSync('user-pass', 4));
db.prepare("INSERT INTO patients (id, tenant_id, full_name, phone, email, active) VALUES ('patient-b', 'clinic-b', 'Paciente B', '11999990002', 'paciente-b@test.invalid', 1)").run();
db.prepare(`
  INSERT INTO patient_consents (id, tenant_id, patient_id, consent_type, template_id, template_version_id, title, content_text, version, document_hash, status, created_at)
  VALUES ('consent-signed-b', 'clinic-b', 'patient-b', 'treatment', 'consent-standard-general', 'consent-standard-general-v1', 'Termo B', 'Conteúdo B', '1.0', 'hash-b', 'signed', ?)
`).run(now);
db.prepare(`
  INSERT INTO consent_signatures (id, consent_id, verification_code, evidence_json, evidence_hash, signature_data_url, photo_data_url, signed_at)
  VALUES ('sig-b', 'consent-signed-b', 'ZMD-B-999', '{"ip":"127.0.0.1"}', 'evhash-b', 'data:image/png;base64,AAA', 'data:image/jpeg;base64,BBB', ?)
`).run(now);
db.prepare(`
  INSERT INTO consent_audit_logs (id, tenant_id, consent_id, action, actor_id, ip_address, user_agent, details_json, created_at)
  VALUES ('audit-b', 'clinic-b', 'consent-signed-b', 'signed', 'user-b', '127.0.0.1', 'Jest', '{}', ?)
`).run(now);

// 4. Setup Clínica C: termo aguardando assinatura (Test B)
db.prepare("INSERT INTO tenants (id, slug, name, email, status) VALUES ('clinic-c', 'clinic-c', 'Clínica C Aguardando Assinatura', 'c@test.invalid', 'active')").run();
db.prepare("INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES ('user-c', 'clinic-c', 'Admin C', 'c-admin@test.invalid', ?, 'clinic_admin', 'active')")
  .run(bcrypt.hashSync('user-pass', 4));
db.prepare("INSERT INTO patients (id, tenant_id, full_name, phone, email, active) VALUES ('patient-c', 'clinic-c', 'Paciente C', '11999990003', 'paciente-c@test.invalid', 1)").run();
db.prepare(`
  INSERT INTO patient_consents (id, tenant_id, patient_id, consent_type, template_id, template_version_id, title, content_text, version, status, created_at)
  VALUES ('consent-pending-c', 'clinic-c', 'patient-c', 'treatment', 'consent-standard-general', 'consent-standard-general-v1', 'Termo C', 'Conteúdo C', '1.0', 'pending', ?)
`).run(now);
db.prepare(`
  INSERT INTO consent_access_tokens (id, consent_id, token_hash, expires_at, created_at)
  VALUES ('token-c', 'consent-pending-c', 'thash-c-12345', ?, ?)
`).run(new Date(Date.now() + 86400000).toISOString(), now);
db.prepare(`
  INSERT INTO consent_audit_logs (id, tenant_id, consent_id, action, actor_id, ip_address, user_agent, details_json, created_at)
  VALUES ('audit-c', 'clinic-c', 'consent-pending-c', 'created', 'user-c', '127.0.0.1', 'Node', '{}', ?)
`).run(now);

// 5. Setup Clínica D: termo assinado (Test C)
db.prepare("INSERT INTO tenants (id, slug, name, email, status) VALUES ('clinic-d', 'clinic-d', 'Clínica D Termo Assinado', 'd@test.invalid', 'active')").run();
db.prepare("INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES ('user-d', 'clinic-d', 'Admin D', 'd-admin@test.invalid', ?, 'clinic_admin', 'active')")
  .run(bcrypt.hashSync('user-pass', 4));
db.prepare("INSERT INTO patients (id, tenant_id, full_name, phone, email, active) VALUES ('patient-d', 'clinic-d', 'Paciente D', '11999990004', 'paciente-d@test.invalid', 1)").run();
db.prepare(`
  INSERT INTO patient_consents (id, tenant_id, patient_id, consent_type, template_id, template_version_id, title, content_text, version, document_hash, signer_json, status, created_at)
  VALUES ('consent-signed-d', 'clinic-d', 'patient-d', 'treatment', 'consent-standard-general', 'consent-standard-general-v1', 'Termo D Assinado', 'Conteúdo D', '1.0', 'dochash-d', '{"name":"Paciente D"}', 'signed', ?)
`).run(now);
db.prepare(`
  INSERT INTO consent_signatures (id, consent_id, verification_code, evidence_json, evidence_hash, signature_data_url, signed_at)
  VALUES ('sig-d', 'consent-signed-d', 'ZMD-D-555', '{"signed":true}', 'evhash-d', 'data:image/png;base64,SIGD', ?)
`).run(now);
db.prepare(`
  INSERT INTO consent_audit_logs (id, tenant_id, consent_id, action, actor_id, ip_address, user_agent, details_json, created_at)
  VALUES ('audit-d', 'clinic-d', 'consent-signed-d', 'signed', 'user-d', '127.0.0.1', 'Node', '{}', ?)
`).run(now);

// 6. Setup Clínica E: assinatura + OTP + foto + template customizado (Test D)
db.prepare("INSERT INTO tenants (id, slug, name, email, status) VALUES ('clinic-e', 'clinic-e', 'Clínica E OTP e Foto', 'e@test.invalid', 'active')").run();
db.prepare("INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES ('user-e', 'clinic-e', 'Admin E', 'e-admin@test.invalid', ?, 'clinic_admin', 'active')")
  .run(bcrypt.hashSync('user-pass', 4));
db.prepare("INSERT INTO patients (id, tenant_id, full_name, phone, email, active) VALUES ('patient-e', 'clinic-e', 'Paciente E', '11999990005', 'paciente-e@test.invalid', 1)").run();
db.prepare("INSERT INTO consent_settings (tenant_id, auth_level, link_hours, photo_requested) VALUES ('clinic-e', 'reinforced', 168, 1)").run();
db.prepare("INSERT INTO consent_templates (id, tenant_id, module, created_by, created_at) VALUES ('tpl-custom-e', 'clinic-e', 'general', 'user-e', ?)").run(now);
db.prepare("INSERT INTO consent_template_versions (id, template_id, version, title, content, content_hash, created_by, created_at) VALUES ('tpl-ver-e', 'tpl-custom-e', 1, 'Termo Customizado E', 'Conteúdo E detalhado', 'hash-e-custom', 'user-e', ?)").run(now);
db.prepare(`
  INSERT INTO patient_consents (id, tenant_id, patient_id, consent_type, template_id, template_version_id, title, content_text, version, document_hash, auth_level, signer_json, status, created_at)
  VALUES ('consent-signed-e', 'clinic-e', 'patient-e', 'treatment', 'tpl-custom-e', 'tpl-ver-e', 'Termo Customizado E', 'Conteúdo E detalhado', '1.0', 'dochash-e', 'reinforced', '{"name":"Paciente E"}', 'signed', ?)
`).run(now);
db.prepare(`
  INSERT INTO consent_access_tokens (id, consent_id, token_hash, otp_hash, otp_salt, otp_verified_at, expires_at, created_at)
  VALUES ('token-e', 'consent-signed-e', 'thash-e-999', 'otphash-e', 'salt-e', ?, ?, ?)
`).run(now, new Date(Date.now() + 86400000).toISOString(), now);
db.prepare(`
  INSERT INTO consent_signatures (id, consent_id, verification_code, evidence_json, evidence_hash, signature_data_url, photo_data_url, signed_at)
  VALUES ('sig-e', 'consent-signed-e', 'ZMD-E-777', '{"otpVerified":true,"photo":true}', 'evhash-e', 'data:image/png;base64,SIGE', 'data:image/jpeg;base64,PHOTOE', ?)
`).run(now);
db.prepare(`
  INSERT INTO consent_audit_logs (id, tenant_id, consent_id, action, actor_id, ip_address, user_agent, details_json, created_at)
  VALUES ('audit-e-1', 'clinic-e', 'consent-signed-e', 'created', 'user-e', '127.0.0.1', 'Node', '{}', ?)
`).run(now);
db.prepare(`
  INSERT INTO consent_audit_logs (id, tenant_id, consent_id, action, actor_id, ip_address, user_agent, details_json, created_at)
  VALUES ('audit-e-2', 'clinic-e', 'consent-signed-e', 'otp_requested', null, '127.0.0.1', 'Node', '{}', ?)
`).run(now);
db.prepare(`
  INSERT INTO consent_audit_logs (id, tenant_id, consent_id, action, actor_id, ip_address, user_agent, details_json, created_at)
  VALUES ('audit-e-3', 'clinic-e', 'consent-signed-e', 'signed', null, '127.0.0.1', 'Node', '{}', ?)
`).run(now);

let server;

(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const deleteClinic = async (clinicId, body = {}) => {
    const payload = {
      password: 'admin-password',
      confirmation: 'EXCLUIR',
      reason: 'Exclusão de teste administrativo',
      ...body
    };
    const res = await fetch(`${base}/v1/admin/tenants/${clinicId}/delete-permanently`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(payload)
    });
    return { status: res.status, body: await res.json() };
  };

  console.log('--- TESTE: Validação de segurança pré-purge ---');
  // Senha incorreta
  const failPassword = await deleteClinic('clinic-a', { password: 'wrong' });
  assert.equal(failPassword.status, 403);
  assert.match(failPassword.body.error, /Senha do Administrador inválida/);

  // Confirmação incorreta
  const failConfirm = await deleteClinic('clinic-a', { confirmation: 'excluir' });
  assert.equal(failConfirm.status, 400);
  assert.match(failConfirm.body.error, /EXCLUIR/);

  // Motivo ausente
  const failReason = await deleteClinic('clinic-a', { reason: '   ' });
  assert.equal(failReason.status, 400);
  assert.match(failReason.body.error, /motivo da exclusão definitiva é obrigatório/);

  console.log('--- TESTE A: Excluir clínica sem consentimentos ---');
  const resA = await deleteClinic('clinic-a');
  assert.equal(resA.status, 200, JSON.stringify(resA.body));
  assert.equal(db.prepare("SELECT id FROM tenants WHERE id = 'clinic-a'").get(), undefined);
  assert.equal(db.prepare("SELECT id FROM users WHERE tenant_id = 'clinic-a'").get(), undefined);
  assert.equal(db.prepare("SELECT id FROM patients WHERE tenant_id = 'clinic-a'").get(), undefined);
  console.log('[PASS] Teste A: Clínica sem consentimentos excluída com sucesso.');

  console.log('--- TESTE B: Excluir clínica com termo aguardando assinatura ---');
  const resB = await deleteClinic('clinic-c');
  assert.equal(resB.status, 200, JSON.stringify(resB.body));
  assert.equal(db.prepare("SELECT id FROM tenants WHERE id = 'clinic-c'").get(), undefined);
  assert.equal(db.prepare("SELECT id FROM patient_consents WHERE tenant_id = 'clinic-c'").get(), undefined);
  assert.equal(db.prepare("SELECT id FROM consent_access_tokens WHERE id = 'token-c'").get(), undefined);
  assert.equal(db.prepare("SELECT id FROM consent_audit_logs WHERE tenant_id = 'clinic-c'").get(), undefined);
  console.log('[PASS] Teste B: Clínica com termo pendente excluída com sucesso.');

  console.log('--- TESTE C: Excluir clínica com termo assinado ---');
  const resC = await deleteClinic('clinic-d');
  assert.equal(resC.status, 200, JSON.stringify(resC.body));
  assert.equal(db.prepare("SELECT id FROM tenants WHERE id = 'clinic-d'").get(), undefined);
  assert.equal(db.prepare("SELECT id FROM patient_consents WHERE tenant_id = 'clinic-d'").get(), undefined);
  assert.equal(db.prepare("SELECT id FROM consent_signatures WHERE id = 'sig-d'").get(), undefined);
  assert.equal(db.prepare("SELECT id FROM consent_audit_logs WHERE tenant_id = 'clinic-d'").get(), undefined);
  console.log('[PASS] Teste C: Clínica com termo assinado excluída com sucesso.');

  console.log('--- TESTE D: Excluir clínica com assinatura + OTP + foto ---');
  const resD = await deleteClinic('clinic-e');
  assert.equal(resD.status, 200, JSON.stringify(resD.body));
  assert.equal(db.prepare("SELECT id FROM tenants WHERE id = 'clinic-e'").get(), undefined);
  assert.equal(db.prepare("SELECT tenant_id FROM consent_settings WHERE tenant_id = 'clinic-e'").get(), undefined);
  assert.equal(db.prepare("SELECT id FROM consent_templates WHERE tenant_id = 'clinic-e'").get(), undefined);
  assert.equal(db.prepare("SELECT id FROM consent_template_versions WHERE id = 'tpl-ver-e'").get(), undefined);
  assert.equal(db.prepare("SELECT id FROM patient_consents WHERE tenant_id = 'clinic-e'").get(), undefined);
  assert.equal(db.prepare("SELECT id FROM consent_access_tokens WHERE id = 'token-e'").get(), undefined);
  assert.equal(db.prepare("SELECT id FROM consent_signatures WHERE id = 'sig-e'").get(), undefined);
  assert.equal(db.prepare("SELECT id FROM consent_audit_logs WHERE tenant_id = 'clinic-e'").get(), undefined);
  console.log('[PASS] Teste D: Clínica com assinatura + OTP + foto excluída com sucesso.');

  console.log('--- TESTE E: Templates globais Zemda permanecem ---');
  const currentGlobalTemplates = db.prepare("SELECT COUNT(*) AS c FROM consent_templates WHERE tenant_id IS NULL").get().c;
  const currentGlobalVersions = db.prepare("SELECT COUNT(*) AS c FROM consent_template_versions v JOIN consent_templates t ON t.id = v.template_id WHERE t.tenant_id IS NULL").get().c;
  assert.equal(currentGlobalTemplates, initialGlobalTemplates, 'Templates globais com tenant_id IS NULL não podem ser removidos');
  assert.equal(currentGlobalVersions, initialGlobalVersions, 'Versões globais de templates não podem ser removidas');
  console.log('[PASS] Teste E: Templates globais Zemda permanecem intactos.');

  console.log('--- TESTE F: Dados de outras clínicas permanecem ---');
  assert.ok(db.prepare("SELECT id FROM tenants WHERE id = 'clinic-b'").get(), 'Clínica B deve permanecer');
  assert.ok(db.prepare("SELECT id FROM users WHERE id = 'user-b'").get(), 'Usuário da Clínica B deve permanecer');
  assert.ok(db.prepare("SELECT id FROM patients WHERE id = 'patient-b'").get(), 'Paciente da Clínica B deve permanecer');
  assert.ok(db.prepare("SELECT id FROM patient_consents WHERE id = 'consent-signed-b'").get(), 'Consentimento da Clínica B deve permanecer');
  assert.ok(db.prepare("SELECT id FROM consent_signatures WHERE id = 'sig-b'").get(), 'Assinatura da Clínica B deve permanecer');
  assert.ok(db.prepare("SELECT id FROM consent_audit_logs WHERE id = 'audit-b'").get(), 'Audit log da Clínica B deve permanecer');
  console.log('[PASS] Teste F: Dados de outras clínicas permaneceram intactos.');

  console.log('--- TESTE G: Imutabilidade após purge fora do fluxo ---');
  // Tentativa de apagar assinatura diretamente -> DEVE FALHAR COM CONSENT_IMMUTABLE
  assert.throws(() => {
    db.prepare("DELETE FROM consent_signatures WHERE id = 'sig-b'").run();
  }, /CONSENT_IMMUTABLE/, 'DELETE direto em consent_signatures deve ser bloqueado por CONSENT_IMMUTABLE');

  // Tentativa de apagar consentimento assinado diretamente -> DEVE FALHAR COM CONSENT_IMMUTABLE
  assert.throws(() => {
    db.prepare("DELETE FROM patient_consents WHERE id = 'consent-signed-b'").run();
  }, /CONSENT_IMMUTABLE/, 'DELETE direto em patient_consents assinado deve ser bloqueado por CONSENT_IMMUTABLE');

  // Tentativa de alterar consentimento assinado diretamente -> DEVE FALHAR COM CONSENT_IMMUTABLE
  assert.throws(() => {
    db.prepare("UPDATE patient_consents SET title = 'Alterado Ilegal' WHERE id = 'consent-signed-b'").run();
  }, /CONSENT_IMMUTABLE/, 'UPDATE direto em patient_consents assinado deve ser bloqueado por CONSENT_IMMUTABLE');

  // Tentativa de apagar audit log de consentimento diretamente -> DEVE FALHAR COM CONSENT_IMMUTABLE
  assert.throws(() => {
    db.prepare("DELETE FROM consent_audit_logs WHERE id = 'audit-b'").run();
  }, /CONSENT_IMMUTABLE/, 'DELETE direto em consent_audit_logs deve ser bloqueado por CONSENT_IMMUTABLE');

  // Tentativa de apagar versão de template padrão -> DEVE FALHAR COM CONSENT_IMMUTABLE
  assert.throws(() => {
    db.prepare("DELETE FROM consent_template_versions WHERE id = 'consent-standard-general-v1'").run();
  }, /CONSENT_IMMUTABLE/, 'DELETE direto em consent_template_versions deve ser bloqueado por CONSENT_IMMUTABLE');
  console.log('[PASS] Teste G: Imutabilidade de consentimentos fora do purge permanece 100% ativa.');

  console.log('--- TESTE H: PRAGMA foreign_key_check sem erros ---');
  const fkErrors = db.prepare('PRAGMA foreign_key_check').all();
  assert.equal(fkErrors.length, 0, `Nenhum erro de chave estrangeira deve existir: ${JSON.stringify(fkErrors)}`);
  console.log('[PASS] Teste H: Integridade referencial intacta após purges.');

  console.log('--- TESTE I: Clínica desaparece da lista do SuperAdmin ---');
  const listRes = await fetch(`${base}/v1/tenants`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(listRes.status, 200);
  const listClinics = await listRes.json();
  const clinicIds = listClinics.map(c => c.id);
  assert.ok(!clinicIds.includes('clinic-a'), 'Clínica A não deve estar na lista');
  assert.ok(!clinicIds.includes('clinic-c'), 'Clínica C não deve estar na lista');
  assert.ok(!clinicIds.includes('clinic-d'), 'Clínica D não deve estar na lista');
  assert.ok(!clinicIds.includes('clinic-e'), 'Clínica E não deve estar na lista');
  assert.ok(clinicIds.includes('clinic-b'), 'Clínica B DEVE estar na lista');
  console.log('[PASS] Teste I: Clínicas excluídas desapareceram da listagem do SuperAdmin.');

  console.log('\n======================================================');
  console.log('TODOS OS TESTES OBRIGATÓRIOS (A-I) PASSARAM COM SUCESSO!');
  console.log('======================================================\n');
})().catch(err => {
  console.error('[ERRO TESTE PURGE]:', err);
  process.exitCode = 1;
}).finally(() => {
  server?.close();
  try {
    fs.rmSync(temp, { recursive: true, force: true });
  } catch (e) {}
});
