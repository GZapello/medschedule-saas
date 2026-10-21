import { Request } from 'express';
import { db } from '../config/database';

export class DocumentContextError extends Error {
  constructor(message:string,public status=400) {super(message);}
}

export function extractDatePart(isoOrDate: unknown): string | null {
  if (typeof isoOrDate !== 'string') return null;
  const m = isoOrDate.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export function extractTimePart(isoOrTime: unknown): string | null {
  if (typeof isoOrTime !== 'string') return null;
  const trimmed = isoOrTime.trim();
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) return trimmed;
  if (/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d/.test(trimmed)) return trimmed.slice(0, 5);
  const m = trimmed.match(/[T ](\d{2}:\d{2})(?::|$)/);
  return m && /^([01]\d|2[0-3]):[0-5]\d$/.test(m[1]) ? m[1] : null;
}

export function normalizeLocalDateTimeIso(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(' ', 'T');
  const m = trimmed.match(/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?/);
  if (!m) return null;
  return `${m[1]}T${m[2]}:${m[3]}:${m[4] || '00'}`;
}

export function getClinicLocalNowIso(now: Date = new Date(), timeZone = 'America/Sao_Paulo'): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(now);
    const get = (type: string) => parts.find(p => p.type === type)?.value || '00';
    const hour = get('hour') === '24' ? '00' : get('hour');
    return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}`;
  } catch {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }
}

export function addMinutesToLocalIso(isoStr: string, durationMinutes: number): string {
  const normalized = normalizeLocalDateTimeIso(isoStr);
  if (!normalized) return isoStr;
  const [datePart, timePart] = normalized.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm, ss] = timePart.split(':').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, hh, mm + (Number(durationMinutes) || 0), ss || 0));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:${pad(dt.getUTCSeconds())}`;
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
  db.prepare(`UPDATE ${table} SET attendance_date=?,attendance_time=?,attendance_end_time=?,source_record_id=?,attendance_context_version=1 WHERE id=? AND tenant_id=?`)
    .run(context.sessionDate,context.sessionTime,context.sessionEndTime ?? null,context.recordId,id,tenantId);
}

export function recordedAttendance(appointment:any,record:any) {
  // Missing time in a record is authoritative for imported/historical records when no real attendance_start_at was set.
  // Priority:
  // 1. record.session_date, record.session_time, record.session_end_time (when record exists)
  // 2. appointment.attendance_start_at / appointment.attendance_end_at (real attendance time)
  // 3. appointment.start_time (scheduled start time fallback - NEVER use attendance_expected_end_at or appointment.end_time as real end time)
  const realStart = appointment?.attendance_start_at;
  const realEnd = appointment?.attendance_end_at;
  const schedStart = appointment?.start_time;

  if (record) {
    const sessionDate = extractDatePart(record.session_date) || extractDatePart(realStart) || extractDatePart(schedStart);
    const recTime = extractTimePart(record.session_time);
    const recEndTime = extractTimePart(record.session_end_time);
    const isImportedWithoutTime = !recTime && !realStart;
    const sessionTime = recTime || (!isImportedWithoutTime ? extractTimePart(realStart) : null);
    const sessionEndTime = recEndTime || (!isImportedWithoutTime && sessionTime ? extractTimePart(realEnd) : null);
    return { sessionDate, sessionTime, sessionEndTime };
  }

  const sessionDate = extractDatePart(realStart) || extractDatePart(schedStart);
  const sessionTime = extractTimePart(realStart) || extractTimePart(schedStart);
  const sessionEndTime = sessionTime ? extractTimePart(realEnd) : null;
  return { sessionDate, sessionTime, sessionEndTime };
}

export function appointmentRecord(tenantId:string,patientId:string,appointmentId:string) {
  return db.prepare(`SELECT * FROM records WHERE appointment_id=? AND tenant_id=? AND patient_id=?
    ORDER BY CASE WHEN module_type IN ('Zemda360','ZemdaBody') THEN 1 ELSE 0 END,updated_at DESC,created_at DESC,rowid DESC LIMIT 1`)
    .get(appointmentId,tenantId,patientId);
}
