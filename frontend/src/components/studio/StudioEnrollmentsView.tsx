import React, { useState, useEffect, useMemo } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { formatCurrencyBRL, PLAN_DURATION_LABELS } from '../../utils/establishmentContext';
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
  QrCode,
  History,
  FileCheck2,
  Calendar,
  CreditCard,
  User,
  Package,
  AlertTriangle,
  X,
  ArrowRightLeft
} from 'lucide-react';

export const StudioEnrollmentsView: React.FC = () => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({
    activeCount: 0,
    futureCount: 0,
    expiredCount: 0,
    suspendedCount: 0,
    requestedCount: 0,
    expiringSoonCount: 0
  });

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [kindFilter, setKindFilter] = useState<string>('all');
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

  // Modal Congelamento / Cancelamento / Troca de Plano
  const [lifecycleModal, setLifecycleModal] = useState<{
    enrollment: any;
    action: 'freeze' | 'cancel' | 'change_plan' | 'renew';
  } | null>(null);
  const [freezeFrom, setFreezeFrom] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [freezeUntil, setFreezeUntil] = useState<string>(() => new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10));
  const [lifecycleReason, setLifecycleReason] = useState<string>('');
  const [changePlanServiceId, setChangePlanServiceId] = useState<string>('');
  const [changePlanAmount, setChangePlanAmount] = useState<string>('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Modal Histórico & QR Code
  const [historyModal, setHistoryModal] = useState<{ enrollment: any; items: any[] } | null>(null);
  const [qrModal, setQrModal] = useState<{ student: any; token: string; expiresAt: string } | null>(null);

  const fetchEnrollments = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (kindFilter !== 'all') params.set('kind', kindFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await ApiClient.get<any>(`/v1/studio/enrollments?${params.toString()}`);
      setEnrollments(Array.isArray(res?.enrollments) ? res.enrollments : []);
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
    fetchEnrollments();
  }, [statusFilter, kindFilter]);

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
        reason: lifecycleReason.trim() || null,
        frozenFromDate: action === 'freeze' ? freezeFrom : undefined,
        frozenUntilDate: action === 'freeze' ? freezeUntil : undefined,
        extendEndDateOnFreeze: true,
        cancelFuturePendingPayments: action === 'cancel',
        newServiceId: action === 'change_plan' && changePlanServiceId ? changePlanServiceId : undefined,
        newAmount: action === 'change_plan' && changePlanAmount ? Number(changePlanAmount.replace(',', '.')) : undefined
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

  const handleOpenQrCode = async (studentId: string) => {
    try {
      const res = await ApiClient.get<any>(`/v1/studio/access/students/${studentId}/qr-token`);
      setQrModal(res);
    } catch {
      showToast('Não foi possível gerar o QR Code de acesso.', 'error');
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
          <button
            type="button"
            onClick={fetchEnrollments}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Nova Matrícula / Plano
          </button>
        </div>
      </div>

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

          <div className="relative flex-1 sm:w-64">
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
          <p>Clique em "Nova Matrícula / Plano" para matricular um aluno em Acesso Livre, Limitado ou Pacote Combinado.</p>
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
                        {enr.financialStatus === 'overdue' && (
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

                    <div className="text-right">
                      <div className="text-sm font-extrabold text-slate-900">
                        {formatCurrencyBRL(enr.amount)}
                      </div>
                      <div className="text-[10px] text-slate-500 font-semibold uppercase">
                        {enr.paymentPeriodicity === 'one_time' ? 'Pagamento único' : `Ciclo ${enr.billingFrequency}`}
                      </div>
                    </div>
                  </div>

                  {/* Resumo de Vigência, Acesso e Créditos */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-100 text-[11px]">
                    <div>
                      <span className="text-slate-400 block">Vigência</span>
                      <span className="font-bold text-slate-800">
                        {enr.startDate || '-'} até {enr.endDate || 'Recorrente'}
                      </span>
                    </div>
                    {isAccess && (
                      <div>
                        <span className="text-slate-400 block">Acesso Academia</span>
                        <span className="font-bold text-teal-800">
                          {enr.accessMode === 'unlimited'
                            ? `Livre (${enr.accessEntriesWeek}x na sem / ${enr.accessEntriesMonth}x no mês)`
                            : `Limitado: ${enr.accessEntriesWeek}/${enr.weeklyFrequency || '-'} na sem`}
                        </span>
                      </div>
                    )}
                    {(enr.creditsTotal > 0 || isPkg) && (
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
                        Congelado de <strong>{enr.frozenFromDate}</strong> até <strong>{enr.frozenUntilDate}</strong>
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
                                  {ent.access_mode_snapshot === 'unlimited' ? 'Acesso Livre' : `${ent.entries_used || 0} acessos`}
                                </span>
                              ) : (
                                <span className="text-indigo-700 font-bold">
                                  {ent.credits_used}/{ent.credits_total} {isDeliv ? 'entregue(s)' : 'aula(s)'}
                                </span>
                              )}
                              {isDeliv && Number(ent.credits_remaining) > 0 && (
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
                    {enr.lifecycleCategory === 'requested' && (
                      <button
                        type="button"
                        disabled={processingId === enr.id}
                        onClick={() => executeQuickLifecycle(enr, 'approve', false)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Aprovar Matrícula
                      </button>
                    )}
                    {enr.lifecycleCategory === 'active' && (
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
                    {(enr.lifecycleCategory === 'suspended' || enr.lifecycleCategory === 'expired') && (
                      <button
                        type="button"
                        disabled={processingId === enr.id}
                        onClick={() => executeQuickLifecycle(enr, 'reactivate')}
                        className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Reativar
                      </button>
                    )}
                    {enr.contractSource === 'recurring_plan' && enr.lifecycleCategory !== 'cancelled' && (
                      <button
                        type="button"
                        onClick={() => {
                          setChangePlanServiceId(enr.serviceId || '');
                          setChangePlanAmount(String(enr.amount || ''));
                          setLifecycleReason('');
                          setLifecycleModal({ enrollment: enr, action: 'change_plan' });
                        }}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" /> Trocar Plano
                      </button>
                    )}
                    {enr.lifecycleCategory !== 'cancelled' && (
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
                      onClick={() => handleOpenQrCode(enr.studentId)}
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                      title="Gerar QR Code de Acesso do Aluno"
                    >
                      <QrCode className="w-4 h-4" />
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
                      <div className="font-bold text-indigo-950">Regras de Entrada do Aluno</div>
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

      {/* Modal Congelar / Cancelar / Trocar Plano */}
      {lifecycleModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 mobile-modal">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {lifecycleModal.action === 'freeze'
                  ? 'Congelar Contrato'
                  : lifecycleModal.action === 'change_plan'
                    ? 'Trocar Plano do Aluno'
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

              {lifecycleModal.action === 'change_plan' && (
                <>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Novo Serviço / Plano *</label>
                    <select
                      required
                      value={changePlanServiceId}
                      onChange={e => setChangePlanServiceId(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white"
                    >
                      {services.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
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
                </>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Motivo / Justificativa *</label>
                <input
                  type="text"
                  required
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
                <button type="submit" className="px-5 py-2 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer">
                  Confirmar
                </button>
              </div>
            </form>
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
                      <span>{h.action}</span>
                      <span className="text-[10px] text-slate-400">{String(h.created_at || '').slice(0, 16).replace('T', ' ')}</span>
                    </div>
                    <p className="text-slate-600">{h.summary}</p>
                    {h.reason && <p className="text-[11px] text-indigo-700">Motivo: {h.reason}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal QR Code do Aluno */}
      {qrModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 mobile-modal">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-xs space-y-4 text-center">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Credencial QR Code de Acesso</h3>
              <button type="button" onClick={() => setQrModal(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <QrCode className="w-16 h-16 text-indigo-600 mx-auto" />
              <div className="font-bold text-sm text-slate-900">{qrModal.student?.name}</div>
              <p className="text-[11px] text-slate-500">
                Token assinado temporário (válido até {new Date(qrModal.expiresAt).toLocaleTimeString('pt-BR')}):
              </p>
              <input
                type="text"
                readOnly
                value={qrModal.token}
                onFocus={e => e.target.select()}
                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-[10px] font-mono bg-white text-center"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(qrModal.token);
                  showToast('Token QR copiado para usar no Controle de Acesso!', 'success');
                }}
                className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
              >
                Copiar Token QR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
