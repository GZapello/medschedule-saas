import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';
import { hasClinicalAccess } from './clinical.controller';

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
    tenant?.manager_profession,
    tenant?.manager_practice_areas
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

  const isAuthorized =
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
      res.json(row || null);
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

      const {
        patientId, appointmentId, routine, roles, interests, habits,
        meaningfulActivities, familyContext, schoolContext, workContext,
        communityContext, physicalEnv, socialEnv
      } = req.body;

      if (!patientId) {
        res.status(400).json({ error: 'patientId é obrigatório' });
        return;
      }

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
          routine || null, roles || null, interests || null, habits || null, meaningfulActivities || null,
          familyContext || null, schoolContext || null, workContext || null, communityContext || null,
          physicalEnv || null, socialEnv || null, existing.id, tenantId
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
          routine || null, roles || null, interests || null, habits || null, meaningfulActivities || null,
          familyContext || null, schoolContext || null, workContext || null, communityContext || null,
          physicalEnv || null, socialEnv || null
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

      res.json(rows.map(r => ({
        ...r,
        scores: JSON.parse(r.scores_json || '{}')
      })));
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

      const { patientId, appointmentId, assessmentType = 'avd', scores, overallLevel, notes } = req.body;
      if (!patientId || !scores) {
        res.status(400).json({ error: 'patientId e scores são obrigatórios' });
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
        assessmentType, JSON.stringify(scores), overallLevel || null, notes || null
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
      res.json({
        ...row,
        notes: row.notes_json ? JSON.parse(row.notes_json) : {}
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

      const {
        patientId, appointmentId, tactile, auditory, visual, vestibular,
        proprioceptive, gustatory, olfactory, interoceptive, notes
      } = req.body;

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
        tactile || null, auditory || null, visual || null, vestibular || null, proprioceptive || null,
        gustatory || null, olfactory || null, interoceptive || null,
        notes ? JSON.stringify(notes) : null
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
      res.json({
        ...row,
        motor: row.motor_json ? JSON.parse(row.motor_json) : {},
        cognitive: row.cognitive_json ? JSON.parse(row.cognitive_json) : {},
        child_dev: row.child_dev_json ? JSON.parse(row.child_dev_json) : {}
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

      const { patientId, appointmentId, motor, cognitive, childDev, notes } = req.body;
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
        motor ? JSON.stringify(motor) : null,
        cognitive ? JSON.stringify(cognitive) : null,
        childDev ? JSON.stringify(childDev) : null,
        notes || null
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

      const { patientId, goals, status = 'planned' } = req.body;
      if (!patientId || !goals) {
        res.status(400).json({ error: 'patientId e goals são obrigatórios' });
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

      res.json(rows);
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

      const { patientId, deviceName, adaptationType, orthosisType, resourceDetails, photoUrl, indication, trainingNotes, status = 'active' } = req.body;
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
          orthosis_type, resource_details, photo_url, indication, training_notes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId, deviceName, adaptationType || null,
        orthosisType || null, resourceDetails || null, photoUrl || null, indication || null,
        trainingNotes || null, status
      );

      res.status(201).json({ id, message: 'Dispositivo/órtese cadastrado com sucesso' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar dispositivo' });
    }
  }

  // 7. FINALIZAÇÃO SEGURA DO ATENDIMENTO DE T.O. (Regra 56)
  static finishConsultation(req: Request, res: Response): void {
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
