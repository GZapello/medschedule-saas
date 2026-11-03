import { downloadBlob } from '../../utils/download';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  UserRound,
  ArrowRight,
  Stethoscope,
  Clock,
  Sparkles,
  RefreshCw,
  Users,
  Sun,
  Sunset,
  Moon,
  CalendarCheck,
  CalendarX2,
  MapPin,
  Video
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { AvailableSlot } from '../../types';
import { bookingAreas, calendarBooking } from '../../utils/publicBooking';
import {
  PublicBookingShell,
  BookingStepIndicator,
  BookingEmptyState,
  BookingSkeleton,
  BookingBackButton,
  bookingButton,
  bookingSecondary,
  bookingInput
} from './PublicBookingShell';

interface Props {
  tenantSlug?: string;
  bookingSequence?: number;
  professionalSlug?: string;
  onBackToApp?: () => void;
}

interface NextAvailableInfo {
  date: string;
  slotsCount: number;
  firstSlotTime: string;
  previewSlots: AvailableSlot[];
}

interface UpcomingDayInfo {
  date: string;
  available: boolean;
  slotsCount: number;
  firstSlotTime: string | null;
}

interface AlternativeProfessionalInfo {
  id: string;
  name: string;
  slug: string | null;
  photo_url: string | null;
  profession_name: string | null;
  specialty_name: string | null;
  serviceId: string;
  serviceName: string;
  date: string;
  isSameDate: boolean;
  slotsCount: number;
  firstSlotTime: string;
  previewSlots: AvailableSlot[];
}

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

const modalityLabel = (value: string) =>
  ({
    online: 'Online',
    presential: 'Presencial',
    home: 'Domiciliar',
    both: 'Presencial ou online'
  }[value] || value);

const formatDateBR = (dateStr: string) => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('pt-BR');
};

const formatShortDateBR = (dateStr: string) => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
};

const formatFullDateBR = (dateStr: string) => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const dt = new Date(`${dateStr}T12:00:00`);
  const formatted = dt.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
};

const formatWeekdayShort = (dateStr: string) => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const todayStr = today();
  if (dateStr === todayStr) return 'Hoje';
  const dt = new Date(`${dateStr}T12:00:00`);
  return dt
    .toLocaleDateString('pt-BR', { weekday: 'short' })
    .replace('.', '')
    .replace(/^\w/, c => c.toUpperCase());
};

export const PublicBookingView: React.FC<Props> = ({
  tenantSlug,
  bookingSequence,
  professionalSlug,
  onBackToApp
}) => {
  const individual = !!professionalSlug;
  const [step, setStep] = useState(individual ? 3 : 1);
  const [loading, setLoading] = useState(true);
  const [clinic, setClinic] = useState<any>(null);
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [area, setArea] = useState('');
  const [professional, setProfessional] = useState<any>(null);
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [slot, setSlot] = useState<AvailableSlot | null>(null);
  const [nextAvailable, setNextAvailable] = useState<NextAvailableInfo | null>(null);
  const [earliestAvailable, setEarliestAvailable] = useState<NextAvailableInfo | null>(null);
  const [upcomingDays, setUpcomingDays] = useState<UpcomingDayInfo[]>([]);
  const [alternativeProfessionals, setAlternativeProfessionals] = useState<AlternativeProfessionalInfo[]>([]);
  const [pendingAutoSlotTime, setPendingAutoSlotTime] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [reloadSlots, setReloadSlots] = useState(0);
  const [error, setError] = useState('');
  const [profileError, setProfileError] = useState('');
  const [retry, setRetry] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    isChild: false,
    guardianName: '',
    notes: ''
  });

  const dateInput = useRef<HTMLInputElement>(null);
  const contextVersion = useRef(0);
  const slotVersion = useRef(0);
  const submittingRef = useRef(false);

  const areas = useMemo(() => bookingAreas(professionals, services), [professionals, services]);
  const compatible = useMemo(
    () =>
      area
        ? professionals.filter(p => areas.find(a => a.name === area)?.professionalIds.includes(p.id))
        : professionals,
    [professionals, areas, area]
  );
  const linkedServices = useMemo(
    () => services.filter(s => professional?.services?.some((link: any) => link.id === s.id)),
    [services, professional]
  );
  const service = linkedServices.find(s => s.id === serviceId);
  const serviceDuration = useMemo(() => {
    if (!service || !professional) return null;
    return (
      professional.services?.find((link: any) => link.id === service.id)?.duration_minutes ||
      service.duration_minutes ||
      50
    );
  }, [service, professional]);

  const modality = service?.modality === 'both' ? 'presential' : service?.modality;
  const [selectedModality, setSelectedModality] = useState('presential');
  const bookingModality = service?.modality === 'both' ? selectedModality : modality;
  const professionalEndpoint = `/v1/public/professionals/${tenantSlug ? `${encodeURIComponent(tenantSlug)}/` : ''}${encodeURIComponent(professionalSlug || '')}`;

  useEffect(() => {
    let active = true;
    contextVersion.current++;
    submittingRef.current = false;
    setSubmitting(false);
    setLoading(true);
    setClinic(null);
    setProfileError('');
    setError('');
    setResult(null);
    setArea('');
    setProfessional(null);
    setServiceId('');
    setSlots([]);
    setSlot(null);
    setNextAvailable(null);
    setEarliestAvailable(null);
    setUpcomingDays([]);
    setAlternativeProfessionals([]);
    setDate(today());
    setForm({ fullName: '', phone: '', email: '', isChild: false, guardianName: '', notes: '' });
    setStep(individual ? 3 : 1);

    const endpoint = individual
      ? professionalEndpoint
      : `/v1/public/tenants/${encodeURIComponent(tenantSlug || '')}${bookingSequence ? `?bookingSequence=${bookingSequence}` : ''}`;

    ApiClient.get<any>(endpoint)
      .then(data => {
        if (!active) return;
        setClinic(data.tenant);
        setServices(data.services || []);
        if (individual) {
          const p = {
            ...data.professional,
            services: (data.services || []).map((s: any) => ({
              id: s.id,
              duration_minutes: s.duration_minutes,
              modality: s.modality
            }))
          };
          setProfessionals([p]);
          setProfessional(p);
          setServiceId(data.services?.length === 1 ? data.services[0].id : '');
          if (p.next_available?.date) {
            setDate(p.next_available.date);
          }
        } else {
          setProfessionals((data.professionals || []).filter((p: any) => p.services?.length));
        }
      })
      .catch((e: any) => {
        if (active) {
          setProfileError(
            e.status === 404
              ? 'O agendamento online está indisponível no momento.'
              : 'Não foi possível carregar o agendamento. Tente novamente.'
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      contextVersion.current++;
    };
  }, [tenantSlug, bookingSequence, professionalSlug, retry]);

  useEffect(() => {
    let active = true;
    const version = ++slotVersion.current;
    setSlot(null);
    setSlots([]);
    if (!professional || !service || !date) {
      setLoadingSlots(false);
      return;
    }
    setLoadingSlots(true);
    const query = new URLSearchParams({ date, serviceId: service.id });
    if (!individual) {
      query.set('tenantSlug', tenantSlug || '');
      query.set('professionalId', professional.id);
      if (bookingSequence) query.set('bookingSequence', String(bookingSequence));
    }
    const endpoint = individual
      ? `${professionalEndpoint}/slots?${query}`
      : `/v1/public/slots/available?${query}`;

    ApiClient.get<any>(endpoint)
      .then(data => {
        if (!active || version !== slotVersion.current) return;
        const fetchedSlots: AvailableSlot[] = data.slots || [];
        setSlots(fetchedSlots);
        setNextAvailable(data.nextAvailable || null);
        setEarliestAvailable(data.earliestAvailable || null);
        setUpcomingDays(data.upcomingDays || []);
        setAlternativeProfessionals(data.alternativeProfessionals || []);

        if (pendingAutoSlotTime) {
          const matched = fetchedSlots.find(s => s.time === pendingAutoSlotTime);
          if (matched) setSlot(matched);
          setPendingAutoSlotTime(null);
        }
      })
      .catch(() => {
        if (active) setError('Não foi possível consultar os horários. Tente novamente.');
      })
      .finally(() => {
        if (active && version === slotVersion.current) setLoadingSlots(false);
      });

    return () => {
      active = false;
    };
  }, [professional, serviceId, date, tenantSlug, bookingSequence, professionalSlug, reloadSlots]);

  const chooseProfessional = (p: any, preferredServiceId?: string) => {
    setProfessional(p);
    const nextServiceId =
      preferredServiceId && p.services?.some((s: any) => s.id === preferredServiceId)
        ? preferredServiceId
        : p.services?.length === 1
        ? p.services[0].id
        : '';
    setServiceId(nextServiceId);
    setSlot(null);
    setSlots([]);
    setError('');
  };

  const chooseArea = (name: string) => {
    setArea(name);
    setProfessional(null);
    setServiceId('');
    setSlot(null);
    setError('');
    const matches = professionals.filter(p =>
      areas.find(a => a.name === name)?.professionalIds.includes(p.id)
    );
    if (matches.length === 1) {
      chooseProfessional(matches[0]);
      setStep(matches[0].services.length === 1 ? 3 : 2);
    } else {
      setStep(2);
    }
  };

  const back = () => {
    setStep(s => Math.max(individual ? 3 : 1, s - 1));
    setError('');
  };

  const go = (next: number) => {
    setStep(next);
    setError('');
  };

  const reset = () => {
    setResult(null);
    setSlot(null);
    setForm({ fullName: '', phone: '', email: '', isChild: false, guardianName: '', notes: '' });
    setError('');
    setDate(today());
    setReloadSlots(n => n + 1);
    if (!individual) {
      setArea('');
      setProfessional(null);
      setServiceId('');
    }
    setStep(individual ? 3 : 1);
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || !slot || !service || !professional) return;
    const version = contextVersion.current;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const data = await ApiClient.post<any>('/v1/public/appointments', {
        tenantSlug: individual ? clinic.slug : tenantSlug,
        ...(individual
          ? { professionalSlug: professional.slug || professional.id }
          : { bookingSequence }),
        professionalId: professional.id,
        serviceId: service.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        modality: bookingModality,
        patientNotes: form.notes.trim() || null,
        newPatientData: {
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || null,
          isChild: form.isChild,
          guardianName: form.isChild ? form.guardianName.trim() : null,
          notes: form.notes.trim() || null
        }
      });
      if (version !== contextVersion.current) return;
      setResult(data);
      setStep(6);
    } catch (e: any) {
      if (version !== contextVersion.current) return;
      setError(
        e.status === 409
          ? 'Este horário não está mais disponível. Escolha outro horário.'
          : e.status === 404
          ? 'O agendamento online está indisponível no momento.'
          : e.message || 'Não foi possível concluir o agendamento.'
      );
      if (e.status === 409) {
        setSlot(null);
        setStep(4);
        setReloadSlots(n => n + 1);
      }
    } finally {
      if (version === contextVersion.current) {
        setSubmitting(false);
        submittingRef.current = false;
      }
    }
  };

  const downloadCalendar = async () => {
    if (!slot) return;
    const blob = new Blob(
      [
        calendarBooking({
          startTime: slot.startTime,
          endTime: slot.endTime,
          title: `${service?.name} — ${professional?.name}`,
          clinic: clinic.trade_name || clinic.name
        })
      ],
      { type: 'text/calendar;charset=utf-8' }
    );
    try {
      await downloadBlob(blob, 'agendamento-zemda.ics');
    } catch {
      setError('Não foi possível exportar o agendamento.');
    }
  };

  // Agrupamento inteligente de horários por período do dia (Manhã / Tarde / Noite)
  const groupedSlots = useMemo(() => {
    const morning: AvailableSlot[] = [];
    const afternoon: AvailableSlot[] = [];
    const evening: AvailableSlot[] = [];

    for (const s of slots) {
      const hour = parseInt(s.time.split(':')[0], 10);
      if (hour < 12) morning.push(s);
      else if (hour < 18) afternoon.push(s);
      else evening.push(s);
    }

    return [
      { id: 'morning', label: 'Manhã', icon: Sun, items: morning },
      { id: 'afternoon', label: 'Tarde', icon: Sunset, items: afternoon },
      { id: 'evening', label: 'Noite', icon: Moon, items: evening }
    ].filter(g => g.items.length > 0);
  }, [slots]);

  const effectiveNextAvailable = nextAvailable || earliestAvailable;

  const handleSelectSuggestedDateAndTime = (targetDate: string, suggestedSlotTime?: string) => {
    setError('');
    if (suggestedSlotTime) {
      setPendingAutoSlotTime(suggestedSlotTime);
    } else {
      setPendingAutoSlotTime(null);
    }
    setDate(targetDate);
    setSlot(null);
  };

  const handleSelectAlternativeProfessional = (alt: AlternativeProfessionalInfo, suggestedTime?: string) => {
    const foundProf = professionals.find(p => p.id === alt.id);
    if (!foundProf) return;
    setError('');
    if (suggestedTime) {
      setPendingAutoSlotTime(suggestedTime);
    } else {
      setPendingAutoSlotTime(null);
    }
    chooseProfessional(foundProf, alt.serviceId);
    if (alt.date) {
      setDate(alt.date);
    }
  };

  const servicePicker = (
    <div className="space-y-3">
      {linkedServices.length > 1 && (
        <div>
          <label htmlFor="booking-service" className="mb-1.5 block text-sm font-semibold text-slate-800">
            Atendimento
          </label>
          <select
            id="booking-service"
            className={bookingInput}
            value={serviceId}
            onChange={e => {
              setServiceId(e.target.value);
              setSlot(null);
              setSlots([]);
            }}
          >
            <option value="">Escolha o atendimento</option>
            {linkedServices.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} ·{' '}
                {professional?.services?.find((link: any) => link.id === s.id)?.duration_minutes ||
                  s.duration_minutes}{' '}
                min
              </option>
            ))}
          </select>
        </div>
      )}
      {service?.modality === 'both' && (
        <div>
          <label htmlFor="booking-modality" className="mb-1.5 block text-sm font-semibold text-slate-800">
            Modalidade de atendimento
          </label>
          <select
            id="booking-modality"
            className={bookingInput}
            value={selectedModality}
            onChange={e => setSelectedModality(e.target.value)}
          >
            <option value="presential">Presencial</option>
            <option value="online">Online (Teleconsulta)</option>
          </select>
        </div>
      )}
    </div>
  );

  const summary = (
    <dl className="grid gap-3 rounded-2xl border border-teal-200/70 bg-gradient-to-br from-teal-50/60 via-white to-slate-50 p-4 text-sm sm:grid-cols-2">
      {[
        ['Especialidade', area || professional?.specialty_name || professional?.profession_name],
        ['Profissional', professional?.name],
        ['Atendimento', service ? `${service.name}${serviceDuration ? ` (${serviceDuration} min)` : ''}` : ''],
        ['Data', date ? formatDateBR(date) : ''],
        ['Horário', slot?.time],
        ['Modalidade', modalityLabel(bookingModality || '')],
        ['Clínica', clinic?.trade_name || clinic?.name]
      ]
        .filter(([, value]) => Boolean(value))
        .map(([label, value]) => (
          <div key={label} className="rounded-xl bg-white/80 p-2.5 border border-slate-100">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
            <dd className="mt-0.5 font-bold text-slate-900">{value}</dd>
          </div>
        ))}
    </dl>
  );

  return (
    <PublicBookingShell clinic={clinic}>
      {onBackToApp && (
        <div className="mb-4">
          <button type="button" className={bookingSecondary} onClick={onBackToApp}>
            Voltar ao painel
          </button>
        </div>
      )}

      {loading ? (
        <BookingSkeleton />
      ) : profileError ? (
        <BookingEmptyState title="Agendamento indisponível" description={profileError}>
          <button className={bookingSecondary} onClick={() => setRetry(n => n + 1)}>
            Tentar novamente
          </button>
        </BookingEmptyState>
      ) : (
        <>
          <BookingStepIndicator
            step={step}
            individual={individual}
            onSelectStep={targetStep => {
              if (targetStep < step && step < 6) go(targetStep);
            }}
          />

          {/* Card de Contexto do Profissional, Serviço e Data (Etapas 3, 4 e 5) */}
          {professional && step >= 3 && step < 6 && (
            <div className="mb-6 rounded-2xl border border-teal-200/80 bg-gradient-to-r from-teal-50/80 via-teal-50/40 to-white p-4 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3.5 min-w-0">
                  {professional.photo_url ? (
                    <img
                      alt={`Foto de ${professional.name}`}
                      src={professional.photo_url}
                      className="h-13 w-13 shrink-0 rounded-2xl object-cover border border-teal-200 shadow-2xs"
                    />
                  ) : (
                    <span className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-teal-700 text-white shadow-2xs">
                      <UserRound aria-hidden="true" className="h-6 w-6" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900 text-base">{professional.name}</span>
                      {professional.registration_number && (
                        <span className="rounded-md bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-slate-600 border border-slate-200">
                          {professional.registration_type} {professional.registration_number}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-medium text-teal-800">
                      {[professional.profession_name, professional.specialty_name]
                        .filter(Boolean)
                        .filter((v, idx, arr) => arr.indexOf(v) === idx)
                        .join(' · ') || area}
                    </p>
                    {service && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-0.5 font-semibold text-slate-700 border border-slate-200/80">
                          <Stethoscope aria-hidden="true" className="h-3 w-3 text-teal-700" />
                          {service.name}
                        </span>
                        {serviceDuration && (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-0.5 text-slate-600 border border-slate-200/80">
                            <Clock aria-hidden="true" className="h-3 w-3 text-teal-700" />
                            {serviceDuration} min
                          </span>
                        )}
                        {bookingModality && (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-0.5 text-slate-600 border border-slate-200/80">
                            {bookingModality === 'online' ? (
                              <Video aria-hidden="true" className="h-3 w-3 text-teal-700" />
                            ) : (
                              <MapPin aria-hidden="true" className="h-3 w-3 text-teal-700" />
                            )}
                            {modalityLabel(bookingModality)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {!individual && (
                  <button
                    type="button"
                    onClick={() => go(2)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-teal-300/80 bg-white px-3 py-1.5 text-xs font-semibold text-teal-800 transition hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                  >
                    <Users aria-hidden="true" className="h-3.5 w-3.5 text-teal-700" />
                    Trocar profissional
                  </button>
                )}
              </div>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm font-medium text-red-800"
            >
              {error}
            </p>
          )}

          {/* ==========================================
              ETAPA 1: ESPECIALIDADE
          ========================================== */}
          {step === 1 && (
            <section className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900">O que você procura?</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Escolha uma especialidade ou área de atendimento para ver os profissionais disponíveis.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {areas.map(a => {
                  const areaProfs = professionals.filter(p => a.professionalIds.includes(p.id));
                  const profNamesPreview = areaProfs
                    .slice(0, 2)
                    .map(p => p.name)
                    .join(', ');

                  return (
                    <button
                      key={a.name}
                      type="button"
                      onClick={() => chooseArea(a.name)}
                      className="group flex items-center gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-2xs transition-all hover:border-teal-600 hover:bg-teal-50/30 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 transition group-hover:bg-teal-700 group-hover:text-white">
                        <Stethoscope aria-hidden="true" className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block font-bold text-slate-900 group-hover:text-teal-900">
                          {a.name}
                        </span>
                        <span className="mt-0.5 block text-xs font-medium text-teal-700">
                          {a.professionalIds.length} profissional(is) disponível(is)
                        </span>
                        {profNamesPreview && (
                          <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                            {profNamesPreview}
                            {areaProfs.length > 2 ? ` +${areaProfs.length - 2}` : ''}
                          </span>
                        )}
                      </div>
                      <ArrowRight
                        aria-hidden="true"
                        className="ml-auto h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-teal-700"
                      />
                    </button>
                  );
                })}
              </div>

              {!areas.length && (
                <BookingEmptyState
                  title="Nenhuma especialidade disponível"
                  description="Não há atendimentos disponíveis para agendamento online no momento."
                >
                  <button className={bookingSecondary} onClick={() => setRetry(n => n + 1)}>
                    Atualizar disponibilidade
                  </button>
                </BookingEmptyState>
              )}
            </section>
          )}

          {/* ==========================================
              ETAPA 2: PROFISSIONAL
          ========================================== */}
          {step === 2 && (
            <section className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Escolha o profissional</h2>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {area ? (
                      <>
                        Especialidade selecionada: <strong className="text-slate-700">{area}</strong>
                      </>
                    ) : (
                      'Selecione o profissional de sua preferência para continuar.'
                    )}
                  </p>
                </div>
                {areas.length > 1 && (
                  <button
                    type="button"
                    onClick={() => go(1)}
                    className="text-xs font-semibold text-teal-700 hover:text-teal-800 hover:underline"
                  >
                    Alterar especialidade
                  </button>
                )}
              </div>

              <div className="grid gap-3.5">
                {compatible.map(p => {
                  const isSelected = professional?.id === p.id;
                  const profModalities = [
                    ...new Set((p.services || []).map((s: any) => modalityLabel(s.modality)))
                  ].join(' · ');
                  const profDuration = p.services?.[0]?.duration_minutes;

                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => chooseProfessional(p)}
                      className={`flex min-h-24 items-start gap-4 rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                        isSelected
                          ? 'border-teal-600 bg-teal-50/70 shadow-xs ring-1 ring-teal-600'
                          : 'border-slate-200 bg-white hover:border-teal-600/50 hover:bg-slate-50/70'
                      }`}
                    >
                      {p.photo_url ? (
                        <img
                          alt={`Foto de ${p.name}`}
                          src={p.photo_url}
                          className="h-14 w-14 shrink-0 rounded-2xl object-cover border border-slate-200"
                        />
                      ) : (
                        <span
                          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
                            isSelected ? 'bg-teal-700 text-white' : 'bg-teal-50 text-teal-800'
                          }`}
                        >
                          <UserRound aria-hidden="true" className="h-6 w-6" />
                        </span>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-slate-900 text-base">{p.name}</h3>
                          {p.registration_number && (
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                              {p.registration_type} {p.registration_number}
                            </span>
                          )}
                        </div>

                        <p className="mt-0.5 text-sm font-medium text-slate-600">
                          {[p.profession_name, p.specialty_name]
                            .filter(Boolean)
                            .filter((v, idx, arr) => arr.indexOf(v) === idx)
                            .join(' · ')}
                        </p>

                        {p.bio && (
                          <p className="mt-1 line-clamp-2 text-xs text-slate-500">{p.bio}</p>
                        )}

                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          {profModalities && (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-0.5 text-xs font-medium text-teal-800 border border-teal-200/70">
                              {profModalities}
                            </span>
                          )}
                          {profDuration && (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                              <Clock aria-hidden="true" className="h-3 w-3" />
                              {profDuration} min
                            </span>
                          )}
                          {p.next_available && (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200/80">
                              <CalendarCheck aria-hidden="true" className="h-3 w-3 text-emerald-600" />
                              Próximo horário:{' '}
                              {p.next_available.date === today()
                                ? 'Hoje'
                                : formatShortDateBR(p.next_available.date)}{' '}
                              às {p.next_available.firstSlotTime}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="ml-auto flex shrink-0 items-center self-center">
                        {isSelected ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-teal-700 px-2.5 py-1 text-xs font-semibold text-white">
                            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                            <span className="hidden sm:inline">Selecionado</span>
                          </span>
                        ) : (
                          <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
                            Escolher
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {professional && servicePicker}

              {!compatible.length && (
                <BookingEmptyState title="Não encontramos horários disponíveis para esta especialidade no momento.">
                  <button className={bookingSecondary} onClick={() => go(1)}>
                    Escolher outra especialidade
                  </button>
                </BookingEmptyState>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <BookingBackButton onClick={back} />
                <div className="flex items-center gap-3">
                  {!service && (
                    <span className="text-xs text-slate-500">
                      {!professional
                        ? 'Selecione um profissional para continuar'
                        : 'Escolha o atendimento para continuar'}
                    </span>
                  )}
                  <button className={bookingButton} disabled={!service} onClick={() => go(3)}>
                    Continuar
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* ==========================================
              ETAPA 3: DATA
          ========================================== */}
          {step === 3 && (
            <section className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Escolha a data</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Selecione um dia com disponibilidade no calendário ou escolha uma data específica.
                </p>
              </div>

              {servicePicker}

              {!linkedServices.length ? (
                <BookingEmptyState
                  title="Nenhum atendimento disponível"
                  description="O profissional não possui serviços disponíveis para agendamento online."
                >
                  <button className={bookingSecondary} onClick={() => setRetry(n => n + 1)}>
                    Atualizar disponibilidade
                  </button>
                </BookingEmptyState>
              ) : (
                <>
                  {/* Grade Visual de Dias Próximos com Disponibilidade Real */}
                  {service && upcomingDays.length > 0 && (
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Próximos dias e disponibilidade
                        </span>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            Com horários
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full bg-slate-300" />
                            Sem horários
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
                        {upcomingDays.slice(0, 14).map(day => {
                          const isSelectedDate = day.date === date;
                          return (
                            <button
                              key={day.date}
                              type="button"
                              disabled={!day.available}
                              aria-label={`Data ${formatDateBR(day.date)}`}
                              onClick={() => {
                                setDate(day.date);
                                setSlot(null);
                              }}
                              className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                                isSelectedDate
                                  ? 'border-teal-700 bg-teal-700 text-white shadow-xs'
                                  : day.available
                                  ? 'border-slate-200 bg-white text-slate-800 hover:border-teal-600 hover:bg-teal-50/40'
                                  : 'cursor-not-allowed border-dashed border-slate-200 bg-slate-50/80 text-slate-400 opacity-65'
                              }`}
                            >
                              <span
                                className={`text-[10px] font-bold uppercase ${
                                  isSelectedDate ? 'text-teal-100' : 'text-slate-500'
                                }`}
                              >
                                {formatWeekdayShort(day.date)}
                              </span>
                              <span className="mt-0.5 text-sm font-extrabold">
                                {formatShortDateBR(day.date)}
                              </span>
                              <span
                                className={`mt-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                                  isSelectedDate
                                    ? 'bg-teal-800 text-teal-50'
                                    : day.available
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-slate-100 text-slate-400'
                                }`}
                              >
                                {day.available ? `${day.slotsCount} vagas` : 'Lotado'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Seletor de Data Completa + Destaque da Data Escolhida */}
                  <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 sm:items-center">
                    <div>
                      <label htmlFor="booking-date" className="mb-1.5 block text-sm font-semibold text-slate-800">
                        Data do atendimento
                      </label>
                      <input
                        ref={dateInput}
                        id="booking-date"
                        aria-label="Data do atendimento"
                        className={bookingInput}
                        type="date"
                        min={today()}
                        value={date}
                        onChange={e => {
                          setDate(e.target.value);
                          setSlot(null);
                          setSlots([]);
                        }}
                      />
                    </div>

                    <div className="rounded-xl border border-slate-200/80 bg-white p-3.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                        Resumo da escolha
                      </span>
                      <p className="mt-1 font-bold text-slate-900 text-sm">
                        {date ? formatFullDateBR(date) : 'Selecione uma data'}
                      </p>
                      {service && (
                        <p className="mt-0.5 text-xs text-slate-600">
                          {service.name} · {serviceDuration} min · {modalityLabel(bookingModality || '')}
                        </p>
                      )}
                      {!loadingSlots && date && service && (
                        <div className="mt-2">
                          {slots.length > 0 ? (
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200/70">
                              <CalendarCheck aria-hidden="true" className="h-3.5 w-3.5 text-emerald-600" />
                              {slots.length} horário(s) disponível(is) — a partir das {slots[0].time}
                            </span>
                          ) : (
                            <div className="space-y-1.5">
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 border border-amber-200/70">
                                <CalendarX2 aria-hidden="true" className="h-3.5 w-3.5 text-amber-600" />
                                Sem horários livres nesta data
                              </span>
                              {effectiveNextAvailable && (
                                <button
                                  type="button"
                                  onClick={() => setDate(effectiveNextAvailable.date)}
                                  className="block text-xs font-bold text-teal-700 hover:text-teal-800 hover:underline"
                                >
                                  Ir para próxima data livre: {formatDateBR(effectiveNextAvailable.date)} (às{' '}
                                  {effectiveNextAvailable.firstSlotTime})
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                    {!individual ? <BookingBackButton onClick={back} /> : <span />}
                    <button
                      className={bookingButton}
                      disabled={!service || !date || date < today()}
                      onClick={() => go(4)}
                    >
                      Ver horários
                      <Calendar aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          {/* ==========================================
              ETAPA 4: HORÁRIO
          ========================================== */}
          {step === 4 && (
            <section className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Escolha o horário</h2>
                  <p className="mt-0.5 text-sm font-medium text-slate-600">
                    {formatDateBR(date)} ({formatWeekdayShort(date)}) · {service?.name}
                    {serviceDuration ? ` · ${serviceDuration} min` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => go(3)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-teal-600/40 hover:bg-slate-50"
                  >
                    <Calendar aria-hidden="true" className="h-3.5 w-3.5 text-teal-700" />
                    Alterar data
                  </button>
                  <button
                    type="button"
                    onClick={() => setReloadSlots(n => n + 1)}
                    title="Atualizar disponibilidade"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-teal-600/40 hover:bg-slate-50"
                  >
                    <RefreshCw
                      aria-hidden="true"
                      className={`h-3.5 w-3.5 text-teal-700 ${loadingSlots ? 'animate-spin' : ''}`}
                    />
                    <span className="hidden sm:inline">Atualizar</span>
                  </button>
                </div>
              </div>

              {/* Barra Rápida de Datas Próximas com Disponibilidade */}
              {upcomingDays.some(d => d.available) && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {upcomingDays
                    .filter(d => d.available || d.date === date)
                    .slice(0, 7)
                    .map(d => {
                      const isCurrent = d.date === date;
                      return (
                        <button
                          key={d.date}
                          type="button"
                          onClick={() => {
                            if (d.date !== date) {
                              setDate(d.date);
                              setSlot(null);
                            }
                          }}
                          className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                            isCurrent
                              ? 'border-teal-700 bg-teal-700 text-white shadow-2xs'
                              : d.available
                              ? 'border-slate-200 bg-slate-50 text-slate-700 hover:border-teal-600/50 hover:bg-teal-50/40'
                              : 'border-dashed border-slate-200 bg-slate-50 text-slate-400'
                          }`}
                        >
                          <span>
                            {formatWeekdayShort(d.date)}, {formatShortDateBR(d.date)}
                          </span>
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[10px] ${
                              isCurrent
                                ? 'bg-teal-800 text-teal-50'
                                : d.available
                                ? 'bg-emerald-100/80 text-emerald-800'
                                : 'bg-slate-200/70 text-slate-500'
                            }`}
                          >
                            {d.available ? `${d.slotsCount} vagas` : 'Sem vagas'}
                          </span>
                        </button>
                      );
                    })}
                </div>
              )}

              {loadingSlots ? (
                <BookingSkeleton />
              ) : slots.length > 0 ? (
                <div className="space-y-5">
                  {/* Destaque do Próximo Horário Disponível */}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/60 px-4 py-3 text-xs sm:text-sm">
                    <div className="flex items-center gap-2 text-emerald-900">
                      <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span>
                        Encontramos <strong>{slots.length} horário(s)</strong> disponível(is). Primeiro
                        horário livre às <strong>{slots[0].time}</strong>.
                      </span>
                    </div>
                    {!slot && (
                      <button
                        type="button"
                        onClick={() => setSlot(slots[0])}
                        className="font-bold text-teal-800 underline hover:text-teal-900"
                      >
                        Selecionar primeiro horário ({slots[0].time})
                      </button>
                    )}
                  </div>

                  {/* Blocos Organizados por Período (Manhã, Tarde, Noite) */}
                  <div className="space-y-4">
                    {groupedSlots.map(group => {
                      const PeriodIcon = group.icon;
                      return (
                        <div
                          key={group.id}
                          className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                              <PeriodIcon aria-hidden="true" className="h-4 w-4 text-teal-700" />
                              <span>{group.label}</span>
                            </div>
                            <span className="text-xs font-medium text-slate-500">
                              {group.items.length} horário(s)
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                            {group.items.map(s => {
                              const isSelected = slot?.startTime === s.startTime;
                              return (
                                <button
                                  key={s.startTime}
                                  type="button"
                                  aria-pressed={isSelected}
                                  onClick={() => setSlot(s)}
                                  className={`min-h-12 rounded-xl border text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                                    isSelected
                                      ? 'border-teal-700 bg-teal-700 text-white shadow-sm ring-2 ring-teal-600/30 scale-[1.02]'
                                      : 'border-slate-200 bg-white text-slate-800 hover:border-teal-600 hover:bg-teal-50/40'
                                  }`}
                                >
                                  {s.time}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Feedback Claro do Horário Selecionado */}
                  {slot && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-300 bg-teal-50/80 p-4 text-sm text-teal-950">
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0 text-teal-700" />
                        <div>
                          <span className="font-bold">
                            Horário selecionado: {slot.time} em {formatDateBR(date)}
                          </span>
                          <p className="text-xs text-teal-800">
                            {service?.name} com {professional?.name}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-teal-800">
                        Clique em “Continuar” para informar seus dados
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                /* ==========================================
                   EMPTY STATE INTELIGENTE (SEM HORÁRIOS NESTA DATA)
                ========================================== */
                <BookingEmptyState
                  title="Nenhum horário disponível nesta data."
                  description="Não encontramos horários para esta data, mas você pode escolher a próxima data disponível, tentar outro profissional ou alterar a especialidade."
                  suggestions={
                    <div className="space-y-4 text-left">
                      {/* Sugestão 1: Próxima Data Disponível e Horários Mais Próximos */}
                      {effectiveNextAvailable && (
                        <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <CalendarCheck
                                aria-hidden="true"
                                className="h-5 w-5 shrink-0 text-teal-700"
                              />
                              <div>
                                <span className="text-xs font-bold uppercase tracking-wider text-teal-800 block">
                                  Próxima data disponível com {professional?.name}
                                </span>
                                <p className="text-sm font-bold text-slate-900">
                                  {formatFullDateBR(effectiveNextAvailable.date)} (
                                  {effectiveNextAvailable.slotsCount} horários livres)
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleSelectSuggestedDateAndTime(effectiveNextAvailable.date)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-bold text-white shadow-2xs transition hover:bg-teal-800"
                            >
                              Ir para {formatShortDateBR(effectiveNextAvailable.date)}
                              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {effectiveNextAvailable.previewSlots?.length > 0 && (
                            <div className="space-y-1.5 border-t border-teal-200/60 pt-2.5">
                              <span className="text-xs font-semibold text-teal-900 block">
                                Horários mais próximos em {formatDateBR(effectiveNextAvailable.date)}:
                              </span>
                              <div className="flex flex-wrap gap-2">
                                {effectiveNextAvailable.previewSlots.map(ps => (
                                  <button
                                    key={ps.startTime}
                                    type="button"
                                    onClick={() =>
                                      handleSelectSuggestedDateAndTime(effectiveNextAvailable.date, ps.time)
                                    }
                                    className="inline-flex items-center gap-1 rounded-xl border border-teal-300 bg-white px-3 py-1.5 text-xs font-bold text-teal-900 shadow-2xs transition hover:bg-teal-700 hover:text-white"
                                  >
                                    <Clock aria-hidden="true" className="h-3 w-3" />
                                    Às {ps.time}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Sugestão 2: Outros Profissionais Disponíveis para o Mesmo Serviço / Área */}
                      {!individual && alternativeProfessionals.length > 0 && (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <Users aria-hidden="true" className="h-4 w-4 text-teal-700" />
                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                              Outros profissionais com horários disponíveis
                            </h3>
                          </div>

                          <div className="grid gap-2.5">
                            {alternativeProfessionals.slice(0, 3).map(alt => (
                              <div
                                key={alt.id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  {alt.photo_url ? (
                                    <img
                                      src={alt.photo_url}
                                      alt={`Foto de ${alt.name}`}
                                      className="h-10 w-10 shrink-0 rounded-xl object-cover"
                                    />
                                  ) : (
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-800">
                                      <UserRound aria-hidden="true" className="h-5 w-5" />
                                    </span>
                                  )}
                                  <div className="min-w-0">
                                    <p className="font-bold text-slate-900 text-sm truncate">{alt.name}</p>
                                    <p className="text-xs text-emerald-700 font-semibold">
                                      {alt.isSameDate
                                        ? `Disponível nesta mesma data (${formatShortDateBR(alt.date)}) às ${alt.firstSlotTime}`
                                        : `Próxima vaga em ${formatDateBR(alt.date)} às ${alt.firstSlotTime}`}{' '}
                                      · {alt.slotsCount} horário(s)
                                    </p>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSelectAlternativeProfessional(alt, alt.firstSlotTime)
                                  }
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-teal-600 bg-white px-3 py-1.5 text-xs font-bold text-teal-800 transition hover:bg-teal-700 hover:text-white"
                                >
                                  Ver horários de {alt.name.split(' ')[0]}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  }
                >
                  <button
                    type="button"
                    className={bookingSecondary}
                    onClick={() => {
                      go(3);
                      setTimeout(() => dateInput.current?.focus(), 0);
                    }}
                  >
                    Escolher outra data
                  </button>
                  {!individual && (
                    <>
                      <button type="button" className={bookingSecondary} onClick={() => go(2)}>
                        Escolher outro profissional
                      </button>
                      <button type="button" className={bookingSecondary} onClick={() => go(1)}>
                        Voltar para especialidades
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className={bookingSecondary}
                    onClick={() => setReloadSlots(n => n + 1)}
                  >
                    Atualizar horários
                  </button>
                </BookingEmptyState>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <BookingBackButton onClick={back} />
                <div className="flex items-center gap-3">
                  {!slot && !loadingSlots && (
                    <span className="text-xs text-slate-500">
                      {slots.length > 0
                        ? 'Toque em um horário disponível para continuar'
                        : 'Escolha outra data ou profissional acima'}
                    </span>
                  )}
                  <button
                    className={bookingButton}
                    disabled={!slot || loadingSlots}
                    onClick={() => go(5)}
                  >
                    Continuar
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* ==========================================
              ETAPA 5: SEUS DADOS
          ========================================== */}
          {step === 5 && (
            <form onSubmit={confirm} className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Seus dados</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Confira o resumo do seu agendamento e informe seus dados para confirmação.
                </p>
              </div>

              {summary}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="booking-name" className="mb-1 block text-sm font-semibold">
                    Nome completo
                  </label>
                  <input
                    id="booking-name"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={150}
                    className={bookingInput}
                    value={form.fullName}
                    onChange={e => setForm({ ...form, fullName: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="booking-phone" className="mb-1 block text-sm font-semibold">
                    Telefone / WhatsApp
                  </label>
                  <input
                    id="booking-phone"
                    type="tel"
                    autoComplete="tel"
                    required
                    maxLength={25}
                    className={bookingInput}
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="booking-email" className="mb-1 block text-sm font-semibold">
                    E-mail (opcional)
                  </label>
                  <input
                    id="booking-email"
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    className={bookingInput}
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isChild}
                  onChange={e => setForm({ ...form, isChild: e.target.checked })}
                />{' '}
                Atendimento de criança ou adolescente
              </label>

              {form.isChild && (
                <div>
                  <label htmlFor="booking-guardian" className="mb-1 block text-sm font-semibold">
                    Nome do responsável legal
                  </label>
                  <input
                    id="booking-guardian"
                    required
                    maxLength={150}
                    className={bookingInput}
                    value={form.guardianName}
                    onChange={e => setForm({ ...form, guardianName: e.target.value })}
                  />
                </div>
              )}

              <div>
                <label htmlFor="booking-notes" className="mb-1 block text-sm font-semibold">
                  Observação (opcional)
                </label>
                <textarea
                  id="booking-notes"
                  rows={2}
                  maxLength={1000}
                  className={bookingInput}
                  placeholder="Evite incluir informações clínicas ou sensíveis."
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                />
              </div>

              <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  className={bookingSecondary}
                  disabled={submitting}
                  onClick={back}
                >
                  Voltar
                </button>
                <button type="submit" disabled={submitting || !slot} className={bookingButton}>
                  {submitting ? 'Confirmando…' : 'Confirmar agendamento'}
                  <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </form>
          )}

          {/* ==========================================
              ETAPA 6: CONFIRMAÇÃO
          ========================================== */}
          {step === 6 && result && (
            <section className="space-y-5">
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 border border-teal-200">
                  <CheckCircle2 aria-hidden="true" className="h-10 w-10 text-teal-700" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Agendamento realizado</h2>
                <p className="mt-1 text-sm font-semibold text-teal-800">{result.appointmentNumber}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Seu horário foi reservado com sucesso na agenda do profissional.
                </p>
              </div>

              {summary}

              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <button type="button" className={bookingSecondary} onClick={downloadCalendar}>
                  <Calendar aria-hidden="true" className="h-4 w-4" />
                  Adicionar ao calendário
                </button>
                <button type="button" className={bookingButton} onClick={reset}>
                  Novo agendamento
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </PublicBookingShell>
  );
};
