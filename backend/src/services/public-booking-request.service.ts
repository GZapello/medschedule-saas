import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';
import { PackageService } from './package.service';
import { BillingCycleService } from './billing-cycle.service';
import { quoteFrequencyPlan } from './frequency-pricing.service';
import { NotificationService } from './notification.service';
import { GoogleCalendarService } from './google-calendar.service';
import {
  InternalNotificationService,
  InternalNotificationRecord,
  CONFIRMATION_NOTIFICATION_TTL_MINUTES,
  addMinutesToIso,
  formatDateBr,
  formatTimeRange,
  formatWeekdaysList,
  getWeekdayNumber
} from './internal-notification.service';
import {
  generateSchedulePlanOccurrences,
  resolveOrCreateGroupOccurrenceTx,
  SchedulePlanEntryInput
} from './class-group.service';
import { ClassScheduleService, getDayOfWeekFromYmd, todayBrazilYmd } from './class-schedule.service';
import { StudioAccessService } from './studio-access.service';
import { normalizeStudioAccessConfig } from '../utils/studio-access-and-commercial';
import { resolveConcreteModality, sanitizeBookingErrorMessage } from '../utils/modality-resolver';
import {
  resolveBookingTenant,
  publicBookingProfessional,
  professionalBookingService,
  validBookingDate
} from '../utils/public-booking';
import { calculateAvailableSlots } from '../utils/slot-calculator';
import { bookingTime } from '../utils/booking-time';
import { validateBrazilianPhone, normalizePhoneWithDDI, cleanPhoneDigits } from '../utils/phone.utils';
import { isPrimaryClinicalModule, resolveClinicalModule } from '../utils/clinical-module';
import { canOperate } from './billing.service';
import { validateClinicBusinessHours, validateProfessionalSchedule } from '../utils/booking-validators';
import {
  MAX_PUBLIC_RECURRENCE_OCCURRENCES,
  PlanDurationCode,
  RecurrenceFrequency,
  RecurrenceIntervalUnit,
  getTenantEstablishmentProfile,
  resolvePlanDurationEndDate,
  resolveServiceDomain,
  validateServiceRecurrenceFrequency
} from '../utils/establishment-context';

export type ExpandedStudioSlotItem = {
  serviceRow: any;
  preferredProfId: string;
  classScheduleId: string | null;
  requestedModality: unknown;
  startIso: string;
  endIso: string;
  isRecurrenceFollowUp: boolean;
  recurrenceMeta?: {
    seriesMode: 'legacy' | 'schedule_plan';
    durationCode: PlanDurationCode | null;
    scheduleEntriesJson: string | null;
    frequency: RecurrenceFrequency;
    intervalValue: number | null;
    intervalUnit: RecurrenceIntervalUnit | null;
    weekdays: number[];
  } | null;
};

function formatModalityLabelPt(modality?: string | null): string {
  if (modality === 'online') return 'Online';
  if (modality === 'home') return 'Domiciliar';
  return 'Presencial';
}

function formatPlanDurationLabelPt(durationCode?: string | null, recurrence?: any): string | null {
  if (!durationCode) return null;
  const map: Record<string, string> = {
    monthly: 'Mensal (1 mês)',
    '1_month': '1 mês',
    '30_days': '30 dias',
    '2_months': '2 meses',
    quarterly: 'Trimestral (3 meses)',
    '3_months': 'Trimestral (3 meses)',
    semiannual: 'Semestral (6 meses)',
    '6_months': 'Semestral (6 meses)',
    annual: 'Anual (12 meses)',
    '12_months': 'Anual (12 meses)'
  };
  if (map[durationCode]) return map[durationCode];
  if (durationCode === 'custom_date' && recurrence?.endDate) {
    return `Até ${formatDateBr(String(recurrence.endDate).slice(0, 10))}`;
  }
  if (durationCode === 'count' && recurrence?.maxOccurrences) {
    return `${Number(recurrence.maxOccurrences)} sessões`;
  }
  return null;
}

function extractValidWhatsappPhone(rawPhone?: string | null, rawWhatsapp?: string | null): string | null {
  const candidates = [rawWhatsapp, rawPhone];
  for (const cand of candidates) {
    if (!cand) continue;
    if (validateBrazilianPhone(cand).valid) {
      const normalized = normalizePhoneWithDDI(cand);
      const digits = cleanPhoneDigits(normalized);
      if (digits.length >= 12 && digits.length <= 13) return normalized;
    }
  }
  return null;
}

function generateRequestNumber(tenantId: string): string {
  const year = new Date().getFullYear();
  const row = db
    .prepare('SELECT COUNT(*) as c FROM public_booking_requests WHERE tenant_id = ?')
    .get(tenantId) as { c: number } | undefined;
  const count = (Number(row?.c || 0)) + 1;
  return `SOL-${year}-${String(count).padStart(4, '0')}`;
}

function getLinkedPublicProfessionals(tenantId: string, serviceId: string, preferredProfId?: string): Array<{
  id: string;
  name: string;
  photo_url: string | null;
  profession_name: string | null;
  profession_id: string | null;
}> {
  let extraFilter = '';
  if (preferredProfId && preferredProfId !== 'any') {
    extraFilter = ' AND p.id = ?';
  }
  return db.prepare(`
    SELECT DISTINCT p.id, p.name, p.photo_url, COALESCE(pr.name, '') as profession_name, p.profession_id
    FROM professionals p
    LEFT JOIN professions pr ON pr.id = p.profession_id
    LEFT JOIN professional_services ps ON ps.professional_id = p.id AND ps.service_id = ?
    JOIN services s ON s.id = ? AND s.tenant_id = p.tenant_id
    WHERE p.tenant_id = ?
      AND p.active = 1
      AND p.public_booking_enabled = 1
      AND s.active = 1
      AND (
        s.professional_id = p.id
        OR ps.professional_id = p.id
        OR EXISTS (
          SELECT 1 FROM class_schedules cs
          WHERE cs.service_id = s.id AND cs.tenant_id = p.tenant_id AND cs.professional_id = p.id AND cs.active = 1
        )
      )
      ${extraFilter}
    ORDER BY p.name ASC
  `).all(serviceId, serviceId, tenantId, ...(preferredProfId && preferredProfId !== 'any' ? [preferredProfId] : [])) as any[];
}

function computeClockOffsetEnd(startClock: string, durationMinutes: number): string {
  const [sh, sm] = startClock.slice(0, 5).split(':').map(Number);
  const total = (sh * 60 + sm) + Math.max(5, durationMinutes || 50);
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00`;
}

function expandStudioScheduleItem(tenantId: string, item: {
  serviceId: string;
  professionalId?: string;
  classScheduleId?: string | null;
  modality?: unknown;
  startTime: string;
  endTime?: string;
  recurrence?: any;
}): ExpandedStudioSlotItem[] {
  const srv = db.prepare(`
    SELECT id, name, price, duration_minutes, professional_id, COALESCE(service_kind, 'individual') as service_kind,
           default_capacity, COALESCE(allow_recurrence, 1) as allow_recurrence,
           allowed_recurrence_frequencies_json, default_recurrence_frequency,
           allowed_plan_durations_json, default_plan_duration,
           custom_recurrence_intervals_json, default_recurrence_interval_json,
           service_domain, modality, clinical_module, billing_mode, default_billing_due_day,
           COALESCE(availability_mode, 'professional_schedule') as availability_mode
    FROM services WHERE id = ? AND tenant_id = ? AND active = 1
  `).get(item.serviceId, tenantId) as any;

  if (!srv) {
    throw Object.assign(new Error('Serviço selecionado não está ativo neste estabelecimento.'), { status: 400 });
  }

  resolveConcreteModality({
    serviceModality: srv.modality,
    requestedModality: item.modality,
    allowHome: true
  });

  const normStart = bookingTime(item.startTime);
  if (!normStart || !validBookingDate(normStart.slice(0, 10))) {
    throw Object.assign(new Error('Horário inicial inválido para o agendamento.'), { status: 400 });
  }

  const startDate = normStart.slice(0, 10);
  const startClock = normStart.slice(11, 19);
  const computedEndClock = item.endTime && bookingTime(item.endTime)
    ? bookingTime(item.endTime)!.slice(11, 19)
    : computeClockOffsetEnd(startClock, Number(srv.duration_minutes || 50));

  const preferredProfId = item.professionalId && item.professionalId !== 'any' ? String(item.professionalId) : 'any';

  const reqDurationCode = item.recurrence?.durationCode ?? item.recurrence?.planDurationCode ?? null;
  const reqScheduleEntries = Array.isArray(item.recurrence?.scheduleEntries) ? item.recurrence.scheduleEntries : [];
  const hasRecurrenceBound = Boolean(
    item.recurrence &&
    (item.recurrence.maxOccurrences ||
      item.recurrence.endDate ||
      (reqDurationCode && !['count', 'custom_date', 'legacy_frequency'].includes(reqDurationCode)) ||
      reqScheduleEntries.length > 0)
  );

  if (hasRecurrenceBound && item.recurrence) {
    const recValidation = validateServiceRecurrenceFrequency(
      srv,
      item.recurrence.frequency,
      item.recurrence.intervalValue ?? item.recurrence.interval_value,
      item.recurrence.intervalUnit ?? item.recurrence.interval_unit,
      {
        durationCode: reqDurationCode,
        seriesMode: item.recurrence.seriesMode || (reqScheduleEntries.length > 0 ? 'schedule_plan' : undefined)
      }
    );
    if (!recValidation.valid) {
      throw Object.assign(new Error(recValidation.error), { status: 400, code: recValidation.code });
    }
    const rawMax = item.recurrence.maxOccurrences !== undefined && item.recurrence.maxOccurrences !== null
      ? Number(item.recurrence.maxOccurrences)
      : undefined;
    if (rawMax !== undefined && rawMax > MAX_PUBLIC_RECURRENCE_OCCURRENCES) {
      throw Object.assign(
        new Error(`No agendamento online, o limite máximo é de ${MAX_PUBLIC_RECURRENCE_OCCURRENCES} ocorrências por série.`),
        { status: 400, code: 'RECURRENCE_LIMIT_EXCEEDED' }
      );
    }
    const weekdaysList = Array.isArray(item.recurrence.weekdays) ? item.recurrence.weekdays : [];
    const planOut = generateSchedulePlanOccurrences({
      startDate,
      frequency: recValidation.frequency,
      intervalValue: recValidation.intervalValue,
      intervalUnit: recValidation.intervalUnit,
      durationCode: recValidation.durationCode,
      endDate: item.recurrence.endDate || undefined,
      maxOccurrences: rawMax,
      weekdays: weekdaysList.length > 0 ? weekdaysList : undefined,
      startClock,
      endClock: computedEndClock,
      durationMinutes: Number(srv.duration_minutes || 50),
      classScheduleId: item.classScheduleId ? String(item.classScheduleId).trim() : null,
      professionalId: preferredProfId !== 'any' ? preferredProfId : null,
      modality: item.modality ? String(item.modality) : null,
      scheduleEntries: reqScheduleEntries.length > 0 ? (reqScheduleEntries as SchedulePlanEntryInput[]) : null,
      maxCap: MAX_PUBLIC_RECURRENCE_OCCURRENCES
    });

    if (planOut.occurrences.length > MAX_PUBLIC_RECURRENCE_OCCURRENCES) {
      throw Object.assign(
        new Error(`O período informado excede o limite de ${MAX_PUBLIC_RECURRENCE_OCCURRENCES} ocorrências no agendamento online.`),
        { status: 400, code: 'RECURRENCE_LIMIT_EXCEEDED' }
      );
    }

    const recMeta: ExpandedStudioSlotItem['recurrenceMeta'] = {
      seriesMode: recValidation.seriesMode,
      durationCode: recValidation.durationCode,
      scheduleEntriesJson: reqScheduleEntries.length > 0 ? JSON.stringify(reqScheduleEntries) : null,
      frequency: recValidation.frequency,
      intervalValue: recValidation.intervalValue,
      intervalUnit: recValidation.intervalUnit,
      weekdays: weekdaysList.length > 0
        ? weekdaysList
        : Array.from(new Set(planOut.occurrences.map(o => o.dayOfWeek)))
    };

    return planOut.occurrences.map((occItem, idx) => ({
      serviceRow: srv,
      preferredProfId: occItem.professionalId || preferredProfId,
      classScheduleId: occItem.classScheduleId || (item.classScheduleId ? String(item.classScheduleId).trim() : null),
      requestedModality: occItem.modality || item.modality,
      startIso: occItem.startIso,
      endIso: occItem.endIso,
      isRecurrenceFollowUp: idx > 0,
      recurrenceMeta: recMeta
    }));
  }

  return [{
    serviceRow: srv,
    preferredProfId,
    classScheduleId: item.classScheduleId ? String(item.classScheduleId).trim() : null,
    requestedModality: item.modality,
    startIso: `${startDate}T${startClock}`,
    endIso: `${startDate}T${computedEndClock}`,
    isRecurrenceFollowUp: false,
    recurrenceMeta: null
  }];
}

async function prefetchStudioExternalBusy(
  tenantId: string,
  items: ExpandedStudioSlotItem[]
): Promise<Map<string, Array<{ startMin: number; endMin: number }>>> {
  const busyMap = new Map<string, Array<{ startMin: number; endMin: number }>>();
  const seenPairs = new Set<string>();
  for (const item of items) {
    const dateStr = item.startIso.slice(0, 10);
    const profIds = new Set<string>();
    for (const p of getLinkedPublicProfessionals(tenantId, item.serviceRow.id, item.preferredProfId)) {
      profIds.add(p.id);
    }
    if (item.serviceRow.service_kind === 'group') {
      const scheds = ClassScheduleService.listForService(tenantId, item.serviceRow.id, {
        includeInactive: false,
        publicOnly: true
      });
      for (const s of scheds) {
        if (item.preferredProfId === 'any' || s.professional_id === item.preferredProfId) {
          profIds.add(s.professional_id);
        }
      }
    }
    for (const pid of profIds) {
      const key = `${pid}|${dateStr}`;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      try {
        const busy = await GoogleCalendarService.getBusyIntervals(tenantId, pid, dateStr);
        busyMap.set(key, busy.map(b => ({ startMin: b.startMin, endMin: b.endMin })));
      } catch {
        busyMap.set(key, []);
      }
    }
  }
  return busyMap;
}

function resolveStudioPublicSlot(
  tenantId: string,
  item: ExpandedStudioSlotItem,
  studentId: string | null,
  extBusyMap: Map<string, Array<{ startMin: number; endMin: number }>>
): {
  professionalId: string;
  coInstructorIds?: string[];
  classScheduleId: string | null;
  roomId: string | null;
  capacity: number;
  modality: 'presential' | 'online' | 'home';
} {
  if (item.serviceRow.service_kind === 'group') {
    return ClassScheduleService.validatePublicGroupSlotTx({
      tenantId,
      serviceRow: item.serviceRow,
      preferredProfId: item.preferredProfId,
      classScheduleId: item.classScheduleId,
      startIso: item.startIso,
      endIso: item.endIso,
      requestedModality: item.requestedModality,
      externalBusyByProfAndDate: extBusyMap,
      patientId: studentId || undefined,
      ignoreLeadTime: item.isRecurrenceFollowUp,
      ignoreAdvanceCap: item.isRecurrenceFollowUp
    });
  }

  const concreteModality = resolveConcreteModality({
    serviceModality: item.serviceRow.modality,
    requestedModality: item.requestedModality,
    allowHome: true
  });
  const candidates = getLinkedPublicProfessionals(tenantId, item.serviceRow.id, item.preferredProfId);
  const dateStr = item.startIso.slice(0, 10);
  for (const prof of candidates) {
    if (!publicBookingProfessional(tenantId, prof.id) || !professionalBookingService(tenantId, prof.id, item.serviceRow.id)) continue;
    const extBusy = extBusyMap.get(`${prof.id}|${dateStr}`);
    const slots = calculateAvailableSlots(
      tenantId,
      prof.id,
      item.serviceRow.id,
      dateStr,
      undefined,
      undefined,
      extBusy,
      studentId || undefined,
      {
        ignoreLeadTime: item.isRecurrenceFollowUp,
        ignoreAdvanceCap: item.isRecurrenceFollowUp
      }
    );
    if (slots.some(s => s.startTime === item.startIso && s.endTime === item.endIso)) {
      return {
        professionalId: prof.id,
        classScheduleId: null,
        roomId: null,
        capacity: 1,
        modality: concreteModality
      };
    }
  }
  throw Object.assign(new Error(`Horário indisponível em ${dateStr} às ${item.startIso.slice(11, 16)}. Escolha outro horário ou data.`), {
    status: 409,
    code: 'SLOT_UNAVAILABLE'
  });
}

function findExistingPatientByContactReadOnly(
  tenantId: string,
  phone?: string | null,
  email?: string | null
): string | null {
  const digits = cleanPhoneDigits(phone);
  const tail = digits.length >= 10 ? digits.slice(-11) : digits;
  if (tail) {
    const byPhone = db.prepare(`
      SELECT id FROM patients
      WHERE tenant_id = ?
        AND (
          phone = ?
          OR replace(replace(replace(phone, '+', ''), ' ', ''), '-', '') LIKE '%' || ?
          OR replace(replace(replace(COALESCE(whatsapp, ''), '+', ''), ' ', ''), '-', '') LIKE '%' || ?
        )
      LIMIT 1
    `).get(tenantId, phone || '', tail, tail) as { id: string } | undefined;
    if (byPhone?.id) return byPhone.id;
  }
  if (email && email.trim()) {
    const byEmail = db.prepare(`SELECT id FROM patients WHERE tenant_id = ? AND LOWER(email) = LOWER(?) LIMIT 1`)
      .get(tenantId, email.trim()) as { id: string } | undefined;
    if (byEmail?.id) return byEmail.id;
  }
  return null;
}

function checkDuplicatePendingRequest(params: {
  tenantId: string;
  phoneTail: string;
  serviceId?: string | null;
  packageId?: string | null;
  startTime: string;
}): boolean {
  if (!params.phoneTail || !params.startTime) return false;
  const rows = db.prepare(`
    SELECT id, patient_snapshot_json, start_time, service_id, package_id
    FROM public_booking_requests
    WHERE tenant_id = ? AND status = 'awaiting_confirmation' AND start_time = ?
  `).all(params.tenantId, params.startTime) as any[];

  for (const r of rows) {
    const sameTarget = params.packageId
      ? r.package_id === params.packageId
      : r.service_id === params.serviceId;
    if (!sameTarget) continue;
    try {
      const snap = JSON.parse(r.patient_snapshot_json || '{}');
      const snapDigits = cleanPhoneDigits(snap.phone || snap.whatsapp || '');
      if (snapDigits && snapDigits.slice(-11) === params.phoneTail) {
        return true;
      }
    } catch {}
  }
  return false;
}

export class PublicBookingRequestService {
  /**
   * Registra solicitação pendente para o fluxo de Clínica / agendamento avulso (/v1/public/appointments),
   * sem criar agendamento definitivo até a confirmação interna.
   */
  static createClinicPendingRequest(params: {
    tenantId: string;
    professionalId: string;
    serviceRow: any;
    normalizedStartTime: string;
    normalizedEndTime: string;
    effectiveModality: 'presential' | 'online' | 'home';
    agreedAmount: number;
    catalogPriceSnapshot: number;
    patientNotes: string | null;
    newPatientData: {
      fullName: string;
      phone: string;
      email?: string | null;
      isChild?: boolean;
      guardianName?: string | null;
      guardianPhone?: string | null;
      notes?: string | null;
    };
    matchedScheduleId: string | null;
  }) {
    const {
      tenantId,
      professionalId,
      serviceRow,
      normalizedStartTime,
      normalizedEndTime,
      effectiveModality,
      agreedAmount,
      catalogPriceSnapshot,
      patientNotes,
      newPatientData,
      matchedScheduleId
    } = params;

    const fullName = String(newPatientData.fullName || '').trim();
    const rawPhone = String(newPatientData.phone || '').trim();
    const digitsTail = cleanPhoneDigits(rawPhone).slice(-11);

    if (checkDuplicatePendingRequest({
      tenantId,
      phoneTail: digitsTail,
      serviceId: serviceRow.id,
      startTime: normalizedStartTime
    })) {
      throw Object.assign(
        new Error('Você já possui uma solicitação pendente para este mesmo horário. Aguarde a confirmação do estabelecimento.'),
        { status: 409, code: 'DUPLICATE_PENDING_REQUEST' }
      );
    }

    const existingPatientId = findExistingPatientByContactReadOnly(tenantId, rawPhone, newPatientData.email);
    if (existingPatientId) {
      const conflict = db.prepare(`
        SELECT id FROM appointments
        WHERE tenant_id = ? AND patient_id = ? AND status NOT IN ('cancelled')
          AND REPLACE(start_time, ' ', 'T') < ? AND REPLACE(end_time, ' ', 'T') > ?
        LIMIT 1
      `).get(tenantId, existingPatientId, normalizedEndTime, normalizedStartTime);
      if (conflict) {
        throw Object.assign(
          new Error('Você já possui um atendimento confirmado neste horário.'),
          { status: 409, code: 'PATIENT_APPOINTMENT_CONFLICT' }
        );
      }
    }

    const estProfile = getTenantEstablishmentProfile(tenantId);
    const domain = resolveServiceDomain({
      establishmentProfile: estProfile,
      serviceDomain: serviceRow.service_domain,
      serviceKind: serviceRow.service_kind,
      clinicalModule: serviceRow.clinical_module
    });
    const establishmentMode = estProfile === 'studio' || domain === 'studio' ? 'studio' : 'clinic';

    const tenantRow = db.prepare(`SELECT name, trade_name FROM tenants WHERE id = ?`).get(tenantId) as any;
    const establishmentName = String(tenantRow?.trade_name || tenantRow?.name || 'Estabelecimento').trim();
    const profRow = db.prepare(`SELECT id, name FROM professionals WHERE id = ? AND tenant_id = ?`).get(professionalId, tenantId) as any;
    const profName = String(profRow?.name || 'Profissional').trim();
    const serviceName = String(serviceRow.name || 'Atendimento').trim();

    const dateStr = normalizedStartTime.slice(0, 10);
    const startDateLabel = formatDateBr(dateStr);
    const timeRangeLabel = formatTimeRange(normalizedStartTime, normalizedEndTime);
    const dow = getWeekdayNumber(dateStr);
    const weekdaysLabel = dow !== null ? formatWeekdaysList([dow]) : null;
    const whatsappPhone = extractValidWhatsappPhone(rawPhone, rawPhone);

    const requestId = 'pbr-' + uuidv4().slice(0, 8);
    const requestNumber = generateRequestNumber(tenantId);

    const profIds = InternalNotificationService.resolveSessionProfessionalIds({
      tenantId,
      primaryProfessionalId: professionalId,
      classScheduleId: matchedScheduleId
    });
    const profRows = profIds.length > 0
      ? (db.prepare(`SELECT name FROM professionals WHERE tenant_id = ? AND id IN (${profIds.map(() => '?').join(', ')}) ORDER BY name ASC`)
          .all(tenantId, ...profIds) as Array<{ name: string }>)
      : [];
    const professionalNames = profRows.map(r => r.name).filter(Boolean).join(', ') || profName;

    const payload = {
      type: 'clinic_single',
      tenantId,
      professionalId,
      serviceId: serviceRow.id,
      normalizedStartTime,
      normalizedEndTime,
      effectiveModality,
      agreedAmount,
      catalogPriceSnapshot,
      patientNotes,
      newPatientData: {
        ...newPatientData,
        fullName,
        phone: rawPhone
      },
      matchedScheduleId
    };

    const summary = `${fullName} solicitou ${serviceName} (${formatModalityLabelPt(effectiveModality)}) — ${startDateLabel} às ${timeRangeLabel}`;

    const insertTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO public_booking_requests (
          id, request_number, tenant_id, establishment_mode, mode, status,
          service_id, professional_id, class_schedule_id, modality,
          start_time, end_time, weekdays_label, time_range_label, start_date_label, start_date_iso,
          sessions_count, patient_snapshot_json, payload_json, summary_snapshot_json
        ) VALUES (?, ?, ?, ?, 'single', 'awaiting_confirmation', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      `).run(
        requestId,
        requestNumber,
        tenantId,
        establishmentMode,
        serviceRow.id,
        professionalId,
        matchedScheduleId,
        effectiveModality,
        normalizedStartTime,
        normalizedEndTime,
        weekdaysLabel,
        timeRangeLabel,
        startDateLabel,
        normalizedStartTime,
        JSON.stringify({ fullName, phone: rawPhone, email: newPatientData.email || null }),
        JSON.stringify(payload),
        JSON.stringify({
          serviceName,
          professionalNames,
          modality: effectiveModality,
          establishmentName
        })
      );

      InternalNotificationService.notifyPublicBookingRequestPending({
        tenantId,
        requestId,
        establishmentMode,
        professionalIds: profIds,
        title: 'Nova solicitação de agendamento',
        summary,
        studentOrPatientName: fullName,
        serviceOrClassName: serviceName,
        weekdaysLabel,
        timeRangeLabel,
        startDateLabel,
        startDateIso: normalizedStartTime,
        professionalNames,
        classGroupLabel: null,
        sessionsCount: 1,
        whatsappPhone,
        establishmentName,
        modality: effectiveModality,
        metadata: {
          requestId,
          requestNumber,
          requestStatus: 'awaiting_confirmation',
          establishmentName,
          modality: effectiveModality,
          whatsappPhone,
          serviceName,
          professionalNames
        }
      });
    });

    insertTx();

    return {
      id: requestId,
      requestId,
      requestNumber,
      status: 'awaiting_confirmation',
      requiresConfirmation: true,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      modality: effectiveModality,
      serviceKind: serviceRow.service_kind === 'group' ? 'group' : 'individual',
      capacity: serviceRow.service_kind === 'group' ? Math.max(1, Number(serviceRow.default_capacity) || 1) : 1,
      message: 'Solicitação recebida! Aguarde a confirmação do estabelecimento antes de considerar o horário reservado.'
    };
  }

  /**
   * Registra solicitação pendente para o fluxo de Studio (/v1/public/studio/bookings),
   * cobrindo avulsa, turma coletiva, planos recorrentes e pacotes sem inserir na agenda definitiva.
   */
  static async createStudioPendingRequest(rawBody: any): Promise<any> {
    const {
      tenantSlug,
      bookingSequence,
      bookingIntent,
      mode,
      serviceId,
      professionalId,
      classScheduleId,
      modality,
      startTime,
      endTime,
      recurrence,
      packageId,
      schedules,
      student
    } = rawBody || {};

    const tenant = resolveBookingTenant(tenantSlug, bookingSequence);
    if (!tenant || tenant.public_booking_enabled !== 1) {
      throw Object.assign(new Error('Agendamento online indisponível neste estabelecimento.'), { status: 404 });
    }
    if (!canOperate(tenant.id)) {
      throw Object.assign(new Error('Agendamento online indisponível no momento.'), { status: 404 });
    }
    if (!PackageService.isStudioCompatible(tenant.id)) {
      throw Object.assign(new Error('Este estabelecimento não utiliza o agendamento público de Studios.'), { status: 403 });
    }

    const fullName = String(student?.fullName || '').trim();
    const rawPhone = String(student?.phone || student?.whatsapp || '').trim();
    const rawWhatsapp = String(student?.whatsapp || student?.phone || '').trim();
    const email = student?.email ? String(student.email).trim() : null;
    const studentNotes = student?.notes ? String(student.notes).trim() : null;

    if (!fullName || fullName.length < 2) {
      throw Object.assign(new Error('Informe seu nome completo.'), { status: 400 });
    }
    const phoneValidation = validateBrazilianPhone(rawPhone);
    if (!phoneValidation.valid) {
      throw Object.assign(new Error(phoneValidation.error || 'Telefone/WhatsApp inválido.'), { status: 400 });
    }

    const normalizedPhone = normalizePhoneWithDDI(rawPhone);
    const normalizedWhatsapp = validateBrazilianPhone(rawWhatsapp).valid ? normalizePhoneWithDDI(rawWhatsapp) : normalizedPhone;
    const validWhatsapp = extractValidWhatsappPhone(rawPhone, rawWhatsapp);
    const phoneTail = cleanPhoneDigits(normalizedPhone).slice(-11);

    const tenantRow = db.prepare(`SELECT name, trade_name FROM tenants WHERE id = ?`).get(tenant.id) as any;
    const establishmentName = String(tenantRow?.trade_name || tenantRow?.name || 'Studio').trim();
    const existingStudentId = findExistingPatientByContactReadOnly(tenant.id, normalizedPhone, email);

    // ---------------------------------------------------------------------
    // MODO PACOTE
    // ---------------------------------------------------------------------
    if (mode === 'package') {
      if (!packageId) {
        throw Object.assign(new Error('Selecione um pacote de serviços.'), { status: 400 });
      }
      const pkg = PackageService.listCatalogPackages(tenant.id, { includeInactive: false, publicOnly: true })
        .find(p => p.id === packageId);
      if (!pkg) {
        throw Object.assign(new Error('Pacote indisponível para solicitação online.'), { status: 404 });
      }

      const rawSchedules = Array.isArray(schedules) ? schedules : [];
      const expandedSlots: ExpandedStudioSlotItem[] = [];
      for (const sch of rawSchedules) {
        expandedSlots.push(...expandStudioScheduleItem(tenant.id, sch));
      }

      const firstStartIso = expandedSlots[0]?.startIso || '';
      if (firstStartIso && checkDuplicatePendingRequest({
        tenantId: tenant.id,
        phoneTail,
        packageId: pkg.id,
        startTime: firstStartIso
      })) {
        throw Object.assign(
          new Error('Você já possui uma solicitação pendente para este pacote e horário. Aguarde a confirmação do estabelecimento.'),
          { status: 409, code: 'DUPLICATE_PENDING_REQUEST' }
        );
      }

      const extBusyMap = await prefetchStudioExternalBusy(tenant.id, expandedSlots);

      const previewAppointments: any[] = [];
      const profIdSet = new Set<string>();

      for (let i = 0; i < expandedSlots.length; i++) {
        const item = expandedSlots[i];
        if (existingStudentId) {
          const studentOverlap = db.prepare(`
            SELECT id FROM appointments
            WHERE tenant_id = ? AND patient_id = ? AND status != 'cancelled'
              AND REPLACE(start_time, ' ', 'T') < ? AND REPLACE(end_time, ' ', 'T') > ?
          `).get(tenant.id, existingStudentId, item.endIso, item.startIso);
          if (studentOverlap) {
            throw Object.assign(
              new Error(`Você já possui um horário reservado em ${item.startIso.slice(0, 10)} às ${item.startIso.slice(11, 16)}.`),
              { status: 409, code: 'PATIENT_APPOINTMENT_CONFLICT' }
            );
          }
        }
        const resolvedSlot = resolveStudioPublicSlot(tenant.id, item, existingStudentId, extBusyMap);
        profIdSet.add(resolvedSlot.professionalId);
        for (const co of resolvedSlot.coInstructorIds || []) profIdSet.add(co);

        const profMeta = db.prepare(`SELECT name FROM professionals WHERE id = ? AND tenant_id = ?`).get(resolvedSlot.professionalId, tenant.id) as any;
        previewAppointments.push({
          id: `req-slot-${i + 1}`,
          status: 'awaiting_confirmation',
          serviceId: item.serviceRow.id,
          serviceName: item.serviceRow.name,
          professionalId: resolvedSlot.professionalId,
          professionalName: profMeta?.name || 'Instrutor',
          modality: resolvedSlot.modality,
          startTime: item.startIso,
          endTime: item.endIso
        });
      }

      const requestId = 'pbr-' + uuidv4().slice(0, 8);
      const requestNumber = generateRequestNumber(tenant.id);
      const dayNumbers = expandedSlots.map(s => getWeekdayNumber(s.startIso.slice(0, 10))).filter((d): d is number => d !== null);
      const weekdaysLabel = dayNumbers.length > 0 ? formatWeekdaysList(dayNumbers) : null;
      const firstPreview = previewAppointments[0];
      const uniqueTimes = Array.from(new Set(expandedSlots.map(s => formatTimeRange(s.startIso, s.endIso)).filter(Boolean)));
      const timeRangeLabel = uniqueTimes.length <= 2 ? uniqueTimes.join(' • ') : `${uniqueTimes[0]} (+${uniqueTimes.length - 1})`;
      const startDateIso = firstPreview?.startTime || (rawBody?.startDate ? String(rawBody.startDate).slice(0, 10) : todayBrazilYmd());
      const startDateLabel = startDateIso ? formatDateBr(startDateIso.slice(0, 10)) : null;
      const uniqueProfNames = Array.from(new Set(previewAppointments.map(p => p.professionalName).filter(Boolean))).join(', ');
      const modalityValue = firstPreview?.modality || 'presential';
      const sessionsCount = expandedSlots.length;
      const summary = sessionsCount > 0
        ? `${fullName} solicitou o pacote ${pkg.name} (${sessionsCount} ${sessionsCount === 1 ? 'aula' : 'aulas'})`
        : `${fullName} solicitou a contratação do pacote ${pkg.name}`;

      const payload = {
        type: 'studio_package',
        tenantId: tenant.id,
        mode: 'package',
        packageId: pkg.id,
        startDate: startDateIso.slice(0, 10),
        schedules: rawSchedules,
        student: {
          fullName,
          phone: normalizedPhone,
          whatsapp: normalizedWhatsapp,
          email,
          cpf: student?.cpf ? String(student.cpf).trim() : null,
          notes: studentNotes
        }
      };

      db.transaction(() => {
        db.prepare(`
          INSERT INTO public_booking_requests (
            id, request_number, tenant_id, establishment_mode, mode, status,
            package_id, modality, start_time, end_time,
            weekdays_label, time_range_label, start_date_label, start_date_iso,
            sessions_count, schedules_json, patient_snapshot_json, payload_json, summary_snapshot_json
          ) VALUES (?, ?, ?, 'studio', 'package', 'awaiting_confirmation', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          requestId,
          requestNumber,
          tenant.id,
          pkg.id,
          modalityValue,
          firstPreview?.startTime || startDateIso,
          firstPreview?.endTime || null,
          weekdaysLabel,
          timeRangeLabel || null,
          startDateLabel,
          startDateIso,
          sessionsCount,
          JSON.stringify(rawSchedules),
          JSON.stringify(payload.student),
          JSON.stringify(payload),
          JSON.stringify({
            serviceName: pkg.name,
            professionalNames: uniqueProfNames,
            modality: modalityValue,
            establishmentName
          })
        );

        InternalNotificationService.notifyPublicBookingRequestPending({
          tenantId: tenant.id,
          requestId,
          establishmentMode: 'studio',
          professionalIds: Array.from(profIdSet),
          title: 'Nova solicitação de pacote',
          summary,
          studentOrPatientName: fullName,
          serviceOrClassName: pkg.name,
          weekdaysLabel,
          timeRangeLabel: timeRangeLabel || null,
          startDateLabel,
          startDateIso,
          professionalNames: uniqueProfNames || null,
          classGroupLabel: sessionsCount > 0 ? `Pacote • ${sessionsCount} ${sessionsCount === 1 ? 'sessão' : 'sessões'}` : 'Pacote Combinado / Acesso',
          sessionsCount,
          whatsappPhone: validWhatsapp,
          establishmentName,
          modality: modalityValue,
          metadata: {
            requestId,
            requestNumber,
            requestStatus: 'awaiting_confirmation',
            packageId: pkg.id,
            packageName: pkg.name,
            establishmentName,
            modality: modalityValue,
            whatsappPhone: validWhatsapp
          }
        });
      })();

      return {
        mode: 'package',
        id: requestId,
        requestId,
        requestNumber,
        status: 'awaiting_confirmation',
        requiresConfirmation: true,
        paymentPending: false,
        appointments: previewAppointments,
        requestedSummary: {
          serviceName: pkg.name,
          professionalNames: uniqueProfNames,
          weekdaysLabel,
          timeRangeLabel,
          startDateLabel,
          modality: modalityValue,
          sessionsCount
        },
        message: 'Solicitação de pacote recebida! Aguarde a confirmação do estabelecimento antes de considerar a matrícula ativa.'
      };
    }

    // ---------------------------------------------------------------------
    // MODO PLANO DE ACESSO (Sem agendamento de horário — Tipo A)
    // ---------------------------------------------------------------------
    const targetSrvRow = serviceId
      ? (db.prepare(`
          SELECT id, name, price, periodic_price, billing_mode, default_billing_due_day,
                 COALESCE(studio_service_type, 'individual') as studio_service_type,
                 COALESCE(requires_appointment, 1) as requires_appointment,
                 COALESCE(allow_public_booking, 1) as allow_public_booking,
                 default_plan_duration, access_config_json, frequency_pricing_json, commercial_price_options_json
          FROM services WHERE id = ? AND tenant_id = ? AND active = 1
        `).get(String(serviceId), tenant.id) as any)
      : null;

    if (
      mode === 'access_plan' ||
      bookingIntent === 'access_plan' ||
      (targetSrvRow && (targetSrvRow.studio_service_type === 'facility_access' || Number(targetSrvRow.requires_appointment) === 0))
    ) {
      if (!targetSrvRow || Number(targetSrvRow.allow_public_booking ?? 1) === 0) {
        throw Object.assign(new Error('Plano de acesso indisponível para contratação online.'), { status: 404 });
      }

      const requestedStartDate = rawBody?.startDate && validBookingDate(rawBody.startDate)
        ? String(rawBody.startDate).slice(0, 10)
        : todayBrazilYmd();
      const contractDurationCode = String(
        rawBody?.contractDurationCode || rawBody?.planDurationCode || recurrence?.durationCode || targetSrvRow.default_plan_duration || 'monthly'
      );
      const paymentPeriodicity = String(rawBody?.paymentPeriodicity || 'monthly');
      const accCfg = normalizeStudioAccessConfig(targetSrvRow.access_config_json);
      const requestedAccessMode = rawBody?.accessMode === 'limited' || rawBody?.accessMode === 'unlimited'
        ? rawBody.accessMode
        : accCfg.accessMode;
      const requestedWeeklyLimit = rawBody?.weeklyLimit !== undefined && rawBody?.weeklyLimit !== null
        ? Number(rawBody.weeklyLimit)
        : (requestedAccessMode === 'limited' ? accCfg.maxEntriesPerWeek : null);
      const requestedMonthlyLimit = rawBody?.monthlyLimit !== undefined && rawBody?.monthlyLimit !== null
        ? Number(rawBody.monthlyLimit)
        : (requestedAccessMode === 'limited' ? accCfg.maxEntriesPerMonth : null);

      if (checkDuplicatePendingRequest({
        tenantId: tenant.id,
        phoneTail,
        serviceId: targetSrvRow.id,
        startTime: requestedStartDate
      })) {
        throw Object.assign(
          new Error('Você já possui uma solicitação pendente para este plano de acesso. Aguarde a confirmação do estabelecimento.'),
          { status: 409, code: 'DUPLICATE_PENDING_REQUEST' }
        );
      }

      const requestId = 'pbr-' + uuidv4().slice(0, 8);
      const requestNumber = generateRequestNumber(tenant.id);
      const startDateLabel = formatDateBr(requestedStartDate);
      const planDurationLabel = formatPlanDurationLabelPt(contractDurationCode, recurrence) || 'Mensal';
      const accessLabel = requestedAccessMode === 'limited'
        ? (requestedWeeklyLimit ? `${requestedWeeklyLimit}x/semana` : (requestedMonthlyLimit ? `${requestedMonthlyLimit}x/mês` : 'Acesso limitado'))
        : 'Acesso livre';
      const timeWindowLabel = accCfg.allowedTimeWindows.length > 0
        ? accCfg.allowedTimeWindows.map(w => `${w.startTime} às ${w.endTime}`).join(', ')
        : 'Horário de funcionamento';
      const summary = `${fullName} solicitou matrícula no plano ${targetSrvRow.name} (${accessLabel} • ${planDurationLabel}) a partir de ${startDateLabel}`;

      const payload = {
        type: 'studio_access_plan',
        tenantId: tenant.id,
        mode: 'access_plan',
        bookingIntent: 'access_plan',
        serviceId: targetSrvRow.id,
        startDate: requestedStartDate,
        contractDurationCode,
        paymentPeriodicity,
        accessMode: requestedAccessMode,
        weeklyLimit: requestedWeeklyLimit,
        monthlyLimit: requestedMonthlyLimit,
        amount: rawBody?.amount !== undefined ? Number(rawBody.amount) : undefined,
        student: {
          fullName,
          phone: normalizedPhone,
          whatsapp: normalizedWhatsapp,
          email,
          cpf: student?.cpf ? String(student.cpf).trim() : null,
          notes: studentNotes
        }
      };

      db.transaction(() => {
        db.prepare(`
          INSERT INTO public_booking_requests (
            id, request_number, tenant_id, establishment_mode, mode, status,
            service_id, modality, start_time, booking_intent,
            weekdays_label, time_range_label, start_date_label, start_date_iso,
            plan_duration_label, weekly_frequency, sessions_count,
            patient_snapshot_json, payload_json, summary_snapshot_json
          ) VALUES (?, ?, ?, 'studio', 'access_plan', 'awaiting_confirmation', ?, 'presential', ?, 'access_plan', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
        `).run(
          requestId,
          requestNumber,
          tenant.id,
          targetSrvRow.id,
          requestedStartDate,
          accessLabel,
          timeWindowLabel,
          startDateLabel,
          requestedStartDate,
          planDurationLabel,
          requestedWeeklyLimit || null,
          JSON.stringify(payload.student),
          JSON.stringify(payload),
          JSON.stringify({
            serviceName: targetSrvRow.name,
            professionalNames: '',
            modality: 'presential',
            establishmentName,
            planDurationLabel,
            weeklyFrequency: requestedWeeklyLimit || null,
            accessLabel
          })
        );

        InternalNotificationService.notifyPublicBookingRequestPending({
          tenantId: tenant.id,
          requestId,
          establishmentMode: 'studio',
          professionalIds: [],
          title: 'Nova solicitação de plano de acesso',
          summary,
          studentOrPatientName: fullName,
          serviceOrClassName: targetSrvRow.name,
          weekdaysLabel: accessLabel,
          timeRangeLabel: timeWindowLabel,
          startDateLabel,
          startDateIso: requestedStartDate,
          professionalNames: null,
          classGroupLabel: `Plano de Acesso • ${accessLabel}`,
          sessionsCount: 0,
          whatsappPhone: validWhatsapp,
          establishmentName,
          modality: 'presential',
          planDurationLabel,
          weeklyFrequency: requestedWeeklyLimit || null,
          metadata: {
            requestId,
            requestNumber,
            requestStatus: 'awaiting_confirmation',
            establishmentName,
            modality: 'presential',
            planDurationLabel,
            weeklyFrequency: requestedWeeklyLimit || null,
            accessLabel,
            whatsappPhone: validWhatsapp
          }
        });
      })();

      return {
        mode: 'access_plan',
        id: requestId,
        requestId,
        requestNumber,
        status: 'awaiting_confirmation',
        requiresConfirmation: true,
        paymentPending: false,
        appointments: [],
        requestedSummary: {
          serviceName: targetSrvRow.name,
          professionalNames: '',
          weekdaysLabel: accessLabel,
          timeRangeLabel: timeWindowLabel,
          startDateLabel,
          weeklyFrequency: requestedWeeklyLimit || null,
          planDurationLabel,
          modality: 'presential',
          sessionsCount: 0
        },
        message: 'Solicitação de matrícula recebida! Aguarde a confirmação do estabelecimento para ativar seu acesso.'
      };
    }

    // ---------------------------------------------------------------------
    // MODO SERVIÇO (Individual / Turma / Recorrente)
    // ---------------------------------------------------------------------
    if (!serviceId || !startTime) {
      throw Object.assign(new Error('Selecione a aula/serviço e o horário desejado.'), { status: 400 });
    }

    const expandedServiceSlots = expandStudioScheduleItem(tenant.id, {
      serviceId: String(serviceId),
      professionalId: professionalId ? String(professionalId) : 'any',
      classScheduleId: classScheduleId ? String(classScheduleId) : null,
      modality,
      startTime: String(startTime),
      endTime: endTime ? String(endTime) : undefined,
      recurrence
    });

    if (checkDuplicatePendingRequest({
      tenantId: tenant.id,
      phoneTail,
      serviceId: String(serviceId),
      startTime: expandedServiceSlots[0].startIso
    })) {
      throw Object.assign(
        new Error('Você já possui uma solicitação pendente para este mesmo horário. Aguarde a confirmação do estabelecimento.'),
        { status: 409, code: 'DUPLICATE_PENDING_REQUEST' }
      );
    }

    const extBusyMap = await prefetchStudioExternalBusy(tenant.id, expandedServiceSlots);

    const previewAppointments: any[] = [];
    const resolvedPairs: Array<{ slotItem: ExpandedStudioSlotItem; resolvedSlot: ReturnType<typeof resolveStudioPublicSlot> }> = [];
    const profIdSet = new Set<string>();

    for (let i = 0; i < expandedServiceSlots.length; i++) {
      const slotItem = expandedServiceSlots[i];
      if (existingStudentId) {
        const patientConflict = db.prepare(`
          SELECT id FROM appointments
          WHERE tenant_id = ? AND patient_id = ? AND status != 'cancelled'
            AND REPLACE(start_time, ' ', 'T') < ? AND REPLACE(end_time, ' ', 'T') > ?
        `).get(tenant.id, existingStudentId, slotItem.endIso, slotItem.startIso);
        if (patientConflict) {
          throw Object.assign(
            new Error(`Você já possui um horário reservado em ${slotItem.startIso.slice(0, 10)} às ${slotItem.startIso.slice(11, 16)}.`),
            { status: 409, code: 'PATIENT_APPOINTMENT_CONFLICT' }
          );
        }
      }
      const resolvedSlot = resolveStudioPublicSlot(tenant.id, slotItem, existingStudentId, extBusyMap);
      resolvedPairs.push({ slotItem, resolvedSlot });
      profIdSet.add(resolvedSlot.professionalId);
      for (const co of resolvedSlot.coInstructorIds || []) profIdSet.add(co);

      const profMeta = db.prepare(`SELECT name FROM professionals WHERE id = ? AND tenant_id = ?`).get(resolvedSlot.professionalId, tenant.id) as any;
      previewAppointments.push({
        id: `req-slot-${i + 1}`,
        status: 'awaiting_confirmation',
        serviceId: slotItem.serviceRow.id,
        serviceName: slotItem.serviceRow.name,
        professionalId: resolvedSlot.professionalId,
        professionalName: profMeta?.name || 'Instrutor',
        modality: resolvedSlot.modality,
        startTime: slotItem.startIso,
        endTime: slotItem.endIso
      });
    }

    const firstPair = resolvedPairs[0];
    const planStart = bookingTime(String(startTime))!.slice(0, 10);
    const planEnd = resolvePlanDurationEndDate(planStart, firstPair.slotItem.recurrenceMeta?.durationCode) ||
      (recurrence?.endDate ? String(recurrence.endDate).slice(0, 10) : resolvedPairs[resolvedPairs.length - 1].slotItem.startIso.slice(0, 10));

    let quote: any = null;
    if (recurrence && firstPair.slotItem.recurrenceMeta) {
      quote = quoteFrequencyPlan({
        tenantId: tenant.id,
        serviceId: String(serviceId),
        billingFrequency: firstPair.slotItem.serviceRow.billing_mode,
        startDate: planStart,
        endDate: planEnd,
        publicOnly: true,
        includeStandardPricing: bookingIntent === 'recurring',
        cadence: firstPair.slotItem.recurrenceMeta.frequency,
        slots: resolvedPairs.map(({ slotItem, resolvedSlot }) => ({
          startTime: slotItem.startIso,
          endTime: slotItem.endIso,
          professionalId: resolvedSlot.professionalId,
          classScheduleId: resolvedSlot.classScheduleId
        }))
      });
      if (quote && existingStudentId) {
        const existingCoverage = BillingCycleService.resolveActivePlanCoverage({
          tenantId: tenant.id,
          patientId: existingStudentId,
          serviceId: String(serviceId),
          sessionDates: resolvedPairs.map(s => s.slotItem.startIso.slice(0, 10)),
          autoMatch: true
        });
        if (existingCoverage.error) {
          throw Object.assign(new Error(existingCoverage.error), { status: existingCoverage.status || 409 });
        }
        if (!existingCoverage.plan) {
          const overlapping = db.prepare(`
            SELECT id FROM recurring_billing_plans
            WHERE tenant_id = ? AND patient_id = ? AND service_id = ?
              AND status = 'active' AND COALESCE(covers_sessions, 1) = 1
              AND start_date <= ? AND (end_date IS NULL OR end_date = '' OR end_date >= ?)
            LIMIT 1
          `).get(tenant.id, existingStudentId, String(serviceId), planEnd, planStart);
          if (overlapping) {
            throw Object.assign(
              new Error('Você já possui um plano vigente neste período. Entre em contato com o Studio para ajustar os horários sem duplicar sua contratação.'),
              { status: 409, code: 'EXISTING_PLAN_OVERLAP' }
            );
          }
        }
      }
    }

    const requestId = 'pbr-' + uuidv4().slice(0, 8);
    const requestNumber = generateRequestNumber(tenant.id);
    const sessionsCount = expandedServiceSlots.length;
    const isGroup = firstPair.slotItem.serviceRow.service_kind === 'group';
    const dayNumbers = expandedServiceSlots
      .map(s => getWeekdayNumber(s.startIso.slice(0, 10)))
      .filter((d): d is number => d !== null);
    const weekdaysLabel = dayNumbers.length > 0 ? formatWeekdaysList(dayNumbers) : null;
    const uniqueTimes = Array.from(new Set(expandedServiceSlots.map(s => formatTimeRange(s.startIso, s.endIso)).filter(Boolean)));
    const timeRangeLabel = uniqueTimes.length <= 2 ? uniqueTimes.join(' • ') : `${uniqueTimes[0]} (+${uniqueTimes.length - 1})`;
    const startDateIso = firstPair.slotItem.startIso;
    const startDateLabel = formatDateBr(startDateIso.slice(0, 10));
    const uniqueProfNames = Array.from(new Set(previewAppointments.map(p => p.professionalName).filter(Boolean))).join(', ');
    const modalityValue = firstPair.resolvedSlot.modality;
    const planDurationLabel = formatPlanDurationLabelPt(firstPair.slotItem.recurrenceMeta?.durationCode, recurrence);
    const weeklyFrequency = quote?.weeklyCount || (firstPair.slotItem.recurrenceMeta ? Array.from(new Set(dayNumbers)).length : null);
    const serviceName = String(firstPair.slotItem.serviceRow.name || 'Aula');

    const classGroupLabel = sessionsCount > 1
      ? `${isGroup ? 'Turma' : 'Plano'} • ${sessionsCount} aulas${planDurationLabel ? ` (${planDurationLabel})` : ''}`
      : (isGroup ? 'Turma coletiva • 1 aula' : 'Aula avulsa');

    const summary = sessionsCount > 1
      ? `${fullName} solicitou ${serviceName} (${weeklyFrequency ? `${weeklyFrequency}x/semana` : `${sessionsCount} aulas`}${planDurationLabel ? ` • ${planDurationLabel}` : ''})`
      : `${fullName} solicitou ${serviceName} (${formatModalityLabelPt(modalityValue)}) — ${startDateLabel} às ${timeRangeLabel}`;

    const payload = {
      type: 'studio_service',
      tenantId: tenant.id,
      bookingIntent: bookingIntent || (sessionsCount > 1 ? 'recurring' : 'single'),
      mode: 'service',
      serviceId: String(serviceId),
      professionalId: professionalId ? String(professionalId) : 'any',
      classScheduleId: classScheduleId ? String(classScheduleId) : null,
      modality: modality ?? modalityValue,
      startTime: String(startTime),
      endTime: endTime ? String(endTime) : undefined,
      recurrence: recurrence || null,
      student: {
        fullName,
        phone: normalizedPhone,
        whatsapp: normalizedWhatsapp,
        email,
        notes: studentNotes
      }
    };

    db.transaction(() => {
      db.prepare(`
        INSERT INTO public_booking_requests (
          id, request_number, tenant_id, establishment_mode, mode, status,
          service_id, professional_id, class_schedule_id, modality,
          start_time, end_time, booking_intent,
          weekdays_label, time_range_label, start_date_label, start_date_iso,
          plan_duration_label, weekly_frequency, sessions_count,
          recurrence_json, patient_snapshot_json, payload_json, summary_snapshot_json
        ) VALUES (?, ?, ?, 'studio', 'service', 'awaiting_confirmation', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        requestId,
        requestNumber,
        tenant.id,
        String(serviceId),
        firstPair.resolvedSlot.professionalId,
        firstPair.resolvedSlot.classScheduleId || null,
        modalityValue,
        firstPair.slotItem.startIso,
        firstPair.slotItem.endIso,
        payload.bookingIntent,
        weekdaysLabel,
        timeRangeLabel || null,
        startDateLabel,
        startDateIso,
        planDurationLabel,
        weeklyFrequency,
        sessionsCount,
        recurrence ? JSON.stringify(recurrence) : null,
        JSON.stringify(payload.student),
        JSON.stringify(payload),
        JSON.stringify({
          serviceName,
          professionalNames: uniqueProfNames,
          modality: modalityValue,
          establishmentName,
          planDurationLabel,
          weeklyFrequency
        })
      );

      InternalNotificationService.notifyPublicBookingRequestPending({
        tenantId: tenant.id,
        requestId,
        establishmentMode: 'studio',
        professionalIds: Array.from(profIdSet),
        title: 'Nova solicitação de agendamento',
        summary,
        studentOrPatientName: fullName,
        serviceOrClassName: serviceName,
        weekdaysLabel,
        timeRangeLabel: timeRangeLabel || null,
        startDateLabel,
        startDateIso,
        professionalNames: uniqueProfNames || null,
        classGroupLabel,
        sessionsCount,
        whatsappPhone: validWhatsapp,
        establishmentName,
        modality: modalityValue,
        planDurationLabel,
        weeklyFrequency,
        metadata: {
          requestId,
          requestNumber,
          requestStatus: 'awaiting_confirmation',
          establishmentName,
          modality: modalityValue,
          planDurationLabel,
          weeklyFrequency,
          whatsappPhone: validWhatsapp
        }
      });
    })();

    return {
      mode: 'service',
      id: requestId,
      requestId,
      requestNumber,
      status: 'awaiting_confirmation',
      requiresConfirmation: true,
      paymentPending: false,
      appointments: previewAppointments,
      requestedSummary: {
        serviceName,
        professionalNames: uniqueProfNames,
        weekdaysLabel,
        timeRangeLabel,
        startDateLabel,
        weeklyFrequency,
        planDurationLabel,
        modality: modalityValue,
        sessionsCount
      },
      message: 'Solicitação recebida! Aguarde a confirmação do estabelecimento antes de considerar o horário reservado.'
    };
  }

  /**
   * Confirma uma solicitação pendente de agendamento público a partir do ID da notificação ou solicitação,
   * executando em transação atômica com revalidação completa de disponibilidade, conflitos e permissões.
   */
  static async confirmNotificationRequest(params: {
    tenantId: string;
    notificationOrRequestId: string;
    userId: string;
    role: string;
    isSandboxSession?: boolean;
  }): Promise<{
    notification: InternalNotificationRecord | null;
    requestId: string;
    appointmentId: string | null;
    appointmentIds: string[];
    seriesId: string | null;
    contractId: string | null;
    billingPlanId: string | null;
    confirmedAt: string;
    expiresAt: string;
  }> {
    const { tenantId, notificationOrRequestId, userId, role, isSandboxSession } = params;

    // 1. Localiza a notificação ou solicitação pertencente ao estabelecimento
    const notifRow = db.prepare(`
      SELECT * FROM internal_notifications
      WHERE id = ? AND tenant_id = ?
      LIMIT 1
    `).get(notificationOrRequestId, tenantId) as any;

    const requestId = notifRow?.request_id || notificationOrRequestId;
    const requestRow = db.prepare(`
      SELECT * FROM public_booking_requests
      WHERE id = ? AND tenant_id = ?
      LIMIT 1
    `).get(requestId, tenantId) as any;

    if (!requestRow) {
      throw Object.assign(new Error('Solicitação de agendamento não encontrada neste estabelecimento.'), {
        status: 404,
        code: 'BOOKING_REQUEST_NOT_FOUND'
      });
    }

    // 2. Autorização por vínculo de usuário/estabelecimento/profissional
    const cleanRole = String(role || '').toLowerCase();
    const cuRow = db.prepare(`
      SELECT is_manager, role, status, deactivated_at
      FROM clinic_users
      WHERE user_id = ? AND tenant_id = ?
      LIMIT 1
    `).get(userId, tenantId) as any;
    const isManager =
      (cleanRole === 'superadmin' && Boolean(isSandboxSession)) ||
      cleanRole === 'clinic_admin' ||
      (cuRow && (!cuRow.status || cuRow.status === 'active') && !cuRow.deactivated_at &&
        (cuRow.is_manager === 1 || String(cuRow.role || '').toLowerCase() === 'clinic_admin'));

    if (!isManager) {
      if (notifRow && notifRow.recipient_user_id !== userId) {
        throw Object.assign(new Error('Você não possui permissão para confirmar esta notificação.'), {
          status: 403,
          code: 'FORBIDDEN'
        });
      }
      if (cleanRole === 'professional' || String(cuRow?.role || '').toLowerCase() === 'professional') {
        const ownProfIds = (db.prepare(`
          SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ? AND active = 1
        `).all(userId, tenantId) as Array<{ id: string }>).map(p => p.id);

        const recipientMatch = Boolean(
          db.prepare(`
            SELECT 1 FROM internal_notifications
            WHERE request_id = ? AND tenant_id = ? AND recipient_user_id = ?
            LIMIT 1
          `).get(requestRow.id, tenantId, userId)
        );
        const directProfMatch = Boolean(requestRow.professional_id && ownProfIds.includes(requestRow.professional_id));
        if (!recipientMatch && !directProfMatch) {
          throw Object.assign(new Error('Você só pode confirmar solicitações vinculadas aos seus próprios atendimentos ou turmas.'), {
            status: 403,
            code: 'FORBIDDEN'
          });
        }
      } else {
        throw Object.assign(new Error('Usuário sem permissão para confirmar solicitações.'), {
          status: 403,
          code: 'FORBIDDEN'
        });
      }
    }

    if (requestRow.status === 'confirmed') {
      throw Object.assign(new Error('Esta solicitação já foi confirmada anteriormente.'), {
        status: 409,
        code: 'REQUEST_ALREADY_CONFIRMED'
      });
    }
    if (requestRow.status !== 'awaiting_confirmation') {
      throw Object.assign(new Error('Esta solicitação não está mais aguardando confirmação.'), {
        status: 409,
        code: 'REQUEST_NOT_PENDING'
      });
    }

    const payload = JSON.parse(requestRow.payload_json || '{}');
    if (!canOperate(tenantId)) {
      throw Object.assign(new Error('Estabelecimento com assinatura pendente para confirmar agendamentos.'), {
        status: 402,
        code: 'SUBSCRIPTION_REQUIRED'
      });
    }

    // 3. Prefetch assíncrono de disponibilidade externa (Google Calendar) fora da transação SQLite
    let clinicExtBusy: Array<{ startMin: number; endMin: number }> | undefined;
    let studioExtBusyMap = new Map<string, Array<{ startMin: number; endMin: number }>>();
    let expandedPackageSlots: ExpandedStudioSlotItem[] = [];
    let expandedServiceSlots: ExpandedStudioSlotItem[] = [];

    if (requestRow.mode === 'single') {
      try {
        const dateStr = String(payload.normalizedStartTime || '').slice(0, 10);
        const busy = await GoogleCalendarService.getBusyIntervals(tenantId, payload.professionalId, dateStr);
        clinicExtBusy = busy.map(b => ({ startMin: b.startMin, endMin: b.endMin }));
      } catch {
        clinicExtBusy = undefined;
      }
    } else if (requestRow.mode === 'package') {
      const rawSchedules = Array.isArray(payload.schedules) ? payload.schedules : [];
      for (const sch of rawSchedules) {
        expandedPackageSlots.push(...expandStudioScheduleItem(tenantId, sch));
      }
      studioExtBusyMap = await prefetchStudioExternalBusy(tenantId, expandedPackageSlots);
    } else if (requestRow.mode === 'service') {
      expandedServiceSlots = expandStudioScheduleItem(tenantId, {
        serviceId: String(payload.serviceId),
        professionalId: payload.professionalId ? String(payload.professionalId) : 'any',
        classScheduleId: payload.classScheduleId ? String(payload.classScheduleId) : null,
        modality: payload.modality,
        startTime: String(payload.startTime),
        endTime: payload.endTime ? String(payload.endTime) : undefined,
        recurrence: payload.recurrence || undefined
      });
      studioExtBusyMap = await prefetchStudioExternalBusy(tenantId, expandedServiceSlots);
    }

    const gcalSyncTargets: Array<{ appointmentId: string; professionalId: string; isGroupService: boolean; isFirstEnrollment: boolean }> = [];

    // 4. Transação atômica com lock otimista em SQLite
    const txResult = db.transaction(() => {
      const lockInfo = db.prepare(`
        UPDATE public_booking_requests
        SET status = 'confirming', updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ? AND status = 'awaiting_confirmation'
      `).run(requestRow.id, tenantId);

      if (Number(lockInfo?.changes || 0) === 0) {
        const latest = db.prepare(`SELECT status FROM public_booking_requests WHERE id = ? AND tenant_id = ?`).get(requestRow.id, tenantId) as any;
        if (latest?.status === 'confirmed') {
          throw Object.assign(new Error('Esta solicitação já foi confirmada anteriormente.'), {
            status: 409,
            code: 'REQUEST_ALREADY_CONFIRMED'
          });
        }
        throw Object.assign(new Error('Esta solicitação já está sendo processada ou não está mais pendente.'), {
          status: 409,
          code: 'REQUEST_NOT_PENDING'
        });
      }

      const confirmedAtIso = new Date().toISOString();
      const expiresAtIso = addMinutesToIso(confirmedAtIso, CONFIRMATION_NOTIFICATION_TTL_MINUTES);

      // =====================================================================
      // FLUXO 1: CLÍNICA / SOLICITAÇÃO INDIVIDUAL ÚNICA
      // =====================================================================
      if (requestRow.mode === 'single') {
        const {
          professionalId,
          serviceId,
          normalizedStartTime,
          normalizedEndTime,
          effectiveModality,
          agreedAmount,
          catalogPriceSnapshot,
          patientNotes,
          newPatientData,
          matchedScheduleId
        } = payload;

        const serviceRow = db.prepare(`SELECT * FROM services WHERE id = ? AND tenant_id = ? AND active = 1`).get(serviceId, tenantId) as any;
        const profRow = db.prepare(`SELECT id, name, profession_id FROM professionals WHERE id = ? AND tenant_id = ? AND active = 1`).get(professionalId, tenantId) as any;
        if (!serviceRow || !profRow) {
          throw Object.assign(new Error('Profissional ou serviço não está mais ativo neste estabelecimento.'), {
            status: 409,
            code: 'SERVICE_OR_PROFESSIONAL_INACTIVE'
          });
        }

        const isGroupService = serviceRow.service_kind === 'group';
        const defaultGroupCapacity = isGroupService ? Math.max(1, Number(serviceRow.default_capacity) || 1) : 1;

        const dateStr = String(normalizedStartTime).slice(0, 10);
        const availableSlots = calculateAvailableSlots(
          tenantId,
          professionalId,
          serviceId,
          dateStr,
          undefined,
          undefined,
          clinicExtBusy
        );
        if (!availableSlots.some(s => s.startTime === normalizedStartTime && s.endTime === normalizedEndTime)) {
          throw Object.assign(
            new Error('Este horário não está mais disponível na agenda. Outro agendamento, bloqueio ou ajuste de escala entrou em conflito.'),
            { status: 409, code: 'SLOT_UNAVAILABLE' }
          );
        }

        const hoursCheck = validateClinicBusinessHours(tenantId, normalizedStartTime, normalizedEndTime);
        if (!hoursCheck.valid) {
          throw Object.assign(new Error(hoursCheck.error || 'Fora do horário de funcionamento.'), {
            status: 409,
            code: 'OUTSIDE_BUSINESS_HOURS'
          });
        }
        const scheduleCheck = validateProfessionalSchedule(tenantId, professionalId, normalizedStartTime, normalizedEndTime);
        if (!scheduleCheck.valid) {
          throw Object.assign(new Error(scheduleCheck.error || 'Fora da escala do profissional.'), {
            status: 409,
            code: 'OUTSIDE_PROFESSIONAL_SCHEDULE'
          });
        }

        if (!isGroupService) {
          const profConflict = db.prepare(`
            SELECT id FROM appointments
            WHERE tenant_id = ? AND professional_id = ? AND status NOT IN ('cancelled')
              AND REPLACE(start_time, ' ', 'T') < ? AND REPLACE(end_time, ' ', 'T') > ?
            LIMIT 1
          `).get(tenantId, professionalId, normalizedEndTime, normalizedStartTime);
          if (profConflict) {
            throw Object.assign(new Error('O profissional já possui outro agendamento confirmado neste horário.'), {
              status: 409,
              code: 'PROFESSIONAL_SLOT_OCCUPIED'
            });
          }
        }

        // Resolve ou cria paciente somente na confirmação
        let resolvedPatientId = findExistingPatientByContactReadOnly(tenantId, newPatientData?.phone, newPatientData?.email);
        if (!resolvedPatientId) {
          resolvedPatientId = 'pat-' + uuidv4().slice(0, 8);
          db.prepare(`
            INSERT INTO patients (id, tenant_id, full_name, phone, email, is_child, notes_admin, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
          `).run(
            resolvedPatientId,
            tenantId,
            newPatientData.fullName,
            newPatientData.phone,
            newPatientData.email || null,
            newPatientData.isChild ? 1 : 0,
            newPatientData.notes || null
          );
          if (newPatientData.isChild && newPatientData.guardianName) {
            db.prepare(`
              INSERT INTO guardians (id, tenant_id, patient_id, full_name, phone, relationship, is_primary, authorization_signed)
              VALUES (?, ?, ?, ?, ?, 'legal_guardian', 1, 0)
            `).run('grd-' + uuidv4().slice(0, 8), tenantId, resolvedPatientId, newPatientData.guardianName, newPatientData.guardianPhone || newPatientData.phone);
          }
        }

        const patientConflict = db.prepare(`
          SELECT id FROM appointments
          WHERE tenant_id = ? AND patient_id = ? AND status NOT IN ('cancelled')
            AND REPLACE(start_time, ' ', 'T') < ? AND REPLACE(end_time, ' ', 'T') > ?
          LIMIT 1
        `).get(tenantId, resolvedPatientId, normalizedEndTime, normalizedStartTime);
        if (patientConflict) {
          throw Object.assign(new Error('O paciente/aluno já possui um agendamento confirmado neste horário.'), {
            status: 409,
            code: 'PATIENT_APPOINTMENT_CONFLICT'
          });
        }

        let occurrenceId: string | null = null;
        let isFirstEnrollment = true;
        if (isGroupService) {
          const occ = resolveOrCreateGroupOccurrenceTx({
            tenantId,
            serviceId,
            serviceName: serviceRow.name || 'Turma',
            professionalId,
            roomId: null,
            classScheduleId: matchedScheduleId || null,
            startTime: normalizedStartTime,
            endTime: normalizedEndTime,
            defaultCapacity: defaultGroupCapacity,
            modality: effectiveModality,
            patientId: resolvedPatientId
          });
          occurrenceId = occ.occurrenceId;
          isFirstEnrollment = occ.isFirstEnrollment;
        }

        let initialClinicalModule: string | null = null;
        if (serviceRow.clinical_module && isPrimaryClinicalModule(serviceRow.clinical_module)) {
          initialClinicalModule = serviceRow.clinical_module;
        } else {
          const resolvedMod = resolveClinicalModule({ professional_id: professionalId, service_id: serviceId }, tenantId);
          if (isPrimaryClinicalModule(resolvedMod)) initialClinicalModule = resolvedMod;
        }

        const appointmentId = 'apt-' + uuidv4().slice(0, 8);
        const year = new Date().getFullYear();
        const count = ((db.prepare('SELECT COUNT(*) as c FROM appointments WHERE tenant_id = ?').get(tenantId) as { c: number }).c || 0) + 1;
        const appointmentNumber = `AG-${year}-${count.toString().padStart(4, '0')}`;

        db.prepare(`
          INSERT INTO appointments (
            id, tenant_id, appointment_number, patient_id, professional_id, service_id,
            room_id, start_time, end_time, status, modality, patient_notes,
            clinical_module, profession_id, series_id, occurrence_id, service_kind, attendance_status,
            template_id, catalog_price_snapshot, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 'scheduled', ?, ?, ?, ?, NULL, ?, ?, 'pending', ?, ?, ?)
        `).run(
          appointmentId,
          tenantId,
          appointmentNumber,
          resolvedPatientId,
          professionalId,
          serviceId,
          normalizedStartTime,
          normalizedEndTime,
          effectiveModality,
          patientNotes || null,
          initialClinicalModule,
          profRow.profession_id || null,
          occurrenceId,
          isGroupService ? 'group' : 'individual',
          serviceRow.default_template_id || null,
          Number(catalogPriceSnapshot ?? serviceRow.price ?? 0),
          userId
        );

        db.prepare(`
          INSERT INTO appointment_status_history (id, appointment_id, previous_status, new_status, changed_by, reason)
          VALUES (?, ?, NULL, 'scheduled', ?, ?)
        `).run(uuidv4(), appointmentId, userId, 'Solicitação pública confirmada pelo estabelecimento');

        const amountNum = Math.round(Number(agreedAmount ?? serviceRow.price ?? 0) * 100) / 100;
        if (amountNum > 0) {
          db.prepare(`
            INSERT INTO payments (id, tenant_id, appointment_id, patient_id, amount, payment_method, status, notes, service_id, base_amount, professional_id)
            VALUES (?, ?, ?, ?, ?, 'pix', 'pending', 'Gerado na confirmação do agendamento público', ?, ?, ?)
          `).run('pay-' + uuidv4().slice(0, 8), tenantId, appointmentId, resolvedPatientId, amountNum, serviceId, amountNum, professionalId);
        }

        NotificationService.scheduleAppointmentReminder(appointmentId);
        gcalSyncTargets.push({ appointmentId, professionalId, isGroupService, isFirstEnrollment });

        db.prepare(`
          UPDATE public_booking_requests
          SET status = 'confirmed',
              patient_id = ?,
              confirmed_appointment_id = ?,
              confirmed_appointment_ids_json = ?,
              confirmed_by_user_id = ?,
              confirmed_at = ?,
              conflict_reason = NULL,
              updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(resolvedPatientId, appointmentId, JSON.stringify([appointmentId]), userId, confirmedAtIso, requestRow.id, tenantId);

        InternalNotificationService.markRequestConfirmedNotificationsTx({
          tenantId,
          requestId: requestRow.id,
          confirmedByUserId: userId,
          confirmedAtIso,
          expiresAtIso,
          appointmentId,
          occurrenceId
        });

        return {
          appointmentId,
          appointmentIds: [appointmentId],
          seriesId: null,
          contractId: null,
          billingPlanId: null,
          confirmedAtIso,
          expiresAtIso
        };
      }

      // =====================================================================
      // FLUXO 2: STUDIO PACOTE / PLANO DE ACESSO
      // =====================================================================
      const resolveOrCreateStudioStudentTx = (): string => {
        const student = payload.student || {};
        const phone = String(student.phone || '');
        const whatsapp = String(student.whatsapp || phone);
        const cpf = student.cpf ? String(student.cpf).trim() : null;
        const existingId = findExistingPatientByContactReadOnly(tenantId, phone, student.email);
        if (existingId) {
          db.prepare(`
            UPDATE patients
            SET whatsapp = COALESCE(whatsapp, ?),
                cpf = COALESCE(cpf, ?),
                updated_at = datetime('now')
            WHERE id = ? AND tenant_id = ?
          `).run(whatsapp, cpf, existingId, tenantId);
          return existingId;
        }
        const newId = 'pat-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO patients (id, tenant_id, full_name, phone, whatsapp, email, cpf, notes_admin, active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).run(newId, tenantId, student.fullName, phone, whatsapp, student.email || null, cpf, student.notes || null);
        return newId;
      };

      if (requestRow.mode === 'access_plan' || payload.type === 'studio_access_plan') {
        const resolvedStudentId = resolveOrCreateStudioStudentTx();
        const enrollment = StudioAccessService.createEnrollmentTx({
          tenantId,
          studentId: resolvedStudentId,
          serviceId: String(payload.serviceId || requestRow.service_id),
          contractKind: 'access_plan',
          contractDurationCode: payload.contractDurationCode || '1_month',
          paymentPeriodicity: payload.paymentPeriodicity || 'monthly',
          startDate: payload.startDate || todayBrazilYmd(),
          paymentMethod: 'pix',
          initialPaymentStatus: 'pending',
          contractStatus: 'active',
          amount: payload.amount !== undefined ? Number(payload.amount) : undefined,
          maxEntriesPerWeek: payload.weeklyLimit !== undefined ? payload.weeklyLimit : null,
          maxEntriesPerMonth: payload.monthlyLimit !== undefined ? payload.monthlyLimit : null,
          accessMode: payload.accessMode || undefined,
          origin: 'admin',
          notes: payload.student?.notes || 'Plano de acesso contratado via link público e confirmado pelo estabelecimento',
          generateInitialCharge: true,
          createdBy: userId
        });

        db.prepare(`
          UPDATE public_booking_requests
          SET status = 'confirmed',
              patient_id = ?,
              confirmed_billing_plan_id = ?,
              confirmed_by_user_id = ?,
              confirmed_at = ?,
              conflict_reason = NULL,
              updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(resolvedStudentId, enrollment.contractId, userId, confirmedAtIso, requestRow.id, tenantId);

        InternalNotificationService.markRequestConfirmedNotificationsTx({
          tenantId,
          requestId: requestRow.id,
          confirmedByUserId: userId,
          confirmedAtIso,
          expiresAtIso,
          appointmentId: null,
          occurrenceId: null
        });

        return {
          appointmentId: null,
          appointmentIds: [],
          seriesId: null,
          contractId: null,
          billingPlanId: enrollment.contractId,
          confirmedAtIso,
          expiresAtIso
        };
      }

      if (requestRow.mode === 'package') {
        const pkg = PackageService.listCatalogPackages(tenantId, { includeInactive: false, publicOnly: true })
          .find(p => p.id === payload.packageId);
        if (!pkg) {
          throw Object.assign(new Error('Este pacote não está mais ativo para confirmação.'), { status: 409, code: 'PACKAGE_INACTIVE' });
        }

        const resolvedStudentId = resolveOrCreateStudioStudentTx();
        const contract = PackageService.createContractTx({
          tenantId,
          packageId: pkg.id,
          studentId: resolvedStudentId,
          origin: 'public_booking',
          contractStatus: 'requested',
          paymentStatus: 'pending',
          generateInitialCharge: true,
          notes: payload.student?.notes || 'Solicitação pública confirmada pelo Studio',
          createdBy: userId
        });

        const countRow = db.prepare('SELECT COUNT(*) as c FROM appointments WHERE tenant_id = ?').get(tenantId) as { c: number };
        let seq = (countRow?.c || 0) + 1;
        const year = new Date().getFullYear();
        const createdIds: string[] = [];
        let firstOccId: string | null = null;

        for (const item of expandedPackageSlots) {
          const studentOverlap = db.prepare(`
            SELECT id FROM appointments
            WHERE tenant_id = ? AND patient_id = ? AND status != 'cancelled'
              AND REPLACE(start_time, ' ', 'T') < ? AND REPLACE(end_time, ' ', 'T') > ?
          `).get(tenantId, resolvedStudentId, item.endIso, item.startIso);
          if (studentOverlap) {
            throw Object.assign(
              new Error(`O aluno já possui horário reservado em ${item.startIso.slice(0, 10)} às ${item.startIso.slice(11, 16)}.`),
              { status: 409, code: 'PATIENT_APPOINTMENT_CONFLICT' }
            );
          }

          const resolvedSlot = resolveStudioPublicSlot(tenantId, item, resolvedStudentId, studioExtBusyMap);
          const concreteProfId = resolvedSlot.professionalId;
          const concreteModality = resolvedSlot.modality;
          const profMeta = db.prepare(`SELECT name, profession_id FROM professionals WHERE id = ? AND tenant_id = ?`).get(concreteProfId, tenantId) as any;

          const isGroup = item.serviceRow.service_kind === 'group';
          const capacity = isGroup ? resolvedSlot.capacity : 1;

          let occurrenceId: string | null = null;
          let isFirstEnrollment = true;
          if (isGroup) {
            const occ = resolveOrCreateGroupOccurrenceTx({
              tenantId,
              serviceId: item.serviceRow.id,
              serviceName: item.serviceRow.name,
              professionalId: concreteProfId,
              roomId: resolvedSlot.roomId,
              classScheduleId: resolvedSlot.classScheduleId,
              startTime: item.startIso,
              endTime: item.endIso,
              defaultCapacity: capacity,
              modality: concreteModality,
              patientId: resolvedStudentId,
              coInstructorIds: resolvedSlot.coInstructorIds
            });
            occurrenceId = occ.occurrenceId;
            isFirstEnrollment = occ.isFirstEnrollment;
            if (!firstOccId) firstOccId = occurrenceId;
          }

          let clinicalModule: string | null = null;
          if (item.serviceRow.clinical_module && isPrimaryClinicalModule(item.serviceRow.clinical_module)) {
            clinicalModule = item.serviceRow.clinical_module;
          } else {
            const mod = resolveClinicalModule({ professional_id: concreteProfId, service_id: item.serviceRow.id }, tenantId);
            if (isPrimaryClinicalModule(mod)) clinicalModule = mod;
          }

          const apptId = 'apt-' + uuidv4().slice(0, 8);
          const apptNumber = `AG-${year}-${seq.toString().padStart(4, '0')}`;
          seq += 1;

          db.prepare(`
            INSERT INTO appointments (
              id, tenant_id, appointment_number, patient_id, professional_id, service_id,
              start_time, end_time, status, modality, patient_notes, clinical_module, profession_id,
              occurrence_id, service_kind, attendance_status,
              package_contract_id, is_package_covered, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, ?, 'pending', ?, 1, ?)
          `).run(
            apptId,
            tenantId,
            apptNumber,
            resolvedStudentId,
            concreteProfId,
            item.serviceRow.id,
            item.startIso,
            item.endIso,
            concreteModality,
            payload.student?.notes || null,
            clinicalModule,
            profMeta?.profession_id || null,
            occurrenceId,
            isGroup ? 'group' : 'individual',
            contract.id,
            userId
          );

          const resv = PackageService.reservePackageRightTx({
            tenantId,
            contractId: contract.id,
            studentId: resolvedStudentId,
            serviceId: item.serviceRow.id,
            appointmentId: apptId,
            startTime: item.startIso,
            allowRequestedContract: true,
            createdBy: userId
          });
          db.prepare(`UPDATE appointments SET package_entitlement_id = ? WHERE id = ? AND tenant_id = ?`).run(resv.entitlementId, apptId, tenantId);
          db.prepare(`
            INSERT INTO appointment_status_history (id, appointment_id, previous_status, new_status, changed_by, reason)
            VALUES (?, ?, NULL, 'scheduled', ?, 'Solicitação pública de pacote confirmada pelo Studio')
          `).run(uuidv4(), apptId, userId);

          NotificationService.scheduleAppointmentReminder(apptId);
          gcalSyncTargets.push({ appointmentId: apptId, professionalId: concreteProfId, isGroupService: isGroup, isFirstEnrollment });
          createdIds.push(apptId);
        }

        const firstApptId = createdIds[0] || null;
        db.prepare(`
          UPDATE public_booking_requests
          SET status = 'confirmed',
              patient_id = ?,
              confirmed_appointment_id = ?,
              confirmed_appointment_ids_json = ?,
              confirmed_contract_id = ?,
              confirmed_by_user_id = ?,
              confirmed_at = ?,
              conflict_reason = NULL,
              updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(resolvedStudentId, firstApptId, JSON.stringify(createdIds), contract.id, userId, confirmedAtIso, requestRow.id, tenantId);

        InternalNotificationService.markRequestConfirmedNotificationsTx({
          tenantId,
          requestId: requestRow.id,
          confirmedByUserId: userId,
          confirmedAtIso,
          expiresAtIso,
          appointmentId: firstApptId,
          occurrenceId: firstOccId,
          packageContractId: contract.id
        });

        return {
          appointmentId: firstApptId,
          appointmentIds: createdIds,
          seriesId: null,
          contractId: contract.id,
          billingPlanId: null,
          confirmedAtIso,
          expiresAtIso
        };
      }

      // =====================================================================
      // FLUXO 3: STUDIO SERVIÇO (Individual / Turma / Recorrente)
      // =====================================================================
      const resolvedStudentId = resolveOrCreateStudioStudentTx();
      const countRow = db.prepare('SELECT COUNT(*) as c FROM appointments WHERE tenant_id = ?').get(tenantId) as { c: number };
      let seq = (countRow?.c || 0) + 1;
      const year = new Date().getFullYear();

      const resolvedSlots = expandedServiceSlots.map(slotItem => {
        const patientConflict = db.prepare(`
          SELECT id FROM appointments
          WHERE tenant_id = ? AND patient_id = ? AND status != 'cancelled'
            AND REPLACE(start_time, ' ', 'T') < ? AND REPLACE(end_time, ' ', 'T') > ?
        `).get(tenantId, resolvedStudentId, slotItem.endIso, slotItem.startIso);
        if (patientConflict) {
          throw Object.assign(
            new Error(`O aluno já possui um horário reservado em ${slotItem.startIso.slice(0, 10)} às ${slotItem.startIso.slice(11, 16)}.`),
            { status: 409, code: 'PATIENT_APPOINTMENT_CONFLICT' }
          );
        }
        return {
          slotItem,
          resolvedSlot: resolveStudioPublicSlot(tenantId, slotItem, resolvedStudentId, studioExtBusyMap)
        };
      });

      const seriesId = resolvedSlots.length > 1 ? 'ser-' + uuidv4().slice(0, 8) : null;
      if (seriesId && resolvedSlots.length > 1) {
        const first = resolvedSlots[0];
        const last = resolvedSlots[resolvedSlots.length - 1];
        const seriesRecMeta = first.slotItem.recurrenceMeta;
        db.prepare(`
          INSERT INTO class_series (
            id, tenant_id, service_id, professional_id, patient_id, service_kind, title,
            modality, frequency, weekdays_json, interval_value, interval_unit,
            series_mode, plan_duration_code, schedule_entries_json,
            start_time_hhmm, duration_minutes, start_date, end_date,
            max_occurrences, capacity, unit_price, status, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
        `).run(
          seriesId,
          tenantId,
          first.slotItem.serviceRow.id,
          first.resolvedSlot.professionalId,
          resolvedStudentId,
          first.slotItem.serviceRow.service_kind === 'group' ? 'group' : 'individual',
          first.slotItem.serviceRow.name,
          first.resolvedSlot.modality,
          String(seriesRecMeta?.frequency || payload.recurrence?.frequency || 'weekly'),
          JSON.stringify(Array.isArray(seriesRecMeta?.weekdays) ? seriesRecMeta.weekdays : (Array.isArray(payload.recurrence?.weekdays) ? payload.recurrence.weekdays : [])),
          seriesRecMeta?.intervalValue ?? null,
          seriesRecMeta?.intervalUnit ?? null,
          seriesRecMeta?.seriesMode || 'legacy',
          seriesRecMeta?.durationCode || null,
          seriesRecMeta?.scheduleEntriesJson || null,
          first.slotItem.startIso.slice(11, 16),
          Number(first.slotItem.serviceRow.duration_minutes || 50),
          first.slotItem.startIso.slice(0, 10),
          last.slotItem.startIso.slice(0, 10),
          resolvedSlots.length,
          first.slotItem.serviceRow.service_kind === 'group' ? first.resolvedSlot.capacity : 1,
          Number(first.slotItem.serviceRow.price || 0),
          userId
        );
      }

      const firstSlot = resolvedSlots[0];
      const planStart = bookingTime(String(payload.startTime))!.slice(0, 10);
      const planEnd = resolvePlanDurationEndDate(planStart, firstSlot.slotItem.recurrenceMeta?.durationCode) ||
        (payload.recurrence?.endDate ? String(payload.recurrence.endDate).slice(0, 10) : resolvedSlots[resolvedSlots.length - 1].slotItem.startIso.slice(0, 10));
      const quote = payload.recurrence && firstSlot.slotItem.recurrenceMeta
        ? quoteFrequencyPlan({
            tenantId,
            serviceId: String(payload.serviceId),
            billingFrequency: firstSlot.slotItem.serviceRow.billing_mode,
            startDate: planStart,
            endDate: planEnd,
            publicOnly: true,
            includeStandardPricing: payload.bookingIntent === 'recurring',
            cadence: firstSlot.slotItem.recurrenceMeta.frequency,
            slots: resolvedSlots.map(({ slotItem, resolvedSlot }) => ({
              startTime: slotItem.startIso,
              endTime: slotItem.endIso,
              professionalId: resolvedSlot.professionalId,
              classScheduleId: resolvedSlot.classScheduleId
            }))
          })
        : null;

      let frequencyPlan: any = null;
      if (quote) {
        const existingCoverage = BillingCycleService.resolveActivePlanCoverage({
          tenantId,
          patientId: resolvedStudentId,
          serviceId: String(payload.serviceId),
          sessionDates: resolvedSlots.map(s => s.slotItem.startIso.slice(0, 10)),
          autoMatch: true
        });
        if (existingCoverage.error) {
          throw Object.assign(new Error(existingCoverage.error), { status: existingCoverage.status || 409 });
        }
        frequencyPlan = existingCoverage.plan;
        if (!frequencyPlan) {
          const overlapping = db.prepare(`
            SELECT id FROM recurring_billing_plans
            WHERE tenant_id = ? AND patient_id = ? AND service_id = ?
              AND status = 'active' AND COALESCE(covers_sessions, 1) = 1
              AND start_date <= ? AND (end_date IS NULL OR end_date = '' OR end_date >= ?)
            LIMIT 1
          `).get(tenantId, resolvedStudentId, String(payload.serviceId), planEnd, planStart);
          if (overlapping) {
            throw Object.assign(
              new Error('O aluno já possui um plano vigente neste período.'),
              { status: 409, code: 'EXISTING_PLAN_OVERLAP' }
            );
          }
          const createdPlan = BillingCycleService.createPeriodicPlanTx({
            tenantId,
            patientId: resolvedStudentId,
            serviceId: String(payload.serviceId),
            professionalId: firstSlot.resolvedSlot.professionalId,
            seriesId,
            title: firstSlot.slotItem.serviceRow.name,
            billingFrequency: firstSlot.slotItem.serviceRow.billing_mode,
            amount: quote.calculation.effectivePrice,
            startDate: planStart,
            endDate: planEnd,
            dueDay: firstSlot.slotItem.serviceRow.default_billing_due_day || 10,
            weeklyFrequency: quote.weeklyCount,
            weeklySessionsSnapshot: quote.weeklyCount,
            referenceSessionsCount: quote.calculation.referenceSessionsCount,
            pricingRuleSnapshot: quote.pricingRule,
            scheduleRules: quote.meetings,
            planDurationCode: firstSlot.slotItem.recurrenceMeta?.durationCode,
            coversSessions: true,
            generateInitialCycle: true,
            createdBy: userId
          });
          frequencyPlan = createdPlan.plan;
        }
      }

      const createdIds: string[] = [];
      let firstOccId: string | null = null;
      for (const { slotItem, resolvedSlot } of resolvedSlots) {
        const concreteProfId = resolvedSlot.professionalId;
        const concreteModality = resolvedSlot.modality;
        const profMeta = db.prepare(`SELECT name, profession_id FROM professionals WHERE id = ? AND tenant_id = ?`).get(concreteProfId, tenantId) as any;

        const isGroup = slotItem.serviceRow.service_kind === 'group';
        const capacity = isGroup ? resolvedSlot.capacity : 1;
        let occurrenceId: string | null = null;
        let isFirstEnrollment = true;
        if (isGroup) {
          const occ = resolveOrCreateGroupOccurrenceTx({
            tenantId,
            serviceId: slotItem.serviceRow.id,
            serviceName: slotItem.serviceRow.name,
            professionalId: concreteProfId,
            roomId: resolvedSlot.roomId,
            classScheduleId: resolvedSlot.classScheduleId,
            startTime: slotItem.startIso,
            endTime: slotItem.endIso,
            defaultCapacity: capacity,
            modality: concreteModality,
            seriesId,
            patientId: resolvedStudentId,
            coInstructorIds: resolvedSlot.coInstructorIds
          });
          occurrenceId = occ.occurrenceId;
          isFirstEnrollment = occ.isFirstEnrollment;
          if (!firstOccId) firstOccId = occurrenceId;
        }

        let clinicalModule: string | null = null;
        if (slotItem.serviceRow.clinical_module && isPrimaryClinicalModule(slotItem.serviceRow.clinical_module)) {
          clinicalModule = slotItem.serviceRow.clinical_module;
        } else {
          const mod = resolveClinicalModule({ professional_id: concreteProfId, service_id: slotItem.serviceRow.id }, tenantId);
          if (isPrimaryClinicalModule(mod)) clinicalModule = mod;
        }

        const apptId = 'apt-' + uuidv4().slice(0, 8);
        const apptNumber = `AG-${year}-${seq.toString().padStart(4, '0')}`;
        seq += 1;

        db.prepare(`
          INSERT INTO appointments (
            id, tenant_id, appointment_number, patient_id, professional_id, service_id,
            start_time, end_time, status, modality, patient_notes, clinical_module, profession_id,
            series_id, occurrence_id, service_kind, attendance_status, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        `).run(
          apptId,
          tenantId,
          apptNumber,
          resolvedStudentId,
          concreteProfId,
          slotItem.serviceRow.id,
          slotItem.startIso,
          slotItem.endIso,
          concreteModality,
          payload.student?.notes || null,
          clinicalModule,
          profMeta?.profession_id || null,
          seriesId,
          occurrenceId,
          isGroup ? 'group' : 'individual',
          userId
        );

        db.prepare(`
          INSERT INTO appointment_status_history (id, appointment_id, previous_status, new_status, changed_by, reason)
          VALUES (?, ?, NULL, 'scheduled', ?, 'Solicitação pública do Studio confirmada pelo estabelecimento')
        `).run(uuidv4(), apptId, userId);

        if (frequencyPlan) {
          db.prepare("UPDATE appointments SET recurring_plan_id = ?, billing_coverage_type = 'periodic_plan' WHERE id = ? AND tenant_id = ?")
            .run(frequencyPlan.id, apptId, tenantId);
        }
        const unitPrice = frequencyPlan ? 0 : Math.round(Number(slotItem.serviceRow.price || 0) * 100) / 100;
        if (unitPrice > 0) {
          db.prepare(`
            INSERT INTO payments (
              id, tenant_id, appointment_id, patient_id, amount, payment_method, status,
              due_date, notes, service_id, base_amount, professional_id
            ) VALUES (?, ?, ?, ?, ?, 'pix', 'pending', ?, 'Agendamento online confirmado — pagamento pendente no Studio', ?, ?, ?)
          `).run(
            'pay-' + uuidv4().slice(0, 8),
            tenantId,
            apptId,
            resolvedStudentId,
            unitPrice,
            slotItem.startIso.slice(0, 10),
            slotItem.serviceRow.id,
            unitPrice,
            concreteProfId
          );
        }

        NotificationService.scheduleAppointmentReminder(apptId);
        gcalSyncTargets.push({ appointmentId: apptId, professionalId: concreteProfId, isGroupService: isGroup, isFirstEnrollment });
        createdIds.push(apptId);
      }

      const firstApptId = createdIds[0] || null;
      db.prepare(`
        UPDATE public_booking_requests
        SET status = 'confirmed',
            patient_id = ?,
            confirmed_appointment_id = ?,
            confirmed_appointment_ids_json = ?,
            confirmed_series_id = ?,
            confirmed_billing_plan_id = ?,
            confirmed_by_user_id = ?,
            confirmed_at = ?,
            conflict_reason = NULL,
            updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(
        resolvedStudentId,
        firstApptId,
        JSON.stringify(createdIds),
        seriesId,
        frequencyPlan?.id || null,
        userId,
        confirmedAtIso,
        requestRow.id,
        tenantId
      );

      InternalNotificationService.markRequestConfirmedNotificationsTx({
        tenantId,
        requestId: requestRow.id,
        confirmedByUserId: userId,
        confirmedAtIso,
        expiresAtIso,
        appointmentId: firstApptId,
        occurrenceId: firstOccId,
        seriesId
      });

      return {
        appointmentId: firstApptId,
        appointmentIds: createdIds,
        seriesId,
        contractId: null,
        billingPlanId: frequencyPlan?.id || null,
        confirmedAtIso,
        expiresAtIso
      };
    })();

    // Sincronização assíncrona resiliente com Google Calendar pós-confirmação
    for (const target of gcalSyncTargets) {
      const gcalConn = GoogleCalendarService.getConnectionForProfessional(tenantId, target.professionalId);
      let shouldSync = Boolean(gcalConn && gcalConn.sync_enabled && gcalConn.sync_direction !== 'google_to_zemda');
      if (shouldSync && target.isGroupService && !target.isFirstEnrollment) {
        shouldSync = false;
      }
      if (gcalConn && shouldSync) {
        try {
          db.prepare(`
            INSERT INTO google_calendar_event_links (
              id, tenant_id, appointment_id, connection_id, calendar_id, google_event_id,
              sync_status, last_error, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, '', 'pending', 'Sincronização em andamento', datetime('now'), datetime('now'))
            ON CONFLICT(appointment_id) DO UPDATE SET
              sync_status = 'pending',
              last_error = 'Sincronização em andamento',
              updated_at = datetime('now')
          `).run(uuidv4(), tenantId, target.appointmentId, gcalConn.id, gcalConn.calendar_id);
          GoogleCalendarService.syncAppointmentCreated(target.appointmentId, tenantId).catch(() => {});
        } catch {}
      }
    }

    const updatedNotifRow = db.prepare(`
      SELECT * FROM internal_notifications
      WHERE id = ? AND tenant_id = ? AND recipient_user_id = ?
      LIMIT 1
    `).get(notificationOrRequestId, tenantId, userId) as any
      || db.prepare(`
        SELECT * FROM internal_notifications
        WHERE request_id = ? AND tenant_id = ? AND recipient_user_id = ?
        LIMIT 1
      `).get(requestRow.id, tenantId, userId) as any;

    return {
      notification: updatedNotifRow ? InternalNotificationService.mapRowToRecord(updatedNotifRow) : null,
      requestId: requestRow.id,
      appointmentId: txResult.appointmentId,
      appointmentIds: txResult.appointmentIds,
      seriesId: txResult.seriesId,
      contractId: txResult.contractId,
      billingPlanId: txResult.billingPlanId,
      confirmedAt: txResult.confirmedAtIso,
      expiresAt: txResult.expiresAtIso
    };
  }
}

export { sanitizeBookingErrorMessage };
