import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { hasClinicalAccess } from './clinical.controller';

export class ClinicalReassessmentController {
  /**
   * GET /v1/clinical/reassessments/:moduleType/:assessmentType/:patientId
   * Retorna: { initial, previous, current, history }
   */
  static getReassessments(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { moduleType, assessmentType, patientId } = req.params;

      if (!tenantId) {
        res.status(403).json({ error: 'Clínica não identificada' });
        return;
      }

      if (!hasClinicalAccess(req, String(patientId))) {
        res.status(403).json({ error: 'Acesso clínico restrito (LGPD)' });
        return;
      }

      const rows = db.prepare(`
        SELECT r.*, p.name as professional_name
        FROM clinical_reassessments r
        LEFT JOIN professionals p ON p.id = r.professional_id
        WHERE r.tenant_id = ? AND r.patient_id = ? AND r.module_type = ? AND r.assessment_type = ?
        ORDER BY r.created_at ASC
      `).all(tenantId, patientId, moduleType, assessmentType) as any[];

      const parsedHistory = rows.map(r => ({
        ...r,
        data: (() => {
          try { return JSON.parse(r.data_json); } catch { return {}; }
        })()
      }));

      if (parsedHistory.length === 0) {
        res.json({
          initial: null,
          previous: null,
          current: null,
          history: []
        });
        return;
      }

      const initial = parsedHistory.find(r => r.is_initial === 1) || parsedHistory[0];
      const current = parsedHistory[parsedHistory.length - 1];
      const previous = parsedHistory.length > 1 ? parsedHistory[parsedHistory.length - 2] : null;

      res.json({
        initial,
        previous,
        current,
        history: parsedHistory
      });
    } catch (err: any) {
      console.error('[ClinicalReassessmentController.getReassessments]', err);
      res.status(500).json({ error: 'Erro ao consultar reavaliações clínicas' });
    }
  }

  /**
   * POST /v1/clinical/reassessments
   * Salva uma nova avaliação ou reavaliação preservando o histórico existente.
   */
  static saveReassessment(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId;

      if (!tenantId || !userId) {
        res.status(403).json({ error: 'Não autenticado' });
        return;
      }

      const {
        patientId,
        appointmentId,
        moduleType,
        assessmentType,
        data,
        notes,
        title,
        isInitial = false
      } = req.body;

      if (!patientId || !moduleType || !assessmentType || !data) {
        res.status(400).json({ error: 'patientId, moduleType, assessmentType e data são obrigatórios' });
        return;
      }

      if (!hasClinicalAccess(req, String(patientId))) {
        res.status(403).json({ error: 'Acesso clínico restrito (LGPD)' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      // Se não há nenhuma avaliação prévia, esta obrigatoriamente se torna a Inicial
      const countRow = db.prepare(`
        SELECT count(*) as total FROM clinical_reassessments
        WHERE tenant_id = ? AND patient_id = ? AND module_type = ? AND assessment_type = ?
      `).get(tenantId, patientId, moduleType, assessmentType) as any;

      const isFirst = (countRow?.total || 0) === 0;
      const effectiveInitial = isFirst || Boolean(isInitial) ? 1 : 0;

      const id = 'reass-' + uuidv4().slice(0, 10);
      const dataJson = typeof data === 'string' ? data : JSON.stringify(data);

      db.prepare(`
        INSERT INTO clinical_reassessments (
          id, tenant_id, patient_id, professional_id, appointment_id,
          module_type, assessment_type, is_initial, title, data_json, notes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        id, tenantId, patientId, profId, appointmentId || null,
        moduleType, assessmentType, effectiveInitial, title || null, dataJson, notes || null
      );

      res.status(201).json({
        id,
        isInitial: effectiveInitial === 1,
        message: effectiveInitial === 1 ? 'Avaliação Inicial registrada com sucesso' : 'Nova Reavaliação gravada no histórico'
      });
    } catch (err: any) {
      console.error('[ClinicalReassessmentController.saveReassessment]', err);
      res.status(500).json({ error: 'Erro ao salvar reavaliação clínica' });
    }
  }

  /**
   * GET /v1/clinical/reassessments/compare/:idA/:idB
   * Compara duas avaliações por ID
   */
  static compare(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { idA, idB } = req.params;

      if (!tenantId) {
        res.status(403).json({ error: 'Clínica não identificada' });
        return;
      }

      const rowA = db.prepare('SELECT * FROM clinical_reassessments WHERE id = ? AND tenant_id = ?').get(idA, tenantId) as any;
      const rowB = db.prepare('SELECT * FROM clinical_reassessments WHERE id = ? AND tenant_id = ?').get(idB, tenantId) as any;

      if (!rowA || !rowB) {
        res.status(404).json({ error: 'Uma ou ambas as avaliações não foram encontradas' });
        return;
      }

      const parsedA = {
        ...rowA,
        data: (() => { try { return JSON.parse(rowA.data_json); } catch { return {}; } })()
      };
      const parsedB = {
        ...rowB,
        data: (() => { try { return JSON.parse(rowB.data_json); } catch { return {}; } })()
      };

      res.json({
        assessmentA: parsedA,
        assessmentB: parsedB
      });
    } catch (err: any) {
      console.error('[ClinicalReassessmentController.compare]', err);
      res.status(500).json({ error: 'Erro ao comparar reavaliações' });
    }
  }
}
