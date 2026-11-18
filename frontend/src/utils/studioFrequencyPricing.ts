// Pure pricing configuration shared in behavior with the frontend (parity tested).
export const FREQUENCY_PRICE_PERIODS = ['monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual', 'biennial'] as const;
export type FrequencyPricePeriod = typeof FREQUENCY_PRICE_PERIODS[number];
export interface FrequencyPricing {
  version: 1;
  enabled: boolean;
  unit: 'per_session' | 'per_period';
  // Amounts are integer centavos. Each financial period has its own table;
  // changing monthly -> annual never silently reinterprets a monthly total.
  tables: Partial<Record<FrequencyPricePeriod | 'per_session', Record<string, number>>>;
}
export const emptyFrequencyPricing = (): FrequencyPricing => ({ version: 1, enabled: false, unit: 'per_period', tables: {} });
export const supportsFrequencyPricing = (mode: unknown): mode is FrequencyPricePeriod =>
  (FREQUENCY_PRICE_PERIODS as readonly unknown[]).includes(mode);

export function normalizeFrequencyPricing(raw: unknown): FrequencyPricing | null {
  if (raw === null || raw === undefined) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Tabela de preços por frequência inválida.');
  const value = raw as any;
  if (value.version !== 1 || typeof value.enabled !== 'boolean' || !['per_session', 'per_period'].includes(value.unit) ||
      !value.tables || typeof value.tables !== 'object' || Array.isArray(value.tables)) throw new Error('Configuração de preços por frequência inválida.');
  const result: FrequencyPricing = { version: 1, enabled: value.enabled, unit: value.unit, tables: {} };
  for (const [period, entries] of Object.entries(value.tables)) {
    if (period !== 'per_session' && !supportsFrequencyPricing(period)) throw new Error('Periodicidade da tabela de preços inválida.');
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error('Valores por frequência inválidos.');
    const table: Record<string, number> = {};
    for (const [frequency, cents] of Object.entries(entries)) {
      if (frequency !== 'unlimited' && (!/^[1-9]\d*$/.test(frequency) || !Number.isSafeInteger(Number(frequency)))) throw new Error('Frequência semanal inválida.');
      if (typeof cents !== 'number' || !Number.isSafeInteger(cents) || cents <= 0) throw new Error('Informe preços positivos em centavos inteiros.');
      table[frequency] = cents;
    }
    result.tables[period as keyof FrequencyPricing['tables']] = table;
  }
  return result;
}

export function readFrequencyPricing(raw: unknown): FrequencyPricing | null {
  try { return normalizeFrequencyPricing(typeof raw === 'string' ? JSON.parse(raw) : raw); } catch { return null; }
}

export function frequencyPriceCents(config: FrequencyPricing | null | undefined, billingMode: unknown, weeklyCount: number | 'unlimited'): number | undefined {
  if (!config?.enabled || !supportsFrequencyPricing(billingMode)) return undefined;
  return config.tables[config.unit === 'per_session' ? 'per_session' : billingMode]?.[String(weeklyCount)];
}

export interface WeeklyMeeting {
  id?: string;
  weekday: number;
  startTime: string;
  endTime: string;
  professionalId: string;
  effectiveStartDate?: string;
  effectiveEndDate?: string | null;
}

// One draft can contain several weekdays. Several times on one day are separate
// meetings; duplicated rows for the same instructor/time are not extra classes.
export function offeredWeeklyMeetings(rows: any[], onDate?: string): WeeklyMeeting[] {
  const today = onDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const meetings = new Map<string, WeeklyMeeting>();
  for (const row of rows || []) {
    if (row.active !== undefined && !Number(row.active)) continue;
    if (row.professional_active !== undefined && !Number(row.professional_active)) continue;
    const start = row.effective_start_date || row.effectiveStartDate;
    const end = row.effective_end_date || row.effectiveEndDate;
    if ((end && end < today) || (onDate && start && start > onDate)) continue;
    const days = row.weekdays || [row.day_of_week ?? row.dayOfWeek ?? row.weekday];
    for (const day of new Set<number>(days.map(Number))) {
      const startTime = String(row.start_time || row.startTime || '').slice(0, 5);
      const endTime = String(row.end_time || row.endTime || '').slice(0, 5);
      if (!Number.isInteger(day) || day < 0 || day > 6 || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) continue;
      const professionalId = String(row.professional_id || row.professionalId || '');
      meetings.set(`${day}|${startTime}|${endTime}|${professionalId}`, {
        id: row.id, weekday: day, startTime, endTime, professionalId, effectiveStartDate: start, effectiveEndDate: end
      });
    }
  }
  return Array.from(meetings.values());
}

export function countMeetingOccurrences(meetings: WeeklyMeeting[], start: string, end: string): number {
  let count = 0;
  const date = new Date(`${start.slice(0, 10)}T12:00:00Z`);
  while (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) <= end.slice(0, 10)) {
    const day = date.toISOString().slice(0, 10);
    count += meetings.filter(m => m.weekday === date.getUTCDay() && (!m.effectiveStartDate || m.effectiveStartDate <= day) && (!m.effectiveEndDate || m.effectiveEndDate >= day)).length;
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return count;
}
