import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Search,
  ChevronRight,
  History,
  X,
  Activity
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PatientSearchSelect, PatientSearchResult } from '../common/PatientSearchSelect';

export type OverviewColorVariant =
  | 'indigo'
  | 'sky'
  | 'teal'
  | 'purple'
  | 'cyan'
  | 'rose'
  | 'amber'
  | 'emerald';

export type BuiltinMetricKey =
  | 'active_patients'
  | 'week_appointments'
  | 'completed_appointments'
  | 'pending_returns';

export interface OverviewIndicatorConfig {
  id: string;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  metricKey?: BuiltinMetricKey;
  customValue?: number | string | null;
}

export interface OverviewShortcutConfig<TShortcut extends string = string> {
  id: TShortcut;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface ProfessionalModuleOverviewProps<TShortcut extends string = string> {
  moduleKey: string;
  colorVariant: OverviewColorVariant;
  selectedPatientId?: string | null;
  selectedPatient?: any | null;
  onSelectPatient: (
    patientId: string,
    patient?: PatientSearchResult | null,
    initialShortcut?: TShortcut
  ) => void;
  searchTitle?: string;
  searchSubtitle?: string;
  searchPlaceholder?: string;
  searchInputId?: string;
  patientDataTour?: string;
  defaultServiceLabel?: string;
  patientTermSingular?: string;
  indicators: OverviewIndicatorConfig[];
  shortcuts: OverviewShortcutConfig<TShortcut>[];
}

const COLOR_STYLES: Record<
  OverviewColorVariant,
  {
    searchBorderActive: string;
    iconBox: string;
    pendingBadge: string;
    pendingClearBtn: string;
    sectionIcon: string;
    agendaLink: string;
    timeBadge: string;
    rowHoverTitle: string;
    rowHoverChevron: string;
    shortcutActive: string;
    shortcutIdleHover: string;
    shortcutIconBox: string;
  }
> = {
  indigo: {
    searchBorderActive: 'border-indigo-400 ring-2 ring-indigo-500/15',
    iconBox: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    pendingBadge: 'bg-indigo-50 border-indigo-200 text-indigo-800',
    pendingClearBtn: 'text-indigo-600 hover:text-indigo-900',
    sectionIcon: 'text-indigo-600',
    agendaLink: 'text-indigo-700 hover:text-indigo-800 hover:bg-indigo-50',
    timeBadge: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    rowHoverTitle: 'group-hover:text-indigo-700',
    rowHoverChevron: 'group-hover:text-indigo-600',
    shortcutActive: 'border-indigo-500 bg-indigo-50/60 text-indigo-900',
    shortcutIdleHover: 'hover:bg-indigo-50/40 hover:border-indigo-300',
    shortcutIconBox: 'bg-indigo-100/80 text-indigo-700'
  },
  sky: {
    searchBorderActive: 'border-sky-400 ring-2 ring-sky-500/15',
    iconBox: 'bg-sky-50 text-sky-600 border-sky-100',
    pendingBadge: 'bg-sky-50 border-sky-200 text-sky-800',
    pendingClearBtn: 'text-sky-600 hover:text-sky-900',
    sectionIcon: 'text-sky-600',
    agendaLink: 'text-sky-700 hover:text-sky-800 hover:bg-sky-50',
    timeBadge: 'bg-sky-50 text-sky-700 border-sky-100',
    rowHoverTitle: 'group-hover:text-sky-700',
    rowHoverChevron: 'group-hover:text-sky-600',
    shortcutActive: 'border-sky-500 bg-sky-50/60 text-sky-900',
    shortcutIdleHover: 'hover:bg-sky-50/40 hover:border-sky-300',
    shortcutIconBox: 'bg-sky-100/80 text-sky-700'
  },
  teal: {
    searchBorderActive: 'border-teal-400 ring-2 ring-teal-500/15',
    iconBox: 'bg-teal-50 text-teal-600 border-teal-100',
    pendingBadge: 'bg-teal-50 border-teal-200 text-teal-800',
    pendingClearBtn: 'text-teal-600 hover:text-teal-900',
    sectionIcon: 'text-teal-600',
    agendaLink: 'text-teal-700 hover:text-teal-800 hover:bg-teal-50',
    timeBadge: 'bg-teal-50 text-teal-700 border-teal-100',
    rowHoverTitle: 'group-hover:text-teal-700',
    rowHoverChevron: 'group-hover:text-teal-600',
    shortcutActive: 'border-teal-500 bg-teal-50/60 text-teal-900',
    shortcutIdleHover: 'hover:bg-teal-50/40 hover:border-teal-300',
    shortcutIconBox: 'bg-teal-100/80 text-teal-700'
  },
  purple: {
    searchBorderActive: 'border-purple-400 ring-2 ring-purple-500/15',
    iconBox: 'bg-purple-50 text-purple-600 border-purple-100',
    pendingBadge: 'bg-purple-50 border-purple-200 text-purple-800',
    pendingClearBtn: 'text-purple-600 hover:text-purple-900',
    sectionIcon: 'text-purple-600',
    agendaLink: 'text-purple-700 hover:text-purple-800 hover:bg-purple-50',
    timeBadge: 'bg-purple-50 text-purple-700 border-purple-100',
    rowHoverTitle: 'group-hover:text-purple-700',
    rowHoverChevron: 'group-hover:text-purple-600',
    shortcutActive: 'border-purple-500 bg-purple-50/60 text-purple-900',
    shortcutIdleHover: 'hover:bg-purple-50/40 hover:border-purple-300',
    shortcutIconBox: 'bg-purple-100/80 text-purple-700'
  },
  cyan: {
    searchBorderActive: 'border-cyan-400 ring-2 ring-cyan-500/15',
    iconBox: 'bg-cyan-50 text-cyan-600 border-cyan-100',
    pendingBadge: 'bg-cyan-50 border-cyan-200 text-cyan-800',
    pendingClearBtn: 'text-cyan-600 hover:text-cyan-900',
    sectionIcon: 'text-cyan-600',
    agendaLink: 'text-cyan-700 hover:text-cyan-800 hover:bg-cyan-50',
    timeBadge: 'bg-cyan-50 text-cyan-700 border-cyan-100',
    rowHoverTitle: 'group-hover:text-cyan-700',
    rowHoverChevron: 'group-hover:text-cyan-600',
    shortcutActive: 'border-cyan-500 bg-cyan-50/60 text-cyan-900',
    shortcutIdleHover: 'hover:bg-cyan-50/40 hover:border-cyan-300',
    shortcutIconBox: 'bg-cyan-100/80 text-cyan-700'
  },
  rose: {
    searchBorderActive: 'border-rose-400 ring-2 ring-rose-500/15',
    iconBox: 'bg-rose-50 text-rose-600 border-rose-100',
    pendingBadge: 'bg-rose-50 border-rose-200 text-rose-800',
    pendingClearBtn: 'text-rose-600 hover:text-rose-900',
    sectionIcon: 'text-rose-600',
    agendaLink: 'text-rose-700 hover:text-rose-800 hover:bg-rose-50',
    timeBadge: 'bg-rose-50 text-rose-700 border-rose-100',
    rowHoverTitle: 'group-hover:text-rose-700',
    rowHoverChevron: 'group-hover:text-rose-600',
    shortcutActive: 'border-rose-500 bg-rose-50/60 text-rose-900',
    shortcutIdleHover: 'hover:bg-rose-50/40 hover:border-rose-300',
    shortcutIconBox: 'bg-rose-100/80 text-rose-700'
  },
  amber: {
    searchBorderActive: 'border-amber-400 ring-2 ring-amber-500/15',
    iconBox: 'bg-amber-50 text-amber-600 border-amber-100',
    pendingBadge: 'bg-amber-50 border-amber-200 text-amber-800',
    pendingClearBtn: 'text-amber-600 hover:text-amber-900',
    sectionIcon: 'text-amber-600',
    agendaLink: 'text-amber-700 hover:text-amber-800 hover:bg-amber-50',
    timeBadge: 'bg-amber-50 text-amber-700 border-amber-100',
    rowHoverTitle: 'group-hover:text-amber-700',
    rowHoverChevron: 'group-hover:text-amber-600',
    shortcutActive: 'border-amber-500 bg-amber-50/60 text-amber-900',
    shortcutIdleHover: 'hover:bg-amber-50/40 hover:border-amber-300',
    shortcutIconBox: 'bg-amber-100/80 text-amber-700'
  },
  emerald: {
    searchBorderActive: 'border-emerald-400 ring-2 ring-emerald-500/15',
    iconBox: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    pendingBadge: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    pendingClearBtn: 'text-emerald-600 hover:text-emerald-900',
    sectionIcon: 'text-emerald-600',
    agendaLink: 'text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50',
    timeBadge: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    rowHoverTitle: 'group-hover:text-emerald-700',
    rowHoverChevron: 'group-hover:text-emerald-600',
    shortcutActive: 'border-emerald-500 bg-emerald-50/60 text-emerald-900',
    shortcutIdleHover: 'hover:bg-emerald-50/40 hover:border-emerald-300',
    shortcutIconBox: 'bg-emerald-100/80 text-emerald-700'
  }
};

function extractDatePart(isoOrSql?: string | null): string {
  if (!isoOrSql) return '';
  const normalized = String(isoOrSql).trim().replace(' ', 'T');
  return normalized.slice(0, 10);
}

function extractTimePart(isoOrSql?: string | null): string {
  if (!isoOrSql) return '';
  const normalized = String(isoOrSql).trim().replace(' ', 'T');
  const parts = normalized.split('T');
  return parts[1] ? parts[1].slice(0, 5) : '';
}

function formatDateBr(dateStr?: string | null): string {
  const clean = extractDatePart(dateStr);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean || '—';
  const [y, m, d] = clean.split('-');
  return `${d}/${m}/${y}`;
}

function getStatusBadge(status?: string) {
  switch (status) {
    case 'confirmed':
      return { label: 'Confirmado', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'in_progress':
      return { label: 'Em atendimento', className: 'bg-teal-50 text-teal-700 border-teal-200' };
    case 'completed':
      return { label: 'Realizado', className: 'bg-sky-50 text-sky-700 border-sky-200' };
    case 'cancelled':
      return { label: 'Cancelado', className: 'bg-rose-50 text-rose-700 border-rose-200' };
    case 'no_show':
      return { label: 'Faltou', className: 'bg-slate-100 text-slate-600 border-slate-200' };
    default:
      return { label: 'Agendado', className: 'bg-amber-50 text-amber-700 border-amber-200' };
  }
}

export function ProfessionalModuleOverview<TShortcut extends string = string>({
  moduleKey,
  colorVariant,
  selectedPatientId,
  selectedPatient,
  onSelectPatient,
  searchTitle,
  searchSubtitle,
  searchPlaceholder,
  searchInputId,
  patientDataTour = 'clinical-patient-select',
  defaultServiceLabel = 'Atendimento Clínico',
  patientTermSingular = 'paciente',
  indicators,
  shortcuts
}: ProfessionalModuleOverviewProps<TShortcut>) {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const styles = COLOR_STYLES[colorVariant] || COLOR_STYLES.teal;

  const isLearner = patientTermSingular === 'aprendente';
  const resolvedSearchTitle =
    searchTitle ||
    (isLearner
      ? 'Buscar aprendente para iniciar atendimento'
      : 'Buscar paciente para iniciar atendimento');
  const resolvedSearchSubtitle =
    searchSubtitle ||
    (isLearner
      ? 'Encontre um aprendente por nome, CPF ou prontuário e acesse seu atendimento.'
      : 'Encontre um paciente por nome, CPF ou prontuário e acesse seu atendimento.');
  const resolvedSearchPlaceholder =
    searchPlaceholder ||
    (isLearner
      ? 'Buscar aprendente por nome, CPF ou prontuário...'
      : 'Buscar paciente por nome, CPF ou prontuário...');

  const [loading, setLoading] = useState<boolean>(true);
  const [patients, setPatients] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [dashboardMetrics, setDashboardMetrics] = useState<any | null>(null);
  const [pendingShortcut, setPendingShortcut] = useState<TShortcut | null>(null);

  const resolvedSearchInputId = searchInputId || `${moduleKey}-overview-patient-search`;

  const todayStr = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }, []);

  const weekRange = useMemo(() => {
    const [y, m, d] = todayStr.split('-').map(Number);
    const ref = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
    const dayOfWeek = ref.getDay();
    const start = new Date(ref);
    start.setDate(ref.getDate() - dayOfWeek);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const fmt = (dt: Date) =>
      [
        dt.getFullYear(),
        String(dt.getMonth() + 1).padStart(2, '0'),
        String(dt.getDate()).padStart(2, '0')
      ].join('-');
    return { start: fmt(start), end: fmt(end) };
  }, [todayStr]);

  useEffect(() => {
    let isMounted = true;

    const loadOverviewData = async () => {
      setLoading(true);
      try {
        const [patRes, apptRes, metricsRes] = await Promise.allSettled([
          ApiClient.get<any>('/v1/patients'),
          ApiClient.get<any>('/v1/appointments'),
          ApiClient.get<any>(`/v1/dashboard/metrics?date=${todayStr}`)
        ]);

        if (!isMounted) return;

        let loadedPatients: any[] = [];
        if (patRes.status === 'fulfilled' && patRes.value) {
          if (Array.isArray(patRes.value)) {
            loadedPatients = patRes.value;
          } else if (Array.isArray(patRes.value.patients)) {
            loadedPatients = patRes.value.patients;
          }
        }
        setPatients(loadedPatients);

        let loadedAppointments: any[] = [];
        if (apptRes.status === 'fulfilled' && apptRes.value) {
          if (Array.isArray(apptRes.value)) {
            loadedAppointments = apptRes.value;
          } else if (Array.isArray(apptRes.value.appointments)) {
            loadedAppointments = apptRes.value.appointments;
          }
        }
        setAppointments(loadedAppointments);

        if (metricsRes.status === 'fulfilled' && metricsRes.value) {
          setDashboardMetrics(metricsRes.value);
        }
      } catch (err) {
        console.warn(`[ProfessionalModuleOverview:${moduleKey}] Aviso ao carregar dados:`, err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadOverviewData();
    return () => {
      isMounted = false;
    };
  }, [todayStr, moduleKey]);

  const scopedAppointments = useMemo(() => {
    if (currentUser?.role === 'professional' && currentUser?.professionalId) {
      return appointments.filter(
        (a) => !a.professional_id || a.professional_id === currentUser.professionalId
      );
    }
    return appointments;
  }, [appointments, currentUser?.role, currentUser?.professionalId]);

  const activePatientsCount = useMemo(() => {
    return patients.filter(
      (p) => p && p.active !== 0 && p.active !== false && p.status !== 'inactive'
    ).length;
  }, [patients]);

  const weekAppointmentsCount = useMemo(() => {
    return scopedAppointments.filter((a) => {
      if (!a || a.status === 'cancelled') return false;
      const d = extractDatePart(a.start_time);
      return d >= weekRange.start && d <= weekRange.end;
    }).length;
  }, [scopedAppointments, weekRange]);

  const completedAppointmentsCount = useMemo(() => {
    return scopedAppointments.filter((a) => a && a.status === 'completed').length;
  }, [scopedAppointments]);

  const pendingReturnsCount = useMemo(() => {
    const worklist = dashboardMetrics?.worklist;
    if (worklist) {
      const remindersCount =
        typeof worklist.serviceRemindersCount === 'number'
          ? worklist.serviceRemindersCount
          : Array.isArray(worklist.serviceReminders)
          ? worklist.serviceReminders.length
          : 0;
      const scheduledReturnsCount = Array.isArray(worklist.returns)
        ? worklist.returns.filter((r: any) => r?.source_type === 'appointment').length
        : 0;
      return remindersCount + scheduledReturnsCount;
    }
    return scopedAppointments.filter(
      (a) =>
        a &&
        a.patient_notes === 'Consulta de Retorno' &&
        (a.status === 'scheduled' || a.status === 'confirmed')
    ).length;
  }, [dashboardMetrics, scopedAppointments]);

  const todayAppointments = useMemo(() => {
    const fromMetrics = dashboardMetrics?.today?.appointments;
    const baseList = Array.isArray(fromMetrics)
      ? fromMetrics
      : scopedAppointments.filter((a) => extractDatePart(a?.start_time) === todayStr);

    return [...baseList]
      .filter((a) => a && a.status !== 'cancelled')
      .sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')));
  }, [dashboardMetrics, scopedAppointments, todayStr]);

  const recentAttendances = useMemo(() => {
    return [...scopedAppointments]
      .filter((a) => a && a.status === 'completed' && a.patient_id)
      .sort((a, b) => String(b.start_time || '').localeCompare(String(a.start_time || '')))
      .slice(0, 6);
  }, [scopedAppointments]);

  const resolveIndicatorValue = (ind: OverviewIndicatorConfig): string | number => {
    if (loading) return '—';
    if (ind.customValue !== undefined && ind.customValue !== null) {
      return ind.customValue;
    }
    switch (ind.metricKey) {
      case 'active_patients':
        return activePatientsCount;
      case 'week_appointments':
        return weekAppointmentsCount;
      case 'completed_appointments':
        return completedAppointmentsCount;
      case 'pending_returns':
        return pendingReturnsCount;
      default:
        return '—';
    }
  };

  const { isZemda360, isZemdaBody } = useAuth();
  const hasZemda360Access = Boolean(isZemda360 || isZemdaBody);

  // Evita duplicar botões que já levam ao Zemda360 ou mapeamento anatômico
  const hasExistingZemdaShortcut = shortcuts.some(
    (s) =>
      s.id.toLowerCase().includes('zemda') ||
      s.id.toLowerCase().includes('body') ||
      s.label.toLowerCase().includes('zemda360') ||
      s.label.toLowerCase().includes('mapa corporal') ||
      s.description?.toLowerCase().includes('zemda360')
  );

  const displayShortcuts = useMemo(() => {
    if (!hasZemda360Access || hasExistingZemdaShortcut) {
      return shortcuts;
    }
    const zemdaShortcut: OverviewShortcutConfig<any> = {
      id: 'zemda360',
      label: 'Zemda360',
      description: 'Mapeamento anatômico',
      icon: Activity
    };
    return [...shortcuts, zemdaShortcut];
  }, [shortcuts, hasZemda360Access, hasExistingZemdaShortcut]);

  const pendingShortcutConfig = useMemo(
    () => displayShortcuts.find((s) => s.id === pendingShortcut) || null,
    [displayShortcuts, pendingShortcut]
  );

  const handleNavigateToAgenda = () => {
    window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: 'calendar' } }));
  };

  const handleSelectPatient = (patientId: string, patient?: PatientSearchResult | null) => {
    const action = pendingShortcut || undefined;
    setPendingShortcut(null);
    onSelectPatient(patientId, patient, action);
    if (action === 'zemda360') {
      window.dispatchEvent(new CustomEvent('zemda-open-360', { detail: { patientId } }));
    }
  };

  const handleQuickShortcutClick = (shortcut: OverviewShortcutConfig<TShortcut>) => {
    setPendingShortcut(shortcut.id);
    showToast(
      `Selecione um ${patientTermSingular} no campo de busca para abrir: ${shortcut.label}.`,
      'info'
    );
    const searchInput = document.getElementById(resolvedSearchInputId);
    if (searchInput) {
      searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      searchInput.focus();
    }
  };

  return (
    <div data-tour={`${moduleKey}-overview`} className="space-y-5 py-1 animate-fadeIn">
      {/* B. BUSCA DE PACIENTE EM DESTAQUE (CARD HORIZONTAL CLEAN) */}
      <section
        className={`bg-white rounded-2xl border p-4 sm:p-5 shadow-xs transition-all ${
          pendingShortcut ? styles.searchBorderActive : 'border-slate-200'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${styles.iconBox}`}
            >
              <Search className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-800 tracking-tight">{resolvedSearchTitle}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{resolvedSearchSubtitle}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto md:min-w-[340px] md:max-w-md shrink-0">
            {pendingShortcutConfig && (
              <div
                className={`inline-flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold shrink-0 ${styles.pendingBadge}`}
              >
                <span className="truncate max-w-[200px]">Atalho: {pendingShortcutConfig.label}</span>
                <button
                  type="button"
                  aria-label="Cancelar atalho selecionado"
                  onClick={() => setPendingShortcut(null)}
                  className={`p-0.5 rounded cursor-pointer ${styles.pendingClearBtn}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div data-tour={patientDataTour} className="w-full">
              <PatientSearchSelect
                id={resolvedSearchInputId}
                value={selectedPatientId || ''}
                selectedPatient={selectedPatient}
                onChange={(id, pat) => handleSelectPatient(id, pat)}
                placeholder={resolvedSearchPlaceholder}
              />
            </div>
          </div>
        </div>
      </section>

      {/* C. INDICADORES RESUMIDOS */}
      {indicators.length > 0 && (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {indicators.slice(0, 4).map((ind) => {
            const IconComponent = ind.icon;
            return (
              <div
                key={ind.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-slate-500 block truncate">
                    {ind.label}
                  </span>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold text-slate-800">
                      {resolveIndicatorValue(ind)}
                    </span>
                    <span className="text-[11px] text-slate-400 truncate">{ind.subtitle}</span>
                  </div>
                </div>
                <div
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${styles.iconBox}`}
                >
                  <IconComponent className="w-5 h-5" />
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* D & E. AGENDA DE HOJE E ÚLTIMOS ATENDIMENTOS */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* D. Agenda de hoje */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2 min-w-0">
              <Calendar className={`w-4 h-4 shrink-0 ${styles.sectionIcon}`} />
              <h3 className="font-bold text-slate-800 text-sm truncate">Agenda de hoje</h3>
            </div>
            <button
              type="button"
              onClick={handleNavigateToAgenda}
              className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 shrink-0 cursor-pointer ${styles.agendaLink}`}
            >
              <span>Ver agenda</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-3 flex-1 divide-y divide-slate-100">
            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Carregando agenda de hoje...
              </div>
            ) : todayAppointments.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Nenhum atendimento agendado para hoje.
              </div>
            ) : (
              todayAppointments.slice(0, 6).map((appt) => {
                const startTime = extractTimePart(appt.start_time) || '—';
                const endTime = extractTimePart(appt.end_time);
                const badge = getStatusBadge(appt.status);
                const patientName = appt.patient_name || 'Paciente';
                const serviceType = appt.service_name || defaultServiceLabel;

                return (
                  <button
                    key={appt.id}
                    type="button"
                    onClick={() =>
                      handleSelectPatient(appt.patient_id, {
                        id: appt.patient_id,
                        full_name: patientName,
                        name: patientName
                      })
                    }
                    className="w-full text-left py-3 px-2 hover:bg-slate-50 rounded-xl transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`px-2.5 py-1 rounded-lg border font-bold text-xs shrink-0 ${styles.timeBadge}`}
                      >
                        {startTime}
                      </div>
                      <div className="min-w-0">
                        <div
                          className={`font-bold text-xs text-slate-800 transition-colors truncate ${styles.rowHoverTitle}`}
                        >
                          {patientName}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {serviceType}
                          {endTime ? ` • até ${endTime}` : ''}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      <ChevronRight
                        className={`w-4 h-4 text-slate-400 transition-colors ${styles.rowHoverChevron}`}
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* E. Últimos atendimentos */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2 min-w-0">
              <History className={`w-4 h-4 shrink-0 ${styles.sectionIcon}`} />
              <h3 className="font-bold text-slate-800 text-sm truncate">Últimos atendimentos</h3>
            </div>
          </div>

          <div className="mt-3 flex-1 divide-y divide-slate-100">
            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Carregando histórico recente...
              </div>
            ) : recentAttendances.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Nenhum atendimento recente registrado.
              </div>
            ) : (
              recentAttendances.map((item) => {
                const patientName = item.patient_name || 'Paciente';
                const dateFormatted = formatDateBr(item.start_time);
                const serviceType = item.service_name || defaultServiceLabel;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      handleSelectPatient(item.patient_id, {
                        id: item.patient_id,
                        full_name: patientName,
                        name: patientName
                      })
                    }
                    className="w-full text-left py-3 px-2 hover:bg-slate-50 rounded-xl transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center uppercase shrink-0">
                        {patientName.slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div
                          className={`font-bold text-xs text-slate-800 transition-colors truncate ${styles.rowHoverTitle}`}
                        >
                          {patientName}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">{serviceType}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-medium text-slate-500">
                        {dateFormatted}
                      </span>
                      <ChevronRight
                        className={`w-4 h-4 text-slate-400 transition-colors ${styles.rowHoverChevron}`}
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* F. ACESSO RÁPIDO */}
      {displayShortcuts.length > 0 && (
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-slate-800">Acesso rápido</h3>
            <p className="text-xs text-slate-500">
              Selecione uma função e escolha o {patientTermSingular} para abrir diretamente a ferramenta desejada.
            </p>
          </div>

          <div
            className={`grid grid-cols-1 sm:grid-cols-2 ${
              displayShortcuts.length >= 5 ? 'md:grid-cols-3 lg:grid-cols-5' : 'lg:grid-cols-4'
            } gap-3`}
          >
            {displayShortcuts.map((sc) => {
              const IconComponent = sc.icon;
              const isSelected = pendingShortcut === sc.id;
              return (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => handleQuickShortcutClick(sc)}
                  className={`p-3.5 rounded-xl border text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
                    isSelected
                      ? styles.shortcutActive
                      : `border-slate-200 bg-slate-50/60 text-slate-800 ${styles.shortcutIdleHover}`
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${styles.shortcutIconBox}`}
                    >
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{sc.label}</div>
                      <div className="text-[11px] text-slate-500 truncate">{sc.description}</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
