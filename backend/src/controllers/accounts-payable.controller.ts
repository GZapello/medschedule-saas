import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';

export class AccountsPayableController {
  /**
   * Listagem de contas a pagar / despesas com filtros e métricas consolidadas
   */
  static list(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const { status, supplier, startDate, endDate, search } = req.query;
      const today = new Date().toISOString().slice(0, 10);

      let query = `
        SELECT 
          ap.id, ap.tenant_id, ap.purchase_id, ap.description, ap.category,
          ap.supplier_name, ap.supplier_cnpj, ap.amount, ap.installment_number,
          ap.total_installments, ap.due_date, ap.payment_date, ap.payment_method,
          ap.status, ap.amount_paid, ap.cash_register_id, ap.invoice_number,
          ap.cancellation_reason, ap.notes, ap.created_at, ap.updated_at,
          p.total_amount as purchase_total_amount,
          p.invoice_access_key
        FROM accounts_payable ap
        LEFT JOIN purchases p ON p.id = ap.purchase_id
        WHERE ap.tenant_id = ?
      `;
      const params: any[] = [tenantId];

      if (status && status !== 'all') {
        if (status === 'overdue') {
          query += ' AND ap.status = "pending" AND ap.due_date < ?';
          params.push(today);
        } else if (status === 'pending') {
          query += ' AND ap.status = "pending" AND ap.due_date >= ?';
          params.push(today);
        } else {
          query += ' AND ap.status = ?';
          params.push(status);
        }
      }

      if (supplier) {
        query += ' AND (ap.supplier_name LIKE ? OR ap.supplier_cnpj LIKE ?)';
        params.push(`%${supplier}%`, `%${supplier}%`);
      }

      if (search) {
        query += ' AND (ap.description LIKE ? OR ap.supplier_name LIKE ? OR ap.invoice_number LIKE ?)';
        const pat = `%${search}%`;
        params.push(pat, pat, pat);
      }

      if (startDate) {
        query += ' AND ap.due_date >= ?';
        params.push(startDate);
      }

      if (endDate) {
        query += ' AND ap.due_date <= ?';
        params.push(endDate);
      }

      query += ' ORDER BY ap.due_date ASC, ap.created_at DESC';

      const rows = db.prepare(query).all(...params) as any[];

      const payables = rows.map(r => {
        const isOverdue = r.status === 'pending' && r.due_date < today;
        return {
          ...r,
          is_overdue: isOverdue,
          display_status: isOverdue ? 'overdue' : r.status
        };
      });

      // Métricas gerais do tenant
      const allActiveStmt = db.prepare(`
        SELECT status, due_date, amount, amount_paid, payment_date
        FROM accounts_payable
        WHERE tenant_id = ? AND status != 'cancelled'
      `);
      const allActive = allActiveStmt.all(tenantId) as any[];

      const currentMonthPrefix = today.slice(0, 7); // AAAA-MM
      let totalPending = 0;
      let totalOverdue = 0;
      let totalPaidMonth = 0;

      for (const row of allActive) {
        const amt = Number(row.amount) || 0;
        const paid = Number(row.amount_paid) || 0;
        const pendingPortion = Math.max(0, amt - paid);

        if (row.status === 'pending') {
          totalPending += pendingPortion;
          if (row.due_date < today) {
            totalOverdue += pendingPortion;
          }
        }

        if (row.status === 'paid' && row.payment_date && row.payment_date.startsWith(currentMonthPrefix)) {
          totalPaidMonth += paid > 0 ? paid : amt;
        }
      }

      res.json({
        metrics: {
          totalPending,
          totalOverdue,
          totalPaidMonth,
          totalRecords: payables.length
        },
        payables
      });
    } catch (err: any) {
      console.error('[AccountsPayableController.list] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar contas a pagar: ' + err.message });
    }
  }

  /**
   * Detalhes de uma compra com suas contas a pagar e movimentações de estoque vinculadas
   */
  static getPurchaseDetails(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;

      const purchase = db.prepare(`
        SELECT * FROM purchases
        WHERE id = ? AND tenant_id = ?
      `).get(id, tenantId) as any;

      if (!purchase) {
        res.status(404).json({ error: 'Compra não encontrada' });
        return;
      }

      const payables = db.prepare(`
        SELECT * FROM accounts_payable
        WHERE purchase_id = ? AND tenant_id = ?
        ORDER BY installment_number ASC, due_date ASC
      `).all(id, tenantId);

      const splits = db.prepare(`
        SELECT * FROM payment_splits
        WHERE purchase_id = ? AND tenant_id = ?
      `).all(id, tenantId);

      const stockMovements = db.prepare(`
        SELECT 
          m.*,
          i.name as item_name,
          i.unit as item_unit,
          i.category as item_category,
          i.brand as item_brand,
          i.presentation as item_presentation
        FROM inventory_movements m
        JOIN inventory_items i ON i.id = m.item_id
        WHERE m.purchase_id = ? AND m.tenant_id = ?
        ORDER BY m.created_at ASC
      `).all(id, tenantId);

      res.json({
        purchase,
        payables,
        splits,
        stockMovements
      });
    } catch (err: any) {
      console.error('[AccountsPayableController.getPurchaseDetails] Erro:', err);
      res.status(500).json({ error: 'Erro ao buscar detalhes da compra: ' + err.message });
    }
  }

  /**
   * Baixa / Pagamento de conta a pagar (total ou parcial)
   */
  static pay(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;
      const { amountPaid, paymentMethod, paymentDate, notes } = req.body;

      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const payable = db.prepare(`
        SELECT * FROM accounts_payable WHERE id = ? AND tenant_id = ?
      `).get(id, tenantId) as any;

      if (!payable) {
        res.status(404).json({ error: 'Conta a pagar não encontrada' });
        return;
      }

      if (payable.status === 'paid') {
        res.status(400).json({ error: 'Esta obrigação financeira já se encontra totalmente paga.' });
        return;
      }

      if (payable.status === 'cancelled') {
        res.status(400).json({ error: 'Não é possível dar baixa em conta a pagar cancelada.' });
        return;
      }

      const totalAmount = Number(payable.amount) || 0;
      const alreadyPaid = Number(payable.amount_paid) || 0;
      const remaining = Math.max(0, totalAmount - alreadyPaid);

      const payAmt = amountPaid !== undefined && amountPaid !== null ? Number(amountPaid) : remaining;
      if (isNaN(payAmt) || payAmt <= 0) {
        res.status(400).json({ error: 'Valor a pagar deve ser maior que zero.' });
        return;
      }

      const newPaidTotal = alreadyPaid + payAmt;
      const isFull = newPaidTotal >= totalAmount - 0.001;
      const method = (paymentMethod || payable.payment_method || 'pix').toLowerCase();
      const pDate = paymentDate || new Date().toISOString().slice(0, 10);
      const isCash = method === 'cash' || method === 'dinheiro';

      const runPayTx = db.transaction(() => {
        let cashRegisterId: string | null = null;
        let drawerDeductionApplied = false;

        // Se pago em dinheiro, verifica se há caixa físico aberto
        if (isCash) {
          const openReg = db.prepare(`
            SELECT id FROM cash_registers
            WHERE tenant_id = ? AND status = 'open'
            ORDER BY opened_at DESC LIMIT 1
          `).get(tenantId) as any;

          if (openReg) {
            cashRegisterId = openReg.id;
            drawerDeductionApplied = true;

            // Insere movimentação de saída no caixa
            const movId = 'mov-reg-' + uuidv4().slice(0, 8);
            db.prepare(`
              INSERT INTO cash_register_movements (
                id, tenant_id, cash_register_id, user_id, user_name,
                type, amount, description, created_at
              )
              VALUES (?, ?, ?, ?, ?, 'DESPESA', ?, ?, datetime('now'))
            `).run(
              movId,
              tenantId,
              openReg.id,
              (req.user as any)?.userId || 'system',
              req.user?.name || 'Operador',
              payAmt,
              `Pagamento despesa: ${payable.description}${payable.supplier_name ? ` (${payable.supplier_name})` : ''}`
            );
          }
        }

        // Atualiza conta a pagar
        db.prepare(`
          UPDATE accounts_payable SET
            amount_paid = ?,
            status = ?,
            payment_date = ?,
            payment_method = ?,
            cash_register_id = COALESCE(?, cash_register_id),
            notes = COALESCE(?, notes),
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(
          newPaidTotal,
          isFull ? 'paid' : 'pending',
          pDate,
          method,
          cashRegisterId,
          notes ? (payable.notes ? `${payable.notes} | ${notes}` : notes) : null,
          id,
          tenantId
        );

        // Se vinculado a compra, recalcula status da compra
        if (payable.purchase_id) {
          const allPayablesForPurchase = db.prepare(`
            SELECT amount, amount_paid, status FROM accounts_payable
            WHERE purchase_id = ? AND tenant_id = ?
          `).all(payable.purchase_id, tenantId) as any[];

          const purchaseTotalPaid = allPayablesForPurchase.reduce((s, p) => s + (Number(p.amount_paid) || 0), 0);
          const purchaseTotalAmount = allPayablesForPurchase.reduce((s, p) => s + (Number(p.amount) || 0), 0);
          const allPaid = allPayablesForPurchase.every(p => p.status === 'paid');
          const hasAnyPaid = purchaseTotalPaid > 0;

          let newPurchaseStatus = 'pending';
          if (allPaid) {
            newPurchaseStatus = 'paid';
          } else if (hasAnyPaid) {
            newPurchaseStatus = 'partial';
          }

          db.prepare(`
            UPDATE purchases SET
              amount_paid = ?,
              amount_pending = ?,
              payment_status = ?,
              updated_at = datetime('now')
            WHERE id = ? AND tenant_id = ?
          `).run(
            purchaseTotalPaid,
            Math.max(0, purchaseTotalAmount - purchaseTotalPaid),
            newPurchaseStatus,
            payable.purchase_id,
            tenantId
          );
        }

        return { drawerDeductionApplied, cashRegisterId };
      });

      const { drawerDeductionApplied, cashRegisterId } = runPayTx();

      logAudit(req, 'PAY_ACCOUNT_PAYABLE', 'accounts_payable', id, {
        amountPaid: payAmt,
        paymentMethod: method,
        isFull,
        cashRegisterId,
        drawerDeductionApplied
      });

      res.json({
        success: true,
        message: isFull ? 'Conta a pagar liquidada com sucesso!' : 'Pagamento parcial registrado com sucesso!',
        amountPaid: payAmt,
        isFull,
        drawerDeductionApplied,
        cashRegisterId
      });
    } catch (err: any) {
      console.error('[AccountsPayableController.pay] Erro:', err);
      res.status(500).json({ error: 'Erro ao processar pagamento: ' + err.message });
    }
  }

  /**
   * Cancelamento de conta a pagar com justificativa obrigatória
   */
  static cancel(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;
      const { cancellationReason } = req.body;

      if (!cancellationReason || !cancellationReason.trim()) {
        res.status(400).json({ error: 'A justificativa do cancelamento é obrigatória para fins de auditoria clínica e fiscal.' });
        return;
      }

      const payable = db.prepare(`
        SELECT * FROM accounts_payable WHERE id = ? AND tenant_id = ?
      `).get(id, tenantId) as any;

      if (!payable) {
        res.status(404).json({ error: 'Conta a pagar não encontrada' });
        return;
      }

      if (payable.status === 'paid') {
        res.status(400).json({ error: 'Esta obrigação já foi paga. Para cancelá-la, utilize primeiro a reversão de pagamento.' });
        return;
      }

      db.prepare(`
        UPDATE accounts_payable SET
          status = 'cancelled',
          cancellation_reason = ?,
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(cancellationReason.trim(), id, tenantId);

      logAudit(req, 'CANCEL_ACCOUNT_PAYABLE', 'accounts_payable', id, { cancellationReason });

      res.json({ success: true, message: 'Conta a pagar cancelada com sucesso.' });
    } catch (err: any) {
      console.error('[AccountsPayableController.cancel] Erro:', err);
      res.status(500).json({ error: 'Erro ao cancelar conta a pagar: ' + err.message });
    }
  }

  /**
   * Reversão / Estorno de pagamento com auditoria e restauração do caixa
   */
  static revert(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;
      const { reason } = req.body;

      const payable = db.prepare(`
        SELECT * FROM accounts_payable WHERE id = ? AND tenant_id = ?
      `).get(id, tenantId) as any;

      if (!payable) {
        res.status(404).json({ error: 'Conta a pagar não encontrada' });
        return;
      }

      if (payable.status !== 'paid' && payable.amount_paid <= 0) {
        res.status(400).json({ error: 'Esta conta não possui pagamentos a serem revertidos.' });
        return;
      }

      const runRevertTx = db.transaction(() => {
        // Se tinha débito no caixa em dinheiro, cria estorno no caixa atual se aberto
        if (payable.cash_register_id && (payable.payment_method === 'cash' || payable.payment_method === 'dinheiro')) {
          const openReg = db.prepare(`
            SELECT id FROM cash_registers WHERE tenant_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1
          `).get(tenantId) as any;

          if (openReg) {
            db.prepare(`
              INSERT INTO cash_register_movements (
                id, tenant_id, cash_register_id, user_id, user_name,
                type, amount, description, created_at
              )
              VALUES (?, ?, ?, ?, ?, 'ESTORNO', ?, ?, datetime('now'))
            `).run(
              'mov-estorno-' + uuidv4().slice(0, 8),
              tenantId,
              openReg.id,
              (req.user as any)?.userId || 'system',
              req.user?.name || 'Operador',
              payable.amount_paid,
              `Estorno pagamento despesa: ${payable.description}${reason ? ` (${reason})` : ''}`
            );
          }
        }

        db.prepare(`
          UPDATE accounts_payable SET
            amount_paid = 0,
            status = 'pending',
            payment_date = null,
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(id, tenantId);

        if (payable.purchase_id) {
          db.prepare(`
            UPDATE purchases SET
              amount_paid = 0,
              amount_pending = total_amount,
              payment_status = 'pending',
              updated_at = datetime('now')
            WHERE id = ? AND tenant_id = ?
          `).run(payable.purchase_id, tenantId);
        }
      });

      runRevertTx();

      logAudit(req, 'REVERT_ACCOUNT_PAYABLE', 'accounts_payable', id, { reason });
      res.json({ success: true, message: 'Pagamento revertido com sucesso. Conta restaurada para pendente.' });
    } catch (err: any) {
      console.error('[AccountsPayableController.revert] Erro:', err);
      res.status(500).json({ error: 'Erro ao reverter pagamento: ' + err.message });
    }
  }

  /**
   * Listagem de compras de fornecedores (visão sintética)
   */
  static listPurchases(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const purchases = db.prepare(`
        SELECT * FROM purchases
        WHERE tenant_id = ?
        ORDER BY created_at DESC
      `).all(tenantId);

      res.json({ purchases });
    } catch (err: any) {
      console.error('[AccountsPayableController.listPurchases] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar compras: ' + err.message });
    }
  }
}
