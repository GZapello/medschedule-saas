import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';
import { BillingCycleService, normalizePeriodicFrequency } from './billing-cycle.service';
import { PackageService } from './package.service';
import {
  getTenantEstablishmentProfile,
  PeriodicBillingFrequency,
  PlanDurationCode,
  resolvePlanDurationEndDate,
  resolveServiceDomain,
  supportsStudioFeatures
} from '../utils/establishment-context';
import {
  addonAppliesToBaseOption,
  buildFallbackBaseCommercialOption,
  calculateCommercialOptionBreakdown,
  calculatePlanWithAddonsBreakdown,
  DEFAULT_STUDIO_ACCESS_CONFIG,
  normalizeCommercialPriceOptions,
  normalizeOptionalAddonsConfig,
  normalizeStudioAccessConfig,
  normalizeStudioServiceType,
  resolveOptionCreditPlan,
  PaymentPeriodicityCode,
  PlanWithAddonsBreakdown,
  StudioAccessConfig,
  StudioOptionalAddonOption
} from '../utils/studio-access-and-commercial';

export function getBrazilNowParts(mockNow?: Date): {
  dateIso: string;
  timeHhmm: string;
  dateTimeIso: string;
  weekday: number;
} {
  const ref = mockNow || new Date();
  const dateIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(ref);
  const timeHhmm = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(ref);
  const [y, m, d] = dateIso.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
  return {
    dateIso,
    timeHhmm: timeHhmm.slice(0, 5),
    dateTimeIso: `${dateIso}T${timeHhmm.slice(0, 5)}:00`,
    weekday
  };
}

export function getWeekBoundsForDate(dateIso: string, weekStartDay: 0 | 1 = 1): {
  startIso: string;
  endIso: string;
  startDateTime: string;
  endDateTime: string;
} {
  const [y, m, d] = dateIso.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = dt.getUTCDay(); // 0=Dom..6=Sáb
  const diff = weekStartDay === 1
    ? (dow === 0 ? -6 : 1 - dow)
    : -dow;
  const startDt = new Date(Date.UTC(y, m - 1, d + diff, 12, 0, 0));
  const endDt = new Date(startDt.getTime() + 6 * 86400000);
  const startIso = startDt.toISOString().slice(0, 10);
  const endIso = endDt.toISOString().slice(0, 10);
  return {
    startIso,
    endIso,
    startDateTime: `${startIso}T00:00:00`,
    endDateTime: `${endIso}T23:59:59`
  };
}

export function getMonthBoundsForDate(dateIso: string): {
  startIso: string;
  endIso: string;
  startDateTime: string;
  endDateTime: string;
} {
  const [y, m] = dateIso.slice(0, 10).split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0, 12, 0, 0)).getUTCDate();
  const ym = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`;
  const startIso = `${ym}-01`;
  const endIso = `${ym}-${String(lastDay).padStart(2, '0')}`;
  return {
    startIso,
    endIso,
    startDateTime: `${startIso}T00:00:00`,
    endDateTime: `${endIso}T23:59:59`
  };
}

function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

function addMonthsClampIso(dateIso: string, addMonths: number, preferredDay?: number): string {
  const y = Number(dateIso.slice(0, 4));
  const m = Number(dateIso.slice(5, 7));
  const d = preferredDay || Number(dateIso.slice(8, 10)) || 10;
  const targetTotalMonths = y * 12 + (m - 1) + addMonths;
  const targetYear = Math.floor(targetTotalMonths / 12);
  const targetMonth = (targetTotalMonths % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const finalDay = Math.min(lastDay, Math.max(1, d));
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(finalDay).padStart(2, '0')}`;
}

export interface SelectedAddonInput {
  optionId?: string;
  id?: string;
  addonServiceId?: string;
}

export interface CreateStudioEnrollmentInput {
  tenantId: string;
  studentId: string;
  serviceId?: string | null;
  packageId?: string | null;
  professionalId?: string | null;
  commercialOptionId?: string | null;
  selectedAddons?: Array<string | SelectedAddonInput>;
  selectedAddonOptionIds?: string[];
  initialAddonCountsByServiceId?: Record<string, number>;
  initialAddonSchedulesByServiceId?: Record<string, Array<{ dayOfWeek: number; startTime: string; endTime: string; professionalId?: string }>>;
  title?: string | null;
  contractKind?: 'access_plan' | 'scheduled_plan' | 'combined_package' | 'deliverable';
  accessMode?: 'unlimited' | 'limited' | 'none';
  maxEntriesPerWeek?: number | null;
  maxEntriesPerMonth?: number | null;
  maxEntriesPerDay?: number | null;
  allowSameDayReentry?: boolean;
  allowedWeekdays?: number[];
  allowedTimeWindows?: Array<{ startTime: string; endTime: string; weekdays?: number[] }>;
  blockOnOverdue?: boolean;
  overdueGraceDays?: number;
  contractDurationCode?: PlanDurationCode;
  paymentPeriodicity?: PaymentPeriodicityCode;
  billingFrequency?: PeriodicBillingFrequency;
  amount?: number;
  totalContractAmount?: number;
  installmentsCount?: number;
  weeklyFrequency?: number | null;
  referenceSessionsCount?: number | null;
  includedSessions?: number | null;
  creditMode?: 'fixed_credits' | 'weekly_guaranteed' | 'unlimited' | null;
  creditsPerCycle?: number | null;
  pricingRuleSnapshot?: string | null;
  scheduleRules?: any[] | null;
  dueDay?: number;
  startDate?: string;
  endDate?: string | null;
  fidelityMonths?: number;
  gracePeriodDays?: number;
  autoRenew?: boolean;
  paymentMethod?: string;
  initialPaymentStatus?: 'pending' | 'paid' | 'exempt';
  contractStatus?: 'requested' | 'approved' | 'active' | 'suspended' | 'frozen' | 'expired' | 'cancelled';
  origin?: 'admin' | 'public_booking';
  generateInitialCharge?: boolean;
  allowDuplicateAccessBenefit?: boolean;
  notes?: string | null;
  createdBy?: string;
}

export class StudioAccessService {
  static ensureStudioCompatible(tenantId: string): void {
    const profile = getTenantEstablishmentProfile(tenantId);
    if (!supportsStudioFeatures(profile)) {
      const err: any = new Error('Esta funcionalidade é exclusiva para estabelecimentos configurados como Academia & Studio ou Misto.');
      err.status = 403;
      err.code = 'STUDIO_PROFILE_REQUIRED';
      throw err;
    }
  }

  /**
   * Cria matrícula / contrato de plano de acesso, serviço agendável ou pacote combinado.
   */
  static createEnrollmentTx(input: CreateStudioEnrollmentInput): any {
    this.ensureStudioCompatible(input.tenantId);

    const student = db.prepare(`SELECT id, full_name FROM patients WHERE id = ? AND tenant_id = ?`).get(input.studentId, input.tenantId) as any;
    if (!student) {
      const err: any = new Error('Aluno não encontrado neste estabelecimento.');
      err.status = 404;
      throw err;
    }

    // Se for contratação de pacote do catálogo, delega para PackageService.createContractTx
    if (input.packageId) {
      const pkgContract = PackageService.createContractTx({
        tenantId: input.tenantId,
        packageId: input.packageId,
        studentId: input.studentId,
        startDate: input.startDate,
        endDate: input.endDate,
        dueDay: input.dueDay,
        paymentMethod: input.paymentMethod,
        origin: input.origin || 'admin',
        contractStatus: (input.contractStatus === 'approved' ? 'confirmed' : input.contractStatus) as any,
        paymentStatus: input.initialPaymentStatus || 'pending',
        installmentsCount: input.installmentsCount,
        notes: input.notes,
        generateInitialCharge: input.generateInitialCharge,
        allowDuplicateAccessBenefit: input.allowDuplicateAccessBenefit,
        createdBy: input.createdBy
      });

      this.recordContractHistoryTx({
        tenantId: input.tenantId,
        patientId: input.studentId,
        packageContractId: pkgContract.id,
        recurringPlanId: pkgContract.recurring_plan_id || null,
        action: 'ENROLL_PACKAGE_CONTRACT',
        summary: `Matrícula no pacote "${pkgContract.package_name_snapshot}" (${pkgContract.contract_status})`,
        newState: pkgContract,
        createdBy: input.createdBy || 'system'
      });

      return {
        contractSource: 'package_contract',
        contractId: pkgContract.id,
        packageContract: pkgContract
      };
    }

    if (!input.serviceId) {
      const err: any = new Error('Informe o serviço/modalidade ou pacote para realizar a matrícula.');
      err.status = 400;
      throw err;
    }

    const srv = db.prepare(`SELECT * FROM services WHERE id = ? AND tenant_id = ? AND active = 1`).get(input.serviceId, input.tenantId) as any;
    if (!srv) {
      const err: any = new Error('Serviço ou modalidade não encontrada ou inativa neste estabelecimento.');
      err.status = 404;
      throw err;
    }

    const srvStudioType = normalizeStudioServiceType(srv.studio_service_type, srv.service_kind);
    const contractKind: 'access_plan' | 'scheduled_plan' | 'deliverable' =
      input.contractKind === 'access_plan' || input.contractKind === 'deliverable' || input.contractKind === 'scheduled_plan'
        ? input.contractKind
        : (srvStudioType === 'facility_access'
            ? 'access_plan'
            : (srvStudioType === 'non_scheduled' ? 'deliverable' : 'scheduled_plan'));

    const { dateIso: todayIso } = getBrazilNowParts();

    // Verifica duplicação de plano de acesso ativo quando aplicável
    if (contractKind === 'access_plan' && !input.allowDuplicateAccessBenefit && input.origin !== 'public_booking') {
      const existingAccessPlan = db.prepare(`
        SELECT rbp.id, rbp.title
        FROM recurring_billing_plans rbp
        LEFT JOIN services s ON s.id = rbp.service_id AND s.tenant_id = rbp.tenant_id
        WHERE rbp.tenant_id = ? AND rbp.patient_id = ? AND rbp.status = 'active'
          AND COALESCE(rbp.contract_status, 'active') = 'active'
          AND (rbp.end_date IS NULL OR rbp.end_date >= ?)
          AND (rbp.contract_kind = 'access_plan' OR s.studio_service_type = 'facility_access')
        LIMIT 1
      `).get(input.tenantId, input.studentId, todayIso) as any;

      const existingAccessPkg = !existingAccessPlan
        ? db.prepare(`
            SELECT spc.id, spc.package_name_snapshot as title
            FROM student_package_contracts spc
            JOIN student_package_entitlements spe ON spe.contract_id = spc.id AND spe.tenant_id = spc.tenant_id
            WHERE spc.tenant_id = ? AND spc.student_id = ? AND spc.contract_status = 'active'
              AND (spc.end_date IS NULL OR spc.end_date >= ?)
              AND spe.entitlement_type = 'facility_access'
            LIMIT 1
          `).get(input.tenantId, input.studentId, todayIso)
        : null;

      const dup = existingAccessPlan || existingAccessPkg;
      if (dup) {
        const err: any = new Error(
          `O aluno já possui um plano de acesso ativo ("${dup.title}"). Confirme explicitamente (allowDuplicateAccessBenefit) para cadastrar outro plano de acesso simultâneo.`
        );
        err.status = 409;
        err.code = 'DUPLICATE_ACTIVE_ACCESS_BENEFIT';
        throw err;
      }
    }

    const baseAccessCfg = normalizeStudioAccessConfig(srv.access_config_json);
    const mergedAccessCfg: StudioAccessConfig = {
      ...baseAccessCfg,
      accessMode: input.accessMode === 'limited' || input.accessMode === 'unlimited'
        ? input.accessMode
        : (input.maxEntriesPerWeek || input.maxEntriesPerMonth ? 'limited' : baseAccessCfg.accessMode),
      maxEntriesPerWeek: input.maxEntriesPerWeek !== undefined ? input.maxEntriesPerWeek : baseAccessCfg.maxEntriesPerWeek,
      maxEntriesPerMonth: input.maxEntriesPerMonth !== undefined ? input.maxEntriesPerMonth : baseAccessCfg.maxEntriesPerMonth,
      maxEntriesPerDay: input.maxEntriesPerDay !== undefined ? input.maxEntriesPerDay : baseAccessCfg.maxEntriesPerDay,
      allowSameDayReentry: input.allowSameDayReentry !== undefined ? Boolean(input.allowSameDayReentry) : baseAccessCfg.allowSameDayReentry,
      allowedWeekdays: Array.isArray(input.allowedWeekdays) && input.allowedWeekdays.length > 0 ? input.allowedWeekdays : baseAccessCfg.allowedWeekdays,
      allowedTimeWindows: Array.isArray(input.allowedTimeWindows) ? input.allowedTimeWindows : baseAccessCfg.allowedTimeWindows,
      blockOnOverdue: input.blockOnOverdue !== undefined ? Boolean(input.blockOnOverdue) : baseAccessCfg.blockOnOverdue,
      overdueGraceDays: input.overdueGraceDays !== undefined ? Number(input.overdueGraceDays) : baseAccessCfg.overdueGraceDays
    };

    const commercialOptions = normalizeCommercialPriceOptions(srv.commercial_price_options_json, {
      studioServiceType: srvStudioType,
      requiresAppointment: srv.requires_appointment
    });
    const matchedOption = input.commercialOptionId
      ? commercialOptions.find(o => o.id === input.commercialOptionId && o.active)
      : null;
    if (input.commercialOptionId && !matchedOption) {
      throw Object.assign(new Error('A opção comercial não está disponível para este serviço.'), { status: 400 });
    }
    if (contractKind === 'access_plan' && matchedOption && matchedOption.accessType !== 'scheduled') {
      if (input.accessMode === undefined) mergedAccessCfg.accessMode = matchedOption.accessType;
      if (matchedOption.accessType === 'limited' && matchedOption.frequencyCount) {
        if (matchedOption.frequencyType === 'weekly' && input.maxEntriesPerWeek === undefined) {
          mergedAccessCfg.maxEntriesPerWeek = matchedOption.frequencyCount;
          mergedAccessCfg.countPeriod = 'weekly';
        }
        if (matchedOption.frequencyType === 'monthly' && input.maxEntriesPerMonth === undefined) {
          mergedAccessCfg.maxEntriesPerMonth = matchedOption.frequencyCount;
          mergedAccessCfg.countPeriod = 'monthly';
        }
      }
    }
    const optionBreakdown = matchedOption ? calculateCommercialOptionBreakdown(matchedOption) : null;

    const requestedAddonIds = Array.from(new Set([
      ...(Array.isArray(input.selectedAddonOptionIds) ? input.selectedAddonOptionIds : []),
      ...(Array.isArray(input.selectedAddons)
        ? input.selectedAddons.map((a) => (typeof a === 'string' ? a : String(a?.optionId || a?.id || '')))
        : [])
    ].map((v) => String(v || '').trim()).filter(Boolean)));

    if (requestedAddonIds.length > 0) {
      return this.createCombinedPlanWithAddonsContractTx({
        input,
        srv,
        srvStudioType,
        contractKind,
        mergedAccessCfg,
        matchedOption,
        requestedAddonIds,
        todayIso
      });
    }

    const startDate = input.startDate ? String(input.startDate).slice(0, 10) : todayIso;
    const durationCode: PlanDurationCode =
      input.contractDurationCode ||
      matchedOption?.contractDurationCode ||
      (srv.default_plan_duration as PlanDurationCode) ||
      '1_month';
    const endDate =
      input.endDate !== undefined
        ? (input.endDate ? String(input.endDate).slice(0, 10) : null)
        : resolvePlanDurationEndDate(startDate, durationCode);

    const paymentPeriodicity: PaymentPeriodicityCode =
      input.paymentPeriodicity ||
      matchedOption?.paymentPeriodicity ||
      (input.installmentsCount && input.installmentsCount > 1 ? 'installments' : 'monthly');

    const { frequency: billingFreq, cycleMonths } = normalizePeriodicFrequency(
      input.billingFrequency ||
      (paymentPeriodicity === 'monthly' || paymentPeriodicity === 'bimonthly' || paymentPeriodicity === 'quarterly' || paymentPeriodicity === 'semiannual' || paymentPeriodicity === 'annual'
        ? paymentPeriodicity
        : (srv.billing_mode && srv.billing_mode !== 'per_session' && srv.billing_mode !== 'package' ? srv.billing_mode : 'monthly'))
    );

    const optionCreditPlan = matchedOption
      ? resolveOptionCreditPlan(matchedOption, input.creditMode || srv.plan_credit_mode, input.creditsPerCycle ?? srv.plan_credits_per_cycle)
      : null;
    const explicitInputCreditMode =
      input.creditMode === 'fixed_credits' || input.creditMode === 'weekly_guaranteed' || input.creditMode === 'unlimited'
        ? input.creditMode
        : null;
    const resolvedPlanCreditMode =
      explicitInputCreditMode ||
      optionCreditPlan?.creditMode ||
      (srv.plan_credit_mode === 'fixed_credits' || srv.plan_credit_mode === 'weekly_guaranteed' || srv.plan_credit_mode === 'unlimited'
        ? srv.plan_credit_mode
        : (srvStudioType === 'facility_access' ? 'unlimited' : 'fixed_credits'));
    const resolvedPlanCreditsPerCycle =
      resolvedPlanCreditMode === 'fixed_credits'
        ? (input.creditsPerCycle !== undefined && input.creditsPerCycle !== null
            ? Number(input.creditsPerCycle)
            : (optionCreditPlan?.creditsPerCycle ?? (srv.plan_credits_per_cycle ? Number(srv.plan_credits_per_cycle) : null)))
        : null;

    const cycleAmount = Math.max(
      0,
      Math.round(
        Number(
          input.amount !== undefined
            ? input.amount
            : (optionBreakdown
                ? optionBreakdown.cycleAmountReais
                : (Number(srv.periodic_price) > 0 ? srv.periodic_price : srv.price || 0))
        ) * 100
      ) / 100
    );

    const totalContractAmount = Math.max(
      cycleAmount,
      Math.round(
        Number(
          input.totalContractAmount !== undefined
            ? input.totalContractAmount
            : (optionBreakdown ? optionBreakdown.totalContractAmountReais : cycleAmount)
        ) * 100
      ) / 100
    );

    const installmentsCount = Math.max(
      1,
      Math.min(
        36,
        Math.floor(
          Number(
            input.installmentsCount ||
            optionBreakdown?.installmentsCount ||
            1
          )
        )
      )
    );

    const dueDay = Math.max(1, Math.min(28, Math.floor(Number(input.dueDay || srv.default_billing_due_day || 10))));
    const fidelityMonths = Math.max(0, Math.floor(Number(input.fidelityMonths ?? matchedOption?.fidelityMonths ?? 0)));
    const gracePeriodDays = Math.max(0, Math.floor(Number(input.gracePeriodDays ?? matchedOption?.gracePeriodDays ?? mergedAccessCfg.overdueGraceDays ?? 0)));
    const autoRenew = Boolean(input.autoRenew ?? matchedOption?.autoRenew ?? false);
    const origin = input.origin === 'public_booking' ? 'public_booking' : 'admin';

    // Contratação pública sem aprovação nasce como 'requested' e plano 'paused' até confirmação
    const contractStatus = origin === 'public_booking'
      ? 'requested'
      : (input.contractStatus || 'active');
    const planDbStatus = contractStatus === 'active' || contractStatus === 'approved' ? 'active' : 'paused';

    const planId = 'rbp-' + uuidv4().slice(0, 8);
    const planTitle = input.title
      ? String(input.title).trim()
      : (contractKind === 'access_plan'
          ? `Plano de Acesso: ${srv.name} (${mergedAccessCfg.accessMode === 'unlimited' ? 'Livre' : `${mergedAccessCfg.maxEntriesPerWeek || mergedAccessCfg.maxEntriesPerMonth || 3}x`})`
          : `Plano: ${srv.name}`);

    const weeklyFrequencySnapshot =
      input.weeklyFrequency !== undefined && input.weeklyFrequency !== null
        ? Number(input.weeklyFrequency)
        : (contractKind === 'access_plan'
            ? (mergedAccessCfg.accessMode === 'limited' ? (mergedAccessCfg.maxEntriesPerWeek || null) : null)
            : (matchedOption ? (matchedOption.frequencyType === 'weekly' ? matchedOption.frequencyCount : null) : srv.weekly_sessions_count || 1));

    const commercialSnapshot = {
      serviceId: srv.id,
      serviceName: srv.name,
      studioServiceType: srvStudioType,
      contractKind,
      commercialOptionId: matchedOption?.id || null,
      ...(matchedOption ? { frequencyType: matchedOption.frequencyType, frequencyCount: matchedOption.frequencyCount } : {}),
      optionBreakdown,
      contractDurationCode: durationCode,
      paymentPeriodicity,
      billingFrequency: billingFreq,
      cycleAmount,
      totalContractAmount,
      installmentsCount,
      fidelityMonths,
      gracePeriodDays,
      autoRenew,
      creditMode: resolvedPlanCreditMode,
      creditsPerCycle: resolvedPlanCreditsPerCycle
    };

    const resolvedIncludedSessions =
      input.includedSessions !== undefined
        ? input.includedSessions
        : (contractKind === 'scheduled_plan' && resolvedPlanCreditMode === 'fixed_credits'
            ? (optionCreditPlan?.totalContractCredits ?? (matchedOption?.frequencyType === 'fixed_count' ? matchedOption.frequencyCount : resolvedPlanCreditsPerCycle))
            : null);

    db.prepare(`
      INSERT INTO recurring_billing_plans (
        id, tenant_id, patient_id, service_id, professional_id,
        title, amount, billing_cycle, billing_frequency, cycle_months, covers_sessions,
        due_day, start_date, end_date, payment_method, notes, status,
        plan_duration_code, weekly_frequency, weekly_sessions_snapshot, included_sessions,
        pricing_rule_snapshot, reference_sessions_count, schedule_rules_json,
        credit_mode_snapshot, credits_per_cycle_snapshot,
        commercial_option_id_snapshot, commercial_option_label_snapshot,
        contract_kind, contract_status, payment_periodicity, total_contract_amount,
        installments_count, fidelity_months, grace_period_days, auto_renew,
        access_mode_snapshot, access_rules_snapshot_json, commercial_snapshot_json, origin,
        created_by, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, datetime('now'), datetime('now')
      )
    `).run(
      planId,
      input.tenantId,
      input.studentId,
      srv.id,
      contractKind === 'access_plan' ? null : (input.professionalId || srv.professional_id || null),
      planTitle,
      cycleAmount,
      billingFreq,
      billingFreq,
      cycleMonths,
      contractKind === 'scheduled_plan' ? 1 : 0,
      dueDay,
      startDate,
      endDate,
      input.paymentMethod || 'pix',
      input.notes ? String(input.notes).trim() : null,
      planDbStatus,
      durationCode,
      weeklyFrequencySnapshot,
      weeklyFrequencySnapshot,
      resolvedIncludedSessions,
      input.pricingRuleSnapshot || null,
      input.referenceSessionsCount ?? null,
      Array.isArray(input.scheduleRules) && input.scheduleRules.length > 0 ? JSON.stringify(input.scheduleRules) : null,
      resolvedPlanCreditMode,
      resolvedPlanCreditsPerCycle,
      matchedOption?.id || null,
      matchedOption?.label || null,
      contractKind,
      contractStatus,
      paymentPeriodicity,
      totalContractAmount,
      installmentsCount,
      fidelityMonths,
      gracePeriodDays,
      autoRenew ? 1 : 0,
      contractKind === 'access_plan' ? mergedAccessCfg.accessMode : 'none',
      contractKind === 'access_plan' ? JSON.stringify(mergedAccessCfg) : null,
      JSON.stringify(commercialSnapshot),
      origin,
      input.createdBy || 'system'
    );

    const generatedPaymentIds: string[] = [];
    const shouldGenerateCharge =
      input.generateInitialCharge !== false &&
      contractStatus !== 'requested' &&
      (cycleAmount > 0 || totalContractAmount > 0);

    if (shouldGenerateCharge) {
      const isPaidNow = input.initialPaymentStatus === 'paid';
      const paidDate = isPaidNow ? new Date().toISOString() : null;
      const method = input.paymentMethod || 'pix';

      if (paymentPeriodicity === 'one_time' || paymentPeriodicity === 'installments') {
        const count = paymentPeriodicity === 'installments' ? Math.max(1, installmentsCount) : 1;
        const baseInst = Math.floor((totalContractAmount / count) * 100) / 100;
        const remainder = Math.round((totalContractAmount - baseInst * count) * 100) / 100;
        const insPay = db.prepare(`
          INSERT INTO payments (
            id, tenant_id, appointment_id, patient_id, amount, base_amount, payment_method,
            status, payment_date, notes, service_id, due_date, professional_id,
            recurring_plan_id, competence_month, installment_number, total_installments,
            billing_frequency, source_type, source_id
          ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recurring_plan', ?)
        `);
        for (let idx = 0; idx < count; idx++) {
          const instNum = idx + 1;
          const amt = idx === count - 1 ? Math.round((baseInst + remainder) * 100) / 100 : baseInst;
          const due = idx === 0 ? startDate : addMonthsClampIso(startDate, idx, dueDay);
          const payId = 'pay-' + uuidv4().slice(0, 8);
          const label = count > 1
            ? `${planTitle} (Parcela ${instNum}/${count})`
            : `${planTitle} (Pagamento integral)`;
          insPay.run(
            payId,
            input.tenantId,
            input.studentId,
            amt,
            amt,
            method,
            isPaidNow && idx === 0 ? 'paid' : 'pending',
            isPaidNow && idx === 0 ? paidDate : null,
            label,
            srv.id,
            due,
            contractKind === 'access_plan' ? null : (input.professionalId || srv.professional_id || null),
            planId,
            idx === 0 ? due.slice(0, 7) : null,
            instNum,
            count,
            paymentPeriodicity,
            planId
          );
          generatedPaymentIds.push(payId);
        }
      } else {
        const planRow = db.prepare(`SELECT * FROM recurring_billing_plans WHERE id = ?`).get(planId);
        const gen = BillingCycleService.generateCyclesForPlanTx({
          tenantId: input.tenantId,
          plan: planRow,
          competenceMonth: startDate.slice(0, 7),
          initialPaymentStatus: isPaidNow ? 'paid' : 'pending'
        });
        generatedPaymentIds.push(...gen.generatedIds);
      }
    }

    const createdPlan = db.prepare(`SELECT * FROM recurring_billing_plans WHERE id = ? AND tenant_id = ?`).get(planId, input.tenantId);
    this.recordContractHistoryTx({
      tenantId: input.tenantId,
      patientId: input.studentId,
      recurringPlanId: planId,
      action: 'CREATE_ENROLLMENT',
      summary: `Matrícula criada: ${planTitle} (${contractStatus})`,
      newState: createdPlan,
      createdBy: input.createdBy || 'system'
    });

    return {
      contractSource: 'recurring_plan',
      contractId: planId,
      plan: createdPlan,
      generatedPaymentIds
    };
  }

  static generateCombinedContractPaymentsTx(params: {
    tenantId: string;
    studentId: string;
    contractId: string;
    recurringPlanId: string | null;
    baseServiceId: string;
    primaryProfessionalId?: string | null;
    breakdown: PlanWithAddonsBreakdown;
    startDate: string;
    dueDay: number;
    paymentMethod?: string;
    initialPaymentStatus?: 'pending' | 'paid' | 'exempt';
    planTitle: string;
  }): string[] {
    if (params.initialPaymentStatus === 'exempt') return [];

    const existingPays = (db.prepare(`
      SELECT COUNT(*) as c FROM payments
      WHERE tenant_id = ? AND package_contract_id = ? AND status NOT IN ('cancelled', 'refunded')
    `).get(params.tenantId, params.contractId) as any)?.c || 0;
    if (existingPays > 0) return [];

    const generatedIds: string[] = [];
    const isPaidNow = params.initialPaymentStatus === 'paid';
    const paidDate = isPaidNow ? new Date().toISOString() : null;
    const method = params.paymentMethod || 'pix';
    const { breakdown } = params;

    const insContractPay = db.prepare(`
      INSERT INTO payments (
        id, tenant_id, appointment_id, patient_id, amount, base_amount, payment_method,
        status, payment_date, notes, service_id, due_date, professional_id,
        package_contract_id, competence_month, installment_number, total_installments,
        billing_frequency, source_type, source_id
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'package_contract', ?)
    `);

    const primarySchedule =
      breakdown.recurringSchedules.find((s) => s.isBasePeriodicity) ||
      breakdown.recurringSchedules[0] ||
      null;

    const insertBaseOneTimeOrInstallments = () => {
      const baseTotal = Math.round(breakdown.base.totalContractAmountCents) / 100;
      if (baseTotal <= 0) return;
      const count =
        breakdown.base.paymentPeriodicity === 'installments'
          ? Math.max(1, breakdown.base.installmentsCount || 1)
          : 1;
      const baseInst = Math.floor((baseTotal / count) * 100) / 100;
      const remainder = Math.round((baseTotal - baseInst * count) * 100) / 100;
      for (let idx = 0; idx < count; idx++) {
        const instNum = idx + 1;
        const amt = idx === count - 1 ? Math.round((baseInst + remainder) * 100) / 100 : baseInst;
        const due = idx === 0 ? params.startDate : addMonthsClampIso(params.startDate, idx, params.dueDay);
        const payId = 'pay-' + uuidv4().slice(0, 8);
        const baseName = breakdown.base.label || params.planTitle;
        const label = count > 1
          ? `Plano-base ${baseName} (Parcela ${instNum}/${count})`
          : `Plano-base ${baseName} (Pagamento único)`;
        insContractPay.run(
          payId,
          params.tenantId,
          params.studentId,
          amt,
          amt,
          method,
          isPaidNow && idx === 0 ? 'paid' : 'pending',
          isPaidNow && idx === 0 ? paidDate : null,
          label,
          params.baseServiceId,
          due,
          params.primaryProfessionalId || null,
          params.contractId,
          idx === 0 ? due.slice(0, 7) : null,
          instNum,
          count,
          breakdown.base.paymentPeriodicity,
          params.contractId
        );
        generatedIds.push(payId);
      }
    };

    if (params.recurringPlanId && primarySchedule) {
      const planRow = db.prepare(`SELECT * FROM recurring_billing_plans WHERE id = ?`).get(params.recurringPlanId);
      if (planRow && Number((planRow as any).amount || 0) > 0) {
        const gen = BillingCycleService.generateCyclesForPlanTx({
          tenantId: params.tenantId,
          plan: { ...planRow, status: 'active' },
          competenceMonth: params.startDate.slice(0, 7),
          initialPaymentStatus: isPaidNow ? 'paid' : 'pending'
        });
        generatedIds.push(...gen.generatedIds);
      }
      if (breakdown.base.paymentPeriodicity === 'one_time' || breakdown.base.paymentPeriodicity === 'installments') {
        insertBaseOneTimeOrInstallments();
      }
      for (const sched of breakdown.recurringSchedules) {
        if (sched.periodicity === primarySchedule.periodicity) continue;
        const cycleAmt = Math.round(sched.totalCycleAmountCents) / 100;
        if (cycleAmt <= 0) continue;
        const matchingAddon = breakdown.addons.find((a) => a.effectivePeriodicity === sched.periodicity);
        const payId = 'pay-' + uuidv4().slice(0, 8);
        const { frequency: extraFreq } = normalizePeriodicFrequency(sched.periodicity);
        insContractPay.run(
          payId,
          params.tenantId,
          params.studentId,
          cycleAmt,
          cycleAmt,
          method,
          isPaidNow ? 'paid' : 'pending',
          isPaidNow ? paidDate : null,
          `Complemento (${sched.periodicityLabel}): ${sched.itemLabels.join(' + ')}`,
          matchingAddon?.addonServiceId || params.baseServiceId,
          params.startDate,
          params.primaryProfessionalId || null,
          params.contractId,
          params.startDate.slice(0, 7),
          1,
          1,
          extraFreq,
          params.contractId
        );
        generatedIds.push(payId);
      }
    } else {
      insertBaseOneTimeOrInstallments();
    }

    for (const ch of breakdown.oneTimeCharges) {
      const amt = Math.round(ch.netCents) / 100;
      if (amt <= 0) continue;
      const matchingAddon = breakdown.addons.find((a) => a.optionId === ch.optionId);
      const payId = 'pay-' + uuidv4().slice(0, 8);
      insContractPay.run(
        payId,
        params.tenantId,
        params.studentId,
        amt,
        amt,
        method,
        isPaidNow ? 'paid' : 'pending',
        isPaidNow ? paidDate : null,
        `Complemento opcional (${ch.label} • Pagamento único)`,
        matchingAddon?.addonServiceId || params.baseServiceId,
        params.startDate,
        params.primaryProfessionalId || null,
        params.contractId,
        params.startDate.slice(0, 7),
        1,
        1,
        'one_time',
        params.contractId
      );
      generatedIds.push(payId);
    }

    return generatedIds;
  }

  private static createCombinedPlanWithAddonsContractTx(ctx: {
    input: CreateStudioEnrollmentInput;
    srv: any;
    srvStudioType: string;
    contractKind: 'access_plan' | 'scheduled_plan' | 'deliverable';
    mergedAccessCfg: StudioAccessConfig;
    matchedOption: any | null;
    requestedAddonIds: string[];
    todayIso: string;
  }): any {
    const { input, srv, srvStudioType, contractKind, mergedAccessCfg, matchedOption, requestedAddonIds, todayIso } = ctx;
    const establishmentProfile = getTenantEstablishmentProfile(input.tenantId);

    const addonsCfg = normalizeOptionalAddonsConfig(srv.optional_addons_json);
    if (!addonsCfg.enabled && addonsCfg.options.length === 0) {
      throw Object.assign(new Error('Este plano não possui complementos opcionais configurados.'), { status: 400 });
    }
    if (!addonsCfg.allowMultiple && requestedAddonIds.length > 1) {
      throw Object.assign(new Error('Este plano permite selecionar apenas um complemento opcional por contratação.'), { status: 400 });
    }

    const matchedAddons: Array<StudioOptionalAddonOption & { _srv: any; _srvType: string }> = [];
    const lookupTargetStmt = db.prepare(`
      SELECT id, name, active, professional_id, service_kind, service_domain, clinical_module,
             COALESCE(studio_service_type, CASE WHEN COALESCE(service_kind, 'individual') = 'group' THEN 'group' ELSE 'individual' END) as studio_service_type,
             COALESCE(requires_appointment, 1) as requires_appointment
      FROM services WHERE id = ? AND tenant_id = ?
    `);

    for (const addonOptId of requestedAddonIds) {
      const opt = addonsCfg.options.find((o) => o.id === addonOptId && o.active);
      if (!opt) {
        throw Object.assign(new Error('Complemento opcional não encontrado ou inativo neste plano.'), { status: 400 });
      }
      if (!addonAppliesToBaseOption(opt, matchedOption)) {
        throw Object.assign(new Error(`O complemento "${opt.label}" não é válido para o plano-base selecionado.`), { status: 400 });
      }
      const addonSrv = lookupTargetStmt.get(opt.addonServiceId, input.tenantId) as any;
      if (!addonSrv || Number(addonSrv.active) === 0) {
        throw Object.assign(new Error(`O serviço vinculado ao complemento "${opt.label}" está inativo ou não foi encontrado.`), { status: 400 });
      }
      const targetDomain = resolveServiceDomain({
        establishmentProfile,
        serviceDomain: addonSrv.service_domain,
        serviceKind: addonSrv.service_kind,
        clinicalModule: addonSrv.clinical_module
      });
      if (targetDomain !== 'studio') {
        throw Object.assign(new Error(`O complemento "${opt.label}" precisa pertencer ao domínio Academia & Studio.`), { status: 400 });
      }
      const addonSrvType = normalizeStudioServiceType(addonSrv.studio_service_type, addonSrv.service_kind);
      matchedAddons.push({
        ...opt,
        addonServiceName: addonSrv.name,
        addonServiceType: addonSrvType,
        _srv: addonSrv,
        _srvType: addonSrvType
      });
    }

    const fallbackBase = buildFallbackBaseCommercialOption(srv);
    const effectiveBaseOption = matchedOption
      ? { ...matchedOption }
      : {
          ...fallbackBase,
          ...(input.contractDurationCode ? { contractDurationCode: input.contractDurationCode } : {}),
          ...(input.paymentPeriodicity ? { paymentPeriodicity: input.paymentPeriodicity } : {}),
          ...(input.amount !== undefined && !Number.isNaN(Number(input.amount))
            ? { amountCents: Math.max(0, Math.round(Number(input.amount) * 100)) }
            : {}),
          ...(input.installmentsCount ? { installmentsCount: Math.max(1, Number(input.installmentsCount)) } : {}),
          ...(input.autoRenew !== undefined ? { autoRenew: Boolean(input.autoRenew) } : {})
        };

    const breakdown = calculatePlanWithAddonsBreakdown({
      baseOption: effectiveBaseOption,
      selectedAddons: matchedAddons
    });

    const startDate = input.startDate ? String(input.startDate).slice(0, 10) : todayIso;
    const dueDay = Math.max(1, Math.min(28, Math.floor(Number(input.dueDay || srv.default_billing_due_day || 10))));
    const baseEndDate =
      input.endDate !== undefined
        ? (input.endDate ? String(input.endDate).slice(0, 10) : null)
        : (resolvePlanDurationEndDate(startDate, effectiveBaseOption.contractDurationCode) ||
            addMonthsClampIso(startDate, breakdown.base.contractMonths, dueDay));

    const maxAddonDuration = breakdown.addons.reduce((mx, a) => Math.max(mx, a.durationMonths), breakdown.base.contractMonths);
    const endDate =
      input.endDate !== undefined
        ? baseEndDate
        : (maxAddonDuration > breakdown.base.contractMonths
            ? addDaysIso(addMonthsClampIso(startDate, maxAddonDuration, Number(startDate.slice(8, 10))), -1)
            : baseEndDate);

    const origin = input.origin === 'public_booking' ? 'public_booking' : 'admin';
    const contractStatus =
      origin === 'public_booking'
        ? 'requested'
        : (input.contractStatus === 'approved' ? 'active' : (input.contractStatus || 'active'));
    const paymentStatus =
      origin === 'public_booking'
        ? 'pending'
        : (input.initialPaymentStatus === 'paid'
            ? 'paid'
            : (input.initialPaymentStatus === 'exempt' || breakdown.firstChargeDueCents === 0 ? 'exempt' : 'pending'));

    const primarySchedule =
      breakdown.recurringSchedules.find((s) => s.isBasePeriodicity) ||
      breakdown.recurringSchedules[0] ||
      null;

    const { frequency: billingFreq, cycleMonths } = primarySchedule
      ? normalizePeriodicFrequency(primarySchedule.periodicity)
      : normalizePeriodicFrequency(breakdown.base.paymentPeriodicity);

    const addonTitles = matchedAddons.map((a) => a.label).join(' + ');
    const planTitle = input.title
      ? String(input.title).trim()
      : `${srv.name} + ${addonTitles}`;

    const contractId = 'ctr-' + uuidv4().slice(0, 8);
    let recurringPlanId: string | null = null;
    const fidelityMonths = Math.max(0, Math.floor(Number(input.fidelityMonths ?? effectiveBaseOption.fidelityMonths ?? 0)));
    const gracePeriodDays = Math.max(0, Math.floor(Number(input.gracePeriodDays ?? effectiveBaseOption.gracePeriodDays ?? mergedAccessCfg.overdueGraceDays ?? 0)));
    const autoRenew = Boolean(input.autoRenew ?? effectiveBaseOption.autoRenew ?? false);
    const firstChargeReais = Math.round(breakdown.firstChargeDueCents) / 100;
    const totalContractReais = Math.round(breakdown.totalContractAmountCents) / 100;

    const commercialSnapshot = {
      serviceId: srv.id,
      serviceName: srv.name,
      studioServiceType: srvStudioType,
      baseContractKind: contractKind,
      hasAddons: true,
      baseOption: effectiveBaseOption,
      selectedAddonOptionIds: matchedAddons.map((a) => a.id),
      breakdown
    };

    if (primarySchedule) {
      recurringPlanId = 'rbp-' + uuidv4().slice(0, 8);
      const rpStatus = contractStatus === 'active' ? 'active' : 'paused';
      const primaryCycleAmountReais = Math.round(primarySchedule.totalCycleAmountCents) / 100;
      db.prepare(`
        INSERT INTO recurring_billing_plans (
          id, tenant_id, patient_id, service_id, professional_id, package_contract_id,
          title, amount, billing_cycle, billing_frequency, cycle_months, covers_sessions,
          due_day, payment_method, start_date, end_date, status, notes,
          plan_duration_code, contract_kind, contract_status, payment_periodicity,
          total_contract_amount, installments_count, fidelity_months, grace_period_days,
          auto_renew, access_mode_snapshot, access_rules_snapshot_json,
          commercial_snapshot_json, origin, created_by, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, 1,
          ?, ?, ?, ?, ?, ?,
          ?, 'combined_package', ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, datetime('now'), datetime('now')
        )
      `).run(
        recurringPlanId,
        input.tenantId,
        input.studentId,
        srv.id,
        contractKind === 'access_plan' ? null : (input.professionalId || srv.professional_id || null),
        contractId,
        planTitle,
        primaryCycleAmountReais,
        billingFreq,
        billingFreq,
        primarySchedule.cycleMonths,
        dueDay,
        input.paymentMethod || 'pix',
        startDate,
        endDate,
        rpStatus,
        input.notes ? String(input.notes).trim() : null,
        effectiveBaseOption.contractDurationCode,
        contractStatus,
        primarySchedule.periodicity,
        totalContractReais,
        breakdown.base.installmentsCount,
        fidelityMonths,
        gracePeriodDays,
        autoRenew ? 1 : 0,
        contractKind === 'access_plan' ? mergedAccessCfg.accessMode : 'none',
        contractKind === 'access_plan' ? JSON.stringify(mergedAccessCfg) : null,
        JSON.stringify(commercialSnapshot),
        origin,
        input.createdBy || 'system'
      );
    }

    const totalAddonCredits = breakdown.addons.reduce((acc, a) => acc + Number(a.totalCreditsInDuration || 0), 0);

    db.prepare(`
      INSERT INTO student_package_contracts (
        id, tenant_id, package_id, base_service_id, student_id, recurring_plan_id,
        package_name_snapshot, description_snapshot, billing_type_snapshot, billing_frequency_snapshot, cycle_months_snapshot,
        credit_mode_snapshot, contracted_price, installments_count, total_credits_snapshot, weekly_limit_snapshot,
        validity_days_snapshot, due_day_snapshot, absent_consumption_policy_snapshot,
        cancellation_hours_limit_snapshot, start_date, end_date, contract_status,
        payment_status, origin, notes,
        contract_duration_code, payment_periodicity_snapshot, total_contract_amount,
        fidelity_months_snapshot, grace_period_days_snapshot, auto_renew_snapshot,
        commercial_snapshot_json, confirmed_by, confirmed_at, created_by, created_at, updated_at
      ) VALUES (
        ?, ?, NULL, ?, ?, ?,
        ?, ?, ?, ?, ?,
        'per_service', ?, ?, ?, ?,
        ?, ?, 'consume',
        12, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, datetime('now'), datetime('now')
      )
    `).run(
      contractId,
      input.tenantId,
      srv.id,
      input.studentId,
      recurringPlanId,
      planTitle,
      `Plano-base: ${srv.name} + Complementos: ${addonTitles}`,
      primarySchedule ? 'recurring_monthly' : 'one_time',
      billingFreq,
      cycleMonths,
      firstChargeReais,
      breakdown.base.installmentsCount,
      totalAddonCredits,
      contractKind === 'access_plan' && mergedAccessCfg.accessMode === 'limited' ? (mergedAccessCfg.maxEntriesPerWeek || null) : null,
      Math.max(1, breakdown.base.contractMonths * 30),
      dueDay,
      startDate,
      endDate,
      contractStatus,
      paymentStatus,
      origin,
      input.notes ? String(input.notes).trim() : null,
      effectiveBaseOption.contractDurationCode,
      primarySchedule ? primarySchedule.periodicity : breakdown.base.paymentPeriodicity,
      totalContractReais,
      fidelityMonths,
      gracePeriodDays,
      autoRenew ? 1 : 0,
      JSON.stringify(commercialSnapshot),
      contractStatus === 'active' ? (input.createdBy || 'system') : null,
      contractStatus === 'active' ? new Date().toISOString() : null,
      input.createdBy || 'system'
    );

    const insEnt = db.prepare(`
      INSERT INTO student_package_entitlements (
        id, tenant_id, contract_id, service_id, service_name_snapshot,
        allowed_service_ids_json, weekly_frequency_snapshot, credits_total, credits_reserved, credits_used,
        credit_mode_snapshot, credits_per_cycle_snapshot,
        entitlement_type, entitlement_role, addon_option_id, addon_pricing_json,
        access_mode_snapshot, monthly_limit_snapshot, access_rules_snapshot_json, schedule_snapshot_json, entries_used
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    // 1. Direito separado do plano-base
    const baseEntType: 'scheduled_service' | 'facility_access' | 'deliverable' =
      contractKind === 'access_plan' ? 'facility_access' : (contractKind === 'deliverable' ? 'deliverable' : 'scheduled_service');
    const baseCreditPlan = resolveOptionCreditPlan(
      effectiveBaseOption,
      srv.plan_credit_mode,
      srv.plan_credits_per_cycle
    );
    const baseCreditsTotal =
      baseEntType === 'facility_access'
        ? 0
        : (baseEntType === 'deliverable'
            ? 1
            : (baseCreditPlan.creditMode === 'unlimited'
                ? 0
                : (baseCreditPlan.creditMode === 'weekly_guaranteed'
                    ? (baseCreditPlan.estimatedSessionsInContract || Math.ceil((baseCreditPlan.weeklyCap || 1) * 4.5 * breakdown.base.contractMonths))
                    : (baseCreditPlan.totalContractCredits || 1))));
    const baseWeeklyFreq =
      baseEntType === 'facility_access'
        ? (mergedAccessCfg.accessMode === 'limited' ? (mergedAccessCfg.maxEntriesPerWeek ?? null) : null)
        : (baseCreditPlan.weeklyCap ?? (effectiveBaseOption.frequencyType === 'weekly' ? effectiveBaseOption.frequencyCount : null));
    const baseMonthlyLimit =
      baseEntType === 'facility_access'
        ? (mergedAccessCfg.accessMode === 'limited' ? (mergedAccessCfg.maxEntriesPerMonth ?? null) : null)
        : (effectiveBaseOption.frequencyType === 'monthly' ? effectiveBaseOption.frequencyCount : null);

    insEnt.run(
      'ent-' + uuidv4().slice(0, 8),
      input.tenantId,
      contractId,
      srv.id,
      `${srv.name}${effectiveBaseOption.label ? ` (${effectiveBaseOption.label})` : ''}`,
      JSON.stringify([srv.id]),
      baseWeeklyFreq,
      baseCreditsTotal,
      baseEntType === 'scheduled_service' ? baseCreditPlan.creditMode : (baseEntType === 'facility_access' ? 'unlimited' : 'fixed_credits'),
      baseEntType === 'scheduled_service' && baseCreditPlan.creditMode === 'fixed_credits' ? (baseCreditPlan.creditsPerCycle ?? null) : null,
      baseEntType,
      'base',
      null,
      null,
      baseEntType === 'facility_access' ? mergedAccessCfg.accessMode : null,
      baseMonthlyLimit,
      baseEntType === 'facility_access' ? JSON.stringify(mergedAccessCfg) : null,
      null
    );

    // 2. Direitos separados por complemento opcional contratado
    for (let i = 0; i < matchedAddons.length; i++) {
      const mAddon = matchedAddons[i];
      const itemBreakdown = breakdown.addons[i];
      const entType: 'scheduled_service' | 'facility_access' | 'deliverable' =
        mAddon._srvType === 'facility_access'
          ? 'facility_access'
          : (mAddon._srvType === 'non_scheduled' ? 'deliverable' : 'scheduled_service');
      const addonCreditMode =
        entType === 'facility_access' || itemBreakdown.frequencyType === 'unlimited'
          ? 'unlimited'
          : (itemBreakdown.creditMode || 'fixed_credits');
      const initialScheduledCount = input.initialAddonCountsByServiceId?.[mAddon.addonServiceId] || 0;
      let entCredits =
        entType === 'facility_access'
          ? 0
          : (entType === 'deliverable'
              ? 1
              : addonCreditMode === 'unlimited'
                ? 0
                : addonCreditMode === 'weekly_guaranteed'
                  ? Math.max(initialScheduledCount, Math.ceil(Math.max(1, itemBreakdown.frequencyCount || 1) * 4.5 * itemBreakdown.durationMonths))
                  : (itemBreakdown.totalCreditsInDuration ?? itemBreakdown.creditsPerCycle ?? 0));
      const weeklyFreq = itemBreakdown.frequencyType === 'weekly' ? itemBreakdown.frequencyCount : null;
      const monthlyLimit = itemBreakdown.frequencyType === 'monthly' ? itemBreakdown.frequencyCount : null;
      const addonSchedList = input.initialAddonSchedulesByServiceId?.[mAddon.addonServiceId];
      const addonEndDate = addDaysIso(
        addMonthsClampIso(startDate, itemBreakdown.durationMonths, Number(startDate.slice(8, 10))),
        -1
      );
      const enrichedAddonPricing = {
        ...itemBreakdown,
        startDate,
        endDate: addonEndDate
      };

      insEnt.run(
        'ent-' + uuidv4().slice(0, 8),
        input.tenantId,
        contractId,
        mAddon.addonServiceId,
        `${mAddon.label} (${mAddon.addonServiceName || mAddon._srv.name})`,
        JSON.stringify([mAddon.addonServiceId]),
        weeklyFreq,
        entCredits,
        addonCreditMode,
        entType === 'scheduled_service' && addonCreditMode === 'fixed_credits' ? (itemBreakdown.creditsPerCycle ?? null) : null,
        entType,
        'addon',
        mAddon.id,
        JSON.stringify(enrichedAddonPricing),
        entType === 'facility_access' ? (itemBreakdown.frequencyType === 'unlimited' ? 'unlimited' : 'limited') : null,
        monthlyLimit,
        null,
        addonSchedList && addonSchedList.length > 0 ? JSON.stringify(addonSchedList) : null
      );
    }

    const generatedPaymentIds =
      input.generateInitialCharge !== false && contractStatus !== 'requested'
        ? this.generateCombinedContractPaymentsTx({
            tenantId: input.tenantId,
            studentId: input.studentId,
            contractId,
            recurringPlanId,
            baseServiceId: srv.id,
            primaryProfessionalId: input.professionalId || srv.professional_id || null,
            breakdown,
            startDate,
            dueDay,
            paymentMethod: input.paymentMethod || 'pix',
            initialPaymentStatus: input.initialPaymentStatus || 'pending',
            planTitle
          })
        : [];

    const createdContract = PackageService.getContractById(input.tenantId, contractId);
    this.recordContractHistoryTx({
      tenantId: input.tenantId,
      patientId: input.studentId,
      packageContractId: contractId,
      recurringPlanId,
      action: 'ENROLL_PLAN_WITH_ADDONS',
      summary: `Matrícula combinada criada: ${planTitle} (${contractStatus})`,
      newState: createdContract,
      createdBy: input.createdBy || 'system'
    });

    return {
      contractSource: 'package_contract',
      contractId,
      packageContract: createdContract,
      recurringPlanId,
      breakdown,
      generatedPaymentIds
    };
  }

  static recordContractHistoryTx(params: {
    tenantId: string;
    patientId: string;
    recurringPlanId?: string | null;
    packageContractId?: string | null;
    seriesId?: string | null;
    action: string;
    summary: string;
    previousState?: any;
    newState?: any;
    reason?: string | null;
    createdBy?: string;
  }): void {
    db.prepare(`
      INSERT INTO student_contract_history (
        id, tenant_id, patient_id, recurring_plan_id, package_contract_id, series_id,
        action, summary, previous_state_json, new_state_json, reason, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      'sch-' + uuidv4().slice(0, 8),
      params.tenantId,
      params.patientId,
      params.recurringPlanId || null,
      params.packageContractId || null,
      params.seriesId || null,
      params.action,
      params.summary,
      params.previousState ? JSON.stringify(params.previousState) : null,
      params.newState ? JSON.stringify(params.newState) : null,
      params.reason || null,
      params.createdBy || 'system'
    );
  }

  /**
   * Atualiza o ciclo de vida de uma matrícula (aprovar, suspender, congelar, reativar, cancelar, alterar plano).
   * Preserva integralmente cobranças já quitadas e agendamentos já concluídos.
   */
  static updateEnrollmentLifecycleTx(params: {
    tenantId: string;
    contractId: string;
    action: 'approve' | 'suspend' | 'freeze' | 'reactivate' | 'cancel' | 'renew' | 'change_plan';
    reason?: string | null;
    frozenFromDate?: string | null;
    frozenUntilDate?: string | null;
    extendEndDateOnFreeze?: boolean;
    cancelFuturePendingPayments?: boolean;
    cancelFutureScheduledAppointments?: boolean;
    markFirstPaymentPaid?: boolean;
    generateRenewalCharge?: boolean;
    paymentMethod?: string;
    newServiceId?: string;
    newCommercialOptionId?: string;
    newAmount?: number;
    newEndDate?: string | null;
    newDurationCode?: string;
    actorId: string;
  }): any {
    this.ensureStudioCompatible(params.tenantId);

    const plan = db.prepare(`SELECT * FROM recurring_billing_plans WHERE id = ? AND tenant_id = ?`).get(params.contractId, params.tenantId) as any;
    const pkgContract = !plan
      ? (db.prepare(`SELECT * FROM student_package_contracts WHERE id = ? AND tenant_id = ?`).get(params.contractId, params.tenantId) as any)
      : null;

    if (!plan && !pkgContract) {
      const err: any = new Error('Contrato ou matrícula não encontrada neste estabelecimento.');
      err.status = 404;
      throw err;
    }

    const { dateIso: todayIso } = getBrazilNowParts();

    if (plan) {
      const prevState = { ...plan };
      let nextStatus = plan.status;
      let nextContractStatus = plan.contract_status || (plan.status === 'active' ? 'active' : 'suspended');
      let nextEndDate = plan.end_date;
      let nextFrozenFrom = plan.frozen_from_date || null;
      let nextFrozenUntil = plan.frozen_until_date || null;
      let nextFreezeReason = plan.freeze_reason || null;

      if (params.action === 'approve' || params.action === 'reactivate') {
        nextStatus = 'active';
        nextContractStatus = 'active';
        nextFrozenFrom = null;
        nextFrozenUntil = null;
        nextFreezeReason = null;

        // Se estava aguardando aprovação e não tinha cobrança inicial gerada, gera agora
        const existingPays = (db.prepare(`SELECT COUNT(*) as c FROM payments WHERE recurring_plan_id = ? AND tenant_id = ? AND status NOT IN ('cancelled', 'refunded')`).get(plan.id, params.tenantId) as any)?.c || 0;
        if (existingPays === 0 && Number(plan.amount) > 0) {
          BillingCycleService.generateCyclesForPlanTx({
            tenantId: params.tenantId,
            plan: { ...plan, status: 'active' },
            competenceMonth: String(plan.start_date || todayIso).slice(0, 7),
            initialPaymentStatus: params.markFirstPaymentPaid ? 'paid' : 'pending'
          });
        } else if (params.markFirstPaymentPaid) {
          const openPay = db.prepare(`SELECT id FROM payments WHERE recurring_plan_id = ? AND tenant_id = ? AND status = 'pending' ORDER BY due_date ASC LIMIT 1`).get(plan.id, params.tenantId) as any;
          if (openPay) {
            db.prepare(`UPDATE payments SET status = 'paid', payment_method = COALESCE(?, payment_method), payment_date = datetime('now') WHERE id = ? AND tenant_id = ?`).run(params.paymentMethod || 'pix', openPay.id, params.tenantId);
          }
        }
      } else if (params.action === 'suspend') {
        nextStatus = 'paused';
        nextContractStatus = 'suspended';
      } else if (params.action === 'freeze') {
        nextStatus = 'paused';
        nextContractStatus = 'frozen';
        nextFrozenFrom = params.frozenFromDate ? String(params.frozenFromDate).slice(0, 10) : todayIso;
        nextFrozenUntil = params.frozenUntilDate ? String(params.frozenUntilDate).slice(0, 10) : addDaysIso(nextFrozenFrom, 15);
        nextFreezeReason = params.reason || 'Congelamento contratual';
        if (params.extendEndDateOnFreeze !== false && nextEndDate && nextFrozenFrom <= nextFrozenUntil) {
          const [fy, fm, fd] = nextFrozenFrom.split('-').map(Number);
          const [uy, um, ud] = nextFrozenUntil.split('-').map(Number);
          const frozenDays = Math.max(1, Math.round((Date.UTC(uy, um - 1, ud) - Date.UTC(fy, fm - 1, fd)) / 86400000) + 1);
          nextEndDate = addDaysIso(nextEndDate, frozenDays);
        }
      } else if (params.action === 'cancel') {
        nextStatus = 'cancelled';
        nextContractStatus = 'cancelled';
        if (params.cancelFuturePendingPayments !== false) {
          // NUNCA modifica cobranças quitadas (status = 'paid')
          db.prepare(`
            UPDATE payments
            SET status = 'cancelled', notes = COALESCE(notes, '') || ' [Cancelado no encerramento do contrato]'
            WHERE tenant_id = ? AND recurring_plan_id = ? AND status = 'pending'
          `).run(params.tenantId, plan.id);
        }
        if (params.cancelFutureScheduledAppointments) {
          // NUNCA modifica agendamentos concluídos (status = 'completed')
          db.prepare(`
            UPDATE appointments
            SET status = 'cancelled', attendance_status = 'cancelled', cancellation_reason = ?, cancelled_at = datetime('now')
            WHERE tenant_id = ? AND recurring_plan_id = ? AND status IN ('scheduled', 'confirmed')
              AND substr(start_time, 1, 10) >= ?
          `).run(params.reason || 'Cancelamento de contrato', params.tenantId, plan.id, todayIso);
        }
      } else if (params.action === 'renew') {
        nextStatus = 'active';
        nextContractStatus = 'active';
        nextFrozenFrom = null;
        nextFrozenUntil = null;
        nextFreezeReason = null;
        const durationToUse = (params.newDurationCode || plan.plan_duration_code || '1_month') as PlanDurationCode;
        const baseForRenew = nextEndDate && nextEndDate >= todayIso ? addDaysIso(nextEndDate, 1) : todayIso;
        nextEndDate = params.newEndDate
          ? String(params.newEndDate).slice(0, 10)
          : (resolvePlanDurationEndDate(baseForRenew, durationToUse) || addDaysIso(baseForRenew, 30));
        if (params.newDurationCode) {
          db.prepare(`UPDATE recurring_billing_plans SET plan_duration_code = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`)
            .run(durationToUse, plan.id, params.tenantId);
        }
        const chargeAmount = params.newAmount !== undefined && Number(params.newAmount) > 0
          ? Number(params.newAmount)
          : Number(plan.amount || 0);
        if (params.generateRenewalCharge && chargeAmount > 0) {
          BillingCycleService.generateCyclesForPlanTx({
            tenantId: params.tenantId,
            plan: { ...plan, amount: chargeAmount, status: 'active' },
            competenceMonth: baseForRenew.slice(0, 7),
            initialPaymentStatus: params.markFirstPaymentPaid ? 'paid' : 'pending'
          });
        }
      } else if (params.action === 'change_plan') {
        let nextTitle = plan.title;
        let nextServiceId = plan.service_id;
        let nextAmount = params.newAmount !== undefined ? Math.max(0, Number(params.newAmount)) : Number(plan.amount);
        let nextTotalAmount = Number(plan.total_contract_amount || nextAmount);
        let nextPeriodicity = plan.payment_periodicity || 'monthly';
        let nextBillingFreq = plan.billing_frequency || plan.billing_cycle || 'monthly';
        let nextCycleMonths = Number(plan.cycle_months || 1);
        let nextDurationCode = plan.plan_duration_code || '1_month';
        let nextInstallments = Number(plan.installments_count || 1);
        let nextAutoRenew = Boolean(plan.auto_renew);
        let nextWeeklyFreq = plan.weekly_frequency;
        let nextAccessMode = plan.access_mode_snapshot;
        let nextAccessRulesJson = plan.access_rules_snapshot_json;
        let nextCommercialJson = plan.commercial_snapshot_json;

        if (params.newServiceId) {
          const newSrv = db.prepare(`SELECT * FROM services WHERE id = ? AND tenant_id = ? AND active = 1`).get(params.newServiceId, params.tenantId) as any;
          if (!newSrv) {
            const err: any = new Error('Novo serviço selecionado para troca de plano não encontrado.');
            err.status = 404;
            throw err;
          }
          nextServiceId = newSrv.id;
          nextTitle = `Plano: ${newSrv.name}`;

          const commOptions = normalizeCommercialPriceOptions(newSrv.commercial_price_options_json, {
            studioServiceType: newSrv.studio_service_type,
            requiresAppointment: newSrv.requires_appointment
          });
          const matchedOpt = params.newCommercialOptionId
            ? commOptions.find(o => o.id === params.newCommercialOptionId && o.active)
            : null;
          if (matchedOpt) {
            const breakdown = calculateCommercialOptionBreakdown(matchedOpt);
            const normFreq = normalizePeriodicFrequency(
              matchedOpt.paymentPeriodicity === 'bimonthly' ||
                matchedOpt.paymentPeriodicity === 'quarterly' ||
                matchedOpt.paymentPeriodicity === 'semiannual' ||
                matchedOpt.paymentPeriodicity === 'annual'
                ? matchedOpt.paymentPeriodicity
                : 'monthly'
            );
            nextTitle = `${newSrv.name} • ${matchedOpt.label}`;
            if (params.newAmount === undefined) {
              nextAmount = breakdown.cycleAmountReais;
              nextTotalAmount = breakdown.totalContractAmountReais;
            } else {
              nextTotalAmount = nextAmount;
            }
            nextPeriodicity = matchedOpt.paymentPeriodicity;
            nextBillingFreq = normFreq.frequency;
            nextCycleMonths = normFreq.cycleMonths;
            nextDurationCode = matchedOpt.contractDurationCode;
            nextInstallments = breakdown.installmentsCount;
            nextAutoRenew = matchedOpt.autoRenew;
            if (matchedOpt.accessType === 'limited' && matchedOpt.frequencyCount) {
              nextWeeklyFreq = matchedOpt.frequencyType === 'monthly' ? nextWeeklyFreq : matchedOpt.frequencyCount;
              nextAccessMode = 'limited';
            } else if (matchedOpt.accessType === 'unlimited') {
              nextAccessMode = 'unlimited';
            }
            nextCommercialJson = JSON.stringify({ option: matchedOpt, breakdown });
          } else if (params.newAmount === undefined) {
            nextAmount = Number(newSrv.periodic_price) > 0 ? Number(newSrv.periodic_price) : Number(newSrv.price || plan.amount);
            nextTotalAmount = nextAmount;
          }
          if (newSrv.access_config_json) {
            nextAccessRulesJson = newSrv.access_config_json;
          }
        }
        if (params.newEndDate !== undefined) {
          nextEndDate = params.newEndDate ? String(params.newEndDate).slice(0, 10) : null;
        }
        db.prepare(`
          UPDATE recurring_billing_plans
          SET service_id = ?, title = ?, amount = ?, total_contract_amount = ?,
              payment_periodicity = ?, billing_frequency = ?, billing_cycle = ?, cycle_months = ?,
              plan_duration_code = ?, installments_count = ?, auto_renew = ?, weekly_frequency = ?,
              access_mode_snapshot = ?, access_rules_snapshot_json = ?, commercial_snapshot_json = ?,
              end_date = ?, updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(
          nextServiceId, nextTitle, nextAmount, nextTotalAmount,
          nextPeriodicity, nextBillingFreq, nextBillingFreq, nextCycleMonths,
          nextDurationCode, nextInstallments, nextAutoRenew ? 1 : 0, nextWeeklyFreq,
          nextAccessMode, nextAccessRulesJson, nextCommercialJson,
          nextEndDate, plan.id, params.tenantId
        );
      }

      db.prepare(`
        UPDATE recurring_billing_plans
        SET status = ?,
            contract_status = ?,
            end_date = ?,
            frozen_from_date = ?,
            frozen_until_date = ?,
            freeze_reason = ?,
            paused_at = CASE WHEN ? = 'paused' THEN datetime('now') ELSE paused_at END,
            cancelled_at = CASE WHEN ? = 'cancelled' THEN datetime('now') ELSE cancelled_at END,
            status_reason = COALESCE(?, status_reason),
            updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(
        nextStatus,
        nextContractStatus,
        nextEndDate,
        nextFrozenFrom,
        nextFrozenUntil,
        nextFreezeReason,
        nextStatus,
        nextStatus,
        params.reason || null,
        plan.id,
        params.tenantId
      );

      const updatedPlan = db.prepare(`SELECT * FROM recurring_billing_plans WHERE id = ? AND tenant_id = ?`).get(plan.id, params.tenantId) as any;
      this.recordContractHistoryTx({
        tenantId: params.tenantId,
        patientId: plan.patient_id,
        recurringPlanId: plan.id,
        action: `CONTRACT_${params.action.toUpperCase()}`,
        summary: `Operação contratual "${params.action}" no plano "${updatedPlan.title}"`,
        previousState: prevState,
        newState: updatedPlan,
        reason: params.reason || null,
        createdBy: params.actorId
      });

      return { contractSource: 'recurring_plan', plan: updatedPlan };
    }

    // Caso seja student_package_contracts
    const prevContract = { ...pkgContract };
    let nextPkgStatus = pkgContract.contract_status;
    let nextEndDate = pkgContract.end_date;
    let nextFrozenFrom = pkgContract.frozen_from_date || null;
    let nextFrozenUntil = pkgContract.frozen_until_date || null;
    let nextFreezeReason = pkgContract.freeze_reason || null;

    if (params.action === 'approve' || params.action === 'reactivate') {
      nextPkgStatus = 'active';
      nextFrozenFrom = null;
      nextFrozenUntil = null;
      nextFreezeReason = null;

      const existingPkgPays = (db.prepare(`
        SELECT COUNT(*) as c FROM payments
        WHERE package_contract_id = ? AND tenant_id = ? AND status NOT IN ('cancelled', 'refunded')
      `).get(pkgContract.id, params.tenantId) as any)?.c || 0;

      if (existingPkgPays === 0) {
        let parsedSnap: any = null;
        try {
          if (pkgContract.commercial_snapshot_json) parsedSnap = JSON.parse(pkgContract.commercial_snapshot_json);
        } catch (_) {}
        if (parsedSnap?.breakdown && pkgContract.base_service_id) {
          this.generateCombinedContractPaymentsTx({
            tenantId: params.tenantId,
            studentId: pkgContract.student_id,
            contractId: pkgContract.id,
            recurringPlanId: pkgContract.recurring_plan_id || null,
            baseServiceId: pkgContract.base_service_id,
            primaryProfessionalId: null,
            breakdown: parsedSnap.breakdown,
            startDate: pkgContract.start_date || todayIso,
            dueDay: Number(pkgContract.due_day_snapshot || 10),
            paymentMethod: params.paymentMethod || 'pix',
            initialPaymentStatus: params.markFirstPaymentPaid ? 'paid' : 'pending',
            planTitle: pkgContract.package_name_snapshot
          });
        } else if (pkgContract.recurring_plan_id && Number(pkgContract.contracted_price || 0) > 0) {
          const linkedPlan = db.prepare(`SELECT * FROM recurring_billing_plans WHERE id = ? AND tenant_id = ?`).get(pkgContract.recurring_plan_id, params.tenantId);
          if (linkedPlan) {
            BillingCycleService.generateCyclesForPlanTx({
              tenantId: params.tenantId,
              plan: { ...(linkedPlan as any), status: 'active' },
              competenceMonth: String(pkgContract.start_date || todayIso).slice(0, 7),
              initialPaymentStatus: params.markFirstPaymentPaid ? 'paid' : 'pending'
            });
          }
        }
      } else if (params.markFirstPaymentPaid) {
        const openPay = db.prepare(`SELECT id FROM payments WHERE package_contract_id = ? AND tenant_id = ? AND status = 'pending' ORDER BY due_date ASC LIMIT 1`).get(pkgContract.id, params.tenantId) as any;
        if (openPay) {
          db.prepare(`UPDATE payments SET status = 'paid', payment_method = COALESCE(?, payment_method), payment_date = datetime('now') WHERE id = ? AND tenant_id = ?`).run(params.paymentMethod || 'pix', openPay.id, params.tenantId);
          PackageService.activateContractOnPaymentSettled(params.tenantId, openPay.id, params.actorId);
        }
      }
    } else if (params.action === 'suspend') {
      nextPkgStatus = 'suspended';
    } else if (params.action === 'freeze') {
      nextPkgStatus = 'suspended';
      nextFrozenFrom = params.frozenFromDate ? String(params.frozenFromDate).slice(0, 10) : todayIso;
      nextFrozenUntil = params.frozenUntilDate ? String(params.frozenUntilDate).slice(0, 10) : addDaysIso(nextFrozenFrom, 15);
      nextFreezeReason = params.reason || 'Congelamento contratual';
      if (params.extendEndDateOnFreeze !== false && nextEndDate && nextFrozenFrom <= nextFrozenUntil) {
        const [fy, fm, fd] = nextFrozenFrom.split('-').map(Number);
        const [uy, um, ud] = nextFrozenUntil.split('-').map(Number);
        const frozenDays = Math.max(1, Math.round((Date.UTC(uy, um - 1, ud) - Date.UTC(fy, fm - 1, fd)) / 86400000) + 1);
        nextEndDate = addDaysIso(nextEndDate, frozenDays);
      }
    } else if (params.action === 'cancel') {
      nextPkgStatus = 'cancelled';
      // Encerramento explícito do plano-base encerra todos os benefícios/complementos vinculados sem deixar órfãos
      db.prepare(`
        UPDATE student_package_entitlements
        SET entitlement_status = 'cancelled',
            cancelled_at = COALESCE(cancelled_at, datetime('now')),
            cancellation_reason = COALESCE(cancellation_reason, ?),
            updated_at = datetime('now')
        WHERE tenant_id = ? AND contract_id = ? AND COALESCE(entitlement_status, 'active') != 'cancelled'
      `).run(params.reason || 'Cancelamento do contrato principal', params.tenantId, pkgContract.id);

      if (params.cancelFuturePendingPayments !== false) {
        db.prepare(`
          UPDATE payments
          SET status = 'cancelled', notes = COALESCE(notes, '') || ' [Cancelado no encerramento do pacote]'
          WHERE tenant_id = ? AND package_contract_id = ? AND status = 'pending'
        `).run(params.tenantId, pkgContract.id);
      }
      if (params.cancelFutureScheduledAppointments) {
        db.prepare(`
          UPDATE appointments
          SET status = 'cancelled', attendance_status = 'cancelled', cancellation_reason = ?, cancelled_at = datetime('now')
          WHERE tenant_id = ? AND package_contract_id = ? AND status IN ('scheduled', 'confirmed')
            AND substr(start_time, 1, 10) >= ?
        `).run(params.reason || 'Cancelamento de pacote', params.tenantId, pkgContract.id, todayIso);
      }
    } else if (params.action === 'renew') {
      nextPkgStatus = 'active';
      nextFrozenFrom = null;
      nextFrozenUntil = null;
      nextFreezeReason = null;
      const valDays = Number(pkgContract.validity_days_snapshot || 30);
      const baseRenew = nextEndDate && nextEndDate >= todayIso ? addDaysIso(nextEndDate, 1) : todayIso;
      nextEndDate = params.newEndDate ? String(params.newEndDate).slice(0, 10) : addDaysIso(baseRenew, Math.max(1, valDays) - 1);
      const renewAmount = params.newAmount !== undefined && Number(params.newAmount) > 0
        ? Number(params.newAmount)
        : Number(pkgContract.contracted_price || 0);
      if (params.generateRenewalCharge && renewAmount > 0) {
        if (pkgContract.recurring_plan_id) {
          const linkedPlan = db.prepare(`SELECT * FROM recurring_billing_plans WHERE id = ? AND tenant_id = ?`).get(pkgContract.recurring_plan_id, params.tenantId) as any;
          if (linkedPlan) {
            BillingCycleService.generateCyclesForPlanTx({
              tenantId: params.tenantId,
              plan: { ...linkedPlan, amount: renewAmount, status: 'active' },
              competenceMonth: baseRenew.slice(0, 7),
              initialPaymentStatus: params.markFirstPaymentPaid ? 'paid' : 'pending'
            });
          }
        } else {
          const isPaidNow = Boolean(params.markFirstPaymentPaid);
          db.prepare(`
            INSERT INTO payments (
              id, tenant_id, appointment_id, patient_id, amount, payment_method, status, payment_date,
              notes, base_amount, due_date, package_contract_id, installment_number, total_installments
            ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
          `).run(
            'pay-' + uuidv4().slice(0, 8),
            params.tenantId,
            pkgContract.student_id,
            renewAmount,
            params.paymentMethod || 'pix',
            isPaidNow ? 'paid' : 'pending',
            isPaidNow ? new Date().toISOString() : null,
            `Renovação: ${pkgContract.package_name_snapshot}`,
            renewAmount,
            baseRenew,
            pkgContract.id
          );
        }
      }
    }

    db.prepare(`
      UPDATE student_package_contracts
      SET contract_status = ?,
          end_date = ?,
          frozen_from_date = ?,
          frozen_until_date = ?,
          freeze_reason = ?,
          suspended_at = CASE WHEN ? = 'suspended' THEN datetime('now') ELSE suspended_at END,
          suspension_reason = CASE WHEN ? = 'suspended' THEN COALESCE(?, suspension_reason) ELSE suspension_reason END,
          confirmed_by = CASE WHEN ? = 'active' AND confirmed_by IS NULL THEN ? ELSE confirmed_by END,
          confirmed_at = CASE WHEN ? = 'active' AND confirmed_at IS NULL THEN datetime('now') ELSE confirmed_at END,
          updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(
      nextPkgStatus,
      nextEndDate,
      nextFrozenFrom,
      nextFrozenUntil,
      nextFreezeReason,
      nextPkgStatus,
      nextPkgStatus,
      params.reason || null,
      nextPkgStatus,
      params.actorId,
      nextPkgStatus,
      pkgContract.id,
      params.tenantId
    );

    if (pkgContract.recurring_plan_id) {
      const rpStatus = nextPkgStatus === 'active' ? 'active' : (nextPkgStatus === 'cancelled' ? 'cancelled' : 'paused');
      db.prepare(`UPDATE recurring_billing_plans SET status = ?, contract_status = ?, end_date = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`).run(
        rpStatus,
        nextPkgStatus,
        nextEndDate,
        pkgContract.recurring_plan_id,
        params.tenantId
      );
    }

    const updatedPkg = PackageService.getContractById(params.tenantId, pkgContract.id);
    this.recordContractHistoryTx({
      tenantId: params.tenantId,
      patientId: pkgContract.student_id,
      packageContractId: pkgContract.id,
      recurringPlanId: pkgContract.recurring_plan_id || null,
      action: `PACKAGE_CONTRACT_${params.action.toUpperCase()}`,
      summary: `Operação contratual "${params.action}" no pacote "${pkgContract.package_name_snapshot}"`,
      previousState: prevContract,
      newState: updatedPkg,
      reason: params.reason || null,
      createdBy: params.actorId
    });

    return { contractSource: 'package_contract', packageContract: updatedPkg };
  }

  /**
   * Cancela um complemento opcional individual mantendo o plano-base e demais benefícios ativos.
   * Preserva integralmente cobranças já pagas e sessões já realizadas.
   */
  static cancelAddonFromEnrollmentTx(params: {
    tenantId: string;
    contractId: string;
    entitlementId: string;
    reason?: string | null;
    cancelFuturePendingPayments?: boolean;
    cancelFutureScheduledAppointments?: boolean;
    actorId: string;
  }): any {
    this.ensureStudioCompatible(params.tenantId);
    const { dateIso: todayIso } = getBrazilNowParts();

    const pkgContract = db
      .prepare(`SELECT * FROM student_package_contracts WHERE id = ? AND tenant_id = ?`)
      .get(params.contractId, params.tenantId) as any;
    if (!pkgContract) {
      throw Object.assign(new Error('Matrícula/contrato não encontrado neste estabelecimento.'), { status: 404 });
    }
    if (pkgContract.contract_status === 'cancelled') {
      throw Object.assign(new Error('Este contrato já está cancelado.'), { status: 409 });
    }

    const ent = db
      .prepare(`SELECT * FROM student_package_entitlements WHERE id = ? AND contract_id = ? AND tenant_id = ?`)
      .get(params.entitlementId, params.contractId, params.tenantId) as any;
    if (!ent) {
      throw Object.assign(new Error('Complemento opcional não encontrado nesta matrícula.'), { status: 404 });
    }
    if (String(ent.entitlement_role || 'primary') !== 'addon') {
      throw Object.assign(
        new Error('Apenas benefícios adicionados como complemento podem ser cancelados separadamente sem encerrar o plano-base.'),
        { status: 400 }
      );
    }
    if (String(ent.entitlement_status || 'active') === 'cancelled') {
      throw Object.assign(new Error('Este complemento já foi cancelado anteriormente.'), { status: 409 });
    }

    const prevSnapshot = PackageService.getContractById(params.tenantId, pkgContract.id);

    db.prepare(`
      UPDATE student_package_entitlements
      SET entitlement_status = 'cancelled',
          cancelled_at = datetime('now'),
          cancellation_reason = ?,
          updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(params.reason || 'Cancelamento independente do complemento', ent.id, params.tenantId);

    if (params.cancelFutureScheduledAppointments !== false) {
      db.prepare(`
        UPDATE appointments
        SET status = 'cancelled',
            attendance_status = 'cancelled',
            cancellation_reason = ?,
            cancelled_at = datetime('now')
        WHERE tenant_id = ?
          AND package_contract_id = ?
          AND (package_entitlement_id = ? OR service_id = ?)
          AND status IN ('scheduled', 'confirmed')
          AND substr(start_time, 1, 10) >= ?
      `).run(
        params.reason || `Cancelamento do complemento: ${ent.service_name_snapshot}`,
        params.tenantId,
        pkgContract.id,
        ent.id,
        ent.service_id,
        todayIso
      );
    }

    let addonPricing: any = null;
    try {
      if (ent.addon_pricing_json) addonPricing = JSON.parse(ent.addon_pricing_json);
    } catch (_) {}
    const addonNetCycleReais = Math.round(Number(addonPricing?.netPriceCents || 0)) / 100;

    if (params.cancelFuturePendingPayments !== false && addonNetCycleReais >= 0) {
      const pendingPays = db.prepare(`
        SELECT id, amount, notes, service_id
        FROM payments
        WHERE tenant_id = ? AND package_contract_id = ? AND status = 'pending'
        ORDER BY due_date ASC
      `).all(params.tenantId, pkgContract.id) as any[];

      for (const p of pendingPays) {
        const notesStr = String(p.notes || '');
        const isDedicatedAddonCharge =
          (p.service_id && p.service_id === ent.service_id) ||
          notesStr.includes(`Complemento:${ent.addon_option_id || ''}`) ||
          notesStr.includes(`Complemento opcional incluído: ${addonPricing?.label || ent.service_name_snapshot}`) ||
          (addonPricing?.label && notesStr.includes(addonPricing.label) && !notesStr.includes(pkgContract.package_name_snapshot));

        if (isDedicatedAddonCharge) {
          db.prepare(`
            UPDATE payments
            SET status = 'cancelled',
                notes = COALESCE(notes, '') || ' [Cancelado ao encerrar complemento opcional]'
            WHERE id = ? AND tenant_id = ?
          `).run(p.id, params.tenantId);
        } else if (
          addonNetCycleReais > 0 &&
          addonPricing?.effectivePeriodicity !== 'one_time' &&
          Number(p.amount) >= addonNetCycleReais &&
          notesStr.includes('+')
        ) {
          const reduced = Math.round(Math.max(0, Number(p.amount) - addonNetCycleReais) * 100) / 100;
          if (reduced <= 0) {
            db.prepare(`UPDATE payments SET status = 'cancelled', notes = COALESCE(notes, '') || ' [Ajustado após cancelamento de complemento]' WHERE id = ? AND tenant_id = ?`).run(p.id, params.tenantId);
          } else {
            db.prepare(`UPDATE payments SET amount = ?, base_amount = ?, notes = COALESCE(notes, '') || ' [Valor reduzido após cancelamento de complemento]' WHERE id = ? AND tenant_id = ?`).run(reduced, reduced, p.id, params.tenantId);
          }
        }
      }

      if (addonNetCycleReais > 0 && addonPricing?.effectivePeriodicity !== 'one_time') {
        const newContractedPrice = Math.max(0, Math.round((Number(pkgContract.contracted_price || 0) - addonNetCycleReais) * 100) / 100);
        db.prepare(`UPDATE student_package_contracts SET contracted_price = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`)
          .run(newContractedPrice, pkgContract.id, params.tenantId);
        if (pkgContract.recurring_plan_id) {
          const rp = db.prepare(`SELECT amount FROM recurring_billing_plans WHERE id = ? AND tenant_id = ?`).get(pkgContract.recurring_plan_id, params.tenantId) as any;
          if (rp && Number(rp.amount) >= addonNetCycleReais) {
            const newRpAmount = Math.max(0, Math.round((Number(rp.amount) - addonNetCycleReais) * 100) / 100);
            db.prepare(`UPDATE recurring_billing_plans SET amount = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`)
              .run(newRpAmount, pkgContract.recurring_plan_id, params.tenantId);
          }
        }
      }
    }

    const updatedPkg = PackageService.getContractById(params.tenantId, pkgContract.id);
    this.recordContractHistoryTx({
      tenantId: params.tenantId,
      patientId: pkgContract.student_id,
      packageContractId: pkgContract.id,
      recurringPlanId: pkgContract.recurring_plan_id || null,
      action: 'CANCEL_ADDON',
      summary: `Complemento opcional cancelado (${ent.service_name_snapshot}) com manutenção do plano-base ativo`,
      previousState: prevSnapshot,
      newState: updatedPkg,
      reason: params.reason || null,
      createdBy: params.actorId
    });

    return {
      contractSource: 'package_contract',
      contractId: pkgContract.id,
      cancelledEntitlementId: ent.id,
      packageContract: updatedPkg
    };
  }

  /**
   * Inclui um complemento opcional posteriormente em uma matrícula ativa (de plano solo ou combinado).
   */
  static addAddonToEnrollmentTx(params: {
    tenantId: string;
    contractId: string;
    addonOptionId: string;
    startDate?: string;
    dueDay?: number;
    paymentMethod?: string;
    initialPaymentStatus?: 'pending' | 'paid' | 'exempt';
    generateInitialCharge?: boolean;
    scheduleEntries?: Array<{ dayOfWeek: number; startTime: string; endTime: string; professionalId?: string }>;
    actorId: string;
  }): any {
    this.ensureStudioCompatible(params.tenantId);
    const { dateIso: todayIso } = getBrazilNowParts();

    let pkgContract = db
      .prepare(`SELECT * FROM student_package_contracts WHERE id = ? AND tenant_id = ?`)
      .get(params.contractId, params.tenantId) as any;
    const soloPlan = !pkgContract
      ? (db.prepare(`SELECT * FROM recurring_billing_plans WHERE id = ? AND tenant_id = ?`).get(params.contractId, params.tenantId) as any)
      : null;

    if (!pkgContract && !soloPlan) {
      throw Object.assign(new Error('Matrícula não encontrada neste estabelecimento.'), { status: 404 });
    }

    if (soloPlan && soloPlan.package_contract_id) {
      pkgContract = db
        .prepare(`SELECT * FROM student_package_contracts WHERE id = ? AND tenant_id = ?`)
        .get(soloPlan.package_contract_id, params.tenantId) as any;
    }

    const baseServiceId = pkgContract?.base_service_id || soloPlan?.service_id;
    if (!baseServiceId) {
      throw Object.assign(new Error('Esta matrícula não possui plano-base compatível para inclusão de complemento.'), { status: 400 });
    }

    const currentStatus = pkgContract ? pkgContract.contract_status : (soloPlan.contract_status || soloPlan.status);
    if (!['active', 'approved', 'confirmed'].includes(String(currentStatus || ''))) {
      throw Object.assign(new Error('A inclusão de complementos exige uma matrícula ativa.'), { status: 409 });
    }

    const baseSrv = db.prepare(`
      SELECT id, name, price, periodic_price, billing_mode, default_billing_due_day, default_plan_duration,
             commercial_price_options_json, optional_addons_json, access_config_json,
             COALESCE(studio_service_type, CASE WHEN COALESCE(service_kind, 'individual') = 'group' THEN 'group' ELSE 'individual' END) as studio_service_type
      FROM services WHERE id = ? AND tenant_id = ?
    `).get(baseServiceId, params.tenantId) as any;

    if (!baseSrv) {
      throw Object.assign(new Error('Serviço-base da matrícula não encontrado.'), { status: 404 });
    }

    const addonsCfg = normalizeOptionalAddonsConfig(baseSrv.optional_addons_json);
    const addonOpt = addonsCfg.options.find(o => o.id === params.addonOptionId && o.active);
    if (!addonOpt) {
      throw Object.assign(new Error('Complemento opcional selecionado não encontrado ou inativo neste plano.'), { status: 400 });
    }

    const addonSrv = db.prepare(`
      SELECT id, name, active, service_kind, service_domain, clinical_module,
             COALESCE(studio_service_type, CASE WHEN COALESCE(service_kind, 'individual') = 'group' THEN 'group' ELSE 'individual' END) as studio_service_type
      FROM services WHERE id = ? AND tenant_id = ?
    `).get(addonOpt.addonServiceId, params.tenantId) as any;
    if (!addonSrv || Number(addonSrv.active) === 0) {
      throw Object.assign(new Error(`O serviço "${addonOpt.label}" está inativo.`), { status: 400 });
    }

    const establishmentProfile = getTenantEstablishmentProfile(params.tenantId);
    const baseOptions = normalizeCommercialPriceOptions(baseSrv.commercial_price_options_json, {
      studioServiceType: baseSrv.studio_service_type
    });
    const fallbackBase = buildFallbackBaseCommercialOption(baseSrv);
    let baseOptForCalc = fallbackBase;
    let resolvedCatalogBaseOpt: any = null;
    if (pkgContract?.commercial_snapshot_json) {
      try {
        const parsed = JSON.parse(pkgContract.commercial_snapshot_json);
        if (parsed?.baseOption?.id) {
          baseOptForCalc = parsed.baseOption;
          resolvedCatalogBaseOpt = baseOptions.find(o => o.id === parsed.baseOption.id) || parsed.baseOption;
        }
      } catch (_) {}
    } else if (soloPlan?.commercial_snapshot_json) {
      try {
        const parsed = JSON.parse(soloPlan.commercial_snapshot_json);
        if (parsed?.baseOption?.id) {
          baseOptForCalc = parsed.baseOption;
          resolvedCatalogBaseOpt = baseOptions.find(o => o.id === parsed.baseOption.id) || parsed.baseOption;
        }
      } catch (_) {}
    }
    if (!resolvedCatalogBaseOpt && baseOptions.length > 0 && soloPlan?.plan_duration_code) {
      baseOptForCalc = baseOptions.find(o => o.contractDurationCode === soloPlan.plan_duration_code && o.active) || fallbackBase;
      resolvedCatalogBaseOpt = baseOptForCalc;
    }

    if (resolvedCatalogBaseOpt && !addonAppliesToBaseOption(addonOpt, resolvedCatalogBaseOpt)) {
      throw Object.assign(
        new Error(`O complemento "${addonOpt.label}" não está habilitado para a opção comercial desta matrícula.`),
        { status: 400 }
      );
    }

    const itemBreakdown = calculatePlanWithAddonsBreakdown({
      baseOption: baseOptForCalc,
      selectedAddons: [addonOpt]
    }).addons[0];

    let targetContractId = pkgContract?.id;
    let studentId = pkgContract?.student_id || soloPlan?.patient_id;

    // Promove matrícula solo em recurring_billing_plans para contrato com benefícios separados mantendo o plano original intacto
    if (!targetContractId && soloPlan) {
      targetContractId = 'ctr-' + uuidv4().slice(0, 8);
      const baseTitle = `${soloPlan.title || baseSrv.name} + ${addonOpt.label}`;
      const basePeriodicity = soloPlan.payment_periodicity || soloPlan.billing_frequency || 'monthly';
      const { frequency: billingFreq, cycleMonths } = normalizePeriodicFrequency(basePeriodicity);
      const baseAmount = Number(soloPlan.amount || 0);
      db.prepare(`
        INSERT INTO student_package_contracts (
          id, tenant_id, package_id, student_id, recurring_plan_id,
          package_name_snapshot, description_snapshot, billing_type_snapshot, billing_frequency_snapshot, cycle_months_snapshot,
          credit_mode_snapshot, contracted_price, installments_count, total_credits_snapshot, weekly_limit_snapshot,
          validity_days_snapshot, due_day_snapshot, absent_consumption_policy_snapshot,
          cancellation_hours_limit_snapshot, start_date, end_date, contract_status,
          payment_status, origin, notes, base_service_id, contract_duration_code,
          payment_periodicity_snapshot, total_contract_amount, fidelity_months_snapshot, grace_period_days_snapshot,
          auto_renew_snapshot, commercial_snapshot_json, confirmed_by, confirmed_at, created_by, created_at, updated_at
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, 'recurring_monthly', ?, ?, 'per_service', ?, 1, 0, ?, ?, ?, 'consume', 12, ?, ?, 'active', 'pending', 'admin', ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, datetime('now'), ?, datetime('now'), datetime('now'))
      `).run(
        targetContractId,
        params.tenantId,
        soloPlan.patient_id,
        soloPlan.id,
        baseTitle,
        `Plano-base: ${baseSrv.name} + Complemento incluído posteriormente: ${addonOpt.label}`,
        billingFreq,
        cycleMonths,
        baseAmount,
        soloPlan.weekly_frequency ?? null,
        30,
        Number(soloPlan.due_day || 10),
        soloPlan.start_date || todayIso,
        soloPlan.end_date || null,
        soloPlan.notes || null,
        baseSrv.id,
        soloPlan.plan_duration_code || baseOptForCalc.contractDurationCode,
        basePeriodicity,
        Number(soloPlan.total_contract_amount || baseAmount),
        soloPlan.auto_renew ? 1 : 0,
        JSON.stringify({ serviceName: baseSrv.name, baseOption: baseOptForCalc }),
        params.actorId,
        params.actorId
      );

      db.prepare(`UPDATE recurring_billing_plans SET package_contract_id = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`)
        .run(targetContractId, soloPlan.id, params.tenantId);

      const baseAccessCfg = normalizeStudioAccessConfig(soloPlan.access_rules_snapshot_json || baseSrv.access_config_json);
      const baseType = baseSrv.studio_service_type === 'facility_access' ? 'facility_access' : 'scheduled_service';
      db.prepare(`
        INSERT INTO student_package_entitlements (
          id, tenant_id, contract_id, service_id, service_name_snapshot,
          allowed_service_ids_json, weekly_frequency_snapshot, credits_total, credits_reserved, credits_used,
          entitlement_type, entitlement_role, access_mode_snapshot, monthly_limit_snapshot, access_rules_snapshot_json, entries_used
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, 'base', ?, ?, ?, 0)
      `).run(
        'ent-' + uuidv4().slice(0, 8),
        params.tenantId,
        targetContractId,
        baseSrv.id,
        baseSrv.name,
        JSON.stringify([baseSrv.id]),
        soloPlan.weekly_frequency ?? null,
        baseType,
        baseType === 'facility_access' ? (soloPlan.access_mode_snapshot || baseAccessCfg.accessMode || 'unlimited') : null,
        baseAccessCfg.maxEntriesPerMonth ?? null,
        baseSrv.access_config_json || null
      );

      pkgContract = db.prepare(`SELECT * FROM student_package_contracts WHERE id = ? AND tenant_id = ?`).get(targetContractId, params.tenantId) as any;
    } else {
      const existingSameActive = db.prepare(`
        SELECT id FROM student_package_entitlements
        WHERE tenant_id = ? AND contract_id = ? AND addon_option_id = ? AND COALESCE(entitlement_status, 'active') != 'cancelled'
      `).get(params.tenantId, targetContractId, addonOpt.id);
      if (existingSameActive) {
        throw Object.assign(new Error(`O complemento "${addonOpt.label}" já está ativo nesta matrícula.`), { status: 409 });
      }
      if (!addonsCfg.allowMultiple) {
        const anyOtherActive = db.prepare(`
          SELECT id FROM student_package_entitlements
          WHERE tenant_id = ? AND contract_id = ? AND entitlement_role = 'addon' AND COALESCE(entitlement_status, 'active') != 'cancelled'
        `).get(params.tenantId, targetContractId);
        if (anyOtherActive) {
          throw Object.assign(new Error('Este plano permite apenas um complemento opcional ativo por vez.'), { status: 409 });
        }
      }
    }

    const addonSrvType = normalizeStudioServiceType(addonSrv.studio_service_type, addonSrv.service_kind);
    const targetDomain = resolveServiceDomain({
      establishmentProfile,
      serviceDomain: addonSrv.service_domain,
      serviceKind: addonSrv.service_kind,
      clinicalModule: addonSrv.clinical_module
    });
    if (targetDomain !== 'studio') {
      throw Object.assign(new Error('Complemento precisa pertencer ao domínio Academia & Studio.'), { status: 400 });
    }
    const entType: 'scheduled_service' | 'facility_access' | 'deliverable' =
      addonSrvType === 'facility_access'
        ? 'facility_access'
        : (addonSrvType === 'non_scheduled' ? 'deliverable' : 'scheduled_service');
    const addonCreditMode =
      entType === 'facility_access' || itemBreakdown.frequencyType === 'unlimited'
        ? 'unlimited'
        : (itemBreakdown.creditMode || 'fixed_credits');
    const entCredits =
      entType === 'facility_access'
        ? 0
        : (entType === 'deliverable'
            ? 1
            : addonCreditMode === 'unlimited'
              ? 0
              : addonCreditMode === 'weekly_guaranteed'
                ? Math.ceil(Math.max(1, itemBreakdown.frequencyCount || 1) * 4.5 * itemBreakdown.durationMonths)
                : (itemBreakdown.totalCreditsInDuration ?? itemBreakdown.creditsPerCycle ?? 0));
    const addonStartDate = params.startDate ? String(params.startDate).slice(0, 10) : todayIso;
    const addonEndDate = addDaysIso(
      addMonthsClampIso(addonStartDate, itemBreakdown.durationMonths, Number(addonStartDate.slice(8, 10))),
      -1
    );

    const newEntId = 'ent-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO student_package_entitlements (
        id, tenant_id, contract_id, service_id, service_name_snapshot,
        allowed_service_ids_json, weekly_frequency_snapshot, credits_total, credits_reserved, credits_used,
        credit_mode_snapshot, credits_per_cycle_snapshot,
        entitlement_type, entitlement_role, addon_option_id, addon_pricing_json,
        access_mode_snapshot, monthly_limit_snapshot, schedule_snapshot_json, entries_used
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 'addon', ?, ?, ?, ?, ?, 0)
    `).run(
      newEntId,
      params.tenantId,
      targetContractId,
      addonOpt.addonServiceId,
      `${addonOpt.label} (${addonSrv.name})`,
      JSON.stringify([addonOpt.addonServiceId]),
      itemBreakdown.frequencyType === 'weekly' ? itemBreakdown.frequencyCount : null,
      entCredits,
      addonCreditMode,
      entType === 'scheduled_service' && addonCreditMode === 'fixed_credits' ? (itemBreakdown.creditsPerCycle ?? null) : null,
      entType,
      addonOpt.id,
      JSON.stringify({ ...itemBreakdown, startDate: addonStartDate, endDate: addonEndDate }),
      entType === 'facility_access' ? (itemBreakdown.frequencyType === 'unlimited' ? 'unlimited' : 'limited') : null,
      itemBreakdown.frequencyType === 'monthly' ? itemBreakdown.frequencyCount : null,
      Array.isArray(params.scheduleEntries) && params.scheduleEntries.length > 0 ? JSON.stringify(params.scheduleEntries) : null
    );

    const netReais = Math.round(itemBreakdown.netPriceCents) / 100;
    const chargeDueDate = params.startDate ? String(params.startDate).slice(0, 10) : todayIso;
    if (params.generateInitialCharge !== false && netReais > 0) {
      const payStatus = params.initialPaymentStatus === 'paid' ? 'paid' : (params.initialPaymentStatus === 'exempt' ? 'exempt' : 'pending');
      db.prepare(`
        INSERT INTO payments (
          id, tenant_id, appointment_id, patient_id, service_id, recurring_plan_id, package_contract_id,
          amount, base_amount, discount_amount, payment_method, status, payment_date,
          due_date, competence_month, installment_number, total_installments, notes, created_at
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, datetime('now'))
      `).run(
        'pay-' + uuidv4().slice(0, 8),
        params.tenantId,
        studentId,
        addonOpt.addonServiceId,
        null, // Cobrança adicional do complemento vinculada ao package_contract_id (evita colisão de unicidade na mesma competência da mensalidade-base)
        targetContractId,
        netReais,
        Math.round(itemBreakdown.grossPriceCents) / 100,
        Math.round(itemBreakdown.discountCents) / 100,
        params.paymentMethod || 'pix',
        payStatus,
        payStatus === 'paid' ? new Date().toISOString() : null,
        chargeDueDate,
        chargeDueDate.slice(0, 7),
        `Complemento opcional incluído: ${addonOpt.label}`
      );
    }

    const updatedPkg = PackageService.getContractById(params.tenantId, targetContractId);
    this.recordContractHistoryTx({
      tenantId: params.tenantId,
      patientId: studentId,
      packageContractId: targetContractId,
      recurringPlanId: pkgContract?.recurring_plan_id || null,
      action: 'ADD_ADDON',
      summary: `Complemento opcional "${addonOpt.label}" incluído na matrícula ativa`,
      newState: updatedPkg,
      createdBy: params.actorId
    });

    return {
      contractSource: 'package_contract',
      contractId: targetContractId,
      addedEntitlementId: newEntId,
      packageContract: updatedPkg
    };
  }

  /**
   * Lista consolidada de matrículas, contratos e acessos (por estabelecimento ou por aluno).
   */
  static listEnrollments(tenantId: string, filters?: {
    studentId?: string;
    status?: string;
    search?: string;
    serviceId?: string;
    period?: string;
    kind?: string;
  }): {
    enrollments: any[];
    pendingRequests: any[];
    summary: {
      activeCount: number;
      futureCount: number;
      expiredCount: number;
      suspendedCount: number;
      requestedCount: number;
      expiringSoonCount: number;
      pendingPublicRequestsCount: number;
    };
  } {
    this.ensureStudioCompatible(tenantId);
    const { dateIso: todayIso } = getBrazilNowParts();
    const soonIso = addDaysIso(todayIso, 7);
    const soon30Iso = addDaysIso(todayIso, 30);

    let planWhere = `rbp.tenant_id = ? AND rbp.package_contract_id IS NULL`;
    const planParams: any[] = [tenantId];
    if (filters?.studentId) {
      planWhere += ` AND rbp.patient_id = ?`;
      planParams.push(filters.studentId);
    }

    const planRows = db.prepare(`
      SELECT
        rbp.*,
        pat.full_name as student_name,
        pat.phone as student_phone,
        pat.whatsapp as student_whatsapp,
        pat.email as student_email,
        pat.cpf as student_cpf,
        s.name as service_name,
        s.modality_category as modality_category,
        COALESCE(s.studio_service_type, CASE WHEN COALESCE(s.service_kind, 'individual') = 'group' THEN 'group' ELSE 'individual' END) as studio_service_type,
        s.access_config_json as service_access_config_json,
        (SELECT COUNT(*) FROM appointments a WHERE a.tenant_id = rbp.tenant_id AND a.recurring_plan_id = rbp.id AND a.status != 'cancelled') as scheduled_sessions_count,
        (SELECT COUNT(*) FROM appointments a WHERE a.tenant_id = rbp.tenant_id AND a.recurring_plan_id = rbp.id AND a.status != 'cancelled' AND a.attendance_status = 'present') as used_sessions_count,
        (SELECT COUNT(*) FROM appointments a WHERE a.tenant_id = rbp.tenant_id AND a.recurring_plan_id = rbp.id AND a.status IN ('scheduled', 'confirmed') AND COALESCE(a.attendance_status, 'pending') = 'pending') as reserved_sessions_count,
        (SELECT MIN(pay.due_date) FROM payments pay WHERE pay.tenant_id = rbp.tenant_id AND pay.recurring_plan_id = rbp.id AND pay.status = 'pending') as next_due_date,
        (SELECT COUNT(*) FROM payments pay WHERE pay.tenant_id = rbp.tenant_id AND pay.recurring_plan_id = rbp.id AND pay.status = 'pending' AND pay.due_date IS NOT NULL AND pay.due_date < ?) as overdue_payments_count,
        (SELECT COUNT(*) FROM payments pay WHERE pay.tenant_id = rbp.tenant_id AND pay.recurring_plan_id = rbp.id AND pay.status = 'pending') as pending_payments_count
      FROM recurring_billing_plans rbp
      JOIN patients pat ON pat.id = rbp.patient_id AND pat.tenant_id = rbp.tenant_id
      LEFT JOIN services s ON s.id = rbp.service_id AND s.tenant_id = rbp.tenant_id
      WHERE ${planWhere}
      ORDER BY rbp.created_at DESC
      LIMIT 300
    `).all(
      todayIso,
      ...planParams
    ) as any[];

    const pkgContracts = PackageService.listContracts(tenantId, {
      studentId: filters?.studentId
    });

    const enrollments: any[] = [];

    for (const r of planRows) {
      const cfg = normalizeStudioAccessConfig(r.access_rules_snapshot_json || r.service_access_config_json);
      if (r.access_mode_snapshot === 'limited' || r.access_mode_snapshot === 'unlimited') {
        cfg.accessMode = r.access_mode_snapshot;
      }
      const isAccessPlan = r.contract_kind === 'access_plan' || r.studio_service_type === 'facility_access';
      let lifecycleCategory: 'active' | 'future' | 'expired' | 'suspended' | 'requested' | 'cancelled' = 'active';
      if (r.status === 'cancelled' || r.contract_status === 'cancelled') {
        lifecycleCategory = 'cancelled';
      } else if (r.contract_status === 'requested') {
        lifecycleCategory = 'requested';
      } else if (r.status === 'paused' || r.contract_status === 'suspended' || r.contract_status === 'frozen' || (r.frozen_from_date && r.frozen_until_date && todayIso >= r.frozen_from_date && todayIso <= r.frozen_until_date)) {
        lifecycleCategory = 'suspended';
      } else if (r.end_date && r.end_date < todayIso) {
        lifecycleCategory = 'expired';
      } else if (r.start_date && r.start_date > todayIso) {
        lifecycleCategory = 'future';
      }

      const financialStatus = Number(r.overdue_payments_count) > 0
        ? 'overdue'
        : (Number(r.pending_payments_count) > 0 ? 'pending' : 'paid');

      enrollments.push({
        id: r.id,
        contractSource: 'recurring_plan',
        contractKind: isAccessPlan ? 'access_plan' : (r.contract_kind || 'scheduled_plan'),
        studentId: r.patient_id,
        studentName: r.student_name,
        studentPhone: r.student_phone,
        studentWhatsapp: r.student_whatsapp || null,
        studentEmail: r.student_email || null,
        studentCpf: r.student_cpf,
        serviceId: r.service_id,
        serviceName: r.service_name || r.title,
        modalityCategory: r.modality_category || null,
        packageId: null,
        title: r.title,
        notes: r.notes || null,
        lifecycleCategory,
        contractStatus: lifecycleCategory === 'expired' ? 'expired' : (r.contract_status || r.status),
        financialStatus,
        startDate: r.start_date,
        endDate: r.end_date,
        nextDueDate: r.next_due_date || null,
        contractedAt: r.created_at,
        amount: Number(r.amount || 0),
        totalContractAmount: Number(r.total_contract_amount || r.amount || 0),
        billingFrequency: r.billing_frequency || r.billing_cycle || 'monthly',
        paymentPeriodicity: r.payment_periodicity || r.billing_frequency || 'monthly',
        planDurationCode: r.plan_duration_code || '1_month',
        installmentsCount: Number(r.installments_count || 1),
        dueDay: Number(r.due_day || 10),
        fidelityMonths: Number(r.fidelity_months || 0),
        gracePeriodDays: Number(r.grace_period_days || 0),
        autoRenew: Boolean(r.auto_renew),
        frozenFromDate: r.frozen_from_date || null,
        frozenUntilDate: r.frozen_until_date || null,
        freezeReason: r.freeze_reason || null,
        accessMode: isAccessPlan ? cfg.accessMode : 'none',
        accessConfig: isAccessPlan ? cfg : null,
        weeklyFrequency: r.weekly_frequency || (isAccessPlan ? cfg.maxEntriesPerWeek : null),
        monthlyLimit: isAccessPlan ? cfg.maxEntriesPerMonth : null,
        creditMode: r.credit_mode_snapshot || null,
        credit_mode_snapshot: r.credit_mode_snapshot || null,
        creditsPerCycle: r.credits_per_cycle_snapshot !== null && r.credits_per_cycle_snapshot !== undefined ? Number(r.credits_per_cycle_snapshot) : null,
        credits_per_cycle_snapshot: r.credits_per_cycle_snapshot !== null && r.credits_per_cycle_snapshot !== undefined ? Number(r.credits_per_cycle_snapshot) : null,
        creditsTotal: Number(r.included_sessions || r.reference_sessions_count || 0),
        creditsUsed: Number(r.used_sessions_count || 0),
        creditsReserved: Number(r.reserved_sessions_count || 0),
        creditsRemaining: r.included_sessions
          ? Math.max(0, Number(r.included_sessions) - Number(r.used_sessions_count || 0) - Number(r.reserved_sessions_count || 0))
          : null,
        entitlements: []
      });
    }

    for (const c of pkgContracts) {
      let lifecycleCategory: 'active' | 'future' | 'expired' | 'suspended' | 'requested' | 'cancelled' = 'active';
      if (c.contract_status === 'cancelled') {
        lifecycleCategory = 'cancelled';
      } else if (c.contract_status === 'requested') {
        lifecycleCategory = 'requested';
      } else if (c.contract_status === 'suspended' || (c.frozen_from_date && c.frozen_until_date && todayIso >= c.frozen_from_date && todayIso <= c.frozen_until_date)) {
        lifecycleCategory = 'suspended';
      } else if (c.contract_status === 'expired' || (c.end_date && c.end_date < todayIso)) {
        lifecycleCategory = 'expired';
      } else if (c.start_date && c.start_date > todayIso) {
        lifecycleCategory = 'future';
      }

      const openPays = (c.payments || []).filter((p: any) => p.status === 'pending');
      const hasOverdue = openPays.some((p: any) => p.due_date && p.due_date < todayIso);
      const financialStatus = hasOverdue ? 'overdue' : (c.payment_status || 'pending');
      const nextDue = openPays.length > 0 ? openPays[0].due_date : null;

      const accessEnt = (c.entitlements || []).find((e: any) => e.entitlement_type === 'facility_access');
      let parsedCommSnap: any = null;
      try {
        if (c.commercial_snapshot_json) parsedCommSnap = JSON.parse(c.commercial_snapshot_json);
      } catch (_) {}
      const hasAddons = Boolean(c.base_service_id) && (
        Boolean(parsedCommSnap?.hasAddons) ||
        (c.entitlements || []).some((e: any) => e.entitlement_role === 'addon')
      );
      const resolvedContractKind = c.base_service_id
        ? (parsedCommSnap?.baseContractKind || 'access_plan')
        : 'combined_package';

      enrollments.push({
        id: c.id,
        contractSource: 'package_contract',
        contractKind: resolvedContractKind,
        baseContractKind: c.base_service_id ? (parsedCommSnap?.baseContractKind || 'access_plan') : null,
        hasAddons,
        baseServiceId: c.base_service_id || null,
        baseServiceName: parsedCommSnap?.serviceName || null,
        commercialBreakdown: parsedCommSnap?.breakdown || null,
        studentId: c.student_id,
        studentName: c.student_name,
        studentPhone: c.student_phone,
        studentWhatsapp: c.student_whatsapp || null,
        studentEmail: c.student_email || null,
        studentCpf: null,
        serviceId: c.base_service_id || null,
        serviceName: c.package_name_snapshot,
        modalityCategory: null,
        packageId: c.package_id,
        title: c.package_name_snapshot,
        notes: c.notes || null,
        lifecycleCategory,
        contractStatus: lifecycleCategory === 'expired' ? 'expired' : c.contract_status,
        financialStatus,
        startDate: c.start_date,
        endDate: c.end_date,
        nextDueDate: nextDue,
        contractedAt: c.created_at,
        amount: Number(c.contracted_price || 0),
        totalContractAmount: Number(c.total_contract_amount || c.contracted_price || 0),
        billingFrequency: c.billing_frequency_snapshot || 'monthly',
        paymentPeriodicity: c.payment_periodicity_snapshot || (c.billing_type_snapshot === 'one_time' ? 'one_time' : 'monthly'),
        planDurationCode: c.contract_duration_code || '1_month',
        installmentsCount: Number(c.installments_count || 1),
        dueDay: Number(c.due_day_snapshot || 10),
        fidelityMonths: Number(c.fidelity_months_snapshot || 0),
        gracePeriodDays: Number(c.grace_period_days_snapshot || 0),
        autoRenew: Boolean(c.auto_renew_snapshot),
        frozenFromDate: c.frozen_from_date || null,
        frozenUntilDate: c.frozen_until_date || null,
        freezeReason: c.freeze_reason || null,
        accessMode: accessEnt ? (accessEnt.access_mode_snapshot || 'unlimited') : 'none',
        accessConfig: accessEnt?.access_rules || null,
        weeklyFrequency: accessEnt?.weekly_frequency_snapshot || c.weekly_limit_snapshot || null,
        monthlyLimit: accessEnt?.monthly_limit_snapshot || null,
        creditMode: c.credit_mode_snapshot || c.entitlements?.[0]?.credit_mode_snapshot || null,
        credit_mode_snapshot: c.credit_mode_snapshot || c.entitlements?.[0]?.credit_mode_snapshot || null,
        creditsPerCycle: c.entitlements?.[0]?.credits_per_cycle_snapshot !== null && c.entitlements?.[0]?.credits_per_cycle_snapshot !== undefined ? Number(c.entitlements[0].credits_per_cycle_snapshot) : null,
        credits_per_cycle_snapshot: c.entitlements?.[0]?.credits_per_cycle_snapshot !== null && c.entitlements?.[0]?.credits_per_cycle_snapshot !== undefined ? Number(c.entitlements[0].credits_per_cycle_snapshot) : null,
        creditsTotal: Number(c.summary?.creditsTotal || 0),
        creditsUsed: Number(c.summary?.creditsUsed || 0),
        creditsReserved: Number(c.summary?.creditsReserved || 0),
        creditsRemaining: Number(c.summary?.creditsRemaining || 0),
        entitlements: c.entitlements || [],
        payments: c.payments || []
      });
    }

    const search = filters?.search ? String(filters.search).trim().toLowerCase() : '';
    const statusFilter = filters?.status ? String(filters.status).trim().toLowerCase() : 'all';
    const kindFilter = filters?.kind ? String(filters.kind).trim() : '';
    const serviceFilter = filters?.serviceId ? String(filters.serviceId).trim() : '';
    const periodFilter = filters?.period ? String(filters.period).trim().toLowerCase() : '';

    const filtered = enrollments.filter(item => {
      if (statusFilter && statusFilter !== 'all') {
        if (item.lifecycleCategory !== statusFilter && item.contractStatus !== statusFilter) {
          return false;
        }
      }
      if (kindFilter && kindFilter !== 'all') {
        const matchesCombinedAlias = kindFilter === 'combined_package' && Boolean(item.hasAddons);
        const matchesAddonsOnly = kindFilter === 'combined_addons' && Boolean(item.hasAddons);
        if (!matchesCombinedAlias && !matchesAddonsOnly && item.contractKind !== kindFilter && item.contractSource !== kindFilter) {
          return false;
        }
      }
      if (serviceFilter && serviceFilter !== 'all') {
        const cleanPkgFilter = serviceFilter.startsWith('pkg:') ? serviceFilter.slice(4) : null;
        if (cleanPkgFilter) {
          if (item.packageId !== cleanPkgFilter) return false;
        } else {
          const matchesDirect = item.serviceId === serviceFilter || item.packageId === serviceFilter;
          const matchesEnt = Array.isArray(item.entitlements) && item.entitlements.some((ent: any) =>
            ent.service_id === serviceFilter ||
            (Array.isArray(ent.allowed_service_ids) && ent.allowed_service_ids.includes(serviceFilter))
          );
          if (!matchesDirect && !matchesEnt) return false;
        }
      }
      if (periodFilter && periodFilter !== 'all') {
        if (periodFilter === 'expiring_7d') {
          if (!(item.lifecycleCategory === 'active' && item.endDate && item.endDate >= todayIso && item.endDate <= soonIso)) {
            return false;
          }
        } else if (periodFilter === 'expiring_30d') {
          if (!(item.lifecycleCategory === 'active' && item.endDate && item.endDate >= todayIso && item.endDate <= soon30Iso)) {
            return false;
          }
        } else if (periodFilter === 'expired') {
          if (!(item.lifecycleCategory === 'expired' || (item.endDate && item.endDate < todayIso))) {
            return false;
          }
        } else if (periodFilter === 'recurring') {
          if (item.endDate && item.paymentPeriodicity === 'one_time') {
            return false;
          }
        } else if (periodFilter === 'active_today') {
          if (item.lifecycleCategory !== 'active') return false;
        }
      }
      if (search) {
        const hay = `${item.studentName || ''} ${item.title || ''} ${item.serviceName || ''} ${item.studentPhone || ''} ${item.studentEmail || ''}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    let pendingRequests: any[] = [];
    try {
      const reqRows = db.prepare(`
        SELECT r.id, r.request_number, r.mode, r.service_id, r.start_date_iso,
               r.weekdays_label, r.time_range_label, r.plan_duration_label,
               r.patient_snapshot_json, r.payload_json, r.summary_snapshot_json, r.created_at
        FROM public_booking_requests r
        WHERE r.tenant_id = ?
          AND r.establishment_mode = 'studio'
          AND r.status = 'awaiting_confirmation'
          AND r.mode IN ('access_plan', 'package')
        ORDER BY r.created_at DESC
        LIMIT 50
      `).all(tenantId) as any[];

      pendingRequests = reqRows.map(rr => {
        let patSnap: any = {};
        let payloadSnap: any = {};
        let summarySnap: any = {};
        try { patSnap = JSON.parse(rr.patient_snapshot_json || '{}'); } catch (_) {}
        try { payloadSnap = JSON.parse(rr.payload_json || '{}'); } catch (_) {}
        try { summarySnap = JSON.parse(rr.summary_snapshot_json || '{}'); } catch (_) {}
        return {
          id: rr.id,
          requestNumber: rr.request_number,
          mode: rr.mode,
          serviceId: rr.service_id || payloadSnap.serviceId || null,
          packageId: payloadSnap.packageId || null,
          serviceName: summarySnap.serviceName || (rr.mode === 'package' ? 'Pacote online' : 'Plano de Acesso'),
          studentName: patSnap.fullName || 'Aluno solicitante',
          studentPhone: patSnap.phone || null,
          startDate: rr.start_date_iso || payloadSnap.startDate || null,
          accessLabel: rr.weekdays_label || summarySnap.accessLabel || null,
          planDurationLabel: rr.plan_duration_label || summarySnap.planDurationLabel || null,
          amount: payloadSnap.amount !== undefined && payloadSnap.amount !== null ? Number(payloadSnap.amount) : null,
          createdAt: rr.created_at
        };
      });
    } catch (_) {
      pendingRequests = [];
    }

    const summary = {
      activeCount: enrollments.filter(e => e.lifecycleCategory === 'active').length,
      futureCount: enrollments.filter(e => e.lifecycleCategory === 'future').length,
      expiredCount: enrollments.filter(e => e.lifecycleCategory === 'expired').length,
      suspendedCount: enrollments.filter(e => e.lifecycleCategory === 'suspended').length,
      requestedCount: enrollments.filter(e => e.lifecycleCategory === 'requested').length,
      expiringSoonCount: enrollments.filter(e => e.lifecycleCategory === 'active' && e.endDate && e.endDate >= todayIso && e.endDate <= soonIso).length,
      pendingPublicRequestsCount: pendingRequests.length
    };

    return { enrollments: filtered, pendingRequests, summary };
  }

  /**
   * Detalhamento completo de uma matrícula / contrato (aluno, regras, créditos/aulas, pagamentos e histórico).
   */
  static manualReceiptBlock(payment: { status: string; source_type?: string | null; transaction_id?: string | null }): string | null {
    if (payment.status !== 'pending') return 'Somente cobranças pendentes podem receber baixa integral.';
    if (payment.transaction_id || (payment.source_type && !['package_contract', 'recurring_plan'].includes(payment.source_type))) {
      return 'Esta cobrança deve ser liquidada pelo fluxo de origem.';
    }
    return null;
  }

  static getEnrollmentDetail(tenantId: string, contractId: string): any | null {
    this.ensureStudioCompatible(tenantId);
    const listRes = this.listEnrollments(tenantId);
    const enrollment = listRes.enrollments.find((e: any) => e.id === contractId);
    if (!enrollment) return null;

    const studentRow = db.prepare(`
      SELECT id, full_name, phone, whatsapp, email, cpf, notes
      FROM patients
      WHERE id = ? AND tenant_id = ?
      LIMIT 1
    `).get(enrollment.studentId, tenantId) as any;

    const payments = db.prepare(`
      SELECT id, amount, base_amount, status, due_date, payment_date, payment_method,
             source_type, transaction_id, competence_month, installment_number, total_installments, notes, created_at
      FROM payments
      WHERE tenant_id = ?
        AND (${enrollment.contractSource === 'package_contract' ? 'package_contract_id = ?' : 'recurring_plan_id = ?'})
      ORDER BY due_date ASC, created_at ASC
    `).all(tenantId, contractId) as any[];

    const appointments = db.prepare(`
      SELECT a.id, a.service_id, a.professional_id, a.package_entitlement_id, a.start_time, a.end_time, a.status,
             a.attendance_status, a.modality, a.patient_notes as notes,
             s.name as service_name, prof.name as professional_name
      FROM appointments a
      LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
      LEFT JOIN professionals prof ON prof.id = a.professional_id AND prof.tenant_id = a.tenant_id
      WHERE a.tenant_id = ?
        AND (${enrollment.contractSource === 'package_contract' ? 'a.package_contract_id = ?' : 'a.recurring_plan_id = ?'})
      ORDER BY a.start_time DESC
      LIMIT 80
    `).all(tenantId, contractId) as any[];

    const history = db.prepare(`
      SELECT h.*, u.name as performed_by_name
      FROM student_contract_history h
      LEFT JOIN users u ON u.id = h.created_by
      WHERE h.tenant_id = ?
        AND (h.recurring_plan_id = ? OR h.package_contract_id = ?)
      ORDER BY h.created_at DESC
      LIMIT 100
    `).all(tenantId, contractId, contractId) as any[];

    // Carrega opções de complementos ainda disponíveis para inclusão posterior no contrato ativo (filtradas pela opção comercial contratada)
    let availableAddons: any[] = [];
    const baseSrvId = enrollment.baseServiceId || enrollment.serviceId;
    if (baseSrvId && !['cancelled', 'expired'].includes(enrollment.lifecycleCategory)) {
      const baseSrv = db
        .prepare(`SELECT studio_service_type, requires_appointment, commercial_price_options_json, optional_addons_json FROM services WHERE id = ? AND tenant_id = ?`)
        .get(baseSrvId, tenantId) as {
          studio_service_type?: string | null;
          requires_appointment?: number | null;
          commercial_price_options_json?: string | null;
          optional_addons_json?: string | null;
        } | undefined;
      if (baseSrv?.optional_addons_json) {
        const cfg = normalizeOptionalAddonsConfig(baseSrv.optional_addons_json);
        const baseCommOpts = normalizeCommercialPriceOptions(baseSrv.commercial_price_options_json, {
          studioServiceType: baseSrv.studio_service_type,
          requiresAppointment: baseSrv.requires_appointment
        });
        const snapBaseOpt = enrollment.commercialSnapshot?.baseOption || null;
        const matchedCatalogBaseOpt = snapBaseOpt?.id
          ? (baseCommOpts.find(o => o.id === snapBaseOpt.id) || snapBaseOpt)
          : null;
        const activeAddonOptIds = new Set(
          (enrollment.entitlements || [])
            .filter((e: any) => e.entitlement_role === 'addon' && String(e.entitlement_status || 'active') !== 'cancelled')
            .map((e: any) => e.addon_option_id)
            .filter(Boolean)
        );
        availableAddons = cfg.options
          .filter(
            o =>
              o.active &&
              o.addonServiceId &&
              !activeAddonOptIds.has(o.id) &&
              addonAppliesToBaseOption(o, matchedCatalogBaseOpt)
          )
          .map(o => ({
            id: o.id,
            label: o.label,
            addonServiceId: o.addonServiceId,
            addonServiceName: o.addonServiceName || null,
            frequencyType: o.frequencyType,
            frequencyCount: o.frequencyCount,
            creditMode: o.creditMode || 'fixed_credits',
            creditsPerCycle: o.creditsPerCycle,
            additionalPriceCents: o.additionalPriceCents,
            comboDiscountType: o.comboDiscountType,
            comboDiscountValue: o.comboDiscountValue,
            billingPeriodicity: o.billingPeriodicity,
            durationMode: o.durationMode
          }));
      }
    }

    return {
      enrollment,
      student: studentRow ? {
        id: studentRow.id,
        full_name: studentRow.full_name,
        fullName: studentRow.full_name,
        phone: studentRow.phone,
        whatsapp: studentRow.whatsapp || null,
        email: studentRow.email || null,
        cpf: studentRow.cpf || null,
        notes: studentRow.notes || null
      } : {
        id: enrollment.studentId,
        fullName: enrollment.studentName,
        phone: enrollment.studentPhone,
        whatsapp: enrollment.studentWhatsapp || null,
        email: enrollment.studentEmail || null,
        cpf: enrollment.studentCpf || null,
        notes: null
      },
      entitlements: enrollment.entitlements || [],
      availableAddons,
      appointments,
      payments: payments.map(({ transaction_id, source_type, ...payment }) => ({
        ...payment, manualReceiptBlock: this.manualReceiptBlock({ status: payment.status, transaction_id, source_type })
      })),
      history
    };
  }

  /**
   * Edita metadados e regras operacionais de um contrato sem alterar pagamentos já liquidados/históricos.
   */
  static editEnrollmentTx(params: {
    tenantId: string;
    contractId: string;
    title?: string;
    dueDay?: number;
    endDate?: string | null;
    autoRenew?: boolean;
    notes?: string | null;
    accessMode?: 'unlimited' | 'limited';
    maxEntriesPerWeek?: number | null;
    maxEntriesPerMonth?: number | null;
    actorId: string;
  }): any {
    this.ensureStudioCompatible(params.tenantId);
    const plan = db.prepare(`SELECT * FROM recurring_billing_plans WHERE id = ? AND tenant_id = ?`).get(params.contractId, params.tenantId) as any;
    const pkgContract = !plan
      ? (db.prepare(`SELECT * FROM student_package_contracts WHERE id = ? AND tenant_id = ?`).get(params.contractId, params.tenantId) as any)
      : null;

    if (!plan && !pkgContract) {
      const err: any = new Error('Contrato ou matrícula não encontrada neste estabelecimento.');
      err.status = 404;
      throw err;
    }

    if (params.dueDay !== undefined) {
      const d = Number(params.dueDay);
      if (!Number.isInteger(d) || d < 1 || d > 31) {
        const err: any = new Error('Informe um dia de vencimento válido entre 1 e 31.');
        err.status = 400;
        throw err;
      }
    }

    if (plan) {
      const nextTitle = params.title !== undefined && String(params.title).trim() ? String(params.title).trim() : plan.title;
      const nextDueDay = params.dueDay !== undefined ? Number(params.dueDay) : Number(plan.due_day || 10);
      const nextEndDate = params.endDate !== undefined ? (params.endDate ? String(params.endDate).slice(0, 10) : null) : plan.end_date;
      if (nextEndDate && plan.start_date && nextEndDate < plan.start_date) {
        const err: any = new Error('A data final de vigência não pode ser anterior ao início do contrato.');
        err.status = 400;
        throw err;
      }
      const nextAutoRenew = params.autoRenew !== undefined ? (params.autoRenew ? 1 : 0) : Number(plan.auto_renew || 0);
      const nextNotes = params.notes !== undefined ? (params.notes ? String(params.notes).trim() : null) : plan.notes;

      const curCfg = normalizeStudioAccessConfig(plan.access_rules_snapshot_json);
      const nextAccessMode = params.accessMode === 'limited' || params.accessMode === 'unlimited'
        ? params.accessMode
        : (plan.access_mode_snapshot || curCfg.accessMode);
      const nextMaxWeek = params.maxEntriesPerWeek !== undefined
        ? (params.maxEntriesPerWeek && params.maxEntriesPerWeek > 0 ? Number(params.maxEntriesPerWeek) : null)
        : curCfg.maxEntriesPerWeek;
      const nextMaxMonth = params.maxEntriesPerMonth !== undefined
        ? (params.maxEntriesPerMonth && params.maxEntriesPerMonth > 0 ? Number(params.maxEntriesPerMonth) : null)
        : curCfg.maxEntriesPerMonth;
      const updatedCfg: StudioAccessConfig = {
        ...curCfg,
        accessMode: nextAccessMode === 'limited' ? 'limited' : 'unlimited',
        maxEntriesPerWeek: nextAccessMode === 'unlimited' ? null : nextMaxWeek,
        maxEntriesPerMonth: nextAccessMode === 'unlimited' ? null : nextMaxMonth
      };
      const nextWeeklyFreq = nextAccessMode === 'limited' ? (nextMaxWeek ?? plan.weekly_frequency) : null;

      db.prepare(`
        UPDATE recurring_billing_plans
        SET title = ?, due_day = ?, end_date = ?, auto_renew = ?, notes = ?,
            access_mode_snapshot = ?, access_rules_snapshot_json = ?, weekly_frequency = ?,
            updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(
        nextTitle,
        nextDueDay,
        nextEndDate,
        nextAutoRenew,
        nextNotes,
        nextAccessMode,
        JSON.stringify(updatedCfg),
        nextWeeklyFreq,
        plan.id,
        params.tenantId
      );

      const updated = db.prepare(`SELECT * FROM recurring_billing_plans WHERE id = ? AND tenant_id = ?`).get(plan.id, params.tenantId);
      this.recordContractHistoryTx({
        tenantId: params.tenantId,
        patientId: plan.patient_id,
        recurringPlanId: plan.id,
        action: 'UPDATE_CONTRACT',
        summary: `Dados do contrato "${nextTitle}" editados`,
        previousState: plan,
        newState: updated,
        createdBy: params.actorId
      });
      return updated;
    }

    const nextPkgTitle = params.title !== undefined && String(params.title).trim()
      ? String(params.title).trim()
      : pkgContract.package_name_snapshot;
    const nextPkgDue = params.dueDay !== undefined ? Number(params.dueDay) : Number(pkgContract.due_day_snapshot || 10);
    const nextPkgEnd = params.endDate !== undefined
      ? (params.endDate ? String(params.endDate).slice(0, 10) : null)
      : pkgContract.end_date;
    if (nextPkgEnd && pkgContract.start_date && nextPkgEnd < pkgContract.start_date) {
      const err: any = new Error('A data final de vigência não pode ser anterior ao início do contrato.');
      err.status = 400;
      throw err;
    }
    const nextPkgAutoRenew = params.autoRenew !== undefined
      ? (params.autoRenew ? 1 : 0)
      : Number(pkgContract.auto_renew_snapshot || 0);
    const nextPkgNotes = params.notes !== undefined
      ? (params.notes ? String(params.notes).trim() : null)
      : pkgContract.notes;

    db.prepare(`
      UPDATE student_package_contracts
      SET package_name_snapshot = ?, due_day_snapshot = ?, end_date = ?,
          auto_renew_snapshot = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(
      nextPkgTitle,
      nextPkgDue,
      nextPkgEnd,
      nextPkgAutoRenew,
      nextPkgNotes,
      pkgContract.id,
      params.tenantId
    );

    if (pkgContract.recurring_plan_id) {
      db.prepare(`
        UPDATE recurring_billing_plans
        SET due_day = ?, end_date = ?, auto_renew = ?, notes = ?, updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(nextPkgDue, nextPkgEnd, nextPkgAutoRenew, nextPkgNotes, pkgContract.recurring_plan_id, params.tenantId);
    }

    const updatedPkg = PackageService.getContractById(params.tenantId, pkgContract.id);
    this.recordContractHistoryTx({
      tenantId: params.tenantId,
      patientId: pkgContract.student_id,
      packageContractId: pkgContract.id,
      recurringPlanId: pkgContract.recurring_plan_id || null,
      action: 'UPDATE_CONTRACT',
      summary: `Dados do contrato de pacote "${nextPkgTitle}" editados`,
      previousState: pkgContract,
      newState: updatedPkg,
      createdBy: params.actorId
    });
    return updatedPkg;
  }

  /**
   * Remove campos financeiros restritos quando o usuário não possui permissão financeira.
   */
  static sanitizeEnrollmentForViewer(item: any, canViewFinancial: boolean): any {
    if (canViewFinancial || !item) return item;
    const redactedEntitlements = Array.isArray(item.entitlements)
      ? item.entitlements.map((ent: any) => {
          if (!ent || typeof ent !== 'object') return ent;
          const { addon_pricing_json, addon_pricing, ...safeEnt } = ent;
          return {
            ...safeEnt,
            addon_pricing: null
          };
        })
      : [];
    return {
      ...item,
      studentCpf: null,
      financialStatus: null,
      amount: null,
      totalContractAmount: null,
      commercialBreakdown: null,
      billingFrequency: null,
      paymentPeriodicity: null,
      installmentsCount: null,
      dueDay: null,
      nextDueDate: null,
      entitlements: redactedEntitlements,
      payments: []
    };
  }

  static sanitizeContractHistoryForViewer(items: any[], canViewFinancial: boolean): any[] {
    if (canViewFinancial) return items;
    const redactSnapshotJson = (raw: string | null) => {
      if (!raw) return null;
      try {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') {
          for (const key of [
            'amount', 'total_contract_amount', 'contracted_price', 'base_amount',
            'payment_method', 'due_day', 'due_day_snapshot', 'payment_status',
            'financialStatus', 'totalContractAmount', 'payments', 'student_cpf'
          ]) {
            if (key in obj) delete obj[key];
          }
          if (obj.commercial_snapshot_json) delete obj.commercial_snapshot_json;
        }
        return JSON.stringify(obj);
      } catch {
        return null;
      }
    };
    return (items || []).map(it => ({
      ...it,
      previous_state_json: redactSnapshotJson(it.previous_state_json),
      new_state_json: redactSnapshotJson(it.new_state_json)
    }));
  }

  static sanitizeEnrollmentDetailForViewer(detail: any, canViewFinancial: boolean): any {
    if (canViewFinancial || !detail) return detail;
    const sanitizedEnrollment = this.sanitizeEnrollmentForViewer(detail.enrollment, false);
    const sanitizedAvailableAddons = Array.isArray(detail.availableAddons)
      ? detail.availableAddons.map((a: any) => ({ ...a, additionalPriceCents: null, comboDiscountValue: null }))
      : [];
    return {
      ...detail,
      enrollment: sanitizedEnrollment,
      entitlements: sanitizedEnrollment?.entitlements || [],
      availableAddons: sanitizedAvailableAddons,
      student: detail.student ? { ...detail.student, cpf: null } : detail.student,
      payments: [],
      history: this.sanitizeContractHistoryForViewer(detail.history || [], false)
    };
  }
}
