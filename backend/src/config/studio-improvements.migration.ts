import { DatabaseSync } from 'node:sqlite';

/**
 * Migração aditiva e idempotente para suportar as 7 melhorias integradas (Clinicas & Studios):
 * 1. Perfil do estabelecimento em tenants (clinic | studio | mixed)
 * 2. Profissão canônica Instrutor + especialidades/modalidades (preservando aliases prof-instrutor-pilates / pilates_instructor)
 * 3. Preferências individuais da Sidebar por usuário e estabelecimento
 * 4. Comissões por serviço e profissional + histórico congelado de folha (payroll_items)
 * 5. Serviços individuais vs aulas coletivas/turmas, vagas, séries recorrentes e ocorrências
 * 6. Frequência individual por aula coletiva (desacoplada do app de treinos do aluno)
 * 7. Planos de mensalidades recorrentes idempotentes + campos de vencimento em payments
 */
export function migrateStudioImprovements(rawDb: DatabaseSync): void {
  const addColIfMissing = (table: string, col: string, definition: string) => {
    try {
      const cols = rawDb.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (cols.length > 0 && !cols.some(c => c.name === col)) {
        rawDb.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${definition}`);
      }
    } catch (e) {
      console.warn(`[StudioMigration] Aviso ao adicionar ${table}.${col}:`, e);
    }
  };

  // 1. Perfil do estabelecimento no tenant (padrão clinic preservado)
  addColIfMissing('tenants', 'establishment_profile', "TEXT NOT NULL DEFAULT 'clinic'");

  // 2. Configurações de agendamento e recorrência em services
  addColIfMissing('services', 'service_kind', "TEXT NOT NULL DEFAULT 'individual'");
  addColIfMissing('services', 'default_capacity', 'INTEGER');
  addColIfMissing('services', 'allow_recurrence', 'INTEGER NOT NULL DEFAULT 1');
  addColIfMissing('services', 'modality_category', 'TEXT');

  // 3. Vínculo de turma/ocorrência, recorrência e frequência individual em appointments
  addColIfMissing('appointments', 'series_id', 'TEXT');
  addColIfMissing('appointments', 'occurrence_id', 'TEXT');
  addColIfMissing('appointments', 'service_kind', "TEXT NOT NULL DEFAULT 'individual'");
  addColIfMissing('appointments', 'attendance_status', "TEXT NOT NULL DEFAULT 'pending'");
  addColIfMissing('appointments', 'attendance_marked_at', 'TEXT');
  addColIfMissing('appointments', 'attendance_marked_by', 'TEXT');
  addColIfMissing('appointments', 'attendance_notes', 'TEXT');

  // 4. Campos financeiros para cobranças, vencimento e mensalidades em payments
  addColIfMissing('payments', 'due_date', 'TEXT');
  addColIfMissing('payments', 'recurring_plan_id', 'TEXT');
  addColIfMissing('payments', 'competence_month', 'TEXT');
  addColIfMissing('payments', 'professional_id', 'TEXT');

  // 5. Snapshot de detalhamento na folha de pagamento
  addColIfMissing('professional_payrolls', 'commission_breakdown_json', 'TEXT');

  // 6. Novas tabelas estruturais e índices idempotentes
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS user_sidebar_preferences (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      hidden_items_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, tenant_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sidebar_prefs_user_tenant ON user_sidebar_preferences(user_id, tenant_id);

    CREATE TABLE IF NOT EXISTS professional_service_commissions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      commission_type TEXT NOT NULL DEFAULT 'percentage',
      commission_value REAL NOT NULL DEFAULT 0,
      group_payout_basis TEXT NOT NULL DEFAULT 'per_present_student',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, professional_id, service_id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_prof_srv_comm_lookup ON professional_service_commissions(tenant_id, professional_id, active);

    CREATE TABLE IF NOT EXISTS payroll_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      payroll_id TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      service_id TEXT,
      appointment_id TEXT,
      occurrence_id TEXT,
      service_name_snapshot TEXT,
      service_kind_snapshot TEXT NOT NULL DEFAULT 'individual',
      eligible_students_count INTEGER NOT NULL DEFAULT 1,
      gross_basis_amount REAL NOT NULL DEFAULT 0,
      rule_source TEXT NOT NULL DEFAULT 'none',
      commission_type TEXT NOT NULL DEFAULT 'none',
      commission_rate REAL NOT NULL DEFAULT 0,
      group_payout_basis TEXT,
      commission_amount REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (payroll_id) REFERENCES professional_payrolls(id) ON DELETE CASCADE,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_payroll_items_payroll ON payroll_items(payroll_id, tenant_id);

    CREATE TABLE IF NOT EXISTS class_series (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      room_id TEXT,
      patient_id TEXT,
      service_kind TEXT NOT NULL DEFAULT 'individual',
      title TEXT,
      modality TEXT NOT NULL DEFAULT 'presential',
      frequency TEXT NOT NULL DEFAULT 'weekly',
      weekdays_json TEXT,
      start_time_hhmm TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 50,
      start_date TEXT NOT NULL,
      end_date TEXT,
      max_occurrences INTEGER,
      capacity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
      FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_class_series_tenant ON class_series(tenant_id, professional_id, status);

    CREATE TABLE IF NOT EXISTS class_occurrences (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      series_id TEXT,
      service_id TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      room_id TEXT,
      title TEXT,
      modality TEXT NOT NULL DEFAULT 'presential',
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'scheduled',
      notes TEXT,
      google_event_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
      FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_class_occ_slot ON class_occurrences(tenant_id, professional_id, start_time, status);
    CREATE INDEX IF NOT EXISTS idx_class_occ_series ON class_occurrences(series_id, start_time);

    CREATE TABLE IF NOT EXISTS recurring_billing_plans (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      service_id TEXT,
      professional_id TEXT,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      billing_cycle TEXT NOT NULL DEFAULT 'monthly',
      due_day INTEGER NOT NULL DEFAULT 10,
      start_date TEXT NOT NULL,
      end_date TEXT,
      last_generated_month TEXT,
      payment_method TEXT NOT NULL DEFAULT 'pix',
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_rec_billing_tenant ON recurring_billing_plans(tenant_id, status, due_day);

    CREATE INDEX IF NOT EXISTS idx_appts_occurrence ON appointments(tenant_id, occurrence_id, status);
    CREATE INDEX IF NOT EXISTS idx_appts_series ON appointments(tenant_id, series_id, start_time);
    CREATE INDEX IF NOT EXISTS idx_payments_due_status ON payments(tenant_id, status, due_date);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_recurring_competence
      ON payments(tenant_id, recurring_plan_id, competence_month)
      WHERE recurring_plan_id IS NOT NULL;
  `);

  // 7. Profissão canônica "Instrutor" + modalidades (preservando prof-instrutor-pilates / pilates_instructor)
  try {
    rawDb.prepare(`
      INSERT INTO categories (id, name, slug, icon, default_terminology, is_clinical, description)
      VALUES ('cat-esporte', 'Esporte e Atividade Física', 'esporte', 'Dumbbell', 'student', 0, 'Personal trainers, instrutores de pilates, dança, ritmos e treinamento físico')
      ON CONFLICT(id) DO NOTHING
    `).run();

    rawDb.prepare(`
      INSERT INTO professions (id, category_id, name, slug, registration_board_label, registration_required, active)
      VALUES ('prof-instrutor', 'cat-esporte', 'Instrutor', 'instrutor', 'Certificação', 0, 1)
      ON CONFLICT(id) DO UPDATE SET
        category_id = 'cat-esporte',
        name = 'Instrutor',
        slug = 'instrutor',
        registration_board_label = 'Certificação',
        active = 1
    `).run();

    // Mantém prof-instrutor-pilates ativo como alias compatível sem destruir referências existentes,
    // mas não duplica na listagem canônica (is_canonical = 0 quando a coluna existir)
    rawDb.prepare(`
      INSERT INTO professions (id, category_id, name, slug, registration_board_label, registration_required, active)
      VALUES ('prof-instrutor-pilates', 'cat-esporte', 'Instrutor', 'instrutor-pilates', 'Certificação', 0, 1)
      ON CONFLICT(id) DO UPDATE SET
        name = 'Instrutor',
        active = 1
    `).run();

    try {
      const profCols = rawDb.prepare('PRAGMA table_info(professions)').all() as { name: string }[];
      if (profCols.some(c => c.name === 'is_canonical')) {
        rawDb.prepare("UPDATE professions SET is_canonical = 1 WHERE id = 'prof-instrutor'").run();
        rawDb.prepare("UPDATE professions SET is_canonical = 0 WHERE id = 'prof-instrutor-pilates'").run();
      }
    } catch (_) {}

    const instructorAreas = [
      { id: 'pa-inst-pilates', name: 'Pilates', slug: 'pilates', type: 'AREA' },
      { id: 'pa-inst-danca', name: 'Dança', slug: 'danca', type: 'AREA' },
      { id: 'pa-inst-zumba', name: 'Zumba', slug: 'zumba', type: 'AREA' },
      { id: 'pa-inst-yoga', name: 'Yoga', slug: 'yoga', type: 'AREA' },
      { id: 'pa-inst-alongamento', name: 'Alongamento', slug: 'alongamento', type: 'AREA' },
      { id: 'pa-inst-ginastica', name: 'Ginástica', slug: 'ginastica', type: 'AREA' },
      { id: 'pa-inst-ritmos', name: 'Ritmos', slug: 'ritmos', type: 'AREA' },
      { id: 'pa-inst-funcional', name: 'Treinamento funcional', slug: 'treinamento-funcional', type: 'AREA' },
      { id: 'pa-inst-outras', name: 'Outras modalidades', slug: 'outras-modalidades', type: 'AREA' }
    ];

    const upsertArea = rawDb.prepare(`
      INSERT INTO practice_areas (id, profession_id, name, slug, type, active)
      VALUES (?, ?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET
        profession_id = excluded.profession_id,
        name = excluded.name,
        slug = excluded.slug,
        type = excluded.type,
        active = 1
    `);

    for (const area of instructorAreas) {
      upsertArea.run(area.id, 'prof-instrutor', area.name, area.slug, area.type);
    }

    // Reaponta permissões de módulo e capabilities para prof-instrutor (sem conceder atos clínicos regulamentados)
    const instructorDefaultCaps = [
      'CORE_SCHEDULE',
      'CORE_PATIENTS',
      'CORE_TIMELINE',
      'TRAINING_PRESCRIBE',
      'PHOTO_MONITORING',
      'FUNCTIONAL_TESTS',
      'POSTURE_GAIT',
      'MOBILITY_ASSESSMENT',
      'FUNCTIONAL_ASSESSMENT',
      'BODY_MAP',
      'ANTHROPOMETRY'
    ];
    const instructorHiddenCaps = [
      'ODONTO_SPECIFIC',
      'FONO_SPECIFIC',
      'AUDIOLOGY',
      'NUTRITION_SPECIFIC',
      'MEDICAL_BASE',
      'MEDICAL_NEURO'
    ];
    const upsertProfCap = rawDb.prepare(`
      INSERT INTO profession_capabilities (profession_id, capability_id, rule)
      SELECT ?, c.id, ?
      FROM capabilities c
      WHERE c.id = ?
      ON CONFLICT(profession_id, capability_id) DO UPDATE SET rule = excluded.rule
    `);
    for (const cap of instructorDefaultCaps) {
      upsertProfCap.run('prof-instrutor', 'DEFAULT', cap);
      upsertProfCap.run('prof-instrutor-pilates', 'DEFAULT', cap);
    }
    for (const cap of instructorHiddenCaps) {
      upsertProfCap.run('prof-instrutor', 'HIDDEN', cap);
      upsertProfCap.run('prof-instrutor-pilates', 'HIDDEN', cap);
    }

    // Backfill seguro e não-destrutivo: ativa zemda_personal_enabled para instrutores existentes sem perder profession_id nem dados
    rawDb.exec(`
      UPDATE professionals
      SET zemda_personal_enabled = 1
      WHERE profession_id IN ('prof-instrutor', 'prof-instrutor-pilates', 'pilates_instructor')
        AND COALESCE(zemda_personal_enabled, 0) = 0;

      UPDATE clinic_users
      SET zemda_personal_enabled = 1
      WHERE profession_id IN ('prof-instrutor', 'prof-instrutor-pilates', 'pilates_instructor')
        AND COALESCE(zemda_personal_enabled, 0) = 0;

      UPDATE users
      SET zemda_personal_enabled = 1
      WHERE profession_id IN ('prof-instrutor', 'prof-instrutor-pilates', 'pilates_instructor')
        AND COALESCE(zemda_personal_enabled, 0) = 0;
    `);
  } catch (e) {
    console.warn('[StudioMigration] Aviso ao configurar catálogo Instrutor:', e);
  }
}
