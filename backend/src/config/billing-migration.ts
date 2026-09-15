import type { DatabaseSync } from 'node:sqlite';

// Additive migration: legacy subscriptions remain unmanaged until the clinic opts in.
export function migrateBilling(db: DatabaseSync): void {
  const add = (table: string, name: string, definition: string) => {
    if (!(db.prepare(`PRAGMA table_info(${table})`).all() as any[]).some(c => c.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };
  const sql = (db.prepare("SELECT sql FROM sqlite_master WHERE name='subscriptions'").get() as any).sql as string;
  if (!sql.includes('PENDING_PAYMENT')) {
    db.exec('PRAGMA foreign_keys=OFF');
    try {
      db.exec('BEGIN IMMEDIATE');
    db.exec(sql.replace(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["`]?subscriptions["`]?/i, 'CREATE TABLE subscriptions_billing_migration')
        .replace(/tenant_id TEXT NOT NULL UNIQUE/i, 'tenant_id TEXT NOT NULL')
        .replace(/CHECK\s*\(\s*status\s+IN\s*\(([^)]+)\)\s*\)/i, "CHECK(status IN ($1, 'PENDING_PAYMENT', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELED'))"));
      const indexes = db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name='subscriptions' AND type IN ('index','trigger') AND sql IS NOT NULL").all() as any[];
      db.exec('INSERT INTO subscriptions_billing_migration SELECT * FROM subscriptions');
      db.exec('DROP TABLE subscriptions');
      db.exec('ALTER TABLE subscriptions_billing_migration RENAME TO subscriptions');
      for (const row of indexes) db.exec(row.sql);
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('BILLING_MIGRATION_INTEGRITY');
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    finally { db.exec('PRAGMA foreign_keys=ON'); }
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    add('plans','code','TEXT'); add('plans','monthly_price','REAL'); add('plans','max_users','INTEGER');
    add('plans','active','INTEGER NOT NULL DEFAULT 1'); add('plans','updated_at','TEXT');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS plans_code_unique ON plans(code)');
    for (const [code,name,price,max] of [['SOLO','Zemda Solo',59.90,1],['TEAM','Zemda Equipe',119.90,5],['CLINIC','Zemda Clínica',359.90,30]]) {
      db.prepare(`INSERT INTO plans(id,code,name,slug,price_monthly,monthly_price,max_users,max_professionals,max_patients,max_rooms,active,updated_at)
        VALUES (?,?,?,?,?,?,?,?,1000000,1000000,1,datetime('now')) ON CONFLICT(code) DO NOTHING`).run(`zemda-${code}`,code,name,`zemda-${String(code).toLowerCase()}`,price,price,max,max);
    }
    add('tenants','billing_required','INTEGER NOT NULL DEFAULT 0');
    add('tenants','billing_name','TEXT');
    add('tenants','billing_address_json','TEXT');
    for (const [name,def] of Object.entries({clinic_id:'TEXT',asaas_customer_id:'TEXT',asaas_checkout_id:'TEXT',asaas_subscription_id:'TEXT',
      billing_cycle:"TEXT NOT NULL DEFAULT 'MONTHLY'", next_due_date:'TEXT',grace_period_until:'TEXT',updated_at:'TEXT',
      gateway_environment:'TEXT',managed:'INTEGER NOT NULL DEFAULT 0',is_current:'INTEGER NOT NULL DEFAULT 1',checkout_url:'TEXT',external_reference:'TEXT',
      pending_plan_id:'TEXT',pending_plan_effective_on:'TEXT',plan_change_state:'TEXT',cancelled_at:'TEXT',cancelled_by:'TEXT',cancel_reason:'TEXT'})) add('subscriptions',name,def);
    db.exec(`UPDATE subscriptions SET clinic_id=tenant_id WHERE clinic_id IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_current ON subscriptions(clinic_id) WHERE is_current=1;
      CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_gateway_unique ON subscriptions(asaas_subscription_id) WHERE asaas_subscription_id IS NOT NULL;
      CREATE TABLE IF NOT EXISTS billing_customers (
        id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        environment TEXT NOT NULL, asaas_customer_id TEXT, state TEXT NOT NULL, external_reference TEXT NOT NULL,
        UNIQUE(clinic_id,environment));
      CREATE TABLE IF NOT EXISTS billing_checkouts (
        id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
        environment TEXT NOT NULL, external_reference TEXT NOT NULL UNIQUE, asaas_checkout_id TEXT UNIQUE,
        plan_id TEXT NOT NULL REFERENCES plans(id), state TEXT NOT NULL DEFAULT 'REQUESTED', url TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at TEXT);
      CREATE UNIQUE INDEX IF NOT EXISTS billing_one_checkout ON billing_checkouts(clinic_id) WHERE state IN ('REQUESTED','OPEN','UNKNOWN');
      CREATE TABLE IF NOT EXISTS subscription_payments (
        id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
        asaas_payment_id TEXT NOT NULL UNIQUE, asaas_event_id TEXT, amount REAL NOT NULL,
        contract_amount REAL NOT NULL,plan_id TEXT NOT NULL REFERENCES plans(id),
        billing_type TEXT, status TEXT NOT NULL, due_date TEXT NOT NULL, confirmed_at TEXT,received_at TEXT,
        invoice_url TEXT, event_time TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS asaas_webhook_events (
        id TEXT PRIMARY KEY, asaas_event_id TEXT NOT NULL UNIQUE, clinic_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL, payload TEXT NOT NULL, received_at TEXT NOT NULL DEFAULT (datetime('now')),
        processed_at TEXT, processing_status TEXT NOT NULL DEFAULT 'PENDING', last_error TEXT,
        attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS subscription_audit (
        id TEXT PRIMARY KEY,clinic_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,user_id TEXT,
        action TEXT NOT NULL,previous_status TEXT,next_status TEXT,details_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS billing_operations (
        clinic_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,token TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS billing_integration_status (
        environment TEXT PRIMARY KEY,connected INTEGER NOT NULL,last_test_at TEXT NOT NULL,error TEXT);
      CREATE VIEW IF NOT EXISTS billing_active_users AS
        SELECT cu.tenant_id AS clinic_id,u.id AS user_id FROM clinic_users cu JOIN users u ON u.id=cu.user_id
          WHERE u.status='active' AND cu.status='active' AND u.role!='superadmin'
        UNION
        SELECT u.tenant_id,u.id FROM users u WHERE u.status='active' AND u.role!='superadmin' AND u.tenant_id IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM clinic_users cu WHERE cu.tenant_id=u.tenant_id AND cu.user_id=u.id);
      CREATE VIEW IF NOT EXISTS billing_user_limits AS
        SELECT s.clinic_id,CASE WHEN s.status='ACTIVE' OR (s.status='PAST_DUE' AND s.current_period_end!='') OR (s.status='CANCELED' AND s.current_period_end>date('now')) THEN
          MIN(p.max_users,COALESCE(pp.max_users,p.max_users)) ELSE 0 END AS max_users
        FROM subscriptions s JOIN plans p ON p.id=s.plan_id LEFT JOIN plans pp ON pp.id=s.pending_plan_id
        WHERE s.managed=1 AND s.is_current=1;
    `);
    // SQLite serializes writes. The guard covers every insert / activation path,
    // including concurrent requests and future controllers, not just visible buttons.
    for (const table of ['users','clinic_users']) for (const action of ['INSERT','UPDATE']) {
      const operation=action==='UPDATE' ? `UPDATE OF status,tenant_id,role${table==='clinic_users'?',user_id':''}` : action;
      db.exec(`CREATE TRIGGER IF NOT EXISTS billing_limit_${table}_${action} AFTER ${operation} ON ${table}
        WHEN EXISTS(SELECT 1 FROM billing_user_limits l WHERE
          l.clinic_id IN (SELECT clinic_id FROM billing_active_users WHERE user_id=${table==='users'?'NEW.id':'NEW.user_id'})
          AND (SELECT COUNT(*) FROM billing_active_users a WHERE a.clinic_id=l.clinic_id)>l.max_users)
        BEGIN SELECT RAISE(ABORT,'PLAN_USER_LIMIT_REACHED'); END;`);
    }
    db.exec('COMMIT');
  } catch(e) { db.exec('ROLLBACK'); throw e; }
}
