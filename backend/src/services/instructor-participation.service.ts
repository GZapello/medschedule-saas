import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';

export type InstructorRole = 'primary' | 'co_instructor';
export type InstructorAttendanceStatus = 'scheduled' | 'present' | 'absent';

export interface ScheduleInstructorEntry {
  professionalId: string;
  professionalName: string;
  role: InstructorRole;
  photoUrl?: string | null;
}

export interface SessionParticipantRecord {
  id: string;
  tenant_id: string;
  service_id: string | null;
  occurrence_id: string | null;
  appointment_id: string | null;
  professional_id: string;
  professional_name: string;
  role: InstructorRole;
  attendance_status: InstructorAttendanceStatus;
  source: string;
  updated_by: string | null;
  updated_at: string;
}

export function normalizeUniqueIds(raw: unknown, excludeId?: string | null): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const id = String(item || '').trim();
    if (!id || id === excludeId || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export class InstructorParticipationService {
  static validateTenantProfessionals(tenantId: string, professionalIds: string[]): void {
    if (professionalIds.length === 0) return;
    const placeholders = professionalIds.map(() => '?').join(', ');
    const rows = db.prepare(`
      SELECT id FROM professionals
      WHERE tenant_id = ? AND active = 1 AND id IN (${placeholders})
    `).all(tenantId, ...professionalIds) as Array<{ id: string }>;
    const found = new Set(rows.map(r => r.id));
    for (const pid of professionalIds) {
      if (!found.has(pid)) {
        const err: any = new Error('Um ou mais profissionais informados para a equipe não pertencem a este estabelecimento ou estão inativos.');
        err.status = 400;
        err.code = 'INVALID_TEAM_PROFESSIONAL';
        throw err;
      }
    }
  }

  static getScheduleInstructorsMap(
    tenantId: string,
    scheduleIds: string[]
  ): Map<string, ScheduleInstructorEntry[]> {
    const map = new Map<string, ScheduleInstructorEntry[]>();
    if (!tenantId || scheduleIds.length === 0) return map;
    const placeholders = scheduleIds.map(() => '?').join(', ');
    const rows = db.prepare(`
      SELECT
        csi.schedule_id,
        csi.professional_id,
        csi.role,
        p.name as professional_name,
        p.photo_url
      FROM class_schedule_instructors csi
      JOIN professionals p ON p.id = csi.professional_id AND p.tenant_id = csi.tenant_id
      WHERE csi.tenant_id = ? AND p.active = 1 AND csi.schedule_id IN (${placeholders})
      ORDER BY CASE WHEN csi.role = 'primary' THEN 0 ELSE 1 END, p.name ASC
    `).all(tenantId, ...scheduleIds) as Array<{
      schedule_id: string;
      professional_id: string;
      role: InstructorRole;
      professional_name: string;
      photo_url?: string | null;
    }>;

    for (const r of rows) {
      const list = map.get(r.schedule_id) || [];
      list.push({
        professionalId: r.professional_id,
        professionalName: r.professional_name,
        role: r.role === 'primary' ? 'primary' : 'co_instructor',
        photoUrl: r.photo_url || null
      });
      map.set(r.schedule_id, list);
    }
    return map;
  }

  static getScheduleCoInstructorIds(tenantId: string, scheduleId: string, primaryProfessionalId?: string | null): string[] {
    if (!tenantId || !scheduleId) return [];
    const rows = db.prepare(`
      SELECT csi.professional_id
      FROM class_schedule_instructors csi
      JOIN professionals p ON p.id = csi.professional_id AND p.tenant_id = csi.tenant_id
      WHERE csi.tenant_id = ? AND csi.schedule_id = ? AND csi.role = 'co_instructor' AND p.active = 1
      ORDER BY p.name ASC
    `).all(tenantId, scheduleId) as Array<{ professional_id: string }>;
    return rows.map(r => r.professional_id).filter(id => id !== primaryProfessionalId);
  }

  static syncScheduleInstructorsTx(params: {
    tenantId: string;
    scheduleId: string;
    primaryProfessionalId: string;
    coInstructorIds?: unknown;
  }): void {
    const cleanCoIds = normalizeUniqueIds(params.coInstructorIds, params.primaryProfessionalId);
    this.validateTenantProfessionals(params.tenantId, [params.primaryProfessionalId, ...cleanCoIds]);

    db.prepare(`DELETE FROM class_schedule_instructors WHERE tenant_id = ? AND schedule_id = ?`)
      .run(params.tenantId, params.scheduleId);

    const ins = db.prepare(`
      INSERT INTO class_schedule_instructors (id, tenant_id, schedule_id, professional_id, role)
      VALUES (?, ?, ?, ?, ?)
    `);
    ins.run('csi-' + uuidv4().slice(0, 8), params.tenantId, params.scheduleId, params.primaryProfessionalId, 'primary');
    for (const coId of cleanCoIds) {
      ins.run('csi-' + uuidv4().slice(0, 8), params.tenantId, params.scheduleId, coId, 'co_instructor');
    }
  }

  static listParticipantsForOccurrence(tenantId: string, occurrenceId: string): SessionParticipantRecord[] {
    return db.prepare(`
      SELECT
        sip.*,
        p.name as professional_name
      FROM session_instructor_participants sip
      JOIN professionals p ON p.id = sip.professional_id AND p.tenant_id = sip.tenant_id
      WHERE sip.tenant_id = ? AND sip.occurrence_id = ?
      ORDER BY CASE WHEN sip.role = 'primary' THEN 0 ELSE 1 END, p.name ASC
    `).all(tenantId, occurrenceId) as SessionParticipantRecord[];
  }

  static listParticipantsForAppointment(tenantId: string, appointmentId: string): SessionParticipantRecord[] {
    return db.prepare(`
      SELECT
        sip.*,
        p.name as professional_name
      FROM session_instructor_participants sip
      JOIN professionals p ON p.id = sip.professional_id AND p.tenant_id = sip.tenant_id
      WHERE sip.tenant_id = ? AND sip.appointment_id = ? AND sip.occurrence_id IS NULL
      ORDER BY CASE WHEN sip.role = 'primary' THEN 0 ELSE 1 END, p.name ASC
    `).all(tenantId, appointmentId) as SessionParticipantRecord[];
  }

  static syncOccurrenceParticipantsTx(params: {
    tenantId: string;
    serviceId?: string | null;
    occurrenceId: string;
    primaryProfessionalId: string;
    coInstructorIds?: unknown;
    classScheduleId?: string | null;
    source?: string;
    updatedBy?: string | null;
    preserveExistingAttendance?: boolean;
  }): SessionParticipantRecord[] {
    const preserve = params.preserveExistingAttendance !== false;
    const explicitCoProvided = Array.isArray(params.coInstructorIds);

    let resolvedCoIds: string[] = [];
    if (explicitCoProvided) {
      resolvedCoIds = normalizeUniqueIds(params.coInstructorIds, params.primaryProfessionalId);
    } else if (params.classScheduleId) {
      resolvedCoIds = this.getScheduleCoInstructorIds(params.tenantId, params.classScheduleId, params.primaryProfessionalId);
    }

    this.validateTenantProfessionals(params.tenantId, [params.primaryProfessionalId, ...resolvedCoIds]);

    const existing = this.listParticipantsForOccurrence(params.tenantId, params.occurrenceId);
    const existingByProf = new Map(existing.map(r => [r.professional_id, r]));

    if (!preserve && explicitCoProvided) {
      const targetSet = new Set([params.primaryProfessionalId, ...resolvedCoIds]);
      for (const oldRow of existing) {
        if (!targetSet.has(oldRow.professional_id)) {
          db.prepare(`DELETE FROM session_instructor_participants WHERE id = ? AND tenant_id = ?`)
            .run(oldRow.id, params.tenantId);
          db.prepare(`
            INSERT INTO session_participant_audit (
              id, tenant_id, occurrence_id, professional_id, action, previous_status, new_status, changed_by, details_json
            ) VALUES (?, ?, ?, ?, 'REMOVE_INSTRUCTOR', ?, NULL, ?, ?)
          `).run(
            'spa-' + uuidv4().slice(0, 8),
            params.tenantId,
            params.occurrenceId,
            oldRow.professional_id,
            oldRow.attendance_status,
            params.updatedBy || 'system',
            JSON.stringify({ role: oldRow.role, source: params.source || 'manual' })
          );
        }
      }
    }

    const upsertRow = (profId: string, role: InstructorRole) => {
      const prev = existingByProf.get(profId);
      if (prev) {
        if (prev.role !== role) {
          db.prepare(`
            UPDATE session_instructor_participants
            SET role = ?, updated_by = ?, updated_at = datetime('now')
            WHERE id = ? AND tenant_id = ?
          `).run(role, params.updatedBy || null, prev.id, params.tenantId);
        }
        return;
      }
      db.prepare(`
        INSERT INTO session_instructor_participants (
          id, tenant_id, service_id, occurrence_id, appointment_id, professional_id, role,
          attendance_status, source, updated_by
        ) VALUES (?, ?, ?, ?, NULL, ?, ?, 'scheduled', ?, ?)
      `).run(
        'sip-' + uuidv4().slice(0, 8),
        params.tenantId,
        params.serviceId || null,
        params.occurrenceId,
        profId,
        role,
        params.source || 'schedule_inherit',
        params.updatedBy || null
      );
    };

    upsertRow(params.primaryProfessionalId, 'primary');
    for (const coId of resolvedCoIds) {
      upsertRow(coId, 'co_instructor');
    }

    return this.listParticipantsForOccurrence(params.tenantId, params.occurrenceId);
  }

  static syncAppointmentParticipantsTx(params: {
    tenantId: string;
    serviceId?: string | null;
    appointmentId: string;
    occurrenceId?: string | null;
    classScheduleId?: string | null;
    primaryProfessionalId: string;
    coInstructorIds?: unknown;
    source?: string;
    updatedBy?: string | null;
    replaceCoInstructors?: boolean;
  }): SessionParticipantRecord[] {
    if (params.occurrenceId) {
      return this.syncOccurrenceParticipantsTx({
        tenantId: params.tenantId,
        serviceId: params.serviceId,
        occurrenceId: params.occurrenceId,
        classScheduleId: params.classScheduleId,
        primaryProfessionalId: params.primaryProfessionalId,
        coInstructorIds: params.coInstructorIds,
        source: params.source,
        updatedBy: params.updatedBy,
        preserveExistingAttendance: !params.replaceCoInstructors
      });
    }

    const explicitCoProvided = Array.isArray(params.coInstructorIds);
    const cleanCoIds = explicitCoProvided
      ? normalizeUniqueIds(params.coInstructorIds, params.primaryProfessionalId)
      : [];

    if (!explicitCoProvided && !params.replaceCoInstructors) {
      return this.listParticipantsForAppointment(params.tenantId, params.appointmentId);
    }

    this.validateTenantProfessionals(params.tenantId, [params.primaryProfessionalId, ...cleanCoIds]);

    const existing = this.listParticipantsForAppointment(params.tenantId, params.appointmentId);
    const existingByProf = new Map(existing.map(r => [r.professional_id, r]));

    if (params.replaceCoInstructors && cleanCoIds.length === 0 && existing.length === 0) {
      return [];
    }

    if (params.replaceCoInstructors) {
      const targetSet = cleanCoIds.length > 0 ? new Set([params.primaryProfessionalId, ...cleanCoIds]) : new Set<string>();
      for (const oldRow of existing) {
        if (!targetSet.has(oldRow.professional_id)) {
          db.prepare(`DELETE FROM session_instructor_participants WHERE id = ? AND tenant_id = ?`)
            .run(oldRow.id, params.tenantId);
        }
      }
      if (cleanCoIds.length === 0) {
        return [];
      }
    }

    if (cleanCoIds.length === 0 && existing.length === 0) {
      return [];
    }

    const upsertAptRow = (profId: string, role: InstructorRole) => {
      const prev = existingByProf.get(profId);
      if (prev) {
        if (prev.role !== role) {
          db.prepare(`
            UPDATE session_instructor_participants
            SET role = ?, updated_by = ?, updated_at = datetime('now')
            WHERE id = ? AND tenant_id = ?
          `).run(role, params.updatedBy || null, prev.id, params.tenantId);
        }
        return;
      }
      db.prepare(`
        INSERT INTO session_instructor_participants (
          id, tenant_id, service_id, occurrence_id, appointment_id, professional_id, role,
          attendance_status, source, updated_by
        ) VALUES (?, ?, ?, NULL, ?, ?, ?, 'scheduled', ?, ?)
      `).run(
        'sip-' + uuidv4().slice(0, 8),
        params.tenantId,
        params.serviceId || null,
        params.appointmentId,
        profId,
        role,
        params.source || 'manual',
        params.updatedBy || null
      );
    };

    upsertAptRow(params.primaryProfessionalId, 'primary');
    for (const coId of cleanCoIds) {
      upsertAptRow(coId, 'co_instructor');
    }

    return this.listParticipantsForAppointment(params.tenantId, params.appointmentId);
  }

  static confirmParticipantStatusesTx(params: {
    tenantId: string;
    serviceId?: string | null;
    occurrenceId?: string | null;
    appointmentId?: string | null;
    primaryProfessionalId?: string | null;
    participants: Array<{
      professionalId: string;
      role?: InstructorRole;
      attendanceStatus: InstructorAttendanceStatus;
    }>;
    updatedBy: string;
    source?: string;
    replaceMissingCoInstructors?: boolean;
  }): SessionParticipantRecord[] {
    const occId = params.occurrenceId || null;
    const aptId = occId ? null : (params.appointmentId || null);
    if (!occId && !aptId) return [];

    const validStatuses = new Set<InstructorAttendanceStatus>(['scheduled', 'present', 'absent']);
    const incomingIds = Array.from(new Set(params.participants.map(p => String(p.professionalId || '').trim()).filter(Boolean)));
    this.validateTenantProfessionals(params.tenantId, incomingIds);

    const existing = occId
      ? this.listParticipantsForOccurrence(params.tenantId, occId)
      : this.listParticipantsForAppointment(params.tenantId, aptId!);
    const existingMap = new Map(existing.map(e => [e.professional_id, e]));

    if (params.replaceMissingCoInstructors) {
      const keepSet = new Set(incomingIds);
      if (params.primaryProfessionalId) keepSet.add(params.primaryProfessionalId);
      for (const oldRow of existing) {
        if (!keepSet.has(oldRow.professional_id)) {
          db.prepare(`DELETE FROM session_instructor_participants WHERE id = ? AND tenant_id = ?`)
            .run(oldRow.id, params.tenantId);
          db.prepare(`
            INSERT INTO session_participant_audit (
              id, tenant_id, occurrence_id, appointment_id, professional_id, action, previous_status, new_status, changed_by, details_json
            ) VALUES (?, ?, ?, ?, ?, 'REMOVE_INSTRUCTOR', ?, NULL, ?, ?)
          `).run(
            'spa-' + uuidv4().slice(0, 8),
            params.tenantId,
            occId,
            aptId,
            oldRow.professional_id,
            oldRow.attendance_status,
            params.updatedBy,
            JSON.stringify({ source: params.source || 'attendance_finish' })
          );
        }
      }
    }

    for (const item of params.participants) {
      const pid = String(item.professionalId || '').trim();
      if (!pid) continue;
      const nextStatus: InstructorAttendanceStatus = validStatuses.has(item.attendanceStatus)
        ? item.attendanceStatus
        : 'present';
      const role: InstructorRole = item.role === 'primary' || pid === params.primaryProfessionalId ? 'primary' : 'co_instructor';
      const prev = existingMap.get(pid);

      if (prev) {
        db.prepare(`
          UPDATE session_instructor_participants
          SET role = ?, attendance_status = ?, source = COALESCE(?, source), updated_by = ?, updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(role, nextStatus, params.source || null, params.updatedBy, prev.id, params.tenantId);

        if (prev.attendance_status !== nextStatus || prev.role !== role) {
          db.prepare(`
            INSERT INTO session_participant_audit (
              id, tenant_id, occurrence_id, appointment_id, professional_id, action, previous_status, new_status, changed_by, details_json
            ) VALUES (?, ?, ?, ?, ?, 'CONFIRM_INSTRUCTOR_PARTICIPATION', ?, ?, ?, ?)
          `).run(
            'spa-' + uuidv4().slice(0, 8),
            params.tenantId,
            occId,
            aptId,
            pid,
            prev.attendance_status,
            nextStatus,
            params.updatedBy,
            JSON.stringify({ role, source: params.source || 'attendance_finish' })
          );
        }
      } else {
        const sipId = 'sip-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO session_instructor_participants (
            id, tenant_id, service_id, occurrence_id, appointment_id, professional_id, role,
            attendance_status, source, updated_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          sipId,
          params.tenantId,
          params.serviceId || null,
          occId,
          aptId,
          pid,
          role,
          nextStatus,
          params.source || 'attendance_finish',
          params.updatedBy
        );

        db.prepare(`
          INSERT INTO session_participant_audit (
            id, tenant_id, occurrence_id, appointment_id, professional_id, action, previous_status, new_status, changed_by, details_json
          ) VALUES (?, ?, ?, ?, ?, 'ADD_AND_CONFIRM_INSTRUCTOR', NULL, ?, ?, ?)
        `).run(
          'spa-' + uuidv4().slice(0, 8),
          params.tenantId,
          occId,
          aptId,
          pid,
          nextStatus,
          params.updatedBy,
          JSON.stringify({ role, source: params.source || 'attendance_finish' })
        );
      }
    }

    return occId
      ? this.listParticipantsForOccurrence(params.tenantId, occId)
      : this.listParticipantsForAppointment(params.tenantId, aptId!);
  }

  static isProfessionalLinkedToOccurrence(
    tenantId: string,
    ownProfIds: string[],
    occurrenceId: string
  ): boolean {
    if (ownProfIds.length === 0) return false;
    const placeholders = ownProfIds.map(() => '?').join(', ');
    const directOcc = db.prepare(`
      SELECT 1 FROM class_occurrences
      WHERE tenant_id = ? AND id = ? AND professional_id IN (${placeholders})
      LIMIT 1
    `).get(tenantId, occurrenceId, ...ownProfIds);
    if (directOcc) return true;

    const participant = db.prepare(`
      SELECT 1 FROM session_instructor_participants
      WHERE tenant_id = ? AND occurrence_id = ? AND professional_id IN (${placeholders})
      LIMIT 1
    `).get(tenantId, occurrenceId, ...ownProfIds);
    if (participant) return true;

    const enrolledApt = db.prepare(`
      SELECT 1 FROM appointments
      WHERE tenant_id = ? AND occurrence_id = ? AND professional_id IN (${placeholders}) AND status != 'cancelled'
      LIMIT 1
    `).get(tenantId, occurrenceId, ...ownProfIds);
    return Boolean(enrolledApt);
  }
}
