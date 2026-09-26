import { DatabaseSync } from 'node:sqlite';

/**
 * Migration para Link Único do Aluno no ZemdaPersonal
 * - Tabela personal_student_access_links (token criptográfico, expiração por inatividade)
 * - Tabela personal_student_sessions (sessões em andamento com snapshot do treino)
 */
export function migratePersonalStudentLinks(rawDb: DatabaseSync): void {
  try {
    // 1. Tabela de Links de Acesso Externo do Aluno
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS personal_student_access_links (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        professional_id TEXT,
        token_hash TEXT NOT NULL UNIQUE,
        token_encrypted TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'revoked', 'expired')),
        inactivity_days INTEGER NOT NULL DEFAULT 30,
        last_access_at TEXT,
        revoked_at TEXT,
        revoked_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES patients(id) ON DELETE CASCADE,
        FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_psal_tenant_student ON personal_student_access_links (tenant_id, student_id);
      CREATE INDEX IF NOT EXISTS idx_psal_token_hash ON personal_student_access_links (token_hash);
      CREATE INDEX IF NOT EXISTS idx_psal_status ON personal_student_access_links (status);

      -- 2. Tabela de Sessões de Treino do Aluno (Preserva snapshot histórico da execução)
      CREATE TABLE IF NOT EXISTS personal_student_sessions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        workout_id TEXT NOT NULL,
        link_id TEXT,
        status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress', 'completed', 'abandoned')),
        snapshot_workout_json TEXT NOT NULL,
        progress_state_json TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        duration_minutes INTEGER,
        workout_log_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES patients(id) ON DELETE CASCADE,
        FOREIGN KEY (workout_id) REFERENCES personal_workouts(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_pss_tenant_student ON personal_student_sessions (tenant_id, student_id, status);
      CREATE INDEX IF NOT EXISTS idx_pss_workout ON personal_student_sessions (workout_id);
    `);

    console.log('[Migration] personal-student-links migration aplicada com sucesso.');
  } catch (err) {
    console.error('[Migration] Erro ao aplicar personal-student-links migration:', err);
    throw err;
  }
}
