import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { hasClinicalAccess } from './clinical.controller';
import { isSpeechTherapistOrClinicManager } from './speech-therapy.controller';
import { isDentistOrClinicManager } from './dentistry.controller';
import { isNutritionistOrClinicManager } from './nutrition.controller';
import { isOccupationalTherapistOrClinicManager } from './occupational-therapy.controller';
import { isPhysiotherapistOrClinicManager } from './physiotherapy.controller';
import { hasPsychologyAccess } from './psychology.controller';
import { hasPsychopedagogyAccess } from './psychopedagogy.controller';
import { isUserPersonalTrainer } from './personal.controller';

function normalizeModule(mod: string): string {
  const m = String(mod || '').toLowerCase().replace(/^zemda[-_]?/, '');
  if (m === 'fono' || m === 'speech' || m === 'speechtherapy' || m === 'speech_therapy') return 'fono';
  if (m === 'psico' || m === 'psychology') return 'psico';
  if (m === 'odonto' || m === 'dentistry' || m === 'dental') return 'odonto';
  if (m === 'nutri' || m === 'nutrition') return 'nutri';
  if (m === 'to' || m === 'occupational_therapy' || m === 'occupationaltherapy') return 'to';
  if (m === 'fisio' || m === 'physiotherapy' || m === 'physio') return 'fisio';
  if (m === 'personal' || m === 'fitness') return 'personal';
  if (m === 'pp' || m === 'psychopedagogy') return 'pp';
  return m;
}

export function validateModuleAccess(req: Request, moduleType: string, patientId: string): boolean {
  if (!req.user || !req.tenantId) return false;
  if (req.user.role === 'superadmin') return false;

  const role = req.user.role as string;
  if (role === 'receptionist' || role === 'financial' || role === 'secretary' || role === 'assistant') {
    return false;
  }

  // Validação geral do paciente no tenant
  const patient = db.prepare('SELECT id FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, req.tenantId);
  if (!patient) return false;

  const norm = normalizeModule(moduleType);

  switch (norm) {
    case 'fono':
      return isSpeechTherapistOrClinicManager(req);
    case 'odonto':
      return isDentistOrClinicManager(req);
    case 'nutri':
      return isNutritionistOrClinicManager(req);
    case 'to':
      return isOccupationalTherapistOrClinicManager(req);
    case 'fisio':
      return isPhysiotherapistOrClinicManager(req);
    case 'psico':
      return hasPsychologyAccess(req, patientId);
    case 'pp':
      return hasPsychopedagogyAccess(req, patientId);
    case 'personal':
      return req.user.role === 'clinic_admin' || isUserPersonalTrainer(req.user.userId, req.tenantId);
    default:
      return hasClinicalAccess(req, patientId);
  }
}

export class ClinicalDraftController {
  /**
   * GET /v1/clinical/draft/:moduleType/:patientId
   * Query params: ?appointment_id=...
   */
  static getDraft(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { moduleType: rawModule, patientId } = req.params;
      const rawAppId = req.query.appointment_id || req.query.appointmentId;
      const appointmentId = rawAppId ? String(rawAppId) : null;
      const moduleType = normalizeModule(String(rawModule || ''));
      const pId = String(patientId || '');

      if (!pId || !validateModuleAccess(req, moduleType, pId)) {
        res.status(403).json({ error: 'Acesso negado ao rascunho clínico.' });
        return;
      }

      let draft: any = null;

      // 1. Busca por appointment específico se fornecido
      if (appointmentId && appointmentId !== 'none') {
        draft = db.prepare(`
          SELECT * FROM clinical_drafts
          WHERE tenant_id = ? AND patient_id = ? AND module_type = ? AND appointment_id = ?
          ORDER BY updated_at DESC LIMIT 1
        `).get(tenantId, patientId, moduleType, appointmentId);
      }

      // 2. Fallback sem appointment se não achou
      if (!draft) {
        draft = db.prepare(`
          SELECT * FROM clinical_drafts
          WHERE tenant_id = ? AND patient_id = ? AND module_type = ? AND (appointment_id IS NULL OR appointment_id = '' OR appointment_id = 'none')
          ORDER BY updated_at DESC LIMIT 1
        `).get(tenantId, patientId, moduleType);
      }

      // 3. Fallback especial para psico (compatibilidade com psychology_drafts)
      if (!draft && moduleType === 'psico') {
        const psicoDraft = db.prepare(`
          SELECT * FROM psychology_drafts
          WHERE tenant_id = ? AND patient_id = ? AND (COALESCE(?, 'none') = 'none' OR appointment_id = ? OR appointment_id IS NULL)
          ORDER BY updated_at DESC LIMIT 1
        `).get(tenantId, patientId, appointmentId, appointmentId) as any;

        if (psicoDraft) {
          draft = {
            id: psicoDraft.id,
            tenant_id: psicoDraft.tenant_id,
            patient_id: psicoDraft.patient_id,
            appointment_id: psicoDraft.appointment_id,
            module_type: 'psico',
            draft_data_json: psicoDraft.draft_data_json,
            client_updated_at: psicoDraft.client_updated_at,
            updated_at: psicoDraft.updated_at
          };
        }
      }

      if (!draft) {
        res.json({ draft: null });
        return;
      }

      let parsedData: any = {};
      try {
        parsedData = JSON.parse(draft.draft_data_json || '{}');
      } catch {
        parsedData = {};
      }

      res.json({
        draft: {
          id: draft.id,
          patientId: draft.patient_id,
          appointmentId: draft.appointment_id,
          moduleType: draft.module_type,
          draftData: parsedData,
          clientUpdatedAt: draft.client_updated_at,
          updatedAt: draft.updated_at
        }
      });
    } catch (err: any) {
      console.error('[ClinicalDraftController.getDraft]', err);
      res.status(500).json({ error: 'Erro ao carregar rascunho clínico.' });
    }
  }

  /**
   * POST /v1/clinical/draft
   * Body: { moduleType, patientId, appointmentId, draftData, clientUpdatedAt }
   */
  static saveDraft(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId;
      const {
        moduleType: rawModule,
        patientId,
        appointmentId: rawAppId,
        appointment_id: rawAppId2,
        draftData: rawDraftData,
        draft_data: rawDraftData2,
        clientUpdatedAt: rawClientUpdated,
        client_updated_at: rawClientUpdated2
      } = req.body;

      const moduleType = normalizeModule(rawModule);
      const appointmentId = rawAppId || rawAppId2 || null;
      const draftData = rawDraftData || rawDraftData2;
      const clientUpdatedAt = rawClientUpdated || rawClientUpdated2 || new Date().toISOString();

      if (!patientId || !validateModuleAccess(req, moduleType, String(patientId))) {
        res.status(403).json({ error: 'Acesso negado: Sigilo e permissões clínicas.' });
        return;
      }

      if (!draftData) {
        res.status(400).json({ error: 'Dados do rascunho são obrigatórios.' });
        return;
      }

      const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(userId, tenantId) as any;
      const profId = prof?.id || null;
      const resolvedAppId = appointmentId && appointmentId !== 'none' ? String(appointmentId) : null;

      // Validação de concorrência e conflito: previne sobrescrita silenciosa
      const existing = db.prepare(`
        SELECT id, client_updated_at, updated_at FROM clinical_drafts
        WHERE tenant_id = ? AND patient_id = ? AND module_type = ? AND COALESCE(appointment_id, 'none') = COALESCE(?, 'none')
      `).get(tenantId, patientId, moduleType, resolvedAppId) as any;

      if (existing && existing.client_updated_at && clientUpdatedAt) {
        const existingTime = new Date(existing.client_updated_at).getTime();
        const incomingTime = new Date(clientUpdatedAt).getTime();
        if (!isNaN(existingTime) && !isNaN(incomingTime) && incomingTime < existingTime) {
          res.status(409).json({
            error: 'Rascunho já atualizado com versão mais recente no servidor.',
            id: existing.id,
            savedAt: existing.client_updated_at
          });
          return;
        }
      }

      const id = existing?.id || `drf-${moduleType}-${uuidv4().slice(0, 10)}`;
      const draftJson = JSON.stringify(draftData);

      if (existing) {
        db.prepare(`
          UPDATE clinical_drafts SET
            draft_data_json = ?,
            client_updated_at = ?,
            professional_id = COALESCE(?, professional_id),
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(draftJson, clientUpdatedAt, profId, existing.id, tenantId);
      } else {
        db.prepare(`
          INSERT INTO clinical_drafts (
            id, tenant_id, patient_id, professional_id, appointment_id,
            module_type, draft_data_json, client_updated_at, updated_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(id, tenantId, patientId, profId, resolvedAppId, moduleType, draftJson, clientUpdatedAt);
      }

      // Se for módulo psico, sincroniza com psychology_drafts para retrocompatibilidade
      if (moduleType === 'psico') {
        try {
          const exPsico = db.prepare(`
            SELECT id FROM psychology_drafts
            WHERE tenant_id = ? AND patient_id = ? AND COALESCE(appointment_id, 'none') = COALESCE(?, 'none')
          `).get(tenantId, patientId, resolvedAppId) as any;
          if (exPsico) {
            db.prepare(`
              UPDATE psychology_drafts SET
                draft_data_json = ?, client_updated_at = ?, professional_id = COALESCE(?, professional_id), updated_at = datetime('now')
              WHERE id = ? AND tenant_id = ?
            `).run(draftJson, clientUpdatedAt, profId, exPsico.id, tenantId);
          } else {
            db.prepare(`
              INSERT INTO psychology_drafts (
                id, tenant_id, patient_id, professional_id, appointment_id, draft_data_json, client_updated_at, updated_at, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `).run(id, tenantId, patientId, profId, resolvedAppId, draftJson, clientUpdatedAt);
          }
        } catch (_) {}
      }

      res.json({
        success: true,
        message: 'Rascunho clínico salvo com sucesso!',
        id,
        savedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('[ClinicalDraftController.saveDraft]', err);
      res.status(500).json({ error: 'Erro ao salvar rascunho clínico.' });
    }
  }

  /**
   * DELETE /v1/clinical/draft/:moduleType/:patientId
   * Query params: ?appointment_id=...
   */
  static deleteDraft(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { moduleType: rawModule, patientId } = req.params;
      const rawAppId = req.query.appointment_id || req.query.appointmentId;
      const appointmentId = rawAppId ? String(rawAppId) : null;
      const moduleType = normalizeModule(String(rawModule || ''));
      const pId = String(patientId || '');

      if (!pId || !validateModuleAccess(req, moduleType, pId)) {
        res.status(403).json({ error: 'Acesso negado ao rascunho clínico.' });
        return;
      }

      if (appointmentId && appointmentId !== 'none') {
        db.prepare(`
          DELETE FROM clinical_drafts
          WHERE tenant_id = ? AND patient_id = ? AND module_type = ? AND appointment_id = ?
        `).run(tenantId, patientId, moduleType, appointmentId);
      } else {
        db.prepare(`
          DELETE FROM clinical_drafts
          WHERE tenant_id = ? AND patient_id = ? AND module_type = ?
        `).run(tenantId, patientId, moduleType);
      }

      if (moduleType === 'psico') {
        try {
          if (appointmentId && appointmentId !== 'none') {
            db.prepare('DELETE FROM psychology_drafts WHERE tenant_id = ? AND patient_id = ? AND appointment_id = ?').run(tenantId, patientId, appointmentId);
          } else {
            db.prepare('DELETE FROM psychology_drafts WHERE tenant_id = ? AND patient_id = ?').run(tenantId, patientId);
          }
        } catch (_) {}
      }

      res.json({ success: true, message: 'Rascunho removido com sucesso.' });
    } catch (err: any) {
      console.error('[ClinicalDraftController.deleteDraft]', err);
      res.status(500).json({ error: 'Erro ao remover rascunho clínico.' });
    }
  }
}
