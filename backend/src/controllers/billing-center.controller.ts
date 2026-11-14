import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';
import { getUserPermissions } from '../middlewares/rbac.middleware';
import { PackageService } from '../services/package.service';
import {
  BillingCycleService,
  FREQUENCY_PT_LABELS,
  normalizePeriodicFrequency
} from '../services/billing-cycle.service';

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
          pay.billing_cycle_key,
          pay.billing_cycle_start,
          pay.billing_cycle_end,
          COALESCE(pay.billing_frequency, rbp.billing_frequency, rbp.billing_cycle) as billing_frequency,
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

      if (req.query.patientId) {
        sql += ` AND rbp.patient_id = ?`;
        params.push(String(req.query.patientId));
      }
      if (req.query.serviceId) {
        sql += ` AND (rbp.service_id = ? OR rbp.service_id IS NULL)`;
        params.push(String(req.query.serviceId));
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
   * Consulta planos periódicos ativos e pacotes compatíveis de um aluno para cobertura de aula
   * GET /v1/financial/student-coverage
   */
  static getStudentCoverage(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const patientId = req.query.patientId ? String(req.query.patientId) : '';
      const serviceId = req.query.serviceId ? String(req.query.serviceId) : '';
      const targetDate = req.query.date ? String(req.query.date).slice(0, 10) : getClinicTodayIso();

      if (!tenantId || !patientId) {
        res.status(400).json({ error: 'Estabelecimento e aluno são obrigatórios.' });
        return;
      }

      let sql = `
        SELECT
          rbp.*,
          s.name as service_name,
          p.name as professional_name
        FROM recurring_billing_plans rbp
        LEFT JOIN services s ON s.id = rbp.service_id
        LEFT JOIN professionals p ON p.id = rbp.professional_id
        WHERE rbp.tenant_id = ?
          AND rbp.patient_id = ?
          AND rbp.status = 'active'
          AND COALESCE(rbp.covers_sessions, 1) = 1
          AND rbp.package_contract_id IS NULL
          AND rbp.start_date <= ?
          AND (rbp.end_date IS NULL OR rbp.end_date = '' OR rbp.end_date >= ?)
      `;
      const params: any[] = [tenantId, patientId, targetDate, targetDate];
      if (serviceId) {
        sql += ` AND (rbp.service_id = ? OR rbp.service_id IS NULL)`;
        params.push(serviceId);
      }
      sql += ` ORDER BY rbp.start_date DESC, rbp.created_at DESC`;

      const plans = db.prepare(sql).all(...params);
      res.json({ plans, activePeriodicPlans: plans });
    } catch (err: any) {
      console.error('[BillingCenterController.getStudentCoverage] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar cobertura financeira do aluno.' });
    }
  }

  /**
   * Cria plano periódico de cobrança (mensal, trimestral, semestral ou anual)
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
        res.status(403).json({ error: 'Sem permissão para criar planos periódicos de cobrança.' });
        return;
      }

      const {
        patientId,
        serviceId,
        professionalId,
        title,
        amount,
        dueDay,
        firstDueDate,
        paymentMethod,
        startDate,
        endDate,
        notes,
        billingFrequency,
        billingCycle,
        coversSessions,
        generateCurrentMonth,
        generateInitialCycle,
        generateAllContractCycles,
        initialPaymentStatus
      } = req.body || {};

      if (!patientId || !title || !String(title).trim()) {
        res.status(400).json({ error: 'Aluno/paciente e título do plano são obrigatórios.' });
        return;
      }

      const numAmount = Number(amount);
      if (!Number.isFinite(numAmount) || numAmount <= 0) {
        res.status(400).json({ error: 'Valor do período de cobrança deve ser maior que zero.' });
        return;
      }

      const parsedDueDay = Math.min(28, Math.max(1, Math.floor(Number(dueDay) || 10)));
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

      const rawFreq = billingFrequency || billingCycle || 'monthly';
      if (!['monthly', 'quarterly', 'semiannual', 'annual'].includes(String(rawFreq).toLowerCase())) {
        res.status(400).json({ error: 'Periodicidade inválida. Utilize monthly, quarterly, semiannual ou annual.' });
        return;
      }
      const { frequency } = normalizePeriodicFrequency(rawFreq);

      const effStartDate = startDate ? String(startDate).slice(0, 10) : getClinicTodayIso();
      const effEndDate = endDate ? String(endDate).slice(0, 10) : null;
      const roundedAmount = Math.round(numAmount * 100) / 100;

      const result = db.transaction(() => {
        return BillingCycleService.createPeriodicPlanTx({
          tenantId,
          patientId,
          serviceId: serviceId || null,
          professionalId: professionalId || null,
          title: String(title).trim(),
          amount: roundedAmount,
          billingFrequency: frequency,
          dueDay: parsedDueDay,
          firstDueDate: firstDueDate ? String(firstDueDate).slice(0, 10) : null,
          paymentMethod: paymentMethod || 'pix',
          startDate: effStartDate,
          endDate: effEndDate,
          notes: notes ? String(notes).trim() : null,
          coversSessions: coversSessions !== false && coversSessions !== 0,
          generateInitialCycle: Boolean(generateCurrentMonth || generateInitialCycle),
          generateAllContractCycles: Boolean(generateAllContractCycles),
          initialPaymentStatus: initialPaymentStatus === 'paid' ? 'paid' : 'pending',
          createdBy: req.user?.userId || 'system'
        });
      })();

      logAudit(req, 'CREATE_RECURRING_BILLING_PLAN', 'recurring_billing_plans', result.plan.id, {
        patientId,
        amount: roundedAmount,
        dueDay: parsedDueDay,
        billingFrequency: frequency,
        generatedCount: result.generatedIds.length
      });

      res.status(201).json({
        success: true,
        plan: result.plan,
        generatedInitialPayment: result.generatedIds.length > 0,
        generatedPaymentIds: result.generatedIds
      });
    } catch (err: any) {
      console.error('[BillingCenterController.createRecurringPlan] Erro:', err);
      res.status(500).json({ error: 'Erro ao criar plano periódico de cobrança.' });
    }
  }

  /**
   * Atualiza, pausa, reativa, renova ou cancela um plano periódico de cobrança
   * (alterações de valor não alteram competências já faturadas/quitadas)
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
        res.status(403).json({ error: 'Sem permissão para alterar planos periódicos.' });
        return;
      }

      const existing = db.prepare('SELECT * FROM recurring_billing_plans WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!existing) {
        res.status(404).json({ error: 'Plano periódico não encontrado.' });
        return;
      }

      const {
        title,
        amount,
        dueDay,
        paymentMethod,
        status,
        endDate,
        notes,
        serviceId,
        professionalId,
        billingFrequency,
        billingCycle,
        coversSessions,
        cancellationReason,
        cancelPendingCharges
      } = req.body || {};

      const normalizedReqStatus = status === 'ended' ? 'cancelled' : status;
      const nextStatus = ['active', 'paused', 'cancelled'].includes(normalizedReqStatus) ? normalizedReqStatus : existing.status;
      const nextAmount = amount !== undefined ? Math.round(Number(amount) * 100) / 100 : existing.amount;
      if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
        res.status(400).json({ error: 'Valor inválido.' });
        return;
      }
      const nextDueDay = dueDay !== undefined ? Math.min(28, Math.max(1, Math.floor(Number(dueDay)))) : existing.due_day;
      const nextCovers = coversSessions !== undefined ? (coversSessions ? 1 : 0) : (existing.covers_sessions ?? 1);

      let nextFrequency = existing.billing_frequency || existing.billing_cycle || 'monthly';
      let nextCycleMonths = Number(existing.cycle_months || 1);
      if (billingFrequency !== undefined || billingCycle !== undefined) {
        const rawFreq = billingFrequency || billingCycle;
        if (!['monthly', 'quarterly', 'semiannual', 'annual'].includes(String(rawFreq).toLowerCase())) {
          res.status(400).json({ error: 'Periodicidade inválida.' });
          return;
        }
        const norm = normalizePeriodicFrequency(rawFreq);
        nextFrequency = norm.frequency;
        nextCycleMonths = norm.cycleMonths;
      }

      db.transaction(() => {
        db.prepare(`
          UPDATE recurring_billing_plans
          SET title = ?,
              amount = ?,
              billing_cycle = ?,
              billing_frequency = ?,
              cycle_months = ?,
              covers_sessions = ?,
              due_day = ?,
              payment_method = ?,
              status = ?,
              end_date = ?,
              notes = ?,
              service_id = ?,
              professional_id = ?,
              cancelled_at = CASE WHEN ? = 'cancelled' THEN COALESCE(cancelled_at, datetime('now')) WHEN ? = 'active' THEN NULL ELSE cancelled_at END,
              paused_at = CASE WHEN ? = 'paused' THEN COALESCE(paused_at, datetime('now')) WHEN ? = 'active' THEN NULL ELSE paused_at END,
              cancellation_reason = CASE WHEN ? = 'cancelled' THEN COALESCE(?, cancellation_reason) ELSE cancellation_reason END,
              updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(
          title !== undefined ? String(title).trim() : existing.title,
          nextAmount,
          nextFrequency,
          nextFrequency,
          nextCycleMonths,
          nextCovers,
          nextDueDay,
          paymentMethod !== undefined ? paymentMethod : existing.payment_method,
          nextStatus,
          endDate !== undefined ? (endDate ? String(endDate).slice(0, 10) : null) : existing.end_date,
          notes !== undefined ? (notes ? String(notes).trim() : null) : existing.notes,
          serviceId !== undefined ? (serviceId || null) : existing.service_id,
          professionalId !== undefined ? (professionalId || null) : existing.professional_id,
          nextStatus,
          nextStatus,
          nextStatus,
          nextStatus,
          nextStatus,
          cancellationReason ? String(cancellationReason).trim() : null,
          id,
          tenantId
        );

        if (nextStatus === 'cancelled' && cancelPendingCharges) {
          db.prepare(`
            UPDATE payments
            SET status = 'cancelled',
                notes = TRIM(COALESCE(notes, '') || ' • Cancelado junto ao encerramento do plano')
            WHERE tenant_id = ? AND recurring_plan_id = ? AND status IN ('pending')
          `).run(tenantId, id);
        }
      })();

      logAudit(req, 'UPDATE_RECURRING_BILLING_PLAN', 'recurring_billing_plans', id, {
        status: nextStatus,
        amount: nextAmount,
        billingFrequency: nextFrequency
      });
      const updated = db.prepare('SELECT * FROM recurring_billing_plans WHERE id = ? AND tenant_id = ?').get(id, tenantId);
      res.json({ success: true, plan: updated });
    } catch (err: any) {
      console.error('[BillingCenterController.updateRecurringPlan] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar plano periódico.' });
    }
  }

  /**
   * Gera cobranças por ciclos (mensal, trimestral, semestral, anual) de forma idempotente
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
        res.status(403).json({ error: 'Sem permissão para gerar cobranças periódicas.' });
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
      const generateAllContractCycles = Boolean(req.body?.generateAllContractCycles);
      const year = Number(competenceMonth.slice(0, 4));
      const month = Number(competenceMonth.slice(5, 7));
      const lastDay = getLastDayOfMonth(year, month);
      const monthStart = `${competenceMonth}-01`;
      const monthEnd = `${competenceMonth}-${String(lastDay).padStart(2, '0')}`;

      let planSql = `
        SELECT * FROM recurring_billing_plans
        WHERE tenant_id = ?
          AND status = 'active'
      `;
      const planParams: any[] = [tenantId];
      if (!generateAllContractCycles) {
        planSql += ` AND start_date <= ? AND (end_date IS NULL OR end_date = '' OR end_date >= ?)`;
        planParams.push(monthEnd, monthStart);
      }
      if (targetPlanId) {
        planSql += ` AND id = ?`;
        planParams.push(targetPlanId);
      }

      const activePlans = db.prepare(planSql).all(...planParams) as any[];
      let generatedCount = 0;
      let skippedExistingCount = 0;
      const generatedIds: string[] = [];

      const runTx = db.transaction(() => {
        for (const plan of activePlans) {
          const out = BillingCycleService.generateCyclesForPlanTx({
            tenantId,
            plan,
            competenceMonth,
            generateAllContractCycles
          });
          generatedCount += out.generatedIds.length;
          skippedExistingCount += out.skippedCount;
          generatedIds.push(...out.generatedIds);
        }
      });

      runTx();

      logAudit(req, 'GENERATE_RECURRING_BILLS', 'recurring_billing_plans', targetPlanId || competenceMonth, {
        competenceMonth,
        generateAllContractCycles,
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
          ? `${generatedCount} cobrança(s) periódica(s) gerada(s).`
          : `Nenhuma nova cobrança gerada para ${competenceMonth} (ciclos já faturados).`
      });
    } catch (err: any) {
      console.error('[BillingCenterController.generateMonthlyBills] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar cobranças periódicas da competência.' });
    }
  }
}
