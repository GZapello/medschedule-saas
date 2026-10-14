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
          pay.payment_method, pay.status, pay.transaction_id, pay.payment_date, pay.notes, pay.created_at,
          pat.full_name as patient_name, pat.phone as patient_phone,
          a.appointment_number,
          p.name as professional_name,
          s.name as service_name
        FROM payments pay
        JOIN patients pat ON pat.id = pay.patient_id
        LEFT JOIN appointments a ON a.id = pay.appointment_id
        LEFT JOIN professionals p ON p.id = a.professional_id
        LEFT JOIN services s ON s.id = a.service_id
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
      const { appointmentId, patientId, amount, paymentMethod, status, transactionId, notes } = req.body;

      if (!patientId || !amount) {
        res.status(400).json({ error: 'Paciente e valor são obrigatórios' });
        return;
      }

      const id = 'pay-' + uuidv4().slice(0, 8);
      const paymentDate = status === 'paid' ? new Date().toISOString() : null;

      const insertStmt = db.prepare(`
        INSERT INTO payments (id, tenant_id, appointment_id, patient_id, amount, payment_method, status, transaction_id, payment_date, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(
        id,
        tenantId,
        appointmentId || null,
        patientId,
        Number(amount),
        paymentMethod || 'pix',
        status || 'pending',
        transactionId || null,
        paymentDate,
        notes || null
      );

      logAudit(req, 'CREATE_PAYMENT', 'payments', id, { amount, paymentMethod, status });
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
      const { status, paymentMethod, transactionId, notes } = req.body;

      const updateStmt = db.prepare(`
        UPDATE payments SET
          status = COALESCE(?, status),
          payment_method = COALESCE(?, payment_method),
          transaction_id = COALESCE(?, transaction_id),
          payment_date = CASE WHEN ? = 'paid' THEN datetime('now') ELSE payment_date END,
          notes = COALESCE(?, notes)
        WHERE id = ? AND tenant_id = ?
      `);

      updateStmt.run(
        status || null,
        paymentMethod || null,
        transactionId || null,
        status || null,
        notes || null,
        id,
        tenantId
      );

      logAudit(req, 'UPDATE_PAYMENT_STATUS', 'payments', id, { status, paymentMethod });
      res.json({ message: 'Status do pagamento atualizado com sucesso' });
    } catch (err: any) {
      console.error('[PaymentController.updateStatus] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar pagamento' });
    }
  }
}
