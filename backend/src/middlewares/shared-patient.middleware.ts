import { Request, Response, NextFunction } from 'express';
import { db } from '../config/database';
import { canReadSharedRecord } from '../services/patient-sharing.service';

/** Additional boundary for foreign patients; existing role/module checks remain in place. */
export function requireSharedPatientScope(module: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    let patientId=req.params.patientId || req.body?.patientId || req.body?.patient_id || req.query.patientId;
    const appointmentId=req.body?.appointmentId || req.params.appointmentId;
    if (!patientId && typeof appointmentId==='string') patientId=db.prepare('SELECT patient_id FROM appointments WHERE id=? AND tenant_id=?').get(appointmentId,req.tenantId)?.patient_id;
    if (!patientId) { next(); return; }
    if (typeof patientId!=='string') { res.status(400).json({error:'Paciente inválido.'}); return; }
    const patient=db.prepare('SELECT tenant_id FROM patients WHERE id=?').get(patientId);
    if (patient?.tenant_id===req.tenantId) { next(); return; }
    // Reading locally produced history after revocation never authorizes reading source rows.
    const localHistory=req.method==='GET' && db.prepare('SELECT 1 FROM records WHERE tenant_id=? AND patient_id=? LIMIT 1').get(req.tenantId,patientId);
    if (localHistory || (patient && canReadSharedRecord(req,{patient_id:patientId,tenant_id:patient.tenant_id,module_type:module}))) { next(); return; }
    res.status(403).json({error:'Paciente fora do escopo autorizado para este módulo.',code:'SHARED_PATIENT_SCOPE'});
  };
}

/** Minimal identity for a new encounter; never returns administrative source fields. */
export function clinicalPatientIdentity(req: Request, patientId: string, module: string): any {
  const patient=db.prepare('SELECT id,tenant_id,full_name,birth_date,gender,anthropometric_sex FROM patients WHERE id=?').get(patientId);
  if (!patient) return undefined;
  if (patient.tenant_id===req.tenantId || canReadSharedRecord(req,{patient_id:patientId,tenant_id:patient.tenant_id,module_type:module})) return patient;
  return undefined;
}
