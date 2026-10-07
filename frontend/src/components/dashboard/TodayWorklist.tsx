import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ApiClient } from '../../api/client';
import { Clock, FileText, Stethoscope, AlertTriangle, PhoneCall, Check, X, Search, MessageCircle, Calendar } from 'lucide-react';
import { ServiceReminder } from '../../types';

export function TodayWorklist({ data, onNavigate, onPatient }: {
  data: any; onNavigate: (view: string) => void; onPatient: (id: string) => void;
}) {
  const { isClinicAdmin, hasCapability, hasPermission } = useAuth();
  const { showToast } = useToast();
  const canViewExams = isClinicAdmin || hasCapability('CORE_EXAMS_RECEIVED') || hasCapability('CORE_EXAM_REQUEST') || hasPermission('view_exams');

  const [localReminders, setLocalReminders] = useState<ServiceReminder[]>([]);
  const [postponingId, setPostponingId] = useState<string | null>(null);
  const [postponeDate, setPostponeDate] = useState<string>('');

  // Modal Ver Todos
  const [showAllModal, setShowAllModal] = useState<boolean>(false);
  const [allReminders, setAllReminders] = useState<ServiceReminder[]>([]);
  const [allFilter, setAllFilter] = useState<'pending' | 'completed' | 'all'>('pending');
  const [modalSearch, setModalSearch] = useState<string>('');
  const [modalLoading, setModalLoading] = useState<boolean>(false);

  useEffect(() => {
    if (data?.serviceReminders) {
      setLocalReminders(data.serviceReminders);
    }
  }, [data?.serviceReminders]);

  const todayStr = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

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
  const hasServiceReminders = localReminders.length > 0;

  const activeCardsCount = [hasUnfinishedOrDrafts, hasExams, hasReturns, hasFinance, hasServiceReminders].filter(Boolean).length;

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

  const getReminderTiming = (dueAt: string) => {
    if (!dueAt) return { label: 'A definir', subtitle: '', badgeClass: 'bg-slate-100 text-slate-600' };
    const cleanDue = dueAt.slice(0, 10);
    const formatted = new Date(cleanDue + 'T12:00:00').toLocaleDateString('pt-BR');

    if (cleanDue < todayStr) {
      return {
        label: 'Atrasado',
        subtitle: `Previsto para ${formatted}`,
        badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200'
      };
    }
    if (cleanDue === todayStr) {
      return {
        label: 'Vence hoje',
        subtitle: 'Lembrar de entrar em contato hoje',
        badgeClass: 'bg-amber-50 text-amber-700 border border-amber-200'
      };
    }
    return {
      label: 'Próximo',
      subtitle: `Contato previsto para ${formatted}`,
      badgeClass: 'bg-teal-50 text-teal-700 border border-teal-200'
    };
  };

  const handleCompleteReminder = async (reminderId: string) => {
    try {
      await ApiClient.patch(`/v1/service-reminders/${reminderId}/complete`, {});
      setLocalReminders(prev => prev.filter(r => r.id !== reminderId));
      setAllReminders(prev => prev.map(r => r.id === reminderId ? { ...r, status: 'CONCLUÍDO' as const } : r));
      window.dispatchEvent(new CustomEvent('zemda-appointment-updated'));
      showToast('Lembrete de contato concluído!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao concluir lembrete', 'error');
    }
  };

  const getDefaultPostponeDate = (currentDue: string) => {
    const base = new Date();
    base.setDate(base.getDate() + 7);
    const year = base.getFullYear();
    const month = String(base.getMonth() + 1).padStart(2, '0');
    const day = String(base.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleConfirmPostpone = async (reminderId: string) => {
    if (!postponeDate) {
      showToast('Selecione uma data para adiar', 'error');
      return;
    }
    try {
      await ApiClient.patch(`/v1/service-reminders/${reminderId}/postpone`, {
        newDueDate: postponeDate
      });
      setLocalReminders(prev => prev.map(r => r.id === reminderId ? { ...r, due_at: postponeDate, status: 'ADIADO' as const } : r));
      setAllReminders(prev => prev.map(r => r.id === reminderId ? { ...r, due_at: postponeDate, status: 'ADIADO' as const } : r));
      setPostponingId(null);
      window.dispatchEvent(new CustomEvent('zemda-appointment-updated'));
      const formatted = new Date(postponeDate + 'T12:00:00').toLocaleDateString('pt-BR');
      showToast(`Lembrete adiado para ${formatted}!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao adiar lembrete', 'error');
    }
  };

  const handleOpenAllModal = async () => {
    setShowAllModal(true);
    setModalLoading(true);
    try {
      const data = await ApiClient.get<ServiceReminder[]>('/v1/service-reminders?status=all');
      setAllReminders(data || []);
    } catch (err: any) {
      showToast('Erro ao carregar lista completa de lembretes', 'error');
    } finally {
      setModalLoading(false);
    }
  };

  // Grade dinâmica compacta: expande cards ativos para preencher o espaço sem deixar vazios
  const gridColsClass = activeCardsCount === 1
    ? 'grid-cols-1'
    : activeCardsCount === 2
      ? 'grid-cols-1 md:grid-cols-2'
      : activeCardsCount === 3
        ? 'grid-cols-1 md:grid-cols-3'
        : activeCardsCount === 4
          ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4'
          : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5';

  const isWideDrafts = activeCardsCount === 1 && hasUnfinishedOrDrafts;
  const visibleReminders = localReminders.slice(0, 4);

  const filteredModalReminders = allReminders.filter(r => {
    if (allFilter === 'pending' && r.status === 'CONCLUÍDO') return false;
    if (allFilter === 'completed' && r.status !== 'CONCLUÍDO') return false;
    if (modalSearch.trim()) {
      const term = modalSearch.toLowerCase();
      const pat = (r.patient_name || '').toLowerCase();
      const srv = (r.service_name || '').toLowerCase();
      return pat.includes(term) || srv.includes(term);
    }
    return true;
  });

  return (
    <>
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

        {/* 4. Lembretes de contato por serviço (renderiza APENAS se houver lembretes reais) */}
        {hasServiceReminders && (
          <article className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-1.5">
                  <PhoneCall className="w-3.5 h-3.5 text-teal-600" />
                  <h3 className="font-bold text-slate-800 text-xs tracking-tight">Lembretes de contato</h3>
                </div>
                <span className="text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded-full">
                  {data.serviceRemindersCount || localReminders.length}
                </span>
              </div>

              <div className="max-h-[220px] overflow-y-auto overflow-x-hidden pr-1 my-1.5 space-y-2 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]">
                {visibleReminders.map((row: any) => {
                  const timing = getReminderTiming(row.due_at);
                  const isPostponing = postponingId === row.id;

                  return (
                    <div key={row.id} className="text-xs bg-slate-50/80 hover:bg-slate-50 p-2.5 rounded-lg transition-colors border border-slate-100 flex flex-col gap-1.5">
                      <div className="flex items-start justify-between gap-1">
                        <div className="truncate font-semibold">{patient(row)}</div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap ${timing.badgeClass}`}>
                          {timing.label}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-600 truncate font-medium">
                        {row.service_name}
                      </div>

                      <div className="text-[11px] font-medium text-slate-500">
                        {timing.subtitle}
                      </div>

                      {isPostponing ? (
                        <div className="mt-1 pt-1.5 border-t border-slate-200/60 flex items-center gap-1.5 animate-in fade-in duration-150">
                          <input
                            type="date"
                            min={tomorrowStr}
                            value={postponeDate}
                            onChange={e => setPostponeDate(e.target.value)}
                            className="border border-slate-200 bg-white rounded px-1.5 py-0.5 text-[11px] flex-1 font-medium"
                          />
                          <button
                            type="button"
                            onClick={() => handleConfirmPostpone(row.id)}
                            className="px-2 py-0.5 bg-teal-600 hover:bg-teal-700 text-white rounded text-[10px] font-bold cursor-pointer"
                          >
                            Salvar
                          </button>
                          <button
                            type="button"
                            onClick={() => setPostponingId(null)}
                            className="px-1.5 py-0.5 text-slate-500 hover:text-slate-700 text-[10px] cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="mt-1 pt-1.5 border-t border-slate-200/50 flex items-center justify-between gap-1 flex-wrap">
                          <button
                            type="button"
                            onClick={() => onPatient(row.patient_id)}
                            className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 px-2 py-0.5 rounded transition-colors cursor-pointer"
                          >
                            Ver paciente
                          </button>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setPostponingId(row.id);
                                setPostponeDate(getDefaultPostponeDate(row.due_at));
                              }}
                              className="text-[11px] font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded transition-colors cursor-pointer"
                              title="Adiar contato para outra data"
                            >
                              Adiar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCompleteReminder(row.id)}
                              className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-0.5 rounded transition-colors cursor-pointer"
                              title="Marcar como resolvido"
                            >
                              Concluir
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleOpenAllModal}
                className="text-xs font-bold text-teal-700 hover:text-teal-900 transition-colors w-full text-left flex items-center justify-between cursor-pointer"
              >
                <span>{localReminders.length > 4 ? `Ver todos (${localReminders.length})` : 'Ver todos os lembretes'}</span>
                <span className="text-slate-400 text-xs">→</span>
              </button>
            </div>
          </article>
        )}

        {/* 5. Financeiro do dia (se autorizado e houver valores) */}
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

        {/* 6. Alergias (se houver) */}
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

      {/* Modal Completo: Todos os Lembretes de Contato */}
      {showAllModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-teal-50 text-teal-600 rounded-xl">
                  <PhoneCall className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Lembretes de Contato e Retorno</h3>
                  <p className="text-xs text-slate-500">Acompanhe os pacientes para novos retornos conforme serviços realizados</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAllModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Barra de Filtros & Busca */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setAllFilter('pending')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    allFilter === 'pending' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Pendentes ({allReminders.filter(r => r.status !== 'CONCLUÍDO').length})
                </button>
                <button
                  type="button"
                  onClick={() => setAllFilter('completed')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    allFilter === 'completed' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Concluídos ({allReminders.filter(r => r.status === 'CONCLUÍDO').length})
                </button>
                <button
                  type="button"
                  onClick={() => setAllFilter('all')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    allFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todos ({allReminders.length})
                </button>
              </div>

              <div className="relative flex-1 sm:max-w-xs">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar paciente ou serviço..."
                  value={modalSearch}
                  onChange={e => setModalSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white"
                />
              </div>
            </div>

            {/* Lista de Lembretes */}
            <div className="overflow-y-auto flex-1 pr-1 space-y-2 [scrollbar-width:thin]">
              {modalLoading ? (
                <div className="p-8 text-center text-slate-400 text-xs">Carregando lembretes...</div>
              ) : filteredModalReminders.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">Nenhum lembrete encontrado neste filtro.</div>
              ) : (
                filteredModalReminders.map(row => {
                  const timing = getReminderTiming(row.due_at);
                  const isPostponing = postponingId === row.id;
                  const phoneDigits = (row.patient_whatsapp || row.patient_phone || '').replace(/\D/g, '');

                  return (
                    <div
                      key={row.id}
                      className="p-3 bg-white border border-slate-200 rounded-xl shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              setShowAllModal(false);
                              onPatient(row.patient_id);
                            }}
                            className="font-bold text-slate-900 hover:text-teal-700 text-xs truncate cursor-pointer transition-colors"
                          >
                            {row.patient_name}
                          </button>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            row.status === 'CONCLUÍDO'
                              ? 'bg-slate-100 text-slate-600'
                              : timing.badgeClass
                          }`}>
                            {row.status === 'CONCLUÍDO' ? 'Concluído' : timing.label}
                          </span>
                        </div>

                        <p className="text-xs text-slate-500 font-medium truncate">
                          {row.service_name} · <span className="text-slate-600">{timing.subtitle}</span>
                        </p>

                        {(row.patient_phone || row.patient_whatsapp) && (
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-0.5">
                            <span>Tel: {row.patient_phone || row.patient_whatsapp}</span>
                            {phoneDigits && (
                              <a
                                href={`https://wa.me/55${phoneDigits}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-semibold"
                                title="Abrir WhatsApp com paciente"
                              >
                                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                              </a>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Ações */}
                      {row.status !== 'CONCLUÍDO' && (
                        <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                          {isPostponing ? (
                            <div className="flex items-center gap-1 animate-in fade-in duration-150">
                              <input
                                type="date"
                                min={tomorrowStr}
                                value={postponeDate}
                                onChange={e => setPostponeDate(e.target.value)}
                                className="border border-slate-200 bg-white rounded px-2 py-1 text-xs font-medium"
                              />
                              <button
                                type="button"
                                onClick={() => handleConfirmPostpone(row.id)}
                                className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                              >
                                Salvar
                              </button>
                              <button
                                type="button"
                                onClick={() => setPostponingId(null)}
                                className="px-2 py-1 text-slate-500 hover:text-slate-700 text-xs cursor-pointer"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setPostponingId(row.id);
                                  setPostponeDate(getDefaultPostponeDate(row.due_at));
                                }}
                                className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                              >
                                Adiar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCompleteReminder(row.id)}
                                className="px-3 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-xs cursor-pointer"
                              >
                                Concluir
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAllModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
