// Verification of Payroll Receipts & PDF generation (Clinic, Studio, Mixed, RBAC, Snapshots, Reversals, Calculations)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-payroll-receipt-'));
process.env.DATABASE_PATH = path.join(tempDir, 'test.db');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'payroll-receipt-test-secret-2026';

const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();

const { PayrollController } = require('./dist/controllers/payroll.controller');
const { requireRole } = require('./dist/middlewares/rbac.middleware');

const TENANT_CLINIC = 't-rec-clinic';
const TENANT_STUDIO = 't-rec-studio';
const TENANT_MIXED = 't-rec-mixed';
const TENANT_OTHER = 't-rec-other';

// Minimal valid 1x1 PNG base64 logo
const TINY_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

for (const [id, slug, name, trade, corp, cnpj, profile, logo] of [
  [TENANT_CLINIC, 'cli-rec', 'Clínica Exemplo', 'Clínica Exemplo', 'Clínica Exemplo Saúde LTDA', '12.345.678/0001-90', 'clinic', TINY_PNG_DATA_URL],
  [TENANT_STUDIO, 'stu-rec', 'Studio Movimento', 'Studio Movimento', 'Studio Movimento LTDA', '98.765.432/0001-10', 'studio', TINY_PNG_DATA_URL],
  [TENANT_MIXED, 'mix-rec', 'Espaço Misto', 'Espaço Integrado Misto', null, '11.222.333/0001-44', 'mixed', '/brand/zemda-logo.png'],
  [TENANT_OTHER, 'oth-rec', 'Outra Clínica', 'Outra Clínica', null, null, 'clinic', null]
]) {
  db.prepare(`
    INSERT INTO tenants (
      id, slug, name, trade_name, corporate_name, cnpj_cpf, email, phone,
      street, number, neighborhood, city, state, zip_code, logo_url,
      establishment_profile, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, '(11) 3333-4444', 'Rua Teste', '100', 'Centro', 'São Paulo', 'SP', '01000-000', ?, ?, 'active')
  `).run(id, slug, name, trade, corp, cnpj, `${slug}@test.invalid`, logo, profile);
}

function seedUser(userId, tenantId, name, email, role, isManager = 0) {
  db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, 'h', ?, 'active')`)
    .run(userId, tenantId, name, email, role);
  db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, is_manager, status) VALUES (?, ?, ?, ?, ?, 'active')`)
    .run('cu-' + userId, tenantId, userId, role, isManager);
}

seedUser('u-adm-cl', TENANT_CLINIC, 'Gestor Clínica', 'adm@cl.test', 'clinic_admin', 1);
seedUser('u-pro-c1', TENANT_CLINIC, 'João Silva', 'joao@cl.test', 'professional', 0);
seedUser('u-pro-c2', TENANT_CLINIC, 'Maria Costa', 'maria@cl.test', 'professional', 0);
seedUser('u-rec-cl', TENANT_CLINIC, 'Recepção Ana', 'rec@cl.test', 'receptionist', 0);
seedUser('u-adm-st', TENANT_STUDIO, 'Gestor Studio', 'adm@st.test', 'clinic_admin', 1);
seedUser('u-adm-mx', TENANT_MIXED, 'Gestor Misto', 'adm@mx.test', 'clinic_admin', 1);
seedUser('u-adm-ot', TENANT_OTHER, 'Gestor Outro', 'adm@ot.test', 'clinic_admin', 1);

db.prepare(`
  INSERT INTO professionals (
    id, tenant_id, user_id, name, profession_name, registration_type, registration_number,
    remuneration_type, commission_percentage, fixed_salary, custom_attributes_json, active
  ) VALUES
    ('pro-c1', ?, 'u-pro-c1', 'João Silva', 'Fisioterapeuta', 'CREFITO-3', '12345-F', 'both', 40, 2500, '{"cpf":"123.456.789-00"}', 1),
    ('pro-c2', ?, 'u-pro-c2', 'Maria Costa', 'Psicóloga', 'CRP', '06/99887', 'commission', 50, 0, NULL, 1),
    ('pro-c3', ?, NULL, 'Dr. Carlos Fixo', 'Médico', 'CRM-SP', '554433', 'salary', 0, 5000, NULL, 1)
`).run(TENANT_CLINIC, TENANT_CLINIC, TENANT_CLINIC);

db.prepare(`
  INSERT INTO professionals (id, tenant_id, name, profession_name, remuneration_type, commission_percentage, fixed_salary, active)
  VALUES ('pro-s1', ?, 'Instrutora Carla', 'Educação Física', 'commission', 50, 0, 1)
`).run(TENANT_STUDIO);

db.prepare(`
  INSERT INTO professionals (id, tenant_id, name, profession_name, remuneration_type, commission_percentage, fixed_salary, active)
  VALUES
    ('pro-m-cli', ?, 'Dra. Mista Clínica', 'Nutricionista', 'salary', 0, 3000, 1),
    ('pro-m-stu', ?, 'Prof. Misto Studio', 'Instrutor Pilates', 'commission', 50, 0, 1)
`).run(TENANT_MIXED, TENANT_MIXED);

// Seed patients, services, appointments, and paid payments for Studio calculation check
db.prepare(`INSERT INTO patients (id, tenant_id, full_name, phone, active) VALUES ('pat-c1', ?, 'Paciente 1', '11999990000', 1)`).run(TENANT_CLINIC);
db.prepare(`INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, price, service_domain, service_kind, active) VALUES ('srv-c1', ?, 'pro-c1', 'Sessão Fisio', 50, 180, 'clinic', 'individual', 1)`).run(TENANT_CLINIC);
db.prepare(`INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, start_time, end_time, status, modality, created_by) VALUES ('apt-c1', ?, 'AG-2026-0001', 'pat-c1', 'pro-c1', 'srv-c1', '2026-11-10T09:00:00', '2026-11-10T09:50:00', 'completed', 'presential', 'u-adm-cl')`).run(TENANT_CLINIC);
db.prepare(`INSERT INTO payments (id, tenant_id, appointment_id, patient_id, professional_id, service_id, amount, payment_method, status) VALUES ('pay-c1', ?, 'apt-c1', 'pat-c1', 'pro-c1', 'srv-c1', 180, 'pix', 'paid')`).run(TENANT_CLINIC);

// Express router mirroring production payroll + receipt routes
const app = express();
app.use(express.json());
const api = express.Router();
const testAuth = (req, res, next) => {
  const hdr = req.headers.authorization || '';
  if (!hdr.startsWith('Bearer ')) { res.status(401).json({ error: 'Token ausente' }); return; }
  const decoded = jwt.verify(hdr.slice(7), process.env.JWT_SECRET);
  req.user = decoded;
  req.tenantId = req.headers['x-tenant-id'] || decoded.tenantId;
  next();
};
api.post('/v1/payroll/calculate', testAuth, requireRole('clinic_admin'), PayrollController.calculate);
api.post('/v1/payroll', testAuth, requireRole('clinic_admin'), PayrollController.save);
api.get('/v1/payroll', testAuth, requireRole('clinic_admin', 'professional'), PayrollController.list);
api.patch('/v1/payroll/:id/pay', testAuth, requireRole('clinic_admin'), PayrollController.markPaid);
api.patch('/v1/payroll/:id/status', testAuth, requireRole('clinic_admin'), PayrollController.updateStatus);
api.get('/v1/payroll/:id/receipt', testAuth, requireRole('clinic_admin', 'professional'), PayrollController.getReceipt);
api.post('/v1/payroll/:id/receipt', testAuth, requireRole('clinic_admin', 'professional'), PayrollController.issueReceipt);
api.get('/v1/payroll/:id/receipt/pdf', testAuth, requireRole('clinic_admin', 'professional'), PayrollController.downloadReceiptPdf);
app.use('/api', api);

function tok(userId, tenantId, role, name = 'Test') {
  return jwt.sign({ userId, tenantId, role, name }, process.env.JWT_SECRET);
}

const server = app.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const req = async (method, p, body, token) => {
    const res = await fetch(base + p, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/pdf')) {
      const buf = Buffer.from(await res.arrayBuffer());
      return { status: res.status, headers: res.headers, pdf: buf };
    }
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { status: res.status, headers: res.headers, data };
  };

  try {
    const tAdmCl = tok('u-adm-cl', TENANT_CLINIC, 'clinic_admin', 'Gestor Clínica');
    const tProC1 = tok('u-pro-c1', TENANT_CLINIC, 'professional', 'João Silva');
    const tProC2 = tok('u-pro-c2', TENANT_CLINIC, 'professional', 'Maria Costa');
    const tRecCl = tok('u-rec-cl', TENANT_CLINIC, 'receptionist', 'Recepção Ana');
    const tAdmSt = tok('u-adm-st', TENANT_STUDIO, 'clinic_admin', 'Gestor Studio');
    const tAdmMx = tok('u-adm-mx', TENANT_MIXED, 'clinic_admin', 'Gestor Misto');
    const tAdmOt = tok('u-adm-ot', TENANT_OTHER, 'clinic_admin', 'Gestor Outro');

    // 1. Calculation preserved untouched: R$ 180 * 40% = R$ 72 + R$ 2500 = R$ 2572
    const calc = await req('POST', '/v1/payroll/calculate', { periodMonth: '2026-11' }, tAdmCl);
    assert.equal(calc.status, 200);
    const joaoCalc = calc.data.results.find(r => r.professionalId === 'pro-c1');
    assert.equal(joaoCalc.commissionAmount, 72);
    assert.equal(joaoCalc.fixedSalary, 2500);
    assert.equal(joaoCalc.totalPayable, 2572);

    // Save 3 Clinic payrolls (both pending initially, fixed salary, commission-only with adjustments)
    const saveBoth = await req('POST', '/v1/payroll', {
      professionalId: 'pro-c1', periodMonth: '2026-11', remunerationType: 'both',
      appointmentsCount: 1, producedAmount: 180, commissionPercentage: 40, commissionAmount: 72,
      fixedSalary: 2500, adjustments: 0, totalPayable: 2572, status: 'pending'
    }, tAdmCl);
    const pyBothId = saveBoth.data.id;

    // Pending payroll MUST NOT issue receipt!
    assert.equal((await req('POST', `/v1/payroll/${pyBothId}/receipt`, {}, tAdmCl)).status, 409, 'Pending payroll blocked from issuing receipt');
    assert.equal((await req('GET', `/v1/payroll/${pyBothId}/receipt/pdf`, null, tAdmCl)).status, 409, 'Pending payroll blocked from PDF');

    // Mark João's payroll as paid with paidDate & paymentMethod
    const payRes = await req('PATCH', `/v1/payroll/${pyBothId}/pay`, {
      paidDate: '2026-11-17', paymentMethod: 'pix', notes: 'PIX comprovante #889'
    }, tAdmCl);
    assert.equal(payRes.status, 200);

    // Permissions check: receptionist denied, Maria (pro-c2) denied on João's receipt, other tenant denied, João (pro-c1) allowed!
    assert.equal((await req('POST', `/v1/payroll/${pyBothId}/receipt`, {}, tRecCl)).status, 403, 'Receptionist blocked');
    assert.equal((await req('POST', `/v1/payroll/${pyBothId}/receipt`, {}, tProC2)).status, 403, 'Other professional blocked');
    assert.equal((await req('POST', `/v1/payroll/${pyBothId}/receipt`, {}, tAdmOt)).status, 404, 'Cross-tenant blocked');

    // Issue receipt for João (fixed salary + commission)
    const issue1 = await req('POST', `/v1/payroll/${pyBothId}/receipt`, {}, tAdmCl);
    assert.equal(issue1.status, 201, JSON.stringify(issue1.data));
    const snap1 = issue1.data.receipt.snapshot;
    assert.equal(snap1.establishment.tradeName, 'Clínica Exemplo');
    assert.equal(snap1.establishment.corporateName, 'Clínica Exemplo Saúde LTDA');
    assert.equal(snap1.establishment.document, '12.345.678/0001-90');
    assert.equal(snap1.professional.name, 'João Silva');
    assert.equal(snap1.professional.cpf, '123.456.789-00');
    assert.equal(snap1.professional.registry, 'CREFITO-3 12345-F');
    assert.equal(snap1.payment.competenceLabel, 'Novembro/2026');
    assert.equal(snap1.payment.paidDateBr, '17/11/2026');
    assert.equal(snap1.payment.paymentMethod, 'PIX');
    assert.equal(snap1.values.hasFixedSalary, true);
    assert.equal(snap1.values.fixedSalary, 2500);
    assert.equal(snap1.values.commissionAmount, 72);
    assert.equal(snap1.values.totalPaid, 2572);
    assert.equal(issue1.data.filename, 'recibo-repasse-joao-silva-2026-11.pdf');

    // Repeated issuance & GET by linked professional returns SAME receipt idempotently (zero duplicate DB rows / payments!)
    const payCountBefore = db.prepare('SELECT COUNT(*) c FROM payments WHERE tenant_id = ?').get(TENANT_CLINIC).c;
    const issue2 = await req('POST', `/v1/payroll/${pyBothId}/receipt`, {}, tProC1);
    assert.equal(issue2.status, 200);
    assert.equal(issue2.data.alreadyIssued, true);
    assert.equal(issue2.data.receipt.receiptNumber, issue1.data.receipt.receiptNumber);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM payroll_receipts WHERE payroll_id = ?').get(pyBothId).c, 1);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM payments WHERE tenant_id = ?').get(TENANT_CLINIC).c, payCountBefore, 'Zero extra payments created');

    // PDF download with embedded PNG logo
    const pdfRes1 = await req('GET', `/v1/payroll/${pyBothId}/receipt/pdf`, null, tAdmCl);
    assert.equal(pdfRes1.status, 200);
    assert.equal(pdfRes1.headers.get('content-type'), 'application/pdf');
    assert(pdfRes1.headers.get('content-disposition').includes('recibo-repasse-joao-silva-2026-11.pdf'));
    assert.equal(pdfRes1.pdf.subarray(0, 5).toString('utf8'), '%PDF-', 'Valid PDF binary signature');
    assert(pdfRes1.pdf.length > 2500);

    // 2. Commission-only receipt WITH positive & negative adjustments: MUST NOT include fixedSalary!
    const saveComm = await req('POST', '/v1/payroll', {
      professionalId: 'pro-c2', periodMonth: '2026-11', remunerationType: 'commission',
      appointmentsCount: 4, producedAmount: 800, commissionPercentage: 50, commissionAmount: 400,
      fixedSalary: 0, adjustments: -50, adjustmentNotes: 'Desconto material', totalPayable: 350,
      status: 'paid', paidDate: '2026-11-17'
    }, tAdmCl);
    const commReceipt = await req('POST', `/v1/payroll/${saveComm.data.id}/receipt`, {}, tAdmCl);
    assert.equal(commReceipt.status, 201);
    assert.equal(commReceipt.data.receipt.snapshot.values.hasFixedSalary, false, 'Commission-only must NOT include fixedSalary');
    assert.equal(commReceipt.data.receipt.snapshot.values.fixedSalary, 0);
    assert.equal(commReceipt.data.receipt.snapshot.values.adjustments, -50);
    assert.equal(commReceipt.data.receipt.snapshot.values.adjustmentNotes, 'Desconto material');
    assert.equal(commReceipt.data.receipt.snapshot.values.totalPaid, 350);
    assert.equal((await req('GET', `/v1/payroll/${saveComm.data.id}/receipt/pdf`, null, tProC2)).pdf.subarray(0, 5).toString('utf8'), '%PDF-');

    // 3. Fixed salary-only receipt
    const saveSal = await req('POST', '/v1/payroll', {
      professionalId: 'pro-c3', periodMonth: '2026-11', remunerationType: 'salary',
      appointmentsCount: 0, producedAmount: 0, commissionPercentage: 0, commissionAmount: 0,
      fixedSalary: 5000, adjustments: 300, adjustmentNotes: 'Plantão extra', totalPayable: 5300,
      status: 'paid', paidDate: '2026-11-15'
    }, tAdmCl);
    const salReceipt = await req('POST', `/v1/payroll/${saveSal.data.id}/receipt`, {}, tAdmCl);
    assert.equal(salReceipt.status, 201);
    assert.equal(salReceipt.data.receipt.snapshot.values.hasFixedSalary, true);
    assert.equal(salReceipt.data.receipt.snapshot.values.hasCommission, false);
    assert.equal(salReceipt.data.receipt.snapshot.values.adjustments, 300);
    assert.equal(salReceipt.data.receipt.snapshot.values.totalPaid, 5300);

    // 4. Reversal & Correction Traceability: revert João's payroll to pending -> old receipt becomes 'reversed' & immutable!
    await req('PATCH', `/v1/payroll/${pyBothId}/status`, { status: 'pending' }, tAdmCl);
    assert.equal((await req('POST', `/v1/payroll/${pyBothId}/receipt`, {}, tAdmCl)).status, 409, 'Reopened payroll blocked from active receipt');
    const histAfterRev = await req('GET', `/v1/payroll/${pyBothId}/receipt`, null, tAdmCl);
    assert.equal(histAfterRev.data.activeReceipt, null);
    assert.equal(histAfterRev.data.history[0].receiptStatus, 'reversed', 'Previous receipt preserved with reversed status');
    assert.equal(histAfterRev.data.history[0].snapshot.values.totalPaid, 2572, 'Historical value preserved intact');

    // Re-pay with adjusted total -> emits NEW receipt while keeping history length = 2
    await req('POST', '/v1/payroll', {
      id: pyBothId, professionalId: 'pro-c1', periodMonth: '2026-11', remunerationType: 'both',
      appointmentsCount: 1, producedAmount: 180, commissionPercentage: 40, commissionAmount: 72,
      fixedSalary: 2500, adjustments: 100, adjustmentNotes: 'Bônus meta', totalPayable: 2672, status: 'pending'
    }, tAdmCl);
    await req('PATCH', `/v1/payroll/${pyBothId}/pay`, { paidDate: '2026-11-18' }, tAdmCl);
    const issueCorrected = await req('POST', `/v1/payroll/${pyBothId}/receipt`, {}, tAdmCl);
    assert.equal(issueCorrected.status, 201);
    assert.notEqual(issueCorrected.data.receipt.receiptNumber, issue1.data.receipt.receiptNumber);
    assert.equal(issueCorrected.data.receipt.snapshot.values.totalPaid, 2672);
    assert.equal(issueCorrected.data.history.length, 2);
    assert.equal(issueCorrected.data.history[1].snapshot.values.totalPaid, 2572);

    // 5. Studio & Mixed establishment receipts (co-instructor / group class vs clinical)
    const saveStudio = await req('POST', '/v1/payroll', {
      professionalId: 'pro-s1', periodMonth: '2026-11', remunerationType: 'commission',
      appointmentsCount: 3, producedAmount: 450, commissionPercentage: 50, commissionAmount: 225,
      fixedSalary: 0, adjustments: 0, totalPayable: 225, status: 'paid', paidDate: '2026-11-17',
      commissionBreakdown: [
        { serviceName: 'Pilates Turma', serviceKind: 'group', participantRole: 'co_instructor', commissionType: 'percentage', commissionRate: 50, grossBasisAmount: 200, commissionAmount: 100 }
      ]
    }, tAdmSt);
    const stRec = await req('POST', `/v1/payroll/${saveStudio.data.id}/receipt`, {}, tAdmSt);
    assert.equal(stRec.status, 201);
    assert.equal(stRec.data.receipt.snapshot.establishment.establishmentProfile, 'studio');
    assert.equal(stRec.data.receipt.snapshot.values.breakdownItems[0].participantRole, 'co_instructor');
    assert.equal((await req('GET', `/v1/payroll/${saveStudio.data.id}/receipt/pdf`, null, tAdmSt)).pdf.subarray(0, 5).toString('utf8'), '%PDF-');

    const saveMixedCli = await req('POST', '/v1/payroll', {
      professionalId: 'pro-m-cli', periodMonth: '2026-11', remunerationType: 'salary',
      fixedSalary: 3000, adjustments: 0, totalPayable: 3000, status: 'paid', paidDate: '2026-11-17'
    }, tAdmMx);
    const saveMixedStu = await req('POST', '/v1/payroll', {
      professionalId: 'pro-m-stu', periodMonth: '2026-11', remunerationType: 'commission',
      appointmentsCount: 2, producedAmount: 300, commissionPercentage: 50, commissionAmount: 150,
      fixedSalary: 0, adjustments: 0, totalPayable: 150, status: 'paid', paidDate: '2026-11-17'
    }, tAdmMx);
    const mxCliRec = await req('POST', `/v1/payroll/${saveMixedCli.data.id}/receipt`, {}, tAdmMx);
    const mxStuRec = await req('POST', `/v1/payroll/${saveMixedStu.data.id}/receipt`, {}, tAdmMx);
    assert.equal(mxCliRec.data.receipt.snapshot.values.totalPaid, 3000);
    assert.equal(mxStuRec.data.receipt.snapshot.values.hasFixedSalary, false);
    assert.equal(mxStuRec.data.receipt.snapshot.values.totalPaid, 150);

    console.log('PASS: All 15 Payroll Receipt requirements verified (salary, commission-only, both, adjustments, pending block, markPaid, logo/PDFKit, idempotent download, reversal/history, RBAC, Clinic/Studio/Mixed, calculations preserved)!');
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
