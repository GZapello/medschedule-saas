import React, { useState } from 'react';
import { CalendarRange, Plus, Repeat, X } from 'lucide-react';
import {
  ALL_PLAN_DURATIONS,
  ALL_RECURRENCE_FREQUENCIES,
  dedupeCustomIntervals,
  formatCustomIntervalLabel,
  PLAN_DURATION_LABELS,
  PlanDurationCode,
  RECURRENCE_FREQUENCY_LABELS,
  RECURRENCE_INTERVAL_BOUNDS,
  RecurrenceFrequency,
  RecurrenceIntervalSpec,
  RecurrenceIntervalUnit
} from '../../utils/establishmentContext';

type ConcretePlanDurationCode = Exclude<PlanDurationCode, 'legacy_frequency'>;

interface ServiceRecurrenceConfigPanelProps {
  allowRecurrence: boolean;
  allowedFrequencies: RecurrenceFrequency[];
  defaultFrequency: RecurrenceFrequency;
  customIntervals?: RecurrenceIntervalSpec[];
  defaultCustomInterval?: RecurrenceIntervalSpec | null;
  allowedPlanDurations?: ConcretePlanDurationCode[];
  defaultPlanDuration?: ConcretePlanDurationCode;
  onChange: (next: {
    allowRecurrence: boolean;
    allowedFrequencies: RecurrenceFrequency[];
    defaultFrequency: RecurrenceFrequency;
    customIntervals: RecurrenceIntervalSpec[];
    defaultCustomInterval: RecurrenceIntervalSpec | null;
    allowedPlanDurations: ConcretePlanDurationCode[];
    defaultPlanDuration: ConcretePlanDurationCode;
  }) => void;
}

const FALLBACK_CUSTOM_INTERVAL: RecurrenceIntervalSpec = {
  intervalValue: 3,
  intervalUnit: 'days'
};

const STUDIO_CADENCE_FREQUENCIES: RecurrenceFrequency[] = [
  'weekly',
  'biweekly',
  'custom_weekdays',
  'custom_interval'
];

export const ServiceRecurrenceConfigPanel: React.FC<ServiceRecurrenceConfigPanelProps> = ({
  allowRecurrence,
  allowedFrequencies,
  defaultFrequency,
  customIntervals = [],
  defaultCustomInterval = null,
  allowedPlanDurations = ALL_PLAN_DURATIONS,
  defaultPlanDuration = '1_month',
  onChange
}) => {
  const [draftValue, setDraftValue] = useState<number>(defaultCustomInterval?.intervalValue || customIntervals[0]?.intervalValue || 3);
  const [draftUnit, setDraftUnit] = useState<RecurrenceIntervalUnit>(defaultCustomInterval?.intervalUnit || customIntervals[0]?.intervalUnit || 'days');

  const safeAllowedDurations: ConcretePlanDurationCode[] =
    allowedPlanDurations && allowedPlanDurations.length > 0 ? allowedPlanDurations : [...ALL_PLAN_DURATIONS];
  const safeDefaultDuration: ConcretePlanDurationCode =
    safeAllowedDurations.includes(defaultPlanDuration) ? defaultPlanDuration : safeAllowedDurations[0];

  const emitChange = (next: {
    allowRecurrence: boolean;
    allowedFrequencies: RecurrenceFrequency[];
    defaultFrequency: RecurrenceFrequency;
    customIntervals?: RecurrenceIntervalSpec[];
    defaultCustomInterval?: RecurrenceIntervalSpec | null;
    allowedPlanDurations?: ConcretePlanDurationCode[];
    defaultPlanDuration?: ConcretePlanDurationCode;
  }) => {
    const hasCustom = next.allowedFrequencies.includes('custom_interval');
    const cleanIntervals = hasCustom
      ? dedupeCustomIntervals(
          next.customIntervals && next.customIntervals.length > 0
            ? next.customIntervals
            : (customIntervals.length > 0 ? customIntervals : [FALLBACK_CUSTOM_INTERVAL])
        )
      : [];
    const effDefInterval = hasCustom
      ? (next.defaultCustomInterval &&
          cleanIntervals.some(c => c.intervalValue === next.defaultCustomInterval!.intervalValue && c.intervalUnit === next.defaultCustomInterval!.intervalUnit)
          ? next.defaultCustomInterval
          : cleanIntervals[0] || FALLBACK_CUSTOM_INTERVAL)
      : null;

    const nextDurations =
      next.allowedPlanDurations && next.allowedPlanDurations.length > 0
        ? next.allowedPlanDurations
        : safeAllowedDurations;
    const nextDefDuration =
      next.defaultPlanDuration && nextDurations.includes(next.defaultPlanDuration)
        ? next.defaultPlanDuration
        : (nextDurations.includes(safeDefaultDuration) ? safeDefaultDuration : nextDurations[0]);

    onChange({
      allowRecurrence: next.allowRecurrence,
      allowedFrequencies: next.allowedFrequencies,
      defaultFrequency: next.defaultFrequency,
      customIntervals: cleanIntervals,
      defaultCustomInterval: effDefInterval,
      allowedPlanDurations: nextDurations,
      defaultPlanDuration: nextDefDuration
    });
  };

  const togglePlanDuration = (dur: ConcretePlanDurationCode) => {
    const exists = safeAllowedDurations.includes(dur);
    const nextList = exists
      ? safeAllowedDurations.filter(d => d !== dur)
      : ALL_PLAN_DURATIONS.filter(d => safeAllowedDurations.includes(d) || d === dur);
    if (nextList.length === 0) return; // Mantém ao menos 1 vigência ativa quando recorrência está ligada
    const nextDef = nextList.includes(safeDefaultDuration) ? safeDefaultDuration : nextList[0];
    emitChange({
      allowRecurrence,
      allowedFrequencies,
      defaultFrequency,
      customIntervals,
      defaultCustomInterval,
      allowedPlanDurations: nextList,
      defaultPlanDuration: nextDef
    });
  };

  const toggleFrequency = (freq: RecurrenceFrequency) => {
    const exists = allowedFrequencies.includes(freq);
    const nextAllowed = exists
      ? allowedFrequencies.filter(f => f !== freq)
      : ALL_RECURRENCE_FREQUENCIES.filter(f => allowedFrequencies.includes(f) || f === freq);

    if (nextAllowed.length === 0) {
      emitChange({
        allowRecurrence: false,
        allowedFrequencies: [],
        defaultFrequency: 'weekly',
        customIntervals: [],
        defaultCustomInterval: null
      });
      return;
    }

    const nextDefault = nextAllowed.includes(defaultFrequency) ? defaultFrequency : nextAllowed[0];
    const nextCustomList = nextAllowed.includes('custom_interval')
      ? (customIntervals.length > 0 ? customIntervals : [{ intervalValue: draftValue || 3, intervalUnit: draftUnit }])
      : [];
    emitChange({
      allowRecurrence: true,
      allowedFrequencies: nextAllowed,
      defaultFrequency: nextDefault,
      customIntervals: nextCustomList,
      defaultCustomInterval: defaultCustomInterval || nextCustomList[0] || null
    });
  };

  const clampDraftValue = (val: number, unit: RecurrenceIntervalUnit) => {
    const b = RECURRENCE_INTERVAL_BOUNDS[unit];
    if (!Number.isFinite(val)) return b.min;
    return Math.max(b.min, Math.min(b.max, Math.round(val)));
  };

  const handleAddOrApplyCustomInterval = () => {
    const spec: RecurrenceIntervalSpec = {
      intervalValue: clampDraftValue(draftValue, draftUnit),
      intervalUnit: draftUnit
    };
    const nextAllowed = allowedFrequencies.includes('custom_interval')
      ? allowedFrequencies
      : ALL_RECURRENCE_FREQUENCIES.filter(f => allowedFrequencies.includes(f) || f === 'custom_interval');
    const nextList = dedupeCustomIntervals([...customIntervals, spec]);
    emitChange({
      allowRecurrence: true,
      allowedFrequencies: nextAllowed,
      defaultFrequency: nextAllowed.includes(defaultFrequency) ? defaultFrequency : 'custom_interval',
      customIntervals: nextList,
      defaultCustomInterval: defaultCustomInterval || spec
    });
  };

  const handleRemoveCustomInterval = (spec: RecurrenceIntervalSpec) => {
    const nextList = customIntervals.filter(
      c => !(c.intervalValue === spec.intervalValue && c.intervalUnit === spec.intervalUnit)
    );
    if (nextList.length === 0) {
      // Se remover o último intervalo salvo, desmarca custom_interval se houver outras opções, senão mantém fallback
      const remainingFreqs: RecurrenceFrequency[] = allowedFrequencies.filter(f => f !== 'custom_interval');
      if (remainingFreqs.length > 0) {
        emitChange({
          allowRecurrence: true,
          allowedFrequencies: remainingFreqs,
          defaultFrequency: remainingFreqs.includes(defaultFrequency) ? defaultFrequency : remainingFreqs[0],
          customIntervals: [],
          defaultCustomInterval: null
        });
      } else {
        emitChange({
          allowRecurrence: true,
          allowedFrequencies: ['custom_interval'],
          defaultFrequency: 'custom_interval',
          customIntervals: [FALLBACK_CUSTOM_INTERVAL],
          defaultCustomInterval: FALLBACK_CUSTOM_INTERVAL
        });
      }
      return;
    }
    const nextDef =
      defaultCustomInterval &&
      defaultCustomInterval.intervalValue === spec.intervalValue &&
      defaultCustomInterval.intervalUnit === spec.intervalUnit
        ? nextList[0]
        : defaultCustomInterval;
    emitChange({
      allowRecurrence: true,
      allowedFrequencies,
      defaultFrequency,
      customIntervals: nextList,
      defaultCustomInterval: nextDef
    });
  };

  const customEnabled = allowRecurrence && allowedFrequencies.includes('custom_interval');
  const activeUnitBounds = RECURRENCE_INTERVAL_BOUNDS[draftUnit];

  return (
    <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="font-bold text-slate-800 text-[11px] flex items-center gap-1.5">
          <Repeat className="w-3.5 h-3.5 text-teal-600" />
          Recorrência do Serviço
        </div>
        <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={!allowRecurrence}
            onChange={e => {
              const noRecurrence = e.target.checked;
              if (noRecurrence) {
                emitChange({
                  allowRecurrence: false,
                  allowedFrequencies: [],
                  defaultFrequency: 'weekly',
                  customIntervals: [],
                  defaultCustomInterval: null
                });
              } else {
                const seeded = allowedFrequencies.length > 0 ? allowedFrequencies : ['weekly' as RecurrenceFrequency];
                emitChange({
                  allowRecurrence: true,
                  allowedFrequencies: seeded,
                  defaultFrequency: seeded.includes(defaultFrequency) ? defaultFrequency : seeded[0],
                  customIntervals: customIntervals.length > 0 ? customIntervals : [FALLBACK_CUSTOM_INTERVAL],
                  defaultCustomInterval: defaultCustomInterval || customIntervals[0] || FALLBACK_CUSTOM_INTERVAL
                });
              }
            }}
            className="w-3.5 h-3.5 rounded text-slate-600 border-slate-300"
          />
          <span>Sem recorrência</span>
        </label>
      </div>

      {allowRecurrence && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-slate-700">1. Frequência das aulas (ritmo na semana/intervalo):</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-1.5">
              {STUDIO_CADENCE_FREQUENCIES.map(freq => {
                const checked = allowedFrequencies.includes(freq);
                return (
                  <label
                    key={freq}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors ${
                      checked
                        ? 'border-teal-500 bg-teal-50/70 text-teal-900'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleFrequency(freq)}
                      className="w-3.5 h-3.5 rounded text-teal-600 border-slate-300"
                    />
                    <span>{RECURRENCE_FREQUENCY_LABELS[freq]}</span>
                  </label>
                );
              })}
            </div>

            {/* Opções de intervalo legado mantidas somente se já estiverem configuradas ou para compatibilidade */}
            {ALL_RECURRENCE_FREQUENCIES.some(f => !STUDIO_CADENCE_FREQUENCIES.includes(f) && allowedFrequencies.includes(f)) && (
              <div className="pt-1 space-y-1">
                <div className="text-[10px] font-semibold text-amber-700">
                  Intervalos entre sessões (compatibilidade legado):
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {ALL_RECURRENCE_FREQUENCIES.filter(f => !STUDIO_CADENCE_FREQUENCIES.includes(f) && allowedFrequencies.includes(f)).map(freq => (
                    <label
                      key={freq}
                      className="flex items-center gap-2 px-2 py-1 rounded-lg border border-amber-300 bg-amber-50/60 text-amber-900 text-[10px] font-semibold cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked
                        onChange={() => toggleFrequency(freq)}
                        className="w-3 h-3 rounded text-amber-600 border-amber-300"
                      />
                      <span>{RECURRENCE_FREQUENCY_LABELS[freq]}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {customEnabled && (
            <div className="p-2.5 bg-teal-50/50 border border-teal-200 rounded-xl space-y-2">
              <div className="text-[11px] font-bold text-teal-950">Intervalo personalizado sugerido</div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-slate-600 font-medium">Repetir a cada</span>
                <input
                  type="number"
                  min={activeUnitBounds.min}
                  max={activeUnitBounds.max}
                  value={draftValue}
                  onChange={e => setDraftValue(clampDraftValue(Number(e.target.value) || activeUnitBounds.min, draftUnit))}
                  className="w-16 border border-teal-300 rounded-lg px-2 py-1 text-center font-bold bg-white text-slate-800"
                  aria-label="Quantidade do intervalo personalizado"
                />
                <select
                  value={draftUnit}
                  onChange={e => {
                    const nextUnit = e.target.value as RecurrenceIntervalUnit;
                    setDraftUnit(nextUnit);
                    setDraftValue(prev => clampDraftValue(prev, nextUnit));
                  }}
                  className="border border-teal-300 rounded-lg px-2 py-1 font-semibold bg-white text-slate-800"
                  aria-label="Unidade do intervalo personalizado"
                >
                  <option value="days">Dias (1–365)</option>
                  <option value="weeks">Semanas (1–52)</option>
                  <option value="months">Meses (1–24)</option>
                </select>
                <button
                  type="button"
                  onClick={handleAddOrApplyCustomInterval}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  Adicionar opção
                </button>
              </div>
              {customIntervals.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {customIntervals.map(spec => {
                    const key = `${spec.intervalValue}:${spec.intervalUnit}`;
                    const isDef =
                      defaultCustomInterval?.intervalValue === spec.intervalValue &&
                      defaultCustomInterval?.intervalUnit === spec.intervalUnit;
                    return (
                      <span
                        key={key}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${
                          isDef
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'bg-white text-teal-800 border-teal-300'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            emitChange({
                              allowRecurrence: true,
                              allowedFrequencies,
                              defaultFrequency: 'custom_interval',
                              customIntervals,
                              defaultCustomInterval: spec
                            })
                          }
                          className="cursor-pointer"
                          title="Definir como padrão personalizado"
                        >
                          {formatCustomIntervalLabel(spec)}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomInterval(spec)}
                          className="opacity-80 hover:opacity-100 cursor-pointer"
                          aria-label={`Remover ${formatCustomIntervalLabel(spec)}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="text-[10px] text-teal-800/80">
                Ao autorizar "Personalizada", o agendamento respeitará exclusivamente os dias e horários válidos do serviço e do instrutor.
              </div>
            </div>
          )}

          {allowedFrequencies.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block font-semibold text-slate-700 mb-1 text-[11px]">
                  Frequência padrão
                </label>
                <select
                  value={allowedFrequencies.includes(defaultFrequency) ? defaultFrequency : allowedFrequencies[0]}
                  onChange={e =>
                    emitChange({
                      allowRecurrence: true,
                      allowedFrequencies,
                      defaultFrequency: e.target.value as RecurrenceFrequency,
                      customIntervals,
                      defaultCustomInterval
                    })
                  }
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 font-semibold text-slate-800"
                >
                  {allowedFrequencies.map(freq => (
                    <option key={freq} value={freq}>
                      {RECURRENCE_FREQUENCY_LABELS[freq]}
                    </option>
                  ))}
                </select>
              </div>
              {customEnabled && defaultFrequency === 'custom_interval' && customIntervals.length > 0 && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1 text-[11px]">
                    Intervalo personalizado padrão
                  </label>
                  <select
                    value={
                      defaultCustomInterval
                        ? `${defaultCustomInterval.intervalValue}:${defaultCustomInterval.intervalUnit}`
                        : `${customIntervals[0].intervalValue}:${customIntervals[0].intervalUnit}`
                    }
                    onChange={e => {
                      const [vStr, uStr] = e.target.value.split(':');
                      const matched = customIntervals.find(
                        c => c.intervalValue === Number(vStr) && c.intervalUnit === uStr
                      );
                      if (matched) {
                        emitChange({
                          allowRecurrence: true,
                          allowedFrequencies,
                          defaultFrequency: 'custom_interval',
                          customIntervals,
                          defaultCustomInterval: matched
                        });
                      }
                    }}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 font-semibold text-slate-800"
                  >
                    {customIntervals.map(spec => {
                      const key = `${spec.intervalValue}:${spec.intervalUnit}`;
                      return (
                        <option key={key} value={key}>
                          {formatCustomIntervalLabel(spec)}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Durações / Vigências de plano permitidas (separadas da frequência das aulas) */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
              <CalendarRange className="w-3.5 h-3.5 text-teal-600" />
              <span>2. Duração / Vigência do plano autorizada:</span>
            </div>
            <p className="text-[10px] text-slate-500">
              Define por quanto tempo a série semanal continua sendo gerada (ex: Mensal, Trimestral, Semestral ou Anual).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {ALL_PLAN_DURATIONS.map(dur => {
                const checked = safeAllowedDurations.includes(dur);
                return (
                  <label
                    key={dur}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors ${
                      checked
                        ? 'border-indigo-500 bg-indigo-50/60 text-indigo-900'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePlanDuration(dur)}
                      className="w-3.5 h-3.5 rounded text-indigo-600 border-slate-300"
                    />
                    <span>{PLAN_DURATION_LABELS[dur]}</span>
                  </label>
                );
              })}
            </div>
            <div className="max-w-xs">
              <label className="block font-semibold text-slate-700 mb-1 text-[11px]">
                Duração padrão do plano
              </label>
              <select
                value={safeDefaultDuration}
                onChange={e =>
                  emitChange({
                    allowRecurrence: true,
                    allowedFrequencies,
                    defaultFrequency,
                    customIntervals,
                    defaultCustomInterval,
                    allowedPlanDurations: safeAllowedDurations,
                    defaultPlanDuration: e.target.value as ConcretePlanDurationCode
                  })
                }
                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 font-semibold text-slate-800"
              >
                {safeAllowedDurations.map(dur => (
                  <option key={dur} value={dur}>
                    {PLAN_DURATION_LABELS[dur]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
