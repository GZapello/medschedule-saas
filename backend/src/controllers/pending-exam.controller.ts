import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';

export class PendingExamController {
  static list(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const { patientId, professionalId, status, startDate, endDate, search } = req.query;

      let query = `
        SELECT 
          pe.id, pe.tenant_id, pe.patient_id, pe.professional_id, pe.exam_name,
          pe.request_date, pe.expected_date, pe.received_date, pe.status, pe.notes,
          pe.created_by, pe.created_at, pe.updated_at,
          p.full_name as patient_name, p.phone as patient_phone,
          prof.name as professional_name
        FROM pending_exams pe
        JOIN patients p ON p.id = pe.patient_id
        LEFT JOIN professionals prof ON prof.id = pe.professional_id
        WHERE pe.tenant_id = ?
      `;
      const params: any[] = [tenantId];

      if (patientId) {
        query += ' AND pe.patient_id = ?';
        params.push(patientId);
      }
      if (professionalId) {
        query += ' AND pe.professional_id = ?';
        params.push(professionalId);
      }
      if (status) {
        query += ' AND pe.status = ?';
        params.push(status);
      }
      if (startDate) {
        query += ' AND pe.request_date >= ?';
        params.push(startDate);
      }
      if (endDate) {
        query += ' AND pe.request_date <= ?';
        params.push(endDate);
      }
      if (search) {
        query += ' AND (pe.exam_name LIKE ? OR p.full_name LIKE ? OR pe.notes LIKE ?)';
        const searchPattern = `%${search}%`;
        params.push(searchPattern, searchPattern, searchPattern);
      }

      query += ' ORDER BY pe.expected_date ASC, pe.request_date DESC';

      const exams = db.prepare(query).all(...params) as any[];

      // Atualiza dinamicamente status para 'delayed' se passou da data prevista e ainda está 'waiting'
      const today = new Date().toISOString().split('T')[0];
      const processed = exams.map(e => {
        if (e.status === 'waiting' && e.expected_date && e.expected_date < today) {
          return { ...e, is_delayed: true };
        }
        return { ...e, is_delayed: false };
      });

      res.json(processed);
    } catch (err: any) {
      console.error('[PendingExamController.list] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar exames a receber' });
    }
  }

  static create(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const { patientId, professionalId, examName, requestDate, expectedDate, notes, status } = req.body;

      if (!patientId || !examName || !requestDate) {
        res.status(400).json({ error: 'Paciente, nome do exame e data de solicitação são obrigatórios' });
        return;
      }

      const id = 'pex-' + uuidv4().slice(0, 8);

      db.prepare(`
        INSERT INTO pending_exams (
          id, tenant_id, patient_id, professional_id, exam_name,
          request_date, expected_date, status, notes, created_by, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        id,
        tenantId,
        patientId,
        professionalId || null,
        examName.trim(),
        requestDate,
        expectedDate || null,
        status || 'waiting',
        notes || null,
        req.user?.userId || null
      );

      logAudit(req, 'CREATE_PENDING_EXAM', 'pending_exams', id, { examName, patientId });
      res.status(201).json({ id, message: 'Exame registrado com sucesso' });
    } catch (err: any) {
      console.error('[PendingExamController.create] Erro:', err);
      res.status(500).json({ error: 'Erro ao registrar exame a receber' });
    }
  }

  static update(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const { examName, professionalId, requestDate, expectedDate, receivedDate, status, notes } = req.body;

      const current = db.prepare('SELECT id FROM pending_exams WHERE id = ? AND tenant_id = ?').get(id, tenantId);
      if (!current) {
        res.status(404).json({ error: 'Registro de exame não encontrado' });
        return;
      }

      db.prepare(`
        UPDATE pending_exams SET
          exam_name = COALESCE(?, exam_name),
          professional_id = COALESCE(?, professional_id),
          request_date = COALESCE(?, request_date),
          expected_date = COALESCE(?, expected_date),
          received_date = COALESCE(?, received_date),
          status = COALESCE(?, status),
          notes = COALESCE(?, notes),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(
        examName || null,
        professionalId !== undefined ? professionalId : null,
        requestDate || null,
        expectedDate !== undefined ? expectedDate : null,
        receivedDate !== undefined ? receivedDate : null,
        status || null,
        notes !== undefined ? notes : null,
        id,
        tenantId
      );

      logAudit(req, 'UPDATE_PENDING_EXAM', 'pending_exams', id, { status });
      res.json({ message: 'Exame atualizado com sucesso' });
    } catch (err: any) {
      console.error('[PendingExamController.update] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar exame a receber' });
    }
  }

  static delete(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      db.prepare('DELETE FROM pending_exams WHERE id = ? AND tenant_id = ?').run(id, tenantId);
      logAudit(req, 'DELETE_PENDING_EXAM', 'pending_exams', id);
      res.json({ message: 'Exame removido com sucesso' });
    } catch (err: any) {
      console.error('[PendingExamController.delete] Erro:', err);
      res.status(500).json({ error: 'Erro ao remover exame' });
    }
  }
}
