const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-studio-payroll-')), 'test.db');
process.env.JWT_SECRET = 'studio-payroll-isolated-test';
const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();
const { PayrollController } = require('./dist/controllers/payroll.controller');
const { ServiceController } = require('./dist/controllers/service.controller');
const { readStudioCommissionTerms } = require('./dist/utils/studio-payroll-basis');
let checks = 0, seq = 0;
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
function insert(table, values) {
  const keys = Object.keys(values);
  db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(values));
}
function call(controller, body, params = {}, tenantId = 'studio') {
  const response = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  controller({ tenantId, body, params, query: {}, user: { userId: 'admin', role: 'clinic_admin' }, headers: {}, ip: '127.0.0.1' }, response);
  assert([200, 201].includes(response.code), JSON.stringify(response.data));
  return response.data;
}
for (const profile of ['studio', 'clinic', 'mixed']) insert('tenants', { id: profile, name: profile, slug: profile, establishment_profile: profile, email: `${profile}@test.invalid`, status: 'active' });
insert('users', { id: 'admin', tenant_id: 'studio', name: 'Admin', email: 'admin@test.invalid', password_hash: 'test', role: 'clinic_admin' });
for (const [id, tenant] of [['charlyze','studio'], ['co','studio'], ['clinical','clinic'], ['mixedpro','mixed']]) insert('professionals', { id, tenant_id: tenant, name: id, profession_id: 'prof-personal-trainer', remuneration_type: 'commission', commission_percentage: 50, active: 1 });
function fixture({ credits = 4, amount = 120, tenant = 'studio', pro = 'charlyze', domain = 'studio', month = '2026-11', plan = true } = {}) {
  const id = `case-${++seq}`;
  insert('patients', { id, tenant_id: tenant, full_name: id, phone: '11999999999' });
  insert('services', { id, tenant_id: tenant, name: id, professional_id: pro, duration_minutes: 50, price: 0, service_domain: domain, service_kind: 'individual', active: 1 });
  if (plan) insert('recurring_billing_plans', { id, tenant_id: tenant, patient_id: id, professional_id: pro, service_id: id, title: id, amount, start_date: `${month}-01`, end_date: '2027-12-31', billing_frequency: 'monthly', billing_cycle: 'monthly', cycle_months: 1, due_day: 1, status: 'active', credits_per_cycle_snapshot: credits, commercial_snapshot_json: JSON.stringify({ creditsPerCycle: credits, cycleAmount: amount }) });
  insert('appointments', { id, tenant_id: tenant, patient_id: id, professional_id: pro, service_id: id, appointment_number: id, start_time: `${month}-05T10:00:00`, end_time: `${month}-05T10:50:00`, status: 'completed', attendance_status: 'present', modality: 'presential', created_by: 'admin', recurring_plan_id: plan ? id : null, catalog_price_snapshot: plan ? 0 : amount });
  return { id, tenant, pro, month, amount, plan };
}
function rule(f, type = 'percentage', value = 50, terms = {}, groupBasis = 'per_present_student', pro = f.pro) {
  return call(PayrollController.upsertServiceCommissions, { rules: [{ serviceId: f.id, commissionType: type, commissionValue: value, groupPayoutBasis: groupBasis, studioTerms: { recognition: 'performed', allocation: 'contract_credits', sessionBasis: 0, revenueSharePercent: 100, ...terms } }] }, { id: pro }, f.tenant);
}
function calc(f, month = f.month, pro = f.pro) {
  return call(PayrollController.calculate, { periodMonth: month, professionalId: pro }, {}, f.tenant).results[0];
}
function item(f, month = f.month, pro = f.pro) { return calc(f, month, pro).commissionBreakdown.filter(x => x.serviceId === f.id); }
function payment(f, status, month = f.month, amount = f.amount, suffix = '') {
  insert('payments', { id: f.id + suffix, tenant_id: f.tenant, patient_id: f.id, appointment_id: f.plan ? null : f.id, recurring_plan_id: f.plan ? f.id : null, service_id: f.id, amount, status, payment_method: 'pix', payment_date: status === 'paid' ? `${month}-10` : null, competence_month: f.month });
}
const four = fixture(); rule(four);
equal(item(four)[0].grossBasisAmount, 30, '120 / 4 contractual credits, independent of zero retail');
equal(item(four)[0].commissionAmount, 15, '50% on contracted credit');
const eight = fixture({ credits: 8 }); rule(eight);
equal(item(eight)[0].commissionAmount, 7.5, '8 credits use their own snapshot');
rule(four, 'fixed', 19);
equal(item(four)[0].commissionAmount, 19, 'fixed commission independent of price');
rule(four, 'percentage', 50, { allocation: 'fixed_session', sessionBasis: 44 });
equal(item(four)[0].commissionAmount, 22, 'explicit manager session basis');
rule(four, 'percentage', 50, { allocation: 'none' });
equal(item(four)[0].commissionAmount, 0, 'no arbitrary division');
assert(calc(four).warnings.some(w => w.code === 'STUDIO_ALLOCATION_REQUIRED')); checks++;
rule(four);
// Changing catalog or adding appointments cannot change the contractual denominator.
db.prepare('UPDATE services SET price = 999, periodic_price = 999 WHERE id = ?').run(four.id);
equal(item(four)[0].commissionAmount, 15, 'historical price remains contracted');
const received = fixture(); rule(received, 'percentage', 50, { recognition: 'received' }); payment(received, 'pending');
equal(item(received).length, 0, 'pending is not received');
db.prepare("UPDATE payments SET status = 'partial' WHERE id = ?").run(received.id);
equal(item(received).length, 0, 'unconfirmed partial amount cannot generate cash commission');
db.prepare("UPDATE payments SET status = 'paid', payment_date = '2026-12-10' WHERE id = ?").run(received.id);
equal(item(received).length, 0, 'late receipt not backdated');
equal(item(received, '2026-12')[0].commissionAmount, 15, 'late receipt recognizes performed November session in December');
equal(item(received, '2026-12')[0].paymentIds, [received.id], 'receipt audit reference');
equal(item(received, '2027-01').length, 0, 'same payment is not recognized in later months');
equal(item(received, '2026-12')[0].commissionAmount, 15, 'repeated calculation is idempotent');
db.prepare("UPDATE payments SET status = 'refunded' WHERE id = ?").run(received.id);
equal(item(received, '2026-12').length, 0, 'refunded receipt excluded');
const partial = fixture({ plan: false }); rule(partial, 'percentage', 50, { recognition: 'received' });
payment(partial, 'paid', '2026-11', 40, '-paid'); payment(partial, 'pending', '2026-11', 80, '-balance');
equal(item(partial)[0].commissionAmount, 20, 'only confirmed part enters commission');
db.prepare("UPDATE payments SET status = 'paid', payment_date = '2026-12-02' WHERE id = ?").run(partial.id + '-balance');
equal(item(partial, '2026-12')[0].commissionAmount, 40, 'remaining receipt recognized once in next month');
const unperformed = fixture({ plan: false }); rule(unperformed); payment(unperformed, 'paid');
db.prepare("UPDATE appointments SET status = 'confirmed', attendance_status = 'pending' WHERE id = ?").run(unperformed.id);
equal(item(unperformed).length, 0, 'paid booking is not a performed Studio lesson');
const duo = fixture(); rule(duo); rule(duo, 'fixed', 12, {}, 'per_present_student', 'co');
insert('session_instructor_participants', { id: duo.id, tenant_id: 'studio', appointment_id: duo.id, professional_id: 'co', role: 'co_instructor', attendance_status: 'present' });
equal(item(duo)[0].commissionAmount, 15, 'primary instructor entitled');
equal(item(duo, duo.month, 'co')[0].commissionAmount, 12, 'co-instructor uses own fixed rule');
db.prepare("UPDATE session_instructor_participants SET attendance_status = 'scheduled' WHERE id = ?").run(duo.id);
equal(item(duo, duo.month, 'co').length, 0, 'scheduled co-instructor without confirmed presence excluded');
db.prepare("UPDATE session_instructor_participants SET attendance_status = 'absent' WHERE id = ?").run(duo.id);
equal(item(duo, duo.month, 'co').length, 0, 'absent instructor excluded');
const legacy = fixture({ tenant: 'clinic', pro: 'clinical', domain: 'clinical', plan: false, amount: 180 });
db.prepare('UPDATE services SET price = 180 WHERE id = ?').run(legacy.id);
db.prepare("UPDATE appointments SET status = 'confirmed', attendance_status = 'pending' WHERE id = ?").run(legacy.id);
payment(legacy, 'paid');
equal(item(legacy)[0].commissionAmount, 90, 'legacy clinic paid eligibility unchanged');
const mixed = fixture({ tenant: 'mixed', pro: 'mixedpro', domain: 'clinical', plan: false, amount: 100 });
db.prepare('UPDATE services SET price = 100 WHERE id = ?').run(mixed.id);
equal(item(mixed)[0].commissionAmount, 50, 'clinical service in mixed tenant unchanged');
const pkg = fixture({ plan: false }); rule(pkg);
insert('student_package_contracts', { id: pkg.id, tenant_id: 'studio', student_id: pkg.id, package_name_snapshot: 'Academia + Personal', contracted_price: 274, total_credits_snapshot: 4, start_date: '2026-11-01', end_date: '2026-11-30', contract_status: 'active', payment_status: 'paid' });
insert('student_package_entitlements', { id: pkg.id, tenant_id: 'studio', contract_id: pkg.id, service_id: pkg.id, service_name_snapshot: 'Personal', credits_total: 4, credits_per_cycle_snapshot: 4, entitlement_role: 'addon', addon_pricing_json: JSON.stringify({ netPriceCents: 12000, creditsPerCycle: 4 }) });
db.prepare('UPDATE appointments SET package_contract_id = ?, package_entitlement_id = ?, is_package_covered = 1 WHERE id = ?').run(pkg.id, pkg.id, pkg.id);
equal(item(pkg)[0].commissionAmount, 15, 'optional addon uses own 120, not combined 274');
db.prepare("UPDATE student_package_entitlements SET entitlement_role = 'primary', addon_pricing_json = NULL WHERE id = ?").run(pkg.id);
rule(pkg, 'percentage', 50, { revenueSharePercent: 40 });
equal(item(pkg)[0].commissionAmount, 13.7, 'combined package explicit 40% allocation: 274 * .4 / 4 * .5');
// An independently billed addon must never use the paid status of the base membership.
rule(pkg, 'percentage', 50, { recognition: 'received', revenueSharePercent: 100 });
db.prepare("UPDATE student_package_entitlements SET entitlement_role = 'addon', addon_pricing_json = ? WHERE id = ?")
  .run(JSON.stringify({ netPriceCents: 12000, creditsPerCycle: 4, effectivePeriodicity: 'quarterly', effectiveCycleMonths: 3 }), pkg.id);
db.prepare('UPDATE student_package_contracts SET commercial_snapshot_json = ? WHERE id = ?')
  .run(JSON.stringify({ breakdown: { recurringSchedules: [{ periodicity: 'quarterly', cycleMonths: 3, totalCycleAmountCents: 12000 }] } }), pkg.id);
insert('recurring_billing_plans', { id: pkg.id, tenant_id: 'studio', patient_id: pkg.id, package_contract_id: pkg.id, title: 'Base mensal', amount: 154, start_date: '2026-11-01', end_date: '2026-11-30', billing_frequency: 'monthly', status: 'active' });
insert('payments', { id: pkg.id + '-base', tenant_id: 'studio', patient_id: pkg.id, package_contract_id: pkg.id, recurring_plan_id: pkg.id, amount: 154, status: 'pending', payment_method: 'pix', competence_month: '2026-11', billing_frequency: 'monthly' });
insert('payments', { id: pkg.id + '-addon', tenant_id: 'studio', patient_id: pkg.id, package_contract_id: pkg.id, service_id: pkg.id, amount: 120, status: 'paid', payment_method: 'pix', payment_date: '2026-11-10', competence_month: '2026-11', billing_frequency: 'quarterly' });
equal(item(pkg)[0].commissionAmount, 15, 'paid quarterly addon independent of pending monthly base');
equal(item(pkg)[0].paymentIds, [pkg.id + '-addon'], 'addon payment identified in audit');
db.prepare("UPDATE payments SET status = 'pending', payment_date = NULL WHERE id = ?").run(pkg.id + '-addon');
db.prepare("UPDATE payments SET status = 'paid', payment_date = '2026-11-10' WHERE id = ?").run(pkg.id + '-base');
equal(item(pkg).length, 0, 'paid base membership cannot pay commission for unpaid independent addon');
// Service controller normalizes access identity even if an old client sends a professional.
const access = call(ServiceController.create, { name: 'Musculação', professionalId: 'charlyze', linkedProfessionalIds: ['charlyze'], serviceDomain: 'studio', studioServiceType: 'facility_access', price: 0, allowSingleBooking: false, allowPlanBooking: true, durationMinutes: 50, clinicalModule: 'ZemdaPersonal' });
const accessId = access.id || access.service?.id;
assert(accessId, JSON.stringify(access)); checks++;
const saved = db.prepare('SELECT * FROM services WHERE id = ?').get(accessId);
equal(saved.professional_id, null, 'access no artificial professional');
equal(saved.requires_appointment, 0, 'access does not require appointment');
equal(saved.clinical_module, null, 'access no clinical module');
equal(saved.duration_minutes, 0, 'access no duration');
equal(db.prepare('SELECT COUNT(*) AS n FROM professional_services WHERE service_id = ?').get(accessId).n, 0, 'access no linked instructor');
const deliverable = call(ServiceController.create, { name: 'Montagem de treino', serviceDomain: 'studio', studioServiceType: 'non_scheduled', professionalId: 'charlyze', clinicalModule: 'arbitrary-admin-module', price: 0, allowSingleBooking: false, allowPlanBooking: true });
const delivered = db.prepare('SELECT * FROM services WHERE id = ?').get(deliverable.id || deliverable.service?.id);
equal(delivered.professional_id, 'charlyze', 'deliverable keeps administrative owner');
equal(delivered.clinical_module, null, 'deliverable no clinical requirement');
equal(delivered.requires_appointment, 0, 'deliverable no reservation');

// Capacity is still enforced by existing booking tests; payroll counts only present students.
const group = fixture(); rule(group);
db.prepare("UPDATE services SET service_kind = 'group', studio_service_type = 'group' WHERE id = ?").run(group.id);
insert('class_occurrences', { id: group.id, tenant_id: 'studio', service_id: group.id, professional_id: 'charlyze', start_time: '2026-11-05T10:00:00', end_time: '2026-11-05T10:50:00', capacity: 4, status: 'completed' });
db.prepare('UPDATE appointments SET occurrence_id = ? WHERE id = ?').run(group.id, group.id);
const second = fixture();
db.prepare('UPDATE recurring_billing_plans SET service_id = ? WHERE id = ?').run(group.id, second.id);
db.prepare('UPDATE appointments SET service_id = ?, occurrence_id = ? WHERE id = ?').run(group.id, group.id, second.id);
equal(item(group)[0].eligibleStudentsCount, 2, 'two present group students');
equal(item(group)[0].commissionAmount, 30, 'group sums contracted bases of both students');
rule(group, 'fixed', 18, {}, 'per_class');
equal(item(group)[0].commissionAmount, 18, 'fixed class paid once, not per student');
rule(group, 'fixed', 18);
equal(item(group)[0].commissionAmount, 36, 'fixed per present student');
db.prepare("UPDATE appointments SET attendance_status = 'absent' WHERE id = ?").run(second.id);
equal(item(group)[0].commissionAmount, 18, 'absent student excluded');
const capped = fixture(); rule(capped);
for (let n = 2; n <= 5; n++) {
  const original = db.prepare('SELECT * FROM appointments WHERE id = ?').get(capped.id);
  insert('appointments', { ...original, id: `${capped.id}-${n}`, appointment_number: `${capped.id}-${n}`, start_time: `2026-11-${String(5 + n).padStart(2, '0')}T10:00:00` });
}
equal(item(capped).reduce((sum, i) => sum + i.commissionAmount, 0), 60, 'five bookings cannot consume more than four paid contractual credits');
const cancelled = fixture(); rule(cancelled); payment(cancelled, 'cancelled');
equal(item(cancelled).length, 0, 'cancelled cycle excluded');
const oneTime = fixture({ credits: 8, amount: 240 }); rule(oneTime, 'percentage', 50, { recognition: 'received' });
db.prepare("UPDATE recurring_billing_plans SET payment_periodicity = 'installments', total_contract_amount = 240, included_sessions = 8 WHERE id = ?").run(oneTime.id);
payment(oneTime, 'paid', '2026-11', 120, '-one');
insert('payments', { id: oneTime.id + '-two', tenant_id: 'studio', patient_id: oneTime.id, recurring_plan_id: oneTime.id, amount: 120, status: 'paid', payment_method: 'pix', payment_date: '2026-12-10', competence_month: null });
equal(item(oneTime)[0].commissionAmount, 7.5, 'installment is a fraction of contract basis');
equal(item(oneTime, '2026-12')[0].commissionAmount, 7.5, 'second installment recognized without duplicating contract');
const { StudioAccessService } = require('./dist/services/studio-access.service');
const options = [
  { id: 'annual-monthly', contractDurationCode: '12_months', paymentPeriodicity: 'monthly', commercialUnit: 'per_month', amountCents: 9999 },
  { id: 'annual-total', contractDurationCode: '12_months', paymentPeriodicity: 'monthly', commercialUnit: 'contract_total', amountCents: 120000 },
  { id: 'monthly', contractDurationCode: '1_month', paymentPeriodicity: 'monthly', commercialUnit: 'per_month', amountCents: 15400 }
].map(o => ({ ...o, active: true, accessType: 'unlimited', frequencyType: 'unlimited', frequencyCount: null, participantsCount: 1, installmentsCount: 1, creditMode: 'unlimited', allowPublicBooking: true }));
db.prepare("UPDATE services SET billing_mode = 'annual', commercial_price_options_json = ? WHERE id = ?").run(JSON.stringify(options), accessId);
const beforeAppointments = db.prepare('SELECT COUNT(*) n FROM appointments').get().n;
const snapshots = [];
for (const [index, option] of options.entries()) {
  const student = fixture();
  const enrollment = StudioAccessService.createEnrollmentTx({ tenantId: 'studio', studentId: student.id, serviceId: accessId, professionalId: 'charlyze', commercialOptionId: option.id, startDate: '2026-11-01', createdBy: 'admin' });
  const plan = enrollment.plan;
  equal(plan.professional_id, null, 'access enrollment never assigned to instructor');
  equal(plan.billing_frequency, 'monthly', 'commercial monthly frequency overrides annual service default');
  equal(plan.amount, [99.99, 100, 154][index], 'unit and total price produce correct monthly amount');
  equal(plan.total_contract_amount, [1199.88, 1200, 154][index], 'contract duration independent of billing');
  equal(db.prepare('SELECT amount FROM payments WHERE recurring_plan_id = ?').get(plan.id).amount, plan.amount, 'charge matches contracted installment');
  assert(db.prepare('SELECT id FROM student_contract_history WHERE recurring_plan_id = ?').get(plan.id)); checks++;
  snapshots.push([plan.id, plan.commercial_snapshot_json]);
}
equal(db.prepare('SELECT COUNT(*) n FROM appointments').get().n, beforeAppointments + options.length, 'access creates no appointments (only three explicit test fixtures)');
db.prepare('UPDATE services SET commercial_price_options_json = ? WHERE id = ?').run(JSON.stringify(options.map(o => ({ ...o, amountCents: 90000 }))), accessId);
for (const [id, snapshot] of snapshots) equal(db.prepare('SELECT commercial_snapshot_json FROM recurring_billing_plans WHERE id = ?').get(id).commercial_snapshot_json, snapshot, 'catalog edits preserve historical commercial snapshots');
// Sparse update clears an old incorrect link without recreating the service.
db.prepare('UPDATE services SET professional_id = ?, duration_minutes = 50 WHERE id = ?').run('charlyze', accessId);
call(ServiceController.update, { name: 'Musculação geral' }, { id: accessId });
equal({ ...db.prepare('SELECT professional_id, duration_minutes FROM services WHERE id = ?').get(accessId) }, { professional_id: null, duration_minutes: 0 }, 'sparse edit normalizes access in place');

const converted = fixture();
call(ServiceController.update, { studioServiceType: 'facility_access', professionalId: 'charlyze', linkedProfessionalIds: ['charlyze'], availabilityMode: 'custom_windows', availabilityWindows: [], clinicalModule: 'ZemdaPersonal' }, { id: converted.id });
equal(db.prepare('SELECT professional_id FROM services WHERE id = ?').get(converted.id).professional_id, null, 'conversion ignores obsolete professional availability inputs');
equal(db.prepare('SELECT service_id FROM appointments WHERE id = ?').get(converted.id).service_id, converted.id, 'conversion preserves appointment history');

assert.throws(() => readStudioCommissionTerms({ recognition: 'pending' }), /base de comissão/);
assert.throws(() => readStudioCommissionTerms({ revenueSharePercent: 101 }), /rateio/);
assert.throws(() => readStudioCommissionTerms({ sessionBasis: -1 }), /rateio/);



console.log(`PASS ${checks + 3} targeted Studio finance/service checks`);
