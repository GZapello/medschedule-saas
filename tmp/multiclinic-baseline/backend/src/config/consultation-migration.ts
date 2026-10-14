import { DatabaseSync } from 'node:sqlite';

export function migrateConsultations(db: DatabaseSync): void {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'payments'").get() as { sql: string };
  if (!row.sql.includes("'exempt'") || !row.sql.includes("'other'")) {
    const objects = db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name='payments' AND type IN ('index','trigger') AND sql IS NOT NULL").all() as { sql: string }[];
    const sql = row.sql.replace(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["`\[]?payments["`\]]?/i, 'CREATE TABLE payments_consultation_migration')
      .replace(/CHECK\s*\(\s*payment_method\s+IN\s*\(([^)]+)\)\s*\)/i, "CHECK(payment_method IN ($1, 'other'))")
      .replace(/CHECK\s*\(\s*status\s+IN\s*\(([^)]+)\)\s*\)/i, "CHECK(status IN ($1, 'exempt'))");
    db.exec('PRAGMA foreign_keys=OFF');
    try {
      db.exec('BEGIN IMMEDIATE');
      db.exec(sql);
      db.exec('INSERT INTO payments_consultation_migration SELECT * FROM payments');
      db.exec('DROP TABLE payments');
      db.exec('ALTER TABLE payments_consultation_migration RENAME TO payments');
      objects.forEach(o => db.exec(o.sql));
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Falha de integridade na migração de recebimentos');
      db.exec('COMMIT');
    } catch (err) { db.exec('ROLLBACK'); throw err; }
    finally { db.exec('PRAGMA foreign_keys=ON'); }
  }
  db.exec(`CREATE TABLE IF NOT EXISTS consultation_completions (
    appointment_id TEXT PRIMARY KEY REFERENCES appointments(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    generated_docs_json TEXT NOT NULL,
    payload_json TEXT,
    saved_by TEXT NOT NULL,
    saved_at TEXT NOT NULL DEFAULT (datetime('now')),
    payment_id TEXT REFERENCES payments(id),
    completed_at TEXT
  )`);
  if (!db.prepare('PRAGMA table_info(consultation_completions)').all().some((c: any) => c.name === 'payload_json')) {
    db.exec('ALTER TABLE consultation_completions ADD COLUMN payload_json TEXT');
  }
}
