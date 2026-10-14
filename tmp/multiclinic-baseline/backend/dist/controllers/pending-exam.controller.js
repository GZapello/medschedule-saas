"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PendingExamController = void 0;
const database_1 = require("../config/database");
const uuid_1 = require("uuid");
const audit_middleware_1 = require("../middlewares/audit.middleware");
class PendingExamController {
    static list(req, res) {
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
          pe.cid_code,
          pe.created_by, pe.created_at, pe.updated_at,
          p.full_name as patient_name, p.phone as patient_phone,
          prof.name as professional_name
        FROM pending_exams pe
        JOIN patients p ON p.id = pe.patient_id
        LEFT JOIN professionals prof ON prof.id = pe.professional_id
        WHERE pe.tenant_id = ?
      `;
            const params = [tenantId];
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
            const exams = database_1.db.prepare(query).all(...params);
            // Atualiza dinamicamente status para 'delayed' se passou da data prevista e ainda está 'waiting'
            const today = new Date().toISOString().split('T')[0];
            const processed = exams.map(e => {
                if (e.status === 'waiting' && e.expected_date && e.expected_date < today) {
                    return { ...e, is_delayed: true };
                }
                return { ...e, is_delayed: false };
            });
            res.json(processed);
        }
        catch (err) {
            console.error('[PendingExamController.list] Erro:', err);
            res.status(500).json({ error: 'Erro ao listar exames a receber' });
        }
    }
    static create(req, res) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                res.status(400).json({ error: 'Tenant não informado' });
                return;
            }
            const { patientId, professionalId, examName, requestDate, expectedDate, notes, status, cidCode, cid_code } = req.body;
            const finalCid = cidCode || cid_code || null;
            if (!patientId || !examName || !requestDate) {
                res.status(400).json({ error: 'Paciente, nome do exame e data de solicitação são obrigatórios' });
                return;
            }
            const id = 'pex-' + (0, uuid_1.v4)().slice(0, 8);
            database_1.db.prepare(`
        INSERT INTO pending_exams (
          id, tenant_id, patient_id, professional_id, exam_name,
          request_date, expected_date, status, notes, cid_code, created_by, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(id, tenantId, patientId, professionalId || null, examName.trim(), requestDate, expectedDate || null, status || 'waiting', notes || null, finalCid, req.user?.userId || null);
            (0, audit_middleware_1.logAudit)(req, 'CREATE_PENDING_EXAM', 'pending_exams', id, { examName, patientId, cidCode: finalCid });
            res.status(201).json({ id, message: 'Exame registrado com sucesso' });
        }
        catch (err) {
            console.error('[PendingExamController.create] Erro:', err);
            res.status(500).json({ error: 'Erro ao registrar exame a receber' });
        }
    }
    static update(req, res) {
        try {
            const { id } = req.params;
            const tenantId = req.tenantId;
            const { examName, professionalId, requestDate, expectedDate, receivedDate, status, notes, cidCode, cid_code } = req.body;
            const finalCid = cidCode !== undefined ? cidCode : (cid_code !== undefined ? cid_code : null);
            const current = database_1.db.prepare('SELECT id FROM pending_exams WHERE id = ? AND tenant_id = ?').get(id, tenantId);
            if (!current) {
                res.status(404).json({ error: 'Registro de exame não encontrado' });
                return;
            }
            database_1.db.prepare(`
        UPDATE pending_exams SET
          exam_name = COALESCE(?, exam_name),
          professional_id = COALESCE(?, professional_id),
          request_date = COALESCE(?, request_date),
          expected_date = COALESCE(?, expected_date),
          received_date = COALESCE(?, received_date),
          status = COALESCE(?, status),
          notes = COALESCE(?, notes),
          cid_code = COALESCE(?, cid_code),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(examName || null, professionalId !== undefined ? professionalId : null, requestDate || null, expectedDate !== undefined ? expectedDate : null, receivedDate !== undefined ? receivedDate : null, status || null, notes !== undefined ? notes : null, finalCid, id, tenantId);
            (0, audit_middleware_1.logAudit)(req, 'UPDATE_PENDING_EXAM', 'pending_exams', id, { status, cidCode: finalCid });
            res.json({ message: 'Exame atualizado com sucesso' });
        }
        catch (err) {
            console.error('[PendingExamController.update] Erro:', err);
            res.status(500).json({ error: 'Erro ao atualizar exame a receber' });
        }
    }
    static getDocument(req, res) {
        try {
            const { id } = req.params;
            const tenantId = req.tenantId;
            if (!tenantId) {
                res.status(400).json({ error: 'Tenant não informado' });
                return;
            }
            const doc = database_1.db.prepare(`
        SELECT 
          pe.id, pe.tenant_id, pe.patient_id, pe.professional_id,
          pe.exam_name, pe.exam_name as exams_list,
          pe.request_date, pe.expected_date, pe.received_date, pe.status,
          pe.notes, pe.notes as clinical_indication,
          pe.cid_code, pe.created_at,
          p.full_name as patient_name, p.cpf as patient_cpf, p.birth_date as patient_birth,
          prof.name as professional_name, prof.registration_type, prof.registration_number, prof.gender as professional_gender,
          COALESCE(spec.name, prof.practice_areas, 'Profissional de Saúde') as specialty,
          t.name as clinic_name, t.cnpj_cpf as clinic_cnpj, t.phone as clinic_phone, t.email as clinic_email,
          t.street, t.number, t.neighborhood, t.city, t.city as clinic_city, t.state, t.state as clinic_state, t.address, t.logo_url
        FROM pending_exams pe
        JOIN patients p ON p.id = pe.patient_id
        LEFT JOIN professionals prof ON prof.id = pe.professional_id
        LEFT JOIN specialties spec ON spec.id = prof.specialty_id
        JOIN tenants t ON t.id = pe.tenant_id
        WHERE pe.id = ? AND pe.tenant_id = ?
      `).get(id, tenantId);
            if (!doc) {
                res.status(404).json({ error: 'Registro de exame não encontrado' });
                return;
            }
            const template = database_1.db.prepare(`
        SELECT * FROM clinic_document_templates WHERE tenant_id = ? AND template_type = 'exam_request'
      `).get(tenantId);
            res.json({ document: doc, template });
        }
        catch (err) {
            console.error('[PendingExamController.getDocument] Erro:', err);
            res.status(500).json({ error: 'Erro ao gerar documento de solicitação de exame' });
        }
    }
    static delete(req, res) {
        try {
            const { id } = req.params;
            const tenantId = req.tenantId;
            database_1.db.prepare('DELETE FROM pending_exams WHERE id = ? AND tenant_id = ?').run(id, tenantId);
            (0, audit_middleware_1.logAudit)(req, 'DELETE_PENDING_EXAM', 'pending_exams', id);
            res.json({ message: 'Exame removido com sucesso' });
        }
        catch (err) {
            console.error('[PendingExamController.delete] Erro:', err);
            res.status(500).json({ error: 'Erro ao remover exame' });
        }
    }
}
exports.PendingExamController = PendingExamController;
