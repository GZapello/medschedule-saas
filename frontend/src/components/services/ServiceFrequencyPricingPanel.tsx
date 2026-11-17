import { Info } from 'lucide-react';
import React, { useState } from 'react';
import { FrequencyPricing, emptyFrequencyPricing, supportsFrequencyPricing } from '../../utils/studioFrequencyPricing';
import { SERVICE_BILLING_MODE_OPTIONS } from '../../utils/establishmentContext';
import { formatBRL } from '../../utils/studioPricing';

export function ServiceFrequencyPricingPanel({ value, onChange, count, billingMode }: {
  value?: FrequencyPricing | null; onChange: (value: FrequencyPricing) => void; count: number; billingMode: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!supportsFrequencyPricing(billingMode)) return null;
  const config = value || emptyFrequencyPricing();
  const key = config.unit === 'per_session' ? 'per_session' : billingMode;
  const table = config.tables[key] || {};
  const period = SERVICE_BILLING_MODE_OPTIONS.find(option => option.value === billingMode)?.label || billingMode;
  const unit = config.unit === 'per_session' ? 'por aula' : `por período ${period.toLowerCase()}`;
  const stale = Object.values(config.tables).some(entries => Object.keys(entries || {}).some(frequency => Number(frequency) > count));
  const changePrice = (frequency: number, raw: string) => {
    const next = { ...table };
    if (!raw) delete next[frequency];
    else next[frequency] = Math.round(Number(raw) * 100);
    onChange({ ...config, tables: { ...config.tables, [key]: next } });
  };
  return <div className="space-y-3 text-xs">
    {count < 2 && <p className="flex items-start gap-1.5 text-gray-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Configure pelo menos duas aulas semanais na grade para habilitar preços personalizados por frequência.</p>}
    {count >= 2 && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}
      className="rounded-lg border border-emerald-300 bg-white px-3 py-2 font-semibold text-emerald-800 hover:bg-emerald-50">
      Personalizar preços por frequência
    </button>}
    {(expanded || config.enabled || stale) && <section className="rounded-xl border border-emerald-200 bg-white p-3 space-y-3">
      <div><h4 className="font-semibold text-gray-900">Preços personalizados por frequência semanal</h4>
        <p className="mt-1 text-gray-600">Defina valores diferentes para os planos conforme a quantidade de aulas semanais contratadas pelo aluno.</p></div>
      <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={config.enabled} disabled={count < 2 && !config.enabled}
        onChange={event => onChange({ ...config, enabled: event.target.checked })} />Ativar preços por frequência</label>
      {count < 2 && <p role="status" className="text-amber-800">A grade possui {count} encontro(s) semanal(is). Apenas frequências disponíveis podem ser contratadas.</p>}
      {stale && <p role="status" className="text-amber-800">Há preços salvos para frequências acima da grade atual. Eles foram preservados, mas não serão oferecidos em novas contratações.</p>}
      {count >= 2 && (expanded || config.enabled) && <>
        <label className="block font-medium">Modalidade do preço personalizado
          <select className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-2" value={config.unit}
            onChange={event => onChange({ ...config, unit: event.target.value as FrequencyPricing['unit'] })}>
            <option value="per_session">Valor por aula</option><option value="per_period">Valor total por período</option>
          </select>
        </label>
        <p className="text-gray-600">{config.unit === 'per_session' ? 'Cada aula usa este valor; o total segue a regra de cálculo selecionada.' : `Total ${period.toLowerCase()}: este valor não será multiplicado pelo número de aulas. Cada periodicidade tem sua própria tabela.`}</p>
        <div className="space-y-2">
          {Array.from({ length: count }, (_, index) => index + 1).map(frequency => <label key={frequency} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3">
            <span className="font-medium">{frequency}x por semana</span>
            <span><input type="number" min="0.01" step="0.01" inputMode="decimal" aria-label={`${frequency}x por semana — valor ${unit}`}
              value={table[frequency] === undefined ? '' : table[frequency] / 100} placeholder="Automático"
              onChange={event => changePrice(frequency, event.target.value)} className="w-full rounded-lg border border-gray-300 p-2" />
              <span className="mt-0.5 block text-[10px] text-gray-500">R$ {unit}</span></span>
          </label>)}
        </div>
        <p className="text-gray-500">Campos vazios usam o cálculo automático para a frequência contratada. Desativar preserva os valores preenchidos e restaura a cobrança padrão.</p>
      </>}
      {Object.keys(table).some(f => Number(f) <= count) && <p className="border-t pt-2 text-emerald-800" aria-live="polite">
        {config.enabled ? 'Preços ativos' : 'Preços salvos (inativos)'}: {Object.entries(table).filter(([f]) => Number(f) <= count).map(([f, cents]) => `${f}x: ${formatBRL(cents / 100)} ${unit}`).join(' · ')}
      </p>}
    </section>}
  </div>;
}
