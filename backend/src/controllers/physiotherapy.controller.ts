import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';
import { hasClinicalAccess } from './clinical.controller';
import { DocumentsController } from './documents.controller';

/**
 * Validação de acesso exclusivo para Fisioterapia (Itens 8, 9, 10, 11, 13)
 * Bloqueio REAL no backend:
 * 1. O usuário deve pertencer à profissão / área de atuação de Fisioterapia
 * 2. O acesso deve ser explicitamente liberado pelo gestor da clínica (permissão access_zemda_fisio ou flag zemda_fisio_enabled)
 * 3. SuperAdmin, Recepção, Financeiro e outras profissões (psicólogos, médicos, etc.): BLOQUEADOS (403)
 * 4. Gerente que também é Fisioterapeuta: PERMITIDO desde que liberado
 */
export function isPhysiotherapistOrClinicManager(req: Request): boolean {
  if (!req.user || !req.tenantId) return false;

  // 1. Administrador Global / Sistema NUNCA pode acessar recursos clínicos do ZemdaFisio (Itens 10 e 15)
  if (req.user.role === 'superadmin') return false;

  // 2. Cargos estritamente não-clínicos (Recepção, Financeiro, Secretária, etc.) são bloqueados
  const roleStr = req.user.role as string;
  if (roleStr === 'receptionist' || roleStr === 'financial' || roleStr === 'secretary' || roleStr === 'assistant') {
    return false;
  }

  // 3. Busca vínculo do usuário na clínica
  const clinicUser = db.prepare(`
    SELECT cu.role, cu.status as cu_status, cu.is_manager, cu.permissions_json, cu.profession_custom,
           cu.practice_areas as cu_practice_areas, cu.zemda_fisio_enabled,
           u.status as u_status, u.profession_name, u.practice_areas as u_practice_areas, u.zemda_fisio_enabled as u_zemda_fisio_enabled
    FROM users u
    LEFT JOIN clinic_users cu ON cu.user_id = u.id AND cu.tenant_id = ?
    WHERE u.id = ?
  `).get(req.tenantId, req.user.userId) as any;

  if (clinicUser?.u_status === 'inactive' || clinicUser?.u_status === 'blocked' || clinicUser?.cu_status === 'inactive' || clinicUser?.cu_status === 'blocked') {
    return false;
  }

  // Busca dados de tenant para profissão do gestor
  const tenant = db.prepare('SELECT manager_profession, manager_practice_areas FROM tenants WHERE id = ?').get(req.tenantId) as any;

  // Busca dados de professional se houver
  const prof = db.prepare(`
    SELECT p.id, p.profession_id, p.practice_areas, p.specialty_custom, p.zemda_fisio_enabled,
           prof.slug as profession_slug, prof.name as profession_name
    FROM professionals p
    LEFT JOIN professions prof ON prof.id = p.profession_id
    WHERE p.user_id = ? AND p.tenant_id = ?
  `).get(req.user.userId, req.tenantId) as any;

  // 4. Critério 1: Profissão / Área clínica deve ser Fisioterapia (reconhece prof-fisioterapeuta, prof-fisioterapia e todas as variações)
  const combinedProfessionText = [
    prof?.profession_id,
    prof?.profession_slug,
    prof?.profession_name,
    prof?.practice_areas,
    prof?.specialty_custom,
    clinicUser?.profession_custom,
    clinicUser?.cu_practice_areas,
    clinicUser?.profession_name,
    clinicUser?.u_practice_areas,
    req.user.role === 'clinic_admin' ? tenant?.manager_profession : null,
    req.user.role === 'clinic_admin' ? tenant?.manager_practice_areas : null
  ].filter(Boolean).join(' ').toLowerCase();

  const isPhysioArea =
    prof?.profession_id === 'prof-fisioterapeuta' ||
    prof?.profession_id === 'prof-fisioterapia' ||
    combinedProfessionText.includes('fisio') ||
    combinedProfessionText.includes('physio');

  if (!isPhysioArea) {
    return false; // Não é da área de Fisioterapia -> BLOQUEADO (403)
  }

  // 5. Critério 2: Liberação explícita pelo gestor da clínica (ou é o próprio gerente atuando em fisioterapia)
  let perms: string[] = [];
  try {
    if (clinicUser?.permissions_json) {
      perms = JSON.parse(clinicUser.permissions_json);
    }
  } catch {}

  const isManager = req.user.role === 'clinic_admin' || clinicUser?.is_manager === 1 || clinicUser?.role === 'clinic_admin';
  const isProfessional = req.user.role === 'professional';

  const isAuthorizedByManager =
    (isProfessional && isPhysioArea) ||
    (isManager && isPhysioArea) ||
    perms.includes('access_zemda_fisio') ||
    Number(prof?.zemda_fisio_enabled) === 1 ||
    Number(clinicUser?.zemda_fisio_enabled) === 1 ||
    Number(clinicUser?.u_zemda_fisio_enabled) === 1;

  return isAuthorizedByManager;
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

  /**
   * Finalização segura do atendimento fisioterapêutico (Fluxos A e B)
   */
  static finishConsultation(req: Request, res: Response): void {
    if (req.body.appointmentId) {
      if (!isPhysiotherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Sem acesso ao módulo de fisioterapia.' });
        return;
      }
      const body = req.body;
      req.params.id = body.appointmentId;
      req.body = {
        ...body,
        evolution: {
          ...body,
          moduleType: 'ZemdaFisio',
          moduleData: { ...body },
          clinicalEvolution: body.clinicalEvolution || 'Atendimento de fisioterapia concluído.'
        }
      };
      DocumentsController.finishConsultation(req, res);
      return;
    }

    try {
      const tenantId = req.tenantId;
      if (!isPhysiotherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao ZemdaFisio' });
        return;
      }

      const {
        patientId, clinicalEvolution, conducts, title, assessmentData,
        goniometryData, muscleStrengthData, postureData, testsData, cbdfData,
        treatmentPlanData, homeExercisesData, sessionDate, sessionTime
      } = req.body;

      if (!patientId || !clinicalEvolution) {
        res.status(400).json({ error: 'patientId e clinicalEvolution são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      } else if (req.body.professionalId) {
        profId = req.body.professionalId;
      }

      const creatorName = req.user?.name || req.user?.email || 'Fisioterapeuta';
      const recordId = 'rec-fisio-' + uuidv4().slice(0, 8);
      const spDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
      const recDate = sessionDate || spDateStr;
      const recTime = sessionTime || null;
      const recTitle = title || 'Consulta Fisioterapêutica (ZemdaFisio)';

      const clinicalPayload = JSON.stringify({
        assessmentData,
        goniometryData,
        muscleStrengthData,
        postureData,
        testsData,
        cbdfData,
        treatmentPlanData,
        homeExercisesData,
        moduleType: 'ZemdaFisio',
        conducts
      });

      db.prepare(`
        INSERT INTO records (
          id, tenant_id, patient_id, professional_id, record_type,
          title, description, conducted_at, conducted_time, created_by,
          module_type, clinical_data_json, conducts, is_sealed, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'consultation', ?, ?, ?, ?, ?, 'ZemdaFisio', ?, ?, 1, datetime('now'), datetime('now'))
      `).run(
        recordId, tenantId, patientId, profId,
        recTitle, clinicalEvolution, recDate, recTime, creatorName,
        clinicalPayload, conducts || null
      );

      logAudit(req, 'FINISH_PHYSIO_CONSULTATION', 'records', recordId, { patientId, recordId });
      res.status(201).json({
        recordId,
        message: 'Consulta de Fisioterapia finalizada com sucesso e gravada no prontuário'
      });
    } catch (err: any) {
      console.error('[PhysiotherapyController.finishConsultation] Erro:', err);
      res.status(500).json({ error: 'Erro ao finalizar consulta de fisioterapia' });
    }
  }

  // =========================================================================
  // 3. AVALIAÇÕES REGIONAIS VISUAIS (INTEGRAÇÃO ZEMDAFISIO × ZEMDA360)
  // =========================================================================

  static listRegionalEvaluations(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      const regionId = req.query.region_id ? String(req.query.region_id) : null;

      if (!req.user || !tenantId) {
        res.status(401).json({ error: 'Não autorizado' });
        return;
      }
      if (!isPhysiotherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito à Fisioterapia' });
        return;
      }
      if (!hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso clínico restrito ao paciente' });
        return;
      }

      let sql = `
        SELECT pre.*, p.name as professional_name
        FROM physiotherapy_regional_evaluations pre
        JOIN professionals p ON p.id = pre.professional_id
        WHERE pre.patient_id = ? AND pre.tenant_id = ?
      `;
      const params: any[] = [patientId, tenantId];

      if (regionId) {
        sql += ` AND pre.region_id = ?`;
        params.push(regionId);
      }

      sql += ` ORDER BY pre.evaluation_date DESC, pre.created_at DESC`;

      const rows = db.prepare(sql).all(...params) as any[];

      const parseJson = (str: string | null) => {
        if (!str) return null;
        try { return JSON.parse(str); } catch { return null; }
      };

      const parsed = rows.map(r => ({
        ...r,
        pain: parseJson(r.pain_json),
        adm: parseJson(r.adm_json) || [],
        strength: parseJson(r.strength_json) || [],
        tests: parseJson(r.tests_json) || [],
        palpation: parseJson(r.palpation_json),
        edema: parseJson(r.edema_json),
        functionalScales: parseJson(r.functional_scales_json) || [],
        planLink: parseJson(r.plan_link_json)
      }));

      logAudit(req, 'LIST_PHYSIO_REGIONAL_EVALUATIONS', 'physiotherapy_regional_evaluations', patientId);
      res.json(parsed);
    } catch (err: any) {
      console.error('[PhysiotherapyController.listRegionalEvaluations] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar avaliações regionais' });
    }
  }

  static getRegionalSummary(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;

      if (!req.user || !tenantId) {
        res.status(401).json({ error: 'Não autorizado' });
        return;
      }
      if (!isPhysiotherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito à Fisioterapia' });
        return;
      }
      if (!hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso clínico restrito ao paciente' });
        return;
      }

      const rows = db.prepare(`
        SELECT region_id, region_label, side, COUNT(*) as count, MAX(evaluation_date) as latest_date
        FROM physiotherapy_regional_evaluations
        WHERE patient_id = ? AND tenant_id = ?
        GROUP BY region_id, side
      `).all(patientId, tenantId) as any[];

      const summaryMap: Record<string, any> = {};
      const summaryList: any[] = [];

      for (const r of rows) {
        const latest = db.prepare(`
          SELECT pain_json, evaluation_date, created_at
          FROM physiotherapy_regional_evaluations
          WHERE patient_id = ? AND tenant_id = ? AND region_id = ?
          ORDER BY evaluation_date DESC, created_at DESC
          LIMIT 1
        `).get(patientId, tenantId, r.region_id) as any;

        let latestPainScore: number | null = null;
        if (latest?.pain_json) {
          try {
            const pObj = JSON.parse(latest.pain_json);
            if (pObj && pObj.score !== undefined) latestPainScore = Number(pObj.score);
          } catch {}
        }

        const item = {
          region_id: r.region_id,
          region_label: r.region_label,
          side: r.side,
          count: r.count,
          evaluation_count: r.count,
          latest_date: r.latest_date,
          latest_evaluation_date: r.latest_date,
          latest_pain_score: latestPainScore
        };

        summaryMap[r.region_id] = item;
        summaryList.push(item);
      }

      res.json({ ...summaryMap, summary: summaryList });
    } catch (err: any) {
      console.error('[PhysiotherapyController.getRegionalSummary] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar sumário regional fisioterapêutico' });
    }
  }

  static getRegionalComparison(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const regionId = String(req.params.regionId);
      const tenantId = req.tenantId;
      const firstId = req.query.first_id ? String(req.query.first_id) : null;
      const currentId = req.query.current_id ? String(req.query.current_id) : null;

      if (!req.user || !tenantId) {
        res.status(401).json({ error: 'Não autorizado' });
        return;
      }
      if (!isPhysiotherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito à Fisioterapia' });
        return;
      }
      if (!hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso clínico restrito ao paciente' });
        return;
      }

      const rows = db.prepare(`
        SELECT pre.*, p.name as professional_name
        FROM physiotherapy_regional_evaluations pre
        JOIN professionals p ON p.id = pre.professional_id
        WHERE pre.patient_id = ? AND pre.tenant_id = ? AND pre.region_id = ?
        ORDER BY pre.evaluation_date ASC, pre.created_at ASC
      `).all(patientId, tenantId, regionId) as any[];

      if (rows.length === 0) {
        res.status(404).json({ error: 'Nenhuma avaliação encontrada para esta região' });
        return;
      }

      const baselineRow = firstId ? rows.find(r => r.id === firstId) || rows[0] : rows[0];
      const currentRow = currentId ? rows.find(r => r.id === currentId) || rows[rows.length - 1] : rows[rows.length - 1];

      const parseJson = (str: string | null) => {
        if (!str) return null;
        try { return JSON.parse(str); } catch { return null; }
      };

      const baseline = {
        ...baselineRow,
        pain: parseJson(baselineRow.pain_json),
        adm: parseJson(baselineRow.adm_json) || [],
        strength: parseJson(baselineRow.strength_json) || [],
        tests: parseJson(baselineRow.tests_json) || [],
        palpation: parseJson(baselineRow.palpation_json),
        edema: parseJson(baselineRow.edema_json),
        functionalScales: parseJson(baselineRow.functional_scales_json) || [],
        planLink: parseJson(baselineRow.plan_link_json)
      };

      const current = {
        ...currentRow,
        pain: parseJson(currentRow.pain_json),
        adm: parseJson(currentRow.adm_json) || [],
        strength: parseJson(currentRow.strength_json) || [],
        tests: parseJson(currentRow.tests_json) || [],
        palpation: parseJson(currentRow.palpation_json),
        edema: parseJson(currentRow.edema_json),
        functionalScales: parseJson(currentRow.functional_scales_json) || [],
        planLink: parseJson(currentRow.plan_link_json)
      };

      // Variação de Dor (EVA)
      const painBaselineScore = baseline.pain?.score !== undefined ? Number(baseline.pain.score) : null;
      const painCurrentScore = current.pain?.score !== undefined ? Number(current.pain.score) : null;
      const painDiff = (painCurrentScore !== null && painBaselineScore !== null)
        ? (painCurrentScore - painBaselineScore)
        : null;

      // Variações de ADM / Goniometria
      const allMovements = Array.from(new Set([
        ...(current.adm || []).map((m: any) => m.movement),
        ...(baseline.adm || []).map((m: any) => m.movement)
      ]));

      const admDiffs = allMovements.map(movName => {
        const currMov = (current.adm || []).find((b: any) => b.movement === movName) || {};
        const baseMov = (baseline.adm || []).find((b: any) => b.movement === movName) || {};

        const currActive = parseFloat(currMov.activeRom);
        const baseActive = parseFloat(baseMov.activeRom);
        const activeDiff = (!isNaN(currActive) && !isNaN(baseActive)) ? (currActive - baseActive) : null;

        const currPassive = parseFloat(currMov.passiveRom);
        const basePassive = parseFloat(baseMov.passiveRom);
        const passiveDiff = (!isNaN(currPassive) && !isNaN(basePassive)) ? (currPassive - basePassive) : null;

        return {
          movement: movName,
          side: currMov.side || baseMov.side || currentRow.side,
          normalRange: currMov.normalRange || baseMov.normalRange || '-',
          baselineActive: baseMov.activeRom || '-',
          currentActive: currMov.activeRom || '-',
          activeDiff,
          baselinePassive: baseMov.passiveRom || '-',
          currentPassive: currMov.passiveRom || '-',
          passiveDiff,
          unit: currMov.unit || baseMov.unit || '°'
        };
      });

      // Variações de Força Muscular
      const allMuscleGroups = Array.from(new Set([
        ...(current.strength || []).map((s: any) => s.muscleGroup),
        ...(baseline.strength || []).map((s: any) => s.muscleGroup)
      ]));

      const strengthDiffs = allMuscleGroups.map(groupName => {
        const currStr = (current.strength || []).find((s: any) => s.muscleGroup === groupName) || {};
        const baseStr = (baseline.strength || []).find((s: any) => s.muscleGroup === groupName) || {};
        return {
          muscleGroup: groupName,
          side: currStr.side || baseStr.side || currentRow.side,
          baselineGrade: baseStr.grade || '-',
          currentGrade: currStr.grade || '-',
          notes: currStr.notes || baseStr.notes || ''
        };
      });

      // Timeline numérica para gráficos
      const timeline = rows.map(r => {
        const p = parseJson(r.pain_json);
        const a = parseJson(r.adm_json) || [];
        return {
          id: r.id,
          date: r.evaluation_date,
          createdAt: r.created_at,
          painScore: p?.score !== undefined ? Number(p.score) : null,
          adm: a
        };
      });

      logAudit(req, 'COMPARE_PHYSIO_REGIONAL', 'physiotherapy_regional_evaluations', regionId, { patientId });

      res.json({
        regionId,
        regionLabel: currentRow.region_label,
        side: currentRow.side,
        baseline,
        current,
        variations: {
          painDiff,
          admDiffs,
          strengthDiffs
        },
        timeline,
        allEvaluations: rows.map(r => ({
          id: r.id,
          evaluation_date: r.evaluation_date,
          professional_name: r.professional_name,
          created_at: r.created_at
        }))
      });
    } catch (err: any) {
      console.error('[PhysiotherapyController.getRegionalComparison] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar comparação longitudinal' });
    }
  }

  static createRegionalEvaluation(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isPhysiotherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito à Fisioterapia' });
        return;
      }

      const {
        patientId,
        appointmentId,
        regionId,
        regionLabel,
        side,
        evaluationDate,
        pain,
        adm,
        strength,
        tests,
        palpation,
        edema,
        functionalScales,
        planLink,
        notes
      } = req.body;

      if (!patientId || !regionId || !regionLabel) {
        res.status(400).json({ error: 'patientId, regionId e regionLabel são obrigatórios' });
        return;
      }

      if (!hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso clínico restrito ao paciente' });
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

      const id = 'pfre-' + uuidv4().slice(0, 8);
      const evalDate = evaluationDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

      const stringifyOrNull = (val: any) => {
        if (val === undefined || val === null) return null;
        return typeof val === 'string' ? val : JSON.stringify(val);
      };

      db.prepare(`
        INSERT INTO physiotherapy_regional_evaluations (
          id, tenant_id, patient_id, professional_id, appointment_id,
          region_id, region_label, side, evaluation_date,
          pain_json, adm_json, strength_json, tests_json,
          palpation_json, edema_json, functional_scales_json, plan_link_json,
          notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        id, tenantId, patientId, profId, appointmentId || null,
        regionId, regionLabel, side || 'midline', evalDate,
        stringifyOrNull(pain),
        stringifyOrNull(adm),
        stringifyOrNull(strength),
        stringifyOrNull(tests),
        stringifyOrNull(palpation),
        stringifyOrNull(edema),
        stringifyOrNull(functionalScales),
        stringifyOrNull(planLink),
        notes || null
      );

      // Sincroniza marcação em body_markers caso haja avaliação Zemda360 ativa para a consulta/paciente
      try {
        const activeAssess = db.prepare(`
          SELECT id FROM body_assessments
          WHERE patient_id = ? AND tenant_id = ?
          ORDER BY assessment_date DESC, created_at DESC LIMIT 1
        `).get(patientId, tenantId) as any;

        if (activeAssess) {
          const markerId = 'bm-physio-' + uuidv4().slice(0, 8);
          const painScore = pain?.score !== undefined ? String(pain.score) : 'Marcador';
          db.prepare(`
            INSERT INTO body_markers (
              id, tenant_id, assessment_id, body_region, side, view,
              marker_type, value, severity, notes, details_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 'front', 'pain', ?, ?, ?, ?, datetime('now'), datetime('now'))
          `).run(
            markerId, tenantId, activeAssess.id, regionId, side || 'midline',
            `Dor ${painScore}/10`,
            Number(painScore) >= 7 ? 'severe' : Number(painScore) >= 4 ? 'moderate' : 'mild',
            `${regionLabel}: Avaliação Funcional Fisioterapêutica registrada`,
            stringifyOrNull({ regional_evaluation_id: id, pain, adm })
          );
        }
      } catch (markErr) {
        console.warn('[PhysiotherapyController] Aviso ao sincronizar body_marker:', markErr);
      }

      logAudit(req, 'CREATE_PHYSIO_REGIONAL_EVALUATION', 'physiotherapy_regional_evaluations', id, { patientId, regionId });

      res.status(201).json({
        id,
        message: 'Avaliação funcional regional registrada com sucesso!',
        evaluation: {
          id,
          patientId,
          regionId,
          regionLabel,
          side: side || 'midline',
          evaluationDate: evalDate
        }
      });
    } catch (err: any) {
      console.error('[PhysiotherapyController.createRegionalEvaluation] Erro:', err);
      res.status(500).json({ error: 'Erro ao criar avaliação regional de fisioterapia' });
    }
  }

  static deleteRegionalEvaluation(req: Request, res: Response): void {
    try {
      const id = String(req.params.id);
      const tenantId = req.tenantId;

      if (!isPhysiotherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito à Fisioterapia' });
        return;
      }

      const existing = db.prepare(`
        SELECT id, patient_id FROM physiotherapy_regional_evaluations
        WHERE id = ? AND tenant_id = ?
      `).get(id, tenantId) as any;

      if (!existing) {
        res.status(404).json({ error: 'Avaliação regional não encontrada' });
        return;
      }

      if (!hasClinicalAccess(req, existing.patient_id)) {
        res.status(403).json({ error: 'Acesso restrito ao prontuário deste paciente' });
        return;
      }

      db.prepare('DELETE FROM physiotherapy_regional_evaluations WHERE id = ? AND tenant_id = ?').run(id, tenantId);

      logAudit(req, 'DELETE_PHYSIO_REGIONAL_EVALUATION', 'physiotherapy_regional_evaluations', id);
      res.json({ message: 'Avaliação regional excluída com sucesso.' });
    } catch (err: any) {
      console.error('[PhysiotherapyController.deleteRegionalEvaluation] Erro:', err);
      res.status(500).json({ error: 'Erro ao excluir avaliação regional' });
    }
  }
}
