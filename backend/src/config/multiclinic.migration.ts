import { DatabaseSync } from 'node:sqlite';
import { SHARED_CLINICAL_CATALOG } from '../services/shared-clinical-catalog';

/** Preserve professional IDs, every column, indexes, triggers and incoming FKs. */
export function migrateMulticlinic(db: DatabaseSync): void {
  for (const [table, column] of [['professionals','user_id'], ['dental_anamnesis','patient_id'], ['nutrition_anamnesis','patient_id'], ['fono_anamnesis','patient_id']]) {
    const definition = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table) as any;
    const unique = new RegExp(column + '\\s+TEXT\\s+(?:NOT NULL\\s+)?UNIQUE', 'i');
    if (!definition || !unique.test(definition.sql)) continue;
    const dependents = db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL").all(table) as any[];
    const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map(c => `"${c.name}"`).join(',');
    db.exec('PRAGMA foreign_keys=OFF');
    try {
      db.exec('BEGIN IMMEDIATE');
      db.exec(definition.sql.replace(new RegExp('CREATE TABLE\\s+(?:IF NOT EXISTS\\s+)?["`]?'+table+'["`]?', 'i'), `CREATE TABLE ${table}_multiclinic`).replace(unique, (match: string) => match.replace(/\s+UNIQUE/i, '')));
      db.exec(`INSERT INTO ${table}_multiclinic (${columns}) SELECT ${columns} FROM ${table}`);
      db.exec(`DROP TABLE ${table}; ALTER TABLE ${table}_multiclinic RENAME TO ${table};`);
      for (const item of dependents) db.exec(item.sql);
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_clinic_identity ON ${table}(tenant_id,${column}) WHERE ${column} IS NOT NULL`);
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('MULTICLINIC_FOREIGN_KEY_CHECK');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    finally { db.exec('PRAGMA foreign_keys=ON'); }
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_professional_clinic_user ON professionals(tenant_id,user_id) WHERE user_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS clinic_data_shares (
      id TEXT PRIMARY KEY, source_tenant_id TEXT NOT NULL REFERENCES tenants(id), target_tenant_id TEXT NOT NULL REFERENCES tenants(id),
      authorized_by_user_id TEXT NOT NULL REFERENCES users(id), scope_json TEXT NOT NULL CHECK(json_valid(scope_json)),
      consent_version TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')), revoked_at TEXT, revoked_by_user_id TEXT REFERENCES users(id),
      CHECK(source_tenant_id<>target_tenant_id)
    );
    CREATE TABLE IF NOT EXISTS shared_patient_links (
      share_id TEXT NOT NULL REFERENCES clinic_data_shares(id), patient_id TEXT NOT NULL REFERENCES patients(id),
      PRIMARY KEY(share_id,patient_id)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_patient ON shared_patient_links(patient_id,share_id);
    CREATE TABLE IF NOT EXISTS clinic_patient_contexts (
      tenant_id TEXT NOT NULL REFERENCES tenants(id), patient_id TEXT NOT NULL REFERENCES patients(id),
      source_tenant_id TEXT NOT NULL REFERENCES tenants(id), identity_json TEXT NOT NULL CHECK(json_valid(identity_json)),
      recorded_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY(tenant_id,patient_id)
    );
    CREATE TABLE IF NOT EXISTS user_clinic_preferences (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

  `);
  // An encounter keeps a minimum identity snapshot tied to the SAME patient ID.
  // This is not a second patient or a copy of the source clinical history.
  for (const table of new Set(['records','appointments',...SHARED_CLINICAL_CATALOG.map(entry=>entry.table)])) {
    db.exec(`CREATE TRIGGER IF NOT EXISTS retain_shared_identity_${table} AFTER INSERT ON ${table}
      WHEN EXISTS(SELECT 1 FROM patients p JOIN shared_patient_links l ON l.patient_id=p.id
        JOIN clinic_data_shares s ON s.id=l.share_id WHERE p.id=NEW.patient_id AND p.tenant_id<>NEW.tenant_id
        AND s.source_tenant_id=p.tenant_id AND s.target_tenant_id=NEW.tenant_id AND s.status='ACTIVE')
      BEGIN
        INSERT INTO clinic_patient_contexts(tenant_id,patient_id,source_tenant_id,identity_json)
        SELECT NEW.tenant_id,p.id,p.tenant_id,json_object('id',p.id,'full_name',p.full_name,'birth_date',p.birth_date,
          'gender',p.gender,'anthropometric_sex',p.anthropometric_sex,'is_child',p.is_child)
        FROM patients p WHERE p.id=NEW.patient_id
        ON CONFLICT(tenant_id,patient_id) DO UPDATE SET identity_json=excluded.identity_json,recorded_at=datetime('now');
      END;`);
  }
  // Backfill cannot add a billable identity: legacy users are already counted by billing_active_users.
  // Preserve the admission trigger atomically so grandfathered clinics above their current cap can boot.
  const guard=db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='billing_limit_clinic_users_INSERT'").get() as any;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('DROP TRIGGER IF EXISTS billing_limit_clinic_users_INSERT');
    db.exec(`    INSERT INTO clinic_users(id,tenant_id,user_id,role,status,is_manager)
      SELECT 'legacy-' || u.id,u.tenant_id,u.id,u.role,
        CASE WHEN u.status IN ('pending','active','inactive','blocked','rejected') THEN u.status ELSE 'inactive' END,
        CASE WHEN u.role='clinic_admin' THEN 1 ELSE 0 END
      FROM users u JOIN tenants t ON t.id=u.tenant_id
      WHERE u.role!='superadmin' AND NOT EXISTS(SELECT 1 FROM clinic_users cu WHERE cu.user_id=u.id AND cu.tenant_id=u.tenant_id);`);
    if(guard)db.exec(guard.sql);
    db.exec('COMMIT');
  } catch(error) { db.exec('ROLLBACK'); throw error; }

}
