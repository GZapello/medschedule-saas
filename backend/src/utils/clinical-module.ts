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
  'ZemdaPersonal',
  'ZemdaEstetic'
];

export const isPrimaryClinicalModule = (module?: string | null): boolean =>
  !!module && PRIMARY_CLINICAL_MODULES.includes(module);

// Body maps complement a consultation; legacy Body assignments or 'general' must not lock it.
export function resolveProfessionalCanonicalModule(professionalId: string | null | undefined, tenantId: string | null | undefined): string | null {
  if (!professionalId || !tenantId) return null;

  try {
    const prof = db.prepare(`
      SELECT p.id, p.user_id, p.profession_id, p.profession_name, p.practice_areas, p.registration_type,
             p.zemda_odonto_enabled, p.zemda_fisio_enabled, p.zemda_nutri_enabled, p.zemda_to_enabled,
             p.zemda_fono_enabled, p.zemda_pp_enabled, p.zemda_psico_enabled, p.zemda_personal_enabled,
             p.zemda_med_enabled, p.zemda_estetic_enabled,
             pr.name as pr_name, pr.slug as pr_slug
      FROM professionals p
      LEFT JOIN professions pr ON pr.id = p.profession_id
      WHERE (p.id = ? OR p.user_id = ?) AND p.tenant_id = ?
      LIMIT 1
    `).get(professionalId, professionalId, tenantId) as any;

    if (!prof) return null;

    // 1. Resolução canônica pelo cadastro do profissional
    const canonical = resolveCanonicalProfession({
      id: prof.profession_id,
      name: prof.pr_name || prof.profession_name,
      slug: prof.pr_slug,
      registrationType: prof.registration_type
    });
    if (canonical.commercialModule && isPrimaryClinicalModule(canonical.commercialModule)) {
      return canonical.commercialModule;
    }

    // 2. Consulta complementar na tabela clinic_users se user_id estiver disponível
    if (prof.user_id) {
      const cu = db.prepare(`
        SELECT profession_id, profession_name, canonical_profession_name, commercial_module,
               zemda_odonto_enabled, zemda_fisio_enabled, zemda_nutri_enabled, zemda_to_enabled,
               zemda_fono_enabled, zemda_pp_enabled, zemda_psico_enabled, zemda_personal_enabled,
               zemda_med_enabled, zemda_estetic_enabled
        FROM clinic_users
        WHERE user_id = ? AND tenant_id = ?
        LIMIT 1
      `).get(prof.user_id, tenantId) as any;

      if (cu) {
        if (cu.commercial_module && isPrimaryClinicalModule(cu.commercial_module)) {
          return cu.commercial_module;
        }
        if (cu.profession_id || cu.profession_name || cu.canonical_profession_name) {
          const cuCanonical = resolveCanonicalProfession({
            id: cu.profession_id,
            name: cu.canonical_profession_name || cu.profession_name
          });
          if (cuCanonical.commercialModule && isPrimaryClinicalModule(cuCanonical.commercialModule)) {
            return cuCanonical.commercialModule;
          }
        }

        // Flags em clinic_users
        if (cu.zemda_odonto_enabled) return 'ZemdaOdonto';
        if (cu.zemda_fisio_enabled) return 'ZemdaFisio';
        if (cu.zemda_nutri_enabled) return 'ZemdaNutri';
        if (cu.zemda_to_enabled) return 'ZemdaTO';
        if (cu.zemda_fono_enabled) return 'ZemdaFono';
        if (cu.zemda_pp_enabled) return 'ZemdaPP';
        if (cu.zemda_psico_enabled) return 'ZemdaPsico';
        if (cu.zemda_personal_enabled) return 'ZemdaPersonal';
        if (cu.zemda_med_enabled) return 'ZemdaMed';
        if (cu.zemda_estetic_enabled) return 'ZemdaEstetic';
      }
    }

    // 3. Flags ativas na tabela professionals
    if (prof.zemda_odonto_enabled) return 'ZemdaOdonto';
    if (prof.zemda_fisio_enabled) return 'ZemdaFisio';
    if (prof.zemda_nutri_enabled) return 'ZemdaNutri';
    if (prof.zemda_to_enabled) return 'ZemdaTO';
    if (prof.zemda_fono_enabled) return 'ZemdaFono';
    if (prof.zemda_pp_enabled) return 'ZemdaPP';
    if (prof.zemda_psico_enabled) return 'ZemdaPsico';
    if (prof.zemda_personal_enabled) return 'ZemdaPersonal';
    if (prof.zemda_med_enabled) return 'ZemdaMed';
    if (prof.zemda_estetic_enabled) return 'ZemdaEstetic';

    if (canonical.clinicalWorkspace === 'general') {
      return 'general';
    }
  } catch (err) {
    console.error('[resolveProfessionalCanonicalModule] Erro ao resolver módulo:', err);
  }

  return null;
}

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

  // 1. Se já está gravado com módulo primário canônico definitivo, respeita-o
  if (isPrimaryClinicalModule(appointment.clinical_module)) {
    return appointment.clinical_module;
  }

  // 2. Se já existe evolução/prontuário salva neste atendimento, verifica o módulo
  if (appointment.id) {
    const record = db.prepare("SELECT module_type, clinical_evolution, module_data_json FROM records WHERE appointment_id=? AND tenant_id=? AND module_type IS NOT NULL AND module_type NOT IN ('ZemdaBody', 'Zemda360') ORDER BY created_at LIMIT 1")
      .get(appointment.id, effectiveTenantId) as any;
    if (record?.module_type && isPrimaryClinicalModule(record.module_type)) {
      return record.module_type;
    }
    // Se houver prontuário com evolução textual preenchida explicitamente em 'general', mantém 'general'
    if (record?.module_type === 'general' && (record.clinical_evolution || (record.module_data_json && record.module_data_json !== '{}'))) {
      return 'general';
    }
  }

  // 3. Resolução pelo profissional vinculado (canônico + flags + clinic_users)
  const profId = appointment.professional_id || maybeProfId;
  if (profId) {
    const profModule = resolveProfessionalCanonicalModule(profId, effectiveTenantId);
    if (profModule && isPrimaryClinicalModule(profModule)) {
      return profModule;
    }
    if (profModule === 'general') {
      return 'general';
    }
  }

  // 4. Resolução por profession_id do agendamento
  if (appointment.profession_id) {
    const canonical = resolveCanonicalProfession({ id: appointment.profession_id });
    if (canonical.commercialModule && isPrimaryClinicalModule(canonical.commercialModule)) {
      return canonical.commercialModule;
    }
  }

  // 5. Fallback para registros já previamente marcados como general, Zemda360 ou ZemdaBody
  if (appointment.clinical_module === 'general' || appointment.clinical_module === 'ZemdaBody' || appointment.clinical_module === 'Zemda360') {
    return 'general';
  }

  return null;
}
