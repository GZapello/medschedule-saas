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
        SELECT profession_id, profession_name,
               zemda_odonto_enabled, zemda_fisio_enabled, zemda_nutri_enabled, zemda_to_enabled,
               zemda_fono_enabled, zemda_pp_enabled, zemda_psico_enabled, zemda_personal_enabled,
               zemda_med_enabled, zemda_estetic_enabled
        FROM clinic_users
        WHERE user_id = ? AND tenant_id = ?
        LIMIT 1
      `).get(prof.user_id, tenantId) as any;

      if (cu) {
        if (cu.profession_id || cu.profession_name) {
          const cuCanonical = resolveCanonicalProfession({
            id: cu.profession_id,
            name: cu.profession_name
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

export interface AvailableClinicalModule {
  code: string;
  label: string;
}

export const CLINICAL_MODULE_DISPLAY_NAMES: Record<string, string> = {
  ZemdaMed: 'ZemdaMed (Medicina)',
  ZemdaOdonto: 'ZemdaOdonto (Odontologia)',
  ZemdaEstetic: 'ZemdaEstetic (Estética)',
  ZemdaFisio: 'ZemdaFisio (Fisioterapia)',
  ZemdaNutri: 'ZemdaNutri (Nutrição)',
  ZemdaPsico: 'ZemdaPsico (Psicologia)',
  ZemdaFono: 'ZemdaFono (Fonoaudiologia)',
  ZemdaTO: 'ZemdaTO (Terapia Ocupacional)',
  ZemdaPP: 'ZemdaPP (Psicopedagogia)',
  ZemdaPersonal: 'ZemdaPersonal (Personal Trainer)',
  general: 'Geral'
};

/**
 * Retorna todos os módulos clínicos aos quais um profissional tem acesso legítimo
 */
export function getAvailableModulesForProfessional(
  professionalId: string | null | undefined,
  tenantId: string | null | undefined
): AvailableClinicalModule[] {
  if (!professionalId) return [];

  try {
    let effectiveTenantId = tenantId;
    if (!effectiveTenantId) {
      const row = db.prepare('SELECT tenant_id FROM professionals WHERE id = ? OR user_id = ? LIMIT 1').get(professionalId, professionalId) as any;
      if (row?.tenant_id) effectiveTenantId = row.tenant_id;
    }

    const prof = db.prepare(`
      SELECT p.id, p.tenant_id, p.user_id, p.profession_id, p.profession_name, p.practice_areas, p.registration_type,
             p.specialty_custom,
             p.zemda_odonto_enabled, p.zemda_fisio_enabled, p.zemda_nutri_enabled, p.zemda_to_enabled,
             p.zemda_fono_enabled, p.zemda_pp_enabled, p.zemda_psico_enabled, p.zemda_personal_enabled,
             p.zemda_med_enabled, p.zemda_estetic_enabled,
             pr.name as pr_name, pr.slug as pr_slug
      FROM professionals p
      LEFT JOIN professions pr ON pr.id = p.profession_id
      WHERE p.id = ? OR (p.user_id = ? AND (p.tenant_id = ? OR ? IS NULL))
      LIMIT 1
    `).get(professionalId, professionalId, effectiveTenantId, effectiveTenantId) as any;

    if (!prof) return [];
    if (!effectiveTenantId) effectiveTenantId = prof.tenant_id;

    const moduleSet = new Set<string>();

    // 1. Módulo canônico da profissão principal
    const canonical = resolveCanonicalProfession({
      id: prof.profession_id,
      name: prof.pr_name || prof.profession_name,
      slug: prof.pr_slug,
      registrationType: prof.registration_type
    });

    if (canonical.commercialModule && isPrimaryClinicalModule(canonical.commercialModule)) {
      moduleSet.add(canonical.commercialModule);
    }

    // 2. Flags explícitas no cadastro do profissional
    if (prof.zemda_odonto_enabled) moduleSet.add('ZemdaOdonto');
    if (prof.zemda_fisio_enabled) moduleSet.add('ZemdaFisio');
    if (prof.zemda_nutri_enabled) moduleSet.add('ZemdaNutri');
    if (prof.zemda_to_enabled) moduleSet.add('ZemdaTO');
    if (prof.zemda_fono_enabled) moduleSet.add('ZemdaFono');
    if (prof.zemda_pp_enabled) moduleSet.add('ZemdaPP');
    if (prof.zemda_psico_enabled) moduleSet.add('ZemdaPsico');
    if (prof.zemda_personal_enabled) moduleSet.add('ZemdaPersonal');
    if (prof.zemda_med_enabled) moduleSet.add('ZemdaMed');
    if (prof.zemda_estetic_enabled) moduleSet.add('ZemdaEstetic');

    // 3. Checagem em clinic_users e users se houver user_id
    if (prof.user_id) {
      const cu = db.prepare(`
        SELECT profession_id, profession_name, permissions_json,
               zemda_odonto_enabled, zemda_fisio_enabled, zemda_nutri_enabled, zemda_to_enabled,
               zemda_fono_enabled, zemda_pp_enabled, zemda_psico_enabled, zemda_personal_enabled,
               zemda_med_enabled, zemda_estetic_enabled
        FROM clinic_users
        WHERE user_id = ? AND (tenant_id = ? OR ? IS NULL)
        LIMIT 1
      `).get(prof.user_id, effectiveTenantId, effectiveTenantId) as any;

      if (cu) {
        if (cu.zemda_odonto_enabled) moduleSet.add('ZemdaOdonto');
        if (cu.zemda_fisio_enabled) moduleSet.add('ZemdaFisio');
        if (cu.zemda_nutri_enabled) moduleSet.add('ZemdaNutri');
        if (cu.zemda_to_enabled) moduleSet.add('ZemdaTO');
        if (cu.zemda_fono_enabled) moduleSet.add('ZemdaFono');
        if (cu.zemda_pp_enabled) moduleSet.add('ZemdaPP');
        if (cu.zemda_psico_enabled) moduleSet.add('ZemdaPsico');
        if (cu.zemda_personal_enabled) moduleSet.add('ZemdaPersonal');
        if (cu.zemda_med_enabled) moduleSet.add('ZemdaMed');
        if (cu.zemda_estetic_enabled) moduleSet.add('ZemdaEstetic');

        if (cu.permissions_json) {
          try {
            const perms = JSON.parse(cu.permissions_json);
            if (Array.isArray(perms)) {
              if (perms.includes('access_zemda_estetic') || perms.includes('zemda_estetic')) moduleSet.add('ZemdaEstetic');
              if (perms.includes('access_zemda_odonto') || perms.includes('zemda_odonto')) moduleSet.add('ZemdaOdonto');
              if (perms.includes('access_zemda_fisio') || perms.includes('zemda_fisio')) moduleSet.add('ZemdaFisio');
              if (perms.includes('access_zemda_nutri') || perms.includes('zemda_nutri')) moduleSet.add('ZemdaNutri');
              if (perms.includes('access_zemda_psico') || perms.includes('zemda_psico')) moduleSet.add('ZemdaPsico');
              if (perms.includes('access_zemda_fono') || perms.includes('zemda_fono')) moduleSet.add('ZemdaFono');
              if (perms.includes('access_zemda_to') || perms.includes('zemda_to')) moduleSet.add('ZemdaTO');
              if (perms.includes('access_zemda_pp') || perms.includes('zemda_pp')) moduleSet.add('ZemdaPP');
              if (perms.includes('access_zemda_personal') || perms.includes('zemda_personal')) moduleSet.add('ZemdaPersonal');
              if (perms.includes('access_zemda_med') || perms.includes('zemda_med')) moduleSet.add('ZemdaMed');
            }
          } catch (_) {}
        }
      }

      const u = db.prepare(`
        SELECT zemda_estetic_enabled, zemda_odonto_enabled, zemda_fisio_enabled,
               zemda_nutri_enabled, zemda_to_enabled, zemda_fono_enabled, zemda_pp_enabled,
               zemda_psico_enabled, zemda_personal_enabled, zemda_med_enabled
        FROM users WHERE id = ?
      `).get(prof.user_id) as any;
      if (u?.zemda_estetic_enabled) moduleSet.add('ZemdaEstetic');
      if (u?.zemda_odonto_enabled) moduleSet.add('ZemdaOdonto');
      if (u?.zemda_fisio_enabled) moduleSet.add('ZemdaFisio');
      if (u?.zemda_nutri_enabled) moduleSet.add('ZemdaNutri');
      if (u?.zemda_to_enabled) moduleSet.add('ZemdaTO');
      if (u?.zemda_fono_enabled) moduleSet.add('ZemdaFono');
      if (u?.zemda_pp_enabled) moduleSet.add('ZemdaPP');
      if (u?.zemda_psico_enabled) moduleSet.add('ZemdaPsico');
      if (u?.zemda_personal_enabled) moduleSet.add('ZemdaPersonal');
      if (u?.zemda_med_enabled) moduleSet.add('ZemdaMed');
    }

    // 4. Verificação de permissão/habilitação para ZemdaEstetic (ex.: HOF / Harmonização / Estética)
    const isDentist =
      canonical.canonicalId === 'prof-dentista' ||
      prof.profession_id === 'prof-dentista' ||
      (prof.profession_name || '').toLowerCase().includes('dent') ||
      Boolean(prof.zemda_odonto_enabled);

    const isFisio =
      canonical.canonicalId === 'prof-fisioterapeuta' ||
      prof.profession_id === 'prof-fisioterapeuta' ||
      (prof.profession_name || '').toLowerCase().includes('fisio') ||
      Boolean(prof.zemda_fisio_enabled);

    const isBiomed =
      prof.profession_id === 'prof-biomedicina' ||
      (prof.profession_name || '').toLowerCase().includes('bioméd') ||
      (prof.profession_name || '').toLowerCase().includes('biomed');

    const isFarm =
      prof.profession_id === 'prof-farmacia' ||
      (prof.profession_name || '').toLowerCase().includes('farmac');

    const isEstet =
      canonical.canonicalId === 'prof-esteticista' ||
      prof.profession_id === 'prof-esteticista' ||
      (prof.profession_name || '').toLowerCase().includes('estet') ||
      Boolean(prof.zemda_estetic_enabled);

    const isMed =
      canonical.canonicalId === 'prof-medico' ||
      prof.profession_id === 'prof-medico' ||
      (prof.profession_name || '').toLowerCase().includes('méd') ||
      (prof.profession_name || '').toLowerCase().includes('med') ||
      Boolean(prof.zemda_med_enabled);

    const practiceAreasStr = `${prof.practice_areas || ''} ${prof.specialty_custom || ''} ${prof.profession_name || ''} ${canonical.canonicalName || ''}`.toLowerCase();
    const hasAestheticSignal =
      practiceAreasStr.includes('estet') ||
      practiceAreasStr.includes('harmoniz') ||
      practiceAreasStr.includes('hof') ||
      practiceAreasStr.includes('facial') ||
      practiceAreasStr.includes('botox') ||
      practiceAreasStr.includes('toxina');

    if (hasAestheticSignal && (isDentist || isFisio || isBiomed || isFarm || isEstet || isMed)) {
      moduleSet.add('ZemdaEstetic');
    }

    // 5. REGRA REFORÇADA: Se houver qualquer módulo clínico específico, NUNCA incluir 'general'
    if (moduleSet.size > 0) {
      moduleSet.delete('general');
    } else {
      // Somente profissionais sem nenhum módulo clínico dedicado recebem 'general'
      moduleSet.add('general');
    }

    // Monta lista de resultados colocando o módulo canônico principal no topo
    const result: AvailableClinicalModule[] = [];
    if (canonical.commercialModule && moduleSet.has(canonical.commercialModule)) {
      result.push({
        code: canonical.commercialModule,
        label: CLINICAL_MODULE_DISPLAY_NAMES[canonical.commercialModule] || canonical.commercialModule
      });
      moduleSet.delete(canonical.commercialModule);
    }

    for (const code of moduleSet) {
      result.push({
        code,
        label: CLINICAL_MODULE_DISPLAY_NAMES[code] || code
      });
    }

    return result;
  } catch (err) {
    console.error('[getAvailableModulesForProfessional] Erro:', err);
    return [];
  }
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

  // 1. Se já existe evolução/prontuário salva neste atendimento, verifica o módulo
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

  // 2. Prioridade do SERVIÇO vinculado ao agendamento
  let serviceId = appointment.service_id;
  if (!serviceId && appointment.id) {
    const apptRow = db.prepare('SELECT service_id, clinical_module FROM appointments WHERE id = ?').get(appointment.id) as any;
    if (apptRow) {
      serviceId = apptRow.service_id;
      if (!appointment.clinical_module && apptRow.clinical_module) {
        appointment.clinical_module = apptRow.clinical_module;
      }
    }
  }

  if (serviceId) {
    const srv = db.prepare('SELECT clinical_module FROM services WHERE id = ?').get(serviceId) as any;
    if (srv?.clinical_module && isPrimaryClinicalModule(srv.clinical_module)) {
      return srv.clinical_module;
    }
  }

  // 3. Se já está gravado com módulo primário canônico definitivo no próprio agendamento, respeita-o
  if (isPrimaryClinicalModule(appointment.clinical_module)) {
    return appointment.clinical_module;
  }

  // 4. Resolução pelo profissional vinculado (canônico + flags + clinic_users)
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

  // 5. Resolução por profession_id do agendamento
  if (appointment.profession_id) {
    const canonical = resolveCanonicalProfession({ id: appointment.profession_id });
    if (canonical.commercialModule && isPrimaryClinicalModule(canonical.commercialModule)) {
      return canonical.commercialModule;
    }
  }

  // 6. Fallback para registros já previamente marcados como general, Zemda360 ou ZemdaBody
  if (appointment.clinical_module === 'general' || appointment.clinical_module === 'ZemdaBody' || appointment.clinical_module === 'Zemda360') {
    return 'general';
  }

  return null;
}
