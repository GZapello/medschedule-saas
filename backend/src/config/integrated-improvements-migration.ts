export function migrateIntegratedImprovements(rawDb: any): void {
  const tableColumns = (table: string): string[] => {
    try {
      return (rawDb.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(c => c.name);
    } catch {
      return [];
    }
  };

  const addColIfMissing = (table: string, col: string, def: string) => {
    const cols = tableColumns(table);
    if (cols.length > 0 && !cols.includes(col)) {
      try {
        rawDb.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
      } catch (_) {}
    }
  };

  // =========================================================================
  // FASE 2: Relatórios, Continuidade do Cuidado e Periodicidade de Retorno
  // =========================================================================
  addColIfMissing('patients', 'return_periodicity_days', 'INTEGER');
  addColIfMissing('patients', 'follow_up_status', "TEXT DEFAULT 'active'");
  addColIfMissing('patients', 'follow_up_notes', 'TEXT');
  addColIfMissing('services', 'return_periodicity_days', 'INTEGER');

  // =========================================================================
  // FASE 3: Check-In de Pacientes e Avisos em Tempo Real aos Profissionais
  // =========================================================================
  addColIfMissing('tenants', 'checkin_enabled', 'INTEGER DEFAULT 1');
  addColIfMissing('professionals', 'checkin_alerts_enabled', 'INTEGER DEFAULT 0');
  addColIfMissing('professionals', 'checkin_sound_enabled', 'INTEGER DEFAULT 0');
  addColIfMissing('users', 'checkin_alerts_enabled', 'INTEGER DEFAULT 0');
  addColIfMissing('users', 'checkin_sound_enabled', 'INTEGER DEFAULT 0');

  addColIfMissing('appointments', 'reception_status', "TEXT DEFAULT 'waiting_arrival'");
  addColIfMissing('appointments', 'arrived_at', 'TEXT');
  addColIfMissing('appointments', 'called_at', 'TEXT');
  addColIfMissing('appointments', 'checked_out_at', 'TEXT');
  addColIfMissing('appointments', 'checked_in_by', 'TEXT');

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS checkin_preferences (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      professional_id TEXT,
      alerts_enabled INTEGER NOT NULL DEFAULT 0,
      sound_enabled INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_checkin_prefs_tenant_prof
      ON checkin_preferences (tenant_id, professional_id);

    CREATE TABLE IF NOT EXISTS checkin_alerts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      appointment_id TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      patient_name TEXT NOT NULL,
      appointment_time TEXT NOT NULL,
      reception_status TEXT NOT NULL DEFAULT 'waiting_attendance',
      message TEXT NOT NULL,
      created_by_user_id TEXT,
      read_at TEXT,
      dismissed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, appointment_id, reception_status)
    );

    CREATE INDEX IF NOT EXISTS idx_checkin_alerts_prof
      ON checkin_alerts (tenant_id, professional_id, created_at DESC);
  `);

  // =========================================================================
  // FASE 4: Pré-Consulta Digital & Integração Opcional com Zemda360
  // =========================================================================
  addColIfMissing('appointments', 'pre_consultation_form_id', 'TEXT');
  addColIfMissing('appointments', 'pre_consultation_submission_id', 'TEXT');
  addColIfMissing('appointments', 'pre_consultation_status', 'TEXT');

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS pre_consultation_forms (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      professional_id TEXT,
      profession_id TEXT,
      profession_name TEXT,
      title TEXT NOT NULL,
      description TEXT,
      purpose TEXT,
      instructions TEXT,
      visibility TEXT NOT NULL DEFAULT 'clinic' CHECK(visibility IN ('private', 'clinic')),
      include_zemda360_body_map INTEGER NOT NULL DEFAULT 0,
      include_body_map INTEGER NOT NULL DEFAULT 0,
      body_map_config_json TEXT,
      fields_json TEXT NOT NULL DEFAULT '[]',
      version INTEGER NOT NULL DEFAULT 1,
      current_version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
      is_active INTEGER NOT NULL DEFAULT 1,
      is_default_template INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pre_consult_forms_tenant
      ON pre_consultation_forms (tenant_id, status, visibility);

    CREATE TABLE IF NOT EXISTS pre_consultation_form_versions (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      instructions TEXT,
      purpose TEXT,
      profession_id TEXT,
      include_zemda360_body_map INTEGER NOT NULL DEFAULT 0,
      include_body_map INTEGER NOT NULL DEFAULT 0,
      body_map_config_json TEXT,
      fields_json TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(form_id, version)
    );

    CREATE TABLE IF NOT EXISTS pre_consultation_submissions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      appointment_id TEXT,
      patient_id TEXT NOT NULL,
      professional_id TEXT,
      form_id TEXT NOT NULL,
      form_version_id TEXT,
      form_version INTEGER NOT NULL DEFAULT 1,
      form_snapshot_json TEXT NOT NULL DEFAULT '{}',
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('not_sent', 'pending', 'submitted', 'responded', 'expired', 'revoked')),
      sent_at TEXT,
      expires_at TEXT NOT NULL,
      submitted_at TEXT,
      responded_at TEXT,
      revoked_at TEXT,
      respondent_type TEXT DEFAULT 'patient' CHECK(respondent_type IN ('patient', 'guardian')),
      respondent_name TEXT,
      respondent_relationship TEXT,
      is_guardian INTEGER NOT NULL DEFAULT 0,
      guardian_name TEXT,
      guardian_cpf TEXT,
      respondent_document TEXT,
      answers_json TEXT,
      body_map_json TEXT,
      body_map_points_json TEXT,
      body_map_imported_at TEXT,
      body_map_imported_by TEXT,
      body_map_imported_assessment_id TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pre_consult_sub_token
      ON pre_consultation_submissions (token);

    CREATE INDEX IF NOT EXISTS idx_pre_consult_sub_appt
      ON pre_consultation_submissions (tenant_id, appointment_id);

    CREATE INDEX IF NOT EXISTS idx_pre_consult_sub_patient
      ON pre_consultation_submissions (tenant_id, patient_id, created_at DESC);
  `);

  addColIfMissing('pre_consultation_forms', 'include_zemda360_body_map', 'INTEGER NOT NULL DEFAULT 0');
  addColIfMissing('pre_consultation_forms', 'version', 'INTEGER NOT NULL DEFAULT 1');
  addColIfMissing('pre_consultation_forms', 'is_active', 'INTEGER NOT NULL DEFAULT 1');
  addColIfMissing('pre_consultation_form_versions', 'purpose', 'TEXT');
  addColIfMissing('pre_consultation_form_versions', 'profession_id', 'TEXT');
  addColIfMissing('pre_consultation_form_versions', 'include_zemda360_body_map', 'INTEGER NOT NULL DEFAULT 0');
  addColIfMissing('pre_consultation_form_versions', 'created_by', 'TEXT');
  addColIfMissing('pre_consultation_submissions', 'form_version_id', 'TEXT');
  addColIfMissing('pre_consultation_submissions', 'submitted_at', 'TEXT');
  addColIfMissing('pre_consultation_submissions', 'is_guardian', 'INTEGER NOT NULL DEFAULT 0');
  addColIfMissing('pre_consultation_submissions', 'guardian_name', 'TEXT');
  addColIfMissing('pre_consultation_submissions', 'guardian_cpf', 'TEXT');
  addColIfMissing('pre_consultation_submissions', 'body_map_json', 'TEXT');
  addColIfMissing('pre_consultation_submissions', 'body_map_imported_assessment_id', 'TEXT');
}
