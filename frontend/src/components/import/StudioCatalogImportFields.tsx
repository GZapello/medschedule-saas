import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ProposedPrice, ProposedService } from '../../../../backend/src/services/studio-catalog-proposal';

export type Option = readonly [string, string];
const fieldClass = 'w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';
export const emptyPrice: ProposedPrice = {
  label: '', amountCents: null, unit: null, paymentPeriod: null, duration: null,
  frequencyType: null, frequencyCount: null, installments: null, participants: null, sources: [], evidence: ''
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
  ['duo', 'Dupla'], ['group', 'Turma'], ['deliverable', 'Entregável sem agendamento']
] as const;
export const modalities = [['presential', 'Presencial'], ['online', 'Online'], ['home', 'Domiciliar'], ['both', 'Presencial e online']] as const;
const units = [
  ['per_session', 'Por aula'], ['per_participant', 'Por participante'], ['per_month', 'Por mês'],
  ['per_cycle', 'Por ciclo de cobrança'], ['contract_total', 'Total do contrato']
] as const;
const periodicities = [
  ['one_time', 'À vista'], ['monthly', 'Mensal'], ['bimonthly', 'Bimestral'], ['quarterly', 'Trimestral'],
  ['semiannual', 'Semestral'], ['annual', 'Anual'], ['installments', 'Parcelada']
] as const;
const durations = [
  ['1_month', '1 mês'], ['2_months', '2 meses'], ['3_months', '3 meses'], ['6_months', '6 meses'],
  ['12_months', '12 meses'], ['24_months', '24 meses']
] as const;
const frequencies = [
  ['weekly', 'Por semana'], ['monthly', 'Por mês'], ['unlimited', 'Ilimitada'], ['fixed_count', 'Quantidade fixa']
] as const;
export const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((name, i) => [String(i), name] as const);

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0 space-y-1 text-xs font-semibold text-slate-700"><span>{label}</span>{children}</label>;
}

export function TextField({ label, value, onChange, multiline, type = 'text' }: {
  label: string; value: string; onChange: (value: string) => void; multiline?: boolean; type?: 'text' | 'time';
}) {
  return <Field label={label}>{multiline
    ? <textarea className={fieldClass} rows={2} maxLength={2000} value={value} onChange={e => onChange(e.target.value)} />
    : <input className={fieldClass} type={type} maxLength={180} value={value} onChange={e => onChange(e.target.value)} />}
  </Field>;
}

export function NumberField({ label, value, onChange, min = 1, max, step = 1 }: {
  label: string; value: number | null; onChange: (value: number | null) => void; min?: number; max?: number; step?: number;
}) {
  return <Field label={label}><input className={fieldClass} type="number" min={min} max={max} step={step}
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
  return <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-slate-700">
    <input className="h-4 w-4 shrink-0 accent-indigo-600" type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />{label}
  </label>;
}

export function Editors<T>({ title, rows, blank, onChange, render, noun, max = 30 }: {
  title: string; noun: string; rows: T[]; blank: T; max?: number;
  onChange: (value: T[]) => void; render: (value: T, change: (patch: Partial<T>) => void, index: number) => React.ReactNode;
}) {
  return <fieldset className="min-w-0 space-y-3">
    <legend className="text-sm font-bold text-slate-900">{title}</legend>
    {rows.map((row, i) => <div key={i} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-600">{noun} {i + 1}</span>
        <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-rose-100 hover:text-rose-700"
          aria-label={'Remover ' + noun.toLowerCase() + ' ' + (i + 1)}
          onClick={() => onChange(rows.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></button>
      </div>
      {render(row, patch => onChange(rows.map((old, k) => k === i ? { ...old, ...patch } : old)), i)}
    </div>)}
    {rows.length < max && <button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
      onClick={() => onChange([...rows, { ...blank }])}><Plus className="h-4 w-4" />Adicionar {noun.toLowerCase()}</button>}
  </fieldset>;
}

export function PriceFields({ price, onChange, packagePrice }: {
  price: ProposedPrice; onChange: (patch: Partial<ProposedPrice>) => void; packagePrice?: boolean;
}) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {!packagePrice && <TextField label="Nome do plano ou preço" value={price.label} onChange={label => onChange({ label })} />}
    <NumberField label="Valor informado (R$)" step={0.01} min={0.01} max={1_000_000}
      value={price.amountCents === null ? null : price.amountCents / 100}
      onChange={amount => onChange({ amountCents: amount === null ? null : Math.round(amount * 100) })} />
    <SelectField label="O que o valor representa" options={units} value={price.unit} onChange={unit => onChange({ unit })} placeholder="Precisa de confirmação" />
    <SelectField label="Periodicidade de cobrança" options={periodicities} value={price.paymentPeriod} onChange={paymentPeriod => onChange({ paymentPeriod })} />
    <SelectField label="Duração do contrato" options={durations} value={price.duration} onChange={duration => onChange({ duration })} />
    {price.paymentPeriod === 'installments' && <NumberField label="Quantidade de parcelas" value={price.installments} min={2} max={24} onChange={installments => onChange({ installments })} />}
    {!packagePrice && <>
      <SelectField label="Frequência de aulas ou acessos" options={frequencies} value={price.frequencyType} onChange={frequencyType => onChange({ frequencyType })} />
      {price.frequencyType && price.frequencyType !== 'unlimited' && <NumberField label="Quantidade na frequência" value={price.frequencyCount} max={200} onChange={frequencyCount => onChange({ frequencyCount })} />}
      {price.unit === 'per_participant' && <NumberField label="Participantes" value={price.participants} max={500} onChange={participants => onChange({ participants })} />}
    </>}
  </div>;
}
