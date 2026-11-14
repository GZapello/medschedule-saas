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
  addColIfMissing('services', 'service_domain', 'TEXT');
  addColIfMissing('services', 'allowed_recurrence_frequencies_json', 'TEXT');
  addColIfMissing('services', 'default_recurrence_frequency', 'TEXT');
  addColIfMissing('services', 'custom_recurrence_intervals_json', 'TEXT');
  addColIfMissing('services', 'default_recurrence_interval_json', 'TEXT');

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
  addColIfMissing('payments', 'package_contract_id', 'TEXT');
  addColIfMissing('payments', 'installment_number', 'INTEGER');
  addColIfMissing('payments', 'total_installments', 'INTEGER');

  // 4b. Referência de pacote em appointments (nunca cria cobrança individual quando is_package_covered = 1)
  addColIfMissing('appointments', 'package_contract_id', 'TEXT');
  addColIfMissing('appointments', 'package_entitlement_id', 'TEXT');
  addColIfMissing('appointments', 'is_package_covered', 'INTEGER NOT NULL DEFAULT 0');

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
    CREATE INDEX IF NOT EXISTS idx_appts_package ON appointments(tenant_id, package_contract_id, status);
    CREATE INDEX IF NOT EXISTS idx_payments_due_status ON payments(tenant_id, status, due_date);
    CREATE INDEX IF NOT EXISTS idx_payments_package_contract ON payments(tenant_id, package_contract_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_recurring_competence
      ON payments(tenant_id, recurring_plan_id, competence_month)
      WHERE recurring_plan_id IS NOT NULL;

    -- 7b. Pacotes Multisserviços para Studios, Direitos e Auditoria de Consumo
    CREATE TABLE IF NOT EXISTS service_packages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      billing_type TEXT NOT NULL DEFAULT 'recurring_monthly' CHECK(billing_type IN ('one_time', 'recurring_monthly')),
      price REAL NOT NULL DEFAULT 0,
      credit_mode TEXT NOT NULL DEFAULT 'per_service' CHECK(credit_mode IN ('per_service', 'shared_pool')),
      total_credits INTEGER,
      weekly_limit INTEGER,
      validity_days INTEGER,
      installments_count INTEGER NOT NULL DEFAULT 1,
      due_day INTEGER NOT NULL DEFAULT 10,
      absent_consumption_policy TEXT NOT NULL DEFAULT 'consume' CHECK(absent_consumption_policy IN ('consume', 'refund')),
      cancellation_hours_limit INTEGER NOT NULL DEFAULT 12,
      allow_public_booking INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_service_packages_tenant ON service_packages(tenant_id, active, allow_public_booking);

    CREATE TABLE IF NOT EXISTS service_package_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      package_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      included_credits INTEGER,
      weekly_frequency INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(package_id, service_id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (package_id) REFERENCES service_packages(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_pkg_items_pkg ON service_package_items(package_id, tenant_id);

    CREATE TABLE IF NOT EXISTS student_package_contracts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      package_id TEXT,
      student_id TEXT NOT NULL,
      recurring_plan_id TEXT,
      package_name_snapshot TEXT NOT NULL,
      description_snapshot TEXT,
      billing_type_snapshot TEXT NOT NULL DEFAULT 'recurring_monthly',
      credit_mode_snapshot TEXT NOT NULL DEFAULT 'per_service',
      contracted_price REAL NOT NULL DEFAULT 0,
      installments_count INTEGER NOT NULL DEFAULT 1,
      total_credits_snapshot INTEGER,
      weekly_limit_snapshot INTEGER,
      validity_days_snapshot INTEGER,
      due_day_snapshot INTEGER NOT NULL DEFAULT 10,
      absent_consumption_policy_snapshot TEXT NOT NULL DEFAULT 'consume',
      cancellation_hours_limit_snapshot INTEGER NOT NULL DEFAULT 12,
      start_date TEXT NOT NULL,
      end_date TEXT,
      contract_status TEXT NOT NULL DEFAULT 'requested' CHECK(contract_status IN ('requested', 'confirmed', 'active', 'suspended', 'expired', 'cancelled')),
      payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending', 'partial', 'paid', 'exempt')),
      origin TEXT NOT NULL DEFAULT 'admin',
      notes TEXT,
      confirmed_by TEXT,
      confirmed_at TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (package_id) REFERENCES service_packages(id) ON DELETE SET NULL,
      FOREIGN KEY (student_id) REFERENCES patients(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_contracts_tenant_student ON student_package_contracts(tenant_id, student_id, contract_status);

    CREATE TABLE IF NOT EXISTS student_package_entitlements (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      contract_id TEXT NOT NULL,
      service_id TEXT,
      service_name_snapshot TEXT NOT NULL,
      allowed_service_ids_json TEXT,
      weekly_frequency_snapshot INTEGER,
      credits_total INTEGER NOT NULL DEFAULT 0,
      credits_reserved INTEGER NOT NULL DEFAULT 0,
      credits_used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (contract_id) REFERENCES student_package_contracts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_entitlements_contract ON student_package_entitlements(contract_id, tenant_id, service_id);

    CREATE TABLE IF NOT EXISTS package_usage_ledger (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      contract_id TEXT NOT NULL,
      entitlement_id TEXT NOT NULL,
      appointment_id TEXT,
      action TEXT NOT NULL CHECK(action IN ('reserve', 'consume', 'release', 'consume_absence', 'refund_absence')),
      delta_reserved INTEGER NOT NULL DEFAULT 0,
      delta_used INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (contract_id) REFERENCES student_package_contracts(id) ON DELETE CASCADE,
      FOREIGN KEY (entitlement_id) REFERENCES student_package_entitlements(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pkg_ledger_appt_action
      ON package_usage_ledger(contract_id, appointment_id, action)
      WHERE appointment_id IS NOT NULL;

    -- 8. Grade Semanal de Aulas Coletivas / Turmas (desacoplada da agenda individual de alunos)
    CREATE TABLE IF NOT EXISTS class_schedules (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      room_id TEXT,
      day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 1,
      modality TEXT NOT NULL DEFAULT 'presential' CHECK(modality IN ('presential', 'online', 'home')),
      effective_start_date TEXT NOT NULL,
      effective_end_date TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
      FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_class_schedules_lookup
      ON class_schedules(tenant_id, service_id, active, day_of_week, start_time);
    CREATE INDEX IF NOT EXISTS idx_class_schedules_prof
      ON class_schedules(tenant_id, professional_id, active, day_of_week);
  `);

  addColIfMissing('recurring_billing_plans', 'package_contract_id', 'TEXT');
  addColIfMissing('class_series', 'interval_value', 'INTEGER');
  addColIfMissing('class_series', 'interval_unit', 'TEXT');
  addColIfMissing('class_occurrences', 'class_schedule_id', 'TEXT');
  try {
    rawDb.exec(`
      CREATE INDEX IF NOT EXISTS idx_class_occ_schedule
        ON class_occurrences(tenant_id, class_schedule_id, start_time);
    `);
  } catch (e) {
    console.warn('[StudioMigration] Aviso ao criar idx_class_occ_schedule:', e);
  }

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
