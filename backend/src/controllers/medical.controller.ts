import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';
import { hasClinicalAccess } from './clinical.controller';
import { CapabilityService } from '../services/capability.service';
import { resolveCanonicalProfession } from '../utils/profession-module';

export function isMedicalProfessionalOrClinicManager(req: Request): boolean {
  if (!req.user || !req.tenantId) return false;

  // Papéis estritamente não-clínicos não têm acesso aos prontuários médicos
  const roleStr = req.user.role as string;
  if (roleStr === 'receptionist' || roleStr === 'financial' || roleStr === 'secretary' || roleStr === 'assistant') {
    return false;
  }

  // SuperAdmin fora do sandbox tem acesso de suporte/auditoria
  if (req.user.role === 'superadmin' && !(req as any).isSandboxSession) return true;

  // Validação por capability
  if (CapabilityService.hasCapability(req.user.userId, req.tenantId, 'MEDICAL_BASE')) {
    return true;
  }

  // Fallback seguro: verifica se o usuário ou o profissional vinculado é médico ou possui ZemdaMed habilitado
  const user = db.prepare(`
    SELECT u.profession_id, u.profession_name, u.zemda_med_enabled,
           p.profession_id as p_prof_id, pr.slug as p_slug, pr.name as p_name,
           cu.profession_custom, cu.zemda_med_enabled as cu_zemda_med_enabled
    FROM users u
    LEFT JOIN clinic_users cu ON cu.user_id = u.id AND cu.tenant_id = ?
    LEFT JOIN professionals p ON p.user_id = u.id AND p.tenant_id = ?
    LEFT JOIN professions pr ON pr.id = p.profession_id
    WHERE u.id = ?
  `).get(req.tenantId, req.tenantId, req.user.userId) as any;

  if (user) {
    if (user.zemda_med_enabled === 1 || user.cu_zemda_med_enabled === 1) return true;
    const profKey = user.p_prof_id || user.profession_id || user.profession_custom || '';
    const profName = user.p_name || user.profession_name || '';
    const resolution = resolveCanonicalProfession({ id: profKey, name: profName, slug: user.p_slug });
    if (resolution.commercialModule === 'ZemdaMed' || resolution.canonicalId === 'prof-medico') {
      return true;
    }
  }

  return false;
}

export class MedicalController {
  /**
   * 1. Listar consultas médicas do paciente
   */
  public static listConsultationsByPatient(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;

      if (!req.user || !tenantId) {
        res.status(401).json({ error: 'Não autorizado' });
        return;
      }

      if (!isMedicalProfessionalOrClinicManager(req)) {
        res.status(403).json({
          error: 'Acesso restrito: este recurso é exclusivo para médicos cadastrados no ZemdaMed.',
          code: 'MEDICAL_RESTRICTED'
        });
        return;
      }

      if (!hasClinicalAccess(req, patientId)) {
        res.status(403).json({
          error: 'Acesso clínico restrito: profissional sem vínculo assistencial com o paciente (Sigilo LGPD).',
          code: 'CLINICAL_PRIVACY_RESTRICTION'
        });
        return;
      }

      const stmt = db.prepare(`
        SELECT mc.*, p.name as professional_name, p.registration_type, p.registration_number
        FROM medical_consultations mc
        JOIN professionals p ON p.id = mc.professional_id
        WHERE mc.patient_id = ? AND mc.tenant_id = ?
        ORDER BY mc.created_at DESC
      `);

      const rows = stmt.all(patientId, tenantId) as any[];
      const consultations = rows.map(r => ({
        ...r,
        vitalSigns: r.vital_signs_json ? JSON.parse(r.vital_signs_json) : null,
        physicalExam: r.physical_exam_json ? JSON.parse(r.physical_exam_json) : null,
        neurologicalExam: r.neurological_exam_json ? JSON.parse(r.neurological_exam_json) : null,
        diagnosticHypotheses: r.diagnostic_hypotheses_json ? JSON.parse(r.diagnostic_hypotheses_json) : [],
        soapNotes: r.soap_notes_json ? JSON.parse(r.soap_notes_json) : null
      }));

      res.json(consultations);
    } catch (err: any) {
      console.error('[MedicalController.listConsultationsByPatient] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar consultas médicas' });
    }
  }

  /**
   * 2. Obter consulta médica por ID
   */
  public static getConsultationById(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      if (!req.user || !tenantId) {
        res.status(401).json({ error: 'Não autorizado' });
        return;
      }

      if (!isMedicalProfessionalOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao ZemdaMed' });
        return;
      }

      const row = db.prepare(`
        SELECT mc.*, p.name as professional_name, p.registration_type, p.registration_number
        FROM medical_consultations mc
        JOIN professionals p ON p.id = mc.professional_id
        WHERE mc.id = ? AND mc.tenant_id = ?
      `).get(id, tenantId) as any;

      if (!row) {
        res.status(404).json({ error: 'Consulta médica não encontrada' });
        return;
      }

      const consultation = {
        ...row,
        vitalSigns: row.vital_signs_json ? JSON.parse(row.vital_signs_json) : null,
        physicalExam: row.physical_exam_json ? JSON.parse(row.physical_exam_json) : null,
        neurologicalExam: row.neurological_exam_json ? JSON.parse(row.neurological_exam_json) : null,
        diagnosticHypotheses: row.diagnostic_hypotheses_json ? JSON.parse(row.diagnostic_hypotheses_json) : [],
        soapNotes: row.soap_notes_json ? JSON.parse(row.soap_notes_json) : null
      };

      res.json(consultation);
    } catch (err: any) {
      console.error('[MedicalController.getConsultationById] Erro:', err);
      res.status(500).json({ error: 'Erro ao obter consulta médica' });
    }
  }

  /**
   * 3. Criar nova consulta médica
   */
  public static createConsultation(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!req.user || !tenantId) {
        res.status(401).json({ error: 'Não autorizado' });
        return;
      }

      if (!isMedicalProfessionalOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito: exclusivo para médicos do ZemdaMed' });
        return;
      }

      const {
        patientId, appointmentId, specialtyPreset, chiefComplaint, hpi,
        pastMedicalHistory, familyHistory, habitsLifestyle, vitalSigns,
        physicalExam, neurologicalExam, diagnosticHypotheses, cidCode,
        cidDescription, clinicalConduct, soapNotes, returnInDays
      } = req.body;

      if (!patientId) {
        res.status(400).json({ error: 'patientId é obrigatório' });
        return;
      }

      let profId: string | null = null;
      if (req.user.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      } else if (req.body.professionalId) {
        profId = req.body.professionalId;
      }

      if (!profId) {
        const fallbackProf = db.prepare('SELECT id FROM professionals WHERE tenant_id = ? LIMIT 1').get(tenantId) as any;
        profId = fallbackProf?.id || null;
      }

      const id = 'med-cons-' + uuidv4().slice(0, 8);

      db.prepare(`
        INSERT INTO medical_consultations (
          id, tenant_id, patient_id, appointment_id, professional_id,
          specialty_preset, chief_complaint, hpi, past_medical_history,
          family_history, habits_lifestyle, vital_signs_json, physical_exam_json,
          neurological_exam_json, diagnostic_hypotheses_json, cid_code,
          cid_description, clinical_conduct, soap_notes_json, return_in_days,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          datetime('now'), datetime('now')
        )
      `).run(
        id, tenantId, patientId, appointmentId || null, profId,
        specialtyPreset || 'clinica-medica', chiefComplaint || null, hpi || null, pastMedicalHistory || null,
        familyHistory || null, habitsLifestyle || null, vitalSigns ? JSON.stringify(vitalSigns) : null, physicalExam ? JSON.stringify(physicalExam) : null,
        neurologicalExam ? JSON.stringify(neurologicalExam) : null, diagnosticHypotheses ? JSON.stringify(diagnosticHypotheses) : null, cidCode || null,
        cidDescription || null, clinicalConduct || null, soapNotes ? JSON.stringify(soapNotes) : null, returnInDays || null
      );

      logAudit(req, 'CREATE_MEDICAL_CONSULTATION', 'medical_consultations', id, { patientId, specialtyPreset });
      res.status(201).json({ id, message: 'Consulta médica registrada com sucesso' });
    } catch (err: any) {
      console.error('[MedicalController.createConsultation] Erro:', err);
      res.status(500).json({ error: 'Erro ao criar consulta médica' });
    }
  }

  /**
   * 4. Finalizar Consulta Médica (Registrando no Prontuário Geral do Paciente)
   */
  public static finishConsultation(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!req.user || !tenantId) {
        res.status(401).json({ error: 'Não autorizado' });
        return;
      }

      if (!isMedicalProfessionalOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao ZemdaMed' });
        return;
      }

      const {
        patientId, appointmentId, clinicalEvolution, conducts, clinicalConduct, title,
        specialtyPreset, chiefComplaint, hpi, vitalSigns, physicalExam,
        neurologicalExam, diagnosticHypotheses, cidCode, cidDescription,
        soapNotes, returnInDays, sessionDate, sessionTime
      } = req.body;

      const finalConduct = conducts || clinicalConduct;

      if (!patientId || (!clinicalEvolution && !soapNotes?.plan && !finalConduct)) {
        res.status(400).json({ error: 'patientId e evolução/conduta são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      } else if (req.body.professionalId) {
        profId = req.body.professionalId;
      }

      const creatorName = req.user?.name || req.user?.email || 'Médico(a)';
      const recordId = 'rec-med-' + uuidv4().slice(0, 8);
      const spDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
      const recDate = sessionDate || spDateStr;
      const recTime = sessionTime || null;
      const recTitle = title || `Consulta Médica — ${specialtyPreset || 'ZemdaMed'}`;

      const fullEvolutionText = clinicalEvolution || (soapNotes ?
        `[SUBJETIVO]\n${soapNotes.subjective || '-'}\n\n[OBJETIVO]\n${soapNotes.objective || '-'}\n\n[AVALIAÇÃO]\n${soapNotes.assessment || '-'}\n\n[PLANO / CONDUTA]\n${soapNotes.plan || '-'}`
        : (finalConduct || 'Consulta médica realizada.'));

      const clinicalPayload = JSON.stringify({
        specialtyPreset,
        chiefComplaint,
        hpi,
        vitalSigns,
        physicalExam,
        neurologicalExam,
        diagnosticHypotheses,
        cidCode,
        cidDescription,
        soapNotes,
        returnInDays,
        conducts: finalConduct,
        moduleType: 'ZemdaMed'
      });

      // 1. Grava no Prontuário Geral do Paciente
      db.prepare(`
        INSERT INTO records (
          id, tenant_id, patient_id, appointment_id, professional_id,
          session_date, title, clinical_evolution, technical_notes, is_sealed, module_type,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'ZemdaMed', datetime('now'), datetime('now'))
      `).run(
        recordId, tenantId, patientId, appointmentId || null, profId,
        recDate, recTitle, fullEvolutionText, clinicalPayload
      );

      // 2. Se houver appointmentId, atualiza status do agendamento
      if (appointmentId) {
        db.prepare(`
          UPDATE appointments
          SET status = 'completed', clinical_module = 'ZemdaMed', updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(appointmentId, tenantId);
      }

      logAudit(req, 'FINISH_MEDICAL_CONSULTATION', 'records', recordId, { patientId, recordId, specialtyPreset });
      res.status(201).json({
        recordId,
        message: 'Consulta médica finalizada com sucesso e gravada no prontuário do paciente'
      });
    } catch (err: any) {
      console.error('[MedicalController.finishConsultation] Erro:', err);
      res.status(500).json({ error: 'Erro ao finalizar consulta médica' });
    }
  }
}
