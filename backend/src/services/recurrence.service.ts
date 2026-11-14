import { db } from '../config/database';
import {
  formatRecurrenceDescription,
  MAX_PUBLIC_RECURRENCE_OCCURRENCES,
  RecurrenceFrequency,
  RecurrenceIntervalUnit,
  validateServiceRecurrenceFrequency
} from '../utils/establishment-context';
import { ConcreteModality, resolveConcreteModality } from '../utils/modality-resolver';
import { calculateAvailableSlots } from '../utils/slot-calculator';
import { generateRecurrenceDates } from './class-group.service';
import { ClassScheduleService, getDayOfWeekFromYmd } from './class-schedule.service';
import { GoogleCalendarService } from './google-calendar.service';

const WEEKDAY_SHORT_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export interface RecurrenceEvaluationInput {
  tenantId: string;
  serviceId: string;
  professionalId?: string | null;
  classScheduleId?: string | null;
  roomId?: string | null;
  patientId?: string | null;
  startDate: string; // YYYY-MM-DD
  startClock: string; // HH:MM or HH:MM:SS
  endClock?: string | null;
  modality?: string | null;
  frequency?: string | null;
  intervalValue?: number | null;
  intervalUnit?: RecurrenceIntervalUnit | null;
  weekdays?: number[] | null;
  endDate?: string | null;
  maxOccurrences?: number | null;
  publicOnly?: boolean;
  isCustomTime?: boolean;
  ignoreFirstLeadTime?: boolean;
  mockNow?: Date;
  externalBusyByProfAndDate?: Map<string, Array<{ startMin: number; endMin: number }>>;
}

export interface RecurrenceAlternativeSlot {
  startTime: string;
  endTime: string;
  timeLabel: string;
  professionalId: string;
  professionalName: string;
  classScheduleId?: string | null;
  roomId?: string | null;
  remainingSpots?: number | null;
}

export interface RecurrenceOccurrenceEvaluation {
  index: number;
  date: string;
  dayOfWeek: number;
  dayLabel: string;
  startTime: string;
  endTime: string;
  available: boolean;
  reasonCode?: string;
  reasonMessage?: string;
  professionalId?: string;
  professionalName?: string;
  classScheduleId?: string | null;
  roomId?: string | null;
  roomName?: string | null;
  capacity?: number;
  remainingSpots?: number | null;
  modality?: ConcreteModality;
  alternatives?: RecurrenceAlternativeSlot[];
}

export interface RecurrenceEvaluationResult {
  valid: boolean;
  frequency: RecurrenceFrequency;
  intervalValue: number | null;
  intervalUnit: RecurrenceIntervalUnit | null;
  description: string;
  serviceId: string;
  serviceName: string;
  serviceKind: 'individual' | 'group';
  modality: ConcreteModality;
  totalCount: number;
  availableCount: number;
  conflictCount: number;
  occurrences: RecurrenceOccurrenceEvaluation[];
}

function normalizeClockHHMMSS(raw: string): string {
  const clean = String(raw || '').trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(clean)) return clean;
  if (/^\d{2}:\d{2}$/.test(clean)) return `${clean}:00`;
  return '09:00:00';
}

function computeClockOffsetEnd(startClock: string, durationMinutes: number): string {
  const [sh, sm] = startClock.slice(0, 5).split(':').map(Number);
  const total = (sh * 60 + sm) + Math.max(5, Number(durationMinutes) || 50);
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00`;
}

function parseClockMinutes(clock: string): number {
  const [h, m] = clock.slice(0, 5).split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function checkClinicBusinessHoursForDate(
  tenantId: string,
  dateStr: string,
  startClock: string,
  endClock: string
): { valid: boolean; code?: string; error?: string } {
  try {
    const tenantRow = db.prepare('SELECT business_hours_json FROM tenants WHERE id = ?').get(tenantId) as { business_hours_json?: string } | undefined;
    if (!tenantRow?.business_hours_json) return { valid: true };
    const bhList = JSON.parse(tenantRow.business_hours_json);
    if (!Array.isArray(bhList) || bhList.length === 0) return { valid: true };
    const dow = getDayOfWeekFromYmd(dateStr);
    const dayConfig = bhList.find((bh: any) => Number(bh.dayOfWeek) === dow);
    if (!dayConfig) return { valid: true };
    if (dayConfig.isOpen === false || dayConfig.active === false) {
      return { valid: false, code: 'CLINIC_CLOSED', error: 'O estabelecimento não funciona neste dia da semana.' };
    }
    const reqStart = startClock.slice(0, 5);
    const reqEnd = endClock.slice(0, 5);
    if (dayConfig.startTime && reqStart < dayConfig.startTime) {
      return { valid: false, code: 'CLINIC_CLOSED', error: `O horário solicitado (${reqStart}) é anterior ao expediente (${dayConfig.startTime}).` };
    }
    if (dayConfig.endTime && reqEnd > dayConfig.endTime) {
      return { valid: false, code: 'CLINIC_CLOSED', error: `O horário de término (${reqEnd}) ultrapassa o expediente (${dayConfig.endTime}).` };
    }
    if (dayConfig.breakStart && dayConfig.breakEnd) {
      if (
        (reqStart >= dayConfig.breakStart && reqStart < dayConfig.breakEnd) ||
        (reqEnd > dayConfig.breakStart && reqEnd <= dayConfig.breakEnd) ||
        (reqStart <= dayConfig.breakStart && reqEnd >= dayConfig.breakEnd)
      ) {
        return { valid: false, code: 'CLINIC_CLOSED', error: `O horário coincide com o intervalo do estabelecimento (${dayConfig.breakStart} às ${dayConfig.breakEnd}).` };
      }
    }
    return { valid: true };
  } catch {
    return { valid: true };
  }
}

function checkProfessionalWorkScheduleAndBlocks(
  tenantId: string,
  professionalId: string,
  dateStr: string,
  startIso: string,
  endIso: string
): { valid: boolean; code?: string; error?: string } {
  const dow = getDayOfWeekFromYmd(dateStr);
  const reqStartTime = startIso.slice(11, 16);
  const reqEndTime = endIso.slice(11, 16);

  const activeShifts = db.prepare(`
    SELECT start_time, end_time, break_start, break_end
    FROM schedules
    WHERE tenant_id = ? AND professional_id = ? AND day_of_week = ? AND is_active = 1
    ORDER BY start_time ASC
  `).all(tenantId, professionalId, dow) as Array<{
    start_time: string;
    end_time: string;
    break_start: string | null;
    break_end: string | null;
  }>;

  if (!activeShifts || activeShifts.length === 0) {
    return {
      valid: false,
      code: 'INSTRUCTOR_SCHEDULE_CLOSED',
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
      insideBreak =
        (reqStartTime >= breakStart && reqStartTime < breakEnd) ||
        (reqEndTime > breakStart && reqEndTime <= breakEnd) ||
        (reqStartTime <= breakStart && reqEndTime >= breakEnd);
    }
    if (insideBreak) breakConflict = true;
    if (insideShift && !insideBreak) {
      fitsInAnyShift = true;
      break;
    }
  }

  if (!fitsInAnyShift) {
    return breakConflict
      ? { valid: false, code: 'INSTRUCTOR_BREAK_CONFLICT', error: 'O horário solicitado coincide com o intervalo de descanso do profissional.' }
      : { valid: false, code: 'OUTSIDE_PROFESSIONAL_HOURS', error: 'O horário solicitado está fora da escala ativa do profissional.' };
  }

  const block = db.prepare(`
    SELECT title FROM blocked_times
    WHERE tenant_id = ?
      AND (professional_id = ? OR professional_id IS NULL)
      AND REPLACE(start_datetime, ' ', 'T') < ?
      AND REPLACE(end_datetime, ' ', 'T') > ?
    LIMIT 1
  `).get(tenantId, professionalId, endIso, startIso) as { title?: string } | undefined;

  if (block) {
    return {
      valid: false,
      code: 'BLOCKED_TIME',
      error: `Há um bloqueio na agenda neste horário: ${block.title || 'Ausência'}.`
    };
  }

  return { valid: true };
}

function getEligibleProfessionalsForService(params: {
  tenantId: string;
  serviceRow: any;
  preferredProfId?: string | null;
  publicOnly: boolean;
  isCustomTime?: boolean;
}): Array<{ id: string; name: string; active: number; public_booking_enabled: number }> {
  const { tenantId, serviceRow, preferredProfId, publicOnly } = params;
  const rows = db.prepare(`
    SELECT DISTINCT p.id, p.name, p.active, COALESCE(p.public_booking_enabled, 1) as public_booking_enabled
    FROM professionals p
    LEFT JOIN professional_services ps ON ps.service_id = ? AND ps.professional_id = p.id
    WHERE p.tenant_id = ?
      AND (p.id = ? OR ps.professional_id IS NOT NULL)
    ORDER BY CASE WHEN p.id = ? THEN 0 ELSE 1 END, p.name ASC
  `).all(serviceRow.id, tenantId, serviceRow.professional_id || null, serviceRow.professional_id || '') as Array<{
    id: string;
    name: string;
    active: number;
    public_booking_enabled: number;
  }>;

  const filtered = rows.filter(r => r.active === 1 && (!publicOnly || r.public_booking_enabled === 1));
  if (preferredProfId && preferredProfId !== 'any') {
    const inList = filtered.filter(r => r.id === preferredProfId);
    if (inList.length > 0) return inList;
    if (!serviceRow.professional_id) {
      const fallbackProf = db.prepare(`
        SELECT id, name, active, COALESCE(public_booking_enabled, 1) as public_booking_enabled
        FROM professionals WHERE id = ? AND tenant_id = ? AND active = 1
      `).get(preferredProfId, tenantId) as any;
      if (fallbackProf && (!publicOnly || fallbackProf.public_booking_enabled === 1)) {
        return [fallbackProf];
      }
    }
    return [];
  }
  return filtered;
}

export function evaluateRecurrenceSeriesSync(input: RecurrenceEvaluationInput): RecurrenceEvaluationResult {
  const {
    tenantId,
    serviceId,
    classScheduleId,
    roomId,
    patientId,
    publicOnly = false,
    isCustomTime = false,
    ignoreFirstLeadTime = !publicOnly
  } = input;

  const serviceRow = db.prepare(`
    SELECT id, name, price, duration_minutes, professional_id, modality,
           COALESCE(service_kind, 'individual') as service_kind,
           default_capacity, COALESCE(allow_recurrence, 1) as allow_recurrence,
           allowed_recurrence_frequencies_json, default_recurrence_frequency,
           custom_recurrence_intervals_json, default_recurrence_interval_json,
           min_lead_time_hours, max_advance_days,
           service_domain, clinical_module
    FROM services
    WHERE id = ? AND tenant_id = ? AND active = 1
  `).get(serviceId, tenantId) as any;

  if (!serviceRow) {
    throw Object.assign(new Error('Serviço não encontrado ou inativo nesta clínica.'), { status: 404, code: 'SERVICE_NOT_FOUND' });
  }

  const recValidation = validateServiceRecurrenceFrequency(
    serviceRow,
    input.frequency,
    input.intervalValue,
    input.intervalUnit
  );
  if (!recValidation.valid) {
    throw Object.assign(new Error(recValidation.error), { status: 400, code: recValidation.code });
  }

  const endDateStr = input.endDate ? String(input.endDate).slice(0, 10) : undefined;
  const rawMax = input.maxOccurrences !== undefined && input.maxOccurrences !== null ? Number(input.maxOccurrences) : undefined;

  if (!endDateStr && (!rawMax || rawMax <= 0)) {
    throw Object.assign(new Error('Informe data de término ou quantidade máxima de ocorrências.'), {
      status: 400,
      code: 'RECURRENCE_BOUND_REQUIRED'
    });
  }

  if (publicOnly && rawMax !== undefined && rawMax > MAX_PUBLIC_RECURRENCE_OCCURRENCES) {
    throw Object.assign(
      new Error(`No agendamento online, o limite máximo é de ${MAX_PUBLIC_RECURRENCE_OCCURRENCES} ocorrências por série.`),
      { status: 400, code: 'RECURRENCE_LIMIT_EXCEEDED' }
    );
  }

  const dates = generateRecurrenceDates({
    startDate: input.startDate,
    frequency: recValidation.frequency,
    intervalValue: recValidation.intervalValue,
    intervalUnit: recValidation.intervalUnit,
    weekdays: Array.isArray(input.weekdays) ? input.weekdays : undefined,
    endDate: endDateStr,
    maxOccurrences: rawMax
  });

  if (publicOnly && dates.length > MAX_PUBLIC_RECURRENCE_OCCURRENCES) {
    throw Object.assign(
      new Error(`No agendamento online, o período informado gera ${dates.length} ocorrências (máximo de ${MAX_PUBLIC_RECURRENCE_OCCURRENCES}).`),
      { status: 400, code: 'RECURRENCE_LIMIT_EXCEEDED' }
    );
  }

  if (dates.length === 0) {
    throw Object.assign(new Error('Nenhuma data válida encontrada para os critérios de recorrência informados.'), {
      status: 400,
      code: 'RECURRENCE_EMPTY_DATES'
    });
  }

  const preferredProfId = input.professionalId && input.professionalId !== 'any' ? String(input.professionalId) : 'any';
  if (preferredProfId !== 'any') {
    const profExists = db.prepare('SELECT id, name, active, public_booking_enabled FROM professionals WHERE id = ? AND tenant_id = ?').get(preferredProfId, tenantId) as any;
    if (!profExists || profExists.active !== 1) {
      throw Object.assign(new Error('Profissional ativo não encontrado nesta clínica.'), { status: 400, code: 'PROFESSIONAL_NOT_FOUND' });
    }
    if (publicOnly && Number(profExists.public_booking_enabled ?? 1) !== 1) {
      throw Object.assign(new Error('O profissional selecionado não está disponível para agendamento online.'), { status: 400, code: 'INSTRUCTOR_UNAVAILABLE' });
    }
  }

  const eligibleProfs = getEligibleProfessionalsForService({
    tenantId,
    serviceRow,
    preferredProfId,
    publicOnly,
    isCustomTime
  });

  if (preferredProfId !== 'any' && eligibleProfs.length === 0 && !isCustomTime) {
    throw Object.assign(new Error(`O instrutor/profissional selecionado não está vinculado ao serviço "${serviceRow.name}".`), {
      status: 400,
      code: 'INSTRUCTOR_NOT_LINKED_TO_SERVICE'
    });
  }

  if (roomId) {
    const roomValid = db.prepare('SELECT 1 FROM rooms WHERE id = ? AND tenant_id = ? AND active = 1').get(roomId, tenantId);
    if (!roomValid) {
      throw Object.assign(new Error('Sala selecionada inválida.'), { status: 400, code: 'INVALID_ROOM' });
    }
  }

  const startClockFull = normalizeClockHHMMSS(input.startClock);
  const startClockHHMM = startClockFull.slice(0, 5);
  const endClockFull = input.endClock ? normalizeClockHHMMSS(input.endClock) : computeClockOffsetEnd(startClockFull, Number(serviceRow.duration_minutes || 50));
  const endClockHHMM = endClockFull.slice(0, 5);
  const startMin = parseClockMinutes(startClockFull);
  const endMin = parseClockMinutes(endClockFull);

  if (endClockFull <= startClockFull) {
    throw Object.assign(new Error('Informe início e término válidos para o horário base.'), { status: 400, code: 'INVALID_BOOKING_TIME' });
  }

  const concreteServiceModality = resolveConcreteModality({
    serviceModality: serviceRow.modality,
    requestedModality: input.modality,
    allowHome: true
  });

  const isGroupService = serviceRow.service_kind === 'group';
  const hasClassSchedules = isGroupService && ClassScheduleService.hasAnySchedulesForService(tenantId, serviceRow.id);
  const allClassSchedules = hasClassSchedules
    ? ClassScheduleService.listForService(tenantId, serviceRow.id, { includeInactive: false, publicOnly })
    : [];

  const occurrences: RecurrenceOccurrenceEvaluation[] = [];

  for (let idx = 0; idx < dates.length; idx++) {
    const dateStr = dates[idx];
    const dow = getDayOfWeekFromYmd(dateStr);
    const dayLabel = WEEKDAY_SHORT_LABELS[dow] || '';
    const sIso = `${dateStr}T${startClockFull}`;
    const eIso = `${dateStr}T${endClockFull}`;
    const cleanS = `${dateStr}T${startClockHHMM}:00`;
    const cleanE = `${dateStr}T${endClockHHMM}:00`;
    const ignoreLeadTime = idx > 0 ? true : ignoreFirstLeadTime;
    const ignoreAdvanceCap = idx > 0;

    // 1. Conflito de paciente/aluno na própria data
    if (patientId) {
      const patientOverlap = db.prepare(`
        SELECT a.id FROM appointments a
        WHERE a.tenant_id = ? AND a.patient_id = ? AND a.status != 'cancelled'
          AND REPLACE(a.start_time, ' ', 'T') < ? AND REPLACE(a.end_time, ' ', 'T') > ?
        LIMIT 1
      `).get(tenantId, patientId, cleanE, cleanS);
      if (patientOverlap) {
        occurrences.push({
          index: idx + 1,
          date: dateStr,
          dayOfWeek: dow,
          dayLabel,
          startTime: cleanS,
          endTime: cleanE,
          available: false,
          reasonCode: 'PATIENT_APPOINTMENT_CONFLICT',
          reasonMessage: `Aluno já possui outro agendamento em ${dateStr} às ${startClockHHMM}.`
        });
        continue;
      }
    }

    // 2. Feriados & Expediente do estabelecimento (quando não é horário manual administrativo)
    if (!isCustomTime) {
      const holiday = db.prepare('SELECT name FROM holidays WHERE date = ? AND (tenant_id = ? OR is_national = 1) AND active = 1 LIMIT 1').get(dateStr, tenantId) as { name?: string } | undefined;
      if (holiday) {
        occurrences.push({
          index: idx + 1,
          date: dateStr,
          dayOfWeek: dow,
          dayLabel,
          startTime: cleanS,
          endTime: cleanE,
          available: false,
          reasonCode: 'HOLIDAY',
          reasonMessage: `Feriado cadastrado (${holiday.name || dateStr}).`
        });
        continue;
      }

      const clinicHours = checkClinicBusinessHoursForDate(tenantId, dateStr, startClockFull, endClockFull);
      if (!clinicHours.valid) {
        occurrences.push({
          index: idx + 1,
          date: dateStr,
          dayOfWeek: dow,
          dayLabel,
          startTime: cleanS,
          endTime: cleanE,
          available: false,
          reasonCode: clinicHours.code || 'CLINIC_CLOSED',
          reasonMessage: clinicHours.error
        });
        continue;
      }
    }

    // 3. Aula coletiva com grade semanal cadastrada (class_schedules)
    if (isGroupService && hasClassSchedules && !isCustomTime) {
      const candidates = allClassSchedules.filter(s => {
        if (classScheduleId && s.id !== classScheduleId) return false;
        if (Number(s.day_of_week) !== dow) return false;
        if (s.start_time.slice(0, 5) !== startClockHHMM || s.end_time.slice(0, 5) !== endClockHHMM) return false;
        if (preferredProfId !== 'any' && s.professional_id !== preferredProfId) return false;
        if (dateStr < s.effective_start_date) return false;
        if (s.effective_end_date && dateStr > s.effective_end_date) return false;
        return true;
      });

      let bookedSlot: RecurrenceOccurrenceEvaluation | null = null;
      let lastFailure: { code?: string; message?: string } | null = null;

      for (const sch of candidates) {
        let resolvedModality: ConcreteModality;
        try {
          resolvedModality = resolveConcreteModality({
            serviceModality: serviceRow.modality,
            requestedModality: input.modality,
            scheduleModality: sch.modality,
            allowHome: true
          });
        } catch (modErr: any) {
          lastFailure = { code: 'INVALID_MODALITY', message: modErr?.message || 'Modalidade incompatível com esta turma.' };
          continue;
        }

        const extKey = `${sch.professional_id}|${dateStr}`;
        const evalRes = ClassScheduleService.evaluateClassScheduleSlot({
          tenantId,
          schedule: sch,
          serviceRow,
          dateStr,
          externalBusyIntervals: input.externalBusyByProfAndDate?.get(extKey),
          patientId: patientId || undefined,
          ignoreLeadTime,
          ignoreAdvanceCap,
          publicOnly,
          mockNow: input.mockNow
        });

        if (evalRes.bookable) {
          bookedSlot = {
            index: idx + 1,
            date: dateStr,
            dayOfWeek: dow,
            dayLabel,
            startTime: cleanS,
            endTime: cleanE,
            available: true,
            professionalId: sch.professional_id,
            professionalName: sch.professional_name || 'Instrutor',
            classScheduleId: sch.id,
            roomId: evalRes.slot.roomId,
            roomName: evalRes.slot.roomName,
            capacity: evalRes.slot.capacity,
            remainingSpots: evalRes.slot.remainingSpots,
            modality: resolvedModality
          };
          break;
        }

        lastFailure = {
          code: evalRes.reasonCode,
          message: evalRes.reasonMessage
        };
      }

      if (bookedSlot) {
        occurrences.push(bookedSlot);
      } else {
        const daySlots = ClassScheduleService.getScheduledSlotsForDate({
          tenantId,
          serviceRow,
          dateStr,
          professionalId: preferredProfId,
          patientId: patientId || undefined,
          ignoreLeadTime,
          ignoreAdvanceCap,
          publicOnly,
          mockNow: input.mockNow
        }).slots.filter(s => !s.isFull);

        const alternatives: RecurrenceAlternativeSlot[] = daySlots.slice(0, 6).map(s => ({
          startTime: s.startTime,
          endTime: s.endTime,
          timeLabel: `${s.time} - ${s.endTimeClock}`,
          professionalId: s.professionalId,
          professionalName: s.professionalName,
          classScheduleId: s.classScheduleId,
          roomId: s.roomId,
          remainingSpots: s.remainingSpots
        }));

        occurrences.push({
          index: idx + 1,
          date: dateStr,
          dayOfWeek: dow,
          dayLabel,
          startTime: cleanS,
          endTime: cleanE,
          available: false,
          reasonCode: lastFailure?.code || 'SLOT_NOT_IN_CLASS_SCHEDULE',
          reasonMessage:
            lastFailure?.message ||
            `Não há turma ativa da aula "${serviceRow.name}" autorizada em ${dateStr} (${startClockHHMM} - ${endClockHHMM}).`,
          alternatives: alternatives.length > 0 ? alternatives : undefined
        });
      }
      continue;
    }

    // 4. Serviço individual (ou aula coletiva legada sem grade semanal / override administrativo)
    const candidatesToTry = isCustomTime && preferredProfId !== 'any' && eligibleProfs.length === 0
      ? [{ id: preferredProfId, name: 'Profissional', active: 1, public_booking_enabled: 1 }]
      : eligibleProfs;

    let matchedOk: RecurrenceOccurrenceEvaluation | null = null;
    let firstFailure: { code?: string; message?: string } | null = null;

    for (const prof of candidatesToTry) {
      if (!isCustomTime) {
        const schedCheck = checkProfessionalWorkScheduleAndBlocks(tenantId, prof.id, dateStr, cleanS, cleanE);
        if (!schedCheck.valid) {
          if (!firstFailure) firstFailure = { code: schedCheck.code, message: schedCheck.error };
          continue;
        }

        const extBusy = input.externalBusyByProfAndDate?.get(`${prof.id}|${dateStr}`);
        if (extBusy && extBusy.length > 0) {
          const hasGcalConflict = extBusy.some(b => startMin < b.endMin && endMin > b.startMin);
          if (hasGcalConflict) {
            if (!firstFailure) firstFailure = { code: 'GOOGLE_BUSY', message: 'Profissional indisponível neste horário (agenda externa).' };
            continue;
          }
        }

        if (publicOnly) {
          const publicSlots = calculateAvailableSlots(
            tenantId,
            prof.id,
            serviceRow.id,
            dateStr,
            roomId || undefined,
            input.mockNow,
            extBusy,
            patientId || undefined,
            { ignoreLeadTime, ignoreAdvanceCap }
          );
          if (!publicSlots.some(s => s.startTime === cleanS && s.endTime === cleanE)) {
            if (!firstFailure) {
              firstFailure = {
                code: 'SLOT_UNAVAILABLE',
                message: `Horário ${startClockHHMM} indisponível para agendamento online em ${dateStr}.`
              };
            }
            continue;
          }
        }
      }

      if (isGroupService) {
        const cleanStartMin = cleanS.slice(0, 16);
        const occ = db.prepare(`
          SELECT o.*
          FROM class_occurrences o
          WHERE o.tenant_id = ? AND o.service_id = ? AND o.professional_id = ?
            AND REPLACE(substr(o.start_time, 1, 16), ' ', 'T') = ?
          ORDER BY o.created_at DESC
          LIMIT 1
        `).get(tenantId, serviceRow.id, prof.id, cleanStartMin) as any;

        if (occ && occ.status === 'cancelled') {
          if (!firstFailure) firstFailure = { code: 'OCCURRENCE_CANCELLED', message: `Esta aula foi cancelada para ${dateStr}.` };
          continue;
        }

        const occId = occ ? occ.id : null;
        const profConflict = db.prepare(`
          SELECT a.id FROM appointments a
          WHERE a.tenant_id = ? AND a.professional_id = ?
            AND (? IS NULL OR COALESCE(a.occurrence_id, '') != ?)
            AND a.status != 'cancelled'
            AND REPLACE(a.start_time, ' ', 'T') < ? AND REPLACE(a.end_time, ' ', 'T') > ?
          LIMIT 1
        `).get(tenantId, prof.id, occId, occId, cleanE, cleanS);
        if (profConflict) {
          if (!firstFailure) firstFailure = { code: 'PROFESSIONAL_SLOT_OCCUPIED', message: `Profissional já possui atendimento conflitante em ${dateStr} às ${startClockHHMM}.` };
          continue;
        }

        const cap = Math.max(1, Number(occ?.capacity) || Number(serviceRow.default_capacity) || 1);
        const enrolled = occ
          ? (db.prepare(`SELECT COUNT(*) as c FROM appointments WHERE occurrence_id = ? AND tenant_id = ? AND status != 'cancelled'`).get(occ.id, tenantId) as { c: number }).c
          : 0;
        if (enrolled >= cap) {
          if (!firstFailure) firstFailure = { code: 'CLASS_FULL', message: `Turma lotada em ${dateStr} (${enrolled}/${cap}).` };
          continue;
        }

        if (roomId) {
          const roomConflict = db.prepare(`
            SELECT a.id, r.name as room_name FROM appointments a
            LEFT JOIN rooms r ON r.id = a.room_id
            WHERE a.tenant_id = ? AND a.room_id = ?
              AND (? IS NULL OR COALESCE(a.occurrence_id, '') != ?)
              AND a.status != 'cancelled'
              AND REPLACE(a.start_time, ' ', 'T') < ? AND REPLACE(a.end_time, ' ', 'T') > ?
            LIMIT 1
          `).get(tenantId, roomId, occId, occId, cleanE, cleanS) as any;
          if (roomConflict) {
            if (!firstFailure) firstFailure = { code: 'ROOM_CONFLICT', message: `Sala ocupada em ${dateStr} (${startClockHHMM}).` };
            continue;
          }
        }

        matchedOk = {
          index: idx + 1,
          date: dateStr,
          dayOfWeek: dow,
          dayLabel,
          startTime: cleanS,
          endTime: cleanE,
          available: true,
          professionalId: prof.id,
          professionalName: prof.name,
          classScheduleId: null,
          roomId: roomId || occ?.room_id || null,
          capacity: cap,
          remainingSpots: Math.max(0, cap - enrolled),
          modality: concreteServiceModality
        };
        break;
      }

      // Serviço individual: verifica conflito de profissional e sala
      const profConflict = db.prepare(`
        SELECT a.id FROM appointments a
        WHERE a.tenant_id = ? AND a.professional_id = ? AND a.status != 'cancelled'
          AND REPLACE(a.start_time, ' ', 'T') < ? AND REPLACE(a.end_time, ' ', 'T') > ?
        LIMIT 1
      `).get(tenantId, prof.id, cleanE, cleanS);
      if (profConflict) {
        if (!firstFailure) firstFailure = { code: 'PROFESSIONAL_SLOT_OCCUPIED', message: `Horário indisponível para o profissional em ${dateStr} (${startClockHHMM}).` };
        continue;
      }

      if (roomId) {
        const roomConflict = db.prepare(`
          SELECT a.id FROM appointments a
          WHERE a.tenant_id = ? AND a.room_id = ? AND a.status != 'cancelled'
            AND REPLACE(a.start_time, ' ', 'T') < ? AND REPLACE(a.end_time, ' ', 'T') > ?
          LIMIT 1
        `).get(tenantId, roomId, cleanE, cleanS);
        if (roomConflict) {
          if (!firstFailure) firstFailure = { code: 'ROOM_CONFLICT', message: `Sala ocupada em ${dateStr} (${startClockHHMM}).` };
          continue;
        }
      }

      matchedOk = {
        index: idx + 1,
        date: dateStr,
        dayOfWeek: dow,
        dayLabel,
        startTime: cleanS,
        endTime: cleanE,
        available: true,
        professionalId: prof.id,
        professionalName: prof.name,
        classScheduleId: null,
        roomId: roomId || null,
        capacity: 1,
        remainingSpots: 1,
        modality: concreteServiceModality
      };
      break;
    }

    if (matchedOk) {
      occurrences.push(matchedOk);
    } else {
      const alternatives: RecurrenceAlternativeSlot[] = [];
      const seenAlt = new Set<string>();
      for (const prof of eligibleProfs) {
        const altSlots = calculateAvailableSlots(
          tenantId,
          prof.id,
          serviceRow.id,
          dateStr,
          roomId || undefined,
          input.mockNow,
          input.externalBusyByProfAndDate?.get(`${prof.id}|${dateStr}`),
          patientId || undefined,
          { ignoreLeadTime, ignoreAdvanceCap }
        );
        for (const s of altSlots) {
          const key = `${prof.id}|${s.startTime}`;
          if (seenAlt.has(key)) continue;
          seenAlt.add(key);
          alternatives.push({
            startTime: s.startTime,
            endTime: s.endTime,
            timeLabel: `${s.startTime.slice(11, 16)} - ${s.endTime.slice(11, 16)}`,
            professionalId: prof.id,
            professionalName: prof.name,
            remainingSpots: s.remainingSpots ?? null
          });
          if (alternatives.length >= 6) break;
        }
        if (alternatives.length >= 6) break;
      }

      occurrences.push({
        index: idx + 1,
        date: dateStr,
        dayOfWeek: dow,
        dayLabel,
        startTime: cleanS,
        endTime: cleanE,
        available: false,
        reasonCode: firstFailure?.code || 'SLOT_UNAVAILABLE',
        reasonMessage: firstFailure?.message || `Horário indisponível em ${dateStr} às ${startClockHHMM}.`,
        alternatives: alternatives.length > 0 ? alternatives : undefined
      });
    }
  }

  const availableCount = occurrences.filter(o => o.available).length;
  const conflictCount = occurrences.length - availableCount;

  return {
    valid: occurrences.length > 0 && conflictCount === 0,
    frequency: recValidation.frequency,
    intervalValue: recValidation.intervalValue,
    intervalUnit: recValidation.intervalUnit,
    description: formatRecurrenceDescription({
      frequency: recValidation.frequency,
      intervalValue: recValidation.intervalValue,
      intervalUnit: recValidation.intervalUnit,
      weekdays: Array.isArray(input.weekdays) ? input.weekdays : undefined
    }),
    serviceId: serviceRow.id,
    serviceName: serviceRow.name,
    serviceKind: isGroupService ? 'group' : 'individual',
    modality: concreteServiceModality,
    totalCount: occurrences.length,
    availableCount,
    conflictCount,
    occurrences
  };
}

export async function evaluateRecurrenceSeriesWithExternalBusy(
  input: RecurrenceEvaluationInput
): Promise<RecurrenceEvaluationResult> {
  // First generate dates via dry run without external busy map if possible, or prefetch for generated dates
  const serviceRow = db.prepare(`
    SELECT id, name, professional_id, COALESCE(service_kind, 'individual') as service_kind,
           COALESCE(allow_recurrence, 1) as allow_recurrence,
           allowed_recurrence_frequencies_json, default_recurrence_frequency,
           custom_recurrence_intervals_json, default_recurrence_interval_json
    FROM services
    WHERE id = ? AND tenant_id = ? AND active = 1
  `).get(input.serviceId, input.tenantId) as any;

  if (!serviceRow) {
    throw Object.assign(new Error('Serviço não encontrado ou inativo nesta clínica.'), { status: 404, code: 'SERVICE_NOT_FOUND' });
  }

  const recValidation = validateServiceRecurrenceFrequency(
    serviceRow,
    input.frequency,
    input.intervalValue,
    input.intervalUnit
  );
  if (!recValidation.valid) {
    throw Object.assign(new Error(recValidation.error), { status: 400, code: recValidation.code });
  }

  const endDateStr = input.endDate ? String(input.endDate).slice(0, 10) : undefined;
  const rawMax = input.maxOccurrences !== undefined && input.maxOccurrences !== null ? Number(input.maxOccurrences) : undefined;

  const dates = generateRecurrenceDates({
    startDate: input.startDate,
    frequency: recValidation.frequency,
    intervalValue: recValidation.intervalValue,
    intervalUnit: recValidation.intervalUnit,
    weekdays: Array.isArray(input.weekdays) ? input.weekdays : undefined,
    endDate: endDateStr,
    maxOccurrences: rawMax
  });

  const extBusyMap = input.externalBusyByProfAndDate || new Map<string, Array<{ startMin: number; endMin: number }>>();
  const preferredProfId = input.professionalId && input.professionalId !== 'any' ? String(input.professionalId) : 'any';
  const eligibleProfs = getEligibleProfessionalsForService({
    tenantId: input.tenantId,
    serviceRow,
    preferredProfId,
    publicOnly: Boolean(input.publicOnly),
    isCustomTime: input.isCustomTime
  });

  const profIdsToPrefetch = new Set<string>(eligibleProfs.map(p => p.id));
  if (serviceRow.service_kind === 'group') {
    const classScheds = ClassScheduleService.listForService(input.tenantId, serviceRow.id, {
      includeInactive: false,
      publicOnly: Boolean(input.publicOnly)
    });
    for (const cs of classScheds) {
      if (preferredProfId === 'any' || cs.professional_id === preferredProfId) {
        profIdsToPrefetch.add(cs.professional_id);
      }
    }
  }

  for (const pid of profIdsToPrefetch) {
    const gcalConn = GoogleCalendarService.getConnectionForProfessional(input.tenantId, pid);
    if (!gcalConn) continue;
    for (const dateStr of dates) {
      const key = `${pid}|${dateStr}`;
      if (extBusyMap.has(key)) continue;
      try {
        const busy = await GoogleCalendarService.getBusyIntervals(input.tenantId, pid, dateStr);
        extBusyMap.set(key, busy.map(b => ({ startMin: b.startMin, endMin: b.endMin })));
      } catch {
        extBusyMap.set(key, []);
      }
    }
  }

  return evaluateRecurrenceSeriesSync({
    ...input,
    externalBusyByProfAndDate: extBusyMap
  });
}
