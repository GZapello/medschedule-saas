import { PlanDurationCode, PLAN_DURATION_MONTHS } from './establishmentContext';

export type StudioServiceType = 'facility_access' | 'individual' | 'group' | 'non_scheduled';

export const VALID_STUDIO_SERVICE_TYPES: StudioServiceType[] = [
  'facility_access',
  'individual',
  'group',
  'non_scheduled'
];

export const STUDIO_SERVICE_TYPE_LABELS: Record<StudioServiceType, string> = {
  facility_access: 'Acesso ao Estabelecimento (Livre ou Limitado)',
  individual: 'Atendimento Individual (Hora Marcada)',
  group: 'Aula Coletiva / Turma ou Dupla',
  non_scheduled: 'Serviço Entregável (Sem Agendamento)'
};

export type StudioAccessMode = 'unlimited' | 'limited';
export type StudioAccessCountPeriod = 'weekly' | 'monthly' | 'contract_cycle';
export type StudioHolidayPolicy = 'normal' | 'block' | 'ignore_limit';
export type StudioOutOfPeriodPolicy = 'block' | 'allow_exception';

export interface StudioAccessTimeWindow {
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  weekdays?: number[]; // 0..6 optional subset
}

export interface StudioAccessConfig {
  accessMode: StudioAccessMode;
  maxEntriesPerWeek: number | null;
  maxEntriesPerMonth: number | null;
  maxEntriesPerDay: number | null;
  allowSameDayReentry: boolean;
  countPeriod: StudioAccessCountPeriod;
  weekStartDay: 0 | 1; // 0 = Domingo, 1 = Segunda-feira
  holidayPolicy: StudioHolidayPolicy;
  allowedWeekdays: number[]; // 0..6 (vazio ou 7 dias = todos os dias)
  allowedTimeWindows: StudioAccessTimeWindow[];
  maxSimultaneousCapacity: number | null;
  blockOnOverdue: boolean;
  overdueGraceDays: number;
  outOfPeriodPolicy: StudioOutOfPeriodPolicy;
}

export const DEFAULT_STUDIO_ACCESS_CONFIG: StudioAccessConfig = {
  accessMode: 'unlimited',
  maxEntriesPerWeek: null,
  maxEntriesPerMonth: null,
  maxEntriesPerDay: null,
  allowSameDayReentry: true,
  countPeriod: 'weekly',
  weekStartDay: 1,
  holidayPolicy: 'normal',
  allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
  allowedTimeWindows: [],
  maxSimultaneousCapacity: null,
  blockOnOverdue: true,
  overdueGraceDays: 0,
  outOfPeriodPolicy: 'block'
};

export function normalizeStudioServiceType(
  rawType: unknown,
  fallbackServiceKind?: unknown
): StudioServiceType {
  const t = String(rawType || '').trim().toLowerCase();
  if ((VALID_STUDIO_SERVICE_TYPES as string[]).includes(t)) {
    return t as StudioServiceType;
  }
  if (String(fallbackServiceKind || '').trim().toLowerCase() === 'group') {
    return 'group';
  }
  return 'individual';
}

export function normalizeStudioAccessConfig(raw: unknown): StudioAccessConfig {
  if (!raw) return { ...DEFAULT_STUDIO_ACCESS_CONFIG };
  let obj: any = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return { ...DEFAULT_STUDIO_ACCESS_CONFIG };
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ...DEFAULT_STUDIO_ACCESS_CONFIG };
  }

  const accessMode: StudioAccessMode = obj.accessMode === 'limited' ? 'limited' : 'unlimited';
  const maxWeek = Number(obj.maxEntriesPerWeek);
  const maxMonth = Number(obj.maxEntriesPerMonth);
  const maxDay = Number(obj.maxEntriesPerDay);
  const maxCap = Number(obj.maxSimultaneousCapacity);
  const graceDays = Number(obj.overdueGraceDays);

  const countPeriod: StudioAccessCountPeriod =
    obj.countPeriod === 'monthly' || obj.countPeriod === 'contract_cycle'
      ? obj.countPeriod
      : 'weekly';

  const weekStartDay: 0 | 1 = Number(obj.weekStartDay) === 0 ? 0 : 1;

  const holidayPolicy: StudioHolidayPolicy =
    obj.holidayPolicy === 'block' || obj.holidayPolicy === 'ignore_limit'
      ? obj.holidayPolicy
      : 'normal';

  const outOfPeriodPolicy: StudioOutOfPeriodPolicy =
    obj.outOfPeriodPolicy === 'allow_exception' ? 'allow_exception' : 'block';

  const allowedWeekdays: number[] = Array.isArray(obj.allowedWeekdays)
    ? Array.from(
        new Set<number>(
          obj.allowedWeekdays
            .map((d: any) => Number(d))
            .filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6)
        )
      ).sort((a: number, b: number) => a - b)
    : [0, 1, 2, 3, 4, 5, 6];

  const allowedTimeWindows: StudioAccessTimeWindow[] = [];
  if (Array.isArray(obj.allowedTimeWindows)) {
    for (const w of obj.allowedTimeWindows) {
      if (!w || typeof w !== 'object') continue;
      const startTime = String(w.startTime || '').trim().slice(0, 5);
      const endTime = String(w.endTime || '').trim().slice(0, 5);
      if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) continue;
      if (startTime >= endTime) continue;
      const wDays: number[] | undefined = Array.isArray(w.weekdays)
        ? Array.from(
            new Set<number>(
              w.weekdays
                .map((d: any) => Number(d))
                .filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6)
            )
          ).sort((a: number, b: number) => a - b)
        : undefined;
      allowedTimeWindows.push({
        startTime,
        endTime,
        ...(wDays && wDays.length > 0 ? { weekdays: wDays } : {})
      });
    }
  }

  return {
    accessMode,
    maxEntriesPerWeek: accessMode === 'limited' && Number.isInteger(maxWeek) && maxWeek > 0 ? Math.min(50, maxWeek) : null,
    maxEntriesPerMonth: accessMode === 'limited' && Number.isInteger(maxMonth) && maxMonth > 0 ? Math.min(200, maxMonth) : null,
    maxEntriesPerDay: Number.isInteger(maxDay) && maxDay > 0 ? Math.min(10, maxDay) : null,
    allowSameDayReentry: obj.allowSameDayReentry !== undefined ? Boolean(obj.allowSameDayReentry) : true,
    countPeriod,
    weekStartDay,
    holidayPolicy,
    allowedWeekdays: allowedWeekdays.length > 0 ? allowedWeekdays : [0, 1, 2, 3, 4, 5, 6],
    allowedTimeWindows,
    maxSimultaneousCapacity: Number.isInteger(maxCap) && maxCap > 0 ? Math.min(5000, maxCap) : null,
    blockOnOverdue: obj.blockOnOverdue !== undefined ? Boolean(obj.blockOnOverdue) : true,
    overdueGraceDays: Number.isInteger(graceDays) && graceDays >= 0 ? Math.min(90, graceDays) : 0,
    outOfPeriodPolicy
  };
}

export type CommercialPriceUnit =
  | 'per_session'
  | 'per_month'
  | 'per_cycle'
  | 'contract_total'
  | 'per_participant';

export type PaymentPeriodicityCode =
  | 'one_time'
  | 'monthly'
  | 'bimonthly'
  | 'quarterly'
  | 'semiannual'
  | 'annual'
  | 'installments';

export type CommercialFrequencyType = 'weekly' | 'monthly' | 'unlimited' | 'fixed_count';

export interface StudioCommercialPriceOption {
  id: string;
  label?: string | null;
  modality?: 'any' | 'presential' | 'online' | 'home';
  accessType: 'scheduled' | 'unlimited' | 'limited';
  frequencyType: CommercialFrequencyType;
  frequencyCount: number | null;
  contractDurationCode: PlanDurationCode;
  paymentPeriodicity: PaymentPeriodicityCode;
  participantsCount: number;
  commercialUnit: CommercialPriceUnit;
  amountCents: number;
  installmentsCount: number;
  fidelityMonths: number;
  gracePeriodDays: number;
  autoRenew: boolean;
  active: boolean;
}

export interface CommercialOptionBreakdown {
  optionId: string;
  commercialUnit: CommercialPriceUnit;
  contractDurationCode: PlanDurationCode;
  contractMonths: number;
  paymentPeriodicity: PaymentPeriodicityCode;
  paymentCycleMonths: number;
  billingCyclesCount: number;
  installmentsCount: number;
  participantsCount: number;
  unitAmountCents: number;
  unitAmountReais: number;
  cycleAmountCents: number;
  cycleAmountReais: number;
  installmentAmountCents: number;
  installmentAmountReais: number;
  totalContractAmountCents: number;
  totalContractAmountReais: number;
  perParticipantAmountCents: number;
  perParticipantAmountReais: number;
}

export const COMMERCIAL_UNIT_LABELS: Record<CommercialPriceUnit, string> = {
  per_session: 'Valor por aula / sessão',
  per_month: 'Valor mensal',
  per_cycle: 'Valor por ciclo de cobrança',
  contract_total: 'Valor total do contrato',
  per_participant: 'Valor por participante'
};

export const PAYMENT_PERIODICITY_LABELS: Record<PaymentPeriodicityCode, string> = {
  one_time: 'Pagamento integral (à vista)',
  monthly: 'Cobrança mensal',
  bimonthly: 'Cobrança bimestral',
  quarterly: 'Cobrança trimestral',
  semiannual: 'Cobrança semestral',
  annual: 'Cobrança anual',
  installments: 'Parcelado'
};

export function getPaymentPeriodicityCycleMonths(periodicity: PaymentPeriodicityCode): number {
  switch (periodicity) {
    case 'monthly':
      return 1;
    case 'bimonthly':
      return 2;
    case 'quarterly':
      return 3;
    case 'semiannual':
      return 6;
    case 'annual':
      return 12;
    default:
      return 1;
  }
}

export function normalizeCommercialPriceOptions(raw: unknown): StudioCommercialPriceOption[] {
  if (!raw) return [];
  let list: any[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      return [];
    }
  }

  const out: StudioCommercialPriceOption[] = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || typeof item !== 'object') continue;
    const amountCents = Math.round(
      item.amountCents !== undefined
        ? Number(item.amountCents)
        : Number(item.amount || 0) * 100
    );
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) continue;

    const accessType: 'scheduled' | 'unlimited' | 'limited' =
      item.accessType === 'unlimited' || item.accessType === 'limited'
        ? item.accessType
        : 'scheduled';

    const frequencyType: CommercialFrequencyType =
      item.frequencyType === 'monthly' || item.frequencyType === 'unlimited' || item.frequencyType === 'fixed_count'
        ? item.frequencyType
        : (accessType === 'unlimited' ? 'unlimited' : 'weekly');

    const freqNum = Number(item.frequencyCount);
    const frequencyCount =
      frequencyType === 'unlimited'
        ? null
        : (Number.isInteger(freqNum) && freqNum > 0 ? Math.min(200, freqNum) : 1);

    const contractDurationCode: PlanDurationCode =
      item.contractDurationCode && ['1_month', '2_months', '3_months', '6_months', '12_months', '24_months', 'custom_date', 'count'].includes(String(item.contractDurationCode))
        ? (item.contractDurationCode as PlanDurationCode)
        : '1_month';

    const paymentPeriodicity: PaymentPeriodicityCode =
      item.paymentPeriodicity && ['one_time', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual', 'installments'].includes(String(item.paymentPeriodicity))
        ? (item.paymentPeriodicity as PaymentPeriodicityCode)
        : 'monthly';

    const commercialUnit: CommercialPriceUnit =
      item.commercialUnit && ['per_session', 'per_month', 'per_cycle', 'contract_total', 'per_participant'].includes(String(item.commercialUnit))
        ? (item.commercialUnit as CommercialPriceUnit)
        : 'per_month';

    const participantsCount = Math.max(1, Math.min(500, Math.floor(Number(item.participantsCount) || 1)));
    const installmentsCount = Math.max(1, Math.min(36, Math.floor(Number(item.installmentsCount) || 1)));
    const fidelityMonths = Math.max(0, Math.min(36, Math.floor(Number(item.fidelityMonths) || 0)));
    const gracePeriodDays = Math.max(0, Math.min(90, Math.floor(Number(item.gracePeriodDays) || 0)));

    out.push({
      id: String(item.id || `opt-${i + 1}`),
      label: item.label ? String(item.label).trim() : null,
      modality: item.modality && ['presential', 'online', 'home'].includes(item.modality) ? item.modality : 'any',
      accessType,
      frequencyType,
      frequencyCount,
      contractDurationCode,
      paymentPeriodicity,
      participantsCount,
      commercialUnit,
      amountCents,
      installmentsCount,
      fidelityMonths,
      gracePeriodDays,
      autoRenew: Boolean(item.autoRenew),
      active: item.active !== false && item.active !== 0
    });
  }

  return out;
}

export function calculateCommercialOptionBreakdown(
  option: StudioCommercialPriceOption,
  context?: {
    participantsCount?: number;
    sessionsInContract?: number;
    sessionsPerMonth?: number;
  }
): CommercialOptionBreakdown {
  const contractMonths = PLAN_DURATION_MONTHS[option.contractDurationCode] || 1;
  const paymentCycleMonths = getPaymentPeriodicityCycleMonths(option.paymentPeriodicity);
  const billingCyclesCount =
    option.paymentPeriodicity === 'one_time' || option.paymentPeriodicity === 'installments'
      ? 1
      : Math.max(1, Math.round(contractMonths / paymentCycleMonths));
  const installmentsCount =
    option.paymentPeriodicity === 'installments'
      ? Math.max(1, option.installmentsCount || contractMonths)
      : (option.paymentPeriodicity === 'one_time' ? 1 : billingCyclesCount);

  const effParticipants = Math.max(1, Math.floor(Number(context?.participantsCount || option.participantsCount || 1)));
  const defaultSessionsPerMonth = option.frequencyType === 'weekly' && option.frequencyCount
    ? option.frequencyCount * 4
    : (option.frequencyType === 'monthly' && option.frequencyCount ? option.frequencyCount : 1);
  const sessionsPerMonth = Math.max(1, Math.floor(Number(context?.sessionsPerMonth || defaultSessionsPerMonth)));
  const configuredSessions = option.frequencyType === 'fixed_count' ? option.frequencyCount : null;
  const sessionsInContract = Math.max(1, Math.floor(Number(context?.sessionsInContract || configuredSessions || (sessionsPerMonth * contractMonths))));

  let totalContractAmountCents = option.amountCents;
  let cycleAmountCents = option.amountCents;
  let perParticipantAmountCents = option.amountCents;

  switch (option.commercialUnit) {
    case 'contract_total': {
      totalContractAmountCents = option.amountCents;
      cycleAmountCents = Math.round(totalContractAmountCents / Math.max(1, billingCyclesCount));
      perParticipantAmountCents = Math.round(totalContractAmountCents / effParticipants);
      break;
    }
    case 'per_month': {
      totalContractAmountCents = option.amountCents * contractMonths;
      cycleAmountCents =
        option.paymentPeriodicity === 'one_time' || option.paymentPeriodicity === 'installments'
          ? totalContractAmountCents
          : option.amountCents * paymentCycleMonths;
      perParticipantAmountCents = option.amountCents;
      break;
    }
    case 'per_cycle': {
      cycleAmountCents = option.amountCents;
      totalContractAmountCents = cycleAmountCents * billingCyclesCount;
      perParticipantAmountCents = cycleAmountCents;
      break;
    }
    case 'per_session': {
      totalContractAmountCents = option.amountCents * sessionsInContract;
      cycleAmountCents = Math.round(totalContractAmountCents / Math.max(1, billingCyclesCount));
      perParticipantAmountCents = totalContractAmountCents;
      break;
    }
    case 'per_participant': {
      perParticipantAmountCents = option.amountCents;
      cycleAmountCents = option.amountCents;
      totalContractAmountCents = option.amountCents * billingCyclesCount;
      break;
    }
  }

  const installmentAmountCents =
    option.paymentPeriodicity === 'installments'
      ? Math.round(totalContractAmountCents / Math.max(1, installmentsCount))
      : cycleAmountCents;

  return {
    optionId: option.id,
    commercialUnit: option.commercialUnit,
    contractDurationCode: option.contractDurationCode,
    contractMonths,
    paymentPeriodicity: option.paymentPeriodicity,
    paymentCycleMonths,
    billingCyclesCount,
    installmentsCount,
    participantsCount: effParticipants,
    unitAmountCents: option.amountCents,
    unitAmountReais: Math.round(option.amountCents) / 100,
    cycleAmountCents,
    cycleAmountReais: Math.round(cycleAmountCents) / 100,
    installmentAmountCents,
    installmentAmountReais: Math.round(installmentAmountCents) / 100,
    totalContractAmountCents,
    totalContractAmountReais: Math.round(totalContractAmountCents) / 100,
    perParticipantAmountCents,
    perParticipantAmountReais: Math.round(perParticipantAmountCents) / 100
  };
}

export interface StudioPriceAdjustmentRule {
  id: string;
  label: string;
  adjustmentType: 'surcharge' | 'discount';
  valueType: 'fixed' | 'percentage';
  amount: number;
  incidence: 'per_student' | 'per_session';
  weekdays?: number[];
  startTime?: string | null;
  endTime?: string | null;
  modality?: 'presential' | 'online' | 'home' | null;
  professionalId?: string | null;
  sessionType?: 'individual' | 'duo' | 'group' | null;
  active: boolean;
}

export function normalizeStudioPriceAdjustments(raw: unknown): StudioPriceAdjustmentRule[] {
  if (!raw) return [];
  let list: any[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      return [];
    }
  }

  const out: StudioPriceAdjustmentRule[] = [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (!r || typeof r !== 'object') continue;
    const amount = Math.round(Number(r.amount || 0) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const weekdays: number[] | undefined = Array.isArray(r.weekdays)
      ? Array.from(
          new Set<number>(
            r.weekdays
              .map((d: any) => Number(d))
              .filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6)
          )
        ).sort((a: number, b: number) => a - b)
      : undefined;

    const startTime = r.startTime && /^\d{2}:\d{2}/.test(String(r.startTime).trim())
      ? String(r.startTime).trim().slice(0, 5)
      : null;
    const endTime = r.endTime && /^\d{2}:\d{2}/.test(String(r.endTime).trim())
      ? String(r.endTime).trim().slice(0, 5)
      : null;

    out.push({
      id: String(r.id || `adj-${i + 1}`),
      label: String(r.label || (r.adjustmentType === 'discount' ? 'Desconto de horário' : 'Adicional de horário')).trim(),
      adjustmentType: r.adjustmentType === 'discount' ? 'discount' : 'surcharge',
      valueType: r.valueType === 'percentage' ? 'percentage' : 'fixed',
      amount,
      incidence: r.incidence === 'per_session' ? 'per_session' : 'per_student',
      ...(weekdays && weekdays.length > 0 ? { weekdays } : {}),
      startTime,
      endTime,
      modality: r.modality && ['presential', 'online', 'home'].includes(r.modality) ? r.modality : null,
      professionalId: r.professionalId ? String(r.professionalId).trim() : null,
      sessionType: r.sessionType && ['individual', 'duo', 'group'].includes(r.sessionType) ? r.sessionType : null,
      active: r.active !== false && r.active !== 0
    });
  }
  return out;
}

export function evaluateStudioPriceAdjustments(params: {
  basePrice: number;
  rules: StudioPriceAdjustmentRule[] | null | undefined;
  weekday?: number | null;
  timeHhmm?: string | null;
  modality?: string | null;
  professionalId?: string | null;
  sessionType?: 'individual' | 'duo' | 'group' | null;
  participantsCount?: number;
}): {
  basePrice: number;
  netAdjustment: number;
  finalPrice: number;
  appliedRules: Array<{
    id: string;
    label: string;
    adjustmentType: 'surcharge' | 'discount';
    incidence: 'per_student' | 'per_session';
    appliedAmount: number;
  }>;
} {
  const basePrice = Math.max(0, Math.round(Number(params.basePrice || 0) * 100) / 100);
  const rules = Array.isArray(params.rules) ? params.rules.filter(r => r && r.active) : [];
  if (rules.length === 0) {
    return { basePrice, netAdjustment: 0, finalPrice: basePrice, appliedRules: [] };
  }

  const timeClock = params.timeHhmm ? String(params.timeHhmm).slice(0, 5) : null;
  const participants = Math.max(1, Math.floor(Number(params.participantsCount || 1)));
  let netAdjustment = 0;
  const appliedRules: Array<{
    id: string;
    label: string;
    adjustmentType: 'surcharge' | 'discount';
    incidence: 'per_student' | 'per_session';
    appliedAmount: number;
  }> = [];

  for (const rule of rules) {
    if (Array.isArray(rule.weekdays) && rule.weekdays.length > 0) {
      if (params.weekday === undefined || params.weekday === null || !rule.weekdays.includes(Number(params.weekday))) {
        continue;
      }
    }
    if (rule.startTime && rule.endTime) {
      if (!timeClock || timeClock < rule.startTime || timeClock >= rule.endTime) {
        continue;
      }
    } else if (rule.startTime) {
      if (!timeClock || timeClock < rule.startTime) continue;
    } else if (rule.endTime) {
      if (!timeClock || timeClock >= rule.endTime) continue;
    }
    if (rule.modality && params.modality && rule.modality !== params.modality) {
      continue;
    }
    if (rule.professionalId && params.professionalId && rule.professionalId !== params.professionalId) {
      continue;
    }
    if (rule.sessionType && params.sessionType && rule.sessionType !== params.sessionType) {
      continue;
    }

    let rawDelta =
      rule.valueType === 'percentage'
        ? Math.round(basePrice * (rule.amount / 100) * 100) / 100
        : rule.amount;

    if (rule.incidence === 'per_session' && participants > 1) {
      rawDelta = Math.round((rawDelta / participants) * 100) / 100;
    }

    const signedDelta = rule.adjustmentType === 'discount' ? -rawDelta : rawDelta;
    netAdjustment = Math.round((netAdjustment + signedDelta) * 100) / 100;
    appliedRules.push({
      id: rule.id,
      label: rule.label,
      adjustmentType: rule.adjustmentType,
      incidence: rule.incidence,
      appliedAmount: signedDelta
    });
  }

  const finalPrice = Math.max(0, Math.round((basePrice + netAdjustment) * 100) / 100);
  return {
    basePrice,
    netAdjustment,
    finalPrice,
    appliedRules
  };
}
