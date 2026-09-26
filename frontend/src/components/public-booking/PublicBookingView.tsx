import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Service, Professional, AvailableSlot } from '../../types';
import {
  Calendar,
  Clock,
  User,
  CheckCircle2,
  Video,
  MapPin,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  Building2,
  Phone,
  Mail,
  ChevronRight,
  Sparkles
} from 'lucide-react';

interface PublicBookingViewProps {
  tenantSlug?: string;
  onBackToApp?: () => void;
}

export const PublicBookingView: React.FC<PublicBookingViewProps> = ({
  tenantSlug = 'clinica-viver-bem',
  onBackToApp
}) => {
  const { showToast } = useToast();
  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);

  // Dados da clínica
  const [clinicData, setClinicData] = useState<any>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);

  // Seleções do fluxo
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedProf, setSelectedProf] = useState<Professional | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);

  // Formulário do paciente
  const [fullName, setFullName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [isChild, setIsChild] = useState<boolean>(false);
  const [guardianName, setGuardianName] = useState<string>('');
  const [guardianPhone, setGuardianPhone] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Resultado
  const [bookingResult, setBookingResult] = useState<any>(null);

  // Carrega perfil público da clínica
  useEffect(() => {
    async function loadClinic() {
      try {
        setLoading(true);
        const data = await ApiClient.get<any>(`/v1/public/tenants/${tenantSlug}`);
        setClinicData(data.tenant);
        setServices(data.services || []);
        setProfessionals(data.professionals || []);
      } catch (err: any) {
        showToast(err.message || 'Erro ao carregar clínica', 'error');
      } finally {
        setLoading(false);
      }
    }
    loadClinic();
  }, [tenantSlug]);

  // Consulta slots disponíveis quando profissional, serviço e data são selecionados
  useEffect(() => {
    if (selectedProf && selectedService && selectedDate) {
      const profId = selectedProf.id;
      const srvId = selectedService.id;
      const dateVal = selectedDate;
      async function loadSlots() {
        try {
          setLoadingSlots(true);
          const data = await ApiClient.get<any>(
            `/v1/public/slots/available?tenantSlug=${tenantSlug}&professionalId=${profId}&serviceId=${srvId}&date=${dateVal}`
          );
          setAvailableSlots(data.slots || []);
          setSelectedSlot(null);
        } catch (err: any) {
          showToast('Erro ao consultar horários livres', 'error');
        } finally {
          setLoadingSlots(false);
        }
      }
      loadSlots();
    }
  }, [selectedProf, selectedService, selectedDate, tenantSlug]);

  const handleConfirmBooking = async () => {
    if (!fullName || !phone) {
      showToast('Por favor, informe seu nome completo e telefone WhatsApp', 'error');
      return;
    }

    if (isChild && !guardianName) {
      showToast('Para atendimento infantil, informe o nome do responsável legal', 'error');
      return;
    }

    if (!selectedSlot || !selectedService || !selectedProf) {
      showToast('Selecione o serviço, profissional e horário', 'error');
      return;
    }

    try {
      setLoading(true);
      const payload = {
        tenantSlug,
        professionalId: selectedProf.id,
        serviceId: selectedService.id,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        modality: selectedService.modality === 'both' ? 'presential' : selectedService.modality,
        patientNotes: notes || null,
        newPatientData: {
          fullName,
          phone,
          email: email || null,
          isChild,
          guardianName: isChild ? guardianName : null,
          guardianPhone: isChild ? (guardianPhone || phone) : null,
          notes: notes || null
        }
      };

      const result = await ApiClient.post<any>('/v1/public/appointments', payload);
      setBookingResult(result);
      setStep(5); // Tela de Sucesso
    } catch (err: any) {
      showToast(err.message || 'Erro ao concluir agendamento', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !clinicData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600">Carregando página de agendamento...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center py-6 px-4 sm:px-6">
      {/* Botão de retorno ao painel se acionado internamente */}
      {onBackToApp && (
        <div className="w-full max-w-2xl mb-3 flex justify-between items-center">
          <button
            onClick={onBackToApp}
            className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao Painel Interno
          </button>
          <span className="text-xs text-slate-400 font-medium">Modo de Pré-visualização Pública</span>
        </div>
      )}

      {/* Card Principal da Clínica e Wizard */}
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header com Identidade Visual da Clínica */}
        <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-teal-600 text-white p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white text-2xl font-bold shadow-inner">
              {clinicData?.name?.charAt(0) || 'C'}
            </div>
            <div>
              <span className="text-xs font-semibold tracking-wider text-teal-200 uppercase">
                Agendamento Online Seguro
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-0.5">
                {clinicData?.trade_name || clinicData?.name}
              </h1>
              <p className="text-xs text-indigo-100 mt-1 flex items-center gap-2">
                <span>{clinicData?.city} - {clinicData?.state}</span>
                {clinicData?.phone && <span>• Tel: {clinicData?.phone}</span>}
              </p>
            </div>
          </div>

          {/* Stepper Progress Bar (se não estiver no step de sucesso) */}
          {step < 5 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/20 text-xs font-semibold">
              <span className={step >= 1 ? 'text-white' : 'text-indigo-200'}>1. Serviço</span>
              <ChevronRight className="w-4 h-4 text-white/40" />
              <span className={step >= 2 ? 'text-white' : 'text-indigo-200'}>2. Profissional</span>
              <ChevronRight className="w-4 h-4 text-white/40" />
              <span className={step >= 3 ? 'text-white' : 'text-indigo-200'}>3. Horário</span>
              <ChevronRight className="w-4 h-4 text-white/40" />
              <span className={step >= 4 ? 'text-white' : 'text-indigo-200'}>4. Seus Dados</span>
            </div>
          )}
        </div>

        {/* Wizard Steps Container */}
        <div className="p-6 sm:p-8">
          {/* PASSO 1: ESCOLHA DO SERVIÇO */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Escolha o Serviço Desejado</h2>
                <p className="text-xs text-slate-500">Selecione o atendimento que melhor atende às suas necessidades.</p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {services.map(srv => {
                  const isSelected = selectedService?.id === srv.id;
                  return (
                    <div
                      key={srv.id}
                      onClick={() => setSelectedService(srv)}
                      className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-900 text-sm">{srv.name}</h3>
                          {srv.specialty_name && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full">
                              {srv.specialty_name}
                            </span>
                          )}
                        </div>
                        {srv.description && (
                          <p className="text-xs text-slate-500 line-clamp-2">{srv.description}</p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-slate-400 pt-1">
                          <span className="flex items-center gap-1 font-medium text-slate-600">
                            <Clock className="w-3.5 h-3.5 text-indigo-500" /> {srv.duration_minutes} min
                          </span>
                          <span>•</span>
                          <span>{srv.modality === 'online' ? 'Atendimento Online' : srv.modality === 'presential' ? 'Presencial' : 'Presencial ou Online'}</span>
                        </div>
                      </div>

                      <div className="text-right pl-4">
                        <span className="text-lg font-extrabold text-slate-900">
                          {Number(srv.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  disabled={!selectedService}
                  onClick={() => setStep(2)}
                  className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Continuar <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* PASSO 2: ESCOLHA DO PROFISSIONAL */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Escolha o Profissional</h2>
                <p className="text-xs text-slate-500">Selecione quem irá conduzir o seu atendimento.</p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {professionals.map(prof => {
                  const isSelected = selectedProf?.id === prof.id;
                  return (
                    <div
                      key={prof.id}
                      onClick={() => setSelectedProf(prof)}
                      className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-base flex-shrink-0">
                          {prof.name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 text-sm">{prof.name}</h3>
                          <p className="text-xs text-indigo-600 font-medium">{prof.specialty_name || prof.profession_name}</p>
                          {prof.registration_number && (
                            <span className="text-[11px] text-slate-400">{prof.registration_type}: {prof.registration_number}</span>
                          )}
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 className="w-5 h-5 text-indigo-600" />}
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 flex justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
                <button
                  disabled={!selectedProf}
                  onClick={() => setStep(3)}
                  className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Continuar <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* PASSO 3: DATA E HORÁRIOS DISPONÍVEIS */}
          {step === 3 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Escolha o Dia e Horário</h2>
                <p className="text-xs text-slate-500">Horários disponíveis calculados em tempo real de acordo com a agenda.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Data do Atendimento</label>
                <input
                  type="date"
                  value={selectedDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 bg-slate-50"
                />
              </div>

              {/* Slot Picker */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">Horários Livres Disponíveis</label>

                {loadingSlots ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Consultando disponibilidade...
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center text-xs text-slate-500">
                    Nenhum horário livre encontrado para esta data. Por favor, tente outro dia.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                    {availableSlots.map(slot => {
                      const isSelected = selectedSlot?.time === slot.time;
                      return (
                        <button
                          key={slot.time}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={`py-3 px-2 rounded-xl text-center font-bold text-xs transition-all ${
                            isSelected
                              ? 'bg-indigo-600 text-white shadow-md scale-105'
                              : 'bg-slate-50 border border-slate-200 text-slate-700 hover:border-indigo-400 hover:bg-indigo-50/50'
                          }`}
                        >
                          {slot.time}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-4 flex justify-between">
                <button
                  onClick={() => setStep(2)}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
                <button
                  disabled={!selectedSlot}
                  onClick={() => setStep(4)}
                  className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Continuar <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* PASSO 4: IDENTIFICAÇÃO DO CLIENTE / PACIENTE / MENOR */}
          {step === 4 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Seus Dados para Contato</h2>
                <p className="text-xs text-slate-500">
                  Enviaremos a confirmação e lembretes diretamente pelo WhatsApp.
                </p>
              </div>

              {/* Checkbox Atendimento Infantil */}
              <div className="bg-indigo-50/60 p-3.5 rounded-2xl border border-indigo-100 flex items-center gap-3">
                <input
                  type="checkbox"
                  id="childCheck"
                  checked={isChild}
                  onChange={e => setIsChild(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded-sm focus:ring-indigo-500"
                />
                <label htmlFor="childCheck" className="text-xs font-semibold text-indigo-900 cursor-pointer">
                  Este agendamento é para uma criança, adolescente ou dependente?
                </label>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isChild ? 'Nome da Criança / Paciente' : 'Nome Completo'} *
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Ex: Mariana Silva"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">WhatsApp / Telefone *</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="(11) 99999-9999"
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail (opcional)</label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="seuemail@exemplo.com"
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                    />
                  </div>
                </div>

                {/* Campos do Responsável se for menor */}
                {isChild && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 animate-in fade-in">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Dados do Responsável Legal</h4>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Nome do Pai, Mãe ou Tutor *</label>
                      <input
                        type="text"
                        value={guardianName}
                        onChange={e => setGuardianName(e.target.value)}
                        placeholder="Nome do responsável"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Observações ou Motivo da Consulta</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Alguma informação importante que o profissional deva saber?"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              {/* Resumo antes de confirmar */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Serviço:</span>
                  <span className="font-bold text-slate-800">{selectedService?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Profissional:</span>
                  <span className="font-bold text-slate-800">{selectedProf?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Horário:</span>
                  <span className="font-bold text-indigo-600">{selectedDate} às {selectedSlot?.time}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="font-bold text-slate-700">Valor Total:</span>
                  <span className="font-bold text-slate-900 text-sm">
                    {Number(selectedService?.price || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                Ao confirmar, seus dados serão compartilhados com a clínica para viabilizar o atendimento, conforme a{' '}
                <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-600">
                  Política de Privacidade
                </a>.
              </p>

              <div className="pt-2 flex justify-between">
                <button
                  onClick={() => setStep(3)}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
                <button
                  onClick={handleConfirmBooking}
                  className="flex items-center gap-2 px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-md hover:bg-emerald-700 transition-all cursor-pointer"
                >
                  Confirmar Agendamento <CheckCircle2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* PASSO 5: TELA DE SUCESSO / COMPROVANTE */}
          {step === 5 && (
            <div className="py-6 text-center space-y-5 animate-in zoom-in-95 duration-300">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Agendamento Realizado!</span>
                <h2 className="text-2xl font-extrabold text-slate-900 mt-1">Tudo Pronto para o seu Atendimento</h2>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                  Os detalhes foram registrados com sucesso. Você receberá um lembrete no seu WhatsApp.
                </p>
              </div>

              {/* Card do Comprovante */}
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 max-w-md mx-auto text-left space-y-3">
                <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                  <span className="text-xs text-slate-400">Código da Reserva</span>
                  <span className="font-extrabold text-indigo-700 text-sm bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-100">
                    {bookingResult?.appointmentNumber || 'AG-2026-0000'}
                  </span>
                </div>

                <div className="text-xs space-y-2">
                  <div>
                    <span className="text-slate-400 block">Paciente:</span>
                    <span className="font-bold text-slate-800">{fullName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Profissional:</span>
                    <span className="font-bold text-slate-800">{selectedProf?.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Serviço:</span>
                    <span className="font-bold text-slate-800">{selectedService?.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Data & Horário:</span>
                    <span className="font-extrabold text-indigo-700 text-sm">{selectedDate} às {selectedSlot?.time}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => {
                    setStep(1);
                    setSelectedService(null);
                    setSelectedProf(null);
                    setSelectedSlot(null);
                  }}
                  className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all"
                >
                  Fazer Outro Agendamento
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
