import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';
import { getUserPermissions } from '../middlewares/rbac.middleware';
import { PackageService } from '../services/package.service';

function getClinicTodayIso(): string {
  // Usa fuso padrão America/Sao_Paulo (-03:00) de forma determinística
  const now = new Date(Date.now() - 3 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getOwnProfessionalIds(userId: string, tenantId: string): string[] {
  return (db.prepare(`
    SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ? AND active = 1
  `).all(userId, tenantId) as { id: string }[]).map(r => r.id);
}

function getBillingScope(req: Request, tenantId: string): {
  canViewAllFinancial: boolean;
  canManageCollections: boolean;
  ownProfIds: string[];
} {
  const role = req.user?.role;
  const userId = req.user?.userId || '';
  const perms = userId ? getUserPermissions(userId, tenantId, role || 'professional') : [];

  if (role === 'superadmin' || role === 'clinic_admin') {
    return { canViewAllFinancial: true, canManageCollections: true, ownProfIds: [] };
  }
  if (role === 'receptionist') {
    return { canViewAllFinancial: true, canManageCollections: true, ownProfIds: [] };
  }
  const hasFinancialPerm = perms.includes('view_financial') || perms.includes('manage_financial');
  const ownProfIds = userId ? getOwnProfessionalIds(userId, tenantId) : [];
  return {
    canViewAllFinancial: hasFinancialPerm,
    canManageCollections: perms.includes('manage_financial'),
    ownProfIds
  };
}

function deriveCollectionStatus(rawStatus: string, effectiveDueDate: string, todayIso: string, dueSoonCutoffIso: string): string {
  if (rawStatus === 'paid') return 'paid';
  if (rawStatus === 'cancelled') return 'cancelled';
  if (rawStatus === 'refunded') return 'refunded';
  if (rawStatus === 'exempt') return 'exempt';
  if (effectiveDueDate && effectiveDueDate < todayIso) return 'overdue';
  if (effectiveDueDate && effectiveDueDate <= dueSoonCutoffIso) return 'due_soon';
  return 'pending';
}

export class BillingCenterController {
  /**
   * Resumo enxuto de cobranças e recebimentos para o card do Painel
   * GET /v1/financial/collections/summary
   */
  static getSummary(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Tenant ID required' });
        return;
      }

      const scope = getBillingScope(req, tenantId);
      if (!scope.canViewAllFinancial && scope.ownProfIds.length === 0) {
        res.json({
          scope: 'restricted',
          overdueCount: 0,
          overdueAmount: 0,
          dueSoonCount: 0,
          dueSoonAmount: 0,
          pendingCount: 0,
          pendingAmount: 0,
          paidPeriodCount: 0,
          paidPeriodAmount: 0,
          activeRecurringPlansCount: 0
        });
        return;
      }

      const todayIso = getClinicTodayIso();
      const dueSoonCutoff = addDaysIso(todayIso, 7);
      const currentMonth = todayIso.slice(0, 7);

      const startDate = req.query.startDate ? String(req.query.startDate).slice(0, 10) : `${currentMonth}-01`;
      const endDate = req.query.endDate ? String(req.query.endDate).slice(0, 10) : `${currentMonth}-${String(getLastDayOfMonth(Number(currentMonth.slice(0, 4)), Number(currentMonth.slice(5, 7)))).padStart(2, '0')}`;

      let sql = `
        SELECT
          pay.id,
          pay.amount,
          pay.status,
          pay.payment_date,
          pay.created_at,
          COALESCE(pay.due_date, substr(a.start_time, 1, 10), substr(pay.created_at, 1, 10)) as effective_due_date,
          COALESCE(pay.professional_id, a.professional_id) as effective_professional_id
        FROM payments pay
        LEFT JOIN appointments a ON a.id = pay.appointment_id AND a.tenant_id = pay.tenant_id
        WHERE pay.tenant_id = ?
      `;
      const params: any[] = [tenantId];

      if (!scope.canViewAllFinancial) {
        const ph = scope.ownProfIds.map(() => '?').join(', ');
        sql += ` AND COALESCE(pay.professional_id, a.professional_id) IN (${ph})`;
        params.push(...scope.ownProfIds);
      }

      const rows = db.prepare(sql).all(...params) as any[];

      let overdueCount = 0;
      let overdueAmount = 0;
      let dueSoonCount = 0;
      let dueSoonAmount = 0;
      let pendingCount = 0;
      let pendingAmount = 0;
      let paidPeriodCount = 0;
      let paidPeriodAmount = 0;

      for (const r of rows) {
        const amt = Number(r.amount || 0);
        const effDue = String(r.effective_due_date || '').slice(0, 10);
        const derived = deriveCollectionStatus(String(r.status || 'pending'), effDue, todayIso, dueSoonCutoff);

        if (derived === 'overdue') {
          overdueCount += 1;
          overdueAmount = Math.round((overdueAmount + amt) * 100) / 100;
          pendingCount += 1;
          pendingAmount = Math.round((pendingAmount + amt) * 100) / 100;
        } else if (derived === 'due_soon') {
          dueSoonCount += 1;
          dueSoonAmount = Math.round((dueSoonAmount + amt) * 100) / 100;
          pendingCount += 1;
          pendingAmount = Math.round((pendingAmount + amt) * 100) / 100;
        } else if (derived === 'pending') {
          pendingCount += 1;
          pendingAmount = Math.round((pendingAmount + amt) * 100) / 100;
        } else if (derived === 'paid') {
          const paidDay = String(r.payment_date || r.created_at || '').slice(0, 10);
          if (!startDate || !endDate || (paidDay >= startDate && paidDay <= endDate)) {
            paidPeriodCount += 1;
            paidPeriodAmount = Math.round((paidPeriodAmount + amt) * 100) / 100;
          }
        }
      }

      let activePlansCount = 0;
      if (scope.canViewAllFinancial) {
        const planRow = db.prepare(`SELECT COUNT(*) as c FROM recurring_billing_plans WHERE tenant_id = ? AND status = 'active'`).get(tenantId) as { c: number };
        activePlansCount = Number(planRow?.c || 0);
      }

      res.json({
        scope: scope.canViewAllFinancial ? 'clinic' : 'professional',
        todayIso,
        period: { startDate, endDate },
        overdueCount,
        overdueAmount,
        dueSoonCount,
        dueSoonAmount,
        pendingCount,
        pendingAmount,
        paidPeriodCount,
        paidPeriodAmount,
        activeRecurringPlansCount: activePlansCount
      });
    } catch (err: any) {
      console.error('[BillingCenterController.getSummary] Erro:', err);
      res.status(500).json({ error: 'Erro ao carregar resumo de cobranças.' });
    }
  }

  /**
   * Lista completa da Central de Cobranças & Recebimentos com filtros avançados
   * GET /v1/financial/collections
   */
  static listCollections(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Tenant ID required' });
        return;
      }

      const scope = getBillingScope(req, tenantId);
      if (!scope.canViewAllFinancial && scope.ownProfIds.length === 0) {
        res.json({ scope: 'restricted', collections: [] });
        return;
      }

      const todayIso = getClinicTodayIso();
      const dueSoonCutoff = addDaysIso(todayIso, 7);

      const statusFilter = req.query.status ? String(req.query.status) : 'all';
      const startDate = req.query.startDate ? String(req.query.startDate).slice(0, 10) : '';
      const endDate = req.query.endDate ? String(req.query.endDate).slice(0, 10) : '';
      const patientId = req.query.patientId ? String(req.query.patientId) : '';
      const serviceId = req.query.serviceId ? String(req.query.serviceId) : '';
      const professionalId = req.query.professionalId ? String(req.query.professionalId) : '';
      const modality = req.query.modality ? String(req.query.modality).trim().toLowerCase() : '';
      const search = req.query.search ? String(req.query.search).trim().toLowerCase() : '';

      let sql = `
        SELECT
          pay.id,
          pay.tenant_id,
          pay.appointment_id,
          pay.patient_id,
          pay.amount,
          pay.base_amount,
          pay.discount_amount,
          pay.additional_amount,
          pay.payment_method,
          pay.status as raw_status,
          pay.payment_date,
          pay.notes,
          pay.due_date,
          pay.recurring_plan_id,
          pay.package_contract_id,
          pay.competence_month,
          pay.created_at,
          COALESCE(pay.due_date, substr(a.start_time, 1, 10), substr(pay.created_at, 1, 10)) as effective_due_date,
          COALESCE(pay.service_id, a.service_id, rbp.service_id) as effective_service_id,
          COALESCE(pay.professional_id, a.professional_id, rbp.professional_id) as effective_professional_id,
          pat.full_name as patient_name,
          pat.phone as patient_phone,
          pat.whatsapp as patient_whatsapp,
          COALESCE(NULLIF(TRIM(pat.whatsapp), ''), pat.phone) as patient_contact_phone,
          spc.package_name_snapshot as package_name,
          COALESCE(spc.package_name_snapshot, s.name, rbp.title, 'Cobrança avulsa') as service_name,
          COALESCE(s.modality_category, '') as modality_category,
          COALESCE(p.name, '') as professional_name,
          a.appointment_number,
          a.start_time as appointment_start_time,
          rbp.title as recurring_plan_title,
          (SELECT rec.id FROM receipts rec WHERE (rec.payment_id = pay.id OR (pay.appointment_id IS NOT NULL AND rec.appointment_id = pay.appointment_id)) AND rec.tenant_id = pay.tenant_id ORDER BY rec.sequence_number DESC LIMIT 1) as receipt_id,
          (SELECT rec.receipt_number FROM receipts rec WHERE (rec.payment_id = pay.id OR (pay.appointment_id IS NOT NULL AND rec.appointment_id = pay.appointment_id)) AND rec.tenant_id = pay.tenant_id ORDER BY rec.sequence_number DESC LIMIT 1) as receipt_number
        FROM payments pay
        JOIN patients pat ON pat.id = pay.patient_id
        LEFT JOIN appointments a ON a.id = pay.appointment_id AND a.tenant_id = pay.tenant_id
        LEFT JOIN recurring_billing_plans rbp ON rbp.id = pay.recurring_plan_id AND rbp.tenant_id = pay.tenant_id
        LEFT JOIN student_package_contracts spc ON spc.id = pay.package_contract_id AND spc.tenant_id = pay.tenant_id
        LEFT JOIN services s ON s.id = COALESCE(pay.service_id, a.service_id, rbp.service_id)
        LEFT JOIN professionals p ON p.id = COALESCE(pay.professional_id, a.professional_id, rbp.professional_id)
        WHERE pay.tenant_id = ?
      `;
      const params: any[] = [tenantId];

      if (!scope.canViewAllFinancial) {
        const ph = scope.ownProfIds.map(() => '?').join(', ');
        sql += ` AND COALESCE(pay.professional_id, a.professional_id, rbp.professional_id) IN (${ph})`;
        params.push(...scope.ownProfIds);
      } else if (professionalId) {
        sql += ` AND COALESCE(pay.professional_id, a.professional_id, rbp.professional_id) = ?`;
        params.push(professionalId);
      }

      if (patientId) {
        sql += ` AND pay.patient_id = ?`;
        params.push(patientId);
      }
      if (serviceId) {
        sql += ` AND COALESCE(pay.service_id, a.service_id, rbp.service_id) = ?`;
        params.push(serviceId);
      }

      sql += ` ORDER BY effective_due_date DESC, pay.created_at DESC LIMIT 400`;

      const rawRows = db.prepare(sql).all(...params) as any[];
      const mapped = rawRows.map(row => {
        const effDue = String(row.effective_due_date || '').slice(0, 10);
        const derivedStatus = deriveCollectionStatus(String(row.raw_status || 'pending'), effDue, todayIso, dueSoonCutoff);
        return {
          ...row,
          effective_due_date: effDue,
          derived_status: derivedStatus,
          is_recurring: Boolean(row.recurring_plan_id)
        };
      }).filter(item => {
        if (statusFilter && statusFilter !== 'all') {
          if (statusFilter === 'open') {
            if (!['overdue', 'due_soon', 'pending'].includes(item.derived_status)) return false;
          } else if (item.derived_status !== statusFilter) {
            return false;
          }
        }
        if (startDate && item.effective_due_date && item.effective_due_date < startDate) return false;
        if (endDate && item.effective_due_date && item.effective_due_date > endDate) return false;
        if (modality) {
          const modText = `${item.modality_category || ''} ${item.service_name || ''}`.toLowerCase();
          if (!modText.includes(modality)) return false;
        }
        if (search) {
          const hay = `${item.patient_name || ''} ${item.service_name || ''} ${item.package_name || ''} ${item.professional_name || ''} ${item.appointment_number || ''} ${item.competence_month || ''}`.toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      });

      res.json({
        scope: scope.canViewAllFinancial ? 'clinic' : 'professional',
        canManageCollections: scope.canManageCollections,
        todayIso,
        collections: mapped
      });
    } catch (err: any) {
      console.error('[BillingCenterController.listCollections] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar cobranças e recebimentos.' });
    }
  }

  /**
   * Marca uma cobrança como paga na Central de Cobranças
   * POST /v1/financial/collections/:paymentId/mark-paid
   */
  static markPaid(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const paymentId = String(req.params.paymentId || '');
      const { paymentMethod, notes } = req.body || {};

      if (!tenantId || !paymentId) {
        res.status(400).json({ error: 'Estabelecimento e cobrança são obrigatórios.' });
        return;
      }

      const scope = getBillingScope(req, tenantId);
      if (!scope.canManageCollections) {
        res.status(403).json({ error: 'Sem permissão para dar baixa em cobranças.' });
        return;
      }

      const existing = db.prepare(`SELECT * FROM payments WHERE id = ? AND tenant_id = ?`).get(paymentId, tenantId) as any;
      if (!existing) {
        res.status(404).json({ error: 'Cobrança não encontrada.' });
        return;
      }
      if (existing.status === 'cancelled' || existing.status === 'refunded') {
        res.status(409).json({ error: 'Não é possível quitar uma cobrança cancelada ou estornada.' });
        return;
      }

      let cashRegisterId: string | null = existing.cash_register_id || null;
      if (!cashRegisterId) {
        try {
          const openReg = db.prepare(`
            SELECT id FROM cash_registers WHERE tenant_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1
          `).get(tenantId) as any;
          if (openReg) cashRegisterId = openReg.id;
        } catch (_) {}
      }

      const method = paymentMethod || existing.payment_method || 'pix';
      db.prepare(`
        UPDATE payments
        SET status = 'paid',
            payment_method = ?,
            payment_date = COALESCE(payment_date, datetime('now')),
            cash_register_id = COALESCE(cash_register_id, ?),
            notes = CASE WHEN ? IS NOT NULL AND TRIM(?) != '' THEN TRIM(?) ELSE notes END
        WHERE id = ? AND tenant_id = ?
      `).run(method, cashRegisterId, notes || null, notes || '', notes || '', paymentId, tenantId);

      PackageService.activateContractOnPaymentSettled(tenantId, paymentId, req.user?.userId || 'system');

      logAudit(req, 'COLLECTION_MARK_PAID', 'payments', paymentId, { paymentMethod: method });

      const updated = db.prepare('SELECT * FROM payments WHERE id = ? AND tenant_id = ?').get(paymentId, tenantId);
      res.json({
        success: true,
        message: 'Pagamento registrado com sucesso!',
        payment: updated
      });
    } catch (err: any) {
      console.error('[BillingCenterController.markPaid] Erro:', err);
      res.status(500).json({ error: 'Erro ao registrar quitação da cobrança.' });
    }
  }

  /**
   * Lista planos de mensalidade recorrente
   * GET /v1/financial/recurring-plans
   */
  static listRecurringPlans(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Tenant ID required' });
        return;
      }

      const scope = getBillingScope(req, tenantId);
      if (!scope.canViewAllFinancial && scope.ownProfIds.length === 0) {
        res.json({ plans: [] });
        return;
      }

      let sql = `
        SELECT
          rbp.*,
          pat.full_name as patient_name,
          pat.phone as patient_phone,
          s.name as service_name,
          p.name as professional_name
        FROM recurring_billing_plans rbp
        JOIN patients pat ON pat.id = rbp.patient_id
        LEFT JOIN services s ON s.id = rbp.service_id
        LEFT JOIN professionals p ON p.id = rbp.professional_id
        WHERE rbp.tenant_id = ?
      `;
      const params: any[] = [tenantId];

      if (!scope.canViewAllFinancial) {
        const ph = scope.ownProfIds.map(() => '?').join(', ');
        sql += ` AND rbp.professional_id IN (${ph})`;
        params.push(...scope.ownProfIds);
      }

      sql += ` ORDER BY CASE WHEN rbp.status = 'active' THEN 0 ELSE 1 END, pat.full_name ASC`;

      const plans = db.prepare(sql).all(...params);
      res.json({
        canManageCollections: scope.canManageCollections,
        plans
      });
    } catch (err: any) {
      console.error('[BillingCenterController.listRecurringPlans] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar mensalidades recorrentes.' });
    }
  }

  /**
   * Cria plano de mensalidade recorrente
   * POST /v1/financial/recurring-plans
   */
  static createRecurringPlan(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Tenant ID required' });
        return;
      }

      const scope = getBillingScope(req, tenantId);
      if (!scope.canManageCollections) {
        res.status(403).json({ error: 'Sem permissão para criar mensalidades recorrentes.' });
        return;
      }

      const {
        patientId,
        serviceId,
        professionalId,
        title,
        amount,
        dueDay,
        paymentMethod,
        startDate,
        endDate,
        notes,
        generateCurrentMonth
      } = req.body || {};

      if (!patientId || !title || !String(title).trim()) {
        res.status(400).json({ error: 'Aluno/paciente e título do plano são obrigatórios.' });
        return;
      }

      const numAmount = Number(amount);
      if (!Number.isFinite(numAmount) || numAmount <= 0) {
        res.status(400).json({ error: 'Valor da mensalidade deve ser maior que zero.' });
        return;
      }

      const parsedDueDay = Math.min(28, Math.max(1, Math.floor(Number(dueDay) || 5)));
      const patientRow = db.prepare('SELECT id FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId);
      if (!patientRow) {
        res.status(404).json({ error: 'Aluno/paciente não encontrado neste estabelecimento.' });
        return;
      }

      if (serviceId && !db.prepare('SELECT id FROM services WHERE id = ? AND tenant_id = ?').get(serviceId, tenantId)) {
        res.status(400).json({ error: 'Serviço inválido neste estabelecimento.' });
        return;
      }
      if (professionalId && !db.prepare('SELECT id FROM professionals WHERE id = ? AND tenant_id = ?').get(professionalId, tenantId)) {
        res.status(400).json({ error: 'Profissional inválido neste estabelecimento.' });
        return;
      }

      const id = 'rbp-' + uuidv4().slice(0, 8);
      const effStartDate = startDate ? String(startDate).slice(0, 10) : getClinicTodayIso();
      const effEndDate = endDate ? String(endDate).slice(0, 10) : null;
      const roundedAmount = Math.round(numAmount * 100) / 100;

      db.prepare(`
        INSERT INTO recurring_billing_plans (
          id, tenant_id, patient_id, service_id, professional_id,
          title, amount, billing_cycle, due_day, payment_method,
          start_date, end_date, status, notes, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'monthly', ?, ?, ?, ?, 'active', ?, ?, datetime('now'), datetime('now'))
      `).run(
        id,
        tenantId,
        patientId,
        serviceId || null,
        professionalId || null,
        String(title).trim(),
        roundedAmount,
        parsedDueDay,
        paymentMethod || 'pix',
        effStartDate,
        effEndDate,
        notes ? String(notes).trim() : null,
        req.user?.userId || 'system'
      );

      let generatedInitialPayment = false;
      if (generateCurrentMonth) {
        const compMonth = effStartDate.slice(0, 7);
        const lastDay = getLastDayOfMonth(Number(compMonth.slice(0, 4)), Number(compMonth.slice(5, 7)));
        const dueDate = `${compMonth}-${String(Math.min(parsedDueDay, lastDay)).padStart(2, '0')}`;
        const payRes = db.prepare(`
          INSERT OR IGNORE INTO payments (
            id, tenant_id, appointment_id, patient_id, amount, payment_method, status, notes,
            service_id, base_amount, due_date, recurring_plan_id, competence_month, professional_id
          ) VALUES (?, ?, NULL, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'pay-' + uuidv4().slice(0, 8),
          tenantId,
          patientId,
          roundedAmount,
          paymentMethod || 'pix',
          `Mensalidade ${String(title).trim()} (${compMonth})`,
          serviceId || null,
          roundedAmount,
          dueDate,
          id,
          compMonth,
          professionalId || null
        );
        generatedInitialPayment = payRes.changes > 0;
        if (generatedInitialPayment) {
          db.prepare('UPDATE recurring_billing_plans SET last_generated_month = ? WHERE id = ?').run(compMonth, id);
        }
      }

      logAudit(req, 'CREATE_RECURRING_BILLING_PLAN', 'recurring_billing_plans', id, {
        patientId,
        amount: roundedAmount,
        dueDay: parsedDueDay
      });

      const created = db.prepare('SELECT * FROM recurring_billing_plans WHERE id = ?').get(id);
      res.status(201).json({
        success: true,
        plan: created,
        generatedInitialPayment
      });
    } catch (err: any) {
      console.error('[BillingCenterController.createRecurringPlan] Erro:', err);
      res.status(500).json({ error: 'Erro ao criar mensalidade recorrente.' });
    }
  }

  /**
   * Atualiza ou pausa/cancela um plano de mensalidade recorrente
   * PUT /v1/financial/recurring-plans/:id
   */
  static updateRecurringPlan(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const id = String(req.params.id || '');
      if (!tenantId || !id) {
        res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
        return;
      }

      const scope = getBillingScope(req, tenantId);
      if (!scope.canManageCollections) {
        res.status(403).json({ error: 'Sem permissão para alterar mensalidades recorrentes.' });
        return;
      }

      const existing = db.prepare('SELECT * FROM recurring_billing_plans WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!existing) {
        res.status(404).json({ error: 'Plano de mensalidade não encontrado.' });
        return;
      }

      const { title, amount, dueDay, paymentMethod, status, endDate, notes, serviceId, professionalId } = req.body || {};
      const nextStatus = ['active', 'paused', 'cancelled'].includes(status) ? status : existing.status;
      const nextAmount = amount !== undefined ? Math.round(Number(amount) * 100) / 100 : existing.amount;
      if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
        res.status(400).json({ error: 'Valor inválido.' });
        return;
      }
      const nextDueDay = dueDay !== undefined ? Math.min(28, Math.max(1, Math.floor(Number(dueDay)))) : existing.due_day;

      db.prepare(`
        UPDATE recurring_billing_plans
        SET title = ?,
            amount = ?,
            due_day = ?,
            payment_method = ?,
            status = ?,
            end_date = ?,
            notes = ?,
            service_id = ?,
            professional_id = ?,
            updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(
        title !== undefined ? String(title).trim() : existing.title,
        nextAmount,
        nextDueDay,
        paymentMethod !== undefined ? paymentMethod : existing.payment_method,
        nextStatus,
        endDate !== undefined ? (endDate ? String(endDate).slice(0, 10) : null) : existing.end_date,
        notes !== undefined ? (notes ? String(notes).trim() : null) : existing.notes,
        serviceId !== undefined ? (serviceId || null) : existing.service_id,
        professionalId !== undefined ? (professionalId || null) : existing.professional_id,
        id,
        tenantId
      );

      logAudit(req, 'UPDATE_RECURRING_BILLING_PLAN', 'recurring_billing_plans', id, { status: nextStatus, amount: nextAmount });
      const updated = db.prepare('SELECT * FROM recurring_billing_plans WHERE id = ? AND tenant_id = ?').get(id, tenantId);
      res.json({ success: true, plan: updated });
    } catch (err: any) {
      console.error('[BillingCenterController.updateRecurringPlan] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar mensalidade recorrente.' });
    }
  }

  /**
   * Gera cobranças mensais de forma idempotente para os planos ativos na competência YYYY-MM
   * POST /v1/financial/recurring-plans/generate
   */
  static generateMonthlyBills(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Tenant ID required' });
        return;
      }

      const scope = getBillingScope(req, tenantId);
      if (!scope.canManageCollections) {
        res.status(403).json({ error: 'Sem permissão para gerar cobranças mensais.' });
        return;
      }

      const competenceMonth = req.body?.competenceMonth
        ? String(req.body.competenceMonth).trim()
        : getClinicTodayIso().slice(0, 7);

      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competenceMonth)) {
        res.status(400).json({ error: 'Competência inválida. Use o formato YYYY-MM.' });
        return;
      }

      const targetPlanId = req.body?.planId ? String(req.body.planId) : '';
      const year = Number(competenceMonth.slice(0, 4));
      const month = Number(competenceMonth.slice(5, 7));
      const lastDay = getLastDayOfMonth(year, month);
      const monthStart = `${competenceMonth}-01`;
      const monthEnd = `${competenceMonth}-${String(lastDay).padStart(2, '0')}`;

      let planSql = `
        SELECT * FROM recurring_billing_plans
        WHERE tenant_id = ?
          AND status = 'active'
          AND start_date <= ?
          AND (end_date IS NULL OR end_date = '' OR end_date >= ?)
      `;
      const planParams: any[] = [tenantId, monthEnd, monthStart];
      if (targetPlanId) {
        planSql += ` AND id = ?`;
        planParams.push(targetPlanId);
      }

      const activePlans = db.prepare(planSql).all(...planParams) as any[];
      let generatedCount = 0;
      let skippedExistingCount = 0;
      const generatedIds: string[] = [];

      const runTx = db.transaction(() => {
        const insStmt = db.prepare(`
          INSERT OR IGNORE INTO payments (
            id, tenant_id, appointment_id, patient_id, amount, payment_method, status, notes,
            service_id, base_amount, due_date, recurring_plan_id, competence_month, professional_id
          ) VALUES (?, ?, NULL, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
        `);
        const updatePlanStmt = db.prepare(`
          UPDATE recurring_billing_plans
          SET last_generated_month = ?, updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `);

        for (const plan of activePlans) {
          const day = Math.min(Math.max(1, Number(plan.due_day || 5)), lastDay);
          const dueDate = `${competenceMonth}-${String(day).padStart(2, '0')}`;
          const payId = 'pay-' + uuidv4().slice(0, 8);
          const result = insStmt.run(
            payId,
            tenantId,
            plan.patient_id,
            plan.amount,
            plan.payment_method || 'pix',
            `Mensalidade ${plan.title} (${competenceMonth})`,
            plan.service_id || null,
            plan.amount,
            dueDate,
            plan.id,
            competenceMonth,
            plan.professional_id || null
          );

          if (result.changes > 0) {
            generatedCount += 1;
            generatedIds.push(payId);
          } else {
            skippedExistingCount += 1;
          }
          updatePlanStmt.run(competenceMonth, plan.id, tenantId);
        }
      });

      runTx();

      logAudit(req, 'GENERATE_RECURRING_BILLS', 'recurring_billing_plans', targetPlanId || competenceMonth, {
        competenceMonth,
        generatedCount,
        skippedExistingCount
      });

      res.json({
        success: true,
        competenceMonth,
        evaluatedPlans: activePlans.length,
        generatedCount,
        skippedExistingCount,
        generatedIds,
        message: generatedCount > 0
          ? `${generatedCount} mensalidade(s) gerada(s) para ${competenceMonth}.`
          : `Nenhuma nova cobrança gerada para ${competenceMonth} (todas já existentes).`
      });
    } catch (err: any) {
      console.error('[BillingCenterController.generateMonthlyBills] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar mensalidades da competência.' });
    }
  }
}
