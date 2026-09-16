import { db } from '../config/database';

export const isPrimaryClinicalModule = (module?: string | null): boolean =>
  !!module && module !== 'ZemdaBody';

// Body maps complement a consultation; legacy Body assignments must not lock it.
export function resolveClinicalModule(appointment: any, tenantId: any): string | null {
  if (isPrimaryClinicalModule(appointment.clinical_module)) return appointment.clinical_module;
  const record = db.prepare("SELECT module_type FROM records WHERE appointment_id=? AND tenant_id=? AND module_type IS NOT NULL AND module_type != 'ZemdaBody' ORDER BY created_at LIMIT 1")
    .get(appointment.id, tenantId) as any;
  if (record?.module_type) return record.module_type;
  if (appointment.professional_id) {
    const prof = db.prepare(`SELECT p.practice_areas, pr.name, pr.slug, pr.id FROM professionals p
      LEFT JOIN professions pr ON pr.id=p.profession_id WHERE p.id=? AND p.tenant_id=?`)
      .get(appointment.professional_id, tenantId) as any;
    const text = [prof?.id, prof?.name, prof?.slug, prof?.practice_areas].filter(Boolean).join(' ').toLowerCase();
    if (text.includes('fono') || text.includes('crfa')) return 'ZemdaFono';
    if (text.includes('nutri') || text.includes('crn') || text.includes('diet')) return 'ZemdaNutri';
    if (text.includes('ocupacional') || text.includes('terapia-ocupacional')) return 'ZemdaTO';
    if (text.includes('odonto') || text.includes('dentis') || text.includes('cro')) return 'ZemdaOdonto';
    if (text.includes('fisio') || text.includes('crefito') || text.includes('physio')) return 'ZemdaFisio';
    if (appointment.clinical_module === 'ZemdaBody') return 'general';
  }
  return appointment.clinical_module === 'ZemdaBody' ? 'general' : null;
}
