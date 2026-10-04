import { Request } from 'express';
import { db } from '../config/database';
import { hasClinicalAccess } from '../controllers/clinical.controller';

/** Consent evidence is patient-scoped, without the general chart's clinic-wide professional fallback. */
export function hasConsentAccess(req: Request, patientId: string): boolean {
  if (!hasClinicalAccess(req,patientId)) return false;
  if (req.user?.role!=='professional') return true;
  const professionals=db.prepare('SELECT id FROM professionals WHERE tenant_id=? AND user_id=? AND active=1').all(req.tenantId,req.user.userId);
  for (const p of professionals) {
    const args=[req.tenantId,patientId,p.id];
    if (db.prepare('SELECT id FROM appointments WHERE tenant_id=? AND patient_id=? AND professional_id=? LIMIT 1').get(...args)
      || db.prepare("SELECT id FROM patient_referrals WHERE tenant_id=? AND patient_id=? AND to_professional_id=? AND status NOT IN ('cancelled','rejected') LIMIT 1").get(...args)
      || db.prepare('SELECT id FROM records WHERE tenant_id=? AND patient_id=? AND professional_id=? LIMIT 1').get(...args)) return true;
    // Specialty assessments and workouts also constitute documented patient relationships.
    for(const table of ['personal_assessments','personal_workouts','physiotherapy_assessments','nutrition_assessments','occupational_therapy_assessments','speech_therapy_assessments']) {
      const cols=new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name));
      if (cols.has('professional_id') && cols.has('patient_id') && cols.has('tenant_id') && db.prepare(`SELECT id FROM ${table} WHERE tenant_id=? AND patient_id=? AND professional_id=? LIMIT 1`).get(...args)) return true;
    }
  }
  return false;
}
