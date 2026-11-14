import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Service, Professional } from '../../types';
import { X, Package, CheckCircle2, Layers, Repeat, Calendar, ShieldCheck, AlertCircle } from 'lucide-react';

interface PackageItemDraft {
  serviceId: string;
  selected: boolean;
  includedCredits: number;
  weeklyFrequency: string;
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
        includedCredits: 4,
        weeklyFrequency: ''
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
              weeklyFrequency: it.weekly_frequency ? String(it.weekly_frequency) : ''
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

  const selectedItems = Object.values(itemMap).filter(i => i.selected);
  const perServiceComputedTotal = selectedItems.reduce((sum, it) => sum + (Number(it.includedCredits) || 0), 0);

  const toggleService = (serviceId: string) => {
    setItemMap(prev => ({
      ...prev,
      [serviceId]: {
        ...prev[serviceId],
        selected: !prev[serviceId]?.selected
      }
    }));
  };

  const updateItemField = (serviceId: string, field: 'includedCredits' | 'weeklyFrequency', val: any) => {
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
        if (!Number.isInteger(Number(it.includedCredits)) || Number(it.includedCredits) < 1) {
          showToast('Informe a quantidade de aulas (>= 1) para cada modalidade selecionada.', 'error');
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
      items: selectedItems.map(it => ({
        serviceId: it.serviceId,
        includedCredits: creditMode === 'per_service' ? Number(it.includedCredits) : null,
        weeklyFrequency: it.weeklyFrequency ? Number(it.weeklyFrequency) : null
      }))
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
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {editingPackage ? 'Editar Pacote de Serviços' : 'Criar Pacote de Serviços'}
              </h3>
              <p className="text-xs text-slate-500 truncate">
                Combine modalidades e instrutores distintos sem gerar cobrança por sessão individual.
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 sm:p-6 space-y-5 text-xs flex-1">
          {/* Informações Gerais */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              Informações Gerais e Cobrança
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Nome do Pacote *</label>
                <input
                  type="text"
                  required
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
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Descreva os benefícios e regras gerais para o aluno e recepção..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white focus:border-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tipo de Cobrança *</label>
                <select
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

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Valor do Pacote (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
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
                    value={dueDay}
                    onChange={e => setDueDay(Math.min(28, Math.max(1, Number(e.target.value) || 10)))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white"
                  />
                </div>
              ) : (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Parcelamento máximo do pacote</label>
                  <select
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
            </div>
          </div>

          {/* Modo de Créditos */}
          <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-3">
            <h4 className="font-bold text-indigo-950 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <Repeat className="w-3.5 h-3.5 text-indigo-600" />
              Distribuição das Aulas no Pacote
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setCreditMode('per_service')}
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
                    value={weeklyLimit}
                    onChange={e => setWeeklyLimit(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Serviços Incluídos */}
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
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {services.map(srv => {
                  const draft = itemMap[srv.id] || { serviceId: srv.id, selected: false, includedCredits: 4, weeklyFrequency: '' };
                  const profName = srv.professional_id ? profNameById.get(srv.professional_id) : null;
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
                          <div className="font-bold text-slate-900 truncate">{srv.name}</div>
                          <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-2">
                            <span>{srv.duration_minutes} min</span>
                            {srv.service_kind === 'group' && <span className="text-teal-700 font-semibold">Turma ({srv.default_capacity || 1} vagas)</span>}
                            {profName && <span className="text-slate-600 font-medium">Instrutor: {profName}</span>}
                          </div>
                        </div>
                      </label>

                      {draft.selected && creditMode === 'per_service' && (
                        <div className="flex items-center gap-2 shrink-0 pl-6 sm:pl-0">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500">Qtd. aulas</label>
                            <input
                              type="number"
                              min="1"
                              max="500"
                              value={draft.includedCredits}
                              onChange={e => updateItemField(srv.id, 'includedCredits', Number(e.target.value) || 1)}
                              className="w-16 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-center bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500">Por semana</label>
                            <input
                              type="number"
                              min="1"
                              max="14"
                              placeholder="-"
                              value={draft.weeklyFrequency}
                              onChange={e => updateItemField(srv.id, 'weeklyFrequency', e.target.value)}
                              className="w-16 border border-slate-200 rounded-lg px-2 py-1 text-xs text-center bg-white"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Políticas */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Regras de Falta, Cancelamento e Divulgação
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Em caso de falta (sem aviso)</label>
                <select
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
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
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
              {saving ? 'Salvando...' : editingPackage ? 'Salvar Pacote' : 'Criar Pacote'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
