import { db } from '../config/database';
import { getAvailableModulesForProfessional } from './clinical-module';
import { getTenantEstablishmentProfile, resolveServiceDomain } from './establishment-context';
import { isGenericFallbackProfessionName, resolveCanonicalProfession } from './profession-module';
import { normalizeStudioServiceType, StudioServiceType } from './studio-access-and-commercial';

export interface AddonProfessionalSummary {
  id: string;
  name: string;
  professionId: string | null;
  professionName: string | null;
  availableModules: string[];
  zemdaPersonalEnabled: boolean;
  userRole: string | null;
  inactiveMembership: boolean;
  studioPractitioner: boolean;
  isAdminManager: boolean;
  isPersonalOrFitnessQualified: boolean;
  isClinicalOnlyWithoutFitness: boolean;
  hasActiveSchedule: boolean;
  publicBookingEnabled: boolean;
  active: boolean;
  linkedServiceIds: string[];
}

export interface AddonCandidateServiceSummary {
  id: string;
  name: string;
  active: boolean;
  service_domain: 'studio';
  studio_service_type: StudioServiceType;
  service_kind: 'individual' | 'group';
  requires_appointment: number;
  is_schedulable: boolean;
  default_capacity: number | null;
  duration_minutes: number;
  modality: string;
  modality_category: string | null;
  clinical_module: string | null;
  professional_id: string | null;
  linked_professional_ids: string[];
  eligible_professional_ids: string[];
  eligible_professionals: Array<{
    id: string;
    name: string;
    profession_name: string | null;
    public_booking_enabled: boolean;
    has_active_schedule: boolean;
  }>;
}

const PERSONAL_FITNESS_PROFESSION_IDS = new Set([
  'prof-personal-trainer',
  'prof-educacao-fisica',
  'prof-instrutor',
  'prof-instrutor-pilates',
  'pilates_instructor'
]);

function normalizeText(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isFitnessOrInstructorProfessionText(raw: string): boolean {
  const clean = normalizeText(raw);
  if (!clean) return false;
  return (
    clean.includes('personal') ||
    clean.includes('educador fisic') ||
    clean.includes('educacao fisic') ||
    clean.includes('preparador fisic') ||
    clean.includes('musculac') ||
    clean.includes('instrutor') ||
    clean.includes('pilates') ||
    clean.includes('crossfit') ||
    clean.includes('funcional')
  );
}

function isAdminOnlyProfessionText(raw: string): boolean {
  const clean = normalizeText(raw);
  if (!clean) return false;
  return (
    clean === 'gestor' ||
    clean === 'administrador' ||
    clean === 'administradora' ||
    clean === 'admin' ||
    clean === 'gerente' ||
    clean.includes('recepcao') ||
    clean.includes('secretaria') ||
    clean.includes('financeiro') ||
    clean.includes('socio')
  );
}

export function listTenantAddonProfessionalsDetailed(tenantId: string): AddonProfessionalSummary[] {
  const rows = db.prepare(`
    SELECT
      p.id,
      p.user_id,
      p.name,
      p.profession_id,
      p.profession_name,
      p.practice_areas,
      p.registration_type,
      COALESCE(p.zemda_personal_enabled, 0) as zemda_personal_enabled,
      COALESCE(p.public_booking_enabled, 1) as public_booking_enabled,
      COALESCE(p.active, 1) as active,
      pr.name as pr_name,
      cu.role as cu_role, cu.status as membership_status, u.status as account_status,
      u.tenant_id as home_tenant_id, p.tenant_id, cu.deactivated_at,
      COALESCE(cu.is_manager, 0) as cu_is_manager,
      cu.profession_custom as cu_profession_custom,
      u.role as user_role
    FROM professionals p
    LEFT JOIN professions pr ON pr.id = p.profession_id
    LEFT JOIN clinic_users cu ON cu.user_id = p.user_id AND cu.tenant_id = p.tenant_id
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.tenant_id = ?
    ORDER BY p.name ASC
  `).all(tenantId) as any[];

  const scheduleCountRows = db.prepare(`
    SELECT professional_id, COUNT(*) as cnt
    FROM schedules
    WHERE tenant_id = ? AND is_active = 1
    GROUP BY professional_id
  `).all(tenantId) as Array<{ professional_id: string; cnt: number }>;
  const scheduleCountMap = new Map(scheduleCountRows.map(r => [r.professional_id, Number(r.cnt || 0)]));

  const linkMap = new Map<string, Set<string>>();
  const addLink = (profId: string | null | undefined, srvId: string | null | undefined) => {
    if (!profId || !srvId) return;
    if (!linkMap.has(profId)) linkMap.set(profId, new Set());
    linkMap.get(profId)!.add(srvId);
  };

  const primaryLinks = db.prepare(`
    SELECT id, professional_id FROM services WHERE tenant_id = ? AND professional_id IS NOT NULL
  `).all(tenantId) as Array<{ id: string; professional_id: string }>;
  for (const r of primaryLinks) addLink(r.professional_id, r.id);

  const psLinks = db.prepare(`
    SELECT ps.professional_id, ps.service_id
    FROM professional_services ps
    JOIN services s ON s.id = ps.service_id
    WHERE s.tenant_id = ?
  `).all(tenantId) as Array<{ professional_id: string; service_id: string }>;
  for (const r of psLinks) addLink(r.professional_id, r.service_id);

  const schedLinks = db.prepare(`
    SELECT DISTINCT professional_id, service_id
    FROM class_schedules
    WHERE tenant_id = ? AND active = 1 AND professional_id IS NOT NULL
  `).all(tenantId) as Array<{ professional_id: string; service_id: string }>;
  for (const r of schedLinks) addLink(r.professional_id, r.service_id);

  return rows.map((row) => {
    const modules = getAvailableModulesForProfessional(row.id, tenantId).map(m => m.code);
    const effectiveProfName =
      (!isGenericFallbackProfessionName(row.pr_name) ? row.pr_name : null) ||
      row.profession_name ||
      row.cu_profession_custom ||
      row.pr_name ||
      null;
    const canonical = resolveCanonicalProfession({
      id: row.profession_id,
      name: effectiveProfName,
      practiceAreas: row.practice_areas,
      registrationType: row.registration_type
    });

    const isPersonalId = PERSONAL_FITNESS_PROFESSION_IDS.has(String(row.profession_id || '').toLowerCase()) ||
      PERSONAL_FITNESS_PROFESSION_IDS.has(String(canonical.canonicalId || '').toLowerCase());
    const hasZemdaPersonalMod = modules.includes('ZemdaPersonal') || Number(row.zemda_personal_enabled) === 1 || canonical.commercialModule === 'ZemdaPersonal';
    const isFitnessText = isFitnessOrInstructorProfessionText(effectiveProfName || '') || isFitnessOrInstructorProfessionText(row.practice_areas || '');
    const isPersonalOrFitnessQualified = Boolean(hasZemdaPersonalMod || isPersonalId || isFitnessText);

    const role = String(row.cu_role || row.user_role || '').trim().toLowerCase() || null;
    const isAdminOnlyRole = (role === 'clinic_admin' || Number(row.cu_is_manager) === 1 || isAdminOnlyProfessionText(effectiveProfName || '')) &&
      !isPersonalOrFitnessQualified;

    const clinicalOnlyMods = modules.filter(m => m !== 'ZemdaPersonal' && m !== 'general');
    const isClinicalOnlyWithoutFitness = clinicalOnlyMods.length > 0 && !isPersonalOrFitnessQualified;

    return {
      id: row.id,
      name: row.name,
      professionId: row.profession_id || null,
      professionName: effectiveProfName,
      availableModules: modules,
      zemdaPersonalEnabled: Number(row.zemda_personal_enabled) === 1,
      userRole: role,
      inactiveMembership: Boolean(row.user_id && (row.deactivated_at || row.account_status !== 'active' ||
        (row.membership_status ? row.membership_status !== 'active' : row.home_tenant_id !== row.tenant_id))),
      studioPractitioner: isPersonalOrFitnessQualified || canonical.commercialModule === 'ZemdaFisio',
      isAdminManager: isAdminOnlyRole,
      isPersonalOrFitnessQualified,
      isClinicalOnlyWithoutFitness,
      hasActiveSchedule: (scheduleCountMap.get(row.id) || 0) > 0,
      publicBookingEnabled: Number(row.public_booking_enabled ?? 1) === 1,
      active: Number(row.active ?? 1) === 1,
      linkedServiceIds: Array.from(linkMap.get(row.id) || [])
    };
  });
}

function targetRequiresPersonalTrainerQualification(targetService: {
  name?: string | null;
  clinical_module?: string | null;
  modality_category?: string | null;
}): boolean {
  if (String(targetService.clinical_module || '').trim() === 'ZemdaPersonal') return true;
  const text = normalizeText(`${targetService.name || ''} ${targetService.modality_category || ''}`);
  return text.includes('personal') || text.includes('musculac') || text.includes('hipertrofia') || text.includes('preparacao fisica');
}

function canProfessionalDeliverTargetService(
  pro: AddonProfessionalSummary,
  targetService: {
    id: string;
    name?: string | null;
    studio_service_type: StudioServiceType;
    requires_appointment: number;
    clinical_module?: string | null;
    modality_category?: string | null;
  }
): boolean {
  if (!pro.active) return false;
  // Serviços não agendáveis não requerem instrutor específico vinculado
  if (targetService.studio_service_type === 'non_scheduled' || targetService.requires_appointment === 0) {
    return !pro.isAdminManager && !pro.isClinicalOnlyWithoutFitness;
  }

  // Para serviços agendáveis existentes: exige vínculo explícito com o serviço complementar
  if (!pro.linkedServiceIds.includes(targetService.id)) {
    return false;
  }

  // Se for acompanhamento de Personal Trainer, impede selecionar Gestor puro (sem atuação) ou profissional clínico não habilitado em Educação Física/Personal
  if (targetRequiresPersonalTrainerQualification(targetService)) {
    if (pro.isAdminManager && !pro.hasActiveSchedule && !pro.isPersonalOrFitnessQualified) {
      return false;
    }
    if (pro.isClinicalOnlyWithoutFitness && !pro.isPersonalOrFitnessQualified) {
      return false;
    }
  }

  // Para demais serviços de Studio agendáveis, Gestor sem escala e sem habilitação prática não é considerado instrutor automaticamente
  if (pro.isAdminManager && !pro.hasActiveSchedule && !pro.isPersonalOrFitnessQualified) {
    return false;
  }

  return true;
}

export function isProfessionalEligibleForAddonService(
  pro: AddonProfessionalSummary,
  targetService: {
    id: string;
    name?: string | null;
    studio_service_type: StudioServiceType;
    requires_appointment: number;
    clinical_module?: string | null;
    modality_category?: string | null;
  }
): boolean {
  return canProfessionalDeliverTargetService(pro, targetService);
}

export function listAddonCandidateServicesForTenant(
  tenantId: string,
  options: { excludeServiceId?: string | null } = {}
): {
  establishmentProfile: string;
  isStudioCompatible: boolean;
  services: AddonCandidateServiceSummary[];
  professionals: AddonProfessionalSummary[];
  excludedCount: number;
} {
  const establishmentProfile = getTenantEstablishmentProfile(tenantId);
  const isStudioCompatible = establishmentProfile === 'studio' || establishmentProfile === 'mixed';
  if (!isStudioCompatible) {
    return {
      establishmentProfile,
      isStudioCompatible: false,
      services: [],
      professionals: [],
      excludedCount: 0
    };
  }

  const professionals = listTenantAddonProfessionalsDetailed(tenantId);
  const rows = db.prepare(`
    SELECT
      id, name, active, service_domain, service_kind, studio_service_type,
      requires_appointment, default_capacity, duration_minutes, modality,
      modality_category, clinical_module, professional_id
    FROM services
    WHERE tenant_id = ?
    ORDER BY name ASC
  `).all(tenantId) as any[];

  const psRows = db.prepare(`
    SELECT ps.service_id, ps.professional_id
    FROM professional_services ps
    JOIN services s ON s.id = ps.service_id
    WHERE s.tenant_id = ?
  `).all(tenantId) as Array<{ service_id: string; professional_id: string }>;
  const psMap = new Map<string, Set<string>>();
  for (const r of psRows) {
    if (!psMap.has(r.service_id)) psMap.set(r.service_id, new Set());
    psMap.get(r.service_id)!.add(r.professional_id);
  }

  const csRows = db.prepare(`
    SELECT DISTINCT service_id, professional_id
    FROM class_schedules
    WHERE tenant_id = ? AND active = 1 AND professional_id IS NOT NULL
  `).all(tenantId) as Array<{ service_id: string; professional_id: string }>;
  const csMap = new Map<string, Set<string>>();
  for (const r of csRows) {
    if (!csMap.has(r.service_id)) csMap.set(r.service_id, new Set());
    csMap.get(r.service_id)!.add(r.professional_id);
  }

  const excludeId = String(options.excludeServiceId || '').trim() || null;
  let excludedCount = 0;
  const services: AddonCandidateServiceSummary[] = [];

  for (const row of rows) {
    if (excludeId && row.id === excludeId) continue;
    if (Number(row.active ?? 1) === 0) {
      excludedCount++;
      continue;
    }
    const domain = resolveServiceDomain({
      establishmentProfile,
      serviceDomain: row.service_domain,
      serviceKind: row.service_kind,
      clinicalModule: row.clinical_module
    });
    const isZemdaPersonalModule = String(row.clinical_module || '').trim() === 'ZemdaPersonal';
    if (domain !== 'studio' && !isZemdaPersonalModule) {
      excludedCount++;
      continue;
    }
    const studioType = normalizeStudioServiceType(row.studio_service_type, row.service_kind);
    // Serviços de acesso livre/limitado não possuem agenda profissional e NÃO são complementos agendáveis
    if (studioType === 'facility_access') {
      excludedCount++;
      continue;
    }
    const reqAppt = studioType === 'non_scheduled' ? 0 : (Number(row.requires_appointment ?? 1) === 0 ? 0 : 1);
    const linkedSet = new Set<string>();
    if (row.professional_id) linkedSet.add(row.professional_id);
    for (const pid of psMap.get(row.id) || []) linkedSet.add(pid);
    for (const pid of csMap.get(row.id) || []) linkedSet.add(pid);

    const eligiblePros = professionals.filter(p =>
      canProfessionalDeliverTargetService(p, {
        id: row.id,
        name: row.name,
        studio_service_type: studioType,
        requires_appointment: reqAppt,
        clinical_module: row.clinical_module,
        modality_category: row.modality_category
      })
    );

    services.push({
      id: row.id,
      name: row.name,
      active: true,
      service_domain: 'studio',
      studio_service_type: studioType,
      service_kind: (row.service_kind === 'group' ? 'group' : 'individual'),
      requires_appointment: reqAppt,
      is_schedulable: reqAppt === 1,
      default_capacity: row.default_capacity !== null && row.default_capacity !== undefined ? Number(row.default_capacity) : null,
      duration_minutes: Number(row.duration_minutes || 0),
      modality: row.modality || 'presential',
      modality_category: row.modality_category || null,
      clinical_module: row.clinical_module || null,
      professional_id: row.professional_id || null,
      linked_professional_ids: Array.from(linkedSet),
      eligible_professional_ids: eligiblePros.map(p => p.id),
      eligible_professionals: eligiblePros.map(p => ({
        id: p.id,
        name: p.name,
        profession_name: p.professionName,
        public_booking_enabled: p.publicBookingEnabled,
        has_active_schedule: p.hasActiveSchedule
      }))
    });
  }

  return {
    establishmentProfile,
    isStudioCompatible,
    services,
    professionals: professionals.filter(p => p.active),
    excludedCount
  };
}
