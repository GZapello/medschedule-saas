import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';
import { getTenantEstablishmentProfile, resolveServiceDomain } from '../utils/establishment-context';

export type NotificationEstablishmentMode = 'clinic' | 'studio';

export interface StudioBookingSessionInput {
  id: string;
  serviceId: string;
  serviceName: string;
  professionalId: string;
  professionalName?: string;
  startTime: string;
  endTime: string;
  occurrenceId?: string | null;
  classScheduleId?: string | null;
  serviceKind?: string | null;
}

export interface InternalNotificationRecord {
  id: string;
  tenantId: string;
  recipientUserId: string;
  category: string;
  establishmentMode: NotificationEstablishmentMode;
  title: string;
  summary: string;
  studentOrPatientName: string;
  serviceOrClassName: string;
  weekdaysLabel: string | null;
  timeRangeLabel: string | null;
  startDateLabel: string | null;
  startDateIso: string | null;
  professionalNames: string | null;
  classGroupLabel: string | null;
  sessionsCount: number;
  appointmentId: string | null;
  occurrenceId: string | null;
  seriesId: string | null;
  packageContractId: string | null;
  readAt: string | null;
  createdAt: string;
  createdAtLabel: string;
}

const WEEKDAY_SHORT_NAMES: Record<number, string> = {
  0: 'domingo',
  1: 'segunda',
  2: 'terça',
  3: 'quarta',
  4: 'quinta',
  5: 'sexta',
  6: 'sábado'
};

const WEEKDAY_FULL_NAMES: Record<number, string> = {
  0: 'domingo',
  1: 'segunda-feira',
  2: 'terça-feira',
  3: 'quarta-feira',
  4: 'quinta-feira',
  5: 'sexta-feira',
  6: 'sábado'
};

function getWeekdayNumber(ymd: string): number | null {
  const clean = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return null;
  const [y, m, d] = clean.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return Number.isNaN(dt.getTime()) ? null : dt.getUTCDay();
}

function formatDateBr(ymd?: string | null): string {
  const clean = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const [y, m, d] = clean.split('-');
  return `${d}/${m}/${y}`;
}

function formatClockBr(hhmm?: string | null): string {
  const clean = String(hhmm || '').trim().slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(clean)) return clean;
  const [hh, mm] = clean.split(':');
  return mm === '00' ? `${hh}h` : `${hh}h${mm}`;
}

function formatTimeRange(startIso?: string | null, endIso?: string | null): string {
  const startClock = String(startIso || '').replace(' ', 'T').slice(11, 16);
  const endClock = String(endIso || '').replace(' ', 'T').slice(11, 16);
  const startBr = formatClockBr(startClock);
  const endBr = formatClockBr(endClock);
  if (startBr && endBr && startBr !== endBr) {
    return `${startBr} às ${endBr}`;
  }
  return startBr || '';
}

function formatWeekdaysList(dayNumbers: number[]): string {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const unique = Array.from(new Set(dayNumbers.filter(d => d >= 0 && d <= 6))).sort(
    (a, b) => order.indexOf(a) - order.indexOf(b)
  );
  if (unique.length === 0) return '';
  if (unique.length === 1) return WEEKDAY_FULL_NAMES[unique[0]] || '';

  const labels = unique.map((d, idx) => {
    const isLast = idx === unique.length - 1;
    return isLast ? WEEKDAY_FULL_NAMES[d] : WEEKDAY_SHORT_NAMES[d];
  });
  if (labels.length === 2) return `${labels[0]} e ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
}

function formatCreatedAtBr(isoStr?: string | null): string {
  if (!isoStr) return '';
  try {
    const normalized = isoStr.includes('T') ? isoStr : `${isoStr.replace(' ', 'T')}Z`;
    const dt = new Date(normalized);
    if (Number.isNaN(dt.getTime())) return String(isoStr);
    const datePart = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(dt);
    const timePart = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(dt);
    return `${datePart} às ${timePart}`;
  } catch {
    return String(isoStr);
  }
}

export class InternalNotificationService {
  /**
   * Resolve os user_ids dos gestores ativos do estabelecimento (clinic_admin ou is_manager=1).
   * Recepcionistas/secretárias sem papel de gestor não são incluídas.
   */
  static resolveEstablishmentManagerUserIds(tenantId: string): string[] {
    if (!tenantId) return [];
    const recipientIds = new Set<string>();

    const cuManagers = db
      .prepare(`
        SELECT DISTINCT u.id
        FROM clinic_users cu
        JOIN users u ON u.id = cu.user_id
        WHERE cu.tenant_id = ?
          AND (cu.role = 'clinic_admin' OR cu.is_manager = 1)
          AND cu.role NOT IN ('receptionist', 'secretary', 'assistant', 'patient')
          AND COALESCE(cu.status, 'active') = 'active'
          AND cu.deactivated_at IS NULL
          AND u.status = 'active'
          AND u.deactivated_at IS NULL
      `)
      .all(tenantId) as Array<{ id: string }>;

    for (const row of cuManagers) {
      if (row.id) recipientIds.add(String(row.id));
    }

    const legacyAdmins = db
      .prepare(`
        SELECT DISTINCT u.id
        FROM users u
        WHERE u.tenant_id = ?
          AND u.role = 'clinic_admin'
          AND u.status = 'active'
          AND u.deactivated_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM clinic_users cu
            WHERE cu.user_id = u.id
              AND cu.tenant_id = ?
              AND (COALESCE(cu.status, 'active') != 'active' OR cu.deactivated_at IS NOT NULL)
          )
      `)
      .all(tenantId, tenantId) as Array<{ id: string }>;

    for (const row of legacyAdmins) {
      if (row.id) recipientIds.add(String(row.id));
    }

    return Array.from(recipientIds);
  }

  /**
   * Mapeia professionalIds -> userIds ativos vinculados ao estabelecimento.
   * Exclui profissionais inativos, usuários desativados ou perfis exclusivos de recepção.
   */
  static resolveActiveProfessionalUsers(
    tenantId: string,
    professionalIds: string[]
  ): Array<{ professionalId: string; userId: string; professionalName: string }> {
    const cleanIds = Array.from(new Set(professionalIds.map(id => String(id || '').trim()).filter(Boolean)));
    if (!tenantId || cleanIds.length === 0) return [];

    const placeholders = cleanIds.map(() => '?').join(', ');
    const rows = db
      .prepare(`
        SELECT
          p.id as professional_id,
          p.user_id as user_id,
          p.name as professional_name
        FROM professionals p
        JOIN users u ON u.id = p.user_id
        WHERE p.tenant_id = ?
          AND p.active = 1
          AND p.user_id IS NOT NULL
          AND p.id IN (${placeholders})
          AND u.status = 'active'
          AND u.deactivated_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM clinic_users cu
            WHERE cu.user_id = u.id
              AND cu.tenant_id = p.tenant_id
              AND (
                COALESCE(cu.status, 'active') != 'active'
                OR cu.deactivated_at IS NOT NULL
                OR (cu.role IN ('receptionist', 'secretary', 'assistant') AND COALESCE(cu.is_manager, 0) = 0)
              )
          )
      `)
      .all(tenantId, ...cleanIds) as Array<{
      professional_id: string;
      user_id: string;
      professional_name: string;
    }>;

    return rows.map(r => ({
      professionalId: String(r.professional_id),
      userId: String(r.user_id),
      professionalName: String(r.professional_name)
    }));
  }

  /**
   * Resolve todos os profissionais (titular + coinstrutores) associados a uma sessão/aula/agendamento.
   */
  static resolveSessionProfessionalIds(params: {
    tenantId: string;
    primaryProfessionalId: string;
    appointmentId?: string | null;
    occurrenceId?: string | null;
    classScheduleId?: string | null;
  }): string[] {
    const ids = new Set<string>();
    if (params.primaryProfessionalId) ids.add(String(params.primaryProfessionalId));

    try {
      if (params.occurrenceId) {
        const occRows = db
          .prepare(`
            SELECT professional_id
            FROM session_instructor_participants
            WHERE tenant_id = ? AND occurrence_id = ?
          `)
          .all(params.tenantId, params.occurrenceId) as Array<{ professional_id: string }>;
        for (const r of occRows) {
          if (r.professional_id) ids.add(String(r.professional_id));
        }
      }

      if (params.appointmentId) {
        const apptRows = db
          .prepare(`
            SELECT professional_id
            FROM session_instructor_participants
            WHERE tenant_id = ? AND appointment_id = ?
          `)
          .all(params.tenantId, params.appointmentId) as Array<{ professional_id: string }>;
        for (const r of apptRows) {
          if (r.professional_id) ids.add(String(r.professional_id));
        }
      }

      if (params.classScheduleId) {
        const schedRows = db
          .prepare(`
            SELECT professional_id
            FROM class_schedule_instructors
            WHERE tenant_id = ? AND schedule_id = ?
          `)
          .all(params.tenantId, params.classScheduleId) as Array<{ professional_id: string }>;
        for (const r of schedRows) {
          if (r.professional_id) ids.add(String(r.professional_id));
        }
      }
    } catch (_) {}

    return Array.from(ids);
  }

  private static insertNotificationForRecipients(params: {
    tenantId: string;
    recipientUserIds: string[];
    establishmentMode: NotificationEstablishmentMode;
    title: string;
    summary: string;
    studentOrPatientName: string;
    serviceOrClassName: string;
    weekdaysLabel: string | null;
    timeRangeLabel: string | null;
    startDateLabel: string | null;
    startDateIso: string | null;
    professionalNames: string | null;
    classGroupLabel: string | null;
    sessionsCount: number;
    appointmentId: string | null;
    occurrenceId?: string | null;
    seriesId?: string | null;
    packageContractId?: string | null;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): void {
    const uniqueRecipients = Array.from(new Set(params.recipientUserIds.filter(Boolean)));
    if (uniqueRecipients.length === 0) return;

    const nowIso = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO internal_notifications (
        id, tenant_id, recipient_user_id, category, establishment_mode,
        title, summary, student_or_patient_name, service_or_class_name,
        weekdays_label, time_range_label, start_date_label, start_date_iso,
        professional_names, class_group_label, sessions_count,
        appointment_id, occurrence_id, series_id, package_contract_id,
        idempotency_key, metadata_json, read_at, created_at
      ) VALUES (?, ?, ?, 'public_booking', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
    `);

    const metadataJson = params.metadata ? JSON.stringify(params.metadata) : null;
    for (const userId of uniqueRecipients) {
      stmt.run(
        'intn-' + uuidv4().slice(0, 10),
        params.tenantId,
        userId,
        params.establishmentMode,
        params.title,
        params.summary,
        params.studentOrPatientName,
        params.serviceOrClassName,
        params.weekdaysLabel,
        params.timeRangeLabel,
        params.startDateLabel,
        params.startDateIso,
        params.professionalNames,
        params.classGroupLabel,
        params.sessionsCount,
        params.appointmentId,
        params.occurrenceId || null,
        params.seriesId || null,
        params.packageContractId || null,
        params.idempotencyKey,
        metadataJson,
        nowIso
      );
    }
  }

  /**
   * Notificação para agendamento público individual/avulso criado em /v1/public/appointments.
   * Adapta automaticamente o texto para Clínica ou Studio caso o serviço seja do domínio Studio.
   */
  static notifyPublicSingleAppointment(params: {
    tenantId: string;
    appointmentId: string;
    classScheduleId?: string | null;
  }): void {
    try {
      const row = db
        .prepare(`
          SELECT
            a.id, a.tenant_id, a.patient_id, a.professional_id, a.service_id,
            a.start_time, a.end_time, a.occurrence_id, a.series_id,
            COALESCE(a.service_kind, COALESCE(s.service_kind, 'individual')) as service_kind,
            pat.full_name as patient_name,
            p.name as professional_name,
            COALESCE(s.name, 'Atendimento') as service_name,
            s.service_domain,
            s.clinical_module,
            co.title as occurrence_title
          FROM appointments a
          JOIN patients pat ON pat.id = a.patient_id
          JOIN professionals p ON p.id = a.professional_id
          LEFT JOIN services s ON s.id = a.service_id
          LEFT JOIN class_occurrences co ON co.id = a.occurrence_id
          WHERE a.id = ? AND a.tenant_id = ?
        `)
        .get(params.appointmentId, params.tenantId) as any;

      if (!row) return;

      const estProfile = getTenantEstablishmentProfile(params.tenantId);
      const domain = resolveServiceDomain({
        establishmentProfile: estProfile,
        serviceDomain: row.service_domain,
        serviceKind: row.service_kind,
        clinicalModule: row.clinical_module
      });
      const establishmentMode: NotificationEstablishmentMode =
        estProfile === 'studio' || domain === 'studio' ? 'studio' : 'clinic';

      const profIds = this.resolveSessionProfessionalIds({
        tenantId: params.tenantId,
        primaryProfessionalId: row.professional_id,
        appointmentId: row.id,
        occurrenceId: row.occurrence_id || null,
        classScheduleId: params.classScheduleId || null
      });

      const profRows = db
        .prepare(`
          SELECT id, name FROM professionals
          WHERE tenant_id = ? AND id IN (${profIds.map(() => '?').join(', ')})
        `)
        .all(params.tenantId, ...profIds) as Array<{ id: string; name: string }>;

      const orderedProfNames = [
        row.professional_name,
        ...profRows.filter(pr => pr.id !== row.professional_id).map(pr => pr.name)
      ].filter(Boolean);
      const professionalNamesLabel = Array.from(new Set(orderedProfNames)).join(', ');

      const startYmd = String(row.start_time || '').slice(0, 10);
      const weekdayNum = getWeekdayNumber(startYmd);
      const weekdaysLabel = weekdayNum !== null ? formatWeekdaysList([weekdayNum]) : null;
      const timeRangeLabel = formatTimeRange(row.start_time, row.end_time);
      const startDateLabel = formatDateBr(startYmd);

      const managerUserIds = this.resolveEstablishmentManagerUserIds(params.tenantId);
      const activeProfUsers = this.resolveActiveProfessionalUsers(params.tenantId, profIds).map(u => u.userId);
      const allRecipients = Array.from(new Set([...managerUserIds, ...activeProfUsers]));

      const isStudio = establishmentMode === 'studio';
      const classGroupLabel = isStudio
        ? (row.service_kind === 'group' ? (row.occurrence_title || 'Turma coletiva') : null)
        : null;

      this.insertNotificationForRecipients({
        tenantId: params.tenantId,
        recipientUserIds: allRecipients,
        establishmentMode,
        title: 'Novo agendamento pelo link público',
        summary: isStudio
          ? `O aluno ${row.patient_name} realizou um agendamento para ${row.service_name}.`
          : `O paciente ${row.patient_name} realizou um agendamento para ${row.service_name}.`,
        studentOrPatientName: row.patient_name,
        serviceOrClassName: row.service_name,
        weekdaysLabel,
        timeRangeLabel,
        startDateLabel,
        startDateIso: startYmd,
        professionalNames: professionalNamesLabel || row.professional_name,
        classGroupLabel,
        sessionsCount: 1,
        appointmentId: row.id,
        occurrenceId: row.occurrence_id || null,
        seriesId: row.series_id || null,
        idempotencyKey: `public-booking:appt:${row.id}`,
        metadata: { source: 'public_appointments' }
      });
    } catch (err) {
      console.warn('[InternalNotificationService.notifyPublicSingleAppointment] Aviso:', err);
    }
  }

  /**
   * Notificação consolidada para agendamentos públicos concluídos no fluxo do Studio (/v1/public/studio/bookings).
   * Gera 1 notificação consolidada por destinatário (gestor e cada profissional/coinstrutor envolvido),
   * sem gerar dezenas de alertas repetidos para séries recorrentes ou pacotes.
   */
  static notifyPublicStudioBooking(params: {
    tenantId: string;
    mode: 'service' | 'package';
    studentName: string;
    packageName?: string | null;
    contractId?: string | null;
    seriesId?: string | null;
    appointments: StudioBookingSessionInput[];
  }): void {
    try {
      const sessions = Array.isArray(params.appointments) ? params.appointments : [];
      if (!params.tenantId || sessions.length === 0) return;

      const sortedSessions = [...sessions].sort((a, b) =>
        String(a.startTime || '').localeCompare(String(b.startTime || ''))
      );

      // Enriquecer cada sessão com dados persistidos (turma, profissional titular e coinstrutores)
      const enriched = sortedSessions.map(s => {
        const dbRow = db
          .prepare(`
            SELECT a.occurrence_id, a.series_id, COALESCE(a.service_kind, 'individual') as service_kind,
                   p.name as professional_name, co.title as occurrence_title, co.class_schedule_id
            FROM appointments a
            JOIN professionals p ON p.id = a.professional_id
            LEFT JOIN class_occurrences co ON co.id = a.occurrence_id
            WHERE a.id = ? AND a.tenant_id = ?
          `)
          .get(s.id, params.tenantId) as any;

        const profIds = this.resolveSessionProfessionalIds({
          tenantId: params.tenantId,
          primaryProfessionalId: s.professionalId,
          appointmentId: s.id,
          occurrenceId: dbRow?.occurrence_id || s.occurrenceId || null,
          classScheduleId: dbRow?.class_schedule_id || s.classScheduleId || null
        });

        return {
          ...s,
          occurrenceId: dbRow?.occurrence_id || s.occurrenceId || null,
          seriesId: dbRow?.series_id || params.seriesId || null,
          serviceKind: dbRow?.service_kind || s.serviceKind || 'individual',
          professionalName: dbRow?.professional_name || s.professionalName || 'Instrutor',
          occurrenceTitle: dbRow?.occurrence_title || null,
          involvedProfIds: profIds
        };
      });

      const buildSummaryPayload = (subset: typeof enriched) => {
        const first = subset[0];
        const startYmd = String(first.startTime || '').slice(0, 10);
        const startDateLabel = formatDateBr(startYmd);

        const dayNums: number[] = [];
        const timeRanges: string[] = [];
        const serviceNames: string[] = [];
        const profNames: string[] = [];
        let hasGroup = false;

        for (const item of subset) {
          const wd = getWeekdayNumber(item.startTime);
          if (wd !== null) dayNums.push(wd);
          const tr = formatTimeRange(item.startTime, item.endTime);
          if (tr && !timeRanges.includes(tr)) timeRanges.push(tr);
          if (item.serviceName && !serviceNames.includes(item.serviceName)) serviceNames.push(item.serviceName);
          if (item.professionalName && !profNames.includes(item.professionalName)) profNames.push(item.professionalName);
          if (item.serviceKind === 'group') hasGroup = true;
        }

        const weekdaysLabel = formatWeekdaysList(dayNums) || null;
        const timeRangeLabel = timeRanges.join(' · ') || null;
        const baseServiceLabel =
          params.mode === 'package' && params.packageName
            ? `${params.packageName}${serviceNames.length > 0 ? ` (${serviceNames.join(', ')})` : ''}`
            : serviceNames.join(', ') || 'Aula';

        const isGroupTitle =
          hasGroup && first.occurrenceTitle ? first.occurrenceTitle : (hasGroup ? 'Turma coletiva' : null);
        const sessionsPart = subset.length > 1 ? `${subset.length} sessões` : null;
        const classGroupLabel = [isGroupTitle, sessionsPart].filter(Boolean).join(' • ') || null;

        return {
          title: 'Novo agendamento pelo link público',
          summary: `O aluno ${params.studentName} realizou um agendamento para ${baseServiceLabel}.`,
          serviceOrClassName: baseServiceLabel,
          weekdaysLabel,
          timeRangeLabel,
          startDateLabel,
          startDateIso: startYmd,
          professionalNames: profNames.join(', '),
          classGroupLabel,
          sessionsCount: subset.length,
          appointmentId: first.id,
          occurrenceId: first.occurrenceId || null,
          seriesId: first.seriesId || params.seriesId || null
        };
      };

      const baseKey =
        params.mode === 'package' && params.contractId
          ? `public-booking:pkg:${params.contractId}`
          : enriched.length > 1
            ? `public-booking:series:${enriched[0].seriesId || enriched[0].id}`
            : `public-booking:appt:${enriched[0].id}`;

      // 1. Notificação consolidada para Gestores (visão completa da contratação)
      const managerUserIds = this.resolveEstablishmentManagerUserIds(params.tenantId);
      if (managerUserIds.length > 0) {
        const managerPayload = buildSummaryPayload(enriched);
        this.insertNotificationForRecipients({
          tenantId: params.tenantId,
          recipientUserIds: managerUserIds,
          establishmentMode: 'studio',
          ...managerPayload,
          studentOrPatientName: params.studentName,
          packageContractId: params.contractId || null,
          idempotencyKey: baseKey,
          metadata: { source: 'public_studio_booking', mode: params.mode }
        });
      }

      // 2. Notificação consolidada para cada Profissional/Instrutor (apenas sessões sob sua responsabilidade)
      const managerSet = new Set(managerUserIds);
      const allInvolvedProfIds = Array.from(new Set(enriched.flatMap(s => s.involvedProfIds)));
      const profUsers = this.resolveActiveProfessionalUsers(params.tenantId, allInvolvedProfIds);

      // Agrupa sessões por userId (um usuário pode ter mais de um cadastro ou atuar em múltiplos horários)
      const sessionsByUser = new Map<string, typeof enriched>();
      for (const pu of profUsers) {
        if (managerSet.has(pu.userId)) continue; // Gestor já recebeu a visão consolidada completa
        const list = sessionsByUser.get(pu.userId) || [];
        for (const s of enriched) {
          if (s.involvedProfIds.includes(pu.professionalId) && !list.some(x => x.id === s.id)) {
            list.push(s);
          }
        }
        if (list.length > 0) {
          list.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
          sessionsByUser.set(pu.userId, list);
        }
      }

      for (const [userId, profSessions] of sessionsByUser.entries()) {
        const profPayload = buildSummaryPayload(profSessions);
        this.insertNotificationForRecipients({
          tenantId: params.tenantId,
          recipientUserIds: [userId],
          establishmentMode: 'studio',
          ...profPayload,
          studentOrPatientName: params.studentName,
          packageContractId: params.contractId || null,
          idempotencyKey: baseKey,
          metadata: { source: 'public_studio_booking', mode: params.mode }
        });
      }
    } catch (err) {
      console.warn('[InternalNotificationService.notifyPublicStudioBooking] Aviso:', err);
    }
  }

  static getUnreadCountForUser(tenantId: string, userId: string): number {
    if (!tenantId || !userId) return 0;
    const row = db
      .prepare(`
        SELECT COUNT(*) as total
        FROM internal_notifications
        WHERE tenant_id = ? AND recipient_user_id = ? AND read_at IS NULL
      `)
      .get(tenantId, userId) as { total: number } | undefined;
    return Number(row?.total || 0);
  }

  static listForUser(tenantId: string, userId: string, limit = 30): {
    notifications: InternalNotificationRecord[];
    unreadCount: number;
  } {
    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const rows = db
      .prepare(`
        SELECT *
        FROM internal_notifications
        WHERE tenant_id = ? AND recipient_user_id = ?
        ORDER BY created_at DESC, rowid DESC
        LIMIT ?
      `)
      .all(tenantId, userId, safeLimit) as any[];

    const notifications: InternalNotificationRecord[] = rows.map(r => ({
      id: r.id,
      tenantId: r.tenant_id,
      recipientUserId: r.recipient_user_id,
      category: r.category,
      establishmentMode: r.establishment_mode === 'studio' ? 'studio' : 'clinic',
      title: r.title,
      summary: r.summary,
      studentOrPatientName: r.student_or_patient_name,
      serviceOrClassName: r.service_or_class_name,
      weekdaysLabel: r.weekdays_label || null,
      timeRangeLabel: r.time_range_label || null,
      startDateLabel: r.start_date_label || null,
      startDateIso: r.start_date_iso || null,
      professionalNames: r.professional_names || null,
      classGroupLabel: r.class_group_label || null,
      sessionsCount: Number(r.sessions_count || 1),
      appointmentId: r.appointment_id || null,
      occurrenceId: r.occurrence_id || null,
      seriesId: r.series_id || null,
      packageContractId: r.package_contract_id || null,
      readAt: r.read_at || null,
      createdAt: r.created_at,
      createdAtLabel: formatCreatedAtBr(r.created_at)
    }));

    return {
      notifications,
      unreadCount: this.getUnreadCountForUser(tenantId, userId)
    };
  }

  static markReadForUser(
    tenantId: string,
    userId: string,
    options: { notificationIds?: string[]; markAll?: boolean }
  ): { updated: number; unreadCount: number } {
    if (!tenantId || !userId) return { updated: 0, unreadCount: 0 };
    const nowIso = new Date().toISOString();
    let updated = 0;

    if (options.markAll) {
      const info = db
        .prepare(`
          UPDATE internal_notifications
          SET read_at = COALESCE(read_at, ?)
          WHERE tenant_id = ? AND recipient_user_id = ? AND read_at IS NULL
        `)
        .run(nowIso, tenantId, userId);
      updated = Number(info?.changes || 0);
    } else if (Array.isArray(options.notificationIds) && options.notificationIds.length > 0) {
      const cleanIds = Array.from(
        new Set(options.notificationIds.map(id => String(id || '').trim()).filter(Boolean))
      ).slice(0, 100);
      if (cleanIds.length > 0) {
        const placeholders = cleanIds.map(() => '?').join(', ');
        const info = db
          .prepare(`
            UPDATE internal_notifications
            SET read_at = COALESCE(read_at, ?)
            WHERE tenant_id = ? AND recipient_user_id = ? AND read_at IS NULL AND id IN (${placeholders})
          `)
          .run(nowIso, tenantId, userId, ...cleanIds);
        updated = Number(info?.changes || 0);
      }
    }

    return {
      updated,
      unreadCount: this.getUnreadCountForUser(tenantId, userId)
    };
  }
}
