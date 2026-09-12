import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { runSeed } from './seed';

const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../saas_schedule.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const rawDb = new DatabaseSync(dbPath);

// Configurações de alta performance e integridade referencial
rawDb.exec('PRAGMA journal_mode = WAL;');
rawDb.exec('PRAGMA foreign_keys = ON;');

export interface ISafeStatement {
  run(...params: any[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: any[]): any;
  all(...params: any[]): any[];
}

class SafeDatabase {
  exec(sql: string): void {
    rawDb.exec(sql);
  }

  prepare(sql: string): ISafeStatement {
    const stmt = rawDb.prepare(sql);
    return {
      run: (...params: any[]) => {
        const safeParams = params.map(p => (p === undefined ? null : p));
        return (stmt as any).run(...safeParams);
      },
      get: (...params: any[]) => {
        const safeParams = params.map(p => (p === undefined ? null : p));
        return (stmt as any).get(...safeParams);
      },
      all: (...params: any[]) => {
        const safeParams = params.map(p => (p === undefined ? null : p));
        return (stmt as any).all(...safeParams);
      }
    };
  }
}

export const db = new SafeDatabase();

export function initializeDatabase(): void {
  let schemaPath = path.resolve(__dirname, 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    schemaPath = path.resolve(__dirname, '../../src/config/schema.sql');
  }
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    rawDb.exec(schemaSql);
  } else {
    console.warn('[Database] Arquivo schema.sql não encontrado em', schemaPath);
  }

  // Migrações dinâmicas para adicionar colunas em tabelas existentes
  try {
    const tableColumns = (table: string): string[] => {
      try {
        const info = rawDb.prepare(`PRAGMA table_info(${table})`).all() as any[];
        return info.map(c => c.name);
      } catch {
        return [];
      }
    };

    const addColIfMissing = (table: string, col: string, typeDef: string) => {
      const cols = tableColumns(table);
      if (cols.length > 0 && !cols.includes(col)) {
        try {
          rawDb.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${typeDef};`);
        } catch (e) {
          console.warn(`[Migration] Coluna ${col} na tabela ${table} não pôde ser adicionada:`, e);
        }
      }
    };

    // Colunas em tenants
    addColIfMissing('tenants', 'corporate_name', 'TEXT');
    addColIfMissing('tenants', 'trade_name', 'TEXT');
    addColIfMissing('tenants', 'person_type', "TEXT DEFAULT 'pj'");
    addColIfMissing('tenants', 'municipal_registration', 'TEXT');
    addColIfMissing('tenants', 'state_registration', 'TEXT');
    addColIfMissing('tenants', 'professional_board', 'TEXT');
    addColIfMissing('tenants', 'professional_registry', 'TEXT');
    addColIfMissing('tenants', 'responsible_name', 'TEXT');
    addColIfMissing('tenants', 'responsible_cpf', 'TEXT');
    addColIfMissing('tenants', 'responsible_email', 'TEXT');
    addColIfMissing('tenants', 'responsible_phone', 'TEXT');
    addColIfMissing('tenants', 'responsible_role', 'TEXT');
    addColIfMissing('tenants', 'onboarding_completed', 'INTEGER DEFAULT 0');
    addColIfMissing('tenants', 'onboarding_step', 'INTEGER DEFAULT 1');
    addColIfMissing('tenants', 'manager_confirmed', 'INTEGER DEFAULT 0');
    addColIfMissing('tenants', 'terms_accepted', 'INTEGER DEFAULT 1');
    addColIfMissing('tenants', 'terms_accepted_at', 'TEXT');
    addColIfMissing('tenants', 'privacy_accepted', 'INTEGER DEFAULT 1');
    addColIfMissing('tenants', 'privacy_accepted_at', 'TEXT');
    addColIfMissing('tenants', 'rejection_reason', 'TEXT');
    addColIfMissing('tenants', 'street', 'TEXT');
    addColIfMissing('tenants', 'number', 'TEXT');
    addColIfMissing('tenants', 'complement', 'TEXT');
    addColIfMissing('tenants', 'neighborhood', 'TEXT');
    addColIfMissing('tenants', 'country', "TEXT DEFAULT 'Brasil'");
    addColIfMissing('tenants', 'mobile', 'TEXT');
    addColIfMissing('tenants', 'whatsapp', 'TEXT');
    addColIfMissing('tenants', 'website', 'TEXT');
    addColIfMissing('tenants', 'description', 'TEXT');

    // Novas colunas para profissão estruturada e atendimentos/áreas de atuação livres
    addColIfMissing('clinic_users', 'profession_custom', 'TEXT');
    addColIfMissing('clinic_users', 'practice_areas', 'TEXT');
    addColIfMissing('professionals', 'practice_areas', 'TEXT');

    // Colunas em agendamentos para convênio, encaminhamento e cancelamento detalhado
    addColIfMissing('appointments', 'insurance_id', 'TEXT');
    addColIfMissing('appointments', 'referred_from_appointment_id', 'TEXT');
    addColIfMissing('appointments', 'referred_by_professional_id', 'TEXT');
    addColIfMissing('appointments', 'referral_reason', 'TEXT');
    addColIfMissing('appointments', 'cancellation_reason_category', 'TEXT');
    addColIfMissing('appointments', 'cancelled_by', 'TEXT');

    // Colunas em pagamentos para vínculo com caixa
    addColIfMissing('payments', 'cash_register_id', 'TEXT');

    // Colunas em pacientes para status explícito de alergias
    addColIfMissing('patients', 'allergies_status', "TEXT DEFAULT 'not_informed'");

    // Criação das novas tabelas clínicas, de convênios, documentos e caixa
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS patient_allergies (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        agent TEXT NOT NULL,
        reaction TEXT,
        severity TEXT DEFAULT 'moderate',
        notes TEXT,
        status TEXT DEFAULT 'active',
        is_no_known_allergies INTEGER DEFAULT 0,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_allergies_patient ON patient_allergies (tenant_id, patient_id);

      CREATE TABLE IF NOT EXISTS patient_medications (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        name TEXT NOT NULL,
        dosage TEXT,
        frequency TEXT,
        route TEXT,
        start_date TEXT,
        end_date TEXT,
        status TEXT DEFAULT 'active',
        notes TEXT,
        professional_name TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_medications_patient ON patient_medications (tenant_id, patient_id, status);

      CREATE TABLE IF NOT EXISTS clinic_insurances (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT,
        notes TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_clinic_insurances ON clinic_insurances (tenant_id, active);

      CREATE TABLE IF NOT EXISTS patient_insurances (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        insurance_id TEXT NOT NULL,
        plan_name TEXT,
        card_number TEXT,
        validity_date TEXT,
        notes TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
        FOREIGN KEY (insurance_id) REFERENCES clinic_insurances(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_patient_insurances ON patient_insurances (tenant_id, patient_id);

      CREATE TABLE IF NOT EXISTS patient_anamnesis (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT NOT NULL,
        title TEXT NOT NULL,
        template_type TEXT DEFAULT 'geral',
        content_json TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        previous_version_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
        FOREIGN KEY (professional_id) REFERENCES professionals(id)
      );
      CREATE INDEX IF NOT EXISTS idx_anamnesis_patient ON patient_anamnesis (tenant_id, patient_id, version);

      CREATE TABLE IF NOT EXISTS clinical_certificates (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT NOT NULL,
        appointment_id TEXT,
        certificate_number TEXT NOT NULL,
        days_rest INTEGER DEFAULT 0,
        cid TEXT,
        content_text TEXT NOT NULL,
        issued_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_by TEXT,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
        FOREIGN KEY (professional_id) REFERENCES professionals(id)
      );
      CREATE INDEX IF NOT EXISTS idx_certificates_patient ON clinical_certificates (tenant_id, patient_id);

      CREATE TABLE IF NOT EXISTS clinical_prescriptions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT NOT NULL,
        appointment_id TEXT,
        prescription_number TEXT NOT NULL,
        items_json TEXT NOT NULL,
        instructions TEXT,
        issued_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_by TEXT,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
        FOREIGN KEY (professional_id) REFERENCES professionals(id)
      );
      CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON clinical_prescriptions (tenant_id, patient_id);

      CREATE TABLE IF NOT EXISTS clinical_exam_requests (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT NOT NULL,
        appointment_id TEXT,
        request_number TEXT NOT NULL,
        exams_list_json TEXT NOT NULL,
        clinical_justification TEXT,
        notes TEXT,
        issued_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_by TEXT,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
        FOREIGN KEY (professional_id) REFERENCES professionals(id)
      );
      CREATE INDEX IF NOT EXISTS idx_exam_requests_patient ON clinical_exam_requests (tenant_id, patient_id);

      CREATE TABLE IF NOT EXISTS patient_exams (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        appointment_id TEXT,
        title TEXT NOT NULL,
        exam_type TEXT DEFAULT 'laboratorial',
        exam_date TEXT,
        file_url TEXT,
        file_type TEXT,
        file_size INTEGER,
        notes TEXT,
        ai_extracted_summary TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_patient_exams ON patient_exams (tenant_id, patient_id);

      CREATE TABLE IF NOT EXISTS cash_registers (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        opened_at TEXT NOT NULL DEFAULT (datetime('now')),
        closed_at TEXT,
        initial_balance REAL NOT NULL DEFAULT 0.0,
        closing_balance_expected REAL,
        closing_balance_actual REAL,
        difference REAL,
        status TEXT NOT NULL DEFAULT 'open',
        notes_open TEXT,
        notes_close TEXT,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_cash_registers ON cash_registers (tenant_id, status);

      CREATE TABLE IF NOT EXISTS patient_consents (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        consent_type TEXT NOT NULL,
        title TEXT NOT NULL,
        version TEXT DEFAULT '1.0',
        content_text TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'accepted',
        accepted_by_name TEXT,
        accepted_at TEXT,
        revoked_at TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_patient_consents ON patient_consents (tenant_id, patient_id);

      CREATE TABLE IF NOT EXISTS clinic_document_templates (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        template_type TEXT NOT NULL,
        header_text TEXT,
        footer_text TEXT,
        show_logo INTEGER DEFAULT 1,
        show_clinic_address INTEGER DEFAULT 1,
        show_registry INTEGER DEFAULT 1,
        custom_notes TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        UNIQUE(tenant_id, template_type)
      );

      CREATE TABLE IF NOT EXISTS import_batches (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_type TEXT NOT NULL,
        total_records INTEGER NOT NULL DEFAULT 0,
        imported_count INTEGER NOT NULL DEFAULT 0,
        updated_count INTEGER NOT NULL DEFAULT 0,
        skipped_count INTEGER NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0,
        errors_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_import_batches ON import_batches (tenant_id, created_at);

      CREATE TABLE IF NOT EXISTS ai_conversations (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        patient_id TEXT,
        title TEXT NOT NULL,
        context_scope TEXT DEFAULT 'general',
        messages_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_ai_conversations ON ai_conversations (tenant_id, user_id);

      CREATE TABLE IF NOT EXISTS patient_referrals (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        from_professional_id TEXT NOT NULL,
        to_professional_id TEXT NOT NULL,
        service_id TEXT,
        origin_appointment_id TEXT,
        target_appointment_id TEXT,
        reason TEXT NOT NULL,
        notes TEXT,
        priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal', 'routine', 'high', 'urgent')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'scheduled', 'completed', 'cancelled')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
        FOREIGN KEY (from_professional_id) REFERENCES professionals(id),
        FOREIGN KEY (to_professional_id) REFERENCES professionals(id)
      );
      CREATE INDEX IF NOT EXISTS idx_referrals_patient ON patient_referrals (tenant_id, patient_id);
      CREATE INDEX IF NOT EXISTS idx_referrals_to_prof ON patient_referrals (tenant_id, to_professional_id, status);
    `);

    // Migrações de colunas para garantir compatibilidade total de documentos clínicos
    addColIfMissing('clinical_certificates', 'certificate_type', "TEXT DEFAULT 'rest'");
    addColIfMissing('clinical_certificates', 'days_off', "INTEGER DEFAULT 1");
    addColIfMissing('clinical_certificates', 'start_date', "TEXT");
    addColIfMissing('clinical_certificates', 'cid_code', "TEXT");
    addColIfMissing('clinical_certificates', 'notes', "TEXT");
    addColIfMissing('clinical_certificates', 'created_at', "TEXT DEFAULT (datetime('now'))");

    addColIfMissing('clinical_prescriptions', 'prescription_type', "TEXT DEFAULT 'simple'");
    addColIfMissing('clinical_prescriptions', 'content', "TEXT");
    addColIfMissing('clinical_prescriptions', 'created_at', "TEXT DEFAULT (datetime('now'))");

    addColIfMissing('clinical_exam_requests', 'exams_list', "TEXT");
    addColIfMissing('clinical_exam_requests', 'clinical_indication', "TEXT");
    addColIfMissing('clinical_exam_requests', 'created_at', "TEXT DEFAULT (datetime('now'))");

    addColIfMissing('patients', 'import_batch_id', 'TEXT');
    addColIfMissing('patients', 'communication_preferences_json', "TEXT DEFAULT '{\"email\":true,\"sms\":true,\"whatsapp\":true}'");
    addColIfMissing('appointments', 'import_batch_id', 'TEXT');

    addColIfMissing('records', 'created_by', 'TEXT');
    addColIfMissing('records', 'updated_by', 'TEXT');
    addColIfMissing('records', 'edit_history_json', 'TEXT');

    addColIfMissing('notifications', 'retry_count', 'INTEGER DEFAULT 0');
    addColIfMissing('notifications', 'last_error', 'TEXT');
    addColIfMissing('notifications', 'delivery_status', "TEXT DEFAULT 'pending'");
    addColIfMissing('notifications', 'idempotency_key', 'TEXT');

    // Migração de constraints da tabela notifications para permitir reminder_1h sem restrição
    const notifTableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'notifications'").get() as any;
    if (notifTableInfo?.sql && notifTableInfo.sql.includes("CHECK(type IN ('confirmation', 'reminder_24h', 'reminder_2h'")) {
      db.exec(`
        PRAGMA foreign_keys = OFF;
        CREATE TABLE notifications_migrated (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          patient_id TEXT,
          professional_id TEXT,
          appointment_id TEXT,
          type TEXT NOT NULL,
          channel TEXT NOT NULL DEFAULT 'whatsapp',
          recipient TEXT NOT NULL,
          content TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          scheduled_for TEXT NOT NULL,
          sent_at TEXT,
          retry_count INTEGER DEFAULT 0,
          last_error TEXT,
          delivery_status TEXT DEFAULT 'pending',
          idempotency_key TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO notifications_migrated (id, tenant_id, patient_id, professional_id, appointment_id, type, channel, recipient, content, status, scheduled_for, sent_at, created_at)
        SELECT id, tenant_id, patient_id, professional_id, appointment_id, type, channel, recipient, content, status, scheduled_for, sent_at, created_at FROM notifications;
        DROP TABLE notifications;
        ALTER TABLE notifications_migrated RENAME TO notifications;
        CREATE INDEX IF NOT EXISTS idx_notifications_queue ON notifications (status, scheduled_for);
        PRAGMA foreign_keys = ON;
      `);
    }

    // Assegura que a lista detalhada de profissões de saúde e administração exista no banco
    const allDetailedProfessions = [
      // Saúde
      { id: 'prof-fonoaudiologia', cat_id: 'cat-fono', name: 'Fonoaudiologia', slug: 'fonoaudiologia', reg_label: 'CRFa', reg_req: 1 },
      { id: 'prof-psicologia', cat_id: 'cat-mental', name: 'Psicologia', slug: 'psicologia', reg_label: 'CRP', reg_req: 1 },
      { id: 'prof-medicina', cat_id: 'cat-med', name: 'Medicina', slug: 'medicina', reg_label: 'CRM', reg_req: 1 },
      { id: 'prof-odontologia', cat_id: 'cat-odonto', name: 'Odontologia', slug: 'odontologia', reg_label: 'CRO', reg_req: 1 },
      { id: 'prof-enfermagem', cat_id: 'cat-enfermagem', name: 'Enfermagem', slug: 'enfermagem', reg_label: 'COREN', reg_req: 1 },
      { id: 'prof-tec-enfermagem', cat_id: 'cat-enfermagem', name: 'Técnico de Enfermagem', slug: 'tecnico-enfermagem', reg_label: 'COREN', reg_req: 1 },
      { id: 'prof-fisioterapia', cat_id: 'cat-reab', name: 'Fisioterapia', slug: 'fisioterapia', reg_label: 'CREFITO', reg_req: 1 },
      { id: 'prof-terapia-ocupacional', cat_id: 'cat-reab', name: 'Terapia Ocupacional', slug: 'terapia-ocupacional', reg_label: 'CREFITO', reg_req: 1 },
      { id: 'prof-nutricao', cat_id: 'cat-nutri', name: 'Nutrição', slug: 'nutricao', reg_label: 'CRN', reg_req: 1 },
      { id: 'prof-psicopedagogia', cat_id: 'cat-mental', name: 'Psicopedagogia', slug: 'psicopedagogia', reg_label: 'ABPp', reg_req: 0 },
      { id: 'prof-educacao-fisica', cat_id: 'cat-esporte', name: 'Educação Física', slug: 'educacao-fisica', reg_label: 'CREF', reg_req: 1 },
      { id: 'prof-servico-social', cat_id: 'cat-outros', name: 'Serviço Social', slug: 'servico-social', reg_label: 'CRESS', reg_req: 1 },
      { id: 'prof-farmacia', cat_id: 'cat-med', name: 'Farmácia', slug: 'farmacia', reg_label: 'CRF', reg_req: 1 },
      { id: 'prof-biomedicina', cat_id: 'cat-med', name: 'Biomedicina', slug: 'biomedicina', reg_label: 'CRBM', reg_req: 1 },
      { id: 'prof-musicoterapia', cat_id: 'cat-integrativa', name: 'Musicoterapia', slug: 'musicoterapia', reg_label: 'UBAM', reg_req: 0 },
      { id: 'prof-arteterapia', cat_id: 'cat-integrativa', name: 'Arteterapia', slug: 'arteterapia', reg_label: 'UBAAT', reg_req: 0 },
      { id: 'prof-podologia', cat_id: 'cat-beleza', name: 'Podologia', slug: 'podologia', reg_label: 'Registro', reg_req: 0 },
      { id: 'prof-acupuntura', cat_id: 'cat-integrativa', name: 'Acupuntura', slug: 'acupuntura', reg_label: 'Registro', reg_req: 0 },
      { id: 'prof-medicina-veterinaria', cat_id: 'cat-pets', name: 'Medicina Veterinária', slug: 'medicina-veterinaria', reg_label: 'CRMV', reg_req: 1 },
      { id: 'prof-outro-saude', cat_id: 'cat-outros', name: 'Outro profissional da saúde', slug: 'outro-saude', reg_label: 'Registro', reg_req: 0 },
      // Gestão e Administração
      { id: 'prof-gestor', cat_id: 'cat-outros', name: 'Gestor da Clínica', slug: 'gestor-clinica', reg_label: null, reg_req: 0 },
      { id: 'prof-administrador', cat_id: 'cat-outros', name: 'Administrador', slug: 'administrador', reg_label: 'CRA', reg_req: 0 },
      { id: 'prof-recepcionista', cat_id: 'cat-outros', name: 'Recepcionista', slug: 'recepcionista', reg_label: null, reg_req: 0 },
      { id: 'prof-secretaria', cat_id: 'cat-outros', name: 'Secretário(a)', slug: 'secretaria', reg_label: null, reg_req: 0 },
      { id: 'prof-auxiliar-adm', cat_id: 'cat-outros', name: 'Auxiliar Administrativo', slug: 'auxiliar-administrativo', reg_label: null, reg_req: 0 },
      { id: 'prof-financeiro', cat_id: 'cat-outros', name: 'Financeiro', slug: 'financeiro', reg_label: null, reg_req: 0 },
      { id: 'prof-rh', cat_id: 'cat-outros', name: 'Recursos Humanos', slug: 'recursos-humanos', reg_label: null, reg_req: 0 },
      { id: 'prof-coord-clinica', cat_id: 'cat-outros', name: 'Coordenação Clínica', slug: 'coordenacao-clinica', reg_label: null, reg_req: 0 },
      { id: 'prof-direcao-tecnica', cat_id: 'cat-outros', name: 'Direção Técnica', slug: 'direcao-tecnica', reg_label: null, reg_req: 0 },
      { id: 'prof-outro', cat_id: 'cat-outros', name: 'Outro', slug: 'outro', reg_label: null, reg_req: 0 }
    ];

    const insertProfStmt = rawDb.prepare(`
      INSERT OR IGNORE INTO professions (id, category_id, name, slug, registration_board_label, registration_required)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const p of allDetailedProfessions) {
      insertProfStmt.run(p.id, p.cat_id, p.name, p.slug, p.reg_label, p.reg_req);
    }

    // Assegura que o tenant inicial "Espaço Viver Bem" esteja ativo e com onboarding concluído
    rawDb.exec(`
      UPDATE tenants SET
        onboarding_completed = 1,
        manager_confirmed = 1,
        status = 'active',
        corporate_name = COALESCE(corporate_name, name),
        trade_name = COALESCE(trade_name, name),
        responsible_name = COALESCE(responsible_name, 'Dra. Camila Santos'),
        responsible_email = COALESCE(responsible_email, 'diretoria@viverbem.com'),
        responsible_phone = COALESCE(responsible_phone, '(11) 3344-5566')
      WHERE slug = 'clinica-viver-bem';
    `);

    // Inicializa configuração de recibos padrão para tenants ativos se inexistente
    rawDb.exec(`
      INSERT OR IGNORE INTO receipt_settings (
        id, tenant_id, emitter_type, emitter_name, emitter_trade_name, emitter_document,
        emitter_board_name, emitter_registry_number, emitter_registry_state,
        emitter_street, emitter_number, emitter_neighborhood, emitter_city, emitter_state, emitter_zip_code,
        emitter_phone, emitter_email, receipt_prefix, next_sequence, is_configured
      )
      SELECT 
        'rec-set-' || id, id, 'pj', name, COALESCE(trade_name, name), COALESCE(cnpj_cpf, '12.345.678/0001-90'),
        'CRM', '123456', 'SP',
        'Av. Paulista', '1000, Conjunto 501', 'Bela Vista', 'São Paulo', 'SP', '01310-100',
        phone, email, 'REC-', 1, 1
      FROM tenants
      WHERE status = 'active';
    `);
  } catch (migErr) {
    console.warn('[Database] Aviso nas migrações dinâmicas:', migErr);
  }

  // Executa seed caso não existam categorias cadastradas
  try {
    const checkStmt = db.prepare("SELECT count(*) as total FROM categories");
    const result = checkStmt.get() as { total: number };
    if (!result || result.total === 0) {
      console.log('[Database] Executando Seed inicial de taxonomia e dados...');
      runSeed(rawDb);
      console.log('[Database] Seed concluído com sucesso.');
    }
  } catch (err) {
    console.error('[Database] Erro ao inicializar banco de dados:', err);
  }
}
