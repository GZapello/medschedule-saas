import { Request } from 'express';
import { db } from '../config/database';

export class DocumentContextError extends Error {
  constructor(message:string,public status=400) {super(message);}
}
export function resolveDocumentContext(req:Request,input:{patientId:string;professionalId?:string;appointmentId?:string;recordId?:string}) {
  const tenant=req.tenantId;
  if(!tenant || !db.prepare('SELECT 1 FROM patients WHERE id=? AND tenant_id=?').get(input.patientId,tenant))
    throw new DocumentContextError('Paciente não encontrado na clínica ativa.',404);
  const appointment=input.appointmentId ? db.prepare('SELECT * FROM appointments WHERE id=? AND tenant_id=? AND patient_id=?')
    .get(input.appointmentId,tenant,input.patientId) : null;
  if(input.appointmentId && !appointment) throw new DocumentContextError('Atendimento não corresponde ao paciente e à clínica ativa.');
  const record=input.recordId ? db.prepare('SELECT * FROM records WHERE id=? AND tenant_id=? AND patient_id=?')
    .get(input.recordId,tenant,input.patientId) : appointment ? appointmentRecord(tenant!,input.patientId,appointment.id) : null;
  if(input.recordId && (!record || (appointment && record.appointment_id!==appointment.id)))
    throw new DocumentContextError('Prontuário não corresponde ao atendimento selecionado.');
  const contextualProfessional=record?.professional_id || appointment?.professional_id;
  if(contextualProfessional && input.professionalId && input.professionalId!==contextualProfessional)
    throw new DocumentContextError('Profissional não corresponde ao atendimento/prontuário.');
  let professionalId=input.professionalId || contextualProfessional;
  if(!professionalId) professionalId=db.prepare('SELECT id FROM professionals WHERE tenant_id=? AND user_id=? AND active=1').get(tenant,req.user?.userId)?.id;
  if(!professionalId && req.user?.role!=='professional') {
    const candidates=db.prepare('SELECT id FROM professionals WHERE tenant_id=? AND active=1 LIMIT 2').all(tenant);
    if(candidates.length===1) professionalId=candidates[0].id;
  }
  const professional=db.prepare('SELECT * FROM professionals WHERE id=? AND tenant_id=? AND active=1').get(professionalId,tenant);
  if(!professional) throw new DocumentContextError('Selecione o profissional emissor da clínica ativa.');
  if(req.user?.role==='professional' && professional.user_id!==req.user.userId)
    throw new DocumentContextError('Somente o profissional responsável pode emitir este documento.',403);
  return {professionalId:professional.id,recordId:record?.id || null,...recordedAttendance(appointment,record)};
}

export function saveDocumentContext(table:string,id:string,tenantId:string,context:ReturnType<typeof resolveDocumentContext>) {
  if(!['clinical_certificates','clinical_prescriptions','clinical_exam_requests'].includes(table)) throw new Error('Invalid document table');
  db.prepare(`UPDATE ${table} SET attendance_date=?,attendance_time=?,source_record_id=?,attendance_context_version=1 WHERE id=? AND tenant_id=?`)
    .run(context.sessionDate,context.sessionTime,context.recordId,id,tenantId);
}

export function recordedAttendance(appointment:any,record:any) {
  // Missing time in a record is authoritative, including imported history.
  const start=String(appointment?.start_time || '');
  const date=record ? record.session_date : start.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  const time=record ? record.session_time : start.match(/[T ](\d{2}:\d{2})(?::|$)/)?.[1];
  return {sessionDate:typeof date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(date.slice(0,10)) ? date.slice(0,10) : null,
    sessionTime:typeof time==='string' && /^([01]\d|2[0-3]):[0-5]\d/.test(time) ? time.slice(0,5) : null};
}
export function appointmentRecord(tenantId:string,patientId:string,appointmentId:string) {
  return db.prepare(`SELECT * FROM records WHERE appointment_id=? AND tenant_id=? AND patient_id=?
    ORDER BY CASE WHEN module_type IN ('Zemda360','ZemdaBody') THEN 1 ELSE 0 END,updated_at DESC,created_at DESC,rowid DESC LIMIT 1`)
    .get(appointmentId,tenantId,patientId);
}
