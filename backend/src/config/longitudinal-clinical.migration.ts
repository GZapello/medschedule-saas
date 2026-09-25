import { DatabaseSync } from 'node:sqlite';

export function migrateLongitudinalClinical(rawDb: DatabaseSync): void {
  // Helper para verificar e adicionar colunas de forma segura
  const addColumnIfNotExists = (tableName: string, colName: string, colDef: string) => {
    try {
      const cols = (rawDb.prepare(`PRAGMA table_info(${tableName})`).all() as any[]).map(c => c.name);
      if (!cols.includes(colName)) {
        rawDb.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${colDef}`);
      }
    } catch (_) {}
  };

  // 1. Tabela universal de reavaliações longitudinais (Odonto, TO, Fono)
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS clinical_reassessments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      professional_id TEXT,
      appointment_id TEXT,
      module_type TEXT NOT NULL,
      assessment_type TEXT NOT NULL,
      is_initial INTEGER NOT NULL DEFAULT 0,
      title TEXT,
      data_json TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_reassess_patient_mod_type ON clinical_reassessments(tenant_id, patient_id, module_type, assessment_type);
    CREATE INDEX IF NOT EXISTS idx_reassess_created_at ON clinical_reassessments(created_at);
  `);

  // 2. Metas clínicas mensuráveis padronizadas (TO e Fono)
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS clinical_goals (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      professional_id TEXT,
      module_type TEXT NOT NULL,
      domain TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      baseline_value TEXT,
      current_value TEXT,
      target_value TEXT NOT NULL,
      unit TEXT,
      deadline TEXT,
      status TEXT NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started', 'in_progress', 'partially_reached', 'reached', 'reformulated', 'closed')),
      notes TEXT,
      history_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_goals_patient_module ON clinical_goals(tenant_id, patient_id, module_type);
  `);

  // 3. Exames odontológicos radiológicos e tomográficos independentes
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS dental_exams (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      professional_id TEXT,
      appointment_id TEXT,
      exam_type TEXT NOT NULL,
      exam_date TEXT NOT NULL,
      tooth_number TEXT,
      region TEXT,
      attachment_id TEXT,
      file_url TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_dental_exams_patient ON dental_exams(tenant_id, patient_id);
  `);

  // 4. Acompanhamento de Implantodontia
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS dental_implants (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      professional_id TEXT,
      tooth_region TEXT NOT NULL,
      brand TEXT,
      model TEXT,
      lot_number TEXT,
      diameter TEXT,
      length TEXT,
      surgery_date TEXT,
      torque_ncm REAL,
      graft_type TEXT,
      biomaterial TEXT,
      membrane TEXT,
      healing_abutment TEXT,
      reopening_date TEXT,
      prosthetic_component TEXT,
      installed_prosthesis TEXT,
      attachment_id TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'surgery_done',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_dental_implants_patient ON dental_implants(tenant_id, patient_id);
  `);

  // 5. Fotografias odontológicas estruturadas
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS dental_photos (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      professional_id TEXT,
      appointment_id TEXT,
      category TEXT NOT NULL,
      tooth_number TEXT,
      region TEXT,
      is_initial INTEGER NOT NULL DEFAULT 0,
      is_current INTEGER NOT NULL DEFAULT 1,
      file_id TEXT,
      object_key TEXT,
      photo_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_dental_photos_pat_cat ON dental_photos(tenant_id, patient_id, category);
  `);

  // 6. Análise de Tarefas (ZemdaTO)
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS to_task_analyses (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      professional_id TEXT,
      appointment_id TEXT,
      activity_name TEXT NOT NULL,
      steps_json TEXT NOT NULL,
      barriers TEXT,
      adaptations TEXT,
      strategies TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_to_task_patient ON to_task_analyses(tenant_id, patient_id);
  `);

  // 7. Mapa de Rotina Diária (ZemdaTO)
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS to_routine_maps (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      professional_id TEXT,
      time_blocks_json TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_to_routine_patient ON to_routine_maps(tenant_id, patient_id);
  `);

  // 8. Participação Ocupacional (ZemdaTO)
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS to_occupational_participation (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      professional_id TEXT,
      participation_json TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_to_part_patient ON to_occupational_participation(tenant_id, patient_id);
  `);

  // 9. Programas Domiciliares e Escolares (TO e Fono)
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS clinical_home_programs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      professional_id TEXT,
      module_type TEXT NOT NULL,
      activity TEXT NOT NULL,
      objective TEXT NOT NULL,
      instruction TEXT NOT NULL,
      frequency TEXT,
      environment_context TEXT,
      responsible_person TEXT,
      period TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'partially_completed', 'not_completed')),
      follow_up_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_home_prog_patient ON clinical_home_programs(tenant_id, patient_id, module_type);
  `);

  // 10. Processos Fonológicos Estruturados (ZemdaFono)
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS fono_phonological_processes (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      professional_id TEXT,
      processes_json TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_fono_proc_patient ON fono_phonological_processes(tenant_id, patient_id);
  `);

  // 11. Contador e Amostras de Fluência (ZemdaFono)
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS fono_fluency_samples (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      professional_id TEXT,
      duration_seconds INTEGER NOT NULL,
      words_count INTEGER NOT NULL,
      syllables_count INTEGER NOT NULL,
      repetitions INTEGER DEFAULT 0,
      prolongations INTEGER DEFAULT 0,
      blocks INTEGER DEFAULT 0,
      interjections INTEGER DEFAULT 0,
      revisions INTEGER DEFAULT 0,
      pauses INTEGER DEFAULT 0,
      disfluency_percentage REAL,
      stuttering_percentage REAL,
      speaking_rate_wpm REAL,
      speaking_rate_spm REAL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_fluency_samp_patient ON fono_fluency_samples(tenant_id, patient_id);
  `);

  // 12. Matriz de Consistências e Disfagia (ZemdaFono)
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS fono_dysphagia_matrix (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      professional_id TEXT,
      trials_json TEXT NOT NULL,
      general_observations TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_dysphagia_mat_patient ON fono_dysphagia_matrix(tenant_id, patient_id);
  `);

  // 14. Extensões de colunas em tabelas existentes
  addColumnIfNotExists('dental_prosthetics_lab', 'fitting_date', 'TEXT');
  addColumnIfNotExists('dental_prosthetics_lab', 'installation_date', 'TEXT');
  addColumnIfNotExists('dental_prosthetics_lab', 'adjustment_notes', 'TEXT');
  addColumnIfNotExists('dental_prosthetics_lab', 'current_step', "TEXT DEFAULT 'requested'");

  addColumnIfNotExists('dental_orthodontics', 'current_wire', 'TEXT');
  addColumnIfNotExists('dental_orthodontics', 'arch', 'TEXT');
  addColumnIfNotExists('dental_orthodontics', 'accessories', 'TEXT');
  addColumnIfNotExists('dental_orthodontics', 'elastics', 'TEXT');
  addColumnIfNotExists('dental_orthodontics', 'mechanics', 'TEXT');
  addColumnIfNotExists('dental_orthodontics', 'complications', 'TEXT');
  addColumnIfNotExists('dental_orthodontics', 'next_session_plan', 'TEXT');
  addColumnIfNotExists('dental_orthodontics', 'timeline_json', 'TEXT');

  addColumnIfNotExists('to_assistive_tech', 'functional_result', 'TEXT');
  addColumnIfNotExists('to_assistive_tech', 'next_review_date', 'TEXT');
  addColumnIfNotExists('to_assistive_tech', 'needs_adjustment', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('to_assistive_tech', 'replacement_reason', 'TEXT');

  addColumnIfNotExists('dental_periodontal_records', 'six_sites_json', 'TEXT');
  addColumnIfNotExists('dental_periodontal_records', 'bleeding_percentage', 'REAL');
  addColumnIfNotExists('dental_periodontal_records', 'plaque_percentage', 'REAL');
  addColumnIfNotExists('dental_periodontal_records', 'sites_gte_4mm', 'INTEGER');
  addColumnIfNotExists('dental_periodontal_records', 'sites_gte_6mm', 'INTEGER');
  addColumnIfNotExists('dental_periodontal_records', 'teeth_with_mobility', 'TEXT');
  addColumnIfNotExists('dental_periodontal_records', 'teeth_with_furcation', 'TEXT');

  // Extensões para perfil clínico, observações e alertas estruturados do paciente
  addColumnIfNotExists('patients', 'clinical_notes', 'TEXT');
  addColumnIfNotExists('patients', 'important_alert', 'TEXT');
  addColumnIfNotExists('patients', 'notes', 'TEXT');
}
