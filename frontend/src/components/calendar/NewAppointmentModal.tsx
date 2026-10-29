import { bookingError } from '../../utils/booking-error';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { Professional, Service, Patient, AvailableSlot } from '../../types';
import { X, Calendar, Clock, User, Plus, CheckCircle2 } from 'lucide-react';
import { isMeetingUrl } from '../../utils/teleconsultation';
import { PatientSearchSelect } from '../common/PatientSearchSelect';
import { QuickActionDropdown } from '../common/QuickActionDropdown';
import { NewPatientModal } from '../patients/NewPatientModal';
import { NewServiceModal } from '../services/NewServiceModal';
import { NewInsuranceModal } from '../settings/NewInsuranceModal';
import { NewRoomModal } from '../services/NewRoomModal';

export function parseAppointmentPrice(input: string): number | null {
  const text = input.trim();
  if (!/^(?:\d+(?:[.,]\d{1,2})?|\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?)$/.test(text)) return null;
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(?:\.\d{3})+$/.test(text) ? text.replace(/\./g, '') : text;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100)) ? Math.round(value * 100) / 100 : null;
}

const formatAppointmentPrice = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

interface NewAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data?: any) => void;
  initialPrefill?: { date?: string; time?: string; professionalId?: string };
}

export const NewAppointmentModal: React.FC<NewAppointmentModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialPrefill
}) => {
  const { showToast } = useToast();
  const { clientTermLabel, isProfessional, currentUser, isClinicAdmin, hasPermission } = useAuth();
  const canManageServices = isClinicAdmin || hasPermission('manage_services');
  const canManageRooms = isClinicAdmin || hasPermission('manage_services');
  const canManageInsurances = isClinicAdmin || hasPermission('manage_settings') || hasPermission('manage_services');

  const [isCustomTime, setIsCustomTime] = useState<boolean>(false);
  const [customTime, setCustomTime] = useState<string>('18:30');
  const [isRetroactive, setIsRetroactive] = useState<boolean>(false);
  const [retroStartTime, setRetroStartTime] = useState<string>('14:00');
  const [retroEndTime, setRetroEndTime] = useState<string>('14:50');

  const computeEndTimeStr = (startStr: string, durationMin: number): string => {
    const clean = (startStr || '14:00').trim().slice(0, 5);
    const [hh, mm] = clean.split(':').map(Number);
    const total = (((hh || 0) * 60 + (mm || 0) + (Number(durationMin) || 50)) % (24 * 60) + 24 * 60) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };

  const [isNewServiceModalOpen, setIsNewServiceModalOpen] = useState(false);
  const [isNewInsuranceModalOpen, setIsNewInsuranceModalOpen] = useState(false);
  const [isNewRoomModalOpen, setIsNewRoomModalOpen] = useState(false);

  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [insurances, setInsurances] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);

  const [patientId, setPatientId] = useState<string>('');
  const [selectedPatientObj, setSelectedPatientObj] = useState<any>(null);
  const [isNewPatientModalOpen, setIsNewPatientModalOpen] = useState(false);
  const [newPatientSearchQuery, setNewPatientSearchQuery] = useState('');
  const [professionalId, setProfessionalId] = useState<string>('');
  const [serviceId, setServiceId] = useState<string>('');
  const [appointmentPrice, setAppointmentPrice] = useState('');
  const priceServiceId = useRef<string | null>(null);
  const priceEdited = useRef(false);
  const [insuranceId, setInsuranceId] = useState<string>('');
  const [roomId, setRoomId] = useState<string>('');
  const submissionPending = useRef(false);
  const [errorTitle, setErrorTitle] = useState('Não foi possível concluir');
  const slotRequest = useRef(0);
  const [conflictError, setConflictError] = useState<string | null>(null);

  const [date, setDate] = useState<string>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [modality, setModality] = useState<'presential' | 'online'>('presential');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [isConfiguringTele, setIsConfiguringTele] = useState(false);
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);

  useEffect(() => {
    priceServiceId.current = null;
    priceEdited.current = false;
    setAppointmentPrice('');
    if (isOpen) {
      setMeetingUrl('');
      setIsConfiguringTele(false);
      setSelectedSlot(null);
      setIsCustomTime(false);
      setIsRetroactive(false);
      setCustomTime(initialPrefill?.time || '18:30');
    } else {
      setPatientId('');
      setSelectedPatientObj(null);
      setIsNewPatientModalOpen(false);
      setNewPatientSearchQuery('');
      setIsConfiguringTele(false);
      setIsCustomTime(false);
      setIsRetroactive(false);
      setCustomTime('18:30');
      setIsNewServiceModalOpen(false);
      setIsNewInsuranceModalOpen(false);
      setIsNewRoomModalOpen(false);
    }
  }, [isOpen]);

  const isQueryPhone = useMemo(() => {
    const clean = newPatientSearchQuery.replace(/\D/g, '');
    return clean.length >= 8 && /^[\d\s\(\)\-\.]+$/.test(newPatientSearchQuery);
  }, [newPatientSearchQuery]);

  const prefillName = isQueryPhone ? '' : newPatientSearchQuery;
  const prefillPhone = isQueryPhone ? newPatientSearchQuery : '';

  const handleOpenCreatePatient = (query?: string) => {
    setNewPatientSearchQuery(query || '');
    setIsNewPatientModalOpen(true);
  };

  const handleServiceCreated = async (created: any) => {
    setIsNewServiceModalOpen(false);
    try {
      const srvs = await ApiClient.get<Service[]>('/v1/services');
      setServices(srvs || []);
      if (created?.id) {
        setServiceId(created.id);
      }
    } catch (e) {
      console.warn('Erro ao atualizar serviços:', e);
    }
  };

  const handleInsuranceCreated = async (created: any) => {
    setIsNewInsuranceModalOpen(false);
    try {
      const insList = await ApiClient.get<any[]>('/v1/insurances/clinic');
      setInsurances(insList || []);
      if (created?.id) {
        setInsuranceId(created.id);
      }
    } catch (e) {
      console.warn('Erro ao atualizar convênios:', e);
    }
  };

  const handleRoomCreated = async (created: any) => {
    setIsNewRoomModalOpen(false);
    try {
      const rmsList = await ApiClient.get<any[]>('/v1/rooms');
      setRooms(rmsList || []);
      if (created?.id) {
        setRoomId(created.id);
      }
    } catch (e) {
      console.warn('Erro ao atualizar salas:', e);
    }
  };

  // Filtra serviços pelo profissional selecionado
  const filteredServices = useMemo(() => {
    if (!professionalId) return services;
    const match = services.filter(s => s.professional_id === professionalId);
    if (match.length > 0) return match;
    const unassigned = services.filter(s => !s.professional_id);
    return unassigned.length > 0 ? unassigned : services;
  }, [services, professionalId]);

  // Ao alterar de profissional ou serviços disponíveis, atualiza serviceId
  useEffect(() => {
    if (filteredServices.length > 0) {
      if (!filteredServices.some(s => s.id === serviceId)) {
        setServiceId(filteredServices[0].id);
      }
    } else {
      setServiceId('');
    }
  }, [filteredServices, professionalId]);

  useEffect(() => {
    if (isOpen) {
      setConflictError(null);
      if (initialPrefill?.date) {
        setDate(initialPrefill.date);
      }
      Promise.all([
        ApiClient.get<Professional[]>('/v1/professionals'),
        ApiClient.get<Service[]>('/v1/services'),
        ApiClient.get<any[]>('/v1/insurances/clinic'),
        ApiClient.get<any[]>('/v1/rooms')
      ]).then(([profs, srvs, ins, rms]) => {
        setProfessionals(profs);
        setServices(srvs);
        setInsurances(ins || []);
        setRooms(rms || []);
        const userProfId = isProfessional && currentUser?.professionalId ? currentUser.professionalId : '';
        const targetProfId = (initialPrefill?.professionalId && profs.some(p => p.id === initialPrefill.professionalId))
          ? initialPrefill.professionalId
          : (userProfId && profs.some(p => p.id === userProfId)
            ? userProfId
            : (profs.length > 0 ? profs[0].id : ''));
        setProfessionalId(targetProfId);
        const matchingSrvs = targetProfId ? srvs.filter(s => s.professional_id === targetProfId) : srvs;
        if (matchingSrvs.length > 0) {
          setServiceId(matchingSrvs[0].id);
        } else if (srvs.length > 0) {
          setServiceId(srvs[0].id);
        }
      }).catch((error) => { const feedback = bookingError(error); setErrorTitle(feedback.title); setConflictError(feedback.message); });
    }
  }, [isOpen, initialPrefill]);

  useEffect(() => {
    if (!isOpen) return;
    const selectedService = services.find(service => service.id === serviceId);
    if (priceServiceId.current !== serviceId) priceEdited.current = false;
    if (priceEdited.current) return;
    priceServiceId.current = serviceId;
    setAppointmentPrice(selectedService ? formatAppointmentPrice(Number(selectedService.price)) : '');
    if (selectedService) {
      const dur = selectedService.duration_minutes || (selectedService as any).duration || 50;
      setRetroEndTime(prevEnd => computeEndTimeStr(retroStartTime, dur) || prevEnd);
    }
  }, [isOpen, serviceId, services]);

  // Consulta slots livres imediatamente ao alterar profissional, serviço, data ou sala
  useEffect(() => {
    const request = ++slotRequest.current;
    if (isOpen && professionalId && serviceId && date) {
      setAvailableSlots([]);
      setSelectedSlot(null);
      setLoadingSlots(true);
      setConflictError(null);

      const roomParam = (roomId ? `&roomId=${encodeURIComponent(roomId)}` : '') + (patientId ? `&patientId=${encodeURIComponent(patientId)}` : '');
      ApiClient.get<any>(`/v1/slots/available?professionalId=${professionalId}&serviceId=${serviceId}&date=${date}${roomParam}`)
        .then(data => {
          if (request !== slotRequest.current) return;
          const slots: AvailableSlot[] = data.slots || [];
          setAvailableSlots(slots);
          if (initialPrefill?.time) {
            const prefillTime = initialPrefill.time;
            const match = slots.find(s => s.time === prefillTime || s.time.startsWith(prefillTime));
            if (match) {
              setSelectedSlot(match);
            } else {
              setSelectedSlot(null);
            }
          }
        })
        .catch(error => {
          if (request !== slotRequest.current) return;
          const feedback = bookingError(error); setErrorTitle(feedback.title); setConflictError(feedback.message);
          setAvailableSlots([]);
          setSelectedSlot(null);
        })
        .finally(() => { if (request === slotRequest.current) setLoadingSlots(false); });
    } else {
      setLoadingSlots(false);
      setAvailableSlots([]);
      setSelectedSlot(null);
    }
    return () => { ++slotRequest.current; };
  }, [isOpen, professionalId, serviceId, date, roomId, patientId, initialPrefill]);

  if (!isOpen) return null;

  const computeStartAndEnd = (dateStr: string, timeStr: string, durationMinutes: number) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const timeClean = (timeStr || '18:30').trim().slice(0, 5);
    const [hours, minutes] = timeClean.split(':').map(Number);
    const start = new Date(y, (m || 1) - 1, d || 1, hours || 0, minutes || 0, 0);
    const end = new Date(start.getTime() + (durationMinutes || 30) * 60 * 1000);

    const pad = (n: number) => String(n).padStart(2, '0');
    const startStr = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}:00`;
    const endStr = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}:00`;
    return { startStr, endStr };
  };

  const handleBook = async () => {
    if (submissionPending.current || loadingSlots) return;
    if (!patientId || !professionalId || !serviceId) {
      showToast('Preencha todos os campos obrigatórios', 'error');
      return;
    }

    const normalizedPrice = parseAppointmentPrice(appointmentPrice);
    if (normalizedPrice === null) {
      showToast('Informe um valor da consulta válido, com até duas casas decimais e maior ou igual a zero.', 'error');
      return;
    }

    if (isRetroactive) {
      if (!date || !retroStartTime || !retroEndTime) {
        showToast('Informe a data, o horário de início e o horário de término do atendimento realizado', 'error');
        return;
      }
    } else if (!isCustomTime && !selectedSlot) {
      showToast('Selecione um horário disponível ou agende em horário avulso', 'error');
      return;
    }

    if (isCustomTime && (!date || !customTime)) {
      showToast('Informe a data e o horário do atendimento avulso', 'error');
      return;
    }

    if (modality === 'online' && meetingUrl.trim() && !isMeetingUrl(meetingUrl)) {
      showToast('Informe um link HTTPS válido para a teleconsulta.', 'error');
      return;
    }

    let startIso = '';
    let endIso = '';

    if (isRetroactive) {
      const startClean = retroStartTime.trim().slice(0, 5);
      const endClean = retroEndTime.trim().slice(0, 5);
      startIso = `${date}T${startClean}:00`;
      endIso = `${date}T${endClean}:00`;
    } else if (isCustomTime) {
      const selectedService = services.find(s => s.id === serviceId);
      const duration = selectedService?.duration_minutes || (selectedService as any)?.duration || 30;
      const { startStr, endStr } = computeStartAndEnd(date, customTime, duration);
      startIso = startStr;
      endIso = endStr;
    } else {
      startIso = selectedSlot!.startTime;
      endIso = selectedSlot!.endTime;
    }

    try {
      submissionPending.current = true;
      setLoading(true);
      setConflictError(null);
      const createdAppt = await ApiClient.post('/v1/appointments', {
        patientId,
        professionalId,
        serviceId,
        appointmentPrice: normalizedPrice,
        roomId: roomId || null,
        insuranceId: insuranceId || null,
        startTime: startIso,
        endTime: endIso,
        modality,
        meeting_url: modality === 'online' ? meetingUrl.trim() || null : null,
        internalNotes: notes || null,
        isCustomTime: isCustomTime ? true : undefined,
        isRetroactive: isRetroactive ? true : undefined
      });

      if (isRetroactive) {
        try {
          sessionStorage.setItem('zemda_open_retroactive_appt', JSON.stringify(createdAppt));
        } catch (_) {}
        showToast('Atendimento registrado! Abrindo atendimento clínico...', 'success');
      } else {
        showToast('Atendimento agendado com sucesso!', 'success');
      }
      onSuccess(createdAppt);
      onClose();
    } catch (err: any) {
      const feedback = bookingError(err);
      setErrorTitle(feedback.title);
      setConflictError(feedback.message);
      showToast(feedback.message, 'error');

      // Recalcula imediatamente os horários disponíveis para remover o horário conflitante
      if (err.status === 409 && professionalId && serviceId && date) {
        const request = ++slotRequest.current;
        setSelectedSlot(null);
        setLoadingSlots(true);
        const roomParam = (roomId ? `&roomId=${encodeURIComponent(roomId)}` : '') + (patientId ? `&patientId=${encodeURIComponent(patientId)}` : '');
        ApiClient.get<any>(`/v1/slots/available?professionalId=${professionalId}&serviceId=${serviceId}&date=${date}${roomParam}`)
          .then(data => {
            if (request !== slotRequest.current) return;
            setAvailableSlots(data.slots || []);
            if (!isCustomTime) {
              setSelectedSlot(null);
            }
          })
          .catch(() => {})
          .finally(() => { if (request === slotRequest.current) setLoadingSlots(false); });
      }
    } finally {
      submissionPending.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto mobile-modal">
      <div className="bg-white rounded-2xl sm:rounded-3xl max-w-lg sm:max-w-xl w-full p-4 sm:p-5 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 mb-3">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">
              {isRetroactive ? 'Registrar Atendimento Realizado' : 'Novo Agendamento'}
            </h3>
            {isRetroactive && (
              <button
                type="button"
                onClick={() => setIsRetroactive(false)}
                className="text-xs font-medium text-teal-700 hover:text-teal-900 underline underline-offset-2 mt-0.5 cursor-pointer block"
              >
                ← Voltar para novo agendamento
              </button>
            )}
          </div>
          <button aria-label="Fechar" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2.5 text-xs">
          <PatientSearchSelect
            label={clientTermLabel}
            required
            value={patientId}
            selectedPatient={selectedPatientObj}
            clientTermLabel={clientTermLabel}
            onChange={(id, patient) => {
              setPatientId(id);
              setSelectedPatientObj(patient || null);
            }}
            onCreateNew={handleOpenCreatePatient}
          />

          <div className="grid grid-cols-1 sm:grid-cols-[0.85fr_1.15fr] gap-2.5 relative z-30">
            <div className="min-w-0">
              <label className="block font-semibold text-slate-700 mb-0.5">Profissional *</label>
              <select
                value={professionalId}
                onChange={e => setProfessionalId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 truncate"
              >
                {professionals.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label className="block font-semibold text-slate-700 mb-0.5">Serviço *</label>
              <QuickActionDropdown
                value={serviceId}
                onChange={val => setServiceId(val)}
                options={filteredServices.map(s => ({
                  value: s.id,
                  label: s.name,
                  sublabel: s.duration_minutes ? `${s.duration_minutes} min` : undefined
                }))}
                placeholder={filteredServices.length === 0 ? "Nenhum serviço disponível" : "Selecione um serviço..."}
                emptyMessage="Nenhum serviço disponível para este profissional"
                actionLabel="+ Adicionar novo serviço"
                onAction={() => setIsNewServiceModalOpen(true)}
                showAction={canManageServices}
                rightContent={
                  <div className="flex items-center gap-1 w-24 border-l border-slate-200 pl-2">
                    <span aria-hidden="true" className="shrink-0 whitespace-nowrap text-slate-500">R$</span>
                    <input id="appointment-price" type="text" inputMode="decimal" required
                      value={appointmentPrice} disabled={!serviceId}
                      onChange={event => {
                        if (!/^[\d.,]*$/.test(event.target.value)) return;
                        priceEdited.current = true;
                        setAppointmentPrice(event.target.value);
                      }}
                      onBlur={() => { const value = parseAppointmentPrice(appointmentPrice); if (value !== null) setAppointmentPrice(formatAppointmentPrice(value)); }}
                      aria-label="Valor da consulta *"
                      aria-invalid={appointmentPrice !== '' && parseAppointmentPrice(appointmentPrice) === null}
                      className="w-full min-w-0 !min-h-0 flex-1 !p-0 bg-transparent outline-none text-xs" />
                  </div>
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 relative z-20">
            <div className="min-w-0">
              <label className="block font-semibold text-slate-700 mb-0.5">Convênio</label>
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
            </div>
            <div className="min-w-0">
              <label className="block font-semibold text-slate-700 mb-0.5">Sala de Atendimento</label>
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
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <label className="block font-semibold text-slate-700">
                  {isRetroactive ? 'Data do atendimento *' : 'Data *'}
                </label>
                {!isRetroactive && (
                  <button
                    type="button"
                    onClick={() => {
                      const todayStr = new Date().toISOString().split('T')[0];
                      setIsRetroactive(true);
                      setIsCustomTime(false);
                      if (!date || date > todayStr) {
                        setDate(todayStr);
                      }
                      const selectedService = services.find(s => s.id === serviceId);
                      const dur = selectedService?.duration_minutes || (selectedService as any)?.duration || 50;
                      const startT = initialPrefill?.time || '14:00';
                      setRetroStartTime(startT);
                      setRetroEndTime(computeEndTimeStr(startT, dur));
                    }}
                    className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 underline underline-offset-2 cursor-pointer"
                  >
                    Registrar atendimento já realizado
                  </button>
                )}
              </div>
              <input
                type="date"
                value={date}
                min={isRetroactive ? undefined : new Date().toISOString().split('T')[0]}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-0.5">Modalidade</label>
              <select
                value={modality}
                onChange={e => {
                  const next = e.target.value as 'presential' | 'online';
                  setModality(next);
                  if (next !== 'online') setIsConfiguringTele(false);
                }}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
              >
                <option value="presential">Presencial</option>
                <option value="online">Online</option>
              </select>
            </div>
          </div>

          {modality === 'online' && (
            <div>
              {isConfiguringTele ? (
                <div className="p-2.5 bg-slate-50 rounded-xl space-y-2 border border-slate-200">
                  <label className="block text-[11px] font-semibold text-slate-700">
                    Link do Google Meet
                    <input
                      aria-label="Link do Google Meet"
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
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Concluir configuração
                    </button>
                  </div>
                </div>
              ) : meetingUrl.trim() ? (
                <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs">
                  <span className="font-semibold text-emerald-800">✓ Teleconsulta configurada</span>
                  <button
                    type="button"
                    onClick={() => setIsConfiguringTele(true)}
                    className="font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                  >
                    Editar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsConfiguringTele(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50/60 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <span aria-hidden="true">📹</span>
                  <span>Configurar teleconsulta</span>
                </button>
              )}
            </div>
          )}

          {/* Banner de conflito de agendamento */}
          {conflictError && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-start gap-2">
              <span className="font-bold text-red-800 shrink-0">{errorTitle}:</span>
              <span>{conflictError}</span>
            </div>
          )}

          {/* Horários disponíveis / Horário Avulso */}
          {isRetroactive ? (
            <div className="p-3 bg-teal-50/60 border border-teal-200/80 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-teal-600" />
                  <span className="font-bold text-teal-900 text-xs">Horário Real do Atendimento Realizado</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRetroactive(false)}
                  className="text-[11px] text-slate-600 hover:text-slate-900 underline cursor-pointer"
                >
                  ← Voltar para novo agendamento
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-0.5 text-[11px]">Data do atendimento *</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-0.5 text-[11px]">Horário de início *</label>
                  <input
                    type="time"
                    value={retroStartTime}
                    onChange={e => {
                      const nextStart = e.target.value;
                      setRetroStartTime(nextStart);
                      const selectedService = services.find(s => s.id === serviceId);
                      const dur = selectedService?.duration_minutes || (selectedService as any)?.duration || 50;
                      if (nextStart) {
                        setRetroEndTime(computeEndTimeStr(nextStart, dur));
                      }
                    }}
                    className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-0.5 text-[11px]">Horário de término *</label>
                  <input
                    type="time"
                    value={retroEndTime}
                    onChange={e => setRetroEndTime(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs bg-white"
                    required
                  />
                </div>
              </div>

              <p className="text-[10px] text-slate-600">
                Permite registrar atendimentos ocorridos no passado ou fora da escala habitual e abre imediatamente o prontuário clínico.
              </p>
            </div>
          ) : isCustomTime ? (
            <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="font-bold text-amber-900 text-xs">Agendamento em Horário Avulso</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomTime(false);
      setIsRetroactive(false);
                    setSelectedSlot(null);
                  }}
                  className="text-[11px] text-slate-500 hover:text-slate-800 underline cursor-pointer"
                >
                  Voltar aos horários da grade
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-0.5 text-[11px]">Data do atendimento *</label>
                  <input
                    type="date"
                    value={date}
                    min={isRetroactive ? undefined : new Date().toISOString().split('T')[0]}
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

              <p className="text-[10px] text-slate-500 italic">
                Este horário será válido apenas para este atendimento e não altera a disponibilidade habitual do profissional.
              </p>
            </div>
          ) : (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Horários Livres Disponíveis (respeitando intervalos e bloqueios)
              </label>
              {loadingSlots ? (
                <p className="text-slate-400 italic text-[11px] py-1">Calculando slots...</p>
              ) : availableSlots.length === 0 ? (
                <div className="space-y-2 py-1">
                  <p className="text-amber-600 font-medium text-[11px]">
                    Nenhum horário livre disponível para esta data e profissional.
                  </p>
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomTime(true);
                        if (!customTime) {
                          setCustomTime(initialPrefill?.time || '18:30');
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-colors cursor-pointer"
                    >
                      + Agendar em horário avulso
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-32 overflow-y-auto p-0.5">
                  {availableSlots.map(slot => (
                    <button
                      key={slot.time}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`py-1.5 px-1 rounded-xl text-center font-bold text-xs transition-all cursor-pointer ${
                        selectedSlot?.time === slot.time
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-50 border border-slate-200 text-slate-700 hover:border-indigo-400'
                      }`}
                    >
                      {slot.time}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-0.5">Observações Internas</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ex: Primeira consulta, indicação da Dra. Camila"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer text-xs"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleBook}
              disabled={(isRetroactive ? (!date || !retroStartTime || !retroEndTime) : (!isCustomTime ? !selectedSlot : (!date || !customTime))) || !patientId || !professionalId || !serviceId || loading || loadingSlots}
              className="w-full sm:w-auto px-5 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs disabled:opacity-50 cursor-pointer text-xs"
            >
              {isRetroactive ? (loading ? 'Registrando...' : 'Registrar e abrir atendimento') : (loading ? 'Agendando...' : 'Confirmar Agendamento')}
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Cadastro Rápido de Paciente Sobreposto ao Novo Agendamento */}
      <NewPatientModal
        isOpen={isNewPatientModalOpen}
        initialName={prefillName}
        initialPhone={prefillPhone}
        zIndex="z-[60]"
        onClose={() => setIsNewPatientModalOpen(false)}
        onSuccess={(created) => {
          setIsNewPatientModalOpen(false);
          if (created?.id) {
            setPatientId(created.id);
            setSelectedPatientObj({
              id: created.id,
              full_name: created.fullName || prefillName,
              name: created.fullName || prefillName,
              phone: created.phone || prefillPhone,
              cpf: created.cpf
            });
            showToast(`${clientTermLabel} cadastrado e selecionado!`, 'success');
          }
        }}
      />

      {/* Modal de Cadastro Rápido de Serviço */}
      <NewServiceModal
        isOpen={isNewServiceModalOpen}
        initialProfessionalId={professionalId}
        professionals={professionals}
        zIndex="z-[60]"
        onClose={() => setIsNewServiceModalOpen(false)}
        onSuccess={handleServiceCreated}
      />

      {/* Modal de Cadastro Rápido de Convênio */}
      <NewInsuranceModal
        isOpen={isNewInsuranceModalOpen}
        zIndex="z-[60]"
        onClose={() => setIsNewInsuranceModalOpen(false)}
        onSuccess={handleInsuranceCreated}
      />

      {/* Modal de Cadastro Rápido de Sala */}
      <NewRoomModal
        isOpen={isNewRoomModalOpen}
        zIndex="z-[60]"
        onClose={() => setIsNewRoomModalOpen(false)}
        onSuccess={handleRoomCreated}
      />
    </div>
  );
};
