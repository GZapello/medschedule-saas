import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';
import { hasClinicalAccess } from './clinical.controller';
import { DocumentsController } from './documents.controller';
import { seedNutritionFoodDatabase } from '../config/nutrition-foods.seed';

/**
 * Validação de acesso exclusivo para Nutrição (ZemdaNutri - Regras 1 e 2)
 * Bloqueio REAL no backend:
 * 1. O usuário deve pertencer à profissão / área de atuação de Nutrição (prof-nutricionista, prof-nutricao, etc.)
 * 2. Gestor somente acessa se tiver formação/área em nutrição (Regra 2)
 * 3. SuperAdmin, Recepção, Financeiro e outras profissões: BLOQUEADOS (403)
 */
export function isNutritionistOrClinicManager(req: Request): boolean {
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
           cu.practice_areas as cu_practice_areas, cu.zemda_nutri_enabled,
           u.status as u_status, u.profession_name, u.practice_areas as u_practice_areas, u.zemda_nutri_enabled as u_zemda_nutri_enabled
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
    SELECT p.id, p.profession_id, p.practice_areas, p.specialty_custom, p.zemda_nutri_enabled,
           prof.slug as profession_slug, prof.name as profession_name
    FROM professionals p
    LEFT JOIN professions prof ON prof.id = p.profession_id
    WHERE p.user_id = ? AND p.tenant_id = ?
  `).get(req.user.userId, req.tenantId) as any;

  // 4. Critério 1: Profissão / Área clínica deve ser Nutrição
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

  const isNutriArea =
    prof?.profession_id === 'prof-nutricionista' ||
    prof?.profession_id === 'prof-nutricao' ||
    combinedProfessionText.includes('nutri') ||
    combinedProfessionText.includes('crn') ||
    combinedProfessionText.includes('diet');

  if (!isNutriArea) {
    return false;
  }

  // 5. Critério 2: Liberação explícita ou gerente atuando em nutrição
  let perms: string[] = [];
  try {
    if (clinicUser?.permissions_json) {
      perms = JSON.parse(clinicUser.permissions_json);
    }
  } catch {}

  const isManager = req.user.role === 'clinic_admin' || clinicUser?.is_manager === 1 || clinicUser?.role === 'clinic_admin';
  const isProfessional = req.user.role === 'professional';

  const isAuthorized =
    (isProfessional && isNutriArea) ||
    (isManager && isNutriArea) ||
    perms.includes('access_zemda_nutri') ||
    Number(prof?.zemda_nutri_enabled) === 1 ||
    Number(clinicUser?.zemda_nutri_enabled) === 1 ||
    Number(clinicUser?.u_zemda_nutri_enabled) === 1;

  return isAuthorized;
}

export class NutritionController {
  // 1. ANAMNESE NUTRICIONAL
  static getAnamnesis(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isNutritionistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao módulo ZemdaNutri' });
        return;
      }
      if (!hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso clínico restrito (LGPD)' });
        return;
      }

      const row = db.prepare('SELECT * FROM nutrition_anamnesis WHERE patient_id = ? AND tenant_id = ?').get(patientId, tenantId) as any;
      if (!row) {
        res.json(null);
        return;
      }

      res.json({
        ...row,
        data: JSON.parse(row.data_json || '{}')
      });
    } catch (err: any) {
      console.error('[NutritionController.getAnamnesis]', err);
      res.status(500).json({ error: 'Erro ao buscar anamnese nutricional' });
    }
  }

  static saveAnamnesis(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isNutritionistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao módulo ZemdaNutri' });
        return;
      }

      const { patientId, data } = req.body;
      if (!patientId || !data) {
        res.status(400).json({ error: 'patientId e data são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const dataJson = typeof data === 'string' ? data : JSON.stringify(data);
      const existing = db.prepare('SELECT id FROM nutrition_anamnesis WHERE patient_id = ? AND tenant_id = ?').get(patientId, tenantId) as any;

      if (existing) {
        db.prepare(`
          UPDATE nutrition_anamnesis 
          SET data_json = ?, professional_id = COALESCE(?, professional_id), updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(dataJson, profId, existing.id, tenantId);
        res.json({ id: existing.id, message: 'Anamnese nutricional atualizada com sucesso' });
      } else {
        const id = 'n-ana-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO nutrition_anamnesis (id, tenant_id, patient_id, professional_id, data_json)
          VALUES (?, ?, ?, ?, ?)
        `).run(id, tenantId, patientId, profId, dataJson);
        res.status(201).json({ id, message: 'Anamnese nutricional registrada com sucesso' });
      }
    } catch (err: any) {
      console.error('[NutritionController.saveAnamnesis]', err);
      res.status(500).json({ error: 'Erro ao salvar anamnese nutricional' });
    }
  }

  // 2. AVALIAÇÃO ANTROPOMÉTRICA & HISTÓRICO
  static listAssessments(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isNutritionistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao módulo ZemdaNutri' });
        return;
      }
      if (!hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso clínico restrito (LGPD)' });
        return;
      }

      const rows = db.prepare(`
        SELECT * FROM nutrition_assessments 
        WHERE patient_id = ? AND tenant_id = ? 
        ORDER BY assessment_date DESC, created_at DESC
      `).all(patientId, tenantId) as any[];

      const mapped = rows.map(r => ({
        ...r,
        custom_measures: r.custom_measures_json ? JSON.parse(r.custom_measures_json) : {}
      }));

      res.json(mapped);
    } catch (err: any) {
      console.error('[NutritionController.listAssessments]', err);
      res.status(500).json({ error: 'Erro ao listar avaliações antropométricas' });
    }
  }

  static saveAssessment(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isNutritionistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao módulo ZemdaNutri' });
        return;
      }

      const {
        patientId, appointmentId, recordId, assessmentDate,
        weight, height, waistCirc, abdominalCirc, hipCirc,
        armCirc, calfCirc, neckCirc, thighCirc, customMeasures, notes
      } = req.body;

      if (!patientId || !weight) {
        res.status(400).json({ error: 'patientId e weight são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      let calculatedBmi: number | null = null;
      if (weight && height) {
        const hMeters = Number(height) > 3 ? Number(height) / 100 : Number(height);
        calculatedBmi = Number((Number(weight) / (hMeters * hMeters)).toFixed(2));
      }

      const id = 'n-ass-' + uuidv4().slice(0, 8);
      const dateStr = assessmentDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

      db.prepare(`
        INSERT INTO nutrition_assessments (
          id, tenant_id, patient_id, professional_id, appointment_id, record_id,
          assessment_date, weight, height, bmi, waist_circ, abdominal_circ, hip_circ,
          arm_circ, calf_circ, neck_circ, thigh_circ, custom_measures_json, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId, appointmentId || null, recordId || null,
        dateStr, weight, height || null, calculatedBmi, waistCirc || null, abdominalCirc || null, hipCirc || null,
        armCirc || null, calfCirc || null, neckCirc || null, thighCirc || null,
        customMeasures ? JSON.stringify(customMeasures) : null, notes || null
      );

      res.status(201).json({ id, bmi: calculatedBmi, message: 'Avaliação antropométrica salva com sucesso' });
    } catch (err: any) {
      console.error('[NutritionController.saveAssessment]', err);
      res.status(500).json({ error: 'Erro ao salvar avaliação antropométrica' });
    }
  }

  // 3. BIOIMPEDÂNCIA / COMPOSIÇÃO CORPORAL
  static listBioimpedance(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isNutritionistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao módulo ZemdaNutri' });
        return;
      }

      const rows = db.prepare(`
        SELECT * FROM nutrition_bioimpedance 
        WHERE patient_id = ? AND tenant_id = ? 
        ORDER BY assessment_date DESC, created_at DESC
      `).all(patientId, tenantId) as any[];

      res.json(rows.map(r => ({
        ...r,
        bioimpedance_data: r.bioimpedance_data_json ? JSON.parse(r.bioimpedance_data_json) : null
      })));
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao listar exames de bioimpedância' });
    }
  }

  static saveBioimpedance(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isNutritionistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao módulo ZemdaNutri' });
        return;
      }

      const {
        patientId, appointmentId, recordId, assessmentDate,
        weight, muscleMass, fatMass, fatPercentage, visceralFat,
        bodyWater, boneMass, bmr, bioimpedanceData, attachmentUrl, notes
      } = req.body;

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'n-bio-' + uuidv4().slice(0, 8);
      const dateStr = assessmentDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

      db.prepare(`
        INSERT INTO nutrition_bioimpedance (
          id, tenant_id, patient_id, professional_id, appointment_id, record_id,
          assessment_date, weight, muscle_mass, fat_mass, fat_percentage, visceral_fat,
          body_water, bone_mass, bmr, bioimpedance_data_json, attachment_url, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId, appointmentId || null, recordId || null,
        dateStr, weight || null, muscleMass || null, fatMass || null, fatPercentage || null, visceralFat || null,
        bodyWater || null, boneMass || null, bmr || null,
        bioimpedanceData ? JSON.stringify(bioimpedanceData) : null, attachmentUrl || null, notes || null
      );

      res.status(201).json({ id, message: 'Bioimpedância registrada com sucesso' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar bioimpedância' });
    }
  }

  // 4. RECORDATÓRIO E DIÁRIO ALIMENTAR
  static listRecalls(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isNutritionistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao módulo ZemdaNutri' });
        return;
      }

      const rows = db.prepare(`
        SELECT * FROM nutrition_recalls 
        WHERE patient_id = ? AND tenant_id = ? 
        ORDER BY created_at DESC
      `).all(patientId, tenantId) as any[];

      res.json(rows.map(r => ({
        ...r,
        meals: JSON.parse(r.meals_json || '[]')
      })));
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar recordatórios alimentares' });
    }
  }

  static saveRecall(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isNutritionistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao módulo ZemdaNutri' });
        return;
      }

      const { patientId, appointmentId, recallType = '24h', meals, waterIntakeMl, observations } = req.body;
      if (!patientId || !meals) {
        res.status(400).json({ error: 'patientId e meals são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'n-rec-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO nutrition_recalls (
          id, tenant_id, patient_id, professional_id, appointment_id,
          recall_type, meals_json, water_intake_ml, observations
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId, appointmentId || null,
        recallType, JSON.stringify(meals), waterIntakeMl || null, observations || null
      );

      res.status(201).json({ id, message: 'Recordatório alimentar registrado' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar recordatório alimentar' });
    }
  }

  // 5. BANCO DE ALIMENTOS (TACO / TBCA / PERSONALIZADO)
  static listFoodDatabase(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const rawQ = req.query.q ? String(req.query.q) : '';
      const category = req.query.category ? String(req.query.category) : '';

      // Garante seed idempotente sempre pronto antes da busca
      seedNutritionFoodDatabase(db);

      // Função utilitária para remoção de acentos e busca tolerante
      const foldAccents = (str: string): string => {
        return (str || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim();
      };

      let sql = 'SELECT * FROM nutrition_food_database WHERE (tenant_id = ? OR tenant_id IS NULL)';
      const params: any[] = [tenantId];

      if (category) {
        sql += ' AND category = ?';
        params.push(category);
      }

      sql += ' ORDER BY is_clinic_custom DESC, name ASC';

      const allRows = db.prepare(sql).all(...params) as any[];

      if (!rawQ) {
        res.json(allRows.slice(0, 100));
        return;
      }

      const qNormalized = foldAccents(rawQ);
      const matched = allRows.filter((item: any) => {
        const normName = foldAccents(item.name);
        const normCat = foldAccents(item.category);
        const normCode = foldAccents(item.source_code || '');
        const normSource = foldAccents(item.source || '');
        return normName.includes(qNormalized) || normCat.includes(qNormalized) || normCode.includes(qNormalized) || normSource.includes(qNormalized);
      });

      res.json(matched.slice(0, 100));
    } catch (err: any) {
      console.error('[NutritionController.listFoodDatabase] Erro:', err);
      res.status(500).json({ error: 'Erro ao buscar banco de alimentos' });
    }
  }

  static saveCustomFood(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isNutritionistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const { name, category, portionSize, portionUnit, energyKcal, proteinG, carbsG, fatG, fiberG, sodiumMg } = req.body;
      if (!name || !category) {
        res.status(400).json({ error: 'Nome e categoria são obrigatórios' });
        return;
      }

      const id = 'fd-cus-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO nutrition_food_database (
          id, tenant_id, name, category, portion_size, portion_unit,
          energy_kcal, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, is_clinic_custom
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        id, tenantId, name, category, portionSize || 100, portionUnit || 'g',
        energyKcal || 0, proteinG || 0, carbsG || 0, fatG || 0, fiberG || 0, sodiumMg || 0
      );

      res.status(201).json({ id, message: 'Alimento personalizado cadastrado' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao cadastrar alimento personalizado' });
    }
  }

  // 6. PLANO ALIMENTAR
  static listMealPlans(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isNutritionistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const rows = db.prepare(`
        SELECT * FROM nutrition_meal_plans 
        WHERE patient_id = ? AND tenant_id = ? 
        ORDER BY created_at DESC
      `).all(patientId, tenantId) as any[];

      res.json(rows.map(r => ({
        ...r,
        meals: JSON.parse(r.meals_json || '[]')
      })));
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar planos alimentares' });
    }
  }

  static saveMealPlan(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isNutritionistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const { patientId, appointmentId, title, meals, totalCalories, totalProtein, totalCarbs, totalFat, guidelines, isActive = 1 } = req.body;
      if (!patientId || !title || !meals) {
        res.status(400).json({ error: 'patientId, title e meals são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'n-plan-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO nutrition_meal_plans (
          id, tenant_id, patient_id, professional_id, appointment_id,
          title, meals_json, total_calories, total_protein, total_carbs, total_fat,
          guidelines, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId, appointmentId || null,
        title, JSON.stringify(meals), totalCalories || 0, totalProtein || 0, totalCarbs || 0, totalFat || 0,
        guidelines || null, isActive ? 1 : 0
      );

      res.status(201).json({ id, message: 'Plano alimentar gerado com sucesso' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar plano alimentar' });
    }
  }

  // 7. METAS NUTRICIONAIS
  static listGoals(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isNutritionistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const rows = db.prepare(`
        SELECT * FROM nutrition_goals 
        WHERE patient_id = ? AND tenant_id = ? 
        ORDER BY created_at DESC
      `).all(patientId, tenantId) as any[];

      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar metas nutricionais' });
    }
  }

  static saveGoal(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isNutritionistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const { patientId, title, category, targetValue, currentValue, deadline, status = 'planned' } = req.body;
      if (!patientId || !title || !category) {
        res.status(400).json({ error: 'patientId, title e category são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'n-goal-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO nutrition_goals (
          id, tenant_id, patient_id, professional_id, title, category,
          target_value, current_value, deadline, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId, title, category,
        targetValue || null, currentValue || null, deadline || null, status
      );

      res.status(201).json({ id, message: 'Meta nutricional registrada' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao registrar meta nutricional' });
    }
  }

  static updateGoalStatus(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;
      const { status, currentValue } = req.body;

      db.prepare(`
        UPDATE nutrition_goals 
        SET status = ?, current_value = COALESCE(?, current_value), updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(status, currentValue || null, id, tenantId);

      res.json({ message: 'Status da meta atualizado' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao atualizar meta' });
    }
  }

  // 8. FINALIZAÇÃO SEGURA DO ATENDIMENTO NUTRICIONAL (Regra 56)
  static finishConsultation(req: Request, res: Response): void {
    if (req.body.appointmentId) {
      if (!isNutritionistOrClinicManager(req)) { res.status(403).json({ error: 'Sem acesso ao módulo clínico.' }); return; }
      const body = req.body;
      req.params.id = body.appointmentId;
      req.body = { ...body, evolution: {
        ...body, moduleType: 'ZemdaNutri', moduleData: { ...body },
        clinicalEvolution: body.clinicalEvolution || 'Atendimento clínico registrado.'
      }};
      DocumentsController.finishConsultation(req, res);
      return;
    }
    try {
      const tenantId = req.tenantId;
      if (!isNutritionistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao ZemdaNutri' });
        return;
      }

      const {
        patientId, appointmentId, clinicalEvolution, assessmentData,
        calculationsData, mealPlanData, goalsData, sessionDate, sessionTime,
        title, technicalNotes, conducts, isSealed
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

      const creatorName = req.user?.name || req.user?.email || 'Nutricionista';
      const recordId = 'rec-nut-' + uuidv4().slice(0, 8);
      const spDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
      const recDate = sessionDate || spDateStr;
      const recTime = sessionTime || null;
      const recTitle = title || 'Consulta Nutricional (ZemdaNutri)';

      const nutriModuleData = {
        ...req.body,
        assessment: assessmentData || null,
        calculations: calculationsData || null,
        mealPlan: mealPlanData || null,
        goals: goalsData || null
      };

      // Inicia transação atômica
      db.exec('BEGIN TRANSACTION');
      let committed = false;

      try {
        // 1. Grava no Prontuário Geral longitudinal
        db.prepare(`
          INSERT INTO records (
            id, tenant_id, patient_id, appointment_id, professional_id,
            session_date, session_time, procedure_name, title, clinical_evolution,
            technical_notes, conducts, clinical_data_json, module_type, module_data_json,
            is_sealed, created_by, updated_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ZemdaNutri', ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
          recordId, tenantId, patientId, appointmentId || null, profId,
          recDate, recTime, 'Consulta Nutricional', recTitle, clinicalEvolution,
          technicalNotes || null, conducts || null, JSON.stringify(nutriModuleData),
          JSON.stringify(nutriModuleData), isSealed ? 1 : 0, creatorName, creatorName
        );

        // 2. Grava avaliação antropométrica vinculada se preenchida
        if (assessmentData && assessmentData.weight) {
          const assId = 'n-ass-' + uuidv4().slice(0, 8);
          db.prepare(`
            INSERT INTO nutrition_assessments (
              id, tenant_id, patient_id, professional_id, appointment_id, record_id,
              assessment_date, weight, height, bmi, waist_circ, abdominal_circ, hip_circ,
              arm_circ, calf_circ, neck_circ, thigh_circ, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            assId, tenantId, patientId, profId, appointmentId || null, recordId,
            recDate, assessmentData.weight, assessmentData.height || null, assessmentData.bmi || null,
            assessmentData.waistCirc || null, assessmentData.abdominalCirc || null, assessmentData.hipCirc || null,
            assessmentData.armCirc || null, assessmentData.calfCirc || null, assessmentData.neckCirc || null,
            assessmentData.thighCirc || null, assessmentData.notes || null
          );
        }

        // 3. Atualiza agendamento para completed
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

      logAudit(req, 'FINISH_NUTRITION_CONSULTATION', 'records', recordId, { patientId, appointmentId });
      res.status(201).json({
        recordId,
        message: 'Consulta Nutricional finalizada e registrada com sucesso no prontuário!'
      });
    } catch (err: any) {
      console.error('[NutritionController.finishConsultation]', err);
      res.status(500).json({ error: 'Erro ao finalizar consulta nutricional' });
    }
  }
}
