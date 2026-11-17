import { Request, Response } from 'express';
import { getUserPermissions } from '../middlewares/rbac.middleware';
import { logAudit } from '../middlewares/audit.middleware';
import { StudentConsumptionService } from '../services/student-consumption.service';

function getConsumptionAccess(req: Request, tenantId: string) {
  const role = req.user?.role || '';
  const userId = req.user?.userId || '';
  const perms = userId ? getUserPermissions(userId, tenantId, role || 'professional') : [];
  const isAdmin = role === 'superadmin' || role === 'clinic_admin';

  const canCreate = isAdmin || perms.includes('create_student_consumption');
  const hasFullFinancialView = isAdmin || perms.includes('view_financial') || perms.includes('manage_financial');
  const canManageFinancial =
    isAdmin || role === 'receptionist' || perms.includes('manage_financial') || perms.includes('view_financial');
  const canEditPrice = isAdmin || perms.includes('manage_financial');
  const canViewModule = canCreate || hasFullFinancialView;

  return {
    canCreate,
    hasFullFinancialView,
    canManageFinancial,
    canEditPrice,
    canViewModule
  };
}

export class StudentConsumptionController {
  static listSellableProducts(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Tenant não informado.' });
        return;
      }

      const access = getConsumptionAccess(req, tenantId);
      if (!access.canViewModule) {
        res.status(403).json({ error: 'Você não possui permissão para consultar produtos de consumo.', code: 'FORBIDDEN' });
        return;
      }

      const search = req.query.search ? String(req.query.search) : undefined;
      const products = StudentConsumptionService.listSellableProducts(tenantId, search);
      res.json({ products });
    } catch (err: any) {
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao listar produtos para consumo.' });
    }
  }

  static list(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Tenant não informado.' });
        return;
      }

      const access = getConsumptionAccess(req, tenantId);
      if (!access.canViewModule) {
        res.status(403).json({ error: 'Você não possui permissão para acessar Consumo dos Alunos.', code: 'FORBIDDEN' });
        return;
      }

      const result = StudentConsumptionService.listConsumptions(tenantId, {
        patientId: req.query.patientId ? String(req.query.patientId) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
        startDate: req.query.startDate ? String(req.query.startDate) : undefined,
        endDate: req.query.endDate ? String(req.query.endDate) : undefined,
        search: req.query.search ? String(req.query.search) : undefined
      });

      res.json({
        ...result,
        permissions: access
      });
    } catch (err: any) {
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao listar consumos dos alunos.' });
    }
  }

  static studentSummary(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const patientId = String(req.params.patientId || '');
      if (!tenantId || !patientId) {
        res.status(400).json({ error: 'Estabelecimento e aluno são obrigatórios.' });
        return;
      }

      const access = getConsumptionAccess(req, tenantId);
      if (!access.canViewModule) {
        res.status(403).json({ error: 'Sem permissão para consultar consumo financeiro do aluno.', code: 'FORBIDDEN' });
        return;
      }

      const data = StudentConsumptionService.getStudentSummary(tenantId, patientId);
      res.json(data);
    } catch (err: any) {
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao carregar consumo do aluno.' });
    }
  }

  static create(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId || '';
      if (!tenantId || !userId) {
        res.status(401).json({ error: 'Autenticação obrigatória.' });
        return;
      }

      const access = getConsumptionAccess(req, tenantId);
      if (!access.canCreate) {
        res.status(403).json({
          error: 'Você não possui permissão para lançar consumo de produtos para alunos.',
          code: 'FORBIDDEN'
        });
        return;
      }

      const {
        patientId,
        inventoryItemId,
        quantity,
        unitPrice,
        paymentStatus,
        paymentMethod,
        paymentDate,
        amountReceived,
        notes,
        idempotencyKey
      } = req.body || {};

      if (!patientId || !inventoryItemId || !quantity) {
        res.status(400).json({ error: 'Aluno, produto e quantidade são obrigatórios.' });
        return;
      }

      if (paymentStatus !== 'pending' && paymentStatus !== 'paid') {
        res.status(400).json({ error: 'Informe uma situação financeira válida (pending ou paid).' });
        return;
      }

      const result = StudentConsumptionService.createConsumption({
        tenantId,
        userId,
        userName: req.user?.name || req.user?.email || null,
        canEditPrice: access.canEditPrice,
        patientId: String(patientId),
        inventoryItemId: String(inventoryItemId),
        quantity: Number(quantity),
        unitPrice,
        paymentStatus,
        paymentMethod,
        paymentDate,
        amountReceived,
        notes,
        idempotencyKey: idempotencyKey || (req.headers['idempotency-key'] ? String(req.headers['idempotency-key']) : undefined)
      });

      if (!result.idempotent) {
        logAudit(req, 'CREATE_STUDENT_CONSUMPTION', 'student_consumptions', result.consumption.id, {
          patientId,
          inventoryItemId,
          quantity: Number(quantity),
          totalAmountCents: result.consumption.total_amount_cents,
          paymentStatus
        });
      }

      res.status(result.idempotent ? 200 : 201).json({
        success: true,
        idempotent: result.idempotent,
        consumption: result.consumption
      });
    } catch (err: any) {
      res.status(err?.status || 500).json({
        error: err?.message || 'Erro ao registrar consumo do aluno.',
        code: err?.code
      });
    }
  }

  static settle(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId || '';
      const consumptionId = String(req.params.id || '');
      if (!tenantId || !userId || !consumptionId) {
        res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
        return;
      }

      const access = getConsumptionAccess(req, tenantId);
      if (!access.canManageFinancial) {
        res.status(403).json({ error: 'Sem permissão para quitar consumos pendentes.', code: 'FORBIDDEN' });
        return;
      }

      const { paymentMethod, paymentDate, notes } = req.body || {};
      const updated = StudentConsumptionService.settleConsumption({
        tenantId,
        consumptionId,
        userId,
        paymentMethod,
        paymentDate,
        notes
      });

      logAudit(req, 'SETTLE_STUDENT_CONSUMPTION', 'student_consumptions', consumptionId, {
        paymentMethod: updated.payment_method,
        totalAmountCents: updated.total_amount_cents
      });

      res.json({ success: true, consumption: updated });
    } catch (err: any) {
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao quitar consumo do aluno.' });
    }
  }

  static cancel(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId || '';
      const consumptionId = String(req.params.id || '');
      if (!tenantId || !userId || !consumptionId) {
        res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
        return;
      }

      const access = getConsumptionAccess(req, tenantId);
      if (!access.canManageFinancial) {
        res.status(403).json({ error: 'Sem permissão para cancelar ou estornar consumos.', code: 'FORBIDDEN' });
        return;
      }

      const { reason, revertStock } = req.body || {};
      const updated = StudentConsumptionService.cancelConsumption({
        tenantId,
        consumptionId,
        userId,
        userName: req.user?.name || req.user?.email || null,
        reason: String(reason || ''),
        revertStock: revertStock !== false
      });

      logAudit(req, 'CANCEL_STUDENT_CONSUMPTION', 'student_consumptions', consumptionId, {
        status: updated.payment_status,
        reason,
        stockReverted: updated.stock_reverted
      });

      res.json({ success: true, consumption: updated });
    } catch (err: any) {
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao cancelar consumo do aluno.' });
    }
  }
}
