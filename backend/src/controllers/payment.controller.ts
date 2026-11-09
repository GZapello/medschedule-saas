import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';

export class PaymentController {
  static list(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const { status, paymentMethod, startDate, endDate } = req.query;

      let query = `
        SELECT 
          pay.id, pay.tenant_id, pay.appointment_id, pay.patient_id, pay.amount,
          pay.service_id, pay.base_amount, pay.additional_amount, pay.additional_reason,
          pay.discount_amount, pay.discount_reason,
          pay.payment_method, pay.status, pay.transaction_id, pay.payment_date, pay.notes, pay.created_at,
          pat.full_name as patient_name, pat.phone as patient_phone,
          a.appointment_number,
          p.name as professional_name,
          COALESCE(s.name, s_direct.name) as service_name
        FROM payments pay
        JOIN patients pat ON pat.id = pay.patient_id
        LEFT JOIN appointments a ON a.id = pay.appointment_id
        LEFT JOIN professionals p ON p.id = a.professional_id
        LEFT JOIN services s ON s.id = a.service_id
        LEFT JOIN services s_direct ON s_direct.id = pay.service_id
        WHERE pay.tenant_id = ?
      `;
      const params: any[] = [tenantId];

      if (status) {
        query += ' AND pay.status = ?';
        params.push(status);
      }

      if (paymentMethod) {
        query += ' AND pay.payment_method = ?';
        params.push(paymentMethod);
      }

      if (startDate) {
        query += ' AND pay.created_at >= ?';
        params.push(startDate);
      }

      if (endDate) {
        query += ' AND pay.created_at <= ?';
        params.push(endDate);
      }

      query += ' ORDER BY pay.created_at DESC';

      const stmt = db.prepare(query);
      const payments = stmt.all(...params);

      // Métricas de faturamento do filtro atual
      const totalPaid = payments
        .filter((p: any) => p.status === 'paid')
        .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

      const totalPending = payments
        .filter((p: any) => p.status === 'pending')
        .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

      res.json({
        totalPaid,
        totalPending,
        totalRecords: payments.length,
        payments
      });
    } catch (err: any) {
      console.error('[PaymentController.list] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar pagamentos' });
    }
  }

  static create(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const {
        appointmentId, patientId, amount, paymentMethod, status, transactionId, notes,
        amountTendered, changeAmount,
        serviceId, baseAmount, additionalAmount, additionalReason, discountAmount, discountReason
      } = req.body;

      if (!patientId || !amount) {
        res.status(400).json({ error: 'Paciente e valor são obrigatórios' });
        return;
      }

      const id = 'pay-' + uuidv4().slice(0, 8);
      const isPaid = status === 'paid';
      const paymentDate = isPaid ? new Date().toISOString() : null;

      // Vincula ao caixa aberto atual se existir
      let cashRegisterId: string | null = null;
      try {
        const openReg = db.prepare(`
          SELECT id FROM cash_registers
          WHERE tenant_id = ? AND status = 'open'
          ORDER BY opened_at DESC LIMIT 1
        `).get(tenantId) as any;
        if (openReg) {
          cashRegisterId = openReg.id;
        }
      } catch (e) {
        // silencioso se tabela ainda não criada
      }

      const amt = Number(amount);
      let amtTenderedVal: number | null = null;
      let changeAmtVal: number | null = null;

      const m = paymentMethod || 'pix';
      if ((m === 'cash' || m === 'dinheiro') && amountTendered !== undefined && amountTendered !== null) {
        amtTenderedVal = Number(amountTendered) || 0;
        changeAmtVal = changeAmount !== undefined && changeAmount !== null
          ? Number(changeAmount) || 0
          : Math.max(0, amtTenderedVal - amt);
      }

      const insertStmt = db.prepare(`
        INSERT INTO payments (
          id, tenant_id, appointment_id, patient_id, amount, payment_method,
          status, transaction_id, payment_date, notes,
          cash_register_id, amount_tendered, change_amount,
          service_id, base_amount, additional_amount, additional_reason, discount_amount, discount_reason
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(
        id,
        tenantId,
        appointmentId || null,
        patientId,
        amt,
        m,
        status || 'pending',
        transactionId || null,
        paymentDate,
        notes || null,
        cashRegisterId,
        amtTenderedVal,
        changeAmtVal,
        serviceId || null,
        baseAmount !== undefined && baseAmount !== null ? Number(baseAmount) : null,
        additionalAmount !== undefined && additionalAmount !== null ? Number(additionalAmount) : 0,
        additionalReason || null,
        discountAmount !== undefined && discountAmount !== null ? Number(discountAmount) : 0,
        discountReason || null
      );

      logAudit(req, 'CREATE_PAYMENT', 'payments', id, { amount: amt, paymentMethod: m, status, cashRegisterId });
      res.status(201).json({ id, message: 'Pagamento registrado com sucesso' });
    } catch (err: any) {
      console.error('[PaymentController.create] Erro:', err);
      res.status(500).json({ error: 'Erro ao registrar pagamento' });
    }
  }

  static updateStatus(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const { status, paymentMethod, transactionId, notes, amountTendered, changeAmount } = req.body;

      // Se virou 'paid' e não possui vínculo com caixa, vincula ao caixa aberto atual
      let activeRegisterId: string | null = null;
      if (status === 'paid') {
        try {
          const currentPay = db.prepare('SELECT cash_register_id, amount FROM payments WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
          if (currentPay && !currentPay.cash_register_id) {
            const openReg = db.prepare(`
              SELECT id FROM cash_registers WHERE tenant_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1
            `).get(tenantId) as any;
            if (openReg) activeRegisterId = openReg.id;
          }
        } catch (e) {}
      }

      const updateStmt = db.prepare(`
        UPDATE payments SET
          status = COALESCE(?, status),
          payment_method = COALESCE(?, payment_method),
          transaction_id = COALESCE(?, transaction_id),
          payment_date = CASE WHEN ? = 'paid' THEN datetime('now') ELSE payment_date END,
          notes = COALESCE(?, notes),
          cash_register_id = COALESCE(?, cash_register_id),
          amount_tendered = COALESCE(?, amount_tendered),
          change_amount = COALESCE(?, change_amount)
        WHERE id = ? AND tenant_id = ?
      `);

      updateStmt.run(
        status || null,
        paymentMethod || null,
        transactionId || null,
        status || null,
        notes || null,
        activeRegisterId || null,
        amountTendered !== undefined ? Number(amountTendered) : null,
        changeAmount !== undefined ? Number(changeAmount) : null,
        id,
        tenantId
      );

      logAudit(req, 'UPDATE_PAYMENT_STATUS', 'payments', id, { status, paymentMethod, cashRegisterId: activeRegisterId });
      res.json({ message: 'Status do pagamento atualizado com sucesso' });
    } catch (err: any) {
      console.error('[PaymentController.updateStatus] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar pagamento' });
    }
  }
}
