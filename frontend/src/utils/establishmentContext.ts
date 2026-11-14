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

export const RECURRENCE_UNIT_LABELS: Record<RecurrenceIntervalUnit, string> = {
  days: 'Dia(s)',
  weeks: 'Semana(s)',
  months: 'Mês(es)'
};

export const MAX_RECURRENCE_OCCURRENCES = 366;
export const MAX_PUBLIC_RECURRENCE_OCCURRENCES = 260;

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
  const months = PLAN_DURATION_MONTHS[String(durationCode || '').trim() as PlanDurationCode];
  if (!months || months <= 0) return null;

  const [y, m, d] = cleanStart.split('-').map(Number);
  const targetTotalMonths = y * 12 + (m - 1) + months;
  const targetYear = Math.floor(targetTotalMonths / 12);
  const targetMonthZero = targetTotalMonths % 12;
  const lastDayTargetMonth = new Date(Date.UTC(targetYear, targetMonthZero + 1, 0, 12, 0, 0)).getUTCDate();
  const clampedDay = Math.min(d, lastDayTargetMonth);
  const anniversary = new Date(Date.UTC(targetYear, targetMonthZero, clampedDay, 12, 0, 0));
  anniversary.setUTCDate(anniversary.getUTCDate() - 1);
  return anniversary.toISOString().slice(0, 10);
}

export function normalizeEstablishmentProfile(raw?: unknown): EstablishmentProfile {
  const val = String(raw || '').trim().toLowerCase();
  if (val === 'studio' || val === 'mixed') return val;
  return 'clinic';
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

export function shouldRedirectAppointmentToZemdaPersonal(params: {
  establishmentProfile?: unknown;
  serviceDomain?: unknown;
  serviceKind?: unknown;
  occurrenceId?: unknown;
  appointmentClinicalModule?: unknown;
  serviceClinicalModule?: unknown;
}): boolean {
  const profile = normalizeEstablishmentProfile(params.establishmentProfile);
  if (profile === 'clinic') return false;
  if (profile === 'studio') return true;

  if (String(params.serviceKind || '').trim().toLowerCase() === 'group' || Boolean(params.occurrenceId)) {
    return true;
  }
  const explicit = String(params.serviceDomain || '').trim().toLowerCase();
  if (explicit === 'studio') return true;
  if (explicit === 'clinical') return false;

  if (
    String(params.appointmentClinicalModule || '').trim() === 'ZemdaPersonal' ||
    String(params.serviceClinicalModule || '').trim() === 'ZemdaPersonal'
  ) {
    return true;
  }
  return false;
}

export interface ParsedServiceRecurrenceConfig {
  allowRecurrence: boolean;
  allowedFrequencies: RecurrenceFrequency[];
  defaultFrequency: RecurrenceFrequency | null;
  customIntervals: RecurrenceIntervalSpec[];
  defaultCustomInterval: RecurrenceIntervalSpec | null;
  allowedPlanDurations: Exclude<PlanDurationCode, 'legacy_frequency'>[];
  defaultPlanDuration: Exclude<PlanDurationCode, 'legacy_frequency'>;
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

function parseCustomIntervalsInput(raw: unknown): RecurrenceIntervalSpec[] {
  if (Array.isArray(raw)) {
    return dedupeCustomIntervals(raw.map(normalizeCustomIntervalSpec).filter(Boolean) as RecurrenceIntervalSpec[]);
  }
  if (typeof raw === 'string' && raw.trim()) {
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

function parseDefaultIntervalInput(raw: unknown): RecurrenceIntervalSpec | null {
  if (!raw) return null;
  if (typeof raw === 'object') return normalizeCustomIntervalSpec(raw);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return normalizeCustomIntervalSpec(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  return null;
}

export function parseServiceRecurrenceConfig(service?: {
  allow_recurrence?: number | boolean | null;
  allowed_recurrence_frequencies?: string[] | null;
  allowed_recurrence_frequencies_json?: string | null;
  default_recurrence_frequency?: string | null;
  custom_recurrence_intervals?: RecurrenceIntervalSpec[] | null;
  custom_recurrence_intervals_json?: string | null;
  default_recurrence_interval?: RecurrenceIntervalSpec | null;
  default_recurrence_interval_json?: string | null;
  allowed_plan_durations?: string[] | null;
  allowed_plan_durations_json?: string | null;
  default_plan_duration?: string | null;
} | null): ParsedServiceRecurrenceConfig {
  const defaultDurations: Exclude<PlanDurationCode, 'legacy_frequency'>[] = [...ALL_PLAN_DURATIONS];

  if (!service) {
    return {
      allowRecurrence: true,
      allowedFrequencies: [...ALL_RECURRENCE_FREQUENCIES],
      defaultFrequency: 'weekly',
      customIntervals: [],
      defaultCustomInterval: null,
      allowedPlanDurations: defaultDurations,
      defaultPlanDuration: '1_month',
      hasExplicitConfig: false
    };
  }

  let allowedPlanDurations: Exclude<PlanDurationCode, 'legacy_frequency'>[] = [...defaultDurations];
  const rawDurations = Array.isArray(service.allowed_plan_durations)
    ? service.allowed_plan_durations
    : (() => {
        if (typeof service.allowed_plan_durations_json === 'string' && service.allowed_plan_durations_json.trim()) {
          try {
            const p = JSON.parse(service.allowed_plan_durations_json);
            return Array.isArray(p) ? p : null;
          } catch {
            return null;
          }
        }
        return null;
      })();

  if (rawDurations && rawDurations.length > 0) {
    const valid = Array.from(
      new Set(rawDurations.map(v => String(v || '').trim()).filter(v => isValidPlanDurationCode(v) && v !== 'legacy_frequency'))
    ) as Exclude<PlanDurationCode, 'legacy_frequency'>[];
    if (valid.length > 0) allowedPlanDurations = valid;
  }

  const rawDefDur = String(service.default_plan_duration || '').trim();
  const defaultPlanDuration: Exclude<PlanDurationCode, 'legacy_frequency'> =
    isValidPlanDurationCode(rawDefDur) &&
    rawDefDur !== 'legacy_frequency' &&
    allowedPlanDurations.includes(rawDefDur as Exclude<PlanDurationCode, 'legacy_frequency'>)
      ? (rawDefDur as Exclude<PlanDurationCode, 'legacy_frequency'>)
      : (allowedPlanDurations.includes('1_month') ? '1_month' : allowedPlanDurations[0]);

  const allowFlag = Number(service.allow_recurrence ?? 1) !== 0;
  if (!allowFlag) {
    return {
      allowRecurrence: false,
      allowedFrequencies: [],
      defaultFrequency: null,
      customIntervals: [],
      defaultCustomInterval: null,
      allowedPlanDurations,
      defaultPlanDuration,
      hasExplicitConfig: true
    };
  }

  const customIntervalsRaw = parseCustomIntervalsInput(
    service.custom_recurrence_intervals ?? service.custom_recurrence_intervals_json
  );
  const rawDefaultInterval = parseDefaultIntervalInput(
    service.default_recurrence_interval ?? service.default_recurrence_interval_json
  );
  const effectiveDefaultInterval = rawDefaultInterval || customIntervalsRaw[0] || null;
  const customIntervals = effectiveDefaultInterval
    ? dedupeCustomIntervals([effectiveDefaultInterval, ...customIntervalsRaw])
    : customIntervalsRaw;

  let parsedList: RecurrenceFrequency[] | null = null;
  if (Array.isArray(service.allowed_recurrence_frequencies)) {
    parsedList = Array.from(
      new Set(service.allowed_recurrence_frequencies.filter(isValidRecurrenceFrequency))
    );
  } else if (typeof service.allowed_recurrence_frequencies_json === 'string' && service.allowed_recurrence_frequencies_json.trim()) {
    try {
      const raw = JSON.parse(service.allowed_recurrence_frequencies_json);
      if (Array.isArray(raw)) {
        parsedList = Array.from(
          new Set(raw.map(v => String(v).trim()).filter(isValidRecurrenceFrequency))
        );
      }
    } catch {
      parsedList = null;
    }
  }

  const rawDefault = String(service.default_recurrence_frequency || '').trim();
  if (parsedList !== null) {
    if (parsedList.length === 0) {
      return {
        allowRecurrence: false,
        allowedFrequencies: [],
        defaultFrequency: null,
        customIntervals: [],
        defaultCustomInterval: null,
        allowedPlanDurations,
        defaultPlanDuration,
        hasExplicitConfig: true
      };
    }
    const defaultFrequency = isValidRecurrenceFrequency(rawDefault) && parsedList.includes(rawDefault)
      ? rawDefault
      : parsedList[0];
    return {
      allowRecurrence: true,
      allowedFrequencies: parsedList,
      defaultFrequency,
      customIntervals: parsedList.includes('custom_interval') ? customIntervals : [],
      defaultCustomInterval: parsedList.includes('custom_interval') ? effectiveDefaultInterval : null,
      allowedPlanDurations,
      defaultPlanDuration,
      hasExplicitConfig: true
    };
  }

  return {
    allowRecurrence: true,
    allowedFrequencies: [...ALL_RECURRENCE_FREQUENCIES],
    defaultFrequency: isValidRecurrenceFrequency(rawDefault) ? rawDefault : 'weekly',
    customIntervals,
    defaultCustomInterval: effectiveDefaultInterval,
    allowedPlanDurations,
    defaultPlanDuration,
    hasExplicitConfig: false
  };
}

export function isSidebarItemAllowedForProfile(itemId: string, profileRaw?: unknown): boolean {
  const profile = normalizeEstablishmentProfile(profileRaw);
  if (profile === 'studio') {
    const clinicOnlyItems = new Set([
      'clinical',
      'clinical-records',
      'pending-exams',
      'zemda-med',
      'zemda-odonto',
      'zemda-fisio',
      'zemda-nutri',
      'zemda-psico',
      'zemda-fono',
      'zemda-to',
      'zemda-pp',
      'zemda-estetic',
      'zemda-body',
      'zemda360'
    ]);
    return !clinicOnlyItems.has(itemId);
  }
  return true;
}

export interface ActiveStudioSession {
  appointmentId: string;
  patientId: string;
  patientName?: string;
  serviceId?: string | null;
  serviceName?: string | null;
  serviceKind?: string | null;
  serviceDomain?: string | null;
  occurrenceId?: string | null;
  startTime?: string | null;
  tenantId?: string | null;
}

export const STUDIO_SESSION_STORAGE_KEY = 'zemda_active_studio_session';

export function buildActiveStudioSessionFromAppointment(appt: any, tenantId?: string | null): ActiveStudioSession {
  const serviceKind = String(appt?.service_kind || '').trim().toLowerCase() || (appt?.occurrence_id ? 'group' : 'individual');
  return {
    appointmentId: String(appt?.id || ''),
    patientId: String(appt?.patient_id || ''),
    patientName: appt?.patient_name ? String(appt.patient_name) : undefined,
    serviceId: appt?.service_id ? String(appt.service_id) : null,
    serviceName: appt?.service_name ? String(appt.service_name) : null,
    serviceKind,
    serviceDomain: appt?.service_domain ? String(appt.service_domain) : null,
    occurrenceId: appt?.occurrence_id ? String(appt.occurrence_id) : null,
    startTime: appt?.start_time ? String(appt.start_time) : null,
    tenantId: tenantId || (appt?.tenant_id ? String(appt.tenant_id) : null)
  };
}

export function readActiveStudioSession(): ActiveStudioSession | null {
  try {
    const raw = sessionStorage.getItem(STUDIO_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || (!parsed.appointmentId && !parsed.occurrenceId)) return null;
    return parsed as ActiveStudioSession;
  } catch {
    return null;
  }
}

export function writeActiveStudioSession(session: ActiveStudioSession | null): void {
  try {
    if (!session) {
      sessionStorage.removeItem(STUDIO_SESSION_STORAGE_KEY);
    } else {
      sessionStorage.setItem(STUDIO_SESSION_STORAGE_KEY, JSON.stringify(session));
    }
    window.dispatchEvent(new CustomEvent('zemda-studio-session-changed', { detail: session }));
  } catch {
    // ignore storage errors
  }
}

export function clearActiveStudioSession(): void {
  writeActiveStudioSession(null);
}
