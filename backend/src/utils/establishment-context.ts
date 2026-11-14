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

export const MAX_RECURRENCE_OCCURRENCES = 104;
export const MAX_PUBLIC_RECURRENCE_OCCURRENCES = 24;
export const MAX_RECURRENCE_SPAN_DAYS = 1831; // Até 5 anos de horizonte máximo

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
}): string {
  if (params.frequency === 'custom_interval' && params.intervalValue && params.intervalUnit) {
    return formatCustomIntervalLabel({
      intervalValue: params.intervalValue,
      intervalUnit: params.intervalUnit
    });
  }
  if (params.frequency === 'custom_weekdays' && Array.isArray(params.weekdays) && params.weekdays.length > 0) {
    const names = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const labels = params.weekdays.map(w => names[w]).filter(Boolean);
    if (labels.length > 0) return `Dias específicos (${labels.join(', ')})`;
  }
  return RECURRENCE_FREQUENCY_LABELS[params.frequency] || 'Recorrente';
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

export function parseServiceRecurrenceConfig(serviceRow: any): ParsedServiceRecurrenceConfig {
  const allowFlag = Number(serviceRow?.allow_recurrence ?? 1) !== 0;
  const rawJson = serviceRow?.allowed_recurrence_frequencies_json;
  const rawDefault = String(serviceRow?.default_recurrence_frequency || '').trim();
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
            customIntervals: [],
            defaultCustomInterval: null,
            hasExplicitConfig: true
          };
        }
        const defaultFrequency = isValidRecurrenceFrequency(rawDefault) && filtered.includes(rawDefault)
          ? rawDefault
          : filtered[0];
        return {
          allowRecurrence: true,
          allowedFrequencies: filtered,
          defaultFrequency,
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
  return {
    allowRecurrence: true,
    allowedFrequencies: [...ALL_RECURRENCE_FREQUENCIES],
    defaultFrequency: fallbackDefault,
    customIntervals: normalizedCustomIntervals,
    defaultCustomInterval: effectiveDefaultInterval,
    hasExplicitConfig: false
  };
}

export function validateServiceRecurrenceFrequency(
  serviceRow: any,
  requestedFrequency: unknown,
  requestedIntervalValue?: unknown,
  requestedIntervalUnit?: unknown
): {
  valid: true;
  frequency: RecurrenceFrequency;
  intervalValue: number | null;
  intervalUnit: RecurrenceIntervalUnit | null;
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

  const reqFreqRaw = String(requestedFrequency || '').trim();
  const reqFreq = reqFreqRaw || (config.defaultFrequency || config.allowedFrequencies[0]);

  if (!isValidRecurrenceFrequency(reqFreq)) {
    return {
      valid: false,
      code: 'INVALID_RECURRENCE_FREQUENCY',
      error: 'Frequência de recorrência inválida.',
      config
    };
  }

  if (!config.allowedFrequencies.includes(reqFreq)) {
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
    config
  };
}

export function normalizeRecurrenceConfigForSave(input: {
  allowRecurrence?: unknown;
  allowedRecurrenceFrequencies?: unknown;
  defaultRecurrenceFrequency?: unknown;
  customRecurrenceIntervals?: unknown;
  defaultRecurrenceInterval?: unknown;
}): {
  allowRecurrenceInt: 0 | 1;
  allowedJson: string | null;
  defaultFrequency: RecurrenceFrequency | null;
  customIntervalsJson: string | null;
  defaultIntervalJson: string | null;
  error?: string;
} {
  const rawAllowed = input.allowedRecurrenceFrequencies;
  const hasExplicitArray = Array.isArray(rawAllowed);

  if (input.allowRecurrence === false || input.allowRecurrence === 0 || input.allowRecurrence === '0') {
    return {
      allowRecurrenceInt: 0,
      allowedJson: hasExplicitArray ? '[]' : null,
      defaultFrequency: null,
      customIntervalsJson: null,
      defaultIntervalJson: null
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
      customIntervalsJson: null,
      defaultIntervalJson: null,
      error: 'Frequência padrão de recorrência inválida.'
    };
  }

  return {
    allowRecurrenceInt: 1,
    allowedJson: null,
    defaultFrequency: rawDefault && isValidRecurrenceFrequency(rawDefault) ? rawDefault : null,
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
