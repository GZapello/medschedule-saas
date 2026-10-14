import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';

export class CashRegisterController {
  // Caixa aberto atual do usuário ou clínica
  static getCurrent(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId;

      // Busca caixa aberto do operador ou qualquer caixa aberto da clínica
      const openRegister = db.prepare(`
        SELECT * FROM cash_registers
        WHERE tenant_id = ? AND status = 'open'
        ORDER BY opened_at DESC
        LIMIT 1
      `).get(tenantId) as any;

      if (!openRegister) {
        res.json({ openRegister: null });
        return;
      }

      // Busca movimentações vinculadas ao caixa
      const payments = db.prepare(`
        SELECT 
          p.id, p.amount, p.payment_method, p.status, p.created_at, p.notes,
          pat.full_name as patient_name
        FROM payments p
        LEFT JOIN patients pat ON pat.id = p.patient_id
        WHERE p.tenant_id = ?
          AND (p.cash_register_id = ? OR (p.cash_register_id IS NULL AND p.created_at >= ?))
        ORDER BY p.created_at DESC
      `).all(tenantId, openRegister.id, openRegister.opened_at) as any[];

      // Agrupa totais por método de pagamento
      const totalsByMethod: Record<string, number> = {
        cash: 0,
        pix: 0,
        credit_card: 0,
        debit_card: 0,
        bank_transfer: 0,
        insurance: 0,
        total: 0
      };

      for (const pay of payments) {
        if (pay.status === 'completed' || pay.status === 'confirmed') {
          const method = pay.payment_method || 'cash';
          const amt = Number(pay.amount) || 0;
          totalsByMethod[method] = (totalsByMethod[method] || 0) + amt;
          totalsByMethod.total += amt;
        }
      }

      res.json({
        openRegister,
        movements: payments,
        totalsByMethod
      });
    } catch (err: any) {
      console.error('[CashRegisterController.getCurrent] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar status do caixa' });
    }
  }

  // Abertura de Caixa
  static openRegister(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId || 'system';
      const userName = req.user?.name || 'Operador';
      const { initialBalance, notes } = req.body;

      // Verifica se já existe caixa aberto
      const existing = db.prepare(`
        SELECT id FROM cash_registers
        WHERE tenant_id = ? AND status = 'open'
      `).get(tenantId);

      if (existing) {
        res.status(400).json({ error: 'Já existe um caixa aberto para esta clínica. Feche o anterior antes de abrir outro.' });
        return;
      }

      const id = 'csh-' + uuidv4().slice(0, 8);
      const initial = Number(initialBalance) || 0;

      db.prepare(`
        INSERT INTO cash_registers (
          id, tenant_id, operator_user_id, operator_name,
          opened_at, initial_balance, status, notes
        )
        VALUES (?, ?, ?, ?, datetime('now'), ?, 'open', ?)
      `).run(id, tenantId, userId, userName, initial, notes || null);

      logAudit(req, 'OPEN_CASH_REGISTER', 'cash_registers', id, { initialBalance: initial });
      res.status(201).json({ id, message: 'Caixa aberto com sucesso!' });
    } catch (err: any) {
      console.error('[CashRegisterController.openRegister] Erro:', err);
      res.status(500).json({ error: 'Erro ao abrir caixa' });
    }
  }

  // Fechamento de Caixa com conferência
  static closeRegister(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const { countedCash, countedValuesByMethod, differenceJustification, notes } = req.body;

      const register = db.prepare(`
        SELECT * FROM cash_registers WHERE id = ? AND tenant_id = ?
      `).get(id, tenantId) as any;

      if (!register) {
        res.status(404).json({ error: 'Caixa não encontrado' });
        return;
      }

      if (register.status === 'closed') {
        res.status(400).json({ error: 'Este caixa já foi fechado' });
        return;
      }

      // Busca movimentações
      const payments = db.prepare(`
        SELECT 
          p.id, p.amount, p.payment_method, p.status
        FROM payments p
        WHERE p.tenant_id = ?
          AND (p.cash_register_id = ? OR (p.cash_register_id IS NULL AND p.created_at >= ?))
      `).all(tenantId, id, register.opened_at) as any[];

      // Atualiza os pagamentos para estarem vinculados formalmente ao caixa
      db.prepare(`
        UPDATE payments SET cash_register_id = ?
        WHERE tenant_id = ?
          AND (cash_register_id IS NULL OR cash_register_id = ?)
          AND created_at >= ?
      `).run(id, tenantId, id, register.opened_at);

      const systemTotals: Record<string, number> = {
        cash: 0,
        pix: 0,
        credit_card: 0,
        debit_card: 0,
        total: 0
      };

      for (const p of payments) {
        if (p.status === 'completed' || p.status === 'confirmed') {
          const m = p.payment_method || 'cash';
          const amt = Number(p.amount) || 0;
          systemTotals[m] = (systemTotals[m] || 0) + amt;
          systemTotals.total += amt;
        }
      }

      // Dinheiro esperado em gaveta = saldo inicial + entradas em dinheiro
      const expectedCashInDrawer = register.initial_balance + (systemTotals.cash || 0);
      const actualCashInDrawer = Number(countedCash) || 0;
      const cashDifference = actualCashInDrawer - expectedCashInDrawer;

      const summary = {
        initialBalance: register.initial_balance,
        systemTotals,
        countedValuesByMethod: countedValuesByMethod || {},
        expectedCashInDrawer,
        actualCashInDrawer,
        cashDifference,
        differenceJustification: differenceJustification || null
      };

      db.prepare(`
        UPDATE cash_registers SET
          status = 'closed',
          closed_at = datetime('now'),
          final_balance = ?,
          difference = ?,
          summary_json = ?,
          notes = COALESCE(?, notes)
        WHERE id = ? AND tenant_id = ?
      `).run(
        actualCashInDrawer,
        cashDifference,
        JSON.stringify(summary),
        notes || null,
        id,
        tenantId
      );

      logAudit(req, 'CLOSE_CASH_REGISTER', 'cash_registers', id, { summary });
      res.json({
        message: 'Caixa fechado com sucesso!',
        summary
      });
    } catch (err: any) {
      console.error('[CashRegisterController.closeRegister] Erro:', err);
      res.status(500).json({ error: 'Erro ao fechar caixa' });
    }
  }

  // Histórico de Caixas
  static listHistory(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { startDate, endDate } = req.query;

      let query = `
        SELECT * FROM cash_registers
        WHERE tenant_id = ?
      `;
      const params: any[] = [tenantId];

      if (startDate) {
        query += ' AND opened_at >= ?';
        params.push(startDate);
      }
      if (endDate) {
        query += ' AND opened_at <= ?';
        params.push(endDate);
      }

      query += ' ORDER BY opened_at DESC';

      const registers = db.prepare(query).all(...params);
      res.json(registers);
    } catch (err: any) {
      console.error('[CashRegisterController.listHistory] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar histórico de caixas' });
    }
  }

  // Detalhe de um caixa para relatório / impressão
  static getById(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      const register = db.prepare('SELECT * FROM cash_registers WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!register) {
        res.status(404).json({ error: 'Caixa não encontrado' });
        return;
      }

      const payments = db.prepare(`
        SELECT 
          p.*,
          pat.full_name as patient_name
        FROM payments p
        LEFT JOIN patients pat ON pat.id = p.patient_id
        WHERE p.tenant_id = ? AND p.cash_register_id = ?
        ORDER BY p.created_at ASC
      `).all(tenantId, id);

      res.json({ register, payments });
    } catch (err: any) {
      console.error('[CashRegisterController.getById] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar detalhes do caixa' });
    }
  }
}
