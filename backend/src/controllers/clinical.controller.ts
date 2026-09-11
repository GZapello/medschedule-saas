import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';

export class ClinicalController {
  // Lista prontuários e evoluções de um paciente específico (restrito)
  static listByPatient(req: Request, res: Response): void {
    try {
      const { patientId } = req.params;
      const tenantId = req.tenantId;

      if (!req.user || !['clinic_admin', 'professional'].includes(req.user.role)) {
        res.status(403).json({ error: 'Acesso negado: dados clínicos restritos a profissionais de saúde e gestores clínicos autorizados. Administradores do SaaS não possuem acesso a prontuários (LGPD).' });
        return;
      }

      const stmt = db.prepare(`
        SELECT 
          r.id, r.tenant_id, r.patient_id, r.appointment_id, r.professional_id,
          r.session_date, r.title, r.clinical_evolution, r.technical_notes, r.private_notes,
          r.is_sealed, r.created_at, r.updated_at,
          p.name as professional_name, p.registration_type, p.registration_number,
          (SELECT COUNT(*) FROM documents WHERE record_id = r.id) as total_attachments
        FROM records r
        JOIN professionals p ON p.id = r.professional_id
        WHERE r.patient_id = ? AND r.tenant_id = ?
        ORDER BY r.session_date DESC, r.created_at DESC
      `);
      const records = stmt.all(patientId, tenantId);

      logAudit(req, 'VIEW_CLINICAL_RECORDS', 'records', patientId, { totalViewed: records.length });
      res.json(records);
    } catch (err: any) {
      console.error('[ClinicalController.listByPatient] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar prontuários clínicos' });
    }
  }

  // Cria nova evolução ou anotação de sessão
  static create(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { patientId, appointmentId, professionalId, sessionDate, title, clinicalEvolution, technicalNotes, privateNotes, isSealed } = req.body;

      if (!patientId || !sessionDate || !title) {
        res.status(400).json({ error: 'Paciente, data da sessão e título são obrigatórios' });
        return;
      }

      // Se não enviou professionalId explicitamente, resolve a partir do usuário autenticado
      let resolvedProfId = professionalId;
      if (!resolvedProfId && req.user) {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ?').get(req.user.userId) as { id: string } | undefined;
        if (prof) resolvedProfId = prof.id;
      }

      if (!resolvedProfId) {
        res.status(400).json({ error: 'Profissional responsável não identificado' });
        return;
      }

      const id = 'rec-' + uuidv4().slice(0, 8);
      const insertStmt = db.prepare(`
        INSERT INTO records (
          id, tenant_id, patient_id, appointment_id, professional_id,
          session_date, title, clinical_evolution, technical_notes, private_notes, is_sealed
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(
        id,
        tenantId,
        patientId,
        appointmentId || null,
        resolvedProfId,
        sessionDate,
        title,
        clinicalEvolution || null,
        technicalNotes || null,
        privateNotes || null,
        isSealed ? 1 : 0
      );

      logAudit(req, 'CREATE_CLINICAL_RECORD', 'records', id, { patientId, title, isSealed });
      res.status(201).json({ id, message: 'Registro clínico / evolução gravado com sucesso' });
    } catch (err: any) {
      console.error('[ClinicalController.create] Erro:', err);
      res.status(500).json({ error: 'Erro ao registrar evolução clínica' });
    }
  }

  // Atualiza evolução (caso não esteja lacrada/is_sealed)
  static update(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const { title, clinicalEvolution, technicalNotes, privateNotes, isSealed } = req.body;

      const record = db.prepare('SELECT is_sealed FROM records WHERE id = ? AND tenant_id = ?').get(id, tenantId) as { is_sealed: number } | undefined;
      if (!record) {
        res.status(404).json({ error: 'Registro não encontrado' });
        return;
      }

      if (record.is_sealed === 1) {
        res.status(403).json({ error: 'Este prontuário foi finalizado/lacrado e não pode ser editado (integridade legal)' });
        return;
      }

      const updateStmt = db.prepare(`
        UPDATE records SET
          title = COALESCE(?, title),
          clinical_evolution = COALESCE(?, clinical_evolution),
          technical_notes = COALESCE(?, technical_notes),
          private_notes = COALESCE(?, private_notes),
          is_sealed = COALESCE(?, is_sealed),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `);

      updateStmt.run(
        title || null,
        clinicalEvolution || null,
        technicalNotes || null,
        privateNotes || null,
        isSealed !== undefined ? (isSealed ? 1 : 0) : null,
        id,
        tenantId
      );

      logAudit(req, 'UPDATE_CLINICAL_RECORD', 'records', id);
      res.json({ message: 'Evolução clínica atualizada com sucesso' });
    } catch (err: any) {
      console.error('[ClinicalController.update] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar registro clínico' });
    }
  }
}
