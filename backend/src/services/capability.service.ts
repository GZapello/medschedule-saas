import { db } from '../config/database';
import { resolveProfessionModule, resolveCanonicalProfession, ZemdaModule } from '../utils/profession-module';
import { ComputedUserCapabilities } from '../types/capabilities';
import { REGISTRATION_PROFESSION_ALIASES } from '../types/registration-professions';
import { MedicalTreeService } from './medical-tree.service';

export class CapabilityService {
  /**
   * Normaliza o professionId para a chave canônica do catálogo
   */
  public static normalizeProfessionId(profId?: string | null): string {
    if (!profId) return 'prof-outro-saude';
    const resolution = resolveCanonicalProfession({ id: profId });
    return resolution.canonicalId;
  }

  /**
   * Determina o módulo comercial de exibição (ZemdaMed, ZemdaFisio, ZemdaPersonal, etc.)
   */
  public static resolveCommercialModule(profId: string, profName?: string): string {
    const resolution = resolveCanonicalProfession({ id: profId, name: profName });
    return resolution.commercialModule || 'ZemdaGestao';
  }

  /**
   * Retorna o catálogo completo de capabilities ativas
   */
  public static getCatalog(): any[] {
    return db.prepare('SELECT id, category, name, description FROM capabilities WHERE active = 1 ORDER BY category, name').all();
  }

  /**
   * Retorna as áreas de atuação disponíveis para uma dada profissão
   */
  public static getPracticeAreas(professionId: string): any[] {
    const cleanId = (professionId || '').trim();
    if (!cleanId) return [];

    const resolution = resolveCanonicalProfession({ id: cleanId, name: cleanId, slug: cleanId });

    // CASO MEDICINA: ESPECIALIDADE MÉDICA ESPECÍFICA (ex: Neurologista, Cardiologista, Psiquiatra)
    // Retorna as áreas de atuação / subáreas filhas daquela especialidade médica específica!
    if (resolution.canonicalId === 'prof-medico' && resolution.isSpecificAlias && resolution.medicalSpecialtyId) {
      const medAreas = db.prepare(`
        SELECT id, name, slug, description, sort_order
        FROM medical_practice_areas
        WHERE medical_specialty_id = ? AND active = 1
        ORDER BY sort_order ASC, name ASC
      `).all(resolution.medicalSpecialtyId) as any[];

      if (medAreas.length > 0) {
        return medAreas.map(r => ({
          id: r.id,
          profession_id: 'prof-medico',
          name: r.name,
          slug: r.slug,
          type: 'AREA',
          description: r.description,
          medicalSpecialtyId: resolution.medicalSpecialtyId,
          medicalSpecialtyName: resolution.medicalSpecialtyName,
          isInferredForAlias: false,
          isSpecificLocked: false
        }));
      }
    }

    // CASO MEDICINA GENÉRICA (Médico / Medicina):
    // Retorna as especialidades médicas como opções selecionáveis
    if (resolution.canonicalId === 'prof-medico' && !resolution.isSpecificAlias) {
      const specs = db.prepare(`
        SELECT id, name, slug, description, sort_order
        FROM medical_specialties
        WHERE active = 1
        ORDER BY sort_order ASC, name ASC
      `).all() as any[];

      return specs.map(s => ({
        id: s.id,
        profession_id: 'prof-medico',
        name: s.name,
        slug: s.slug,
        type: 'SPECIALTY',
        description: s.description,
        isInferredForAlias: false,
        isSpecificLocked: false
      }));
    }

    // CASO OUTRAS PROFISSÕES: Título que já é uma especialidade ou abordagem específica (ex: Neuropsicólogo, Psicanalista)
    // Retorna ESTRITAMENTE a própria especialidade/área vinculada, eliminando falsas hierarquias
    if (resolution.isSpecificAlias && (resolution.automaticPracticeAreaId || resolution.inferredAreaId)) {
      const targetAreaId = resolution.automaticPracticeAreaId || resolution.inferredAreaId;
      const singleRow = db.prepare(`
        SELECT id, profession_id, name, slug, type, description
        FROM practice_areas
        WHERE id = ? AND active = 1
      `).get(targetAreaId) as any;

      if (singleRow) {
        return [{
          ...singleRow,
          isInferredForAlias: true,
          isSpecificLocked: true
        }];
      }
      return [];
    }

    // Se a profissão não tem módulo comercial e não tem workspace clínico, não possui áreas
    if (!resolution.commercialModule && !resolution.clinicalWorkspace) {
      return [];
    }

    // CASO GERAL: Profissão canônica genérica (Fisioterapeuta, Psicólogo, Nutricionista, etc.)
    // Retorna todas as especialidades/áreas no mesmo nível hierárquico como pares
    const canonical = resolution.canonicalId;
    const rows = db.prepare(`
      SELECT id, profession_id, name, slug, type, description
      FROM practice_areas
      WHERE profession_id = ? AND active = 1
      ORDER BY name ASC
    `).all(canonical) as any[];

    return rows.map(r => ({
      ...r,
      isInferredForAlias: false,
      isSpecificLocked: false
    }));
  }

  /**
   * Valida se uma lista de practiceAreaIds é compatível com a profissão.
   * Suporta o catálogo transversal (practice_areas) e a árvore clínica de Medicina (medical_practice_areas / medical_specialties).
   */
  public static validatePracticeAreasForProfession(
    rawProfIdOrName?: string | null,
    practiceAreaIds?: string[] | null
  ): { valid: boolean; error?: string } {
    if (!practiceAreaIds || practiceAreaIds.length === 0) {
      return { valid: true };
    }

    const resolution = resolveCanonicalProfession({ id: rawProfIdOrName || '', name: rawProfIdOrName || '' });
    const canonicalProfId = resolution.canonicalId;

    // 1. Validação Especial para Medicina e Especialidades Médicas
    if (canonicalProfId === 'prof-medico') {
      // Se for alias médico específico (ex: Neurologista), aceita somente áreas dessa especialidade médica
      if (resolution.isSpecificAlias && resolution.medicalSpecialtyId) {
        const validAreas = db.prepare(`
          SELECT id FROM medical_practice_areas
          WHERE medical_specialty_id = ? AND active = 1
        `).all(resolution.medicalSpecialtyId).map((r: any) => r.id);

        const validSet = new Set(validAreas);
        if (resolution.automaticPracticeAreaId) validSet.add(resolution.automaticPracticeAreaId);
        if (resolution.inferredAreaId) validSet.add(resolution.inferredAreaId);

        for (const areaId of practiceAreaIds) {
          if (!validSet.has(areaId)) {
            return {
              valid: false,
              error: `Área de atuação '${areaId}' não pertence à especialidade ${resolution.medicalSpecialtyName || 'médica vinculada'}`
            };
          }
        }
        return { valid: true };
      }

      // Se for médico genérico, aceita IDs de medical_practice_areas, medical_specialties ou practice_areas legadas
      const placeholders = practiceAreaIds.map(() => '?').join(',');
      const foundMedAreas = db.prepare(`
        SELECT id FROM medical_practice_areas WHERE id IN (${placeholders}) AND active = 1
      `).all(...practiceAreaIds).map((r: any) => r.id);

      const foundSpecs = db.prepare(`
        SELECT id FROM medical_specialties WHERE id IN (${placeholders}) AND active = 1
      `).all(...practiceAreaIds).map((r: any) => r.id);

      const foundLegacy = db.prepare(`
        SELECT id FROM practice_areas WHERE id IN (${placeholders}) AND profession_id = 'prof-medico' AND active = 1
      `).all(...practiceAreaIds).map((r: any) => r.id);

      const validSet = new Set([...foundMedAreas, ...foundSpecs, ...foundLegacy]);
      for (const areaId of practiceAreaIds) {
        if (!validSet.has(areaId)) {
          return {
            valid: false,
            error: `Área de atuação médica '${areaId}' não é válida no catálogo.`
          };
        }
      }
      return { valid: true };
    }

    // 2. Validação para outras profissões clínicas (Fisio, Psico, Fono, TO, Nutri, Personal, Odonto)
    const specificTargetAreaId = resolution.automaticPracticeAreaId || resolution.inferredAreaId;
    if (resolution.isSpecificAlias && specificTargetAreaId) {
      for (const areaId of practiceAreaIds) {
        if (areaId !== specificTargetAreaId) {
          return {
            valid: false,
            error: `Área de atuação ${areaId} não pertence à profissão ${canonicalProfId}`
          };
        }
      }
    }

    const placeholders = practiceAreaIds.map(() => '?').join(',');
    const foundRows = db.prepare(`
      SELECT id, profession_id, active FROM practice_areas
      WHERE id IN (${placeholders})
    `).all(...practiceAreaIds) as { id: string; profession_id: string; active: number }[];

    const foundMap = new Map(foundRows.map(r => [r.id, r]));

    for (const areaId of practiceAreaIds) {
      const row = foundMap.get(areaId);
      if (!row || row.active !== 1) {
        return {
          valid: false,
          error: `Área de atuação ${areaId} não existe ou está inativa no catálogo.`
        };
      }
      if (row.profession_id !== canonicalProfId) {
        return {
          valid: false,
          error: `Área de atuação ${areaId} não pertence à profissão ${canonicalProfId}`
        };
      }
    }

    return { valid: true };
  }

  /**
   * Obtém as áreas de atuação salvas para um usuário
   */
  public static getUserPracticeAreas(userId: string, tenantId: string): string[] {
    const rows = db.prepare(`
      SELECT practice_area_id FROM user_practice_areas
      WHERE user_id = ? AND tenant_id = ?
    `).all(userId, tenantId) as any[];
    return rows.map(r => r.practice_area_id);
  }

  /**
   * Atualiza as áreas de atuação de um usuário
   */
  public static setUserPracticeAreas(userId: string, tenantId: string, practiceAreaIds: string[]): void {
    db.prepare('DELETE FROM user_practice_areas WHERE user_id = ? AND tenant_id = ?').run(userId, tenantId);
    if (!practiceAreaIds || practiceAreaIds.length === 0) return;

    const cleanIds = practiceAreaIds.map(id => (typeof id === 'string' ? id.trim() : '')).filter(Boolean);
    if (cleanIds.length === 0) return;

    // Filter to only IDs that actually exist in practice_areas to satisfy FK constraint
    const placeholders = cleanIds.map(() => '?').join(',');
    const existingRows = db.prepare(`
      SELECT id FROM practice_areas WHERE id IN (${placeholders})
    `).all(...cleanIds) as { id: string }[];
    const validIds = new Set(existingRows.map(r => r.id));

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO user_practice_areas (user_id, practice_area_id, tenant_id)
      VALUES (?, ?, ?)
    `);
    for (const paId of cleanIds) {
      if (validIds.has(paId)) {
        insertStmt.run(userId, paId, tenantId);
      }
    }
  }

  /**
   * Obtém os recursos opcionais ativados pelo profissional
   */
  public static getUserOptionalCapabilities(userId: string, tenantId: string): string[] {
    const rows = db.prepare(`
      SELECT capability_id FROM user_optional_capabilities
      WHERE user_id = ? AND tenant_id = ? AND enabled = 1
    `).all(userId, tenantId) as any[];
    return rows.map(r => r.capability_id);
  }

  /**
   * Atualiza a seleção de opcionais do profissional (autonomia clínica individual)
   */
  public static setUserOptionalCapabilities(userId: string, tenantId: string, capabilityIds: string[]): ComputedUserCapabilities {
    const current = this.computeUserCapabilities(userId, tenantId);
    const validSelection = capabilityIds.filter(id => current.availableOptionalCapabilities.includes(id));

    db.prepare('DELETE FROM user_optional_capabilities WHERE user_id = ? AND tenant_id = ?').run(userId, tenantId);
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO user_optional_capabilities (user_id, capability_id, tenant_id, enabled)
      VALUES (?, ?, ?, 1)
    `);
    for (const capId of validSelection) {
      insertStmt.run(userId, capId, tenantId);
    }

    return this.computeUserCapabilities(userId, tenantId);
  }

  /**
   * Cálculo determinístico e união inteligente (UNION) de capabilities para o usuário
   */
  public static computeUserCapabilities(userId: string, tenantId: string): ComputedUserCapabilities {
    // 1. Busca dados do usuário, profissional, vínculo de clínica e tenant
    const userRow = db.prepare(`
      SELECT u.id, u.name as u_name, u.email as u_email, u.role,
             u.profession_id as u_prof_id, u.profession_name as u_prof_name,
             u.zemda_fono_enabled as u_fono, u.zemda_med_enabled as u_med,
             u.zemda_fisio_enabled as u_fisio, u.zemda_odonto_enabled as u_odonto,
             u.zemda_nutri_enabled as u_nutri, u.zemda_to_enabled as u_to,
             u.zemda_pp_enabled as u_pp, u.zemda_psico_enabled as u_psico,
             u.zemda_personal_enabled as u_personal,
             cu.profession_custom as cu_prof_custom, cu.profession_id as cu_prof_id,
             cu.profession_name as cu_prof_name,
             cu.zemda_fono_enabled as cu_fono, cu.zemda_med_enabled as cu_med,
             cu.zemda_fisio_enabled as cu_fisio, cu.zemda_odonto_enabled as cu_odonto,
             cu.zemda_nutri_enabled as cu_nutri, cu.zemda_to_enabled as cu_to,
             cu.zemda_pp_enabled as cu_pp, cu.zemda_psico_enabled as cu_psico,
             cu.zemda_personal_enabled as cu_personal,
             p.profession_id as p_prof_id, p.profession_name as p_prof_name,
             p.name as p_name, p.specialty_custom as p_spec_custom,
             p.zemda_fono_enabled as p_fono, p.zemda_med_enabled as p_med,
             p.zemda_fisio_enabled as p_fisio, p.zemda_odonto_enabled as p_odonto,
             p.zemda_nutri_enabled as p_nutri, p.zemda_to_enabled as p_to,
             p.zemda_pp_enabled as p_pp, p.zemda_psico_enabled as p_psico,
             p.zemda_personal_enabled as p_personal,
             prof.name as prof_name, prof.slug as prof_slug,
             t.manager_profession as t_manager_prof, t.name as t_name,
             t.trade_name as t_trade_name, t.description as t_description
      FROM users u
      LEFT JOIN clinic_users cu ON cu.user_id = u.id AND cu.tenant_id = ?
      LEFT JOIN professionals p ON p.user_id = u.id AND p.tenant_id = ?
      LEFT JOIN professions prof ON prof.id = p.profession_id
      LEFT JOIN tenants t ON t.id = ?
      WHERE u.id = ?
    `).get(tenantId, tenantId, tenantId, userId) as any;

    // 1.1 Detecção de Fonoaudiologia (REGRA OBRIGATÓRIA):
    // Todo perfil com zemda_fono_enabled, fonoaudiólogo(a), clinic_admin em clínica fonoaudiológica,
    // ou com menção a fonoaudiologia no nome, cargo, perfil ou tenant:
    const isFonoSignal =
      userRow?.u_fono === 1 ||
      userRow?.p_fono === 1 ||
      userRow?.cu_fono === 1 ||
      (userRow?.p_prof_id || '').toLowerCase().includes('fono') ||
      (userRow?.u_prof_id || '').toLowerCase().includes('fono') ||
      (userRow?.cu_prof_id || '').toLowerCase().includes('fono') ||
      (userRow?.p_prof_name || '').toLowerCase().includes('fono') ||
      (userRow?.u_prof_name || '').toLowerCase().includes('fono') ||
      (userRow?.cu_prof_name || '').toLowerCase().includes('fono') ||
      (userRow?.cu_prof_custom || '').toLowerCase().includes('fono') ||
      (userRow?.p_spec_custom || '').toLowerCase().includes('fono') ||
      (userRow?.prof_name || '').toLowerCase().includes('fono') ||
      (userRow?.u_name || '').toLowerCase().includes('fono') ||
      (userRow?.p_name || '').toLowerCase().includes('fono') ||
      (userRow?.u_name || '').startsWith('Fga.') ||
      (userRow?.u_name || '').startsWith('Fgo.') ||
      (userRow?.p_name || '').startsWith('Fga.') ||
      (userRow?.p_name || '').startsWith('Fgo.') ||
      (userRow?.u_email || '').toLowerCase().includes('fono') ||
      ((userRow?.role === 'clinic_admin' || !userRow?.p_prof_id || userRow?.p_prof_id === 'prof-outro-saude') && (
        (userRow?.t_manager_prof || '').toLowerCase().includes('fono') ||
        (userRow?.t_description || '').toLowerCase().includes('fono') ||
        (userRow?.t_name || '').toLowerCase().includes('fono') ||
        (userRow?.t_trade_name || '').toLowerCase().includes('fono')
      ));

    let rawProfId = isFonoSignal
      ? 'prof-fonoaudiologo'
      : ((userRow?.p_prof_id && userRow?.p_prof_id !== 'prof-outro-saude')
          ? userRow.p_prof_id
          : (userRow?.u_prof_id && userRow?.u_prof_id !== 'prof-outro-saude')
          ? userRow.u_prof_id
          : userRow?.cu_prof_id ||
            userRow?.cu_prof_custom ||
            userRow?.p_profession_name ||
            userRow?.u_prof_name ||
            userRow?.t_manager_prof ||
            userRow?.p_prof_id ||
            userRow?.u_prof_id ||
            'prof-outro-saude');

    let profName = isFonoSignal
      ? 'Fonoaudiólogo'
      : (userRow?.prof_name ||
         userRow?.p_prof_name ||
         userRow?.cu_prof_name ||
         userRow?.cu_prof_custom ||
         userRow?.u_prof_name ||
         userRow?.t_manager_prof ||
         '');

    const resolution = resolveCanonicalProfession({ id: rawProfId, name: profName });
    let canonicalProfId = resolution.canonicalId;
    let commercialModule = resolution.commercialModule || 'ZemdaGestao';

    // REGRA OBRIGATÓRIA: Qualquer usuário reconhecido como ZemdaFono converge na matriz para prof-fonoaudiologo
    if (commercialModule === 'ZemdaFono' || canonicalProfId === 'prof-fonoaudiologo' || isFonoSignal) {
      canonicalProfId = 'prof-fonoaudiologo';
      commercialModule = 'ZemdaFono';
    }

    // 2. Busca áreas selecionadas pelo usuário
    let userAreaIds = this.getUserPracticeAreas(userId, tenantId);

    const isTOSignal =
      userRow?.u_to === 1 ||
      userRow?.p_to === 1 ||
      userRow?.cu_to === 1 ||
      (userRow?.p_prof_id || '').toLowerCase().includes('terapeuta-ocupacional') ||
      (userRow?.u_prof_id || '').toLowerCase().includes('terapeuta-ocupacional') ||
      (userRow?.cu_prof_id || '').toLowerCase().includes('terapeuta-ocupacional') ||
      (userRow?.p_prof_name || '').toLowerCase().includes('terapia ocupacional') ||
      (userRow?.u_prof_name || '').toLowerCase().includes('terapia ocupacional') ||
      (userRow?.cu_prof_name || '').toLowerCase().includes('terapia ocupacional') ||
      (userRow?.cu_prof_custom || '').toLowerCase().includes('terapia ocupacional') ||
      (userRow?.p_spec_custom || '').toLowerCase().includes('terapia ocupacional') ||
      (userRow?.prof_name || '').toLowerCase().includes('terapia ocupacional');

    // Se for médico, busca a hierarquia clínica médica (Especialidades e Áreas)
    let medSpecIds: string[] | undefined = undefined;
    let medPaIds: string[] | undefined = undefined;

    if (canonicalProfId === 'prof-medico' || userRow?.u_med === 1 || userRow?.p_med === 1) {
      const medHierarchy = MedicalTreeService.getUserMedicalHierarchy(userId, tenantId);
      medSpecIds = medHierarchy.specialtyIds;
      medPaIds = medHierarchy.practiceAreaIds;

      if (medSpecIds.length === 0) {
        if (resolution.medicalSpecialtyId) {
          medSpecIds = [resolution.medicalSpecialtyId];
        } else {
          medSpecIds = ['med-spec-clinica'];
        }
      }
    }

    // Se usuário não tiver áreas cadastradas, infere a área inicial correspondente a partir da resolução canônica
    const autoAreaId = resolution.automaticPracticeAreaId || resolution.inferredAreaId;
    if (userAreaIds.length === 0 && autoAreaId) {
      userAreaIds = [autoAreaId];
    }

    // 3. Busca opcionais ativos pelo usuário
    const userSelectedOptionals = this.getUserOptionalCapabilities(userId, tenantId);

    // 4. Executa cálculo com união inteligente
    return this.calculateCapabilities({
      professionId: canonicalProfId,
      commercialModule,
      clinicalWorkspace: resolution.clinicalWorkspace || (canonicalProfId === 'prof-fonoaudiologo' ? 'ZemdaFono' : null),
      taxonomyCategory: resolution.taxonomyCategory,
      practiceAreaIds: userAreaIds,
      medicalSpecialtyIds: medSpecIds,
      medicalPracticeAreaIds: medPaIds,
      selectedOptionalCapabilities: userSelectedOptionals,
      tenantId
    });
  }

  /**
   * Cálculo desacoplado de capabilities (usado tanto em runtime de usuários quanto no Laboratório Sandbox)
   */
  public static calculateCapabilities(params: {
    professionId: string;
    commercialModule: string;
    clinicalWorkspace?: string | null;
    taxonomyCategory?: string;
    practiceAreaIds: string[];
    medicalSpecialtyIds?: string[];
    medicalPracticeAreaIds?: string[];
    selectedOptionalCapabilities?: string[];
    tenantId?: string;
    planCode?: string; // Para sandbox: 'SOLO' | 'TEAM' | 'CLINIC' | 'ALL'
  }): ComputedUserCapabilities {
    const {
      professionId,
      commercialModule,
      clinicalWorkspace = null,
      taxonomyCategory,
      practiceAreaIds,
      medicalSpecialtyIds = [],
      medicalPracticeAreaIds = [],
      selectedOptionalCapabilities = []
    } = params;

    // Regras da Profissão
    const profRules = db.prepare(`
      SELECT capability_id, rule FROM profession_capabilities
      WHERE profession_id = ? OR profession_id = ?
    `).all(professionId, this.normalizeProfessionId(professionId)) as { capability_id: string; rule: string }[];

    const defaultCapsSet = new Set<string>();
    const optionalCapsSet = new Set<string>();
    const hiddenCapsSet = new Set<string>();

    for (const r of profRules) {
      if (r.rule === 'DEFAULT') defaultCapsSet.add(r.capability_id);
      else if (r.rule === 'OPTIONAL') optionalCapsSet.add(r.capability_id);
      else if (r.rule === 'HIDDEN') hiddenCapsSet.add(r.capability_id);
    }

    // Regras das Áreas de Atuação Selecionadas (Catálogo Geral)
    if (practiceAreaIds && practiceAreaIds.length > 0) {
      const placeholders = practiceAreaIds.map(() => '?').join(',');
      const areaRules = db.prepare(`
        SELECT capability_id, rule FROM practice_area_capabilities
        WHERE practice_area_id IN (${placeholders})
      `).all(...practiceAreaIds) as { capability_id: string; rule: string }[];

      for (const r of areaRules) {
        if (r.rule === 'DEFAULT') defaultCapsSet.add(r.capability_id);
        else if (r.rule === 'OPTIONAL') optionalCapsSet.add(r.capability_id);
        else if (r.rule === 'HIDDEN') hiddenCapsSet.add(r.capability_id);
      }
    }

    // Regras das Especialidades Médicas Selecionadas (Árvore Médica)
    if (medicalSpecialtyIds && medicalSpecialtyIds.length > 0) {
      const specPlaceholders = medicalSpecialtyIds.map(() => '?').join(',');
      const specRules = db.prepare(`
        SELECT capability_id, rule FROM medical_specialty_capabilities
        WHERE medical_specialty_id IN (${specPlaceholders})
      `).all(...medicalSpecialtyIds) as { capability_id: string; rule: string }[];

      for (const r of specRules) {
        if (r.rule === 'DEFAULT') defaultCapsSet.add(r.capability_id);
        else if (r.rule === 'OPTIONAL') optionalCapsSet.add(r.capability_id);
        else if (r.rule === 'HIDDEN') hiddenCapsSet.add(r.capability_id);
      }
    }

    // Regras das Áreas de Atuação Médicas Selecionadas (Árvore Médica)
    if (medicalPracticeAreaIds && medicalPracticeAreaIds.length > 0) {
      const paPlaceholders = medicalPracticeAreaIds.map(() => '?').join(',');
      const paRules = db.prepare(`
        SELECT capability_id, rule FROM medical_practice_area_capabilities
        WHERE medical_practice_area_id IN (${paPlaceholders})
      `).all(...medicalPracticeAreaIds) as { capability_id: string; rule: string }[];

      for (const r of paRules) {
        if (r.rule === 'DEFAULT') defaultCapsSet.add(r.capability_id);
        else if (r.rule === 'OPTIONAL') optionalCapsSet.add(r.capability_id);
        else if (r.rule === 'HIDDEN') hiddenCapsSet.add(r.capability_id);
      }
    }

    // Respeito estrito a incompatibilidades (HIDDEN tem precedência sobre DEFAULT e OPTIONAL)
    for (const hidden of hiddenCapsSet) {
      defaultCapsSet.delete(hidden);
      optionalCapsSet.delete(hidden);
    }

    // Não duplicar: se está em default, não precisa estar em optional
    for (const def of defaultCapsSet) {
      optionalCapsSet.delete(def);
    }

    // Filtra seleção de opcionais válidos
    const activeOptionals = selectedOptionalCapabilities.filter(id => optionalCapsSet.has(id));

    // União inteligente: Defaults + Opcionais Ativados
    const activeCapsSet = new Set<string>([...defaultCapsSet, ...activeOptionals]);

    // Respeito ao Plano Comercial
    const planRestrictedList: { capabilityId: string; requiredPlan: string }[] = [];
    if (params.planCode && params.planCode !== 'ALL') {
      // No modo sandbox com plano específico
      const planCaps = db.prepare(`
        SELECT capability_id FROM plan_capabilities
        WHERE plan_id = ?
      `).all(`zemda-${params.planCode}`) as { capability_id: string }[];

      const allowedPlanCaps = new Set(planCaps.map(p => p.capability_id));
      for (const cap of Array.from(activeCapsSet)) {
        if (allowedPlanCaps.size > 0 && !allowedPlanCaps.has(cap)) {
          activeCapsSet.delete(cap);
          planRestrictedList.push({ capabilityId: cap, requiredPlan: 'CLINIC' });
        }
      }
    }

    return {
      professionId,
      commercialModule,
      clinicalWorkspace,
      taxonomyCategory,
      practiceAreaIds,
      medicalSpecialtyIds,
      medicalPracticeAreaIds,
      activeCapabilities: Array.from(activeCapsSet),
      defaultCapabilities: Array.from(defaultCapsSet),
      availableOptionalCapabilities: Array.from(optionalCapsSet),
      selectedOptionalCapabilities: activeOptionals,
      hiddenCapabilities: Array.from(hiddenCapsSet),
      planRestrictedCapabilities: planRestrictedList
    };
  }

  /**
   * Checagem booleana de capability com suporte a superadmin e salvaguarda direta
   */
  public static hasCapability(userId: string, tenantId: string, capabilityId: string): boolean {
    const computed = this.computeUserCapabilities(userId, tenantId);
    return computed.activeCapabilities.includes(capabilityId);
  }
}
