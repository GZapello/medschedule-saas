const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-consents-otp-'));
process.env.DATABASE_PATH = path.join(temp, 'test.sqlite');
process.env.JWT_SECRET = 'consents-test-only';
process.env.NODE_ENV = 'test';
process.env.APP_URL = 'https://zemda.test';

const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();

const { ConsentService: S, contentHash } = require('./dist/services/consent.service');
const { mountConsentRoutes, mountPublicConsentRoutes } = require('./dist/routes/consents.routes');
const { authMiddleware } = require('./dist/middlewares/auth.middleware');
const { tenantMiddleware } = require('./dist/middlewares/tenant.middleware');
const { generateToken } = require('./dist/utils/jwt');
const { EmailService } = require('./dist/services/email.service');
const express = require('express'), sharp = require('sharp');

let checks = 0, otp = '', recipient = '', messages = 0;
function check(value, label) {
  assert.ok(value, label);
  checks++;
  console.log('PASS', label);
}

EmailService.sendCustomEmail = async (to, _subject, body) => {
  recipient = to;
  otp = body.replace(/<[^>]*>/g, ' ').match(/\b\d{6}\b/)?.[0] || '';
  messages++;
  return true;
};

// Seed test database
db.prepare('INSERT INTO tenants(id,slug,name,email,status,manager_profession) VALUES(?,?,?,?,?,?)')
  .run('test-clinic', 'test-clinic', 'Clínica Opcional OTP', 'clinic@test.invalid', 'active', 'Fisioterapia');

db.prepare('INSERT INTO users(id,tenant_id,name,email,password_hash,role,status) VALUES(?,?,?,?,?,?,?)')
  .run('manager', 'test-clinic', 'Dr. Gestor', 'gestor@test.invalid', 'test', 'clinic_admin', 'active');
const managerToken = generateToken({ userId: 'manager', tenantId: 'test-clinic', name: 'Dr. Gestor', email: 'gestor@test.invalid', role: 'clinic_admin' });

// Create patient without email
db.prepare("INSERT INTO patients(id,tenant_id,full_name,phone,birth_date) VALUES('p-no-email','test-clinic','Paciente Sem Email','11988887777','1995-05-15')").run();

// Create patient with email
db.prepare("INSERT INTO patients(id,tenant_id,full_name,phone,email,birth_date) VALUES('p-with-email','test-clinic','Paciente Com Email','11977776666','paciente@test.invalid','1992-02-20')").run();

// Create minor without guardian email
db.prepare("INSERT INTO patients(id,tenant_id,full_name,phone,is_child,birth_date) VALUES('p-minor','test-clinic','Menor de Idade','11966665555',1,'2018-08-10')").run();

const app = express();
app.use(express.json({ limit: '8mb' }));
mountPublicConsentRoutes(app);
app.use(authMiddleware, tenantMiddleware);
mountConsentRoutes(app);

const server = app.listen(0, '127.0.0.1');

(async () => {
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(endpoint, method = 'GET', body, token = managerToken) {
    const r = await fetch(base + endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    return {
      status: r.status,
      body: r.headers.get('content-type')?.includes('application/pdf') ? Buffer.from(await r.arrayBuffer()) : await r.json().catch(() => ({})),
      headers: r.headers
    };
  }

  // 1. Get templates
  const templates = (await request('/v1/consents/templates')).body;
  check(templates.length > 0, 'Found standard templates');
  const templateId = templates[0].id;

  // 2. Generate a valid signature image
  const svg = '<svg width="500" height="160" xmlns="http://www.w3.org/2000/svg"><rect width="500" height="160" fill="white"/><path d="M20 110 Q80 10 100 90 T190 60 T300 100 L420 50" fill="none" stroke="black" stroke-width="4"/></svg>';
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const signatureDataUrl = `data:image/png;base64,${png.toString('base64')}`;

  // ================================================================
  // CENÁRIO 1: ASSINATURA SEM CÓDIGO (requireOtp: false) - PACIENTE SEM E-MAIL
  // ================================================================
  const issueNoOtp = await request('/v1/consents/patients/p-no-email/request', 'POST', {
    templateId,
    requireOtp: false
  });
  check(issueNoOtp.status === 201 && issueNoOtp.body.url, 'Emissão sem OTP permitida para paciente sem e-mail');

  const tokenNoOtp = issueNoOtp.body.url.split('/').pop();
  const readNoOtp = await request('/v1/public/consents/read', 'POST', { token: tokenNoOtp }, null);
  check(readNoOtp.status === 200, 'Link público aberto com sucesso');
  check(readNoOtp.body.requireOtp === false, 'requireOtp é false no payload público');
  check(readNoOtp.body.authLevel === 'basic', 'authLevel é basic no documento');

  // Tentativa de pedir OTP em termo sem código deve falhar
  const otpAttempt = await request('/v1/public/consents/otp/request', 'POST', { token: tokenNoOtp, channel: 'email' }, null);
  check(otpAttempt.status === 400 && otpAttempt.body.error.includes('não requer confirmação por código'), 'Solicitação de OTP bloqueada em termo sem código');

  // Assinar diretamente sem OTP
  const signNoOtp = await request('/v1/public/consents/sign', 'POST', {
    token: tokenNoOtp,
    documentHash: readNoOtp.body.documentHash,
    declarations: [true, true, true],
    signatureDataUrl
  }, null);
  check(signNoOtp.status === 200 && signNoOtp.body.success, 'Termo assinado com sucesso SEM confirmação por OTP');

  // Verificar evidências da assinatura sem OTP
  const verifyCodeNoOtp = signNoOtp.body.verificationUrl.split('/').pop();
  const verifyNoOtp = await request(`/v1/public/consents/verify/${verifyCodeNoOtp}`, 'GET', undefined, null);
  check(verifyNoOtp.body.authentic && verifyNoOtp.body.integrity, 'Autenticidade e integridade confirmadas para termo sem OTP');

  // Gerar PDF do termo assinado sem OTP
  const pdfNoOtp = await request(`/v1/consents/${issueNoOtp.body.id}/pdf`);
  check(pdfNoOtp.status === 200 && pdfNoOtp.body.subarray(0, 5).toString() === '%PDF-', 'PDF gerado com sucesso para termo sem OTP');

  // ================================================================
  // CENÁRIO 2: ASSINATURA SEM CÓDIGO (requireOtp: false) - RESPONSÁVEL LEGAL SEM E-MAIL
  // ================================================================
  const guardianNoEmail = {
    name: 'Mãe Sem Email',
    cpf: '52998224725',
    relationship: 'Mãe',
    phone: '11999998888',
    email: '' // e-mail vazio
  };
  const issueGuardianNoOtp = await request('/v1/consents/patients/p-minor/request', 'POST', {
    templateId,
    requireOtp: false,
    guardian: guardianNoEmail
  });
  check(issueGuardianNoOtp.status === 201 && issueGuardianNoOtp.body.url, 'Emissão sem OTP permitida para menor com responsável sem e-mail');

  const tokenGuardianNoOtp = issueGuardianNoOtp.body.url.split('/').pop();
  const readGuardianNoOtp = await request('/v1/public/consents/read', 'POST', { token: tokenGuardianNoOtp }, null);
  check(readGuardianNoOtp.body.requireOtp === false && readGuardianNoOtp.body.authLevel === 'basic', 'Responsável legal recebe documento sem exigência de OTP');

  const signGuardianNoOtp = await request('/v1/public/consents/sign', 'POST', {
    token: tokenGuardianNoOtp,
    documentHash: readGuardianNoOtp.body.documentHash,
    declarations: [true, true, true],
    signatureDataUrl
  }, null);
  check(signGuardianNoOtp.status === 200 && signGuardianNoOtp.body.success, 'Responsável legal conclui assinatura sem OTP com sucesso');

  // ================================================================
  // CENÁRIO 3: ASSINATURA COM CÓDIGO (requireOtp: true) - VALIDAÇÃO E FLUXO COMPLETO
  // ================================================================
  // Tentativa de exigir OTP para paciente sem e-mail deve ser rejeitada na emissão
  const rejectNoEmailWithOtp = await request('/v1/consents/patients/p-no-email/request', 'POST', {
    templateId,
    requireOtp: true
  });
  check(rejectNoEmailWithOtp.status === 400 && rejectNoEmailWithOtp.body.error.includes('Paciente sem e-mail cadastrado'), 'Emissão com OTP exige e-mail do paciente');

  // Emissão com OTP para paciente que possui e-mail
  const issueWithOtp = await request('/v1/consents/patients/p-with-email/request', 'POST', {
    templateId,
    requireOtp: true
  });
  check(issueWithOtp.status === 201 && issueWithOtp.body.url, 'Emissão com OTP aceita para paciente com e-mail cadastrado');

  const tokenWithOtp = issueWithOtp.body.url.split('/').pop();
  const readWithOtp = await request('/v1/public/consents/read', 'POST', { token: tokenWithOtp }, null);
  check(readWithOtp.body.requireOtp === true && readWithOtp.body.authLevel !== 'basic', 'Documento com OTP indica requireOtp: true');

  // Tentativa de assinar sem validar OTP deve ser bloqueada
  const signBeforeOtp = await request('/v1/public/consents/sign', 'POST', {
    token: tokenWithOtp,
    documentHash: readWithOtp.body.documentHash,
    declarations: [true, true, true],
    signatureDataUrl
  }, null);
  check(signBeforeOtp.status === 400 && signBeforeOtp.body.error.includes('Confirme um código válido'), 'Assinatura bloqueada até validação do OTP');

  // Solicitar e validar OTP
  const reqOtpRes = await request('/v1/public/consents/otp/request', 'POST', { token: tokenWithOtp, channel: 'email' }, null);
  check(reqOtpRes.status === 200 && otp.length === 6, 'Código OTP gerado e enviado por e-mail');

  const verifyOtpRes = await request('/v1/public/consents/otp/verify', 'POST', { token: tokenWithOtp, code: otp }, null);
  check(verifyOtpRes.status === 200 && verifyOtpRes.body.success, 'Código OTP validado com sucesso');

  // Agora assinar após OTP validado
  const signAfterOtp = await request('/v1/public/consents/sign', 'POST', {
    token: tokenWithOtp,
    documentHash: readWithOtp.body.documentHash,
    declarations: [true, true, true],
    signatureDataUrl
  }, null);
  check(signAfterOtp.status === 200 && signAfterOtp.body.success, 'Assinatura concluída com sucesso após validação de OTP');

  // Verificar evidências do termo com OTP
  const verifyCodeWithOtp = signAfterOtp.body.verificationUrl.split('/').pop();
  const verifyWithOtp = await request(`/v1/public/consents/verify/${verifyCodeWithOtp}`, 'GET', undefined, null);
  check(verifyWithOtp.body.authentic && verifyWithOtp.body.integrity, 'Termo com OTP verificado com sucesso');

  const pdfWithOtp = await request(`/v1/consents/${issueWithOtp.body.id}/pdf`);
  check(pdfWithOtp.status === 200 && pdfWithOtp.body.subarray(0, 5).toString() === '%PDF-', 'PDF com OTP gerado com sucesso');

  console.log(`\n======================================================\nTODOS OS ${checks} TESTES DE ASSINATURA OPCIONAL COM/SEM OTP FORAM APROVADOS!\n======================================================`);
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
}).finally(() => server.close());
