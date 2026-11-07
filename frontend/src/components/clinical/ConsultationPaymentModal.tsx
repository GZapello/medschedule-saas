import React, { useState, useEffect, useRef } from 'react';
import { ApiClient } from '../../api/client';
import { Service, Professional } from '../../types';
import { NewServiceModal } from '../services/NewServiceModal';
import { Sparkles, Plus, X, AlertCircle, HelpCircle } from 'lucide-react';

export interface ConsultationPaymentModalProps {
  appointmentId: string;
  initialPayment?: any;
  initialServiceId?: string;
  professionalId?: string;
  onFinished: (result: any) => void;
  onClose: () => void;
}

export function ConsultationPaymentModal({
  appointmentId,
  initialPayment,
  initialServiceId,
  professionalId,
  onFinished,
  onClose
}: ConsultationPaymentModalProps) {
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loadingServices, setLoadingServices] = useState<boolean>(true);
  const [selectedServiceId, setSelectedServiceId] = useState<string>(initialServiceId || '');
  const [isNewServiceModalOpen, setIsNewServiceModalOpen] = useState<boolean>(false);
  const [showServiceOnboarding, setShowServiceOnboarding] = useState<boolean>(false);

  const [amount, setAmount] = useState<string>(String(initialPayment?.amount ?? ''));
  const [method, setMethod] = useState<string>(initialPayment?.payment_method || 'pix');
  const [status, setStatus] = useState<string>(initialPayment?.status || 'pending');
  const [notes, setNotes] = useState<string>(initialPayment?.notes || '');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const popoverRef = useRef<HTMLDivElement>(null);
  const serviceFieldRef = useRef<HTMLDivElement>(null);

  // Carrega serviços e profissionais disponíveis
  const loadData = async () => {
    try {
      setLoadingServices(true);
      const [servicesRes, profsRes] = await Promise.all([
        ApiClient.get<Service[]>('/v1/services').catch(() => []),
        ApiClient.get<Professional[]>('/v1/professionals').catch(() => [])
      ]);

      const activeServices = (servicesRes || []).filter(s => s.active !== 0);
      setServices(activeServices);
      setProfessionals(profsRes || []);

      // Auto-seleciona se já houver serviço indicado ou se houver um correspondente
      if (initialServiceId && activeServices.some(s => s.id === initialServiceId)) {
        setSelectedServiceId(initialServiceId);
        const match = activeServices.find(s => s.id === initialServiceId);
        if (match && !amount && match.price !== undefined) {
          setAmount(String(match.price));
        }
      } else if (!selectedServiceId && activeServices.length === 1) {
        setSelectedServiceId(activeServices[0].id);
        if (!amount && activeServices[0].price !== undefined) {
          setAmount(String(activeServices[0].price));
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar serviços para recebimento:', e);
    } finally {
      setLoadingServices(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [appointmentId, initialServiceId]);

  // Fecha o popover ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showServiceOnboarding &&
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        serviceFieldRef.current &&
        !serviceFieldRef.current.contains(event.target as Node)
      ) {
        setShowServiceOnboarding(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showServiceOnboarding]);

  const handleSelectService = (serviceId: string) => {
    setSelectedServiceId(serviceId);
    setShowServiceOnboarding(false);
    const found = services.find(s => s.id === serviceId);
    if (found && found.price !== undefined && status !== 'exempt') {
      setAmount(String(found.price));
    }
  };

  const handleServiceCreated = async (created: { id: string; name: string; price?: number }) => {
    setIsNewServiceModalOpen(false);
    setShowServiceOnboarding(false);
    try {
      const servicesRes = await ApiClient.get<Service[]>('/v1/services');
      const activeServices = (servicesRes || []).filter(s => s.active !== 0);
      setServices(activeServices);
      setSelectedServiceId(created.id);
      if (created.price !== undefined && status !== 'exempt') {
        setAmount(String(created.price));
      }
    } catch {
      setSelectedServiceId(created.id);
      if (created.price !== undefined && status !== 'exempt') {
        setAmount(String(created.price));
      }
    }
  };

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    // Se nenhum serviço estiver selecionado ou cadastrado, abre o onboarding profissional flutuante
    if (!selectedServiceId) {
      setShowServiceOnboarding(true);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const parsedAmount = status === 'exempt' ? 0 : Number(String(amount).replace(',', '.'));
      const result = await ApiClient.post(`/v1/appointments/${appointmentId}/finish`, {
        serviceId: selectedServiceId,
        payment: {
          amount: parsedAmount,
          paymentMethod: method,
          status,
          notes,
          serviceId: selectedServiceId
        }
      });

      window.dispatchEvent(new CustomEvent('appointment-updated', { detail: { appointmentId, status: 'completed' } }));
      window.dispatchEvent(new Event('refresh-appointments'));
      window.dispatchEvent(new CustomEvent('zemda-appointment-updated'));
      onFinished(result);
    } catch (err: any) {
      setError(err.message || 'Não foi possível registrar o recebimento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 mobile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-title"
      >
        <form
          onSubmit={confirm}
          className="bg-white rounded-3xl p-6 sm:p-7 w-full max-w-lg space-y-4 shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in-95 duration-200"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 pb-1 border-b border-slate-100">
            <div>
              <h2 id="receipt-title" className="text-xl font-black text-slate-900 tracking-tight">
                Recebimento do atendimento
              </h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Prontuário salvo com sucesso. Selecione o serviço realizado e confirme as condições financeiras para finalizar a consulta.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              title="Continuar depois"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Campo: Serviço Realizado */}
          <div ref={serviceFieldRef} className="relative space-y-1">
            <div className="flex items-center justify-between">
              <label htmlFor="consultation-service-select" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                Serviço realizado <span className="text-rose-500">*</span>
              </label>
              {services.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsNewServiceModalOpen(true)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-800 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar serviço
                </button>
              )}
            </div>

            {loadingServices ? (
              <div className="h-10 border border-slate-200 rounded-xl bg-slate-50 flex items-center px-3 text-xs text-slate-400">
                Carregando serviços da clínica...
              </div>
            ) : services.length > 0 ? (
              <select
                id="consultation-service-select"
                aria-label="Serviço realizado"
                value={selectedServiceId}
                onChange={e => handleSelectService(e.target.value)}
                className={`w-full text-xs font-medium border rounded-xl p-2.5 bg-white text-slate-800 transition-colors focus:ring-2 focus:ring-teal-500 focus:outline-none ${
                  !selectedServiceId ? 'border-amber-400 bg-amber-50/20' : 'border-slate-300'
                }`}
              >
                <option value="">Selecione o serviço realizado...</option>
                {services.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.price !== undefined ? `— R$ ${Number(s.price).toFixed(2)}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="border border-dashed border-amber-300 bg-amber-50/50 rounded-xl p-3 flex items-center justify-between gap-3 text-xs">
                <span className="text-amber-800 font-medium">Nenhum serviço cadastrado ainda.</span>
                <button
                  type="button"
                  onClick={() => setIsNewServiceModalOpen(true)}
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold shadow-xs text-xs flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar serviço
                </button>
              </div>
            )}

            {/* Popover Flutuante de Onboarding quando tenta confirmar sem serviço */}
            {showServiceOnboarding && (
              <div
                ref={popoverRef}
                data-testid="service-onboarding-popover"
                className="absolute top-full left-0 right-0 sm:right-auto sm:w-96 mt-2 z-[70] bg-white border border-teal-200 rounded-2xl p-4 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150"
              >
                {/* Seta indicativa */}
                <div className="absolute -top-2 left-6 w-3.5 h-3.5 bg-white border-t border-l border-teal-200 transform rotate-45" />

                <div className="flex items-start justify-between gap-2 mb-2 relative">
                  <div className="flex items-center gap-2 text-teal-800 font-bold text-xs">
                    <Sparkles className="w-4 h-4 text-teal-600 shrink-0" />
                    <span>Cadastre seu primeiro serviço</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowServiceOnboarding(false)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 rounded-md"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="text-[11px] text-slate-600 leading-relaxed mb-3">
                  Para registrar corretamente este atendimento no Financeiro, cadastre o serviço realizado. Assim, o Zemda poderá organizar os valores, recebimentos e relatórios da sua clínica.
                </p>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowServiceOnboarding(false)}
                    className="px-2.5 py-1 text-[11px] text-slate-500 hover:text-slate-700 font-medium"
                  >
                    Agora não
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowServiceOnboarding(false);
                      setIsNewServiceModalOpen(true);
                    }}
                    className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar serviço
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Valor do atendimento */}
          <label className="block text-xs font-bold text-slate-700 space-y-1">
            <span>Valor do atendimento (R$)</span>
            <input
              aria-label="Valor do atendimento"
              inputMode="decimal"
              required={status !== 'exempt'}
              disabled={status === 'exempt'}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0,00"
              className="w-full text-xs font-medium border border-slate-300 rounded-xl p-2.5 bg-white text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            {/* Forma de pagamento */}
            <label className="block text-xs font-bold text-slate-700 space-y-1">
              <span>Forma de pagamento</span>
              <select
                aria-label="Forma de pagamento"
                value={method}
                onChange={e => setMethod(e.target.value)}
                className="w-full text-xs font-medium border border-slate-300 rounded-xl p-2.5 bg-white text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
              >
                <option value="pix">PIX</option>
                <option value="cash">Dinheiro</option>
                <option value="credit_card">Cartão de Crédito</option>
                <option value="debit_card">Cartão de Débito</option>
                <option value="insurance">Convênio</option>
                <option value="other">Outro</option>
              </select>
            </label>

            {/* Status do recebimento */}
            <label className="block text-xs font-bold text-slate-700 space-y-1">
              <span>Status</span>
              <select
                aria-label="Status do recebimento"
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full text-xs font-medium border border-slate-300 rounded-xl p-2.5 bg-white text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
              >
                <option value="paid">Pago</option>
                <option value="pending">Pendente</option>
                <option value="exempt">Isento</option>
              </select>
            </label>
          </div>

          {/* Observação */}
          <label className="block text-xs font-bold text-slate-700 space-y-1">
            <span>Observação (opcional)</span>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Anotações sobre parcelas, descontos ou convênio..."
              className="w-full text-xs font-normal border border-slate-300 rounded-xl p-2.5 bg-white text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
          </label>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Continuar depois
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-xl px-5 py-2.5 text-xs shadow-md shadow-teal-700/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Registrando…' : 'Confirmar e finalizar'}
            </button>
          </div>
        </form>
      </div>

      {/* Modal de Cadastro Rápido de Serviço */}
      <NewServiceModal
        isOpen={isNewServiceModalOpen}
        initialProfessionalId={professionalId}
        professionals={professionals}
        zIndex="z-[80]"
        onClose={() => setIsNewServiceModalOpen(false)}
        onSuccess={handleServiceCreated}
      />
    </>
  );
}
