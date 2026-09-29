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
  assert.equal(catalog.length, 318);
  assert.equal(report.exercises.length, 268);
  const originalCatalog = catalog.filter(e => supplement.catalog_before.some(b => b.id === e.id));
  assert.deepEqual(report.exercises.map(e => e.zemda_id).sort(), originalCatalog.map(e => e.id).sort());
  const oldMedia = media.filter(m => m.source_commit === '2c041b35557d7aae47dfac87b291f095476db191');
  const newMedia = media.filter(m => m.source_repository === 'JahelCuadrado/ExerciseGymGifsDB');
  assert.deepEqual(oldMedia, supplement.preserved_manifest_entries.filter(e => e.exercise_id !== 'ex-stiff-halteres'), 'All 59 prior entries remain unchanged');
  assert.equal(oldMedia.length, 59);
  assert.equal(media.length, 179);
  assert.equal(newMedia.length, 120);
  assert.equal(new Set(media.map(m => m.exercise_id)).size, 179);
  assert.equal(new Set(media.map(m => m.gif_url)).size, 179);
  assert.equal(new Set(media.map(m => m.gif_sha256)).size, 179, 'All 179 exercises have completely unique GIF hashes');
  assert.equal(new Set(newMedia.map(m => m.source_path)).size, 120, 'Zero duplicate source_path');
  const withoutPhoto = rows => rows.map(({photo_url, ...row}) => row);
  assert.deepEqual(withoutPhoto(originalCatalog), withoutPhoto(supplement.catalog_before), 'IDs, names, instructions and all exercise metadata are unchanged');
  assert.deepEqual(supplement.exercises.map(e => e.zemda_id), mapping.map(e => e.zemda_id));
  assert.equal(supplement.exercises.length, 208);
  assert.equal(supplement.exercises.filter(e => e.resultado === 'rejeitado').length, 124);
  assert.equal(supplement.exercises.filter(e => e.resultado === 'pendente').length, 16);
  assert.equal(catalog.filter(ex => media.some(m => m.exercise_id === ex.id)).length, 179);
  assert.equal(newMedia.filter(m => m.photo_url).length, 119);
  assert.equal(supplement.media_evidence.length, 271);
  const priorApprovedIds = new Set(supplement.exercises.filter(e => e.resultado === 'aprovado').map(e => e.zemda_id));
  for (const result of supplement.exercises) {
    if (result.zemda_id === 'ex-extensao-quadril-banco') continue;
    const entry = priorApprovedIds.has(result.zemda_id) ? newMedia.find(m => m.exercise_id === result.zemda_id) : null;
    assert.equal(Boolean(entry), result.resultado === 'aprovado');
    assert(result.motivo && result.candidates_inspected.length);
    if (!entry) { continue; }
    assert.equal(entry.dataset_id, result.dataset_id);
    assert.equal(entry.gif_url, `/exercise-media/${result.zemda_id}.gif`);
    assert.equal(entry.source_commit, 'f6d16e977fbee3c04295311c44cb8374ca8ff182');
    const evidence = supplement.media_evidence.find(e => e.source_path === entry.source_path);
    assert(evidence?.exists && evidence.frames > 1);
    assert.equal(evidence.sha256, entry.gif_sha256);
    const catPhoto = supplement.catalog_before.find(e => e.id === entry.exercise_id)?.photo_url || catalog.find(e => e.id === entry.exercise_id)?.photo_url;
    assert(catPhoto.startsWith('/exercise-fallbacks/') || catPhoto.startsWith('/exercise-photos/') || catPhoto.startsWith('/exercise-media/'));
  }
  for (const entry of report.exercises) {
    if (entry.zemda_id === 'ex-stiff-halteres') continue;
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
  assert.equal(response.exercises.length, 318);
  assert.equal(response.exercises.filter(e => e.gif_url).length, media.length);
  assert(!response.exercises.find(e => e.id === 'ex-trx-row').gif_url);
  console.log(`PASS ${media.length} reviewed GIFs: 59 preserved + 120 added, 179 unique hashes, paths, both reports, API, attribution, immutable catalogue, preserved photos and idempotent upgrades`);
}
main().catch(error => { console.error(error); process.exitCode=1; });
