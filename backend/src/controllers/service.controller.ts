import { individualStudioMeetings } from '../services/studio-individual-meetings.service';
import { supportsStudioFeatures } from '../utils/establishment-context';
import { normalizeFrequencyPricing, readFrequencyPricing, supportsFrequencyPricing } from '../utils/studio-frequency-pricing';
import {
  diagnoseServiceAvailability,
  listServiceAvailabilityWindows,
  listServiceAvailabilityWindowsGrouped,
  normalizeAndValidateServiceAvailability,
  saveServiceAvailabilityWindowsTx,
  ServiceAvailabilityMode
} from '../utils/service-availability';
import { ConsentService } from '../services/consent.service';
import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';
import { getAvailableModulesForProfessional, isPrimaryClinicalModule } from '../utils/clinical-module';
import { ClassScheduleService, buildWeeklyScheduleSummary } from '../services/class-schedule.service';
import { PackageService } from '../services/package.service';
import {
  getTenantEstablishmentProfile,
  normalizeRecurrenceConfigForSave,
  normalizeServiceBillingForSave,
  parseServiceBillingConfig,
  parseServiceRecurrenceConfig,
  resolveServiceDomain,
  ServiceDomain
} from '../utils/establishment-context';
import {
  isProfessionalEligibleForAddonService,
  listAddonCandidateServicesForTenant,
  listTenantAddonProfessionalsDetailed
} from '../utils/studio-addon-eligibility';
import {
  addonAppliesToBaseOption,
  buildFallbackBaseCommercialOption,
  calculateCommercialOptionBreakdown,
  calculatePlanWithAddonsBreakdown,
  evaluateStudioPriceAdjustments,
  getDefaultOptionalAddonsConfig,
  hydrateOptionalAddonsConfig,
  normalizeCommercialPriceOptions,
  normalizeOptionalAddonsConfig,
  normalizeStudioAccessConfig,
  normalizeStudioPriceAdjustments,
  normalizeStudioServiceType,
  OptionalAddonTargetSummary,
  StudioOptionalAddonsConfig,
  StudioServiceType
} from '../utils/studio-access-and-commercial';

function validateAndHydrateOptionalAddonsForSave(params: {
  tenantId: string;
  establishmentProfile: string;
  isStudioCompat: boolean;
  serviceDomain: ServiceDomain;
  selfServiceId?: string | null;
  rawOptionalAddons: unknown;
}): { error?: string; config: StudioOptionalAddonsConfig | null; configJson: string | null } {
  const { tenantId, establishmentProfile, isStudioCompat, serviceDomain, selfServiceId, rawOptionalAddons } = params;
  if (rawOptionalAddons === undefined) {
    return { config: null, configJson: null };
  }

  const parsed = normalizeOptionalAddonsConfig(rawOptionalAddons);
  if (!isStudioCompat || serviceDomain !== 'studio') {
    if (parsed.enabled || parsed.options.length > 0) {
      return { error: 'Complementos opcionais de planos estão disponíveis apenas para serviços do domínio Academia & Studio.', config: null, configJson: null };
    }
    return { config: null, configJson: null };
  }

  // Se complementos foram desativados, descartar rascunhos incompletos (sem addonServiceId) para não bloquear salvamento
  if (!parsed.enabled) {
    parsed.options = parsed.options.filter((opt) => Boolean(opt.addonServiceId && String(opt.addonServiceId).trim()));
    if (parsed.options.length === 0) {
      return { config: parsed, configJson: null };
    }
  } else if (parsed.options.length === 0) {
    return {
      error: 'Adicione ao menos um serviço complementar vinculado antes de ativar os complementos opcionais (ou desative a opção).',
      config: null,
      configJson: null
    };
  }

  const lookupStmt = db.prepare(`
    SELECT id, name, active, service_kind, service_domain, clinical_module, modality_category,
           COALESCE(studio_service_type, CASE WHEN COALESCE(service_kind, 'individual') = 'group' THEN 'group' ELSE 'individual' END) as studio_service_type,
           COALESCE(requires_appointment, 1) as requires_appointment
    FROM services
    WHERE id = ? AND tenant_id = ?
  `);
  const tenantProsDetailed = listTenantAddonProfessionalsDetailed(tenantId);
  const detailedProById = new Map(tenantProsDetailed.map((pro) => [pro.id, pro]));

  for (const opt of parsed.options) {
    if (!opt.addonServiceId) {
      return { error: `Selecione o serviço vinculado para o complemento "${opt.label}", crie um serviço complementar ou remova a opção incompleta.`, config: null, configJson: null };
    }
    if (selfServiceId && opt.addonServiceId === selfServiceId) {
      return { error: 'Um serviço não pode ser configurado como complemento opcional de si mesmo.', config: null, configJson: null };
    }
    const targetSrv = lookupStmt.get(opt.addonServiceId, tenantId) as any;
    if (!targetSrv) {
      return { error: `Serviço complementar vinculado (${opt.label}) não encontrado neste estabelecimento.`, config: null, configJson: null };
    }
    const targetDomain = resolveServiceDomain({
      establishmentProfile,
      serviceDomain: targetSrv.service_domain,
      serviceKind: targetSrv.service_kind,
      clinicalModule: targetSrv.clinical_module
    });
    const isTargetPersonalModule = String(targetSrv.clinical_module || '').trim() === 'ZemdaPersonal';
    if (targetDomain !== 'studio' && !isTargetPersonalModule) {
      return { error: `Somente serviços do domínio Academia & Studio podem ser vinculados como complemento opcional (${targetSrv.name}).`, config: null, configJson: null };
    }
    if (parsed.enabled && opt.active && Number(targetSrv.active) === 0) {
      return { error: `O serviço complementar "${targetSrv.name}" está inativo. Ative-o antes de habilitá-lo como complemento.`, config: null, configJson: null };
    }
    const targetStudioType = normalizeStudioServiceType(targetSrv.studio_service_type, targetSrv.service_kind);
    if (targetStudioType === 'facility_access') {
      return {
        error: `O serviço "${targetSrv.name}" é de acesso à academia e não pode ser vinculado como complemento opcional. Vincule um serviço agendável ou avaliação.`,
        config: null,
        configJson: null
      };
    }
    const targetRequiresAppt =
      targetStudioType === 'non_scheduled'
        ? 0
        : Number(targetSrv.requires_appointment ?? 1);
    opt.addonServiceName = targetSrv.name;
    opt.addonServiceType = targetStudioType;
    if (targetRequiresAppt === 0) {
      opt.scheduleTiming = 'not_applicable';
      opt.studentCanChooseSchedule = false;
    } else {
      if (opt.scheduleTiming === 'not_applicable') {
        opt.scheduleTiming = 'after_confirmation';
      }
      opt.studentCanChooseSchedule = opt.scheduleTiming === 'during_purchase';
    }
    if (opt.attendanceFormat === 'duo') {
      opt.sessionCapacity = 2;
    } else if (opt.attendanceFormat === 'individual') {
      opt.sessionCapacity = 1;
    } else if (opt.attendanceFormat === 'group' && (!opt.sessionCapacity || opt.sessionCapacity < 2)) {
      return {
        error: `Para o complemento "${opt.label}" em pequeno grupo/turma, informe uma capacidade mínima de 2 alunos por sessão.`,
        config: null,
        configJson: null
      };
    }
    if (Array.isArray(opt.enabledProfessionalIds) && opt.enabledProfessionalIds.length > 0) {
      const targetEligibilityRef = {
        id: targetSrv.id,
        name: targetSrv.name,
        studio_service_type: targetStudioType,
        requires_appointment: targetRequiresAppt,
        clinical_module: targetSrv.clinical_module || null,
        modality_category: targetSrv.modality_category || null
      };
      for (const pid of opt.enabledProfessionalIds) {
        const proDetail = detailedProById.get(pid);
        if (!proDetail) {
          return {
            error: `Um dos profissionais selecionados no complemento "${opt.label}" não pertence a este estabelecimento.`,
            config: null,
            configJson: null
          };
        }
        if (!proDetail.active) {
          return {
            error: `O profissional "${proDetail.name}" está inativo e não pode ser habilitado no complemento "${opt.label}".`,
            config: null,
            configJson: null
          };
        }
        if (!isProfessionalEligibleForAddonService(proDetail, targetEligibilityRef)) {
          const reason = proDetail.isAdminManager
            ? `O usuário administrativo "${proDetail.name}" não está habilitado como instrutor para "${targetSrv.name}".`
            : proDetail.isClinicalOnlyWithoutFitness
              ? `O profissional clínico "${proDetail.name}" não possui habilitação compatível com "${targetSrv.name}".`
              : !proDetail.linkedServiceIds.includes(targetSrv.id)
                ? `O profissional "${proDetail.name}" não está vinculado ao serviço "${targetSrv.name}". Vincule-o ao serviço complementar primeiro.`
                : `O profissional "${proDetail.name}" não é elegível para "${targetSrv.name}".`;
          return {
            error: reason,
            config: null,
            configJson: null
          };
        }
      }
    }
  }

  return {
    config: parsed,
    configJson: JSON.stringify(parsed)
  };
}

function frequencyConfigForSave(raw: unknown, profile: string, domain: string, mode: unknown, studioServiceType?: StudioServiceType) {
  try {
    const config = normalizeFrequencyPricing(raw);
    if (config && (!supportsStudioFeatures(profile) || domain !== 'studio')) throw new Error('Preços por frequência estão disponíveis apenas no perfil Academia & Studio.');
    if (config?.enabled && !supportsFrequencyPricing(mode) && studioServiceType !== 'facility_access') throw new Error('Preços por frequência exigem aulas com grade e cobrança periódica compatível.');
    return config;
  } catch (error: any) { throw Object.assign(error, { status: 400 }); }
}

export interface LinkedProfessionalSummary {
  id: string;
  name: string;
  profession_name: string | null;
  active: number;
  public_booking_enabled: number;
  is_primary: boolean;
}

function parseLinkedInstructorIds(body: any): string[] | undefined {
  const raw = body?.linkedProfessionalIds !== undefined ? body.linkedProfessionalIds : body?.linked_professional_ids;
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw Object.assign(new Error('Lista de instrutores vinculados inválida.'), { status: 400 });
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const id = String(item || '').trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function getLinkedProfessionalsMap(
  tenantId: string,
  primaryByService: Map<string, string | null>
): Map<string, LinkedProfessionalSummary[]> {
  const rows = db.prepare(`
    SELECT DISTINCT
      s.id as service_id,
      p.id as id,
      p.name as name,
      COALESCE(pr.name, p.profession_name) as profession_name,
      p.active as active,
      p.public_booking_enabled as public_booking_enabled,
      CASE WHEN s.professional_id = p.id THEN 1 ELSE 0 END as is_primary
    FROM services s
    JOIN professionals p
      ON p.tenant_id = s.tenant_id
     AND (
       p.id = s.professional_id
       OR EXISTS (
         SELECT 1 FROM professional_services ps
         WHERE ps.service_id = s.id AND ps.professional_id = p.id
       )
       OR EXISTS (
         SELECT 1 FROM class_schedules cs
         WHERE cs.service_id = s.id AND cs.tenant_id = s.tenant_id AND cs.professional_id = p.id AND cs.active = 1
       )
     )
    LEFT JOIN professions pr ON pr.id = p.profession_id
    WHERE s.tenant_id = ?
    ORDER BY is_primary DESC, p.name ASC
  `).all(tenantId) as Array<Omit<LinkedProfessionalSummary, 'is_primary'> & { service_id: string; is_primary: number }>;

  const map = new Map<string, LinkedProfessionalSummary[]>();
  for (const row of rows) {
    const list = map.get(row.service_id) || [];
    if (!list.some(x => x.id === row.id)) {
      const primaryId = primaryByService.get(row.service_id) || null;
      list.push({
        id: row.id,
        name: row.name,
        profession_name: row.profession_name || null,
        active: Number(row.active ?? 1),
        public_booking_enabled: Number(row.public_booking_enabled ?? 1),
        is_primary: primaryId ? row.id === primaryId : Boolean(row.is_primary)
      });
      map.set(row.service_id, list);
    }
  }
  return map;
}

function validateAndSyncLinkedInstructorsTx(params: {
  tenantId: string;
  serviceId: string;
  primaryProfId: string | null;
  requestedIds: string[] | undefined;
  isStudioCompat: boolean;
  serviceDomain: ServiceDomain;
  price: number | null;
  durationMinutes: number | null;
  isUpdate: boolean;
  preserveExistingTerms?: boolean;
  clearIfNoPrimary?: boolean;
}): void {
  const {
    tenantId,
    serviceId,
    primaryProfId,
    requestedIds,
    isStudioCompat,
    serviceDomain,
    price,
    durationMinutes,
    isUpdate,
    preserveExistingTerms,
    clearIfNoPrimary
  } = params;

  const existingLinkedRows = db
    .prepare(`
      SELECT ps.professional_id
      FROM professional_services ps
      JOIN professionals p ON p.id = ps.professional_id AND p.tenant_id = ?
      WHERE ps.service_id = ?
    `)
    .all(tenantId, serviceId) as Array<{ professional_id: string }>;
  const existingSet = new Set(existingLinkedRows.map(r => r.professional_id));

  let desiredIds: string[] | null = null;
  if (requestedIds !== undefined) {
    if (!isStudioCompat || serviceDomain === 'clinical') {
      const hasExtraBeyondPrimary = requestedIds.some(pid => pid !== primaryProfId);
      if (hasExtraBeyondPrimary) {
        throw Object.assign(
          new Error('Vínculo de múltiplos instrutores está disponível apenas para serviços do segmento Studio.'),
          { status: 400, code: 'MULTI_INSTRUCTOR_NOT_ALLOWED' }
        );
      }
    }
    desiredIds = Array.from(new Set([primaryProfId, ...requestedIds].filter(Boolean) as string[]));
  } else if (clearIfNoPrimary && !primaryProfId) {
    desiredIds = [];
  } else if (!isUpdate && primaryProfId) {
    desiredIds = [primaryProfId];
  } else if (isUpdate && primaryProfId) {
    if (preserveExistingTerms && existingSet.has(primaryProfId)) return;
    // Se não enviou linkedProfessionalIds explicitamente no PUT, garante o responsável na tabela sem remover extras existentes
    db.prepare(`
      INSERT INTO professional_services (id, professional_id, service_id, custom_price, custom_duration)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(professional_id, service_id) DO UPDATE SET
        custom_price = excluded.custom_price,
        custom_duration = excluded.custom_duration
    `).run('ps-' + uuidv4().slice(0, 8), primaryProfId, serviceId, price, durationMinutes);
    return;
  }

  if (!desiredIds) return;

  for (const pid of desiredIds) {
    const profRow = db
      .prepare('SELECT id, name, active FROM professionals WHERE id = ? AND tenant_id = ?')
      .get(pid, tenantId) as { id: string; name: string; active: number } | undefined;
    if (!profRow) {
      throw Object.assign(
        new Error('Instrutor selecionado não pertence a este estabelecimento.'),
        { status: 400, code: 'CROSS_TENANT_OR_MISSING_INSTRUCTOR' }
      );
    }
    if (!existingSet.has(pid) && Number(profRow.active) !== 1) {
      throw Object.assign(
        new Error(`O instrutor "${profRow.name}" está inativo e não pode ser vinculado ao serviço.`),
        { status: 400, code: 'INACTIVE_INSTRUCTOR' }
      );
    }
  }

  if (isUpdate) {
    const removedIds = Array.from(existingSet).filter(eid => !desiredIds!.includes(eid));
    const nowLocalIso = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(new Date()).replace(' ', 'T');

    for (const remId of removedIds) {
      const activeScheduleCount = (
        db
          .prepare('SELECT COUNT(*) as c FROM class_schedules WHERE tenant_id = ? AND service_id = ? AND professional_id = ? AND active = 1')
          .get(tenantId, serviceId, remId) as { c: number }
      ).c;
      if (activeScheduleCount > 0) {
        const remProf = db.prepare('SELECT name FROM professionals WHERE id = ?').get(remId) as { name?: string } | undefined;
        throw Object.assign(
          new Error(
            `Não é possível desvincular ${remProf?.name || 'este instrutor'} porque ele possui ${activeScheduleCount} horário(s) ativo(s) na grade semanal desta aula. Altere ou pause o horário primeiro.`
          ),
          { status: 409, code: 'INSTRUCTOR_HAS_ACTIVE_SCHEDULES' }
        );
      }

      const futureApptCount = (
        db
          .prepare(`
            SELECT COUNT(*) as c FROM appointments
            WHERE tenant_id = ? AND service_id = ? AND professional_id = ?
              AND status NOT IN ('cancelled', 'no_show', 'completed')
              AND REPLACE(start_time, ' ', 'T') >= ?
          `)
          .get(tenantId, serviceId, remId, nowLocalIso) as { c: number }
      ).c;
      if (futureApptCount > 0) {
        const remProf = db.prepare('SELECT name FROM professionals WHERE id = ?').get(remId) as { name?: string } | undefined;
        throw Object.assign(
          new Error(
            `Não é possível desvincular ${remProf?.name || 'este instrutor'} porque há ${futureApptCount} aula(s) futura(s) agendada(s) com ele neste serviço.`
          ),
          { status: 409, code: 'INSTRUCTOR_HAS_FUTURE_BOOKINGS' }
        );
      }

      db.prepare('DELETE FROM professional_services WHERE service_id = ? AND professional_id = ?').run(serviceId, remId);
    }
  }

  for (const pid of desiredIds) {
    if (preserveExistingTerms && existingSet.has(pid)) continue;
    db.prepare(`
      INSERT INTO professional_services (id, professional_id, service_id, custom_price, custom_duration)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(professional_id, service_id) DO UPDATE SET
        custom_price = CASE WHEN ? = 1 OR professional_services.custom_price IS NULL OR professional_services.custom_price = 0 THEN excluded.custom_price ELSE professional_services.custom_price END,
        custom_duration = CASE WHEN ? = 1 THEN excluded.custom_duration ELSE professional_services.custom_duration END
    `).run(
      'ps-' + uuidv4().slice(0, 8),
      pid,
      serviceId,
      price,
      durationMinutes,
      pid === primaryProfId ? 1 : 0,
      pid === primaryProfId ? 1 : 0
    );
  }
}

export interface LinkedTemplateSummary {
  id: string;
  title: string;
  structure_type: string;
  description: string | null;
  exercises_count: number;
}

function normalizeServiceTemplatesForSave(params: {
  tenantId: string;
  isStudioService: boolean;
  defaultTemplateId?: unknown;
  linkedTemplateIds?: unknown;
}): {
  defaultTemplateId: string | null;
  linkedTemplateIds: string[];
  linkedTemplateIdsJson: string | null;
  error?: string;
} {
  if (!params.isStudioService) {
    return { defaultTemplateId: null, linkedTemplateIds: [], linkedTemplateIdsJson: null };
  }

  let requestedIds: string[] = [];
  if (Array.isArray(params.linkedTemplateIds)) {
    requestedIds = params.linkedTemplateIds.map(x => String(x || '').trim()).filter(Boolean);
  } else if (typeof params.linkedTemplateIds === 'string' && params.linkedTemplateIds.trim()) {
    try {
      const parsed = JSON.parse(params.linkedTemplateIds);
      if (Array.isArray(parsed)) {
        requestedIds = parsed.map(x => String(x || '').trim()).filter(Boolean);
      }
    } catch {
      requestedIds = [];
    }
  }

  const rawDefault = params.defaultTemplateId !== undefined && params.defaultTemplateId !== null
    ? String(params.defaultTemplateId).trim()
    : '';

  if (rawDefault && !requestedIds.includes(rawDefault)) {
    requestedIds = [rawDefault, ...requestedIds];
  }
  const uniqueIds = Array.from(new Set(requestedIds));

  for (const tplId of uniqueIds) {
    const row = db.prepare(`SELECT id FROM personal_workout_templates WHERE id = ? AND tenant_id = ?`).get(tplId, params.tenantId);
    if (!row) {
      return {
        defaultTemplateId: null,
        linkedTemplateIds: [],
        linkedTemplateIdsJson: null,
        error: 'Template de exercícios selecionado não pertence a este estabelecimento.'
      };
    }
  }

  const finalDefault = rawDefault || (uniqueIds.length > 0 ? uniqueIds[0] : null);
  return {
    defaultTemplateId: finalDefault,
    linkedTemplateIds: uniqueIds,
    linkedTemplateIdsJson: uniqueIds.length > 0 ? JSON.stringify(uniqueIds) : null
  };
}

function getTenantTemplatesMap(tenantId: string): Map<string, LinkedTemplateSummary> {
  const map = new Map<string, LinkedTemplateSummary>();
  try {
    const rows = db.prepare(`
      SELECT id, title, structure_type, description, workouts_json
      FROM personal_workout_templates
      WHERE tenant_id = ?
    `).all(tenantId) as any[];
    for (const r of rows) {
      let exCount = 0;
      try {
        const wks = JSON.parse(r.workouts_json || '[]');
        if (Array.isArray(wks)) {
          for (const w of wks) {
            if (Array.isArray(w?.exercises)) exCount += w.exercises.length;
          }
        }
      } catch {}
      map.set(r.id, {
        id: r.id,
        title: r.title || 'Template',
        structure_type: r.structure_type || 'ABC',
        description: r.description || null,
        exercises_count: exCount
      });
    }
  } catch {}
  return map;
}

function enrichServiceTemplates(srv: any, templatesMap: Map<string, LinkedTemplateSummary>, isStudioService: boolean) {
  if (!isStudioService) {
    return {
      default_template_id: null,
      default_template_title: null,
      linked_template_ids: [] as string[],
      linked_templates: [] as LinkedTemplateSummary[]
    };
  }
  let ids: string[] = [];
  if (typeof srv.linked_template_ids_json === 'string' && srv.linked_template_ids_json.trim()) {
    try {
      const parsed = JSON.parse(srv.linked_template_ids_json);
      if (Array.isArray(parsed)) ids = parsed.map(x => String(x || '').trim()).filter(Boolean);
    } catch {}
  }
  const defId = srv.default_template_id ? String(srv.default_template_id).trim() : null;
  if (defId && !ids.includes(defId)) {
    ids = [defId, ...ids];
  }
  const validIds = ids.filter(id => templatesMap.has(id));
  const validTemplates = validIds.map(id => templatesMap.get(id)!);
  const resolvedDefId = defId && templatesMap.has(defId) ? defId : (validIds[0] || null);
  return {
    default_template_id: resolvedDefId,
    default_template_title: resolvedDefId ? (templatesMap.get(resolvedDefId)?.title || null) : null,
    linked_template_ids: validIds,
    linked_templates: validTemplates
  };
}

export interface ServiceSaveResponse {
  status(code: number): ServiceSaveResponse;
  json(body: any): unknown;
}

export class ServiceController {
  static frequencyMeetings(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId!;
      const profile = getTenantEstablishmentProfile(tenantId);
      const domain = resolveServiceDomain({ establishmentProfile: profile, serviceDomain: req.body.serviceDomain, serviceKind: 'individual' });
      if (!supportsStudioFeatures(profile) || domain !== 'studio') { res.status(400).json({ error: 'Disponível somente para serviços Studio.' }); return; }
      const duration = Number(req.body.durationMinutes), buffer = Number(req.body.bufferMinutes ?? 0);
      if (!Number.isInteger(duration) || duration < 1 || duration > 1440 || !Number.isInteger(buffer) || buffer < 0 || buffer > 1440) { res.status(400).json({ error: 'Duração ou intervalo inválido.' }); return; }
      const ids = Array.isArray(req.body.professionalIds) ? req.body.professionalIds.filter((id: unknown) => typeof id === 'string') : [];
      const allowedWeekdays = Array.isArray(req.body.allowedWeekdays) ? req.body.allowedWeekdays.map(Number).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6) : undefined;
      const rawAvailabilityMode = (req.body.availabilityMode ?? req.body.availability_mode) === 'custom_windows'
        ? 'custom_windows'
        : 'professional_schedule';
      const rawAvailabilityWindows = Array.isArray(req.body.availabilityWindows ?? req.body.availability_windows)
        ? (req.body.availabilityWindows ?? req.body.availability_windows)
        : undefined;
      const startDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + 7 * 86400000));
      const meetings = individualStudioMeetings({
        tenantId,
        professionalIds: ids,
        startDate,
        allowedWeekdays,
        draft: {
          duration_minutes: duration,
          buffer_minutes: buffer,
          modality: req.body.modality || 'presential',
          service_kind: 'individual',
          service_domain: domain,
          availability_mode: rawAvailabilityMode,
          availability_windows: rawAvailabilityWindows,
          active: 1,
          min_lead_time_hours: 0,
          max_advance_days: 60
        }
      });
      res.json({ meetings, startDate });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
  }

  static list(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      if (typeof req.query.consentModule === 'string') {
        res.json(ConsentService.compatibleServices(req, req.query.consentModule, typeof req.query.consentProfessionId === 'string' ? req.query.consentProfessionId : ''));
        return;
      }
      const { professionalId } = req.query;

      let query = `
        SELECT 
          s.id, s.tenant_id, s.professional_id, s.specialty_id, s.name, s.description,
          COALESCE(ps.custom_duration, s.duration_minutes) as duration_minutes,
          s.buffer_minutes,
          COALESCE(
            CASE WHEN ps.custom_price > 0 THEN ps.custom_price ELSE NULL END,
            CASE WHEN s.price > 0 THEN s.price ELSE NULL END,
            CASE WHEN s.periodic_price > 0 THEN s.periodic_price ELSE NULL END,
            s.price,
            0
          ) as price,
          s.price as catalog_base_price,
          s.modality, s.active,
          COALESCE(s.service_kind, 'individual') as service_kind,
          s.default_capacity,
          COALESCE(s.allow_recurrence, 1) as allow_recurrence,
          s.allowed_recurrence_frequencies_json,
          s.allowed_recurrence_weekdays_json,
          s.default_recurrence_frequency,
          s.allowed_plan_durations_json,
          s.default_plan_duration,
          s.custom_recurrence_intervals_json,
          s.default_recurrence_interval_json,
          s.billing_mode,
          s.periodic_price,
          s.billing_cycle_months,
          s.default_package_id,
          s.default_billing_due_day,
          s.pricing_rule,
          s.is_price_customized,
          s.suggested_price,
          s.weekly_sessions_count,
          s.frequency_pricing_json,
          pkg.name as default_package_name,
          s.default_template_id,
          s.linked_template_ids_json,
          s.service_domain,
          COALESCE(s.studio_service_type, CASE WHEN COALESCE(s.service_kind, 'individual') = 'group' THEN 'group' ELSE 'individual' END) as studio_service_type,
          COALESCE(s.requires_appointment, 1) as requires_appointment,
          COALESCE(s.requires_active_contract, 0) as requires_active_contract,
          COALESCE(s.allow_public_booking, 1) as allow_public_booking,
          s.effective_start_date,
          s.effective_end_date,
          s.access_config_json,
          s.pricing_adjustments_json,
          s.commercial_price_options_json,
          s.optional_addons_json,
          COALESCE(s.availability_mode, 'professional_schedule') as availability_mode,
          s.modality_category,
          s.min_lead_time_hours, s.max_advance_days, s.cancellation_policy,
          s.reminder_enabled, s.reminder_value, s.reminder_unit,
          s.clinical_module,
          p.name as professional_name,
          COALESCE(prof.name, p.profession_name) as profession_name,
          spec.name as specialty_name, spec.color as specialty_color
        FROM services s
        LEFT JOIN professionals p ON p.id = s.professional_id
        LEFT JOIN professions prof ON prof.id = p.profession_id
        LEFT JOIN specialties spec ON spec.id = s.specialty_id
        LEFT JOIN service_packages pkg ON pkg.id = s.default_package_id AND pkg.tenant_id = s.tenant_id
        LEFT JOIN professional_services ps ON ps.service_id = s.id AND ps.professional_id = COALESCE(?, s.professional_id)
        WHERE s.tenant_id = ?
      `;

      const params: any[] = [professionalId || null, tenantId];
      if (professionalId) {
        query += ` AND (s.professional_id = ? OR s.professional_id IS NULL OR ps.professional_id = ?)`;
        params.push(professionalId, professionalId);
      }

      query += ` ORDER BY COALESCE(p.name, 'zzz') ASC, s.name ASC`;
      const stmt = db.prepare(query);
      const services = stmt.all(...params) as any[];
      const establishmentProfile = getTenantEstablishmentProfile(tenantId);
      const isStudioCompat = establishmentProfile === 'studio' || establishmentProfile === 'mixed';
      const schedulesByService = isStudioCompat
        ? ClassScheduleService.listByTenantGrouped(tenantId, { includeInactive: true })
        : new Map();
      const primaryByService = new Map<string, string | null>(services.map(s => [s.id, s.professional_id || null]));
      const linkedByService = isStudioCompat
        ? getLinkedProfessionalsMap(tenantId, primaryByService)
        : new Map<string, LinkedProfessionalSummary[]>();
      const templatesMap = isStudioCompat ? getTenantTemplatesMap(tenantId) : new Map<string, LinkedTemplateSummary>();
      const availWindowsByService = isStudioCompat
        ? listServiceAvailabilityWindowsGrouped(tenantId)
        : new Map();
      const addonTargetsById = new Map<string, OptionalAddonTargetSummary>();
      if (isStudioCompat) {
        const targetSourceRows = professionalId
          ? (db.prepare(`
              SELECT s.id, s.name, s.active, COALESCE(s.allow_public_booking, 1) as allow_public_booking,
                     COALESCE(s.service_kind, 'individual') as service_kind,
                     COALESCE(s.studio_service_type, CASE WHEN COALESCE(s.service_kind, 'individual') = 'group' THEN 'group' ELSE 'individual' END) as studio_service_type,
                     COALESCE(s.requires_appointment, 1) as requires_appointment,
                     s.professional_id
              FROM services s
              WHERE s.tenant_id = ?
            `).all(tenantId) as any[])
          : services;
        const targetPrimaryMap = new Map<string, string | null>(targetSourceRows.map(r => [r.id, r.professional_id || null]));
        const targetLinkedMap = professionalId ? getLinkedProfessionalsMap(tenantId, targetPrimaryMap) : linkedByService;
        const activeProfRows = db.prepare(`SELECT id, active, public_booking_enabled FROM professionals WHERE tenant_id = ?`).all(tenantId) as Array<{ id: string; active: number; public_booking_enabled: number }>;
        const profStatusMap = new Map(activeProfRows.map(p => [p.id, p]));
        for (const r of targetSourceRows) {
          const stType = normalizeStudioServiceType(r.studio_service_type, r.service_kind);
          const reqAppt = stType === 'facility_access' || stType === 'non_scheduled' ? false : Number(r.requires_appointment ?? 1) !== 0;
          const isGroup = (r.service_kind || 'individual') === 'group' && reqAppt;
          const tLinked = targetLinkedMap.get(r.id) || [];
          const activeIds = new Set<string>();
          const publicIds = new Set<string>();
          for (const lp of tLinked) {
            if (Number(lp.active) === 1) {
              activeIds.add(lp.id);
              if (Number(lp.public_booking_enabled ?? 1) === 1) publicIds.add(lp.id);
            }
          }
          if (r.professional_id) {
            const pStat = profStatusMap.get(r.professional_id);
            if (!pStat || Number(pStat.active) === 1) {
              activeIds.add(r.professional_id);
              if (!pStat || Number(pStat.public_booking_enabled ?? 1) === 1) publicIds.add(r.professional_id);
            }
          }
          const tScheds = schedulesByService.get(r.id) || [];
          const activeScheds = tScheds.filter((sc: any) => Number(sc.active) !== 0);
          addonTargetsById.set(r.id, {
            id: r.id,
            name: r.name,
            active: Number(r.active) !== 0,
            allowPublicBooking: Number(r.allow_public_booking ?? 1) !== 0,
            studioServiceType: stType,
            requiresAppointment: reqAppt,
            isGroup,
            hasInstructor: activeIds.size > 0,
            hasSchedule: !isGroup || activeScheds.length > 0,
            professionalIds: Array.from(activeIds),
            publicProfessionalIds: Array.from(publicIds)
          });
        }
      }

      const enriched = services.map(srv => {
        const resolvedDomain = resolveServiceDomain({
          establishmentProfile,
          serviceDomain: srv.service_domain,
          serviceKind: srv.service_kind,
          clinicalModule: srv.clinical_module
        });
        if (!isStudioCompat) {
          return {
            ...srv,
            catalog_price: Number(srv.price || 0),
            service_kind: 'individual',
            studio_service_type: 'individual',
            requires_appointment: 1,
            requires_active_contract: 0,
            allow_public_booking: 1,
            effective_start_date: null,
            effective_end_date: null,
            access_config: null,
            pricing_adjustments: [],
            commercial_price_options: [],
            optional_addons: null,
            default_capacity: null,
            service_domain: 'clinical',
            billing_mode: 'per_session',
            periodic_price: null,
            billing_cycle_months: null,
            default_package_id: null,
            default_package_name: null,
            default_billing_due_day: null,
            pricing_rule: 'four_weeks',
            is_price_customized: 0,
            suggested_price: null,
            weekly_sessions_count: 1,
            default_template_id: null,
            default_template_title: null,
            linked_template_ids: [],
            linked_templates: [],
            allowed_recurrence_frequencies: undefined,
            allowed_recurrence_weekdays: undefined,
            default_recurrence_frequency: null,
            custom_recurrence_intervals: undefined,
            default_recurrence_interval: null,
            linked_professional_ids: srv.professional_id ? [srv.professional_id] : [],
            linked_professionals: [],
            class_schedules: [],
            weekly_schedule_summary: [],
            schedule_diagnostics: null,
            availability_mode: 'professional_schedule',
            availability_windows: [],
            availability_diagnostics: null
          };
        }
        const schedules = schedulesByService.get(srv.id) || [];
        const recConfig = parseServiceRecurrenceConfig(srv);
        const resolvedStudioType = resolvedDomain === 'studio'
          ? normalizeStudioServiceType(srv.studio_service_type, srv.service_kind)
          : 'individual';
        const resolvedRequiresAppt =
          resolvedDomain === 'studio' && (resolvedStudioType === 'facility_access' || resolvedStudioType === 'non_scheduled')
            ? 0
            : (Number(srv.requires_appointment ?? 1) === 0 && resolvedDomain === 'studio' ? 0 : 1);
        const accessConfig =
          resolvedDomain === 'studio' && resolvedStudioType === 'facility_access'
            ? normalizeStudioAccessConfig(srv.access_config_json)
            : null;
        const pricingAdjustments =
          resolvedDomain === 'studio'
            ? normalizeStudioPriceAdjustments(srv.pricing_adjustments_json)
            : [];
        const commercialPriceOptions =
          resolvedDomain === 'studio'
            ? normalizeCommercialPriceOptions(srv.commercial_price_options_json)
            : [];
        const optionalAddons =
          resolvedDomain === 'studio'
            ? hydrateOptionalAddonsConfig(srv.optional_addons_json, addonTargetsById)
            : null;
        const billConfig = resolvedDomain === 'studio'
          ? parseServiceBillingConfig(srv)
          : {
              billingMode: 'per_session' as const,
              periodicPrice: null,
              billingCycleMonths: null,
              defaultPackageId: null,
              defaultBillingDueDay: null,
              pricingRule: 'four_weeks' as const,
              isPriceCustomized: false,
              suggestedPrice: null,
              weeklySessionsCount: 1
            };
        const tplInfo = enrichServiceTemplates(srv, templatesMap, resolvedDomain === 'studio');
        const linkedProfs = linkedByService.get(srv.id) || [];
        const linkedProfIds = linkedProfs.length > 0
          ? linkedProfs.map(lp => lp.id)
          : (srv.professional_id ? [srv.professional_id] : []);
        const scheduleDiagnostics = (srv.service_kind || 'individual') === 'group'
          ? ClassScheduleService.diagnoseServiceSchedules(tenantId, srv.id, schedules)
          : null;
        const supportsCustomAvailability =
          resolvedDomain === 'studio' &&
          (srv.service_kind || 'individual') === 'individual' &&
          resolvedStudioType === 'individual';
        const resolvedAvailMode: ServiceAvailabilityMode = supportsCustomAvailability && srv.availability_mode === 'custom_windows'
          ? 'custom_windows'
          : 'professional_schedule';
        const availWindows = supportsCustomAvailability ? (availWindowsByService.get(srv.id) || []) : [];
        const availDiagnostics = supportsCustomAvailability && resolvedAvailMode === 'custom_windows'
          ? diagnoseServiceAvailability(tenantId, linkedProfIds, availWindows)
          : null;
        return {
          ...srv,
          catalog_price: Number(srv.price || 0) > 0 ? Number(srv.price) : Number(billConfig.periodicPrice || 0),
          service_domain: resolvedDomain,
          studio_service_type: resolvedStudioType,
          requires_appointment: resolvedRequiresAppt,
          requires_active_contract: resolvedDomain === 'studio' ? Number(srv.requires_active_contract ?? (resolvedStudioType === 'facility_access' ? 1 : 0)) : 0,
          allow_public_booking: Number(srv.allow_public_booking ?? 1) === 0 ? 0 : 1,
          effective_start_date: srv.effective_start_date || null,
          effective_end_date: srv.effective_end_date || null,
          access_config: accessConfig,
          pricing_adjustments: pricingAdjustments,
          commercial_price_options: commercialPriceOptions,
          optional_addons: optionalAddons,
          billing_mode: billConfig.billingMode,
          periodic_price: billConfig.periodicPrice,
          billing_cycle_months: billConfig.billingCycleMonths,
          default_package_id: billConfig.defaultPackageId,
          default_package_name: billConfig.billingMode === 'package' ? (srv.default_package_name || null) : null,
          default_billing_due_day: billConfig.defaultBillingDueDay,
          pricing_rule: billConfig.pricingRule,
          is_price_customized: billConfig.isPriceCustomized ? 1 : 0,
          suggested_price: billConfig.suggestedPrice,
          weekly_sessions_count: billConfig.weeklySessionsCount,
          frequency_pricing: isStudioCompat && resolvedDomain === 'studio' ? readFrequencyPricing(srv.frequency_pricing_json) : null,
          default_template_id: tplInfo.default_template_id,
          default_template_title: tplInfo.default_template_title,
          linked_template_ids: tplInfo.linked_template_ids,
          linked_templates: tplInfo.linked_templates,
          allow_recurrence: recConfig.allowRecurrence ? 1 : 0,
          allowed_recurrence_frequencies: recConfig.allowedFrequencies,
          allowed_recurrence_weekdays: recConfig.allowedWeekdays,
          default_recurrence_frequency: recConfig.defaultFrequency,
          allowed_plan_durations: recConfig.allowedPlanDurations,
          default_plan_duration: recConfig.defaultPlanDuration,
          custom_recurrence_intervals: recConfig.customIntervals,
          default_recurrence_interval: recConfig.defaultCustomInterval,
          linked_professional_ids: linkedProfIds,
          linked_professionals: linkedProfs,
          class_schedules: schedules,
          weekly_schedule_summary: buildWeeklyScheduleSummary(schedules),
          schedule_diagnostics: scheduleDiagnostics,
          availability_mode: resolvedAvailMode,
          availability_windows: availWindows,
          availability_diagnostics: availDiagnostics
        };
      });
      res.json(enriched);
    } catch (err: any) {
      console.error('[ServiceController.list] Erro:', err);
      res.status(err.status || 500).json({ error: err.status ? err.message : 'Erro ao listar serviços' });
    }
  }

  static listAddonCandidates(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }
      const excludeServiceId =
        typeof req.query.excludeServiceId === 'string' && req.query.excludeServiceId.trim()
          ? req.query.excludeServiceId.trim()
          : null;
      const result = listAddonCandidateServicesForTenant(tenantId, { excludeServiceId });
      res.json(result);
    } catch (err: any) {
      console.error('[ServiceController.listAddonCandidates] Erro:', err);
      res.status(err.status || 500).json({ error: err.status ? err.message : 'Erro ao listar serviços elegíveis para complementos opcionais' });
    }
  }

  static create(req: Request, res: Response): void {
    ServiceController.createService(req, res);
  }

  static createService(req: Request, res: ServiceSaveResponse, preserveZeroSessionPrice = false): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const {
        professionalId, specialtyId, name, description, durationMinutes, bufferMinutes,
        price, modality, minLeadTimeHours, maxAdvanceDays, cancellationPolicy,
        reminderEnabled, reminderValue, reminderUnit, clinicalModule,
        serviceKind, service_kind, defaultCapacity, default_capacity, allowRecurrence, allow_recurrence,
        modalityCategory, modality_category,
        serviceDomain, service_domain,
        allowedRecurrenceFrequencies, allowed_recurrence_frequencies,
        allowedRecurrenceWeekdays, allowed_recurrence_weekdays,
        defaultRecurrenceFrequency, default_recurrence_frequency,
        allowedPlanDurations, allowed_plan_durations,
        defaultPlanDuration, default_plan_duration,
        customRecurrenceIntervals, custom_recurrence_intervals,
        defaultRecurrenceInterval, default_recurrence_interval,
        billingMode, billing_mode,
        periodicPrice, periodic_price,
        defaultPackageId, default_package_id,
        defaultBillingDueDay, default_billing_due_day,
        pricingRule, pricing_rule,
        isPriceCustomized, is_price_customized,
        suggestedPrice, suggested_price,
        weeklySessionsCount, weekly_sessions_count,
        defaultTemplateId, default_template_id,
        linkedTemplateIds, linked_template_ids,
        availabilityMode, availability_mode,
        availabilityWindows, availability_windows
      } = req.body;

      const establishmentProfile = getTenantEstablishmentProfile(tenantId);
      const isStudioCompat = establishmentProfile === 'studio' || establishmentProfile === 'mixed';
      const rawClassSchedules = Array.isArray(req.body?.classSchedules)
        ? req.body.classSchedules
        : (Array.isArray(req.body?.class_schedules) ? req.body.class_schedules : []);
      const rawKind = serviceKind ?? service_kind;
      const rawStudioType = req.body?.studioServiceType ?? req.body?.studio_service_type;
      const resolvedStudioType: StudioServiceType = isStudioCompat
        ? normalizeStudioServiceType(rawStudioType, rawKind)
        : 'individual';
      const resolvedKind = resolvedStudioType === 'group' || (rawKind || 'individual') === 'group' ? 'group' : 'individual';
      const isNonScheduledStudioService =
        isStudioCompat && (resolvedStudioType === 'facility_access' || resolvedStudioType === 'non_scheduled');
      const rawCapacity = defaultCapacity !== undefined ? defaultCapacity : default_capacity;
      const rawRequestedDomain = serviceDomain ?? service_domain;
      const rawAllowedFreqs = allowedRecurrenceFrequencies !== undefined ? allowedRecurrenceFrequencies : allowed_recurrence_frequencies;
      const rawAllowedWeekdays = allowedRecurrenceWeekdays !== undefined ? allowedRecurrenceWeekdays : allowed_recurrence_weekdays;
      const rawDefaultFreq = defaultRecurrenceFrequency !== undefined ? defaultRecurrenceFrequency : default_recurrence_frequency;
      const rawAllowedDurations = allowedPlanDurations !== undefined ? allowedPlanDurations : allowed_plan_durations;
      const rawDefaultDuration = defaultPlanDuration !== undefined ? defaultPlanDuration : default_plan_duration;
      const rawCustomIntervals = customRecurrenceIntervals !== undefined ? customRecurrenceIntervals : custom_recurrence_intervals;
      const rawDefaultInterval = defaultRecurrenceInterval !== undefined ? defaultRecurrenceInterval : default_recurrence_interval;
      const rawBillingMode = billingMode !== undefined ? billingMode : billing_mode;
      const rawPeriodicPrice = periodicPrice !== undefined ? periodicPrice : periodic_price;
      const rawDefaultPkgId = defaultPackageId !== undefined ? defaultPackageId : default_package_id;
      const rawDefaultDueDay = defaultBillingDueDay !== undefined ? defaultBillingDueDay : default_billing_due_day;
      const rawPricingRule = pricingRule !== undefined ? pricingRule : pricing_rule;
      const rawIsPriceCustomized = isPriceCustomized !== undefined ? isPriceCustomized : is_price_customized;
      const rawSuggestedPrice = suggestedPrice !== undefined ? suggestedPrice : suggested_price;
      const rawWeeklySessionsCount = weeklySessionsCount !== undefined ? weeklySessionsCount : weekly_sessions_count;
      const rawDefaultTplId = defaultTemplateId !== undefined ? defaultTemplateId : default_template_id;
      const rawLinkedTplIds = linkedTemplateIds !== undefined ? linkedTemplateIds : linked_template_ids;
      const rawAvailabilityMode = availabilityMode !== undefined ? availabilityMode : availability_mode;
      const rawAvailabilityWindows = availabilityWindows !== undefined ? availabilityWindows : availability_windows;
      const rawAccessConfig = req.body?.accessConfig !== undefined ? req.body.accessConfig : req.body?.access_config;
      const rawPricingAdjustments = req.body?.pricingAdjustments !== undefined ? req.body.pricingAdjustments : req.body?.pricing_adjustments;
      const rawCommercialOptions = req.body?.commercialPriceOptions !== undefined ? req.body.commercialPriceOptions : req.body?.commercial_price_options;
      const rawOptionalAddons = req.body?.optionalAddons !== undefined ? req.body.optionalAddons : req.body?.optional_addons;
      const rawRequiresActiveContract = req.body?.requiresActiveContract !== undefined ? req.body.requiresActiveContract : req.body?.requires_active_contract;
      const rawAllowPublicBooking = req.body?.allowPublicBooking !== undefined ? req.body.allowPublicBooking : req.body?.allow_public_booking;
      const rawEffectiveStartDate = req.body?.effectiveStartDate !== undefined ? req.body.effectiveStartDate : req.body?.effective_start_date;
      const rawEffectiveEndDate = req.body?.effectiveEndDate !== undefined ? req.body.effectiveEndDate : req.body?.effective_end_date;
      const requestedLinkedIds = parseLinkedInstructorIds(req.body);

      if (!isStudioCompat) {
        if (
          resolvedKind === 'group' ||
          (rawStudioType !== undefined && String(rawStudioType).trim().toLowerCase() !== 'individual') ||
          rawAccessConfig !== undefined ||
          rawPricingAdjustments !== undefined ||
          rawCommercialOptions !== undefined ||
          rawOptionalAddons !== undefined ||
          (rawCapacity !== undefined && rawCapacity !== null && rawCapacity !== '') ||
          rawClassSchedules.length > 0 ||
          String(rawRequestedDomain || '').trim().toLowerCase() === 'studio' ||
          String(rawAvailabilityMode || '').trim().toLowerCase() === 'custom_windows' ||
          (rawBillingMode !== undefined && rawBillingMode !== null && String(rawBillingMode).trim().toLowerCase() !== '' && String(rawBillingMode).trim().toLowerCase() !== 'per_session') ||
          (rawPeriodicPrice !== undefined && rawPeriodicPrice !== null && rawPeriodicPrice !== '') ||
          (rawDefaultPkgId !== undefined && rawDefaultPkgId !== null && String(rawDefaultPkgId).trim() !== '') ||
          (rawDefaultTplId !== undefined && rawDefaultTplId !== null && String(rawDefaultTplId).trim() !== '') ||
          (Array.isArray(rawLinkedTplIds) && rawLinkedTplIds.length > 0) ||
          (Array.isArray(rawAllowedFreqs) && rawAllowedFreqs.length > 0) ||
          (rawDefaultFreq !== undefined && rawDefaultFreq !== null && String(rawDefaultFreq).trim() !== '') ||
          (Array.isArray(rawCustomIntervals) && rawCustomIntervals.length > 0) ||
          (rawDefaultInterval !== undefined && rawDefaultInterval !== null && rawDefaultInterval !== '') ||
          (requestedLinkedIds && requestedLinkedIds.some(pid => pid !== professionalId))
        ) {
          res.status(400).json({
            error: 'Aulas coletivas, planos de acesso, cobrança periódica/por pacote, múltiplos instrutores, capacidade de turma e recorrência avançada de Academia & Studio não estão disponíveis para Clínicas / Consultórios tradicionais.'
          });
          return;
        }
      }

      if (establishmentProfile === 'studio' && String(rawRequestedDomain || '').trim().toLowerCase() === 'clinical') {
        res.status(400).json({
          error: 'Estabelecimentos configurados exclusivamente como Academia & Studio não criam serviços clínicos tradicionais.'
        });
        return;
      }

      let resolvedCapacity: number | null = null;
      if (resolvedKind === 'group') {
        const capNum = Number(rawCapacity);
        if (!Number.isInteger(capNum) || capNum < 1 || capNum > 500) {
          res.status(400).json({ error: 'Para aulas coletivas/turmas ou duplas, informe um número inteiro positivo de vagas.' });
          return;
        }
        resolvedCapacity = capNum;
      } else if (resolvedStudioType === 'facility_access' && rawCapacity !== undefined && rawCapacity !== null && rawCapacity !== '') {
        const capNum = Number(rawCapacity);
        if (Number.isInteger(capNum) && capNum > 0) {
          resolvedCapacity = Math.min(5000, capNum);
        }
      }
      const resolvedModalityCategory = isStudioCompat && (modalityCategory ?? modality_category ?? null)
        ? String(modalityCategory ?? modality_category).trim()
        : null;

      if (!name || !name.trim()) {
        res.status(400).json({ error: 'Nome do serviço é obrigatório' });
        return;
      }

      let effectiveCreateProfId: string | null = professionalId ? String(professionalId) : null;
      let prof: any = null;
      let targetModule: string | null = null;

      if (resolvedStudioType === 'facility_access') {
        // Acesso à academia (musculação / plano base) nunca depende de Personal Trainer nem de módulo clínico
        effectiveCreateProfId = professionalId ? String(professionalId) : null;
        if (effectiveCreateProfId) {
          prof = db.prepare('SELECT id, name FROM professionals WHERE id = ? AND tenant_id = ?').get(effectiveCreateProfId, tenantId) as any;
          if (!prof) {
            res.status(400).json({ error: 'Profissional selecionado não encontrado neste estabelecimento' });
            return;
          }
        }
        targetModule = null;
      } else if (effectiveCreateProfId) {
        prof = db.prepare('SELECT id, name FROM professionals WHERE id = ? AND tenant_id = ?').get(effectiveCreateProfId, tenantId) as any;
        if (!prof) {
          res.status(400).json({ error: 'Profissional selecionado não encontrado na clínica' });
          return;
        }
        const availableModules = getAvailableModulesForProfessional(effectiveCreateProfId, tenantId);
        if (clinicalModule) {
          const isAllowed = availableModules.some(m => m.code === clinicalModule);
          if (!isAllowed) {
            res.status(400).json({ error: `O módulo "${clinicalModule}" não é permitido para este profissional.` });
            return;
          }
          targetModule = clinicalModule;
        } else {
          targetModule = availableModules.length === 1 ? availableModules[0].code : (availableModules[0]?.code || null);
        }
      } else if (!isNonScheduledStudioService) {
        res.status(400).json({ error: 'A seleção do profissional é obrigatória para cadastrar o serviço.' });
        return;
      } else {
        targetModule = null;
      }

      const resolvedDomain: ServiceDomain = resolveServiceDomain({
        establishmentProfile,
        serviceDomain: rawRequestedDomain || (isNonScheduledStudioService ? 'studio' : undefined),
        serviceKind: resolvedKind,
        clinicalModule: targetModule
      });

      if (establishmentProfile === 'mixed' && resolvedDomain === 'clinical' && (resolvedKind === 'group' || resolvedStudioType !== 'individual')) {
        res.status(400).json({ error: 'Serviços clínicos em estabelecimentos mistos devem ser individuais. Selecione o segmento Academia & Studio para criar aula coletiva, turma ou plano de acesso.' });
        return;
      }

      const recNorm = isStudioCompat && (resolvedDomain === 'studio' || rawAllowedFreqs !== undefined || rawAllowedWeekdays !== undefined || rawAllowedDurations !== undefined || rawDefaultDuration !== undefined || rawCustomIntervals !== undefined || rawDefaultInterval !== undefined)
        ? normalizeRecurrenceConfigForSave({
            allowRecurrence: allowRecurrence ?? allow_recurrence,
            allowedRecurrenceFrequencies: rawAllowedFreqs,
            allowedRecurrenceWeekdays: rawAllowedWeekdays,
            defaultRecurrenceFrequency: rawDefaultFreq,
            allowedPlanDurations: rawAllowedDurations,
            defaultPlanDuration: rawDefaultDuration,
            customRecurrenceIntervals: rawCustomIntervals,
            defaultRecurrenceInterval: rawDefaultInterval
          })
        : {
            allowRecurrenceInt: ((allowRecurrence ?? allow_recurrence) === false || (allowRecurrence ?? allow_recurrence) === 0 ? 0 : 1) as 0 | 1,
            allowedJson: null,
            allowedWeekdaysJson: null,
            defaultFrequency: null,
            allowedPlanDurationsJson: null,
            defaultPlanDuration: null,
            customIntervalsJson: null,
            defaultIntervalJson: null
          };

      if ('error' in recNorm && recNorm.error) {
        res.status(400).json({ error: recNorm.error });
        return;
      }

      const billNorm = normalizeServiceBillingForSave({
        frequencyPricing: req.body.frequencyPricing,
        isStudioService: isStudioCompat && resolvedDomain === 'studio',
        billingMode: rawBillingMode,
        periodicPrice: rawPeriodicPrice,
        defaultPackageId: rawDefaultPkgId,
        defaultBillingDueDay: rawDefaultDueDay,
        pricingRule: rawPricingRule,
        isPriceCustomized: rawIsPriceCustomized,
        suggestedPrice: rawSuggestedPrice,
        weeklySessionsCount: rawWeeklySessionsCount,
        sessionPrice: price !== undefined && price !== null && price !== '' ? Number(price) : 0,
        scheduleEntriesCount: rawClassSchedules.length > 0 ? rawClassSchedules.length : 1,
        tenantId
      });
      if (billNorm.error) {
        res.status(400).json({ error: billNorm.error });
        return;
      }

      const frequencyPricing = frequencyConfigForSave(req.body.frequencyPricing, establishmentProfile, resolvedDomain, billNorm.billingMode, resolvedStudioType);

      const normalizedAccessConfig =
        isStudioCompat && resolvedDomain === 'studio' && resolvedStudioType === 'facility_access'
          ? normalizeStudioAccessConfig(rawAccessConfig)
          : null;
      const normalizedPricingAdjustments =
        isStudioCompat && resolvedDomain === 'studio'
          ? normalizeStudioPriceAdjustments(rawPricingAdjustments)
          : [];
      const normalizedCommercialOptions =
        isStudioCompat && resolvedDomain === 'studio'
          ? normalizeCommercialPriceOptions(rawCommercialOptions)
          : [];
      const addonsValidation = validateAndHydrateOptionalAddonsForSave({
        tenantId,
        establishmentProfile,
        isStudioCompat,
        serviceDomain: resolvedDomain,
        rawOptionalAddons
      });
      if (addonsValidation.error) {
        res.status(400).json({ error: addonsValidation.error });
        return;
      }
      const normalizedOptionalAddonsJson = addonsValidation.configJson;
      const resolvedRequiresAppointment =
        isStudioCompat && resolvedDomain === 'studio' && (resolvedStudioType === 'facility_access' || resolvedStudioType === 'non_scheduled')
          ? 0
          : 1;
      const resolvedRequiresActiveContract =
        isStudioCompat && resolvedDomain === 'studio'
          ? (rawRequiresActiveContract !== undefined ? (rawRequiresActiveContract ? 1 : 0) : (resolvedStudioType === 'facility_access' ? 1 : 0))
          : 0;
      const resolvedAllowPublicBooking =
        rawAllowPublicBooking === false || rawAllowPublicBooking === 0 || rawAllowPublicBooking === '0' ? 0 : 1;
      const resolvedEffectiveStartDate =
        isStudioCompat && resolvedDomain === 'studio' && rawEffectiveStartDate && /^\d{4}-\d{2}-\d{2}$/.test(String(rawEffectiveStartDate).slice(0, 10))
          ? String(rawEffectiveStartDate).slice(0, 10)
          : null;
      const resolvedEffectiveEndDate =
        isStudioCompat && resolvedDomain === 'studio' && rawEffectiveEndDate && /^\d{4}-\d{2}-\d{2}$/.test(String(rawEffectiveEndDate).slice(0, 10))
          ? String(rawEffectiveEndDate).slice(0, 10)
          : null;

      const tplNorm = normalizeServiceTemplatesForSave({
        tenantId,
        isStudioService: isStudioCompat && resolvedDomain === 'studio',
        defaultTemplateId: rawDefaultTplId,
        linkedTemplateIds: rawLinkedTplIds
      });
      if (tplNorm.error) {
        res.status(400).json({ error: tplNorm.error });
        return;
      }

      const rawPriceNum = price !== undefined && price !== null && price !== '' ? Number(price) : 0;
      const effectiveCreatePrice =
        rawPriceNum > 0 || (preserveZeroSessionPrice && rawPriceNum === 0)
          ? rawPriceNum
          : (billNorm.periodicPrice && billNorm.periodicPrice > 0
              ? Number(billNorm.periodicPrice)
              : (normalizedCommercialOptions.length > 0 ? normalizedCommercialOptions[0].amountCents / 100 : 0));

      const resolvedMinLeadTimeHours = (minLeadTimeHours !== undefined && minLeadTimeHours !== null && minLeadTimeHours !== '' && !Number.isNaN(Number(minLeadTimeHours)))
        ? Math.max(0, Number(minLeadTimeHours))
        : (resolvedRequiresAppointment === 0 ? 0 : 2);
      const resolvedMaxAdvanceDays = (maxAdvanceDays !== undefined && maxAdvanceDays !== null && maxAdvanceDays !== '' && !Number.isNaN(Number(maxAdvanceDays)))
        ? Math.max(1, Number(maxAdvanceDays))
        : 60;

      const resolvedAvailProfIds = isStudioCompat && resolvedDomain === 'studio'
        ? Array.from(new Set([professionalId, ...(requestedLinkedIds || [])].filter(Boolean)))
        : (professionalId ? [professionalId] : []);
      const availNorm = resolvedRequiresAppointment === 0
        ? { availabilityMode: 'professional_schedule' as const, shouldPersistWindows: false, windows: [] as any[], error: undefined }
        : normalizeAndValidateServiceAvailability({
            tenantId,
            isStudioCompat,
            serviceDomain: resolvedDomain,
            serviceKind: resolvedKind,
            professionalIds: resolvedAvailProfIds,
            rawAvailabilityMode,
            rawAvailabilityWindows
          });
      if (availNorm.error) {
        res.status(400).json({ error: availNorm.error });
        return;
      }

      const id = 'srv-' + uuidv4().slice(0, 8);
      const scheduleWarnings: string[] = [];
      let createdSchedules: any[] = [];
      const effectiveDurationMinutes =
        durationMinutes !== undefined && durationMinutes !== null && durationMinutes !== ''
          ? Number(durationMinutes)
          : (resolvedRequiresAppointment === 0 ? 0 : 50);
      const effectiveBufferMinutes =
        bufferMinutes !== undefined && bufferMinutes !== null && bufferMinutes !== ''
          ? Number(bufferMinutes)
          : (resolvedRequiresAppointment === 0 ? 0 : 10);

      db.transaction(() => {
        const insertStmt = db.prepare(`
          INSERT INTO services (
            id, tenant_id, professional_id, specialty_id, name, description, duration_minutes,
            buffer_minutes, price, modality, active, min_lead_time_hours, max_advance_days, cancellation_policy,
            reminder_enabled, reminder_value, reminder_unit, clinical_module,
            service_kind, default_capacity, allow_recurrence, modality_category,
            service_domain, allowed_recurrence_frequencies_json, default_recurrence_frequency,
            allowed_plan_durations_json, default_plan_duration,
            custom_recurrence_intervals_json, default_recurrence_interval_json,
            billing_mode, periodic_price, billing_cycle_months, default_package_id, default_billing_due_day,
            pricing_rule, is_price_customized, suggested_price, weekly_sessions_count,
            default_template_id, linked_template_ids_json
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        insertStmt.run(
          id,
          tenantId,
          professionalId || null,
          specialtyId || null,
          name.trim(),
          description || null,
          effectiveDurationMinutes,
          effectiveBufferMinutes,
          effectiveCreatePrice,
          modality || 'both',
          resolvedMinLeadTimeHours,
          resolvedMaxAdvanceDays,
          cancellationPolicy || null,
          reminderEnabled ? 1 : 0,
          reminderEnabled && reminderValue ? Number(reminderValue) : null,
          reminderEnabled && reminderUnit ? String(reminderUnit).toUpperCase() : 'DAYS',
          targetModule,
          resolvedKind,
          resolvedCapacity,
          recNorm.allowRecurrenceInt,
          resolvedModalityCategory,
          resolvedDomain,
          recNorm.allowedJson,
          recNorm.defaultFrequency,
          recNorm.allowedPlanDurationsJson,
          recNorm.defaultPlanDuration,
          recNorm.customIntervalsJson,
          recNorm.defaultIntervalJson,
          billNorm.billingMode,
          billNorm.periodicPrice,
          billNorm.billingCycleMonths,
          billNorm.defaultPackageId,
          billNorm.defaultBillingDueDay,
          billNorm.pricingRule,
          billNorm.isPriceCustomized ? 1 : 0,
          billNorm.suggestedPrice,
          billNorm.weeklySessionsCount,
          tplNorm.defaultTemplateId,
          tplNorm.linkedTemplateIdsJson
        );

        db.prepare(`
          UPDATE services
          SET frequency_pricing_json = ?,
              allowed_recurrence_weekdays_json = ?,
              availability_mode = ?,
              studio_service_type = ?,
              requires_appointment = ?,
              requires_active_contract = ?,
              allow_public_booking = ?,
              effective_start_date = ?,
              effective_end_date = ?,
              access_config_json = ?,
              pricing_adjustments_json = ?,
              commercial_price_options_json = ?,
              optional_addons_json = ?
          WHERE id = ? AND tenant_id = ?
        `).run(
          frequencyPricing ? JSON.stringify(frequencyPricing) : null,
          isStudioCompat && resolvedDomain === 'studio' ? recNorm.allowedWeekdaysJson : null,
          availNorm.availabilityMode,
          isStudioCompat && resolvedDomain === 'studio' ? resolvedStudioType : 'individual',
          resolvedRequiresAppointment,
          resolvedRequiresActiveContract,
          resolvedAllowPublicBooking,
          resolvedEffectiveStartDate,
          resolvedEffectiveEndDate,
          normalizedAccessConfig ? JSON.stringify(normalizedAccessConfig) : null,
          normalizedPricingAdjustments.length > 0 ? JSON.stringify(normalizedPricingAdjustments) : null,
          normalizedCommercialOptions.length > 0 ? JSON.stringify(normalizedCommercialOptions) : null,
          normalizedOptionalAddonsJson,
          id,
          tenantId
        );

        if (availNorm.shouldPersistWindows) {
          saveServiceAvailabilityWindowsTx(tenantId, id, professionalId || null, availNorm.windows);
        }

        const normalizedCustomPrice = effectiveCreatePrice > 0 ? effectiveCreatePrice : (price !== undefined && price !== null && price !== '' ? Number(price) : null);
        const normalizedCustomDuration = durationMinutes !== undefined && durationMinutes !== null && durationMinutes !== '' ? Number(durationMinutes) : null;

        validateAndSyncLinkedInstructorsTx({
          tenantId,
          serviceId: id,
          primaryProfId: professionalId || null,
          requestedIds: requestedLinkedIds,
          isStudioCompat,
          serviceDomain: resolvedDomain,
          price: normalizedCustomPrice,
          durationMinutes: normalizedCustomDuration,
          isUpdate: false
        });

        if (resolvedKind === 'group' && rawClassSchedules.length > 0 && PackageService.isStudioCompatible(tenantId)) {
          for (const item of rawClassSchedules) {
            const out = ClassScheduleService.createSchedules(tenantId, id, item, req.user?.userId || '');
            if (out.warnings?.length) scheduleWarnings.push(...out.warnings);
          }
          createdSchedules = ClassScheduleService.listForService(tenantId, id, { includeInactive: true });
          const derivedGroupWeekdays = Array.from(
            new Set(createdSchedules.filter(cs => Number(cs.active) !== 0).map(cs => Number(cs.day_of_week)))
          ).filter(n => Number.isInteger(n) && n >= 0 && n <= 6).sort((a, b) => a - b);
          if (recNorm.allowRecurrenceInt === 1 && derivedGroupWeekdays.length > 0) {
            const derivedJson = JSON.stringify(derivedGroupWeekdays);
            recNorm.allowedWeekdaysJson = derivedJson;
            db.prepare('UPDATE services SET allowed_recurrence_weekdays_json = ? WHERE id = ? AND tenant_id = ?')
              .run(derivedJson, id, tenantId);
          }
        }
      })();

      logAudit(req, 'CREATE_SERVICE', 'services', id, { name, price: effectiveCreatePrice, professionalId: professionalId || null, professionalName: prof?.name || null, clinicalModule: targetModule, serviceDomain: resolvedDomain, studioServiceType: resolvedStudioType, linkedCount: requestedLinkedIds?.length || (professionalId ? 1 : 0) });

      const parsedCreatedRec = isStudioCompat
        ? parseServiceRecurrenceConfig({
            service_kind: resolvedKind,
            allow_recurrence: recNorm.allowRecurrenceInt,
            allowed_recurrence_frequencies_json: recNorm.allowedJson,
            allowed_recurrence_weekdays_json: resolvedDomain === 'studio' ? recNorm.allowedWeekdaysJson : null,
            default_recurrence_frequency: recNorm.defaultFrequency,
            allowed_plan_durations_json: recNorm.allowedPlanDurationsJson,
            default_plan_duration: recNorm.defaultPlanDuration,
            custom_recurrence_intervals_json: recNorm.customIntervalsJson,
            default_recurrence_interval_json: recNorm.defaultIntervalJson
          })
        : null;
      const linkedCreatedProfs = isStudioCompat
        ? (getLinkedProfessionalsMap(tenantId, new Map([[id, professionalId || null]])).get(id) || [])
        : [];
      const linkedCreatedIds = linkedCreatedProfs.length > 0
        ? linkedCreatedProfs.map(lp => lp.id)
        : (professionalId ? [professionalId] : []);
      const createdDiagnostics = isStudioCompat && resolvedKind === 'group'
        ? ClassScheduleService.diagnoseServiceSchedules(tenantId, id, createdSchedules)
        : null;
      const savedAvailWindows = isStudioCompat && resolvedDomain === 'studio' && resolvedKind === 'individual' && resolvedRequiresAppointment === 1
        ? listServiceAvailabilityWindows(tenantId, id)
        : [];
      const createdAvailDiagnostics = isStudioCompat && resolvedDomain === 'studio' && resolvedKind === 'individual' && resolvedRequiresAppointment === 1 && availNorm.availabilityMode === 'custom_windows'
        ? diagnoseServiceAvailability(tenantId, linkedCreatedIds, savedAvailWindows)
        : null;
      const createdTemplatesMap = isStudioCompat ? getTenantTemplatesMap(tenantId) : new Map<string, LinkedTemplateSummary>();
      const createdTplInfo = enrichServiceTemplates(
        { default_template_id: tplNorm.defaultTemplateId, linked_template_ids_json: tplNorm.linkedTemplateIdsJson },
        createdTemplatesMap,
        isStudioCompat && resolvedDomain === 'studio'
      );

      res.status(201).json({
        id,
        tenant_id: tenantId,
        professional_id: professionalId || null,
        specialty_id: specialtyId || null,
        name: name.trim(),
        description: description || null,
        duration_minutes: effectiveDurationMinutes,
        buffer_minutes: effectiveBufferMinutes,
        min_lead_time_hours: resolvedMinLeadTimeHours,
        max_advance_days: resolvedMaxAdvanceDays,
        price: effectiveCreatePrice,
        catalog_price: effectiveCreatePrice,
        modality: modality || 'both',
        active: 1,
        clinical_module: targetModule,
        service_kind: resolvedKind,
        studio_service_type: isStudioCompat && resolvedDomain === 'studio' ? resolvedStudioType : 'individual',
        requires_appointment: resolvedRequiresAppointment,
        requires_active_contract: resolvedRequiresActiveContract,
        allow_public_booking: resolvedAllowPublicBooking,
        effective_start_date: resolvedEffectiveStartDate,
        effective_end_date: resolvedEffectiveEndDate,
        access_config: normalizedAccessConfig,
        pricing_adjustments: normalizedPricingAdjustments,
        commercial_price_options: normalizedCommercialOptions,
        default_capacity: resolvedCapacity,
        service_domain: resolvedDomain,
        billing_mode: billNorm.billingMode,
        periodic_price: billNorm.periodicPrice,
        billing_cycle_months: billNorm.billingCycleMonths,
        default_package_id: billNorm.defaultPackageId,
        default_billing_due_day: billNorm.defaultBillingDueDay,
        pricing_rule: billNorm.pricingRule,
        is_price_customized: billNorm.isPriceCustomized ? 1 : 0,
        suggested_price: billNorm.suggestedPrice,
        weekly_sessions_count: billNorm.weeklySessionsCount,
        frequency_pricing: frequencyPricing,
        default_template_id: createdTplInfo.default_template_id,
        default_template_title: createdTplInfo.default_template_title,
        linked_template_ids: createdTplInfo.linked_template_ids,
        linked_templates: createdTplInfo.linked_templates,
        allow_recurrence: recNorm.allowRecurrenceInt,
        allowed_recurrence_frequencies: parsedCreatedRec ? parsedCreatedRec.allowedFrequencies : undefined,
        allowed_recurrence_weekdays: parsedCreatedRec ? parsedCreatedRec.allowedWeekdays : undefined,
        default_recurrence_frequency: parsedCreatedRec ? parsedCreatedRec.defaultFrequency : null,
        allowed_plan_durations: parsedCreatedRec ? parsedCreatedRec.allowedPlanDurations : undefined,
        default_plan_duration: parsedCreatedRec ? parsedCreatedRec.defaultPlanDuration : null,
        custom_recurrence_intervals: parsedCreatedRec ? parsedCreatedRec.customIntervals : undefined,
        default_recurrence_interval: parsedCreatedRec ? parsedCreatedRec.defaultCustomInterval : null,
        modality_category: resolvedModalityCategory,
        professional_name: prof?.name || null,
        linked_professional_ids: linkedCreatedIds,
        linked_professionals: linkedCreatedProfs,
        class_schedules: createdSchedules,
        weekly_schedule_summary: buildWeeklyScheduleSummary(createdSchedules),
        schedule_diagnostics: createdDiagnostics,
        schedule_warnings: scheduleWarnings,
        availability_mode: availNorm.availabilityMode,
        availability_windows: savedAvailWindows,
        availability_diagnostics: createdAvailDiagnostics,
        message: 'Serviço criado com sucesso'
      });
    } catch (err: any) {
      console.error('[ServiceController.create] Erro:', err);
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao criar serviço', ...(err?.code ? { code: err.code } : {}) });
    }
  }

  static update(req: Request, res: Response): void {
    ServiceController.updateService(req, res);
  }

  static updateService(req: Request, res: ServiceSaveResponse, preserveExistingTerms = false): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const existing = db.prepare(`
        SELECT id, name, price, professional_id, clinical_module, service_kind, default_capacity, allow_recurrence,
               modality_category, service_domain, allowed_recurrence_frequencies_json, allowed_recurrence_weekdays_json, default_recurrence_frequency,
               custom_recurrence_intervals_json, default_recurrence_interval_json,
               billing_mode, periodic_price, billing_cycle_months, default_package_id, default_billing_due_day,
               pricing_rule, is_price_customized, suggested_price, weekly_sessions_count, frequency_pricing_json,
               default_template_id, linked_template_ids_json,
               COALESCE(studio_service_type, CASE WHEN COALESCE(service_kind, 'individual') = 'group' THEN 'group' ELSE 'individual' END) as studio_service_type,
               COALESCE(requires_appointment, 1) as requires_appointment,
               COALESCE(requires_active_contract, 0) as requires_active_contract,
               COALESCE(allow_public_booking, 1) as allow_public_booking,
               effective_start_date, effective_end_date,
               access_config_json, pricing_adjustments_json, commercial_price_options_json, optional_addons_json,
               COALESCE(availability_mode, 'professional_schedule') as availability_mode
        FROM services WHERE id = ? AND tenant_id = ?
      `).get(id, tenantId) as any;
      if (!existing) {
        res.status(404).json({ error: 'Serviço não encontrado' });
        return;
      }

      const establishmentProfile = getTenantEstablishmentProfile(tenantId);
      const isStudioCompat = establishmentProfile === 'studio' || establishmentProfile === 'mixed';
      const rawClassSchedules = Array.isArray(req.body?.classSchedules)
        ? req.body.classSchedules
        : (Array.isArray(req.body?.class_schedules) ? req.body.class_schedules : []);

      const {
        professionalId, specialtyId, name, description, durationMinutes, bufferMinutes,
        price, modality, active, minLeadTimeHours, maxAdvanceDays, cancellationPolicy,
        reminderEnabled, reminderValue, reminderUnit, clinicalModule,
        serviceKind, service_kind, defaultCapacity, default_capacity, allowRecurrence, allow_recurrence,
        modalityCategory, modality_category,
        serviceDomain, service_domain,
        allowedRecurrenceFrequencies, allowed_recurrence_frequencies,
        allowedRecurrenceWeekdays, allowed_recurrence_weekdays,
        defaultRecurrenceFrequency, default_recurrence_frequency,
        allowedPlanDurations, allowed_plan_durations,
        defaultPlanDuration, default_plan_duration,
        customRecurrenceIntervals, custom_recurrence_intervals,
        defaultRecurrenceInterval, default_recurrence_interval,
        billingMode, billing_mode,
        periodicPrice, periodic_price,
        defaultPackageId, default_package_id,
        defaultBillingDueDay, default_billing_due_day,
        pricingRule, pricing_rule,
        isPriceCustomized, is_price_customized,
        suggestedPrice, suggested_price,
        weeklySessionsCount, weekly_sessions_count,
        defaultTemplateId, default_template_id,
        linkedTemplateIds, linked_template_ids,
        availabilityMode, availability_mode,
        availabilityWindows, availability_windows
      } = req.body;

      const rawKind = serviceKind !== undefined ? serviceKind : service_kind;
      const rawStudioType = req.body?.studioServiceType !== undefined ? req.body.studioServiceType : req.body?.studio_service_type;
      const rawAccessConfig = req.body?.accessConfig !== undefined ? req.body.accessConfig : req.body?.access_config;
      const rawPricingAdjustments = req.body?.pricingAdjustments !== undefined ? req.body.pricingAdjustments : req.body?.pricing_adjustments;
      const rawCommercialOptions = req.body?.commercialPriceOptions !== undefined ? req.body.commercialPriceOptions : req.body?.commercial_price_options;
      const rawOptionalAddons = req.body?.optionalAddons !== undefined ? req.body.optionalAddons : req.body?.optional_addons;
      const rawRequiresActiveContract = req.body?.requiresActiveContract !== undefined ? req.body.requiresActiveContract : req.body?.requires_active_contract;
      const rawAllowPublicBooking = req.body?.allowPublicBooking !== undefined ? req.body.allowPublicBooking : req.body?.allow_public_booking;
      const rawEffectiveStartDate = req.body?.effectiveStartDate !== undefined ? req.body.effectiveStartDate : req.body?.effective_start_date;
      const rawEffectiveEndDate = req.body?.effectiveEndDate !== undefined ? req.body.effectiveEndDate : req.body?.effective_end_date;
      const rawCapacity = defaultCapacity !== undefined ? defaultCapacity : default_capacity;
      const rawRequestedDomain = serviceDomain ?? service_domain;
      const rawAllowedFreqs = allowedRecurrenceFrequencies !== undefined ? allowedRecurrenceFrequencies : allowed_recurrence_frequencies;
      const rawAllowedWeekdays = allowedRecurrenceWeekdays !== undefined ? allowedRecurrenceWeekdays : allowed_recurrence_weekdays;
      const rawDefaultFreq = defaultRecurrenceFrequency !== undefined ? defaultRecurrenceFrequency : default_recurrence_frequency;
      const rawAllowedDurations = allowedPlanDurations !== undefined ? allowedPlanDurations : allowed_plan_durations;
      const rawDefaultDuration = defaultPlanDuration !== undefined ? defaultPlanDuration : default_plan_duration;
      const rawCustomIntervals = customRecurrenceIntervals !== undefined ? customRecurrenceIntervals : custom_recurrence_intervals;
      const rawDefaultInterval = defaultRecurrenceInterval !== undefined ? defaultRecurrenceInterval : default_recurrence_interval;
      const rawBillingMode = billingMode !== undefined ? billingMode : billing_mode;
      const rawPeriodicPrice = periodicPrice !== undefined ? periodicPrice : periodic_price;
      const rawDefaultPkgId = defaultPackageId !== undefined ? defaultPackageId : default_package_id;
      const rawDefaultDueDay = defaultBillingDueDay !== undefined ? defaultBillingDueDay : default_billing_due_day;
      const rawPricingRule = pricingRule !== undefined ? pricingRule : pricing_rule;
      const rawIsPriceCustomized = isPriceCustomized !== undefined ? isPriceCustomized : is_price_customized;
      const rawSuggestedPrice = suggestedPrice !== undefined ? suggestedPrice : suggested_price;
      const rawWeeklySessionsCount = weeklySessionsCount !== undefined ? weeklySessionsCount : weekly_sessions_count;
      const rawDefaultTplId = defaultTemplateId !== undefined ? defaultTemplateId : default_template_id;
      const rawLinkedTplIds = linkedTemplateIds !== undefined ? linkedTemplateIds : linked_template_ids;
      const rawAvailabilityMode = availabilityMode !== undefined ? availabilityMode : availability_mode;
      const rawAvailabilityWindows = availabilityWindows !== undefined ? availabilityWindows : availability_windows;
      const requestedLinkedIds = parseLinkedInstructorIds(req.body);
      const effectiveTargetProfForCheck = professionalId !== undefined ? (professionalId || null) : existing.professional_id;

      if (!isStudioCompat) {
        if (
          rawKind === 'group' ||
          (rawStudioType !== undefined && String(rawStudioType).trim().toLowerCase() !== 'individual') ||
          rawAccessConfig !== undefined ||
          rawPricingAdjustments !== undefined ||
          rawCommercialOptions !== undefined ||
          rawOptionalAddons !== undefined ||
          (rawCapacity !== undefined && rawCapacity !== null && rawCapacity !== '') ||
          String(rawRequestedDomain || '').trim().toLowerCase() === 'studio' ||
          String(rawAvailabilityMode || '').trim().toLowerCase() === 'custom_windows' ||
          (rawBillingMode !== undefined && rawBillingMode !== null && String(rawBillingMode).trim().toLowerCase() !== '' && String(rawBillingMode).trim().toLowerCase() !== 'per_session') ||
          (rawPeriodicPrice !== undefined && rawPeriodicPrice !== null && rawPeriodicPrice !== '') ||
          (rawDefaultPkgId !== undefined && rawDefaultPkgId !== null && String(rawDefaultPkgId).trim() !== '') ||
          (rawDefaultTplId !== undefined && rawDefaultTplId !== null && String(rawDefaultTplId).trim() !== '') ||
          (Array.isArray(rawLinkedTplIds) && rawLinkedTplIds.length > 0) ||
          (Array.isArray(rawAllowedFreqs) && rawAllowedFreqs.length > 0) ||
          (rawDefaultFreq !== undefined && rawDefaultFreq !== null && String(rawDefaultFreq).trim() !== '') ||
          (Array.isArray(rawCustomIntervals) && rawCustomIntervals.length > 0) ||
          (rawDefaultInterval !== undefined && rawDefaultInterval !== null && rawDefaultInterval !== '') ||
          (requestedLinkedIds && requestedLinkedIds.some(pid => pid !== effectiveTargetProfForCheck))
        ) {
          res.status(400).json({
            error: 'Aulas coletivas, planos de acesso, cobrança periódica/por pacote, múltiplos instrutores, capacidade de turma e recorrência avançada de Academia & Studio não estão disponíveis para Clínicas / Consultórios tradicionais.'
          });
          return;
        }
      }

      if (establishmentProfile === 'studio' && String(rawRequestedDomain || '').trim().toLowerCase() === 'clinical') {
        res.status(400).json({
          error: 'Estabelecimentos configurados exclusivamente como Academia & Studio não criam serviços clínicos tradicionais.'
        });
        return;
      }

      const nextStudioType: StudioServiceType = !isStudioCompat
        ? 'individual'
        : normalizeStudioServiceType(
            rawStudioType !== undefined ? rawStudioType : existing.studio_service_type,
            rawKind !== undefined ? rawKind : existing.service_kind
          );

      const nextKind = !isStudioCompat
        ? 'individual'
        : (nextStudioType === 'group' || (rawKind !== undefined ? rawKind === 'group' : (existing.service_kind || 'individual') === 'group')
            ? 'group'
            : 'individual');
      let nextCapacity: number | null = !isStudioCompat ? null : (existing.default_capacity ?? null);
      if (isStudioCompat && (rawKind !== undefined || rawCapacity !== undefined || rawStudioType !== undefined)) {
        if (nextKind === 'group') {
          const capNum = Number(rawCapacity !== undefined ? rawCapacity : existing.default_capacity);
          if (!Number.isInteger(capNum) || capNum < 1 || capNum > 500) {
            res.status(400).json({ error: 'Para aulas coletivas/turmas ou duplas, informe um número inteiro positivo de vagas.' });
            return;
          }
          nextCapacity = capNum;
        } else if (nextStudioType === 'facility_access' && rawCapacity !== undefined && rawCapacity !== null && rawCapacity !== '') {
          const capNum = Number(rawCapacity);
          nextCapacity = Number.isInteger(capNum) && capNum > 0 ? Math.min(5000, capNum) : null;
        } else if (nextStudioType !== 'facility_access') {
          nextCapacity = null;
        }
      }

      const nextModCat = !isStudioCompat
        ? existing.modality_category
        : (modalityCategory !== undefined || modality_category !== undefined
            ? ((modalityCategory ?? modality_category) ? String(modalityCategory ?? modality_category).trim() : null)
            : existing.modality_category);

      if (professionalId) {
        const prof = db.prepare('SELECT id FROM professionals WHERE id = ? AND tenant_id = ?').get(professionalId, tenantId);
        if (!prof) {
          res.status(400).json({ error: 'Profissional selecionado não encontrado na clínica' });
          return;
        }
      }

      // Validação de módulo clínico no update se fornecido
      const targetProfId = professionalId !== undefined ? (professionalId || null) : existing.professional_id;
      if (targetProfId && clinicalModule !== undefined && clinicalModule !== null && clinicalModule !== '') {
        const availableModules = getAvailableModulesForProfessional(targetProfId, tenantId);
        const isAllowed = availableModules.some(m => m.code === clinicalModule);
        if (!isAllowed) {
          res.status(400).json({ error: `O módulo "${clinicalModule}" não é permitido para este profissional.` });
          return;
        }
      }

      const nextDomain: ServiceDomain = resolveServiceDomain({
        establishmentProfile,
        serviceDomain:
          rawRequestedDomain !== undefined
            ? rawRequestedDomain
            : (nextStudioType === 'facility_access' || nextStudioType === 'non_scheduled'
                ? 'studio'
                : existing.service_domain),
        serviceKind: nextKind,
        clinicalModule: nextStudioType === 'facility_access' ? null : (clinicalModule !== undefined ? clinicalModule : existing.clinical_module)
      });

      if (establishmentProfile === 'mixed' && nextDomain === 'clinical' && (nextKind === 'group' || nextStudioType !== 'individual')) {
        res.status(400).json({ error: 'Serviços clínicos em estabelecimentos mistos devem ser individuais. Selecione o segmento Academia & Studio para criar aula coletiva, turma ou plano de acesso.' });
        return;
      }

      const rawAllowRec = allowRecurrence !== undefined ? allowRecurrence : allow_recurrence;
      let nextAllowRec: 0 | 1 = rawAllowRec !== undefined ? (rawAllowRec === false || rawAllowRec === 0 ? 0 : 1) : ((existing.allow_recurrence ?? 1) === 0 ? 0 : 1);
      let nextAllowedJson: string | null = existing.allowed_recurrence_frequencies_json ?? null;
      let nextAllowedWeekdaysJson: string | null = existing.allowed_recurrence_weekdays_json ?? null;
      let nextDefaultFreq: string | null = existing.default_recurrence_frequency ?? null;
      let nextAllowedDurationsJson: string | null = existing.allowed_plan_durations_json ?? null;
      let nextDefaultDuration: string | null = existing.default_plan_duration ?? null;
      let nextCustomIntervalsJson: string | null = existing.custom_recurrence_intervals_json ?? null;
      let nextDefaultIntervalJson: string | null = existing.default_recurrence_interval_json ?? null;

      if (!isStudioCompat) {
        nextAllowedJson = null;
        nextAllowedWeekdaysJson = null;
        nextDefaultFreq = null;
        nextAllowedDurationsJson = null;
        nextDefaultDuration = null;
        nextCustomIntervalsJson = null;
        nextDefaultIntervalJson = null;
      } else if (
        rawAllowRec !== undefined ||
        rawAllowedFreqs !== undefined ||
        rawAllowedWeekdays !== undefined ||
        rawDefaultFreq !== undefined ||
        rawAllowedDurations !== undefined ||
        rawDefaultDuration !== undefined ||
        rawCustomIntervals !== undefined ||
        rawDefaultInterval !== undefined
      ) {
        const recNorm = normalizeRecurrenceConfigForSave({
          allowRecurrence: rawAllowRec !== undefined ? rawAllowRec : existing.allow_recurrence,
          allowedRecurrenceFrequencies: rawAllowedFreqs !== undefined ? rawAllowedFreqs : (
            typeof existing.allowed_recurrence_frequencies_json === 'string' && existing.allowed_recurrence_frequencies_json.trim()
              ? (() => { try { return JSON.parse(existing.allowed_recurrence_frequencies_json); } catch { return undefined; } })()
              : undefined
          ),
          allowedRecurrenceWeekdays: rawAllowedWeekdays !== undefined ? rawAllowedWeekdays : existing.allowed_recurrence_weekdays_json,
          defaultRecurrenceFrequency: rawDefaultFreq !== undefined ? rawDefaultFreq : existing.default_recurrence_frequency,
          allowedPlanDurations: rawAllowedDurations !== undefined ? rawAllowedDurations : (
            typeof existing.allowed_plan_durations_json === 'string' && existing.allowed_plan_durations_json.trim()
              ? (() => { try { return JSON.parse(existing.allowed_plan_durations_json); } catch { return undefined; } })()
              : undefined
          ),
          defaultPlanDuration: rawDefaultDuration !== undefined ? rawDefaultDuration : existing.default_plan_duration,
          customRecurrenceIntervals: rawCustomIntervals !== undefined ? rawCustomIntervals : existing.custom_recurrence_intervals_json,
          defaultRecurrenceInterval: rawDefaultInterval !== undefined ? rawDefaultInterval : existing.default_recurrence_interval_json
        });
        if (recNorm.error) {
          res.status(400).json({ error: recNorm.error });
          return;
        }
        nextAllowRec = recNorm.allowRecurrenceInt;
        nextAllowedJson = recNorm.allowedJson;
        nextAllowedWeekdaysJson = recNorm.allowedWeekdaysJson;
        nextDefaultFreq = recNorm.defaultFrequency;
        nextAllowedDurationsJson = recNorm.allowedPlanDurationsJson;
        nextDefaultDuration = recNorm.defaultPlanDuration;
        nextCustomIntervalsJson = recNorm.customIntervalsJson;
        nextDefaultIntervalJson = recNorm.defaultIntervalJson;
      }

      const isNextStudioService = isStudioCompat && nextDomain === 'studio';
      const hasBillingFieldUpdate =
        rawBillingMode !== undefined ||
        rawPeriodicPrice !== undefined ||
        rawDefaultPkgId !== undefined ||
        rawDefaultDueDay !== undefined ||
        rawPricingRule !== undefined ||
        rawIsPriceCustomized !== undefined ||
        rawSuggestedPrice !== undefined ||
        rawWeeklySessionsCount !== undefined ||
        price !== undefined ||
        !isNextStudioService;

      let nextBillingMode: string | null = existing.billing_mode || null;
      let nextPeriodicPrice: number | null = existing.periodic_price ?? null;
      let nextBillingCycleMonths: number | null = existing.billing_cycle_months ?? null;
      let nextDefaultPkgId: string | null = existing.default_package_id || null;
      let nextDefaultDueDay: number | null = existing.default_billing_due_day ?? null;
      let nextPricingRule: string = existing.pricing_rule || 'four_weeks';
      let nextIsPriceCustomized: number = existing.is_price_customized ?? 0;
      let nextSuggestedPrice: number | null = existing.suggested_price ?? null;
      let nextWeeklySessionsCount: number = existing.weekly_sessions_count ?? 1;

      if (hasBillingFieldUpdate) {
        const requestedCustomFlag =
          rawIsPriceCustomized === true || rawIsPriceCustomized === 1 || rawIsPriceCustomized === 'true'
            ? true
            : rawIsPriceCustomized === false || rawIsPriceCustomized === 0 || rawIsPriceCustomized === 'false'
              ? false
              : undefined;
        const existingParsedBill = parseServiceBillingConfig(existing);
        const isCurrentlyCustom = requestedCustomFlag !== undefined ? requestedCustomFlag : existingParsedBill.isPriceCustomized;
        const shouldAutoRecalcPeriodic =
          rawPeriodicPrice === undefined &&
          isCurrentlyCustom === false &&
          (requestedCustomFlag === false ||
            rawBillingMode !== undefined ||
            rawPricingRule !== undefined ||
            rawWeeklySessionsCount !== undefined ||
            price !== undefined);

        const billNorm = normalizeServiceBillingForSave({
          frequencyPricing: req.body.frequencyPricing === undefined ? readFrequencyPricing(existing.frequency_pricing_json) : req.body.frequencyPricing,
          isStudioService: isNextStudioService,
          billingMode: rawBillingMode !== undefined ? rawBillingMode : (isNextStudioService ? (existing.billing_mode || 'per_session') : 'per_session'),
          periodicPrice: rawPeriodicPrice !== undefined ? rawPeriodicPrice : (shouldAutoRecalcPeriodic ? undefined : existing.periodic_price),
          defaultPackageId: rawDefaultPkgId !== undefined ? rawDefaultPkgId : existing.default_package_id,
          defaultBillingDueDay: rawDefaultDueDay !== undefined ? rawDefaultDueDay : existing.default_billing_due_day,
          pricingRule: rawPricingRule !== undefined ? rawPricingRule : existing.pricing_rule,
          isPriceCustomized: requestedCustomFlag !== undefined ? requestedCustomFlag : existingParsedBill.isPriceCustomized,
          suggestedPrice: rawSuggestedPrice !== undefined ? rawSuggestedPrice : existing.suggested_price,
          weeklySessionsCount: rawWeeklySessionsCount !== undefined ? rawWeeklySessionsCount : existing.weekly_sessions_count,
          sessionPrice: price !== undefined && price !== null && price !== '' ? Number(price) : Number(existing.price || 0),
          tenantId,
          serviceId: String(id)
        });
        if (billNorm.error) {
          res.status(400).json({ error: billNorm.error });
          return;
        }
        nextBillingMode = billNorm.billingMode;
        nextPeriodicPrice = billNorm.periodicPrice;
        nextBillingCycleMonths = billNorm.billingCycleMonths;
        nextDefaultPkgId = billNorm.defaultPackageId;
        nextDefaultDueDay = billNorm.defaultBillingDueDay;
        nextPricingRule = billNorm.pricingRule;
        nextIsPriceCustomized = billNorm.isPriceCustomized ? 1 : 0;
        nextSuggestedPrice = billNorm.suggestedPrice;
        nextWeeklySessionsCount = billNorm.weeklySessionsCount;
      }

      let nextDefaultTplId: string | null = isNextStudioService ? (existing.default_template_id || null) : null;
      let nextLinkedTplJson: string | null = isNextStudioService ? (existing.linked_template_ids_json || null) : null;
      if (rawDefaultTplId !== undefined || rawLinkedTplIds !== undefined || !isNextStudioService) {
        const tplNorm = normalizeServiceTemplatesForSave({
          tenantId,
          isStudioService: isNextStudioService,
          defaultTemplateId: rawDefaultTplId !== undefined ? rawDefaultTplId : existing.default_template_id,
          linkedTemplateIds: rawLinkedTplIds !== undefined ? rawLinkedTplIds : existing.linked_template_ids_json
        });
        if (tplNorm.error) {
          res.status(400).json({ error: tplNorm.error });
          return;
        }
        nextDefaultTplId = tplNorm.defaultTemplateId;
        nextLinkedTplJson = tplNorm.linkedTemplateIdsJson;
      }

      const hasExplicitPrice = price !== undefined && price !== null && price !== '';
      const rawUpdPriceNum = hasExplicitPrice ? Number(price) : Number(existing.price || 0);
      const effectiveUpdatePrice =
        rawUpdPriceNum > 0 || (preserveExistingTerms && !hasExplicitPrice)
          ? rawUpdPriceNum
          : (nextPeriodicPrice && nextPeriodicPrice > 0 ? Number(nextPeriodicPrice) : 0);

      let nextAvailabilityMode: ServiceAvailabilityMode = isStudioCompat && nextDomain === 'studio' && nextKind === 'individual' && existing.availability_mode === 'custom_windows'
        ? 'custom_windows'
        : 'professional_schedule';
      let availShouldPersistWindows = false;
      let availValidatedWindows: ReturnType<typeof listServiceAvailabilityWindows> = [];

      if (rawAvailabilityMode !== undefined || rawAvailabilityWindows !== undefined) {
        const existingLinkedProfsForAvail = requestedLinkedIds !== undefined
          ? []
          : (isStudioCompat ? (getLinkedProfessionalsMap(tenantId, new Map([[String(id), targetProfId || null]])).get(String(id)) || []) : []);
        const effectiveAvailProfIds = requestedLinkedIds !== undefined
          ? Array.from(new Set([targetProfId, ...requestedLinkedIds].filter(Boolean)))
          : Array.from(new Set([targetProfId, ...existingLinkedProfsForAvail.map(lp => lp.id)].filter(Boolean)));
        const effModeInput = rawAvailabilityMode !== undefined ? rawAvailabilityMode : existing.availability_mode;
        const effWindowsInput = rawAvailabilityWindows !== undefined
          ? rawAvailabilityWindows
          : listServiceAvailabilityWindows(tenantId, String(id));
        const availNorm = normalizeAndValidateServiceAvailability({
          tenantId,
          isStudioCompat,
          serviceDomain: nextDomain,
          serviceKind: nextKind,
          professionalIds: effectiveAvailProfIds,
          rawAvailabilityMode: effModeInput,
          rawAvailabilityWindows: effWindowsInput
        });
        if (availNorm.error) {
          res.status(400).json({ error: availNorm.error });
          return;
        }
        nextAvailabilityMode = availNorm.availabilityMode;
        availShouldPersistWindows = availNorm.shouldPersistWindows;
        availValidatedWindows = availNorm.windows;
      }

      const updateStmt = db.prepare(`
        UPDATE services SET
          professional_id = CASE WHEN ? = 1 THEN ? ELSE professional_id END,
          specialty_id = CASE WHEN ? = 1 THEN ? ELSE specialty_id END,
          name = CASE WHEN ? = 1 THEN ? ELSE name END,
          description = CASE WHEN ? = 1 THEN ? ELSE description END,
          duration_minutes = CASE WHEN ? = 1 THEN ? ELSE duration_minutes END,
          buffer_minutes = CASE WHEN ? = 1 THEN ? ELSE buffer_minutes END,
          price = CASE WHEN ? = 1 THEN ? ELSE price END,
          modality = CASE WHEN ? = 1 THEN ? ELSE modality END,
          active = CASE WHEN ? = 1 THEN ? ELSE active END,
          min_lead_time_hours = CASE WHEN ? = 1 THEN ? ELSE min_lead_time_hours END,
          max_advance_days = CASE WHEN ? = 1 THEN ? ELSE max_advance_days END,
          cancellation_policy = CASE WHEN ? = 1 THEN ? ELSE cancellation_policy END,
          reminder_enabled = CASE WHEN ? = 1 THEN ? ELSE reminder_enabled END,
          reminder_value = CASE WHEN ? = 1 THEN ? ELSE reminder_value END,
          reminder_unit = CASE WHEN ? = 1 THEN ? ELSE reminder_unit END,
          clinical_module = CASE WHEN ? = 1 THEN ? ELSE clinical_module END,
          service_kind = ?,
          default_capacity = ?,
          allow_recurrence = ?,
          modality_category = ?,
          service_domain = ?,
          allowed_recurrence_frequencies_json = ?,
          default_recurrence_frequency = ?,
          allowed_plan_durations_json = ?,
          default_plan_duration = ?,
          custom_recurrence_intervals_json = ?,
          default_recurrence_interval_json = ?,
          billing_mode = ?,
          periodic_price = ?,
          billing_cycle_months = ?,
          default_package_id = ?,
          default_billing_due_day = ?,
          pricing_rule = ?,
          is_price_customized = ?,
          suggested_price = ?,
          weekly_sessions_count = ?,
          default_template_id = ?,
          linked_template_ids_json = ?,
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `);

      const scheduleWarnings: string[] = [];

      const frequencyPricing = req.body.frequencyPricing === undefined
        ? readFrequencyPricing(existing.frequency_pricing_json)
        : frequencyConfigForSave(req.body.frequencyPricing, establishmentProfile, nextDomain, nextBillingMode, nextStudioType);

      const nextRequiresAppt =
        isStudioCompat && nextDomain === 'studio' && (nextStudioType === 'facility_access' || nextStudioType === 'non_scheduled')
          ? 0
          : 1;
      const nextRequiresActiveContract =
        isStudioCompat && nextDomain === 'studio'
          ? (rawRequiresActiveContract !== undefined ? (rawRequiresActiveContract ? 1 : 0) : Number(existing.requires_active_contract ?? (nextStudioType === 'facility_access' ? 1 : 0)))
          : 0;
      const nextAllowPublicBooking =
        rawAllowPublicBooking !== undefined
          ? (rawAllowPublicBooking === false || rawAllowPublicBooking === 0 || rawAllowPublicBooking === '0' ? 0 : 1)
          : Number(existing.allow_public_booking ?? 1);
      const nextEffectiveStartDate =
        isStudioCompat && nextDomain === 'studio'
          ? (rawEffectiveStartDate !== undefined
              ? (rawEffectiveStartDate && /^\d{4}-\d{2}-\d{2}$/.test(String(rawEffectiveStartDate).slice(0, 10)) ? String(rawEffectiveStartDate).slice(0, 10) : null)
              : (existing.effective_start_date || null))
          : null;
      const nextEffectiveEndDate =
        isStudioCompat && nextDomain === 'studio'
          ? (rawEffectiveEndDate !== undefined
              ? (rawEffectiveEndDate && /^\d{4}-\d{2}-\d{2}$/.test(String(rawEffectiveEndDate).slice(0, 10)) ? String(rawEffectiveEndDate).slice(0, 10) : null)
              : (existing.effective_end_date || null))
          : null;
      const nextAccessConfig =
        isStudioCompat && nextDomain === 'studio' && nextStudioType === 'facility_access'
          ? normalizeStudioAccessConfig(rawAccessConfig !== undefined ? rawAccessConfig : existing.access_config_json)
          : null;
      const nextPricingAdjustments =
        isStudioCompat && nextDomain === 'studio'
          ? normalizeStudioPriceAdjustments(rawPricingAdjustments !== undefined ? rawPricingAdjustments : existing.pricing_adjustments_json)
          : [];
      const nextCommercialOptions =
        isStudioCompat && nextDomain === 'studio'
          ? normalizeCommercialPriceOptions(rawCommercialOptions !== undefined ? rawCommercialOptions : existing.commercial_price_options_json)
          : [];
      let nextOptionalAddonsJson: string | null =
        isStudioCompat && nextDomain === 'studio' ? (existing.optional_addons_json || null) : null;
      if (rawOptionalAddons !== undefined) {
        const addonsValidation = validateAndHydrateOptionalAddonsForSave({
          tenantId,
          establishmentProfile,
          isStudioCompat,
          serviceDomain: nextDomain,
          selfServiceId: String(id),
          rawOptionalAddons
        });
        if (addonsValidation.error) {
          res.status(400).json({ error: addonsValidation.error });
          return;
        }
        nextOptionalAddonsJson = addonsValidation.configJson;
      }

      db.transaction(() => {
        updateStmt.run(
          professionalId !== undefined ? 1 : 0, professionalId || null,
          specialtyId !== undefined ? 1 : 0, specialtyId || null,
          name !== undefined ? 1 : 0, name ? name.trim() : existing.name,
          description !== undefined ? 1 : 0, description !== null ? description : null,
          durationMinutes !== undefined ? 1 : 0, durationMinutes !== undefined ? Number(durationMinutes) : 50,
          bufferMinutes !== undefined ? 1 : 0, bufferMinutes !== undefined ? Number(bufferMinutes) : 10,
          (hasExplicitPrice || (Number(existing.price || 0) <= 0 && effectiveUpdatePrice > 0)) ? 1 : 0,
          effectiveUpdatePrice,
          modality !== undefined ? 1 : 0, modality || 'both',
          active !== undefined ? 1 : 0, active ? 1 : 0,
          (minLeadTimeHours !== undefined && minLeadTimeHours !== null && minLeadTimeHours !== '' && !Number.isNaN(Number(minLeadTimeHours))) ? 1 : 0,
          (minLeadTimeHours !== undefined && minLeadTimeHours !== null && minLeadTimeHours !== '' && !Number.isNaN(Number(minLeadTimeHours))) ? Math.max(0, Number(minLeadTimeHours)) : 2,
          (maxAdvanceDays !== undefined && maxAdvanceDays !== null && maxAdvanceDays !== '' && !Number.isNaN(Number(maxAdvanceDays))) ? 1 : 0,
          (maxAdvanceDays !== undefined && maxAdvanceDays !== null && maxAdvanceDays !== '' && !Number.isNaN(Number(maxAdvanceDays))) ? Math.max(1, Number(maxAdvanceDays)) : 60,
          cancellationPolicy !== undefined ? 1 : 0, cancellationPolicy || null,
          reminderEnabled !== undefined ? 1 : 0, reminderEnabled ? 1 : 0,
          reminderValue !== undefined ? 1 : 0, reminderEnabled && reminderValue ? Number(reminderValue) : null,
          reminderUnit !== undefined ? 1 : 0, reminderEnabled && reminderUnit ? String(reminderUnit).toUpperCase() : 'DAYS',
          (clinicalModule !== undefined || nextStudioType === 'facility_access' || nextStudioType === 'non_scheduled') ? 1 : 0,
          nextStudioType === 'facility_access' || nextStudioType === 'non_scheduled' ? null : (clinicalModule || null),
          nextKind,
          nextCapacity,
          nextAllowRec,
          nextModCat,
          nextDomain,
          nextAllowedJson,
          nextDefaultFreq,
          nextAllowedDurationsJson,
          nextDefaultDuration,
          nextCustomIntervalsJson,
          nextDefaultIntervalJson,
          nextBillingMode,
          nextPeriodicPrice,
          nextBillingCycleMonths,
          nextDefaultPkgId,
          nextDefaultDueDay,
          nextPricingRule,
          nextIsPriceCustomized,
          nextSuggestedPrice,
          nextWeeklySessionsCount,
          nextDefaultTplId,
          nextLinkedTplJson,
          id,
          tenantId
        );

        const nextCustomPrice = effectiveUpdatePrice > 0 ? effectiveUpdatePrice : (hasExplicitPrice ? Number(price) : null);
        const nextCustomDuration = durationMinutes !== undefined && durationMinutes !== null && durationMinutes !== '' ? Number(durationMinutes) : null;

        db.prepare(`
          UPDATE services
          SET frequency_pricing_json = ?,
              allowed_recurrence_weekdays_json = ?,
              availability_mode = ?,
              studio_service_type = ?,
              requires_appointment = ?,
              requires_active_contract = ?,
              allow_public_booking = ?,
              effective_start_date = ?,
              effective_end_date = ?,
              access_config_json = ?,
              pricing_adjustments_json = ?,
              commercial_price_options_json = ?,
              optional_addons_json = ?
          WHERE id = ? AND tenant_id = ?
        `).run(
          frequencyPricing ? JSON.stringify(frequencyPricing) : null,
          isStudioCompat && nextDomain === 'studio' ? nextAllowedWeekdaysJson : null,
          nextAvailabilityMode,
          isStudioCompat && nextDomain === 'studio' ? nextStudioType : 'individual',
          nextRequiresAppt,
          nextRequiresActiveContract,
          nextAllowPublicBooking,
          nextEffectiveStartDate,
          nextEffectiveEndDate,
          nextAccessConfig ? JSON.stringify(nextAccessConfig) : null,
          nextPricingAdjustments.length > 0 ? JSON.stringify(nextPricingAdjustments) : null,
          nextCommercialOptions.length > 0 ? JSON.stringify(nextCommercialOptions) : null,
          nextOptionalAddonsJson,
          req.params.id,
          tenantId
        );

        if (availShouldPersistWindows) {
          saveServiceAvailabilityWindowsTx(tenantId, String(id), targetProfId || null, availValidatedWindows);
        }

        validateAndSyncLinkedInstructorsTx({
          tenantId,
          serviceId: String(id),
          primaryProfId: targetProfId || null,
          requestedIds: requestedLinkedIds,
          isStudioCompat,
          serviceDomain: nextDomain,
          price: nextCustomPrice,
          durationMinutes: nextCustomDuration,
          isUpdate: true,
          preserveExistingTerms,
          clearIfNoPrimary: nextStudioType === 'facility_access' && !targetProfId && requestedLinkedIds === undefined
        });

        if (isStudioCompat && nextKind === 'group' && rawClassSchedules.length > 0 && PackageService.isStudioCompatible(tenantId)) {
          for (const item of rawClassSchedules) {
            const out = ClassScheduleService.createSchedules(tenantId, String(id), item, req.user?.userId || '');
            if (out.warnings?.length) scheduleWarnings.push(...out.warnings);
          }
        }
        if (isStudioCompat && nextDomain === 'studio' && nextKind === 'group' && nextAllowRec === 1) {
          const activeGroupRows = ClassScheduleService.listForService(tenantId, String(id), { includeInactive: false });
          if (activeGroupRows.length > 0) {
            const derivedGroupWeekdays = Array.from(
              new Set(activeGroupRows.map(cs => Number(cs.day_of_week)))
            ).filter(n => Number.isInteger(n) && n >= 0 && n <= 6).sort((a, b) => a - b);
            const derivedJson = derivedGroupWeekdays.length > 0 ? JSON.stringify(derivedGroupWeekdays) : null;
            nextAllowedWeekdaysJson = derivedJson;
            db.prepare('UPDATE services SET allowed_recurrence_weekdays_json = ? WHERE id = ? AND tenant_id = ?')
              .run(derivedJson, String(id), tenantId);
          }
        }
      })();

      logAudit(req, 'UPDATE_SERVICE', 'services', id, { name: name || existing.name, professionalId, studioServiceType: nextStudioType, linkedCount: requestedLinkedIds?.length });
      const updatedService = db.prepare(`
        SELECT s.*, COALESCE(s.service_kind, 'individual') as service_kind, COALESCE(s.allow_recurrence, 1) as allow_recurrence,
               p.name as professional_name
        FROM services s
        LEFT JOIN professionals p ON p.id = s.professional_id
        WHERE s.id = ? AND s.tenant_id = ?
      `).get(id, tenantId) as any;
      const updatedSchedules = isStudioCompat
        ? ClassScheduleService.listForService(tenantId, String(id), { includeInactive: true })
        : [];
      const parsedUpdRec = isStudioCompat && updatedService
        ? parseServiceRecurrenceConfig(updatedService)
        : null;
      const linkedUpdProfs = isStudioCompat && updatedService
        ? (getLinkedProfessionalsMap(tenantId, new Map([[String(id), updatedService.professional_id || null]])).get(String(id)) || [])
        : [];
      const linkedUpdIds = linkedUpdProfs.length > 0
        ? linkedUpdProfs.map(lp => lp.id)
        : (updatedService?.professional_id ? [updatedService.professional_id] : []);
      const updatedDiagnostics = isStudioCompat && updatedService && (updatedService.service_kind || 'individual') === 'group'
        ? ClassScheduleService.diagnoseServiceSchedules(tenantId, String(id), updatedSchedules)
        : null;
      const updSupportsCustomAvail = Boolean(
        isStudioCompat &&
        updatedService &&
        resolveServiceDomain({
          establishmentProfile,
          serviceDomain: updatedService.service_domain,
          serviceKind: updatedService.service_kind,
          clinicalModule: updatedService.clinical_module
        }) === 'studio' &&
        (updatedService.service_kind || 'individual') === 'individual' &&
        nextRequiresAppt === 1
      );
      const updAvailMode: ServiceAvailabilityMode =
        updSupportsCustomAvail && updatedService?.availability_mode === 'custom_windows'
          ? 'custom_windows'
          : 'professional_schedule';
      const updAvailWindows = updSupportsCustomAvail
        ? listServiceAvailabilityWindows(tenantId, String(id))
        : [];
      const updAvailDiagnostics = updSupportsCustomAvail && updAvailMode === 'custom_windows'
        ? diagnoseServiceAvailability(tenantId, linkedUpdIds, updAvailWindows)
        : null;
      const updTemplatesMap = isStudioCompat ? getTenantTemplatesMap(tenantId) : new Map<string, LinkedTemplateSummary>();
      const updTplInfo = updatedService
        ? enrichServiceTemplates(updatedService, updTemplatesMap, isStudioCompat && updatedService.service_domain === 'studio')
        : { default_template_id: null, default_template_title: null, linked_template_ids: [], linked_templates: [] };
      const enrichedUpdated = updatedService
        ? {
            ...updatedService,
            catalog_price: Number(updatedService.price || 0) > 0 ? Number(updatedService.price) : Number(updatedService.periodic_price || 0),
            service_kind: isStudioCompat ? (updatedService.service_kind || 'individual') : 'individual',
            studio_service_type: isStudioCompat && updatedService.service_domain === 'studio' ? nextStudioType : 'individual',
            requires_appointment: nextRequiresAppt,
            requires_active_contract: nextRequiresActiveContract,
            allow_public_booking: nextAllowPublicBooking,
            effective_start_date: nextEffectiveStartDate,
            effective_end_date: nextEffectiveEndDate,
            access_config: nextAccessConfig,
            pricing_adjustments: nextPricingAdjustments,
            commercial_price_options: nextCommercialOptions,
            default_capacity: isStudioCompat ? updatedService.default_capacity : null,
            service_domain: resolveServiceDomain({
              establishmentProfile,
              serviceDomain: updatedService.service_domain,
              serviceKind: updatedService.service_kind,
              clinicalModule: updatedService.clinical_module
            }),
            billing_mode: isStudioCompat && updatedService.service_domain === 'studio' ? (updatedService.billing_mode || 'per_session') : 'per_session',
            periodic_price: isStudioCompat && updatedService.service_domain === 'studio' ? (updatedService.periodic_price ?? null) : null,
            billing_cycle_months: isStudioCompat && updatedService.service_domain === 'studio' ? (updatedService.billing_cycle_months ?? null) : null,
            default_package_id: isStudioCompat && updatedService.service_domain === 'studio' ? (updatedService.default_package_id || null) : null,
            default_billing_due_day: isStudioCompat && updatedService.service_domain === 'studio' ? (updatedService.default_billing_due_day ?? null) : null,
            pricing_rule: isStudioCompat && updatedService.service_domain === 'studio' ? (updatedService.pricing_rule || 'four_weeks') : 'four_weeks',
            is_price_customized: isStudioCompat && updatedService.service_domain === 'studio' ? (updatedService.is_price_customized ?? 0) : 0,
            suggested_price: isStudioCompat && updatedService.service_domain === 'studio' ? (updatedService.suggested_price ?? null) : null,
            weekly_sessions_count: isStudioCompat && updatedService.service_domain === 'studio' ? (updatedService.weekly_sessions_count ?? 1) : 1,
            frequency_pricing: isStudioCompat && updatedService.service_domain === 'studio' ? readFrequencyPricing(updatedService.frequency_pricing_json) : null,
            default_template_id: updTplInfo.default_template_id,
            default_template_title: updTplInfo.default_template_title,
            linked_template_ids: updTplInfo.linked_template_ids,
            linked_templates: updTplInfo.linked_templates,
            allow_recurrence: parsedUpdRec ? (parsedUpdRec.allowRecurrence ? 1 : 0) : (updatedService.allow_recurrence ?? 1),
            allowed_recurrence_frequencies: parsedUpdRec ? parsedUpdRec.allowedFrequencies : undefined,
            allowed_recurrence_weekdays: parsedUpdRec ? parsedUpdRec.allowedWeekdays : undefined,
            default_recurrence_frequency: parsedUpdRec ? parsedUpdRec.defaultFrequency : null,
            allowed_plan_durations: parsedUpdRec ? parsedUpdRec.allowedPlanDurations : undefined,
            default_plan_duration: parsedUpdRec ? parsedUpdRec.defaultPlanDuration : null,
            custom_recurrence_intervals: parsedUpdRec ? parsedUpdRec.customIntervals : undefined,
            default_recurrence_interval: parsedUpdRec ? parsedUpdRec.defaultCustomInterval : null,
            linked_professional_ids: linkedUpdIds,
            linked_professionals: linkedUpdProfs,
            class_schedules: updatedSchedules,
            weekly_schedule_summary: buildWeeklyScheduleSummary(updatedSchedules),
            schedule_diagnostics: updatedDiagnostics,
            schedule_warnings: scheduleWarnings,
            availability_mode: updAvailMode,
            availability_windows: updAvailWindows,
            availability_diagnostics: updAvailDiagnostics
          }
        : updatedService;
      res.json({ success: true, message: 'Serviço atualizado com sucesso', service: enrichedUpdated, schedule_warnings: scheduleWarnings, ...(enrichedUpdated || {}) });
    } catch (err: any) {
      console.error('[ServiceController.update] Erro:', err);
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao atualizar serviço', ...(err?.code ? { code: err.code } : {}) });
    }
  }

  static quoteCommercial(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Estabelecimento não identificado.' });
        return;
      }
      const serviceId = String(req.params.id || req.body?.serviceId || '').trim();
      if (!serviceId) {
        res.status(400).json({ error: 'Serviço obrigatório.' });
        return;
      }

      const srv = db.prepare(`SELECT * FROM services WHERE id = ? AND tenant_id = ?`).get(serviceId, tenantId) as any;
      if (!srv) {
        res.status(404).json({ error: 'Serviço não encontrado neste estabelecimento.' });
        return;
      }

      const options = normalizeCommercialPriceOptions(srv.commercial_price_options_json);
      const adjustments = normalizeStudioPriceAdjustments(srv.pricing_adjustments_json);

      const requestedOptionId = req.body?.optionId ? String(req.body.optionId).trim() : null;
      const selectedOption = requestedOptionId
        ? options.find(o => o.id === requestedOptionId && o.active)
        : (options.find(o => o.active) || null);

      const effectiveBaseOption = selectedOption || buildFallbackBaseCommercialOption(srv);
      const optionBreakdown = selectedOption
        ? calculateCommercialOptionBreakdown(selectedOption, {
            participantsCount: req.body?.participantsCount ? Number(req.body.participantsCount) : undefined,
            sessionsInContract: req.body?.sessionsInContract ? Number(req.body.sessionsInContract) : undefined,
            sessionsPerMonth: req.body?.sessionsPerMonth ? Number(req.body.sessionsPerMonth) : undefined
          })
        : null;

      const requestedAddonIds = Array.isArray(req.body?.addonOptionIds)
        ? req.body.addonOptionIds.map((v: any) => String(v))
        : (Array.isArray(req.body?.selectedAddonOptionIds) ? req.body.selectedAddonOptionIds.map((v: any) => String(v)) : []);
      const addonsCfg = normalizeOptionalAddonsConfig(srv.optional_addons_json);
      const selectedAddons = requestedAddonIds.length > 0 && addonsCfg.enabled
        ? addonsCfg.options.filter(
            (opt) => requestedAddonIds.includes(opt.id) && addonAppliesToBaseOption(opt, selectedOption?.id || null)
          )
        : [];
      const planWithAddonsBreakdown = selectedAddons.length > 0
        ? calculatePlanWithAddonsBreakdown({
            baseOption: effectiveBaseOption,
            selectedAddons,
            participantsCount: req.body?.participantsCount ? Number(req.body.participantsCount) : undefined
          })
        : null;

      const basePrice = optionBreakdown
        ? optionBreakdown.cycleAmountReais
        : Number(req.body?.basePrice ?? srv.price ?? srv.periodic_price ?? 0);

      const slotEval = evaluateStudioPriceAdjustments({
        basePrice,
        rules: adjustments,
        weekday: req.body?.weekday !== undefined ? Number(req.body.weekday) : null,
        timeHhmm: req.body?.timeHhmm || req.body?.startTime || null,
        modality: req.body?.modality || null,
        professionalId: req.body?.professionalId || null,
        sessionType: req.body?.sessionType || null,
        participantsCount: req.body?.participantsCount ? Number(req.body.participantsCount) : 1
      });

      res.json({
        serviceId: srv.id,
        serviceName: srv.name,
        selectedOption,
        optionBreakdown,
        priceAdjustment: slotEval,
        finalCycleAmountReais: slotEval.finalPrice,
        finalTotalContractReais: optionBreakdown
          ? Math.max(0, Math.round((optionBreakdown.totalContractAmountReais + slotEval.netAdjustment * optionBreakdown.billingCyclesCount) * 100) / 100)
          : slotEval.finalPrice
      });
    } catch (err: any) {
      console.error('[ServiceController.quoteCommercial] Erro:', err);
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao calcular cotação comercial.' });
    }
  }

  static delete(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const service = db.prepare('SELECT id, name, active FROM services WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!service) {
        res.status(404).json({ error: 'Serviço não encontrado' });
        return;
      }

      // Verificação de vínculos históricos antes de excluir:
      // 1. Agendamentos
      const appointmentCount = (db.prepare('SELECT COUNT(*) as count FROM appointments WHERE service_id = ? AND tenant_id = ?').get(id, tenantId) as any)?.count || 0;

      // 2. Atendimentos (consultas realizadas/em andamento ou com prontuário clínico gerado)
      const consultationCount = (db.prepare(`
        SELECT COUNT(*) as count 
        FROM appointments a
        WHERE a.service_id = ? AND a.tenant_id = ? 
          AND (a.status IN ('completed', 'in_progress') OR EXISTS (SELECT 1 FROM records r WHERE r.appointment_id = a.id))
      `).get(id, tenantId) as any)?.count || 0;

      // 3. Financeiro (pagamentos ou recibos emitidos vinculados ao serviço)
      const financialCount = (db.prepare(`
        SELECT COUNT(*) as count 
        FROM appointments a
        WHERE a.service_id = ? AND a.tenant_id = ? 
          AND (
            EXISTS (SELECT 1 FROM payments p WHERE p.appointment_id = a.id) OR 
            EXISTS (SELECT 1 FROM receipts rec WHERE rec.appointment_id = a.id)
          )
      `).get(id, tenantId) as any)?.count || 0;

      // 4. Histórico (encaminhamentos ou outros registros vinculados)
      let referralCount = 0;
      const hasReferralsTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='patient_referrals'").get();
      if (hasReferralsTable) {
        referralCount = (db.prepare('SELECT COUNT(*) as count FROM patient_referrals WHERE service_id = ? AND tenant_id = ?').get(id, tenantId) as any)?.count || 0;
      }

      const hasHistoricalLinks = appointmentCount > 0 || consultationCount > 0 || financialCount > 0 || referralCount > 0;

      if (hasHistoricalLinks) {
        // Se houver vínculo histórico, evitar exclusão destrutiva e preferir desativação/inativação, preservando registros antigos
        db.prepare("UPDATE services SET active = 0, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").run(id, tenantId);

        logAudit(req, 'INACTIVATE_SERVICE', 'services', id, {
          name: service.name,
          reason: 'historical_links',
          appointmentCount,
          consultationCount,
          financialCount,
          referralCount
        });

        res.json({
          success: true,
          action: 'inactivated',
          message: 'O serviço possui vínculos históricos (agendamentos, atendimentos ou registros financeiros) e foi inativado para preservar os dados.',
          service: { id: service.id, name: service.name, active: 0 }
        });
        return;
      }

      // Se NÃO houver vínculos históricos, executar exclusão segura
      db.prepare('DELETE FROM professional_services WHERE service_id = ?').run(id);
      db.prepare('DELETE FROM services WHERE id = ? AND tenant_id = ?').run(id, tenantId);

      logAudit(req, 'DELETE_SERVICE', 'services', id, { name: service.name });

      res.json({
        success: true,
        action: 'deleted',
        message: 'Serviço excluído com sucesso.'
      });
    } catch (err: any) {
      console.error('[ServiceController.delete] Erro:', err);
      res.status(500).json({ error: 'Erro ao processar exclusão do serviço' });
    }
  }

  // Salas
  static listRooms(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const stmt = db.prepare('SELECT id, name, description, active FROM rooms WHERE tenant_id = ? ORDER BY name ASC');
      const rooms = stmt.all(tenantId);
      res.json(rooms);
    } catch (err: any) {
      console.error('[ServiceController.listRooms] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar salas' });
    }
  }

  static createRoom(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { name, description } = req.body;
      if (!name) {
        res.status(400).json({ error: 'Nome da sala é obrigatório' });
        return;
      }

      const id = 'room-' + uuidv4().slice(0, 8);
      const insertStmt = db.prepare('INSERT INTO rooms (id, tenant_id, name, description, active) VALUES (?, ?, ?, ?, 1)');
      insertStmt.run(id, tenantId, name, description || null);

      res.status(201).json({ id, name, message: 'Sala cadastrada com sucesso' });
    } catch (err: any) {
      console.error('[ServiceController.createRoom] Erro:', err);
      res.status(500).json({ error: 'Erro ao cadastrar sala' });
    }
  }
}
