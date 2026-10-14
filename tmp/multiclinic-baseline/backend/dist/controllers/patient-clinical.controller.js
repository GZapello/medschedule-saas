"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatientClinicalController = void 0;
const database_1 = require("../config/database");
const uuid_1 = require("uuid");
const crypto_1 = __importDefault(require("crypto"));
const audit_middleware_1 = require("../middlewares/audit.middleware");
const clinical_controller_1 = require("./clinical.controller");
const consent_access_1 = require("../utils/consent-access");
class PatientClinicalController {
    // 1. LINHA DO TEMPO CRONOLÓGICA 360° DO PACIENTE
    static getTimeline(req, res) {
        try {
            const patientId = req.params.id;
            const tenantId = req.tenantId;
            const { type, startDate, endDate, professionalId, search } = req.query;
            if (!tenantId) {
                res.status(400).json({ error: 'Tenant obrigatório' });
                return;
            }
            if (!(0, clinical_controller_1.hasClinicalAccess)(req, patientId)) {
                res.status(403).json({
                    error: 'Acesso clínico restrito: profissional não possui consulta agendada, histórico de atendimento ou encaminhamento ativo vinculado a este paciente (Sigilo LGPD).',
                    code: 'CLINICAL_PRIVACY_RESTRICTION'
                });
                return;
            }
            const timeline = [];
            // A. Consultas / Agendamentos
            const apptsStmt = database_1.db.prepare(`
        SELECT 
          a.id, a.appointment_number, a.start_time as date, a.status, a.modality,
          a.patient_notes, a.internal_notes, a.cancellation_reason, a.cancellation_reason_category,
          p.name as professional_name, p.id as professional_id,
          s.name as service_name,
          ci.name as insurance_name
        FROM appointments a
        JOIN professionals p ON p.id = a.professional_id
        JOIN services s ON s.id = a.service_id
        LEFT JOIN clinic_insurances ci ON ci.id = a.insurance_id
        WHERE a.patient_id = ? AND a.tenant_id = ?
      `);
            const appts = apptsStmt.all(patientId, tenantId);
            for (const a of appts) {
                timeline.push({
                    id: a.id,
                    type: 'appointment',
                    title: `Consulta: ${a.service_name}`,
                    description: `Status: ${a.status} | Modalidade: ${a.modality || 'Presencial'} | Convênio: ${a.insurance_name || 'Particular'}`,
                    details: {
                        appointmentNumber: a.appointment_number,
                        status: a.status,
                        modality: a.modality,
                        notes: a.internal_notes || a.patient_notes,
                        cancellationReason: a.cancellation_reason,
                        cancellationCategory: a.cancellation_reason_category,
                        insuranceName: a.insurance_name
                    },
                    professionalName: a.professional_name,
                    professionalId: a.professional_id,
                    date: a.date
                });
            }
            // B. Prontuários e Evoluções Médicas
            const recordsStmt = database_1.db.prepare(`
        SELECT 
          r.id, r.session_date as date, r.title, r.clinical_evolution, r.technical_notes,
          r.is_sealed, r.created_at,
          p.name as professional_name, p.id as professional_id
        FROM records r
        JOIN professionals p ON p.id = r.professional_id
        WHERE r.patient_id = ? AND r.tenant_id = ?
      `);
            const records = recordsStmt.all(patientId, tenantId);
            for (const r of records) {
                timeline.push({
                    id: r.id,
                    type: 'medical_record',
                    title: r.title || 'Evolução Clínica',
                    description: r.clinical_evolution ? r.clinical_evolution.slice(0, 160) + (r.clinical_evolution.length > 160 ? '...' : '') : 'Registro clínico sem evolução textual',
                    details: {
                        title: r.title,
                        clinicalEvolution: r.clinical_evolution,
                        technicalNotes: r.technical_notes,
                        isSealed: Boolean(r.is_sealed)
                    },
                    professionalName: r.professional_name,
                    professionalId: r.professional_id,
                    date: r.date || r.created_at
                });
            }
            // C. Anamneses Respondidas
            const anamnesisStmt = database_1.db.prepare(`
        SELECT 
          pa.id, pa.title, pa.version, pa.created_at as date,
          p.name as professional_name, p.id as professional_id
        FROM patient_anamnesis pa
        LEFT JOIN professionals p ON p.id = pa.professional_id
        WHERE pa.patient_id = ? AND pa.tenant_id = ?
      `);
            const anamneses = anamnesisStmt.all(patientId, tenantId);
            for (const an of anamneses) {
                timeline.push({
                    id: an.id,
                    type: 'anamnesis',
                    title: `Anamnese v${an.version}: ${an.title}`,
                    description: `Avaliação clínica preenchida (versão ${an.version})`,
                    details: { version: an.version },
                    professionalName: an.professional_name || 'Profissional da Clínica',
                    professionalId: an.professional_id,
                    date: an.date
                });
            }
            // D. Atestados Médicos
            const certsStmt = database_1.db.prepare(`
        SELECT 
          c.id, c.certificate_type, c.days_off, c.start_date, c.created_at as date,
          p.name as professional_name, p.id as professional_id
        FROM clinical_certificates c
        JOIN professionals p ON p.id = c.professional_id
        WHERE c.patient_id = ? AND c.tenant_id = ?
      `);
            const certs = certsStmt.all(patientId, tenantId);
            for (const c of certs) {
                timeline.push({
                    id: c.id,
                    type: 'certificate',
                    title: `Atestado: ${c.certificate_type === 'rest' ? 'Afastamento' : c.certificate_type === 'attendance' ? 'Comparecimento' : 'Aptidão Física'}`,
                    description: c.days_off ? `${c.days_off} dias de repouso a partir de ${c.start_date || 'hoje'}` : 'Comprovante de atendimento emitido',
                    details: c,
                    professionalName: c.professional_name,
                    professionalId: c.professional_id,
                    date: c.date
                });
            }
            // E. Receituários
            const prescStmt = database_1.db.prepare(`
        SELECT 
          pr.id, pr.prescription_type, pr.content, pr.created_at as date,
          p.name as professional_name, p.id as professional_id
        FROM clinical_prescriptions pr
        JOIN professionals p ON p.id = pr.professional_id
        WHERE pr.patient_id = ? AND pr.tenant_id = ?
      `);
            const prescriptions = prescStmt.all(patientId, tenantId);
            for (const pr of prescriptions) {
                timeline.push({
                    id: pr.id,
                    type: 'prescription',
                    title: `Receituário (${pr.prescription_type === 'control' ? 'Controle Especial' : 'Simples'})`,
                    description: pr.content ? pr.content.slice(0, 140) + '...' : 'Prescrição médica emitida',
                    details: pr,
                    professionalName: pr.professional_name,
                    professionalId: pr.professional_id,
                    date: pr.date
                });
            }
            // F. Solicitações de Exames
            const examReqStmt = database_1.db.prepare(`
        SELECT 
          er.id, er.exams_list, er.clinical_indication, er.created_at as date,
          p.name as professional_name, p.id as professional_id
        FROM clinical_exam_requests er
        JOIN professionals p ON p.id = er.professional_id
        WHERE er.patient_id = ? AND er.tenant_id = ?
      `);
            const examReqs = examReqStmt.all(patientId, tenantId);
            for (const er of examReqs) {
                timeline.push({
                    id: er.id,
                    type: 'exam_request',
                    title: 'Solicitação de Exames',
                    description: er.exams_list ? er.exams_list.slice(0, 140) : 'Pedido de exame laboratorial/imagem',
                    details: er,
                    professionalName: er.professional_name,
                    professionalId: er.professional_id,
                    date: er.date
                });
            }
            // G. Exames e Arquivos Anexados
            const examsStmt = database_1.db.prepare(`
        SELECT 
          pe.id, pe.title, pe.exam_date as date, pe.exam_type, pe.file_name, pe.file_url, pe.ai_extracted_text, pe.ai_reviewed,
          p.name as professional_name, p.id as professional_id
        FROM patient_exams pe
        LEFT JOIN professionals p ON p.id = pe.professional_id
        WHERE pe.patient_id = ? AND pe.tenant_id = ?
      `);
            const exams = examsStmt.all(patientId, tenantId);
            for (const ex of exams) {
                timeline.push({
                    id: ex.id,
                    type: 'exam_file',
                    title: `Exame: ${ex.title}`,
                    description: `Tipo: ${ex.exam_type || 'Geral'} | Arquivo: ${ex.file_name || 'Anexo'}`,
                    details: ex,
                    professionalName: ex.professional_name || 'Exame Externo / Laboratório',
                    professionalId: ex.professional_id,
                    date: ex.date || new Date().toISOString()
                });
            }
            // H. Termos de Consentimento
            const consentsStmt = database_1.db.prepare(`
        SELECT 
          cs.id, cs.title, cs.consent_type, cs.accepted_at as signed_at,
          CASE WHEN cs.template_version_id IS NOT NULL THEN COALESCE(cs.accepted_at,cs.created_at) ELSE cs.accepted_at END as date,
          (cs.revoked_at IS NOT NULL OR ci.id IS NOT NULL) as is_revoked,
          p.name as professional_name, p.id as professional_id
        FROM patient_consents cs
        LEFT JOIN professionals p ON p.id = cs.professional_id
        LEFT JOIN consent_invalidations ci ON ci.consent_id=cs.id
        WHERE cs.patient_id = ? AND cs.tenant_id = ? AND (?=1 OR cs.template_version_id IS NULL)
      `);
            const consents = consentsStmt.all(patientId, tenantId, (0, consent_access_1.hasConsentAccess)(req, patientId) ? 1 : 0);
            for (const cs of consents.filter(cs => (0, consent_access_1.hasConsentDocumentAccess)(req, cs.id))) {
                timeline.push({
                    id: cs.id,
                    type: 'consent',
                    title: `Consentimento: ${cs.title}`,
                    description: cs.is_revoked ? 'Cancelado/invalidado — histórico preservado' : cs.signed_at ? `Assinado em ${new Date(cs.signed_at).toLocaleDateString('pt-BR')}` : 'Aguardando assinatura',
                    details: cs,
                    professionalName: cs.professional_name || 'Clínica',
                    professionalId: cs.professional_id,
                    date: cs.date
                });
            }
            // Filtros em memória
            let filtered = timeline;
            if (type && typeof type === 'string' && type !== 'all') {
                filtered = filtered.filter(item => item.type === type);
            }
            if (professionalId && typeof professionalId === 'string' && professionalId !== 'all') {
                filtered = filtered.filter(item => item.professionalId === professionalId);
            }
            if (startDate && typeof startDate === 'string') {
                filtered = filtered.filter(item => item.date && item.date >= startDate);
            }
            if (endDate && typeof endDate === 'string') {
                filtered = filtered.filter(item => item.date && item.date <= endDate);
            }
            if (search && typeof search === 'string' && search.trim().length > 0) {
                const term = search.toLowerCase().trim();
                filtered = filtered.filter(item => (item.title && item.title.toLowerCase().includes(term)) ||
                    (item.description && item.description.toLowerCase().includes(term)) ||
                    (item.professionalName && item.professionalName.toLowerCase().includes(term)));
            }
            // Ordena por data decrescente
            filtered.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
            (0, audit_middleware_1.logAudit)(req, 'VIEW_PATIENT_TIMELINE', 'patients', patientId, { totalEvents: filtered.length });
            res.json(filtered);
        }
        catch (err) {
            console.error('[PatientClinicalController.getTimeline] Erro:', err);
            res.status(500).json({ error: 'Erro ao gerar linha do tempo do paciente' });
        }
    }
    // 2. ALERGIAS
    static listAllergies(req, res) {
        try {
            const { id: patientId } = req.params;
            const tenantId = req.tenantId;
            const patient = database_1.db.prepare('SELECT allergies_status FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId);
            const allergies = database_1.db.prepare(`
        SELECT * FROM patient_allergies
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY created_at DESC
      `).all(patientId, tenantId);
            res.json({
                allergiesStatus: patient?.allergies_status || 'not_informed',
                allergies
            });
        }
        catch (err) {
            console.error('[PatientClinicalController.listAllergies] Erro:', err);
            res.status(500).json({ error: 'Erro ao listar alergias do paciente' });
        }
    }
    static updateAllergyStatus(req, res) {
        try {
            const { id: patientId } = req.params;
            const tenantId = req.tenantId;
            const { status } = req.body; // 'not_informed', 'none_known', 'has_allergies'
            if (!['not_informed', 'none_known', 'has_allergies'].includes(status)) {
                res.status(400).json({ error: 'Status de alergia inválido' });
                return;
            }
            database_1.db.prepare(`
        UPDATE patients SET allergies_status = ?, updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(status, patientId, tenantId);
            (0, audit_middleware_1.logAudit)(req, 'UPDATE_ALLERGY_STATUS', 'patients', patientId, { status });
            res.json({ message: 'Status de alergia atualizado com sucesso', status });
        }
        catch (err) {
            console.error('[PatientClinicalController.updateAllergyStatus] Erro:', err);
            res.status(500).json({ error: 'Erro ao atualizar status de alergia' });
        }
    }
    static addAllergy(req, res) {
        try {
            const { id: patientId } = req.params;
            const tenantId = req.tenantId;
            const { substance, reactionType, severity, notes, identifiedAt } = req.body;
            if (!substance) {
                res.status(400).json({ error: 'Substância/Alergeno é obrigatório' });
                return;
            }
            const id = 'alg-' + (0, uuid_1.v4)().slice(0, 8);
            database_1.db.prepare(`
        INSERT INTO patient_allergies (id, tenant_id, patient_id, substance, reaction_type, severity, notes, identified_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, tenantId, patientId, substance, reactionType || null, severity || 'moderate', notes || null, identifiedAt || null);
            // Marca paciente com has_allergies
            database_1.db.prepare(`
        UPDATE patients SET allergies_status = 'has_allergies', updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(patientId, tenantId);
            (0, audit_middleware_1.logAudit)(req, 'ADD_ALLERGY', 'patient_allergies', id, { patientId, substance, severity });
            res.status(201).json({ id, message: 'Alergia registrada com sucesso' });
        }
        catch (err) {
            console.error('[PatientClinicalController.addAllergy] Erro:', err);
            res.status(500).json({ error: 'Erro ao cadastrar alergia' });
        }
    }
    static updateAllergy(req, res) {
        try {
            const { id: patientId, allergyId } = req.params;
            const tenantId = req.tenantId;
            const { substance, reactionType, severity, notes, identifiedAt } = req.body;
            database_1.db.prepare(`
        UPDATE patient_allergies SET
          substance = COALESCE(?, substance),
          reaction_type = COALESCE(?, reaction_type),
          severity = COALESCE(?, severity),
          notes = COALESCE(?, notes),
          identified_at = COALESCE(?, identified_at),
          updated_at = datetime('now')
        WHERE id = ? AND patient_id = ? AND tenant_id = ?
      `).run(substance || null, reactionType || null, severity || null, notes || null, identifiedAt || null, allergyId, patientId, tenantId);
            (0, audit_middleware_1.logAudit)(req, 'UPDATE_ALLERGY', 'patient_allergies', allergyId, { patientId, substance });
            res.json({ message: 'Alergia atualizada com sucesso' });
        }
        catch (err) {
            console.error('[PatientClinicalController.updateAllergy] Erro:', err);
            res.status(500).json({ error: 'Erro ao atualizar alergia' });
        }
    }
    static deleteAllergy(req, res) {
        try {
            const { id: patientId, allergyId } = req.params;
            const tenantId = req.tenantId;
            database_1.db.prepare('DELETE FROM patient_allergies WHERE id = ? AND patient_id = ? AND tenant_id = ?').run(allergyId, patientId, tenantId);
            const count = database_1.db.prepare('SELECT COUNT(*) as c FROM patient_allergies WHERE patient_id = ? AND tenant_id = ?').get(patientId, tenantId)?.c || 0;
            if (count === 0) {
                database_1.db.prepare("UPDATE patients SET allergies_status = 'none_known' WHERE id = ? AND tenant_id = ?").run(patientId, tenantId);
            }
            (0, audit_middleware_1.logAudit)(req, 'DELETE_ALLERGY', 'patient_allergies', allergyId, { patientId });
            res.json({ message: 'Alergia removida com sucesso' });
        }
        catch (err) {
            console.error('[PatientClinicalController.deleteAllergy] Erro:', err);
            res.status(500).json({ error: 'Erro ao remover alergia' });
        }
    }
    // 3. MEDICAMENTOS
    static listMedications(req, res) {
        try {
            const { id: patientId } = req.params;
            const tenantId = req.tenantId;
            const medications = database_1.db.prepare(`
        SELECT * FROM patient_medications
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY status ASC, created_at DESC
      `).all(patientId, tenantId);
            res.json(medications);
        }
        catch (err) {
            console.error('[PatientClinicalController.listMedications] Erro:', err);
            res.status(500).json({ error: 'Erro ao listar medicamentos' });
        }
    }
    static addMedication(req, res) {
        try {
            const { id: patientId } = req.params;
            const tenantId = req.tenantId;
            const { medicationName, dosage, frequency, route, startDate, endDate, status, prescriberName, notes } = req.body;
            if (!medicationName) {
                res.status(400).json({ error: 'Nome do medicamento é obrigatório' });
                return;
            }
            const id = 'med-' + (0, uuid_1.v4)().slice(0, 8);
            database_1.db.prepare(`
        INSERT INTO patient_medications (
          id, tenant_id, patient_id, medication_name, dosage, frequency,
          route, start_date, end_date, status, prescriber_name, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, tenantId, patientId, medicationName, dosage || null, frequency || null, route || 'oral', startDate || null, endDate || null, status || 'active', prescriberName || null, notes || null);
            (0, audit_middleware_1.logAudit)(req, 'ADD_MEDICATION', 'patient_medications', id, { patientId, medicationName });
            res.status(201).json({ id, message: 'Medicamento registrado com sucesso' });
        }
        catch (err) {
            console.error('[PatientClinicalController.addMedication] Erro:', err);
            res.status(500).json({ error: 'Erro ao adicionar medicamento' });
        }
    }
    static updateMedication(req, res) {
        try {
            const { id: patientId, medicationId } = req.params;
            const tenantId = req.tenantId;
            const { dosage, frequency, route, startDate, endDate, status, prescriberName, notes } = req.body;
            database_1.db.prepare(`
        UPDATE patient_medications SET
          dosage = COALESCE(?, dosage),
          frequency = COALESCE(?, frequency),
          route = COALESCE(?, route),
          start_date = COALESCE(?, start_date),
          end_date = COALESCE(?, end_date),
          status = COALESCE(?, status),
          prescriber_name = COALESCE(?, prescriber_name),
          notes = COALESCE(?, notes),
          updated_at = datetime('now')
        WHERE id = ? AND patient_id = ? AND tenant_id = ?
      `).run(dosage, frequency, route, startDate, endDate, status, prescriberName, notes, medicationId, patientId, tenantId);
            (0, audit_middleware_1.logAudit)(req, 'UPDATE_MEDICATION', 'patient_medications', medicationId, { patientId, status });
            res.json({ message: 'Medicamento atualizado com sucesso' });
        }
        catch (err) {
            console.error('[PatientClinicalController.updateMedication] Erro:', err);
            res.status(500).json({ error: 'Erro ao atualizar medicamento' });
        }
    }
    static deleteMedication(req, res) {
        try {
            const { id: patientId, medicationId } = req.params;
            const tenantId = req.tenantId;
            database_1.db.prepare('DELETE FROM patient_medications WHERE id = ? AND patient_id = ? AND tenant_id = ?').run(medicationId, patientId, tenantId);
            (0, audit_middleware_1.logAudit)(req, 'DELETE_MEDICATION', 'patient_medications', medicationId, { patientId });
            res.json({ message: 'Medicamento removido com sucesso' });
        }
        catch (err) {
            console.error('[PatientClinicalController.deleteMedication] Erro:', err);
            res.status(500).json({ error: 'Erro ao remover medicamento' });
        }
    }
    // 4. ANAMNESE VERSIONADA
    static listAnamnesis(req, res) {
        try {
            const patientId = req.params.id;
            const tenantId = req.tenantId;
            if (!(0, clinical_controller_1.hasClinicalAccess)(req, patientId)) {
                res.status(403).json({
                    error: 'Acesso clínico restrito: sem vínculo assistencial ativo com o paciente (Sigilo LGPD).',
                    code: 'CLINICAL_PRIVACY_RESTRICTION'
                });
                return;
            }
            const items = database_1.db.prepare(`
        SELECT
          pa.*,
          COALESCE(pa.questionnaire_answers_json, pa.content_json) as questionnaire_answers_json,
          COALESCE(pa.content_json, pa.questionnaire_answers_json) as content_json,
          p.name as professional_name
        FROM patient_anamnesis pa
        LEFT JOIN professionals p ON p.id = pa.professional_id
        WHERE pa.patient_id = ? AND pa.tenant_id = ?
        ORDER BY pa.version DESC
      `).all(patientId, tenantId);
            res.json(items);
        }
        catch (err) {
            console.error('[PatientClinicalController.listAnamnesis] Erro:', err);
            res.status(500).json({ error: 'Erro ao listar anamneses' });
        }
    }
    static getAnamnesisById(req, res) {
        try {
            const patientId = req.params.id;
            const anamnesisId = req.params.anamnesisId;
            const tenantId = req.tenantId;
            if (!(0, clinical_controller_1.hasClinicalAccess)(req, patientId)) {
                res.status(403).json({ error: 'Acesso clínico restrito (Sigilo LGPD)' });
                return;
            }
            const item = database_1.db.prepare(`
        SELECT
          pa.*,
          COALESCE(pa.questionnaire_answers_json, pa.content_json) as questionnaire_answers_json,
          COALESCE(pa.content_json, pa.questionnaire_answers_json) as content_json,
          p.name as professional_name
        FROM patient_anamnesis pa
        LEFT JOIN professionals p ON p.id = pa.professional_id
        WHERE pa.id = ? AND pa.patient_id = ? AND pa.tenant_id = ?
      `).get(anamnesisId, patientId, tenantId);
            if (!item) {
                res.status(404).json({ error: 'Anamnese não encontrada' });
                return;
            }
            res.json(item);
        }
        catch (err) {
            console.error('[PatientClinicalController.getAnamnesisById] Erro:', err);
            res.status(500).json({ error: 'Erro ao carregar anamnese' });
        }
    }
    static createAnamnesis(req, res) {
        try {
            const patientId = req.params.id;
            const tenantId = req.tenantId;
            const { title, questionnaireAnswersJson, professionalId, notes } = req.body;
            if (!(0, clinical_controller_1.hasClinicalAccess)(req, patientId)) {
                res.status(403).json({ error: 'Acesso clínico restrito (Sigilo LGPD)' });
                return;
            }
            if (!title || !questionnaireAnswersJson) {
                res.status(400).json({ error: 'Título e questionário respondido são obrigatórios' });
                return;
            }
            // Calcula próxima versão
            const maxVersionRow = database_1.db.prepare(`
        SELECT MAX(version) as max_v FROM patient_anamnesis
        WHERE patient_id = ? AND tenant_id = ?
      `).get(patientId, tenantId);
            const nextVersion = (maxVersionRow?.max_v || 0) + 1;
            const id = 'anm-' + (0, uuid_1.v4)().slice(0, 8);
            let resolvedProfId = professionalId;
            if (!resolvedProfId && req.user) {
                const prof = database_1.db.prepare('SELECT id FROM professionals WHERE user_id = ?').get(req.user.userId);
                if (prof)
                    resolvedProfId = prof.id;
            }
            const answersStr = typeof questionnaireAnswersJson === 'string'
                ? questionnaireAnswersJson
                : JSON.stringify(questionnaireAnswersJson);
            database_1.db.prepare(`
        INSERT INTO patient_anamnesis (
          id, tenant_id, patient_id, professional_id, version, title, content_json, questionnaire_answers_json, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, tenantId, patientId, resolvedProfId || null, nextVersion, title, answersStr, answersStr, notes || null);
            (0, audit_middleware_1.logAudit)(req, 'CREATE_ANAMNESIS', 'patient_anamnesis', id, { patientId, version: nextVersion });
            res.status(201).json({ id, version: nextVersion, message: `Anamnese versão ${nextVersion} salva com sucesso` });
        }
        catch (err) {
            console.error('[PatientClinicalController.createAnamnesis] Erro:', err);
            res.status(500).json({ error: 'Erro ao salvar anamnese' });
        }
    }
    // 5. EXAMES E IMAGENS COM EXTRAÇÃO IA EM DRAFT
    static listExams(req, res) {
        try {
            const patientId = req.params.id;
            const tenantId = req.tenantId;
            if (!(0, clinical_controller_1.hasClinicalAccess)(req, patientId)) {
                res.status(403).json({ error: 'Acesso clínico restrito (Sigilo LGPD)' });
                return;
            }
            const exams = database_1.db.prepare(`
        SELECT pe.*, p.name as professional_name
        FROM patient_exams pe
        LEFT JOIN professionals p ON p.id = pe.professional_id
        WHERE pe.patient_id = ? AND pe.tenant_id = ?
        ORDER BY pe.exam_date DESC, pe.created_at DESC
      `).all(patientId, tenantId);
            res.json(exams);
        }
        catch (err) {
            console.error('[PatientClinicalController.listExams] Erro:', err);
            res.status(500).json({ error: 'Erro ao listar exames' });
        }
    }
    static uploadExam(req, res) {
        try {
            const patientId = req.params.id;
            const tenantId = req.tenantId;
            const { title, examDate, examType, fileName, fileUrl, fileType, rawText, professionalId, notes } = req.body;
            if (!(0, clinical_controller_1.hasClinicalAccess)(req, patientId)) {
                res.status(403).json({ error: 'Acesso clínico restrito (Sigilo LGPD)' });
                return;
            }
            if (!title || !fileUrl) {
                res.status(400).json({ error: 'Título do exame e arquivo são obrigatórios' });
                return;
            }
            const id = 'exm-' + (0, uuid_1.v4)().slice(0, 8);
            // Simulação estruturada de IA para extração de dados clínicos (Draft para conferência médica)
            let aiDraftText = rawText || '';
            if (!aiDraftText && fileName) {
                aiDraftText = `[Rascunho de IA para revisão médica]: Documento identificado como "${fileName}". Parâmetros principais aguardando validação do profissional de saúde.`;
            }
            database_1.db.prepare(`
        INSERT INTO patient_exams (
          id, tenant_id, patient_id, appointment_id, professional_id,
          title, exam_date, exam_type, file_url, file_name, file_type,
          ai_extracted_text, ai_reviewed, notes
        )
        VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `).run(id, tenantId, patientId, professionalId || null, title, examDate || new Date().toISOString().split('T')[0], examType || 'Laboratorial', fileUrl, fileName || 'arquivo_anexo', fileType || 'application/pdf', aiDraftText, notes || null);
            (0, audit_middleware_1.logAudit)(req, 'UPLOAD_PATIENT_EXAM', 'patient_exams', id, { patientId, title, fileName });
            res.status(201).json({ id, aiExtractedText: aiDraftText, message: 'Exame anexado com sucesso' });
        }
        catch (err) {
            console.error('[PatientClinicalController.uploadExam] Erro:', err);
            res.status(500).json({ error: 'Erro ao anexar exame' });
        }
    }
    static reviewExam(req, res) {
        try {
            const patientId = req.params.id;
            const examId = req.params.examId;
            const tenantId = req.tenantId;
            const { aiExtractedText, notes } = req.body;
            if (!(0, clinical_controller_1.hasClinicalAccess)(req, patientId)) {
                res.status(403).json({ error: 'Acesso clínico restrito (Sigilo LGPD)' });
                return;
            }
            database_1.db.prepare(`
        UPDATE patient_exams SET
          ai_extracted_text = COALESCE(?, ai_extracted_text),
          ai_reviewed = 1,
          notes = COALESCE(?, notes),
          updated_at = datetime('now')
        WHERE id = ? AND patient_id = ? AND tenant_id = ?
      `).run(aiExtractedText || null, notes || null, examId, patientId, tenantId);
            (0, audit_middleware_1.logAudit)(req, 'REVIEW_PATIENT_EXAM', 'patient_exams', examId, { patientId });
            res.json({ message: 'Extração de exame revisada e validada pelo profissional' });
        }
        catch (err) {
            console.error('[PatientClinicalController.reviewExam] Erro:', err);
            res.status(500).json({ error: 'Erro ao revisar laudo do exame' });
        }
    }
    static deleteExam(req, res) {
        try {
            const { id: patientId, examId } = req.params;
            const tenantId = req.tenantId;
            database_1.db.prepare('DELETE FROM patient_exams WHERE id = ? AND patient_id = ? AND tenant_id = ?').run(examId, patientId, tenantId);
            (0, audit_middleware_1.logAudit)(req, 'DELETE_PATIENT_EXAM', 'patient_exams', examId, { patientId });
            res.json({ message: 'Exame removido com sucesso' });
        }
        catch (err) {
            console.error('[PatientClinicalController.deleteExam] Erro:', err);
            res.status(500).json({ error: 'Erro ao excluir exame' });
        }
    }
    // 6. TERMOS DE CONSENTIMENTO
    static listConsents(req, res) {
        try {
            const { id: patientId } = req.params;
            const tenantId = req.tenantId;
            if (!(0, consent_access_1.hasConsentAccess)(req, String(patientId))) {
                res.status(403).json({ error: 'Sem vínculo clínico autorizado com este paciente.' });
                return;
            }
            // Aliases mantêm o contrato que o front-end já consome (cs.content, cs.signed_by_name,
            // cs.signed_at, cs.is_revoked) apesar dos nomes reais das colunas serem outros
            // (content_text/accepted_by_name/accepted_at/revoked_at — ver migração em database.ts).
            const consents = database_1.db.prepare(`
        SELECT pc.*, p.name as professional_name,
               pc.content_text as content, pc.accepted_by_name as signed_by_name,
               pc.accepted_at as signed_at, (pc.revoked_at IS NOT NULL) as is_revoked
        FROM patient_consents pc
        LEFT JOIN professionals p ON p.id = pc.professional_id
        WHERE pc.patient_id = ? AND pc.tenant_id = ?
        ORDER BY pc.accepted_at DESC
      `).all(patientId, tenantId);
            res.json(consents.filter(c => (0, consent_access_1.hasConsentDocumentAccess)(req, c.id)));
        }
        catch (err) {
            console.error('[PatientClinicalController.listConsents] Erro:', err);
            res.status(500).json({ error: 'Erro ao listar termos de consentimento' });
        }
    }
    static createConsent(req, res) {
        try {
            const { id: patientId } = req.params;
            const tenantId = req.tenantId;
            if (!(0, consent_access_1.hasConsentAccess)(req, String(patientId))) {
                res.status(403).json({ error: 'Sem vínculo clínico autorizado com este paciente.' });
                return;
            }
            const { title, consentType, content, signatureDataUrl, signedByName, signedByCpf, professionalId, modality, professionId, professionName, metadata } = req.body;
            if (!title || !content) {
                res.status(400).json({ error: 'Título e conteúdo do termo são obrigatórios' });
                return;
            }
            // Resolve profissional responsável se não fornecido
            let resolvedProfId = professionalId || null;
            let resolvedProfName = null;
            let resolvedProfessionName = professionName || null;
            if (!resolvedProfId && req.user?.role === 'professional') {
                const prof = database_1.db.prepare(`
          SELECT p.id, p.name, pr.name as profession_name
          FROM professionals p
          LEFT JOIN professions pr ON pr.id = p.profession_id
          WHERE p.user_id = ? AND p.tenant_id = ?
        `).get(req.user.userId, tenantId);
                if (prof) {
                    resolvedProfId = prof.id;
                    resolvedProfName = prof.name;
                    resolvedProfessionName = resolvedProfessionName || prof.profession_name;
                }
            }
            const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || null;
            const userAgent = req.headers['user-agent'] || null;
            const nowIso = new Date().toISOString();
            const id = 'cst-' + (0, uuid_1.v4)().slice(0, 8);
            const metadataObj = {
                ...(typeof metadata === 'object' ? metadata : {}),
                ip: clientIp,
                userAgent,
                signedAt: nowIso,
                modality: modality || 'telehealth',
                termsVersion: '2026.1'
            };
            const hashPayload = `${tenantId}|${patientId}|${resolvedProfId || ''}|${title}|${consentType || 'telehealth'}|${nowIso}|${clientIp || ''}`;
            const signatureHash = crypto_1.default.createHash('sha256').update(hashPayload).digest('hex');
            database_1.db.prepare(`
        INSERT INTO patient_consents (
          id, tenant_id, patient_id, professional_id, title, consent_type, content_text,
          signature_data_url, accepted_by_name, signed_by_cpf, accepted_at,
          modality, profession_id, profession_name, ip_address, user_agent,
          metadata_json, signature_hash
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?)
      `).run(id, tenantId, patientId, resolvedProfId, title, consentType || 'telehealth', content, signatureDataUrl || null, signedByName || 'Paciente / Responsável', signedByCpf || null, modality || 'telehealth', professionId || null, resolvedProfessionName, clientIp, userAgent, JSON.stringify(metadataObj), signatureHash);
            (0, audit_middleware_1.logAudit)(req, 'CREATE_PATIENT_CONSENT', 'patient_consents', id, { patientId, title, consentType, modality, signatureHash });
            res.status(201).json({
                id,
                signatureHash,
                signedAt: nowIso,
                modality: modality || 'telehealth',
                professionName: resolvedProfessionName,
                message: 'Termo de consentimento registrado com sucesso'
            });
        }
        catch (err) {
            console.error('[PatientClinicalController.createConsent] Erro:', err);
            res.status(500).json({ error: 'Erro ao registrar consentimento' });
        }
    }
    // Revogação de termo de consentimento (LGPD art. 8º, §5º / item 2.5 do checklist).
    // Nunca apagamos a linha: apenas marcamos revoked_at/revoked_by, pois o registro de que o
    // consentimento existiu e foi revogado também é parte do rastro exigido pela LGPD.
    static revokeConsent(req, res) {
        try {
            const patientId = req.params.patientId;
            const consentId = req.params.consentId;
            const tenantId = req.tenantId;
            if (!tenantId) {
                res.status(400).json({ error: 'Tenant obrigatório' });
                return;
            }
            if (!(0, clinical_controller_1.hasClinicalAccess)(req, patientId)) {
                res.status(403).json({
                    error: 'Acesso clínico restrito: profissional não possui vínculo assistencial com este paciente (Sigilo LGPD).',
                    code: 'CLINICAL_PRIVACY_RESTRICTION'
                });
                return;
            }
            const consent = database_1.db.prepare('SELECT id, revoked_at, template_version_id FROM patient_consents WHERE id = ? AND patient_id = ? AND tenant_id = ?').get(consentId, patientId, tenantId);
            if (!consent) {
                res.status(404).json({ error: 'Termo de consentimento não encontrado' });
                return;
            }
            if (consent.revoked_at) {
                res.status(409).json({ error: 'Este termo de consentimento já foi revogado anteriormente' });
                return;
            }
            if (consent.template_version_id) {
                res.status(409).json({ error: 'Use o cancelamento em Termos & Consentimentos. As evidências deste documento são imutáveis.' });
                return;
            }
            const revokedBy = req.user?.userId || null;
            database_1.db.prepare(`
        UPDATE patient_consents
        SET revoked_at = datetime('now'), revoked_by = ?, status = 'revoked'
        WHERE id = ? AND patient_id = ? AND tenant_id = ?
      `).run(revokedBy, consentId, patientId, tenantId);
            (0, audit_middleware_1.logAudit)(req, 'REVOKE_PATIENT_CONSENT', 'patient_consents', consentId, { patientId, revokedBy });
            res.json({ message: 'Termo de consentimento revogado com sucesso' });
        }
        catch (err) {
            console.error('[PatientClinicalController.revokeConsent] Erro:', err);
            res.status(500).json({ error: 'Erro ao revogar termo de consentimento' });
        }
    }
    // 7. EXPORTAÇÃO COMPLETA DOS DADOS DO PACIENTE (LGPD art. 18 — acesso e portabilidade / item 4.1)
    // Retorna, num único documento JSON, tudo que a plataforma guarda sobre o paciente, sempre
    // filtrado por tenant_id. Anexos (file_attachments) trazem só metadados: nunca URL assinada
    // nem os bytes do arquivo.
    static exportPatientData(req, res) {
        try {
            const patientId = req.params.id;
            const tenantId = req.tenantId;
            if (!tenantId) {
                res.status(400).json({ error: 'Tenant obrigatório' });
                return;
            }
            const patient = database_1.db.prepare('SELECT * FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId);
            if (!patient) {
                res.status(404).json({ error: 'Paciente não encontrado' });
                return;
            }
            if (!(0, clinical_controller_1.hasClinicalAccess)(req, patientId)) {
                res.status(403).json({
                    error: 'Acesso clínico restrito: profissional não possui vínculo assistencial com este paciente (Sigilo LGPD).',
                    code: 'CLINICAL_PRIVACY_RESTRICTION'
                });
                return;
            }
            const guardians = database_1.db.prepare('SELECT * FROM guardians WHERE patient_id = ? AND tenant_id = ?').all(patientId, tenantId);
            const appointments = database_1.db.prepare(`
        SELECT a.*, p.name as professional_name, s.name as service_name
        FROM appointments a
        LEFT JOIN professionals p ON p.id = a.professional_id
        LEFT JOIN services s ON s.id = a.service_id
        WHERE a.patient_id = ? AND a.tenant_id = ?
        ORDER BY a.start_time
      `).all(patientId, tenantId);
            const clinicalRecords = database_1.db.prepare(`
        SELECT r.*, p.name as professional_name
        FROM records r
        LEFT JOIN professionals p ON p.id = r.professional_id
        WHERE r.patient_id = ? AND r.tenant_id = ?
        ORDER BY r.session_date
      `).all(patientId, tenantId);
            const allergies = database_1.db.prepare('SELECT * FROM patient_allergies WHERE patient_id = ? AND tenant_id = ?').all(patientId, tenantId);
            const medications = database_1.db.prepare('SELECT * FROM patient_medications WHERE patient_id = ? AND tenant_id = ?').all(patientId, tenantId);
            const anamnesis = database_1.db.prepare(`
        SELECT an.*, p.name as professional_name
        FROM patient_anamnesis an
        LEFT JOIN professionals p ON p.id = an.professional_id
        WHERE an.patient_id = ? AND an.tenant_id = ?
      `).all(patientId, tenantId);
            const certificates = database_1.db.prepare(`
        SELECT c.*, p.name as professional_name
        FROM clinical_certificates c
        LEFT JOIN professionals p ON p.id = c.professional_id
        WHERE c.patient_id = ? AND c.tenant_id = ?
      `).all(patientId, tenantId);
            const prescriptions = database_1.db.prepare(`
        SELECT c.*, p.name as professional_name
        FROM clinical_prescriptions c
        LEFT JOIN professionals p ON p.id = c.professional_id
        WHERE c.patient_id = ? AND c.tenant_id = ?
      `).all(patientId, tenantId);
            const examRequests = database_1.db.prepare(`
        SELECT c.*, p.name as professional_name
        FROM clinical_exam_requests c
        LEFT JOIN professionals p ON p.id = c.professional_id
        WHERE c.patient_id = ? AND c.tenant_id = ?
      `).all(patientId, tenantId);
            // Sem file_url: é um link direto (não assinado, mas ainda assim um ponteiro de armazenamento)
            // para o arquivo do exame — mantemos só os metadados, na mesma linha do que é feito para
            // file_attachments logo abaixo.
            const exams = database_1.db.prepare(`
        SELECT pe.id, pe.title, pe.exam_type, pe.exam_date, pe.file_type, pe.notes,
               pe.ai_extracted_summary, pe.created_at, p.name as professional_name
        FROM patient_exams pe
        LEFT JOIN professionals p ON p.id = pe.professional_id
        WHERE pe.patient_id = ? AND pe.tenant_id = ?
      `).all(patientId, tenantId);
            const consents = database_1.db.prepare(`
        SELECT pc.id, pc.title, pc.consent_type, pc.version, pc.content_text, pc.status,
               pc.accepted_by_name, pc.accepted_at, pc.revoked_at, pc.revoked_by, pc.modality,
               pc.profession_name, pc.signature_hash, pc.created_at, p.name as professional_name,
               cs.id as consent_signature_id,cs.evidence_hash,cs.evidence_json,ci.reason as invalidation_reason,ci.created_at as invalidated_at
        FROM patient_consents pc
        LEFT JOIN professionals p ON p.id = pc.professional_id
        LEFT JOIN consent_signatures cs ON cs.consent_id=pc.id
        LEFT JOIN consent_invalidations ci ON ci.consent_id=pc.id
        WHERE pc.patient_id = ? AND pc.tenant_id = ? AND (?=1 OR pc.template_version_id IS NULL)
      `).all(patientId, tenantId, (0, consent_access_1.hasConsentAccess)(req, patientId) ? 1 : 0).filter(c => (0, consent_access_1.hasConsentDocumentAccess)(req, c.id));
            const payments = database_1.db.prepare('SELECT * FROM payments WHERE patient_id = ? AND tenant_id = ?').all(patientId, tenantId);
            const receipts = database_1.db.prepare('SELECT * FROM receipts WHERE patient_id = ? AND tenant_id = ?').all(patientId, tenantId);
            // Anexos: só metadados (id, categoria, nome do arquivo, tipo, tamanho, data). NUNCA
            // incluir URL assinada nem o conteúdo binário do arquivo aqui.
            const attachments = database_1.db.prepare(`
        SELECT id, category, original_filename, mime_type, file_size, module_type, created_at
        FROM file_attachments
        WHERE patient_id = ? AND clinic_id = ?
      `).all(patientId, tenantId);
            // Módulos de especialidade: cobertura de exemplo (padrão extensível), não exaustiva.
            const physiotherapyAssessments = database_1.db.prepare('SELECT * FROM physiotherapy_assessments WHERE patient_id = ? AND tenant_id = ?').all(patientId, tenantId);
            const nutritionAssessments = database_1.db.prepare('SELECT * FROM nutrition_assessments WHERE patient_id = ? AND tenant_id = ?').all(patientId, tenantId);
            const psychologySessions = database_1.db.prepare('SELECT * FROM psychology_sessions WHERE patient_id = ? AND tenant_id = ?').all(patientId, tenantId);
            const exportPayload = {
                exportedAt: new Date().toISOString(),
                patient,
                guardians,
                appointments,
                clinicalRecords,
                allergies,
                medications,
                anamnesis,
                clinicalDocuments: { certificates, prescriptions, examRequests },
                exams,
                consents,
                payments,
                receipts,
                attachments,
                specialtyModules: {
                    // Exemplo do padrão para módulos por especialidade. NÃO incluídos ainda (extensível
                    // seguindo o mesmo padrão: SELECT * FROM <tabela> WHERE patient_id = ? AND tenant_id = ?):
                    //  - Odontologia: dental_tooth_records, dental_periodontal_records,
                    //    dental_endodontic_records, dental_anamnesis, dental_treatment_plans,
                    //    dental_prosthetics_lab, dental_orthodontics, dental_hof
                    //  - Fonoaudiologia: fono_audiology_records, fono_abfw_records
                    //  - Fisioterapia (parcial): physiotherapy_evolutions (só as avaliações estão abaixo)
                    //  - Avaliação física/Personal: body_assessments, body_markers,
                    //    personal_assessment_*, personal_workout_*
                    //  - Psicologia (parcial): psychology_goals, psychology_documents, psychology_audit_logs
                    physiotherapyAssessments,
                    nutritionAssessments,
                    psychologySessions
                }
            };
            (0, audit_middleware_1.logAudit)(req, 'EXPORT_PATIENT_DATA', 'patients', patientId, { patientId });
            res.json(exportPayload);
        }
        catch (err) {
            console.error('[PatientClinicalController.exportPatientData] Erro:', err);
            res.status(500).json({ error: 'Erro ao exportar dados do paciente' });
        }
    }
}
exports.PatientClinicalController = PatientClinicalController;
