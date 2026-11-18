export const DEFAULT_TENANT_TIMEZONE = 'America/Sao_Paulo';

export type SlotTimingReasonCode =
  | 'PAST_DATE'
  | 'SLOT_PAST'
  | 'LEAD_TIME_NOT_MET'
  | 'TOO_FAR_IN_ADVANCE';

export interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dateYmd: string;
  hhmm: string;
  minutesOfDay: number;
}

export interface SlotTimingEvaluation {
  eligible: boolean;
  reasonCode: SlotTimingReasonCode | null;
  reasonMessage: string | null;
  slotStartMs: number;
  nowMs: number;
  timeZone: string;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  formatterCache.set(timeZone, fmt);
  return fmt;
}

export function normalizeTenantTimezone(raw?: string | null): string {
  const candidate = String(raw || '').trim();
  if (!candidate) return DEFAULT_TENANT_TIMEZONE;
  try {
    getPartsFormatter(candidate);
    return candidate;
  } catch {
    return DEFAULT_TENANT_TIMEZONE;
  }
}

export function getTenantTimezone(
  dbLike: { prepare?: (sql: string) => { get: (...args: any[]) => any } } | null | undefined,
  tenantId?: string | null
): string {
  if (!dbLike || typeof dbLike.prepare !== 'function' || !tenantId) {
    return DEFAULT_TENANT_TIMEZONE;
  }
  try {
    const row = dbLike
      .prepare('SELECT timezone FROM tenants WHERE id = ? LIMIT 1')
      .get(String(tenantId)) as { timezone?: string | null } | undefined;
    return normalizeTenantTimezone(row?.timezone);
  } catch {
    return DEFAULT_TENANT_TIMEZONE;
  }
}

export function getLocalDatePartsInTimezone(
  dateInput: Date | number | string = new Date(),
  timeZone: string = DEFAULT_TENANT_TIMEZONE
): LocalDateTimeParts {
  const tz = normalizeTenantTimezone(timeZone);
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const validDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = getPartsFormatter(tz).formatToParts(validDate);
  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      const parsed = Number(part.value);
      if (Number.isFinite(parsed)) {
        map[part.type] = parsed;
      }
    }
  }
  const year = map.year || validDate.getUTCFullYear();
  const month = map.month || validDate.getUTCMonth() + 1;
  const day = map.day || validDate.getUTCDate();
  const hour = (map.hour ?? validDate.getUTCHours()) % 24;
  const minute = map.minute ?? validDate.getUTCMinutes();
  const second = map.second ?? validDate.getUTCSeconds();

  const dateYmd = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const hhmm = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dateYmd,
    hhmm,
    minutesOfDay: hour * 60 + minute,
  };
}

export function getLocalTodayYmd(
  timeZone: string = DEFAULT_TENANT_TIMEZONE,
  now: Date | number | string = new Date()
): string {
  return getLocalDatePartsInTimezone(now, timeZone).dateYmd;
}

export function addDaysYmd(ymd: string, days: number): string {
  const m = String(ymd || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days, 12, 0, 0));
  return d.toISOString().slice(0, 10);
}

export function getWeekdayFromYmd(ymd: string): number {
  const m = String(ymd || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 0;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)).getUTCDay();
}

export function zonedDateTimeToUtcMs(
  dateYmd: string,
  timeHhmm: string,
  timeZone: string = DEFAULT_TENANT_TIMEZONE
): number {
  const tz = normalizeTenantTimezone(timeZone);
  const dateMatch = String(dateYmd || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = String(timeHhmm || '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!dateMatch || !timeMatch) {
    const parsed = new Date(`${dateYmd}T${String(timeHhmm || '00:00').slice(0, 5)}:00`).getTime();
    return Number.isFinite(parsed) ? parsed : Date.now();
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] || 0);

  const desiredWallMs = Date.UTC(year, month - 1, day, hour, minute, second);
  let utcMs = desiredWallMs;

  // Duas passagens convergem inclusive em viradas de horário de verão
  for (let i = 0; i < 2; i += 1) {
    const observed = getLocalDatePartsInTimezone(new Date(utcMs), tz);
    const observedWallMs = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second
    );
    const diffMs = desiredWallMs - observedWallMs;
    if (diffMs === 0) break;
    utcMs += diffMs;
  }

  return utcMs;
}

export function formatLeadTimeLabel(hours: number): string {
  const safe = Math.max(0, Number(hours || 0));
  if (safe < 1) {
    const mins = Math.max(1, Math.round(safe * 60));
    return `${mins} ${mins === 1 ? 'minuto' : 'minutos'}`;
  }
  if (Number.isInteger(safe)) {
    return `${safe} ${safe === 1 ? 'hora' : 'horas'}`;
  }
  const wholeHours = Math.floor(safe);
  const mins = Math.round((safe - wholeHours) * 60);
  if (mins <= 0) return `${wholeHours} ${wholeHours === 1 ? 'hora' : 'horas'}`;
  return `${wholeHours}h${String(mins).padStart(2, '0')}`;
}

export function evaluateSlotTimingStatus(params: {
  dateYmd: string;
  startTimeHhmm: string;
  timeZone?: string | null;
  now?: Date | number | string;
  minLeadTimeHours?: number | null;
  maxAdvanceDays?: number | null;
}): SlotTimingEvaluation {
  const tz = normalizeTenantTimezone(params.timeZone);
  const nowDate =
    params.now instanceof Date
      ? params.now
      : params.now !== undefined && params.now !== null
        ? new Date(params.now)
        : new Date();
  const validNow = Number.isNaN(nowDate.getTime()) ? new Date() : nowDate;
  const nowMs = validNow.getTime();
  const nowLocal = getLocalDatePartsInTimezone(validNow, tz);

  const dateYmd = String(params.dateYmd || '').trim().slice(0, 10);
  const timeHhmm = String(params.startTimeHhmm || '').trim().slice(0, 5);
  const slotStartMs = zonedDateTimeToUtcMs(dateYmd, timeHhmm, tz);

  if (dateYmd && dateYmd < nowLocal.dateYmd) {
    return {
      eligible: false,
      reasonCode: 'PAST_DATE',
      reasonMessage: 'Esta data já passou.',
      slotStartMs,
      nowMs,
      timeZone: tz,
    };
  }

  if (slotStartMs <= nowMs) {
    return {
      eligible: false,
      reasonCode: 'SLOT_PAST',
      reasonMessage: 'Este horário já começou ou foi encerrado.',
      slotStartMs,
      nowMs,
      timeZone: tz,
    };
  }

  const minLeadHours = Math.max(0, Number(params.minLeadTimeHours || 0));
  const minLeadMs = minLeadHours * 3600000;
  if (minLeadMs > 0 && slotStartMs < nowMs + minLeadMs) {
    return {
      eligible: false,
      reasonCode: 'LEAD_TIME_NOT_MET',
      reasonMessage: `Este horário exige antecedência mínima de ${formatLeadTimeLabel(minLeadHours)} para agendamento online.`,
      slotStartMs,
      nowMs,
      timeZone: tz,
    };
  }

  const maxAdvanceDays =
    params.maxAdvanceDays !== undefined && params.maxAdvanceDays !== null
      ? Number(params.maxAdvanceDays)
      : null;
  if (maxAdvanceDays !== null && Number.isFinite(maxAdvanceDays) && maxAdvanceDays > 0 && dateYmd) {
    const maxYmd = addDaysYmd(nowLocal.dateYmd, Math.floor(maxAdvanceDays));
    if (dateYmd > maxYmd) {
      return {
        eligible: false,
        reasonCode: 'TOO_FAR_IN_ADVANCE',
        reasonMessage: `Agendamento online disponível apenas até ${Math.floor(maxAdvanceDays)} dias de antecedência.`,
        slotStartMs,
        nowMs,
        timeZone: tz,
      };
    }
  }

  return {
    eligible: true,
    reasonCode: null,
    reasonMessage: null,
    slotStartMs,
    nowMs,
    timeZone: tz,
  };
}
