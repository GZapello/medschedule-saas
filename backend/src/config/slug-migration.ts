import { slugify, ensureClinicBookingIdentity } from '../utils/slug';

export function migrateProfessionalSlugs(db: any): void {
  try {
    const profs = db.prepare(`
      SELECT id, tenant_id, name, slug 
      FROM professionals 
      ORDER BY created_at ASC, id ASC
    `).all() as Array<{ id: string; tenant_id: string; name: string; slug: string | null }>;

    const updateStmt = db.prepare('UPDATE professionals SET slug = ? WHERE id = ?');

    // Mapeamento por tenant para garantir slugs únicos sequenciais
    const tenantSlugs = new Map<string, Set<string>>();

    for (const p of profs) {
      if (!tenantSlugs.has(p.tenant_id)) tenantSlugs.set(p.tenant_id, new Set());
      if (p.slug) tenantSlugs.get(p.tenant_id)!.add(p.slug);
    }
    for (const p of profs) {
      if (p.slug) continue;
      if (!p.tenant_id || !p.name) continue;

      if (!tenantSlugs.has(p.tenant_id)) {
        tenantSlugs.set(p.tenant_id, new Set());
      }
      const existingInTenant = tenantSlugs.get(p.tenant_id)!;

      const base = slugify(p.name);
      let candidate = base;
      let counter = 1;

      while (existingInTenant.has(candidate)) {
        counter++;
        candidate = `${base}-${counter}`;
      }

      existingInTenant.add(candidate);

      if (p.slug !== candidate) {
        updateStmt.run(candidate, p.id);
      }
    }
  } catch (err) {
    console.error('[migrateProfessionalSlugs] Erro na migração de slugs:', err);
  }
}

export function migrateClinicBooking(database: any): void {
  const columns = database.prepare('PRAGMA table_info(tenants)').all().map((c: any) => c.name);
  for (const [name, definition] of [
    ['public_booking_enabled', 'INTEGER NOT NULL DEFAULT 0'],
    ['public_booking_slug', 'TEXT'],
    ['public_booking_sequence', 'INTEGER']
  ]) if (!columns.includes(name)) database.exec(`ALTER TABLE tenants ADD COLUMN ${name} ${definition}`);
  for (const tenant of database.prepare('SELECT id FROM tenants ORDER BY created_at, id').all()) ensureClinicBookingIdentity(database, tenant.id);
  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_booking_identity ON tenants(public_booking_slug, public_booking_sequence)');
}
