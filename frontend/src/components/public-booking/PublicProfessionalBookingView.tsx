import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { AvailableSlot } from '../../types';
import {
  Calendar,
  Clock,
  User,
  CheckCircle2,
  Building2,
  Phone,
  Mail,
  ArrowRight,
  ShieldCheck,
  ChevronRight,
  MapPin,
  Sparkles,
  Stethoscope,
  Info
} from 'lucide-react';

interface PublicProfessionalBookingViewProps {
  slug: string;
  onBackToLanding?: () => void;
  onBackToApp?: () => void;
}

export const PublicProfessionalBookingView: React.FC<PublicProfessionalBookingViewProps> = ({
  slug,
  onBackToLanding,
  onBackToApp
}) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);
  const [step, setStep] = useState<number>(1);

  // Dados carregados da API
  const [professional, setProfessional] = useState<any>(null);
  const [tenant, setTenant] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);

  // Seleções do fluxo
  const [selectedService, setSelectedService] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    // Pula domingo para segunda se for domingo
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);

  // Formulário do Paciente
  const [fullName, setFullName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [isChild, setIsChild] = useState<boolean>(false);
  const [guardianName, setGuardianName] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [bookingResult, setBookingResult] = useState<any>(null);

  // Carrega perfil público do profissional
  useEffect(() => {
    async function loadProf() {
      try {
        setLoading(true);
        const data = await ApiClient.get<any>(`/v1/public/professionals/${slug}`);
        setProfessional(data.professional);
        setTenant(data.tenant);
        const srvs = data.services || [];
        setServices(srvs);
        if (srvs.length > 0) {
          setSelectedService(srvs[0]);
        }
      } catch (err: any) {
        showToast(err.message || 'Profissional não encontrado ou agendamento desativado', 'error');
      } finally {
        setLoading(false);
      }
    }
    if (slug) {
      loadProf();
    }
  }, [slug]);

  // Consulta slots disponíveis pela escala oficial quando muda data ou serviço
  useEffect(() => {
    if (!professional || !selectedService || !selectedDate) return;

    async function loadSlots() {
      try {
        setLoadingSlots(true);
        const data = await ApiClient.get<any>(
          `/v1/public/professionals/${slug}/slots?date=${selectedDate}&serviceId=${selectedService.id}`
        );
        setAvailableSlots(data.slots || []);
        setSelectedSlot(null);
      } catch (err: any) {
        console.error('Erro ao consultar horários:', err);
        setAvailableSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    }

    loadSlots();
  }, [slug, selectedService, selectedDate, professional]);

  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !phone) {
      showToast('Por favor, informe seu nome e telefone WhatsApp', 'error');
      return;
    }
    if (!selectedSlot || !selectedService) {
      showToast('Selecione um horário disponível para a consulta', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        tenantId: tenant?.id,
        tenantSlug: tenant?.slug,
        professionalId: professional.id,
        serviceId: selectedService.id,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        modality: selectedService.modality === 'both' ? 'presential' : (selectedService.modality || 'presential'),
        patientNotes: notes || null,
        newPatientData: {
          fullName,
          phone,
          email: email || null,
          isChild,
          guardianName: isChild ? guardianName : null,
          notes: notes || null
        }
      };

      const res = await ApiClient.post<any>('/v1/public/appointments', payload);
      setBookingResult(res);
      setStep(3); // Sucesso
      showToast('Agendamento realizado com sucesso!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Não foi possível concluir o agendamento', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-300 text-sm font-semibold">Carregando perfil profissional...</p>
        </div>
      </div>
    );
  }

  if (!professional) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md text-center space-y-4">
          <div className="w-12 h-12 bg-red-500/10 text-red-400 rounded-xl flex items-center justify-center mx-auto">
            <Info className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white">Página Não Encontrada</h2>
          <p className="text-slate-400 text-sm">
            O profissional solicitado não existe ou a página pública de agendamento online está desativada no momento.
          </p>
          {(onBackToApp || onBackToLanding) && (
            <button
              onClick={onBackToApp || onBackToLanding}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium rounded-xl transition-all"
            >
              Voltar ao Início
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header Institucional */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {tenant?.logo_url ? (
              <img src={tenant.logo_url} alt={tenant.name} className="w-9 h-9 object-contain rounded-lg shadow-xs" />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-teal-600 flex items-center justify-center text-white font-bold text-sm">
                {(tenant?.name || 'Z')[0]}
              </div>
            )}
            <div>
              <h1 className="font-semibold text-white text-sm leading-tight">{tenant?.trade_name || tenant?.name}</h1>
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-teal-400" />
                {tenant?.city ? `${tenant.city} - ${tenant.state || 'Brasil'}` : 'Atendimento Especializado'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            {(onBackToApp || onBackToLanding) && (
              <button
                onClick={onBackToApp || onBackToLanding}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg transition-all"
              >
                Voltar
              </button>
            )}
            <div className="flex items-center gap-1.5">
              <img src="/brand/zemda-icon.png" alt="Zemda" className="w-5 h-5 object-contain" />
              <span className="hidden sm:inline font-medium">Agendamento Oficial Zemda</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
        {step < 3 ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Coluna Esquerda: Apresentação do Profissional */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

                <div className="flex flex-col items-center text-center space-y-4">
                  {professional.photo_url ? (
                    <img
                      src={professional.photo_url}
                      alt={professional.name}
                      className="w-28 h-28 rounded-full object-cover border-4 border-slate-800 shadow-md ring-2 ring-teal-500/30"
                    />
                  ) : (
                    <div className="w-28 h-28 rounded-full bg-slate-800 border-4 border-slate-700 flex items-center justify-center text-teal-400 font-bold text-3xl shadow-md">
                      {professional.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
                    </div>
                  )}

                  <div className="space-y-1">
                    <h2 className="text-xl font-bold text-white tracking-tight">{professional.name}</h2>
                    <p className="text-sm font-semibold text-teal-400">
                      {professional.specialty_name || professional.profession_name || 'Profissional de Saúde'}
                    </p>
                    {professional.registration_number && (
                      <p className="text-xs text-slate-400">
                        {professional.registration_type || 'Registro'}: {professional.registration_number}
                      </p>
                    )}
                  </div>

                  {professional.practice_areas && (
                    <div className="flex flex-wrap gap-1.5 justify-center pt-2">
                      {professional.practice_areas.split(',').map((area: string, i: number) => (
                        <span
                          key={i}
                          className="px-2.5 py-0.5 bg-slate-800 border border-slate-700/80 text-slate-300 text-xs rounded-full font-medium"
                        >
                          {area.trim()}
                        </span>
                      ))}
                    </div>
                  )}

                  {professional.bio && (
                    <p className="text-xs text-slate-400 leading-relaxed pt-2 border-t border-slate-800/80 text-justify">
                      {professional.bio}
                    </p>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800/80 space-y-2 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>{tenant?.name}</span>
                  </div>
                  {tenant?.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-slate-500 shrink-0" />
                      <span>{tenant.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-teal-400 font-medium">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>Disponibilidade sincronizada em tempo real</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Coluna Direita: Seleção de Serviço, Data, Horário e Formulário */}
            <div className="lg:col-span-7 space-y-6">
              {step === 1 && (
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-teal-400" />
                      1. Escolha o Serviço e o Horário
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Selecione o procedimento desejado e o melhor horário disponível na escala oficial do profissional.
                    </p>
                  </div>

                  {/* Lista de Serviços */}
                  <div className="space-y-2.5">
                    <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Serviços Disponíveis
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {services.map(srv => {
                        const isSelected = selectedService?.id === srv.id;
                        return (
                          <div
                            key={srv.id}
                            onClick={() => setSelectedService(srv)}
                            className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-teal-950/40 border-teal-500 text-white shadow-xs ring-1 ring-teal-500/50'
                                : 'bg-slate-800/60 border-slate-700/60 hover:border-slate-600 text-slate-300'
                            }`}
                          >
                            <div className="font-semibold text-sm leading-tight text-white">{srv.name}</div>
                            <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-slate-700/40">
                              <span className="flex items-center gap-1 text-slate-400">
                                <Clock className="w-3.5 h-3.5 text-teal-400" />
                                {srv.duration_minutes || 50} min
                              </span>
                              <span className="font-bold text-teal-400">
                                {srv.price > 0 ? `R$ ${Number(srv.price).toFixed(2).replace('.', ',')}` : 'Sob consulta'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Seletor de Data */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Data do Atendimento
                    </label>
                    <input
                      type="date"
                      value={selectedDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={e => setSelectedDate(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-hidden focus:border-teal-500 transition-colors"
                    />
                  </div>

                  {/* Horários Livres */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                      <span>Horários Livres na Escala</span>
                      {loadingSlots && <span className="text-teal-400 font-normal">Calculando horários...</span>}
                    </label>

                    {loadingSlots ? (
                      <div className="h-28 flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : availableSlots.length === 0 ? (
                      <div className="bg-slate-800/40 border border-dashed border-slate-700 rounded-2xl p-6 text-center text-slate-400 text-sm">
                        Não há horários disponíveis para esta data. Por favor, escolha outro dia.
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1">
                        {availableSlots.map((slot, idx) => {
                          const isSlotSelected = selectedSlot?.startTime === slot.startTime;
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setSelectedSlot(slot)}
                              className={`py-2 px-3 rounded-xl text-sm font-semibold transition-all ${
                                isSlotSelected
                                  ? 'bg-teal-500 text-slate-950 shadow-md ring-2 ring-teal-400 scale-[1.02]'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60'
                              }`}
                            >
                              {slot.time}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={!selectedSlot}
                    onClick={() => setStep(2)}
                    className="w-full py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 text-sm"
                  >
                    <span>Prosseguir para Dados do Paciente</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {step === 2 && (
                <form
                  onSubmit={handleConfirmBooking}
                  className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6"
                >
                  <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                    <div>
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <User className="w-5 h-5 text-teal-400" />
                        2. Seus Dados Pessoais
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Agendamento para {selectedDate.split('-').reverse().join('/')} às {selectedSlot?.time}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="text-xs text-teal-400 hover:underline"
                    >
                      Alterar horário
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Nome Completo *</label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={e => setFullName(e.target.value)}
                        placeholder="Ex: Maria Silva"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-hidden focus:border-teal-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">WhatsApp / Telefone *</label>
                        <input
                          type="tel"
                          required
                          value={phone}
                          onChange={e => setPhone(e.target.value)}
                          placeholder="(11) 99999-9999"
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-hidden focus:border-teal-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">E-mail</label>
                        <input
                          type="email"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          placeholder="seu@email.com"
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-hidden focus:border-teal-500"
                        />
                      </div>
                    </div>

                    <div className="pt-2">
                      <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300 select-none">
                        <input
                          type="checkbox"
                          checked={isChild}
                          onChange={e => setIsChild(e.target.checked)}
                          className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                        />
                        <span>O paciente é menor de idade / criança</span>
                      </label>
                    </div>

                    {isChild && (
                      <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 space-y-3">
                        <label className="block text-xs font-semibold text-slate-300">
                          Nome do Responsável Legal *
                        </label>
                        <input
                          type="text"
                          required={isChild}
                          value={guardianName}
                          onChange={e => setGuardianName(e.target.value)}
                          placeholder="Nome do pai, mãe ou tutor"
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-hidden focus:border-teal-500"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Observações ou motivo da consulta (opcional)
                      </label>
                      <textarea
                        rows={3}
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Alguma informação importante para o profissional..."
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-hidden focus:border-teal-500 resize-none"
                      />
                    </div>
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="px-5 py-3 border border-slate-700 hover:bg-slate-800 text-slate-300 font-semibold rounded-2xl text-sm transition-all"
                    >
                      Voltar
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-semibold rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 text-sm"
                    >
                      {submitting ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Confirmar Agendamento</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        ) : (
          /* Tela de Sucesso */
          <div className="max-w-xl mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-10 shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto ring-4 ring-emerald-500/20">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white tracking-tight">Consulta Agendada com Sucesso!</h2>
              <p className="text-sm text-slate-400">
                Seu horário já foi reservado diretamente na agenda oficial do profissional.
              </p>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/70 rounded-2xl p-5 text-left space-y-3 text-sm">
              <div className="flex justify-between border-b border-slate-700/60 pb-2">
                <span className="text-slate-400">Profissional:</span>
                <span className="font-semibold text-white">{professional.name}</span>
              </div>
              <div className="flex justify-between border-b border-slate-700/60 pb-2">
                <span className="text-slate-400">Procedimento:</span>
                <span className="font-semibold text-white">{selectedService?.name}</span>
              </div>
              <div className="flex justify-between border-b border-slate-700/60 pb-2">
                <span className="text-slate-400">Data e Horário:</span>
                <span className="font-bold text-teal-400">
                  {selectedDate.split('-').reverse().join('/')} às {selectedSlot?.time}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-700/60 pb-2">
                <span className="text-slate-400">Paciente:</span>
                <span className="font-semibold text-white">{fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Clínica:</span>
                <span className="font-semibold text-white">{tenant?.name}</span>
              </div>
            </div>

            <p className="text-xs text-slate-400">
              Um comprovante e lembretes serão enviados via WhatsApp para <strong className="text-slate-200">{phone}</strong>.
            </p>

            <button
              onClick={() => {
                setStep(1);
                setSelectedSlot(null);
              }}
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl transition-all"
            >
              Realizar outro agendamento
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-4 text-center text-xs text-slate-500">
        Plataforma Zemda • Tecnologia Médica e Gestão Profissional • LGPD Compliant
      </footer>
    </div>
  );
};
