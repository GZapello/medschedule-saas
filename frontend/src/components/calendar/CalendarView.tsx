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
  RotateCcw
} from 'lucide-react';

interface CalendarViewProps {
  onOpenNewAppointment: () => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ onOpenNewAppointment }) => {
  const { currentTenant, clientTermLabel } = useAuth();
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

  // Navegação temporal
  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === 'day') d.setDate(d.getDate() - 1);
    else if (viewMode === 'week') d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (viewMode === 'day') d.setDate(d.getDate() + 1);
    else if (viewMode === 'week') d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    setCurrentDate(d);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleUpdateStatus = async (apptId: string, status: string) => {
    try {
      await ApiClient.put(`/v1/appointments/${apptId}/status`, { status });
      showToast(`Status atualizado para ${status}`, 'success');
      setSelectedAppt(null);
      fetchCalendarData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar status', 'error');
    }
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

  // Cálculo dos dias da semana para a visualização semanal
  const getWeekDays = (baseDate: Date) => {
    const start = new Date(baseDate);
    const day = start.getDay();
    start.setDate(start.getDate() - day + (day === 0 ? -6 : 1)); // Inicia na Segunda-feira
    const days: Date[] = [];
    for (let i = 0; i < 6; i++) { // Seg a Sáb
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
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
            onClick={onOpenNewAppointment}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all"
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
                    const dayStr = dayDate.toISOString().split('T')[0];
                    const slotStartPrefix = `${dayStr}T${timeSlot}`;

                    // Filtra agendamentos nesta data e hora
                    const slotAppts = filteredAppointments.filter(a => {
                      return a.start_time.startsWith(slotStartPrefix.slice(0, 13)); // Match no início da hora
                    });

                    return (
                      <div
                        key={dayIdx}
                        className="border-r border-slate-100 last:border-r-0 p-1 relative hover:bg-slate-50/50 transition-colors"
                      >
                        {slotAppts.map(appt => (
                          <div
                            key={appt.id}
                            onClick={() => setSelectedAppt(appt)}
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
          <h3 className="font-bold text-slate-900 text-lg mb-4">
            Atendimentos para {currentDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
          <div className="space-y-2">
            {filteredAppointments
              .filter(a => a.start_time.startsWith(currentDate.toISOString().split('T')[0]))
              .map(appt => (
                <div
                  key={appt.id}
                  onClick={() => setSelectedAppt(appt)}
                  className="p-4 rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-xs cursor-pointer flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-center font-bold text-indigo-700 bg-indigo-50 px-3 py-2 rounded-lg">
                      {appt.start_time.split('T')[1].slice(0, 5)}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900">{appt.patient_name}</h4>
                      <p className="text-xs text-slate-500">{appt.service_name} • Profissional: {appt.professional_name}</p>
                    </div>
                  </div>
                  <div className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getStatusColor(appt.status)}`}>
                    {appt.status}
                  </div>
                </div>
              ))}
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
                </div>

                {selectedAppt.patient_notes && (
                  <div className="text-xs bg-amber-50 text-amber-900 p-3 rounded-xl border border-amber-200">
                    <span className="font-bold">Observações do cliente:</span> {selectedAppt.patient_notes}
                  </div>
                )}

                {/* Status action buttons */}
                <div className="pt-2 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Alterar Status</h4>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleUpdateStatus(selectedAppt.id, 'confirmed')}
                      className="px-3 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg"
                    >
                      Confirmar
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(selectedAppt.id, 'in_progress')}
                      className="px-3 py-1.5 text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg"
                    >
                      Iniciar
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(selectedAppt.id, 'completed')}
                      className="px-3 py-1.5 text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 rounded-lg"
                    >
                      Concluir
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(selectedAppt.id, 'no_show')}
                      className="px-3 py-1.5 text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg"
                    >
                      Marcar Falta
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(selectedAppt.id, 'cancelled')}
                      className="px-3 py-1.5 text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg"
                    >
                      Cancelar
                    </button>
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
    </div>
  );
};
