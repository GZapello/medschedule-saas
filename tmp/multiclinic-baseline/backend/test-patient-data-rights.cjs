/**
 * LGPD 4.1 (acesso/portabilidade) e 2.5 (revogação de consentimento).
 *
 * Prova que:
 *  - GET /v1/patients/:id/export devolve um único JSON com os dados do paciente
 *    (cadastro, agendamentos, prontuário, alergias, consentimentos, pagamentos),
 *    restrito ao tenant e aos papéis clinic_admin/professional;
 *  - anexos (file_attachments) aparecem só como metadados: nunca URL assinada,
 *    token ou bytes do arquivo;
 *  - usuário de outra clínica ou papel não-clínico (recepção) NÃO conseguem exportar;
 *  - POST /v1/patients/:patientId/consents/:consentId/revoke marca o consentimento
 *    como revogado (revoked_at/revoked_by) SEM apagar a linha, e a linha continua
 *    aparecendo (marcada) em listagens/exportação;
 *  - revogar de novo, ou a partir de outro tenant, falha.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

if (!process.env.DATABASE_PATH) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-patient-rights-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'test.sqlite');
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-jwt-secret-patient-rights';

const express = require('express');
const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();
const { generateToken } = require('./dist/utils/jwt');

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

const TA = 'tenant-lgpd-a';
const TB = 'tenant-lgpd-b';
const P = 'pat-lgpd-1';

function main() {
  return (async () => {
    // ---------- Fixtures: tenant A ----------
    db.prepare(`INSERT INTO tenants (id, slug, name, email, status, manager_profession) VALUES (?, 'clinica-lgpd-a', 'Clínica LGPD A', 'a@lgpd.test', 'active', 'Médico')`).run(TA);
    db.prepare(`INSERT INTO tenants (id, slug, name, email, status) VALUES (?, 'clinica-lgpd-b', 'Clínica LGPD B', 'b@lgpd.test', 'active')`).run(TB);

    db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES ('u-admin-a', ?, 'Gestora A', 'admin-a@lgpd.test', 'x', 'clinic_admin', 'active')`).run(TA);
    db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager) VALUES ('cu-admin-a', ?, 'u-admin-a', 'clinic_admin', 'active', 1)`).run(TA);

    db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES ('u-prof-a', ?, 'Dra. Clínica A', 'prof-a@lgpd.test', 'x', 'professional', 'active')`).run(TA);
    db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager) VALUES ('cu-prof-a', ?, 'u-prof-a', 'professional', 'active', 0)`).run(TA);
    db.prepare(`INSERT INTO professionals (id, tenant_id, user_id, name, active) VALUES ('prof-a', ?, 'u-prof-a', 'Dra. Clínica A', 1)`).run(TA);

    db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES ('u-rec-a', ?, 'Recepção A', 'rec-a@lgpd.test', 'x', 'receptionist', 'active')`).run(TA);
    db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager) VALUES ('cu-rec-a', ?, 'u-rec-a', 'receptionist', 'active', 0)`).run(TA);

    // ---------- Fixtures: tenant B (para prova de isolamento) ----------
    db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES ('u-prof-b', ?, 'Dr. Clínica B', 'prof-b@lgpd.test', 'x', 'professional', 'active')`).run(TB);
    db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager) VALUES ('cu-prof-b', ?, 'u-prof-b', 'professional', 'active', 0)`).run(TB);
    db.prepare(`INSERT INTO professionals (id, tenant_id, user_id, name, active) VALUES ('prof-b', ?, 'u-prof-b', 'Dr. Clínica B', 1)`).run(TB);

    const tokens = {
      adminA: generateToken({ userId: 'u-admin-a', tenantId: TA, role: 'clinic_admin', email: 'admin-a@lgpd.test', name: 'Gestora A' }),
      profA: generateToken({ userId: 'u-prof-a', tenantId: TA, role: 'professional', email: 'prof-a@lgpd.test', name: 'Dra. Clínica A' }),
      recA: generateToken({ userId: 'u-rec-a', tenantId: TA, role: 'receptionist', email: 'rec-a@lgpd.test', name: 'Recepção A' }),
      profB: generateToken({ userId: 'u-prof-b', tenantId: TB, role: 'professional', email: 'prof-b@lgpd.test', name: 'Dr. Clínica B' })
    };

    // ---------- Paciente com dados em várias categorias (tenant A) ----------
    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, birth_date, cpf, email, phone, active)
      VALUES (?, ?, 'Paciente Titular de Direitos', '1990-01-01', '111.222.333-44', 'pac@lgpd.test', '11988887777', 1)
    `).run(P, TA);

    db.prepare(`INSERT INTO services (id, tenant_id, name, duration_minutes, price, active) VALUES ('svc-lgpd', ?, 'Consulta', 50, 150, 1)`).run(TA);
    db.prepare(`
      INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, start_time, end_time, status, modality)
      VALUES ('apt-lgpd-1', ?, 'AG-LGPD-0001', ?, 'prof-a', 'svc-lgpd', '2026-09-01T10:00:00.000Z', '2026-09-01T10:50:00.000Z', 'completed', 'presential')
    `).run(TA, P);

    db.prepare(`
      INSERT INTO records (id, tenant_id, patient_id, professional_id, session_date, title, clinical_evolution)
      VALUES ('rec-lgpd-1', ?, ?, 'prof-a', '2026-09-01', 'Consulta inicial', 'Paciente relata dor lombar leve.')
    `).run(TA, P);

    db.prepare(`
      INSERT INTO patient_allergies (id, tenant_id, patient_id, agent, reaction, severity, status)
      VALUES ('alg-lgpd-1', ?, ?, 'Dipirona', 'Urticária', 'moderate', 'active')
    `).run(TA, P);

    db.prepare(`
      INSERT INTO payments (id, tenant_id, appointment_id, patient_id, amount, payment_method, status, payment_date)
      VALUES ('pay-lgpd-1', ?, 'apt-lgpd-1', ?, 150, 'pix', 'paid', '2026-09-01')
    `).run(TA, P);

    db.prepare(`
      INSERT INTO file_attachments (id, clinic_id, patient_id, uploaded_by, storage_provider, object_key, original_filename, mime_type, file_size, category)
      VALUES ('att-lgpd-1', ?, ?, 'u-prof-a', 'cloudflare_r2', ?, 'exame-sangue.pdf', 'application/pdf', 20480, 'exames')
    `).run(TA, P, `clinics/${TA}/patients/${P}/exames/exame-sangue.pdf`);

    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;

    async function call(token, method, urlPath, body) {
      const headers = { 'Content-Type': 'application/json', Connection: 'close' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(base + urlPath, { method, headers, body: body ? JSON.stringify(body) : undefined });
      let data = null;
      try { data = await res.json(); } catch (_) {}
      return { status: res.status, data };
    }

    try {
      console.log('\n--- 1. Exportação de dados do paciente (LGPD 4.1) ---');

      const exportAdmin = await call(tokens.adminA, 'GET', `/v1/patients/${P}/export`);
      assert(exportAdmin.status === 200, `clinic_admin: exporta dados do paciente (200), recebido ${exportAdmin.status}`);
      assert(exportAdmin.data?.patient?.full_name === 'Paciente Titular de Direitos', 'export contém o cadastro do paciente');
      assert(Array.isArray(exportAdmin.data?.appointments) && exportAdmin.data.appointments.some((a) => a.id === 'apt-lgpd-1'), 'export contém o agendamento criado');
      assert(Array.isArray(exportAdmin.data?.clinicalRecords) && exportAdmin.data.clinicalRecords.some((r) => r.id === 'rec-lgpd-1'), 'export contém a evolução clínica (records)');
      assert(Array.isArray(exportAdmin.data?.allergies) && exportAdmin.data.allergies.some((a) => a.id === 'alg-lgpd-1'), 'export contém a alergia cadastrada');
      assert(Array.isArray(exportAdmin.data?.payments) && exportAdmin.data.payments.some((p) => p.id === 'pay-lgpd-1'), 'export contém o pagamento');

      const attachment = exportAdmin.data?.attachments?.find((a) => a.id === 'att-lgpd-1');
      assert(!!attachment, 'export contém o anexo (metadados)');
      assert(attachment && attachment.original_filename === 'exame-sangue.pdf' && attachment.mime_type === 'application/pdf', 'anexo traz nome/tipo de arquivo');
      assert(attachment && !('object_key' in attachment) && !('storage_provider' in attachment), 'anexo NÃO traz object_key/storage_provider (sem ponteiro de armazenamento)');
      const fullJson = JSON.stringify(exportAdmin.data);
      assert(!/token=/i.test(fullJson), 'JSON exportado não contém nenhuma URL assinada (token=)');
      assert(!/exame-sangue\.pdf["']?\s*,\s*"object_key"/i.test(fullJson), 'anexo não expõe object_key junto ao nome do arquivo');
      assert(!fullJson.includes('cloudflare_r2'), 'JSON exportado não menciona o provedor de armazenamento (sinal de que só metadados foram incluídos)');

      const exportProf = await call(tokens.profA, 'GET', `/v1/patients/${P}/export`);
      assert(exportProf.status === 200, `professional da própria clínica: exporta dados do paciente (200), recebido ${exportProf.status}`);

      const exportRec = await call(tokens.recA, 'GET', `/v1/patients/${P}/export`);
      assert(exportRec.status === 403, `receptionist: NÃO pode exportar (403), recebido ${exportRec.status}`);

      const exportOtherTenant = await call(tokens.profB, 'GET', `/v1/patients/${P}/export`);
      assert([403, 404].includes(exportOtherTenant.status), `profissional de outra clínica: export do paciente falha (403/404), recebido ${exportOtherTenant.status}`);
      assert(!exportOtherTenant.data?.patient, 'export de outra clínica não devolve dados do paciente');

      const exportNoAuth = await call(null, 'GET', `/v1/patients/${P}/export`);
      assert(exportNoAuth.status === 401 || exportNoAuth.status === 403, `sem token: export bloqueado (${exportNoAuth.status})`);

      console.log('\n--- 2. Revogação de consentimento (LGPD 2.5) ---');

      const createConsent = await call(tokens.profA, 'POST', `/v1/patients/${P}/consents`, {
        title: 'Termo de Consentimento para Teleatendimento',
        consentType: 'telehealth',
        content: 'O paciente autoriza o atendimento por telessaúde.',
        signedByName: 'Paciente Titular de Direitos',
        signedByCpf: '111.222.333-44',
        modality: 'telehealth'
      });
      assert(createConsent.status === 201 && !!createConsent.data?.id, `criação de consentimento funciona (bug de schema corrigido) (${createConsent.status})`);
      const consentId = createConsent.data.id;

      const listBefore = await call(tokens.profA, 'GET', `/v1/patients/${P}/consents`);
      const beforeRow = listBefore.data?.find((c) => c.id === consentId);
      assert(beforeRow && !beforeRow.revoked_at, 'consentimento aparece vigente (revoked_at nulo) antes da revogação');

      const revoke = await call(tokens.profA, 'POST', `/v1/patients/${P}/consents/${consentId}/revoke`);
      assert(revoke.status === 200, `revogação bem-sucedida (200), recebido ${revoke.status}`);

      const dbRowAfter = db.prepare('SELECT * FROM patient_consents WHERE id = ?').get(consentId);
      assert(!!dbRowAfter, 'linha do consentimento continua existindo no banco (não foi apagada)');
      assert(!!dbRowAfter.revoked_at, 'revoked_at foi preenchido');
      assert(dbRowAfter.revoked_by === 'u-prof-a', 'revoked_by registra o usuário que revogou');

      const listAfter = await call(tokens.profA, 'GET', `/v1/patients/${P}/consents`);
      const afterRow = listAfter.data?.find((c) => c.id === consentId);
      assert(!!afterRow && !!afterRow.revoked_at, 'consentimento revogado continua aparecendo na listagem (marcado, não removido)');

      const exportAfterRevoke = await call(tokens.adminA, 'GET', `/v1/patients/${P}/export`);
      const consentInExport = exportAfterRevoke.data?.consents?.find((c) => c.id === consentId);
      assert(!!consentInExport && !!consentInExport.revoked_at, 'consentimento revogado aparece marcado na exportação de dados');

      const revokeAgain = await call(tokens.profA, 'POST', `/v1/patients/${P}/consents/${consentId}/revoke`);
      assert(revokeAgain.status === 409 || revokeAgain.status === 400, `revogar de novo falha (409/400), recebido ${revokeAgain.status}`);

      // Novo consentimento para testar isolamento entre clínicas
      const createConsent2 = await call(tokens.profA, 'POST', `/v1/patients/${P}/consents`, {
        title: 'Termo Consentimento Isolamento',
        consentType: 'telehealth',
        content: 'Conteúdo do termo.',
        signedByName: 'Paciente Titular de Direitos'
      });
      const consentId2 = createConsent2.data.id;
      const revokeFromOtherTenant = await call(tokens.profB, 'POST', `/v1/patients/${P}/consents/${consentId2}/revoke`);
      assert([403, 404].includes(revokeFromOtherTenant.status), `revogar a partir de outra clínica falha (403/404), recebido ${revokeFromOtherTenant.status}`);
      const dbRow2 = db.prepare('SELECT revoked_at FROM patient_consents WHERE id = ?').get(consentId2);
      assert(!dbRow2.revoked_at, 'consentimento NÃO foi revogado pela tentativa de outra clínica');

      const auditExport = db.prepare("SELECT * FROM audit_logs WHERE action = 'EXPORT_PATIENT_DATA' AND entity_id = ?").all(P);
      assert(auditExport.length >= 1, 'exportação gera registro em audit_logs (EXPORT_PATIENT_DATA)');

      const auditRevoke = db.prepare("SELECT * FROM audit_logs WHERE action = 'REVOKE_PATIENT_CONSENT' AND entity_id = ?").all(consentId);
      assert(auditRevoke.length === 1, 'revogação gera registro em audit_logs (REVOKE_PATIENT_CONSENT)');
    } catch (err) {
      console.error('Erro inesperado no teste:', err);
      failed++;
    } finally {
      server.closeAllConnections();
      server.close();
    }

    console.log(`\nResultado: ${passed} passaram, ${failed} falharam`);
    if (failed > 0) process.exitCode = 1;
  })();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
