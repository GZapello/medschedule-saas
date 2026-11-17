import { db } from '../config/database';
import {
  resolveCanonicalProfession,
  isGenericFallbackProfessionId,
  isGenericFallbackProfessionName,
  hasClinicalProfessionSignal
} from './profession-module';

// Registration and staff approval may store the profession outside the catalog.
// Resolve metadata only through the authenticated user's clinic membership.
export function completeProfessionalProfile(userId: string, tenantId: string | null | undefined, professional: any): any {
  if (!tenantId) return professional;
  const member = db.prepare(`
    SELECT u.tenant_id, u.name AS user_name,
      CASE WHEN u.tenant_id = ? THEN u.profession_id END AS user_profession_id,
      CASE WHEN u.tenant_id = ? THEN u.profession_name END AS profession_name,
      CASE WHEN u.tenant_id = ? THEN u.practice_areas END AS user_areas,
      CASE WHEN u.tenant_id = ? THEN u.zemda_personal_enabled END AS user_personal_enabled,
      cu.id AS membership_id, cu.status AS membership_status, cu.role AS membership_role,
      cu.profession_id AS member_profession_id, cu.profession_name AS member_profession_name,
      cu.profession_custom, cu.practice_areas AS member_areas,
      cu.zemda_personal_enabled AS member_personal_enabled,
      t.establishment_profile
    FROM users u
    LEFT JOIN clinic_users cu ON cu.user_id=u.id AND cu.tenant_id=?
    LEFT JOIN tenants t ON t.id = ?
    WHERE u.id=?
  `).get(tenantId, tenantId, tenantId, tenantId, tenantId, tenantId, userId) as any;
  if (!member || (member.membership_id ? member.membership_status !== 'active' : member.tenant_id !== tenantId)) return professional;

  let prof = professional;
  let profRow: any = null;

  // Se o usuário possui vínculo ativo na clínica como professional ou clinic_admin, sincroniza status ativo
  if (member.membership_role === 'professional' || member.membership_role === 'clinic_admin') {
    profRow = db.prepare(`
      SELECT id, active, profession_id, profession_name, specialty_custom, practice_areas, bio,
             zemda_personal_enabled, zemda_fisio_enabled, zemda_odonto_enabled, zemda_nutri_enabled,
             zemda_to_enabled, zemda_fono_enabled, zemda_pp_enabled, zemda_psico_enabled,
             zemda_med_enabled, zemda_estetic_enabled,
             profession_change_used, profession_changed_at
      FROM professionals
      WHERE user_id = ? AND tenant_id = ?
      ORDER BY active DESC, id LIMIT 1
    `).get(userId, tenantId) as any;

    if (profRow && profRow.active !== 1 && member.membership_status === 'active') {
      db.prepare('UPDATE professionals SET active = 1 WHERE id = ?').run(profRow.id);
      profRow.active = 1;
    }

    if (profRow) {
      prof = {
        ...prof,
        professional_id: profRow.id,
        professional_active: profRow.active,
        profession_id: prof?.profession_id || profRow.profession_id || member.member_profession_id || member.user_profession_id,
        profession_name: (!isGenericFallbackProfessionName(prof?.profession_name) ? prof?.profession_name : null) ||
          (!isGenericFallbackProfessionName(profRow.profession_name) ? profRow.profession_name : null) ||
          prof?.profession_name ||
          profRow.profession_name,
        practice_areas: prof?.practice_areas || profRow.practice_areas,
        zemda_personal_enabled: prof?.zemda_personal_enabled || profRow.zemda_personal_enabled || 0,
        profession_change_used: profRow.profession_change_used ?? 0,
        profession_changed_at: profRow.profession_changed_at || null
      };
    }
  }

  const bestId =
    (!isGenericFallbackProfessionId(prof?.profession_id) ? prof?.profession_id : null) ||
    (!isGenericFallbackProfessionId(profRow?.profession_id) ? profRow?.profession_id : null) ||
    (!isGenericFallbackProfessionId(member.member_profession_id) ? member.member_profession_id : null) ||
    (!isGenericFallbackProfessionId(member.user_profession_id) ? member.user_profession_id : null) ||
    prof?.profession_id ||
    profRow?.profession_id ||
    member.member_profession_id ||
    member.user_profession_id ||
    null;

  const nonGenericName =
    (!isGenericFallbackProfessionName(prof?.profession_name) ? prof?.profession_name : null) ||
    (!isGenericFallbackProfessionName(profRow?.profession_name) ? profRow?.profession_name : null) ||
    (!isGenericFallbackProfessionName(member.profession_custom) ? member.profession_custom : null) ||
    (!isGenericFallbackProfessionName(member.member_profession_name) ? member.member_profession_name : null) ||
    (!isGenericFallbackProfessionName(member.profession_name) ? member.profession_name : null) ||
    (!isGenericFallbackProfessionName(profRow?.specialty_custom) ? profRow?.specialty_custom : null);

  const combinedAreas = [
    prof?.practice_areas,
    profRow?.practice_areas,
    profRow?.specialty_custom,
    profRow?.bio,
    member.member_profession_name,
    member.profession_custom,
    member.member_areas,
    member.profession_name,
    member.user_areas
  ].filter(Boolean).join(', ');

  let finalId = bestId;
  let finalName = nonGenericName || prof?.profession_name || member.member_profession_name || member.profession_custom || member.profession_name;
  let finalPersonalEnabled = prof?.zemda_personal_enabled || member.member_personal_enabled || member.user_personal_enabled || 0;

  if (isGenericFallbackProfessionId(finalId) || isGenericFallbackProfessionName(finalName)) {
    const res = resolveCanonicalProfession({
      id: finalId,
      name: nonGenericName || finalName,
      slug: prof?.profession_slug,
      registrationType: prof?.registration_type,
      practiceAreas: combinedAreas,
      specialtyName: prof?.specialty_name || profRow?.specialty_custom,
      customProfession: member.profession_custom
    });

    if (res.commercialModule === 'ZemdaPersonal') {
      finalId = res.canonicalId;
      finalName = nonGenericName || res.canonicalName;
      finalPersonalEnabled = 1;
    } else if (
      isGenericFallbackProfessionId(finalId) &&
      !hasClinicalProfessionSignal(`${finalName || ''} ${combinedAreas}`)
    ) {
      const hasClinicalFlags = Boolean(
        profRow?.zemda_fisio_enabled || profRow?.zemda_odonto_enabled || profRow?.zemda_nutri_enabled ||
        profRow?.zemda_to_enabled || profRow?.zemda_fono_enabled || profRow?.zemda_pp_enabled ||
        profRow?.zemda_psico_enabled || profRow?.zemda_med_enabled || profRow?.zemda_estetic_enabled
      );
      const hasStudioClassLink = Boolean(
        !hasClinicalFlags &&
        member.establishment_profile === 'studio' &&
        profRow?.id &&
        (
          db.prepare("SELECT 1 FROM services WHERE tenant_id = ? AND professional_id = ? AND active = 1 AND (COALESCE(service_kind, 'individual') = 'group' OR clinical_module = 'ZemdaPersonal') LIMIT 1").get(tenantId, profRow.id) ||
          db.prepare('SELECT 1 FROM class_schedules WHERE tenant_id = ? AND professional_id = ? AND active = 1 LIMIT 1').get(tenantId, profRow.id)
        )
      );
      if (!hasClinicalFlags && (finalPersonalEnabled === 1 || hasStudioClassLink)) {
        finalId = 'prof-instrutor';
        finalName = nonGenericName || 'Instrutor';
        finalPersonalEnabled = 1;
      }
    }
  }

  return {
    ...prof,
    profession_id: finalId,
    profession_name: finalName,
    zemda_personal_enabled: finalPersonalEnabled,
    profession_slug: (!isGenericFallbackProfessionId(finalId) && finalId === 'prof-instrutor')
      ? 'instrutor'
      : (prof?.profession_slug || finalName?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')),
    practice_areas: combinedAreas
  };
}
