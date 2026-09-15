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

  transaction<T extends (...args: any[]) => any>(fn: T): T {
    return ((...args: any[]) => {
      rawDb.exec('BEGIN IMMEDIATE;');
      try {
        const result = fn(...args);
        rawDb.exec('COMMIT;');
        return result;
      } catch (error) {
        try {
          rawDb.exec('ROLLBACK;');
        } catch (_) {}
        throw error;
      }
    }) as T;
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

    // Controle Administrativo Global (Banimento e Bloqueio de Cadastros)
    addColIfMissing('tenants', 'registrations_blocked', 'INTEGER DEFAULT 0');
    addColIfMissing('tenants', 'banned_at', 'TEXT');
    addColIfMissing('tenants', 'banned_by', 'TEXT');
    addColIfMissing('tenants', 'banned_reason', 'TEXT');

    // Novas colunas para profissão estruturada e atendimentos/áreas de atuação livres
    addColIfMissing('clinic_users', 'profession_custom', 'TEXT');
    addColIfMissing('clinic_users', 'practice_areas', 'TEXT');
    addColIfMissing('professionals', 'practice_areas', 'TEXT');
    addColIfMissing('professionals', 'specialty_custom', 'TEXT');

    // Colunas de Mapa Corporal de Dor e Área de Atuação do Gestor
    addColIfMissing('physiotherapy_assessments', 'body_map_json', 'TEXT');
    addColIfMissing('physiotherapy_assessments', 'body_map_image', 'TEXT');
    addColIfMissing('users', 'profession_name', 'TEXT');
    addColIfMissing('users', 'practice_areas', 'TEXT');
    addColIfMissing('users', 'registration_type', 'TEXT');
    addColIfMissing('users', 'registration_number', 'TEXT');
    addColIfMissing('tenants', 'manager_profession', 'TEXT');
    addColIfMissing('tenants', 'manager_practice_areas', 'TEXT');

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

    // Coluna opcional de CID em exames a receber
    addColIfMissing('pending_exams', 'cid_code', 'TEXT');

    // Desativação e exclusão agendada em 30 dias (Item 3)
    addColIfMissing('users', 'deactivated_at', 'DATETIME');
    addColIfMissing('users', 'scheduled_deletion_at', 'DATETIME');
    addColIfMissing('clinic_users', 'deactivated_at', 'DATETIME');
    addColIfMissing('clinic_users', 'scheduled_deletion_at', 'DATETIME');

    // Convênio no cadastro do paciente (Item 4)
    addColIfMissing('patients', 'health_insurance_provider', 'TEXT');
    addColIfMissing('patients', 'health_insurance_card', 'TEXT');
    addColIfMissing('patients', 'health_insurance_plan', 'TEXT');

    // Liberação explícita do ZemdaFisio no profissional (Item 9)
    addColIfMissing('professionals', 'zemda_fisio_enabled', 'INTEGER DEFAULT 0');
    addColIfMissing('clinic_users', 'zemda_fisio_enabled', 'INTEGER DEFAULT 0');
    addColIfMissing('users', 'zemda_fisio_enabled', 'INTEGER DEFAULT 0');

    // Liberação explícita do ZemdaOdonto no profissional
    addColIfMissing('professionals', 'zemda_odonto_enabled', 'INTEGER DEFAULT 0');
    addColIfMissing('clinic_users', 'zemda_odonto_enabled', 'INTEGER DEFAULT 0');
    addColIfMissing('users', 'zemda_odonto_enabled', 'INTEGER DEFAULT 0');

    // Liberação explícita de ZemdaNutri, ZemdaTO e ZemdaFono no profissional e na equipe
    addColIfMissing('professionals', 'zemda_nutri_enabled', 'INTEGER DEFAULT 0');
    addColIfMissing('clinic_users', 'zemda_nutri_enabled', 'INTEGER DEFAULT 0');
    addColIfMissing('users', 'zemda_nutri_enabled', 'INTEGER DEFAULT 0');

    addColIfMissing('professionals', 'zemda_to_enabled', 'INTEGER DEFAULT 0');
    addColIfMissing('clinic_users', 'zemda_to_enabled', 'INTEGER DEFAULT 0');
    addColIfMissing('users', 'zemda_to_enabled', 'INTEGER DEFAULT 0');

    addColIfMissing('professionals', 'zemda_fono_enabled', 'INTEGER DEFAULT 0');
    addColIfMissing('clinic_users', 'zemda_fono_enabled', 'INTEGER DEFAULT 0');
    addColIfMissing('users', 'zemda_fono_enabled', 'INTEGER DEFAULT 0');

    // Suporte a snapshots de odontograma vinculados a prontuários
    addColIfMissing('odontograms', 'record_id', 'TEXT');

    // Padronização de datas nos agendamentos para conformidade ISO e precisão matemática de slots
    try {
      rawDb.exec(`
        UPDATE appointments SET start_time = REPLACE(start_time, ' ', 'T') WHERE start_time LIKE '% %';
        UPDATE appointments SET end_time = REPLACE(end_time, ' ', 'T') WHERE end_time LIKE '% %';
      `);
    } catch (e) {}

    // Criação da tabela de convites de funcionários por link seguro (Itens 14 a 20)
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS clinic_invites (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'professional',
        expires_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'used', 'expired', 'cancelled')),
        max_uses INTEGER NOT NULL DEFAULT 1,
        used_count INTEGER NOT NULL DEFAULT 0,
        used_at TEXT,
        used_by TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_clinic_invites_token ON clinic_invites (token);
      CREATE INDEX IF NOT EXISTS idx_clinic_invites_tenant ON clinic_invites (tenant_id, status);
    `);

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
    addColIfMissing('records', 'session_time', 'TEXT');
    addColIfMissing('records', 'procedure_name', 'TEXT');
    addColIfMissing('records', 'conducts', 'TEXT');
    addColIfMissing('records', 'clinical_data_json', 'TEXT');
    addColIfMissing('records', 'module_type', 'TEXT');
    addColIfMissing('records', 'module_data_json', 'TEXT');

    addColIfMissing('notifications', 'retry_count', 'INTEGER DEFAULT 0');
    addColIfMissing('notifications', 'last_error', 'TEXT');
    addColIfMissing('notifications', 'delivery_status', "TEXT DEFAULT 'pending'");
    addColIfMissing('notifications', 'idempotency_key', 'TEXT');

    // Novas colunas solicitadas para horários da clínica, CID em exames, sexo do profissional e convênios
    addColIfMissing('tenants', 'business_hours_json', 'TEXT');
    addColIfMissing('clinical_exam_requests', 'cid_code', 'TEXT');
    addColIfMissing('professionals', 'gender', "TEXT DEFAULT 'M'");
    addColIfMissing('clinic_insurances', 'plan_name', 'TEXT');
    addColIfMissing('clinic_insurances', 'card_number', 'TEXT');
    addColIfMissing('clinic_insurances', 'validity_date', 'TEXT');
    addColIfMissing('clinic_insurances', 'ans_code', 'TEXT');
    addColIfMissing('clinic_insurances', 'phone', 'TEXT');
    addColIfMissing('clinic_insurances', 'email', 'TEXT');

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

    // Lista abrangente de especialidades por profissão de saúde
    const allDetailedSpecialties = [
      // Fonoaudiologia
      { id: 'spec-fono-audiologia', prof_id: 'prof-fonoaudiologo', name: 'Audiologia Clínica', slug: 'audiologia-clinica', color: '#0ea5e9' },
      { id: 'spec-fono-disfagia', prof_id: 'prof-fonoaudiologo', name: 'Disfagia e Deglutição', slug: 'disfagia-degluticao', color: '#06b6d4' },
      { id: 'spec-fono-educacional', prof_id: 'prof-fonoaudiologo', name: 'Fonoaudiologia Educacional', slug: 'fonoaudiologia-educacional', color: '#14b8a6' },
      { id: 'spec-fono-hospitalar', prof_id: 'prof-fonoaudiologo', name: 'Fonoaudiologia Hospitalar', slug: 'fonoaudiologia-hospitalar', color: '#0284c7' },
      { id: 'spec-fono-linguagem', prof_id: 'prof-fonoaudiologo', name: 'Fonoaudiologia Infantil e Linguagem', slug: 'fono-linguagem', color: '#10b981' },
      { id: 'spec-fono-neurofuncional', prof_id: 'prof-fonoaudiologo', name: 'Fonoaudiologia Neurofuncional', slug: 'fono-neurofuncional', color: '#6366f1' },
      { id: 'spec-fono-motricidade', prof_id: 'prof-fonoaudiologo', name: 'Motricidade Orofacial', slug: 'motricidade-orofacial', color: '#8b5cf6' },
      { id: 'spec-fono-voz', prof_id: 'prof-fonoaudiologo', name: 'Voz e Comunicação Profissional', slug: 'fono-voz', color: '#a855f7' },
      // Psicologia
      { id: 'spec-psi-clinica', prof_id: 'prof-psicologo', name: 'Psicologia Clínica do Adulto', slug: 'psicologia-clinica-adulto', color: '#6366f1' },
      { id: 'spec-psi-infantil', prof_id: 'prof-psicologo', name: 'Psicologia Infantil / Ludoterapia', slug: 'psicologia-infantil', color: '#ec4899' },
      { id: 'spec-psi-tcc', prof_id: 'prof-psicologo', name: 'Terapia Cognitivo-Comportamental (TCC)', slug: 'tcc', color: '#0ea5e9' },
      { id: 'spec-psi-neuropsi', prof_id: 'prof-psicologo', name: 'Neuropsicologia Clínica', slug: 'neuropsicologia-clinica', color: '#8b5cf6' },
      { id: 'spec-psi-psicanalise', prof_id: 'prof-psicologo', name: 'Psicanálise', slug: 'psicanalise', color: '#3b82f6' },
      { id: 'spec-psi-casal', prof_id: 'prof-psicologo', name: 'Terapia Familiar e de Casal', slug: 'terapia-casal-familia', color: '#f43f5e' },
      { id: 'spec-psi-hospitalar', prof_id: 'prof-psicologo', name: 'Psicologia Hospitalar e da Saúde', slug: 'psicologia-hospitalar', color: '#10b981' },
      { id: 'spec-psi-avaliacao', prof_id: 'prof-psicologo', name: 'Avaliação Psicológica e Psicodiagnóstico', slug: 'avaliacao-psicologica', color: '#f59e0b' },
      { id: 'spec-psi-social', prof_id: 'prof-psicologo', name: 'Psicologia Social e Comunitária', slug: 'psicologia-social', color: '#64748b' },
      // 16 Especialidades Oficiais da Fisioterapia (Regulamentadas pelo COFFITO)
      { id: 'spec-fisio-acupuntura', prof_id: 'prof-fisioterapeuta', name: 'Fisioterapia em Acupuntura', slug: 'fisioterapia-acupuntura', color: '#0ea5e9' },
      { id: 'spec-fisio-respiratoria', prof_id: 'prof-fisioterapeuta', name: 'Fisioterapia Respiratória', slug: 'fisioterapia-respiratoria', color: '#06b6d4' },
      { id: 'spec-fisio-neuro', prof_id: 'prof-fisioterapeuta', name: 'Fisioterapia Neurofuncional', slug: 'fisioterapia-neurofuncional', color: '#6366f1' },
      { id: 'spec-fisio-osteopatia', prof_id: 'prof-fisioterapeuta', name: 'Fisioterapia em Osteopatia', slug: 'fisioterapia-osteopatia', color: '#d97706' },
      { id: 'spec-fisio-quiropraxia', prof_id: 'prof-fisioterapeuta', name: 'Fisioterapia em Quiropraxia', slug: 'fisioterapia-quiropraxia', color: '#059669' },
      { id: 'spec-fisio-ortopedia', prof_id: 'prof-fisioterapeuta', name: 'Fisioterapia Traumato-Ortopédica', slug: 'fisioterapia-traumato-ortopedica', color: '#10b981' },
      { id: 'spec-fisio-esportiva', prof_id: 'prof-fisioterapeuta', name: 'Fisioterapia Esportiva', slug: 'fisioterapia-esportiva', color: '#f97316' },
      { id: 'spec-fisio-trabalho', prof_id: 'prof-fisioterapeuta', name: 'Fisioterapia do Trabalho', slug: 'fisioterapia-trabalho', color: '#64748b' },
      { id: 'spec-fisio-dermato', prof_id: 'prof-fisioterapeuta', name: 'Fisioterapia Dermatofuncional', slug: 'fisioterapia-dermatofuncional', color: '#f43f5e' },
      { id: 'spec-fisio-mulher', prof_id: 'prof-fisioterapeuta', name: 'Fisioterapia em Saúde da Mulher', slug: 'fisioterapia-saude-mulher', color: '#ec4899' },
      { id: 'spec-fisio-oncologia', prof_id: 'prof-fisioterapeuta', name: 'Fisioterapia em Oncologia', slug: 'fisioterapia-oncologia', color: '#8b5cf6' },
      { id: 'spec-fisio-uti', prof_id: 'prof-fisioterapeuta', name: 'Fisioterapia em Terapia Intensiva', slug: 'fisioterapia-terapia-intensiva', color: '#ef4444' },
      { id: 'spec-fisio-aquatica', prof_id: 'prof-fisioterapeuta', name: 'Fisioterapia Aquática', slug: 'fisioterapia-aquatica', color: '#0284c7' },
      { id: 'spec-fisio-cardiovascular', prof_id: 'prof-fisioterapeuta', name: 'Fisioterapia Cardiovascular', slug: 'fisioterapia-cardiovascular', color: '#e11d48' },
      { id: 'spec-fisio-gerontologia', prof_id: 'prof-fisioterapeuta', name: 'Fisioterapia em Gerontologia', slug: 'fisioterapia-gerontologia', color: '#78716c' },
      { id: 'spec-fisio-reumatologia', prof_id: 'prof-fisioterapeuta', name: 'Fisioterapia em Reumatologia', slug: 'fisioterapia-reumatologia', color: '#f59e0b' },
      // Medicina
      { id: 'spec-med-geral', prof_id: 'prof-medico', name: 'Clínica Médica / Medicina Geral', slug: 'clinica-medica', color: '#3b82f6' },
      { id: 'spec-med-cardio', prof_id: 'prof-medico', name: 'Cardiologia', slug: 'cardiologia', color: '#ef4444' },
      { id: 'spec-med-dermato', prof_id: 'prof-medico', name: 'Dermatologia', slug: 'dermatologia', color: '#f43f5e' },
      { id: 'spec-med-pediatria', prof_id: 'prof-medico', name: 'Pediatria', slug: 'pediatria', color: '#ec4899' },
      { id: 'spec-med-ginecologia', prof_id: 'prof-medico', name: 'Ginecologia e Obstetrícia', slug: 'ginecologia-obstetricia', color: '#a855f7' },
      { id: 'spec-med-ortopedia', prof_id: 'prof-medico', name: 'Ortopedia e Traumatologia', slug: 'ortopedia-traumatologia', color: '#10b981' },
      { id: 'spec-med-neurologia', prof_id: 'prof-medico', name: 'Neurologia', slug: 'neurologia', color: '#6366f1' },
      { id: 'spec-med-endocrino', prof_id: 'prof-medico', name: 'Endocrinologia e Metabologia', slug: 'endocrinologia', color: '#f59e0b' },
      { id: 'spec-med-oftalmo', prof_id: 'prof-medico', name: 'Oftalmologia', slug: 'oftalmologia', color: '#0ea5e9' },
      { id: 'spec-med-otorrino', prof_id: 'prof-medico', name: 'Otorrinolaringologia', slug: 'otorrinolaringologia', color: '#14b8a6' },
      { id: 'spec-med-gastro', prof_id: 'prof-medico', name: 'Gastroenterologia', slug: 'gastroenterologia', color: '#eab308' },
      { id: 'spec-med-geriatria', prof_id: 'prof-medico', name: 'Geriatria', slug: 'geriatria', color: '#64748b' },
      { id: 'spec-med-urologia', prof_id: 'prof-medico', name: 'Urologia', slug: 'urologia', color: '#0284c7' },
      { id: 'spec-med-psiquiatria', prof_id: 'prof-medico', name: 'Psiquiatria Clínica', slug: 'psiquiatria-clinica', color: '#8b5cf6' },
      // Odontologia
      { id: 'spec-odonto-geral', prof_id: 'prof-dentista', name: 'Clínica Geral Odontológica', slug: 'odontologia-geral', color: '#3b82f6' },
      { id: 'spec-odonto-orto', prof_id: 'prof-dentista', name: 'Ortodontia e Ortopedia Facial', slug: 'ortodontia', color: '#0ea5e9' },
      { id: 'spec-odonto-pediatria', prof_id: 'prof-dentista', name: 'Odontopediatria', slug: 'odontopediatria', color: '#ec4899' },
      { id: 'spec-odonto-implante', prof_id: 'prof-dentista', name: 'Implantodontia', slug: 'implantodontia', color: '#10b981' },
      { id: 'spec-odonto-endo', prof_id: 'prof-dentista', name: 'Endodontia (Canal)', slug: 'endodontia', color: '#f59e0b' },
      { id: 'spec-odonto-perio', prof_id: 'prof-dentista', name: 'Periodontia', slug: 'periodontia', color: '#059669' },
      { id: 'spec-odonto-hof', prof_id: 'prof-dentista', name: 'Harmonização Orofacial (HOF)', slug: 'harmonizacao-orofacial', color: '#a855f7' },
      { id: 'spec-odonto-buco', prof_id: 'prof-dentista', name: 'Cirurgia e Traumatologia Bucomaxilofacial', slug: 'bucomaxilofacial', color: '#ef4444' },
      { id: 'spec-odonto-protese', prof_id: 'prof-dentista', name: 'Prótese Dentária', slug: 'protese-dentaria', color: '#64748b' },
      // Nutrição
      { id: 'spec-nutri-clinica', prof_id: 'prof-nutricionista', name: 'Nutrição Clínica e Funcional', slug: 'nutricao-clinica', color: '#84cc16' },
      { id: 'spec-nutri-esportiva', prof_id: 'prof-nutricionista', name: 'Nutrição Esportiva', slug: 'nutricao-esportiva', color: '#f97316' },
      { id: 'spec-nutri-pediatrica', prof_id: 'prof-nutricionista', name: 'Nutrição Materno-Infantil e Pediátrica', slug: 'nutricao-pediatrica', color: '#ec4899' },
      { id: 'spec-nutri-comportamental', prof_id: 'prof-nutricionista', name: 'Nutrição Comportamental e Transtornos', slug: 'nutricao-comportamental', color: '#6366f1' },
      { id: 'spec-nutri-emagrecimento', prof_id: 'prof-nutricionista', name: 'Emagrecimento e Doenças Crônicas', slug: 'nutricao-emagrecimento', color: '#10b981' },
      { id: 'spec-nutri-hospitalar', prof_id: 'prof-nutricionista', name: 'Nutrição Hospitalar e Enteral', slug: 'nutricao-hospitalar', color: '#06b6d4' },
      // Terapia Ocupacional
      { id: 'spec-to-integracao', prof_id: 'prof-terapeuta-ocupacional', name: 'Integração Sensorial de Ayres', slug: 'to-integracao-sensorial', color: '#f59e0b' },
      { id: 'spec-to-pediatria', prof_id: 'prof-terapeuta-ocupacional', name: 'Terapia Ocupacional Pediátrica e Escolar', slug: 'to-pediatrica', color: '#ec4899' },
      { id: 'spec-to-reab-fisica', prof_id: 'prof-terapeuta-ocupacional', name: 'Reabilitação Física e Membros Superiores', slug: 'to-reab-fisica', color: '#10b981' },
      { id: 'spec-to-neurofuncional', prof_id: 'prof-terapeuta-ocupacional', name: 'Reabilitação Cognitiva e Neurofuncional', slug: 'to-neurofuncional', color: '#6366f1' },
      { id: 'spec-to-saude-mental', prof_id: 'prof-terapeuta-ocupacional', name: 'Saúde Mental e Psiquiatria Ocupacional', slug: 'to-saude-mental', color: '#8b5cf6' },
      { id: 'spec-to-geronto', prof_id: 'prof-terapeuta-ocupacional', name: 'Gerontologia e Envelhecimento Ativo', slug: 'to-gerontologia', color: '#64748b' },
      // Enfermagem
      { id: 'spec-enf-geral', prof_id: 'prof-enfermeiro', name: 'Enfermagem Geral e Triagem', slug: 'enfermagem-geral', color: '#0ea5e9' },
      { id: 'spec-enf-estoma', prof_id: 'prof-enfermeiro', name: 'Enfermagem em Estomaterapia e Feridas', slug: 'enfermagem-estomaterapia', color: '#10b981' },
      { id: 'spec-enf-pediatrica', prof_id: 'prof-enfermeiro', name: 'Enfermagem Pediátrica e Neonatal', slug: 'enfermagem-pediatrica', color: '#ec4899' },
      { id: 'spec-enf-obstetrica', prof_id: 'prof-enfermeiro', name: 'Enfermagem Obstétrica e Ginecológica', slug: 'enfermagem-obstetrica', color: '#a855f7' },
      { id: 'spec-enf-familia', prof_id: 'prof-enfermeiro', name: 'Enfermagem em Saúde da Família', slug: 'enfermagem-saude-familia', color: '#14b8a6' },
      { id: 'spec-enf-estetica', prof_id: 'prof-enfermeiro', name: 'Enfermagem Estética', slug: 'enfermagem-estetica', color: '#f43f5e' },
      // Psiquiatria
      { id: 'spec-psiq-geral', prof_id: 'prof-psiquiatra', name: 'Psiquiatria Geral e Transtornos de Ansiedade', slug: 'psiquiatria-geral', color: '#8b5cf6' },
      { id: 'spec-psiq-infantil', prof_id: 'prof-psiquiatra', name: 'Psiquiatria da Infância e Adolescência', slug: 'psiquiatria-infantil', color: '#a855f7' },
      { id: 'spec-psiq-adicao', prof_id: 'prof-psiquiatra', name: 'Dependência Química e Adições', slug: 'psiquiatria-dependencia', color: '#ef4444' },
      { id: 'spec-psiq-idoso', prof_id: 'prof-psiquiatra', name: 'Psicogeriatria e Demências', slug: 'psicogeriatria', color: '#64748b' }
    ];

    const insertSpecStmt = rawDb.prepare(`
      INSERT OR IGNORE INTO specialties (id, profession_id, name, slug, color)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const s of allDetailedSpecialties) {
      insertSpecStmt.run(s.id, s.prof_id, s.name, s.slug, s.color);
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
      WHERE slug = 'clinica-viver-bem' AND status = 'active';
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

    // =========================================================================
    // NOVAS MIGRAÇÕES INCREMENTAIS: 8 MÓDULOS (Página Pública, Suporte, Exames,
    // Estoque, Orçamentos, Folha/Comissões, Escala)
    // =========================================================================
    
    // 1. Colunas em professionals para página pública e remuneração
    addColIfMissing('professionals', 'slug', 'TEXT');
    addColIfMissing('professionals', 'public_booking_enabled', 'INTEGER DEFAULT 1');
    addColIfMissing('professionals', 'remuneration_type', "TEXT DEFAULT 'commission'");
    addColIfMissing('professionals', 'commission_percentage', 'REAL DEFAULT 0');
    addColIfMissing('professionals', 'fixed_salary', 'REAL DEFAULT 0');
    addColIfMissing('professionals', 'payment_day', 'INTEGER DEFAULT 5');

    // Gera slugs únicos para profissionais existentes que estejam com slug nulo
    try {
      const profsWithoutSlug = rawDb.prepare("SELECT id, name FROM professionals WHERE slug IS NULL OR slug = ''").all() as { id: string; name: string }[];
      const updateSlugStmt = rawDb.prepare("UPDATE professionals SET slug = ? WHERE id = ?");
      for (const p of profsWithoutSlug) {
        const baseSlug = (p.name || 'profissional')
          .toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
        const finalSlug = `${baseSlug}-${p.id.slice(-4)}`;
        updateSlugStmt.run(finalSlug, p.id);
      }
    } catch (slugErr) {
      console.warn('[Migration] Aviso ao gerar slugs de profissionais:', slugErr);
    }

    // 2. Central de Chamados & Suporte
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'duvida',
        description TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
        attachments_json TEXT,
        app_version TEXT,
        platform TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'analyzing', 'in_progress', 'resolved', 'closed')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant ON support_tickets (tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets (user_id, status);

      CREATE TABLE IF NOT EXISTS support_ticket_messages (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        message TEXT NOT NULL,
        attachments_json TEXT,
        is_internal INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_ticket_messages ON support_ticket_messages (ticket_id, created_at);
    `);

    // 3. Exames a Receber
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS pending_exams (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        exam_name TEXT NOT NULL,
        request_date TEXT NOT NULL,
        expected_date TEXT,
        received_date TEXT,
        status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting', 'received', 'delayed', 'cancelled')),
        notes TEXT,
        cid_code TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
        FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_pending_exams_status ON pending_exams (tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_pending_exams_patient ON pending_exams (tenant_id, patient_id);
    `);

    // 4. Estoque de Insumos e Produtos & Movimentações
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS inventory_items (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT,
        product_type TEXT,
        brand TEXT,
        presentation TEXT DEFAULT 'unidade',
        volume_ml REAL,
        quantity REAL NOT NULL DEFAULT 0,
        unit TEXT NOT NULL DEFAULT 'un',
        batch_number TEXT,
        expiration_date TEXT,
        unit_cost REAL DEFAULT 0,
        supplier TEXT,
        min_stock REAL DEFAULT 5,
        notes TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_inventory_items_tenant ON inventory_items (tenant_id, active);

      CREATE TABLE IF NOT EXISTS inventory_movements (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        movement_type TEXT NOT NULL CHECK(movement_type IN ('in', 'out', 'adjustment')),
        quantity REAL NOT NULL,
        previous_quantity REAL NOT NULL,
        new_quantity REAL NOT NULL,
        reason TEXT,
        document_reference TEXT,
        user_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_inventory_movements ON inventory_movements (tenant_id, item_id, created_at);
    `);

    // 5. Orçamentos (Pacientes e Fornecedores)
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS budgets (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        budget_type TEXT NOT NULL CHECK(budget_type IN ('patient', 'supplier')),
        budget_number TEXT NOT NULL,
        patient_id TEXT,
        supplier_name TEXT,
        supplier_contact TEXT,
        discount REAL DEFAULT 0,
        total_amount REAL NOT NULL DEFAULT 0,
        validity_date TEXT,
        delivery_deadline TEXT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'sent', 'approved', 'rejected', 'expired')),
        notes TEXT,
        converted_to_inventory INTEGER DEFAULT 0,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_budgets_tenant_type ON budgets (tenant_id, budget_type, status);

      CREATE TABLE IF NOT EXISTS budget_items (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        budget_id TEXT NOT NULL,
        item_type TEXT DEFAULT 'service',
        reference_id TEXT,
        description TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 1,
        unit_price REAL NOT NULL DEFAULT 0,
        total_price REAL NOT NULL DEFAULT 0,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_budget_items ON budget_items (budget_id);
    `);

    // 6. Pagamentos, Comissões e Salários dos Profissionais
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS professional_payrolls (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        professional_id TEXT NOT NULL,
        period_month TEXT NOT NULL,
        remuneration_type TEXT NOT NULL DEFAULT 'commission',
        appointments_count INTEGER DEFAULT 0,
        produced_amount REAL DEFAULT 0,
        commission_percentage REAL DEFAULT 0,
        commission_amount REAL DEFAULT 0,
        fixed_salary REAL DEFAULT 0,
        adjustments REAL DEFAULT 0,
        adjustment_notes TEXT,
        total_payable REAL NOT NULL DEFAULT 0,
        due_date TEXT,
        paid_date TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'delayed')),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_payrolls_month ON professional_payrolls (tenant_id, period_month, status);
      CREATE INDEX IF NOT EXISTS idx_payrolls_prof ON professional_payrolls (tenant_id, professional_id);
    `);

    // 7. Prontuário Fisioterapêutico Modular (ZemdaFisio: Avaliações e Evoluções)
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS physiotherapy_assessments (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT NOT NULL,
        appointment_id TEXT,
        specialty_id TEXT,
        chief_complaint TEXT,
        hpi TEXT,
        past_medical_history TEXT,
        medical_diagnosis TEXT,
        physio_diagnosis TEXT,
        pain_score INTEGER DEFAULT 0,
        pain_location TEXT,
        pain_characteristics TEXT,
        inspection_palpation TEXT,
        range_of_motion TEXT,
        muscle_strength TEXT,
        posture_balance TEXT,
        gait_mobility TEXT,
        functional_limitations TEXT,
        specific_tests TEXT,
        short_term_goals TEXT,
        long_term_goals TEXT,
        treatment_plan TEXT,
        conducts_exercises TEXT,
        guidelines TEXT,
        is_sealed INTEGER NOT NULL DEFAULT 0,
        created_by TEXT,
        updated_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
        FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_physio_assess_patient ON physiotherapy_assessments (tenant_id, patient_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_physio_assess_prof ON physiotherapy_assessments (tenant_id, professional_id);

      CREATE TABLE IF NOT EXISTS physiotherapy_evolutions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT NOT NULL,
        appointment_id TEXT,
        specialty_id TEXT,
        session_date TEXT NOT NULL,
        session_time TEXT,
        patient_condition TEXT,
        procedures_performed TEXT,
        exercises_performed TEXT,
        techniques_used TEXT,
        clinical_evolution TEXT NOT NULL,
        treatment_response TEXT,
        complications TEXT,
        guidelines TEXT,
        next_session_plan TEXT,
        notes TEXT,
        is_sealed INTEGER NOT NULL DEFAULT 0,
        created_by TEXT,
        updated_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
        FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_physio_evol_patient ON physiotherapy_evolutions (tenant_id, patient_id, session_date);
      CREATE INDEX IF NOT EXISTS idx_physio_evol_prof ON physiotherapy_evolutions (tenant_id, professional_id);

      -- 8. Links Únicos e Seguros de Convite da Clínica (Itens 14 a 23)
      CREATE TABLE IF NOT EXISTS clinic_invites (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'professional',
        expires_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'used', 'expired', 'cancelled')),
        max_uses INTEGER NOT NULL DEFAULT 1,
        used_count INTEGER NOT NULL DEFAULT 0,
        used_at TEXT,
        used_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_invites_token ON clinic_invites (token);
      CREATE INDEX IF NOT EXISTS idx_clinic_invites_tenant_status ON clinic_invites (tenant_id, status);

      -- =========================================================================
      -- 9. MÓDULO CLÍNICO ZEMDAODONTO (ODONTOLOGIA)
      -- =========================================================================
      
      -- Odontograma Geral (Inicial, Atual e Históricos com todos os 32 dentes e faces)
      CREATE TABLE IF NOT EXISTS odontograms (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        appointment_id TEXT,
        type TEXT NOT NULL DEFAULT 'current',
        status_data_json TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_odontograms_patient ON odontograms (tenant_id, patient_id, type);

      -- Histórico detalhado por dente e face
      CREATE TABLE IF NOT EXISTS dental_tooth_records (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        appointment_id TEXT,
        tooth_number INTEGER NOT NULL,
        face TEXT DEFAULT 'whole',
        condition TEXT NOT NULL,
        previous_condition TEXT,
        procedure_name TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_tooth_records_patient ON dental_tooth_records (tenant_id, patient_id, tooth_number);

      -- Periodontia (PERIO)
      CREATE TABLE IF NOT EXISTS dental_periodontal_records (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        appointment_id TEXT,
        periodontogram_json TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_perio_patient ON dental_periodontal_records (tenant_id, patient_id, created_at);

      -- Endodontia (ENDO)
      CREATE TABLE IF NOT EXISTS dental_endodontic_records (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        appointment_id TEXT,
        tooth_number INTEGER NOT NULL,
        pulpar_diagnosis TEXT,
        periapical_diagnosis TEXT,
        canals_count INTEGER DEFAULT 1,
        working_length TEXT,
        instrumentation TEXT,
        irrigation TEXT,
        intracanal_medication TEXT,
        obturation TEXT,
        material TEXT,
        sessions_count INTEGER DEFAULT 1,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_endo_patient ON dental_endodontic_records (tenant_id, patient_id, tooth_number);

      -- Anamnese Odontológica
      CREATE TABLE IF NOT EXISTS dental_anamnesis (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL UNIQUE,
        professional_id TEXT,
        systemic_diseases_json TEXT,
        habits_json TEXT,
        allergies_json TEXT,
        current_medications TEXT,
        previous_surgeries TEXT,
        anesthesia_history TEXT,
        custom_fields_json TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_anamnesis_patient ON dental_anamnesis (tenant_id, patient_id);

      -- Plano de Tratamento e Orçamento Integrado
      CREATE TABLE IF NOT EXISTS dental_treatment_plans (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'planned',
        total_value REAL DEFAULT 0,
        discount_value REAL DEFAULT 0,
        final_value REAL DEFAULT 0,
        items_json TEXT NOT NULL,
        payment_terms TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_treatment_plans_patient ON dental_treatment_plans (tenant_id, patient_id);

      -- Laboratório de Prótese
      CREATE TABLE IF NOT EXISTS dental_prosthetics_lab (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        lab_name TEXT NOT NULL,
        work_type TEXT NOT NULL,
        tooth_number TEXT,
        shade_color TEXT,
        material TEXT,
        sent_date TEXT,
        expected_date TEXT,
        received_date TEXT,
        cost_value REAL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'requested',
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_prosthetics_patient ON dental_prosthetics_lab (tenant_id, patient_id);

      -- Ortodontia
      CREATE TABLE IF NOT EXISTS dental_orthodontics (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        appliance_type TEXT,
        installation_date TEXT,
        forecast_months INTEGER,
        monthly_evolutions_json TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_orthodontics_patient ON dental_orthodontics (tenant_id, patient_id);

      -- Harmonização Orofacial (HOF)
      CREATE TABLE IF NOT EXISTS dental_hof (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        procedure_name TEXT NOT NULL,
        facial_region TEXT,
        product_brand TEXT,
        lot_number TEXT,
        units_quantity TEXT,
        expiry_date TEXT,
        application_points_json TEXT,
        before_after_images_json TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_hof_patient ON dental_hof (tenant_id, patient_id);

      -- =========================================================================
      -- 10. MÓDULO CLÍNICO ZEMDANUTRI (NUTRIÇÃO)
      -- =========================================================================
      CREATE TABLE IF NOT EXISTS nutrition_assessments (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        appointment_id TEXT,
        record_id TEXT,
        assessment_date TEXT NOT NULL,
        weight REAL,
        height REAL,
        bmi REAL,
        waist_circ REAL,
        abdominal_circ REAL,
        hip_circ REAL,
        arm_circ REAL,
        calf_circ REAL,
        neck_circ REAL,
        thigh_circ REAL,
        custom_measures_json TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_nutri_assess_patient ON nutrition_assessments (tenant_id, patient_id, assessment_date);

      CREATE TABLE IF NOT EXISTS nutrition_bioimpedance (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        appointment_id TEXT,
        record_id TEXT,
        assessment_date TEXT NOT NULL,
        weight REAL,
        muscle_mass REAL,
        fat_mass REAL,
        fat_percentage REAL,
        visceral_fat REAL,
        body_water REAL,
        bone_mass REAL,
        bmr REAL,
        bioimpedance_data_json TEXT,
        attachment_url TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_nutri_bio_patient ON nutrition_bioimpedance (tenant_id, patient_id);

      CREATE TABLE IF NOT EXISTS nutrition_calculations (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        appointment_id TEXT,
        calculation_date TEXT NOT NULL,
        bmi REAL,
        eer REAL,
        bmr REAL,
        protein_grams REAL,
        carbs_grams REAL,
        fats_grams REAL,
        water_ml REAL,
        is_manual_override INTEGER DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS nutrition_recalls (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        appointment_id TEXT,
        recall_type TEXT NOT NULL DEFAULT '24h',
        meals_json TEXT NOT NULL,
        water_intake_ml REAL,
        observations TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_nutri_recalls_patient ON nutrition_recalls (tenant_id, patient_id);

      CREATE TABLE IF NOT EXISTS nutrition_food_database (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        portion_size REAL DEFAULT 100,
        portion_unit TEXT DEFAULT 'g',
        energy_kcal REAL DEFAULT 0,
        protein_g REAL DEFAULT 0,
        carbs_g REAL DEFAULT 0,
        fat_g REAL DEFAULT 0,
        fiber_g REAL DEFAULT 0,
        sodium_mg REAL DEFAULT 0,
        is_clinic_custom INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS nutrition_meal_plans (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        appointment_id TEXT,
        title TEXT NOT NULL,
        meals_json TEXT NOT NULL,
        total_calories REAL,
        total_protein REAL,
        total_carbs REAL,
        total_fat REAL,
        guidelines TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_nutri_meal_plans_patient ON nutrition_meal_plans (tenant_id, patient_id);

      CREATE TABLE IF NOT EXISTS nutrition_goals (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        target_value TEXT,
        current_value TEXT,
        deadline TEXT,
        status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'in_progress', 'partially_reached', 'reached', 'suspended')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_nutri_goals_patient ON nutrition_goals (tenant_id, patient_id);

      CREATE TABLE IF NOT EXISTS nutrition_anamnesis (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL UNIQUE,
        professional_id TEXT,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );

      -- =========================================================================
      -- 11. MÓDULO CLÍNICO ZEMDATO (TERAPIA OCUPACIONAL)
      -- =========================================================================
      CREATE TABLE IF NOT EXISTS to_occupational_profiles (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        appointment_id TEXT,
        routine TEXT,
        roles TEXT,
        interests TEXT,
        habits TEXT,
        meaningful_activities TEXT,
        family_context TEXT,
        school_context TEXT,
        work_context TEXT,
        community_context TEXT,
        physical_env TEXT,
        social_env TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_to_profile_patient ON to_occupational_profiles (tenant_id, patient_id);

      CREATE TABLE IF NOT EXISTS to_avd_assessments (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        appointment_id TEXT,
        assessment_type TEXT NOT NULL DEFAULT 'avd',
        scores_json TEXT NOT NULL,
        overall_level TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_to_avd_patient ON to_avd_assessments (tenant_id, patient_id);

      CREATE TABLE IF NOT EXISTS to_sensory_assessments (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        appointment_id TEXT,
        tactile TEXT,
        auditory TEXT,
        visual TEXT,
        vestibular TEXT,
        proprioceptive TEXT,
        gustatory TEXT,
        olfactory TEXT,
        interoceptive TEXT,
        notes_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_to_sensory_patient ON to_sensory_assessments (tenant_id, patient_id);

      CREATE TABLE IF NOT EXISTS to_motor_cognitive_assessments (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        appointment_id TEXT,
        motor_json TEXT,
        cognitive_json TEXT,
        child_dev_json TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS to_treatment_plans (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        goals_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'in_progress', 'partially_reached', 'reached', 'reassess')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_to_plans_patient ON to_treatment_plans (tenant_id, patient_id);

      CREATE TABLE IF NOT EXISTS to_assistive_tech (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        device_name TEXT NOT NULL,
        adaptation_type TEXT,
        orthosis_type TEXT,
        resource_details TEXT,
        photo_url TEXT,
        indication TEXT,
        training_notes TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_to_assistive_patient ON to_assistive_tech (tenant_id, patient_id);

      -- =========================================================================
      -- 12. MÓDULO CLÍNICO ZEMDAFONO (FONOAUDIOLOGIA)
      -- =========================================================================
      CREATE TABLE IF NOT EXISTS fono_anamnesis (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL UNIQUE,
        professional_id TEXT,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS fono_language_assessments (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        appointment_id TEXT,
        comprehension TEXT,
        expression TEXT,
        vocabulary TEXT,
        semantics TEXT,
        morphosyntax TEXT,
        pragmatics TEXT,
        narrative TEXT,
        functional_comm TEXT,
        aac_details TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_fono_lang_patient ON fono_language_assessments (tenant_id, patient_id);

      CREATE TABLE IF NOT EXISTS fono_speech_phonology (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        appointment_id TEXT,
        phonemes_json TEXT NOT NULL,
        phonological_processes TEXT,
        intelligibility TEXT,
        articulation_notes TEXT,
        spontaneous_speech TEXT,
        repetition TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_fono_speech_patient ON fono_speech_phonology (tenant_id, patient_id);

      CREATE TABLE IF NOT EXISTS fono_orofacial_motricity (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        appointment_id TEXT,
        structures_json TEXT,
        mobility TEXT,
        force TEXT,
        tonus TEXT,
        breathing TEXT,
        chewing TEXT,
        swallowing TEXT,
        speech_motor TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_fono_mo_patient ON fono_orofacial_motricity (tenant_id, patient_id);

      CREATE TABLE IF NOT EXISTS fono_voice_assessments (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        appointment_id TEXT,
        vocal_quality TEXT,
        pitch TEXT,
        loudness TEXT,
        resonance TEXT,
        vocal_attack TEXT,
        pneumophono_coordination TEXT,
        audio_url TEXT,
        symptoms TEXT,
        habits TEXT,
        professional_use TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_fono_voice_patient ON fono_voice_assessments (tenant_id, patient_id);

      CREATE TABLE IF NOT EXISTS fono_fluency_assessments (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        appointment_id TEXT,
        disfluency_types TEXT,
        frequency TEXT,
        tension TEXT,
        blocks TEXT,
        prolongations TEXT,
        repetitions TEXT,
        associated_behaviors TEXT,
        impact TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS fono_dysphagia_assessments (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        appointment_id TEXT,
        food_consistency TEXT,
        utensil TEXT,
        posture TEXT,
        lip_closure TEXT,
        chewing TEXT,
        oral_transit TEXT,
        clinical_signs TEXT,
        cough_choke TEXT,
        wet_voice TEXT,
        feeding_time TEXT,
        recommendations TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS fono_audiology_records (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        exam_type TEXT NOT NULL,
        exam_date TEXT NOT NULL,
        results_json TEXT,
        attachment_url TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS fono_learning_assessments (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        appointment_id TEXT,
        reading TEXT,
        writing TEXT,
        phonological_awareness TEXT,
        memory TEXT,
        attention TEXT,
        comprehension TEXT,
        text_production TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS fono_treatment_plans (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        professional_id TEXT,
        short_term_goals_json TEXT,
        medium_term_goals_json TEXT,
        long_term_goals_json TEXT,
        status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'in_progress', 'partially_reached', 'reached', 'reassess')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_fono_plans_patient ON fono_treatment_plans (tenant_id, patient_id);
    `);
  } catch (migErr) {
    console.warn('[Database] Aviso nas migrações dinâmicas:', migErr);
  }

  // SQLite requires a table rebuild to extend an existing CHECK constraint.
  const tenantSql = rawDb.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tenants'").get() as { sql: string };
  if (!tenantSql.sql.includes("'banned'")) {
    const indexes = rawDb.prepare("SELECT sql FROM sqlite_master WHERE tbl_name = 'tenants' AND type IN ('index', 'trigger') AND sql IS NOT NULL").all() as { sql: string }[];
    const replacement = tenantSql.sql.replace(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["`\[]?tenants["`\]]?/i, 'CREATE TABLE tenants_control_migration')
      .replace(/CHECK\s*\(\s*status\s+IN\s*\(([^)]+)\)\s*\)/i, "CHECK(status IN ($1, 'banned'))");
    rawDb.exec('PRAGMA foreign_keys = OFF');
    try {
      db.transaction(() => {
        rawDb.exec(replacement);
        rawDb.exec('INSERT INTO tenants_control_migration SELECT * FROM tenants');
        rawDb.exec('DROP TABLE tenants');
        rawDb.exec('ALTER TABLE tenants_control_migration RENAME TO tenants');
        for (const index of indexes) rawDb.exec(index.sql);
        if (rawDb.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Integridade inválida na migração administrativa');
      })();
    } finally { rawDb.exec('PRAGMA foreign_keys = ON'); }
  }
  // Administrative controls must be available before accepting requests.
  if (!rawDb.prepare('PRAGMA table_info(tenants)').all().some((c: any) => c.name === 'session_version')) {
    rawDb.exec('ALTER TABLE tenants ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0');
  }
  if (!rawDb.prepare('PRAGMA table_info(tenants)').all().some((c: any) => c.name === 'pre_ban_status')) {
    rawDb.exec('ALTER TABLE tenants ADD COLUMN pre_ban_status TEXT');
  }
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS global_clinic_audit (
      id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL, clinic_name TEXT NOT NULL,
      admin_id TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL,
      reauthenticated INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS clinic_deletion_jobs (
      clinic_id TEXT PRIMARY KEY, files_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

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
