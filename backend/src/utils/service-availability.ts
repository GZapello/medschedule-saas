import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';

export type ServiceAvailabilityMode = 'professional_schedule' | 'custom_windows';

export interface ServiceAvailabilityWindow {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  professionalId?: string | null;
}

export interface TimeSegment {
  start: number;
  end: number;
}

export interface ServiceAvailabilityDiagnostics {
  hasIncompatibleWindows: boolean;
  warnings: string[];
  incompatibleWindowIds: string[];
}

const WEEKDAY_NAMES_PT = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado'
];

export function parseClockMinutes(clock: unknown): number | null {
  if (typeof clock !== 'string') return null;
  const clean = clock.trim();
  const m = clean.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return hh * 60 + mm;
}

export function subtractBreakFromSegments(
  segments: TimeSegment[],
  breakStart: number | null,
  breakEnd: number | null
): TimeSegment[] {
  if (breakStart === null || breakEnd === null || breakEnd <= breakStart) {
    return segments;
  }
  const result: TimeSegment[] = [];
  for (const seg of segments) {
    if (breakEnd <= seg.start || breakStart >= seg.end) {
      result.push(seg);
    } else {
      if (breakStart > seg.start) {
        result.push({ start: seg.start, end: Math.min(seg.end, breakStart) });
      }
      if (breakEnd < seg.end) {
        result.push({ start: Math.max(seg.start, breakEnd), end: seg.end });
      }
    }
  }
  return result;
}

export function intersectIntervalLists(a: TimeSegment[], b: TimeSegment[]): TimeSegment[] {
  if (!a.length || !b.length) return [];
  const result: TimeSegment[] = [];
  for (const segA of a) {
    for (const segB of b) {
      const start = Math.max(segA.start, segB.start);
      const end = Math.min(segA.end, segB.end);
      if (start < end) {
        result.push({ start, end });
      }
    }
  }
  result.sort((x, y) => x.start - y.start || x.end - y.end);
  return mergeAdjacentSegments(result);
}

export function mergeAdjacentSegments(segments: TimeSegment[]): TimeSegment[] {
  if (segments.length <= 1) return segments;
  const sorted = [...segments].sort((x, y) => x.start - y.start || x.end - y.end);
  const merged: TimeSegment[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = sorted[i];
    if (curr.start <= prev.end) {
      prev.end = Math.max(prev.end, curr.end);
    } else {
      merged.push({ ...curr });
    }
  }
  return merged;
}

export function getProfessionalScheduleSegmentsForDay(
  tenantId: string,
  professionalId: string,
  dayOfWeek: number
): TimeSegment[] {
  const rows = db
    .prepare(`
      SELECT start_time, end_time, break_start, break_end
      FROM schedules
      WHERE tenant_id = ? AND professional_id = ? AND day_of_week = ? AND is_active = 1
      ORDER BY start_time ASC
    `)
    .all(tenantId, professionalId, dayOfWeek) as Array<{
      start_time: string;
      end_time: string;
      break_start: string | null;
      break_end: string | null;
    }>;

  const segments: TimeSegment[] = [];
  for (const row of rows) {
    const start = parseClockMinutes(row.start_time);
    const end = parseClockMinutes(row.end_time);
    if (start === null || end === null || end <= start) continue;
    const bStart = row.break_start ? parseClockMinutes(row.break_start) : null;
    const bEnd = row.break_end ? parseClockMinutes(row.break_end) : null;
    segments.push(...subtractBreakFromSegments([{ start, end }], bStart, bEnd));
  }
  return mergeAdjacentSegments(segments);
}

export function isWindowCoveredByAnyProfessional(
  tenantId: string,
  professionalIds: string[],
  window: { dayOfWeek: number; startMin: number; endMin: number }
): boolean {
  const cleanProfIds = Array.from(new Set(professionalIds.filter(Boolean)));
  if (cleanProfIds.length === 0) return false;
  for (const profId of cleanProfIds) {
    const profSegs = getProfessionalScheduleSegmentsForDay(tenantId, profId, window.dayOfWeek);
    if (profSegs.some(seg => window.startMin >= seg.start && window.endMin <= seg.end)) {
      return true;
    }
  }
  return false;
}

export function normalizeAndValidateServiceAvailability(params: {
  tenantId: string;
  isStudioCompat: boolean;
  serviceDomain: 'clinical' | 'studio';
  serviceKind: 'individual' | 'group';
  professionalIds: string[];
  rawAvailabilityMode?: unknown;
  rawAvailabilityWindows?: unknown;
}): {
  availabilityMode: ServiceAvailabilityMode;
  windows: ServiceAvailabilityWindow[];
  shouldPersistWindows: boolean;
  error?: string;
} {
  const {
    tenantId,
    isStudioCompat,
    serviceDomain,
    serviceKind,
    professionalIds,
    rawAvailabilityMode,
    rawAvailabilityWindows
  } = params;

  const requestedModeStr = String(rawAvailabilityMode ?? 'professional_schedule').trim().toLowerCase();
  if (requestedModeStr !== 'professional_schedule' && requestedModeStr !== 'custom_windows') {
    return {
      availabilityMode: 'professional_schedule',
      windows: [],
      shouldPersistWindows: false,
      error: 'Modalidade de disponibilidade do serviço inválida.'
    };
  }

  const isEligibleStudioIndividual = isStudioCompat && serviceDomain === 'studio' && serviceKind === 'individual';
  if (requestedModeStr === 'custom_windows' && !isEligibleStudioIndividual) {
    return {
      availabilityMode: 'professional_schedule',
      windows: [],
      shouldPersistWindows: false,
      error: 'Horários específicos por serviço estão disponíveis somente para aulas individuais do Studio.'
    };
  }

  const availabilityMode: ServiceAvailabilityMode =
    isEligibleStudioIndividual && requestedModeStr === 'custom_windows'
      ? 'custom_windows'
      : 'professional_schedule';

  if (availabilityMode === 'professional_schedule') {
    // Preserva quaisquer faixas anteriores já salvas em service_availability_windows ao alternar para toda a grade
    return {
      availabilityMode: 'professional_schedule',
      windows: [],
      shouldPersistWindows: false
    };
  }

  if (!Array.isArray(rawAvailabilityWindows) || rawAvailabilityWindows.length === 0) {
    return {
      availabilityMode: 'custom_windows',
      windows: [],
      shouldPersistWindows: false,
      error: 'Adicione pelo menos uma faixa de horário para definir a disponibilidade específica do serviço.'
    };
  }

  const normalized: Array<ServiceAvailabilityWindow & { startMin: number; endMin: number }> = [];
  for (const item of rawAvailabilityWindows) {
    const dow = Number(item?.dayOfWeek ?? item?.day_of_week);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
      return {
        availabilityMode: 'custom_windows',
        windows: [],
        shouldPersistWindows: false,
        error: 'Dia da semana inválido nas faixas de disponibilidade.'
      };
    }
    const startRaw = String(item?.startTime ?? item?.start_time ?? '').trim().slice(0, 5);
    const endRaw = String(item?.endTime ?? item?.end_time ?? '').trim().slice(0, 5);
    const startMin = parseClockMinutes(startRaw);
    const endMin = parseClockMinutes(endRaw);

    if (startMin === null || endMin === null) {
      return {
        availabilityMode: 'custom_windows',
        windows: [],
        shouldPersistWindows: false,
        error: 'Informe horários válidos no formato HH:MM.'
      };
    }
    if (endMin <= startMin) {
      return {
        availabilityMode: 'custom_windows',
        windows: [],
        shouldPersistWindows: false,
        error: `O horário final (${endRaw}) deve ser posterior ao horário inicial (${startRaw}).`
      };
    }

    if (!isWindowCoveredByAnyProfessional(tenantId, professionalIds, { dayOfWeek: dow, startMin, endMin })) {
      return {
        availabilityMode: 'custom_windows',
        windows: [],
        shouldPersistWindows: false,
        error: `Este horário está fora da escala de trabalho do profissional (${WEEKDAY_NAMES_PT[dow]}, ${startRaw} às ${endRaw}).`
      };
    }

    normalized.push({
      id: typeof item?.id === 'string' && item.id.trim() ? item.id.trim() : undefined,
      dayOfWeek: dow,
      startTime: startRaw,
      endTime: endRaw,
      professionalId: typeof item?.professionalId === 'string' ? item.professionalId : (professionalIds[0] || null),
      startMin,
      endMin
    });
  }

  // Valida sobreposições por dia da semana
  const byDay = new Map<number, Array<typeof normalized[number]>>();
  for (const w of normalized) {
    const list = byDay.get(w.dayOfWeek) || [];
    list.push(w);
    byDay.set(w.dayOfWeek, list);
  }
  for (const [dow, list] of byDay.entries()) {
    list.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
    for (let i = 1; i < list.length; i++) {
      if (list[i].startMin < list[i - 1].endMin) {
        return {
          availabilityMode: 'custom_windows',
          windows: [],
          shouldPersistWindows: false,
          error: `Existem faixas de horários sobrepostas em ${WEEKDAY_NAMES_PT[dow]} (${list[i - 1].startTime}–${list[i - 1].endTime} e ${list[i].startTime}–${list[i].endTime}).`
        };
      }
    }
  }

  normalized.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMin - b.startMin);

  return {
    availabilityMode: 'custom_windows',
    windows: normalized.map(({ dayOfWeek, startTime, endTime, professionalId }) => ({
      dayOfWeek,
      startTime,
      endTime,
      professionalId: professionalId || null
    })),
    shouldPersistWindows: true
  };
}

export function listServiceAvailabilityWindows(
  tenantId: string,
  serviceId: string
): ServiceAvailabilityWindow[] {
  try {
    const rows = db
      .prepare(`
        SELECT id, day_of_week, start_time, end_time, professional_id
        FROM service_availability_windows
        WHERE tenant_id = ? AND service_id = ? AND active = 1
        ORDER BY day_of_week ASC, start_time ASC
      `)
      .all(tenantId, serviceId) as any[];
    return rows.map(r => ({
      id: r.id,
      dayOfWeek: Number(r.day_of_week),
      startTime: String(r.start_time || '').slice(0, 5),
      endTime: String(r.end_time || '').slice(0, 5),
      professionalId: r.professional_id || null
    }));
  } catch {
    return [];
  }
}

export function listServiceAvailabilityWindowsGrouped(
  tenantId: string
): Map<string, ServiceAvailabilityWindow[]> {
  const map = new Map<string, ServiceAvailabilityWindow[]>();
  try {
    const rows = db
      .prepare(`
        SELECT id, service_id, day_of_week, start_time, end_time, professional_id
        FROM service_availability_windows
        WHERE tenant_id = ? AND active = 1
        ORDER BY day_of_week ASC, start_time ASC
      `)
      .all(tenantId) as any[];
    for (const r of rows) {
      const list = map.get(r.service_id) || [];
      list.push({
        id: r.id,
        dayOfWeek: Number(r.day_of_week),
        startTime: String(r.start_time || '').slice(0, 5),
        endTime: String(r.end_time || '').slice(0, 5),
        professionalId: r.professional_id || null
      });
      map.set(r.service_id, list);
    }
  } catch {
    // silencioso se tabela ainda não existir
  }
  return map;
}

export function saveServiceAvailabilityWindowsTx(
  tenantId: string,
  serviceId: string,
  defaultProfessionalId: string | null,
  windows: ServiceAvailabilityWindow[]
): void {
  db.prepare(`DELETE FROM service_availability_windows WHERE tenant_id = ? AND service_id = ?`)
    .run(tenantId, serviceId);

  const insertStmt = db.prepare(`
    INSERT INTO service_availability_windows (
      id, tenant_id, service_id, professional_id, day_of_week, start_time, end_time, active, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
  `);

  for (const w of windows) {
    insertStmt.run(
      'saw-' + uuidv4().slice(0, 8),
      tenantId,
      serviceId,
      w.professionalId || defaultProfessionalId || null,
      w.dayOfWeek,
      w.startTime.slice(0, 5),
      w.endTime.slice(0, 5)
    );
  }
}

export function getServiceDayAvailabilitySegments(params: {
  tenantId: string;
  serviceId: string;
  dayOfWeek: number;
  overrideWindows?: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
}): TimeSegment[] {
  const source = params.overrideWindows
    ? params.overrideWindows.filter(w => Number(w.dayOfWeek) === Number(params.dayOfWeek))
    : listServiceAvailabilityWindows(params.tenantId, params.serviceId).filter(
        w => w.dayOfWeek === Number(params.dayOfWeek)
      );

  const segments: TimeSegment[] = [];
  for (const w of source) {
    const start = parseClockMinutes(w.startTime);
    const end = parseClockMinutes(w.endTime);
    if (start !== null && end !== null && end > start) {
      segments.push({ start, end });
    }
  }
  return mergeAdjacentSegments(segments);
}

export function diagnoseServiceAvailability(
  tenantId: string,
  professionalIds: string[],
  windows: ServiceAvailabilityWindow[]
): ServiceAvailabilityDiagnostics {
  if (!windows || windows.length === 0) {
    return { hasIncompatibleWindows: false, warnings: [], incompatibleWindowIds: [] };
  }
  const warnings: string[] = [];
  const incompatibleWindowIds: string[] = [];

  for (const w of windows) {
    const startMin = parseClockMinutes(w.startTime);
    const endMin = parseClockMinutes(w.endTime);
    if (startMin === null || endMin === null || endMin <= startMin) {
      if (w.id) incompatibleWindowIds.push(w.id);
      warnings.push(`${WEEKDAY_NAMES_PT[w.dayOfWeek]} (${w.startTime}–${w.endTime}) possui horário inválido.`);
      continue;
    }
    if (!isWindowCoveredByAnyProfessional(tenantId, professionalIds, { dayOfWeek: w.dayOfWeek, startMin, endMin })) {
      if (w.id) incompatibleWindowIds.push(w.id);
      warnings.push(
        `${WEEKDAY_NAMES_PT[w.dayOfWeek]} (${w.startTime}–${w.endTime}) está parcial ou totalmente fora da escala atual do profissional.`
      );
    }
  }

  return {
    hasIncompatibleWindows: warnings.length > 0,
    warnings,
    incompatibleWindowIds
  };
}
