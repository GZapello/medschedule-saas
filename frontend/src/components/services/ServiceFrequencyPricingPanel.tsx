import { Info, Plus, RotateCcw } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { FrequencyPricing, emptyFrequencyPricing, supportsFrequencyPricing } from '../../utils/studioFrequencyPricing';
import { SERVICE_BILLING_MODE_OPTIONS, ServiceBillingMode } from '../../utils/establishmentContext';
import { StudioPricingRule, calculateStudioRecurringPrice, formatBRL } from '../../utils/studioPricing';

const INITIAL_VISIBLE_FREQUENCIES = 5;

function formatDecimalEdit(cents: number): string {
  const reais = cents / 100;
  return reais.toFixed(2).replace('.', ',');
}

function parseBRLInputToCents(raw: string): number | null {
  const cleaned = String(raw || '').replace(/R\$/gi, '').replace(/\s+/g, '').trim();
  if (!cleaned) return null;
  // Support both pt-BR "1.250,50" / "150,50" and dot-decimal "150.55" cleanly
  const hasComma = cleaned.includes(',');
  const normalized = hasComma ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned;
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  const num = Number(normalized);
  if (!Number.isFinite(num) || num <= 0) return null;
  const cents = Math.round(num * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function ServiceFrequencyPricingPanel({
  value,
  onChange,
  count,
  billingMode,
  sessionPrice = 0,
  pricingRule = 'four_weeks'
}: {
  value?: FrequencyPricing | null;
  onChange: (value: FrequencyPricing) => void;
  count: number;
  billingMode: string;
  sessionPrice?: number;
  pricingRule?: StudioPricingRule;
}) {
  const [expanded, setExpanded] = useState(false);
  const [draftInputs, setDraftInputs] = useState<Record<string, string>>({});
  const [extraFrequencies, setExtraFrequencies] = useState<number[]>([]);
  const [nextFrequencyPick, setNextFrequencyPick] = useState<string>('');

  const config = value || emptyFrequencyPricing();
  const supportedMode = supportsFrequencyPricing(billingMode);
  const key = (config.unit === 'per_session' ? 'per_session' : (supportedMode ? billingMode : 'monthly')) as keyof FrequencyPricing['tables'];
  const table: Record<string, number> = config.tables[key] || {};

  const visibleFrequencies = useMemo(() => {
    const baseCount = Math.min(count, INITIAL_VISIBLE_FREQUENCIES);
    const set = new Set<number>(Array.from({ length: baseCount }, (_, idx) => idx + 1));
    for (const freqKey of Object.keys(table)) {
      const n = Number(freqKey);
      if (Number.isInteger(n) && n >= 1 && n <= count) set.add(n);
    }
    for (const freqNum of extraFrequencies) {
      if (freqNum >= 1 && freqNum <= count) set.add(freqNum);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [count, table, extraFrequencies]);

  const remainingFrequencies = useMemo(() => {
    const visibleSet = new Set(visibleFrequencies);
    const list: number[] = [];
    for (let f = 1; f <= count; f++) {
      if (!visibleSet.has(f)) list.push(f);
    }
    return list;
  }, [count, visibleFrequencies]);

  if (!supportedMode) return null;

  const period = SERVICE_BILLING_MODE_OPTIONS.find(option => option.value === billingMode)?.label || billingMode;
  const unit = config.unit === 'per_session' ? 'por aula' : `por período ${period.toLowerCase()}`;
  const stale = Object.values(config.tables).some(entries => Object.keys(entries || {}).some(frequency => Number(frequency) > count));

  const autoAmountForFrequency = (frequency: number): number => {
    const cleanSession = Number(sessionPrice) > 0 ? Number(sessionPrice) : 0;
    if (config.unit === 'per_session') return cleanSession;
    return calculateStudioRecurringPrice({
      sessionPrice: cleanSession,
      weeklySessionsCount: frequency,
      billingMode: billingMode as ServiceBillingMode,
      pricingRule
    }).suggestedPrice;
  };

  const applyCents = (frequency: number, cents: number | null) => {
    const next = { ...table };
    if (cents === null) delete next[frequency];
    else next[frequency] = cents;
    onChange({ ...config, tables: { ...config.tables, [key]: next } });
  };

  const handleInputChange = (frequency: number, raw: string) => {
    const inputKey = `${key}:${frequency}`;
    setDraftInputs(prev => ({ ...prev, [inputKey]: raw }));
    if (!raw.trim()) {
      applyCents(frequency, null);
      return;
    }
    const parsedCents = parseBRLInputToCents(raw);
    if (parsedCents !== null) {
      applyCents(frequency, parsedCents);
    }
  };

  const handleInputBlur = (frequency: number) => {
    const inputKey = `${key}:${frequency}`;
    setDraftInputs(prev => {
      const copy = { ...prev };
      delete copy[inputKey];
      return copy;
    });
  };

  const addFrequency = () => {
    const chosen = Number(nextFrequencyPick) || remainingFrequencies[0];
    if (!chosen || chosen < 1 || chosen > count) return;
    setExtraFrequencies(prev => Array.from(new Set([...prev, chosen])).sort((a, b) => a - b));
    setNextFrequencyPick('');
  };

  return (
    <div className="space-y-3 text-xs">
      {count === 0 && (
        <p className="flex items-start gap-1.5 text-gray-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Configure os dias e horários das aulas para habilitar preços personalizados por frequência.
        </p>
      )}
      {count >= 2 && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="rounded-lg border border-emerald-300 bg-white px-3 py-2 font-semibold text-emerald-800 hover:bg-emerald-50 cursor-pointer"
        >
          Personalizar preços por frequência
        </button>
      )}
      {((count >= 2 && (expanded || config.enabled)) || stale) && (
        <section className="rounded-xl border border-emerald-200 bg-white p-3 space-y-3">
          <div>
            <h4 className="font-semibold text-gray-900">Preços personalizados por frequência semanal</h4>
            <p className="mt-1 text-gray-600">
              Defina valores diferentes para os planos conforme a quantidade de aulas semanais contratadas pelo aluno.
            </p>
          </div>
          <label className="flex items-center gap-2 font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              disabled={count < 2 && !config.enabled}
              onChange={event => onChange({ ...config, enabled: event.target.checked })}
            />
            Ativar preços por frequência
          </label>
          {count < 2 && (
            <p role="status" className="text-amber-800">
              A grade possui {count} encontro(s) semanal(is). Apenas frequências disponíveis podem ser contratadas.
            </p>
          )}
          {stale && (
            <p role="status" className="text-amber-800">
              Há preços salvos para frequências acima da grade atual. Eles foram preservados, mas não serão oferecidos em novas contratações.
            </p>
          )}
          {count >= 2 && (expanded || config.enabled) && (
            <>
              <label className="block font-medium">
                Modalidade do preço personalizado
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-2"
                  value={config.unit}
                  onChange={event => onChange({ ...config, unit: event.target.value as FrequencyPricing['unit'] })}
                >
                  <option value="per_session">Valor por aula</option>
                  <option value="per_period">Valor total por período</option>
                </select>
              </label>
              <p className="text-gray-600">
                {config.unit === 'per_session'
                  ? 'Cada aula usa este valor; o total segue a regra de cálculo selecionada.'
                  : `Total ${period.toLowerCase()}: este valor não será multiplicado pelo número de aulas. Cada periodicidade tem sua própria tabela.`}
              </p>
              <div className="space-y-2">
                {visibleFrequencies.map(frequency => {
                  const inputKey = `${key}:${frequency}`;
                  const hasCustom = table[frequency] !== undefined;
                  const autoVal = autoAmountForFrequency(frequency);
                  const displayValue =
                    draftInputs[inputKey] !== undefined
                      ? draftInputs[inputKey]
                      : hasCustom
                      ? formatDecimalEdit(table[frequency])
                      : '';
                  return (
                    <div
                      key={frequency}
                      className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-2 sm:gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-2"
                    >
                      <div className="flex items-center justify-between sm:block">
                        <span className="font-medium text-gray-800">{frequency}x por semana</span>
                        <span className="block text-[10px] text-gray-500">
                          {hasCustom ? `Personalizado · ${unit}` : autoVal > 0 ? `${formatBRL(autoVal)} — Automático` : 'Automático'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="relative flex-1">
                          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-gray-500">
                            R$
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            aria-label={`${frequency}x por semana — valor ${unit}`}
                            value={displayValue}
                            placeholder={autoVal > 0 ? `${formatDecimalEdit(Math.round(autoVal * 100))} (Automático)` : 'Automático'}
                            onChange={event => handleInputChange(frequency, event.target.value)}
                            onBlur={() => handleInputBlur(frequency)}
                            className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-2 text-xs font-medium text-gray-900 focus:border-emerald-500 focus:outline-none"
                          />
                        </div>
                        {hasCustom && (
                          <button
                            type="button"
                            title="Voltar ao cálculo automático"
                            onClick={() => {
                              setDraftInputs(prev => {
                                const copy = { ...prev };
                                delete copy[inputKey];
                                return copy;
                              });
                              applyCents(frequency, null);
                            }}
                            className="shrink-0 rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 cursor-pointer"
                            aria-label={`Restaurar automático para ${frequency}x por semana`}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {remainingFrequencies.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {remainingFrequencies.length > 1 && (
                    <select
                      aria-label="Selecionar frequência adicional"
                      value={nextFrequencyPick || String(remainingFrequencies[0])}
                      onChange={e => setNextFrequencyPick(e.target.value)}
                      className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700"
                    >
                      {remainingFrequencies.map(f => (
                        <option key={f} value={String(f)}>
                          {f}x por semana
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={addFrequency}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar frequência ({nextFrequencyPick || remainingFrequencies[0]}x)
                  </button>
                </div>
              )}
              <p className="text-gray-500">
                Campos em branco usam o valor automático baseado no preço avulso da aula. Desativar preserva os valores salvos e restaura a cobrança padrão.
              </p>
            </>
          )}
          {Object.keys(table).some(f => Number(f) <= count) && (
            <p className="border-t pt-2 text-emerald-800" aria-live="polite">
              {config.enabled ? 'Preços ativos' : 'Preços salvos (inativos)'}:{' '}
              {Object.entries(table)
                .filter(([f]) => Number(f) <= count)
                .map(([f, cents]) => `${f}x: ${formatBRL(cents / 100)} ${unit}`)
                .join(' · ')}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
