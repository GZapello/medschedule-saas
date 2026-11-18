import React, { useState, useEffect, useMemo } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { isStudioProfile } from '../../utils/establishmentContext';
import { PackageFormBody, PackageFormSection, StudioPackageIndicators, StudioPackagePresentation } from './StudioPackagePresentation';
import { Service, Professional } from '../../types';
import { X, Package, CheckCircle2, Layers, Repeat, ShieldCheck, AlertCircle, AlertTriangle } from 'lucide-react';

interface PackageItemDraft {
  serviceId: string;
  selected: boolean;
  includedCredits: number;
  weeklyFrequency: string;
  accessMode: 'unlimited' | 'limited';
  itemPrice: string;
}

interface PackageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  services: Service[];
  professionals: Professional[];
  editingPackage?: any | null;
}

export const PackageModal: React.FC<PackageModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  services,
  professionals,
  editingPackage
}) => {
  const { showToast } = useToast();
  const { currentTenant } = useAuth();
  const isPureStudio = isStudioProfile(currentTenant?.establishment_profile);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [billingType, setBillingType] = useState<'one_time' | 'recurring_monthly'>('recurring_monthly');
  const [billingFrequency, setBillingFrequency] = useState<'monthly' | 'quarterly' | 'semiannual' | 'annual'>('monthly');
  const [price, setPrice] = useState('180.00');
  const [creditMode, setCreditMode] = useState<'per_service' | 'shared_pool'>('per_service');
  const [totalCredits, setTotalCredits] = useState<number>(8);
  const [weeklyLimit, setWeeklyLimit] = useState<string>('');
  const [validityDays, setValidityDays] = useState<number>(30);
  const [installmentsCount, setInstallmentsCount] = useState<number>(1);
  const [dueDay, setDueDay] = useState<number>(10);
  const [absentPolicy, setAbsentPolicy] = useState<'consume' | 'refund'>('consume');
  const [cancelHoursLimit, setCancelHoursLimit] = useState<number>(12);
  const [allowPublicBooking, setAllowPublicBooking] = useState<boolean>(true);
  const [active, setActive] = useState<boolean>(true);

  const [itemMap, setItemMap] = useState<Record<string, PackageItemDraft>>({});

  useEffect(() => {
    if (!isOpen) return;

    const initialMap: Record<string, PackageItemDraft> = {};
    for (const s of services) {
      initialMap[s.id] = {
        serviceId: s.id,
        selected: false,
        includedCredits: s.studio_service_type === 'facility_access' ? 0 : (s.studio_service_type === 'non_scheduled' ? 1 : 4),
        weeklyFrequency: '',
        accessMode: s.access_config?.accessMode === 'limited' ? 'limited' : 'unlimited',
        itemPrice: ''
      };
    }

    if (editingPackage) {
      setName(editingPackage.name || '');
      setDescription(editingPackage.description || '');
      setBillingType(editingPackage.billing_type === 'one_time' ? 'one_time' : 'recurring_monthly');
      setBillingFrequency(
        ['quarterly', 'semiannual', 'annual'].includes(String(editingPackage.billing_frequency || '').toLowerCase())
          ? (String(editingPackage.billing_frequency).toLowerCase() as any)
          : 'monthly'
      );
      setPrice(String(Number(editingPackage.price ?? 0).toFixed(2)));
      setCreditMode(editingPackage.credit_mode === 'shared_pool' ? 'shared_pool' : 'per_service');
      setTotalCredits(Number(editingPackage.total_credits || 8));
      setWeeklyLimit(editingPackage.weekly_limit ? String(editingPackage.weekly_limit) : '');
      setValidityDays(Number(editingPackage.validity_days || 30));
      setInstallmentsCount(Number(editingPackage.installments_count || 1));
      setDueDay(Number(editingPackage.due_day || 10));
      setAbsentPolicy(editingPackage.absent_consumption_policy === 'refund' ? 'refund' : 'consume');
      setCancelHoursLimit(Number(editingPackage.cancellation_hours_limit ?? 12));
      setAllowPublicBooking(editingPackage.allow_public_booking !== 0);
      setActive(editingPackage.active !== 0);

      if (Array.isArray(editingPackage.items)) {
        for (const it of editingPackage.items) {
          if (initialMap[it.service_id]) {
            initialMap[it.service_id] = {
              serviceId: it.service_id,
              selected: true,
              includedCredits: Number(it.included_credits || 4),
              weeklyFrequency: it.weekly_frequency ? String(it.weekly_frequency) : '',
              accessMode: it.access_mode === 'limited' ? 'limited' : 'unlimited',
              itemPrice: it.item_price !== undefined && it.item_price !== null ? String(it.item_price) : ''
            };
          }
        }
      }
    } else {
      setName('');
      setDescription('');
      setBillingType('recurring_monthly');
      setBillingFrequency('monthly');
      setPrice('180.00');
      setCreditMode('per_service');
      setTotalCredits(12);
      setWeeklyLimit('');
      setValidityDays(30);
      setInstallmentsCount(1);
      setDueDay(10);
      setAbsentPolicy('consume');
      setCancelHoursLimit(12);
      setAllowPublicBooking(true);
      setActive(true);
    }

    setItemMap(initialMap);
  }, [isOpen, editingPackage, services]);

  if (!isOpen) return null;

  const profNameById = new Map<string, string>();
  professionals.forEach(p => profNameById.set(p.id, p.name));

  const srvById = useMemo(() => {
    const m = new Map<string, Service>();
    services.forEach(s => m.set(s.id, s));
    return m;
  }, [services]);

  const profById = useMemo(() => {
    const m = new Map<string, Professional>();
    professionals.forEach(p => m.set(p.id, p));
    return m;
  }, [professionals]);

  const getServicePublicIssues = (srv: Service): string[] => {
    const issues: string[] = [];
    const isAccess = srv.studio_service_type === 'facility_access';
    const isDeliverable = srv.studio_service_type === 'non_scheduled';
    const requiresAppt = !isAccess && !isDeliverable && Number(srv.requires_appointment ?? 1) !== 0;

    if (Number(srv.active ?? 1) !== 1) {
      issues.push(`O serviço "${srv.name}" está inativo. Reative-o no cadastro de Serviços ou remova-o do pacote.`);
    }
    if (srv.allow_public_booking === 0 || srv.allow_public_booking === false) {
      issues.push(`O serviço "${srv.name}" está com "Disponibilizar no agendamento público" desativado.`);
    }
    if (requiresAppt) {
      const linked = Array.isArray(srv.linked_professionals) && srv.linked_professionals.length > 0
        ? srv.linked_professionals
        : (srv.professional_id && profById.has(srv.professional_id)
            ? [profById.get(srv.professional_id)!]
            : []);
      const activeLinked = linked.filter(p => Number(p.active ?? 1) === 1);
      const publicLinked = activeLinked.filter(p => Number(p.public_booking_enabled ?? 1) === 1);

      if (activeLinked.length === 0) {
        issues.push(
          linked.length > 0
            ? `O instrutor vinculado a "${srv.name}" está inativo.`
            : `O serviço "${srv.name}" não possui nenhum profissional/instrutor ativo vinculado.`
        );
      } else if (publicLinked.length === 0) {
        issues.push(
          `O(s) instrutor(es) de "${srv.name}" (${activeLinked.map(p => p.name).join(', ')}) está(ão) com agendamento público desativado em Links de Agendamento.`
        );
      }

      if (srv.service_kind === 'group') {
        const diag = srv.schedule_diagnostics;
        if (diag && !diag.isPublicReady) {
          issues.push(
            diag.blockers?.[0]
              ? `"${srv.name}": ${diag.blockers[0]}`
              : `A turma "${srv.name}" não possui horários publicados na grade semanal.`
          );
        } else if (!diag && (!Array.isArray(srv.class_schedules) || srv.class_schedules.filter(c => Number(c.active) !== 0).length === 0)) {
          issues.push(`A aula coletiva "${srv.name}" ainda não possui horários cadastrados na grade semanal.`);
        }
      }
    }
    return issues;
  };

  const selectedItems = Object.values(itemMap).filter(i => i.selected);
  const perServiceComputedTotal = selectedItems.reduce((sum, it) => {
    const srv = srvById.get(it.serviceId);
    if (srv?.studio_service_type === 'facility_access') return sum;
    return sum + (Number(it.includedCredits) || 0);
  }, 0);

  const packagePublicBlockers = useMemo(() => {
    const list: string[] = [];
    if (currentTenant && Number(currentTenant.public_booking_enabled ?? 0) !== 1) {
      list.push('O link público de agendamento do estabelecimento está desativado em Links de Agendamento.');
    }
    if (!active) {
      list.push('Este pacote está marcado como inativo no catálogo.');
    }
    if (!allowPublicBooking) {
      list.push('A opção "Disponibilizar no agendamento público do Studio" está desmarcada.');
    }
    if (selectedItems.length === 0) {
      list.push('Selecione ao menos um serviço ou benefício incluído neste pacote.');
    }
    for (const it of selectedItems) {
      const srv = srvById.get(it.serviceId);
      if (!srv) continue;
      for (const issue of getServicePublicIssues(srv)) {
        if (!list.includes(issue)) list.push(issue);
      }
    }
    return list;
  }, [currentTenant, active, allowPublicBooking, selectedItems, srvById, profById]);

  const toggleService = (serviceId: string) => {
    setItemMap(prev => ({
      ...prev,
      [serviceId]: {
        ...prev[serviceId],
        selected: !prev[serviceId]?.selected
      }
    }));
  };

  const updateItemField = (serviceId: string, field: keyof PackageItemDraft, val: any) => {
    setItemMap(prev => ({
      ...prev,
      [serviceId]: {
        ...prev[serviceId],
        [field]: val
      }
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Informe o nome do pacote.', 'error');
      return;
    }
    const parsedPrice = Number(String(price).replace(',', '.'));
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      showToast('Informe um preço válido.', 'error');
      return;
    }
    if (selectedItems.length === 0) {
      showToast('Selecione ao menos um serviço incluído no pacote.', 'error');
      return;
    }
    if (creditMode === 'per_service') {
      for (const it of selectedItems) {
        const srv = srvById.get(it.serviceId);
        if (srv?.studio_service_type === 'facility_access') continue;
        if (!Number.isInteger(Number(it.includedCredits)) || Number(it.includedCredits) < 1) {
          showToast('Informe a quantidade de aulas (>= 1) para cada modalidade agendável selecionada.', 'error');
          return;
        }
      }
    } else if (!Number.isInteger(Number(totalCredits)) || Number(totalCredits) < 1) {
      showToast('Informe o limite total de aulas do pool compartilhado (>= 1).', 'error');
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      billingType,
      billingFrequency: billingType === 'recurring_monthly' ? billingFrequency : 'monthly',
      price: Math.round(parsedPrice * 100) / 100,
      creditMode,
      totalCredits: creditMode === 'shared_pool' ? Number(totalCredits) : perServiceComputedTotal,
      weeklyLimit: weeklyLimit ? Number(weeklyLimit) : null,
      validityDays: Number(validityDays) || 30,
      installmentsCount: billingType === 'one_time' ? Number(installmentsCount) || 1 : 1,
      dueDay: Number(dueDay) || 10,
      absentConsumptionPolicy: absentPolicy,
      cancellationHoursLimit: Number(cancelHoursLimit) || 0,
      allowPublicBooking,
      active,
      items: selectedItems.map(it => {
        const srv = srvById.get(it.serviceId);
        const isAccess = srv?.studio_service_type === 'facility_access';
        const isDeliverable = srv?.studio_service_type === 'non_scheduled';
        return {
          serviceId: it.serviceId,
          itemType: isAccess ? 'facility_access' : (isDeliverable ? 'deliverable' : 'scheduled_service'),
          accessMode: isAccess ? it.accessMode : 'none',
          includedCredits: isAccess ? null : (creditMode === 'per_service' ? Number(it.includedCredits) : null),
          weeklyFrequency: it.weeklyFrequency ? Number(it.weeklyFrequency) : null,
          itemPrice: it.itemPrice && Number(String(it.itemPrice).replace(',', '.')) >= 0 ? Number(String(it.itemPrice).replace(',', '.')) : null
        };
      })
    };

    try {
      setSaving(true);
      if (editingPackage?.id) {
        await ApiClient.put(`/v1/packages/${editingPackage.id}`, payload);
        showToast('Pacote atualizado! Matrículas antigas mantiveram suas condições originais.', 'success');
      } else {
        await ApiClient.post('/v1/packages', payload);
        showToast('Pacote de serviços criado com sucesso!', 'success');
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao salvar pacote de serviços.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 mobile-modal">
      <StudioPackagePresentation enabled={isPureStudio} onClose={onClose}
        title={editingPackage ? 'Editar Pacote de Serviços' : 'Criar Pacote de Serviços'}
        values={{
          name, price, billingType, billingFrequency, creditMode, totalCredits, weeklyLimit,
          totalClasses: creditMode === 'per_service' ? perServiceComputedTotal : totalCredits,
          validityDays, installmentsCount, dueDay, absentPolicy, cancelHoursLimit,
          allowPublicBooking, active, selectedItems, services
        }}
        className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className={`text-base sm:text-lg font-bold text-slate-900 ${isPureStudio ? "" : "truncate"}`}>
                {editingPackage ? 'Editar Pacote de Serviços' : 'Criar Pacote de Serviços'}
              </h3>
              <p className={`text-xs text-slate-500 ${isPureStudio ? "mt-1" : "truncate"}`}>
                {isPureStudio
                  ? 'Combine diferentes aulas e serviços em um único pacote, definindo valores, validade e regras de utilização.'
                  : 'Combine modalidades e instrutores distintos sem gerar cobrança por sessão individual.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200/60 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <StudioPackageIndicators />

        {active && allowPublicBooking && packagePublicBlockers.length > 0 && (editingPackage || selectedItems.length > 0) && (
          <div className="mx-5 sm:mx-6 mt-2.5 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs shrink-0 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Pendências para este pacote aparecer no link público:</span>
            </div>
            <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-amber-800">
              {packagePublicBlockers.map((blocker, idx) => (
                <li key={idx}>{blocker}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className={isPureStudio ? 'flex flex-col min-h-0 flex-1 text-xs' : 'overflow-y-auto p-5 sm:p-6 space-y-5 text-xs flex-1'}>
          <PackageFormBody>
          {/* Informações Gerais */}
          <div className={isPureStudio ? 'contents' : 'space-y-3'}>
            {!isPureStudio && <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              Informações Gerais e Cobrança
            </h4>}
            <div className={isPureStudio ? 'contents' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>
              <PackageFormSection section="basics">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Nome do Pacote *</label>
                <input
                  type="text"
                  required
                  aria-label={isPureStudio ? "Nome do pacote" : undefined}
                  data-package-field={isPureStudio ? "name" : undefined}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Pacote Pilates + Dança + Zumba (12 aulas)"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white focus:border-indigo-500 outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Descrição</label>
                <textarea
                  rows={2}
                  aria-label={isPureStudio ? "Descrição" : undefined}
                  data-package-field={isPureStudio ? "description" : undefined}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Descreva os benefícios e regras gerais para o aluno e recepção..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white focus:border-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tipo de Cobrança *</label>
                <select
                  aria-label={isPureStudio ? "Tipo de cobrança" : undefined}
                  data-package-field={isPureStudio ? "billingType" : undefined}
                  value={billingType}
                  onChange={e => setBillingType(e.target.value as any)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white font-medium"
                >
                  <option value="recurring_monthly">Assinatura periódica (recorrente)</option>
                  <option value="one_time">Pagamento único (avulso / fechado)</option>
                </select>
              </div>

              {billingType === 'recurring_monthly' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Periodicidade do Pacote *</label>
                  <select
                    aria-label={isPureStudio ? "Periodicidade do pacote" : undefined}
                    data-package-field={isPureStudio ? "billingFrequency" : undefined}
                    value={billingFrequency}
                    onChange={e => setBillingFrequency(e.target.value as any)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white font-medium"
                  >
                    <option value="monthly">Mensal (a cada 1 mês)</option>
                    <option value="quarterly">Trimestral (a cada 3 meses)</option>
                    <option value="semiannual">Semestral (a cada 6 meses)</option>
                    <option value="annual">Anual (a cada 12 meses)</option>
                  </select>
                </div>
              )}

              </PackageFormSection>
              <PackageFormSection section="values">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Valor do Pacote (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  aria-label={isPureStudio ? "Valor do pacote" : undefined}
                  data-package-field={isPureStudio ? "price" : undefined}
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white font-bold text-indigo-700"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Validade da Matrícula (dias) *</label>
                <input
                  type="number"
                  min="1"
                  max="3650"
                  aria-label={isPureStudio ? "Validade da matrícula em dias" : undefined}
                  data-package-field={isPureStudio ? "validityDays" : undefined}
                  value={validityDays}
                  onChange={e => setValidityDays(Number(e.target.value) || 30)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white"
                />
              </div>

              {billingType === 'recurring_monthly' ? (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Dia padrão de vencimento</label>
                  <input
                    type="number"
                    min="1"
                    max="28"
                    aria-label={isPureStudio ? "Dia padrão de vencimento" : undefined}
                    data-package-field={isPureStudio ? "dueDay" : undefined}
                    value={dueDay}
                    onChange={e => setDueDay(Math.min(28, Math.max(1, Number(e.target.value) || 10)))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white"
                  />
                </div>
              ) : (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Parcelamento máximo do pacote</label>
                  <select
                    aria-label={isPureStudio ? "Parcelamento máximo do pacote" : undefined}
                    data-package-field={isPureStudio ? "installmentsCount" : undefined}
                    value={installmentsCount}
                    onChange={e => setInstallmentsCount(Number(e.target.value) || 1)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white"
                  >
                    {[1, 2, 3, 4, 6, 10, 12].map(n => (
                      <option key={n} value={n}>{n === 1 ? 'À vista (1x)' : `Em ${n}x no pacote`}</option>
                    ))}
                  </select>
                </div>
              )}
              </PackageFormSection>
            </div>
          </div>

          {/* Modo de Créditos */}
          <PackageFormSection section="distribution">
          <div className={isPureStudio ? 'space-y-3' : 'p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-3'}>
            {!isPureStudio && <h4 className="font-bold text-indigo-950 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <Repeat className="w-3.5 h-3.5 text-indigo-600" />
              Distribuição das Aulas no Pacote
            </h4>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setCreditMode('per_service')}
                aria-pressed={isPureStudio ? creditMode === 'per_service' : undefined}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  creditMode === 'per_service'
                    ? 'bg-white border-indigo-500 ring-2 ring-indigo-500/20'
                    : 'bg-white/70 border-slate-200 hover:border-indigo-300'
                }`}
              >
                <div className="font-bold text-slate-900">Limite por Modalidade</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Ex: 4 Pilates + 4 Dança + 4 Zumba</div>
              </button>

              <button
                type="button"
                onClick={() => setCreditMode('shared_pool')}
                aria-pressed={isPureStudio ? creditMode === 'shared_pool' : undefined}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  creditMode === 'shared_pool'
                    ? 'bg-white border-indigo-500 ring-2 ring-indigo-500/20'
                    : 'bg-white/70 border-slate-200 hover:border-indigo-300'
                }`}
              >
                <div className="font-bold text-slate-900">Pacote Livre (Pool Compartilhado)</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Ex: Até 12 aulas livres entre os serviços marcados</div>
              </button>
            </div>

            {creditMode === 'shared_pool' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Total de aulas no período *</label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    aria-label={isPureStudio ? "Total de aulas no período" : undefined}
                    data-package-field={isPureStudio ? "totalCredits" : undefined}
                    value={totalCredits}
                    onChange={e => setTotalCredits(Number(e.target.value) || 1)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Limite semanal global (opcional)</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    placeholder="Sem teto semanal"
                    aria-label={isPureStudio ? "Limite semanal global" : undefined}
                    data-package-field={isPureStudio ? "weeklyLimit" : undefined}
                    value={weeklyLimit}
                    onChange={e => setWeeklyLimit(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white"
                  />
                </div>
              </div>
            )}
          </div>

          </PackageFormSection>

          {/* Serviços Incluídos */}
          <PackageFormSection section="services">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                Serviços e Aulas Incluídos ({selectedItems.length} selecionado{selectedItems.length === 1 ? '' : 's'})
              </h4>
              <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full">
                Total previsto: {creditMode === 'per_service' ? perServiceComputedTotal : totalCredits} aulas
              </span>
            </div>

            {services.length === 0 ? (
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Cadastre serviços individuais ou turmas antes de montar um pacote.</span>
              </div>
            ) : (
              <div className={isPureStudio ? "space-y-2" : "space-y-2 max-h-60 overflow-y-auto pr-1"}>
                {services.map(srv => {
                  const draft = itemMap[srv.id] || { serviceId: srv.id, selected: false, includedCredits: 4, weeklyFrequency: '', accessMode: 'unlimited', itemPrice: '' };
                  const profName = srv.professional_id ? profNameById.get(srv.professional_id) : null;
                  const isAccess = srv.studio_service_type === 'facility_access';
                  const isDeliverable = srv.studio_service_type === 'non_scheduled';
                  const srvPublicIssues = getServicePublicIssues(srv);
                  return (
                    <div
                      key={srv.id}
                      className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                        draft.selected ? 'bg-indigo-50/40 border-indigo-300' : 'bg-white border-slate-200'
                      }`}
                    >
                      <label className="flex items-start gap-2.5 cursor-pointer flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={draft.selected}
                          onChange={() => toggleService(srv.id)}
                          className="mt-0.5 w-4 h-4 text-indigo-600 rounded border-slate-300 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`font-bold text-slate-900 ${isPureStudio ? "break-words" : "truncate"}`}>{srv.name}</span>
                            {srvPublicIssues.length > 0 && (
                              <span
                                title={srvPublicIssues[0]}
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200"
                              >
                                Pendência p/ publicação online
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-2">
                            {isAccess ? (
                              <span className="text-indigo-700 font-semibold">Plano de Acesso (Sem agenda / sem horário fixo)</span>
                            ) : isDeliverable ? (
                              <span className="text-amber-700 font-semibold">Benefício Entregável (Sem agenda)</span>
                            ) : (
                              <span>{srv.duration_minutes} min</span>
                            )}
                            {srv.service_kind === 'group' && !isAccess && <span className="text-teal-700 font-semibold">Turma ({srv.default_capacity || 1} vagas)</span>}
                            {profName && <span className="text-slate-600 font-medium">Instrutor: {profName}</span>}
                          </div>
                        </div>
                      </label>

                      {draft.selected && isAccess && (
                        <div className="flex items-center gap-2 shrink-0 pl-6 sm:pl-0">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500">Modo de acesso</label>
                            <select
                              value={draft.accessMode}
                              onChange={e => updateItemField(srv.id, 'accessMode', e.target.value)}
                              className="border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold bg-white"
                            >
                              <option value="unlimited">Livre (Ilimitado)</option>
                              <option value="limited">Limitado por semana</option>
                            </select>
                          </div>
                          {draft.accessMode === 'limited' && (
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500">Por semana</label>
                              <input
                                type="number"
                                min="1"
                                max="14"
                                placeholder="3"
                                value={draft.weeklyFrequency}
                                onChange={e => updateItemField(srv.id, 'weeklyFrequency', e.target.value)}
                                className="w-16 border border-slate-200 rounded-lg px-2 py-1 text-xs text-center bg-white"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {draft.selected && !isAccess && creditMode === 'per_service' && (
                        <div className="flex items-center gap-2 shrink-0 pl-6 sm:pl-0">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500">{isDeliverable ? 'Entregas' : 'Qtd. aulas'}</label>
                            <input
                              type="number"
                              min="1"
                              max="500"
                              aria-label={isPureStudio ? `Quantidade de aulas de ${srv.name}` : undefined}
                              data-package-field={isPureStudio ? `credits-${srv.id}` : undefined}
                              value={draft.includedCredits}
                              onChange={e => updateItemField(srv.id, 'includedCredits', Number(e.target.value) || 1)}
                              className="w-16 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-center bg-white"
                            />
                          </div>
                          {!isDeliverable && (
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500">Por semana</label>
                              <input
                                type="number"
                                min="1"
                                max="14"
                                placeholder="-"
                                aria-label={isPureStudio ? `Aulas por semana de ${srv.name}` : undefined}
                                value={draft.weeklyFrequency}
                                onChange={e => updateItemField(srv.id, 'weeklyFrequency', e.target.value)}
                                className="w-16 border border-slate-200 rounded-lg px-2 py-1 text-xs text-center bg-white"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          </PackageFormSection>

          {/* Políticas */}
          <PackageFormSection section="complementary">
          <div className={isPureStudio ? 'space-y-3' : 'p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3'}>
            {!isPureStudio && <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Regras de Falta, Cancelamento e Divulgação
            </h4>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Em caso de falta (sem aviso)</label>
                <select
                  aria-label={isPureStudio ? "Em caso de falta" : undefined}
                  data-package-field={isPureStudio ? "absentPolicy" : undefined}
                  value={absentPolicy}
                  onChange={e => setAbsentPolicy(e.target.value as any)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white"
                >
                  <option value="consume">Consumir aula do saldo do pacote</option>
                  <option value="refund">Restituir crédito para remarcação</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Antecedência de cancelamento (h)</label>
                <input
                  type="number"
                  min="0"
                  max="168"
                  aria-label={isPureStudio ? "Antecedência de cancelamento" : undefined}
                  data-package-field={isPureStudio ? "cancelHoursLimit" : undefined}
                  value={cancelHoursLimit}
                  onChange={e => setCancelHoursLimit(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-5 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowPublicBooking}
                  onChange={e => setAllowPublicBooking(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                />
                <span className="font-semibold text-slate-700">Disponibilizar no agendamento público do Studio</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={e => setActive(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                />
                <span className="font-semibold text-slate-700">Pacote ativo no catálogo</span>
              </label>
            </div>

            {packagePublicBlockers.length === 0 ? (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Pronto para exibição no link público</div>
                  <p className="text-[11px] text-emerald-800 mt-0.5">
                    Este pacote atende a todos os requisitos e será exibido para contratação online.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Diagnóstico do Link Público — o que falta configurar:</span>
                </div>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-amber-800">
                  {packagePublicBlockers.map((blocker, idx) => (
                    <li key={idx}>{blocker}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          </PackageFormSection>
          </PackageFormBody>

          <div className={isPureStudio ? 'studio-package-footer shrink-0 flex items-center justify-end gap-2 px-5 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/80' : 'flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100'}>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              {saving ? 'Salvando...' : isPureStudio || editingPackage ? 'Salvar Pacote' : 'Criar Pacote'}
            </button>
          </div>
        </form>
      </StudioPackagePresentation>
    </div>
  );
};
