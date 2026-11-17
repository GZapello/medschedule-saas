import { db } from '../config/database';

export function validateClinicBusinessHours(tenantId: string, startTime: string, endTime: string): { valid: boolean; error?: string } {
  try {
    const tenantRow = db.prepare('SELECT business_hours_json FROM tenants WHERE id = ?').get(tenantId) as { business_hours_json?: string } | undefined;
    if (!tenantRow?.business_hours_json) return { valid: true };

    const bhList = JSON.parse(tenantRow.business_hours_json);
    if (!Array.isArray(bhList) || bhList.length === 0) return { valid: true };

    const normalizedStart = startTime.includes('T') ? startTime : startTime.replace(' ', 'T');
    const datePart = normalizedStart.slice(0, 10);
    const [y, m, d] = datePart.split('-').map(Number);
    const dayOfWeek = (!isNaN(y) && !isNaN(m) && !isNaN(d))
      ? new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay()
      : new Date(normalizedStart).getDay();
    const dayConfig = bhList.find((bh: any) => Number(bh.dayOfWeek) === dayOfWeek);

    if (!dayConfig) return { valid: true };

    if (dayConfig.isOpen === false || dayConfig.active === false) {
      return { valid: false, error: 'A clínica não realiza atendimentos neste dia da semana.' };
    }

    const timeOnly = (dStr: string) => {
      const parts = dStr.split('T');
      return parts[1]?.slice(0, 5) || '00:00';
    };
    const reqStartTime = timeOnly(startTime);
    const reqEndTime = timeOnly(endTime);

    if (dayConfig.startTime && reqStartTime < dayConfig.startTime) {
      return { valid: false, error: `O horário solicitado (${reqStartTime}) é anterior ao início do expediente da clínica (${dayConfig.startTime}).` };
    }
    if (dayConfig.endTime && reqEndTime > dayConfig.endTime) {
      return { valid: false, error: `O horário de término (${reqEndTime}) ultrapassa o expediente da clínica (${dayConfig.endTime}).` };
    }
    if (dayConfig.breakStart && dayConfig.breakEnd) {
      if (
        (reqStartTime >= dayConfig.breakStart && reqStartTime < dayConfig.breakEnd) ||
        (reqEndTime > dayConfig.breakStart && reqEndTime <= dayConfig.breakEnd) ||
        (reqStartTime <= dayConfig.breakStart && reqEndTime >= dayConfig.breakEnd)
      ) {
        return { valid: false, error: `O horário solicitado coincide com o intervalo da clínica (${dayConfig.breakStart} às ${dayConfig.breakEnd}).` };
      }
    }
    return { valid: true };
  } catch {
    return { valid: true };
  }
}

export function validateProfessionalSchedule(tenantId: string, professionalId: string, startTime: string, endTime: string): { valid: boolean; error?: string } {
  try {
    const normalizedStart = startTime.includes('T') ? startTime : startTime.replace(' ', 'T');
    const normalizedEnd = endTime.includes('T') ? endTime : endTime.replace(' ', 'T');
    const datePart = normalizedStart.slice(0, 10);
    const [y, m, d] = datePart.split('-').map(Number);
    const dayOfWeek = (!isNaN(y) && !isNaN(m) && !isNaN(d))
      ? new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay()
      : new Date(normalizedStart).getDay();
    if (dayOfWeek === -1 || isNaN(dayOfWeek)) return { valid: false, error: 'Data de agendamento inválida.' };

    const timeOnly = (dStr: string) => {
      const parts = dStr.split('T');
      return parts[1]?.slice(0, 5) || '00:00';
    };
    const reqStartTime = timeOnly(normalizedStart);
    const reqEndTime = timeOnly(normalizedEnd);

    const activeShifts = db.prepare(`
      SELECT start_time, end_time, break_start, break_end
      FROM schedules
      WHERE tenant_id = ? AND professional_id = ? AND day_of_week = ? AND is_active = 1
      ORDER BY start_time ASC
    `).all(tenantId, professionalId, dayOfWeek) as {
      start_time: string;
      end_time: string;
      break_start: string | null;
      break_end: string | null;
    }[];

    if (!activeShifts || activeShifts.length === 0) {
      return {
        valid: false,
        error: 'O profissional não possui escala de trabalho ativa neste dia da semana.'
      };
    }

    let fitsInAnyShift = false;
    let breakConflict = false;

    for (const shift of activeShifts) {
      const shiftStart = shift.start_time || '08:00';
      const shiftEnd = shift.end_time || '18:00';
      const breakStart = shift.break_start;
      const breakEnd = shift.break_end;

      const insideShift = reqStartTime >= shiftStart && reqEndTime <= shiftEnd;
      let insideBreak = false;
      if (breakStart && breakEnd) {
        insideBreak = (reqStartTime >= breakStart && reqStartTime < breakEnd) ||
                      (reqEndTime > breakStart && reqEndTime <= breakEnd) ||
                      (reqStartTime <= breakStart && reqEndTime >= breakEnd);
      }

      if (insideBreak) {
        breakConflict = true;
      }

      if (insideShift && !insideBreak) {
        fitsInAnyShift = true;
        break;
      }
    }

    if (!fitsInAnyShift) {
      if (breakConflict) {
        return {
          valid: false,
          error: 'O horário solicitado coincide com o intervalo de descanso do profissional.'
        };
      }
      return {
        valid: false,
        error: 'O horário solicitado está fora da escala de trabalho ativa do profissional.'
      };
    }

    const block = db.prepare(`
      SELECT title FROM blocked_times
      WHERE tenant_id = ?
        AND (professional_id = ? OR professional_id IS NULL)
        AND REPLACE(start_datetime, ' ', 'T') < ?
        AND REPLACE(end_datetime, ' ', 'T') > ?
      LIMIT 1
    `).get(tenantId, professionalId, normalizedEnd, normalizedStart) as { title: string } | undefined;

    if (block) {
      return {
        valid: false,
        error: `O profissional possui um bloqueio de agenda neste horário: ${block.title || 'Ausência'}.`
      };
    }

    return { valid: true };
  } catch {
    return { valid: true };
  }
}
