const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { DEFAULT_EXERCISE_LIBRARY } = require('./dist/config/exercise-library.seed');
const { generateExerciseIllustrationSvg } = require('./dist/services/exercise-image-generator.service');
async function main() {
  const dest = path.resolve(__dirname, '../frontend/public/exercise-fallbacks');
  fs.mkdirSync(dest, { recursive: true });
  const manifest = [];
  const photos = require('./src/config/exercise-library.photos.json');
  for (const ex of DEFAULT_EXERCISE_LIBRARY) {
    await sharp(Buffer.from(generateExerciseIllustrationSvg(ex))).resize(480, 360).webp({ quality: 72 }).toFile(path.join(dest, `${ex.id}.webp`));
    manifest.push({ exercise_id: ex.id, name: ex.name, category: ex.category, muscle_group: ex.muscle_group, status: 'needs_licensed_photo', fallback: `/exercise-fallbacks/${ex.id}.webp`, local_path: '', source: '', license: '', author: '', image_kind: 'photograph' });
  }
  for (const photo of photos) Object.assign(manifest.find(row => row.exercise_id === photo.exercise_id), photo, { status: 'bundled_photo_ready_for_r2', local_path: `../frontend/public${photo.photo_url}` });
  fs.writeFileSync(path.resolve(__dirname, 'exercise-photo-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ total: manifest.length, real_photos: photos.length, local_fallbacks: manifest.length - photos.length }));
}
main().catch(err => { console.error(err); process.exitCode = 1; });
