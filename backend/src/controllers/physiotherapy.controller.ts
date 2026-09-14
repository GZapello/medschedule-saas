import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';
import { hasClinicalAccess } from './clinical.controller';

/**
 * Validação de acesso exclusivo para Fisioterapia (Regras 1, 3, 4, 8)
 * Bloqueio REAL no backend:
 * - SuperAdmin: Acesso global de manutenção
 * - ClinicAdmin: Acesso ao ZemdaFisio SOMENTE SE possuir área de atuação ou profissão em Fisioterapia
 * - Professional: Acesso SOMENTE SE for Fisioterapeuta
 * - Outras profissões (médicos, psicólogos, fonoaudiólogos, recepcionistas, etc.): BLOQUEADOS (403)
 */
export function isPhysiotherapistOrClinicManager(req: Request): boolean {
  if (!req.user || !req.tenantId) return false;
  // 1. Administrador Global / Sistema NUNCA pode acessar recursos do ZemdaFisio (Regras 1, 3 e 6)
  if (req.user.role === 'superadmin') return false;

  // Busca dados em professionals (se houver cadastro profissional do usuário)
  const prof = db.prepare(`
    SELECT p.id, p.practice_areas, prof.slug as profession_slug, prof.name as profession_name
    FROM professionals p
    LEFT JOIN professions prof ON prof.id = p.profession_id
    WHERE p.user_id = ? AND p.tenant_id = ?
  `).get(req.user.userId, req.tenantId) as any;

  if (prof) {
    const slug = (prof.profession_slug || '').toLowerCase();
    const name = (prof.profession_name || '').toLowerCase();
    const areas = (prof.practice_areas || '').toLowerCase();
    if (slug.includes('fisio') || name.includes('fisio') || slug.includes('physio') || name.includes('physio') || areas.includes('fisio')) {
      return true;
    }
  }

  // Se for clinic_admin, verifica se há profissão/área de atuação registrada em users, clinic_users ou tenants
  if (req.user.role === 'clinic_admin') {
    const userClinic = db.prepare(`
      SELECT u.profession_name, u.practice_areas as user_practice_areas,
             cu.profession_custom, cu.practice_areas as cu_practice_areas,
             t.manager_profession, t.manager_practice_areas
      FROM users u
      LEFT JOIN clinic_users cu ON cu.user_id = u.id AND cu.tenant_id = ?
      LEFT JOIN tenants t ON t.id = ?
      WHERE u.id = ?
    `).get(req.tenantId, req.tenantId, req.user.userId) as any;

    if (userClinic) {
      const combined = [
        userClinic.profession_custom,
        userClinic.cu_practice_areas,
        userClinic.profession_name,
        userClinic.user_practice_areas,
        userClinic.manager_profession,
        userClinic.manager_practice_areas
      ].filter(Boolean).join(' ').toLowerCase();

      return combined.includes('fisio') || combined.includes('physio');
    }
    return false;
  }

  return false;
}

export class PhysiotherapyController {
  // =========================================================================
  // 1. AVALIAÇÃO FISIOTERAPÊUTICA MODULAR (PRONTUÁRIO)
  // =========================================================================

  static listAssessmentsByPatient(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;

      if (!req.user || !tenantId) {
        res.status(401).json({ error: 'Não autorizado' });
        return;
      }

      if (!isPhysiotherapistOrClinicManager(req)) {
        res.status(403).json({
          error: 'Acesso restrito: este recurso é exclusivo para profissionais de Fisioterapia e administração da clínica.',
          code: 'PHYSIOTHERAPY_RESTRICTED'
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
        SELECT 
          pa.*,
          p.name as professional_name, p.registration_type, p.registration_number,
          spec.name as specialty_name
        FROM physiotherapy_assessments pa
        JOIN professionals p ON p.id = pa.professional_id
        LEFT JOIN specialties spec ON spec.id = pa.specialty_id
        WHERE pa.patient_id = ? AND pa.tenant_id = ?
        ORDER BY pa.created_at DESC
      `);

      const assessments = stmt.all(patientId, tenantId);
      logAudit(req, 'LIST_PHYSIO_ASSESSMENTS', 'physiotherapy_assessments', patientId);
      res.json(assessments);
    } catch (err: any) {
      console.error('[PhysiotherapyController.listAssessmentsByPatient] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar avaliações fisioterapêuticas' });
    }
  }

  static getAssessmentById(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      if (!isPhysiotherapistOrClinicManager(req)) {
        res.status(403).json({
          error: 'Acesso restrito: este recurso é exclusivo para profissionais de Fisioterapia.',
          code: 'PHYSIOTHERAPY_RESTRICTED'
        });
        return;
      }

      const assessment = db.prepare(`
        SELECT 
          pa.*,
          p.name as professional_name, p.registration_type, p.registration_number,
          pat.full_name as patient_name, pat.cpf as patient_cpf, pat.birth_date as patient_birth_date,
          spec.name as specialty_name
        FROM physiotherapy_assessments pa
        JOIN professionals p ON p.id = pa.professional_id
        JOIN patients pat ON pat.id = pa.patient_id
        LEFT JOIN specialties spec ON spec.id = pa.specialty_id
        WHERE pa.id = ? AND pa.tenant_id = ?
      `).get(id, tenantId) as any;

      if (!assessment) {
        res.status(404).json({ error: 'Avaliação fisioterapêutica não encontrada' });
        return;
      }

      if (!hasClinicalAccess(req, assessment.patient_id)) {
        res.status(403).json({ error: 'Acesso restrito ao prontuário deste paciente' });
        return;
      }

      res.json(assessment);
    } catch (err: any) {
      console.error('[PhysiotherapyController.getAssessmentById] Erro:', err);
      res.status(500).json({ error: 'Erro ao buscar avaliação fisioterapêutica' });
    }
  }

  static createAssessment(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isPhysiotherapistOrClinicManager(req)) {
        res.status(403).json({
          error: 'Apenas fisioterapeutas podem registrar avaliação fisioterapêutica.',
          code: 'PHYSIOTHERAPY_RESTRICTED'
        });
        return;
      }

      const {
        patientId, appointmentId, specialtyId,
        chiefComplaint, hpi, pastMedicalHistory, medicalDiagnosis, physioDiagnosis,
        painScore, painLocation, painCharacteristics, inspectionPalpation,
        rangeOfMotion, muscleStrength, postureBalance, gaitMobility,
        functionalLimitations, specificTests, shortTermGoals, longTermGoals,
        treatmentPlan, conductsExercises, guidelines, isSealed,
        bodyMapJson, bodyMapImage
      } = req.body;

      if (!patientId || !chiefComplaint) {
        res.status(400).json({ error: 'Paciente e Queixa Principal são campos obrigatórios' });
        return;
      }

      // Identifica o profissional responsável
      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      } else if (req.body.professionalId) {
        profId = req.body.professionalId;
      } else {
        const firstProf = db.prepare('SELECT id FROM professionals WHERE tenant_id = ? LIMIT 1').get(tenantId) as any;
        if (firstProf) profId = firstProf.id;
      }

      if (!profId) {
        res.status(400).json({ error: 'Profissional fisioterapeuta não identificado' });
        return;
      }

      const id = 'pfa-' + uuidv4().slice(0, 8);
      const creatorName = req.user?.name || req.user?.email || 'Fisioterapeuta';

      db.prepare(`
        INSERT INTO physiotherapy_assessments (
          id, tenant_id, patient_id, professional_id, appointment_id, specialty_id,
          chief_complaint, hpi, past_medical_history, medical_diagnosis, physio_diagnosis,
          pain_score, pain_location, pain_characteristics, inspection_palpation,
          range_of_motion, muscle_strength, posture_balance, gait_mobility,
          functional_limitations, specific_tests, short_term_goals, long_term_goals,
          treatment_plan, conducts_exercises, guidelines, is_sealed,
          body_map_json, body_map_image,
          created_by, updated_by
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?
        )
      `).run(
        id, tenantId, patientId, profId, appointmentId || null, specialtyId || null,
        chiefComplaint, hpi || null, pastMedicalHistory || null, medicalDiagnosis || null, physioDiagnosis || null,
        painScore !== undefined ? Number(painScore) : 0, painLocation || null, painCharacteristics || null, inspectionPalpation || null,
        rangeOfMotion || null, muscleStrength || null, postureBalance || null, gaitMobility || null,
        functionalLimitations || null, specificTests || null, shortTermGoals || null, longTermGoals || null,
        treatmentPlan || null, conductsExercises || null, guidelines || null, isSealed ? 1 : 0,
        bodyMapJson ? (typeof bodyMapJson === 'string' ? bodyMapJson : JSON.stringify(bodyMapJson)) : null,
        bodyMapImage || null,
        creatorName, creatorName
      );

      logAudit(req, 'CREATE_PHYSIO_ASSESSMENT', 'physiotherapy_assessments', id, { patientId });
      res.status(201).json({ id, message: 'Avaliação fisioterapêutica registrada com sucesso' });
    } catch (err: any) {
      console.error('[PhysiotherapyController.createAssessment] Erro:', err);
      res.status(500).json({ error: 'Erro ao registrar avaliação fisioterapêutica' });
    }
  }

  static updateAssessment(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      if (!isPhysiotherapistOrClinicManager(req)) {
        res.status(403).json({
          error: 'Apenas fisioterapeutas podem atualizar avaliação fisioterapêutica.',
          code: 'PHYSIOTHERAPY_RESTRICTED'
        });
        return;
      }

      const existing = db.prepare('SELECT * FROM physiotherapy_assessments WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!existing) {
        res.status(404).json({ error: 'Avaliação não encontrada' });
        return;
      }

      if (existing.is_sealed === 1) {
        res.status(403).json({ error: 'Esta avaliação está lacrada e não pode ser modificada por exigência ética/legal.' });
        return;
      }

      const {
        specialtyId, chiefComplaint, hpi, pastMedicalHistory, medicalDiagnosis, physioDiagnosis,
        painScore, painLocation, painCharacteristics, inspectionPalpation,
        rangeOfMotion, muscleStrength, postureBalance, gaitMobility,
        functionalLimitations, specificTests, shortTermGoals, longTermGoals,
        treatmentPlan, conductsExercises, guidelines, isSealed,
        bodyMapJson, bodyMapImage
      } = req.body;

      const updaterName = req.user?.name || req.user?.email || 'Fisioterapeuta';

      db.prepare(`
        UPDATE physiotherapy_assessments SET
          specialty_id = COALESCE(?, specialty_id),
          chief_complaint = COALESCE(?, chief_complaint),
          hpi = COALESCE(?, hpi),
          past_medical_history = COALESCE(?, past_medical_history),
          medical_diagnosis = COALESCE(?, medical_diagnosis),
          physio_diagnosis = COALESCE(?, physio_diagnosis),
          pain_score = COALESCE(?, pain_score),
          pain_location = COALESCE(?, pain_location),
          pain_characteristics = COALESCE(?, pain_characteristics),
          inspection_palpation = COALESCE(?, inspection_palpation),
          range_of_motion = COALESCE(?, range_of_motion),
          muscle_strength = COALESCE(?, muscle_strength),
          posture_balance = COALESCE(?, posture_balance),
          gait_mobility = COALESCE(?, gait_mobility),
          functional_limitations = COALESCE(?, functional_limitations),
          specific_tests = COALESCE(?, specific_tests),
          short_term_goals = COALESCE(?, short_term_goals),
          long_term_goals = COALESCE(?, long_term_goals),
          treatment_plan = COALESCE(?, treatment_plan),
          conducts_exercises = COALESCE(?, conducts_exercises),
          guidelines = COALESCE(?, guidelines),
          body_map_json = COALESCE(?, body_map_json),
          body_map_image = COALESCE(?, body_map_image),
          is_sealed = CASE WHEN ? = 1 THEN 1 ELSE is_sealed END,
          updated_by = ?,
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(
        specialtyId !== undefined ? specialtyId : null,
        chiefComplaint || null, hpi || null, pastMedicalHistory || null, medicalDiagnosis || null, physioDiagnosis || null,
        painScore !== undefined ? Number(painScore) : null, painLocation || null, painCharacteristics || null, inspectionPalpation || null,
        rangeOfMotion || null, muscleStrength || null, postureBalance || null, gaitMobility || null,
        functionalLimitations || null, specificTests || null, shortTermGoals || null, longTermGoals || null,
        treatmentPlan || null, conductsExercises || null, guidelines || null,
        bodyMapJson !== undefined ? (typeof bodyMapJson === 'string' ? bodyMapJson : JSON.stringify(bodyMapJson)) : null,
        bodyMapImage !== undefined ? bodyMapImage : null,
        isSealed ? 1 : 0, updaterName,
        id, tenantId
      );

      logAudit(req, 'UPDATE_PHYSIO_ASSESSMENT', 'physiotherapy_assessments', id);
      res.json({ message: 'Avaliação atualizada com sucesso' });
    } catch (err: any) {
      console.error('[PhysiotherapyController.updateAssessment] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar avaliação fisioterapêutica' });
    }
  }

  // =========================================================================
  // 2. EVOLUÇÃO FISIOTERAPÊUTICA POR SESSÃO
  // =========================================================================

  static listEvolutionsByPatient(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;

      if (!req.user || !tenantId) {
        res.status(401).json({ error: 'Não autorizado' });
        return;
      }

      if (!isPhysiotherapistOrClinicManager(req)) {
        res.status(403).json({
          error: 'Acesso restrito: este módulo é exclusivo para Fisioterapeutas e gerenciamento da clínica.',
          code: 'PHYSIOTHERAPY_RESTRICTED'
        });
        return;
      }

      if (!hasClinicalAccess(req, patientId)) {
        res.status(403).json({
          error: 'Acesso clínico restrito: sem vínculo com o paciente (Sigilo LGPD).',
          code: 'CLINICAL_PRIVACY_RESTRICTION'
        });
        return;
      }

      const stmt = db.prepare(`
        SELECT 
          pe.*,
          p.name as professional_name, p.registration_type, p.registration_number,
          spec.name as specialty_name
        FROM physiotherapy_evolutions pe
        JOIN professionals p ON p.id = pe.professional_id
        LEFT JOIN specialties spec ON spec.id = pe.specialty_id
        WHERE pe.patient_id = ? AND pe.tenant_id = ?
        ORDER BY pe.session_date DESC, pe.created_at DESC
      `);

      const evolutions = stmt.all(patientId, tenantId);
      logAudit(req, 'LIST_PHYSIO_EVOLUTIONS', 'physiotherapy_evolutions', patientId);
      res.json(evolutions);
    } catch (err: any) {
      console.error('[PhysiotherapyController.listEvolutionsByPatient] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar evoluções fisioterapêuticas' });
    }
  }

  static createEvolution(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isPhysiotherapistOrClinicManager(req)) {
        res.status(403).json({
          error: 'Apenas fisioterapeutas podem registrar evolução fisioterapêutica.',
          code: 'PHYSIOTHERAPY_RESTRICTED'
        });
        return;
      }

      const {
        patientId, appointmentId, specialtyId, sessionDate, sessionTime,
        patientCondition, proceduresPerformed, exercisesPerformed, techniquesUsed,
        clinicalEvolution, treatmentResponse, complications, guidelines,
        nextSessionPlan, notes, isSealed
      } = req.body;

      if (!patientId || !sessionDate || !clinicalEvolution) {
        res.status(400).json({ error: 'Paciente, Data da Sessão e Evolução Clínica são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      } else if (req.body.professionalId) {
        profId = req.body.professionalId;
      } else {
        const firstProf = db.prepare('SELECT id FROM professionals WHERE tenant_id = ? LIMIT 1').get(tenantId) as any;
        if (firstProf) profId = firstProf.id;
      }

      if (!profId) {
        res.status(400).json({ error: 'Profissional fisioterapeuta não identificado' });
        return;
      }

      const id = 'pfe-' + uuidv4().slice(0, 8);
      const creatorName = req.user?.name || req.user?.email || 'Fisioterapeuta';

      db.prepare(`
        INSERT INTO physiotherapy_evolutions (
          id, tenant_id, patient_id, professional_id, appointment_id, specialty_id,
          session_date, session_time, patient_condition, procedures_performed,
          exercises_performed, techniques_used, clinical_evolution, treatment_response,
          complications, guidelines, next_session_plan, notes, is_sealed,
          created_by, updated_by
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?
        )
      `).run(
        id, tenantId, patientId, profId, appointmentId || null, specialtyId || null,
        sessionDate, sessionTime || null, patientCondition || null, proceduresPerformed || null,
        exercisesPerformed || null, techniquesUsed || null, clinicalEvolution, treatmentResponse || null,
        complications || null, guidelines || null, nextSessionPlan || null, notes || null, isSealed ? 1 : 0,
        creatorName, creatorName
      );

      // Sincroniza também na tabela records geral para manter compatibilidade e auditoria jurídica unificada
      try {
        const recId = 'rec-' + id;
        const summaryText = `[ZemdaFisio] ${clinicalEvolution}\nProcedimentos: ${proceduresPerformed || '-'}\nExercícios: ${exercisesPerformed || '-'}`;
        db.prepare(`
          INSERT INTO records (
            id, tenant_id, patient_id, appointment_id, professional_id,
            session_date, title, clinical_evolution, technical_notes, is_sealed, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          recId, tenantId, patientId, appointmentId || null, profId,
          sessionDate, 'Sessão de Fisioterapia', summaryText,
          techniquesUsed ? `Técnicas: ${techniquesUsed}` : null,
          isSealed ? 1 : 0, creatorName
        );
      } catch (syncErr) {
        console.warn('Aviso ao sincronizar evolução com records:', syncErr);
      }

      logAudit(req, 'CREATE_PHYSIO_EVOLUTION', 'physiotherapy_evolutions', id, { patientId, sessionDate });
      res.status(201).json({ id, message: 'Evolução da sessão registrada com sucesso' });
    } catch (err: any) {
      console.error('[PhysiotherapyController.createEvolution] Erro:', err);
      res.status(500).json({ error: 'Erro ao registrar evolução fisioterapêutica' });
    }
  }

  static updateEvolution(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      if (!isPhysiotherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito a fisioterapeutas' });
        return;
      }

      const existing = db.prepare('SELECT id, is_sealed FROM physiotherapy_evolutions WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!existing) {
        res.status(404).json({ error: 'Evolução fisioterapêutica não encontrada' });
        return;
      }

      if (existing.is_sealed === 1) {
        res.status(403).json({ error: 'Esta evolução de sessão está lacrada e não pode ser editada' });
        return;
      }

      const {
        patientCondition, proceduresPerformed, exercisesPerformed, techniquesUsed,
        clinicalEvolution, treatmentResponse, complications, guidelines,
        nextSessionPlan, notes, isSealed
      } = req.body;

      const updaterName = req.user?.name || req.user?.email || 'Fisioterapeuta';

      db.prepare(`
        UPDATE physiotherapy_evolutions SET
          patient_condition = COALESCE(?, patient_condition),
          procedures_performed = COALESCE(?, procedures_performed),
          exercises_performed = COALESCE(?, exercises_performed),
          techniques_used = COALESCE(?, techniques_used),
          clinical_evolution = COALESCE(?, clinical_evolution),
          treatment_response = COALESCE(?, treatment_response),
          complications = COALESCE(?, complications),
          guidelines = COALESCE(?, guidelines),
          next_session_plan = COALESCE(?, next_session_plan),
          notes = COALESCE(?, notes),
          is_sealed = CASE WHEN ? = 1 THEN 1 ELSE is_sealed END,
          updated_by = ?,
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(
        patientCondition || null, proceduresPerformed || null, exercisesPerformed || null, techniquesUsed || null,
        clinicalEvolution || null, treatmentResponse || null, complications || null, guidelines || null,
        nextSessionPlan || null, notes || null, isSealed ? 1 : 0, updaterName,
        id, tenantId
      );

      logAudit(req, 'UPDATE_PHYSIO_EVOLUTION', 'physiotherapy_evolutions', id);
      res.json({ message: 'Evolução atualizada com sucesso' });
    } catch (err: any) {
      console.error('[PhysiotherapyController.updateEvolution] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar evolução fisioterapêutica' });
    }
  }
}
