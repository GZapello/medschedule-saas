import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Clock,
  Plus,
  Pencil,
  Trash2,
  Power,
  AlertTriangle,
  Users,
  MapPin,
  Loader2,
  Check
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  ClassScheduleItem,
  Professional,
  Room,
  ServiceScheduleDiagnostics,
  WeeklyScheduleSummaryItem
} from '../../types';

export interface DraftClassScheduleInput {
  tempId: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  professionalId: string;
  roomId: string | null;
  capacity: number;
  modality: 'presential' | 'online' | 'home';
  effectiveStartDate: string;
  effectiveEndDate: string | null;
}

interface ClassScheduleSectionProps {
  serviceId?: string | null;
  serviceModality: 'both' | 'presential' | 'online' | 'home';
  durationMinutes: number;
  defaultCapacity: number;
  defaultProfessionalId: string;
  professionals: Professional[];
  rooms: Room[];
  draftSchedules?: DraftClassScheduleInput[];
  onDraftSchedulesChange?: React.Dispatch<React.SetStateAction<DraftClassScheduleInput[]>>;
  onSchedulesChanged?: (
    schedules: ClassScheduleItem[],
    weeklySummary: WeeklyScheduleSummaryItem[],
    diagnostics?: ServiceScheduleDiagnostics | null
  ) => void;
}

const WEEKDAYS = [
  { value: 1, short: 'Seg', plural: 'Segundas' },
  { value: 2, short: 'Ter', plural: 'Terças' },
  { value: 3, short: 'Qua', plural: 'Quartas' },
  { value: 4, short: 'Qui', plural: 'Quintas' },
  { value: 5, short: 'Sex', plural: 'Sextas' },
  { value: 6, short: 'Sáb', plural: 'Sábados' },
  { value: 0, short: 'Dom', plural: 'Domingos' }
];

function addMinutesToClock(clock: string, durationMinutes: number): string {
  const clean = String(clock || '').slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(clean)) return '09:00';
  const [h, m] = clean.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, Math.max(0, h * 60 + m + Math.max(5, Number(durationMinutes) || 50)));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function getTodayIso(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function defaultConcreteModality(serviceModality: string): 'presential' | 'online' | 'home' {
  if (serviceModality === 'online') return 'online';
  if (serviceModality === 'home') return 'home';
  return 'presential';
}

function modalityLabel(m: string): string {
  if (m === 'online') return 'Online';
  if (m === 'home') return 'Domiciliar';
  return 'Presencial';
}

export const ClassScheduleSection: React.FC<ClassScheduleSectionProps> = ({
  serviceId,
  serviceModality,
  durationMinutes,
  defaultCapacity,
  defaultProfessionalId,
  professionals,
  rooms,
  draftSchedules = [],
  onDraftSchedulesChange,
  onSchedulesChanged
}) => {
  const { showToast } = useToast();
  const isPersisted = Boolean(serviceId);

  const [schedules, setSchedules] = useState<ClassScheduleItem[]>([]);
  const [weeklySummary, setWeeklySummary] = useState<WeeklyScheduleSummaryItem[]>([]);
  const [diagnostics, setDiagnostics] = useState<ServiceScheduleDiagnostics | null>(null);
  const [loadingList, setLoadingList] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Form state for adding or editing
  const [showForm, setShowForm] = useState<boolean>(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 3]);
  const [startTime, setStartTime] = useState<string>('08:00');
  const [endTime, setEndTime] = useState<string>(() => addMinutesToClock('08:00', durationMinutes));
  const [endTimeTouched, setEndTimeTouched] = useState<boolean>(false);
  const [profId, setProfId] = useState<string>(defaultProfessionalId || professionals[0]?.id || '');
  const [roomId, setRoomId] = useState<string>('');
  const [capacity, setCapacity] = useState<number>(Math.max(1, defaultCapacity || 10));
  const [modality, setModality] = useState<'presential' | 'online' | 'home'>(() =>
    defaultConcreteModality(serviceModality)
  );
  const [effectiveStartDate, setEffectiveStartDate] = useState<string>(() => getTodayIso());
  const [effectiveEndDate, setEffectiveEndDate] = useState<string>('');

  const fetchSchedules = async () => {
    if (!serviceId) return;
    try {
      setLoadingList(true);
      const res = await ApiClient.get<{
        schedules: ClassScheduleItem[];
        weeklySummary: WeeklyScheduleSummaryItem[];
        diagnostics?: ServiceScheduleDiagnostics | null;
      }>(`/v1/services/${serviceId}/class-schedules?includeInactive=1`);
      const nextList = Array.isArray(res?.schedules) ? res.schedules : [];
      const nextSummary = Array.isArray(res?.weeklySummary) ? res.weeklySummary : [];
      const nextDiag = res?.diagnostics ?? null;
      setSchedules(nextList);
      setWeeklySummary(nextSummary);
      setDiagnostics(nextDiag);
      onSchedulesChanged?.(nextList, nextSummary, nextDiag);
    } catch (err: any) {
      showToast(err?.message || 'Erro ao carregar a grade semanal da turma.', 'error');
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (serviceId) {
      fetchSchedules();
    } else {
      setSchedules([]);
      setWeeklySummary([]);
      setDiagnostics(null);
    }
    setWarnings([]);
    setShowForm(false);
    setEditingScheduleId(null);
  }, [serviceId]);

  useEffect(() => {
    if (!endTimeTouched && !editingScheduleId) {
      setEndTime(addMinutesToClock(startTime, durationMinutes));
    }
  }, [startTime, durationMinutes, endTimeTouched, editingScheduleId]);

  useEffect(() => {
    if (serviceModality !== 'both') {
      setModality(defaultConcreteModality(serviceModality));
    } else if (modality === 'home') {
      setModality('presential');
    }
  }, [serviceModality]);

  useEffect(() => {
    if ((!profId || !professionals.some(p => p.id === profId)) && (defaultProfessionalId || professionals[0]?.id)) {
      setProfId(defaultProfessionalId || professionals[0]?.id || '');
    }
  }, [defaultProfessionalId, professionals]);

  const openAddForm = () => {
    setEditingScheduleId(null);
    setSelectedDays([1, 3]);
    setStartTime('08:00');
    setEndTime(addMinutesToClock('08:00', durationMinutes));
    setEndTimeTouched(false);
    setProfId(
      professionals.some(p => p.id === defaultProfessionalId)
        ? defaultProfessionalId
        : (professionals[0]?.id || defaultProfessionalId || '')
    );
    setRoomId('');
    setCapacity(Math.max(1, defaultCapacity || 10));
    setModality(defaultConcreteModality(serviceModality));
    setEffectiveStartDate(getTodayIso());
    setEffectiveEndDate('');
    setShowForm(true);
  };

  const openEditDraftForm = (draft: DraftClassScheduleInput) => {
    setEditingScheduleId(draft.tempId);
    setSelectedDays([...draft.weekdays]);
    setStartTime(draft.startTime.slice(0, 5));
    setEndTime(draft.endTime.slice(0, 5));
    setEndTimeTouched(true);
    setProfId(draft.professionalId);
    setRoomId(draft.roomId || '');
    setCapacity(Number(draft.capacity) || Math.max(1, defaultCapacity || 1));
    setModality(
      serviceModality === 'both'
        ? draft.modality === 'online'
          ? 'online'
          : 'presential'
        : defaultConcreteModality(serviceModality)
    );
    setEffectiveStartDate(draft.effectiveStartDate || getTodayIso());
    setEffectiveEndDate(draft.effectiveEndDate || '');
    setShowForm(true);
  };

  const openEditForm = (item: ClassScheduleItem) => {
    setEditingScheduleId(item.id);
    setSelectedDays([item.day_of_week]);
    setStartTime(item.start_time.slice(0, 5));
    setEndTime(item.end_time.slice(0, 5));
    setEndTimeTouched(true);
    setProfId(item.professional_id);
    setRoomId(item.room_id || '');
    setCapacity(Number(item.capacity) || Math.max(1, defaultCapacity || 1));
    setModality(
      serviceModality === 'both'
        ? item.modality === 'online'
          ? 'online'
          : 'presential'
        : defaultConcreteModality(serviceModality)
    );
    setEffectiveStartDate(item.effective_start_date || getTodayIso());
    setEffectiveEndDate(item.effective_end_date || '');
    setShowForm(true);
  };

  const toggleDay = (dow: number) => {
    if (isPersisted && editingScheduleId) {
      setSelectedDays([dow]);
      return;
    }
    setSelectedDays(prev =>
      prev.includes(dow) ? prev.filter(d => d !== dow) : [...prev, dow]
    );
  };

  const handleSaveSchedule = async () => {
    if (selectedDays.length === 0) {
      showToast('Selecione ao menos um dia da semana.', 'error');
      return;
    }
    if (!startTime || !endTime || endTime <= startTime) {
      showToast('O horário de término deve ser posterior ao horário de início.', 'error');
      return;
    }
    if (!profId) {
      showToast('Selecione o instrutor responsável pela turma.', 'error');
      return;
    }
    if (!Number.isInteger(Number(capacity)) || Number(capacity) < 1) {
      showToast('Informe uma capacidade válida (número inteiro positivo).', 'error');
      return;
    }

    const resolvedModality =
      serviceModality === 'both' ? (modality === 'online' ? 'online' : 'presential') : defaultConcreteModality(serviceModality);

    if (!isPersisted) {
      const nextDraft: DraftClassScheduleInput = {
        tempId: editingScheduleId || `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        weekdays: [...selectedDays],
        startTime,
        endTime,
        professionalId: profId,
        roomId: roomId || null,
        capacity: Number(capacity),
        modality: resolvedModality,
        effectiveStartDate: effectiveStartDate || getTodayIso(),
        effectiveEndDate: effectiveEndDate || null
      };
      onDraftSchedulesChange?.(prev =>
        editingScheduleId
          ? prev.map(p => (p.tempId === editingScheduleId ? nextDraft : p))
          : [...prev, nextDraft]
      );
      setShowForm(false);
      setEditingScheduleId(null);
      return;
    }

    try {
      setSaving(true);
      setWarnings([]);
      if (editingScheduleId) {
        const res = await ApiClient.put<{
          schedule: ClassScheduleItem;
          warnings?: string[];
          schedules: ClassScheduleItem[];
          weeklySummary: WeeklyScheduleSummaryItem[];
          diagnostics?: ServiceScheduleDiagnostics | null;
        }>(`/v1/services/${serviceId}/class-schedules/${editingScheduleId}`, {
          dayOfWeek: selectedDays[0],
          startTime,
          endTime,
          professionalId: profId,
          roomId: roomId || null,
          capacity: Number(capacity),
          modality: resolvedModality,
          effectiveStartDate: effectiveStartDate || getTodayIso(),
          effectiveEndDate: effectiveEndDate || null
        });
        setSchedules(res.schedules || []);
        setWeeklySummary(res.weeklySummary || []);
        setDiagnostics(res.diagnostics ?? null);
        setWarnings(res.warnings || []);
        onSchedulesChanged?.(res.schedules || [], res.weeklySummary || [], res.diagnostics ?? null);
        showToast('Horário atualizado na grade semanal!', 'success');
      } else {
        const res = await ApiClient.post<{
          created: ClassScheduleItem[];
          warnings?: string[];
          schedules: ClassScheduleItem[];
          weeklySummary: WeeklyScheduleSummaryItem[];
          diagnostics?: ServiceScheduleDiagnostics | null;
        }>(`/v1/services/${serviceId}/class-schedules`, {
          weekdays: selectedDays,
          startTime,
          endTime,
          professionalId: profId,
          roomId: roomId || null,
          capacity: Number(capacity),
          modality: resolvedModality,
          effectiveStartDate: effectiveStartDate || getTodayIso(),
          effectiveEndDate: effectiveEndDate || null
        });
        setSchedules(res.schedules || []);
        setWeeklySummary(res.weeklySummary || []);
        setDiagnostics(res.diagnostics ?? null);
        setWarnings(res.warnings || []);
        onSchedulesChanged?.(res.schedules || [], res.weeklySummary || [], res.diagnostics ?? null);
        showToast('Horário adicionado à grade semanal!', 'success');
      }
      setShowForm(false);
      setEditingScheduleId(null);
    } catch (err: any) {
      showToast(err?.message || 'Não foi possível salvar o horário na grade.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: ClassScheduleItem) => {
    if (!serviceId) return;
    try {
      const nextActive = Number(item.active) === 1 ? 0 : 1;
      const res = await ApiClient.patch<{
        schedules: ClassScheduleItem[];
        weeklySummary: WeeklyScheduleSummaryItem[];
        diagnostics?: ServiceScheduleDiagnostics | null;
        warnings?: string[];
      }>(`/v1/services/${serviceId}/class-schedules/${item.id}/status`, {
        active: nextActive
      });
      setSchedules(res.schedules || []);
      setWeeklySummary(res.weeklySummary || []);
      setDiagnostics(res.diagnostics ?? null);
      setWarnings(res.warnings || []);
      onSchedulesChanged?.(res.schedules || [], res.weeklySummary || [], res.diagnostics ?? null);
      showToast(nextActive === 1 ? 'Horário reativado!' : 'Horário desativado!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Erro ao alterar status do horário.', 'error');
    }
  };

  const handleRemove = async (item: ClassScheduleItem) => {
    if (!serviceId) return;
    try {
      const res = await ApiClient.delete<{
        action: 'deleted' | 'deactivated';
        message: string;
        schedules: ClassScheduleItem[];
        weeklySummary: WeeklyScheduleSummaryItem[];
        diagnostics?: ServiceScheduleDiagnostics | null;
      }>(`/v1/services/${serviceId}/class-schedules/${item.id}`);
      setSchedules(res.schedules || []);
      setWeeklySummary(res.weeklySummary || []);
      setDiagnostics(res.diagnostics ?? null);
      onSchedulesChanged?.(res.schedules || [], res.weeklySummary || [], res.diagnostics ?? null);
      showToast(res.message || 'Horário removido da grade.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Erro ao remover horário da grade.', 'error');
    }
  };

  const draftSummaryLines = useMemo(() => {
    return draftSchedules.map(d => {
      const dayLabels = WEEKDAYS.filter(w => d.weekdays.includes(w.value)).map(w => w.plural);
      const profName = professionals.find(p => p.id === d.professionalId)?.name || 'Instrutor';
      const roomName = d.roomId ? rooms.find(r => r.id === d.roomId)?.name : null;
      return `${dayLabels.join(', ')} — ${d.startTime} às ${d.endTime} • ${profName} • ${d.capacity} vagas${roomName ? ` • ${roomName}` : ''}`;
    });
  }, [draftSchedules, professionals, rooms]);

  const sortedSchedules = useMemo(() => {
    const order = (d: number) => (d === 0 ? 7 : d);
    return [...schedules].sort((a, b) => {
      const diffDay = order(a.day_of_week) - order(b.day_of_week);
      if (diffDay !== 0) return diffDay;
      return a.start_time.localeCompare(b.start_time);
    });
  }, [schedules]);

  const draftWarnings = useMemo(() => {
    if (isPersisted || draftSchedules.length === 0) return [];
    const list: string[] = [];
    for (const d of draftSchedules) {
      const p = professionals.find(pr => pr.id === d.professionalId);
      if (!p) continue;
      if (p.public_booking_enabled === 0) {
        list.push(`${p.name} está com o agendamento público desativado.`);
      }
      if (Array.isArray(p.schedules) && p.schedules.length > 0) {
        for (const dow of d.weekdays) {
          const dayInfo = WEEKDAYS.find(w => w.value === dow);
          const matchingShift = p.schedules.some(
            sh => sh.is_active !== 0 && sh.day_of_week === dow && d.startTime >= sh.start_time.slice(0, 5) && d.endTime <= sh.end_time.slice(0, 5)
          );
          if (!matchingShift) {
            list.push(`${dayInfo?.plural || `Dia ${dow}`} (${d.startTime}–${d.endTime}): fora da escala geral cadastrada para ${p.name}.`);
          }
        }
      }
    }
    return Array.from(new Set(list));
  }, [isPersisted, draftSchedules, professionals]);

  const activePersistedCount = useMemo(
    () => sortedSchedules.filter(s => Number(s.active) !== 0).length,
    [sortedSchedules]
  );

  const diagnosticByScheduleId = useMemo(() => {
    const map = new Map<string, { publishable: boolean; reasons: string[] }>();
    for (const it of diagnostics?.items || []) {
      map.set(it.scheduleId, { publishable: it.publishable, reasons: it.reasons || [] });
    }
    return map;
  }, [diagnostics]);

  return (
    <div className="p-3.5 rounded-2xl border border-teal-200 bg-teal-50/40 space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
            <Calendar className="w-4 h-4 text-teal-600" />
            Dias e Horários das Aulas
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Define a grade semanal exibida aos alunos no agendamento público e o limite de vagas por turma.
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={openAddForm}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-[11px] shadow-xs transition-colors cursor-pointer"
          >
            + Adicionar dia e horário
          </button>
        )}
      </div>

      {/* Diagnóstico de publicação pública (quando há horários mas nenhum ou algum está bloqueado) */}
      {isPersisted && !loadingList && diagnostics && diagnostics.totalCount > 0 && diagnostics.blockers.length > 0 && (
        <div
          className={`p-2.5 rounded-xl border space-y-1 ${
            diagnostics.publishableCount === 0
              ? 'bg-amber-50 border-amber-300 text-amber-900'
              : 'bg-amber-50/60 border-amber-200 text-amber-800'
          }`}
        >
          <p className="font-bold text-[11px] flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {diagnostics.publishableCount === 0
              ? 'Turma ainda indisponível no agendamento online:'
              : 'Alguns horários da grade exigem atenção para publicação online:'}
          </p>
          {diagnostics.blockers.map((b, idx) => (
            <p key={idx} className="text-[11px]">
              • {b}
            </p>
          ))}
        </div>
      )}

      {!isPersisted && draftWarnings.length > 0 && (
        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 space-y-1">
          <p className="font-bold text-[11px] flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Observações para disponibilidade pública:
          </p>
          {draftWarnings.map((w, idx) => (
            <p key={idx} className="text-[11px]">
              • {w}
            </p>
          ))}
        </div>
      )}

      {/* Resumo consolidado da Grade Semanal */}
      {(isPersisted ? weeklySummary.length > 0 : draftSummaryLines.length > 0) && (
        <div className="bg-white border border-teal-100 rounded-xl p-2.5 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Grade semanal</p>
          {isPersisted
            ? weeklySummary.map((line, idx) => (
                <p key={idx} className="text-[11px] font-medium text-slate-700">
                  • {line.weekdaysLabel} — {line.timeRange} ({line.professionalName} • {line.capacity} vagas
                  {line.roomName ? ` • ${line.roomName}` : ''})
                </p>
              ))
            : draftSummaryLines.map((line, idx) => (
                <p key={idx} className="text-[11px] font-medium text-slate-700">
                  • {line}
                </p>
              ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 space-y-1">
          <p className="font-bold text-[11px] flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Atenção à disponibilidade do instrutor:
          </p>
          {warnings.map((w, idx) => (
            <p key={idx} className="text-[11px]">
              {w}
            </p>
          ))}
        </div>
      )}

      {/* Formulário adicionar/editar horário */}
      {showForm && (
        <div className="bg-white p-3.5 rounded-xl border border-teal-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-900 text-xs">
              {editingScheduleId ? 'Editar horário da turma' : 'Novo horário na grade semanal'}
            </span>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingScheduleId(null);
              }}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
            >
              Cancelar
            </button>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5 text-[11px]">
              {editingScheduleId ? 'Dia da semana *' : 'Dia(s) da semana *'}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map(day => {
                const active = selectedDays.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                      active
                        ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {active && <Check className="w-3 h-3" />}
                    {day.short}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div>
              <label className="block font-semibold text-slate-700 mb-1 text-[11px]">Início *</label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1 text-[11px]">Término *</label>
              <input
                type="time"
                value={endTime}
                onChange={e => {
                  setEndTimeTouched(true);
                  setEndTime(e.target.value);
                }}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1 text-[11px]">Vagas *</label>
              <input
                type="number"
                min={1}
                max={500}
                step={1}
                value={capacity}
                onChange={e => setCapacity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1 text-[11px]">Modalidade *</label>
              {serviceModality === 'both' ? (
                <select
                  value={modality === 'online' ? 'online' : 'presential'}
                  onChange={e => setModality(e.target.value as 'presential' | 'online')}
                  className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs bg-white"
                >
                  <option value="presential">Presencial</option>
                  <option value="online">Online</option>
                </select>
              ) : (
                <div className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-semibold text-xs">
                  {modalityLabel(defaultConcreteModality(serviceModality))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block font-semibold text-slate-700 mb-1 text-[11px]">Instrutor responsável *</label>
              <select
                value={profId}
                onChange={e => setProfId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs bg-white"
              >
                <option value="">Selecione...</option>
                {professionals.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.public_booking_enabled === 0 ? ' (Ag. público desativado)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1 text-[11px]">Sala / Espaço (opcional)</label>
              <select
                value={roomId}
                onChange={e => setRoomId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs bg-white"
              >
                <option value="">Sem sala fixa</option>
                {rooms
                  .filter(r => r.active !== 0)
                  .map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block font-semibold text-slate-700 mb-1 text-[11px]">Início da vigência</label>
              <input
                type="date"
                value={effectiveStartDate}
                onChange={e => setEffectiveStartDate(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1 text-[11px]">Fim da vigência (opcional)</label>
              <input
                type="date"
                value={effectiveEndDate}
                onChange={e => setEffectiveEndDate(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs bg-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveSchedule}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs cursor-pointer disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editingScheduleId ? 'Atualizar horário' : 'Confirmar horário'}
            </button>
          </div>
        </div>
      )}

      {/* Lista de horários persistidos ou em rascunho */}
      {isPersisted ? (
        loadingList ? (
          <div className="flex items-center gap-2 text-slate-500 text-[11px] py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Carregando horários configurados...
          </div>
        ) : sortedSchedules.length === 0 ? (
          <div className="p-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/70 text-amber-800 text-[11px] font-medium flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <span>Esta aula ainda não possui dias e horários cadastrados. Adicione pelo menos um horário para disponibilizá-la no agendamento online.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {activePersistedCount === 0 && (
              <div className="p-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/70 text-amber-800 text-[11px] font-medium flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <span>Esta aula ainda não possui dias e horários cadastrados. Adicione pelo menos um horário para disponibilizá-la no agendamento online.</span>
              </div>
            )}
            {sortedSchedules.map(item => {
              const dayInfo = WEEKDAYS.find(w => w.value === item.day_of_week);
              const isInactive = Number(item.active) === 0;
              const itemDiag = diagnosticByScheduleId.get(item.id);
              return (
                <div
                  key={item.id}
                  className={`p-2.5 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 transition-all ${
                    isInactive
                      ? 'bg-slate-100/80 border-slate-200 opacity-75'
                      : 'bg-white border-slate-200 shadow-2xs'
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-md bg-teal-100 text-teal-800 font-bold text-[11px]">
                        {dayInfo?.plural || `Dia ${item.day_of_week}`}
                      </span>
                      <span className="font-bold text-slate-900 inline-flex items-center gap-1">
                        <Clock className="w-3 h-3 text-teal-600" />
                        {item.start_time.slice(0, 5)} às {item.end_time.slice(0, 5)}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[10px]">
                        {modalityLabel(item.modality)}
                      </span>
                      {isInactive ? (
                        <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-bold text-[10px]">
                          Inativo
                        </span>
                      ) : itemDiag && !itemDiag.publishable ? (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">
                          Indisponível online
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                          Público ativo
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                      <span className="font-medium text-slate-700">{item.professional_name || 'Instrutor'}</span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3 h-3 text-slate-400" />
                        {item.capacity} vagas
                      </span>
                      {item.room_name && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          {item.room_name}
                        </span>
                      )}
                      {item.effective_end_date && (
                        <span className="text-slate-400">
                          até {item.effective_end_date.split('-').reverse().join('/')}
                        </span>
                      )}
                    </div>
                    {!isInactive && itemDiag && !itemDiag.publishable && itemDiag.reasons.length > 0 && (
                      <p className="text-[10px] text-amber-700 font-medium">{itemDiag.reasons[0]}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => openEditForm(item)}
                      title="Editar horário"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(item)}
                      title={isInactive ? 'Reativar horário' : 'Desativar horário'}
                      className={`p-1.5 rounded-lg cursor-pointer ${
                        isInactive
                          ? 'text-emerald-600 hover:bg-emerald-50'
                          : 'text-amber-600 hover:bg-amber-50'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(item)}
                      title="Remover horário"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        draftSchedules.length === 0 ? (
          <div className="p-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/70 text-amber-800 text-[11px] font-medium flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <span>Esta aula ainda não possui dias e horários cadastrados. Adicione pelo menos um horário para disponibilizá-la no agendamento online.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {draftSchedules.map(d => {
              const dayNames = WEEKDAYS.filter(w => d.weekdays.includes(w.value)).map(w => w.short).join(', ');
              const profName = professionals.find(p => p.id === d.professionalId)?.name || 'Instrutor';
              const roomName = d.roomId ? rooms.find(r => r.id === d.roomId)?.name : null;
              return (
                <div
                  key={d.tempId}
                  className="p-2.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-2"
                >
                  <div className="space-y-0.5 text-[11px]">
                    <div className="font-bold text-slate-800">
                      {dayNames} • {d.startTime} às {d.endTime} ({modalityLabel(d.modality)})
                    </div>
                    <div className="text-slate-500">
                      {profName} • {d.capacity} vagas{roomName ? ` • ${roomName}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditDraftForm(d)}
                      className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                      title="Editar horário"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDraftSchedulesChange?.(prev => prev.filter(p => p.tempId !== d.tempId))}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                      title="Remover horário"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
};
