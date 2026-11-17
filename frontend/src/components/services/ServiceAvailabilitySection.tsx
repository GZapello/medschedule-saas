import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarCheck2, Clock, Plus, Trash2 } from 'lucide-react';
import {
  ServiceAvailabilityDiagnostics,
  ServiceAvailabilityMode,
  ServiceAvailabilityWindow
} from '../../types';
import { ProfessionalScheduleRow } from './useProfessionalSchedules';

const WEEKDAYS: Array<{ value: number; short: string; full: string }> = [
  { value: 1, short: 'Seg', full: 'Segunda-feira' },
  { value: 2, short: 'Ter', full: 'Terça-feira' },
  { value: 3, short: 'Qua', full: 'Quarta-feira' },
  { value: 4, short: 'Qui', full: 'Quinta-feira' },
  { value: 5, short: 'Sex', full: 'Sexta-feira' },
  { value: 6, short: 'Sáb', full: 'Sábado' },
  { value: 0, short: 'Dom', full: 'Domingo' }
];

interface TimeSegment {
  start: number;
  end: number;
}

export function parseClockMinutes(clock: string | undefined | null): number | null {
  if (!clock || typeof clock !== 'string') return null;
  const m = clock.trim().match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return hh * 60 + mm;
}

export function formatMinutesClock(min: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(min)));
  const hh = String(Math.floor(clamped / 60)).padStart(2, '0');
  const mm = String(clamped % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function getActiveScheduleSegmentsByDay(
  schedules: ProfessionalScheduleRow[],
  dayOfWeek: number
): Array<{ professionalId: string; segments: TimeSegment[] }> {
  const byProf = new Map<string, TimeSegment[]>();
  for (const row of schedules) {
    if (Number(row.day_of_week) !== dayOfWeek) continue;
    if (!(row.is_active === true || Number(row.is_active) === 1)) continue;
    const s = parseClockMinutes(row.start_time);
    const e = parseClockMinutes(row.end_time);
    if (s === null || e === null || e <= s) continue;
    let segs: TimeSegment[] = [{ start: s, end: e }];
    const bs = parseClockMinutes(row.break_start || null);
    const be = parseClockMinutes(row.break_end || null);
    if (bs !== null && be !== null && be > bs) {
      segs = segs.flatMap(seg => {
        if (be <= seg.start || bs >= seg.end) return [seg];
        const next: TimeSegment[] = [];
        if (bs > seg.start) next.push({ start: seg.start, end: Math.min(seg.end, bs) });
        if (be < seg.end) next.push({ start: Math.max(seg.start, be), end: seg.end });
        return next;
      });
    }
    const curr = byProf.get(row.professionalId) || [];
    byProf.set(row.professionalId, [...curr, ...segs]);
  }
  return Array.from(byProf.entries()).map(([professionalId, segments]) => ({
    professionalId,
    segments: segments.sort((a, b) => a.start - b.start)
  }));
}

export function isWindowWithinSchedules(
  schedules: ProfessionalScheduleRow[],
  dayOfWeek: number,
  startMin: number,
  endMin: number
): boolean {
  const perProf = getActiveScheduleSegmentsByDay(schedules, dayOfWeek);
  return perProf.some(entry =>
    entry.segments.some(seg => startMin >= seg.start && endMin <= seg.end)
  );
}

export function validateServiceAvailabilityWindows(params: {
  mode: ServiceAvailabilityMode;
  windows: ServiceAvailabilityWindow[];
  schedules: ProfessionalScheduleRow[];
  schedulesLoaded?: boolean;
  allowedWeekdays?: number[];
  restrictWeekdays?: boolean;
}): {
  valid: boolean;
  formError: string | null;
  windowErrors: Record<number, string>;
} {
  if (params.mode !== 'custom_windows') {
    return { valid: true, formError: null, windowErrors: {} };
  }
  if (!Array.isArray(params.windows) || params.windows.length === 0) {
    return {
      valid: false,
      formError: 'Adicione pelo menos um horário específico para este serviço ou utilize toda a grade do profissional.',
      windowErrors: {}
    };
  }

  const windowErrors: Record<number, string> = {};
  const parsedByDay = new Map<number, Array<{ idx: number; startMin: number; endMin: number }>>();

  params.windows.forEach((win, idx) => {
    const startMin = parseClockMinutes(win.startTime);
    const endMin = parseClockMinutes(win.endTime);
    if (startMin === null || endMin === null) {
      windowErrors[idx] = 'Informe horários válidos de início e término.';
      return;
    }
    if (endMin <= startMin) {
      windowErrors[idx] = 'O horário de término deve ser maior que o horário de início.';
      return;
    }
    if (params.restrictWeekdays && Array.isArray(params.allowedWeekdays) && !params.allowedWeekdays.includes(Number(win.dayOfWeek))) {
      windowErrors[idx] = 'Este dia não está selecionado na recorrência do serviço.';
      return;
    }
    if (params.schedulesLoaded !== false && !isWindowWithinSchedules(params.schedules, Number(win.dayOfWeek), startMin, endMin)) {
      windowErrors[idx] = 'Este horário está fora da escala de trabalho do profissional.';
    }
    const list = parsedByDay.get(Number(win.dayOfWeek)) || [];
    list.push({ idx, startMin, endMin });
    parsedByDay.set(Number(win.dayOfWeek), list);
  });

  for (const list of parsedByDay.values()) {
    list.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
    for (let i = 1; i < list.length; i++) {
      if (list[i].startMin < list[i - 1].endMin) {
        const msg = 'Existem faixas de horários sobrepostas neste dia.';
        windowErrors[list[i - 1].idx] = windowErrors[list[i - 1].idx] || msg;
        windowErrors[list[i].idx] = windowErrors[list[i].idx] || msg;
      }
    }
  }

  const firstErrIdx = Object.keys(windowErrors).map(Number).sort((a, b) => a - b)[0];
  return {
    valid: Object.keys(windowErrors).length === 0,
    formError: firstErrIdx !== undefined ? windowErrors[firstErrIdx] : null,
    windowErrors
  };
}

interface ServiceAvailabilitySectionProps {
  mode: ServiceAvailabilityMode;
  windows: ServiceAvailabilityWindow[];
  schedules: ProfessionalScheduleRow[];
  schedulesLoading?: boolean;
  allowedWeekdays?: number[];
  restrictWeekdays?: boolean;
  diagnostics?: ServiceAvailabilityDiagnostics | null;
  defaultProfessionalId?: string | null;
  onModeChange: (nextMode: ServiceAvailabilityMode) => void;
  onWindowsChange: (nextWindows: ServiceAvailabilityWindow[]) => void;
  testIdPrefix?: string;
}

export const ServiceAvailabilitySection: React.FC<ServiceAvailabilitySectionProps> = ({
  mode,
  windows,
  schedules,
  schedulesLoading = false,
  allowedWeekdays = [],
  restrictWeekdays = false,
  diagnostics = null,
  defaultProfessionalId = null,
  onModeChange,
  onWindowsChange,
  testIdPrefix = 'service-availability'
}) => {
  const safeAllowedWeekdays = useMemo(
    () => Array.from(new Set((allowedWeekdays || []).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))).sort((a, b) => a - b),
    [allowedWeekdays]
  );

  const activeScheduleWeekdays = useMemo(() => {
    const set = new Set<number>();
    for (const row of schedules) {
      if (row.is_active === true || Number(row.is_active) === 1) {
        set.add(Number(row.day_of_week));
      }
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [schedules]);

  const [selectedDays, setSelectedDays] = useState<number[]>(() =>
    Array.from(new Set((windows || []).map(w => Number(w.dayOfWeek))))
  );

  useEffect(() => {
    const windowDays = Array.from(new Set((windows || []).map(w => Number(w.dayOfWeek))));
    if (windowDays.length > 0) {
      setSelectedDays(prev => {
        const missing = windowDays.filter(d => !prev.includes(d));
        return missing.length > 0 ? [...prev, ...missing] : prev;
      });
    }
  }, [windows]);

  const toggleDaySelection = (dow: number) => {
    const isCurrentlySelected = selectedDays.includes(dow);
    if (isCurrentlySelected) {
      setSelectedDays(prev => prev.filter(d => d !== dow));
      if (windows.some(w => Number(w.dayOfWeek) === dow)) {
        onWindowsChange(windows.filter(w => Number(w.dayOfWeek) !== dow));
      }
    } else {
      setSelectedDays(prev => [...prev, dow]);
    }
  };

  const visibleWeekdays = useMemo(() => {
    const set = new Set<number>(selectedDays);
    for (const w of windows) set.add(Number(w.dayOfWeek));
    return WEEKDAYS.filter(d => set.has(d.value));
  }, [selectedDays, windows]);

  const validation = useMemo(
    () =>
      validateServiceAvailabilityWindows({
        mode,
        windows,
        schedules,
        schedulesLoaded: !schedulesLoading,
        allowedWeekdays: safeAllowedWeekdays,
        restrictWeekdays: Boolean(restrictWeekdays && safeAllowedWeekdays.length > 0)
      }),
    [mode, windows, schedules, schedulesLoading, safeAllowedWeekdays, restrictWeekdays]
  );

  const hasOutOfSyncWarning =
    mode === 'custom_windows' &&
    (Boolean(diagnostics?.hasIncompatibleWindows) || Object.keys(validation.windowErrors).length > 0);

  const handleAddWindowForDay = (dayOfWeek: number) => {
    const dayProfSegments = getActiveScheduleSegmentsByDay(schedules, dayOfWeek).flatMap(p => p.segments);
    const existingForDay = windows
      .filter(w => Number(w.dayOfWeek) === dayOfWeek)
      .map(w => ({
        start: parseClockMinutes(w.startTime) ?? 0,
        end: parseClockMinutes(w.endTime) ?? 0
      }))
      .sort((a, b) => a.start - b.start);

    let defaultStart = '08:00';
    let defaultEnd = '12:00';

    if (dayProfSegments.length > 0) {
      const mergedSeg = dayProfSegments[0];
      if (existingForDay.length === 0) {
        defaultStart = formatMinutesClock(mergedSeg.start);
        defaultEnd = formatMinutesClock(mergedSeg.end);
      } else {
        // Procura segmento livre ou intervalo após a última faixa configurada
        const candidateSeg = dayProfSegments.find(seg =>
          !existingForDay.some(ex => Math.max(ex.start, seg.start) < Math.min(ex.end, seg.end))
        );
        if (candidateSeg) {
          defaultStart = formatMinutesClock(candidateSeg.start);
          defaultEnd = formatMinutesClock(candidateSeg.end);
        } else {
          const lastEnd = existingForDay[existingForDay.length - 1].end;
          const hostSeg = dayProfSegments.find(seg => seg.end > lastEnd + 30);
          if (hostSeg) {
            const nextStart = Math.max(hostSeg.start, lastEnd);
            defaultStart = formatMinutesClock(nextStart);
            defaultEnd = formatMinutesClock(Math.min(hostSeg.end, nextStart + 120));
          } else {
            defaultStart = formatMinutesClock(mergedSeg.start);
            defaultEnd = formatMinutesClock(Math.min(mergedSeg.end, mergedSeg.start + 60));
          }
        }
      }
    }

    onWindowsChange([
      ...windows,
      {
        dayOfWeek,
        startTime: defaultStart,
        endTime: defaultEnd,
        professionalId: defaultProfessionalId || null
      }
    ]);
  };

  const handleUpdateWindow = (index: number, patch: Partial<ServiceAvailabilityWindow>) => {
    onWindowsChange(windows.map((w, idx) => (idx === index ? { ...w, ...patch } : w)));
  };

  const handleRemoveWindow = (index: number) => {
    onWindowsChange(windows.filter((_, idx) => idx !== index));
  };

  const summaryItems = useMemo(() => {
    if (mode !== 'custom_windows' || windows.length === 0) return [];
    const grouped = new Map<number, string[]>();
    for (const w of [...windows].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime))) {
      const list = grouped.get(Number(w.dayOfWeek)) || [];
      list.push(`${w.startTime}–${w.endTime}`);
      grouped.set(Number(w.dayOfWeek), list);
    }
    return WEEKDAYS.filter(d => grouped.has(d.value)).map(d => ({
      day: d.short,
      ranges: grouped.get(d.value) || []
    }));
  }, [mode, windows]);

  return (
    <div
      className="p-3 bg-white rounded-xl border border-slate-200 space-y-2.5"
      data-testid={`${testIdPrefix}-section`}
    >
      <div>
        <div className="font-bold text-slate-800 text-[11px] flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-teal-600" />
          <span>Disponibilidade deste serviço</span>
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Escolha se este serviço poderá utilizar todos os horários disponíveis do profissional ou apenas horários específicos.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <label
          data-testid={`${testIdPrefix}-mode-professional`}
          className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
            mode === 'professional_schedule'
              ? 'border-teal-600 bg-teal-50/70 text-teal-950'
              : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-slate-100/70'
          }`}
        >
          <input
            type="radio"
            name={`${testIdPrefix}-mode`}
            value="professional_schedule"
            checked={mode === 'professional_schedule'}
            onChange={() => onModeChange('professional_schedule')}
            className="mt-0.5 text-teal-600 focus:ring-teal-500"
          />
          <div className="min-w-0">
            <div className="text-[11px] font-bold">Utilizar toda a grade do profissional</div>
            <div className="text-[10px] text-slate-600 mt-0.5">
              O serviço poderá ser agendado em qualquer horário livre da escala do profissional, respeitando os dias selecionados.
            </div>
          </div>
        </label>

        <label
          data-testid={`${testIdPrefix}-mode-custom`}
          className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
            mode === 'custom_windows'
              ? 'border-teal-600 bg-teal-50/70 text-teal-950'
              : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-slate-100/70'
          }`}
        >
          <input
            type="radio"
            name={`${testIdPrefix}-mode`}
            value="custom_windows"
            checked={mode === 'custom_windows'}
            onChange={() => onModeChange('custom_windows')}
            className="mt-0.5 text-teal-600 focus:ring-teal-500"
          />
          <div className="min-w-0">
            <div className="text-[11px] font-bold">Definir horários específicos para este serviço</div>
            <div className="text-[10px] text-slate-600 mt-0.5">
              Determine os horários em que o profissional oferece este serviço em cada dia da semana.
            </div>
          </div>
        </label>
      </div>

      {mode === 'custom_windows' && (
        <div
          className="pt-2 border-t border-slate-100 space-y-2.5"
          data-testid={`${testIdPrefix}-custom-area`}
        >
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="text-[11px] font-bold text-slate-800">Horários específicos por dia</div>
            {schedulesLoading && (
              <span className="text-[10px] text-slate-500">Carregando escala do profissional...</span>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold text-slate-500">
              1. Selecione os dias em que este serviço é oferecido:
            </div>
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label="Selecionar dias de disponibilidade do serviço"
              data-testid={`${testIdPrefix}-weekday-selector`}
            >
              {WEEKDAYS.map(wd => {
                const isSelected = selectedDays.includes(wd.value) || windows.some(w => Number(w.dayOfWeek) === wd.value);
                const hasProfScale = schedulesLoading || activeScheduleWeekdays.includes(wd.value);
                const outsideAllowedRec =
                  Boolean(restrictWeekdays && safeAllowedWeekdays.length > 0 && !safeAllowedWeekdays.includes(wd.value));
                return (
                  <button
                    key={wd.value}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={wd.full}
                    data-testid={`${testIdPrefix}-toggle-day-${wd.value}`}
                    title={
                      !hasProfScale
                        ? `${wd.full} (sem escala ativa do profissional)`
                        : outsideAllowedRec
                        ? `${wd.full} (fora dos dias específicos da recorrência)`
                        : wd.full
                    }
                    onClick={() => toggleDaySelection(wd.value)}
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-1 ${
                      isSelected
                        ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                        : !hasProfScale || outsideAllowedRec
                        ? 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-teal-400'
                    }`}
                  >
                    <span>{wd.short}</span>
                    {!schedulesLoading && !hasProfScale && (
                      <span className={`text-[9px] ${isSelected ? 'text-teal-100' : 'text-slate-400'}`}>•</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {hasOutOfSyncWarning && (
            <div
              className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2"
              data-testid={`${testIdPrefix}-incompatible-warning`}
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-bold">Horários incompatíveis detectados</div>
                {diagnostics?.warnings && diagnostics.warnings.length > 0 ? (
                  diagnostics.warnings.map((w, i) => <div key={i}>{w}</div>)
                ) : (
                  <div>
                    Existem faixas que ultrapassam a escala atual do profissional ou não pertencem aos dias selecionados. Ajuste antes de salvar.
                  </div>
                )}
              </div>
            </div>
          )}

          {!schedulesLoading && visibleWeekdays.length === 0 ? (
            <div
              className="p-2.5 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-[11px] text-slate-600"
              data-testid={`${testIdPrefix}-no-days-hint`}
            >
              Selecione os dias da semana acima para definir as faixas de horário deste serviço.
            </div>
          ) : (
            <div className="space-y-2">
              {visibleWeekdays.map(wd => {
                const dayScheduleEntries = getActiveScheduleSegmentsByDay(schedules, wd.value);
                const mergedScheduleText = Array.from(
                  new Set(
                    dayScheduleEntries.flatMap(e =>
                      e.segments.map(s => `${formatMinutesClock(s.start)}–${formatMinutesClock(s.end)}`)
                    )
                  )
                ).join(' · ');
                const dayWindowEntries = windows
                  .map((win, idx) => ({ win, idx }))
                  .filter(item => Number(item.win.dayOfWeek) === wd.value);
                const isDayOutsideAllowed =
                  Boolean(restrictWeekdays && safeAllowedWeekdays.length > 0 && !safeAllowedWeekdays.includes(wd.value));

                return (
                  <div
                    key={wd.value}
                    data-testid={`${testIdPrefix}-day-${wd.value}`}
                    className={`p-2.5 rounded-xl border space-y-2 ${
                      isDayOutsideAllowed ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-slate-50/60'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[11px] font-bold text-slate-800">{wd.full}</span>
                        <span className="ml-2 text-[10px] text-slate-500">
                          {mergedScheduleText ? `Escala: ${mergedScheduleText}` : 'Sem escala ativa neste dia'}
                        </span>
                      </div>
                      {!isDayOutsideAllowed && dayScheduleEntries.length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleAddWindowForDay(wd.value)}
                          data-testid={`${testIdPrefix}-add-day-${wd.value}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white border border-teal-200 text-teal-700 hover:bg-teal-50 transition-colors cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          Adicionar horário
                        </button>
                      )}
                    </div>

                    {dayWindowEntries.length === 0 ? (
                      <div className="text-[10px] text-slate-500">
                        {dayScheduleEntries.length === 0
                          ? `O profissional não possui escala ativa na ${wd.full}.`
                          : `Nenhum horário específico adicionado para ${wd.full}. Clique em "+ Adicionar horário".`}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {dayWindowEntries.map(({ win, idx }) => {
                          const err = validation.windowErrors[idx];
                          return (
                            <div key={`${wd.value}-${idx}`} className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-semibold text-slate-600">Início</span>
                                  <input
                                    type="time"
                                    value={win.startTime}
                                    onChange={e => handleUpdateWindow(idx, { startTime: e.target.value })}
                                    data-testid={`${testIdPrefix}-start-${idx}`}
                                    aria-label={`Início em ${wd.full}`}
                                    className={`border rounded-lg px-2 py-1 text-xs bg-white ${
                                      err ? 'border-rose-400 text-rose-800' : 'border-slate-200 text-slate-800'
                                    }`}
                                  />
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-semibold text-slate-600">Fim</span>
                                  <input
                                    type="time"
                                    value={win.endTime}
                                    onChange={e => handleUpdateWindow(idx, { endTime: e.target.value })}
                                    data-testid={`${testIdPrefix}-end-${idx}`}
                                    aria-label={`Fim em ${wd.full}`}
                                    className={`border rounded-lg px-2 py-1 text-xs bg-white ${
                                      err ? 'border-rose-400 text-rose-800' : 'border-slate-200 text-slate-800'
                                    }`}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveWindow(idx)}
                                  data-testid={`${testIdPrefix}-remove-${idx}`}
                                  aria-label={`Remover horário de ${wd.full}`}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              {err && (
                                <div
                                  className="text-[10px] font-semibold text-rose-600"
                                  data-testid={`${testIdPrefix}-error-${idx}`}
                                >
                                  {err}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {summaryItems.length > 0 && (
            <div className="p-2 rounded-xl bg-teal-50/50 border border-teal-200/70 text-[10px] text-teal-950 flex items-start gap-1.5">
              <CalendarCheck2 className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Resumo da disponibilidade: </span>
                {summaryItems.map(item => `${item.day} (${item.ranges.join(', ')})`).join(' · ')}
              </div>
            </div>
          )}

          {windows.length === 0 && !schedulesLoading && visibleWeekdays.length > 0 && (
            <div
              className="text-[10px] font-semibold text-amber-700"
              data-testid={`${testIdPrefix}-empty-warning`}
            >
              Adicione pelo menos um horário específico ou selecione “Utilizar toda a grade do profissional”.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
