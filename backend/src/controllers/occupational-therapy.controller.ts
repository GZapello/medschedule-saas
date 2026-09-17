import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';
import { hasClinicalAccess } from './clinical.controller';
import { DocumentsController } from './documents.controller';

/**
 * Validação de acesso exclusivo para Terapia Ocupacional (ZemdaTO - Regras 1 e 2)
 */
export function isOccupationalTherapistOrClinicManager(req: Request): boolean {
  if (!req.user || !req.tenantId) return false;

  // 1. Administrador Global / SuperAdmin NUNCA visualiza conteúdo clínico
  if (req.user.role === 'superadmin') return false;

  // 2. Cargos não-clínicos são bloqueados
  const roleStr = req.user.role as string;
  if (roleStr === 'receptionist' || roleStr === 'financial' || roleStr === 'secretary' || roleStr === 'assistant') {
    return false;
  }

  // 3. Busca vínculo do usuário na clínica
  const clinicUser = db.prepare(`
    SELECT cu.role, cu.status as cu_status, cu.is_manager, cu.permissions_json, cu.profession_custom,
           cu.practice_areas as cu_practice_areas, cu.zemda_to_enabled,
           u.status as u_status, u.profession_name, u.practice_areas as u_practice_areas, u.zemda_to_enabled as u_zemda_to_enabled
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
    SELECT p.id, p.profession_id, p.practice_areas, p.specialty_custom, p.zemda_to_enabled,
           prof.slug as profession_slug, prof.name as profession_name
    FROM professionals p
    LEFT JOIN professions prof ON prof.id = p.profession_id
    WHERE p.user_id = ? AND p.tenant_id = ?
  `).get(req.user.userId, req.tenantId) as any;

  // 4. Critério 1: Profissão / Área clínica deve ser Terapia Ocupacional
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

  const isTOArea =
    prof?.profession_id === 'prof-terapeuta-ocupacional' ||
    prof?.profession_id === 'prof-terapia-ocupacional' ||
    combinedProfessionText.includes('terapia ocupacional') ||
    combinedProfessionText.includes('ocupacional') ||
    combinedProfessionText.includes('crefito');

  if (!isTOArea) {
    return false;
  }

  // 5. Critério 2: Liberação explícita ou gerente atuando em T.O.
  let perms: string[] = [];
  try {
    if (clinicUser?.permissions_json) {
      perms = JSON.parse(clinicUser.permissions_json);
    }
  } catch {}

  const isManager = req.user.role === 'clinic_admin' || clinicUser?.is_manager === 1 || clinicUser?.role === 'clinic_admin';
  const isProfessional = req.user.role === 'professional';

  const isAuthorized =
    (isProfessional && isTOArea) ||
    (isManager && isTOArea) ||
    perms.includes('access_zemda_to') ||
    Number(prof?.zemda_to_enabled) === 1 ||
    Number(clinicUser?.zemda_to_enabled) === 1 ||
    Number(clinicUser?.u_zemda_to_enabled) === 1;

  return isAuthorized;
}

export class OccupationalTherapyController {
  // 1. PERFIL OCUPACIONAL (Rotina, papéis, contexto)
  static getProfile(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isOccupationalTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao módulo ZemdaTO' });
        return;
      }
      if (!hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso clínico restrito (LGPD)' });
        return;
      }

      const row = db.prepare('SELECT * FROM to_occupational_profiles WHERE patient_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 1').get(patientId, tenantId) as any;
      if (!row) {
        res.json(null);
        return;
      }

      // Suporte retrocompatível: retorna row no topo e aninhado em 'profile'
      const mappedProfile = {
        ...row,
        occupationalHistory: row.routine || '',
        dailyRoutine: row.routine || '',
        interestsAndValues: row.interests || '',
        contextualFacilitators: row.physical_env || '',
        contextualBarriers: row.social_env || '',
        roles: row.roles || '',
        habits: row.habits || '',
        meaningfulActivities: row.meaningful_activities || '',
        familyContext: row.family_context || '',
        schoolContext: row.school_context || '',
        workContext: row.work_context || '',
        communityContext: row.community_context || '',
        physicalEnv: row.physical_env || '',
        socialEnv: row.social_env || ''
      };

      res.json({
        ...mappedProfile,
        profile: mappedProfile
      });
    } catch (err: any) {
      console.error('[TOController.getProfile]', err);
      res.status(500).json({ error: 'Erro ao buscar perfil ocupacional' });
    }
  }

  static saveProfile(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isOccupationalTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao módulo ZemdaTO' });
        return;
      }

      const raw = req.body.profile || req.body;
      const patientId = req.body.patientId || raw.patientId;
      const appointmentId = req.body.appointmentId || raw.appointmentId;

      if (!patientId) {
        res.status(400).json({ error: 'patientId é obrigatório' });
        return;
      }

      const routine = raw.routine || raw.dailyRoutine || raw.occupationalHistory || null;
      const roles = raw.roles || null;
      const interests = raw.interests || raw.interestsAndValues || null;
      const habits = raw.habits || null;
      const meaningfulActivities = raw.meaningfulActivities || raw.meaningful_activities || null;
      const familyContext = raw.familyContext || raw.family_context || null;
      const schoolContext = raw.schoolContext || raw.school_context || null;
      const workContext = raw.workContext || raw.work_context || null;
      const communityContext = raw.communityContext || raw.community_context || null;
      const physicalEnv = raw.physicalEnv || raw.physical_env || raw.contextualFacilitators || null;
      const socialEnv = raw.socialEnv || raw.social_env || raw.contextualBarriers || null;

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const existing = db.prepare('SELECT id FROM to_occupational_profiles WHERE patient_id = ? AND tenant_id = ?').get(patientId, tenantId) as any;
      if (existing) {
        db.prepare(`
          UPDATE to_occupational_profiles SET
            routine = ?, roles = ?, interests = ?, habits = ?, meaningful_activities = ?,
            family_context = ?, school_context = ?, work_context = ?, community_context = ?,
            physical_env = ?, social_env = ?, updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(
          routine, roles, interests, habits, meaningfulActivities,
          familyContext, schoolContext, workContext, communityContext,
          physicalEnv, socialEnv, existing.id, tenantId
        );
        res.json({ id: existing.id, message: 'Perfil ocupacional atualizado' });
      } else {
        const id = 'to-prof-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO to_occupational_profiles (
            id, tenant_id, patient_id, professional_id, appointment_id,
            routine, roles, interests, habits, meaningful_activities,
            family_context, school_context, work_context, community_context,
            physical_env, social_env
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, tenantId, patientId, profId, appointmentId || null,
          routine, roles, interests, habits, meaningfulActivities,
          familyContext, schoolContext, workContext, communityContext,
          physicalEnv, socialEnv
        );
        res.status(201).json({ id, message: 'Perfil ocupacional criado com sucesso' });
      }
    } catch (err: any) {
      console.error('[TOController.saveProfile]', err);
      res.status(500).json({ error: 'Erro ao salvar perfil ocupacional' });
    }
  }

  // 2. AVD (Atividades de Vida Diária) & AIVD (6 níveis)
  static listAvd(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isOccupationalTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao módulo ZemdaTO' });
        return;
      }

      const rows = db.prepare(`
        SELECT * FROM to_avd_assessments 
        WHERE patient_id = ? AND tenant_id = ? 
        ORDER BY created_at DESC
      `).all(patientId, tenantId) as any[];

      res.json(rows.map(r => {
        let parsed: any = [];
        try { parsed = JSON.parse(r.scores_json || '[]'); } catch { parsed = []; }
        return {
          ...r,
          scores: parsed,
          items: Array.isArray(parsed) ? parsed : (parsed.items || [])
        };
      }));
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar avaliações de AVD' });
    }
  }

  static saveAvd(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isOccupationalTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao módulo ZemdaTO' });
        return;
      }

      const { patientId, appointmentId, assessmentType = 'avd' } = req.body;
      const rawScores = req.body.scores || req.body.items || [];
      const overallLevel = req.body.overallLevel || (req.body.independenceRate !== undefined ? `${req.body.independenceRate}%` : null);
      const notes = req.body.notes || (req.body.totalScore !== undefined ? `Pontuação: ${req.body.totalScore}` : null);

      if (!patientId || !rawScores) {
        res.status(400).json({ error: 'patientId e scores/items são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'to-avd-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO to_avd_assessments (
          id, tenant_id, patient_id, professional_id, appointment_id,
          assessment_type, scores_json, overall_level, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId, appointmentId || null,
        assessmentType, JSON.stringify(rawScores), overallLevel, notes
      );

      res.status(201).json({ id, message: 'Avaliação de AVD/AIVD registrada com sucesso' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar avaliação de AVD' });
    }
  }

  // 3. AVALIAÇÃO SENSORIAL (8 sentidos)
  static getSensory(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isOccupationalTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao módulo ZemdaTO' });
        return;
      }

      const row = db.prepare('SELECT * FROM to_sensory_assessments WHERE patient_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 1').get(patientId, tenantId) as any;
      if (!row) {
        res.json(null);
        return;
      }

      let notesObj: any = {};
      try { notesObj = JSON.parse(row.notes_json || '{}'); } catch { notesObj = {}; }

      const systems = {
        visual: { pattern: row.visual || 'typical', notes: notesObj.visual || '' },
        auditory: { pattern: row.auditory || 'typical', notes: notesObj.auditory || '' },
        tactile: { pattern: row.tactile || 'typical', notes: notesObj.tactile || '' },
        vestibular: { pattern: row.vestibular || 'typical', notes: notesObj.vestibular || '' },
        proprioceptive: { pattern: row.proprioceptive || 'typical', notes: notesObj.proprioceptive || '' },
        olfactory: { pattern: row.olfactory || 'typical', notes: notesObj.olfactory || '' },
        gustatory: { pattern: row.gustatory || 'typical', notes: notesObj.gustatory || '' },
        interoceptive: { pattern: row.interoceptive || 'typical', notes: notesObj.interoceptive || '' }
      };

      res.json({
        ...row,
        systems,
        notes: typeof notesObj === 'string' ? notesObj : (notesObj.general || '')
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar avaliação sensorial' });
    }
  }

  static saveSensory(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isOccupationalTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao módulo ZemdaTO' });
        return;
      }

      const { patientId, appointmentId, systems } = req.body;

      const tactile = systems?.tactile?.pattern || req.body.tactile || null;
      const auditory = systems?.auditory?.pattern || req.body.auditory || null;
      const visual = systems?.visual?.pattern || req.body.visual || null;
      const vestibular = systems?.vestibular?.pattern || req.body.vestibular || null;
      const proprioceptive = systems?.proprioceptive?.pattern || req.body.proprioceptive || null;
      const gustatory = systems?.gustatory?.pattern || req.body.gustatory || null;
      const olfactory = systems?.olfactory?.pattern || req.body.olfactory || null;
      const interoceptive = systems?.interoceptive?.pattern || req.body.interoceptive || null;

      const notesPayload = req.body.notes || (systems ? {
        visual: systems.visual?.notes,
        auditory: systems.auditory?.notes,
        tactile: systems.tactile?.notes,
        vestibular: systems.vestibular?.notes,
        proprioceptive: systems.proprioceptive?.notes,
        olfactory: systems.olfactory?.notes,
        gustatory: systems.gustatory?.notes,
        interoceptive: systems.interoceptive?.notes
      } : null);

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'to-sen-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO to_sensory_assessments (
          id, tenant_id, patient_id, professional_id, appointment_id,
          tactile, auditory, visual, vestibular, proprioceptive,
          gustatory, olfactory, interoceptive, notes_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId, appointmentId || null,
        tactile, auditory, visual, vestibular, proprioceptive,
        gustatory, olfactory, interoceptive,
        notesPayload ? JSON.stringify(notesPayload) : null
      );

      res.status(201).json({ id, message: 'Avaliação sensorial gravada com sucesso' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar avaliação sensorial' });
    }
  }

  // 4. AVALIAÇÃO MOTORA, COGNITIVA & DESENVOLVIMENTO INFANTIL
  static getMotorCognitive(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isOccupationalTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao módulo ZemdaTO' });
        return;
      }

      const row = db.prepare('SELECT * FROM to_motor_cognitive_assessments WHERE patient_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 1').get(patientId, tenantId) as any;
      if (!row) {
        res.json(null);
        return;
      }

      const motor = row.motor_json ? JSON.parse(row.motor_json) : {};
      const cognitive = row.cognitive_json ? JSON.parse(row.cognitive_json) : {};
      const childDev = row.child_dev_json ? JSON.parse(row.child_dev_json) : {};

      const combinedData = {
        ...motor,
        ...cognitive,
        childDev,
        notes: row.notes || ''
      };

      res.json({
        ...row,
        motor,
        cognitive,
        child_dev: childDev,
        data: combinedData
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar avaliação motora/cognitiva' });
    }
  }

  static saveMotorCognitive(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isOccupationalTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao módulo ZemdaTO' });
        return;
      }

      const { patientId, appointmentId } = req.body;
      const rawData = req.body.data || req.body;

      const motor = req.body.motor || {
        fineMotorCoordination: rawData.fineMotorCoordination,
        grossMotorCoordination: rawData.grossMotorCoordination,
        palmarGrasp: rawData.palmarGrasp,
        digitalPinches: rawData.digitalPinches,
        motorPlanningPraxis: rawData.motorPlanningPraxis,
        muscleTone: rawData.muscleTone,
        jointRom: rawData.jointRom
      };

      const cognitive = req.body.cognitive || {
        attentionConcentration: rawData.attentionConcentration,
        executiveFunctions: rawData.executiveFunctions
      };

      const childDev = req.body.childDev || rawData.childDev || null;
      const notes = rawData.notes || req.body.notes || null;

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'to-mc-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO to_motor_cognitive_assessments (
          id, tenant_id, patient_id, professional_id, appointment_id,
          motor_json, cognitive_json, child_dev_json, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId, appointmentId || null,
        JSON.stringify(motor), JSON.stringify(cognitive), childDev ? JSON.stringify(childDev) : null, notes
      );

      res.status(201).json({ id, message: 'Avaliação motora/cognitiva salva com sucesso' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar avaliação motora/cognitiva' });
    }
  }

  // 5. PLANO TERAPÊUTICO OCUPACIONAL (Metas e prazos)
  static listTreatmentPlans(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isOccupationalTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao módulo ZemdaTO' });
        return;
      }

      const rows = db.prepare(`
        SELECT * FROM to_treatment_plans 
        WHERE patient_id = ? AND tenant_id = ? 
        ORDER BY created_at DESC
      `).all(patientId, tenantId) as any[];

      res.json(rows.map(r => ({
        ...r,
        goals: JSON.parse(r.goals_json || '[]')
      })));
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar planos terapêuticos' });
    }
  }

  static saveTreatmentPlan(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isOccupationalTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao módulo ZemdaTO' });
        return;
      }

      const { patientId, status = 'planned' } = req.body;
      const goals = req.body.goals || {
        title: req.body.title,
        shortTermGoals: req.body.shortTermGoals,
        mediumTermGoals: req.body.mediumTermGoals,
        longTermGoals: req.body.longTermGoals,
        interventions: req.body.interventions,
        familyGuidelines: req.body.familyGuidelines,
        frequencySessions: req.body.frequencySessions
      };

      if (!patientId) {
        res.status(400).json({ error: 'patientId é obrigatório' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'to-plan-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO to_treatment_plans (
          id, tenant_id, patient_id, professional_id, goals_json, status
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, tenantId, patientId, profId, JSON.stringify(goals), status);

      res.status(201).json({ id, message: 'Plano terapêutico registrado com sucesso' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar plano terapêutico' });
    }
  }

  // 6. TECNOLOGIA ASSISTIVA & ÓRTESES
  static listAssistiveTech(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isOccupationalTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao módulo ZemdaTO' });
        return;
      }

      const rows = db.prepare(`
        SELECT * FROM to_assistive_tech 
        WHERE patient_id = ? AND tenant_id = ? 
        ORDER BY created_at DESC
      `).all(patientId, tenantId) as any[];

      res.json(rows.map(r => ({
        ...r,
        resourceType: r.device_name,
        objective: r.indication || r.adaptation_type,
        materialsUsed: r.resource_details,
        customFittingNotes: r.resource_details,
        maintenanceFollowup: r.training_notes
      })));
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar dispositivos de tecnologia assistiva' });
    }
  }

  static saveAssistiveTech(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isOccupationalTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const { patientId, status = 'active', functionalResult, nextReviewDate, needsAdjustment, replacementReason } = req.body;
      const deviceName = req.body.deviceName || req.body.resourceType || 'Tecnologia Assistiva';
      const adaptationType = req.body.adaptationType || req.body.objective || null;
      const orthosisType = req.body.orthosisType || null;
      const resourceDetails = req.body.resourceDetails || req.body.materialsUsed || req.body.customFittingNotes || null;
      const photoUrl = req.body.photoUrl || null;
      const indication = req.body.indication || req.body.objective || null;
      const trainingNotes = req.body.trainingNotes || req.body.maintenanceFollowup || null;

      if (!patientId || !deviceName) {
        res.status(400).json({ error: 'patientId e deviceName são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'to-at-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO to_assistive_tech (
          id, tenant_id, patient_id, professional_id, device_name, adaptation_type,
          orthosis_type, resource_details, photo_url, indication, training_notes, status,
          functional_result, next_review_date, needs_adjustment, replacement_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId, deviceName, adaptationType,
        orthosisType, resourceDetails, photoUrl, indication,
        trainingNotes, status,
        functionalResult || null, nextReviewDate || null, needsAdjustment ? 1 : 0, replacementReason || null
      );

      res.status(201).json({ id, message: 'Dispositivo/órtese cadastrado com sucesso' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar dispositivo' });
    }
  }

  // 7. ANÁLISE DE TAREFAS (Decomposição em etapas com 7 níveis de assistência)
  static listTaskAnalyses(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isOccupationalTherapistOrClinicManager(req) || !hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const rows = db.prepare(`
        SELECT * FROM to_task_analyses
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY created_at DESC
      `).all(patientId, tenantId) as any[];

      res.json(rows.map(r => ({
        ...r,
        steps: (() => { try { return JSON.parse(r.steps_json); } catch { return []; } })()
      })));
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao listar análises de tarefa' });
    }
  }

  static saveTaskAnalysis(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isOccupationalTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const { patientId, appointmentId, activityName, steps, barriers, adaptations, strategies, notes } = req.body;
      if (!patientId || !activityName || !steps) {
        res.status(400).json({ error: 'patientId, activityName e steps são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'to-task-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO to_task_analyses (
          id, tenant_id, patient_id, professional_id, appointment_id,
          activity_name, steps_json, barriers, adaptations, strategies, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId, appointmentId || null,
        activityName, JSON.stringify(steps), barriers || null, adaptations || null, strategies || null, notes || null
      );

      res.status(201).json({ id, message: 'Análise de tarefa registrada com sucesso' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar análise de tarefa' });
    }
  }

  // 8. MAPA DE ROTINA
  static getRoutineMap(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isOccupationalTherapistOrClinicManager(req) || !hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const row = db.prepare(`
        SELECT * FROM to_routine_maps
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY created_at DESC LIMIT 1
      `).get(patientId, tenantId) as any;

      if (!row) {
        res.json(null);
        return;
      }

      res.json({
        ...row,
        timeBlocks: (() => { try { return JSON.parse(row.time_blocks_json); } catch { return []; } })()
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar mapa de rotina' });
    }
  }

  static saveRoutineMap(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isOccupationalTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const { patientId, timeBlocks, notes } = req.body;
      if (!patientId || !timeBlocks) {
        res.status(400).json({ error: 'patientId e timeBlocks são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'to-rot-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO to_routine_maps (
          id, tenant_id, patient_id, professional_id, time_blocks_json, notes
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, tenantId, patientId, profId, JSON.stringify(timeBlocks), notes || null);

      res.status(201).json({ id, message: 'Mapa de rotina registrado com sucesso' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar mapa de rotina' });
    }
  }

  // 9. PARTICIPAÇÃO OCUPACIONAL NOS 8 AMBIENTES
  static getParticipation(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isOccupationalTherapistOrClinicManager(req) || !hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const rows = db.prepare(`
        SELECT * FROM to_occupational_participation
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY created_at DESC
      `).all(patientId, tenantId) as any[];

      res.json(rows.map(r => ({
        ...r,
        participation: (() => { try { return JSON.parse(r.participation_json); } catch { return {}; } })()
      })));
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar participação ocupacional' });
    }
  }

  static saveParticipation(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isOccupationalTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const { patientId, participation, notes } = req.body;
      if (!patientId || !participation) {
        res.status(400).json({ error: 'patientId e participation são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'to-part-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO to_occupational_participation (
          id, tenant_id, patient_id, professional_id, participation_json, notes
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, tenantId, patientId, profId, JSON.stringify(participation), notes || null);

      res.status(201).json({ id, message: 'Registro de participação ocupacional salvo' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar participação ocupacional' });
    }
  }

  // 10. PROGRAMA DOMICILIAR / ESCOLAR (TO e Fono)
  static listHomePrograms(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      const moduleType = req.query.module_type ? String(req.query.module_type) : 'to';

      if (!hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const rows = db.prepare(`
        SELECT * FROM clinical_home_programs
        WHERE patient_id = ? AND tenant_id = ? AND module_type = ?
        ORDER BY created_at DESC
      `).all(patientId, tenantId, moduleType) as any[];

      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao listar programa domiciliar' });
    }
  }

  static saveHomeProgram(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const {
        patientId, moduleType = 'to', activity, objective, instruction,
        frequency, environmentContext, responsiblePerson, period
      } = req.body;

      if (!patientId || !activity || !objective || !instruction) {
        res.status(400).json({ error: 'patientId, activity, objective e instruction são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'prog-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO clinical_home_programs (
          id, tenant_id, patient_id, professional_id, module_type,
          activity, objective, instruction, frequency, environment_context,
          responsible_person, period, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `).run(
        id, tenantId, patientId, profId, moduleType,
        activity, objective, instruction, frequency || null, environmentContext || null,
        responsiblePerson || null, period || null
      );

      res.status(201).json({ id, message: 'Programa domiciliar/escolar prescrito' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar programa domiciliar' });
    }
  }

  static updateHomeProgramStatus(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;
      const { status, followUpNotes } = req.body;

      db.prepare(`
        UPDATE clinical_home_programs SET
          status = COALESCE(?, status),
          follow_up_notes = COALESCE(?, follow_up_notes),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(status || null, followUpNotes || null, id, tenantId);

      res.json({ message: 'Status do programa atualizado' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao atualizar status do programa' });
    }
  }

  // 11. DASHBOARD FUNCIONAL DO PACIENTE (Item 24)
  static getFunctionalDashboard(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isOccupationalTherapistOrClinicManager(req) || !hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      // Avaliações de AVD para índice de independência
      const avdRows = db.prepare(`
        SELECT * FROM to_avd_assessments
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY created_at ASC
      `).all(patientId, tenantId) as any[];

      let initialRate: number | null = null;
      let previousRate: number | null = null;
      let currentRate: number | null = null;

      const calcRate = (scoresJson: string) => {
        try {
          const items = JSON.parse(scoresJson);
          const arr = Array.isArray(items) ? items : (items.items || []);
          if (arr.length === 0) return null;
          const tot = arr.reduce((acc: number, cur: any) => acc + (cur.score || 0), 0);
          return Math.round((tot / (arr.length * 6)) * 100);
        } catch { return null; }
      };

      if (avdRows.length > 0) {
        initialRate = calcRate(avdRows[0].scores_json);
        currentRate = calcRate(avdRows[avdRows.length - 1].scores_json);
        if (avdRows.length > 1) {
          previousRate = calcRate(avdRows[avdRows.length - 2].scores_json);
        }
      }

      // Metas ativas e atingidas
      const goals = db.prepare(`
        SELECT * FROM clinical_goals
        WHERE patient_id = ? AND tenant_id = ? AND module_type = 'to'
      `).all(patientId, tenantId) as any[];

      const activeGoals = goals.filter(g => g.status === 'in_progress' || g.status === 'partially_reached' || g.status === 'not_started');
      const reachedGoals = goals.filter(g => g.status === 'reached');

      // Perfil (barreiras e facilitadores)
      const profile = db.prepare(`
        SELECT * FROM to_occupational_profiles
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY created_at DESC LIMIT 1
      `).get(patientId, tenantId) as any;

      // Dispositivos de tecnologia assistiva ativos
      const assistiveTech = db.prepare(`
        SELECT * FROM to_assistive_tech
        WHERE patient_id = ? AND tenant_id = ? AND status = 'active'
      `).all(patientId, tenantId) as any[];

      res.json({
        independence: {
          initial: initialRate,
          previous: previousRate,
          current: currentRate,
          deltaFromInitial: (initialRate !== null && currentRate !== null) ? (currentRate - initialRate) : null
        },
        goals: {
          activeCount: activeGoals.length,
          reachedCount: reachedGoals.length,
          active: activeGoals,
          reached: reachedGoals
        },
        facilitators: profile?.physical_env || 'Nenhum facilitador registrado.',
        barriers: profile?.social_env || 'Nenhuma barreira registrada.',
        assistiveTech,
        lastAssessmentDate: avdRows.length > 0 ? avdRows[avdRows.length - 1].created_at : null,
        totalAssessmentsCount: avdRows.length
      });
    } catch (err: any) {
      console.error('[TOController.getFunctionalDashboard]', err);
      res.status(500).json({ error: 'Erro ao gerar dashboard funcional' });
    }
  }

  // 7. FINALIZAÇÃO SEGURA DO ATENDIMENTO DE T.O. (Regra 56)
  static finishConsultation(req: Request, res: Response): void {
    if (req.body.appointmentId) {
      if (!isOccupationalTherapistOrClinicManager(req)) { res.status(403).json({ error: 'Sem acesso ao módulo clínico.' }); return; }
      const body = req.body;
      req.params.id = body.appointmentId;
      req.body = { ...body, evolution: {
        ...body, moduleType: 'ZemdaTO', moduleData: { ...body },
        clinicalEvolution: body.clinicalEvolution || 'Atendimento clínico registrado.'
      }};
      DocumentsController.finishConsultation(req, res);
      return;
    }
    try {
      const tenantId = req.tenantId;
      if (!isOccupationalTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao ZemdaTO' });
        return;
      }

      const {
        patientId, appointmentId, clinicalEvolution, avdData, sensoryData,
        motorCognitiveData, planData, sessionDate, sessionTime, title,
        technicalNotes, conducts, isSealed
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

      const creatorName = req.user?.name || req.user?.email || 'Terapeuta Ocupacional';
      const recordId = 'rec-to-' + uuidv4().slice(0, 8);
      const spDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
      const recDate = sessionDate || spDateStr;
      const recTime = sessionTime || null;
      const recTitle = title || 'Atendimento Terapêutico Ocupacional (ZemdaTO)';

      const toModuleData = {
        ...req.body,
        avd: avdData || null,
        sensory: sensoryData || null,
        motorCognitive: motorCognitiveData || null,
        plan: planData || null
      };

      db.exec('BEGIN TRANSACTION');
      let committed = false;

      try {
        db.prepare(`
          INSERT INTO records (
            id, tenant_id, patient_id, appointment_id, professional_id,
            session_date, session_time, procedure_name, title, clinical_evolution,
            technical_notes, conducts, clinical_data_json, module_type, module_data_json,
            is_sealed, created_by, updated_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ZemdaTO', ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
          recordId, tenantId, patientId, appointmentId || null, profId,
          recDate, recTime, 'Sessão de Terapia Ocupacional', recTitle, clinicalEvolution,
          technicalNotes || null, conducts || null, JSON.stringify(toModuleData),
          JSON.stringify(toModuleData), isSealed ? 1 : 0, creatorName, creatorName
        );

        if (appointmentId) {
          db.prepare(`UPDATE appointments SET status = 'completed', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`).run(appointmentId, tenantId);
        }

        db.exec('COMMIT');
        committed = true;
      } catch (err) {
        if (!committed) {
          try { db.exec('ROLLBACK'); } catch (_) {}
        }
        throw err;
      }

      logAudit(req, 'FINISH_TO_CONSULTATION', 'records', recordId, { patientId, appointmentId });
      res.status(201).json({
        recordId,
        message: 'Atendimento de Terapia Ocupacional finalizado e arquivado no prontuário!'
      });
    } catch (err: any) {
      console.error('[TOController.finishConsultation]', err);
      res.status(500).json({ error: 'Erro ao finalizar atendimento de T.O.' });
    }
  }
}
