import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ChevronDown, CreditCard, Layers, Package, Repeat, ShieldCheck } from 'lucide-react';
import { Service } from '../../types';
import { formatCurrencyBRL } from '../../utils/establishmentContext';
import './StudioPackagePresentation.css';

interface PackagePresentationValues {
  name: string;
  price: string;
  billingType: 'one_time' | 'recurring_monthly';
  billingFrequency: 'monthly' | 'quarterly' | 'semiannual' | 'annual';
  creditMode: 'per_service' | 'shared_pool';
  totalCredits: number;
  totalClasses: number;
  weeklyLimit: string;
  validityDays: number;
  installmentsCount: number;
  dueDay: number;
  absentPolicy: 'consume' | 'refund';
  cancelHoursLimit: number;
  allowPublicBooking: boolean;
  active: boolean;
  selectedItems: { serviceId: string; includedCredits: number }[];
  services: Service[];
}

type Section = 'basics' | 'values' | 'distribution' | 'services' | 'complementary';
const sections = {
  basics: { title: 'Informações básicas', icon: Package },
  values: { title: 'Valores e validade', icon: CreditCard },
  distribution: { title: 'Distribuição das aulas', icon: Repeat },
  services: { title: 'Serviços e aulas incluídos', icon: Layers },
  complementary: { title: 'Configurações complementares', icon: ShieldCheck }
};
const Context = createContext<{
  values: PackagePresentationValues;
  open: Record<Section, boolean>;
  toggle: (section: Section) => void;
} | null>(null);
const frequencies = { monthly: 'Mensal', quarterly: 'Trimestral', semiannual: 'Semestral', annual: 'Anual' };
const billingLabel = (v: PackagePresentationValues) => v.billingType === 'one_time' ? 'Pagamento único' : 'Assinatura periódica';
const frequencyLabel = (v: PackagePresentationValues) => v.billingType === 'one_time' ? 'Não se aplica' : frequencies[v.billingFrequency];
const distributionLabel = (v: PackagePresentationValues) => v.creditMode === 'shared_pool' ? 'Pacote livre' : 'Limite por modalidade';
const priceLabel = (v: PackagePresentationValues) => v.price.trim() !== '' && Number.isFinite(Number(v.price.replace(',', '.')))
  ? formatCurrencyBRL(Number(v.price.replace(',', '.'))) : 'Não definido';
const countLabel = (v: PackagePresentationValues) => `${v.selectedItems.length} serviço${v.selectedItems.length === 1 ? '' : 's'} selecionado${v.selectedItems.length === 1 ? '' : 's'}`;
const classesLabel = (v: PackagePresentationValues) => Number.isFinite(v.totalClasses) ? `${v.totalClasses} aulas` : 'Não definido';

function summary(section: Section, v: PackagePresentationValues) {
  switch (section) {
    case 'basics': return v.name.trim() || 'Dados do pacote';
    case 'values': return `${priceLabel(v)} • ${v.validityDays ? `${v.validityDays} dias` : 'Não definido'}`;
    case 'distribution': return `${distributionLabel(v)}${v.creditMode === 'shared_pool' ? ` • ${classesLabel(v)}` : ''}`;
    case 'services': return `${countLabel(v)} • ${classesLabel(v)} previstas`;
    case 'complementary': return `${v.active ? 'Ativo' : 'Inativo'} • ${v.allowPublicBooking ? 'Agendamento público' : 'Sem agendamento público'}`;
  }
}

/** Only layout and focus management. Saving and validation remain in PackageModal. */
export function StudioPackagePresentation({ enabled, values, title, onClose, className, children }: {
  enabled: boolean;
  values: PackagePresentationValues;
  title: string;
  onClose: () => void;
  className: string;
  children: React.ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<Record<Section, boolean>>({
    basics: true, values: true, distribution: false, services: false, complementary: false
  });

  useEffect(() => {
    if (!enabled) return;
    const viewport = window.visualViewport;
    const update = () => {
      root.current?.style.setProperty('--package-visible-height', `${viewport?.height ?? window.innerHeight}px`);
      root.current?.style.setProperty('--package-visible-top', `${viewport?.offsetTop ?? 0}px`);
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    const previousFocus = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLElement>('[data-package-field="name"]')?.focus();
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      previousFocus?.focus();
    };
  }, [enabled]);

  // Locate feedback for the existing custom validations without preventing submit,
  // modifying fields, adding constraints or replacing the original error messages.
  const revealSubmitFeedback = () => {
    const v = values;
    let section: Section | undefined;
    let field: string | undefined;
    if (!v.name.trim()) { section = 'basics'; field = 'name'; }
    else if (!Number.isFinite(Number(v.price.replace(',', '.'))) || Number(v.price.replace(',', '.')) < 0) { section = 'values'; field = 'price'; }
    else if (!v.selectedItems.length) { section = 'services'; }
    else if (v.creditMode === 'per_service') {
      const invalid = v.selectedItems.find(item => !Number.isInteger(Number(item.includedCredits)) || Number(item.includedCredits) < 1);
      if (invalid) { section = 'services'; field = `credits-${invalid.serviceId}`; }
    } else if (!Number.isInteger(Number(v.totalCredits)) || Number(v.totalCredits) < 1) { section = 'distribution'; field = 'totalCredits'; }
    if (!section) return;
    setOpen(previous => ({ ...previous, [section!]: true }));
    requestAnimationFrame(() => {
      const target = field
        ? root.current?.querySelector<HTMLElement>(`[data-package-field="${CSS.escape(field)}"]`)
        : root.current?.querySelector<HTMLElement>(`[data-package-section="${section}"] h4 > button`);
      target?.focus();
      target?.scrollIntoView({ block: 'nearest' });
    });
  };

  if (!enabled) return <div className={className}>{children}</div>;
  return <Context.Provider value={{ values, open, toggle: section => setOpen(previous => ({ ...previous, [section]: !previous[section] })) }}>
    <div ref={root} role="dialog" aria-modal="true" aria-label={title}
      className="studio-package-dialog fixed sm:relative bg-white rounded-3xl max-w-6xl w-full shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
      onInvalidCapture={event => {
        const section = (event.target as HTMLElement).closest<HTMLElement>('[data-package-section]')?.dataset.packageSection as Section | undefined;
        // Reveal synchronously so the browser can focus even a previously hidden
        // invalid control. Native constraints and their messages remain unchanged.
        if (section) flushSync(() => setOpen(previous => ({ ...previous, [section]: true })));
      }}
      onSubmitCapture={revealSubmitFeedback}
      onKeyDown={event => {
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
  </Context.Provider>;
}

export function StudioPackageIndicators() {
  const context = useContext(Context);
  if (!context) return null;
  const v = context.values;
  const labels = [billingLabel(v), ...(v.billingType === 'recurring_monthly' ? [frequencyLabel(v)] : []), distributionLabel(v), countLabel(v)];
  return <div className="flex flex-wrap gap-1.5 px-5 sm:px-6 pb-3 border-b border-slate-100 shrink-0 text-[11px]">
    {labels.map((label, index) => <span key={index} className={`px-2.5 py-1 rounded-lg border font-medium ${index === labels.length - 1 ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-teal-50 border-teal-100 text-teal-800'}`}>{label}</span>)}
  </div>;
}

export function PackageFormSection({ section, children }: { section: Section; children: React.ReactNode }) {
  const context = useContext(Context);
  const id = useId();
  if (!context) return <>{children}</>;
  const { title, icon: Icon } = sections[section];
  const expanded = context.open[section];
  return <section data-package-section={section} className="min-w-0 rounded-2xl border border-slate-200 bg-white overflow-hidden">
    <h4>
      <button type="button" id={`${id}-heading`} aria-expanded={expanded} aria-controls={`${id}-content`}
        onClick={() => context.toggle(section)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600 cursor-pointer">
        <span className="flex items-center justify-center w-8 h-8 shrink-0 rounded-xl bg-teal-50 text-teal-700"><Icon aria-hidden="true" className="w-4 h-4" /></span>
        <span className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3">
          <span className="font-bold text-sm text-slate-800">{title}</span>
          <span className="text-[11px] font-normal text-slate-500 sm:text-right break-words">{summary(section, context.values)}</span>
        </span>
        <ChevronDown aria-hidden="true" className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
    </h4>
    <div id={`${id}-content`} role="region" aria-labelledby={`${id}-heading`} hidden={!expanded}>
      <div className={`p-4 pt-1 ${section === 'basics' || section === 'values' ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : 'space-y-3'}`}>{children}</div>
    </div>
  </section>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="space-y-1"><dt className="text-slate-500">{label}</dt><dd className="font-semibold text-slate-800 break-words">{value || 'Não definido'}</dd></div>;
}

function SummaryCards({ values: v }: { values: PackagePresentationValues }) {
  const included = v.services.filter(service => v.selectedItems.some(item => item.serviceId === service.id));
  return <div className="space-y-3">
    <div className="rounded-2xl border border-teal-100 bg-white p-4">
      <h4 className="flex items-center gap-2 font-bold text-sm text-teal-800"><CreditCard aria-hidden="true" className="w-4 h-4" />Resumo comercial</h4>
      <dl className="mt-4 space-y-3 text-xs">
        <SummaryRow label="Nome do pacote" value={v.name.trim()} />
        <SummaryRow label="Valor" value={priceLabel(v)} />
        <SummaryRow label="Tipo de cobrança" value={billingLabel(v)} />
        <SummaryRow label="Periodicidade" value={frequencyLabel(v)} />
        <SummaryRow label="Validade" value={v.validityDays ? `${v.validityDays} dias` : 'Não definido'} />
      </dl>
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h4 className="flex items-center gap-2 font-bold text-sm text-slate-800"><Layers aria-hidden="true" className="w-4 h-4 text-teal-600" />Aulas incluídas</h4>
      <dl className="mt-4 space-y-3 text-xs">
        <SummaryRow label="Serviços" value={countLabel(v)} />
        <SummaryRow label="Quantidade total" value={classesLabel(v)} />
        <SummaryRow label="Distribuição" value={distributionLabel(v)} />
      </dl>
      {included.length ? <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
        {included.map(service => <li key={service.id} className="break-words">{service.name}</li>)}
      </ul> : <p className="mt-3 text-xs text-slate-500">Nenhum serviço selecionado</p>}
    </div>
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
      <h4 className="flex items-center gap-2 font-bold text-sm text-indigo-900"><ShieldCheck aria-hidden="true" className="w-4 h-4 text-indigo-600" />Configurações</h4>
      <dl className="mt-4 space-y-3 text-xs">
        {v.billingType === 'recurring_monthly'
          ? <SummaryRow label="Dia de vencimento" value={v.dueDay ? `Dia ${v.dueDay}` : 'Não definido'} />
          : <SummaryRow label="Parcelamento máximo" value={v.installmentsCount ? `${v.installmentsCount}x` : 'Não definido'} />}
        {v.creditMode === 'shared_pool' && <SummaryRow label="Limite semanal" value={v.weeklyLimit ? `${v.weeklyLimit} aulas` : 'Não definido'} />}
        <SummaryRow label="Faltas" value={v.absentPolicy === 'consume' ? 'Consumir aula do saldo' : 'Restituir crédito'} />
        <SummaryRow label="Cancelamento" value={`${v.cancelHoursLimit}h de antecedência`} />
        <SummaryRow label="Agendamento público" value={v.allowPublicBooking ? 'Disponível' : 'Indisponível'} />
        <SummaryRow label="Status" value={v.active ? 'Ativo' : 'Inativo'} />
      </dl>
    </div>
  </div>;
}

export function PackageFormBody({ children }: { children: React.ReactNode }) {
  const context = useContext(Context);
  if (!context) return <>{children}</>;
  return <div className="studio-package-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/70 p-3 sm:p-5">
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_16rem] gap-5 items-start">
      <div className="min-w-0 grid gap-3">{children}</div>
      <aside aria-label="Resumo do pacote" className="hidden lg:block sticky top-0"><SummaryCards values={context.values} /></aside>
      <details className="lg:hidden rounded-2xl border border-slate-200 bg-white p-4">
        <summary className="font-bold text-sm text-slate-800 cursor-pointer">Resumo do pacote</summary>
        <div className="pt-4"><SummaryCards values={context.values} /></div>
      </details>
    </div>
  </div>;
}
