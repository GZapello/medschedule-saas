import { db } from '../config/database';
import { BillingCycleService } from '../services/billing-cycle.service';

// Only resolves the commercial basis. Rule precedence, commission arithmetic and
// frozen payroll history remain in PayrollController.
export interface StudioCommissionTerms {
  recognition: 'performed' | 'received';
  allocation: 'none' | 'contract_credits' | 'fixed_session';
  sessionBasis: number;
  revenueSharePercent: number;
}

export function readStudioCommissionTerms(raw: unknown): StudioCommissionTerms {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw as any;
  const terms = {
    recognition: value?.recognition ?? 'performed',
    allocation: value?.allocation ?? 'none',
    sessionBasis: Number(value?.sessionBasis ?? 0),
    revenueSharePercent: Number(value?.revenueSharePercent ?? 100)
  };
  if (!['performed', 'received'].includes(terms.recognition) ||
      !['none', 'contract_credits', 'fixed_session'].includes(terms.allocation) ||
      !Number.isFinite(terms.sessionBasis) || terms.sessionBasis < 0 ||
      !Number.isFinite(terms.revenueSharePercent) || terms.revenueSharePercent < 0 || terms.revenueSharePercent > 100) {
    throw new Error('Informe uma base de comissão e um rateio válidos para Academia & Studio.');
  }
  return terms as StudioCommissionTerms;
}

const money = (n: number) => Math.round(n * 100) / 100;
const json = (value: any): any => { try { return JSON.parse(value || '{}'); } catch { return {}; } };

export function studioPayrollBasis(tenantId: string, row: any, terms: StudioCommissionTerms, periodMonth: string) {
  const isPackageCovered = Boolean(row.package_contract_id || Number(row.is_package_covered));
  const isPeriodicCovered = Boolean(row.recurring_plan_id || row.billing_coverage_type === 'periodic_plan');
  const covered = isPackageCovered || isPeriodicCovered;
  const sessionMonth = String(row.start_time).slice(0, 7);
  const result = {
    netAmount: 0, isPackageCovered, isPeriodicCovered, isExempt: false,
    basisNote: '', recognitionFactor: sessionMonth === periodMonth ? 1 : 0,
    paymentIds: [] as string[], warning: null as string | null
  };
  const contract = row.package_contract_id
    ? db.prepare('SELECT * FROM student_package_contracts WHERE id = ? AND tenant_id = ?').get(row.package_contract_id, tenantId) as any
    : null;
  const entitlement = row.package_entitlement_id
    ? db.prepare('SELECT * FROM student_package_entitlements WHERE id = ? AND tenant_id = ? AND contract_id = ?').get(row.package_entitlement_id, tenantId, row.package_contract_id) as any
    : null;
  let plan = row.recurring_plan_id
    ? db.prepare('SELECT * FROM recurring_billing_plans WHERE id = ? AND tenant_id = ?').get(row.recurring_plan_id, tenantId) as any
    : null;
  const addon = json(entitlement?.addon_pricing_json);
  const contractSnapshot = json(contract?.commercial_snapshot_json);
  const componentPeriodicity = addon.effectivePeriodicity ||
    (entitlement?.service_id === contractSnapshot.serviceId ? contractSnapshot.baseOption?.paymentPeriodicity : null);
  if (!plan && contract) {
    const plans = db.prepare('SELECT * FROM recurring_billing_plans WHERE package_contract_id = ? AND tenant_id = ? ORDER BY created_at, id').all(contract.id, tenantId) as any[];
    plan = plans.find(p => componentPeriodicity && p.billing_frequency === componentPeriodicity) ||
      (!componentPeriodicity && plans.length === 1 ? plans[0] : null);
  }
  // Combined contracts persist the primary recurrence in recurring_billing_plans.
  // Independently billed additions use package payments with their own frequency.
  const separateComponent = Boolean(contract && componentPeriodicity &&
    (!plan || plan.billing_frequency !== componentPeriodicity || ['one_time', 'installments'].includes(componentPeriodicity)));
  if (separateComponent) {
    const schedule = contractSnapshot.breakdown?.recurringSchedules?.find((s: any) => s.periodicity === componentPeriodicity);
    const component = addon.netPriceCents !== undefined ? addon : contractSnapshot.breakdown?.base;
    plan = {
      start_date: addon.startDate || contract.start_date,
      end_date: addon.endDate || contract.end_date,
      billing_frequency: componentPeriodicity,
      payment_periodicity: componentPeriodicity,
      cycle_months: addon.effectiveCycleMonths || schedule?.cycleMonths || 1,
      due_day: contract.due_day_snapshot,
      amount: Number(schedule?.totalCycleAmountCents ?? component?.netPriceCents ?? component?.cycleAmountCents ?? 0) / 100,
      total_contract_amount: Number(component?.totalContractCents ?? component?.totalContractAmountCents ?? 0) / 100,
      included_sessions: entitlement?.credits_total,
      status: contract.contract_status
    };
  }
  const snapshot = json(contract?.commercial_snapshot_json || plan?.commercial_snapshot_json);
  const wholeContract = plan && ['one_time', 'installments'].includes(plan.payment_periodicity);
  const win = plan ? (wholeContract
    ? { cycleStart: plan.start_date, cycleEnd: plan.end_date || '9999-12-31', billingCycleKey: '', competenceMonth: '' }
    : BillingCycleService.findCycleWindowForDate(plan, String(row.start_time).slice(0, 10))) : null;
  let payments: any[] = [];
  if (separateComponent) {
    payments = db.prepare(`SELECT * FROM payments WHERE tenant_id = ? AND package_contract_id = ?
      AND recurring_plan_id IS NULL AND billing_frequency = ?
      AND (? = 1 OR competence_month = ?)
      AND (? = 0 OR service_id = ?) ORDER BY payment_date, id`)
      .all(tenantId, contract.id, componentPeriodicity, wholeContract ? 1 : 0, win?.competenceMonth || '',
        wholeContract ? 1 : 0, row.service_id) as any[];
  } else if (wholeContract) {
    payments = db.prepare('SELECT * FROM payments WHERE tenant_id = ? AND recurring_plan_id = ? ORDER BY payment_date, id').all(tenantId, plan.id) as any[];
  } else if (plan && win) {
    payments = db.prepare(`SELECT * FROM payments WHERE tenant_id = ? AND recurring_plan_id = ?
      AND (billing_cycle_key = ? OR (billing_cycle_key IS NULL AND competence_month = ?)) ORDER BY payment_date, id`)
      .all(tenantId, plan.id, win.billingCycleKey, win.competenceMonth) as any[];
  } else if (contract && !plan) {
    payments = db.prepare('SELECT * FROM payments WHERE tenant_id = ? AND package_contract_id = ? AND recurring_plan_id IS NULL ORDER BY payment_date, id')
      .all(tenantId, contract.id) as any[];
  } else if (!covered) {
    payments = db.prepare('SELECT * FROM payments WHERE tenant_id = ? AND appointment_id = ? ORDER BY payment_date, id').all(tenantId, row.id) as any[];
  }
  const validPayments = payments.filter(p => !['cancelled', 'refunded', 'exempt'].includes(p.status));
  result.isExempt = (payments.length > 0 && validPayments.length === 0) || contract?.payment_status === 'exempt' ||
    ((!validPayments.length) && (contract?.contract_status === 'cancelled' || plan?.status === 'cancelled'));
  let cycleAmount = Number((wholeContract ? plan.total_contract_amount : plan?.amount) ?? contract?.contracted_price ?? row.catalog_price_snapshot ?? row.list_price ?? 0);
  if (!covered && validPayments.length) cycleAmount = validPayments.reduce((n, p) => n + Number(p.amount), 0);
  let allocatedAmount = cycleAmount;
  let credits = Number((wholeContract ? plan.included_sessions : plan?.credits_per_cycle_snapshot) || snapshot.creditsPerCycle || entitlement?.credits_per_cycle_snapshot || 0);
  // Optional additions have their own immutable price and credit snapshots.
  if (entitlement?.entitlement_role === 'addon' || addon.netPriceCents !== undefined) {
    allocatedAmount = Number((wholeContract ? addon.totalContractCents : addon.netPriceCents) ?? addon.netPriceCents ?? 0) / 100;
    credits = Number((wholeContract ? entitlement?.credits_total : entitlement?.credits_per_cycle_snapshot) || addon.creditsPerCycle || 0);
  } else if (contract && snapshot.breakdown?.base && entitlement?.service_id === snapshot.serviceId) {
    allocatedAmount = Number((wholeContract ? snapshot.breakdown.base.totalContractAmountCents : snapshot.breakdown.base.cycleAmountCents) || 0) / 100;
    credits = Number((wholeContract ? entitlement?.credits_total : entitlement?.credits_per_cycle_snapshot) || snapshot.breakdown.base.creditsPerCycle || 0);
  } else if (contract) {
    // A combined package without discriminated snapshots needs an explicit share.
    // Never consult mutable service_package_items or divide by observed attendance.
    credits = plan && !wholeContract ? Number(entitlement?.credits_per_cycle_snapshot || 0) : Number(entitlement?.credits_total || contract.total_credits_snapshot || 0);
  }
  allocatedAmount *= terms.revenueSharePercent / 100;
  let basis = cycleAmount;
  if (covered) {
    if (terms.allocation === 'fixed_session') {
      basis = terms.sessionBasis;
    } else if (terms.allocation === 'contract_credits' && credits > 0) {
      basis = allocatedAmount / credits;
      // A credit can remunerate only one performed session, even after retries,
      // renewals, or accidental overbooking of the same contractual cycle.
      const refColumn = contract ? 'package_contract_id' : 'recurring_plan_id';
      const eligible = db.prepare(`SELECT id FROM appointments WHERE tenant_id = ? AND ${refColumn} = ?
        AND service_id = ? AND patient_id = ? AND status NOT IN ('cancelled', 'no_show')
        AND COALESCE(attendance_status, 'pending') NOT IN ('absent', 'cancelled')
        AND (status = 'completed' OR attendance_status = 'present')
        AND substr(start_time, 1, 10) >= ? AND substr(start_time, 1, 10) <= ?
        ORDER BY start_time, id`).all(tenantId, contract?.id || plan?.id, row.service_id, row.patient_id,
          win?.cycleStart || contract?.start_date || '0000-01-01', win?.cycleEnd || contract?.end_date || '9999-12-31') as any[];
      if (eligible.findIndex(a => a.id === row.id) >= credits) { basis = 0; result.isExempt = true; }
    } else {
      basis = 0;
      result.warning = terms.allocation === 'none'
        ? 'Plano sem rateio configurado: selecione créditos contratuais ou base fixa por aula.'
        : 'Plano sem créditos fixos no snapshot: configure uma base fixa por aula.';
    }
  }
  if (covered && !plan && !contract) {
    basis = 0;
    result.warning = 'Atendimento coberto sem contrato vinculado.';
  }
  if (terms.recognition === 'received') {
    // Partial is not proof of a received amount: only confirmed payment rows
    // enter the calculation. Split paid rows are recognized separately.
    let received = 0;
    let remaining = Math.max(0, cycleAmount);
    for (const payment of validPayments.filter(p => p.status === 'paid' && p.payment_date)) {
      const paid = Math.min(remaining, Math.max(0, Number(payment.amount)));
      remaining -= paid;
      const recognizedMonth = [sessionMonth, String(payment.payment_date).slice(0, 7)].sort().pop();
      if (recognizedMonth === periodMonth && paid > 0) {
        received += paid;
        result.paymentIds.push(payment.id);
      }
    }
    result.recognitionFactor = cycleAmount > 0 ? received / cycleAmount : 0;
  }
  if (result.isExempt) result.recognitionFactor = 0;
  result.netAmount = money(Math.max(0, basis) * result.recognitionFactor);
  result.basisNote = `${covered ? (isPackageCovered ? 'Pacote/complemento contratado' : 'Plano contratado') : 'Avulso contratado'}; ${terms.recognition === 'received' ? 'recebimento confirmado' : 'aula realizada'}; ${terms.allocation}; base R$ ${money(basis).toFixed(2)}${result.paymentIds.length ? `; pagamentos ${result.paymentIds.join(', ')}` : ''}${result.warning ? `; ${result.warning}` : ''}`;
  return result;
}
