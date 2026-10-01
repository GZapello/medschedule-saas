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
const photos = require('./src/config/exercise-library.photos.json');

async function main() {
  initializeDatabase();
  // Current verified catalog. Historical import reports describe earlier catalogs.
  assert.equal(catalog.length, 187);
  assert.equal(media.length, 186);
  const gifs = media.filter(m => m.gif_url);
  assert.equal(gifs.length, 185);
  assert.equal(new Set(media.map(m => m.exercise_id)).size, media.length);
  assert.equal(new Set(gifs.map(m => m.gif_url)).size, gifs.length);
  assert.equal(new Set(gifs.map(m => m.gif_sha256)).size, gifs.length);
  assert(media.every(m => catalog.some(e => e.id === m.exercise_id)));
  for (const entry of media) {
    const assets = [];
    if (entry.gif_url) assets.push([entry.gif_url, entry.gif_sha256, '47494638']);
    if (entry.photo_url) assets.push([entry.photo_url, entry.photo_sha256 || entry.jpg_sha256, entry.photo_url.endsWith('.webp') ? '52494646' : 'ffd8']);
    for (const [url, sha, magic] of assets) {
      const bytes = fs.readFileSync(path.join(__dirname, '../frontend/public', url));
      assert(bytes.length > 0);
      if (sha) assert.equal(createHash('sha256').update(bytes).digest('hex'), sha, url);
      assert(bytes.toString('hex').startsWith(magic), url);
    }
    if (entry.photo_url) {
      assert.equal(stableExercisePhoto(entry.photo_url), entry.photo_url);
      const credit = JSON.parse(imageAttribution(db, null, entry.photo_url));
      const licensed = photos.find(p => p.photo_url === entry.photo_url);
      assert.equal(credit.author, licensed?.author || entry.attribution);
      assert(credit.source);
    }
    assert.equal(exerciseAnimation({id:entry.exercise_id,tenant_id:'global',is_custom:0}).gif_url, entry.gif_url);
    assert.deepEqual(exerciseAnimation({id:entry.exercise_id,tenant_id:'tenant',is_custom:1}), {});
  }
  for (const entry of catalog) {
    assert(entry.photo_url && !entry.photo_url.startsWith('/exercise-fallbacks/'));
    assert(fs.existsSync(path.join(__dirname, '../frontend/public', entry.photo_url)));
    assert(media.some(m => m.photo_url === entry.photo_url) || photos.some(p => p.photo_url === entry.photo_url));
  }
  for (const absent of [undefined,null,'']) assert.equal(datasetImageCredit(absent), null);
  assert.equal(stableExercisePhoto('/exercise-media/unreviewed.jpg'), null);
  const id = media[0].exercise_id;
  const originalIds = db.prepare('SELECT id FROM personal_exercises ORDER BY id').all();
  db.prepare('UPDATE personal_exercises SET photo_url=? WHERE id=?').run('https://example.test/unverified.jpg', id);
  seedExerciseLibrary(db); seedExerciseLibrary(db);
  assert.equal(db.prepare('SELECT photo_url FROM personal_exercises WHERE id=?').get(id).photo_url, catalog.find(e => e.id === id).photo_url);
  assert.deepEqual(db.prepare('SELECT id FROM personal_exercises ORDER BY id').all(), originalIds);
  let response;
  await PersonalController.listExercises({tenantId:'test',query:{},user:{role:'clinic_admin'}}, {json(value){response=value;},status(code){throw Error(`Unexpected status ${code}`);}});
  assert.equal(response.exercises.length, catalog.length);
  assert.equal(response.exercises.filter(e => e.gif_url).length, gifs.length);
  assert(!response.exercises.find(e => e.id === 'ex-trx-row')?.gif_url);
  console.log(`PASS current catalog: ${catalog.length} exercises, ${gifs.length} unique GIFs, verified assets/hashes/attribution, scoped animations, API and idempotent seed`);
}
main().catch(error => { console.error(error); process.exitCode=1; });
