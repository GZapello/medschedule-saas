import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Appointment, Professional, Room, Service } from '../../types';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Filter,
  Clock,
  User,
  Video,
  MapPin,
  Calendar as CalendarIcon,
  X,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Stethoscope
} from 'lucide-react';
import { FinishConsultationModal } from '../clinical/FinishConsultationModal';
import { AppointmentConsultation } from '../clinical/AppointmentConsultation';
import { SelectConsultationModuleModal, getCompatibleClinicalModules, getModuleForProfession } from '../clinical/SelectConsultationModuleModal';
import { WhatsAppReminderModal, WhatsAppIcon } from '../common/WhatsAppReminderModal';
import { isValidPhoneNumber, formatPhoneDisplay } from '../../utils/phone.utils';

interface CalendarViewProps {
  onOpenNewAppointment: (prefill?: { date?: string; time?: string; professionalId?: string }) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ onOpenNewAppointment }) => {
  const auth = useAuth();
  const { currentTenant, clientTermLabel } = auth;
  const { showToast } = useToast();

  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filtros
  const [selectedProf, setSelectedProf] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Modal de Detalhes
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [isRescheduling, setIsRescheduling] = useState<boolean>(false);
  const [rescheduleDate, setRescheduleDate] = useState<string>('');
  const [rescheduleTime, setRescheduleTime] = useState<string>('');

  // Modais de Atendimento Rápido, Finalização e Cancelamento Estruturado
  const [activeConsultationAppt, setActiveConsultationAppt] = useState<any | null>(null);
  const [activeConsultationModule, setActiveConsultationModule] = useState<string | undefined>(undefined);
  const [selectingModuleAppt, setSelectingModuleAppt] = useState<Appointment | null>(null);
  const [compatibleModules, setCompatibleModules] = useState<any[]>([]);
  const [finishingAppt, setFinishingAppt] = useState<any | null>(null);
  const [cancellingAppt, setCancellingAppt] = useState<any | null>(null);
  const [cancellationCategory, setCancellationCategory] = useState<string>('Desistência do paciente');
  const [cancellationReason, setCancellationReason] = useState<string>('');

  // Lembrete manual pelo WhatsApp e histórico de comunicações
  const [whatsappReminderAppt, setWhatsappReminderAppt] = useState<Appointment | null>(null);
  const [communications, setCommunications] = useState<any[]>([]);
  const [loadingComms, setLoadingComms] = useState<boolean>(false);

  const refreshCommunications = (apptId: string) => {
    setLoadingComms(true);
    ApiClient.get<any[]>(`/v1/appointments/${apptId}/communications`)
      .then((data) => setCommunications(Array.isArray(data) ? data : []))
      .catch((err) => console.warn('[CalendarView] Erro ao buscar histórico de comunicações:', err))
      .finally(() => setLoadingComms(false));
  };

  useEffect(() => {
    if (selectedAppt) {
      refreshCommunications(selectedAppt.id);
    } else {
      setCommunications([]);
    }
  }, [selectedAppt]);

  const fetchCalendarData = async () => {
    try {
      setLoading(true);
      const [apptsData, profsData, roomsData] = await Promise.all([
        ApiClient.get<Appointment[]>('/v1/appointments'),
        ApiClient.get<Professional[]>('/v1/professionals'),
        ApiClient.get<Room[]>('/v1/rooms')
      ]);
      setAppointments(apptsData);
      setProfessionals(profsData);
      setRooms(roomsData);
    } catch (err: any) {
      showToast(err.message || 'Erro ao carregar dados da agenda', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendarData();
  }, []);

  // Atualização automática na virada do dia (23:59 -> 00:00)
  useEffect(() => {
    let lastDateStr = new Date().toDateString();
    const interval = setInterval(() => {
      const now = new Date();
      const nowDateStr = now.toDateString();
      if (nowDateStr !== lastDateStr) {
        lastDateStr = nowDateStr;
        setCurrentDate(prev => {
          // Se estava visualizando o dia de ontem ou hoje, sincroniza para hoje
          const isViewingTodayOrPast = prev.toDateString() === new Date(now.getTime() - 86400000).toDateString() ||
                                       prev.toDateString() === nowDateStr;
          if (isViewingTodayOrPast) {
            return new Date();
          }
          return prev;
        });
        fetchCalendarData();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Navegação temporal
  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === 'day') d.setDate(d.getDate() - 1);
    else if (viewMode === 'week') d.setDate(d.getDate() - 6);
    else d.setMonth(d.getMonth() - 1);
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (viewMode === 'day') d.setDate(d.getDate() + 1);
    else if (viewMode === 'week') d.setDate(d.getDate() + 6);
    else d.setMonth(d.getMonth() + 1);
    setCurrentDate(d);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleUpdateStatus = async (apptId: string, status: string, reason?: string, category?: string) => {
    try {
      await ApiClient.put(`/v1/appointments/${apptId}/status`, {
        status,
        reason: reason || null,
        cancellationReasonCategory: category || null
      });
      showToast(`Status atualizado para ${status}`, 'success');
      setSelectedAppt(null);
      setCancellingAppt(null);
      fetchCalendarData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar status', 'error');
    }
  };

  const executeStartConsultation = async (appointment: Appointment, selectedModule?: string) => {
    try {
      const payload: any = { status: 'in_progress' };
      if (selectedModule) {
        payload.clinicalModule = selectedModule;
      }
      await ApiClient.put(`/v1/appointments/${appointment.id}/status`, payload);
      const chosenModule = selectedModule || (appointment as any).clinical_module;
      setActiveConsultationModule(chosenModule);
      setActiveConsultationAppt({
        ...appointment,
        status: 'in_progress',
        clinical_module: chosenModule
      });
      setSelectedAppt(null);
      setSelectingModuleAppt(null);
      fetchCalendarData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao iniciar atendimento', 'error');
    }
  };

  const startConsultation = async (appointment: Appointment) => {
    if (['completed', 'cancelled', 'no_show'].includes(appointment.status)) {
      showToast('Abra o prontuário para consultar um atendimento encerrado.', 'info');
      return;
    }

    // Se o agendamento já tiver módulo gravado previamente, abre direto nele sem modal
    if ((appointment as any).clinical_module) {
      executeStartConsultation(appointment, (appointment as any).clinical_module);
      return;
    }

    // Acesso automático: detecta a profissão do usuário logado e abre diretamente o módulo correspondente
    const autoModule = getModuleForProfession(auth);
    executeStartConsultation(appointment, autoModule);
  };

  const handleConfirmReschedule = async () => {
    if (!selectedAppt || !rescheduleDate || !rescheduleTime) {
      showToast('Selecione a nova data e horário', 'error');
      return;
    }

    try {
      const startTime = `${rescheduleDate}T${rescheduleTime}:00`;
      const duration = selectedAppt.duration_minutes || 50;
      const [h, m] = rescheduleTime.split(':').map(Number);
      const endTotal = h * 60 + m + duration;
      const endH = Math.floor(endTotal / 60).toString().padStart(2, '0');
      const endM = (endTotal % 60).toString().padStart(2, '0');
      const endTime = `${rescheduleDate}T${endH}:${endM}:00`;

      await ApiClient.put(`/v1/appointments/${selectedAppt.id}/reschedule`, {
        startTime,
        endTime,
        reason: 'Remarcado pelo painel da agenda'
      });

      showToast('Atendimento remarcado com sucesso!', 'success');
      setIsRescheduling(false);
      setSelectedAppt(null);
      fetchCalendarData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao remarcar', 'error');
    }
  };

  // Cores por status
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-emerald-500 text-white border-emerald-600';
      case 'in_progress':
        return 'bg-purple-600 text-white border-purple-700 animate-pulse';
      case 'completed':
        return 'bg-teal-600 text-white border-teal-700';
      case 'no_show':
        return 'bg-amber-500 text-white border-amber-600';
      case 'cancelled':
        return 'bg-rose-500 text-white border-rose-600 opacity-60';
      case 'rescheduled':
        return 'bg-orange-500 text-white border-orange-600';
      default:
        return 'bg-blue-600 text-white border-blue-700';
    }
  };

  // Filtra agendamentos
  const filteredAppointments = appointments.filter(a => {
    if (selectedProf !== 'all' && a.professional_id !== selectedProf) return false;
    if (selectedStatus !== 'all' && a.status !== selectedStatus) return false;
    return true;
  });

  // Cálculo dos dias da semana: inicia SEMPRE a partir da data base (HOJE como primeiro dia exibido)
  const getWeekDays = (baseDate: Date) => {
    const days: Date[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const formatDateLocal = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const weekDays = getWeekDays(currentDate);
  const timeSlots = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

  return (
    <div className="space-y-4">
      {/* Top Controls Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Navigation buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleToday}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Hoje
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrev}
              className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
              title="Período anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={handleNext}
              className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
              title="Próximo período"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <span className="text-base font-bold text-slate-800 ml-2">
            {currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </span>
        </div>

        {/* Filters and Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de Profissional */}
          <select
            value={selectedProf}
            onChange={e => setSelectedProf(e.target.value)}
            className="text-xs font-medium border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Todos os Profissionais</option>
            {professionals.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Seletor de Status */}
          <select
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            className="text-xs font-medium border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Todos os Status</option>
            <option value="scheduled">Agendado</option>
            <option value="confirmed">Confirmado</option>
            <option value="in_progress">Em Atendimento</option>
            <option value="completed">Concluído</option>
            <option value="no_show">Faltou</option>
            <option value="cancelled">Cancelado</option>
          </select>

          {/* Modos de visualização */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                viewMode === 'day' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Dia
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                viewMode === 'week' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Semana
            </button>
          </div>

          <button
            data-tour="btn-new-appointment"
            onClick={() => onOpenNewAppointment(selectedProf !== 'all' ? { professionalId: selectedProf } : undefined)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Agendar
          </button>
        </div>
      </div>

      {/* Calendar Grid (Week Mode) */}
      {viewMode === 'week' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Week Header */}
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold text-slate-700">
              <div className="py-3 border-r border-slate-200 text-slate-400">Horário</div>
              {weekDays.map((d, i) => {
                const isToday = d.toDateString() === new Date().toDateString();
                return (
                  <div
                    key={i}
                    className={`py-3 border-r border-slate-200 last:border-r-0 ${
                      isToday ? 'bg-indigo-50/70 text-indigo-700 font-bold' : ''
                    }`}
                  >
                    <div>{d.toLocaleDateString('pt-BR', { weekday: 'short' })}</div>
                    <div className="text-sm mt-0.5">{d.getDate()}</div>
                  </div>
                );
              })}
            </div>

            {/* Time Grid Rows */}
            <div className="divide-y divide-slate-100">
              {timeSlots.map(timeSlot => (
                <div key={timeSlot} className="grid grid-cols-7 min-h-[75px]">
                  {/* Time label */}
                  <div className="border-r border-slate-200 p-2 text-[11px] font-semibold text-slate-400 text-right pr-3">
                    {timeSlot}
                  </div>

                  {/* Day Columns */}
                  {weekDays.map((dayDate, dayIdx) => {
                    const dayStr = formatDateLocal(dayDate);
                    const slotStartPrefix = `${dayStr}T${timeSlot}`;

                    // Filtra agendamentos nesta data e hora
                    const slotAppts = filteredAppointments.filter(a => {
                      return a.start_time.startsWith(slotStartPrefix.slice(0, 13)); // Match no início da hora
                    });

                    return (
                      <div
                        key={dayIdx}
                        onClick={(e) => {
                          if (e.target === e.currentTarget || (e.target as HTMLElement).getAttribute('data-empty-slot') === 'true') {
                            onOpenNewAppointment({
                              date: dayStr,
                              time: timeSlot,
                              professionalId: selectedProf !== 'all' ? selectedProf : undefined
                            });
                          }
                        }}
                        className="border-r border-slate-100 last:border-r-0 p-1 relative hover:bg-indigo-50/40 transition-colors group/slot cursor-pointer min-h-[75px]"
                        title={`Clique para agendar às ${timeSlot} (${dayDate.toLocaleDateString('pt-BR')})`}
                      >
                        {slotAppts.map(appt => (
                          <div
                            key={appt.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAppt(appt);
                            }}
                            className={`p-1.5 rounded-lg text-xs cursor-pointer shadow-xs border transition-transform hover:scale-[1.02] mb-1 ${getStatusColor(
                              appt.status
                            )}`}
                          >
                            <div className="font-bold truncate leading-tight">{appt.patient_name}</div>
                            <div className="text-[10px] opacity-90 truncate leading-tight mt-0.5">
                              {appt.service_name}
                            </div>
                            <div className="text-[10px] opacity-80 flex items-center gap-1 mt-1">
                              <Clock className="w-2.5 h-2.5" />
                              {appt.start_time.split('T')[1].slice(0, 5)}
                            </div>
                          </div>
                        ))}
                        {slotAppts.length === 0 && (
                          <div
                            data-empty-slot="true"
                            className="h-full w-full min-h-[50px] flex items-center justify-center opacity-0 group-hover/slot:opacity-100 transition-opacity"
                          >
                            <span data-empty-slot="true" className="text-[10px] font-semibold text-indigo-600 bg-white border border-indigo-200 px-2 py-0.5 rounded-md shadow-xs flex items-center gap-1">
                              <Plus className="w-3 h-3" /> {timeSlot}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Calendar Day View */}
      {viewMode === 'day' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900 text-lg">
              Atendimentos para {currentDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
            <button
              onClick={() => onOpenNewAppointment({
                date: formatDateLocal(currentDate),
                time: '09:00',
                professionalId: selectedProf !== 'all' ? selectedProf : undefined
              })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl"
            >
              <Plus className="w-4 h-4" /> Novo neste dia
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {timeSlots.map(timeSlot => {
              const currentDateStr = formatDateLocal(currentDate);
              const slotAppts = filteredAppointments.filter(a =>
                a.start_time.startsWith(`${currentDateStr}T${timeSlot.slice(0, 2)}`)
              );
              return (
                <div
                  key={timeSlot}
                  onClick={(e) => {
                    if (e.target === e.currentTarget || (e.target as HTMLElement).getAttribute('data-empty-slot') === 'true') {
                      onOpenNewAppointment({ date: currentDateStr, time: timeSlot });
                    }
                  }}
                  className="py-2.5 px-3 flex items-start gap-4 hover:bg-indigo-50/30 rounded-xl cursor-pointer transition-colors group"
                  title={`Clique para agendar às ${timeSlot}`}
                >
                  <div className="w-16 text-xs font-bold text-slate-400 group-hover:text-indigo-600 pt-1">
                    {timeSlot}
                  </div>
                  <div className="flex-1">
                    {slotAppts.length > 0 ? (
                      <div className="space-y-2">
                        {slotAppts.map(appt => (
                          <div
                            key={appt.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAppt(appt);
                            }}
                            className="p-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-xs cursor-pointer flex items-center justify-between bg-white"
                          >
                            <div className="flex items-center gap-4">
                              <div className="text-center font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg text-xs">
                                {appt.start_time.split('T')[1].slice(0, 5)}
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-900 text-sm">{appt.patient_name}</h4>
                                <p className="text-xs text-slate-500">{appt.service_name} • Profissional: {appt.professional_name}</p>
                              </div>
                            </div>
                            <div className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getStatusColor(appt.status)}`}>
                              {appt.status}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div data-empty-slot="true" className="py-2 text-xs text-slate-400 group-hover:text-indigo-600 flex items-center gap-1.5">
                        <Plus className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100" />
                        <span>Horário livre — clique para agendar às {timeSlot}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Appointment Detail & Actions Modal */}
      {selectedAppt && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">{selectedAppt.appointment_number}</span>
                <h3 className="text-xl font-bold text-slate-900">{selectedAppt.patient_name}</h3>
              </div>
              <button
                onClick={() => {
                  setSelectedAppt(null);
                  setIsRescheduling(false);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!isRescheduling ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-slate-400 font-medium">Serviço:</span>
                    <p className="font-bold text-slate-800 text-sm mt-0.5">{selectedAppt.service_name}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-slate-400 font-medium">Profissional:</span>
                    <p className="font-bold text-slate-800 text-sm mt-0.5">{selectedAppt.professional_name}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-slate-400 font-medium">Horário:</span>
                    <p className="font-bold text-slate-800 text-sm mt-0.5">
                      {selectedAppt.start_time.split('T')[0]} • {selectedAppt.start_time.split('T')[1].slice(0, 5)}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-slate-400 font-medium">Status Atual:</span>
                    <div className="mt-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getStatusColor(selectedAppt.status)}`}>
                        {selectedAppt.status}
                      </span>
                    </div>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 col-span-2 flex items-center justify-between">
                    <div>
                      <span className="text-slate-400 font-medium text-[11px] block">Telefone do Paciente:</span>
                      <p className="font-bold text-slate-800 text-xs mt-0.5 flex items-center gap-1.5">
                        {isValidPhoneNumber(selectedAppt.patient_phone) ? (
                          <>
                            <WhatsAppIcon className="w-3.5 h-3.5 fill-emerald-600 inline shrink-0" />
                            <span>{formatPhoneDisplay(selectedAppt.patient_phone)}</span>
                          </>
                        ) : (
                          <span className="text-rose-500 font-medium italic text-[11px]">Paciente sem telefone cadastrado</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {selectedAppt.patient_notes && (
                  <div className="text-xs bg-amber-50 text-amber-900 p-3 rounded-xl border border-amber-200">
                    <span className="font-bold">Observações do cliente:</span> {selectedAppt.patient_notes}
                  </div>
                )}

                {/* Atendimento Rápido e Status Action Buttons */}
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <button
                    onClick={() => {
                      startConsultation(selectedAppt);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 shadow-md shadow-teal-500/20 transition-all cursor-pointer"
                  >
                    <Stethoscope className="w-4 h-4" />
                    <span>INICIAR ATENDIMENTO</span>
                  </button>

                  {/* Botão de Envio de Lembrete pelo WhatsApp */}
                  {(() => {
                    const hasPhone = isValidPhoneNumber(selectedAppt.patient_phone);
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          if (hasPhone) {
                            setWhatsappReminderAppt(selectedAppt);
                          }
                        }}
                        disabled={!hasPhone}
                        title={hasPhone ? 'Enviar lembrete pelo WhatsApp' : 'Paciente sem telefone cadastrado'}
                        className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
                          hasPhone
                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300/80 shadow-xs cursor-pointer'
                            : 'bg-slate-100 text-slate-400 border border-slate-200 opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <WhatsAppIcon className={`w-4 h-4 ${hasPhone ? 'fill-emerald-600' : 'fill-slate-400'}`} />
                        <span>Enviar lembrete pelo WhatsApp</span>
                      </button>
                    );
                  })()}

                  <div>
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Alterar Status</h4>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleUpdateStatus(selectedAppt.id, 'confirmed')}
                        className="px-3 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg"
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() => startConsultation(selectedAppt)}
                        className="px-3 py-1.5 text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg"
                      >
                        Iniciar
                      </button>
                      <button
                        onClick={() => {
                          setFinishingAppt(selectedAppt);
                          setSelectedAppt(null);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 rounded-lg shadow-xs"
                      >
                        Concluir Atendimento
                      </button>
                    <button
                      onClick={() => handleUpdateStatus(selectedAppt.id, 'no_show')}
                      className="px-3 py-1.5 text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg"
                    >
                      Marcar Falta
                    </button>
                    <button
                      onClick={() => {
                        setCancellingAppt(selectedAppt);
                        setCancellationReason('');
                        setCancellationCategory('Desistência do paciente');
                      }}
                      className="px-3 py-1.5 text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>

                <div className="pt-2 flex justify-between">
                  <button
                    onClick={() => {
                      setIsRescheduling(true);
                      setRescheduleDate(selectedAppt.start_time.split('T')[0]);
                      setRescheduleTime(selectedAppt.start_time.split('T')[1].slice(0, 5));
                    }}
                    className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Remarcar este atendimento
                  </button>
                </div>

                {/* Histórico de Lembretes / Comunicações */}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Histórico de Comunicações & Lembretes
                    </h4>
                    {loadingComms && (
                      <span className="text-[10px] text-slate-400">Carregando...</span>
                    )}
                  </div>

                  {communications.length === 0 && !loadingComms ? (
                    <p className="text-[11px] text-slate-400 italic">
                      Nenhum lembrete registrado para este agendamento até o momento.
                    </p>
                  ) : (
                    <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
                      {communications.map((comm) => {
                        const sentDate = comm.sent_at || comm.created_at;
                        const dateFormatted = sentDate
                          ? new Date(sentDate).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                          : '';
                        const isManual = comm.mode === 'manual' || comm.type === 'reminder_manual';

                        return (
                          <div
                            key={comm.id}
                            className="bg-slate-50 border border-slate-200/80 rounded-lg p-2 text-[11px] flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <WhatsAppIcon className="w-3.5 h-3.5 fill-emerald-600 shrink-0" />
                              <div className="truncate">
                                <span className="font-semibold text-slate-700">
                                  {isManual ? 'WhatsApp Manual' : 'WhatsApp Automático'}
                                </span>
                                {comm.sent_by_name && (
                                  <span className="text-slate-500 ml-1">por {comm.sent_by_name}</span>
                                )}
                                <span className="text-slate-400 ml-1">• {dateFormatted}</span>
                              </div>
                            </div>
                            <span
                              className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                comm.delivery_status === 'delivered' || comm.status === 'sent'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : comm.delivery_status === 'manual_opened'
                                  ? 'bg-blue-100 text-blue-800'
                                  : comm.status === 'failed'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {comm.delivery_status === 'delivered'
                                ? 'Enviado'
                                : comm.delivery_status === 'manual_opened'
                                ? 'Aberto'
                                : comm.status === 'failed'
                                ? 'Falhou'
                                : 'Pendente'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Sub-view: Remarcar */
              <div className="space-y-4">
                <h4 className="font-bold text-slate-800 text-sm">Remarcar Atendimento</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Nova Data</label>
                    <input
                      type="date"
                      value={rescheduleDate}
                      onChange={e => setRescheduleDate(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Novo Horário</label>
                    <input
                      type="time"
                      value={rescheduleTime}
                      onChange={e => setRescheduleTime(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => setIsRescheduling(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={handleConfirmReschedule}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
                  >
                    Confirmar Remarcação
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Cancelamento Estruturado com Motivo Obrigatório (Item 10) */}
      {cancellingAppt && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-bold text-rose-600 uppercase">Cancelamento Obrigatório</span>
                <h3 className="text-base font-bold text-slate-900">Confirmar Cancelamento</h3>
              </div>
              <button
                onClick={() => setCancellingAppt(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              O cancelamento preservará o registro no histórico do paciente e na auditoria do sistema sem excluir os dados.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Categoria do Motivo *</label>
                <select
                  value={cancellationCategory}
                  onChange={e => setCancellationCategory(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-medium"
                >
                  <option value="Desistência do paciente">Desistência do paciente</option>
                  <option value="Imprevisto médico">Imprevisto médico</option>
                  <option value="Problema técnico">Problema técnico</option>
                  <option value="Erro de agendamento">Erro de agendamento</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Justificativa Detalhada (Opcional)</label>
                <textarea
                  rows={3}
                  value={cancellationReason}
                  onChange={e => setCancellationReason(e.target.value)}
                  placeholder="Informe detalhes adicionais sobre o cancelamento..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 text-xs">
              <button
                onClick={() => setCancellingAppt(null)}
                className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Voltar
              </button>
              <button
                onClick={() => handleUpdateStatus(cancellingAppt.id, 'cancelled', cancellationReason, cancellationCategory)}
                className="px-5 py-2 font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs"
              >
                Confirmar Cancelamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Seleção de Módulo Clínico (quando profissional possui múltiplas especialidades compatíveis) */}
      {selectingModuleAppt && (
        <SelectConsultationModuleModal
          isOpen={!!selectingModuleAppt}
          onClose={() => setSelectingModuleAppt(null)}
          modules={compatibleModules}
          patientName={selectingModuleAppt.patient_name}
          serviceName={selectingModuleAppt.service_name}
          onSelectModule={(moduleId) => executeStartConsultation(selectingModuleAppt, moduleId)}
        />
      )}

      {/* Modal de Atendimento Rápido */}
      {activeConsultationAppt && (
        <AppointmentConsultation
          appointment={{
            id: activeConsultationAppt.id,
            patient_id: activeConsultationAppt.patient_id,
            patient_name: activeConsultationAppt.patient_name,
            patient_phone: activeConsultationAppt.patient_phone,
            professional_id: activeConsultationAppt.professional_id,
            professional_name: activeConsultationAppt.professional_name,
            service_id: activeConsultationAppt.service_id,
            service_name: activeConsultationAppt.service_name,
            start_time: activeConsultationAppt.start_time,
            end_time: activeConsultationAppt.end_time,
            modality: activeConsultationAppt.modality,
            status: activeConsultationAppt.status,
            clinical_module: activeConsultationAppt.clinical_module || activeConsultationModule
          }}
          initialModuleType={activeConsultationModule || activeConsultationAppt.clinical_module}
          onClose={() => setActiveConsultationAppt(null)}
          onFinished={() => {
            setActiveConsultationAppt(null);
            fetchCalendarData();
          }}
        />
      )}

      {/* Modal de Finalização de Consulta (Item 5) */}
      {finishingAppt && (
        <FinishConsultationModal
          appointment={{
            id: finishingAppt.id,
            patient_id: finishingAppt.patient_id,
            patient_name: finishingAppt.patient_name,
            professional_id: finishingAppt.professional_id,
            professional_name: finishingAppt.professional_name,
            service_id: finishingAppt.service_id,
            service_name: finishingAppt.service_name,
            start_time: finishingAppt.start_time
          }}
          onClose={() => setFinishingAppt(null)}
          onFinished={() => {
            setFinishingAppt(null);
            fetchCalendarData();
          }}
        />
      )}

      {/* Modal de Envio Manual de Lembrete pelo WhatsApp */}
      {whatsappReminderAppt && (
        <WhatsAppReminderModal
          isOpen={Boolean(whatsappReminderAppt)}
          onClose={() => setWhatsappReminderAppt(null)}
          appointment={whatsappReminderAppt}
          clinicName={currentTenant?.name || 'Clínica'}
          onSuccess={() => {
            refreshCommunications(whatsappReminderAppt.id);
            fetchCalendarData();
          }}
        />
      )}
    </div>
  );
};
