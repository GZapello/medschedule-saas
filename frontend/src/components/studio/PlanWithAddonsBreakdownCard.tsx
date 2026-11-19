import React from 'react';
import {
  PlanWithAddonsBreakdown,
  ADDON_SCHEDULE_TIMING_LABELS
} from '../../utils/studioAccessAndCommercial';

interface PlanWithAddonsBreakdownCardProps {
  breakdown: PlanWithAddonsBreakdown;
  baseName: string;
  hideFinancial?: boolean;
  compact?: boolean;
}

const fmtCurrency = (cents: number) =>
  (Math.round(Number(cents || 0)) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

export const PlanWithAddonsBreakdownCard: React.FC<PlanWithAddonsBreakdownCardProps> = ({
  breakdown,
  baseName,
  hideFinancial = false,
  compact = false
}) => {
  return (
    <div className={`rounded-2xl border border-teal-200 bg-teal-50/40 ${compact ? 'p-3 space-y-2' : 'p-4 space-y-3'} text-xs`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-200/60 pb-2">
        <span className="font-bold text-slate-900 uppercase tracking-wide text-[11px]">
          Resumo comercial combinado
        </span>
        {!hideFinancial && breakdown.totalAddonDiscountCents > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[10px]">
            Economia no combo: -{fmtCurrency(breakdown.totalAddonDiscountCents)}
          </span>
        )}
      </div>

      {/* Plano-base */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-bold text-slate-900">Plano-base: {baseName}</div>
          <div className="text-[11px] text-slate-600">
            {breakdown.base.label ? `${breakdown.base.label} • ` : ''}
            {breakdown.base.contractMonths} {breakdown.base.contractMonths === 1 ? 'mês' : 'meses'}
          </div>
        </div>
        {!hideFinancial && (
          <div className="text-right font-bold text-slate-800 shrink-0">
            {fmtCurrency(breakdown.base.cycleAmountCents)}
            <span className="block text-[10px] font-normal text-slate-500">
              {breakdown.base.paymentPeriodicity === 'one_time' ? 'à vista' : 'por ciclo base'}
            </span>
          </div>
        )}
      </div>

      {/* Complementos opcionais selecionados */}
      {breakdown.addons.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-teal-200/50">
          {breakdown.addons.map((addon) => (
            <div key={addon.optionId} className="flex items-start justify-between gap-2 bg-white/80 rounded-xl px-2.5 py-2 border border-teal-100">
              <div className="space-y-0.5">
                <div className="font-bold text-slate-900">
                  + {addon.label}
                </div>
                <div className="text-[11px] text-slate-600 flex flex-wrap gap-1.5">
                  {addon.creditMode === 'weekly_guaranteed' ? (
                    <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold">
                      {addon.frequencyCount ? `${addon.frequencyCount}x/sem • ` : ''}Frequência semanal garantida
                    </span>
                  ) : addon.creditsPerCycle !== null ? (
                    <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold">
                      {addon.creditsPerCycle} aula(s)/ciclo (créditos fixos)
                    </span>
                  ) : null}
                  {addon.frequencyType === 'unlimited' && (
                    <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold">
                      Frequência ilimitada
                    </span>
                  )}
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                    {addon.durationMonths} {addon.durationMonths === 1 ? 'mês' : 'meses'}
                    {addon.isIndependentDuration ? ' (duração independente)' : ' (segue plano-base)'}
                    {' '}• {addon.autoRenew ? 'Com renovação' : 'Sem renovação auto'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500">
                  {ADDON_SCHEDULE_TIMING_LABELS[addon.scheduleTiming] || addon.scheduleTiming}
                </div>
              </div>
              {!hideFinancial && (
                <div className="text-right shrink-0">
                  {addon.discountCents > 0 && (
                    <div className="text-[10px] text-slate-400 line-through">
                      {fmtCurrency(addon.grossPriceCents)}
                    </div>
                  )}
                  <div className="font-bold text-teal-800">
                    +{fmtCurrency(addon.netPriceCents)}
                  </div>
                  <div className="text-[10px] text-slate-500">{addon.effectivePeriodicityLabel}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Consolidação financeira discriminada sem nunca misturar periodicidades diferentes */}
      {!hideFinancial && (
        <div className="pt-2 border-t border-teal-200/70 space-y-1.5">
          {breakdown.consolidatedMonthlyCents !== null && (
            <div className="flex items-center justify-between gap-2 font-extrabold text-sm text-teal-900 bg-white rounded-xl px-3 py-2 border border-teal-200">
              <span>Total mensal consolidado</span>
              <span>{fmtCurrency(breakdown.consolidatedMonthlyCents)}/mês</span>
            </div>
          )}

          {(breakdown.hasMixedPeriodicities || breakdown.consolidatedMonthlyCents === null) && (
            <div className="space-y-1 bg-white/90 rounded-xl px-3 py-2 border border-slate-200">
              <div className="text-[10px] font-bold uppercase text-slate-500">
                Cobranças discriminadas por periodicidade
              </div>
              {breakdown.recurringSchedules.map((rs) => (
                <div key={rs.periodicity} className="flex items-center justify-between gap-2 text-xs text-slate-800">
                  <span>{rs.periodicityLabel} ({rs.itemLabels.join(' + ')})</span>
                  <span className="font-bold text-slate-900">{fmtCurrency(rs.totalCycleAmountCents)}</span>
                </div>
              ))}
              {breakdown.oneTimeCharges.map((ot) => (
                <div key={ot.optionId} className="flex items-center justify-between gap-2 text-xs text-slate-800">
                  <span>Pagamento único: {ot.label}</span>
                  <span className="font-bold text-slate-900">{fmtCurrency(ot.netCents)}</span>
                </div>
              ))}
              {breakdown.base.paymentPeriodicity === 'one_time' && (
                <div className="flex items-center justify-between gap-2 text-xs text-slate-800">
                  <span>Plano-base (Pagamento integral)</span>
                  <span className="font-bold text-slate-900">{fmtCurrency(breakdown.base.totalContractAmountCents)}</span>
                </div>
              )}
              {breakdown.base.paymentPeriodicity === 'installments' && (
                <div className="flex items-center justify-between gap-2 text-xs text-slate-800">
                  <span>Plano-base ({breakdown.base.installmentsCount}x parcelas)</span>
                  <span className="font-bold text-slate-900">
                    {breakdown.base.installmentsCount}x de {fmtCurrency(breakdown.base.installmentAmountCents)}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-700 px-1">
            <span>
              <strong>1ª cobrança inicial:</strong> {fmtCurrency(breakdown.firstChargeDueCents)}
            </span>
            {breakdown.totalContractAmountCents !== breakdown.firstChargeDueCents && (
              <span>
                <strong>Total estimado no período:</strong> {fmtCurrency(breakdown.totalContractAmountCents)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
