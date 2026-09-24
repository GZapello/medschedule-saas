import { completeProfessionalProfile } from './professional-profile';
import { db } from '../config/database';
import { resolveProfessionModule, resolveCanonicalProfession } from './profession-module';

export const PRIMARY_CLINICAL_MODULES = [
  'ZemdaMed',
  'ZemdaFono',
  'ZemdaOdonto',
  'ZemdaTO',
  'ZemdaFisio',
  'ZemdaNutri',
  'ZemdaPsico',
  'ZemdaPP',
  'ZemdaPersonal'
];

export const isPrimaryClinicalModule = (module?: string | null): boolean =>
  !!module && PRIMARY_CLINICAL_MODULES.includes(module);

// Body maps complement a consultation; legacy Body assignments or 'general' must not lock it.
export function resolveClinicalModule(appointmentOrProf: any, tenantId: any, maybeProfId?: any): string | null {
  let appointment = appointmentOrProf || {};
  let effectiveTenantId = tenantId;

  if (maybeProfId && typeof tenantId === 'string') {
    appointment = { professional_id: maybeProfId };
    effectiveTenantId = tenantId;
  } else if (typeof appointmentOrProf === 'string') {
    appointment = { professional_id: appointmentOrProf };
    effectiveTenantId = tenantId;
  }

  if (isPrimaryClinicalModule(appointment.clinical_module)) return appointment.clinical_module;
  if (appointment.clinical_module === 'general') return 'general';

  const record = db.prepare("SELECT module_type FROM records WHERE appointment_id=? AND tenant_id=? AND module_type IS NOT NULL AND module_type != 'ZemdaBody' ORDER BY created_at LIMIT 1")
    .get(appointment.id, effectiveTenantId) as any;
  if (record?.module_type && (isPrimaryClinicalModule(record.module_type) || record.module_type === 'general')) {
    return record.module_type;
  }

  if (appointment.professional_id) {
    const prof = db.prepare(`SELECT p.user_id, p.profession_id, p.profession_name, p.practice_areas, p.registration_type, pr.name as pr_name, pr.slug as pr_slug FROM professionals p
      LEFT JOIN professions pr ON pr.id=p.profession_id WHERE p.id=? AND p.tenant_id=?`)
      .get(appointment.professional_id, effectiveTenantId) as any;
    
    if (prof) {
      const canonical = resolveCanonicalProfession({
        id: prof.profession_id,
        name: prof.pr_name || prof.profession_name,
        slug: prof.pr_slug,
        registrationType: prof.registration_type
      });
      if (canonical.commercialModule && isPrimaryClinicalModule(canonical.commercialModule)) {
        return canonical.commercialModule;
      }
      if (canonical.clinicalWorkspace === 'general') {
        return 'general';
      }
    }

    if (appointment.clinical_module === 'ZemdaBody') return 'general';
  }
  return appointment.clinical_module === 'ZemdaBody' ? 'general' : null;
}
