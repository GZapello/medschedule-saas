// Pure helpers: this module must never import the database singleton.
export function clinicBookingSlug(value: string): string {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'clinica';
}
export function validClinicBookingSlug(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}
export function validClinicBookingSequence(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** Receives a database explicitly; supports both raw SQLite and SafeDatabase. */
export function ensureClinicBookingIdentity(database: any, tenantId: string): void {
  database.exec('SAVEPOINT clinic_booking_identity');
  try {
    // Acquire the SQLite write lock before selecting the next sequence.
    database.prepare('UPDATE tenants SET public_booking_sequence = public_booking_sequence WHERE id = ?').run(tenantId);
    const tenant = database.prepare('SELECT id, name, trade_name, public_booking_slug, public_booking_sequence FROM tenants WHERE id = ?').get(tenantId);
    if (tenant) {
      const valid = validClinicBookingSlug(tenant.public_booking_slug) && validClinicBookingSequence(tenant.public_booking_sequence);
      const duplicate = valid && database.prepare('SELECT id FROM tenants WHERE public_booking_slug = ? AND public_booking_sequence = ? AND id != ?').get(tenant.public_booking_slug, tenant.public_booking_sequence, tenantId);
      if (!valid || duplicate) {
        const slug = validClinicBookingSlug(tenant.public_booking_slug) ? tenant.public_booking_slug : clinicBookingSlug(tenant.trade_name || tenant.name);
        const rows = database.prepare('SELECT public_booking_sequence FROM tenants WHERE public_booking_slug = ? AND id != ?').all(slug, tenantId);
        const maximum = rows.reduce((max: number, row: any) => validClinicBookingSequence(row.public_booking_sequence) ? Math.max(max, row.public_booking_sequence) : max, 0);
        if (!Number.isSafeInteger(maximum + 1)) throw new Error('BOOKING_SEQUENCE_EXHAUSTED');
        database.prepare('UPDATE tenants SET public_booking_slug = ?, public_booking_sequence = ? WHERE id = ?').run(slug, maximum + 1, tenantId);
      }
    }
    database.exec('RELEASE clinic_booking_identity');
  } catch (error) {
    database.exec('ROLLBACK TO clinic_booking_identity');
    database.exec('RELEASE clinic_booking_identity');
    throw error;
  }
}
