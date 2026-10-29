import { DatabaseSync } from 'node:sqlite';

export function migrateGoogleCalendar(rawDb: DatabaseSync): void {
  try {
    // 1. Tabela de conexões com Google Calendar (individual por usuário/profissional por tenant)
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS google_calendar_connections (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        professional_id TEXT,
        google_account_email TEXT NOT NULL,
        calendar_id TEXT NOT NULL DEFAULT 'primary',
        calendar_name TEXT NOT NULL DEFAULT 'Agenda principal',
        encrypted_refresh_token TEXT NOT NULL,
        granted_scopes TEXT,
        sync_enabled INTEGER NOT NULL DEFAULT 1,
        sync_direction TEXT NOT NULL DEFAULT 'both',
        block_external_events INTEGER NOT NULL DEFAULT 1,
        create_google_meet INTEGER NOT NULL DEFAULT 1,
        privacy_mode TEXT NOT NULL DEFAULT 'private',
        sync_interval_option TEXT NOT NULL DEFAULT 'future',
        last_sync_at TEXT,
        sync_token TEXT,
        watch_channel_id TEXT,
        watch_resource_id TEXT,
        watch_expiration TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(tenant_id, user_id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    rawDb.exec(`
      CREATE INDEX IF NOT EXISTS idx_gcal_conn_tenant_prof
      ON google_calendar_connections(tenant_id, professional_id);
    `);

    // 2. Tabela de vínculos persistentes entre Agendamentos Zemda e Eventos Google
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS google_calendar_event_links (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        appointment_id TEXT NOT NULL UNIQUE,
        connection_id TEXT NOT NULL,
        calendar_id TEXT NOT NULL,
        google_event_id TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'synced',
        last_error TEXT,
        last_synced_at TEXT,
        last_google_updated_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
        FOREIGN KEY (connection_id) REFERENCES google_calendar_connections(id) ON DELETE CASCADE
      );
    `);

    rawDb.exec(`
      CREATE INDEX IF NOT EXISTS idx_gcal_links_appt
      ON google_calendar_event_links(appointment_id);
      CREATE INDEX IF NOT EXISTS idx_gcal_links_conn
      ON google_calendar_event_links(connection_id);
      CREATE INDEX IF NOT EXISTS idx_gcal_links_gevent
      ON google_calendar_event_links(calendar_id, google_event_id);
    `);

    // 3. Tabela para estados temporários de OAuth (com TTL/expiração)
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS google_calendar_oauth_states (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL UNIQUE,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        professional_id TEXT,
        return_url TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    rawDb.exec(`
      CREATE INDEX IF NOT EXISTS idx_gcal_oauth_state
      ON google_calendar_oauth_states(state);
    `);
    // Additive migration: preserve existing connections and event history.
    for (const [table, columns] of Object.entries({
      google_calendar_connections: ['google_subject', 'watch_token', 'last_sync_error'],
      google_calendar_oauth_states: ['code_verifier'],
      appointments: ['google_time_imported']
    })) {
      const existing = new Set((rawDb.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(c => c.name));
      for (const column of columns) if (!existing.has(column)) rawDb.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`);
    }
  } catch (err) {
    console.error('[Migration] Erro ao executar migrateGoogleCalendar:', err);
  }
}
