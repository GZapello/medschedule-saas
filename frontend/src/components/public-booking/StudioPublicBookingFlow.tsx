import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Clock,
  Users,
  Package,
  UserRound,
  CheckCircle2,
  Repeat,
  ArrowRight,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { calendarBooking } from '../../utils/publicBooking';
import { bookingButton, bookingSecondary, bookingInput, BookingBackButton } from './PublicBookingShell';
import {
  ALL_PLAN_DURATIONS,
  formatCustomIntervalLabel,
  formatRecurrenceDescription,
  MAX_PUBLIC_RECURRENCE_OCCURRENCES,
  parseServiceRecurrenceConfig,
  PLAN_DURATION_LABELS,
  PlanDurationCode,
  RECURRENCE_FREQUENCY_LABELS,
  RECURRENCE_INTERVAL_BOUNDS,
  RecurrenceFrequency,
  RecurrenceIntervalSpec,
  RecurrenceIntervalUnit,
  resolvePlanDurationEndDate
} from '../../utils/establishmentContext';
import { RecurrencePreviewBox, RecurrencePreviewData } from '../common/RecurrencePreviewBox';

type ConcreteModality = 'presential' | 'online' | 'home';

const modalityLabel = (m?: string | null): string => {
  if (m === 'online') return 'Online';
  if (m === 'home') return 'Domiciliar';
  return 'Presencial';
};

interface StudioPublicBookingFlowProps {
  clinic: any;
  tenantSlug?: string;
  bookingSequence?: number;
  services: any[];
  professionals: any[];
  packages: any[];
  onSwitchClinical?: () => void;
}

interface SelectedPackageSlotItem {
  key: string;
  serviceId: string;
  serviceName: string;
  professionalId: string;
  professionalName: string;
  classScheduleId?: string | null;
  modality: ConcreteModality;
  roomName?: string | null;
  startTime: string;
  endTime: string;
  remainingSpots?: number | null;
  capacity?: number | null;
  recurrenceCount: number;
}

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

const addDays = (baseIso: string, days: number) => {
  const [y, m, d] = baseIso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

const formatDateShort = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(dt);
};

const formatMoney = (v: number | string) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const StudioPublicBookingFlow: React.FC<StudioPublicBookingFlowProps> = ({
  clinic,
  tenantSlug,
  bookingSequence,
  services,
  professionals,
  packages,
  onSwitchClinical
}) => {
  const [step, setStep] = useState<number>(1);
  const [objective, setObjective] = useState<'service' | 'package'>('service');

  // Service booking state
  const [selectedServiceId, setSelectedServiceId] = useState<string>(services.length === 1 ? services[0].id : '');
  const [selectedProfFilter, setSelectedProfFilter] = useState<string>('any');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);
  const [slots, setSlots] = useState<any[]>([]);
  const [upcomingSlots, setUpcomingSlots] = useState<any[]>([]);
  const [weeklySummary, setWeeklySummary] = useState<any[]>([]);
  const [serviceAllowedModalities, setServiceAllowedModalities] = useState<ConcreteModality[]>(['presential']);
  const [selectedModality, setSelectedModality] = useState<ConcreteModality>('presential');
  const [linkedProfessionals, setLinkedProfessionals] = useState<any[]>([]);
  const [emptyReason, setEmptyReason] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);
  const [useRecurrence, setUseRecurrence] = useState<boolean>(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency>('weekly');
  const [recurrenceIntervalValue, setRecurrenceIntervalValue] = useState<number>(3);
  const [recurrenceIntervalUnit, setRecurrenceIntervalUnit] = useState<RecurrenceIntervalUnit>('days');
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState<number[]>([]);
  const [recurrenceEndMode, setRecurrenceEndMode] = useState<'count' | 'date'>('count');
  const [recurrenceDurationCode, setRecurrenceDurationCode] = useState<Exclude<PlanDurationCode, 'legacy_frequency'>>('1_month');
  const [recurrenceCount, setRecurrenceCount] = useState<number>(4);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string>('');
  const [recurrencePreview, setRecurrencePreview] = useState<RecurrencePreviewData | null>(null);
  const [loadingRecurrencePreview, setLoadingRecurrencePreview] = useState<boolean>(false);
  const [recurrencePreviewError, setRecurrencePreviewError] = useState<string | null>(null);
  const [slotRecurrenceMeta, setSlotRecurrenceMeta] = useState<{
    allow_recurrence?: boolean | number;
    allowed_recurrence_frequencies?: string[];
    default_recurrence_frequency?: string | null;
    custom_recurrence_intervals?: RecurrenceIntervalSpec[] | null;
    default_recurrence_interval?: RecurrenceIntervalSpec | null;
    allowed_plan_durations?: string[];
    default_plan_duration?: string | null;
  } | null>(null);

  // Package booking state
  const [selectedPackageId, setSelectedPackageId] = useState<string>(packages.length === 1 ? packages[0].id : '');
  const [activePkgServiceId, setActivePkgServiceId] = useState<string>('');
  const [pkgProfFilter, setPkgProfFilter] = useState<string>('any');
  const [pkgDate, setPkgDate] = useState<string>('');
  const [pkgSlots, setPkgSlots] = useState<any[]>([]);
  const [pkgUpcomingSlots, setPkgUpcomingSlots] = useState<any[]>([]);
  const [pkgWeeklySummary, setPkgWeeklySummary] = useState<any[]>([]);
  const [pkgSelectedModality, setPkgSelectedModality] = useState<ConcreteModality>('presential');
  const [pkgAllowedModalities, setPkgAllowedModalities] = useState<ConcreteModality[]>(['presential']);
  const [pkgLinkedProfs, setPkgLinkedProfs] = useState<any[]>([]);
  const [pkgSlotsLoading, setPkgSlotsLoading] = useState<boolean>(false);
  const [pkgEmptyReason, setPkgEmptyReason] = useState<string>('');
  const [pkgSelectedItems, setPkgSelectedItems] = useState<SelectedPackageSlotItem[]>([]);
  const [pkgItemRepeatCount, setPkgItemRepeatCount] = useState<number>(1);

  // Student form & submit
  const [studentForm, setStudentForm] = useState({
    fullName: '',
    phone: '',
    whatsapp: '',
    email: '',
    notes: ''
  });
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [bookingResult, setBookingResult] = useState<any | null>(null);
  const submitLock = useRef(false);

  const selectedService = useMemo(
    () => services.find(s => s.id === selectedServiceId) || null,
    [services, selectedServiceId]
  );

  const selectedServiceRecurrence = useMemo(() => {
    const merged = slotRecurrenceMeta
      ? {
          ...selectedService,
          allow_recurrence: slotRecurrenceMeta.allow_recurrence ?? selectedService?.allow_recurrence,
          allowed_recurrence_frequencies:
            slotRecurrenceMeta.allowed_recurrence_frequencies ?? selectedService?.allowed_recurrence_frequencies,
          default_recurrence_frequency:
            slotRecurrenceMeta.default_recurrence_frequency ?? selectedService?.default_recurrence_frequency,
          custom_recurrence_intervals:
            slotRecurrenceMeta.custom_recurrence_intervals ?? selectedService?.custom_recurrence_intervals,
          default_recurrence_interval:
            slotRecurrenceMeta.default_recurrence_interval ?? selectedService?.default_recurrence_interval,
          allowed_plan_durations:
            slotRecurrenceMeta.allowed_plan_durations ?? selectedService?.allowed_plan_durations,
          default_plan_duration:
            slotRecurrenceMeta.default_plan_duration ?? selectedService?.default_plan_duration
        }
      : selectedService;
    return parseServiceRecurrenceConfig(merged);
  }, [selectedService, slotRecurrenceMeta]);

  useEffect(() => {
    if (!selectedServiceRecurrence.allowRecurrence || selectedServiceRecurrence.allowedFrequencies.length === 0) {
      setUseRecurrence(false);
      return;
    }
    const defFreq =
      selectedServiceRecurrence.defaultFrequency ||
      selectedServiceRecurrence.allowedFrequencies[0] ||
      'weekly';
    setRecurrenceFrequency(prev =>
      selectedServiceRecurrence.allowedFrequencies.includes(prev) ? prev : defFreq
    );
    const defCustom =
      selectedServiceRecurrence.defaultCustomInterval || selectedServiceRecurrence.customIntervals[0];
    if (defCustom) {
      setRecurrenceIntervalValue(defCustom.intervalValue);
      setRecurrenceIntervalUnit(defCustom.intervalUnit);
    }
    const allowedDurs = selectedServiceRecurrence.allowedPlanDurations || [...ALL_PLAN_DURATIONS];
    setRecurrenceDurationCode(prev =>
      allowedDurs.includes(prev)
        ? prev
        : (selectedServiceRecurrence.defaultPlanDuration || allowedDurs[0] || '1_month')
    );
  }, [selectedServiceId, selectedServiceRecurrence]);

  useEffect(() => {
    if (
      objective !== 'service' ||
      step !== 3 ||
      !useRecurrence ||
      !selectedServiceId ||
      !selectedSlot?.startTime ||
      !selectedSlot?.endTime ||
      !selectedServiceRecurrence.allowRecurrence
    ) {
      setRecurrencePreview(null);
      setRecurrencePreviewError(null);
      setLoadingRecurrencePreview(false);
      return;
    }

    if (recurrenceFrequency === 'custom_weekdays' && recurrenceWeekdays.length === 0) {
      setRecurrencePreview(null);
      setRecurrencePreviewError('Selecione ao menos um dia da semana para consultar as datas.');
      return;
    }

    const startDateIso = String(selectedSlot.startTime).slice(0, 10);
    const effectiveEndMode: 'count' | 'date' = recurrenceDurationCode === 'count' ? 'count' : 'date';
    const computedPlanEnd =
      recurrenceDurationCode !== 'count' && recurrenceDurationCode !== 'custom_date'
        ? resolvePlanDurationEndDate(startDateIso, recurrenceDurationCode)
        : null;
    const effectiveEndDateStr =
      recurrenceDurationCode === 'custom_date' ? recurrenceEndDate : (computedPlanEnd || '');

    if (effectiveEndMode === 'date') {
      if (!effectiveEndDateStr || effectiveEndDateStr < startDateIso) {
        setRecurrencePreview(null);
        setRecurrencePreviewError('Informe uma data limite válida para consultar as datas.');
        return;
      }
    }

    let cancelled = false;
    setLoadingRecurrencePreview(true);
    setRecurrencePreviewError(null);

    const activeFrequency = selectedServiceRecurrence.allowedFrequencies.includes(recurrenceFrequency)
      ? recurrenceFrequency
      : selectedServiceRecurrence.defaultFrequency || selectedServiceRecurrence.allowedFrequencies[0];

    const timer = window.setTimeout(() => {
      ApiClient.post<RecurrencePreviewData>('/v1/public/studio/recurrence-preview', {
        tenantSlug: tenantSlug || clinic?.slug,
        bookingSequence,
        serviceId: selectedServiceId,
        professionalId:
          selectedProfFilter === 'any' ? selectedSlot?.professionalId || 'any' : selectedProfFilter,
        classScheduleId: selectedSlot?.classScheduleId || null,
        modality: selectedModality,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        recurrence: {
          frequency: activeFrequency,
          durationCode: recurrenceDurationCode,
          seriesMode: 'cadence_duration',
          ...(activeFrequency === 'custom_interval'
            ? { intervalValue: recurrenceIntervalValue, intervalUnit: recurrenceIntervalUnit }
            : {}),
          ...(activeFrequency === 'custom_weekdays' ? { weekdays: recurrenceWeekdays } : {}),
          ...(effectiveEndMode === 'date'
            ? { endDate: effectiveEndDateStr }
            : { maxOccurrences: recurrenceCount })
        }
      })
        .then(res => {
          if (!cancelled) {
            setRecurrencePreview(res);
            setRecurrencePreviewError(null);
          }
        })
        .catch((err: any) => {
          if (!cancelled) {
            setRecurrencePreview(null);
            setRecurrencePreviewError(err?.message || 'Não foi possível validar as datas da recorrência.');
          }
        })
        .finally(() => {
          if (!cancelled) setLoadingRecurrencePreview(false);
        });
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    objective,
    step,
    useRecurrence,
    selectedServiceId,
    selectedSlot,
    selectedProfFilter,
    selectedModality,
    selectedServiceRecurrence,
    tenantSlug,
    clinic?.slug,
    bookingSequence,
    recurrenceFrequency,
    recurrenceDurationCode,
    recurrenceIntervalValue,
    recurrenceIntervalUnit,
    recurrenceWeekdays,
    recurrenceEndMode,
    recurrenceCount,
    recurrenceEndDate
  ]);

  const selectedPackage = useMemo(
    () => packages.find(p => p.id === selectedPackageId) || null,
    [packages, selectedPackageId]
  );

  // Auto-seleciona primeiro serviço do pacote ao escolher pacote
  useEffect(() => {
    if (selectedPackage?.items?.length > 0) {
      setActivePkgServiceId(prev =>
        selectedPackage.items.some((i: any) => i.service_id === prev) ? prev : selectedPackage.items[0].service_id
      );
    } else {
      setActivePkgServiceId('');
    }
    setPkgSelectedItems([]);
  }, [selectedPackageId, selectedPackage]);

  // Busca horários e grade semanal para Serviço avulso / Turma
  useEffect(() => {
    if (objective !== 'service' || step < 3 || step > 4 || !selectedServiceId) return;
    let cancelled = false;
    setLoadingSlots(true);
    setEmptyReason('');
    const seqParam = bookingSequence ? `&bookingSequence=${bookingSequence}` : '';
    const profParam = selectedProfFilter ? `&professionalId=${encodeURIComponent(selectedProfFilter)}` : '';
    const dateParam = selectedDate ? `&date=${encodeURIComponent(selectedDate)}` : '';
    ApiClient.get<any>(
      `/v1/public/studio/slots?tenantSlug=${encodeURIComponent(tenantSlug || clinic?.slug || '')}${seqParam}&serviceId=${encodeURIComponent(selectedServiceId)}${dateParam}${profParam}&includeUpcoming=1`
    )
      .then(res => {
        if (cancelled) return;
        const profs = res?.professionals || [];
        setLinkedProfessionals(profs);
        if (profs.length === 1 && selectedProfFilter === 'any') {
          setSelectedProfFilter(profs[0].id);
        }
        setSlots(res?.slots || []);
        setUpcomingSlots(res?.upcomingSlots || []);
        setWeeklySummary(res?.weeklySummary || []);
        const allowed: ConcreteModality[] =
          Array.isArray(res?.allowedModalities) && res.allowedModalities.length > 0
            ? res.allowedModalities
            : ['presential'];
        setServiceAllowedModalities(allowed);
        setSelectedModality(prev => (allowed.includes(prev) ? prev : allowed[0]));
        setSlotRecurrenceMeta({
          allow_recurrence: res?.allowRecurrence,
          allowed_recurrence_frequencies: Array.isArray(res?.allowedRecurrenceFrequencies)
            ? res.allowedRecurrenceFrequencies
            : undefined,
          default_recurrence_frequency: res?.defaultRecurrenceFrequency ?? null,
          custom_recurrence_intervals: Array.isArray(res?.customRecurrenceIntervals)
            ? res.customRecurrenceIntervals
            : undefined,
          default_recurrence_interval: res?.defaultRecurrenceInterval ?? null,
          allowed_plan_durations: Array.isArray(res?.allowedPlanDurations)
            ? res.allowedPlanDurations
            : undefined,
          default_plan_duration: res?.defaultPlanDuration ?? null
        });
        setEmptyReason(res?.emptyReason || '');
      })
      .catch(err => {
        if (!cancelled) {
          setSlots([]);
          setUpcomingSlots([]);
          setEmptyReason(err?.message || 'Não foi possível consultar horários.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [objective, step, selectedServiceId, selectedDate, selectedProfFilter, tenantSlug, clinic?.slug, bookingSequence]);

  // Busca horários e grade para modalidade dentro de Pacote
  useEffect(() => {
    if (objective !== 'package' || step !== 3 || !activePkgServiceId) return;
    let cancelled = false;
    setPkgSlotsLoading(true);
    setPkgEmptyReason('');
    const seqParam = bookingSequence ? `&bookingSequence=${bookingSequence}` : '';
    const profParam = pkgProfFilter ? `&professionalId=${encodeURIComponent(pkgProfFilter)}` : '';
    const dateParam = pkgDate ? `&date=${encodeURIComponent(pkgDate)}` : '';
    ApiClient.get<any>(
      `/v1/public/studio/slots?tenantSlug=${encodeURIComponent(tenantSlug || clinic?.slug || '')}${seqParam}&serviceId=${encodeURIComponent(activePkgServiceId)}${dateParam}${profParam}&includeUpcoming=1`
    )
      .then(res => {
        if (cancelled) return;
        const profs = res?.professionals || [];
        setPkgLinkedProfs(profs);
        if (profs.length === 1 && pkgProfFilter === 'any') {
          setPkgProfFilter(profs[0].id);
        }
        setPkgSlots(res?.slots || []);
        setPkgUpcomingSlots(res?.upcomingSlots || []);
        setPkgWeeklySummary(res?.weeklySummary || []);
        const allowed: ConcreteModality[] =
          Array.isArray(res?.allowedModalities) && res.allowedModalities.length > 0
            ? res.allowedModalities
            : ['presential'];
        setPkgAllowedModalities(allowed);
        setPkgSelectedModality(prev => (allowed.includes(prev) ? prev : allowed[0]));
        setPkgEmptyReason(res?.emptyReason || '');
      })
      .catch(err => {
        if (!cancelled) {
          setPkgSlots([]);
          setPkgUpcomingSlots([]);
          setPkgEmptyReason(err?.message || 'Não foi possível consultar horários.');
        }
      })
      .finally(() => {
        if (!cancelled) setPkgSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [objective, step, activePkgServiceId, pkgDate, pkgProfFilter, tenantSlug, clinic?.slug, bookingSequence]);

  const upcomingDatePills = useMemo(() => {
    const start = todayIso();
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, []);

  const addPackageSlotChoice = (slotObj: any) => {
    if (slotObj?.isFull) {
      setError('Esta turma está lotada no momento. Escolha outro dia ou horário.');
      return;
    }
    const srv = services.find(s => s.id === activePkgServiceId);
    if (!srv || !selectedPackage) return;

    const slotAllowed: ConcreteModality[] =
      Array.isArray(slotObj?.allowedModalities) && slotObj.allowedModalities.length > 0
        ? slotObj.allowedModalities
        : pkgAllowedModalities;
    const resolvedModality: ConcreteModality =
      slotObj?.modality && slotAllowed.includes(slotObj.modality)
        ? slotObj.modality
        : slotAllowed.includes(pkgSelectedModality)
        ? pkgSelectedModality
        : slotAllowed[0] || 'presential';

    const repeat = Math.max(1, Math.min(12, pkgItemRepeatCount));
    const currentTotalReserved = pkgSelectedItems.reduce((sum, item) => sum + item.recurrenceCount, 0);
    const pkgMaxTotal = Number(selectedPackage.total_credits || 999);

    if (currentTotalReserved + repeat > pkgMaxTotal) {
      setError(`Esse pacote permite até ${pkgMaxTotal} aulas reservadas neste ciclo.`);
      return;
    }

    if (selectedPackage.credit_mode === 'per_service') {
      const pkgItem = (selectedPackage.items || []).find((i: any) => i.service_id === activePkgServiceId);
      const itemMax = Number(pkgItem?.included_credits || 0);
      const alreadyForSrv = pkgSelectedItems
        .filter(it => it.serviceId === activePkgServiceId)
        .reduce((sum, it) => sum + it.recurrenceCount, 0);
      if (itemMax > 0 && alreadyForSrv + repeat > itemMax) {
        setError(`A modalidade ${srv.name} possui até ${itemMax} aulas neste pacote.`);
        return;
      }
    }

    const key = `${activePkgServiceId}-${slotObj.professionalId}-${slotObj.startTime}`;
    if (pkgSelectedItems.some(it => it.key === key)) {
      setError('Este horário já está na lista de solicitação.');
      return;
    }
    setError('');
    setPkgSelectedItems(prev => [
      ...prev,
      {
        key,
        serviceId: activePkgServiceId,
        serviceName: srv.name,
        professionalId: pkgProfFilter === 'any' ? slotObj.professionalId : pkgProfFilter,
        professionalName: slotObj.professionalName,
        classScheduleId: slotObj.classScheduleId || null,
        modality: resolvedModality,
        roomName: slotObj.roomName || null,
        startTime: slotObj.startTime,
        endTime: slotObj.endTime,
        remainingSpots: slotObj.remainingSpots,
        capacity: slotObj.capacity,
        recurrenceCount: srv.allow_recurrence ? repeat : 1
      }
    ]);
  };

  const removePackageSlotChoice = (key: string) => {
    setPkgSelectedItems(prev => prev.filter(it => it.key !== key));
  };

  const handleSelectServiceSlot = (slotObj: any) => {
    if (slotObj?.isFull) return;
    setSelectedSlot(slotObj);
    const slotAllowed: ConcreteModality[] =
      Array.isArray(slotObj?.allowedModalities) && slotObj.allowedModalities.length > 0
        ? slotObj.allowedModalities
        : serviceAllowedModalities;
    if (slotObj?.modality && slotAllowed.includes(slotObj.modality)) {
      setSelectedModality(slotObj.modality);
    } else if (!slotAllowed.includes(selectedModality)) {
      setSelectedModality(slotAllowed[0] || 'presential');
    }
    setError('');
  };

  const handleConfirmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLock.current) return;
    setError('');

    if (!studentForm.fullName.trim() || !studentForm.phone.trim()) {
      setError('Informe seu nome completo e WhatsApp / telefone.');
      return;
    }

    submitLock.current = true;
    setSubmitting(true);

    try {
      const slotAllowed: ConcreteModality[] =
        Array.isArray(selectedSlot?.allowedModalities) && selectedSlot.allowedModalities.length > 0
          ? selectedSlot.allowedModalities
          : serviceAllowedModalities;
      const concreteServiceModality: ConcreteModality = slotAllowed.includes(selectedModality)
        ? selectedModality
        : slotAllowed[0] || 'presential';

      const payload =
        objective === 'package'
          ? {
              tenantSlug: tenantSlug || clinic?.slug,
              bookingSequence,
              mode: 'package',
              packageId: selectedPackageId,
              schedules: pkgSelectedItems.map(it => {
                const srvItem = services.find(s => s.id === it.serviceId);
                const pkgItemRec = parseServiceRecurrenceConfig(srvItem);
                const pkgFreq = pkgItemRec.defaultFrequency || pkgItemRec.allowedFrequencies[0] || 'weekly';
                const pkgCustomInterval =
                  pkgFreq === 'custom_interval'
                    ? pkgItemRec.defaultCustomInterval || pkgItemRec.customIntervals[0]
                    : null;
                return {
                  serviceId: it.serviceId,
                  professionalId: it.professionalId,
                  classScheduleId: it.classScheduleId || null,
                  modality: it.modality,
                  startTime: it.startTime,
                  endTime: it.endTime,
                  ...(it.recurrenceCount > 1 && pkgItemRec.allowRecurrence
                    ? {
                        recurrence: {
                          frequency: pkgFreq,
                          ...(pkgCustomInterval
                            ? {
                                intervalValue: pkgCustomInterval.intervalValue,
                                intervalUnit: pkgCustomInterval.intervalUnit
                              }
                            : {}),
                          maxOccurrences: it.recurrenceCount
                        }
                      }
                    : {})
                };
              }),
              student: {
                fullName: studentForm.fullName.trim(),
                phone: studentForm.phone.trim(),
                whatsapp: studentForm.whatsapp.trim() || studentForm.phone.trim(),
                email: studentForm.email.trim() || null,
                notes: studentForm.notes.trim() || null
              }
            }
          : {
              tenantSlug: tenantSlug || clinic?.slug,
              bookingSequence,
              mode: 'service',
              serviceId: selectedServiceId,
              professionalId: selectedProfFilter === 'any' ? selectedSlot?.professionalId || 'any' : selectedProfFilter,
              classScheduleId: selectedSlot?.classScheduleId || null,
              modality: concreteServiceModality,
              startTime: selectedSlot?.startTime,
              endTime: selectedSlot?.endTime,
              ...(useRecurrence && selectedServiceRecurrence.allowRecurrence && selectedServiceRecurrence.allowedFrequencies.length > 0
                ? (() => {
                    const effectiveFreq = selectedServiceRecurrence.allowedFrequencies.includes(recurrenceFrequency)
                      ? recurrenceFrequency
                      : selectedServiceRecurrence.defaultFrequency || selectedServiceRecurrence.allowedFrequencies[0];
                    const startDateIso = String(selectedSlot?.startTime || '').slice(0, 10);
                    const effectiveEndMode: 'count' | 'date' = recurrenceDurationCode === 'count' ? 'count' : 'date';
                    const computedPlanEnd =
                      recurrenceDurationCode !== 'count' && recurrenceDurationCode !== 'custom_date'
                        ? resolvePlanDurationEndDate(startDateIso, recurrenceDurationCode)
                        : null;
                    const effectiveEndDateStr =
                      recurrenceDurationCode === 'custom_date' ? recurrenceEndDate : (computedPlanEnd || '');
                    return {
                      recurrence: {
                        frequency: effectiveFreq,
                        durationCode: recurrenceDurationCode,
                        seriesMode: 'cadence_duration',
                        ...(effectiveFreq === 'custom_interval'
                          ? { intervalValue: recurrenceIntervalValue, intervalUnit: recurrenceIntervalUnit }
                          : {}),
                        ...(effectiveFreq === 'custom_weekdays' && recurrenceWeekdays.length > 0
                          ? { weekdays: recurrenceWeekdays }
                          : {}),
                        ...(effectiveEndMode === 'date' && effectiveEndDateStr
                          ? { endDate: effectiveEndDateStr }
                          : { maxOccurrences: recurrenceCount })
                      }
                    };
                  })()
                : {}),
              student: {
                fullName: studentForm.fullName.trim(),
                phone: studentForm.phone.trim(),
                whatsapp: studentForm.whatsapp.trim() || studentForm.phone.trim(),
                email: studentForm.email.trim() || null,
                notes: studentForm.notes.trim() || null
              }
            };

      const res = await ApiClient.post<any>('/v1/public/studio/bookings', payload);
      setBookingResult(res);
      setStep(6);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível concluir a solicitação.');
    } finally {
      setSubmitting(false);
      submitLock.current = false;
    }
  };

  const downloadIcsFirst = () => {
    const first = bookingResult?.appointments?.[0];
    if (!first) return;
    const blob = new Blob(
      [
        calendarBooking({
          startTime: first.startTime,
          endTime: first.endTime,
          title: `${first.serviceName} — ${first.professionalName}`,
          clinic: clinic?.trade_name || clinic?.name || 'Studio'
        })
      ],
      { type: 'text/calendar;charset=utf-8' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aula-studio-${first.startTime.slice(0, 10)}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetFlow = () => {
    setBookingResult(null);
    setSelectedSlot(null);
    setSelectedDate('');
    setPkgDate('');
    setPkgSelectedItems([]);
    setError('');
    setStep(1);
  };

  const stepLabels = [
    { num: 1, label: 'Objetivo' },
    { num: 2, label: objective === 'package' ? 'Pacotes' : 'Modalidade' },
    { num: 3, label: 'Horários' },
    { num: 4, label: 'Resumo' },
    { num: 5, label: 'Seus dados' },
    { num: 6, label: 'Solicitado' }
  ];

  return (
    <div className="space-y-6">
      {onSwitchClinical && step < 6 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onSwitchClinical}
            className="text-xs font-semibold text-teal-700 hover:text-teal-900 underline underline-offset-2 cursor-pointer"
          >
            Trocar para Atendimentos Individuais (Clínica)
          </button>
        </div>
      )}

      {/* Indicador de etapas do Studio */}
      <nav aria-label="Etapas do agendamento do Studio" className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-[11px]">
        {stepLabels.map(item => {
          const active = step === item.num;
          const done = step > item.num;
          return (
            <button
              key={item.num}
              type="button"
              disabled={!done || step === 6}
              onClick={() => done && step < 6 && setStep(item.num)}
              className={`px-2.5 py-2 rounded-xl border text-center font-bold transition-all ${
                active
                  ? 'bg-teal-700 text-white border-teal-700 shadow-xs'
                  : done
                  ? 'bg-teal-50 text-teal-800 border-teal-200 cursor-pointer hover:bg-teal-100'
                  : 'bg-slate-50 text-slate-400 border-slate-200'
              }`}
            >
              {item.num}. {item.label}
            </button>
          );
        })}
      </nav>

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-semibold flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* ETAPA 1: OBJETIVO */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-slate-900">Como deseja agendar hoje?</h2>
            <p className="text-xs text-slate-500">
              Escolha entre agendar uma aula avulsa / turma ou conhecer os pacotes do Studio.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => {
                setObjective('service');
                setError('');
                setStep(2);
              }}
              className="p-5 rounded-2xl border-2 border-slate-200 hover:border-teal-600 bg-white text-left space-y-2.5 transition-all shadow-2xs cursor-pointer group"
            >
              <div className="w-11 h-11 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center group-hover:bg-teal-700 group-hover:text-white transition-colors">
                <Calendar className="w-5 h-5" />
              </div>
              <div className="font-bold text-base text-slate-900">Agendar uma aula</div>
              <p className="text-xs text-slate-500">
                Veja modalidades, turmas coletivas com vagas em tempo real, instrutores e horários disponíveis.
              </p>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-teal-700 pt-1">
                Ver modalidades <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </button>

            <button
              type="button"
              disabled={packages.length === 0}
              onClick={() => {
                setObjective('package');
                setError('');
                setStep(2);
              }}
              className={`p-5 rounded-2xl border-2 text-left space-y-2.5 transition-all shadow-2xs ${
                packages.length === 0
                  ? 'border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed'
                  : 'border-slate-200 hover:border-indigo-600 bg-white cursor-pointer group'
              }`}
            >
              <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <Package className="w-5 h-5" />
              </div>
              <div className="font-bold text-base text-slate-900">Conhecer os pacotes</div>
              <p className="text-xs text-slate-500">
                {packages.length > 0
                  ? `Combine aulas e modalidades com mensalidade ou valor fechado (${packages.length} pacote${packages.length > 1 ? 's' : ''} disponíve${packages.length > 1 ? 'is' : 'l'}).`
                  : 'Nenhum pacote público configurado neste Studio no momento.'}
              </p>
              {packages.length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 pt-1">
                  Explorar pacotes <ArrowRight className="w-3.5 h-3.5" />
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ETAPA 2: MODALIDADE (SERVIÇO) OU PACOTE */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <BookingBackButton onClick={() => setStep(1)} />
            <span className="text-xs font-semibold text-slate-500">
              {objective === 'package' ? 'Escolha um pacote' : 'Escolha a modalidade ou aula'}
            </span>
          </div>

          {objective === 'service' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {services.filter(
                s =>
                  s.service_kind !== 'group' ||
                  (s.has_public_schedules !== false &&
                    s.is_publicly_available !== false &&
                    Array.isArray(s.weekly_schedule_summary) &&
                    s.weekly_schedule_summary.length > 0)
              ).length === 0 ? (
                <div className="col-span-full p-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-center text-xs text-slate-600">
                  Nenhuma aula com horários públicos ativos disponível para reserva online neste momento.
                </div>
              ) : (
                services
                  .filter(
                    s =>
                      s.service_kind !== 'group' ||
                      (s.has_public_schedules !== false &&
                        s.is_publicly_available !== false &&
                        Array.isArray(s.weekly_schedule_summary) &&
                        s.weekly_schedule_summary.length > 0)
                  )
                  .map(s => {
                const chosen = selectedServiceId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSelectedServiceId(s.id);
                      setSelectedSlot(null);
                      setSelectedDate('');
                      setSelectedProfFilter('any');
                      setError('');
                      setStep(3);
                    }}
                    className={`p-4 rounded-2xl border text-left space-y-2 transition-all cursor-pointer ${
                      chosen
                        ? 'border-teal-600 bg-teal-50/40 ring-2 ring-teal-500/20'
                        : 'border-slate-200 bg-white hover:border-teal-400'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-sm text-slate-900">{s.name}</span>
                      {Number(s.price) > 0 && (
                        <span className="text-xs font-extrabold text-teal-700 whitespace-nowrap">
                          {formatMoney(s.price)}
                        </span>
                      )}
                    </div>
                    {s.description && <p className="text-xs text-slate-500 line-clamp-2">{s.description}</p>}
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold">
                        <Clock className="w-3 h-3 inline mr-1" />
                        {s.duration_minutes || 50} min
                      </span>
                      {s.service_kind === 'group' && (
                        <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200 font-bold">
                          <Users className="w-3 h-3 inline mr-1" />
                          Turma coletiva ({s.default_capacity || 1} vagas)
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                        {s.modality === 'both' ? 'Presencial ou Online' : modalityLabel(s.modality)}
                      </span>
                      {Boolean(s.allow_recurrence) && (
                        <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold">
                          Permite plano semanal
                        </span>
                      )}
                    </div>
                    {Array.isArray(s.linked_professionals) && s.linked_professionals.length > 0 && (
                      <p className="text-[11px] text-slate-500 truncate">
                        Instrutores: <span className="font-semibold text-slate-700">{s.linked_professionals.map((lp: any) => lp.name).join(', ')}</span>
                      </p>
                    )}
                    {s.service_kind === 'group' && (
                      <div className="pt-1.5 mt-1 border-t border-slate-100 text-[11px]">
                        <div className="space-y-0.5 text-slate-600">
                          <span className="font-bold text-teal-800 block">Grade semanal:</span>
                          {s.weekly_schedule_summary.slice(0, 3).map((w: any, idx: number) => (
                            <span key={idx} className="block truncate">
                              • {w.weekdaysLabel} — {w.timeRange}{w.professionalName ? ` (${w.professionalName})` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </button>
                );
              })
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {packages.map(pkg => (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => {
                    setSelectedPackageId(pkg.id);
                    setError('');
                    setStep(3);
                  }}
                  className={`p-4 sm:p-5 rounded-2xl border text-left space-y-3 transition-all cursor-pointer ${
                    selectedPackageId === pkg.id
                      ? 'border-indigo-600 bg-indigo-50/30 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 bg-white hover:border-indigo-400'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-base text-slate-900">{pkg.name}</h3>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {pkg.billing_type === 'recurring_monthly'
                            ? 'Mensalidade recorrente'
                            : `Pagamento único (${pkg.installments_count || 1}x)`}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                          {pkg.credit_mode === 'shared_pool'
                            ? `Livre • ${pkg.total_credits} aulas no período`
                            : `Total de ${pkg.total_credits} aulas incluídas`}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          Validade: {pkg.validity_days || 30} dias
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-extrabold text-indigo-700">{formatMoney(pkg.price)}</div>
                      {pkg.billing_type === 'recurring_monthly' && (
                        <div className="text-[10px] text-slate-500">por mês</div>
                      )}
                    </div>
                  </div>
                  {pkg.description && <p className="text-xs text-slate-600">{pkg.description}</p>}
                  <div className="flex flex-wrap gap-2">
                    {(pkg.items || []).map((it: any) => (
                      <span
                        key={it.id}
                        className="text-[11px] px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-semibold"
                      >
                        {it.service_name}
                        {pkg.credit_mode === 'per_service' ? ` (${it.included_credits}x)` : ''}
                        {it.service_professional_name ? ` • Prof. ${it.service_professional_name}` : ''}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ETAPA 3: DIAS, HORÁRIOS, VAGAS & INSTRUTOR */}
      {step === 3 && objective === 'service' && selectedService && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <BookingBackButton onClick={() => setStep(2)} />
            <span className="text-xs font-bold text-slate-700">{selectedService.name}</span>
          </div>

          {weeklySummary.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-teal-50/70 border border-teal-200 text-xs space-y-1">
              <div className="font-bold text-teal-900 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-teal-700" />
                Grade semanal desta aula
              </div>
              {weeklySummary.map((item: any, idx: number) => (
                <p key={idx} className="text-slate-700 text-[11px]">
                  • {item.text}
                </p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Instrutor</label>
              <select
                value={selectedProfFilter}
                onChange={e => {
                  setSelectedProfFilter(e.target.value);
                  setSelectedSlot(null);
                }}
                className={bookingInput}
              >
                <option value="any">Qualquer instrutor disponível</option>
                {linkedProfessionals.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">Filtrar por data (opcional)</label>
                {selectedDate && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDate('');
                      setSelectedSlot(null);
                    }}
                    className="text-[11px] font-bold text-teal-700 hover:underline cursor-pointer"
                  >
                    Ver próximas turmas
                  </button>
                )}
              </div>
              <input
                type="date"
                min={todayIso()}
                value={selectedDate}
                onChange={e => {
                  setSelectedDate(e.target.value);
                  setSelectedSlot(null);
                }}
                className={bookingInput}
              />
            </div>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => {
                setSelectedDate('');
                setSelectedSlot(null);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 border cursor-pointer ${
                !selectedDate
                  ? 'bg-teal-700 text-white border-teal-700'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-teal-400'
              }`}
            >
              {selectedService.service_kind === 'group' ? 'Próximas turmas' : 'Próximos horários'}
            </button>
            {upcomingDatePills.map(d => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setSelectedDate(d);
                  setSelectedSlot(null);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 border cursor-pointer ${
                  selectedDate === d
                    ? 'bg-teal-700 text-white border-teal-700'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-teal-400'
                }`}
              >
                {formatDateShort(d)}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800">
              {selectedDate
                ? `Horários em ${formatDateShort(selectedDate)}`
                : selectedService.service_kind === 'group'
                ? 'Próximas turmas disponíveis'
                : 'Próximos horários disponíveis'}
            </span>
          </div>

          {(() => {
            const visibleSlots = selectedDate ? slots : upcomingSlots;
            if (loadingSlots) {
              return <div className="p-6 text-center text-xs text-slate-400">Buscando horários e vagas...</div>;
            }
            if (visibleSlots.length === 0) {
              return (
                <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800 text-center">
                  {emptyReason || 'Sem horários ou turmas disponíveis nesta seleção. Tente outra data ou instrutor.'}
                </div>
              );
            }
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {visibleSlots.map((s, idx) => {
                  const isFull = Boolean(s.isFull);
                  const isChosen =
                    !isFull &&
                    selectedSlot?.startTime === s.startTime &&
                    selectedSlot?.professionalId === s.professionalId;
                  const slotDate = s.date || s.startTime?.slice(0, 10);
                  const endClock = s.endTimeClock || s.endTime?.slice(11, 16);
                  return (
                    <button
                      key={`${s.professionalId}-${s.startTime}-${idx}`}
                      type="button"
                      disabled={isFull}
                      onClick={() => handleSelectServiceSlot(s)}
                      className={`p-3.5 rounded-2xl border text-left transition-all ${
                        isFull
                          ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-80'
                          : isChosen
                          ? 'bg-teal-700 text-white border-teal-700 shadow-sm cursor-pointer'
                          : 'bg-white text-slate-800 border-slate-200 hover:border-teal-500 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[11px] font-bold ${isChosen ? 'text-teal-100' : 'text-slate-500'}`}>
                          {slotDate ? formatDateShort(slotDate) : ''}
                        </span>
                        {s.serviceKind === 'group' && (
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isFull
                                ? 'bg-rose-100 text-rose-700'
                                : isChosen
                                ? 'bg-teal-800 text-teal-100'
                                : 'bg-teal-50 text-teal-800 border border-teal-200'
                            }`}
                          >
                            {isFull
                              ? 'Turma lotada'
                              : `${s.remainingSpots} vaga${s.remainingSpots === 1 ? '' : 's'} disponíve${s.remainingSpots === 1 ? 'l' : 'is'}`}
                          </span>
                        )}
                      </div>
                      <div className="flex items-baseline justify-between gap-2 mt-1">
                        <span className="text-sm font-extrabold">
                          {s.time}
                          {endClock ? ` às ${endClock}` : ''}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            isChosen ? 'bg-teal-800 text-teal-100' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {modalityLabel(s.modality)}
                        </span>
                      </div>
                      <div className={`text-[11px] mt-1 truncate ${isChosen ? 'text-teal-100' : 'text-slate-600'}`}>
                        Prof. {s.professionalName}
                        {s.roomName ? ` • ${s.roomName}` : ''}
                      </div>
                      {s.serviceKind === 'group' && Number(s.capacity) > 0 && (
                        <div className={`text-[10px] mt-1 font-medium ${isChosen ? 'text-teal-100' : 'text-slate-500'}`}>
                          {s.enrolledCount ?? 0} de {s.capacity} vagas ocupadas
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* Escolha explícita de modalidade quando a aula/serviço permitir Presencial e Online */}
          {selectedSlot && (() => {
            const slotAllowed: ConcreteModality[] =
              Array.isArray(selectedSlot.allowedModalities) && selectedSlot.allowedModalities.length > 0
                ? selectedSlot.allowedModalities
                : serviceAllowedModalities;
            if (slotAllowed.length <= 1) return null;
            return (
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="font-bold text-slate-800">Escolha como prefere participar desta aula:</div>
                <div className="flex flex-wrap gap-2">
                  {slotAllowed.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSelectedModality(m)}
                      className={`px-3.5 py-1.5 rounded-xl font-bold border transition-all cursor-pointer ${
                        selectedModality === m
                          ? 'bg-teal-700 text-white border-teal-700'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-teal-400'
                      }`}
                    >
                      {modalityLabel(m)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Recorrência conforme configuração do serviço */}
          {selectedSlot && selectedServiceRecurrence.allowRecurrence && selectedServiceRecurrence.allowedFrequencies.length > 0 && (
            <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-200 space-y-2.5 text-xs">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-indigo-950">
                <input
                  type="checkbox"
                  checked={useRecurrence}
                  onChange={e => {
                    const checked = e.target.checked;
                    setUseRecurrence(checked);
                    if (checked && selectedSlot?.startTime && recurrenceWeekdays.length === 0) {
                      const dStr = String(selectedSlot.startTime).slice(0, 10);
                      const [yy, mm, dd] = dStr.split('-').map(Number);
                      const wd = new Date(Date.UTC(yy, (mm || 1) - 1, dd || 1)).getUTCDay();
                      setRecurrenceWeekdays([wd]);
                    }
                  }}
                  className="w-4 h-4 text-indigo-600 rounded"
                />
                <Repeat className="w-4 h-4 text-indigo-600" />
                Repetir este horário automaticamente (plano finito)
              </label>
              {useRecurrence && (
                <div className="space-y-2.5 pl-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-600 font-semibold">Frequência da aula:</span>
                    <select
                      value={
                        selectedServiceRecurrence.allowedFrequencies.includes(recurrenceFrequency)
                          ? recurrenceFrequency
                          : (selectedServiceRecurrence.defaultFrequency || selectedServiceRecurrence.allowedFrequencies[0])
                      }
                      onChange={e => setRecurrenceFrequency(e.target.value as RecurrenceFrequency)}
                      className="border border-indigo-200 rounded-lg px-2.5 py-1 bg-white font-bold"
                    >
                      {selectedServiceRecurrence.allowedFrequencies.map(f => (
                        <option key={f} value={f}>
                          {RECURRENCE_FREQUENCY_LABELS[f]}
                        </option>
                      ))}
                    </select>
                    <span className="text-slate-600 font-semibold">Duração do plano:</span>
                    <select
                      value={recurrenceDurationCode}
                      onChange={e => setRecurrenceDurationCode(e.target.value as any)}
                      className="border border-indigo-200 rounded-lg px-2 py-1 bg-white font-semibold"
                    >
                      {(selectedServiceRecurrence.allowedPlanDurations || ALL_PLAN_DURATIONS).map(dur => (
                        <option key={dur} value={dur}>
                          {PLAN_DURATION_LABELS[dur]}
                        </option>
                      ))}
                    </select>
                    {recurrenceDurationCode === 'count' && (
                      <div className="inline-flex items-center gap-1.5">
                        <input
                          type="number"
                          min={2}
                          max={MAX_PUBLIC_RECURRENCE_OCCURRENCES}
                          value={recurrenceCount}
                          onChange={e =>
                            setRecurrenceCount(
                              Math.max(2, Math.min(MAX_PUBLIC_RECURRENCE_OCCURRENCES, Number(e.target.value) || 2))
                            )
                          }
                          className="w-16 border border-indigo-200 rounded-lg px-2 py-1 bg-white text-center font-bold"
                          aria-label="Quantidade de aulas"
                        />
                        <span className="text-slate-600 font-semibold">aulas</span>
                      </div>
                    )}
                    {recurrenceDurationCode === 'custom_date' && (
                      <input
                        type="date"
                        min={selectedSlot?.startTime ? String(selectedSlot.startTime).slice(0, 10) : todayIso()}
                        value={recurrenceEndDate}
                        onChange={e => setRecurrenceEndDate(e.target.value)}
                        className="border border-indigo-200 rounded-lg px-2 py-1 bg-white font-semibold"
                        aria-label="Data limite da recorrência"
                      />
                    )}
                  </div>
                  {recurrenceFrequency === 'custom_interval' && (
                    <div className="p-2.5 rounded-xl bg-white border border-indigo-200 space-y-2">
                      {selectedServiceRecurrence.customIntervals.length > 0 && (
                        <div>
                          <span className="block text-[11px] font-semibold text-slate-500 mb-1">
                            Intervalos autorizados para este serviço:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedServiceRecurrence.customIntervals.map((spec, idx) => {
                              const active =
                                spec.intervalValue === recurrenceIntervalValue && spec.intervalUnit === recurrenceIntervalUnit;
                              return (
                                <button
                                  key={`${spec.intervalValue}-${spec.intervalUnit}-${idx}`}
                                  type="button"
                                  onClick={() => {
                                    setRecurrenceIntervalValue(spec.intervalValue);
                                    setRecurrenceIntervalUnit(spec.intervalUnit);
                                  }}
                                  className={`px-2 py-1 rounded-md border text-[11px] font-bold cursor-pointer ${
                                    active
                                      ? 'bg-indigo-600 text-white border-indigo-600'
                                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300'
                                  }`}
                                >
                                  {formatCustomIntervalLabel(spec)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-slate-700 font-semibold">Repetir a cada</span>
                        <input
                          type="number"
                          min={RECURRENCE_INTERVAL_BOUNDS[recurrenceIntervalUnit].min}
                          max={RECURRENCE_INTERVAL_BOUNDS[recurrenceIntervalUnit].max}
                          value={recurrenceIntervalValue}
                          onChange={e => {
                            const bounds = RECURRENCE_INTERVAL_BOUNDS[recurrenceIntervalUnit];
                            setRecurrenceIntervalValue(
                              Math.max(bounds.min, Math.min(bounds.max, Number(e.target.value) || bounds.min))
                            );
                          }}
                          className="w-16 border border-indigo-200 rounded-lg px-2 py-1 bg-white text-center font-bold"
                          aria-label="Quantidade do intervalo"
                        />
                        <select
                          value={recurrenceIntervalUnit}
                          onChange={e => {
                            const nextUnit = e.target.value as RecurrenceIntervalUnit;
                            const bounds = RECURRENCE_INTERVAL_BOUNDS[nextUnit];
                            setRecurrenceIntervalUnit(nextUnit);
                            setRecurrenceIntervalValue(prev => Math.max(bounds.min, Math.min(bounds.max, prev)));
                          }}
                          className="border border-indigo-200 rounded-lg px-2 py-1 bg-white font-bold"
                          aria-label="Unidade do intervalo"
                        >
                          <option value="days">{recurrenceIntervalValue === 1 ? 'Dia' : 'Dias'}</option>
                          <option value="weeks">{recurrenceIntervalValue === 1 ? 'Semana' : 'Semanas'}</option>
                          <option value="months">{recurrenceIntervalValue === 1 ? 'Mês' : 'Meses'}</option>
                        </select>
                      </div>
                    </div>
                  )}
                  {recurrenceFrequency === 'custom_weekdays' && (
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { v: 1, l: 'Seg' },
                        { v: 2, l: 'Ter' },
                        { v: 3, l: 'Qua' },
                        { v: 4, l: 'Qui' },
                        { v: 5, l: 'Sex' },
                        { v: 6, l: 'Sáb' },
                        { v: 0, l: 'Dom' }
                      ].map(w => {
                        const active = recurrenceWeekdays.includes(w.v);
                        return (
                          <button
                            key={w.v}
                            type="button"
                            onClick={() =>
                              setRecurrenceWeekdays(prev =>
                                prev.includes(w.v) ? prev.filter(x => x !== w.v) : [...prev, w.v]
                              )
                            }
                            className={`px-2 py-1 rounded-md border text-[11px] font-bold cursor-pointer ${
                              active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'
                            }`}
                          >
                            {w.l}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <RecurrencePreviewBox
                    preview={recurrencePreview}
                    loading={loadingRecurrencePreview}
                    error={recurrencePreviewError}
                    accent="teal"
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={
                !selectedSlot ||
                (useRecurrence &&
                  (loadingRecurrencePreview ||
                    Boolean(recurrencePreviewError) ||
                    Boolean(recurrencePreview && !recurrencePreview.valid)))
              }
              onClick={() => setStep(4)}
              className={bookingButton}
            >
              Continuar <ArrowRight className="w-4 h-4 inline ml-1" />
            </button>
          </div>
        </div>
      )}

      {/* ETAPA 3 (MODO PACOTE): SELECIONAR HORÁRIOS POR MODALIDADE */}
      {step === 3 && objective === 'package' && selectedPackage && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <BookingBackButton onClick={() => setStep(2)} />
            <span className="text-xs font-bold text-indigo-800">{selectedPackage.name}</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-200 text-xs text-indigo-950 space-y-2">
            <div className="font-bold">Seu pacote inclui:</div>
            <div className="flex flex-wrap gap-2">
              {(selectedPackage.items || []).map((it: any) => {
                const countChosen = pkgSelectedItems
                  .filter(x => x.serviceId === it.service_id)
                  .reduce((sum, x) => sum + x.recurrenceCount, 0);
                const maxPerService =
                  selectedPackage.credit_mode === 'per_service' ? Number(it.included_credits || 0) : null;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => {
                      setActivePkgServiceId(it.service_id);
                      setPkgProfFilter('any');
                      setPkgDate('');
                    }}
                    className={`px-3 py-2 rounded-xl font-bold border transition-all cursor-pointer text-left ${
                      activePkgServiceId === it.service_id
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-400'
                    }`}
                  >
                    <div>
                      {it.service_name}
                      {maxPerService ? ` (${countChosen}/${maxPerService} aulas)` : countChosen > 0 ? ` (${countChosen} escolh.)` : ''}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {activePkgServiceId && (
            <div className="space-y-3 border border-slate-200 rounded-2xl p-4 bg-white">
              {pkgWeeklySummary.length > 0 && (
                <div className="p-2.5 rounded-xl bg-teal-50/70 border border-teal-200 text-[11px] space-y-0.5">
                  <span className="font-bold text-teal-900 block">Grade semanal da modalidade selecionada:</span>
                  {pkgWeeklySummary.map((w: any, idx: number) => (
                    <span key={idx} className="block text-slate-700">
                      • {w.text}
                    </span>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Instrutor</label>
                  <select
                    value={pkgProfFilter}
                    onChange={e => setPkgProfFilter(e.target.value)}
                    className={bookingInput}
                  >
                    <option value="any">Qualquer disponível</option>
                    {pkgLinkedProfs.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-600">Filtrar data (opcional)</label>
                    {pkgDate && (
                      <button
                        type="button"
                        onClick={() => setPkgDate('')}
                        className="text-[10px] font-bold text-indigo-700 hover:underline cursor-pointer"
                      >
                        Próximas turmas
                      </button>
                    )}
                  </div>
                  <input
                    type="date"
                    min={todayIso()}
                    value={pkgDate}
                    onChange={e => setPkgDate(e.target.value)}
                    className={bookingInput}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Repetir por semanas</label>
                  <select
                    value={pkgItemRepeatCount}
                    onChange={e => setPkgItemRepeatCount(Number(e.target.value) || 1)}
                    className={bookingInput}
                  >
                    <option value={1}>Somente esta data (1 aula)</option>
                    <option value={2}>2 semanas seguidas</option>
                    <option value={4}>4 semanas seguidas</option>
                  </select>
                </div>
              </div>

              {pkgAllowedModalities.length > 1 && (
                <div className="flex flex-wrap items-center gap-2 text-[11px] pt-1">
                  <span className="font-bold text-slate-700">Modalidade para reserva:</span>
                  {pkgAllowedModalities.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPkgSelectedModality(m)}
                      className={`px-2.5 py-1 rounded-lg font-bold border cursor-pointer ${
                        pkgSelectedModality === m
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {modalityLabel(m)}
                    </button>
                  ))}
                </div>
              )}

              {(() => {
                const visiblePkgSlots = pkgDate ? pkgSlots : pkgUpcomingSlots;
                if (pkgSlotsLoading) {
                  return <div className="py-4 text-center text-xs text-slate-400">Consultando horários...</div>;
                }
                if (visiblePkgSlots.length === 0) {
                  return (
                    <div className="p-3 rounded-xl bg-amber-50 text-xs text-amber-800 text-center">
                      {pkgEmptyReason || 'Sem turmas ou horários disponíveis para esta modalidade nesta seleção.'}
                    </div>
                  );
                }
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {visiblePkgSlots.map((s, idx) => {
                      const isFull = Boolean(s.isFull);
                      const slotDate = s.date || s.startTime?.slice(0, 10);
                      const endClock = s.endTimeClock || s.endTime?.slice(11, 16);
                      return (
                        <button
                          key={`${s.professionalId}-${s.startTime}-${idx}`}
                          type="button"
                          disabled={isFull}
                          onClick={() => addPackageSlotChoice(s)}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            isFull
                              ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-80'
                              : 'border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/40 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] font-bold text-slate-500">
                              {slotDate ? formatDateShort(slotDate) : ''}
                            </span>
                            {s.serviceKind === 'group' && (
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                  isFull ? 'bg-rose-100 text-rose-700' : 'text-teal-700 bg-teal-50'
                                }`}
                              >
                                {isFull ? 'Turma lotada' : `${s.remainingSpots} vaga${s.remainingSpots === 1 ? '' : 's'}`}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-1 mt-1">
                            <span className={`font-extrabold text-xs ${isFull ? 'text-slate-400' : 'text-slate-900'}`}>
                              {isFull ? '' : '+ '}
                              {s.time}
                              {endClock ? ` às ${endClock}` : ''}
                            </span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              {modalityLabel(s.modality)}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 truncate mt-0.5">
                            Prof. {s.professionalName}
                            {s.roomName ? ` • ${s.roomName}` : ''}
                          </div>
                          {s.serviceKind === 'group' && Number(s.capacity) > 0 && (
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {s.enrolledCount ?? 0} de {s.capacity} vagas ocupadas
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Lista de horários escolhidos no pacote */}
          {pkgSelectedItems.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-700">Horários selecionados para reserva inicial:</div>
              <div className="space-y-1.5">
                {pkgSelectedItems.map(it => (
                  <div
                    key={it.key}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-bold text-slate-900">{it.serviceName}</span> •{' '}
                      <span>{formatDateShort(it.startTime)} às {it.startTime.slice(11, 16)}</span> •{' '}
                      <span className="text-slate-600">
                        Prof. {it.professionalName} • {modalityLabel(it.modality)}
                        {it.roomName ? ` • ${it.roomName}` : ''}
                      </span>
                      {it.recurrenceCount > 1 && (() => {
                        const srvItem = services.find(s => s.id === it.serviceId);
                        const pkgItemRec = parseServiceRecurrenceConfig(srvItem);
                        const pkgFreq = pkgItemRec.defaultFrequency || pkgItemRec.allowedFrequencies[0] || 'weekly';
                        const pkgCustom =
                          pkgFreq === 'custom_interval'
                            ? pkgItemRec.defaultCustomInterval || pkgItemRec.customIntervals[0]
                            : null;
                        return (
                          <span className="ml-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                            {it.recurrenceCount}x ({formatRecurrenceDescription({
                              frequency: pkgFreq,
                              intervalValue: pkgCustom?.intervalValue,
                              intervalUnit: pkgCustom?.intervalUnit
                            })})
                          </span>
                        );
                      })()}
                    </div>
                    <button
                      type="button"
                      onClick={() => removePackageSlotChoice(it.key)}
                      className="text-rose-600 hover:underline font-bold text-[11px] shrink-0 cursor-pointer"
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button type="button" onClick={() => setStep(4)} className={bookingButton}>
              Revisar solicitação <ArrowRight className="w-4 h-4 inline ml-1" />
            </button>
          </div>
        </div>
      )}

      {/* ETAPA 4: CONFIRMAÇÃO DE RESUMO + INSTRUTOR */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <BookingBackButton onClick={() => setStep(3)} />
            <span className="text-xs font-semibold text-slate-500">Confira antes de informar seus dados</span>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-600" />
              Resumo da Solicitação
            </h3>

            {objective === 'package' && selectedPackage ? (
              <div className="space-y-2">
                <div className="flex justify-between font-bold text-sm text-slate-900">
                  <span>{selectedPackage.name}</span>
                  <span className="text-indigo-700">{formatMoney(selectedPackage.price)}</span>
                </div>
                <p className="text-slate-600">
                  Cobrança:{' '}
                  <strong>
                    {selectedPackage.billing_type === 'recurring_monthly'
                      ? 'Mensalidade recorrente'
                      : `Pagamento único (${selectedPackage.installments_count || 1}x)`}
                  </strong>{' '}
                  • Pagamento pendente de acerto/confirmação no Studio.
                </p>
                {pkgSelectedItems.length > 0 ? (
                  <ul className="list-disc pl-4 space-y-1 text-slate-700">
                    {pkgSelectedItems.map(it => {
                      const srvItem = services.find(s => s.id === it.serviceId);
                      const pkgItemRec = parseServiceRecurrenceConfig(srvItem);
                      const pkgFreq = pkgItemRec.defaultFrequency || pkgItemRec.allowedFrequencies[0] || 'weekly';
                      const pkgCustom =
                        pkgFreq === 'custom_interval'
                          ? pkgItemRec.defaultCustomInterval || pkgItemRec.customIntervals[0]
                          : null;
                      return (
                        <li key={it.key}>
                          <strong>{it.serviceName}</strong> — {formatDateShort(it.startTime)} às {it.startTime.slice(11, 16)} (Prof.{' '}
                          {it.professionalName} • {modalityLabel(it.modality)}
                          {it.roomName ? ` • ${it.roomName}` : ''}
                          {it.recurrenceCount > 1
                            ? `, ${it.recurrenceCount} ocorrências — ${formatRecurrenceDescription({
                                frequency: pkgFreq,
                                intervalValue: pkgCustom?.intervalValue,
                                intervalUnit: pkgCustom?.intervalUnit
                              })}`
                            : ''}
                          )
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-slate-500">Sem horários pré-reservados agora — você poderá agendar após confirmação.</p>
                )}
              </div>
            ) : selectedService && selectedSlot ? (
              <div className="space-y-2">
                <div className="flex justify-between font-bold text-sm text-slate-900">
                  <span>{selectedService.name}</span>
                  <span className="text-teal-700">{formatMoney(selectedService.price)}</span>
                </div>
                <p className="text-slate-700">
                  <strong>Instrutor:</strong> {selectedSlot.professionalName}
                  {selectedSlot.roomName ? ` • ${selectedSlot.roomName}` : ''}
                </p>
                <p className="text-slate-700">
                  <strong>Modalidade:</strong> {modalityLabel(selectedModality)}
                </p>
                <p className="text-slate-700">
                  <strong>Data e hora:</strong> {formatDateShort(selectedSlot.startTime)} às {selectedSlot.time}
                  {selectedSlot.endTimeClock ? ` às ${selectedSlot.endTimeClock}` : ''}
                  {useRecurrence
                    ? ` (série ${formatRecurrenceDescription({
                        frequency: selectedServiceRecurrence.allowedFrequencies.includes(recurrenceFrequency)
                          ? recurrenceFrequency
                          : selectedServiceRecurrence.defaultFrequency || selectedServiceRecurrence.allowedFrequencies[0],
                        intervalValue: recurrenceIntervalValue,
                        intervalUnit: recurrenceIntervalUnit,
                        weekdays: recurrenceWeekdays
                      })} • ${PLAN_DURATION_LABELS[recurrenceDurationCode] || 'Duração do plano'} — ${
                        recurrencePreview
                          ? `${recurrencePreview.totalCount} aulas`
                          : recurrenceDurationCode === 'custom_date' && recurrenceEndDate
                          ? `até ${formatDateShort(recurrenceEndDate)}`
                          : `${recurrenceCount} aulas`
                      })`
                    : ''}
                </p>
              </div>
            ) : null}
          </div>

          <div className="flex justify-end">
            <button type="button" onClick={() => setStep(5)} className={bookingButton}>
              Informar meus dados <ArrowRight className="w-4 h-4 inline ml-1" />
            </button>
          </div>
        </div>
      )}

      {/* ETAPA 5: DADOS DO ALUNO (SEM BUSCA ABERTA) */}
      {step === 5 && (
        <form onSubmit={handleConfirmSubmit} className="space-y-4">
          <div className="flex items-center justify-between">
            <BookingBackButton onClick={() => setStep(4)} />
            <span className="text-xs font-semibold text-slate-500">Seus dados para contato e reserva</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="sm:col-span-2">
              <label className="block font-bold text-slate-700 mb-1">Nome completo *</label>
              <input
                type="text"
                required
                value={studentForm.fullName}
                onChange={e => setStudentForm({ ...studentForm, fullName: e.target.value })}
                placeholder="Digite seu nome completo"
                className={bookingInput}
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">WhatsApp / Telefone *</label>
              <input
                type="tel"
                required
                value={studentForm.phone}
                onChange={e => setStudentForm({ ...studentForm, phone: e.target.value })}
                placeholder="(11) 99999-9999"
                className={bookingInput}
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">E-mail (opcional)</label>
              <input
                type="email"
                value={studentForm.email}
                onChange={e => setStudentForm({ ...studentForm, email: e.target.value })}
                placeholder="voce@email.com"
                className={bookingInput}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-bold text-slate-700 mb-1">Observações (opcional)</label>
              <textarea
                rows={2}
                value={studentForm.notes}
                onChange={e => setStudentForm({ ...studentForm, notes: e.target.value })}
                placeholder="Objetivo, preferência ou observação para o instrutor..."
                className={bookingInput}
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button type="submit" disabled={submitting} className={bookingButton}>
              {submitting ? 'Enviando solicitação...' : objective === 'package' ? 'Solicitar pacote e horários' : 'Confirmar agendamento'}
            </button>
          </div>
        </form>
      )}

      {/* ETAPA 6: CONFIRMAÇÃO REAL (NUNCA EXIBE PAGAMENTO CONFIRMADO FALSO) */}
      {step === 6 && bookingResult && (
        <div className="p-6 rounded-3xl bg-emerald-50/70 border border-emerald-200 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-extrabold text-slate-900">
              {bookingResult.mode === 'package' ? 'Solicitação de Pacote Registrada!' : 'Horário Reservado!'}
            </h3>
            <p className="text-xs text-slate-600 max-w-md mx-auto">{bookingResult.message}</p>
          </div>

          {bookingResult.paymentPending && (
            <div className="inline-block px-3.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
              Status financeiro: Pagamento pendente no estabelecimento
            </div>
          )}

          {Array.isArray(bookingResult.appointments) && bookingResult.appointments.length > 0 && (
            <div className="text-left max-w-md mx-auto bg-white p-4 rounded-2xl border border-emerald-100 space-y-2 text-xs">
              <div className="font-bold text-slate-700 uppercase text-[10px]">Aulas reservadas</div>
              {bookingResult.appointments.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between gap-2 border-b border-slate-100 last:border-0 pb-1.5">
                  <div>
                    <div className="font-bold text-slate-900">{a.serviceName}</div>
                    <div className="text-slate-500">Prof. {a.professionalName}</div>
                  </div>
                  <div className="text-right font-semibold text-teal-800">
                    {formatDateShort(a.startTime)} • {a.startTime.slice(11, 16)}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {bookingResult.appointments?.length > 0 && (
              <button type="button" onClick={downloadIcsFirst} className={bookingSecondary}>
                Adicionar ao calendário (.ics)
              </button>
            )}
            <button type="button" onClick={resetFlow} className={bookingButton}>
              Fazer outra reserva
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
