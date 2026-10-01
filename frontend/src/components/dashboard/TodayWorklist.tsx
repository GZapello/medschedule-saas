import React from 'react';

export function TodayWorklist({ data, onNavigate, onPatient }: {
  data: any; onNavigate: (view: string) => void; onPatient: (id: string) => void;
}) {
  if (!data) return null;
  const patient = (row: any) => <button type="button" className="text-teal-700 font-bold text-left" onClick={() => onPatient(row.patient_id)}>{row.patient_name}</button>;
  const date = (value?: string) => value ? new Date(value.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : 'Sem data prevista';
  return <section aria-label="Pendências de hoje" className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
    <article className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
      <h3 className="font-bold text-slate-900">Atendimentos e rascunhos</h3>
      {!data.unfinished.length && !data.drafts.length && <p className="text-xs text-slate-500">Nenhuma pendência encontrada.</p>}
      {data.unfinished.map((row: any) => <div key={row.id} className="text-xs">{patient(row)}<p className="text-slate-500">Em andamento · {date(row.start_time)}</p></div>)}
      {data.drafts.map((row: any, i: number) => <div key={i} className="text-xs">{patient(row)}<p className="text-slate-500">Rascunho · {row.module_type} · {date(row.updated_at)}</p></div>)}
      <button type="button" onClick={() => onNavigate('calendar')} className="text-xs font-bold text-teal-700">Abrir agenda</button>
    </article>
    <article className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
      <h3 className="font-bold text-slate-900">Exames a receber ({data.examCount})</h3>
      {!data.exams.length && <p className="text-xs text-slate-500">Nenhum exame pendente disponível.</p>}
      {data.exams.map((row: any) => <div key={row.id} className="text-xs">{patient(row)}<p>{row.exam_name}</p><p className="text-slate-500">{date(row.expected_date)} · {row.status === 'delayed' ? 'Atrasado' : 'Aguardando'}</p></div>)}
      <button type="button" onClick={() => onNavigate('pending-exams')} className="text-xs font-bold text-teal-700">Ver exames</button>
    </article>
    <article className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
      <h3 className="font-bold text-slate-900">Retornos previstos</h3>
      {!data.returns.length && <p className="text-xs text-slate-500">Nenhum retorno pendente até os próximos sete dias.</p>}
      {data.returns.map((row: any) => <div key={row.id} className="text-xs">{patient(row)}<p className="text-slate-500">{date(row.start_time)}</p></div>)}
    </article>
    {data.alerts.length > 0 && <article className="bg-amber-50 rounded-2xl border border-amber-200 p-5 space-y-3">
      <h3 className="font-bold text-slate-900">Alergias registradas · pacientes de hoje</h3>
      {data.alerts.map((row: any, i: number) => <p key={i} className="text-xs">{patient(row)} · {row.agent}{row.reaction && ` — ${row.reaction}`}</p>)}
    </article>}
    {data.finance && <article className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
      <h3 className="font-bold text-slate-900">Financeiro do dia</h3>
      <p className="text-xs">Recebidos: {Number(data.finance.received).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
      <p className="text-xs">Pendentes: {Number(data.finance.pending).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
    </article>}
  </section>;
}
