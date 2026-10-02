import { db } from '../config/database';

/**
 * Converte um nome/título em um slug limpo para URLs públicas:
 * - minúsculas
 * - sem acentos (NFD)
 * - remoção de prefixos de tratamento comuns (Dr., Dra., etc.)
 * - caracteres especiais substituídos por hífen
 * - sem hifens duplicados ou nas extremidades
 */
export function slugify(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^(?:dr|dra|doutor|doutora|fgo|fga|ft|nutri|psi)\b[\s.-]*/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'profissional';
}

/**
 * Gera um slug único para um profissional dentro de uma clínica específica (tenantId),
 * evitando links duplicados caso dois profissionais tenham o mesmo nome.
 * Exemplo: 'ana-souza', 'ana-souza-2', etc.
 */
export function generateProfessionalSlug(name: string, tenantId: string, currentProfessionalId?: string): string {
  const baseSlug = slugify(name);
  let candidate = baseSlug;
  let counter = 1;

  while (true) {
    const query = currentProfessionalId
      ? 'SELECT id FROM professionals WHERE tenant_id = ? AND slug = ? AND id != ?'
      : 'SELECT id FROM professionals WHERE tenant_id = ? AND slug = ?';
    const params = currentProfessionalId
      ? [tenantId, candidate, currentProfessionalId]
      : [tenantId, candidate];

    const existing = db.prepare(query).get(...params) as { id: string } | undefined;

    if (!existing) {
      return candidate;
    }

    counter++;
    candidate = `${baseSlug}-${counter}`;
  }
}

/** Clinic booking identity is independent of the tenant's existing global slug. */
export function clinicBookingSlug(name: string): string {
  return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'clinica';
}

export function ensureClinicBookingIdentity(database: any, tenantId: string): void {
  const tenant = database.prepare('SELECT id, name, trade_name, public_booking_slug, public_booking_sequence FROM tenants WHERE id = ?').get(tenantId);
  if (!tenant || (tenant.public_booking_slug && tenant.public_booking_sequence)) return;
  const slug = clinicBookingSlug(tenant.trade_name || tenant.name);
  const row = database.prepare('SELECT MAX(public_booking_sequence) as sequence FROM tenants WHERE public_booking_slug = ?').get(slug);
  database.prepare('UPDATE tenants SET public_booking_slug = ?, public_booking_sequence = ? WHERE id = ?').run(slug, Number(row?.sequence || 0) + 1, tenantId);
}
