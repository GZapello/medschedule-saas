import { db } from '../config/database';
import { getTenantEstablishmentProfile, resolveServiceDomain, supportsStudioFeatures } from './establishment-context';
import { getServiceDayAvailabilitySegments, intersectIntervalLists, mergeAdjacentSegments, parseClockMinutes } from './service-availability';
import { countPendingHoldsForSlot, getActivePendingSlotHolds } from './public-slot-holds';
import {
  formatLeadTimeLabel,
  getLocalDatePartsInTimezone,
  getLocalTodayYmd,
  getTenantTimezone,
  zonedDateTimeToUtcMs
} from './studio-timezone';

export interface AvailableSlot {
  time: string;           // '09:00'
  startTime: string;      // '2026-09-10T09:00:00'
  endTime: string;        // '2026-09-10T09:50:00'
  durationMinutes: number;
  bufferMinutes: number;
  serviceKind?: 'individual' | 'group';
  capacity?: number | null;
  enrolledCount?: number;
  remainingSpots?: number | null;
  occurrenceId?: string | null;
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

export interface CalculateSlotsOptions {
  // Used only by the authenticated Studio service editor to preview an unsaved individual service.
  serviceOverride?: {
    duration_minutes: number;
    buffer_minutes: number;
    modality: string;
    service_kind: 'individual';
    active: number;
    min_lead_time_hours: number;
    max_advance_days: number;
    service_domain?: string;
    clinical_module?: string | null;
    availability_mode?: 'professional_schedule' | 'custom_windows';
    availability_windows?: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
  };
  ignoreLeadTime?: boolean;
  ignoreAdvanceCap?: boolean;
  capacityOverride?: number | null;
  includePendingHolds?: boolean;
  excludeHoldRequestId?: string;
}

function subtractBreakFromSegments(
  segments: Array<{ start: number; end: number }>,
  breakStart: number | null,
  breakEnd: number | null
): Array<{ start: number; end: number }> {
  if (breakStart === null || breakEnd === null || breakEnd <= breakStart) {
    return segments;
  }
  const result: Array<{ start: number; end: number }> = [];
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

export function calculateAvailableSlots(
  tenantId: string,
  professionalId: string,
  serviceId: string,
  dateStr: string, // 'YYYY-MM-DD'
  roomId?: string,
  mockNow?: Date,
  externalBusyIntervals?: Array<{ startMin: number; endMin: number }>,
  patientId?: string,
  options?: CalculateSlotsOptions
): AvailableSlot[] {
  if (!db.prepare('SELECT 1 FROM professionals WHERE id = ? AND tenant_id = ? AND active = 1').get(professionalId, tenantId)) return [];
  if (roomId && !db.prepare('SELECT 1 FROM rooms WHERE id = ? AND tenant_id = ? AND active = 1').get(roomId, tenantId)) return [];
  // 1. Busca dados do serviço
  const serviceStmt = db.prepare(`
    SELECT COALESCE(ps.custom_duration, s.duration_minutes) AS duration_minutes,
           s.buffer_minutes, s.min_lead_time_hours, s.max_advance_days, s.active,
           s.modality, COALESCE(s.service_kind, 'individual') AS service_kind, s.default_capacity,
           s.service_domain, s.clinical_module,
           COALESCE(s.studio_service_type, CASE WHEN COALESCE(s.service_kind, 'individual') = 'group' THEN 'group' ELSE 'individual' END) AS studio_service_type,
           COALESCE(s.requires_appointment, 1) AS requires_appointment,
           COALESCE(s.availability_mode, 'professional_schedule') AS availability_mode
    FROM services s LEFT JOIN professional_services ps ON ps.service_id = s.id AND ps.professional_id = ?
    WHERE s.id = ? AND s.tenant_id = ? AND s.active = 1
  `);
  const service = (options?.serviceOverride || serviceStmt.get(professionalId, serviceId, tenantId)) as {
    duration_minutes: number;
    buffer_minutes: number;
    min_lead_time_hours: number;
    max_advance_days: number;
    modality?: string;
    service_kind: string;
    default_capacity: number | null;
    service_domain?: string | null;
    clinical_module?: string | null;
    studio_service_type?: string | null;
    requires_appointment?: number | null;
    availability_mode?: string | null;
  } | undefined;

  if (!service) return [];
  if (
    Number(service.requires_appointment ?? 1) === 0 ||
    service.studio_service_type === 'facility_access' ||
    service.studio_service_type === 'non_scheduled'
  ) {
    return [];
  }

  const estProfile = getTenantEstablishmentProfile(tenantId);
  const resolvedServiceDomain = resolveServiceDomain({
    establishmentProfile: estProfile,
    serviceDomain: service.service_domain,
    serviceKind: service.service_kind,
    clinicalModule: service.clinical_module
  });
  const capacityOverrideNum =
    options?.capacityOverride !== undefined && options?.capacityOverride !== null && Number(options.capacityOverride) >= 1
      ? Math.floor(Number(options.capacityOverride))
      : null;
  const effectiveRawCapacity = capacityOverrideNum !== null ? capacityOverrideNum : service.default_capacity;
  const isSharedCapacityStudio =
    supportsStudioFeatures(estProfile) &&
    resolvedServiceDomain === 'studio' &&
    (Number(effectiveRawCapacity) >= 2 || (capacityOverrideNum !== null && capacityOverrideNum === 1)) &&
    service.studio_service_type !== 'facility_access';
  const isGroupService =
    capacityOverrideNum !== null
      ? capacityOverrideNum >= 2
      : (service.service_kind === 'group' || isSharedCapacityStudio);
  const defaultGroupCapacity = isGroupService ? Math.max(1, Number(effectiveRawCapacity) || 1) : 1;
  const activePendingHolds = options?.includePendingHolds
    ? getActivePendingSlotHolds(tenantId, {
        datePrefix: dateStr,
        excludeRequestId: options.excludeHoldRequestId
      })
    : [];
  const useCustomServiceWindows =
    !isGroupService &&
    supportsStudioFeatures(estProfile) &&
    resolvedServiceDomain === 'studio' &&
    String(service.availability_mode || 'professional_schedule') === 'custom_windows';

  if (isGroupService) {
    // Quando a aula coletiva possui grade semanal configurada (class_schedules), a disponibilidade segue exclusivamente a grade.
    // Aulas coletivas legadas sem grade cadastrada preservam o cálculo pela escala do profissional.
    const { ClassScheduleService } = require('../services/class-schedule.service') as typeof import('../services/class-schedule.service');
    if (ClassScheduleService.hasAnySchedulesForService(tenantId, serviceId)) {
      const extMap = new Map<string, Array<{ startMin: number; endMin: number }>>();
      if (externalBusyIntervals && externalBusyIntervals.length > 0) {
        extMap.set(professionalId, externalBusyIntervals);
      }
      const { slots: scheduledSlots } = ClassScheduleService.getScheduledSlotsForDate({
        tenantId,
        serviceRow: {
          id: serviceId,
          name: '',
          duration_minutes: service.duration_minutes,
          buffer_minutes: service.buffer_minutes,
          min_lead_time_hours: service.min_lead_time_hours,
          max_advance_days: service.max_advance_days,
          modality: service.modality || 'presential',
          service_kind: 'group',
          default_capacity: service.default_capacity
        },
        dateStr,
        professionalId,
        externalBusyByProf: extMap,
        patientId,
        ignoreLeadTime: options?.ignoreLeadTime,
        ignoreAdvanceCap: options?.ignoreAdvanceCap,
        publicOnly: false,
        mockNow
      });
      return scheduledSlots
        .filter(s => !s.isFull)
        .map(s => ({
          time: s.time,
          startTime: s.startTime,
          endTime: s.endTime,
          durationMinutes: s.durationMinutes,
          bufferMinutes: s.bufferMinutes,
          serviceKind: 'group',
          capacity: s.capacity,
          enrolledCount: s.enrolledCount,
          remainingSpots: s.remainingSpots,
          occurrenceId: s.occurrenceId
        }));
    }
  }

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
  const tenantTz = getTenantTimezone(db, tenantId);
  const todayStr = getLocalTodayYmd(tenantTz, referenceDate); // 'YYYY-MM-DD'

  if (dateStr < todayStr) {
    return []; // Não permite agendar em dias passados
  }

  const [tY, tM, tD] = todayStr.split('-').map(Number);
  const todayOnly = new Date(tY, tM - 1, tD);
  const targetDate = new Date(targetYear, targetMonth - 1, targetDay);

  const maxDate = new Date(todayOnly);
  maxDate.setDate(maxDate.getDate() + (service.max_advance_days || 60));
  if (!options?.ignoreAdvanceCap && targetDate > maxDate) {
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
    SELECT start_time, end_time, room_id, service_id, occurrence_id, patient_id,
           COALESCE(service_kind, 'individual') as service_kind
    FROM appointments
    WHERE tenant_id = ?
      AND (professional_id = ? OR (? IS NOT NULL AND room_id = ?) OR (? IS NOT NULL AND patient_id = ?))
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
    patientId || null,
    patientId || null,
    `${dateStr}%`,
    `${dateStr}%`,
    `${dateStr}T23:59:59`,
    `${dateStr}T00:00:00`
  ) as {
    start_time: string;
    end_time: string;
    room_id: string | null;
    service_id: string | null;
    occurrence_id: string | null;
    patient_id: string | null;
    service_kind: string;
  }[];

  // Mapa de ocorrências coletivas ativas do dia para este serviço/profissional (vagas sem expor dados dos outros alunos)
  const groupOccurrencesByStart = new Map<string, { id: string; capacity: number; enrolledCount: number }>();
  if (isGroupService) {
    try {
      const occRows = db.prepare(`
        SELECT o.id, o.start_time, o.capacity,
               (SELECT COUNT(*) FROM appointments a WHERE a.tenant_id = o.tenant_id AND a.occurrence_id = o.id AND a.status NOT IN ('cancelled')) as enrolled_count
        FROM class_occurrences o
        WHERE o.tenant_id = ?
          AND o.professional_id = ?
          AND o.service_id = ?
          AND o.status != 'cancelled'
          AND REPLACE(o.start_time, ' ', 'T') LIKE ?
      `).all(tenantId, professionalId, serviceId, `${dateStr}%`) as any[];
      for (const occ of occRows) {
        const key = String(occ.start_time || '').trim().replace(' ', 'T').slice(0, 16);
        const enrolledCount = Number(
          (
            db.prepare(`
              SELECT COUNT(DISTINCT a.id) as c
              FROM appointments a
              WHERE a.tenant_id = ?
                AND a.status NOT IN ('cancelled')
                AND (
                  a.occurrence_id = ?
                  OR (a.service_id = ? AND a.professional_id = ? AND REPLACE(substr(a.start_time, 1, 16), ' ', 'T') = ?)
                )
            `).get(tenantId, occ.id, serviceId, professionalId, key) as any
          )?.c || occ.enrolled_count || 0
        );
        groupOccurrencesByStart.set(key, {
          id: occ.id,
          capacity: Math.max(1, Number(occ.capacity) || defaultGroupCapacity),
          enrolledCount
        });
      }
      // Inclui também horários com inscrições ativas deste mesmo serviço coletivo mesmo que ainda não possuam linha em class_occurrences
      for (const appt of rawAppts) {
        if (appt.service_id === serviceId) {
          const key = String(appt.start_time || '').trim().replace(' ', 'T').slice(0, 16);
          if (!groupOccurrencesByStart.has(key)) {
            const countSame = rawAppts.filter(
              a => a.service_id === serviceId && String(a.start_time || '').trim().replace(' ', 'T').slice(0, 16) === key
            ).length;
            groupOccurrencesByStart.set(key, {
              id: appt.occurrence_id || '',
              capacity: defaultGroupCapacity,
              enrolledCount: countSame
            });
          }
        }
      }
    } catch (_) {}
  }

  const existingApptIntervals = rawAppts.map(appt => ({
    startMin: parseDateTimeToMinuteOfDay(appt.start_time, dateStr),
    endMin: parseDateTimeToMinuteOfDay(appt.end_time, dateStr),
    startKey: String(appt.start_time || '').trim().replace(' ', 'T').slice(0, 16),
    serviceId: appt.service_id,
    occurrenceId: appt.occurrence_id,
    patientId: appt.patient_id,
    serviceKind: appt.service_kind
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
  const rawMinLeadHours = (service.min_lead_time_hours !== undefined && service.min_lead_time_hours !== null)
    ? Number(service.min_lead_time_hours)
    : 0;
  const minLeadHours = options?.ignoreLeadTime ? 0 : Math.max(0, rawMinLeadHours);
  const minAllowedTimestampMs = referenceDate.getTime() + minLeadHours * 3600000;
  const dayStartTimestampMs = zonedDateTimeToUtcMs(dateStr, '00:00', tenantTz);

  const isToday = dateStr === todayStr;

  const nowLocalParts = getLocalDatePartsInTimezone(referenceDate, tenantTz);
  const currentMinutesInDay = nowLocalParts.minutesOfDay;

  const slotStep = totalSlotDuration > 0 ? totalSlotDuration : duration;
  const customServiceDaySegments = useCustomServiceWindows
    ? getServiceDayAvailabilitySegments({
        tenantId,
        serviceId,
        dayOfWeek,
        overrideWindows: options?.serviceOverride?.availability_windows
      })
    : [];

  if (useCustomServiceWindows && customServiceDaySegments.length === 0) {
    return [];
  }

  // 8. Itera sobre cada período/turno de trabalho configurado para o profissional,
  // dividindo o expediente em sub-janelas ao redor dos intervalos de almoço/descanso
  // para que o retorno do intervalo comece exatamente no fim da pausa (ex: 13:00 ou 13:30, e não 13:50).
  for (const schedule of activeSchedules) {
    const workStartMin = timeToMinutes(schedule.start_time);
    const workEndMin = timeToMinutes(schedule.end_time);
    const breakStartMin = schedule.break_start ? timeToMinutes(schedule.break_start) : null;
    const breakEndMin = schedule.break_end ? timeToMinutes(schedule.break_end) : null;

    const effectiveStartMin = Math.max(workStartMin, clinicStartMin);
    const effectiveEndMin = Math.min(workEndMin, clinicEndMin);
    if (effectiveStartMin >= effectiveEndMin) continue;

    let workingSegments = [{ start: effectiveStartMin, end: effectiveEndMin }];
    workingSegments = subtractBreakFromSegments(workingSegments, breakStartMin, breakEndMin);
    workingSegments = subtractBreakFromSegments(workingSegments, clinicBreakStartMin, clinicBreakEndMin);
    if (useCustomServiceWindows) {
      workingSegments = intersectIntervalLists(workingSegments, customServiceDaySegments);
      if (workingSegments.length === 0) continue;
    }

    for (const seg of workingSegments) {
      let current = seg.start;
      while (current + duration <= seg.end) {
        const slotEndMin = current + duration;
        const slotStartIso = `${dateStr}T${minutesToTime(current)}:00`;
        const slotStartMs = zonedDateTimeToUtcMs(dateStr, minutesToTime(current), tenantTz);

        // Se for hoje (ou estiver dentro da janela de antecedência mínima), avança
        const isBeforeMinTime = (isToday && current < currentMinutesInDay) || (slotStartMs <= referenceDate.getTime()) || (slotStartMs < minAllowedTimestampMs);
        if (isBeforeMinTime) {
          const nextGrid = current + slotStep;
          const cutoffFromMs = Math.max(0, Math.ceil((minAllowedTimestampMs - dayStartTimestampMs) / 60000));
          const cutoffMin = Math.max(isToday ? currentMinutesInDay : 0, cutoffFromMs);
          const alignedCutoff = Math.ceil(cutoffMin / 10) * 10;
          if (
            alignedCutoff > current &&
            alignedCutoff < nextGrid &&
            nextGrid + duration > seg.end &&
            alignedCutoff + duration <= seg.end
          ) {
            current = alignedCutoff;
          } else {
            current = nextGrid;
          }
          continue;
        }

        // Checa conflito com agendamentos existentes, bloqueios, reservas temporárias ativas e Google Agenda
        let maxConflictRecovery = -1;
        const slotStartKey = slotStartIso.slice(0, 16);
        const slotEndIso = `${dateStr}T${minutesToTime(slotEndMin)}:00`;
        const slotOcc = isGroupService ? groupOccurrencesByStart.get(slotStartKey) : undefined;
        const holdCounts = activePendingHolds.length > 0
          ? countPendingHoldsForSlot({
              holds: activePendingHolds,
              serviceId,
              professionalId,
              startIso: slotStartIso,
              endIso: slotEndIso,
              isSharedGroup: isGroupService
            })
          : { sameSlotGroupHolds: 0, conflictingProfessionalHolds: 0 };

        const slotOccEffectiveEnrolled = slotOcc ? (slotOcc.enrolledCount + holdCounts.sameSlotGroupHolds) : holdCounts.sameSlotGroupHolds;
        const slotCapLimit = slotOcc ? slotOcc.capacity : defaultGroupCapacity;

        for (const appt of existingApptIntervals) {
          if (current < appt.endMin && slotEndMin > appt.startMin) {
            const isSameNonFullGroupOccurrence = Boolean(
              isGroupService &&
              appt.serviceId === serviceId &&
              appt.startKey === slotStartKey &&
              (!slotOcc?.id || !appt.occurrenceId || appt.occurrenceId === slotOcc.id) &&
              slotOccEffectiveEnrolled < slotCapLimit &&
              (!patientId || appt.patientId !== patientId)
            );
            if (!isSameNonFullGroupOccurrence) {
              maxConflictRecovery = Math.max(maxConflictRecovery, appt.endMin + buffer);
            }
          }
        }

        if (holdCounts.conflictingProfessionalHolds > 0) {
          maxConflictRecovery = Math.max(maxConflictRecovery, slotEndMin + buffer);
        } else if (!isGroupService && holdCounts.sameSlotGroupHolds > 0) {
          maxConflictRecovery = Math.max(maxConflictRecovery, slotEndMin + buffer);
        } else if (isGroupService && slotOccEffectiveEnrolled >= slotCapLimit) {
          maxConflictRecovery = Math.max(maxConflictRecovery, slotEndMin + buffer);
        }

        for (const blk of blockedIntervals) {
          if (current < blk.endMin && slotEndMin > blk.startMin) {
            maxConflictRecovery = Math.max(maxConflictRecovery, blk.endMin);
          }
        }

        if (!isGroupService && externalBusyIntervals && externalBusyIntervals.length > 0) {
          for (const ext of externalBusyIntervals) {
            if (current < ext.endMin && slotEndMin > ext.startMin) {
              maxConflictRecovery = Math.max(maxConflictRecovery, ext.endMin);
            }
          }
        }

        if (maxConflictRecovery > current) {
          const nextGrid = current + slotStep;
          if (maxConflictRecovery > nextGrid) {
            current = maxConflictRecovery;
          } else if (nextGrid + duration > seg.end && maxConflictRecovery + duration <= seg.end) {
            current = maxConflictRecovery;
          } else {
            current = nextGrid;
          }
          continue;
        }

        if (!seenTimes.has(slotStartIso)) {
          seenTimes.add(slotStartIso);
          const slotItem: AvailableSlot = {
            time: minutesToTime(current),
            startTime: slotStartIso,
            endTime: slotEndIso,
            durationMinutes: duration,
            bufferMinutes: buffer
          };
          if (isGroupService) {
            const occ = groupOccurrencesByStart.get(slotStartIso.slice(0, 16));
            const cap = occ ? occ.capacity : defaultGroupCapacity;
            const enrolled = (occ ? occ.enrolledCount : 0) + holdCounts.sameSlotGroupHolds;
            slotItem.serviceKind = 'group';
            slotItem.capacity = cap;
            slotItem.enrolledCount = enrolled;
            slotItem.remainingSpots = Math.max(0, cap - enrolled);
            slotItem.occurrenceId = occ ? occ.id : null;
          } else {
            slotItem.serviceKind = 'individual';
          }
          slots.push(slotItem);
        }

        current += slotStep;
      }
    }
  }

  // Ordena por horário crescente
  slots.sort((a, b) => a.startTime.localeCompare(b.startTime));
  return slots;
}

export function explainEmptySlots(
  tenantId: string,
  professionalId: string,
  serviceId: string,
  dateStr: string,
  roomId?: string,
  mockNow?: Date,
  externalBusyIntervals?: Array<{ startMin: number; endMin: number }>,
  patientId?: string,
  options?: CalculateSlotsOptions
): { reasonCode: string; message: string } {
  const referenceDate = mockNow || new Date();
  const tenantTz = getTenantTimezone(db, tenantId);
  const todayStr = getLocalTodayYmd(tenantTz, referenceDate);

  if (dateStr < todayStr) {
    return {
      reasonCode: 'PAST_DATE',
      message: 'Não há horários disponíveis porque a data selecionada já passou.'
    };
  }

  const holiday = db.prepare(`
    SELECT name FROM holidays
    WHERE date = ? AND (tenant_id = ? OR is_national = 1) AND active = 1
  `).get(dateStr, tenantId) as { name?: string } | undefined;
  if (holiday) {
    return {
      reasonCode: 'HOLIDAY',
      message: 'Não há horários disponíveis pois a data selecionada está cadastrada como feriado.'
    };
  }

  const [targetYear, targetMonth, targetDay] = dateStr.split('-').map(Number);
  const dayOfWeek = new Date(Date.UTC(targetYear, targetMonth - 1, targetDay, 12, 0, 0)).getUTCDay();

  const tenantRow = db.prepare('SELECT business_hours_json FROM tenants WHERE id = ?').get(tenantId) as { business_hours_json?: string } | undefined;
  if (tenantRow?.business_hours_json) {
    try {
      const bhList = JSON.parse(tenantRow.business_hours_json);
      if (Array.isArray(bhList)) {
        const found = bhList.find((bh: any) => Number(bh.dayOfWeek) === dayOfWeek);
        if (found && (found.isOpen === false || found.active === false)) {
          return {
            reasonCode: 'CLINIC_CLOSED',
            message: 'A clínica não possui expediente aberto neste dia da semana.'
          };
        }
      }
    } catch (_) {}
  }

  const activeSchedules = db.prepare(`
    SELECT start_time, end_time
    FROM schedules
    WHERE tenant_id = ? AND professional_id = ? AND day_of_week = ? AND is_active = 1
  `).all(tenantId, professionalId, dayOfWeek) as { start_time: string; end_time: string }[];

  if (!activeSchedules || activeSchedules.length === 0) {
    return {
      reasonCode: 'NO_SCHEDULE',
      message: 'O profissional não possui escala de atendimento configurada para este dia da semana.'
    };
  }

  const serviceMeta = options?.serviceOverride
    ? options.serviceOverride
    : (db.prepare(`
        SELECT COALESCE(service_kind, 'individual') AS service_kind,
               service_domain, clinical_module,
               COALESCE(availability_mode, 'professional_schedule') AS availability_mode
        FROM services
        WHERE id = ? AND tenant_id = ? AND active = 1
      `).get(serviceId, tenantId) as any);

  if (serviceMeta) {
    const estProfile = getTenantEstablishmentProfile(tenantId);
    const resolvedDomain = resolveServiceDomain({
      establishmentProfile: estProfile,
      serviceDomain: serviceMeta.service_domain,
      serviceKind: serviceMeta.service_kind,
      clinicalModule: serviceMeta.clinical_module
    });
    const isGroupService = serviceMeta.service_kind === 'group';
    const useCustomServiceWindows =
      !isGroupService &&
      supportsStudioFeatures(estProfile) &&
      resolvedDomain === 'studio' &&
      String(serviceMeta.availability_mode || 'professional_schedule') === 'custom_windows';

    if (useCustomServiceWindows) {
      const customSegments = getServiceDayAvailabilitySegments({
        tenantId,
        serviceId,
        dayOfWeek,
        overrideWindows: options?.serviceOverride?.availability_windows
      });
      if (customSegments.length === 0) {
        return {
          reasonCode: 'SERVICE_AVAILABILITY_CLOSED',
          message: 'Este serviço não possui horários disponíveis configurados para este dia da semana.'
        };
      }
      const scheduleSegments = activeSchedules.map(s => ({
        start: timeToMinutes(s.start_time),
        end: timeToMinutes(s.end_time)
      }));
      const intersected = intersectIntervalLists(scheduleSegments, customSegments);
      if (intersected.length === 0) {
        return {
          reasonCode: 'SERVICE_AVAILABILITY_CLOSED',
          message: 'Os horários configurados para este serviço não coincidem com a escala ativa do profissional neste dia.'
        };
      }
    }
  }

  if (dateStr === todayStr) {
    const currentMin = getLocalDatePartsInTimezone(referenceDate, tenantTz).minutesOfDay;
    const maxShiftEnd = Math.max(...activeSchedules.map(s => timeToMinutes(s.end_time)));
    if (currentMin >= maxShiftEnd) {
      return {
        reasonCode: 'SHIFT_ENDED',
        message: 'O expediente do profissional para hoje já foi encerrado.'
      };
    }
  }

  if (!options?.ignoreLeadTime) {
    const slotsWithoutLead = calculateAvailableSlots(
      tenantId,
      professionalId,
      serviceId,
      dateStr,
      roomId,
      referenceDate,
      externalBusyIntervals,
      patientId,
      { ignoreLeadTime: true }
    );
    if (slotsWithoutLead.length > 0) {
      const srvLead = db.prepare('SELECT min_lead_time_hours FROM services WHERE id = ? AND tenant_id = ?').get(serviceId, tenantId) as { min_lead_time_hours?: number | null } | undefined;
      const leadHours = Math.max(0, Number(srvLead?.min_lead_time_hours || 0));
      return {
        reasonCode: 'LEAD_TIME_NOT_MET',
        message: leadHours > 0
          ? `Os horários restantes de hoje exigem antecedência mínima de ${formatLeadTimeLabel(leadHours)} para agendamento online.`
          : 'Os horários restantes para esta data estão dentro do prazo de antecedência mínima do serviço.'
      };
    }
  }

  return {
    reasonCode: 'ALL_OCCUPIED_OR_BLOCKED',
    message: 'Todos os horários da grade para esta data e profissional já estão ocupados ou bloqueados.'
  };
}

export interface NextAvailableDateInfo {
  date: string;
  slotsCount: number;
  firstSlotTime: string;
  previewSlots: AvailableSlot[];
}

export interface UpcomingDayAvailability {
  date: string;
  available: boolean;
  slotsCount: number;
  firstSlotTime: string | null;
}

export interface AlternativeProfessionalAvailability {
  id: string;
  name: string;
  slug: string | null;
  photo_url: string | null;
  profession_name: string | null;
  specialty_name: string | null;
  serviceId: string;
  serviceName: string;
  date: string;
  isSameDate: boolean;
  slotsCount: number;
  firstSlotTime: string;
  previewSlots: AvailableSlot[];
}

function addDaysToIsoDate(dateStr: string, daysToAdd: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + daysToAdd);
  return dt.toISOString().slice(0, 10);
}

/**
 * Encontra a próxima data com horários disponíveis para um profissional e serviço.
 */
export function findNextAvailableDate(
  tenantId: string,
  professionalId: string,
  serviceId: string,
  startFromDateStr: string,
  maxDaysToSearch = 30,
  excludeDateStr?: string
): NextAvailableDateInfo | null {
  for (let i = 0; i <= maxDaysToSearch; i++) {
    const candidateDate = addDaysToIsoDate(startFromDateStr, i);
    if (excludeDateStr && candidateDate === excludeDateStr) continue;
    const candidateSlots = calculateAvailableSlots(tenantId, professionalId, serviceId, candidateDate);
    if (candidateSlots.length > 0) {
      return {
        date: candidateDate,
        slotsCount: candidateSlots.length,
        firstSlotTime: candidateSlots[0].time,
        previewSlots: candidateSlots.slice(0, 6)
      };
    }
  }
  return null;
}

/**
 * Calcula insights completos de disponibilidade para orientar o paciente no agendamento online.
 */
export function buildPublicAvailabilityInsights(
  tenantId: string,
  professionalId: string,
  serviceId: string,
  requestedDateStr: string,
  options?: { includeAlternativeProfessionals?: boolean }
): {
  nextAvailable: NextAvailableDateInfo | null;
  earliestAvailable: NextAvailableDateInfo | null;
  upcomingDays: UpcomingDayAvailability[];
  alternativeProfessionals: AlternativeProfessionalAvailability[];
} {
  const todayStr = getLocalTodayYmd(getTenantTimezone(db, tenantId));
  const baseStart = requestedDateStr >= todayStr ? requestedDateStr : todayStr;

  // 1. Próxima data disponível após a data solicitada (se a data solicitada estiver dentro de um horizonte razoável)
  const nextAfterRequested = findNextAvailableDate(
    tenantId,
    professionalId,
    serviceId,
    addDaysToIsoDate(baseStart, 1),
    45,
    requestedDateStr
  );

  // 2. Data mais próxima disponível a partir de hoje (útil se o paciente escolheu uma data distante sem agenda)
  const earliestFromToday = findNextAvailableDate(
    tenantId,
    professionalId,
    serviceId,
    todayStr,
    45,
    requestedDateStr
  );

  const nextAvailable = nextAfterRequested || earliestFromToday;

  // 3. Janela de próximos 14 dias a partir de hoje + janela ao redor da data escolhida
  const dateSet = new Set<string>();
  for (let i = 0; i < 14; i++) {
    dateSet.add(addDaysToIsoDate(todayStr, i));
  }
  if (requestedDateStr >= todayStr) {
    for (let offset = -2; offset <= 4; offset++) {
      const around = addDaysToIsoDate(requestedDateStr, offset);
      if (around >= todayStr) dateSet.add(around);
    }
  }
  const sortedDates = Array.from(dateSet).sort().slice(0, 21);
  const upcomingDays: UpcomingDayAvailability[] = sortedDates.map(d => {
    const daySlots = calculateAvailableSlots(tenantId, professionalId, serviceId, d);
    return {
      date: d,
      available: daySlots.length > 0,
      slotsCount: daySlots.length,
      firstSlotTime: daySlots.length > 0 ? daySlots[0].time : null
    };
  });

  // 4. Outros profissionais disponíveis na clínica para o mesmo serviço ou mesma área/profissão
  const alternativeProfessionals: AlternativeProfessionalAvailability[] = [];
  if (options?.includeAlternativeProfessionals) {
    const currentProf = db.prepare(`
      SELECT id, profession_id, specialty_id, COALESCE(specialty_custom, '') as specialty_custom
      FROM professionals
      WHERE id = ? AND tenant_id = ?
    `).get(professionalId, tenantId) as any;

    const otherProfs = db.prepare(`
      SELECT
        p.id, p.name, p.slug, p.photo_url, p.profession_id, p.specialty_id,
        COALESCE(p.specialty_custom, spec.name) as specialty_name,
        COALESCE(prof.name, p.profession_name) as profession_name
      FROM professionals p
      LEFT JOIN specialties spec ON spec.id = p.specialty_id
      LEFT JOIN professions prof ON prof.id = p.profession_id
      WHERE p.tenant_id = ? AND p.active = 1 AND p.public_booking_enabled = 1 AND p.id != ?
      ORDER BY p.name ASC
    `).all(tenantId, professionalId) as any[];

    for (const other of otherProfs) {
      // Verifica se este profissional atende o mesmo serviceId
      const sameService = db.prepare(`
        SELECT s.id, s.name
        FROM services s
        LEFT JOIN professional_services ps ON ps.service_id = s.id AND ps.professional_id = ?
        WHERE s.tenant_id = ? AND s.id = ? AND s.active = 1 AND (s.professional_id = ? OR ps.professional_id = ?)
      `).get(other.id, tenantId, serviceId, other.id, other.id) as { id: string; name: string } | undefined;

      let targetService = sameService;
      if (!targetService && currentProf) {
        const sameArea =
          (currentProf.profession_id && other.profession_id === currentProf.profession_id) ||
          (currentProf.specialty_id && other.specialty_id === currentProf.specialty_id);
        if (sameArea) {
          targetService = db.prepare(`
            SELECT s.id, s.name
            FROM services s
            LEFT JOIN professional_services ps ON ps.service_id = s.id AND ps.professional_id = ?
            WHERE s.tenant_id = ? AND s.active = 1 AND (s.professional_id = ? OR ps.professional_id = ?)
            ORDER BY s.name ASC
            LIMIT 1
          `).get(other.id, tenantId, other.id, other.id) as { id: string; name: string } | undefined;
        }
      }

      if (!targetService) continue;

      // Tenta primeiro na mesma data escolhida pelo usuário
      const sameDateSlots = requestedDateStr >= todayStr
        ? calculateAvailableSlots(tenantId, other.id, targetService.id, requestedDateStr)
        : [];

      if (sameDateSlots.length > 0) {
        alternativeProfessionals.push({
          id: other.id,
          name: other.name,
          slug: other.slug || null,
          photo_url: other.photo_url || null,
          profession_name: other.profession_name || null,
          specialty_name: other.specialty_name || null,
          serviceId: targetService.id,
          serviceName: targetService.name,
          date: requestedDateStr,
          isSameDate: true,
          slotsCount: sameDateSlots.length,
          firstSlotTime: sameDateSlots[0].time,
          previewSlots: sameDateSlots.slice(0, 4)
        });
      } else {
        const nextOther = findNextAvailableDate(tenantId, other.id, targetService.id, todayStr, 21);
        if (nextOther) {
          alternativeProfessionals.push({
            id: other.id,
            name: other.name,
            slug: other.slug || null,
            photo_url: other.photo_url || null,
            profession_name: other.profession_name || null,
            specialty_name: other.specialty_name || null,
            serviceId: targetService.id,
            serviceName: targetService.name,
            date: nextOther.date,
            isSameDate: nextOther.date === requestedDateStr,
            slotsCount: nextOther.slotsCount,
            firstSlotTime: nextOther.firstSlotTime,
            previewSlots: nextOther.previewSlots.slice(0, 4)
          });
        }
      }
    }

    // Prioriza quem tem horário na mesma data e depois pela data mais próxima
    alternativeProfessionals.sort((a, b) => {
      if (a.isSameDate !== b.isSameDate) return a.isSameDate ? -1 : 1;
      return a.date.localeCompare(b.date);
    });
  }

  return {
    nextAvailable,
    earliestAvailable: earliestFromToday,
    upcomingDays,
    alternativeProfessionals
  };
}

