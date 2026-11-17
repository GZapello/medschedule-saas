import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';
import { getTenantEstablishmentProfile, supportsStudioFeatures } from '../utils/establishment-context';

const DISCRETE_SALE_UNITS = new Set([
  'un',
  'unidade',
  'cx',
  'frasco',
  'ampola',
  'par',
  'pacote',
  'pct',
  'garrafa',
  'lata',
  'barra'
]);

const VALID_PAYMENT_METHODS = new Set([
  'pix',
  'credit_card',
  'debit_card',
  'cash',
  'bank_transfer',
  'other'
]);

function clinicTodayIso(): string {
  const now = new Date(Date.now() - 3 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

function toCents(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

function normalizePaymentMethod(method: unknown): string {
  const clean = String(method || 'pix').trim().toLowerCase();
  if (clean === 'dinheiro') return 'cash';
  return VALID_PAYMENT_METHODS.has(clean) ? clean : 'pix';
}

function resolvePaymentDateIso(rawDate: unknown): string {
  if (typeof rawDate === 'string' && rawDate.trim()) {
    const clean = rawDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
      return `${clean}T12:00:00.000Z`;
    }
    const parsed = new Date(clean);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

function findOpenCashRegisterId(tenantId: string): string | null {
  try {
    const row = db
      .prepare(`SELECT id FROM cash_registers WHERE tenant_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1`)
      .get(tenantId) as { id: string } | undefined;
    return row?.id || null;
  } catch {
    return null;
  }
}

export class StudentConsumptionService {
  private static assertStudioSupported(tenantId: string): void {
    const profile = getTenantEstablishmentProfile(tenantId);
    if (!supportsStudioFeatures(profile)) {
      throw Object.assign(
        new Error('Consumo dos Alunos está disponível apenas para estabelecimentos Studio ou Mistos.'),
        { status: 403, code: 'STUDIO_PROFILE_REQUIRED' }
      );
    }
  }

  static listSellableProducts(tenantId: string, search?: string): any[] {
    this.assertStudioSupported(tenantId);
    let sql = `
      SELECT
        id,
        tenant_id,
        name,
        category,
        brand,
        presentation,
        quantity,
        unit,
        COALESCE(NULLIF(TRIM(sale_unit), ''), unit, 'un') as sale_unit,
        COALESCE(sale_price, 0) as sale_price,
        unit_cost,
        min_stock,
        available_for_sale,
        active
      FROM inventory_items
      WHERE tenant_id = ?
        AND active = 1
        AND COALESCE(available_for_sale, 0) = 1
    `;
    const params: any[] = [tenantId];
    if (search && search.trim()) {
      const pattern = `%${search.trim()}%`;
      sql += ` AND (name LIKE ? OR brand LIKE ? OR category LIKE ?)`;
      params.push(pattern, pattern, pattern);
    }
    sql += ` ORDER BY name ASC`;
    return db.prepare(sql).all(...params) as any[];
  }

  static getConsumptionById(tenantId: string, id: string): any | null {
    const row = db
      .prepare(`
        SELECT
          sc.*,
          pat.full_name as patient_name,
          pat.phone as patient_phone,
          pat.whatsapp as patient_whatsapp,
          COALESCE(ii.quantity, 0) as current_stock_quantity,
          COALESCE(NULLIF(TRIM(ii.sale_unit), ''), ii.unit, sc.sale_unit_snapshot) as current_sale_unit
        FROM student_consumptions sc
        JOIN patients pat ON pat.id = sc.patient_id AND pat.tenant_id = sc.tenant_id
        LEFT JOIN inventory_items ii ON ii.id = sc.inventory_item_id AND ii.tenant_id = sc.tenant_id
        WHERE sc.id = ? AND sc.tenant_id = ?
      `)
      .get(id, tenantId) as any;
    return row || null;
  }

  static listConsumptions(
    tenantId: string,
    filters: {
      patientId?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    } = {}
  ): {
    consumptions: any[];
    summary: {
      totalPendingCents: number;
      totalPaidCents: number;
      totalCancelledCents: number;
      countPending: number;
      countPaid: number;
      countTotal: number;
    };
  } {
    this.assertStudioSupported(tenantId);

    let sql = `
      SELECT
        sc.*,
        pat.full_name as patient_name,
        pat.phone as patient_phone,
        pat.whatsapp as patient_whatsapp,
        COALESCE(ii.quantity, 0) as current_stock_quantity
      FROM student_consumptions sc
      JOIN patients pat ON pat.id = sc.patient_id AND pat.tenant_id = sc.tenant_id
      LEFT JOIN inventory_items ii ON ii.id = sc.inventory_item_id AND ii.tenant_id = sc.tenant_id
      WHERE sc.tenant_id = ?
    `;
    const params: any[] = [tenantId];

    if (filters.patientId) {
      sql += ` AND sc.patient_id = ?`;
      params.push(filters.patientId);
    }
    if (filters.status && filters.status !== 'all') {
      sql += ` AND sc.payment_status = ?`;
      params.push(filters.status);
    }
    if (filters.startDate) {
      sql += ` AND substr(COALESCE(sc.created_at, ''), 1, 10) >= ?`;
      params.push(filters.startDate.slice(0, 10));
    }
    if (filters.endDate) {
      sql += ` AND substr(COALESCE(sc.created_at, ''), 1, 10) <= ?`;
      params.push(filters.endDate.slice(0, 10));
    }
    if (filters.search && filters.search.trim()) {
      const pattern = `%${filters.search.trim()}%`;
      sql += ` AND (pat.full_name LIKE ? OR sc.product_name_snapshot LIKE ? OR COALESCE(sc.notes, '') LIKE ?)`;
      params.push(pattern, pattern, pattern);
    }

    sql += ` ORDER BY sc.created_at DESC LIMIT 500`;
    const consumptions = db.prepare(sql).all(...params) as any[];

    let totalPendingCents = 0;
    let totalPaidCents = 0;
    let totalCancelledCents = 0;
    let countPending = 0;
    let countPaid = 0;

    for (const c of consumptions) {
      const totalCents = Number(c.total_amount_cents) || 0;
      const paidCents = Number(c.paid_amount_cents) || 0;
      if (c.payment_status === 'pending' || c.payment_status === 'partial') {
        totalPendingCents += Math.max(0, totalCents - paidCents);
        countPending += 1;
      } else if (c.payment_status === 'paid') {
        totalPaidCents += totalCents;
        countPaid += 1;
      } else if (c.payment_status === 'cancelled' || c.payment_status === 'refunded') {
        totalCancelledCents += totalCents;
      }
    }

    return {
      consumptions,
      summary: {
        totalPendingCents,
        totalPaidCents,
        totalCancelledCents,
        countPending,
        countPaid,
        countTotal: consumptions.length
      }
    };
  }

  static getStudentSummary(tenantId: string, patientId: string): {
    patientId: string;
    consumptions: any[];
    pendingProductsCents: number;
    paidProductsCents: number;
    pendingTuitionsCents: number;
    consolidatedPendingCents: number;
  } {
    this.assertStudioSupported(tenantId);

    const pat = db
      .prepare(`SELECT id FROM patients WHERE id = ? AND tenant_id = ?`)
      .get(patientId, tenantId) as { id: string } | undefined;
    if (!pat) {
      throw Object.assign(new Error('Aluno não encontrado neste estabelecimento.'), { status: 404 });
    }

    const { consumptions, summary } = this.listConsumptions(tenantId, { patientId });

    // Resumo financeiro consolidado sem jamais alterar mensalidades/cobranças originais
    const tuitionRow = db
      .prepare(`
        SELECT COALESCE(SUM(ROUND(amount * 100)), 0) as pending_tuitions_cents
        FROM payments
        WHERE tenant_id = ?
          AND patient_id = ?
          AND status IN ('pending', 'partial')
          AND COALESCE(source_type, '') != 'student_consumption'
      `)
      .get(tenantId, patientId) as { pending_tuitions_cents?: number } | undefined;

    const pendingProductsCents = summary.totalPendingCents;
    const paidProductsCents = summary.totalPaidCents;
    const pendingTuitionsCents = Number(tuitionRow?.pending_tuitions_cents || 0);
    const consolidatedPendingCents = pendingTuitionsCents + pendingProductsCents;

    return {
      patientId,
      consumptions,
      pendingProductsCents,
      paidProductsCents,
      pendingTuitionsCents,
      consolidatedPendingCents
    };
  }

  static createConsumption(params: {
    tenantId: string;
    userId: string;
    userName?: string | null;
    canEditPrice: boolean;
    patientId: string;
    inventoryItemId: string;
    quantity: number;
    unitPrice?: number;
    paymentStatus: 'pending' | 'paid';
    paymentMethod?: string;
    paymentDate?: string;
    amountReceived?: number;
    notes?: string;
    idempotencyKey?: string;
  }): { consumption: any; idempotent: boolean } {
    this.assertStudioSupported(params.tenantId);

    const cleanIdemp =
      typeof params.idempotencyKey === 'string' && params.idempotencyKey.trim()
        ? params.idempotencyKey.trim().slice(0, 128)
        : null;

    return db.transaction(() => {
      if (cleanIdemp) {
        const existing = db
          .prepare(`SELECT id FROM student_consumptions WHERE tenant_id = ? AND idempotency_key = ?`)
          .get(params.tenantId, cleanIdemp) as { id: string } | undefined;
        if (existing) {
          return {
            consumption: this.getConsumptionById(params.tenantId, existing.id),
            idempotent: true
          };
        }
      }

      const student = db
        .prepare(`SELECT id, full_name FROM patients WHERE id = ? AND tenant_id = ?`)
        .get(params.patientId, params.tenantId) as { id: string; full_name: string } | undefined;
      if (!student) {
        throw Object.assign(new Error('Aluno não encontrado neste estabelecimento.'), { status: 404 });
      }

      const item = db
        .prepare(`
          SELECT
            id, name, quantity, unit,
            COALESCE(NULLIF(TRIM(sale_unit), ''), unit, 'un') as effective_sale_unit,
            COALESCE(sale_price, 0) as sale_price,
            COALESCE(available_for_sale, 0) as available_for_sale,
            active
          FROM inventory_items
          WHERE id = ? AND tenant_id = ?
        `)
        .get(params.inventoryItemId, params.tenantId) as any;

      if (!item || Number(item.active) !== 1) {
        throw Object.assign(new Error('Produto não encontrado ou inativo no estoque.'), { status: 404 });
      }

      if (Number(item.available_for_sale) !== 1) {
        throw Object.assign(
          new Error('Este item do estoque não está disponível para venda aos alunos.'),
          { status: 400, code: 'PRODUCT_NOT_SELLABLE' }
        );
      }

      const qtyRaw = Number(params.quantity);
      if (!Number.isFinite(qtyRaw) || qtyRaw <= 0) {
        throw Object.assign(new Error('Informe uma quantidade positiva válida.'), { status: 400 });
      }

      const saleUnit = String(item.effective_sale_unit || 'un').trim() || 'un';
      if (DISCRETE_SALE_UNITS.has(saleUnit.toLowerCase()) && !Number.isInteger(qtyRaw)) {
        throw Object.assign(
          new Error(`Para a unidade "${saleUnit}", informe uma quantidade inteira positiva.`),
          { status: 400, code: 'INVALID_QUANTITY_UNIT' }
        );
      }
      const qty = Math.round(qtyRaw * 10000) / 10000;

      const prevStock = Number(item.quantity) || 0;
      if (qty > prevStock) {
        throw Object.assign(
          new Error(`Estoque insuficiente para "${item.name}". Disponível: ${prevStock} ${saleUnit}.`),
          { status: 409, code: 'INSUFFICIENT_STOCK' }
        );
      }

      const catalogPriceCents = toCents(item.sale_price);
      let unitPriceCents = catalogPriceCents;
      if (params.unitPrice !== undefined && params.unitPrice !== null && String(params.unitPrice).trim() !== '') {
        const reqPriceCents = toCents(params.unitPrice);
        if (reqPriceCents !== catalogPriceCents && !params.canEditPrice) {
          throw Object.assign(
            new Error('Você não possui permissão para alterar o preço unitário do produto.'),
            { status: 403, code: 'PRICE_EDIT_FORBIDDEN' }
          );
        }
        unitPriceCents = reqPriceCents;
      }

      if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents <= 0) {
        throw Object.assign(
          new Error('Produto sem preço de venda válido configurado no Estoque de Insumos.'),
          { status: 400, code: 'INVALID_SALE_PRICE' }
        );
      }

      const totalAmountCents = Math.round(qty * unitPriceCents);
      if (!Number.isSafeInteger(totalAmountCents) || totalAmountCents <= 0) {
        throw Object.assign(new Error('Valor total do consumo inválido.'), { status: 400 });
      }

      const isPaid = params.paymentStatus === 'paid';
      const normalizedMethod = isPaid ? normalizePaymentMethod(params.paymentMethod) : 'pix';
      const resolvedPaymentDate = isPaid ? resolvePaymentDateIso(params.paymentDate) : null;
      const openRegisterId = isPaid ? findOpenCashRegisterId(params.tenantId) : null;
      const totalReais = Math.round(totalAmountCents) / 100;

      let amtTenderedVal: number | null = null;
      let changeAmtVal: number | null = null;
      if (isPaid && normalizedMethod === 'cash' && params.amountReceived !== undefined && params.amountReceived !== null && String(params.amountReceived).trim() !== '') {
        const received = Number(params.amountReceived);
        if (!Number.isFinite(received) || received < totalReais) {
          throw Object.assign(
            new Error('Valor recebido em dinheiro não pode ser inferior ao total da venda.'),
            { status: 400 }
          );
        }
        amtTenderedVal = Math.round(received * 100) / 100;
        changeAmtVal = Math.max(0, Math.round((amtTenderedVal - totalReais) * 100) / 100);
      }

      const consumptionId = 'cons-' + uuidv4().slice(0, 8);
      const paymentId = 'pay-' + uuidv4().slice(0, 8);
      const movementId = 'mov-' + uuidv4().slice(0, 8);
      const newStock = Math.max(0, Math.round((prevStock - qty) * 10000) / 10000);
      const cleanNotes = typeof params.notes === 'string' && params.notes.trim() ? params.notes.trim() : null;
      const paymentNote = `Consumo de produto: ${item.name} (${qty} ${saleUnit})${cleanNotes ? ` — ${cleanNotes}` : ''}`;

      // 1. Baixa no estoque (nunca negativo)
      db.prepare(`UPDATE inventory_items SET quantity = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`)
        .run(newStock, item.id, params.tenantId);

      // 2. Registro de movimentação de saída no estoque
      db.prepare(`
        INSERT INTO inventory_movements (
          id, tenant_id, item_id, movement_type, quantity, previous_quantity, new_quantity,
          reason, document_reference, user_id, patient_id, module_type, source_type, source_id, created_at
        )
        VALUES (?, ?, ?, 'out', ?, ?, ?, ?, ?, ?, ?, 'studio', 'student_consumption', ?, datetime('now'))
      `).run(
        movementId,
        params.tenantId,
        item.id,
        qty,
        prevStock,
        newStock,
        `Consumo do aluno: ${student.full_name} (${qty} ${saleUnit})`,
        consumptionId,
        params.userId,
        student.id,
        consumptionId
      );

      // 3. Lançamento financeiro separado em payments (sem alterar mensalidade/Asaas)
      db.prepare(`
        INSERT INTO payments (
          id, tenant_id, appointment_id, patient_id, service_id, amount,
          payment_method, status, payment_date, due_date, notes,
          cash_register_id, amount_tendered, change_amount, source_type, source_id, created_at
        )
        VALUES (?, ?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'student_consumption', ?, datetime('now'))
      `).run(
        paymentId,
        params.tenantId,
        student.id,
        totalReais,
        normalizedMethod,
        isPaid ? 'paid' : 'pending',
        resolvedPaymentDate,
        clinicTodayIso(),
        paymentNote,
        openRegisterId,
        amtTenderedVal,
        changeAmtVal,
        consumptionId
      );

      // 4. Registro completo do consumo
      db.prepare(`
        INSERT INTO student_consumptions (
          id, tenant_id, patient_id, inventory_item_id, product_name_snapshot, sale_unit_snapshot,
          quantity, unit_price_cents, total_amount_cents, paid_amount_cents,
          payment_id, inventory_movement_id, cash_register_id,
          payment_status, payment_method, payment_date, notes, idempotency_key,
          created_by_user_id, created_by_name, settled_by_user_id, settled_at,
          stock_reverted, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
      `).run(
        consumptionId,
        params.tenantId,
        student.id,
        item.id,
        item.name,
        saleUnit,
        qty,
        unitPriceCents,
        totalAmountCents,
        isPaid ? totalAmountCents : 0,
        paymentId,
        movementId,
        openRegisterId,
        isPaid ? 'paid' : 'pending',
        isPaid ? normalizedMethod : null,
        resolvedPaymentDate,
        cleanNotes,
        cleanIdemp,
        params.userId,
        params.userName || null,
        isPaid ? params.userId : null,
        resolvedPaymentDate
      );

      return {
        consumption: this.getConsumptionById(params.tenantId, consumptionId),
        idempotent: false
      };
    })();
  }

  static settleConsumption(params: {
    tenantId: string;
    consumptionId: string;
    userId: string;
    paymentMethod?: string;
    paymentDate?: string;
    notes?: string;
  }): any {
    this.assertStudioSupported(params.tenantId);

    return db.transaction(() => {
      const existing = db
        .prepare(`SELECT * FROM student_consumptions WHERE id = ? AND tenant_id = ?`)
        .get(params.consumptionId, params.tenantId) as any;

      if (!existing) {
        throw Object.assign(new Error('Lançamento de consumo não encontrado.'), { status: 404 });
      }
      if (existing.payment_status === 'paid') {
        throw Object.assign(new Error('Este consumo já foi quitado.'), { status: 409 });
      }
      if (existing.payment_status === 'cancelled' || existing.payment_status === 'refunded') {
        throw Object.assign(new Error('Não é possível quitar um consumo cancelado ou estornado.'), { status: 409 });
      }

      const method = normalizePaymentMethod(params.paymentMethod || existing.payment_method);
      const settledDate = resolvePaymentDateIso(params.paymentDate);
      const registerId = existing.cash_register_id || findOpenCashRegisterId(params.tenantId);
      const cleanNotes =
        typeof params.notes === 'string' && params.notes.trim() ? params.notes.trim() : existing.notes;

      if (existing.payment_id) {
        db.prepare(`
          UPDATE payments
          SET status = 'paid',
              payment_method = ?,
              payment_date = ?,
              cash_register_id = COALESCE(cash_register_id, ?),
              notes = CASE WHEN ? IS NOT NULL AND TRIM(?) != '' THEN notes || ' | Quitação: ' || TRIM(?) ELSE notes END
          WHERE id = ? AND tenant_id = ?
        `).run(
          method,
          settledDate,
          registerId,
          params.notes || null,
          params.notes || '',
          params.notes || '',
          existing.payment_id,
          params.tenantId
        );
      }

      db.prepare(`
        UPDATE student_consumptions
        SET payment_status = 'paid',
            paid_amount_cents = total_amount_cents,
            payment_method = ?,
            payment_date = ?,
            cash_register_id = COALESCE(cash_register_id, ?),
            settled_by_user_id = ?,
            settled_at = ?,
            notes = ?,
            updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(
        method,
        settledDate,
        registerId,
        params.userId,
        settledDate,
        cleanNotes,
        existing.id,
        params.tenantId
      );

      return this.getConsumptionById(params.tenantId, existing.id);
    })();
  }

  static cancelConsumption(params: {
    tenantId: string;
    consumptionId: string;
    userId: string;
    userName?: string | null;
    reason: string;
    revertStock?: boolean;
  }): any {
    this.assertStudioSupported(params.tenantId);

    const cleanReason = String(params.reason || '').trim();
    if (!cleanReason) {
      throw Object.assign(new Error('Informe o motivo do cancelamento ou estorno.'), { status: 400 });
    }

    const shouldRevert = params.revertStock !== false;

    return db.transaction(() => {
      const existing = db
        .prepare(`SELECT * FROM student_consumptions WHERE id = ? AND tenant_id = ?`)
        .get(params.consumptionId, params.tenantId) as any;

      if (!existing) {
        throw Object.assign(new Error('Lançamento de consumo não encontrado.'), { status: 404 });
      }
      if (existing.payment_status === 'cancelled' || existing.payment_status === 'refunded') {
        throw Object.assign(new Error('Este consumo já foi cancelado ou estornado.'), { status: 409 });
      }

      const wasPaid = existing.payment_status === 'paid' || existing.payment_status === 'partial';
      const nextStatus: 'refunded' | 'cancelled' = wasPaid ? 'refunded' : 'cancelled';

      if (existing.payment_id) {
        db.prepare(`
          UPDATE payments
          SET status = ?,
              notes = COALESCE(notes, '') || ?
          WHERE id = ? AND tenant_id = ?
        `).run(
          nextStatus,
          ` | ${wasPaid ? 'Estorno' : 'Cancelamento'}: ${cleanReason}`,
          existing.payment_id,
          params.tenantId
        );
      }

      // Se pago em dinheiro em caixa atualmente aberto, registra ESTORNO na gaveta
      if (wasPaid && existing.payment_method === 'cash') {
        const targetRegister = existing.cash_register_id
          ? (db
              .prepare(`SELECT id, status FROM cash_registers WHERE id = ? AND tenant_id = ?`)
              .get(existing.cash_register_id, params.tenantId) as { id: string; status: string } | undefined)
          : undefined;
        const activeRegId =
          targetRegister?.status === 'open' ? targetRegister.id : findOpenCashRegisterId(params.tenantId);
        if (activeRegId) {
          const refundReais = Math.round(Number(existing.paid_amount_cents || existing.total_amount_cents) || 0) / 100;
          if (refundReais > 0) {
            db.prepare(`
              INSERT INTO cash_register_movements (id, tenant_id, cash_register_id, type, amount, description, user_id, created_at)
              VALUES (?, ?, ?, 'ESTORNO', ?, ?, ?, datetime('now'))
            `).run(
              'crm-' + uuidv4().slice(0, 8),
              params.tenantId,
              activeRegId,
              refundReais,
              `Estorno consumo (${existing.product_name_snapshot}): ${cleanReason}`,
              params.userId
            );
          }
        }
      }

      // Reversão idempotente de estoque (máximo 1 vez)
      let reversalMovId: string | null = existing.reversal_inventory_movement_id || null;
      let stockRevertedFlag = Number(existing.stock_reverted) === 1 ? 1 : 0;

      if (shouldRevert && stockRevertedFlag === 0) {
        const item = db
          .prepare(`SELECT id, quantity, name FROM inventory_items WHERE id = ? AND tenant_id = ?`)
          .get(existing.inventory_item_id, params.tenantId) as any;

        if (item) {
          const prevQty = Number(item.quantity) || 0;
          const restoreQty = Number(existing.quantity) || 0;
          const newQty = Math.round((prevQty + restoreQty) * 10000) / 10000;

          db.prepare(`UPDATE inventory_items SET quantity = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`)
            .run(newQty, item.id, params.tenantId);

          reversalMovId = 'mov-' + uuidv4().slice(0, 8);
          db.prepare(`
            INSERT INTO inventory_movements (
              id, tenant_id, item_id, movement_type, quantity, previous_quantity, new_quantity,
              reason, document_reference, user_id, patient_id, module_type, source_type, source_id, created_at
            )
            VALUES (?, ?, ?, 'in', ?, ?, ?, ?, ?, ?, ?, 'studio', 'student_consumption_reversal', ?, datetime('now'))
          `).run(
            reversalMovId,
            params.tenantId,
            item.id,
            restoreQty,
            prevQty,
            newQty,
            `Estorno consumo (${existing.product_name_snapshot}): ${cleanReason}`,
            existing.id,
            params.userId,
            existing.patient_id,
            existing.id
          );
          stockRevertedFlag = 1;
        }
      }

      db.prepare(`
        UPDATE student_consumptions
        SET payment_status = ?,
            cancelled_by_user_id = ?,
            cancelled_by_name = ?,
            cancelled_at = datetime('now'),
            cancellation_reason = ?,
            stock_reverted = ?,
            reversal_inventory_movement_id = ?,
            updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(
        nextStatus,
        params.userId,
        params.userName || null,
        cleanReason,
        stockRevertedFlag,
        reversalMovId,
        existing.id,
        params.tenantId
      );

      return this.getConsumptionById(params.tenantId, existing.id);
    })();
  }

  /**
   * Mantém student_consumptions sincronizado quando o pagamento vinculado é quitado/cancelado diretamente
   * pela Central de Cobranças ou Lançamentos & Recebimentos. Nunca baixa estoque novamente.
   */
  static syncFromPaymentUpdate(
    tenantId: string,
    paymentId: string,
    nextPaymentStatus: string,
    paymentMethod?: string | null,
    userId?: string | null
  ): void {
    try {
      const existing = db
        .prepare(`SELECT id, payment_status, total_amount_cents FROM student_consumptions WHERE tenant_id = ? AND payment_id = ?`)
        .get(tenantId, paymentId) as any;
      if (!existing) return;

      if (nextPaymentStatus === 'paid' && existing.payment_status !== 'paid') {
        db.prepare(`
          UPDATE student_consumptions
          SET payment_status = 'paid',
              paid_amount_cents = total_amount_cents,
              payment_method = COALESCE(?, payment_method, 'pix'),
              payment_date = COALESCE(payment_date, datetime('now')),
              settled_by_user_id = COALESCE(settled_by_user_id, ?),
              settled_at = COALESCE(settled_at, datetime('now')),
              updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(paymentMethod || null, userId || null, existing.id, tenantId);
      } else if (
        (nextPaymentStatus === 'cancelled' || nextPaymentStatus === 'refunded') &&
        existing.payment_status !== 'cancelled' &&
        existing.payment_status !== 'refunded'
      ) {
        db.prepare(`
          UPDATE student_consumptions
          SET payment_status = ?,
              updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(nextPaymentStatus, existing.id, tenantId);
      }
    } catch (e) {
      console.warn('[StudentConsumptionService.syncFromPaymentUpdate] Aviso:', e);
    }
  }
}
