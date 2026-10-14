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
