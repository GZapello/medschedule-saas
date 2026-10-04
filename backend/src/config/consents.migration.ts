import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'crypto';

/** Shared across every profession; issued documents reuse patient_consents. */
export function migrateConsents(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS consent_templates (
      id TEXT PRIMARY KEY, tenant_id TEXT REFERENCES tenants(id), module TEXT NOT NULL DEFAULT 'general',
      service_id TEXT REFERENCES services(id), procedure_name TEXT, required INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1, current_version INTEGER NOT NULL DEFAULT 1,
      created_by TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS consent_template_versions (
      id TEXT PRIMARY KEY, template_id TEXT NOT NULL REFERENCES consent_templates(id),
      version INTEGER NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, content_hash TEXT NOT NULL,
      created_by TEXT, created_at TEXT NOT NULL, UNIQUE(template_id, version)
    );
    CREATE TABLE IF NOT EXISTS consent_settings (
      tenant_id TEXT PRIMARY KEY REFERENCES tenants(id), auth_level TEXT NOT NULL DEFAULT 'recommended'
      CHECK(auth_level IN ('basic','recommended','reinforced')), link_hours INTEGER NOT NULL DEFAULT 168
      CHECK(link_hours BETWEEN 1 AND 720)
    );
    CREATE TABLE IF NOT EXISTS consent_access_tokens (
      id TEXT PRIMARY KEY, consent_id TEXT NOT NULL REFERENCES patient_consents(id), token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL, revoked_at TEXT, used_at TEXT, created_at TEXT NOT NULL,
      otp_hash TEXT, otp_salt TEXT, otp_expires_at TEXT, otp_verified_at TEXT, otp_attempts INTEGER NOT NULL DEFAULT 0,
      otp_sent_at TEXT, otp_channel TEXT
    );
    CREATE TABLE IF NOT EXISTS consent_signatures (
      id TEXT PRIMARY KEY, consent_id TEXT NOT NULL UNIQUE REFERENCES patient_consents(id),
      verification_code TEXT NOT NULL UNIQUE, evidence_json TEXT NOT NULL, evidence_hash TEXT NOT NULL,
      signature_data_url TEXT NOT NULL, photo_data_url TEXT, signed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS consent_audit_logs (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, consent_id TEXT REFERENCES patient_consents(id),
      action TEXT NOT NULL, actor_id TEXT, ip_address TEXT, user_agent TEXT, details_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS consent_invalidations (
      id TEXT PRIMARY KEY, consent_id TEXT NOT NULL UNIQUE REFERENCES patient_consents(id),
      reason TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_consent_templates_tenant ON consent_templates(tenant_id, active);
    CREATE INDEX IF NOT EXISTS idx_consent_tokens_document ON consent_access_tokens(consent_id);
    CREATE INDEX IF NOT EXISTS idx_consent_audit_document ON consent_audit_logs(tenant_id, consent_id, created_at);
  `);
  const columns = new Set((db.prepare('PRAGMA table_info(patient_consents)').all() as any[]).map(c => c.name));
  if(!(db.prepare('PRAGMA table_info(consent_settings)').all() as any[]).some(c=>c.name==='photo_requested')) db.exec("ALTER TABLE consent_settings ADD COLUMN photo_requested INTEGER NOT NULL DEFAULT 0; UPDATE consent_settings SET photo_requested=1 WHERE auth_level='reinforced'");
  if(!(db.prepare('PRAGMA table_info(consent_templates)').all() as any[]).some(c=>c.name==='profession_id')) db.exec('ALTER TABLE consent_templates ADD COLUMN profession_id TEXT');
  for (const [name, type] of Object.entries({
    template_id: 'TEXT REFERENCES consent_templates(id)', template_version_id: 'TEXT REFERENCES consent_template_versions(id)',
    document_hash: 'TEXT', required: 'INTEGER NOT NULL DEFAULT 0', auth_level: 'TEXT',
    signer_json: 'TEXT', patient_snapshot_json: 'TEXT', clinic_snapshot_json: 'TEXT', professional_snapshot_json: 'TEXT',
    sent_at: 'TEXT', expires_at: 'TEXT'
  })) if (!columns.has(name)) db.exec(`ALTER TABLE patient_consents ADD COLUMN ${name} ${type}`);
  // Version rows are append-only, even before a first signature.
  ensureConsentTriggers(db);
  const modules = ['general','ZemdaFono','ZemdaTO','ZemdaNutri','ZemdaPsico','ZemdaPP','ZemdaPersonal','ZemdaFisio','ZemdaOdonto','Zemda360','ZemdaEstetic','ZemdaMed','ZemdaBody'];
  for (const module of modules) {
    const id = `consent-standard-${module}`;
    const title = `Consentimento para atendimento — ${module === 'general' ? 'Multidisciplinar' : module}`;
    const content = `CONSENTIMENTO PARA ATENDIMENTO\n\nÁrea: ${module === 'general' ? 'Multidisciplinar' : module}.\n\nDeclaro que recebi informações do profissional sobre a finalidade do atendimento, as atividades propostas, os benefícios esperados, os riscos e limitações pertinentes ao meu caso e as alternativas disponíveis.\n\nTive oportunidade de fazer perguntas e solicitar esclarecimentos. Estou ciente de que posso comunicar minha decisão de não prosseguir com o atendimento e discutir as consequências e alternativas com o profissional.\n\nAutorizo o registro das informações necessárias ao atendimento no prontuário, com acesso restrito à equipe autorizada.\n\nEste modelo deve ser adaptado pela clínica ao atendimento e ao procedimento concreto antes de ser enviado. O profissional deve apresentar e esclarecer as informações específicas do caso.`;
    const hash = createHash('sha256').update(JSON.stringify({title, content})).digest('hex');
    db.prepare('INSERT OR IGNORE INTO consent_templates(id,module,created_at) VALUES(?,?,?)').run(id,module,new Date().toISOString());
    db.prepare('INSERT OR IGNORE INTO consent_template_versions(id,template_id,version,title,content,content_hash,created_at) VALUES(?,?,1,?,?,?,?)').run(`${id}-v1`,id,title,content,hash,new Date().toISOString());
  }
}

export function ensureConsentTriggers(db: DatabaseSync): void {
  for (const table of ['consent_template_versions', 'consent_signatures', 'consent_audit_logs', 'consent_invalidations']) {
    for (const operation of ['UPDATE', 'DELETE']) {
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS immutable_${table}_${operation.toLowerCase()}
        BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT, 'CONSENT_IMMUTABLE'); END;
      `);
    }
  }
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS consent_document_frozen_update BEFORE UPDATE ON patient_consents
    WHEN OLD.template_version_id IS NOT NULL AND (
      EXISTS(SELECT 1 FROM consent_signatures WHERE consent_id=OLD.id)
      OR NEW.template_id IS NOT OLD.template_id OR NEW.template_version_id IS NOT OLD.template_version_id
      OR NEW.content_text IS NOT OLD.content_text OR NEW.title IS NOT OLD.title OR NEW.version IS NOT OLD.version
      OR NEW.document_hash IS NOT OLD.document_hash OR NEW.tenant_id IS NOT OLD.tenant_id
      OR NEW.patient_id IS NOT OLD.patient_id OR NEW.professional_id IS NOT OLD.professional_id
      OR NEW.signer_json IS NOT OLD.signer_json OR NEW.auth_level IS NOT OLD.auth_level
      OR NEW.patient_snapshot_json IS NOT OLD.patient_snapshot_json OR NEW.clinic_snapshot_json IS NOT OLD.clinic_snapshot_json
      OR NEW.professional_snapshot_json IS NOT OLD.professional_snapshot_json OR NEW.required IS NOT OLD.required
    ) BEGIN SELECT RAISE(ABORT, 'CONSENT_IMMUTABLE'); END;
    CREATE TRIGGER IF NOT EXISTS consent_document_frozen_delete BEFORE DELETE ON patient_consents
    WHEN OLD.template_version_id IS NOT NULL
    BEGIN SELECT RAISE(ABORT, 'CONSENT_IMMUTABLE'); END;
  `);
}
