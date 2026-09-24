/**
 * LGPD 5.9 — controle de acesso a anexos clínicos (/v1/files/*).
 *
 * Prova que:
 *  - recepção/secretaria/financeiro/assistente/superadmin NÃO listam, NÃO geram URL assinada,
 *    NÃO excluem e NÃO enviam anexos vinculados a paciente (403);
 *  - profissional e gestor (clinic_admin) continuam com acesso;
 *  - visualização, exclusão, listagem e upload de anexo clínico geram audit_logs sem URL/token;
 *  - anexos NÃO clínicos (imagens de exercício, assets da clínica) continuam como antes.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

if (!process.env.DATABASE_PATH) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-file-rbac-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'test.sqlite');
}
process.env.R2_MOCK_STORAGE = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-jwt-secret-file-rbac';
process.env.ZEMDA_FILES_SIGNING_SECRET = process.env.ZEMDA_FILES_SIGNING_SECRET || 'test-only-files-signing-secret';

const http = require('http');
const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');
const express = require('express');

const app = express();
app.use(express.json());
app.use('/api', require('./dist/routes').default);

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failed++;
  }
}

const T = 'tenant-arq-rbac';
const P = 'pat-arq-rbac';

function addUser(id, role, name, email) {
  db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, 'x', ?, 'active')`).run(id, T, name, email, role);
  db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager) VALUES (?, ?, ?, ?, 'active', ?)`).run('cu-' + id, T, id, role, role === 'clinic_admin' ? 1 : 0);
  return generateToken({ userId: id, tenantId: T, role, email, name });
}

function addFile(id, patientId, objectKey, category, mime = 'application/pdf') {
  db.prepare(`INSERT INTO file_attachments
    (id, clinic_id, patient_id, uploaded_by, storage_provider, object_key, original_filename, mime_type, file_size, category)
    VALUES (?, ?, ?, 'u-admin', 'cloudflare_r2', ?, 'arquivo', ?, 1024, ?)`).run(id, T, patientId, objectKey, mime, category);
}

const fileExists = (id) => Boolean(db.prepare('SELECT 1 FROM file_attachments WHERE id = ?').get(id));
const auditRows = (action, entityId) => db.prepare('SELECT * FROM audit_logs WHERE action = ? AND entity_id = ?').all(action, entityId);
function detailsAreClean(row) {
  const raw = String(row?.details_json || '');
  return !/token|https?:|url|signature/i.test(raw);
}

async function main() {
  // ---------- Fixtures ----------
  db.prepare(`INSERT INTO tenants (id, slug, name, email, status) VALUES (?, 'clinica-arq', 'Clínica Arquivos', 'c@arq.test', 'active')`).run(T);
  const tokens = {
    clinic_admin: addUser('u-admin', 'clinic_admin', 'Gestora', 'admin@arq.test'),
    professional: addUser('u-prof', 'professional', 'Dra. Clínica', 'prof@arq.test'),
    receptionist: addUser('u-rec', 'receptionist', 'Recepção', 'rec@arq.test'),
    secretary: addUser('u-sec', 'secretary', 'Secretaria', 'sec@arq.test'),
    financial: addUser('u-fin', 'financial', 'Financeiro', 'fin@arq.test'),
    assistant: addUser('u-asst', 'assistant', 'Assistente', 'asst@arq.test')
  };
  db.prepare(`INSERT INTO users (id, name, email, password_hash, role, status) VALUES ('u-super', 'Super Admin', 'super@arq.test', 'x', 'superadmin', 'active')`).run();
  tokens.superadmin = generateToken({ userId: 'u-super', role: 'superadmin', email: 'super@arq.test', name: 'Super Admin' });

  db.prepare(`INSERT INTO patients (id, tenant_id, full_name, email, phone, active) VALUES (?, ?, 'Paciente Sigiloso', 'pac@arq.test', '11999990000', 1)`).run(P, T);

  const clinicalKey = `clinics/${T}/patients/${P}/exames/exame-1.pdf`;
  addFile('att-clin-1', P, clinicalKey, 'exames');
  addFile('att-clin-2', P, `clinics/${T}/patients/${P}/exames/exame-2.pdf`, 'exames');
  addFile('att-clin-3', P, `clinics/${T}/patients/${P}/clinical_tests/teste-3.pdf`, 'clinical_tests');
  // Linha legada sem patient_id, mas com chave sob /patients/ (defesa em profundidade)
  addFile('att-clin-keyonly', null, `clinics/${T}/patients/${P}/personal-assessments/a1/front/foto.webp`, 'personal_assessment_front', 'image/webp');
  // Não clínicos
  addFile('att-exercise', null, `clinics/${T}/personal/exercises/ex-1/img.webp`, 'exercises', 'image/webp');
  addFile('att-clinic-asset', null, `clinics/${T}/clinic/general/logo.png`, 'general', 'image/png');
  // Imagem do catálogo global de exercícios (clinic_id = 'global')
  db.prepare(`INSERT OR IGNORE INTO tenants (id, slug, name, email, status) VALUES ('global', 'global-arq-rbac', 'Global', 'global@arq.test', 'active')`).run();
  db.prepare(`INSERT INTO file_attachments
    (id, clinic_id, patient_id, exercise_id, uploaded_by, storage_provider, object_key, original_filename, mime_type, file_size, category)
    VALUES ('att-illustration-rbac', 'global', NULL, 'ex-rbac', 'system', 'cloudflare_r2', 'clinics/global/exercises/ex-rbac/img.webp', 'ex.webp', 'image/webp', 1024, 'exercises')`).run();

  // Worker Cloudflare local falso (sempre 404): o complete cai no mock R2 e nada sai para a rede
  const workerStub = http.createServer((req, res) => { res.writeHead(404, { Connection: 'close' }); res.end(); });
  await new Promise((resolve) => workerStub.listen(0, '127.0.0.1', resolve));
  process.env.ZEMDA_FILES_WORKER_URL = `http://127.0.0.1:${workerStub.address().port}`;

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function call(role, method, urlPath, body) {
    const headers = { 'Content-Type': 'application/json', Connection: 'close', Authorization: `Bearer ${tokens[role]}`, 'x-tenant-id': T };
    const res = await fetch(base + urlPath, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let data = null;
    try { data = await res.json(); } catch (_) {}
    return { status: res.status, data };
  }

  const blockedRoles = ['receptionist', 'secretary', 'financial', 'assistant', 'superadmin'];

  try {
    console.log('\n--- 1. Perfis não clínicos são bloqueados em anexos de paciente ---');
    for (const role of blockedRoles) {
      const list = await call(role, 'GET', `/v1/files/patient/${P}`);
      assert(list.status === 403 && !list.data?.files, `${role}: listagem de anexos do paciente → 403 (${list.status})`);
      const url = await call(role, 'GET', '/v1/files/att-clin-1/url');
      assert(url.status === 403 && !url.data?.url, `${role}: URL assinada de anexo clínico → 403 (${url.status})`);
    }
    const rec403 = await call('receptionist', 'GET', '/v1/files/att-clin-1/url');
    assert(typeof rec403.data?.error === 'string' && /LGPD/.test(rec403.data.error), 'Negação traz mensagem pt-BR de sigilo LGPD');

    const byKey = await call('receptionist', 'GET', `/v1/files/${encodeURIComponent(clinicalKey)}/url`);
    assert(byKey.status === 403, `receptionist: URL assinada buscando pela object_key → 403 (${byKey.status})`);
    const keyOnly = await call('receptionist', 'GET', '/v1/files/att-clin-keyonly/url');
    assert(keyOnly.status === 403, `receptionist: anexo legado sem patient_id mas sob /patients/ → 403 (${keyOnly.status})`);
    const legacyList = await call('receptionist', 'GET', `/files/patient/${P}`);
    assert(legacyList.status === 403, `receptionist: rota legada /files/patient → 403 (${legacyList.status})`);

    for (const role of ['receptionist', 'secretary', 'superadmin']) {
      const del = await call(role, 'DELETE', '/v1/files/att-clin-1');
      assert(del.status === 403, `${role}: exclusão de anexo clínico → 403 (${del.status})`);
    }
    const delByKey = await call('receptionist', 'DELETE', `/v1/files/${encodeURIComponent(clinicalKey)}`);
    assert(delByKey.status === 403, `receptionist: exclusão pela object_key → 403 (${delByKey.status})`);
    assert(fileExists('att-clin-1'), 'Anexo clínico continua no banco após exclusões negadas');

    const ticketPatient = await call('receptionist', 'POST', '/v1/files/upload-ticket', { patientId: P, category: 'exames', filename: 'exame.pdf', mimeType: 'application/pdf', fileSize: 2048 });
    assert(ticketPatient.status === 403 && !ticketPatient.data?.uploadToken, `receptionist: upload-ticket de anexo do paciente → 403 (${ticketPatient.status})`);
    const ticketAssessment = await call('receptionist', 'POST', '/v1/files/upload-ticket', { patientId: P, category: 'personal_assessment_front', filename: 'f.webp', mimeType: 'image/webp', fileSize: 2048 });
    assert(ticketAssessment.status === 403, `receptionist: upload-ticket de foto de avaliação → 403 (${ticketAssessment.status})`);
    const uploadUrl = await call('financial', 'POST', '/v1/files/upload-url', { patientId: P, category: 'exames', filename: 'exame.pdf', mimeType: 'application/pdf', fileSize: 2048 });
    assert(uploadUrl.status === 403 && !uploadUrl.data?.uploadUrl, `financial: upload-url de anexo do paciente → 403 (${uploadUrl.status})`);
    const before = db.prepare('SELECT COUNT(*) AS c FROM file_attachments').get().c;
    const completeDenied = await call('receptionist', 'POST', '/v1/files/complete', { patientId: P, category: 'exames', objectKey: `clinics/${T}/patients/${P}/exames/forjado.pdf`, filename: 'forjado.pdf', mimeType: 'application/pdf', fileSize: 2048 });
    assert(completeDenied.status === 403, `receptionist: complete de anexo do paciente → 403 (${completeDenied.status})`);
    const completeKeyOnly = await call('receptionist', 'POST', '/v1/files/complete', { category: 'general', objectKey: `clinics/${T}/patients/${P}/exames/sem-paciente.pdf`, filename: 'x.pdf', mimeType: 'application/pdf', fileSize: 2048 });
    assert(completeKeyOnly.status === 403, `receptionist: complete com chave sob /patients/ sem patientId → 403 (${completeKeyOnly.status})`);
    assert(db.prepare('SELECT COUNT(*) AS c FROM file_attachments').get().c === before, 'Nenhum anexo registrado pelas tentativas negadas');

    console.log('\n--- 2. Profissional e gestor mantêm acesso (mesmo formato de resposta) ---');
    const profList = await call('professional', 'GET', `/v1/files/patient/${P}`);
    assert(profList.status === 200 && Array.isArray(profList.data?.files) && profList.data.files.some((f) => f.id === 'att-clin-1'), 'professional: lista anexos do paciente (200, { files })');
    const adminList = await call('clinic_admin', 'GET', `/v1/files/patient/${P}?category=exames`);
    assert(adminList.status === 200 && adminList.data.files.every((f) => f.category === 'exames'), 'clinic_admin: lista anexos filtrando categoria (200)');

    const profUrl = await call('professional', 'GET', '/v1/files/att-clin-1/url');
    assert(profUrl.status === 200 && String(profUrl.data?.url).includes('token=') && profUrl.data.expiresIn === 300 && profUrl.data.category === 'exames', 'professional: URL assinada do anexo clínico (200)');
    const adminUrl = await call('clinic_admin', 'GET', '/v1/files/att-clin-1/url');
    assert(adminUrl.status === 200 && String(adminUrl.data?.url).includes('token='), 'clinic_admin: URL assinada do anexo clínico (200)');

    const viewLogs = auditRows('VIEW_PATIENT_FILE', 'att-clin-1');
    assert(viewLogs.length === 2, `audit_logs: 2 registros VIEW_PATIENT_FILE (encontrados ${viewLogs.length}) — negações não geram visualização`);
    const viewDetails = JSON.parse(viewLogs[0]?.details_json || '{}');
    assert(viewDetails.patient_id === P && viewDetails.category === 'exames', 'VIEW_PATIENT_FILE registra patient_id e categoria');
    assert(viewLogs.every(detailsAreClean), 'VIEW_PATIENT_FILE não guarda URL assinada nem token em details_json');
    assert(viewLogs.every((r) => r.entity === 'file_attachments' && r.tenant_id === T), 'VIEW_PATIENT_FILE vinculado a file_attachments e à clínica');
    assert(auditRows('LIST_PATIENT_FILES', P).length === 2, 'audit_logs: listagens de anexos do paciente registradas');

    // Upload real (ticket → complete) em modo mock
    const ticket = await call('professional', 'POST', '/v1/files/upload-ticket', { patientId: P, category: 'exames', filename: 'novo.pdf', mimeType: 'application/pdf', fileSize: 4096 });
    assert(ticket.status === 200 && ticket.data?.objectKey?.startsWith(`clinics/${T}/patients/${P}/`), 'professional: upload-ticket de anexo do paciente (200)');
    const complete = await call('professional', 'POST', '/v1/files/complete', { patientId: P, category: 'exames', objectKey: ticket.data?.objectKey, filename: 'novo.pdf', mimeType: 'application/pdf', fileSize: 4096 });
    assert(complete.status === 201 && complete.data?.file?.id, `professional: complete registra anexo (${complete.status})`);
    const uploadLogs = complete.data?.file?.id ? auditRows('UPLOAD_PATIENT_FILE', complete.data.file.id) : [];
    assert(uploadLogs.length === 1 && detailsAreClean(uploadLogs[0]) && JSON.parse(uploadLogs[0].details_json).patient_id === P, 'audit_logs: UPLOAD_PATIENT_FILE com patient_id, sem URL/token');

    const profDel = await call('professional', 'DELETE', '/v1/files/att-clin-2');
    assert(profDel.status === 200 && profDel.data?.success === true && !fileExists('att-clin-2'), 'professional: exclui anexo clínico (200)');
    const adminDel = await call('clinic_admin', 'DELETE', '/v1/files/att-clin-3');
    assert(adminDel.status === 200 && !fileExists('att-clin-3'), 'clinic_admin: exclui anexo clínico (200)');
    const delLogs = auditRows('DELETE_PATIENT_FILE', 'att-clin-2');
    assert(delLogs.length === 1, 'audit_logs: DELETE_PATIENT_FILE registrado');
    const delDetails = JSON.parse(delLogs[0]?.details_json || '{}');
    assert(delDetails.patient_id === P && delDetails.category === 'exames' && detailsAreClean(delLogs[0]), 'DELETE_PATIENT_FILE registra patient_id e categoria, sem URL/token');
    assert(auditRows('DELETE_PATIENT_FILE', 'att-clin-1').length === 0, 'Exclusões negadas não geram DELETE_PATIENT_FILE');

    console.log('\n--- 3. Anexos não clínicos seguem como antes ---');
    const recExercise = await call('receptionist', 'GET', '/v1/files/att-exercise/url');
    assert(recExercise.status === 200 && String(recExercise.data?.url).includes('token='), 'receptionist: imagem de exercício continua acessível (200)');
    const asstExercise = await call('assistant', 'GET', '/v1/files/att-exercise/url');
    assert(asstExercise.status === 200, 'assistant: imagem de exercício continua acessível (200)');
    const recGlobal = await call('receptionist', 'GET', '/v1/files/att-illustration-rbac/url');
    assert(recGlobal.status === 200, 'receptionist: imagem do catálogo global de exercícios acessível (200)');
    const recAsset = await call('receptionist', 'GET', '/v1/files/att-clinic-asset/url');
    assert(recAsset.status === 200, 'receptionist: asset da clínica continua acessível (200)');
    const recExTicket = await call('receptionist', 'POST', '/v1/files/upload-ticket', { patientId: 'exercises', category: 'exercises', filename: 'ex.webp', mimeType: 'image/webp', fileSize: 2048 });
    assert(recExTicket.status === 200 && String(recExTicket.data?.objectKey).includes('/personal/exercises/'), 'receptionist: upload-ticket de imagem de exercício continua (200)');
    const recClinicTicket = await call('receptionist', 'POST', '/v1/files/upload-ticket', { category: 'general', filename: 'logo.png', mimeType: 'image/png', fileSize: 2048 });
    assert(recClinicTicket.status === 200 && String(recClinicTicket.data?.objectKey).includes('/clinic/'), 'receptionist: upload-ticket de asset da clínica continua (200)');
    const recAssetDel = await call('receptionist', 'DELETE', '/v1/files/att-clinic-asset');
    assert(recAssetDel.status === 200 && !fileExists('att-clinic-asset'), 'receptionist: exclusão de asset da clínica continua (200)');
    assert(auditRows('VIEW_PATIENT_FILE', 'att-exercise').length === 0, 'Visualização de exercício não polui a trilha de anexos clínicos');
  } catch (err) {
    console.error('Erro inesperado no teste:', err);
    failed++;
  } finally {
    server.closeAllConnections();
    server.close();
    workerStub.closeAllConnections();
    workerStub.close();
  }

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
