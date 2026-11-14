import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import {
  PeriodicBillingFrequency,
  getCycleMonthsForBillingFrequency,
  getTenantEstablishmentProfile,
  resolveServiceDomain,
  supportsStudioFeatures
} from '../utils/establishment-context';

export interface CycleWindow {
  index: number;
  cycleStart: string;
  cycleEnd: string;
  billingCycleKey: string;
  competenceMonth: string;
  dueDate: string;
}

export const FREQUENCY_PT_LABELS: Record<PeriodicBillingFrequency, string> = {
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual'
};

export function getClinicTodayIso(): string {
  const now = new Date(Date.now() - 3 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

export function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

export function getLastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0, 12, 0, 0)).getUTCDate();
}

export function addMonthsPreserveDay(dateIso: string, addMonths: number, overrideDay?: number): string {
  const y = Number(dateIso.slice(0, 4));
  const m = Number(dateIso.slice(5, 7));
  const baseDay = overrideDay !== undefined ? overrideDay : Number(dateIso.slice(8, 10));
  const totalMonths = y * 12 + (m - 1) + addMonths;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;
  const lastDay = getLastDayOfMonth(targetYear, targetMonth);
  const finalDay = Math.min(lastDay, Math.max(1, baseDay));
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(finalDay).padStart(2, '0')}`;
}

export function normalizePeriodicFrequency(raw?: unknown, fallbackCycleMonths?: unknown): {
  frequency: PeriodicBillingFrequency;
  cycleMonths: number;
} {
  const val = String(raw || '').trim().toLowerCase();
  if (val === 'monthly' || val === 'quarterly' || val === 'semiannual' || val === 'annual') {
    return { frequency: val, cycleMonths: getCycleMonthsForBillingFrequency(val) };
  }
  const cm = Number(fallbackCycleMonths);
  if (cm === 3) return { frequency: 'quarterly', cycleMonths: 3 };
  if (cm === 6) return { frequency: 'semiannual', cycleMonths: 6 };
  if (cm === 12) return { frequency: 'annual', cycleMonths: 12 };
  return { frequency: 'monthly', cycleMonths: 1 };
}

export function buildCycleWindow(params: {
  startDate: string;
  cycleMonths: number;
  dueDay: number;
  cycleIndex: number;
  firstDueDate?: string | null;
}): CycleWindow {
  const cleanStart = String(params.startDate).slice(0, 10);
  const cycleMonths = Math.max(1, Math.floor(params.cycleMonths || 1));
  const dueDay = Math.min(28, Math.max(1, Math.floor(params.dueDay || 10)));
  const k = Math.max(0, Math.floor(params.cycleIndex || 0));

  const cycleStart = addMonthsPreserveDay(cleanStart, k * cycleMonths);
  const nextCycleStart = addMonthsPreserveDay(cleanStart, (k + 1) * cycleMonths);
  const cycleEnd = addDaysIso(nextCycleStart, -1);
  const competenceMonth = cycleStart.slice(0, 7);
  const billingCycleKey = `${cycleStart}..${cycleEnd}`;

  let dueDate: string;
  if (k === 0 && params.firstDueDate && /^\d{4}-\d{2}-\d{2}$/.test(String(params.firstDueDate).slice(0, 10))) {
    dueDate = String(params.firstDueDate).slice(0, 10);
  } else {
    let yr = Number(competenceMonth.slice(0, 4));
    let mo = Number(competenceMonth.slice(5, 7));
    let clampedDay = Math.min(dueDay, getLastDayOfMonth(yr, mo));
    dueDate = `${String(yr).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
    if (dueDate < cycleStart) {
      const nextMo = addMonthsPreserveDay(`${String(yr).padStart(4, '0')}-${String(mo).padStart(2, '0')}-01`, 1);
      yr = Number(nextMo.slice(0, 4));
      mo = Number(nextMo.slice(5, 7));
      clampedDay = Math.min(dueDay, getLastDayOfMonth(yr, mo));
      const candidate = `${String(yr).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
      if (candidate <= cycleEnd) {
        dueDate = candidate;
      }
    }
  }

  return {
    index: k,
    cycleStart,
    cycleEnd,
    billingCycleKey,
    competenceMonth,
    dueDate
  };
}

export class BillingCycleService {
  /**
   * Enumera todos os ciclos que começam até upToDate (e respeitam end_date do plano).
   */
  static listCycleWindowsUpTo(plan: any, upToDate: string, maxCycles = 120): CycleWindow[] {
    const startDate = String(plan?.start_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return [];

    const endDate = plan?.end_date ? String(plan.end_date).slice(0, 10) : null;
    const { cycleMonths } = normalizePeriodicFrequency(plan?.billing_frequency || plan?.billing_cycle, plan?.cycle_months);
    const dueDay = Math.min(28, Math.max(1, Math.floor(Number(plan?.due_day) || 10)));

    const windows: CycleWindow[] = [];
    for (let k = 0; k < maxCycles; k++) {
      const win = buildCycleWindow({ startDate, cycleMonths, dueDay, cycleIndex: k });
      if (win.cycleStart > upToDate) break;
      if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate) && win.cycleStart > endDate) break;
      windows.push(win);
    }
    return windows;
  }

  /**
   * Encontra a janela de ciclo financeiro que cobre targetDateIso.
   */
  static findCycleWindowForDate(plan: any, targetDateIso: string): CycleWindow | null {
    const startDate = String(plan?.start_date || '').slice(0, 10);
    const cleanTarget = String(targetDateIso || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(cleanTarget)) return null;
    if (cleanTarget < startDate) return null;

    const endDate = plan?.end_date ? String(plan.end_date).slice(0, 10) : null;
    if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate) && cleanTarget > endDate) return null;

    const { cycleMonths } = normalizePeriodicFrequency(plan?.billing_frequency || plan?.billing_cycle, plan?.cycle_months);
    const dueDay = Math.min(28, Math.max(1, Math.floor(Number(plan?.due_day) || 10)));

    for (let k = 0; k < 240; k++) {
      const win = buildCycleWindow({ startDate, cycleMonths, dueDay, cycleIndex: k });
      if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate) && win.cycleStart > endDate) break;
      if (cleanTarget >= win.cycleStart && cleanTarget <= win.cycleEnd) {
        return win;
      }
      if (win.cycleStart > cleanTarget) break;
    }
    return null;
  }

  /**
   * Determina quais ciclos devem ser gerados ao processar uma competência YYYY-MM.
   * Regras:
   * - Se um ciclo começa dentro da competência YYYY-MM (e <= end_date), ele é candidato.
   * - Caso contrário, se um ciclo ativo intercepta YYYY-MM e ainda não foi faturado, ele é candidato (pega atrasados).
   * - Em ambos os casos, se já existe cobrança para aquele billing_cycle_key (ou competence_month legado), nunca duplica.
   */
  static findCycleForCompetenceMonth(plan: any, competenceMonth: string): CycleWindow | null {
    const startDate = String(plan?.start_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competenceMonth)) return null;

    const year = Number(competenceMonth.slice(0, 4));
    const month = Number(competenceMonth.slice(5, 7));
    const lastDay = getLastDayOfMonth(year, month);
    const monthStart = `${competenceMonth}-01`;
    const monthEnd = `${competenceMonth}-${String(lastDay).padStart(2, '0')}`;
    const endDate = plan?.end_date ? String(plan.end_date).slice(0, 10) : null;

    if (startDate > monthEnd) return null;
    if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate < monthStart) return null;

    const { cycleMonths } = normalizePeriodicFrequency(plan?.billing_frequency || plan?.billing_cycle, plan?.cycle_months);
    const dueDay = Math.min(28, Math.max(1, Math.floor(Number(plan?.due_day) || 10)));

    let intersectingCandidate: CycleWindow | null = null;
    for (let k = 0; k < 240; k++) {
      const win = buildCycleWindow({ startDate, cycleMonths, dueDay, cycleIndex: k });
      if (win.cycleStart > monthEnd) break;
      if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate) && win.cycleStart > endDate) break;

      if (win.cycleStart.slice(0, 7) === competenceMonth) {
        return win;
      }
      if (win.cycleStart <= monthEnd && win.cycleEnd >= monthStart) {
        intersectingCandidate = win;
      }
    }
    return intersectingCandidate;
  }

  /**
   * Gera ciclos idempotentes para um plano já gravado no banco (dentro de transação ou direto).
   */
  static generateCyclesForPlanTx(params: {
    tenantId: string;
    plan: any;
    competenceMonth?: string;
    generateAllContractCycles?: boolean;
    firstDueDate?: string | null;
    initialPaymentStatus?: 'pending' | 'paid';
  }): { generatedIds: string[]; skippedCount: number } {
    const { tenantId, plan } = params;
    const { frequency, cycleMonths } = normalizePeriodicFrequency(
      plan.billing_frequency || plan.billing_cycle,
      plan.cycle_months
    );
    const freqLabel = FREQUENCY_PT_LABELS[frequency] || 'Mensal';
    const dueDay = Math.min(28, Math.max(1, Math.floor(Number(plan.due_day) || 10)));

    let targetWindows: CycleWindow[] = [];
    if (params.generateAllContractCycles) {
      const startDate = String(plan.start_date).slice(0, 10);
      const boundEnd = plan.end_date && /^\d{4}-\d{2}-\d{2}$/.test(String(plan.end_date))
        ? String(plan.end_date).slice(0, 10)
        : addMonthsPreserveDay(startDate, cycleMonths);
      targetWindows = this.listCycleWindowsUpTo(plan, boundEnd, 60);
      if (targetWindows.length === 0) {
        targetWindows = [buildCycleWindow({ startDate, cycleMonths, dueDay, cycleIndex: 0, firstDueDate: params.firstDueDate })];
      } else if (params.firstDueDate && targetWindows[0].index === 0) {
        targetWindows[0] = buildCycleWindow({ startDate, cycleMonths, dueDay, cycleIndex: 0, firstDueDate: params.firstDueDate });
      }
    } else {
      const compMonth = params.competenceMonth || String(plan.start_date || getClinicTodayIso()).slice(0, 7);
      const win = this.findCycleForCompetenceMonth(plan, compMonth);
      if (win) {
        if (win.index === 0 && params.firstDueDate) {
          win.dueDate = String(params.firstDueDate).slice(0, 10);
        }
        targetWindows = [win];
      }
    }

    const generatedIds: string[] = [];
    let skippedCount = 0;

    const findExistingStmt = db.prepare(`
      SELECT id FROM payments
      WHERE tenant_id = ?
        AND recurring_plan_id = ?
        AND (
          billing_cycle_key = ?
          OR competence_month = ?
        )
      LIMIT 1
    `);

    const insStmt = db.prepare(`
      INSERT OR IGNORE INTO payments (
        id, tenant_id, appointment_id, patient_id, amount, payment_method, status, payment_date, notes,
        service_id, base_amount, due_date, recurring_plan_id, competence_month, professional_id, package_contract_id,
        billing_cycle_key, billing_cycle_start, billing_cycle_end, billing_frequency
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updatePlanStmt = db.prepare(`
      UPDATE recurring_billing_plans
      SET last_generated_month = ?, last_generated_cycle_key = ?, updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `);

    for (const win of targetWindows) {
      const existing = findExistingStmt.get(tenantId, plan.id, win.billingCycleKey, win.competenceMonth) as { id: string } | undefined;
      if (existing) {
        skippedCount += 1;
        continue;
      }

      const payId = 'pay-' + uuidv4().slice(0, 8);
      const isPaidNow = params.initialPaymentStatus === 'paid' && win.index === 0;
      const paidDate = isPaidNow ? new Date().toISOString() : null;
      const cycleLabel = cycleMonths === 1
        ? `${freqLabel} ${plan.title} (${win.competenceMonth})`
        : `${freqLabel} ${plan.title} (${win.cycleStart} a ${win.cycleEnd})`;

      const res = insStmt.run(
        payId,
        tenantId,
        plan.patient_id,
        Number(plan.amount),
        plan.payment_method || 'pix',
        isPaidNow ? 'paid' : 'pending',
        paidDate,
        cycleLabel,
        plan.service_id || null,
        Number(plan.amount),
        win.dueDate,
        plan.id,
        win.competenceMonth,
        plan.professional_id || null,
        plan.package_contract_id || null,
        win.billingCycleKey,
        win.cycleStart,
        win.cycleEnd,
        frequency
      );

      if (res.changes > 0) {
        generatedIds.push(payId);
        updatePlanStmt.run(win.competenceMonth, win.billingCycleKey, plan.id, tenantId);
      } else {
        skippedCount += 1;
      }
    }

    return { generatedIds, skippedCount };
  }

  /**
   * Cria um plano periódico (assinatura por serviço no Studio) de forma explícita na contratação do aluno.
   */
  static createPeriodicPlanTx(input: {
    tenantId: string;
    patientId: string;
    serviceId?: string | null;
    professionalId?: string | null;
    packageContractId?: string | null;
    title: string;
    amount: number;
    billingFrequency?: PeriodicBillingFrequency;
    dueDay?: number;
    firstDueDate?: string | null;
    paymentMethod?: string;
    startDate?: string;
    endDate?: string | null;
    notes?: string | null;
    status?: 'active' | 'paused';
    coversSessions?: boolean;
    generateInitialCycle?: boolean;
    generateAllContractCycles?: boolean;
    initialPaymentStatus?: 'pending' | 'paid';
    createdBy?: string;
  }): { plan: any; generatedIds: string[]; skippedCount: number } {
    const { frequency, cycleMonths } = normalizePeriodicFrequency(input.billingFrequency || 'monthly');
    const dueDay = Math.min(28, Math.max(1, Math.floor(Number(input.dueDay) || 10)));
    const startDate = input.startDate ? String(input.startDate).slice(0, 10) : getClinicTodayIso();
    const endDate = input.endDate && String(input.endDate).trim() ? String(input.endDate).slice(0, 10) : null;
    const roundedAmount = Math.round(Number(input.amount) * 100) / 100;
    const planId = 'rbp-' + uuidv4().slice(0, 8);
    const status = input.status === 'paused' ? 'paused' : 'active';
    const coversSessions = input.coversSessions === false ? 0 : 1;

    db.prepare(`
      INSERT INTO recurring_billing_plans (
        id, tenant_id, patient_id, service_id, professional_id, package_contract_id,
        title, amount, billing_cycle, billing_frequency, cycle_months, covers_sessions,
        due_day, payment_method, start_date, end_date, status, notes, created_by,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      planId,
      input.tenantId,
      input.patientId,
      input.serviceId || null,
      input.professionalId || null,
      input.packageContractId || null,
      String(input.title).trim(),
      roundedAmount,
      frequency,
      frequency,
      cycleMonths,
      coversSessions,
      dueDay,
      input.paymentMethod || 'pix',
      startDate,
      endDate,
      status,
      input.notes ? String(input.notes).trim() : null,
      input.createdBy || 'system'
    );

    const plan = db.prepare(`SELECT * FROM recurring_billing_plans WHERE id = ?`).get(planId) as any;
    let generatedIds: string[] = [];
    let skippedCount = 0;

    if (status === 'active' && (input.generateInitialCycle || input.generateAllContractCycles)) {
      const genRes = this.generateCyclesForPlanTx({
        tenantId: input.tenantId,
        plan,
        competenceMonth: startDate.slice(0, 7),
        generateAllContractCycles: Boolean(input.generateAllContractCycles),
        firstDueDate: input.firstDueDate || null,
        initialPaymentStatus: input.initialPaymentStatus
      });
      generatedIds = genRes.generatedIds;
      skippedCount = genRes.skippedCount;
    }

    const freshPlan = db.prepare(`SELECT * FROM recurring_billing_plans WHERE id = ?`).get(planId);
    return { plan: freshPlan, generatedIds, skippedCount };
  }

  /**
   * Valida ou resolve plano periódico ativo que cubra todas as datas informadas de um agendamento/série.
   */
  static resolveActivePlanCoverage(params: {
    tenantId: string;
    patientId: string;
    serviceId: string;
    sessionDates: string[];
    explicitPlanId?: string | null;
    autoMatch?: boolean;
  }): { plan: any | null; error?: string; code?: string; status?: number } {
    const cleanDates = Array.from(new Set(params.sessionDates.map(d => String(d).slice(0, 10)).filter(Boolean))).sort();
    const minDate = cleanDates[0] || getClinicTodayIso();
    const maxDate = cleanDates[cleanDates.length - 1] || minDate;

    if (params.explicitPlanId) {
      const plan = db.prepare(`
        SELECT * FROM recurring_billing_plans WHERE id = ? AND tenant_id = ?
      `).get(params.explicitPlanId, params.tenantId) as any;
      if (!plan) {
        return { plan: null, error: 'Contratação periódica selecionada não encontrada.', code: 'BILLING_PLAN_NOT_FOUND', status: 404 };
      }
      if (plan.patient_id !== params.patientId) {
        return { plan: null, error: 'Este plano periódico pertence a outro aluno.', code: 'BILLING_PLAN_STUDENT_MISMATCH', status: 403 };
      }
      if (plan.status !== 'active') {
        return {
          plan: null,
          error: `Contratação periódica não está ativa (status: ${plan.status}). Autorize cobrança avulsa ou reative o plano.`,
          code: 'BILLING_PLAN_NOT_ACTIVE',
          status: 409
        };
      }
      if (Number(plan.covers_sessions ?? 1) === 0) {
        return { plan: null, error: 'Este plano não concede cobertura automática de aulas.', code: 'BILLING_PLAN_NO_COVERAGE', status: 409 };
      }
      if (plan.service_id && plan.service_id !== params.serviceId) {
        return { plan: null, error: 'Esta contratação periódica não cobre o serviço selecionado.', code: 'BILLING_PLAN_SERVICE_MISMATCH', status: 400 };
      }
      if (plan.start_date && minDate < String(plan.start_date).slice(0, 10)) {
        return { plan: null, error: `A vigência do plano inicia em ${plan.start_date}.`, code: 'BILLING_PLAN_OUT_OF_VALIDITY', status: 400 };
      }
      if (plan.end_date && maxDate > String(plan.end_date).slice(0, 10)) {
        return { plan: null, error: `A vigência do plano expira em ${plan.end_date}.`, code: 'BILLING_PLAN_EXPIRED', status: 409 };
      }
      return { plan };
    }

    if (params.autoMatch) {
      const estProfile = getTenantEstablishmentProfile(params.tenantId);
      if (!supportsStudioFeatures(estProfile)) {
        return { plan: null };
      }
      const srvRow = db.prepare(`
        SELECT service_domain, service_kind, clinical_module FROM services WHERE id = ? AND tenant_id = ?
      `).get(params.serviceId, params.tenantId) as any;
      const domain = resolveServiceDomain({
        establishmentProfile: estProfile,
        serviceDomain: srvRow?.service_domain,
        serviceKind: srvRow?.service_kind,
        clinicalModule: srvRow?.clinical_module
      });
      if (domain !== 'studio') {
        return { plan: null };
      }

      const candidate = db.prepare(`
        SELECT * FROM recurring_billing_plans
        WHERE tenant_id = ?
          AND patient_id = ?
          AND service_id = ?
          AND status = 'active'
          AND COALESCE(covers_sessions, 1) = 1
          AND package_contract_id IS NULL
          AND start_date <= ?
          AND (end_date IS NULL OR end_date = '' OR end_date >= ?)
        ORDER BY start_date DESC, created_at DESC
        LIMIT 1
      `).get(params.tenantId, params.patientId, params.serviceId, minDate, maxDate) as any;

      return { plan: candidate || null };
    }

    return { plan: null };
  }

  /**
   * Resolução compartilhada de cobertura financeira para agendamentos individuais e recorrentes.
   * Evita duplicidade de lógica e garante que sessões cobertas por pacote ou plano periódico nunca gerem cobrança avulsa.
   */
  static prepareAppointmentBillingCoverage(params: {
    tenantId: string;
    isPublic: boolean;
    patientId: string;
    serviceId: string;
    professionalId: string;
    serviceRow: any;
    sessionDates: string[];
    packageContractId?: string | null;
    billingPlanId?: string | null;
    billingChoice?: unknown;
    enrollBillingPlan?: any;
  }): {
    mode: 'package' | 'periodic_plan' | 'drop_in';
    isPackageCovered: boolean;
    billingPlanId: string | null;
    existingPlan?: any;
    enrollPlanInput?: {
      tenantId: string;
      patientId: string;
      serviceId: string;
      professionalId: string;
      title: string;
      amount: number;
      billingFrequency: PeriodicBillingFrequency;
      dueDay: number;
      firstDueDate: string | null;
      paymentMethod: string;
      startDate: string;
      endDate: string | null;
      notes: string | null;
      generateInitialCycle: boolean;
      generateAllContractCycles: boolean;
      initialPaymentStatus: 'pending' | 'paid';
    };
    error?: string;
    code?: string;
    status?: number;
  } {
    if (params.isPublic) {
      return { mode: 'drop_in', isPackageCovered: false, billingPlanId: null };
    }

    if (params.packageContractId) {
      return { mode: 'package', isPackageCovered: true, billingPlanId: null };
    }

    const choice = String(params.billingChoice || '').trim().toLowerCase();
    if (choice === 'drop_in') {
      return { mode: 'drop_in', isPackageCovered: false, billingPlanId: null };
    }

    const cleanDates = Array.from(new Set(params.sessionDates.map(d => String(d).slice(0, 10)).filter(Boolean))).sort();
    const minDate = cleanDates[0] || getClinicTodayIso();

    if (params.enrollBillingPlan && typeof params.enrollBillingPlan === 'object') {
      const estProfile = getTenantEstablishmentProfile(params.tenantId);
      const srvDomain = resolveServiceDomain({
        establishmentProfile: estProfile,
        serviceDomain: params.serviceRow?.service_domain,
        serviceKind: params.serviceRow?.service_kind,
        clinicalModule: params.serviceRow?.clinical_module
      });
      if (!supportsStudioFeatures(estProfile) || srvDomain !== 'studio') {
        return {
          mode: 'drop_in',
          isPackageCovered: false,
          billingPlanId: null,
          status: 400,
          code: 'STUDIO_BILLING_REQUIRED',
          error: 'Contratação periódica de serviço está disponível apenas para serviços do domínio Studio.'
        };
      }

      const rawFreq = String(
        params.enrollBillingPlan.billingFrequency ||
        params.enrollBillingPlan.billing_frequency ||
        params.serviceRow?.billing_mode ||
        'monthly'
      ).trim().toLowerCase();
      if (!['monthly', 'quarterly', 'semiannual', 'annual'].includes(rawFreq)) {
        return {
          mode: 'drop_in',
          isPackageCovered: false,
          billingPlanId: null,
          status: 400,
          code: 'INVALID_BILLING_FREQUENCY',
          error: 'Periodicidade do plano inválida. Selecione Mensal, Trimestral, Semestral ou Anual.'
        };
      }
      const { frequency } = normalizePeriodicFrequency(rawFreq);
      const rawAmount = params.enrollBillingPlan.amount !== undefined
        ? Number(params.enrollBillingPlan.amount)
        : Number(params.serviceRow?.periodic_price ?? params.serviceRow?.price ?? 0);
      if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
        return {
          mode: 'drop_in',
          isPackageCovered: false,
          billingPlanId: null,
          status: 400,
          code: 'INVALID_BILLING_AMOUNT',
          error: 'Informe um valor maior que zero para o período de cobrança.'
        };
      }

      const dueDay = Math.min(28, Math.max(1, Math.floor(Number(params.enrollBillingPlan.dueDay || params.serviceRow?.default_billing_due_day || 10))));
      const startDate = params.enrollBillingPlan.startDate
        ? String(params.enrollBillingPlan.startDate).slice(0, 10)
        : minDate;
      const endDate = params.enrollBillingPlan.endDate
        ? String(params.enrollBillingPlan.endDate).slice(0, 10)
        : null;
      const firstDueDate = params.enrollBillingPlan.firstDueDate
        ? String(params.enrollBillingPlan.firstDueDate).slice(0, 10)
        : null;
      const title = String(
        params.enrollBillingPlan.title ||
        `${params.serviceRow?.name || 'Serviço'} (${FREQUENCY_PT_LABELS[frequency]})`
      ).trim();

      return {
        mode: 'periodic_plan',
        isPackageCovered: false,
        billingPlanId: null,
        enrollPlanInput: {
          tenantId: params.tenantId,
          patientId: params.patientId,
          serviceId: params.serviceId,
          professionalId: params.professionalId,
          title,
          amount: Math.round(rawAmount * 100) / 100,
          billingFrequency: frequency,
          dueDay,
          firstDueDate,
          paymentMethod: String(params.enrollBillingPlan.paymentMethod || 'pix'),
          startDate,
          endDate,
          notes: params.enrollBillingPlan.notes ? String(params.enrollBillingPlan.notes).trim() : null,
          generateInitialCycle: params.enrollBillingPlan.generateInitialCycle !== false,
          generateAllContractCycles: Boolean(params.enrollBillingPlan.generateAllContractCycles),
          initialPaymentStatus: params.enrollBillingPlan.initialPaymentStatus === 'paid' ? 'paid' : 'pending'
        }
      };
    }

    const activeRes = this.resolveActivePlanCoverage({
      tenantId: params.tenantId,
      patientId: params.patientId,
      serviceId: params.serviceId,
      sessionDates: cleanDates,
      explicitPlanId: params.billingPlanId || null,
      autoMatch: !params.billingPlanId
    });
    if (activeRes.error) {
      return {
        mode: 'drop_in',
        isPackageCovered: false,
        billingPlanId: null,
        status: activeRes.status || 400,
        code: activeRes.code,
        error: activeRes.error
      };
    }
    if (activeRes.plan) {
      return {
        mode: 'periodic_plan',
        isPackageCovered: false,
        billingPlanId: activeRes.plan.id,
        existingPlan: activeRes.plan
      };
    }

    return { mode: 'drop_in', isPackageCovered: false, billingPlanId: null };
  }
}
