import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { BillingCycleService, normalizePeriodicFrequency } from './billing-cycle.service';
import { PeriodicBillingFrequency } from '../utils/establishment-context';

export interface PackageItemInput {
  serviceId: string;
  includedCredits?: number | null;
  weeklyFrequency?: number | null;
}

export interface CreatePackageInput {
  name: string;
  description?: string | null;
  billingType?: 'one_time' | 'recurring_monthly';
  billingFrequency?: PeriodicBillingFrequency;
  price: number;
  creditMode?: 'per_service' | 'shared_pool';
  totalCredits?: number | null;
  weeklyLimit?: number | null;
  validityDays?: number | null;
  installmentsCount?: number;
  dueDay?: number;
  absentConsumptionPolicy?: 'consume' | 'refund';
  cancellationHoursLimit?: number;
  allowPublicBooking?: boolean | number;
  active?: boolean | number;
  items: PackageItemInput[];
}

export interface CreateContractInput {
  tenantId: string;
  packageId: string;
  studentId: string;
  startDate?: string;
  endDate?: string | null;
  dueDay?: number;
  paymentMethod?: string;
  origin?: 'admin' | 'public_booking';
  contractStatus?: 'requested' | 'confirmed' | 'active' | 'suspended' | 'expired' | 'cancelled';
  paymentStatus?: 'pending' | 'partial' | 'paid' | 'exempt';
  installmentsCount?: number;
  notes?: string | null;
  generateInitialCharge?: boolean;
  createdBy?: string;
}

function getTodayIso(): string {
  const now = new Date(Date.now() - 3 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
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

function getIsoWeekBounds(dateIso: string): { start: string; end: string } {
  const [y, m, d] = dateIso.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=Sun..6=Sat
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(Date.UTC(y, m - 1, d + diffToMon));
  const sun = new Date(mon.getTime() + 6 * 86400000);
  return {
    start: `${mon.toISOString().slice(0, 10)}T00:00:00`,
    end: `${sun.toISOString().slice(0, 10)}T23:59:59`
  };
}

export class PackageService {
  static getTenantProfile(tenantId: string): 'clinic' | 'studio' | 'mixed' {
    const row = db.prepare(`SELECT COALESCE(establishment_profile, 'clinic') as profile FROM tenants WHERE id = ?`).get(tenantId) as { profile?: string } | undefined;
    const p = String(row?.profile || 'clinic').toLowerCase();
    if (p === 'studio' || p === 'mixed') return p;
    return 'clinic';
  }

  static isStudioCompatible(tenantId: string): boolean {
    const profile = this.getTenantProfile(tenantId);
    return profile === 'studio' || profile === 'mixed';
  }

  static listCatalogPackages(tenantId: string, opts?: { publicOnly?: boolean; includeInactive?: boolean }): any[] {
    let where = `sp.tenant_id = ?`;
    if (!opts?.includeInactive) {
      where += ` AND sp.active = 1`;
    }
    if (opts?.publicOnly) {
      where += ` AND sp.active = 1 AND sp.allow_public_booking = 1`;
    }

    const packages = db.prepare(`
      SELECT sp.*
      FROM service_packages sp
      WHERE ${where}
      ORDER BY sp.active DESC, sp.name ASC
    `).all(tenantId) as any[];

    if (packages.length === 0) return [];

    const itemStmt = db.prepare(`
      SELECT
        spi.*,
        s.name as service_name,
        s.description as service_description,
        s.duration_minutes,
        s.price as single_session_price,
        s.modality,
        COALESCE(s.service_kind, 'individual') as service_kind,
        s.default_capacity,
        COALESCE(s.allow_recurrence, 1) as allow_recurrence,
        s.modality_category,
        s.professional_id as default_professional_id,
        s.active as service_active
      FROM service_package_items spi
      JOIN services s ON s.id = spi.service_id AND s.tenant_id = spi.tenant_id
      WHERE spi.package_id = ? AND spi.tenant_id = ?
      ORDER BY spi.sort_order ASC, s.name ASC
    `);

    const profsForServiceStmt = db.prepare(`
      SELECT DISTINCT
        p.id, p.name, p.slug, p.photo_url, p.public_booking_enabled,
        COALESCE(ps.custom_duration, s.duration_minutes) as duration_minutes
      FROM professionals p
      JOIN services s ON s.id = ? AND s.tenant_id = ?
      LEFT JOIN professional_services ps ON ps.service_id = s.id AND ps.professional_id = p.id
      WHERE p.tenant_id = ? AND p.active = 1
        AND (s.professional_id = p.id OR ps.professional_id = p.id)
      ORDER BY p.name ASC
    `);

    return packages.map(pkg => {
      const rawItems = itemStmt.all(pkg.id, tenantId) as any[];
      const items = rawItems.map(item => {
        const allProfs = profsForServiceStmt.all(item.service_id, tenantId, tenantId) as any[];
        const professionals = opts?.publicOnly
          ? allProfs.filter(p => Number(p.public_booking_enabled) === 1)
          : allProfs;
        return {
          ...item,
          professionals
        };
      });

      const computedTotalCredits = pkg.credit_mode === 'shared_pool'
        ? Number(pkg.total_credits || 0)
        : items.reduce((sum, it) => sum + Number(it.included_credits || 0), 0);

      return {
        ...pkg,
        total_credits: computedTotalCredits,
        items
      };
    }).filter(pkg => {
      if (!opts?.publicOnly) return true;
      return pkg.items.length > 0 && pkg.items.every((it: any) => Number(it.service_active) === 1 && it.professionals.length > 0);
    });
  }

  static createPackage(tenantId: string, input: CreatePackageInput, createdBy: string): any {
    if (!this.isStudioCompatible(tenantId)) {
      const err: any = new Error('Pacotes de serviços são habilitados para estabelecimentos configurados como Studio ou Misto.');
      err.status = 403;
      throw err;
    }

    const name = String(input.name || '').trim();
    if (!name) {
      const err: any = new Error('Nome do pacote é obrigatório.');
      err.status = 400;
      throw err;
    }

    const price = Math.round(Number(input.price) * 100) / 100;
    if (!Number.isFinite(price) || price < 0) {
      const err: any = new Error('Informe um preço válido para o pacote.');
      err.status = 400;
      throw err;
    }

    const billingType = input.billingType === 'one_time' ? 'one_time' : 'recurring_monthly';
    const creditMode = input.creditMode === 'shared_pool' ? 'shared_pool' : 'per_service';
    const items = Array.isArray(input.items) ? input.items : [];
    if (items.length === 0) {
      const err: any = new Error('Selecione ao menos um serviço incluído no pacote.');
      err.status = 400;
      throw err;
    }

    const seenServices = new Set<string>();
    const validatedItems: Array<{ serviceId: string; includedCredits: number | null; weeklyFrequency: number | null }> = [];
    for (const rawItem of items) {
      const serviceId = String(rawItem.serviceId || '').trim();
      if (!serviceId || seenServices.has(serviceId)) continue;
      seenServices.add(serviceId);

      const srv = db.prepare(`SELECT id FROM services WHERE id = ? AND tenant_id = ? AND active = 1`).get(serviceId, tenantId);
      if (!srv) {
        const err: any = new Error('Um ou mais serviços selecionados não pertencem a este estabelecimento ou estão inativos.');
        err.status = 400;
        throw err;
      }

      let includedCredits: number | null = null;
      if (creditMode === 'per_service') {
        const c = Number(rawItem.includedCredits);
        if (!Number.isInteger(c) || c < 1 || c > 500) {
          const err: any = new Error('No modo por serviço, informe a quantidade de aulas incluídas (>= 1) para cada modalidade.');
          err.status = 400;
          throw err;
        }
        includedCredits = c;
      }
      const wf = rawItem.weeklyFrequency !== undefined && rawItem.weeklyFrequency !== null && rawItem.weeklyFrequency !== ('' as any)
        ? Math.max(1, Math.min(14, Math.floor(Number(rawItem.weeklyFrequency))))
        : null;
      validatedItems.push({ serviceId, includedCredits, weeklyFrequency: wf });
    }

    if (validatedItems.length === 0) {
      const err: any = new Error('Selecione ao menos um serviço válido.');
      err.status = 400;
      throw err;
    }

    let totalCredits: number;
    if (creditMode === 'shared_pool') {
      const tc = Number(input.totalCredits);
      if (!Number.isInteger(tc) || tc < 1 || tc > 1000) {
        const err: any = new Error('Informe o limite total de aulas compartilhadas no período (>= 1).');
        err.status = 400;
        throw err;
      }
      totalCredits = tc;
    } else {
      totalCredits = validatedItems.reduce((sum, it) => sum + Number(it.includedCredits || 0), 0);
    }

    const weeklyLimit = input.weeklyLimit ? Math.max(1, Math.min(50, Math.floor(Number(input.weeklyLimit)))) : null;
    const validityDays = input.validityDays
      ? Math.max(1, Math.min(3650, Math.floor(Number(input.validityDays))))
      : (billingType === 'recurring_monthly' ? 30 : 30);
    const installmentsCount = billingType === 'one_time'
      ? Math.max(1, Math.min(24, Math.floor(Number(input.installmentsCount) || 1)))
      : 1;
    const dueDay = Math.max(1, Math.min(28, Math.floor(Number(input.dueDay) || 10)));
    const absentPolicy = input.absentConsumptionPolicy === 'refund' ? 'refund' : 'consume';
    const cancelHours = Math.max(0, Math.min(168, Math.floor(Number(input.cancellationHoursLimit ?? 12))));
    const allowPublic = input.allowPublicBooking === false || input.allowPublicBooking === 0 ? 0 : 1;
    const active = input.active === false || input.active === 0 ? 0 : 1;
    const { frequency: billingFrequency, cycleMonths } = billingType === 'recurring_monthly'
      ? normalizePeriodicFrequency(input.billingFrequency || 'monthly')
      : { frequency: 'monthly' as PeriodicBillingFrequency, cycleMonths: 1 };

    const packageId = 'pkg-' + uuidv4().slice(0, 8);
    db.transaction(() => {
      db.prepare(`
        INSERT INTO service_packages (
          id, tenant_id, name, description, billing_type, billing_frequency, cycle_months, price, credit_mode,
          total_credits, weekly_limit, validity_days, installments_count, due_day,
          absent_consumption_policy, cancellation_hours_limit, allow_public_booking, active,
          created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        packageId, tenantId, name, input.description ? String(input.description).trim() : null,
        billingType, billingFrequency, cycleMonths, price, creditMode, totalCredits, weeklyLimit, validityDays, installmentsCount,
        dueDay, absentPolicy, cancelHours, allowPublic, active, createdBy
      );

      const insItem = db.prepare(`
        INSERT INTO service_package_items (id, tenant_id, package_id, service_id, included_credits, weekly_frequency, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      validatedItems.forEach((it, idx) => {
        insItem.run('pki-' + uuidv4().slice(0, 8), tenantId, packageId, it.serviceId, it.includedCredits, it.weeklyFrequency, idx);
      });
    })();

    return this.listCatalogPackages(tenantId, { includeInactive: true }).find(p => p.id === packageId);
  }

  static updatePackage(tenantId: string, packageId: string, input: Partial<CreatePackageInput>): any {
    const existing = db.prepare(`SELECT * FROM service_packages WHERE id = ? AND tenant_id = ?`).get(packageId, tenantId) as any;
    if (!existing) {
      const err: any = new Error('Pacote não encontrado neste estabelecimento.');
      err.status = 404;
      throw err;
    }

    const name = input.name !== undefined ? String(input.name).trim() : existing.name;
    if (!name) {
      const err: any = new Error('Nome do pacote é obrigatório.');
      err.status = 400;
      throw err;
    }

    const price = input.price !== undefined ? Math.round(Number(input.price) * 100) / 100 : Number(existing.price);
    if (!Number.isFinite(price) || price < 0) {
      const err: any = new Error('Preço inválido.');
      err.status = 400;
      throw err;
    }

    const billingType = input.billingType !== undefined
      ? (input.billingType === 'one_time' ? 'one_time' : 'recurring_monthly')
      : existing.billing_type;
    const creditMode = input.creditMode !== undefined
      ? (input.creditMode === 'shared_pool' ? 'shared_pool' : 'per_service')
      : existing.credit_mode;

    db.transaction(() => {
      let nextTotalCredits = Number(existing.total_credits || 0);
      if (Array.isArray(input.items) && input.items.length > 0) {
        const seen = new Set<string>();
        const validated: Array<{ serviceId: string; includedCredits: number | null; weeklyFrequency: number | null }> = [];
        for (const rawItem of input.items) {
          const serviceId = String(rawItem.serviceId || '').trim();
          if (!serviceId || seen.has(serviceId)) continue;
          seen.add(serviceId);
          const srv = db.prepare(`SELECT id FROM services WHERE id = ? AND tenant_id = ?`).get(serviceId, tenantId);
          if (!srv) {
            const err: any = new Error('Serviço inválido no catálogo deste estabelecimento.');
            err.status = 400;
            throw err;
          }
          const inc = creditMode === 'per_service' ? Math.max(1, Math.floor(Number(rawItem.includedCredits) || 1)) : null;
          const wf = rawItem.weeklyFrequency ? Math.max(1, Math.min(14, Math.floor(Number(rawItem.weeklyFrequency)))) : null;
          validated.push({ serviceId, includedCredits: inc, weeklyFrequency: wf });
        }

        if (validated.length > 0) {
          db.prepare(`DELETE FROM service_package_items WHERE package_id = ? AND tenant_id = ?`).run(packageId, tenantId);
          const insItem = db.prepare(`
            INSERT INTO service_package_items (id, tenant_id, package_id, service_id, included_credits, weekly_frequency, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);
          validated.forEach((it, idx) => {
            insItem.run('pki-' + uuidv4().slice(0, 8), tenantId, packageId, it.serviceId, it.includedCredits, it.weeklyFrequency, idx);
          });
          nextTotalCredits = creditMode === 'shared_pool'
            ? Math.max(1, Math.floor(Number(input.totalCredits ?? existing.total_credits ?? 1)))
            : validated.reduce((sum, it) => sum + Number(it.includedCredits || 0), 0);
        }
      } else if (creditMode === 'shared_pool' && input.totalCredits !== undefined) {
        nextTotalCredits = Math.max(1, Math.floor(Number(input.totalCredits)));
      }

      const { frequency: nextBillingFreq, cycleMonths: nextCycleMonths } = billingType === 'recurring_monthly'
        ? normalizePeriodicFrequency(
            input.billingFrequency !== undefined ? input.billingFrequency : (existing.billing_frequency || 'monthly'),
            existing.cycle_months
          )
        : { frequency: 'monthly' as PeriodicBillingFrequency, cycleMonths: 1 };

      // Atualiza apenas a definição comercial futura; contratos e direitos já firmados preservam snapshot próprio.
      db.prepare(`
        UPDATE service_packages
        SET name = ?,
            description = ?,
            billing_type = ?,
            billing_frequency = ?,
            cycle_months = ?,
            price = ?,
            credit_mode = ?,
            total_credits = ?,
            weekly_limit = ?,
            validity_days = ?,
            installments_count = ?,
            due_day = ?,
            absent_consumption_policy = ?,
            cancellation_hours_limit = ?,
            allow_public_booking = ?,
            active = ?,
            updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(
        name,
        input.description !== undefined ? (input.description ? String(input.description).trim() : null) : existing.description,
        billingType,
        nextBillingFreq,
        nextCycleMonths,
        price,
        creditMode,
        nextTotalCredits,
        input.weeklyLimit !== undefined ? (input.weeklyLimit ? Math.max(1, Number(input.weeklyLimit)) : null) : existing.weekly_limit,
        input.validityDays !== undefined ? (input.validityDays ? Math.max(1, Number(input.validityDays)) : null) : existing.validity_days,
        input.installmentsCount !== undefined ? Math.max(1, Math.min(24, Number(input.installmentsCount) || 1)) : existing.installments_count,
        input.dueDay !== undefined ? Math.max(1, Math.min(28, Number(input.dueDay) || 10)) : existing.due_day,
        input.absentConsumptionPolicy !== undefined ? (input.absentConsumptionPolicy === 'refund' ? 'refund' : 'consume') : existing.absent_consumption_policy,
        input.cancellationHoursLimit !== undefined ? Math.max(0, Math.min(168, Number(input.cancellationHoursLimit))) : existing.cancellation_hours_limit,
        input.allowPublicBooking !== undefined ? (input.allowPublicBooking === false || input.allowPublicBooking === 0 ? 0 : 1) : existing.allow_public_booking,
        input.active !== undefined ? (input.active === false || input.active === 0 ? 0 : 1) : existing.active,
        packageId,
        tenantId
      );
    })();

    return this.listCatalogPackages(tenantId, { includeInactive: true }).find(p => p.id === packageId);
  }

  /**
   * Cria contratação formal de pacote para um aluno, gerando snapshot completo + direitos + cobrança/mensalidade única
   */
  static createContractTx(input: CreateContractInput): any {
    const pkg = db.prepare(`SELECT * FROM service_packages WHERE id = ? AND tenant_id = ? AND active = 1`).get(input.packageId, input.tenantId) as any;
    if (!pkg) {
      const err: any = new Error('Pacote não encontrado ou inativo neste estabelecimento.');
      err.status = 404;
      throw err;
    }

    const student = db.prepare(`SELECT id, full_name FROM patients WHERE id = ? AND tenant_id = ?`).get(input.studentId, input.tenantId) as any;
    if (!student) {
      const err: any = new Error('Aluno não encontrado neste estabelecimento.');
      err.status = 404;
      throw err;
    }

    const pkgItems = db.prepare(`
      SELECT spi.*, s.name as service_name, s.professional_id as service_professional_id
      FROM service_package_items spi
      JOIN services s ON s.id = spi.service_id AND s.tenant_id = spi.tenant_id
      WHERE spi.package_id = ? AND spi.tenant_id = ?
      ORDER BY spi.sort_order ASC
    `).all(pkg.id, input.tenantId) as any[];

    if (pkgItems.length === 0) {
      const err: any = new Error('Este pacote não possui serviços configurados.');
      err.status = 400;
      throw err;
    }

    const origin = input.origin === 'public_booking' ? 'public_booking' : 'admin';
    const startDate = input.startDate ? String(input.startDate).slice(0, 10) : getTodayIso();
    const validityDays = Number(pkg.validity_days || 30);
    const endDate = input.endDate !== undefined
      ? (input.endDate ? String(input.endDate).slice(0, 10) : null)
      : addDaysIso(startDate, Math.max(1, validityDays) - 1);

    const dueDay = Math.max(1, Math.min(28, Math.floor(Number(input.dueDay || pkg.due_day || 10))));
    const contractedPrice = Math.round(Number(pkg.price || 0) * 100) / 100;
    const installmentsCount = pkg.billing_type === 'one_time'
      ? Math.max(1, Math.min(24, Math.floor(Number(input.installmentsCount || pkg.installments_count || 1))))
      : 1;

    // Contratação pública sem pagamento online nasce sempre como 'requested' e pagamento 'pending'
    const contractStatus = origin === 'public_booking'
      ? 'requested'
      : (input.contractStatus || 'active');
    const paymentStatus = origin === 'public_booking'
      ? 'pending'
      : (input.paymentStatus || (contractedPrice === 0 ? 'exempt' : 'pending'));

    const contractId = 'ctr-' + uuidv4().slice(0, 8);
    let recurringPlanId: string | null = null;
    const paymentMethod = input.paymentMethod || 'pix';
    const createdBy = input.createdBy || 'system';
    const shouldGenerateCharge = input.generateInitialCharge !== false && contractedPrice > 0;
    const { frequency: pkgFreq, cycleMonths: pkgCycleMonths } = normalizePeriodicFrequency(
      pkg.billing_frequency || 'monthly',
      pkg.cycle_months
    );

    if (pkg.billing_type === 'recurring_monthly') {
      recurringPlanId = 'rbp-' + uuidv4().slice(0, 8);
      const planStatus = (contractStatus === 'active' || contractStatus === 'confirmed') ? 'active' : 'paused';
      db.prepare(`
        INSERT INTO recurring_billing_plans (
          id, tenant_id, patient_id, service_id, professional_id, package_contract_id,
          title, amount, billing_cycle, billing_frequency, cycle_months, covers_sessions,
          due_day, payment_method, start_date, end_date, status, notes, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        recurringPlanId,
        input.tenantId,
        input.studentId,
        pkgItems.length === 1 ? pkgItems[0].service_id : null,
        pkgItems.length === 1 ? (pkgItems[0].service_professional_id || null) : null,
        contractId,
        `Pacote: ${pkg.name}`,
        contractedPrice,
        pkgFreq,
        pkgFreq,
        pkgCycleMonths,
        dueDay,
        paymentMethod,
        startDate,
        endDate,
        planStatus,
        input.notes ? String(input.notes).trim() : null,
        createdBy
      );
    }

    db.prepare(`
      INSERT INTO student_package_contracts (
        id, tenant_id, package_id, student_id, recurring_plan_id,
        package_name_snapshot, description_snapshot, billing_type_snapshot, billing_frequency_snapshot, cycle_months_snapshot,
        credit_mode_snapshot, contracted_price, installments_count, total_credits_snapshot, weekly_limit_snapshot,
        validity_days_snapshot, due_day_snapshot, absent_consumption_policy_snapshot,
        cancellation_hours_limit_snapshot, start_date, end_date, contract_status,
        payment_status, origin, notes, confirmed_by, confirmed_at, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      contractId,
      input.tenantId,
      pkg.id,
      input.studentId,
      recurringPlanId,
      pkg.name,
      pkg.description || null,
      pkg.billing_type,
      pkgFreq,
      pkgCycleMonths,
      pkg.credit_mode,
      contractedPrice,
      installmentsCount,
      Number(pkg.total_credits || 0),
      pkg.weekly_limit ?? null,
      validityDays,
      dueDay,
      pkg.absent_consumption_policy || 'consume',
      Number(pkg.cancellation_hours_limit ?? 12),
      startDate,
      endDate,
      contractStatus,
      paymentStatus,
      origin,
      input.notes ? String(input.notes).trim() : null,
      contractStatus === 'active' || contractStatus === 'confirmed' ? createdBy : null,
      contractStatus === 'active' || contractStatus === 'confirmed' ? new Date().toISOString() : null,
      createdBy
    );

    const insEnt = db.prepare(`
      INSERT INTO student_package_entitlements (
        id, tenant_id, contract_id, service_id, service_name_snapshot,
        allowed_service_ids_json, weekly_frequency_snapshot, credits_total, credits_reserved, credits_used
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
    `);

    if (pkg.credit_mode === 'shared_pool') {
      const allowedIds = pkgItems.map(it => it.service_id);
      const serviceNamesLabel = pkgItems.map(it => it.service_name).join(' + ');
      insEnt.run(
        'ent-' + uuidv4().slice(0, 8),
        input.tenantId,
        contractId,
        null,
        `Pool Compartilhado (${serviceNamesLabel})`,
        JSON.stringify(allowedIds),
        pkg.weekly_limit ?? null,
        Number(pkg.total_credits || 0)
      );
    } else {
      for (const item of pkgItems) {
        insEnt.run(
          'ent-' + uuidv4().slice(0, 8),
          input.tenantId,
          contractId,
          item.service_id,
          item.service_name,
          JSON.stringify([item.service_id]),
          item.weekly_frequency ?? null,
          Number(item.included_credits || 0)
        );
      }
    }

    const generatedPaymentIds: string[] = [];
    if (shouldGenerateCharge) {
      const isPaidNow = paymentStatus === 'paid';
      const paidDate = isPaidNow ? new Date().toISOString() : null;

      if (pkg.billing_type === 'recurring_monthly' && recurringPlanId) {
        const planRow = db.prepare(`SELECT * FROM recurring_billing_plans WHERE id = ?`).get(recurringPlanId);
        const genRes = BillingCycleService.generateCyclesForPlanTx({
          tenantId: input.tenantId,
          plan: planRow,
          competenceMonth: startDate.slice(0, 7),
          initialPaymentStatus: isPaidNow ? 'paid' : 'pending'
        });
        generatedPaymentIds.push(...genRes.generatedIds);
      } else {
        // Pagamento único (à vista ou em N parcelas explícitas do pacote, jamais por sessão)
        const baseInstallment = Math.floor((contractedPrice / installmentsCount) * 100) / 100;
        const remainder = Math.round((contractedPrice - baseInstallment * installmentsCount) * 100) / 100;
        const insPay = db.prepare(`
          INSERT INTO payments (
            id, tenant_id, appointment_id, patient_id, amount, payment_method, status, payment_date, notes,
            service_id, base_amount, due_date, professional_id, package_contract_id, installment_number, total_installments
          ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (let idx = 0; idx < installmentsCount; idx++) {
          const instNum = idx + 1;
          const amount = idx === installmentsCount - 1
            ? Math.round((baseInstallment + remainder) * 100) / 100
            : baseInstallment;
          const instDueDate = idx === 0
            ? addDaysIso(startDate, 0)
            : addMonthsClampIso(startDate, idx, dueDay);
          const payId = 'pay-' + uuidv4().slice(0, 8);
          const label = installmentsCount > 1
            ? `Pacote ${pkg.name} (Parcela ${instNum}/${installmentsCount})`
            : `Pacote ${pkg.name} (Pagamento único)`;
          insPay.run(
            payId,
            input.tenantId,
            input.studentId,
            amount,
            paymentMethod,
            isPaidNow && idx === 0 ? 'paid' : 'pending',
            isPaidNow && idx === 0 ? paidDate : null,
            label,
            pkgItems.length === 1 ? pkgItems[0].service_id : null,
            amount,
            instDueDate,
            pkgItems.length === 1 ? (pkgItems[0].service_professional_id || null) : null,
            contractId,
            instNum,
            installmentsCount
          );
          generatedPaymentIds.push(payId);
        }
      }
    }

    return {
      ...this.getContractById(input.tenantId, contractId),
      generatedPaymentIds
    };
  }

  static getContractById(tenantId: string, contractId: string): any | null {
    const contract = db.prepare(`
      SELECT
        c.*,
        pat.full_name as student_name,
        pat.phone as student_phone,
        pat.whatsapp as student_whatsapp,
        pat.email as student_email,
        rbp.status as recurring_plan_status
      FROM student_package_contracts c
      JOIN patients pat ON pat.id = c.student_id
      LEFT JOIN recurring_billing_plans rbp ON rbp.id = c.recurring_plan_id AND rbp.tenant_id = c.tenant_id
      WHERE c.id = ? AND c.tenant_id = ?
    `).get(contractId, tenantId) as any;

    if (!contract) return null;

    const entitlements = (db.prepare(`
      SELECT * FROM student_package_entitlements WHERE contract_id = ? AND tenant_id = ? ORDER BY created_at ASC
    `).all(contractId, tenantId) as any[]).map(e => {
      let allowedServiceIds: string[] = [];
      try {
        if (e.allowed_service_ids_json) allowedServiceIds = JSON.parse(e.allowed_service_ids_json);
      } catch (_) {}
      const remaining = Math.max(0, Number(e.credits_total || 0) - Number(e.credits_reserved || 0) - Number(e.credits_used || 0));
      return {
        ...e,
        allowed_service_ids: allowedServiceIds,
        credits_remaining: remaining
      };
    });

    const payments = db.prepare(`
      SELECT id, amount, status, due_date, payment_date, payment_method, competence_month, installment_number, total_installments, notes
      FROM payments
      WHERE package_contract_id = ? AND tenant_id = ?
      ORDER BY due_date ASC, created_at ASC
    `).all(contractId, tenantId) as any[];

    const totalCredits = entitlements.reduce((s, e) => s + Number(e.credits_total || 0), 0);
    const totalReserved = entitlements.reduce((s, e) => s + Number(e.credits_reserved || 0), 0);
    const totalUsed = entitlements.reduce((s, e) => s + Number(e.credits_used || 0), 0);

    return {
      ...contract,
      entitlements,
      payments,
      summary: {
        creditsTotal: totalCredits,
        creditsReserved: totalReserved,
        creditsUsed: totalUsed,
        creditsRemaining: Math.max(0, totalCredits - totalReserved - totalUsed)
      }
    };
  }

  static listContracts(tenantId: string, filters?: { studentId?: string; status?: string; professionalId?: string }): any[] {
    let sql = `
      SELECT c.id
      FROM student_package_contracts c
      WHERE c.tenant_id = ?
    `;
    const params: any[] = [tenantId];

    if (filters?.studentId) {
      sql += ` AND c.student_id = ?`;
      params.push(filters.studentId);
    }
    if (filters?.status) {
      sql += ` AND c.contract_status = ?`;
      params.push(filters.status);
    }
    if (filters?.professionalId) {
      sql += ` AND (
        EXISTS (
          SELECT 1 FROM appointments a
          WHERE a.package_contract_id = c.id AND a.tenant_id = c.tenant_id AND a.professional_id = ? AND a.status != 'cancelled'
        )
        OR EXISTS (
          SELECT 1 FROM student_package_entitlements ent
          JOIN services s ON s.tenant_id = ent.tenant_id AND (
            ent.service_id = s.id OR ent.allowed_service_ids_json LIKE '%' || s.id || '%'
          )
          WHERE ent.contract_id = c.id AND (
            s.professional_id = ?
            OR EXISTS (
              SELECT 1 FROM professional_services ps
              WHERE ps.service_id = s.id AND ps.professional_id = ?
            )
          )
        )
      )`;
      params.push(filters.professionalId, filters.professionalId, filters.professionalId);
    }

    sql += ` ORDER BY CASE WHEN c.contract_status IN ('active', 'requested', 'confirmed') THEN 0 ELSE 1 END, c.created_at DESC LIMIT 200`;

    const ids = db.prepare(sql).all(...params) as { id: string }[];
    return ids.map(r => this.getContractById(tenantId, r.id)).filter(Boolean);
  }

  /**
   * Reserva 1 direito de utilização dentro de uma transação já aberta ou autônoma.
   * Nunca confunde reserva futura (credits_reserved) com uso frequentado (credits_used).
   */
  static reservePackageRightTx(params: {
    tenantId: string;
    contractId: string;
    studentId: string;
    serviceId: string;
    appointmentId: string;
    startTime: string;
    allowRequestedContract?: boolean;
    createdBy?: string;
  }): { contractId: string; entitlementId: string } {
    const contract = db.prepare(`
      SELECT * FROM student_package_contracts WHERE id = ? AND tenant_id = ?
    `).get(params.contractId, params.tenantId) as any;

    if (!contract) {
      const err: any = new Error('Contratação de pacote não encontrada neste estabelecimento.');
      err.status = 404;
      err.code = 'PACKAGE_CONTRACT_NOT_FOUND';
      throw err;
    }

    if (contract.student_id !== params.studentId) {
      const err: any = new Error('Este pacote pertence a outro aluno.');
      err.status = 403;
      err.code = 'PACKAGE_STUDENT_MISMATCH';
      throw err;
    }

    const allowedStatuses = params.allowRequestedContract ? ['active', 'requested'] : ['active'];
    if (!allowedStatuses.includes(contract.contract_status)) {
      const err: any = new Error(
        contract.contract_status === 'requested'
          ? 'Solicitação de pacote ainda aguarda confirmação administrativa antes de novas reservas.'
          : `Pacote não está ativo para uso (status atual: ${contract.contract_status}).`
      );
      err.status = 409;
      err.code = 'PACKAGE_NOT_ACTIVE';
      throw err;
    }

    const apptDate = String(params.startTime).slice(0, 10);
    if (contract.start_date && apptDate < contract.start_date) {
      const err: any = new Error(`A vigência deste pacote inicia em ${contract.start_date}.`);
      err.status = 400;
      err.code = 'PACKAGE_OUT_OF_VALIDITY';
      throw err;
    }
    if (contract.end_date && apptDate > contract.end_date) {
      const err: any = new Error(`A vigência deste pacote expira em ${contract.end_date}.`);
      err.status = 409;
      err.code = 'PACKAGE_EXPIRED';
      throw err;
    }

    // Idempotência para proteção contra cliques repetidos
    const alreadyReserved = db.prepare(`
      SELECT entitlement_id FROM package_usage_ledger
      WHERE contract_id = ? AND appointment_id = ? AND action = 'reserve'
    `).get(params.contractId, params.appointmentId) as { entitlement_id?: string } | undefined;
    if (alreadyReserved?.entitlement_id) {
      return { contractId: params.contractId, entitlementId: alreadyReserved.entitlement_id };
    }

    // Localiza direito compatível (direto por serviço ou pool compartilhado)
    const entitlements = db.prepare(`
      SELECT * FROM student_package_entitlements WHERE contract_id = ? AND tenant_id = ?
    `).all(params.contractId, params.tenantId) as any[];

    let targetEnt = entitlements.find(e => e.service_id === params.serviceId);
    if (!targetEnt && contract.credit_mode_snapshot === 'shared_pool') {
      targetEnt = entitlements.find(e => {
        if (!e.allowed_service_ids_json) return false;
        try {
          const ids = JSON.parse(e.allowed_service_ids_json);
          return Array.isArray(ids) && ids.includes(params.serviceId);
        } catch {
          return false;
        }
      });
    }

    if (!targetEnt) {
      const err: any = new Error('Este serviço não faz parte dos itens incluídos neste pacote.');
      err.status = 400;
      err.code = 'SERVICE_NOT_IN_PACKAGE';
      throw err;
    }

    const remaining = Number(targetEnt.credits_total || 0) - Number(targetEnt.credits_reserved || 0) - Number(targetEnt.credits_used || 0);
    if (remaining < 1) {
      const err: any = new Error('Saldo de aulas do pacote esgotado para esta modalidade/período.');
      err.status = 409;
      err.code = 'PACKAGE_CREDITS_EXHAUSTED';
      throw err;
    }

    // Verifica limite semanal quando configurado no pacote ou item
    const effectiveWeeklyCap = Number(targetEnt.weekly_frequency_snapshot || contract.weekly_limit_snapshot || 0);
    if (effectiveWeeklyCap > 0) {
      const { start, end } = getIsoWeekBounds(apptDate);
      const usedInWeekRow = db.prepare(`
        SELECT COUNT(*) as c FROM appointments
        WHERE tenant_id = ? AND package_contract_id = ? AND id != ? AND status NOT IN ('cancelled')
          AND (? IS NULL OR service_id = ?)
          AND REPLACE(start_time, ' ', 'T') BETWEEN ? AND ?
      `).get(
        params.tenantId,
        params.contractId,
        params.appointmentId,
        targetEnt.weekly_frequency_snapshot ? params.serviceId : null,
        params.serviceId,
        start,
        end
      ) as { c: number };
      if (Number(usedInWeekRow?.c || 0) >= effectiveWeeklyCap) {
        const err: any = new Error(`Limite semanal de ${effectiveWeeklyCap} aula(s) do pacote atingido nesta semana.`);
        err.status = 409;
        err.code = 'PACKAGE_WEEKLY_LIMIT_REACHED';
        throw err;
      }
    }

    db.prepare(`
      UPDATE student_package_entitlements
      SET credits_reserved = credits_reserved + 1, updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(targetEnt.id, params.tenantId);

    db.prepare(`
      INSERT INTO package_usage_ledger (
        id, tenant_id, contract_id, entitlement_id, appointment_id, action,
        delta_reserved, delta_used, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, 'reserve', 1, 0, ?, ?)
    `).run(
      'plg-' + uuidv4().slice(0, 8),
      params.tenantId,
      params.contractId,
      targetEnt.id,
      params.appointmentId,
      `Reserva de vaga para ${apptDate}`,
      params.createdBy || 'system'
    );

    return { contractId: params.contractId, entitlementId: targetEnt.id };
  }

  /**
   * Restitui direito reservado quando um agendamento futuro coberto pelo pacote é cancelado
   */
  static releasePackageRightTx(params: {
    tenantId: string;
    appointmentId: string;
    reason?: string;
    createdBy?: string;
  }): boolean {
    const appt = db.prepare(`
      SELECT id, package_contract_id, package_entitlement_id, is_package_covered, attendance_status, start_time
      FROM appointments WHERE id = ? AND tenant_id = ?
    `).get(params.appointmentId, params.tenantId) as any;

    if (!appt || !appt.is_package_covered || !appt.package_contract_id || !appt.package_entitlement_id) {
      return false;
    }

    const contractId = appt.package_contract_id;
    const entitlementId = appt.package_entitlement_id;

    // Se já foi restituído anteriormente para este agendamento, não duplica
    const alreadyReleased = db.prepare(`
      SELECT 1 FROM package_usage_ledger
      WHERE contract_id = ? AND appointment_id = ? AND action IN ('release', 'refund_absence')
    `).get(contractId, params.appointmentId);
    if (alreadyReleased) return false;

    const alreadyConsumed = db.prepare(`
      SELECT action FROM package_usage_ledger
      WHERE contract_id = ? AND appointment_id = ? AND action IN ('consume', 'consume_absence')
    `).get(contractId, params.appointmentId) as { action?: string } | undefined;

    if (alreadyConsumed) {
      // Se já havia sido consumido (ex.: cancelamento administrativo após marcação), devolve do used
      db.prepare(`
        UPDATE student_package_entitlements
        SET credits_used = MAX(0, credits_used - 1), updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(entitlementId, params.tenantId);

      db.prepare(`
        INSERT OR IGNORE INTO package_usage_ledger (
          id, tenant_id, contract_id, entitlement_id, appointment_id, action, delta_reserved, delta_used, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, 'release', 0, -1, ?, ?)
      `).run(
        'plg-' + uuidv4().slice(0, 8),
        params.tenantId,
        contractId,
        entitlementId,
        params.appointmentId,
        params.reason || 'Cancelamento de aula com restituição de crédito consumido',
        params.createdBy || 'system'
      );
      return true;
    }

    // Caso padrão: aula estava reservada (credits_reserved) -> libera reserva e restitui disponibilidade
    const wasReserved = db.prepare(`
      SELECT 1 FROM package_usage_ledger
      WHERE contract_id = ? AND appointment_id = ? AND action = 'reserve'
    `).get(contractId, params.appointmentId);

    if (wasReserved) {
      db.prepare(`
        UPDATE student_package_entitlements
        SET credits_reserved = MAX(0, credits_reserved - 1), updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(entitlementId, params.tenantId);

      db.prepare(`
        INSERT OR IGNORE INTO package_usage_ledger (
          id, tenant_id, contract_id, entitlement_id, appointment_id, action, delta_reserved, delta_used, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, 'release', -1, 0, ?, ?)
      `).run(
        'plg-' + uuidv4().slice(0, 8),
        params.tenantId,
        contractId,
        entitlementId,
        params.appointmentId,
        params.reason || 'Cancelamento dentro das regras: vaga e direito restituídos',
        params.createdBy || 'system'
      );
      return true;
    }

    return false;
  }

  /**
   * Atualiza o estado de utilização do pacote a partir da chamada explícita (present / absent / cancelled / pending)
   */
  static handleAttendanceChangeTx(params: {
    tenantId: string;
    appointmentId: string;
    attendanceStatus: 'pending' | 'present' | 'absent' | 'cancelled';
    createdBy?: string;
  }): void {
    const appt = db.prepare(`
      SELECT id, package_contract_id, package_entitlement_id, is_package_covered
      FROM appointments WHERE id = ? AND tenant_id = ?
    `).get(params.appointmentId, params.tenantId) as any;

    if (!appt || !appt.is_package_covered || !appt.package_contract_id || !appt.package_entitlement_id) {
      return;
    }

    const contract = db.prepare(`
      SELECT absent_consumption_policy_snapshot FROM student_package_contracts WHERE id = ? AND tenant_id = ?
    `).get(appt.package_contract_id, params.tenantId) as { absent_consumption_policy_snapshot?: string } | undefined;

    const absentPolicy = contract?.absent_consumption_policy_snapshot === 'refund' ? 'refund' : 'consume';
    const contractId = appt.package_contract_id;
    const entId = appt.package_entitlement_id;

    // Estado líquido atual deste agendamento no ledger
    const netRow = db.prepare(`
      SELECT COALESCE(SUM(delta_reserved), 0) as net_res, COALESCE(SUM(delta_used), 0) as net_used
      FROM package_usage_ledger
      WHERE contract_id = ? AND appointment_id = ?
    `).get(contractId, params.appointmentId) as { net_res: number; net_used: number };

    const curRes = Number(netRow?.net_res || 0);
    const curUsed = Number(netRow?.net_used || 0);

    // Determina estado alvo (reserved vs used vs released) conforme attendanceStatus
    let targetRes = curRes;
    let targetUsed = curUsed;
    let action: 'consume' | 'release' | 'consume_absence' | 'refund_absence' | 'reserve' = 'reserve';

    if (params.attendanceStatus === 'present') {
      targetRes = 0;
      targetUsed = 1;
      action = 'consume';
    } else if (params.attendanceStatus === 'absent') {
      if (absentPolicy === 'consume') {
        targetRes = 0;
        targetUsed = 1;
        action = 'consume_absence';
      } else {
        targetRes = 0;
        targetUsed = 0;
        action = 'refund_absence';
      }
    } else if (params.attendanceStatus === 'cancelled') {
      targetRes = 0;
      targetUsed = 0;
      action = 'release';
    } else if (params.attendanceStatus === 'pending') {
      targetRes = 1;
      targetUsed = 0;
      action = 'reserve';
    }

    const dRes = targetRes - curRes;
    const dUsed = targetUsed - curUsed;
    if (dRes === 0 && dUsed === 0) return;

    db.prepare(`
      UPDATE student_package_entitlements
      SET credits_reserved = MAX(0, credits_reserved + ?),
          credits_used = MAX(0, credits_used + ?),
          updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(dRes, dUsed, entId, params.tenantId);

    // Garante registro único caso já exista ação igual anterior (substitui ou registra nova transição)
    db.prepare(`
      DELETE FROM package_usage_ledger WHERE contract_id = ? AND appointment_id = ? AND action = ?
    `).run(contractId, params.appointmentId, action);

    db.prepare(`
      INSERT INTO package_usage_ledger (
        id, tenant_id, contract_id, entitlement_id, appointment_id, action, delta_reserved, delta_used, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'plg-' + uuidv4().slice(0, 8),
      params.tenantId,
      contractId,
      entId,
      params.appointmentId,
      action,
      dRes,
      dUsed,
      `Chamada: ${params.attendanceStatus}`,
      params.createdBy || 'system'
    );
  }

  /**
   * Atualiza status de pagamento e ativa o contrato quando uma cobrança do pacote é quitada na Central de Cobranças
   */
  static activateContractOnPaymentSettled(tenantId: string, paymentId: string, actorId: string): void {
    const pay = db.prepare(`
      SELECT id, package_contract_id FROM payments WHERE id = ? AND tenant_id = ?
    `).get(paymentId, tenantId) as { id: string; package_contract_id?: string | null } | undefined;

    if (!pay?.package_contract_id) return;

    const contract = db.prepare(`
      SELECT * FROM student_package_contracts WHERE id = ? AND tenant_id = ?
    `).get(pay.package_contract_id, tenantId) as any;
    if (!contract) return;

    const allPays = db.prepare(`
      SELECT status FROM payments WHERE package_contract_id = ? AND tenant_id = ? AND status NOT IN ('cancelled', 'refunded')
    `).all(contract.id, tenantId) as { status: string }[];

    const paidCount = allPays.filter(p => p.status === 'paid' || p.status === 'exempt').length;
    const nextPayStatus = allPays.length > 0 && paidCount >= allPays.length
      ? 'paid'
      : (paidCount > 0 ? 'partial' : 'pending');

    const shouldActivate = ['requested', 'confirmed', 'suspended'].includes(contract.contract_status);

    db.prepare(`
      UPDATE student_package_contracts
      SET payment_status = ?,
          contract_status = CASE WHEN ? = 1 THEN 'active' ELSE contract_status END,
          confirmed_by = CASE WHEN confirmed_by IS NULL THEN ? ELSE confirmed_by END,
          confirmed_at = CASE WHEN confirmed_at IS NULL THEN datetime('now') ELSE confirmed_at END,
          updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(nextPayStatus, shouldActivate ? 1 : 0, actorId, contract.id, tenantId);

    if (contract.recurring_plan_id && shouldActivate) {
      db.prepare(`
        UPDATE recurring_billing_plans SET status = 'active', updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ? AND status != 'cancelled'
      `).run(contract.recurring_plan_id, tenantId);
    }
  }
}
