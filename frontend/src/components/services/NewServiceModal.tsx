import React, { useState, useEffect, useMemo } from 'react';
import { X, Plus, Edit3, Loader2, Users } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { Professional, Room, Service } from '../../types';
import { ClassScheduleSection, DraftClassScheduleInput } from './ClassScheduleSection';
import { ServiceRecurrenceConfigPanel } from './ServiceRecurrenceConfigPanel';
import { ServiceBillingConfigPanel, ServicePackageOption } from './ServiceBillingConfigPanel';
import { LinkedInstructorsSelector } from './LinkedInstructorsSelector';
import {
  ALL_PLAN_DURATIONS,
  isMixedProfile,
  isPeriodicBillingMode,
  isStudioProfile,
  normalizeEstablishmentProfile,
  parseServiceRecurrenceConfig,
  PlanDurationCode,
  RecurrenceFrequency,
  RecurrenceIntervalSpec,
  resolveServiceDomain,
  ServiceBillingMode,
  ServiceDomain,
  supportsStudioFeatures
} from '../../utils/establishmentContext';

interface NewServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (saved: { id: string; name: string; [key: string]: any }) => void;
  initialProfessionalId?: string;
  professionals?: Professional[];
  serviceToEdit?: Service | null;
  zIndex?: string;
}

export const NewServiceModal: React.FC<NewServiceModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialProfessionalId,
  professionals = [],
  serviceToEdit = null,
  zIndex = 'z-[60]'
}) => {
  const { showToast } = useToast();
  const { currentTenant } = useAuth();
  const isEditing = Boolean(serviceToEdit?.id);
  const establishmentProfile = normalizeEstablishmentProfile(currentTenant?.establishment_profile);
  const isStudioCompatible = supportsStudioFeatures(establishmentProfile);
  const isMixed = isMixedProfile(establishmentProfile);
  const isPureStudio = isStudioProfile(establishmentProfile);

  const [professionalId, setProfessionalId] = useState<string>('');
  const [linkedProfessionalIds, setLinkedProfessionalIds] = useState<string[]>([]);
  const [name, setName] = useState<string>('');
  const [price, setPrice] = useState<string>('150');
  const [durationMinutes, setDurationMinutes] = useState<number>(50);
  const [bufferMinutes, setBufferMinutes] = useState<number>(0);
  const [modality, setModality] = useState<'both' | 'presential' | 'online' | 'home'>('both');
  const [serviceDomain, setServiceDomain] = useState<ServiceDomain>(isPureStudio ? 'studio' : 'clinical');
  const [serviceKind, setServiceKind] = useState<'individual' | 'group'>('individual');
  const [defaultCapacity, setDefaultCapacity] = useState<number>(10);
  const [allowRecurrence, setAllowRecurrence] = useState<boolean>(true);
  const [allowedFrequencies, setAllowedFrequencies] = useState<RecurrenceFrequency[]>(['weekly']);
  const [defaultFrequency, setDefaultFrequency] = useState<RecurrenceFrequency>('weekly');
  const [customIntervals, setCustomIntervals] = useState<RecurrenceIntervalSpec[]>([]);
  const [defaultCustomInterval, setDefaultCustomInterval] = useState<RecurrenceIntervalSpec | null>(null);
  const [allowedPlanDurations, setAllowedPlanDurations] = useState<Exclude<PlanDurationCode, 'legacy_frequency'>[]>([...ALL_PLAN_DURATIONS]);
  const [defaultPlanDuration, setDefaultPlanDuration] = useState<Exclude<PlanDurationCode, 'legacy_frequency'>>('1_month');
  const [billingMode, setBillingMode] = useState<ServiceBillingMode>('per_session');
  const [periodicPrice, setPeriodicPrice] = useState<string>('');
  const [defaultPackageId, setDefaultPackageId] = useState<string>('');
  const [defaultBillingDueDay, setDefaultBillingDueDay] = useState<string>('');
  const [availablePackages, setAvailablePackages] = useState<ServicePackageOption[]>([]);
  const [description, setDescription] = useState<string>('');
  const [draftSchedules, setDraftSchedules] = useState<DraftClassScheduleInput[]>([]);
  const [hasPendingScheduleForm, setHasPendingScheduleForm] = useState<boolean>(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const showStudioConfig = isPureStudio || (isMixed && serviceDomain === 'studio');

  useEffect(() => {
    if (isOpen && isStudioCompatible) {
      ApiClient.get<Room[]>('/v1/rooms')
        .then(res => setRooms(Array.isArray(res) ? res : []))
        .catch(() => setRooms([]));
      ApiClient.get<{ packages: ServicePackageOption[] }>('/v1/packages')
        .then(res => setAvailablePackages(Array.isArray(res?.packages) ? res.packages : []))
        .catch(() => setAvailablePackages([]));
    }
  }, [isOpen, isStudioCompatible]);

  useEffect(() => {
    if (isOpen) {
      setDraftSchedules([]);
      setHasPendingScheduleForm(false);
      if (serviceToEdit) {
        const domain = resolveServiceDomain({
          establishmentProfile,
          serviceDomain: serviceToEdit.service_domain,
          serviceKind: serviceToEdit.service_kind,
          clinicalModule: serviceToEdit.clinical_module
        });
        const recCfg = parseServiceRecurrenceConfig(serviceToEdit);
        setName(serviceToEdit.name || '');
        setPrice(String(serviceToEdit.price ?? '150'));
        setDurationMinutes(Number(serviceToEdit.duration_minutes) || 50);
        setBufferMinutes(Number(serviceToEdit.buffer_minutes) || 0);
        setModality((serviceToEdit.modality as any) || 'both');
        setServiceDomain(domain);
        setServiceKind(domain === 'studio' && serviceToEdit.service_kind === 'group' ? 'group' : 'individual');
        setDefaultCapacity(Number(serviceToEdit.default_capacity) || 10);
        setAllowRecurrence(recCfg.allowRecurrence);
        setAllowedFrequencies(
          recCfg.hasExplicitConfig
            ? recCfg.allowedFrequencies
            : (recCfg.allowRecurrence ? ['weekly'] : [])
        );
        setDefaultFrequency(recCfg.defaultFrequency || 'weekly');
        setCustomIntervals(recCfg.customIntervals || []);
        setDefaultCustomInterval(recCfg.defaultCustomInterval || null);
        setAllowedPlanDurations(recCfg.allowedPlanDurations || [...ALL_PLAN_DURATIONS]);
        setDefaultPlanDuration(recCfg.defaultPlanDuration || '1_month');
        setBillingMode(((domain === 'studio' && serviceToEdit.billing_mode) || 'per_session') as ServiceBillingMode);
        setPeriodicPrice(serviceToEdit.periodic_price !== undefined && serviceToEdit.periodic_price !== null ? String(serviceToEdit.periodic_price) : '');
        setDefaultPackageId(serviceToEdit.default_package_id || '');
        setDefaultBillingDueDay(serviceToEdit.default_billing_due_day !== undefined && serviceToEdit.default_billing_due_day !== null ? String(serviceToEdit.default_billing_due_day) : '');
        setDescription(serviceToEdit.description || '');
        const editPrimaryId = serviceToEdit.professional_id || initialProfessionalId || professionals[0]?.id || '';
        setProfessionalId(editPrimaryId);
        const existingLinked = Array.isArray(serviceToEdit.linked_professional_ids) && serviceToEdit.linked_professional_ids.length > 0
          ? serviceToEdit.linked_professional_ids
          : (editPrimaryId ? [editPrimaryId] : []);
        setLinkedProfessionalIds(Array.from(new Set([editPrimaryId, ...existingLinked].filter(Boolean))));
      } else {
        setName('');
        setPrice('150');
        setDurationMinutes(50);
        setBufferMinutes(0);
        setModality('both');
        setServiceDomain(isPureStudio ? 'studio' : 'clinical');
        setServiceKind('individual');
        setDefaultCapacity(10);
        setAllowRecurrence(true);
        setAllowedFrequencies(['weekly']);
        setDefaultFrequency('weekly');
        setCustomIntervals([]);
        setDefaultCustomInterval(null);
        setAllowedPlanDurations([...ALL_PLAN_DURATIONS]);
        setDefaultPlanDuration('1_month');
        setBillingMode('per_session');
        setPeriodicPrice('');
        setDefaultPackageId('');
        setDefaultBillingDueDay('');
        setDescription('');
        let defaultProf = '';
        if (initialProfessionalId && professionals.some(p => p.id === initialProfessionalId)) {
          defaultProf = initialProfessionalId;
        } else if (professionals.length > 0) {
          defaultProf = professionals[0].id;
        }
        setProfessionalId(defaultProf);
        setLinkedProfessionalIds(defaultProf ? [defaultProf] : []);
      }
    }
  }, [isOpen, initialProfessionalId, professionals, serviceToEdit]);

  const selectableScheduleProfessionals = useMemo(() => {
    const activeIds = new Set([professionalId, ...linkedProfessionalIds].filter(Boolean));
    const matched = professionals.filter(p => activeIds.has(p.id));
    return matched.length > 0 ? matched : professionals;
  }, [professionals, professionalId, linkedProfessionalIds]);

  const lockedLinkedInstructorIds = useMemo(() => {
    if (!isEditing || !serviceToEdit?.class_schedules) return [];
    return Array.from(
      new Set(
        serviceToEdit.class_schedules
          .filter(cs => Number(cs.active) !== 0)
          .map(cs => cs.professional_id)
          .filter(Boolean)
      )
    );
  }, [isEditing, serviceToEdit]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('O nome do serviço é obrigatório', 'error');
      return;
    }
    if (!professionalId) {
      showToast('Selecione o profissional responsável', 'error');
      return;
    }
    const numPrice = String(price).trim() !== '' ? parseFloat(String(price).replace(',', '.')) : 0;
    if (isNaN(numPrice) || numPrice < 0) {
      showToast('Informe um valor válido para o serviço', 'error');
      return;
    }
    const isPeriodicSave = showStudioConfig && isPeriodicBillingMode(billingMode);
    const numPeriodicPrice = parseFloat(String(periodicPrice).replace(',', '.'));
    if (isPeriodicSave && (periodicPrice.trim() === '' || isNaN(numPeriodicPrice) || numPeriodicPrice < 0)) {
      showToast('Informe um valor por período de cobrança válido', 'error');
      return;
    }
    if (isPeriodicSave && defaultBillingDueDay.trim() !== '') {
      const dueNum = Number(defaultBillingDueDay);
      if (!Number.isInteger(dueNum) || dueNum < 1 || dueNum > 28) {
        showToast('Dia de vencimento padrão deve estar entre 1 e 28', 'error');
        return;
      }
    }
    if (showStudioConfig && serviceKind === 'group' && (!Number.isInteger(Number(defaultCapacity)) || Number(defaultCapacity) < 1)) {
      showToast('Informe um número inteiro positivo de vagas para a turma', 'error');
      return;
    }
    if (showStudioConfig && serviceKind === 'group' && hasPendingScheduleForm) {
      showToast('Confirme ou cancele o horário aberto na grade semanal antes de salvar a aula.', 'error');
      return;
    }

    try {
      setLoading(true);
      const effectiveKind = showStudioConfig ? serviceKind : 'individual';
      const normalizedLinkedIds = showStudioConfig
        ? Array.from(new Set([professionalId, ...linkedProfessionalIds].filter(Boolean)))
        : [professionalId];
      const shouldSendDraftSchedules =
        showStudioConfig &&
        effectiveKind === 'group' &&
        (!isEditing || serviceToEdit?.service_kind !== 'group') &&
        draftSchedules.length > 0;
      const payload: any = {
        professionalId,
        ...(showStudioConfig ? { linkedProfessionalIds: normalizedLinkedIds } : {}),
        name: name.trim(),
        price: numPrice,
        durationMinutes: Number(durationMinutes) || 50,
        bufferMinutes: Number(bufferMinutes) || 0,
        modality,
        serviceKind: effectiveKind,
        defaultCapacity: effectiveKind === 'group' ? Number(defaultCapacity) : null,
        allowRecurrence,
        ...(isStudioCompatible ? { serviceDomain: showStudioConfig ? 'studio' : 'clinical' } : {}),
        ...(showStudioConfig
          ? {
              allowedRecurrenceFrequencies: allowRecurrence ? allowedFrequencies : [],
              defaultRecurrenceFrequency: allowRecurrence ? defaultFrequency : null,
              customRecurrenceIntervals: allowRecurrence && allowedFrequencies.includes('custom_interval') ? customIntervals : [],
              defaultRecurrenceInterval: allowRecurrence && allowedFrequencies.includes('custom_interval') ? defaultCustomInterval : null,
              allowedPlanDurations: allowRecurrence ? allowedPlanDurations : [],
              defaultPlanDuration: allowRecurrence ? defaultPlanDuration : null,
              billingMode,
              periodicPrice: isPeriodicSave ? numPeriodicPrice : null,
              defaultPackageId: billingMode === 'package' && defaultPackageId ? defaultPackageId : null,
              defaultBillingDueDay: isPeriodicSave && defaultBillingDueDay.trim() !== '' ? Number(defaultBillingDueDay) : null
            }
          : {}),
        classSchedules: shouldSendDraftSchedules ? draftSchedules : undefined,
        description: description.trim() || null
      };

      const res = isEditing && serviceToEdit
        ? await ApiClient.put<any>(`/v1/services/${serviceToEdit.id}`, payload)
        : await ApiClient.post<any>('/v1/services', payload);

      const savedData = res?.service || { id: serviceToEdit?.id, ...payload, ...res };
      const activeScheduleCount = Array.isArray(savedData?.class_schedules)
        ? savedData.class_schedules.filter((s: any) => Number(s.active) !== 0).length
        : 0;

      if (showStudioConfig && effectiveKind === 'group' && activeScheduleCount === 0) {
        showToast(
          isEditing
            ? 'Aula salva como rascunho interno. Adicione dias e horários para disponibilizá-la no agendamento público.'
            : 'Serviço salvo como rascunho interno! Adicione ao menos um horário na grade para liberar no agendamento online.',
          'info'
        );
      } else {
        showToast(isEditing ? 'Serviço atualizado com sucesso!' : 'Serviço cadastrado com sucesso!', 'success');
      }
      if (Array.isArray(res?.schedule_warnings) && res.schedule_warnings.length > 0) {
        showToast(res.schedule_warnings[0], 'info');
      }
      onSuccess(savedData);
      onClose();
    } catch (err: any) {
      showToast(err.message || err.error || (isEditing ? 'Erro ao atualizar serviço' : 'Erro ao cadastrar serviço'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`fixed inset-0 ${zIndex} bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 mobile-modal`}>
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 text-xs flex flex-col max-h-[92dvh] overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              {isEditing ? <Edit3 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{isEditing ? 'Editar Serviço' : 'Novo Serviço'}</h3>
              <p className="text-[11px] text-slate-400">{isEditing ? 'Atualização rápida de atendimento' : 'Cadastro rápido de atendimento'}</p>
            </div>
          </div>
          <button
            aria-label="Fechar"
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Profissional Responsável <span className="text-rose-500">*</span>
            </label>
            <select
              value={professionalId}
              onChange={e => {
                const nextPrimary = e.target.value;
                setProfessionalId(nextPrimary);
                if (nextPrimary) {
                  setLinkedProfessionalIds(prev => Array.from(new Set([nextPrimary, ...prev])));
                }
              }}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium"
              required
            >
              <option value="">Selecione o profissional...</option>
              {professionals.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.profession_name ? `(${p.profession_name})` : ''}
                </option>
              ))}
            </select>

            {showStudioConfig && (
              <div className="mt-2">
                <LinkedInstructorsSelector
                  professionals={professionals}
                  primaryProfessionalId={professionalId}
                  selectedIds={linkedProfessionalIds}
                  onChange={setLinkedProfessionalIds}
                  lockedIds={lockedLinkedInstructorIds}
                />
              </div>
            )}
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Nome do Serviço <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Consulta Inicial, Sessão de Fisioterapia..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {showStudioConfig ? 'Preço por Atendimento / Aula (R$) *' : <>Preço (R$) <span className="text-rose-500">*</span></>}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="150.00"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Duração (minutos) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="5"
                min="5"
                max="480"
                value={durationMinutes}
                onChange={e => setDurationMinutes(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                required
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Modalidade</label>
            <select
              value={modality}
              onChange={e => setModality(e.target.value as any)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
            >
              <option value="both">Presencial ou Online</option>
              <option value="presential">Apenas Presencial</option>
              <option value="online">Apenas Online</option>
              <option value="home">Domiciliar</option>
            </select>
          </div>

          {isMixed && (
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="font-bold text-slate-800">Segmento do Serviço</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setServiceDomain('clinical');
                    setServiceKind('individual');
                  }}
                  className={`px-3 py-2 rounded-xl border text-left font-semibold transition-all cursor-pointer ${
                    serviceDomain === 'clinical'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Atendimento Clínico
                </button>
                <button
                  type="button"
                  onClick={() => setServiceDomain('studio')}
                  className={`px-3 py-2 rounded-xl border text-left font-semibold transition-all cursor-pointer ${
                    serviceDomain === 'studio'
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Aula / Serviço de Studio
                </button>
              </div>
            </div>
          )}

          {showStudioConfig ? (
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-teal-600" />
                Configurações do Studio
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setServiceKind('individual')}
                  className={`px-3 py-2 rounded-xl border text-left font-semibold transition-all cursor-pointer ${
                    serviceKind === 'individual'
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Individual
                </button>
                <button
                  type="button"
                  onClick={() => setServiceKind('group')}
                  className={`px-3 py-2 rounded-xl border text-left font-semibold transition-all cursor-pointer ${
                    serviceKind === 'group'
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Aula coletiva / Turma
                </button>
              </div>
              {serviceKind === 'group' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Vagas por aula/turma <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    step={1}
                    value={defaultCapacity}
                    onChange={e => setDefaultCapacity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white"
                    required
                  />
                </div>
              )}
              {serviceKind === 'group' && (
                <ClassScheduleSection
                  serviceId={isEditing && serviceToEdit?.service_kind === 'group' ? serviceToEdit.id : null}
                  serviceModality={modality}
                  durationMinutes={Number(durationMinutes) || 50}
                  defaultCapacity={Number(defaultCapacity) || 10}
                  defaultProfessionalId={professionalId}
                  professionals={selectableScheduleProfessionals}
                  rooms={rooms}
                  draftSchedules={draftSchedules}
                  onDraftSchedulesChange={setDraftSchedules}
                  onFormOpenChange={setHasPendingScheduleForm}
                />
              )}
              <ServiceRecurrenceConfigPanel
                allowRecurrence={allowRecurrence}
                allowedFrequencies={allowedFrequencies}
                defaultFrequency={defaultFrequency}
                customIntervals={customIntervals}
                defaultCustomInterval={defaultCustomInterval}
                allowedPlanDurations={allowedPlanDurations}
                defaultPlanDuration={defaultPlanDuration}
                onChange={next => {
                  setAllowRecurrence(next.allowRecurrence);
                  setAllowedFrequencies(next.allowedFrequencies);
                  setDefaultFrequency(next.defaultFrequency);
                  setCustomIntervals(next.customIntervals);
                  setDefaultCustomInterval(next.defaultCustomInterval);
                  setAllowedPlanDurations(next.allowedPlanDurations);
                  setDefaultPlanDuration(next.defaultPlanDuration);
                }}
              />
              <ServiceBillingConfigPanel
                compact
                serviceName={name}
                billingMode={billingMode}
                sessionPrice={Number(price) || 0}
                periodicPrice={periodicPrice}
                defaultPackageId={defaultPackageId}
                defaultBillingDueDay={defaultBillingDueDay}
                availablePackages={availablePackages}
                onChange={next => {
                  setBillingMode(next.billingMode);
                  setPeriodicPrice(next.periodicPrice);
                  setDefaultPackageId(next.defaultPackageId);
                  setDefaultBillingDueDay(next.defaultBillingDueDay);
                }}
              />
            </div>
          ) : (
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label className="flex items-center gap-2 text-[11px] font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowRecurrence}
                  onChange={e => setAllowRecurrence(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-indigo-600 border-slate-300"
                />
                <span>Permitir repetição/recorrência na agenda</span>
              </label>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Descrição (opcional)</label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Breve descrição do procedimento ou orientações ao paciente..."
              className="w-full border border-slate-200 rounded-xl p-2.5 text-xs resize-none"
            />
          </div>
          </div>

          <div className="shrink-0 flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100 bg-white">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim() || !professionalId}
              className="inline-flex items-center gap-1.5 px-5 py-2 font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Serviço'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
