import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';

/**
 * Validação de acesso ao ZemdaBody:
 * Regra:
 * - SuperAdmin SaaS: sem acesso aos dados clínicos das clínicas (sempre bloqueado)
 * - clinic_admin ativo: acesso imediato ao ZemdaBody
 * - professional ativo e vinculado ao tenant: acesso automático ao ZemdaBody
 * - Nenhuma profissão precisa de autorização do gerente
 * - Usuários administrativos/não clínicos (ex: recepcionista) não recebem acesso clínico automaticamente
 * - Sem travas funcionais internas adicionais ou permissões manuais
 */
export function hasZemdaBodyAccess(req: Request): boolean {
  if (!req.user || !req.tenantId) return false;
  if (req.user.role === 'superadmin') return false;

  try {
    // 1. Gestor da Clínica (clinic_admin) ativo
    if (req.user.role === 'clinic_admin') {
      const cu = db.prepare('SELECT status FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, req.tenantId) as any;
      if (!cu || cu.status === 'active') return true;
      return false;
    }

    // 2. Profissional de saúde ativo vinculado ao tenant da clínica
    const cu = db.prepare('SELECT status, role FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, req.tenantId) as any;
    if (!cu || cu.status !== 'active') return false;

    // Se o vínculo for de gestor ou profissional
    if (cu.role === 'clinic_admin' || cu.role === 'professional' || req.user.role === 'professional') {
      return true;
    }

    // Verifica se possui registro ativo na tabela professionals
    const prof = db.prepare('SELECT id, active FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, req.tenantId) as any;
    if (prof && prof.active === 1) {
      return true;
    }
  } catch (err) {
    console.error('[hasZemdaBodyAccess] Erro ao validar acesso ao ZemdaBody:', err);
  }
  return false;
}

export class BodyAssessmentController {
  /**
   * 1. Consulta avaliação corporal vinculada ao agendamento atual
   */
  static getByAppointment(req: Request, res: Response): void {
    try {
      const appointmentId = String(req.params.appointmentId);
      const tenantId = req.tenantId;

      if (!req.user || !tenantId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      if (!hasZemdaBodyAccess(req)) {
        res.status(403).json({ error: 'Acesso ao ZemdaBody restrito a profissionais de saúde e gestores da clínica' });
        return;
      }

      const appt = db.prepare('SELECT id, patient_id, professional_id FROM appointments WHERE id = ? AND tenant_id = ?').get(appointmentId, tenantId) as any;
      if (!appt) {
        res.status(404).json({ error: 'Agendamento não encontrado' });
        return;
      }

      const assessment = db.prepare(`
        SELECT ba.*, p.name as professional_name
        FROM body_assessments ba
        LEFT JOIN professionals p ON p.id = ba.professional_id
        WHERE ba.appointment_id = ? AND ba.tenant_id = ?
        ORDER BY ba.created_at DESC LIMIT 1
      `).get(appointmentId, tenantId) as any;

      if (!assessment) {
        res.json({ assessment: null, markers: [], drawings: {} });
        return;
      }

      const markers = db.prepare(`
        SELECT * FROM body_markers
        WHERE assessment_id = ? AND tenant_id = ?
        ORDER BY created_at ASC
      `).all(assessment.id, tenantId);

      const drawingsRows = db.prepare(`
        SELECT * FROM body_drawings
        WHERE assessment_id = ? AND tenant_id = ?
      `).all(assessment.id, tenantId);

      const drawings: Record<string, any[]> = {
        front: [],
        back: [],
        left: [],
        right: []
      };

      for (const row of drawingsRows) {
        try {
          drawings[row.view] = row.strokes_json ? JSON.parse(row.strokes_json) : [];
        } catch {
          drawings[row.view] = [];
        }
      }

      res.json({ assessment, markers, drawings });
    } catch (err: any) {
      console.error('[BodyAssessmentController.getByAppointment] Erro:', err);
      res.status(500).json({ error: 'Erro ao buscar avaliação do mapa corporal' });
    }
  }

  /**
   * 2. Lista histórico de mapas corporais de um paciente para o prontuário
   */
  static listByPatient(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;

      if (!req.user || !tenantId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      if (!hasZemdaBodyAccess(req)) {
        res.status(403).json({ error: 'Acesso ao ZemdaBody restrito a profissionais de saúde e gestores da clínica' });
        return;
      }

      const patientInTenant = db.prepare('SELECT 1 FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId);
      if (!patientInTenant) {
        res.status(404).json({ error: 'Paciente não encontrado nesta clínica' });
        return;
      }

      const assessments = db.prepare(`
        SELECT 
          ba.*,
          p.name as professional_name,
          p.registration_type,
          p.registration_number,
          (SELECT COUNT(*) FROM body_markers WHERE assessment_id = ba.id) as total_markers,
          (SELECT COUNT(*) FROM body_drawings WHERE assessment_id = ba.id) as total_views_drawn
        FROM body_assessments ba
        LEFT JOIN professionals p ON p.id = ba.professional_id
        WHERE ba.patient_id = ? AND ba.tenant_id = ?
        ORDER BY ba.assessment_date DESC, ba.created_at DESC
      `).all(patientId, tenantId);

      logAudit(req, 'LIST_BODY_ASSESSMENTS', 'body_assessments', patientId);
      res.json(assessments);
    } catch (err: any) {
      console.error('[BodyAssessmentController.listByPatient] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar histórico de mapas corporais' });
    }
  }

  /**
   * 3. Busca detalhes de uma avaliação específica com marcadores e desenhos
   */
  static getById(req: Request, res: Response): void {
    try {
      const id = String(req.params.id);
      const tenantId = req.tenantId;

      if (!req.user || !tenantId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      if (!hasZemdaBodyAccess(req)) {
        res.status(403).json({ error: 'Acesso ao ZemdaBody restrito a profissionais de saúde e gestores da clínica' });
        return;
      }

      const assessment = db.prepare(`
        SELECT ba.*, p.name as professional_name, pat.full_name as patient_name
        FROM body_assessments ba
        LEFT JOIN professionals p ON p.id = ba.professional_id
        JOIN patients pat ON pat.id = ba.patient_id
        WHERE ba.id = ? AND ba.tenant_id = ?
      `).get(id, tenantId) as any;

      if (!assessment) {
        res.status(404).json({ error: 'Avaliação corporal não encontrada' });
        return;
      }

      const markers = db.prepare(`
        SELECT * FROM body_markers
        WHERE assessment_id = ? AND tenant_id = ?
        ORDER BY created_at ASC
      `).all(id, tenantId);

      const drawingsRows = db.prepare(`
        SELECT * FROM body_drawings
        WHERE assessment_id = ? AND tenant_id = ?
      `).all(id, tenantId);

      const drawings: Record<string, any[]> = {
        front: [],
        back: [],
        left: [],
        right: []
      };

      for (const row of drawingsRows) {
        try {
          drawings[row.view] = row.strokes_json ? JSON.parse(row.strokes_json) : [];
        } catch {
          drawings[row.view] = [];
        }
      }

      res.json({ assessment, markers, drawings });
    } catch (err: any) {
      console.error('[BodyAssessmentController.getById] Erro:', err);
      res.status(500).json({ error: 'Erro ao carregar detalhes do mapa corporal' });
    }
  }

  /**
   * 4. Cria ou atualiza uma avaliação corporal (Upsert)
   */
  static upsertAssessment(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const {
        id: customId,
        patientId,
        appointmentId,
        professionalId,
        professionId,
        module = 'general',
        bodyModel = 'female',
        assessmentDate,
        notes
      } = req.body;

      if (!req.user || !tenantId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      if (!hasZemdaBodyAccess(req)) {
        res.status(403).json({ error: 'Acesso ao ZemdaBody restrito a profissionais de saúde e gestores da clínica' });
        return;
      }

      if (!patientId) {
        res.status(400).json({ error: 'Identificação do paciente é obrigatória' });
        return;
      }

      const patientInTenant = db.prepare('SELECT 1 FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId);
      if (!patientInTenant) {
        res.status(404).json({ error: 'Paciente não encontrado nesta clínica' });
        return;
      }

      let resolvedProfId = professionalId;
      if (!resolvedProfId) {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) resolvedProfId = prof.id;
      }

      const dateStr = assessmentDate || new Date().toISOString().split('T')[0];

      // Verifica se já existe por appointment_id ou por id
      let existing: any = null;
      if (customId) {
        existing = db.prepare('SELECT * FROM body_assessments WHERE id = ? AND tenant_id = ?').get(customId, tenantId);
      } else if (appointmentId) {
        existing = db.prepare('SELECT * FROM body_assessments WHERE appointment_id = ? AND tenant_id = ?').get(appointmentId, tenantId);
      }

      let assessmentId: string;
      if (existing) {
        assessmentId = existing.id;
        db.prepare(`
          UPDATE body_assessments
          SET body_model = ?, module = ?, notes = COALESCE(?, notes), updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(bodyModel, module, notes || null, assessmentId, tenantId);
      } else {
        assessmentId = customId || 'ba-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO body_assessments (
            id, tenant_id, patient_id, appointment_id, professional_id,
            profession_id, module, body_model, assessment_date, notes,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
          assessmentId, tenantId, patientId, appointmentId || null, resolvedProfId,
          professionId || null, module, bodyModel, dateStr, notes || null
        );
      }

      logAudit(req, 'SAVE_BODY_ASSESSMENT', 'body_assessments', assessmentId);
      res.json({ success: true, assessmentId });
    } catch (err: any) {
      console.error('[BodyAssessmentController.upsertAssessment] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar avaliação do mapa corporal' });
    }
  }

  /**
   * 5. Salva um marcador clínico estruturado sobre uma região anatômica
   */
  static saveMarker(req: Request, res: Response): void {
    try {
      const assessmentId = String(req.params.id);
      const tenantId = req.tenantId;
      const {
        id: markerId,
        bodyRegion,
        side = 'midline',
        view = 'front',
        markerType,
        value,
        severity,
        notes,
        coordinates,
        detailsJson
      } = req.body;

      if (!req.user || !tenantId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      if (!hasZemdaBodyAccess(req)) {
        res.status(403).json({ error: 'Acesso ao ZemdaBody restrito a profissionais de saúde e gestores da clínica' });
        return;
      }

      const assessment = db.prepare('SELECT patient_id FROM body_assessments WHERE id = ? AND tenant_id = ?').get(assessmentId, tenantId) as any;
      if (!assessment) {
        res.status(404).json({ error: 'Avaliação corporal não encontrada' });
        return;
      }

      if (!bodyRegion || !markerType) {
        res.status(400).json({ error: 'Região corporal e tipo de marcador são obrigatórios' });
        return;
      }

      const idToUse = markerId || 'bm-' + uuidv4().slice(0, 8);
      const coordsStr = coordinates ? (typeof coordinates === 'string' ? coordinates : JSON.stringify(coordinates)) : null;
      const detailsStr = detailsJson ? (typeof detailsJson === 'string' ? detailsJson : JSON.stringify(detailsJson)) : null;

      db.prepare(`
        INSERT INTO body_markers (
          id, tenant_id, assessment_id, body_region, side, view,
          marker_type, value, severity, notes, coordinates, details_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          value = excluded.value,
          severity = excluded.severity,
          notes = excluded.notes,
          coordinates = excluded.coordinates,
          details_json = excluded.details_json,
          updated_at = datetime('now')
      `).run(
        idToUse, tenantId, assessmentId, bodyRegion, side, view,
        markerType, value ? String(value) : null, severity || null,
        notes || null, coordsStr, detailsStr
      );

      logAudit(req, 'SAVE_BODY_MARKER', 'body_markers', idToUse, { bodyRegion, markerType, view });
      res.json({ success: true, markerId: idToUse });
    } catch (err: any) {
      console.error('[BodyAssessmentController.saveMarker] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar marcador corporal' });
    }
  }

  /**
   * 6. Remove um marcador estruturado
   */
  static deleteMarker(req: Request, res: Response): void {
    try {
      const markerId = String(req.params.markerId);
      const tenantId = req.tenantId;

      if (!req.user || !tenantId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      if (!hasZemdaBodyAccess(req)) {
        res.status(403).json({ error: 'Acesso ao ZemdaBody restrito a profissionais de saúde e gestores da clínica' });
        return;
      }

      const marker = db.prepare(`
        SELECT bm.*, ba.patient_id
        FROM body_markers bm
        JOIN body_assessments ba ON ba.id = bm.assessment_id
        WHERE bm.id = ? AND bm.tenant_id = ?
      `).get(markerId, tenantId) as any;

      if (!marker) {
        res.status(404).json({ error: 'Marcador não encontrado' });
        return;
      }

      db.prepare('DELETE FROM body_markers WHERE id = ? AND tenant_id = ?').run(markerId, tenantId);
      logAudit(req, 'DELETE_BODY_MARKER', 'body_markers', markerId);
      res.json({ success: true });
    } catch (err: any) {
      console.error('[BodyAssessmentController.deleteMarker] Erro:', err);
      res.status(500).json({ error: 'Erro ao excluir marcador corporal' });
    }
  }

  /**
   * 7. Salva desenhos/traços manuais da caneta ou marca-texto para uma vista
   */
  static saveDrawings(req: Request, res: Response): void {
    try {
      const assessmentId = String(req.params.id);
      const view = String(req.params.view);
      const tenantId = req.tenantId;
      const { strokes } = req.body;

      if (!req.user || !tenantId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      if (!hasZemdaBodyAccess(req)) {
        res.status(403).json({ error: 'Acesso ao ZemdaBody restrito a profissionais de saúde e gestores da clínica' });
        return;
      }

      const assessment = db.prepare('SELECT * FROM body_assessments WHERE id = ? AND tenant_id = ?').get(assessmentId, tenantId) as any;
      if (!assessment) {
        res.status(404).json({ error: 'Avaliação corporal não encontrada' });
        return;
      }

      const validViews = ['front', 'back', 'left', 'right'];
      if (!validViews.includes(view)) {
        res.status(400).json({ error: 'Vista corporal inválida' });
        return;
      }

      const strokesArray = Array.isArray(strokes) ? strokes : [];
      const strokesJson = JSON.stringify(strokesArray);

      // Upsert em body_drawings
      const existingDrawing = db.prepare('SELECT id FROM body_drawings WHERE assessment_id = ? AND view = ? AND tenant_id = ?').get(assessmentId, view, tenantId) as any;
      let drawingId: string;

      if (existingDrawing) {
        drawingId = existingDrawing.id;
        db.prepare(`
          UPDATE body_drawings
          SET strokes_json = ?, updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(strokesJson, drawingId, tenantId);
      } else {
        drawingId = 'bd-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO body_drawings (
            id, tenant_id, assessment_id, patient_id, appointment_id,
            professional_id, module, body_model, view, strokes_json,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
          drawingId, tenantId, assessmentId, assessment.patient_id,
          assessment.appointment_id, assessment.professional_id,
          assessment.module, assessment.body_model, view, strokesJson
        );
      }

      // Sincroniza body_drawing_strokes
      db.prepare('DELETE FROM body_drawing_strokes WHERE drawing_id = ?').run(drawingId);

      const insertStroke = db.prepare(`
        INSERT INTO body_drawing_strokes (
          id, drawing_id, assessment_id, tool_type, color, stroke_width,
          opacity, points, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);

      for (const stroke of strokesArray) {
        const sId = stroke.strokeId || stroke.id || 'stk-' + uuidv4().slice(0, 8);
        const ptsStr = typeof stroke.points === 'string' ? stroke.points : JSON.stringify(stroke.points || []);
        insertStroke.run(
          sId, drawingId, assessmentId, stroke.toolType || 'pen',
          stroke.color || '#dc2626', stroke.strokeWidth || 4,
          stroke.opacity !== undefined ? stroke.opacity : 1.0, ptsStr
        );
      }

      res.json({ success: true, totalStrokes: strokesArray.length });
    } catch (err: any) {
      console.error('[BodyAssessmentController.saveDrawings] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar anotações manuais' });
    }
  }

  /**
   * 8. Limpa desenhos manuais de uma vista específica
   */
  static clearViewDrawings(req: Request, res: Response): void {
    try {
      const assessmentId = String(req.params.id);
      const view = String(req.params.view);
      const tenantId = req.tenantId;

      if (!req.user || !tenantId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      if (!hasZemdaBodyAccess(req)) {
        res.status(403).json({ error: 'Acesso ao ZemdaBody restrito a profissionais de saúde e gestores da clínica' });
        return;
      }

      const assessment = db.prepare('SELECT patient_id FROM body_assessments WHERE id = ? AND tenant_id = ?').get(assessmentId, tenantId) as any;
      if (!assessment) {
        res.status(404).json({ error: 'Avaliação não encontrada' });
        return;
      }

      const drawing = db.prepare('SELECT id FROM body_drawings WHERE assessment_id = ? AND view = ? AND tenant_id = ?').get(assessmentId, view, tenantId) as any;
      if (drawing) {
        db.prepare('DELETE FROM body_drawing_strokes WHERE drawing_id = ?').run(drawing.id);
        db.prepare("UPDATE body_drawings SET strokes_json = '[]', updated_at = datetime('now') WHERE id = ?").run(drawing.id);
      }

      logAudit(req, 'CLEAR_BODY_DRAWINGS', 'body_drawings', assessmentId, { view });
      res.json({ success: true });
    } catch (err: any) {
      console.error('[BodyAssessmentController.clearViewDrawings] Erro:', err);
      res.status(500).json({ error: 'Erro ao limpar anotações manuais da vista' });
    }
  }

  /**
   * 9. Salva nova Avaliação Antropométrica e Medidas Corporais (Nutricionista)
   */
  static saveAnthropometry(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!req.user || !tenantId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const {
        patientId,
        appointmentId,
        professionalId,
        assessmentDate,
        weight,
        height,
        waistCircumference,
        abdomenCircumference,
        hipCircumference,
        bodyFatPercentage,
        fatMassKg,
        muscleMassKg,
        visceralFat,
        bodyMeasures,
        notes
      } = req.body;

      if (!hasZemdaBodyAccess(req)) {
        res.status(403).json({ error: 'Acesso ao ZemdaBody restrito a profissionais de saúde e gestores da clínica' });
        return;
      }

      if (!patientId) {
        res.status(400).json({ error: 'Identificação do paciente é obrigatória' });
        return;
      }

      const patientInTenant = db.prepare('SELECT 1 FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId);
      if (!patientInTenant) {
        res.status(404).json({ error: 'Paciente não encontrado nesta clínica' });
        return;
      }

      let resolvedProfId = professionalId;
      if (!resolvedProfId) {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) resolvedProfId = prof.id;
      }
      if (!resolvedProfId) resolvedProfId = req.user.userId;

      const dateStr = assessmentDate || new Date().toISOString().split('T')[0];

      // Cálculos automáticos de índices
      const w = weight !== undefined && weight !== null && weight !== '' ? Number(weight) : null;
      const h = height !== undefined && height !== null && height !== '' ? Number(height) : null;
      const waist = waistCircumference !== undefined && waistCircumference !== null && waistCircumference !== '' ? Number(waistCircumference) : null;
      const abdomen = abdomenCircumference !== undefined && abdomenCircumference !== null && abdomenCircumference !== '' ? Number(abdomenCircumference) : null;
      const hip = hipCircumference !== undefined && hipCircumference !== null && hipCircumference !== '' ? Number(hipCircumference) : null;
      const fatPct = bodyFatPercentage !== undefined && bodyFatPercentage !== null && bodyFatPercentage !== '' ? Number(bodyFatPercentage) : null;

      let bmi: number | null = null;
      if (w && h && h > 0) {
        const hMeters = h / 100;
        bmi = Number((w / (hMeters * hMeters)).toFixed(2));
      }

      let whr: number | null = null;
      if (waist && hip && hip > 0) {
        whr = Number((waist / hip).toFixed(2));
      }

      let whtr: number | null = null;
      if (waist && h && h > 0) {
        whtr = Number((waist / h).toFixed(2));
      }

      let calculatedFatMass = fatMassKg !== undefined && fatMassKg !== null && fatMassKg !== '' ? Number(fatMassKg) : null;
      if (calculatedFatMass === null && w !== null && fatPct !== null) {
        calculatedFatMass = Number(((w * fatPct) / 100).toFixed(2));
      }

      let calculatedMuscleMass = muscleMassKg !== undefined && muscleMassKg !== null && muscleMassKg !== '' ? Number(muscleMassKg) : null;
      if (calculatedMuscleMass === null && w !== null && calculatedFatMass !== null) {
        calculatedMuscleMass = Number((w - calculatedFatMass).toFixed(2));
      }

      const bodyMeasuresJson = bodyMeasures ? (typeof bodyMeasures === 'string' ? bodyMeasures : JSON.stringify(bodyMeasures)) : null;
      const id = 'baa-' + uuidv4().slice(0, 12);

      db.prepare(`
        INSERT INTO body_anthropometric_assessments (
          id, tenant_id, patient_id, appointment_id, professional_id,
          assessment_date, weight, height, waist_circumference,
          abdomen_circumference, hip_circumference, body_fat_percentage,
          fat_mass_kg, muscle_mass_kg, visceral_fat, bmi, whr, whtr,
          body_measures_json, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        id, tenantId, patientId, appointmentId || null, resolvedProfId,
        dateStr, w, h, waist, abdomen, hip, fatPct,
        calculatedFatMass, calculatedMuscleMass, visceralFat ? String(visceralFat) : null,
        bmi, whr, whtr, bodyMeasuresJson, notes || null
      );

      logAudit(req, 'SAVE_ANTHROPOMETRIC_ASSESSMENT', 'body_anthropometric_assessments', id, { patientId, dateStr });

      res.status(201).json({
        success: true,
        assessmentId: id,
        data: {
          id,
          patientId,
          appointmentId,
          assessmentDate: dateStr,
          weight: w,
          height: h,
          waistCircumference: waist,
          abdomenCircumference: abdomen,
          hipCircumference: hip,
          bodyFatPercentage: fatPct,
          fatMassKg: calculatedFatMass,
          muscleMassKg: calculatedMuscleMass,
          visceralFat,
          bmi,
          whr,
          whtr,
          notes
        }
      });
    } catch (err: any) {
      console.error('[BodyAssessmentController.saveAnthropometry] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar avaliação antropométrica' });
    }
  }

  /**
   * 10. Lista histórico de avaliações antropométricas do paciente
   */
  static listAnthropometryByPatient(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;

      if (!req.user || !tenantId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      if (!hasZemdaBodyAccess(req)) {
        res.status(403).json({ error: 'Acesso ao ZemdaBody restrito a profissionais de saúde e gestores da clínica' });
        return;
      }

      const patientInTenant = db.prepare('SELECT 1 FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId);
      if (!patientInTenant) {
        res.status(404).json({ error: 'Paciente não encontrado nesta clínica' });
        return;
      }

      const rows = db.prepare(`
        SELECT 
          baa.*,
          p.name as professional_name
        FROM body_anthropometric_assessments baa
        LEFT JOIN professionals p ON p.id = baa.professional_id
        WHERE baa.patient_id = ? AND baa.tenant_id = ?
        ORDER BY baa.assessment_date DESC, baa.created_at DESC
      `).all(patientId, tenantId) as any[];

      const assessments = rows.map(r => {
        let measures: any = [];
        if (r.body_measures_json) {
          try {
            measures = JSON.parse(r.body_measures_json);
          } catch {
            measures = [];
          }
        }
        return {
          ...r,
          body_measures: measures
        };
      });

      res.json(assessments);
    } catch (err: any) {
      console.error('[BodyAssessmentController.listAnthropometryByPatient] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar avaliações antropométricas do paciente' });
    }
  }

  /**
   * 11. Salva Avaliação Corporal e Plano Terapêutico (Demais profissionais)
   */
  static saveTherapeuticPlan(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!req.user || !tenantId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const {
        patientId,
        appointmentId,
        professionalId,
        assessmentDate,
        items,
        notes
      } = req.body;

      if (!hasZemdaBodyAccess(req)) {
        res.status(403).json({ error: 'Acesso ao ZemdaBody restrito a profissionais de saúde e gestores da clínica' });
        return;
      }

      if (!patientId) {
        res.status(400).json({ error: 'Identificação do paciente é obrigatória' });
        return;
      }

      const patientInTenant = db.prepare('SELECT 1 FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId);
      if (!patientInTenant) {
        res.status(404).json({ error: 'Paciente não encontrado nesta clínica' });
        return;
      }

      let resolvedProfId = professionalId;
      if (!resolvedProfId) {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) resolvedProfId = prof.id;
      }
      if (!resolvedProfId) resolvedProfId = req.user.userId;

      const dateStr = assessmentDate || new Date().toISOString().split('T')[0];
      const itemsArray = Array.isArray(items) ? items : [];
      const itemsJson = JSON.stringify(itemsArray);
      const id = 'btp-' + uuidv4().slice(0, 12);

      db.prepare(`
        INSERT INTO body_therapeutic_plans (
          id, tenant_id, patient_id, appointment_id, professional_id,
          assessment_date, items_json, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        id, tenantId, patientId, appointmentId || null, resolvedProfId,
        dateStr, itemsJson, notes || null
      );

      logAudit(req, 'SAVE_BODY_THERAPEUTIC_PLAN', 'body_therapeutic_plans', id, { patientId, dateStr, totalItems: itemsArray.length });

      res.status(201).json({
        success: true,
        planId: id,
        data: {
          id,
          patientId,
          appointmentId,
          assessmentDate: dateStr,
          items: itemsArray,
          notes
        }
      });
    } catch (err: any) {
      console.error('[BodyAssessmentController.saveTherapeuticPlan] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar plano terapêutico corporal' });
    }
  }

  /**
   * 12. Lista histórico de planos terapêuticos corporais do paciente
   */
  static listTherapeuticPlansByPatient(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;

      if (!req.user || !tenantId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      if (!hasZemdaBodyAccess(req)) {
        res.status(403).json({ error: 'Acesso ao ZemdaBody restrito a profissionais de saúde e gestores da clínica' });
        return;
      }

      const patientInTenant = db.prepare('SELECT 1 FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId);
      if (!patientInTenant) {
        res.status(404).json({ error: 'Paciente não encontrado nesta clínica' });
        return;
      }

      const rows = db.prepare(`
        SELECT 
          btp.*,
          p.name as professional_name
        FROM body_therapeutic_plans btp
        LEFT JOIN professionals p ON p.id = btp.professional_id
        WHERE btp.patient_id = ? AND btp.tenant_id = ?
        ORDER BY btp.assessment_date DESC, btp.created_at DESC
      `).all(patientId, tenantId) as any[];

      const plans = rows.map(r => {
        let items: any = [];
        if (r.items_json) {
          try {
            items = JSON.parse(r.items_json);
          } catch {
            items = [];
          }
        }
        return {
          ...r,
          items
        };
      });

      res.json(plans);
    } catch (err: any) {
      console.error('[BodyAssessmentController.listTherapeuticPlansByPatient] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar planos terapêuticos do paciente' });
    }
  }
}
