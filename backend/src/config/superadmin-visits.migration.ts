import { DatabaseSync } from 'node:sqlite';

export function migrateSuperAdminVisits(rawDb: DatabaseSync): void {
  try {
    // 1. Tabela de Estabelecimentos Comerciais Prospectados / Visitados (CRM SuperAdmin)
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS superadmin_visit_establishments (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        name TEXT NOT NULL,
        trade_name TEXT,
        corporate_name TEXT,
        cnpj TEXT,
        areas_of_activity_json TEXT NOT NULL DEFAULT '[]',
        establishment_type TEXT,
        city TEXT,
        state TEXT,
        address TEXT,
        website TEXT,
        instagram TEXT,
        estimated_professionals INTEGER,
        primary_contact_name TEXT,
        primary_contact_role TEXT,
        primary_contact_phone TEXT,
        primary_contact_whatsapp TEXT,
        primary_contact_email TEXT,
        best_contact_time TEXT,
        preferred_channel TEXT,
        current_status TEXT NOT NULL DEFAULT 'first_contact',
        last_visit_date TEXT,
        next_action TEXT,
        next_return_date TEXT,
        archived INTEGER NOT NULL DEFAULT 0,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_sa_est_status ON superadmin_visit_establishments(current_status, archived);
      CREATE INDEX IF NOT EXISTS idx_sa_est_city ON superadmin_visit_establishments(city, state);
      CREATE INDEX IF NOT EXISTS idx_sa_est_tenant ON superadmin_visit_establishments(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_sa_est_return ON superadmin_visit_establishments(next_return_date);
    `);

    // 2. Tabela de Visitas e Interações Comerciais (1 Estabelecimento : N Visitas)
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS superadmin_visits (
        id TEXT PRIMARY KEY,
        establishment_id TEXT NOT NULL,
        visit_date TEXT NOT NULL,
        visit_time TEXT,
        modality TEXT NOT NULL DEFAULT 'presential',
        responsible_name TEXT NOT NULL,
        objective TEXT,
        features_presented_json TEXT NOT NULL DEFAULT '[]',
        needs_identified TEXT,
        main_doubts TEXT,
        commercial_objections TEXT,
        notes TEXT,
        result TEXT,
        status_after_visit TEXT NOT NULL,
        next_action TEXT,
        next_return_date TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (establishment_id) REFERENCES superadmin_visit_establishments(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sa_visits_est ON superadmin_visits(establishment_id, visit_date);
      CREATE INDEX IF NOT EXISTS idx_sa_visits_date ON superadmin_visits(visit_date);
    `);

    // 3. Tabela de Tarefas e Acompanhamentos Comerciais (Follow-ups)
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS superadmin_visit_tasks (
        id TEXT PRIMARY KEY,
        establishment_id TEXT NOT NULL,
        visit_id TEXT,
        task_type TEXT NOT NULL,
        description TEXT NOT NULL,
        due_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        completed_at TEXT,
        assigned_to TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (establishment_id) REFERENCES superadmin_visit_establishments(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sa_tasks_est ON superadmin_visit_tasks(establishment_id, due_date, status);
      CREATE INDEX IF NOT EXISTS idx_sa_tasks_due ON superadmin_visit_tasks(due_date, status);
    `);
  } catch (err) {
    console.error('[Migration] Erro ao executar migrateSuperAdminVisits:', err);
  }
}
