import { db } from '../config/database';

export interface AvailableSlot {
  time: string;           // '09:00'
  startTime: string;      // '2026-09-10T09:00:00'
  endTime: string;        // '2026-09-10T09:50:00'
  durationMinutes: number;
  bufferMinutes: number;
}

export function calculateAvailableSlots(
  tenantId: string,
  professionalId: string,
  serviceId: string,
  dateStr: string // 'YYYY-MM-DD'
): AvailableSlot[] {
  // 1. Busca dados do serviço
  const serviceStmt = db.prepare(`
    SELECT duration_minutes, buffer_minutes, min_lead_time_hours, max_advance_days, active
    FROM services
    WHERE id = ? AND tenant_id = ? AND active = 1
  `);
  const service = serviceStmt.get(serviceId, tenantId) as {
    duration_minutes: number;
    buffer_minutes: number;
    min_lead_time_hours: number;
    max_advance_days: number;
  } | undefined;

  if (!service) return [];

  const duration = service.duration_minutes || 50;
  const buffer = service.buffer_minutes || 10;
  const totalSlotDuration = duration + buffer;

  // 2. Valida datas no passado ou muito no futuro
  const now = new Date();
  const targetDate = new Date(`${dateStr}T00:00:00`);
  const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (targetDate < todayOnly) {
    return []; // Não permite agendar em dias passados
  }

  const maxDate = new Date(todayOnly);
  maxDate.setDate(maxDate.getDate() + (service.max_advance_days || 60));
  if (targetDate > maxDate) {
    return [];
  }

  // 3. Checa se o dia é feriado
  const holidayStmt = db.prepare(`
    SELECT id, name FROM holidays
    WHERE date = ? AND (tenant_id = ? OR is_national = 1) AND active = 1
  `);
  const holiday = holidayStmt.get(dateStr, tenantId);
  if (holiday) {
    return []; // Feriado cadastrado
  }

  // 4. Obtém o dia da semana (0 = Domingo, 1 = Segunda, ..., 6 = Sábado)
  const dayOfWeek = targetDate.getDay();

  // 5. Busca a grade de trabalho do profissional para este dia da semana
  const schedStmt = db.prepare(`
    SELECT start_time, end_time, break_start, break_end
    FROM schedules
    WHERE tenant_id = ? AND professional_id = ? AND day_of_week = ? AND is_active = 1
  `);
  const schedule = schedStmt.get(tenantId, professionalId, dayOfWeek) as {
    start_time: string;
    end_time: string;
    break_start: string | null;
    break_end: string | null;
  } | undefined;

  if (!schedule) return [];

  // 6. Busca agendamentos já existentes neste dia (que não estejam cancelados)
  const apptStmt = db.prepare(`
    SELECT start_time, end_time
    FROM appointments
    WHERE tenant_id = ?
      AND professional_id = ?
      AND status NOT IN ('cancelled')
      AND start_time LIKE ?
  `);
  const existingAppts = apptStmt.all(tenantId, professionalId, `${dateStr}%`) as {
    start_time: string;
    end_time: string;
  }[];

  // 7. Busca bloqueios e ausências pontuais neste dia
  const blockStmt = db.prepare(`
    SELECT start_datetime, end_datetime
    FROM blocked_times
    WHERE tenant_id = ?
      AND (professional_id = ? OR professional_id IS NULL)
      AND (start_datetime <= ? AND end_datetime >= ?)
  `);
  const endOfDay = `${dateStr}T23:59:59`;
  const startOfDay = `${dateStr}T00:00:00`;
  const blockedTimes = blockStmt.all(tenantId, professionalId, endOfDay, startOfDay) as {
    start_datetime: string;
    end_datetime: string;
  }[];

  // Converte 'HH:mm' em minutos desde a meia-noite
  const timeToMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const minutesToTime = (m: number) => {
    const h = Math.floor(m / 60).toString().padStart(2, '0');
    const min = (m % 60).toString().padStart(2, '0');
    return `${h}:${min}`;
  };

  const workStartMin = timeToMinutes(schedule.start_time);
  const workEndMin = timeToMinutes(schedule.end_time);
  const breakStartMin = schedule.break_start ? timeToMinutes(schedule.break_start) : null;
  const breakEndMin = schedule.break_end ? timeToMinutes(schedule.break_end) : null;

  const slots: AvailableSlot[] = [];
  const minLeadHours = service.min_lead_time_hours || 2;
  const isToday = targetDate.getTime() === todayOnly.getTime();
  const currentTotalMinutes = now.getHours() * 60 + now.getMinutes() + (minLeadHours * 60);

  // 8. Itera sobre os minutos de trabalho gerando intervalos
  for (let current = workStartMin; current + duration <= workEndMin; current += totalSlotDuration) {
    const slotEndMin = current + duration;

    // Se for hoje, checa a antecedência mínima
    if (isToday && current < currentTotalMinutes) {
      continue;
    }

    // Checa conflito com intervalo de almoço
    if (breakStartMin !== null && breakEndMin !== null) {
      // Se o atendimento começar ou terminar dentro do almoço, ou englobar o almoço
      if (
        (current >= breakStartMin && current < breakEndMin) ||
        (slotEndMin > breakStartMin && slotEndMin <= breakEndMin) ||
        (current <= breakStartMin && slotEndMin >= breakEndMin)
      ) {
        continue;
      }
    }

    const slotStartIso = `${dateStr}T${minutesToTime(current)}:00`;
    const slotEndIso = `${dateStr}T${minutesToTime(slotEndMin)}:00`;

    // Checa conflito com agendamentos existentes
    const hasApptConflict = existingAppts.some(appt => {
      // Sobreposição de intervalos: Max(StartA, StartB) < Min(EndA, EndB)
      return (slotStartIso < appt.end_time && slotEndIso > appt.start_time);
    });
    if (hasApptConflict) continue;

    // Checa conflito com bloqueios pontuais
    const hasBlockConflict = blockedTimes.some(blk => {
      return (slotStartIso < blk.end_datetime && slotEndIso > blk.start_datetime);
    });
    if (hasBlockConflict) continue;

    slots.push({
      time: minutesToTime(current),
      startTime: slotStartIso,
      endTime: slotEndIso,
      durationMinutes: duration,
      bufferMinutes: buffer
    });
  }

  return slots;
}
