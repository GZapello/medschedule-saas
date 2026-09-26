const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-media-')), 'test.db');
const { db, initializeDatabase } = require('./dist/config/database');
const { DEFAULT_EXERCISE_LIBRARY: catalog, seedExerciseLibrary } = require('./dist/config/exercise-library.seed');
const { exerciseAnimation } = require('./dist/services/exercise-media');
const { stableExercisePhoto, imageAttribution } = require('./dist/services/personal-exercise-utils');
const { PersonalController } = require('./dist/controllers/personal.controller');
const media = require('./src/config/exercise-library.media.json');
const report = require('../docs/exercise-media/validation-report.json');

async function main() {
  initializeDatabase();
  assert.equal(catalog.length, 268);
  assert.equal(report.exercises.length, 268);
  assert.deepEqual(report.exercises.map(e => e.zemda_id).sort(), catalog.map(e => e.id).sort());
  assert.equal(media.length, report.counts.aprovado);
  for (const entry of report.exercises) {
    assert.equal(media.some(m => m.exercise_id === entry.zemda_id), entry.resultado === 'aprovado');
    if (entry.resultado !== 'aprovado') assert.equal(entry.dataset_id, null);
  }
  for (const m of media) {
    const result = report.exercises.find(e => e.zemda_id === m.exercise_id);
    assert.equal(result.dataset_id, m.dataset_id);
    const candidate = result.candidates.find(c => c.id === m.dataset_id);
    assert(candidate.image_exists && candidate.gif_exists && candidate.metadata_matches);
    for (const [field, hash, magic] of [['photo_url','jpg_sha256','ffd8'],['gif_url','gif_sha256','47494638']]) {
      const bytes = fs.readFileSync(path.join(__dirname, '../frontend/public', m[field]));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), m[hash]);
      assert(bytes.toString('hex').startsWith(magic));
    }
    assert.equal(stableExercisePhoto(m.photo_url), m.photo_url);
    assert(JSON.parse(imageAttribution(db, null, m.photo_url)).author.includes('Gym visual'));
    assert.equal(exerciseAnimation({id:m.exercise_id, tenant_id:'global', is_custom:0}).gif_url, m.gif_url);
    assert.deepEqual(exerciseAnimation({id:m.exercise_id, tenant_id:'tenant', is_custom:1}), {});
  }
  assert.equal(stableExercisePhoto('/exercise-media/unreviewed.jpg'), null);
  const id = media.find(m => m.exercise_id !== 'ex-supino-reto-barra').exercise_id;
  const originalIds = db.prepare('SELECT id FROM personal_exercises ORDER BY id').all();
  db.prepare('UPDATE personal_exercises SET photo_url=? WHERE id=?').run('https://example.test/existing-correct.jpg', id);
  seedExerciseLibrary(db); seedExerciseLibrary(db);
  assert.equal(db.prepare('SELECT photo_url FROM personal_exercises WHERE id=?').get(id).photo_url, 'https://example.test/existing-correct.jpg');
  assert.deepEqual(db.prepare('SELECT id FROM personal_exercises ORDER BY id').all(), originalIds);
  db.prepare('UPDATE personal_exercises SET photo_url=? WHERE id=?').run(`/exercise-fallbacks/${id}.webp`, id);
  seedExerciseLibrary(db);
  assert.equal(db.prepare('SELECT photo_url FROM personal_exercises WHERE id=?').get(id).photo_url, media.find(m => m.exercise_id === id).photo_url);
  assert(db.prepare("SELECT photo_url FROM personal_exercises WHERE id='ex-supino-reto-barra'").get().photo_url.startsWith('/exercise-photos/'));
  let response;
  await PersonalController.listExercises({tenantId:'test',query:{},user:{role:'clinic_admin'}}, {json(value){response=value;},status(code){throw Error(`Unexpected status ${code}`);}});
  assert.equal(response.exercises.length, 268);
  assert.equal(response.exercises.filter(e => e.gif_url).length, media.length);
  assert(!response.exercises.find(e => e.id === 'ex-gluteo-cabo-coice').gif_url);
  console.log(`PASS ${media.length} reviewed pairs: hashes, paths, report, API, attribution, preserved photos/IDs and idempotent upgrades`);
}
main().catch(error => { console.error(error); process.exitCode=1; });
