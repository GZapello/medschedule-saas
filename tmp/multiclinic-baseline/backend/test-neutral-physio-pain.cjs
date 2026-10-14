const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

// Reuse the regional integration fixture exclusively in an isolated database.
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-neutral-pain-')), 'test.db');
const filename = path.join(__dirname, 'test-physio-zemda360-regional.cjs');
const source = fs.readFileSync(filename, 'utf8') + `
for (const painScore of [undefined, null, '', 0, 5]) {
  let status = 200, result;
  const response = { status(code) { status = code; return this; }, json(value) { result = value; return this; } };
  PhysiotherapyController.createAssessment({
    tenantId, user: { userId: physioUserId, role: 'professional', name: 'Test' },
    body: { patientId, chiefComplaint: 'Avaliação de teste', painScore }, params: {}
  }, response);
  assert.strictEqual(status, 201, JSON.stringify(result));
  const row = db.prepare('SELECT pain_score FROM physiotherapy_assessments WHERE id = ?').get(result.id);
  assert.strictEqual(row.pain_score, painScore === '' || painScore == null ? null : painScore);
}
console.log('PASS: missing pain remains NULL; explicitly assessed zero and five remain unchanged.');
`;
const fixture = new Module(filename, module);
fixture.filename = filename;
fixture.paths = Module._nodeModulePaths(__dirname);
fixture._compile(source, filename);
