import React, { useState, useEffect, useCallback } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import {
  ClipboardCheck,
  BarChart3,
  Calendar,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Award,
  Activity,
  Search,
  RefreshCw,
  UserCheck
} from 'lucide-react';

interface OccurrenceSummary {
  occurrence_key: string;
  occurrence_id: string | null;
  series_id: string | null;
  service_kind: 'individual' | 'group';
  start_time: string;
  end_time: string;
  service_id: string;
  service_name: string;
  modality_name: string;
  professional_id: string;
  professional_name: string;
  room_name?: string | null;
  capacity: number;
  enrolled_count: number;
  present_count: number;
  absent_count: number;
  pending_count: number;
  student_names_preview?: string;
}

interface RosterMember {
  appointment_id: string;
  appointment_number: string;
  patient_id: string;
  patient_name: string;
  patient_phone?: string;
  appointment_status: string;
  attendance_status: 'pending' | 'present' | 'absent' | 'cancelled';
  attendance_marked_at?: string | null;
  attendance_notes?: string | null;
  occurrence_id?: string | null;
  payment_status?: string | null;
}

function getDefaultDates() {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - 29 * 86400000).toISOString().slice(0, 10);
  return { start, end };
}

interface PersonalAttendanceReportsTabProps {
  initialOccurrenceId?: string | null;
  onOccurrenceFinished?: (occurrenceId: string) => void;
}

export const PersonalAttendanceReportsTab: React.FC<PersonalAttendanceReportsTabProps> = ({
  initialOccurrenceId,
  onOccurrenceFinished
}) => {
  const { showToast } = useToast();
  const { isClinicAdmin } = useAuth();
  const defaults = getDefaultDates();

  const [subTab, setSubTab] = useState<'roster' | 'reports'>('roster');
  const [startDate, setStartDate] = useState<string>(defaults.start);
  const [endDate, setEndDate] = useState<string>(defaults.end);
  const [serviceFilter, setServiceFilter] = useState<string>('');
  const [professionalFilter, setProfessionalFilter] = useState<string>('');
  const [kindFilter, setKindFilter] = useState<'all' | 'group' | 'individual'>('all');
  const [studentSearch, setStudentSearch] = useState<string>('');

  const [services, setServices] = useState<any[]>([]);
  const [professionals, setProfessionals] = useState<any[]>([]);

  const [occurrences, setOccurrences] = useState<OccurrenceSummary[]>([]);
  const [loadingOccurrences, setLoadingOccurrences] = useState(false);

  const [selectedOccKey, setSelectedOccKey] = useState<string | null>(initialOccurrenceId || null);
  const [finishingOccurrence, setFinishingOccurrence] = useState(false);
  const [rosterData, setRosterData] = useState<{
    occurrenceId: string;
    serviceName: string;
    professionalName: string;
    startTime: string;
    endTime: string;
    serviceKind: string;
    capacity: number;
    roster: RosterMember[];
  } | null>(null);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [updatingApptId, setUpdatingApptId] = useState<string | null>(null);

  const [reports, setReports] = useState<any>(null);
  const [loadingReports, setLoadingReports] = useState(false);

  useEffect(() => {
    ApiClient.get<any[]>('/v1/services').then(d => setServices(Array.isArray(d) ? d : [])).catch(() => {});
    if (isClinicAdmin) {
      ApiClient.get<any[]>('/v1/professionals').then(d => setProfessionals(Array.isArray(d) ? d : [])).catch(() => {});
    }
  }, [isClinicAdmin]);

  useEffect(() => {
    if (initialOccurrenceId) {
      setSubTab('roster');
      setSelectedOccKey(initialOccurrenceId);
    }
  }, [initialOccurrenceId]);

  const loadOccurrences = useCallback(async () => {
    try {
      setLoadingOccurrences(true);
      const qs = new URLSearchParams();
      if (startDate) qs.set('startDate', startDate);
      if (endDate) qs.set('endDate', endDate);
      if (serviceFilter) qs.set('serviceId', serviceFilter);
      if (professionalFilter) qs.set('professionalId', professionalFilter);
      if (kindFilter !== 'all') qs.set('kind', kindFilter);
      const res = await ApiClient.get<{ occurrences: OccurrenceSummary[] }>(`/v1/classes/occurrences?${qs.toString()}`);
      const list = res?.occurrences || [];
      setOccurrences(list);
      if (initialOccurrenceId) {
        setSelectedOccKey(prev => prev || initialOccurrenceId);
      } else if (list.length > 0 && (!selectedOccKey || !list.some(o => o.occurrence_key === selectedOccKey))) {
        setSelectedOccKey(list[0].occurrence_key);
      } else if (list.length === 0) {
        setSelectedOccKey(null);
        setRosterData(null);
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao carregar aulas agendadas.', 'error');
    } finally {
      setLoadingOccurrences(false);
    }
  }, [startDate, endDate, serviceFilter, professionalFilter, kindFilter, initialOccurrenceId]);

  const loadReports = useCallback(async () => {
    try {
      setLoadingReports(true);
      const qs = new URLSearchParams();
      if (startDate) qs.set('startDate', startDate);
      if (endDate) qs.set('endDate', endDate);
      if (serviceFilter) qs.set('serviceId', serviceFilter);
      if (professionalFilter) qs.set('professionalId', professionalFilter);
      const res = await ApiClient.get<any>(`/v1/personal/attendance-reports?${qs.toString()}`);
      setReports(res);
    } catch (err: any) {
      showToast(err?.message || 'Erro ao carregar relatórios de frequência.', 'error');
    } finally {
      setLoadingReports(false);
    }
  }, [startDate, endDate, serviceFilter, professionalFilter]);

  useEffect(() => {
    loadOccurrences();
    loadReports();
  }, [loadOccurrences, loadReports]);

  useEffect(() => {
    if (!selectedOccKey) {
      setRosterData(null);
      return;
    }
    let cancelled = false;
    setLoadingRoster(true);
    ApiClient.get<any>(`/v1/classes/occurrences/${encodeURIComponent(selectedOccKey)}/roster`)
      .then(data => {
        if (!cancelled) setRosterData(data);
      })
      .catch(() => {
        if (!cancelled) setRosterData(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingRoster(false);
      });
    return () => { cancelled = true; };
  }, [selectedOccKey]);

  const handleMarkAttendance = async (appointmentId: string, attendanceStatus: 'present' | 'absent' | 'cancelled' | 'pending') => {
    if (!rosterData) return;
    try {
      setUpdatingApptId(appointmentId);
      const occParam = rosterData.occurrenceId || 'individual';
      await ApiClient.put(`/v1/classes/occurrences/${encodeURIComponent(occParam)}/attendance/${appointmentId}`, {
        attendanceStatus
      });

      setRosterData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          roster: prev.roster.map(m =>
            m.appointment_id === appointmentId ? { ...m, attendance_status: attendanceStatus } : m
          )
        };
      });

      loadOccurrences();
      loadReports();
      showToast('Frequência registrada.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Erro ao registrar presença.', 'error');
    } finally {
      setUpdatingApptId(null);
    }
  };

  const formatDateTime = (iso: string) => {
    const clean = String(iso || '').replace(' ', 'T');
    const [d, t] = clean.split('T');
    if (!d) return '-';
    const [yy, mm, dd] = d.split('-');
    return `${dd}/${mm}/${yy}${t ? ` · ${t.slice(0, 5)}` : ''}`;
  };

  const filteredStudentsReport = (reports?.byStudent || []).filter((s: any) =>
    !studentSearch.trim() || String(s.student_name || '').toLowerCase().includes(studentSearch.trim().toLowerCase())
  );

  return (
    <div className="space-y-5 max-w-full overflow-x-hidden">
      {/* Cabeçalho e Filtros */}
      <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>Frequência &amp; Relatórios</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Controle de presença nas aulas/turmas e indicadores completos de assiduidade, modalidades e ocupação.
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl self-start md:self-auto">
            <button
              type="button"
              onClick={() => setSubTab('roster')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                subTab === 'roster' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Lista de Chamada</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('reports')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                subTab === 'reports' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Relatórios &amp; KPIs</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-2 border-t border-slate-100 text-xs">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Data inicial</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Data final</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Modalidade / Serviço</label>
            <select
              value={serviceFilter}
              onChange={e => setServiceFilter(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50"
            >
              <option value="">Todas as modalidades</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {isClinicAdmin ? (
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Instrutor / Profissional</label>
              <select
                value={professionalFilter}
                onChange={e => setProfessionalFilter(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50"
              >
                <option value="">Todos os instrutores</option>
                {professionals.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Formato da Aula</label>
              <select
                value={kindFilter}
                onChange={e => setKindFilter(e.target.value as any)}
                className="w-full border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50"
              >
                <option value="all">Todas (Individual e Turma)</option>
                <option value="group">Somente Aulas Coletivas / Turmas</option>
                <option value="individual">Somente Individuais</option>
              </select>
            </div>
          )}
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                loadOccurrences();
                loadReports();
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer min-h-[34px]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${(loadingOccurrences || loadingReports) ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      {reports?.kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5">
            <span className="text-[11px] font-semibold text-slate-500 block">Aulas / Inscrições</span>
            <strong className="text-lg font-extrabold text-slate-900">{reports.kpis.totalAppointments}</strong>
          </div>
          <div className="bg-white rounded-2xl border border-emerald-200 p-3.5">
            <span className="text-[11px] font-semibold text-emerald-700 block">Presenças</span>
            <strong className="text-lg font-extrabold text-emerald-700">{reports.kpis.presentCount}</strong>
          </div>
          <div className="bg-white rounded-2xl border border-rose-200 p-3.5">
            <span className="text-[11px] font-semibold text-rose-700 block">Faltas</span>
            <strong className="text-lg font-extrabold text-rose-700">{reports.kpis.absentCount}</strong>
          </div>
          <div className="bg-white rounded-2xl border border-amber-200 p-3.5">
            <span className="text-[11px] font-semibold text-amber-700 block">Pendentes de chamada</span>
            <strong className="text-lg font-extrabold text-amber-700">{reports.kpis.pendingCount}</strong>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5">
            <span className="text-[11px] font-semibold text-slate-500 block">Taxa de Presença</span>
            <strong className="text-lg font-extrabold text-slate-900">{reports.kpis.attendanceRate}%</strong>
          </div>
          <div className="bg-white rounded-2xl border border-indigo-200 p-3.5">
            <span className="text-[11px] font-semibold text-indigo-700 block">Ocupação Turmas</span>
            <strong className="text-lg font-extrabold text-indigo-700">{reports.kpis.occupancyRate}%</strong>
          </div>
        </div>
      )}

      {/* SUB-ABA 1: LISTA DE CHAMADA */}
      {subTab === 'roster' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Lista de Aulas / Ocorrências */}
          <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <span>Aulas no Período ({occurrences.length})</span>
              </h4>
              {isClinicAdmin && (
                <select
                  value={kindFilter}
                  onChange={e => setKindFilter(e.target.value as any)}
                  className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 bg-slate-50"
                >
                  <option value="all">Todas</option>
                  <option value="group">Turmas</option>
                  <option value="individual">Individuais</option>
                </select>
              )}
            </div>

            {loadingOccurrences ? (
              <p className="text-xs text-slate-400 py-8 text-center">Carregando aulas...</p>
            ) : occurrences.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">Nenhuma aula encontrada neste período.</p>
            ) : (
              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {occurrences.map(occ => {
                  const selected = occ.occurrence_key === selectedOccKey;
                  return (
                    <button
                      key={occ.occurrence_key}
                      type="button"
                      onClick={() => setSelectedOccKey(occ.occurrence_key)}
                      className={`w-full text-left p-3 rounded-2xl border transition-all cursor-pointer ${
                        selected
                          ? 'bg-emerald-50/70 border-emerald-400 shadow-xs'
                          : 'bg-slate-50/70 border-slate-200 hover:border-emerald-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900 truncate">{occ.service_name}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                            occ.service_kind === 'group'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {occ.service_kind === 'group'
                            ? `Turma ${occ.enrolled_count}/${occ.capacity}`
                            : 'Individual'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-semibold text-teal-700">{formatDateTime(occ.start_time)}</span>
                        <span>• {occ.professional_name}</span>
                        {occ.room_name && <span>• {occ.room_name}</span>}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold">
                        <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                          Presentes: {occ.present_count}
                        </span>
                        <span className="text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                          Faltas: {occ.absent_count}
                        </span>
                        <span className="text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                          Pendentes: {occ.pending_count}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Lista de Chamada da Ocorrência Selecionada */}
          <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 p-4 space-y-4">
            {!selectedOccKey ? (
              <div className="py-16 text-center text-xs text-slate-400">
                Selecione uma aula ao lado para registrar a chamada dos alunos.
              </div>
            ) : loadingRoster ? (
              <div className="py-16 text-center text-xs text-slate-400">Carregando alunos inscritos...</div>
            ) : rosterData ? (
              <>
                <div className="pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-slate-900 text-sm">{rosterData.serviceName}</h4>
                      {rosterData.serviceKind === 'group' && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                          Turma · {rosterData.roster.filter(r => r.appointment_status !== 'cancelled').length}/{rosterData.capacity} vagas
                        </span>
                      )}
                      {rosterData.roster.some(r => r.appointment_status !== 'cancelled') &&
                        rosterData.roster
                          .filter(r => r.appointment_status !== 'cancelled')
                          .every(r => r.appointment_status === 'completed') && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Aula Concluída
                          </span>
                        )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {formatDateTime(rosterData.startTime)} • Instrutor: <strong>{rosterData.professionalName}</strong>
                    </p>
                  </div>
                  {rosterData.roster.some(r => !['completed', 'cancelled', 'no_show'].includes(r.appointment_status)) && (
                    <button
                      type="button"
                      disabled={finishingOccurrence}
                      onClick={async () => {
                        const targetOcc = rosterData.occurrenceId || selectedOccKey;
                        if (!targetOcc || finishingOccurrence) return;
                        try {
                          setFinishingOccurrence(true);
                          await ApiClient.post(`/v1/classes/occurrences/${encodeURIComponent(targetOcc)}/finish`, {});
                          showToast('Aula concluída com sucesso!', 'success');
                          const refreshed = await ApiClient.get<any>(`/v1/classes/occurrences/${encodeURIComponent(selectedOccKey || targetOcc)}/roster`);
                          setRosterData(refreshed);
                          loadOccurrences();
                          loadReports();
                          window.dispatchEvent(new CustomEvent('zemda-appointment-updated'));
                          onOccurrenceFinished?.(targetOcc);
                        } catch (err: any) {
                          showToast(err?.message || 'Erro ao concluir aula.', 'error');
                        } finally {
                          setFinishingOccurrence(false);
                        }
                      }}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-60 shrink-0"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{finishingOccurrence ? 'Concluindo...' : 'Finalizar Aula'}</span>
                    </button>
                  )}
                </div>

                <div className="space-y-2.5">
                  {rosterData.roster.map(member => {
                    const isUpdating = updatingApptId === member.appointment_id;
                    const st = member.attendance_status || 'pending';
                    return (
                      <div
                        key={member.appointment_id}
                        className="p-3 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs text-slate-900 truncate">{member.patient_name}</span>
                            <span className="text-[10px] text-slate-400">{member.appointment_number}</span>
                            {member.appointment_status === 'cancelled' && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                                Agendamento cancelado
                              </span>
                            )}
                          </div>
                          {member.patient_phone && (
                            <p className="text-[11px] text-slate-500 mt-0.5">{member.patient_phone}</p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          {[
                            { id: 'present' as const, label: 'Presente', icon: CheckCircle2, activeCls: 'bg-emerald-600 text-white border-emerald-600', idleCls: 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50' },
                            { id: 'absent' as const, label: 'Faltou', icon: XCircle, activeCls: 'bg-rose-600 text-white border-rose-600', idleCls: 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50' },
                            { id: 'cancelled' as const, label: 'Cancelado', icon: AlertTriangle, activeCls: 'bg-slate-600 text-white border-slate-600', idleCls: 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100' },
                            { id: 'pending' as const, label: 'Pendente', icon: Clock, activeCls: 'bg-amber-500 text-white border-amber-500', idleCls: 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50' }
                          ].map(btn => {
                            const Icon = btn.icon;
                            const active = st === btn.id;
                            return (
                              <button
                                key={btn.id}
                                type="button"
                                disabled={isUpdating}
                                onClick={() => handleMarkAttendance(member.appointment_id, btn.id)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer disabled:opacity-50 ${
                                  active ? btn.activeCls : btn.idleCls
                                }`}
                              >
                                <Icon className="w-3.5 h-3.5" />
                                <span>{btn.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="py-16 text-center text-xs text-slate-400">
                Não foi possível carregar os alunos desta aula.
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-ABA 2: 7 RELATÓRIOS ANALÍTICOS */}
      {subTab === 'reports' && reports && (
        <div className="space-y-4">
          {/* Linha 1: Ranking + Alertas de Faltas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 1. Ranking de Assiduidade */}
            <div className="bg-white rounded-3xl border border-slate-200 p-4 space-y-3">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                <span>Ranking de Assiduidade dos Alunos</span>
              </h4>
              {(reports.studentRanking || []).length === 0 ? (
                <p className="text-xs text-slate-400 py-4">Sem presenças ou faltas registradas no período.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {reports.studentRanking.map((row: any, idx: number) => (
                    <div key={row.patient_id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 font-bold text-[11px] flex items-center justify-center shrink-0">
                          {idx + 1}º
                        </span>
                        <span className="font-bold text-slate-800 truncate">{row.student_name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-emerald-700 font-bold">{row.present_count} presenças</span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                          {row.attendance_rate}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 7. Alunos com menor frequência / alertas de falta */}
            <div className="bg-white rounded-3xl border border-slate-200 p-4 space-y-3">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                <span>Alunos com Menor Frequência / Faltas</span>
              </h4>
              {(reports.lowAttendanceAlerts || []).length === 0 ? (
                <p className="text-xs text-slate-400 py-4">Nenhum alerta de baixa frequência no período.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {reports.lowAttendanceAlerts.map((row: any) => (
                    <div key={row.patient_id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-rose-50/60 border border-rose-200/80 text-xs">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 truncate">{row.student_name}</p>
                        <p className="text-[11px] text-slate-600">
                          {row.present_count} presença(s) · {row.absent_count} falta(s)
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[11px] shrink-0">
                        {row.attendance_rate}% frequência
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Linha 2: Modalidades Mais Frequentadas + Frequência por Instrutor */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 2. Modalidades Mais Frequentadas */}
            <div className="bg-white rounded-3xl border border-slate-200 p-4 space-y-3">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-600" />
                <span>Modalidades / Serviços Mais Frequentados</span>
              </h4>
              {(reports.topModalities || []).length === 0 ? (
                <p className="text-xs text-slate-400 py-4">Sem dados no período.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {reports.topModalities.map((m: any, idx: number) => (
                    <div key={`${m.service_id || m.service_name}-${idx}`} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 truncate">{m.service_name}</p>
                        <p className="text-[11px] text-slate-500">
                          {m.modality_name} · {m.service_kind === 'group' ? 'Turma coletiva' : 'Individual'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-bold text-emerald-700 block">{m.present_count} presenças</span>
                        <span className="text-[10px] text-slate-500">{m.total_scheduled} agendamentos</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4. Frequência por Instrutor */}
            <div className="bg-white rounded-3xl border border-slate-200 p-4 space-y-3">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" />
                <span>Frequência por Instrutor</span>
              </h4>
              {(reports.byInstructor || []).length === 0 ? (
                <p className="text-xs text-slate-400 py-4">Sem dados no período.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {reports.byInstructor.map((inst: any) => (
                    <div key={inst.professional_id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 truncate">{inst.professional_name}</p>
                        <p className="text-[11px] text-slate-500">
                          {inst.classes_count} aula(s) · {inst.enrollments_count} inscrições · {inst.absent_count} faltas
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold text-[11px] shrink-0">
                        {inst.attendance_rate}% presença
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Linha 3: Taxa de Ocupação das Turmas + Horários de Pico */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 5. Taxa de Ocupação das Turmas */}
            <div className="bg-white rounded-3xl border border-slate-200 p-4 space-y-3">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-teal-600" />
                <span>Taxa de Ocupação das Turmas</span>
              </h4>
              {(reports.classOccupancy || []).length === 0 ? (
                <p className="text-xs text-slate-400 py-4">Nenhuma aula coletiva registrada neste período.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {reports.classOccupancy.map((occ: any) => (
                    <div key={occ.occurrence_id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-800 truncate">{occ.service_name}</span>
                        <span className="font-bold text-indigo-700 shrink-0">
                          {occ.enrolled_count}/{occ.capacity} ({occ.occupancy_rate}%)
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>{formatDateTime(occ.start_time)}</span>
                        <span>Presentes: {occ.present_count}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                        <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${Math.min(100, occ.occupancy_rate)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 6. Horários e Dias com Maior Movimento */}
            <div className="bg-white rounded-3xl border border-slate-200 p-4 space-y-3">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-sky-600" />
                <span>Horários e Dias de Maior Movimento</span>
              </h4>
              {(reports.peakTimes || []).length === 0 ? (
                <p className="text-xs text-slate-400 py-4">Sem dados de movimento neste período.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {reports.peakTimes.map((pt: any, idx: number) => (
                    <div key={`${pt.weekday_index}-${pt.hour_bucket}-${idx}`} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                      <div>
                        <span className="font-bold text-slate-800">{pt.weekday_label}</span>
                        <span className="text-slate-500 ml-2">às {pt.hour_bucket}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-700 font-bold">{pt.present_count} presenças</span>
                        <span className="text-slate-400">({pt.scheduled_count} inscritos)</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 3. Frequência Detalhada por Aluno */}
          <div className="bg-white rounded-3xl border border-slate-200 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className="font-bold text-slate-800 text-sm">Frequência Detalhada por Aluno</h4>
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  placeholder="Buscar aluno..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            {filteredStudentsReport.length === 0 ? (
              <p className="text-xs text-slate-400 py-4">Nenhum aluno encontrado no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-3 font-semibold">Aluno</th>
                      <th className="py-2 px-2 font-semibold text-center">Agendadas</th>
                      <th className="py-2 px-2 font-semibold text-center">Presenças</th>
                      <th className="py-2 px-2 font-semibold text-center">Faltas</th>
                      <th className="py-2 px-2 font-semibold text-center">Canceladas</th>
                      <th className="py-2 pl-2 font-semibold text-right">Assiduidade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudentsReport.map((st: any) => (
                      <tr key={st.patient_id} className="hover:bg-slate-50">
                        <td className="py-2 pr-3 font-bold text-slate-800">{st.student_name}</td>
                        <td className="py-2 px-2 text-center">{st.total_scheduled}</td>
                        <td className="py-2 px-2 text-center font-bold text-emerald-700">{st.present_count}</td>
                        <td className="py-2 px-2 text-center font-bold text-rose-700">{st.absent_count}</td>
                        <td className="py-2 px-2 text-center text-slate-500">{st.cancelled_count}</td>
                        <td className="py-2 pl-2 text-right font-bold">{st.attendance_rate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
