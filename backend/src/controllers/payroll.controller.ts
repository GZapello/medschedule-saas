import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';

export class PayrollController {
  // Lista pagamentos / folha do mês para a equipe
  static list(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const { periodMonth, professionalId, status } = req.query;

      let query = `
        SELECT 
          py.id, py.tenant_id, py.professional_id, py.period_month, py.remuneration_type,
          py.appointments_count, py.produced_amount, py.commission_percentage, py.commission_amount,
          py.fixed_salary, py.adjustments, py.adjustment_notes, py.total_payable,
          py.due_date, py.paid_date, py.status, py.notes, py.created_at, py.updated_at,
          p.name as professional_name, p.photo_url as professional_photo,
          COALESCE(p.specialty_custom, spec.name, '') as specialty_name
        FROM professional_payrolls py
        JOIN professionals p ON p.id = py.professional_id
        LEFT JOIN specialties spec ON spec.id = p.specialty_id
        WHERE py.tenant_id = ?
      `;
      const params: any[] = [tenantId];

      if (periodMonth) {
        query += ' AND py.period_month = ?';
        params.push(periodMonth);
      }
      if (professionalId) {
        query += ' AND py.professional_id = ?';
        params.push(professionalId);
      }
      if (status) {
        query += ' AND py.status = ?';
        params.push(status);
      }

      query += ' ORDER BY p.name ASC';

      const payrolls = db.prepare(query).all(...params);
      res.json(payrolls);
    } catch (err: any) {
      console.error('[PayrollController.list] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar pagamentos e comissões' });
    }
  }

  // Apuração automática do mês para todos os profissionais ou um específico
  static calculate(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const { periodMonth, professionalId } = req.body;
      if (!periodMonth) {
        res.status(400).json({ error: 'Mês de apuração (YYYY-MM) é obrigatório' });
        return;
      }

      let profQuery = `
        SELECT id, name, remuneration_type, commission_percentage, fixed_salary, payment_day
        FROM professionals
        WHERE tenant_id = ? AND active = 1
      `;
      const profParams: any[] = [tenantId];
      if (professionalId) {
        profQuery += ' AND id = ?';
        profParams.push(professionalId);
      }

      const professionals = db.prepare(profQuery).all(...profParams) as any[];
      const results: any[] = [];

      for (const p of professionals) {
        // Busca atendimentos concluídos no mês
        const apptQuery = `
          SELECT count(a.id) as total_appts, COALESCE(sum(s.price), 0) as total_produced
          FROM appointments a
          LEFT JOIN services s ON s.id = a.service_id
          WHERE a.tenant_id = ? 
            AND a.professional_id = ?
            AND a.status IN ('completed', 'confirmed')
            AND a.start_time LIKE ?
        `;
        const stats = db.prepare(apptQuery).get(tenantId, p.id, `${periodMonth}%`) as {
          total_appts: number;
          total_produced: number;
        };

        const apptCount = stats ? stats.total_appts : 0;
        const produced = stats ? stats.total_produced : 0;
        const remType = p.remuneration_type || 'commission';
        const commPct = p.commission_percentage || 0;
        const commAmount = (produced * commPct) / 100;
        const fixedSal = (remType === 'salary' || remType === 'both') ? (p.fixed_salary || 0) : 0;
        const totalPayable = commAmount + fixedSal;

        // Vencimento previsto baseado no payment_day
        const payDay = p.payment_day || 5;
        const dueDate = `${periodMonth}-${String(payDay).padStart(2, '0')}`;

        results.push({
          professionalId: p.id,
          professionalName: p.name,
          periodMonth,
          remunerationType: remType,
          appointmentsCount: apptCount,
          producedAmount: produced,
          commissionPercentage: commPct,
          commissionAmount: commAmount,
          fixedSalary: fixedSal,
          adjustments: 0,
          totalPayable,
          dueDate,
          status: 'pending'
        });
      }

      res.json({
        periodMonth,
        calculatedCount: results.length,
        results
      });
    } catch (err: any) {
      console.error('[PayrollController.calculate] Erro:', err);
      res.status(500).json({ error: 'Erro ao calcular folha de pagamento' });
    }
  }

  // Salvar ou atualizar lançamento de pagamento/comissão
  static save(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const {
        id, professionalId, periodMonth, remunerationType, appointmentsCount,
        producedAmount, commissionPercentage, commissionAmount, fixedSalary,
        adjustments, adjustmentNotes, totalPayable, dueDate, paidDate, status, notes
      } = req.body;

      if (!professionalId || !periodMonth) {
        res.status(400).json({ error: 'Profissional e período (YYYY-MM) são obrigatórios' });
        return;
      }

      const recordId = id || ('pay-' + uuidv4().slice(0, 8));

      // Verifica se já existe registro para esse profissional no mês
      const existing = db.prepare(`
        SELECT id FROM professional_payrolls
        WHERE tenant_id = ? AND professional_id = ? AND period_month = ?
      `).get(tenantId, professionalId, periodMonth) as { id: string } | undefined;

      const targetId = existing ? existing.id : recordId;

      if (existing) {
        db.prepare(`
          UPDATE professional_payrolls SET
            remuneration_type = ?,
            appointments_count = ?,
            produced_amount = ?,
            commission_percentage = ?,
            commission_amount = ?,
            fixed_salary = ?,
            adjustments = ?,
            adjustment_notes = ?,
            total_payable = ?,
            due_date = ?,
            paid_date = ?,
            status = ?,
            notes = ?,
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(
          remunerationType || 'commission',
          Number(appointmentsCount) || 0,
          Number(producedAmount) || 0,
          Number(commissionPercentage) || 0,
          Number(commissionAmount) || 0,
          Number(fixedSalary) || 0,
          Number(adjustments) || 0,
          adjustmentNotes || null,
          Number(totalPayable) || 0,
          dueDate || null,
          paidDate || null,
          status || 'pending',
          notes || null,
          targetId,
          tenantId
        );
      } else {
        db.prepare(`
          INSERT INTO professional_payrolls (
            id, tenant_id, professional_id, period_month, remuneration_type,
            appointments_count, produced_amount, commission_percentage, commission_amount,
            fixed_salary, adjustments, adjustment_notes, total_payable,
            due_date, paid_date, status, notes, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
          targetId,
          tenantId,
          professionalId,
          periodMonth,
          remunerationType || 'commission',
          Number(appointmentsCount) || 0,
          Number(producedAmount) || 0,
          Number(commissionPercentage) || 0,
          Number(commissionAmount) || 0,
          Number(fixedSalary) || 0,
          Number(adjustments) || 0,
          adjustmentNotes || null,
          Number(totalPayable) || 0,
          dueDate || null,
          paidDate || null,
          status || 'pending',
          notes || null
        );
      }

      logAudit(req, 'SAVE_PAYROLL', 'professional_payrolls', targetId, { professionalId, periodMonth, totalPayable, status });
      res.json({ id: targetId, message: 'Lançamento de pagamento salvo com sucesso' });
    } catch (err: any) {
      console.error('[PayrollController.save] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar pagamento' });
    }
  }

  // Baixa / Alteração de status (Pendente / Pago / Atrasado)
  static updateStatus(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const { status, paidDate } = req.body;

      const allowed = ['pending', 'paid', 'delayed'];
      if (!allowed.includes(status)) {
        res.status(400).json({ error: `Status inválido. Permitidos: ${allowed.join(', ')}` });
        return;
      }

      const finalPaidDate = status === 'paid' ? (paidDate || new Date().toISOString().split('T')[0]) : null;

      db.prepare(`
        UPDATE professional_payrolls SET
          status = ?,
          paid_date = ?,
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(status, finalPaidDate, id, tenantId);

      logAudit(req, 'UPDATE_PAYROLL_STATUS', 'professional_payrolls', id, { status, paidDate: finalPaidDate });
      res.json({ message: 'Status de pagamento atualizado com sucesso', status, paidDate: finalPaidDate });
    } catch (err: any) {
      console.error('[PayrollController.updateStatus] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar status de pagamento' });
    }
  }
}
