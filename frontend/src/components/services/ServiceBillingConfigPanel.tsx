import { FrequencyPricing, supportsFrequencyPricing } from '../../utils/studioFrequencyPricing';
import { ServiceFrequencyPricingPanel } from './ServiceFrequencyPricingPanel';
import React, { useMemo, useEffect, useRef } from 'react';
import {
  CreditCard,
  Info,
  Package as PackageIcon,
  Repeat,
  RotateCcw,
  Sparkles,
  Calculator,
  CheckCircle2
} from 'lucide-react';
import {
  SERVICE_BILLING_MODE_OPTIONS,
  ServiceBillingMode,
  isPeriodicBillingMode
} from '../../utils/establishmentContext';
import {
  calculateStudioRecurringPrice,
  StudioPricingRule,
  STUDIO_PRICING_RULE_OPTIONS,
  formatBRL
} from '../../utils/studioPricing';

export interface ServicePackageOption {
  id: string;
  name: string;
  total_price?: number | null;
  price?: number | null;
  billing_type?: string | null;
  billing_frequency?: string | null;
  included_sessions?: number | null;
}

interface ServiceBillingConfigPanelProps {
  serviceName: string;
  billingMode: ServiceBillingMode;
  sessionPrice: number;
  periodicPrice: string;
  pricingRule?: StudioPricingRule;
  isPriceCustomized?: boolean;
  suggestedPrice?: number | null;
  weeklySessionsCount?: number;
  includedSessionsCount?: number;
  defaultPackageId: string;
  defaultBillingDueDay: string;
  availablePackages?: ServicePackageOption[];
  scheduleWeekdaysCount?: number;
  compact?: boolean;
  frequencyPricing?: FrequencyPricing | null;
  onFrequencyPricingChange?: (value: FrequencyPricing) => void;
  offeredWeeklySessions?: number;
  allowFrequencyPricing?: boolean;
  onChange: (next: {
    billingMode: ServiceBillingMode;
    periodicPrice: string;
    pricingRule: StudioPricingRule;
    isPriceCustomized: boolean;
    suggestedPrice: number | null;
    weeklySessionsCount: number;
    includedSessionsCount?: number;
    defaultPackageId: string;
    defaultBillingDueDay: string;
  }) => void;
}

export const ServiceBillingConfigPanel: React.FC<ServiceBillingConfigPanelProps> = ({
  serviceName,
  billingMode,
  sessionPrice,
  periodicPrice,
  pricingRule = 'four_weeks',
  isPriceCustomized = false,
  suggestedPrice: propSuggestedPrice,
  weeklySessionsCount = 1,
  includedSessionsCount = 8,
  defaultPackageId,
  defaultBillingDueDay,
  availablePackages = [],
  scheduleWeekdaysCount,
  compact = false,
  frequencyPricing, onFrequencyPricingChange, offeredWeeklySessions = 0, allowFrequencyPricing = false,
  onChange
}) => {
  const isPeriodic = isPeriodicBillingMode(billingMode);
  const selectedPkg = availablePackages.find((pkg) => pkg.id === defaultPackageId) || null;

  const frequencyActive = Boolean(allowFrequencyPricing && offeredWeeklySessions >= 2 && frequencyPricing?.enabled && supportsFrequencyPricing(billingMode));
  const weeklyLimit = frequencyActive ? Math.max(1, offeredWeeklySessions) : 7;
  const effectiveWeeklySessions = useMemo(() => {
    return Math.max(1, Math.min(weeklyLimit, Math.floor(weeklySessionsCount || 1)));
  }, [weeklySessionsCount, weeklyLimit]);

  const prevScheduleCountRef = useRef<number | undefined>(scheduleWeekdaysCount);

  const calcResult = useMemo(() => {
    const parsedNumPrice = periodicPrice.trim() !== '' ? Number(periodicPrice.replace(',', '.')) : null;
    return calculateStudioRecurringPrice({
      serviceName: serviceName || 'Serviço',
      sessionPrice: Number(sessionPrice) || 0,
      weeklySessionsCount: effectiveWeeklySessions,
      billingMode,
      pricingRule,
      customPrice: parsedNumPrice,
      isPriceCustomized,
      includedSessionsCount: Number(includedSessionsCount) || (effectiveWeeklySessions * 4),
      packageName: selectedPkg?.name || null
    });
  }, [
    serviceName,
    sessionPrice,
    effectiveWeeklySessions,
    billingMode,
    pricingRule,
    periodicPrice,
    isPriceCustomized,
    includedSessionsCount,
    selectedPkg
  ]);

  const displayCalc = frequencyActive ? calculateStudioRecurringPrice({ serviceName, sessionPrice, weeklySessionsCount: effectiveWeeklySessions, billingMode, pricingRule, frequencyPricing }) : calcResult;

  // Se o valor não for personalizado e estiver vazio ou o preço avulso/frequência/regra/lote mudar, atualiza automaticamente
  useEffect(() => {
    if (!isPeriodic) return;
    if (!isPriceCustomized) {
      const formattedSuggested = calcResult.suggestedPrice.toFixed(2);
      const currentValNum = periodicPrice.trim() !== '' ? Number(periodicPrice.replace(',', '.')) : 0;
      if (Math.abs(currentValNum - calcResult.suggestedPrice) > 0.01 || periodicPrice.trim() === '') {
        onChange({
          billingMode,
          periodicPrice: formattedSuggested,
          pricingRule,
          isPriceCustomized: false,
          suggestedPrice: calcResult.suggestedPrice,
          weeklySessionsCount: effectiveWeeklySessions,
          includedSessionsCount,
          defaultPackageId,
          defaultBillingDueDay
        });
      }
    }
  }, [
    isPeriodic,
    isPriceCustomized,
    calcResult.suggestedPrice,
    sessionPrice,
    effectiveWeeklySessions,
    billingMode,
    pricingRule,
    includedSessionsCount
  ]);

  // Quando o gestor adiciona/remove horários na grade semanal, sincroniza a sugestão inicial sem travar edições manuais do dropdown
  useEffect(() => {
    const prev = prevScheduleCountRef.current;
    prevScheduleCountRef.current = scheduleWeekdaysCount;
    if (
      prev !== undefined &&
      scheduleWeekdaysCount !== undefined &&
      scheduleWeekdaysCount > 0 &&
      scheduleWeekdaysCount !== prev
    ) {
      const clamped = Math.max(1, Math.min(weeklyLimit, scheduleWeekdaysCount));
      if (clamped !== effectiveWeeklySessions) {
        handleWeeklySessionsChange(clamped);
      }
    }
  }, [scheduleWeekdaysCount]);

  const handleModeChange = (nextMode: ServiceBillingMode) => {
    const isNextPeriodic = isPeriodicBillingMode(nextMode);
    const nextCalc = calculateStudioRecurringPrice({
      serviceName,
      sessionPrice,
      weeklySessionsCount: effectiveWeeklySessions,
      billingMode: nextMode,
      pricingRule,
      includedSessionsCount,
      packageName: selectedPkg?.name || null
    });

    let nextPeriodicPrice = periodicPrice;
    let nextIsCustom = isPriceCustomized;

    if (isNextPeriodic) {
      if (!nextIsCustom || !nextPeriodicPrice || Number(nextPeriodicPrice) <= 0) {
        nextPeriodicPrice = nextCalc.suggestedPrice.toFixed(2);
        nextIsCustom = false;
      }
    }

    onChange({
      billingMode: nextMode,
      periodicPrice: nextPeriodicPrice,
      pricingRule,
      isPriceCustomized: nextIsCustom,
      suggestedPrice: nextCalc.suggestedPrice,
      weeklySessionsCount: effectiveWeeklySessions,
      includedSessionsCount,
      defaultPackageId: nextMode === 'package' ? defaultPackageId : '',
      defaultBillingDueDay
    });
  };

  const handleWeeklySessionsChange = (nextSessions: number) => {
    const nextVal = Math.max(1, Math.min(weeklyLimit, nextSessions));
    const nextCalc = calculateStudioRecurringPrice({
      serviceName,
      sessionPrice,
      weeklySessionsCount: nextVal,
      billingMode,
      pricingRule,
      customPrice: periodicPrice ? Number(periodicPrice) : undefined,
      isPriceCustomized,
      includedSessionsCount
    });

    const nextPriceStr = isPriceCustomized ? periodicPrice : nextCalc.suggestedPrice.toFixed(2);

    onChange({
      billingMode,
      periodicPrice: nextPriceStr,
      pricingRule,
      isPriceCustomized,
      suggestedPrice: nextCalc.suggestedPrice,
      weeklySessionsCount: nextVal,
      includedSessionsCount,
      defaultPackageId,
      defaultBillingDueDay
    });
  };

  const handlePricingRuleChange = (nextRule: StudioPricingRule) => {
    const nextCalc = calculateStudioRecurringPrice({
      serviceName,
      sessionPrice,
      weeklySessionsCount: effectiveWeeklySessions,
      billingMode,
      pricingRule: nextRule,
      customPrice: periodicPrice ? Number(periodicPrice) : undefined,
      isPriceCustomized,
      includedSessionsCount
    });

    const nextPriceStr = isPriceCustomized ? periodicPrice : nextCalc.suggestedPrice.toFixed(2);

    onChange({
      billingMode,
      periodicPrice: nextPriceStr,
      pricingRule: nextRule,
      isPriceCustomized,
      suggestedPrice: nextCalc.suggestedPrice,
      weeklySessionsCount: effectiveWeeklySessions,
      includedSessionsCount,
      defaultPackageId,
      defaultBillingDueDay
    });
  };

  const handlePriceManualInput = (val: string) => {
    const parsed = val.trim() !== '' ? parseFloat(val.replace(',', '.')) : null;
    const isNowCustom =
      parsed !== null && !isNaN(parsed)
        ? Math.abs(parsed - calcResult.suggestedPrice) > 0.01
        : true;

    onChange({
      billingMode,
      periodicPrice: val,
      pricingRule,
      isPriceCustomized: isNowCustom,
      suggestedPrice: calcResult.suggestedPrice,
      weeklySessionsCount: effectiveWeeklySessions,
      includedSessionsCount,
      defaultPackageId,
      defaultBillingDueDay
    });
  };

  const handleResetToSuggested = () => {
    const resetPrice = calcResult.suggestedPrice.toFixed(2);
    onChange({
      billingMode,
      periodicPrice: resetPrice,
      pricingRule,
      isPriceCustomized: false,
      suggestedPrice: calcResult.suggestedPrice,
      weeklySessionsCount: effectiveWeeklySessions,
      includedSessionsCount,
      defaultPackageId,
      defaultBillingDueDay
    });
  };

  return (
    <div className={`rounded-xl border border-emerald-100 bg-emerald-50/40 ${compact ? 'p-3 space-y-2.5' : 'p-4 space-y-3.5'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            <span>Configuração de Cobrança e Precificação Recorrente</span>
          </div>
          <p className="text-[11px] text-gray-600 mt-0.5">
            Calcula automaticamente o valor sugerido a partir do preço por aula, frequência semanal e periodicidade financeira, permitindo preço personalizado.
          </p>
        </div>
      </div>

      {/* 1. Modalidades de cobrança padrão */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          Modalidade de cobrança padrão
        </label>
        <div className={`grid gap-1.5 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
          {SERVICE_BILLING_MODE_OPTIONS.map((opt) => {
            const active = billingMode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleModeChange(opt.value)}
                className={`text-left px-2.5 py-2 rounded-lg border text-xs transition-colors ${
                  active
                    ? 'bg-emerald-600 text-white border-emerald-600 font-semibold shadow-sm'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50'
                }`}
              >
                <div className="leading-tight">{opt.label}</div>
                <div className={`text-[10px] mt-0.5 ${active ? 'text-emerald-100' : 'text-gray-400'}`}>
                  {opt.shortPeriod}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Seção periódica com Frequência, Regra de Cálculo e Valor */}
      {isPeriodic && (
        <div className="space-y-3 pt-1">
          {/* Frequência semanal & Regra de cálculo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center justify-between">
                <span>Frequência semanal de referência</span>
                {scheduleWeekdaysCount !== undefined && scheduleWeekdaysCount > 0 && (
                  scheduleWeekdaysCount !== effectiveWeeklySessions ? (
                    <button
                      type="button"
                      onClick={() => handleWeeklySessionsChange(scheduleWeekdaysCount)}
                      className="text-[10px] text-emerald-700 font-medium bg-emerald-100 hover:bg-emerald-200 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                      title="Sincronizar com a quantidade de horários da grade semanal"
                    >
                      Usar {Math.min(weeklyLimit, scheduleWeekdaysCount)}x da grade
                    </button>
                  ) : (
                    <span className="text-[10px] text-emerald-700 font-normal bg-emerald-100 px-1.5 py-0.5 rounded">
                      {scheduleWeekdaysCount}x/sem na grade
                    </span>
                  )
                )}
              </label>
              <select
                value={effectiveWeeklySessions}
                onChange={(e) => handleWeeklySessionsChange(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                {Array.from({ length: weeklyLimit }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} aula(s) por semana ({i + 1}x)</option>)}
              </select>
              <p className="text-[10px] text-gray-500 mt-1">
                Utilizada para projetar os encontros no período contratado.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Regra de cálculo da recorrência
              </label>
              <select
                value={pricingRule}
                onChange={(e) => handlePricingRuleChange(e.target.value as StudioPricingRule)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                {STUDIO_PRICING_RULE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-gray-500 mt-1">
                {STUDIO_PRICING_RULE_OPTIONS.find((r) => r.value === pricingRule)?.description}
              </p>
            </div>
          </div>

          {billingMode === 'count' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Quantidade de aulas incluídas no plano
              </label>
              <input
                type="number"
                min="1"
                max="200"
                value={includedSessionsCount}
                onChange={(e) => {
                  const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                  const nextCalc = calculateStudioRecurringPrice({
                    serviceName,
                    sessionPrice,
                    weeklySessionsCount: effectiveWeeklySessions,
                    billingMode,
                    pricingRule,
                    customPrice: periodicPrice ? Number(periodicPrice) : undefined,
                    isPriceCustomized,
                    includedSessionsCount: val
                  });
                  onChange({
                    billingMode,
                    periodicPrice: isPriceCustomized ? periodicPrice : nextCalc.suggestedPrice.toFixed(2),
                    pricingRule,
                    isPriceCustomized,
                    suggestedPrice: nextCalc.suggestedPrice,
                    weeklySessionsCount: effectiveWeeklySessions,
                    includedSessionsCount: val,
                    defaultPackageId,
                    defaultBillingDueDay
                  });
                }}
                className="w-full sm:w-48 px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                O valor sugerido multiplicará esta quantidade pelo preço avulso da aula.
              </p>
            </div>
          )}

          {/* Campo de Preço do Período & Dia de Vencimento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-700">
                  Valor por período de cobrança (R$) *
                </label>
                {isPriceCustomized ? (
                  <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full inline-flex items-center gap-1">
                    Personalizado
                  </span>
                ) : (
                  <span className="text-[10px] font-medium text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full inline-flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    Sugerido
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={frequencyActive}
                  value={frequencyActive ? displayCalc.effectivePrice.toFixed(2) : periodicPrice}
                  onChange={(e) => handlePriceManualInput(e.target.value)}
                  placeholder={`Ex: ${calcResult.suggestedPrice.toFixed(2)}`}
                  className={`w-full px-3 py-2 border rounded-lg text-sm bg-white outline-none transition-all ${
                    isPriceCustomized
                      ? 'border-amber-400 focus:ring-2 focus:ring-amber-400'
                      : 'border-gray-300 focus:ring-2 focus:ring-emerald-500'
                  }`}
                />
              </div>

              {frequencyActive && <p className="mt-1 text-xs text-emerald-800">Valor da tabela para {effectiveWeeklySessions}x por semana. Edite os preços no painel abaixo.</p>}

              {/* Botão de recalcular quando personalizado */}
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[11px] text-gray-500">
                  Sugerido: <strong className="text-gray-700">{formatBRL(calcResult.suggestedPrice)}</strong>
                </span>
                {isPriceCustomized && (
                  <button
                    type="button"
                    onClick={handleResetToSuggested}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Recalcular valor sugerido
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Dia padrão de vencimento (opcional)
              </label>
              <input
                type="number"
                min={1}
                max={28}
                value={defaultBillingDueDay}
                onChange={(e) =>
                  onChange({
                    billingMode,
                    periodicPrice,
                    pricingRule,
                    isPriceCustomized,
                    suggestedPrice: calcResult.suggestedPrice,
                    weeklySessionsCount: effectiveWeeklySessions,
                    includedSessionsCount,
                    defaultPackageId,
                    defaultBillingDueDay: e.target.value
                  })
                }
                placeholder="Ex: 10 (1 a 28)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Pode ser ajustado individualmente na contratação do aluno.
              </p>
            </div>
          </div>
        </div>
      )}

      {billingMode === 'package' && (
        <div className="pt-1">
          <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
            <PackageIcon className="w-3.5 h-3.5 text-emerald-600" />
            Pacote de Serviços sugerido (opcional)
          </label>
          <select
            value={defaultPackageId}
            onChange={(e) =>
              onChange({
                billingMode,
                periodicPrice,
                pricingRule,
                isPriceCustomized,
                suggestedPrice: calcResult.suggestedPrice,
                weeklySessionsCount: effectiveWeeklySessions,
                includedSessionsCount,
                defaultPackageId: e.target.value,
                defaultBillingDueDay
              })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
          >
            <option value="">Selecionar automaticamente pacote compatível na agenda</option>
            {availablePackages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name}
                {typeof pkg.total_price === 'number'
                  ? ` — R$ ${Number(pkg.total_price).toFixed(2)}`
                  : typeof pkg.price === 'number'
                    ? ` — R$ ${Number(pkg.price).toFixed(2)}`
                    : ''}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500 mt-1">
            Ao agendar aulas cobertas por pacote existente, nenhuma cobrança avulsa por sessão é gerada.
          </p>
        </div>
      )}

      {allowFrequencyPricing && onFrequencyPricingChange && <ServiceFrequencyPricingPanel value={frequencyPricing} onChange={onFrequencyPricingChange} count={offeredWeeklySessions} billingMode={billingMode} sessionPrice={sessionPrice} pricingRule={pricingRule} />}

      {/* 3. RESUMO FINANCEIRO INTELIGENTE (Card Estruturado) */}
      <div className="rounded-xl border border-emerald-200/90 bg-white p-3.5 shadow-sm space-y-2">
        <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-950">
            <Calculator className="w-4 h-4 text-emerald-600" />
            <span>Resumo comercial — {serviceName || 'Serviço'}</span>
          </div>
          {isPeriodic && (
            <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-medium border border-emerald-200">
              {displayCalc.referenceSessionsText}
            </span>
          )}
        </div>

        {isPeriodic ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
            <div className="bg-slate-50/70 p-2 rounded-lg border border-slate-100">
              <span className="text-[10px] text-gray-500 block">Preço avulso</span>
              <span className="font-semibold text-gray-800">{formatBRL(sessionPrice)}</span>
              <span className="text-[9px] text-gray-400 block mt-0.5">por aula</span>
            </div>

            <div className="bg-slate-50/70 p-2 rounded-lg border border-slate-100">
              <span className="text-[10px] text-gray-500 block">Frequência semanal</span>
              <span className="font-semibold text-gray-800">{effectiveWeeklySessions}x por semana</span>
              <span className="text-[9px] text-gray-400 block mt-0.5">{SERVICE_BILLING_MODE_OPTIONS.find((o) => o.value === billingMode)?.shortPeriod}</span>
            </div>

            <div className="bg-emerald-50/50 p-2 rounded-lg border border-emerald-100">
              <span className="text-[10px] text-emerald-700 block">Valor sugerido</span>
              <span className="font-semibold text-emerald-800">{formatBRL(displayCalc.suggestedPrice)}</span>
              <span className="text-[9px] text-emerald-600 block mt-0.5 truncate">
                {pricingRule === 'annual_average' ? '52 sem/12m' : pricingRule === 'scheduled_sessions' ? 'calendário real' : '4 semanas'}
              </span>
            </div>

            <div className={`p-2 rounded-lg border ${isPriceCustomized ? 'bg-amber-50/50 border-amber-200' : 'bg-emerald-50/50 border-emerald-100'}`}>
              <span className={`text-[10px] block ${isPriceCustomized ? 'text-amber-700' : 'text-emerald-700'}`}>
                {isPriceCustomized ? 'Valor configurado' : 'Valor do plano'}
              </span>
              <span className={`font-semibold ${isPriceCustomized ? 'text-amber-900' : 'text-emerald-900'}`}>
                {formatBRL(displayCalc.effectivePrice)}
              </span>
              <span className={`text-[9px] block mt-0.5 ${isPriceCustomized ? 'text-amber-600' : 'text-emerald-600'}`}>
                {isPriceCustomized ? 'Personalizado' : 'Conforme sugestão'}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-700 py-1">
            <span>Preço cadastrado: </span>
            <strong className="text-gray-900">{formatBRL(sessionPrice)}</strong>
            <span className="text-gray-500"> por atendimento / aula avulsa na agenda.</span>
          </div>
        )}

        {isPeriodic && (
          <div className="pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 text-xs">
            <div className="flex items-center gap-1.5 text-emerald-900 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                Valor médio por aula: <strong className="text-emerald-700">{formatBRL(displayCalc.averagePricePerSession)}</strong>, considerando {displayCalc.referenceSessionsCount} aulas de referência.
              </span>
            </div>
            {displayCalc.discountPercent && displayCalc.discountPercent > 0 ? (
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                Economia de {displayCalc.discountPercent.toLocaleString('pt-BR')}% no plano
              </span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};
