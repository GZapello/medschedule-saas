"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClinicalGoalsController = void 0;
const database_1 = require("../config/database");
const uuid_1 = require("uuid");
const clinical_controller_1 = require("./clinical.controller");
function sanitizeAndValidateGoalValue(val, fieldName, unit) {
    if (val === undefined || val === null || String(val).trim() === '') {
        return { valid: true, normalized: undefined };
    }
    let str = String(val).trim();
    const isPercentUnit = (unit && String(unit).includes('%')) || str.endsWith('%');
    if (str.endsWith('%')) {
        str = str.slice(0, -1).trim();
    }
    const normalizedStr = str.replace(',', '.');
    const num = Number(normalizedStr);
    if (isNaN(num)) {
        return {
            valid: false,
            error: `O campo "${fieldName}" deve conter um valor numérico válido.`
        };
    }
    if (isPercentUnit) {
        if (num < 0 || num > 100) {
            return {
                valid: false,
                error: `O campo "${fieldName}" com unidade percentual (%) deve estar entre 0 e 100.`
            };
        }
    }
    return { valid: true, normalized: String(normalizedStr) };
}
class ClinicalGoalsController {
    /**
     * GET /v1/clinical/goals/:patientId?module_type=to|fono
     */
    static listByPatient(req, res) {
        try {
            const tenantId = req.tenantId;
            const patientId = String(req.params.patientId);
            const moduleType = req.query.module_type ? String(req.query.module_type) : null;
            if (!tenantId) {
                res.status(403).json({ error: 'Clínica não identificada' });
                return;
            }
            if (!(0, clinical_controller_1.hasClinicalAccess)(req, patientId)) {
                res.status(403).json({ error: 'Acesso clínico restrito (LGPD)' });
                return;
            }
            let sql = 'SELECT g.*, p.name as professional_name FROM clinical_goals g LEFT JOIN professionals p ON p.id = g.professional_id WHERE g.tenant_id = ? AND g.patient_id = ?';
            const params = [tenantId, patientId];
            if (moduleType) {
                sql += ' AND g.module_type = ?';
                params.push(moduleType);
            }
            sql += ' ORDER BY g.created_at DESC';
            const rows = database_1.db.prepare(sql).all(...params);
            res.json(rows.map(r => ({
                ...r,
                history: (() => {
                    try {
                        return JSON.parse(r.history_json || '[]');
                    }
                    catch {
                        return [];
                    }
                })()
            })));
        }
        catch (err) {
            console.error('[ClinicalGoalsController.listByPatient]', err);
            res.status(500).json({ error: 'Erro ao listar metas clínicas' });
        }
    }
    /**
     * POST /v1/clinical/goals
     */
    static create(req, res) {
        try {
            const tenantId = req.tenantId;
            const userId = req.user?.userId;
            if (!tenantId || !userId) {
                res.status(403).json({ error: 'Não autenticado' });
                return;
            }
            const { patientId, moduleType, domain, title, description, baselineValue, currentValue, targetValue, unit, deadline, notes } = req.body;
            if (!patientId || !moduleType || !domain || !title || targetValue === undefined) {
                res.status(400).json({ error: 'patientId, moduleType, domain, title e targetValue são obrigatórios' });
                return;
            }
            // Validar valores numéricos / percentuais
            const valTarget = sanitizeAndValidateGoalValue(targetValue, 'Alvo', unit);
            if (!valTarget.valid) {
                res.status(400).json({ error: valTarget.error });
                return;
            }
            const valBaseline = sanitizeAndValidateGoalValue(baselineValue, 'Valor Basal', unit);
            if (!valBaseline.valid) {
                res.status(400).json({ error: valBaseline.error });
                return;
            }
            const valCurrent = sanitizeAndValidateGoalValue(currentValue, 'Valor Atual', unit);
            if (!valCurrent.valid) {
                res.status(400).json({ error: valCurrent.error });
                return;
            }
            if (!(0, clinical_controller_1.hasClinicalAccess)(req, String(patientId))) {
                res.status(403).json({ error: 'Acesso clínico restrito (LGPD)' });
                return;
            }
            let profId = null;
            let profName = req.user?.name || 'Profissional';
            if (req.user?.role === 'professional') {
                const prof = database_1.db.prepare('SELECT id, name FROM professionals WHERE user_id = ? AND tenant_id = ?').get(userId, tenantId);
                if (prof) {
                    profId = prof.id;
                    profName = prof.name;
                }
            }
            const id = 'goal-' + (0, uuid_1.v4)().slice(0, 10);
            const today = new Date().toISOString().split('T')[0];
            const initialHistory = [{
                    date: today,
                    value: currentValue !== undefined ? String(currentValue) : String(baselineValue || ''),
                    status: 'not_started',
                    notes: 'Meta cadastrada no prontuário',
                    professionalName: profName
                }];
            database_1.db.prepare(`
        INSERT INTO clinical_goals (
          id, tenant_id, patient_id, professional_id, module_type,
          domain, title, description, baseline_value, current_value,
          target_value, unit, deadline, status, notes, history_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_started', ?, ?, datetime('now'), datetime('now'))
      `).run(id, tenantId, patientId, profId, moduleType, domain, title, description || null, baselineValue !== undefined ? String(baselineValue) : null, currentValue !== undefined ? String(currentValue) : (baselineValue !== undefined ? String(baselineValue) : null), String(targetValue), unit || null, deadline || null, notes || null, JSON.stringify(initialHistory));
            res.status(201).json({ id, message: 'Meta clínica criada com sucesso' });
        }
        catch (err) {
            console.error('[ClinicalGoalsController.create]', err);
            res.status(500).json({ error: 'Erro ao criar meta clínica' });
        }
    }
    /**
     * PUT /v1/clinical/goals/:id
     * Atualização de progresso e status da meta
     */
    static updateProgress(req, res) {
        try {
            const tenantId = req.tenantId;
            const { id } = req.params;
            if (!tenantId) {
                res.status(403).json({ error: 'Clínica não identificada' });
                return;
            }
            const existing = database_1.db.prepare('SELECT * FROM clinical_goals WHERE id = ? AND tenant_id = ?').get(id, tenantId);
            if (!existing) {
                res.status(404).json({ error: 'Meta não encontrada' });
                return;
            }
            if (!(0, clinical_controller_1.hasClinicalAccess)(req, existing.patient_id)) {
                res.status(403).json({ error: 'Acesso clínico restrito (LGPD)' });
                return;
            }
            const { currentValue, status, notes, deadline, targetValue } = req.body;
            if (currentValue !== undefined) {
                const valCurrent = sanitizeAndValidateGoalValue(currentValue, 'Valor Atual', existing.unit);
                if (!valCurrent.valid) {
                    res.status(400).json({ error: valCurrent.error });
                    return;
                }
            }
            if (targetValue !== undefined) {
                const valTarget = sanitizeAndValidateGoalValue(targetValue, 'Alvo', existing.unit);
                if (!valTarget.valid) {
                    res.status(400).json({ error: valTarget.error });
                    return;
                }
            }
            let history = [];
            try {
                history = JSON.parse(existing.history_json || '[]');
            }
            catch {
                history = [];
            }
            const today = new Date().toISOString().split('T')[0];
            const profName = req.user?.name || 'Profissional';
            history.push({
                date: today,
                value: currentValue !== undefined ? String(currentValue) : existing.current_value,
                status: status || existing.status,
                notes: notes || 'Progresso registrado',
                professionalName: profName
            });
            database_1.db.prepare(`
        UPDATE clinical_goals SET
          current_value = COALESCE(?, current_value),
          status = COALESCE(?, status),
          deadline = COALESCE(?, deadline),
          target_value = COALESCE(?, target_value),
          notes = COALESCE(?, notes),
          history_json = ?,
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(currentValue !== undefined ? String(currentValue) : null, status || null, deadline || null, targetValue !== undefined ? String(targetValue) : null, notes || null, JSON.stringify(history), id, tenantId);
            res.json({ message: 'Meta atualizada com sucesso' });
        }
        catch (err) {
            console.error('[ClinicalGoalsController.updateProgress]', err);
            res.status(500).json({ error: 'Erro ao atualizar meta clínica' });
        }
    }
    /**
     * DELETE /v1/clinical/goals/:id
     */
    static delete(req, res) {
        try {
            const tenantId = req.tenantId;
            const { id } = req.params;
            const existing = database_1.db.prepare('SELECT * FROM clinical_goals WHERE id = ? AND tenant_id = ?').get(id, tenantId);
            if (!existing) {
                res.status(404).json({ error: 'Meta não encontrada' });
                return;
            }
            if (!(0, clinical_controller_1.hasClinicalAccess)(req, existing.patient_id)) {
                res.status(403).json({ error: 'Acesso clínico restrito (LGPD)' });
                return;
            }
            database_1.db.prepare('DELETE FROM clinical_goals WHERE id = ? AND tenant_id = ?').run(id, tenantId);
            res.json({ message: 'Meta removida com sucesso' });
        }
        catch (err) {
            console.error('[ClinicalGoalsController.delete]', err);
            res.status(500).json({ error: 'Erro ao remover meta clínica' });
        }
    }
}
exports.ClinicalGoalsController = ClinicalGoalsController;
