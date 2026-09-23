import { db } from '../config/database';
import { resolveProfessionModule, ZemdaModule } from '../utils/profession-module';
import { ComputedUserCapabilities } from '../types/capabilities';
import { REGISTRATION_PROFESSION_ALIASES } from '../types/registration-professions';

export class CapabilityService {
  /**
   * Normaliza o professionId para a chave canônica do catálogo
   */
  public static normalizeProfessionId(profId?: string | null): string {
    if (!profId) return 'prof-outro-saude';
    const clean = profId.trim().toLowerCase();
    return REGISTRATION_PROFESSION_ALIASES[clean] || clean;
  }

  /**
   * Determina o módulo comercial de exibição (ZemdaMed, ZemdaFisio, etc.)
   */
  public static resolveCommercialModule(profId: string, profName?: string): string {
    const canonical = this.normalizeProfessionId(profId);

    // Verificação prioritária de Medicina para ativar a nova vertical ZemdaMed
    if (
      canonical === 'prof-medico' ||
      canonical === 'prof-medicina' ||
      canonical === 'prof-cardiologista' ||
      canonical === 'prof-dermatologista' ||
      canonical === 'prof-pediatra' ||
      canonical === 'prof-psiquiatra' ||
      (profName && /médic|medic|crm|cardiolog|dermatolog|pediatr|psiquiatr/i.test(profName))
    ) {
      return 'ZemdaMed';
    }

    const { module } = resolveProfessionModule({ id: canonical, name: profName });
    return module || 'ZemdaGestao';
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
    const canonical = this.normalizeProfessionId(professionId);
    return db.prepare(`
      SELECT id, profession_id, name, slug, type, description
      FROM practice_areas
      WHERE (profession_id = ? OR profession_id = ?) AND active = 1
      ORDER BY name ASC
    `).all(canonical, professionId);
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
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO user_practice_areas (user_id, practice_area_id, tenant_id)
      VALUES (?, ?, ?)
    `);
    for (const paId of practiceAreaIds) {
      if (paId && paId.trim()) {
        insertStmt.run(userId, paId.trim(), tenantId);
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
    // 1. Busca dados do usuário e profissional
    const userRow = db.prepare(`
      SELECT u.id, u.role, u.profession_id as u_prof_id, u.profession_name as u_prof_name,
             cu.profession_custom, p.profession_id as p_prof_id, prof.name as prof_name
      FROM users u
      LEFT JOIN clinic_users cu ON cu.user_id = u.id AND cu.tenant_id = ?
      LEFT JOIN professionals p ON p.user_id = u.id AND p.tenant_id = ?
      LEFT JOIN professions prof ON prof.id = p.profession_id
      WHERE u.id = ?
    `).get(tenantId, tenantId, userId) as any;

    const rawProfId = userRow?.p_prof_id || userRow?.u_prof_id || userRow?.profession_custom || 'prof-outro-saude';
    const profName = userRow?.prof_name || userRow?.u_prof_name || '';
    const canonicalProfId = this.normalizeProfessionId(rawProfId);
    const commercialModule = this.resolveCommercialModule(canonicalProfId, profName);

    // 2. Busca áreas selecionadas pelo usuário
    let userAreaIds = this.getUserPracticeAreas(userId, tenantId);

    // Se usuário não tiver áreas cadastradas mas for médico especialista, infere a área inicial correspondente
    if (userAreaIds.length === 0) {
      if (rawProfId === 'prof-pediatra') userAreaIds = ['pa-med-pediatria'];
      else if (rawProfId === 'prof-cardiologista') userAreaIds = ['pa-med-cardio'];
      else if (rawProfId === 'prof-dermatologista') userAreaIds = ['pa-med-dermato'];
      else if (rawProfId === 'prof-psiquiatra') userAreaIds = ['pa-med-psiquiatria'];
      else if (canonicalProfId === 'prof-medico') userAreaIds = ['pa-med-clinica'];
    }

    // 3. Busca opcionais ativos pelo usuário
    const userSelectedOptionals = this.getUserOptionalCapabilities(userId, tenantId);

    // 4. Executa cálculo com união inteligente
    return this.calculateCapabilities({
      professionId: canonicalProfId,
      commercialModule,
      practiceAreaIds: userAreaIds,
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
    practiceAreaIds: string[];
    selectedOptionalCapabilities?: string[];
    tenantId?: string;
    planCode?: string; // Para sandbox: 'SOLO' | 'TEAM' | 'CLINIC' | 'ALL'
  }): ComputedUserCapabilities {
    const { professionId, commercialModule, practiceAreaIds, selectedOptionalCapabilities = [] } = params;

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

    // Regras das Áreas de Atuação Selecionadas
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
      practiceAreaIds,
      activeCapabilities: Array.from(activeCapsSet),
      defaultCapabilities: Array.from(defaultCapsSet),
      availableOptionalCapabilities: Array.from(optionalCapsSet),
      selectedOptionalCapabilities: activeOptionals,
      hiddenCapabilities: Array.from(hiddenCapsSet),
      planRestrictedCapabilities: planRestrictedList
    };
  }

  /**
   * Checagem booleana de capability com suporte a superadmin e compatibilidade
   */
  public static hasCapability(userId: string, tenantId: string, capabilityId: string): boolean {
    const computed = this.computeUserCapabilities(userId, tenantId);
    return computed.activeCapabilities.includes(capabilityId);
  }
}
