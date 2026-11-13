import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export type RecurrenceFrequency = 'weekly' | 'biweekly' | 'monthly' | 'custom_weekdays';

export interface GenerateRecurrenceOptions {
  startDate: string; // YYYY-MM-DD
  frequency: RecurrenceFrequency;
  weekdays?: number[]; // 0..6 (Domingo=0 .. Sábado=6)
  endDate?: string | null;
  maxOccurrences?: number | null;
}

const MAX_RECURRENCE_CAP = 104;

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
    throw Object.assign(new Error('Data inicial inválida para recorrência.'), { status: 400 });
  }

  const endStr = opts.endDate ? String(opts.endDate).slice(0, 10) : null;
  if (endStr && !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
    throw Object.assign(new Error('Data final inválida para recorrência.'), { status: 400 });
  }
  if (endStr && endStr < startStr) {
    throw Object.assign(new Error('A data final da recorrência deve ser igual ou posterior à data inicial.'), { status: 400 });
  }

  const rawMax = opts.maxOccurrences !== undefined && opts.maxOccurrences !== null ? Number(opts.maxOccurrences) : null;
  if (!endStr && (!rawMax || !Number.isInteger(rawMax) || rawMax < 1)) {
    throw Object.assign(new Error('Informe a data final ou a quantidade de ocorrências para criar agendamentos recorrentes (recorrência infinita não é permitida).'), { status: 400 });
  }
  if (rawMax !== null && (!Number.isInteger(rawMax) || rawMax < 1)) {
    throw Object.assign(new Error('A quantidade de ocorrências deve ser um número inteiro positivo.'), { status: 400 });
  }

  const maxCount = Math.min(rawMax || MAX_RECURRENCE_CAP, MAX_RECURRENCE_CAP);
  const startDate = parseYmd(startStr);
  const startWeekday = startDate.getUTCDay();
  const weekdays = Array.isArray(opts.weekdays) && opts.weekdays.length > 0
    ? Array.from(new Set(opts.weekdays.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))).sort((a, b) => a - b)
    : [startWeekday];

  const dates: string[] = [];
  const freq = opts.frequency || 'weekly';

  if (freq === 'monthly') {
    const startDay = startDate.getUTCDate();
    for (let monthOffset = 0; dates.length < maxCount && monthOffset < 36; monthOffset++) {
      const y = startDate.getUTCFullYear();
      const m = startDate.getUTCMonth() + monthOffset;
      const candidate = new Date(Date.UTC(y, m, 1, 12, 0, 0));
      const daysInMonth = new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0, 12, 0, 0)).getUTCDate();
      candidate.setUTCDate(Math.min(startDay, daysInMonth));
      const ymd = formatYmd(candidate);
      if (ymd < startStr) continue;
      if (endStr && ymd > endStr) break;
      dates.push(ymd);
    }
    return dates;
  }

  const weekStep = freq === 'biweekly' ? 2 : 1;
  // Semana ancorada no domingo da semana de startDate para aplicar intervalo semanal/quinzenal determinístico
  const startSunday = new Date(startDate.getTime());
  startSunday.setUTCDate(startSunday.getUTCDate() - startWeekday);

  for (let weekIndex = 0; dates.length < maxCount && weekIndex < 160; weekIndex += weekStep) {
    for (const wd of weekdays) {
      const candidate = new Date(startSunday.getTime());
      candidate.setUTCDate(startSunday.getUTCDate() + weekIndex * 7 + wd);
      const ymd = formatYmd(candidate);
      if (ymd < startStr) continue;
      if (endStr && ymd > endStr) {
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
  explicitOccurrenceId?: string | null;
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
    explicitOccurrenceId
  } = params;

  const cleanStart = startTime.slice(0, 16);

  let existingOcc: any = null;
  if (explicitOccurrenceId) {
    existingOcc = db.prepare(`
      SELECT * FROM class_occurrences
      WHERE id = ? AND tenant_id = ? AND status != 'cancelled'
    `).get(explicitOccurrenceId, tenantId);
  } else {
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
      id, tenant_id, series_id, service_id, professional_id, room_id,
      title, modality, start_time, end_time, capacity, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')
  `).run(
    occId,
    tenantId,
    seriesId || null,
    serviceId,
    professionalId,
    roomId || null,
    serviceName,
    modality || 'presential',
    startTime,
    endTime,
    capacity
  );

  return {
    occurrenceId: occId,
    capacity,
    enrolledBefore: 0,
    roomId: roomId || null,
    isFirstEnrollment: true
  };
}
