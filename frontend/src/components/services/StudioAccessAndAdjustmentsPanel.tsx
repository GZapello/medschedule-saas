import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import {
  KeyRound,
  User,
  Users,
  FileCheck2,
  Clock,
  ShieldAlert,
  Plus,
  Trash2,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import {
  StudioServiceType,
  StudioAccessConfig,
  StudioPriceAdjustmentRule,
  StudioCommercialPriceOption,
  StudioOptionalAddonsConfig,
  StudioOptionalAddonOption,
  AddonAttendanceFormat,
  AddonProfessionalSelectionMode,
  DEFAULT_STUDIO_ACCESS_CONFIG,
  PAYMENT_PERIODICITY_LABELS,
  COMMERCIAL_UNIT_LABELS,
  PLAN_CREDIT_MODE_LABELS,
  PlanCreditMode,
  calculateCommercialOptionBreakdown,
  ADDON_BILLING_PERIODICITY_LABELS,
  ADDON_SCHEDULE_TIMING_LABELS,
  addonAppliesToBaseOption,
  getDefaultOptionalAddonsConfig,
  resolveDefaultAddonCreditsPerCycle
} from '../../utils/studioAccessAndCommercial';
import { PLAN_DURATION_LABELS } from '../../utils/establishmentContext';

const LazyNewServiceModal = React.lazy(() =>
  import('./NewServiceModal').then(m => ({ default: m.NewServiceModal }))
);

export interface AddonCandidateService {
  id: string;
  name: string;
  active?: number | boolean;
  studio_service_type?: string;
  service_kind?: string;
  requires_appointment?: number | boolean;
  is_schedulable?: boolean;
  service_domain?: string;
  professional_id?: string | null;
  linked_professional_ids?: string[];
  eligible_professional_ids?: string[];
  eligible_professionals?: Array<{
    id: string;
    name: string;
    profession_name?: string | null;
    public_booking_enabled?: boolean | number;
    has_active_schedule?: boolean;
  }>;
}

export interface AddonCandidateProfessional {
  id: string;
  name: string;
  profession_id?: string | null;
  profession_name?: string | null;
  available_modules?: Array<{ code: string; label?: string }>;
  practice_areas?: string;
  active?: number | boolean;
  public_booking_enabled?: number | boolean;
  has_active_schedule?: boolean;
}

export function validateAndPrepareOptionalAddonsForSave(cfg: StudioOptionalAddonsConfig): {
  valid: boolean;
  error?: string;
  config: StudioOptionalAddonsConfig;
} {
  if (!cfg.enabled) {
    const cleanedOptions = (cfg.options || []).filter(o => Boolean(o.addonServiceId && String(o.addonServiceId).trim()));
    return {
      valid: true,
      config: {
        ...cfg,
        enabled: false,
        options: cleanedOptions
      }
    };
  }
  const options = Array.isArray(cfg.options) ? cfg.options : [];
  if (options.length === 0) {
    return {
      valid: false,
      error: 'Adicione ao menos um serviço complementar vinculado antes de salvar (ou desative os complementos opcionais).',
      config: cfg
    };
  }
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    if (!opt.addonServiceId || !String(opt.addonServiceId).trim()) {
      return {
        valid: false,
        error: `Selecione ou crie o serviço vinculado para o Complemento #${i + 1} (ou remova a opção incompleta).`,
        config: cfg
      };
    }
  }
  return { valid: true, config: cfg };
}

function isClientStudioQualifiedProfessional(pro: AddonCandidateProfessional): boolean {
  if (!pro || pro.active === false || pro.active === 0) return false;
  const mods = Array.isArray(pro.available_modules) ? pro.available_modules.map(m => m.code) : [];
  const pName = String(pro.profession_name || '').toLowerCase();
  const pId = String(pro.profession_id || '').toLowerCase();
  const areas = String(pro.practice_areas || '').toLowerCase();
  const hasPersonal =
    mods.includes('ZemdaPersonal') ||
    pId.includes('personal') ||
    pId.includes('educacao-fisica') ||
    pId.includes('instrutor') ||
    pName.includes('personal') ||
    pName.includes('educador f') ||
    pName.includes('educação f') ||
    pName.includes('instrutor') ||
    pName.includes('pilates') ||
    areas.includes('personal') ||
    areas.includes('musculaç');
  const isPureAdmin =
    !hasPersonal &&
    (pName === 'gestor' || pName === 'administrador' || pName === 'administradora' || pName === 'admin' || pName === 'gerente');
  if (isPureAdmin) return false;
  const clinicalOnly = mods.filter(c => c !== 'ZemdaPersonal' && c !== 'general');
  if (clinicalOnly.length > 0 && !hasPersonal) return false;
  return true;
}

interface StudioAccessAndAdjustmentsPanelProps {
  studioServiceType: StudioServiceType;
  onStudioServiceTypeChange: (nextType: StudioServiceType) => void;
  accessConfig: StudioAccessConfig;
  onAccessConfigChange: (nextConfig: StudioAccessConfig) => void;
  pricingAdjustments: StudioPriceAdjustmentRule[];
  onPricingAdjustmentsChange: (nextRules: StudioPriceAdjustmentRule[]) => void;
  commercialPriceOptions?: StudioCommercialPriceOption[];
  onCommercialPriceOptionsChange?: (nextOptions: StudioCommercialPriceOption[]) => void;
  optionalAddons?: StudioOptionalAddonsConfig;
  onOptionalAddonsChange?: (nextConfig: StudioOptionalAddonsConfig) => void;
  availableAddonServices?: AddonCandidateService[];
  professionals?: AddonCandidateProfessional[];
  currentServiceId?: string | null;
  defaultCapacity: number;
  onDefaultCapacityChange?: (nextCap: number) => void;
  allowPublicBooking?: boolean;
  onAllowPublicBookingChange?: (allow: boolean) => void;
  allowSingleBooking?: boolean;
  onAllowSingleBookingChange?: (allow: boolean) => void;
  allowPlanBooking?: boolean;
  onAllowPlanBookingChange?: (allow: boolean) => void;
  allowPublicSingleBooking?: boolean;
  onAllowPublicSingleBookingChange?: (allow: boolean) => void;
  allowPublicPlanBooking?: boolean;
  onAllowPublicPlanBookingChange?: (allow: boolean) => void;
  planCreditMode?: PlanCreditMode;
  onPlanCreditModeChange?: (mode: PlanCreditMode) => void;
  planCreditsPerCycle?: number | null;
  onPlanCreditsPerCycleChange?: (credits: number | null) => void;
  disableFacilityAccessOption?: boolean;
  hideOptionalAddons?: boolean;
}

const WEEKDAY_SHORT = [
  { day: 0, label: 'Dom' },
  { day: 1, label: 'Seg' },
  { day: 2, label: 'Ter' },
  { day: 3, label: 'Qua' },
  { day: 4, label: 'Qui' },
  { day: 5, label: 'Sex' },
  { day: 6, label: 'Sáb' }
];

export const StudioAccessAndAdjustmentsPanel: React.FC<StudioAccessAndAdjustmentsPanelProps> = ({
  studioServiceType,
  onStudioServiceTypeChange,
  accessConfig,
  onAccessConfigChange,
  pricingAdjustments,
  onPricingAdjustmentsChange,
  commercialPriceOptions = [],
  onCommercialPriceOptionsChange,
  optionalAddons,
  onOptionalAddonsChange,
  availableAddonServices = [],
  professionals = [],
  currentServiceId = null,
  defaultCapacity,
  onDefaultCapacityChange,
  allowPublicBooking = true,
  onAllowPublicBookingChange,
  allowSingleBooking = true,
  onAllowSingleBookingChange,
  allowPlanBooking = false,
  onAllowPlanBookingChange,
  allowPublicSingleBooking = true,
  onAllowPublicSingleBookingChange,
  allowPublicPlanBooking = false,
  onAllowPublicPlanBookingChange,
  planCreditMode = 'fixed_credits',
  onPlanCreditModeChange,
  planCreditsPerCycle = null,
  onPlanCreditsPerCycleChange,
  disableFacilityAccessOption = false,
  hideOptionalAddons = false
}) => {
  const [newWindowStart, setNewWindowStart] = useState('06:00');
  const [newWindowEnd, setNewWindowEnd] = useState('22:00');
  const [showAdjustments, setShowAdjustments] = useState(pricingAdjustments.length > 0);
  const [showCommercialOptions, setShowCommercialOptions] = useState(commercialPriceOptions.length > 0);
  const effectiveOptionalAddons: StudioOptionalAddonsConfig = optionalAddons || getDefaultOptionalAddonsConfig();
  const [showOptionalAddons, setShowOptionalAddons] = useState(
    Boolean(effectiveOptionalAddons.enabled || effectiveOptionalAddons.options.length > 0)
  );
  const [remoteAddonCandidates, setRemoteAddonCandidates] = useState<AddonCandidateService[] | null>(null);
  const [optimisticAddonServices, setOptimisticAddonServices] = useState<AddonCandidateService[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [addonCreatorState, setAddonCreatorState] = useState<{ open: boolean; targetOptionIndex: number | null }>({
    open: false,
    targetOptionIndex: null
  });

  const loadAddonCandidates = useCallback(async () => {
    if (!onOptionalAddonsChange || hideOptionalAddons) return;
    try {
      setLoadingCandidates(true);
      const query = currentServiceId ? `?excludeServiceId=${encodeURIComponent(currentServiceId)}` : '';
      const res = await ApiClient.get<{ services?: AddonCandidateService[] }>(`/v1/services/addon-candidates${query}`);
      if (Array.isArray(res?.services)) {
        setRemoteAddonCandidates(res.services);
      }
    } catch {
      // Fallback para lista recebida via props caso o endpoint ainda não esteja acessível
    } finally {
      setLoadingCandidates(false);
    }
  }, [currentServiceId, onOptionalAddonsChange, hideOptionalAddons]);

  useEffect(() => {
    if (!onOptionalAddonsChange || hideOptionalAddons) return;
    if (showOptionalAddons || effectiveOptionalAddons.enabled) {
      loadAddonCandidates();
    }
  }, [showOptionalAddons, effectiveOptionalAddons.enabled, loadAddonCandidates, onOptionalAddonsChange, hideOptionalAddons]);

  useEffect(() => {
    if (!onOptionalAddonsChange || hideOptionalAddons) return;
    const handleCatalogUpdated = () => {
      loadAddonCandidates();
    };
    window.addEventListener('zemda-catalog-updated', handleCatalogUpdated);
    return () => {
      window.removeEventListener('zemda-catalog-updated', handleCatalogUpdated);
    };
  }, [loadAddonCandidates, onOptionalAddonsChange, hideOptionalAddons]);

  const candidateAddonServices = useMemo(() => {
    const baseList = remoteAddonCandidates !== null ? remoteAddonCandidates : availableAddonServices;
    const mergedMap = new Map<string, AddonCandidateService>();
    for (const s of [...baseList, ...optimisticAddonServices]) {
      if (!s || !s.id) continue;
      if (currentServiceId && s.id === currentServiceId) continue;
      if (s.active === false || s.active === 0) continue;
      if (s.service_domain && s.service_domain !== 'studio') continue;
      if (s.studio_service_type === 'facility_access') continue;
      const existing = mergedMap.get(s.id);
      mergedMap.set(s.id, existing ? { ...existing, ...s } : s);
    }
    return Array.from(mergedMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [remoteAddonCandidates, availableAddonServices, optimisticAddonServices, currentServiceId]);

  const activeProfessionals = useMemo(
    () => professionals.filter(p => p && p.active !== false && p.active !== 0),
    [professionals]
  );

  const studioEligibleFallbackPros = useMemo(
    () => activeProfessionals.filter(isClientStudioQualifiedProfessional),
    [activeProfessionals]
  );

  const patchOptionalAddons = (patch: Partial<StudioOptionalAddonsConfig>) => {
    if (!onOptionalAddonsChange) return;
    onOptionalAddonsChange({ ...effectiveOptionalAddons, ...patch });
  };

  const addOptionalAddonOption = (prelinkedBaseOptionId?: string) => {
    if (!onOptionalAddonsChange) return;
    const defaultTarget = candidateAddonServices.find(s => s.requires_appointment !== 0) || candidateAddonServices[0] || null;
    const defaultReqAppt =
      defaultTarget &&
      (defaultTarget.studio_service_type === 'facility_access' ||
        defaultTarget.studio_service_type === 'non_scheduled' ||
        defaultTarget.requires_appointment === 0 ||
        defaultTarget.requires_appointment === false)
        ? false
        : true;
    const explicitAllowedIds = commercialPriceOptions
      .filter(co => co.active !== false && co.allowOptionalAddons === true)
      .map(co => co.id);
    const initialAcceptedBaseIds = prelinkedBaseOptionId
      ? [prelinkedBaseOptionId]
      : explicitAllowedIds;
    const restrictToSelected = Boolean(prelinkedBaseOptionId) || commercialPriceOptions.length > 1 || explicitAllowedIds.length > 0;

    const nextOption: StudioOptionalAddonOption = {
      id: `addon-${Date.now()}-${effectiveOptionalAddons.options.length + 1}`,
      addonServiceId: defaultTarget?.id || '',
      addonServiceName: defaultTarget?.name || null,
      label: defaultTarget ? `${defaultTarget.name} (1x/semana)` : '',
      description: null,
      active: true,
      allowPublicBooking: true,
      acceptedBaseOptionIds: initialAcceptedBaseIds,
      baseOptionRestrictionMode: restrictToSelected ? 'selected' : 'all',
      enabledProfessionalIds: [],
      professionalSelectionMode: 'student_picks',
      attendanceFormat: 'match_service',
      sessionCapacity: null,
      allowedWeekdays: [],
      studentCanChooseSchedule: false,
      frequencyType: defaultReqAppt ? 'weekly' : 'unlimited',
      frequencyCount: defaultReqAppt ? 1 : null,
      creditMode: defaultReqAppt ? 'fixed_credits' : 'unlimited',
      creditsPerCycle: defaultReqAppt ? 4 : null,
      additionalPriceCents: 0,
      comboDiscountType: 'none',
      comboDiscountValue: 0,
      billingPeriodicity: 'monthly',
      durationMode: '1_month',
      autoRenew: null,
      scheduleTiming: defaultReqAppt ? 'during_purchase' : 'not_applicable',
      displayOrder: effectiveOptionalAddons.options.length
    };
    if (prelinkedBaseOptionId && onCommercialPriceOptionsChange) {
      onCommercialPriceOptionsChange(
        commercialPriceOptions.map(co =>
          co.id === prelinkedBaseOptionId
            ? { ...co, allowOptionalAddons: true }
            : co.allowOptionalAddons === undefined
              ? { ...co, allowOptionalAddons: false }
              : co
        )
      );
    }
    onOptionalAddonsChange({
      ...effectiveOptionalAddons,
      enabled: true,
      options: [...effectiveOptionalAddons.options, nextOption]
    });
    setShowOptionalAddons(true);
  };

  const toggleCommercialOptionAllowAddons = (idx: number, allowed: boolean) => {
    if (!onCommercialPriceOptionsChange) return;
    const targetOpt = commercialPriceOptions[idx];
    if (!targetOpt) return;
    const nextCommercial = commercialPriceOptions.map((co, i) => {
      if (i === idx) return { ...co, allowOptionalAddons: allowed };
      // Ao habilitar explicitamente em uma opção comercial, evita habilitar implicitamente as outras que estavam indefinidas
      if (allowed && co.allowOptionalAddons === undefined) {
        const hadExplicitAddon = effectiveOptionalAddons.options.some(
          ao => ao.active && Array.isArray(ao.acceptedBaseOptionIds) && ao.acceptedBaseOptionIds.includes(co.id)
        );
        return { ...co, allowOptionalAddons: hadExplicitAddon };
      }
      return co;
    });
    onCommercialPriceOptionsChange(nextCommercial);

    if (!allowed && onOptionalAddonsChange && effectiveOptionalAddons.options.length > 0) {
      const nextAddonOpts = effectiveOptionalAddons.options.map(ao => {
        const hadId = Array.isArray(ao.acceptedBaseOptionIds) && ao.acceptedBaseOptionIds.includes(targetOpt.id);
        if (!hadId && ao.baseOptionRestrictionMode !== 'all') return ao;
        const remainingIds = hadId
          ? ao.acceptedBaseOptionIds.filter(id => id !== targetOpt.id)
          : nextCommercial.filter(co => co.active !== false && co.allowOptionalAddons !== false).map(co => co.id);
        return {
          ...ao,
          acceptedBaseOptionIds: remainingIds,
          baseOptionRestrictionMode: 'selected' as const
        };
      });
      onOptionalAddonsChange({ ...effectiveOptionalAddons, options: nextAddonOpts });
    }
  };

  const toggleAddonLinkForCommercialOption = (baseOptId: string, addonIdx: number) => {
    if (!onOptionalAddonsChange) return;
    const addon = effectiveOptionalAddons.options[addonIdx];
    if (!addon) return;
    const isRestricted = addon.baseOptionRestrictionMode === 'selected' || addon.acceptedBaseOptionIds.length > 0;
    const baseOptObj = commercialPriceOptions.find(co => co.id === baseOptId) || null;
    const currentlyApplies = addonAppliesToBaseOption(addon, baseOptObj);

    let nextIds: string[];
    if (currentlyApplies) {
      if (isRestricted) {
        nextIds = addon.acceptedBaseOptionIds.filter(id => id !== baseOptId);
      } else {
        nextIds = commercialPriceOptions
          .filter(co => co.id !== baseOptId && co.allowOptionalAddons !== false)
          .map(co => co.id);
      }
    } else {
      const prevIds = isRestricted ? addon.acceptedBaseOptionIds : [];
      nextIds = Array.from(new Set([...prevIds, baseOptId]));
    }

    if (!currentlyApplies && onCommercialPriceOptionsChange) {
      onCommercialPriceOptionsChange(
        commercialPriceOptions.map(co =>
          co.id === baseOptId
            ? { ...co, allowOptionalAddons: true }
            : co.allowOptionalAddons === undefined
              ? {
                  ...co,
                  allowOptionalAddons: effectiveOptionalAddons.options.some(
                    ao => ao.active && ao.acceptedBaseOptionIds.includes(co.id)
                  )
                }
              : co
        )
      );
    }

    onOptionalAddonsChange({
      ...effectiveOptionalAddons,
      enabled: !currentlyApplies ? true : effectiveOptionalAddons.enabled,
      options: effectiveOptionalAddons.options.map((ao, i) =>
        i === addonIdx
          ? {
              ...ao,
              acceptedBaseOptionIds: nextIds,
              baseOptionRestrictionMode: 'selected' as const
            }
          : ao
      )
    });
  };

  const updateOptionalAddonOption = (idx: number, patch: Partial<StudioOptionalAddonOption>) => {
    if (!onOptionalAddonsChange) return;
    onOptionalAddonsChange({
      ...effectiveOptionalAddons,
      options: effectiveOptionalAddons.options.map((o, i) => (i === idx ? { ...o, ...patch } : o))
    });
  };

  const removeOptionalAddonOption = (idx: number) => {
    if (!onOptionalAddonsChange) return;
    const nextOpts = effectiveOptionalAddons.options.filter((_, i) => i !== idx);
    onOptionalAddonsChange({
      ...effectiveOptionalAddons,
      options: nextOpts
    });
  };

  const addCommercialOption = () => {
    if (!onCommercialPriceOptionsChange) return;
    const nextOption: StudioCommercialPriceOption = {
      id: `opt-${Date.now()}-${commercialPriceOptions.length + 1}`,
      label: '',
      modality: 'any',
      accessType: studioServiceType === 'facility_access' ? (accessConfig?.accessMode === 'limited' ? 'limited' : 'unlimited') : 'scheduled',
      frequencyType: studioServiceType === 'facility_access' && accessConfig?.accessMode !== 'limited' ? 'unlimited' : 'weekly',
      frequencyCount: studioServiceType === 'facility_access' && accessConfig?.accessMode !== 'limited' ? null : 2,
      contractDurationCode: '1_month',
      paymentPeriodicity: 'monthly',
      participantsCount: 1,
      commercialUnit: 'per_month',
      amountCents: 15000,
      installmentsCount: 1,
      fidelityMonths: 0,
      gracePeriodDays: 0,
      autoRenew: false,
      active: true,
      creditMode: studioServiceType === 'facility_access' ? 'unlimited' : (planCreditMode || 'fixed_credits'),
      creditsPerCycle: studioServiceType === 'facility_access' ? null : (planCreditsPerCycle ?? null),
      allowPublicBooking: true
    };
    onCommercialPriceOptionsChange([...commercialPriceOptions, nextOption]);
    setShowCommercialOptions(true);
  };

  const updateCommercialOption = (idx: number, patch: Partial<StudioCommercialPriceOption>) => {
    if (!onCommercialPriceOptionsChange) return;
    onCommercialPriceOptionsChange(commercialPriceOptions.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  };

  const removeCommercialOption = (idx: number) => {
    if (!onCommercialPriceOptionsChange) return;
    const removed = commercialPriceOptions[idx];
    const nextCommercial = commercialPriceOptions.filter((_, i) => i !== idx);
    onCommercialPriceOptionsChange(nextCommercial);
    // Limpa referências órfãs com segurança sem jamais converter restrição 'selected' em 'all'
    if (removed?.id && onOptionalAddonsChange && effectiveOptionalAddons.options.length > 0) {
      let changed = false;
      const nextAddonOpts = effectiveOptionalAddons.options.map(ao => {
        if (!Array.isArray(ao.acceptedBaseOptionIds) || !ao.acceptedBaseOptionIds.includes(removed.id)) {
          return ao;
        }
        changed = true;
        return {
          ...ao,
          acceptedBaseOptionIds: ao.acceptedBaseOptionIds.filter(id => id !== removed.id),
          baseOptionRestrictionMode: 'selected' as const
        };
      });
      if (changed) {
        onOptionalAddonsChange({ ...effectiveOptionalAddons, options: nextAddonOpts });
      }
    }
  };

  const cfg = accessConfig || DEFAULT_STUDIO_ACCESS_CONFIG;

  const updateCfg = (patch: Partial<StudioAccessConfig>) => {
    onAccessConfigChange({
      ...cfg,
      ...patch
    });
  };

  const toggleAllowedWeekday = (day: number) => {
    const current = Array.isArray(cfg.allowedWeekdays) ? cfg.allowedWeekdays : [0, 1, 2, 3, 4, 5, 6];
    const next = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day].sort((a, b) => a - b);
    updateCfg({ allowedWeekdays: next.length > 0 ? next : [day] });
  };

  const addTimeWindow = () => {
    if (!newWindowStart || !newWindowEnd || newWindowStart >= newWindowEnd) return;
    const next = [
      ...(cfg.allowedTimeWindows || []),
      { startTime: newWindowStart, endTime: newWindowEnd }
    ];
    updateCfg({ allowedTimeWindows: next });
  };

  const removeTimeWindow = (idx: number) => {
    const next = (cfg.allowedTimeWindows || []).filter((_, i) => i !== idx);
    updateCfg({ allowedTimeWindows: next });
  };

  const addAdjustmentRule = () => {
    const nextRule: StudioPriceAdjustmentRule = {
      id: `adj-${Date.now()}`,
      label: 'Horário de Pico (Noite)',
      adjustmentType: 'surcharge',
      valueType: 'fixed',
      amount: 15,
      incidence: 'per_student',
      weekdays: [1, 2, 3, 4, 5],
      startTime: '18:00',
      endTime: '21:00',
      modality: null,
      professionalId: null,
      sessionType: null,
      active: true
    };
    onPricingAdjustmentsChange([...pricingAdjustments, nextRule]);
    setShowAdjustments(true);
  };

  const updateAdjustmentRule = (idx: number, patch: Partial<StudioPriceAdjustmentRule>) => {
    const next = pricingAdjustments.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onPricingAdjustmentsChange(next);
  };

  const removeAdjustmentRule = (idx: number) => {
    onPricingAdjustmentsChange(pricingAdjustments.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3 text-xs">
      {/* Seletor de Natureza Operacional do Serviço (Academia & Studio) */}
      <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
              Natureza Operacional (Academia &amp; Studio)
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Defina como este serviço funciona na rotina da academia, studio ou personal trainer.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {!disableFacilityAccessOption && (
            <button
              type="button"
              onClick={() => onStudioServiceTypeChange('facility_access')}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 ${
                studioServiceType === 'facility_access'
                  ? 'border-teal-600 bg-white ring-2 ring-teal-500/20 shadow-2xs'
                  : 'border-slate-200 bg-white/80 hover:bg-white'
              }`}
            >
              <KeyRound className={`w-4 h-4 mt-0.5 shrink-0 ${studioServiceType === 'facility_access' ? 'text-teal-600' : 'text-slate-400'}`} />
              <div>
                <div className="font-bold text-slate-900">Tipo A — Acesso ao Estabelecimento</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Musculação, academia livre ou limitada (2x, 3x, 5x/sem). Não ocupa agenda de instrutores.
                </div>
              </div>
            </button>
          )}

          <button
            type="button"
            onClick={() => onStudioServiceTypeChange('individual')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 ${
              studioServiceType === 'individual'
                ? 'border-teal-600 bg-white ring-2 ring-teal-500/20 shadow-2xs'
                : 'border-slate-200 bg-white/80 hover:bg-white'
            }`}
          >
            <User className={`w-4 h-4 mt-0.5 shrink-0 ${studioServiceType === 'individual' ? 'text-teal-600' : 'text-slate-400'}`} />
            <div>
              <div className="font-bold text-slate-900">Tipo B — Atendimento Individual</div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Personal trainer individual, Pilates individual, avaliação física com hora marcada.
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onStudioServiceTypeChange('group')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 ${
              studioServiceType === 'group'
                ? 'border-teal-600 bg-white ring-2 ring-teal-500/20 shadow-2xs'
                : 'border-slate-200 bg-white/80 hover:bg-white'
            }`}
          >
            <Users className={`w-4 h-4 mt-0.5 shrink-0 ${studioServiceType === 'group' ? 'text-teal-600' : 'text-slate-400'}`} />
            <div>
              <div className="font-bold text-slate-900">Tipo C — Turma ou Dupla Compartilhada</div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Personal em dupla (2 vagas), Pilates em grupo, Funcional, Dança, Yoga, Zumba, Artes marciais.
              </div>
            </div>
          </button>

          {!disableFacilityAccessOption && (
            <button
              type="button"
              onClick={() => onStudioServiceTypeChange('non_scheduled')}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 ${
                studioServiceType === 'non_scheduled'
                  ? 'border-teal-600 bg-white ring-2 ring-teal-500/20 shadow-2xs'
                  : 'border-slate-200 bg-white/80 hover:bg-white'
              }`}
            >
              <FileCheck2 className={`w-4 h-4 mt-0.5 shrink-0 ${studioServiceType === 'non_scheduled' ? 'text-teal-600' : 'text-slate-400'}`} />
              <div>
                <div className="font-bold text-slate-900">Tipo D — Serviço Entregável</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Montagem de treino ou consultoria sem necessidade de reservar horário na agenda.
                </div>
              </div>
            </button>
          )}
        </div>

        {/* Atalho rápido para Dupla (2 vagas) vs Turma quando Tipo C */}
        {studioServiceType === 'group' && onDefaultCapacityChange && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] font-semibold text-slate-700">Formato rápido de vagas:</span>
            {[
              { label: 'Dupla (2 alunos)', cap: 2 },
              { label: 'Trio (3 alunos)', cap: 3 },
              { label: 'Studio (6 vagas)', cap: 6 },
              { label: 'Turma (12 vagas)', cap: 12 },
              { label: 'Coletiva (20 vagas)', cap: 20 }
            ].map(preset => (
              <button
                key={preset.cap}
                type="button"
                onClick={() => onDefaultCapacityChange(preset.cap)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                  Number(defaultCapacity) === preset.cap
                    ? 'border-teal-600 bg-teal-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Painel de Plano de Acesso / Academia (quando Tipo A) */}
      {studioServiceType === 'facility_access' && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/30 p-4 space-y-3.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="font-bold text-indigo-950 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-indigo-600" />
                Regras Comerciais do Plano de Acesso (Academia)
              </h4>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Este serviço não ocupa horários na agenda de profissionais e não exige registro de entrada ou saída.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => updateCfg({ accessMode: 'unlimited', maxEntriesPerWeek: null, maxEntriesPerMonth: null })}
              className={`p-3 rounded-xl border text-left cursor-pointer ${
                cfg.accessMode === 'unlimited'
                  ? 'border-indigo-600 bg-white ring-2 ring-indigo-500/20'
                  : 'border-slate-200 bg-white/70 hover:bg-white'
              }`}
            >
              <div className="font-bold text-slate-900">Acesso Livre (Ilimitado)</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Aluno pode frequentar durante a vigência contratual conforme dias e horários do estabelecimento.
              </div>
            </button>

            <button
              type="button"
              onClick={() => updateCfg({ accessMode: 'limited', maxEntriesPerWeek: cfg.maxEntriesPerWeek || 3 })}
              className={`p-3 rounded-xl border text-left cursor-pointer ${
                cfg.accessMode === 'limited'
                  ? 'border-indigo-600 bg-white ring-2 ring-indigo-500/20'
                  : 'border-slate-200 bg-white/70 hover:bg-white'
              }`}
            >
              <div className="font-bold text-slate-900">Frequência Contratada</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Condição comercial por semana ou mês (ex: 2x, 3x, 5x por semana ou 12x por mês).
              </div>
            </button>
          </div>

          {cfg.accessMode === 'limited' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-3 rounded-xl border border-slate-200">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Frequência por semana</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  placeholder="Ex: 3"
                  value={cfg.maxEntriesPerWeek ?? ''}
                  onChange={e => updateCfg({ maxEntriesPerWeek: e.target.value ? Number(e.target.value) : null })}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                />
                <div className="flex gap-1 mt-1">
                  {[2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => updateCfg({ maxEntriesPerWeek: n, countPeriod: 'weekly' })}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                        cfg.maxEntriesPerWeek === n ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {n}x/sem
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Frequência por mês (opcional)</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  placeholder="Ex: 12"
                  value={cfg.maxEntriesPerMonth ?? ''}
                  onChange={e => updateCfg({ maxEntriesPerMonth: e.target.value ? Number(e.target.value) : null })}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Início da semana</label>
                <select
                  value={cfg.weekStartDay}
                  onChange={e => updateCfg({ weekStartDay: Number(e.target.value) === 0 ? 0 : 1 })}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                >
                  <option value={1}>Segunda-feira</option>
                  <option value={0}>Domingo</option>
                </select>
              </div>
            </div>
          )}

          {/* Dias permitidos */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
            <label className="block font-semibold text-slate-700">Dias da semana incluídos no plano</label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_SHORT.map(w => {
                const active = (cfg.allowedWeekdays || []).includes(w.day);
                return (
                  <button
                    key={w.day}
                    type="button"
                    onClick={() => toggleAllowedWeekday(w.day)}
                    className={`px-3 py-1 rounded-lg border font-bold text-xs cursor-pointer ${
                      active
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Janelas de horário permitidas */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                Faixas horárias do plano (vazio = qualquer horário de funcionamento)
              </label>
            </div>
            {(cfg.allowedTimeWindows || []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {cfg.allowedTimeWindows.map((win, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200 font-semibold"
                  >
                    {win.startTime} às {win.endTime}
                    <button
                      type="button"
                      onClick={() => removeTimeWindow(idx)}
                      className="text-indigo-500 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="time"
                value={newWindowStart}
                onChange={e => setNewWindowStart(e.target.value)}
                className="border border-slate-200 rounded-lg px-2 py-1 text-xs"
              />
              <span className="text-slate-500">até</span>
              <input
                type="time"
                value={newWindowEnd}
                onChange={e => setNewWindowEnd(e.target.value)}
                className="border border-slate-200 rounded-lg px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={addTimeWindow}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold border border-indigo-200 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar faixa (ex: Horário Econômico)
              </button>
            </div>
          </div>

          {/* Condição financeira de suspensão por inadimplência */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5">
            <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.blockOnOverdue}
                onChange={e => updateCfg({ blockOnOverdue: e.target.checked })}
              />
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
              Sinalizar pendência contratual se houver parcela vencida
            </label>
            {cfg.blockOnOverdue && (
              <div className="flex items-center gap-2 pl-5">
                <span className="text-[11px] text-slate-600">Dias de tolerância após vencimento:</span>
                <input
                  type="number"
                  min={0}
                  max={90}
                  value={cfg.overdueGraceDays}
                  onChange={e => updateCfg({ overdueGraceDays: Math.max(0, Number(e.target.value) || 0) })}
                  className="w-16 border border-slate-200 rounded-lg px-2 py-1 text-xs text-center"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Formas de Contratação & Contabilização de Créditos (Avulso vs Planos) */}
      {(onAllowSingleBookingChange || onAllowPlanBookingChange) && (
        <div className="rounded-2xl border border-emerald-200 bg-white p-3.5 space-y-2.5">
          <div>
            <h4 className="font-bold text-slate-900">Formas de Contratação</h4>
            <p className="text-[11px] text-slate-500">
              Escolha se o aluno pode agendar aula avulsa, contratar planos/recorrências ou ambos no mesmo serviço.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {onAllowSingleBookingChange && (
              <div className={`p-2.5 rounded-xl border ${studioServiceType === 'facility_access' ? 'border-slate-200 bg-slate-50 opacity-60' : allowSingleBooking ? 'border-teal-300 bg-teal-50/40' : 'border-slate-200 bg-white'}`}>
                <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={studioServiceType === 'facility_access'}
                    checked={studioServiceType !== 'facility_access' && allowSingleBooking}
                    onChange={e => onAllowSingleBookingChange(e.target.checked)}
                    className="h-4 w-4 accent-teal-700"
                  />
                  <span>Permite atendimento / aula avulsa</span>
                </label>
                {onAllowPublicSingleBookingChange && allowSingleBooking && studioServiceType !== 'facility_access' && (
                  <label className="mt-1.5 pl-6 flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowPublicSingleBooking}
                      onChange={e => onAllowPublicSingleBookingChange(e.target.checked)}
                      className="h-3.5 w-3.5 accent-teal-700"
                    />
                    <span>Exibir avulsa no Link Público</span>
                  </label>
                )}
              </div>
            )}
            {onAllowPlanBookingChange && (
              <div className={`p-2.5 rounded-xl border ${allowPlanBooking ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-200 bg-white'}`}>
                <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={studioServiceType === 'facility_access'}
                    checked={studioServiceType === 'facility_access' ? true : allowPlanBooking}
                    onChange={e => onAllowPlanBookingChange(e.target.checked)}
                    className="h-4 w-4 accent-indigo-700"
                  />
                  <span>Permite contratação como plano</span>
                </label>
                {onAllowPublicPlanBookingChange && (allowPlanBooking || studioServiceType === 'facility_access') && (
                  <label className="mt-1.5 pl-6 flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowPublicPlanBooking}
                      onChange={e => onAllowPublicPlanBookingChange(e.target.checked)}
                      className="h-3.5 w-3.5 accent-indigo-700"
                    />
                    <span>Exibir planos no Link Público</span>
                  </label>
                )}
              </div>
            )}
          </div>
          {(allowPlanBooking || studioServiceType === 'facility_access') && studioServiceType !== 'facility_access' && studioServiceType !== 'non_scheduled' && onPlanCreditModeChange && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 border-t border-slate-100">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Contagem de aulas no plano</label>
                <select
                  value={planCreditMode}
                  onChange={e => onPlanCreditModeChange(e.target.value as PlanCreditMode)}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                >
                  <option value="fixed_credits">Modelo A — Créditos fixos por ciclo</option>
                  <option value="weekly_guaranteed">Modelo B — Frequência semanal garantida (calendário real)</option>
                  <option value="unlimited">Ilimitado na vigência</option>
                </select>
              </div>
              {planCreditMode === 'fixed_credits' && onPlanCreditsPerCycleChange && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Créditos fixos padrão/ciclo (opcional)</label>
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    placeholder="Auto (ex: freq × 4 sem)"
                    value={planCreditsPerCycle ?? ''}
                    onChange={e => onPlanCreditsPerCycleChange(e.target.value ? Math.max(1, Number(e.target.value)) : null)}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Visibilidade Pública para QUALQUER serviço do Academia & Studio */}
      {onAllowPublicBookingChange && !onAllowSingleBookingChange && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
          <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={allowPublicBooking}
              onChange={e => onAllowPublicBookingChange(e.target.checked)}
              className="h-4 w-4 accent-teal-700"
            />
            <span>Exibir e permitir solicitação/contratação deste serviço no Link Público</span>
          </label>
        </div>
      )}

      {/* Regras de Adicional ou Desconto por Horário / Turno / Dia (Seção 8) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="font-bold text-slate-800">Adicionais ou Descontos por Horário / Turno</h4>
            <p className="text-[11px] text-slate-500">
              Opcional: configure horário de pico, horário econômico, adicional noturno ou fim de semana.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (pricingAdjustments.length === 0) addAdjustmentRule();
              else setShowAdjustments(!showAdjustments);
            }}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 font-semibold text-slate-700 cursor-pointer shrink-0"
          >
            {pricingAdjustments.length === 0
              ? '+ Criar regra de horário'
              : showAdjustments
                ? 'Ocultar regras'
                : `Ver regras (${pricingAdjustments.length})`}
          </button>
        </div>

        {showAdjustments && (
          <div className="space-y-2.5 pt-1">
            {pricingAdjustments.map((rule, idx) => (
              <div key={rule.id || idx} className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <input
                    type="text"
                    value={rule.label}
                    onChange={e => updateAdjustmentRule(idx, { label: e.target.value })}
                    placeholder="Nome (ex: Horário de Pico)"
                    className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white font-semibold"
                  />
                  <select
                    value={rule.adjustmentType}
                    onChange={e => updateAdjustmentRule(idx, { adjustmentType: e.target.value as any })}
                    className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                  >
                    <option value="surcharge">Adicional (+)</option>
                    <option value="discount">Desconto (-)</option>
                  </select>
                  <select
                    value={rule.valueType}
                    onChange={e => updateAdjustmentRule(idx, { valueType: e.target.value as any })}
                    className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                  >
                    <option value="fixed">Valor fixo (R$)</option>
                    <option value="percentage">Percentual (%)</option>
                  </select>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={rule.amount}
                      onChange={e => updateAdjustmentRule(idx, { amount: Math.max(0, Number(e.target.value) || 0) })}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => removeAdjustmentRule(idx)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg bg-white border border-slate-200 cursor-pointer"
                      title="Remover regra"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="text-slate-600 font-medium">Horário:</span>
                  <input
                    type="time"
                    value={rule.startTime || ''}
                    onChange={e => updateAdjustmentRule(idx, { startTime: e.target.value || null })}
                    className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white"
                  />
                  <span>às</span>
                  <input
                    type="time"
                    value={rule.endTime || ''}
                    onChange={e => updateAdjustmentRule(idx, { endTime: e.target.value || null })}
                    className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white"
                  />
                  <select
                    value={rule.incidence}
                    onChange={e => updateAdjustmentRule(idx, { incidence: e.target.value as any })}
                    className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white"
                  >
                    <option value="per_student">Por aluno</option>
                    <option value="per_session">Por sessão/turma</option>
                  </select>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addAdjustmentRule}
              className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar outra regra de horário/turno
            </button>
          </div>
        )}
      </div>

      {/* Planos e Opções Comerciais (Matriz Duração x Frequência compartilhada com Importação IA) */}
      {onCommercialPriceOptionsChange && (
        <div className="rounded-2xl border border-indigo-200 bg-white p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="font-bold text-slate-800">Planos e Opções Comerciais</h4>
              <p className="text-[11px] text-slate-500">
                Mensalidades, trimestrais, semestrais, anuais e parcelamentos por frequência contratada.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (commercialPriceOptions.length === 0) addCommercialOption();
                else setShowCommercialOptions(!showCommercialOptions);
              }}
              className="px-2.5 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 font-semibold text-indigo-700 cursor-pointer shrink-0"
            >
              {commercialPriceOptions.length === 0
                ? '+ Adicionar opção comercial'
                : showCommercialOptions
                  ? 'Ocultar opções'
                  : `Ver opções (${commercialPriceOptions.length})`}
            </button>
          </div>

          {showCommercialOptions && (
            <div className="space-y-2.5 pt-1">
              {commercialPriceOptions.map((opt, idx) => (
                <div key={opt.id || idx} className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <input
                      type="text"
                      value={opt.label || ''}
                      onChange={e => updateCommercialOption(idx, { label: e.target.value })}
                      placeholder="Rótulo (ex: Trimestral Livre)"
                      className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white font-semibold"
                    />
                    <select
                      value={opt.contractDurationCode}
                      onChange={e => updateCommercialOption(idx, { contractDurationCode: e.target.value as any })}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                    >
                      <option value="1_month">1 mês (Mensal)</option>
                      <option value="2_months">2 meses</option>
                      <option value="3_months">3 meses (Trimestral)</option>
                      <option value="6_months">6 meses (Semestral)</option>
                      <option value="12_months">12 meses (Anual)</option>
                      <option value="24_months">24 meses</option>
                    </select>
                    <select
                      value={opt.paymentPeriodicity}
                      onChange={e => updateCommercialOption(idx, { paymentPeriodicity: e.target.value as any })}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                    >
                      {Object.entries(PAYMENT_PERIODICITY_LABELS).map(([k, lbl]) => (
                        <option key={k} value={k}>{lbl}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={Number((opt.amountCents || 0) / 100)}
                        onChange={e => updateCommercialOption(idx, { amountCents: Math.max(1, Math.round((Number(e.target.value) || 0) * 100)) })}
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white font-bold"
                        title="Valor em reais"
                      />
                      <button
                        type="button"
                        onClick={() => removeCommercialOption(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg bg-white border border-slate-200 cursor-pointer"
                        title="Remover opção comercial"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <select
                      value={opt.commercialUnit}
                      onChange={e => updateCommercialOption(idx, { commercialUnit: e.target.value as any })}
                      className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white"
                    >
                      {Object.entries(COMMERCIAL_UNIT_LABELS).map(([k, lbl]) => (
                        <option key={k} value={k}>{lbl}</option>
                      ))}
                    </select>
                    <select
                      value={opt.frequencyType}
                      onChange={e => {
                        const nextFreq = e.target.value as any;
                        const nextAccessType =
                          studioServiceType === 'facility_access' || studioServiceType === 'non_scheduled'
                            ? (nextFreq === 'unlimited' ? 'unlimited' : 'limited')
                            : (nextFreq === 'unlimited' ? 'unlimited' : 'scheduled');
                        updateCommercialOption(idx, {
                          frequencyType: nextFreq,
                          accessType: nextAccessType,
                          frequencyCount: nextFreq === 'unlimited' ? null : (opt.frequencyCount || 1),
                          ...(nextFreq === 'unlimited' ? { creditMode: 'unlimited', creditsPerCycle: null } : {})
                        });
                      }}
                      className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white"
                    >
                      <option value="unlimited">Uso livre / ilimitado</option>
                      <option value="weekly">Frequência semanal</option>
                      <option value="monthly">Frequência mensal</option>
                      {studioServiceType !== 'facility_access' && <option value="fixed_count">Quantidade fixa</option>}
                    </select>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        studioServiceType === 'facility_access' || opt.accessType === 'unlimited' || opt.accessType === 'limited'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                      }`}
                    >
                      {studioServiceType === 'facility_access'
                        ? (opt.frequencyType === 'unlimited' ? 'Acesso livre (sem agendamento)' : 'Acesso limitado (sem agendamento)')
                        : opt.accessType === 'unlimited'
                          ? 'Acesso livre'
                          : opt.accessType === 'limited'
                            ? 'Acesso limitado'
                            : 'Horário marcado'}
                    </span>
                    {opt.frequencyType !== 'unlimited' && (
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={opt.frequencyCount ?? 1}
                        onChange={e => updateCommercialOption(idx, { frequencyCount: Math.max(1, Number(e.target.value) || 1) })}
                        className="w-16 border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white text-center font-semibold"
                        title="Quantidade"
                      />
                    )}
                    {opt.paymentPeriodicity === 'installments' && (
                      <label className="inline-flex items-center gap-1 text-slate-600">
                        <span>Parcelas:</span>
                        <input
                          type="number"
                          min={2}
                          max={24}
                          value={opt.installmentsCount || 2}
                          onChange={e => updateCommercialOption(idx, { installmentsCount: Math.max(2, Number(e.target.value) || 2) })}
                          className="w-14 border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white text-center font-semibold"
                        />
                      </label>
                    )}
                    <label className="inline-flex items-center gap-1 text-slate-600 cursor-pointer ml-auto">
                      <input
                        type="checkbox"
                        checked={opt.active !== false}
                        onChange={e => updateCommercialOption(idx, { active: e.target.checked })}
                      />
                      Ativa
                    </label>
                    <label className="inline-flex items-center gap-1 text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={opt.allowPublicBooking !== false}
                        onChange={e => updateCommercialOption(idx, { allowPublicBooking: e.target.checked })}
                      />
                      Pública
                    </label>
                  </div>
                  {(() => {
                    const bd = calculateCommercialOptionBreakdown(opt, { servicePlanCreditMode: planCreditMode, servicePlanCreditsPerCycle: planCreditsPerCycle });
                    return <p className="text-[11px] text-slate-600 border-t border-slate-200/70 pt-2">
                      Anunciado: R$ {bd.unitAmountReais.toFixed(2).replace('.', ',')} · {COMMERCIAL_UNIT_LABELS[opt.commercialUnit]} · Contrato: {PLAN_DURATION_LABELS[opt.contractDurationCode]} · {PAYMENT_PERIODICITY_LABELS[opt.paymentPeriodicity]} · Por cobrança: R$ {(opt.paymentPeriodicity === 'installments' ? bd.installmentAmountReais : bd.cycleAmountReais).toFixed(2).replace('.', ',')} · Total contratual: R$ {bd.totalContractAmountReais.toFixed(2).replace('.', ',')}
                    </p>;
                  })()}
                  {studioServiceType !== 'facility_access' && opt.accessType !== 'unlimited' && opt.frequencyType !== 'unlimited' && (
                    <div className="flex flex-wrap items-center gap-2 text-[11px] pt-1 border-t border-slate-200/70">
                      <span className="text-slate-600 font-medium">Modelo de créditos:</span>
                      <select
                        value={opt.creditMode || ''}
                        onChange={e => updateCommercialOption(idx, {
                          creditMode: e.target.value ? (e.target.value as PlanCreditMode) : null,
                          ...(e.target.value && e.target.value !== 'fixed_credits' ? { creditsPerCycle: null } : {})
                        })}
                        className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white"
                      >
                        <option value="">Herdar padrão do serviço ({PLAN_CREDIT_MODE_LABELS[planCreditMode]})</option>
                        <option value="fixed_credits">Créditos fixos por ciclo</option>
                        <option value="weekly_guaranteed">Frequência semanal garantida</option>
                        <option value="unlimited">Ilimitado na vigência</option>
                      </select>
                      {(opt.creditMode || planCreditMode) === 'fixed_credits' && (
                        <label className="inline-flex items-center gap-1 text-slate-600">
                          <span>Créditos/ciclo:</span>
                          <input
                            type="number"
                            min={1}
                            max={5000}
                            placeholder="Auto"
                            value={opt.creditsPerCycle ?? ''}
                            onChange={e => updateCommercialOption(idx, { creditsPerCycle: e.target.value ? Math.max(1, Number(e.target.value)) : null })}
                            className="w-16 border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white text-center"
                          />
                        </label>
                      )}
                      {(() => {
                        const bd = calculateCommercialOptionBreakdown(opt, {
                          servicePlanCreditMode: planCreditMode,
                          servicePlanCreditsPerCycle: planCreditsPerCycle
                        });
                        return (
                          <span className="ml-auto text-indigo-700 font-semibold">
                            Ciclo: R$ {bd.cycleAmountReais.toFixed(2).replace('.', ',')} · Total: R$ {bd.totalContractAmountReais.toFixed(2).replace('.', ',')}
                          </span>
                        );
                      })()}
                    </div>
                  )}

                  {/* Complementos opcionais vinculados especificamente a esta opção comercial */}
                  {onOptionalAddonsChange && !hideOptionalAddons && (() => {
                    const isAllowedOnThisOption =
                      opt.allowOptionalAddons === true ||
                      (opt.allowOptionalAddons === undefined &&
                        effectiveOptionalAddons.enabled &&
                        effectiveOptionalAddons.options.some(ao => addonAppliesToBaseOption(ao, opt)));
                    const linkedAddonsCount = effectiveOptionalAddons.options.filter(ao =>
                      addonAppliesToBaseOption(ao, { ...opt, allowOptionalAddons: isAllowedOnThisOption })
                    ).length;
                    return (
                      <div className="pt-2 border-t border-slate-200/80 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isAllowedOnThisOption}
                              onChange={e => toggleCommercialOptionAllowAddons(idx, e.target.checked)}
                            />
                            <span>Permitir complementos opcionais neste plano</span>
                          </label>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            isAllowedOnThisOption && linkedAddonsCount > 0
                              ? 'bg-teal-100 text-teal-800'
                              : isAllowedOnThisOption
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-500'
                          }`}>
                            {isAllowedOnThisOption
                              ? linkedAddonsCount > 0
                                ? `${linkedAddonsCount} complemento(s) vinculado(s)`
                                : 'Selecione os complementos abaixo'
                              : 'Sem complementos neste plano'}
                          </span>
                        </div>

                        {isAllowedOnThisOption && (
                          <div className="rounded-lg bg-white border border-teal-100 p-2 space-y-1.5">
                            {effectiveOptionalAddons.options.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {effectiveOptionalAddons.options.map((ao, aoIdx) => {
                                  const isLinked = addonAppliesToBaseOption(ao, { ...opt, allowOptionalAddons: true });
                                  return (
                                    <button
                                      key={ao.id}
                                      type="button"
                                      onClick={() => toggleAddonLinkForCommercialOption(opt.id, aoIdx)}
                                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                                        isLinked
                                          ? 'bg-teal-600 text-white border-teal-600'
                                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-teal-300'
                                      }`}
                                    >
                                      {isLinked ? '✓ ' : '+ '}
                                      {ao.label || ao.addonServiceName || `Complemento #${aoIdx + 1}`}
                                      {ao.additionalPriceCents > 0 ? ` (R$ ${(ao.additionalPriceCents / 100).toFixed(2).replace('.', ',')})` : ''}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-[11px] text-slate-500">
                                Nenhum complemento configurado ainda. Clique abaixo para criar e vincular diretamente a este plano.
                              </p>
                            )}
                            <button
                              type="button"
                              onClick={() => addOptionalAddonOption(opt.id)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 hover:text-teal-900 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" /> Vincular novo complemento a este plano
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ))}
              <button
                type="button"
                onClick={addCommercialOption}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-900 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar outra opção comercial
              </button>
            </div>
          )}
        </div>
      )}

      {onOptionalAddonsChange && !hideOptionalAddons && (
        <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                Complementos opcionais (ex.: Personal Trainer)
              </div>
              <p className="text-[11px] text-slate-500">
                Ofereça serviços vinculados sem duplicar cadastros e sem vincular Personal diretamente ao acesso da academia.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => patchOptionalAddons({ enabled: false })}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    !effectiveOptionalAddons.enabled
                      ? 'bg-white text-slate-800 shadow-xs'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Desativado
                </button>
                <button
                  type="button"
                  onClick={() => {
                    patchOptionalAddons({ enabled: true });
                    setShowOptionalAddons(true);
                  }}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    effectiveOptionalAddons.enabled
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  Ativado
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowOptionalAddons(prev => !prev)}
                className="text-xs font-semibold text-teal-700 hover:text-teal-900 cursor-pointer"
              >
                {showOptionalAddons
                  ? 'Recolher'
                  : effectiveOptionalAddons.options.length > 0
                    ? `Gerenciar (${effectiveOptionalAddons.options.length})`
                    : '+ Configurar'}
              </button>
            </div>
          </div>

          {(showOptionalAddons || effectiveOptionalAddons.enabled) && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={effectiveOptionalAddons.enabled}
                    onChange={e => patchOptionalAddons({ enabled: e.target.checked })}
                  />
                  Habilitar oferta de complementos neste plano
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={effectiveOptionalAddons.allowMultiple}
                    onChange={e => patchOptionalAddons({ allowMultiple: e.target.checked })}
                  />
                  Permitir combinar múltiplos complementos
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                    Pergunta exibida ao aluno no agendamento público
                  </label>
                  <input
                    type="text"
                    value={effectiveOptionalAddons.promptTitle}
                    onChange={e => patchOptionalAddons({ promptTitle: e.target.value })}
                    placeholder="Deseja adicionar acompanhamento personalizado?"
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                    Texto da opção sem complemento
                  </label>
                  <input
                    type="text"
                    value={effectiveOptionalAddons.noAddonLabel}
                    onChange={e => patchOptionalAddons({ noAddonLabel: e.target.value })}
                    placeholder="Não adicionar"
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                  />
                </div>
              </div>

              {candidateAddonServices.length === 0 && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {loadingCandidates
                      ? 'Buscando serviços complementares agendáveis no catálogo...'
                      : 'Nenhum serviço complementar agendável disponível ainda (ex.: Personal Trainer individual ou em dupla; planos de acesso livre/limitado não são listados).'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAddonCreatorState({ open: true, targetOptionIndex: null })}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-teal-600 text-white font-bold hover:bg-teal-700 cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Criar serviço complementar
                  </button>
                </div>
              )}

              {effectiveOptionalAddons.options.map((opt, idx) => {
                const netCents = Math.max(
                  0,
                  opt.additionalPriceCents -
                    (opt.comboDiscountType === 'fixed_cents'
                      ? Math.min(opt.additionalPriceCents, opt.comboDiscountValue)
                      : opt.comboDiscountType === 'percentage'
                        ? Math.round((opt.additionalPriceCents * Math.min(100, opt.comboDiscountValue)) / 100)
                        : 0)
                );
                const selectedTarget = candidateAddonServices.find(s => s.id === opt.addonServiceId);
                const targetRequiresAppt =
                  selectedTarget &&
                  (selectedTarget.studio_service_type === 'facility_access' ||
                    selectedTarget.studio_service_type === 'non_scheduled' ||
                    selectedTarget.requires_appointment === 0 ||
                    selectedTarget.requires_appointment === false)
                    ? false
                    : true;
                const targetEligiblePros: AddonCandidateProfessional[] = selectedTarget?.eligible_professionals
                  ? selectedTarget.eligible_professionals
                  : selectedTarget?.linked_professional_ids?.length
                    ? studioEligibleFallbackPros.filter(p => selectedTarget.linked_professional_ids!.includes(p.id))
                    : selectedTarget?.professional_id
                      ? studioEligibleFallbackPros.filter(p => p.id === selectedTarget.professional_id)
                      : studioEligibleFallbackPros;
                const enabledPros = Array.isArray(opt.enabledProfessionalIds) ? opt.enabledProfessionalIds : [];
                const allowedDays = Array.isArray(opt.allowedWeekdays) ? opt.allowedWeekdays : [];
                const attendanceFormat: AddonAttendanceFormat = opt.attendanceFormat || 'match_service';
                const proSelectionMode: AddonProfessionalSelectionMode = opt.professionalSelectionMode || 'student_picks';

                return (
                  <div key={opt.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-700">
                        Complemento #{idx + 1}
                        {opt.comboDiscountType !== 'none' && opt.comboDiscountValue > 0 && (
                          <span className="ml-2 text-[11px] font-semibold text-emerald-700">
                            (Líquido: R$ {(netCents / 100).toFixed(2).replace('.', ',')})
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-3 flex-wrap">
                        <label className="inline-flex items-center gap-1 text-[11px] text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={opt.active !== false}
                            onChange={e => updateOptionalAddonOption(idx, { active: e.target.checked })}
                          />
                          Ativo
                        </label>
                        <label className="inline-flex items-center gap-1 text-[11px] text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={opt.allowPublicBooking !== false}
                            onChange={e => updateOptionalAddonOption(idx, { allowPublicBooking: e.target.checked })}
                          />
                          No Link Público
                        </label>
                        <button
                          type="button"
                          onClick={() => removeOptionalAddonOption(idx)}
                          className="text-slate-400 hover:text-rose-600 cursor-pointer"
                          title="Remover complemento"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {opt.availabilityStatus && opt.availabilityStatus !== 'available' && opt.availabilityMessage && (
                      <div className="px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 font-medium">
                        {opt.availabilityMessage}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <label className="block text-[11px] font-semibold text-slate-600">Serviço vinculado</label>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={loadAddonCandidates}
                              className="text-[10px] font-semibold text-slate-500 hover:text-slate-800 inline-flex items-center gap-0.5 cursor-pointer"
                              title="Atualizar lista de serviços"
                            >
                              <RefreshCw className={`w-3 h-3 ${loadingCandidates ? 'animate-spin' : ''}`} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setAddonCreatorState({ open: true, targetOptionIndex: idx })}
                              className="text-[11px] font-bold text-teal-700 hover:text-teal-900 cursor-pointer"
                            >
                              + Criar serviço complementar
                            </button>
                          </div>
                        </div>
                        <select
                          value={opt.addonServiceId}
                          onChange={e => {
                            const nextId = e.target.value;
                            if (nextId === '__create_addon__') {
                              setAddonCreatorState({ open: true, targetOptionIndex: idx });
                              return;
                            }
                            const nextTarget = candidateAddonServices.find(s => s.id === nextId);
                            const reqAppt =
                              nextTarget &&
                              (nextTarget.studio_service_type === 'facility_access' ||
                                nextTarget.studio_service_type === 'non_scheduled' ||
                                nextTarget.requires_appointment === 0 ||
                                nextTarget.requires_appointment === false)
                                ? false
                                : true;
                            const nextEligibleIds = new Set(
                              nextTarget?.eligible_professional_ids ||
                              nextTarget?.linked_professional_ids ||
                              (nextTarget?.professional_id ? [nextTarget.professional_id] : [])
                            );
                            const nextSelectedPros = nextEligibleIds.size > 0
                              ? (opt.enabledProfessionalIds || []).filter(pid => nextEligibleIds.has(pid))
                              : [];
                            updateOptionalAddonOption(idx, {
                              addonServiceId: nextId,
                              addonServiceName: nextTarget?.name || null,
                              label: opt.label || (nextTarget ? nextTarget.name : ''),
                              enabledProfessionalIds: nextSelectedPros,
                              scheduleTiming: reqAppt ? (opt.scheduleTiming === 'not_applicable' ? 'after_confirmation' : opt.scheduleTiming) : 'not_applicable',
                              studentCanChooseSchedule: reqAppt ? (opt.scheduleTiming === 'during_purchase') : false
                            });
                          }}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white font-semibold"
                        >
                          <option value="">Selecione um serviço...</option>
                          {candidateAddonServices.map(cs => (
                            <option key={cs.id} value={cs.id}>
                              {cs.name}
                              {cs.studio_service_type === 'non_scheduled'
                                ? ' (Avaliação / sem agenda)'
                                : cs.service_kind === 'group'
                                  ? ' (Turma / Dupla)'
                                  : ' (Individual)'}
                            </option>
                          ))}
                          <option value="__create_addon__">+ Criar serviço complementar</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Nome da opção (para o aluno)</label>
                        <input
                          type="text"
                          value={opt.label}
                          onChange={e => updateOptionalAddonOption(idx, { label: e.target.value })}
                          placeholder="Ex: Personal 1 vez por semana"
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Frequência</label>
                        <select
                          value={opt.frequencyType}
                          onChange={e => {
                            const nextFreq = e.target.value as any;
                            const nextCount = nextFreq === 'unlimited' ? null : (opt.frequencyCount || 1);
                            const nextCreditMode = nextFreq === 'unlimited' ? 'unlimited' : (opt.creditMode === 'weekly_guaranteed' ? 'weekly_guaranteed' : 'fixed_credits');
                            updateOptionalAddonOption(idx, {
                              frequencyType: nextFreq,
                              frequencyCount: nextCount,
                              creditMode: nextCreditMode,
                              creditsPerCycle: nextCreditMode === 'fixed_credits' ? resolveDefaultAddonCreditsPerCycle(nextFreq, nextCount, 1) : null
                            });
                          }}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                        >
                          <option value="weekly">Por semana</option>
                          <option value="monthly">Por mês</option>
                          <option value="fixed_count">Qtd. fixa</option>
                          <option value="unlimited">Ilimitado</option>
                        </select>
                      </div>
                      {opt.frequencyType !== 'unlimited' && (
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Qtd. freq.</label>
                          <input
                            type="number"
                            min={1}
                            max={200}
                            value={opt.frequencyCount ?? 1}
                            onChange={e => {
                              const nextCount = Math.max(1, Number(e.target.value) || 1);
                              const curCreditMode = opt.creditMode || 'fixed_credits';
                              updateOptionalAddonOption(idx, {
                                frequencyCount: nextCount,
                                creditsPerCycle: curCreditMode === 'fixed_credits' ? resolveDefaultAddonCreditsPerCycle(opt.frequencyType, nextCount, 1) : null
                              });
                            }}
                            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white text-center font-semibold"
                          />
                        </div>
                      )}
                      {opt.frequencyType !== 'unlimited' && (
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Regra de créditos</label>
                          <select
                            value={opt.creditMode || 'fixed_credits'}
                            onChange={e => {
                              const nextMode = e.target.value as PlanCreditMode;
                              updateOptionalAddonOption(idx, {
                                creditMode: nextMode,
                                creditsPerCycle:
                                  nextMode === 'fixed_credits'
                                    ? (opt.creditsPerCycle ?? resolveDefaultAddonCreditsPerCycle(opt.frequencyType, opt.frequencyCount, 1))
                                    : null
                              });
                            }}
                            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                          >
                            <option value="fixed_credits">Créditos fixos por ciclo</option>
                            <option value="weekly_guaranteed">Frequência semanal garantida</option>
                          </select>
                        </div>
                      )}
                      {opt.frequencyType !== 'unlimited' && (opt.creditMode || 'fixed_credits') === 'fixed_credits' && (
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Aulas/créditos por ciclo</label>
                          <input
                            type="number"
                            min={0}
                            max={500}
                            value={opt.creditsPerCycle ?? 0}
                            onChange={e => updateOptionalAddonOption(idx, { creditsPerCycle: Math.max(0, Number(e.target.value) || 0) })}
                            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white text-center font-semibold"
                          />
                        </div>
                      )}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Valor adicional (R$)</label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={(opt.additionalPriceCents / 100).toFixed(2)}
                          onChange={e => updateOptionalAddonOption(idx, { additionalPriceCents: Math.max(0, Math.round((Number(e.target.value) || 0) * 100)) })}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white font-bold"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Desconto combo</label>
                        <select
                          value={opt.comboDiscountType}
                          onChange={e => updateOptionalAddonOption(idx, { comboDiscountType: e.target.value as any, comboDiscountValue: 0 })}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                        >
                          <option value="none">Sem desconto</option>
                          <option value="fixed_cents">Desconto fixo (R$)</option>
                          <option value="percentage">Percentual (%)</option>
                        </select>
                      </div>
                      {opt.comboDiscountType !== 'none' && (
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                            {opt.comboDiscountType === 'percentage' ? 'Desconto (%)' : 'Valor desconto (R$)'}
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={opt.comboDiscountType === 'percentage' ? 100 : opt.additionalPriceCents / 100}
                            step={opt.comboDiscountType === 'percentage' ? 1 : 0.01}
                            value={opt.comboDiscountType === 'percentage' ? opt.comboDiscountValue : (opt.comboDiscountValue / 100).toFixed(2)}
                            onChange={e => {
                              const rawNum = Number(e.target.value) || 0;
                              updateOptionalAddonOption(idx, {
                                comboDiscountValue:
                                  opt.comboDiscountType === 'percentage'
                                    ? Math.max(0, Math.min(100, Math.round(rawNum)))
                                    : Math.max(0, Math.round(rawNum * 100))
                              });
                            }}
                            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                          />
                        </div>
                      )}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Cobrança do complemento</label>
                        <select
                          value={opt.billingPeriodicity}
                          onChange={e => updateOptionalAddonOption(idx, { billingPeriodicity: e.target.value as any })}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                        >
                          {Object.entries(ADDON_BILLING_PERIODICITY_LABELS).map(([k, lbl]) => (
                            <option key={k} value={k}>{lbl}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Duração do complemento</label>
                        <select
                          value={opt.durationMode}
                          onChange={e => updateOptionalAddonOption(idx, { durationMode: e.target.value as any })}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                        >
                          <option value="match_base">Seguir duração do plano-base</option>
                          {(['1_month', '2_months', '3_months', '6_months', '12_months', '24_months'] as const).map(code => (
                            <option key={code} value={code}>{PLAN_DURATION_LABELS[code]}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Renovação do complemento</label>
                        <select
                          value={opt.autoRenew === null ? 'inherit' : opt.autoRenew ? 'yes' : 'no'}
                          onChange={e => {
                            const v = e.target.value;
                            updateOptionalAddonOption(idx, { autoRenew: v === 'inherit' ? null : v === 'yes' });
                          }}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                        >
                          <option value="inherit">Seguir renovação do plano-base</option>
                          <option value="yes">Renovação automática ativada</option>
                          <option value="no">Sem renovação automática</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Escolha de horários</label>
                        <select
                          value={targetRequiresAppt ? opt.scheduleTiming : 'not_applicable'}
                          disabled={!targetRequiresAppt}
                          onChange={e => {
                            const nextTiming = e.target.value as any;
                            updateOptionalAddonOption(idx, {
                              scheduleTiming: nextTiming,
                              studentCanChooseSchedule: nextTiming === 'during_purchase'
                            });
                          }}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white disabled:bg-slate-100"
                        >
                          {Object.entries(ADDON_SCHEDULE_TIMING_LABELS).map(([k, lbl]) => (
                            <option key={k} value={k}>{lbl}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {targetRequiresAppt && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-200/80">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Formato do atendimento</label>
                          <select
                            value={attendanceFormat}
                            onChange={e => {
                              const nextFmt = e.target.value as AddonAttendanceFormat;
                              updateOptionalAddonOption(idx, {
                                attendanceFormat: nextFmt,
                                sessionCapacity:
                                  nextFmt === 'individual'
                                    ? 1
                                    : nextFmt === 'duo'
                                      ? 2
                                      : nextFmt === 'group'
                                        ? Math.max(2, Number(opt.sessionCapacity) || 4)
                                        : null
                              });
                            }}
                            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                          >
                            <option value="match_service">Seguir serviço vinculado</option>
                            <option value="individual">Individual (1 aluno)</option>
                            <option value="duo">Dupla (2 alunos)</option>
                            <option value="group">Pequeno grupo / Turma</option>
                          </select>
                        </div>
                        {attendanceFormat === 'group' && (
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Vagas por sessão (capacidade)</label>
                            <input
                              type="number"
                              min={2}
                              max={500}
                              value={opt.sessionCapacity ?? 4}
                              onChange={e => updateOptionalAddonOption(idx, { sessionCapacity: Math.max(2, Number(e.target.value) || 2) })}
                              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white font-semibold"
                            />
                          </div>
                        )}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Escolha do profissional</label>
                          <select
                            value={proSelectionMode}
                            onChange={e => updateOptionalAddonOption(idx, { professionalSelectionMode: e.target.value as AddonProfessionalSelectionMode })}
                            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                          >
                            <option value="student_picks">Aluno escolhe o profissional</option>
                            <option value="auto_assign">Sistema atribui automaticamente</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {targetRequiresAppt && (
                      <div className="pt-1 border-t border-slate-200/80">
                        <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Profissionais elegíveis neste complemento (deixe vazio para usar os vinculados ao serviço-alvo):
                        </span>
                        {!selectedTarget ? (
                          <div className="text-[11px] text-slate-500">
                            Selecione ou crie um serviço complementar para exibir apenas os profissionais elegíveis e vinculados a ele.
                          </div>
                        ) : targetEligiblePros.length === 0 ? (
                          <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                            Nenhum profissional elegível encontrado para "{selectedTarget.name}". Vincule um Personal Trainer ou instrutor compatível ao serviço complementar.
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {targetEligiblePros.map(pro => {
                              const selected = enabledPros.includes(pro.id);
                              return (
                                <button
                                  key={pro.id}
                                  type="button"
                                  onClick={() => {
                                    const nextPros = selected
                                      ? enabledPros.filter(id => id !== pro.id)
                                      : [...enabledPros, pro.id];
                                    updateOptionalAddonOption(idx, { enabledProfessionalIds: nextPros });
                                  }}
                                  className={`px-2 py-0.5 rounded-full text-[11px] border font-semibold cursor-pointer ${
                                    selected
                                      ? 'bg-indigo-600 text-white border-indigo-600'
                                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                                  }`}
                                >
                                  {pro.name}
                                  {pro.profession_name ? ` · ${pro.profession_name}` : ''}
                                  {Number(pro.public_booking_enabled ?? 1) === 0 ? ' (agenda pública off)' : ''}
                                  {pro.has_active_schedule === false ? ' (sem escala ativa)' : ''}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {targetRequiresAppt && (
                      <div className="pt-1 border-t border-slate-200/80">
                        <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Dias permitidos (vazio = todos os dias ofertados na agenda/grade):
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {WEEKDAY_SHORT.map(wd => {
                            const checked = allowedDays.includes(wd.day);
                            return (
                              <button
                                key={wd.day}
                                type="button"
                                onClick={() => {
                                  const nextDays = checked
                                    ? allowedDays.filter(d => d !== wd.day)
                                    : [...allowedDays, wd.day].sort((a, b) => a - b);
                                  updateOptionalAddonOption(idx, { allowedWeekdays: nextDays });
                                }}
                                className={`px-2 py-0.5 rounded-md text-[11px] border font-semibold cursor-pointer ${
                                  checked
                                    ? 'bg-teal-600 text-white border-teal-600'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300'
                                }`}
                              >
                                {wd.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {commercialPriceOptions.length > 0 && (() => {
                      const restrictMode = opt.baseOptionRestrictionMode || (opt.acceptedBaseOptionIds.length > 0 ? 'selected' : 'all');
                      return (
                      <div className="pt-1.5 border-t border-slate-200/80 space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-slate-600">
                            Opções comerciais autorizadas para este complemento:
                          </span>
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <button
                              type="button"
                              onClick={() => updateOptionalAddonOption(idx, { baseOptionRestrictionMode: 'selected' })}
                              className={`px-2 py-0.5 rounded-md border font-bold cursor-pointer ${
                                restrictMode === 'selected'
                                  ? 'bg-teal-700 text-white border-teal-700'
                                  : 'bg-white text-slate-600 border-slate-200'
                              }`}
                            >
                              Somente planos selecionados
                            </button>
                            <button
                              type="button"
                              onClick={() => updateOptionalAddonOption(idx, { baseOptionRestrictionMode: 'all', acceptedBaseOptionIds: [] })}
                              className={`px-2 py-0.5 rounded-md border font-bold cursor-pointer ${
                                restrictMode === 'all'
                                  ? 'bg-slate-700 text-white border-slate-700'
                                  : 'bg-white text-slate-600 border-slate-200'
                              }`}
                            >
                              Todos os planos habilitados
                            </button>
                          </div>
                        </div>
                        {restrictMode === 'selected' && opt.acceptedBaseOptionIds.length === 0 && (
                          <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
                            Nenhum plano selecionado ainda — este complemento não aparecerá no link público até que você marque pelo menos uma opção comercial abaixo.
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1.5">
                          {commercialPriceOptions.filter(bo => bo.active).map(bo => {
                            const checked = addonAppliesToBaseOption(opt, bo);
                            return (
                              <button
                                key={bo.id}
                                type="button"
                                onClick={() => toggleAddonLinkForCommercialOption(bo.id, idx)}
                                className={`px-2.5 py-0.5 rounded-full text-[11px] border font-semibold cursor-pointer ${
                                  checked
                                    ? 'bg-teal-600 text-white border-teal-600'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300'
                                }`}
                              >
                                {checked ? '✓ ' : ''}
                                {bo.label || `${PLAN_DURATION_LABELS[bo.contractDurationCode] || bo.contractDurationCode} · R$ ${(bo.amountCents / 100).toFixed(2).replace('.', ',')}`}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      );
                    })()}
                  </div>
                );
              })}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => addOptionalAddonOption()}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar complemento opcional
                </button>
                <button
                  type="button"
                  onClick={() => setAddonCreatorState({ open: true, targetOptionIndex: null })}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-900 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Criar serviço complementar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {addonCreatorState.open && (
        <Suspense fallback={null}>
          <LazyNewServiceModal
            isOpen={addonCreatorState.open}
            onClose={() => setAddonCreatorState({ open: false, targetOptionIndex: null })}
            zIndex="z-[85]"
            professionals={professionals as any[]}
            initialServiceDomain="studio"
            initialStudioServiceType="individual"
            forceStudioSchedulable={true}
            hideOptionalAddons={true}
            onSuccess={(created) => {
              const createdLinkedIds = Array.isArray(created?.linked_professional_ids)
                ? created.linked_professional_ids
                : (created?.professional_id ? [created.professional_id] : []);
              const eligibleFromProps = activeProfessionals
                .filter(p => createdLinkedIds.includes(p.id) && isClientStudioQualifiedProfessional(p))
                .map(p => ({
                  id: p.id,
                  name: p.name,
                  profession_name: p.profession_name || null,
                  public_booking_enabled: Number(p.public_booking_enabled ?? 1) !== 0,
                  has_active_schedule: true
                }));
              const optimisticItem: AddonCandidateService = {
                id: created.id,
                name: created.name,
                active: 1,
                service_domain: 'studio',
                studio_service_type: created.studio_service_type || created.studioServiceType || 'individual',
                service_kind: created.service_kind || created.serviceKind || 'individual',
                requires_appointment: created.requires_appointment === 0 || created.requiresAppointment === false ? 0 : 1,
                is_schedulable: created.requires_appointment !== 0,
                professional_id: created.professional_id || created.professionalId || null,
                linked_professional_ids: createdLinkedIds,
                eligible_professional_ids: eligibleFromProps.map(p => p.id),
                eligible_professionals: eligibleFromProps
              };
              setOptimisticAddonServices(prev => [...prev.filter(x => x.id !== created.id), optimisticItem]);
              loadAddonCandidates();
              const isReqAppt = optimisticItem.requires_appointment !== 0;
              const targetIdx = addonCreatorState.targetOptionIndex;
              if (onOptionalAddonsChange) {
                if (targetIdx !== null && effectiveOptionalAddons.options[targetIdx]) {
                  const currentOpt = effectiveOptionalAddons.options[targetIdx];
                  const updatedOpts = effectiveOptionalAddons.options.map((optItem, i) =>
                    i === targetIdx
                      ? {
                          ...optItem,
                          addonServiceId: created.id,
                          addonServiceName: created.name,
                          label: optItem.label?.trim() ? optItem.label : created.name,
                          enabledProfessionalIds: [],
                          scheduleTiming: (isReqAppt ? (optItem.scheduleTiming === 'not_applicable' ? 'after_confirmation' : optItem.scheduleTiming) : 'not_applicable') as any,
                          studentCanChooseSchedule: isReqAppt ? optItem.scheduleTiming === 'during_purchase' : false
                        }
                      : optItem
                  );
                  onOptionalAddonsChange({ ...effectiveOptionalAddons, enabled: true, options: updatedOpts });
                } else {
                  const newOpt: StudioOptionalAddonOption = {
                    id: `addon-${Date.now()}-${effectiveOptionalAddons.options.length + 1}`,
                    addonServiceId: created.id,
                    addonServiceName: created.name,
                    label: `${created.name} (1x/semana)`,
                    description: null,
                    active: true,
                    allowPublicBooking: true,
                    acceptedBaseOptionIds: [],
                    enabledProfessionalIds: [],
                    professionalSelectionMode: 'student_picks',
                    attendanceFormat: 'match_service',
                    sessionCapacity: null,
                    allowedWeekdays: [],
                    studentCanChooseSchedule: false,
                    frequencyType: isReqAppt ? 'weekly' : 'unlimited',
                    frequencyCount: isReqAppt ? 1 : null,
                    creditsPerCycle: isReqAppt ? 4 : null,
                    additionalPriceCents: 0,
                    comboDiscountType: 'none',
                    comboDiscountValue: 0,
                    billingPeriodicity: 'monthly',
                    durationMode: 'match_base',
                    autoRenew: null,
                    scheduleTiming: isReqAppt ? 'after_confirmation' : 'not_applicable',
                    displayOrder: effectiveOptionalAddons.options.length
                  };
                  onOptionalAddonsChange({
                    ...effectiveOptionalAddons,
                    enabled: true,
                    options: [...effectiveOptionalAddons.options, newOpt]
                  });
                }
                setShowOptionalAddons(true);
              }
              setAddonCreatorState({ open: false, targetOptionIndex: null });
            }}
          />
        </Suspense>
      )}
    </div>
  );
};
