import { PlanDurationCode, PLAN_DURATION_MONTHS } from './establishment-context';

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

// ============================================================================
// MATRIZ COMERCIAL COMPLETA DE PREÇOS (Seção 7)
// ============================================================================

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
  frequencyCount: number | null; // ex: 1, 2, 3x/sem ou 12x/mês; null para acesso livre
  contractDurationCode: PlanDurationCode; // '1_month' | '2_months' | '3_months' | '6_months' | '12_months' | '24_months' | 'custom_date' | 'count'
  paymentPeriodicity: PaymentPeriodicityCode;
  participantsCount: number; // 1 = individual, 2 = dupla, etc.
  commercialUnit: CommercialPriceUnit;
  amountCents: number; // centavos inteiros positivos
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

/**
 * Calcula valores exatos da opção comercial sem nunca confundir:
 * - Valor total do contrato vs Valor mensal vs Valor por ciclo vs Valor de parcela vs Valor por aula.
 */
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
      // Cada contrato individual de um participante (ex.: Dupla) guarda o valor daquele aluno,
      // enquanto o valor por participante é explícito.
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

// ============================================================================
// VALORES DIFERENCIADOS POR HORÁRIO / CONDIÇÃO (Seção 7)
// ============================================================================

export interface StudioPriceAdjustmentRule {
  id: string;
  label: string;
  adjustmentType: 'surcharge' | 'discount';
  valueType: 'fixed' | 'percentage';
  amount: number; // em R$ quando fixed, ou % quando percentage
  incidence: 'per_student' | 'per_session';
  weekdays?: number[]; // 0..6
  startTime?: string | null; // HH:MM
  endTime?: string | null;   // HH:MM
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

    // Se a incidência é por sessão compartilhada e há mais de 1 participante dividindo a sessão,
    // ou quando o cálculo já é para o aluno:
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

// ============================================================================
// COMPLEMENTOS OPCIONAIS DOS PLANOS DO ACADEMIA & STUDIO
// ============================================================================

export type AddonScheduleTiming = 'during_purchase' | 'after_confirmation' | 'not_applicable';
export type AddonComboDiscountType = 'none' | 'fixed_cents' | 'percentage';
export type AddonBillingPeriodicity =
  | 'monthly'
  | 'per_cycle'
  | 'one_time'
  | 'bimonthly'
  | 'quarterly'
  | 'semiannual'
  | 'annual';
export type AddonDurationMode =
  | 'match_base'
  | '1_month'
  | '2_months'
  | '3_months'
  | '6_months'
  | '12_months'
  | '24_months';

export interface StudioOptionalAddonOption {
  id: string;
  addonServiceId: string;
  addonServiceName?: string | null;
  addonServiceType?: StudioServiceType | null;
  label: string;
  description?: string | null;
  active: boolean;
  /** Lista vazia = válido para qualquer plano-base ativo do serviço; preenchida = restrito aos IDs de commercialPriceOptions listados. */
  acceptedBaseOptionIds: string[];
  frequencyType: CommercialFrequencyType;
  frequencyCount: number | null;
  creditsPerCycle: number | null;
  additionalPriceCents: number;
  comboDiscountType: AddonComboDiscountType;
  comboDiscountValue: number;
  billingPeriodicity: AddonBillingPeriodicity;
  durationMode: AddonDurationMode;
  /** null = segue autoRenew do plano-base; boolean = regra própria */
  autoRenew: boolean | null;
  scheduleTiming: AddonScheduleTiming;
  displayOrder: number;
  /** Preenchido dinamicamente nas consultas públicas/administrativas ao validar o serviço vinculado. */
  availabilityStatus?: 'available' | 'needs_professional' | 'needs_schedule' | 'inactive_service';
  availabilityMessage?: string | null;
}

export interface StudioOptionalAddonsConfig {
  enabled: boolean;
  allowMultiple: boolean;
  promptTitle: string;
  noAddonLabel: string;
  options: StudioOptionalAddonOption[];
}

export const DEFAULT_STUDIO_OPTIONAL_ADDONS_PROMPT = 'Deseja adicionar acompanhamento personalizado?';
export const DEFAULT_STUDIO_OPTIONAL_ADDONS_NONE_LABEL = 'Não adicionar';

export function getDefaultOptionalAddonsConfig(): StudioOptionalAddonsConfig {
  return {
    enabled: false,
    allowMultiple: false,
    promptTitle: DEFAULT_STUDIO_OPTIONAL_ADDONS_PROMPT,
    noAddonLabel: DEFAULT_STUDIO_OPTIONAL_ADDONS_NONE_LABEL,
    options: []
  };
}

export const ADDON_BILLING_PERIODICITY_LABELS: Record<AddonBillingPeriodicity, string> = {
  monthly: 'Mensal',
  per_cycle: 'Por ciclo do plano-base',
  one_time: 'Pagamento único',
  bimonthly: 'Bimestral',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual'
};

export const ADDON_SCHEDULE_TIMING_LABELS: Record<AddonScheduleTiming, string> = {
  during_purchase: 'Escolher horários durante a contratação',
  after_confirmation: 'Agendar após aprovação/confirmação da matrícula',
  not_applicable: 'Sem necessidade de agendamento'
};

export function resolveDefaultAddonCreditsPerCycle(
  frequencyType: CommercialFrequencyType,
  frequencyCount: number | null,
  cycleMonths = 1
): number | null {
  if (frequencyType === 'unlimited') return null;
  const count = frequencyCount && frequencyCount > 0 ? frequencyCount : 1;
  if (frequencyType === 'weekly') {
    return count * 4 * Math.max(1, Math.round(cycleMonths));
  }
  if (frequencyType === 'monthly') {
    return count * Math.max(1, Math.round(cycleMonths));
  }
  return count;
}

export function normalizeOptionalAddonsConfig(raw: any): StudioOptionalAddonsConfig {
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      obj = null;
    }
  }
  if (!obj || typeof obj !== 'object') {
    return getDefaultOptionalAddonsConfig();
  }

  const promptTitle = String(obj.promptTitle || '').trim() || DEFAULT_STUDIO_OPTIONAL_ADDONS_PROMPT;
  const noAddonLabel = String(obj.noAddonLabel || '').trim() || DEFAULT_STUDIO_OPTIONAL_ADDONS_NONE_LABEL;
  const rawOptions = Array.isArray(obj.options) ? obj.options : [];
  const seenIds = new Set<string>();
  const options: StudioOptionalAddonOption[] = [];

  for (let i = 0; i < rawOptions.length; i++) {
    const item = rawOptions[i];
    if (!item || typeof item !== 'object') continue;

    let id = String(item.id || `addon-${i + 1}`).trim() || `addon-${i + 1}`;
    while (seenIds.has(id)) {
      id = `${id}-${i + 1}`;
    }
    seenIds.add(id);

    const addonServiceId = String(item.addonServiceId || '').trim();
    const label = String(item.label || item.addonServiceName || '').trim() || `Complemento ${i + 1}`;

    const frequencyType: CommercialFrequencyType =
      item.frequencyType && ['weekly', 'monthly', 'unlimited', 'fixed_count'].includes(String(item.frequencyType))
        ? (item.frequencyType as CommercialFrequencyType)
        : 'weekly';
    const rawFreqCount = Number(item.frequencyCount);
    const frequencyCount =
      frequencyType === 'unlimited'
        ? null
        : (Number.isInteger(rawFreqCount) && rawFreqCount > 0 ? Math.min(200, rawFreqCount) : 1);

    const billingPeriodicity: AddonBillingPeriodicity =
      item.billingPeriodicity && ['monthly', 'per_cycle', 'one_time', 'bimonthly', 'quarterly', 'semiannual', 'annual'].includes(String(item.billingPeriodicity))
        ? (item.billingPeriodicity as AddonBillingPeriodicity)
        : 'monthly';

    const rawCredits = item.creditsPerCycle !== undefined && item.creditsPerCycle !== null ? Number(item.creditsPerCycle) : NaN;
    const creditsPerCycle =
      frequencyType === 'unlimited'
        ? null
        : (Number.isInteger(rawCredits) && rawCredits >= 0
            ? Math.min(500, rawCredits)
            : resolveDefaultAddonCreditsPerCycle(
                frequencyType,
                frequencyCount,
                billingPeriodicity === 'per_cycle' || billingPeriodicity === 'one_time'
                  ? 1
                  : getPaymentPeriodicityCycleMonths(billingPeriodicity as PaymentPeriodicityCode)
              ));

    const additionalPriceCents = Math.max(0, Math.min(100_000_000, Math.round(Number(item.additionalPriceCents) || 0)));

    const comboDiscountType: AddonComboDiscountType =
      item.comboDiscountType && ['none', 'fixed_cents', 'percentage'].includes(String(item.comboDiscountType))
        ? (item.comboDiscountType as AddonComboDiscountType)
        : 'none';
    const rawDiscountVal = Number(item.comboDiscountValue);
    const comboDiscountValue =
      comboDiscountType === 'percentage'
        ? Math.max(0, Math.min(100, Math.round(Number.isFinite(rawDiscountVal) ? rawDiscountVal : 0)))
        : (comboDiscountType === 'fixed_cents'
            ? Math.max(0, Math.min(additionalPriceCents, Math.round(Number.isFinite(rawDiscountVal) ? rawDiscountVal : 0)))
            : 0);

    const durationMode: AddonDurationMode =
      item.durationMode && ['match_base', '1_month', '2_months', '3_months', '6_months', '12_months', '24_months'].includes(String(item.durationMode))
        ? (item.durationMode as AddonDurationMode)
        : 'match_base';

    const autoRenew: boolean | null =
      item.autoRenew === null || item.autoRenew === undefined || item.autoRenew === ''
        ? null
        : Boolean(item.autoRenew);

    const scheduleTiming: AddonScheduleTiming =
      item.scheduleTiming && ['during_purchase', 'after_confirmation', 'not_applicable'].includes(String(item.scheduleTiming))
        ? (item.scheduleTiming as AddonScheduleTiming)
        : 'after_confirmation';

    const acceptedBaseOptionIds = Array.isArray(item.acceptedBaseOptionIds)
      ? Array.from(new Set<string>(item.acceptedBaseOptionIds.map((v: any) => String(v || '').trim()).filter(Boolean)))
      : [];

    const addonServiceType =
      item.addonServiceType && ['scheduled_class', 'individual_appointment', 'facility_access', 'hybrid'].includes(String(item.addonServiceType))
        ? (item.addonServiceType as StudioServiceType)
        : null;

    options.push({
      id,
      addonServiceId,
      addonServiceName: item.addonServiceName ? String(item.addonServiceName).trim() : null,
      addonServiceType,
      label,
      description: item.description ? String(item.description).trim() : null,
      active: item.active !== false && item.active !== 0,
      acceptedBaseOptionIds,
      frequencyType,
      frequencyCount,
      creditsPerCycle,
      additionalPriceCents,
      comboDiscountType,
      comboDiscountValue,
      billingPeriodicity,
      durationMode,
      autoRenew,
      scheduleTiming,
      displayOrder: Number.isFinite(Number(item.displayOrder)) ? Number(item.displayOrder) : i,
      ...(item.availabilityStatus ? { availabilityStatus: item.availabilityStatus } : {}),
      ...(item.availabilityMessage ? { availabilityMessage: String(item.availabilityMessage) } : {})
    });
  }

  options.sort((a, b) => a.displayOrder - b.displayOrder);

  return {
    enabled: Boolean(obj.enabled),
    allowMultiple: Boolean(obj.allowMultiple),
    promptTitle,
    noAddonLabel,
    options
  };
}

export function addonAppliesToBaseOption(
  addon: StudioOptionalAddonOption,
  baseOptionId?: string | null
): boolean {
  if (!addon.active) return false;
  if (!Array.isArray(addon.acceptedBaseOptionIds) || addon.acceptedBaseOptionIds.length === 0) {
    return true;
  }
  if (!baseOptionId) return true;
  return addon.acceptedBaseOptionIds.includes(baseOptionId);
}

export interface AddonItemFinancialBreakdown {
  optionId: string;
  addonServiceId: string;
  addonServiceName: string | null;
  label: string;
  frequencyType: CommercialFrequencyType;
  frequencyCount: number | null;
  creditsPerCycle: number | null;
  totalCreditsInDuration: number | null;
  scheduleTiming: AddonScheduleTiming;
  billingPeriodicity: AddonBillingPeriodicity;
  effectivePeriodicity: PaymentPeriodicityCode;
  effectivePeriodicityLabel: string;
  effectiveCycleMonths: number;
  durationMonths: number;
  billingCyclesCount: number;
  autoRenew: boolean;
  grossPriceCents: number;
  discountCents: number;
  netPriceCents: number;
  totalContractCents: number;
  alignedWithBaseCycle: boolean;
}

export interface RecurringScheduleGroup {
  periodicity: PaymentPeriodicityCode;
  periodicityLabel: string;
  cycleMonths: number;
  baseAmountCents: number;
  addonsAmountCents: number;
  totalCycleAmountCents: number;
  isBasePeriodicity: boolean;
  itemLabels: string[];
}

export interface OneTimeAddonChargeItem {
  optionId: string;
  label: string;
  grossCents: number;
  discountCents: number;
  netCents: number;
}

export interface PlanWithAddonsBreakdown {
  base: CommercialOptionBreakdown & { label?: string | null; autoRenew: boolean };
  addons: AddonItemFinancialBreakdown[];
  recurringSchedules: RecurringScheduleGroup[];
  oneTimeCharges: OneTimeAddonChargeItem[];
  oneTimeAddonsTotalCents: number;
  totalAddonDiscountCents: number;
  /** Preenchido apenas quando plano-base e ao menos um complemento compartilham periodicidade mensal. */
  consolidatedMonthlyCents: number | null;
  /** Total por ciclo na periodicidade do plano-base (inclui somente complementos no mesmo ciclo). */
  consolidatedBaseCycleCents: number;
  hasMixedPeriodicities: boolean;
  allDurationsAligned: boolean;
  firstChargeDueCents: number;
  totalContractAmountCents: number;
}

export function calculateAddonItemBreakdown(
  addon: StudioOptionalAddonOption,
  baseBreakdown: CommercialOptionBreakdown,
  baseAutoRenew: boolean
): AddonItemFinancialBreakdown {
  const grossPriceCents = Math.max(0, Math.round(Number(addon.additionalPriceCents) || 0));
  let discountCents = 0;
  if (addon.comboDiscountType === 'fixed_cents') {
    discountCents = Math.min(grossPriceCents, Math.max(0, Math.round(Number(addon.comboDiscountValue) || 0)));
  } else if (addon.comboDiscountType === 'percentage') {
    const pct = Math.max(0, Math.min(100, Number(addon.comboDiscountValue) || 0));
    discountCents = Math.min(grossPriceCents, Math.round((grossPriceCents * pct) / 100));
  }
  const netPriceCents = Math.max(0, grossPriceCents - discountCents);

  const durationMonths =
    addon.durationMode === 'match_base'
      ? Math.max(1, baseBreakdown.contractMonths)
      : Math.max(1, PLAN_DURATION_MONTHS[addon.durationMode] || baseBreakdown.contractMonths);

  let effectivePeriodicity: PaymentPeriodicityCode;
  if (addon.billingPeriodicity === 'per_cycle') {
    effectivePeriodicity =
      baseBreakdown.paymentPeriodicity === 'installments'
        ? 'installments'
        : baseBreakdown.paymentPeriodicity === 'one_time'
          ? 'one_time'
          : baseBreakdown.paymentPeriodicity;
  } else if (addon.billingPeriodicity === 'one_time') {
    effectivePeriodicity = 'one_time';
  } else {
    effectivePeriodicity = addon.billingPeriodicity as PaymentPeriodicityCode;
  }

  const effectiveCycleMonths =
    addon.billingPeriodicity === 'per_cycle'
      ? Math.max(1, baseBreakdown.paymentCycleMonths)
      : effectivePeriodicity === 'one_time'
        ? durationMonths
        : getPaymentPeriodicityCycleMonths(effectivePeriodicity);

  const billingCyclesCount =
    effectivePeriodicity === 'one_time' || effectivePeriodicity === 'installments'
      ? 1
      : Math.max(1, Math.round(durationMonths / effectiveCycleMonths));

  const totalContractCents =
    effectivePeriodicity === 'one_time' || effectivePeriodicity === 'installments'
      ? netPriceCents
      : netPriceCents * billingCyclesCount;

  const baseIsRecurringCycle =
    baseBreakdown.paymentPeriodicity !== 'one_time' &&
    baseBreakdown.paymentPeriodicity !== 'installments';
  const alignedWithBaseCycle =
    baseIsRecurringCycle && effectivePeriodicity === baseBreakdown.paymentPeriodicity;

  const resolvedCreditsPerCycle =
    addon.frequencyType === 'unlimited'
      ? null
      : (addon.creditsPerCycle !== null && addon.creditsPerCycle !== undefined && addon.creditsPerCycle >= 0
          ? addon.creditsPerCycle
          : resolveDefaultAddonCreditsPerCycle(
              addon.frequencyType,
              addon.frequencyCount,
              effectivePeriodicity === 'one_time' ? durationMonths : effectiveCycleMonths
            ));

  const totalCreditsInDuration =
    resolvedCreditsPerCycle === null
      ? null
      : addon.frequencyType === 'fixed_count'
        ? resolvedCreditsPerCycle
        : resolvedCreditsPerCycle * billingCyclesCount;

  return {
    optionId: addon.id,
    addonServiceId: addon.addonServiceId,
    addonServiceName: addon.addonServiceName || addon.label,
    label: addon.label,
    frequencyType: addon.frequencyType,
    frequencyCount: addon.frequencyCount,
    creditsPerCycle: resolvedCreditsPerCycle,
    totalCreditsInDuration,
    scheduleTiming: addon.scheduleTiming,
    billingPeriodicity: addon.billingPeriodicity,
    effectivePeriodicity,
    effectivePeriodicityLabel: PAYMENT_PERIODICITY_LABELS[effectivePeriodicity] || effectivePeriodicity,
    effectiveCycleMonths,
    durationMonths,
    billingCyclesCount,
    autoRenew: addon.autoRenew !== null && addon.autoRenew !== undefined ? Boolean(addon.autoRenew) : Boolean(baseAutoRenew),
    grossPriceCents,
    discountCents,
    netPriceCents,
    totalContractCents,
    alignedWithBaseCycle
  };
}

export function calculatePlanWithAddonsBreakdown(params: {
  baseOption: StudioCommercialPriceOption;
  selectedAddons: StudioOptionalAddonOption[];
  participantsCount?: number;
}): PlanWithAddonsBreakdown {
  const baseBreakdown = calculateCommercialOptionBreakdown(params.baseOption, {
    participantsCount: params.participantsCount
  });
  const baseAutoRenew = Boolean(params.baseOption.autoRenew);

  const addons = (params.selectedAddons || [])
    .filter((a) => a && a.active && Boolean(a.addonServiceId))
    .map((addon) => calculateAddonItemBreakdown(addon, baseBreakdown, baseAutoRenew));

  const recurringMap = new Map<PaymentPeriodicityCode, RecurringScheduleGroup>();
  const baseIsRecurring =
    baseBreakdown.paymentPeriodicity !== 'one_time' &&
    baseBreakdown.paymentPeriodicity !== 'installments';

  if (baseIsRecurring) {
    recurringMap.set(baseBreakdown.paymentPeriodicity, {
      periodicity: baseBreakdown.paymentPeriodicity,
      periodicityLabel: PAYMENT_PERIODICITY_LABELS[baseBreakdown.paymentPeriodicity],
      cycleMonths: baseBreakdown.paymentCycleMonths,
      baseAmountCents: baseBreakdown.cycleAmountCents,
      addonsAmountCents: 0,
      totalCycleAmountCents: baseBreakdown.cycleAmountCents,
      isBasePeriodicity: true,
      itemLabels: [params.baseOption.label || 'Plano-base']
    });
  }

  const oneTimeCharges: OneTimeAddonChargeItem[] = [];
  let oneTimeAddonsTotalCents = 0;
  let totalAddonDiscountCents = 0;
  let addonsTotalContractCents = 0;

  for (const addon of addons) {
    totalAddonDiscountCents += addon.discountCents * addon.billingCyclesCount;
    addonsTotalContractCents += addon.totalContractCents;

    if (addon.effectivePeriodicity === 'one_time' || addon.effectivePeriodicity === 'installments') {
      oneTimeCharges.push({
        optionId: addon.optionId,
        label: addon.label,
        grossCents: addon.grossPriceCents,
        discountCents: addon.discountCents,
        netCents: addon.netPriceCents
      });
      oneTimeAddonsTotalCents += addon.netPriceCents;
      continue;
    }

    const existing = recurringMap.get(addon.effectivePeriodicity);
    if (existing) {
      existing.addonsAmountCents += addon.netPriceCents;
      existing.totalCycleAmountCents += addon.netPriceCents;
      existing.itemLabels.push(addon.label);
    } else {
      recurringMap.set(addon.effectivePeriodicity, {
        periodicity: addon.effectivePeriodicity,
        periodicityLabel: addon.effectivePeriodicityLabel,
        cycleMonths: addon.effectiveCycleMonths,
        baseAmountCents: 0,
        addonsAmountCents: addon.netPriceCents,
        totalCycleAmountCents: addon.netPriceCents,
        isBasePeriodicity: false,
        itemLabels: [addon.label]
      });
    }
  }

  const recurringSchedules = Array.from(recurringMap.values());
  const baseSchedule = baseIsRecurring ? recurringMap.get(baseBreakdown.paymentPeriodicity) : undefined;
  const consolidatedBaseCycleCents = baseSchedule
    ? baseSchedule.totalCycleAmountCents
    : baseBreakdown.cycleAmountCents;

  const monthlySchedule = recurringMap.get('monthly');
  const consolidatedMonthlyCents =
    baseBreakdown.paymentPeriodicity === 'monthly' && monthlySchedule && addons.some((a) => a.effectivePeriodicity === 'monthly')
      ? monthlySchedule.totalCycleAmountCents
      : null;

  const hasMixedPeriodicities =
    recurringSchedules.length > 1 ||
    (baseIsRecurring && oneTimeCharges.length > 0) ||
    (!baseIsRecurring && recurringSchedules.length > 0);

  const allDurationsAligned = addons.every((a) => a.durationMonths === baseBreakdown.contractMonths);

  const baseFirstChargeCents =
    baseBreakdown.paymentPeriodicity === 'installments'
      ? baseBreakdown.installmentAmountCents
      : baseBreakdown.cycleAmountCents;
  const addonsFirstChargeCents = addons.reduce((acc, a) => acc + a.netPriceCents, 0);
  const firstChargeDueCents = baseFirstChargeCents + addonsFirstChargeCents;
  const totalContractAmountCents = baseBreakdown.totalContractAmountCents + addonsTotalContractCents;

  return {
    base: {
      ...baseBreakdown,
      label: params.baseOption.label || null,
      autoRenew: baseAutoRenew
    },
    addons,
    recurringSchedules,
    oneTimeCharges,
    oneTimeAddonsTotalCents,
    totalAddonDiscountCents,
    consolidatedMonthlyCents,
    consolidatedBaseCycleCents,
    hasMixedPeriodicities,
    allDurationsAligned,
    firstChargeDueCents,
    totalContractAmountCents
  };
}

export function buildFallbackBaseCommercialOption(srv: {
  id?: string;
  name?: string;
  billing_mode?: string | null;
  billingMode?: string | null;
  periodic_price?: number | null;
  periodicPrice?: number | null;
  price?: number | null;
  weekly_sessions_count?: number | null;
  weeklySessionsCount?: number | null;
  studio_service_type?: string | null;
  studioServiceType?: string | null;
  billing_cycle_months?: number | null;
  billingCycleMonths?: number | null;
  default_plan_duration?: string | null;
}): StudioCommercialPriceOption {
  const billingMode = String(srv.billing_mode ?? srv.billingMode ?? 'per_session').toLowerCase();
  const periodicPrice = Number(srv.periodic_price ?? srv.periodicPrice ?? 0);
  const basePrice = Number(srv.price ?? 0);
  const amountReais = periodicPrice > 0 ? periodicPrice : basePrice;
  const amountCents = Math.max(0, Math.round(amountReais * 100));
  const studioType = String(srv.studio_service_type ?? srv.studioServiceType ?? 'individual');
  const periodicityMap: Record<string, PaymentPeriodicityCode> = {
    monthly: 'monthly',
    quarterly: 'quarterly',
    semiannual: 'semiannual',
    annual: 'annual'
  };
  const paymentPeriodicity: PaymentPeriodicityCode = periodicityMap[billingMode] || 'monthly';
  const durationMap: Record<PaymentPeriodicityCode, PlanDurationCode> = {
    one_time: '1_month',
    monthly: '1_month',
    bimonthly: '2_months',
    quarterly: '3_months',
    semiannual: '6_months',
    annual: '12_months',
    installments: '1_month'
  };
  const contractDurationCode: PlanDurationCode =
    srv.default_plan_duration && PLAN_DURATION_MONTHS[srv.default_plan_duration as PlanDurationCode]
      ? (srv.default_plan_duration as PlanDurationCode)
      : durationMap[paymentPeriodicity];
  const weeklyCount = Number(srv.weekly_sessions_count ?? srv.weeklySessionsCount ?? 0);
  return {
    id: 'default',
    label: srv.name ? String(srv.name) : 'Plano padrão',
    modality: 'any',
    accessType: studioType === 'facility_access' ? 'unlimited' : 'scheduled',
    frequencyType: studioType === 'facility_access' ? 'unlimited' : (weeklyCount > 0 ? 'weekly' : 'monthly'),
    frequencyCount: studioType === 'facility_access' ? null : (weeklyCount > 0 ? weeklyCount : 1),
    contractDurationCode,
    paymentPeriodicity: billingMode === 'per_session' ? 'one_time' : paymentPeriodicity,
    participantsCount: 1,
    commercialUnit: billingMode === 'per_session' ? 'contract_total' : 'per_cycle',
    amountCents,
    installmentsCount: 1,
    fidelityMonths: 0,
    gracePeriodDays: 0,
    autoRenew: billingMode !== 'per_session',
    active: true
  };
}

export interface OptionalAddonTargetSummary {
  id: string;
  name: string;
  active: boolean;
  studioServiceType: StudioServiceType;
  requiresAppointment: boolean;
  isGroup: boolean;
  hasInstructor: boolean;
  hasSchedule: boolean;
}

export function hydrateOptionalAddonsConfig(
  raw: any,
  targetsById: Map<string, OptionalAddonTargetSummary>,
  options?: { publicOnly?: boolean }
): StudioOptionalAddonsConfig {
  const cfg = normalizeOptionalAddonsConfig(raw);
  const publicOnly = Boolean(options?.publicOnly);
  const hydratedOptions: StudioOptionalAddonOption[] = [];

  for (const opt of cfg.options) {
    if (!opt.addonServiceId) continue;
    const target = targetsById.get(opt.addonServiceId);
    let availabilityStatus: StudioOptionalAddonOption['availabilityStatus'] = 'available';
    let availabilityMessage: string | null = null;
    let effectiveTiming = opt.scheduleTiming;

    if (!target || !target.active) {
      availabilityStatus = 'inactive_service';
      availabilityMessage = 'Serviço vinculado inativo ou não encontrado.';
    } else {
      if (!target.requiresAppointment) {
        effectiveTiming = 'not_applicable';
      } else if (effectiveTiming === 'not_applicable') {
        effectiveTiming = 'after_confirmation';
      }

      if (target.requiresAppointment) {
        if (target.isGroup && !target.hasSchedule) {
          availabilityStatus = 'needs_schedule';
          availabilityMessage = 'Serviço coletivo vinculado ainda sem horários/turmas ativos.';
        } else if (!target.isGroup && !target.hasInstructor) {
          availabilityStatus = 'needs_professional';
          availabilityMessage = 'Serviço vinculado sem instrutor ativo disponível.';
        }
      }
    }

    if (publicOnly) {
      if (!opt.active || availabilityStatus !== 'available') {
        continue;
      }
    }

    hydratedOptions.push({
      ...opt,
      addonServiceName: target?.name || opt.addonServiceName || opt.label,
      addonServiceType: target?.studioServiceType || opt.addonServiceType || null,
      scheduleTiming: effectiveTiming,
      availabilityStatus,
      availabilityMessage
    });
  }

  return {
    ...cfg,
    enabled: cfg.enabled && (!publicOnly || hydratedOptions.length > 0),
    options: hydratedOptions
  };
}
