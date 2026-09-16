import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';

/**
 * Validação de acesso ao ZemdaPersonal:
 * - SuperAdmin SaaS: sem acesso a dados de clientes
 * - Gerenciador da Clínica (clinic_admin): acesso total liberado
 * - Profissional / Funcionário: acesso concedido se possuir zemda_personal_enabled === 1
 *   ou 'access_zemda_personal' em permissions_json, ou se for profissional da área
 *   de Educação Física / Personal Trainer / CREF.
 */
export function hasPersonalAccess(req: Request): boolean {
  if (!req.user || !req.tenantId) return false;
  if (req.user.role === 'superadmin') return false;
  if (req.user.role === 'clinic_admin') return true;

  try {
    const cu = db.prepare('SELECT permissions_json, zemda_personal_enabled FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, req.tenantId) as any;
    if (cu) {
      if (cu.zemda_personal_enabled === 1) return true;
      if (cu.permissions_json) {
        try {
          const perms = JSON.parse(cu.permissions_json);
          if (Array.isArray(perms) && perms.includes('access_zemda_personal')) return true;
        } catch {}
      }
    }

    // Também verifica se o profissional atua na área de personal / educação física
    const prof = db.prepare(`
      SELECT p.id, p.practice_areas, p.registration_type, prof.name as prof_name
      FROM professionals p
      LEFT JOIN professions prof ON prof.id = p.profession_id
      WHERE p.user_id = ? AND p.tenant_id = ?
    `).get(req.user.userId, req.tenantId) as any;

    if (prof) {
      const pName = (prof.prof_name || '').toLowerCase();
      const pAreas = (prof.practice_areas || '').toLowerCase();
      const rType = (prof.registration_type || '').toLowerCase();
      if (
        pName.includes('personal') || pName.includes('educa') || pName.includes('físic') ||
        pAreas.includes('personal') || pAreas.includes('muscula') || pAreas.includes('treina') ||
        rType.includes('cref')
      ) {
        return true;
      }
    }
  } catch (err) {
    console.error('[hasPersonalAccess] Erro ao checar permissão:', err);
  }
  return false;
}

/**
 * Obtém o professional_id associado ao usuário atual, ou cria/associa fallback
 */
function getProfessionalId(req: Request): string {
  const tenantId = req.tenantId!;
  const userId = req.user!.userId;
  const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(userId, tenantId) as any;
  if (prof) return prof.id;

  // Fallback: primeiro profissional ativo da clínica ou cria um temporário
  const anyProf = db.prepare('SELECT id FROM professionals WHERE tenant_id = ? AND active = 1 LIMIT 1').get(tenantId) as any;
  if (anyProf) return anyProf.id;

  const newId = 'prof-' + uuidv4().slice(0, 8);
  const userName = (db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as any)?.name || 'Profissional';
  db.prepare(`
    INSERT INTO professionals (id, tenant_id, user_id, name, registration_number, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'CREF-TEMP', 1, datetime('now'), datetime('now'))
  `).run(newId, tenantId, userId, userName);
  return newId;
}

export class PersonalController {

  // ==========================================
  // DASHBOARD & OVERVIEW
  // ==========================================
  static async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;

      const totalStudents = (db.prepare("SELECT count(*) as count FROM patients WHERE tenant_id = ? AND active >= 0").get(tenantId) as any)?.count || 0;
      const activeStudents = (db.prepare("SELECT count(*) as count FROM patients WHERE tenant_id = ? AND active = 1").get(tenantId) as any)?.count || 0;
      const activeWorkouts = (db.prepare("SELECT count(*) as count FROM personal_workouts WHERE tenant_id = ? AND is_active = 1").get(tenantId) as any)?.count || 0;
      const monthAssessments = (db.prepare("SELECT count(*) as count FROM personal_assessments WHERE tenant_id = ? AND assessment_date >= date('now', 'start of month')").get(tenantId) as any)?.count || 0;
      const monthLogs = (db.prepare("SELECT count(*) as count FROM personal_workout_logs WHERE tenant_id = ? AND completed_at >= date('now', 'start of month')").get(tenantId) as any)?.count || 0;

      // Alunos com avaliações pendentes ou vencidas (> 60 dias)
      const pendingAssessments = db.prepare(`
        SELECT p.id, COALESCE(p.full_name, p.social_name) as name, p.phone, p.photo_url as avatar_url,
               MAX(pa.assessment_date) as last_assessment_date,
               CAST((julianday('now') - julianday(MAX(pa.assessment_date))) AS INTEGER) as days_since_last
        FROM patients p
        LEFT JOIN personal_assessments pa ON pa.patient_id = p.id AND pa.tenant_id = p.tenant_id
        WHERE p.tenant_id = ? AND p.active = 1
        GROUP BY p.id
        HAVING last_assessment_date IS NULL OR days_since_last > 60
        ORDER BY days_since_last DESC NULLS FIRST
        LIMIT 5
      `).all(tenantId) as any[];

      // Atendimentos / Aulas de hoje vinculadas a agendamentos
      const todayAppointments = db.prepare(`
        SELECT a.id, substr(a.start_time, 1, 10) as date, a.start_time, a.end_time, a.status,
               p.id as patient_id, COALESCE(p.full_name, p.social_name) as patient_name, p.phone as patient_phone, p.photo_url as avatar_url
        FROM appointments a
        JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
        WHERE a.tenant_id = ? AND (date(a.start_time) = date('now') OR substr(a.start_time, 1, 10) = date('now'))
        ORDER BY a.start_time ASC
      `).all(tenantId) as any[];

      // Treinos recentes concluídos
      const recentLogs = db.prepare(`
        SELECT l.id, l.completed_at, l.duration_minutes, l.rpe, l.feedback_notes,
               COALESCE(p.full_name, p.social_name) as patient_name, p.photo_url as avatar_url,
               w.title as workout_title, w.division
        FROM personal_workout_logs l
        JOIN patients p ON p.id = l.patient_id AND p.tenant_id = l.tenant_id
        LEFT JOIN personal_workouts w ON w.id = l.workout_id
        WHERE l.tenant_id = ?
        ORDER BY l.completed_at DESC
        LIMIT 6
      `).all(tenantId) as any[];

      // Volume muscular semanal médio (séries/semana por grupamento em treinos ativos)
      const volumeSummary = db.prepare(`
        SELECT we.muscle_group, SUM(we.sets) as total_sets
        FROM personal_workout_exercises we
        JOIN personal_workouts w ON w.id = we.workout_id
        WHERE we.tenant_id = ? AND w.is_active = 1
        GROUP BY we.muscle_group
        ORDER BY total_sets DESC
      `).all(tenantId) as any[];

      res.json({
        metrics: {
          totalStudents,
          activeStudents,
          activeWorkouts,
          monthAssessments,
          monthLogs
        },
        pendingAssessments,
        todayAppointments,
        recentLogs,
        volumeSummary
      });
    } catch (err: any) {
      console.error('[PersonalController.getDashboard] Erro:', err);
      res.status(500).json({ error: 'Erro ao carregar painel do ZemdaPersonal' });
    }
  }

  // ==========================================
  // ALUNOS / ESTUDANTES
  // ==========================================
  static async listStudents(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const q = req.query.q ? String(req.query.q).trim() : '';

      let sql = `
        SELECT p.id, COALESCE(p.full_name, p.social_name) as name, p.email, p.phone, p.birth_date, p.gender,
               CASE WHEN p.active = 1 THEN 'active' ELSE 'inactive' END as status,
               p.photo_url as avatar_url, p.created_at,
               prof.goal, prof.experience_level, prof.weekly_frequency, prof.restrictions,
               prof.height, prof.current_weight,
               (SELECT COUNT(*) FROM personal_workouts w WHERE w.patient_id = p.id AND w.is_active = 1) as active_workouts_count,
               (SELECT MAX(pa.assessment_date) FROM personal_assessments pa WHERE pa.patient_id = p.id) as last_assessment_date,
               (SELECT pa2.body_fat_percentage FROM personal_assessments pa2 WHERE pa2.patient_id = p.id ORDER BY pa2.assessment_date DESC LIMIT 1) as last_fat_pct
        FROM patients p
        LEFT JOIN personal_student_profiles prof ON prof.patient_id = p.id AND prof.tenant_id = p.tenant_id
        WHERE p.tenant_id = ? AND p.active >= 0
      `;
      const params: any[] = [tenantId];

      if (q) {
        sql += ` AND (p.full_name LIKE ? OR p.email LIKE ? OR p.phone LIKE ? OR p.cpf LIKE ?)`;
        const wild = `%${q}%`;
        params.push(wild, wild, wild, wild);
      }

      sql += ` ORDER BY p.full_name ASC`;

      const students = db.prepare(sql).all(...params) as any[];
      res.json({ students });
    } catch (err: any) {
      console.error('[PersonalController.listStudents] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar alunos' });
    }
  }

  static async getStudent(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const { id } = req.params;

      const student = db.prepare(`
        SELECT p.id, COALESCE(p.full_name, p.social_name) as name, p.email, p.phone, p.cpf, p.birth_date, p.gender, p.address, p.notes_admin as patient_notes,
               CASE WHEN p.active = 1 THEN 'active' ELSE 'inactive' END as status,
               p.photo_url as avatar_url, p.created_at,
               prof.goal, prof.experience_level, prof.weekly_frequency, prof.training_preferences,
               prof.restrictions, prof.notes as personal_notes, prof.height, prof.current_weight
        FROM patients p
        LEFT JOIN personal_student_profiles prof ON prof.patient_id = p.id AND prof.tenant_id = p.tenant_id
        WHERE p.id = ? AND p.tenant_id = ?
      `).get(id, tenantId) as any;

      if (!student) {
        res.status(404).json({ error: 'Aluno não encontrado' });
        return;
      }

      // Treinos ativos do aluno
      const workouts = db.prepare(`
        SELECT w.*,
               (SELECT COUNT(*) FROM personal_workout_exercises we WHERE we.workout_id = w.id) as exercises_count
        FROM personal_workouts w
        WHERE w.patient_id = ? AND w.tenant_id = ? AND w.is_active = 1
        ORDER BY w.division ASC
      `).all(id, tenantId) as any[];

      // Últimas 3 avaliações
      const recentAssessments = db.prepare(`
        SELECT id, assessment_date, weight, height, bmi, body_fat_percentage, muscle_mass_kg, lean_mass_kg, fat_mass_kg, protocol
        FROM personal_assessments
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY assessment_date DESC
        LIMIT 3
      `).all(id, tenantId) as any[];

      // Últimos 5 logs de treino
      const recentLogs = db.prepare(`
        SELECT l.*, w.title as workout_title, w.division
        FROM personal_workout_logs l
        LEFT JOIN personal_workouts w ON w.id = l.workout_id
        WHERE l.patient_id = ? AND l.tenant_id = ?
        ORDER BY l.completed_at DESC
        LIMIT 5
      `).all(id, tenantId) as any[];

      res.json({
        student,
        workouts,
        recentAssessments,
        recentLogs
      });
    } catch (err: any) {
      console.error('[PersonalController.getStudent] Erro:', err);
      res.status(500).json({ error: 'Erro ao obter dados do aluno' });
    }
  }

  static async upsertProfile(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const { id } = req.params; // patient_id
      const {
        goal, experience_level, weekly_frequency, training_preferences,
        restrictions, notes, height, current_weight
      } = req.body;

      const patient = db.prepare('SELECT id FROM patients WHERE id = ? AND tenant_id = ?').get(id, tenantId);
      if (!patient) {
        res.status(404).json({ error: 'Aluno não encontrado' });
        return;
      }

      const existing = db.prepare('SELECT id FROM personal_student_profiles WHERE patient_id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (existing) {
        db.prepare(`
          UPDATE personal_student_profiles SET
            goal = ?, experience_level = ?, weekly_frequency = ?, training_preferences = ?,
            restrictions = ?, notes = ?, height = ?, current_weight = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(
          goal || null, experience_level || null, weekly_frequency || 3, training_preferences || null,
          restrictions || null, notes || null, height || null, current_weight || null, existing.id
        );
      } else {
        const newId = 'psp-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO personal_student_profiles (
            id, tenant_id, patient_id, goal, experience_level, weekly_frequency,
            training_preferences, restrictions, notes, height, current_weight
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          newId, tenantId, id, goal || null, experience_level || null, weekly_frequency || 3,
          training_preferences || null, restrictions || null, notes || null, height || null, current_weight || null
        );
      }

      logAudit(req, 'UPDATE_STUDENT_PROFILE', 'personal_student_profiles', id, { goal, experience_level });
      res.json({ message: 'Perfil de treinamento salvo com sucesso' });
    } catch (err: any) {
      console.error('[PersonalController.upsertProfile] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar perfil de treinamento' });
    }
  }

  // ==========================================
  // AVALIAÇÕES FÍSICAS & COMPOSIÇÃO CORPORAL
  // ==========================================
  static async listAssessments(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const { studentId } = req.params;

      const assessments = db.prepare(`
        SELECT a.*,
               u.name as professional_name,
               (SELECT COUNT(*) FROM personal_assessment_photos p WHERE p.assessment_id = a.id) as photos_count
        FROM personal_assessments a
        LEFT JOIN professionals pr ON pr.id = a.professional_id
        LEFT JOIN users u ON u.id = pr.user_id
        WHERE a.patient_id = ? AND a.tenant_id = ?
        ORDER BY a.assessment_date DESC
      `).all(studentId, tenantId) as any[];

      res.json({ assessments });
    } catch (err: any) {
      console.error('[PersonalController.listAssessments] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar avaliações físicas' });
    }
  }

  static async getAssessment(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const { id } = req.params;

      const assessment = db.prepare(`
        SELECT a.*, u.name as professional_name
        FROM personal_assessments a
        LEFT JOIN professionals pr ON pr.id = a.professional_id
        LEFT JOIN users u ON u.id = pr.user_id
        WHERE a.id = ? AND a.tenant_id = ?
      `).get(id, tenantId) as any;

      if (!assessment) {
        res.status(404).json({ error: 'Avaliação física não encontrada' });
        return;
      }

      const photos = db.prepare(`
        SELECT * FROM personal_assessment_photos
        WHERE assessment_id = ? AND tenant_id = ?
        ORDER BY photo_type ASC
      `).all(id, tenantId) as any[];

      res.json({ assessment, photos });
    } catch (err: any) {
      console.error('[PersonalController.getAssessment] Erro:', err);
      res.status(500).json({ error: 'Erro ao obter avaliação física' });
    }
  }

  static async createAssessment(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const professionalId = getProfessionalId(req);
      const b = req.body;

      const patient = db.prepare('SELECT id, birth_date, gender FROM patients WHERE id = ? AND tenant_id = ?').get(b.patient_id, tenantId) as any;
      if (!patient) {
        res.status(404).json({ error: 'Aluno não encontrado' });
        return;
      }

      // Calcula idade aproximada
      let age = 30;
      if (patient.birth_date) {
        const diffMs = Date.now() - new Date(patient.birth_date).getTime();
        age = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365.25));
      }
      const isMale = (patient.gender || '').toLowerCase().startsWith('m');

      const weight = Number(b.weight) || 0;
      const height = Number(b.height) || 0; // cm

      // IMC
      let bmi = 0;
      if (weight > 0 && height > 0) {
        const heightM = height / 100;
        bmi = parseFloat((weight / (heightM * heightM)).toFixed(2));
      }

      // Relação Cintura-Quadril (RCQ / WHR)
      const waist = Number(b.waist_cm) || 0;
      const hip = Number(b.hip_cm) || 0;
      let whr = 0;
      if (waist > 0 && hip > 0) {
        whr = parseFloat((waist / hip).toFixed(2));
      }

      // Relação Cintura-Estatura (RCE / WHtR)
      let whtr = 0;
      if (waist > 0 && height > 0) {
        whtr = parseFloat((waist / height).toFixed(2));
      }

      // Dobras cutâneas
      const sSub = Number(b.fold_subscapular) || 0;
      const sTri = Number(b.fold_triceps) || 0;
      const sChe = Number(b.fold_chest) || 0;
      const sAxi = Number(b.fold_axillary) || 0;
      const sSup = Number(b.fold_suprailiac) || 0;
      const sAbd = Number(b.fold_abdominal) || 0;
      const sThi = Number(b.fold_thigh) || 0;
      const sCal = Number(b.fold_calf) || 0;

      let bodyFatPct = Number(b.body_fat_percentage) || 0;
      const protocol = b.protocol || 'pollock_7';

      if (!bodyFatPct || bodyFatPct <= 0) {
        if (protocol === 'pollock_7' && (sSub + sTri + sChe + sAxi + sSup + sAbd + sThi) > 0) {
          const sum7 = sSub + sTri + sChe + sAxi + sSup + sAbd + sThi;
          let density = 0;
          if (isMale) {
            density = 1.112 - (0.00043499 * sum7) + (0.00000055 * sum7 * sum7) - (0.00028826 * age);
          } else {
            density = 1.097 - (0.00046971 * sum7) + (0.00000056 * sum7 * sum7) - (0.00012828 * age);
          }
          if (density > 0) {
            bodyFatPct = ((4.95 / density) - 4.5) * 100;
          }
        } else if (protocol === 'pollock_3') {
          let density = 0;
          if (isMale) {
            // Pollock 3 Homens: Peito, Abdômen, Coxa
            const sum3 = sChe + sAbd + sThi;
            density = 1.10938 - (0.0008267 * sum3) + (0.0000016 * sum3 * sum3) - (0.0002574 * age);
          } else {
            // Pollock 3 Mulheres: Tríceps, Suprailíaca, Coxa
            const sum3 = sTri + sSup + sThi;
            density = 1.0994921 - (0.0009929 * sum3) + (0.0000023 * sum3 * sum3) - (0.0001392 * age);
          }
          if (density > 0) {
            bodyFatPct = ((4.95 / density) - 4.5) * 100;
          }
        }
      }

      bodyFatPct = Math.max(0, Math.min(65, parseFloat(bodyFatPct.toFixed(2))));
      const fatMassKg = parseFloat(((weight * bodyFatPct) / 100).toFixed(2));
      const leanMassKg = parseFloat((weight - fatMassKg).toFixed(2));
      const muscleMassKg = b.muscle_mass_kg ? Number(b.muscle_mass_kg) : parseFloat((leanMassKg * 0.52).toFixed(2)); // Estimativa aproximada de massa muscular esquelética

      const assessmentId = 'pass-' + uuidv4().slice(0, 8);
      const assessmentDate = b.assessment_date || new Date().toISOString().split('T')[0];

      db.prepare(`
        INSERT INTO personal_assessments (
          id, tenant_id, patient_id, professional_id, assessment_date,
          weight, height, bmi, whr, whtr,
          neck_cm, shoulder_cm, chest_cm,
          arm_right_relaxed, arm_left_relaxed, arm_right_flexed, arm_left_flexed,
          forearm_right, forearm_left, wrist_right, wrist_left,
          waist_cm, abdomen_cm, hip_cm,
          thigh_right_prox, thigh_left_prox, thigh_right_med, thigh_left_med,
          calf_right, calf_left,
          fold_subscapular, fold_triceps, fold_chest, fold_axillary,
          fold_suprailiac, fold_abdominal, fold_thigh, fold_calf,
          body_fat_percentage, fat_mass_kg, lean_mass_kg, muscle_mass_kg,
          protocol, notes
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?
        )
      `).run(
        assessmentId, tenantId, b.patient_id, professionalId, assessmentDate,
        weight, height, bmi, whr, whtr,
        b.neck_cm || null, b.shoulder_cm || null, b.chest_cm || null,
        b.arm_right_relaxed || null, b.arm_left_relaxed || null, b.arm_right_flexed || null, b.arm_left_flexed || null,
        b.forearm_right || null, b.forearm_left || null, b.wrist_right || null, b.wrist_left || null,
        b.waist_cm || null, b.abdomen_cm || null, b.hip_cm || null,
        b.thigh_right_prox || null, b.thigh_left_prox || null, b.thigh_right_med || null, b.thigh_left_med || null,
        b.calf_right || null, b.calf_left || null,
        sSub || null, sTri || null, sChe || null, sAxi || null,
        sSup || null, sAbd || null, sThi || null, sCal || null,
        bodyFatPct, fatMassKg, leanMassKg, muscleMassKg,
        protocol, b.notes || null
      );

      // Atualiza peso atual e altura no perfil do aluno
      db.prepare(`
        INSERT INTO personal_student_profiles (id, tenant_id, patient_id, height, current_weight, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(tenant_id, patient_id) DO UPDATE SET
          height = COALESCE(excluded.height, personal_student_profiles.height),
          current_weight = COALESCE(excluded.current_weight, personal_student_profiles.current_weight),
          updated_at = datetime('now')
      `).run('psp-' + uuidv4().slice(0, 8), tenantId, b.patient_id, height || null, weight || null);

      // Salva fotos anexadas se fornecidas
      if (Array.isArray(b.photos)) {
        for (const p of b.photos) {
          if (p.photo_url && p.photo_type) {
            db.prepare(`
              INSERT INTO personal_assessment_photos (id, tenant_id, assessment_id, patient_id, photo_type, photo_url, photo_date, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run('paph-' + uuidv4().slice(0, 8), tenantId, assessmentId, b.patient_id, p.photo_type, p.photo_url, assessmentDate, p.notes || null);
          }
        }
      }

      logAudit(req, 'CREATE_ASSESSMENT', 'personal_assessments', assessmentId, { patient_id: b.patient_id, bodyFatPct, weight });
      res.status(201).json({
        id: assessmentId,
        bmi,
        whr,
        whtr,
        body_fat_percentage: bodyFatPct,
        fat_mass_kg: fatMassKg,
        lean_mass_kg: leanMassKg,
        muscle_mass_kg: muscleMassKg,
        message: 'Avaliação física salva com sucesso'
      });
    } catch (err: any) {
      console.error('[PersonalController.createAssessment] Erro:', err);
      res.status(500).json({ error: 'Erro ao criar avaliação física' });
    }
  }

  static async deleteAssessment(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const { id } = req.params;

      db.prepare('DELETE FROM personal_assessment_photos WHERE assessment_id = ? AND tenant_id = ?').run(id, tenantId);
      const result = db.prepare('DELETE FROM personal_assessments WHERE id = ? AND tenant_id = ?').run(id, tenantId);

      if (result.changes === 0) {
        res.status(404).json({ error: 'Avaliação não encontrada' });
        return;
      }

      logAudit(req, 'DELETE_ASSESSMENT', 'personal_assessments', id);
      res.json({ message: 'Avaliação excluída com sucesso' });
    } catch (err: any) {
      console.error('[PersonalController.deleteAssessment] Erro:', err);
      res.status(500).json({ error: 'Erro ao excluir avaliação' });
    }
  }

  static async getEvolutionData(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const { studentId } = req.params;

      const history = db.prepare(`
        SELECT id, assessment_date, weight, bmi, body_fat_percentage, fat_mass_kg, lean_mass_kg, muscle_mass_kg,
               waist_cm, abdomen_cm, hip_cm, chest_cm, arm_right_flexed, thigh_right_med
        FROM personal_assessments
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY assessment_date ASC
      `).all(studentId, tenantId) as any[];

      res.json({ history });
    } catch (err: any) {
      console.error('[PersonalController.getEvolutionData] Erro:', err);
      res.status(500).json({ error: 'Erro ao obter dados de evolução' });
    }
  }

  // ==========================================
  // FOTOS ANTES × DEPOIS
  // ==========================================
  static async listPhotos(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const { studentId } = req.params;

      const photos = db.prepare(`
        SELECT p.*, a.weight, a.body_fat_percentage
        FROM personal_assessment_photos p
        LEFT JOIN personal_assessments a ON a.id = p.assessment_id
        WHERE p.patient_id = ? AND p.tenant_id = ?
        ORDER BY p.photo_date ASC, p.photo_type ASC
      `).all(studentId, tenantId) as any[];

      res.json({ photos });
    } catch (err: any) {
      console.error('[PersonalController.listPhotos] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar fotos do aluno' });
    }
  }

  static async savePhoto(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const { patient_id, assessment_id, photo_type, photo_url, photo_date, notes } = req.body;

      if (!patient_id || !photo_type || !photo_url) {
        res.status(400).json({ error: 'Campos patient_id, photo_type e photo_url são obrigatórios' });
        return;
      }

      const id = 'paph-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO personal_assessment_photos (id, tenant_id, assessment_id, patient_id, photo_type, photo_url, photo_date, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, tenantId, assessment_id || null, patient_id, photo_type, photo_url, photo_date || new Date().toISOString().split('T')[0], notes || null);

      res.status(201).json({ id, message: 'Foto registrada com sucesso' });
    } catch (err: any) {
      console.error('[PersonalController.savePhoto] Erro:', err);
      res.status(500).json({ error: 'Erro ao registrar foto' });
    }
  }

  static async deletePhoto(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const { id } = req.params;

      const result = db.prepare('DELETE FROM personal_assessment_photos WHERE id = ? AND tenant_id = ?').run(id, tenantId);
      if (result.changes === 0) {
        res.status(404).json({ error: 'Foto não encontrada' });
        return;
      }
      res.json({ message: 'Foto removida com sucesso' });
    } catch (err: any) {
      console.error('[PersonalController.deletePhoto] Erro:', err);
      res.status(500).json({ error: 'Erro ao remover foto' });
    }
  }

  // ==========================================
  // BIBLIOTECA DE EXERCÍCIOS
  // ==========================================
  static async listExercises(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const muscle = req.query.muscle ? String(req.query.muscle).trim() : '';
      const q = req.query.q ? String(req.query.q).trim() : '';

      let sql = `
        SELECT * FROM personal_exercises
        WHERE (tenant_id = ? OR tenant_id = 'global')
      `;
      const params: any[] = [tenantId];

      if (muscle) {
        sql += ` AND LOWER(muscle_group) = LOWER(?)`;
        params.push(muscle);
      }
      if (q) {
        sql += ` AND (LOWER(name) LIKE LOWER(?) OR LOWER(instructions) LIKE LOWER(?))`;
        const wild = `%${q}%`;
        params.push(wild, wild);
      }

      sql += ` ORDER BY name ASC`;

      const exercises = db.prepare(sql).all(...params) as any[];
      res.json({ exercises });
    } catch (err: any) {
      console.error('[PersonalController.listExercises] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar exercícios' });
    }
  }

  static async createExercise(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const { name, muscle_group, secondary_muscles_json, instructions, photo_url } = req.body;

      if (!name || !muscle_group) {
        res.status(400).json({ error: 'Nome e grupamento muscular são obrigatórios' });
        return;
      }

      const id = 'pex-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO personal_exercises (id, tenant_id, name, muscle_group, secondary_muscles_json, instructions, photo_url, is_custom, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).run(
        id, tenantId, name.trim(), muscle_group.trim(),
        secondary_muscles_json ? (typeof secondary_muscles_json === 'string' ? secondary_muscles_json : JSON.stringify(secondary_muscles_json)) : null,
        instructions || null, photo_url || null, req.user?.userId || null
      );

      res.status(201).json({ id, message: 'Exercício cadastrado com sucesso' });
    } catch (err: any) {
      console.error('[PersonalController.createExercise] Erro:', err);
      res.status(500).json({ error: 'Erro ao cadastrar exercício' });
    }
  }

  static async updateExercise(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const { id } = req.params;
      const { name, muscle_group, secondary_muscles_json, instructions, photo_url } = req.body;

      const result = db.prepare(`
        UPDATE personal_exercises SET
          name = COALESCE(?, name),
          muscle_group = COALESCE(?, muscle_group),
          secondary_muscles_json = ?,
          instructions = ?,
          photo_url = COALESCE(?, photo_url),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(
        name ? name.trim() : null,
        muscle_group ? muscle_group.trim() : null,
        secondary_muscles_json ? (typeof secondary_muscles_json === 'string' ? secondary_muscles_json : JSON.stringify(secondary_muscles_json)) : null,
        instructions || null,
        photo_url || null,
        id, tenantId
      );

      if (result.changes === 0) {
        res.status(404).json({ error: 'Exercício customizado não encontrado ou não pertence a esta clínica' });
        return;
      }

      res.json({ message: 'Exercício atualizado com sucesso' });
    } catch (err: any) {
      console.error('[PersonalController.updateExercise] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar exercício' });
    }
  }

  static async deleteExercise(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const { id } = req.params;

      const result = db.prepare('DELETE FROM personal_exercises WHERE id = ? AND tenant_id = ? AND is_custom = 1').run(id, tenantId);
      if (result.changes === 0) {
        res.status(400).json({ error: 'Exercícios padrão do sistema não podem ser excluídos, apenas exercícios customizados.' });
        return;
      }
      res.json({ message: 'Exercício excluído com sucesso' });
    } catch (err: any) {
      console.error('[PersonalController.deleteExercise] Erro:', err);
      res.status(500).json({ error: 'Erro ao excluir exercício' });
    }
  }

  // ==========================================
  // PRESCRIÇÃO DE TREINOS & DIVISÕES (A-E)
  // ==========================================
  static async listWorkouts(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const studentId = req.query.studentId ? String(req.query.studentId) : null;

      let sql = `
        SELECT w.*, COALESCE(p.full_name, p.social_name) as patient_name,
               (SELECT COUNT(*) FROM personal_workout_exercises we WHERE we.workout_id = w.id) as exercises_count
        FROM personal_workouts w
        JOIN patients p ON p.id = w.patient_id AND p.tenant_id = w.tenant_id
        WHERE w.tenant_id = ?
      `;
      const params: any[] = [tenantId];

      if (studentId) {
        sql += ` AND w.patient_id = ?`;
        params.push(studentId);
      }

      sql += ` ORDER BY w.division ASC, w.created_at DESC`;

      const workouts = db.prepare(sql).all(...params) as any[];
      res.json({ workouts });
    } catch (err: any) {
      console.error('[PersonalController.listWorkouts] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar treinos' });
    }
  }

  static async getWorkout(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const { id } = req.params;

      const workout = db.prepare(`
        SELECT w.*, COALESCE(p.full_name, p.social_name) as patient_name, p.gender, u.name as professional_name
        FROM personal_workouts w
        JOIN patients p ON p.id = w.patient_id AND p.tenant_id = w.tenant_id
        LEFT JOIN professionals pr ON pr.id = w.professional_id
        LEFT JOIN users u ON u.id = pr.user_id
        WHERE w.id = ? AND w.tenant_id = ?
      `).get(id, tenantId) as any;

      if (!workout) {
        res.status(404).json({ error: 'Treino não encontrado' });
        return;
      }

      const exercises = db.prepare(`
        SELECT we.*, pe.instructions, pe.photo_url as exercise_default_photo
        FROM personal_workout_exercises we
        LEFT JOIN personal_exercises pe ON pe.id = we.exercise_id
        WHERE we.workout_id = ? AND we.tenant_id = ?
        ORDER BY we.order_index ASC
      `).all(id, tenantId) as any[];

      // Agrupa cálculo de volume semanal por grupo muscular desse treino
      const muscleVolume: Record<string, number> = {};
      exercises.forEach((ex: any) => {
        const group = ex.muscle_group || 'Outros';
        muscleVolume[group] = (muscleVolume[group] || 0) + (Number(ex.sets) || 0);
      });

      res.json({ workout, exercises, muscleVolume });
    } catch (err: any) {
      console.error('[PersonalController.getWorkout] Erro:', err);
      res.status(500).json({ error: 'Erro ao carregar treino' });
    }
  }

  static async createWorkout(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const professionalId = getProfessionalId(req);
      const { patient_id, title, division, structure_type, notes, exercises } = req.body;

      if (!patient_id || !title) {
        res.status(400).json({ error: 'Aluno e título do treino são obrigatórios' });
        return;
      }

      const workoutId = 'pwk-' + uuidv4().slice(0, 8);

      const transaction = db.transaction(() => {
        db.prepare(`
          INSERT INTO personal_workouts (id, tenant_id, patient_id, professional_id, title, division, structure_type, notes, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).run(
          workoutId, tenantId, patient_id, professionalId, title.trim(),
          (division || 'A').toUpperCase(), structure_type || 'ABC', notes || null
        );

        if (Array.isArray(exercises)) {
          const insertEx = db.prepare(`
            INSERT INTO personal_workout_exercises (
              id, tenant_id, workout_id, exercise_id, order_index, name, muscle_group,
              sets, reps, load_kg, tempo, rest_seconds, cadence, rpe, rir, technique, technique_custom, notes, photo_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          exercises.forEach((ex: any, idx: number) => {
            const weId = 'pwe-' + uuidv4().slice(0, 8);
            insertEx.run(
              weId, tenantId, workoutId, ex.exercise_id || null, idx + 1,
              ex.name || 'Exercício', ex.muscle_group || 'Geral',
              Number(ex.sets) || 3, String(ex.reps || '10-12'), Number(ex.load_kg) || null,
              ex.tempo || null, Number(ex.rest_seconds) || 60, ex.cadence || null,
              ex.rpe ? Number(ex.rpe) : null, ex.rir ? Number(ex.rir) : null,
              ex.technique || 'Direta', ex.technique_custom || null, ex.notes || null, ex.photo_url || null
            );
          });
        }
      });

      transaction();

      logAudit(req, 'CREATE_WORKOUT', 'personal_workouts', workoutId, { patient_id, title, division });
      res.status(201).json({ id: workoutId, message: 'Treino criado com sucesso' });
    } catch (err: any) {
      console.error('[PersonalController.createWorkout] Erro:', err);
      res.status(500).json({ error: 'Erro ao criar treino' });
    }
  }

  static async updateWorkout(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const { id } = req.params;
      const { title, division, structure_type, notes, is_active, exercises } = req.body;

      const existing = db.prepare('SELECT id FROM personal_workouts WHERE id = ? AND tenant_id = ?').get(id, tenantId);
      if (!existing) {
        res.status(404).json({ error: 'Treino não encontrado' });
        return;
      }

      const transaction = db.transaction(() => {
        db.prepare(`
          UPDATE personal_workouts SET
            title = COALESCE(?, title),
            division = COALESCE(?, division),
            structure_type = COALESCE(?, structure_type),
            notes = ?,
            is_active = COALESCE(?, is_active),
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(
          title ? title.trim() : null,
          division ? division.toUpperCase() : null,
          structure_type || null,
          notes || null,
          typeof is_active === 'number' || typeof is_active === 'boolean' ? (is_active ? 1 : 0) : null,
          id, tenantId
        );

        if (Array.isArray(exercises)) {
          db.prepare('DELETE FROM personal_workout_exercises WHERE workout_id = ? AND tenant_id = ?').run(id, tenantId);

          const insertEx = db.prepare(`
            INSERT INTO personal_workout_exercises (
              id, tenant_id, workout_id, exercise_id, order_index, name, muscle_group,
              sets, reps, load_kg, tempo, rest_seconds, cadence, rpe, rir, technique, technique_custom, notes, photo_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          exercises.forEach((ex: any, idx: number) => {
            const weId = 'pwe-' + uuidv4().slice(0, 8);
            insertEx.run(
              weId, tenantId, id, ex.exercise_id || null, idx + 1,
              ex.name || 'Exercício', ex.muscle_group || 'Geral',
              Number(ex.sets) || 3, String(ex.reps || '10-12'), Number(ex.load_kg) || null,
              ex.tempo || null, Number(ex.rest_seconds) || 60, ex.cadence || null,
              ex.rpe ? Number(ex.rpe) : null, ex.rir ? Number(ex.rir) : null,
              ex.technique || 'Direta', ex.technique_custom || null, ex.notes || null, ex.photo_url || null
            );
          });
        }
      });

      transaction();

      logAudit(req, 'UPDATE_WORKOUT', 'personal_workouts', id);
      res.json({ message: 'Treino atualizado com sucesso' });
    } catch (err: any) {
      console.error('[PersonalController.updateWorkout] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar treino' });
    }
  }

  static async duplicateWorkout(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const professionalId = getProfessionalId(req);
      const { id } = req.params;
      const { target_patient_id, target_division, new_title } = req.body;

      const original = db.prepare('SELECT * FROM personal_workouts WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!original) {
        res.status(404).json({ error: 'Treino original não encontrado' });
        return;
      }

      const origExercises = db.prepare('SELECT * FROM personal_workout_exercises WHERE workout_id = ? AND tenant_id = ? ORDER BY order_index ASC').all(id, tenantId) as any[];

      const newWorkoutId = 'pwk-' + uuidv4().slice(0, 8);
      const destPatientId = target_patient_id || original.patient_id;
      const destDivision = (target_division || original.division).toUpperCase();
      const destTitle = new_title || `${original.title} (Cópia)`;

      const transaction = db.transaction(() => {
        db.prepare(`
          INSERT INTO personal_workouts (id, tenant_id, patient_id, professional_id, title, division, structure_type, notes, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).run(
          newWorkoutId, tenantId, destPatientId, professionalId, destTitle, destDivision, original.structure_type, original.notes
        );

        const insertEx = db.prepare(`
          INSERT INTO personal_workout_exercises (
            id, tenant_id, workout_id, exercise_id, order_index, name, muscle_group,
            sets, reps, load_kg, tempo, rest_seconds, cadence, rpe, rir, technique, technique_custom, notes, photo_url
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        origExercises.forEach((ex: any) => {
          insertEx.run(
            'pwe-' + uuidv4().slice(0, 8), tenantId, newWorkoutId, ex.exercise_id, ex.order_index,
            ex.name, ex.muscle_group, ex.sets, ex.reps, ex.load_kg, ex.tempo, ex.rest_seconds,
            ex.cadence, ex.rpe, ex.rir, ex.technique, ex.technique_custom, ex.notes, ex.photo_url
          );
        });
      });

      transaction();

      res.status(201).json({ id: newWorkoutId, message: 'Treino duplicado com sucesso' });
    } catch (err: any) {
      console.error('[PersonalController.duplicateWorkout] Erro:', err);
      res.status(500).json({ error: 'Erro ao duplicar treino' });
    }
  }

  static async deleteWorkout(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const { id } = req.params;

      db.prepare('DELETE FROM personal_workout_exercises WHERE workout_id = ? AND tenant_id = ?').run(id, tenantId);
      const result = db.prepare('DELETE FROM personal_workouts WHERE id = ? AND tenant_id = ?').run(id, tenantId);

      if (result.changes === 0) {
        res.status(404).json({ error: 'Treino não encontrado' });
        return;
      }

      logAudit(req, 'DELETE_WORKOUT', 'personal_workouts', id);
      res.json({ message: 'Treino excluído com sucesso' });
    } catch (err: any) {
      console.error('[PersonalController.deleteWorkout] Erro:', err);
      res.status(500).json({ error: 'Erro ao excluir treino' });
    }
  }

  // ==========================================
  // MODELOS DE TREINO (TEMPLATES)
  // ==========================================
  static async listTemplates(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const templates = db.prepare(`
        SELECT t.*, u.name as professional_name
        FROM personal_workout_templates t
        LEFT JOIN professionals pr ON pr.id = t.professional_id
        LEFT JOIN users u ON u.id = pr.user_id
        WHERE t.tenant_id = ?
        ORDER BY t.created_at DESC
      `).all(tenantId) as any[];

      templates.forEach((t: any) => {
        try {
          t.workouts = JSON.parse(t.workouts_json);
        } catch {
          t.workouts = [];
        }
      });

      res.json({ templates });
    } catch (err: any) {
      console.error('[PersonalController.listTemplates] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar modelos de treino' });
    }
  }

  static async createTemplate(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const professionalId = getProfessionalId(req);
      const { title, structure_type, description, workouts } = req.body;

      if (!title || !workouts) {
        res.status(400).json({ error: 'Título e estrutura de treinos são obrigatórios' });
        return;
      }

      const id = 'ptpl-' + uuidv4().slice(0, 8);
      const workoutsJson = typeof workouts === 'string' ? workouts : JSON.stringify(workouts);

      db.prepare(`
        INSERT INTO personal_workout_templates (id, tenant_id, professional_id, title, structure_type, description, workouts_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, tenantId, professionalId, title.trim(), structure_type || 'ABC', description || null, workoutsJson);

      res.status(201).json({ id, message: 'Modelo de treino salvo com sucesso' });
    } catch (err: any) {
      console.error('[PersonalController.createTemplate] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar modelo' });
    }
  }

  static async applyTemplate(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const professionalId = getProfessionalId(req);
      const { id } = req.params; // template id
      const { patient_id } = req.body;

      if (!patient_id) {
        res.status(400).json({ error: 'Aluno de destino é obrigatório' });
        return;
      }

      const tpl = db.prepare('SELECT * FROM personal_workout_templates WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!tpl) {
        res.status(404).json({ error: 'Modelo não encontrado' });
        return;
      }

      const parsedWorkouts = JSON.parse(tpl.workouts_json);
      if (!Array.isArray(parsedWorkouts)) {
        res.status(400).json({ error: 'Estrutura do modelo inválida' });
        return;
      }

      const createdIds: string[] = [];

      const transaction = db.transaction(() => {
        for (const w of parsedWorkouts) {
          const wId = 'pwk-' + uuidv4().slice(0, 8);
          createdIds.push(wId);

          db.prepare(`
            INSERT INTO personal_workouts (id, tenant_id, patient_id, professional_id, title, division, structure_type, notes, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
          `).run(
            wId, tenantId, patient_id, professionalId, w.title || 'Treino',
            (w.division || 'A').toUpperCase(), tpl.structure_type, w.notes || null
          );

          if (Array.isArray(w.exercises)) {
            const insertEx = db.prepare(`
              INSERT INTO personal_workout_exercises (
                id, tenant_id, workout_id, exercise_id, order_index, name, muscle_group,
                sets, reps, load_kg, tempo, rest_seconds, cadence, rpe, rir, technique, technique_custom, notes, photo_url
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            w.exercises.forEach((ex: any, idx: number) => {
              insertEx.run(
                'pwe-' + uuidv4().slice(0, 8), tenantId, wId, ex.exercise_id || null, idx + 1,
                ex.name || 'Exercício', ex.muscle_group || 'Geral',
                Number(ex.sets) || 3, String(ex.reps || '10-12'), Number(ex.load_kg) || null,
                ex.tempo || null, Number(ex.rest_seconds) || 60, ex.cadence || null,
                ex.rpe ? Number(ex.rpe) : null, ex.rir ? Number(ex.rir) : null,
                ex.technique || 'Direta', ex.technique_custom || null, ex.notes || null, ex.photo_url || null
              );
            });
          }
        }
      });

      transaction();

      res.status(201).json({ createdWorkoutIds: createdIds, message: `${createdIds.length} divisões de treino aplicadas ao aluno com sucesso` });
    } catch (err: any) {
      console.error('[PersonalController.applyTemplate] Erro:', err);
      res.status(500).json({ error: 'Erro ao aplicar modelo ao aluno' });
    }
  }

  static async deleteTemplate(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const { id } = req.params;

      const result = db.prepare('DELETE FROM personal_workout_templates WHERE id = ? AND tenant_id = ?').run(id, tenantId);
      if (result.changes === 0) {
        res.status(404).json({ error: 'Modelo não encontrado' });
        return;
      }
      res.json({ message: 'Modelo excluído com sucesso' });
    } catch (err: any) {
      console.error('[PersonalController.deleteTemplate] Erro:', err);
      res.status(500).json({ error: 'Erro ao excluir modelo' });
    }
  }

  // ==========================================
  // EXECUÇÃO & HISTÓRICO DE TREINOS (LOGS & PRS)
  // ==========================================
  static async executeWorkoutLog(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const professionalId = getProfessionalId(req);
      const {
        workout_id, patient_id, appointment_id, completed_at,
        duration_minutes, rpe, feedback_notes, exercises_performed
      } = req.body;

      if (!patient_id) {
        res.status(400).json({ error: 'Identificação do aluno obrigatória' });
        return;
      }

      const logId = 'pwl-' + uuidv4().slice(0, 8);
      const detailsJson = exercises_performed ? (typeof exercises_performed === 'string' ? exercises_performed : JSON.stringify(exercises_performed)) : null;

      db.prepare(`
        INSERT INTO personal_workout_logs (
          id, tenant_id, workout_id, patient_id, professional_id, appointment_id,
          completed_at, duration_minutes, rpe, feedback_notes, log_details_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        logId, tenantId, workout_id || null, patient_id, professionalId, appointment_id || null,
        completed_at || new Date().toISOString(), duration_minutes ? Number(duration_minutes) : null,
        rpe ? Number(rpe) : null, feedback_notes || null, detailsJson
      );

      // Verificação de Recordes Pessoais (PRs - carga máxima superada)
      const newPRs: Array<{ exercise_name: string; previous_max: number; new_pr: number }> = [];

      if (Array.isArray(exercises_performed)) {
        // Busca histórico prévio de cargas do aluno
        const priorLogs = db.prepare(`
          SELECT log_details_json FROM personal_workout_logs
          WHERE patient_id = ? AND tenant_id = ? AND id != ?
        `).all(patient_id, tenantId, logId) as any[];

        const bestPriorLoads: Record<string, number> = {};
        priorLogs.forEach((pl: any) => {
          try {
            const exList = JSON.parse(pl.log_details_json);
            if (Array.isArray(exList)) {
              exList.forEach((e: any) => {
                const name = (e.name || '').trim().toLowerCase();
                const load = Number(e.load_kg || e.load || 0);
                if (load > (bestPriorLoads[name] || 0)) {
                  bestPriorLoads[name] = load;
                }
              });
            }
          } catch {}
        });

        exercises_performed.forEach((ex: any) => {
          const name = (ex.name || '').trim();
          const key = name.toLowerCase();
          const currentLoad = Number(ex.load_kg || ex.load || 0);
          const prevBest = bestPriorLoads[key] || 0;

          if (currentLoad > 0 && currentLoad > prevBest) {
            newPRs.push({
              exercise_name: name,
              previous_max: prevBest,
              new_pr: currentLoad
            });
          }
        });
      }

      logAudit(req, 'EXECUTE_WORKOUT_LOG', 'personal_workout_logs', logId, { patient_id, newPRsCount: newPRs.length });
      res.status(201).json({
        id: logId,
        newPRs,
        message: 'Execução de treino registrada com sucesso'
      });
    } catch (err: any) {
      console.error('[PersonalController.executeWorkoutLog] Erro:', err);
      res.status(500).json({ error: 'Erro ao registrar execução de treino' });
    }
  }

  static async listLogs(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const studentId = req.query.studentId ? String(req.query.studentId) : null;

      let sql = `
        SELECT l.*, COALESCE(p.full_name, p.social_name) as patient_name, p.photo_url as avatar_url, w.title as workout_title, w.division
        FROM personal_workout_logs l
        JOIN patients p ON p.id = l.patient_id AND p.tenant_id = l.tenant_id
        LEFT JOIN personal_workouts w ON w.id = l.workout_id
        WHERE l.tenant_id = ?
      `;
      const params: any[] = [tenantId];

      if (studentId) {
        sql += ` AND l.patient_id = ?`;
        params.push(studentId);
      }

      sql += ` ORDER BY l.completed_at DESC LIMIT 50`;

      const logs = db.prepare(sql).all(...params) as any[];
      logs.forEach((l: any) => {
        try {
          l.exercises_performed = JSON.parse(l.log_details_json);
        } catch {
          l.exercises_performed = [];
        }
      });

      res.json({ logs });
    } catch (err: any) {
      console.error('[PersonalController.listLogs] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar histórico de execuções' });
    }
  }

  static async getRecords(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const { studentId } = req.params;

      const logs = db.prepare(`
        SELECT completed_at, log_details_json
        FROM personal_workout_logs
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY completed_at ASC
      `).all(studentId, tenantId) as any[];

      const recordsMap: Record<string, { exercise_name: string; max_load: number; date: string; reps?: string }> = {};

      logs.forEach((l: any) => {
        try {
          const exList = JSON.parse(l.log_details_json);
          if (Array.isArray(exList)) {
            exList.forEach((e: any) => {
              const name = (e.name || '').trim();
              if (!name) return;
              const load = Number(e.load_kg || e.load || 0);
              if (load > 0) {
                if (!recordsMap[name] || load > recordsMap[name].max_load) {
                  recordsMap[name] = {
                    exercise_name: name,
                    max_load: load,
                    date: l.completed_at,
                    reps: e.reps ? String(e.reps) : undefined
                  };
                }
              }
            });
          }
        } catch {}
      });

      res.json({ records: Object.values(recordsMap) });
    } catch (err: any) {
      console.error('[PersonalController.getRecords] Erro:', err);
      res.status(500).json({ error: 'Erro ao carregar recordes pessoais' });
    }
  }

  // ==========================================
  // PERIODIZAÇÃO
  // ==========================================
  static async listPeriodizations(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const studentId = req.query.studentId ? String(req.query.studentId) : null;

      let sql = `
        SELECT p.*, COALESCE(pat.full_name, pat.social_name) as patient_name
        FROM personal_periodizations p
        JOIN patients pat ON pat.id = p.patient_id AND pat.tenant_id = p.tenant_id
        WHERE p.tenant_id = ?
      `;
      const params: any[] = [tenantId];
      if (studentId) {
        sql += ` AND p.patient_id = ?`;
        params.push(studentId);
      }
      sql += ` ORDER BY p.start_date DESC`;

      const periodizations = db.prepare(sql).all(...params) as any[];
      periodizations.forEach((item: any) => {
        try {
          item.target_volume = JSON.parse(item.target_volume_json);
        } catch {
          item.target_volume = null;
        }
      });

      res.json({ periodizations });
    } catch (err: any) {
      console.error('[PersonalController.listPeriodizations] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar periodizações' });
    }
  }

  static async createPeriodization(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const professionalId = getProfessionalId(req);
      const { patient_id, title, phase, start_date, end_date, meso_weeks, target_volume, notes } = req.body;

      if (!patient_id || !title || !start_date || !end_date) {
        res.status(400).json({ error: 'Aluno, título e datas inicial e final são obrigatórios' });
        return;
      }

      const id = 'pper-' + uuidv4().slice(0, 8);
      const targetVolumeJson = target_volume ? (typeof target_volume === 'string' ? target_volume : JSON.stringify(target_volume)) : null;

      db.prepare(`
        INSERT INTO personal_periodizations (
          id, tenant_id, patient_id, professional_id, title, phase,
          start_date, end_date, meso_weeks, target_volume_json, notes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `).run(
        id, tenantId, patient_id, professionalId, title.trim(), phase || 'hypertrophy',
        start_date, end_date, meso_weeks ? Number(meso_weeks) : 4, targetVolumeJson, notes || null
      );

      res.status(201).json({ id, message: 'Periodização criada com sucesso' });
    } catch (err: any) {
      console.error('[PersonalController.createPeriodization] Erro:', err);
      res.status(500).json({ error: 'Erro ao criar periodização' });
    }
  }

  static async updatePeriodization(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const { id } = req.params;
      const { title, phase, start_date, end_date, meso_weeks, target_volume, notes, status } = req.body;

      const targetVolumeJson = target_volume ? (typeof target_volume === 'string' ? target_volume : JSON.stringify(target_volume)) : null;

      const result = db.prepare(`
        UPDATE personal_periodizations SET
          title = COALESCE(?, title),
          phase = COALESCE(?, phase),
          start_date = COALESCE(?, start_date),
          end_date = COALESCE(?, end_date),
          meso_weeks = COALESCE(?, meso_weeks),
          target_volume_json = COALESCE(?, target_volume_json),
          notes = ?,
          status = COALESCE(?, status),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(
        title ? title.trim() : null, phase || null, start_date || null, end_date || null,
        meso_weeks ? Number(meso_weeks) : null, targetVolumeJson, notes || null,
        status || null, id, tenantId
      );

      if (result.changes === 0) {
        res.status(404).json({ error: 'Periodização não encontrada' });
        return;
      }

      res.json({ message: 'Periodização atualizada com sucesso' });
    } catch (err: any) {
      console.error('[PersonalController.updatePeriodization] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar periodização' });
    }
  }

  // ==========================================
  // FREQUÊNCIA & AGENDA DE AULAS
  // ==========================================
  static async getAttendanceStats(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const studentId = req.params.studentId;

      // Execuções de treinos registradas
      const workoutsCount = (db.prepare("SELECT count(*) as count FROM personal_workout_logs WHERE patient_id = ? AND tenant_id = ?").get(studentId, tenantId) as any)?.count || 0;

      // Agendamentos de aulas e taxa de presença
      const apptStats = db.prepare(`
        SELECT
          COUNT(*) as total_scheduled,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
          SUM(CASE WHEN status = 'canceled' THEN 1 ELSE 0 END) as canceled_count,
          SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) as no_show_count
        FROM appointments
        WHERE patient_id = ? AND tenant_id = ?
      `).get(studentId, tenantId) as any;

      const profile = db.prepare('SELECT weekly_frequency FROM personal_student_profiles WHERE patient_id = ? AND tenant_id = ?').get(studentId, tenantId) as any;
      const targetWeekly = profile?.weekly_frequency || 3;

      // Frequência real nas últimas 4 semanas
      const lastMonthWorkouts = (db.prepare(`
        SELECT count(*) as count
        FROM personal_workout_logs
        WHERE patient_id = ? AND tenant_id = ?
          AND completed_at >= date('now', '-28 days')
      `).get(studentId, tenantId) as any)?.count || 0;

      const weeklyAvg = parseFloat((lastMonthWorkouts / 4).toFixed(1));
      const adherencePct = Math.min(100, Math.round((weeklyAvg / targetWeekly) * 100));

      res.json({
        totalWorkoutsCompleted: workoutsCount,
        lastMonthWorkouts,
        targetWeeklyFrequency: targetWeekly,
        currentWeeklyAvg: weeklyAvg,
        adherencePercentage: adherencePct,
        appointments: apptStats || { total_scheduled: 0, completed_count: 0, canceled_count: 0, no_show_count: 0 }
      });
    } catch (err: any) {
      console.error('[PersonalController.getAttendanceStats] Erro:', err);
      res.status(500).json({ error: 'Erro ao calcular frequência do aluno' });
    }
  }

  // ==========================================
  // BUSCA RÁPIDA (SMART SEARCH)
  // ==========================================
  static async smartSearch(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const q = req.query.q ? String(req.query.q).trim() : '';

      if (!q || q.length < 2) {
        res.json({ students: [], exercises: [], workouts: [] });
        return;
      }

      const wild = `%${q}%`;
      const students = db.prepare(`
        SELECT id, COALESCE(full_name, social_name) as name, phone, email, photo_url as avatar_url
        FROM patients
        WHERE tenant_id = ? AND active = 1 AND (full_name LIKE ? OR phone LIKE ? OR cpf LIKE ?)
        LIMIT 6
      `).all(tenantId, wild, wild, wild);

      const exercises = db.prepare(`
        SELECT id, name, muscle_group, photo_url
        FROM personal_exercises
        WHERE (tenant_id = ? OR tenant_id = 'global') AND (LOWER(name) LIKE LOWER(?) OR LOWER(muscle_group) LIKE LOWER(?))
        LIMIT 6
      `).all(tenantId, wild, wild);

      const workouts = db.prepare(`
        SELECT w.id, w.title, w.division, COALESCE(p.full_name, p.social_name) as patient_name
        FROM personal_workouts w
        JOIN patients p ON p.id = w.patient_id AND p.tenant_id = w.tenant_id
        WHERE w.tenant_id = ? AND (w.title LIKE ? OR p.full_name LIKE ?)
        LIMIT 6
      `).all(tenantId, wild, wild);

      res.json({ students, exercises, workouts });
    } catch (err: any) {
      console.error('[PersonalController.smartSearch] Erro:', err);
      res.status(500).json({ error: 'Erro na busca rápida' });
    }
  }
}
