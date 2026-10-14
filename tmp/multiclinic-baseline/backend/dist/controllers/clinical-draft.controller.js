"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClinicalDraftController = void 0;
exports.validateModuleAccess = validateModuleAccess;
const estetic_controller_1 = require("./estetic.controller");
const database_1 = require("../config/database");
const uuid_1 = require("uuid");
const clinical_controller_1 = require("./clinical.controller");
const speech_therapy_controller_1 = require("./speech-therapy.controller");
const dentistry_controller_1 = require("./dentistry.controller");
const nutrition_controller_1 = require("./nutrition.controller");
const occupational_therapy_controller_1 = require("./occupational-therapy.controller");
const physiotherapy_controller_1 = require("./physiotherapy.controller");
const psychology_controller_1 = require("./psychology.controller");
const psychopedagogy_controller_1 = require("./psychopedagogy.controller");
const personal_controller_1 = require("./personal.controller");
const medical_controller_1 = require("./medical.controller");
function normalizeModule(mod) {
    const m = String(mod || '').toLowerCase().replace(/^zemda[-_]?/, '');
    if (m === 'fono' || m === 'speech' || m === 'speechtherapy' || m === 'speech_therapy')
        return 'fono';
    if (m === 'psico' || m === 'psychology')
        return 'psico';
    if (m === 'odonto' || m === 'dentistry' || m === 'dental')
        return 'odonto';
    if (m === 'nutri' || m === 'nutrition')
        return 'nutri';
    if (m === 'to' || m === 'occupational_therapy' || m === 'occupationaltherapy')
        return 'to';
    if (m === 'fisio' || m === 'physiotherapy' || m === 'physio')
        return 'fisio';
    if (m === 'personal' || m === 'fitness')
        return 'personal';
    if (m === 'pp' || m === 'psychopedagogy')
        return 'pp';
    if (m === 'med' || m === 'medical' || m === 'medicina')
        return 'medical';
    return m;
}
function validateModuleAccess(req, moduleType, patientId) {
    if (!req.user || !req.tenantId)
        return false;
    const isSandboxTenant = req.tenantId.startsWith('sbx-tenant-');
    const isSandboxSession = Boolean(req.isSandboxSession || req.headers['x-sandbox-session']);
    let isAuthorizedSandbox = isSandboxTenant || isSandboxSession;
    if (!isAuthorizedSandbox && req.user.role === 'superadmin') {
        const sbx = database_1.db.prepare('SELECT id FROM sandbox_test_sessions WHERE (sandbox_tenant_id = ? OR id = ?) AND admin_user_id = ?').get(req.tenantId, req.tenantId, req.user.userId);
        if (sbx)
            isAuthorizedSandbox = true;
    }
    // SuperAdmin no ambiente Sandbox tem acesso para testes e simulação
    if (req.user.role === 'superadmin') {
        if (!isAuthorizedSandbox) {
            // Em clínicas reais de produção, SuperAdmin é estritamente bloqueado de rascunhos clínicos (sigilo LGPD)
            return false;
        }
        const patient = database_1.db.prepare('SELECT id FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, req.tenantId);
        return !!patient;
    }
    const role = req.user.role;
    if (role === 'receptionist' || role === 'financial' || role === 'secretary' || role === 'assistant') {
        return false;
    }
    // Validação geral do paciente no tenant
    const patient = database_1.db.prepare('SELECT id FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, req.tenantId);
    if (!patient)
        return false;
    const norm = normalizeModule(moduleType);
    switch (norm) {
        case 'estetic':
            return (0, estetic_controller_1.getEsteticAccess)(req).allowed;
        case 'medical':
            return (0, medical_controller_1.isMedicalProfessionalOrClinicManager)(req) && (0, clinical_controller_1.hasClinicalAccess)(req, patientId);
        case 'fono':
            return (0, speech_therapy_controller_1.isSpeechTherapistOrClinicManager)(req);
        case 'odonto':
            return (0, dentistry_controller_1.isDentistOrClinicManager)(req);
        case 'nutri':
            return (0, nutrition_controller_1.isNutritionistOrClinicManager)(req);
        case 'to':
            return (0, occupational_therapy_controller_1.isOccupationalTherapistOrClinicManager)(req);
        case 'fisio':
            return (0, physiotherapy_controller_1.isPhysiotherapistOrClinicManager)(req);
        case 'psico':
            return (0, psychology_controller_1.hasPsychologyAccess)(req, patientId);
        case 'pp':
            return (0, psychopedagogy_controller_1.hasPsychopedagogyAccess)(req, patientId);
        case 'personal':
            return req.user.role === 'clinic_admin' || (0, personal_controller_1.isUserPersonalTrainer)(req.user.userId, req.tenantId);
        default:
            return (0, clinical_controller_1.hasClinicalAccess)(req, patientId);
    }
}
class ClinicalDraftController {
    /**
     * GET /v1/clinical/draft/:moduleType/:patientId
     * Query params: ?appointment_id=...
     */
    static getDraft(req, res) {
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
            let draft = null;
            // 1. Busca por appointment específico se fornecido
            if (appointmentId && appointmentId !== 'none') {
                draft = database_1.db.prepare(`
          SELECT * FROM clinical_drafts
          WHERE tenant_id = ? AND patient_id = ? AND module_type = ? AND appointment_id = ?
          ORDER BY updated_at DESC LIMIT 1
        `).get(tenantId, patientId, moduleType, appointmentId);
            }
            // 2. Fallback sem appointment se não achou
            if (!draft) {
                draft = database_1.db.prepare(`
          SELECT * FROM clinical_drafts
          WHERE tenant_id = ? AND patient_id = ? AND module_type = ? AND (appointment_id IS NULL OR appointment_id = '' OR appointment_id = 'none')
          ORDER BY updated_at DESC LIMIT 1
        `).get(tenantId, patientId, moduleType);
            }
            // 3. Fallback especial para psico (compatibilidade com psychology_drafts)
            if (!draft && moduleType === 'psico') {
                const psicoDraft = database_1.db.prepare(`
          SELECT * FROM psychology_drafts
          WHERE tenant_id = ? AND patient_id = ? AND (COALESCE(?, 'none') = 'none' OR appointment_id = ? OR appointment_id IS NULL)
          ORDER BY updated_at DESC LIMIT 1
        `).get(tenantId, patientId, appointmentId, appointmentId);
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
            let parsedData = {};
            try {
                parsedData = JSON.parse(draft.draft_data_json || '{}');
            }
            catch {
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
        }
        catch (err) {
            console.error('[ClinicalDraftController.getDraft]', err);
            res.status(500).json({ error: 'Erro ao carregar rascunho clínico.' });
        }
    }
    /**
     * POST /v1/clinical/draft
     * Body: { moduleType, patientId, appointmentId, draftData, clientUpdatedAt }
     */
    static saveDraft(req, res) {
        try {
            const tenantId = req.tenantId;
            const userId = req.user?.userId;
            const { moduleType: rawModule, patientId, appointmentId: rawAppId, appointment_id: rawAppId2, draftData: rawDraftData, draft_data: rawDraftData2, clientUpdatedAt: rawClientUpdated, client_updated_at: rawClientUpdated2 } = req.body;
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
            const prof = database_1.db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(userId, tenantId);
            const profId = prof?.id || null;
            const resolvedAppId = appointmentId && appointmentId !== 'none' ? String(appointmentId) : null;
            // Validação de concorrência e conflito: previne sobrescrita silenciosa
            const existing = database_1.db.prepare(`
        SELECT id, client_updated_at, updated_at FROM clinical_drafts
        WHERE tenant_id = ? AND patient_id = ? AND module_type = ? AND COALESCE(appointment_id, 'none') = COALESCE(?, 'none')
      `).get(tenantId, patientId, moduleType, resolvedAppId);
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
            const id = existing?.id || `drf-${moduleType}-${(0, uuid_1.v4)().slice(0, 10)}`;
            const draftJson = JSON.stringify(draftData);
            if (existing) {
                database_1.db.prepare(`
          UPDATE clinical_drafts SET
            draft_data_json = ?,
            client_updated_at = ?,
            professional_id = COALESCE(?, professional_id),
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(draftJson, clientUpdatedAt, profId, existing.id, tenantId);
            }
            else {
                database_1.db.prepare(`
          INSERT INTO clinical_drafts (
            id, tenant_id, patient_id, professional_id, appointment_id,
            module_type, draft_data_json, client_updated_at, updated_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(id, tenantId, patientId, profId, resolvedAppId, moduleType, draftJson, clientUpdatedAt);
            }
            // Se for módulo psico, sincroniza com psychology_drafts para retrocompatibilidade
            if (moduleType === 'psico') {
                try {
                    const exPsico = database_1.db.prepare(`
            SELECT id FROM psychology_drafts
            WHERE tenant_id = ? AND patient_id = ? AND COALESCE(appointment_id, 'none') = COALESCE(?, 'none')
          `).get(tenantId, patientId, resolvedAppId);
                    if (exPsico) {
                        database_1.db.prepare(`
              UPDATE psychology_drafts SET
                draft_data_json = ?, client_updated_at = ?, professional_id = COALESCE(?, professional_id), updated_at = datetime('now')
              WHERE id = ? AND tenant_id = ?
            `).run(draftJson, clientUpdatedAt, profId, exPsico.id, tenantId);
                    }
                    else {
                        database_1.db.prepare(`
              INSERT INTO psychology_drafts (
                id, tenant_id, patient_id, professional_id, appointment_id, draft_data_json, client_updated_at, updated_at, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `).run(id, tenantId, patientId, profId, resolvedAppId, draftJson, clientUpdatedAt);
                    }
                }
                catch (_) { }
            }
            res.json({
                success: true,
                message: 'Rascunho clínico salvo com sucesso!',
                id,
                savedAt: new Date().toISOString()
            });
        }
        catch (err) {
            console.error('[ClinicalDraftController.saveDraft]', err);
            res.status(500).json({ error: 'Erro ao salvar rascunho clínico.' });
        }
    }
    /**
     * DELETE /v1/clinical/draft/:moduleType/:patientId
     * Query params: ?appointment_id=...
     */
    static deleteDraft(req, res) {
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
                database_1.db.prepare(`
          DELETE FROM clinical_drafts
          WHERE tenant_id = ? AND patient_id = ? AND module_type = ? AND appointment_id = ?
        `).run(tenantId, patientId, moduleType, appointmentId);
            }
            else {
                database_1.db.prepare(`
          DELETE FROM clinical_drafts
          WHERE tenant_id = ? AND patient_id = ? AND module_type = ?
        `).run(tenantId, patientId, moduleType);
            }
            if (moduleType === 'psico') {
                try {
                    if (appointmentId && appointmentId !== 'none') {
                        database_1.db.prepare('DELETE FROM psychology_drafts WHERE tenant_id = ? AND patient_id = ? AND appointment_id = ?').run(tenantId, patientId, appointmentId);
                    }
                    else {
                        database_1.db.prepare('DELETE FROM psychology_drafts WHERE tenant_id = ? AND patient_id = ?').run(tenantId, patientId);
                    }
                }
                catch (_) { }
            }
            res.json({ success: true, message: 'Rascunho removido com sucesso.' });
        }
        catch (err) {
            console.error('[ClinicalDraftController.deleteDraft]', err);
            res.status(500).json({ error: 'Erro ao remover rascunho clínico.' });
        }
    }
}
exports.ClinicalDraftController = ClinicalDraftController;
