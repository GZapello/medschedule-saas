import { db } from '../config/database';

export interface AvailableSlot {
  time: string;           // '09:00'
  startTime: string;      // '2026-09-10T09:00:00'
  endTime: string;        // '2026-09-10T09:50:00'
  durationMinutes: number;
  bufferMinutes: number;
}

/**
 * Converte qualquer string de data/hora (ex: '2026-09-15 09:00:00' ou '2026-09-15T09:00:00')
 * no minuto do dia correspondente para uma data alvo específica.
 */
function parseDateTimeToMinuteOfDay(dtStr: string, targetDateStr: string): number {
  if (!dtStr) return 0;
  const s = dtStr.trim().replace(' ', 'T');
  const datePart = s.substring(0, 10);

  if (datePart < targetDateStr) {
    return 0; // Começou antes do dia alvo
  }
  if (datePart > targetDateStr) {
    return 24 * 60; // Termina após o dia alvo
  }

  const timePart = s.length >= 16 ? s.substring(11, 16) : s.substring(11);
  const [h, m] = timePart.split(':').map(Number);
  const hour = isNaN(h) ? 0 : h;
  const minute = isNaN(m) ? 0 : m;
  return hour * 60 + minute;
}

const timeToMinutes = (t: string): number => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
};

const minutesToTime = (m: number): string => {
  const h = Math.floor(m / 60).toString().padStart(2, '0');
  const min = (m % 60).toString().padStart(2, '0');
  return `${h}:${min}`;
};

export function calculateAvailableSlots(
  tenantId: string,
  professionalId: string,
  serviceId: string,
  dateStr: string, // 'YYYY-MM-DD'
  roomId?: string,
  mockNow?: Date
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
  // Preserva 0 se o serviço não tiver buffer cadastrado
  const buffer = (service.buffer_minutes !== undefined && service.buffer_minutes !== null)
    ? service.buffer_minutes
    : 0;
  const totalSlotDuration = duration + buffer;

  // 2. Valida datas no passado ou muito no futuro (utilizando fuso oficial do Brasil)
  const [targetYear, targetMonth, targetDay] = dateStr.split('-').map(Number);
  if (!targetYear || !targetMonth || !targetDay) return [];

  const referenceDate = mockNow || new Date();

  // Data atual no fuso de Brasília
  const spDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });
  const todayStr = spDateFormatter.format(referenceDate); // 'YYYY-MM-DD'

  if (dateStr < todayStr) {
    return []; // Não permite agendar em dias passados
  }

  const [tY, tM, tD] = todayStr.split('-').map(Number);
  const todayOnly = new Date(tY, tM - 1, tD);
  const targetDate = new Date(targetYear, targetMonth - 1, targetDay);

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

  // 4. Obtém o dia da semana (0 = Domingo, 1 = Segunda, ..., 6 = Sábado) via UTC para imunidade a fuso da máquina
  const dayOfWeek = new Date(Date.UTC(targetYear, targetMonth - 1, targetDay, 12, 0, 0)).getUTCDay();

  // 4b. Checa horários de funcionamento da clínica
  const tenantRow = db.prepare('SELECT business_hours_json FROM tenants WHERE id = ?').get(tenantId) as { business_hours_json?: string } | undefined;
  let clinicDayConfig: { isOpen?: boolean; active?: boolean; startTime?: string; endTime?: string; breakStart?: string; breakEnd?: string } | null = null;
  if (tenantRow?.business_hours_json) {
    try {
      const bhList = JSON.parse(tenantRow.business_hours_json);
      if (Array.isArray(bhList)) {
        const found = bhList.find((bh: any) => Number(bh.dayOfWeek) === dayOfWeek);
        if (found) {
          clinicDayConfig = found;
          if (found.isOpen === false || found.active === false) {
            return []; // Clínica não abre neste dia da semana
          }
        }
      }
    } catch (e) {}
  }

  // 5. Busca todas as grades de trabalho ativas do profissional para este dia da semana
  const schedStmt = db.prepare(`
    SELECT start_time, end_time, break_start, break_end
    FROM schedules
    WHERE tenant_id = ? AND professional_id = ? AND day_of_week = ? AND is_active = 1
    ORDER BY start_time ASC
  `);
  const activeSchedules = schedStmt.all(tenantId, professionalId, dayOfWeek) as {
    start_time: string;
    end_time: string;
    break_start: string | null;
    break_end: string | null;
  }[];

  if (!activeSchedules || activeSchedules.length === 0) return [];

  // 6. Busca agendamentos ativos neste dia (que não estejam cancelados)
  // Checa tanto consultas do profissional quanto da sala selecionada (se houver)
  const apptStmt = db.prepare(`
    SELECT start_time, end_time, room_id
    FROM appointments
    WHERE tenant_id = ?
      AND (professional_id = ? OR (? IS NOT NULL AND room_id = ?))
      AND status NOT IN ('cancelled')
      AND (
        REPLACE(start_time, ' ', 'T') LIKE ?
        OR REPLACE(end_time, ' ', 'T') LIKE ?
        OR (REPLACE(start_time, ' ', 'T') <= ? AND REPLACE(end_time, ' ', 'T') >= ?)
      )
  `);

  const rawAppts = apptStmt.all(
    tenantId,
    professionalId,
    roomId || null,
    roomId || null,
    `${dateStr}%`,
    `${dateStr}%`,
    `${dateStr}T23:59:59`,
    `${dateStr}T00:00:00`
  ) as { start_time: string; end_time: string }[];

  const existingApptIntervals = rawAppts.map(appt => ({
    startMin: parseDateTimeToMinuteOfDay(appt.start_time, dateStr),
    endMin: parseDateTimeToMinuteOfDay(appt.end_time, dateStr)
  }));

  // 7. Busca bloqueios, férias e ausências pontuais neste dia
  const blockStmt = db.prepare(`
    SELECT start_datetime, end_datetime
    FROM blocked_times
    WHERE tenant_id = ?
      AND (professional_id = ? OR professional_id IS NULL)
      AND (
        REPLACE(start_datetime, ' ', 'T') <= ?
        AND REPLACE(end_datetime, ' ', 'T') >= ?
      )
  `);
  const endOfDay = `${dateStr}T23:59:59`;
  const startOfDay = `${dateStr}T00:00:00`;
  const rawBlocked = blockStmt.all(tenantId, professionalId, endOfDay, startOfDay) as {
    start_datetime: string;
    end_datetime: string;
  }[];

  const blockedIntervals = rawBlocked.map(blk => ({
    startMin: parseDateTimeToMinuteOfDay(blk.start_datetime, dateStr),
    endMin: parseDateTimeToMinuteOfDay(blk.end_datetime, dateStr)
  }));

  // Interseção entre o expediente da clínica e a escala
  let clinicStartMin = 0;
  let clinicEndMin = 24 * 60;
  if (clinicDayConfig?.startTime) clinicStartMin = timeToMinutes(clinicDayConfig.startTime);
  if (clinicDayConfig?.endTime) clinicEndMin = timeToMinutes(clinicDayConfig.endTime);

  const clinicBreakStartMin = clinicDayConfig?.breakStart ? timeToMinutes(clinicDayConfig.breakStart) : null;
  const clinicBreakEndMin = clinicDayConfig?.breakEnd ? timeToMinutes(clinicDayConfig.breakEnd) : null;

  const slots: AvailableSlot[] = [];
  const seenTimes = new Set<string>();
  
  // Antecedência mínima configurada no serviço (se 0 ou não definido, respeita apenas o minuto atual)
  const minLeadHours = (service.min_lead_time_hours !== undefined && service.min_lead_time_hours !== null)
    ? Number(service.min_lead_time_hours)
    : 0;

  const isToday = dateStr === todayStr;

  // Calcula os minutos atuais no fuso de Brasília (America/Sao_Paulo) com hourCycle h23
  const nowSpFormatted = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(referenceDate);
  const [spHStr, spMStr] = nowSpFormatted.split(':');
  const spHour = parseInt(spHStr, 10) || 0;
  const spMin = parseInt(spMStr, 10) || 0;
  const currentMinutesInDay = spHour * 60 + spMin;

  const slotStep = totalSlotDuration > 0 ? totalSlotDuration : duration;

  // 8. Itera sobre cada período/turno de trabalho configurado para o profissional
  for (const schedule of activeSchedules) {
    const workStartMin = timeToMinutes(schedule.start_time);
    const workEndMin = timeToMinutes(schedule.end_time);
    const breakStartMin = schedule.break_start ? timeToMinutes(schedule.break_start) : null;
    const breakEndMin = schedule.break_end ? timeToMinutes(schedule.break_end) : null;

    const effectiveStartMin = Math.max(workStartMin, clinicStartMin);
    const effectiveEndMin = Math.min(workEndMin, clinicEndMin);

    for (let current = effectiveStartMin; current + duration <= effectiveEndMin; current += slotStep) {
      const slotEndMin = current + duration;

      // Se for hoje, filtra apenas horários que já passaram no relógio de Brasília.
      // Horários futuros do mesmo turno (ex: agora 10:00 -> vaga 11:00) aparecem normalmente.
      if (isToday && current < currentMinutesInDay) {
        continue;
      }

      // Checa conflito com intervalo de descanso deste turno
      if (breakStartMin !== null && breakEndMin !== null) {
        if (current < breakEndMin && slotEndMin > breakStartMin) {
          continue;
        }
      }

      // Checa conflito com intervalo da clínica
      if (clinicBreakStartMin !== null && clinicBreakEndMin !== null) {
        if (current < clinicBreakEndMin && slotEndMin > clinicBreakStartMin) {
          continue;
        }
      }

      // Checa conflito com agendamentos existentes (interseção de intervalos)
      const hasApptConflict = existingApptIntervals.some(appt => {
        return current < appt.endMin && slotEndMin > appt.startMin;
      });
      if (hasApptConflict) continue;

      // Checa conflito com bloqueios pontuais, férias e ausências
      const hasBlockConflict = blockedIntervals.some(blk => {
        return current < blk.endMin && slotEndMin > blk.startMin;
      });
      if (hasBlockConflict) continue;

      const slotStartIso = `${dateStr}T${minutesToTime(current)}:00`;
      const slotEndIso = `${dateStr}T${minutesToTime(slotEndMin)}:00`;

      if (seenTimes.has(slotStartIso)) continue;
      seenTimes.add(slotStartIso);

      slots.push({
        time: minutesToTime(current),
        startTime: slotStartIso,
        endTime: slotEndIso,
        durationMinutes: duration,
        bufferMinutes: buffer
      });
    }
  }

  // Ordena por horário crescente
  slots.sort((a, b) => a.startTime.localeCompare(b.startTime));
  return slots;
}

