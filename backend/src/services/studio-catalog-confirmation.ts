import { randomUUID } from 'node:crypto';
import { Request } from 'express';
import { db } from '../config/database';
import { ServiceController, ServiceSaveResponse } from '../controllers/service.controller';
import { getTenantEstablishmentProfile, PLAN_DURATION_MONTHS, resolveServiceDomain } from '../utils/establishment-context';
import { isProfessionalEligibleForAddonService, listTenantAddonProfessionalsDetailed } from '../utils/studio-addon-eligibility';
import { checkProfessionalScheduleCoverage, getProfessionalScheduleSegmentsForDay, parseClockMinutes, WEEKDAY_NAMES_PT } from '../utils/service-availability';
import {
  getPaymentPeriodicityCycleMonths,
  normalizeCommercialPriceOptions,
  normalizeOptionalAddonsConfig,
  normalizeStudioPriceAdjustments,
  normalizeStudioServiceType,
  resolveDefaultAddonCreditsPerCycle,
  StudioOptionalAddonOption
} from '../utils/studio-access-and-commercial';
import { PackageService } from './package.service';
import { minutesToHHMM, todayBrazilYmd } from './class-schedule.service';
import { catalogError } from './studio-catalog-files';
import { hasVariantConflict, nameKey, priceConditionKey, semanticTokens } from './studio-catalog-proposal';
import type {
  CatalogMatchCandidate,
  CatalogProfessionalSummary,
  CatalogWorkShift,
  ImportAlert,
  ImportDiagnostics,
  ImportIgnoredItem,
  ImportReceipt,
  ImportReceiptItem,
  ProposedPackage,
  ProposedPrice,
  ProposedService,
  ScheduleSlotCheck,
  StudioProposal
} from '../shared/studio-catalog-contract';

type CatalogService = {
  id: string; name: string; price: number; professional_id: string | null; default_capacity: number | null;
  duration_minutes: number; service_domain: string | null; service_kind: string; studio_service_type: string;
  clinical_module: string | null; modality_category?: string | null; requires_appointment?: number;
  allow_public_booking?: number;
  active: number; commercial_price_options_json: string | null;
  pricing_adjustments_json: string | null; access_config_json: string | null; availability_mode: string | null;
  optional_addons_json?: string | null;
};

const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function readStudioImportCatalog(tenantId: string) {
  const profile = getTenantEstablishmentProfile(tenantId);
  const services = (db.prepare('SELECT * FROM services WHERE tenant_id = ? ORDER BY name').all(tenantId) as CatalogService[])
    .filter(s => resolveServiceDomain({
      establishmentProfile: profile, serviceDomain: s.service_domain, serviceKind: s.service_kind, clinicalModule: s.clinical_module
    }) === 'studio');
  const packages = db.prepare('SELECT id, name, active, COALESCE(allow_public_booking, 1) as allow_public_booking FROM service_packages WHERE tenant_id = ? ORDER BY name').all(tenantId) as
    { id: string; name: string; active: number; allow_public_booking?: number }[];
  const profDetails = listTenantAddonProfessionalsDetailed(tenantId).filter(p => p.active);

  const professionals: CatalogProfessionalSummary[] = profDetails.map(p => {
    const workShifts: CatalogWorkShift[] = [];
    const summaryParts: string[] = [];
    for (let dow = 0; dow <= 6; dow++) {
      const segs = getProfessionalScheduleSegmentsForDay(tenantId, p.id, dow);
      if (segs.length > 0) {
        for (const seg of segs) {
          workShifts.push({ dayOfWeek: dow, startTime: minutesToHHMM(seg.start), endTime: minutesToHHMM(seg.end) });
        }
        summaryParts.push(`${WEEKDAY_SHORT[dow]} ${segs.map(s => `${minutesToHHMM(s.start)}–${minutesToHHMM(s.end)}`).join(', ')}`);
      }
    }
    const hasActiveSchedule = p.hasActiveSchedule || workShifts.length > 0;
    const isStudioEligible = !p.isAdminManager && !p.isClinicalOnlyWithoutFitness;
    return {
      id: p.id,
      name: p.name,
      professionId: p.professionId,
      professionName: p.professionName,
      availableModules: p.availableModules,
      linkedServiceIds: p.linkedServiceIds,
      hasActiveSchedule,
      isAdminManager: p.isAdminManager,
      isStudioEligible,
      publicBookingEnabled: p.publicBookingEnabled,
      workShifts,
      scheduleSummary: summaryParts.length > 0 ? summaryParts.join(' · ') : 'Sem escala semanal ativa'
    };
  });

  return { services, packages, professionals };
}

export function scoreCatalogSimilarity(a: string, b: string): { score: number; reason: string } {
  const rawLeft = nameKey(a);
  const rawRight = nameKey(b);
  if (!rawLeft || !rawRight) return { score: 0, reason: '' };
  if (rawLeft === rawRight) return { score: 100, reason: 'Nome exato' };

  const tokensA = new Set(semanticTokens(a));
  const tokensB = new Set(semanticTokens(b));
  const cleanA = [...tokensA].join(' ');
  const cleanB = [...tokensB].join(' ');
  if (cleanA && cleanA === cleanB) return { score: 95, reason: 'Mesmo nome normalizado' };

  const shared = [...tokensA].filter(t => tokensB.has(t)).length;
  const maxLen = Math.max(tokensA.size, tokensB.size, 1);
  const overlap = shared / maxLen;
  const contains = Boolean(cleanA && cleanB && (cleanA.includes(cleanB) || cleanB.includes(cleanA)));

  let score = Math.round(overlap * 80);
  if (contains && overlap >= 0.4) score = Math.max(score, 72);
  if (hasVariantConflict(a, b)) score = Math.max(0, score - 25);

  const reason = score >= 85
    ? 'Alta semelhança'
    : score >= 50
      ? 'Nome semelhante'
      : '';
  return { score, reason };
}

export function similarCatalogName(a: string, b: string) {
  return scoreCatalogSimilarity(a, b).score >= 45;
}

export function buildMatchCandidates(
  proposal: StudioProposal,
  catalog: ReturnType<typeof readStudioImportCatalog>
): { services: Record<string, CatalogMatchCandidate[]>; packages: Record<string, CatalogMatchCandidate[]> } {
  const mappedServices = catalog.services.map(s => ({
    id: s.id,
    name: s.name,
    active: Boolean(s.active),
    type: s.studio_service_type,
    capacity: s.default_capacity,
    professionalId: s.professional_id
  }));

  const services: Record<string, CatalogMatchCandidate[]> = {};
  for (const row of proposal.services) {
    const targetOpType = row.type ? serviceType(row.type) : null;
    services[row.key] = mappedServices
      .map(c => {
        const sim = scoreCatalogSimilarity(row.name, c.name);
        let bonus = 0;
        if (targetOpType && normalizeStudioServiceType(c.type, c.type === 'group' ? 'group' : 'individual') === targetOpType) {
          bonus += 10;
        }
        return {
          ...c,
          score: sim.score > 0 ? Math.min(100, sim.score + bonus) : 0,
          matchReason: sim.reason || 'Semelhança parcial'
        };
      })
      .filter(m => m.score >= 45)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
  }

  const packages: Record<string, CatalogMatchCandidate[]> = {};
  for (const row of proposal.packages) {
    packages[row.key] = catalog.packages
      .map(p => {
        const sim = scoreCatalogSimilarity(row.name, p.name);
        return {
          id: p.id,
          name: p.name,
          active: Boolean(p.active),
          score: sim.score,
          matchReason: sim.reason
        };
      })
      .filter(m => m.score >= 45)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
  }

  return { services, packages };
}

function matchProfessionalByName(
  rawName: string,
  professionals: CatalogProfessionalSummary[]
): CatalogProfessionalSummary | null {
  const clean = semanticTokens(rawName).join(' ') || nameKey(rawName);
  if (!clean) return null;
  const exact = professionals.filter(p => nameKey(p.name) === clean || (semanticTokens(p.name).join(' ') || nameKey(p.name)) === clean);
  if (exact.length === 1) return exact[0];
  const tokenMatches = professionals.filter(p => {
    const pTokens = new Set(semanticTokens(p.name));
    const qTokens = semanticTokens(rawName);
    return qTokens.length > 0 && qTokens.every(qt => pTokens.has(qt) || [...pTokens].some(pt => pt.startsWith(qt)));
  });
  return tokenMatches.length === 1 ? tokenMatches[0] : null;
}

export function attachSuggestedProfessionals(
  proposal: StudioProposal,
  catalog: ReturnType<typeof readStudioImportCatalog>
): StudioProposal {
  const services = proposal.services.map(row => {
    const nextProfNames = row.professionalNames || [];
    let suggestedProfId = row.suggestedProfessionalId;
    if (!row.professionalId && !suggestedProfId && nextProfNames.length === 1) {
      suggestedProfId = matchProfessionalByName(nextProfNames[0], catalog.professionals)?.id;
    }
    const schedules = row.schedules.map(slot => {
      if (slot.professionalId || slot.suggestedProfessionalId || !slot.professionalName) return slot;
      const matched = matchProfessionalByName(slot.professionalName, catalog.professionals);
      return matched ? { ...slot, suggestedProfessionalId: matched.id } : slot;
    });
    return {
      ...row,
      ...(suggestedProfId ? { suggestedProfessionalId: suggestedProfId } : {}),
      schedules
    };
  });
  return { ...proposal, services };
}

function priceHasValidationIssue(p: ProposedPrice, rowType: ProposedService['type'], opType: string): string | null {
  if (!p.amountCents || !p.unit) {
    return 'Confirme a unidade comercial e o valor do preço.';
  }
  const isStandalone = p.unit === 'per_session' && !p.duration && !p.frequencyType && (!p.paymentPeriod || p.paymentPeriod === 'one_time');
  if (isStandalone) {
    if (opType === 'facility_access' || opType === 'non_scheduled') {
      return 'Serviço sem hora marcada precisa estar em uma opção comercial (ex.: por mês ou total do contrato).';
    }
    return null;
  }
  const limitedAccess = p.frequencyType === 'unlimited'
    ? false
    : (p.frequencyType === 'weekly' || p.frequencyType === 'monthly' || rowType === 'access_limited');
  const accessType = opType === 'facility_access' ? (limitedAccess ? 'limited' : 'unlimited') : 'scheduled';
  const frequencyType = p.frequencyType || (accessType === 'unlimited' ? 'unlimited' : null);

  if (!p.duration || !p.paymentPeriod || !frequencyType || (frequencyType !== 'unlimited' && p.frequencyCount === null)) {
    return 'Confirme duração, periodicidade de cobrança e frequência da opção.';
  }
  if (p.paymentPeriod === 'installments' && (!p.installments || p.unit !== 'contract_total')) {
    return 'Parcelamento exige selecionar "Total do contrato" e informar o número de parcelas.';
  }
  if (p.unit === 'per_participant' && !p.participants && rowType !== 'duo') {
    return 'Informe a quantidade de participantes para preço por participante.';
  }
  if (p.unit === 'per_month' && p.paymentPeriod !== 'monthly') {
    return 'Preço "Por mês" requer cobrança Mensal ou conversão explícita para Total do contrato.';
  }
  if (p.unit === 'contract_total' && !['one_time', 'installments'].includes(p.paymentPeriod)) {
    return 'Preço "Total do contrato" requer cobrança À vista ou Parcelada.';
  }
  if ((PLAN_DURATION_MONTHS[p.duration] || 0) % getPaymentPeriodicityCycleMonths(p.paymentPeriod) !== 0) {
    return 'Duração incompatível com o ciclo de cobrança.';
  }
  if (opType === 'facility_access' && frequencyType === 'fixed_count') {
    return 'Planos de academia limitada devem usar frequência semanal ou mensal.';
  }
  if (accessType === 'limited' && (frequencyType === 'unlimited' || (frequencyType === 'weekly' && (p.frequencyCount || 0) > 50))) {
    return 'Confirme a frequência do acesso limitado (até 50/semana).';
  }
  return null;
}

export function buildProposalDiagnostics(
  tenantId: string,
  proposal: StudioProposal,
  catalog: ReturnType<typeof readStudioImportCatalog>,
  matches: { services: Record<string, CatalogMatchCandidate[]>; packages: Record<string, CatalogMatchCandidate[]> }
): ImportDiagnostics {
  const alerts: ImportAlert[] = [];
  const scheduleChecks: Record<string, ScheduleSlotCheck[]> = {};
  const profById = new Map(catalog.professionals.map(p => [p.id, p]));
  const activeServicesByKey = new Set<string>();
  for (const s of catalog.services) {
    if (s.active) activeServicesByKey.add('existing:' + s.id);
  }
  for (const row of proposal.services) {
    if (row.action !== 'ignore') activeServicesByKey.add(row.key);
  }

  let servicesReady = 0;
  let servicesPending = 0;
  let priceOptionsTotal = 0;
  let ambiguousPricesCount = 0;
  let schedulesTotal = 0;
  let incompleteSchedulesCount = 0;
  let scheduleConflictsCount = 0;
  let duplicatesFound = 0;
  let deferredScheduleServices = 0;

  for (const row of proposal.services) {
    priceOptionsTotal += row.prices.length;
    schedulesTotal += row.schedules.length;
    if ((matches.services[row.key] || []).length > 0) duplicatesFound++;

    const current = row.action === 'update' || row.action === 'link'
      ? catalog.services.find(s => s.active && s.id === row.existingId)
      : undefined;
    const opType = current
      ? normalizeStudioServiceType(current.studio_service_type, current.service_kind)
      : serviceType(row.type);
    const effectiveKindType = current ? currentServiceType(current) : row.type;
    const isScheduled = opType === 'group' || opType === 'individual';
    const capacity = current ? current.default_capacity : (row.type === 'duo' ? 2 : row.capacity);
    const duration = current ? current.duration_minutes : row.durationMinutes;
    const checkSchedulesNow = (row.action === 'create' || (row.action === 'update' && row.apply.includes('schedules'))) && !row.deferSchedules;
    const severityFor = (blockingIfActive: boolean): 'blocking' | 'warning' =>
      row.action !== 'ignore' && blockingIfActive ? 'blocking' : 'warning';

    const rowChecks: ScheduleSlotCheck[] = [];
    const seenSlots = new Map<string, number | null>();

    for (let i = 0; i < row.schedules.length; i++) {
      const slot = row.schedules[i];
      if (!isScheduled) {
        rowChecks.push({
          index: i,
          status: 'not_schedulable',
          message: 'Serviço sem agendamento não utiliza horários na grade.'
        });
        continue;
      }

      const start = parseClockMinutes(slot.startTime);
      const end = parseClockMinutes(slot.endTime);
      if (slot.dayOfWeek === null || start === null || end === null || end <= start) {
        incompleteSchedulesCount++;
        const msg = slot.startTime && !slot.endTime
          ? `Início ${slot.startTime} sem horário de término — aplique a duração padrão ou informe o término.`
          : 'Horário incompleto (confirme dia da semana, início e término válido).';
        rowChecks.push({ index: i, status: 'incomplete', message: msg });
        if (!row.deferSchedules) {
          alerts.push({
            id: `sch-${row.key}-${i}`,
            scope: 'service',
            recordKey: row.key,
            recordName: row.name || 'Serviço',
            section: 'schedules',
            severity: severityFor(checkSchedulesNow),
            message: `${row.name || 'Serviço'} · Horário ${i + 1}: ${msg}`
          });
        }
        continue;
      }

      const targetProfId = slot.professionalId || row.professionalId || (current?.professional_id || '');
      const prof = profById.get(targetProfId);
      if (!prof) {
        rowChecks.push({
          index: i,
          status: 'missing_professional',
          message: slot.professionalName
            ? `Nenhum profissional ativo selecionado (lido: "${slot.professionalName}").`
            : 'Selecione um instrutor ativo responsável por este horário.'
        });
        if (!row.deferSchedules) {
          alerts.push({
            id: `sch-prof-${row.key}-${i}`,
            scope: 'service',
            recordKey: row.key,
            recordName: row.name || 'Serviço',
            section: 'schedules',
            severity: severityFor(checkSchedulesNow),
            message: `${row.name || 'Serviço'} · ${WEEKDAY_SHORT[slot.dayOfWeek]} ${slot.startTime}: vincule um profissional ativo.`
          });
        }
        continue;
      }

      const coverage = checkProfessionalScheduleCoverage(tenantId, prof.id, slot.dayOfWeek, start, end);
      if (!coverage.ok) {
        scheduleConflictsCount++;
        const availText = coverage.availableSegments.length
          ? coverage.availableSegments.map(s => `${minutesToHHMM(s.start)}–${minutesToHHMM(s.end)}`).join(', ')
          : 'Nenhuma faixa neste dia';
        const msg = `A escala de ${prof.name} não cobre ${WEEKDAY_NAMES_PT[slot.dayOfWeek]} ${slot.startTime}–${slot.endTime}. Disponível: ${availText}.`;
        rowChecks.push({ index: i, status: 'outside_shift', message: msg, availableRanges: availText });
        if (!row.deferSchedules) {
          alerts.push({
            id: `sch-cov-${row.key}-${i}`,
            scope: 'service',
            recordKey: row.key,
            recordName: row.name || 'Serviço',
            section: 'schedules',
            severity: severityFor(checkSchedulesNow),
            message: `${row.name || 'Serviço'} · ${msg}`
          });
        }
        continue;
      }

      if (opType === 'individual' && duration && end - start < duration) {
        scheduleConflictsCount++;
        const msg = `A faixa ${slot.startTime}–${slot.endTime} é menor que a duração da aula (${duration} min).`;
        rowChecks.push({ index: i, status: 'conflict', message: msg });
        if (!row.deferSchedules) {
          alerts.push({
            id: `sch-dur-${row.key}-${i}`,
            scope: 'service',
            recordKey: row.key,
            recordName: row.name || 'Serviço',
            section: 'schedules',
            severity: severityFor(checkSchedulesNow),
            message: `${row.name || 'Serviço'} · ${msg}`
          });
        }
        continue;
      }

      const dupKey = `${slot.dayOfWeek}|${slot.startTime}|${slot.endTime}|${prof.id}`;
      const effectiveCap = slot.capacity ?? capacity;
      if (seenSlots.has(dupKey) && seenSlots.get(dupKey) !== effectiveCap) {
        scheduleConflictsCount++;
        const msg = `Capacidade conflitante para ${WEEKDAY_SHORT[slot.dayOfWeek]} ${slot.startTime} (${prof.name}).`;
        rowChecks.push({ index: i, status: 'conflict', message: msg });
        if (!row.deferSchedules) {
          alerts.push({
            id: `sch-cap-${row.key}-${i}`,
            scope: 'service',
            recordKey: row.key,
            recordName: row.name || 'Serviço',
            section: 'schedules',
            severity: severityFor(checkSchedulesNow),
            message: `${row.name || 'Serviço'} · ${msg}`
          });
        }
        continue;
      }
      seenSlots.set(dupKey, effectiveCap ?? null);
      rowChecks.push({ index: i, status: 'ok', message: `Compatível com a escala de ${prof.name}.` });
    }

    scheduleChecks[row.key] = rowChecks;

    // Verificação de campos gerais e opções comerciais do serviço
    let hasServiceIssue = false;
    if (row.action === 'create') {
      if (!row.name.trim() || !row.type) {
        hasServiceIssue = true;
        alerts.push({
          id: `srv-id-${row.key}`,
          scope: 'service',
          recordKey: row.key,
          recordName: row.name || 'Serviço',
          section: 'general',
          severity: 'blocking',
          message: `${row.name || 'Serviço'}: informe nome e tipo de funcionamento.`
        });
      }
      if (isScheduled && (!row.modality || !row.durationMinutes || (opType === 'group' && !capacity))) {
        hasServiceIssue = true;
        alerts.push({
          id: `srv-op-${row.key}`,
          scope: 'service',
          recordKey: row.key,
          recordName: row.name || 'Serviço',
          section: 'general',
          severity: 'blocking',
          message: `${row.name || 'Serviço'}: confirme modalidade, duração (${row.durationMinutes ?? '?'} min) e vagas (${capacity ?? '?'}).`
        });
      }
      const fallbackProfFromSlots =
        row.schedules.length > 0 && !row.deferSchedules && row.schedules.every(s => profById.has(s.professionalId))
          ? row.schedules[0].professionalId
          : '';
      if (isScheduled && !profById.has(row.professionalId) && !fallbackProfFromSlots) {
        hasServiceIssue = true;
        alerts.push({
          id: `srv-prof-${row.key}`,
          scope: 'service',
          recordKey: row.key,
          recordName: row.name || 'Serviço',
          section: 'general',
          severity: 'blocking',
          message: `${row.name || 'Serviço'}: selecione um profissional responsável ativo.`
        });
      }
      if (row.type === 'access_limited' && !row.weeklyLimit && !row.monthlyLimit) {
        hasServiceIssue = true;
        alerts.push({
          id: `srv-lim-${row.key}`,
          scope: 'service',
          recordKey: row.key,
          recordName: row.name || 'Serviço',
          section: 'general',
          severity: 'blocking',
          message: `${row.name || 'Serviço'}: informe o limite semanal ou mensal do plano limitado.`
        });
      }
    } else if (row.action === 'update') {
      if (!current) {
        hasServiceIssue = true;
        alerts.push({
          id: `srv-upd-${row.key}`,
          scope: 'service',
          recordKey: row.key,
          recordName: row.name || 'Serviço',
          section: 'general',
          severity: 'blocking',
          message: `${row.name || 'Serviço'}: selecione qual serviço do catálogo será atualizado.`
        });
      } else if (row.apply.length === 0) {
        hasServiceIssue = true;
        alerts.push({
          id: `srv-apply-${row.key}`,
          scope: 'service',
          recordKey: row.key,
          recordName: row.name || 'Serviço',
          section: 'general',
          severity: 'blocking',
          message: `${row.name || 'Serviço'}: marque ao menos um grupo de informações para atualizar.`
        });
      }
    } else if (row.action === 'link' && !current) {
      hasServiceIssue = true;
      alerts.push({
        id: `srv-lnk-${row.key}`,
        scope: 'service',
        recordKey: row.key,
        recordName: row.name || 'Serviço',
        section: 'general',
        severity: 'blocking',
        message: `${row.name || 'Serviço'}: selecione o serviço existente para vincular.`
      });
    }

    if (row.deferSchedules && row.schedules.length > 0 && row.action !== 'ignore') {
      deferredScheduleServices++;
    }

    if (row.action === 'create' || (row.action === 'update' && row.apply.includes('prices')) || row.action === 'ignore') {
      const seenCond = new Set<string>();
      for (let pi = 0; pi < row.prices.length; pi++) {
        const p = row.prices[pi];
        if (!p.unit || p.ambiguousReason || p.isMonthlyEquivalent) ambiguousPricesCount++;
        const condKey = priceConditionKey(p);
        let pMsg = priceHasValidationIssue(p, effectiveKindType, opType);
        if (!pMsg && seenCond.has(condKey)) {
          pMsg = 'Condição comercial duplicada ou com dois preços conflitantes neste serviço.';
        }
        seenCond.add(condKey);
        if (pMsg) {
          hasServiceIssue = true;
          alerts.push({
            id: `prc-${row.key}-${pi}`,
            scope: 'service',
            recordKey: row.key,
            recordName: row.name || 'Serviço',
            section: 'prices',
            severity: severityFor(row.action === 'create' || (row.action === 'update' && row.apply.includes('prices'))),
            message: `${row.name || 'Serviço'} · Plano ${p.label || pi + 1}: ${pMsg}`
          });
        }
      }
    }

    if (
      Array.isArray(row.optionalAddons) &&
      row.optionalAddons.length > 0 &&
      (row.action === 'create' || (row.action === 'update' && row.apply.includes('addons')) || row.action === 'ignore')
    ) {
      const addonSeverity = severityFor(row.action === 'create' || (row.action === 'update' && row.apply.includes('addons')));
      for (let ai = 0; ai < row.optionalAddons.length; ai++) {
        const ao = row.optionalAddons[ai];
        if (!ao.active) continue;
        if (ao.mandatoryUnclear) {
          hasServiceIssue = true;
          alerts.push({
            id: `addon-unclear-${row.key}-${ai}`,
            scope: 'service',
            recordKey: row.key,
            recordName: row.name || 'Serviço',
            section: 'addons',
            severity: addonSeverity,
            message: `${row.name || 'Serviço'} · Complemento "${ao.label || ao.addonServiceName}": ${ao.ambiguousReason || 'Confirme se é complemento opcional ou pacote obrigatório.'}`
          });
        }
        const scopeMode = ao.baseOptionScopeMode || (ao.baseOptionScopeUnclear ? 'undecided' : (Array.isArray(ao.acceptedBasePriceKeys) && ao.acceptedBasePriceKeys.length > 0 ? 'selected' : 'all'));
        const selectedScopeKeys = Array.isArray(ao.acceptedBasePriceKeys) ? ao.acceptedBasePriceKeys.filter(Boolean) : [];
        if (ao.baseOptionScopeUnclear || scopeMode === 'undecided' || (scopeMode === 'selected' && selectedScopeKeys.length === 0)) {
          hasServiceIssue = true;
          alerts.push({
            id: `addon-scope-${row.key}-${ai}`,
            scope: 'service',
            recordKey: row.key,
            recordName: row.name || 'Serviço',
            section: 'addons',
            severity: addonSeverity,
            message: `${row.name || 'Serviço'} · Complemento "${ao.label || ao.addonServiceName}": Em quais planos este acompanhamento poderá ser contratado? Selecione os planos autorizados ou confirme se vale para todos.`
          });
        }
        const resolvedExisting = ao.addonServiceRef && ao.addonServiceRef.startsWith('existing:')
          ? catalog.services.find(s => s.active && s.id === ao.addonServiceRef.slice(9))
          : (!ao.addonServiceRef
              ? (() => {
                  const targetKey = nameKey(ao.addonServiceName || ao.label);
                  if (!targetKey) return undefined;
                  const catMatches = catalog.services.filter(cs => cs.active && nameKey(cs.name) === targetKey);
                  return catMatches.length === 1 ? catMatches[0] : undefined;
                })()
              : undefined);
        const resolvedProposed = ao.addonServiceRef && !ao.addonServiceRef.startsWith('existing:')
          ? proposal.services.find(ps => ps.key === ao.addonServiceRef && ps.action !== 'ignore')
          : (!ao.addonServiceRef
              ? (() => {
                  const targetKey = nameKey(ao.addonServiceName || ao.label);
                  if (!targetKey) return undefined;
                  const propMatches = proposal.services.filter(ps => ps.key !== row.key && ps.action !== 'ignore' && nameKey(ps.name) === targetKey);
                  return propMatches.length === 1 ? propMatches[0] : undefined;
                })()
              : undefined);
        const resolvedRef = resolvedExisting?.id || resolvedProposed?.key || null;
        if (!resolvedRef) {
          hasServiceIssue = true;
          alerts.push({
            id: `addon-ref-${row.key}-${ai}`,
            scope: 'service',
            recordKey: row.key,
            recordName: row.name || 'Serviço',
            section: 'addons',
            severity: addonSeverity,
            message: `${row.name || 'Serviço'} · Complemento "${ao.label || ai + 1}": vincule a um serviço ativo existente ou incluído nesta importação.`
          });
        } else if (
          (resolvedExisting && normalizeStudioServiceType(resolvedExisting.studio_service_type, resolvedExisting.service_kind) === 'facility_access') ||
          (resolvedProposed && (resolvedProposed.type === 'access_unlimited' || resolvedProposed.type === 'access_limited'))
        ) {
          hasServiceIssue = true;
          alerts.push({
            id: `addon-access-target-${row.key}-${ai}`,
            scope: 'service',
            recordKey: row.key,
            recordName: row.name || 'Serviço',
            section: 'addons',
            severity: addonSeverity,
            message: `${row.name || 'Serviço'} · Complemento "${ao.label || ai + 1}": um plano de acesso livre/limitado não pode ser usado como complemento. Selecione um serviço agendável (ex.: Personal Trainer).`
          });
        }
        if (ao.additionalPriceCents === null || ao.additionalPriceCents < 0) {
          hasServiceIssue = true;
          alerts.push({
            id: `addon-prc-${row.key}-${ai}`,
            scope: 'service',
            recordKey: row.key,
            recordName: row.name || 'Serviço',
            section: 'addons',
            severity: addonSeverity,
            message: `${row.name || 'Serviço'} · Complemento "${ao.label || ai + 1}": confirme o valor adicional do complemento.`
          });
        }
        if (ao.attendanceFormat === 'group' && (!ao.sessionCapacity || Number(ao.sessionCapacity) < 2)) {
          hasServiceIssue = true;
          alerts.push({
            id: `addon-cap-${row.key}-${ai}`,
            scope: 'service',
            recordKey: row.key,
            recordName: row.name || 'Serviço',
            section: 'addons',
            severity: addonSeverity,
            message: `${row.name || 'Serviço'} · Complemento "${ao.label || ai + 1}": informe a capacidade de vagas por horário (mínimo 2 para atendimento em grupo).`
          });
        }
        if (Array.isArray(ao.enabledProfessionalIds) && ao.enabledProfessionalIds.length > 0) {
          const invalidPros = ao.enabledProfessionalIds.filter((pid) => {
            const p = profById.get(pid);
            if (!p) return true;
            if (p.isStudioEligible === false && !resolvedExisting?.id) return true;
            if (p.isAdminManager && !p.hasActiveSchedule && !p.isStudioEligible) return true;
            if (resolvedExisting && normalizeStudioServiceType(resolvedExisting.studio_service_type, resolvedExisting.service_kind) !== 'non_scheduled') {
              const linked = Array.isArray(p.linkedServiceIds) ? p.linkedServiceIds.includes(resolvedExisting.id) : true;
              if (!linked) return true;
            }
            return false;
          });
          if (invalidPros.length > 0) {
            hasServiceIssue = true;
            alerts.push({
              id: `addon-prof-${row.key}-${ai}`,
              scope: 'service',
              recordKey: row.key,
              recordName: row.name || 'Serviço',
              section: 'addons',
              severity: addonSeverity,
              message: `${row.name || 'Serviço'} · Complemento "${ao.label || ai + 1}": há profissionais selecionados sem vínculo ou habilitação válida para o serviço complementar.`
            });
          }
        }
      }
    }

    const slotBlocking = rowChecks.some(c => c.status !== 'ok' && c.status !== 'not_schedulable') && !row.deferSchedules;
    if (hasServiceIssue || slotBlocking || row.issues.length > 0) servicesPending++;
    else servicesReady++;
  }

  let packagesReady = 0;
  let packagesPending = 0;
  for (const pkg of proposal.packages) {
    if ((matches.packages[pkg.key] || []).length > 0) duplicatesFound++;
    let pkgHasIssue = false;
    if (pkg.action === 'link') {
      const target = catalog.packages.find(p => p.active && p.id === pkg.existingId);
      if (!target) {
        pkgHasIssue = true;
        alerts.push({
          id: `pkg-lnk-${pkg.key}`,
          scope: 'package',
          recordKey: pkg.key,
          recordName: pkg.name || 'Pacote',
          section: 'general',
          severity: 'blocking',
          message: `${pkg.name || 'Pacote'}: selecione um pacote ativo do catálogo.`
        });
      }
    } else {
      const pr = pkg.price;
      const pkgSeverity: 'blocking' | 'warning' = pkg.action === 'create' ? 'blocking' : 'warning';
      if (!pkg.name.trim() || !pr?.amountCents || !pr.unit || !pr.duration || !pr.paymentPeriod) {
        pkgHasIssue = true;
        alerts.push({
          id: `pkg-prc-${pkg.key}`,
          scope: 'package',
          recordKey: pkg.key,
          recordName: pkg.name || 'Pacote',
          section: 'general',
          severity: pkgSeverity,
          message: `${pkg.name || 'Pacote'}: confirme nome, valor, unidade, duração e cobrança.`
        });
      }
      if (pkg.items.length === 0 || pkg.items.some(it => !it.serviceRef || !activeServicesByKey.has(it.serviceRef))) {
        pkgHasIssue = true;
        alerts.push({
          id: `pkg-itm-${pkg.key}`,
          scope: 'package',
          recordKey: pkg.key,
          recordName: pkg.name || 'Pacote',
          section: 'items',
          severity: pkgSeverity,
          message: `${pkg.name || 'Pacote'}: vincule todos os componentes a serviços incluídos na importação ou do catálogo.`
        });
      }
    }
    if (pkgHasIssue || pkg.issues.length > 0) packagesPending++;
    else packagesReady++;
  }

  const blockingAlertsCount = alerts.filter(a => a.severity === 'blocking').length;

  return {
    summary: {
      servicesTotal: proposal.services.length,
      servicesReady,
      servicesPending,
      packagesTotal: proposal.packages.length,
      packagesReady,
      packagesPending,
      priceOptionsTotal,
      ambiguousPricesCount,
      schedulesTotal,
      incompleteSchedulesCount,
      scheduleConflictsCount,
      duplicatesFound,
      blockingAlertsCount
    },
    alerts,
    scheduleChecks,
    preview: {
      willCreateServices: proposal.services.filter(s => s.action === 'create').length,
      willUpdateServices: proposal.services.filter(s => s.action === 'update').length,
      willLinkServices: proposal.services.filter(s => s.action === 'link').length,
      willIgnoreServices: proposal.services.filter(s => s.action === 'ignore').length,
      willCreatePackages: proposal.packages.filter(p => p.action === 'create').length,
      willLinkPackages: proposal.packages.filter(p => p.action === 'link').length,
      willIgnorePackages: proposal.packages.filter(p => p.action === 'ignore').length,
      totalPriceOptions: proposal.services.filter(s => s.action === 'create' || (s.action === 'update' && s.apply.includes('prices'))).reduce((sum, s) => sum + s.prices.length, 0),
      totalSchedules: proposal.services.filter(s => !s.deferSchedules && (s.action === 'create' || (s.action === 'update' && s.apply.includes('schedules')))).reduce((sum, s) => sum + s.schedules.length, 0),
      deferredScheduleServices
    }
  };
}

function serviceType(type: ProposedService['type']) {
  if (type === 'access_limited' || type === 'access_unlimited') return 'facility_access';
  if (type === 'group' || type === 'duo') return 'group';
  return type === 'deliverable' ? 'non_scheduled' : 'individual';
}

function nonempty(value: string, message: string) {
  if (!nameKey(value)) throw catalogError(message);
}

function saveService(req: Request, body: Record<string, unknown>, id?: string): string {
  const call = Object.assign(Object.create(req), { body, params: id ? { id } : {} }) as Request;
  let code = 200;
  let payload: { id?: string; error?: string; schedule_warnings?: string[] } | undefined;
  const capture: ServiceSaveResponse = {
    status(status) { code = status; return capture; },
    json(data) { payload = data; }
  };
  if (id) ServiceController.updateService(call, capture, true);
  else ServiceController.createService(call, capture, true);
  if (code >= 400 || !payload || (!id && !payload.id)) {
    throw catalogError(code >= 500 ? 'Falha ao gravar o serviço no catálogo.' : payload?.error || 'Falha ao gravar o serviço.', code >= 500 ? 500 : 400);
  }
  if (payload.schedule_warnings?.length) throw catalogError(payload.schedule_warnings.join(' '));
  return id || payload.id!;
}

const asDescription = ({ description, notes }: { description: string; notes: string }) =>
  [description, notes].filter(Boolean).join('\n\n');

function commercialOptions(row: ProposedService, type: string) {
  const conditions = new Set<string>();
  const proposals = row.prices.filter(price => {
    const key = priceConditionKey(price);
    if (!price.unit || !price.amountCents || conditions.has(key)) {
      throw catalogError('Confirme a unidade e o valor de cada preço, e remova condições duplicadas ou conflitantes.');
    }
    conditions.add(key);
    return true;
  });
  const isStandalone = (p: ProposedPrice) => p.unit === 'per_session' && !p.duration && !p.frequencyType && (!p.paymentPeriod || p.paymentPeriod === 'one_time');
  const standalone = proposals.filter(isStandalone);
  if (standalone.length > 1) throw catalogError('Deixe apenas um valor avulso por aula.');
  const priceKeyToOptionId = new Map<string, string>();
  const planProposals = proposals.filter(p => !isStandalone(p));
  const options = planProposals.map((p, idx) => {
    const limitedAccess = p.frequencyType === 'unlimited'
      ? false
      : (p.frequencyType === 'weekly' || p.frequencyType === 'monthly' || row.type === 'access_limited');
    const accessType = type === 'facility_access' ? (limitedAccess ? 'limited' : 'unlimited') : 'scheduled';
    const frequencyType = p.frequencyType || (accessType === 'unlimited' ? 'unlimited' : null);
    if (!p.duration || !p.paymentPeriod || !frequencyType ||
        (frequencyType !== 'unlimited' && p.frequencyCount === null) ||
        (p.paymentPeriod === 'installments' && (!p.installments || p.unit !== 'contract_total')) ||
        (p.unit === 'per_participant' && !p.participants && row.type !== 'duo')) {
      throw catalogError('Confirme duração, cobrança e frequência do plano. Parcelamentos exigem o total do contrato e a quantidade de parcelas.');
    }
    if (p.unit === 'per_month' && p.paymentPeriod !== 'monthly') {
      throw catalogError('Valor mensal precisa de cobrança mensal. Confirme a condição comercial antes de importar.');
    }
    if (p.unit === 'contract_total' && !['one_time', 'installments'].includes(p.paymentPeriod)) {
      throw catalogError('Confirme se o preço é o total ou o valor cobrado em cada ciclo.');
    }
    if ((PLAN_DURATION_MONTHS[p.duration] || 0) % getPaymentPeriodicityCycleMonths(p.paymentPeriod) !== 0) {
      throw catalogError('A duração precisa corresponder a ciclos completos de cobrança.');
    }
    if (type === 'facility_access' && frequencyType === 'fixed_count') {
      throw catalogError('Para acesso limitado, escolha a frequência semanal ou mensal que será aplicada na entrada.');
    }
    if (accessType === 'limited' && (frequencyType === 'unlimited' || (frequencyType === 'weekly' && (p.frequencyCount || 0) > 50))) {
      throw catalogError('Confirme a frequência do acesso limitado. O cadastro aceita até 50 entradas por semana.');
    }
    const optId = randomUUID();
    const pKey = p.key || `p${idx + 1}`;
    priceKeyToOptionId.set(pKey, optId);
    return {
      id: optId, label: p.label || null, accessType, frequencyType, frequencyCount: p.frequencyCount,
      contractDurationCode: p.duration, paymentPeriodicity: p.paymentPeriod, commercialUnit: p.unit,
      amountCents: p.amountCents, installmentsCount: p.installments || 1, participantsCount: p.participants || (row.type === 'duo' ? 2 : 1),
      creditMode: p.creditMode || row.planCreditMode || null,
      creditsPerCycle: p.creditsPerCycle ?? null
    };
  });
  if (standalone.length && (type === 'facility_access' || type === 'non_scheduled')) {
    throw catalogError('Este serviço não tem aulas avulsas. Cadastre o valor como opção comercial.');
  }
  return {
    basePrice: standalone[0]?.amountCents ? standalone[0].amountCents / 100 : undefined,
    options: normalizeCommercialPriceOptions(options, { studioServiceType: type }),
    priceKeyToOptionId
  };
}

function mergeCommercialOptions(existing: CatalogService, additions: ReturnType<typeof commercialOptions>) {
  const current = normalizeCommercialPriceOptions(existing.commercial_price_options_json, {
    studioServiceType: existing.studio_service_type
  });
  const signature = (p: typeof current[number]) => JSON.stringify([
    p.accessType, p.frequencyType, p.frequencyCount, p.contractDurationCode, p.paymentPeriodicity, p.commercialUnit, p.participantsCount, p.installmentsCount, p.modality
  ]);
  for (const option of additions.options) {
    const matches = current.filter(old => signature(old) === signature(option));
    if (matches.some(old => old.amountCents !== option.amountCents)) {
      throw catalogError('Já existe um preço para a mesma condição comercial. Remova essa opção da importação para preservar o preço cadastrado.');
    }
    if (!matches.length) {
      current.push(option);
    } else {
      // Se já existia opção equivalente, redireciona o mapa de priceKey -> ID existente
      for (const [k, v] of additions.priceKeyToOptionId.entries()) {
        if (v === option.id) additions.priceKeyToOptionId.set(k, matches[0].id);
      }
    }
  }
  return current;
}

function scheduleInput(
  row: ProposedService,
  type: string,
  primary: string,
  capacity: number | null,
  duration: number,
  tenantId: string,
  professionals: { id: string; name: string }[],
  existing?: CatalogService
) {
  if (row.deferSchedules || !row.schedules.length) return {};
  if (type !== 'group' && type !== 'individual') throw catalogError('Serviços sem agendamento não podem receber horários de aula.');
  const known = existing && type === 'group'
    ? db.prepare('SELECT day_of_week, start_time, end_time, professional_id FROM class_schedules WHERE tenant_id = ? AND service_id = ? AND active = 1 AND (effective_end_date IS NULL OR effective_end_date >= ?)')
      .all(tenantId, existing.id, todayBrazilYmd()) : [];
  const windows = existing && type === 'individual' && existing.availability_mode === 'custom_windows'
    ? db.prepare('SELECT day_of_week, start_time, end_time, professional_id FROM service_availability_windows WHERE tenant_id = ? AND service_id = ? AND active = 1')
      .all(tenantId, existing.id).map(w => ({ dayOfWeek: w.day_of_week, startTime: w.start_time, endTime: w.end_time, professionalId: w.professional_id })) : [];
  const linked: { professional_id: string; custom_duration: number | null }[] = existing ? db.prepare(
    'SELECT professional_id, custom_duration FROM professional_services WHERE service_id = ?'
  ).all(existing.id) : [];

  const schedules = new Map<string, { dayOfWeek: number; startTime: string; endTime: string; professionalId: string; capacity: number | null }>();
  for (const item of row.schedules) {
    const start = parseClockMinutes(item.startTime);
    const end = parseClockMinutes(item.endTime);
    if (item.dayOfWeek === null || start === null || end === null || end <= start) {
      throw catalogError('Confirme o dia, o início e o término de cada horário. O término deve ser posterior ao início.');
    }
    const professionalId = item.professionalId || primary;
    const professional = professionals.find(p => p.id === professionalId);
    const period = `${WEEKDAY_NAMES_PT[item.dayOfWeek]} (${item.startTime}–${item.endTime})`;
    if (!professional) throw catalogError(`${period}: selecione um profissional ativo deste estabelecimento para o horário.`);
    const coverage = checkProfessionalScheduleCoverage(tenantId, professionalId, item.dayOfWeek, start, end);
    if (!coverage.ok) {
      const ranges = coverage.availableSegments.map(s => `${minutesToHHMM(s.start)}–${minutesToHHMM(s.end)}`);
      const detail = ranges.length ? `Faixas disponíveis: ${ranges.join(', ')}.` : 'Nenhuma faixa disponível neste dia.';
      throw catalogError(`${period}: a escala de ${professional.name} não cobre a aula. ${detail}`);
    }
    if (type === 'individual') {
      const effectiveDuration = linked.find(p => p.professional_id === professionalId)?.custom_duration ?? duration;
      if (end - start < effectiveDuration) {
        throw catalogError(`${period}: a faixa de ${professional.name} precisa comportar a aula de ${effectiveDuration} minutos.`);
      }
    }
    const entry = { dayOfWeek: item.dayOfWeek, startTime: item.startTime, endTime: item.endTime, professionalId, capacity: item.capacity ?? capacity };
    const key = [entry.dayOfWeek, entry.startTime, entry.endTime, entry.professionalId].join('|');
    if (schedules.has(key) && schedules.get(key)?.capacity !== entry.capacity) {
      throw catalogError('Há capacidades conflitantes para o mesmo horário.');
    }
    if (!known.some(s => s.day_of_week === entry.dayOfWeek && s.start_time === entry.startTime &&
        s.end_time === entry.endTime && s.professional_id === entry.professionalId)) {
      schedules.set(key, entry);
    }
  }
  const rows = [...schedules.values()];
  const allLinkedProfIds = [...new Set([...linked.map(p => p.professional_id), ...(primary ? [primary] : []), ...rows.map(r => r.professionalId)].filter(Boolean))];
  if (type === 'group') {
    return {
      classSchedules: rows,
      ...(allLinkedProfIds.length > 0 ? { linkedProfessionalIds: allLinkedProfIds } : {})
    };
  }
  const all = [...new Map([...windows, ...rows].map(w => [[w.dayOfWeek, w.startTime, w.endTime, w.professionalId].join('|'), w])).values()];
  return {
    availabilityMode: 'custom_windows',
    availabilityWindows: all,
    linkedProfessionalIds: allLinkedProfIds
  };
}

function adjustmentOptions(row: ProposedService) {
  return row.adjustments.map(adjustment => {
    if (!adjustment.label || !adjustment.adjustmentType || !adjustment.valueType || !adjustment.incidence ||
        !adjustment.amount || (adjustment.valueType === 'percentage' && adjustment.amount > 100) ||
        ((!adjustment.startTime || !adjustment.endTime) && !adjustment.weekdays.length) ||
        (Boolean(adjustment.startTime) !== Boolean(adjustment.endTime)) ||
        (adjustment.startTime && adjustment.startTime >= adjustment.endTime)) {
      throw catalogError('Confirme o tipo, valor, incidência e dia ou faixa horária de cada ajuste.');
    }
    return { ...adjustment, id: randomUUID(), active: true };
  });
}

function packagePrice(price: ProposedPrice | null) {
  const periods = ['monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual'] as const;
  if (!price?.amountCents || !price.duration || !price.unit || !price.paymentPeriod) {
    throw catalogError('Confirme o preço, a duração do contrato e a forma de pagamento do pacote.');
  }
  const months = PLAN_DURATION_MONTHS[price.duration];
  if (!months) throw catalogError('Selecione uma duração em meses para o pacote.');
  const oneTime = price.paymentPeriod === 'one_time' || price.paymentPeriod === 'installments';
  const cycle = periods.find(p => p === price.paymentPeriod);
  const compatibleUnit = oneTime ? price.unit === 'contract_total'
    : (price.unit === 'per_cycle' || (price.unit === 'per_month' && cycle === 'monthly'));
  if ((!oneTime && !cycle) || !compatibleUnit || (price.paymentPeriod === 'installments' && !price.installments)) {
    throw catalogError('Para pagamento único ou parcelado, informe o total. Para cobrança recorrente, informe o valor por ciclo.');
  }
  if (months % getPaymentPeriodicityCycleMonths(price.paymentPeriod) !== 0) {
    throw catalogError('A duração do pacote precisa corresponder a ciclos completos de cobrança.');
  }
  return {
    price: price.amountCents / 100, contractDurationCode: price.duration, paymentPeriodicity: price.paymentPeriod,
    billingType: oneTime ? 'one_time' as const : 'recurring_monthly' as const,
    billingFrequency: cycle, installmentsCount: price.installments || 1, validityDays: months * 30
  };
}

export function applyStudioCatalog(req: Request, proposal: StudioProposal): ImportReceipt {
  const tenantId = req.tenantId!;
  const catalog = readStudioImportCatalog(tenantId);
  const services: ImportReceiptItem[] = [];
  const packages: ImportReceiptItem[] = [];
  const createdServiceIds: string[] = [];
  const updatedServiceIds: string[] = [];
  const linkedServiceIds: string[] = [];
  const createdPriceOptionIds: string[] = [];
  const createdPackageIds: string[] = [];
  const linkedPackageIds: string[] = [];
  const ignoredServices: ImportIgnoredItem[] = [];
  const ignoredPackages: ImportIgnoredItem[] = [];
  const references = new Map(catalog.services.filter(s => s.active).map(s => ['existing:' + s.id, s.id]));
  const priceKeyMapsByServiceKey = new Map<string, Map<string, string>>();

  // Pré-validação atômica de complementos opcionais antes de gravar qualquer serviço na Passagem 1
  for (const row of proposal.services) {
    if (row.action === 'ignore' || row.action === 'link') continue;
    if (row.action === 'update' && !row.apply.includes('addons')) continue;
    const rawAddons = Array.isArray(row.optionalAddons) ? row.optionalAddons.filter(a => a && a.active !== false) : [];
    for (const ao of rawAddons) {
      if (ao.mandatoryUnclear) {
        throw catalogError(`${row.name || 'Serviço sem nome'} — Confirme se o item "${ao.label || ao.addonServiceName}" é complemento opcional ou pacote obrigatório antes de aplicar.`);
      }
      const scopeMode = ao.baseOptionScopeMode || (ao.baseOptionScopeUnclear ? 'undecided' : (Array.isArray(ao.acceptedBasePriceKeys) && ao.acceptedBasePriceKeys.length > 0 ? 'selected' : 'all'));
      const rawScopeKeys = Array.isArray(ao.acceptedBasePriceKeys) ? ao.acceptedBasePriceKeys.filter(Boolean) : [];
      if (ao.baseOptionScopeUnclear || scopeMode === 'undecided' || (scopeMode === 'selected' && rawScopeKeys.length === 0)) {
        throw catalogError(`${row.name || 'Serviço sem nome'} — Em quais planos o complemento "${ao.label || ao.addonServiceName}" poderá ser contratado? Selecione os planos autorizados na revisão antes de confirmar.`);
      }
      if (ao.additionalPriceCents === null || ao.additionalPriceCents < 0) {
        throw catalogError(`${row.name || 'Serviço sem nome'} — Informe o valor adicional do complemento "${ao.label || ao.addonServiceName}".`);
      }
      if (ao.attendanceFormat === 'group' && (!ao.sessionCapacity || Number(ao.sessionCapacity) < 2)) {
        throw catalogError(`${row.name || 'Serviço sem nome'} — Informe a capacidade de vagas por horário (mínimo 2) para o complemento "${ao.label || ao.addonServiceName}".`);
      }
    }
  }

  for (const row of proposal.services) {
    if (row.action === 'ignore') {
      ignoredServices.push({ key: row.key, name: row.name || 'Serviço' });
      continue;
    }
    try {
      if (!row.reviewed) throw catalogError('Marque a revisão como concluída.');
      const target = catalog.services.find(s => s.active && s.id === row.existingId);
      const isCreate = row.action === 'create';
      if (!isCreate && !target) throw catalogError('Selecione um serviço ativo do catálogo de Studio.');
      if (row.action === 'link') {
        references.set(row.key, target!.id);
        linkedServiceIds.push(target!.id);
        services.push({
          key: row.key,
          id: target!.id,
          name: target!.name,
          action: row.action,
          published: Number(target!.allow_public_booking ?? 1) !== 0
        });
        continue;
      }
      const current = isCreate ? undefined : target;
      const type = current ? normalizeStudioServiceType(current.studio_service_type, current.service_kind) : serviceType(row.type);
      const identity = isCreate || row.apply.includes('identity');
      if (identity) {
        nonempty(row.name, 'Informe o nome do serviço.');
        const duplicates = catalog.services.some(s => s.id !== current?.id && nameKey(s.name) === nameKey(row.name) &&
          normalizeStudioServiceType(s.studio_service_type, s.service_kind) === type &&
          (type !== 'group' || (s.default_capacity === 2) === (current ? current.default_capacity === 2 : row.type === 'duo')));
        if (duplicates) throw catalogError('Já existe um serviço com esse nome e tipo. Vincule-o ou diferencie o nome.');
      }
      const scheduled = type === 'group' || type === 'individual';
      const capacity = current ? (current.default_capacity || (row.type === 'duo' ? 2 : row.capacity)) : (row.type === 'duo' ? 2 : row.capacity);
      const duration = current ? (current.duration_minutes || row.durationMinutes) : row.durationMinutes;

      // Se cada horário já tem instrutor válido escolhido e o campo global estava vazio, utiliza o primeiro como responsável padrão sem exigir retrabalho.
      const fallbackSlotProf =
        !row.professionalId &&
        !row.deferSchedules &&
        row.schedules.length > 0 &&
        row.schedules.every(s => catalog.professionals.some(p => p.id === s.professionalId))
          ? row.schedules[0].professionalId
          : '';
      const professional = (current
        ? (row.action === 'update' && !row.apply.includes('identity')
            ? (current.professional_id || row.professionalId || fallbackSlotProf)
            : (row.professionalId || current.professional_id || fallbackSlotProf))
        : (row.professionalId || fallbackSlotProf)) || '';
      if (isCreate && scheduled && !catalog.professionals.some(p => p.id === professional)) {
        throw catalogError('Selecione um profissional responsável ativo deste estabelecimento.');
      }
      if (isCreate && (!row.type || (scheduled && (!duration || !row.modality ||
        (type === 'group' && !capacity))))) {
        throw catalogError('Confirme o tipo e, para serviços agendáveis, a modalidade, a duração e as vagas da turma.');
      }
      if (isCreate && row.type === 'access_limited' && ((!row.weeklyLimit && !row.monthlyLimit) || (row.weeklyLimit || 0) > 50)) {
        throw catalogError('Informe o limite semanal (até 50) ou mensal do acesso.');
      }
      if (current && row.apply.length === 0) throw catalogError('Selecione os campos que deseja atualizar.');
      const prices = isCreate || row.apply.includes('prices') ? commercialOptions({
        ...row, type: current ? currentServiceType(current) : row.type
      }, type) : null;
      if (current && prices?.basePrice !== undefined && prices.basePrice !== current.price) {
        throw catalogError('A importação preserva o preço avulso cadastrado. Remova essa opção para adicionar os planos.');
      }
      const adjustments = isCreate || row.apply.includes('adjustments') ? adjustmentOptions(row) : null;
      const schedPayload = isCreate || row.apply.includes('schedules')
        ? scheduleInput(row, type, professional || '', capacity, duration || 0, tenantId, catalog.professionals, current)
        : {};

      const applyAddonsOnRow = (isCreate || row.apply.includes('addons')) && Array.isArray(row.optionalAddons)
        ? row.optionalAddons.filter(a => a && a.active !== false)
        : [];
      for (const ao of applyAddonsOnRow) {
        if (ao.mandatoryUnclear) {
          throw catalogError(`Confirme se o item "${ao.label || ao.addonServiceName}" é complemento opcional ou pacote obrigatório antes de aplicar.`);
        }
        if (ao.additionalPriceCents === null || ao.additionalPriceCents < 0) {
          throw catalogError(`Informe o valor adicional do complemento "${ao.label || ao.addonServiceName}".`);
        }
        if (ao.attendanceFormat === 'group' && (!ao.sessionCapacity || Number(ao.sessionCapacity) < 2)) {
          throw catalogError(`Informe a capacidade de vagas por horário (mínimo 2) para o complemento em grupo "${ao.label || ao.addonServiceName}".`);
        }
        const rawRef = String(ao.addonServiceRef || '').trim();
        const existingTarget = rawRef.startsWith('existing:')
          ? catalog.services.find(s => s.active && s.id === rawRef.slice(9))
          : undefined;
        const proposedTarget = !existingTarget && rawRef
          ? proposal.services.find(ps => ps.key !== row.key && ps.action !== 'ignore' && ps.key === rawRef)
          : undefined;
        const fallbackNameKey = !existingTarget && !proposedTarget ? nameKey(ao.addonServiceName || ao.label) : '';
        const matchedProposedByName = fallbackNameKey
          ? proposal.services.find(ps => ps.key !== row.key && ps.action !== 'ignore' && nameKey(ps.name) === fallbackNameKey)
          : undefined;
        const matchedCatalogByName = fallbackNameKey && !matchedProposedByName
          ? catalog.services.find(cs => cs.active && cs.id !== current?.id && nameKey(cs.name) === fallbackNameKey)
          : undefined;
        const hasPlannedTarget = Boolean(existingTarget || proposedTarget || matchedProposedByName || matchedCatalogByName);
        if (!hasPlannedTarget) {
          throw catalogError(`Vincule um serviço complementar distinto e ativo para "${ao.label || ao.addonServiceName}".`);
        }
        const checkTargetExisting = existingTarget || matchedCatalogByName;
        const checkTargetProposed = proposedTarget || matchedProposedByName;
        if (
          (checkTargetExisting && normalizeStudioServiceType(checkTargetExisting.studio_service_type, checkTargetExisting.service_kind) === 'facility_access') ||
          (checkTargetProposed && (checkTargetProposed.type === 'access_unlimited' || checkTargetProposed.type === 'access_limited'))
        ) {
          throw catalogError(`O serviço "${ao.addonServiceName || ao.label}" é de acesso livre/limitado e não pode ser vinculado como complemento opcional.`);
        }
      }

      const body: Record<string, unknown> = { serviceDomain: 'studio' };
      if (identity) Object.assign(body, { name: row.name, description: asDescription(row), modalityCategory: row.activity || null });
      const effectiveAllowPublic =
        row.deferSchedules
          ? false
          : (row.allowPublicBooking !== false);
      const inferredHasPlans = Boolean(prices?.options.length) || type === 'facility_access' || type === 'non_scheduled';
      const inferredAllowSingle =
        type === 'facility_access'
          ? false
          : (row.allowSingleBooking !== undefined && row.allowSingleBooking !== null
              ? Boolean(row.allowSingleBooking)
              : (Boolean(prices?.basePrice && prices.basePrice > 0) || !inferredHasPlans));
      const inferredAllowPlan =
        type === 'facility_access'
          ? true
          : (row.allowPlanBooking !== undefined && row.allowPlanBooking !== null
              ? Boolean(row.allowPlanBooking)
              : inferredHasPlans);
      const effectivePlanCreditMode =
        row.planCreditMode || (type === 'facility_access' ? 'unlimited' : 'fixed_credits');

      if (isCreate) {
        const primaryPlanOpt = prices?.options.find(o => o.commercialUnit === 'per_month' || o.paymentPeriodicity === 'monthly') || prices?.options[0];
        const periodToBillingMode: Record<string, string> = {
          '1_month': 'monthly',
          '2_months': 'bimonthly',
          '3_months': 'quarterly',
          '6_months': 'semiannual',
          '12_months': 'annual',
          '24_months': 'biennial'
        };
        const derivedBillingMode = inferredAllowPlan && primaryPlanOpt
          ? (periodToBillingMode[primaryPlanOpt.contractDurationCode] || 'monthly')
          : 'per_session';
        Object.assign(body, {
          studioServiceType: type, serviceKind: type === 'group' ? 'group' : 'individual',
          defaultCapacity: type === 'facility_access' ? 1 : capacity,
          durationMinutes: scheduled ? duration : undefined,
          requiresActiveContract: type === 'facility_access' || (!inferredAllowSingle && inferredAllowPlan),
          allowSingleBooking: inferredAllowSingle,
          allowPlanBooking: inferredAllowPlan,
          allowPublicSingleBooking:
            row.allowPublicSingleBooking !== undefined && row.allowPublicSingleBooking !== null
              ? (effectiveAllowPublic && Boolean(row.allowPublicSingleBooking) && inferredAllowSingle)
              : (effectiveAllowPublic && inferredAllowSingle),
          allowPublicPlanBooking:
            row.allowPublicPlanBooking !== undefined && row.allowPublicPlanBooking !== null
              ? (effectiveAllowPublic && Boolean(row.allowPublicPlanBooking) && inferredAllowPlan)
              : (effectiveAllowPublic && inferredAllowPlan),
          planCreditMode: effectivePlanCreditMode,
          planCreditsPerCycle: row.planCreditsPerCycle ?? null,
          billingMode: derivedBillingMode,
          ...(inferredAllowPlan && primaryPlanOpt ? {
            periodicPrice: Math.round(primaryPlanOpt.amountCents) / 100,
            defaultPlanDuration: primaryPlanOpt.contractDurationCode,
            weeklySessionsCount: primaryPlanOpt.frequencyType === 'weekly' && primaryPlanOpt.frequencyCount ? primaryPlanOpt.frequencyCount : 1
          } : {}),
          professionalId: type === 'facility_access' ? undefined : (professional || undefined),
          modality: row.modality || undefined, allowPublicBooking: effectiveAllowPublic,
          allowRecurrence: scheduled && row.prices.some(p => p.frequencyType === 'weekly' || p.frequencyType === 'monthly'),
          allowedPlanDurations: [...new Set(row.prices.map(p => p.duration).filter(Boolean))],
          accessConfig: type === 'facility_access' ? {
            accessMode: row.type === 'access_limited' ? 'limited' : 'unlimited',
            maxEntriesPerWeek: row.weeklyLimit, maxEntriesPerMonth: row.monthlyLimit,
            countPeriod: row.monthlyLimit && !row.weeklyLimit ? 'monthly' : 'weekly'
          } : undefined,
          price: inferredAllowSingle ? (prices?.basePrice ?? 0) : 0
        });
      } else if (row.allowSingleBooking !== undefined || row.allowPlanBooking !== undefined || row.planCreditMode !== undefined) {
        if (row.allowSingleBooking !== undefined && row.allowSingleBooking !== null) {
          body.allowSingleBooking = Boolean(row.allowSingleBooking);
          if (!body.allowSingleBooking) body.price = 0;
          else if (prices?.basePrice) body.price = prices.basePrice;
        }
        if (row.allowPlanBooking !== undefined && row.allowPlanBooking !== null) body.allowPlanBooking = Boolean(row.allowPlanBooking);
        if (row.planCreditMode) body.planCreditMode = row.planCreditMode;
        if (row.planCreditsPerCycle !== undefined) body.planCreditsPerCycle = row.planCreditsPerCycle;
      }
      if (prices) {
        body.commercialPriceOptions = current ? mergeCommercialOptions(current, prices) : prices.options;
        priceKeyMapsByServiceKey.set(row.key, prices.priceKeyToOptionId);
      }
      if (adjustments?.length) {
        const previous = normalizeStudioPriceAdjustments(current?.pricing_adjustments_json);
        const signature = (a: typeof previous[number]) => JSON.stringify([a.adjustmentType, a.valueType, a.amount, a.incidence, a.weekdays || [], a.startTime || '', a.endTime || '']);
        const known = new Set(previous.map(signature));
        for (const adjustment of normalizeStudioPriceAdjustments(adjustments)) {
          const key = signature(adjustment);
          if (!known.has(key)) { previous.push(adjustment); known.add(key); }
        }
        body.pricingAdjustments = previous;
      }
      Object.assign(body, schedPayload);
      const id = saveService(req, body, current?.id);
      references.set(row.key, id);
      const saved = db.prepare('SELECT * FROM services WHERE tenant_id = ? AND id = ?').get(tenantId, id) as CatalogService | undefined;
      if (!saved) {
        throw catalogError('Falha ao verificar a gravação do serviço no catálogo oficial.', 500);
      }
      const savedOptions = normalizeCommercialPriceOptions(saved.commercial_price_options_json);
      const addedOptionIds = prices?.options
        ? prices.options.map(o => o.id).filter(oid => savedOptions.some(so => so.id === oid))
        : [];
      createdPriceOptionIds.push(...addedOptionIds);
      const createdSchedulesCount = Array.isArray((schedPayload as any).classSchedules)
        ? (schedPayload as any).classSchedules.length
        : (Array.isArray((schedPayload as any).availabilityWindows) ? (schedPayload as any).availabilityWindows.length : 0);
      if (isCreate) createdServiceIds.push(id);
      else updatedServiceIds.push(id);
      services.push({
        key: row.key,
        id,
        name: identity ? row.name : current!.name,
        action: row.action,
        published: Number(saved.allow_public_booking ?? 1) !== 0,
        priceOptionsCreated: addedOptionIds.length,
        schedulesCreated: createdSchedulesCount
      });
      if (current) Object.assign(current, saved);
      else catalog.services.push(saved);
    } catch (error) {
      throw catalogError((row.name || 'Serviço sem nome') + ' — ' + (error as Error).message, (error as { status?: number }).status || 500);
    }
  }

  // Segunda passagem: vincula complementos opcionais após todos os serviços da importação terem ID definido
  for (const row of proposal.services) {
    if (row.action === 'ignore' || row.action === 'link') continue;
    if (row.action === 'update' && !row.apply.includes('addons')) continue;
    const rawAddons = Array.isArray(row.optionalAddons) ? row.optionalAddons.filter(a => a && a.active !== false) : [];
    if (rawAddons.length === 0) continue;

    try {
      const baseId = references.get(row.key);
      if (!baseId) continue;
      const baseRow = catalog.services.find(s => s.id === baseId);
      const existingCfg = normalizeOptionalAddonsConfig(baseRow?.optional_addons_json);
      const mergedOptions: StudioOptionalAddonOption[] = row.action === 'update' ? [...existingCfg.options] : [];
      const sig = (o: StudioOptionalAddonOption) =>
        JSON.stringify([o.addonServiceId, o.frequencyType, o.frequencyCount, o.billingPeriodicity, o.durationMode, o.attendanceFormat || 'match_service', o.sessionCapacity ?? null]);
      const seenSig = new Set(mergedOptions.map(sig));

      for (let ai = 0; ai < rawAddons.length; ai++) {
        const ao = rawAddons[ai];
        if (ao.mandatoryUnclear) {
          throw catalogError(`Confirme se o item "${ao.label || ao.addonServiceName}" é complemento opcional ou pacote obrigatório antes de aplicar.`);
        }
        const scopeMode = ao.baseOptionScopeMode || (ao.baseOptionScopeUnclear ? 'undecided' : (Array.isArray(ao.acceptedBasePriceKeys) && ao.acceptedBasePriceKeys.length > 0 ? 'selected' : 'all'));
        const rawScopeKeys = Array.isArray(ao.acceptedBasePriceKeys) ? ao.acceptedBasePriceKeys.filter(Boolean) : [];
        if (ao.baseOptionScopeUnclear || scopeMode === 'undecided' || (scopeMode === 'selected' && rawScopeKeys.length === 0)) {
          throw catalogError(`Em quais planos o complemento "${ao.label || ao.addonServiceName}" poderá ser contratado? Selecione os planos autorizados na revisão antes de confirmar.`);
        }
        if (ao.additionalPriceCents === null || ao.additionalPriceCents < 0) {
          throw catalogError(`Informe o valor adicional do complemento "${ao.label || ao.addonServiceName}".`);
        }
        if (ao.attendanceFormat === 'group' && (!ao.sessionCapacity || Number(ao.sessionCapacity) < 2)) {
          throw catalogError(`Informe a capacidade de vagas por horário (mínimo 2) para o complemento "${ao.label || ao.addonServiceName}".`);
        }

        let targetId = ao.addonServiceRef ? (references.get(ao.addonServiceRef) || '') : '';
        if (!targetId) {
          const targetKey = nameKey(ao.addonServiceName || ao.label);
          if (targetKey) {
            const matchedProp = proposal.services.filter(ps => ps.key !== row.key && ps.action !== 'ignore' && nameKey(ps.name) === targetKey);
            if (matchedProp.length === 1) targetId = references.get(matchedProp[0].key) || '';
            if (!targetId) {
              const matchedCat = catalog.services.filter(cs => cs.active && cs.id !== baseId && nameKey(cs.name) === targetKey);
              if (matchedCat.length === 1) targetId = matchedCat[0].id;
            }
          }
        }
        if (!targetId || targetId === baseId) {
          throw catalogError(`Vincule um serviço complementar distinto e ativo para "${ao.label || ao.addonServiceName}".`);
        }

        const targetSrv =
          catalog.services.find(s => s.id === targetId) ||
          (db.prepare('SELECT id, name, studio_service_type, service_kind, clinical_module, modality_category, COALESCE(requires_appointment, 1) as requires_appointment FROM services WHERE id = ? AND tenant_id = ?').get(targetId, tenantId) as CatalogService | undefined);
        const targetType = targetSrv ? normalizeStudioServiceType(targetSrv.studio_service_type, targetSrv.service_kind) : 'individual';
        if (targetType === 'facility_access') {
          throw catalogError(`O serviço "${targetSrv?.name || ao.label}" é de acesso à academia e não pode ser vinculado como complemento opcional.`);
        }
        const freqType = ao.frequencyType || 'weekly';
        const freqCount = freqType === 'unlimited' ? null : (ao.frequencyCount || 1);
        const addonCreditMode =
          freqType === 'unlimited'
            ? 'unlimited'
            : (ao.creditMode === 'weekly_guaranteed' || ao.creditMode === 'fixed_credits' || ao.creditMode === 'unlimited'
                ? ao.creditMode
                : 'fixed_credits');
        const creditsPerCycle = freqType === 'unlimited' || addonCreditMode === 'weekly_guaranteed' || addonCreditMode === 'unlimited'
          ? null
          : (ao.creditsPerCycle !== null && ao.creditsPerCycle !== undefined
              ? ao.creditsPerCycle
              : resolveDefaultAddonCreditsPerCycle(freqType, freqCount, 1));
        const attendanceFormat = ao.attendanceFormat || 'match_service';
        const sessionCapacity =
          attendanceFormat === 'individual'
            ? 1
            : attendanceFormat === 'duo'
              ? 2
              : attendanceFormat === 'group'
                ? Number(ao.sessionCapacity)
                : null;
        const detailedPros = listTenantAddonProfessionalsDetailed(tenantId);
        const detailedById = new Map(detailedPros.map(p => [p.id, p]));
        const validProIds = Array.isArray(ao.enabledProfessionalIds)
          ? ao.enabledProfessionalIds.filter((pid) => {
              const dp = detailedById.get(pid);
              if (!dp || !dp.active) return false;
              if (!targetSrv) return !dp.isAdminManager && !dp.isClinicalOnlyWithoutFitness;
              return isProfessionalEligibleForAddonService(dp, {
                id: targetSrv.id,
                name: targetSrv.name,
                studio_service_type: targetType,
                requires_appointment: targetType === 'non_scheduled' ? 0 : Number(targetSrv.requires_appointment ?? 1),
                clinical_module: targetSrv.clinical_module || null,
                modality_category: targetSrv.modality_category || null
              });
            })
          : [];
        if (Array.isArray(ao.enabledProfessionalIds) && ao.enabledProfessionalIds.length > 0 && validProIds.length === 0) {
          throw catalogError(`Nenhum dos profissionais selecionados no complemento "${ao.label || targetSrv?.name}" possui vínculo ou habilitação compatível com "${targetSrv?.name || ao.label}".`);
        }
        const validWeekdays = Array.isArray(ao.allowedWeekdays)
          ? [...new Set(ao.allowedWeekdays.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b)
          : [];

        // Mapeia chaves selecionadas (ex.: 'p4' ou 'existing-opt:<id>') para IDs estáveis reais das opções comerciais salvas
        const priceKeyMap = priceKeyMapsByServiceKey.get(row.key) || new Map<string, string>();
        const savedBaseCommOpts = normalizeCommercialPriceOptions(baseRow?.commercial_price_options_json, {
          studioServiceType: baseRow?.studio_service_type
        });
        const validBaseOptIds = new Set(savedBaseCommOpts.map(o => o.id));
        const resolvedAcceptedBaseOptionIds =
          scopeMode === 'selected'
            ? Array.from(
                new Set(
                  rawScopeKeys
                    .map((k) => {
                      const clean = String(k || '').trim();
                      if (clean.startsWith('existing-opt:')) return clean.slice(13);
                      if (priceKeyMap.has(clean)) return priceKeyMap.get(clean)!;
                      if (validBaseOptIds.has(clean)) return clean;
                      return '';
                    })
                    .filter((id) => Boolean(id) && (validBaseOptIds.size === 0 || validBaseOptIds.has(id)))
                )
              )
            : [];
        if (scopeMode === 'selected' && resolvedAcceptedBaseOptionIds.length === 0) {
          throw catalogError(`Nenhum plano-base válido foi selecionado para o complemento "${ao.label || ao.addonServiceName}".`);
        }

        const newOpt: StudioOptionalAddonOption = {
          id: ao.id || `addon-${randomUUID().slice(0, 8)}`,
          addonServiceId: targetId,
          addonServiceName: targetSrv?.name || ao.addonServiceName || ao.label,
          addonServiceType: targetType,
          label: ao.label || targetSrv?.name || `Complemento ${ai + 1}`,
          description: null,
          active: true,
          allowPublicBooking: ao.allowPublicBooking !== false,
          acceptedBaseOptionIds: resolvedAcceptedBaseOptionIds,
          baseOptionRestrictionMode: scopeMode === 'selected' ? 'selected' : 'all',
          frequencyType: freqType,
          frequencyCount: freqCount,
          creditMode: addonCreditMode,
          creditsPerCycle,
          additionalPriceCents: ao.additionalPriceCents,
          comboDiscountType: ao.comboDiscountType || 'none',
          comboDiscountValue: ao.comboDiscountValue || 0,
          billingPeriodicity: ao.billingPeriodicity || 'monthly',
          durationMode: ao.durationMode || 'match_base',
          autoRenew: null,
          scheduleTiming: targetType === 'non_scheduled' ? 'not_applicable' : (ao.scheduleTiming || 'after_confirmation'),
          enabledProfessionalIds: validProIds,
          professionalSelectionMode: ao.professionalSelectionMode || 'student_picks',
          attendanceFormat,
          sessionCapacity,
          allowedWeekdays: validWeekdays,
          displayOrder: mergedOptions.length
        };

        const key = sig(newOpt);
        if (!seenSig.has(key)) {
          mergedOptions.push(newOpt);
          seenSig.add(key);
        }
      }

      if (mergedOptions.length > 0) {
        const distinctTargetServices = new Set(mergedOptions.map(o => o.addonServiceId));
        const hasRestrictedAddon = mergedOptions.some(o => o.baseOptionRestrictionMode === 'selected');
        const allAllowedBaseOptIds = new Set(mergedOptions.flatMap(o => o.acceptedBaseOptionIds || []));
        const currentSavedBaseOpts = normalizeCommercialPriceOptions(baseRow?.commercial_price_options_json, {
          studioServiceType: baseRow?.studio_service_type
        });
        const updatedBaseCommercialOpts =
          hasRestrictedAddon && currentSavedBaseOpts.length > 0
            ? currentSavedBaseOpts.map((co) => ({
                ...co,
                allowOptionalAddons: allAllowedBaseOptIds.has(co.id)
              }))
            : undefined;

        saveService(req, {
          ...(updatedBaseCommercialOpts ? { commercialPriceOptions: updatedBaseCommercialOpts } : {}),
          optionalAddons: {
            enabled: true,
            allowMultiple: existingCfg.allowMultiple || distinctTargetServices.size > 1,
            promptTitle: existingCfg.promptTitle || 'Deseja adicionar acompanhamento personalizado?',
            noAddonLabel: existingCfg.noAddonLabel || 'Não adicionar',
            options: mergedOptions
          }
        }, baseId);
      }
    } catch (error) {
      throw catalogError((row.name || 'Serviço sem nome') + ' — ' + (error as Error).message, (error as { status?: number }).status || 500);
    }
  }

  for (const row of proposal.packages) {
    if (row.action === 'ignore') {
      ignoredPackages.push({ key: row.key, name: row.name || 'Pacote' });
      continue;
    }
    try {
      if (!row.reviewed) throw catalogError('Marque a revisão como concluída.');
      if (row.action === 'link') {
        const target = catalog.packages.find(p => p.active && p.id === row.existingId);
        if (!target) throw catalogError('Selecione um pacote ativo deste estabelecimento.');
        linkedPackageIds.push(target.id);
        packages.push({
          key: row.key,
          id: target.id,
          name: target.name,
          action: row.action,
          published: Number((target as any).allow_public_booking ?? 1) !== 0
        });
        continue;
      }
      nonempty(row.name, 'Informe o nome do pacote.');
      if (catalog.packages.some(p => nameKey(p.name) === nameKey(row.name))) throw catalogError('Já existe um pacote com esse nome.');
      const itemIds = new Set<string>();
      const items = row.items.map(item => {
        const id = references.get(item.serviceRef);
        if (!id || itemIds.has(id)) throw catalogError('Vincule cada componente a um serviço distinto, existente ou selecionado nesta importação.');
        itemIds.add(id);
        const service = catalog.services.find(s => s.id === id)!;
        const type = currentServiceType(service);
        if (['individual', 'duo', 'group', 'deliverable'].includes(type) && !item.includedCredits) {
          throw catalogError('Informe as unidades ou aulas incluídas de ' + service.name + '.');
        }
        return {
          serviceId: id, includedCredits: item.includedCredits, weeklyFrequency: item.weeklyFrequency,
          monthlyLimit: item.monthlyLimit, isMandatory: item.mandatory
        };
      });
      const created = PackageService.createPackage(tenantId, {
        name: row.name, description: asDescription(row), ...packagePrice(row.price), items, allowPublicBooking: row.allowPublicBooking !== false
      }, req.user!.userId);
      if (!created?.id) throw catalogError('Falha ao gravar o pacote.', 500);
      createdPackageIds.push(created.id);
      packages.push({
        key: row.key,
        id: created.id,
        name: row.name,
        action: row.action,
        published: Number((created as any).allow_public_booking ?? (row.allowPublicBooking !== false ? 1 : 0)) !== 0
      });
      catalog.packages.push(created);
    } catch (error) {
      throw catalogError((row.name || 'Pacote sem nome') + ' — ' + (error as Error).message, (error as { status?: number }).status || 500);
    }
  }
  if (!services.length && !packages.length) throw catalogError('Selecione ao menos um registro para importar.');

  const allPersistedServiceIds = [...new Set([...createdServiceIds, ...updatedServiceIds, ...linkedServiceIds])];
  const allPersistedPackageIds = [...new Set([...createdPackageIds, ...linkedPackageIds])];
  const verifiedSrvCount = allPersistedServiceIds.length > 0
    ? Number((db.prepare(`SELECT COUNT(*) as cnt FROM services WHERE tenant_id = ? AND id IN (${allPersistedServiceIds.map(() => '?').join(',')})`).get(tenantId, ...allPersistedServiceIds) as any)?.cnt || 0)
    : 0;
  const verifiedPkgCount = allPersistedPackageIds.length > 0
    ? Number((db.prepare(`SELECT COUNT(*) as cnt FROM service_packages WHERE tenant_id = ? AND id IN (${allPersistedPackageIds.map(() => '?').join(',')})`).get(tenantId, ...allPersistedPackageIds) as any)?.cnt || 0)
    : 0;
  if (verifiedSrvCount !== allPersistedServiceIds.length || verifiedPkgCount !== allPersistedPackageIds.length) {
    throw catalogError('Falha ao verificar todos os registros no catálogo oficial após gravação.', 500);
  }

  return {
    services,
    packages,
    createdServiceIds,
    updatedServiceIds,
    linkedServiceIds,
    createdPriceOptionIds,
    createdPackageIds,
    linkedPackageIds,
    ignoredServices,
    ignoredPackages,
    verifiedCatalogCount: verifiedSrvCount + verifiedPkgCount
  };
}

function currentServiceType(service: CatalogService) {
  const type = normalizeStudioServiceType(service.studio_service_type, service.service_kind);
  if (type === 'group') return service.default_capacity === 2 ? 'duo' : 'group';
  if (type === 'non_scheduled') return 'deliverable';
  if (type === 'facility_access') {
    try { if (JSON.parse(service.access_config_json || '{}').accessMode === 'limited') return 'access_limited'; } catch { /* legacy row */ }
    return 'access_unlimited';
  }
  return 'individual';
}
