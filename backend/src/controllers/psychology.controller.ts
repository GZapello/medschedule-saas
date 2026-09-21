import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { GeminiService } from '../services/gemini.service';
import { generateQrCodeDataUrl } from '../utils/qr-generator';

function getParam(param: any): string {
  if (Array.isArray(param)) return param[0] || '';
  return String(param || '');
}

/**
 * Validação de acesso estrito ao prontuário de Psicologia Clínica (ZemdaPsico)
 * Resolução CFP nº 01/2009, 05/2010 e Código de Ética Profissional do Psicólogo (Art. 9º - Sigilo).
 * 
 * Regras:
 * 1. SuperAdmin global NUNCA acessa prontuários clínicos.
 * 2. Bloqueio absoluto de perfis não clínicos (recepção, financeiro, secretária, assistente).
 * 3. Apenas psicólogos habilitados (CRP / zemda_psico_enabled) ou gestor clínico com habilitação em Psicologia.
 * 4. Isolamento estrito por tenant.
 */
export function hasPsychologyAccess(req: Request, patientId?: string | string[]): boolean {
  if (!req.user || !req.tenantId) return false;

  // 1. SuperAdmin global NUNCA visualiza prontuários clínicos ou psicológicos
  if (req.user.role === 'superadmin') return false;

  // 2. Bloqueio total de perfis administrativos e de recepção
  const role = String(req.user.role || '').toLowerCase();
  if (['receptionist', 'financial', 'secretary', 'assistant'].includes(role)) {
    return false;
  }

  const clinicUser = db.prepare(`
    SELECT cu.role, cu.status as cu_status, cu.is_manager, cu.permissions_json, cu.zemda_psico_enabled,
           u.status as u_status, u.profession_name, u.practice_areas as u_practice_areas, u.zemda_psico_enabled as u_zemda_psico_enabled
    FROM users u
    LEFT JOIN clinic_users cu ON cu.user_id = u.id AND cu.tenant_id = ?
    WHERE u.id = ?
  `).get(req.tenantId, req.user.userId) as any;

  if (
    clinicUser?.u_status === 'inactive' || clinicUser?.u_status === 'blocked' ||
    clinicUser?.cu_status === 'inactive' || clinicUser?.cu_status === 'blocked'
  ) {
    return false;
  }

  const prof = db.prepare(`
    SELECT p.id, p.profession_id, p.practice_areas, p.zemda_psico_enabled, p.registration_type, p.registration_number,
           prof.slug as profession_slug, prof.name as profession_name
    FROM professionals p
    LEFT JOIN professions prof ON prof.id = p.profession_id
    WHERE p.user_id = ? AND p.tenant_id = ?
  `).get(req.user.userId, req.tenantId) as any;

  const tenant = db.prepare('SELECT manager_profession, manager_practice_areas FROM tenants WHERE id = ?').get(req.tenantId) as any;

  const combinedText = [
    prof?.profession_id,
    prof?.profession_slug,
    prof?.profession_name,
    prof?.practice_areas,
    prof?.registration_type,
    clinicUser?.profession_name,
    clinicUser?.u_practice_areas,
    req.user.role === 'clinic_admin' ? tenant?.manager_profession : null,
    req.user.role === 'clinic_admin' ? tenant?.manager_practice_areas : null
  ].filter(Boolean).join(' ').toLowerCase();

  const isPsychologyArea =
    prof?.profession_id === 'prof-psicologo' ||
    prof?.profession_id === 'prof-psicologia' ||
    prof?.profession_id === 'prof-neuropsicologo' ||
    prof?.profession_id === 'prof-psicanalista' ||
    prof?.registration_type === 'CRP' ||
    combinedText.includes('psicólog') ||
    combinedText.includes('psicolog') ||
    combinedText.includes('crp') ||
    combinedText.includes('neuropsicol');

  const isExplicitlyEnabled =
    Number(prof?.zemda_psico_enabled) === 1 ||
    Number(clinicUser?.zemda_psico_enabled) === 1 ||
    Number(clinicUser?.u_zemda_psico_enabled) === 1;

  if (isPsychologyArea || isExplicitlyEnabled) {
    return true;
  }

  return false;
}

/**
 * Registra evento na trilha de auditoria específica da Psicologia
 */
function logPsychologyAudit(
  req: Request,
  patientId: string,
  action: string,
  targetEntity: string,
  targetId?: string,
  details?: string
): void {
  try {
    const id = `aud-psico-${uuidv4()}`;
    const tenantId = req.tenantId || '';
    const userId = req.user?.userId || 'unknown';
    const userName = req.user?.name || req.user?.email || 'Desconhecido';
    const ip = req.ip || req.socket.remoteAddress || '';

    db.prepare(`
      INSERT INTO psychology_audit_logs (
        id, tenant_id, patient_id, user_id, user_name, action, target_entity, target_id, details, ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, tenantId, patientId, userId, userName, action, targetEntity, targetId || null, details || null, ip);
  } catch (err) {
    console.warn('[ZemdaPsico] Falha ao gravar log de auditoria:', err);
  }
}

export class PsychologyController {
  // ==========================================================================
  // 1. PERFIL CLÍNICO INTEGRADO (Carregamento Geral do Paciente)
  // ==========================================================================
  static getProfile(req: Request, res: Response): void {
    try {
      const patientId = getParam(req.params.patientId);
      const tenantId = req.tenantId;

      if (!hasPsychologyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: Sigilo profissional de Psicologia (CFP).' });
        return;
      }

      const patient = db.prepare('SELECT id, full_name as name, cpf, birth_date, gender, phone, email FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId) as any;
      if (!patient) {
        res.status(404).json({ error: 'Paciente não encontrado.' });
        return;
      }

      const anamnesis = db.prepare('SELECT * FROM psychology_anamnesis WHERE patient_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 1').get(patientId, tenantId) as any;
      const mentalState = db.prepare('SELECT * FROM psychology_mental_state_exams WHERE patient_id = ? AND tenant_id = ? ORDER BY exam_date DESC, created_at DESC LIMIT 1').get(patientId, tenantId) as any;
      const latestRisk = db.prepare('SELECT * FROM psychology_risk_assessments WHERE patient_id = ? AND tenant_id = ? ORDER BY assessment_date DESC, created_at DESC LIMIT 1').get(patientId, tenantId) as any;
      const sessions = db.prepare('SELECT * FROM psychology_sessions WHERE patient_id = ? AND tenant_id = ? ORDER BY session_date DESC, created_at DESC').all(patientId, tenantId) as any[];
      const goals = db.prepare('SELECT * FROM psychology_goals WHERE patient_id = ? AND tenant_id = ? ORDER BY created_at ASC').all(patientId, tenantId) as any[];
      const assessments = db.prepare('SELECT * FROM psychology_assessments WHERE patient_id = ? AND tenant_id = ? ORDER BY start_date DESC').all(patientId, tenantId) as any[];
      const instruments = db.prepare('SELECT * FROM psychology_instruments WHERE patient_id = ? AND tenant_id = ? ORDER BY application_date DESC').all(patientId, tenantId) as any[];
      const screenings = db.prepare('SELECT * FROM psychology_screenings WHERE patient_id = ? AND tenant_id = ? ORDER BY application_date DESC').all(patientId, tenantId) as any[];
      const documents = db.prepare('SELECT * FROM psychology_documents WHERE patient_id = ? AND tenant_id = ? ORDER BY created_at DESC').all(patientId, tenantId) as any[];

      logPsychologyAudit(req, patientId, 'open_record', 'patient_profile', patientId, 'Abertura do prontuário do paciente');

      res.json({
        patient,
        anamnesis: anamnesis || null,
        mentalState: mentalState || null,
        latestRisk: latestRisk || null,
        sessions: sessions || [],
        goals: goals || [],
        assessments: assessments || [],
        instruments: instruments || [],
        screenings: screenings || [],
        documents: documents || []
      });
    } catch (err: any) {
      console.error('[PsychologyController.getProfile]', err);
      res.status(500).json({ error: 'Erro ao carregar prontuário de psicologia.' });
    }
  }

  // ==========================================================================
  // 2. ANAMNESE PSICOLÓGICA (Estruturada e Neutra)
  // ==========================================================================
  static getAnamnesis(req: Request, res: Response): void {
    try {
      const patientId = getParam(req.params.patientId);
      const tenantId = req.tenantId;

      if (!hasPsychologyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: Sigilo profissional de Psicologia.' });
        return;
      }

      const row = db.prepare('SELECT * FROM psychology_anamnesis WHERE patient_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 1').get(patientId, tenantId);
      res.json(row || null);
    } catch (err: any) {
      console.error('[PsychologyController.getAnamnesis]', err);
      res.status(500).json({ error: 'Erro ao obter anamnese.' });
    }
  }

  static saveAnamnesis(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId;
      const body = req.body;
      const patientId = getParam(body.patientId);

      if (!patientId || !hasPsychologyAccess(req, patientId)) {
        res.status(403).json({ error: 'Sem permissão para salvar anamnese de Psicologia.' });
        return;
      }

      const existing = db.prepare('SELECT id, is_sealed, amendments_json FROM psychology_anamnesis WHERE patient_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 1').get(patientId, tenantId) as any;

      if (existing && existing.is_sealed === 1) {
        if (!body.amendmentText) {
          res.status(409).json({
            error: 'Esta anamnese psicológica já foi selada. Modificações só podem ser feitas mediante Adendo Clínico fundamentado.'
          });
          return;
        }

        const currentAmendments = JSON.parse(existing.amendments_json || '[]');
        currentAmendments.push({
          id: `amend-${Date.now()}`,
          text: body.amendmentText.trim(),
          authorName: req.user?.name || 'Psicólogo(a)',
          authorId: userId,
          createdAt: new Date().toISOString()
        });

        db.prepare(`
          UPDATE psychology_anamnesis SET
            amendments_json = ?,
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(JSON.stringify(currentAmendments), existing.id, tenantId);

        logPsychologyAudit(req, patientId, 'add_amendment', 'psychology_anamnesis', existing.id, 'Adendo em anamnese selada');
        res.json({ message: 'Adendo registrado com sucesso na anamnese!', id: existing.id });
        return;
      }

      const id = existing?.id || `anam-${uuidv4()}`;

      if (existing) {
        db.prepare(`
          UPDATE psychology_anamnesis SET
            professional_id = ?,
            appointment_id = ?,
            identification_demand = ?,
            main_complaint = ?,
            demand_history = ?,
            psych_psychiatric_history = ?,
            medical_history = ?,
            current_medications = ?,
            sleep_patterns = ?,
            eating_habits = ?,
            physical_activity = ?,
            substance_use = ?,
            family_context = ?,
            developmental_history = ?,
            marital_relationship_context = ?,
            academic_educational_context = ?,
            professional_work_context = ?,
            social_context = ?,
            support_network = ?,
            protective_factors = ?,
            vulnerability_factors = ?,
            significant_life_events = ?,
            previous_treatments = ?,
            treatment_goals = ?,
            theoretical_approach = ?,
            clinical_observations = ?,
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(
          body.professionalId || null,
          body.appointmentId || null,
          body.identificationDemand || null,
          body.mainComplaint || null,
          body.demandHistory || null,
          body.psychPsychiatricHistory || null,
          body.medicalHistory || null,
          body.currentMedications || null,
          body.sleepPatterns || null,
          body.eatingHabits || null,
          body.physicalActivity || null,
          body.substanceUse || null,
          body.familyContext || null,
          body.developmentalHistory || null,
          body.maritalRelationshipContext || null,
          body.academicEducationalContext || null,
          body.professionalWorkContext || null,
          body.socialContext || null,
          body.supportNetwork || null,
          body.protectiveFactors || null,
          body.vulnerabilityFactors || null,
          body.significantLifeEvents || null,
          body.previousTreatments || null,
          body.treatmentGoals || null,
          body.theoreticalApproach || null,
          body.clinicalObservations || null,
          id,
          tenantId
        );
      } else {
        db.prepare(`
          INSERT INTO psychology_anamnesis (
            id, tenant_id, patient_id, professional_id, appointment_id,
            identification_demand, main_complaint, demand_history,
            psych_psychiatric_history, medical_history, current_medications,
            sleep_patterns, eating_habits, physical_activity, substance_use,
            family_context, developmental_history, marital_relationship_context,
            academic_educational_context, professional_work_context, social_context,
            support_network, protective_factors, vulnerability_factors,
            significant_life_events, previous_treatments, treatment_goals,
            theoretical_approach, clinical_observations, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, tenantId, patientId, body.professionalId || null, body.appointmentId || null,
          body.identificationDemand || null, body.mainComplaint || null, body.demandHistory || null,
          body.psychPsychiatricHistory || null, body.medicalHistory || null, body.currentMedications || null,
          body.sleepPatterns || null, body.eatingHabits || null, body.physicalActivity || null, body.substanceUse || null,
          body.familyContext || null, body.developmentalHistory || null, body.maritalRelationshipContext || null,
          body.academicEducationalContext || null, body.professionalWorkContext || null, body.socialContext || null,
          body.supportNetwork || null, body.protectiveFactors || null, body.vulnerabilityFactors || null,
          body.significantLifeEvents || null, body.previousTreatments || null, body.treatmentGoals || null,
          body.theoreticalApproach || null, body.clinicalObservations || null, userId || null
        );
      }

      logPsychologyAudit(req, patientId, 'save_anamnesis', 'psychology_anamnesis', id, 'Salvamento de anamnese');
      res.json({ message: 'Anamnese psicológica salva com sucesso!', id });
    } catch (err: any) {
      console.error('[PsychologyController.saveAnamnesis]', err);
      res.status(500).json({ error: 'Erro ao salvar anamnese psicológica.' });
    }
  }

  // ==========================================================================
  // 3. EXAME DO ESTADO MENTAL (EEM)
  // ==========================================================================
  static getMentalState(req: Request, res: Response): void {
    try {
      const patientId = getParam(req.params.patientId);
      const tenantId = req.tenantId;

      if (!hasPsychologyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: Sigilo profissional.' });
        return;
      }

      const row = db.prepare('SELECT * FROM psychology_mental_state_exams WHERE patient_id = ? AND tenant_id = ? ORDER BY exam_date DESC, created_at DESC LIMIT 1').get(patientId, tenantId);
      res.json(row || null);
    } catch (err: any) {
      console.error('[PsychologyController.getMentalState]', err);
      res.status(500).json({ error: 'Erro ao obter Exame do Estado Mental.' });
    }
  }

  static saveMentalState(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId;
      const body = req.body;
      const patientId = getParam(body.patientId);

      if (!patientId || !hasPsychologyAccess(req, patientId)) {
        res.status(403).json({ error: 'Sem permissão para salvar EEM de Psicologia.' });
        return;
      }

      const id = body.id || `eem-${uuidv4()}`;
      const examDate = body.examDate || new Date().toISOString().split('T')[0];

      db.prepare(`
        INSERT INTO psychology_mental_state_exams (
          id, tenant_id, patient_id, professional_id, appointment_id, exam_date,
          appearance, attitude_behavior, consciousness_level, orientation,
          attention, memory, language_speech, psychomotor, mood, affect,
          thought_process, sensory_perception, cognitive_functions,
          critical_judgment, insight, impulse_control, current_risk, observations, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          exam_date = excluded.exam_date,
          appearance = excluded.appearance,
          attitude_behavior = excluded.attitude_behavior,
          consciousness_level = excluded.consciousness_level,
          orientation = excluded.orientation,
          attention = excluded.attention,
          memory = excluded.memory,
          language_speech = excluded.language_speech,
          psychomotor = excluded.psychomotor,
          mood = excluded.mood,
          affect = excluded.affect,
          thought_process = excluded.thought_process,
          sensory_perception = excluded.sensory_perception,
          cognitive_functions = excluded.cognitive_functions,
          critical_judgment = excluded.critical_judgment,
          insight = excluded.insight,
          impulse_control = excluded.impulse_control,
          current_risk = excluded.current_risk,
          observations = excluded.observations,
          updated_at = datetime('now')
      `).run(
        id, tenantId, patientId, body.professionalId || null, body.appointmentId || null, examDate,
        body.appearance || null, body.attitudeBehavior || null, body.consciousnessLevel || null, body.orientation || null,
        body.attention || null, body.memory || null, body.languageSpeech || null, body.psychomotor || null, body.mood || null, body.affect || null,
        body.thoughtProcess || null, body.sensoryPerception || null, body.cognitiveFunctions || null,
        body.criticalJudgment || null, body.insight || null, body.impulseControl || null, body.currentRisk || null, body.observations || null,
        userId || null
      );

      logPsychologyAudit(req, patientId, 'save_mental_state', 'psychology_mental_state_exams', id, 'Salvamento do Exame do Estado Mental');
      res.json({ message: 'Exame do Estado Mental salvo com sucesso!', id });
    } catch (err: any) {
      console.error('[PsychologyController.saveMentalState]', err);
      res.status(500).json({ error: 'Erro ao salvar Exame do Estado Mental.' });
    }
  }

  // ==========================================================================
  // 4. AVALIAÇÃO DE RISCO (Estruturada)
  // ==========================================================================
  static getRisk(req: Request, res: Response): void {
    try {
      const patientId = getParam(req.params.patientId);
      const tenantId = req.tenantId;

      if (!hasPsychologyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: Sigilo profissional.' });
        return;
      }

      const row = db.prepare('SELECT * FROM psychology_risk_assessments WHERE patient_id = ? AND tenant_id = ? ORDER BY assessment_date DESC, created_at DESC LIMIT 1').get(patientId, tenantId);
      res.json(row || null);
    } catch (err: any) {
      console.error('[PsychologyController.getRisk]', err);
      res.status(500).json({ error: 'Erro ao obter Avaliação de Risco.' });
    }
  }

  static saveRisk(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId;
      const body = req.body;
      const patientId = getParam(body.patientId);

      if (!patientId || !hasPsychologyAccess(req, patientId)) {
        res.status(403).json({ error: 'Sem permissão para salvar Avaliação de Risco.' });
        return;
      }

      const id = body.id || `risk-${uuidv4()}`;
      const assessmentDate = body.assessmentDate || new Date().toISOString().split('T')[0];

      db.prepare(`
        INSERT INTO psychology_risk_assessments (
          id, tenant_id, patient_id, professional_id, appointment_id, assessment_date,
          suicidal_ideation, self_harm, planning, intent_level, means_access,
          history_previous_attempts, precipitating_factors, protective_factors,
          support_network_actionable, conduct_adopted, referral_destination,
          safety_plan, reassessment_schedule, clinician_summary, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          assessment_date = excluded.assessment_date,
          suicidal_ideation = excluded.suicidal_ideation,
          self_harm = excluded.self_harm,
          planning = excluded.planning,
          intent_level = excluded.intent_level,
          means_access = excluded.means_access,
          history_previous_attempts = excluded.history_previous_attempts,
          precipitating_factors = excluded.precipitating_factors,
          protective_factors = excluded.protective_factors,
          support_network_actionable = excluded.support_network_actionable,
          conduct_adopted = excluded.conduct_adopted,
          referral_destination = excluded.referral_destination,
          safety_plan = excluded.safety_plan,
          reassessment_schedule = excluded.reassessment_schedule,
          clinician_summary = excluded.clinician_summary,
          updated_at = datetime('now')
      `).run(
        id, tenantId, patientId, body.professionalId || null, body.appointmentId || null, assessmentDate,
        body.suicidalIdeation || null, body.selfHarm || null, body.planning || null, body.intentLevel || null, body.meansAccess || null,
        body.historyPreviousAttempts || null, body.precipitatingFactors || null, body.protectiveFactors || null,
        body.supportNetworkActionable || null, body.conductAdopted || null, body.referralDestination || null,
        body.safetyPlan || null, body.reassessmentSchedule || null, body.clinicianSummary || null, userId || null
      );

      logPsychologyAudit(req, patientId, 'save_risk', 'psychology_risk_assessments', id, 'Salvamento de Avaliação de Risco');
      res.json({ message: 'Avaliação de Risco registrada com sucesso!', id });
    } catch (err: any) {
      console.error('[PsychologyController.saveRisk]', err);
      res.status(500).json({ error: 'Erro ao salvar Avaliação de Risco.' });
    }
  }

  // ==========================================================================
  // 5. AVALIAÇÃO PSICOLÓGICA ESTRUTURADA (Resolução CFP nº 31/2022)
  // ==========================================================================
  static getAssessments(req: Request, res: Response): void {
    try {
      const patientId = getParam(req.params.patientId);
      const tenantId = req.tenantId;

      if (!hasPsychologyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: Sigilo profissional.' });
        return;
      }

      const rows = db.prepare('SELECT * FROM psychology_assessments WHERE patient_id = ? AND tenant_id = ? ORDER BY start_date DESC').all(patientId, tenantId);
      res.json(rows);
    } catch (err: any) {
      console.error('[PsychologyController.getAssessments]', err);
      res.status(500).json({ error: 'Erro ao listar Avaliações Psicológicas.' });
    }
  }

  static saveAssessment(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId;
      const body = req.body;
      const patientId = getParam(body.patientId);

      if (!patientId || !hasPsychologyAccess(req, patientId)) {
        res.status(403).json({ error: 'Sem permissão para salvar Avaliação Psicológica.' });
        return;
      }

      if (!body.assessmentTitle || !body.purpose) {
        res.status(400).json({ error: 'Título e Finalidade da Avaliação Psicológica são obrigatórios.' });
        return;
      }

      const id = body.id || `eval-${uuidv4()}`;

      db.prepare(`
        INSERT INTO psychology_assessments (
          id, tenant_id, patient_id, professional_id, appointment_id,
          assessment_title, purpose, demand_description, start_date, completion_date,
          status, fundamental_sources_json, complementary_sources_json,
          clinical_integration_analysis, conclusion_synthesis, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          assessment_title = excluded.assessment_title,
          purpose = excluded.purpose,
          demand_description = excluded.demand_description,
          start_date = excluded.start_date,
          completion_date = excluded.completion_date,
          status = excluded.status,
          fundamental_sources_json = excluded.fundamental_sources_json,
          complementary_sources_json = excluded.complementary_sources_json,
          clinical_integration_analysis = excluded.clinical_integration_analysis,
          conclusion_synthesis = excluded.conclusion_synthesis,
          updated_at = datetime('now')
      `).run(
        id, tenantId, patientId, body.professionalId || null, body.appointmentId || null,
        body.assessmentTitle.trim(), body.purpose.trim(), body.demandDescription || null,
        body.startDate || new Date().toISOString().split('T')[0], body.completionDate || null,
        body.status || 'in_progress',
        typeof body.fundamentalSourcesJson === 'object' ? JSON.stringify(body.fundamentalSourcesJson) : (body.fundamentalSourcesJson || null),
        typeof body.complementarySourcesJson === 'object' ? JSON.stringify(body.complementarySourcesJson) : (body.complementarySourcesJson || null),
        body.clinicalIntegrationAnalysis || null,
        body.conclusionSynthesis || null,
        userId || null
      );

      logPsychologyAudit(req, patientId, 'save_assessment', 'psychology_assessments', id, 'Salvamento de Avaliação Psicológica estruturada');
      res.json({ message: 'Processo de Avaliação Psicológica salvo!', id });
    } catch (err: any) {
      console.error('[PsychologyController.saveAssessment]', err);
      res.status(500).json({ error: 'Erro ao salvar Avaliação Psicológica.' });
    }
  }

  // ==========================================================================
  // 6. INSTRUMENTOS & SATEPSI (Resolução CFP nº 31/2022)
  // ==========================================================================
  static getInstruments(req: Request, res: Response): void {
    try {
      const patientId = getParam(req.params.patientId);
      const tenantId = req.tenantId;

      if (!hasPsychologyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: Sigilo profissional.' });
        return;
      }

      const rows = db.prepare('SELECT * FROM psychology_instruments WHERE patient_id = ? AND tenant_id = ? ORDER BY application_date DESC').all(patientId, tenantId);
      res.json(rows);
    } catch (err: any) {
      console.error('[PsychologyController.getInstruments]', err);
      res.status(500).json({ error: 'Erro ao listar instrumentos.' });
    }
  }

  static saveInstrument(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId;
      const body = req.body;
      const patientId = getParam(body.patientId);

      if (!patientId || !hasPsychologyAccess(req, patientId)) {
        res.status(403).json({ error: 'Sem permissão para registrar teste psicológico.' });
        return;
      }

      if (!body.instrumentName) {
        res.status(400).json({ error: 'Nome do instrumento é obrigatório.' });
        return;
      }

      const id = body.id || `inst-${uuidv4()}`;

      db.prepare(`
        INSERT INTO psychology_instruments (
          id, tenant_id, patient_id, assessment_id, instrument_name, version,
          publisher, purpose, application_date, modality, satepsi_status,
          satepsi_verified_at, professional_synthesis, observations,
          responsible_psychologist, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          assessment_id = excluded.assessment_id,
          instrument_name = excluded.instrument_name,
          version = excluded.version,
          publisher = excluded.publisher,
          purpose = excluded.purpose,
          application_date = excluded.application_date,
          modality = excluded.modality,
          satepsi_status = excluded.satepsi_status,
          satepsi_verified_at = excluded.satepsi_verified_at,
          professional_synthesis = excluded.professional_synthesis,
          observations = excluded.observations,
          responsible_psychologist = excluded.responsible_psychologist
      `).run(
        id, tenantId, patientId, body.assessmentId || null, body.instrumentName.trim(),
        body.version || null, body.publisher || null, body.purpose || null,
        body.applicationDate || new Date().toISOString().split('T')[0],
        body.modality || 'presencial',
        body.satepsiStatus || 'pendente',
        body.satepsiVerifiedAt || null,
        body.professionalSynthesis || null,
        body.observations || null,
        body.responsiblePsychologist || req.user?.name || null,
        userId || null
      );

      logPsychologyAudit(req, patientId, 'save_instrument', 'psychology_instruments', id, `Registro de instrumento: ${body.instrumentName}`);
      res.json({ message: 'Instrumento psicológico registrado com sucesso!', id });
    } catch (err: any) {
      console.error('[PsychologyController.saveInstrument]', err);
      res.status(500).json({ error: 'Erro ao registrar instrumento.' });
    }
  }

  static deleteInstrument(req: Request, res: Response): void {
    try {
      const id = getParam(req.params.id);
      const tenantId = req.tenantId;

      const inst = db.prepare('SELECT patient_id, instrument_name FROM psychology_instruments WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!inst || !hasPsychologyAccess(req, inst.patient_id)) {
        res.status(404).json({ error: 'Instrumento não encontrado ou sem permissão.' });
        return;
      }

      db.prepare('DELETE FROM psychology_instruments WHERE id = ? AND tenant_id = ?').run(id, tenantId);
      logPsychologyAudit(req, inst.patient_id, 'delete_instrument', 'psychology_instruments', id, `Exclusão de instrumento: ${inst.instrument_name}`);
      res.json({ message: 'Instrumento excluído com sucesso.' });
    } catch (err: any) {
      console.error('[PsychologyController.deleteInstrument]', err);
      res.status(500).json({ error: 'Erro ao excluir instrumento.' });
    }
  }

  // ==========================================================================
  // 7. TRIAGENS E ESCALAS (Fontes Complementares)
  // ==========================================================================
  static getScreenings(req: Request, res: Response): void {
    try {
      const patientId = getParam(req.params.patientId);
      const tenantId = req.tenantId;

      if (!hasPsychologyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: Sigilo profissional.' });
        return;
      }

      const rows = db.prepare('SELECT * FROM psychology_screenings WHERE patient_id = ? AND tenant_id = ? ORDER BY application_date DESC').all(patientId, tenantId);
      res.json(rows);
    } catch (err: any) {
      console.error('[PsychologyController.getScreenings]', err);
      res.status(500).json({ error: 'Erro ao listar triagens.' });
    }
  }

  static saveScreening(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId;
      const body = req.body;
      const patientId = getParam(body.patientId);

      if (!patientId || !hasPsychologyAccess(req, patientId)) {
        res.status(403).json({ error: 'Sem permissão para registrar triagem.' });
        return;
      }

      if (!body.screeningName) {
        res.status(400).json({ error: 'Nome da ferramenta de triagem/escala é obrigatório.' });
        return;
      }

      const id = body.id || `scr-${uuidv4()}`;

      db.prepare(`
        INSERT INTO psychology_screenings (
          id, tenant_id, patient_id, screening_name, version,
          bibliographic_reference, target_population, purpose, license_notes,
          application_date, score_raw, classification, clinical_notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          screening_name = excluded.screening_name,
          version = excluded.version,
          bibliographic_reference = excluded.bibliographic_reference,
          target_population = excluded.target_population,
          purpose = excluded.purpose,
          license_notes = excluded.license_notes,
          application_date = excluded.application_date,
          score_raw = excluded.score_raw,
          classification = excluded.classification,
          clinical_notes = excluded.clinical_notes
      `).run(
        id, tenantId, patientId, body.screeningName.trim(), body.version || null,
        body.bibliographicReference || null, body.targetPopulation || null, body.purpose || null,
        body.licenseNotes || null,
        body.applicationDate || new Date().toISOString().split('T')[0],
        body.scoreRaw || null, body.classification || null, body.clinicalNotes || null,
        userId || null
      );

      logPsychologyAudit(req, patientId, 'save_screening', 'psychology_screenings', id, `Registro de triagem: ${body.screeningName}`);
      res.json({ message: 'Instrumento de triagem registrado!', id });
    } catch (err: any) {
      console.error('[PsychologyController.saveScreening]', err);
      res.status(500).json({ error: 'Erro ao registrar triagem.' });
    }
  }

  static deleteScreening(req: Request, res: Response): void {
    try {
      const id = getParam(req.params.id);
      const tenantId = req.tenantId;

      const scr = db.prepare('SELECT patient_id, screening_name FROM psychology_screenings WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!scr || !hasPsychologyAccess(req, scr.patient_id)) {
        res.status(404).json({ error: 'Triagem não encontrada ou sem permissão.' });
        return;
      }

      db.prepare('DELETE FROM psychology_screenings WHERE id = ? AND tenant_id = ?').run(id, tenantId);
      logPsychologyAudit(req, scr.patient_id, 'delete_screening', 'psychology_screenings', id, `Exclusão de triagem: ${scr.screening_name}`);
      res.json({ message: 'Triagem excluída com sucesso.' });
    } catch (err: any) {
      console.error('[PsychologyController.deleteScreening]', err);
      res.status(500).json({ error: 'Erro ao excluir triagem.' });
    }
  }

  // ==========================================================================
  // 8. SESSÕES E EVOLUÇÕES (Presencial & Online TDIC - Res. CFP 09/2024)
  // ==========================================================================
  static getSessions(req: Request, res: Response): void {
    try {
      const patientId = getParam(req.params.patientId);
      const tenantId = req.tenantId;

      if (!hasPsychologyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: Sigilo profissional.' });
        return;
      }

      const rows = db.prepare('SELECT * FROM psychology_sessions WHERE patient_id = ? AND tenant_id = ? ORDER BY session_date DESC, created_at DESC').all(patientId, tenantId);
      res.json(rows);
    } catch (err: any) {
      console.error('[PsychologyController.getSessions]', err);
      res.status(500).json({ error: 'Erro ao listar sessões.' });
    }
  }

  static saveSession(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId;
      const body = req.body;
      const patientId = getParam(body.patientId);

      if (!patientId || !hasPsychologyAccess(req, patientId)) {
        res.status(403).json({ error: 'Sem permissão para registrar sessão.' });
        return;
      }

      if (!body.clinicalEvolution || !body.clinicalEvolution.trim()) {
        res.status(400).json({ error: 'O registro da evolução clínica da sessão é obrigatório.' });
        return;
      }

      const id = body.id || `sess-${uuidv4()}`;
      const existing = db.prepare('SELECT id, is_sealed, amendments_json FROM psychology_sessions WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;

      if (existing && existing.is_sealed === 1) {
        res.status(409).json({
          error: 'Esta sessão de psicologia já está selada e não pode ser sobrescrita. Use a opção de Adendo.'
        });
        return;
      }

      const sessionDate = body.sessionDate || new Date().toISOString().split('T')[0];
      const countRow = db.prepare('SELECT COUNT(*) as c FROM psychology_sessions WHERE patient_id = ? AND tenant_id = ?').get(patientId, tenantId) as any;
      const sessionNumber = body.sessionNumber || (countRow?.c || 0) + 1;

      const tdicInfo = body.modality === 'online' ? (
        typeof body.tdicInfoJson === 'object' ? JSON.stringify(body.tdicInfoJson) : (body.tdicInfoJson || null)
      ) : null;

      db.prepare(`
        INSERT INTO psychology_sessions (
          id, tenant_id, patient_id, professional_id, appointment_id, session_number,
          session_date, modality, tdic_info_json, current_demand, relevant_themes,
          interventions_used, patient_response, clinical_evolution, conduct_plan,
          referrals, next_session_plan, session_risk_notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          session_number = excluded.session_number,
          session_date = excluded.session_date,
          modality = excluded.modality,
          tdic_info_json = excluded.tdic_info_json,
          current_demand = excluded.current_demand,
          relevant_themes = excluded.relevant_themes,
          interventions_used = excluded.interventions_used,
          patient_response = excluded.patient_response,
          clinical_evolution = excluded.clinical_evolution,
          conduct_plan = excluded.conduct_plan,
          referrals = excluded.referrals,
          next_session_plan = excluded.next_session_plan,
          session_risk_notes = excluded.session_risk_notes,
          updated_at = datetime('now')
      `).run(
        id, tenantId, patientId, body.professionalId || null, body.appointmentId || null, sessionNumber,
        sessionDate, body.modality || 'presencial', tdicInfo, body.currentDemand || null,
        body.relevantThemes || null, body.interventionsUsed || null, body.patientResponse || null,
        body.clinicalEvolution.trim(), body.conductPlan || null, body.referrals || null,
        body.nextSessionPlan || null, body.sessionRiskNotes || null, userId || null
      );

      logPsychologyAudit(req, patientId, 'save_session', 'psychology_sessions', id, `Registro da sessão #${sessionNumber}`);
      res.json({ message: 'Sessão psicológica salva!', id, sessionNumber });
    } catch (err: any) {
      console.error('[PsychologyController.saveSession]', err);
      res.status(500).json({ error: 'Erro ao salvar sessão.' });
    }
  }

  static sealSession(req: Request, res: Response): void {
    try {
      const id = getParam(req.params.id);
      const tenantId = req.tenantId;

      const session = db.prepare('SELECT * FROM psychology_sessions WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!session || !hasPsychologyAccess(req, session.patient_id)) {
        res.status(404).json({ error: 'Sessão não encontrada ou sem permissão.' });
        return;
      }

      if (session.is_sealed === 1) {
        res.json({ message: 'Esta sessão já se encontra selada.', hash: session.signature_hash });
        return;
      }

      const prof = db.prepare('SELECT name, registration_type, registration_number FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user?.userId, tenantId) as any;
      const signerName = prof?.name || req.user?.name || 'Psicólogo(a) Responsável';
      const signerReg = prof?.registration_type && prof?.registration_number
        ? `${prof.registration_type} ${prof.registration_number}`
        : (prof?.registration_number || 'CRP Não informado');

      const hashPayload = [
        session.id,
        session.patient_id,
        session.session_date,
        session.clinical_evolution,
        session.conduct_plan,
        signerName,
        signerReg,
        new Date().toISOString()
      ].join('||');

      const signatureHash = crypto.createHash('sha256').update(hashPayload, 'utf8').digest('hex');
      const sealedAt = new Date().toISOString();

      db.prepare(`
        UPDATE psychology_sessions SET
          is_sealed = 1,
          signature_hash = ?,
          signed_at = ?,
          signed_by_name = ?,
          signed_by_registration = ?,
          sealed_at = ?,
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(signatureHash, sealedAt, signerName, signerReg, sealedAt, id, tenantId);

      logPsychologyAudit(req, session.patient_id, 'seal_session', 'psychology_sessions', id, `Selamento imutável com hash ${signatureHash.slice(0, 10)}...`);
      res.json({ message: 'Sessão selada com sucesso e tornada imutável!', signatureHash, sealedAt });
    } catch (err: any) {
      console.error('[PsychologyController.sealSession]', err);
      res.status(500).json({ error: 'Erro ao selar sessão.' });
    }
  }

  static addSessionAmendment(req: Request, res: Response): void {
    try {
      const id = getParam(req.params.id);
      const tenantId = req.tenantId;
      const { amendmentText } = req.body;

      if (!amendmentText || !amendmentText.trim()) {
        res.status(400).json({ error: 'Texto do adendo é obrigatório.' });
        return;
      }

      const session = db.prepare('SELECT * FROM psychology_sessions WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!session || !hasPsychologyAccess(req, session.patient_id)) {
        res.status(404).json({ error: 'Sessão não encontrada ou sem permissão.' });
        return;
      }

      const prof = db.prepare('SELECT name, registration_type, registration_number FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user?.userId, tenantId) as any;
      const authorName = prof?.name || req.user?.name || 'Psicólogo(a)';
      const authorReg = prof?.registration_type && prof?.registration_number ? `${prof.registration_type} ${prof.registration_number}` : '';

      const currentAmendments = JSON.parse(session.amendments_json || '[]');
      const amendment = {
        id: `amend-${Date.now()}`,
        text: amendmentText.trim(),
        authorName,
        authorRegistration: authorReg,
        authorId: req.user?.userId,
        createdAt: new Date().toISOString()
      };
      currentAmendments.push(amendment);

      db.prepare(`
        UPDATE psychology_sessions SET
          amendments_json = ?,
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(JSON.stringify(currentAmendments), id, tenantId);

      logPsychologyAudit(req, session.patient_id, 'add_amendment', 'psychology_sessions', id, 'Inclusão de adendo clínico');
      res.json({ message: 'Adendo registrado com sucesso!', amendment });
    } catch (err: any) {
      console.error('[PsychologyController.addSessionAmendment]', err);
      res.status(500).json({ error: 'Erro ao registrar adendo na sessão.' });
    }
  }

  // ==========================================================================
  // 9. METAS TERAPÊUTICAS (Neutras em Relação à Abordagem)
  // ==========================================================================
  static getGoals(req: Request, res: Response): void {
    try {
      const patientId = getParam(req.params.patientId);
      const tenantId = req.tenantId;

      if (!hasPsychologyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: Sigilo profissional.' });
        return;
      }

      const rows = db.prepare('SELECT * FROM psychology_goals WHERE patient_id = ? AND tenant_id = ? ORDER BY created_at ASC').all(patientId, tenantId);
      res.json(rows);
    } catch (err: any) {
      console.error('[PsychologyController.getGoals]', err);
      res.status(500).json({ error: 'Erro ao listar metas.' });
    }
  }

  static saveGoal(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId;
      const body = req.body;
      const patientId = getParam(body.patientId);

      if (!patientId || !hasPsychologyAccess(req, patientId)) {
        res.status(403).json({ error: 'Sem permissão para gerenciar metas.' });
        return;
      }

      if (!body.title || !body.title.trim()) {
        res.status(400).json({ error: 'Título do objetivo terapêutico é obrigatório.' });
        return;
      }

      const id = body.id || `goal-${uuidv4()}`;

      db.prepare(`
        INSERT INTO psychology_goals (
          id, tenant_id, patient_id, professional_id, title, indicator,
          target_period, strategy, status, review_date, completion_reason, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          indicator = excluded.indicator,
          target_period = excluded.target_period,
          strategy = excluded.strategy,
          status = excluded.status,
          review_date = excluded.review_date,
          completion_reason = excluded.completion_reason,
          notes = excluded.notes,
          updated_at = datetime('now')
      `).run(
        id, tenantId, patientId, body.professionalId || null, body.title.trim(),
        body.indicator || null, body.targetPeriod || null, body.strategy || null,
        body.status || 'a_iniciar', body.reviewDate || null, body.completionReason || null,
        body.notes || null, userId || null
      );

      logPsychologyAudit(req, patientId, 'save_goal', 'psychology_goals', id, `Meta terapêutica: ${body.title}`);
      res.json({ message: 'Meta terapêutica salva com sucesso!', id });
    } catch (err: any) {
      console.error('[PsychologyController.saveGoal]', err);
      res.status(500).json({ error: 'Erro ao salvar meta terapêutica.' });
    }
  }

  static updateGoal(req: Request, res: Response): void {
    try {
      const id = getParam(req.params.id);
      const tenantId = req.tenantId;
      const body = req.body;

      const goal = db.prepare('SELECT patient_id FROM psychology_goals WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!goal || !hasPsychologyAccess(req, goal.patient_id)) {
        res.status(404).json({ error: 'Meta não encontrada ou sem permissão.' });
        return;
      }

      db.prepare(`
        UPDATE psychology_goals SET
          status = COALESCE(?, status),
          completion_reason = COALESCE(?, completion_reason),
          review_date = COALESCE(?, review_date),
          notes = COALESCE(?, notes),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(body.status || null, body.completionReason || null, body.reviewDate || null, body.notes || null, id, tenantId);

      logPsychologyAudit(req, goal.patient_id, 'update_goal', 'psychology_goals', id, `Atualização da meta para status ${body.status}`);
      res.json({ message: 'Meta atualizada com sucesso!' });
    } catch (err: any) {
      console.error('[PsychologyController.updateGoal]', err);
      res.status(500).json({ error: 'Erro ao atualizar meta.' });
    }
  }

  static deleteGoal(req: Request, res: Response): void {
    try {
      const id = getParam(req.params.id);
      const tenantId = req.tenantId;

      const goal = db.prepare('SELECT patient_id, title FROM psychology_goals WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!goal || !hasPsychologyAccess(req, goal.patient_id)) {
        res.status(404).json({ error: 'Meta não encontrada ou sem permissão.' });
        return;
      }

      db.prepare('DELETE FROM psychology_goals WHERE id = ? AND tenant_id = ?').run(id, tenantId);
      logPsychologyAudit(req, goal.patient_id, 'delete_goal', 'psychology_goals', id, `Exclusão de meta: ${goal.title}`);
      res.json({ message: 'Meta excluída com sucesso.' });
    } catch (err: any) {
      console.error('[PsychologyController.deleteGoal]', err);
      res.status(500).json({ error: 'Erro ao excluir meta.' });
    }
  }

  // ==========================================================================
  // 10. CONCLUIR ATENDIMENTO (Selamento Criptográfico & Sucesso)
  // ==========================================================================
  static finishConsultation(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId;
      const {
        patientId: rawPatientId,
        appointmentId,
        sessionNumber,
        sessionDate,
        modality,
        tdicInfo,
        currentDemand,
        relevantThemes,
        interventionsUsed,
        patientResponse,
        clinicalEvolution,
        conductPlan,
        referrals,
        nextSessionPlan,
        sessionRiskNotes
      } = req.body;

      const patientId = getParam(rawPatientId);

      if (!patientId || !hasPsychologyAccess(req, patientId)) {
        res.status(403).json({ error: 'Sem permissão para concluir atendimento psicológico.' });
        return;
      }

      if (!clinicalEvolution || !clinicalEvolution.trim()) {
        res.status(400).json({ error: 'O relato da evolução clínica é indispensável para concluir e selar o atendimento.' });
        return;
      }

      let resolvedProfId: string | null = null;
      let signerName = req.user?.name || 'Psicólogo(a) Responsável';
      let signerReg = 'CRP Não informado';

      if (req.body.professionalId || req.body.professional_id) {
        const candidateId = String(req.body.professionalId || req.body.professional_id);
        const pRow = db.prepare('SELECT id, name, registration_type, registration_number FROM professionals WHERE id = ? AND tenant_id = ?').get(candidateId, tenantId) as any;
        if (pRow) {
          resolvedProfId = pRow.id;
          if (pRow.name) signerName = pRow.name;
          if (pRow.registration_number) signerReg = `${pRow.registration_type || 'CRP'} ${pRow.registration_number}`;
        }
      }

      if (!resolvedProfId) {
        const profByUser = db.prepare('SELECT id, name, registration_type, registration_number FROM professionals WHERE user_id = ? AND tenant_id = ?').get(userId, tenantId) as any;
        if (profByUser) {
          resolvedProfId = profByUser.id;
          if (profByUser.name) signerName = profByUser.name;
          if (profByUser.registration_number) signerReg = `${profByUser.registration_type || 'CRP'} ${profByUser.registration_number}`;
        }
      }

      if (!resolvedProfId && appointmentId) {
        const apptProf = db.prepare('SELECT professional_id FROM appointments WHERE id = ? AND tenant_id = ?').get(appointmentId, tenantId) as any;
        if (apptProf?.professional_id) {
          const pRow = db.prepare('SELECT id, name, registration_type, registration_number FROM professionals WHERE id = ? AND tenant_id = ?').get(apptProf.professional_id, tenantId) as any;
          if (pRow) {
            resolvedProfId = pRow.id;
            if (pRow.name) signerName = pRow.name;
            if (pRow.registration_number) signerReg = `${pRow.registration_type || 'CRP'} ${pRow.registration_number}`;
          }
        }
      }

      if (!resolvedProfId) {
        const anyProf = db.prepare('SELECT id, name, registration_type, registration_number FROM professionals WHERE tenant_id = ? AND active = 1 ORDER BY created_at ASC LIMIT 1').get(tenantId) as any;
        if (anyProf) {
          resolvedProfId = anyProf.id;
          if (anyProf.name) signerName = anyProf.name;
          if (anyProf.registration_number) signerReg = `${anyProf.registration_type || 'CRP'} ${anyProf.registration_number}`;
        }
      }

      if (!resolvedProfId) {
        const newProfId = `prof-psico-${uuidv4().slice(0, 8)}`;
        db.prepare(`
          INSERT INTO professionals (
            id, tenant_id, user_id, name, email, registration_type, registration_number, active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'CRP', 'Não informado', 1, datetime('now'), datetime('now'))
        `).run(
          newProfId, tenantId, userId || null, req.user?.name || 'Psicólogo Responsável', req.user?.email || 'psicologia@zemda.com.br'
        );
        resolvedProfId = newProfId;
      }

      const nowIso = new Date().toISOString();
      const sessionId = `sess-${uuidv4()}`;

      const hashPayload = [
        sessionId,
        patientId,
        sessionDate || nowIso.split('T')[0],
        clinicalEvolution.trim(),
        conductPlan || '',
        signerName,
        signerReg,
        nowIso
      ].join('||');
      const signatureHash = crypto.createHash('sha256').update(hashPayload, 'utf8').digest('hex');

      db.prepare(`
        INSERT INTO psychology_sessions (
          id, tenant_id, patient_id, professional_id, appointment_id, session_number,
          session_date, modality, tdic_info_json, current_demand, relevant_themes,
          interventions_used, patient_response, clinical_evolution, conduct_plan,
          referrals, next_session_plan, session_risk_notes, is_sealed, signature_hash,
          signed_at, signed_by_name, signed_by_registration, sealed_at, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
      `).run(
        sessionId, tenantId, patientId, resolvedProfId, appointmentId || null,
        sessionNumber || 1, sessionDate || nowIso.split('T')[0], modality || 'presencial',
        tdicInfo ? JSON.stringify(tdicInfo) : null,
        currentDemand || null, relevantThemes || null, interventionsUsed || null,
        patientResponse || null, clinicalEvolution.trim(), conductPlan || null,
        referrals || null, nextSessionPlan || null, sessionRiskNotes || null,
        signatureHash, nowIso, signerName, signerReg, nowIso, userId || null
      );

      const recordId = `rec-${uuidv4()}`;
      db.prepare(`
        INSERT INTO records (
          id, tenant_id, patient_id, professional_id, appointment_id,
          session_date, title, clinical_evolution, technical_notes,
          module_type, is_sealed, signature_hash, signed_at, signed_by_user_id,
          signer_name, signer_registration, sealed_at, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ZemdaPsico', 1, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        recordId, tenantId, patientId, resolvedProfId, appointmentId || null,
        sessionDate || nowIso.split('T')[0],
        `Sessão de Psicologia Clínica #${sessionNumber || 1} (${modality === 'online' ? 'Online TDIC' : 'Presencial'})`,
        clinicalEvolution.trim(),
        conductPlan || null,
        signatureHash, nowIso, userId || null, signerName, signerReg, nowIso, userId || null
      );

      if (appointmentId) {
        db.prepare(`
          UPDATE appointments SET
            status = 'completed',
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(appointmentId, tenantId);

        db.prepare(`
          INSERT INTO consultation_completions (
            appointment_id, tenant_id, generated_docs_json, payload_json, saved_by, completed_at
          ) VALUES (?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(appointment_id) DO UPDATE SET
            completed_at = datetime('now'),
            generated_docs_json = excluded.generated_docs_json,
            payload_json = excluded.payload_json
        `).run(
          appointmentId,
          tenantId,
          JSON.stringify({ sessionId, recordId, signatureHash }),
          JSON.stringify({ modality, sessionNumber, sessionDate }),
          userId || resolvedProfId || 'prof-psico'
        );
      }

      logPsychologyAudit(req, patientId, 'finish_consultation', 'psychology_sessions', sessionId, `Atendimento concluído e selado com hash ${signatureHash.slice(0, 10)}`);

      res.json({
        message: 'Atendimento de Psicologia finalizado e selado com sucesso!',
        sessionId,
        recordId,
        signatureHash,
        sealedAt: nowIso,
        signerName,
        signerRegistration: signerReg
      });
    } catch (err: any) {
      console.error('[PsychologyController.finishConsultation]', err);
      res.status(500).json({ error: 'Erro ao concluir atendimento de psicologia.' });
    }
  }

  // ==========================================================================
  // 11. DOCUMENTOS PSICOLÓGICOS (Resolução CFP nº 06/2019 e Manual CFP 2025)
  // ==========================================================================
  static getDocuments(req: Request, res: Response): void {
    try {
      const patientId = getParam(req.params.patientId);
      const tenantId = req.tenantId;

      if (!hasPsychologyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: Sigilo profissional.' });
        return;
      }

      const rows = db.prepare('SELECT * FROM psychology_documents WHERE patient_id = ? AND tenant_id = ? ORDER BY created_at DESC').all(patientId, tenantId);
      res.json(rows);
    } catch (err: any) {
      console.error('[PsychologyController.getDocuments]', err);
      res.status(500).json({ error: 'Erro ao listar documentos.' });
    }
  }

  static createDocument(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId;
      const {
        patientId: rawPatientId,
        appointmentId,
        documentType,
        purpose,
        requesterName,
        contentJson,
        renderedText
      } = req.body;

      const patientId = getParam(rawPatientId);

      if (!patientId || !hasPsychologyAccess(req, patientId)) {
        res.status(403).json({ error: 'Sem permissão para emitir documento psicológico.' });
        return;
      }

      const validDocTypes = ['declaracao', 'atestado', 'relatorio', 'relatorio_multiprofissional', 'laudo', 'parecer'];
      if (!documentType || !validDocTypes.includes(documentType)) {
        res.status(400).json({ error: 'Tipo de documento inválido conforme Resolução CFP nº 06/2019.' });
        return;
      }

      if (!purpose || !purpose.trim() || !requesterName || !requesterName.trim() || !renderedText || !renderedText.trim()) {
        res.status(400).json({ error: 'Finalidade, solicitante/interessado e conteúdo do documento são obrigatórios.' });
        return;
      }

      // 1. LAUDO PSICOLÓGICO: Somente quando existir processo estruturado de Avaliação Psicológica
      if (documentType === 'laudo') {
        const assessmentCount = db.prepare('SELECT COUNT(*) as c FROM psychology_assessments WHERE patient_id = ? AND tenant_id = ?').get(patientId, tenantId) as any;
        if (!assessmentCount || assessmentCount.c === 0) {
          res.status(422).json({
            error: 'Emissão bloqueada: O Laudo Psicológico resulta exclusivamente de um processo formal e estruturado de Avaliação Psicológica (Resolução CFP nº 06/2019 e 31/2022). Registre a Avaliação Psicológica antes de emitir este documento.',
            code: 'LAUDO_REQUIRES_ASSESSMENT'
          });
          return;
        }
      }

      // 2. ATESTADO PSICOLÓGICO: Somente quando houver fundamentação em Avaliação Psicológica e sem CID-11 automático
      if (documentType === 'atestado') {
        const hasAssessmentBasis = db.prepare(`
          SELECT 1 FROM psychology_assessments WHERE patient_id = ? AND tenant_id = ?
          UNION
          SELECT 1 FROM psychology_mental_state_exams WHERE patient_id = ? AND tenant_id = ?
          LIMIT 1
        `).get(patientId, tenantId, patientId, tenantId);

        if (!hasAssessmentBasis) {
          res.status(422).json({
            error: 'Emissão bloqueada: O Atestado Psicológico deve ser fundamentado em avaliação psicológica prévia realizada pelo profissional (Resolução CFP nº 06/2019).',
            code: 'ATESTADO_REQUIRES_EVALUATION'
          });
          return;
        }
      }

      // 3. DECLARAÇÃO: Proibido conteúdo clínico, diagnóstico ou sintomas
      if (documentType === 'declaracao') {
        const textLower = renderedText.toLowerCase();
        const prohibitedTerms = [
          'diagnóstico', 'diagnostico', 'cid-10', 'cid-11', 'dsm-5', 'sintoma',
          'depressão', 'ansiedade', 'transtorno', 'humor disfórico', 'psicopatologia'
        ];
        const found = prohibitedTerms.filter(term => textLower.includes(term));
        if (found.length > 0) {
          res.status(422).json({
            error: `Emissão bloqueada: A Declaração Psicológica tem finalidade estritamente comprobatória de comparecimento/horários. É vedado expressar sintomas, estados psicológicos ou diagnósticos (Resolução CFP nº 06/2019, Art. 9º). Termos identificados: ${found.join(', ')}.`,
            code: 'DECLARACAO_PROHIBITED_CLINICAL_CONTENT'
          });
          return;
        }
      }

      const prof = db.prepare('SELECT id, name, registration_type, registration_number FROM professionals WHERE user_id = ? AND tenant_id = ?').get(userId, tenantId) as any;
      const signerName = prof?.name || req.user?.name || 'Psicólogo(a) Responsável';
      const signerReg = prof?.registration_type && prof?.registration_number
        ? `${prof.registration_type} ${prof.registration_number}`
        : (prof?.registration_number || 'CRP');

      const currentYear = new Date().getFullYear();
      const countRow = db.prepare('SELECT COUNT(*) as c FROM psychology_documents WHERE tenant_id = ?').get(tenantId) as any;
      const docNumber = `DOC-PSICO-${currentYear}-${String((countRow?.c || 0) + 1).padStart(4, '0')}`;

      const nowIso = new Date().toISOString();
      const docId = `doc-${uuidv4()}`;

      const hashPayload = [
        docId,
        docNumber,
        patientId,
        documentType,
        purpose.trim(),
        requesterName.trim(),
        renderedText.trim(),
        signerName,
        signerReg,
        nowIso
      ].join('||');
      const signatureHash = crypto.createHash('sha256').update(hashPayload, 'utf8').digest('hex');

      db.prepare(`
        INSERT INTO psychology_documents (
          id, tenant_id, patient_id, professional_id, appointment_id, document_type,
          document_number, purpose, requester_name, content_json, rendered_text,
          version, is_sealed, sealed_at, signature_hash, signed_by_name,
          signed_by_registration, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?)
      `).run(
        docId, tenantId, patientId, prof?.id || 'prof-unknown', appointmentId || null,
        documentType, docNumber, purpose.trim(), requesterName.trim(),
        typeof contentJson === 'object' ? JSON.stringify(contentJson) : (contentJson || '{}'),
        renderedText.trim(), nowIso, signatureHash, signerName, signerReg, userId || null
      );

      logPsychologyAudit(req, patientId, 'emit_document', 'psychology_documents', docId, `Emissão de ${documentType.toUpperCase()} Nº ${docNumber}`);

      res.json({
        message: 'Documento psicológico emitido e selado com sucesso!',
        documentId: docId,
        documentNumber: docNumber,
        documentType,
        signatureHash,
        sealedAt: nowIso,
        signerName,
        signerRegistration: signerReg
      });
    } catch (err: any) {
      console.error('[PsychologyController.createDocument]', err);
      res.status(500).json({ error: 'Erro ao emitir documento psicológico.' });
    }
  }

  static registerDocumentDelivery(req: Request, res: Response): void {
    try {
      const id = getParam(req.params.id);
      const tenantId = req.tenantId;
      const { recipientName, deliveryDate, deliveryChannel, notes } = req.body;

      if (!recipientName || !deliveryChannel) {
        res.status(400).json({ error: 'Nome do recebedor e canal de entrega são obrigatórios.' });
        return;
      }

      const doc = db.prepare('SELECT patient_id, document_number FROM psychology_documents WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!doc || !hasPsychologyAccess(req, doc.patient_id)) {
        res.status(404).json({ error: 'Documento não encontrado ou sem permissão.' });
        return;
      }

      const receipt = {
        recipientName: recipientName.trim(),
        deliveryDate: deliveryDate || new Date().toISOString().split('T')[0],
        deliveryChannel,
        notes: notes || null,
        registeredBy: req.user?.name || req.user?.email,
        registeredAt: new Date().toISOString()
      };

      db.prepare(`
        UPDATE psychology_documents SET
          delivery_receipt_json = ?
        WHERE id = ? AND tenant_id = ?
      `).run(JSON.stringify(receipt), id, tenantId);

      logPsychologyAudit(req, doc.patient_id, 'register_delivery', 'psychology_documents', id, `Registro de entrega para ${recipientName} (${deliveryChannel})`);
      res.json({ message: 'Comprovante de entrega registrado com sucesso!', receipt });
    } catch (err: any) {
      console.error('[PsychologyController.registerDocumentDelivery]', err);
      res.status(500).json({ error: 'Erro ao registrar entrega de documento.' });
    }
  }

  static printDocumentPdf(req: Request, res: Response): void {
    try {
      const id = getParam(req.params.id);
      const tenantId = req.tenantId;

      const doc = db.prepare(`
        SELECT d.*, p.full_name as patient_name, p.cpf as patient_cpf, p.birth_date as patient_birth,
               t.name as clinic_name, t.cnpj_cpf as clinic_cnpj, t.address as clinic_address, t.phone as clinic_phone
        FROM psychology_documents d
        LEFT JOIN patients p ON p.id = d.patient_id
        LEFT JOIN tenants t ON t.id = d.tenant_id
        WHERE d.id = ? AND d.tenant_id = ?
      `).get(id, tenantId) as any;

      if (!doc || !hasPsychologyAccess(req, doc.patient_id)) {
        res.status(404).json({ error: 'Documento não encontrado ou acesso não autorizado.' });
        return;
      }

      logPsychologyAudit(req, doc.patient_id, 'print_document', 'psychology_documents', id, `Visualização/impressão do documento ${doc.document_number}`);

      const verificationUrl = `${process.env.APP_URL || 'https://zemda.app'}/verificar-documento?hash=${doc.signature_hash}`;
      const qrCodeData = generateQrCodeDataUrl(verificationUrl);

      const typeLabels: Record<string, string> = {
        declaracao: 'DECLARAÇÃO PSICOLÓGICA',
        atestado: 'ATESTADO PSICOLÓGICO',
        relatorio: 'RELATÓRIO PSICOLÓGICO',
        relatorio_multiprofissional: 'RELATÓRIO MULTIPROFISSIONAL',
        laudo: 'LAUDO PSICOLÓGICO',
        parecer: 'PARECER PSICOLÓGICO'
      };

      const title = typeLabels[doc.document_type] || 'DOCUMENTO PSICOLÓGICO OFICIAL';

      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${title} - ${doc.document_number}</title>
  <style>
    @page { size: A4; margin: 20mm 15mm 20mm 15mm; }
    body { font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #0f172a; line-height: 1.6; font-size: 11pt; }
    .header { text-align: center; border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 24px; }
    .header h1 { margin: 0; font-size: 16pt; color: #0f766e; text-transform: uppercase; letter-spacing: 0.5px; }
    .header .sub { font-size: 9pt; color: #64748b; margin-top: 4px; }
    .doc-number { text-align: right; font-size: 9pt; font-weight: bold; color: #475569; margin-bottom: 16px; }
    .metadata-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px; font-size: 9.5pt; }
    .metadata-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .meta-item strong { color: #1e293b; }
    .content { text-align: justify; margin-bottom: 36px; white-space: pre-wrap; font-size: 10.5pt; }
    .signature-area { margin-top: 40px; page-break-inside: avoid; }
    .signature-box { border-top: 1px solid #94a3b8; width: 320px; margin: 0 auto; text-align: center; padding-top: 8px; }
    .signature-box .name { font-weight: bold; font-size: 11pt; color: #0f172a; }
    .signature-box .reg { font-size: 9.5pt; color: #0f766e; font-weight: 600; }
    .digital-stamp { margin-top: 32px; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 12px; display: flex; align-items: center; justify-content: space-between; font-size: 8pt; color: #475569; background: #fafafa; }
    .digital-stamp .qr { width: 70px; height: 70px; }
    .digital-stamp .hash { font-family: monospace; word-break: break-all; font-size: 7.5pt; color: #334155; }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <div class="sub">${doc.clinic_name ? `${doc.clinic_name} • ` : ''}Em conformidade com a Resolução CFP nº 06/2019</div>
  </div>

  <div class="doc-number">Registro Nº: ${doc.document_number} • Versão ${doc.version}.0</div>

  <div class="metadata-box">
    <div class="metadata-grid">
      <div class="meta-item"><strong>Paciente:</strong> ${doc.patient_name || 'Paciente'}</div>
      <div class="meta-item"><strong>CPF:</strong> ${doc.patient_cpf || 'Não informado'}</div>
      <div class="meta-item"><strong>Solicitante/Interessado:</strong> ${doc.requester_name}</div>
      <div class="meta-item"><strong>Finalidade:</strong> ${doc.purpose}</div>
      <div class="meta-item"><strong>Profissional:</strong> ${doc.signed_by_name}</div>
      <div class="meta-item"><strong>Registro:</strong> ${doc.signed_by_registration}</div>
    </div>
  </div>

  <div class="content">${doc.rendered_text}</div>

  <div class="signature-area">
    <div class="signature-box">
      <div class="name">${doc.signed_by_name}</div>
      <div class="reg">${doc.signed_by_registration}</div>
      <div style="font-size: 8.5pt; color: #64748b; margin-top: 2px;">Psicólogo(a) Responsável</div>
    </div>
  </div>

  <div class="digital-stamp">
    <div style="flex: 1; padding-right: 12px;">
      <strong style="color: #0f766e;">Assinatura Eletrônica e Selamento Criptográfico</strong><br>
      Documento digital assinado em ${new Date(doc.sealed_at).toLocaleString('pt-BR')} sob os termos da MP 2.200-2/2001 e Resoluções CFP 01/2009 e 06/2019.<br>
      <span class="hash">Hash SHA-256: ${doc.signature_hash}</span><br>
      Consulte a autenticidade e validade ética escaneando o QR Code ao lado.
    </div>
    <img src="${qrCodeData}" class="qr" alt="QR Code de Verificação" />
  </div>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err: any) {
      console.error('[PsychologyController.printDocumentPdf]', err);
      res.status(500).json({ error: 'Erro ao gerar impressão do documento.' });
    }
  }

  // ==========================================================================
  // 12. IA ÉTICA NO ZEMDAPSICO (Normas e Diretrizes do CFP)
  // ==========================================================================
  static async aiAssist(req: Request, res: Response): Promise<void> {
    try {
      const { text, mode, patientId: rawPatientId } = req.body;
      const patientId = getParam(rawPatientId);

      if (!hasPsychologyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: IA restrita a profissionais de Psicologia autorizados.' });
        return;
      }

      if (!text || !text.trim()) {
        res.status(400).json({ error: 'Texto para estruturação é obrigatório.' });
        return;
      }

      const rawInput = text.trim();
      let generated = '';

      if (GeminiService.isAvailable()) {
        try {
          const improved = await GeminiService.improveText(rawInput, 'grammar');
          if (improved?.improvedText) {
            generated = improved.improvedText;
          }
        } catch (gemErr) {
          console.warn('[ZemdaPsico.aiAssist] Fallback para heurística local:', gemErr);
        }
      }

      if (!generated) {
        const cleaned = rawInput.split('\n').filter((l: string) => l.trim().length > 0);
        generated = cleaned.map((line: string) => `• ${line.trim()}`).join('\n');
      }

      const badge = `[RASCUNHO GERADO POR IA — EXIGE REVISÃO E APROVAÇÃO DO PSICÓLOGO]\n\n`;
      const finalResult = badge + generated.trim();

      logPsychologyAudit(req, patientId || 'none', 'ai_assist', 'text_generation', undefined, `Uso de IA no modo ${mode || 'default'}`);

      res.json({
        result: finalResult,
        warning: 'Todo conteúdo gerado por IA é apenas rascunho e exige conferência, validação e responsabilidade ética do psicólogo responsável.'
      });
    } catch (err: any) {
      console.error('[PsychologyController.aiAssist]', err);
      res.status(500).json({ error: 'Erro ao processar assistência com IA.' });
    }
  }

  // ==========================================================================
  // 13. HISTÓRICO PSICOLÓGICO LONGITUDINAL
  // ==========================================================================
  static getHistory(req: Request, res: Response): void {
    try {
      const patientId = getParam(req.params.patientId);
      const tenantId = req.tenantId;

      if (!hasPsychologyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: Sigilo profissional.' });
        return;
      }

      const sessions = db.prepare(`
        SELECT id, session_number, session_date, modality, clinical_evolution, conduct_plan,
               is_sealed, signed_by_name, signed_by_registration, sealed_at, amendments_json, created_at
        FROM psychology_sessions
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY session_date DESC, created_at DESC
      `).all(patientId, tenantId) as any[];

      const documents = db.prepare(`
        SELECT id, document_type, document_number, purpose, requester_name, version,
               is_sealed, signed_by_name, signed_by_registration, sealed_at, delivery_receipt_json, created_at
        FROM psychology_documents
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY created_at DESC
      `).all(patientId, tenantId) as any[];

      const assessments = db.prepare(`
        SELECT id, assessment_title, purpose, start_date, completion_date, status, is_sealed, created_at
        FROM psychology_assessments
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY start_date DESC
      `).all(patientId, tenantId) as any[];

      logPsychologyAudit(req, patientId, 'view_history', 'patient_history', patientId, 'Consulta de histórico psicológico');

      res.json({
        sessions,
        documents,
        assessments
      });
    } catch (err: any) {
      console.error('[PsychologyController.getHistory]', err);
      res.status(500).json({ error: 'Erro ao carregar histórico psicológico.' });
    }
  }

  // ==========================================================================
  // 14. AUDITORIA (Rastreabilidade e Sigilo)
  // ==========================================================================
  static getAuditLogs(req: Request, res: Response): void {
    try {
      const patientId = getParam(req.params.patientId);
      const tenantId = req.tenantId;

      if (!hasPsychologyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: Sigilo profissional.' });
        return;
      }

      const rows = db.prepare('SELECT * FROM psychology_audit_logs WHERE patient_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 50').all(patientId, tenantId);
      res.json(rows);
    } catch (err: any) {
      console.error('[PsychologyController.getAuditLogs]', err);
      res.status(500).json({ error: 'Erro ao obter logs de auditoria.' });
    }
  }

  // ==========================================================================
  // 15. RASCUNHOS & AUTOSAVE DO ATENDIMENTO
  // ==========================================================================
  static getDraft(req: Request, res: Response): void {
    try {
      const patientId = getParam(req.params.patientId);
      const rawAppId = req.query.appointmentId || req.query.appointment_id;
      const appointmentId = rawAppId ? String(rawAppId) : null;
      const tenantId = req.tenantId;

      if (!hasPsychologyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: Sigilo profissional.' });
        return;
      }

      let draft: any = null;
      if (appointmentId) {
        draft = db.prepare(`
          SELECT * FROM psychology_drafts 
          WHERE tenant_id = ? AND patient_id = ? AND appointment_id = ?
          ORDER BY updated_at DESC LIMIT 1
        `).get(tenantId, patientId, appointmentId);
      }

      if (!draft) {
        draft = db.prepare(`
          SELECT * FROM psychology_drafts 
          WHERE tenant_id = ? AND patient_id = ? AND (appointment_id IS NULL OR appointment_id = '')
          ORDER BY updated_at DESC LIMIT 1
        `).get(tenantId, patientId);
      }

      if (!draft) {
        res.json({ draft: null });
        return;
      }

      const parsedData = JSON.parse(draft.draft_data_json || '{}');

      res.json({
        draft: {
          id: draft.id,
          patientId: draft.patient_id,
          patient_id: draft.patient_id,
          appointmentId: draft.appointment_id,
          appointment_id: draft.appointment_id,
          draftData: parsedData,
          draft_data: parsedData,
          clientUpdatedAt: draft.client_updated_at,
          client_updated_at: draft.client_updated_at,
          updatedAt: draft.updated_at,
          updated_at: draft.updated_at
        }
      });
    } catch (err: any) {
      console.error('[PsychologyController.getDraft]', err);
      res.status(500).json({ error: 'Erro ao carregar rascunho de atendimento.' });
    }
  }

  static saveDraft(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId;
      const {
        patientId: rawPatientId,
        appointmentId: rawAppId1,
        appointment_id: rawAppId2,
        draftData: rawDraftData1,
        draft_data: rawDraftData2,
        clientUpdatedAt: rawClientUpdated1,
        client_updated_at: rawClientUpdated2
      } = req.body;
      const patientId = getParam(rawPatientId);
      const appointmentId = rawAppId1 || rawAppId2 || null;
      const draftData = rawDraftData1 || rawDraftData2;
      const clientUpdatedAt = rawClientUpdated1 || rawClientUpdated2;

      if (!patientId || !hasPsychologyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: Sigilo profissional.' });
        return;
      }

      if (!draftData) {
        res.status(400).json({ error: 'Dados do rascunho são obrigatórios.' });
        return;
      }

      const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(userId, tenantId) as any;
      const profId = prof?.id || null;
      const resolvedAppId = appointmentId || null;
      const resolvedClientUpdated = clientUpdatedAt || new Date().toISOString();

      // Previne sobrescrita caso a versão do banco seja estritamente mais recente que a versão recebida
      const existing = db.prepare(`
        SELECT id, client_updated_at FROM psychology_drafts
        WHERE tenant_id = ? AND patient_id = ? AND COALESCE(appointment_id, 'none') = COALESCE(?, 'none')
      `).get(tenantId, patientId, resolvedAppId) as any;

      if (existing && existing.client_updated_at && resolvedClientUpdated) {
        const existingTime = new Date(existing.client_updated_at).getTime();
        const incomingTime = new Date(resolvedClientUpdated).getTime();
        if (!isNaN(existingTime) && !isNaN(incomingTime) && incomingTime < existingTime) {
          res.status(409).json({ error: 'Rascunho já atualizado com versão mais recente.', id: existing.id, savedAt: existing.client_updated_at });
          return;
        }
      }

      const id = existing?.id || `drf-psico-${uuidv4().slice(0, 10)}`;
      const draftJson = JSON.stringify(draftData);

      if (existing) {
        db.prepare(`
          UPDATE psychology_drafts SET
            draft_data_json = ?,
            client_updated_at = ?,
            professional_id = COALESCE(?, professional_id),
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(draftJson, resolvedClientUpdated, profId, existing.id, tenantId);
      } else {
        db.prepare(`
          INSERT INTO psychology_drafts (
            id, tenant_id, patient_id, professional_id, appointment_id,
            draft_data_json, client_updated_at, updated_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(id, tenantId, patientId, profId, resolvedAppId, draftJson, resolvedClientUpdated);
      }

      res.json({ success: true, message: 'Rascunho salvo com sucesso!', id, savedAt: new Date().toISOString() });
    } catch (err: any) {
      console.error('[PsychologyController.saveDraft]', err);
      res.status(500).json({ error: 'Erro ao salvar rascunho de atendimento.' });
    }
  }
}
