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
  fallbackServiceKind?: unknown,
  requiresAppointment?: unknown
): StudioServiceType {
  const t = String(rawType || '').trim().toLowerCase();
  if ((VALID_STUDIO_SERVICE_TYPES as string[]).includes(t)) {
    return t as StudioServiceType;
  }
  if (requiresAppointment === 0 || requiresAppointment === false) {
    return 'facility_access';
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

export type PlanCreditMode = 'fixed_credits' | 'weekly_guaranteed' | 'unlimited';

export const PLAN_CREDIT_MODE_LABELS: Record<PlanCreditMode, string> = {
  fixed_credits: 'Créditos fixos por ciclo',
  weekly_guaranteed: 'Frequência semanal garantida',
  unlimited: 'Acesso livre / ilimitado'
};

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
  creditMode?: PlanCreditMode | null;
  creditsPerCycle?: number | null;
  allowPublicBooking?: boolean;
  /** Controle explícito por opção comercial: true = permite complementos vinculados; false = bloqueia complementos neste plano; undefined = legado. */
  allowOptionalAddons?: boolean;
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
  monthlyEquivalentCents: number;
  monthlyEquivalentReais: number;
  totalContractAmountCents: number;
  totalContractAmountReais: number;
  perParticipantAmountCents: number;
  perParticipantAmountReais: number;
  creditMode: PlanCreditMode;
  creditsPerCycle: number | null;
  totalContractCredits: number | null;
  weeklyCap: number | null;
  estimatedSessionsInContract: number | null;
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

export function normalizeCommercialPriceOptions(
  raw: unknown,
  opts?: { studioServiceType?: StudioServiceType | string | null; requiresAppointment?: boolean | number | null }
): StudioCommercialPriceOption[] {
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

  const stType = String(opts?.studioServiceType || '').trim().toLowerCase();
  const isNonScheduledService =
    stType === 'facility_access' ||
    stType === 'non_scheduled' ||
    opts?.requiresAppointment === 0 ||
    opts?.requiresAppointment === false;

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

    const rawFreqType = String(item.frequencyType || '').trim();
    const rawLabelNorm = String(item.label || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const labelIndicatesUnlimitedAccess =
      (rawLabelNorm.includes('acesso livre') || rawLabelNorm.includes('uso livre') || rawLabelNorm.includes('livre')) &&
      !rawLabelNorm.includes('horario marcado') &&
      !rawLabelNorm.includes('agendad');

    let accessType: 'scheduled' | 'unlimited' | 'limited';
    if (isNonScheduledService) {
      if (item.accessType === 'unlimited' || rawFreqType === 'unlimited') {
        accessType = 'unlimited';
      } else if (
        item.accessType === 'limited' ||
        rawFreqType === 'weekly' ||
        rawFreqType === 'monthly' ||
        rawFreqType === 'fixed_count'
      ) {
        accessType = 'limited';
      } else {
        accessType = 'unlimited';
      }
    } else if (item.accessType === 'unlimited' || item.accessType === 'limited') {
      accessType = item.accessType;
    } else if (rawFreqType === 'unlimited' || labelIndicatesUnlimitedAccess) {
      accessType = 'unlimited';
    } else {
      accessType = 'scheduled';
    }

    const frequencyType: CommercialFrequencyType =
      rawFreqType === 'monthly' || rawFreqType === 'unlimited' || rawFreqType === 'fixed_count' || rawFreqType === 'weekly'
        ? (rawFreqType as CommercialFrequencyType)
        : (accessType === 'unlimited' ? 'unlimited' : 'weekly');

    if (frequencyType === 'unlimited' && accessType !== 'unlimited') {
      accessType = 'unlimited';
    } else if (isNonScheduledService && frequencyType !== 'unlimited' && accessType === 'unlimited') {
      accessType = 'limited';
    }

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

    const rawCreditMode = String(item.creditMode ?? item.credit_mode ?? '').trim();
    const creditMode: PlanCreditMode | null =
      rawCreditMode === 'fixed_credits' || rawCreditMode === 'weekly_guaranteed' || rawCreditMode === 'unlimited'
        ? (rawCreditMode as PlanCreditMode)
        : (accessType === 'unlimited' || frequencyType === 'unlimited' ? 'unlimited' : null);

    const rawCredits = item.creditsPerCycle ?? item.credits_per_cycle;
    const parsedCredits = rawCredits !== undefined && rawCredits !== null && String(rawCredits).trim() !== ''
      ? Math.floor(Number(rawCredits))
      : NaN;
    const creditsPerCycle = creditMode === 'unlimited' || creditMode === 'weekly_guaranteed'
      ? null
      : (Number.isInteger(parsedCredits) && parsedCredits > 0 ? Math.min(5000, parsedCredits) : null);

    const allowOptionalAddons =
      typeof item.allowOptionalAddons === 'boolean'
        ? item.allowOptionalAddons
        : item.allowOptionalAddons === 1
          ? true
          : item.allowOptionalAddons === 0
            ? false
            : undefined;

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
      active: item.active !== false && item.active !== 0,
      creditMode,
      creditsPerCycle,
      allowPublicBooking: item.allowPublicBooking !== false && item.allowPublicBooking !== 0,
      ...(allowOptionalAddons !== undefined ? { allowOptionalAddons } : {})
    });
  }

  return out;
}

export function isCommercialOptionNonScheduled(
  service: { studio_service_type?: string | null; requires_appointment?: number | boolean | null } | null | undefined,
  option?: Pick<StudioCommercialPriceOption, 'accessType' | 'frequencyType'> | null
): boolean {
  if (service) {
    const stType = String(service.studio_service_type || '').trim().toLowerCase();
    if (stType === 'facility_access' || stType === 'non_scheduled') return true;
    if (service.requires_appointment === 0 || service.requires_appointment === false) return true;
  }
  if (option && (option.accessType === 'unlimited' || option.accessType === 'limited')) {
    return true;
  }
  return false;
}

export function isServiceNonScheduledForPublic(
  service: {
    studio_service_type?: string | null;
    requires_appointment?: number | boolean | null;
    commercial_price_options?: Array<Pick<StudioCommercialPriceOption, 'accessType' | 'active'>> | null;
  } | null | undefined
): boolean {
  if (!service) return false;
  if (isCommercialOptionNonScheduled(service, null)) return true;
  const activeOpts = Array.isArray(service.commercial_price_options)
    ? service.commercial_price_options.filter((o) => o && o.active !== false)
    : [];
  if (activeOpts.length > 0 && activeOpts.every((o) => o.accessType === 'unlimited' || o.accessType === 'limited')) {
    return true;
  }
  return false;
}

export function normalizePlanCreditMode(
  raw: unknown,
  fallback: PlanCreditMode = 'fixed_credits'
): PlanCreditMode {
  const v = String(raw || '').trim();
  if (v === 'fixed_credits' || v === 'weekly_guaranteed' || v === 'unlimited') {
    return v;
  }
  return fallback;
}

export function resolveOptionCreditPlan(
  option: Pick<
    StudioCommercialPriceOption,
    'accessType' | 'frequencyType' | 'frequencyCount' | 'contractDurationCode' | 'paymentPeriodicity' | 'creditMode' | 'creditsPerCycle'
  >,
  servicePlanCreditMode?: PlanCreditMode | string | null,
  servicePlanCreditsPerCycle?: number | null
): {
  creditMode: PlanCreditMode;
  creditsPerCycle: number | null;
  totalContractCredits: number | null;
  weeklyCap: number | null;
  estimatedSessionsInContract: number | null;
} {
  const contractMonths = PLAN_DURATION_MONTHS[option.contractDurationCode] || 1;
  const paymentCycleMonths = getPaymentPeriodicityCycleMonths(option.paymentPeriodicity);
  const billingCyclesCount =
    option.paymentPeriodicity === 'one_time' || option.paymentPeriodicity === 'installments'
      ? 1
      : Math.max(1, Math.round(contractMonths / paymentCycleMonths));

  const effMode: PlanCreditMode =
    option.accessType === 'unlimited' || option.frequencyType === 'unlimited' || option.creditMode === 'unlimited'
      ? 'unlimited'
      : option.creditMode === 'fixed_credits' || option.creditMode === 'weekly_guaranteed'
        ? option.creditMode
        : servicePlanCreditMode === 'fixed_credits' || servicePlanCreditMode === 'weekly_guaranteed' || servicePlanCreditMode === 'unlimited'
          ? (servicePlanCreditMode as PlanCreditMode)
          : 'fixed_credits';

  const weeklyCap =
    option.frequencyType === 'weekly' && option.frequencyCount && option.frequencyCount > 0
      ? Math.max(1, Math.floor(option.frequencyCount))
      : null;

  if (effMode === 'unlimited') {
    return {
      creditMode: 'unlimited',
      creditsPerCycle: null,
      totalContractCredits: null,
      weeklyCap,
      estimatedSessionsInContract: null
    };
  }

  if (effMode === 'weekly_guaranteed') {
    const cap = weeklyCap || Math.max(1, Math.floor(Number(option.frequencyCount) || 1));
    const estimatedSessionsInContract = Math.max(1, Math.ceil((cap * 52 * contractMonths) / 12));
    return {
      creditMode: 'weekly_guaranteed',
      creditsPerCycle: null,
      totalContractCredits: null,
      weeklyCap: cap,
      estimatedSessionsInContract
    };
  }

  const explicitCredits =
    option.creditsPerCycle !== undefined && option.creditsPerCycle !== null && option.creditsPerCycle > 0
      ? Math.floor(Number(option.creditsPerCycle))
      : servicePlanCreditsPerCycle && Number(servicePlanCreditsPerCycle) > 0
        ? Math.floor(Number(servicePlanCreditsPerCycle))
        : null;

  const perMonthDefault =
    option.frequencyType === 'weekly'
      ? Math.max(1, option.frequencyCount || 1) * 4
      : option.frequencyType === 'monthly'
        ? Math.max(1, option.frequencyCount || 1)
        : Math.max(1, option.frequencyCount || 1);

  if (option.frequencyType === 'fixed_count') {
    const fixedTotal = Math.max(1, explicitCredits || option.frequencyCount || perMonthDefault);
    return {
      creditMode: 'fixed_credits',
      creditsPerCycle: fixedTotal,
      totalContractCredits: fixedTotal,
      weeklyCap: null,
      estimatedSessionsInContract: fixedTotal
    };
  }

  if (explicitCredits && explicitCredits > 0) {
    const totalContractCredits =
      option.paymentPeriodicity === 'one_time' || option.paymentPeriodicity === 'installments'
        ? explicitCredits
        : explicitCredits * billingCyclesCount;
    return {
      creditMode: 'fixed_credits',
      creditsPerCycle: explicitCredits,
      totalContractCredits,
      weeklyCap,
      estimatedSessionsInContract: totalContractCredits
    };
  }

  const totalContractCredits = Math.max(1, perMonthDefault * contractMonths);
  const creditsPerCycle =
    option.paymentPeriodicity === 'one_time' || option.paymentPeriodicity === 'installments'
      ? totalContractCredits
      : Math.max(1, perMonthDefault * paymentCycleMonths);

  return {
    creditMode: 'fixed_credits',
    creditsPerCycle,
    totalContractCredits,
    weeklyCap,
    estimatedSessionsInContract: totalContractCredits
  };
}

export function calculateCommercialOptionBreakdown(
  option: StudioCommercialPriceOption,
  context?: {
    participantsCount?: number;
    sessionsInContract?: number;
    sessionsPerMonth?: number;
    servicePlanCreditMode?: PlanCreditMode | string | null;
    servicePlanCreditsPerCycle?: number | null;
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

  const creditPlan = resolveOptionCreditPlan(
    option,
    context?.servicePlanCreditMode,
    context?.servicePlanCreditsPerCycle
  );

  const effParticipants = Math.max(1, Math.floor(Number(context?.participantsCount || option.participantsCount || 1)));
  const defaultSessionsPerMonth = option.frequencyType === 'weekly' && option.frequencyCount
    ? option.frequencyCount * 4
    : (option.frequencyType === 'monthly' && option.frequencyCount ? option.frequencyCount : 1);
  const sessionsPerMonth = Math.max(1, Math.floor(Number(context?.sessionsPerMonth || defaultSessionsPerMonth)));
  const configuredSessions =
    creditPlan.creditMode === 'fixed_credits'
      ? creditPlan.totalContractCredits
      : (option.frequencyType === 'fixed_count' ? option.frequencyCount : creditPlan.estimatedSessionsInContract);
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

  const monthlyEquivalentCents = Math.round(totalContractAmountCents / Math.max(1, contractMonths));

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
    monthlyEquivalentCents,
    monthlyEquivalentReais: Math.round(monthlyEquivalentCents) / 100,
    totalContractAmountCents,
    totalContractAmountReais: Math.round(totalContractAmountCents) / 100,
    perParticipantAmountCents,
    perParticipantAmountReais: Math.round(perParticipantAmountCents) / 100,
    creditMode: creditPlan.creditMode,
    creditsPerCycle: creditPlan.creditsPerCycle,
    totalContractCredits: creditPlan.totalContractCredits,
    weeklyCap: creditPlan.weeklyCap,
    estimatedSessionsInContract: creditPlan.estimatedSessionsInContract
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

// ============================================================================
// COMPLEMENTOS OPCIONAIS DOS PLANOS DO ACADEMIA & STUDIO
// ============================================================================

export type AddonScheduleTiming = 'during_purchase' | 'after_confirmation' | 'not_applicable';
export type AddonAttendanceFormat = 'match_service' | 'individual' | 'duo' | 'group';
export type AddonProfessionalSelectionMode = 'student_picks' | 'auto_assign';
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
  /** Permite ocultar um complemento ativo apenas do link público. */
  allowPublicBooking?: boolean;
  /** Lista vazia com baseOptionRestrictionMode='all' = válido para planos-base que aceitarem complementos; 'selected' = restrito estritamente aos IDs em acceptedBaseOptionIds. */
  acceptedBaseOptionIds: string[];
  /** 'selected' impede vazamento para todos os planos quando uma opção comercial vinculada é removida. */
  baseOptionRestrictionMode?: 'all' | 'selected';
  /** Profissionais habilitados para este complemento (vazio = qualquer profissional ativo vinculado ao serviço-alvo). */
  enabledProfessionalIds?: string[];
  professionalSelectionMode?: AddonProfessionalSelectionMode;
  attendanceFormat?: AddonAttendanceFormat;
  sessionCapacity?: number | null;
  /** Dias permitidos da semana (0=Dom..6=Sáb). Vazio = qualquer dia ofertado pelo serviço/profissional. */
  allowedWeekdays?: number[];
  studentCanChooseSchedule?: boolean;
  frequencyType: CommercialFrequencyType;
  frequencyCount: number | null;
  /** Regra explícita de consumo do complemento: 'fixed_credits' (ex.: 4 aulas/mês) ou 'weekly_guaranteed' (ex.: 1x/sem garantida) ou 'unlimited'. */
  creditMode?: PlanCreditMode | null;
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
  availabilityStatus?: 'available' | 'needs_professional' | 'needs_schedule' | 'inactive_service' | 'incomplete_config';
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

    const rawCreditMode = String(item.creditMode ?? item.credit_mode ?? '').trim();
    const creditMode: PlanCreditMode =
      frequencyType === 'unlimited'
        ? 'unlimited'
        : rawCreditMode === 'weekly_guaranteed' || rawCreditMode === 'fixed_credits' || rawCreditMode === 'unlimited'
          ? (rawCreditMode as PlanCreditMode)
          : 'fixed_credits';

    const rawCredits = item.creditsPerCycle !== undefined && item.creditsPerCycle !== null && String(item.creditsPerCycle).trim() !== ''
      ? Number(item.creditsPerCycle)
      : NaN;
    const creditsPerCycle =
      frequencyType === 'unlimited' || creditMode === 'unlimited' || creditMode === 'weekly_guaranteed'
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
    const rawRestrict = String(item.baseOptionRestrictionMode || '').trim();
    const baseOptionRestrictionMode: 'all' | 'selected' =
      rawRestrict === 'selected'
        ? 'selected'
        : rawRestrict === 'all' && acceptedBaseOptionIds.length === 0
          ? 'all'
          : (acceptedBaseOptionIds.length > 0 ? 'selected' : 'all');

    const enabledProfessionalIds = Array.isArray(item.enabledProfessionalIds)
      ? Array.from(new Set<string>(item.enabledProfessionalIds.map((v: any) => String(v || '').trim()).filter(Boolean)))
      : [];

    const professionalSelectionMode: AddonProfessionalSelectionMode =
      item.professionalSelectionMode === 'auto_assign' ? 'auto_assign' : 'student_picks';

    const attendanceFormat: AddonAttendanceFormat =
      item.attendanceFormat && ['match_service', 'individual', 'duo', 'group'].includes(String(item.attendanceFormat))
        ? (item.attendanceFormat as AddonAttendanceFormat)
        : 'match_service';

    const rawCap = item.sessionCapacity !== undefined && item.sessionCapacity !== null && item.sessionCapacity !== ''
      ? Number(item.sessionCapacity)
      : NaN;
    const sessionCapacity =
      attendanceFormat === 'individual'
        ? 1
        : attendanceFormat === 'duo'
        ? 2
        : Number.isInteger(rawCap) && rawCap >= 1
        ? Math.min(500, rawCap)
        : null;

    const allowedWeekdays = Array.isArray(item.allowedWeekdays)
      ? Array.from(
          new Set<number>(
            item.allowedWeekdays
              .map((d: any) => Number(d))
              .filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6)
          )
        ).sort((a, b) => a - b)
      : [];

    const allowPublicBooking = item.allowPublicBooking !== false && item.allowPublicBooking !== 0;
    const studentCanChooseSchedule =
      scheduleTiming === 'not_applicable'
        ? false
        : item.studentCanChooseSchedule !== undefined
        ? Boolean(item.studentCanChooseSchedule)
        : scheduleTiming === 'during_purchase';

    const addonServiceType =
      item.addonServiceType && (VALID_STUDIO_SERVICE_TYPES as string[]).includes(String(item.addonServiceType))
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
      allowPublicBooking,
      acceptedBaseOptionIds,
      baseOptionRestrictionMode,
      enabledProfessionalIds,
      professionalSelectionMode,
      attendanceFormat,
      sessionCapacity,
      allowedWeekdays,
      studentCanChooseSchedule,
      frequencyType,
      frequencyCount,
      creditMode,
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
  addon: Pick<StudioOptionalAddonOption, 'active' | 'acceptedBaseOptionIds' | 'baseOptionRestrictionMode'>,
  baseOptionOrId?: Pick<StudioCommercialPriceOption, 'id' | 'allowOptionalAddons'> | string | null
): boolean {
  if (!addon.active) return false;
  if (typeof baseOptionOrId === 'object' && baseOptionOrId !== null && baseOptionOrId.allowOptionalAddons === false) {
    return false;
  }
  const baseOptionId =
    typeof baseOptionOrId === 'string'
      ? baseOptionOrId.trim() || null
      : (baseOptionOrId?.id ? String(baseOptionOrId.id).trim() : null);

  const accepted = Array.isArray(addon.acceptedBaseOptionIds)
    ? addon.acceptedBaseOptionIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  const restrictionMode: 'all' | 'selected' =
    addon.baseOptionRestrictionMode === 'selected'
      ? 'selected'
      : addon.baseOptionRestrictionMode === 'all' && accepted.length === 0
        ? 'all'
        : (accepted.length > 0 ? 'selected' : 'all');

  if (restrictionMode === 'selected') {
    if (!baseOptionId) return false;
    return accepted.includes(baseOptionId);
  }
  return true;
}

export function reconcileCommercialOptionsAndAddons(
  commercialOptions: StudioCommercialPriceOption[],
  optionalAddons: StudioOptionalAddonsConfig | null
): { commercialOptions: StudioCommercialPriceOption[]; optionalAddons: StudioOptionalAddonsConfig | null } {
  if (!optionalAddons) {
    return { commercialOptions, optionalAddons };
  }
  const validIds = new Set(commercialOptions.map((o) => o.id));
  const blockedIds = new Set(commercialOptions.filter((o) => o.allowOptionalAddons === false).map((o) => o.id));
  const hasExplicitOptionFlags = commercialOptions.some((o) => typeof o.allowOptionalAddons === 'boolean');
  const explicitlyAllowedIds = commercialOptions.filter((o) => o.allowOptionalAddons === true).map((o) => o.id);

  const nextOptions = optionalAddons.options.map((addon) => {
    const rawAccepted = Array.isArray(addon.acceptedBaseOptionIds)
      ? addon.acceptedBaseOptionIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    const wasRestricted = addon.baseOptionRestrictionMode === 'selected' || rawAccepted.length > 0;
    const pruned =
      commercialOptions.length > 0
        ? rawAccepted.filter((id) => validIds.has(id) && !blockedIds.has(id))
        : rawAccepted;

    if (wasRestricted) {
      return {
        ...addon,
        acceptedBaseOptionIds: pruned,
        baseOptionRestrictionMode: 'selected' as const
      };
    }
    if (hasExplicitOptionFlags && blockedIds.size > 0 && explicitlyAllowedIds.length > 0) {
      return {
        ...addon,
        acceptedBaseOptionIds: explicitlyAllowedIds,
        baseOptionRestrictionMode: 'selected' as const
      };
    }
    return {
      ...addon,
      acceptedBaseOptionIds: pruned,
      baseOptionRestrictionMode: 'all' as const
    };
  });

  return {
    commercialOptions,
    optionalAddons: {
      ...optionalAddons,
      options: nextOptions
    }
  };
}

export interface AddonItemFinancialBreakdown {
  optionId: string;
  addonServiceId: string;
  addonServiceName: string | null;
  label: string;
  attendanceFormat: AddonAttendanceFormat;
  sessionCapacity: number | null;
  professionalSelectionMode: AddonProfessionalSelectionMode;
  enabledProfessionalIds: string[];
  allowedWeekdays: number[];
  frequencyType: CommercialFrequencyType;
  frequencyCount: number | null;
  creditMode: PlanCreditMode;
  creditsPerCycle: number | null;
  totalCreditsInDuration: number | null;
  scheduleTiming: AddonScheduleTiming;
  billingPeriodicity: AddonBillingPeriodicity;
  effectivePeriodicity: PaymentPeriodicityCode;
  effectivePeriodicityLabel: string;
  effectiveCycleMonths: number;
  durationMode: AddonDurationMode;
  isIndependentDuration: boolean;
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

  const resolvedCreditMode: PlanCreditMode =
    addon.frequencyType === 'unlimited'
      ? 'unlimited'
      : addon.creditMode === 'weekly_guaranteed' || addon.creditMode === 'fixed_credits' || addon.creditMode === 'unlimited'
        ? addon.creditMode
        : 'fixed_credits';

  const resolvedCreditsPerCycle =
    addon.frequencyType === 'unlimited' || resolvedCreditMode === 'unlimited' || resolvedCreditMode === 'weekly_guaranteed'
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
    attendanceFormat: addon.attendanceFormat || 'match_service',
    sessionCapacity: addon.sessionCapacity ?? null,
    professionalSelectionMode: addon.professionalSelectionMode || 'student_picks',
    enabledProfessionalIds: Array.isArray(addon.enabledProfessionalIds) ? addon.enabledProfessionalIds : [],
    allowedWeekdays: Array.isArray(addon.allowedWeekdays) ? addon.allowedWeekdays : [],
    frequencyType: addon.frequencyType,
    frequencyCount: addon.frequencyCount,
    creditMode: resolvedCreditMode,
    creditsPerCycle: resolvedCreditsPerCycle,
    totalCreditsInDuration,
    scheduleTiming: addon.scheduleTiming,
    billingPeriodicity: addon.billingPeriodicity,
    effectivePeriodicity,
    effectivePeriodicityLabel: PAYMENT_PERIODICITY_LABELS[effectivePeriodicity] || effectivePeriodicity,
    effectiveCycleMonths,
    durationMode: addon.durationMode,
    isIndependentDuration: addon.durationMode !== 'match_base',
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

export interface ServiceCommercialModesInput {
  service_domain?: string | null;
  serviceDomain?: string | null;
  studio_service_type?: string | null;
  studioServiceType?: string | null;
  service_kind?: string | null;
  serviceKind?: string | null;
  requires_appointment?: number | boolean | null;
  requiresAppointment?: boolean | null;
  requires_active_contract?: number | boolean | null;
  requiresActiveContract?: boolean | null;
  allow_single_booking?: number | boolean | null;
  allowSingleBooking?: boolean | null;
  allow_plan_booking?: number | boolean | null;
  allowPlanBooking?: boolean | null;
  allow_public_booking?: number | boolean | null;
  allowPublicBooking?: boolean | null;
  allow_public_single_booking?: number | boolean | null;
  allowPublicSingleBooking?: boolean | null;
  allow_public_plan_booking?: number | boolean | null;
  allowPublicPlanBooking?: boolean | null;
  billing_mode?: string | null;
  billingMode?: string | null;
  price?: number | null;
  periodic_price?: number | null;
  periodicPrice?: number | null;
  frequency_pricing_json?: unknown;
  frequencyPricing?: unknown;
  commercial_options_json?: unknown;
  commercial_price_options_json?: unknown;
  commercial_price_options?: unknown;
  commercialPriceOptions?: unknown;
  commercialOptions?: unknown;
  plan_credit_mode?: string | null;
  planCreditMode?: string | null;
  plan_credits_per_cycle?: number | null;
  planCreditsPerCycle?: number | null;
  weekly_sessions_count?: number | null;
  weeklySessionsCount?: number | null;
}

export interface ResolvedServiceCommercialModes {
  isStudio: boolean;
  studioServiceType: StudioServiceType;
  requiresAppointment: boolean;
  allowSingleBooking: boolean;
  allowPlanBooking: boolean;
  allowPublicSingleBooking: boolean;
  allowPublicPlanBooking: boolean;
  allowPublicBooking: boolean;
  standalonePrice: number | null;
  hasActiveCommercialOptions: boolean;
  hasFrequencyPricing: boolean;
  planCreditMode: PlanCreditMode;
  planCreditsPerCycle: number | null;
}

function parseBoolNullable(val: unknown): boolean | null {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  const norm = String(val).trim().toLowerCase();
  if (['1', 'true', 'yes', 'sim'].includes(norm)) return true;
  if (['0', 'false', 'no', 'nao', 'não'].includes(norm)) return false;
  return null;
}

function hasEnabledFreqPricing(raw: unknown): boolean {
  if (!raw) return false;
  let obj: any = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return false;
    }
  }
  return Boolean(obj && typeof obj === 'object' && obj.enabled);
}

export function resolveServiceCommercialModes(
  srv: ServiceCommercialModesInput,
  establishmentProfile?: string | null
): ResolvedServiceCommercialModes {
  const domain = String(srv.service_domain ?? srv.serviceDomain ?? '').trim().toLowerCase();
  const prof = String(establishmentProfile || '').trim().toLowerCase();
  const isClinical = domain === 'clinical' || (!domain && prof === 'clinic');

  const rawPrice = Number(srv.price ?? 0);
  const safePrice = Number.isFinite(rawPrice) && rawPrice > 0 ? Math.round(rawPrice * 100) / 100 : 0;
  const legacyAllowPublic = parseBoolNullable(srv.allow_public_booking ?? srv.allowPublicBooking);
  const basePublicFlag = legacyAllowPublic !== null ? legacyAllowPublic : true;

  if (isClinical) {
    return {
      isStudio: false,
      studioServiceType: 'individual',
      requiresAppointment: true,
      allowSingleBooking: true,
      allowPlanBooking: false,
      allowPublicSingleBooking: basePublicFlag,
      allowPublicPlanBooking: false,
      allowPublicBooking: basePublicFlag,
      standalonePrice: safePrice,
      hasActiveCommercialOptions: false,
      hasFrequencyPricing: false,
      planCreditMode: 'fixed_credits',
      planCreditsPerCycle: null
    };
  }

  const studioServiceType = normalizeStudioServiceType(
    srv.studio_service_type ?? srv.studioServiceType,
    srv.service_kind ?? srv.serviceKind,
    srv.requires_appointment ?? srv.requiresAppointment
  );
  const reqApptRaw = parseBoolNullable(srv.requires_appointment ?? srv.requiresAppointment);
  const requiresAppointment =
    studioServiceType === 'facility_access' || studioServiceType === 'non_scheduled'
      ? false
      : (reqApptRaw !== null ? reqApptRaw : true);

  const commercialOptions = normalizeCommercialPriceOptions(
    srv.commercial_options_json ??
      srv.commercial_price_options_json ??
      srv.commercial_price_options ??
      srv.commercialPriceOptions ??
      srv.commercialOptions
  ).filter((o) => o.active);
  const hasActiveCommercialOptions = commercialOptions.length > 0;
  const hasFrequencyPricing = hasEnabledFreqPricing(
    srv.frequency_pricing_json ?? srv.frequencyPricing
  );
  const billingMode = String(srv.billing_mode ?? srv.billingMode ?? 'per_session').trim().toLowerCase();
  const periodicPrice = Number(srv.periodic_price ?? srv.periodicPrice ?? 0);
  const reqActiveContract = Boolean(parseBoolNullable(srv.requires_active_contract ?? srv.requiresActiveContract));

  const hasPlanDefinition =
    hasActiveCommercialOptions ||
    hasFrequencyPricing ||
    (billingMode !== '' && billingMode !== 'per_session' && (periodicPrice > 0 || studioServiceType === 'facility_access')) ||
    studioServiceType === 'facility_access' ||
    studioServiceType === 'non_scheduled';

  const explicitAllowPlan = parseBoolNullable(srv.allow_plan_booking ?? srv.allowPlanBooking);
  const allowPlanBooking =
    studioServiceType === 'facility_access'
      ? true
      : (explicitAllowPlan !== null ? explicitAllowPlan : hasPlanDefinition);

  const explicitAllowSingle = parseBoolNullable(srv.allow_single_booking ?? srv.allowSingleBooking);
  let allowSingleBooking = false;
  if (studioServiceType === 'facility_access') {
    allowSingleBooking = false;
  } else if (explicitAllowSingle !== null) {
    allowSingleBooking = explicitAllowSingle;
  } else {
    allowSingleBooking =
      !reqActiveContract &&
      (safePrice > 0 || (billingMode === 'per_session' && !hasPlanDefinition));
  }

  const standalonePrice = allowSingleBooking ? safePrice : null;

  const explicitPublicSingle = parseBoolNullable(
    srv.allow_public_single_booking ?? srv.allowPublicSingleBooking
  );
  const allowPublicSingleBooking =
    allowSingleBooking &&
    (explicitPublicSingle !== null
      ? explicitPublicSingle
      : basePublicFlag && (safePrice > 0 || (billingMode === 'per_session' && !hasPlanDefinition)));

  const explicitPublicPlan = parseBoolNullable(
    srv.allow_public_plan_booking ?? srv.allowPublicPlanBooking
  );
  const allowPublicPlanBooking =
    allowPlanBooking &&
    (explicitPublicPlan !== null ? explicitPublicPlan : basePublicFlag);

  const defaultCreditMode: PlanCreditMode =
    studioServiceType === 'facility_access' ? 'unlimited' : 'fixed_credits';
  const planCreditMode = normalizePlanCreditMode(
    srv.plan_credit_mode ?? srv.planCreditMode,
    defaultCreditMode
  );
  const rawPlanCredits = Number(srv.plan_credits_per_cycle ?? srv.planCreditsPerCycle);
  const planCreditsPerCycle =
    planCreditMode === 'fixed_credits' && Number.isInteger(rawPlanCredits) && rawPlanCredits > 0
      ? Math.min(5000, rawPlanCredits)
      : null;

  return {
    isStudio: true,
    studioServiceType,
    requiresAppointment,
    allowSingleBooking,
    allowPlanBooking,
    allowPublicSingleBooking,
    allowPublicPlanBooking,
    allowPublicBooking: allowPublicSingleBooking || allowPublicPlanBooking,
    standalonePrice,
    hasActiveCommercialOptions,
    hasFrequencyPricing,
    planCreditMode,
    planCreditsPerCycle
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
  plan_credit_mode?: string | null;
  planCreditMode?: string | null;
  plan_credits_per_cycle?: number | null;
  planCreditsPerCycle?: number | null;
  allow_single_booking?: number | boolean | null;
  allowSingleBooking?: boolean | null;
}): StudioCommercialPriceOption {
  const billingMode = String(srv.billing_mode ?? srv.billingMode ?? 'per_session').toLowerCase();
  const periodicPrice = Number(srv.periodic_price ?? srv.periodicPrice ?? 0);
  const basePrice = Number(srv.price ?? 0);
  const amountReais =
    billingMode !== 'per_session' && periodicPrice > 0
      ? periodicPrice
      : (periodicPrice > 0 ? periodicPrice : basePrice);
  const amountCents = Math.max(0, Math.round(amountReais * 100));
  const studioType = String(srv.studio_service_type ?? srv.studioServiceType ?? 'individual');
  const periodicityMap: Record<string, PaymentPeriodicityCode> = {
    monthly: 'monthly',
    bimonthly: 'bimonthly',
    quarterly: 'quarterly',
    semiannual: 'semiannual',
    annual: 'annual',
    biennial: 'annual'
  };
  const paymentPeriodicity: PaymentPeriodicityCode = periodicityMap[billingMode] || 'monthly';
  const durationMap: Record<PaymentPeriodicityCode, PlanDurationCode> = {
    one_time: '1_month',
    monthly: '1_month',
    bimonthly: '2_months',
    quarterly: '3_months',
    semiannual: '6_months',
    annual: billingMode === 'biennial' ? '24_months' : '12_months',
    installments: '1_month'
  };
  const contractDurationCode: PlanDurationCode =
    srv.default_plan_duration && PLAN_DURATION_MONTHS[srv.default_plan_duration as PlanDurationCode]
      ? (srv.default_plan_duration as PlanDurationCode)
      : durationMap[paymentPeriodicity];
  const weeklyCount = Number(srv.weekly_sessions_count ?? srv.weeklySessionsCount ?? 0);
  const defaultCreditMode: PlanCreditMode = studioType === 'facility_access' ? 'unlimited' : 'fixed_credits';
  const creditMode = normalizePlanCreditMode(srv.plan_credit_mode ?? srv.planCreditMode, defaultCreditMode);
  const rawCredits = Number(srv.plan_credits_per_cycle ?? srv.planCreditsPerCycle);
  const creditsPerCycle =
    creditMode === 'fixed_credits' && Number.isInteger(rawCredits) && rawCredits > 0 ? rawCredits : null;

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
    active: true,
    creditMode,
    creditsPerCycle,
    allowPublicBooking: true
  };
}
