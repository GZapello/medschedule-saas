// Read-only audit; historical command name retained for compatibility.
require('dotenv').config();
const { DatabaseSync } = require('node:sqlite');
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
const path = require('node:path');
const fs = require('node:fs');
function bundledPhotoExists(row) {
  const photos = require('./src/config/exercise-library.photos.json');
  const photo = photos.find(item => item.photo_url === row.photo_url);
  if (!photo) return false;
  const file = path.resolve(__dirname, '../frontend/public', photo.photo_url.slice(1));
  return fs.existsSync(file) && require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex') === photo.sha256;
}
async function audit(db, head, fallbackExists, localPhotoExists = () => false) {
  const hasProvenance = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='exercise_image_provenance'").get();
  const rows = db.prepare(`SELECT pe.*, fa.id AS attachment_id, fa.object_key, fa.mime_type, fa.category AS file_category, fa.storage_provider, fa.clinic_id FROM personal_exercises pe LEFT JOIN file_attachments fa ON fa.id = pe.exercise_file_id`).all();
  const totals = { EXERCISES_TOTAL: rows.length, STANDARD: 0, CUSTOM: 0, WITH_REAL_IMAGE: 0, LOCAL_REAL_IMAGE: 0, WITHOUT_REAL_IMAGE: 0, BROKEN_FILE_REFERENCE: 0, FALLBACK_ONLY: 0, R2_FOUND: 0, R2_MISSING: 0, R2_UNVERIFIED: 0, ATTACHMENT_MISSING: 0, EXTERNAL_URL: 0, WITHOUT_IMAGE: 0, VALID_IMAGE: 0 };
  const details = [];
  for (const row of rows) {
    const standard = row.tenant_id === 'global' && row.is_custom === 0;
    totals[standard ? 'STANDARD' : 'CUSTOM']++;
    let status = 'no_file', real = false, broken = false;
    const generated = /^(att-lib-|att-illustration-)/.test(row.exercise_file_id || '');
    if (row.exercise_file_id) {
      if (!row.attachment_id) { status = 'attachment_missing'; totals.ATTACHMENT_MISSING++; broken = true; }
      else if (row.storage_provider !== 'cloudflare_r2' || row.file_category !== 'exercises' || !['image/jpeg','image/png','image/webp'].includes(row.mime_type) || ![row.tenant_id, 'global'].includes(row.clinic_id)) { status = 'invalid_attachment'; broken = true; }
      else {
        status = await head(row.object_key);
        if (status === 'found') {
          totals.R2_FOUND++; totals.VALID_IMAGE++;
          const provenance = hasProvenance && db.prepare('SELECT * FROM exercise_image_provenance WHERE file_id = ?').get(row.attachment_id);
          real = !generated && provenance?.image_kind === 'photograph' && Boolean(provenance.source && provenance.license && provenance.author);
        } else if (status === 'missing') { totals.R2_MISSING++; broken = true; }
        else totals.R2_UNVERIFIED++;
      }
    }
    const external = /^https?:\/\//i.test(row.photo_url || '');
    if (external) totals.EXTERNAL_URL++;
    const fallback = fallbackExists(row);
    const localReal = status !== 'found' && localPhotoExists(row);
    if (localReal) { real = true; totals.LOCAL_REAL_IMAGE++; }
    if (!real && (fallback || (generated && status === 'found'))) totals.FALLBACK_ONLY++;
    if (!fallback && !localReal && status !== 'found') totals.WITHOUT_IMAGE++;
    if ((fallback || localReal) && status !== 'found') totals.VALID_IMAGE++;
    if (broken) totals.BROKEN_FILE_REFERENCE++;
    totals[real ? 'WITH_REAL_IMAGE' : 'WITHOUT_REAL_IMAGE']++;
    details.push({ id: row.id, name: row.name, standard, active: row.is_active !== 0, category: row.category, muscle_group: row.muscle_group, file_status: status, broken, external_url: external, fallback, local_real_photo: localReal, real_photo_verified: Boolean(real) });
  }
  return { totals, standard_broken_references: details.filter(row => row.standard && row.broken).length, details };
}
async function main() {
  const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, 'saas_schedule.db');
  if (!fs.existsSync(dbPath)) throw new Error('Banco não encontrado; auditoria não cria nem modifica banco.');
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const endpoint = process.env.R2_ENDPOINT || (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '');
  const configured = endpoint && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_MOCK_STORAGE !== 'true';
  const client = configured ? new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } }) : null;
  const head = async key => {
    if (!client) return 'unverified';
    try { await client.send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET_NAME || 'zemda-files', Key: key })); return 'found'; }
    catch (err) { return err.$metadata?.httpStatusCode === 404 ? 'missing' : 'unverified'; }
  };
  const result = await audit(db, head, row => /^\/exercise-fallbacks\/[a-z0-9-]+\.webp$/.test(row.photo_url || '') && fs.existsSync(path.resolve(__dirname, '../frontend/public', row.photo_url.slice(1))), bundledPhotoExists);
  db.close();
  const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
  if (output) fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result.totals, null, 2));
  console.log(`STANDARD_BROKEN_FILE_REFERENCE=${result.standard_broken_references}`);
  if (result.totals.R2_UNVERIFIED) console.log('R2 não verificado: auditoria remota incompleta; nenhuma foto foi presumida real.');
  if (result.totals.BROKEN_FILE_REFERENCE) process.exitCode = 1;
  else if (result.totals.R2_UNVERIFIED) process.exitCode = 2;
}
module.exports = { audit, bundledPhotoExists };
if (require.main === module) main().catch(err => { console.error(err.message); process.exitCode = 1; });
