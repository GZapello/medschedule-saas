import { FrequencyPricing, WeeklyMeeting, supportsFrequencyPricing, offeredWeeklyMeetings } from '../../utils/studioFrequencyPricing';
import { calculateStudioRecurringPrice, StudioPricingRule } from '../../utils/studioPricing';
import {
  calculateCommercialOptionBreakdown,
  PAYMENT_PERIODICITY_LABELS,
  StudioCommercialPriceOption,
  StudioOptionalAddonsConfig
} from '../../utils/studioAccessAndCommercial';

const formatCurrencyFromCents = (cents?: number | null) =>
  formatCurrencyBRL((Number(cents) || 0) / 100);
import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { Calendar, ChevronDown, CreditCard, Dumbbell, FileText, SlidersHorizontal, Users } from 'lucide-react';
import { ClassScheduleItem } from '../../types';
import { DraftClassScheduleInput } from './ClassScheduleSection';
import {
  formatCurrencyBRL, formatCustomIntervalLabel, isPeriodicBillingMode, PLAN_DURATION_LABELS,
  PlanDurationCode, RECURRENCE_FREQUENCY_LABELS, RecurrenceFrequency, RecurrenceIntervalSpec,
  SERVICE_BILLING_MODE_LABELS, ServiceBillingMode
} from '../../utils/establishmentContext';
import './StudioServicePresentation.css';

interface PresentationValues {
  name: string;
  professionalId: string;
  serviceKind: 'individual' | 'group';
  studioServiceType?: 'facility_access' | 'individual' | 'group' | 'non_scheduled';
  requiresAppointment?: boolean;
  allowSingleBooking?: boolean;
  allowPlanBooking?: boolean;
  planCreditMode?: 'fixed_credits' | 'weekly_guaranteed' | 'unlimited';
  price: string;
  billingMode: ServiceBillingMode;
  periodicPrice: string;
  commercialPriceOptions?: StudioCommercialPriceOption[];
  optionalAddons?: StudioOptionalAddonsConfig;
  frequencyPricing?: FrequencyPricing;
  individualMeetings?: WeeklyMeeting[];
  pricingRule?: StudioPricingRule;
  defaultBillingDueDay: string;
  weeklySessionsCount: number;
  includedSessionsCount: number;
  allowRecurrence: boolean;
  defaultFrequency: RecurrenceFrequency;
  defaultCustomInterval: RecurrenceIntervalSpec | null;
  defaultPlanDuration: PlanDurationCode;
  linkedTemplateIds: string[];
  defaultTemplateId: string;
  draftSchedules: DraftClassScheduleInput[];
  schedules?: ClassScheduleItem[];
  hasPendingScheduleForm: boolean;
  reminderEnabled: boolean;
}

type Section = 'basics' | 'format' | 'recurrence' | 'billing' | 'templates' | 'description';
const sections = {
  basics: { title: 'Informações básicas', icon: SlidersHorizontal },
  format: { title: 'Formato da aula', icon: Users },
  recurrence: { title: 'Recorrência do serviço', icon: Calendar },
  billing: { title: 'Configuração de cobrança', icon: CreditCard },
  templates: { title: 'Templates de exercícios', icon: Dumbbell },
  description: { title: 'Descrição e lembretes', icon: FileText }
};
const Context = createContext<{
  values: PresentationValues;
  open: Record<Section, boolean>;
  toggle: (section: Section) => void;
} | null>(null);

const money = (value: string) => value.trim() !== '' && Number.isFinite(Number(value.replace(',', '.')))
  ? formatCurrencyBRL(Number(value.replace(',', '.'))) : 'Não definido';
const frequency = (v: PresentationValues) => !v.allowRecurrence ? 'Sem recorrência'
  : v.defaultFrequency === 'custom_interval' && v.defaultCustomInterval
    ? formatCustomIntervalLabel(v.defaultCustomInterval)
    : RECURRENCE_FREQUENCY_LABELS[v.defaultFrequency] || 'Não definido';
const templateCount = (v: PresentationValues) => v.linkedTemplateIds.length
  ? `${v.linkedTemplateIds.length} template${v.linkedTemplateIds.length > 1 ? 's' : ''} vinculado${v.linkedTemplateIds.length > 1 ? 's' : ''}`
  : 'Nenhum template selecionado';
const weekdays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const scheduleLines = (v: PresentationValues) => v.serviceKind !== 'group' ? [] : [
  ...(v.schedules || []).filter(s => Number(s.active) !== 0).map(s =>
    `${weekdays[s.day_of_week]} • ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`),
  ...v.draftSchedules.map(s => `${s.weekdays.map(day => weekdays[day]).join(', ')} • ${s.startTime}–${s.endTime}`)
];

const frequencyTotal = (v: PresentationValues) => v.frequencyPricing?.enabled && supportsFrequencyPricing(v.billingMode) ? calculateStudioRecurringPrice({
  serviceName: v.name, sessionPrice: Number(v.price), billingMode: v.billingMode, pricingRule: v.pricingRule,
  weeklySessionsCount: Math.max(1, Math.min(v.weeklySessionsCount, (v.serviceKind === 'individual' ? new Set((v.individualMeetings || []).map(m => m.weekday)).size : offeredWeeklyMeetings([...(v.schedules || []), ...v.draftSchedules]).length))), frequencyPricing: v.frequencyPricing
}).effectivePrice.toFixed(2) : null;

function sectionSummary(section: Section, v: PresentationValues) {
  const isNonScheduled = v.studioServiceType === 'facility_access' || v.studioServiceType === 'non_scheduled';
  const formatLabel =
    v.studioServiceType === 'facility_access'
      ? 'Acesso ao estabelecimento (sem agendamento)'
      : v.studioServiceType === 'non_scheduled'
        ? 'Serviço entregável (sem agendamento)'
        : v.serviceKind === 'group'
          ? 'Aula coletiva / Turma'
          : 'Individual';
  switch (section) {
    case 'basics': return v.name || 'Dados do serviço';
    case 'format': return formatLabel;
    case 'recurrence':
      if (isNonScheduled) return 'Não exige agendamento';
      return v.allowRecurrence
        ? [frequency(v), ...scheduleLines(v), PLAN_DURATION_LABELS[v.defaultPlanDuration]].join(' • ') : 'Sem recorrência';
    case 'billing': {
      const activeCommercial = (v.commercialPriceOptions || []).filter(o => o.active !== false);
      const singleEnabled = !isNonScheduled && v.allowSingleBooking !== false;
      if ((isNonScheduled || !singleEnabled) && activeCommercial.length > 0) {
        return `${activeCommercial.length} plano(s) comercial(is)${!singleEnabled && !isNonScheduled ? ' • Sem avulsa' : ''}`;
      }
      if (!singleEnabled && !isNonScheduled && isPeriodicBillingMode(v.billingMode)) {
        return `${SERVICE_BILLING_MODE_LABELS[v.billingMode]} • ${money(frequencyTotal(v) ?? v.periodicPrice)} por período • Sem avulsa`;
      }
      return `${SERVICE_BILLING_MODE_LABELS[v.billingMode]}${v.billingMode === 'package' ? '' : ` • ${money(isPeriodicBillingMode(v.billingMode) ? frequencyTotal(v) ?? v.periodicPrice : v.price)}${isPeriodicBillingMode(v.billingMode) ? ' por período' : ''}`}`;
    }
    case 'templates': return v.studioServiceType === 'facility_access' ? 'Não se aplica' : templateCount(v);
    case 'description': return v.reminderEnabled ? 'Lembrete ativado' : 'Opcional';
  }
}

/** Presentation only: does not validate, block saving or change any form values. */
export function StudioServicePresentation({ enabled, values, className, children, onClose, title }: {
  enabled: boolean; values: PresentationValues; className: string; children: React.ReactNode;
  onClose: () => void; title: string;
}) {
  const [open, setOpen] = useState<Record<Section, boolean>>({
    basics: true, format: true, recurrence: false, billing: false, templates: false, description: false
  });
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const viewport = window.visualViewport;
    const updateViewport = () => {
      root.current?.style.setProperty('--studio-visible-height', `${viewport?.height ?? window.innerHeight}px`);
      root.current?.style.setProperty('--studio-visible-top', `${viewport?.offsetTop ?? 0}px`);
    };
    updateViewport();
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    const previousFocus = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLElement>('[data-studio-field="name"]')?.focus();
    return () => {
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      previousFocus?.focus();
    };
  }, [enabled]);

  // Match the existing save feedback only to reveal its location. The original
  // handlers remain the sole authority for validation, messages and persistence.
  const revealSaveFeedback = () => {
    const v = values;
    const periodic = isPeriodicBillingMode(v.billingMode);
    const singleEnabled = v.allowSingleBooking !== false && v.requiresAppointment !== false && v.studioServiceType !== 'facility_access' && v.studioServiceType !== 'non_scheduled';
    let section: Section | undefined;
    let field = '';
    if (!v.name.trim()) { section = 'basics'; field = 'name'; }
    else if (singleEnabled && (!v.price || Number(v.price) < 0)) { section = 'basics'; field = 'price'; }
    else if (periodic && !((v.commercialPriceOptions || []).some(o => o.active !== false)) && (!v.periodicPrice.trim() || Number(v.periodicPrice) < 0)) { section = 'billing'; }
    else if (periodic && v.defaultBillingDueDay.trim() !== '' &&
      (!Number.isInteger(Number(v.defaultBillingDueDay)) || Number(v.defaultBillingDueDay) < 1 || Number(v.defaultBillingDueDay) > 28)) { section = 'billing'; }
    else if (!v.professionalId && v.requiresAppointment !== false && v.studioServiceType !== 'facility_access' && v.studioServiceType !== 'non_scheduled') { section = 'basics'; field = 'professional'; }
    else if (v.serviceKind === 'group' && v.hasPendingScheduleForm) { section = 'recurrence'; }
    if (!section) return;
    setOpen(previous => ({ ...previous, [section!]: true }));
    requestAnimationFrame(() => {
      const target = root.current?.querySelector<HTMLElement>(field
        ? `[data-studio-field="${field}"]` : `[data-studio-section="${section}"] button`);
      target?.focus();
      target?.scrollIntoView({ block: 'nearest' });
    });
  };

  if (!enabled) return <div className={className}>{children}</div>;
  return (
    <Context.Provider value={{ values, open, toggle: section => setOpen(previous => ({ ...previous, [section]: !previous[section] })) }}>
      <div ref={root} role="dialog" aria-modal="true" aria-label={title}
        className="studio-service-dialog fixed sm:relative bg-white rounded-3xl w-full max-w-6xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClickCapture={event => {
          if ((event.target as HTMLElement).closest('[data-studio-save]')) revealSaveFeedback();
        }}
        onKeyDown={event => {
          // Nested editors retain their own keyboard handling.
          if ((event.target as HTMLElement).closest('[role="dialog"]') !== root.current) return;
          if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
          if (event.key !== 'Tab') return;
          const focusable = Array.from(root.current!.querySelectorAll<HTMLElement>('button, input, select, textarea, summary, [tabindex="0"]'))
            .filter(element => !element.hasAttribute('disabled') && element.getClientRects().length > 0);
          const first = focusable[0], last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
        {children}
      </div>
    </Context.Provider>
  );
}

export function StudioServiceIndicators() {
  const context = useContext(Context);
  if (!context) return null;
  const v = context.values;
  const isNonScheduled = v.studioServiceType === 'facility_access' || v.studioServiceType === 'non_scheduled';
  const kindLabel =
    v.studioServiceType === 'facility_access'
      ? 'Acesso ao estabelecimento'
      : v.studioServiceType === 'non_scheduled'
        ? 'Serviço entregável'
        : v.serviceKind === 'group'
          ? 'Aula coletiva'
          : 'Individual';
  const secondPill = isNonScheduled ? 'Sem agendamento' : frequency(v);
  const activeCommercialCount = (v.commercialPriceOptions || []).filter(o => o.active !== false).length;
  const thirdPill = activeCommercialCount > 0
    ? `${activeCommercialCount} plano${activeCommercialCount === 1 ? '' : 's'} comercial${activeCommercialCount === 1 ? '' : 'is'}`
    : SERVICE_BILLING_MODE_LABELS[v.billingMode];
  return <div className="flex flex-wrap gap-1.5 px-5 pb-3 sm:px-6 text-[11px] shrink-0 border-b border-slate-100">
    {[kindLabel, secondPill, thirdPill, 'Academia & Studio'].map((label, index) =>
      <span key={index} className={`px-2.5 py-1 rounded-lg border font-medium ${index === 3 ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-teal-50 border-teal-100 text-teal-800'}`}>{label}</span>)}
  </div>;
}

export function ServiceFormSection({ section, children }: { section: Section; children: React.ReactNode }) {
  const context = useContext(Context);
  const id = useId();
  if (!context) return <>{children}</>;
  const { title, icon: Icon } = sections[section];
  const expanded = context.open[section];
  return <section data-studio-section={section} className="min-w-0 rounded-2xl border border-slate-200 bg-white overflow-hidden">
    <h4>
      <button type="button" id={`${id}-heading`} aria-expanded={expanded} aria-controls={`${id}-content`}
        onClick={() => context.toggle(section)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600 cursor-pointer">
        <span className="flex items-center justify-center w-8 h-8 shrink-0 rounded-xl bg-teal-50 text-teal-700"><Icon className="w-4 h-4" /></span>
        <span className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3">
          <span className="font-bold text-sm text-slate-800">{title}</span>
          <span className="text-[11px] font-normal text-slate-500 sm:text-right break-words">{sectionSummary(section, context.values)}</span>
        </span>
        <ChevronDown aria-hidden="true" className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
    </h4>
    <div id={`${id}-content`} role="region" aria-labelledby={`${id}-heading`} hidden={!expanded}>
      <div className={`p-4 pt-1 ${section === 'basics' ? 'studio-service-basics grid grid-cols-1 sm:grid-cols-2 gap-4' : 'space-y-3'} ${['recurrence', 'billing', 'templates'].includes(section) ? 'studio-service-panel' : ''}`}>{children}</div>
    </div>
  </section>;
}

function SummaryCards({ values: v }: { values: PresentationValues }) {
  const times = scheduleLines(v);
  const isFacilityAccess = v.studioServiceType === 'facility_access';
  const isNonScheduled = isFacilityAccess || v.studioServiceType === 'non_scheduled';
  const singleEnabled = !isNonScheduled && v.allowSingleBooking !== false;
  const activeCommercial = (v.commercialPriceOptions || []).filter(o => o.active !== false);
  const activeAddons = (v.optionalAddons?.options || []).filter(o => o.active !== false);

  return <div className="space-y-3">
    <div className="rounded-2xl border border-teal-100 bg-white p-4">
      <h4 className="flex items-center gap-2 font-bold text-sm text-teal-800"><CreditCard className="w-4 h-4" />Resumo comercial</h4>
      <dl className="mt-4 space-y-3 text-xs">
        <SummaryRow
          label="Aula avulsa"
          value={isNonScheduled ? 'Sem aula avulsa' : (singleEnabled ? money(v.price) : 'Não vende avulso')}
        />
        {activeCommercial.length === 0 && (
          <>
            <SummaryRow label="Tipo de cobrança" value={SERVICE_BILLING_MODE_LABELS[v.billingMode]} />
            {isPeriodicBillingMode(v.billingMode) && <>
              {frequencyTotal(v) !== null && <SummaryRow label="Preço" value="Conforme frequência semanal" />}
              {v.periodicPrice?.trim() && <SummaryRow label="Valor por período" value={money(frequencyTotal(v) ?? v.periodicPrice)} />}
              {!isNonScheduled && (
                <SummaryRow label={v.billingMode === 'count' ? 'Quantidade de aulas' : 'Aulas por semana'} value={String(v.billingMode === 'count' ? v.includedSessionsCount : v.weeklySessionsCount)} />
              )}
            </>}
          </>
        )}
        {v.allowPlanBooking !== false && v.planCreditMode && (
          <SummaryRow
            label="Regra dos planos"
            value={
              isFacilityAccess || v.planCreditMode === 'unlimited'
                ? 'Acesso livre / vigência contratual'
                : v.planCreditMode === 'weekly_guaranteed'
                  ? 'Frequência semanal garantida (Modelo B)'
                  : 'Créditos fixos por ciclo (Modelo A)'
            }
          />
        )}
        {activeCommercial.length > 0 && (
          <SummaryRow
            label={`Opções comerciais (${activeCommercial.length})`}
            value={activeCommercial
              .map(o => {
                const q = calculateCommercialOptionBreakdown(o);
                const freqText = o.frequencyType === 'unlimited'
                  ? 'Acesso livre'
                  : (o.frequencyType === 'fixed_count'
                      ? `${o.frequencyCount || 1} aulas`
                      : `${o.frequencyCount || 1}x/${o.frequencyType === 'monthly' ? 'mês' : 'sem'}`);
                return `${o.label || 'Plano'} (${freqText})\nContrato: ${PLAN_DURATION_LABELS[o.contractDurationCode]} · ${PAYMENT_PERIODICITY_LABELS[o.paymentPeriodicity]}\nEquiv. mensal: ${formatCurrencyFromCents(q.monthlyEquivalentCents)}/mês · Total contrato: ${formatCurrencyFromCents(q.totalContractAmountCents)}`;
              })
              .join('\n\n')}
          />
        )}
        {v.optionalAddons?.enabled && activeAddons.length > 0 && (
          <SummaryRow
            label="Complementos opcionais"
            value={activeAddons
              .map(a => `${a.label || a.addonServiceName || 'Complemento'}: +${formatCurrencyFromCents(a.additionalPriceCents)}`)
              .join('\n')}
          />
        )}
      </dl>
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h4 className="flex items-center gap-2 font-bold text-sm text-slate-800"><Calendar className="w-4 h-4 text-teal-600" />{isNonScheduled ? 'Controle de acesso' : 'Recorrência'}</h4>
      <dl className="mt-4 space-y-3 text-xs">
        {isNonScheduled ? (
          <>
            <SummaryRow label="Agendamento" value="Não exige reserva de horário ou instrutor" />
            <SummaryRow label="Vigência padrão" value={v.allowRecurrence ? PLAN_DURATION_LABELS[v.defaultPlanDuration] || 'Mensal / Contínuo' : 'Livre'} />
          </>
        ) : (
          <>
            <SummaryRow label="Frequência" value={frequency(v)} />
            <SummaryRow label="Dias e horários" value={times.length ? times.join('\n') : 'Não definido'} />
            <SummaryRow label="Vigência" value={v.allowRecurrence ? PLAN_DURATION_LABELS[v.defaultPlanDuration] || 'Não definido' : 'Não definido'} />
          </>
        )}
      </dl>
    </div>
    {!isFacilityAccess && (
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
        <h4 className="flex items-center gap-2 font-bold text-sm text-indigo-900"><Dumbbell className="w-4 h-4 text-indigo-600" />Templates vinculados</h4>
        <p className="text-xs text-slate-600 mt-3">{templateCount(v)}</p>
        {v.defaultTemplateId && <p className="text-[11px] text-indigo-700 mt-2">Template padrão definido</p>}
      </div>
    )}
  </div>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="space-y-1"><dt className="text-slate-500">{label}</dt><dd className="font-semibold text-slate-800 whitespace-pre-line break-words">{value}</dd></div>;
}

export function ServiceFormBody({ children }: { children: React.ReactNode }) {
  const context = useContext(Context);
  if (!context) return <div className="p-6 overflow-y-auto flex-1 space-y-3.5 text-xs">{children}</div>;
  return <div className="studio-service-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/70 p-3 sm:p-5 text-xs">
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_16rem] gap-5 items-start">
      <div className="min-w-0 space-y-3">{children}</div>
      <aside aria-label="Resumo do serviço" className="hidden lg:block sticky top-0"><SummaryCards values={context.values} /></aside>
      <details className="lg:hidden rounded-2xl border border-slate-200 bg-white p-4">
        <summary className="font-bold text-sm text-slate-800 cursor-pointer">Resumo do serviço</summary>
        <div className="pt-4"><SummaryCards values={context.values} /></div>
      </details>
    </div>
  </div>;
}
