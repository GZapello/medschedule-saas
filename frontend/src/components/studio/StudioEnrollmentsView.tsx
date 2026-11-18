import React, { useState, useEffect, useMemo } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatCurrencyBRL, PLAN_DURATION_LABELS, PlanDurationCode } from '../../utils/establishmentContext';
import { calculateCommercialOptionBreakdown, PAYMENT_PERIODICITY_LABELS, StudioCommercialPriceOption } from '../../utils/studioAccessAndCommercial';
import {
  KeyRound,
  Plus,
  Search,
  RefreshCw,
  CheckCircle2,
  PauseCircle,
  Snowflake,
  XCircle,
  History,
  FileCheck2,
  Calendar,
  CreditCard,
  User,
  Package,
  AlertTriangle,
  X,
  ArrowRightLeft,
  Eye,
  Edit3,
  RotateCw,
  Mail,
  Phone,
  ShieldCheck,
  Clock
} from 'lucide-react';

function formatBrDate(iso?: string | null, fallback = '—'): string {
  if (!iso) return fallback;
  const raw = String(iso).trim().slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(iso);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatBrDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const raw = String(iso).trim();
  const datePart = formatBrDate(raw.slice(0, 10), '');
  const timeMatch = raw.match(/[T ](\d{2}:\d{2})/);
  if (datePart && timeMatch) return `${datePart} às ${timeMatch[1]}`;
  return datePart || raw;
}

function formatBillingCycleLabel(
  paymentPeriodicity?: string | null,
  billingFrequency?: string | null,
  installmentsCount?: number | null
): string {
  const period = String(paymentPeriodicity || '').toLowerCase();
  const freq = String(billingFrequency || '').toLowerCase();
  if (period === 'one_time') return 'Pagamento único';
  if (period === 'installments' && installmentsCount && installmentsCount > 1) {
    return `Parcelado em ${installmentsCount}x`;
  }
  const map: Record<string, string> = {
    monthly: 'Cobrança mensal',
    bimonthly: 'Cobrança bimestral',
    quarterly: 'Cobrança trimestral',
    semiannual: 'Cobrança semestral',
    annual: 'Cobrança anual',
    yearly: 'Cobrança anual',
    custom_total: 'Valor total do contrato'
  };
  return map[period] || map[freq] || 'Cobrança recorrente';
}

const HISTORY_ACTION_LABELS: Record<string, string> = {
  CREATE_ENROLLMENT: 'Matrícula criada',
  ENROLL_PACKAGE_CONTRACT: 'Contrato de pacote criado',
  CONTRACT_APPROVE: 'Matrícula aprovada',
  PACKAGE_CONTRACT_APPROVE: 'Contrato aprovado',
  CONTRACT_FREEZE: 'Contrato congelado',
  PACKAGE_CONTRACT_FREEZE: 'Contrato congelado',
  CONTRACT_SUSPEND: 'Contrato suspenso',
  PACKAGE_CONTRACT_SUSPEND: 'Contrato suspenso',
  CONTRACT_REACTIVATE: 'Contrato reativado',
  PACKAGE_CONTRACT_REACTIVATE: 'Contrato reativado',
  CONTRACT_CANCEL: 'Contrato cancelado',
  PACKAGE_CONTRACT_CANCEL: 'Contrato cancelado',
  CONTRACT_RENEW: 'Contrato renovado',
  PACKAGE_CONTRACT_RENEW: 'Contrato renovado',
  CONTRACT_CHANGE_PLAN: 'Plano alterado',
  PACKAGE_CONTRACT_CHANGE_PLAN: 'Plano alterado',
  UPDATE_CONTRACT: 'Dados do contrato editados',
  DELIVER_PACKAGE_ENTITLEMENT: 'Benefício entregue',
  DELIVER_ENTITLEMENT: 'Benefício entregue'
};

function formatHistoryActionLabel(action?: string | null): string {
  const clean = String(action || '').trim();
  if (!clean) return 'Evento contratual';
  return HISTORY_ACTION_LABELS[clean] || clean.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
}

function sanitizeHistorySummary(summary?: string | null): string {
  if (!summary) return '';
  return String(summary)
    .replace(/\bactive\b/gi, 'ativo')
    .replace(/\bpaused\b/gi, 'suspenso')
    .replace(/\bsuspended\b/gi, 'suspenso')
    .replace(/\bfrozen\b/gi, 'congelado')
    .replace(/\bcancelled\b/gi, 'cancelado')
    .replace(/\brequested\b/gi, 'pendente')
    .replace(/"approve"/g, '"Aprovar"')
    .replace(/"freeze"/g, '"Congelar"')
    .replace(/"suspend"/g, '"Suspender"')
    .replace(/"reactivate"/g, '"Reativar"')
    .replace(/"cancel"/g, '"Cancelar"')
    .replace(/"renew"/g, '"Renovar"')
    .replace(/"change_plan"/g, '"Trocar Plano"');
}

export const StudioEnrollmentsView: React.FC = () => {
  const { showToast } = useToast();
  const { currentUser, isClinicAdmin, isSuperAdmin, isReceptionist, hasPermission } = useAuth();
  const [loading, setLoading] = useState(true);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [serverPerms, setServerPerms] = useState<{
    canViewEnrollments: boolean;
    canViewFinancial: boolean;
    canManageContracts: boolean;
    canDeliverEntitlement: boolean;
  } | null>(null);
  const [summary, setSummary] = useState<any>({
    activeCount: 0,
    futureCount: 0,
    expiredCount: 0,
    suspendedCount: 0,
    requestedCount: 0,
    expiringSoonCount: 0,
    pendingPublicRequestsCount: 0
  });

  const userRole = String(currentUser?.role || '').toLowerCase();
  const isAdminRole = isClinicAdmin || isSuperAdmin || userRole === 'clinic_admin' || userRole === 'superadmin';
  const canViewFinancial = serverPerms
    ? serverPerms.canViewFinancial
    : isAdminRole || hasPermission('view_financial') || hasPermission('manage_financial');
  const canManageContracts = serverPerms
    ? serverPerms.canManageContracts
    : isAdminRole || isReceptionist || userRole === 'receptionist' || hasPermission('manage_contracts') || hasPermission('manage_financial');
  const canDeliverEntitlement = serverPerms
    ? serverPerms.canDeliverEntitlement
    : canManageContracts || userRole === 'professional' || hasPermission('view_attendance');

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [periodFilter, setPeriodFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  // Catálogos auxiliares para Nova Matrícula
  const [students, setStudents] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);

  // Modal Nova Matrícula
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [enrollTargetType, setEnrollTargetType] = useState<'service' | 'package'>('service');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [commercialOptionId, setCommercialOptionId] = useState('');
  const [contractDurationCode, setContractDurationCode] = useState('1_month');
  const [paymentPeriodicity, setPaymentPeriodicity] = useState('monthly');
  const [accessMode, setAccessMode] = useState<'unlimited' | 'limited'>('unlimited');
  const [maxEntriesPerWeek, setMaxEntriesPerWeek] = useState<string>('3');
  const [maxEntriesPerMonth, setMaxEntriesPerMonth] = useState<string>('');
  const [customAmount, setCustomAmount] = useState<string>('');
  const [dueDay, setDueDay] = useState<number>(10);
  const [paymentMethod, setPaymentMethod] = useState<string>('pix');
  const [initialPaymentStatus, setInitialPaymentStatus] = useState<'pending' | 'paid'>('pending');
  const [notes, setNotes] = useState<string>('');

  // Modal Congelamento / Cancelamento / Troca de Plano / Renovação
  const [lifecycleModal, setLifecycleModal] = useState<{
    enrollment: any;
    action: 'freeze' | 'cancel' | 'change_plan' | 'renew';
  } | null>(null);
  const [freezeFrom, setFreezeFrom] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [freezeUntil, setFreezeUntil] = useState<string>(() => new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10));
  const [lifecycleReason, setLifecycleReason] = useState<string>('');
  const [changePlanServiceId, setChangePlanServiceId] = useState<string>('');
  const [changePlanOptionId, setChangePlanOptionId] = useState<string>('');
  const [changePlanAmount, setChangePlanAmount] = useState<string>('');
  const [renewDurationCode, setRenewDurationCode] = useState<string>('1_month');
  const [renewEndDate, setRenewEndDate] = useState<string>('');
  const [renewGenerateCharge, setRenewGenerateCharge] = useState<boolean>(true);
  const [renewMarkPaid, setRenewMarkPaid] = useState<boolean>(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Modal Detalhamento Completo
  const [detailModal, setDetailModal] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Modal Editar Contrato
  const [editModal, setEditModal] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<{
    title: string;
    dueDay: number;
    endDate: string;
    autoRenew: boolean;
    notes: string;
    accessMode: 'unlimited' | 'limited';
    maxEntriesPerWeek: string;
    maxEntriesPerMonth: string;
  }>({
    title: '',
    dueDay: 10,
    endDate: '',
    autoRenew: false,
    notes: '',
    accessMode: 'unlimited',
    maxEntriesPerWeek: '',
    maxEntriesPerMonth: ''
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Modal Histórico
  const [historyModal, setHistoryModal] = useState<{ enrollment: any; items: any[] } | null>(null);

  const fetchEnrollments = async (overrideSearch?: string) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (kindFilter !== 'all') params.set('kind', kindFilter);
      if (serviceFilter !== 'all') params.set('serviceId', serviceFilter);
      if (periodFilter !== 'all') params.set('period', periodFilter);
      const q = overrideSearch !== undefined ? overrideSearch : search;
      if (q.trim()) params.set('search', q.trim());

      const res = await ApiClient.get<any>(`/v1/studio/enrollments?${params.toString()}`);
      setEnrollments(Array.isArray(res?.enrollments) ? res.enrollments : []);
      setPendingRequests(Array.isArray(res?.pendingRequests) ? res.pendingRequests : []);
      if (res?.permissions) setServerPerms(res.permissions);
      if (res?.summary) setSummary(res.summary);
    } catch (err: any) {
      showToast(err?.message || 'Erro ao carregar matrículas e contratos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchCatalogs = async () => {
    try {
      const [patRes, srvRes, pkgRes] = await Promise.all([
        ApiClient.get<any[]>('/v1/patients').catch(() => []),
        ApiClient.get<any[]>('/v1/services').catch(() => []),
        ApiClient.get<{ packages: any[] }>('/v1/packages').catch(() => ({ packages: [] }))
      ]);
      setStudents(Array.isArray(patRes) ? patRes : []);
      const activeServices = (Array.isArray(srvRes) ? srvRes : []).filter(s => s.active === 1);
      setServices(activeServices);
      setPackages(Array.isArray(pkgRes?.packages) ? pkgRes.packages : []);
      if (activeServices.length > 0 && !selectedServiceId) {
        setSelectedServiceId(activeServices[0].id);
      }
      if (Array.isArray(pkgRes?.packages) && pkgRes.packages.length > 0 && !selectedPackageId) {
        setSelectedPackageId(pkgRes.packages[0].id);
      }
    } catch {}
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEnrollments();
    }, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [statusFilter, kindFilter, serviceFilter, periodFilter, search]);

  useEffect(() => {
    fetchCatalogs();
  }, []);

  const selectedServiceObj = useMemo(
    () => services.find(s => s.id === selectedServiceId) || null,
    [services, selectedServiceId]
  );
  const commercialOptions: StudioCommercialPriceOption[] =
    selectedServiceObj?.commercial_price_options?.filter((option: StudioCommercialPriceOption) => option.active) || [];
  const commercialOption = commercialOptions.find(option => option.id === commercialOptionId);
  const commercialQuote = commercialOption ? calculateCommercialOptionBreakdown(commercialOption) : null;

  useEffect(() => {
    if (selectedServiceObj) {
      setCommercialOptionId('');
      const defPrice = Number(selectedServiceObj.periodic_price) > 0
        ? selectedServiceObj.periodic_price
        : selectedServiceObj.price;
      setCustomAmount(String(Number(defPrice || 0).toFixed(2)));
      if (selectedServiceObj.access_config) {
        setAccessMode(selectedServiceObj.access_config.accessMode === 'limited' ? 'limited' : 'unlimited');
        if (selectedServiceObj.access_config.maxEntriesPerWeek) {
          setMaxEntriesPerWeek(String(selectedServiceObj.access_config.maxEntriesPerWeek));
        }
      }
    }
  }, [selectedServiceObj]);

  const handleCreateEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId) {
      showToast('Selecione o aluno para realizar a matrícula.', 'error');
      return;
    }
    if (enrollTargetType === 'service' && !selectedServiceId) {
      showToast('Selecione o plano ou serviço.', 'error');
      return;
    }
    if (enrollTargetType === 'package' && !selectedPackageId) {
      showToast('Selecione o pacote combinado.', 'error');
      return;
    }
    if (enrollTargetType === 'service' && commercialOptions.length && !commercialOption) {
      showToast('Selecione uma opção comercial do serviço.', 'error');
      return;
    }

    try {
      setCreating(true);
      const isAccessSrv = selectedServiceObj?.studio_service_type === 'facility_access';
      const useOption = enrollTargetType === 'service' && Boolean(commercialOption);
      await ApiClient.post('/v1/studio/enrollments', {
        studentId: selectedStudentId,
        serviceId: enrollTargetType === 'service' ? selectedServiceId : null,
        packageId: enrollTargetType === 'package' ? selectedPackageId : null,
        contractKind: enrollTargetType === 'package'
          ? 'combined_package'
          : (isAccessSrv ? 'access_plan' : selectedServiceObj?.studio_service_type === 'non_scheduled' ? 'deliverable' : 'scheduled_plan'),
        commercialOptionId: useOption ? commercialOption?.id : undefined,
        contractDurationCode: useOption ? undefined : contractDurationCode,
        paymentPeriodicity: useOption ? undefined : paymentPeriodicity,
        accessMode: !useOption && isAccessSrv ? accessMode : undefined,
        maxEntriesPerWeek: useOption ? undefined : isAccessSrv && accessMode === 'limited' && maxEntriesPerWeek ? Number(maxEntriesPerWeek) : null,
        maxEntriesPerMonth: useOption ? undefined : isAccessSrv && accessMode === 'limited' && maxEntriesPerMonth ? Number(maxEntriesPerMonth) : null,
        amount: !useOption && customAmount !== '' ? Number(customAmount.replace(',', '.')) : undefined,
        dueDay,
        paymentMethod,
        initialPaymentStatus,
        notes: notes.trim() || null
      });
      showToast('Matrícula registrada com sucesso!', 'success');
      setShowCreateModal(false);
      setNotes('');
      fetchEnrollments();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao criar matrícula.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const executeQuickLifecycle = async (enrollment: any, action: 'approve' | 'suspend' | 'reactivate', markPaid = false) => {
    try {
      setProcessingId(enrollment.id);
      await ApiClient.post(`/v1/studio/enrollments/${enrollment.id}/lifecycle`, {
        action,
        markFirstPaymentPaid: markPaid
      });
      showToast('Situação do contrato atualizada com sucesso!', 'success');
      fetchEnrollments();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao atualizar contrato.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleConfirmLifecycleModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lifecycleModal) return;
    const { enrollment, action } = lifecycleModal;
    try {
      setProcessingId(enrollment.id);
      await ApiClient.post(`/v1/studio/enrollments/${enrollment.id}/lifecycle`, {
        action,
        reason: lifecycleReason.trim() || (action === 'renew' ? 'Renovação de contrato' : null),
        frozenFromDate: action === 'freeze' ? freezeFrom : undefined,
        frozenUntilDate: action === 'freeze' ? freezeUntil : undefined,
        extendEndDateOnFreeze: true,
        cancelFuturePendingPayments: action === 'cancel',
        newServiceId: action === 'change_plan' && changePlanServiceId ? changePlanServiceId : undefined,
        newCommercialOptionId: action === 'change_plan' && changePlanOptionId ? changePlanOptionId : undefined,
        newAmount: (action === 'change_plan' || action === 'renew') && changePlanAmount ? Number(changePlanAmount.replace(',', '.')) : undefined,
        newDurationCode: action === 'renew' && renewDurationCode ? renewDurationCode : undefined,
        newEndDate: action === 'renew' && renewEndDate ? renewEndDate : undefined,
        generateRenewalCharge: action === 'renew' ? renewGenerateCharge : undefined,
        markFirstPaymentPaid: action === 'renew' ? renewMarkPaid : undefined
      });
      showToast('Operação contratual registrada com sucesso!', 'success');
      setLifecycleModal(null);
      setLifecycleReason('');
      fetchEnrollments();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao aplicar operação contratual.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleOpenDetail = async (enrollment: any) => {
    try {
      setDetailLoading(true);
      setDetailModal({ enrollment, loading: true });
      const res = await ApiClient.get<any>(`/v1/studio/enrollments/${enrollment.id}`);
      setDetailModal(res);
    } catch (err: any) {
      setDetailModal(null);
      showToast(err?.message || 'Não foi possível carregar os detalhes da matrícula.', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleOpenEdit = (enrollment: any) => {
    setEditForm({
      title: enrollment.title || '',
      dueDay: Number(enrollment.dueDay || 10),
      endDate: enrollment.endDate || '',
      autoRenew: Boolean(enrollment.autoRenew),
      notes: enrollment.notes || '',
      accessMode: enrollment.accessMode === 'limited' ? 'limited' : 'unlimited',
      maxEntriesPerWeek: enrollment.weeklyFrequency ? String(enrollment.weeklyFrequency) : '',
      maxEntriesPerMonth: enrollment.monthlyLimit ? String(enrollment.monthlyLimit) : ''
    });
    setEditModal(enrollment);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal) return;
    try {
      setSavingEdit(true);
      await ApiClient.patch(`/v1/studio/enrollments/${editModal.id}`, {
        title: editForm.title.trim() || undefined,
        dueDay: Number(editForm.dueDay) || 10,
        endDate: editForm.endDate ? editForm.endDate : null,
        autoRenew: editForm.autoRenew,
        notes: editForm.notes.trim() || null,
        ...(editModal.contractKind === 'access_plan'
          ? {
              accessMode: editForm.accessMode,
              maxEntriesPerWeek: editForm.accessMode === 'limited' && editForm.maxEntriesPerWeek ? Number(editForm.maxEntriesPerWeek) : null,
              maxEntriesPerMonth: editForm.accessMode === 'limited' && editForm.maxEntriesPerMonth ? Number(editForm.maxEntriesPerMonth) : null
            }
          : {})
      });
      showToast('Dados do contrato atualizados com sucesso!', 'success');
      setEditModal(null);
      fetchEnrollments();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao editar dados do contrato.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleApprovePublicRequest = async (requestId: string) => {
    try {
      setProcessingId(requestId);
      await ApiClient.post(`/v1/studio/enrollments/public-requests/${requestId}/approve`, {});
      showToast('Solicitação online confirmada e matrícula criada!', 'success');
      fetchEnrollments();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao aprovar solicitação online.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeliverEntitlement = async (contractId: string, entitlementId: string, serviceName: string) => {
    try {
      setProcessingId(entitlementId);
      await ApiClient.post(`/v1/studio/enrollments/${contractId}/entitlements/${entitlementId}/deliver`, {
        notes: `Entrega registrada para ${serviceName}`
      });
      showToast(`Entrega de "${serviceName}" concluída com sucesso!`, 'success');
      fetchEnrollments();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao registrar entrega.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleOpenHistory = async (enrollment: any) => {
    try {
      const res = await ApiClient.get<{ history: any[] }>(`/v1/studio/enrollments/${enrollment.id}/history`);
      setHistoryModal({ enrollment, items: res?.history || [] });
    } catch {
      showToast('Não foi possível carregar o histórico deste contrato.', 'error');
    }
  };

  const renderStatusBadge = (cat: string, status: string) => {
    if (cat === 'active') {
      return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Ativo</span>;
    }
    if (cat === 'requested') {
      return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">Aguardando Aprovação</span>;
    }
    if (cat === 'suspended' || status === 'frozen') {
      return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-200">{status === 'frozen' ? 'Congelado' : 'Suspenso'}</span>;
    }
    if (cat === 'expired') {
      return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">Vencido</span>;
    }
    if (cat === 'cancelled') {
      return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">Cancelado</span>;
    }
    return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">Programado</span>;
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-teal-600" />
            Matrículas, Planos e Contratos (Academia &amp; Studio)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Gerencie planos de acesso livre ou limitado, contratos recorrentes, pacotes combinados, congelamentos e entregas de treino.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!canManageContracts && (
            <span className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-600 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-600" /> Modo consulta (sem dados financeiros)
            </span>
          )}
          <button
            type="button"
            onClick={() => fetchEnrollments()}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
          </button>
          {canManageContracts && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Nova Matrícula / Plano
            </button>
          )}
        </div>
      </div>

      {/* Solicitações Online Pendentes de Planos / Pacotes */}
      {canManageContracts && pendingRequests.length > 0 && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
              <Clock className="w-4 h-4 text-amber-600" />
              Solicitações online aguardando aprovação ({pendingRequests.length})
            </div>
            <span className="text-[11px] text-amber-800">
              Ao aprovar, a matrícula é ativada automaticamente sem criar horários fictícios.
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {pendingRequests.map((reqItem: any) => (
              <div
                key={reqItem.id}
                className="bg-white rounded-xl border border-amber-200 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-900">
                    {reqItem.studentName} • {reqItem.serviceName}
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {reqItem.accessLabel || 'Plano contratado'}
                    {reqItem.planDurationLabel ? ` • ${reqItem.planDurationLabel}` : ''}
                    {reqItem.startDate ? ` • Início ${formatBrDate(reqItem.startDate)}` : ''}
                    {canViewFinancial && reqItem.amount !== null && reqItem.amount !== undefined
                      ? ` • ${formatCurrencyBRL(reqItem.amount)}`
                      : ''}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={processingId === reqItem.id}
                  onClick={() => handleApprovePublicRequest(reqItem.id)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {processingId === reqItem.id ? 'Aprovando...' : 'Aprovar solicitação'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Matrículas Ativas', value: summary.activeCount, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
          { label: 'Vencendo em 7 dias', value: summary.expiringSoonCount, color: 'text-amber-800 bg-amber-50 border-amber-200' },
          { label: 'Aguardando Aprovação', value: summary.requestedCount, color: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
          { label: 'Suspensos / Congelados', value: summary.suspendedCount, color: 'text-sky-700 bg-sky-50 border-sky-200' },
          { label: 'Planos Vencidos', value: summary.expiredCount, color: 'text-rose-700 bg-rose-50 border-rose-200' },
          { label: 'Início Futuro', value: summary.futureCount, color: 'text-slate-700 bg-slate-50 border-slate-200' }
        ].map((kpi, idx) => (
          <div key={idx} className={`p-3.5 rounded-2xl border ${kpi.color}`}>
            <div className="text-[11px] font-semibold opacity-80">{kpi.label}</div>
            <div className="text-2xl font-extrabold mt-1">{kpi.value ?? 0}</div>
          </div>
        ))}
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'active', label: 'Ativos' },
            { id: 'requested', label: 'Pendentes' },
            { id: 'suspended', label: 'Congelados/Suspensos' },
            { id: 'expired', label: 'Vencidos' },
            { id: 'cancelled', label: 'Cancelados' }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer transition-all ${
                statusFilter === tab.id
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={kindFilter}
            onChange={e => setKindFilter(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50 font-semibold text-slate-700"
          >
            <option value="all">Todas as naturezas</option>
            <option value="access_plan">Planos de Acesso (Academia)</option>
            <option value="scheduled_plan">Planos de Aulas Agendadas</option>
            <option value="combined_package">Pacotes Combinados</option>
          </select>

          <select
            value={serviceFilter}
            onChange={e => setServiceFilter(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50 font-semibold text-slate-700"
          >
            <option value="all">Todas modalidades / serviços</option>
            {services.map(s => (
              <option key={s.id} value={s.id}>
                {s.modality_category ? `${s.modality_category} • ${s.name}` : s.name}
              </option>
            ))}
            {packages.map(p => (
              <option key={`pkg:${p.id}`} value={`pkg:${p.id}`}>
                Pacote: {p.name}
              </option>
            ))}
          </select>

          <select
            value={periodFilter}
            onChange={e => setPeriodFilter(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50 font-semibold text-slate-700"
          >
            <option value="all">Todas as vigências</option>
            <option value="active_today">Vigentes hoje</option>
            <option value="expiring_7d">Vencendo em 7 dias</option>
            <option value="expiring_30d">Vencendo em 30 dias</option>
            <option value="expired">Vencidos</option>
            <option value="recurring">Recorrentes / contínuos</option>
          </select>

          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchEnrollments()}
              placeholder="Buscar aluno, plano ou telefone..."
              className="w-full border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Lista de Matrículas */}
      {loading ? (
        <div className="bg-white p-10 rounded-2xl border border-slate-200 text-center text-xs text-slate-500">
          Carregando matrículas e contratos...
        </div>
      ) : enrollments.length === 0 ? (
        <div className="bg-white p-10 rounded-2xl border border-dashed border-slate-300 text-center space-y-2 text-xs text-slate-500">
          <p className="font-bold text-slate-700 text-sm">Nenhuma matrícula encontrada para este filtro.</p>
          {canManageContracts && (
            <p>Clique em "Nova Matrícula / Plano" para matricular um aluno em Acesso Livre, Limitado ou Pacote Combinado.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {enrollments.map(enr => {
            const isAccess = enr.contractKind === 'access_plan' || enr.accessMode !== 'none';
            const isPkg = enr.contractSource === 'package_contract';
            return (
              <div key={enr.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                          <User className="w-4 h-4 text-teal-600" />
                          {enr.studentName}
                        </h3>
                        {renderStatusBadge(enr.lifecycleCategory, enr.contractStatus)}
                        {canViewFinancial && enr.financialStatus === 'overdue' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Parcela Vencida
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-bold text-indigo-700 mt-1 flex items-center gap-1.5">
                        {isPkg ? <Package className="w-3.5 h-3.5" /> : <KeyRound className="w-3.5 h-3.5" />}
                        {enr.title}
                      </p>
                    </div>

                    {canViewFinancial && enr.amount !== null && enr.amount !== undefined && (
                      <div className="text-right">
                        <div className="text-sm font-extrabold text-slate-900">
                          {formatCurrencyBRL(enr.amount)}
                        </div>
                        <div className="text-[10px] text-slate-500 font-semibold">
                          {formatBillingCycleLabel(enr.paymentPeriodicity, enr.billingFrequency, enr.installmentsCount)}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Resumo de Vigência, Acesso e Créditos */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-100 text-[11px]">
                    <div>
                      <span className="text-slate-400 block">Vigência</span>
                      <span className="font-bold text-slate-800">
                        {formatBrDate(enr.startDate)} até {enr.endDate ? formatBrDate(enr.endDate) : 'Recorrente'}
                      </span>
                    </div>
                    {isAccess && (
                      <div>
                        <span className="text-slate-400 block">Modalidade do Plano</span>
                        <span className="font-bold text-teal-800">
                          {enr.accessMode === 'unlimited'
                            ? 'Acesso Livre'
                            : enr.weeklyFrequency
                              ? `Contratado: ${enr.weeklyFrequency}x por semana`
                              : enr.monthlyLimit
                                ? `Contratado: ${enr.monthlyLimit}x por mês`
                                : 'Frequência limitada'}
                        </span>
                      </div>
                    )}
                    {enr.creditsTotal > 0 && (
                      <div>
                        <span className="text-slate-400 block">Créditos de Aula</span>
                        <span className="font-bold text-indigo-800">
                          {enr.creditsUsed} usadas • {enr.creditsReserved} agendadas • {enr.creditsRemaining ?? 0} livres
                        </span>
                      </div>
                    )}
                  </div>

                  {enr.frozenFromDate && enr.frozenUntilDate && (
                    <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 text-[11px] text-sky-900 flex items-center gap-2">
                      <Snowflake className="w-4 h-4 text-sky-600 shrink-0" />
                      <span>
                        Congelado de <strong>{formatBrDate(enr.frozenFromDate)}</strong> até <strong>{formatBrDate(enr.frozenUntilDate)}</strong>
                        {enr.freezeReason ? ` (${enr.freezeReason})` : ''}
                      </span>
                    </div>
                  )}

                  {/* Entregáveis / Benefícios do Pacote Combinado */}
                  {Array.isArray(enr.entitlements) && enr.entitlements.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                        Benefícios do Pacote Combinado
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {enr.entitlements.map((ent: any) => {
                          const isDeliv = ent.entitlement_type === 'deliverable';
                          const isFac = ent.entitlement_type === 'facility_access';
                          return (
                            <div
                              key={ent.id}
                              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-[11px] flex items-center gap-2"
                            >
                              <span className="font-semibold text-slate-800">{ent.service_name_snapshot}:</span>
                              {isFac ? (
                                <span className="text-teal-700 font-bold">
                                  {ent.access_mode_snapshot === 'unlimited'
                                    ? 'Acesso Livre incluído'
                                    : ent.weekly_frequency_snapshot
                                      ? `Plano ${ent.weekly_frequency_snapshot}x/sem`
                                      : ent.monthly_limit_snapshot
                                        ? `Plano ${ent.monthly_limit_snapshot}x/mês`
                                        : 'Plano de Acesso'}
                                </span>
                              ) : (
                                <span className="text-indigo-700 font-bold">
                                  {ent.credits_used}/{ent.credits_total} {isDeliv ? 'entregue(s)' : 'aula(s)'}
                                </span>
                              )}
                              {canDeliverEntitlement && isDeliv && Number(ent.credits_remaining) > 0 && (
                                <button
                                  type="button"
                                  disabled={processingId === ent.id}
                                  onClick={() => handleDeliverEntitlement(enr.id, ent.id, ent.service_name_snapshot)}
                                  className="px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[10px] cursor-pointer"
                                >
                                  Entregar agora
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Ações do Ciclo de Vida */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {canManageContracts && enr.lifecycleCategory === 'requested' && (
                      <button
                        type="button"
                        disabled={processingId === enr.id}
                        onClick={() => executeQuickLifecycle(enr, 'approve', false)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Aprovar Matrícula
                      </button>
                    )}
                    {canManageContracts && enr.lifecycleCategory === 'active' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setLifecycleReason('');
                            setLifecycleModal({ enrollment: enr, action: 'freeze' });
                          }}
                          className="px-2.5 py-1 rounded-lg border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-800 font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Snowflake className="w-3.5 h-3.5" /> Congelar
                        </button>
                        <button
                          type="button"
                          disabled={processingId === enr.id}
                          onClick={() => executeQuickLifecycle(enr, 'suspend')}
                          className="px-2.5 py-1 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <PauseCircle className="w-3.5 h-3.5" /> Suspender
                        </button>
                      </>
                    )}
                    {canManageContracts && (enr.lifecycleCategory === 'suspended' || enr.lifecycleCategory === 'expired') && (
                      <button
                        type="button"
                        disabled={processingId === enr.id}
                        onClick={() => executeQuickLifecycle(enr, 'reactivate')}
                        className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Reativar
                      </button>
                    )}
                    {canManageContracts && enr.lifecycleCategory !== 'cancelled' && (
                      <button
                        type="button"
                        onClick={() => {
                          setRenewDurationCode(enr.planDurationCode || '1_month');
                          setRenewEndDate('');
                          setRenewGenerateCharge(true);
                          setRenewMarkPaid(false);
                          setChangePlanAmount(enr.amount !== null && enr.amount !== undefined ? String(enr.amount) : '');
                          setLifecycleReason('');
                          setLifecycleModal({ enrollment: enr, action: 'renew' });
                        }}
                        className="px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCw className="w-3.5 h-3.5" /> Renovar
                      </button>
                    )}
                    {canManageContracts && enr.lifecycleCategory !== 'cancelled' && (
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(enr)}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Editar
                      </button>
                    )}
                    {canManageContracts && enr.contractSource === 'recurring_plan' && enr.lifecycleCategory !== 'cancelled' && (
                      <button
                        type="button"
                        onClick={() => {
                          setChangePlanServiceId(enr.serviceId || '');
                          setChangePlanOptionId('');
                          setChangePlanAmount(enr.amount !== null && enr.amount !== undefined ? String(enr.amount) : '');
                          setLifecycleReason('');
                          setLifecycleModal({ enrollment: enr, action: 'change_plan' });
                        }}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" /> Trocar Plano
                      </button>
                    )}
                    {canManageContracts && enr.lifecycleCategory !== 'cancelled' && (
                      <button
                        type="button"
                        onClick={() => {
                          setLifecycleReason('');
                          setLifecycleModal({ enrollment: enr, action: 'cancel' });
                        }}
                        className="px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Cancelar
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenDetail(enr)}
                      className="px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 text-indigo-800 hover:bg-indigo-100 font-semibold flex items-center gap-1 cursor-pointer"
                      title="Ver Detalhes Completos da Matrícula"
                    >
                      <Eye className="w-3.5 h-3.5" /> Detalhes
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenHistory(enr)}
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-teal-700 hover:bg-teal-50 cursor-pointer"
                      title="Histórico Auditável do Contrato"
                    >
                      <History className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Nova Matrícula */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 mobile-modal">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden text-xs">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Nova Matrícula / Contratar Plano</h3>
                <p className="text-[11px] text-slate-500">Vincule um plano de acesso, modalidade ou pacote combinado ao aluno.</p>
              </div>
              <button type="button" onClick={() => setShowCreateModal(false)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEnrollment} className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Aluno *</label>
                <select
                  required
                  value={selectedStudentId}
                  onChange={e => setSelectedStudentId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-medium"
                >
                  <option value="">Selecione o aluno...</option>
                  {students.map(st => (
                    <option key={st.id} value={st.id}>
                      {st.full_name} {st.phone ? `(${st.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEnrollTargetType('service')}
                  className={`p-2.5 rounded-xl border font-bold text-left cursor-pointer ${
                    enrollTargetType === 'service' ? 'border-teal-600 bg-teal-50 text-teal-900' : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  Plano de Acesso ou Modalidade
                </button>
                <button
                  type="button"
                  onClick={() => setEnrollTargetType('package')}
                  className={`p-2.5 rounded-xl border font-bold text-left cursor-pointer ${
                    enrollTargetType === 'package' ? 'border-indigo-600 bg-indigo-50 text-indigo-900' : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  Pacote Combinado
                </button>
              </div>

              {enrollTargetType === 'service' ? (
                <>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Serviço / Plano *</label>
                    <select
                      required
                      value={selectedServiceId}
                      onChange={e => setSelectedServiceId(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white font-semibold"
                    >
                      {services.map(srv => (
                        <option key={srv.id} value={srv.id}>
                          {srv.name} ({srv.studio_service_type === 'facility_access' ? 'Acesso Academia' : srv.service_kind === 'group' ? 'Turma' : 'Individual'})
                        </option>
                      ))}
                    </select>
                  </div>

                  {commercialOptions.length > 0 && <div className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
                    <label className="block space-y-1 font-semibold text-slate-700">
                      <span>Opção comercial *</span>
                      <select required value={commercialOptionId} onChange={e => setCommercialOptionId(e.target.value)}
                        className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <option value="">Selecione um plano ou preço</option>
                        {commercialOptions.map(option => <option key={option.id} value={option.id}>
                          {[
                            option.label,
                            option.frequencyType === 'unlimited' ? 'Acesso livre' :
                              option.frequencyCount + (option.frequencyType === 'weekly' ? '× por semana' : option.frequencyType === 'monthly' ? '× por mês' : ' unidades'),
                            PLAN_DURATION_LABELS[option.contractDurationCode],
                            PAYMENT_PERIODICITY_LABELS[option.paymentPeriodicity]
                          ].filter(Boolean).join(' · ')}
                        </option>)}
                      </select>
                    </label>
                    {commercialQuote && <p className="text-sm font-medium text-indigo-900">
                      {commercialQuote.paymentPeriodicity === 'installments'
                        ? commercialQuote.installmentsCount + ' parcelas de ' + formatCurrencyBRL(commercialQuote.installmentAmountReais)
                        : formatCurrencyBRL(commercialQuote.cycleAmountReais) + ' por cobrança'}
                      {' · Total do contrato: ' + formatCurrencyBRL(commercialQuote.totalContractAmountReais)}
                    </p>}
                  </div>}

                  {commercialOptions.length === 0 && selectedServiceObj?.studio_service_type === 'facility_access' && (
                    <div className="p-3 rounded-xl bg-indigo-50/50 border border-indigo-100 space-y-2.5">
                      <div className="font-bold text-indigo-950">Condição do Plano de Acesso</div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setAccessMode('unlimited')}
                          className={`px-3 py-1.5 rounded-lg border font-bold cursor-pointer ${
                            accessMode === 'unlimited' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          Acesso Livre
                        </button>
                        <button
                          type="button"
                          onClick={() => setAccessMode('limited')}
                          className={`px-3 py-1.5 rounded-lg border font-bold cursor-pointer ${
                            accessMode === 'limited' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          Acesso Limitado
                        </button>
                      </div>
                      {accessMode === 'limited' && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Vezes por semana</label>
                            <input
                              type="number"
                              min={1}
                              max={14}
                              value={maxEntriesPerWeek}
                              onChange={e => setMaxEntriesPerWeek(e.target.value)}
                              className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Vezes por mês (opcional)</label>
                            <input
                              type="number"
                              min={1}
                              max={60}
                              value={maxEntriesPerMonth}
                              onChange={e => setMaxEntriesPerMonth(e.target.value)}
                              placeholder="Ex: 12"
                              className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {commercialOptions.length === 0 && <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Duração do Contrato</label>
                      <select
                        value={contractDurationCode}
                        onChange={e => setContractDurationCode(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white"
                      >
                        <option value="1_month">Mensal (1 mês)</option>
                        <option value="2_months">Bimestral (2 meses)</option>
                        <option value="3_months">Trimestral (3 meses)</option>
                        <option value="6_months">Semestral (6 meses)</option>
                        <option value="12_months">Anual (12 meses)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Periodicidade de Cobrança</label>
                      <select
                        value={paymentPeriodicity}
                        onChange={e => setPaymentPeriodicity(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white"
                      >
                        <option value="monthly">Mensal</option>
                        <option value="quarterly">Trimestral</option>
                        <option value="semiannual">Semestral</option>
                        <option value="annual">Anual</option>
                        <option value="one_time">À vista (Único)</option>
                      </select>
                    </div>
                  </div>}

                  <div className="grid grid-cols-2 gap-3">
                    {commercialOptions.length === 0 && <div>
                      <label className="block font-semibold text-slate-700 mb-1">Valor por Ciclo (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={customAmount}
                        onChange={e => setCustomAmount(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 font-bold text-teal-800"
                      />
                    </div>}
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Dia de Vencimento</label>
                      <input
                        type="number"
                        min={1}
                        max={28}
                        value={dueDay}
                        onChange={e => setDueDay(Math.min(28, Math.max(1, Number(e.target.value) || 10)))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Pacote Combinado *</label>
                  <select
                    required
                    value={selectedPackageId}
                    onChange={e => setSelectedPackageId(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white font-semibold"
                  >
                    {packages.map(pkg => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name} — {formatCurrencyBRL(pkg.price)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Forma de Pagamento</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white"
                  >
                    <option value="pix">PIX</option>
                    <option value="credit_card">Cartão de Crédito</option>
                    <option value="debit_card">Cartão de Débito</option>
                    <option value="cash">Dinheiro</option>
                    <option value="boleto">Boleto</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">1ª Cobrança</label>
                  <select
                    value={initialPaymentStatus}
                    onChange={e => setInitialPaymentStatus(e.target.value as any)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white font-semibold"
                  >
                    <option value="pending">Gerar em aberto (Pendente)</option>
                    <option value="paid">Já recebida (Quitada agora)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Observações (opcional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Condições acordadas na recepção..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 rounded-xl font-bold bg-teal-600 hover:bg-teal-700 text-white cursor-pointer disabled:opacity-50"
                >
                  {creating ? 'Salvando...' : 'Confirmar Matrícula'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Congelar / Cancelar / Trocar Plano / Renovar */}
      {lifecycleModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 mobile-modal">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {lifecycleModal.action === 'freeze'
                  ? 'Congelar Contrato'
                  : lifecycleModal.action === 'change_plan'
                    ? 'Trocar Plano do Aluno'
                    : lifecycleModal.action === 'renew'
                      ? 'Renovar Contrato'
                      : 'Cancelar Contrato'}
              </h3>
              <button type="button" onClick={() => setLifecycleModal(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmLifecycleModal} className="space-y-3">
              <p className="text-slate-600">
                Aluno: <strong>{lifecycleModal.enrollment.studentName}</strong> — {lifecycleModal.enrollment.title}
              </p>

              {lifecycleModal.action === 'freeze' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Congelar de *</label>
                    <input
                      type="date"
                      required
                      value={freezeFrom}
                      onChange={e => setFreezeFrom(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Até *</label>
                    <input
                      type="date"
                      required
                      value={freezeUntil}
                      onChange={e => setFreezeUntil(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2"
                    />
                  </div>
                </div>
              )}

              {lifecycleModal.action === 'renew' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Novo ciclo de duração</label>
                      <select
                        value={renewDurationCode}
                        onChange={e => setRenewDurationCode(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white"
                      >
                        <option value="1_month">Mensal (1 mês)</option>
                        <option value="2_months">Bimestral (2 meses)</option>
                        <option value="3_months">Trimestral (3 meses)</option>
                        <option value="6_months">Semestral (6 meses)</option>
                        <option value="12_months">Anual (12 meses)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Fim personalizado (opcional)</label>
                      <input
                        type="date"
                        value={renewEndDate}
                        onChange={e => setRenewEndDate(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2"
                      />
                    </div>
                  </div>
                  {canViewFinancial && (
                    <div className="space-y-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Valor da renovação (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={changePlanAmount}
                          onChange={e => setChangePlanAmount(e.target.value)}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 font-bold bg-white"
                        />
                      </div>
                      <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={renewGenerateCharge}
                          onChange={e => setRenewGenerateCharge(e.target.checked)}
                          className="rounded border-slate-300 text-teal-600"
                        />
                        Gerar nova cobrança para o período renovado
                      </label>
                      {renewGenerateCharge && (
                        <label className="flex items-center gap-2 text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={renewMarkPaid}
                            onChange={e => setRenewMarkPaid(e.target.checked)}
                            className="rounded border-slate-300 text-emerald-600"
                          />
                          Marcar cobrança da renovação como paga agora
                        </label>
                      )}
                    </div>
                  )}
                </>
              )}

              {lifecycleModal.action === 'change_plan' && (() => {
                const targetSrv = services.find(s => s.id === changePlanServiceId);
                const targetOptions: StudioCommercialPriceOption[] =
                  targetSrv?.commercial_price_options?.filter((o: StudioCommercialPriceOption) => o.active) || [];
                return (
                  <>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Novo Serviço / Plano *</label>
                      <select
                        required
                        value={changePlanServiceId}
                        onChange={e => {
                          const nextId = e.target.value;
                          setChangePlanServiceId(nextId);
                          setChangePlanOptionId('');
                          const srv = services.find(s => s.id === nextId);
                          if (srv) {
                            const base = Number(srv.periodic_price) > 0 ? srv.periodic_price : Number(srv.price || 0);
                            setChangePlanAmount(base ? String(base) : '');
                          }
                        }}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white"
                      >
                        {services.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    {targetOptions.length > 0 && (
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Condição Comercial do Novo Plano</label>
                        <select
                          value={changePlanOptionId}
                          onChange={e => {
                            const optId = e.target.value;
                            setChangePlanOptionId(optId);
                            const opt = targetOptions.find(o => o.id === optId);
                            if (opt) {
                              const bd = calculateCommercialOptionBreakdown(opt);
                              setChangePlanAmount(String(bd.cycleAmountReais));
                            }
                          }}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white"
                        >
                          <option value="">Padrão do serviço</option>
                          {targetOptions.map(opt => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label} • {formatCurrencyBRL(calculateCommercialOptionBreakdown(opt).cycleAmountReais)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {canViewFinancial && (
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Novo Valor (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={changePlanAmount}
                          onChange={e => setChangePlanAmount(e.target.value)}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 font-bold"
                        />
                      </div>
                    )}
                  </>
                );
              })()}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Motivo / Justificativa {lifecycleModal.action === 'renew' ? '(opcional)' : '*'}
                </label>
                <input
                  type="text"
                  required={lifecycleModal.action !== 'renew'}
                  value={lifecycleReason}
                  onChange={e => setLifecycleReason(e.target.value)}
                  placeholder="Registrado no histórico de auditoria do contrato..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2"
                />
              </div>

              {lifecycleModal.action === 'cancel' && (
                <p className="text-[11px] text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                  Cobranças futuras pendentes serão canceladas. Pagamentos já quitados e aulas já realizadas permanecem intactos no histórico.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setLifecycleModal(null)} className="px-4 py-2 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer">
                  Voltar
                </button>
                <button type="submit" disabled={Boolean(processingId)} className="px-5 py-2 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer disabled:opacity-50">
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Contrato */}
      {editModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 mobile-modal">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-xs space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Editar Dados do Contrato</h3>
                <p className="text-[11px] text-slate-500">{editModal.studentName} • {editModal.serviceName}</p>
              </div>
              <button type="button" onClick={() => setEditModal(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome / Descrição do Contrato</label>
                <input
                  type="text"
                  required
                  value={editForm.title}
                  onChange={e => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Data final de vigência</label>
                  <input
                    type="date"
                    value={editForm.endDate}
                    onChange={e => setEditForm(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2"
                  />
                </div>
                {canViewFinancial && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Dia de vencimento (1–31)</label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={editForm.dueDay}
                      onChange={e => setEditForm(prev => ({ ...prev, dueDay: Number(e.target.value) || 10 }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2"
                    />
                  </div>
                )}
              </div>

              {editModal.contractKind === 'access_plan' && (
                <div className="p-3 rounded-xl bg-teal-50/50 border border-teal-100 space-y-2.5">
                  <div className="font-bold text-teal-900">Condição de uso do plano de acesso</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <select
                      value={editForm.accessMode}
                      onChange={e => setEditForm(prev => ({ ...prev, accessMode: e.target.value as any }))}
                      className="border border-slate-200 rounded-xl px-2.5 py-2 bg-white"
                    >
                      <option value="unlimited">Acesso Livre</option>
                      <option value="limited">Frequência Limitada</option>
                    </select>
                    {editForm.accessMode === 'limited' && (
                      <>
                        <input
                          type="number"
                          min={1}
                          placeholder="Máx. por semana"
                          value={editForm.maxEntriesPerWeek}
                          onChange={e => setEditForm(prev => ({ ...prev, maxEntriesPerWeek: e.target.value }))}
                          className="border border-slate-200 rounded-xl px-2.5 py-2 bg-white"
                        />
                        <input
                          type="number"
                          min={1}
                          placeholder="Máx. por mês"
                          value={editForm.maxEntriesPerMonth}
                          onChange={e => setEditForm(prev => ({ ...prev, maxEntriesPerMonth: e.target.value }))}
                          className="border border-slate-200 rounded-xl px-2.5 py-2 bg-white"
                        />
                      </>
                    )}
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editForm.autoRenew}
                  onChange={e => setEditForm(prev => ({ ...prev, autoRenew: e.target.checked }))}
                  className="rounded border-slate-300 text-teal-600"
                />
                Renovação automática habilitada ao fim da vigência
              </label>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Observações contratuais</label>
                <textarea
                  rows={2}
                  value={editForm.notes}
                  onChange={e => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2"
                />
              </div>

              <p className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                Alterações de dados contratuais não modificam parcelas já pagas ou registros históricos.
              </p>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setEditModal(null)} className="px-4 py-2 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer">
                  Cancelar
                </button>
                <button type="submit" disabled={savingEdit} className="px-5 py-2 rounded-xl font-bold bg-teal-600 hover:bg-teal-700 text-white cursor-pointer disabled:opacity-50">
                  {savingEdit ? 'Salvando...' : 'Salvar alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detalhes Completos da Matrícula */}
      {detailModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 mobile-modal">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 text-xs flex flex-col max-h-[90vh]">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-slate-900">
                    {detailModal.student?.fullName || detailModal.enrollment?.studentName}
                  </h3>
                  {detailModal.enrollment && renderStatusBadge(detailModal.enrollment.lifecycleCategory, detailModal.enrollment.contractStatus)}
                </div>
                <p className="text-[11px] text-indigo-700 font-semibold mt-0.5">
                  {detailModal.enrollment?.title}
                </p>
              </div>
              <button type="button" onClick={() => setDetailModal(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailLoading ? (
              <div className="py-12 text-center text-slate-500">Carregando detalhes completos...</div>
            ) : (
              <div className="overflow-y-auto space-y-4 py-4 pr-1">
                {/* 1. Dados do Aluno */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2">
                  <div className="font-bold text-slate-800 uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-teal-600" /> Dados do Aluno
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{detailModal.student?.phone || detailModal.student?.whatsapp || 'Sem telefone'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span>{detailModal.student?.email || 'Sem e-mail'}</span>
                    </div>
                    {canViewFinancial && detailModal.student?.cpf && (
                      <div className="text-slate-700">
                        <span className="text-slate-400 mr-1">CPF:</span>
                        <span className="font-semibold">{detailModal.student.cpf}</span>
                      </div>
                    )}
                  </div>
                  {detailModal.student?.notes && (
                    <p className="text-[11px] text-slate-600 pt-1">Obs. do aluno: {detailModal.student.notes}</p>
                  )}
                </div>

                {/* 2. Regras e Vigência do Contrato */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2">
                  <div className="font-bold text-slate-800 uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" /> Contrato e Condições
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                    <div>
                      <span className="text-slate-400 block">Início</span>
                      <span className="font-bold text-slate-800">{formatBrDate(detailModal.enrollment?.startDate)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Término</span>
                      <span className="font-bold text-slate-800">
                        {detailModal.enrollment?.endDate ? formatBrDate(detailModal.enrollment.endDate) : 'Recorrente'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Renovação automática</span>
                      <span className="font-bold text-slate-800">{detailModal.enrollment?.autoRenew ? 'Sim' : 'Não'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Condição de acesso</span>
                      <span className="font-bold text-teal-800">
                        {detailModal.enrollment?.accessMode === 'unlimited'
                          ? 'Acesso Livre'
                          : detailModal.enrollment?.weeklyFrequency
                            ? `${detailModal.enrollment.weeklyFrequency}x por semana`
                            : detailModal.enrollment?.monthlyLimit
                              ? `${detailModal.enrollment.monthlyLimit}x por mês`
                              : 'Aulas / Sessões'}
                      </span>
                    </div>
                  </div>
                  {detailModal.enrollment?.notes && (
                    <p className="text-[11px] text-slate-600 pt-1">Observações: {detailModal.enrollment.notes}</p>
                  )}
                </div>

                {/* 3. Aulas, Créditos e Entregas */}
                {((Array.isArray(detailModal.entitlements) && detailModal.entitlements.length > 0) ||
                  (Array.isArray(detailModal.appointments) && detailModal.appointments.length > 0) ||
                  (detailModal.enrollment?.creditsTotal || 0) > 0) && (
                  <div className="p-4 rounded-2xl border border-indigo-100 bg-indigo-50/30 space-y-2.5">
                    <div className="font-bold text-indigo-900 uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                      <FileCheck2 className="w-3.5 h-3.5 text-indigo-600" /> Aulas, Benefícios e Agendamentos
                    </div>
                    {Array.isArray(detailModal.entitlements) && detailModal.entitlements.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {detailModal.entitlements.map((ent: any) => (
                          <span key={ent.id} className="px-2.5 py-1 rounded-xl bg-white border border-indigo-100 text-[11px] font-semibold text-slate-800">
                            {ent.service_name_snapshot}:{' '}
                            {ent.entitlement_type === 'facility_access'
                              ? (ent.access_mode_snapshot === 'unlimited' ? 'Acesso Livre' : `${ent.weekly_frequency_snapshot || ent.monthly_limit_snapshot || ''}x`)
                              : `${ent.credits_used || 0}/${ent.credits_total || 0} usados (${ent.credits_remaining ?? 0} livres)`}
                          </span>
                        ))}
                      </div>
                    )}
                    {Array.isArray(detailModal.appointments) && detailModal.appointments.length > 0 ? (
                      <div className="divide-y divide-indigo-100 bg-white rounded-xl border border-indigo-100 max-h-40 overflow-y-auto">
                        {detailModal.appointments.map((ap: any) => (
                          <div key={ap.id} className="px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
                            <div>
                              <span className="font-bold text-slate-800">{ap.service_name || 'Aula'}</span>
                              {ap.professional_name && <span className="text-slate-500"> • Prof. {ap.professional_name}</span>}
                            </div>
                            <span className="text-slate-600 font-medium">{formatBrDateTime(ap.start_time)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500">Nenhuma aula agendada vinculada a este contrato.</p>
                    )}
                  </div>
                )}

                {/* 4. Financeiro do Contrato (apenas usuários autorizados) */}
                {canViewFinancial && (
                  <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2.5">
                    <div className="font-bold text-slate-800 uppercase text-[10px] tracking-wider flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-emerald-600" /> Financeiro do Contrato
                      </span>
                      <span className="text-slate-900 normal-case text-xs font-extrabold">
                        {formatCurrencyBRL(detailModal.enrollment?.amount)} ({formatBillingCycleLabel(detailModal.enrollment?.paymentPeriodicity, detailModal.enrollment?.billingFrequency, detailModal.enrollment?.installmentsCount)})
                      </span>
                    </div>
                    {Array.isArray(detailModal.payments) && detailModal.payments.length > 0 ? (
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl max-h-44 overflow-y-auto">
                        {detailModal.payments.map((pay: any) => {
                          const st = String(pay.status || 'pending');
                          const badgeCls =
                            st === 'paid'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : st === 'cancelled' || st === 'refunded'
                                ? 'bg-slate-100 text-slate-500 border-slate-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200';
                          const stLabel = st === 'paid' ? 'Pago' : st === 'cancelled' ? 'Cancelado' : st === 'refunded' ? 'Estornado' : 'Pendente';
                          return (
                            <div key={pay.id} className="px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
                              <div>
                                <div className="font-semibold text-slate-800">
                                  {pay.notes || `Cobrança ${pay.competence_month || ''}`}
                                  {pay.total_installments > 1 ? ` (${pay.installment_number}/${pay.total_installments})` : ''}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  Vencimento: {formatBrDate(pay.due_date)}
                                  {pay.payment_date ? ` • Pago em ${formatBrDate(pay.payment_date)}` : ''}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-bold text-slate-900">{formatCurrencyBRL(pay.amount)}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeCls}`}>
                                  {stLabel}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500">Nenhuma cobrança registrada até o momento.</p>
                    )}
                  </div>
                )}

                {/* 5. Histórico de Eventos */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2">
                  <div className="font-bold text-slate-800 uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-teal-600" /> Histórico do Contrato
                  </div>
                  {Array.isArray(detailModal.history) && detailModal.history.length > 0 ? (
                    <div className="space-y-1.5 max-h-44 overflow-y-auto">
                      {detailModal.history.map((h: any) => (
                        <div key={h.id} className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-0.5 text-[11px]">
                          <div className="flex items-center justify-between font-bold text-slate-800">
                            <span>{formatHistoryActionLabel(h.action)}</span>
                            <span className="text-[10px] font-medium text-slate-400">{formatBrDateTime(h.created_at)}</span>
                          </div>
                          <p className="text-slate-600">{sanitizeHistorySummary(h.summary)}</p>
                          {h.performed_by_name && (
                            <p className="text-[10px] text-slate-400">Responsável: {h.performed_by_name}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500">Nenhum evento registrado ainda.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Histórico Auditável */}
      {historyModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 mobile-modal">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-xs space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Histórico Auditável do Contrato</h3>
                <p className="text-[11px] text-slate-500">{historyModal.enrollment.studentName} • {historyModal.enrollment.title}</p>
              </div>
              <button type="button" onClick={() => setHistoryModal(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto space-y-2 flex-1">
              {historyModal.items.length === 0 ? (
                <p className="text-slate-400 text-center py-6">Nenhum evento registrado ainda.</p>
              ) : (
                historyModal.items.map((h: any) => (
                  <div key={h.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                    <div className="flex items-center justify-between font-bold text-slate-800">
                      <span>{formatHistoryActionLabel(h.action)}</span>
                      <span className="text-[10px] text-slate-400">{formatBrDateTime(h.created_at)}</span>
                    </div>
                    <p className="text-slate-600">{sanitizeHistorySummary(h.summary)}</p>
                    {h.reason && <p className="text-[11px] text-indigo-700">Motivo: {h.reason}</p>}
                    {h.performed_by_name && <p className="text-[10px] text-slate-400">Responsável: {h.performed_by_name}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
