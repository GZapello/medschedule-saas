const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const mediaPath = path.join(__dirname, 'src/config/exercise-library.media.json');
const media = JSON.parse(fs.readFileSync(mediaPath, 'utf8'));

const publicDir = path.resolve(__dirname, '../frontend/public');

console.log('================================================================');
console.log('🧪 TEST SUITE: ZEMDAPersonal GIF & MEDIA UNIQUENESS AUDIT');
console.log('================================================================');

// 1. Total counts
assert.equal(media.length, 268, 'Must have exactly 268 exercises');
const withGif = media.filter(m => m.gif_url && m.gif_url.trim().length > 0);
assert.equal(withGif.length, 268, 'All 268 exercises must have gif_url');
console.log('✅ [PASS] 268/268 exercises present with gif_url (0 missing)');

// 2. Uniqueness of manifest URLs and IDs
const ids = new Set(media.map(m => m.exercise_id));
assert.equal(ids.size, 268, 'All 268 exercise IDs must be unique');
const gifUrls = new Set(media.map(m => m.gif_url));
assert.equal(gifUrls.size, 268, 'All 268 gif_url values must be unique');
console.log('✅ [PASS] All 268 exercise IDs and gif_url paths are strictly unique');

// 3. File existence, magic bytes, and SHA-256 computation
const fileHashes = new Map();
const manifestHashes = new Map();

for (const item of media) {
  const relPath = item.gif_url.startsWith('/') ? item.gif_url.slice(1) : item.gif_url;
  const absPath = path.join(publicDir, relPath);

  assert.ok(fs.existsSync(absPath), `File must exist on disk: ${absPath}`);
  const stats = fs.statSync(absPath);
  assert.ok(stats.size > 0, `File size must be greater than 0: ${absPath}`);

  const buffer = fs.readFileSync(absPath);
  const header = buffer.subarray(0, 6).toString('ascii');
  assert.ok(header === 'GIF87a' || header === 'GIF89a', `Invalid GIF magic header in ${absPath}: ${header}`);

  const sha = createHash('sha256').update(buffer).digest('hex');
  assert.equal(sha, item.gif_sha256, `SHA-256 mismatch for ${item.exercise_id}: computed ${sha} vs manifest ${item.gif_sha256}`);

  if (!fileHashes.has(sha)) fileHashes.set(sha, []);
  fileHashes.get(sha).push(item.exercise_id);

  if (!manifestHashes.has(item.gif_sha256)) manifestHashes.set(item.gif_sha256, []);
  manifestHashes.get(item.gif_sha256).push(item.exercise_id);
}

// 4. Duplicate SHA check
const duplicateShas = [...fileHashes.entries()].filter(([sha, exs]) => exs.length > 1);
assert.equal(duplicateShas.length, 0, `Detected duplicate GIF SHA-256 hashes: ${JSON.stringify(duplicateShas)}`);
assert.equal(fileHashes.size, 268, 'Exactly 268 unique GIF SHA-256 hashes required');
console.log('✅ [PASS] 268 unique physical GIF SHA-256 hashes (0 duplicates)');

// 5. Source path uniqueness
const sourcePaths = new Map();
const eggEntries = media.filter(m => m.source_repository === 'JahelCuadrado/ExerciseGymGifsDB');
assert.equal(eggEntries.length, 209, 'Must have 209 ExerciseGymGifsDB entries');

for (const item of eggEntries) {
  assert.ok(item.source_path, `Missing source_path for ${item.exercise_id}`);
  if (!sourcePaths.has(item.source_path)) sourcePaths.set(item.source_path, []);
  sourcePaths.get(item.source_path).push(item.exercise_id);
}

const duplicateSourcePaths = [...sourcePaths.entries()].filter(([sp, exs]) => exs.length > 1);
assert.equal(duplicateSourcePaths.length, 0, `Detected duplicate source_paths: ${JSON.stringify(duplicateSourcePaths)}`);
assert.equal(sourcePaths.size, 209, 'All 209 ExerciseGymGifsDB source_paths must be strictly unique');
console.log('✅ [PASS] 209 unique source_paths among external GymGifs entries (0 duplicates)');

// 6. Photo files verification
let photosChecked = 0;
for (const item of media) {
  if (item.photo_url) {
    const relPhoto = item.photo_url.startsWith('/') ? item.photo_url.slice(1) : item.photo_url;
    const absPhoto = path.join(publicDir, relPhoto);
    assert.ok(fs.existsSync(absPhoto), `Photo file must exist: ${absPhoto}`);
    assert.ok(fs.statSync(absPhoto).size > 0, `Photo file size must be > 0: ${absPhoto}`);
    photosChecked++;
  }
}
console.log(`✅ [PASS] Verified ${photosChecked} exercise photos/thumbnails exist and are valid`);

console.log('================================================================');
console.log('🎉 AUDIT RESULT: ZERO DUPLICATES - 100% UNIQUE 268 EXERCISE GIFS');
console.log('================================================================');
