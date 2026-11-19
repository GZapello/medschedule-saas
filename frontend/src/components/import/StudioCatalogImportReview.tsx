import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
  Globe,
  Layers,
  Lock,
  Sparkles,
  Tag,
  Users,
  Wand2
} from 'lucide-react';
import type {
  CatalogProfessionalSummary,
  CatalogRecord,
  ImportAlert,
  ImportDraft,
  ImportSource,
  ProposedAddonOption,
  ProposedPackage,
  ProposedPackageItem,
  ProposedPrice,
  ProposedService,
  StudioProposal
} from '../../types/studioCatalogImport';
import {
  Checkbox,
  days,
  durations,
  DURATION_MONTHS,
  Editors,
  emptyAdjustment,
  emptyPrice,
  emptySchedule,
  formatMoneyBrl,
  frequencies,
  modalities,
  NumberField,
  periodicities,
  PriceFields,
  SelectField,
  TextField,
  types
} from './StudioCatalogImportFields';

const emptyAddon: ProposedAddonOption = {
  label: '',
  addonServiceName: '',
  addonServiceRef: '',
  frequencyType: 'weekly',
  frequencyCount: 1,
  creditMode: 'fixed_credits',
  creditsPerCycle: 4,
  additionalPriceCents: null,
  comboDiscountType: 'none',
  comboDiscountValue: null,
  billingPeriodicity: 'monthly',
  durationMode: '1_month',
  scheduleTiming: 'during_purchase',
  attendanceFormat: 'match_service',
  sessionCapacity: null,
  professionalSelectionMode: 'student_picks',
  enabledProfessionalIds: [],
  allowedWeekdays: [],
  acceptedBasePriceKeys: [],
  baseOptionScopeMode: 'selected',
  baseOptionScopeUnclear: false,
  allowPublicBooking: true,
  mandatoryUnclear: false,
  ambiguousReason: '',
  active: true,
  sources: [],
  evidence: ''
};

const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const serviceActions = [
  ['ignore', 'Ignorar'],
  ['create', 'Criar novo serviço'],
  ['link', 'Vincular ao existente'],
  ['update', 'Atualizar existente']
] as const;

const packageActions = [
  ['ignore', 'Ignorar'],
  ['create', 'Criar novo pacote'],
  ['link', 'Vincular ao existente']
] as const;

const TYPE_LABELS: Record<string, string> = {
  access_unlimited: 'Acesso livre',
  access_limited: 'Acesso limitado',
  individual: 'Individual',
  duo: 'Dupla',
  group: 'Turma',
  deliverable: 'Entregável'
};

function parseMinutes(hhmm: string): number | null {
  const m = String(hhmm || '').trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function addMinutesClock(startTime: string, deltaMin: number): string {
  const s = parseMinutes(startTime);
  if (s === null || deltaMin <= 0 || s + deltaMin >= 24 * 60) return '';
  const total = s + deltaMin;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function evaluateSlotLive(
  slot: ProposedService['schedules'][number],
  row: ProposedService,
  catalogServices: CatalogRecord[],
  professionals: CatalogProfessionalSummary[]
): { ok: boolean; kind: 'ok' | 'incomplete' | 'missing_professional' | 'outside_shift' | 'conflict'; text: string } {
  const start = parseMinutes(slot.startTime);
  const end = parseMinutes(slot.endTime);
  if (slot.dayOfWeek === null || start === null || end === null || end <= start) {
    return {
      ok: false,
      kind: 'incomplete',
      text: slot.startTime && !slot.endTime ? `Início ${slot.startTime} sem término` : 'Dia, início ou término pendente'
    };
  }
  const existing = row.action === 'update' ? catalogServices.find(s => s.id === row.existingId) : undefined;
  const profId = slot.professionalId || row.professionalId || existing?.professionalId || '';
  const prof = professionals.find(p => p.id === profId);
  if (!prof) {
    return {
      ok: false,
      kind: 'missing_professional',
      text: slot.professionalName ? `Vincular instrutor (lido: ${slot.professionalName})` : 'Instrutor não vinculado'
    };
  }
  const dayShifts = prof.workShifts.filter(w => w.dayOfWeek === slot.dayOfWeek);
  const covered = dayShifts.some(w => {
    const ws = parseMinutes(w.startTime);
    const we = parseMinutes(w.endTime);
    return ws !== null && we !== null && ws <= start && end <= we;
  });
  if (!covered) {
    const avail = dayShifts.length > 0
      ? dayShifts.map(w => `${w.startTime}–${w.endTime}`).join(', ')
      : 'Sem expediente neste dia';
    return {
      ok: false,
      kind: 'outside_shift',
      text: `Fora da escala de ${prof.name} (${avail})`
    };
  }
  if (row.type === 'individual' && row.durationMinutes && end - start < row.durationMinutes) {
    return {
      ok: false,
      kind: 'conflict',
      text: `Faixa menor que a duração (${row.durationMinutes} min)`
    };
  }
  return { ok: true, kind: 'ok', text: `Escala OK · ${prof.name}` };
}

function summarizeServiceSchedules(schedules: ProposedService['schedules']): string {
  if (!schedules.length) return 'Sem grade';
  const daysSet = [...new Set(schedules.map(s => s.dayOfWeek).filter((d): d is number => d !== null))]
    .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
    .map(d => WEEKDAY_SHORT[d]);
  const timesSet = [...new Set(schedules.map(s => s.startTime).filter(Boolean))].slice(0, 3);
  return `${daysSet.join('/') || '?'} · ${timesSet.join(', ') || 'horário pendente'}`;
}

function Evidence({ ids, excerpt, files }: { ids: number[]; excerpt?: string; files: ImportSource[] }) {
  if (!ids.length && !excerpt) return null;
  return <div className="space-y-1 text-xs text-slate-600">
    {ids.length > 0 && <ul className="flex flex-wrap gap-1.5" aria-label="Arquivos de origem">
      {files.filter(file => ids.includes(file.id)).map(file => <li key={file.id} className="inline-flex max-w-full items-center gap-1 rounded-lg bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-800">
        <FileText className="h-3 w-3 shrink-0" /><span className="break-all">{file.fileName}</span>
      </li>)}
    </ul>}
    {excerpt && <p className="break-words text-[11px] italic text-slate-600">“{excerpt}”</p>}
  </div>;
}

type ServiceSectionTab = 'general' | 'prices' | 'schedules' | 'adjustments' | 'addons';

function ServiceEditor({
  row,
  draft,
  isOpen,
  activeTab,
  onToggleOpen,
  onTabChange,
  onChange,
  onCreateCompanionAddonService
}: {
  row: ProposedService;
  draft: ImportDraft;
  isOpen: boolean;
  activeTab: ServiceSectionTab;
  onToggleOpen: (open: boolean) => void;
  onTabChange: (tab: ServiceSectionTab) => void;
  onChange: (patch: Partial<ProposedService>) => void;
  onCreateCompanionAddonService: (addonIndex: number, suggestedName?: string) => void;
}) {
  const [bulkDurationMin, setBulkDurationMin] = useState<number>(row.durationMinutes || 50);
  const [bulkCapacityVal, setBulkCapacityVal] = useState<number>(row.capacity || 10);
  const [bulkProfId, setBulkProfId] = useState<string>('');
  const [bulkPriceUnit, setBulkPriceUnit] = useState<'per_month' | 'per_session' | 'per_participant' | 'contract_total'>('per_month');

  const scheduled = ['individual', 'duo', 'group'].includes(row.type || '');
  const selectablePros = draft.catalog.professionals.filter(p => p.isStudioEligible !== false);
  const profOptions = selectablePros.map(p => [p.id, `${p.name}${p.professionName ? ` · ${p.professionName}` : ''} (${p.scheduleSummary})`] as const);
  const responsibleId = row.action === 'update' ? draft.catalog.services.find(s => s.id === row.existingId)?.professionalId : row.professionalId;
  const responsible = draft.catalog.professionals.find(p => p.id === responsibleId);
  const matches = draft.matches.services[row.key] || [];
  const linked = draft.catalog.services.filter(s => s.active).map(s => [s.id, s.name] as const);
  const addonTargets = [
    ...draft.proposal.services
      .filter(s => s.key !== row.key && s.action !== 'ignore' && s.type !== 'access_unlimited' && s.type !== 'access_limited')
      .map(s => [s.key, `${s.name || 'Serviço sem nome'} (desta importação)`] as const),
    ...draft.catalog.services
      .filter(s => s.active && s.id !== row.existingId && s.type !== 'access_unlimited' && s.type !== 'access_limited')
      .map(s => ['existing:' + s.id, `${s.name} (catálogo)`] as const)
  ];
  const useExisting = row.action === 'link' || row.action === 'update';
  const edit = (field: string) => row.action !== 'update' || row.apply.includes(field);
  const evidence = (item: { sources: number[]; evidence: string }) => <Evidence ids={item.sources} excerpt={item.evidence} files={draft.sources} />;

  const slotChecks = useMemo(
    () => row.schedules.map(slot => evaluateSlotLive(slot, row, draft.catalog.services, draft.catalog.professionals)),
    [row, draft.catalog.services, draft.catalog.professionals]
  );

  const hasPendingSchedules = !row.deferSchedules && slotChecks.some(c => !c.ok);
  const hasPendingPrices = row.prices.some(p => !p.amountCents || !p.unit || Boolean(p.ambiguousReason));
  const hasPendingAddons = (row.optionalAddons || []).some(
    a =>
      a.active &&
      (Boolean(a.mandatoryUnclear) ||
        Boolean(a.baseOptionScopeUnclear) ||
        a.baseOptionScopeMode === 'undecided' ||
        (a.baseOptionScopeMode === 'selected' && (!Array.isArray(a.acceptedBasePriceKeys) || a.acceptedBasePriceKeys.length === 0)) ||
        a.additionalPriceCents === null ||
        (!a.addonServiceRef && !a.addonServiceName) ||
        (a.attendanceFormat === 'group' && (!a.sessionCapacity || a.sessionCapacity < 2)))
  );
  const needsConfirmation = row.issues.length > 0 || hasPendingSchedules || hasPendingPrices || hasPendingAddons;
  const hasIncompleteEndTimes = row.schedules.some(s => Boolean(s.startTime) && !s.endTime);

  const applyBulkDuration = () => {
    const mins = Math.max(10, Math.min(360, bulkDurationMin || 50));
    const nextSchedules = row.schedules.map(s => {
      if (!s.startTime || s.endTime) return s;
      const computed = addMinutesClock(s.startTime, mins);
      return computed ? { ...s, endTime: computed } : s;
    });
    onChange({
      durationMinutes: row.durationMinutes || mins,
      schedules: nextSchedules
    });
  };

  const applyBulkCapacity = () => {
    const cap = Math.max(1, Math.min(500, bulkCapacityVal || 10));
    onChange({
      capacity: row.capacity || cap,
      schedules: row.schedules.map(s => ({ ...s, capacity: s.capacity ?? cap }))
    });
  };

  const applyBulkInstructor = () => {
    if (!bulkProfId) return;
    onChange({
      professionalId: row.professionalId || bulkProfId,
      schedules: row.schedules.map(s => (s.professionalId ? s : { ...s, professionalId: bulkProfId }))
    });
  };

  const applySuggestedInstructors = () => {
    onChange({
      professionalId: row.professionalId || row.suggestedProfessionalId || '',
      schedules: row.schedules.map(s =>
        !s.professionalId && s.suggestedProfessionalId
          ? { ...s, professionalId: s.suggestedProfessionalId }
          : s
      )
    });
  };

  const applyBulkPriceUnit = () => {
    onChange({
      prices: row.prices.map(p => {
        if (p.unit) return p;
        return {
          ...p,
          unit: bulkPriceUnit,
          ...(bulkPriceUnit === 'per_month' && !p.paymentPeriod ? { paymentPeriod: 'monthly' } : {}),
          ...(bulkPriceUnit === 'contract_total' && !p.paymentPeriod ? { paymentPeriod: p.maxInstallments ? 'installments' : 'one_time', installments: p.maxInstallments || null } : {}),
          ambiguousReason: ''
        };
      })
    });
  };

  const convertEquivalentsToTotals = () => {
    onChange({
      prices: row.prices.map(p => {
        const months = p.duration ? DURATION_MONTHS[p.duration] || 1 : 1;
        if (!p.amountCents || months <= 1 || (!p.isMonthlyEquivalent && p.unit !== 'per_month')) return p;
        return {
          ...p,
          unit: 'contract_total',
          equivalentMonthlyCents: p.amountCents,
          amountCents: p.amountCents * months,
          paymentPeriod: p.maxInstallments && p.maxInstallments > 1 ? 'installments' : 'one_time',
          installments: p.maxInstallments && p.maxInstallments > 1 ? p.maxInstallments : null,
          isMonthlyEquivalent: false,
          ambiguousReason: ''
        };
      })
    });
  };

  const hasSuggestedSlotProfs = row.schedules.some(s => !s.professionalId && s.suggestedProfessionalId) || (!row.professionalId && Boolean(row.suggestedProfessionalId));
  const hasEquivPrices = row.prices.some(p => p.amountCents && (p.duration && p.duration !== '1_month') && (p.isMonthlyEquivalent || p.unit === 'per_month'));
  const hasMissingPriceUnits = row.prices.some(p => !p.unit);

  return (
    <details
      id={`import-card-${row.key}`}
      open={isOpen}
      onToggle={e => onToggleOpen(e.currentTarget.open)}
      className="group rounded-2xl border border-slate-200 bg-white open:border-indigo-300 shadow-2xs transition-colors"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="break-words text-sm font-bold text-slate-900">{row.name || 'Serviço sem nome'}</h4>
            {row.type && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                {TYPE_LABELS[row.type] || row.type}
              </span>
            )}
            {row.prices.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                <Tag className="h-3 w-3" />
                {row.prices.length} {row.prices.length === 1 ? 'opção' : 'opções'}
              </span>
            )}
            {row.schedules.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                <CalendarClock className="h-3 w-3" />
                {row.deferSchedules ? 'Grade adiada (rascunho)' : summarizeServiceSchedules(row.schedules)}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {needsConfirmation ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 border border-amber-200">
                <AlertTriangle className="h-3 w-3" />
                Precisa de confirmação
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                <CheckCircle2 className="h-3 w-3" />
                Sem pendências
              </span>
            )}
            {matches.length > 0 && (
              <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">
                Já existe semelhante: {matches[0].name} ({matches[0].score}%)
              </span>
            )}
            <span className={row.action === 'ignore' ? 'text-slate-500 font-medium' : row.reviewed ? 'font-bold text-emerald-700' : 'font-semibold text-indigo-700'}>
              {row.action === 'ignore'
                ? 'Fora da importação'
                : row.action === 'link'
                  ? (row.reviewed ? 'Vinculado e aprovado' : 'Vincular ao existente')
                  : row.action === 'update'
                    ? (row.reviewed ? 'Atualização aprovada' : 'Atualizar existente')
                    : (row.reviewed ? 'Novo cadastro aprovado' : 'Novo serviço p/ revisão')}
            </span>
            {row.action !== 'ignore' && row.action !== 'link' && (
              <span className="inline-flex items-center gap-1 text-slate-600">
                {row.allowPublicBooking !== false && !row.deferSchedules ? (
                  <><Globe className="h-3 w-3 text-teal-700" /> Link público</>
                ) : (
                  <><Lock className="h-3 w-3 text-slate-500" /> Rascunho interno</>
                )}
              </span>
            )}
          </div>
        </div>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
      </summary>

      {isOpen && (
        <div className="space-y-4 border-t border-slate-100 p-4">
          <Evidence ids={row.sources} files={draft.sources} />

          {matches.length > 0 && row.action === 'create' && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 text-xs text-indigo-950">
              <div>
                <strong>Possível duplicidade detectada:</strong> {matches.slice(0, 2).map(m => `${m.name} (${m.matchReason} · ${m.score}%)`).join('; ')}.
              </div>
              {matches[0].active && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => onChange({ action: 'link', existingId: matches[0].id })}
                    className="rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-[11px] font-bold text-indigo-800 hover:bg-indigo-100 cursor-pointer"
                  >
                    Vincular a {matches[0].name}
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ action: 'update', existingId: matches[0].id, apply: ['prices', ...(row.schedules.length > 0 ? ['schedules'] : [])] })}
                    className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700 cursor-pointer"
                  >
                    Atualizar existente
                  </button>
                </div>
              )}
            </div>
          )}

          {row.issues.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
              <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 mt-0.5" />
              <ul className="space-y-1">{row.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>
            </div>
          )}

          {/* Barra de ação principal */}
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Ação para este serviço" value={row.action} options={serviceActions}
              onChange={action => onChange({
                action: action || 'ignore',
                ...(action === 'update' && row.apply.length === 0 ? { apply: ['prices', ...(row.schedules.length > 0 ? ['schedules'] : [])] } : {})
              })} />
            {useExisting && (
              <SelectField label="Serviço do catálogo" value={row.existingId} options={linked}
                onChange={existingId => onChange({ existingId: existingId || '' })} />
            )}
          </div>

          {row.action === 'update' && (
            <fieldset className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl bg-slate-50 border border-slate-200 p-3">
              <legend className="text-xs font-semibold text-slate-700 px-1">Informações a atualizar no serviço existente</legend>
              {([['identity', 'Nome, atividade e descrição'], ['prices', 'Adicionar opções comerciais'], ['schedules', 'Aplicar horários à grade'], ['adjustments', 'Adicionar ajustes'], ['addons', 'Adicionar complementos']] as const).map(([id, label]) => (
                <Checkbox key={id} label={label} checked={row.apply.includes(id)}
                  onChange={checked => onChange({ apply: checked ? [...row.apply, id] : row.apply.filter(value => value !== id) })} />
              ))}
            </fieldset>
          )}

          {row.action !== 'link' && (
            <>
              {/* Navegação compacta em sub-abas internas */}
              <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2" role="tablist">
                <button
                  type="button"
                  onClick={() => onTabChange('general')}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold cursor-pointer transition-all ${
                    activeTab === 'general' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" /> Dados Gerais
                </button>
                {edit('prices') && (
                  <button
                    type="button"
                    onClick={() => onTabChange('prices')}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold cursor-pointer transition-all ${
                      activeTab === 'prices' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <Tag className="h-3.5 w-3.5" /> Planos &amp; Preços ({row.prices.length})
                    {hasPendingPrices && <span className="h-2 w-2 rounded-full bg-amber-400" />}
                  </button>
                )}
                {edit('schedules') && (scheduled || row.action === 'update' || row.schedules.length > 0) && (
                  <button
                    type="button"
                    onClick={() => onTabChange('schedules')}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold cursor-pointer transition-all ${
                      activeTab === 'schedules' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <CalendarClock className="h-3.5 w-3.5" /> Horários ({row.schedules.length})
                    {hasPendingSchedules && <span className="h-2 w-2 rounded-full bg-amber-400" />}
                  </button>
                )}
                {edit('adjustments') && (
                  <button
                    type="button"
                    onClick={() => onTabChange('adjustments')}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold cursor-pointer transition-all ${
                      activeTab === 'adjustments' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Adicionais/Descontos ({row.adjustments.length})
                  </button>
                )}
                {edit('addons') && (
                  <button
                    type="button"
                    onClick={() => onTabChange('addons')}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold cursor-pointer transition-all ${
                      activeTab === 'addons' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Complementos ({(row.optionalAddons || []).length})
                    {hasPendingAddons && <span className="h-2 w-2 rounded-full bg-amber-400" />}
                  </button>
                )}
              </div>

              {activeTab === 'general' && (
                <div className="space-y-3">
                  {edit('identity') && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TextField label="Nome do serviço" value={row.name} onChange={name => onChange({ name })} />
                      <TextField label="Atividade ou modalidade esportiva" value={row.activity} onChange={activity => onChange({ activity })} />
                      <TextField label="Descrição" value={row.description} onChange={description => onChange({ description })} multiline />
                      <TextField label="Observações comerciais e regras" value={row.notes} onChange={notes => onChange({ notes })} multiline />
                    </div>
                  )}
                  {row.action !== 'update' && (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <SelectField label="Tipo de funcionamento" options={types} value={row.type} onChange={type => onChange({ type })} />
                      <SelectField label="Modalidade de atendimento" options={modalities} value={row.modality} onChange={modality => onChange({ modality })} />
                      {scheduled && (
                        <>
                          <NumberField label="Duração da aula (min)" value={row.durationMinutes} max={1440}
                            onChange={durationMinutes => onChange({ durationMinutes })} />
                          <div className="space-y-1">
                            <SelectField label="Profissional responsável" options={profOptions} value={row.professionalId}
                              onChange={professionalId => onChange({ professionalId: professionalId || '' })} />
                            {Boolean(draft.catalog.unavailable?.length) && <details className="text-xs text-slate-600">
                              <summary className="cursor-pointer">Indisponíveis neste estabelecimento</summary>
                              <ul>{draft.catalog.unavailable?.map((p, i) => <li key={i}>{p.name} — {p.reason}</li>)}</ul>
                            </details>}
                            {!row.professionalId && selectablePros.some(p => p.id === row.suggestedProfessionalId) && (
                              <button
                                type="button"
                                onClick={() => onChange({ professionalId: row.suggestedProfessionalId || '' })}
                                className="text-[11px] font-bold text-indigo-700 hover:underline cursor-pointer"
                              >
                                Aplicar instrutor sugerido: {draft.catalog.professionals.find(p => p.id === row.suggestedProfessionalId)?.name}
                              </button>
                            )}
                          </div>
                        </>
                      )}
                      {row.type === 'group' && (
                        <NumberField label="Vagas padrão por turma" value={row.capacity} max={500}
                          onChange={capacity => onChange({ capacity })} />
                      )}
                      {row.type === 'access_limited' && (
                        <>
                          <NumberField label="Limite semanal de acessos" value={row.weeklyLimit} max={50}
                            onChange={weeklyLimit => onChange({ weeklyLimit })} />
                          <NumberField label="Limite mensal de acessos" value={row.monthlyLimit} max={200}
                            onChange={monthlyLimit => onChange({ monthlyLimit })} />
                        </>
                      )}
                    </div>
                  )}
                  {row.professionalNames.length > 0 && (
                    <p className="break-words text-xs text-slate-600">
                      <Users className="inline h-3.5 w-3.5 mr-1 text-slate-500" />
                      Instrutores citados nos arquivos: <strong>{row.professionalNames.join(', ')}</strong>.
                    </p>
                  )}
                </div>
              )}

              {activeTab === 'prices' && edit('prices') && (
                <div className="space-y-3">
                  {row.type !== 'access_unlimited' && row.type !== 'access_limited' && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-700">Modalidades comerciais permitidas</p>
                      <div className="flex flex-wrap gap-4 text-xs">
                        <Checkbox
                          label="Permite agendar aula avulsa"
                          checked={row.allowSingleBooking !== undefined && row.allowSingleBooking !== null
                            ? Boolean(row.allowSingleBooking)
                            : row.prices.some(p => p.unit === 'per_session' && !p.duration && !p.frequencyType)}
                          onChange={checked => onChange({ allowSingleBooking: checked, allowPublicSingleBooking: checked })}
                        />
                        <Checkbox
                          label="Permite contratação como plano / recorrência"
                          checked={row.allowPlanBooking !== undefined && row.allowPlanBooking !== null
                            ? Boolean(row.allowPlanBooking)
                            : row.prices.some(p => p.unit !== 'per_session' || Boolean(p.duration))}
                          onChange={checked => onChange({ allowPlanBooking: checked, allowPublicPlanBooking: checked })}
                        />
                      </div>
                    </div>
                  )}
                  {row.prices.length > 0 && (hasMissingPriceUnits || hasEquivPrices) && (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/50 p-2.5 text-xs">
                      <span className="font-bold text-indigo-950 flex items-center gap-1">
                        <Wand2 className="h-3.5 w-3.5" /> Edição em massa de preços:
                      </span>
                      {hasMissingPriceUnits && (
                        <div className="inline-flex items-center gap-1.5">
                          <select
                            value={bulkPriceUnit}
                            onChange={e => setBulkPriceUnit(e.target.value as any)}
                            className="rounded-lg border border-indigo-200 bg-white px-2 py-1 text-xs"
                          >
                            <option value="per_month">Por mês</option>
                            <option value="per_session">Por aula</option>
                            <option value="per_participant">Por participante</option>
                            <option value="contract_total">Total do contrato</option>
                          </select>
                          <button
                            type="button"
                            onClick={applyBulkPriceUnit}
                            className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700 cursor-pointer"
                          >
                            Aplicar aos sem unidade
                          </button>
                        </div>
                      )}
                      {hasEquivPrices && (
                        <button
                          type="button"
                          onClick={convertEquivalentsToTotals}
                          className="rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-[11px] font-bold text-indigo-800 hover:bg-indigo-100 cursor-pointer"
                        >
                          Converter mensais equivalentes → Total (valor × meses)
                        </button>
                      )}
                    </div>
                  )}
                  <Editors title="Planos e opções comerciais" noun="Opção comercial" rows={row.prices} blank={emptyPrice}
                    emptyMessage="Nenhuma opção comercial identificada. Adicione um plano mensal, avulso ou total contratual se desejar."
                    onChange={prices => onChange({ prices })} render={(price, change) => <>
                      {evidence(price)}<PriceFields price={price} onChange={change} />
                    </>} />
                </div>
              )}

              {activeTab === 'schedules' && edit('schedules') && (scheduled || row.action === 'update' || row.schedules.length > 0) && (
                <div className="space-y-3">
                  {row.schedules.length > 0 && (
                    <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                      <Checkbox
                        label="Configurar grade depois (importar serviço e planos como rascunho interno sem publicar horários inválidos/pendentes agora)"
                        checked={Boolean(row.deferSchedules)}
                        onChange={deferSchedules => onChange({
                          deferSchedules,
                          ...(deferSchedules ? { allowPublicBooking: false } : {})
                        })}
                      />
                      {!row.deferSchedules && (
                        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200">
                          <span className="font-bold text-slate-700 flex items-center gap-1">
                            <Wand2 className="h-3.5 w-3.5 text-indigo-600" /> Edição em massa na grade:
                          </span>
                          {hasIncompleteEndTimes && (
                            <div className="inline-flex items-center gap-1">
                              <input
                                type="number"
                                min={10}
                                max={240}
                                value={bulkDurationMin}
                                onChange={e => setBulkDurationMin(Number(e.target.value) || 50)}
                                className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-center font-bold"
                                aria-label="Duração padrão em minutos"
                              />
                              <button
                                type="button"
                                onClick={applyBulkDuration}
                                className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700 cursor-pointer"
                              >
                                Aplicar duração (min) aos sem término
                              </button>
                            </div>
                          )}
                          {(row.type === 'group' || row.type === 'duo') && (
                            <div className="inline-flex items-center gap-1">
                              <input
                                type="number"
                                min={1}
                                max={500}
                                value={bulkCapacityVal}
                                onChange={e => setBulkCapacityVal(Number(e.target.value) || 10)}
                                className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-center font-bold"
                                aria-label="Capacidade padrão"
                              />
                              <button
                                type="button"
                                onClick={applyBulkCapacity}
                                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-800 hover:bg-slate-100 cursor-pointer"
                              >
                                Aplicar vagas a todos
                              </button>
                            </div>
                          )}
                          <div className="inline-flex items-center gap-1">
                            <select
                              value={bulkProfId}
                              onChange={e => setBulkProfId(e.target.value)}
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs max-w-[200px]"
                            >
                              <option value="">Instrutor para pendentes…</option>
                              {profOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                            </select>
                            <button
                              type="button"
                              disabled={!bulkProfId}
                              onClick={applyBulkInstructor}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                            >
                              Vincular aos pendentes
                            </button>
                          </div>
                          {hasSuggestedSlotProfs && (
                            <button
                              type="button"
                              onClick={applySuggestedInstructors}
                              className="rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-800 hover:bg-indigo-100 cursor-pointer"
                            >
                              Aplicar sugestões de instrutor
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {!row.deferSchedules && (
                    <Editors title="Dias e horários propostos" noun="Horário" rows={row.schedules} blank={emptySchedule}
                      emptyMessage="Sem horários pré-cadastrados neste serviço."
                      onChange={schedules => onChange({ schedules })} render={(slot, change, idx) => {
                        const live = slotChecks[idx];
                        return <>
                          {evidence(slot)}
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                            {slot.professionalName && (
                              <span className="text-slate-600">Lido no arquivo: <strong>{slot.professionalName}</strong></span>
                            )}
                            {live && (
                              <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-semibold ${
                                live.ok
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : live.kind === 'outside_shift' || live.kind === 'conflict'
                                    ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                              }`}>
                                {live.ok ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                                {live.text}
                              </span>
                            )}
                          </div>
                          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                            <SelectField label="Dia da semana" options={days} value={slot.dayOfWeek === null ? null : String(slot.dayOfWeek)}
                              onChange={value => change({ dayOfWeek: value === null ? null : Number(value) })} />
                            <TextField label="Início" type="time" value={slot.startTime} onChange={startTime => change({ startTime })} />
                            <TextField label="Término" type="time" value={slot.endTime} onChange={endTime => change({ endTime })} />
                            <SelectField label="Profissional do horário" options={profOptions} value={slot.professionalId}
                              placeholder={responsible ? `Usar responsável (${responsible.name})` : 'Usar responsável'}
                              onChange={professionalId => change({ professionalId: professionalId || '' })} />
                            {(row.type === 'group' || row.type === 'duo' || row.action === 'update') && (
                              <NumberField label="Vagas neste horário" value={slot.capacity} max={500}
                                onChange={capacity => change({ capacity })} />
                            )}
                          </div>
                        </>;
                      }} />
                  )}
                </div>
              )}

              {activeTab === 'adjustments' && edit('adjustments') && (
                <Editors title="Adicionais e descontos por horário" noun="Ajuste" rows={row.adjustments} blank={emptyAdjustment} max={20}
                  emptyMessage="Nenhum adicional por horário ou turno configurado."
                  onChange={adjustments => onChange({ adjustments })} render={(adjustment, change) => <>
                    {evidence(adjustment)}
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <TextField label="Nome do ajuste" value={adjustment.label} onChange={label => change({ label })} />
                      <SelectField label="Tipo de ajuste" options={[['surcharge', 'Adicional'], ['discount', 'Desconto']] as const}
                        value={adjustment.adjustmentType} onChange={adjustmentType => change({ adjustmentType })} />
                      <SelectField label="Unidade do ajuste" options={[['fixed', 'Valor em reais'], ['percentage', 'Percentual']] as const}
                        value={adjustment.valueType} onChange={valueType => change({ valueType })} />
                      <NumberField label="Valor do ajuste" value={adjustment.amount} min={0.01} step={0.01}
                        max={adjustment.valueType === 'percentage' ? 100 : 1_000_000} onChange={amount => change({ amount })} />
                      <SelectField label="Incidência" options={[['per_student', 'Por aluno'], ['per_session', 'Por aula']] as const}
                        value={adjustment.incidence} onChange={incidence => change({ incidence })} />
                      <TextField label="Início do ajuste" type="time" value={adjustment.startTime} onChange={startTime => change({ startTime })} />
                      <TextField label="Término do ajuste" type="time" value={adjustment.endTime} onChange={endTime => change({ endTime })} />
                    </div>
                    <fieldset className="flex flex-wrap gap-x-3">
                      <legend className="text-xs font-semibold text-slate-700">Dias do ajuste</legend>
                      {days.map(([id, label]) => (
                        <Checkbox key={id} label={label} checked={adjustment.weekdays.includes(Number(id))}
                          onChange={checked => change({ weekdays: checked ? [...adjustment.weekdays, Number(id)] : adjustment.weekdays.filter(day => day !== Number(id)) })} />
                      ))}
                    </fieldset>
                  </>} />
              )}

              {activeTab === 'addons' && edit('addons') && (
                <Editors<ProposedAddonOption>
                  title="Complementos opcionais vinculados ao plano"
                  noun="Complemento"
                  rows={row.optionalAddons || []}
                  blank={emptyAddon}
                  max={20}
                  emptyMessage="Nenhum complemento opcional vinculado a este serviço base."
                  onChange={optionalAddons => onChange({ optionalAddons })}
                  render={(addon, change, addonIdx) => {
                    const addonProfCandidates = selectablePros.filter((prof) => {
                      const ref = String(addon.addonServiceRef || '');
                      if (ref.startsWith('existing:')) {
                        const existingId = ref.slice(9);
                        const existingCatSrv = draft.catalog.services.find(s => s.id === existingId);
                        if (existingCatSrv && existingCatSrv.type !== 'deliverable' && Array.isArray(prof.linkedServiceIds)) {
                          return prof.linkedServiceIds.includes(existingId);
                        }
                      }
                      return true;
                    });
                    return (
                    <div className="space-y-3">
                      {evidence(addon)}
                      {addon.mandatoryUnclear && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 space-y-1.5">
                          <div className="font-semibold">
                            {addon.ambiguousReason || 'Obrigatoriedade ambígua: confirme se este item deve ser oferecido como complemento opcional.'}
                          </div>
                          <Checkbox
                            label="Confirmado como complemento opcional (não é pacote obrigatório)"
                            checked={!addon.mandatoryUnclear}
                            onChange={checked => change({ mandatoryUnclear: !checked })}
                          />
                        </div>
                      )}
                      {addon.addonServiceName && (
                        <p className="text-xs text-slate-600">Lido no material: <strong>{addon.addonServiceName}</strong></p>
                      )}
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <TextField label="Rótulo exibido ao aluno" value={addon.label} onChange={label => change({ label })} placeholder="Ex: Personal 1x/semana" />
                        <div className="space-y-1">
                          <SelectField
                            label="Serviço complementar vinculado"
                            options={addonTargets}
                            value={addon.addonServiceRef || null}
                            onChange={addonServiceRef => change({ addonServiceRef: addonServiceRef || '', enabledProfessionalIds: [] })}
                          />
                          <button
                            type="button"
                            onClick={() => onCreateCompanionAddonService(addonIdx, addon.addonServiceName || addon.label)}
                            className="text-[11px] font-bold text-teal-700 hover:underline cursor-pointer"
                          >
                            + Criar serviço complementar agendável nesta importação
                          </button>
                        </div>
                        <NumberField
                          label="Valor adicional (R$)"
                          value={addon.additionalPriceCents !== null ? Math.round(addon.additionalPriceCents) / 100 : null}
                          min={0}
                          step={0.01}
                          onChange={val => change({ additionalPriceCents: val === null ? null : Math.round(val * 100) })}
                        />
                        <SelectField label="Frequência" options={frequencies} value={addon.frequencyType} onChange={frequencyType => change({ frequencyType })} />
                        {addon.frequencyType !== 'unlimited' && (
                          <NumberField label="Qtd. frequência" value={addon.frequencyCount} min={1} max={200} onChange={frequencyCount => change({ frequencyCount })} />
                        )}
                        {addon.frequencyType !== 'unlimited' && (
                          <SelectField
                            label="Regra de créditos"
                            options={[
                              ['fixed_credits', 'Créditos fixos por ciclo'],
                              ['weekly_guaranteed', 'Frequência semanal garantida']
                            ] as const}
                            value={addon.creditMode || 'fixed_credits'}
                            onChange={creditMode =>
                              creditMode &&
                              change({
                                creditMode,
                                ...(creditMode === 'weekly_guaranteed' ? { creditsPerCycle: null } : {})
                              })
                            }
                          />
                        )}
                        {addon.frequencyType !== 'unlimited' && (addon.creditMode || 'fixed_credits') === 'fixed_credits' && (
                          <NumberField label="Créditos/aulas por ciclo" value={addon.creditsPerCycle} min={0} max={500} onChange={creditsPerCycle => change({ creditsPerCycle })} />
                        )}
                        <SelectField
                          label="Periodicidade de cobrança"
                          options={[['monthly', 'Mensal'], ['per_cycle', 'Por ciclo do plano-base'], ['one_time', 'Pagamento único'], ['bimonthly', 'Bimestral'], ['quarterly', 'Trimestral'], ['semiannual', 'Semestral'], ['annual', 'Anual']] as const}
                          value={addon.billingPeriodicity}
                          onChange={billingPeriodicity => billingPeriodicity && change({ billingPeriodicity })}
                        />
                        <SelectField
                          label="Duração"
                          options={[['match_base', 'Seguir plano-base'], ...durations] as const}
                          value={addon.durationMode}
                          onChange={durationMode => durationMode && change({ durationMode })}
                        />
                        <SelectField
                          label="Escolha de horários"
                          options={[['during_purchase', 'Durante a contratação'], ['after_confirmation', 'Após aprovação da matrícula'], ['not_applicable', 'Sem agendamento']] as const}
                          value={addon.scheduleTiming}
                          onChange={scheduleTiming => scheduleTiming && change({ scheduleTiming })}
                        />
                        <SelectField
                          label="Desconto de combinação"
                          options={[['none', 'Sem desconto'], ['fixed_cents', 'Desconto fixo (R$)'], ['percentage', 'Percentual (%)']] as const}
                          value={addon.comboDiscountType}
                          onChange={comboDiscountType => comboDiscountType && change({ comboDiscountType })}
                        />
                        {addon.comboDiscountType !== 'none' && (
                          <NumberField
                            label={addon.comboDiscountType === 'percentage' ? 'Desconto (%)' : 'Desconto (R$)'}
                            value={addon.comboDiscountValue !== null ? (addon.comboDiscountType === 'percentage' ? addon.comboDiscountValue : addon.comboDiscountValue / 100) : null}
                            min={0}
                            max={addon.comboDiscountType === 'percentage' ? 100 : 1000000}
                            step={addon.comboDiscountType === 'percentage' ? 1 : 0.01}
                            onChange={val => change({ comboDiscountValue: val === null ? 0 : (addon.comboDiscountType === 'percentage' ? Math.round(val) : Math.round(val * 100)) })}
                          />
                        )}
                        <SelectField
                          label="Formato de atendimento"
                          options={[
                            ['match_service', 'Seguir serviço vinculado'],
                            ['individual', 'Individual (1 vaga/horário)'],
                            ['duo', 'Dupla (2 vagas/horário)'],
                            ['group', 'Grupo / Turma reduzida']
                          ] as const}
                          value={addon.attendanceFormat || 'match_service'}
                          onChange={attendanceFormat =>
                            attendanceFormat &&
                            change({
                              attendanceFormat,
                              sessionCapacity:
                                attendanceFormat === 'individual'
                                  ? 1
                                  : attendanceFormat === 'duo'
                                    ? 2
                                    : attendanceFormat === 'group'
                                      ? (addon.sessionCapacity && addon.sessionCapacity >= 2 ? addon.sessionCapacity : 4)
                                      : null
                            })
                          }
                        />
                        {(addon.attendanceFormat || 'match_service') === 'group' && (
                          <NumberField
                            label="Capacidade por horário (mín. 2)"
                            value={addon.sessionCapacity ?? null}
                            min={2}
                            max={500}
                            onChange={sessionCapacity => change({ sessionCapacity })}
                          />
                        )}
                        <SelectField
                          label="Escolha de profissional pelo aluno"
                          options={[
                            ['student_picks', 'Aluno escolhe profissional habilitado'],
                            ['auto_assign', 'Atribuir profissional disponível automaticamente']
                          ] as const}
                          value={addon.professionalSelectionMode || 'student_picks'}
                          onChange={professionalSelectionMode =>
                            professionalSelectionMode && change({ professionalSelectionMode })
                          }
                        />
                      </div>

                      {addonProfCandidates.length > 0 ? (
                        <div className="space-y-1">
                          <div className="text-[11px] font-semibold text-slate-600">
                            Profissionais elegíveis neste complemento (vazio = todos os vinculados ao serviço-alvo)
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {addonProfCandidates.map(prof => {
                              const selected = Array.isArray(addon.enabledProfessionalIds) && addon.enabledProfessionalIds.includes(prof.id);
                              return (
                                <button
                                  key={prof.id}
                                  type="button"
                                  onClick={() => {
                                    const currentIds = Array.isArray(addon.enabledProfessionalIds) ? addon.enabledProfessionalIds : [];
                                    const nextIds = selected
                                      ? currentIds.filter(id => id !== prof.id)
                                      : [...currentIds, prof.id];
                                    change({ enabledProfessionalIds: nextIds });
                                  }}
                                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors ${
                                    selected
                                      ? 'bg-indigo-600 text-white border-indigo-600'
                                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                  }`}
                                >
                                  {prof.name}{prof.professionName ? ` · ${prof.professionName}` : ''}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                          Nenhum instrutor elegível vinculado diretamente ao serviço escolhido ainda. Deixe em branco para usar a equipe compatível ou crie um serviço complementar.
                        </div>
                      )}

                      <div className="space-y-1">
                        <div className="text-[11px] font-semibold text-slate-600">
                          Dias permitidos (vazio = conforme agenda disponível)
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {WEEKDAY_SHORT.map((wdLabel, wdIdx) => {
                            const selected = Array.isArray(addon.allowedWeekdays) && addon.allowedWeekdays.includes(wdIdx);
                            return (
                              <button
                                key={wdIdx}
                                type="button"
                                onClick={() => {
                                  const cur = Array.isArray(addon.allowedWeekdays) ? addon.allowedWeekdays : [];
                                  const next = selected
                                    ? cur.filter(d => d !== wdIdx)
                                    : [...cur, wdIdx].sort((a, b) => a - b);
                                  change({ allowedWeekdays: next });
                                }}
                                className={`px-2 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors ${
                                  selected
                                    ? 'bg-teal-600 text-white border-teal-600'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                {wdLabel}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Seleção explícita de quais opções comerciais deste serviço aceitam o complemento */}
                      {(() => {
                        const existingSvc = row.action === 'update' ? draft.catalog.services.find(s => s.id === row.existingId) : null;
                        const planChoices: Array<{ key: string; label: string }> = [
                          ...row.prices
                            .filter(p => !(p.unit === 'per_session' && !p.duration && !p.frequencyType))
                            .map((p, pi) => {
                              const pKey = p.key || `p${pi + 1}`;
                              const durLbl = durations.find(([k]) => k === p.duration)?.[1] || '';
                              const freqLbl =
                                p.frequencyType === 'unlimited'
                                  ? 'Acesso livre'
                                  : p.frequencyCount
                                    ? `${p.frequencyCount}x/${p.frequencyType === 'monthly' ? 'mês' : 'sem'}`
                                    : '';
                              const priceLbl = p.amountCents
                                ? `R$ ${(p.amountCents / 100).toFixed(2).replace('.', ',')}`
                                : '';
                              const fullLbl = [p.label || durLbl || `Plano ${pi + 1}`, p.label ? '' : freqLbl, priceLbl].filter(Boolean).join(' — ');
                              return { key: pKey, label: fullLbl };
                            }),
                          ...(existingSvc?.commercialOptions || []).map(co => ({
                            key: `existing-opt:${co.id}`,
                            label: `${co.label} — R$ ${(co.amountCents / 100).toFixed(2).replace('.', ',')} (já cadastrado)`
                          }))
                        ];
                        if (planChoices.length === 0) return null;
                        const scopeMode = addon.baseOptionScopeMode || (addon.baseOptionScopeUnclear ? 'undecided' : ((addon.acceptedBasePriceKeys || []).length > 0 ? 'selected' : 'all'));
                        const needsScopeChoice = Boolean(addon.baseOptionScopeUnclear || scopeMode === 'undecided' || (scopeMode === 'selected' && (addon.acceptedBasePriceKeys || []).length === 0));
                        return (
                          <div className={`rounded-xl border p-3 space-y-2 ${needsScopeChoice ? 'border-amber-300 bg-amber-50/70' : 'border-teal-200 bg-teal-50/40'}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs font-bold text-slate-900">
                                Em quais planos este acompanhamento poderá ser contratado?
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px]">
                                <button
                                  type="button"
                                  onClick={() => change({ baseOptionScopeMode: 'selected', baseOptionScopeUnclear: false })}
                                  className={`px-2 py-0.5 rounded-lg border font-bold cursor-pointer ${
                                    scopeMode === 'selected'
                                      ? 'bg-teal-700 text-white border-teal-700'
                                      : 'bg-white text-slate-600 border-slate-200'
                                  }`}
                                >
                                  Somente nos planos selecionados
                                </button>
                                <button
                                  type="button"
                                  onClick={() => change({ baseOptionScopeMode: 'all', baseOptionScopeUnclear: false, acceptedBasePriceKeys: [] })}
                                  className={`px-2 py-0.5 rounded-lg border font-bold cursor-pointer ${
                                    scopeMode === 'all'
                                      ? 'bg-slate-700 text-white border-slate-700'
                                      : 'bg-white text-slate-600 border-slate-200'
                                  }`}
                                >
                                  Todos os planos
                                </button>
                              </div>
                            </div>
                            {needsScopeChoice && (
                              <p className="text-[11px] text-amber-900 font-medium">
                                Selecione abaixo uma ou mais opções comerciais autorizadas (ou confirme se vale para todos os planos). O sistema não vincula automaticamente a todos os planos.
                              </p>
                            )}
                            {scopeMode !== 'all' && (
                              <div className="flex flex-wrap gap-1.5">
                                {planChoices.map(pc => {
                                  const selected = Array.isArray(addon.acceptedBasePriceKeys) && addon.acceptedBasePriceKeys.includes(pc.key);
                                  return (
                                    <button
                                      key={pc.key}
                                      type="button"
                                      onClick={() => {
                                        const cur = Array.isArray(addon.acceptedBasePriceKeys) ? addon.acceptedBasePriceKeys : [];
                                        const next = selected ? cur.filter(k => k !== pc.key) : [...cur, pc.key];
                                        change({
                                          acceptedBasePriceKeys: next,
                                          baseOptionScopeMode: 'selected',
                                          baseOptionScopeUnclear: false
                                        });
                                      }}
                                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors ${
                                        selected
                                          ? 'bg-teal-600 text-white border-teal-600'
                                          : 'bg-white text-slate-700 border-slate-200 hover:border-teal-300'
                                      }`}
                                    >
                                      {selected ? '✓ ' : ''}{pc.label}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      <div className="flex flex-wrap items-center gap-4">
                        <Checkbox label="Complemento ativo para seleção" checked={addon.active !== false} onChange={active => change({ active })} />
                        <Checkbox label="Disponível no link público" checked={addon.allowPublicBooking !== false} onChange={allowPublicBooking => change({ allowPublicBooking })} />
                        {addon.mandatoryUnclear === true ? null : (
                          <Checkbox label="Marcar obrigatoriedade como ambígua" checked={false} onChange={checked => change({ mandatoryUnclear: checked })} />
                        )}
                      </div>
                    </div>
                    );
                  }}
                />
              )}
            </>
          )}

          {/* Rodapé do Card: Publicação e Aprovação */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            {row.action === 'create' && !row.deferSchedules && (
              <Checkbox label="Exibir no link público de agendamento" checked={row.allowPublicBooking !== false}
                onChange={allowPublicBooking => onChange({ allowPublicBooking })} />
            )}
            {row.action !== 'ignore' && (
              <Checkbox label="Conferi as informações e aprovo esta ação" checked={row.reviewed}
                onChange={reviewed => onChange({ reviewed })} />
            )}
          </div>
        </div>
      )}
    </details>
  );
}

function PackageEditor({
  row,
  draft,
  isOpen,
  onToggleOpen,
  onChange
}: {
  row: ProposedPackage;
  draft: ImportDraft;
  isOpen: boolean;
  onToggleOpen: (open: boolean) => void;
  onChange: (patch: Partial<ProposedPackage>) => void;
}) {
  const links = draft.catalog.packages.filter(p => p.active).map(p => [p.id, p.name] as const);
  const components = [
    ...draft.proposal.services.filter(s => s.action !== 'ignore').map(s => [s.key, (s.name || 'Serviço sem nome') + ' (desta importação)'] as const),
    ...draft.catalog.services.filter(s => s.active).map(s => ['existing:' + s.id, s.name + ' (catálogo)'] as const)
  ];
  const matches = draft.matches.packages[row.key] || [];
  const needsConfirmation = row.issues.length > 0 || !row.price?.amountCents || !row.price.unit || row.items.some(i => !i.serviceRef);

  return (
    <details
      id={`import-card-${row.key}`}
      open={isOpen}
      onToggle={e => onToggleOpen(e.currentTarget.open)}
      className="group rounded-2xl border border-slate-200 bg-white open:border-indigo-300 shadow-2xs transition-colors"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="break-words text-sm font-bold text-slate-900">{row.name || 'Pacote sem nome'}</h4>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
              {row.items.length} {row.items.length === 1 ? 'item' : 'itens'}
            </span>
            {row.price?.amountCents && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                {formatMoneyBrl(row.price.amountCents)}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {needsConfirmation ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 border border-amber-200">
                <AlertTriangle className="h-3 w-3" /> Precisa de confirmação
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> Sem pendências
              </span>
            )}
            {matches.length > 0 && (
              <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">
                Possível duplicidade: {matches[0].name}
              </span>
            )}
            <span className={row.action === 'ignore' ? 'text-slate-500 font-medium' : row.reviewed ? 'font-bold text-emerald-700' : 'font-semibold text-indigo-700'}>
              {row.action === 'ignore' ? 'Fora da importação' : row.reviewed ? 'Revisado e aprovado' : 'Selecionado para revisão'}
            </span>
          </div>
        </div>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
      </summary>

      {isOpen && (
        <div className="space-y-4 border-t border-slate-100 p-4">
          <Evidence ids={row.sources} files={draft.sources} />
          {row.issues.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
              <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 mt-0.5" />
              <ul className="space-y-1">{row.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Ação para este pacote" options={packageActions} value={row.action} onChange={action => onChange({ action: action || 'ignore' })} />
            {row.action === 'link' && <SelectField label="Pacote do catálogo" options={links} value={row.existingId} onChange={existingId => onChange({ existingId: existingId || '' })} />}
          </div>
          {row.action !== 'link' && (
            <>
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
                  {item.serviceName && <p className="text-xs text-slate-600">Lido no arquivo: <strong>{item.serviceName}</strong></p>}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SelectField label="Vincular ao serviço" options={components} value={item.serviceRef} onChange={serviceRef => change({ serviceRef: serviceRef || '' })} />
                    <NumberField label="Aulas ou unidades incluídas" value={item.includedCredits} max={500} onChange={includedCredits => change({ includedCredits })} />
                    <NumberField label="Frequência semanal do componente" value={item.weeklyFrequency} max={14} onChange={weeklyFrequency => change({ weeklyFrequency })} />
                    <NumberField label="Limite mensal do componente" value={item.monthlyLimit} max={200} onChange={monthlyLimit => change({ monthlyLimit })} />
                    <Checkbox label="Componente obrigatório" checked={item.mandatory} onChange={mandatory => change({ mandatory })} />
                  </div>
                </>} />
            </>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            {row.action === 'create' && (
              <Checkbox label="Exibir no link público de agendamento" checked={row.allowPublicBooking !== false} onChange={allowPublicBooking => onChange({ allowPublicBooking })} />
            )}
            {row.action !== 'ignore' && <Checkbox label="Conferi as informações e aprovo esta ação" checked={row.reviewed} onChange={reviewed => onChange({ reviewed })} />}
          </div>
        </div>
      )}
    </details>
  );
}

export function StudioCatalogImportReview({ draft, onChange }: { draft: ImportDraft; onChange: (proposal: StudioProposal) => void }) {
  const { proposal, diagnostics } = draft;
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});
  const [activeTabs, setActiveTabs] = useState<Record<string, ServiceSectionTab>>({});

  const toggleOpen = (key: string, open: boolean) => setOpenKeys(prev => ({ ...prev, [key]: open }));
  const setTab = (key: string, tab: ServiceSectionTab) => setActiveTabs(prev => ({ ...prev, [key]: tab }));

  const jumpToAlert = (alert: ImportAlert) => {
    setOpenKeys(prev => ({ ...prev, [alert.recordKey]: true }));
    if (alert.scope === 'service') {
      const tabMap: Record<ImportAlert['section'], ServiceSectionTab> = {
        general: 'general',
        prices: 'prices',
        schedules: 'schedules',
        adjustments: 'adjustments',
        addons: 'addons',
        items: 'general'
      };
      setTab(alert.recordKey, tabMap[alert.section] || 'general');
    }
    window.requestAnimationFrame(() => {
      document.getElementById(`import-card-${alert.recordKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const isServiceRowReady = (row: ProposedService): boolean => {
    const existing = row.action === 'update' || row.action === 'link'
      ? draft.catalog.services.find(s => s.id === row.existingId)
      : undefined;
    const hasLiveSlotIssue =
      !row.deferSchedules &&
      row.schedules.some(s => !evaluateSlotLive(s, row, draft.catalog.services, draft.catalog.professionals).ok);
    const hasPriceIssue = row.prices.some(p => !p.amountCents || !p.unit || Boolean(p.ambiguousReason));
    const effType = existing?.type || row.type || '';
    const needsOpFields = ['individual', 'duo', 'group'].includes(row.type || effType);
    const hasAllSlotProfs = row.schedules.length > 0 && row.schedules.every(s => Boolean(s.professionalId));
    const hasEffProf = Boolean(row.professionalId || existing?.professionalId || hasAllSlotProfs);
    const hasEffModality = Boolean(row.modality || existing);
    const hasEffDuration = Boolean(row.durationMinutes || existing);
    const hasEffCapacity = (row.type || effType) !== 'group' || Boolean(row.capacity || existing?.capacity);
    const hasOpIssue = needsOpFields && (!hasEffModality || !hasEffDuration || !hasEffProf || !hasEffCapacity);
    const hasAddonIssue = (row.optionalAddons || []).some(
      a =>
        a.active &&
        (Boolean(a.mandatoryUnclear) ||
          Boolean(a.baseOptionScopeUnclear) ||
          a.baseOptionScopeMode === 'undecided' ||
          (a.baseOptionScopeMode === 'selected' && (!Array.isArray(a.acceptedBasePriceKeys) || a.acceptedBasePriceKeys.length === 0)) ||
          a.additionalPriceCents === null ||
          (!a.addonServiceRef && !a.addonServiceName) ||
          (a.attendanceFormat === 'group' && (!a.sessionCapacity || a.sessionCapacity < 2)))
    );
    return Boolean(
      row.name &&
      (row.type || existing) &&
      row.issues.length === 0 &&
      !hasLiveSlotIssue &&
      !hasPriceIssue &&
      !hasOpIssue &&
      !hasAddonIssue
    );
  };

  const isPackageRowReady = (pkg: ProposedPackage): boolean => {
    const existing = pkg.action === 'link'
      ? draft.catalog.packages.find(p => p.id === pkg.existingId)
      : undefined;
    return Boolean(
      pkg.name &&
      (existing || (pkg.price?.amountCents && pkg.price.unit && pkg.price.duration && pkg.price.paymentPeriod)) &&
      pkg.items.every(i => i.serviceRef) &&
      pkg.issues.length === 0
    );
  };

  const approveReadyBatch = () => {
    onChange({
      ...proposal,
      services: proposal.services.map(row => {
        if (!isServiceRowReady(row)) return row;
        return { ...row, action: row.action === 'ignore' ? 'create' : row.action, reviewed: true };
      }),
      packages: proposal.packages.map(pkg => {
        if (!isPackageRowReady(pkg)) return pkg;
        return { ...pkg, action: pkg.action === 'ignore' ? 'create' : pkg.action, reviewed: true };
      })
    });
  };

  const setPublicAllSelected = (allowPublicBooking: boolean) => {
    onChange({
      ...proposal,
      services: proposal.services.map(s => (s.action !== 'ignore' ? { ...s, allowPublicBooking } : s)),
      packages: proposal.packages.map(p => (p.action !== 'ignore' ? { ...p, allowPublicBooking } : p))
    });
  };

  const diagSummary = diagnostics?.summary;
  const liveReadyCount =
    proposal.services.filter(isServiceRowReady).length +
    proposal.packages.filter(isPackageRowReady).length;
  const totalItemsCount = proposal.services.length + proposal.packages.length;
  const livePendingCount = Math.max(0, totalItemsCount - liveReadyCount);
  const sum = {
    servicesTotal: proposal.services.length,
    priceOptionsTotal: proposal.services.reduce((acc, r) => acc + r.prices.length, 0),
    schedulesTotal: proposal.services.reduce((acc, r) => acc + (r.deferSchedules ? 0 : r.schedules.length), 0),
    packagesTotal: proposal.packages.length,
    readyTotal: liveReadyCount,
    pendingTotal: livePendingCount,
    duplicatesFound: diagSummary?.duplicatesFound ??
      (proposal.services.filter(s => (draft.matches.services[s.key]?.length || 0) > 0).length +
        proposal.packages.filter(p => (draft.matches.packages[p.key]?.length || 0) > 0).length)
  };

  return <div className="space-y-4">
    {/* Painel Resumo da Análise */}
    {totalItemsCount > 0 && (
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
        <div className="rounded-xl bg-white p-2 border border-slate-100">
          <div className="text-base font-extrabold text-slate-900">{sum.servicesTotal}</div>
          <div className="text-[11px] font-semibold text-slate-500">Serviços</div>
        </div>
        <div className="rounded-xl bg-white p-2 border border-slate-100">
          <div className="text-base font-extrabold text-indigo-700">{sum.priceOptionsTotal}</div>
          <div className="text-[11px] font-semibold text-slate-500">Planos/Preços</div>
        </div>
        <div className="rounded-xl bg-white p-2 border border-slate-100">
          <div className="text-base font-extrabold text-teal-700">{sum.schedulesTotal}</div>
          <div className="text-[11px] font-semibold text-slate-500">Horários</div>
        </div>
        <div className="rounded-xl bg-white p-2 border border-slate-100">
          <div className="text-base font-extrabold text-indigo-700">{sum.packagesTotal}</div>
          <div className="text-[11px] font-semibold text-slate-500">Pacotes</div>
        </div>
        <div className="rounded-xl bg-emerald-50 p-2 border border-emerald-100">
          <div className="text-base font-extrabold text-emerald-700">{sum.readyTotal}</div>
          <div className="text-[11px] font-semibold text-emerald-800">Sem pendências</div>
        </div>
        <div className="rounded-xl bg-amber-50 p-2 border border-amber-100">
          <div className="text-base font-extrabold text-amber-700">{sum.pendingTotal}</div>
          <div className="text-[11px] font-semibold text-amber-900">Para revisar</div>
        </div>
        <div className="rounded-xl bg-slate-100 p-2 border border-slate-200">
          <div className="text-base font-extrabold text-slate-800">{sum.duplicatesFound}</div>
          <div className="text-[11px] font-semibold text-slate-600">Semelhantes no cat.</div>
        </div>
      </div>
    )}

    {/* Ações em massa globais */}
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50/40 px-3 py-2.5 text-xs">
      <span className="font-bold text-indigo-950 flex items-center gap-1 mr-1">
        <Sparkles className="h-3.5 w-3.5 text-indigo-600" /> Ações rápidas:
      </span>
      <button
        type="button"
        onClick={approveReadyBatch}
        className="rounded-xl bg-indigo-600 px-3 py-1.5 font-bold text-white hover:bg-indigo-700 cursor-pointer"
      >
        Selecionar &amp; aprovar itens prontos
      </button>
      <button
        type="button"
        onClick={() => setPublicAllSelected(true)}
        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
      >
        Publicar selecionados no Link Público
      </button>
      <button
        type="button"
        onClick={() => setPublicAllSelected(false)}
        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
      >
        Manter selecionados como rascunho
      </button>
    </div>

    {/* Alertas navegáveis */}
    {diagnostics && diagnostics.alerts.length > 0 && (
      <details className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-xs" open={diagnostics.alerts.some(a => a.severity === 'blocking')}>
        <summary className="cursor-pointer font-bold text-amber-950 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            {diagnostics.alerts.length} {diagnostics.alerts.length === 1 ? 'ponto de atenção identificado' : 'pontos de atenção identificados'} (clique para ir direto ao item)
          </span>
          <span className="text-[11px] font-semibold text-amber-800">
            {diagnostics.summary.blockingAlertsCount} impedindo importação
          </span>
        </summary>
        <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
          {diagnostics.alerts.slice(0, 12).map(alert => (
            <li key={alert.id}>
              <button
                type="button"
                onClick={() => jumpToAlert(alert)}
                className={`w-full rounded-xl border px-2.5 py-1.5 text-left text-[11px] transition-colors cursor-pointer ${
                  alert.severity === 'blocking'
                    ? 'border-rose-200 bg-rose-50/90 text-rose-900 hover:bg-rose-100'
                    : 'border-amber-200 bg-white text-amber-900 hover:bg-amber-100/70'
                }`}
              >
                <span className="font-bold block truncate">{alert.recordName} · Ir para correção →</span>
                <span className="block truncate text-slate-700">{alert.message}</span>
              </button>
            </li>
          ))}
        </ul>
      </details>
    )}

    {proposal.services.length > 0 && (
      <section aria-label="Serviços identificados" className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Serviços e planos identificados</h3>
          <button
            type="button"
            onClick={() => {
              const allOpen = proposal.services.every(s => openKeys[s.key]);
              const next: Record<string, boolean> = { ...openKeys };
              for (const s of proposal.services) next[s.key] = !allOpen;
              setOpenKeys(next);
            }}
            className="text-xs font-semibold text-indigo-700 hover:underline cursor-pointer"
          >
            {proposal.services.every(s => openKeys[s.key]) ? 'Recolher todos' : 'Expandir todos'}
          </button>
        </div>
        {proposal.services.map(row => (
          <ServiceEditor
            key={row.key}
            row={row}
            draft={draft}
            isOpen={Boolean(openKeys[row.key])}
            activeTab={activeTabs[row.key] || 'general'}
            onToggleOpen={open => toggleOpen(row.key, open)}
            onTabChange={tab => setTab(row.key, tab)}
            onChange={patch => onChange({
              ...proposal,
              services: proposal.services.map(item => (item.key === row.key ? { ...item, reviewed: false, ...patch } : item))
            })}
            onCreateCompanionAddonService={(addonIndex, suggestedName) => {
              const cleanName = String(suggestedName || '').trim() || 'Acompanhamento Personal Trainer';
              const newKey = `svc-companion-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              const eligiblePros = draft.catalog.professionals.filter(
                p => p.isStudioEligible !== false
              );
              const preferredPro = eligiblePros[0];
              const companionService: ProposedService = {
                key: newKey,
                name: cleanName,
                activity: 'Personal Trainer',
                description: 'Serviço complementar agendável criado durante a revisão da importação.',
                notes: '',
                sources: [...row.sources],
                issues: [],
                reviewed: true,
                existingId: '',
                allowPublicBooking: true,
                type: 'individual',
                modality: 'presential',
                capacity: 1,
                durationMinutes: 60,
                weeklyLimit: null,
                monthlyLimit: null,
                professionalNames: preferredPro ? [preferredPro.name] : [],
                professionalId: preferredPro?.id || '',
                suggestedProfessionalId: preferredPro?.id || '',
                deferSchedules: false,
                action: 'create',
                apply: ['identity', 'prices', 'schedules'],
                prices: [
                  {
                    label: 'Sessão Avulsa',
                    unit: 'per_session',
                    duration: null,
                    frequencyType: null,
                    frequencyCount: null,
                    paymentPeriod: 'one_time',
                    installments: null,
                    participants: 1,
                    amountCents: row.optionalAddons?.[addonIndex]?.additionalPriceCents ?? 15000,
                    sources: [...row.sources],
                    evidence: ''
                  }
                ],
                schedules: [],
                adjustments: [],
                optionalAddons: []
              };
              const updatedServices = proposal.services.map(item => {
                if (item.key !== row.key) return item;
                const currentAddons = Array.isArray(item.optionalAddons) ? item.optionalAddons : [];
                return {
                  ...item,
                  reviewed: false,
                  optionalAddons: currentAddons.map((ao, ai) =>
                    ai === addonIndex
                      ? {
                          ...ao,
                          addonServiceRef: newKey,
                          addonServiceName: cleanName,
                          mandatoryUnclear: false,
                          scheduleTiming: ao.scheduleTiming === 'not_applicable' ? 'after_confirmation' : ao.scheduleTiming
                        }
                      : ao
                  )
                };
              });
              setOpenKeys(prev => ({ ...prev, [newKey]: true }));
              onChange({
                ...proposal,
                services: [...updatedServices, companionService]
              });
            }}
          />
        ))}
      </section>
    )}

    {proposal.packages.length > 0 && (
      <section aria-label="Pacotes identificados" className="space-y-2.5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Pacotes combinados</h3>
        {proposal.packages.map(row => (
          <PackageEditor
            key={row.key}
            row={row}
            draft={draft}
            isOpen={Boolean(openKeys[row.key])}
            onToggleOpen={open => toggleOpen(row.key, open)}
            onChange={patch => onChange({
              ...proposal,
              packages: proposal.packages.map(item => (item.key === row.key ? { ...item, reviewed: false, ...patch } : item))
            })}
          />
        ))}
      </section>
    )}
  </div>;
}
