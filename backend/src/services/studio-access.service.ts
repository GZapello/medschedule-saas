import crypto from 'crypto';
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

const QR_SECRET = () => process.env.JWT_SECRET || 'zemda-studio-access-qr-secret-2026';

// Janela máxima de ocupação ativa quando não há check-out explícito (3 horas):
// Garante que esquecimento de registro de saída jamais seja interpretado como presença eterna.
export const MAX_ACTIVE_OCCUPANCY_MINUTES = 180;

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

export interface StudioCheckInInput {
  tenantId: string;
  studentId: string;
  serviceId?: string | null;
  recurringPlanId?: string | null;
  packageContractId?: string | null;
  entitlementId?: string | null;
  identificationMethod?: 'manual' | 'qr_code' | 'cpf' | 'code';
  authorizeException?: boolean;
  exceptionReason?: string | null;
  canAuthorizeException?: boolean;
  operatorUserId?: string | null;
  operatorName?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  mockNow?: Date;
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
   * Gera token verificável de curta duração para identificação por QR Code sem expor dados sensíveis.
   */
  static generateStudentQrToken(tenantId: string, studentId: string, ttlSeconds = 600): {
    token: string;
    expiresAt: string;
    ttlSeconds: number;
  } {
    this.ensureStudioCompatible(tenantId);
    const student = db.prepare(`SELECT id FROM patients WHERE id = ? AND tenant_id = ?`).get(studentId, tenantId);
    if (!student) {
      const err: any = new Error('Aluno não encontrado neste estabelecimento.');
      err.status = 404;
      throw err;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = nowSec + Math.max(60, Math.min(3600, ttlSeconds));
    const payloadObj = {
      typ: 'studio_qr',
      tid: tenantId,
      sid: studentId,
      iat: nowSec,
      exp: expSec,
      n: uuidv4().slice(0, 8)
    };
    const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
    const sig = crypto
      .createHmac('sha256', QR_SECRET())
      .update(payloadB64)
      .digest('base64url');

    return {
      token: `zqr.${payloadB64}.${sig}`,
      expiresAt: new Date(expSec * 1000).toISOString(),
      ttlSeconds: expSec - nowSec
    };
  }

  static verifyStudentQrToken(tenantId: string, token: string): {
    valid: true;
    studentId: string;
  } | {
    valid: false;
    code: string;
    error: string;
  } {
    const clean = String(token || '').trim();
    const parts = clean.split('.');
    if (parts.length !== 3 || parts[0] !== 'zqr') {
      return { valid: false, code: 'INVALID_QR_TOKEN', error: 'QR Code de acesso inválido.' };
    }
    const [, payloadB64, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', QR_SECRET())
      .update(payloadB64)
      .digest('base64url');

    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, code: 'INVALID_QR_SIGNATURE', error: 'Assinatura do QR Code inválida.' };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      return { valid: false, code: 'INVALID_QR_PAYLOAD', error: ' Conteúdo do QR Code inválido.' };
    }

    if (!parsed || parsed.typ !== 'studio_qr' || !parsed.tid || !parsed.sid) {
      return { valid: false, code: 'INVALID_QR_PAYLOAD', error: 'QR Code incompatível com o Controle de Acesso.' };
    }

    if (parsed.tid !== tenantId) {
      return { valid: false, code: 'CROSS_TENANT_QR', error: 'Este QR Code pertence a outro estabelecimento.' };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (!parsed.exp || nowSec > Number(parsed.exp)) {
      return { valid: false, code: 'EXPIRED_QR_TOKEN', error: 'Este QR Code expirou. Gere um novo código.' };
    }

    return { valid: true, studentId: String(parsed.sid) };
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
    paymentMethod?: string;
    newServiceId?: string;
    newAmount?: number;
    newEndDate?: string | null;
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
        const baseForRenew = nextEndDate && nextEndDate >= todayIso ? addDaysIso(nextEndDate, 1) : todayIso;
        nextEndDate = params.newEndDate
          ? String(params.newEndDate).slice(0, 10)
          : (resolvePlanDurationEndDate(baseForRenew, plan.plan_duration_code || '1_month') || addDaysIso(baseForRenew, 30));
      } else if (params.action === 'change_plan') {
        let nextTitle = plan.title;
        let nextServiceId = plan.service_id;
        let nextAmount = params.newAmount !== undefined ? Math.max(0, Number(params.newAmount)) : Number(plan.amount);
        if (params.newServiceId) {
          const newSrv = db.prepare(`SELECT * FROM services WHERE id = ? AND tenant_id = ? AND active = 1`).get(params.newServiceId, params.tenantId) as any;
          if (!newSrv) {
            const err: any = new Error('Novo serviço selecionado para troca de plano não encontrado.');
            err.status = 404;
            throw err;
          }
          nextServiceId = newSrv.id;
          nextTitle = `Plano: ${newSrv.name}`;
          if (params.newAmount === undefined) {
            nextAmount = Number(newSrv.periodic_price) > 0 ? Number(newSrv.periodic_price) : Number(newSrv.price || plan.amount);
          }
        }
        if (params.newEndDate !== undefined) {
          nextEndDate = params.newEndDate ? String(params.newEndDate).slice(0, 10) : null;
        }
        db.prepare(`
          UPDATE recurring_billing_plans
          SET service_id = ?, title = ?, amount = ?, end_date = ?, updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(nextServiceId, nextTitle, nextAmount, nextEndDate, plan.id, params.tenantId);
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
      const valDays = Number(pkgContract.validity_days_snapshot || 30);
      const baseRenew = nextEndDate && nextEndDate >= todayIso ? addDaysIso(nextEndDate, 1) : todayIso;
      nextEndDate = params.newEndDate ? String(params.newEndDate).slice(0, 10) : addDaysIso(baseRenew, Math.max(1, valDays) - 1);
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
   * Valida e registra entrada do aluno na academia / estabelecimento sem criar agendamento e sem consumir créditos de aulas.
   */
  static checkInStudentTx(input: StudioCheckInInput): any {
    this.ensureStudioCompatible(input.tenantId);

    if (input.idempotencyKey) {
      const existingIdemp = db.prepare(`
        SELECT * FROM studio_access_logs WHERE tenant_id = ? AND idempotency_key = ?
      `).get(input.tenantId, input.idempotencyKey) as any;
      if (existingIdemp) {
        return {
          idempotentReplay: true,
          allowed: existingIdemp.access_status === 'allowed',
          accessLog: existingIdemp,
          denialReasonCode: existingIdemp.denial_reason_code || null,
          denialReasonMessage: existingIdemp.denial_reason_message || null
        };
      }
    }

    const student = db.prepare(`
      SELECT id, full_name, phone, cpf, active FROM patients WHERE id = ? AND tenant_id = ?
    `).get(input.studentId, input.tenantId) as any;

    if (!student) {
      const err: any = new Error('Aluno não encontrado neste estabelecimento.');
      err.status = 404;
      err.code = 'STUDENT_NOT_FOUND';
      throw err;
    }

    const nowParts = getBrazilNowParts(input.mockNow);
    const { dateIso, timeHhmm, dateTimeIso, weekday } = nowParts;

    // 1. Coleta todos os planos de acesso / contratos do aluno neste estabelecimento
    const planCandidates = db.prepare(`
      SELECT
        rbp.*,
        s.name as service_name,
        COALESCE(s.studio_service_type, CASE WHEN COALESCE(s.service_kind, 'individual') = 'group' THEN 'group' ELSE 'individual' END) as studio_service_type,
        s.access_config_json as service_access_config_json,
        s.default_capacity as service_default_capacity
      FROM recurring_billing_plans rbp
      LEFT JOIN services s ON s.id = rbp.service_id AND s.tenant_id = rbp.tenant_id
      WHERE rbp.tenant_id = ? AND rbp.patient_id = ?
        AND rbp.package_contract_id IS NULL
        AND (? IS NULL OR rbp.id = ?)
        AND (? IS NULL OR rbp.service_id = ?)
      ORDER BY CASE WHEN rbp.status = 'active' THEN 0 ELSE 1 END, rbp.created_at DESC
    `).all(
      input.tenantId,
      input.studentId,
      input.recurringPlanId || null,
      input.recurringPlanId || null,
      input.serviceId || null,
      input.serviceId || null
    ) as any[];

    const pkgEntitlementCandidates = db.prepare(`
      SELECT
        spe.*,
        spc.package_name_snapshot,
        spc.contract_status,
        spc.payment_status,
        spc.start_date,
        spc.end_date,
        spc.frozen_from_date,
        spc.frozen_until_date,
        spc.grace_period_days_snapshot,
        s.access_config_json as service_access_config_json,
        s.default_capacity as service_default_capacity
      FROM student_package_entitlements spe
      JOIN student_package_contracts spc ON spc.id = spe.contract_id AND spc.tenant_id = spe.tenant_id
      LEFT JOIN services s ON s.id = spe.service_id AND s.tenant_id = spe.tenant_id
      WHERE spe.tenant_id = ? AND spc.student_id = ?
        AND spe.entitlement_type = 'facility_access'
        AND (? IS NULL OR spc.id = ?)
        AND (? IS NULL OR spe.id = ?)
        AND (? IS NULL OR spe.service_id = ?)
      ORDER BY CASE WHEN spc.contract_status = 'active' THEN 0 ELSE 1 END, spc.created_at DESC
    `).all(
      input.tenantId,
      input.studentId,
      input.packageContractId || null,
      input.packageContractId || null,
      input.entitlementId || null,
      input.entitlementId || null,
      input.serviceId || null,
      input.serviceId || null
    ) as any[];

    // Unifica candidatos de direito de acesso em ordem de prioridade (ativos primeiro)
    interface AccessCandidate {
      contractType: 'recurring_plan' | 'package_contract';
      recurringPlanId: string | null;
      packageContractId: string | null;
      entitlementId: string | null;
      serviceId: string | null;
      planName: string;
      status: string;
      startDate: string | null;
      endDate: string | null;
      frozenFrom: string | null;
      frozenUntil: string | null;
      accessConfig: StudioAccessConfig;
      creditsTotal: number | null;
      entriesUsed: number;
    }

    const candidates: AccessCandidate[] = [];

    for (const rbp of planCandidates) {
      // Planos de aulas puramente agendáveis (sem ser access_plan nem facility_access) não são planos de portaria livre,
      // exceto se selecionados explicitamente ou se o serviço for facility_access.
      const isAccess =
        rbp.contract_kind === 'access_plan' ||
        rbp.studio_service_type === 'facility_access' ||
        Boolean(rbp.access_rules_snapshot_json) ||
        Boolean(input.recurringPlanId && rbp.id === input.recurringPlanId);
      if (!isAccess) continue;

      const cfg = normalizeStudioAccessConfig(rbp.access_rules_snapshot_json || rbp.service_access_config_json);
      if (rbp.access_mode_snapshot === 'limited' || rbp.access_mode_snapshot === 'unlimited') {
        cfg.accessMode = rbp.access_mode_snapshot;
      }
      if (cfg.accessMode === 'limited' && !cfg.maxEntriesPerWeek && !cfg.maxEntriesPerMonth && Number(rbp.weekly_frequency) > 0) {
        cfg.maxEntriesPerWeek = Number(rbp.weekly_frequency);
      }
      if (!cfg.maxSimultaneousCapacity && Number(rbp.service_default_capacity) > 0) {
        cfg.maxSimultaneousCapacity = Number(rbp.service_default_capacity);
      }

      const effStatus =
        rbp.contract_status === 'frozen' || rbp.contract_status === 'suspended' || rbp.status === 'paused'
          ? 'suspended'
          : (rbp.contract_status === 'requested' ? 'requested' : (rbp.status === 'cancelled' || rbp.contract_status === 'cancelled' ? 'cancelled' : 'active'));

      candidates.push({
        contractType: 'recurring_plan',
        recurringPlanId: rbp.id,
        packageContractId: null,
        entitlementId: null,
        serviceId: rbp.service_id || null,
        planName: rbp.title || rbp.service_name || 'Plano de Acesso',
        status: effStatus,
        startDate: rbp.start_date || null,
        endDate: rbp.end_date || null,
        frozenFrom: rbp.frozen_from_date || null,
        frozenUntil: rbp.frozen_until_date || null,
        accessConfig: cfg,
        creditsTotal: null,
        entriesUsed: 0
      });
    }

    for (const spe of pkgEntitlementCandidates) {
      const cfg = normalizeStudioAccessConfig(spe.access_rules_snapshot_json || spe.service_access_config_json);
      if (spe.access_mode_snapshot === 'limited' || spe.access_mode_snapshot === 'unlimited') {
        cfg.accessMode = spe.access_mode_snapshot;
      }
      if (cfg.accessMode === 'limited' && !cfg.maxEntriesPerWeek && Number(spe.weekly_frequency_snapshot) > 0) {
        cfg.maxEntriesPerWeek = Number(spe.weekly_frequency_snapshot);
      }
      if (cfg.accessMode === 'limited' && !cfg.maxEntriesPerMonth && Number(spe.monthly_limit_snapshot) > 0) {
        cfg.maxEntriesPerMonth = Number(spe.monthly_limit_snapshot);
      }
      if (!cfg.maxSimultaneousCapacity && Number(spe.service_default_capacity) > 0) {
        cfg.maxSimultaneousCapacity = Number(spe.service_default_capacity);
      }

      candidates.push({
        contractType: 'package_contract',
        recurringPlanId: null,
        packageContractId: spe.contract_id,
        entitlementId: spe.id,
        serviceId: spe.service_id || null,
        planName: `${spe.package_name_snapshot} • ${spe.service_name_snapshot}`,
        status: spe.contract_status,
        startDate: spe.start_date || null,
        endDate: spe.end_date || null,
        frozenFrom: spe.frozen_from_date || null,
        frozenUntil: spe.frozen_until_date || null,
        accessConfig: cfg,
        creditsTotal: spe.access_mode_snapshot === 'limited' && Number(spe.credits_total) > 0 ? Number(spe.credits_total) : null,
        entriesUsed: Number(spe.entries_used || 0)
      });
    }

    const holidayRow = db.prepare(`
      SELECT id, name FROM holidays WHERE date = ? AND (tenant_id = ? OR is_national = 1) AND active = 1 LIMIT 1
    `).get(dateIso, input.tenantId) as { id: string; name: string } | undefined;

    const evaluateCandidate = (cand: AccessCandidate): {
      ok: boolean;
      code?: string;
      message?: string;
      usageStats?: {
        todayEntries: number;
        weekEntries: number;
        monthEntries: number;
        maxEntriesPerWeek: number | null;
        maxEntriesPerMonth: number | null;
        remainingWeekEntries: number | null;
        remainingMonthEntries: number | null;
        currentOccupancy: number;
      };
    } => {
      // 1. Situação do contrato (suspenso / congelado / pendente / cancelado)
      if (cand.status === 'suspended' || cand.status === 'paused' || cand.status === 'frozen') {
        return { ok: false, code: 'CONTRACT_SUSPENDED', message: `Contrato suspenso ou congelado (${cand.planName}).` };
      }
      if (cand.status === 'requested') {
        return { ok: false, code: 'CONTRACT_AWAITING_APPROVAL', message: `Solicitação de contrato pendente de aprovação administrativa (${cand.planName}).` };
      }
      if (cand.status === 'cancelled') {
        return { ok: false, code: 'CONTRACT_CANCELLED', message: `Contrato cancelado (${cand.planName}).` };
      }
      if (cand.frozenFrom && cand.frozenUntil && dateIso >= cand.frozenFrom && dateIso <= cand.frozenUntil) {
        return { ok: false, code: 'CONTRACT_SUSPENDED', message: `Contrato congelado no período de ${cand.frozenFrom} a ${cand.frozenUntil}.` };
      }

      // 2. Vigência (Plano vencido ou futuro)
      if (cand.startDate && dateIso < cand.startDate) {
        return { ok: false, code: 'CONTRACT_NOT_STARTED', message: `A vigência do plano inicia em ${cand.startDate}.` };
      }
      if (cand.endDate && dateIso > cand.endDate) {
        return { ok: false, code: 'EXPIRED_PLAN', message: `Plano vencido em ${cand.endDate} (${cand.planName}).` };
      }

      const cfg = cand.accessConfig;

      // 3. Bloqueio financeiro por inadimplência quando habilitado
      if (cfg.blockOnOverdue) {
        const cutoffDueIso = addDaysIso(dateIso, -Math.max(0, cfg.overdueGraceDays || 0));
        const overduePay = cand.contractType === 'recurring_plan'
          ? db.prepare(`
              SELECT id FROM payments
              WHERE tenant_id = ? AND recurring_plan_id = ? AND status = 'pending'
                AND due_date IS NOT NULL AND due_date < ?
              LIMIT 1
            `).get(input.tenantId, cand.recurringPlanId, cutoffDueIso)
          : db.prepare(`
              SELECT id FROM payments
              WHERE tenant_id = ? AND package_contract_id = ? AND status = 'pending'
                AND due_date IS NOT NULL AND due_date < ?
              LIMIT 1
            `).get(input.tenantId, cand.packageContractId, cutoffDueIso);
        if (overduePay) {
          return {
            ok: false,
            code: 'FINANCIAL_BLOCK',
            message: 'Acesso bloqueado por pendência financeira conforme regra configurada no plano.'
          };
        }
      }

      // 4. Feriados
      if (holidayRow && cfg.holidayPolicy === 'block') {
        return {
          ok: false,
          code: 'HOLIDAY_BLOCKED',
          message: `O plano não permite acesso em feriados (${holidayRow.name}).`
        };
      }

      // 5. Dias da semana permitidos
      if (Array.isArray(cfg.allowedWeekdays) && cfg.allowedWeekdays.length > 0 && !cfg.allowedWeekdays.includes(weekday)) {
        const dayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        return {
          ok: false,
          code: 'DAY_NOT_ALLOWED',
          message: `Dia não permitido neste plano (${dayNames[weekday]}).`
        };
      }

      // 6. Faixa horária permitida
      if (Array.isArray(cfg.allowedTimeWindows) && cfg.allowedTimeWindows.length > 0) {
        const applicableWindows = cfg.allowedTimeWindows.filter(w =>
          !Array.isArray(w.weekdays) || w.weekdays.length === 0 || w.weekdays.includes(weekday)
        );
        if (applicableWindows.length > 0) {
          const matchesWindow = applicableWindows.some(w => timeHhmm >= w.startTime && timeHhmm <= w.endTime);
          if (!matchesWindow) {
            const windowsLabel = applicableWindows.map(w => `${w.startTime} às ${w.endTime}`).join(', ');
            return {
              ok: false,
              code: 'TIME_NOT_ALLOWED',
              message: `Horário não permitido (${timeHhmm}). Faixas autorizadas: ${windowsLabel}.`
            };
          }
        }
      }

      // 7. Capacidade simultânea (quando configurada, respeitando janela máxima para não tratar saída esquecida como presença eterna)
      const occupancyCutoffMs = (input.mockNow ? input.mockNow.getTime() : Date.now()) - MAX_ACTIVE_OCCUPANCY_MINUTES * 60000;
      const occupancyCutoffParts = getBrazilNowParts(new Date(occupancyCutoffMs));
      const activeOccupancyCount = Number(
        (
          db.prepare(`
            SELECT COUNT(*) as c
            FROM studio_access_logs
            WHERE tenant_id = ?
              AND access_status = 'allowed'
              AND check_out_at IS NULL
              AND REPLACE(check_in_at, ' ', 'T') >= ?
              AND (? IS NULL OR service_id = ?)
          `).get(
            input.tenantId,
            occupancyCutoffParts.dateTimeIso,
            cand.serviceId || null,
            cand.serviceId || null
          ) as any
        )?.c || 0
      );

      if (cfg.maxSimultaneousCapacity && cfg.maxSimultaneousCapacity > 0 && activeOccupancyCount >= cfg.maxSimultaneousCapacity) {
        return {
          ok: false,
          code: 'CAPACITY_REACHED',
          message: `Capacidade simultânea máxima atingida (${activeOccupancyCount}/${cfg.maxSimultaneousCapacity}).`
        };
      }

      // 8. Entradas do dia / Reentrada no mesmo dia
      const todayEntriesCount = Number(
        (
          db.prepare(`
            SELECT COUNT(*) as c
            FROM studio_access_logs
            WHERE tenant_id = ? AND student_id = ? AND access_status = 'allowed'
              AND substr(REPLACE(check_in_at, ' ', 'T'), 1, 10) = ?
          `).get(input.tenantId, input.studentId, dateIso) as any
        )?.c || 0
      );

      if (!cfg.allowSameDayReentry && todayEntriesCount >= 1) {
        return {
          ok: false,
          code: 'DAILY_LIMIT_REACHED',
          message: 'Este plano não permite reentrada no mesmo dia.'
        };
      }
      if (cfg.maxEntriesPerDay && cfg.maxEntriesPerDay > 0 && todayEntriesCount >= cfg.maxEntriesPerDay) {
        return {
          ok: false,
          code: 'DAILY_LIMIT_REACHED',
          message: `Limite diário de ${cfg.maxEntriesPerDay} entrada(s) atingido hoje.`
        };
      }

      // 9. Frequência semanal / mensal / créditos de acesso (Acesso Limitado)
      const weekBounds = getWeekBoundsForDate(dateIso, cfg.weekStartDay || 1);
      const monthBounds = getMonthBoundsForDate(dateIso);

      const contractFilterSql = cand.contractType === 'recurring_plan'
        ? `AND recurring_plan_id = ?`
        : `AND package_contract_id = ?`;
      const contractFilterParam = cand.contractType === 'recurring_plan' ? cand.recurringPlanId : cand.packageContractId;

      const weekEntriesCount = Number(
        (
          db.prepare(`
            SELECT COUNT(*) as c
            FROM studio_access_logs
            WHERE tenant_id = ? AND student_id = ? AND access_status = 'allowed'
              ${contractFilterSql}
              AND REPLACE(check_in_at, ' ', 'T') BETWEEN ? AND ?
          `).get(input.tenantId, input.studentId, contractFilterParam, weekBounds.startDateTime, weekBounds.endDateTime) as any
        )?.c || 0
      );

      const monthEntriesCount = Number(
        (
          db.prepare(`
            SELECT COUNT(*) as c
            FROM studio_access_logs
            WHERE tenant_id = ? AND student_id = ? AND access_status = 'allowed'
              ${contractFilterSql}
              AND REPLACE(check_in_at, ' ', 'T') BETWEEN ? AND ?
          `).get(input.tenantId, input.studentId, contractFilterParam, monthBounds.startDateTime, monthBounds.endDateTime) as any
        )?.c || 0
      );

      const skipLimitOnHoliday = Boolean(holidayRow && cfg.holidayPolicy === 'ignore_limit');

      if (cfg.accessMode === 'limited' && !skipLimitOnHoliday) {
        if (cfg.maxEntriesPerWeek && cfg.maxEntriesPerWeek > 0 && weekEntriesCount >= cfg.maxEntriesPerWeek) {
          return {
            ok: false,
            code: 'FREQUENCY_EXCEEDED',
            message: `Limite semanal de ${cfg.maxEntriesPerWeek} acesso(s) atingido nesta semana (${weekBounds.startIso} a ${weekBounds.endIso}).`
          };
        }
        if (cfg.maxEntriesPerMonth && cfg.maxEntriesPerMonth > 0 && monthEntriesCount >= cfg.maxEntriesPerMonth) {
          return {
            ok: false,
            code: 'FREQUENCY_EXCEEDED',
            message: `Limite mensal de ${cfg.maxEntriesPerMonth} acesso(s) atingido neste mês.`
          };
        }
        if (cand.creditsTotal && cand.creditsTotal > 0 && cand.entriesUsed >= cand.creditsTotal) {
          return {
            ok: false,
            code: 'FREQUENCY_EXCEEDED',
            message: `Limite total de ${cand.creditsTotal} acesso(s) do contrato esgotado.`
          };
        }
      }

      return {
        ok: true,
        usageStats: {
          todayEntries: todayEntriesCount + 1,
          weekEntries: weekEntriesCount + 1,
          monthEntries: monthEntriesCount + 1,
          maxEntriesPerWeek: cfg.maxEntriesPerWeek,
          maxEntriesPerMonth: cfg.maxEntriesPerMonth,
          remainingWeekEntries: cfg.maxEntriesPerWeek ? Math.max(0, cfg.maxEntriesPerWeek - (weekEntriesCount + 1)) : null,
          remainingMonthEntries: cfg.maxEntriesPerMonth ? Math.max(0, cfg.maxEntriesPerMonth - (monthEntriesCount + 1)) : null,
          currentOccupancy: activeOccupancyCount + 1
        }
      };
    };

    let chosenCandidate: AccessCandidate | null = null;
    let chosenEval: ReturnType<typeof evaluateCandidate> | null = null;
    let firstFailure: { cand?: AccessCandidate; code: string; message: string } | null = null;

    if (candidates.length === 0) {
      firstFailure = {
        code: 'NO_ACTIVE_CONTRACT',
        message: 'Aluno não possui plano de acesso ou matrícula ativa para entrada livre/limitada.'
      };
    } else {
      for (const cand of candidates) {
        const res = evaluateCandidate(cand);
        if (res.ok) {
          chosenCandidate = cand;
          chosenEval = res;
          break;
        } else if (!firstFailure) {
          firstFailure = { cand, code: res.code || 'ACCESS_DENIED', message: res.message || 'Acesso negado.' };
        }
      }
    }

    const canOverrideWithException = Boolean(
      !chosenCandidate &&
      input.authorizeException &&
      input.canAuthorizeException &&
      input.exceptionReason &&
      String(input.exceptionReason).trim().length >= 3
    );

    const logId = 'sal-' + uuidv4().slice(0, 8);
    const identMethod = input.identificationMethod && ['manual', 'qr_code', 'cpf', 'code'].includes(input.identificationMethod)
      ? input.identificationMethod
      : 'manual';

    if (chosenCandidate && chosenEval?.ok) {
      db.prepare(`
        INSERT INTO studio_access_logs (
          id, tenant_id, student_id, service_id, contract_type,
          recurring_plan_id, package_contract_id, entitlement_id, plan_name_snapshot,
          access_status, denial_reason_code, denial_reason_message,
          is_exception, exception_reason, authorized_by_user_id,
          identification_method, check_in_at, operator_user_id, operator_name, notes, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'allowed', NULL, NULL, 0, NULL, NULL, ?, ?, ?, ?, ?, ?)
      `).run(
        logId,
        input.tenantId,
        input.studentId,
        chosenCandidate.serviceId,
        chosenCandidate.contractType,
        chosenCandidate.recurringPlanId,
        chosenCandidate.packageContractId,
        chosenCandidate.entitlementId,
        chosenCandidate.planName,
        identMethod,
        dateTimeIso,
        input.operatorUserId || null,
        input.operatorName || null,
        input.notes || null,
        input.idempotencyKey || null
      );

      // Se for pacote com benefício de acesso, incrementa entries_used sem tocar nos créditos de aulas agendáveis!
      if (chosenCandidate.entitlementId) {
        db.prepare(`
          UPDATE student_package_entitlements
          SET entries_used = COALESCE(entries_used, 0) + 1, updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(chosenCandidate.entitlementId, input.tenantId);
      }

      const logRow = db.prepare(`SELECT * FROM studio_access_logs WHERE id = ?`).get(logId);
      return {
        allowed: true,
        isException: false,
        student: { id: student.id, fullName: student.full_name },
        planName: chosenCandidate.planName,
        accessMode: chosenCandidate.accessConfig.accessMode,
        usageStats: chosenEval.usageStats,
        accessLog: logRow
      };
    }

    if (canOverrideWithException) {
      const refCand = firstFailure?.cand || null;
      db.prepare(`
        INSERT INTO studio_access_logs (
          id, tenant_id, student_id, service_id, contract_type,
          recurring_plan_id, package_contract_id, entitlement_id, plan_name_snapshot,
          access_status, denial_reason_code, denial_reason_message,
          is_exception, exception_reason, authorized_by_user_id,
          identification_method, check_in_at, operator_user_id, operator_name, notes, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'allowed', ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        logId,
        input.tenantId,
        input.studentId,
        refCand?.serviceId || input.serviceId || null,
        refCand?.contractType || 'manual_exception',
        refCand?.recurringPlanId || null,
        refCand?.packageContractId || null,
        refCand?.entitlementId || null,
        refCand?.planName || 'Exceção Autorizada',
        firstFailure?.code || null,
        firstFailure?.message || null,
        String(input.exceptionReason).trim(),
        input.operatorUserId || null,
        identMethod,
        dateTimeIso,
        input.operatorUserId || null,
        input.operatorName || null,
        input.notes || null,
        input.idempotencyKey || null
      );

      if (refCand?.entitlementId) {
        db.prepare(`
          UPDATE student_package_entitlements
          SET entries_used = COALESCE(entries_used, 0) + 1, updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(refCand.entitlementId, input.tenantId);
      }

      const logRow = db.prepare(`SELECT * FROM studio_access_logs WHERE id = ?`).get(logId);
      return {
        allowed: true,
        isException: true,
        student: { id: student.id, fullName: student.full_name },
        planName: refCand?.planName || 'Exceção Autorizada',
        overriddenDenialCode: firstFailure?.code || null,
        accessLog: logRow
      };
    }

    // Caso negado: registra tentativa negada para auditoria e retorna motivo claro
    const refCand = firstFailure?.cand || null;
    const denialCode = firstFailure?.code || 'NO_ACTIVE_CONTRACT';
    const denialMsg = firstFailure?.message || 'Acesso não autorizado.';

    db.prepare(`
      INSERT INTO studio_access_logs (
        id, tenant_id, student_id, service_id, contract_type,
        recurring_plan_id, package_contract_id, entitlement_id, plan_name_snapshot,
        access_status, denial_reason_code, denial_reason_message,
        is_exception, exception_reason, authorized_by_user_id,
        identification_method, check_in_at, operator_user_id, operator_name, notes, idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'denied', ?, ?, 0, NULL, NULL, ?, ?, ?, ?, ?, ?)
    `).run(
      logId,
      input.tenantId,
      input.studentId,
      refCand?.serviceId || input.serviceId || null,
      refCand?.contractType || 'recurring_plan',
      refCand?.recurringPlanId || null,
      refCand?.packageContractId || null,
      refCand?.entitlementId || null,
      refCand?.planName || null,
      denialCode,
      denialMsg,
      identMethod,
      dateTimeIso,
      input.operatorUserId || null,
      input.operatorName || null,
      input.notes || null,
      input.idempotencyKey || null
    );

    const logRow = db.prepare(`SELECT * FROM studio_access_logs WHERE id = ?`).get(logId);
    return {
      allowed: false,
      isException: false,
      student: { id: student.id, fullName: student.full_name },
      denialReasonCode: denialCode,
      denialReasonMessage: denialMsg,
      accessLog: logRow
    };
  }

  /**
   * Registra saída do aluno na academia para controle de ocupação.
   */
  static checkOutStudentTx(params: {
    tenantId: string;
    logId: string;
    operatorUserId?: string | null;
    notes?: string | null;
    mockNow?: Date;
  }): any {
    this.ensureStudioCompatible(params.tenantId);
    const existing = db.prepare(`SELECT * FROM studio_access_logs WHERE id = ? AND tenant_id = ?`).get(params.logId, params.tenantId) as any;
    if (!existing) {
      const err: any = new Error('Registro de acesso não encontrado.');
      err.status = 404;
      throw err;
    }
    const { dateTimeIso } = getBrazilNowParts(params.mockNow);
    db.prepare(`
      UPDATE studio_access_logs
      SET check_out_at = COALESCE(check_out_at, ?),
          notes = CASE WHEN ? IS NOT NULL THEN ? ELSE notes END,
          updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(dateTimeIso, params.notes || null, params.notes || null, params.logId, params.tenantId);

    return db.prepare(`SELECT * FROM studio_access_logs WHERE id = ? AND tenant_id = ?`).get(params.logId, params.tenantId);
  }

  /**
   * Correção manual auditável de registro de acesso (ex.: esquecimento de saída ou correção de horário).
   */
  static correctAccessLogTx(params: {
    tenantId: string;
    logId: string;
    checkInAt?: string;
    checkOutAt?: string | null;
    accessStatus?: 'allowed' | 'denied';
    correctionReason: string;
    correctedByUserId: string;
  }): any {
    this.ensureStudioCompatible(params.tenantId);
    const existing = db.prepare(`SELECT * FROM studio_access_logs WHERE id = ? AND tenant_id = ?`).get(params.logId, params.tenantId) as any;
    if (!existing) {
      const err: any = new Error('Registro de acesso não encontrado.');
      err.status = 404;
      throw err;
    }
    if (!params.correctionReason || String(params.correctionReason).trim().length < 3) {
      const err: any = new Error('Informe o motivo da correção manual para auditoria.');
      err.status = 400;
      throw err;
    }

    db.prepare(`
      UPDATE studio_access_logs
      SET check_in_at = COALESCE(?, check_in_at),
          check_out_at = CASE WHEN ? = 1 THEN ? ELSE check_out_at END,
          access_status = COALESCE(?, access_status),
          corrected_by_user_id = ?,
          corrected_at = datetime('now'),
          correction_reason = ?,
          updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(
      params.checkInAt || null,
      params.checkOutAt !== undefined ? 1 : 0,
      params.checkOutAt || null,
      params.accessStatus || null,
      params.correctedByUserId,
      String(params.correctionReason).trim(),
      params.logId,
      params.tenantId
    );

    return db.prepare(`SELECT * FROM studio_access_logs WHERE id = ? AND tenant_id = ?`).get(params.logId, params.tenantId);
  }

  /**
   * Lista consolidada de matrículas, contratos e acessos (por estabelecimento ou por aluno).
   */
  static listEnrollments(tenantId: string, filters?: {
    studentId?: string;
    status?: string;
    search?: string;
  }): {
    enrollments: any[];
    summary: {
      activeCount: number;
      futureCount: number;
      expiredCount: number;
      suspendedCount: number;
      requestedCount: number;
      expiringSoonCount: number;
    };
  } {
    this.ensureStudioCompatible(tenantId);
    const { dateIso: todayIso } = getBrazilNowParts();
    const soonIso = addDaysIso(todayIso, 7);
    const weekBounds = getWeekBoundsForDate(todayIso, 1);
    const monthBounds = getMonthBoundsForDate(todayIso);

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
        pat.cpf as student_cpf,
        s.name as service_name,
        COALESCE(s.studio_service_type, CASE WHEN COALESCE(s.service_kind, 'individual') = 'group' THEN 'group' ELSE 'individual' END) as studio_service_type,
        s.access_config_json as service_access_config_json,
        (SELECT COUNT(*) FROM appointments a WHERE a.tenant_id = rbp.tenant_id AND a.recurring_plan_id = rbp.id AND a.status != 'cancelled') as scheduled_sessions_count,
        (SELECT COUNT(*) FROM appointments a WHERE a.tenant_id = rbp.tenant_id AND a.recurring_plan_id = rbp.id AND a.status != 'cancelled' AND a.attendance_status = 'present') as used_sessions_count,
        (SELECT COUNT(*) FROM appointments a WHERE a.tenant_id = rbp.tenant_id AND a.recurring_plan_id = rbp.id AND a.status IN ('scheduled', 'confirmed') AND COALESCE(a.attendance_status, 'pending') = 'pending') as reserved_sessions_count,
        (SELECT COUNT(*) FROM studio_access_logs sal WHERE sal.tenant_id = rbp.tenant_id AND sal.recurring_plan_id = rbp.id AND sal.access_status = 'allowed') as total_access_entries,
        (SELECT COUNT(*) FROM studio_access_logs sal WHERE sal.tenant_id = rbp.tenant_id AND sal.recurring_plan_id = rbp.id AND sal.access_status = 'allowed' AND REPLACE(sal.check_in_at, ' ', 'T') BETWEEN ? AND ?) as week_access_entries,
        (SELECT COUNT(*) FROM studio_access_logs sal WHERE sal.tenant_id = rbp.tenant_id AND sal.recurring_plan_id = rbp.id AND sal.access_status = 'allowed' AND REPLACE(sal.check_in_at, ' ', 'T') BETWEEN ? AND ?) as month_access_entries,
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
      weekBounds.startDateTime,
      weekBounds.endDateTime,
      monthBounds.startDateTime,
      monthBounds.endDateTime,
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
        studentCpf: r.student_cpf,
        serviceId: r.service_id,
        serviceName: r.service_name || r.title,
        packageId: null,
        title: r.title,
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
        accessEntriesTotal: Number(r.total_access_entries || 0),
        accessEntriesWeek: Number(r.week_access_entries || 0),
        accessEntriesMonth: Number(r.month_access_entries || 0),
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

      const weekEntries = Number(
        (
          db.prepare(`
            SELECT COUNT(*) as cnt FROM studio_access_logs
            WHERE tenant_id = ? AND package_contract_id = ? AND access_status = 'allowed'
              AND REPLACE(check_in_at, ' ', 'T') BETWEEN ? AND ?
          `).get(tenantId, c.id, weekBounds.startDateTime, weekBounds.endDateTime) as any
        )?.cnt || 0
      );
      const monthEntries = Number(
        (
          db.prepare(`
            SELECT COUNT(*) as cnt FROM studio_access_logs
            WHERE tenant_id = ? AND package_contract_id = ? AND access_status = 'allowed'
              AND REPLACE(check_in_at, ' ', 'T') BETWEEN ? AND ?
          `).get(tenantId, c.id, monthBounds.startDateTime, monthBounds.endDateTime) as any
        )?.cnt || 0
      );
      const totalEntries = Number(
        (
          db.prepare(`
            SELECT COUNT(*) as cnt FROM studio_access_logs
            WHERE tenant_id = ? AND package_contract_id = ? AND access_status = 'allowed'
          `).get(tenantId, c.id) as any
        )?.cnt || 0
      );

      const accessEnt = (c.entitlements || []).find((e: any) => e.entitlement_type === 'facility_access');

      enrollments.push({
        id: c.id,
        contractSource: 'package_contract',
        contractKind: 'combined_package',
        studentId: c.student_id,
        studentName: c.student_name,
        studentPhone: c.student_phone,
        serviceId: null,
        serviceName: c.package_name_snapshot,
        packageId: c.package_id,
        title: c.package_name_snapshot,
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
        accessEntriesTotal: totalEntries,
        accessEntriesWeek: weekEntries,
        accessEntriesMonth: monthEntries,
        entitlements: c.entitlements || [],
        payments: c.payments || []
      });
    }

    const search = filters?.search ? String(filters.search).trim().toLowerCase() : '';
    const statusFilter = filters?.status ? String(filters.status).trim().toLowerCase() : 'all';

    const filtered = enrollments.filter(item => {
      if (statusFilter && statusFilter !== 'all') {
        if (item.lifecycleCategory !== statusFilter && item.contractStatus !== statusFilter) {
          return false;
        }
      }
      if (search) {
        const hay = `${item.studentName || ''} ${item.title || ''} ${item.serviceName || ''} ${item.studentPhone || ''}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    const summary = {
      activeCount: enrollments.filter(e => e.lifecycleCategory === 'active').length,
      futureCount: enrollments.filter(e => e.lifecycleCategory === 'future').length,
      expiredCount: enrollments.filter(e => e.lifecycleCategory === 'expired').length,
      suspendedCount: enrollments.filter(e => e.lifecycleCategory === 'suspended').length,
      requestedCount: enrollments.filter(e => e.lifecycleCategory === 'requested').length,
      expiringSoonCount: enrollments.filter(e => e.lifecycleCategory === 'active' && e.endDate && e.endDate >= todayIso && e.endDate <= soonIso).length
    };

    return { enrollments: filtered, summary };
  }

  /**
   * Lista registros de acesso e métricas de ocupação/movimento da academia.
   */
  static listAccessLogs(tenantId: string, filters?: {
    studentId?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    limit?: number;
  }): {
    logs: any[];
    metrics: {
      todayAllowedCount: number;
      todayDeniedCount: number;
      weekAllowedCount: number;
      monthAllowedCount: number;
      currentOccupancy: number;
      activeInsideStudents: Array<{
        logId: string;
        studentId: string;
        studentName: string;
        planName: string | null;
        checkInAt: string;
      }>;
      peakHours: Array<{ hour: string; count: number }>;
    };
  } {
    this.ensureStudioCompatible(tenantId);
    const nowParts = getBrazilNowParts();
    const { dateIso: todayIso } = nowParts;
    const weekBounds = getWeekBoundsForDate(todayIso, 1);
    const monthBounds = getMonthBoundsForDate(todayIso);

    let where = `sal.tenant_id = ?`;
    const params: any[] = [tenantId];

    if (filters?.studentId) {
      where += ` AND sal.student_id = ?`;
      params.push(filters.studentId);
    }
    if (filters?.startDate) {
      where += ` AND substr(REPLACE(sal.check_in_at, ' ', 'T'), 1, 10) >= ?`;
      params.push(String(filters.startDate).slice(0, 10));
    }
    if (filters?.endDate) {
      where += ` AND substr(REPLACE(sal.check_in_at, ' ', 'T'), 1, 10) <= ?`;
      params.push(String(filters.endDate).slice(0, 10));
    }
    if (filters?.status && filters.status !== 'all') {
      where += ` AND sal.access_status = ?`;
      params.push(filters.status);
    }

    const limit = Math.max(10, Math.min(500, Number(filters?.limit || 150)));
    const logs = db.prepare(`
      SELECT
        sal.*,
        pat.full_name as student_name,
        pat.phone as student_phone,
        s.name as service_name
      FROM studio_access_logs sal
      JOIN patients pat ON pat.id = sal.student_id AND pat.tenant_id = sal.tenant_id
      LEFT JOIN services s ON s.id = sal.service_id AND s.tenant_id = sal.tenant_id
      WHERE ${where}
      ORDER BY sal.check_in_at DESC, sal.created_at DESC
      LIMIT ?
    `).all(...params, limit) as any[];

    const todayAllowedCount = Number(
      (
        db.prepare(`
          SELECT COUNT(*) as c FROM studio_access_logs
          WHERE tenant_id = ? AND access_status = 'allowed' AND substr(REPLACE(check_in_at, ' ', 'T'), 1, 10) = ?
        `).get(tenantId, todayIso) as any
      )?.c || 0
    );

    const todayDeniedCount = Number(
      (
        db.prepare(`
          SELECT COUNT(*) as c FROM studio_access_logs
          WHERE tenant_id = ? AND access_status = 'denied' AND substr(REPLACE(check_in_at, ' ', 'T'), 1, 10) = ?
        `).get(tenantId, todayIso) as any
      )?.c || 0
    );

    const weekAllowedCount = Number(
      (
        db.prepare(`
          SELECT COUNT(*) as c FROM studio_access_logs
          WHERE tenant_id = ? AND access_status = 'allowed' AND REPLACE(check_in_at, ' ', 'T') BETWEEN ? AND ?
        `).get(tenantId, weekBounds.startDateTime, weekBounds.endDateTime) as any
      )?.c || 0
    );

    const monthAllowedCount = Number(
      (
        db.prepare(`
          SELECT COUNT(*) as c FROM studio_access_logs
          WHERE tenant_id = ? AND access_status = 'allowed' AND REPLACE(check_in_at, ' ', 'T') BETWEEN ? AND ?
        `).get(tenantId, monthBounds.startDateTime, monthBounds.endDateTime) as any
      )?.c || 0
    );

    const occupancyCutoffParts = getBrazilNowParts(new Date(Date.now() - MAX_ACTIVE_OCCUPANCY_MINUTES * 60000));
    const activeInsideStudents = db.prepare(`
      SELECT
        sal.id as logId,
        sal.student_id as studentId,
        pat.full_name as studentName,
        sal.plan_name_snapshot as planName,
        sal.check_in_at as checkInAt
      FROM studio_access_logs sal
      JOIN patients pat ON pat.id = sal.student_id AND pat.tenant_id = sal.tenant_id
      WHERE sal.tenant_id = ?
        AND sal.access_status = 'allowed'
        AND sal.check_out_at IS NULL
        AND REPLACE(sal.check_in_at, ' ', 'T') >= ?
      ORDER BY sal.check_in_at DESC
    `).all(tenantId, occupancyCutoffParts.dateTimeIso) as any[];

    const peakRows = db.prepare(`
      SELECT
        substr(REPLACE(check_in_at, ' ', 'T'), 12, 2) || ':00' as hour,
        COUNT(*) as count
      FROM studio_access_logs
      WHERE tenant_id = ? AND access_status = 'allowed'
        AND REPLACE(check_in_at, ' ', 'T') BETWEEN ? AND ?
      GROUP BY hour
      ORDER BY count DESC, hour ASC
      LIMIT 8
    `).all(tenantId, monthBounds.startDateTime, monthBounds.endDateTime) as Array<{ hour: string; count: number }>;

    return {
      logs,
      metrics: {
        todayAllowedCount,
        todayDeniedCount,
        weekAllowedCount,
        monthAllowedCount,
        currentOccupancy: activeInsideStudents.length,
        activeInsideStudents,
        peakHours: peakRows
      }
    };
  }
}
