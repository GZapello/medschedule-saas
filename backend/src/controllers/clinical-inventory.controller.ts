import { Request, Response } from 'express';
import { ClinicalInventoryService, ClinicalInventoryError } from '../services/clinical-inventory.service';

export class ClinicalInventoryController {
  /**
   * GET /v1/clinical-inventory/items
   * Lista itens disponíveis para seleção clínica.
   */
  static listItems(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const { search, category } = req.query;
      const items = ClinicalInventoryService.listItems(tenantId, {
        search: typeof search === 'string' ? search : undefined,
        category: typeof category === 'string' ? category : undefined,
        activeOnly: true
      });

      res.json({
        total: items.length,
        items
      });
    } catch (err: any) {
      console.error('[ClinicalInventoryController.listItems] Erro:', err);
      res.status(500).json({ error: 'Erro ao buscar itens de estoque da clínica' });
    }
  }

  /**
   * POST /v1/clinical-inventory/items/quick-add
   * Cadastro rápido de item a partir de uma tela clínica.
   */
  static quickAdd(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const item = ClinicalInventoryService.quickAddItem(tenantId, req.body, req.user?.userId);
      res.status(201).json({
        message: 'Produto cadastrado no estoque central com sucesso.',
        item
      });
    } catch (err: any) {
      if (err instanceof ClinicalInventoryError) {
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
  static recordUsage(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const result = ClinicalInventoryService.deductStock(tenantId, {
        ...req.body,
        userId: req.user?.userId
      });

      res.status(200).json(result);
    } catch (err: any) {
      if (err instanceof ClinicalInventoryError) {
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
  static refundUsage(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const result = ClinicalInventoryService.refundStock(tenantId, {
        ...req.body,
        userId: req.user?.userId
      });

      res.status(200).json(result);
    } catch (err: any) {
      if (err instanceof ClinicalInventoryError) {
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
  static listMovements(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const { appointmentId, patientId, sourceId } = req.query;
      const movements = ClinicalInventoryService.getMovements(tenantId, {
        appointmentId: typeof appointmentId === 'string' ? appointmentId : undefined,
        patientId: typeof patientId === 'string' ? patientId : undefined,
        sourceId: typeof sourceId === 'string' ? sourceId : undefined
      });

      res.json({ movements });
    } catch (err: any) {
      console.error('[ClinicalInventoryController.listMovements] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar movimentações de estoque.' });
    }
  }
}
