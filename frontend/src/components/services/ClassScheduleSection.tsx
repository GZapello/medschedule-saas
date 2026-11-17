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
  coInstructorIds?: string[];
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
  onFormOpenChange?: (isOpen: boolean) => void;
  onSchedulesChanged?: (
    schedules: ClassScheduleItem[],
    weeklySummary: WeeklyScheduleSummaryItem[],
    diagnostics?: ServiceScheduleDiagnostics | null
  ) => void;
}

const WEEKDAYS = [
  { value: 1, short: 'Seg', plural: 'Segundas', full: 'Segunda-feira' },
  { value: 2, short: 'Ter', plural: 'Terças', full: 'Terça-feira' },
  { value: 3, short: 'Qua', plural: 'Quartas', full: 'Quarta-feira' },
  { value: 4, short: 'Qui', plural: 'Quintas', full: 'Quinta-feira' },
  { value: 5, short: 'Sex', plural: 'Sextas', full: 'Sexta-feira' },
  { value: 6, short: 'Sáb', plural: 'Sábados', full: 'Sábado' },
  { value: 0, short: 'Dom', plural: 'Domingos', full: 'Domingo' }
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
  onFormOpenChange,
  onSchedulesChanged
}) => {
  const { showToast } = useToast();
  const isPersisted = Boolean(serviceId);

  const [schedules, setSchedules] = useState<ClassScheduleItem[]>([]);
  const [diagnostics, setDiagnostics] = useState<ServiceScheduleDiagnostics | null>(null);
  const [loadingList, setLoadingList] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Seleção compacta de dias visíveis (não abre os 7 dias automaticamente)
  const [selectedDays, setSelectedDays] = useState<number[]>([]);

  // Formulário inline aberto dentro de um dia específico
  const [activeFormDay, setActiveFormDay] = useState<number | null>(null);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string>('08:00');
  const [endTime, setEndTime] = useState<string>(() => addMinutesToClock('08:00', durationMinutes));
  const [endTimeTouched, setEndTimeTouched] = useState<boolean>(false);
  const [profId, setProfId] = useState<string>(defaultProfessionalId || professionals[0]?.id || '');
  const [coInstructorIds, setCoInstructorIds] = useState<string[]>([]);
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
      setDiagnostics(nextDiag);
      const loadedDays = Array.from(new Set(nextList.map(s => Number(s.day_of_week))));
      setSelectedDays(loadedDays);
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
      setDiagnostics(null);
      setSelectedDays(Array.from(new Set(draftSchedules.flatMap(d => d.weekdays.map(Number)))));
    }
    setWarnings([]);
    setActiveFormDay(null);
    setEditingScheduleId(null);
  }, [serviceId]);

  useEffect(() => {
    if (!isPersisted) {
      const draftDays = Array.from(new Set(draftSchedules.flatMap(d => d.weekdays.map(Number))));
      if (draftDays.length > 0) {
        setSelectedDays(prev => {
          const missing = draftDays.filter(d => !prev.includes(d));
          return missing.length > 0 ? [...prev, ...missing] : prev;
        });
      }
    }
  }, [isPersisted, draftSchedules]);

  useEffect(() => {
    onFormOpenChange?.(activeFormDay !== null);
  }, [activeFormDay, onFormOpenChange]);

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

  const sortedSchedules = useMemo(() => {
    const order = (d: number) => (d === 0 ? 7 : d);
    return [...schedules].sort((a, b) => {
      const diffDay = order(a.day_of_week) - order(b.day_of_week);
      if (diffDay !== 0) return diffDay;
      return a.start_time.localeCompare(b.start_time);
    });
  }, [schedules]);

  const openAddFormForDay = (dow: number) => {
    const targetProf = professionals.some(p => p.id === defaultProfessionalId)
      ? defaultProfessionalId
      : (professionals[0]?.id || defaultProfessionalId || '');
    const occupiedIntervals = isPersisted
      ? schedules
          .filter(s => Number(s.active) !== 0 && s.professional_id === targetProf && Number(s.day_of_week) === dow)
          .map(s => ({ start: s.start_time.slice(0, 5), end: s.end_time.slice(0, 5) }))
      : draftSchedules
          .filter(d => d.professionalId === targetProf && d.weekdays.includes(dow))
          .map(d => ({ start: d.startTime.slice(0, 5), end: d.endTime.slice(0, 5) }));

    let suggestedStart = '08:00';
    for (const candidateHour of [8, 15, 17, 9, 10, 14, 16, 18, 19, 11, 13, 20, 7]) {
      const sCand = `${String(candidateHour).padStart(2, '0')}:00`;
      const eCand = addMinutesToClock(sCand, durationMinutes);
      if (!occupiedIntervals.some(o => sCand < o.end && eCand > o.start)) {
        suggestedStart = sCand;
        break;
      }
    }

    setEditingScheduleId(null);
    setActiveFormDay(dow);
    setStartTime(suggestedStart);
    setEndTime(addMinutesToClock(suggestedStart, durationMinutes));
    setEndTimeTouched(false);
    setProfId(targetProf);
    setCoInstructorIds([]);
    setRoomId('');
    setCapacity(Math.max(1, defaultCapacity || 10));
    setModality(defaultConcreteModality(serviceModality));
    setEffectiveStartDate(getTodayIso());
    setEffectiveEndDate('');
  };

  const openEditDraftForDay = (draft: DraftClassScheduleInput, dow: number) => {
    setEditingScheduleId(draft.tempId);
    setActiveFormDay(dow);
    setStartTime(draft.startTime.slice(0, 5));
    setEndTime(draft.endTime.slice(0, 5));
    setEndTimeTouched(true);
    setProfId(draft.professionalId);
    setCoInstructorIds((draft.coInstructorIds || []).filter(id => id !== draft.professionalId));
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
  };

  const openEditPersistedForm = (item: ClassScheduleItem) => {
    setEditingScheduleId(item.id);
    setActiveFormDay(Number(item.day_of_week));
    setStartTime(item.start_time.slice(0, 5));
    setEndTime(item.end_time.slice(0, 5));
    setEndTimeTouched(true);
    setProfId(item.professional_id);
    setCoInstructorIds((item.co_instructor_ids || []).filter(id => id !== item.professional_id));
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
  };

  const toggleDaySelection = (dow: number) => {
    const dayHasPersisted = isPersisted && sortedSchedules.some(s => Number(s.day_of_week) === dow);
    if (dayHasPersisted) {
      showToast('Desative ou remova os horários cadastrados neste dia antes de ocultá-lo.', 'info');
      return;
    }

    const isCurrentlySelected = selectedDays.includes(dow);
    if (isCurrentlySelected) {
      setSelectedDays(prev => prev.filter(d => d !== dow));
      if (activeFormDay === dow) {
        setActiveFormDay(null);
        setEditingScheduleId(null);
      }
      if (!isPersisted && draftSchedules.some(d => d.weekdays.includes(dow))) {
        onDraftSchedulesChange?.(prev =>
          prev
            .map(d => (d.weekdays.includes(dow) ? { ...d, weekdays: d.weekdays.filter(w => w !== dow) } : d))
            .filter(d => d.weekdays.length > 0)
        );
      }
    } else {
      setSelectedDays(prev => [...prev, dow]);
    }
  };

  const handleSaveSchedule = async () => {
    if (activeFormDay === null) return;
    const targetDow = activeFormDay;
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
    const normalizedCoIds = coInstructorIds.filter(id => id && id !== profId);

    if (!isPersisted) {
      const nextStartEff = effectiveStartDate || getTodayIso();
      const nextEndEff = effectiveEndDate || '9999-12-31';
      for (const existingDraft of draftSchedules) {
        if (editingScheduleId && existingDraft.tempId === editingScheduleId) continue;
        if (!existingDraft.weekdays.includes(targetDow)) continue;
        const timeOverlaps = startTime < existingDraft.endTime.slice(0, 5) && endTime > existingDraft.startTime.slice(0, 5);
        if (!timeOverlaps) continue;
        const exEnd = existingDraft.effectiveEndDate || '9999-12-31';
        const datesOverlap = nextStartEff <= exEnd && nextEndEff >= (existingDraft.effectiveStartDate || getTodayIso());
        if (!datesOverlap) continue;
        if (existingDraft.professionalId === profId) {
          const profName = professionals.find(p => p.id === profId)?.name || 'Este instrutor';
          showToast(`${profName} já possui outro horário sobreposto (${existingDraft.startTime}–${existingDraft.endTime}) neste dia.`, 'error');
          return;
        }
        if (roomId && existingDraft.roomId && existingDraft.roomId === roomId) {
          const roomName = rooms.find(r => r.id === roomId)?.name || 'selecionada';
          showToast(`A sala ${roomName} já está reservada em ${existingDraft.startTime}–${existingDraft.endTime} neste dia.`, 'error');
          return;
        }
      }

      const nextDraft: DraftClassScheduleInput = {
        tempId:
          editingScheduleId &&
          draftSchedules.find(d => d.tempId === editingScheduleId)?.weekdays.length === 1
            ? editingScheduleId
            : `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        weekdays: [targetDow],
        startTime,
        endTime,
        professionalId: profId,
        coInstructorIds: normalizedCoIds,
        roomId: roomId || null,
        capacity: Number(capacity),
        modality: resolvedModality,
        effectiveStartDate: effectiveStartDate || getTodayIso(),
        effectiveEndDate: effectiveEndDate || null
      };

      onDraftSchedulesChange?.(prev => {
        if (!editingScheduleId) return [...prev, nextDraft];
        const targetDraft = prev.find(p => p.tempId === editingScheduleId);
        if (!targetDraft) return [...prev, nextDraft];
        if (targetDraft.weekdays.length <= 1) {
          return prev.map(p => (p.tempId === editingScheduleId ? nextDraft : p));
        }
        // Se um bloco antigo representava múltiplos dias, separa apenas este dia sem alterar os outros
        return [
          ...prev.map(p =>
            p.tempId === editingScheduleId
              ? { ...p, weekdays: p.weekdays.filter(w => w !== targetDow) }
              : p
          ),
          nextDraft
        ].filter(p => p.weekdays.length > 0);
      });

      setActiveFormDay(null);
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
          dayOfWeek: targetDow,
          startTime,
          endTime,
          professionalId: profId,
          coInstructorIds: normalizedCoIds,
          roomId: roomId || null,
          capacity: Number(capacity),
          modality: resolvedModality,
          effectiveStartDate: effectiveStartDate || getTodayIso(),
          effectiveEndDate: effectiveEndDate || null
        });
        setSchedules(res.schedules || []);
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
          weekdays: [targetDow],
          startTime,
          endTime,
          professionalId: profId,
          coInstructorIds: normalizedCoIds,
          roomId: roomId || null,
          capacity: Number(capacity),
          modality: resolvedModality,
          effectiveStartDate: effectiveStartDate || getTodayIso(),
          effectiveEndDate: effectiveEndDate || null
        });
        setSchedules(res.schedules || []);
        setDiagnostics(res.diagnostics ?? null);
        setWarnings(res.warnings || []);
        onSchedulesChanged?.(res.schedules || [], res.weeklySummary || [], res.diagnostics ?? null);
        showToast('Horário adicionado à grade semanal!', 'success');
      }
      setActiveFormDay(null);
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
      setDiagnostics(res.diagnostics ?? null);
      setWarnings(res.warnings || []);
      onSchedulesChanged?.(res.schedules || [], res.weeklySummary || [], res.diagnostics ?? null);
      showToast(nextActive === 1 ? 'Horário reativado!' : 'Horário desativado!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Erro ao alterar status do horário.', 'error');
    }
  };

  const handleRemovePersisted = async (item: ClassScheduleItem) => {
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
      setDiagnostics(res.diagnostics ?? null);
      onSchedulesChanged?.(res.schedules || [], res.weeklySummary || [], res.diagnostics ?? null);
      showToast(res.message || 'Horário removido da grade.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Erro ao remover horário da grade.', 'error');
    }
  };

  const handleRemoveDraftForDay = (draft: DraftClassScheduleInput, dow: number) => {
    onDraftSchedulesChange?.(prev =>
      prev
        .map(d => (d.tempId === draft.tempId ? { ...d, weekdays: d.weekdays.filter(w => w !== dow) } : d))
        .filter(d => d.weekdays.length > 0)
    );
    if (editingScheduleId === draft.tempId && activeFormDay === dow) {
      setActiveFormDay(null);
      setEditingScheduleId(null);
    }
  };

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

  const visibleDays = useMemo(() => {
    const set = new Set<number>(selectedDays);
    if (isPersisted) {
      for (const s of sortedSchedules) set.add(Number(s.day_of_week));
    } else {
      for (const d of draftSchedules) {
        for (const w of d.weekdays) set.add(Number(w));
      }
    }
    return WEEKDAYS.filter(day => set.has(day.value));
  }, [selectedDays, isPersisted, sortedSchedules, draftSchedules]);

  const renderInlineDayForm = (day: typeof WEEKDAYS[number]) => (
    <div
      className="bg-white p-3 rounded-xl border border-teal-200 shadow-xs space-y-2.5 mt-1"
      data-testid={`class-schedule-form-day-${day.value}`}
    >
      <div className="flex items-center justify-between">
        <span className="font-bold text-slate-900 text-xs">
          {editingScheduleId ? `Editar turma em ${day.full}` : `Nova turma em ${day.full}`}
        </span>
        <button
          type="button"
          onClick={() => {
            setActiveFormDay(null);
            setEditingScheduleId(null);
          }}
          className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
        >
          Cancelar
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <label className="block font-semibold text-slate-700 mb-1 text-[11px]">Início *</label>
          <input
            type="time"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
            data-testid="class-schedule-input-start"
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
            data-testid="class-schedule-input-end"
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
            data-testid="class-schedule-input-capacity"
            className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs bg-white"
          />
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-1 text-[11px]">Modalidade *</label>
          {serviceModality === 'both' ? (
            <select
              value={modality === 'online' ? 'online' : 'presential'}
              onChange={e => setModality(e.target.value as 'presential' | 'online')}
              data-testid="class-schedule-input-modality"
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="block font-semibold text-slate-700 mb-1 text-[11px]">Instrutor responsável *</label>
          <select
            value={profId}
            onChange={e => {
              const nextProf = e.target.value;
              setProfId(nextProf);
              setCoInstructorIds(prev => prev.filter(id => id !== nextProf));
            }}
            data-testid="class-schedule-input-professional"
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
            data-testid="class-schedule-input-room"
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

      {professionals.filter(p => p.id !== profId).length > 0 && (
        <div className="p-2 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-700 text-[11px]">
              Equipe da aula (Coinstrutores — opcional)
            </span>
            <span className="text-[10px] text-slate-500">
              {coInstructorIds.length > 0 ? `${coInstructorIds.length} coinstrutor(es)` : 'Somente titular'}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {professionals
              .filter(p => p.id !== profId)
              .map(p => {
                const checked = coInstructorIds.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors ${
                      checked
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-900'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setCoInstructorIds(prev =>
                          prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]
                        )
                      }
                      className="w-3.5 h-3.5 rounded text-indigo-600 border-slate-300"
                    />
                    <span>{p.name}</span>
                  </label>
                );
              })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
  );

  return (
    <div className="p-3.5 rounded-2xl border border-teal-200 bg-teal-50/40 space-y-3 text-xs" data-testid="class-schedule-section">
      <div>
        <h4 className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
          <Calendar className="w-4 h-4 text-teal-600" />
          Dias e Horários das Aulas
        </h4>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Selecione os dias da semana e configure um ou mais horários de turma em cada dia.
        </p>
      </div>

      {/* 1. Seleção compacta dos dias da semana */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-semibold text-slate-600">
          Selecione os dias da semana:
        </div>
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Dias da semana da aula coletiva"
          data-testid="class-schedule-weekday-selector"
        >
          {WEEKDAYS.map(day => {
            const hasSavedOnDay = isPersisted
              ? sortedSchedules.some(s => Number(s.day_of_week) === day.value)
              : draftSchedules.some(d => d.weekdays.includes(day.value));
            const isSelected = selectedDays.includes(day.value) || hasSavedOnDay;
            return (
              <button
                key={day.value}
                type="button"
                aria-pressed={isSelected}
                aria-label={day.full}
                data-testid={`class-schedule-toggle-day-${day.value}`}
                onClick={() => toggleDaySelection(day.value)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer inline-flex items-center gap-1 ${
                  isSelected
                    ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-teal-400'
                }`}
              >
                {isSelected && <Check className="w-3 h-3" />}
                {day.short}
              </button>
            );
          })}
        </div>
      </div>

      {/* Diagnóstico de publicação pública */}
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

      {isPersisted && loadingList ? (
        <div className="flex items-center gap-2 text-slate-500 text-[11px] py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Carregando horários configurados...
        </div>
      ) : visibleDays.length === 0 ? (
        <div
          className="p-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/70 text-amber-800 text-[11px] font-medium flex items-start gap-2"
          data-testid="class-schedule-empty-days"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
          <span>Selecione acima os dias da semana em que esta aula acontece para configurar seus horários e vagas.</span>
        </div>
      ) : (
        <div className="space-y-2.5" data-testid={isPersisted ? 'persisted-class-schedules-list' : 'draft-class-schedules-list'}>
          {isPersisted && sortedSchedules.length > 0 && activePersistedCount === 0 && (
            <div className="p-2.5 rounded-xl border border-dashed border-amber-300 bg-amber-50/70 text-amber-800 text-[11px] font-medium flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <span>Todos os horários estão inativos. Reative ou adicione um horário para disponibilizar no agendamento online.</span>
            </div>
          )}

          {visibleDays.map(day => {
            const persistedItems = isPersisted
              ? sortedSchedules.filter(s => Number(s.day_of_week) === day.value)
              : [];
            const draftItems = !isPersisted
              ? draftSchedules
                  .filter(d => d.weekdays.includes(day.value))
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
              : [];
            const itemCount = isPersisted ? persistedItems.length : draftItems.length;
            const isFormOpenHere = activeFormDay === day.value;

            return (
              <div
                key={day.value}
                data-testid={`class-schedule-day-${day.value}`}
                className="p-2.5 rounded-xl border border-slate-200 bg-white/90 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-xs">{day.full}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {itemCount} {itemCount === 1 ? 'turma' : 'turmas'}
                    </span>
                  </div>
                  {!isFormOpenHere && (
                    <button
                      type="button"
                      onClick={() => openAddFormForDay(day.value)}
                      data-testid={`class-schedule-add-day-${day.value}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-teal-200 text-teal-700 hover:bg-teal-50 font-bold text-[11px] transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      Adicionar horário
                    </button>
                  )}
                </div>

                {itemCount === 0 && !isFormOpenHere && (
                  <p className="text-[11px] text-slate-500">
                    Nenhum horário configurado para {day.full}. Clique em “+ Adicionar horário”.
                  </p>
                )}

                {isPersisted &&
                  persistedItems.map(item => {
                    const isInactive = Number(item.active) === 0;
                    const itemDiag = diagnosticByScheduleId.get(item.id);
                    return (
                      <div
                        key={item.id}
                        data-testid={`class-schedule-item-${item.id}`}
                        className={`p-2 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${
                          isInactive
                            ? 'bg-slate-100/80 border-slate-200 opacity-75'
                            : 'bg-slate-50/70 border-slate-200'
                        }`}
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-slate-900 inline-flex items-center gap-1">
                              <Clock className="w-3 h-3 text-teal-600" />
                              {item.start_time.slice(0, 5)} às {item.end_time.slice(0, 5)}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-semibold text-[10px]">
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
                            {Array.isArray(item.co_instructors) &&
                              item.co_instructors.filter(ci => ci.role === 'co_instructor').length > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold text-[10px]">
                                  + Co: {item.co_instructors
                                    .filter(ci => ci.role === 'co_instructor')
                                    .map(ci => ci.professionalName)
                                    .join(', ')}
                                </span>
                              )}
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
                            onClick={() => openEditPersistedForm(item)}
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
                              isInactive ? 'text-emerald-600 hover:bg-emerald-50' : 'text-amber-600 hover:bg-amber-50'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemovePersisted(item)}
                            title="Remover horário"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                {!isPersisted &&
                  draftItems.map(d => {
                    const profName = professionals.find(p => p.id === d.professionalId)?.name || 'Instrutor';
                    const roomName = d.roomId ? rooms.find(r => r.id === d.roomId)?.name : null;
                    return (
                      <div
                        key={`${d.tempId}-${day.value}`}
                        data-testid={`class-schedule-draft-${day.value}-${d.tempId}`}
                        className="p-2 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                      >
                        <div className="space-y-0.5 min-w-0 text-[11px]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-slate-900 inline-flex items-center gap-1">
                              <Clock className="w-3 h-3 text-teal-600" />
                              {d.startTime.slice(0, 5)} às {d.endTime.slice(0, 5)}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-semibold text-[10px]">
                              {modalityLabel(d.modality)}
                            </span>
                          </div>
                          <div className="text-slate-600 flex flex-wrap items-center gap-2">
                            <span className="font-medium text-slate-700">{profName}</span>
                            {Array.isArray(d.coInstructorIds) && d.coInstructorIds.length > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold text-[10px]">
                                + Co: {d.coInstructorIds
                                  .map(cid => professionals.find(p => p.id === cid)?.name)
                                  .filter(Boolean)
                                  .join(', ')}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1">
                              <Users className="w-3 h-3 text-slate-400" />
                              {d.capacity} vagas
                            </span>
                            {roomName && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-slate-400" />
                                {roomName}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                          <button
                            type="button"
                            onClick={() => openEditDraftForDay(d, day.value)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                            title="Editar horário"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveDraftForDay(d, day.value)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                            title="Remover horário"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                {isFormOpenHere && renderInlineDayForm(day)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
