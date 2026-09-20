import { completeProfessionalProfile } from './professional-profile';
import { db } from '../config/database';
import { resolveProfessionModule } from './profession-module';

export const PRIMARY_CLINICAL_MODULES = [
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
export function resolveClinicalModule(appointment: any, tenantId: any): string | null {
  if (isPrimaryClinicalModule(appointment.clinical_module)) return appointment.clinical_module;
  const record = db.prepare("SELECT module_type FROM records WHERE appointment_id=? AND tenant_id=? AND module_type IS NOT NULL AND module_type != 'ZemdaBody' AND module_type != 'general' ORDER BY created_at LIMIT 1")
    .get(appointment.id, tenantId) as any;
  if (record?.module_type && isPrimaryClinicalModule(record.module_type)) return record.module_type;
  if (appointment.professional_id) {
    const prof = db.prepare(`SELECT p.user_id, p.practice_areas, pr.name, pr.slug, pr.id FROM professionals p
      LEFT JOIN professions pr ON pr.id=p.profession_id WHERE p.id=? AND p.tenant_id=?`)
      .get(appointment.professional_id, tenantId) as any;
    
    // Resolve via função central prioritária
    const resolved = resolveProfessionModule({ id: prof?.id, name: prof?.name, slug: prof?.slug }).module;
    if (resolved) return resolved;

    if (appointment.clinical_module === 'ZemdaBody') return 'general';
  }
  return appointment.clinical_module === 'ZemdaBody' ? 'general' : null;
}
