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
          py.due_date, py.paid_date, py.status, py.notes, py.commission_breakdown_json,
          py.created_at, py.updated_at,
          p.name as professional_name, p.photo_url as professional_photo,
          COALESCE(p.specialty_custom, spec.name, '') as specialty_name
        FROM professional_payrolls py
        JOIN professionals p ON p.id = py.professional_id
        LEFT JOIN specialties spec ON spec.id = p.specialty_id
        WHERE py.tenant_id = ?
      `;
      const params: any[] = [tenantId];

      const user = req.user;
      if (user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(user.userId, tenantId) as any;
        if (prof) {
          query += ' AND py.professional_id = ?';
          params.push(prof.id);
        } else {
          res.json([]);
          return;
        }
      } else if (user?.role !== 'clinic_admin' && user?.role !== 'superadmin') {
        res.status(403).json({ success: false, error: 'Você não possui permissão para acessar esta área.' });
        return;
      }

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
      res.status(500).json({ success: false, error: 'Erro ao listar pagamentos e comissões' });
    }
  }

  // Apuração automática do mês para todos os profissionais ou um específico
  static calculate(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ success: false, error: 'Tenant não informado' });
        return;
      }

      const { periodMonth, professionalId } = req.body;
      if (!periodMonth) {
        res.status(400).json({ success: false, error: 'Mês de apuração (YYYY-MM) é obrigatório' });
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
        // Verifica se já existe registro para preservar histórico pago e ajustes existentes
        const existing = db.prepare(`
          SELECT *
          FROM professional_payrolls
          WHERE tenant_id = ? AND professional_id = ? AND period_month = ?
        `).get(tenantId, p.id, periodMonth) as any;

        // Regra mandatória: folha já paga/fechada permanece imutável
        if (existing && existing.status === 'paid') {
          let parsedBreakdown: any[] = [];
          try {
            if (existing.commission_breakdown_json) parsedBreakdown = JSON.parse(existing.commission_breakdown_json);
          } catch (_) {}
          results.push({
            id: existing.id,
            professionalId: p.id,
            professionalName: p.name,
            periodMonth,
            remunerationType: existing.remuneration_type || p.remuneration_type || 'commission',
            appointmentsCount: Number(existing.appointments_count || 0),
            producedAmount: Number(existing.produced_amount || 0),
            commissionPercentage: Number(existing.commission_percentage || 0),
            commissionAmount: Number(existing.commission_amount || 0),
            fixedSalary: Number(existing.fixed_salary || 0),
            adjustments: Number(existing.adjustments || 0),
            adjustmentNotes: existing.adjustment_notes || null,
            totalPayable: Number(existing.total_payable || 0),
            dueDate: existing.due_date,
            paidDate: existing.paid_date,
            status: 'paid',
            isLocked: true,
            commissionBreakdown: parsedBreakdown
          });
          continue;
        }

        // Carrega regras específicas por serviço do profissional neste estabelecimento
        const serviceRulesRows = db.prepare(`
          SELECT service_id, commission_type, commission_value, group_payout_basis, active
          FROM professional_service_commissions
          WHERE tenant_id = ? AND professional_id = ? AND active = 1
        `).all(tenantId, p.id) as Array<{
          service_id: string;
          commission_type: 'percentage' | 'fixed';
          commission_value: number;
          group_payout_basis: 'per_class' | 'per_present_student';
          active: number;
        }>;
        const serviceRuleMap = new Map(serviceRulesRows.map(r => [r.service_id, r]));

        // Busca atendimentos do mês com status financeiro e presença reais (nunca trata apenas 'confirmed' como realizado/pago)
        const apptRows = db.prepare(`
          SELECT
            a.id, a.service_id, a.occurrence_id, a.patient_id, a.start_time, a.status,
            COALESCE(a.service_kind, COALESCE(s.service_kind, 'individual')) as service_kind,
            COALESCE(a.attendance_status, 'pending') as attendance_status,
            COALESCE(s.name, 'Serviço') as service_name,
            COALESCE(ps.custom_price, s.price, 0) as list_price,
            pay.payment_id as payment_id,
            CASE
              WHEN COALESCE(pay.paid_count, 0) > 0 THEN 'paid'
              WHEN COALESCE(pay.open_count, 0) > 0 THEN 'pending'
              WHEN COALESCE(pay.exempt_count, 0) > 0 THEN 'exempt'
              WHEN COALESCE(pay.total_count, 0) > 0 THEN 'cancelled'
              ELSE NULL
            END as payment_status,
            CASE
              WHEN COALESCE(pay.paid_count, 0) > 0 THEN pay.paid_amount
              WHEN COALESCE(pay.open_count, 0) > 0 THEN pay.open_amount
              ELSE 0
            END as payment_amount
          FROM appointments a
          LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
          LEFT JOIN professional_services ps ON ps.service_id = a.service_id AND ps.professional_id = a.professional_id
          LEFT JOIN (
            SELECT
              appointment_id,
              tenant_id,
              MAX(id) as payment_id,
              SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_count,
              SUM(CASE WHEN status = 'paid' THEN COALESCE(amount, 0) ELSE 0 END) as paid_amount,
              SUM(CASE WHEN status IN ('pending', 'partial') THEN COALESCE(amount, 0) ELSE 0 END) as open_amount,
              SUM(CASE WHEN status IN ('pending', 'partial') THEN 1 ELSE 0 END) as open_count,
              SUM(CASE WHEN status = 'exempt' THEN 1 ELSE 0 END) as exempt_count,
              COUNT(*) as total_count
            FROM payments
            WHERE appointment_id IS NOT NULL
            GROUP BY tenant_id, appointment_id
          ) pay ON pay.appointment_id = a.id AND pay.tenant_id = a.tenant_id
          WHERE a.tenant_id = ?
            AND a.professional_id = ?
            AND a.status NOT IN ('cancelled', 'no_show')
            AND substr(a.start_time, 1, 7) = ?
          ORDER BY a.start_time ASC
        `).all(tenantId, p.id, periodMonth) as any[];

        const remType = p.remuneration_type || 'commission';
        const generalCommPct = Number(p.commission_percentage || 0);
        const allowGeneralCommission = remType === 'commission' || remType === 'both';

        const computeNetAmount = (row: any): number => {
          if (row.payment_id) {
            if (row.payment_status === 'cancelled' || row.payment_status === 'refunded' || row.payment_status === 'exempt') {
              return 0;
            }
            return Math.max(0, Math.round(Number(row.payment_amount || 0) * 100) / 100);
          }
          return Math.max(0, Math.round(Number(row.list_price || 0) * 100) / 100);
        };

        const resolveRule = (srvId: string | null) => {
          const specific = srvId ? serviceRuleMap.get(srvId) : undefined;
          if (specific) {
            return {
              source: 'service' as const,
              type: specific.commission_type,
              value: Number(specific.commission_value || 0),
              groupBasis: (specific.group_payout_basis || 'per_present_student') as 'per_class' | 'per_present_student'
            };
          }
          if (allowGeneralCommission && generalCommPct > 0) {
            return {
              source: 'general' as const,
              type: 'percentage' as const,
              value: generalCommPct,
              groupBasis: 'per_present_student' as const
            };
          }
          return {
            source: 'none' as const,
            type: 'percentage' as const,
            value: 0,
            groupBasis: 'per_present_student' as const
          };
        };

        let apptCount = 0;
        let produced = 0;
        let commAmount = 0;
        const breakdownItems: any[] = [];

        // Separa individuais x turmas (agrupadas por occurrence_id)
        const individualRows: any[] = [];
        const groupBuckets = new Map<string, any[]>();

        for (const row of apptRows) {
          if (row.payment_status === 'cancelled' || row.payment_status === 'refunded') continue;
          if (row.service_kind === 'group') {
            const key = row.occurrence_id || `apt:${row.id}`;
            if (!groupBuckets.has(key)) groupBuckets.set(key, []);
            groupBuckets.get(key)!.push(row);
          } else {
            individualRows.push(row);
          }
        }

        // Processa atendimentos individuais elegíveis (realizados ou com presença confirmada ou já pagos)
        for (const row of individualRows) {
          const isRealizedOrAttended =
            row.status === 'completed' ||
            row.attendance_status === 'present' ||
            row.payment_status === 'paid';
          if (!isRealizedOrAttended) continue;

          const netAmount = computeNetAmount(row);
          const rule = resolveRule(row.service_id);
          let itemComm = 0;
          if (rule.source !== 'none') {
            if (rule.type === 'fixed') {
              itemComm = row.payment_status === 'exempt' ? 0 : rule.value;
            } else {
              itemComm = Math.round(((netAmount * rule.value) / 100) * 100) / 100;
            }
          }

          apptCount += 1;
          produced = Math.round((produced + netAmount) * 100) / 100;
          commAmount = Math.round((commAmount + itemComm) * 100) / 100;
          breakdownItems.push({
            appointmentId: row.id,
            occurrenceId: null,
            serviceId: row.service_id,
            serviceName: row.service_name,
            serviceKind: 'individual',
            startTime: row.start_time,
            eligibleStudentsCount: 1,
            grossBasisAmount: netAmount,
            ruleSource: rule.source,
            commissionType: rule.type,
            commissionRate: rule.value,
            groupPayoutBasis: null,
            commissionAmount: itemComm
          });
        }

        // Processa aulas coletivas / turmas por ocorrência
        for (const [bucketKey, members] of groupBuckets.entries()) {
          // Considera elegível apenas aluno presente (ou aula finalizada sem falta)
          const presentMembers = members.filter(m =>
            m.attendance_status === 'present' ||
            (m.status === 'completed' && m.attendance_status !== 'absent' && m.attendance_status !== 'cancelled')
          );
          if (presentMembers.length === 0) continue;

          const sample = presentMembers[0];
          const rule = resolveRule(sample.service_id);
          const totalNetBasis = presentMembers.reduce((sum, m) => Math.round((sum + computeNetAmount(m)) * 100) / 100, 0);

          let occComm = 0;
          if (rule.source !== 'none') {
            if (rule.type === 'fixed') {
              occComm = rule.groupBasis === 'per_class'
                ? rule.value
                : Math.round((rule.value * presentMembers.length) * 100) / 100;
            } else {
              // Para percentual, ambos consideram o valor líquido faturado dos alunos elegíveis presentes
              occComm = Math.round(((totalNetBasis * rule.value) / 100) * 100) / 100;
            }
          }

          apptCount += 1; // 1 ocorrência de aula/turma
          produced = Math.round((produced + totalNetBasis) * 100) / 100;
          commAmount = Math.round((commAmount + occComm) * 100) / 100;
          breakdownItems.push({
            appointmentId: sample.id,
            occurrenceId: sample.occurrence_id || bucketKey,
            serviceId: sample.service_id,
            serviceName: sample.service_name,
            serviceKind: 'group',
            startTime: sample.start_time,
            eligibleStudentsCount: presentMembers.length,
            grossBasisAmount: totalNetBasis,
            ruleSource: rule.source,
            commissionType: rule.type,
            commissionRate: rule.value,
            groupPayoutBasis: rule.groupBasis,
            commissionAmount: occComm
          });
        }

        const fixedSal = (remType === 'salary' || remType === 'both') ? Number(p.fixed_salary || 0) : 0;

        const currentAdjustments = existing ? Number(existing.adjustments || 0) : 0;
        const currentAdjNotes = existing ? existing.adjustment_notes : null;
        const currentStatus = existing && existing.status === 'paid' ? 'paid' : 'pending';
        const currentPaidDate = existing ? existing.paid_date : null;

        const totalPayable = Math.max(0, Math.round((commAmount + fixedSal + currentAdjustments) * 100) / 100);

        // Vencimento previsto baseado no payment_day
        const payDay = p.payment_day || 5;
        const dueDate = `${periodMonth}-${String(payDay).padStart(2, '0')}`;

        results.push({
          id: existing?.id || undefined,
          professionalId: p.id,
          professionalName: p.name,
          periodMonth,
          remunerationType: remType,
          appointmentsCount: apptCount,
          producedAmount: produced,
          commissionPercentage: generalCommPct,
          commissionAmount: commAmount,
          fixedSalary: fixedSal,
          adjustments: currentAdjustments,
          adjustmentNotes: currentAdjNotes,
          totalPayable,
          dueDate,
          paidDate: currentPaidDate,
          status: currentStatus,
          isLocked: false,
          commissionBreakdown: breakdownItems
        });
      }

      res.json({
        success: true,
        periodMonth,
        calculatedCount: results.length,
        results
      });
    } catch (err: any) {
      console.error('[PayrollController.calculate] Erro:', err);
      res.status(500).json({ success: false, error: 'Erro ao calcular folha de pagamento' });
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
        adjustments, adjustmentNotes, totalPayable, dueDate, paidDate, status, notes,
        commissionBreakdown
      } = req.body;

      if (!professionalId || !periodMonth) {
        res.status(400).json({ error: 'Profissional e período (YYYY-MM) são obrigatórios' });
        return;
      }

      const recordId = id || ('pay-' + uuidv4().slice(0, 8));

      // Verifica se já existe registro para esse profissional no mês
      const existing = db.prepare(`
        SELECT id, status FROM professional_payrolls
        WHERE tenant_id = ? AND professional_id = ? AND period_month = ?
      `).get(tenantId, professionalId, periodMonth) as { id: string; status: string } | undefined;

      if (existing && existing.status === 'paid') {
        res.status(409).json({
          code: 'PAYROLL_ALREADY_PAID',
          error: 'Esta folha já foi quitada e seu histórico congelado não pode ser sobrescrito.'
        });
        return;
      }

      const targetId = existing ? existing.id : recordId;
      const breakdownJson = Array.isArray(commissionBreakdown) ? JSON.stringify(commissionBreakdown) : null;

      const saveTx = db.transaction(() => {
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
              commission_breakdown_json = COALESCE(?, commission_breakdown_json),
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
            breakdownJson,
            targetId,
            tenantId
          );
        } else {
          db.prepare(`
            INSERT INTO professional_payrolls (
              id, tenant_id, professional_id, period_month, remuneration_type,
              appointments_count, produced_amount, commission_percentage, commission_amount,
              fixed_salary, adjustments, adjustment_notes, total_payable,
              due_date, paid_date, status, notes, commission_breakdown_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
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
            notes || null,
            breakdownJson
          );
        }

        if (Array.isArray(commissionBreakdown)) {
          db.prepare('DELETE FROM payroll_items WHERE payroll_id = ? AND tenant_id = ?').run(targetId, tenantId);
          const insItem = db.prepare(`
            INSERT INTO payroll_items (
              id, tenant_id, payroll_id, professional_id, service_id, appointment_id,
              occurrence_id, service_name_snapshot, service_kind_snapshot, eligible_students_count,
              gross_basis_amount, rule_source, commission_type, commission_rate, group_payout_basis, commission_amount
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const item of commissionBreakdown) {
            insItem.run(
              'pi-' + uuidv4().slice(0, 8),
              tenantId,
              targetId,
              professionalId,
              item.serviceId || null,
              item.appointmentId || null,
              item.occurrenceId || null,
              item.serviceName || 'Serviço',
              item.serviceKind || 'individual',
              Number(item.eligibleStudentsCount || 1),
              Number(item.grossBasisAmount || 0),
              item.ruleSource || 'none',
              item.commissionType || 'percentage',
              Number(item.commissionRate || 0),
              item.groupPayoutBasis || null,
              Number(item.commissionAmount || 0)
            );
          }
        }
      });

      saveTx();

      logAudit(req, 'SAVE_PAYROLL', 'professional_payrolls', targetId, { professionalId, periodMonth, totalPayable, status });
      const updated = db.prepare('SELECT * FROM professional_payrolls WHERE id = ? AND tenant_id = ?').get(targetId, tenantId);
      res.json({ success: true, id: targetId, message: 'Lançamento de pagamento salvo com sucesso', payroll: updated });
    } catch (err: any) {
      console.error('[PayrollController.save] Erro:', err);
      res.status(500).json({ success: false, error: 'Erro ao salvar pagamento' });
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
        res.status(400).json({ success: false, error: `Status inválido. Permitidos: ${allowed.join(', ')}` });
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
      const updated = db.prepare('SELECT * FROM professional_payrolls WHERE id = ? AND tenant_id = ?').get(id, tenantId);
      res.json({ success: true, message: 'Status de pagamento atualizado com sucesso', status, paidDate: finalPaidDate, payroll: updated });
    } catch (err: any) {
      console.error('[PayrollController.updateStatus] Erro:', err);
      res.status(500).json({ success: false, error: 'Erro ao atualizar status de pagamento' });
    }
  }

  // Baixa direta / Registro de quitação com data e notas
  static markPaid(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const { paidDate, notes } = req.body;

      const finalPaidDate = paidDate || new Date().toISOString().split('T')[0];

      db.prepare(`
        UPDATE professional_payrolls SET
          status = 'paid',
          paid_date = ?,
          notes = COALESCE(?, notes),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(finalPaidDate, notes || null, id, tenantId);

      logAudit(req, 'MARK_PAYROLL_PAID', 'professional_payrolls', id, { paidDate: finalPaidDate });
      const updated = db.prepare('SELECT * FROM professional_payrolls WHERE id = ? AND tenant_id = ?').get(id, tenantId);
      res.json({ success: true, message: 'Pagamento registrado com sucesso!', status: 'paid', paidDate: finalPaidDate, payroll: updated });
    } catch (err: any) {
      console.error('[PayrollController.markPaid] Erro:', err);
      res.status(500).json({ success: false, error: 'Erro ao registrar pagamento' });
    }
  }

  // Excluir lançamento de folha/pagamento
  static delete(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      db.prepare('DELETE FROM professional_payrolls WHERE id = ? AND tenant_id = ?').run(id, tenantId);
      logAudit(req, 'DELETE_PAYROLL', 'professional_payrolls', id);
      res.json({ success: true, message: 'Lançamento de pagamento excluído com sucesso' });
    } catch (err: any) {
      console.error('[PayrollController.delete] Erro:', err);
      res.status(500).json({ success: false, error: 'Erro ao excluir lançamento' });
    }
  }

  /**
   * Lista serviços do profissional + regras de comissão específicas configuradas
   * GET /v1/professionals/:id/service-commissions
   */
  static getServiceCommissions(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const professionalId = String(req.params.id || '');
      if (!tenantId || !professionalId) {
        res.status(400).json({ error: 'Estabelecimento e profissional são obrigatórios.' });
        return;
      }

      const prof = db.prepare(`
        SELECT id, user_id, name, commission_percentage, remuneration_type
        FROM professionals
        WHERE id = ? AND tenant_id = ? AND active = 1
      `).get(professionalId, tenantId) as any;

      if (!prof) {
        res.status(404).json({ error: 'Profissional não encontrado neste estabelecimento.' });
        return;
      }

      if (req.user?.role === 'professional' && prof.user_id !== req.user.userId) {
        res.status(403).json({ error: 'Sem permissão para visualizar comissões de outro profissional.' });
        return;
      }

      const services = db.prepare(`
        SELECT DISTINCT
          s.id as service_id,
          s.name as service_name,
          COALESCE(ps.custom_price, s.price, 0) as price,
          COALESCE(s.service_kind, 'individual') as service_kind,
          s.default_capacity,
          psc.id as rule_id,
          psc.commission_type,
          psc.commission_value,
          COALESCE(psc.group_payout_basis, 'per_present_student') as group_payout_basis,
          COALESCE(psc.active, 0) as rule_active
        FROM services s
        LEFT JOIN professional_services ps ON ps.service_id = s.id AND ps.professional_id = ?
        LEFT JOIN professional_service_commissions psc ON psc.service_id = s.id AND psc.professional_id = ? AND psc.tenant_id = s.tenant_id
        WHERE s.tenant_id = ?
          AND s.active = 1
          AND (
            s.professional_id = ?
            OR s.professional_id IS NULL
            OR ps.professional_id = ?
            OR psc.id IS NOT NULL
          )
        ORDER BY s.name ASC
      `).all(professionalId, professionalId, tenantId, professionalId, professionalId) as any[];

      res.json({
        professionalId: prof.id,
        professionalName: prof.name,
        generalCommissionPercentage: Number(prof.commission_percentage || 0),
        remunerationType: prof.remuneration_type || 'commission',
        services
      });
    } catch (err: any) {
      console.error('[PayrollController.getServiceCommissions] Erro:', err);
      res.status(500).json({ error: 'Erro ao carregar comissões por serviço.' });
    }
  }

  /**
   * Salva em lote regras específicas de comissão por serviço para um profissional
   * PUT /v1/professionals/:id/service-commissions
   */
  static upsertServiceCommissions(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const professionalId = String(req.params.id || '');
      const { rules } = req.body || {};

      if (!tenantId || !professionalId) {
        res.status(400).json({ error: 'Estabelecimento e profissional são obrigatórios.' });
        return;
      }
      if (!Array.isArray(rules)) {
        res.status(400).json({ error: 'Envie uma lista de regras em rules.' });
        return;
      }

      const prof = db.prepare(`
        SELECT id FROM professionals WHERE id = ? AND tenant_id = ? AND active = 1
      `).get(professionalId, tenantId);
      if (!prof) {
        res.status(404).json({ error: 'Profissional não encontrado neste estabelecimento.' });
        return;
      }

      const tx = db.transaction(() => {
        for (const r of rules) {
          const serviceId = String(r?.serviceId || '').trim();
          if (!serviceId) continue;

          const srv = db.prepare('SELECT id FROM services WHERE id = ? AND tenant_id = ?').get(serviceId, tenantId);
          if (!srv) continue;

          const active = r.active !== undefined ? (r.active ? 1 : 0) : 1;
          const commissionType = r.commissionType === 'fixed' ? 'fixed' : 'percentage';
          const rawVal = Number(r.commissionValue ?? 0);
          if (!Number.isFinite(rawVal) || rawVal < 0) {
            throw { status: 400, error: 'O valor da comissão deve ser maior ou igual a zero.' };
          }
          if (commissionType === 'percentage' && rawVal > 100) {
            throw { status: 400, error: 'O percentual de comissão não pode ultrapassar 100%.' };
          }
          const commissionValue = Math.round(rawVal * 100) / 100;
          const groupPayoutBasis = r.groupPayoutBasis === 'per_class' ? 'per_class' : 'per_present_student';

          if (!active) {
            db.prepare(`
              DELETE FROM professional_service_commissions
              WHERE tenant_id = ? AND professional_id = ? AND service_id = ?
            `).run(tenantId, professionalId, serviceId);
            continue;
          }

          db.prepare(`
            INSERT INTO professional_service_commissions (
              id, tenant_id, professional_id, service_id, commission_type, commission_value, group_payout_basis, active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
            ON CONFLICT(tenant_id, professional_id, service_id) DO UPDATE SET
              commission_type = excluded.commission_type,
              commission_value = excluded.commission_value,
              group_payout_basis = excluded.group_payout_basis,
              active = 1,
              updated_at = datetime('now')
          `).run(
            'psc-' + uuidv4().slice(0, 8),
            tenantId,
            professionalId,
            serviceId,
            commissionType,
            commissionValue,
            groupPayoutBasis
          );
        }
      });

      try {
        tx();
      } catch (txErr: any) {
        if (txErr?.status === 400) {
          res.status(400).json({ error: txErr.error });
          return;
        }
        throw txErr;
      }

      logAudit(req, 'UPSERT_SERVICE_COMMISSIONS', 'professionals', professionalId, { rulesCount: rules.length });
      res.json({ success: true, message: 'Comissões por serviço salvas com sucesso.' });
    } catch (err: any) {
      console.error('[PayrollController.upsertServiceCommissions] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar comissões por serviço.' });
    }
  }

  /**
   * Remove regra específica de comissão por serviço
   * DELETE /v1/professionals/:id/service-commissions/:serviceId
   */
  static deleteServiceCommission(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const professionalId = String(req.params.id || '');
      const serviceId = String(req.params.serviceId || '');

      if (!tenantId || !professionalId || !serviceId) {
        res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
        return;
      }

      db.prepare(`
        DELETE FROM professional_service_commissions
        WHERE tenant_id = ? AND professional_id = ? AND service_id = ?
      `).run(tenantId, professionalId, serviceId);

      logAudit(req, 'DELETE_SERVICE_COMMISSION', 'professionals', professionalId, { serviceId });
      res.json({ success: true, message: 'Regra de comissão removida.' });
    } catch (err: any) {
      console.error('[PayrollController.deleteServiceCommission] Erro:', err);
      res.status(500).json({ error: 'Erro ao remover regra de comissão.' });
    }
  }
}
