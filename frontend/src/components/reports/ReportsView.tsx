import React, { useState, useEffect, useMemo } from 'react';
import { downloadBlob } from '../../utils/download';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import {
  BarChart3,
  Download,
  Calendar,
  Users,
  CheckCircle2,
  DollarSign,
  TrendingUp,
  FileSpreadsheet,
  Activity,
  Clock,
  AlertTriangle,
  XCircle,
  Filter,
  HeartHandshake,
  Phone,
  Settings,
  UserCheck,
  ExternalLink,
  Search,
  X
} from 'lucide-react';

type ReportTab = 'performance' | 'continuity';
type ContinuityBand = 'all' | 'up_to_30' | '31_to_60' | '61_to_90' | 'over_90';

const formatDateBr = (iso?: string | null): string => {
  if (!iso) return '—';
  const clean = String(iso).slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return clean;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

export const ReportsView: React.FC = () => {
  const { showToast } = useToast();
  const { isClinicAdmin, isReceptionist, isProfessional, hasPermission, clientTermLabel } = useAuth();

  const isReceptionOnly = Boolean(isReceptionist && !isClinicAdmin && !isProfessional);
  const [activeTab, setActiveTab] = useState<ReportTab>(() =>
    isReceptionist && !isClinicAdmin && !isProfessional ? 'continuity' : 'performance'
  );
  const [loading, setLoading] = useState<boolean>(!isReceptionOnly);
  const [attendanceData, setAttendanceData] = useState<any>(null);
  const [financialData, setFinancialData] = useState<any>(null);

  // Filtros de Desempenho (1.1)
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
  });
  const [endDate, setEndDate] = useState<string>(() =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  );
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>('');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedSpecialtyId, setSelectedSpecialtyId] = useState<string>('');

  // Estado da Continuidade do Cuidado (1.2)
  const [loadingContinuity, setLoadingContinuity] = useState<boolean>(false);
  const [continuityData, setContinuityData] = useState<any>(null);
  const [continuityBand, setContinuityBand] = useState<ContinuityBand>('all');
  const [continuitySituation, setContinuitySituation] = useState<string>('all');
  const [continuitySearch, setContinuitySearch] = useState<string>('');

  // Modal de configuração de acompanhamento por paciente
  const [editingPatientContinuity, setEditingPatientContinuity] = useState<any | null>(null);
  const [patientPeriodicityInput, setPatientPeriodicityInput] = useState<string>('');
  const [patientFollowUpStatus, setPatientFollowUpStatus] = useState<string>('active');
  const [patientFollowUpNotes, setPatientFollowUpNotes] = useState<string>('');
  const [savingPatientConfig, setSavingPatientConfig] = useState<boolean>(false);

  // Modal de configuração de periodicidade por serviço
  const [showServicePeriodicityModal, setShowServicePeriodicityModal] = useState<boolean>(false);
  const [savingServiceId, setSavingServiceId] = useState<string | null>(null);

  // Modal de visualização administrativa do paciente (para recepção e equipe)
  const [viewingPatientAdmin, setViewingPatientAdmin] = useState<any | null>(null);

  const canViewFinancial = useMemo(() => {
    if (attendanceData?.permissions?.canViewFinancial !== undefined) {
      return Boolean(attendanceData.permissions.canViewFinancial);
    }
    if (isClinicAdmin) return true;
    if (isReceptionist) return false;
    return hasPermission('manage_financial');
  }, [attendanceData, isClinicAdmin, isReceptionist, hasPermission]);

  const canOpenPatientProfile =
    isClinicAdmin || isProfessional || isReceptionist || hasPermission('edit_patient') || hasPermission('create_patient');

  const fetchPerformanceReports = async () => {
    if (isReceptionOnly) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const query = new URLSearchParams();
      if (startDate) query.set('startDate', startDate);
      if (endDate) query.set('endDate', endDate);
      if (selectedProfessionalId) query.set('professionalId', selectedProfessionalId);
      if (selectedServiceId) query.set('serviceId', selectedServiceId);
      if (selectedSpecialtyId) query.set('specialtyId', selectedSpecialtyId);

      const att = await ApiClient.get<any>(`/v1/reports/attendance?${query.toString()}`);
      setAttendanceData(att);

      if (att?.permissions?.canViewFinancial) {
        try {
          const finQuery = new URLSearchParams();
          if (startDate) finQuery.set('startDate', startDate);
          if (endDate) finQuery.set('endDate', endDate);
          const fin = await ApiClient.get<any>(`/v1/reports/financial?${finQuery.toString()}`);
          setFinancialData(fin);
        } catch {
          setFinancialData(null);
        }
      } else {
        setFinancialData(null);
      }
    } catch (err: any) {
      showToast('Erro ao carregar indicadores de relatórios', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchCareContinuity = async () => {
    try {
      setLoadingContinuity(true);
      const query = new URLSearchParams();
      if (continuityBand && continuityBand !== 'all') query.set('band', continuityBand);
      if (continuitySituation && continuitySituation !== 'all') query.set('situation', continuitySituation);
      if (selectedProfessionalId) query.set('professionalId', selectedProfessionalId);
      if (selectedServiceId) query.set('serviceId', selectedServiceId);
      if (selectedSpecialtyId) query.set('specialtyId', selectedSpecialtyId);
      if (continuitySearch.trim()) query.set('search', continuitySearch.trim());

      const res = await ApiClient.get<any>(`/v1/reports/care-continuity?${query.toString()}`);
      setContinuityData(res);
    } catch (err: any) {
      showToast('Erro ao carregar Continuidade do Cuidado', 'error');
    } finally {
      setLoadingContinuity(false);
      if (isReceptionOnly) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (isReceptionOnly && activeTab !== 'continuity') {
      setActiveTab('continuity');
    }
  }, [isReceptionOnly, activeTab]);

  useEffect(() => {
    if (!isReceptionOnly) {
      fetchPerformanceReports();
    } else {
      setLoading(false);
    }
  }, [isReceptionOnly, startDate, endDate, selectedProfessionalId, selectedServiceId, selectedSpecialtyId]);

  useEffect(() => {
    if (isReceptionOnly || activeTab === 'continuity') {
      fetchCareContinuity();
    }
  }, [isReceptionOnly, activeTab, continuityBand, continuitySituation, selectedProfessionalId, selectedServiceId, selectedSpecialtyId]);

  const applyPeriodPreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });
    setStartDate(fmt.format(start));
    setEndDate(fmt.format(end));
  };

  const handleDownloadCsv = async (type: 'appointments' | 'payments') => {
    if (isReceptionOnly) return;
    try {
      const csvText = await ApiClient.get<string>(`/v1/reports/export-csv?type=${type}`);
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      await downloadBlob(blob, `relatorio-${type}.csv`);
      showToast(`Relatório de ${type === 'payments' ? 'financeiro' : 'atendimentos'} baixado com sucesso!`, 'success');
    } catch (err) {
      showToast('Erro ao exportar CSV', 'error');
    }
  };

  const handleSavePatientContinuity = async () => {
    if (!editingPatientContinuity) return;
    try {
      setSavingPatientConfig(true);
      const parsedDays =
        patientPeriodicityInput.trim() === '' || Number(patientPeriodicityInput) <= 0
          ? null
          : Number(patientPeriodicityInput);

      await ApiClient.put(`/v1/reports/care-continuity/patient/${editingPatientContinuity.patientId}`, {
        returnPeriodicityDays: parsedDays,
        followUpStatus: patientFollowUpStatus,
        followUpNotes: patientFollowUpNotes.trim() || null
      });
      showToast('Configuração de retorno do paciente salva!', 'success');
      setEditingPatientContinuity(null);
      fetchCareContinuity();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao salvar configuração de retorno', 'error');
    } finally {
      setSavingPatientConfig(false);
    }
  };

  const handleSaveServicePeriodicity = async (srvId: string, daysVal: string) => {
    try {
      setSavingServiceId(srvId);
      const parsedDays = daysVal.trim() === '' || Number(daysVal) <= 0 ? null : Number(daysVal);
      await ApiClient.put(`/v1/reports/care-continuity/service/${srvId}`, {
        returnPeriodicityDays: parsedDays
      });
      showToast('Periodicidade do serviço atualizada!', 'success');
      if (!isReceptionOnly) fetchPerformanceReports();
      if (isReceptionOnly || activeTab === 'continuity') fetchCareContinuity();
    } catch (err: any) {
      showToast('Erro ao salvar periodicidade do serviço', 'error');
    } finally {
      setSavingServiceId(null);
    }
  };

  const summary = attendanceData?.summary || {};
  const filterProfessionals: any[] =
    attendanceData?.filters?.professionals || continuityData?.filters?.professionals || [];
  const filterServices: any[] =
    attendanceData?.filters?.services || continuityData?.filters?.services || [];

  const specialtyOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of filterProfessionals) {
      if (p.specialty_id && p.specialty_name) {
        map.set(p.specialty_id, p.specialty_name);
      } else if (p.profession_id && p.profession_name) {
        map.set(p.profession_id, p.profession_name);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [filterProfessionals]);

  return (
    <div data-tour-loading={loading} className="space-y-6">
      {/* Header Principal */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {isReceptionOnly ? 'Relatórios & Acompanhamento de Pacientes' : 'Relatórios & Métricas Analíticas'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isReceptionOnly
              ? `Continuidade do Cuidado — acompanhamento operacional de retornos, prazos recomendados e próximos agendamentos dos ${clientTermLabel.toLowerCase()}s.`
              : `Indicadores de desempenho operacional, ocupação real da agenda e continuidade do cuidado dos ${clientTermLabel.toLowerCase()}s.`}
          </p>
        </div>

        {!isReceptionOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleDownloadCsv('appointments')}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Exportar Atendimentos (CSV)
            </button>
            {canViewFinancial && (
              <button
                type="button"
                onClick={() => handleDownloadCsv('payments')}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-all border border-indigo-200 cursor-pointer"
              >
                <Download className="w-4 h-4 text-indigo-600" /> Exportar Financeiro (CSV)
              </button>
            )}
          </div>
        )}
      </div>

      {/* Abas Internas: Indicadores de Desempenho | Continuidade do Cuidado (Oculto para Recepção) */}
      {!isReceptionOnly && (
        <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-xs inline-flex flex-wrap gap-1">
          <button
            type="button"
            data-testid="tab-performance"
            onClick={() => setActiveTab('performance')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'performance'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Indicadores de Desempenho
          </button>
          <button
            type="button"
            data-testid="tab-continuity"
            onClick={() => setActiveTab('continuity')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'continuity'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <HeartHandshake className="w-4 h-4" />
            Continuidade do Cuidado
          </button>
        </div>
      )}

      {/* Barra de Filtros Compartilhada */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <Filter className="w-3.5 h-3.5 text-indigo-600" />
            <span>Filtros de Análise</span>
          </div>
          {!isReceptionOnly && activeTab === 'performance' && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => applyPeriodPreset(7)}
                className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer"
              >
                Últimos 7 dias
              </button>
              <button
                type="button"
                onClick={() => applyPeriodPreset(30)}
                className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer"
              >
                Últimos 30 dias
              </button>
              <button
                type="button"
                onClick={() => applyPeriodPreset(90)}
                className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer"
              >
                Últimos 90 dias
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {!isReceptionOnly && activeTab === 'performance' && (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Data inicial</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Data final</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50 text-xs"
                />
              </div>
            </>
          )}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Profissional</label>
            <select
              value={selectedProfessionalId}
              onChange={e => setSelectedProfessionalId(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50 text-xs"
            >
              <option value="">Todos os profissionais</option>
              {filterProfessionals.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Serviço</label>
            <select
              value={selectedServiceId}
              onChange={e => setSelectedServiceId(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50 text-xs"
            >
              <option value="">Todos os serviços</option>
              {filterServices.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Especialidade / Área</label>
            <select
              value={selectedSpecialtyId}
              onChange={e => setSelectedSpecialtyId(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50 text-xs"
            >
              <option value="">Todas as áreas</option>
              {specialtyOptions.map(sp => (
                <option key={sp.id} value={sp.id}>{sp.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!isReceptionOnly && activeTab === 'performance' ? (
        <>
          {/* Cards de Indicadores de Desempenho (1.1) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-500 block">Total Agendados</span>
              <div className="text-2xl font-black text-slate-900 mt-1">{summary.totalScheduled ?? 0}</div>
              <span className="text-[10px] text-slate-400">
                {summary.validScheduledCount ?? 0} ativos (exceto cancelados)
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-500 block">Atendimentos Concluídos</span>
              <div className="text-2xl font-black text-teal-600 mt-1">{summary.totalCompleted ?? 0}</div>
              <span className="text-[10px] text-slate-400">
                {summary.patientsAttendedCount ?? 0} comparecimentos ({summary.uniquePatientsAttended ?? 0} pacientes)
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-500 block">Taxa de Comparecimento</span>
              <div className="text-2xl font-black text-indigo-600 mt-1">
                {summary.attendanceRatePercent ?? 0}%
              </div>
              <span className="text-[10px] text-slate-400">
                Faltas: {summary.noShowCount ?? 0} ({summary.noShowPercent ?? 0}%) • Canc.: {summary.cancelledCount ?? 0}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-500 block">Ocupação da Agenda</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-black text-indigo-700" title="Ocupação Agendada">
                  {summary.scheduledOccupancyPercent ?? 0}%
                </span>
                <span className="text-xs font-bold text-teal-700" title="Ocupação Efetivamente Realizada">
                  ({summary.realizedOccupancyPercent ?? 0}% realiz.)
                </span>
              </div>
              <span className="text-[10px] text-slate-400">
                Livres não usados: {summary.unusedAvailableHours ?? 0}h de {summary.totalAvailableHours ?? 0}h
              </span>
            </div>

            {canViewFinancial ? (
              <div className="bg-white p-4 rounded-2xl border border-emerald-200 bg-emerald-50/30 shadow-xs">
                <span className="text-[11px] font-semibold text-emerald-800 block">Receita Recebida (Real)</span>
                <div className="text-xl font-black text-emerald-700 mt-1">
                  {Number(summary.receivedRevenue || 0).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL'
                  })}
                </div>
                <span className="text-[10px] text-emerald-700/80">
                  Pagamentos efetivamente quitados no período
                </span>
              </div>
            ) : (
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 block">Horários Não Utilizados</span>
                <div className="text-2xl font-black text-slate-800 mt-1">
                  {summary.unusedAvailableHours ?? 0}h
                </div>
                <span className="text-[10px] text-slate-400">
                  Disponíveis na escala descontando pausas e bloqueios
                </span>
              </div>
            )}
          </div>

          {/* Grid Principal de Relatórios */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ocupação e Desempenho por Profissional */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600" /> Desempenho e Ocupação por Profissional
                </h3>
                <span className="text-[10px] text-slate-400">Baseado na escala real descontando intervalos e bloqueios</span>
              </div>

              <div className="space-y-3 text-xs">
                {(attendanceData?.byProfessional || []).length === 0 ? (
                  <p className="text-slate-400 py-4 text-center">Nenhum dado para os filtros selecionados.</p>
                ) : (
                  (attendanceData?.byProfessional || []).map((prof: any, i: number) => (
                    <div key={prof.professional_id || i} className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2.5">
                      <div className="flex justify-between items-center font-bold text-slate-900 text-sm">
                        <span>{prof.professional_name}</span>
                        <span className="text-indigo-600">{prof.total} agendamentos</span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-600">
                        <div>Concluídos: <strong className="text-teal-600">{prof.completed || 0}</strong></div>
                        <div>Comparecimento: <strong className="text-indigo-600">{prof.attendance_rate_percent ?? 0}%</strong></div>
                        <div>Faltas: <strong className="text-amber-600">{prof.no_show || 0} ({prof.no_show_rate_percent ?? 0}%)</strong></div>
                        <div>Cancelados: <strong className="text-rose-600">{prof.cancelled || 0}</strong></div>
                      </div>

                      <div className="pt-2 border-t border-slate-200/70 space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-600">
                          <span>
                            Ocupação agendada: <strong className="text-indigo-700">{prof.scheduled_occupancy_percent ?? 0}%</strong> ({prof.scheduled_hours ?? 0}h)
                          </span>
                          <span>
                            Realizada: <strong className="text-teal-700">{prof.realized_occupancy_percent ?? 0}%</strong> ({prof.realized_hours ?? 0}h)
                          </span>
                          <span>
                            Livre não usado: <strong>{prof.unused_available_hours ?? 0}h</strong> / {prof.available_hours ?? 0}h
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden flex">
                          <div
                            className="bg-teal-500 h-full transition-all"
                            style={{ width: `${Math.min(100, prof.realized_occupancy_percent || 0)}%` }}
                            title={`Ocupação realizada: ${prof.realized_occupancy_percent || 0}%`}
                          />
                          <div
                            className="bg-indigo-400 h-full transition-all"
                            style={{
                              width: `${Math.max(
                                0,
                                Math.min(100, (prof.scheduled_occupancy_percent || 0) - (prof.realized_occupancy_percent || 0))
                              )}%`
                            }}
                            title={`Ocupação agendada total: ${prof.scheduled_occupancy_percent || 0}%`}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Serviços Mais Realizados */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-teal-600" /> Serviços Mais Realizados
              </h3>

              <div className="space-y-2.5 text-xs">
                {(attendanceData?.byService || []).length === 0 ? (
                  <p className="text-slate-400 py-4 text-center">Nenhum serviço registrado no período.</p>
                ) : (
                  (attendanceData?.byService || []).map((srv: any, i: number) => (
                    <div key={srv.service_id || i} className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between gap-3">
                      <div>
                        <span className="font-bold text-slate-900 text-xs block">{srv.service_name}</span>
                        <span className="text-[11px] text-slate-500">
                          Concluídos: <strong className="text-teal-700">{srv.completed || 0}</strong> • Agendados: {srv.total || 0} • Faltas: {srv.no_show || 0}
                        </span>
                      </div>
                      {canViewFinancial && srv.received_revenue !== null && srv.received_revenue !== undefined && (
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block">Receita recebida</span>
                          <span className="font-extrabold text-emerald-700 text-xs">
                            {Number(srv.received_revenue || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Faturamento por Forma de Pagamento (Somente Perfis Autorizados) */}
            {canViewFinancial && (
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-teal-600" /> Faturamento por Forma de Pagamento (Recebido)
                </h3>

                <div className="space-y-3 text-xs">
                  {(financialData?.byMethod || []).length === 0 ? (
                    <p className="text-slate-400 py-4 text-center">Nenhum pagamento recebido registrado no período.</p>
                  ) : (
                    (financialData?.byMethod || []).map((m: any, i: number) => (
                      <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-slate-900 uppercase text-xs">{m.payment_method}</span>
                          <span className="text-slate-400 text-[11px] block mt-0.5">{m.count} transação(ões) paga(s)</span>
                        </div>
                        <span className="font-extrabold text-slate-900 text-base">
                          {Number(m.total_amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Pacientes Atendidos por Período */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600" /> {clientTermLabel}s Atendidos por Data no Período
              </h3>

              <div className="space-y-2 max-h-64 overflow-y-auto text-xs pr-1">
                {(attendanceData?.patientsByPeriod || []).length === 0 ? (
                  <p className="text-slate-400 py-4 text-center">Nenhum atendimento realizado no período selecionado.</p>
                ) : (
                  (attendanceData?.patientsByPeriod || []).map((item: any) => (
                    <div key={item.date} className="px-3.5 py-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                      <span className="font-semibold text-slate-700">{formatDateBr(item.date)}</span>
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className="text-slate-600">
                          <strong>{item.uniquePatients}</strong> {clientTermLabel.toLowerCase()}(s)
                        </span>
                        <span className="px-2 py-0.5 bg-teal-50 text-teal-700 font-bold rounded-lg border border-teal-200">
                          {item.attendedAppointments} atendimento(s)
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Produção por Módulo Clínico Especializado */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4 lg:col-span-2">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-600" /> Produção por Especialidade / Módulo Clínico
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                {(attendanceData?.byModule || []).length > 0 ? (
                  (attendanceData?.byModule || []).map((mod: any, i: number) => (
                    <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">{mod.module_type || 'Geral'}</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-black text-slate-900">{mod.total}</span>
                        <span className="text-[11px] text-slate-500 font-medium">registros</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full py-4 text-center text-slate-400">
                    Nenhum registro especializado contabilizado no período.
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        /* ABA 1.2: CONTINUIDADE DO CUIDADO */
        <div className="space-y-4">
          <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-indigo-950 flex items-center gap-2">
                <HeartHandshake className="w-4 h-4 text-indigo-600" />
                Acompanhamento e Continuidade do Cuidado
              </h3>
              <p className="text-xs text-indigo-900/80">
                As faixas de dias abaixo são <strong>filtros informativos</strong> desde o último atendimento concluído, e não critérios automáticos de abandono. Pacientes com alta ou tratamento concluído não são sinalizados como pendentes.
              </p>
            </div>
            {(isClinicAdmin || isProfessional || hasPermission('manage_services')) && (
              <button
                type="button"
                onClick={() => setShowServicePeriodicityModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold shadow-2xs shrink-0 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                Periodicidade por Serviço
              </button>
            )}
          </div>

          {/* Faixas Informativas de Dias */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {[
              { id: 'all', label: 'Todos os períodos', count: continuityData?.bandCounts?.all ?? 0 },
              { id: 'up_to_30', label: 'Até 30 dias', count: continuityData?.bandCounts?.up_to_30 ?? 0 },
              { id: '31_to_60', label: 'De 31 a 60 dias', count: continuityData?.bandCounts?.['31_to_60'] ?? 0 },
              { id: '61_to_90', label: 'De 61 a 90 dias', count: continuityData?.bandCounts?.['61_to_90'] ?? 0 },
              { id: 'over_90', label: 'Mais de 90 dias', count: continuityData?.bandCounts?.over_90 ?? 0 }
            ].map(b => (
              <button
                key={b.id}
                type="button"
                onClick={() => setContinuityBand(b.id as ContinuityBand)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  continuityBand === b.id
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                }`}
              >
                <span className={`text-[11px] font-semibold block ${continuityBand === b.id ? 'text-indigo-100' : 'text-slate-500'}`}>
                  {b.label}
                </span>
                <span className="text-lg font-black mt-0.5 block">{b.count}</span>
              </button>
            ))}
          </div>

          {/* Busca e Filtro por Situação */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={continuitySearch}
                onChange={e => setContinuitySearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') fetchCareContinuity(); }}
                placeholder={`Buscar por nome do ${clientTermLabel.toLowerCase()}, telefone ou profissional...`}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={continuitySituation}
                onChange={e => setContinuitySituation(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
              >
                <option value="all">Todas as situações</option>
                <option value="return_pending">Sugestão de contato (prazo atingido)</option>
                <option value="within_period">Dentro do prazo recomendado</option>
                <option value="scheduled">Com próximo agendamento marcado</option>
                <option value="no_deadline">Sem prazo de retorno definido</option>
                <option value="treatment_completed">Alta / Tratamento concluído</option>
              </select>
              <button
                type="button"
                onClick={fetchCareContinuity}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Filtrar
              </button>
            </div>
          </div>

          {/* Lista de Pacientes (Continuidade do Cuidado) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {loadingContinuity ? (
              <div className="p-8 text-center text-xs text-slate-400">Carregando acompanhamento de continuidade do cuidado...</div>
            ) : (continuityData?.items || []).length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Nenhum {clientTermLabel.toLowerCase()} encontrado para os filtros informativos selecionados.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                      <th className="py-3 px-4">{clientTermLabel}</th>
                      <th className="py-3 px-4">Último Atendimento</th>
                      <th className="py-3 px-4">Profissional Responsável</th>
                      <th className="py-3 px-4">Prazo Recomendado</th>
                      <th className="py-3 px-4">Situação / Próximo Agendamento</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(continuityData?.items || []).map((item: any) => (
                      <tr key={item.patientId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{item.patientName}</div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                            {item.patientPhone ? (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="w-3 h-3 text-slate-400" />
                                {item.patientPhone}
                              </span>
                            ) : (
                              <span className="text-slate-400">Sem telefone</span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-800">
                            {formatDateBr(item.lastAppointmentDate)}
                            <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                              há {item.daysSinceLastAttendance}d ({item.bandLabel})
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{item.serviceName}</div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-800">{item.professionalName}</div>
                          <div className="text-[11px] text-slate-500">
                            {item.professionName}
                            {item.specialtyName ? ` • ${item.specialtyName}` : ''}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          {item.recommendedPeriodicityDays ? (
                            <div>
                              <span className="font-semibold text-slate-800">
                                A cada {item.recommendedPeriodicityDays} dias
                              </span>
                              <span className="block text-[10px] text-slate-500">
                                Retorno sugerido: {formatDateBr(item.recommendedReturnDate)} ({item.periodicitySource === 'patient' ? 'por paciente' : 'por serviço'})
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Sem prazo definido</span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                              item.nextAppointmentSituation === 'treatment_completed'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : item.nextAppointmentSituation === 'scheduled'
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                : item.nextAppointmentSituation === 'return_pending'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : item.nextAppointmentSituation === 'within_period'
                                ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {item.nextAppointmentStatusLabel}
                          </span>
                          {item.followUpNotes && (
                            <span className="block text-[10px] text-slate-500 mt-0.5 truncate max-w-xs">
                              Obs: {item.followUpNotes}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                            {canOpenPatientProfile && (
                              <button
                                type="button"
                                onClick={() => setViewingPatientAdmin(item)}
                                className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                              >
                                Cadastro
                              </button>
                            )}
                            {(isClinicAdmin || isProfessional || isReceptionist || hasPermission('create_appointment')) && (
                              <button
                                type="button"
                                onClick={() => {
                                  window.dispatchEvent(
                                    new CustomEvent('zemda-navigate', {
                                      detail: { view: 'calendar', patientId: item.patientId }
                                    })
                                  );
                                }}
                                className="px-2.5 py-1 text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg cursor-pointer"
                              >
                                Agendar retorno
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPatientContinuity(item);
                                setPatientPeriodicityInput(
                                  item.recommendedPeriodicityDays && item.periodicitySource === 'patient'
                                    ? String(item.recommendedPeriodicityDays)
                                    : ''
                                );
                                setPatientFollowUpStatus(item.followUpStatus || 'active');
                                setPatientFollowUpNotes(item.followUpNotes || '');
                              }}
                              className="px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg cursor-pointer"
                            >
                              Retorno / Situação
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Configurar Periodicidade e Situação do Acompanhamento do Paciente */}
      {editingPatientContinuity && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Configurar Acompanhamento</h4>
                <p className="text-[11px] text-slate-500">{editingPatientContinuity.patientName}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingPatientContinuity(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Situação do Acompanhamento</label>
                <select
                  value={patientFollowUpStatus}
                  onChange={e => setPatientFollowUpStatus(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50"
                >
                  <option value="active">Em acompanhamento ativo</option>
                  <option value="completed">Tratamento concluído (não sinalizar retorno pendente)</option>
                  <option value="discharged">Alta concedida (não sinalizar retorno pendente)</option>
                  <option value="paused">Acompanhamento pausado</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Periodicidade de retorno para este paciente (em dias)
                </label>
                <input
                  type="number"
                  min={0}
                  value={patientPeriodicityInput}
                  onChange={e => setPatientPeriodicityInput(e.target.value)}
                  placeholder="Deixe em branco para usar o padrão do serviço ou sem prazo"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white"
                />
                <span className="text-[10px] text-slate-500 block mt-1">
                  Informe 0 ou deixe vazio caso não deseje definir prazo fixo para o paciente.
                </span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Observação administrativa de retorno</label>
                <input
                  type="text"
                  value={patientFollowUpNotes}
                  onChange={e => setPatientFollowUpNotes(e.target.value)}
                  placeholder="Ex: Retornar em 6 meses para revisão preventiva"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingPatientContinuity(null)}
                className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingPatientConfig}
                onClick={handleSavePatientContinuity}
                className="px-4 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl cursor-pointer disabled:opacity-50"
              >
                {savingPatientConfig ? 'Salvando...' : 'Salvar Configuração'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Configurar Periodicidade Recomendada por Serviço */}
      {showServicePeriodicityModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 space-y-4 text-xs max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Periodicidade de Retorno por Serviço</h4>
                <p className="text-[11px] text-slate-500">
                  Defina em quantos dias é recomendado o retorno após cada serviço, ou deixe vazio para não definir prazo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowServicePeriodicityModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 overflow-y-auto pr-1 flex-1">
              {filterServices.map((srv: any) => {
                const defaultDays = srv.return_periodicity_days ?? (srv.reminder_enabled ? srv.reminder_value : '') ?? '';
                return (
                  <div key={srv.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-slate-900 block truncate">{srv.name}</span>
                      <span className="text-[10px] text-slate-500">Duração: {srv.duration_minutes || 50} min</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        defaultValue={defaultDays}
                        placeholder="Sem prazo"
                        onBlur={e => handleSaveServicePeriodicity(srv.id, e.target.value)}
                        className="w-24 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-xs"
                      />
                      <span className="text-[11px] text-slate-500">dias</span>
                      {savingServiceId === srv.id && <span className="text-[10px] text-indigo-600">Salvando...</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowServicePeriodicityModal(false)}
                className="px-4 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Cadastro Administrativo Rápido do Paciente (Sem Dados Clínicos Sensíveis) */}
      {viewingPatientAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Cadastro Administrativo do {clientTermLabel}</h4>
                <p className="text-[11px] text-slate-500">Informações operacionais de contato e agendamento</p>
              </div>
              <button
                type="button"
                onClick={() => setViewingPatientAdmin(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Nome Completo</span>
                <span className="font-bold text-slate-900 text-sm">{viewingPatientAdmin.patientName}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Telefone / WhatsApp</span>
                  <span className="font-semibold text-slate-800">{viewingPatientAdmin.patientPhone || 'Não informado'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">E-mail</span>
                  <span className="font-semibold text-slate-800 truncate block">{viewingPatientAdmin.patientEmail || 'Não informado'}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Último Atendimento</span>
                  <span className="font-semibold text-slate-800">{formatDateBr(viewingPatientAdmin.lastAppointmentDate)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Profissional Responsável</span>
                  <span className="font-semibold text-slate-800">{viewingPatientAdmin.professionalName}</span>
                </div>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Situação do Acompanhamento</span>
                <span className="font-semibold text-indigo-700">{viewingPatientAdmin.nextAppointmentStatusLabel}</span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  const targetId = viewingPatientAdmin.patientId;
                  setViewingPatientAdmin(null);
                  window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: 'patients', patientId: targetId } }));
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Ir para tela de {clientTermLabel}s
              </button>
              <button
                type="button"
                onClick={() => setViewingPatientAdmin(null)}
                className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
