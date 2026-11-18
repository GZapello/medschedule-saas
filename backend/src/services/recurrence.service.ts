import { db } from '../config/database';
import {
  formatRecurrenceDescription,
  MAX_PUBLIC_RECURRENCE_OCCURRENCES,
  MAX_RECURRENCE_OCCURRENCES,
  PlanDurationCode,
  RecurrenceFrequency,
  RecurrenceIntervalUnit,
  validateServiceRecurrenceFrequency
} from '../utils/establishment-context';
import { ConcreteModality, resolveConcreteModality } from '../utils/modality-resolver';
import { getTenantEstablishmentProfile, resolveServiceDomain, supportsStudioFeatures } from '../utils/establishment-context';
import { getServiceDayAvailabilitySegments, intersectIntervalLists } from '../utils/service-availability';
import { calculateAvailableSlots } from '../utils/slot-calculator';
import {
  generateRecurrenceDates,
  generateSchedulePlanOccurrences,
  SchedulePlanEntryInput
} from './class-group.service';
import { ClassScheduleService, getDayOfWeekFromYmd } from './class-schedule.service';
import { GoogleCalendarService } from './google-calendar.service';
import { PlanCreditMode } from '../utils/studio-access-and-commercial';
import { addDaysYmd, evaluateSlotTimingStatus, getTenantTimezone } from '../utils/studio-timezone';
import { countPendingHoldsForSlot, getActivePendingSlotHolds } from '../utils/public-slot-holds';

const WEEKDAY_SHORT_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export interface RecurrenceEvaluationInput {
  tenantId: string;
  serviceId: string;
  professionalId?: string | null;
  coInstructorIds?: string[] | null;
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
  durationCode?: PlanDurationCode | string | null;
  seriesMode?: 'legacy' | 'schedule_plan' | null;
  scheduleEntries?: SchedulePlanEntryInput[] | null;
  weekdays?: number[] | null;
  endDate?: string | null;
  maxOccurrences?: number | null;
  publicOnly?: boolean;
  isCustomTime?: boolean;
  ignoreFirstLeadTime?: boolean;
  mockNow?: Date;
  externalBusyByProfAndDate?: Map<string, Array<{ startMin: number; endMin: number }>>;
  creditMode?: PlanCreditMode | null;
  creditsPerCycle?: number | null;
  autoAdvanceFromLeadTime?: boolean;
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
  coInstructorIds?: string[];
  classScheduleId?: string | null;
  roomId?: string | null;
  roomName?: string | null;
  capacity?: number;
  remainingSpots?: number | null;
  statusLabel?: string;
  modality?: ConcreteModality;
  alternatives?: RecurrenceAlternativeSlot[];
}

export interface RecurrenceEvaluationResult {
  valid: boolean;
  seriesMode: 'legacy' | 'schedule_plan';
  frequency: RecurrenceFrequency;
  durationCode: PlanDurationCode | null;
  intervalValue: number | null;
  intervalUnit: RecurrenceIntervalUnit | null;
  description: string;
  startDate: string;
  endDate: string;
  serviceId: string;
  serviceName: string;
  serviceKind: 'individual' | 'group';
  modality: ConcreteModality;
  totalCount: number;
  availableCount: number;
  conflictCount: number;
  creditMode?: PlanCreditMode | null;
  creditsPerCycle?: number | null;
  nextEligibleStartDate?: string | null;
  leadTimeShifted?: boolean;
  originalStartDate?: string | null;
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
           allowed_plan_durations_json, default_plan_duration,
           custom_recurrence_intervals_json, default_recurrence_interval_json,
           min_lead_time_hours, max_advance_days,
           service_domain, clinical_module,
           plan_credit_mode, plan_credits_per_cycle,
           COALESCE(availability_mode, 'professional_schedule') as availability_mode
    FROM services
    WHERE id = ? AND tenant_id = ? AND active = 1
  `).get(serviceId, tenantId) as any;

  if (!serviceRow) {
    throw Object.assign(new Error('Serviço não encontrado ou inativo nesta clínica.'), { status: 404, code: 'SERVICE_NOT_FOUND' });
  }

  const tenantTz = getTenantTimezone(db, tenantId);
  const resolvedCreditMode: PlanCreditMode | null =
    input.creditMode ||
    (serviceRow.plan_credit_mode === 'fixed_credits' ||
    serviceRow.plan_credit_mode === 'weekly_guaranteed' ||
    serviceRow.plan_credit_mode === 'unlimited'
      ? serviceRow.plan_credit_mode
      : null);
  const resolvedCreditsCap: number | null =
    input.creditsPerCycle && Number(input.creditsPerCycle) > 0
      ? Math.floor(Number(input.creditsPerCycle))
      : (serviceRow.plan_credits_per_cycle && Number(serviceRow.plan_credits_per_cycle) > 0
          ? Math.floor(Number(serviceRow.plan_credits_per_cycle))
          : null);

  const hasScheduleEntries = Array.isArray(input.scheduleEntries) && input.scheduleEntries.length > 0;
  const recValidation = validateServiceRecurrenceFrequency(
    serviceRow,
    input.frequency,
    input.intervalValue,
    input.intervalUnit,
    {
      durationCode: input.durationCode,
      seriesMode: input.seriesMode || (hasScheduleEntries ? 'schedule_plan' : undefined)
    }
  );
  if (!recValidation.valid) {
    throw Object.assign(new Error(recValidation.error), { status: 400, code: recValidation.code });
  }

  const endDateStr = input.endDate ? String(input.endDate).slice(0, 10) : undefined;
  const rawMax = input.maxOccurrences !== undefined && input.maxOccurrences !== null ? Number(input.maxOccurrences) : undefined;
  const effMaxOccurrences =
    rawMax !== undefined
      ? rawMax
      : (resolvedCreditMode === 'fixed_credits' && resolvedCreditsCap && resolvedCreditsCap > 0
          ? resolvedCreditsCap
          : undefined);
  const effDurationCode = recValidation.durationCode;
  const hasBoundedPlanDuration = Boolean(effDurationCode && effDurationCode !== 'count' && effDurationCode !== 'custom_date' && effDurationCode !== 'legacy_frequency');

  if (!endDateStr && !hasBoundedPlanDuration && (!rawMax || rawMax <= 0)) {
    throw Object.assign(new Error('Informe a duração do plano, data de término ou quantidade máxima de ocorrências.'), {
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

  const startClockFull = normalizeClockHHMMSS(input.startClock);
  const endClockFull = input.endClock ? normalizeClockHHMMSS(input.endClock) : computeClockOffsetEnd(startClockFull, Number(serviceRow.duration_minutes || 50));

  const generatedPlan = generateSchedulePlanOccurrences({
    startDate: input.startDate,
    frequency: recValidation.frequency,
    intervalValue: recValidation.intervalValue,
    intervalUnit: recValidation.intervalUnit,
    durationCode: effDurationCode,
    endDate: endDateStr,
    maxOccurrences: effMaxOccurrences,
    weekdays: Array.isArray(input.weekdays) ? input.weekdays : undefined,
    startClock: startClockFull,
    endClock: endClockFull,
    durationMinutes: Number(serviceRow.duration_minutes || 50),
    classScheduleId: classScheduleId || null,
    professionalId: input.professionalId && input.professionalId !== 'any' ? String(input.professionalId) : null,
    coInstructorIds: Array.isArray(input.coInstructorIds) ? input.coInstructorIds : null,
    roomId: roomId || null,
    modality: input.modality || null,
    scheduleEntries: hasScheduleEntries ? input.scheduleEntries : null,
    maxCap: publicOnly ? MAX_PUBLIC_RECURRENCE_OCCURRENCES : MAX_RECURRENCE_OCCURRENCES
  });

  const plannedOccurrences = generatedPlan.occurrences;

  if (publicOnly && plannedOccurrences.length > MAX_PUBLIC_RECURRENCE_OCCURRENCES) {
    throw Object.assign(
      new Error(`No agendamento online, o período informado gera ${plannedOccurrences.length} ocorrências (máximo de ${MAX_PUBLIC_RECURRENCE_OCCURRENCES}).`),
      { status: 400, code: 'RECURRENCE_LIMIT_EXCEEDED' }
    );
  }

  if (plannedOccurrences.length === 0) {
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

  if (preferredProfId !== 'any' && eligibleProfs.length === 0 && !isCustomTime && !hasScheduleEntries) {
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

  if (endClockFull <= startClockFull && !hasScheduleEntries) {
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
  const activePublicHolds = publicOnly ? getActivePendingSlotHolds(tenantId) : [];

  const occurrences: RecurrenceOccurrenceEvaluation[] = [];

  for (let idx = 0; idx < plannedOccurrences.length; idx++) {
    const occPlan = plannedOccurrences[idx];
    const dateStr = occPlan.date;
    const dow = occPlan.dayOfWeek;
    const dayLabel = WEEKDAY_SHORT_LABELS[dow] || '';
    const occStartClockFull = occPlan.startClock;
    const occEndClockFull = occPlan.endClock;
    const startClockHHMM = occStartClockFull.slice(0, 5);
    const endClockHHMM = occEndClockFull.slice(0, 5);
    const startMin = parseClockMinutes(occStartClockFull);
    const endMin = parseClockMinutes(occEndClockFull);
    const cleanS = `${dateStr}T${startClockHHMM}:00`;
    const cleanE = `${dateStr}T${endClockHHMM}:00`;
    const occScheduleId = occPlan.classScheduleId || classScheduleId || null;
    const occPreferredProf = occPlan.professionalId || preferredProfId;
    const occRoomId = occPlan.roomId || roomId || null;
    const ignoreLeadTime = idx > 0 ? true : ignoreFirstLeadTime;
    const ignoreAdvanceCap = idx > 0 || !publicOnly;

    // 1. Conflito de paciente/aluno na própria data
    if (patientId) {
      const patientOverlap = db.prepare(`
        SELECT a.id, a.service_id, a.occurrence_id, a.start_time
        FROM appointments a
        WHERE a.tenant_id = ? AND a.patient_id = ? AND a.status != 'cancelled'
          AND REPLACE(a.start_time, ' ', 'T') < ? AND REPLACE(a.end_time, ' ', 'T') > ?
        ORDER BY CASE WHEN a.service_id = ? THEN 0 ELSE 1 END ASC
        LIMIT 1
      `).get(tenantId, patientId, cleanE, cleanS, serviceRow.id) as {
        id: string;
        service_id?: string | null;
        occurrence_id?: string | null;
        start_time?: string;
      } | undefined;
      if (patientOverlap) {
        const isSameGroupEnrollment = Boolean(
          isGroupService &&
          patientOverlap.service_id === serviceRow.id &&
          String(patientOverlap.start_time || '').trim().replace(' ', 'T').slice(0, 16) === cleanS.slice(0, 16)
        );
        occurrences.push({
          index: idx + 1,
          date: dateStr,
          dayOfWeek: dow,
          dayLabel,
          startTime: cleanS,
          endTime: cleanE,
          available: false,
          reasonCode: isSameGroupEnrollment ? 'ALREADY_ENROLLED' : 'PATIENT_APPOINTMENT_CONFLICT',
          reasonMessage: isSameGroupEnrollment
            ? 'Aluno já inscrito'
            : (isGroupService
                ? 'Conflito com outro atendimento'
                : `Aluno já possui outro agendamento em ${dateStr} às ${startClockHHMM}.`),
          statusLabel: isSameGroupEnrollment
            ? 'Aluno já inscrito'
            : (isGroupService ? 'Conflito com outro atendimento' : 'Indisponível')
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
          reasonMessage: `Feriado cadastrado (${holiday.name || dateStr}).`,
          statusLabel: isGroupService ? 'Horário bloqueado' : 'Feriado'
        });
        continue;
      }

      const clinicHours = checkClinicBusinessHoursForDate(tenantId, dateStr, occStartClockFull, occEndClockFull);
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
          reasonMessage: clinicHours.error,
          statusLabel: isGroupService ? 'Horário bloqueado' : 'Estabelecimento fechado'
        });
        continue;
      }
    }

    // 3. Aula coletiva com grade semanal cadastrada (class_schedules)
    if (isGroupService && hasClassSchedules && !isCustomTime) {
      const scheduleIdMatchesDow = Boolean(
        occScheduleId && allClassSchedules.some(cs => cs.id === occScheduleId && Number(cs.day_of_week) === dow)
      );
      const effectiveOccScheduleId = scheduleIdMatchesDow ? occScheduleId : null;

      const filterSchedules = (requireExactEndClock: boolean) =>
        allClassSchedules.filter(s => {
          if (effectiveOccScheduleId && s.id !== effectiveOccScheduleId) return false;
          if (Number(s.day_of_week) !== dow) return false;
          if (s.start_time.slice(0, 5) !== startClockHHMM) return false;
          if (requireExactEndClock && s.end_time.slice(0, 5) !== endClockHHMM) return false;
          if (
            !effectiveOccScheduleId &&
            occPreferredProf !== 'any' &&
            s.professional_id !== occPreferredProf &&
            !(Array.isArray(s.co_instructor_ids) && s.co_instructor_ids.includes(occPreferredProf))
          ) {
            return false;
          }
          if (dateStr < s.effective_start_date) return false;
          if (s.effective_end_date && dateStr > s.effective_end_date) return false;
          return true;
        });

      const exactCandidates = filterSchedules(true);
      const candidates = exactCandidates.length > 0 ? exactCandidates : filterSchedules(false);

      let bookedSlot: RecurrenceOccurrenceEvaluation | null = null;
      let lastFailure: { code?: string; message?: string; statusLabel?: string } | null = null;

      for (const sch of candidates) {
        let resolvedModality: ConcreteModality;
        try {
          resolvedModality = resolveConcreteModality({
            serviceModality: serviceRow.modality,
            requestedModality: occPlan.modality ?? input.modality,
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
          includePendingHolds: publicOnly,
          mockNow: input.mockNow
        });

        const schStartIso = `${dateStr}T${sch.start_time.slice(0, 5)}:00`;
        const schEndIso = `${dateStr}T${sch.end_time.slice(0, 5)}:00`;

        if (evalRes.bookable) {
          const effCoIds = occPlan.coInstructorIds.length > 0
            ? occPlan.coInstructorIds
            : (Array.isArray(sch.co_instructor_ids) ? sch.co_instructor_ids : []);
          const remSpots = evalRes.slot.remainingSpots;
          bookedSlot = {
            index: idx + 1,
            date: dateStr,
            dayOfWeek: dow,
            dayLabel,
            startTime: schStartIso,
            endTime: schEndIso,
            available: true,
            professionalId: sch.professional_id,
            professionalName: sch.professional_name || 'Instrutor',
            coInstructorIds: effCoIds,
            classScheduleId: sch.id,
            roomId: occRoomId || evalRes.slot.roomId,
            roomName: evalRes.slot.roomName,
            capacity: evalRes.slot.capacity,
            remainingSpots: remSpots,
            statusLabel:
              evalRes.slot.statusLabel ||
              `Disponível — ${remSpots} vaga${remSpots === 1 ? '' : 's'} restante${remSpots === 1 ? '' : 's'}`,
            modality: resolvedModality
          };
          break;
        }

        lastFailure = {
          code: evalRes.reasonCode,
          message: evalRes.reasonMessage,
          statusLabel: evalRes.slot.statusLabel
        };
      }

      if (bookedSlot) {
        occurrences.push(bookedSlot);
      } else {
        const daySlots = ClassScheduleService.getScheduledSlotsForDate({
          tenantId,
          serviceRow,
          dateStr,
          professionalId: occPreferredProf,
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
          statusLabel: lastFailure?.statusLabel || (lastFailure?.code === 'CLASS_FULL' ? 'Turma lotada' : undefined),
          alternatives: alternatives.length > 0 ? alternatives : undefined
        });
      }
      continue;
    }

    // 4. Serviço individual (ou aula coletiva legada sem grade semanal / override administrativo)
    const occEligibles = occPreferredProf === 'any'
      ? eligibleProfs
      : (eligibleProfs.some(p => p.id === occPreferredProf)
          ? eligibleProfs.filter(p => p.id === occPreferredProf)
          : getEligibleProfessionalsForService({ tenantId, serviceRow, preferredProfId: occPreferredProf, publicOnly, isCustomTime }));
    const candidatesToTry = isCustomTime && occPreferredProf !== 'any' && occEligibles.length === 0
      ? [{ id: occPreferredProf, name: 'Profissional', active: 1, public_booking_enabled: 1 }]
      : occEligibles;

    let matchedOk: RecurrenceOccurrenceEvaluation | null = null;
    let firstFailure: { code?: string; message?: string; statusLabel?: string } | null = null;

    for (const prof of candidatesToTry) {
      if (!isCustomTime) {
        const schedCheck = checkProfessionalWorkScheduleAndBlocks(tenantId, prof.id, dateStr, cleanS, cleanE);
        if (!schedCheck.valid) {
          if (!firstFailure) {
            firstFailure = {
              code: schedCheck.code,
              message: isGroupService && schedCheck.code === 'BLOCKED_TIME' ? 'Horário bloqueado' : schedCheck.error,
              statusLabel: schedCheck.code === 'BLOCKED_TIME' ? 'Horário bloqueado' : undefined
            };
          }
          continue;
        }

        if (!isGroupService && String(serviceRow.availability_mode || 'professional_schedule') === 'custom_windows') {
          const estProf = getTenantEstablishmentProfile(tenantId);
          const srvDom = resolveServiceDomain({
            establishmentProfile: estProf,
            serviceDomain: serviceRow.service_domain,
            serviceKind: serviceRow.service_kind,
            clinicalModule: serviceRow.clinical_module
          });
          if (supportsStudioFeatures(estProf) && srvDom === 'studio') {
            const customDaySegs = getServiceDayAvailabilitySegments({
              tenantId,
              serviceId: serviceRow.id,
              dayOfWeek: dow
            });
            const fitsServiceWindow = customDaySegs.some(seg => startMin >= seg.start && endMin <= seg.end);
            if (!fitsServiceWindow) {
              if (!firstFailure) {
                firstFailure = {
                  code: 'SERVICE_OUTSIDE_AVAILABILITY',
                  message: `Horário ${startClockHHMM} está fora da disponibilidade configurada para "${serviceRow.name}".`
                };
              }
              continue;
            }
          }
        }

        const extBusy = input.externalBusyByProfAndDate?.get(`${prof.id}|${dateStr}`);
        if (!isGroupService && extBusy && extBusy.length > 0) {
          const hasGcalConflict = extBusy.some(b => startMin < b.endMin && endMin > b.startMin);
          if (hasGcalConflict) {
            if (!firstFailure) firstFailure = { code: 'GOOGLE_BUSY', message: 'Profissional indisponível neste horário (agenda externa).' };
            continue;
          }
        }

        if (publicOnly && !isGroupService) {
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
              const rawLead =
                serviceRow.min_lead_time_hours !== undefined && serviceRow.min_lead_time_hours !== null
                  ? Number(serviceRow.min_lead_time_hours)
                  : 0;
              const timingCheck = !ignoreLeadTime
                ? evaluateSlotTimingStatus({
                    dateYmd: dateStr,
                    startTimeHhmm: startClockHHMM,
                    timeZone: tenantTz,
                    now: input.mockNow,
                    minLeadTimeHours: Math.max(0, rawLead),
                    maxAdvanceDays: ignoreAdvanceCap ? null : (Number(serviceRow.max_advance_days) || 60)
                  })
                : null;
              if (timingCheck && !timingCheck.eligible) {
                firstFailure = {
                  code: timingCheck.reasonCode || 'SLOT_UNAVAILABLE',
                  message: timingCheck.reasonMessage || `Horário ${startClockHHMM} indisponível para agendamento online em ${dateStr}.`
                };
              } else {
                firstFailure = {
                  code: 'SLOT_UNAVAILABLE',
                  message: `Horário ${startClockHHMM} indisponível para agendamento online em ${dateStr}.`
                };
              }
            }
            continue;
          }
        }
      }

      if (isGroupService) {
        const cleanStartMin = cleanS.slice(0, 16);
        const matchingOccs = db.prepare(`
          SELECT o.*
          FROM class_occurrences o
          WHERE o.tenant_id = ? AND o.service_id = ? AND o.professional_id = ?
            AND REPLACE(substr(o.start_time, 1, 16), ' ', 'T') = ?
          ORDER BY
            CASE WHEN o.status != 'cancelled' THEN 0 ELSE 1 END ASC,
            o.created_at ASC
        `).all(tenantId, serviceRow.id, prof.id, cleanStartMin) as any[];

        if (matchingOccs.length > 0 && matchingOccs.every(o => o.status === 'cancelled')) {
          if (!firstFailure) {
            firstFailure = { code: 'OCCURRENCE_CANCELLED', message: 'Turma cancelada', statusLabel: 'Turma cancelada' };
          }
          continue;
        }

        const occ = matchingOccs.find(o => o.status !== 'cancelled') || null;
        const occId = occ ? occ.id : null;
        const profConflict = db.prepare(`
          SELECT a.id FROM appointments a
          WHERE a.tenant_id = ? AND a.professional_id = ?
            AND a.status != 'cancelled'
            AND REPLACE(a.start_time, ' ', 'T') < ? AND REPLACE(a.end_time, ' ', 'T') > ?
            AND NOT (
              (a.service_id = ? AND REPLACE(substr(a.start_time, 1, 16), ' ', 'T') = ?)
              OR (a.occurrence_id IS NOT NULL AND ? IS NOT NULL AND a.occurrence_id = ?)
            )
          LIMIT 1
        `).get(tenantId, prof.id, cleanE, cleanS, serviceRow.id, cleanStartMin, occId, occId);
        if (profConflict) {
          if (!firstFailure) {
            firstFailure = {
              code: 'PROFESSIONAL_CONFLICT',
              message: 'Conflito com outro atendimento',
              statusLabel: 'Conflito com outro atendimento'
            };
          }
          continue;
        }

        const enrolledRows = db.prepare(`
          SELECT DISTINCT a.id, a.patient_id
          FROM appointments a
          WHERE a.tenant_id = ?
            AND a.status != 'cancelled'
            AND (
              (a.service_id = ? AND a.professional_id = ? AND REPLACE(substr(a.start_time, 1, 16), ' ', 'T') = ?)
              OR (? IS NOT NULL AND a.occurrence_id = ?)
            )
        `).all(tenantId, serviceRow.id, prof.id, cleanStartMin, occId, occId) as Array<{ id: string; patient_id: string }>;

        if (patientId && enrolledRows.some(r => r.patient_id === patientId)) {
          if (!firstFailure) {
            firstFailure = {
              code: 'ALREADY_ENROLLED',
              message: 'Aluno já inscrito',
              statusLabel: 'Aluno já inscrito'
            };
          }
          continue;
        }

        const fallbackHoldCounts = publicOnly && activePublicHolds.length > 0
          ? countPendingHoldsForSlot({
              holds: activePublicHolds,
              serviceId: serviceRow.id,
              professionalId: prof.id,
              startIso: cleanS,
              endIso: cleanE,
              isSharedGroup: true,
              classScheduleId: occ?.class_schedule_id || null
            })
          : { sameSlotGroupHolds: 0, conflictingProfessionalHolds: 0 };
        if (fallbackHoldCounts.conflictingProfessionalHolds > 0) {
          if (!firstFailure) {
            firstFailure = {
              code: 'PROFESSIONAL_CONFLICT',
              message: 'Conflito com outro atendimento',
              statusLabel: 'Conflito com outro atendimento'
            };
          }
          continue;
        }

        const cap = Math.max(1, Number(occ?.capacity) || Number(serviceRow.default_capacity) || 1);
        const enrolled = enrolledRows.length + fallbackHoldCounts.sameSlotGroupHolds;
        if (enrolled >= cap) {
          if (!firstFailure) {
            firstFailure = { code: 'CLASS_FULL', message: 'Turma lotada', statusLabel: 'Turma lotada' };
          }
          continue;
        }

        if (occRoomId) {
          const roomConflict = db.prepare(`
            SELECT a.id, r.name as room_name FROM appointments a
            LEFT JOIN rooms r ON r.id = a.room_id
            WHERE a.tenant_id = ? AND a.room_id = ?
              AND a.status != 'cancelled'
              AND REPLACE(a.start_time, ' ', 'T') < ? AND REPLACE(a.end_time, ' ', 'T') > ?
              AND NOT (
                (a.service_id = ? AND a.professional_id = ? AND REPLACE(substr(a.start_time, 1, 16), ' ', 'T') = ?)
                OR (a.occurrence_id IS NOT NULL AND ? IS NOT NULL AND a.occurrence_id = ?)
              )
            LIMIT 1
          `).get(tenantId, occRoomId, cleanE, cleanS, serviceRow.id, prof.id, cleanStartMin, occId, occId) as any;
          if (roomConflict) {
            if (!firstFailure) firstFailure = { code: 'ROOM_CONFLICT', message: `Sala ocupada em ${dateStr} (${startClockHHMM}).` };
            continue;
          }
        }

        const remSpots = Math.max(0, cap - enrolled);
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
          coInstructorIds: occPlan.coInstructorIds,
          classScheduleId: null,
          roomId: occRoomId || occ?.room_id || null,
          capacity: cap,
          remainingSpots: remSpots,
          statusLabel: `Disponível — ${remSpots} vaga${remSpots === 1 ? '' : 's'} restante${remSpots === 1 ? '' : 's'}`,
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

      if (publicOnly && activePublicHolds.length > 0) {
        const indivHold = countPendingHoldsForSlot({
          holds: activePublicHolds,
          serviceId: serviceRow.id,
          professionalId: prof.id,
          startIso: cleanS,
          endIso: cleanE,
          isSharedGroup: false
        });
        if (indivHold.conflictingProfessionalHolds > 0) {
          if (!firstFailure) firstFailure = { code: 'PROFESSIONAL_SLOT_OCCUPIED', message: `Horário reservado temporariamente para outro agendamento em ${dateStr} (${startClockHHMM}).` };
          continue;
        }
      }

      if (occRoomId) {
        const roomConflict = db.prepare(`
          SELECT a.id FROM appointments a
          WHERE a.tenant_id = ? AND a.room_id = ? AND a.status != 'cancelled'
            AND REPLACE(a.start_time, ' ', 'T') < ? AND REPLACE(a.end_time, ' ', 'T') > ?
          LIMIT 1
        `).get(tenantId, occRoomId, cleanE, cleanS);
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
        coInstructorIds: occPlan.coInstructorIds,
        classScheduleId: null,
        roomId: occRoomId || null,
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
        statusLabel: firstFailure?.statusLabel,
        alternatives: alternatives.length > 0 ? alternatives : undefined
      });
    }
  }

  const firstOcc = occurrences[0];
  let nextEligibleStartDate: string | null = null;
  if (
    firstOcc &&
    !firstOcc.available &&
    (firstOcc.reasonCode === 'LEAD_TIME_NOT_MET' ||
      firstOcc.reasonCode === 'SLOT_PAST' ||
      firstOcc.reasonCode === 'PAST_DATE' ||
      firstOcc.reasonCode === 'MIN_LEAD_TIME')
  ) {
    const laterAvail = occurrences.find(o => o.date > firstOcc.date && o.available);
    const laterOcc = occurrences.find(o => o.date > firstOcc.date);
    nextEligibleStartDate = laterAvail?.date || laterOcc?.date || addDaysYmd(firstOcc.date, 1);

    if (input.autoAdvanceFromLeadTime && !(input as any)._didAutoAdvance && nextEligibleStartDate > input.startDate) {
      return evaluateRecurrenceSeriesSync({
        ...input,
        startDate: nextEligibleStartDate,
        _didAutoAdvance: true,
        _originalStartDate: (input as any)._originalStartDate || input.startDate
      } as any);
    }
  }

  const availableCount = occurrences.filter(o => o.available).length;
  const conflictCount = occurrences.length - availableCount;
  const uniqueDays = Array.from(new Set(occurrences.map(o => o.dayOfWeek)));

  return {
    valid: occurrences.length > 0 && conflictCount === 0,
    seriesMode: recValidation.seriesMode,
    frequency: recValidation.frequency,
    durationCode: effDurationCode,
    intervalValue: recValidation.intervalValue,
    intervalUnit: recValidation.intervalUnit,
    description: formatRecurrenceDescription({
      frequency: recValidation.frequency,
      intervalValue: recValidation.intervalValue,
      intervalUnit: recValidation.intervalUnit,
      weekdays: Array.isArray(input.weekdays) && input.weekdays.length > 0 ? input.weekdays : uniqueDays,
      durationCode: effDurationCode,
      endDate: occurrences[occurrences.length - 1]?.date || generatedPlan.resolvedEndDate || null
    }),
    startDate: occurrences[0]?.date || input.startDate,
    endDate: occurrences[occurrences.length - 1]?.date || generatedPlan.resolvedEndDate || input.startDate,
    serviceId: serviceRow.id,
    serviceName: serviceRow.name,
    serviceKind: isGroupService ? 'group' : 'individual',
    modality: concreteServiceModality,
    totalCount: occurrences.length,
    availableCount,
    conflictCount,
    creditMode: resolvedCreditMode,
    creditsPerCycle: resolvedCreditsCap,
    nextEligibleStartDate: nextEligibleStartDate || ((input as any)._didAutoAdvance ? input.startDate : null),
    leadTimeShifted: Boolean((input as any)._didAutoAdvance),
    originalStartDate: (input as any)._originalStartDate || null,
    occurrences
  };
}

export async function evaluateRecurrenceSeriesWithExternalBusy(
  input: RecurrenceEvaluationInput
): Promise<RecurrenceEvaluationResult> {
  // First generate dates via dry run without external busy map if possible, or prefetch for generated dates
  const serviceRow = db.prepare(`
    SELECT id, name, duration_minutes, professional_id, COALESCE(service_kind, 'individual') as service_kind,
           COALESCE(allow_recurrence, 1) as allow_recurrence,
           allowed_recurrence_frequencies_json, default_recurrence_frequency,
           allowed_plan_durations_json, default_plan_duration,
           custom_recurrence_intervals_json, default_recurrence_interval_json,
           plan_credit_mode, plan_credits_per_cycle
    FROM services
    WHERE id = ? AND tenant_id = ? AND active = 1
  `).get(input.serviceId, input.tenantId) as any;

  if (!serviceRow) {
    throw Object.assign(new Error('Serviço não encontrado ou inativo nesta clínica.'), { status: 404, code: 'SERVICE_NOT_FOUND' });
  }

  const hasScheduleEntries = Array.isArray(input.scheduleEntries) && input.scheduleEntries.length > 0;
  const recValidation = validateServiceRecurrenceFrequency(
    serviceRow,
    input.frequency,
    input.intervalValue,
    input.intervalUnit,
    {
      durationCode: input.durationCode,
      seriesMode: input.seriesMode || (hasScheduleEntries ? 'schedule_plan' : undefined)
    }
  );
  if (!recValidation.valid) {
    throw Object.assign(new Error(recValidation.error), { status: 400, code: recValidation.code });
  }

  const endDateStr = input.endDate ? String(input.endDate).slice(0, 10) : undefined;
  const rawMax = input.maxOccurrences !== undefined && input.maxOccurrences !== null ? Number(input.maxOccurrences) : undefined;
  const resolvedCreditMode =
    input.creditMode ||
    (serviceRow.plan_credit_mode === 'fixed_credits' ||
    serviceRow.plan_credit_mode === 'weekly_guaranteed' ||
    serviceRow.plan_credit_mode === 'unlimited'
      ? serviceRow.plan_credit_mode
      : null);
  const resolvedCreditsCap =
    input.creditsPerCycle && Number(input.creditsPerCycle) > 0
      ? Math.floor(Number(input.creditsPerCycle))
      : (serviceRow.plan_credits_per_cycle && Number(serviceRow.plan_credits_per_cycle) > 0
          ? Math.floor(Number(serviceRow.plan_credits_per_cycle))
          : null);
  const effMaxOccurrences =
    rawMax !== undefined
      ? rawMax
      : (resolvedCreditMode === 'fixed_credits' && resolvedCreditsCap && resolvedCreditsCap > 0
          ? resolvedCreditsCap
          : undefined);

  const generatedPlan = generateSchedulePlanOccurrences({
    startDate: input.startDate,
    frequency: recValidation.frequency,
    intervalValue: recValidation.intervalValue,
    intervalUnit: recValidation.intervalUnit,
    durationCode: recValidation.durationCode,
    endDate: endDateStr,
    maxOccurrences: effMaxOccurrences,
    weekdays: Array.isArray(input.weekdays) ? input.weekdays : undefined,
    startClock: input.startClock,
    endClock: input.endClock || null,
    durationMinutes: Number(serviceRow.duration_minutes || 50),
    classScheduleId: input.classScheduleId || null,
    professionalId: input.professionalId && input.professionalId !== 'any' ? String(input.professionalId) : null,
    coInstructorIds: Array.isArray(input.coInstructorIds) ? input.coInstructorIds : null,
    roomId: input.roomId || null,
    modality: input.modality || null,
    scheduleEntries: hasScheduleEntries ? input.scheduleEntries : null,
    maxCap: input.publicOnly ? MAX_PUBLIC_RECURRENCE_OCCURRENCES : MAX_RECURRENCE_OCCURRENCES
  });
  const dates = Array.from(new Set(generatedPlan.occurrences.map(o => o.date)));

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
  if (serviceRow.service_kind !== 'group') {
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
  }

  return evaluateRecurrenceSeriesSync({
    ...input,
    externalBusyByProfAndDate: extBusyMap
  });
}
