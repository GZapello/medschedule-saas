// Explicit operator tool: local licensed files only; no remote downloads or invented URLs.
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const sharp = require('sharp');
const { r2StorageService: storage } = require('./dist/services/r2-storage.service');
async function main() {
  const manifestPath = process.argv.find(arg => arg.startsWith('--manifest='))?.slice(11);
  if (!manifestPath) throw new Error('Use --manifest=arquivo.json [--apply]. Sem --apply apenas valida.');
  const apply = process.argv.includes('--apply');
  const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, 'saas_schedule.db');
  if (!fs.existsSync(dbPath)) throw new Error('Banco existente obrigatório; execute as migrações da aplicação primeiro.');
  if (apply && (!storage.isConfiguredClient || process.env.R2_MOCK_STORAGE === 'true')) throw new Error('Importação exige credenciais R2 reais; mock não é permitido.');
  const db = new DatabaseSync(dbPath, { readOnly: !apply });
  const rows = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const prepared = [], ids = new Set();
  // Validate the entire batch before sending the first byte.
  for (const row of rows.filter(row => row.local_path)) {
    if (ids.has(row.exercise_id)) throw new Error(`ID duplicado: ${row.exercise_id}`);
    ids.add(row.exercise_id);
    const ex = db.prepare("SELECT id FROM personal_exercises WHERE id = ? AND tenant_id = 'global' AND is_custom = 0").get(row.exercise_id);
    if (!ex) throw new Error(`Exercício padrão inexistente: ${row.exercise_id}`);
    if (!['CC0', 'Public domain', 'CC BY 4.0', 'Owned', 'Licensed'].includes(row.license) || !row.source || !row.author || row.image_kind !== 'photograph') throw new Error(`Origem, autor, licença compatível e classificação photograph obrigatórios: ${row.exercise_id}`);
    if (row.license === 'Licensed' && !row.license_evidence) throw new Error('Licença específica exige license_evidence.');
    const filename = path.resolve(path.dirname(path.resolve(manifestPath)), row.local_path);
    const input = fs.readFileSync(filename);
    if (input.length > 10 * 1024 * 1024) throw new Error('Imagem excede 10MB.');
    const meta = await sharp(input, { limitInputPixels: 40000000 }).metadata();
    if (!['jpeg','png','webp'].includes(meta.format)) throw new Error('Apenas JPEG, PNG e WebP.');
    const buffer = await sharp(input).rotate().resize(960, 960, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    prepared.push({ row, buffer, hash: createHash('sha256').update(buffer).digest('hex') });
  }
  console.log(`Validados: ${prepared.length}; modo: ${apply ? 'importação real' : 'somente validação'}`);
  if (!apply) { db.close(); return; }
  db.exec(`CREATE TABLE IF NOT EXISTS exercise_image_provenance (
    file_id TEXT PRIMARY KEY, exercise_id TEXT NOT NULL, sha256 TEXT NOT NULL,
    image_kind TEXT NOT NULL, source TEXT NOT NULL, license TEXT NOT NULL, author TEXT NOT NULL,
    license_evidence TEXT, created_at TEXT DEFAULT (datetime('now'))
  )`);
  for (const { row, buffer, hash } of prepared) {
    const existing = db.prepare(`SELECT fa.id, fa.object_key FROM exercise_image_provenance p JOIN file_attachments fa ON fa.id = p.file_id JOIN personal_exercises pe ON pe.exercise_file_id = fa.id WHERE p.exercise_id = ? AND p.sha256 = ?`).get(row.exercise_id, hash);
    if (existing && await storage.fileExists(existing.object_key)) { console.log(`Preservado: ${row.exercise_id}`); continue; }
    const id = `att-photo-${randomUUID()}`;
    const key = `clinics/global/exercises/${row.exercise_id}/${randomUUID()}.webp`;
    await storage.uploadFile(key, buffer, 'image/webp');
    if (!await storage.fileExists(key)) throw new Error(`HEAD não confirmou ${row.exercise_id}; nenhum vínculo foi gravado.`);
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`INSERT INTO file_attachments (id, clinic_id, exercise_id, uploaded_by, storage_provider, object_key, original_filename, mime_type, file_size, category) VALUES (?, 'global', ?, 'system', 'cloudflare_r2', ?, ?, 'image/webp', ?, 'exercises')`).run(id, row.exercise_id, key, `${row.exercise_id}.webp`, buffer.length);
      db.prepare(`INSERT INTO exercise_image_provenance (file_id, exercise_id, sha256, image_kind, source, license, author, license_evidence) VALUES (?, ?, ?, 'photograph', ?, ?, ?, ?)`).run(id, row.exercise_id, hash, row.source, row.license, row.author, row.license_evidence || null);
      db.prepare("UPDATE personal_exercises SET exercise_file_id = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = 'global' AND is_custom = 0").run(id, row.exercise_id);
      db.exec('COMMIT');
      console.log(`Importado e verificado: ${row.exercise_id}`);
    } catch (err) { db.exec('ROLLBACK'); throw err; }
  }
  db.close();
}
main().catch(err => { console.error(err.message); process.exitCode = 1; });
