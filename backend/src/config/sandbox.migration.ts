import { DatabaseSync } from 'node:sqlite';

function tableColumns(db: DatabaseSync, table: string): string[] {
  try {
    const info = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    return info.map(c => c.name);
  } catch {
    return [];
  }
}

function addColIfMissing(db: DatabaseSync, table: string, col: string, typeDef: string): void {
  const cols = tableColumns(db, table);
  if (cols.length > 0 && !cols.includes(col)) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${typeDef};`);
    } catch (err) {
      console.warn(`[SandboxMigration] Aviso ao adicionar coluna ${table}.${col}:`, err);
    }
  }
}

export function migrateSandbox(db: DatabaseSync): void {
  // 1. Coluna explícita e persistente de identificação de sandbox (aditiva e idempotente)
  addColIfMissing(db, 'tenants', 'is_sandbox', 'INTEGER NOT NULL DEFAULT 0');
  addColIfMissing(db, 'users', 'is_sandbox', 'INTEGER NOT NULL DEFAULT 0');
  addColIfMissing(db, 'professionals', 'is_sandbox', 'INTEGER NOT NULL DEFAULT 0');

  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tenants_is_sandbox ON tenants(is_sandbox, status);
      CREATE INDEX IF NOT EXISTS idx_users_is_sandbox ON users(is_sandbox, tenant_id);
      CREATE INDEX IF NOT EXISTS idx_professionals_is_sandbox ON professionals(is_sandbox, tenant_id);
    `);
  } catch (err) {
    console.warn('[SandboxMigration] Aviso ao criar índices is_sandbox:', err);
  }

  // 2. Tabela principal de Ambientes Sandbox Reutilizáveis (1 ambiente persistente por SuperAdmin)
  db.exec(`
    CREATE TABLE IF NOT EXISTS sandbox_environments (
      id TEXT PRIMARY KEY,
      admin_user_id TEXT NOT NULL UNIQUE,
      sandbox_tenant_id TEXT NOT NULL UNIQUE,
      manager_user_id TEXT NOT NULL UNIQUE,
      professional_user_id TEXT NOT NULL UNIQUE,
      professional_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'ready',
      establishment_profile TEXT NOT NULL DEFAULT 'clinic',
      plan_code TEXT NOT NULL DEFAULT 'ALL',
      last_profession_id TEXT,
      last_practice_areas_json TEXT,
      last_medical_specialties_json TEXT,
      last_medical_areas_json TEXT,
      last_optional_capabilities_json TEXT,
      last_reset_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (sandbox_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sandbox_env_tenant ON sandbox_environments(sandbox_tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sandbox_env_status ON sandbox_environments(status);
  `);

  // 3. Extensão aditiva em sandbox_test_sessions para ciclo de vida, revogação e vínculo com o ambiente
  db.exec(`
    CREATE TABLE IF NOT EXISTS sandbox_test_sessions (
      id TEXT PRIMARY KEY,
      admin_user_id TEXT NOT NULL,
      sandbox_tenant_id TEXT NOT NULL,
      sandbox_user_id TEXT NOT NULL,
      profession_id TEXT NOT NULL,
      practice_areas_json TEXT,
      plan_code TEXT DEFAULT 'ALL',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
  `);

  addColIfMissing(db, 'sandbox_test_sessions', 'sandbox_user_id', 'TEXT');
  addColIfMissing(db, 'sandbox_test_sessions', 'token', 'TEXT');
  addColIfMissing(db, 'sandbox_test_sessions', 'environment_id', 'TEXT');
  addColIfMissing(db, 'sandbox_test_sessions', 'account_mode', "TEXT NOT NULL DEFAULT 'professional'");
  addColIfMissing(db, 'sandbox_test_sessions', 'establishment_profile', "TEXT NOT NULL DEFAULT 'clinic'");
  addColIfMissing(db, 'sandbox_test_sessions', 'status', "TEXT NOT NULL DEFAULT 'active'");
  addColIfMissing(db, 'sandbox_test_sessions', 'revoked_at', 'TEXT');
  addColIfMissing(db, 'sandbox_test_sessions', 'last_used_at', 'TEXT');

  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_env_status ON sandbox_test_sessions(environment_id, status, expires_at);
      CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_admin_status ON sandbox_test_sessions(admin_user_id, status, expires_at);
      CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_user ON sandbox_test_sessions(sandbox_user_id, sandbox_tenant_id, status);
    `);
  } catch (err) {
    console.warn('[SandboxMigration] Aviso ao criar índices de sandbox_test_sessions:', err);
  }

  // 4. Marcação NÃO destrutiva de registros comprovadamente legados do Laboratório (sem excluir nenhum registro!)
  try {
    db.exec(`
      UPDATE tenants
      SET is_sandbox = 1, billing_required = 0
      WHERE COALESCE(is_sandbox, 0) = 0
        AND (
          id LIKE 'sbx-tenant-%'
          OR id IN (SELECT DISTINCT sandbox_tenant_id FROM sandbox_test_sessions WHERE sandbox_tenant_id IS NOT NULL)
        );

      UPDATE users
      SET is_sandbox = 1
      WHERE COALESCE(is_sandbox, 0) = 0
        AND (
          id LIKE 'sbx-user-%'
          OR id IN (SELECT DISTINCT sandbox_user_id FROM sandbox_test_sessions WHERE sandbox_user_id IS NOT NULL)
          OR tenant_id IN (SELECT id FROM tenants WHERE is_sandbox = 1)
        );

      UPDATE professionals
      SET is_sandbox = 1
      WHERE COALESCE(is_sandbox, 0) = 0
        AND (
          id LIKE 'sbx-prof-%'
          OR tenant_id IN (SELECT id FROM tenants WHERE is_sandbox = 1)
        );
    `);
  } catch (err) {
    console.warn('[SandboxMigration] Aviso ao sinalizar registros sandbox legados:', err);
  }
}
