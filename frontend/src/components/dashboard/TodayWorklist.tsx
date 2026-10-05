import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Clock, FileText, Stethoscope, AlertTriangle } from 'lucide-react';

export function TodayWorklist({ data, onNavigate, onPatient }: {
  data: any; onNavigate: (view: string) => void; onPatient: (id: string) => void;
}) {
  const { isClinicAdmin, hasCapability, hasPermission } = useAuth();
  const canViewExams = isClinicAdmin || hasCapability('CORE_EXAMS_RECEIVED') || hasCapability('CORE_EXAM_REQUEST') || hasPermission('view_exams');

  if (!data) return null;

  const unfinishedList = data.unfinished || [];
  const draftsList = data.drafts || [];
  const examsList = data.exams || [];
  const returnsList = data.returns || [];
  const alertsList = data.alerts || [];

  const hasUnfinishedOrDrafts = unfinishedList.length + draftsList.length > 0;
  const hasExams = canViewExams && (examsList.length > 0 || (data.examCount || 0) > 0);
  const hasReturns = returnsList.length > 0;
  const hasFinance = Boolean(data.finance && (Number(data.finance.received) > 0 || Number(data.finance.pending) > 0));
  const hasAlerts = alertsList.length > 0;

  const activeCardsCount = [hasUnfinishedOrDrafts, hasExams, hasReturns, hasFinance].filter(Boolean).length;

  // Se não houver nenhuma pendência nem alertas, esconde a seção inteira para a Agenda de Hoje subir imediatamente
  if (activeCardsCount === 0 && !hasAlerts) {
    return null;
  }

  const patient = (row: any) => (
    <button
      type="button"
      className="text-teal-700 hover:text-teal-900 font-bold text-left truncate cursor-pointer transition-colors text-xs"
      onClick={() => onPatient(row.patient_id)}
      title={`Abrir prontuário de ${row.patient_name}`}
    >
      {row.patient_name}
    </button>
  );

  const date = (value?: string) => value ? new Date(value.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : 'Sem data';

  // Grade dinâmica compacta: expande cards ativos para preencher o espaço sem deixar vazios
  const gridColsClass = activeCardsCount === 1
    ? 'grid-cols-1'
    : activeCardsCount === 2
      ? 'grid-cols-1 md:grid-cols-2'
      : activeCardsCount === 3
        ? 'grid-cols-1 md:grid-cols-3'
        : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4';

  const isWideDrafts = activeCardsCount === 1 && hasUnfinishedOrDrafts;

  return (
    <section aria-label="Pendências de hoje" className={`grid ${gridColsClass} gap-2.5 items-start`}>
      {/* 1. Atendimentos e rascunhos (renderiza apenas se houver itens pendentes) */}
      {hasUnfinishedOrDrafts && (
        <article className={`bg-white rounded-xl border border-slate-200 p-3 shadow-2xs flex flex-col justify-between ${isWideDrafts ? 'col-span-full' : ''}`}>
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-teal-600" />
                <h3 className="font-bold text-slate-800 text-xs tracking-tight">Atendimentos e rascunhos</h3>
              </div>
              <span className="text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded-full">
                {unfinishedList.length + draftsList.length}
              </span>
            </div>

            <div className={`overflow-y-auto overflow-x-hidden pr-1.5 my-2 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent] ${
              isWideDrafts ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[220px]' : 'space-y-1.5 max-h-[192px]'
            }`}>
              {unfinishedList.map((row: any) => (
                <div key={row.id} className="text-xs bg-slate-50/80 hover:bg-slate-50 p-2 rounded-lg transition-colors border border-slate-100 flex flex-col justify-between">
                  <div className="truncate font-semibold">{patient(row)}</div>
                  <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1 text-teal-600 font-medium">
                      <Stethoscope className="w-3 h-3" /> Em andamento
                    </span>
                    <span>{date(row.start_time)}</span>
                  </div>
                </div>
              ))}
              {draftsList.map((row: any, i: number) => (
                <div key={i} className="text-xs bg-slate-50/80 hover:bg-slate-50 p-2 rounded-lg transition-colors border border-slate-100 flex flex-col justify-between">
                  <div className="truncate font-semibold">{patient(row)}</div>
                  <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1 text-indigo-600 font-medium">
                      <Clock className="w-3 h-3" /> {row.module_type || 'Rascunho'}
                    </span>
                    <span>{date(row.updated_at)}</span>
                  </div>
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
      )}

      {/* 2. Exames a receber (renderiza apenas se houver exames pendentes) */}
      {hasExams && (
        <article className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-xs tracking-tight">
                Exames a receber
              </h3>
              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {data.examCount || examsList.length}
              </span>
            </div>

            <div className="max-h-[192px] overflow-y-auto overflow-x-hidden pr-1.5 my-1.5 space-y-1.5 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]">
              {examsList.map((row: any) => (
                <div key={row.id} className="text-xs bg-slate-50/70 hover:bg-slate-50 p-2 rounded-lg transition-colors border border-slate-100">
                  <div className="truncate">{patient(row)}</div>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5" title={`${row.exam_name} · ${date(row.expected_date)}`}>
                    <span className="font-medium text-slate-700">{row.exam_name}</span> · {date(row.expected_date)} · <span className={row.status === 'delayed' ? 'text-rose-600 font-bold' : 'text-amber-600'}>{row.status === 'delayed' ? 'Atrasado' : 'Aguardando'}</span>
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
      )}

      {/* 3. Retornos previstos (renderiza apenas se houver retornos) */}
      {hasReturns && (
        <article className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-xs tracking-tight">Retornos previstos</h3>
              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {returnsList.length}
              </span>
            </div>

            <div className="max-h-[192px] overflow-y-auto overflow-x-hidden pr-1.5 my-1.5 space-y-1.5 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]">
              {returnsList.map((row: any) => (
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
      )}

      {/* 4. Financeiro do dia (se autorizado e houver valores) */}
      {hasFinance && (
        <article className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="font-bold text-slate-800 text-xs tracking-tight">Financeiro do dia</h3>
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

      {/* 5. Alergias (se houver) */}
      {hasAlerts && (
        <article className="bg-amber-50/80 rounded-xl border border-amber-200 p-3 shadow-2xs flex flex-col justify-between col-span-full">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-amber-200/60">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                <h3 className="font-bold text-amber-900 text-xs tracking-tight">Alergias registradas · pacientes de hoje</h3>
              </div>
              <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                {alertsList.length}
              </span>
            </div>
            <div className="max-h-[140px] overflow-y-auto overflow-x-hidden space-y-1.5 pr-1.5 my-2 [scrollbar-width:thin] [scrollbar-color:#f59e0b_transparent]">
              {alertsList.map((row: any, i: number) => (
                <p key={i} className="text-xs text-amber-950 bg-white/70 p-1.5 rounded-lg border border-amber-200/50">
                  {patient(row)} · <strong className="text-rose-700">{row.agent}</strong>{row.reaction && ` — ${row.reaction}`}
                </p>
              ))}
            </div>
          </div>
        </article>
      )}
    </section>
  );
}
