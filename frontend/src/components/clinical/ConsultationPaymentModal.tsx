import React, { useState, useEffect, useRef } from 'react';
import { ApiClient } from '../../api/client';
import { Service, Professional } from '../../types';
import { NewServiceModal } from '../services/NewServiceModal';
import { Sparkles, Plus, X, AlertCircle } from 'lucide-react';

export interface ConsultationPaymentModalProps {
  appointmentId: string;
  initialPayment?: any;
  initialServiceId?: string;
  professionalId?: string;
  onFinished: (result: any) => void;
  onClose: () => void;
}

const ADDITIONAL_REASONS = [
  'Procedimento complementar',
  'Material ou insumo adicional',
  'Atendimento prolongado',
  'Serviço complementar',
  'Outro motivo'
];

const DISCOUNT_REASONS = [
  'Desconto comercial',
  'Convênio ou parceria',
  'Pacote de atendimentos',
  'Ajuste autorizado',
  'Cortesia parcial',
  'Outro motivo'
];

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
  const [selectedServiceId, setSelectedServiceId] = useState<string>(
    initialServiceId || initialPayment?.serviceId || initialPayment?.service_id || ''
  );
  const [isNewServiceModalOpen, setIsNewServiceModalOpen] = useState<boolean>(false);
  const [showServiceOnboarding, setShowServiceOnboarding] = useState<boolean>(false);

  // Valores financeiros estruturados
  const [baseAmount, setBaseAmount] = useState<string>(() => {
    if (initialPayment?.baseAmount !== undefined && initialPayment?.baseAmount !== null) {
      return Number(initialPayment.baseAmount).toFixed(2).replace('.', ',');
    }
    if (initialPayment?.base_amount !== undefined && initialPayment?.base_amount !== null) {
      return Number(initialPayment.base_amount).toFixed(2).replace('.', ',');
    }
    if (initialPayment?.amount !== undefined && initialPayment?.amount !== null && Number(initialPayment.amount) > 0) {
      return Number(initialPayment.amount).toFixed(2).replace('.', ',');
    }
    return '';
  });

  const [additionalAmount, setAdditionalAmount] = useState<string>(() => {
    const raw = initialPayment?.additionalAmount ?? initialPayment?.additional_amount;
    if (raw !== undefined && raw !== null && Number(raw) > 0) {
      return Number(raw).toFixed(2).replace('.', ',');
    }
    return '0,00';
  });

  const [additionalReason, setAdditionalReason] = useState<string>(() => {
    const r = initialPayment?.additionalReason || initialPayment?.additional_reason || '';
    if (ADDITIONAL_REASONS.includes(r)) return r;
    if (r) return 'Outro motivo';
    return '';
  });

  const [additionalReasonCustom, setAdditionalReasonCustom] = useState<string>(() => {
    const r = initialPayment?.additionalReason || initialPayment?.additional_reason || '';
    if (r && !ADDITIONAL_REASONS.slice(0, -1).includes(r)) return r;
    return '';
  });

  const [discountAmount, setDiscountAmount] = useState<string>(() => {
    const raw = initialPayment?.discountAmount ?? initialPayment?.discount_amount;
    if (raw !== undefined && raw !== null && Number(raw) > 0) {
      return Number(raw).toFixed(2).replace('.', ',');
    }
    return '0,00';
  });

  const [discountReason, setDiscountReason] = useState<string>(() => {
    const r = initialPayment?.discountReason || initialPayment?.discount_reason || '';
    if (DISCOUNT_REASONS.includes(r)) return r;
    if (r) return 'Outro motivo';
    return '';
  });

  const [discountReasonCustom, setDiscountReasonCustom] = useState<string>(() => {
    const r = initialPayment?.discountReason || initialPayment?.discount_reason || '';
    if (r && !DISCOUNT_REASONS.slice(0, -1).includes(r)) return r;
    return '';
  });

  const [method, setMethod] = useState<string>(
    initialPayment?.payment_method || initialPayment?.paymentMethod || 'pix'
  );
  const [status, setStatus] = useState<string>(initialPayment?.status || 'pending');
  const [notes, setNotes] = useState<string>(initialPayment?.notes || '');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Rastreia se o usuário já editou manualmente o valor base ou valores para não sobrescrever indevidamente
  const [isUserEdited, setIsUserEdited] = useState<boolean>(() => {
    return Boolean(
      (initialPayment?.base_amount !== undefined && initialPayment?.base_amount !== null) ||
      (initialPayment?.additional_amount !== undefined && Number(initialPayment?.additional_amount) > 0) ||
      (initialPayment?.discount_amount !== undefined && Number(initialPayment?.discount_amount) > 0)
    );
  });

  const popoverRef = useRef<HTMLDivElement>(null);
  const serviceFieldRef = useRef<HTMLDivElement>(null);

  // Auxiliares de conversão monetária
  const parseMoney = (val: string | number | undefined | null): number => {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const cleaned = String(val).replace(/\s/g, '').replace('R$', '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : Math.max(0, num);
  };

  const formatCurrency = (val: number): string => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const numBase = parseMoney(baseAmount);
  const numAdditional = parseMoney(additionalAmount);
  const numDiscount = parseMoney(discountAmount);

  // total = valorBase + valorAdicional - desconto
  const calculatedTotal = status === 'exempt'
    ? 0
    : Math.max(0, Math.round((numBase + numAdditional - numDiscount) * 100) / 100);

  // Carrega serviços e profissionais disponíveis
  const loadData = async () => {
    try {
      setLoadingServices(true);
      const url = professionalId ? `/v1/services?professionalId=${encodeURIComponent(professionalId)}` : '/v1/services';
      const [servicesRes, profsRes] = await Promise.all([
        ApiClient.get<Service[]>(url).catch(() => ApiClient.get<Service[]>('/v1/services').catch(() => [])),
        ApiClient.get<Professional[]>('/v1/professionals').catch(() => [])
      ]);

      const activeServices = (servicesRes || []).filter(s => s.active !== 0);
      setServices(activeServices);
      setProfessionals(profsRes || []);

      const targetId = initialServiceId || selectedServiceId;
      if (targetId && activeServices.some(s => s.id === targetId)) {
        setSelectedServiceId(targetId);
        const match = activeServices.find(s => s.id === targetId);
        if (match && match.price !== undefined && !isUserEdited) {
          setBaseAmount(Number(match.price).toFixed(2).replace('.', ','));
        }
      } else if (!selectedServiceId && activeServices.length === 1) {
        setSelectedServiceId(activeServices[0].id);
        if (activeServices[0].price !== undefined && !isUserEdited) {
          setBaseAmount(Number(activeServices[0].price).toFixed(2).replace('.', ','));
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
  }, [appointmentId, initialServiceId, professionalId]);

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
    if (found && found.price !== undefined) {
      setBaseAmount(Number(found.price).toFixed(2).replace('.', ','));
      setIsUserEdited(false);
    }
  };

  const handleServiceCreated = async (created: { id: string; name: string; price?: number }) => {
    setIsNewServiceModalOpen(false);
    setShowServiceOnboarding(false);
    try {
      const url = professionalId ? `/v1/services?professionalId=${encodeURIComponent(professionalId)}` : '/v1/services';
      const servicesRes = await ApiClient.get<Service[]>(url).catch(() => ApiClient.get<Service[]>('/v1/services'));
      const activeServices = (servicesRes || []).filter(s => s.active !== 0);
      setServices(activeServices);
    } catch {}

    setSelectedServiceId(created.id);
    if (created.price !== undefined) {
      setBaseAmount(Number(created.price).toFixed(2).replace('.', ','));
      setIsUserEdited(false);
    }
  };

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    if (!selectedServiceId) {
      setShowServiceOnboarding(true);
      return;
    }

    const effectiveAdditionalReason = numAdditional > 0
      ? (additionalReason === 'Outro motivo' ? additionalReasonCustom.trim() : additionalReason)
      : null;

    const effectiveDiscountReason = numDiscount > 0
      ? (discountReason === 'Outro motivo' ? discountReasonCustom.trim() : discountReason)
      : null;

    // Validações no frontend
    if (numAdditional > 0 && !effectiveAdditionalReason) {
      setError('A justificativa do valor adicional é obrigatória quando houver acréscimo.');
      return;
    }

    if (numDiscount > 0 && !effectiveDiscountReason) {
      setError('A justificativa do desconto é obrigatória quando houver abatimento.');
      return;
    }

    if (numDiscount > (numBase + numAdditional)) {
      setError('O desconto não pode ser superior ao valor do serviço com adicionais.');
      return;
    }

    if (status !== 'exempt' && calculatedTotal <= 0) {
      setError('O valor total deve ser maior que zero. Para atendimentos gratuitos ou isentos, selecione o status "Isento".');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const result = await ApiClient.post(`/v1/appointments/${appointmentId}/finish`, {
        serviceId: selectedServiceId,
        payment: {
          serviceId: selectedServiceId,
          baseAmount: numBase,
          additionalAmount: numAdditional,
          additionalReason: effectiveAdditionalReason,
          discountAmount: numDiscount,
          discountReason: effectiveDiscountReason,
          amount: calculatedTotal,
          paymentMethod: method,
          status,
          notes
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
        className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 mobile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-title"
      >
        <form
          onSubmit={confirm}
          className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-lg max-h-[90dvh] flex flex-col shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in-95 duration-200 overflow-hidden"
        >
          {/* Header (fixo, shrink-0) */}
          <div className="shrink-0 px-5 sm:px-6 pt-5 pb-3 border-b border-slate-100 flex items-start justify-between gap-3 bg-white">
            <div>
              <h2 id="receipt-title" className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                Recebimento do atendimento
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-relaxed">
                Prontuário salvo com sucesso. Selecione o serviço realizado e confirme as condições financeiras para finalizar a consulta.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
              title="Continuar depois"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Conteúdo Central Rolável */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-5 sm:px-6 py-3.5 space-y-3">
            {/* 1. Serviço Realizado */}
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
                    {s.name} {s.price !== undefined ? `— ${formatCurrency(Number(s.price))}` : ''}
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
                    className="px-2.5 py-1 text-[11px] text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
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

          {/* 2. Valor do serviço */}
          <div className="space-y-1">
            <label htmlFor="service-base-amount" className="block text-xs font-bold text-slate-700">
              Valor do serviço (R$) <span className="text-rose-500">*</span>
            </label>
            <input
              id="service-base-amount"
              aria-label="Valor do serviço"
              inputMode="decimal"
              required={status !== 'exempt'}
              disabled={status === 'exempt'}
              value={baseAmount}
              onChange={e => {
                setBaseAmount(e.target.value);
                setIsUserEdited(true);
              }}
              placeholder="0,00"
              className="w-full text-xs font-medium border border-slate-300 rounded-xl p-2.5 bg-white text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>

          {/* 3. Valor adicional (opcional) */}
          <div className="space-y-2 p-3 bg-slate-50/70 border border-slate-200/80 rounded-2xl">
            <div className="space-y-1">
              <label htmlFor="service-additional-amount" className="block text-xs font-bold text-slate-700">
                Valor adicional (opcional)
              </label>
              <input
                id="service-additional-amount"
                aria-label="Valor adicional"
                inputMode="decimal"
                disabled={status === 'exempt'}
                value={additionalAmount}
                onChange={e => setAdditionalAmount(e.target.value)}
                placeholder="0,00"
                className="w-full text-xs font-medium border border-slate-300 rounded-xl p-2.5 bg-white text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>

            {numAdditional > 0 && status !== 'exempt' && (
              <div className="space-y-2 pt-1 border-t border-slate-200/60 animate-in fade-in duration-150">
                <div className="space-y-1">
                  <label htmlFor="additional-reason-select" className="block text-xs font-bold text-slate-700">
                    Motivo do valor adicional <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="additional-reason-select"
                    aria-label="Motivo do valor adicional"
                    required
                    value={additionalReason}
                    onChange={e => setAdditionalReason(e.target.value)}
                    className="w-full text-xs font-medium border border-slate-300 rounded-xl p-2.5 bg-white text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="">Selecione o motivo do adicional...</option>
                    {ADDITIONAL_REASONS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                {additionalReason === 'Outro motivo' && (
                  <div className="space-y-1">
                    <label htmlFor="additional-reason-custom" className="block text-xs font-bold text-slate-700">
                      Descreva o motivo <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="additional-reason-custom"
                      aria-label="Descreva o motivo do adicional"
                      required
                      value={additionalReasonCustom}
                      onChange={e => setAdditionalReasonCustom(e.target.value)}
                      placeholder="Descreva a razão do acréscimo..."
                      className="w-full text-xs font-medium border border-slate-300 rounded-xl p-2 bg-white text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 4. Desconto (opcional) */}
          <div className="space-y-2 p-3 bg-slate-50/70 border border-slate-200/80 rounded-2xl">
            <div className="space-y-1">
              <label htmlFor="service-discount-amount" className="block text-xs font-bold text-slate-700">
                Desconto (opcional)
              </label>
              <input
                id="service-discount-amount"
                aria-label="Desconto"
                inputMode="decimal"
                disabled={status === 'exempt'}
                value={discountAmount}
                onChange={e => setDiscountAmount(e.target.value)}
                placeholder="0,00"
                className="w-full text-xs font-medium border border-slate-300 rounded-xl p-2.5 bg-white text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>

            {numDiscount > 0 && status !== 'exempt' && (
              <div className="space-y-2 pt-1 border-t border-slate-200/60 animate-in fade-in duration-150">
                <div className="space-y-1">
                  <label htmlFor="discount-reason-select" className="block text-xs font-bold text-slate-700">
                    Motivo do desconto <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="discount-reason-select"
                    aria-label="Motivo do desconto"
                    required
                    value={discountReason}
                    onChange={e => setDiscountReason(e.target.value)}
                    className="w-full text-xs font-medium border border-slate-300 rounded-xl p-2.5 bg-white text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="">Selecione o motivo do desconto...</option>
                    {DISCOUNT_REASONS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                {discountReason === 'Outro motivo' && (
                  <div className="space-y-1">
                    <label htmlFor="discount-reason-custom" className="block text-xs font-bold text-slate-700">
                      Descreva o motivo <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="discount-reason-custom"
                      aria-label="Descreva o motivo do desconto"
                      required
                      value={discountReasonCustom}
                      onChange={e => setDiscountReasonCustom(e.target.value)}
                      placeholder="Descreva a razão do desconto..."
                      className="w-full text-xs font-medium border border-slate-300 rounded-xl p-2 bg-white text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 5. Valor total do atendimento */}
          <div className="p-3.5 bg-teal-50/70 border border-teal-200 rounded-2xl flex items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold text-teal-800 uppercase tracking-wider block">
                Valor total do atendimento
              </span>
              <span className="text-[11px] text-slate-500">
                {status === 'exempt'
                  ? 'Atendimento Isento de cobrança'
                  : `Serviço ${formatCurrency(numBase)} + Adicional ${formatCurrency(numAdditional)} - Desconto ${formatCurrency(numDiscount)}`}
              </span>
            </div>
            <div className="text-right">
              <span className="text-lg font-black text-teal-950 block">
                {status === 'exempt' ? 'Isento' : formatCurrency(calculatedTotal)}
              </span>
            </div>
          </div>

          {/* 6. Forma e Status */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-bold text-slate-700 space-y-1">
              <span>Forma de pagamento</span>
              <select
                aria-label="Forma de pagamento"
                value={method}
                disabled={status === 'exempt'}
                onChange={e => setMethod(e.target.value)}
                className="w-full text-xs font-medium border border-slate-300 rounded-xl p-2.5 bg-white text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
              >
                <option value="pix">PIX</option>
                <option value="cash">Dinheiro</option>
                <option value="credit_card">Cartão de Crédito</option>
                <option value="debit_card">Cartão de Débito</option>
                <option value="insurance">Convênio</option>
                <option value="other">Outro</option>
              </select>
            </label>

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

          {/* 7. Observação */}
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

          </div>

          {/* Rodapé (fixo, shrink-0, sempre visível) */}
          <div className="shrink-0 px-5 sm:px-6 py-3 sm:py-3.5 border-t border-slate-100 bg-white flex items-center justify-end gap-3">
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
