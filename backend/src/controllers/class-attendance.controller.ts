import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';
import { logAudit } from '../middlewares/audit.middleware';
import { PackageService } from '../services/package.service';
import { syncReceptionStatusFromClinical } from './checkin.controller';
import { getClinicLocalNowIso, normalizeLocalDateTimeIso } from '../services/document-context.service';
import { shouldUseStudioPersonalWorkflow } from '../utils/establishment-context';
import { InstructorAttendanceStatus, InstructorParticipationService, InstructorRole } from '../services/instructor-participation.service';

const VALID_ATTENDANCE_STATUSES = ['pending', 'present', 'absent', 'cancelled'] as const;
type AttendanceStatus = typeof VALID_ATTENDANCE_STATUSES[number];

function getOwnProfessionalIds(userId: string, tenantId: string): string[] {
  return (db.prepare(`
    SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ? AND active = 1
  `).all(userId, tenantId) as { id: string }[]).map(r => r.id);
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
      const rawId = String(req.params.id || '');
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
          CASE WHEN a.occurrence_id IS NOT NULL OR COALESCE(s.service_kind, a.service_kind) = 'group' THEN 'group' ELSE 'individual' END as service_kind,
          COALESCE(co.capacity, COALESCE(s.default_capacity, 1)) as capacity,
          co.class_schedule_id,
          pay.status as payment_status
        FROM appointments a
        JOIN patients pat ON pat.id = a.patient_id
        LEFT JOIN professionals p ON p.id = a.professional_id
        LEFT JOIN services s ON s.id = a.service_id
        LEFT JOIN class_occurrences co ON co.id = a.occurrence_id AND co.tenant_id = a.tenant_id
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

      res.json({
        occurrenceId: rows[0].occurrence_id || `apt:${rows[0].appointment_id}`,
        serviceName: rows[0].service_name,
        professionalName: rows[0].professional_name,
        startTime: rows[0].start_time,
        endTime: rows[0].end_time,
        serviceKind: rows[0].service_kind,
        capacity: rows[0].capacity,
        participants,
        roster: rows
      });
    } catch (err: any) {
      console.error('[ClassAttendanceController.getRoster] Erro:', err);
      res.status(500).json({ error: 'Erro ao carregar lista de chamada.' });
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

      // 2. Frequência por aluno + ranking de assiduidade
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
          MAX(CASE WHEN COALESCE(a.attendance_status, 'pending') = 'present' THEN a.start_time ELSE NULL END) as last_present_at
        FROM appointments a
        JOIN patients pat ON pat.id = a.patient_id
        WHERE ${filterSql}
        GROUP BY a.patient_id, pat.full_name, pat.phone
        ORDER BY present_count DESC, absent_count ASC, pat.full_name ASC
      `).all(...params).map((r: any) => {
        const evalTotal = Number(r.present_count) + Number(r.absent_count);
        const rate = evalTotal > 0 ? Math.round((Number(r.present_count) / evalTotal) * 1000) / 10 : 0;
        return { ...r, attendance_rate: rate };
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

      // 5. Frequência por instrutor / profissional
      const byInstructor = db.prepare(`
        SELECT
          a.professional_id,
          COALESCE(p.name, 'Profissional') as professional_name,
          COUNT(DISTINCT COALESCE(a.occurrence_id, a.id)) as classes_count,
          COUNT(*) as enrollments_count,
          SUM(CASE WHEN COALESCE(a.attendance_status, 'pending') = 'present' AND a.status != 'cancelled' THEN 1 ELSE 0 END) as present_count,
          SUM(CASE WHEN (COALESCE(a.attendance_status, 'pending') = 'absent' OR a.status = 'no_show') AND a.status != 'cancelled' THEN 1 ELSE 0 END) as absent_count
        FROM appointments a
        LEFT JOIN professionals p ON p.id = a.professional_id
        WHERE ${filterSql}
        GROUP BY a.professional_id, p.name
        ORDER BY present_count DESC, enrollments_count DESC
      `).all(...params).map((r: any) => {
        const evalTotal = Number(r.present_count) + Number(r.absent_count);
        const rate = evalTotal > 0 ? Math.round((Number(r.present_count) / evalTotal) * 1000) / 10 : 0;
        return { ...r, attendance_rate: rate };
      });

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
      const rawId = String(req.params.occurrenceId || '').trim();
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
        serviceClinicalModule: r.service_clinical_module
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
