process.env.CLINICAL_FRONTEND_DIST = require('node:path').resolve(__dirname, '../../tmp/onboarding-dist');
require('./server.cjs');
const { db } = require('../../backend/test-consultations.cjs');
const bcrypt = require('../../backend/node_modules/bcryptjs');
for (const [id, permissions] of [
  ['tour-reception', ['view_schedule', 'create_appointment', 'create_patient']],
  ['tour-finance', ['view_financial', 'view_reports', 'view_budgets']],
]) {
  // Synthetic users in the fixture's new temporary database only.
  const role = id === 'tour-reception' ? 'receptionist' : 'financial';
  db.prepare("INSERT INTO users(id,tenant_id,name,email,password_hash,role,status) VALUES(?,'test-clinic',?,?,?,?,'active')")
    .run(id,id,`${id}@test.invalid`,bcrypt.hashSync('Local-Test-Only-2026',4),role);
  db.prepare("INSERT INTO clinic_users(id,tenant_id,user_id,role,status,permissions_json) VALUES(?,'test-clinic',?,?,'active',?)")
    .run('cu-'+id,id,role,JSON.stringify(permissions));
}
