import type { Request } from 'express';
import { db } from '../config/database';
import { validateModuleAccess } from '../controllers/clinical-draft.controller';
import { CapabilityService } from './capability.service';

export function dashboardWorklist(req: Request, today: string) {
  const tenant = req.tenantId!;
  const role = req.user?.role;
  const own = role === 'professional';
  const clinical = role === 'professional' || role === 'clinic_admin';
  const filter = own ? ' AND a.professional_id IN (SELECT id FROM professionals WHERE tenant_id = ? AND user_id = ? AND active = 1)' : '';
  const params = own ? [tenant, tenant, req.user!.userId] : [tenant];
  const unfinished = db.prepare(`SELECT a.id, a.patient_id, p.full_name AS patient_name, a.start_time, a.clinical_module
    FROM appointments a JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
    WHERE a.tenant_id = ? ${filter} AND a.status = 'in_progress' ORDER BY a.start_time LIMIT 20`).all(...params);
  const drafts = clinical ? (db.prepare(`SELECT a.patient_id, a.appointment_id, a.module_type, a.updated_at, p.full_name AS patient_name
    FROM clinical_drafts a JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
    WHERE a.tenant_id = ? ${filter} ORDER BY a.updated_at DESC LIMIT 50`).all(...params) as any[])
    .filter(row => validateModuleAccess(req, row.module_type, row.patient_id)).slice(0, 10) : [];

  let canViewExams = role === 'clinic_admin';
  if (!canViewExams && req.user?.userId && tenant) {
    const hasExamCap = CapabilityService.hasCapability(req.user.userId, tenant, 'CORE_EXAMS_RECEIVED') ||
                       CapabilityService.hasCapability(req.user.userId, tenant, 'CORE_EXAM_REQUEST');
    if (hasExamCap) {
      canViewExams = true;
    } else {
      const cu = db.prepare('SELECT permissions_json FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenant) as any;
      if (cu?.permissions_json) {
        try {
          const perms = JSON.parse(cu.permissions_json);
          if (Array.isArray(perms) && perms.includes('view_exams')) {
            canViewExams = true;
          }
        } catch {}
      }
    }
  }

  const examWhere = `a.tenant_id = ? ${filter} AND a.status IN ('waiting', 'delayed')`;
  const exams = canViewExams ? db.prepare(`SELECT a.id, a.patient_id, p.full_name AS patient_name, a.exam_name, a.expected_date, a.status
    FROM pending_exams a JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
    WHERE ${examWhere} ORDER BY a.expected_date IS NULL, a.expected_date LIMIT 10`).all(...params) : [];
  const examCount = canViewExams ? (db.prepare(`SELECT COUNT(*) AS count FROM pending_exams a WHERE ${examWhere}`).get(...params) as any).count : 0;
  const returns = db.prepare(`SELECT a.id, a.patient_id, p.full_name AS patient_name, a.start_time, a.status
    FROM appointments a JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
    WHERE a.tenant_id = ? ${filter} AND a.patient_notes = 'Consulta de Retorno' AND a.status IN ('scheduled', 'confirmed')
    AND date(a.start_time) <= date(?, '+7 days') ORDER BY a.start_time LIMIT 10`).all(...params, today);
  const alerts = clinical ? db.prepare(`SELECT DISTINCT p.id AS patient_id, p.full_name AS patient_name, al.agent, al.reaction
    FROM patient_allergies al JOIN patients p ON p.id = al.patient_id AND p.tenant_id = al.tenant_id
    JOIN appointments a ON a.patient_id = p.id AND a.tenant_id = p.tenant_id
    WHERE a.tenant_id = ? ${filter} AND date(a.start_time) = ? AND al.status = 'active' AND al.is_no_known_allergies = 0
    ORDER BY p.full_name LIMIT 20`).all(...params, today) : [];
  const finance = role === 'clinic_admin' ? db.prepare(`SELECT
    COALESCE(SUM(CASE WHEN pay.status = 'paid' THEN pay.amount ELSE 0 END), 0) AS received,
    COALESCE(SUM(CASE WHEN pay.status IN ('pending','partial') THEN pay.amount ELSE 0 END), 0) AS pending
    FROM payments pay LEFT JOIN appointments a ON a.id = pay.appointment_id AND a.tenant_id = pay.tenant_id
    WHERE pay.tenant_id = ? AND (date(a.start_time) = ? OR date(pay.payment_date) = ?)`).get(tenant, today, today) : undefined;
  return { unfinished, drafts, exams, examCount, returns, alerts, finance };
}
