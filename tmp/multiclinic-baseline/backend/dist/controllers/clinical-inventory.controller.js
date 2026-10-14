"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClinicalInventoryController = void 0;
const clinical_inventory_service_1 = require("../services/clinical-inventory.service");
class ClinicalInventoryController {
    /**
     * GET /v1/clinical-inventory/items
     * Lista itens disponíveis para seleção clínica.
     */
    static listItems(req, res) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                res.status(400).json({ error: 'Tenant não informado' });
                return;
            }
            const { search, category } = req.query;
            const items = clinical_inventory_service_1.ClinicalInventoryService.listItems(tenantId, {
                search: typeof search === 'string' ? search : undefined,
                category: typeof category === 'string' ? category : undefined,
                activeOnly: true
            });
            res.json({
                total: items.length,
                items
            });
        }
        catch (err) {
            console.error('[ClinicalInventoryController.listItems] Erro:', err);
            res.status(500).json({ error: 'Erro ao buscar itens de estoque da clínica' });
        }
    }
    /**
     * POST /v1/clinical-inventory/items/quick-add
     * Cadastro rápido de item a partir de uma tela clínica.
     */
    static quickAdd(req, res) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                res.status(400).json({ error: 'Tenant não informado' });
                return;
            }
            const item = clinical_inventory_service_1.ClinicalInventoryService.quickAddItem(tenantId, req.body, req.user?.userId);
            res.status(201).json({
                message: 'Produto cadastrado no estoque central com sucesso.',
                item
            });
        }
        catch (err) {
            if (err instanceof clinical_inventory_service_1.ClinicalInventoryError) {
                res.status(err.status).json({ error: err.message, field: err.field });
                return;
            }
            console.error('[ClinicalInventoryController.quickAdd] Erro:', err);
            res.status(500).json({ error: 'Erro ao cadastrar produto no estoque da clínica.' });
        }
    }
    /**
     * POST /v1/clinical-inventory/usage
     * Registro avulso de consumo clínico (quando aplicável).
     */
    static recordUsage(req, res) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                res.status(400).json({ error: 'Tenant não informado' });
                return;
            }
            const result = clinical_inventory_service_1.ClinicalInventoryService.deductStock(tenantId, {
                ...req.body,
                userId: req.user?.userId
            });
            res.status(200).json(result);
        }
        catch (err) {
            if (err instanceof clinical_inventory_service_1.ClinicalInventoryError) {
                res.status(err.status).json({ error: err.message, field: err.field });
                return;
            }
            console.error('[ClinicalInventoryController.recordUsage] Erro:', err);
            res.status(500).json({ error: 'Erro ao registrar uso de estoque.' });
        }
    }
    /**
     * POST /v1/clinical-inventory/usage/refund
     * Estorno de consumo clínico previamente registrado.
     */
    static refundUsage(req, res) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                res.status(400).json({ error: 'Tenant não informado' });
                return;
            }
            const result = clinical_inventory_service_1.ClinicalInventoryService.refundStock(tenantId, {
                ...req.body,
                userId: req.user?.userId
            });
            res.status(200).json(result);
        }
        catch (err) {
            if (err instanceof clinical_inventory_service_1.ClinicalInventoryError) {
                res.status(err.status).json({ error: err.message, field: err.field });
                return;
            }
            console.error('[ClinicalInventoryController.refundUsage] Erro:', err);
            res.status(500).json({ error: 'Erro ao estornar uso de estoque.' });
        }
    }
    /**
     * GET /v1/clinical-inventory/movements
     * Consulta movimentações associadas a um atendimento ou procedimento.
     */
    static listMovements(req, res) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                res.status(400).json({ error: 'Tenant não informado' });
                return;
            }
            const { appointmentId, patientId, sourceId } = req.query;
            const movements = clinical_inventory_service_1.ClinicalInventoryService.getMovements(tenantId, {
                appointmentId: typeof appointmentId === 'string' ? appointmentId : undefined,
                patientId: typeof patientId === 'string' ? patientId : undefined,
                sourceId: typeof sourceId === 'string' ? sourceId : undefined
            });
            res.json({ movements });
        }
        catch (err) {
            console.error('[ClinicalInventoryController.listMovements] Erro:', err);
            res.status(500).json({ error: 'Erro ao consultar movimentações de estoque.' });
        }
    }
}
exports.ClinicalInventoryController = ClinicalInventoryController;
