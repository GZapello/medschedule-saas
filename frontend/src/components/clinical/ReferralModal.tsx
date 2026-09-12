import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  Send,
  UserCheck,
  Clock,
  Calendar,
  AlertCircle,
  X,
  CheckCircle2,
  Share2
} from 'lucide-react';

interface Professional {
  id: string;
  name: string;
  specialty?: string;
}

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
}

interface ReferralModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
  originAppointmentId?: string;
  onSuccess?: () => void;
}

export const ReferralModal: React.FC<ReferralModalProps> = ({
  isOpen,
  onClose,
  patientId,
  patientName,
  originAppointmentId,
  onSuccess
}) => {
  const { showToast } = useToast();

  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [toProfessionalId, setToProfessionalId] = useState<string>('');
  const [serviceId, setServiceId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [priority, setPriority] = useState<'normal' | 'high' | 'urgent'>('normal');

  // Modo de agendamento imediato
  const [scheduleNow, setScheduleNow] = useState<boolean>(false);
  const [apptDate, setApptDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [apptTime, setApptTime] = useState<string>('09:00');
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      loadDependencies();
    }
  }, [isOpen]);

  const loadDependencies = async () => {
    try {
      const [profsData, servicesData] = await Promise.all([
        ApiClient.get<Professional[]>('/v1/professionals'),
        ApiClient.get<Service[]>('/v1/services')
      ]);
      setProfessionals(profsData || []);
      setServices(servicesData || []);

      if (profsData && profsData.length > 0) {
        setToProfessionalId(profsData[0].id);
      }
      if (servicesData && servicesData.length > 0) {
        setServiceId(servicesData[0].id);
      }
    } catch (err: any) {
      showToast('Erro ao carregar lista de profissionais', 'error');
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!toProfessionalId || !reason.trim()) {
      showToast('Selecione o profissional de destino e informe o motivo', 'error');
      return;
    }

    let startTime = '';
    let endTime = '';

    if (scheduleNow) {
      if (!apptDate || !apptTime) {
        showToast('Informe a data e horário para o agendamento', 'error');
        return;
      }
      startTime = `${apptDate}T${apptTime}:00`;
      const srv = services.find(s => s.id === serviceId);
      const duration = srv?.duration_minutes || 50;
      const endDate = new Date(new Date(startTime).getTime() + duration * 60000);
      endTime = endDate.toISOString().slice(0, 19);
    }

    try {
      setSubmitting(true);
      const res = await ApiClient.post<any>('/v1/referrals', {
        patientId,
        toProfessionalId,
        serviceId,
        originAppointmentId,
        reason: reason.trim(),
        notes: notes.trim(),
        priority,
        scheduleNow,
        startTime: scheduleNow ? startTime : undefined,
        endTime: scheduleNow ? endTime : undefined
      });

      showToast(res.message || 'Encaminhamento registrado com sucesso!', 'success');
      onSuccess?.();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Erro ao registrar encaminhamento', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <span className="text-[11px] font-bold text-teal-600 uppercase tracking-wider flex items-center gap-1.5">
              <Share2 className="w-3.5 h-3.5" />
              Encaminhamento Interprofissional
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-0.5">{patientName}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Profissional de Destino */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Encaminhar para qual Profissional? *
            </label>
            <select
              value={toProfessionalId}
              onChange={e => setToProfessionalId(e.target.value)}
              className="w-full border border-slate-300 rounded-xl p-2.5 font-medium bg-slate-50 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
              required
            >
              {professionals.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.specialty ? `(${p.specialty})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Especialidade / Serviço */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Serviço / Especialidade Sugerida</label>
            <select
              value={serviceId}
              onChange={e => setServiceId(e.target.value)}
              className="w-full border border-slate-300 rounded-xl p-2.5 font-medium bg-slate-50 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
            >
              <option value="">-- Não especificado / A combinar --</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.duration_minutes} min)
                </option>
              ))}
            </select>
          </div>

          {/* Prioridade */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Grau de Prioridade</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPriority('normal')}
                className={`flex-1 py-2 rounded-xl font-bold border transition-all cursor-pointer ${
                  priority === 'normal'
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Rotina / Normal
              </button>
              <button
                type="button"
                onClick={() => setPriority('high')}
                className={`flex-1 py-2 rounded-xl font-bold border transition-all cursor-pointer ${
                  priority === 'high'
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Prioridade Alta
              </button>
              <button
                type="button"
                onClick={() => setPriority('urgent')}
                className={`flex-1 py-2 rounded-xl font-bold border transition-all cursor-pointer ${
                  priority === 'urgent'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Urgente
              </button>
            </div>
          </div>

          {/* Motivo do Encaminhamento */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Motivo do Encaminhamento *</label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ex: Avaliação fonoaudiológica para disfagia / Psicoterapia de apoio..."
              className="w-full border border-slate-300 rounded-xl p-2.5 font-medium focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
              required
            />
          </div>

          {/* Observações Clínicas Complementares */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Observações & Resumo do Caso (Opcional)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Detalhes clínicos relevantes para o colega que irá atender..."
              className="w-full border border-slate-300 rounded-xl p-2.5 font-medium focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
            />
          </div>

          {/* Opção de Agendamento Imediato */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
            <label className="flex items-center gap-2.5 font-bold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={scheduleNow}
                onChange={e => setScheduleNow(e.target.checked)}
                className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
              />
              <span>Agendar consulta imediatamente para este profissional</span>
            </label>

            {scheduleNow && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Data *</label>
                  <input
                    type="date"
                    value={apptDate}
                    onChange={e => setApptDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl p-2 bg-white"
                    required={scheduleNow}
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Horário *</label>
                  <input
                    type="time"
                    value={apptTime}
                    onChange={e => setApptTime(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl p-2 bg-white"
                    required={scheduleNow}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              {submitting ? 'Registrando...' : scheduleNow ? 'Agendar & Encaminhar' : 'Registrar Encaminhamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
