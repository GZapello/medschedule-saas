import React, { useEffect, useState, useCallback } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { isValidPhoneNumber, generateWhatsAppUrl } from '../../utils/phone.utils';
import { WhatsAppIcon } from '../common/WhatsAppReminderModal';
import {
  X,
  DollarSign,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Receipt,
  CalendarClock,
  RefreshCw,
  Plus,
  PauseCircle,
  PlayCircle
} from 'lucide-react';

interface CollectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
  initialTab?: 'collections' | 'recurring';
}

const formatCurrency = (val: number | string | undefined) => {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
};

const formatBrDate = (isoDate?: string | null) => {
  if (!isoDate) return '-';
  const clean = String(isoDate).slice(0, 10);
  const [y, m, d] = clean.split('-');
  return d && m && y ? `${d}/${m}/${y}` : clean;
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  overdue: { label: 'Vencida', className: 'bg-rose-100 text-rose-800 border-rose-200' },
  due_soon: { label: 'Vence em breve', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  pending: { label: 'Pendente', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  paid: { label: 'Paga', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  exempt: { label: 'Isenta', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  refunded: { label: 'Estornada', className: 'bg-slate-100 text-slate-600 border-slate-200' }
};

export const CollectionsModal: React.FC<CollectionsModalProps> = ({
  isOpen,
  onClose,
  onUpdated,
  initialTab = 'collections'
}) => {
  const { currentTenant, clientTermLabel } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'collections' | 'recurring'>(initialTab);
  const [loading, setLoading] = useState<boolean>(false);
  const [collections, setCollections] = useState<any[]>([]);
  const [canManageCollections, setCanManageCollections] = useState<boolean>(false);
  const [summary, setSummary] = useState<any>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [modalityFilter, setModalityFilter] = useState<string>('');
  const [methodChoiceById, setMethodChoiceById] = useState<Record<string, string>>({});
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [editingPhonePatientId, setEditingPhonePatientId] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState<string>('');
  const [savingPhone, setSavingPhone] = useState<boolean>(false);

  // Recurring monthly plans
  const [plans, setPlans] = useState<any[]>([]);
  const [loadingPlans, setLoadingPlans] = useState<boolean>(false);
  const [generatingMonth, setGeneratingMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [showNewPlanForm, setShowNewPlanForm] = useState<boolean>(false);

  // Dropdown options for new plan
  const [patients, setPatients] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [professionals, setProfessionals] = useState<any[]>([]);

  // New plan fields
  const [planPatientId, setPlanPatientId] = useState<string>('');
  const [planServiceId, setPlanServiceId] = useState<string>('');
  const [planProfessionalId, setPlanProfessionalId] = useState<string>('');
  const [planTitle, setPlanTitle] = useState<string>('Mensalidade');
  const [planAmount, setPlanAmount] = useState<string>('');
  const [planFrequency, setPlanFrequency] = useState<'monthly' | 'quarterly' | 'semiannual' | 'annual'>('monthly');
  const [planDueDay, setPlanDueDay] = useState<number>(10);
  const [planPaymentMethod, setPlanPaymentMethod] = useState<string>('pix');
  const [planGenerateNow, setPlanGenerateNow] = useState<boolean>(true);
  const [savingPlan, setSavingPlan] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const fetchCollectionsAndSummary = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (modalityFilter.trim()) params.set('modality', modalityFilter.trim());

      const [sumRes, colRes] = await Promise.all([
        ApiClient.get<any>('/v1/financial/collections/summary'),
        ApiClient.get<any>(`/v1/financial/collections?${params.toString()}`)
      ]);
      setSummary(sumRes);
      setCollections(colRes?.collections || []);
      setCanManageCollections(Boolean(colRes?.canManageCollections));
    } catch (err: any) {
      showToast(err?.message || 'Erro ao carregar cobranças', 'error');
    } finally {
      setLoading(false);
    }
  }, [isOpen, statusFilter, searchTerm, startDate, endDate, modalityFilter, showToast]);

  const fetchPlans = useCallback(async () => {
    if (!isOpen) return;
    setLoadingPlans(true);
    try {
      const res = await ApiClient.get<any>('/v1/financial/recurring-plans');
      setPlans(res?.plans || []);
      if (typeof res?.canManageCollections === 'boolean') {
        setCanManageCollections(res.canManageCollections);
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao carregar planos mensais', 'error');
    } finally {
      setLoadingPlans(false);
    }
  }, [isOpen, showToast]);

  useEffect(() => {
    if (isOpen) {
      fetchCollectionsAndSummary();
      fetchPlans();
    }
  }, [isOpen, fetchCollectionsAndSummary, fetchPlans]);

  useEffect(() => {
    if (showNewPlanForm && patients.length === 0) {
      Promise.all([
        ApiClient.get<any>('/v1/patients').catch(() => []),
        ApiClient.get<any>('/v1/services').catch(() => []),
        ApiClient.get<any>('/v1/professionals').catch(() => [])
      ]).then(([patRes, svcRes, profRes]) => {
        setPatients(Array.isArray(patRes) ? patRes : patRes?.patients || []);
        setServices(Array.isArray(svcRes) ? svcRes : svcRes?.services || []);
        setProfessionals(Array.isArray(profRes) ? profRes : profRes?.professionals || []);
      });
    }
  }, [showNewPlanForm, patients.length]);

  if (!isOpen) return null;

  const handleMarkPaid = async (paymentId: string, defaultMethod: string) => {
    setMarkingPaidId(paymentId);
    try {
      const paymentMethod = methodChoiceById[paymentId] || defaultMethod || 'pix';
      await ApiClient.post(`/v1/financial/collections/${paymentId}/mark-paid`, {
        paymentMethod
      });
      showToast('Cobrança marcada como paga!', 'success');
      await fetchCollectionsAndSummary();
      onUpdated?.();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao registrar recebimento', 'error');
    } finally {
      setMarkingPaidId(null);
    }
  };

  const resolveItemPhone = (item: any): string => {
    if (isValidPhoneNumber(item.patient_whatsapp)) return item.patient_whatsapp;
    if (isValidPhoneNumber(item.patient_phone)) return item.patient_phone;
    if (isValidPhoneNumber(item.patient_contact_phone)) return item.patient_contact_phone;
    return '';
  };

  const handleSaveMissingPhone = async (patientId: string) => {
    if (!isValidPhoneNumber(phoneDraft)) {
      showToast('Informe um WhatsApp/telefone brasileiro válido com DDD (10 ou 11 dígitos).', 'error');
      return;
    }
    try {
      setSavingPhone(true);
      await ApiClient.put(`/v1/patients/${patientId}`, {
        whatsapp: phoneDraft.trim(),
        phone: phoneDraft.trim()
      });
      showToast('Contato atualizado com sucesso!', 'success');
      setEditingPhonePatientId(null);
      setPhoneDraft('');
      await fetchCollectionsAndSummary();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao salvar contato do aluno.', 'error');
    } finally {
      setSavingPhone(false);
    }
  };

  const handleManualWhatsAppCharge = (item: any) => {
    const validPhone = resolveItemPhone(item);
    if (!validPhone) {
      showToast('Telefone inválido ou ausente para abrir WhatsApp manual', 'error');
      return;
    }
    const firstName = String(item.patient_name || clientTermLabel).trim().split(/\s+/)[0];
    const clinicName = (currentTenant?.trade_name || currentTenant?.name || 'nosso estabelecimento').trim();
    const label = item.package_name || item.service_name || item.recurring_plan_title || item.notes || 'mensalidade / atendimento';
    const dueStr = formatBrDate(item.effective_due_date);
    const valStr = formatCurrency(item.amount);
    const msg = `Olá, ${firstName}! Tudo bem?\nAqui é da equipe ${clinicName}.\nPassando para lembrar sobre sua cobrança referente a ${label}, no valor de ${valStr}, com vencimento em ${dueStr}.\nQualquer dúvida, estamos à disposição!`;
    const url = generateWhatsAppUrl(validPhone, msg);
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      showToast('Telefone inválido para abrir WhatsApp manual', 'error');
    }
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = parseFloat(planAmount);
    if (!planPatientId || Number.isNaN(numericAmount) || numericAmount < 0 || !planTitle.trim()) {
      showToast(`Selecione o ${clientTermLabel.toLowerCase()}, informe o título e um valor válido`, 'error');
      return;
    }
    setSavingPlan(true);
    try {
      await ApiClient.post('/v1/financial/recurring-plans', {
        patientId: planPatientId,
        serviceId: planServiceId || undefined,
        professionalId: planProfessionalId || undefined,
        title: planTitle.trim(),
        amount: numericAmount,
        billingFrequency: planFrequency,
        dueDay: planDueDay,
        paymentMethod: planPaymentMethod,
        generateCurrentMonth: planGenerateNow
      });
      showToast('Plano periódico cadastrado com sucesso!', 'success');
      setShowNewPlanForm(false);
      setPlanPatientId('');
      setPlanAmount('');
      setPlanFrequency('monthly');
      await Promise.all([fetchPlans(), fetchCollectionsAndSummary()]);
      onUpdated?.();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao criar mensalidade recorrente', 'error');
    } finally {
      setSavingPlan(false);
    }
  };

  const handleTogglePlanStatus = async (plan: any) => {
    const nextStatus = plan.status === 'active' ? 'paused' : 'active';
    try {
      await ApiClient.put(`/v1/financial/recurring-plans/${plan.id}`, { status: nextStatus });
      showToast(nextStatus === 'active' ? 'Plano reativado' : 'Plano pausado', 'info');
      await fetchPlans();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao atualizar plano', 'error');
    }
  };

  const handleGenerateMonth = async () => {
    setIsGenerating(true);
    try {
      const res = await ApiClient.post<any>('/v1/financial/recurring-plans/generate', {
        competenceMonth: generatingMonth
      });
      showToast(
        `${res?.generatedCount ?? 0} cobrança(s) gerada(s) para ${res?.competenceMonth || generatingMonth} (${res?.skippedExistingCount ?? 0} já existente(s)).`,
        'success'
      );
      await fetchCollectionsAndSummary();
      onUpdated?.();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao gerar mensalidades', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50/70">
          <div>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-teal-600" />
              Central de Cobranças & Mensalidades
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Acompanhamento de vencimentos, quitações, recibos e envio manual de cobrança via WhatsApp.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary KPIs */}
        {summary && (
          <div className="px-4 sm:px-6 py-3 bg-white border-b border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-200/80">
              <span className="text-[10px] font-bold uppercase text-rose-700">Vencidas ({summary.overdueCount || 0})</span>
              <div className="text-sm sm:text-base font-extrabold text-rose-800">{formatCurrency(summary.overdueAmount)}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/80">
              <span className="text-[10px] font-bold uppercase text-amber-700">Vencem em breve ({summary.dueSoonCount || 0})</span>
              <div className="text-sm sm:text-base font-extrabold text-amber-800">{formatCurrency(summary.dueSoonAmount)}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-200/80">
              <span className="text-[10px] font-bold uppercase text-indigo-700">A vencer ({summary.pendingCount || 0})</span>
              <div className="text-sm sm:text-base font-extrabold text-indigo-800">{formatCurrency(summary.pendingAmount)}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
              <span className="text-[10px] font-bold uppercase text-emerald-700">Recebido no mês ({summary.paidPeriodCount || 0})</span>
              <div className="text-sm sm:text-base font-extrabold text-emerald-800">{formatCurrency(summary.paidPeriodAmount)}</div>
            </div>
          </div>
        )}

        {/* Sub-tabs */}
        <div className="px-4 sm:px-6 pt-3 border-b border-slate-200 flex items-center gap-2 bg-white">
          <button
            type="button"
            onClick={() => setActiveTab('collections')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl border-b-2 transition-all cursor-pointer ${
              activeTab === 'collections'
                ? 'border-teal-600 text-teal-700 bg-teal-50/40'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Cobranças & Recebimentos
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('recurring')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'recurring'
                ? 'border-teal-600 text-teal-700 bg-teal-50/40'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5" />
            Mensalidades Recorrentes ({plans.filter(p => p.status === 'active').length})
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {activeTab === 'collections' ? (
            <>
              {/* Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                <div className="relative lg:col-span-2">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder={`Buscar ${clientTermLabel.toLowerCase()}, serviço ou profissional...`}
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-xl bg-slate-50"
                >
                  <option value="open">Em aberto (Todas pendências)</option>
                  <option value="overdue">Somente vencidas</option>
                  <option value="due_soon">Vencem em até 7 dias</option>
                  <option value="pending">Pendentes (a vencer)</option>
                  <option value="paid">Pagas / Liquidadas</option>
                  <option value="all">Todas (exceto estornadas)</option>
                </select>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  title="Data inicial de vencimento"
                  className="px-2.5 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50"
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  title="Data final de vencimento"
                  className="px-2.5 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50"
                />
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <input
                  type="text"
                  value={modalityFilter}
                  onChange={e => setModalityFilter(e.target.value)}
                  placeholder="Filtrar modalidade (ex: Pilates, Dança)..."
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50 w-full sm:w-64"
                />
                <button
                  type="button"
                  onClick={fetchCollectionsAndSummary}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Atualizar
                </button>
              </div>

              {/* Collections List */}
              {loading ? (
                <div className="py-10 text-center text-xs text-slate-400">Carregando cobranças...</div>
              ) : collections.length === 0 ? (
                <div className="py-10 text-center border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
                  Nenhuma cobrança encontrada com os filtros selecionados.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {collections.map((item: any) => {
                    const badge = STATUS_BADGE[item.derived_status] || STATUS_BADGE.pending;
                    const isOpenCharge = ['overdue', 'due_soon', 'pending'].includes(item.derived_status);
                    const validContactPhone = resolveItemPhone(item);
                    const hasPhone = Boolean(validContactPhone);

                    return (
                      <div
                        key={item.id}
                        className="p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-slate-900 truncate">{item.patient_name}</span>
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${badge.className}`}>
                              {badge.label}
                            </span>
                            {item.is_recurring && (
                              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                                Mensalidade {item.competence_month || ''}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="font-medium text-slate-700">
                              {item.service_name || item.notes || 'Cobrança avulsa'}
                            </span>
                            {item.modality_category && (
                              <span className="text-slate-400">• {item.modality_category}</span>
                            )}
                            {item.professional_name && (
                              <span className="text-slate-400">• {item.professional_name}</span>
                            )}
                            <span className="text-slate-500">• Venc: {formatBrDate(item.effective_due_date)}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 justify-between md:justify-end shrink-0">
                          <div className="text-base font-extrabold text-slate-900 mr-1">
                            {formatCurrency(item.amount)}
                          </div>

                          {isOpenCharge && hasPhone && (
                            <button
                              type="button"
                              onClick={() => handleManualWhatsAppCharge(item)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs text-xs font-bold cursor-pointer transition-colors"
                              title="Abrir conversa manual no WhatsApp com mensagem de cobrança"
                            >
                              <WhatsAppIcon className="w-3.5 h-3.5" />
                              Cobrar via WhatsApp
                            </button>
                          )}

                          {isOpenCharge && !hasPhone && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 text-slate-500 border border-slate-200 text-[11px] font-semibold"
                                title="Aluno sem telefone/WhatsApp válido cadastrado"
                              >
                                WhatsApp indisponível
                              </span>
                              {canManageCollections && editingPhonePatientId !== item.patient_id && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingPhonePatientId(item.patient_id);
                                    setPhoneDraft(item.patient_whatsapp || item.patient_phone || '');
                                  }}
                                  className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold cursor-pointer"
                                >
                                  Completar contato
                                </button>
                              )}
                              {canManageCollections && editingPhonePatientId === item.patient_id && (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="tel"
                                    value={phoneDraft}
                                    onChange={e => setPhoneDraft(e.target.value)}
                                    placeholder="(11) 99999-9999"
                                    className="w-32 px-2 py-1 text-xs border border-amber-300 rounded-lg bg-white"
                                  />
                                  <button
                                    type="button"
                                    disabled={savingPhone}
                                    onClick={() => handleSaveMissingPhone(item.patient_id)}
                                    className="px-2 py-1 text-[11px] font-bold bg-indigo-600 text-white rounded-lg cursor-pointer disabled:opacity-50"
                                  >
                                    {savingPhone ? '...' : 'Salvar'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingPhonePatientId(null)}
                                    className="px-1.5 py-1 text-[11px] text-slate-500 hover:text-slate-700 cursor-pointer"
                                  >
                                    ✕
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {canManageCollections && isOpenCharge && (
                            <div className="flex items-center gap-1.5">
                              <select
                                value={methodChoiceById[item.id] || item.payment_method || 'pix'}
                                onChange={e => setMethodChoiceById(prev => ({ ...prev, [item.id]: e.target.value }))}
                                className="px-2 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50"
                                aria-label="Forma de pagamento"
                              >
                                <option value="pix">PIX</option>
                                <option value="credit_card">Cartão Créd.</option>
                                <option value="debit_card">Cartão Déb.</option>
                                <option value="cash">Dinheiro</option>
                              </select>
                              <button
                                type="button"
                                disabled={markingPaidId === item.id}
                                onClick={() => handleMarkPaid(item.id, item.payment_method)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {markingPaidId === item.id ? 'Salvando...' : 'Marcar pago'}
                              </button>
                            </div>
                          )}

                          {item.raw_status === 'paid' && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: 'receipts' } }));
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-700 text-xs font-bold cursor-pointer"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              {item.receipt_number ? `Recibo ${item.receipt_number}` : 'Recibo'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Recurring Plans Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <div>
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                    Geração Mensal Idempotente
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Gera cobranças pendentes apenas para planos ativos ainda não faturados na competência.
                  </p>
                </div>
                {canManageCollections && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="month"
                      value={generatingMonth}
                      onChange={e => setGeneratingMonth(e.target.value)}
                      className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-xl bg-white"
                    />
                    <button
                      type="button"
                      disabled={isGenerating}
                      onClick={handleGenerateMonth}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      {isGenerating ? 'Gerando...' : 'Gerar competência'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNewPlanForm(prev => !prev)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Novo Plano Mensal
                    </button>
                  </div>
                )}
              </div>

              {showNewPlanForm && canManageCollections && (
                <form onSubmit={handleCreatePlan} className="p-4 rounded-2xl border border-teal-200 bg-teal-50/40 space-y-3">
                  <h5 className="font-bold text-xs text-slate-900">Cadastrar Mensalidade Recorrente</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">{clientTermLabel} *</label>
                      <select
                        required
                        value={planPatientId}
                        onChange={e => setPlanPatientId(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white"
                      >
                        <option value="">Selecione...</option>
                        {patients.map((p: any) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Descrição / Título *</label>
                      <input
                        type="text"
                        required
                        value={planTitle}
                        onChange={e => setPlanTitle(e.target.value)}
                        placeholder="Ex: Mensalidade Pilates 2x/semana"
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Valor por Período (R$) *</label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          required
                          value={planAmount}
                          onChange={e => setPlanAmount(e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Periodicidade *</label>
                        <select
                          value={planFrequency}
                          onChange={e => setPlanFrequency(e.target.value as any)}
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white"
                        >
                          <option value="monthly">Mensal</option>
                          <option value="quarterly">Trimestral (3 meses)</option>
                          <option value="semiannual">Semestral (6 meses)</option>
                          <option value="annual">Anual (12 meses)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Serviço / Modalidade</label>
                      <select
                        value={planServiceId}
                        onChange={e => setPlanServiceId(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white"
                      >
                        <option value="">Opcional...</option>
                        {services.map((s: any) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Profissional / Instrutor</label>
                      <select
                        value={planProfessionalId}
                        onChange={e => setPlanProfessionalId(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white"
                      >
                        <option value="">Opcional...</option>
                        {professionals.map((pr: any) => (
                          <option key={pr.id} value={pr.id}>{pr.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Dia Venc.</label>
                        <input
                          type="number"
                          min={1}
                          max={28}
                          value={planDueDay}
                          onChange={e => setPlanDueDay(Math.min(28, Math.max(1, Number(e.target.value) || 10)))}
                          className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-xl bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Forma</label>
                        <select
                          value={planPaymentMethod}
                          onChange={e => setPlanPaymentMethod(e.target.value)}
                          className="w-full px-2 py-2 text-xs border border-slate-200 rounded-xl bg-white"
                        >
                          <option value="pix">PIX</option>
                          <option value="credit_card">Cartão Créd.</option>
                          <option value="debit_card">Cartão Déb.</option>
                          <option value="cash">Dinheiro</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={planGenerateNow}
                        onChange={e => setPlanGenerateNow(e.target.checked)}
                        className="rounded border-slate-300 text-teal-600"
                      />
                      Gerar cobrança do mês atual imediatamente
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowNewPlanForm(false)}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white rounded-xl cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={savingPlan}
                        className="px-4 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl cursor-pointer disabled:opacity-50"
                      >
                        {savingPlan ? 'Salvando...' : 'Salvar Plano'}
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {loadingPlans ? (
                <div className="py-10 text-center text-xs text-slate-400">Carregando mensalidades recorrentes...</div>
              ) : plans.length === 0 ? (
                <div className="py-10 text-center border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
                  Nenhum plano mensal cadastrado neste estabelecimento.
                </div>
              ) : (
                <div className="space-y-2">
                  {plans.map((plan: any) => (
                    <div
                      key={plan.id}
                      className="p-3.5 rounded-2xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-slate-900">{plan.patient_name}</span>
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                              plan.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {plan.status === 'active' ? 'Ativo' : plan.status === 'paused' ? 'Pausado' : 'Encerrado'}
                          </span>
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {plan.billing_frequency === 'quarterly'
                              ? 'Trimestral'
                              : plan.billing_frequency === 'semiannual'
                                ? 'Semestral'
                                : plan.billing_frequency === 'annual'
                                  ? 'Anual'
                                  : 'Mensal'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          <span className="font-semibold">{plan.title}</span>
                          {plan.service_name ? ` • ${plan.service_name}` : ''}
                          {` • Vencimento todo dia ${plan.due_day}`}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-extrabold text-slate-900">{formatCurrency(plan.amount)}</span>
                        {canManageCollections && plan.status !== 'ended' && plan.status !== 'cancelled' && (
                          <button
                            type="button"
                            onClick={() => handleTogglePlanStatus(plan)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                          >
                            {plan.status === 'active' ? (
                              <><PauseCircle className="w-3.5 h-3.5 text-amber-600" /> Pausar</>
                            ) : (
                              <><PlayCircle className="w-3.5 h-3.5 text-emerald-600" /> Reativar</>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
