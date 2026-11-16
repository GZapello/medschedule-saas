import { FrequencyPricing, frequencyPriceCents, supportsFrequencyPricing } from './studioFrequencyPricing';
/**
 * studioPricing.ts
 * Utilitários de precificação e cálculo automático de planos para o Zemda Studio (Frontend).
 */

export type StudioPricingRule = 'four_weeks' | 'annual_average' | 'scheduled_sessions';

export type ServiceBillingMode =
  | 'per_session'
  | 'monthly'
  | 'bimonthly'
  | 'quarterly'
  | 'semiannual'
  | 'annual'
  | 'biennial'
  | 'custom_date'
  | 'count'
  | 'package';

export interface StudioPricingCalculationInput {
  sessionPrice: number;
  frequencyPricing?: FrequencyPricing | null;
  weeklySessionsCount?: number;
  billingMode: ServiceBillingMode;
  pricingRule?: StudioPricingRule;
  customPrice?: number | null;
  isPriceCustomized?: boolean;
  includedSessionsCount?: number;
  scheduledSessionsCount?: number;
  startDate?: string;
  endDate?: string;
  scheduleWeekdays?: number[];
  serviceName?: string;
  packageName?: string | null;
}

export interface StudioPricingCalculationResult {
  billingMode: ServiceBillingMode;
  cycleMonths: number | null;
  weeklySessionsCount: number;
  pricingRule: StudioPricingRule;
  referenceSessionsCount: number;
  referenceSessionsText: string;
  suggestedPrice: number;
  effectivePrice: number;
  isPriceCustomized: boolean;
  averagePricePerSession: number;
  discountPercent: number | null;
  summaryText: string;
}

export const STUDIO_PRICING_RULE_OPTIONS: Array<{
  value: StudioPricingRule;
  label: string;
  description: string;
}> = [
  {
    value: 'four_weeks',
    label: 'Cálculo simplificado (4 semanas/mês)',
    description: 'Multiplica os encontros semanais por 4 semanas fixas por mês.'
  },
  {
    value: 'annual_average',
    label: 'Média anual (52 sem ÷ 12 meses)',
    description: 'Considera a média real de 4,33 semanas por mês ao longo de um ano.'
  },
  {
    value: 'scheduled_sessions',
    label: 'Aulas previstas no calendário real',
    description: 'Baseado no número exato de encontros programados no período de cobrança.'
  }
];

export function getCycleMonthsForBillingMode(mode: ServiceBillingMode): number | null {
  switch (mode) {
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
    case 'biennial':
      return 24;
    case 'custom_date':
      return 1;
    case 'count':
      return 1;
    default:
      return null;
  }
}

export function isPeriodicBilling(mode: unknown): boolean {
  const m = String(mode || '').trim().toLowerCase();
  return (
    m === 'monthly' ||
    m === 'bimonthly' ||
    m === 'quarterly' ||
    m === 'semiannual' ||
    m === 'annual' ||
    m === 'biennial' ||
    m === 'custom_date' ||
    m === 'count'
  );
}

export function formatBRL(val: number): string {
  return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function countWeekdayOccurrencesBetweenDates(
  startDateStr: string,
  endDateStr: string,
  weekdays: number[]
): number {
  if (!startDateStr || !endDateStr || !Array.isArray(weekdays) || weekdays.length === 0) {
    return 0;
  }
  const cleanStart = startDateStr.slice(0, 10);
  const cleanEnd = endDateStr.slice(0, 10);
  if (cleanStart > cleanEnd) return 0;

  const [sY, sM, sD] = cleanStart.split('-').map(Number);
  const [eY, eM, eD] = cleanEnd.split('-').map(Number);
  const current = new Date(Date.UTC(sY, sM - 1, sD, 12, 0, 0));
  const end = new Date(Date.UTC(eY, eM - 1, eD, 12, 0, 0));

  let count = 0;
  const set = new Set(weekdays.map(Number));
  while (current <= end) {
    const dow = current.getUTCDay();
    if (set.has(dow)) {
      count++;
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return count;
}

export function computeBillingCycleEndDate(startDateStr: string, cycleMonths: number): string {
  if (!startDateStr || !/^\d{4}-\d{2}-\d{2}/.test(startDateStr)) return '';
  const clean = startDateStr.slice(0, 10);
  const [y, m, d] = clean.split('-').map(Number);
  const targetTotalMonths = (y * 12 + (m - 1)) + Math.max(1, cycleMonths);
  const ny = Math.floor(targetTotalMonths / 12);
  const nm = targetTotalMonths % 12;
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nextCycleStart = new Date(Date.UTC(ny, nm, Math.min(d, lastDay), 12, 0, 0));
  nextCycleStart.setUTCDate(nextCycleStart.getUTCDate() - 1);
  return nextCycleStart.toISOString().slice(0, 10);
}

export function calculateStudioRecurringPrice(
  input: StudioPricingCalculationInput
): StudioPricingCalculationResult {
  const frequencyPricingActive = Boolean(input.frequencyPricing?.enabled && supportsFrequencyPricing(input.billingMode));
  const selectedWeeklyCount = Math.max(1, Math.floor(Number(input.weeklySessionsCount) || 1));
  const frequencyCents = frequencyPriceCents(input.frequencyPricing, input.billingMode, selectedWeeklyCount);
  const frequencySessionPrice = frequencyPricingActive && input.frequencyPricing?.unit === 'per_session' && frequencyCents !== undefined;
  const rawSessionPrice = frequencySessionPrice ? frequencyCents! / 100 : Number(input.sessionPrice);
  const sessionPrice = Number.isFinite(rawSessionPrice) && rawSessionPrice > 0 ? rawSessionPrice : 0;
  const weeklySessions = frequencyPricingActive ? selectedWeeklyCount : Math.min(7, selectedWeeklyCount);
  const pricingRule: StudioPricingRule =
    input.pricingRule === 'annual_average' || input.pricingRule === 'scheduled_sessions'
      ? input.pricingRule
      : 'four_weeks';
  const mode = input.billingMode || 'per_session';
  const cycleMonths = getCycleMonthsForBillingMode(mode);

  let referenceSessionsCount = 1;
  let referenceSessionsText = '1 aula';
  let suggestedPrice = sessionPrice;

  if (mode === 'per_session') {
    referenceSessionsCount = 1;
    referenceSessionsText = '1 atendimento / aula';
    suggestedPrice = sessionPrice;
  } else if (mode === 'count') {
    const cnt = Math.max(1, Math.floor(Number(input.includedSessionsCount) || (weeklySessions * 4)));
    referenceSessionsCount = cnt;
    referenceSessionsText = `${cnt} aula${cnt === 1 ? '' : 's'} contratada${cnt === 1 ? '' : 's'}`;
    suggestedPrice = Math.round(sessionPrice * cnt * 100) / 100;
  } else if (mode === 'custom_date') {
    let count = 0;
    if (input.startDate && input.endDate && Array.isArray(input.scheduleWeekdays) && input.scheduleWeekdays.length > 0) {
      count = countWeekdayOccurrencesBetweenDates(input.startDate, input.endDate, input.scheduleWeekdays);
    }
    if (count <= 0) {
      count = Math.max(1, Math.floor(Number(input.scheduledSessionsCount) || (weeklySessions * 4)));
    }
    referenceSessionsCount = count;
    referenceSessionsText = input.startDate && input.endDate
      ? `${count} aulas previstas entre ${input.startDate} e ${input.endDate}`
      : `${count} aulas previstas no período personalizado`;
    suggestedPrice = Math.round(sessionPrice * count * 100) / 100;
  } else if (isPeriodicBilling(mode) && cycleMonths !== null) {
    if (pricingRule === 'scheduled_sessions') {
      const scheduled = Math.max(1, Math.floor(Number(input.scheduledSessionsCount) || (weeklySessions * 4 * cycleMonths)));
      referenceSessionsCount = scheduled;
      referenceSessionsText = `${scheduled} aulas previstas no ciclo (${cycleMonths} mês${cycleMonths === 1 ? '' : 'es'})`;
      suggestedPrice = Math.round(sessionPrice * scheduled * 100) / 100;
    } else if (pricingRule === 'annual_average') {
      const rawExactSessions = (weeklySessions * 52 * cycleMonths) / 12;
      const roundedSessions = Math.round(rawExactSessions * 10) / 10;
      const isIntegerSessions = Math.abs(rawExactSessions - Math.round(rawExactSessions)) < 0.01;
      referenceSessionsCount = Math.max(1, Math.round(rawExactSessions));
      if (isIntegerSessions) {
        referenceSessionsText = `${Math.round(rawExactSessions)} aulas (média de 52 sem/ano em ${cycleMonths}m)`;
      } else {
        const lower = Math.floor(rawExactSessions);
        const upper = Math.ceil(rawExactSessions);
        referenceSessionsText = `~${lower} a ${upper} aulas (média anual de 52 sem/12 meses, aprox. ${roundedSessions.toLocaleString('pt-BR')} aulas)`;
      }
      suggestedPrice = Math.round(((sessionPrice * weeklySessions * 52) / 12 * cycleMonths) * 100) / 100;
    } else {
      // 'four_weeks'
      const fourWeeksSessions = weeklySessions * 4 * cycleMonths;
      referenceSessionsCount = fourWeeksSessions;
      referenceSessionsText = `${fourWeeksSessions} aulas de referência (${weeklySessions}x/sem. × 4 sem.${cycleMonths > 1 ? ` × ${cycleMonths} meses` : ''})`;
      suggestedPrice = Math.round(sessionPrice * fourWeeksSessions * 100) / 100;
    }
  } else if (mode === 'package') {
    suggestedPrice = Number(input.customPrice || 0);
    referenceSessionsCount = Math.max(1, Math.floor(Number(input.includedSessionsCount) || 1));
    referenceSessionsText = `Conforme pacote de serviços`;
  }

  const hasExplicitCustomPrice =
    input.customPrice !== undefined &&
    input.customPrice !== null &&
    String(input.customPrice).trim() !== '' &&
    Number.isFinite(Number(input.customPrice)) &&
    Number(input.customPrice) >= 0;

  const numCustomPrice = hasExplicitCustomPrice ? Math.round(Number(input.customPrice) * 100) / 100 : null;

  let isPriceCustomized = input.isPriceCustomized === true;
  if (input.isPriceCustomized === undefined && numCustomPrice !== null) {
    if (Math.abs(numCustomPrice - suggestedPrice) > 0.01) {
      isPriceCustomized = true;
    }
  }

  if (frequencyPricingActive) isPriceCustomized = frequencyCents !== undefined;
  const effectivePrice = frequencyPricingActive
    ? (input.frequencyPricing?.unit === 'per_period' && frequencyCents !== undefined ? frequencyCents / 100 : suggestedPrice)
    : (isPriceCustomized && numCustomPrice !== null ? numCustomPrice : suggestedPrice);

  const averagePricePerSession = referenceSessionsCount > 0
    ? Math.round((effectivePrice / referenceSessionsCount) * 100) / 100
    : sessionPrice;

  let discountPercent: number | null = null;
  if (suggestedPrice > 0 && effectivePrice > 0 && effectivePrice < suggestedPrice) {
    const diff = suggestedPrice - effectivePrice;
    discountPercent = Math.round((diff / suggestedPrice) * 1000) / 10;
  }

  const summaryText = buildStudioCommercialSummary({
    serviceName: input.serviceName || 'Serviço',
    sessionPrice,
    weeklySessions,
    billingMode: mode,
    cycleMonths,
    pricingRule,
    referenceSessionsCount,
    referenceSessionsText,
    suggestedPrice,
    effectivePrice,
    isPriceCustomized,
    averagePricePerSession,
    discountPercent,
    packageName: input.packageName
  });

  return {
    billingMode: mode,
    cycleMonths,
    weeklySessionsCount: weeklySessions,
    pricingRule,
    referenceSessionsCount,
    referenceSessionsText,
    suggestedPrice,
    effectivePrice,
    isPriceCustomized,
    averagePricePerSession,
    discountPercent,
    summaryText
  };
}

function buildStudioCommercialSummary(params: {
  serviceName: string;
  sessionPrice: number;
  weeklySessions: number;
  billingMode: ServiceBillingMode;
  cycleMonths: number | null;
  pricingRule: StudioPricingRule;
  referenceSessionsCount: number;
  referenceSessionsText: string;
  suggestedPrice: number;
  effectivePrice: number;
  isPriceCustomized: boolean;
  averagePricePerSession: number;
  discountPercent: number | null;
  packageName?: string | null;
}): string {
  const {
    serviceName,
    sessionPrice,
    weeklySessions,
    billingMode,
    pricingRule,
    referenceSessionsCount,
    suggestedPrice,
    effectivePrice,
    isPriceCustomized,
    averagePricePerSession,
    discountPercent,
    packageName
  } = params;

  if (billingMode === 'package') {
    return packageName
      ? `${serviceName} — Cobertura via pacote "${packageName}".`
      : `${serviceName} — Cobertura via Pacote de Serviços existente.`;
  }

  if (billingMode === 'per_session') {
    return `${serviceName} — ${formatBRL(sessionPrice)} por atendimento / aula avulsa.`;
  }

  const freqLabel = `${weeklySessions} vez${weeklySessions === 1 ? '' : 'es'} por semana`;
  const ruleLabel =
    pricingRule === 'annual_average'
      ? 'regra de média anual'
      : pricingRule === 'scheduled_sessions'
      ? 'regra de aulas previstas'
      : 'regra de 4 semanas';

  let periodLabel = 'mensal';
  if (billingMode === 'bimonthly') periodLabel = 'bimestral';
  if (billingMode === 'quarterly') periodLabel = 'trimestral';
  if (billingMode === 'semiannual') periodLabel = 'semestral';
  if (billingMode === 'annual') periodLabel = 'anual';
  if (billingMode === 'biennial') periodLabel = 'bienal';
  if (billingMode === 'count') periodLabel = 'quantidade fixa';
  if (billingMode === 'custom_date') periodLabel = 'data final personalizada';

  const baseSummary = `${serviceName} • Preço avulso: ${formatBRL(sessionPrice)} • Frequência: ${freqLabel} • Cobrança: ${periodLabel}.`;
  const sugPart = `Valor sugerido: ${formatBRL(suggestedPrice)} (${ruleLabel}).`;
  const confPart = isPriceCustomized
    ? `Valor configurado: ${formatBRL(effectivePrice)} (personalizado).`
    : `Valor configurado: ${formatBRL(effectivePrice)}.`;
  const avgPart = `Valor médio por aula: ${formatBRL(averagePricePerSession)}, considerando ${referenceSessionsCount} aulas de referência.`;
  const discPart = discountPercent && discountPercent > 0 ? ` (Economia de ${discountPercent.toLocaleString('pt-BR')}% no plano)` : '';

  return `${baseSummary} ${sugPart} ${confPart} ${avgPart}${discPart}`;
}
