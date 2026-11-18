import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';
import { BillingCycleService, normalizePeriodicFrequency } from './billing-cycle.service';
import { PackageService } from './package.service';
import {
  getTenantEstablishmentProfile,
  PeriodicBillingFrequency,
  PlanDurationCode,
  resolvePlanDurationEndDate,
  supportsStudioFeatures
} from '../utils/establishment-context';
import {
  calculateCommercialOptionBreakdown,
  DEFAULT_STUDIO_ACCESS_CONFIG,
  normalizeCommercialPriceOptions,
  normalizeStudioAccessConfig,
  normalizeStudioServiceType,
  PaymentPeriodicityCode,
  StudioAccessConfig
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

export interface CreateStudioEnrollmentInput {
  tenantId: string;
  studentId: string;
  serviceId?: string | null;
  packageId?: string | null;
  professionalId?: string | null;
  commercialOptionId?: string | null;
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

    const commercialOptions = normalizeCommercialPriceOptions(srv.commercial_price_options_json);
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
      (paymentPeriodicity === 'bimonthly' || paymentPeriodicity === 'quarterly' || paymentPeriodicity === 'semiannual' || paymentPeriodicity === 'annual'
        ? paymentPeriodicity
        : (srv.billing_mode && srv.billing_mode !== 'per_session' && srv.billing_mode !== 'package' ? srv.billing_mode : 'monthly'))
    );

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
      contractKind === 'access_plan'
        ? (mergedAccessCfg.accessMode === 'limited' ? (mergedAccessCfg.maxEntriesPerWeek || null) : null)
        : (matchedOption ? (matchedOption.frequencyType === 'weekly' ? matchedOption.frequencyCount : null) : srv.weekly_sessions_count || 1);

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
      autoRenew
    };

    db.prepare(`
      INSERT INTO recurring_billing_plans (
        id, tenant_id, patient_id, service_id, professional_id,
        title, amount, billing_cycle, billing_frequency, cycle_months, covers_sessions,
        due_day, start_date, end_date, payment_method, notes, status,
        plan_duration_code, weekly_frequency, weekly_sessions_snapshot, included_sessions,
        contract_kind, contract_status, payment_periodicity, total_contract_amount,
        installments_count, fidelity_months, grace_period_days, auto_renew,
        access_mode_snapshot, access_rules_snapshot_json, commercial_snapshot_json, origin,
        created_by, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
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
      input.professionalId || srv.professional_id || null,
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
      contractKind === 'scheduled_plan' && matchedOption?.frequencyType === 'fixed_count' ? matchedOption.frequencyCount : null,
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
            input.professionalId || srv.professional_id || null,
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

          const commOptions = normalizeCommercialPriceOptions(newSrv.commercial_price_options_json);
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
      if (params.markFirstPaymentPaid) {
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

      enrollments.push({
        id: c.id,
        contractSource: 'package_contract',
        contractKind: 'combined_package',
        studentId: c.student_id,
        studentName: c.student_name,
        studentPhone: c.student_phone,
        studentWhatsapp: c.student_whatsapp || null,
        studentEmail: c.student_email || null,
        studentCpf: null,
        serviceId: null,
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
        if (item.contractKind !== kindFilter && item.contractSource !== kindFilter) {
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
             competence_month, installment_number, total_installments, notes, created_at
      FROM payments
      WHERE tenant_id = ?
        AND (${enrollment.contractSource === 'package_contract' ? 'package_contract_id = ?' : 'recurring_plan_id = ?'})
      ORDER BY due_date ASC, created_at ASC
    `).all(tenantId, contractId) as any[];

    const appointments = db.prepare(`
      SELECT a.id, a.service_id, a.professional_id, a.start_time, a.end_time, a.status,
             a.attendance_status, a.modality, a.patient_notes as notes,
             s.name as service_name, prof.name as professional_name
      FROM appointments a
      LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
      LEFT JOIN professionals prof ON prof.id = a.professional_id AND prof.tenant_id = a.tenant_id
      WHERE a.tenant_id = ?
        AND (${enrollment.contractSource === 'package_contract' ? 'a.package_contract_id = ?' : 'a.recurring_plan_id = ?'})
      ORDER BY a.start_time DESC
      LIMIT 50
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

    return {
      enrollment,
      student: studentRow ? {
        id: studentRow.id,
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
      appointments,
      payments,
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
    return {
      ...item,
      studentCpf: null,
      financialStatus: null,
      amount: null,
      totalContractAmount: null,
      billingFrequency: null,
      paymentPeriodicity: null,
      installmentsCount: null,
      dueDay: null,
      nextDueDate: null,
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
    return {
      ...detail,
      enrollment: this.sanitizeEnrollmentForViewer(detail.enrollment, false),
      student: detail.student ? { ...detail.student, cpf: null } : detail.student,
      payments: [],
      history: this.sanitizeContractHistoryForViewer(detail.history || [], false)
    };
  }
}
