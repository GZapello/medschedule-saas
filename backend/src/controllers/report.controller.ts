import { Request, Response } from 'express';
import { db } from '../config/database';
import { ClinicalExportService } from '../services/clinical-export.service';
import { hasClinicalAccess } from './clinical.controller';
import { getUserPermissions } from '../middlewares/rbac.middleware';

function timeStrToMinutes(t?: string | null): number {
  if (!t) return 0;
  const [h, m] = String(t).trim().slice(0, 5).split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function subtractIntervalFromRanges(
  ranges: Array<{ start: number; end: number }>,
  cutStart: number | null,
  cutEnd: number | null
): Array<{ start: number; end: number }> {
  if (cutStart === null || cutEnd === null || cutEnd <= cutStart) return ranges;
  const out: Array<{ start: number; end: number }> = [];
  for (const r of ranges) {
    if (cutEnd <= r.start || cutStart >= r.end) {
      out.push(r);
    } else {
      if (cutStart > r.start) out.push({ start: r.start, end: Math.min(r.end, cutStart) });
      if (cutEnd < r.end) out.push({ start: Math.max(r.start, cutEnd), end: r.end });
    }
  }
  return out;
}

function parseAppointmentDurationMinutes(startStr: string, endStr: string, fallbackDuration = 50): number {
  if (!startStr || !endStr) return fallbackDuration;
  const s = Date.parse(String(startStr).trim().replace(' ', 'T'));
  const e = Date.parse(String(endStr).trim().replace(' ', 'T'));
  if (Number.isFinite(s) && Number.isFinite(e) && e > s) {
    const diff = Math.round((e - s) / 60000);
    return Math.min(Math.max(diff, 5), 720);
  }
  return fallbackDuration;
}

/**
 * Verifica se o usuário autenticado é exclusivamente da recepção/secretaria na clínica.
 * Perfis de recepção possuem acesso apenas à Continuidade do Cuidado em Relatórios.
 */
export function isUserReceptionOnly(req: Request, tenantId: string): boolean {
  if (!req.user) return false;
  const role = String(req.user.role || '').toLowerCase();
  if (role === 'superadmin' || role === 'clinic_admin' || role === 'professional') {
    return false;
  }
  try {
    const cu = db
      .prepare('SELECT is_manager, role FROM clinic_users WHERE user_id = ? AND tenant_id = ? LIMIT 1')
      .get(req.user.userId, tenantId) as any;
    if (cu?.is_manager === 1 || cu?.role === 'clinic_admin' || cu?.role === 'professional') {
      return false;
    }
    const effectiveRole = String(cu?.role || role).toLowerCase();
    return effectiveRole === 'receptionist' || effectiveRole === 'secretary';
  } catch {
    return role === 'receptionist' || role === 'secretary';
  }
}

/**
 * Verifica se o usuário autenticado pode visualizar valores financeiros/receita nos relatórios.
 * A recepção nunca acessa relatórios financeiros ou indicadores de desempenho.
 */
export function canUserAccessReportFinancials(req: Request, tenantId: string): boolean {
  if (!req.user) return false;
  if (isUserReceptionOnly(req, tenantId)) return false;
  const role = String(req.user.role || '');
  if (role === 'superadmin' || role === 'clinic_admin' || role === 'financial') {
    return true;
  }
  try {
    const cu = db.prepare('SELECT is_manager, permissions_json, role FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
    if (cu?.is_manager === 1 || cu?.role === 'clinic_admin' || cu?.role === 'financial') {
      return true;
    }
    const perms = getUserPermissions(req.user.userId, tenantId, role);
    if (perms.includes('manage_financial')) {
      return true;
    }
    if (role === 'professional' && perms.includes('view_financial')) {
      return true;
    }
  } catch (_) {}
  return false;
}

/**
 * Calcula a capacidade real (em minutos) da agenda de um profissional em um período [startDateStr, endDateStr],
 * considerando a escala configurada por dia da semana, expediente da clínica, intervalos de descanso/almoço,
 * feriados e bloqueios registrados.
 */
function calculateProfessionalAvailableMinutes(
  tenantId: string,
  professionalId: string,
  startDateStr: string,
  endDateStr: string
): number {
  const startDay = startDateStr.slice(0, 10);
  const endDay = endDateStr.slice(0, 10);
  if (!startDay || !endDay || endDay < startDay) return 0;

  const schedules = db.prepare(`
    SELECT day_of_week, start_time, end_time, break_start, break_end
    FROM schedules
    WHERE tenant_id = ? AND professional_id = ? AND is_active = 1
  `).all(tenantId, professionalId) as Array<{
    day_of_week: number;
    start_time: string;
    end_time: string;
    break_start: string | null;
    break_end: string | null;
  }>;

  if (!schedules || schedules.length === 0) return 0;

  const tenantRow = db.prepare('SELECT business_hours_json FROM tenants WHERE id = ?').get(tenantId) as { business_hours_json?: string } | undefined;
  let clinicHoursByDay = new Map<number, any>();
  if (tenantRow?.business_hours_json) {
    try {
      const parsed = JSON.parse(tenantRow.business_hours_json);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          clinicHoursByDay.set(Number(item.dayOfWeek), item);
        }
      }
    } catch (_) {}
  }

  const holidaysRows = db.prepare(`
    SELECT date FROM holidays
    WHERE (tenant_id = ? OR is_national = 1) AND active = 1 AND date >= ? AND date <= ?
  `).all(tenantId, startDay, endDay) as Array<{ date: string }>;
  const holidaySet = new Set(holidaysRows.map(h => h.date));

  const blocks = db.prepare(`
    SELECT start_datetime, end_datetime
    FROM blocked_times
    WHERE tenant_id = ?
      AND (professional_id = ? OR professional_id IS NULL)
      AND REPLACE(start_datetime, ' ', 'T') <= ?
      AND REPLACE(end_datetime, ' ', 'T') >= ?
  `).all(tenantId, professionalId, `${endDay}T23:59:59`, `${startDay}T00:00:00`) as Array<{
    start_datetime: string;
    end_datetime: string;
  }>;

  const [sy, sm, sd] = startDay.split('-').map(Number);
  const [ey, em, ed] = endDay.split('-').map(Number);
  const cursor = new Date(Date.UTC(sy, sm - 1, sd, 12, 0, 0));
  const endCursor = new Date(Date.UTC(ey, em - 1, ed, 12, 0, 0));

  let totalAvailableMinutes = 0;
  let safetyCounter = 0;

  while (cursor <= endCursor && safetyCounter < 370) {
    safetyCounter++;
    const dayIso = cursor.toISOString().slice(0, 10);
    const dayOfWeek = cursor.getUTCDay();

    if (!holidaySet.has(dayIso)) {
      const clinicDay = clinicHoursByDay.get(dayOfWeek);
      const clinicClosed = clinicDay && (clinicDay.isOpen === false || clinicDay.active === false);

      if (!clinicClosed) {
        const clinicStart = clinicDay?.startTime ? timeStrToMinutes(clinicDay.startTime) : 0;
        const clinicEnd = clinicDay?.endTime ? timeStrToMinutes(clinicDay.endTime) : 24 * 60;
        const clinicBreakStart = clinicDay?.breakStart ? timeStrToMinutes(clinicDay.breakStart) : null;
        const clinicBreakEnd = clinicDay?.breakEnd ? timeStrToMinutes(clinicDay.breakEnd) : null;

        const daySchedules = schedules.filter(s => Number(s.day_of_week) === dayOfWeek);
        let dayRanges: Array<{ start: number; end: number }> = [];

        for (const sch of daySchedules) {
          const effStart = Math.max(timeStrToMinutes(sch.start_time), clinicStart);
          const effEnd = Math.min(timeStrToMinutes(sch.end_time), clinicEnd);
          if (effEnd <= effStart) continue;

          let segs = [{ start: effStart, end: effEnd }];
          const brkStart = sch.break_start ? timeStrToMinutes(sch.break_start) : null;
          const brkEnd = sch.break_end ? timeStrToMinutes(sch.break_end) : null;
          segs = subtractIntervalFromRanges(segs, brkStart, brkEnd);
          segs = subtractIntervalFromRanges(segs, clinicBreakStart, clinicBreakEnd);
          dayRanges.push(...segs);
        }

        // Desconta bloqueios que afetam este dia
        for (const blk of blocks) {
          const bStartIso = String(blk.start_datetime || '').trim().replace(' ', 'T');
          const bEndIso = String(blk.end_datetime || '').trim().replace(' ', 'T');
          const bStartDate = bStartIso.slice(0, 10);
          const bEndDate = bEndIso.slice(0, 10);
          if (bEndDate < dayIso || bStartDate > dayIso) continue;

          const cutStart = bStartDate < dayIso ? 0 : timeStrToMinutes(bStartIso.slice(11, 16));
          const cutEnd = bEndDate > dayIso ? 24 * 60 : timeStrToMinutes(bEndIso.slice(11, 16));
          dayRanges = subtractIntervalFromRanges(dayRanges, cutStart, cutEnd);
        }

        for (const r of dayRanges) {
          if (r.end > r.start) {
            totalAvailableMinutes += (r.end - r.start);
          }
        }
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return totalAvailableMinutes;
}

export class ReportController {
  static getAttendanceReport(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId as string;
      if (!tenantId) {
        res.status(400).json({ error: 'Clínica não identificada' });
        return;
      }

      if (isUserReceptionOnly(req, tenantId)) {
        res.status(403).json({
          error: 'Acesso restrito: a recepção possui acesso exclusivamente à área de Continuidade do Cuidado.',
          code: 'PERFORMANCE_REPORT_FORBIDDEN'
        });
        return;
      }

      const { startDate, endDate, professionalId, serviceId, specialtyId } = req.query;
      const canViewFinancial = canUserAccessReportFinancials(req, tenantId);

      // Define intervalo padrão de 30 dias para cálculo de capacidade se não informado
      const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
      const defaultStartObj = new Date();
      defaultStartObj.setDate(defaultStartObj.getDate() - 29);
      const defaultStartIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(defaultStartObj);

      const resolvedStartDay = startDate ? String(startDate).slice(0, 10) : defaultStartIso;
      const resolvedEndDay = endDate ? String(endDate).slice(0, 10) : todayIso;

      let whereClause = 'WHERE a.tenant_id = ?';
      const params: any[] = [tenantId];

      if (startDate) {
        const sVal = String(startDate).length === 10 ? `${startDate}T00:00:00` : String(startDate);
        whereClause += " AND REPLACE(a.start_time, ' ', 'T') >= ?";
        params.push(sVal);
      }
      if (endDate) {
        const eVal = String(endDate).length === 10 ? `${endDate}T23:59:59` : String(endDate);
        whereClause += " AND REPLACE(a.start_time, ' ', 'T') <= ?";
        params.push(eVal);
      }
      if (professionalId) {
        whereClause += ' AND a.professional_id = ?';
        params.push(String(professionalId));
      }
      if (serviceId) {
        whereClause += ' AND a.service_id = ?';
        params.push(String(serviceId));
      }
      if (specialtyId) {
        whereClause += ' AND (p.specialty_id = ? OR p.profession_id = ? OR s.specialty_id = ?)';
        params.push(String(specialtyId), String(specialtyId), String(specialtyId));
      }

      // Busca agendamentos únicos filtrados para cálculo preciso sem duplicação
      const appts = db.prepare(`
        SELECT DISTINCT
          a.id,
          a.patient_id,
          a.professional_id,
          a.service_id,
          a.start_time,
          a.end_time,
          a.status,
          p.name as professional_name,
          p.profession_id,
          p.specialty_id,
          COALESCE(s.name, 'Atendimento Geral') as service_name,
          COALESCE(s.duration_minutes, 50) as service_duration
        FROM appointments a
        JOIN professionals p ON p.id = a.professional_id
        LEFT JOIN services s ON s.id = a.service_id
        ${whereClause}
      `).all(...params) as Array<{
        id: string;
        patient_id: string;
        professional_id: string;
        service_id: string | null;
        start_time: string;
        end_time: string;
        status: string;
        professional_name: string;
        profession_id: string | null;
        specialty_id: string | null;
        service_name: string;
        service_duration: number;
      }>;

      let totalScheduled = 0;
      let totalCompleted = 0;
      let patientsAttendedCount = 0;
      let noShowCount = 0;
      let cancelledCount = 0;
      const uniqueAttendedPatients = new Set<string>();
      const uniqueScheduledPatients = new Set<string>();

      const profMap = new Map<string, {
        professional_id: string;
        professional_name: string;
        total: number;
        completed: number;
        attended: number;
        no_show: number;
        cancelled: number;
        scheduled_minutes: number;
        realized_minutes: number;
      }>();

      const serviceMap = new Map<string, {
        service_id: string;
        service_name: string;
        total: number;
        completed: number;
        no_show: number;
        cancelled: number;
      }>();

      const periodPatientMap = new Map<string, {
        date: string;
        attended_appointments: number;
        unique_patients: Set<string>;
      }>();

      for (const a of appts) {
        totalScheduled++;
        uniqueScheduledPatients.add(a.patient_id);
        const dur = parseAppointmentDurationMinutes(a.start_time, a.end_time, a.service_duration || 50);
        const isCompleted = a.status === 'completed';
        const isAttended = a.status === 'completed' || a.status === 'in_progress';
        const isNoShow = a.status === 'no_show';
        const isCancelled = a.status === 'cancelled';

        if (isCompleted) totalCompleted++;
        if (isAttended) {
          patientsAttendedCount++;
          uniqueAttendedPatients.add(a.patient_id);
          const dayKey = String(a.start_time).slice(0, 10);
          if (!periodPatientMap.has(dayKey)) {
            periodPatientMap.set(dayKey, { date: dayKey, attended_appointments: 0, unique_patients: new Set() });
          }
          const pEntry = periodPatientMap.get(dayKey)!;
          pEntry.attended_appointments++;
          pEntry.unique_patients.add(a.patient_id);
        }
        if (isNoShow) noShowCount++;
        if (isCancelled) cancelledCount++;

        // Agrupamento por profissional
        if (!profMap.has(a.professional_id)) {
          profMap.set(a.professional_id, {
            professional_id: a.professional_id,
            professional_name: a.professional_name,
            total: 0,
            completed: 0,
            attended: 0,
            no_show: 0,
            cancelled: 0,
            scheduled_minutes: 0,
            realized_minutes: 0
          });
        }
        const pStat = profMap.get(a.professional_id)!;
        pStat.total++;
        if (isCompleted) pStat.completed++;
        if (isAttended) {
          pStat.attended++;
          pStat.realized_minutes += dur;
        }
        if (isNoShow) pStat.no_show++;
        if (isCancelled) {
          pStat.cancelled++;
        } else {
          pStat.scheduled_minutes += dur;
        }

        // Agrupamento por serviço
        const sKey = a.service_id || 'unassigned';
        if (!serviceMap.has(sKey)) {
          serviceMap.set(sKey, {
            service_id: sKey,
            service_name: a.service_name,
            total: 0,
            completed: 0,
            no_show: 0,
            cancelled: 0
          });
        }
        const sStat = serviceMap.get(sKey)!;
        sStat.total++;
        if (isCompleted) sStat.completed++;
        if (isNoShow) sStat.no_show++;
        if (isCancelled) sStat.cancelled++;
      }

      // Garante que todos os profissionais ativos (ou o profissional filtrado) entrem no cálculo de ocupação da agenda
      let targetProfsQuery = 'SELECT id, name FROM professionals WHERE tenant_id = ? AND active = 1';
      const targetProfsParams: any[] = [tenantId];
      if (professionalId) {
        targetProfsQuery += ' AND id = ?';
        targetProfsParams.push(String(professionalId));
      } else if (specialtyId) {
        targetProfsQuery += ' AND (specialty_id = ? OR profession_id = ?)';
        targetProfsParams.push(String(specialtyId), String(specialtyId));
      }
      const activeProfs = db.prepare(targetProfsQuery).all(...targetProfsParams) as Array<{ id: string; name: string }>;
      for (const p of activeProfs) {
        if (!profMap.has(p.id)) {
          profMap.set(p.id, {
            professional_id: p.id,
            professional_name: p.name,
            total: 0,
            completed: 0,
            attended: 0,
            no_show: 0,
            cancelled: 0,
            scheduled_minutes: 0,
            realized_minutes: 0
          });
        }
      }

      let totalAvailableMinutes = 0;
      let totalScheduledMinutes = 0;
      let totalRealizedMinutes = 0;

      const byProfessional = Array.from(profMap.values()).map(p => {
        const availMin = calculateProfessionalAvailableMinutes(
          tenantId,
          p.professional_id,
          resolvedStartDay,
          resolvedEndDay
        );
        totalAvailableMinutes += availMin;
        totalScheduledMinutes += p.scheduled_minutes;
        totalRealizedMinutes += p.realized_minutes;

        const unusedScheduledMin = Math.max(0, availMin - p.scheduled_minutes);
        const unusedRealizedMin = Math.max(0, availMin - p.realized_minutes);
        const scheduledOccupancyPercent = availMin > 0
          ? Math.min(100, Math.round((p.scheduled_minutes / availMin) * 1000) / 10)
          : 0;
        const realizedOccupancyPercent = availMin > 0
          ? Math.min(100, Math.round((p.realized_minutes / availMin) * 1000) / 10)
          : 0;
        const validAppts = p.total - p.cancelled;
        const attendanceRatePercent = validAppts > 0
          ? Math.round((p.attended / validAppts) * 1000) / 10
          : 0;
        const noShowRatePercent = validAppts > 0
          ? Math.round((p.no_show / validAppts) * 1000) / 10
          : 0;

        return {
          ...p,
          available_minutes: availMin,
          available_hours: Math.round((availMin / 60) * 10) / 10,
          scheduled_hours: Math.round((p.scheduled_minutes / 60) * 10) / 10,
          realized_hours: Math.round((p.realized_minutes / 60) * 10) / 10,
          unused_available_minutes: unusedScheduledMin,
          unused_available_hours: Math.round((unusedScheduledMin / 60) * 10) / 10,
          unused_realized_minutes: unusedRealizedMin,
          unused_realized_hours: Math.round((unusedRealizedMin / 60) * 10) / 10,
          scheduled_occupancy_percent: scheduledOccupancyPercent,
          realized_occupancy_percent: realizedOccupancyPercent,
          attendance_rate_percent: attendanceRatePercent,
          no_show_rate_percent: noShowRatePercent
        };
      }).sort((a, b) => b.total - a.total || a.professional_name.localeCompare(b.professional_name));

      // Receita real recebida (exclusivamente de registros financeiros reais em `payments` com status = 'paid')
      let receivedRevenue: number | null = null;
      const revenueByServiceId = new Map<string, number>();

      if (canViewFinancial) {
        let payWhere = "WHERE pay.tenant_id = ? AND pay.status = 'paid'";
        const payParams: any[] = [tenantId];

        if (startDate) {
          const sVal = String(startDate).length === 10 ? `${startDate} 00:00:00` : String(startDate);
          payWhere += " AND REPLACE(pay.created_at, 'T', ' ') >= REPLACE(?, 'T', ' ')";
          payParams.push(sVal);
        }
        if (endDate) {
          const eVal = String(endDate).length === 10 ? `${endDate} 23:59:59` : String(endDate);
          payWhere += " AND REPLACE(pay.created_at, 'T', ' ') <= REPLACE(?, 'T', ' ')";
          payParams.push(eVal);
        }
        if (professionalId) {
          payWhere += ' AND a.professional_id = ?';
          payParams.push(String(professionalId));
        }
        if (serviceId) {
          payWhere += ' AND a.service_id = ?';
          payParams.push(String(serviceId));
        }
        if (specialtyId) {
          payWhere += ' AND (p.specialty_id = ? OR p.profession_id = ? OR s.specialty_id = ?)';
          payParams.push(String(specialtyId), String(specialtyId), String(specialtyId));
        }

        const paidRows = db.prepare(`
          SELECT DISTINCT
            pay.id,
            pay.amount,
            a.service_id
          FROM payments pay
          LEFT JOIN appointments a ON a.id = pay.appointment_id AND a.tenant_id = pay.tenant_id
          LEFT JOIN professionals p ON p.id = a.professional_id
          LEFT JOIN services s ON s.id = a.service_id
          ${payWhere}
        `).all(...payParams) as Array<{ id: string; amount: number; service_id: string | null }>;

        let sumPaid = 0;
        for (const r of paidRows) {
          const val = Number(r.amount) || 0;
          sumPaid += val;
          const sKey = r.service_id || 'unassigned';
          revenueByServiceId.set(sKey, (revenueByServiceId.get(sKey) || 0) + val);
        }
        receivedRevenue = Math.round(sumPaid * 100) / 100;
      }

      const byService = Array.from(serviceMap.values()).map(s => ({
        service_id: s.service_id,
        service_name: s.service_name,
        total: s.total,
        completed: s.completed,
        no_show: s.no_show,
        cancelled: s.cancelled,
        received_revenue: canViewFinancial
          ? Math.round((revenueByServiceId.get(s.service_id) || 0) * 100) / 100
          : null,
        // Mantém total_value apenas para perfis autorizados usando a receita real recebida
        total_value: canViewFinancial
          ? Math.round((revenueByServiceId.get(s.service_id) || 0) * 100) / 100
          : null
      })).sort((a, b) => b.completed - a.completed || b.total - a.total);

      // Por Módulo Clínico (apenas contagem estatística, sem expor conteúdo clínico)
      const byModuleStmt = db.prepare(`
        SELECT 
          COALESCE(r.module_type, 'Geral') as module_type,
          COUNT(*) as total
        FROM records r
        WHERE r.tenant_id = ?
        GROUP BY r.module_type
        ORDER BY total DESC
      `);
      const byModule = byModuleStmt.all(tenantId);

      const validScheduledCount = Math.max(0, totalScheduled - cancelledCount);
      const noShowPercent = validScheduledCount > 0
        ? Math.round((noShowCount / validScheduledCount) * 1000) / 10
        : 0;
      const cancellationPercent = totalScheduled > 0
        ? Math.round((cancelledCount / totalScheduled) * 1000) / 10
        : 0;
      const attendanceRatePercent = validScheduledCount > 0
        ? Math.round((patientsAttendedCount / validScheduledCount) * 1000) / 10
        : 0;
      const unusedAvailableMinutes = Math.max(0, totalAvailableMinutes - totalScheduledMinutes);
      const scheduledOccupancyPercent = totalAvailableMinutes > 0
        ? Math.min(100, Math.round((totalScheduledMinutes / totalAvailableMinutes) * 1000) / 10)
        : 0;
      const realizedOccupancyPercent = totalAvailableMinutes > 0
        ? Math.min(100, Math.round((totalRealizedMinutes / totalAvailableMinutes) * 1000) / 10)
        : 0;

      const patientsByPeriod = Array.from(periodPatientMap.values())
        .map(p => ({
          date: p.date,
          attendedAppointments: p.attended_appointments,
          uniquePatients: p.unique_patients.size
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Opções de filtro disponíveis na clínica
      const filterProfessionals = db.prepare(`
        SELECT p.id, p.name, p.profession_id, p.specialty_id,
               COALESCE(prof.name, p.profession_name) as profession_name,
               COALESCE(p.specialty_custom, spec.name) as specialty_name
        FROM professionals p
        LEFT JOIN professions prof ON prof.id = p.profession_id
        LEFT JOIN specialties spec ON spec.id = p.specialty_id
        WHERE p.tenant_id = ? AND p.active = 1
        ORDER BY p.name ASC
      `).all(tenantId);

      const filterServices = db.prepare(`
        SELECT id, name, professional_id, specialty_id, duration_minutes, return_periodicity_days, reminder_enabled, reminder_value, reminder_unit
        FROM services
        WHERE tenant_id = ? AND active = 1
        ORDER BY name ASC
      `).all(tenantId);

      res.json({
        period: { startDate: resolvedStartDay, endDate: resolvedEndDay },
        permissions: { canViewFinancial },
        summary: {
          totalScheduled,
          validScheduledCount,
          totalCompleted,
          patientsAttendedCount,
          uniquePatientsAttended: uniqueAttendedPatients.size,
          uniquePatientsScheduled: uniqueScheduledPatients.size,
          noShowCount,
          noShowPercent,
          cancelledCount,
          cancellationPercent,
          attendanceRatePercent,
          totalAvailableMinutes,
          totalAvailableHours: Math.round((totalAvailableMinutes / 60) * 10) / 10,
          totalScheduledMinutes,
          totalScheduledHours: Math.round((totalScheduledMinutes / 60) * 10) / 10,
          totalRealizedMinutes,
          totalRealizedHours: Math.round((totalRealizedMinutes / 60) * 10) / 10,
          unusedAvailableMinutes,
          unusedAvailableHours: Math.round((unusedAvailableMinutes / 60) * 10) / 10,
          scheduledOccupancyPercent,
          realizedOccupancyPercent,
          receivedRevenue
        },
        byProfessional,
        byService,
        patientsByPeriod,
        byModule,
        filters: {
          professionals: filterProfessionals,
          services: filterServices
        }
      });
    } catch (err: any) {
      console.error('[ReportController.getAttendanceReport] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar relatório de desempenho e atendimentos' });
    }
  }

  /**
   * 1.2. Continuidade do Cuidado:
   * Lista pacientes que realizaram atendimentos, com faixas informativas de tempo desde o último
   * atendimento concluído (Até 30d, 31-60d, 61-90d, >90d), considerando periodicidade configurada
   * por paciente ou serviço, próximo agendamento e tratamentos encerrados/alta.
   */
  static getCareContinuityReport(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId as string;
      if (!tenantId) {
        res.status(400).json({ error: 'Clínica não identificada' });
        return;
      }

      const { band, professionalId, serviceId, specialtyId, situation, search } = req.query;

      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
      const [ty, tm, td] = todayStr.split('-').map(Number);
      const todayUtcMs = Date.UTC(ty, tm - 1, td, 12, 0, 0);
      const nowIso = `${todayStr}T00:00:00`;

      // Busca pacientes ativos da clínica que possuem ao menos 1 atendimento concluído
      const completedAppts = db.prepare(`
        SELECT
          a.id as appointment_id,
          a.patient_id,
          a.professional_id,
          a.service_id,
          a.start_time,
          pat.full_name as patient_name,
          pat.phone as patient_phone,
          pat.email as patient_email,
          pat.return_periodicity_days as patient_periodicity_days,
          COALESCE(pat.follow_up_status, 'active') as follow_up_status,
          pat.follow_up_notes,
          p.name as professional_name,
          p.profession_id,
          p.specialty_id,
          COALESCE(prof.name, p.profession_name, 'Saúde') as profession_name,
          COALESCE(p.specialty_custom, spec.name) as specialty_name,
          s.name as service_name,
          s.return_periodicity_days as service_periodicity_days,
          s.reminder_enabled,
          s.reminder_value,
          s.reminder_unit
        FROM appointments a
        JOIN patients pat ON pat.id = a.patient_id AND pat.tenant_id = a.tenant_id
        JOIN professionals p ON p.id = a.professional_id
        LEFT JOIN professions prof ON prof.id = p.profession_id
        LEFT JOIN specialties spec ON spec.id = p.specialty_id
        LEFT JOIN services s ON s.id = a.service_id
        WHERE a.tenant_id = ?
          AND a.status = 'completed'
          AND pat.active = 1
        ORDER BY REPLACE(a.start_time, ' ', 'T') DESC
      `).all(tenantId) as any[];

      // Mantém apenas o último atendimento concluído de cada paciente (ou do profissional filtrado)
      const latestByPatient = new Map<string, any>();
      for (const row of completedAppts) {
        if (professionalId && row.professional_id !== String(professionalId)) continue;
        if (serviceId && row.service_id !== String(serviceId)) continue;
        if (specialtyId && row.specialty_id !== String(specialtyId) && row.profession_id !== String(specialtyId)) continue;
        if (!latestByPatient.has(row.patient_id)) {
          latestByPatient.set(row.patient_id, row);
        }
      }

      // Busca próximos agendamentos futuros (scheduled/confirmed) na clínica
      const upcomingAppts = db.prepare(`
        SELECT
          a.id,
          a.patient_id,
          a.professional_id,
          a.service_id,
          a.start_time,
          a.status,
          p.name as professional_name,
          s.name as service_name
        FROM appointments a
        JOIN professionals p ON p.id = a.professional_id
        LEFT JOIN services s ON s.id = a.service_id
        WHERE a.tenant_id = ?
          AND a.status IN ('scheduled', 'confirmed')
          AND REPLACE(a.start_time, ' ', 'T') >= ?
        ORDER BY REPLACE(a.start_time, ' ', 'T') ASC
      `).all(tenantId, nowIso) as any[];

      const nextApptByPatient = new Map<string, any>();
      for (const up of upcomingAppts) {
        if (!nextApptByPatient.has(up.patient_id)) {
          nextApptByPatient.set(up.patient_id, up);
        }
      }

      // Verifica pacientes que possuem todos os planos de tratamento concluídos (ex: odontologia / TO)
      const completedPlansPatients = new Set<string>();
      try {
        const dentalDone = db.prepare(`
          SELECT patient_id
          FROM dental_treatment_plans
          WHERE tenant_id = ?
          GROUP BY patient_id
          HAVING SUM(CASE WHEN status != 'completed' THEN 1 ELSE 0 END) = 0
             AND COUNT(*) > 0
        `).all(tenantId) as Array<{ patient_id: string }>;
        for (const d of dentalDone) completedPlansPatients.add(d.patient_id);
      } catch (_) {}

      const items: any[] = [];
      const bandCounts = {
        all: 0,
        up_to_30: 0,
        '31_to_60': 0,
        '61_to_90': 0,
        over_90: 0
      };

      for (const [patientIdKey, last] of latestByPatient.entries()) {
        if (search) {
          const q = String(search).trim().toLowerCase();
          const matchName = String(last.patient_name || '').toLowerCase().includes(q);
          const matchPhone = String(last.patient_phone || '').toLowerCase().includes(q);
          const matchProf = String(last.professional_name || '').toLowerCase().includes(q);
          if (!matchName && !matchPhone && !matchProf) continue;
        }

        const lastDateIso = String(last.start_time || '').trim().replace(' ', 'T').slice(0, 10);
        const [ly, lm, ld] = lastDateIso.split('-').map(Number);
        const lastUtcMs = Date.UTC(ly || ty, (lm || tm) - 1, ld || td, 12, 0, 0);
        const daysSinceLast = Math.max(0, Math.round((todayUtcMs - lastUtcMs) / 86400000));

        let itemBand: 'up_to_30' | '31_to_60' | '61_to_90' | 'over_90' = 'up_to_30';
        if (daysSinceLast <= 30) itemBand = 'up_to_30';
        else if (daysSinceLast <= 60) itemBand = '31_to_60';
        else if (daysSinceLast <= 90) itemBand = '61_to_90';
        else itemBand = 'over_90';

        // Resolve periodicidade recomendada (em dias): paciente > serviço > lembrete do serviço > sem prazo
        let recommendedDays: number | null = null;
        let periodicitySource: 'patient' | 'service' | 'none' = 'none';

        if (last.patient_periodicity_days !== null && last.patient_periodicity_days !== undefined) {
          const pDays = Number(last.patient_periodicity_days);
          if (pDays > 0) {
            recommendedDays = pDays;
            periodicitySource = 'patient';
          } else {
            recommendedDays = null;
            periodicitySource = 'none';
          }
        } else if (last.service_periodicity_days !== null && last.service_periodicity_days !== undefined && Number(last.service_periodicity_days) > 0) {
          recommendedDays = Number(last.service_periodicity_days);
          periodicitySource = 'service';
        } else if (last.reminder_enabled === 1 && last.reminder_value && Number(last.reminder_value) > 0) {
          const val = Number(last.reminder_value);
          const unit = String(last.reminder_unit || 'DAYS').toUpperCase();
          recommendedDays = unit === 'YEARS' ? val * 365 : unit === 'MONTHS' ? val * 30 : val;
          periodicitySource = 'service';
        }

        let recommendedReturnDate: string | null = null;
        if (recommendedDays && recommendedDays > 0) {
          const recDate = new Date(lastUtcMs);
          recDate.setUTCDate(recDate.getUTCDate() + recommendedDays);
          recommendedReturnDate = recDate.toISOString().slice(0, 10);
        }

        const nextAppt = nextApptByPatient.get(patientIdKey) || null;
        const effectiveFollowUpStatus =
          (last.follow_up_status === 'active' && completedPlansPatients.has(patientIdKey))
            ? 'completed'
            : (last.follow_up_status || 'active');

        const isDischargedOrCompleted =
          effectiveFollowUpStatus === 'discharged' || effectiveFollowUpStatus === 'completed';

        let nextAppointmentSituation: 'scheduled' | 'treatment_completed' | 'return_pending' | 'within_period' | 'no_deadline' = 'no_deadline';
        let nextAppointmentStatusLabel = 'Sem prazo de retorno definido';
        let needsFollowUpContact = false;

        if (isDischargedOrCompleted) {
          nextAppointmentSituation = 'treatment_completed';
          nextAppointmentStatusLabel = effectiveFollowUpStatus === 'discharged'
            ? 'Alta / Acompanhamento encerrado'
            : 'Tratamento concluído';
          needsFollowUpContact = false;
        } else if (nextAppt) {
          nextAppointmentSituation = 'scheduled';
          nextAppointmentStatusLabel = `Agendado para ${String(nextAppt.start_time).slice(0, 10).split('-').reverse().join('/')}`;
          needsFollowUpContact = false;
        } else if (recommendedDays && recommendedDays > 0) {
          if (daysSinceLast >= recommendedDays) {
            nextAppointmentSituation = 'return_pending';
            nextAppointmentStatusLabel = 'Sugestão de contato (prazo atingido)';
            needsFollowUpContact = true;
          } else {
            nextAppointmentSituation = 'within_period';
            nextAppointmentStatusLabel = 'Dentro do prazo recomendado';
            needsFollowUpContact = false;
          }
        } else {
          nextAppointmentSituation = 'no_deadline';
          nextAppointmentStatusLabel = 'Sem agendamento futuro (sem prazo fixo)';
          needsFollowUpContact = false;
        }

        bandCounts.all++;
        bandCounts[itemBand]++;

        if (band && band !== 'all' && itemBand !== band) continue;
        if (situation && situation !== 'all' && nextAppointmentSituation !== situation) continue;

        items.push({
          patientId: patientIdKey,
          patientName: last.patient_name,
          patientPhone: last.patient_phone || null,
          patientEmail: last.patient_email || null,
          lastAppointmentId: last.appointment_id,
          lastAppointmentDate: lastDateIso,
          lastAppointmentTime: last.start_time,
          daysSinceLastAttendance: daysSinceLast,
          band: itemBand,
          bandLabel:
            itemBand === 'up_to_30' ? 'Até 30 dias' :
            itemBand === '31_to_60' ? '31 a 60 dias' :
            itemBand === '61_to_90' ? '61 a 90 dias' : 'Mais de 90 dias',
          professionalId: last.professional_id,
          professionalName: last.professional_name,
          professionName: last.profession_name,
          specialtyName: last.specialty_name || null,
          serviceId: last.service_id,
          serviceName: last.service_name || 'Atendimento',
          recommendedPeriodicityDays: recommendedDays,
          periodicitySource,
          recommendedReturnDate,
          followUpStatus: effectiveFollowUpStatus,
          followUpNotes: last.follow_up_notes || null,
          nextAppointment: nextAppt ? {
            id: nextAppt.id,
            startTime: nextAppt.start_time,
            date: String(nextAppt.start_time).slice(0, 10),
            professionalName: nextAppt.professional_name,
            serviceName: nextAppt.service_name || 'Atendimento'
          } : null,
          nextAppointmentSituation,
          nextAppointmentStatusLabel,
          needsFollowUpContact
        });
      }

      // Ordena priorizando quem precisa de acompanhamento / maior tempo desde último atendimento
      items.sort((a, b) => {
        if (a.needsFollowUpContact !== b.needsFollowUpContact) {
          return a.needsFollowUpContact ? -1 : 1;
        }
        return b.daysSinceLastAttendance - a.daysSinceLastAttendance;
      });

      const filterProfessionals = db.prepare(`
        SELECT p.id, p.name, p.profession_id, p.specialty_id,
               COALESCE(prof.name, p.profession_name) as profession_name,
               COALESCE(p.specialty_custom, spec.name) as specialty_name
        FROM professionals p
        LEFT JOIN professions prof ON prof.id = p.profession_id
        LEFT JOIN specialties spec ON spec.id = p.specialty_id
        WHERE p.tenant_id = ? AND p.active = 1
        ORDER BY p.name ASC
      `).all(tenantId);

      const filterServices = db.prepare(`
        SELECT id, name, professional_id, specialty_id, duration_minutes, return_periodicity_days, reminder_enabled, reminder_value, reminder_unit
        FROM services
        WHERE tenant_id = ? AND active = 1
        ORDER BY name ASC
      `).all(tenantId);

      res.json({
        bandCounts,
        totalMatching: items.length,
        items,
        filters: {
          professionals: filterProfessionals,
          services: filterServices
        }
      });
    } catch (err: any) {
      console.error('[ReportController.getCareContinuityReport] Erro:', err);
      res.status(500).json({ error: 'Erro ao carregar Continuidade do Cuidado' });
    }
  }

  /**
   * Atualiza a periodicidade de retorno e/ou situação do acompanhamento de um paciente.
   */
  static updatePatientContinuityConfig(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId as string;
      const { patientId } = req.params;
      const { returnPeriodicityDays, followUpStatus, followUpNotes } = req.body;

      const existing = db.prepare('SELECT id FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId);
      if (!existing) {
        res.status(404).json({ error: 'Paciente não encontrado nesta clínica' });
        return;
      }

      const validStatuses = ['active', 'completed', 'discharged', 'paused'];
      const nextStatus = followUpStatus && validStatuses.includes(String(followUpStatus))
        ? String(followUpStatus)
        : undefined;

      const parsedDays =
        returnPeriodicityDays === null || returnPeriodicityDays === '' || returnPeriodicityDays === undefined
          ? null
          : Math.max(0, Number(returnPeriodicityDays) || 0);

      db.prepare(`
        UPDATE patients
        SET return_periodicity_days = CASE WHEN ? = 1 THEN ? ELSE return_periodicity_days END,
            follow_up_status = CASE WHEN ? = 1 THEN ? ELSE COALESCE(follow_up_status, 'active') END,
            follow_up_notes = CASE WHEN ? = 1 THEN ? ELSE follow_up_notes END,
            updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(
        returnPeriodicityDays !== undefined ? 1 : 0,
        parsedDays,
        nextStatus !== undefined ? 1 : 0,
        nextStatus || 'active',
        followUpNotes !== undefined ? 1 : 0,
        followUpNotes || null,
        patientId,
        tenantId
      );

      res.json({
        success: true,
        patientId,
        returnPeriodicityDays: parsedDays,
        followUpStatus: nextStatus || 'active',
        message: 'Configuração de continuidade do paciente atualizada com sucesso.'
      });
    } catch (err: any) {
      console.error('[ReportController.updatePatientContinuityConfig] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar configuração de acompanhamento do paciente' });
    }
  }

  /**
   * Atualiza a periodicidade de retorno recomendada para um serviço.
   */
  static updateServiceContinuityConfig(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId as string;
      const { serviceId } = req.params;
      const { returnPeriodicityDays } = req.body;

      const existing = db.prepare('SELECT id FROM services WHERE id = ? AND tenant_id = ?').get(serviceId, tenantId);
      if (!existing) {
        res.status(404).json({ error: 'Serviço não encontrado nesta clínica' });
        return;
      }

      const parsedDays =
        returnPeriodicityDays === null || returnPeriodicityDays === '' || returnPeriodicityDays === undefined || Number(returnPeriodicityDays) <= 0
          ? null
          : Math.max(1, Number(returnPeriodicityDays));

      db.prepare(`
        UPDATE services
        SET return_periodicity_days = ?,
            reminder_enabled = ?,
            reminder_value = ?,
            reminder_unit = 'DAYS',
            updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(
        parsedDays,
        parsedDays ? 1 : 0,
        parsedDays,
        serviceId,
        tenantId
      );

      res.json({
        success: true,
        serviceId,
        returnPeriodicityDays: parsedDays,
        message: 'Periodicidade recomendada do serviço atualizada.'
      });
    } catch (err: any) {
      console.error('[ReportController.updateServiceContinuityConfig] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar periodicidade do serviço' });
    }
  }

  static getFinancialReport(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId as string;
      if (!tenantId || !canUserAccessReportFinancials(req, tenantId)) {
        res.status(403).json({
          error: 'Acesso restrito: seu perfil não possui autorização para relatórios financeiros.',
          code: 'FINANCIAL_REPORT_FORBIDDEN'
        });
        return;
      }

      const { startDate, endDate } = req.query;

      let dateFilter = '';
      const params: any[] = [tenantId];
      if (startDate) {
        const sVal = String(startDate).length === 10 ? `${startDate} 00:00:00` : String(startDate);
        dateFilter += " AND REPLACE(pay.created_at, 'T', ' ') >= REPLACE(?, 'T', ' ')";
        params.push(sVal);
      }
      if (endDate) {
        const eVal = String(endDate).length === 10 ? `${endDate} 23:59:59` : String(endDate);
        dateFilter += " AND REPLACE(pay.created_at, 'T', ' ') <= REPLACE(?, 'T', ' ')";
        params.push(eVal);
      }

      const byMethodStmt = db.prepare(`
        SELECT 
          payment_method,
          COUNT(*) as count,
          SUM(amount) as total_amount
        FROM payments pay
        WHERE tenant_id = ? AND status = 'paid' ${dateFilter}
        GROUP BY payment_method
      `);
      const byMethod = byMethodStmt.all(...params);

      const byStatusStmt = db.prepare(`
        SELECT 
          status,
          COUNT(*) as count,
          SUM(amount) as total_amount
        FROM payments pay
        WHERE tenant_id = ? ${dateFilter}
        GROUP BY status
      `);
      const byStatus = byStatusStmt.all(...params);

      res.json({ byMethod, byStatus });
    } catch (err: any) {
      console.error('[ReportController.getFinancialReport] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar relatório financeiro' });
    }
  }

  static exportCsv(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId as string;
      const { type } = req.query; // 'appointments' | 'payments'

      if (!tenantId || isUserReceptionOnly(req, tenantId)) {
        res.status(403).json({
          error: 'Acesso restrito: exportações gerenciais não estão disponíveis para a recepção.',
          code: 'EXPORT_REPORT_FORBIDDEN'
        });
        return;
      }

      if (type === 'payments') {
        if (!tenantId || !canUserAccessReportFinancials(req, tenantId)) {
          res.status(403).json({
            error: 'Acesso restrito: seu perfil não possui permissão para exportar relatórios financeiros.',
            code: 'FINANCIAL_REPORT_FORBIDDEN'
          });
          return;
        }

        const stmt = db.prepare(`
          SELECT 
            pay.created_at as Data,
            pat.full_name as Paciente,
            pay.amount as Valor,
            pay.payment_method as Forma_Pagamento,
            pay.status as Status,
            pay.notes as Observacoes
          FROM payments pay
          JOIN patients pat ON pat.id = pay.patient_id
          WHERE pay.tenant_id = ?
          ORDER BY pay.created_at DESC
        `);
        const rows = stmt.all(tenantId) as any[];

        let csv = 'Data,Paciente,Valor,Forma_Pagamento,Status,Observacoes\n';
        for (const r of rows) {
          csv += `"${r.Data}","${r.Paciente}","${r.Valor}","${r.Forma_Pagamento}","${r.Status}","${r.Observacoes || ''}"\n`;
        }

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="relatorio-financeiro.csv"');
        res.send(csv);
        return;
      }

      // Default: Appointments CSV (Operacional)
      const stmt = db.prepare(`
        SELECT 
          a.appointment_number as Codigo,
          a.start_time as Inicio,
          a.end_time as Fim,
          pat.full_name as Paciente,
          p.name as Profissional,
          s.name as Servico,
          a.status as Status,
          a.modality as Modalidade
        FROM appointments a
        JOIN patients pat ON pat.id = a.patient_id
        JOIN professionals p ON p.id = a.professional_id
        LEFT JOIN services s ON s.id = a.service_id
        WHERE a.tenant_id = ?
        ORDER BY a.start_time DESC
      `);
      const rows = stmt.all(tenantId) as any[];

      let csv = 'Codigo,Inicio,Fim,Paciente,Profissional,Servico,Status,Modalidade\n';
      for (const r of rows) {
        csv += `"${r.Codigo}","${r.Inicio}","${r.Fim}","${r.Paciente}","${r.Profissional}","${r.Servico}","${r.Status}","${r.Modalidade}"\n`;
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="relatorio-atendimentos.csv"');
      res.send(csv);
    } catch (err: any) {
      console.error('[ReportController.exportCsv] Erro:', err);
      res.status(500).json({ error: 'Erro ao exportar arquivo CSV' });
    }
  }

  static exportDocx(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId as string;
      if (!tenantId) {
        res.status(401).json({ error: 'Tenant não informado' });
        return;
      }
      const { type, patientId } = req.query; // 'patient_records' | 'attendance' | 'financial'

      // Se for exportação de prontuário do paciente (OpenXML ECMA-376 Autêntico):
      if (type === 'patient_records') {
        const pId = patientId as string;
        if (!pId) {
          res.status(400).json({ error: 'ID do paciente é obrigatório para exportação do prontuário.' });
          return;
        }

        if (!hasClinicalAccess(req, pId)) {
          res.status(403).json({
            error: 'Acesso clínico restrito: profissional não possui vínculo assistencial com este paciente (Sigilo LGPD).',
            code: 'CLINICAL_PRIVACY_RESTRICTION'
          });
          return;
        }

        const data = ClinicalExportService.fetchFullClinicalData(tenantId, pId);
        if (!data || !data.patient) {
          res.status(404).json({ error: 'Paciente não encontrado para exportação.' });
          return;
        }

        const docxBuffer = ClinicalExportService.generateDocxBuffer(data);
        const fileName = `Prontuario_${(data.patient.full_name || data.patient.name || 'Paciente').replace(/[^a-zA-Z0-9_\-]/g, '_')}.docx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.send(docxBuffer);
        return;
      }

      const clinic = db.prepare('SELECT name, trade_name, cnpj_cpf, phone, email, street, number, neighborhood, city, state, address FROM tenants WHERE id = ?').get(tenantId) as any;
      const clinicName = clinic?.trade_name || clinic?.name || 'Clínica Emissora';
      const clinicAddress = clinic?.address || [
        [clinic?.street, clinic?.number].filter(Boolean).join(', '),
        clinic?.neighborhood,
        (clinic?.city && clinic?.state) ? `${clinic.city}/${clinic.state}` : (clinic?.city || '')
      ].filter(Boolean).join(' - ') + (clinic?.phone ? ` | Tel: ${clinic.phone}` : '');

      const title = 'Relatório Geral de Atendimentos';
      const appts = db.prepare(`
        SELECT 
          a.appointment_number, a.start_time, a.status, a.modality,
          pat.full_name as patient_name,
          p.name as professional_name,
          s.name as service_name
        FROM appointments a
        JOIN patients pat ON pat.id = a.patient_id
        JOIN professionals p ON p.id = a.professional_id
        LEFT JOIN services s ON s.id = a.service_id
        WHERE a.tenant_id = ?
        ORDER BY a.start_time DESC
        LIMIT 200
      `).all(tenantId) as any[];

      const contentHtml = `
        <table>
          <thead>
            <tr><th>Código</th><th>Data / Hora</th><th>Paciente</th><th>Profissional</th><th>Serviço</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${appts.map(a => `<tr><td><strong>${a.appointment_number}</strong></td><td>${a.start_time}</td><td>${a.patient_name}</td><td>${a.professional_name}</td><td>${a.service_name || 'Atendimento'}</td><td>${a.status}</td></tr>`).join('')}
          </tbody>
        </table>
      `;

      const docxHtml = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <meta charset='utf-8'>
          <title>${title}</title>
          <!--[if gte mso 9]>
          <xml>
            <w:WordDocument>
              <w:View>Print</w:View>
              <w:Zoom>100</w:Zoom>
              <w:DoNotOptimizeForBrowser/>
            </w:WordDocument>
          </xml>
          <![endif]-->
          <style>
            @page Section1 { size: 595.3pt 841.9pt; margin: 45pt 45pt 45pt 45pt; }
            div.Section1 { page: Section1; font-family: 'Segoe UI', Calibri, Arial, sans-serif; font-size: 11pt; color: #1e293b; }
            h1 { color: #0284c7; font-size: 18pt; margin: 0 0 6pt 0; }
            h2 { color: #0f172a; font-size: 13pt; margin: 12pt 0 6pt 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 10pt; }
            th, td { border: 1px solid #cbd5e1; padding: 7pt; text-align: left; font-size: 10pt; }
            th { background-color: #f1f5f9; font-weight: bold; color: #1e293b; }
            .header-box { border-bottom: 2px solid #0284c7; padding-bottom: 12pt; margin-bottom: 16pt; }
            .clinic-title { font-size: 16pt; font-weight: bold; color: #0f172a; margin: 0; }
            .clinic-sub { font-size: 9.5pt; color: #64748b; margin: 4pt 0 0 0; }
            .footer-box { border-top: 1px solid #cbd5e1; margin-top: 30pt; padding-top: 12pt; font-size: 8.5pt; color: #94a3b8; text-align: center; }
          </style>
        </head>
        <body>
          <div class="Section1">
            <div class="header-box">
              <div class="clinic-title">${clinicName}</div>
              <div class="clinic-sub">${clinicAddress}</div>
            </div>
            <h1>${title}</h1>
            <p style="color: #64748b; font-size: 9.5pt;">Documento emitido eletronicamente em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</p>
            ${contentHtml}
            <div class="footer-box">
              <p>Documento emitido eletronicamente pelo Sistema Zemda</p>
              <p>Documento de conferência e registro clínico oficial. Impresso sob responsabilidade do profissional emissor.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      res.setHeader('Content-Type', 'application/vnd.ms-word; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${title.replace(/\s+/g, '_')}.docx"`);
      res.send(docxHtml);
    } catch (err: any) {
      console.error('[ReportController.exportDocx] Erro:', err);
      res.status(500).json({ error: 'Erro ao exportar arquivo DOCX' });
    }
  }
}
