import { bookingError } from '../../utils/booking-error';
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { Professional, Service, AvailableSlot } from '../../types';
import { X, Calendar, Clock, User, AlertCircle, Lock } from 'lucide-react';
import { isMeetingUrl } from '../../utils/teleconsultation';
import { QuickActionDropdown } from '../common/QuickActionDropdown';
import { NewServiceModal } from '../services/NewServiceModal';
import { NewInsuranceModal } from '../settings/NewInsuranceModal';
import { NewRoomModal } from '../services/NewRoomModal';

interface AppointmentEditModalProps {
  isOpen: boolean;
  appointment: any | null;
  onClose: () => void;
  onSuccess: () => void;
}

const extractDatePart = (iso?: string | null): string => {
  if (!iso) return '';
  return String(iso).trim().replace(' ', 'T').split('T')[0] || '';
};

const extractTimePart = (iso?: string | null): string => {
  if (!iso) return '';
  const clean = String(iso).trim().replace(' ', 'T');
  const parts = clean.split('T');
  return parts[1] ? parts[1].slice(0, 5) : '';
};

const computeStartAndEndIso = (dateStr: string, timeStr: string, durationMinutes: number) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const timeClean = (timeStr || '09:00').trim().slice(0, 5);
  const [hours, minutes] = timeClean.split(':').map(Number);
  const start = new Date(y, (m || 1) - 1, d || 1, hours || 0, minutes || 0, 0);
  const end = new Date(start.getTime() + (durationMinutes || 50) * 60 * 1000);

  const pad = (n: number) => String(n).padStart(2, '0');
  const startIso = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}:00`;
  const endIso = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}:00`;
  return { startIso, endIso };
};

export const AppointmentEditModal: React.FC<AppointmentEditModalProps> = ({
  isOpen,
  appointment,
  onClose,
  onSuccess
}) => {
  const { showToast } = useToast();
  const { clientTermLabel, isClinicAdmin, hasPermission } = useAuth();

  const canManageServices = isClinicAdmin || hasPermission('manage_services');
  const canManageRooms = isClinicAdmin || hasPermission('manage_services');
  const canManageInsurances = isClinicAdmin || hasPermission('manage_settings') || hasPermission('manage_services');

  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [insurances, setInsurances] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);

  const [fullAppt, setFullAppt] = useState<any | null>(null);
  const [professionalId, setProfessionalId] = useState<string>('');
  const [serviceId, setServiceId] = useState<string>('');
  const [insuranceId, setInsuranceId] = useState<string>('');
  const [roomId, setRoomId] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [isCustomTime, setIsCustomTime] = useState<boolean>(false);
  const [customTime, setCustomTime] = useState<string>('18:30');
  const [modality, setModality] = useState<'presential' | 'online'>('presential');
  const [meetingUrl, setMeetingUrl] = useState<string>('');
  const [isConfiguringTele, setIsConfiguringTele] = useState<boolean>(false);
  const [internalNotes, setInternalNotes] = useState<string>('');

  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorTitle, setErrorTitle] = useState('Revise os dados');
  const [conflictError, setConflictError] = useState<string | null>(null);

  const [isNewServiceModalOpen, setIsNewServiceModalOpen] = useState<boolean>(false);
  const [isNewInsuranceModalOpen, setIsNewInsuranceModalOpen] = useState<boolean>(false);
  const [isNewRoomModalOpen, setIsNewRoomModalOpen] = useState<boolean>(false);

  const currentStatus = fullAppt?.status || appointment?.status || 'scheduled';
  const isLockedStatus = currentStatus === 'completed' || currentStatus === 'cancelled';
  const isInProgress = currentStatus === 'in_progress';

  const origDate = useMemo(
    () => extractDatePart(fullAppt?.start_time || appointment?.start_time),
    [fullAppt?.start_time, appointment?.start_time]
  );
  const origTime = useMemo(
    () => extractTimePart(fullAppt?.start_time || appointment?.start_time),
    [fullAppt?.start_time, appointment?.start_time]
  );
  const origProfId = String(fullAppt?.professional_id || appointment?.professional_id || '');

  // Fecha com ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isNewServiceModalOpen && !isNewInsuranceModalOpen && !isNewRoomModalOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isNewServiceModalOpen, isNewInsuranceModalOpen, isNewRoomModalOpen, onClose]);

  // Inicializa os campos a partir do atendimento selecionado e carrega listas + detalhes completos
  useEffect(() => {
    if (!isOpen || !appointment) {
      setFullAppt(null);
      setConflictError(null);
      setIsCustomTime(false);
      setIsConfiguringTele(false);
      return;
    }

    const initDate = extractDatePart(appointment.start_time);
    const initTime = extractTimePart(appointment.start_time);

    setFullAppt(appointment);
    setProfessionalId(appointment.professional_id || '');
    setServiceId(appointment.service_id || '');
    setInsuranceId(appointment.insurance_id || '');
    setRoomId(appointment.room_id || '');
    setDate(initDate);
    setSelectedTime(initTime);
    setCustomTime(initTime || '18:30');
    setIsCustomTime(false);
    setModality(appointment.modality === 'online' ? 'online' : 'presential');
    setMeetingUrl(appointment.meeting_url || '');
    setIsConfiguringTele(false);
    setInternalNotes(appointment.internal_notes || '');
    setConflictError(null);

    let cancelled = false;

    Promise.all([
      ApiClient.get<Professional[]>('/v1/professionals').catch(() => []),
      ApiClient.get<Service[]>('/v1/services').catch(() => []),
      ApiClient.get<any[]>('/v1/insurances/clinic').catch(() => []),
      ApiClient.get<any[]>('/v1/rooms').catch(() => []),
      ApiClient.get<any>(`/v1/appointments/${appointment.id}`).catch(() => null)
    ]).then(([profs, srvs, ins, rms, detailRes]) => {
      if (cancelled) return;
      setProfessionals(Array.isArray(profs) ? profs : []);
      setServices(Array.isArray(srvs) ? srvs : []);
      setInsurances(Array.isArray(ins) ? ins : []);
      setRooms(Array.isArray(rms) ? rms : []);

      const detailed = detailRes?.appointment || detailRes;
      if (detailed && detailed.id) {
        setFullAppt(detailed);
        setProfessionalId(detailed.professional_id || appointment.professional_id || '');
        setServiceId(detailed.service_id || appointment.service_id || '');
        setInsuranceId(detailed.insurance_id || '');
        setRoomId(detailed.room_id || '');
        setDate(extractDatePart(detailed.start_time) || initDate);
        setSelectedTime(extractTimePart(detailed.start_time) || initTime);
        setCustomTime(extractTimePart(detailed.start_time) || initTime || '18:30');
        setModality(detailed.modality === 'online' ? 'online' : 'presential');
        setMeetingUrl(detailed.meeting_url || '');
        setInternalNotes(detailed.internal_notes || '');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, appointment?.id]);

  // Filtra serviços pelo profissional selecionado
  const filteredServices = useMemo(() => {
    if (!professionalId) return services;
    const match = services.filter(s => s.professional_id === professionalId);
    if (match.length > 0) return match;
    const unassigned = services.filter(s => !s.professional_id);
    return unassigned.length > 0 ? unassigned : services;
  }, [services, professionalId]);

  // Se o profissional mudar e o serviço atual não pertencer a ele, seleciona o primeiro serviço compatível
  useEffect(() => {
    if (!isOpen || filteredServices.length === 0) return;
    if (serviceId && !filteredServices.some(s => s.id === serviceId)) {
      setServiceId(filteredServices[0].id);
    }
  }, [isOpen, filteredServices, professionalId]);

  // Busca horários disponíveis quando profissional, serviço, data ou sala mudam
  const fetchSlots = (profId: string, srvId: string, targetDate: string, targetRoomId: string) => {
    if (!profId || !srvId || !targetDate || isInProgress || isLockedStatus) {
      setAvailableSlots([]);
      return;
    }
    setLoadingSlots(true);
    const roomParam = targetRoomId ? `&roomId=${encodeURIComponent(targetRoomId)}` : '';
    ApiClient.get<any>(`/v1/slots/available?professionalId=${profId}&serviceId=${srvId}&date=${targetDate}${roomParam}`)
      .then(data => {
        const slots: AvailableSlot[] = Array.isArray(data?.slots) ? data.slots : [];
        setAvailableSlots(slots);

        const isSameDateAndProf = targetDate === origDate && profId === origProfId;
        if (isSameDateAndProf && origTime) {
          setSelectedTime(prev => prev || origTime);
        } else {
          setSelectedTime(prev => {
            if (prev && slots.some(s => s.time === prev)) return prev;
            return '';
          });
        }
      })
      .catch(() => {
        setAvailableSlots([]);
      })
      .finally(() => setLoadingSlots(false));
  };

  useEffect(() => {
    if (!isOpen || !professionalId || !serviceId || !date) return;
    setConflictError(null);
    fetchSlots(professionalId, serviceId, date, roomId);
  }, [isOpen, professionalId, serviceId, date, roomId, isInProgress, isLockedStatus]);

  // Lista combinada de horários: inclui o horário atual do próprio agendamento se estiver na mesma data e profissional
  const displaySlots = useMemo(() => {
    const map = new Map<string, { time: string; isCurrent: boolean }>();
    const isSameDateAndProf = date === origDate && professionalId === origProfId;

    if (isSameDateAndProf && origTime) {
      map.set(origTime, { time: origTime, isCurrent: true });
    }

    for (const s of availableSlots) {
      const t = (s.time || '').slice(0, 5);
      if (!t) continue;
      if (!map.has(t)) {
        map.set(t, { time: t, isCurrent: false });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.time.localeCompare(b.time));
  }, [availableSlots, date, origDate, origTime, professionalId, origProfId]);

  const handleServiceCreated = async (created: any) => {
    setIsNewServiceModalOpen(false);
    try {
      const srvs = await ApiClient.get<Service[]>('/v1/services');
      setServices(srvs || []);
      if (created?.id) setServiceId(created.id);
    } catch (_) {}
  };

  const handleInsuranceCreated = async (created: any) => {
    setIsNewInsuranceModalOpen(false);
    try {
      const insList = await ApiClient.get<any[]>('/v1/insurances/clinic');
      setInsurances(insList || []);
      if (created?.id) setInsuranceId(created.id);
    } catch (_) {}
  };

  const handleRoomCreated = async (created: any) => {
    setIsNewRoomModalOpen(false);
    try {
      const rmsList = await ApiClient.get<any[]>('/v1/rooms');
      setRooms(rmsList || []);
      if (created?.id) setRoomId(created.id);
    } catch (_) {}
  };

  if (!isOpen || !appointment) return null;

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'confirmed':
        return { label: 'Confirmado', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'in_progress':
        return { label: 'Em atendimento', cls: 'bg-teal-50 text-teal-700 border-teal-200' };
      case 'rescheduled':
        return { label: 'Reagendado', cls: 'bg-sky-50 text-sky-700 border-sky-200' };
      case 'completed':
        return { label: 'Concluído', cls: 'bg-slate-100 text-slate-700 border-slate-200' };
      case 'no_show':
        return { label: 'Faltou', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'cancelled':
        return { label: 'Cancelado', cls: 'bg-rose-50 text-rose-700 border-rose-200' };
      default:
        return { label: 'Agendado', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
    }
  };

  const statusBadge = getStatusLabel(currentStatus);

  const handleSave = async () => {
    if (isLockedStatus) return;

    if (!professionalId || !serviceId) {
      showToast('Profissional e serviço são obrigatórios.', 'error');
      return;
    }

    const effectiveTime = isInProgress ? origTime : (isCustomTime ? customTime : selectedTime);
    const effectiveDate = isInProgress ? origDate : date;

    if (!effectiveDate || !effectiveTime) {
      showToast('Selecione a data e o horário do atendimento.', 'error');
      return;
    }

    if (modality === 'online' && meetingUrl.trim() && !isMeetingUrl(meetingUrl)) {
      showToast('Informe um link HTTPS válido para a teleconsulta.', 'error');
      return;
    }

    const selectedServiceObj = services.find(s => s.id === serviceId);
    const durationMin =
      selectedServiceObj?.duration_minutes ||
      (selectedServiceObj as any)?.duration ||
      fullAppt?.duration_minutes ||
      appointment?.duration_minutes ||
      50;

    let startIso = String(fullAppt?.start_time || appointment.start_time || '').trim().replace(' ', 'T');
    let endIso = String(fullAppt?.end_time || appointment.end_time || '').trim().replace(' ', 'T');

    if (!isInProgress) {
      const computed = computeStartAndEndIso(effectiveDate, effectiveTime, Number(durationMin) || 50);
      startIso = computed.startIso;
      endIso = computed.endIso;
    }

    try {
      setSaving(true);
      setConflictError(null);

      const res = await ApiClient.put<any>(`/v1/appointments/${appointment.id}`, {
        professionalId,
        serviceId,
        insuranceId: insuranceId || null,
        roomId: roomId || null,
        startTime: startIso,
        endTime: endIso,
        modality,
        meeting_url: modality === 'online' ? (meetingUrl.trim() || null) : null,
        internalNotes: internalNotes.trim() || null,
        isCustomTime: isCustomTime ? true : undefined,
        reason: 'Editado / remarcado pelo Painel'
      });

      showToast(res?.message || 'Atendimento atualizado com sucesso!', 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      const feedback = bookingError(err);
      setErrorTitle(feedback.title);
      setConflictError(feedback.message);
      showToast(feedback.message, 'error');

      if (!isInProgress && professionalId && serviceId && date) {
        fetchSlots(professionalId, serviceId, date, roomId);
      }
    } finally {
      setSaving(false);
    }
  };

  const canSubmit =
    !isLockedStatus &&
    !saving &&
    Boolean(professionalId) &&
    Boolean(serviceId) &&
    (isInProgress || (Boolean(date) && Boolean(isCustomTime ? customTime : selectedTime)));

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto mobile-modal"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-appointment-modal-title"
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl sm:rounded-3xl max-w-[660px] w-full p-4 sm:p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto overflow-x-hidden my-auto"
      >
        {/* Cabeçalho Clean */}
        <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-slate-100 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 id="edit-appointment-modal-title" className="text-base sm:text-lg font-bold text-slate-900">
                Editar / Remarcar atendimento
              </h3>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusBadge.cls}`}>
                {statusBadge.label}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 truncate">
              <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="font-medium text-slate-700 truncate">
                {fullAppt?.patient_name || appointment.patient_name || clientTermLabel}
              </span>
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3.5 text-xs">
          {/* Avisos de compatibilidade de status */}
          {isLockedStatus && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 flex items-start gap-2">
              <Lock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <span>
                Este atendimento está <strong>{statusBadge.label.toLowerCase()}</strong> e não permite alterações cadastrais ou remarcação.
              </span>
            </div>
          )}

          {isInProgress && (
            <div className="p-3 bg-teal-50/70 border border-teal-200/80 rounded-xl text-teal-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
              <span>
                <strong>Atendimento em andamento:</strong> Profissional, serviço, data e horário agendado estão bloqueados. Você ainda pode ajustar sala, convênio, modalidade e observações internas.
              </span>
            </div>
          )}

          {/* Linha 1: Profissional e Serviço */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative z-30">
            <div className="min-w-0">
              <label className="block font-semibold text-slate-700 mb-1">Profissional *</label>
              <select
                value={professionalId}
                disabled={isInProgress || isLockedStatus}
                onChange={e => setProfessionalId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 text-slate-800 disabled:opacity-60 disabled:cursor-not-allowed truncate focus:outline-hidden focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
              >
                {professionals.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-0">
              <label className="block font-semibold text-slate-700 mb-1">Serviço *</label>
              {isInProgress || isLockedStatus ? (
                <input
                  type="text"
                  disabled
                  value={
                    services.find(s => s.id === serviceId)?.name ||
                    fullAppt?.service_name ||
                    appointment.service_name ||
                    'Serviço selecionado'
                  }
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 text-slate-600 opacity-60 cursor-not-allowed truncate"
                />
              ) : (
                <QuickActionDropdown
                  value={serviceId}
                  onChange={val => setServiceId(val)}
                  options={filteredServices.map(s => ({
                    value: s.id,
                    label: s.name,
                    sublabel: s.duration_minutes ? `${s.duration_minutes} min` : undefined
                  }))}
                  placeholder={filteredServices.length === 0 ? 'Nenhum serviço disponível' : 'Selecione um serviço...'}
                  emptyMessage="Nenhum serviço disponível para este profissional"
                  actionLabel="+ Adicionar novo serviço"
                  onAction={() => setIsNewServiceModalOpen(true)}
                  showAction={canManageServices}
                />
              )}
            </div>
          </div>

          {/* Linha 2: Convênio e Sala */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative z-20">
            <div className="min-w-0">
              <label className="block font-semibold text-slate-700 mb-1">Convênio</label>
              {isLockedStatus ? (
                <input
                  type="text"
                  disabled
                  value={insurances.find(i => i.id === insuranceId)?.name || 'Particular (Sem Convênio)'}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 text-slate-600 opacity-60 cursor-not-allowed truncate"
                />
              ) : (
                <QuickActionDropdown
                  value={insuranceId}
                  onChange={val => setInsuranceId(val)}
                  options={[
                    { value: '', label: 'Particular (Sem Convênio)' },
                    ...insurances.map(ins => ({
                      value: ins.id,
                      label: ins.name,
                      sublabel: ins.ans_code ? `ANS: ${ins.ans_code}` : undefined
                    }))
                  ]}
                  placeholder="Particular (Sem Convênio)"
                  emptyMessage="Nenhum convênio cadastrado"
                  actionLabel="+ Adicionar novo convênio"
                  onAction={() => setIsNewInsuranceModalOpen(true)}
                  showAction={canManageInsurances}
                />
              )}
            </div>

            <div className="min-w-0">
              <label className="block font-semibold text-slate-700 mb-1">Sala de Atendimento</label>
              {isLockedStatus ? (
                <input
                  type="text"
                  disabled
                  value={rooms.find(r => r.id === roomId)?.name || 'Nenhuma / Sem sala fixa'}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 text-slate-600 opacity-60 cursor-not-allowed truncate"
                />
              ) : (
                <QuickActionDropdown
                  value={roomId}
                  onChange={val => setRoomId(val)}
                  options={[
                    { value: '', label: 'Nenhuma / Sem sala fixa' },
                    ...rooms.map(r => ({
                      value: r.id,
                      label: r.name,
                      sublabel: r.description || undefined
                    }))
                  ]}
                  placeholder="Nenhuma / Sem sala fixa"
                  emptyMessage="Nenhuma sala cadastrada"
                  actionLabel="+ Adicionar nova sala"
                  onAction={() => setIsNewRoomModalOpen(true)}
                  showAction={canManageRooms}
                />
              )}
            </div>
          </div>

          {/* Linha 3: Data e Modalidade */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Data *</label>
              <input
                type="date"
                value={date}
                disabled={isInProgress || isLockedStatus}
                onChange={e => {
                  setDate(e.target.value);
                  setSelectedTime('');
                }}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 text-slate-800 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-hidden focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Modalidade</label>
              <select
                value={modality}
                disabled={isLockedStatus}
                onChange={e => {
                  const next = e.target.value as 'presential' | 'online';
                  setModality(next);
                  if (next !== 'online') setIsConfiguringTele(false);
                }}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 text-slate-800 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-hidden focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
              >
                <option value="presential">Presencial</option>
                <option value="online">Online</option>
              </select>
            </div>
          </div>

          {/* Configuração de Teleconsulta quando Online */}
          {modality === 'online' && !isLockedStatus && (
            <div>
              {isConfiguringTele ? (
                <div className="p-3 bg-slate-50 rounded-xl space-y-2 border border-slate-200">
                  <label className="block text-[11px] font-semibold text-slate-700">
                    Link da Teleconsulta (Google Meet / HTTPS)
                    <input
                      aria-label="Link da Teleconsulta"
                      type="url"
                      value={meetingUrl}
                      onChange={e => setMeetingUrl(e.target.value)}
                      placeholder="https://meet.google.com/xxx-xxxx-xxx"
                      className="w-full border border-slate-200 bg-white rounded-xl px-3 py-1.5 mt-1 text-xs"
                    />
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (meetingUrl.trim() && !isMeetingUrl(meetingUrl)) {
                          showToast('Informe um link HTTPS válido para a teleconsulta.', 'error');
                          return;
                        }
                        setIsConfiguringTele(false);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Concluir configuração
                    </button>
                  </div>
                </div>
              ) : meetingUrl.trim() ? (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs">
                  <span className="font-semibold text-emerald-800 truncate mr-2">✓ Teleconsulta configurada ({meetingUrl})</span>
                  <button
                    type="button"
                    onClick={() => setIsConfiguringTele(true)}
                    className="font-semibold text-teal-700 hover:text-teal-900 cursor-pointer shrink-0"
                  >
                    Editar link
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsConfiguringTele(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <span aria-hidden="true">📹</span>
                  <span>Configurar link da teleconsulta</span>
                </button>
              )}
            </div>
          )}

          {/* Banner de conflito */}
          {conflictError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-rose-800 mr-1">{errorTitle}:</span>
                <span>{conflictError}</span>
              </div>
            </div>
          )}

          {/* Seleção de Horário / Horário Avulso */}
          {isInProgress || isLockedStatus ? (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Horário agendado</label>
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 font-semibold text-xs">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>{origTime || '--:--'}</span>
              </div>
            </div>
          ) : isCustomTime ? (
            <div className="p-3 bg-amber-50/60 border border-amber-200/90 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="font-bold text-amber-900 text-xs">Horário Avulso</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomTime(false);
                    if (!selectedTime && origDate === date && origProfId === professionalId) {
                      setSelectedTime(origTime);
                    }
                  }}
                  className="text-[11px] font-medium text-slate-600 hover:text-slate-900 underline cursor-pointer"
                >
                  Voltar aos horários disponíveis
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-0.5 text-[11px]">Data do atendimento *</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-0.5 text-[11px]">Horário do atendimento *</label>
                  <input
                    type="time"
                    value={customTime}
                    onChange={e => setCustomTime(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs bg-white"
                    required
                  />
                </div>
              </div>

              <p className="text-[11px] text-slate-500">
                Permite remarcar em um horário pontual fora da grade habitual, mantendo a verificação de conflitos de profissional, paciente e sala.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="block font-semibold text-slate-700">
                  Horários Disponíveis *
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomTime(true);
                    if (selectedTime) setCustomTime(selectedTime);
                    else if (origTime) setCustomTime(origTime);
                  }}
                  className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 underline underline-offset-2 cursor-pointer"
                >
                  + Agendar em horário avulso
                </button>
              </div>

              {loadingSlots ? (
                <div className="py-3 px-3 bg-slate-50 rounded-xl border border-slate-200/80 text-slate-400 text-xs">
                  Carregando horários disponíveis do profissional...
                </div>
              ) : displaySlots.length === 0 ? (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
                  <p className="text-xs text-amber-800 font-medium">
                    Nenhum horário livre na grade para esta data e profissional (fora do expediente, folga ou agenda cheia).
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomTime(true);
                      if (origTime) setCustomTime(origTime);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 bg-white hover:bg-teal-50 border border-teal-200 rounded-xl transition-colors cursor-pointer"
                  >
                    + Agendar em horário avulso
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 max-h-36 overflow-y-auto p-1.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
                  {displaySlots.map(slot => {
                    const isSelected = selectedTime === slot.time;
                    return (
                      <button
                        key={slot.time}
                        type="button"
                        onClick={() => setSelectedTime(slot.time)}
                        className={`py-1.5 px-2 rounded-lg text-center font-semibold text-xs transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-teal-600 text-white shadow-2xs'
                            : 'bg-white border border-slate-200 text-slate-700 hover:border-teal-400 hover:bg-teal-50/40'
                        }`}
                      >
                        <span>{slot.time}</span>
                        {slot.isCurrent && (
                          <span className={`block text-[9px] font-medium leading-tight ${isSelected ? 'text-teal-100' : 'text-slate-400'}`}>
                            atual
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Observações Internas */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Observações Internas</label>
            <input
              type="text"
              value={internalNotes}
              disabled={isLockedStatus}
              onChange={e => setInternalNotes(e.target.value)}
              placeholder="Ex: Primeira consulta, observações para a recepção ou profissional"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white text-slate-800 disabled:bg-slate-50 disabled:opacity-60 focus:outline-hidden focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
            />
          </div>

          {/* Rodapé */}
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3.5 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer text-xs"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSubmit}
              className="w-full sm:w-auto px-5 py-2 font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer text-xs"
            >
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </div>

        {/* Modais auxiliares de criação rápida */}
        <NewServiceModal
          isOpen={isNewServiceModalOpen}
          initialProfessionalId={professionalId}
          professionals={professionals}
          zIndex="z-[10000]"
          onClose={() => setIsNewServiceModalOpen(false)}
          onSuccess={handleServiceCreated}
        />

        <NewInsuranceModal
          isOpen={isNewInsuranceModalOpen}
          zIndex="z-[10000]"
          onClose={() => setIsNewInsuranceModalOpen(false)}
          onSuccess={handleInsuranceCreated}
        />

        <NewRoomModal
          isOpen={isNewRoomModalOpen}
          zIndex="z-[10000]"
          onClose={() => setIsNewRoomModalOpen(false)}
          onSuccess={handleRoomCreated}
        />
      </div>
    </div>,
    document.body
  );
};
