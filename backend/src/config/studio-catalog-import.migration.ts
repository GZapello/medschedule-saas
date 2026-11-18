import type { DatabaseSync } from 'node:sqlite';

function addColIfMissing(rawDb: DatabaseSync, table: string, col: string, definition: string): void {
  const cols = rawDb.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (cols.length > 0 && !cols.some((c) => c.name === col)) {
    rawDb.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${definition}`);
  }
}

export function migrateStudioCatalogImports(rawDb: DatabaseSync): void {
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS studio_catalog_imports (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      sources_json TEXT NOT NULL,
      proposal_json TEXT NOT NULL,
      result_json TEXT,
      revision INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'ready',
      error_code TEXT,
      error_message TEXT,
      error_stage TEXT,
      diagnostic_json TEXT,
      request_id TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      retryable INTEGER NOT NULL DEFAULT 0,
      temp_expires_at TEXT,
      temp_purged_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (tenant_id, actor_id, fingerprint)
    );
    CREATE INDEX IF NOT EXISTS idx_studio_catalog_imports_owner
      ON studio_catalog_imports(tenant_id, actor_id, updated_at);
  `);

  addColIfMissing(rawDb, 'studio_catalog_imports', 'status', `TEXT NOT NULL DEFAULT 'ready'`);
  addColIfMissing(rawDb, 'studio_catalog_imports', 'error_code', 'TEXT');
  addColIfMissing(rawDb, 'studio_catalog_imports', 'error_message', 'TEXT');
  addColIfMissing(rawDb, 'studio_catalog_imports', 'error_stage', 'TEXT');
  addColIfMissing(rawDb, 'studio_catalog_imports', 'diagnostic_json', 'TEXT');
  addColIfMissing(rawDb, 'studio_catalog_imports', 'request_id', 'TEXT');
  addColIfMissing(rawDb, 'studio_catalog_imports', 'attempts', 'INTEGER NOT NULL DEFAULT 0');
  addColIfMissing(rawDb, 'studio_catalog_imports', 'retryable', 'INTEGER NOT NULL DEFAULT 0');
  addColIfMissing(rawDb, 'studio_catalog_imports', 'temp_expires_at', 'TEXT');
  addColIfMissing(rawDb, 'studio_catalog_imports', 'temp_purged_at', 'TEXT');
  addColIfMissing(rawDb, 'studio_catalog_imports', 'created_at', 'TEXT');

  rawDb.exec(`
    UPDATE studio_catalog_imports
    SET status = CASE WHEN result_json IS NOT NULL THEN 'completed' ELSE 'ready' END
    WHERE status IS NULL OR status = '';

    UPDATE studio_catalog_imports
    SET created_at = COALESCE(created_at, updated_at, datetime('now'))
    WHERE created_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_studio_catalog_imports_status
      ON studio_catalog_imports(tenant_id, status, updated_at);

    CREATE TABLE IF NOT EXISTS studio_catalog_import_temp_files (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL REFERENCES studio_catalog_imports(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      storage_provider TEXT NOT NULL,
      object_key TEXT NOT NULL UNIQUE,
      original_file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      fingerprint TEXT NOT NULL,
      temp_state TEXT NOT NULL DEFAULT 'queued',
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_studio_temp_files_batch
      ON studio_catalog_import_temp_files(batch_id, temp_state);

    CREATE INDEX IF NOT EXISTS idx_studio_temp_files_expires
      ON studio_catalog_import_temp_files(temp_state, expires_at);
  `);
}
