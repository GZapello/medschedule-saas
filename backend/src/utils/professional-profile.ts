import { db } from '../config/database';

// Registration and staff approval may store the profession outside the catalog.
// Resolve metadata only through the authenticated user's clinic membership.
export function completeProfessionalProfile(userId: string, tenantId: string | null | undefined, professional: any): any {
  if (!tenantId) return professional;
  const member = db.prepare(`
    SELECT u.tenant_id, u.name AS user_name, u.profession_name, u.practice_areas AS user_areas,
      cu.id AS membership_id, cu.status AS membership_status, cu.role AS membership_role,
      cu.profession_custom, cu.practice_areas AS member_areas
    FROM users u LEFT JOIN clinic_users cu ON cu.user_id=u.id AND cu.tenant_id=?
    WHERE u.id=?
  `).get(tenantId, userId) as any;
  if (!member || (member.membership_id ? member.membership_status !== 'active' : member.tenant_id !== tenantId)) return professional;

  let prof = professional;

  // Se o usuário possui vínculo ativo na clínica como professional ou clinic_admin, sincroniza status ativo
  if (member.membership_role === 'professional' || member.membership_role === 'clinic_admin') {
    let profRow = db.prepare('SELECT id, active, profession_id, practice_areas FROM professionals WHERE user_id = ? AND tenant_id = ? ORDER BY active DESC, id LIMIT 1').get(userId, tenantId) as any;

    if (profRow && profRow.active !== 1 && member.membership_status === 'active') {
      db.prepare('UPDATE professionals SET active = 1 WHERE id = ?').run(profRow.id);
      profRow.active = 1;
    }

    if (profRow) {
      prof = {
        ...prof,
        professional_id: profRow.id,
        professional_active: profRow.active,
        profession_id: prof?.profession_id || profRow.profession_id,
        practice_areas: prof?.practice_areas || profRow.practice_areas
      };
    }
  }

  const name = prof?.profession_name || member.profession_custom || member.profession_name;
  return {
    ...prof,
    profession_name: name,
    profession_slug: prof?.profession_slug || name?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-'),
    practice_areas: [prof?.practice_areas, member.profession_custom, member.member_areas, member.profession_name, member.user_areas].filter(Boolean).join(', ')
  };
}
