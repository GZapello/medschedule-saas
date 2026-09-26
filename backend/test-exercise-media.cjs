const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-media-')), 'test.db');
const { db, initializeDatabase } = require('./dist/config/database');
const { DEFAULT_EXERCISE_LIBRARY: catalog, seedExerciseLibrary } = require('./dist/config/exercise-library.seed');
const { exerciseAnimation, datasetImageCredit } = require('./dist/services/exercise-media');
const { stableExercisePhoto, imageAttribution } = require('./dist/services/personal-exercise-utils');
const { PersonalController } = require('./dist/controllers/personal.controller');
const media = require('./src/config/exercise-library.media.json');
const report = require('../docs/exercise-media/validation-report.json');
const supplement = require('../docs/exercise-media/exercisegymgifs-validation.json');
const mapping = require('../docs/exercise-media/zemda_exercisegymgifs_mapping_for_codex.json').candidate_mappings;

async function main() {
  initializeDatabase();
  assert.equal(catalog.length, 268);
  assert.equal(report.exercises.length, 268);
  assert.deepEqual(report.exercises.map(e => e.zemda_id).sort(), catalog.map(e => e.id).sort());
  const oldMedia = media.filter(m => m.source_commit === '2c041b35557d7aae47dfac87b291f095476db191');
  const newMedia = media.filter(m => m.source_repository === 'JahelCuadrado/ExerciseGymGifsDB');
  assert.deepEqual(oldMedia, supplement.preserved_manifest_entries, 'All 60 prior entries remain unchanged');
  assert.equal(oldMedia.length, report.counts.aprovado);
  assert.equal(media.length, 128);
  assert.equal(newMedia.length, 68);
  assert.equal(new Set(media.map(m => m.exercise_id)).size, media.length);
  assert.equal(new Set(media.map(m => m.gif_url)).size, media.length);
  const withoutPhoto = rows => rows.map(({photo_url, ...row}) => row);
  assert.deepEqual(withoutPhoto(catalog), withoutPhoto(supplement.catalog_before), 'IDs, names, instructions and all exercise metadata are unchanged');
  assert.deepEqual(supplement.exercises.map(e => e.zemda_id), mapping.map(e => e.zemda_id));
  assert.equal(supplement.exercises.length, 208);
  assert.equal(supplement.exercises.filter(e => e.resultado === 'rejeitado').length, 124);
  assert.equal(supplement.exercises.filter(e => e.resultado === 'pendente').length, 16);
  assert.equal(catalog.filter(ex => !media.some(m => m.exercise_id === ex.id)).length, 140);
  assert.equal(newMedia.filter(m => m.photo_url).length, 67);
  assert.equal(supplement.media_evidence.length, 271);
  for (const result of supplement.exercises) {
    const entry = newMedia.find(m => m.exercise_id === result.zemda_id);
    assert.equal(Boolean(entry), result.resultado === 'aprovado');
    assert(result.motivo && result.candidates_inspected.length);
    if (!entry) { assert.equal(result.dataset_id, null); continue; }
    assert.equal(entry.dataset_id, result.dataset_id);
    assert.equal(entry.gif_url, `/exercise-media/${result.zemda_id}.gif`);
    assert.equal(entry.source_commit, 'f6d16e977fbee3c04295311c44cb8374ca8ff182');
    const evidence = supplement.media_evidence.find(e => e.source_path === entry.source_path);
    assert(evidence?.exists && evidence.frames > 1);
    assert.equal(evidence.sha256, entry.gif_sha256);
    assert(supplement.catalog_before.find(e => e.id === entry.exercise_id).photo_url.startsWith('/exercise-fallbacks/'));
  }
  for (const entry of report.exercises) {
    assert.equal(oldMedia.some(m => m.exercise_id === entry.zemda_id), entry.resultado === 'aprovado');
    if (entry.resultado !== 'aprovado') assert.equal(entry.dataset_id, null);
  }
  for (const m of oldMedia) {
    const result = report.exercises.find(e => e.zemda_id === m.exercise_id);
    assert.equal(result.dataset_id, m.dataset_id);
    const candidate = result.candidates.find(c => c.id === m.dataset_id);
    assert(candidate.image_exists && candidate.gif_exists && candidate.metadata_matches);
  }
  for (const m of media) {
    const assets = [['gif_url','gif_sha256','47494638']];
    if (m.photo_url) assets.push(['photo_url',m.photo_sha256 ? 'photo_sha256' : 'jpg_sha256',m.photo_sha256 ? '52494646' : 'ffd8']);
    for (const [field, hash, magic] of assets) {
      const bytes = fs.readFileSync(path.join(__dirname, '../frontend/public', m[field]));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), m[hash]);
      assert(bytes.toString('hex').startsWith(magic));
    }
    if (m.photo_url) {
      assert.equal(stableExercisePhoto(m.photo_url), m.photo_url);
      const credit = JSON.parse(imageAttribution(db, null, m.photo_url));
      assert.equal(credit.author, m.attribution);
      assert.equal(credit.source, m.source_repository ? `https://github.com/${m.source_repository}/blob/${m.source_commit}/${m.image_path}` : 'https://gymvisual.com/');
    }
    assert.equal(exerciseAnimation({id:m.exercise_id, tenant_id:'global', is_custom:0}).gif_url, m.gif_url);
    assert.deepEqual(exerciseAnimation({id:m.exercise_id, tenant_id:'tenant', is_custom:1}), {});
  }
  assert.equal(datasetImageCredit(undefined), null);
  assert.equal(datasetImageCredit(null), null);
  assert.equal(datasetImageCredit(''), null);
  const gifOnly = newMedia.find(m => !m.photo_url);
  assert.equal(catalog.find(e => e.id === gifOnly.exercise_id).photo_url, `/exercise-fallbacks/${gifOnly.exercise_id}.webp`);
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
  const newId = newMedia.find(m => m.photo_url).exercise_id;
  db.prepare('UPDATE personal_exercises SET photo_url=? WHERE id=?').run('https://example.test/manual.webp', newId);
  seedExerciseLibrary(db);
  assert.equal(db.prepare('SELECT photo_url FROM personal_exercises WHERE id=?').get(newId).photo_url, 'https://example.test/manual.webp');
  db.prepare('UPDATE personal_exercises SET photo_url=? WHERE id=?').run(`/exercise-fallbacks/${newId}.webp`, newId);
  seedExerciseLibrary(db);
  assert.equal(db.prepare('SELECT photo_url FROM personal_exercises WHERE id=?').get(newId).photo_url, newMedia.find(m => m.exercise_id === newId).photo_url);
  assert(db.prepare("SELECT photo_url FROM personal_exercises WHERE id='ex-supino-reto-barra'").get().photo_url.startsWith('/exercise-photos/'));
  let response;
  await PersonalController.listExercises({tenantId:'test',query:{},user:{role:'clinic_admin'}}, {json(value){response=value;},status(code){throw Error(`Unexpected status ${code}`);}});
  assert.equal(response.exercises.length, 268);
  assert.equal(response.exercises.filter(e => e.gif_url).length, media.length);
  assert(!response.exercises.find(e => e.id === 'ex-gluteo-cabo-coice').gif_url);
  console.log(`PASS ${media.length} reviewed GIFs: 60 preserved + 68 added, hashes, paths, both reports, API, attribution, immutable catalogue, preserved photos and idempotent upgrades`);
}
main().catch(error => { console.error(error); process.exitCode=1; });
