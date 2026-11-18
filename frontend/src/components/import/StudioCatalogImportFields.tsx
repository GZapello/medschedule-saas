import React from 'react';
import { AlertTriangle, Check, Plus, Trash2 } from 'lucide-react';
import type { ProposedPrice, ProposedService } from '../../types/studioCatalogImport';

export type Option = readonly [string, string];
const fieldClass = 'w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';

export const DURATION_MONTHS: Record<string, number> = {
  '1_month': 1, '2_months': 2, '3_months': 3, '6_months': 6, '12_months': 12, '24_months': 24
};

export const emptyPrice: ProposedPrice = {
  label: '', amountCents: null, unit: null, paymentPeriod: null, duration: null,
  frequencyType: null, frequencyCount: null, installments: null, participants: null,
  isMonthlyEquivalent: false, equivalentMonthlyCents: null, maxInstallments: null, ambiguousReason: '',
  sources: [], evidence: ''
};
export const emptySchedule: ProposedService['schedules'][number] = {
  dayOfWeek: null, startTime: '', endTime: '', capacity: null, professionalName: '', professionalId: '', sources: [], evidence: ''
};
export const emptyAdjustment: ProposedService['adjustments'][number] = {
  label: '', adjustmentType: null, valueType: null, amount: null, incidence: null, weekdays: [],
  startTime: '', endTime: '', evidence: '', sources: []
};
export const types = [
  ['access_unlimited', 'Acesso livre'], ['access_limited', 'Acesso limitado'], ['individual', 'Individual'],
  ['duo', 'Dupla'], ['group', 'Turma coletiva'], ['deliverable', 'Entregável sem agendamento']
] as const;
export const modalities = [['presential', 'Presencial'], ['online', 'Online'], ['home', 'Domiciliar'], ['both', 'Presencial e online']] as const;
export const units = [
  ['per_session', 'Por aula'], ['per_participant', 'Por participante'], ['per_month', 'Por mês'],
  ['per_cycle', 'Por ciclo de cobrança'], ['contract_total', 'Total do contrato']
] as const;
export const periodicities = [
  ['one_time', 'À vista'], ['monthly', 'Mensal'], ['bimonthly', 'Bimestral'], ['quarterly', 'Trimestral'],
  ['semiannual', 'Semestral'], ['annual', 'Anual'], ['installments', 'Parcelada']
] as const;
export const durations = [
  ['1_month', '1 mês'], ['2_months', '2 meses'], ['3_months', '3 meses'], ['6_months', '6 meses'],
  ['12_months', '12 meses'], ['24_months', '24 meses']
] as const;
export const frequencies = [
  ['weekly', 'Por semana'], ['monthly', 'Por mês'], ['unlimited', 'Ilimitada'], ['fixed_count', 'Quantidade fixa']
] as const;
export const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((name, i) => [String(i), name] as const);

export const formatMoneyBrl = (cents: number | null | undefined) =>
  typeof cents === 'number' && Number.isFinite(cents)
    ? (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—';

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0 space-y-1 text-xs font-semibold text-slate-700"><span>{label}</span>{children}</label>;
}

export function TextField({ label, value, onChange, multiline, type = 'text', placeholder }: {
  label: string; value: string; onChange: (value: string) => void; multiline?: boolean; type?: 'text' | 'time'; placeholder?: string;
}) {
  return <Field label={label}>{multiline
    ? <textarea className={fieldClass} rows={2} maxLength={2000} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    : <input className={fieldClass} type={type} maxLength={180} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />}
  </Field>;
}

export function NumberField({ label, value, onChange, min = 1, max, step = 1, placeholder }: {
  label: string; value: number | null; onChange: (value: number | null) => void; min?: number; max?: number; step?: number; placeholder?: string;
}) {
  return <Field label={label}><input className={fieldClass} type="number" min={min} max={max} step={step} placeholder={placeholder}
    value={value ?? ''} onChange={e => onChange(e.target.value === '' ? null : e.target.valueAsNumber)} /></Field>;
}

export function SelectField<T extends string>({ label, options, value, onChange, placeholder = 'Selecione' }: {
  label: string; options: readonly (readonly [T, string])[]; value: T | null; onChange: (value: T | null) => void; placeholder?: string;
}) {
  return <Field label={label}><select className={fieldClass} value={value ?? ''}
    onChange={e => onChange((e.target.value || null) as T | null)}>
    <option value="">{placeholder}</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
  </select></Field>;
}

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-slate-700">
    <input className="h-4 w-4 shrink-0 accent-indigo-600" type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />{label}
  </label>;
}

export function Editors<T>({ title, rows, blank, onChange, render, noun, max = 30, emptyMessage }: {
  title: string; noun: string; rows: T[]; blank: T; max?: number; emptyMessage?: string;
  onChange: (value: T[]) => void; render: (value: T, change: (patch: Partial<T>) => void, index: number) => React.ReactNode;
}) {
  return <fieldset className="min-w-0 space-y-2.5">
    <legend className="text-xs font-bold uppercase tracking-wide text-slate-700">{title}</legend>
    {rows.length === 0 && emptyMessage && (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">{emptyMessage}</p>
    )}
    {rows.map((row, i) => <div key={i} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-600">{noun} {i + 1}</span>
        <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-100 hover:text-rose-700 cursor-pointer"
          aria-label={'Remover ' + noun.toLowerCase() + ' ' + (i + 1)}
          onClick={() => onChange(rows.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></button>
      </div>
      {render(row, patch => onChange(rows.map((old, k) => k === i ? { ...old, ...patch } : old)), i)}
    </div>)}
    {rows.length < max && <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 cursor-pointer"
      onClick={() => onChange([...rows, { ...blank }])}><Plus className="h-3.5 w-3.5" />Adicionar {noun.toLowerCase()}</button>}
  </fieldset>;
}

export function PriceFields({ price, onChange, packagePrice }: {
  price: ProposedPrice; onChange: (patch: Partial<ProposedPrice>) => void; packagePrice?: boolean;
}) {
  const months = price.duration ? DURATION_MONTHS[price.duration] || 1 : 1;
  const needsMonthlyVsTotalHelper = Boolean(
    price.amountCents &&
    months > 1 &&
    (price.isMonthlyEquivalent || !price.unit || (price.unit === 'per_month' && price.paymentPeriod && price.paymentPeriod !== 'monthly'))
  );

  return <div className="space-y-2.5">
    {(price.ambiguousReason || needsMonthlyVsTotalHelper) && (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-950 space-y-2">
        <div className="flex items-start gap-1.5 font-semibold">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-700" />
          <span>{price.ambiguousReason || 'Confirme a interpretação financeira deste valor antes de importar.'}</span>
        </div>
        {needsMonthlyVsTotalHelper && price.amountCents && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onChange({
                unit: 'per_month',
                paymentPeriod: 'monthly',
                isMonthlyEquivalent: false,
                ambiguousReason: ''
              })}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-100 cursor-pointer"
            >
              <Check className="h-3 w-3" />
              Confirmar como {formatMoneyBrl(price.amountCents)}/mês (mensalidade)
            </button>
            <button
              type="button"
              onClick={() => onChange({
                unit: 'contract_total',
                paymentPeriod: price.maxInstallments && price.maxInstallments > 1 ? 'installments' : 'one_time',
                installments: price.maxInstallments && price.maxInstallments > 1 ? price.maxInstallments : null,
                isMonthlyEquivalent: false,
                equivalentMonthlyCents: price.amountCents,
                amountCents: (price.amountCents || 0) * months,
                ambiguousReason: ''
              })}
              className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-900 hover:bg-indigo-100 cursor-pointer"
            >
              <Check className="h-3 w-3" />
              Multiplicar {months} meses → Total {formatMoneyBrl((price.amountCents || 0) * months)}
            </button>
            <button
              type="button"
              onClick={() => onChange({
                unit: 'contract_total',
                paymentPeriod: price.maxInstallments && price.maxInstallments > 1 ? 'installments' : 'one_time',
                installments: price.maxInstallments && price.maxInstallments > 1 ? price.maxInstallments : null,
                isMonthlyEquivalent: false,
                ambiguousReason: ''
              })}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-900 hover:bg-emerald-100 cursor-pointer"
            >
              <Check className="h-3 w-3" />
              Manter {formatMoneyBrl(price.amountCents)} como Total do contrato
            </button>
          </div>
        )}
      </div>
    )}

    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {!packagePrice && <TextField label="Nome do plano ou opção" value={price.label} placeholder="Ex.: Trimestral 3x/sem" onChange={label => onChange({ label })} />}
      <NumberField label="Valor informado (R$)" step={0.01} min={0.01} max={1_000_000}
        value={price.amountCents === null ? null : price.amountCents / 100}
        onChange={amount => onChange({ amountCents: amount === null ? null : Math.round(amount * 100), ambiguousReason: '' })} />
      <SelectField label="O que o valor representa" options={units} value={price.unit}
        onChange={unit => onChange({ unit, isMonthlyEquivalent: false, ambiguousReason: '' })} placeholder="Precisa de confirmação" />
      <SelectField label="Periodicidade de cobrança" options={periodicities} value={price.paymentPeriod}
        onChange={paymentPeriod => onChange({
          paymentPeriod,
          ...(paymentPeriod !== 'installments' ? { installments: null } : {}),
          ambiguousReason: ''
        })} />
      <SelectField label="Duração do contrato" options={durations} value={price.duration}
        onChange={duration => onChange({ duration, ambiguousReason: '' })} />
      {price.paymentPeriod === 'installments' && <NumberField label="Quantidade de parcelas" value={price.installments} min={2} max={24} onChange={installments => onChange({ installments })} />}
      {!packagePrice && <>
        <SelectField label="Frequência de aulas / acessos" options={frequencies} value={price.frequencyType}
          onChange={frequencyType => onChange({ frequencyType, frequencyCount: frequencyType === 'unlimited' ? null : (price.frequencyCount ?? 1) })} />
        {price.frequencyType && price.frequencyType !== 'unlimited' && <NumberField label="Qtd na frequência" value={price.frequencyCount} max={200} onChange={frequencyCount => onChange({ frequencyCount })} />}
        {price.unit === 'per_participant' && <NumberField label="Participantes" value={price.participants} max={500} onChange={participants => onChange({ participants })} />}
      </>}
    </div>

    {price.amountCents && price.unit && (
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 pt-0.5">
        <span className="font-semibold text-slate-800">
          Prévia financeira: {formatMoneyBrl(price.amountCents)}
          {price.unit === 'per_session' ? ' / aula' : price.unit === 'per_participant' ? ' / participante' : price.unit === 'per_month' ? ' / mês' : price.unit === 'contract_total' ? ` total (${months} meses)` : ' / ciclo'}
        </span>
        {price.paymentPeriod === 'installments' && price.installments && price.installments > 1 && price.unit === 'contract_total' && (
          <span className="text-indigo-700 font-semibold">
            ({price.installments}x de {formatMoneyBrl(Math.round(price.amountCents / price.installments))})
          </span>
        )}
        {price.equivalentMonthlyCents && (
          <span className="text-slate-500">Equivalente ref.: {formatMoneyBrl(price.equivalentMonthlyCents)}/mês</span>
        )}
      </div>
    )}
  </div>;
}
