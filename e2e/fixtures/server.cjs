// Reuse the isolated synthetic clinical integration fixture. It always creates
// a new OS temporary database and never opens the application's database.
const path = require('node:path');
process.env.NODE_ENV = 'test';
process.env.EMAIL_OTP_SECRET = 'e2e-only-otp-secret';
process.env.GEMINI_API_KEY = '';
process.env.RESEND_API_KEY = '';
process.env.JWT_SECRET = 'e2e-only-secret-never-production';
process.env.R2_MOCK_STORAGE = 'true';
process.env.CLINICAL_FRONTEND_DIST = path.resolve(__dirname, '../../frontend/dist');
process.argv.push('--serve');
const { app, db } = require('../../backend/test-consultations.cjs');
const bcrypt = require('../../backend/node_modules/bcryptjs');
// Deterministic OTP provider for the isolated E2E process, without email delivery.
const { EmailService } = require('../../backend/dist/services/email.service');
EmailService.requestVerificationCode = async (email, purpose = 'clinic_registration') => {
  if (!email.endsWith('@test.invalid')) throw new Error('Synthetic accounts only');
  db.prepare("UPDATE email_verifications SET status='invalidated' WHERE email=? AND purpose=? AND status='pending'").run(email,purpose);
  db.prepare("INSERT INTO email_verifications(id,email,purpose,code_hash,status,expires_at) VALUES(?,?,?,?,'pending',datetime('now','+10 minutes'))").run(require('node:crypto').randomUUID(),email,purpose,EmailService.hashCode(email,'123456',purpose));
  return {success:true};
};

db.prepare("INSERT INTO users(id,name,email,password_hash,role,status) VALUES('e2e-root','SuperAdmin de teste','root@test.invalid',?,'superadmin','active')").run(bcrypt.hashSync('Local-Test-Only-2026', 4));
db.prepare("INSERT INTO patients(id,tenant_id,full_name,phone) VALUES('pat-fisio-second','test-clinic','Segundo paciente sintético','11999990000')").run();
db.prepare("INSERT INTO users(id,tenant_id,name,email,password_hash,role,status,profession_id,profession_name,zemda_estetic_enabled) VALUES('estetic','test-clinic','Esteticista de teste','estetic@test.invalid',?,'professional','active','prof-esteticista','Esteticista',1)").run(bcrypt.hashSync('Local-Test-Only-2026',4));
db.prepare("INSERT INTO clinic_users(id,tenant_id,user_id,role,status) VALUES('cu-estetic','test-clinic','estetic','professional','active')").run();
db.prepare("INSERT INTO professionals(id,tenant_id,user_id,name,profession_id,practice_areas,zemda_estetic_enabled) VALUES('pro-estetic','test-clinic','estetic','Esteticista de teste','prof-esteticista','Estética',1)").run();
db.prepare("INSERT INTO patients(id,tenant_id,full_name,phone) VALUES('pat-estetic','test-clinic','Paciente sintético estética','11999990000')").run();
db.prepare("INSERT INTO appointments(id,tenant_id,appointment_number,patient_id,professional_id,service_id,start_time,end_time,status,modality,clinical_module) SELECT 'apt-estetic',tenant_id,'TEST-ESTETIC','pat-estetic','pro-estetic',service_id,start_time,end_time,'scheduled',modality,'ZemdaEstetic' FROM appointments WHERE id='apt-fisio'").run();
// These routes belong only to this ephemeral test process.
app.post('/__e2e/verified-email', (req, res) => {
  if (!String(req.body.email).endsWith('@test.invalid')) return res.sendStatus(400);
  const token = require('../../backend/test-fixtures/verified-email.cjs')(req.body.email, req.body.purpose);
  res.json({ token });
});
app.post('/__e2e/failure/:id', (_req, res) => res.status(503).json({ error: 'CLINICAL_SECRET_MUST_NOT_APPEAR_IN_TELEMETRY' }));

for (const suffix of ['A','B']) db.prepare("INSERT INTO patients(id,tenant_id,full_name,phone) VALUES(?,'test-clinic',?,'11999990001')").run('pat-estetic-'+suffix,'Estética paciente '+suffix);
db.prepare("INSERT INTO inventory_items(id,tenant_id,name,category,quantity,unit,batch_number,expiration_date,active) VALUES('estetic-stock','test-clinic','Produto sintético','consumable',20,'ml','LOTE-E2E','2028-01-01',1)").run();

require('../../backend/dist/services/capability.service').CapabilityService.setUserPracticeAreas('estetic','test-clinic',['pa-estet-facial','pa-estet-corporal','pa-estet-capilar']);
