const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const sharp = require('sharp');
const AdmZip = require('adm-zip');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');

process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-catalog-')), 'test.db');
process.env.JWT_SECRET = 'studio-catalog-fixture-secret-123456789';
process.env.NODE_ENV = 'test';
const { initializeDatabase, db } = require('./dist/config/database');
const { GeminiService } = require('./dist/services/gemini.service');
const { generateToken } = require('./dist/utils/jwt');
const { calculateAvailableSlots } = require('./dist/utils/slot-calculator');
const { BillingCycleService } = require('./dist/services/billing-cycle.service');
initializeDatabase();

const endpoint = '/v1/studio/catalog-imports';
const upload = (fileName, bytes) => ({ fileName, base64: Buffer.from(bytes).toString('base64') });
const monthly = (amountCents, frequencyCount = null, extra = {}) => ({
  amountCents, frequencyCount, frequencyType: frequencyCount ? 'weekly' : 'unlimited',
  unit: 'per_month', duration: '1_month', paymentPeriod: 'monthly', sources: [1], ...extra
});
const periodic = (amountCents, duration, paymentPeriod, frequencyCount = null) => monthly(amountCents, frequencyCount, {
  unit: 'per_cycle', paymentPeriod, duration
});
const single = amountCents => ({ unit: 'per_session', amountCents, sources: [1] });
const slot = (dayOfWeek, startTime, endTime) => ({ dayOfWeek, startTime, endTime, sources: [1] });
const scheduled = (name, type, extra = {}) => ({
  name, type, modality: 'presential', durationMinutes: 50, professionalNames: ['Ana'], sources: [1], ...extra
});
const fixture = {
  services: [
    { name: 'Musculação', type: 'access_unlimited', sources: [1], prices: [
      monthly(15000), periodic(39000, '3_months', 'quarterly'),
      periodic(65000, '6_months', 'semiannual'), periodic(120000, '12_months', 'annual')
    ] },
    scheduled('Personal Individual', 'individual', { prices: [single(8000)] }),
    scheduled('Personal em Dupla', 'duo', { prices: [monthly(16000, 1, { unit: 'per_participant', participants: 2 })] }),
    scheduled('Pilates Individual', 'individual', { prices: [monthly(28000, 1)], schedules: [slot(1, '08:00', '08:50'), slot(3, '08:00', '08:50')] }),
    scheduled('Pilates Individual', 'individual', { sources: [2], prices: [
      monthly(28000, 1, { sources: [2] }), monthly(48000, 2, { sources: [2] })
    ] }),
    scheduled('Pilates em Dupla', 'duo', { prices: [single(7500)] }),
    scheduled('Pilates em Grupo', 'group', { capacity: 8, prices: [single(6500)], schedules: [slot(3, '16:00', '16:50')] }),
    scheduled('Funcional', 'group', { capacity: 10, prices: [
      monthly(12000, 2), periodic(60000, '6_months', 'semiannual', 2),
      monthly(120000, 2, { unit: 'contract_total', duration: '12_months', paymentPeriod: 'installments', installments: 12 })
    ] }),
    scheduled('Dança', 'group', { capacity: 12, schedules: [slot(2, '09:00', '09:50'), slot(4, '10:00', '10:50')] }),
    scheduled('Zumba', 'group', { durationMinutes: 60, capacity: 12, schedules: [
      { ...slot(3, '19:00', '20:00'), professionalName: 'Profa. Ana' },
      { ...slot(5, '19:00', '19:45'), professionalName: 'Bia' }
    ] }),
    { name: 'Avaliação', type: 'deliverable', sources: [3] },
    scheduled('Plano ambíguo', 'individual', { prices: [{ label: 'Anual', amountCents: 9900, evidence: 'Anual R$ 99', sources: [4] }] }),
    { name: 'Documento incompleto', type: 'individual', sources: [5] }
  ],
  packages: [
    { name: 'Academia + Personal', sources: [1], price: monthly(22000), items: [
      { serviceName: 'Musculação' }, { serviceName: 'Personal Individual', includedCredits: 4 }
    ] },
    { name: 'Avaliação + Treino', sources: [3], price: monthly(19000, null, { unit: 'contract_total', paymentPeriod: 'one_time' }),
      items: [{ serviceName: 'Avaliação', includedCredits: 1 }, { serviceName: 'Pilates Individual', includedCredits: 4 }] }
  ]
};

function seed(id, profile, role = 'clinic_admin') {
  const user = 'user-' + id;
  const email = user + '@test.invalid';
  db.prepare(`INSERT INTO tenants (id, slug, name, email, status, onboarding_completed, onboarding_status, manager_confirmed, billing_required, establishment_profile)
    VALUES (?, ?, ?, ?, 'active', 1, 'active', 1, 0, ?)`).run(id, id, id, email, profile);
  db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, onboarding_status, email_verified)
    VALUES (?, ?, 'Teste', ?, 'unused', ?, 'active', 'active', 1)`).run(user, id, email, role);
  db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager)
    VALUES (?, ?, ?, ?, 'active', ?)`).run('member-' + id, id, user, role, role === 'clinic_admin' ? 1 : 0);
  const profId = 'prof-' + id;
  db.prepare(`INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, profession_name, active)
    VALUES (?, ?, ?, 'Ana', 'prof-personal-trainer', 'Personal Trainer', 1)`).run(profId, id, user);
  for (const weekday of [1, 2, 3, 4, 5]) {
    db.prepare(`INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time)
      VALUES (?, ?, ?, ?, '07:00', '18:00')`).run(id + '-shift-' + weekday, id, profId, weekday);
  }
  const token = generateToken({ userId: user, tenantId: id, role, email });
  return { profId, headers: { Authorization: 'Bearer ' + token, 'x-tenant-id': id } };
}

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use('/api', require('./dist/routes').default);

async function main() {
  const studio = seed('studio-fixture', 'studio');
  const mixed = seed('mixed-fixture', 'mixed');
  const clinic = seed('clinic-fixture', 'clinic');
  const denied = seed('denied-fixture', 'studio', 'receptionist');
  db.prepare(`INSERT INTO professionals (id, tenant_id, name, profession_id, profession_name, active)
    VALUES (?, 'studio-fixture', ?, 'prof-personal-trainer', 'Personal Trainer', ?)`).run('prof-bia', 'Bia', 1);
  db.prepare("INSERT INTO professionals (id, tenant_id, name, active) VALUES ('prof-inativa', 'studio-fixture', 'Inativa', 0)").run();
  const shift = db.prepare(`INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, break_start, break_end)
    VALUES (?, 'studio-fixture', ?, ?, ?, ?, ?, ?)`);
  shift.run('wed-first', studio.profId, 3, '19:00', '19:30', null, null);
  shift.run('wed-second', studio.profId, 3, '19:30', '20:00', null, null);
  shift.run('fri-evening', 'prof-bia', 5, '17:00', '19:45', '18:30', '19:00');
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const url = 'http://127.0.0.1:' + server.address().port + '/api';
  async function call(method, route, actor = studio, body) {
    const response = await fetch(url + route, {
      method, headers: { ...actor?.headers, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, data: await response.json() };
  }
  async function ok(method, route, actor, body) {
    const { status, data } = await call(method, route, actor, body);
    assert.ok(status >= 200 && status < 300, JSON.stringify({ status, data }));
    return data;
  }
  try {
    assert.equal((await call('GET', endpoint, clinic)).status, 403);
    assert.equal((await call('GET', endpoint, denied)).status, 403);
    assert.equal((await call('GET', endpoint, {})).status, 401);
    const image = await sharp({ create: { width: 64, height: 32, channels: 3, background: '#ff00ff' } }).png().toBuffer();
    const docx = new AdmZip();
    docx.addFile('word/document.xml', Buffer.from('<w:document><w:p><w:t>Avaliação + Treino</w:t></w:p></w:document>'));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Plano', 'Preço'], ['Anual', 99]]), 'Tabela');
    const pdf = await new Promise((resolve, reject) => {
      const doc = new PDFDocument();
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.text('Catálogo de testes').end();
    });
    const files = [
      upload('cartaz.png', image), upload('grade.csv', 'Plano;Valor\nPilates;280'),
      upload('beneficios.docx', docx.toBuffer()), upload('planos.xlsx', XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })),
      upload('catalogo.pdf', pdf), upload('cartaz-copia.png', image)
    ];
    let providerRequests = 0;
    GeminiService.isConfigured = () => false;
    assert.equal((await call('POST', endpoint + '/analyze', studio, { files })).status, 503);
    GeminiService.isConfigured = () => true;
    GeminiService.extractStudioCatalog = async (prompt, inputs) => {
      providerRequests++;
      assert.match(prompt, /Não invente/);
      assert.equal(inputs.length, 5);
      assert.equal(inputs[0].mimeType, 'image/jpeg');
      assert.match(inputs[1].text, /Pilates/);
      assert.match(inputs[2].text, /Avaliação \+ Treino/);
      assert.match(inputs[3].text, /Anual/);
      assert.equal(inputs[4].mimeType, 'application/pdf');
      return structuredClone(fixture);
    };
    assert.equal((await call('POST', endpoint + '/analyze', studio, { files: [upload('falso.pdf', 'não é PDF')] })).status, 400);
    const draft = await ok('POST', endpoint + '/analyze', studio, { files });
    assert.equal(draft.sources[0].copies, 2);
    assert.equal(draft.proposal.services.length, 12);
    assert.deepEqual(draft.catalog.professionals.map(p => p.id).sort(), ['prof-bia', studio.profId].sort());
    assert.equal(draft.proposal.services.find(r => r.name === 'Pilates Individual').prices.length, 2);
    assert.equal(draft.proposal.services.find(r => r.name === 'Plano ambíguo').prices[0].unit, null);
    assert.ok(draft.proposal.services.find(r => r.name === 'Documento incompleto').issues.length);
    assert.ok(draft.proposal.services.every(row => row.action === 'ignore' && !row.reviewed));
    assert.equal((await ok('POST', endpoint + '/analyze', studio, { files: [...files].reverse() })).id, draft.id);
    assert.equal(providerRequests, 1);
    assert.equal((await call('GET', endpoint + '/' + draft.id, mixed)).status, 404);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM services WHERE tenant_id = ?').get('studio-fixture').n, 0);
    assert.ok(!JSON.stringify(db.prepare('SELECT * FROM studio_catalog_imports WHERE id = ?').get(draft.id)).includes(files[0].base64));

    const proposal = draft.proposal;
    const find = name => proposal.services.find(row => row.name === name);
    for (const row of proposal.services) {
      row.action = 'create';
      row.reviewed = true;
      if (row.modality) row.professionalId = studio.profId;
    }
    for (const row of proposal.packages) {
      row.action = 'create';
      row.reviewed = true;
      for (const item of row.items) item.serviceRef = find(item.serviceName).key;
    }
    const zumba = find('Zumba');
    const [wed, fri] = zumba.schedules;
    assert.equal(wed.professionalId, '');
    assert.equal(wed.professionalName, 'Profa. Ana');
    fri.professionalId = 'prof-bia';
    const urlDraft = endpoint + '/' + draft.id;
    const saved = await ok('PUT', urlDraft, studio, { proposal, revision: draft.revision });
    assert.equal((await ok('GET', endpoint, studio))[0].id, draft.id);
    assert.equal((await ok('GET', urlDraft, studio)).proposal.services[0].action, 'create');
    assert.equal((await call('PUT', urlDraft, studio, { proposal, revision: draft.revision })).status, 409);
    const confirm = () => call('POST', urlDraft + '/confirm', studio, { confirmed: true, proposal, revision: saved.revision });
    assert.equal((await call('POST', urlDraft + '/confirm', studio, { confirmed: false })).status, 400);
    const rejected = await confirm();
    assert.equal(rejected.status, 400, JSON.stringify(rejected));
    assert.match(rejected.data.error, /ambíguo/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM services WHERE tenant_id = ?').get('studio-fixture').n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM class_schedules WHERE tenant_id = ?').get('studio-fixture').n, 0);
    find('Plano ambíguo').action = 'ignore';
    find('Documento incompleto').action = 'ignore';
    const dance = find('Dança');
    const originalStart = dance.schedules[0].startTime;
    dance.schedules[0].startTime = '06:00';
    assert.match((await confirm()).data.error, /escala/);
    dance.schedules[0].startTime = originalStart;
    async function rejectsZumba(pattern) {
      const failure = await confirm();
      assert.equal(failure.status, 400);
      assert.match(failure.data.error, pattern);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM class_schedules WHERE tenant_id = ?').get('studio-fixture').n, 0);
    }
    for (const invalidId of ['user-studio-fixture', mixed.profId, 'prof-inativa']) {
      fri.professionalId = invalidId;
      await rejectsZumba(/Zumba.*Sexta-feira.*19:00–19:45.*profissional ativo/);
    }
    fri.professionalId = '';
    await rejectsZumba(/Sexta-feira.*19:00–19:45.*escala de Ana.*07:00–18:00/);
    fri.professionalId = 'prof-bia';
    fri.endTime = '19:46';
    await rejectsZumba(/Sexta-feira.*19:00–19:46.*escala de Bia.*19:00–19:45/);
    fri.endTime = '19:45';
    fri.startTime = '18:59';
    await rejectsZumba(/Sexta-feira.*18:59–19:45.*escala de Bia.*17:00–18:30, 19:00–19:45/);
    fri.startTime = '19:00';
    fri.dayOfWeek = 6;
    await rejectsZumba(/Sábado.*19:00–19:45.*escala de Bia.*Nenhuma faixa/);
    fri.dayOfWeek = 5;
    const result = await confirm();
    assert.equal(result.status, 200, JSON.stringify(result));
    assert.equal(result.data.result.services.length, 10);
    assert.equal(result.data.result.packages.length, 2);
    assert.deepEqual((await confirm()).data.result, result.data.result);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action = 'CONFIRM_STUDIO_CATALOG_IMPORT' AND tenant_id = ?").get('studio-fixture').n, 1);
    const catalog = await ok('GET', '/v1/services', studio);
    const service = name => catalog.find(row => row.name === name);
    assert.equal(service('Musculação').requires_appointment, 0);
    assert.equal(service('Musculação').commercial_price_options.length, 4);
    assert.equal(service('Personal em Dupla').default_capacity, 2);
    assert.equal(service('Personal Individual').price, 80);
    assert.equal(service('Pilates Individual').commercial_price_options.length, 2);
    assert.equal(service('Pilates Individual').availability_windows.length, 2);
    assert.equal(service('Pilates em Dupla').default_capacity, 2);
    assert.equal(service('Pilates em Grupo').default_capacity, 8);
    assert.equal(service('Funcional').commercial_price_options[2].installmentsCount, 12);
    assert.equal(service('Dança').class_schedules.length, 2);
    assert.deepEqual(service('Zumba').class_schedules.map(s => [s.day_of_week, s.start_time, s.end_time, s.professional_id])
      .sort((a, b) => a[0] - b[0]), [[3, '19:00', '20:00', studio.profId], [5, '19:00', '19:45', 'prof-bia']]);
    assert.equal(service('Avaliação').requires_appointment, 0);
    const nextMonday = new Date();
    nextMonday.setUTCDate(nextMonday.getUTCDate() + ((8 - nextMonday.getUTCDay()) % 7 || 7));
    const available = calculateAvailableSlots('studio-fixture', studio.profId, service('Pilates Individual').id, nextMonday.toISOString().slice(0, 10));
    assert.ok(available.some(slot => slot.startTime.includes('T08:00')), JSON.stringify(available));
    const packages = (await ok('GET', '/v1/packages', studio)).packages;
    assert.equal(packages.find(p => p.name === 'Academia + Personal').items.length, 2);
    assert.equal(packages.find(p => p.name === 'Avaliação + Treino').items.length, 2);
    assert.equal(service('Musculação').allow_public_booking, 1);
    db.prepare(`UPDATE tenants SET public_booking_enabled = 1, public_booking_slug = 'studio-fixture' WHERE id = 'studio-fixture'`).run();
    const pubCatalogRes = await ok('GET', '/v1/public/tenants/studio-fixture');
    assert.ok(pubCatalogRes.services.some(s => s.name === 'Musculação'));
    assert.ok(pubCatalogRes.services.some(s => s.name === 'Zumba' && s.weekly_schedule_summary?.length > 0));
    assert.ok(pubCatalogRes.services.some(s => s.name === 'Pilates Individual'));
    assert.ok(pubCatalogRes.services.some(s => s.name === 'Avaliação'));
    assert.ok(pubCatalogRes.packages.some(p => p.name === 'Academia + Personal'));
    assert.ok(pubCatalogRes.packages.some(p => p.name === 'Avaliação + Treino'));

    db.prepare("INSERT INTO patients (id, tenant_id, full_name) VALUES ('student-fixture', ?, 'Aluno Teste')").run('studio-fixture');
    const enroll = await ok('POST', '/v1/studio/enrollments', studio, {
      studentId: 'student-fixture', serviceId: service('Musculação').id, startDate: '2026-11-18',
      commercialOptionId: service('Musculação').commercial_price_options[2].id, generateInitialCharge: false
    });
    assert.ok(enroll);
    const contract = db.prepare('SELECT * FROM recurring_billing_plans WHERE tenant_id = ?').get('studio-fixture');
    assert.equal(contract.amount, 650);
    assert.equal(contract.end_date, '2027-05-17');
    assert.equal(contract.payment_periodicity, 'semiannual');
    assert.equal(contract.covers_sessions, 0);
    const installmentOption = service('Funcional').commercial_price_options[2];
    await ok('POST', '/v1/studio/enrollments', studio, {
      studentId: 'student-fixture', serviceId: service('Funcional').id, startDate: '2026-11-18',
      commercialOptionId: installmentOption.id
    });
    const installmentPlan = db.prepare('SELECT * FROM recurring_billing_plans WHERE tenant_id = ? AND service_id = ?')
      .get('studio-fixture', service('Funcional').id);
    assert.equal(installmentPlan.payment_periodicity, 'installments');
    assert.equal(installmentPlan.weekly_frequency, 2);
    const aggregatePayments = () => db.prepare('SELECT COUNT(*) n, SUM(amount) total FROM payments WHERE recurring_plan_id = ?').get(installmentPlan.id);
    assert.equal(aggregatePayments().n, 12);
    assert.equal(aggregatePayments().total, 1200);
    BillingCycleService.generateCyclesForPlanTx({ tenantId: 'studio-fixture', plan: installmentPlan, generateAllContractCycles: true });
    assert.equal(aggregatePayments().n, 12);

    GeminiService.extractStudioCatalog = async () => ({
      services: [
        { name: 'Musculação', type: 'access_unlimited', prices: [monthly(99900)] },
        { name: 'Dança', type: 'group' },
        { name: 'Pilates em Grupo', type: 'group' },
        { name: 'Pilates Individual', type: 'individual', schedules: [
          { ...slot(2, '10:00', '10:40'), professionalName: 'Profa. Ana' }
        ] }
      ], packages: []
    });
    const duplicates = await ok('POST', endpoint + '/analyze', studio, { files: [upload('revisao.csv', 'Plano,Valor\nMusculação,999')] });
    assert.equal(duplicates.matches.services.s1[0].id, service('Musculação').id);
    const update = duplicates.proposal.services[0];
    Object.assign(update, { action: 'update', existingId: service('Musculação').id, apply: ['prices'], reviewed: true });
    const retry = () => call('POST', endpoint + '/' + duplicates.id + '/confirm', studio, { confirmed: true, proposal: duplicates.proposal, revision: duplicates.revision });
    assert.match((await retry()).data.error, /preservar/);
    update.prices = [monthly(250000, null, { unit: 'contract_total', paymentPeriod: 'one_time', duration: '24_months' })];
    const danceId = service('Dança').id;
    db.prepare('UPDATE professional_services SET custom_price = 93, custom_duration = 47 WHERE service_id = ? AND professional_id = ?')
      .run(danceId, studio.profId);
    Object.assign(duplicates.proposal.services[1], { action: 'update', apply: ['identity'], reviewed: true, existingId: danceId, notes: 'Aulas para iniciantes.' });
    Object.assign(duplicates.proposal.services[2], { action: 'link', reviewed: true, existingId: service('Pilates em Grupo').id });
    const pilatesId = service('Pilates Individual').id;
    assert.equal(duplicates.catalog.services.find(s => s.id === pilatesId).professionalId, studio.profId);
    db.prepare('UPDATE professional_services SET custom_duration = 40 WHERE service_id = ? AND professional_id = ?')
      .run(pilatesId, studio.profId);
    const pilatesUpdate = duplicates.proposal.services[3];
    Object.assign(pilatesUpdate, { action: 'update', apply: ['schedules'], reviewed: true, existingId: pilatesId, professionalId: 'prof-bia' });
    const pilatesSlot = pilatesUpdate.schedules[0];
    pilatesSlot.professionalId = 'prof-bia';
    assert.match((await retry()).data.error, /Terça-feira.*10:00–10:40.*escala de Bia/);
    pilatesSlot.professionalId = '';
    pilatesSlot.endTime = '10:39';
    assert.match((await retry()).data.error, /Terça-feira.*10:00–10:39.*Ana.*40 minutos/);
    pilatesSlot.endTime = '10:40';
    const updateResult = await retry();
    assert.equal(updateResult.status, 200, JSON.stringify(updateResult));
    assert.equal(db.prepare(`SELECT professional_id FROM service_availability_windows WHERE service_id = ?
      AND active = 1 AND day_of_week = 2 AND start_time = '10:00' AND end_time = '10:40'`).get(pilatesId).professional_id, studio.profId);
    assert.equal(db.prepare('SELECT amount FROM recurring_billing_plans WHERE id = ?').get(contract.id).amount, 650);
    const danceTerms = db.prepare('SELECT custom_price, custom_duration FROM professional_services WHERE service_id = ? AND professional_id = ?').get(danceId, studio.profId);
    assert.equal(danceTerms.custom_price, 93);
    assert.equal(danceTerms.custom_duration, 47);
    assert.equal(JSON.parse(db.prepare('SELECT commercial_price_options_json FROM services WHERE id = ?').get(service('Musculação').id).commercial_price_options_json).length, 5);

    const clinicService = await ok('POST', '/v1/services', mixed, { name: 'Consulta clínica', serviceDomain: 'clinical', professionalId: mixed.profId, price: 20 });
    GeminiService.extractStudioCatalog = async () => ({ services: [{ name: 'Consulta clínica', type: 'access_unlimited' }], packages: [] });
    const mixedDraft = await ok('POST', endpoint + '/analyze', mixed, { files: [upload('misto.csv', 'Nome,Tipo\nConsulta clínica,livre')] });
    assert.deepEqual(mixedDraft.matches.services.s1, []);
    const mixedRow = mixedDraft.proposal.services[0];
    Object.assign(mixedRow, { action: 'link', reviewed: true, existingId: clinicService.id });
    const mixedBody = { confirmed: true, proposal: mixedDraft.proposal, revision: mixedDraft.revision };
    assert.equal((await call('POST', endpoint + '/' + mixedDraft.id + '/confirm', mixed, mixedBody)).status, 400);
    mixedRow.action = 'create';
    await ok('POST', endpoint + '/' + mixedDraft.id + '/confirm', mixed, mixedBody);
    assert.equal(db.prepare("SELECT count(*) n FROM services WHERE tenant_id = ? AND service_domain = 'studio'").get('mixed-fixture').n, 1);
    console.log('PASS: formatos, revisão, rascunho, permissões, atomicidade, deduplicação, catálogo, preços, grade, pacotes e matrícula.');
  } finally { await new Promise(resolve => server.close(resolve)); }
}

main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
