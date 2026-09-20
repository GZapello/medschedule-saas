import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { logAudit } from '../middlewares/audit.middleware';

/**
 * Validação de acesso estrito ao prontuário psicopedagógico (ZemdaPP)
 * Garante sigilo profissional absoluto e bloqueio de perfis não clínicos e não autorizados.
 */
export function hasPsychopedagogyAccess(req: Request, patientId?: string | string[]): boolean {
  if (!req.user || !req.tenantId) return false;

  // 1. SuperAdmin global NUNCA visualiza prontuários clínicos/psicopedagógicos
  if (req.user.role === 'superadmin') return false;

  // 2. Bloqueio total de perfis não clínicos (recepção, financeiro, secretária, assistente)
  const role = String(req.user.role || '').toLowerCase();
  if (['receptionist', 'financial', 'secretary', 'assistant'].includes(role)) {
    return false;
  }

  const clinicUser = db.prepare(`
    SELECT cu.role, cu.status as cu_status, cu.is_manager, cu.permissions_json, cu.zemda_pp_enabled,
           u.status as u_status, u.profession_name, u.practice_areas as u_practice_areas, u.zemda_pp_enabled as u_zemda_pp_enabled
    FROM users u
    LEFT JOIN clinic_users cu ON cu.user_id = u.id AND cu.tenant_id = ?
    WHERE u.id = ?
  `).get(req.tenantId, req.user.userId) as any;

  if (clinicUser?.u_status === 'inactive' || clinicUser?.u_status === 'blocked' || clinicUser?.cu_status === 'inactive' || clinicUser?.cu_status === 'blocked') {
    return false;
  }

  const prof = db.prepare(`
    SELECT p.id, p.profession_id, p.practice_areas, p.zemda_pp_enabled,
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
    clinicUser?.profession_name,
    clinicUser?.u_practice_areas,
    req.user.role === 'clinic_admin' ? tenant?.manager_profession : null,
    req.user.role === 'clinic_admin' ? tenant?.manager_practice_areas : null
  ].filter(Boolean).join(' ').toLowerCase();

  const isPPArea =
    prof?.profession_id === 'prof-psicopedagogo' ||
    prof?.profession_id === 'prof-psicopedagogia' ||
    combinedText.includes('psicopedago') ||
    combinedText.includes('abpp');

  const isExplicitlyEnabled =
    Number(prof?.zemda_pp_enabled) === 1 ||
    Number(clinicUser?.zemda_pp_enabled) === 1 ||
    Number(clinicUser?.u_zemda_pp_enabled) === 1;

  // Se for o próprio psicopedagogo com formação/permissão
  if (isPPArea || isExplicitlyEnabled) {
    return true;
  }

  // Se for outro profissional ou gestor não psicopedagogo, checa compartilhamento explícito para o paciente
  const pid = Array.isArray(patientId) ? patientId[0] : patientId;
  if (pid) {
    const share = db.prepare(`
      SELECT id FROM psychopedagogy_shares 
      WHERE tenant_id = ? AND patient_id = ? AND shared_with_user_id = ?
        AND (expires_at IS NULL OR expires_at > datetime('now'))
    `).get(req.tenantId, pid, req.user.userId) as any;

    if (share) {
      return true;
    }
  }

  return false;
}

/**
 * Lista de Instrumentos Privativos da Psicologia (CFP / Resolução SATEPSI)
 * É terminantemente vedada a aplicação e laudo por não-psicólogos.
 */
const RESTRICTED_PSYCHOLOGICAL_TESTS = [
  'wisc', 'wisc-iv', 'wisc-iii', 'wisc-v', 'wasi', 'wais', 'wais-iii', 'wais-iv',
  'bpa', 'bateria psicologica para avaliacao da atencao',
  'r-1', 'teste r-1', 'palografico', 'teste palografico',
  'htp', 'casa arvore pessoa', 'teste htp',
  'bfp', 'bateria fatorial de personalidade',
  'columbia', 'matrizes progressivas de raven', 'raven',
  'dfh', 'desenho da figura humana',
  'tat', 'cat-a', 'cat-h', 'ro-z', 'pfister'
];

export function isRestrictedPsychologicalTest(instrumentName: string): boolean {
  if (!instrumentName) return false;
  const clean = instrumentName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  return RESTRICTED_PSYCHOLOGICAL_TESTS.some(test => clean.includes(test));
}

export class PsychopedagogyController {
  // ================================================================
  // 1. PERFIL PSICOPEDAGÓGICO DO APRENDENTE
  // ================================================================
  static async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const patientId = String(req.params.patientId || '');
      const tenantId = req.tenantId!;

      if (!hasPsychopedagogyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: sigilo psicopedagógico restrito.' });
        return;
      }

      let profile = db.prepare('SELECT * FROM psychopedagogy_profiles WHERE patient_id = ? AND tenant_id = ?').get(patientId, tenantId) as any;

      if (!profile) {
        // Retorna perfil vazio padrão estruturado
        profile = {
          patient_id: patientId,
          tenant_id: tenantId,
          school_name: '',
          school_grade: '',
          school_shift: 'Matutino',
          school_type: 'Privada',
          teacher_name: '',
          coordinator_name: '',
          pedagogical_complaint: '',
          referral_source: '',
          special_needs_notes: ''
        };
      }

      res.json(profile);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao carregar perfil psicopedagógico.' });
    }
  }

  static async saveProfile(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const patientId = String(req.params.patientId || req.body.patientId || req.body.patient_id || '');
      const schoolName = req.body.schoolName || req.body.school_name;
      const schoolGrade = req.body.schoolGrade || req.body.school_grade || req.body.grade_level;
      const schoolShift = req.body.schoolShift || req.body.school_shift || req.body.shift;
      const schoolType = req.body.schoolType || req.body.school_type;
      const teacherName = req.body.teacherName || req.body.teacher_name;
      const coordinatorName = req.body.coordinatorName || req.body.coordinator_name;
      const pedagogicalComplaint = req.body.pedagogicalComplaint || req.body.pedagogical_complaint || req.body.main_complaint;
      const referralSource = req.body.referralSource || req.body.referral_source;
      const specialNeedsNotes = req.body.specialNeedsNotes || req.body.special_needs_notes;

      if (!patientId) {
        res.status(400).json({ error: 'patientId é obrigatório.' });
        return;
      }

      if (!hasPsychopedagogyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: sigilo psicopedagógico restrito.' });
        return;
      }

      const existing = db.prepare('SELECT id FROM psychopedagogy_profiles WHERE patient_id = ? AND tenant_id = ?').get(patientId, tenantId) as any;

      if (existing) {
        db.prepare(`
          UPDATE psychopedagogy_profiles SET
            school_name = ?, school_grade = ?, school_shift = ?, school_type = ?,
            teacher_name = ?, coordinator_name = ?, pedagogical_complaint = ?,
            referral_source = ?, special_needs_notes = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(
          schoolName || null, schoolGrade || null, schoolShift || null, schoolType || null,
          teacherName || null, coordinatorName || null, pedagogicalComplaint || null,
          referralSource || null, specialNeedsNotes || null, existing.id
        );
      } else {
        const id = `pp-prof-${uuidv4()}`;
        db.prepare(`
          INSERT INTO psychopedagogy_profiles (
            id, tenant_id, patient_id, school_name, school_grade, school_shift, school_type,
            teacher_name, coordinator_name, pedagogical_complaint, referral_source, special_needs_notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, tenantId, patientId, schoolName || null, schoolGrade || null, schoolShift || null, schoolType || null,
          teacherName || null, coordinatorName || null, pedagogicalComplaint || null, referralSource || null, specialNeedsNotes || null
        );
      }

      res.json({ success: true, message: 'Perfil psicopedagógico salvo com sucesso.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao salvar perfil psicopedagógico.' });
    }
  }

  // ================================================================
  // 2. AVALIAÇÃO PSICOPEDAGÓGICA (CLÍNICA & INSTITUCIONAL)
  // ================================================================
  static async listAssessments(req: Request, res: Response): Promise<void> {
    try {
      const patientId = String(req.params.patientId || '');
      const tenantId = req.tenantId!;

      if (!hasPsychopedagogyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: sigilo psicopedagógico restrito.' });
        return;
      }

      const list = db.prepare(`
        SELECT * FROM psychopedagogy_assessments
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY assessment_date DESC, created_at DESC
      `).all(patientId, tenantId) as any[];

      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao listar avaliações psicopedagógicas.' });
    }
  }

  static async saveAssessment(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const {
        id,
        appointmentId,
        assessmentDate,
        mode = 'clinical',
        pedagogicalContract,
        initialGoalsJson,
        readingAnalysisJson,
        writingAnalysisJson,
        mathAnalysisJson,
        cognitiveProcessesJson,
        schoolWorkAnalysisJson,
        institutionalClimateJson,
        pedagogicalMediationJson,
        status = 'in_progress'
      } = req.body;
      const patientId = String(req.params.patientId || req.body.patientId || req.body.patient_id || '');

      if (!patientId) {
        res.status(400).json({ error: 'patientId é obrigatório.' });
        return;
      }

      if (!hasPsychopedagogyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: sigilo psicopedagógico restrito.' });
        return;
      }

      const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user?.userId, tenantId) as any;
      const professionalId = prof?.id || req.user?.userId;

      if (id) {
        const existing = db.prepare('SELECT is_sealed FROM psychopedagogy_assessments WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
        if (existing?.is_sealed === 1) {
          res.status(400).json({ error: 'Esta avaliação já foi selada oficialmente e não pode ser sobrescrita. Registre uma nova avaliação ou aditivo.' });
          return;
        }

        db.prepare(`
          UPDATE psychopedagogy_assessments SET
            assessment_date = COALESCE(?, assessment_date),
            mode = ?,
            pedagogical_contract = ?,
            initial_goals_json = ?,
            reading_analysis_json = ?,
            writing_analysis_json = ?,
            math_analysis_json = ?,
            cognitive_processes_json = ?,
            school_work_analysis_json = ?,
            institutional_climate_json = ?,
            pedagogical_mediation_json = ?,
            status = ?,
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(
          assessmentDate || null, mode, pedagogicalContract || null,
          typeof initialGoalsJson === 'object' ? JSON.stringify(initialGoalsJson) : initialGoalsJson || null,
          typeof readingAnalysisJson === 'object' ? JSON.stringify(readingAnalysisJson) : readingAnalysisJson || null,
          typeof writingAnalysisJson === 'object' ? JSON.stringify(writingAnalysisJson) : writingAnalysisJson || null,
          typeof mathAnalysisJson === 'object' ? JSON.stringify(mathAnalysisJson) : mathAnalysisJson || null,
          typeof cognitiveProcessesJson === 'object' ? JSON.stringify(cognitiveProcessesJson) : cognitiveProcessesJson || null,
          typeof schoolWorkAnalysisJson === 'object' ? JSON.stringify(schoolWorkAnalysisJson) : schoolWorkAnalysisJson || null,
          typeof institutionalClimateJson === 'object' ? JSON.stringify(institutionalClimateJson) : institutionalClimateJson || null,
          typeof pedagogicalMediationJson === 'object' ? JSON.stringify(pedagogicalMediationJson) : pedagogicalMediationJson || null,
          status, id, tenantId
        );

        res.json({ success: true, id, message: 'Avaliação atualizada com sucesso.' });
      } else {
        const newId = `pp-eval-${uuidv4()}`;
        db.prepare(`
          INSERT INTO psychopedagogy_assessments (
            id, tenant_id, patient_id, professional_id, appointment_id, assessment_date,
            mode, pedagogical_contract, initial_goals_json, reading_analysis_json,
            writing_analysis_json, math_analysis_json, cognitive_processes_json,
            school_work_analysis_json, institutional_climate_json, pedagogical_mediation_json,
            status, is_sealed, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, COALESCE(?, date('now')), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
        `).run(
          newId, tenantId, patientId, professionalId, appointmentId || null, assessmentDate || null,
          mode, pedagogicalContract || null,
          typeof initialGoalsJson === 'object' ? JSON.stringify(initialGoalsJson) : initialGoalsJson || null,
          typeof readingAnalysisJson === 'object' ? JSON.stringify(readingAnalysisJson) : readingAnalysisJson || null,
          typeof writingAnalysisJson === 'object' ? JSON.stringify(writingAnalysisJson) : writingAnalysisJson || null,
          typeof mathAnalysisJson === 'object' ? JSON.stringify(mathAnalysisJson) : mathAnalysisJson || null,
          typeof cognitiveProcessesJson === 'object' ? JSON.stringify(cognitiveProcessesJson) : cognitiveProcessesJson || null,
          typeof schoolWorkAnalysisJson === 'object' ? JSON.stringify(schoolWorkAnalysisJson) : schoolWorkAnalysisJson || null,
          typeof institutionalClimateJson === 'object' ? JSON.stringify(institutionalClimateJson) : institutionalClimateJson || null,
          typeof pedagogicalMediationJson === 'object' ? JSON.stringify(pedagogicalMediationJson) : pedagogicalMediationJson || null,
          status
        );

        res.status(201).json({ success: true, id: newId, message: 'Avaliação psicopedagógica criada com sucesso.' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao salvar avaliação psicopedagógica.' });
    }
  }

  // ================================================================
  // 3. SESSÕES E EVOLUÇÕES PSICOPEDAGÓGICAS COM ASSINATURA ELETRÔNICA
  // ================================================================
  static async listSessions(req: Request, res: Response): Promise<void> {
    try {
      const patientId = String(req.params.patientId || '');
      const tenantId = req.tenantId!;

      if (!hasPsychopedagogyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: sigilo psicopedagógico restrito.' });
        return;
      }

      const sessions = db.prepare(`
        SELECT * FROM psychopedagogy_sessions
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY session_date DESC, created_at DESC
      `).all(patientId, tenantId) as any[];

      res.json(sessions);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao listar sessões psicopedagógicas.' });
    }
  }

  static async saveSession(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const {
        id,
        appointmentId,
        sessionDate,
        sessionNumber,
        objectives,
        pedagogicalResources,
        activitiesPerformed,
        studentEngagement,
        observations,
        homeGuidelines,
        nextSessionPlan
      } = req.body;
      const patientId = String(req.params.patientId || req.body.patientId || req.body.patient_id || '');
      const activities = activitiesPerformed || req.body.activities_developed || null;
      const reactions = studentEngagement || req.body.learner_reactions || null;
      const obs = observations || req.body.results_observations || null;
      const nextPlan = nextSessionPlan || req.body.next_steps || null;

      if (!patientId) {
        res.status(400).json({ error: 'patientId é obrigatório.' });
        return;
      }

      if (!hasPsychopedagogyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: sigilo psicopedagógico restrito.' });
        return;
      }

      const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user?.userId, tenantId) as any;
      const professionalId = prof?.id || req.user?.userId;

      if (id) {
        const existing = db.prepare('SELECT is_sealed FROM psychopedagogy_sessions WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
        if (existing?.is_sealed === 1) {
          res.status(400).json({ error: 'Sessão selada imutável. Registre uma nova sessão ou aditivo.' });
          return;
        }

        db.prepare(`
          UPDATE psychopedagogy_sessions SET
            session_date = COALESCE(?, session_date),
            session_number = ?,
            objectives = ?,
            pedagogical_resources = ?,
            activities_performed = ?,
            student_engagement = ?,
            observations = ?,
            home_guidelines = ?,
            next_session_plan = ?,
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(
          sessionDate || null, sessionNumber || null, objectives || null, pedagogicalResources || null,
          activities, reactions, obs,
          homeGuidelines || null, nextPlan, id, tenantId
        );

        res.json({ success: true, id, message: 'Sessão atualizada.' });
      } else {
        const newId = `pp-sess-${uuidv4()}`;
        db.prepare(`
          INSERT INTO psychopedagogy_sessions (
            id, tenant_id, patient_id, professional_id, appointment_id, session_date,
            session_number, objectives, pedagogical_resources, activities_performed,
            student_engagement, observations, home_guidelines, next_session_plan,
            is_sealed, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, COALESCE(?, date('now')), ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
        `).run(
          newId, tenantId, patientId, professionalId, appointmentId || null, sessionDate || null,
          sessionNumber || null, objectives || null, pedagogicalResources || null, activities,
          reactions, obs, homeGuidelines || null, nextPlan
        );

        res.status(201).json({ success: true, id: newId, message: 'Sessão criada.' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao salvar sessão psicopedagógica.' });
    }
  }

  /**
   * FINALIZAR ATENDIMENTO PSICOPEDAGÓGICO OFICIAL
   * Gera SHA-256, assina eletronicamente e sela a sessão tornando-a imutável.
   */
  static async finishSession(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const patientId = String(req.body.patientId || req.body.patient_id || req.params.patientId || '');
      const appointmentId = req.body.appointmentId || req.body.appointment_id;
      const {
        sessionId,
        sessionDate,
        title,
        clinicalEvolution,
        technicalNotes,
        isSealed = true
      } = req.body;

      if (!patientId) {
        res.status(400).json({ error: 'patientId é obrigatório.' });
        return;
      }

      if (!hasPsychopedagogyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: sigilo psicopedagógico restrito.' });
        return;
      }

      let resolvedProfessionalId: string | null = null;
      let signerName = req.user?.name || 'Psicopedagogo(a) Responsável';
      let signerReg = 'CBO 2394-25';

      // 1. Tentar obter pelo professionalId fornecido na requisição
      if (req.body.professionalId || req.body.professional_id) {
        const candidateId = String(req.body.professionalId || req.body.professional_id);
        const pRow = db.prepare('SELECT id, name, registration_type, registration_number FROM professionals WHERE id = ? AND tenant_id = ?').get(candidateId, tenantId) as any;
        if (pRow) {
          resolvedProfessionalId = pRow.id;
          if (pRow.name) signerName = pRow.name;
          if (pRow.registration_number) signerReg = `${pRow.registration_type || 'ABPp'} ${pRow.registration_number}`;
        }
      }

      // 2. Se não encontrado, buscar profissional vinculado ao user_id logado
      if (!resolvedProfessionalId) {
        const profByUser = db.prepare(`
          SELECT p.id, p.name, p.registration_type, p.registration_number, u.name as user_name
          FROM professionals p
          JOIN users u ON u.id = p.user_id
          WHERE p.user_id = ? AND p.tenant_id = ?
        `).get(req.user?.userId, tenantId) as any;
        if (profByUser) {
          resolvedProfessionalId = profByUser.id;
          signerName = profByUser.user_name || profByUser.name || signerName;
          if (profByUser.registration_number) {
            signerReg = `${profByUser.registration_type || 'ABPp'} ${profByUser.registration_number}`;
          }
        }
      }

      // 3. Se houver appointmentId, verificar o profissional do agendamento
      if (!resolvedProfessionalId && appointmentId) {
        const apptProf = db.prepare('SELECT professional_id FROM appointments WHERE id = ? AND tenant_id = ?').get(appointmentId, tenantId) as any;
        if (apptProf?.professional_id) {
          const pRow = db.prepare('SELECT id, name, registration_type, registration_number FROM professionals WHERE id = ? AND tenant_id = ?').get(apptProf.professional_id, tenantId) as any;
          if (pRow) {
            resolvedProfessionalId = pRow.id;
            if (pRow.name) signerName = pRow.name;
            if (pRow.registration_number) signerReg = `${pRow.registration_type || 'ABPp'} ${pRow.registration_number}`;
          }
        }
      }

      // 4. Se ainda não encontrado, buscar qualquer profissional ativo do tenant
      if (!resolvedProfessionalId) {
        const anyProf = db.prepare('SELECT id, name, registration_type, registration_number FROM professionals WHERE tenant_id = ? AND active = 1 ORDER BY created_at ASC LIMIT 1').get(tenantId) as any;
        if (anyProf) {
          resolvedProfessionalId = anyProf.id;
          if (!signerName || signerName === 'Psicopedagogo(a) Responsável') signerName = anyProf.name;
          if (anyProf.registration_number) signerReg = `${anyProf.registration_type || 'ABPp'} ${anyProf.registration_number}`;
        }
      }

      // 5. Se não existir nenhum profissional na clínica, criar o profissional para o usuário autenticado
      if (!resolvedProfessionalId) {
        const newProfId = `prof-pp-${uuidv4().slice(0, 8)}`;
        db.prepare(`
          INSERT INTO professionals (
            id, tenant_id, user_id, name, email, registration_type, registration_number, active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'ABPp', 'CBO 2394-25', 1, datetime('now'), datetime('now'))
        `).run(
          newProfId, tenantId, req.user?.userId || null, req.user?.name || 'Psicopedagogo Responsável', req.user?.email || 'psicopedagogia@zemda.com.br'
        );
        resolvedProfessionalId = newProfId;
      }

      const signedAt = new Date().toISOString();
      const sessionData = req.body.sessionData || {};
      const evolutionContent = clinicalEvolution || req.body.observations || sessionData.results_observations || sessionData.activities_developed || sessionData.objectives || 'Atendimento Psicopedagógico concluído';

      const hashPayload = `${tenantId}|${patientId}|${req.user?.userId}|${signedAt}|${evolutionContent}`;
      const signatureHash = crypto.createHash('sha256').update(hashPayload, 'utf8').digest('hex');

      // Se houver registro de sessão existente, atualiza e sela
      if (sessionId) {
        db.prepare(`
          UPDATE psychopedagogy_sessions SET
            is_sealed = 1,
            signature_hash = ?,
            signed_at = ?,
            signed_by_user_id = ?,
            signer_name = ?,
            signer_registration = ?,
            sealed_at = ?,
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(signatureHash, signedAt, req.user?.userId, signerName, signerReg, signedAt, sessionId, tenantId);
      }

      // Grava também no Prontuário Geral do Paciente (records) para preservação do histórico longitudinal
      const recordId = `rec-pp-${uuidv4()}`;
      db.prepare(`
        INSERT INTO records (
          id, tenant_id, patient_id, appointment_id, professional_id, session_date,
          title, clinical_evolution, technical_notes, module_type, is_sealed,
          signature_hash, signed_at, signed_by_user_id, signer_name, signer_registration, sealed_at,
          created_by, updated_by, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, COALESCE(?, date('now')),
          ?, ?, ?, 'ZemdaPP', 1,
          ?, ?, ?, ?, ?, ?,
          ?, ?, datetime('now'), datetime('now')
        )
      `).run(
        recordId, tenantId, patientId, appointmentId || null, resolvedProfessionalId, sessionDate || null,
        title || 'Atendimento Psicopedagógico (ZemdaPP)', evolutionContent, technicalNotes || null,
        signatureHash, signedAt, req.user?.userId, signerName, signerReg, signedAt,
        req.user?.userId, req.user?.userId
      );

      // Se houver appointmentId vinculado, finaliza o agendamento
      if (appointmentId) {
        try {
          db.prepare(`
            UPDATE appointments SET
              status = 'completed',
              updated_at = datetime('now')
            WHERE id = ? AND tenant_id = ?
          `).run(appointmentId, tenantId);
        } catch (_) {}
      }

      logAudit(
        req,
        'FINISH_CONSULTATION_PP',
        'psychopedagogy_sessions',
        (sessionId || recordId) as string,
        { patientId, signatureHash, signedAt, signerName }
      );

      res.json({
        success: true,
        isSealed: true,
        signatureHash,
        signedAt,
        signerName,
        signerRegistration: signerReg,
        recordId,
        message: 'Atendimento psicopedagógico finalizado, assinado eletronicamente e selado com sucesso.'
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao finalizar atendimento psicopedagógico.' });
    }
  }

  // ================================================================
  // 4. DOMÍNIOS DE APRENDIZAGEM (LEITURA, ESCRITA, MATEMÁTICA, ETC.)
  // ================================================================
  static async listDomains(req: Request, res: Response): Promise<void> {
    try {
      const { patientId } = req.params;
      const tenantId = req.tenantId!;

      if (!hasPsychopedagogyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: sigilo psicopedagógico restrito.' });
        return;
      }

      const list = db.prepare(`
        SELECT * FROM psychopedagogy_learning_domains
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY assessment_date ASC, created_at ASC
      `).all(patientId, tenantId) as any[];

      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao listar domínios de aprendizagem.' });
    }
  }

  static async saveDomain(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { id, patientId, domainCategory, scoreOrLevel, qualitativeDescription, assessmentDate } = req.body;

      if (!patientId || !domainCategory) {
        res.status(400).json({ error: 'patientId e domainCategory são obrigatórios.' });
        return;
      }

      if (!hasPsychopedagogyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: sigilo psicopedagógico restrito.' });
        return;
      }

      const newId = id || `pp-dom-${uuidv4()}`;
      db.prepare(`
        INSERT INTO psychopedagogy_learning_domains (
          id, tenant_id, patient_id, domain_category, score_or_level, qualitative_description, assessment_date, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, date('now')), datetime('now'))
      `).run(newId, tenantId, patientId, domainCategory, scoreOrLevel || null, qualitativeDescription || null, assessmentDate || null);

      res.status(201).json({ success: true, id: newId, message: 'Domínio de aprendizagem registrado.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao registrar domínio de aprendizagem.' });
    }
  }

  // ================================================================
  // 5. TESTES E INSTRUMENTOS (COM BLOQUEIO ÉTICO DA PSICOLOGIA)
  // ================================================================
  static async listInstruments(req: Request, res: Response): Promise<void> {
    try {
      const { patientId } = req.params;
      const tenantId = req.tenantId!;

      if (!hasPsychopedagogyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: sigilo psicopedagógico restrito.' });
        return;
      }

      const list = db.prepare(`
        SELECT * FROM psychopedagogy_instruments
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY application_date DESC, created_at DESC
      `).all(patientId, tenantId) as any[];

      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao listar instrumentos.' });
    }
  }

  static async saveInstrument(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const patientId = String(req.params.patientId || req.body.patientId || req.body.patient_id || '');
      const instrumentName = req.body.instrumentName || req.body.instrument_name;
      const instrumentCategory = req.body.instrumentCategory || req.body.instrument_category || 'Provas Operatórias';
      const applicationDate = req.body.applicationDate || req.body.application_date;
      const rawScore = req.body.rawScore || req.body.raw_score;
      const percentileOrResult = req.body.percentileOrResult || req.body.results_summary;
      const observations = req.body.observations || req.body.normative_reference;

      if (!patientId || !instrumentName) {
        res.status(400).json({ error: 'patientId e instrumentName são obrigatórios.' });
        return;
      }

      if (!hasPsychopedagogyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: sigilo psicopedagógico restrito.' });
        return;
      }

      // BLOQUEIO ÉTICO E LEGAL DE INSTRUMENTOS PRIVATIVOS DA PSICOLOGIA
      if (isRestrictedPsychologicalTest(instrumentName)) {
        res.status(403).json({
          error: 'Instrumento de uso profissional restrito da Psicologia (Conselho Federal de Psicologia / SATEPSI). Não disponível no ZemdaPP. Utilize provas operatórias piagetianas, testes de sondagem pedagógica e instrumentos psicopedagógicos autorizados.',
          code: 'SATEPSI_RESTRICTED_INSTRUMENT'
        });
        return;
      }

      const id = `pp-inst-${uuidv4()}`;
      db.prepare(`
        INSERT INTO psychopedagogy_instruments (
          id, tenant_id, patient_id, instrument_name, instrument_category, application_date,
          raw_score, percentile_or_result, observations, is_psychological_privative, created_at
        ) VALUES (?, ?, ?, ?, ?, COALESCE(?, date('now')), ?, ?, ?, 0, datetime('now'))
      `).run(
        id, tenantId, patientId, instrumentName.trim(), instrumentCategory || 'Pedagógico / Didático',
        applicationDate || null, rawScore || null, percentileOrResult || null, observations || null
      );

      res.status(201).json({ success: true, id, message: 'Instrumento registrado com sucesso.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao salvar instrumento psicopedagógico.' });
    }
  }

  // ================================================================
  // 6. PLANO DE INTERVENÇÃO PSICOPEDAGÓGICA (PIP) E METAS
  // ================================================================
  static async listPlans(req: Request, res: Response): Promise<void> {
    try {
      const { patientId } = req.params;
      const tenantId = req.tenantId!;

      if (!hasPsychopedagogyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: sigilo psicopedagógico restrito.' });
        return;
      }

      const plans = db.prepare(`
        SELECT * FROM psychopedagogy_intervention_plans
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY start_date DESC, created_at DESC
      `).all(patientId, tenantId) as any[];

      // Anexa metas em cada plano
      for (const p of plans) {
        p.goals = db.prepare('SELECT * FROM psychopedagogy_goals WHERE plan_id = ? ORDER BY created_at ASC').all(p.id);
      }

      res.json(plans);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao listar planos de intervenção.' });
    }
  }

  static async savePlan(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { id, patientId, planTitle, startDate, reviewDate, generalObjective, methodologicalApproach, status = 'active' } = req.body;

      if (!patientId || !planTitle) {
        res.status(400).json({ error: 'patientId e planTitle são obrigatórios.' });
        return;
      }

      if (!hasPsychopedagogyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: sigilo psicopedagógico restrito.' });
        return;
      }

      const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user?.userId, tenantId) as any;
      const professionalId = prof?.id || req.user?.userId;

      if (id) {
        db.prepare(`
          UPDATE psychopedagogy_intervention_plans SET
            plan_title = ?, start_date = COALESCE(?, start_date), review_date = ?,
            general_objective = ?, methodological_approach = ?, status = ?, updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(planTitle, startDate || null, reviewDate || null, generalObjective || null, methodologicalApproach || null, status, id, tenantId);

        res.json({ success: true, id, message: 'Plano de intervenção atualizado.' });
      } else {
        const newId = `pp-pip-${uuidv4()}`;
        db.prepare(`
          INSERT INTO psychopedagogy_intervention_plans (
            id, tenant_id, patient_id, professional_id, plan_title, start_date, review_date,
            general_objective, methodological_approach, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, COALESCE(?, date('now')), ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(newId, tenantId, patientId, professionalId, planTitle, startDate || null, reviewDate || null, generalObjective || null, methodologicalApproach || null, status);

        res.status(201).json({ success: true, id: newId, message: 'Plano de intervenção criado.' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao salvar plano de intervenção.' });
    }
  }

  static async saveGoal(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { id, planId, patientId, goalDescription, targetDate, status = 'pending', progressPercentage = 0 } = req.body;

      if (!planId || !patientId || !goalDescription) {
        res.status(400).json({ error: 'planId, patientId e goalDescription são obrigatórios.' });
        return;
      }

      if (!hasPsychopedagogyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: sigilo psicopedagógico restrito.' });
        return;
      }

      if (id) {
        db.prepare(`
          UPDATE psychopedagogy_goals SET
            goal_description = ?, target_date = ?, status = ?, progress_percentage = ?, updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(goalDescription, targetDate || null, status, progressPercentage, id, tenantId);

        res.json({ success: true, id, message: 'Meta atualizada.' });
      } else {
        const newId = `pp-goal-${uuidv4()}`;
        db.prepare(`
          INSERT INTO psychopedagogy_goals (
            id, tenant_id, plan_id, patient_id, goal_description, target_date, status, progress_percentage, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(newId, tenantId, planId, patientId, goalDescription, targetDate || null, status, progressPercentage);

        res.status(201).json({ success: true, id: newId, message: 'Meta adicionada ao plano.' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao salvar meta.' });
    }
  }

  // ================================================================
  // 7. PARCERIA ESCOLA & FAMÍLIA
  // ================================================================
  static async listSchoolContacts(req: Request, res: Response): Promise<void> {
    try {
      const { patientId } = req.params;
      const tenantId = req.tenantId!;

      if (!hasPsychopedagogyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: sigilo psicopedagógico restrito.' });
        return;
      }

      const list = db.prepare(`
        SELECT * FROM psychopedagogy_school_contacts
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY contact_date DESC, created_at DESC
      `).all(patientId, tenantId) as any[];

      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao listar contatos escolares.' });
    }
  }

  static async saveSchoolContact(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const {
        patientId,
        contactDate,
        contactType = 'school_visit',
        schoolContactPerson,
        schoolContactRole,
        discussionSummary,
        agreedAdaptations,
        nextContactDate
      } = req.body;

      if (!patientId || !schoolContactPerson) {
        res.status(400).json({ error: 'patientId e schoolContactPerson são obrigatórios.' });
        return;
      }

      if (!hasPsychopedagogyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado: sigilo psicopedagógico restrito.' });
        return;
      }

      const id = `pp-sch-${uuidv4()}`;
      db.prepare(`
        INSERT INTO psychopedagogy_school_contacts (
          id, tenant_id, patient_id, contact_date, contact_type, school_contact_person,
          school_contact_role, discussion_summary, agreed_adaptations, next_contact_date, created_at
        ) VALUES (?, ?, ?, COALESCE(?, date('now')), ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        id, tenantId, patientId, contactDate || null, contactType, schoolContactPerson.trim(),
        schoolContactRole || null, discussionSummary || null, agreedAdaptations || null, nextContactDate || null
      );

      res.status(201).json({ success: true, id, message: 'Registro de parceria escolar salvo.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao salvar contato escolar.' });
    }
  }

  // ================================================================
  // 8. MODO INSTITUCIONAL (CASOS E PROJETOS EM ESCOLAS/INSTITUIÇÕES)
  // ================================================================
  static async listInstitutionalCases(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      if (!hasPsychopedagogyAccess(req)) {
        res.status(403).json({ error: 'Acesso negado ao modo psicopedagógico institucional.' });
        return;
      }

      const list = db.prepare(`
        SELECT * FROM psychopedagogy_institutional_cases
        WHERE tenant_id = ?
        ORDER BY created_at DESC
      `).all(tenantId) as any[];

      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao listar casos institucionais.' });
    }
  }

  static async saveInstitutionalCase(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { id, institutionName, institutionType, projectTitle, targetAudience, assessmentScope, actionsPlan, resultsSummary, status = 'active' } = req.body;

      if (!hasPsychopedagogyAccess(req)) {
        res.status(403).json({ error: 'Acesso negado ao modo psicopedagógico institucional.' });
        return;
      }

      if (!institutionName || !projectTitle) {
        res.status(400).json({ error: 'institutionName e projectTitle são obrigatórios.' });
        return;
      }

      if (id) {
        db.prepare(`
          UPDATE psychopedagogy_institutional_cases SET
            institution_name = ?, institution_type = ?, project_title = ?, target_audience = ?,
            assessment_scope = ?, actions_plan = ?, results_summary = ?, status = ?, updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(institutionName, institutionType || null, projectTitle, targetAudience || null, assessmentScope || null, actionsPlan || null, resultsSummary || null, status, id, tenantId);

        res.json({ success: true, id, message: 'Caso institucional atualizado.' });
      } else {
        const newId = `pp-instcase-${uuidv4()}`;
        db.prepare(`
          INSERT INTO psychopedagogy_institutional_cases (
            id, tenant_id, institution_name, institution_type, project_title, target_audience,
            assessment_scope, actions_plan, results_summary, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(newId, tenantId, institutionName, institutionType || null, projectTitle, targetAudience || null, assessmentScope || null, actionsPlan || null, resultsSummary || null, status);

        res.status(201).json({ success: true, id: newId, message: 'Projeto institucional registrado.' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao salvar caso institucional.' });
    }
  }

  // ================================================================
  // 9. COMPARTILHAMENTO DE CASOS (SIGILO & CONSENTIMENTO)
  // ================================================================
  static async listShares(req: Request, res: Response): Promise<void> {
    try {
      const { patientId } = req.params;
      const tenantId = req.tenantId!;

      if (!hasPsychopedagogyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado.' });
        return;
      }

      const shares = db.prepare(`
        SELECT s.*, u.name as shared_with_name, u.email as shared_with_email
        FROM psychopedagogy_shares s
        JOIN users u ON u.id = s.shared_with_user_id
        WHERE s.patient_id = ? AND s.tenant_id = ?
      `).all(patientId, tenantId) as any[];

      res.json(shares);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao listar compartilhamentos.' });
    }
  }

  static async createShare(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { patientId, sharedWithUserId, accessLevel = 'read', expiresAt, reason } = req.body;

      if (!patientId || !sharedWithUserId) {
        res.status(400).json({ error: 'patientId e sharedWithUserId são obrigatórios.' });
        return;
      }

      if (!hasPsychopedagogyAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso negado para compartilhar este prontuário.' });
        return;
      }

      const id = `pp-share-${uuidv4()}`;
      db.prepare(`
        INSERT INTO psychopedagogy_shares (
          id, tenant_id, patient_id, shared_by_user_id, shared_with_user_id, access_level, expires_at, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(id, tenantId, patientId, req.user?.userId, sharedWithUserId, accessLevel, expiresAt || null, reason || null);

      res.status(201).json({ success: true, id, message: 'Compartilhamento registrado.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao criar compartilhamento.' });
    }
  }

  static async deleteShare(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { id } = req.params;

      db.prepare('DELETE FROM psychopedagogy_shares WHERE id = ? AND tenant_id = ?').run(id, tenantId);
      res.json({ success: true, message: 'Compartilhamento revogado com sucesso.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao revogar compartilhamento.' });
    }
  }

  // ================================================================
  // 10. POLÍTICA DE RETENÇÃO CONFIGURÁVEL
  // ================================================================
  static async getRetentionPolicy(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      let policy = db.prepare('SELECT * FROM psychopedagogy_retention_policies WHERE tenant_id = ?').get(tenantId) as any;

      if (!policy) {
        policy = {
          tenant_id: tenantId,
          retention_years: 5,
          auto_archive: 1,
          notify_before_archive_days: 30
        };
      }

      res.json(policy);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao consultar política de retenção.' });
    }
  }

  static async saveRetentionPolicy(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { retentionYears = 5, autoArchive = 1, notifyBeforeArchiveDays = 30 } = req.body;

      const existing = db.prepare('SELECT id FROM psychopedagogy_retention_policies WHERE tenant_id = ?').get(tenantId) as any;

      if (existing) {
        db.prepare(`
          UPDATE psychopedagogy_retention_policies SET
            retention_years = ?, auto_archive = ?, notify_before_archive_days = ?, updated_at = datetime('now')
          WHERE tenant_id = ?
        `).run(retentionYears, autoArchive ? 1 : 0, notifyBeforeArchiveDays, tenantId);
      } else {
        const id = `pp-ret-${uuidv4()}`;
        db.prepare(`
          INSERT INTO psychopedagogy_retention_policies (
            id, tenant_id, retention_years, auto_archive, notify_before_archive_days, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(id, tenantId, retentionYears, autoArchive ? 1 : 0, notifyBeforeArchiveDays);
      }

      res.json({ success: true, message: 'Política de retenção atualizada.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao salvar política de retenção.' });
    }
  }
}
