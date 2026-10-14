import { Request, Response } from 'express';
import { db } from '../../config/database';
import { CapabilityService } from '../../services/capability.service';
import { assessmentCapabilities, fieldCapability, projectClinicalData } from './policy';

/** Every transport (including legacy Personal URLs) uses this same clinical boundary. */
export function authorizeAssessment(req: Request, res: Response, personal: boolean, required?: string): boolean {
  const deny = (status: number, error: string) => { res.status(status).json({error}); return false; };
  if (!req.user || !req.tenantId) return deny(401, 'Não autenticado');
  if (!['professional','clinic_admin'].includes(req.user.role)) return deny(403, 'Acesso clínico não autorizado');
  for (const id of [req.params.id,req.params.compareId].filter(Boolean)) {
    if(!db.prepare('SELECT id FROM personal_assessments WHERE id=? AND tenant_id=?').get(id,req.tenantId)) return deny(404,'Avaliação não encontrada');
  }
  const requestedPatient=req.params.studentId || req.params.patientId || req.body?.patient_id;
  if(requestedPatient && !db.prepare('SELECT id FROM patients WHERE id=? AND tenant_id=?').get(requestedPatient,req.tenantId))return deny(404,'Paciente não encontrado');
  const membership = db.prepare('SELECT status,role FROM clinic_users WHERE user_id=? AND tenant_id=?').get(req.user.userId, req.tenantId) as any;
  const professional = db.prepare('SELECT id,active,profession_id FROM professionals WHERE user_id=? AND tenant_id=?').get(req.user.userId,req.tenantId) as any;
  if (membership && (membership.status !== 'active' || !['professional','clinic_admin'].includes(membership.role))) return deny(403,'Vínculo clínico inativo');
  if (professional && !professional.active) return deny(403,'Profissional inativo');
  if (!membership && !professional && !db.prepare("SELECT id FROM users WHERE id=? AND tenant_id=? AND role='clinic_admin' AND status='active'").get(req.user.userId,req.tenantId)) return deny(403,'Profissional sem vínculo com a clínica');
  const caps = personal ? assessmentCapabilities : CapabilityService.computeUserCapabilities(req.user.userId,req.tenantId).activeCapabilities;
  if (required ? !caps.includes(required) : !assessmentCapabilities.some(c=>caps.includes(c))) return deny(403,'Recurso clínico não habilitado para sua profissão');
  (req as any).clinicalAssessmentCapabilities=caps;
  const ids = [req.params.id,req.params.compareId].filter(Boolean);
  let patientId: any = req.params.studentId || req.params.patientId || req.body?.patient_id;
  for (const id of ids) {
    const row = db.prepare('SELECT patient_id FROM personal_assessments WHERE id=? AND tenant_id=?').get(id,req.tenantId) as any;
    if (!row) return deny(404,'Avaliação não encontrada');
    if (patientId && patientId !== row.patient_id) return deny(400,'Avaliações de pacientes diferentes');
    if(req.method==='DELETE' && !personal) {
      const assessment=db.prepare('SELECT * FROM personal_assessments WHERE id=? AND tenant_id=?').get(id,req.tenantId) as any;
      if(Object.entries(assessment).some(([key,value])=>value!=null && value!=='' && fieldCapability(key) && !caps.includes(fieldCapability(key)!))) return deny(403,'A avaliação contém recursos que você não pode excluir');
    }
    patientId = row.patient_id;
  }
  if (patientId) {
    if (!db.prepare('SELECT id FROM patients WHERE id=? AND tenant_id=?').get(patientId,req.tenantId)) return deny(404,'Paciente não encontrado');
    // Personal retains its existing clinic-wide student directory. Other clinicians
    // need a care relationship; managers retain clinic-wide clinical supervision.
    if (!personal && req.user.role !== 'clinic_admin') {
      if (!professional || !db.prepare(`SELECT 1 FROM appointments WHERE tenant_id=? AND patient_id=? AND professional_id=?
        UNION ALL SELECT 1 FROM personal_assessments WHERE tenant_id=? AND patient_id=? AND professional_id=? LIMIT 1`).get(req.tenantId,patientId,professional.id,req.tenantId,patientId,professional.id)) return deny(403,'Paciente sem vínculo de atendimento com este profissional');
    }
  }
  const appointmentId=req.body?.appointment_id;
  if (appointmentId && !db.prepare(`SELECT id FROM appointments WHERE id=? AND tenant_id=? AND patient_id=? AND (professional_id=? OR ?='clinic_admin')`).get(appointmentId,req.tenantId,patientId,professional?.id || '',req.user.role)) return deny(400,'Agendamento incompatível com o contexto clínico');
  for (const [key,value] of Object.entries(req.body || {})) {
    const cap=fieldCapability(key);
    if (cap && !caps.includes(cap)) {
      if (value != null && value !== '' && !(Array.isArray(value) && !value.length)) return deny(403,`Capability necessária: ${cap}`);
      delete req.body[key];
    }
  }
  if(req.body?.photos != null && (!Array.isArray(req.body.photos) || req.body.photos.some((photo:any)=>!photo || typeof photo!=='object'))) return deny(400,'Fotos inválidas');
  if (req.body?.photos) for (const photo of req.body.photos) {
    const id=photo.file_id || photo.fileId;
    const attachment=id && db.prepare("SELECT id,patient_id,uploaded_by FROM file_attachments WHERE id=? AND clinic_id=? AND mime_type LIKE 'image/%'").get(id,req.tenantId) as any;
    const ownUnassigned=attachment && !attachment.patient_id && attachment.uploaded_by===req.user.userId && !db.prepare('SELECT id FROM personal_assessment_photos WHERE file_id=? AND tenant_id=? AND patient_id<>?').get(id,req.tenantId,patientId);
    if (!attachment || attachment.patient_id!==patientId && !ownUnassigned) return deny(400,'Foto incompatível com o paciente');
  }
  for (const key of ['mobility_json','pain_json','functional_json','gait_json']) if(req.body?.[key] != null) {
    try { const value=JSON.parse(req.body[key]); if(typeof value !== 'object' || value===null || Array.isArray(value) || JSON.stringify(value).length>20000) throw new Error(); }
    catch { return deny(400,'Dados funcionais inválidos'); }
  }
  // Context is resolved from the authenticated profession, never from caller-supplied IDs.
  if(req.method==='POST' && req.body?.patient_id) {
    const context=CapabilityService.computeUserCapabilities(req.user.userId,req.tenantId);
    req.body.profession_id=professional?.profession_id || context.professionId;
    if(!personal) req.body.source_module=context.commercialModule && context.commercialModule!=='ZemdaGestao' ? context.commercialModule : 'general';
  }
  if (!personal) {
    const json=res.json.bind(res);
    res.json=((value:any)=>json(projectClinicalData(value,caps))) as any;
  }
  return true;
}
