import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { Professional, Service, Patient, AvailableSlot } from '../../types';
import { X, Calendar, Clock, User, Plus, CheckCircle2 } from 'lucide-react';

interface NewAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const NewAppointmentModal: React.FC<NewAppointmentModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const { showToast } = useToast();
  const { clientTermLabel } = useAuth();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [insurances, setInsurances] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);

  const [patientId, setPatientId] = useState<string>('');
  const [professionalId, setProfessionalId] = useState<string>('');
  const [serviceId, setServiceId] = useState<string>('');
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
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setConflictError(null);
      Promise.all([
        ApiClient.get<Patient[]>('/v1/patients'),
        ApiClient.get<Professional[]>('/v1/professionals'),
        ApiClient.get<Service[]>('/v1/services'),
        ApiClient.get<any[]>('/v1/insurances/clinic'),
        ApiClient.get<any[]>('/v1/rooms')
      ]).then(([pats, profs, srvs, ins, rms]) => {
        setPatients(pats);
        setProfessionals(profs);
        setServices(srvs);
        setInsurances(ins || []);
        setRooms(rms || []);
        if (pats.length > 0) setPatientId(pats[0].id);
        if (profs.length > 0) setProfessionalId(profs[0].id);
        if (srvs.length > 0) setServiceId(srvs[0].id);
      }).catch(() => {});
    }
  }, [isOpen]);

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
          setAvailableSlots(data.slots || []);
        })
        .catch(() => {
          setAvailableSlots([]);
        })
        .finally(() => setLoadingSlots(false));
    } else {
      setAvailableSlots([]);
      setSelectedSlot(null);
    }
  }, [professionalId, serviceId, date, roomId]);

  if (!isOpen) return null;

  const handleBook = async () => {
    if (!patientId || !professionalId || !serviceId || !selectedSlot) {
      showToast('Preencha todos os campos e selecione um horário disponível', 'error');
      return;
    }

    try {
      setLoading(true);
      setConflictError(null);
      await ApiClient.post('/v1/appointments', {
        patientId,
        professionalId,
        serviceId,
        roomId: roomId || null,
        insuranceId: insuranceId || null,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        modality,
        internalNotes: notes || null
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
            setSelectedSlot(null);
          })
          .catch(() => {})
          .finally(() => setLoadingSlots(false));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <h3 className="text-lg font-bold text-slate-900">Novo Agendamento</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3.5 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">{clientTermLabel} *</label>
            <select
              value={patientId}
              onChange={e => setPatientId(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
            >
              {patients.map(p => (
                <option key={p.id} value={p.id}>
                  {p.full_name} {p.is_child ? '(Pediátrico)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
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
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Serviço *</label>
              <select
                value={serviceId}
                onChange={e => setServiceId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
              >
                {services.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} (R$ {s.price})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Convênio</label>
              <select
                value={insuranceId}
                onChange={e => setInsuranceId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
              >
                <option value="">Particular (Sem Convênio)</option>
                {insurances.map(ins => (
                  <option key={ins.id} value={ins.id}>
                    {ins.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Sala de Atendimento</label>
              <select
                value={roomId}
                onChange={e => setRoomId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
              >
                <option value="">Nenhuma / Sem sala fixa</option>
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
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

          {/* Banner de conflito de agendamento */}
          {conflictError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-start gap-2">
              <span className="font-bold text-red-800">Conflito Detectado:</span>
              <span>{conflictError}</span>
            </div>
          )}

          {/* Horários disponíveis calculados em tempo real */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Horários Livres Disponíveis (respeitando intervalos e bloqueios)
            </label>
            {loadingSlots ? (
              <p className="text-slate-400 italic text-[11px]">Calculando slots...</p>
            ) : availableSlots.length === 0 ? (
              <p className="text-amber-600 font-medium text-[11px]">
                Nenhum horário livre disponível para esta data e profissional.
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2 max-h-36 overflow-y-auto p-1">
                {availableSlots.map(slot => (
                  <button
                    key={slot.time}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={`py-2 px-1 rounded-xl text-center font-bold text-xs transition-all ${
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

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              onClick={onClose}
              className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancelar
            </button>
            <button
              onClick={handleBook}
              disabled={!selectedSlot || loading}
              className="px-6 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs disabled:opacity-50"
            >
              Confirmar Agendamento
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
