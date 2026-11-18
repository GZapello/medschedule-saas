import React from 'react';
import { Check, Sparkles } from 'lucide-react';
import {
  ADDON_BILLING_PERIODICITY_LABELS,
  ADDON_SCHEDULE_TIMING_LABELS,
  StudioOptionalAddonOption,
  StudioOptionalAddonsConfig
} from '../../utils/studioAccessAndCommercial';

interface OptionalAddonsSelectorProps {
  config: StudioOptionalAddonsConfig;
  availableOptions: StudioOptionalAddonOption[];
  selectedIds: string[];
  onChange: (nextIds: string[]) => void;
  compact?: boolean;
}

const fmtCurrency = (cents: number) =>
  (Math.round(Number(cents || 0)) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

export const OptionalAddonsSelector: React.FC<OptionalAddonsSelectorProps> = ({
  config,
  availableOptions,
  selectedIds,
  onChange,
  compact = false
}) => {
  if (!config.enabled || availableOptions.length === 0) {
    return null;
  }

  const toggleOption = (optionId: string) => {
    if (config.allowMultiple) {
      if (selectedIds.includes(optionId)) {
        onChange(selectedIds.filter((id) => id !== optionId));
      } else {
        onChange([...selectedIds, optionId]);
      }
      return;
    }
    if (selectedIds.includes(optionId)) {
      onChange([]);
    } else {
      onChange([optionId]);
    }
  };

  return (
    <div className={`${compact ? 'p-3' : 'p-4'} rounded-2xl border border-indigo-200/80 bg-indigo-50/30 space-y-2.5`}>
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <Sparkles className="w-4 h-4 text-teal-600 shrink-0" />
            <span>{config.promptTitle || 'Deseja adicionar acompanhamento personalizado?'}</span>
          </div>
          <p className="text-[11px] text-slate-600">
            {config.allowMultiple
              ? 'Selecione nenhum ou quantos complementos opcionais desejar combinar ao plano.'
              : 'Escolha opcional: você pode contratar apenas o plano ou incluir um complemento abaixo.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {/* Opção explícita de não adicionar */}
        <button
          type="button"
          onClick={() => onChange([])}
          className={`w-full p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
            selectedIds.length === 0
              ? 'border-teal-600 bg-teal-50/80 ring-2 ring-teal-500/20'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span
              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                selectedIds.length === 0
                  ? 'border-teal-600 bg-teal-600 text-white'
                  : 'border-slate-300 bg-white'
              }`}
            >
              {selectedIds.length === 0 && <Check className="w-2.5 h-2.5" />}
            </span>
            <span className="text-xs font-bold text-slate-800">
              {config.noAddonLabel || 'Não adicionar'}
            </span>
          </div>
          <span className="text-[11px] font-semibold text-slate-500">Somente plano-base</span>
        </button>

        {/* Opções configuradas */}
        {availableOptions.map((opt) => {
          const isSelected = selectedIds.includes(opt.id);
          const discountCents =
            opt.comboDiscountType === 'fixed_cents'
              ? Math.min(opt.additionalPriceCents, opt.comboDiscountValue)
              : opt.comboDiscountType === 'percentage'
                ? Math.round((opt.additionalPriceCents * Math.min(100, opt.comboDiscountValue)) / 100)
                : 0;
          const netCents = Math.max(0, opt.additionalPriceCents - discountCents);
          const periodLabel = ADDON_BILLING_PERIODICITY_LABELS[opt.billingPeriodicity] || opt.billingPeriodicity;

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggleOption(opt.id)}
              className={`w-full p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start justify-between gap-3 ${
                isSelected
                  ? 'border-teal-600 bg-white ring-2 ring-teal-500/20'
                  : 'border-slate-200 bg-white hover:border-teal-300'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <span
                  className={`mt-0.5 w-4 h-4 ${config.allowMultiple ? 'rounded' : 'rounded-full'} border flex items-center justify-center shrink-0 ${
                    isSelected
                      ? 'border-teal-600 bg-teal-600 text-white'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {isSelected && <Check className="w-2.5 h-2.5" />}
                </span>
                <div className="min-w-0 space-y-0.5">
                  <div className="text-xs font-bold text-slate-900 flex flex-wrap items-center gap-1.5">
                    <span>{opt.label}</span>
                    {discountCents > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                        -{fmtCurrency(discountCents)} no combo
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-600 flex flex-wrap gap-1.5">
                    {opt.addonServiceName && <span>{opt.addonServiceName}</span>}
                    {opt.creditsPerCycle !== null && opt.creditsPerCycle > 0 && (
                      <span>• {opt.creditsPerCycle} aula(s) por ciclo</span>
                    )}
                    {opt.frequencyType === 'unlimited' && <span>• Frequência ilimitada</span>}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {ADDON_SCHEDULE_TIMING_LABELS[opt.scheduleTiming] || ''}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                {discountCents > 0 && (
                  <div className="text-[10px] text-slate-400 line-through">
                    +{fmtCurrency(opt.additionalPriceCents)}
                  </div>
                )}
                <div className="text-sm font-extrabold text-teal-800">
                  +{fmtCurrency(netCents)}
                </div>
                <div className="text-[10px] text-slate-500">{periodLabel}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
