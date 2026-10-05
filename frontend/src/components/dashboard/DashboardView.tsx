import { PatientConsentsDialog } from '../consents/PatientConsentsPanel';
import { ConsentPendingAlert } from '../consents/ConsentPendingAlert';
import { TodayWorklist } from './TodayWorklist';
import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  UserX,
  DollarSign,
  TrendingUp,
  Plus,
  ArrowRight,
  AlertCircle,
  Video,
  MapPin,
  RefreshCw,
  Stethoscope,
  FileText,
  ExternalLink,
  Filter
} from 'lucide-react';
import { AppointmentConsultation } from '../clinical/AppointmentConsultation';
import { PrintableDocumentModal } from '../clinical/PrintableDocumentModal';
import { PatientProfileModal } from '../patients/PatientProfileModal';
import { SelectConsultationModuleModal, getCompatibleClinicalModules, getModuleForProfession } from '../clinical/SelectConsultationModuleModal';
import { WhatsAppReminderModal, WhatsAppIcon } from '../common/WhatsAppReminderModal';
import { isValidPhoneNumber } from '../../utils/phone.utils';

interface DashboardViewProps {
  onNavigate: (view: string) => void;
  onOpenNewAppointment: () => void;
  onOpenNewPatient: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onOpenNewAppointment,
  onOpenNewPatient
}) => {
  const auth = useAuth();
  const { clientTermLabel } = auth;
  const canCreatePatient = auth.isClinicAdmin || auth.hasPermission('create_patient') || auth.hasPermission('edit_patient');
  const canCreateAppointment = auth.isClinicAdmin || auth.hasPermission('create_appointment');
  const { showToast } = useToast();
  const [loading, setLoading] = useState<boolean>(true);
  const [metrics, setMetrics] = useState<any>(null);
  const [quickConsultAppt, setQuickConsultAppt] = useState<any | null>(null);
  const [selectingModuleAppt, setSelectingModuleAppt] = useState<any | null>(null);
  const [compatibleModules, setCompatibleModules] = useState<any[]>([]);
  const [activeConsultationModule, setActiveConsultationModule] = useState<string | undefined>(undefined);
  const [filterTab, setFilterTab] = useState<'all' | 'scheduled' | 'in_progress' | 'completed' | 'no_show' | 'cancelled'>('all');
  const [printDoc, setPrintDoc] = useState<{ type: 'certificate' | 'prescription' | 'exam_request'; id: string } | null>(null);
  const [consentPatientId,setConsentPatientId]=useState<string|null>(null);
  const [viewPatientId, setViewPatientId] = useState<string | null>(null);
  const [whatsappReminderAppt, setWhatsappReminderAppt] = useState<any | null>(null);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
      const data = await ApiClient.get<any>(`/v1/dashboard/metrics?date=${todayStr}`);
      setMetrics(data);
    } catch (err: any) {
      showToast(err.message || 'Erro ao carregar indicadores', 'error');
    } finally {
      setLoading(false);
    }
  };

  const notifyAppointmentChange = () => {
    window.dispatchEvent(new CustomEvent('zemda-appointment-updated'));
  };

  useEffect(() => {
    fetchMetrics();
    const handleRemoteUpdate = () => {
      fetchMetrics();
    };
    window.addEventListener('zemda-appointment-updated', handleRemoteUpdate);
    return () => {
      window.removeEventListener('zemda-appointment-updated', handleRemoteUpdate);
    };
  }, []);

  const executeStartConsultation = async (appointmentId: string, selectedModule?: string) => {
    try {
      const payload: any = { status: 'in_progress' };
      if (selectedModule) {
        payload.clinicalModule = selectedModule;
      }
      await ApiClient.put(`/v1/appointments/${appointmentId}/status`, payload);
      const appt = metrics?.today?.appointments?.find((a: any) => a.id === appointmentId);
      const chosenModule = selectedModule || (appt?.clinical_module !== 'general' && appt?.clinical_module !== 'ZemdaBody' && appt?.clinical_module !== 'Zemda360' ? appt?.clinical_module : undefined) || 'general';
      setActiveConsultationModule(chosenModule);
      setQuickConsultAppt({
        ...appt,
        status: 'in_progress',
        clinical_module: chosenModule
      });
      setSelectingModuleAppt(null);
      showToast('Atendimento iniciado!', 'success');
      fetchMetrics();
      notifyAppointmentChange();
    } catch (err: any) {
      showToast(err.message || 'Erro ao iniciar atendimento', 'error');
    }
  };

  const handleUpdateStatus = async (appointmentId: string, newStatus: string) => {
    try {
      if (newStatus === 'completed') {
        setQuickConsultAppt(metrics.today.appointments.find((a: any) => a.id === appointmentId));
        return;
      }

      if (newStatus === 'in_progress') {
        const appt = metrics?.today?.appointments?.find((a: any) => a.id === appointmentId);
        const autoModule = getModuleForProfession(auth);
        const existingModule = appt?.clinical_module;

        // Se já tiver módulo PRIMÁRIO gravado e válido, mantém o módulo para respeitar a imutabilidade
        if (existingModule && existingModule !== 'general' && existingModule !== 'ZemdaBody' && existingModule !== 'Zemda360') {
          executeStartConsultation(appointmentId, existingModule);
          return;
        }

        // Se for 'general', 'Zemda360', 'ZemdaBody' ou null, promove com segurança para o módulo da profissão do usuário logado
        const chosenModule = (autoModule && autoModule !== 'general') ? autoModule : (existingModule || autoModule || 'general');
        executeStartConsultation(appointmentId, chosenModule);
        return;
      }

      await ApiClient.put(`/v1/appointments/${appointmentId}/status`, { status: newStatus });
      showToast(`Status atualizado para ${newStatus}!`, 'success');
      fetchMetrics();
      notifyAppointmentChange();
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar status', 'error');
    }
  };

  const formatCurrency = (val: number) => {
    return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <span className="bg-emerald-100 text-emerald-800 text-xs font-semibold px-2.5 py-1 rounded-full">Confirmado</span>;
      case 'in_progress':
        return <span className="bg-purple-100 text-purple-800 text-xs font-semibold px-2.5 py-1 rounded-full animate-pulse">Em Atendimento</span>;
      case 'completed':
        return <span className="bg-teal-100 text-teal-800 text-xs font-semibold px-2.5 py-1 rounded-full">Concluído</span>;
      case 'cancelled':
        return <span className="bg-rose-100 text-rose-800 text-xs font-semibold px-2.5 py-1 rounded-full">Cancelado</span>;
      case 'no_show':
        return <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-2.5 py-1 rounded-full">Faltou</span>;
      case 'rescheduled':
        return <span className="bg-sky-100 text-sky-800 text-xs font-semibold px-2.5 py-1 rounded-full">Reagendado</span>;
      default:
        return <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-1 rounded-full">Agendado</span>;
    }
  };

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="text-slate-500 font-medium text-sm">Carregando métricas e atendimentos...</p>
        </div>
      </div>
    );
  }

  const allTodayAppts = metrics?.today?.appointments || [];
  const countScheduled = allTodayAppts.filter((a: any) => a.status === 'scheduled' || a.status === 'confirmed' || a.status === 'rescheduled').length;
  const countInProgress = allTodayAppts.filter((a: any) => a.status === 'in_progress').length;
  const countCompleted = allTodayAppts.filter((a: any) => a.status === 'completed').length;
  const countNoShow = allTodayAppts.filter((a: any) => a.status === 'no_show').length;
  const countCancelled = allTodayAppts.filter((a: any) => a.status === 'cancelled').length;

  const todayList = allTodayAppts.filter((appt: any) => {
    if (filterTab === 'all') return true;
    if (filterTab === 'scheduled') return appt.status === 'scheduled' || appt.status === 'confirmed' || appt.status === 'rescheduled';
    if (filterTab === 'in_progress') return appt.status === 'in_progress';
    if (filterTab === 'completed') return appt.status === 'completed';
    if (filterTab === 'no_show') return appt.status === 'no_show';
    if (filterTab === 'cancelled') return appt.status === 'cancelled';
    return true;
  });

  const firstName = (() => {
    const raw = auth.currentUser?.name?.trim() || '';
    if (!raw) return '';
    const parts = raw.split(/\s+/);
    if ((parts[0].toLowerCase() === 'dr.' || parts[0].toLowerCase() === 'dra.' || parts[0].toLowerCase() === 'dr' || parts[0].toLowerCase() === 'dra') && parts.length > 1) {
      return parts[1];
    }
    return parts[0];
  })();

  const greeting = (() => {
    const hour = new Date().getHours();
    let period = 'Olá';
    if (hour >= 5 && hour < 12) {
      period = 'Bom dia';
    } else if (hour >= 12 && hour < 18) {
      period = 'Boa tarde';
    } else {
      period = 'Boa noite';
    }
    return firstName ? `${period}, ${firstName}` : 'Olá';
  })();

  const fullDateFormatted = (() => {
    try {
      const now = new Date();
      const str = now.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      return str.charAt(0).toUpperCase() + str.slice(1);
    } catch {
      return '';
    }
  })();

  return (
    <div className="space-y-2 min-w-0">
      {/* Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white px-3 py-2.5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            {greeting} 👋
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {fullDateFormatted}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {canCreatePatient && (
            <button
              onClick={onOpenNewPatient}
              className="flex-1 sm:flex-initial justify-center flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all min-h-[36px] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo {clientTermLabel}
            </button>
          )}
          {canCreateAppointment && (
            <button
              onClick={onOpenNewAppointment}
              className="flex-1 sm:flex-initial justify-center flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-all cursor-pointer min-h-[36px]"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo Agendamento
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards Grid (Compact & Informative) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        {/* Atendimentos Hoje */}
        <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Hoje</span>
            <div className="p-1 bg-blue-50 text-blue-600 rounded-lg">
              <CalendarIcon className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold text-slate-900 leading-tight">{metrics?.today?.total || 0}</div>
          <p className="text-[11px] text-slate-400 mt-0.5">atendimentos hoje</p>
        </div>

        {/* Concluídos Hoje */}
        <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Realizados</span>
            <div className="p-1 bg-emerald-50 text-emerald-600 rounded-lg">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold text-slate-900 leading-tight">{allTodayAppts.filter((a: any) => a.status === 'completed').length}</div>
          <p className="text-[11px] text-slate-400 mt-0.5">finalizados hoje</p>
        </div>

        {/* Faltas / No-Show */}
        <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Faltas</span>
            <div className="p-1 bg-amber-50 text-amber-600 rounded-lg">
              <UserX className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold text-slate-900 leading-tight">{allTodayAppts.filter((a: any) => a.status === 'no_show').length}</div>
          <p className="text-[11px] text-slate-400 mt-0.5">faltas hoje</p>
        </div>

        {metrics?.permissions?.finance && <>
        {/* Faturamento Recebido */}
        <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Receita</span>
            <div className="p-1 bg-teal-50 text-teal-600 rounded-lg">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-lg sm:text-xl font-bold text-slate-900 truncate leading-tight">
            {formatCurrency(metrics?.monthly?.revenue)}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">recebido no mês</p>
        </div>

        {/* Valores Pendentes */}
        <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Pendente</span>
            <div className="p-1 bg-rose-50 text-rose-600 rounded-lg">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-lg sm:text-xl font-bold text-slate-900 truncate leading-tight">
            {formatCurrency(metrics?.monthly?.pending)}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">a receber</p>
        </div>
      </>}
      </div>

      <TodayWorklist data={metrics?.worklist} onNavigate={onNavigate} onPatient={setViewPatientId} />

      {/* Main Content Area: Today's Appointments & Monthly Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5 items-start">
        {/* Atendimentos de Hoje (2/3 width) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-3 shadow-xs">
          <div className="flex items-center justify-between mb-2.5">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Agenda de Hoje</h3>
              <p className="text-xs text-slate-500">Acompanhe os clientes e altere o status com agilidade.</p>
            </div>
            <button
              onClick={() => onNavigate('calendar')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
            >
              Ver agenda completa <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Filtros Rápidos (Item 3) */}
          <div className="flex items-center gap-1 flex-wrap pb-2 mb-2 text-xs border-b border-slate-100 no-scrollbar">
            {[
              { id: 'all', label: `Todos (${allTodayAppts.length})` },
              { id: 'scheduled', label: `Agendados (${countScheduled})` },
              { id: 'in_progress', label: `Em atendimento (${countInProgress})` },
              { id: 'completed', label: `Concluídos (${countCompleted})` },
              { id: 'no_show', label: `Faltas (${countNoShow})` },
              { id: 'cancelled', label: `Cancelados (${countCancelled})` }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTab(tab.id as any)}
                className={`px-2 py-1 rounded-lg font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                  filterTab === tab.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {todayList.length === 0 ? (
            <div className="py-4 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
              <CalendarIcon className="w-8 h-8 mx-auto mb-1.5 opacity-40 text-slate-400" />
              <p className="font-medium text-xs sm:text-sm">Nenhum atendimento encontrado com o filtro selecionado.</p>
              {canCreateAppointment && (
                <button
                  onClick={onOpenNewAppointment}
                  className="mt-2 text-xs font-semibold text-indigo-600 hover:underline cursor-pointer"
                >
                  + Criar agendamento agora
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[320px] overflow-y-auto overflow-x-hidden pr-1.5 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]">
              {todayList.map((appt: any) => {
                const startTime = appt.start_time?.split('T')[1]?.slice(0, 5) || '00:00';
                const endTime = appt.end_time?.split('T')[1]?.slice(0, 5) || '00:00';

                return (
                  <div key={appt.id} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-50/70 p-2 rounded-lg transition-colors">
                    <div className="flex items-start gap-2.5">
                      <div className="w-11 h-11 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 flex flex-col items-center justify-center flex-shrink-0 font-bold">
                        <span className="text-xs leading-none">{startTime}</span>
                        <span className="text-[10px] text-indigo-400 leading-none mt-0.5">{endTime}</span>
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4
                            onClick={() => setViewPatientId(appt.patient_id)}
                            className="font-bold text-slate-900 text-sm hover:text-indigo-600 cursor-pointer transition-colors"
                            title="Clique para abrir prontuário do paciente"
                          >
                            {appt.patient_name}
                          </h4>
                          {getStatusBadge(appt.status)}

                          {/* Indicador de Evolução Clínica do Dia */}
                          {appt.has_evolution > 0 ? (
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Evolução Realizada
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-500 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-slate-200">
                              <Clock className="w-3 h-3 text-slate-400" /> Pendente de Evolução
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-500">
                          {appt.service_name} • <span className="font-medium text-slate-700">{appt.professional_name}</span>
                          {appt.clinical_module && appt.clinical_module !== 'general' && <span> · {appt.clinical_module === 'ZemdaBody' ? 'Zemda360' : appt.clinical_module}</span>}
                        </p>

                        <div className="flex items-center gap-2.5 text-[11px] text-slate-400 flex-wrap">
                          {appt.modality === 'online' ? (
                            <span className="flex items-center gap-1 text-teal-600"><Video className="w-3 h-3" /> Online</span>
                          ) : (
                            <span className="flex items-center gap-1 text-slate-500"><MapPin className="w-3 h-3" /> Presencial</span>
                          )}
                          <span>Tel: {appt.patient_phone}</span>

                          {/* Link para Prontuário */}
                          <button
                            type="button"
                            onClick={() => setViewPatientId(appt.patient_id)}
                            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                          >
                            <ExternalLink className="w-3 h-3" /> Prontuário Vinculado
                          </button>
                        </div>

                        {/* Documentos Gerados no Atendimento (Item 3 & 5) */}
                        {(appt.certificate_id || appt.prescription_id || appt.exam_request_id) && (
                          <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                            <span className="text-[10px] font-bold text-slate-400">Documentos:</span>
                            {appt.certificate_id && (
                              <button
                                type="button"
                                onClick={() => setPrintDoc({ type: 'certificate', id: appt.certificate_id })}
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[10px] font-bold rounded-md border border-amber-200 transition-all cursor-pointer shadow-2xs"
                                title="Visualizar e Imprimir Atestado"
                              >
                                <FileText className="w-3 h-3" /> Atestado
                              </button>
                            )}
                            {appt.prescription_id && (
                              <button
                                type="button"
                                onClick={() => setPrintDoc({ type: 'prescription', id: appt.prescription_id })}
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-50 hover:bg-teal-100 text-teal-800 text-[10px] font-bold rounded-md border border-teal-200 transition-all cursor-pointer shadow-2xs"
                                title="Visualizar e Imprimir Receituário"
                              >
                                <FileText className="w-3 h-3" /> Receita
                              </button>
                            )}
                            {appt.exam_request_id && (
                              <button
                                type="button"
                                onClick={() => setPrintDoc({ type: 'exam_request', id: appt.exam_request_id })}
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-800 text-[10px] font-bold rounded-md border border-blue-200 transition-all cursor-pointer shadow-2xs"
                                title="Visualizar e Imprimir Solicitação de Exames"
                              >
                                <FileText className="w-3 h-3" /> Pedido Exames
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quick Status Action Buttons */}
                    <div className="flex items-center gap-1.5 flex-wrap sm:flex-wrap">
                      {auth.canAccessConsents && appt.patient_id && (
                        <ConsentPendingAlert
                          compact
                          patientId={appt.patient_id}
                          serviceId={appt.service_id}
                          onOpen={() => setConsentPatientId(appt.patient_id)}
                        />
                      )}
                      {appt.status !== 'completed' && appt.status !== 'cancelled' && (
                        <button
                          onClick={() => handleUpdateStatus(appt.id, 'in_progress')}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-teal-600 text-white hover:bg-teal-700 rounded-lg transition-all shadow-xs cursor-pointer"
                          title="Iniciar Atendimento Rápido"
                        >
                          <Stethoscope className="w-3.5 h-3.5" />
                          <span>Atender</span>
                        </button>
                      )}
                      {appt.status === 'scheduled' && (
                        <button
                          onClick={() => handleUpdateStatus(appt.id, 'confirmed')}
                          className="px-2 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
                        >
                          Confirmar
                        </button>
                      )}
                      {appt.status === 'confirmed' && (
                        <button
                          onClick={() => handleUpdateStatus(appt.id, 'in_progress')}
                          className="px-2 py-1 text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg transition-colors cursor-pointer"
                        >
                          Iniciar
                        </button>
                      )}
                      {(appt.status === 'in_progress' || appt.status === 'confirmed') && (
                        <button
                          onClick={() => handleUpdateStatus(appt.id, 'completed')}
                          className="px-2 py-1 text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 rounded-lg transition-colors shadow-xs cursor-pointer"
                        >
                          Concluir
                        </button>
                      )}
                      {appt.status !== 'completed' && appt.status !== 'cancelled' && (
                        <button
                          onClick={() => handleUpdateStatus(appt.id, 'no_show')}
                          className="px-2 py-1 text-xs font-medium text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                          title="Marcar falta"
                        >
                          Faltou
                        </button>
                      )}

                      {/* Botão de Envio Manual de Lembrete pelo WhatsApp */}
                      {['scheduled', 'confirmed', 'rescheduled'].includes(appt.status) && (
                        <button type="button" onClick={() => handleUpdateStatus(appt.id, 'cancelled')}
                          className="px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer">
                          Cancelar
                        </button>
                      )}
                      {(() => {
                        const hasPhone = isValidPhoneNumber(appt.patient_phone);
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              if (hasPhone) {
                                setWhatsappReminderAppt(appt);
                              }
                            }}
                            disabled={!hasPhone}
                            title={hasPhone ? 'Enviar lembrete pelo WhatsApp' : 'Paciente sem telefone cadastrado'}
                            className={`flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg transition-all ${
                              hasPhone
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/80 cursor-pointer shadow-2xs'
                                : 'bg-slate-100 text-slate-400 border border-slate-200/60 opacity-60 cursor-not-allowed'
                            }`}
                          >
                            <WhatsAppIcon className={`w-3.5 h-3.5 ${hasPhone ? 'fill-emerald-600' : 'fill-slate-400'}`} />
                            <span>WhatsApp</span>
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Monthly Trend & Quick Stats (1/3 width) */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm mb-0.5">Evolução Mensal</h3>
            <p className="text-xs text-slate-500 mb-3">Volume de atendimentos nos últimos meses.</p>

            {/* Visual Bar Chart */}
            <div className="space-y-2">
              {(metrics?.chart || []).map((item: any, idx: number) => {
                const max = Math.max(...(metrics?.chart || []).map((c: any) => c.appointments), 10);
                const percent = Math.min(100, Math.round((item.appointments / max) * 100));

                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold text-slate-700">
                      <span className="capitalize">{item.month}</span>
                      <span>{item.appointments} atendimentos</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-100 bg-slate-50 p-3 rounded-lg">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">Resumo Operacional</h4>
            <div className="space-y-1 text-xs text-slate-600">
              {auth.currentUser?.role === 'professional' ? (
                <>
                  <div className="flex justify-between">
                    <span>Meus Atendimentos (mês):</span>
                    <span className="font-bold text-slate-900">{metrics?.monthly?.totalAppointments || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Finalizados (mês):</span>
                    <span className="font-bold text-slate-900">{metrics?.monthly?.completed || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Novos {clientTermLabel}s (mês):</span>
                    <span className="font-bold text-indigo-600">+{metrics?.monthly?.newPatients || 0}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span>Profissionais Ativos:</span>
                    <span className="font-bold text-slate-900">{metrics?.totals?.active_professionals || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Serviços Configurados:</span>
                    <span className="font-bold text-slate-900">{metrics?.totals?.active_services || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Novos {clientTermLabel}s (mês):</span>
                    <span className="font-bold text-indigo-600">+{metrics?.monthly?.newPatients || 0}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Seleção de Módulo Clínico */}
      {selectingModuleAppt && (
        <SelectConsultationModuleModal
          isOpen={!!selectingModuleAppt}
          onClose={() => setSelectingModuleAppt(null)}
          modules={compatibleModules}
          patientName={selectingModuleAppt.patient_name}
          serviceName={selectingModuleAppt.service_name}
          onSelectModule={(moduleId) => executeStartConsultation(selectingModuleAppt.id, moduleId)}
        />
      )}

      {/* Modal de Atendimento Rápido */}
      {quickConsultAppt && (
        <AppointmentConsultation
          appointment={{
            id: quickConsultAppt.id,
            patient_id: quickConsultAppt.patient_id,
            patient_name: quickConsultAppt.patient_name,
            patient_phone: quickConsultAppt.patient_phone,
            professional_id: quickConsultAppt.professional_id,
            professional_name: quickConsultAppt.professional_name,
            service_id: quickConsultAppt.service_id,
            service_name: quickConsultAppt.service_name,
            start_time: quickConsultAppt.start_time,
            end_time: quickConsultAppt.end_time,
            modality: quickConsultAppt.modality,
            status: quickConsultAppt.status,
            clinical_module: quickConsultAppt.clinical_module || activeConsultationModule
          }}
          initialModuleType={activeConsultationModule || quickConsultAppt.clinical_module}
          onClose={() => setQuickConsultAppt(null)}
          onFinished={() => {
            setQuickConsultAppt(null);
            fetchMetrics();
            notifyAppointmentChange();
          }}
        />
      )}

      {/* Modal de Impressão Rápida / Visualização / Download PDF */}
      {printDoc && (
        <PrintableDocumentModal
          documentType={printDoc.type}
          documentId={printDoc.id}
          onClose={() => setPrintDoc(null)}
        />
      )}

      {/* Modal de Prontuário e Perfil do Paciente */}
      {consentPatientId&&<PatientConsentsDialog patientId={consentPatientId} onClose={()=>setConsentPatientId(null)}/>}
      {viewPatientId && (
        <PatientProfileModal
          patientId={viewPatientId}
          onClose={() => setViewPatientId(null)}
          onUpdated={() => {
            fetchMetrics();
            notifyAppointmentChange();
          }}
        />
      )}

      {/* Modal de Envio Manual de Lembrete pelo WhatsApp */}
      {whatsappReminderAppt && (
        <WhatsAppReminderModal
          isOpen={Boolean(whatsappReminderAppt)}
          onClose={() => setWhatsappReminderAppt(null)}
          appointment={whatsappReminderAppt}
          clinicName={auth.currentTenant?.name || 'Clínica'}
          onSuccess={() => {
            fetchMetrics();
            notifyAppointmentChange();
          }}
        />
      )}
    </div>
  );
};
