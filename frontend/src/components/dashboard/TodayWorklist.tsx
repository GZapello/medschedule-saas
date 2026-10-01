import React from 'react';

export function TodayWorklist({ data, onNavigate, onPatient }: {
  data: any; onNavigate: (view: string) => void; onPatient: (id: string) => void;
}) {
  if (!data) return null;
  const patient = (row: any) => (
    <button
      type="button"
      className="text-teal-700 hover:text-teal-900 font-bold text-left truncate cursor-pointer transition-colors text-xs"
      onClick={() => onPatient(row.patient_id)}
      title="Abrir prontuário"
    >
      {row.patient_name}
    </button>
  );
  const date = (value?: string) => value ? new Date(value.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : 'Sem data';

  return (
    <section aria-label="Pendências de hoje" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
      {/* 1. Atendimentos e rascunhos */}
      <article className="bg-white rounded-xl border border-slate-200 p-3.5 sm:p-4 shadow-2xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="font-bold text-slate-800 text-xs sm:text-sm tracking-tight">Atendimentos e rascunhos</h3>
            {(data.unfinished?.length + data.drafts?.length > 0) && (
              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {data.unfinished.length + data.drafts.length}
              </span>
            )}
          </div>

          <div className="max-h-[176px] overflow-y-auto overflow-x-hidden space-y-2 pr-1.5 my-2.5 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]">
            {!data.unfinished?.length && !data.drafts?.length && (
              <p className="text-xs text-slate-400 py-2">Nenhuma pendência encontrada.</p>
            )}
            {data.unfinished?.map((row: any) => (
              <div key={row.id} className="text-xs bg-slate-50/70 hover:bg-slate-50 p-2 rounded-lg transition-colors border border-slate-100">
                <div className="truncate">{patient(row)}</div>
                <p className="text-[11px] text-slate-500 mt-0.5">Em andamento · {date(row.start_time)}</p>
              </div>
            ))}
            {data.drafts?.map((row: any, i: number) => (
              <div key={i} className="text-xs bg-slate-50/70 hover:bg-slate-50 p-2 rounded-lg transition-colors border border-slate-100">
                <div className="truncate">{patient(row)}</div>
                <p className="text-[11px] text-slate-500 mt-0.5">Rascunho · {row.module_type} · {date(row.updated_at)}</p>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('calendar')}
          className="text-xs font-bold text-teal-700 hover:text-teal-900 transition-colors pt-2 border-t border-slate-100 w-full text-left flex items-center justify-between cursor-pointer"
        >
          <span>Abrir agenda</span>
          <span className="text-slate-400 text-xs">→</span>
        </button>
      </article>

      {/* 2. Exames a receber */}
      <article className="bg-white rounded-xl border border-slate-200 p-3.5 sm:p-4 shadow-2xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="font-bold text-slate-800 text-xs sm:text-sm tracking-tight">
              Exames a receber
            </h3>
            {(data.examCount > 0 || data.exams?.length > 0) && (
              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {data.examCount || data.exams?.length}
              </span>
            )}
          </div>

          <div className="max-h-[176px] overflow-y-auto overflow-x-hidden space-y-2 pr-1.5 my-2.5 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]">
            {!data.exams?.length && (
              <p className="text-xs text-slate-400 py-2">Nenhum exame pendente disponível.</p>
            )}
            {data.exams?.map((row: any) => (
              <div key={row.id} className="text-xs bg-slate-50/70 hover:bg-slate-50 p-2 rounded-lg transition-colors border border-slate-100">
                <div className="truncate">{patient(row)}</div>
                <p className="font-medium text-slate-700 truncate text-[11px]">{row.exam_name}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {date(row.expected_date)} · <span className={row.status === 'delayed' ? 'text-rose-600 font-bold' : 'text-amber-600'}>{row.status === 'delayed' ? 'Atrasado' : 'Aguardando'}</span>
                </p>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('pending-exams')}
          className="text-xs font-bold text-teal-700 hover:text-teal-900 transition-colors pt-2 border-t border-slate-100 w-full text-left flex items-center justify-between cursor-pointer"
        >
          <span>Ver exames</span>
          <span className="text-slate-400 text-xs">→</span>
        </button>
      </article>

      {/* 3. Retornos previstos */}
      <article className="bg-white rounded-xl border border-slate-200 p-3.5 sm:p-4 shadow-2xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="font-bold text-slate-800 text-xs sm:text-sm tracking-tight">Retornos previstos</h3>
            {data.returns?.length > 0 && (
              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {data.returns.length}
              </span>
            )}
          </div>

          <div className="max-h-[176px] overflow-y-auto overflow-x-hidden space-y-2 pr-1.5 my-2.5 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]">
            {!data.returns?.length && (
              <p className="text-xs text-slate-400 py-2">Nenhum retorno previsto nos próximos 7 dias.</p>
            )}
            {data.returns?.map((row: any) => (
              <div key={row.id} className="text-xs bg-slate-50/70 hover:bg-slate-50 p-2 rounded-lg transition-colors border border-slate-100">
                <div className="truncate">{patient(row)}</div>
                <p className="text-[11px] text-slate-500 mt-0.5">Previsão: {date(row.start_time)}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
          Janela de acompanhamento: 7 dias
        </p>
      </article>

      {/* 4. Alergias (se houver) */}
      {data.alerts?.length > 0 && (
        <article className="bg-amber-50/80 rounded-xl border border-amber-200 p-3.5 sm:p-4 shadow-2xs flex flex-col justify-between md:col-span-2 xl:col-span-3">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-amber-200/60">
              <h3 className="font-bold text-amber-900 text-xs sm:text-sm tracking-tight">Alergias registradas · pacientes de hoje</h3>
              <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                {data.alerts.length}
              </span>
            </div>
            <div className="max-h-[140px] overflow-y-auto overflow-x-hidden space-y-1.5 pr-1.5 my-2 [scrollbar-width:thin] [scrollbar-color:#f59e0b_transparent]">
              {data.alerts.map((row: any, i: number) => (
                <p key={i} className="text-xs text-amber-950 bg-white/70 p-1.5 rounded-lg border border-amber-200/50">
                  {patient(row)} · <strong className="text-rose-700">{row.agent}</strong>{row.reaction && ` — ${row.reaction}`}
                </p>
              ))}
            </div>
          </div>
        </article>
      )}

      {/* 5. Financeiro do dia (se autorizado) */}
      {data.finance && (
        <article className="bg-white rounded-xl border border-slate-200 p-3.5 sm:p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="font-bold text-slate-800 text-xs sm:text-sm tracking-tight">Financeiro do dia</h3>
          </div>
          <div className="space-y-1.5 my-2 text-xs">
            <div className="flex justify-between items-center text-emerald-700 font-semibold bg-emerald-50/60 p-2 rounded-lg">
              <span>Recebidos:</span>
              <span>{Number(data.finance.received).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
            </div>
            <div className="flex justify-between items-center text-rose-700 font-semibold bg-rose-50/60 p-2 rounded-lg">
              <span>Pendentes:</span>
              <span>{Number(data.finance.pending).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-100">Consolidado em tempo real</p>
        </article>
      )}
    </section>
  );
}
