import React from 'react';
import { Building2, ShieldCheck, Check, ArrowLeft } from 'lucide-react';

export const bookingButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
export const bookingSecondary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-50';
export const bookingInput = 'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600';

export function PublicBookingShell({ clinic, children }: { clinic?: any; children: React.ReactNode }) {
  return <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-800 sm:py-10">
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-6 flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white text-teal-700">
          {clinic?.logo_url ? <img src={clinic.logo_url} alt={`Logo ${clinic.trade_name || clinic.name}`} className="h-full w-full object-contain p-1" /> : <Building2 aria-hidden="true" className="h-7 w-7" />}
        </div>
        <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Agendamento online</p><h1 className="break-words text-xl font-bold text-slate-900 sm:text-2xl">{clinic?.trade_name || clinic?.name || 'Sua próxima consulta'}</h1>{(clinic?.city || clinic?.state) && <p className="text-sm text-slate-500">{[clinic.city, clinic.state].filter(Boolean).join(' / ')}</p>}</div>
      </header>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">{children}</div>
      <footer className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500"><ShieldCheck aria-hidden="true" className="h-4 w-4 text-teal-700" /><span>Agendamento seguro por</span><img src="/brand/zemda-logo.png" alt="Zemda" className="h-6 w-auto object-contain" /></footer>
    </div>
  </main>;
}

export function BookingStepIndicator({ step, individual }: { step: number; individual?: boolean }) {
  const labels = individual ? ['Data', 'Horário', 'Dados', 'Confirmação'] : ['Especialidade', 'Profissional', 'Data', 'Horário', 'Dados', 'Confirmação'];
  const active = individual ? step - 3 : step - 1;
  return <ol aria-label="Etapas do agendamento" className={`mb-6 grid gap-2 border-b border-slate-100 pb-5 ${individual ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3 sm:grid-cols-6'}`}>
    {labels.map((label, i) => <li key={label} aria-current={active === i ? 'step' : undefined} className={`flex min-w-0 flex-col items-start gap-1 text-[11px] sm:text-xs ${active === i ? 'font-bold text-teal-800' : 'text-slate-500'}`}><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${i <= active ? 'bg-teal-100 text-teal-800' : 'bg-slate-100'}`}>{i < active ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : i + 1}</span><span className="max-w-full break-words">{label}</span></li>)}
  </ol>;
}

export function BookingEmptyState({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center"><h2 className="font-semibold text-slate-900">{title}</h2>{description && <p className="mt-2 text-sm text-slate-600">{description}</p>}<div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div></div>;
}
export function BookingSkeleton() {
  return <div role="status" aria-label="Carregando agendamento" className="space-y-4"><span className="sr-only">Carregando agendamento…</span><div className="h-6 w-2/3 animate-pulse rounded bg-slate-100" /><div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />{[1,2,3].map(n => <div key={n} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}</div>;
}
export function BookingBackButton({ onClick }: { onClick: () => void }) { return <button type="button" onClick={onClick} className={bookingSecondary}><ArrowLeft aria-hidden="true" className="h-4 w-4" />Voltar</button>; }
