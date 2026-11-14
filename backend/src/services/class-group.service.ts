import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { resolveConcreteModality } from '../utils/modality-resolver';
import {
  RecurrenceFrequency,
  RecurrenceIntervalUnit,
  PlanDurationCode,
  resolveIntervalSpecFromFrequency,
  resolvePlanDurationEndDate,
  MAX_RECURRENCE_OCCURRENCES,
  MAX_RECURRENCE_SPAN_DAYS
} from '../utils/establishment-context';
import { InstructorParticipationService } from './instructor-participation.service';

export type { RecurrenceFrequency, RecurrenceIntervalUnit };

export interface GenerateRecurrenceOptions {
  startDate: string; // YYYY-MM-DD
  frequency: RecurrenceFrequency;
  intervalValue?: number | null;
  intervalUnit?: RecurrenceIntervalUnit | null;
  weekdays?: number[]; // 0..6 (Domingo=0 .. Sábado=6)
  endDate?: string | null;
  maxOccurrences?: number | null;
}

const MAX_RECURRENCE_CAP = MAX_RECURRENCE_OCCURRENCES;

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function formatYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function generateRecurrenceDates(opts: GenerateRecurrenceOptions): string[] {
  const startStr = String(opts.startDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr)) {
    throw Object.assign(new Error('Data inicial inválida para recorrência.'), { status: 400, code: 'INVALID_RECURRENCE_DATE' });
  }

  const endStr = opts.endDate ? String(opts.endDate).slice(0, 10) : null;
  if (endStr && !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
    throw Object.assign(new Error('Data final inválida para recorrência.'), { status: 400, code: 'INVALID_RECURRENCE_DATE' });
  }
  if (endStr && endStr < startStr) {
    throw Object.assign(new Error('A data final da recorrência deve ser igual ou posterior à data inicial.'), { status: 400, code: 'INVALID_RECURRENCE_DATE' });
  }

  const rawMax = opts.maxOccurrences !== undefined && opts.maxOccurrences !== null ? Number(opts.maxOccurrences) : null;
  if (!endStr && (!rawMax || !Number.isInteger(rawMax) || rawMax < 1)) {
    throw Object.assign(new Error('Informe a data final ou a quantidade de ocorrências para criar agendamentos recorrentes (recorrência infinita não é permitida).'), { status: 400, code: 'RECURRENCE_BOUND_REQUIRED' });
  }
  if (rawMax !== null && (!Number.isInteger(rawMax) || rawMax < 1)) {
    throw Object.assign(new Error('A quantidade de ocorrências deve ser um número inteiro positivo.'), { status: 400, code: 'RECURRENCE_LIMIT_EXCEEDED' });
  }
  if (rawMax !== null && rawMax > MAX_RECURRENCE_CAP) {
    throw Object.assign(
      new Error(`O limite máximo de ocorrências por série é ${MAX_RECURRENCE_CAP}.`),
      { status: 400, code: 'RECURRENCE_LIMIT_EXCEEDED' }
    );
  }

  const startDate = parseYmd(startStr);
  if (endStr) {
    const endDateObj = parseYmd(endStr);
    const diffDays = Math.round((endDateObj.getTime() - startDate.getTime()) / 86400000);
    if (diffDays > MAX_RECURRENCE_SPAN_DAYS) {
      throw Object.assign(
        new Error('A data limite da recorrência não pode ultrapassar 5 anos a partir da data inicial.'),
        { status: 400, code: 'RECURRENCE_HORIZON_EXCEEDED' }
      );
    }
  }

  const maxLimitMs = startDate.getTime() + MAX_RECURRENCE_SPAN_DAYS * 86400000;
  const maxCount = Math.min(rawMax || MAX_RECURRENCE_CAP, MAX_RECURRENCE_CAP);
  const startWeekday = startDate.getUTCDay();
  const weekdays = Array.isArray(opts.weekdays) && opts.weekdays.length > 0
    ? Array.from(new Set(opts.weekdays.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))).sort((a, b) => a - b)
    : [startWeekday];

  const freq = (opts.frequency || 'weekly') as RecurrenceFrequency;
  const resolvedSpec = resolveIntervalSpecFromFrequency(freq, opts.intervalValue, opts.intervalUnit);
  if (!resolvedSpec.ok) {
    throw Object.assign(new Error(resolvedSpec.error), { status: 400, code: resolvedSpec.code });
  }

  const dates: string[] = [];

  // Dias específicos da semana (freq === 'custom_weekdays') ou intervalo em semanas
  if (freq === 'custom_weekdays' || resolvedSpec.spec?.intervalUnit === 'weeks') {
    const weekStep = freq === 'custom_weekdays' ? 1 : (resolvedSpec.spec?.intervalValue || 1);
    const startSunday = new Date(startDate.getTime());
    startSunday.setUTCDate(startSunday.getUTCDate() - startWeekday);

    for (let weekIndex = 0; dates.length < maxCount; weekIndex += weekStep) {
      const firstDayOfBlock = new Date(startSunday.getTime());
      firstDayOfBlock.setUTCDate(startSunday.getUTCDate() + weekIndex * 7);
      if (firstDayOfBlock.getTime() > maxLimitMs) {
        if (!endStr && rawMax && dates.length < rawMax) {
          throw Object.assign(
            new Error('A quantidade de ocorrências informada ultrapassa o horizonte máximo de 5 anos.'),
            { status: 400, code: 'RECURRENCE_HORIZON_EXCEEDED' }
          );
        }
        return dates;
      }

      for (const wd of weekdays) {
        const candidate = new Date(startSunday.getTime());
        candidate.setUTCDate(startSunday.getUTCDate() + weekIndex * 7 + wd);
        const ymd = formatYmd(candidate);
        if (ymd < startStr) continue;
        if (endStr && ymd > endStr) {
          return dates;
        }
        if (candidate.getTime() > maxLimitMs) {
          if (!endStr && rawMax && dates.length < rawMax) {
            throw Object.assign(
              new Error('A quantidade de ocorrências informada ultrapassa o horizonte máximo de 5 anos.'),
              { status: 400, code: 'RECURRENCE_HORIZON_EXCEEDED' }
            );
          }
          return dates;
        }
        dates.push(ymd);
        if (dates.length >= maxCount) {
          return dates;
        }
      }
    }
    return dates;
  }

  if (resolvedSpec.spec?.intervalUnit === 'days') {
    const dayStep = resolvedSpec.spec.intervalValue;
    for (let idx = 0; dates.length < maxCount; idx++) {
      const candidate = new Date(startDate.getTime());
      candidate.setUTCDate(startDate.getUTCDate() + idx * dayStep);
      if (candidate.getTime() > maxLimitMs) {
        if (!endStr && rawMax && dates.length < rawMax) {
          throw Object.assign(
            new Error('A quantidade de ocorrências informada ultrapassa o horizonte máximo de 5 anos.'),
            { status: 400, code: 'RECURRENCE_HORIZON_EXCEEDED' }
          );
        }
        break;
      }
      const ymd = formatYmd(candidate);
      if (endStr && ymd > endStr) break;
      dates.push(ymd);
    }
    return dates;
  }

  // Meses (monthly, bimonthly, quarterly, semiannual, annual ou custom_interval em months)
  const monthStep = resolvedSpec.spec?.intervalValue || 1;
  const startDay = startDate.getUTCDate();
  for (let idx = 0; dates.length < maxCount; idx++) {
    const monthOffset = idx * monthStep;
    const y = startDate.getUTCFullYear();
    const m = startDate.getUTCMonth() + monthOffset;
    const candidate = new Date(Date.UTC(y, m, 1, 12, 0, 0));
    const daysInMonth = new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0, 12, 0, 0)).getUTCDate();
    candidate.setUTCDate(Math.min(startDay, daysInMonth));
    if (candidate.getTime() > maxLimitMs) {
      if (!endStr && rawMax && dates.length < rawMax) {
        throw Object.assign(
          new Error('A quantidade de ocorrências informada ultrapassa o horizonte máximo de 5 anos.'),
          { status: 400, code: 'RECURRENCE_HORIZON_EXCEEDED' }
        );
      }
      break;
    }
    const ymd = formatYmd(candidate);
    if (ymd < startStr) continue;
    if (endStr && ymd > endStr) break;
    dates.push(ymd);
  }
  return dates;
}

export interface SchedulePlanEntryInput {
  classScheduleId?: string | null;
  scheduleId?: string | null;
  dayOfWeek: number;
  startClock?: string | null;
  startTime?: string | null;
  endClock?: string | null;
  endTime?: string | null;
  professionalId?: string | null;
  coInstructorIds?: string[] | null;
  roomId?: string | null;
  modality?: string | null;
}

export interface GeneratedSchedulePlanOccurrence {
  index: number;
  date: string;
  dayOfWeek: number;
  startClock: string;
  endClock: string;
  startIso: string;
  endIso: string;
  classScheduleId: string | null;
  professionalId: string | null;
  coInstructorIds: string[];
  roomId: string | null;
  modality: string | null;
}

function normalizeClockSec(raw: string, fallback = '09:00:00'): string {
  const clean = String(raw || '').trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(clean)) return clean;
  if (/^\d{2}:\d{2}$/.test(clean)) return `${clean}:00`;
  return fallback;
}

function addMinutesClockSec(clockSec: string, durationMinutes: number): string {
  const [h, m] = clockSec.slice(0, 5).split(':').map(Number);
  const total = Math.min(23 * 60 + 59, Math.max(0, (h || 0) * 60 + (m || 0) + Math.max(5, durationMinutes || 50)));
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}:00`;
}

export function generateSchedulePlanOccurrences(opts: {
  startDate: string;
  frequency: RecurrenceFrequency;
  intervalValue?: number | null;
  intervalUnit?: RecurrenceIntervalUnit | null;
  durationCode?: PlanDurationCode | null;
  endDate?: string | null;
  maxOccurrences?: number | null;
  weekdays?: number[];
  startClock?: string | null;
  endClock?: string | null;
  durationMinutes?: number;
  classScheduleId?: string | null;
  professionalId?: string | null;
  coInstructorIds?: string[] | null;
  roomId?: string | null;
  modality?: string | null;
  scheduleEntries?: SchedulePlanEntryInput[] | null;
  maxCap?: number;
}): {
  resolvedEndDate: string | null;
  occurrences: GeneratedSchedulePlanOccurrence[];
} {
  const startStr = String(opts.startDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr)) {
    throw Object.assign(new Error('Data inicial inválida para recorrência.'), { status: 400, code: 'INVALID_RECURRENCE_DATE' });
  }

  const maxCap = opts.maxCap || MAX_RECURRENCE_CAP;
  let endStr: string | null = opts.endDate ? String(opts.endDate).slice(0, 10) : null;
  if (!endStr && opts.durationCode && opts.durationCode !== 'count' && opts.durationCode !== 'custom_date' && opts.durationCode !== 'legacy_frequency') {
    endStr = resolvePlanDurationEndDate(startStr, opts.durationCode);
  }

  if (endStr && !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
    throw Object.assign(new Error('Data final inválida para recorrência.'), { status: 400, code: 'INVALID_RECURRENCE_DATE' });
  }
  if (endStr && endStr < startStr) {
    throw Object.assign(new Error('A data final da recorrência deve ser igual ou posterior à data inicial.'), { status: 400, code: 'INVALID_RECURRENCE_DATE' });
  }

  const rawMax = opts.maxOccurrences !== undefined && opts.maxOccurrences !== null ? Number(opts.maxOccurrences) : null;
  if (!endStr && (!rawMax || !Number.isInteger(rawMax) || rawMax < 1)) {
    throw Object.assign(new Error('Informe a duração do plano, a data final ou a quantidade de ocorrências para criar a série.'), { status: 400, code: 'RECURRENCE_BOUND_REQUIRED' });
  }
  if (rawMax !== null && (!Number.isInteger(rawMax) || rawMax < 1)) {
    throw Object.assign(new Error('A quantidade de ocorrências deve ser um número inteiro positivo.'), { status: 400, code: 'RECURRENCE_LIMIT_EXCEEDED' });
  }
  if (rawMax !== null && rawMax > maxCap) {
    throw Object.assign(
      new Error(`O limite máximo de ocorrências por série é ${maxCap}.`),
      { status: 400, code: 'RECURRENCE_LIMIT_EXCEEDED' }
    );
  }

  const startDate = parseYmd(startStr);
  if (endStr) {
    const endDateObj = parseYmd(endStr);
    const diffDays = Math.round((endDateObj.getTime() - startDate.getTime()) / 86400000);
    if (diffDays > MAX_RECURRENCE_SPAN_DAYS) {
      throw Object.assign(
        new Error('A data limite da recorrência não pode ultrapassar 5 anos a partir da data inicial.'),
        { status: 400, code: 'RECURRENCE_HORIZON_EXCEEDED' }
      );
    }
  }

  const durMins = Math.max(5, Number(opts.durationMinutes) || 50);
  const defaultStartClock = normalizeClockSec(opts.startClock || '09:00:00');
  const defaultEndClock = opts.endClock ? normalizeClockSec(opts.endClock) : addMinutesClockSec(defaultStartClock, durMins);

  const normalizedEntries: Array<{
    dayOfWeek: number;
    startClock: string;
    endClock: string;
    classScheduleId: string | null;
    professionalId: string | null;
    coInstructorIds: string[];
    roomId: string | null;
    modality: string | null;
  }> = [];

  if (Array.isArray(opts.scheduleEntries) && opts.scheduleEntries.length > 0) {
    const seenKeys = new Set<string>();
    for (const rawEntry of opts.scheduleEntries) {
      const dow = Number(rawEntry.dayOfWeek);
      if (!Number.isInteger(dow) || dow < 0 || dow > 6) continue;
      const entrySchedId = rawEntry.classScheduleId || rawEntry.scheduleId || null;
      const rawStartClock = rawEntry.startClock || rawEntry.startTime || defaultStartClock;
      const rawEndClock = rawEntry.endClock || rawEntry.endTime || null;
      const sc = normalizeClockSec(rawStartClock, defaultStartClock);
      const ec = rawEndClock ? normalizeClockSec(rawEndClock) : addMinutesClockSec(sc, durMins);
      const key = `${dow}|${sc.slice(0, 5)}|${entrySchedId || ''}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      normalizedEntries.push({
        dayOfWeek: dow,
        startClock: sc,
        endClock: ec,
        classScheduleId: entrySchedId ? String(entrySchedId) : (opts.classScheduleId ? String(opts.classScheduleId) : null),
        professionalId: rawEntry.professionalId ? String(rawEntry.professionalId) : (opts.professionalId ? String(opts.professionalId) : null),
        coInstructorIds: Array.isArray(rawEntry.coInstructorIds)
          ? rawEntry.coInstructorIds.map(String).filter(Boolean)
          : (Array.isArray(opts.coInstructorIds) ? opts.coInstructorIds.map(String).filter(Boolean) : []),
        roomId: rawEntry.roomId ? String(rawEntry.roomId) : (opts.roomId ? String(opts.roomId) : null),
        modality: rawEntry.modality ? String(rawEntry.modality) : (opts.modality ? String(opts.modality) : null)
      });
    }
    normalizedEntries.sort((a, b) => (a.dayOfWeek - b.dayOfWeek) || a.startClock.localeCompare(b.startClock));
  }

  if (normalizedEntries.length === 0) {
    const startWeekday = startDate.getUTCDay();
    const wds = Array.isArray(opts.weekdays) && opts.weekdays.length > 0
      ? Array.from(new Set(opts.weekdays.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))).sort((a, b) => a - b)
      : [startWeekday];
    for (const wd of wds) {
      normalizedEntries.push({
        dayOfWeek: wd,
        startClock: defaultStartClock,
        endClock: defaultEndClock,
        classScheduleId: opts.classScheduleId ? String(opts.classScheduleId) : null,
        professionalId: opts.professionalId ? String(opts.professionalId) : null,
        coInstructorIds: Array.isArray(opts.coInstructorIds) ? opts.coInstructorIds.map(String).filter(Boolean) : [],
        roomId: opts.roomId ? String(opts.roomId) : null,
        modality: opts.modality ? String(opts.modality) : null
      });
    }
  }

  const freq = (opts.frequency || 'weekly') as RecurrenceFrequency;
  const isScheduleCadence =
    freq === 'weekly' ||
    freq === 'biweekly' ||
    freq === 'custom_weekdays' ||
    (freq === 'custom_interval' && opts.intervalUnit === 'weeks');

  if (!isScheduleCadence) {
    // Fallback para séries legadas por intervalo de dias/meses ou custom_interval
    const dates = generateRecurrenceDates({
      startDate: startStr,
      frequency: freq,
      intervalValue: opts.intervalValue,
      intervalUnit: opts.intervalUnit,
      weekdays: normalizedEntries.map(e => e.dayOfWeek),
      endDate: endStr,
      maxOccurrences: rawMax
    });
    const entryByDow = new Map<number, typeof normalizedEntries[0]>();
    for (const e of normalizedEntries) {
      if (!entryByDow.has(e.dayOfWeek)) entryByDow.set(e.dayOfWeek, e);
    }
    const primaryTemplate = normalizedEntries[0];
    return {
      resolvedEndDate: endStr,
      occurrences: dates.map((d, idx) => {
        const dow = parseYmd(d).getUTCDay();
        const tpl = entryByDow.get(dow) || primaryTemplate;
        return {
          index: idx + 1,
          date: d,
          dayOfWeek: dow,
          startClock: tpl.startClock,
          endClock: tpl.endClock,
          startIso: `${d}T${tpl.startClock}`,
          endIso: `${d}T${tpl.endClock}`,
          classScheduleId: tpl.classScheduleId,
          professionalId: tpl.professionalId,
          coInstructorIds: [...tpl.coInstructorIds],
          roomId: tpl.roomId,
          modality: tpl.modality
        };
      })
    };
  }

  const maxLimitMs = startDate.getTime() + MAX_RECURRENCE_SPAN_DAYS * 86400000;
  const maxCount = rawMax ? Math.min(rawMax, maxCap) : maxCap;
  const weekStep =
    freq === 'biweekly'
      ? 2
      : (freq === 'custom_interval' && opts.intervalUnit === 'weeks' && opts.intervalValue
          ? Math.max(1, Number(opts.intervalValue))
          : 1);

  const startWeekday = startDate.getUTCDay();
  const startSunday = new Date(startDate.getTime());
  startSunday.setUTCDate(startSunday.getUTCDate() - startWeekday);

  const out: GeneratedSchedulePlanOccurrence[] = [];
  for (let weekIndex = 0; ; weekIndex += weekStep) {
    const blockStart = new Date(startSunday.getTime());
    blockStart.setUTCDate(startSunday.getUTCDate() + weekIndex * 7);
    if (blockStart.getTime() > maxLimitMs) {
      if (!endStr && rawMax && out.length < rawMax) {
        throw Object.assign(
          new Error('A quantidade de ocorrências informada ultrapassa o horizonte máximo de 5 anos.'),
          { status: 400, code: 'RECURRENCE_HORIZON_EXCEEDED' }
        );
      }
      break;
    }

    let exceededEndDate = false;
    for (const entry of normalizedEntries) {
      const candidate = new Date(startSunday.getTime());
      candidate.setUTCDate(startSunday.getUTCDate() + weekIndex * 7 + entry.dayOfWeek);
      const ymd = formatYmd(candidate);
      if (ymd < startStr) continue;
      if (endStr && ymd > endStr) {
        exceededEndDate = true;
        break;
      }
      if (candidate.getTime() > maxLimitMs) {
        if (!endStr && rawMax && out.length < rawMax) {
          throw Object.assign(
            new Error('A quantidade de ocorrências informada ultrapassa o horizonte máximo de 5 anos.'),
            { status: 400, code: 'RECURRENCE_HORIZON_EXCEEDED' }
          );
        }
        exceededEndDate = true;
        break;
      }

      if (out.length >= maxCount) {
        if (endStr && !rawMax) {
          throw Object.assign(
            new Error(`O período escolhido gera mais que o limite operacional seguro de ${maxCap} aulas por série. Reduza a duração da série ou divida em etapas.`),
            { status: 400, code: 'RECURRENCE_LIMIT_EXCEEDED' }
          );
        }
        exceededEndDate = true;
        break;
      }

      out.push({
        index: out.length + 1,
        date: ymd,
        dayOfWeek: entry.dayOfWeek,
        startClock: entry.startClock,
        endClock: entry.endClock,
        startIso: `${ymd}T${entry.startClock}`,
        endIso: `${ymd}T${entry.endClock}`,
        classScheduleId: entry.classScheduleId,
        professionalId: entry.professionalId,
        coInstructorIds: [...entry.coInstructorIds],
        roomId: entry.roomId,
        modality: entry.modality
      });

      if (rawMax && out.length >= rawMax) {
        break;
      }
    }

    if (exceededEndDate || (rawMax && out.length >= rawMax)) {
      break;
    }
  }

  return {
    resolvedEndDate: endStr,
    occurrences: out
  };
}

export interface GroupOccurrenceResolution {
  occurrenceId: string;
  capacity: number;
  enrolledBefore: number;
  roomId: string | null;
  isFirstEnrollment: boolean;
}

export function resolveOrCreateGroupOccurrenceTx(params: {
  tenantId: string;
  professionalId: string;
  serviceId: string;
  serviceName: string;
  defaultCapacity: number;
  startTime: string;
  endTime: string;
  roomId: string | null;
  modality: string;
  patientId: string;
  seriesId?: string | null;
  classScheduleId?: string | null;
  explicitOccurrenceId?: string | null;
  coInstructorIds?: string[] | null;
}): GroupOccurrenceResolution {
  const {
    tenantId,
    professionalId,
    serviceId,
    serviceName,
    defaultCapacity,
    startTime,
    endTime,
    roomId,
    modality,
    patientId,
    seriesId,
    classScheduleId,
    explicitOccurrenceId,
    coInstructorIds
  } = params;

  const cleanStart = startTime.slice(0, 16);
  const concreteModality = resolveConcreteModality({
    requestedModality: modality === 'both' ? undefined : modality,
    serviceModality: modality || 'presential',
    allowHome: true
  });

  let existingOcc: any = null;
  if (explicitOccurrenceId) {
    existingOcc = db.prepare(`
      SELECT * FROM class_occurrences
      WHERE id = ? AND tenant_id = ? AND status != 'cancelled'
    `).get(explicitOccurrenceId, tenantId);
  } else {
    if (classScheduleId) {
      existingOcc = db.prepare(`
        SELECT * FROM class_occurrences
        WHERE tenant_id = ?
          AND class_schedule_id = ?
          AND REPLACE(substr(start_time, 1, 16), ' ', 'T') = ?
          AND status != 'cancelled'
        ORDER BY created_at ASC
        LIMIT 1
      `).get(tenantId, classScheduleId, cleanStart);
    }
    if (!existingOcc) {
      existingOcc = db.prepare(`
        SELECT * FROM class_occurrences
        WHERE tenant_id = ?
          AND professional_id = ?
          AND service_id = ?
          AND REPLACE(substr(start_time, 1, 16), ' ', 'T') = ?
          AND status != 'cancelled'
        ORDER BY created_at ASC
        LIMIT 1
      `).get(tenantId, professionalId, serviceId, cleanStart);
    }
  }

  if (existingOcc && classScheduleId && !existingOcc.class_schedule_id) {
    db.prepare(`UPDATE class_occurrences SET class_schedule_id = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`)
      .run(classScheduleId, existingOcc.id, tenantId);
  }

  if (existingOcc) {
    const duplicate = db.prepare(`
      SELECT id FROM appointments
      WHERE tenant_id = ?
        AND occurrence_id = ?
        AND patient_id = ?
        AND status NOT IN ('cancelled')
      LIMIT 1
    `).get(tenantId, existingOcc.id, patientId) as any;

    if (duplicate) {
      throw Object.assign(new Error('Este aluno já está inscrito neste horário da turma.'), {
        status: 409,
        code: 'ALREADY_ENROLLED'
      });
    }

    const activeCount = (db.prepare(`
      SELECT COUNT(*) as c FROM appointments
      WHERE tenant_id = ? AND occurrence_id = ? AND status NOT IN ('cancelled')
    `).get(tenantId, existingOcc.id) as any)?.c || 0;

    const capacity = Math.max(1, Number(existingOcc.capacity) || defaultCapacity || 1);
    if (activeCount >= capacity) {
      throw Object.assign(new Error('Turma lotada: todas as vagas para este horário já foram preenchidas.'), {
        status: 409,
        code: 'CLASS_FULL',
        capacity,
        enrolledCount: activeCount
      });
    }

    // Se a sala ainda não estava vinculada à ocorrência e veio na nova reserva, verifica conflito de sala antes de associar
    const resolvedRoomId = existingOcc.room_id || roomId || null;
    if (!existingOcc.room_id && roomId) {
      const roomConflict = db.prepare(`
        SELECT a.id, r.name as room_name, p.name as professional_name
        FROM appointments a
        JOIN rooms r ON r.id = a.room_id
        JOIN professionals p ON p.id = a.professional_id
        WHERE a.tenant_id = ?
          AND a.room_id = ?
          AND COALESCE(a.occurrence_id, '') != ?
          AND a.status NOT IN ('cancelled')
          AND REPLACE(a.start_time, ' ', 'T') < ? AND REPLACE(a.end_time, ' ', 'T') > ?
        LIMIT 1
      `).get(tenantId, roomId, existingOcc.id, endTime, startTime) as any;
      if (roomConflict) {
        throw Object.assign(new Error(`A sala ${roomConflict.room_name} já está ocupada neste horário por ${roomConflict.professional_name}.`), {
          status: 409,
          code: 'ROOM_CONFLICT'
        });
      }
      db.prepare('UPDATE class_occurrences SET room_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(roomId, existingOcc.id);
    }

    try {
      InstructorParticipationService.syncOccurrenceParticipantsTx({
        tenantId,
        serviceId,
        occurrenceId: existingOcc.id,
        classScheduleId: classScheduleId || existingOcc.class_schedule_id || null,
        primaryProfessionalId: existingOcc.professional_id || professionalId,
        coInstructorIds: Array.isArray(coInstructorIds) ? coInstructorIds : undefined,
        source: 'booking_inherit',
        preserveExistingAttendance: true
      });
    } catch {
      // Preserve occurrence creation/join even if optional co-instructor sync finds an inactive entry
    }

    return {
      occurrenceId: existingOcc.id,
      capacity,
      enrolledBefore: activeCount,
      roomId: resolvedRoomId,
      isFirstEnrollment: activeCount === 0
    };
  }

  // Nova ocorrência coletiva: verifica se o profissional não possui conflito individual ou de outra turma neste horário
  const profConflict = db.prepare(`
    SELECT a.id, a.start_time, a.end_time, p.name as professional_name, s.name as service_name
    FROM appointments a
    JOIN professionals p ON p.id = a.professional_id
    LEFT JOIN services s ON s.id = a.service_id
    WHERE a.tenant_id = ?
      AND a.professional_id = ?
      AND a.status NOT IN ('cancelled')
      AND REPLACE(a.start_time, ' ', 'T') < ? AND REPLACE(a.end_time, ' ', 'T') > ?
    LIMIT 1
  `).get(tenantId, professionalId, endTime, startTime) as any;

  if (profConflict) {
    throw Object.assign(new Error('Este horário não está mais disponível para o profissional selecionado.'), {
      status: 409,
      code: 'PROFESSIONAL_SLOT_OCCUPIED'
    });
  }

  if (roomId) {
    const roomConflict = db.prepare(`
      SELECT a.id, r.name as room_name, p.name as professional_name
      FROM appointments a
      JOIN rooms r ON r.id = a.room_id
      JOIN professionals p ON p.id = a.professional_id
      WHERE a.tenant_id = ?
        AND a.room_id = ?
        AND a.status NOT IN ('cancelled')
        AND REPLACE(a.start_time, ' ', 'T') < ? AND REPLACE(a.end_time, ' ', 'T') > ?
      LIMIT 1
    `).get(tenantId, roomId, endTime, startTime) as any;

    if (roomConflict) {
      throw Object.assign(new Error(`A sala ${roomConflict.room_name} já está ocupada neste horário por ${roomConflict.professional_name}.`), {
        status: 409,
        code: 'ROOM_CONFLICT'
      });
    }
  }

  const occId = 'occ-' + uuidv4().slice(0, 8);
  const capacity = Math.max(1, Number(defaultCapacity) || 1);
  db.prepare(`
    INSERT INTO class_occurrences (
      id, tenant_id, series_id, class_schedule_id, service_id, professional_id, room_id,
      title, modality, start_time, end_time, capacity, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')
  `).run(
    occId,
    tenantId,
    seriesId || null,
    classScheduleId || null,
    serviceId,
    professionalId,
    roomId || null,
    serviceName,
    concreteModality,
    startTime,
    endTime,
    capacity
  );

  InstructorParticipationService.syncOccurrenceParticipantsTx({
    tenantId,
    serviceId,
    occurrenceId: occId,
    classScheduleId: classScheduleId || null,
    primaryProfessionalId: professionalId,
    coInstructorIds: Array.isArray(coInstructorIds) ? coInstructorIds : undefined,
    source: classScheduleId ? 'schedule_inherit' : 'booking_create',
    preserveExistingAttendance: true
  });

  return {
    occurrenceId: occId,
    capacity,
    enrolledBefore: 0,
    roomId: roomId || null,
    isFirstEnrollment: true
  };
}
