import React from 'react';
import { Building2, ShieldCheck, Check, ArrowLeft, MapPin, CalendarClock, Sparkles } from 'lucide-react';

export const bookingButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition-all hover:bg-teal-800 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export const bookingSecondary =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-2xs transition-all hover:border-teal-600/40 hover:bg-slate-50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-50';

export const bookingInput =
  'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-2xs transition focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20';

export function PublicBookingShell({ clinic, children }: { clinic?: any; children: React.ReactNode }) {
  const locationText = [clinic?.city, clinic?.state].filter(Boolean).join(' / ');
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-teal-50/20 px-4 py-6 text-slate-800 sm:py-10">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-6 flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-xs backdrop-blur-xs sm:p-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-teal-700 shadow-2xs">
            {clinic?.logo_url ? (
              <img
                src={clinic.logo_url}
                alt={`Logo ${clinic.trade_name || clinic.name}`}
                className="h-full w-full object-contain p-1.5"
              />
            ) : (
              <Building2 aria-hidden="true" className="h-7 w-7" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-teal-800 border border-teal-200/60">
              <Sparkles aria-hidden="true" className="h-3 w-3 text-teal-600" />
              <span>Agendamento online</span>
            </div>
            <h1 className="mt-1 break-words text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {clinic?.trade_name || clinic?.name || 'Sua próxima consulta'}
            </h1>
            {locationText && (
              <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-500 sm:text-sm">
                <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                <span>{locationText}</span>
              </p>
            )}
          </div>
        </header>

        <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-8">
          {children}
        </div>

        <footer className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
          <ShieldCheck aria-hidden="true" className="h-4 w-4 text-teal-700" />
          <span>Agendamento seguro por</span>
          <img src="/brand/zemda-logo.png" alt="Zemda" className="h-6 w-auto object-contain" />
        </footer>
      </div>
    </main>
  );
}

export function BookingStepIndicator({
  step,
  individual,
  onSelectStep
}: {
  step: number;
  individual?: boolean;
  onSelectStep?: (targetStep: number) => void;
}) {
  const labels = individual
    ? ['Data', 'Horário', 'Dados', 'Confirmação']
    : ['Especialidade', 'Profissional', 'Data', 'Horário', 'Dados', 'Confirmação'];
  const active = individual ? step - 3 : step - 1;
  const progressPercent = Math.min(100, Math.max(0, Math.round(((active + 1) / labels.length) * 100)));

  return (
    <div className="mb-6 border-b border-slate-100 pb-5">
      <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
        <span className="font-semibold text-teal-800">
          Etapa {Math.min(labels.length, Math.max(1, active + 1))} de {labels.length}: {labels[active] || ''}
        </span>
        <span className="font-medium text-slate-400">{progressPercent}% concluído</span>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-teal-600 to-emerald-500 transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <ol
        aria-label="Etapas do agendamento"
        className={`grid gap-2 ${individual ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3 sm:grid-cols-6'}`}
      >
        {labels.map((label, i) => {
          const isCompleted = i < active && step < 6;
          const isCurrent = active === i;
          const targetStep = individual ? i + 3 : i + 1;
          const canNavigateBack = Boolean(onSelectStep && isCompleted);

          return (
            <li
              key={label}
              aria-current={isCurrent ? 'step' : undefined}
              onClick={canNavigateBack ? () => onSelectStep!(targetStep) : undefined}
              className={`flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-[11px] transition sm:flex-col sm:items-start sm:gap-1 sm:text-xs ${
                isCurrent
                  ? 'border-teal-600/40 bg-teal-50/70 font-bold text-teal-900 shadow-2xs'
                  : isCompleted
                  ? `border-teal-100 bg-teal-50/30 font-medium text-teal-800 ${canNavigateBack ? 'cursor-pointer hover:bg-teal-50' : ''}`
                  : 'border-slate-100 bg-slate-50/60 text-slate-400'
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  isCurrent
                    ? 'bg-teal-700 text-white shadow-2xs'
                    : i <= active
                    ? 'bg-teal-100 text-teal-800'
                    : 'bg-slate-200/70 text-slate-500'
                }`}
              >
                {i < active ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="max-w-full truncate sm:whitespace-normal sm:break-words">{label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function BookingEmptyState({
  title,
  description,
  icon,
  suggestions,
  children
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  suggestions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50/90 to-white p-6 shadow-2xs">
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 border border-amber-200/60">
          {icon || <CalendarClock aria-hidden="true" className="h-6 w-6" />}
        </div>
        <h2 className="text-base font-bold text-slate-900 sm:text-lg">{title}</h2>
        {description && <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{description}</p>}
      </div>
      {suggestions && <div className="mt-5">{suggestions}</div>}
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2.5">{children}</div>}
    </div>
  );
}

export function BookingSkeleton() {
  return (
    <div role="status" aria-label="Carregando agendamento" className="space-y-4 py-2">
      <span className="sr-only">Carregando agendamento…</span>
      <div className="flex items-center gap-3">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
        <span className="text-xs font-semibold text-slate-500">Consultando disponibilidade em tempo real…</span>
      </div>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
          <div key={n} className="h-12 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

export function BookingBackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={bookingSecondary}>
      <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      Voltar
    </button>
  );
}
