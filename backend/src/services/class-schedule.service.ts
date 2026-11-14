import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';
import { ConcreteModality, resolveConcreteModality } from '../utils/modality-resolver';
import { calculateAvailableSlots } from '../utils/slot-calculator';
import {
  InstructorParticipationService,
  normalizeUniqueIds,
  ScheduleInstructorEntry
} from './instructor-participation.service';

export interface ClassScheduleRecord {
  id: string;
  tenant_id: string;
  service_id: string;
  professional_id: string;
  professional_name?: string;
  professional_avatar?: string | null;
  profession_name?: string | null;
  room_id: string | null;
  room_name?: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  capacity: number;
  modality: ConcreteModality;
  effective_start_date: string;
  effective_end_date: string | null;
  active: number;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  co_instructor_ids?: string[];
  co_instructors?: Array<{ professionalId: string; professionalName: string; role: 'primary' | 'co_instructor'; photoUrl?: string | null }>;
}

export interface StudioClassSlotItem {
  classScheduleId?: string | null;
  occurrenceId: string | null;
  date: string;
  dayOfWeek: number;
  time: string;
  endTimeClock: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  bufferMinutes: number;
  professionalId: string;
  professionalName: string;
  professionalAvatar: string | null;
  professionName: string;
  coInstructorIds?: string[];
  coInstructors?: Array<{ professionalId: string; professionalName: string; role: 'primary' | 'co_instructor'; photoUrl?: string | null }>;
  roomId: string | null;
  roomName: string | null;
  modality: ConcreteModality | null;
  serviceModality: string;
  allowedModalities: ConcreteModality[];
  serviceKind: 'individual' | 'group';
  capacity: number;
  enrolledCount: number;
  remainingSpots: number;
  isFull: boolean;
  statusLabel: string;
  unavailableReason?: string | null;
}

export interface ScheduleDiagnosticItem {
  scheduleId: string;
  dayOfWeek: number;
  dayLabel: string;
  timeRange: string;
  professionalId: string;
  professionalName: string;
  publishable: boolean;
  reasons: string[];
}

export interface ServiceScheduleDiagnostics {
  totalCount: number;
  activeCount: number;
  publishableCount: number;
  isPublicReady: boolean;
  blockers: string[];
  items: ScheduleDiagnosticItem[];
}

const WEEKDAY_PLURAL_LABELS = [
  'Domingos',
  'Segundas',
  'Terças',
  'Quartas',
  'Quintas',
  'Sextas',
  'Sábados'
];

const WEEKDAY_SINGULAR_LABELS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado'
];

export function todayBrazilYmd(refDate = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(refDate);
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0)).toISOString().slice(0, 10);
}

export function getDayOfWeekFromYmd(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

export function parseHHMMToMinutes(t: string): number {
  const clean = String(t || '').trim();
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(clean)) return -1;
  const [h, m] = clean.split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return -1;
  return h * 60 + m;
}

export function minutesToHHMM(min: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(min)));
  const h = Math.floor(clamped / 60).toString().padStart(2, '0');
  const m = (clamped % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function parseDateTimeToMinuteOfDay(dtStr: string, targetDateStr: string): number {
  if (!dtStr) return 0;
  const s = dtStr.trim().replace(' ', 'T');
  const datePart = s.substring(0, 10);
  if (datePart < targetDateStr) return 0;
  if (datePart > targetDateStr) return 24 * 60;
  const timePart = s.length >= 16 ? s.substring(11, 16) : s.substring(11);
  const [h, m] = timePart.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function checkClinicBusinessHours(
  tenantId: string,
  dayOfWeek: number,
  startMin: number,
  endMin: number
): { ok: boolean; reason?: string } {
  const tenantRow = db.prepare('SELECT business_hours_json FROM tenants WHERE id = ?').get(tenantId) as
    | { business_hours_json?: string | null }
    | undefined;
  if (!tenantRow?.business_hours_json) return { ok: true };

  try {
    const bhList = JSON.parse(tenantRow.business_hours_json);
    if (!Array.isArray(bhList)) return { ok: true };
    const found = bhList.find((bh: any) => Number(bh.dayOfWeek) === dayOfWeek);
    if (!found) return { ok: true };
    if (found.isOpen === false || found.active === false) {
      return { ok: false, reason: 'O estabelecimento não funciona neste dia da semana.' };
    }
    const openMin = found.startTime ? parseHHMMToMinutes(found.startTime) : 0;
    const closeMin = found.endTime ? parseHHMMToMinutes(found.endTime) : 24 * 60;
    if (openMin >= 0 && closeMin > openMin && (startMin < openMin || endMin > closeMin)) {
      return { ok: false, reason: 'Horário fora do funcionamento do estabelecimento.' };
    }
    if (found.breakStart && found.breakEnd) {
      const bStart = parseHHMMToMinutes(found.breakStart);
      const bEnd = parseHHMMToMinutes(found.breakEnd);
      if (bStart >= 0 && bEnd > bStart && startMin < bEnd && endMin > bStart) {
        return { ok: false, reason: 'Horário coincide com o intervalo de fechamento do estabelecimento.' };
      }
    }
  } catch {
    return { ok: true };
  }
  return { ok: true };
}

function checkInstructorGeneralSchedule(
  tenantId: string,
  professionalId: string,
  dayOfWeek: number,
  startMin: number,
  endMin: number
): { ok: boolean; reason?: string } {
  const shifts = db.prepare(`
    SELECT start_time, end_time, break_start, break_end
    FROM schedules
    WHERE tenant_id = ? AND professional_id = ? AND day_of_week = ? AND is_active = 1
    ORDER BY start_time ASC
  `).all(tenantId, professionalId, dayOfWeek) as Array<{
    start_time: string;
    end_time: string;
    break_start: string | null;
    break_end: string | null;
  }>;

  if (!shifts || shifts.length === 0) {
    return { ok: false, reason: 'O instrutor não possui expediente ativo neste dia da semana.' };
  }

  for (const s of shifts) {
    const sStart = parseHHMMToMinutes(s.start_time);
    const sEnd = parseHHMMToMinutes(s.end_time);
    if (sStart < 0 || sEnd <= sStart) continue;
    if (startMin >= sStart && endMin <= sEnd) {
      if (s.break_start && s.break_end) {
        const bStart = parseHHMMToMinutes(s.break_start);
        const bEnd = parseHHMMToMinutes(s.break_end);
        if (bStart >= 0 && bEnd > bStart && startMin < bEnd && endMin > bStart) {
          continue;
        }
      }
      return { ok: true };
    }
  }

  return { ok: false, reason: 'Horário da aula está fora da disponibilidade do instrutor.' };
}

export function buildWeeklyScheduleSummary(schedules: ClassScheduleRecord[]): Array<{
  weekdaysLabel: string;
  timeRange: string;
  professionalName: string;
  capacity: number;
  modality: ConcreteModality;
  roomName: string | null;
  text: string;
}> {
  const active = schedules.filter(s => Number(s.active) !== 0);
  if (active.length === 0) return [];

  const groups = new Map<
    string,
    {
      days: number[];
      startTime: string;
      endTime: string;
      professionalName: string;
      capacity: number;
      modality: ConcreteModality;
      roomName: string | null;
    }
  >();

  for (const s of active) {
    const key = `${s.start_time.slice(0, 5)}|${s.end_time.slice(0, 5)}|${s.professional_id}|${s.capacity}|${s.modality}|${s.room_id || ''}`;
    const current = groups.get(key);
    if (current) {
      if (!current.days.includes(Number(s.day_of_week))) {
        current.days.push(Number(s.day_of_week));
      }
    } else {
      groups.set(key, {
        days: [Number(s.day_of_week)],
        startTime: s.start_time.slice(0, 5),
        endTime: s.end_time.slice(0, 5),
        professionalName: s.professional_name || 'Instrutor',
        capacity: Number(s.capacity || 1),
        modality: s.modality,
        roomName: s.room_name || null
      });
    }
  }

  const orderIdx = (d: number) => (d === 0 ? 7 : d);
  const result: Array<{
    weekdaysLabel: string;
    timeRange: string;
    professionalName: string;
    capacity: number;
    modality: ConcreteModality;
    roomName: string | null;
    text: string;
  }> = [];

  for (const g of groups.values()) {
    const sortedDays = [...g.days].sort((a, b) => orderIdx(a) - orderIdx(b));
    const dayNames = sortedDays.map(d => WEEKDAY_PLURAL_LABELS[d] || `Dia ${d}`);
    const weekdaysLabel =
      dayNames.length === 1
        ? dayNames[0]
        : `${dayNames.slice(0, -1).join(', ')} e ${dayNames[dayNames.length - 1]}`;
    const timeRange = `${g.startTime} às ${g.endTime}`;
    result.push({
      weekdaysLabel,
      timeRange,
      professionalName: g.professionalName,
      capacity: g.capacity,
      modality: g.modality,
      roomName: g.roomName,
      text: `${weekdaysLabel} — ${timeRange}`
    });
  }

  return result;
}

export class ClassScheduleService {
  static hasAnySchedulesForService(tenantId: string, serviceId: string): boolean {
    const row = db
      .prepare('SELECT 1 FROM class_schedules WHERE tenant_id = ? AND service_id = ? LIMIT 1')
      .get(tenantId, serviceId);
    return Boolean(row);
  }

  static listForService(
    tenantId: string,
    serviceId: string,
    opts?: { includeInactive?: boolean; publicOnly?: boolean }
  ): ClassScheduleRecord[] {
    let extraWhere = '';
    if (!opts?.includeInactive) {
      extraWhere += ' AND cs.active = 1';
    }
    if (opts?.publicOnly) {
      extraWhere += ' AND p.active = 1 AND p.public_booking_enabled = 1';
    }

    const rows = db.prepare(`
      SELECT
        cs.*,
        p.name as professional_name,
        p.photo_url as professional_avatar,
        COALESCE(pr.name, p.profession_name, 'Instrutor') as profession_name,
        r.name as room_name
      FROM class_schedules cs
      JOIN professionals p ON p.id = cs.professional_id AND p.tenant_id = cs.tenant_id
      LEFT JOIN professions pr ON pr.id = p.profession_id
      LEFT JOIN rooms r ON r.id = cs.room_id AND r.tenant_id = cs.tenant_id
      WHERE cs.tenant_id = ? AND cs.service_id = ?
      ${extraWhere}
      ORDER BY CASE WHEN cs.day_of_week = 0 THEN 7 ELSE cs.day_of_week END ASC, cs.start_time ASC
    `).all(tenantId, serviceId) as ClassScheduleRecord[];

    const teamMap = InstructorParticipationService.getScheduleInstructorsMap(
      tenantId,
      rows.map(r => r.id)
    );
    return rows.map(r => {
      const co = (teamMap.get(r.id) || []).filter(m => m.role === 'co_instructor' && m.professionalId !== r.professional_id);
      return {
        ...r,
        co_instructor_ids: co.map(c => c.professionalId),
        co_instructors: co
      };
    });
  }

  static listByTenantGrouped(
    tenantId: string,
    opts?: { includeInactive?: boolean; publicOnly?: boolean }
  ): Map<string, ClassScheduleRecord[]> {
    let extraWhere = '';
    if (!opts?.includeInactive) {
      extraWhere += ' AND cs.active = 1';
    }
    if (opts?.publicOnly) {
      extraWhere += ' AND p.active = 1 AND p.public_booking_enabled = 1';
    }

    const rows = db.prepare(`
      SELECT
        cs.*,
        p.name as professional_name,
        p.photo_url as professional_avatar,
        COALESCE(pr.name, p.profession_name, 'Instrutor') as profession_name,
        r.name as room_name
      FROM class_schedules cs
      JOIN professionals p ON p.id = cs.professional_id AND p.tenant_id = cs.tenant_id
      LEFT JOIN professions pr ON pr.id = p.profession_id
      LEFT JOIN rooms r ON r.id = cs.room_id AND r.tenant_id = cs.tenant_id
      WHERE cs.tenant_id = ?
      ${extraWhere}
      ORDER BY CASE WHEN cs.day_of_week = 0 THEN 7 ELSE cs.day_of_week END ASC, cs.start_time ASC
    `).all(tenantId) as ClassScheduleRecord[];

    const teamMap = InstructorParticipationService.getScheduleInstructorsMap(
      tenantId,
      rows.map(r => r.id)
    );

    const map = new Map<string, ClassScheduleRecord[]>();
    for (const row of rows) {
      const co = (teamMap.get(row.id) || []).filter(m => m.role === 'co_instructor' && m.professionalId !== row.professional_id);
      const enriched: ClassScheduleRecord = {
        ...row,
        co_instructor_ids: co.map(c => c.professionalId),
        co_instructors: co
      };
      const list = map.get(row.service_id) || [];
      list.push(enriched);
      map.set(row.service_id, list);
    }
    return map;
  }

  static diagnoseServiceSchedules(
    tenantId: string,
    serviceId: string,
    prefetchedSchedules?: ClassScheduleRecord[]
  ): ServiceScheduleDiagnostics {
    const schedules = prefetchedSchedules ?? this.listForService(tenantId, serviceId, { includeInactive: true });
    if (schedules.length === 0) {
      return {
        totalCount: 0,
        activeCount: 0,
        publishableCount: 0,
        isPublicReady: false,
        blockers: [
          'Esta aula ainda não possui dias e horários cadastrados. Adicione pelo menos um horário para disponibilizá-la no agendamento online.'
        ],
        items: []
      };
    }

    const profIds = [...new Set(schedules.map(s => s.professional_id).filter(Boolean))];
    const profMap = new Map<string, { id: string; name: string; active: number; public_booking_enabled: number }>();
    if (profIds.length > 0) {
      const placeholders = profIds.map(() => '?').join(',');
      const profRows = db
        .prepare(`SELECT id, name, active, public_booking_enabled FROM professionals WHERE tenant_id = ? AND id IN (${placeholders})`)
        .all(tenantId, ...profIds) as any[];
      for (const p of profRows) {
        profMap.set(p.id, p);
      }
    }

    const todayStr = todayBrazilYmd();
    const blockerSet = new Set<string>();
    const items: ScheduleDiagnosticItem[] = [];
    let activeCount = 0;
    let publishableCount = 0;

    for (const s of schedules) {
      const isActive = Number(s.active) !== 0;
      if (isActive) activeCount++;

      const reasons: string[] = [];
      const dayLabel = WEEKDAY_SINGULAR_LABELS[Number(s.day_of_week)] || `Dia ${s.day_of_week}`;
      const timeRange = `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`;
      const prof = profMap.get(s.professional_id);
      const profName = prof?.name || s.professional_name || 'Instrutor';

      if (!isActive) {
        reasons.push('Horário pausado / inativo na grade semanal.');
      }
      if (!prof || Number(prof.active) !== 1) {
        reasons.push(`Instrutor (${profName}) está inativo no estabelecimento.`);
      } else if (Number(prof.public_booking_enabled) !== 1) {
        reasons.push(`Instrutor (${profName}) está com o agendamento público desativado.`);
      }

      const startMin = parseHHMMToMinutes(s.start_time);
      const endMin = parseHHMMToMinutes(s.end_time);
      if (startMin >= 0 && endMin > startMin) {
        const instrCheck = checkInstructorGeneralSchedule(tenantId, s.professional_id, Number(s.day_of_week), startMin, endMin);
        if (!instrCheck.ok) {
          reasons.push(`${dayLabel} ${timeRange}: fora da escala geral de atendimento de ${profName}.`);
        }
        const clinicCheck = checkClinicBusinessHours(tenantId, Number(s.day_of_week), startMin, endMin);
        if (!clinicCheck.ok) {
          reasons.push(`${dayLabel} ${timeRange}: fora do horário de funcionamento do estabelecimento.`);
        }
      }

      if (s.effective_end_date && s.effective_end_date < todayStr) {
        const [y, m, d] = s.effective_end_date.split('-');
        reasons.push(`Vigência encerrada em ${d}/${m}/${y}.`);
      }

      const publishable = reasons.length === 0;
      if (publishable) publishableCount++;
      for (const r of reasons) {
        blockerSet.add(r);
      }

      items.push({
        scheduleId: s.id,
        dayOfWeek: Number(s.day_of_week),
        dayLabel,
        timeRange,
        professionalId: s.professional_id,
        professionalName: profName,
        publishable,
        reasons
      });
    }

    return {
      totalCount: schedules.length,
      activeCount,
      publishableCount,
      isPublicReady: publishableCount > 0,
      blockers: [...blockerSet],
      items
    };
  }

  private static ensureInstructorLinkedToServiceTx(tenantId: string, professionalId: string, serviceRow: any): void {
    if (serviceRow.professional_id === professionalId) return;
    const exists = db
      .prepare('SELECT 1 FROM professional_services WHERE professional_id = ? AND service_id = ? LIMIT 1')
      .get(professionalId, serviceRow.id);
    if (!exists) {
      db.prepare(`
        INSERT INTO professional_services (id, professional_id, service_id, custom_price, custom_duration)
        VALUES (?, ?, ?, NULL, NULL)
      `).run('ps-' + uuidv4().slice(0, 8), professionalId, serviceRow.id);
    }
  }

  private static validateScheduleConflictTx(params: {
    tenantId: string;
    professionalId: string;
    roomId: string | null;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    effectiveStartDate: string;
    effectiveEndDate: string | null;
    excludeScheduleId?: string;
  }): void {
    const others = db.prepare(`
      SELECT cs.*, s.name as service_name, p.name as professional_name, r.name as room_name
      FROM class_schedules cs
      JOIN services s ON s.id = cs.service_id AND s.tenant_id = cs.tenant_id
      JOIN professionals p ON p.id = cs.professional_id AND p.tenant_id = cs.tenant_id
      LEFT JOIN rooms r ON r.id = cs.room_id AND r.tenant_id = cs.tenant_id
      WHERE cs.tenant_id = ?
        AND cs.day_of_week = ?
        AND cs.active = 1
        AND s.active = 1
        ${params.excludeScheduleId ? 'AND cs.id != ?' : ''}
    `).all(
      ...(params.excludeScheduleId
        ? [params.tenantId, params.dayOfWeek, params.excludeScheduleId]
        : [params.tenantId, params.dayOfWeek])
    ) as any[];

    const newEndBound = params.effectiveEndDate || '9999-12-31';

    for (const other of others) {
      const timeOverlaps = params.startTime < other.end_time && params.endTime > other.start_time;
      if (!timeOverlaps) continue;

      const otherEndBound = other.effective_end_date || '9999-12-31';
      const datesOverlap =
        params.effectiveStartDate <= otherEndBound && newEndBound >= other.effective_start_date;
      if (!datesOverlap) continue;

      if (other.professional_id === params.professionalId) {
        const dayName = WEEKDAY_SINGULAR_LABELS[params.dayOfWeek] || 'dia selecionado';
        throw Object.assign(
          new Error(
            `${other.professional_name} já possui outra turma (${other.service_name}) na ${dayName} das ${other.start_time.slice(0, 5)} às ${other.end_time.slice(0, 5)}.`
          ),
          { status: 409, code: 'CLASS_SCHEDULE_CONFLICT' }
        );
      }

      if (params.roomId && other.room_id && params.roomId === other.room_id) {
        const dayName = WEEKDAY_SINGULAR_LABELS[params.dayOfWeek] || 'dia selecionado';
        throw Object.assign(
          new Error(
            `A sala ${other.room_name || 'selecionada'} já está reservada para "${other.service_name}" na ${dayName} das ${other.start_time.slice(0, 5)} às ${other.end_time.slice(0, 5)}.`
          ),
          { status: 409, code: 'CLASS_SCHEDULE_ROOM_CONFLICT' }
        );
      }
    }
  }

  static createSchedules(
    tenantId: string,
    serviceId: string,
    payload: {
      weekdays?: number[];
      dayOfWeek?: number;
      startTime: string;
      endTime?: string;
      professionalId?: string;
      coInstructorIds?: unknown;
      co_instructor_ids?: unknown;
      roomId?: string | null;
      capacity?: number;
      modality?: string;
      effectiveStartDate?: string;
      effectiveEndDate?: string | null;
      notes?: string | null;
    },
    userId: string
  ): { created: ClassScheduleRecord[]; warnings: string[] } {
    const serviceRow = db.prepare(`
      SELECT id, tenant_id, professional_id, name, duration_minutes, modality,
             COALESCE(service_kind, 'individual') as service_kind, default_capacity, active
      FROM services
      WHERE id = ? AND tenant_id = ?
    `).get(serviceId, tenantId) as any;

    if (!serviceRow) {
      throw Object.assign(new Error('Serviço não encontrado neste estabelecimento.'), { status: 404 });
    }
    if (serviceRow.service_kind !== 'group') {
      throw Object.assign(
        new Error('A grade semanal de horários é destinada a serviços do tipo Aula coletiva / Turma.'),
        { status: 400 }
      );
    }

    const rawDays = Array.isArray(payload.weekdays) && payload.weekdays.length > 0
      ? payload.weekdays
      : (payload.dayOfWeek !== undefined ? [payload.dayOfWeek] : []);
    const days = Array.from(
      new Set(rawDays.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))
    );
    if (days.length === 0) {
      throw Object.assign(new Error('Selecione ao menos um dia da semana para a turma.'), { status: 400 });
    }

    const startTime = String(payload.startTime || '').trim().slice(0, 5);
    const startMin = parseHHMMToMinutes(startTime);
    if (startMin < 0) {
      throw Object.assign(new Error('Informe um horário de início válido (HH:MM).'), { status: 400 });
    }

    let endTime = payload.endTime ? String(payload.endTime).trim().slice(0, 5) : '';
    let endMin = endTime ? parseHHMMToMinutes(endTime) : startMin + Math.max(5, Number(serviceRow.duration_minutes) || 50);
    if (!endTime) {
      if (endMin >= 24 * 60) {
        throw Object.assign(new Error('O horário de término precisa estar no mesmo dia (até 23:59).'), { status: 400 });
      }
      endTime = minutesToHHMM(endMin);
    }
    if (endMin <= startMin) {
      throw Object.assign(new Error('O horário de término deve ser posterior ao horário de início.'), { status: 400 });
    }

    const profId = String(payload.professionalId || serviceRow.professional_id || '').trim();
    const prof = db
      .prepare('SELECT id, name, active FROM professionals WHERE id = ? AND tenant_id = ? AND active = 1')
      .get(profId, tenantId) as any;
    if (!prof) {
      throw Object.assign(new Error('Selecione um instrutor ativo deste estabelecimento.'), { status: 400 });
    }

    const roomId = payload.roomId ? String(payload.roomId).trim() : null;
    if (roomId) {
      const room = db
        .prepare('SELECT id FROM rooms WHERE id = ? AND tenant_id = ? AND active = 1')
        .get(roomId, tenantId);
      if (!room) {
        throw Object.assign(new Error('Sala selecionada não encontrada ou inativa neste estabelecimento.'), { status: 400 });
      }
    }

    const capacity = Number(payload.capacity ?? serviceRow.default_capacity ?? 1);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) {
      throw Object.assign(new Error('Informe uma capacidade válida (número inteiro entre 1 e 500).'), { status: 400 });
    }

    const concreteModality = resolveConcreteModality({
      serviceModality: serviceRow.modality,
      requestedModality: payload.modality,
      allowHome: true
    });

    const effStart = payload.effectiveStartDate
      ? String(payload.effectiveStartDate).slice(0, 10)
      : todayBrazilYmd();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effStart)) {
      throw Object.assign(new Error('Data inicial de vigência inválida.'), { status: 400 });
    }
    const effEnd = payload.effectiveEndDate ? String(payload.effectiveEndDate).slice(0, 10) : null;
    if (effEnd && (!/^\d{4}-\d{2}-\d{2}$/.test(effEnd) || effEnd < effStart)) {
      throw Object.assign(new Error('A data final da vigência deve ser igual ou posterior à data inicial.'), { status: 400 });
    }

    const rawCoIds = payload.coInstructorIds !== undefined ? payload.coInstructorIds : payload.co_instructor_ids;
    const coInstructorIds = normalizeUniqueIds(rawCoIds, profId);
    InstructorParticipationService.validateTenantProfessionals(tenantId, [profId, ...coInstructorIds]);

    const warnings: string[] = [];
    const createdIds: string[] = [];

    db.transaction(() => {
      this.ensureInstructorLinkedToServiceTx(tenantId, profId, serviceRow);
      for (const coId of coInstructorIds) {
        this.ensureInstructorLinkedToServiceTx(tenantId, coId, serviceRow);
      }

      for (const dow of days) {
        this.validateScheduleConflictTx({
          tenantId,
          professionalId: profId,
          roomId,
          dayOfWeek: dow,
          startTime,
          endTime,
          effectiveStartDate: effStart,
          effectiveEndDate: effEnd
        });

        const schedCheck = checkInstructorGeneralSchedule(tenantId, profId, dow, startMin, endMin);
        if (!schedCheck.ok) {
          const dayLabel = WEEKDAY_SINGULAR_LABELS[dow] || `Dia ${dow}`;
          warnings.push(`${dayLabel} (${startTime}–${endTime}): a escala geral de ${prof.name} ainda não cobre este horário.`);
        }

        const id = 'cs-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO class_schedules (
            id, tenant_id, service_id, professional_id, room_id, day_of_week,
            start_time, end_time, capacity, modality, effective_start_date, effective_end_date,
            active, notes, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(
          id,
          tenantId,
          serviceId,
          profId,
          roomId,
          dow,
          startTime,
          endTime,
          capacity,
          concreteModality,
          effStart,
          effEnd,
          payload.notes ? String(payload.notes).trim() : null,
          userId
        );
        InstructorParticipationService.syncScheduleInstructorsTx({
          tenantId,
          scheduleId: id,
          primaryProfessionalId: profId,
          coInstructorIds
        });
        createdIds.push(id);
      }
    })();

    const all = this.listForService(tenantId, serviceId, { includeInactive: true });
    return {
      created: all.filter(c => createdIds.includes(c.id)),
      warnings
    };
  }

  static updateSchedule(
    tenantId: string,
    serviceId: string,
    scheduleId: string,
    payload: {
      dayOfWeek?: number;
      startTime?: string;
      endTime?: string;
      professionalId?: string;
      coInstructorIds?: unknown;
      co_instructor_ids?: unknown;
      roomId?: string | null;
      capacity?: number;
      modality?: string;
      effectiveStartDate?: string;
      effectiveEndDate?: string | null;
      active?: boolean | number;
      notes?: string | null;
    }
  ): { schedule: ClassScheduleRecord; warnings: string[] } {
    const existing = db
      .prepare('SELECT * FROM class_schedules WHERE id = ? AND service_id = ? AND tenant_id = ?')
      .get(scheduleId, serviceId, tenantId) as ClassScheduleRecord | undefined;
    if (!existing) {
      throw Object.assign(new Error('Horário da grade não encontrado.'), { status: 404 });
    }

    const serviceRow = db
      .prepare('SELECT id, professional_id, name, duration_minutes, modality, default_capacity FROM services WHERE id = ? AND tenant_id = ?')
      .get(serviceId, tenantId) as any;
    if (!serviceRow) {
      throw Object.assign(new Error('Serviço não encontrado.'), { status: 404 });
    }

    const nextDow = payload.dayOfWeek !== undefined ? Number(payload.dayOfWeek) : Number(existing.day_of_week);
    if (!Number.isInteger(nextDow) || nextDow < 0 || nextDow > 6) {
      throw Object.assign(new Error('Dia da semana inválido.'), { status: 400 });
    }

    const nextStart = payload.startTime !== undefined ? String(payload.startTime).trim().slice(0, 5) : existing.start_time.slice(0, 5);
    const nextEnd = payload.endTime !== undefined ? String(payload.endTime).trim().slice(0, 5) : existing.end_time.slice(0, 5);
    const startMin = parseHHMMToMinutes(nextStart);
    const endMin = parseHHMMToMinutes(nextEnd);
    if (startMin < 0 || endMin <= startMin) {
      throw Object.assign(new Error('Informe horário de início e término válidos (término posterior ao início).'), { status: 400 });
    }

    const nextProfId = payload.professionalId !== undefined ? String(payload.professionalId).trim() : existing.professional_id;
    const prof = db
      .prepare('SELECT id, name, active FROM professionals WHERE id = ? AND tenant_id = ? AND active = 1')
      .get(nextProfId, tenantId) as any;
    if (!prof) {
      throw Object.assign(new Error('Selecione um instrutor ativo deste estabelecimento.'), { status: 400 });
    }

    const nextRoomId = payload.roomId !== undefined ? (payload.roomId ? String(payload.roomId).trim() : null) : existing.room_id;
    if (nextRoomId) {
      const room = db.prepare('SELECT id FROM rooms WHERE id = ? AND tenant_id = ? AND active = 1').get(nextRoomId, tenantId);
      if (!room) {
        throw Object.assign(new Error('Sala selecionada não encontrada ou inativa.'), { status: 400 });
      }
    }

    const nextCapacity = payload.capacity !== undefined ? Number(payload.capacity) : Number(existing.capacity);
    if (!Number.isInteger(nextCapacity) || nextCapacity < 1 || nextCapacity > 500) {
      throw Object.assign(new Error('Capacidade deve ser um inteiro entre 1 e 500.'), { status: 400 });
    }

    const nextModality = resolveConcreteModality({
      serviceModality: serviceRow.modality,
      requestedModality: payload.modality !== undefined ? payload.modality : existing.modality,
      allowHome: true
    });

    const nextEffStart = payload.effectiveStartDate !== undefined
      ? String(payload.effectiveStartDate).slice(0, 10)
      : existing.effective_start_date;
    const nextEffEnd = payload.effectiveEndDate !== undefined
      ? (payload.effectiveEndDate ? String(payload.effectiveEndDate).slice(0, 10) : null)
      : existing.effective_end_date;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextEffStart)) {
      throw Object.assign(new Error('Data inicial de vigência inválida.'), { status: 400 });
    }
    if (nextEffEnd && (!/^\d{4}-\d{2}-\d{2}$/.test(nextEffEnd) || nextEffEnd < nextEffStart)) {
      throw Object.assign(new Error('A data final da vigência deve ser igual ou posterior à inicial.'), { status: 400 });
    }

    const nextActive = payload.active !== undefined ? (payload.active === false || payload.active === 0 ? 0 : 1) : existing.active;
    const rawCoIds = payload.coInstructorIds !== undefined ? payload.coInstructorIds : payload.co_instructor_ids;
    const hasExplicitCoIds = rawCoIds !== undefined;
    const nextCoIds = hasExplicitCoIds
      ? normalizeUniqueIds(rawCoIds, nextProfId)
      : InstructorParticipationService.getScheduleCoInstructorIds(tenantId, scheduleId, nextProfId);
    InstructorParticipationService.validateTenantProfessionals(tenantId, [nextProfId, ...nextCoIds]);

    const warnings: string[] = [];

    db.transaction(() => {
      this.ensureInstructorLinkedToServiceTx(tenantId, nextProfId, serviceRow);
      for (const coId of nextCoIds) {
        this.ensureInstructorLinkedToServiceTx(tenantId, coId, serviceRow);
      }

      if (nextActive === 1) {
        this.validateScheduleConflictTx({
          tenantId,
          professionalId: nextProfId,
          roomId: nextRoomId,
          dayOfWeek: nextDow,
          startTime: nextStart,
          endTime: nextEnd,
          effectiveStartDate: nextEffStart,
          effectiveEndDate: nextEffEnd,
          excludeScheduleId: scheduleId
        });
        const schedCheck = checkInstructorGeneralSchedule(tenantId, nextProfId, nextDow, startMin, endMin);
        if (!schedCheck.ok) {
          const dayLabel = WEEKDAY_SINGULAR_LABELS[nextDow] || `Dia ${nextDow}`;
          warnings.push(`${dayLabel} (${nextStart}–${nextEnd}): a escala geral de ${prof.name} ainda não cobre este horário.`);
        }
      }

      db.prepare(`
        UPDATE class_schedules
        SET professional_id = ?,
            room_id = ?,
            day_of_week = ?,
            start_time = ?,
            end_time = ?,
            capacity = ?,
            modality = ?,
            effective_start_date = ?,
            effective_end_date = ?,
            active = ?,
            notes = CASE WHEN ? = 1 THEN ? ELSE notes END,
            updated_at = datetime('now')
        WHERE id = ? AND service_id = ? AND tenant_id = ?
      `).run(
        nextProfId,
        nextRoomId,
        nextDow,
        nextStart,
        nextEnd,
        nextCapacity,
        nextModality,
        nextEffStart,
        nextEffEnd,
        nextActive,
        payload.notes !== undefined ? 1 : 0,
        payload.notes ? String(payload.notes).trim() : null,
        scheduleId,
        serviceId,
        tenantId
      );

      if (hasExplicitCoIds || nextProfId !== existing.professional_id) {
        InstructorParticipationService.syncScheduleInstructorsTx({
          tenantId,
          scheduleId,
          primaryProfessionalId: nextProfId,
          coInstructorIds: nextCoIds
        });
      }
    })();

    const updated = this.listForService(tenantId, serviceId, { includeInactive: true }).find(s => s.id === scheduleId)!;
    return { schedule: updated, warnings };
  }

  static deleteOrDeactivateSchedule(
    tenantId: string,
    serviceId: string,
    scheduleId: string
  ): { action: 'deleted' | 'deactivated'; message: string } {
    const existing = db
      .prepare('SELECT id FROM class_schedules WHERE id = ? AND service_id = ? AND tenant_id = ?')
      .get(scheduleId, serviceId, tenantId);
    if (!existing) {
      throw Object.assign(new Error('Horário da grade não encontrado.'), { status: 404 });
    }

    const linkedOcc = db
      .prepare('SELECT 1 FROM class_occurrences WHERE tenant_id = ? AND class_schedule_id = ? LIMIT 1')
      .get(tenantId, scheduleId);

    if (linkedOcc) {
      db.prepare("UPDATE class_schedules SET active = 0, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?")
        .run(scheduleId, tenantId);
      return {
        action: 'deactivated',
        message: 'Horário desativado para novas reservas. Ocorrências e histórico anteriores foram preservados.'
      };
    }

    db.prepare('DELETE FROM class_schedules WHERE id = ? AND tenant_id = ?').run(scheduleId, tenantId);
    return {
      action: 'deleted',
      message: 'Horário removido da grade semanal.'
    };
  }

  /**
   * Avalia uma entrada de class_schedules em uma data específica YYYY-MM-DD,
   * verificando feriado, expediente do estabelecimento, disponibilidade do instrutor,
   * bloqueios, conflito de sala/agenda, ocorrência cancelada e vagas reais.
   */
  static evaluateClassScheduleSlot(params: {
    tenantId: string;
    schedule: ClassScheduleRecord;
    serviceRow: any;
    dateStr: string;
    externalBusyIntervals?: Array<{ startMin: number; endMin: number }>;
    patientId?: string;
    ignoreLeadTime?: boolean;
    ignoreAdvanceCap?: boolean;
    publicOnly?: boolean;
    mockNow?: Date;
  }): {
    eligibleForDate: boolean;
    bookable: boolean;
    reasonCode?: string;
    reasonMessage?: string;
    slot: StudioClassSlotItem;
  } {
    const { tenantId, schedule, serviceRow, dateStr } = params;
    const referenceDate = params.mockNow || new Date();
    const todayStr = todayBrazilYmd(referenceDate);

    const startHHMM = schedule.start_time.slice(0, 5);
    const endHHMM = schedule.end_time.slice(0, 5);
    const startMin = parseHHMMToMinutes(startHHMM);
    const endMin = parseHHMMToMinutes(endHHMM);
    const startTimeIso = `${dateStr}T${startHHMM}:00`;
    const endTimeIso = `${dateStr}T${endHHMM}:00`;
    const durationMinutes = Math.max(5, endMin - startMin);
    const dow = getDayOfWeekFromYmd(dateStr);

    const allowedModalities = getAllowedModalitiesSafe(serviceRow.modality, schedule.modality);

    const baseSlot: StudioClassSlotItem = {
      classScheduleId: schedule.id,
      occurrenceId: null,
      date: dateStr,
      dayOfWeek: dow,
      time: startHHMM,
      endTimeClock: endHHMM,
      startTime: startTimeIso,
      endTime: endTimeIso,
      durationMinutes,
      bufferMinutes: 0,
      professionalId: schedule.professional_id,
      professionalName: schedule.professional_name || 'Instrutor',
      professionalAvatar: schedule.professional_avatar || null,
      professionName: schedule.profession_name || 'Instrutor',
      coInstructorIds: schedule.co_instructor_ids || [],
      coInstructors: schedule.co_instructors || [],
      roomId: schedule.room_id || null,
      roomName: schedule.room_name || null,
      modality: schedule.modality,
      serviceModality: String(serviceRow.modality || 'presential'),
      allowedModalities,
      serviceKind: 'group',
      capacity: Math.max(1, Number(schedule.capacity) || Number(serviceRow.default_capacity) || 1),
      enrolledCount: 0,
      remainingSpots: 0,
      isFull: false,
      statusLabel: ''
    };

    if (
      Number(schedule.day_of_week) !== dow ||
      Number(schedule.active) !== 1 ||
      dateStr < schedule.effective_start_date ||
      (schedule.effective_end_date && dateStr > schedule.effective_end_date)
    ) {
      return {
        eligibleForDate: false,
        bookable: false,
        reasonCode: 'NOT_SCHEDULED_ON_DATE',
        reasonMessage: 'Não há aula programada para esta data na grade semanal.',
        slot: baseSlot
      };
    }

    if (dateStr < todayStr) {
      return {
        eligibleForDate: false,
        bookable: false,
        reasonCode: 'PAST_DATE',
        reasonMessage: 'Data no passado.',
        slot: baseSlot
      };
    }

    const [tY, tM, tD] = todayStr.split('-').map(Number);
    const [y, m, d] = dateStr.split('-').map(Number);
    const todayOnly = new Date(tY, tM - 1, tD);
    const targetOnly = new Date(y, m - 1, d);
    const maxDate = new Date(todayOnly);
    maxDate.setDate(maxDate.getDate() + (Number(serviceRow.max_advance_days) || 60));
    if (!params.ignoreAdvanceCap && targetOnly > maxDate) {
      return {
        eligibleForDate: false,
        bookable: false,
        reasonCode: 'BEYOND_MAX_ADVANCE',
        reasonMessage: 'Data fora do limite máximo de antecedência.',
        slot: baseSlot
      };
    }

    // Antecedência mínima
    const rawLead = serviceRow.min_lead_time_hours !== undefined && serviceRow.min_lead_time_hours !== null
      ? Number(serviceRow.min_lead_time_hours)
      : 0;
    const minLeadHours = params.ignoreLeadTime ? 0 : Math.max(0, rawLead);
    const slotStartMs = Date.parse(`${startTimeIso}-03:00`);
    const minAllowedMs = referenceDate.getTime() + minLeadHours * 3600000;
    if (Number.isFinite(slotStartMs) && slotStartMs < minAllowedMs) {
      return {
        eligibleForDate: false,
        bookable: false,
        reasonCode: 'LEAD_TIME_NOT_MET',
        reasonMessage: 'Horário já encerrado para agendamento online.',
        slot: baseSlot
      };
    }

    // Feriado
    const holiday = db
      .prepare('SELECT name FROM holidays WHERE date = ? AND (tenant_id = ? OR is_national = 1) AND active = 1 LIMIT 1')
      .get(dateStr, tenantId) as { name?: string } | undefined;
    if (holiday) {
      return {
        eligibleForDate: true,
        bookable: false,
        reasonCode: 'HOLIDAY',
        reasonMessage: `Feriado cadastrado (${holiday.name || dateStr}).`,
        slot: { ...baseSlot, statusLabel: 'Feriado', unavailableReason: holiday.name || 'Feriado' }
      };
    }

    // Expediente do estabelecimento
    const clinicCheck = checkClinicBusinessHours(tenantId, dow, startMin, endMin);
    if (!clinicCheck.ok) {
      return {
        eligibleForDate: true,
        bookable: false,
        reasonCode: 'CLINIC_CLOSED',
        reasonMessage: clinicCheck.reason,
        slot: { ...baseSlot, statusLabel: 'Estabelecimento fechado', unavailableReason: clinicCheck.reason }
      };
    }

    // Instrutor ativo (e público se publicOnly)
    const profRow = db
      .prepare('SELECT id, active, public_booking_enabled FROM professionals WHERE id = ? AND tenant_id = ?')
      .get(schedule.professional_id, tenantId) as any;
    if (!profRow || profRow.active !== 1 || (params.publicOnly && profRow.public_booking_enabled !== 1)) {
      return {
        eligibleForDate: false,
        bookable: false,
        reasonCode: 'INSTRUCTOR_UNAVAILABLE',
        reasonMessage: 'Instrutor indisponível para agendamento.',
        slot: baseSlot
      };
    }

    // Disponibilidade geral do instrutor como restrição adicional
    const instrCheck = checkInstructorGeneralSchedule(tenantId, schedule.professional_id, dow, startMin, endMin);
    if (!instrCheck.ok) {
      return {
        eligibleForDate: false,
        bookable: false,
        reasonCode: 'INSTRUCTOR_SCHEDULE_CLOSED',
        reasonMessage: instrCheck.reason,
        slot: baseSlot
      };
    }

    // Bloqueios de agenda (do instrutor ou gerais)
    const rawBlocked = db.prepare(`
      SELECT start_datetime, end_datetime FROM blocked_times
      WHERE tenant_id = ?
        AND (professional_id = ? OR professional_id IS NULL)
        AND REPLACE(start_datetime, ' ', 'T') <= ?
        AND REPLACE(end_datetime, ' ', 'T') >= ?
    `).all(tenantId, schedule.professional_id, `${dateStr}T23:59:59`, `${dateStr}T00:00:00`) as Array<{
      start_datetime: string;
      end_datetime: string;
    }>;

    for (const blk of rawBlocked) {
      const bStart = parseDateTimeToMinuteOfDay(blk.start_datetime, dateStr);
      const bEnd = parseDateTimeToMinuteOfDay(blk.end_datetime, dateStr);
      if (startMin < bEnd && endMin > bStart) {
        return {
          eligibleForDate: true,
          bookable: false,
          reasonCode: 'BLOCKED_TIME',
          reasonMessage: 'Horário bloqueado na agenda do instrutor.',
          slot: { ...baseSlot, statusLabel: 'Bloqueado', unavailableReason: 'Horário bloqueado na agenda' }
        };
      }
    }

    // Google Calendar ocupado
    if (params.externalBusyIntervals && params.externalBusyIntervals.length > 0) {
      for (const ext of params.externalBusyIntervals) {
        if (startMin < ext.endMin && endMin > ext.startMin) {
          return {
            eligibleForDate: false,
            bookable: false,
            reasonCode: 'GOOGLE_BUSY',
            reasonMessage: 'Instrutor indisponível neste horário.',
            slot: baseSlot
          };
        }
      }
    }

    // Ocorrência existente para esta turma/horário (por class_schedule_id ou chave clássica)
    const cleanStart = startTimeIso.slice(0, 16);
    let occ = db.prepare(`
      SELECT o.*
      FROM class_occurrences o
      WHERE o.tenant_id = ?
        AND o.class_schedule_id = ?
        AND REPLACE(substr(o.start_time, 1, 16), ' ', 'T') = ?
      ORDER BY o.created_at DESC
      LIMIT 1
    `).get(tenantId, schedule.id, cleanStart) as any;

    if (!occ) {
      occ = db.prepare(`
        SELECT o.*
        FROM class_occurrences o
        WHERE o.tenant_id = ?
          AND o.service_id = ?
          AND o.professional_id = ?
          AND REPLACE(substr(o.start_time, 1, 16), ' ', 'T') = ?
        ORDER BY o.created_at DESC
        LIMIT 1
      `).get(tenantId, schedule.service_id, schedule.professional_id, cleanStart) as any;
    }

    if (occ && occ.status === 'cancelled') {
      return {
        eligibleForDate: true,
        bookable: false,
        reasonCode: 'OCCURRENCE_CANCELLED',
        reasonMessage: 'Esta aula foi cancelada para esta data.',
        slot: { ...baseSlot, occurrenceId: occ.id, statusLabel: 'Aula cancelada', unavailableReason: 'Aula cancelada nesta data' }
      };
    }

    const occId = occ ? occ.id : null;

    // Conflitos de agenda com outros atendimentos do instrutor (fora desta mesma ocorrência)
    const profConflict = db.prepare(`
      SELECT a.id FROM appointments a
      WHERE a.tenant_id = ?
        AND a.professional_id = ?
        AND (? IS NULL OR COALESCE(a.occurrence_id, '') != ?)
        AND a.status NOT IN ('cancelled')
        AND REPLACE(a.start_time, ' ', 'T') < ?
        AND REPLACE(a.end_time, ' ', 'T') > ?
      LIMIT 1
    `).get(tenantId, schedule.professional_id, occId, occId, endTimeIso, startTimeIso);

    if (profConflict) {
      return {
        eligibleForDate: false,
        bookable: false,
        reasonCode: 'PROFESSIONAL_CONFLICT',
        reasonMessage: 'Instrutor já possui outro atendimento neste horário.',
        slot: baseSlot
      };
    }

    // Conflito de sala física
    const effectiveRoomId = occ?.room_id || schedule.room_id || null;
    if (effectiveRoomId) {
      const roomConflict = db.prepare(`
        SELECT a.id, r.name as room_name FROM appointments a
        LEFT JOIN rooms r ON r.id = a.room_id
        WHERE a.tenant_id = ?
          AND a.room_id = ?
          AND (? IS NULL OR COALESCE(a.occurrence_id, '') != ?)
          AND a.status NOT IN ('cancelled')
          AND REPLACE(a.start_time, ' ', 'T') < ?
          AND REPLACE(a.end_time, ' ', 'T') > ?
        LIMIT 1
      `).get(tenantId, effectiveRoomId, occId, occId, endTimeIso, startTimeIso) as any;

      if (roomConflict) {
        return {
          eligibleForDate: false,
          bookable: false,
          reasonCode: 'ROOM_CONFLICT',
          reasonMessage: `Sala ${roomConflict.room_name || ''} indisponível neste horário.`,
          slot: baseSlot
        };
      }
    }

    const capacity = Math.max(1, Number(occ?.capacity) || Number(schedule.capacity) || Number(serviceRow.default_capacity) || 1);
    const enrolledCount = occId
      ? Number(
          (
            db.prepare(`
              SELECT COUNT(*) as c FROM appointments
              WHERE tenant_id = ? AND occurrence_id = ? AND status NOT IN ('cancelled')
            `).get(tenantId, occId) as any
          )?.c || 0
        )
      : 0;
    const remainingSpots = Math.max(0, capacity - enrolledCount);
    const isFull = remainingSpots <= 0;

    if (params.patientId && occId) {
      const dup = db.prepare(`
        SELECT id FROM appointments
        WHERE tenant_id = ? AND occurrence_id = ? AND patient_id = ? AND status NOT IN ('cancelled')
        LIMIT 1
      `).get(tenantId, occId, params.patientId);
      if (dup) {
        return {
          eligibleForDate: true,
          bookable: false,
          reasonCode: 'ALREADY_ENROLLED',
          reasonMessage: 'Este aluno já está inscrito neste horário da turma.',
          slot: {
            ...baseSlot,
            occurrenceId: occId,
            capacity,
            enrolledCount,
            remainingSpots,
            isFull: true,
            statusLabel: 'Já inscrito'
          }
        };
      }
    }

    return {
      eligibleForDate: true,
      bookable: !isFull,
      ...(isFull
        ? {
            reasonCode: 'CLASS_FULL',
            reasonMessage: 'Turma lotada: todas as vagas para este horário já foram preenchidas.'
          }
        : {}),
      slot: {
        ...baseSlot,
        occurrenceId: occId,
        roomId: effectiveRoomId,
        capacity,
        enrolledCount,
        remainingSpots,
        isFull,
        statusLabel: isFull
          ? 'Turma lotada'
          : `${remainingSpots} vaga${remainingSpots === 1 ? '' : 's'} disponíve${remainingSpots === 1 ? 'l' : 'is'}`
      }
    };
  }

  /**
   * Lista ocorrências reais para uma data YYYY-MM-DD baseadas na grade semanal class_schedules.
   */
  static getScheduledSlotsForDate(params: {
    tenantId: string;
    serviceRow: any;
    dateStr: string;
    professionalId?: string;
    externalBusyByProf?: Map<string, Array<{ startMin: number; endMin: number }>>;
    patientId?: string;
    ignoreLeadTime?: boolean;
    ignoreAdvanceCap?: boolean;
    publicOnly?: boolean;
    includeBlockedNotice?: boolean;
    mockNow?: Date;
  }): {
    slots: StudioClassSlotItem[];
    emptyReason: string | null;
    weeklySchedules: ClassScheduleRecord[];
  } {
    const { tenantId, serviceRow, dateStr } = params;
    const allSchedules = this.listForService(tenantId, serviceRow.id, {
      includeInactive: false,
      publicOnly: params.publicOnly
    });

    if (allSchedules.length === 0) {
      const rawSchedules = this.listForService(tenantId, serviceRow.id, {
        includeInactive: true,
        publicOnly: false
      });
      if (rawSchedules.length === 0) {
        return {
          slots: [],
          emptyReason: 'Esta aula coletiva ainda não possui horários cadastrados na grade semanal.',
          weeklySchedules: []
        };
      }
      const diag = this.diagnoseServiceSchedules(tenantId, serviceRow.id, rawSchedules);
      return {
        slots: [],
        emptyReason:
          diag.blockers[0] ||
          'Os horários cadastrados na grade semanal desta aula não estão disponíveis para agendamento online no momento.',
        weeklySchedules: []
      };
    }

    const dow = getDayOfWeekFromYmd(dateStr);
    const matching = allSchedules.filter(s => {
      if (Number(s.day_of_week) !== dow) return false;
      if (params.professionalId && params.professionalId !== 'any' && s.professional_id !== params.professionalId) {
        return false;
      }
      if (dateStr < s.effective_start_date) return false;
      if (s.effective_end_date && dateStr > s.effective_end_date) return false;
      return true;
    });

    if (matching.length === 0) {
      let emptyReason = 'Não há turma programada para este dia na grade semanal desta aula.';
      if (params.professionalId && params.professionalId !== 'any') {
        const hasProfSchedules = allSchedules.some(s => s.professional_id === params.professionalId);
        if (!hasProfSchedules) {
          emptyReason = 'O instrutor selecionado não possui turmas cadastradas para esta aula.';
        }
      } else if (allSchedules.some(s => Number(s.day_of_week) === dow && dateStr < s.effective_start_date)) {
        const nextStart = allSchedules
          .filter(s => Number(s.day_of_week) === dow && dateStr < s.effective_start_date)
          .map(s => s.effective_start_date)
          .sort()[0];
        if (nextStart) {
          const [y, m, d] = nextStart.split('-');
          emptyReason = `Esta turma inicia a vigência somente a partir de ${d}/${m}/${y}.`;
        }
      }
      return {
        slots: [],
        emptyReason,
        weeklySchedules: allSchedules
      };
    }

    const slots: StudioClassSlotItem[] = [];
    let firstReason: string | null = null;

    for (const sch of matching) {
      const evalRes = this.evaluateClassScheduleSlot({
        tenantId,
        schedule: sch,
        serviceRow,
        dateStr,
        externalBusyIntervals: params.externalBusyByProf?.get(sch.professional_id),
        patientId: params.patientId,
        ignoreLeadTime: params.ignoreLeadTime,
        ignoreAdvanceCap: params.ignoreAdvanceCap,
        publicOnly: params.publicOnly,
        mockNow: params.mockNow
      });

      if (evalRes.bookable || evalRes.reasonCode === 'CLASS_FULL') {
        slots.push(evalRes.slot);
      } else if (!firstReason && evalRes.reasonMessage) {
        firstReason = evalRes.reasonMessage;
      }
    }

    slots.sort((a, b) => {
      if (a.time !== b.time) return a.time.localeCompare(b.time);
      return a.professionalName.localeCompare(b.professionalName);
    });

    return {
      slots,
      emptyReason:
        slots.length === 0
          ? firstReason || 'Não há vagas ou horários disponíveis para esta data.'
          : null,
      weeklySchedules: allSchedules
    };
  }

  /**
   * Lista as próximas ocorrências reais disponíveis nos próximos N dias para evitar busca cega por datas.
   */
  static getUpcomingOccurrencesForService(params: {
    tenantId: string;
    serviceRow: any;
    professionalId?: string;
    startDate?: string;
    daysAhead?: number;
    limit?: number;
    externalBusyByProfAndDate?: Map<string, Array<{ startMin: number; endMin: number }>>;
    publicOnly?: boolean;
  }): StudioClassSlotItem[] {
    const startDate = params.startDate || todayBrazilYmd();
    const maxScanDays = Math.min(45, Math.max(7, params.daysAhead || 21));
    const maxItems = Math.min(40, Math.max(4, params.limit || 20));
    const upcoming: StudioClassSlotItem[] = [];

    if (params.serviceRow.service_kind === 'group') {
      const allSchedules = this.listForService(params.tenantId, params.serviceRow.id, {
        includeInactive: false,
        publicOnly: params.publicOnly
      });
      if (allSchedules.length === 0) return [];

      for (let offset = 0; offset < maxScanDays && upcoming.length < maxItems; offset++) {
        const dStr = addDaysYmd(startDate, offset);
        const dow = getDayOfWeekFromYmd(dStr);
        const dayMatches = allSchedules.filter(s => {
          if (Number(s.day_of_week) !== dow) return false;
          if (params.professionalId && params.professionalId !== 'any' && s.professional_id !== params.professionalId) {
            return false;
          }
          if (dStr < s.effective_start_date) return false;
          if (s.effective_end_date && dStr > s.effective_end_date) return false;
          return true;
        });

        for (const sch of dayMatches) {
          const extKey = `${sch.professional_id}|${dStr}`;
          const evalRes = this.evaluateClassScheduleSlot({
            tenantId: params.tenantId,
            schedule: sch,
            serviceRow: params.serviceRow,
            dateStr: dStr,
            externalBusyIntervals: params.externalBusyByProfAndDate?.get(extKey),
            publicOnly: params.publicOnly
          });
          if (evalRes.bookable || evalRes.reasonCode === 'CLASS_FULL') {
            upcoming.push(evalRes.slot);
            if (upcoming.length >= maxItems) break;
          }
        }
      }
      return upcoming;
    }

    // Serviço individual: busca próximas datas reais com calculateAvailableSlots
    const profFilter = params.professionalId && params.professionalId !== 'any' ? params.professionalId : null;
    const profRows = db.prepare(`
      SELECT DISTINCT p.id, p.name, p.photo_url, COALESCE(pr.name, 'Instrutor') as profession_name
      FROM professionals p
      LEFT JOIN professions pr ON pr.id = p.profession_id
      LEFT JOIN professional_services ps ON ps.professional_id = p.id AND ps.service_id = ?
      JOIN services s ON s.id = ? AND s.tenant_id = p.tenant_id
      WHERE p.tenant_id = ? AND p.active = 1
        ${params.publicOnly ? 'AND p.public_booking_enabled = 1' : ''}
        AND (s.professional_id = p.id OR ps.professional_id = p.id)
        ${profFilter ? 'AND p.id = ?' : ''}
      ORDER BY p.name ASC
    `).all(
      ...(profFilter
        ? [params.serviceRow.id, params.serviceRow.id, params.tenantId, profFilter]
        : [params.serviceRow.id, params.serviceRow.id, params.tenantId])
    ) as any[];

    const allowedModalities = getAllowedModalitiesSafe(params.serviceRow.modality, null);
    for (let offset = 0; offset < Math.min(14, maxScanDays) && upcoming.length < maxItems; offset++) {
      const dStr = addDaysYmd(startDate, offset);
      const dow = getDayOfWeekFromYmd(dStr);
      for (const prof of profRows) {
        const extKey = `${prof.id}|${dStr}`;
        const slots = calculateAvailableSlots(
          params.tenantId,
          prof.id,
          params.serviceRow.id,
          dStr,
          undefined,
          undefined,
          params.externalBusyByProfAndDate?.get(extKey)
        );
        for (const s of slots) {
          upcoming.push({
            classScheduleId: null,
            occurrenceId: null,
            date: dStr,
            dayOfWeek: dow,
            time: s.time,
            endTimeClock: s.endTime.slice(11, 16),
            startTime: s.startTime,
            endTime: s.endTime,
            durationMinutes: s.durationMinutes,
            bufferMinutes: s.bufferMinutes,
            professionalId: prof.id,
            professionalName: prof.name,
            professionalAvatar: prof.photo_url || null,
            professionName: prof.profession_name || 'Instrutor',
            roomId: null,
            roomName: null,
            modality: allowedModalities.includes('presential') ? 'presential' : allowedModalities[0] || 'presential',
            serviceModality: String(params.serviceRow.modality || 'both'),
            allowedModalities,
            serviceKind: 'individual',
            capacity: 1,
            enrolledCount: 0,
            remainingSpots: 1,
            isFull: false,
            statusLabel: 'Disponível'
          });
          if (upcoming.length >= maxItems) break;
        }
        if (upcoming.length >= maxItems) break;
      }
    }

    return upcoming;
  }

  /**
   * Fornece motivo seguro e legível quando não há horários públicos disponíveis para um serviço nos próximos dias.
   */
  static explainEmptyPublicAvailability(params: {
    tenantId: string;
    serviceRow: any;
    professionalId?: string;
    startDate?: string;
    daysAhead?: number;
  }): string {
    const startDate = params.startDate || todayBrazilYmd();
    const maxScanDays = Math.min(45, Math.max(7, params.daysAhead || 21));

    if (params.serviceRow.service_kind === 'group') {
      const rawSchedules = this.listForService(params.tenantId, params.serviceRow.id, {
        includeInactive: true,
        publicOnly: false
      });
      if (rawSchedules.length === 0) {
        return 'Esta aula coletiva ainda não possui horários cadastrados na grade semanal.';
      }
      const diag = this.diagnoseServiceSchedules(params.tenantId, params.serviceRow.id, rawSchedules);
      if (diag.publishableCount === 0) {
        return diag.blockers[0] || 'Os horários desta aula estão pausados ou aguardando liberação de escala do instrutor.';
      }

      const publicActive = this.listForService(params.tenantId, params.serviceRow.id, {
        includeInactive: false,
        publicOnly: true
      });
      if (params.professionalId && params.professionalId !== 'any') {
        const filtered = publicActive.filter(s => s.professional_id === params.professionalId);
        if (filtered.length === 0) {
          return 'O instrutor selecionado não possui horários disponíveis no agendamento online para esta aula.';
        }
        const profBlockedItem = diag.items.find(
          it => it.professionalId === params.professionalId && !it.publishable
        );
        if (profBlockedItem && profBlockedItem.reasons.length > 0) {
          return profBlockedItem.reasons[0];
        }
      }

      const endScanDate = addDaysYmd(startDate, maxScanDays);
      const futureStarts = publicActive
        .filter(s => s.effective_start_date > endScanDate)
        .map(s => s.effective_start_date)
        .sort();
      if (futureStarts.length === publicActive.length && futureStarts[0]) {
        const [y, m, d] = futureStarts[0].split('-');
        return `As turmas desta aula iniciam vigência a partir de ${d}/${m}/${y}.`;
      }

      if (diag.blockers.length > 0) {
        return diag.blockers[0];
      }
      return 'Todas as turmas programadas nos próximos dias estão bloqueadas ou fora da disponibilidade do instrutor.';
    }

    // Serviço individual
    const profFilter = params.professionalId && params.professionalId !== 'any' ? params.professionalId : null;
    const linkedProfs = db.prepare(`
      SELECT DISTINCT p.id, p.name, p.active, p.public_booking_enabled
      FROM professionals p
      LEFT JOIN professional_services ps ON ps.professional_id = p.id AND ps.service_id = ?
      JOIN services s ON s.id = ? AND s.tenant_id = p.tenant_id
      WHERE p.tenant_id = ?
        AND (s.professional_id = p.id OR ps.professional_id = p.id)
        ${profFilter ? 'AND p.id = ?' : ''}
    `).all(
      ...(profFilter
        ? [params.serviceRow.id, params.serviceRow.id, params.tenantId, profFilter]
        : [params.serviceRow.id, params.serviceRow.id, params.tenantId])
    ) as any[];

    if (linkedProfs.length === 0) {
      return 'Nenhum instrutor está vinculado a esta aula no momento.';
    }
    const eligibleProfs = linkedProfs.filter(p => Number(p.active) === 1 && Number(p.public_booking_enabled) === 1);
    if (eligibleProfs.length === 0) {
      return 'Os instrutores vinculados a esta aula estão inativos ou com o agendamento público desativado.';
    }
    return 'Não há horários disponíveis na escala dos instrutores vinculados para os próximos dias.';
  }

  /**
   * Validação estrita em transação no servidor para reserva pública de aula coletiva.
   * Nunca confia no frontend nem permite contornar a grade semanal da turma.
   */
  static validatePublicGroupSlotTx(params: {
    tenantId: string;
    serviceRow: any;
    preferredProfId: string;
    classScheduleId?: string | null;
    startIso: string;
    endIso: string;
    requestedModality?: unknown;
    externalBusyByProfAndDate?: Map<string, Array<{ startMin: number; endMin: number }>>;
    patientId?: string;
    ignoreLeadTime?: boolean;
    ignoreAdvanceCap?: boolean;
  }): {
    professionalId: string;
    coInstructorIds: string[];
    classScheduleId: string;
    roomId: string | null;
    capacity: number;
    modality: ConcreteModality;
  } {
    const { tenantId, serviceRow, preferredProfId, classScheduleId, startIso, endIso } = params;
    const dateStr = startIso.slice(0, 10);
    const startClock = startIso.slice(11, 16);
    const endClock = endIso.slice(11, 16);
    const dow = getDayOfWeekFromYmd(dateStr);

    const schedules = this.listForService(tenantId, serviceRow.id, {
      includeInactive: false,
      publicOnly: true
    });

    if (schedules.length === 0) {
      throw Object.assign(
        new Error(`A aula "${serviceRow.name}" ainda não possui turmas ou horários cadastrados na grade semanal.`),
        { status: 409, code: 'CLASS_SCHEDULE_REQUIRED' }
      );
    }

    const candidates = schedules.filter(s => {
      if (classScheduleId && s.id !== classScheduleId) return false;
      if (Number(s.day_of_week) !== dow) return false;
      if (s.start_time.slice(0, 5) !== startClock || s.end_time.slice(0, 5) !== endClock) return false;
      if (preferredProfId && preferredProfId !== 'any' && s.professional_id !== preferredProfId) return false;
      if (dateStr < s.effective_start_date) return false;
      if (s.effective_end_date && dateStr > s.effective_end_date) return false;
      return true;
    });

    if (candidates.length === 0) {
      throw Object.assign(
        new Error(
          `O horário ${dateStr} às ${startClock} não pertence à grade oficial de turmas da aula "${serviceRow.name}".`
        ),
        { status: 409, code: 'SLOT_NOT_IN_CLASS_SCHEDULE' }
      );
    }

    let lastFailure: { code?: string; message?: string; status?: number } | null = null;

    for (const sch of candidates) {
      // Valida modalidade antes/junto para falhar claramente em escolhas incompatíveis
      const concreteModality = resolveConcreteModality({
        serviceModality: serviceRow.modality,
        requestedModality: params.requestedModality,
        scheduleModality: sch.modality,
        allowHome: true
      });

      const extKey = `${sch.professional_id}|${dateStr}`;
      const evalRes = this.evaluateClassScheduleSlot({
        tenantId,
        schedule: sch,
        serviceRow,
        dateStr,
        externalBusyIntervals: params.externalBusyByProfAndDate?.get(extKey),
        patientId: params.patientId,
        ignoreLeadTime: params.ignoreLeadTime,
        ignoreAdvanceCap: params.ignoreAdvanceCap,
        publicOnly: true
      });

      if (evalRes.bookable) {
        return {
          professionalId: sch.professional_id,
          coInstructorIds: Array.isArray((sch as any).co_instructor_ids) ? (sch as any).co_instructor_ids : [],
          classScheduleId: sch.id,
          roomId: evalRes.slot.roomId,
          capacity: evalRes.slot.capacity,
          modality: concreteModality
        };
      }

      lastFailure = {
        code: evalRes.reasonCode,
        message: evalRes.reasonMessage,
        status: evalRes.reasonCode === 'CLASS_FULL' || evalRes.reasonCode === 'ALREADY_ENROLLED' ? 409 : 409
      };
    }

    throw Object.assign(
      new Error(
        lastFailure?.message ||
          `Horário indisponível em ${dateStr} às ${startClock}. Escolha outra turma ou data.`
      ),
      {
        status: lastFailure?.status || 409,
        code: lastFailure?.code || 'SLOT_UNAVAILABLE'
      }
    );
  }
}

function getAllowedModalitiesSafe(
  serviceModality: unknown,
  scheduleModality: ConcreteModality | null
): ConcreteModality[] {
  if (scheduleModality) return [scheduleModality];
  const raw = String(serviceModality || 'presential').toLowerCase();
  if (raw === 'both') return ['presential', 'online'];
  if (raw === 'online') return ['online'];
  if (raw === 'home') return ['home'];
  return ['presential'];
}
