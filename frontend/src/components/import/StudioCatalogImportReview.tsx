import React, { useState } from 'react';
import { AlertCircle, ChevronDown, FileText } from 'lucide-react';
import type { ProposedPackage, ProposedPackageItem, ProposedService, StudioProposal } from '../../../../backend/src/shared/studio-catalog-contract';
import {
  Checkbox, days, Editors, emptyAdjustment, emptyPrice, emptySchedule, modalities, NumberField,
  PriceFields, SelectField, TextField, types
} from './StudioCatalogImportFields';

type CatalogRecord = { id: string; name: string; active: boolean; type?: string; capacity?: number | null };
export interface ImportSource { id: number; fileName: string; copies: number }
export interface ImportReceipt {
  services: { key: string; id: string; name: string; action: string }[];
  packages: ImportReceipt['services'];
}
export interface ImportDraft {
  id: string; revision: number; sources: ImportSource[]; proposal: StudioProposal; result: ImportReceipt | null;
  catalog: { services: CatalogRecord[]; packages: CatalogRecord[]; professionals: { id: string; name: string }[] };
  matches: { services: Record<string, CatalogRecord[]>; packages: Record<string, CatalogRecord[]> };
}
const serviceActions = [
  ['ignore', 'Ignorar'], ['create', 'Criar novo serviço'], ['link', 'Vincular ao serviço existente'],
  ['update', 'Atualizar informações selecionadas']
] as const;
const packageActions = [['ignore', 'Ignorar'], ['create', 'Criar novo pacote'], ['link', 'Vincular ao pacote existente']] as const;

function Evidence({ ids, excerpt, files }: { ids: number[]; excerpt?: string; files: ImportSource[] }) {
  if (!ids.length && !excerpt) return null;
  return <div className="space-y-1 text-xs text-slate-600">
    {ids.length > 0 && <ul className="flex flex-wrap gap-1.5" aria-label="Arquivos de origem">
      {files.filter(file => ids.includes(file.id)).map(file => <li key={file.id} className="inline-flex max-w-full items-center gap-1 rounded-lg bg-indigo-50 px-2 py-1 text-indigo-800">
        <FileText className="h-3.5 w-3.5 shrink-0" /><span className="break-all">{file.fileName}</span>
      </li>)}
    </ul>}
    {excerpt && <p className="break-words">“{excerpt}”</p>}
  </div>;
}

function ReviewCard({ name, row, matches, files, children }: {
  name: string; row: ProposedService | ProposedPackage; matches: CatalogRecord[]; files: ImportSource[]; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return <details onToggle={e => setOpen(e.currentTarget.open)} className="group rounded-2xl border border-slate-200 bg-white open:border-indigo-200">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
      <div className="min-w-0 space-y-1">
        <h4 className="break-words text-sm font-bold text-slate-900">{name}</h4>
        <div className="flex flex-wrap gap-2 text-xs">
          {row.issues.length > 0 && !row.reviewed && <span className="font-semibold text-amber-800">Precisa de confirmação</span>}
          {matches.length > 0 && <span className="text-indigo-700">Possível duplicidade</span>}
          <span className={row.action === 'ignore' ? 'text-slate-500' : 'font-semibold text-emerald-700'}>
            {row.action === 'ignore' ? 'Fora da importação' : row.reviewed ? 'Revisado e selecionado' : 'Selecionado para revisão'}
          </span>
        </div>
      </div>
      <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500 group-open:rotate-180" />
    </summary>
    {open && <div className="space-y-4 border-t border-slate-100 p-4">
      <Evidence ids={row.sources} files={files} />
      {row.issues.length > 0 && <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
        <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
        <ul className="space-y-1">{row.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>
      </div>}
      {matches.length > 0 && <p className="break-words text-xs text-slate-600">Já no catálogo: {matches.map(m => m.name + (m.active ? '' : ' (inativo)')).join(', ')}.</p>}
      {children}
    </div>}
  </details>;
}

function ServiceEditor({ row, draft, onChange }: { row: ProposedService; draft: ImportDraft; onChange: (patch: Partial<ProposedService>) => void }) {
  const scheduled = ['individual', 'duo', 'group'].includes(row.type || '');
  const profOptions = draft.catalog.professionals.map(p => [p.id, p.name] as const);
  const matches = draft.matches.services[row.key] || [];
  const linked = draft.catalog.services.filter(s => s.active).map(s => [s.id, s.name] as const);
  const useExisting = row.action === 'link' || row.action === 'update';
  const edit = (field: string) => row.action !== 'update' || row.apply.includes(field);
  const evidence = (item: { sources: number[]; evidence: string }) => <Evidence ids={item.sources} excerpt={item.evidence} files={draft.sources} />;
  return <ReviewCard name={row.name || 'Serviço sem nome'} row={row} matches={matches} files={draft.sources}>
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField label="Ação para este serviço" value={row.action} options={serviceActions} onChange={action => onChange({ action: action || 'ignore' })} />
      {useExisting && <SelectField label="Serviço do catálogo" value={row.existingId} options={linked} onChange={existingId => onChange({ existingId: existingId || '' })} />}
    </div>
    {row.action === 'update' && <fieldset className="flex flex-wrap gap-x-4 rounded-xl bg-slate-50 p-3">
      <legend className="text-xs font-semibold text-slate-700">Informações a aplicar</legend>
      {([['identity', 'Nome, atividade e descrição'], ['prices', 'Adicionar opções comerciais'], ['schedules', 'Aplicar horários à grade'], ['adjustments', 'Adicionar ajustes']] as const).map(([id, label]) =>
        <Checkbox key={id} label={label} checked={row.apply.includes(id)}
          onChange={checked => onChange({ apply: checked ? [...row.apply, id] : row.apply.filter(value => value !== id) })} />)}
      {row.apply.includes('schedules') && <p className="basis-full text-xs text-slate-600">
        Para serviços individuais com a escala completa ativa, a agenda passa a usar as faixas específicas informadas.
      </p>}
    </fieldset>}
    {row.action !== 'link' && <>
      {edit('identity') && <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Nome do serviço" value={row.name} onChange={name => onChange({ name })} />
        <TextField label="Atividade ou modalidade esportiva" value={row.activity} onChange={activity => onChange({ activity })} />
        <TextField label="Descrição" value={row.description} onChange={description => onChange({ description })} multiline />
        <TextField label="Benefícios e condições comerciais" value={row.notes} onChange={notes => onChange({ notes })} multiline />
      </div>}
      {row.action !== 'update' && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField label="Tipo de funcionamento" options={types} value={row.type} onChange={type => onChange({ type })} />
        <SelectField label="Modalidade de atendimento" options={modalities} value={row.modality} onChange={modality => onChange({ modality })} />
        {scheduled && <>
          <NumberField label="Duração da aula em minutos" value={row.durationMinutes} max={1440} onChange={durationMinutes => onChange({ durationMinutes })} />
          <SelectField label="Profissional responsável" options={profOptions} value={row.professionalId} onChange={professionalId => onChange({ professionalId: professionalId || '' })} />
        </>}
        {row.type === 'group' && <NumberField label="Vagas padrão" value={row.capacity} max={500} onChange={capacity => onChange({ capacity })} />}
        {row.type === 'access_limited' && <>
          <NumberField label="Limite de acessos por semana" value={row.weeklyLimit} max={50} onChange={weeklyLimit => onChange({ weeklyLimit })} />
          <NumberField label="Limite de acessos por mês" value={row.monthlyLimit} max={200} onChange={monthlyLimit => onChange({ monthlyLimit })} />
        </>}
      </div>}
      {row.professionalNames.length > 0 && <p className="break-words text-xs text-slate-600">Nomes lidos nos arquivos: {row.professionalNames.join(', ')}.</p>}
      {edit('prices') && <Editors title="Preços e planos" noun="Opção comercial" rows={row.prices} blank={emptyPrice}
        onChange={prices => onChange({ prices })} render={(price, change) => <>
          {evidence(price)}<PriceFields price={price} onChange={change} />
        </>} />}
      {edit('schedules') && (scheduled || row.action === 'update' || row.schedules.length > 0) &&
        <Editors title="Dias e horários propostos" noun="Horário" rows={row.schedules} blank={emptySchedule}
          onChange={schedules => onChange({ schedules })} render={(slot, change) => <>
            {evidence(slot)}
            {slot.professionalName && <p className="text-xs text-slate-600">Nome no arquivo: {slot.professionalName}</p>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SelectField label="Dia da semana" options={days} value={slot.dayOfWeek === null ? null : String(slot.dayOfWeek)}
                onChange={value => change({ dayOfWeek: value === null ? null : Number(value) })} />
              <TextField label="Início" type="time" value={slot.startTime} onChange={startTime => change({ startTime })} />
              <TextField label="Término" type="time" value={slot.endTime} onChange={endTime => change({ endTime })} />
              <SelectField label="Profissional do horário" options={profOptions} value={slot.professionalId}
                placeholder={slot.professionalName ? 'Selecione' : 'Usar responsável'}
                onChange={professionalId => change({ professionalId: professionalId || '' })} />
              {(row.type === 'group' || row.type === 'duo' || row.action === 'update') &&
                <NumberField label="Vagas neste horário" value={slot.capacity} max={500} onChange={capacity => change({ capacity })} />}
            </div>
          </>} />}
      {edit('adjustments') && <Editors title="Adicionais e descontos por horário" noun="Ajuste" rows={row.adjustments} blank={emptyAdjustment} max={20}
        onChange={adjustments => onChange({ adjustments })} render={(adjustment, change) => <>
          {evidence(adjustment)}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <TextField label="Nome do ajuste" value={adjustment.label} onChange={label => change({ label })} />
            <SelectField label="Tipo de ajuste" options={ [['surcharge', 'Adicional'], ['discount', 'Desconto']] as const }
              value={adjustment.adjustmentType} onChange={adjustmentType => change({ adjustmentType })} />
            <SelectField label="Unidade do ajuste" options={ [['fixed', 'Valor em reais'], ['percentage', 'Percentual']] as const }
              value={adjustment.valueType} onChange={valueType => change({ valueType })} />
            <NumberField label="Valor do ajuste" value={adjustment.amount} min={0.01} step={0.01}
              max={adjustment.valueType === 'percentage' ? 100 : 1_000_000} onChange={amount => change({ amount })} />
            <SelectField label="Incidência" options={ [['per_student', 'Por aluno'], ['per_session', 'Por aula']] as const }
              value={adjustment.incidence} onChange={incidence => change({ incidence })} />
            <TextField label="Início do ajuste" type="time" value={adjustment.startTime} onChange={startTime => change({ startTime })} />
            <TextField label="Término do ajuste" type="time" value={adjustment.endTime} onChange={endTime => change({ endTime })} />
          </div>
          <fieldset className="flex flex-wrap gap-x-3"><legend className="text-xs font-semibold text-slate-700">Dias do ajuste</legend>
            {days.map(([id, label]) => <Checkbox key={id} label={label} checked={adjustment.weekdays.includes(Number(id))}
              onChange={checked => change({ weekdays: checked ? [...adjustment.weekdays, Number(id)] : adjustment.weekdays.filter(day => day !== Number(id)) })} />)}
          </fieldset>
        </>} />}
    </>}
    {row.action !== 'ignore' && <Checkbox label="Conferi as informações e aprovo esta ação" checked={row.reviewed} onChange={reviewed => onChange({ reviewed })} />}
  </ReviewCard>;
}

function PackageEditor({ row, draft, onChange }: { row: ProposedPackage; draft: ImportDraft; onChange: (patch: Partial<ProposedPackage>) => void }) {
  const links = draft.catalog.packages.filter(p => p.active).map(p => [p.id, p.name] as const);
  const components = [
    ...draft.proposal.services.filter(s => s.action !== 'ignore').map(s => [s.key, (s.name || 'Serviço sem nome') + ' (desta importação)'] as const),
    ...draft.catalog.services.filter(s => s.active).map(s => ['existing:' + s.id, s.name + ' (catálogo)'] as const)
  ];
  return <ReviewCard name={row.name || 'Pacote sem nome'} row={row} matches={draft.matches.packages[row.key] || []} files={draft.sources}>
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField label="Ação para este pacote" options={packageActions} value={row.action} onChange={action => onChange({ action: action || 'ignore' })} />
      {row.action === 'link' && <SelectField label="Pacote do catálogo" options={links} value={row.existingId} onChange={existingId => onChange({ existingId: existingId || '' })} />}
    </div>
    {row.action !== 'link' && <>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Nome do pacote" value={row.name} onChange={name => onChange({ name })} />
        <TextField label="Descrição do pacote" value={row.description} onChange={description => onChange({ description })} multiline />
        <TextField label="Benefícios e condições do pacote" value={row.notes} onChange={notes => onChange({ notes })} multiline />
      </div>
      {row.price && <Evidence ids={row.price.sources} excerpt={row.price.evidence} files={draft.sources} />}
      <PriceFields price={row.price || emptyPrice} packagePrice onChange={patch => onChange({ price: { ...(row.price || emptyPrice), ...patch } })} />
      <Editors<ProposedPackageItem> title="Serviços incluídos" noun="Componente" rows={row.items} max={20}
        blank={{ serviceName: '', serviceRef: '', includedCredits: null, weeklyFrequency: null, monthlyLimit: null, mandatory: true }}
        onChange={items => onChange({ items })} render={(item, change) => <>
          {item.serviceName && <p className="text-xs text-slate-600">No arquivo: {item.serviceName}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Vincular ao serviço" options={components} value={item.serviceRef} onChange={serviceRef => change({ serviceRef: serviceRef || '' })} />
            <NumberField label="Aulas ou unidades incluídas" value={item.includedCredits} max={500} onChange={includedCredits => change({ includedCredits })} />
            <NumberField label="Frequência semanal do componente" value={item.weeklyFrequency} max={14} onChange={weeklyFrequency => change({ weeklyFrequency })} />
            <NumberField label="Limite mensal do componente" value={item.monthlyLimit} max={200} onChange={monthlyLimit => change({ monthlyLimit })} />
            <Checkbox label="Componente obrigatório" checked={item.mandatory} onChange={mandatory => change({ mandatory })} />
          </div>
        </>} />
    </>}
    {row.action !== 'ignore' && <Checkbox label="Conferi as informações e aprovo esta ação" checked={row.reviewed} onChange={reviewed => onChange({ reviewed })} />}
  </ReviewCard>;
}

export function StudioCatalogImportReview({ draft, onChange }: { draft: ImportDraft; onChange: (proposal: StudioProposal) => void }) {
  const { proposal } = draft;
  return <div className="space-y-5">
    {proposal.services.length > 0 && <section aria-label="Serviços identificados" className="space-y-2">
      <h3 className="text-base font-bold text-slate-900">Serviços e planos</h3>
      {proposal.services.map(row => <ServiceEditor key={row.key} row={row} draft={draft} onChange={patch =>
        onChange({ ...proposal, services: proposal.services.map(item => item.key === row.key ? { ...item, reviewed: false, ...patch } : item) })} />)}
    </section>}
    {proposal.packages.length > 0 && <section aria-label="Pacotes identificados" className="space-y-2">
      <h3 className="text-base font-bold text-slate-900">Pacotes combinados</h3>
      {proposal.packages.map(row => <PackageEditor key={row.key} row={row} draft={draft} onChange={patch =>
        onChange({ ...proposal, packages: proposal.packages.map(item => item.key === row.key ? { ...item, reviewed: false, ...patch } : item) })} />)}
    </section>}
  </div>;
}
