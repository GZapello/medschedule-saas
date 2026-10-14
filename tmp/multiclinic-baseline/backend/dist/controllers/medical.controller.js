"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MedicalController = void 0;
exports.isMedicalProfessionalOrClinicManager = isMedicalProfessionalOrClinicManager;
const medical_payload_1 = require("../services/medical-payload");
const database_1 = require("../config/database");
const uuid_1 = require("uuid");
const audit_middleware_1 = require("../middlewares/audit.middleware");
const service_reminder_service_1 = require("../services/service-reminder.service");
const clinical_controller_1 = require("./clinical.controller");
const capability_service_1 = require("../services/capability.service");
const profession_module_1 = require("../utils/profession-module");
const documents_controller_1 = require("./documents.controller");
function isMedicalProfessionalOrClinicManager(req) {
    if (!req.user || !req.tenantId)
        return false;
    // Papéis estritamente não-clínicos não têm acesso aos prontuários médicos
    const roleStr = req.user.role;
    if (roleStr === 'receptionist' || roleStr === 'financial' || roleStr === 'secretary' || roleStr === 'assistant') {
        return false;
    }
    // SuperAdmin fora do sandbox tem acesso de suporte/auditoria
    if (req.user.role === 'superadmin' && !req.isSandboxSession)
        return true;
    // Validação por capability
    if (capability_service_1.CapabilityService.hasCapability(req.user.userId, req.tenantId, 'MEDICAL_BASE')) {
        return true;
    }
    // Fallback seguro: verifica se o usuário ou o profissional vinculado é médico ou possui ZemdaMed habilitado
    const user = database_1.db.prepare(`
    SELECT u.profession_id, u.profession_name, u.zemda_med_enabled,
           p.profession_id as p_prof_id, pr.slug as p_slug, pr.name as p_name,
           cu.profession_custom, cu.zemda_med_enabled as cu_zemda_med_enabled
    FROM users u
    LEFT JOIN clinic_users cu ON cu.user_id = u.id AND cu.tenant_id = ?
    LEFT JOIN professionals p ON p.user_id = u.id AND p.tenant_id = ?
    LEFT JOIN professions pr ON pr.id = p.profession_id
    WHERE u.id = ?
  `).get(req.tenantId, req.tenantId, req.user.userId);
    if (user) {
        if (user.zemda_med_enabled === 1 || user.cu_zemda_med_enabled === 1)
            return true;
        const profKey = user.p_prof_id || user.profession_id || user.profession_custom || '';
        const profName = user.p_name || user.profession_name || '';
        const resolution = (0, profession_module_1.resolveCanonicalProfession)({ id: profKey, name: profName, slug: user.p_slug });
        if (resolution.commercialModule === 'ZemdaMed' || resolution.canonicalId === 'prof-medico') {
            return true;
        }
    }
    return false;
}
class MedicalController {
    /**
     * 1. Listar consultas médicas do paciente
     */
    static listConsultationsByPatient(req, res) {
        try {
            const patientId = String(req.params.patientId);
            const tenantId = req.tenantId;
            if (!req.user || !tenantId) {
                res.status(401).json({ error: 'Não autorizado' });
                return;
            }
            if (!isMedicalProfessionalOrClinicManager(req)) {
                res.status(403).json({
                    error: 'Acesso restrito: este recurso é exclusivo para médicos cadastrados no ZemdaMed.',
                    code: 'MEDICAL_RESTRICTED'
                });
                return;
            }
            if (!(0, clinical_controller_1.hasClinicalAccess)(req, patientId)) {
                res.status(403).json({
                    error: 'Acesso clínico restrito: profissional sem vínculo assistencial com o paciente (Sigilo LGPD).',
                    code: 'CLINICAL_PRIVACY_RESTRICTION'
                });
                return;
            }
            const stmt = database_1.db.prepare(`
        SELECT mc.*, p.name as professional_name, p.registration_type, p.registration_number
        FROM medical_consultations mc
        LEFT JOIN professionals p ON p.id = mc.professional_id AND p.tenant_id = mc.tenant_id
        WHERE mc.patient_id = ? AND mc.tenant_id = ?
        ORDER BY mc.created_at DESC
      `);
            const rows = stmt.all(patientId, tenantId);
            const consultations = rows.map(medical_payload_1.consultationFromLegacy);
            const records = database_1.db.prepare(`SELECT r.*, p.name AS professional_name FROM records r LEFT JOIN professionals p ON p.id = r.professional_id AND p.tenant_id = r.tenant_id WHERE r.patient_id = ? AND r.tenant_id = ? AND r.module_type = 'ZemdaMed' ORDER BY r.created_at DESC`).all(patientId, tenantId);
            res.json([...consultations, ...records.map(medical_payload_1.consultationFromRecord)].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))));
        }
        catch (err) {
            console.error('[MedicalController.listConsultationsByPatient] Erro:', err);
            res.status(500).json({ error: 'Erro ao listar consultas médicas' });
        }
    }
    /**
     * 2. Obter consulta médica por ID
     */
    static getConsultationById(req, res) {
        try {
            const { id } = req.params;
            const tenantId = req.tenantId;
            if (!req.user || !tenantId) {
                res.status(401).json({ error: 'Não autorizado' });
                return;
            }
            if (!isMedicalProfessionalOrClinicManager(req)) {
                res.status(403).json({ error: 'Acesso restrito ao ZemdaMed' });
                return;
            }
            let row = database_1.db.prepare(`
        SELECT mc.*, p.name as professional_name, p.registration_type, p.registration_number
        FROM medical_consultations mc
        LEFT JOIN professionals p ON p.id = mc.professional_id AND p.tenant_id = mc.tenant_id
        WHERE mc.id = ? AND mc.tenant_id = ?
      `).get(id, tenantId);
            if (!row) {
                const record = database_1.db.prepare("SELECT * FROM records WHERE id = ? AND tenant_id = ? AND module_type = 'ZemdaMed'").get(id, tenantId);
                if (record) {
                    if (!(0, clinical_controller_1.hasClinicalAccess)(req, record.patient_id)) {
                        res.status(403).json({ error: 'Acesso clínico restrito' });
                        return;
                    }
                    res.json((0, medical_payload_1.consultationFromRecord)(record));
                    return;
                }
            }
            if (!row) {
                res.status(404).json({ error: 'Consulta médica não encontrada' });
                return;
            }
            if (!(0, clinical_controller_1.hasClinicalAccess)(req, row.patient_id)) {
                res.status(403).json({ error: 'Acesso clínico restrito' });
                return;
            }
            const consultation = (0, medical_payload_1.consultationFromLegacy)(row);
            res.json(consultation);
        }
        catch (err) {
            console.error('[MedicalController.getConsultationById] Erro:', err);
            res.status(500).json({ error: 'Erro ao obter consulta médica' });
        }
    }
    /**
     * 3. Criar nova consulta médica
     */
    static createConsultation(req, res) {
        try {
            const tenantId = req.tenantId;
            if (!req.user || !tenantId) {
                res.status(401).json({ error: 'Não autorizado' });
                return;
            }
            if (!isMedicalProfessionalOrClinicManager(req)) {
                res.status(403).json({ error: 'Acesso restrito: exclusivo para médicos do ZemdaMed' });
                return;
            }
            const { patientId, appointmentId, specialtyPreset, chiefComplaint, hpi, pastMedicalHistory, familyHistory, habitsLifestyle, vitalSigns, physicalExam, neurologicalExam, diagnosticHypotheses, cidCode, cidDescription, clinicalConduct, soapNotes, returnInDays } = req.body;
            if (!patientId) {
                res.status(400).json({ error: 'patientId é obrigatório' });
                return;
            }
            if (!(0, clinical_controller_1.hasClinicalAccess)(req, patientId)) {
                res.status(403).json({ error: 'Acesso clínico restrito' });
                return;
            }
            if (appointmentId && !database_1.db.prepare('SELECT id FROM appointments WHERE id = ? AND tenant_id = ? AND patient_id = ?').get(appointmentId, tenantId, patientId)) {
                res.status(400).json({ error: 'Agendamento não pertence ao paciente' });
                return;
            }
            if (req.body.professionalId && !database_1.db.prepare('SELECT id FROM professionals WHERE id = ? AND tenant_id = ?').get(req.body.professionalId, tenantId)) {
                res.status(400).json({ error: 'Profissional inválido' });
                return;
            }
            let profId = null;
            if (req.user.role === 'professional') {
                const prof = database_1.db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId);
                if (prof)
                    profId = prof.id;
            }
            else if (req.body.professionalId) {
                profId = req.body.professionalId;
            }
            if (!profId) {
                const fallbackProf = database_1.db.prepare('SELECT id FROM professionals WHERE tenant_id = ? LIMIT 1').get(tenantId);
                profId = fallbackProf?.id || null;
            }
            const id = 'med-cons-' + (0, uuid_1.v4)().slice(0, 8);
            database_1.db.prepare(`
        INSERT INTO medical_consultations (
          id, tenant_id, patient_id, appointment_id, professional_id,
          specialty_preset, chief_complaint, hpi, past_medical_history,
          family_history, habits_lifestyle, vital_signs_json, physical_exam_json,
          neurological_exam_json, diagnostic_hypotheses_json, cid_code,
          cid_description, clinical_conduct, soap_notes_json, return_in_days,
          specialty_notes_json, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, datetime('now'), datetime('now')
        )
      `).run(id, tenantId, patientId, appointmentId || null, profId, specialtyPreset || 'clinica-medica', chiefComplaint || null, hpi || null, pastMedicalHistory || null, familyHistory || null, habitsLifestyle || null, vitalSigns ? JSON.stringify(vitalSigns) : null, physicalExam ? JSON.stringify(physicalExam) : null, neurologicalExam ? JSON.stringify(neurologicalExam) : null, diagnosticHypotheses ? JSON.stringify(diagnosticHypotheses) : null, cidCode || null, cidDescription || null, clinicalConduct || null, soapNotes ? JSON.stringify(soapNotes) : null, returnInDays || null, JSON.stringify((0, medical_payload_1.medicalSpecialtyNotes)(req.body)));
            (0, audit_middleware_1.logAudit)(req, 'CREATE_MEDICAL_CONSULTATION', 'medical_consultations', id, { patientId, specialtyPreset });
            res.status(201).json({ id, message: 'Consulta médica registrada com sucesso' });
        }
        catch (err) {
            console.error('[MedicalController.createConsultation] Erro:', err);
            res.status(500).json({ error: 'Erro ao criar consulta médica' });
        }
    }
    /**
     * 4. Finalizar Consulta Médica (Registrando no Prontuário Geral do Paciente)
     */
    static finishConsultation(req, res) {
        if (req.body.appointmentId && req.body.saveOnly === true) {
            if (!isMedicalProfessionalOrClinicManager(req)) {
                res.status(403).json({ error: 'Acesso restrito ao ZemdaMed' });
                return;
            }
            const body = req.body;
            req.params.id = body.appointmentId;
            req.body = { ...body, evolution: { ...body, moduleType: 'ZemdaMed', moduleData: { ...body }, clinicalEvolution: body.clinicalEvolution || body.conducts || body.clinicalConduct || body.soapNotes?.plan } };
            documents_controller_1.DocumentsController.finishConsultation(req, res);
            return;
        }
        try {
            const tenantId = req.tenantId;
            if (!req.user || !tenantId) {
                res.status(401).json({ error: 'Não autorizado' });
                return;
            }
            if (!isMedicalProfessionalOrClinicManager(req)) {
                res.status(403).json({ error: 'Acesso restrito ao ZemdaMed' });
                return;
            }
            const { patientId, appointmentId, clinicalEvolution, conducts, clinicalConduct, title, specialtyPreset, chiefComplaint, hpi, vitalSigns, physicalExam, neurologicalExam, diagnosticHypotheses, cidCode, cidDescription, soapNotes, returnInDays, sessionDate, sessionTime } = req.body;
            const finalConduct = conducts || clinicalConduct;
            if (!patientId || (!clinicalEvolution && !soapNotes?.plan && !finalConduct)) {
                res.status(400).json({ error: 'patientId e evolução/conduta são obrigatórios' });
                return;
            }
            if (!(0, clinical_controller_1.hasClinicalAccess)(req, patientId)) {
                res.status(403).json({ error: 'Acesso clínico restrito' });
                return;
            }
            if (appointmentId && !database_1.db.prepare('SELECT id FROM appointments WHERE id = ? AND tenant_id = ? AND patient_id = ?').get(appointmentId, tenantId, patientId)) {
                res.status(400).json({ error: 'Agendamento não pertence ao paciente' });
                return;
            }
            if (req.body.professionalId && !database_1.db.prepare('SELECT id FROM professionals WHERE id = ? AND tenant_id = ?').get(req.body.professionalId, tenantId)) {
                res.status(400).json({ error: 'Profissional inválido' });
                return;
            }
            if (appointmentId && database_1.db.prepare('SELECT status FROM appointments WHERE id = ? AND tenant_id = ? AND patient_id = ?').get(appointmentId, tenantId, patientId)?.status === 'completed') {
                res.status(409).json({ error: 'Este atendimento já foi finalizado.' });
                return;
            }
            let profId = null;
            if (req.user.role === 'professional') {
                const prof = database_1.db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId);
                if (prof)
                    profId = prof.id;
            }
            else if (req.body.professionalId) {
                profId = req.body.professionalId;
            }
            if (appointmentId) {
                profId = database_1.db.prepare('SELECT professional_id FROM appointments WHERE id = ? AND tenant_id = ? AND patient_id = ?').get(appointmentId, tenantId, patientId)?.professional_id || profId;
            }
            const creatorName = req.user?.name || req.user?.email || 'Médico(a)';
            const recordId = 'rec-med-' + (0, uuid_1.v4)().slice(0, 8);
            const spDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
            const recDate = sessionDate || spDateStr;
            const recTime = sessionTime || null;
            const recTitle = title || `Consulta Médica — ${specialtyPreset || 'ZemdaMed'}`;
            const fullEvolutionText = clinicalEvolution || (soapNotes ?
                `[SUBJETIVO]\n${soapNotes.subjective || '-'}\n\n[OBJETIVO]\n${soapNotes.objective || '-'}\n\n[AVALIAÇÃO]\n${soapNotes.assessment || '-'}\n\n[PLANO / CONDUTA]\n${soapNotes.plan || '-'}`
                : (finalConduct || 'Consulta médica realizada.'));
            const clinicalPayload = JSON.stringify({
                ...(0, medical_payload_1.medicalSpecialtyNotes)(req.body),
                pastMedicalHistory: req.body.pastMedicalHistory,
                familyHistory: req.body.familyHistory,
                habitsLifestyle: req.body.habitsLifestyle,
                specialtyPreset,
                chiefComplaint,
                hpi,
                vitalSigns,
                physicalExam,
                neurologicalExam,
                diagnosticHypotheses,
                cidCode,
                cidDescription,
                soapNotes,
                returnInDays,
                conducts: finalConduct,
                moduleType: 'ZemdaMed'
            });
            database_1.db.transaction(() => {
                // 1. Grava no Prontuário Geral do Paciente
                database_1.db.prepare(`
          INSERT INTO records (
            id, tenant_id, patient_id, appointment_id, professional_id,
            session_date, title, clinical_evolution, technical_notes, is_sealed, module_type,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'ZemdaMed', datetime('now'), datetime('now'))
        `).run(recordId, tenantId, patientId, appointmentId || null, profId, recDate, recTitle, fullEvolutionText, clinicalPayload);
                // 2. Se houver appointmentId, atualiza status do agendamento
                if (appointmentId) {
                    database_1.db.prepare(`
            UPDATE appointments
            SET status = 'completed', clinical_module = 'ZemdaMed', updated_at = datetime('now')
            WHERE id = ? AND tenant_id = ?
          `).run(appointmentId, tenantId);
                }
                database_1.db.prepare(`
          DELETE FROM clinical_drafts
          WHERE tenant_id = ? AND patient_id = ? AND module_type = 'medical'
            AND COALESCE(NULLIF(appointment_id, ''), 'none') = ?
        `).run(tenantId, patientId, appointmentId || 'none');
            })();
            (0, audit_middleware_1.logAudit)(req, 'FINISH_MEDICAL_CONSULTATION', 'records', recordId, { patientId, recordId, specialtyPreset });
            if (appointmentId) {
                try {
                    service_reminder_service_1.ServiceReminderService.onAppointmentCompleted(appointmentId, tenantId);
                }
                catch (reminderErr) {
                    console.warn('[finishConsultation] Aviso ao gerar lembrete de retorno médico:', reminderErr);
                }
            }
            res.status(201).json({
                recordId,
                message: 'Consulta médica finalizada com sucesso e gravada no prontuário do paciente'
            });
        }
        catch (err) {
            console.error('[MedicalController.finishConsultation] Erro:', err);
            res.status(500).json({ error: 'Erro ao finalizar consulta médica' });
        }
    }
}
exports.MedicalController = MedicalController;
