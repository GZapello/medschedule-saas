import { PROFESSIONAL_ACTIVITY_SEEDS } from './professional-activities.seed';

export function migrateProfessionalActivities(rawDb: any): void {
  // Helper para verificar colunas existentes
  const tableColumns = (table: string): string[] => {
    try {
      const info = rawDb.prepare(`PRAGMA table_info(${table})`).all() as any[];
      return info.map(c => c.name);
    } catch {
      return [];
    }
  };

  const addColumnIfNotExists = (table: string, column: string, typeDef: string) => {
    const cols = tableColumns(table);
    if (cols.length > 0 && !cols.includes(column)) {
      try {
        rawDb.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeDef};`);
      } catch (err) {
        console.warn(`[Migration] Coluna ${column} na tabela ${table} não pôde ser adicionada:`, err);
      }
    }
  };

  // 1. Tabela de Modelos da Biblioteca (Biblioteca Zemda e Minha Biblioteca)
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS clinical_activity_templates (
      id TEXT PRIMARY KEY,
      tenant_id TEXT, -- NULL para modelos oficiais da plataforma; preenchido para modelos criados pela clínica
      author_user_id TEXT,
      author_professional_id TEXT,
      profession_id TEXT NOT NULL, -- 'fono', 'pp', 'to'
      category TEXT NOT NULL,
      subcategory TEXT,
      title TEXT NOT NULL,
      objective TEXT NOT NULL,
      target_skill TEXT,
      age_group TEXT,
      setting TEXT NOT NULL DEFAULT 'home' CHECK(setting IN ('home', 'school', 'community', 'other', 'general')),
      materials_needed TEXT,
      instructions TEXT NOT NULL,
      frequency TEXT,
      caregiver_guidance TEXT,
      adaptations TEXT,
      notes TEXT,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_act_tmpl_prof ON clinical_activity_templates(profession_id, tenant_id, is_system);
    CREATE INDEX IF NOT EXISTS idx_act_tmpl_cat ON clinical_activity_templates(profession_id, category);
  `);

  // 2. Tabela de Favoritos dos Profissionais
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS clinical_activity_favorites (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, user_id, template_id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (template_id) REFERENCES clinical_activity_templates(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_act_fav_user ON clinical_activity_favorites(tenant_id, user_id);
  `);

  // 3. Tabela de Histórico e Acompanhamentos das Atividades Atribuídas
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS clinical_home_program_follow_ups (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      program_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      professional_id TEXT,
      professional_name TEXT,
      status TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (program_id) REFERENCES clinical_home_programs(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_prog_follow_ups ON clinical_home_program_follow_ups(tenant_id, program_id);
    CREATE INDEX IF NOT EXISTS idx_prog_follow_ups_patient ON clinical_home_program_follow_ups(tenant_id, patient_id);
  `);

  // 4. Extensão segura e retrocompatível de clinical_home_programs
  addColumnIfNotExists('clinical_home_programs', 'template_id', 'TEXT');
  addColumnIfNotExists('clinical_home_programs', 'category', 'TEXT');
  addColumnIfNotExists('clinical_home_programs', 'subcategory', 'TEXT');
  addColumnIfNotExists('clinical_home_programs', 'target_skill', 'TEXT');
  addColumnIfNotExists('clinical_home_programs', 'caregiver_guidance', 'TEXT');
  addColumnIfNotExists('clinical_home_programs', 'adaptations', 'TEXT');
  addColumnIfNotExists('clinical_home_programs', 'notes', 'TEXT');

  // 5. Seed idempotente dos 60 modelos oficiais (Biblioteca Zemda)
  try {
    const checkStmt = rawDb.prepare('SELECT id FROM clinical_activity_templates WHERE id = ?');
    const insertStmt = rawDb.prepare(`
      INSERT INTO clinical_activity_templates (
        id, tenant_id, author_user_id, author_professional_id, profession_id,
        category, subcategory, title, objective, target_skill, age_group,
        setting, materials_needed, instructions, frequency, caregiver_guidance,
        adaptations, notes, is_system, created_at, updated_at
      ) VALUES (
        ?, NULL, NULL, NULL, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, 1, datetime('now'), datetime('now')
      )
    `);

    let seededCount = 0;
    for (const item of PROFESSIONAL_ACTIVITY_SEEDS) {
      const exists = checkStmt.get(item.id);
      if (!exists) {
        insertStmt.run(
          item.id,
          item.profession_id,
          item.category,
          item.subcategory,
          item.title,
          item.objective,
          item.target_skill,
          item.age_group,
          item.setting,
          item.materials_needed,
          item.instructions,
          item.frequency,
          item.caregiver_guidance,
          item.adaptations,
          item.notes
        );
        seededCount++;
      }
    }

    if (seededCount > 0) {
      console.log(`[ProfessionalActivities] Seed de ${seededCount} modelos oficiais concluído com sucesso.`);
    }
  } catch (err) {
    console.error('[ProfessionalActivities] Erro ao semear modelos de atividades:', err);
  }
}
