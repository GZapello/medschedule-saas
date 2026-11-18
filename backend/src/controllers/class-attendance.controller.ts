import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';
import { logAudit } from '../middlewares/audit.middleware';
import { PackageService } from '../services/package.service';
import { syncReceptionStatusFromClinical } from './checkin.controller';
import { getClinicLocalNowIso, normalizeLocalDateTimeIso } from '../services/document-context.service';
import { shouldUseStudioPersonalWorkflow } from '../utils/establishment-context';
import { resolveProfessionalCanonicalModule } from '../utils/clinical-module';
import { InstructorAttendanceStatus, InstructorParticipationService, InstructorRole } from '../services/instructor-participation.service';
import { exerciseAnimation } from '../services/exercise-media';
import { ensureExerciseLibrarySeeded } from '../config/exercise-library.seed';

const VALID_ATTENDANCE_STATUSES = ['pending', 'present', 'absent', 'cancelled'] as const;
type AttendanceStatus = typeof VALID_ATTENDANCE_STATUSES[number];

function getOwnProfessionalIds(userId: string, tenantId: string): string[] {
  return (db.prepare(`
    SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ? AND active = 1
  `).all(userId, tenantId) as { id: string }[]).map(r => r.id);
}

function enrichTemplateWorkoutsWithMedia(tenantId: string, workoutsRaw: any[]): any[] {
  if (!Array.isArray(workoutsRaw)) return [];
  try {
    ensureExerciseLibrarySeeded(db);
  } catch {}

  const exStmtById = db.prepare(`
    SELECT *
    FROM personal_exercises
    WHERE id = ? AND (tenant_id = ? OR tenant_id = 'global')
    ORDER BY CASE WHEN tenant_id = ? THEN 0 ELSE 1 END
    LIMIT 1
  `);
  const exStmtByName = db.prepare(`
    SELECT *
    FROM personal_exercises
    WHERE LOWER(name) = LOWER(?) AND (tenant_id = ? OR tenant_id = 'global') AND is_active = 1
    ORDER BY CASE WHEN tenant_id = ? THEN 0 ELSE 1 END
    LIMIT 1
  `);

  return workoutsRaw.map((div, dIdx) => {
    const rawExs = Array.isArray(div?.exercises) ? div.exercises : [];
    const enrichedExercises = rawExs.map((ex: any, eIdx: number) => {
      const exId = ex?.exercise_id || ex?.id || null;
      const exName = String(ex?.name || ex?.exercise_name || '').trim();
      let libEx: any = null;
      if (exId) {
        libEx = exStmtById.get(exId, tenantId, tenantId);
      }
      if (!libEx && exName) {
        libEx = exStmtByName.get(exName, tenantId, tenantId);
      }
      const mergedForMedia = {
        ...(libEx || {}),
        ...ex,
        id: libEx?.id || exId || undefined,
        tenant_id: libEx?.tenant_id || undefined,
        name: ex?.name || ex?.exercise_name || libEx?.name || 'Exercício',
        muscle_group: ex?.muscle_group || libEx?.muscle_group || 'Geral',
        category: ex?.category || libEx?.category || 'Força',
        equipment: ex?.equipment || libEx?.equipment || null,
        instructions: ex?.instructions || libEx?.instructions || null,
        gif_url: ex?.gif_url || libEx?.gif_url || null,
        photo_url: ex?.photo_url || libEx?.photo_url || null,
        fallback_url: ex?.fallback_url || libEx?.fallback_url || null,
        video_url: ex?.video_url || libEx?.video_url || null,
        animation_key: ex?.animation_key || libEx?.animation_key || null
      };
      let anim: any = {};
      try {
        anim = exerciseAnimation(mergedForMedia) || {};
      } catch {}
      return {
        ...mergedForMedia,
        order_index: eIdx + 1,
        exercise_id: libEx?.id || ex?.exercise_id || null,
        sets: ex?.sets !== undefined ? Number(ex.sets) : 3,
        reps: ex?.reps !== undefined ? String(ex.reps) : '12',
        load_kg: ex?.load_kg !== undefined && ex?.load_kg !== null ? Number(ex.load_kg) : null,
        rest_seconds: ex?.rest_seconds !== undefined && ex?.rest_seconds !== null ? Number(ex.rest_seconds) : 60,
        duration_seconds: ex?.duration_seconds !== undefined && ex?.duration_seconds !== null ? Number(ex.duration_seconds) : null,
        technique: ex?.technique || 'Direta',
        notes: ex?.notes || null,
        gif_url: anim.gif_url || mergedForMedia.gif_url || null,
        photo_url: anim.photo_url || mergedForMedia.photo_url || null,
        fallback_url: anim.fallback_url || mergedForMedia.fallback_url || null,
        animation_url: anim.animation_url || anim.gif_url || mergedForMedia.gif_url || mergedForMedia.photo_url || null
      };
    });

    return {
      title: div?.title || `Bloco ${String.fromCharCode(65 + dIdx)}`,
      division: String(div?.division || String.fromCharCode(65 + dIdx)).toUpperCase(),
      notes: div?.notes || '',
      exercises: enrichedExercises
    };
  });
}

function buildOccurrenceExercisePlanBundle(params: {
  tenantId: string;
  realOccId: string | null;
  singleAptId: string | null;
  serviceId: string | null;
  classScheduleId?: string | null;
  canEdit: boolean;
}) {
  const { tenantId, realOccId, singleAptId, serviceId, classScheduleId, canEdit } = params;

  const allTplRows = db.prepare(`
    SELECT t.id, t.title, t.structure_type, t.description, t.workouts_json, t.professional_id, t.updated_at, t.created_at
    FROM personal_workout_templates t
    WHERE t.tenant_id = ?
    ORDER BY COALESCE(t.updated_at, t.created_at) DESC
  `).all(tenantId) as any[];

  const tplMap = new Map<string, any>();
  const availableTemplates = allTplRows.map(r => {
    let parsedWorkouts: any[] = [];
    try {
      parsedWorkouts = JSON.parse(r.workouts_json || '[]');
    } catch {}
    let exCount = 0;
    if (Array.isArray(parsedWorkouts)) {
      for (const w of parsedWorkouts) {
        if (Array.isArray(w?.exercises)) exCount += w.exercises.length;
      }
    }
    const item = {
      id: r.id,
      title: r.title,
      structure_type: r.structure_type || 'ABC',
      description: r.description || null,
      exercises_count: exCount,
      workouts: parsedWorkouts
    };
    tplMap.set(r.id, item);
    return {
      id: item.id,
      title: item.title,
      structure_type: item.structure_type,
      description: item.description,
      exercises_count: item.exercises_count
    };
  });

  let srvRow: any = null;
  let serviceLinkedIds: string[] = [];
  if (serviceId) {
    srvRow = db.prepare(`
      SELECT id, name, default_template_id, linked_template_ids_json
      FROM services WHERE id = ? AND tenant_id = ?
    `).get(serviceId, tenantId) as any;
    if (srvRow?.linked_template_ids_json) {
      try {
        const parsed = JSON.parse(srvRow.linked_template_ids_json);
        if (Array.isArray(parsed)) serviceLinkedIds = parsed.map(x => String(x || '').trim()).filter(Boolean);
      } catch {}
    }
    if (srvRow?.default_template_id && !serviceLinkedIds.includes(srvRow.default_template_id)) {
      serviceLinkedIds = [srvRow.default_template_id, ...serviceLinkedIds];
    }
  }
  const serviceLinkedTemplates = serviceLinkedIds
    .filter(id => tplMap.has(id))
    .map(id => {
      const t = tplMap.get(id)!;
      return {
        id: t.id,
        title: t.title,
        structure_type: t.structure_type,
        description: t.description,
        exercises_count: t.exercises_count,
        is_default: srvRow?.default_template_id === t.id
      };
    });

  let occTemplateId: string | null = null;
  let occSnapshotJson: string | null = null;
  let occExecJson: string | null = null;
  if (realOccId) {
    const occRow = db.prepare(`
      SELECT template_id, template_snapshot_json, execution_state_json
      FROM class_occurrences WHERE id = ? AND tenant_id = ?
    `).get(realOccId, tenantId) as any;
    if (occRow) {
      occTemplateId = occRow.template_id || null;
      occSnapshotJson = occRow.template_snapshot_json || null;
      occExecJson = occRow.execution_state_json || null;
    }
  } else if (singleAptId) {
    const aptRow = db.prepare(`
      SELECT template_id, template_snapshot_json, execution_state_json
      FROM appointments WHERE id = ? AND tenant_id = ?
    `).get(singleAptId, tenantId) as any;
    if (aptRow) {
      occTemplateId = aptRow.template_id || null;
      occSnapshotJson = aptRow.template_snapshot_json || null;
      occExecJson = aptRow.execution_state_json || null;
    }
  }

  let schedDefaultTemplateId: string | null = null;
  if (classScheduleId) {
    const csRow = db.prepare(`SELECT default_template_id FROM class_schedules WHERE id = ? AND tenant_id = ?`).get(classScheduleId, tenantId) as any;
    schedDefaultTemplateId = csRow?.default_template_id || null;
  }

  const resolvedTemplateId =
    occTemplateId ||
    schedDefaultTemplateId ||
    srvRow?.default_template_id ||
    serviceLinkedIds[0] ||
    null;

  let activePlan: any = null;
  let executionState: any = {
    activeDivisionIndex: 0,
    currentExerciseIndex: 0,
    completedExercises: {},
    status: 'idle',
    sessionNotes: ''
  };
  if (occExecJson) {
    try {
      executionState = { ...executionState, ...JSON.parse(occExecJson) };
    } catch {}
  }

  if (occSnapshotJson) {
    try {
      const snap = JSON.parse(occSnapshotJson);
      const enrichedWorkouts = enrichTemplateWorkoutsWithMedia(tenantId, snap.workouts || []);
      activePlan = {
        templateId: snap.id || occTemplateId || resolvedTemplateId,
        templateTitle: snap.title || 'Plano da Aula',
        title: snap.title || 'Plano da Aula',
        structureType: snap.structure_type || 'Aula',
        description: snap.description || null,
        source: 'occurrence_override',
        isCustomOverride: true,
        workouts: enrichedWorkouts,
        executionState,
        canEdit
      };
    } catch {}
  }

  if (!activePlan && resolvedTemplateId && tplMap.has(resolvedTemplateId)) {
    const baseTpl = tplMap.get(resolvedTemplateId)!;
    const enrichedWorkouts = enrichTemplateWorkoutsWithMedia(tenantId, baseTpl.workouts || []);
    activePlan = {
      templateId: baseTpl.id,
      templateTitle: baseTpl.title,
      title: baseTpl.title,
      structureType: baseTpl.structure_type,
      description: baseTpl.description,
      source: occTemplateId ? 'occurrence' : schedDefaultTemplateId ? 'class_schedule' : 'service_default',
      isCustomOverride: Boolean(occTemplateId),
      workouts: enrichedWorkouts,
      executionState,
      canEdit
    };
  }

  return {
    exercisePlan: activePlan,
    defaultTemplateId: srvRow?.default_template_id || null,
    serviceLinkedTemplates,
    availableTemplates,
    canEditExercisePlan: canEdit
  };
}

export class ClassAttendanceController {
  /**
   * Lista aulas / turmas / sessões para controle de frequência
   * GET /v1/classes/occurrences
   */
  static listOccurrences(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Tenant ID required' });
        return;
      }

      const startDate = req.query.startDate ? String(req.query.startDate).slice(0, 10) : '';
      const endDate = req.query.endDate ? String(req.query.endDate).slice(0, 10) : '';
      const serviceId = req.query.serviceId ? String(req.query.serviceId) : '';
      const professionalId = req.query.professionalId ? String(req.query.professionalId) : '';
      const kind = req.query.kind ? String(req.query.kind) : 'all';

      const isProfessionalRole = req.user?.role === 'professional';
      const ownProfIds = isProfessionalRole && req.user?.userId
        ? getOwnProfessionalIds(req.user.userId, tenantId)
        : [];

      if (isProfessionalRole && ownProfIds.length === 0) {
        res.json({ occurrences: [] });
        return;
      }

      const params: any[] = [tenantId];
      let where = `a.tenant_id = ? AND a.status != 'cancelled'`;

      if (startDate && endDate) {
        where += ` AND substr(a.start_time, 1, 10) BETWEEN ? AND ?`;
        params.push(startDate, endDate);
      } else if (startDate) {
        where += ` AND substr(a.start_time, 1, 10) >= ?`;
        params.push(startDate);
      } else if (endDate) {
        where += ` AND substr(a.start_time, 1, 10) <= ?`;
        params.push(endDate);
      }

      if (serviceId) {
        where += ` AND a.service_id = ?`;
        params.push(serviceId);
      }

      if (isProfessionalRole) {
        const placeholders = ownProfIds.map(() => '?').join(', ');
        where += ` AND (
          a.professional_id IN (${placeholders})
          OR EXISTS (
            SELECT 1 FROM session_instructor_participants sip
            WHERE sip.tenant_id = a.tenant_id
              AND sip.professional_id IN (${placeholders})
              AND ((a.occurrence_id IS NOT NULL AND sip.occurrence_id = a.occurrence_id)
                OR (a.occurrence_id IS NULL AND sip.appointment_id = a.id))
          )
        )`;
        params.push(...ownProfIds, ...ownProfIds);
      } else if (professionalId) {
        where += ` AND (
          a.professional_id = ?
          OR EXISTS (
            SELECT 1 FROM session_instructor_participants sip
            WHERE sip.tenant_id = a.tenant_id
              AND sip.professional_id = ?
              AND ((a.occurrence_id IS NOT NULL AND sip.occurrence_id = a.occurrence_id)
                OR (a.occurrence_id IS NULL AND sip.appointment_id = a.id))
          )
        )`;
        params.push(professionalId, professionalId);
      }

      if (kind === 'group') {
        where += ` AND (a.occurrence_id IS NOT NULL OR COALESCE(s.service_kind, a.service_kind) = 'group')`;
      } else if (kind === 'individual') {
        where += ` AND a.occurrence_id IS NULL AND COALESCE(s.service_kind, COALESCE(a.service_kind, 'individual')) = 'individual'`;
      }

      const rows = db.prepare(`
        SELECT
          COALESCE(a.occurrence_id, 'apt:' || a.id) as occurrence_key,
          a.occurrence_id,
          a.series_id,
          CASE WHEN a.occurrence_id IS NOT NULL OR COALESCE(s.service_kind, a.service_kind) = 'group' THEN 'group' ELSE 'individual' END as service_kind,
          COALESCE(co.start_time, a.start_time) as start_time,
          COALESCE(co.end_time, a.end_time) as end_time,
          a.service_id,
          COALESCE(s.name, 'Atendimento') as service_name,
          COALESCE(s.modality_category, s.name) as modality_name,
          a.professional_id,
          COALESCE(p.name, 'Profissional') as professional_name,
          COALESCE(co.room_id, a.room_id) as room_id,
          r.name as room_name,
          COALESCE(co.capacity, CASE WHEN (a.occurrence_id IS NOT NULL OR COALESCE(s.service_kind, a.service_kind) = 'group') THEN COALESCE(s.default_capacity, 1) ELSE 1 END) as capacity,
          COUNT(a.id) as enrolled_count,
          SUM(CASE WHEN COALESCE(a.attendance_status, 'pending') = 'present' THEN 1 ELSE 0 END) as present_count,
          SUM(CASE WHEN COALESCE(a.attendance_status, 'pending') = 'absent' THEN 1 ELSE 0 END) as absent_count,
          SUM(CASE WHEN COALESCE(a.attendance_status, 'pending') = 'pending' THEN 1 ELSE 0 END) as pending_count,
          GROUP_CONCAT(pat.full_name, ', ') as student_names_preview
        FROM appointments a
        JOIN patients pat ON pat.id = a.patient_id
        LEFT JOIN services s ON s.id = a.service_id
        LEFT JOIN professionals p ON p.id = a.professional_id
        LEFT JOIN rooms r ON r.id = COALESCE(a.room_id, NULL)
        LEFT JOIN class_occurrences co ON co.id = a.occurrence_id AND co.tenant_id = a.tenant_id
        WHERE ${where}
        GROUP BY occurrence_key
        ORDER BY start_time DESC
        LIMIT 200
      `).all(...params) as any[];

      const occIds = Array.from(new Set(rows.map(r => r.occurrence_id).filter(Boolean))) as string[];
      const aptIds = Array.from(new Set(rows.filter(r => !r.occurrence_id && typeof r.occurrence_key === 'string' && r.occurrence_key.startsWith('apt:')).map(r => r.occurrence_key.slice(4))));

      const participantsByOcc = new Map<string, any[]>();
      if (occIds.length > 0) {
        const ph = occIds.map(() => '?').join(', ');
        const sipRows = db.prepare(`
          SELECT sip.*, p.name as professional_name
          FROM session_instructor_participants sip
          JOIN professionals p ON p.id = sip.professional_id AND p.tenant_id = sip.tenant_id
          WHERE sip.tenant_id = ? AND sip.occurrence_id IN (${ph})
          ORDER BY CASE WHEN sip.role = 'primary' THEN 0 ELSE 1 END, p.name ASC
        `).all(tenantId, ...occIds) as any[];
        for (const r of sipRows) {
          const list = participantsByOcc.get(r.occurrence_id) || [];
          list.push(r);
          participantsByOcc.set(r.occurrence_id, list);
        }
      }

      const participantsByApt = new Map<string, any[]>();
      if (aptIds.length > 0) {
        const ph = aptIds.map(() => '?').join(', ');
        const sipRows = db.prepare(`
          SELECT sip.*, p.name as professional_name
          FROM session_instructor_participants sip
          JOIN professionals p ON p.id = sip.professional_id AND p.tenant_id = sip.tenant_id
          WHERE sip.tenant_id = ? AND sip.appointment_id IN (${ph}) AND sip.occurrence_id IS NULL
          ORDER BY CASE WHEN sip.role = 'primary' THEN 0 ELSE 1 END, p.name ASC
        `).all(tenantId, ...aptIds) as any[];
        for (const r of sipRows) {
          const list = participantsByApt.get(r.appointment_id) || [];
          list.push(r);
          participantsByApt.set(r.appointment_id, list);
        }
      }

      const enriched = rows.map(r => {
        const aptId = !r.occurrence_id && typeof r.occurrence_key === 'string' && r.occurrence_key.startsWith('apt:')
          ? r.occurrence_key.slice(4)
          : null;
        let participants = r.occurrence_id
          ? (participantsByOcc.get(r.occurrence_id) || [])
          : (aptId ? (participantsByApt.get(aptId) || []) : []);
        if (participants.length === 0 && r.professional_id) {
          participants = [{
            professional_id: r.professional_id,
            professional_name: r.professional_name,
            role: 'primary',
            attendance_status: 'scheduled'
          }];
        }
        return {
          ...r,
          participants
        };
      });

      res.json({ occurrences: enriched });
    } catch (err: any) {
      console.error('[ClassAttendanceController.listOccurrences] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar aulas e ocorrências.' });
    }
  }

  /**
   * Lista alunos inscritos em uma ocorrência (ou sessão individual) com status de presença
   * GET /v1/classes/occurrences/:id/roster
   */
  static getRoster(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const rawId = String(req.params.id || req.params.occurrenceId || '');
      if (!tenantId || !rawId) {
        res.status(400).json({ error: 'Identificação inválida.' });
        return;
      }

      const isVirtualIndividual = rawId.startsWith('apt:');
      const targetId = isVirtualIndividual ? rawId.slice(4) : rawId;

      const isProfessionalRole = req.user?.role === 'professional';
      const ownProfIds = isProfessionalRole && req.user?.userId
        ? getOwnProfessionalIds(req.user.userId, tenantId)
        : [];

      const rows = db.prepare(`
        SELECT
          a.id as appointment_id,
          a.appointment_number,
          a.patient_id,
          pat.full_name as patient_name,
          pat.phone as patient_phone,
          a.professional_id,
          p.name as professional_name,
          a.service_id,
          s.name as service_name,
          a.start_time,
          a.end_time,
          a.status as appointment_status,
          COALESCE(a.attendance_status, 'pending') as attendance_status,
          a.attendance_marked_at,
          a.attendance_notes,
          a.occurrence_id,
          a.series_id,
          a.recurring_plan_id,
          a.package_contract_id,
          a.is_package_covered,
          COALESCE(a.billing_coverage_type, CASE WHEN a.package_contract_id IS NOT NULL THEN 'package' WHEN a.recurring_plan_id IS NOT NULL THEN 'periodic_plan' ELSE 'drop_in' END) as billing_coverage_type,
          rbp.title as recurring_plan_title,
          rbp.billing_frequency as recurring_plan_frequency,
          rbp.status as recurring_plan_status,
          spc.package_name_snapshot as package_name,
          CASE WHEN a.occurrence_id IS NOT NULL OR COALESCE(s.service_kind, a.service_kind) = 'group' THEN 'group' ELSE 'individual' END as service_kind,
          COALESCE(co.capacity, COALESCE(s.default_capacity, 1)) as capacity,
          co.class_schedule_id,
          COALESCE(
            pay.status,
            (SELECT p2.status FROM payments p2 WHERE p2.tenant_id = a.tenant_id AND p2.recurring_plan_id = a.recurring_plan_id AND p2.status != 'cancelled' ORDER BY COALESCE(p2.due_date, p2.created_at) DESC LIMIT 1),
            (SELECT p3.status FROM payments p3 WHERE p3.tenant_id = a.tenant_id AND p3.package_contract_id = a.package_contract_id AND p3.status != 'cancelled' ORDER BY COALESCE(p3.due_date, p3.created_at) DESC LIMIT 1)
          ) as payment_status
        FROM appointments a
        JOIN patients pat ON pat.id = a.patient_id
        LEFT JOIN professionals p ON p.id = a.professional_id
        LEFT JOIN services s ON s.id = a.service_id
        LEFT JOIN class_occurrences co ON co.id = a.occurrence_id AND co.tenant_id = a.tenant_id
        LEFT JOIN recurring_billing_plans rbp ON rbp.id = a.recurring_plan_id AND rbp.tenant_id = a.tenant_id
        LEFT JOIN student_package_contracts spc ON spc.id = a.package_contract_id AND spc.tenant_id = a.tenant_id
        LEFT JOIN payments pay ON pay.appointment_id = a.id AND pay.tenant_id = a.tenant_id
        WHERE a.tenant_id = ?
          AND ${isVirtualIndividual ? 'a.id = ?' : '(a.occurrence_id = ? OR a.id = ?)'}
        ORDER BY pat.full_name ASC
      `).all(...(isVirtualIndividual ? [tenantId, targetId] : [tenantId, targetId, targetId])) as any[];

      if (rows.length === 0) {
        res.status(404).json({ error: 'Aula/ocorrência não encontrada.' });
        return;
      }

      const realOccId = rows[0].occurrence_id || null;
      const singleAptId = realOccId ? null : rows[0].appointment_id;

      if (isProfessionalRole) {
        let hasAccess = rows.some(r => ownProfIds.includes(r.professional_id));
        if (!hasAccess && realOccId) {
          hasAccess = InstructorParticipationService.isProfessionalLinkedToOccurrence(tenantId, ownProfIds, realOccId);
        }
        if (!hasAccess && singleAptId && ownProfIds.length > 0) {
          const ph = ownProfIds.map(() => '?').join(', ');
          const rowPart = db.prepare(`
            SELECT 1 FROM session_instructor_participants
            WHERE tenant_id = ? AND appointment_id = ? AND occurrence_id IS NULL AND professional_id IN (${ph})
            LIMIT 1
          `).get(tenantId, singleAptId, ...ownProfIds);
          hasAccess = Boolean(rowPart);
        }
        if (!hasAccess) {
          res.status(403).json({ error: 'Sem permissão para visualizar lista de chamada de outro profissional.' });
          return;
        }
      }

      let participants = realOccId
        ? InstructorParticipationService.listParticipantsForOccurrence(tenantId, realOccId)
        : InstructorParticipationService.listParticipantsForAppointment(tenantId, singleAptId);

      if (participants.length === 0 && rows[0].professional_id) {
        participants = [{
          id: 'fallback-primary',
          tenant_id: tenantId,
          service_id: rows[0].service_id || null,
          occurrence_id: realOccId,
          appointment_id: singleAptId,
          professional_id: rows[0].professional_id,
          professional_name: rows[0].professional_name || 'Instrutor',
          role: 'primary',
          attendance_status: 'scheduled',
          source: 'fallback',
          updated_by: null,
          updated_at: ''
        }];
        if (rows[0].class_schedule_id) {
          const schedMap = InstructorParticipationService.getScheduleInstructorsMap(tenantId, [rows[0].class_schedule_id]);
          const schedTeam = schedMap.get(rows[0].class_schedule_id) || [];
          for (const member of schedTeam) {
            if (member.professionalId !== rows[0].professional_id) {
              participants.push({
                id: `fallback-${member.professionalId}`,
                tenant_id: tenantId,
                service_id: rows[0].service_id || null,
                occurrence_id: realOccId,
                appointment_id: singleAptId,
                professional_id: member.professionalId,
                professional_name: member.professionalName,
                role: 'co_instructor',
                attendance_status: 'scheduled',
                source: 'class_schedule',
                updated_by: null,
                updated_at: ''
              });
            }
          }
        }
      }

      const canEditPlan = req.user?.role === 'clinic_admin' || req.user?.role === 'professional';
      const planBundle = buildOccurrenceExercisePlanBundle({
        tenantId,
        realOccId,
        singleAptId,
        serviceId: rows[0].service_id || null,
        classScheduleId: rows[0].class_schedule_id || null,
        canEdit: Boolean(canEditPlan)
      });

      res.json({
        occurrenceId: rows[0].occurrence_id || `apt:${rows[0].appointment_id}`,
        serviceId: rows[0].service_id || null,
        serviceName: rows[0].service_name,
        professionalName: rows[0].professional_name,
        startTime: rows[0].start_time,
        endTime: rows[0].end_time,
        serviceKind: rows[0].service_kind,
        capacity: rows[0].capacity,
        participants,
        roster: rows,
        ...planBundle
      });
    } catch (err: any) {
      console.error('[ClassAttendanceController.getRoster] Erro:', err);
      res.status(500).json({ error: 'Erro ao carregar lista de chamada.' });
    }
  }

  /**
   * Consulta o Plano de Exercícios da Aula (template vinculado ao serviço/turma ou customizado para a aula)
   * GET /v1/classes/occurrences/:occurrenceId/exercise-plan
   */
  static getOccurrenceExercisePlan(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const rawId = String(req.params.occurrenceId || req.params.id || '').trim();
      if (!tenantId || !rawId) {
        res.status(400).json({ error: 'Identificação da aula inválida.' });
        return;
      }

      const isVirtualIndividual = rawId.startsWith('apt:');
      const targetId = isVirtualIndividual ? rawId.slice(4) : rawId;

      const aptRow = db.prepare(`
        SELECT a.id as appointment_id, a.service_id, a.professional_id, a.occurrence_id,
               s.name as service_name, co.class_schedule_id
        FROM appointments a
        LEFT JOIN services s ON s.id = a.service_id
        LEFT JOIN class_occurrences co ON co.id = a.occurrence_id AND co.tenant_id = a.tenant_id
        WHERE a.tenant_id = ?
          AND a.status != 'cancelled'
          AND ${isVirtualIndividual ? 'a.id = ?' : '(a.occurrence_id = ? OR a.id = ?)'}
        LIMIT 1
      `).get(...(isVirtualIndividual ? [tenantId, targetId] : [tenantId, targetId, targetId])) as any;

      const occRow = !aptRow && !isVirtualIndividual
        ? db.prepare(`
            SELECT co.id as occurrence_id, co.service_id, co.professional_id, co.class_schedule_id, s.name as service_name
            FROM class_occurrences co
            LEFT JOIN services s ON s.id = co.service_id
            WHERE co.tenant_id = ? AND co.id = ?
          `).get(tenantId, targetId) as any
        : null;

      const ref = aptRow || occRow;
      if (!ref) {
        res.status(404).json({ error: 'Aula/ocorrência não encontrada.' });
        return;
      }

      const realOccId = ref.occurrence_id || null;
      const singleAptId = realOccId ? null : ref.appointment_id;

      let canEdit = req.user?.role === 'clinic_admin';
      if (req.user?.role === 'professional' && req.user?.userId) {
        const ownProfIds = getOwnProfessionalIds(req.user.userId, tenantId);
        let hasAccess = ownProfIds.includes(ref.professional_id);
        if (!hasAccess && realOccId) {
          hasAccess = InstructorParticipationService.isProfessionalLinkedToOccurrence(tenantId, ownProfIds, realOccId);
        }
        if (!hasAccess && singleAptId && ownProfIds.length > 0) {
          const ph = ownProfIds.map(() => '?').join(', ');
          const rowPart = db.prepare(`
            SELECT 1 FROM session_instructor_participants
            WHERE tenant_id = ? AND appointment_id = ? AND occurrence_id IS NULL AND professional_id IN (${ph})
            LIMIT 1
          `).get(tenantId, singleAptId, ...ownProfIds);
          hasAccess = Boolean(rowPart);
        }
        if (!hasAccess && ref.service_id && ownProfIds.length > 0) {
          const ph = ownProfIds.map(() => '?').join(', ');
          const linkedSrv = db.prepare(`
            SELECT 1 FROM professional_services WHERE service_id = ? AND professional_id IN (${ph}) LIMIT 1
          `).get(ref.service_id, ...ownProfIds);
          hasAccess = Boolean(linkedSrv);
        }
        if (!hasAccess) {
          res.status(403).json({ error: 'Sem permissão para visualizar o plano de exercícios de outro instrutor.' });
          return;
        }
        canEdit = true;
      }

      const bundle = buildOccurrenceExercisePlanBundle({
        tenantId,
        realOccId,
        singleAptId,
        serviceId: ref.service_id || null,
        classScheduleId: ref.class_schedule_id || null,
        canEdit
      });

      res.json({
        occurrenceId: realOccId || `apt:${singleAptId}`,
        serviceId: ref.service_id || null,
        serviceName: ref.service_name || 'Aula',
        ...bundle
      });
    } catch (err: any) {
      console.error('[ClassAttendanceController.getOccurrenceExercisePlan] Erro:', err);
      res.status(500).json({ error: 'Erro ao carregar plano de exercícios da aula.' });
    }
  }

  /**
   * Atualiza o Plano de Exercícios da Aula:
   * - Troca template apenas para a aula atual (snapshot isolado sem alterar template da biblioteca)
   * - Permite criar e salvar novo template na biblioteca e associá-lo à aula/serviço
   * - Persiste o estado de execução dos exercícios durante a sessão em andamento
   * PUT /v1/classes/occurrences/:occurrenceId/exercise-plan
   */
  static updateOccurrenceExercisePlan(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const rawId = String(req.params.occurrenceId || '').trim();
      if (!tenantId || !req.user || !rawId) {
        res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
        return;
      }

      const isVirtualIndividual = rawId.startsWith('apt:');
      const targetId = isVirtualIndividual ? rawId.slice(4) : rawId;

      const aptRow = db.prepare(`
        SELECT a.id as appointment_id, a.service_id, a.professional_id, a.occurrence_id, co.class_schedule_id
        FROM appointments a
        LEFT JOIN class_occurrences co ON co.id = a.occurrence_id AND co.tenant_id = a.tenant_id
        WHERE a.tenant_id = ?
          AND a.status != 'cancelled'
          AND ${isVirtualIndividual ? 'a.id = ?' : '(a.occurrence_id = ? OR a.id = ?)'}
        LIMIT 1
      `).get(...(isVirtualIndividual ? [tenantId, targetId] : [tenantId, targetId, targetId])) as any;

      const occRow = !aptRow && !isVirtualIndividual
        ? db.prepare(`
            SELECT id as occurrence_id, service_id, professional_id, class_schedule_id
            FROM class_occurrences WHERE tenant_id = ? AND id = ?
          `).get(tenantId, targetId) as any
        : null;

      const ref = aptRow || occRow;
      if (!ref) {
        res.status(404).json({ error: 'Aula/ocorrência não encontrada.' });
        return;
      }

      const realOccId = ref.occurrence_id || null;
      const singleAptId = realOccId ? null : ref.appointment_id;

      if (req.user.role === 'professional') {
        const ownProfIds = getOwnProfessionalIds(req.user.userId, tenantId);
        let hasAccess = ownProfIds.includes(ref.professional_id);
        if (!hasAccess && realOccId) {
          hasAccess = InstructorParticipationService.isProfessionalLinkedToOccurrence(tenantId, ownProfIds, realOccId);
        }
        if (!hasAccess && singleAptId && ownProfIds.length > 0) {
          const ph = ownProfIds.map(() => '?').join(', ');
          const rowPart = db.prepare(`
            SELECT 1 FROM session_instructor_participants
            WHERE tenant_id = ? AND appointment_id = ? AND occurrence_id IS NULL AND professional_id IN (${ph})
            LIMIT 1
          `).get(tenantId, singleAptId, ...ownProfIds);
          hasAccess = Boolean(rowPart);
        }
        if (!hasAccess) {
          res.status(403).json({ error: 'Sem permissão para alterar o plano de exercícios desta aula.' });
          return;
        }
      } else if (req.user.role !== 'clinic_admin') {
        res.status(403).json({ error: 'Apenas gestores e instrutores da aula podem editar o plano de exercícios.' });
        return;
      }

      const {
        action,
        templateId,
        customSnapshot,
        executionState,
        updateServiceDefault,
        createNewTemplate: rawCreateNewTemplate,
        title: directTitle,
        structure_type: directStructureType,
        description: directDescription,
        workouts: directWorkouts,
        linkToService: directLinkToService
      } = req.body || {};

      const createNewTemplate = rawCreateNewTemplate || (action === 'create_and_apply_template' && directTitle ? {
        title: directTitle,
        structure_type: directStructureType,
        description: directDescription,
        workouts: directWorkouts,
        linkToService: directLinkToService
      } : undefined);

      let resolvedTemplateId: string | null = templateId !== undefined ? (templateId ? String(templateId).trim() : null) : undefined as any;
      let snapshotToSave: string | null | undefined = undefined;
      let createdLibraryTemplateId: string | null = null;

      db.transaction(() => {
        if (createNewTemplate && typeof createNewTemplate === 'object' && createNewTemplate.title) {
          const newTplId = 'ptpl-' + uuidv4().slice(0, 8);
          const workoutsArr = Array.isArray(createNewTemplate.workouts) ? createNewTemplate.workouts : [];
          const workoutsJson = JSON.stringify(workoutsArr);
          db.prepare(`
            INSERT INTO personal_workout_templates (id, tenant_id, professional_id, title, structure_type, description, workouts_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            newTplId,
            tenantId,
            ref.professional_id || null,
            String(createNewTemplate.title).trim(),
            createNewTemplate.structure_type || 'Aula Studio',
            createNewTemplate.description || null,
            workoutsJson
          );
          createdLibraryTemplateId = newTplId;
          resolvedTemplateId = newTplId;
          snapshotToSave = JSON.stringify({
            id: newTplId,
            title: String(createNewTemplate.title).trim(),
            structure_type: createNewTemplate.structure_type || 'Aula Studio',
            description: createNewTemplate.description || null,
            workouts: workoutsArr
          });

          if (createNewTemplate.linkToService !== false && ref.service_id) {
            const srv = db.prepare(`SELECT default_template_id, linked_template_ids_json FROM services WHERE id = ? AND tenant_id = ?`).get(ref.service_id, tenantId) as any;
            if (srv) {
              let linked: string[] = [];
              try {
                if (srv.linked_template_ids_json) linked = JSON.parse(srv.linked_template_ids_json);
              } catch {}
              if (!Array.isArray(linked)) linked = [];
              if (!linked.includes(newTplId)) linked.push(newTplId);
              const nextDef = updateServiceDefault || !srv.default_template_id ? newTplId : srv.default_template_id;
              db.prepare(`
                UPDATE services SET default_template_id = ?, linked_template_ids_json = ?, updated_at = datetime('now')
                WHERE id = ? AND tenant_id = ?
              `).run(nextDef, JSON.stringify(linked), ref.service_id, tenantId);
            }
          }
        } else if (resolvedTemplateId !== undefined) {
          if (resolvedTemplateId === null || resolvedTemplateId === '') {
            resolvedTemplateId = null;
            snapshotToSave = null;
          } else {
            const tpl = db.prepare(`SELECT * FROM personal_workout_templates WHERE id = ? AND tenant_id = ?`).get(resolvedTemplateId, tenantId) as any;
            if (!tpl) {
              throw Object.assign(new Error('Template de exercícios não encontrado neste estabelecimento.'), { status: 404 });
            }
            let parsedWorkouts: any[] = [];
            try {
              parsedWorkouts = JSON.parse(tpl.workouts_json || '[]');
            } catch {}
            // Snapshot isolado na aula atual: trocar ou executar o template na aula NUNCA altera o template original da biblioteca
            snapshotToSave = JSON.stringify({
              id: tpl.id,
              title: tpl.title,
              structure_type: tpl.structure_type || 'ABC',
              description: tpl.description || null,
              workouts: parsedWorkouts
            });

            if (updateServiceDefault && ref.service_id) {
              const srv = db.prepare(`SELECT linked_template_ids_json FROM services WHERE id = ? AND tenant_id = ?`).get(ref.service_id, tenantId) as any;
              let linked: string[] = [];
              try {
                if (srv?.linked_template_ids_json) linked = JSON.parse(srv.linked_template_ids_json);
              } catch {}
              if (!Array.isArray(linked)) linked = [];
              if (!linked.includes(tpl.id)) linked = [tpl.id, ...linked];
              db.prepare(`
                UPDATE services SET default_template_id = ?, linked_template_ids_json = ?, updated_at = datetime('now')
                WHERE id = ? AND tenant_id = ?
              `).run(tpl.id, JSON.stringify(linked), ref.service_id, tenantId);
            }
          }
        } else if (customSnapshot && typeof customSnapshot === 'object') {
          snapshotToSave = JSON.stringify(customSnapshot);
        }

        const execJson = executionState !== undefined ? JSON.stringify(executionState) : undefined;

        if (realOccId) {
          db.prepare(`
            UPDATE class_occurrences
            SET template_id = CASE WHEN ? = 1 THEN ? ELSE template_id END,
                template_snapshot_json = CASE WHEN ? = 1 THEN ? ELSE template_snapshot_json END,
                execution_state_json = CASE WHEN ? = 1 THEN ? ELSE execution_state_json END,
                updated_at = datetime('now')
            WHERE id = ? AND tenant_id = ?
          `).run(
            resolvedTemplateId !== undefined ? 1 : 0,
            resolvedTemplateId ?? null,
            snapshotToSave !== undefined ? 1 : 0,
            snapshotToSave ?? null,
            execJson !== undefined ? 1 : 0,
            execJson ?? null,
            realOccId,
            tenantId
          );
        } else if (singleAptId) {
          db.prepare(`
            UPDATE appointments
            SET template_id = CASE WHEN ? = 1 THEN ? ELSE template_id END,
                template_snapshot_json = CASE WHEN ? = 1 THEN ? ELSE template_snapshot_json END,
                execution_state_json = CASE WHEN ? = 1 THEN ? ELSE execution_state_json END,
                updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
          `).run(
            resolvedTemplateId !== undefined ? 1 : 0,
            resolvedTemplateId ?? null,
            snapshotToSave !== undefined ? 1 : 0,
            snapshotToSave ?? null,
            execJson !== undefined ? 1 : 0,
            execJson ?? null,
            singleAptId,
            tenantId
          );
        }
      })();

      const bundle = buildOccurrenceExercisePlanBundle({
        tenantId,
        realOccId,
        singleAptId,
        serviceId: ref.service_id || null,
        classScheduleId: ref.class_schedule_id || null,
        canEdit: true
      });

      res.json({
        success: true,
        occurrenceId: realOccId || `apt:${singleAptId}`,
        createdLibraryTemplateId,
        ...bundle,
        message: createdLibraryTemplateId
          ? 'Novo template salvo na biblioteca e aplicado à aula!'
          : 'Plano de exercícios da aula atualizado!'
      });
    } catch (err: any) {
      console.error('[ClassAttendanceController.updateOccurrenceExercisePlan] Erro:', err);
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao atualizar plano de exercícios da aula.' });
    }
  }

  /**
   * Marca presença / falta / cancelamento na lista de chamada (separado do agendamento e dos treinos)
   * PUT /v1/classes/occurrences/:occurrenceId/attendance/:appointmentId
   */
  static markAttendance(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const occurrenceId = String(req.params.occurrenceId || '');
      const appointmentId = String(req.params.appointmentId || '');
      const { attendanceStatus, notes } = req.body || {};

      if (!tenantId) {
        res.status(401).json({ error: 'Tenant ID required' });
        return;
      }

      if (!VALID_ATTENDANCE_STATUSES.includes(attendanceStatus as AttendanceStatus)) {
        res.status(400).json({ error: 'Status de presença inválido. Use: pending, present, absent ou cancelled.' });
        return;
      }

      const appt = db.prepare(`
        SELECT id, tenant_id, professional_id, occurrence_id, status, attendance_status
        FROM appointments
        WHERE id = ? AND tenant_id = ?
      `).get(appointmentId, tenantId) as any;

      if (!appt) {
        res.status(404).json({ error: 'Inscrição/agendamento não encontrado neste estabelecimento.' });
        return;
      }

      // Garante coerência se um occurrenceId específico foi informado
      if (occurrenceId && !occurrenceId.startsWith('apt:') && occurrenceId !== 'individual') {
        if (appt.occurrence_id && appt.occurrence_id !== occurrenceId) {
          res.status(400).json({ error: 'Este aluno não pertence à ocorrência informada.' });
          return;
        }
      }

      if (req.user?.role === 'professional') {
        const ownProfIds = getOwnProfessionalIds(req.user.userId, tenantId);
        let hasAccess = ownProfIds.includes(appt.professional_id);
        if (!hasAccess && appt.occurrence_id) {
          hasAccess = InstructorParticipationService.isProfessionalLinkedToOccurrence(tenantId, ownProfIds, appt.occurrence_id);
        }
        if (!hasAccess && !appt.occurrence_id && ownProfIds.length > 0) {
          const ph = ownProfIds.map(() => '?').join(', ');
          const rowPart = db.prepare(`
            SELECT 1 FROM session_instructor_participants
            WHERE tenant_id = ? AND appointment_id = ? AND occurrence_id IS NULL AND professional_id IN (${ph})
            LIMIT 1
          `).get(tenantId, appt.id, ...ownProfIds);
          hasAccess = Boolean(rowPart);
        }
        if (!hasAccess) {
          res.status(403).json({ error: 'Você só pode registrar presença nas suas próprias aulas.' });
          return;
        }
      }

      const userId = req.user?.userId || 'system';
      db.transaction(() => {
        db.prepare(`
          UPDATE appointments
          SET attendance_status = ?,
              attendance_marked_at = CASE WHEN ? = 'pending' THEN NULL ELSE datetime('now') END,
              attendance_marked_by = CASE WHEN ? = 'pending' THEN NULL ELSE ? END,
              attendance_notes = CASE WHEN ? IS NOT NULL THEN ? ELSE attendance_notes END,
              updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(
          attendanceStatus,
          attendanceStatus,
          attendanceStatus,
          userId,
          notes !== undefined ? 1 : null,
          typeof notes === 'string' ? notes.trim() || null : null,
          appointmentId,
          tenantId
        );

        PackageService.handleAttendanceChangeTx({
          tenantId,
          appointmentId,
          attendanceStatus,
          createdBy: userId
        });
      })();

      logAudit(req, 'MARK_CLASS_ATTENDANCE', 'appointments', appointmentId, {
        occurrenceId: appt.occurrence_id || occurrenceId,
        from: appt.attendance_status || 'pending',
        to: attendanceStatus,
        notes: typeof notes === 'string' ? notes.trim() : null
      });

      res.json({
        appointmentId,
        occurrenceId: appt.occurrence_id || occurrenceId,
        attendanceStatus,
        message: 'Frequência atualizada com sucesso.'
      });
    } catch (err: any) {
      console.error('[ClassAttendanceController.markAttendance] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar frequência do aluno.' });
    }
  }

  /**
   * Relatórios completos de frequência e ocupação para ZemdaPersonal ("Frequência & Relatórios")
   * GET /v1/personal/attendance-reports
   */
  static getAttendanceReports(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Tenant ID required' });
        return;
      }

      const now = new Date();
      const defaultEnd = now.toISOString().slice(0, 10);
      const startObj = new Date(now.getTime() - 29 * 86400000);
      const defaultStart = startObj.toISOString().slice(0, 10);

      const startDate = req.query.startDate ? String(req.query.startDate).slice(0, 10) : defaultStart;
      const endDate = req.query.endDate ? String(req.query.endDate).slice(0, 10) : defaultEnd;
      const serviceId = req.query.serviceId ? String(req.query.serviceId) : '';
      const professionalId = req.query.professionalId ? String(req.query.professionalId) : '';

      const isProfessionalRole = req.user?.role === 'professional';
      const ownProfIds = isProfessionalRole && req.user?.userId
        ? getOwnProfessionalIds(req.user.userId, tenantId)
        : [];

      if (isProfessionalRole && ownProfIds.length === 0) {
        res.json({
          period: { startDate, endDate },
          kpis: {
            totalAppointments: 0,
            presentCount: 0,
            absentCount: 0,
            cancelledCount: 0,
            pendingCount: 0,
            attendanceRate: 0,
            occupancyRate: 0
          },
          studentRanking: [],
          topModalities: [],
          byStudent: [],
          byInstructor: [],
          classOccupancy: [],
          peakTimes: [],
          lowAttendanceAlerts: []
        });
        return;
      }

      const params: any[] = [tenantId, startDate, endDate];
      let filterSql = `a.tenant_id = ? AND substr(a.start_time, 1, 10) BETWEEN ? AND ?`;

      if (serviceId) {
        filterSql += ` AND a.service_id = ?`;
        params.push(serviceId);
      }

      if (isProfessionalRole) {
        const ph = ownProfIds.map(() => '?').join(', ');
        filterSql += ` AND a.professional_id IN (${ph})`;
        params.push(...ownProfIds);
      } else if (professionalId) {
        filterSql += ` AND a.professional_id = ?`;
        params.push(professionalId);
      }

      // 1. KPIs gerais
      const kpiRow = db.prepare(`
        SELECT
          COUNT(*) as total_appointments,
          SUM(CASE WHEN COALESCE(a.attendance_status, 'pending') = 'present' AND a.status != 'cancelled' THEN 1 ELSE 0 END) as present_count,
          SUM(CASE WHEN (COALESCE(a.attendance_status, 'pending') = 'absent' OR a.status = 'no_show') AND a.status != 'cancelled' THEN 1 ELSE 0 END) as absent_count,
          SUM(CASE WHEN a.status = 'cancelled' OR COALESCE(a.attendance_status, 'pending') = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
          SUM(CASE WHEN COALESCE(a.attendance_status, 'pending') = 'pending' AND a.status NOT IN ('cancelled', 'no_show') THEN 1 ELSE 0 END) as pending_count
        FROM appointments a
        WHERE ${filterSql}
      `).get(...params) as any;

      const presentCount = Number(kpiRow?.present_count || 0);
      const absentCount = Number(kpiRow?.absent_count || 0);
      const cancelledCount = Number(kpiRow?.cancelled_count || 0);
      const pendingCount = Number(kpiRow?.pending_count || 0);
      const totalAppointments = Number(kpiRow?.total_appointments || 0);
      const evaluatedCount = presentCount + absentCount;
      const attendanceRate = evaluatedCount > 0 ? Math.round((presentCount / evaluatedCount) * 1000) / 10 : 0;

      // 2. Frequência por aluno + ranking de assiduidade + vínculo de contratação/plano
      const byStudent = db.prepare(`
        SELECT
          a.patient_id,
          pat.full_name as student_name,
          pat.phone as student_phone,
          COUNT(*) as total_scheduled,
          SUM(CASE WHEN COALESCE(a.attendance_status, 'pending') = 'present' AND a.status != 'cancelled' THEN 1 ELSE 0 END) as present_count,
          SUM(CASE WHEN (COALESCE(a.attendance_status, 'pending') = 'absent' OR a.status = 'no_show') AND a.status != 'cancelled' THEN 1 ELSE 0 END) as absent_count,
          SUM(CASE WHEN a.status = 'cancelled' OR COALESCE(a.attendance_status, 'pending') = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
          SUM(CASE WHEN COALESCE(a.attendance_status, 'pending') = 'pending' AND a.status NOT IN ('cancelled', 'no_show') THEN 1 ELSE 0 END) as pending_count,
          MAX(CASE WHEN COALESCE(a.attendance_status, 'pending') = 'present' THEN a.start_time ELSE NULL END) as last_present_at,
          (SELECT rbp.title FROM recurring_billing_plans rbp WHERE rbp.tenant_id = a.tenant_id AND rbp.patient_id = a.patient_id AND rbp.status = 'active' ORDER BY rbp.created_at DESC LIMIT 1) as active_plan_title,
          (SELECT rbp.billing_frequency FROM recurring_billing_plans rbp WHERE rbp.tenant_id = a.tenant_id AND rbp.patient_id = a.patient_id AND rbp.status = 'active' ORDER BY rbp.created_at DESC LIMIT 1) as active_plan_frequency,
          (SELECT spc.package_name_snapshot FROM student_package_contracts spc WHERE spc.tenant_id = a.tenant_id AND spc.student_id = a.patient_id AND spc.contract_status = 'active' ORDER BY spc.created_at DESC LIMIT 1) as active_package_name
        FROM appointments a
        JOIN patients pat ON pat.id = a.patient_id
        WHERE ${filterSql}
        GROUP BY a.patient_id, pat.full_name, pat.phone
        ORDER BY present_count DESC, absent_count ASC, pat.full_name ASC
      `).all(...params).map((r: any) => {
        const evalTotal = Number(r.present_count) + Number(r.absent_count);
        const rate = evalTotal > 0 ? Math.round((Number(r.present_count) / evalTotal) * 1000) / 10 : 0;
        const contractSummary = r.active_plan_title
          ? `${r.active_plan_title} (${r.active_plan_frequency || 'mensal'})`
          : r.active_package_name
            ? `Pacote: ${r.active_package_name}`
            : 'Avulso';
        return {
          ...r,
          attendance_rate: rate,
          contract_summary: contractSummary
        };
      });

      const studentRanking = [...byStudent]
        .filter((s: any) => (Number(s.present_count) + Number(s.absent_count)) > 0)
        .sort((a: any, b: any) => {
          if (b.present_count !== a.present_count) return b.present_count - a.present_count;
          return b.attendance_rate - a.attendance_rate;
        })
        .slice(0, 20);

      // 3. Alunos com menor frequência / excesso de faltas
      const lowAttendanceAlerts = byStudent
        .filter((s: any) => Number(s.absent_count) >= 1 && (Number(s.attendance_rate) < 70 || Number(s.absent_count) >= 2))
        .sort((a: any, b: any) => {
          if (b.absent_count !== a.absent_count) return b.absent_count - a.absent_count;
          return a.attendance_rate - b.attendance_rate;
        })
        .slice(0, 20);

      // 4. Modalidades / serviços mais frequentados
      const topModalities = db.prepare(`
        SELECT
          a.service_id,
          COALESCE(s.name, 'Atendimento') as service_name,
          COALESCE(NULLIF(TRIM(s.modality_category), ''), COALESCE(s.name, 'Geral')) as modality_name,
          COALESCE(s.service_kind, 'individual') as service_kind,
          COUNT(*) as total_scheduled,
          SUM(CASE WHEN COALESCE(a.attendance_status, 'pending') = 'present' AND a.status != 'cancelled' THEN 1 ELSE 0 END) as present_count,
          SUM(CASE WHEN (COALESCE(a.attendance_status, 'pending') = 'absent' OR a.status = 'no_show') AND a.status != 'cancelled' THEN 1 ELSE 0 END) as absent_count
        FROM appointments a
        LEFT JOIN services s ON s.id = a.service_id
        WHERE ${filterSql}
        GROUP BY a.service_id, s.name, s.modality_category, s.service_kind
        ORDER BY present_count DESC, total_scheduled DESC
      `).all(...params);

      // 5. Frequência por instrutor / profissional (incluindo coinstrutores participantes)
      const byInstructorMap = new Map<string, {
        professional_id: string;
        professional_name: string;
        classesSet: Set<string>;
        enrollments_count: number;
        present_count: number;
        absent_count: number;
      }>();

      const instApptRows = db.prepare(`
        SELECT
          a.id as appointment_id,
          COALESCE(a.occurrence_id, a.id) as occ_key,
          a.occurrence_id,
          a.professional_id,
          COALESCE(p.name, 'Profissional') as professional_name,
          a.status,
          COALESCE(a.attendance_status, 'pending') as attendance_status
        FROM appointments a
        LEFT JOIN professionals p ON p.id = a.professional_id
        WHERE ${filterSql}
      `).all(...params) as any[];

      const instOccIds = Array.from(new Set(instApptRows.map(r => r.occurrence_id).filter(Boolean))) as string[];
      const coInstByOcc = new Map<string, Array<{ professional_id: string; professional_name: string }>>();
      if (instOccIds.length > 0) {
        const ph = instOccIds.map(() => '?').join(', ');
        const sipRows = db.prepare(`
          SELECT sip.occurrence_id, sip.professional_id, p.name as professional_name, sip.attendance_status
          FROM session_instructor_participants sip
          JOIN professionals p ON p.id = sip.professional_id AND p.tenant_id = sip.tenant_id
          WHERE sip.tenant_id = ? AND sip.occurrence_id IN (${ph}) AND COALESCE(sip.attendance_status, 'scheduled') != 'absent'
        `).all(tenantId, ...instOccIds) as any[];
        for (const sr of sipRows) {
          const list = coInstByOcc.get(sr.occurrence_id) || [];
          if (!list.some(x => x.professional_id === sr.professional_id)) {
            list.push({ professional_id: sr.professional_id, professional_name: sr.professional_name || 'Instrutor' });
          }
          coInstByOcc.set(sr.occurrence_id, list);
        }
      }

      for (const ar of instApptRows) {
        const involved: Array<{ professional_id: string; professional_name: string }> = [];
        if (ar.occurrence_id && coInstByOcc.has(ar.occurrence_id)) {
          involved.push(...coInstByOcc.get(ar.occurrence_id)!);
        }
        if (ar.professional_id && !involved.some(x => x.professional_id === ar.professional_id)) {
          involved.push({ professional_id: ar.professional_id, professional_name: ar.professional_name });
        }
        for (const inst of involved) {
          let entry = byInstructorMap.get(inst.professional_id);
          if (!entry) {
            entry = {
              professional_id: inst.professional_id,
              professional_name: inst.professional_name,
              classesSet: new Set<string>(),
              enrollments_count: 0,
              present_count: 0,
              absent_count: 0
            };
            byInstructorMap.set(inst.professional_id, entry);
          }
          entry.classesSet.add(String(ar.occ_key));
          entry.enrollments_count += 1;
          if (ar.status !== 'cancelled' && ar.attendance_status === 'present') entry.present_count += 1;
          if (ar.status !== 'cancelled' && (ar.attendance_status === 'absent' || ar.status === 'no_show')) entry.absent_count += 1;
        }
      }

      const byInstructor = Array.from(byInstructorMap.values())
        .map(r => {
          const evalTotal = Number(r.present_count) + Number(r.absent_count);
          const rate = evalTotal > 0 ? Math.round((Number(r.present_count) / evalTotal) * 1000) / 10 : 0;
          return {
            professional_id: r.professional_id,
            professional_name: r.professional_name,
            classes_count: r.classesSet.size,
            enrollments_count: r.enrollments_count,
            present_count: r.present_count,
            absent_count: r.absent_count,
            attendance_rate: rate
          };
        })
        .sort((a, b) => b.present_count - a.present_count || b.enrollments_count - a.enrollments_count);

      // 6. Taxa de ocupação das turmas / aulas coletivas
      const classOccupancy = db.prepare(`
        SELECT
          co.id as occurrence_id,
          co.start_time,
          co.end_time,
          COALESCE(s.name, 'Turma') as service_name,
          COALESCE(p.name, 'Instrutor') as professional_name,
          co.capacity,
          COUNT(CASE WHEN a.status != 'cancelled' THEN 1 END) as enrolled_count,
          SUM(CASE WHEN COALESCE(a.attendance_status, 'pending') = 'present' AND a.status != 'cancelled' THEN 1 ELSE 0 END) as present_count
        FROM class_occurrences co
        JOIN appointments a ON a.occurrence_id = co.id AND a.tenant_id = co.tenant_id
        LEFT JOIN services s ON s.id = co.service_id
        LEFT JOIN professionals p ON p.id = co.professional_id
        WHERE ${filterSql}
          AND co.status != 'cancelled'
        GROUP BY co.id, co.start_time, co.end_time, s.name, p.name, co.capacity
        ORDER BY co.start_time DESC
        LIMIT 100
      `).all(...params).map((r: any) => {
        const cap = Math.max(1, Number(r.capacity || 1));
        const occRate = Math.min(100, Math.round((Number(r.enrolled_count || 0) / cap) * 1000) / 10);
        return { ...r, occupancy_rate: occRate };
      });

      const totalCapSum = classOccupancy.reduce((acc: number, c: any) => acc + Math.max(1, Number(c.capacity || 1)), 0);
      const totalEnrolledSum = classOccupancy.reduce((acc: number, c: any) => acc + Number(c.enrolled_count || 0), 0);
      const occupancyRate = totalCapSum > 0 ? Math.round((totalEnrolledSum / totalCapSum) * 1000) / 10 : 0;

      // 7. Horários e dias com maior frequência/movimento
      const peakTimesRaw = db.prepare(`
        SELECT
          CAST(strftime('%w', substr(a.start_time, 1, 10)) AS INTEGER) as weekday_index,
          substr(REPLACE(a.start_time, ' ', 'T'), 12, 2) || ':00' as hour_bucket,
          COUNT(*) as scheduled_count,
          SUM(CASE WHEN COALESCE(a.attendance_status, 'pending') = 'present' AND a.status != 'cancelled' THEN 1 ELSE 0 END) as present_count
        FROM appointments a
        WHERE ${filterSql}
          AND a.status != 'cancelled'
        GROUP BY weekday_index, hour_bucket
        ORDER BY present_count DESC, scheduled_count DESC
        LIMIT 24
      `).all(...params) as any[];

      const WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
      const peakTimes = peakTimesRaw.map(r => ({
        ...r,
        weekday_label: WEEKDAY_NAMES[Number(r.weekday_index)] || `Dia ${r.weekday_index}`
      }));

      // 8. Métricas de Matrículas & Contratos (Academia & Studio)
      const todayYmd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
      const in7DaysYmd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

      const rbpStats = db.prepare(`
        SELECT
          SUM(CASE WHEN status = 'active' AND (end_date IS NULL OR end_date = '' OR end_date >= ?) THEN 1 ELSE 0 END) as active_count,
          SUM(CASE WHEN substr(start_date, 1, 10) BETWEEN ? AND ? THEN 1 ELSE 0 END) as new_in_period,
          SUM(CASE WHEN status = 'active' AND end_date IS NOT NULL AND end_date != '' AND end_date < ? THEN 1 ELSE 0 END) as expired_count,
          SUM(CASE WHEN status = 'active' AND end_date BETWEEN ? AND ? THEN 1 ELSE 0 END) as expiring_soon_count,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
          SUM(CASE WHEN status = 'paused' OR contract_status IN ('frozen', 'suspended') THEN 1 ELSE 0 END) as suspended_or_frozen_count
        FROM recurring_billing_plans
        WHERE tenant_id = ?
      `).get(todayYmd, startDate, endDate, todayYmd, todayYmd, in7DaysYmd, tenantId) as any;

      const spcStats = db.prepare(`
        SELECT
          SUM(CASE WHEN contract_status = 'active' AND (end_date IS NULL OR end_date = '' OR end_date >= ?) THEN 1 ELSE 0 END) as active_count,
          SUM(CASE WHEN substr(start_date, 1, 10) BETWEEN ? AND ? THEN 1 ELSE 0 END) as new_in_period,
          SUM(CASE WHEN contract_status = 'expired' OR (contract_status = 'active' AND end_date IS NOT NULL AND end_date != '' AND end_date < ?) THEN 1 ELSE 0 END) as expired_count,
          SUM(CASE WHEN contract_status = 'active' AND end_date BETWEEN ? AND ? THEN 1 ELSE 0 END) as expiring_soon_count,
          SUM(CASE WHEN contract_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
          SUM(CASE WHEN contract_status = 'suspended' THEN 1 ELSE 0 END) as suspended_or_frozen_count
        FROM student_package_contracts
        WHERE tenant_id = ?
      `).get(todayYmd, startDate, endDate, todayYmd, todayYmd, in7DaysYmd, tenantId) as any;

      const topPlansRows = db.prepare(`
        SELECT title as plan_name, COALESCE(contract_kind, 'periodic_plan') as plan_kind, COUNT(*) as contracts_count
        FROM recurring_billing_plans
        WHERE tenant_id = ? AND status != 'cancelled'
        GROUP BY title, contract_kind
        UNION ALL
        SELECT package_name_snapshot as plan_name, 'package' as plan_kind, COUNT(*) as contracts_count
        FROM student_package_contracts
        WHERE tenant_id = ? AND contract_status != 'cancelled'
        GROUP BY package_name_snapshot
        ORDER BY contracts_count DESC
        LIMIT 10
      `).all(tenantId, tenantId);

      const enrollmentMetrics = {
        activeEnrollments: Number(rbpStats?.active_count || 0) + Number(spcStats?.active_count || 0),
        newEnrollmentsInPeriod: Number(rbpStats?.new_in_period || 0) + Number(spcStats?.new_in_period || 0),
        expiredEnrollments: Number(rbpStats?.expired_count || 0) + Number(spcStats?.expired_count || 0),
        expiringSoonEnrollments: Number(rbpStats?.expiring_soon_count || 0) + Number(spcStats?.expiring_soon_count || 0),
        cancelledEnrollments: Number(rbpStats?.cancelled_count || 0) + Number(spcStats?.cancelled_count || 0),
        frozenOrSuspendedEnrollments: Number(rbpStats?.suspended_or_frozen_count || 0) + Number(spcStats?.suspended_or_frozen_count || 0),
        topPlans: topPlansRows
      };

      // 9. Métricas de Controle de Acesso (Academia Livre & Limitada)
      const accessStats = db.prepare(`
        SELECT
          SUM(CASE WHEN substr(REPLACE(check_in_at, ' ', 'T'), 1, 10) = ? AND access_status = 'allowed' THEN 1 ELSE 0 END) as today_access_count,
          SUM(CASE WHEN substr(REPLACE(check_in_at, ' ', 'T'), 1, 10) BETWEEN ? AND ? AND access_status = 'allowed' AND COALESCE(is_exception, 0) = 0 THEN 1 ELSE 0 END) as period_allowed_count,
          SUM(CASE WHEN substr(REPLACE(check_in_at, ' ', 'T'), 1, 10) BETWEEN ? AND ? AND access_status = 'denied' THEN 1 ELSE 0 END) as period_denied_count,
          SUM(CASE WHEN substr(REPLACE(check_in_at, ' ', 'T'), 1, 10) BETWEEN ? AND ? AND COALESCE(is_exception, 0) = 1 THEN 1 ELSE 0 END) as period_exception_count
        FROM studio_access_logs
        WHERE tenant_id = ?
      `).get(todayYmd, startDate, endDate, startDate, endDate, startDate, endDate, tenantId) as any;

      const threeHoursAgoIso = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 19);
      const currentOccupancyRow = db.prepare(`
        SELECT COUNT(DISTINCT student_id) as c
        FROM studio_access_logs
        WHERE tenant_id = ?
          AND substr(REPLACE(check_in_at, ' ', 'T'), 1, 10) = ?
          AND access_status = 'allowed'
          AND check_out_at IS NULL
          AND REPLACE(check_in_at, ' ', 'T') >= ?
      `).get(tenantId, todayYmd, threeHoursAgoIso) as { c: number } | undefined;

      const accessPeakHours = db.prepare(`
        SELECT substr(REPLACE(check_in_at, ' ', 'T'), 12, 2) || ':00' as hour_bucket, COUNT(*) as count
        FROM studio_access_logs
        WHERE tenant_id = ? AND substr(REPLACE(check_in_at, ' ', 'T'), 1, 10) BETWEEN ? AND ? AND access_status = 'allowed'
        GROUP BY hour_bucket
        ORDER BY count DESC
        LIMIT 12
      `).all(tenantId, startDate, endDate);

      const accessMetrics = {
        todayAccessCount: Number(accessStats?.today_access_count || 0),
        periodAllowedAccesses: Number(accessStats?.period_allowed_count || 0),
        periodDeniedAccesses: Number(accessStats?.period_denied_count || 0),
        periodExceptionAccesses: Number(accessStats?.period_exception_count || 0),
        currentOccupancy: Number(currentOccupancyRow?.c || 0),
        accessPeakHours
      };

      // 10. Métricas Financeiras do Studio / Academia no período
      const finRow = db.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN status = 'paid' AND substr(COALESCE(payment_date, due_date, created_at), 1, 10) BETWEEN ? AND ? THEN amount ELSE 0 END), 0) as received_in_period,
          COALESCE(SUM(CASE WHEN status = 'pending' AND substr(COALESCE(due_date, created_at), 1, 10) BETWEEN ? AND ? THEN amount ELSE 0 END), 0) as pending_in_period,
          COALESCE(SUM(CASE WHEN status = 'pending' AND due_date IS NOT NULL AND due_date != '' AND substr(due_date, 1, 10) < ? THEN amount ELSE 0 END), 0) as overdue_amount
        FROM payments
        WHERE tenant_id = ? AND status != 'cancelled'
      `).get(startDate, endDate, startDate, endDate, todayYmd, tenantId) as any;

      const revenueByModality = db.prepare(`
        SELECT
          COALESCE(NULLIF(TRIM(s.modality_category), ''), COALESCE(s.name, 'Planos e Pacotes')) as modality_name,
          COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) as received_amount,
          COALESCE(SUM(CASE WHEN p.status = 'pending' THEN p.amount ELSE 0 END), 0) as pending_amount
        FROM payments p
        LEFT JOIN services s ON s.id = p.service_id AND s.tenant_id = p.tenant_id
        WHERE p.tenant_id = ?
          AND p.status != 'cancelled'
          AND substr(COALESCE(p.payment_date, p.due_date, p.created_at), 1, 10) BETWEEN ? AND ?
        GROUP BY modality_name
        ORDER BY received_amount DESC, pending_amount DESC
      `).all(tenantId, startDate, endDate);

      const studioFinancialMetrics = {
        receivedInPeriod: Math.round(Number(finRow?.received_in_period || 0) * 100) / 100,
        pendingInPeriod: Math.round(Number(finRow?.pending_in_period || 0) * 100) / 100,
        overdueAmount: Math.round(Number(finRow?.overdue_amount || 0) * 100) / 100,
        revenueByModality
      };

      res.json({
        period: { startDate, endDate },
        kpis: {
          totalAppointments,
          presentCount,
          absentCount,
          cancelledCount,
          pendingCount,
          attendanceRate,
          occupancyRate
        },
        enrollmentMetrics,
        accessMetrics,
        studioFinancialMetrics,
        studentRanking,
        topModalities,
        byStudent,
        byInstructor,
        classOccupancy,
        peakTimes,
        lowAttendanceAlerts
      });
    } catch (err: any) {
      console.error('[ClassAttendanceController.getAttendanceReports] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar relatórios de frequência.' });
    }
  }

  /**
   * Lista a equipe de instrutores (titular + coinstrutores) de uma ocorrência/sessão de Studio
   * GET /v1/classes/occurrences/:occurrenceId/participants
   */
  static getOccurrenceParticipants(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const rawId = String(req.params.occurrenceId || req.params.id || '').trim();
      if (!tenantId || !rawId) {
        res.status(400).json({ error: 'Identificação inválida.' });
        return;
      }

      const isVirtualIndividual = rawId.startsWith('apt:');
      const targetId = isVirtualIndividual ? rawId.slice(4) : rawId;

      const aptRow = db.prepare(`
        SELECT
          a.id as appointment_id, a.service_id, a.professional_id, a.occurrence_id,
          p.name as professional_name, co.class_schedule_id
        FROM appointments a
        LEFT JOIN professionals p ON p.id = a.professional_id
        LEFT JOIN class_occurrences co ON co.id = a.occurrence_id AND co.tenant_id = a.tenant_id
        WHERE a.tenant_id = ?
          AND a.status != 'cancelled'
          AND ${isVirtualIndividual ? 'a.id = ?' : '(a.occurrence_id = ? OR a.id = ?)'}
        LIMIT 1
      `).get(...(isVirtualIndividual ? [tenantId, targetId] : [tenantId, targetId, targetId])) as any;

      const occRow = !aptRow && !isVirtualIndividual
        ? db.prepare(`
            SELECT co.id as occurrence_id, co.service_id, co.professional_id, co.class_schedule_id, p.name as professional_name
            FROM class_occurrences co
            LEFT JOIN professionals p ON p.id = co.professional_id
            WHERE co.tenant_id = ? AND co.id = ?
          `).get(tenantId, targetId) as any
        : null;

      const ref = aptRow || occRow;
      if (!ref) {
        res.status(404).json({ error: 'Aula/ocorrência não encontrada.' });
        return;
      }

      const realOccId = ref.occurrence_id || null;
      const singleAptId = realOccId ? null : ref.appointment_id;

      if (req.user?.role === 'professional') {
        const ownProfIds = getOwnProfessionalIds(req.user.userId, tenantId);
        let hasAccess = ownProfIds.includes(ref.professional_id);
        if (!hasAccess && realOccId) {
          hasAccess = InstructorParticipationService.isProfessionalLinkedToOccurrence(tenantId, ownProfIds, realOccId);
        }
        if (!hasAccess && singleAptId && ownProfIds.length > 0) {
          const ph = ownProfIds.map(() => '?').join(', ');
          const rowPart = db.prepare(`
            SELECT 1 FROM session_instructor_participants
            WHERE tenant_id = ? AND appointment_id = ? AND occurrence_id IS NULL AND professional_id IN (${ph})
            LIMIT 1
          `).get(tenantId, singleAptId, ...ownProfIds);
          hasAccess = Boolean(rowPart);
        }
        if (!hasAccess) {
          res.status(403).json({ error: 'Sem permissão para visualizar instrutores desta aula.' });
          return;
        }
      }

      let participants = realOccId
        ? InstructorParticipationService.listParticipantsForOccurrence(tenantId, realOccId)
        : InstructorParticipationService.listParticipantsForAppointment(tenantId, singleAptId);

      if (participants.length === 0 && ref.professional_id) {
        participants = [{
          id: 'fallback-primary',
          tenant_id: tenantId,
          service_id: ref.service_id || null,
          occurrence_id: realOccId,
          appointment_id: singleAptId,
          professional_id: ref.professional_id,
          professional_name: ref.professional_name || 'Instrutor',
          role: 'primary',
          attendance_status: 'scheduled',
          source: 'fallback',
          updated_by: null,
          updated_at: ''
        }];
        if (ref.class_schedule_id) {
          const schedMap = InstructorParticipationService.getScheduleInstructorsMap(tenantId, [ref.class_schedule_id]);
          const schedTeam = schedMap.get(ref.class_schedule_id) || [];
          for (const member of schedTeam) {
            if (member.professionalId !== ref.professional_id) {
              participants.push({
                id: `fallback-${member.professionalId}`,
                tenant_id: tenantId,
                service_id: ref.service_id || null,
                occurrence_id: realOccId,
                appointment_id: singleAptId,
                professional_id: member.professionalId,
                professional_name: member.professionalName,
                role: 'co_instructor',
                attendance_status: 'scheduled',
                source: 'class_schedule',
                updated_by: null,
                updated_at: ''
              });
            }
          }
        }
      }

      res.json({
        occurrenceId: realOccId || `apt:${singleAptId}`,
        serviceId: ref.service_id || null,
        primaryProfessionalId: ref.professional_id || null,
        participants
      });
    } catch (err: any) {
      console.error('[ClassAttendanceController.getOccurrenceParticipants] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar instrutores participantes da aula.' });
    }
  }

  /**
   * Atualiza equipe/presença dos instrutores participantes de uma ocorrência/sessão de Studio
   * PUT /v1/classes/occurrences/:occurrenceId/participants
   */
  static updateOccurrenceParticipants(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const rawId = String(req.params.occurrenceId || '').trim();
      const { participants, coInstructorIds } = req.body || {};

      if (!tenantId || !req.user) {
        res.status(401).json({ error: 'Autenticação necessária.' });
        return;
      }
      if (!rawId) {
        res.status(400).json({ error: 'Aula/ocorrência não informada.' });
        return;
      }

      const isVirtualIndividual = rawId.startsWith('apt:');
      const targetId = isVirtualIndividual ? rawId.slice(4) : rawId;

      const aptRow = db.prepare(`
        SELECT a.id as appointment_id, a.service_id, a.professional_id, a.occurrence_id
        FROM appointments a
        WHERE a.tenant_id = ?
          AND a.status != 'cancelled'
          AND ${isVirtualIndividual ? 'a.id = ?' : '(a.occurrence_id = ? OR a.id = ?)'}
        LIMIT 1
      `).get(...(isVirtualIndividual ? [tenantId, targetId] : [tenantId, targetId, targetId])) as any;

      const occRow = !aptRow && !isVirtualIndividual
        ? db.prepare(`
            SELECT id as occurrence_id, service_id, professional_id
            FROM class_occurrences
            WHERE tenant_id = ? AND id = ?
          `).get(tenantId, targetId) as any
        : null;

      const ref = aptRow || occRow;
      if (!ref) {
        res.status(404).json({ error: 'Aula/ocorrência não encontrada.' });
        return;
      }

      const realOccId = ref.occurrence_id || null;
      const singleAptId = realOccId ? null : ref.appointment_id;

      if (req.user.role === 'professional') {
        const ownProfIds = getOwnProfessionalIds(req.user.userId, tenantId);
        let hasAccess = ownProfIds.includes(ref.professional_id);
        if (!hasAccess && realOccId) {
          hasAccess = InstructorParticipationService.isProfessionalLinkedToOccurrence(tenantId, ownProfIds, realOccId);
        }
        if (!hasAccess && singleAptId && ownProfIds.length > 0) {
          const ph = ownProfIds.map(() => '?').join(', ');
          const rowPart = db.prepare(`
            SELECT 1 FROM session_instructor_participants
            WHERE tenant_id = ? AND appointment_id = ? AND occurrence_id IS NULL AND professional_id IN (${ph})
            LIMIT 1
          `).get(tenantId, singleAptId, ...ownProfIds);
          hasAccess = Boolean(rowPart);
        }
        if (!hasAccess) {
          res.status(403).json({ error: 'Sem permissão para editar instrutores desta aula.' });
          return;
        }
      }

      const updatedBy = req.user.userId;
      let saved: any[] = [];

      db.transaction(() => {
        if (Array.isArray(participants)) {
          saved = InstructorParticipationService.confirmParticipantStatusesTx({
            tenantId,
            serviceId: ref.service_id,
            occurrenceId: realOccId,
            appointmentId: singleAptId,
            primaryProfessionalId: ref.professional_id,
            participants,
            updatedBy,
            source: 'manual_edit',
            replaceMissingCoInstructors: req.user?.role === 'clinic_admin'
          });
        } else if (Array.isArray(coInstructorIds)) {
          if (realOccId) {
            saved = InstructorParticipationService.syncOccurrenceParticipantsTx({
              tenantId,
              serviceId: ref.service_id,
              occurrenceId: realOccId,
              primaryProfessionalId: ref.professional_id,
              coInstructorIds,
              source: 'manual_edit',
              updatedBy,
              preserveExistingAttendance: false
            });
          } else if (singleAptId) {
            saved = InstructorParticipationService.syncAppointmentParticipantsTx({
              tenantId,
              serviceId: ref.service_id,
              appointmentId: singleAptId,
              primaryProfessionalId: ref.professional_id,
              coInstructorIds,
              source: 'manual_edit',
              updatedBy,
              replaceCoInstructors: true
            });
          }
        } else {
          const err: any = new Error('Informe participants ou coInstructorIds para atualizar a equipe da aula.');
          err.status = 400;
          throw err;
        }
      })();

      logAudit(req, 'UPDATE_OCCURRENCE_PARTICIPANTS', realOccId ? 'class_occurrences' : 'appointments', realOccId || singleAptId, {
        count: saved.length
      });

      res.json({
        occurrenceId: realOccId || `apt:${singleAptId}`,
        participants: saved
      });
    } catch (err: any) {
      console.error('[ClassAttendanceController.updateOccurrenceParticipants] Erro:', err);
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao atualizar instrutores da aula.' });
    }
  }

  /**
   * Conclui uma aula/ocorrência de Studio (individual ou coletiva) sem exigir prontuário/evolução clínica.
   * POST /v1/classes/occurrences/:occurrenceId/finish
   */
  static finishOccurrence(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const rawId = String(req.params.occurrenceId || '').trim();
      const { attendanceOverrides, markPendingAsPresent = true, participantStatuses } = req.body || {};

      if (!tenantId || !req.user) {
        res.status(401).json({ error: 'Autenticação necessária.' });
        return;
      }
      if (!rawId) {
        res.status(400).json({ error: 'Aula/ocorrência não informada.' });
        return;
      }

      const isVirtualIndividual = rawId.startsWith('apt:');
      const targetId = isVirtualIndividual ? rawId.slice(4) : rawId;

      const rows = db.prepare(`
        SELECT
          a.id, a.patient_id, a.professional_id, a.service_id, a.status, a.start_time, a.end_time,
          a.attendance_start_at, a.attendance_end_at, a.attendance_status, a.occurrence_id,
          co.class_schedule_id,
          a.clinical_module, COALESCE(a.service_kind, 'individual') as service_kind,
          s.service_kind as service_kind_srv, s.service_domain, s.clinical_module as service_clinical_module,
          COALESCE(t.establishment_profile, 'clinic') as establishment_profile
        FROM appointments a
        LEFT JOIN tenants t ON t.id = a.tenant_id
        LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
        LEFT JOIN class_occurrences co ON co.id = a.occurrence_id AND co.tenant_id = a.tenant_id
        WHERE a.tenant_id = ?
          AND a.status != 'cancelled'
          AND ${isVirtualIndividual ? 'a.id = ?' : '(a.occurrence_id = ? OR a.id = ?)'}
      `).all(...(isVirtualIndividual ? [tenantId, targetId] : [tenantId, targetId, targetId])) as any[];

      if (rows.length === 0) {
        res.status(404).json({ error: 'Aula/ocorrência não encontrada ou sem alunos ativos.' });
        return;
      }

      const anyStudio = rows.some(r => shouldUseStudioPersonalWorkflow({
        establishmentProfile: r.establishment_profile,
        serviceDomain: r.service_domain,
        serviceKind: r.service_kind_srv,
        appointmentServiceKind: r.service_kind,
        occurrenceId: r.occurrence_id,
        appointmentClinicalModule: r.clinical_module,
        serviceClinicalModule: r.service_clinical_module,
        professionalClinicalModule: r.professional_id ? resolveProfessionalCanonicalModule(r.professional_id, tenantId) : null
      }));

      if (!anyStudio) {
        res.status(409).json({
          error: 'Atendimentos clínicos tradicionais devem ser concluídos pelo prontuário/evolução clínica.'
        });
        return;
      }

      const firstRealOccId = rows.find(r => r.occurrence_id)?.occurrence_id || null;
      const singleAptId = firstRealOccId ? null : rows[0].id;

      if (req.user.role === 'professional') {
        const ownProfIds = getOwnProfessionalIds(req.user.userId, tenantId);
        let ownsClass = rows.some(r => ownProfIds.includes(r.professional_id));
        if (!ownsClass && firstRealOccId) {
          ownsClass = InstructorParticipationService.isProfessionalLinkedToOccurrence(tenantId, ownProfIds, firstRealOccId);
        }
        if (!ownsClass && singleAptId && ownProfIds.length > 0) {
          const ph = ownProfIds.map(() => '?').join(', ');
          const partRow = db.prepare(`
            SELECT 1 FROM session_instructor_participants
            WHERE tenant_id = ? AND appointment_id = ? AND occurrence_id IS NULL AND professional_id IN (${ph})
            LIMIT 1
          `).get(tenantId, singleAptId, ...ownProfIds);
          ownsClass = Boolean(partRow);
        }
        if (!ownsClass) {
          res.status(403).json({ error: 'Sem permissão para finalizar a aula de outro instrutor.' });
          return;
        }
      }

      const nowIso = getClinicLocalNowIso();
      const userId = req.user.userId;
      const actorName = req.user.name || req.user.email || 'Instrutor';
      const overridesMap: Record<string, string> =
        attendanceOverrides && typeof attendanceOverrides === 'object' ? attendanceOverrides : {};

      const completedIds: string[] = [];
      let realOccurrenceId: string | null = firstRealOccId;
      let confirmedParticipants: any[] = [];

      db.transaction(() => {
        for (const row of rows) {
          if (row.occurrence_id) realOccurrenceId = row.occurrence_id;

          let nextAttendance = String(row.attendance_status || 'pending');
          const override = overridesMap[row.id];
          if (override && VALID_ATTENDANCE_STATUSES.includes(override as AttendanceStatus)) {
            nextAttendance = override;
          } else if (nextAttendance === 'pending' && markPendingAsPresent) {
            nextAttendance = 'present';
          }

          if (nextAttendance !== row.attendance_status && nextAttendance !== 'pending') {
            db.prepare(`
              UPDATE appointments
              SET attendance_status = ?,
                  attendance_marked_at = datetime('now'),
                  attendance_marked_by = ?,
                  updated_at = datetime('now')
              WHERE id = ? AND tenant_id = ?
            `).run(nextAttendance, userId, row.id, tenantId);

            PackageService.handleAttendanceChangeTx({
              tenantId,
              appointmentId: row.id,
              attendanceStatus: nextAttendance as AttendanceStatus,
              createdBy: userId
            });
          }

          const startStamp = row.attendance_start_at || normalizeLocalDateTimeIso(row.start_time) || nowIso;
          const endStamp = row.attendance_end_at || nowIso;
          if (row.status !== 'completed') {
            db.prepare(`
              UPDATE appointments
              SET status = 'completed',
                  attendance_start_at = COALESCE(attendance_start_at, ?),
                  attendance_end_at = COALESCE(attendance_end_at, ?),
                  updated_at = datetime('now')
              WHERE id = ? AND tenant_id = ?
            `).run(startStamp, endStamp, row.id, tenantId);

            db.prepare(`
              INSERT INTO appointment_status_history (id, appointment_id, previous_status, new_status, changed_by, reason)
              VALUES (?, ?, ?, 'completed', ?, 'Aula de Studio finalizada no ZemdaPersonal')
            `).run(uuidv4(), row.id, row.status, actorName);

            syncReceptionStatusFromClinical(tenantId, row.id, 'completed');
            completedIds.push(row.id);
          }
        }

        if (realOccurrenceId) {
          db.prepare(`
            UPDATE class_occurrences
            SET status = 'completed',
                updated_at = datetime('now')
            WHERE id = ? AND tenant_id = ?
          `).run(realOccurrenceId, tenantId);
        }

        // Confirmação dos instrutores participantes (impacta elegibilidade de comissão)
        const targetOccId = realOccurrenceId;
        const targetAptId = targetOccId ? null : rows[0].id;
        const existingParticipants = targetOccId
          ? InstructorParticipationService.listParticipantsForOccurrence(tenantId, targetOccId)
          : InstructorParticipationService.listParticipantsForAppointment(tenantId, targetAptId);

        const primaryProfId = rows[0].professional_id;
        const scheduleId = rows[0].class_schedule_id || null;
        const serviceId = rows[0].service_id || null;

        if (Array.isArray(participantStatuses) && participantStatuses.length > 0) {
          const explicitMap = new Map<string, { role?: InstructorRole; attendanceStatus: InstructorAttendanceStatus }>();
          for (const item of participantStatuses) {
            const pid = String(item?.professionalId || '').trim();
            if (!pid) continue;
            const st: InstructorAttendanceStatus =
              item?.attendanceStatus === 'absent' || item?.attendanceStatus === 'scheduled' || item?.attendanceStatus === 'present'
                ? item.attendanceStatus
                : 'present';
            const rl: InstructorRole | undefined =
              item?.role === 'primary' || item?.role === 'co_instructor' ? item.role : undefined;
            explicitMap.set(pid, { role: rl, attendanceStatus: st });
          }

          // Preserva e confirma automaticamente participantes já agendados que não foram sobrescritos
          const mergedInputs: Array<{
            professionalId: string;
            role?: InstructorRole;
            attendanceStatus: InstructorAttendanceStatus;
          }> = [];
          for (const ex of existingParticipants) {
            const explicit = explicitMap.get(ex.professional_id);
            if (explicit) {
              mergedInputs.push({
                professionalId: ex.professional_id,
                role: explicit.role || ex.role,
                attendanceStatus: explicit.attendanceStatus
              });
              explicitMap.delete(ex.professional_id);
            } else {
              mergedInputs.push({
                professionalId: ex.professional_id,
                role: ex.role,
                attendanceStatus: ex.attendance_status === 'absent' ? 'absent' : 'present'
              });
            }
          }
          if (primaryProfId && !existingParticipants.some(e => e.professional_id === primaryProfId) && !explicitMap.has(primaryProfId)) {
            mergedInputs.push({
              professionalId: primaryProfId,
              role: 'primary',
              attendanceStatus: 'present'
            });
          }
          for (const [pid, data] of explicitMap.entries()) {
            mergedInputs.push({
              professionalId: pid,
              role: data.role || (pid === primaryProfId ? 'primary' : 'co_instructor'),
              attendanceStatus: data.attendanceStatus
            });
          }

          confirmedParticipants = InstructorParticipationService.confirmParticipantStatusesTx({
            tenantId,
            serviceId,
            occurrenceId: targetOccId,
            appointmentId: targetAptId,
            primaryProfessionalId: primaryProfId,
            participants: mergedInputs,
            updatedBy: userId,
            source: 'attendance_finish',
            replaceMissingCoInstructors: false
          });
        } else {
          // Sem override explícito: garante titular + equipe agendada confirmados como 'present'
          let baseInputs: Array<{
            professionalId: string;
            role?: InstructorRole;
            attendanceStatus: InstructorAttendanceStatus;
          }> = [];

          if (existingParticipants.length > 0) {
            baseInputs = existingParticipants.map(ex => ({
              professionalId: ex.professional_id,
              role: ex.role,
              attendanceStatus: ex.attendance_status === 'absent' ? 'absent' : 'present'
            }));
          } else if (primaryProfId) {
            baseInputs.push({
              professionalId: primaryProfId,
              role: 'primary',
              attendanceStatus: 'present'
            });
            if (scheduleId) {
              const coIds = InstructorParticipationService.getScheduleCoInstructorIds(tenantId, scheduleId, primaryProfId);
              for (const coId of coIds) {
                baseInputs.push({
                  professionalId: coId,
                  role: 'co_instructor',
                  attendanceStatus: 'present'
                });
              }
            }
          }

          if (baseInputs.length > 0) {
            confirmedParticipants = InstructorParticipationService.confirmParticipantStatusesTx({
              tenantId,
              serviceId,
              occurrenceId: targetOccId,
              appointmentId: targetAptId,
              primaryProfessionalId: primaryProfId,
              participants: baseInputs,
              updatedBy: userId,
              source: 'attendance_finish',
              replaceMissingCoInstructors: false
            });
          }
        }
      })();

      logAudit(req, 'FINISH_STUDIO_CLASS', 'class_occurrences', realOccurrenceId || rawId, {
        completedAppointments: completedIds.length,
        totalStudents: rows.length,
        presentInstructors: confirmedParticipants.filter(p => p.attendance_status !== 'absent').length,
        absentInstructors: confirmedParticipants.filter(p => p.attendance_status === 'absent').length
      });

      res.json({
        message: rows.length > 1
          ? `Aula coletiva finalizada com sucesso (${rows.length} aluno(s))!`
          : 'Aula/sessão finalizada com sucesso!',
        occurrenceId: realOccurrenceId || rawId,
        completedCount: completedIds.length,
        totalStudents: rows.length,
        appointmentIds: completedIds,
        participants: confirmedParticipants
      });
    } catch (err: any) {
      console.error('[ClassAttendanceController.finishOccurrence] Erro:', err);
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao finalizar aula do Studio.' });
    }
  }
}
