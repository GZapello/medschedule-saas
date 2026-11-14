import { Request, Response, NextFunction } from 'express';
import { db } from '../config/database';

export type EstablishmentProfile = 'clinic' | 'studio' | 'mixed';
export type ServiceDomain = 'clinical' | 'studio';
export type RecurrenceFrequency =
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'bimonthly'
  | 'quarterly'
  | 'semiannual'
  | 'annual'
  | 'custom_weekdays'
  | 'custom_interval';

export type RecurrenceIntervalUnit = 'days' | 'weeks' | 'months';

export interface RecurrenceIntervalSpec {
  intervalValue: number;
  intervalUnit: RecurrenceIntervalUnit;
}

export const ALL_RECURRENCE_FREQUENCIES: RecurrenceFrequency[] = [
  'weekly',
  'biweekly',
  'monthly',
  'bimonthly',
  'quarterly',
  'semiannual',
  'annual',
  'custom_weekdays',
  'custom_interval'
];

export const RECURRENCE_FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
  bimonthly: 'Bimestral',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
  custom_weekdays: 'Dias específicos da semana',
  custom_interval: 'Personalizada'
};

export const RECURRENCE_INTERVAL_BOUNDS: Record<RecurrenceIntervalUnit, { min: number; max: number }> = {
  days: { min: 1, max: 365 },
  weeks: { min: 1, max: 52 },
  months: { min: 1, max: 24 }
};

export const MAX_RECURRENCE_OCCURRENCES = 366;
export const MAX_PUBLIC_RECURRENCE_OCCURRENCES = 260;
export const MAX_RECURRENCE_SPAN_DAYS = 1831; // Até 5 anos de horizonte máximo

export type PlanDurationCode =
  | '1_month'
  | '2_months'
  | '3_months'
  | '6_months'
  | '12_months'
  | '24_months'
  | 'custom_date'
  | 'count'
  | 'legacy_frequency';

export const ALL_PLAN_DURATIONS: Exclude<PlanDurationCode, 'legacy_frequency'>[] = [
  '1_month',
  '2_months',
  '3_months',
  '6_months',
  '12_months',
  '24_months',
  'custom_date',
  'count'
];

export const PLAN_DURATION_LABELS: Record<PlanDurationCode, string> = {
  '1_month': 'Mensal (1 mês)',
  '2_months': 'Bimestral (2 meses)',
  '3_months': 'Trimestral (3 meses)',
  '6_months': 'Semestral (6 meses)',
  '12_months': 'Anual (12 meses)',
  '24_months': 'Bienal (24 meses)',
  custom_date: 'Data final personalizada',
  count: 'Quantidade fixa de aulas',
  legacy_frequency: 'Intervalo legado'
};

export const PLAN_DURATION_MONTHS: Partial<Record<PlanDurationCode, number>> = {
  '1_month': 1,
  '2_months': 2,
  '3_months': 3,
  '6_months': 6,
  '12_months': 12,
  '24_months': 24
};

export function isValidPlanDurationCode(value: unknown): value is PlanDurationCode {
  const v = String(value || '').trim();
  return (ALL_PLAN_DURATIONS as string[]).includes(v) || v === 'legacy_frequency';
}

export function resolvePlanDurationEndDate(startDateYmd: string, durationCode?: unknown): string | null {
  const cleanStart = String(startDateYmd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanStart)) return null;
  const code = String(durationCode || '').trim() as PlanDurationCode;
  const months = PLAN_DURATION_MONTHS[code];
  if (!months || months <= 0) return null;

  const [y, m, d] = cleanStart.split('-').map(Number);
  const targetTotalMonths = y * 12 + (m - 1) + months;
  const targetYear = Math.floor(targetTotalMonths / 12);
  const targetMonthZero = targetTotalMonths % 12;
  const lastDayTargetMonth = new Date(Date.UTC(targetYear, targetMonthZero + 1, 0, 12, 0, 0)).getUTCDate();
  const clampedDay = Math.min(d, lastDayTargetMonth);
  const anniversary = new Date(Date.UTC(targetYear, targetMonthZero, clampedDay, 12, 0, 0));
  // Vigência inclusive de 1º dia até véspera do aniversário (ex: 13/11/2026 .. 12/11/2027 = 1 ano exato de grade semanal)
  anniversary.setUTCDate(anniversary.getUTCDate() - 1);
  return anniversary.toISOString().slice(0, 10);
}

export function normalizeEstablishmentProfile(raw?: unknown): EstablishmentProfile {
  const val = String(raw || '').trim().toLowerCase();
  if (val === 'studio' || val === 'mixed') return val;
  return 'clinic';
}

export function getTenantEstablishmentProfile(tenantId: string): EstablishmentProfile {
  if (!tenantId) return 'clinic';
  const row = db
    .prepare(`SELECT COALESCE(establishment_profile, 'clinic') as establishment_profile FROM tenants WHERE id = ?`)
    .get(tenantId) as { establishment_profile?: string } | undefined;
  return normalizeEstablishmentProfile(row?.establishment_profile);
}

export function isClinicProfile(profile?: unknown): boolean {
  return normalizeEstablishmentProfile(profile) === 'clinic';
}

export function isStudioProfile(profile?: unknown): boolean {
  return normalizeEstablishmentProfile(profile) === 'studio';
}

export function isMixedProfile(profile?: unknown): boolean {
  return normalizeEstablishmentProfile(profile) === 'mixed';
}

export function supportsStudioFeatures(profile?: unknown): boolean {
  const p = normalizeEstablishmentProfile(profile);
  return p === 'studio' || p === 'mixed';
}

export function supportsClinicalFeatures(profile?: unknown): boolean {
  const p = normalizeEstablishmentProfile(profile);
  return p === 'clinic' || p === 'mixed';
}

/**
 * Resolve o domínio efetivo de um serviço ('clinical' | 'studio') sem usar heurísticas frágeis por texto.
 */
export function resolveServiceDomain(params: {
  establishmentProfile?: unknown;
  serviceDomain?: unknown;
  serviceKind?: unknown;
  clinicalModule?: unknown;
}): ServiceDomain {
  const profile = normalizeEstablishmentProfile(params.establishmentProfile);
  if (profile === 'clinic') return 'clinical';
  if (profile === 'studio') return 'studio';

  const explicit = String(params.serviceDomain || '').trim().toLowerCase();
  if (explicit === 'studio' || explicit === 'clinical') {
    return explicit as ServiceDomain;
  }

  if (String(params.serviceKind || '').trim().toLowerCase() === 'group') {
    return 'studio';
  }
  if (String(params.clinicalModule || '').trim() === 'ZemdaPersonal') {
    return 'studio';
  }

  return 'clinical';
}

/**
 * Resolve o domínio de execução de um agendamento ('clinical' | 'studio').
 * Usado para decidir entre atendimento clínico tradicional vs ZemdaPersonal / Studio.
 */
export function resolveAppointmentWorkflowDomain(params: {
  establishmentProfile?: unknown;
  serviceDomain?: unknown;
  serviceKind?: unknown;
  appointmentServiceKind?: unknown;
  occurrenceId?: unknown;
  appointmentClinicalModule?: unknown;
  serviceClinicalModule?: unknown;
}): ServiceDomain {
  const profile = normalizeEstablishmentProfile(params.establishmentProfile);
  if (profile === 'clinic') return 'clinical';
  if (profile === 'studio') return 'studio';

  // Estabelecimento misto: respeita turma coletiva, domínio explícito do serviço e módulo ZemdaPersonal
  if (
    String(params.appointmentServiceKind || '').trim().toLowerCase() === 'group' ||
    String(params.serviceKind || '').trim().toLowerCase() === 'group' ||
    Boolean(params.occurrenceId)
  ) {
    return 'studio';
  }

  const explicit = String(params.serviceDomain || '').trim().toLowerCase();
  if (explicit === 'studio' || explicit === 'clinical') {
    return explicit as ServiceDomain;
  }

  const apptMod = String(params.appointmentClinicalModule || '').trim();
  const srvMod = String(params.serviceClinicalModule || '').trim();
  if (apptMod === 'ZemdaPersonal' || srvMod === 'ZemdaPersonal') {
    return 'studio';
  }

  return 'clinical';
}

export function shouldUseStudioPersonalWorkflow(params: {
  establishmentProfile?: unknown;
  serviceDomain?: unknown;
  serviceKind?: unknown;
  appointmentServiceKind?: unknown;
  occurrenceId?: unknown;
  appointmentClinicalModule?: unknown;
  serviceClinicalModule?: unknown;
}): boolean {
  return resolveAppointmentWorkflowDomain(params) === 'studio';
}

export interface ParsedServiceRecurrenceConfig {
  allowRecurrence: boolean;
  allowedFrequencies: RecurrenceFrequency[];
  defaultFrequency: RecurrenceFrequency | null;
  allowedPlanDurations: PlanDurationCode[];
  defaultPlanDuration: PlanDurationCode | null;
  customIntervals: RecurrenceIntervalSpec[];
  defaultCustomInterval: RecurrenceIntervalSpec | null;
  hasExplicitConfig: boolean;
}

export function isValidRecurrenceFrequency(value: unknown): value is RecurrenceFrequency {
  return ALL_RECURRENCE_FREQUENCIES.includes(String(value || '').trim() as RecurrenceFrequency);
}

export function isValidRecurrenceIntervalUnit(value: unknown): value is RecurrenceIntervalUnit {
  const unit = String(value || '').trim().toLowerCase();
  return unit === 'days' || unit === 'weeks' || unit === 'months';
}

export function normalizeCustomIntervalSpec(raw: any): RecurrenceIntervalSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const rawUnit = String(raw.intervalUnit ?? raw.interval_unit ?? raw.unit ?? '').trim().toLowerCase();
  if (!isValidRecurrenceIntervalUnit(rawUnit)) return null;
  const rawVal = Number(raw.intervalValue ?? raw.interval_value ?? raw.value);
  if (!Number.isInteger(rawVal)) return null;
  const bounds = RECURRENCE_INTERVAL_BOUNDS[rawUnit];
  if (rawVal < bounds.min || rawVal > bounds.max) return null;
  return { intervalValue: rawVal, intervalUnit: rawUnit };
}

export function dedupeCustomIntervals(specs: RecurrenceIntervalSpec[]): RecurrenceIntervalSpec[] {
  const seen = new Set<string>();
  const out: RecurrenceIntervalSpec[] = [];
  for (const spec of specs) {
    const key = `${spec.intervalValue}:${spec.intervalUnit}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ intervalValue: spec.intervalValue, intervalUnit: spec.intervalUnit });
    }
  }
  return out;
}

export function formatCustomIntervalLabel(spec: RecurrenceIntervalSpec): string {
  const n = spec.intervalValue;
  if (spec.intervalUnit === 'days') return `A cada ${n} ${n === 1 ? 'dia' : 'dias'}`;
  if (spec.intervalUnit === 'weeks') return `A cada ${n} ${n === 1 ? 'semana' : 'semanas'}`;
  return `A cada ${n} ${n === 1 ? 'mês' : 'meses'}`;
}

export function resolveIntervalSpecFromFrequency(
  frequency: RecurrenceFrequency,
  intervalValue?: unknown,
  intervalUnit?: unknown
): { ok: true; spec: RecurrenceIntervalSpec | null } | { ok: false; code: string; error: string } {
  switch (frequency) {
    case 'weekly':
      return { ok: true, spec: { intervalValue: 1, intervalUnit: 'weeks' } };
    case 'biweekly':
      return { ok: true, spec: { intervalValue: 2, intervalUnit: 'weeks' } };
    case 'monthly':
      return { ok: true, spec: { intervalValue: 1, intervalUnit: 'months' } };
    case 'bimonthly':
      return { ok: true, spec: { intervalValue: 2, intervalUnit: 'months' } };
    case 'quarterly':
      return { ok: true, spec: { intervalValue: 3, intervalUnit: 'months' } };
    case 'semiannual':
      return { ok: true, spec: { intervalValue: 6, intervalUnit: 'months' } };
    case 'annual':
      return { ok: true, spec: { intervalValue: 12, intervalUnit: 'months' } };
    case 'custom_weekdays':
      return { ok: true, spec: null };
    case 'custom_interval': {
      const unitStr = String(intervalUnit ?? '').trim().toLowerCase();
      if (!isValidRecurrenceIntervalUnit(unitStr)) {
        return {
          ok: false,
          code: 'INVALID_RECURRENCE_INTERVAL',
          error: 'Informe uma unidade válida para o intervalo personalizado (dias, semanas ou meses).'
        };
      }
      const numVal = Number(intervalValue);
      const bounds = RECURRENCE_INTERVAL_BOUNDS[unitStr];
      if (!Number.isInteger(numVal) || numVal < bounds.min || numVal > bounds.max) {
        const unitLabel = unitStr === 'days' ? 'dias' : unitStr === 'weeks' ? 'semanas' : 'meses';
        return {
          ok: false,
          code: 'INVALID_RECURRENCE_INTERVAL',
          error: `Para "${unitLabel}", o intervalo personalizado deve ser um número inteiro entre ${bounds.min} e ${bounds.max}.`
        };
      }
      return { ok: true, spec: { intervalValue: numVal, intervalUnit: unitStr } };
    }
    default:
      return {
        ok: false,
        code: 'INVALID_RECURRENCE_FREQUENCY',
        error: 'Frequência de recorrência inválida.'
      };
  }
}

export function formatRecurrenceDescription(params: {
  frequency: RecurrenceFrequency;
  intervalValue?: number | null;
  intervalUnit?: RecurrenceIntervalUnit | null;
  weekdays?: number[] | null;
  durationCode?: PlanDurationCode | null;
  endDate?: string | null;
}): string {
  let baseLabel: string;
  if (params.frequency === 'custom_interval' && params.intervalValue && params.intervalUnit) {
    baseLabel = formatCustomIntervalLabel({
      intervalValue: params.intervalValue,
      intervalUnit: params.intervalUnit
    });
  } else if (params.frequency === 'custom_weekdays' && Array.isArray(params.weekdays) && params.weekdays.length > 0) {
    const names = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const labels = params.weekdays.map(w => names[w]).filter(Boolean);
    baseLabel = labels.length > 0 ? `Dias específicos (${labels.join(', ')})` : RECURRENCE_FREQUENCY_LABELS[params.frequency];
  } else {
    baseLabel = RECURRENCE_FREQUENCY_LABELS[params.frequency] || 'Recorrente';
    if ((params.frequency === 'weekly' || params.frequency === 'biweekly') && Array.isArray(params.weekdays) && params.weekdays.length > 0) {
      const names = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      const labels = params.weekdays.map(w => names[w]).filter(Boolean);
      if (labels.length > 0) {
        baseLabel = `${baseLabel} (${labels.join(', ')})`;
      }
    }
  }

  if (params.durationCode && params.durationCode !== 'legacy_frequency' && PLAN_DURATION_LABELS[params.durationCode]) {
    return `${baseLabel} • ${PLAN_DURATION_LABELS[params.durationCode]}`;
  }
  return baseLabel;
}

function parseCustomIntervalsColumn(raw: unknown): RecurrenceIntervalSpec[] {
  if (Array.isArray(raw)) {
    return dedupeCustomIntervals(raw.map(normalizeCustomIntervalSpec).filter(Boolean) as RecurrenceIntervalSpec[]);
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return dedupeCustomIntervals(parsed.map(normalizeCustomIntervalSpec).filter(Boolean) as RecurrenceIntervalSpec[]);
      }
    } catch {
      return [];
    }
  }
  return [];
}

function parseDefaultCustomIntervalColumn(raw: unknown): RecurrenceIntervalSpec | null {
  if (!raw) return null;
  if (typeof raw === 'object') return normalizeCustomIntervalSpec(raw);
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      return normalizeCustomIntervalSpec(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  return null;
}

function deriveDefaultPlanDurations(freqs: RecurrenceFrequency[]): PlanDurationCode[] {
  const mapped: PlanDurationCode[] = [];
  if (freqs.includes('monthly')) mapped.push('1_month');
  if (freqs.includes('bimonthly')) mapped.push('2_months');
  if (freqs.includes('quarterly')) mapped.push('3_months');
  if (freqs.includes('semiannual')) mapped.push('6_months');
  if (freqs.includes('annual')) mapped.push('12_months');
  if (mapped.length === 0) {
    return [...ALL_PLAN_DURATIONS];
  }
  return Array.from(new Set<PlanDurationCode>([...mapped, 'custom_date', 'count']));
}

function parsePlanDurationsColumn(raw: unknown): PlanDurationCode[] | null {
  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.map(v => String(v || '').trim()).filter(isValidPlanDurationCode)));
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return Array.from(new Set(parsed.map(v => String(v || '').trim()).filter(isValidPlanDurationCode)));
      }
    } catch {
      return null;
    }
  }
  return null;
}

export function parseServiceRecurrenceConfig(serviceRow: any): ParsedServiceRecurrenceConfig {
  const allowFlag = Number(serviceRow?.allow_recurrence ?? 1) !== 0;
  const rawJson = serviceRow?.allowed_recurrence_frequencies_json;
  const rawDefault = String(serviceRow?.default_recurrence_frequency || '').trim();
  const explicitPlanDurations = parsePlanDurationsColumn(
    serviceRow?.allowed_plan_durations ?? serviceRow?.allowed_plan_durations_json
  );
  const rawDefPlanDuration = String(
    serviceRow?.default_plan_duration ?? serviceRow?.defaultPlanDuration ?? ''
  ).trim();
  const customIntervals = parseCustomIntervalsColumn(
    serviceRow?.custom_recurrence_intervals ?? serviceRow?.custom_recurrence_intervals_json
  );
  const rawDefInterval = parseDefaultCustomIntervalColumn(
    serviceRow?.default_recurrence_interval ?? serviceRow?.default_recurrence_interval_json
  );

  if (!allowFlag) {
    return {
      allowRecurrence: false,
      allowedFrequencies: [],
      defaultFrequency: null,
      allowedPlanDurations: [],
      defaultPlanDuration: null,
      customIntervals: [],
      defaultCustomInterval: null,
      hasExplicitConfig: true
    };
  }

  const effectiveDefaultInterval = rawDefInterval || customIntervals[0] || null;
  const normalizedCustomIntervals = effectiveDefaultInterval
    ? dedupeCustomIntervals([effectiveDefaultInterval, ...customIntervals])
    : customIntervals;

  if (typeof rawJson === 'string' && rawJson.trim() !== '') {
    try {
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed)) {
        const filtered = Array.from(
          new Set(parsed.map(v => String(v).trim()).filter(isValidRecurrenceFrequency))
        );
        if (filtered.length === 0) {
          return {
            allowRecurrence: false,
            allowedFrequencies: [],
            defaultFrequency: null,
            allowedPlanDurations: [],
            defaultPlanDuration: null,
            customIntervals: [],
            defaultCustomInterval: null,
            hasExplicitConfig: true
          };
        }
        const defaultFrequency = isValidRecurrenceFrequency(rawDefault) && filtered.includes(rawDefault)
          ? rawDefault
          : filtered[0];
        const planDurations = explicitPlanDurations && explicitPlanDurations.length > 0
          ? explicitPlanDurations
          : deriveDefaultPlanDurations(filtered);
        const defaultPlanDuration = isValidPlanDurationCode(rawDefPlanDuration) && planDurations.includes(rawDefPlanDuration)
          ? rawDefPlanDuration
          : planDurations[0] || null;
        return {
          allowRecurrence: true,
          allowedFrequencies: filtered,
          defaultFrequency,
          allowedPlanDurations: planDurations,
          defaultPlanDuration,
          customIntervals: filtered.includes('custom_interval') ? normalizedCustomIntervals : [],
          defaultCustomInterval: filtered.includes('custom_interval') ? effectiveDefaultInterval : null,
          hasExplicitConfig: true
        };
      }
    } catch {
      // Fall back to legacy behavior when JSON is malformed
    }
  }

  const fallbackDefault = isValidRecurrenceFrequency(rawDefault) ? rawDefault : 'weekly';
  const fallbackDurations = explicitPlanDurations && explicitPlanDurations.length > 0
    ? explicitPlanDurations
    : [...ALL_PLAN_DURATIONS];
  const fallbackDefaultDuration = isValidPlanDurationCode(rawDefPlanDuration) && fallbackDurations.includes(rawDefPlanDuration)
    ? rawDefPlanDuration
    : fallbackDurations[0] || '1_month';
  return {
    allowRecurrence: true,
    allowedFrequencies: [...ALL_RECURRENCE_FREQUENCIES],
    defaultFrequency: fallbackDefault,
    allowedPlanDurations: fallbackDurations,
    defaultPlanDuration: fallbackDefaultDuration,
    customIntervals: normalizedCustomIntervals,
    defaultCustomInterval: effectiveDefaultInterval,
    hasExplicitConfig: false
  };
}

export function validateServiceRecurrenceFrequency(
  serviceRow: any,
  requestedFrequency: unknown,
  requestedIntervalValue?: unknown,
  requestedIntervalUnit?: unknown,
  options?: {
    durationCode?: unknown;
    seriesMode?: unknown;
  }
): {
  valid: true;
  frequency: RecurrenceFrequency;
  intervalValue: number | null;
  intervalUnit: RecurrenceIntervalUnit | null;
  durationCode: PlanDurationCode | null;
  seriesMode: 'legacy' | 'schedule_plan';
  config: ParsedServiceRecurrenceConfig;
} | {
  valid: false;
  code: string;
  error: string;
  config: ParsedServiceRecurrenceConfig;
} {
  const config = parseServiceRecurrenceConfig(serviceRow);
  if (!config.allowRecurrence || config.allowedFrequencies.length === 0) {
    return {
      valid: false,
      code: 'RECURRENCE_NOT_ALLOWED',
      error: `O serviço "${serviceRow?.name || 'selecionado'}" está configurado sem recorrência.`,
      config
    };
  }

  const reqDurationRaw = options?.durationCode ? String(options.durationCode).trim() : '';
  const hasSchedulePlanSignal =
    String(options?.seriesMode || '').trim() === 'schedule_plan' ||
    (Boolean(reqDurationRaw) && reqDurationRaw !== 'legacy_frequency');

  if (reqDurationRaw && !isValidPlanDurationCode(reqDurationRaw)) {
    return {
      valid: false,
      code: 'INVALID_PLAN_DURATION',
      error: 'Duração da recorrência inválida.',
      config
    };
  }

  const durationCode: PlanDurationCode | null = reqDurationRaw && isValidPlanDurationCode(reqDurationRaw)
    ? reqDurationRaw
    : null;

  const seriesMode: 'legacy' | 'schedule_plan' = hasSchedulePlanSignal ? 'schedule_plan' : 'legacy';

  const reqFreqRaw = String(requestedFrequency || '').trim();
  let reqFreq = reqFreqRaw || (config.defaultFrequency || config.allowedFrequencies[0]);

  if (!isValidRecurrenceFrequency(reqFreq)) {
    return {
      valid: false,
      code: 'INVALID_RECURRENCE_FREQUENCY',
      error: 'Frequência de recorrência inválida.',
      config
    };
  }

  // Compatibilidade inteligente para serviços configurados antes da separação entre frequência da aula e duração do plano:
  // Se o chamador usar modo schedule_plan (com durationCode explícito), permite cadência semanal/dias da semana
  // sempre que o serviço permitir recorrência, mesmo que antes só tivesse marcado "monthly"/"annual"/"quarterly" como opção.
  const hasOnlyLegacyPlanFreqs = config.allowedFrequencies.every(f =>
    ['monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual'].includes(f)
  );
  const isScheduleCadenceAllowed =
    config.allowedFrequencies.includes(reqFreq) ||
    (seriesMode === 'schedule_plan' &&
      ['weekly', 'custom_weekdays'].includes(reqFreq) &&
      (hasOnlyLegacyPlanFreqs || config.allowedFrequencies.includes('weekly') || config.allowedFrequencies.includes('custom_weekdays')));

  if (!isScheduleCadenceAllowed) {
    const allowedLabels = config.allowedFrequencies.map(f => RECURRENCE_FREQUENCY_LABELS[f]).join(', ');
    return {
      valid: false,
      code: 'RECURRENCE_FREQUENCY_NOT_ALLOWED',
      error: `A frequência "${RECURRENCE_FREQUENCY_LABELS[reqFreq]}" não é permitida para "${serviceRow?.name || 'este serviço'}". Permitidas: ${allowedLabels}.`,
      config
    };
  }

  let effIntervalVal = requestedIntervalValue;
  let effIntervalUnit = requestedIntervalUnit;
  if (reqFreq === 'custom_interval' && (effIntervalVal === undefined || effIntervalVal === null || effIntervalVal === '')) {
    const fallback = config.defaultCustomInterval || config.customIntervals[0] || null;
    if (fallback) {
      effIntervalVal = fallback.intervalValue;
      effIntervalUnit = fallback.intervalUnit;
    }
  }

  const resolvedSpec = resolveIntervalSpecFromFrequency(reqFreq, effIntervalVal, effIntervalUnit);
  if (!resolvedSpec.ok) {
    return {
      valid: false,
      code: resolvedSpec.code,
      error: resolvedSpec.error,
      config
    };
  }

  return {
    valid: true,
    frequency: reqFreq,
    intervalValue: resolvedSpec.spec ? resolvedSpec.spec.intervalValue : null,
    intervalUnit: resolvedSpec.spec ? resolvedSpec.spec.intervalUnit : null,
    durationCode,
    seriesMode,
    config
  };
}

export function normalizeRecurrenceConfigForSave(input: {
  allowRecurrence?: unknown;
  allowedRecurrenceFrequencies?: unknown;
  defaultRecurrenceFrequency?: unknown;
  allowedPlanDurations?: unknown;
  defaultPlanDuration?: unknown;
  customRecurrenceIntervals?: unknown;
  defaultRecurrenceInterval?: unknown;
}): {
  allowRecurrenceInt: 0 | 1;
  allowedJson: string | null;
  defaultFrequency: RecurrenceFrequency | null;
  allowedPlanDurationsJson: string | null;
  defaultPlanDuration: PlanDurationCode | null;
  customIntervalsJson: string | null;
  defaultIntervalJson: string | null;
  error?: string;
} {
  const rawAllowed = input.allowedRecurrenceFrequencies;
  const hasExplicitArray = Array.isArray(rawAllowed);

  const normalizePlanDurationsPart = (): {
    allowedPlanDurationsJson: string | null;
    defaultPlanDuration: PlanDurationCode | null;
    error?: string;
  } => {
    const rawDurs = input.allowedPlanDurations;
    const rawDefDur = input.defaultPlanDuration !== undefined && input.defaultPlanDuration !== null
      ? String(input.defaultPlanDuration).trim()
      : '';
    if (rawDefDur && !isValidPlanDurationCode(rawDefDur)) {
      return {
        allowedPlanDurationsJson: null,
        defaultPlanDuration: null,
        error: 'Duração padrão da recorrência inválida.'
      };
    }
    if (Array.isArray(rawDurs)) {
      const invalidDur = rawDurs.filter(v => !isValidPlanDurationCode(v));
      if (invalidDur.length > 0) {
        return {
          allowedPlanDurationsJson: null,
          defaultPlanDuration: null,
          error: 'Uma ou mais durações de plano informadas são inválidas.'
        };
      }
      const dedupDurs = Array.from(new Set(rawDurs.map(v => String(v).trim()).filter(isValidPlanDurationCode)));
      const defDur: PlanDurationCode | null = rawDefDur && dedupDurs.includes(rawDefDur as PlanDurationCode)
        ? (rawDefDur as PlanDurationCode)
        : (dedupDurs[0] || null);
      return {
        allowedPlanDurationsJson: dedupDurs.length > 0 ? JSON.stringify(dedupDurs) : null,
        defaultPlanDuration: defDur
      };
    }
    return {
      allowedPlanDurationsJson: null,
      defaultPlanDuration: rawDefDur && isValidPlanDurationCode(rawDefDur) ? rawDefDur : null
    };
  };

  if (input.allowRecurrence === false || input.allowRecurrence === 0 || input.allowRecurrence === '0') {
    return {
      allowRecurrenceInt: 0,
      allowedJson: hasExplicitArray ? '[]' : null,
      defaultFrequency: null,
      allowedPlanDurationsJson: null,
      defaultPlanDuration: null,
      customIntervalsJson: null,
      defaultIntervalJson: null
    };
  }

  const planDurPart = normalizePlanDurationsPart();
  if (planDurPart.error) {
    return {
      allowRecurrenceInt: 1,
      allowedJson: null,
      defaultFrequency: null,
      allowedPlanDurationsJson: null,
      defaultPlanDuration: null,
      customIntervalsJson: null,
      defaultIntervalJson: null,
      error: planDurPart.error
    };
  }

  let normalizedCustomList: RecurrenceIntervalSpec[] = [];
  if (input.customRecurrenceIntervals !== undefined && input.customRecurrenceIntervals !== null) {
    const rawItems = Array.isArray(input.customRecurrenceIntervals)
      ? input.customRecurrenceIntervals
      : parseCustomIntervalsColumn(input.customRecurrenceIntervals);
    if (!Array.isArray(rawItems)) {
      return {
        allowRecurrenceInt: 1,
        allowedJson: null,
        defaultFrequency: null,
        allowedPlanDurationsJson: planDurPart.allowedPlanDurationsJson,
        defaultPlanDuration: planDurPart.defaultPlanDuration,
        customIntervalsJson: null,
        defaultIntervalJson: null,
        error: 'Lista de intervalos personalizados inválida.'
      };
    }
    for (const item of rawItems) {
      const spec = normalizeCustomIntervalSpec(item);
      if (!spec) {
        return {
          allowRecurrenceInt: 1,
          allowedJson: null,
          defaultFrequency: null,
          allowedPlanDurationsJson: planDurPart.allowedPlanDurationsJson,
          defaultPlanDuration: planDurPart.defaultPlanDuration,
          customIntervalsJson: null,
          defaultIntervalJson: null,
          error: 'Intervalo personalizado fora dos limites permitidos (1–365 dias, 1–52 semanas ou 1–24 meses).'
        };
      }
      normalizedCustomList.push(spec);
    }
  }

  let normalizedDefaultInterval: RecurrenceIntervalSpec | null = null;
  if (input.defaultRecurrenceInterval !== undefined && input.defaultRecurrenceInterval !== null && input.defaultRecurrenceInterval !== '') {
    const parsedDefInt = parseDefaultCustomIntervalColumn(input.defaultRecurrenceInterval);
    if (!parsedDefInt) {
      return {
        allowRecurrenceInt: 1,
        allowedJson: null,
        defaultFrequency: null,
        allowedPlanDurationsJson: planDurPart.allowedPlanDurationsJson,
        defaultPlanDuration: planDurPart.defaultPlanDuration,
        customIntervalsJson: null,
        defaultIntervalJson: null,
        error: 'Intervalo personalizado padrão fora dos limites permitidos (1–365 dias, 1–52 semanas ou 1–24 meses).'
      };
    }
    normalizedDefaultInterval = parsedDefInt;
    normalizedCustomList = dedupeCustomIntervals([parsedDefInt, ...normalizedCustomList]);
  } else {
    normalizedCustomList = dedupeCustomIntervals(normalizedCustomList);
    if (normalizedCustomList.length > 0) {
      normalizedDefaultInterval = normalizedCustomList[0];
    }
  }

  if (hasExplicitArray) {
    const rawList = rawAllowed as unknown[];
    const invalid = rawList.filter(v => !isValidRecurrenceFrequency(v));
    if (invalid.length > 0) {
      return {
        allowRecurrenceInt: 1,
        allowedJson: null,
        defaultFrequency: null,
        allowedPlanDurationsJson: planDurPart.allowedPlanDurationsJson,
        defaultPlanDuration: planDurPart.defaultPlanDuration,
        customIntervalsJson: null,
        defaultIntervalJson: null,
        error: 'Uma ou mais frequências de recorrência informadas são inválidas.'
      };
    }

    const deduped = Array.from(new Set(rawList.map(v => String(v).trim()).filter(isValidRecurrenceFrequency)));
    if (deduped.length === 0) {
      return {
        allowRecurrenceInt: 0,
        allowedJson: '[]',
        defaultFrequency: null,
        allowedPlanDurationsJson: null,
        defaultPlanDuration: null,
        customIntervalsJson: null,
        defaultIntervalJson: null
      };
    }

    if (deduped.includes('custom_interval') && normalizedCustomList.length === 0) {
      const fallbackCustom: RecurrenceIntervalSpec = { intervalValue: 3, intervalUnit: 'days' };
      normalizedCustomList = [fallbackCustom];
      normalizedDefaultInterval = fallbackCustom;
    }

    const rawDefault = input.defaultRecurrenceFrequency !== undefined && input.defaultRecurrenceFrequency !== null
      ? String(input.defaultRecurrenceFrequency).trim()
      : '';

    if (rawDefault && !deduped.includes(rawDefault as RecurrenceFrequency)) {
      return {
        allowRecurrenceInt: 1,
        allowedJson: null,
        defaultFrequency: null,
        allowedPlanDurationsJson: planDurPart.allowedPlanDurationsJson,
        defaultPlanDuration: planDurPart.defaultPlanDuration,
        customIntervalsJson: null,
        defaultIntervalJson: null,
        error: 'A frequência padrão precisa estar entre as frequências permitidas do serviço.'
      };
    }

    const defaultFrequency: RecurrenceFrequency = (rawDefault && isValidRecurrenceFrequency(rawDefault))
      ? rawDefault
      : deduped[0];

    const includeCustom = deduped.includes('custom_interval');
    return {
      allowRecurrenceInt: 1,
      allowedJson: JSON.stringify(deduped),
      defaultFrequency,
      allowedPlanDurationsJson: planDurPart.allowedPlanDurationsJson,
      defaultPlanDuration: planDurPart.defaultPlanDuration,
      customIntervalsJson: includeCustom && normalizedCustomList.length > 0 ? JSON.stringify(normalizedCustomList) : null,
      defaultIntervalJson: includeCustom && normalizedDefaultInterval ? JSON.stringify(normalizedDefaultInterval) : null
    };
  }

  const rawDefault = input.defaultRecurrenceFrequency !== undefined && input.defaultRecurrenceFrequency !== null
    ? String(input.defaultRecurrenceFrequency).trim()
    : '';
  if (rawDefault && !isValidRecurrenceFrequency(rawDefault)) {
    return {
      allowRecurrenceInt: 1,
      allowedJson: null,
      defaultFrequency: null,
      allowedPlanDurationsJson: planDurPart.allowedPlanDurationsJson,
      defaultPlanDuration: planDurPart.defaultPlanDuration,
      customIntervalsJson: null,
      defaultIntervalJson: null,
      error: 'Frequência padrão de recorrência inválida.'
    };
  }

  return {
    allowRecurrenceInt: 1,
    allowedJson: null,
    defaultFrequency: rawDefault && isValidRecurrenceFrequency(rawDefault) ? rawDefault : null,
    allowedPlanDurationsJson: planDurPart.allowedPlanDurationsJson,
    defaultPlanDuration: planDurPart.defaultPlanDuration,
    customIntervalsJson: normalizedCustomList.length > 0 ? JSON.stringify(normalizedCustomList) : null,
    defaultIntervalJson: normalizedDefaultInterval ? JSON.stringify(normalizedDefaultInterval) : null
  };
}

export function requireStudioEstablishment(req: Request, res: Response, next: NextFunction): void {
  const tenantId = req.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Estabelecimento não identificado.' });
    return;
  }
  const profile = getTenantEstablishmentProfile(tenantId);
  if (!supportsStudioFeatures(profile)) {
    res.status(403).json({
      code: 'STUDIO_PROFILE_REQUIRED',
      error: 'Esta funcionalidade está disponível apenas para estabelecimentos configurados como Studio / Academia ou Estabelecimento Misto.'
    });
    return;
  }
  next();
}
