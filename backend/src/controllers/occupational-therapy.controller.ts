import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';
import { ServiceReminderService } from '../services/service-reminder.service';
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
           u.status as u_status, CASE WHEN u.tenant_id=cu.tenant_id THEN u.profession_name END AS profession_name, CASE WHEN u.tenant_id=cu.tenant_id THEN u.practice_areas END as u_practice_areas, CASE WHEN u.tenant_id=cu.tenant_id THEN u.zemda_to_enabled END as u_zemda_to_enabled
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
      const patientId = String(req.params.patientId || req.query.patientId || '').trim();
      const tenantId = req.tenantId;
      const rawModule = req.query.module_type || req.query.specialty;
      const moduleFilter = rawModule ? String(rawModule).trim().toLowerCase() : null;

      if (!patientId || !hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const rows = (moduleFilter
        ? db.prepare(`
            SELECT hp.*,
                   pr.name AS professional_name,
                   pr.registration_type AS registration_type,
                   pr.registration_number AS registration_number,
                   pt.full_name AS patient_name
            FROM clinical_home_programs hp
            LEFT JOIN professionals pr ON pr.id = hp.professional_id AND pr.tenant_id = hp.tenant_id
            LEFT JOIN patients pt ON pt.id = hp.patient_id
            WHERE hp.patient_id = ? AND hp.tenant_id = ?
              AND (LOWER(COALESCE(hp.module_type, 'to')) = ? OR LOWER(COALESCE(hp.specialty, '')) = ?)
            ORDER BY hp.created_at DESC
          `).all(patientId, tenantId, moduleFilter, moduleFilter)
        : db.prepare(`
            SELECT hp.*,
                   pr.name AS professional_name,
                   pr.registration_type AS registration_type,
                   pr.registration_number AS registration_number,
                   pt.full_name AS patient_name
            FROM clinical_home_programs hp
            LEFT JOIN professionals pr ON pr.id = hp.professional_id AND pr.tenant_id = hp.tenant_id
            LEFT JOIN patients pt ON pt.id = hp.patient_id
            WHERE hp.patient_id = ? AND hp.tenant_id = ?
            ORDER BY hp.created_at DESC
          `).all(patientId, tenantId)) as any[];

      const normalized = rows.map((r: any) => ({
        ...r,
        id: r.id,
        patient_id: r.patient_id,
        patient_name: r.patient_name || null,
        professional_id: r.professional_id || null,
        professional_name: r.professional_name || null,
        registration_type: r.registration_type || null,
        registration_number: r.registration_number || null,
        specialty: r.specialty || r.module_type || 'to',
        module_type: r.module_type || r.specialty || 'to',
        setting: r.setting || r.environment_context || 'home',
        environment_context: r.environment_context || r.setting || 'home',
        title: r.title || r.activity || '',
        activity: r.activity || r.title || '',
        objective: r.objective || r.title || r.activity || '',
        instructions: r.instructions || r.instruction || '',
        instruction: r.instruction || r.instructions || '',
        materials_needed: r.materials_needed || null,
        frequency: r.frequency || null,
        status: r.status === 'pending' ? 'active' : (r.status || 'active'),
        created_at: r.created_at,
        updated_at: r.updated_at
      }));

      res.json(normalized);
    } catch (err: any) {
      console.error('[OccupationalTherapyController.listHomePrograms] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar programa de orientações' });
    }
  }

  static saveHomeProgram(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const {
        patientId,
        patient_id,
        specialty,
        moduleType,
        module_type,
        setting,
        environmentContext,
        environment_context,
        title,
        activity,
        objective,
        instructions,
        instruction,
        materialsNeeded,
        materials_needed,
        frequency,
        responsiblePerson,
        responsible_person,
        period
      } = req.body || {};

      const effectivePatientId = String(patientId || patient_id || '').trim();
      const effectiveTitle = String(title || activity || '').trim();
      const effectiveInstructions = String(instructions || instruction || '').trim();
      const effectiveObjective = String(objective || effectiveTitle || '').trim();
      const effectiveSetting = String(setting || environmentContext || environment_context || 'home').trim();
      const effectiveSpecialty = String(specialty || moduleType || module_type || 'to').trim().toLowerCase();
      const effectiveMaterials = String(materialsNeeded ?? materials_needed ?? '').trim() || null;
      const effectiveFrequency = String(frequency ?? '').trim() || null;
      const effectiveResponsible = String(responsiblePerson ?? responsible_person ?? '').trim() || null;
      const effectivePeriod = String(period ?? '').trim() || null;

      if (!effectivePatientId) {
        res.status(400).json({ error: 'Selecione um paciente válido para registrar a orientação.' });
        return;
      }
      if (!effectiveTitle) {
        res.status(400).json({ error: 'Informe o título da orientação ou atividade.' });
        return;
      }
      if (!effectiveInstructions) {
        res.status(400).json({ error: 'Informe as instruções passo a passo da orientação.' });
        return;
      }

      const patientRow = db.prepare('SELECT id, full_name, tenant_id FROM patients WHERE id = ?').get(effectivePatientId) as any;
      if (!patientRow || !hasClinicalAccess(req, effectivePatientId)) {
        res.status(403).json({ error: 'Sem permissão para registrar orientações para este paciente.' });
        return;
      }

      let profRow: any = null;
      if (req.user?.userId) {
        profRow = db.prepare('SELECT id, name, registration_type, registration_number FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
      }
      if (!profRow) {
        profRow = db.prepare('SELECT id, name, registration_type, registration_number FROM professionals WHERE tenant_id = ? ORDER BY active DESC, created_at ASC LIMIT 1').get(tenantId) as any;
      }
      const profId = profRow?.id || null;

      // Previne duplicidade acidental por cliques repetidos no mesmo intervalo curto
      const recentDup = db.prepare(`
        SELECT id, created_at FROM clinical_home_programs
        WHERE tenant_id = ? AND patient_id = ?
          AND COALESCE(title, activity) = ?
          AND COALESCE(instructions, instruction) = ?
          AND datetime(created_at) >= datetime('now', '-5 seconds')
        ORDER BY created_at DESC
        LIMIT 1
      `).get(tenantId, effectivePatientId, effectiveTitle, effectiveInstructions) as any;

      if (recentDup) {
        res.status(200).json({
          id: recentDup.id,
          patient_id: effectivePatientId,
          patient_name: patientRow.full_name || null,
          professional_id: profId,
          professional_name: profRow?.name || req.user?.name || null,
          registration_type: profRow?.registration_type || null,
          registration_number: profRow?.registration_number || null,
          specialty: effectiveSpecialty,
          module_type: effectiveSpecialty,
          setting: effectiveSetting,
          title: effectiveTitle,
          activity: effectiveTitle,
          objective: effectiveObjective,
          instructions: effectiveInstructions,
          instruction: effectiveInstructions,
          materials_needed: effectiveMaterials,
          frequency: effectiveFrequency,
          status: 'active',
          created_at: recentDup.created_at,
          message: 'Orientação registrada com sucesso'
        });
        return;
      }

      const id = 'prog-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO clinical_home_programs (
          id, tenant_id, patient_id, professional_id, module_type, specialty,
          setting, title, activity, objective, instruction, instructions,
          materials_needed, frequency, environment_context,
          responsible_person, period, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `).run(
        id,
        tenantId,
        effectivePatientId,
        profId,
        effectiveSpecialty,
        effectiveSpecialty,
        effectiveSetting,
        effectiveTitle,
        effectiveTitle,
        effectiveObjective,
        effectiveInstructions,
        effectiveInstructions,
        effectiveMaterials,
        effectiveFrequency,
        effectiveSetting,
        effectiveResponsible,
        effectivePeriod
      );

      const created = db.prepare('SELECT created_at FROM clinical_home_programs WHERE id = ?').get(id) as any;
      logAudit(req, 'CREATE_HOME_PROGRAM', 'clinical_home_programs', id, { patientId: effectivePatientId, title: effectiveTitle, setting: effectiveSetting });

      res.status(201).json({
        id,
        patient_id: effectivePatientId,
        patient_name: patientRow.full_name || null,
        professional_id: profId,
        professional_name: profRow?.name || req.user?.name || null,
        registration_type: profRow?.registration_type || null,
        registration_number: profRow?.registration_number || null,
        specialty: effectiveSpecialty,
        module_type: effectiveSpecialty,
        setting: effectiveSetting,
        title: effectiveTitle,
        activity: effectiveTitle,
        objective: effectiveObjective,
        instructions: effectiveInstructions,
        instruction: effectiveInstructions,
        materials_needed: effectiveMaterials,
        frequency: effectiveFrequency,
        status: 'active',
        created_at: created?.created_at || new Date().toISOString(),
        message: 'Programa domiciliar/escolar prescrito com sucesso'
      });
    } catch (err: any) {
      console.error('[OccupationalTherapyController.saveHomeProgram] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar programa de orientações' });
    }
  }

  static updateHomeProgramStatus(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;
      const { status, followUpNotes } = req.body || {};

      const existing = db.prepare('SELECT id, patient_id FROM clinical_home_programs WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!existing) {
        res.status(404).json({ error: 'Orientação não encontrada' });
        return;
      }
      if (!hasClinicalAccess(req, existing.patient_id)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const validStatuses = ['active', 'completed', 'paused', 'revised', 'pending', 'partially_completed', 'not_completed'];
      if (status && !validStatuses.includes(String(status))) {
        res.status(400).json({ error: 'Status de orientação inválido' });
        return;
      }

      db.prepare(`
        UPDATE clinical_home_programs SET
          status = COALESCE(?, status),
          follow_up_notes = COALESCE(?, follow_up_notes),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(status || null, followUpNotes || null, id, tenantId);

      res.json({ message: 'Status do programa atualizado', status });
    } catch (err: any) {
      console.error('[OccupationalTherapyController.updateHomeProgramStatus] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar status do programa' });
    }
  }

  static downloadHomeProgramPdf(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;

      const row = db.prepare(`
        SELECT hp.*,
               pr.name AS professional_name,
               pr.registration_type AS registration_type,
               pr.registration_number AS registration_number,
               pt.full_name AS patient_name
        FROM clinical_home_programs hp
        LEFT JOIN professionals pr ON pr.id = hp.professional_id AND pr.tenant_id = hp.tenant_id
        LEFT JOIN patients pt ON pt.id = hp.patient_id
        WHERE hp.id = ? AND hp.tenant_id = ?
      `).get(id, tenantId) as any;

      if (!row) {
        res.status(404).json({ error: 'Orientação não encontrada.' });
        return;
      }

      if (!hasClinicalAccess(req, row.patient_id)) {
        res.status(403).json({ error: 'Acesso restrito a esta orientação.' });
        return;
      }

      const tenant = db.prepare(`
        SELECT name, trade_name, cnpj_cpf AS cnpj, phone, email, address, city, state
        FROM tenants WHERE id = ?
      `).get(tenantId) as any;

      const clinicName = String(tenant?.trade_name || tenant?.name || 'Clínica').trim();
      const patientName = String(row.patient_name || 'Paciente').trim();
      const profName = String(row.professional_name || req.user?.name || '').trim();
      const profReg = row.registration_type && row.registration_number
        ? `${row.registration_type} ${row.registration_number}`
        : (row.registration_number ? String(row.registration_number) : '');

      const titleText = String(row.title || row.activity || 'Orientação Terapêutica').trim();
      const instructionsText = String(row.instructions || row.instruction || '').trim();
      const materialsText = String(row.materials_needed || '').trim();
      const frequencyText = String(row.frequency || '').trim();
      const settingKey = String(row.setting || row.environment_context || 'home').trim();
      const settingLabels: Record<string, string> = {
        home: 'Domiciliar (Casa / Família)',
        school: 'Escolar (Professor / Mediador)',
        community: 'Comunitário / Lazer',
        general: 'Geral (Todos os Ambientes)'
      };
      const settingLabel = settingLabels[settingKey] || settingKey;

      const rawDate = row.created_at ? new Date(String(row.created_at).replace(' ', 'T')) : new Date();
      const formattedDate = !isNaN(rawDate.getTime())
        ? rawDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        : String(row.created_at || '');

      const safeFilename = `orientacao-${row.id}.pdf`;
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 48, bottom: 56, left: 48, right: 48 },
        bufferPages: true,
        info: {
          Title: `Orientação - ${titleText}`,
          Author: `${clinicName} — Zemda`
        }
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.setHeader('Cache-Control', 'no-store');
      doc.pipe(res);

      const pageWidth = doc.page.width - 96;

      // Cabeçalho da Clínica + Identificação Zemda
      doc.font('Helvetica-Bold').fontSize(15).fillColor('#0f172a').text(clinicName, { width: pageWidth });
      const clinicDetails: string[] = [];
      if (tenant?.cnpj) clinicDetails.push(`CNPJ: ${tenant.cnpj}`);
      const addressParts = [tenant?.address, tenant?.city && tenant?.state ? `${tenant.city}/${tenant.state}` : (tenant?.city || tenant?.state)].filter(Boolean);
      if (addressParts.length > 0) clinicDetails.push(addressParts.join(' - '));
      const contactParts = [tenant?.phone ? `Tel: ${tenant.phone}` : null, tenant?.email].filter(Boolean);
      if (contactParts.length > 0) clinicDetails.push(contactParts.join(' • '));

      if (clinicDetails.length > 0) {
        doc.moveDown(0.2).font('Helvetica').fontSize(9).fillColor('#475569').text(clinicDetails.join('  |  '), { width: pageWidth });
      }
      doc.moveDown(0.2).font('Helvetica-Bold').fontSize(8.5).fillColor('#0d9488').text('ZEMDA — PRONTUÁRIO E GESTÃO CLÍNICA', { width: pageWidth });

      doc.moveDown(0.6);
      doc.moveTo(48, doc.y).lineTo(doc.page.width - 48, doc.y).lineWidth(1.2).strokeColor('#cbd5e1').stroke();
      doc.moveDown(0.8);

      // Título do Documento
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#0f172a').text('PROGRAMA DE ATIVIDADES E ORIENTAÇÕES (CASA / ESCOLA)', {
        width: pageWidth,
        align: 'center'
      });
      doc.moveDown(0.8);

      // Bloco de Identificação (Paciente, Profissional, Data, Ambiente, Frequência)
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e293b').text('Paciente: ', { continued: true })
        .font('Helvetica').fillColor('#0f172a').text(patientName);

      if (profName) {
        const profDisplay = profReg ? `${profName} (${profReg})` : profName;
        doc.moveDown(0.25).font('Helvetica-Bold').fontSize(10).fillColor('#1e293b').text('Profissional Responsável: ', { continued: true })
          .font('Helvetica').fillColor('#0f172a').text(profDisplay);
      }

      if (formattedDate) {
        doc.moveDown(0.25).font('Helvetica-Bold').fontSize(10).fillColor('#1e293b').text('Data da Orientação: ', { continued: true })
          .font('Helvetica').fillColor('#0f172a').text(formattedDate);
      }

      if (settingLabel) {
        doc.moveDown(0.25).font('Helvetica-Bold').fontSize(10).fillColor('#1e293b').text('Ambiente de Aplicação: ', { continued: true })
          .font('Helvetica').fillColor('#0f172a').text(settingLabel);
      }

      if (frequencyText) {
        doc.moveDown(0.25).font('Helvetica-Bold').fontSize(10).fillColor('#1e293b').text('Frequência Sugerida: ', { continued: true })
          .font('Helvetica').fillColor('#0f172a').text(frequencyText);
      }

      doc.moveDown(0.8);
      doc.moveTo(48, doc.y).lineTo(doc.page.width - 48, doc.y).lineWidth(0.6).strokeColor('#e2e8f0').stroke();
      doc.moveDown(0.8);

      // Título da Orientação / Atividade
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#0d9488').text('TÍTULO DA ORIENTAÇÃO / ATIVIDADE');
      doc.moveDown(0.25).font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text(titleText, { width: pageWidth, lineGap: 2 });

      // Materiais ou Adaptações Necessárias (somente se preenchido)
      if (materialsText) {
        doc.moveDown(0.8);
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#0d9488').text('MATERIAIS OU ADAPTAÇÕES NECESSÁRIAS');
        doc.moveDown(0.25).font('Helvetica').fontSize(10.5).fillColor('#1e293b').text(materialsText, { width: pageWidth, lineGap: 3 });
      }

      // Instruções Completas
      doc.moveDown(0.8);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#0d9488').text('INSTRUÇÕES E ORIENTAÇÕES DETALHADAS');
      doc.moveDown(0.35).font('Helvetica').fontSize(10.5).fillColor('#0f172a').text(instructionsText, {
        width: pageWidth,
        lineGap: 4
      });

      // Assinatura do Profissional no final
      if (profName) {
        if (doc.y > doc.page.height - 130) {
          doc.addPage();
        }
        doc.moveDown(2.2);
        const lineStart = (doc.page.width - 220) / 2;
        doc.moveTo(lineStart, doc.y).lineTo(lineStart + 220, doc.y).lineWidth(0.8).strokeColor('#94a3b8').stroke();
        doc.moveDown(0.3);
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text(profName, { width: pageWidth, align: 'center' });
        if (profReg) {
          doc.font('Helvetica').fontSize(9).fillColor('#475569').text(profReg, { width: pageWidth, align: 'center' });
        }
      }

      // Rodapé em todas as páginas
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const footerY = doc.page.height - 38;
        doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(
          `${clinicName} • Emitido via Zemda — Sistema Clínico • Página ${i + 1} de ${range.count}`,
          48,
          footerY,
          { width: pageWidth, align: 'center', lineBreak: false }
        );
      }

      doc.end();
    } catch (err: any) {
      console.error('[OccupationalTherapyController.downloadHomeProgramPdf] Erro:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Erro ao gerar PDF da orientação.' });
      }
    }
  }

  static downloadConsolidatedHomeProgramsPdf(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const patientId = String(req.params.patientId || '').trim();

      if (!patientId) {
        res.status(400).json({ error: 'ID do paciente é obrigatório.' });
        return;
      }

      if (!hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso restrito ao prontuário deste paciente.' });
        return;
      }

      const rawModule = req.query.module_type || req.query.specialty;
      const moduleFilter = rawModule && String(rawModule).trim().toLowerCase() !== 'all'
        ? String(rawModule).trim().toLowerCase()
        : null;

      const rows = (moduleFilter
        ? db.prepare(`
            SELECT hp.*,
                   pr.name AS professional_name,
                   pr.registration_type AS registration_type,
                   pr.registration_number AS registration_number,
                   pt.full_name AS patient_name
            FROM clinical_home_programs hp
            LEFT JOIN professionals pr ON pr.id = hp.professional_id AND pr.tenant_id = hp.tenant_id
            LEFT JOIN patients pt ON pt.id = hp.patient_id
            WHERE hp.patient_id = ? AND hp.tenant_id = ?
              AND (LOWER(COALESCE(hp.module_type, hp.specialty, 'to')) = ? OR LOWER(COALESCE(hp.specialty, hp.module_type, 'to')) = ?)
            ORDER BY datetime(COALESCE(hp.created_at, '1970-01-01')) DESC, hp.id DESC
          `).all(patientId, tenantId, moduleFilter, moduleFilter)
        : db.prepare(`
            SELECT hp.*,
                   pr.name AS professional_name,
                   pr.registration_type AS registration_type,
                   pr.registration_number AS registration_number,
                   pt.full_name AS patient_name
            FROM clinical_home_programs hp
            LEFT JOIN professionals pr ON pr.id = hp.professional_id AND pr.tenant_id = hp.tenant_id
            LEFT JOIN patients pt ON pt.id = hp.patient_id
            WHERE hp.patient_id = ? AND hp.tenant_id = ?
            ORDER BY datetime(COALESCE(hp.created_at, '1970-01-01')) DESC, hp.id DESC
          `).all(patientId, tenantId)) as any[];

      if (!rows || rows.length === 0) {
        res.status(404).json({ error: 'Nenhuma orientação cadastrada para este paciente.' });
        return;
      }

      const tenant = db.prepare(`
        SELECT name, trade_name, cnpj_cpf AS cnpj, phone, email, address, city, state
        FROM tenants WHERE id = ?
      `).get(tenantId) as any;

      let patientName = rows[0]?.patient_name;
      if (!patientName) {
        const pt = db.prepare('SELECT full_name FROM patients WHERE id = ?').get(patientId) as any;
        patientName = pt?.full_name || 'Paciente';
      }
      patientName = String(patientName).trim();

      const clinicName = String(tenant?.trade_name || tenant?.name || 'Clínica').trim();
      const issueDate = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

      const safePatientName = patientName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'paciente';

      const safeFilename = `orientacoes-casa-escola-${safePatientName}.pdf`;

      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 48, bottom: 56, left: 48, right: 48 },
        bufferPages: true,
        info: {
          Title: `Orientações Consolidadas - ${patientName}`,
          Author: `${clinicName} — Zemda`
        }
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.setHeader('Cache-Control', 'no-store');
      doc.pipe(res);

      const pageWidth = doc.page.width - 96;

      // Cabeçalho da Clínica + Identificação Zemda
      doc.font('Helvetica-Bold').fontSize(15).fillColor('#0f172a').text(clinicName, { width: pageWidth });
      const clinicDetails: string[] = [];
      if (tenant?.cnpj) clinicDetails.push(`CNPJ: ${tenant.cnpj}`);
      const addressParts = [tenant?.address, tenant?.city && tenant?.state ? `${tenant.city}/${tenant.state}` : (tenant?.city || tenant?.state)].filter(Boolean);
      if (addressParts.length > 0) clinicDetails.push(addressParts.join(' - '));
      const contactParts = [tenant?.phone ? `Tel: ${tenant.phone}` : null, tenant?.email].filter(Boolean);
      if (contactParts.length > 0) clinicDetails.push(contactParts.join(' • '));

      if (clinicDetails.length > 0) {
        doc.moveDown(0.2).font('Helvetica').fontSize(9).fillColor('#475569').text(clinicDetails.join('  |  '), { width: pageWidth });
      }
      doc.moveDown(0.2).font('Helvetica-Bold').fontSize(8.5).fillColor('#0d9488').text('ZEMDA — PRONTUÁRIO E GESTÃO CLÍNICA', { width: pageWidth });

      doc.moveDown(0.6);
      doc.moveTo(48, doc.y).lineTo(doc.page.width - 48, doc.y).lineWidth(1.2).strokeColor('#cbd5e1').stroke();
      doc.moveDown(0.8);

      // Título do Documento Consolidado
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#0f172a').text('PROGRAMA DE ATIVIDADES E ORIENTAÇÕES (CASA / ESCOLA)', {
        width: pageWidth,
        align: 'center'
      });
      doc.moveDown(0.2).font('Helvetica-Bold').fontSize(9.5).fillColor('#0d9488').text('DOCUMENTO CONSOLIDADO COM TODAS AS ORIENTAÇÕES SALVAS', {
        width: pageWidth,
        align: 'center'
      });
      doc.moveDown(0.7);

      // Bloco de Identificação Geral
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e293b').text('Paciente: ', { continued: true })
        .font('Helvetica').fillColor('#0f172a').text(patientName);
      doc.moveDown(0.2).font('Helvetica-Bold').fontSize(10).fillColor('#1e293b').text('Data de Emissão: ', { continued: true })
        .font('Helvetica').fillColor('#0f172a').text(issueDate);
      doc.moveDown(0.2).font('Helvetica-Bold').fontSize(10).fillColor('#1e293b').text('Total de Orientações: ', { continued: true })
        .font('Helvetica').fillColor('#0f172a').text(`${rows.length} orientação(ões) registrada(s)`);

      doc.moveDown(0.8);
      doc.moveTo(48, doc.y).lineTo(doc.page.width - 48, doc.y).lineWidth(1).strokeColor('#0d9488').stroke();
      doc.moveDown(0.9);

      const statusLabels: Record<string, string> = {
        active: 'Ativa',
        completed: 'Concluída',
        paused: 'Pausada',
        revised: 'Revisada',
        pending: 'Pendente',
        partially_completed: 'Parcialmente Concluída',
        not_completed: 'Não Realizada'
      };

      const settingLabels: Record<string, string> = {
        home: 'Domiciliar (Casa / Família)',
        school: 'Escolar (Professor / Mediador)',
        community: 'Comunitário / Lazer',
        general: 'Geral (Todos os Ambientes)',
        other: 'Outro Ambiente'
      };

      // Loop pelas orientações
      rows.forEach((row, index) => {
        // Se restar pouco espaço na folha, inicia nova página antes do cabeçalho da orientação
        if (doc.y > doc.page.height - 180) {
          doc.addPage();
        }

        const titleText = String(row.title || row.activity || 'Orientação Terapêutica').trim();
        const instructionsText = String(row.instructions || row.instruction || '').trim();
        const materialsText = String(row.materials_needed || '').trim();
        const frequencyText = String(row.frequency || '').trim();
        const settingKey = String(row.setting || row.environment_context || 'home').trim();
        const settingLabel = settingLabels[settingKey] || settingKey;
        const statusKey = String(row.status || 'active').trim();
        const statusLabel = statusLabels[statusKey] || statusKey;

        const rawDate = row.created_at ? new Date(String(row.created_at).replace(' ', 'T')) : new Date();
        const formattedDate = !isNaN(rawDate.getTime())
          ? rawDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
          : String(row.created_at || '');

        const profName = String(row.professional_name || '').trim();
        const profReg = row.registration_type && row.registration_number
          ? `${row.registration_type} ${row.registration_number}`
          : (row.registration_number ? String(row.registration_number) : '');

        // Faixa de Destaque da Orientação
        const itemY = doc.y;
        doc.rect(48, itemY, pageWidth, 24).fill('#f1f5f9');
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text(
          `ORIENTAÇÃO #${index + 1}: ${titleText.toUpperCase()}`,
          56,
          itemY + 6,
          { width: pageWidth - 120, ellipsis: true }
        );
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#0d9488').text(
          `Status: ${statusLabel}`,
          48,
          itemY + 6,
          { width: pageWidth - 8, align: 'right' }
        );

        doc.y = itemY + 30;

        // Metadados da Orientação
        const metaParts: string[] = [];
        if (formattedDate) metaParts.push(`Data de Criação: ${formattedDate}`);
        if (settingLabel) metaParts.push(`Ambiente: ${settingLabel}`);
        if (frequencyText) metaParts.push(`Frequência: ${frequencyText}`);

        doc.font('Helvetica').fontSize(9.5).fillColor('#334155').text(metaParts.join('  •  '), { width: pageWidth });

        if (profName) {
          const profDisplay = profReg ? `${profName} (${profReg})` : profName;
          doc.moveDown(0.25).font('Helvetica-Bold').fontSize(9.5).fillColor('#475569').text('Profissional Responsável: ', { continued: true })
            .font('Helvetica').fillColor('#1e293b').text(profDisplay);
        }

        // Materiais ou Adaptações Necessárias (somente se preenchido)
        if (materialsText) {
          doc.moveDown(0.45);
          doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0d9488').text('Materiais ou Adaptações: ', { continued: true })
            .font('Helvetica').fillColor('#1e293b').text(materialsText, { width: pageWidth, lineGap: 2 });
        }

        // Instruções Completas
        doc.moveDown(0.45);
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0d9488').text('Instruções e Orientações Detalhadas:');
        doc.moveDown(0.25).font('Helvetica').fontSize(10).fillColor('#0f172a').text(instructionsText, {
          width: pageWidth,
          lineGap: 3.5
        });

        // Divisória entre itens
        doc.moveDown(0.8);
        if (index < rows.length - 1) {
          doc.moveTo(48, doc.y).lineTo(doc.page.width - 48, doc.y).lineWidth(0.8).dash(3, { space: 3 }).strokeColor('#cbd5e1').stroke();
          doc.undash();
          doc.moveDown(1.0);
        }
      });

      // Rodapé em todas as páginas
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const footerY = doc.page.height - 38;
        doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(
          `${clinicName} • Orientações Consolidadas (Casa / Escola) • Página ${i + 1} de ${range.count}`,
          48,
          footerY,
          { width: pageWidth, align: 'center', lineBreak: false }
        );
      }

      doc.end();
    } catch (err: any) {
      console.error('[OccupationalTherapyController.downloadConsolidatedHomeProgramsPdf] Erro:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Erro ao gerar PDF consolidado das orientações.' });
      }
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
        if (appointmentId) {
          try {
            ServiceReminderService.onAppointmentCompleted(appointmentId, tenantId);
          } catch (reminderErr) {
            console.warn('[finishConsultation] Aviso ao gerar lembrete de retorno TO:', reminderErr);
          }
        }
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
