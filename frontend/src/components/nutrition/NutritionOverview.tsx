import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Calendar,
  Utensils,
  Clock,
  Search,
  ChevronRight,
  Activity,
  Scale,
  FileText,
  History,
  X
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PatientSearchSelect, PatientSearchResult } from '../common/PatientSearchSelect';

export type NutritionQuickShortcut = 'evolution' | 'meal_plans' | 'anthropometry' | 'reports';

export interface NutritionOverviewProps {
  selectedPatientId?: string | null;
  selectedPatient?: any | null;
  onSelectPatient: (
    patientId: string,
    patient?: PatientSearchResult | null,
    initialAction?: NutritionQuickShortcut
  ) => void;
}

const SHORTCUT_LABELS: Record<NutritionQuickShortcut, string> = {
  evolution: 'Novo atendimento',
  meal_plans: 'Plano alimentar',
  anthropometry: 'Antropometria',
  reports: 'Relatórios'
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

export const NutritionOverview: React.FC<NutritionOverviewProps> = ({
  selectedPatientId,
  selectedPatient,
  onSelectPatient
}) => {
  const { currentUser } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState<boolean>(true);
  const [patients, setPatients] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [dashboardMetrics, setDashboardMetrics] = useState<any | null>(null);
  const [mealPlansCount, setMealPlansCount] = useState<number | null>(null);
  const [pendingShortcut, setPendingShortcut] = useState<NutritionQuickShortcut | null>(null);

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

        // Calcula quantidade real de planos alimentares quando a base pode ser consultada com segurança
        const activePats = loadedPatients.filter(
          (p) => p && p.active !== 0 && p.active !== false && p.status !== 'inactive'
        );
        if (activePats.length === 0) {
          setMealPlansCount(0);
        } else if (activePats.length <= 10) {
          const planResponses = await Promise.allSettled(
            activePats.map((p) => ApiClient.get<any[]>(`/v1/nutrition/meal-plans/${p.id}`))
          );
          if (!isMounted) return;
          let count = 0;
          let hasFulfilled = false;
          for (const pr of planResponses) {
            if (pr.status === 'fulfilled' && Array.isArray(pr.value)) {
              hasFulfilled = true;
              count += pr.value.filter((plan) => plan && plan.is_active !== 0).length;
            }
          }
          setMealPlansCount(hasFulfilled ? count : null);
        } else {
          setMealPlansCount(null);
        }
      } catch (err) {
        console.warn('[NutritionOverview] Aviso ao carregar dados iniciais:', err);
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
  }, [todayStr]);

  // Filtra agendamentos respeitando o profissional logado quando aplicável
  const scopedAppointments = useMemo(() => {
    if (currentUser?.role === 'professional' && currentUser?.professionalId) {
      return appointments.filter(
        (a) => !a.professional_id || a.professional_id === currentUser.professionalId
      );
    }
    return appointments;
  }, [appointments, currentUser?.role, currentUser?.professionalId]);

  // 1. Pacientes ativos
  const activePatientsCount = useMemo(() => {
    return patients.filter(
      (p) => p && p.active !== 0 && p.active !== false && p.status !== 'inactive'
    ).length;
  }, [patients]);

  // 2. Atendimentos na semana
  const weekAppointmentsCount = useMemo(() => {
    return scopedAppointments.filter((a) => {
      if (!a || a.status === 'cancelled') return false;
      const d = extractDatePart(a.start_time);
      return d >= weekRange.start && d <= weekRange.end;
    }).length;
  }, [scopedAppointments, weekRange]);

  // 4. Reavaliações pendentes (Lembretes de retorno + retornos agendados)
  const pendingReassessmentsCount = useMemo(() => {
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

  // Agenda de hoje
  const todayAppointments = useMemo(() => {
    const fromMetrics = dashboardMetrics?.today?.appointments;
    const baseList = Array.isArray(fromMetrics)
      ? fromMetrics
      : scopedAppointments.filter((a) => extractDatePart(a?.start_time) === todayStr);

    return [...baseList]
      .filter((a) => a && a.status !== 'cancelled')
      .sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')));
  }, [dashboardMetrics, scopedAppointments, todayStr]);

  // Últimos atendimentos (registros reais concluídos)
  const recentAttendances = useMemo(() => {
    return [...scopedAppointments]
      .filter((a) => a && a.status === 'completed' && a.patient_id)
      .sort((a, b) => String(b.start_time || '').localeCompare(String(a.start_time || '')))
      .slice(0, 6);
  }, [scopedAppointments]);

  const handleNavigateToAgenda = () => {
    window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: 'calendar' } }));
  };

  const handleSelectPatient = (patientId: string, patient?: PatientSearchResult | null) => {
    const action = pendingShortcut || undefined;
    setPendingShortcut(null);
    onSelectPatient(patientId, patient, action);
  };

  const handleQuickShortcutClick = (shortcut: NutritionQuickShortcut) => {
    setPendingShortcut(shortcut);
    const label = SHORTCUT_LABELS[shortcut];
    showToast(`Selecione um paciente no campo de busca para abrir: ${label}.`, 'info');
    const searchInput = document.getElementById('nutrition-overview-patient-search');
    if (searchInput) {
      searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      searchInput.focus();
    }
  };

  return (
    <div data-tour="nutrition-overview" className="space-y-5 py-1 animate-fadeIn">
      {/* B. BUSCAR PACIENTE */}
      <section
        className={`bg-white rounded-2xl border p-5 shadow-xs transition-all ${
          pendingShortcut
            ? 'border-emerald-400 ring-2 ring-emerald-500/15'
            : 'border-slate-200'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
              <Search className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Buscar paciente</h2>
              <p className="text-xs text-slate-500">
                Encontre um paciente por nome, CPF ou prontuário.
              </p>
            </div>
          </div>

          {pendingShortcut && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
              <span>Abrir após selecionar: {SHORTCUT_LABELS[pendingShortcut]}</span>
              <button
                type="button"
                aria-label="Cancelar atalho selecionado"
                onClick={() => setPendingShortcut(null)}
                className="p-0.5 text-emerald-600 hover:text-emerald-900 rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        <div data-tour="clinical-patient-select" className="w-full">
          <PatientSearchSelect
            id="nutrition-overview-patient-search"
            value={selectedPatientId || ''}
            selectedPatient={selectedPatient}
            onChange={(id, pat) => handleSelectPatient(id, pat)}
            placeholder="Buscar paciente por nome, CPF ou prontuário..."
          />
        </div>
      </section>

      {/* C. INDICADORES GERAIS */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs font-semibold text-slate-500 block truncate">
              Pacientes ativos
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-slate-800">
                {loading ? '—' : activePatientsCount}
              </span>
              <span className="text-[11px] text-slate-400 truncate">cadastrados</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs font-semibold text-slate-500 block truncate">
              Atendimentos na semana
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-slate-800">
                {loading ? '—' : weekAppointmentsCount}
              </span>
              <span className="text-[11px] text-slate-400 truncate">na agenda</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs font-semibold text-slate-500 block truncate">
              Planos alimentares
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-slate-800">
                {loading ? '—' : mealPlansCount !== null ? mealPlansCount : '—'}
              </span>
              <span className="text-[11px] text-slate-400 truncate">
                {mealPlansCount !== null ? 'ativos' : 'por paciente'}
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
            <Utensils className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs font-semibold text-slate-500 block truncate">
              Reavaliações pendentes
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-slate-800">
                {loading ? '—' : pendingReassessmentsCount}
              </span>
              <span className="text-[11px] text-slate-400 truncate">retornos</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </section>

      {/* D & E. AGENDA DE HOJE E ÚLTIMOS ATENDIMENTOS */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* D. Agenda de hoje */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2 min-w-0">
              <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
              <h3 className="font-bold text-slate-800 text-sm truncate">Agenda de hoje</h3>
            </div>
            <button
              type="button"
              onClick={handleNavigateToAgenda}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
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
                Nenhuma consulta agendada para hoje.
              </div>
            ) : (
              todayAppointments.slice(0, 6).map((appt) => {
                const startTime = extractTimePart(appt.start_time) || '—';
                const endTime = extractTimePart(appt.end_time);
                const badge = getStatusBadge(appt.status);
                const patientName = appt.patient_name || 'Paciente';
                const serviceType = appt.service_name || 'Consulta Nutricional';

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
                      <div className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold text-xs shrink-0">
                        {startTime}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-800 group-hover:text-emerald-700 transition-colors truncate">
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
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
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
              <History className="w-4 h-4 text-emerald-600 shrink-0" />
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
                const serviceType = item.service_name || 'Consulta Nutricional';

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
                        <div className="font-bold text-xs text-slate-800 group-hover:text-emerald-700 transition-colors truncate">
                          {patientName}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {serviceType}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-medium text-slate-500">
                        {dateFormatted}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* F. ACESSO RÁPIDO */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="mb-3">
          <h3 className="text-sm font-bold text-slate-800">Acesso rápido</h3>
          <p className="text-xs text-slate-500">
            Selecione uma função e escolha o paciente para abrir diretamente a ferramenta desejada.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => handleQuickShortcutClick('evolution')}
            className={`p-3.5 rounded-xl border text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
              pendingShortcut === 'evolution'
                ? 'border-emerald-500 bg-emerald-50/60 text-emerald-900'
                : 'border-slate-200 bg-slate-50/60 hover:bg-emerald-50/40 hover:border-emerald-300 text-slate-800'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0">
                <Activity className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">Novo atendimento</div>
                <div className="text-[11px] text-slate-500 truncate">Evolução e conduta</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => handleQuickShortcutClick('meal_plans')}
            className={`p-3.5 rounded-xl border text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
              pendingShortcut === 'meal_plans'
                ? 'border-emerald-500 bg-emerald-50/60 text-emerald-900'
                : 'border-slate-200 bg-slate-50/60 hover:bg-emerald-50/40 hover:border-emerald-300 text-slate-800'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0">
                <Utensils className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">Plano alimentar</div>
                <div className="text-[11px] text-slate-500 truncate">Cardápio e TACO</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => handleQuickShortcutClick('anthropometry')}
            className={`p-3.5 rounded-xl border text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
              pendingShortcut === 'anthropometry'
                ? 'border-emerald-500 bg-emerald-50/60 text-emerald-900'
                : 'border-slate-200 bg-slate-50/60 hover:bg-emerald-50/40 hover:border-emerald-300 text-slate-800'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0">
                <Scale className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">Antropometria</div>
                <div className="text-[11px] text-slate-500 truncate">Medidas e IMC</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => handleQuickShortcutClick('reports')}
            className={`p-3.5 rounded-xl border text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
              pendingShortcut === 'reports'
                ? 'border-emerald-500 bg-emerald-50/60 text-emerald-900'
                : 'border-slate-200 bg-slate-50/60 hover:bg-emerald-50/40 hover:border-emerald-300 text-slate-800'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">Relatórios</div>
                <div className="text-[11px] text-slate-500 truncate">Guia do paciente</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </button>
        </div>
      </section>
    </div>
  );
};
