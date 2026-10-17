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
  onSuccess: () => void;
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
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);

  useEffect(() => {
    priceServiceId.current = null;
    priceEdited.current = false;
    setAppointmentPrice('');
    if (isOpen) {
      setMeetingUrl('');
      setIsCustomTime(false);
      setCustomTime(initialPrefill?.time || '18:30');
    } else {
      setPatientId('');
      setSelectedPatientObj(null);
      setIsNewPatientModalOpen(false);
      setNewPatientSearchQuery('');
      setIsCustomTime(false);
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
      }).catch(() => {});
    }
  }, [isOpen, initialPrefill]);

  useEffect(() => {
    if (!isOpen) return;
    const selectedService = services.find(service => service.id === serviceId);
    if (priceServiceId.current !== serviceId) priceEdited.current = false;
    if (priceEdited.current) return;
    priceServiceId.current = serviceId;
    setAppointmentPrice(selectedService ? formatAppointmentPrice(Number(selectedService.price)) : '');
  }, [isOpen, serviceId, services]);

  // Consulta slots livres imediatamente ao alterar profissional, serviço, data ou sala
  useEffect(() => {
    if (professionalId && serviceId && date) {
      setAvailableSlots([]);
      setSelectedSlot(null);
      setLoadingSlots(true);
      setConflictError(null);

      const roomParam = roomId ? `&roomId=${encodeURIComponent(roomId)}` : '';
      ApiClient.get<any>(`/v1/slots/available?professionalId=${professionalId}&serviceId=${serviceId}&date=${date}${roomParam}`)
        .then(data => {
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
        .catch(() => {
          setAvailableSlots([]);
          setSelectedSlot(null);
        })
        .finally(() => setLoadingSlots(false));
    } else {
      setAvailableSlots([]);
      setSelectedSlot(null);
    }
  }, [professionalId, serviceId, date, roomId, initialPrefill]);

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
    if (!patientId || !professionalId || !serviceId) {
      showToast('Preencha todos os campos obrigatórios', 'error');
      return;
    }

    const normalizedPrice = parseAppointmentPrice(appointmentPrice);
    if (normalizedPrice === null) {
      showToast('Informe um valor da consulta válido, com até duas casas decimais e maior ou igual a zero.', 'error');
      return;
    }

    if (!isCustomTime && !selectedSlot) {
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

    if (isCustomTime) {
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
      setLoading(true);
      setConflictError(null);
      await ApiClient.post('/v1/appointments', {
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
        isCustomTime: isCustomTime ? true : undefined
      });

      showToast('Atendimento agendado com sucesso!', 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      const errorMsg = err.error || err.message || 'Este horário não está mais disponível. Escolha outro horário.';
      if (err.conflict) {
        setConflictError(`${errorMsg} (${err.conflict.professionalName} - ${err.conflict.serviceName || ''})`);
      } else {
        setConflictError(errorMsg);
      }
      showToast(errorMsg, 'error');

      // Recalcula imediatamente os horários disponíveis para remover o horário conflitante
      if (professionalId && serviceId && date) {
        setLoadingSlots(true);
        const roomParam = roomId ? `&roomId=${encodeURIComponent(roomId)}` : '';
        ApiClient.get<any>(`/v1/slots/available?professionalId=${professionalId}&serviceId=${serviceId}&date=${date}${roomParam}`)
          .then(data => {
            setAvailableSlots(data.slots || []);
            if (!isCustomTime) {
              setSelectedSlot(null);
            }
          })
          .catch(() => {})
          .finally(() => setLoadingSlots(false));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto mobile-modal">
      <div className="bg-white rounded-3xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto my-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <h3 className="text-lg font-bold text-slate-900">Novo Agendamento</h3>
          <button aria-label="Fechar" onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3.5 text-xs">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative z-30">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Profissional *</label>
              <select
                value={professionalId}
                onChange={e => setProfessionalId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
              >
                {professionals.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_6rem] sm:grid-cols-[minmax(0,7fr)_minmax(6rem,3fr)] gap-2 min-w-0 sm:col-span-2">
              <div className="min-w-0">
              <label className="block font-semibold text-slate-700 mb-1">Serviço *</label>
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
              />
              </div>
              <div className="min-w-0">
              <label htmlFor="appointment-price" className="block text-slate-500 mb-1">Valor</label>
              <div className="flex items-center gap-1 w-full border border-slate-200 rounded-xl px-2 py-2 bg-slate-50 focus-within:ring-2 focus-within:ring-indigo-500">
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
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative z-20">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Convênio</label>
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
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Sala de Atendimento</label>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Data *</label>
              <input
                type="date"
                value={date}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Modalidade</label>
              <select
                value={modality}
                onChange={e => setModality(e.target.value as any)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
              >
                <option value="presential">Presencial</option>
                <option value="online">Online</option>
              </select>
            </div>
          </div>

          {modality === 'online' && <div className="p-3 bg-indigo-50 rounded-xl space-y-2">
            <p className="font-bold text-indigo-800">Teleconsulta</p>
            <label className="block text-xs font-semibold">Link da teleconsulta
              <input type="url" value={meetingUrl} onChange={e => setMeetingUrl(e.target.value)} placeholder="https://meet.google.com/xxx-xxxx-xxx" className="w-full border rounded-xl px-3 py-2 mt-1" />
            </label>
          </div>}

          {/* Banner de conflito de agendamento */}
          {conflictError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-start gap-2">
              <span className="font-bold text-red-800">Conflito Detectado:</span>
              <span>{conflictError}</span>
            </div>
          )}

          {/* Horários disponíveis / Horário Avulso */}
          {isCustomTime ? (
            <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="font-bold text-amber-900 text-xs">Agendamento em Horário Avulso</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomTime(false);
                    setSelectedSlot(null);
                  }}
                  className="text-[11px] text-slate-500 hover:text-slate-800 underline cursor-pointer"
                >
                  Voltar aos horários da grade
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Data do atendimento *</label>
                  <input
                    type="date"
                    value={date}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={e => setDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Horário do atendimento *</label>
                  <input
                    type="time"
                    value={customTime}
                    onChange={e => setCustomTime(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white"
                    required
                  />
                </div>
              </div>

              <p className="text-[11px] text-slate-600 italic">
                Este horário será válido apenas para este atendimento e não altera a disponibilidade habitual do profissional.
              </p>
            </div>
          ) : (
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Horários Livres Disponíveis (respeitando intervalos e bloqueios)
              </label>
              {loadingSlots ? (
                <p className="text-slate-400 italic text-[11px]">Calculando slots...</p>
              ) : availableSlots.length === 0 ? (
                <div className="space-y-2.5">
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
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-colors cursor-pointer"
                    >
                      + Agendar em horário avulso
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-36 overflow-y-auto p-1">
                  {availableSlots.map(slot => (
                    <button
                      key={slot.time}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`py-2 px-1 rounded-xl text-center font-bold text-xs transition-all cursor-pointer ${
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
            <label className="block font-semibold text-slate-700 mb-1">Observações Internas</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ex: Primeira consulta, indicação da Dra. Camila"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer min-h-[44px]"
            >
              Cancelar
            </button>
            <button
              onClick={handleBook}
              disabled={(!isCustomTime ? !selectedSlot : (!date || !customTime)) || !patientId || !professionalId || !serviceId || loading}
              className="w-full sm:w-auto px-6 py-2.5 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs disabled:opacity-50 cursor-pointer min-h-[44px]"
            >
              Confirmar Agendamento
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
