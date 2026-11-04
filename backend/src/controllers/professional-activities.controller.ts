import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';
import { hasClinicalAccess } from './clinical.controller';
import { isSpeechTherapistOrClinicManager } from './speech-therapy.controller';
import { hasPsychopedagogyAccess } from './psychopedagogy.controller';
import { isOccupationalTherapistOrClinicManager } from './occupational-therapy.controller';
import { isPhysiotherapistOrClinicManager } from './physiotherapy.controller';

/**
 * Normaliza o identificador da profissão/módulo
 */
export function normalizeProfessionId(raw: string | undefined | null): 'fono' | 'pp' | 'to' | 'fisio' | null {
  if (!raw) return null;
  const clean = String(raw).trim().toLowerCase();
  if (clean === 'fono' || clean === 'fonoaudiologia' || clean === 'speech-therapy' || clean === 'zemdafono') {
    return 'fono';
  }
  if (clean === 'pp' || clean === 'psicopedagogia' || clean === 'psychopedagogy' || clean === 'zemdapp') {
    return 'pp';
  }
  if (clean === 'to' || clean === 'terapia-ocupacional' || clean === 'occupational-therapy' || clean === 'zemdato') {
    return 'to';
  }
  if (clean === 'fisio' || clean === 'fisioterapia' || clean === 'physiotherapy' || clean === 'zemdafisio') {
    return 'fisio';
  }
  return null;
}

/**
 * Validação rigorosa de permissão de acesso à biblioteca da profissão e ao paciente
 */
export function hasProfessionActivityAccess(req: Request, professionId: string, patientId?: string): boolean {
  if (!req.user || !req.tenantId) return false;

  // 1. SuperAdmin global NUNCA acessa dados clínicos
  if (req.user.role === 'superadmin') return false;

  // 2. Perfis puramente administrativos e de recepção não têm acesso clínico
  const roleStr = String(req.user.role || '').toLowerCase();
  if (['receptionist', 'financial', 'secretary', 'assistant'].includes(roleStr)) {
    return false;
  }

  const normalized = normalizeProfessionId(professionId);
  if (!normalized) return false;

  // 3. Validação de escopo do paciente se informado
  if (patientId) {
    const patient = db.prepare('SELECT id, tenant_id FROM patients WHERE id = ?').get(patientId) as any;
    if (!patient || patient.tenant_id !== req.tenantId) {
      return false;
    }
  }

  // 4. Validação por especialidade profissional
  if (normalized === 'fono') {
    if (!isSpeechTherapistOrClinicManager(req)) return false;
    if (patientId && !hasClinicalAccess(req, patientId)) return false;
    return true;
  }

  if (normalized === 'pp') {
    return hasPsychopedagogyAccess(req, patientId);
  }

  if (normalized === 'to') {
    if (!isOccupationalTherapistOrClinicManager(req)) return false;
    if (patientId && !hasClinicalAccess(req, patientId)) return false;
    return true;
  }

  if (normalized === 'fisio') {
    if (!isPhysiotherapistOrClinicManager(req)) return false;
    if (patientId && !hasClinicalAccess(req, patientId)) return false;
    return true;
  }

  return false;
}

/**
 * Localiza o profissional vinculado ao usuário atual na clínica correspondente à especialidade
 */
function findCurrentProfessionalId(tenantId: string, userId: string): string | null {
  try {
    const prof = db.prepare(`
      SELECT id FROM professionals
      WHERE tenant_id = ? AND user_id = ? AND active = 1
      LIMIT 1
    `).get(tenantId, userId) as any;
    return prof?.id || null;
  } catch {
    return null;
  }
}

export class ProfessionalActivitiesController {
  // ==========================================
  // 1. MODELOS DA BIBLIOTECA (TEMPLATES)
  // ==========================================

  /**
   * Lista modelos da biblioteca (Biblioteca Zemda oficial e Minha Biblioteca)
   */
  static listTemplates(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.userId;
      const rawProfession = req.query.module_type || req.query.profession_id || req.query.specialty;
      const professionId = normalizeProfessionId(String(rawProfession || ''));

      if (!professionId) {
        res.status(400).json({ error: 'Módulo ou profissão inválida. Especifique fono, pp, to ou fisio.' });
        return;
      }

      if (!hasProfessionActivityAccess(req, professionId)) {
        res.status(403).json({ error: 'Acesso não autorizado à biblioteca desta profissão.' });
        return;
      }

      const scope = String(req.query.scope || 'all').toLowerCase(); // 'all' | 'system' | 'custom' | 'favorites'
      const category = req.query.category ? String(req.query.category).trim() : null;
      const subcategory = req.query.subcategory ? String(req.query.subcategory).trim() : null;
      const setting = req.query.setting ? String(req.query.setting).trim() : null;
      const search = req.query.search ? String(req.query.search).trim().toLowerCase() : null;

      let sql = `
        SELECT t.*,
               CASE WHEN f.id IS NOT NULL THEN 1 ELSE 0 END AS is_favorite
        FROM clinical_activity_templates t
        LEFT JOIN clinical_activity_favorites f
          ON f.template_id = t.id AND f.user_id = ? AND f.tenant_id = ?
        WHERE t.profession_id = ?
          AND (t.is_system = 1 OR t.tenant_id = ?)
      `;
      const params: any[] = [userId, tenantId, professionId, tenantId];

      if (scope === 'system') {
        sql += ' AND t.is_system = 1';
      } else if (scope === 'custom') {
        sql += ' AND t.is_system = 0 AND t.tenant_id = ?';
        params.push(tenantId);
      } else if (scope === 'favorites') {
        sql += ' AND f.id IS NOT NULL';
      }

      if (category) {
        sql += ' AND LOWER(t.category) = LOWER(?)';
        params.push(category);
      }

      if (subcategory) {
        sql += ' AND LOWER(t.subcategory) = LOWER(?)';
        params.push(subcategory);
      }

      if (setting && setting !== 'all') {
        sql += ' AND t.setting = ?';
        params.push(setting);
      }

      if (search) {
        sql += `
          AND (
            LOWER(t.title) LIKE ?
            OR LOWER(t.objective) LIKE ?
            OR LOWER(COALESCE(t.target_skill, '')) LIKE ?
            OR LOWER(COALESCE(t.materials_needed, '')) LIKE ?
            OR LOWER(t.instructions) LIKE ?
          )
        `;
        const wildcard = `%${search}%`;
        params.push(wildcard, wildcard, wildcard, wildcard, wildcard);
      }

      sql += ' ORDER BY is_favorite DESC, t.is_system DESC, t.category ASC, t.title ASC';

      const rows = db.prepare(sql).all(...params) as any[];

      const normalized = rows.map(r => ({
        id: r.id,
        profession_id: r.profession_id,
        category: r.category,
        subcategory: r.subcategory || null,
        title: r.title,
        objective: r.objective,
        target_skill: r.target_skill || null,
        age_group: r.age_group || null,
        setting: r.setting,
        materials_needed: r.materials_needed || null,
        instructions: r.instructions,
        frequency: r.frequency || null,
        caregiver_guidance: r.caregiver_guidance || null,
        adaptations: r.adaptations || null,
        notes: r.notes || null,
        is_system: Boolean(r.is_system),
        is_custom: !r.is_system,
        is_favorite: Boolean(r.is_favorite),
        created_at: r.created_at,
        updated_at: r.updated_at
      }));

      res.json(normalized);
    } catch (err: any) {
      console.error('[ProfessionalActivitiesController.listTemplates] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar modelos da biblioteca.' });
    }
  }

  /**
   * Cria um modelo próprio na "Minha Biblioteca"
   */
  static createTemplate(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.userId;
      const {
        profession_id,
        module_type,
        category,
        subcategory,
        title,
        objective,
        target_skill,
        age_group,
        setting,
        materials_needed,
        instructions,
        frequency,
        caregiver_guidance,
        adaptations,
        notes
      } = req.body || {};

      const professionId = normalizeProfessionId(profession_id || module_type);
      if (!professionId) {
        res.status(400).json({ error: 'Identificador de profissão inválido.' });
        return;
      }

      if (!hasProfessionActivityAccess(req, professionId)) {
        res.status(403).json({ error: 'Sem permissão para criar modelos nesta biblioteca.' });
        return;
      }

      const trimmedTitle = String(title || '').trim();
      const trimmedObjective = String(objective || '').trim();
      const trimmedInstructions = String(instructions || '').trim();
      const trimmedCategory = String(category || '').trim();

      if (!trimmedTitle || !trimmedObjective || !trimmedInstructions || !trimmedCategory) {
        res.status(400).json({ error: 'Título, categoria, objetivo e instruções são obrigatórios.' });
        return;
      }

      const validSetting = ['home', 'school', 'community', 'other', 'general'].includes(setting) ? setting : 'home';
      const id = 'tmpl-custom-' + uuidv4().slice(0, 8);
      const professionalId = findCurrentProfessionalId(tenantId, userId);

      db.prepare(`
        INSERT INTO clinical_activity_templates (
          id, tenant_id, author_user_id, author_professional_id, profession_id,
          category, subcategory, title, objective, target_skill, age_group,
          setting, materials_needed, instructions, frequency, caregiver_guidance,
          adaptations, notes, is_system, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, 0, datetime('now'), datetime('now')
        )
      `).run(
        id,
        tenantId,
        userId,
        professionalId,
        professionId,
        trimmedCategory,
        subcategory ? String(subcategory).trim() : null,
        trimmedTitle,
        trimmedObjective,
        target_skill ? String(target_skill).trim() : null,
        age_group ? String(age_group).trim() : null,
        validSetting,
        materials_needed ? String(materials_needed).trim() : null,
        trimmedInstructions,
        frequency ? String(frequency).trim() : null,
        caregiver_guidance ? String(caregiver_guidance).trim() : null,
        adaptations ? String(adaptations).trim() : null,
        notes ? String(notes).trim() : null
      );

      logAudit(req, 'CREATE_ACTIVITY_TEMPLATE', 'clinical_activity_templates', id, {
        professionId,
        title: trimmedTitle,
        category: trimmedCategory
      });

      res.status(201).json({
        id,
        profession_id: professionId,
        category: trimmedCategory,
        subcategory: subcategory ? String(subcategory).trim() : null,
        title: trimmedTitle,
        objective: trimmedObjective,
        target_skill: target_skill || null,
        age_group: age_group || null,
        setting: validSetting,
        materials_needed: materials_needed || null,
        instructions: trimmedInstructions,
        frequency: frequency || null,
        caregiver_guidance: caregiver_guidance || null,
        adaptations: adaptations || null,
        notes: notes || null,
        is_system: false,
        is_custom: true,
        is_favorite: false,
        message: 'Modelo salvo na sua biblioteca com sucesso!'
      });
    } catch (err: any) {
      console.error('[ProfessionalActivitiesController.createTemplate] Erro:', err);
      res.status(500).json({ error: 'Erro ao criar modelo de atividade.' });
    }
  }

  /**
   * Atualiza um modelo próprio na "Minha Biblioteca"
   */
  static updateTemplate(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId!;
      const { id } = req.params;

      const template = db.prepare(`
        SELECT * FROM clinical_activity_templates
        WHERE id = ? AND tenant_id = ?
      `).get(id, tenantId) as any;

      if (!template) {
        res.status(404).json({ error: 'Modelo não encontrado ou você não tem permissão para editá-lo.' });
        return;
      }

      if (template.is_system) {
        res.status(403).json({ error: 'Modelos oficiais da plataforma Zemda não podem ser alterados diretamente. Use a opção duplicar.' });
        return;
      }

      if (!hasProfessionActivityAccess(req, template.profession_id)) {
        res.status(403).json({ error: 'Sem permissão para editar este modelo.' });
        return;
      }

      const {
        category,
        subcategory,
        title,
        objective,
        target_skill,
        age_group,
        setting,
        materials_needed,
        instructions,
        frequency,
        caregiver_guidance,
        adaptations,
        notes
      } = req.body || {};

      const validSetting = ['home', 'school', 'community', 'other', 'general'].includes(setting)
        ? setting
        : template.setting;

      db.prepare(`
        UPDATE clinical_activity_templates SET
          category = COALESCE(?, category),
          subcategory = COALESCE(?, subcategory),
          title = COALESCE(?, title),
          objective = COALESCE(?, objective),
          target_skill = COALESCE(?, target_skill),
          age_group = COALESCE(?, age_group),
          setting = COALESCE(?, setting),
          materials_needed = COALESCE(?, materials_needed),
          instructions = COALESCE(?, instructions),
          frequency = COALESCE(?, frequency),
          caregiver_guidance = COALESCE(?, caregiver_guidance),
          adaptations = COALESCE(?, adaptations),
          notes = COALESCE(?, notes),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(
        category ? String(category).trim() : null,
        subcategory !== undefined ? (subcategory ? String(subcategory).trim() : null) : null,
        title ? String(title).trim() : null,
        objective ? String(objective).trim() : null,
        target_skill !== undefined ? (target_skill ? String(target_skill).trim() : null) : null,
        age_group !== undefined ? (age_group ? String(age_group).trim() : null) : null,
        validSetting,
        materials_needed !== undefined ? (materials_needed ? String(materials_needed).trim() : null) : null,
        instructions ? String(instructions).trim() : null,
        frequency !== undefined ? (frequency ? String(frequency).trim() : null) : null,
        caregiver_guidance !== undefined ? (caregiver_guidance ? String(caregiver_guidance).trim() : null) : null,
        adaptations !== undefined ? (adaptations ? String(adaptations).trim() : null) : null,
        notes !== undefined ? (notes ? String(notes).trim() : null) : null,
        id,
        tenantId
      );

      logAudit(req, 'UPDATE_ACTIVITY_TEMPLATE', 'clinical_activity_templates', id, { title });

      res.json({ message: 'Modelo atualizado com sucesso!' });
    } catch (err: any) {
      console.error('[ProfessionalActivitiesController.updateTemplate] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar modelo de atividade.' });
    }
  }

  /**
   * Exclui um modelo próprio (sem afetar registros já atribuídos a pacientes)
   */
  static deleteTemplate(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId!;
      const { id } = req.params;

      const template = db.prepare(`
        SELECT * FROM clinical_activity_templates
        WHERE id = ? AND tenant_id = ?
      `).get(id, tenantId) as any;

      if (!template) {
        res.status(404).json({ error: 'Modelo não encontrado.' });
        return;
      }

      if (template.is_system) {
        res.status(403).json({ error: 'Modelos oficiais da biblioteca Zemda não podem ser excluídos.' });
        return;
      }

      if (!hasProfessionActivityAccess(req, template.profession_id)) {
        res.status(403).json({ error: 'Sem permissão para excluir este modelo.' });
        return;
      }

      db.prepare('DELETE FROM clinical_activity_favorites WHERE template_id = ?').run(id);
      db.prepare('DELETE FROM clinical_activity_templates WHERE id = ? AND tenant_id = ?').run(id, tenantId);

      logAudit(req, 'DELETE_ACTIVITY_TEMPLATE', 'clinical_activity_templates', id, { title: template.title });

      res.json({ message: 'Modelo excluído da sua biblioteca com sucesso.' });
    } catch (err: any) {
      console.error('[ProfessionalActivitiesController.deleteTemplate] Erro:', err);
      res.status(500).json({ error: 'Erro ao excluir modelo de atividade.' });
    }
  }

  /**
   * Duplica um modelo (oficial ou próprio) criando uma nova cópia editável na "Minha Biblioteca"
   */
  static duplicateTemplate(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.userId;
      const { id } = req.params;

      const source = db.prepare(`
        SELECT * FROM clinical_activity_templates
        WHERE id = ? AND (is_system = 1 OR tenant_id = ?)
      `).get(id, tenantId) as any;

      if (!source) {
        res.status(404).json({ error: 'Modelo original não encontrado.' });
        return;
      }

      if (!hasProfessionActivityAccess(req, source.profession_id)) {
        res.status(403).json({ error: 'Sem permissão para duplicar modelos desta profissão.' });
        return;
      }

      const newId = 'tmpl-custom-' + uuidv4().slice(0, 8);
      const professionalId = findCurrentProfessionalId(tenantId, userId);
      const newTitle = `${source.title} (Cópia)`;

      db.prepare(`
        INSERT INTO clinical_activity_templates (
          id, tenant_id, author_user_id, author_professional_id, profession_id,
          category, subcategory, title, objective, target_skill, age_group,
          setting, materials_needed, instructions, frequency, caregiver_guidance,
          adaptations, notes, is_system, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, 0, datetime('now'), datetime('now')
        )
      `).run(
        newId,
        tenantId,
        userId,
        professionalId,
        source.profession_id,
        source.category,
        source.subcategory,
        newTitle,
        source.objective,
        source.target_skill,
        source.age_group,
        source.setting,
        source.materials_needed,
        source.instructions,
        source.frequency,
        source.caregiver_guidance,
        source.adaptations,
        source.notes
      );

      logAudit(req, 'DUPLICATE_ACTIVITY_TEMPLATE', 'clinical_activity_templates', newId, {
        sourceId: id,
        newTitle
      });

      res.status(201).json({
        id: newId,
        title: newTitle,
        message: 'Modelo duplicado na sua biblioteca com sucesso!'
      });
    } catch (err: any) {
      console.error('[ProfessionalActivitiesController.duplicateTemplate] Erro:', err);
      res.status(500).json({ error: 'Erro ao duplicar modelo.' });
    }
  }

  /**
   * Alterna favorito de um modelo para o usuário atual
   */
  static toggleFavorite(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.userId;
      const { id } = req.params;

      const template = db.prepare(`
        SELECT id, profession_id FROM clinical_activity_templates
        WHERE id = ? AND (is_system = 1 OR tenant_id = ?)
      `).get(id, tenantId) as any;

      if (!template) {
        res.status(404).json({ error: 'Modelo não encontrado.' });
        return;
      }

      if (!hasProfessionActivityAccess(req, template.profession_id)) {
        res.status(403).json({ error: 'Sem permissão para favoritar este modelo.' });
        return;
      }

      const existingFav = db.prepare(`
        SELECT id FROM clinical_activity_favorites
        WHERE tenant_id = ? AND user_id = ? AND template_id = ?
      `).get(tenantId, userId, id) as any;

      if (existingFav) {
        db.prepare('DELETE FROM clinical_activity_favorites WHERE id = ?').run(existingFav.id);
        res.json({ is_favorite: false, message: 'Removido dos favoritos.' });
      } else {
        const favId = 'fav-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO clinical_activity_favorites (id, tenant_id, user_id, template_id, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `).run(favId, tenantId, userId, id);
        res.json({ is_favorite: true, message: 'Adicionado aos favoritos!' });
      }
    } catch (err: any) {
      console.error('[ProfessionalActivitiesController.toggleFavorite] Erro:', err);
      res.status(500).json({ error: 'Erro ao alterar favorito.' });
    }
  }

  // ==========================================
  // 2. ATIVIDADES ATRIBUÍDAS AO PACIENTE
  // ==========================================

  /**
   * Lista as atividades atribuídas a um paciente específico para o módulo selecionado
   */
  static listPatientActivities(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId!;
      const patientId = String(req.params.patientId || '').trim();
      const rawProfession = req.query.module_type || req.query.profession_id || req.query.specialty;
      const professionId = normalizeProfessionId(String(rawProfession || ''));

      if (!professionId) {
        res.status(400).json({ error: 'Especifique o módulo/profissão (fono, pp, to, fisio).' });
        return;
      }

      if (!hasProfessionActivityAccess(req, professionId, patientId)) {
        res.status(403).json({ error: 'Acesso restrito ao prontuário deste paciente.' });
        return;
      }

      const rows = db.prepare(`
        SELECT hp.*,
               pr.name AS professional_name,
               pr.registration_type,
               pr.registration_number,
               pt.full_name AS patient_name,
               (SELECT COUNT(*) FROM clinical_home_program_follow_ups fu WHERE fu.program_id = hp.id) AS follow_ups_count,
               (SELECT fu.notes FROM clinical_home_program_follow_ups fu WHERE fu.program_id = hp.id ORDER BY fu.created_at DESC, fu.rowid DESC LIMIT 1) AS last_follow_up_note,
               (SELECT fu.created_at FROM clinical_home_program_follow_ups fu WHERE fu.program_id = hp.id ORDER BY fu.created_at DESC, fu.rowid DESC LIMIT 1) AS last_follow_up_date
        FROM clinical_home_programs hp
        LEFT JOIN professionals pr ON pr.id = hp.professional_id AND pr.tenant_id = hp.tenant_id
        LEFT JOIN patients pt ON pt.id = hp.patient_id
        WHERE hp.patient_id = ? AND hp.tenant_id = ?
          AND hp.deleted_at IS NULL
          AND (LOWER(COALESCE(hp.module_type, hp.specialty, 'to')) = ? OR LOWER(COALESCE(hp.specialty, hp.module_type, 'to')) = ?)
        ORDER BY datetime(COALESCE(hp.created_at, '1970-01-01')) DESC
      `).all(patientId, tenantId, professionId, professionId) as any[];

      const normalized = rows.map(r => ({
        id: r.id,
        patient_id: r.patient_id,
        patient_name: r.patient_name || null,
        professional_id: r.professional_id || null,
        professional_name: r.professional_name || null,
        registration_type: r.registration_type || null,
        registration_number: r.registration_number || null,
        specialty: r.specialty || r.module_type || professionId,
        module_type: r.module_type || r.specialty || professionId,
        template_id: r.template_id || null,
        category: r.category || 'Geral',
        subcategory: r.subcategory || null,
        setting: r.setting || r.environment_context || 'home',
        title: r.title || r.activity || '',
        objective: r.objective || '',
        instructions: r.instructions || r.instruction || '',
        target_skill: r.target_skill || null,
        materials_needed: r.materials_needed || null,
        frequency: r.frequency || null,
        responsible_person: r.responsible_person || null,
        caregiver_guidance: r.caregiver_guidance || null,
        adaptations: r.adaptations || null,
        notes: r.notes || null,
        status: r.status || 'active',
        follow_up_notes: r.follow_up_notes || null,
        follow_ups_count: Number(r.follow_ups_count || 0),
        last_follow_up_note: r.last_follow_up_note || null,
        last_follow_up_date: r.last_follow_up_date || null,
        created_at: r.created_at,
        updated_at: r.updated_at
      }));

      res.json(normalized);
    } catch (err: any) {
      console.error('[ProfessionalActivitiesController.listPatientActivities] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar atividades do paciente.' });
    }
  }

  /**
   * Atribui uma atividade personalizada da biblioteca ao paciente
   */
  static assignPatientActivity(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.userId;
      const patientId = String(req.params.patientId || '').trim();
      const {
        profession_id,
        module_type,
        template_id,
        title,
        objective,
        instructions,
        materials_needed,
        frequency,
        setting,
        responsible_person,
        category,
        subcategory,
        target_skill,
        caregiver_guidance,
        adaptations,
        notes,
        saveToMyLibrary
      } = req.body || {};

      const professionId = normalizeProfessionId(profession_id || module_type);
      if (!professionId) {
        res.status(400).json({ error: 'Módulo da profissão inválido.' });
        return;
      }

      if (!hasProfessionActivityAccess(req, professionId, patientId)) {
        res.status(403).json({ error: 'Sem permissão para prescrever atividade para este paciente.' });
        return;
      }

      const trimmedTitle = String(title || '').trim();
      const trimmedInstructions = String(instructions || '').trim();
      const trimmedObjective = String(objective || trimmedTitle).trim();

      if (!trimmedTitle || !trimmedInstructions) {
        res.status(400).json({ error: 'Título e instruções da atividade são obrigatórios.' });
        return;
      }

      const validSetting = ['home', 'school', 'community', 'other', 'general'].includes(setting) ? setting : 'home';

      // Previne duplo clique acidental no mesmo intervalo de 5 segundos no mesmo paciente e módulo
      const recentDup = db.prepare(`
        SELECT id, created_at FROM clinical_home_programs
        WHERE tenant_id = ? AND patient_id = ?
          AND LOWER(COALESCE(module_type, specialty, 'to')) = ?
          AND COALESCE(title, activity) = ?
          AND COALESCE(instructions, instruction) = ?
          AND datetime(created_at) >= datetime('now', '-5 seconds')
        ORDER BY created_at DESC
        LIMIT 1
      `).get(tenantId, patientId, professionId, trimmedTitle, trimmedInstructions) as any;

      if (recentDup) {
        res.status(200).json({
          id: recentDup.id,
          message: 'Atividade já atribuída recentemente.'
        });
        return;
      }

      const matchedProfessionalId = findCurrentProfessionalId(tenantId, userId);
      const programId = 'prog-' + uuidv4().slice(0, 8);

      db.prepare(`
        INSERT INTO clinical_home_programs (
          id, tenant_id, patient_id, professional_id, module_type, specialty,
          template_id, category, subcategory, setting, title, activity,
          objective, instruction, instructions, target_skill, materials_needed,
          frequency, environment_context, responsible_person, caregiver_guidance,
          adaptations, notes, status, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, 'active', datetime('now'), datetime('now')
        )
      `).run(
        programId,
        tenantId,
        patientId,
        matchedProfessionalId,
        professionId,
        professionId,
        template_id || null,
        category ? String(category).trim() : 'Geral',
        subcategory ? String(subcategory).trim() : null,
        validSetting,
        trimmedTitle,
        trimmedTitle,
        trimmedObjective,
        trimmedInstructions,
        trimmedInstructions,
        target_skill ? String(target_skill).trim() : null,
        materials_needed ? String(materials_needed).trim() : null,
        frequency ? String(frequency).trim() : null,
        validSetting,
        responsible_person ? String(responsible_person).trim() : null,
        caregiver_guidance ? String(caregiver_guidance).trim() : null,
        adaptations ? String(adaptations).trim() : null,
        notes ? String(notes).trim() : null
      );

      // Registra acompanhamento inicial no histórico
      const initialFollowUpId = 'fu-' + uuidv4().slice(0, 8);
      const profName = req.user?.name || 'Profissional';
      db.prepare(`
        INSERT INTO clinical_home_program_follow_ups (
          id, tenant_id, program_id, patient_id, professional_id, professional_name,
          status, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', 'Atividade prescrita e orientada.', datetime('now'))
      `).run(initialFollowUpId, tenantId, programId, patientId, matchedProfessionalId, profName);

      // Opção "Salvar na minha biblioteca": cria cópia nos modelos da clínica
      if (saveToMyLibrary) {
        const customTemplateId = 'tmpl-custom-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO clinical_activity_templates (
            id, tenant_id, author_user_id, author_professional_id, profession_id,
            category, subcategory, title, objective, target_skill,
            setting, materials_needed, instructions, frequency, caregiver_guidance,
            adaptations, notes, is_system, created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, 0, datetime('now'), datetime('now')
          )
        `).run(
          customTemplateId,
          tenantId,
          userId,
          matchedProfessionalId,
          professionId,
          category ? String(category).trim() : 'Geral',
          subcategory ? String(subcategory).trim() : null,
          trimmedTitle,
          trimmedObjective,
          target_skill ? String(target_skill).trim() : null,
          validSetting,
          materials_needed ? String(materials_needed).trim() : null,
          trimmedInstructions,
          frequency ? String(frequency).trim() : null,
          caregiver_guidance ? String(caregiver_guidance).trim() : null,
          adaptations ? String(adaptations).trim() : null,
          notes ? String(notes).trim() : null
        );
      }

      logAudit(req, 'ASSIGN_ACTIVITY', 'clinical_home_programs', programId, {
        patientId,
        professionId,
        title: trimmedTitle
      });

      res.status(201).json({
        id: programId,
        message: 'Atividade atribuída ao paciente com sucesso!'
      });
    } catch (err: any) {
      console.error('[ProfessionalActivitiesController.assignPatientActivity] Erro:', err);
      res.status(500).json({ error: 'Erro ao atribuir atividade ao paciente.' });
    }
  }

  /**
   * Atualiza o status e registra observações de acompanhamento
   */
  static updateAssignmentStatus(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.userId;
      const { id } = req.params;
      const { status, followUpNotes, notes } = req.body || {};

      const existing = db.prepare(`
        SELECT * FROM clinical_home_programs
        WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
      `).get(id, tenantId) as any;

      if (!existing) {
        res.status(404).json({ error: 'Registro de atividade não encontrado.' });
        return;
      }

      const professionId = normalizeProfessionId(existing.module_type || existing.specialty);
      if (!professionId || !hasProfessionActivityAccess(req, professionId, existing.patient_id)) {
        res.status(403).json({ error: 'Sem permissão para alterar esta atividade.' });
        return;
      }

      const validStatuses = ['active', 'completed', 'paused', 'revised', 'pending', 'partially_completed', 'not_completed'];
      const targetStatus = status && validStatuses.includes(String(status)) ? String(status) : existing.status;
      const rawNotes = followUpNotes !== undefined ? followUpNotes : notes;
      const trimmedNotes = rawNotes ? String(rawNotes).trim() : null;

      db.prepare(`
        UPDATE clinical_home_programs SET
          status = ?,
          follow_up_notes = COALESCE(?, follow_up_notes),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(targetStatus, trimmedNotes, id, tenantId);

      // Insere registro no histórico de acompanhamento
      const matchedProf = findCurrentProfessionalId(tenantId, userId);
      const profName = req.user?.name || 'Profissional';
      const followUpId = 'fu-' + uuidv4().slice(0, 8);

      db.prepare(`
        INSERT INTO clinical_home_program_follow_ups (
          id, tenant_id, program_id, patient_id, professional_id, professional_name,
          status, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        followUpId,
        tenantId,
        id,
        existing.patient_id,
        matchedProf,
        profName,
        targetStatus,
        trimmedNotes || `Status alterado para ${targetStatus}.`
      );

      logAudit(req, 'UPDATE_ACTIVITY_STATUS', 'clinical_home_programs', id, {
        status: targetStatus,
        patientId: existing.patient_id
      });

      res.json({
        message: 'Acompanhamento registrado com sucesso.',
        status: targetStatus
      });
    } catch (err: any) {
      console.error('[ProfessionalActivitiesController.updateAssignmentStatus] Erro:', err);
      res.status(500).json({ error: 'Erro ao registrar acompanhamento da atividade.' });
    }
  }

  /**
   * Consulta o histórico de acompanhamento de uma atividade
   */
  static getAssignmentFollowUps(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId!;
      const { id } = req.params;

      const existing = db.prepare(`
        SELECT id, patient_id, module_type, specialty
        FROM clinical_home_programs
        WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
      `).get(id, tenantId) as any;

      if (!existing) {
        res.status(404).json({ error: 'Atividade não encontrada.' });
        return;
      }

      const professionId = normalizeProfessionId(existing.module_type || existing.specialty);
      if (!professionId || !hasProfessionActivityAccess(req, professionId, existing.patient_id)) {
        res.status(403).json({ error: 'Acesso restrito a este registro.' });
        return;
      }

      const rows = db.prepare(`
        SELECT * FROM clinical_home_program_follow_ups
        WHERE program_id = ? AND tenant_id = ?
        ORDER BY created_at DESC, rowid DESC
      `).all(id, tenantId);

      res.json(rows);
    } catch (err: any) {
      console.error('[ProfessionalActivitiesController.getAssignmentFollowUps] Erro:', err);
      res.status(500).json({ error: 'Erro ao carregar histórico de acompanhamento.' });
    }
  }

  /**
   * Exclui logicamente (soft-delete) uma atividade atribuída ao paciente
   */
  static deleteAssignment(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.userId;
      const { id } = req.params;

      const existing = db.prepare(`
        SELECT id, patient_id, module_type, specialty, title, activity
        FROM clinical_home_programs
        WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
      `).get(id, tenantId) as any;

      if (!existing) {
        res.status(404).json({ error: 'Atividade não encontrada ou já excluída.' });
        return;
      }

      const professionId = normalizeProfessionId(existing.module_type || existing.specialty);
      if (!professionId || !hasProfessionActivityAccess(req, professionId, existing.patient_id)) {
        res.status(403).json({ error: 'Sem permissão para excluir esta atividade do paciente.' });
        return;
      }

      db.prepare(`
        UPDATE clinical_home_programs SET
          deleted_at = datetime('now'),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(id, tenantId);

      // Registra no histórico de acompanhamento como 'deleted'
      const matchedProf = findCurrentProfessionalId(tenantId, userId);
      const profName = req.user?.name || 'Profissional';
      const followUpId = 'fu-' + uuidv4().slice(0, 8);

      try {
        db.prepare(`
          INSERT INTO clinical_home_program_follow_ups (
            id, tenant_id, program_id, patient_id, professional_id, professional_name,
            status, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'deleted', 'Exercício desvinculado/excluído do paciente.', datetime('now'))
        `).run(
          followUpId,
          tenantId,
          id,
          existing.patient_id,
          matchedProf,
          profName
        );
      } catch (fuErr) {
        console.warn('[ProfessionalActivitiesController.deleteAssignment] Falha ao registrar log de follow_up:', fuErr);
      }

      logAudit(req, 'DELETE_ASSIGNED_ACTIVITY', 'clinical_home_programs', id, {
        patientId: existing.patient_id,
        professionId,
        title: existing.title || existing.activity
      });

      res.json({ message: 'Exercício excluído das atividades do paciente com sucesso.' });
    } catch (err: any) {
      console.error('[ProfessionalActivitiesController.deleteAssignment] Erro:', err);
      res.status(500).json({ error: 'Erro ao excluir atividade do paciente.' });
    }
  }

  // ==========================================
  // 3. EXPORTAÇÃO E GERAÇÃO DE PDFS
  // ==========================================

  /**
   * Emite PDF individual de uma atividade
   */
  static downloadAssignmentPdf(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId!;
      const { id } = req.params;

      const row = db.prepare(`
        SELECT hp.*,
               pr.name AS professional_name,
               pr.registration_type,
               pr.registration_number,
               pt.full_name AS patient_name
        FROM clinical_home_programs hp
        LEFT JOIN professionals pr ON pr.id = hp.professional_id AND pr.tenant_id = hp.tenant_id
        LEFT JOIN patients pt ON pt.id = hp.patient_id
        WHERE hp.id = ? AND hp.tenant_id = ? AND hp.deleted_at IS NULL
      `).get(id, tenantId) as any;

      if (!row) {
        res.status(404).json({ error: 'Orientação não encontrada.' });
        return;
      }

      const professionId = normalizeProfessionId(row.module_type || row.specialty);
      if (!professionId || !hasProfessionActivityAccess(req, professionId, row.patient_id)) {
        res.status(403).json({ error: 'Sem autorização para emitir documento desta orientação.' });
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
      const caregiverGuidance = String(row.caregiver_guidance || '').trim();
      const adaptationsText = String(row.adaptations || '').trim();
      const notesText = String(row.notes || '').trim();

      const settingLabels: Record<string, string> = {
        home: 'Domiciliar (Casa / Família)',
        school: 'Escolar (Educador / Professor)',
        community: 'Comunitário / Lazer',
        other: 'Outro Ambiente',
        general: 'Geral (Todos os Ambientes)'
      };
      const settingLabel = settingLabels[row.setting] || settingLabels.home;

      const rawDate = row.created_at ? new Date(String(row.created_at).replace(' ', 'T')) : new Date();
      const formattedDate = !isNaN(rawDate.getTime())
        ? rawDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        : String(row.created_at || '');

      const moduleTitles: Record<string, string> = {
        fono: 'ZEMDAFONO — PROGRAMA DE ORIENTAÇÕES E ATIVIDADES FONOAUDIOLÓGICAS',
        pp: 'ZEMDAPP — PROGRAMA DE ATIVIDADES E ORIENTAÇÕES PSICOPEDAGÓGICAS',
        to: 'ZEMDATO — PROGRAMA DE ATIVIDADES E ORIENTAÇÕES DE TERAPIA OCUPACIONAL',
        fisio: 'ZEMDAFISIO — PROGRAMA DE EXERCÍCIOS E ORIENTAÇÕES FISIOTERAPÊUTICAS'
      };
      const docHeaderTitle = moduleTitles[professionId] || 'PROGRAMA DE ATIVIDADES E ORIENTAÇÕES';

      const safeFilename = `orientacao-${professionId}-${row.id}.pdf`;
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

      // Cabeçalho da Clínica
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#0f172a').text(clinicName, { width: pageWidth });
      const clinicDetails: string[] = [];
      if (tenant?.cnpj) clinicDetails.push(`CNPJ: ${tenant.cnpj}`);
      const addressParts = [tenant?.address, tenant?.city && tenant?.state ? `${tenant.city}/${tenant.state}` : (tenant?.city || tenant?.state)].filter(Boolean);
      if (addressParts.length > 0) clinicDetails.push(addressParts.join(' - '));
      const contactParts = [tenant?.phone ? `Tel: ${tenant.phone}` : null, tenant?.email].filter(Boolean);
      if (contactParts.length > 0) clinicDetails.push(contactParts.join(' • '));

      if (clinicDetails.length > 0) {
        doc.moveDown(0.2).font('Helvetica').fontSize(8.5).fillColor('#475569').text(clinicDetails.join('  |  '), { width: pageWidth });
      }
      doc.moveDown(0.2).font('Helvetica-Bold').fontSize(8).fillColor('#0d9488').text(docHeaderTitle, { width: pageWidth });

      doc.moveDown(0.5);
      doc.moveTo(48, doc.y).lineTo(doc.page.width - 48, doc.y).lineWidth(1.2).strokeColor('#cbd5e1').stroke();
      doc.moveDown(0.7);

      // Bloco de Identificação
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#1e293b').text('Paciente: ', { continued: true })
        .font('Helvetica').fillColor('#0f172a').text(patientName);

      if (profName) {
        const profDisplay = profReg ? `${profName} (${profReg})` : profName;
        doc.moveDown(0.2).font('Helvetica-Bold').fontSize(9.5).fillColor('#1e293b').text('Profissional Responsável: ', { continued: true })
          .font('Helvetica').fillColor('#0f172a').text(profDisplay);
      }

      doc.moveDown(0.2).font('Helvetica-Bold').fontSize(9.5).fillColor('#1e293b').text('Data de Emissão: ', { continued: true })
        .font('Helvetica').fillColor('#0f172a').text(formattedDate);

      doc.moveDown(0.2).font('Helvetica-Bold').fontSize(9.5).fillColor('#1e293b').text('Ambiente de Aplicação: ', { continued: true })
        .font('Helvetica').fillColor('#0f172a').text(settingLabel);

      if (frequencyText) {
        doc.moveDown(0.2).font('Helvetica-Bold').fontSize(9.5).fillColor('#1e293b').text('Frequência Sugerida: ', { continued: true })
          .font('Helvetica').fillColor('#0f172a').text(frequencyText);
      }

      if (row.category) {
        doc.moveDown(0.2).font('Helvetica-Bold').fontSize(9.5).fillColor('#1e293b').text('Área / Categoria: ', { continued: true })
          .font('Helvetica').fillColor('#0f172a').text(`${row.category}${row.subcategory ? ` • ${row.subcategory}` : ''}`);
      }

      doc.moveDown(0.6);
      doc.moveTo(48, doc.y).lineTo(doc.page.width - 48, doc.y).lineWidth(0.6).strokeColor('#e2e8f0').stroke();
      doc.moveDown(0.6);

      // Título e Objetivo
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0d9488').text('TÍTULO DA ATIVIDADE');
      doc.moveDown(0.2).font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text(titleText, { width: pageWidth });

      if (row.objective) {
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0d9488').text('OBJETIVO TERAPÊUTICO');
        doc.moveDown(0.2).font('Helvetica').fontSize(10).fillColor('#1e293b').text(row.objective, { width: pageWidth });
      }

      if (materialsText) {
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0d9488').text('MATERIAIS E RECURSOS');
        doc.moveDown(0.2).font('Helvetica').fontSize(10).fillColor('#1e293b').text(materialsText, { width: pageWidth });
      }

      // Instruções Detalhadas
      doc.moveDown(0.6);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0d9488').text('INSTRUÇÕES PASSO A PASSO');
      doc.moveDown(0.25).font('Helvetica').fontSize(10).fillColor('#0f172a').text(instructionsText, { width: pageWidth, lineGap: 3 });

      if (caregiverGuidance) {
        doc.moveDown(0.6);
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0d9488').text('ORIENTAÇÕES AO RESPONSÁVEL / EDUCADOR');
        doc.moveDown(0.25).font('Helvetica').fontSize(10).fillColor('#1e293b').text(caregiverGuidance, { width: pageWidth });
      }

      if (adaptationsText) {
        doc.moveDown(0.6);
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0d9488').text('POSSIBILIDADES DE ADAPTAÇÃO');
        doc.moveDown(0.25).font('Helvetica').fontSize(10).fillColor('#1e293b').text(adaptationsText, { width: pageWidth });
      }

      if (notesText) {
        doc.moveDown(0.6);
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0d9488').text('OBSERVAÇÕES RELEVANTES');
        doc.moveDown(0.25).font('Helvetica').fontSize(9.5).fillColor('#475569').text(notesText, { width: pageWidth });
      }

      // Assinatura do Profissional
      if (profName) {
        if (doc.y > doc.page.height - 120) {
          doc.addPage();
        }
        doc.moveDown(1.8);
        const lineStart = (doc.page.width - 220) / 2;
        doc.moveTo(lineStart, doc.y).lineTo(lineStart + 220, doc.y).lineWidth(0.8).strokeColor('#94a3b8').stroke();
        doc.moveDown(0.3);
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a').text(profName, { width: pageWidth, align: 'center' });
        if (profReg) {
          doc.font('Helvetica').fontSize(8.5).fillColor('#475569').text(profReg, { width: pageWidth, align: 'center' });
        }
      }

      // Rodapé oficial
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const footerY = doc.page.height - 36;
        doc.font('Helvetica').fontSize(7.5).fillColor('#64748b').text(
          `${clinicName} • Documento Clínico emitido via Zemda • Página ${i + 1} de ${range.count}`,
          48,
          footerY,
          { width: pageWidth, align: 'center', lineBreak: false }
        );
      }

      doc.end();
    } catch (err: any) {
      console.error('[ProfessionalActivitiesController.downloadAssignmentPdf] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar PDF da atividade.' });
    }
  }

  /**
   * Exporta PDF consolidado de múltiplas atividades selecionadas ou de todas as ativas do paciente
   */
  static exportConsolidatedPdf(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId!;
      const patientId = String(req.params.patientId || '').trim();
      const rawProfession = req.query.module_type || req.query.profession_id || req.query.specialty;
      const professionId = normalizeProfessionId(String(rawProfession || ''));

      if (!professionId) {
        res.status(400).json({ error: 'Especifique o módulo/profissão.' });
        return;
      }

      if (!hasProfessionActivityAccess(req, professionId, patientId)) {
        res.status(403).json({ error: 'Acesso restrito ao prontuário deste paciente.' });
        return;
      }

      const { assignmentIds } = req.body || {};

      let sql = `
        SELECT hp.*,
               pr.name AS professional_name,
               pr.registration_type,
               pr.registration_number,
               pt.full_name AS patient_name
        FROM clinical_home_programs hp
        LEFT JOIN professionals pr ON pr.id = hp.professional_id AND pr.tenant_id = hp.tenant_id
        LEFT JOIN patients pt ON pt.id = hp.patient_id
        WHERE hp.patient_id = ? AND hp.tenant_id = ?
          AND hp.deleted_at IS NULL
          AND (LOWER(COALESCE(hp.module_type, hp.specialty, 'to')) = ? OR LOWER(COALESCE(hp.specialty, hp.module_type, 'to')) = ?)
      `;
      const params: any[] = [patientId, tenantId, professionId, professionId];

      if (Array.isArray(assignmentIds) && assignmentIds.length > 0) {
        const placeholders = assignmentIds.map(() => '?').join(',');
        sql += ` AND hp.id IN (${placeholders})`;
        params.push(...assignmentIds);
      } else {
        sql += " AND hp.status = 'active'";
      }

      sql += " ORDER BY datetime(COALESCE(hp.created_at, '1970-01-01')) DESC, hp.id DESC";

      const rows = db.prepare(sql).all(...params) as any[];

      if (!rows || rows.length === 0) {
        res.status(404).json({ error: 'Nenhuma orientação encontrada para exportação.' });
        return;
      }

      const tenant = db.prepare(`
        SELECT name, trade_name, cnpj_cpf AS cnpj, phone, email, address, city, state
        FROM tenants WHERE id = ?
      `).get(tenantId) as any;

      const clinicName = String(tenant?.trade_name || tenant?.name || 'Clínica').trim();
      const patientName = String(rows[0]?.patient_name || 'Paciente').trim();
      const issueDate = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

      const moduleTitles: Record<string, string> = {
        fono: 'ZEMDAFONO — PROGRAMA CONSOLIDADO DE ORIENTAÇÕES FONOAUDIOLÓGICAS',
        pp: 'ZEMDAPP — PROGRAMA CONSOLIDADO DE ATIVIDADES PSICOPEDAGÓGICAS',
        to: 'ZEMDATO — PROGRAMA CONSOLIDADO DE ATIVIDADES DE TERAPIA OCUPACIONAL',
        fisio: 'ZEMDAFISIO — PROGRAMA CONSOLIDADO DE EXERCÍCIOS FISIOTERAPÊUTICOS'
      };
      const docHeaderTitle = moduleTitles[professionId] || 'PROGRAMA CONSOLIDADO DE ATIVIDADES E ORIENTAÇÕES';

      const safeFilename = `orientacoes-consolidadas-${professionId}-${rows.length}-atividades.pdf`;
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

      // Cabeçalho da Clínica
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#0f172a').text(clinicName, { width: pageWidth });
      const clinicDetails: string[] = [];
      if (tenant?.cnpj) clinicDetails.push(`CNPJ: ${tenant.cnpj}`);
      const addressParts = [tenant?.address, tenant?.city && tenant?.state ? `${tenant.city}/${tenant.state}` : (tenant?.city || tenant?.state)].filter(Boolean);
      if (addressParts.length > 0) clinicDetails.push(addressParts.join(' - '));
      const contactParts = [tenant?.phone ? `Tel: ${tenant.phone}` : null, tenant?.email].filter(Boolean);
      if (contactParts.length > 0) clinicDetails.push(contactParts.join(' • '));

      if (clinicDetails.length > 0) {
        doc.moveDown(0.2).font('Helvetica').fontSize(8.5).fillColor('#475569').text(clinicDetails.join('  |  '), { width: pageWidth });
      }
      doc.moveDown(0.2).font('Helvetica-Bold').fontSize(8).fillColor('#0d9488').text(docHeaderTitle, { width: pageWidth });

      doc.moveDown(0.5);
      doc.moveTo(48, doc.y).lineTo(doc.page.width - 48, doc.y).lineWidth(1.2).strokeColor('#cbd5e1').stroke();
      doc.moveDown(0.7);

      // Bloco do Paciente
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e293b').text('Paciente: ', { continued: true })
        .font('Helvetica').fillColor('#0f172a').text(patientName);

      doc.moveDown(0.2).font('Helvetica-Bold').fontSize(10).fillColor('#1e293b').text('Data de Emissão: ', { continued: true })
        .font('Helvetica').fillColor('#0f172a').text(issueDate);

      doc.moveDown(0.2).font('Helvetica-Bold').fontSize(10).fillColor('#1e293b').text('Total de Atividades no Documento: ', { continued: true })
        .font('Helvetica').fillColor('#0f172a').text(String(rows.length));

      doc.moveDown(0.8);

      const settingLabels: Record<string, string> = {
        home: 'Casa / Família',
        school: 'Escola / Educadores',
        community: 'Comunidade / Lazer',
        other: 'Outro Ambiente',
        general: 'Geral'
      };

      // Itera sobre as atividades
      rows.forEach((prog: any, index: number) => {
        if (doc.y > doc.page.height - 180) {
          doc.addPage();
        }

        doc.moveTo(48, doc.y).lineTo(doc.page.width - 48, doc.y).lineWidth(0.8).strokeColor('#0d9488').stroke();
        doc.moveDown(0.5);

        const itemTitle = String(prog.title || prog.activity || `Atividade #${index + 1}`).trim();
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text(`${index + 1}. ${itemTitle}`, { width: pageWidth });

        const metaLine: string[] = [];
        if (prog.category) metaLine.push(`Área: ${prog.category}`);
        if (prog.setting) metaLine.push(`Ambiente: ${settingLabels[prog.setting] || prog.setting}`);
        if (prog.frequency) metaLine.push(`Frequência: ${prog.frequency}`);

        if (metaLine.length > 0) {
          doc.moveDown(0.2).font('Helvetica').fontSize(8.5).fillColor('#64748b').text(metaLine.join('  •  '), { width: pageWidth });
        }

        if (prog.objective) {
          doc.moveDown(0.3).font('Helvetica-Bold').fontSize(9).fillColor('#1e293b').text('Objetivo: ', { continued: true })
            .font('Helvetica').fillColor('#334155').text(prog.objective, { width: pageWidth });
        }

        if (prog.materials_needed) {
          doc.moveDown(0.25).font('Helvetica-Bold').fontSize(9).fillColor('#1e293b').text('Materiais: ', { continued: true })
            .font('Helvetica').fillColor('#334155').text(prog.materials_needed, { width: pageWidth });
        }

        const instructions = String(prog.instructions || prog.instruction || '').trim();
        if (instructions) {
          doc.moveDown(0.3).font('Helvetica-Bold').fontSize(9).fillColor('#0d9488').text('Orientações passo a passo:');
          doc.moveDown(0.2).font('Helvetica').fontSize(9.5).fillColor('#0f172a').text(instructions, { width: pageWidth, lineGap: 2.5 });
        }

        if (prog.caregiver_guidance) {
          doc.moveDown(0.3).font('Helvetica-Bold').fontSize(9).fillColor('#0d9488').text('Dica ao responsável / professor:');
          doc.moveDown(0.2).font('Helvetica').fontSize(9).fillColor('#334155').text(prog.caregiver_guidance, { width: pageWidth });
        }

        doc.moveDown(0.8);
      });

      // Assinatura do Profissional
      const firstProf = rows.find(r => r.professional_name);
      const profName = firstProf?.professional_name || req.user?.name || '';
      const profReg = firstProf?.registration_type && firstProf?.registration_number
        ? `${firstProf.registration_type} ${firstProf.registration_number}`
        : '';

      if (profName) {
        if (doc.y > doc.page.height - 120) {
          doc.addPage();
        }
        doc.moveDown(1.5);
        const lineStart = (doc.page.width - 220) / 2;
        doc.moveTo(lineStart, doc.y).lineTo(lineStart + 220, doc.y).lineWidth(0.8).strokeColor('#94a3b8').stroke();
        doc.moveDown(0.3);
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a').text(profName, { width: pageWidth, align: 'center' });
        if (profReg) {
          doc.font('Helvetica').fontSize(8.5).fillColor('#475569').text(profReg, { width: pageWidth, align: 'center' });
        }
      }

      // Rodapé em todas as páginas
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const footerY = doc.page.height - 36;
        doc.font('Helvetica').fontSize(7.5).fillColor('#64748b').text(
          `${clinicName} • Documento Consolidado de Orientações emitido via Zemda • Página ${i + 1} de ${range.count}`,
          48,
          footerY,
          { width: pageWidth, align: 'center', lineBreak: false }
        );
      }

      doc.end();
    } catch (err: any) {
      console.error('[ProfessionalActivitiesController.exportConsolidatedPdf] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar documento consolidado.' });
    }
  }
}
