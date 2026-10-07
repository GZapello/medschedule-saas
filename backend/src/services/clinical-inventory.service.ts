import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export class ClinicalInventoryError extends Error {
  constructor(message: string, public status = 400, public field?: string) {
    super(message);
    this.name = 'ClinicalInventoryError';
  }
}

export interface ClinicalInventoryItem {
  id: string;
  tenant_id: string;
  name: string;
  category?: string | null;
  product_type?: string | null;
  brand?: string | null;
  presentation?: string | null;
  volume_ml?: number | null;
  quantity: number;
  unit: string;
  batch_number?: string | null;
  expiration_date?: string | null;
  unit_cost?: number;
  supplier?: string | null;
  min_stock?: number;
  notes?: string | null;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface QuickAddItemInput {
  name: string;
  category?: string;
  productType?: string;
  brand?: string;
  presentation?: string;
  volumeMl?: number;
  quantity: number;
  unit: string;
  batchNumber?: string;
  expirationDate?: string;
  unitCost?: number;
  supplier?: string;
  minStock?: number;
  notes?: string;
}

export interface DeductStockParams {
  itemId: string;
  quantity: number;
  professionalId: string;
  patientId?: string | null;
  appointmentId?: string | null;
  moduleType: string;
  sourceType: string;
  sourceId: string;
  reason?: string;
  unit?: string;
  batch?: string;
  userId?: string;
}

export interface RefundStockParams {
  itemId: string;
  quantity: number;
  professionalId?: string;
  patientId?: string | null;
  appointmentId?: string | null;
  moduleType?: string;
  sourceType?: string;
  sourceId?: string;
  reason?: string;
  batch?: string;
  userId?: string;
}

export interface AdjustStockParams {
  oldItemId: string;
  newItemId: string;
  oldQuantity: number;
  newQuantity: number;
  professionalId: string;
  patientId?: string | null;
  appointmentId?: string | null;
  moduleType: string;
  sourceType: string;
  sourceId: string;
  reason?: string;
  unit?: string;
  batch?: string;
  userId?: string;
}

export class ClinicalInventoryService {
  /**
   * Lista itens disponíveis no estoque central da clínica para uso clínico.
   */
  static listItems(
    tenantId: string,
    options: { search?: string; category?: string; activeOnly?: boolean } = {}
  ): ClinicalInventoryItem[] {
    const { search, category, activeOnly = true } = options;

    let query = `
      SELECT 
        id, tenant_id, name, category, product_type, brand, presentation, volume_ml,
        quantity, unit, batch_number, expiration_date, unit_cost, supplier, min_stock,
        notes, active, created_at, updated_at
      FROM inventory_items
      WHERE tenant_id = ?
    `;
    const params: any[] = [tenantId];

    if (activeOnly) {
      query += ' AND active = 1';
    }

    if (category && category !== 'TODOS') {
      query += ' AND category = ?';
      params.push(category);
    }

    if (search && search.trim()) {
      const pattern = `%${search.trim()}%`;
      query += ' AND (name LIKE ? OR brand LIKE ? OR batch_number LIKE ? OR category LIKE ?)';
      params.push(pattern, pattern, pattern, pattern);
    }

    query += ' ORDER BY name ASC';

    return db.prepare(query).all(...params) as ClinicalInventoryItem[];
  }

  /**
   * Obtém detalhes de um item específico no estoque central da clínica.
   */
  static getItem(tenantId: string, itemId: string, allowInactive = false): ClinicalInventoryItem | null {
    let query = 'SELECT * FROM inventory_items WHERE id = ? AND tenant_id = ?';
    if (!allowInactive) {
      query += ' AND active = 1';
    }
    const item = db.prepare(query).get(itemId, tenantId) as ClinicalInventoryItem | undefined;
    return item || null;
  }

  /**
   * Cadastro rápido de novo produto/insumo diretamente do fluxo de atendimento clínico.
   */
  static quickAddItem(
    tenantId: string,
    data: QuickAddItemInput,
    userId?: string
  ): ClinicalInventoryItem {
    if (!data.name || !data.name.trim()) {
      throw new ClinicalInventoryError('Nome do produto/insumo é obrigatório.', 400, 'name');
    }
    const initialQty = Number(data.quantity);
    if (isNaN(initialQty) || initialQty < 0) {
      throw new ClinicalInventoryError('A quantidade inicial deve ser maior ou igual a zero.', 400, 'quantity');
    }
    const unit = (data.unit && data.unit.trim()) || 'un';

    const itemId = 'inv-' + uuidv4().slice(0, 8);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO inventory_items (
        id, tenant_id, name, category, product_type, brand, presentation, volume_ml,
        quantity, unit, batch_number, expiration_date, unit_cost, supplier, min_stock,
        notes, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `).run(
      itemId,
      tenantId,
      data.name.trim(),
      data.category?.trim() || null,
      data.productType?.trim() || null,
      data.brand?.trim() || null,
      data.presentation?.trim() || 'unidade',
      data.volumeMl !== undefined ? Number(data.volumeMl) : null,
      initialQty,
      unit,
      data.batchNumber?.trim() || null,
      data.expirationDate?.trim() || null,
      data.unitCost !== undefined ? Number(data.unitCost) : 0,
      data.supplier?.trim() || null,
      data.minStock !== undefined ? Number(data.minStock) : 5,
      data.notes?.trim() || 'Cadastro rápido via atendimento clínico'
    );

    if (initialQty > 0) {
      const movementId = 'mov-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO inventory_movements (
          id, tenant_id, item_id, movement_type, quantity, previous_quantity, new_quantity,
          reason, document_reference, user_id, module_type, source_type, source_id, batch, created_at
        ) VALUES (?, ?, ?, 'in', ?, 0, ?, 'Saldo inicial no cadastro rápido clínico', ?, ?, 'ZemdaClinical', 'quick_add', ?, ?, datetime('now'))
      `).run(
        movementId,
        tenantId,
        itemId,
        initialQty,
        initialQty,
        itemId,
        userId || null,
        itemId,
        data.batchNumber?.trim() || null
      );
    }

    const created = this.getItem(tenantId, itemId, true);
    if (!created) {
      throw new ClinicalInventoryError('Erro ao recuperar item cadastrado.', 500);
    }
    return created;
  }

  /**
   * Registra a saída/baixa de estoque vinculada a um atendimento ou procedimento clínico.
   * Totalmente atômica e com validação de saldo e integridade.
   */
  static deductStock(tenantId: string, params: DeductStockParams) {
    const {
      itemId,
      quantity,
      professionalId,
      patientId,
      appointmentId,
      moduleType,
      sourceType,
      sourceId,
      reason,
      unit,
      batch,
      userId
    } = params;

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      throw new ClinicalInventoryError('Informe uma quantidade válida maior que zero para baixa de estoque.', 400, 'quantity');
    }

    // Proteção contra duplo clique e idempotência
    if (sourceType && sourceId) {
      const existingMov = db.prepare(`
        SELECT id, previous_quantity, new_quantity FROM inventory_movements 
        WHERE tenant_id = ? AND source_type = ? AND source_id = ? AND movement_type = 'out'
        LIMIT 1
      `).get(tenantId, sourceType, sourceId) as any;

      if (existingMov) {
        return {
          success: true,
          movementId: existingMov.id,
          previousQuantity: existingMov.previous_quantity,
          newQuantity: existingMov.new_quantity,
          alreadyRecorded: true
        };
      }
    }

    const item = db.prepare('SELECT * FROM inventory_items WHERE id = ? AND tenant_id = ? AND active = 1').get(itemId, tenantId) as ClinicalInventoryItem | undefined;
    if (!item) {
      throw new ClinicalInventoryError('Produto ou insumo não encontrado ou inativo no estoque desta clínica.', 404, 'productId');
    }

    if (unit && unit !== item.unit) {
      throw new ClinicalInventoryError(`Utilize a unidade cadastrada no estoque: ${item.unit}.`, 400, 'unit');
    }

    if (batch && item.batch_number && batch !== item.batch_number) {
      throw new ClinicalInventoryError(`O lote informado (${batch}) não corresponde ao produto selecionado (${item.batch_number}).`, 400, 'batch');
    }

    const currentQty = Number(item.quantity) || 0;
    if (currentQty < qty) {
      throw new ClinicalInventoryError(
        `Estoque insuficiente para esta quantidade. Saldo atual: ${currentQty} ${item.unit}.`,
        400,
        'quantity'
      );
    }

    const nextQty = currentQty - qty;

    // Atualiza saldo central do item
    db.prepare("UPDATE inventory_items SET quantity = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?")
      .run(nextQty, item.id, tenantId);

    // Registra movimentação no histórico central
    const movementId = 'mov-' + uuidv4().slice(0, 8);
    const movReason = reason || `Uso clínico: ${moduleType || 'Atendimento'}`;

    db.prepare(`
      INSERT INTO inventory_movements (
        id, tenant_id, item_id, movement_type, quantity, previous_quantity, new_quantity,
        reason, document_reference, user_id, professional_id, patient_id, appointment_id,
        module_type, source_type, source_id, batch, created_at
      ) VALUES (?, ?, ?, 'out', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      movementId,
      tenantId,
      item.id,
      qty,
      currentQty,
      nextQty,
      movReason,
      sourceId || appointmentId || null,
      userId || null,
      professionalId || null,
      patientId || null,
      appointmentId || null,
      moduleType,
      sourceType,
      sourceId,
      batch || item.batch_number || null
    );

    return {
      success: true,
      movementId,
      previousQuantity: currentQty,
      newQuantity: nextQty,
      item: { ...item, quantity: nextQty }
    };
  }

  /**
   * Realiza estorno (devolução) de estoque por exclusão ou cancelamento de procedimento.
   * Localiza o item mesmo se desativado (active = 0) para integridade da clínica.
   */
  static refundStock(tenantId: string, params: RefundStockParams) {
    const {
      itemId,
      quantity,
      professionalId,
      patientId,
      appointmentId,
      moduleType,
      sourceType,
      sourceId,
      reason,
      batch,
      userId
    } = params;

    const qty = Math.abs(Number(quantity));
    if (isNaN(qty) || qty <= 0) return { success: true, message: 'Nenhuma quantidade a estornar.' };

    // Idempotência de estorno: evita estornar a mesma exclusão mais de uma vez
    if (sourceType && sourceId) {
      const existingRefund = db.prepare(`
        SELECT id FROM inventory_movements 
        WHERE tenant_id = ? AND source_type = ? AND source_id = ? AND movement_type = 'in' AND reason LIKE '%Estorno%'
        LIMIT 1
      `).get(tenantId, sourceType, sourceId) as any;

      if (existingRefund) {
        return { success: true, movementId: existingRefund.id, alreadyRefunded: true };
      }
    }

    const item = db.prepare('SELECT * FROM inventory_items WHERE id = ? AND tenant_id = ?').get(itemId, tenantId) as ClinicalInventoryItem | undefined;
    if (!item) {
      throw new ClinicalInventoryError('Item de estoque não encontrado nesta clínica para estorno.', 404, 'productId');
    }

    const currentQty = Number(item.quantity) || 0;
    const nextQty = currentQty + qty;

    db.prepare("UPDATE inventory_items SET quantity = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?")
      .run(nextQty, item.id, tenantId);

    const movementId = 'mov-' + uuidv4().slice(0, 8);
    const refundReason = reason || `Estorno clínico: exclusão de procedimento (${moduleType || ''})`;

    db.prepare(`
      INSERT INTO inventory_movements (
        id, tenant_id, item_id, movement_type, quantity, previous_quantity, new_quantity,
        reason, document_reference, user_id, professional_id, patient_id, appointment_id,
        module_type, source_type, source_id, batch, created_at
      ) VALUES (?, ?, ?, 'in', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      movementId,
      tenantId,
      item.id,
      qty,
      currentQty,
      nextQty,
      refundReason,
      sourceId || appointmentId || null,
      userId || null,
      professionalId || null,
      patientId || null,
      appointmentId || null,
      moduleType || null,
      sourceType || null,
      sourceId || null,
      batch || item.batch_number || null
    );

    return {
      success: true,
      movementId,
      previousQuantity: currentQty,
      newQuantity: nextQty,
      item: { ...item, quantity: nextQty }
    };
  }

  /**
   * Ajusta saldo de estoque quando um procedimento clínico tem sua quantidade ou produto alterados.
   */
  static adjustStock(tenantId: string, params: AdjustStockParams) {
    const {
      oldItemId,
      newItemId,
      oldQuantity,
      newQuantity,
      professionalId,
      patientId,
      appointmentId,
      moduleType,
      sourceType,
      sourceId,
      reason,
      unit,
      batch,
      userId
    } = params;

    const oldQty = Math.max(0, Number(oldQuantity) || 0);
    const newQty = Math.max(0, Number(newQuantity) || 0);

    // Se o produto mudou: estorna o antigo e dá baixa no novo
    if (oldItemId !== newItemId) {
      if (oldItemId && oldQty > 0) {
        this.refundStock(tenantId, {
          itemId: oldItemId,
          quantity: oldQty,
          professionalId,
          patientId,
          appointmentId,
          moduleType,
          sourceType,
          sourceId,
          reason: `Ajuste clínico: troca de produto (devolução)`,
          batch,
          userId
        });
      }
      if (newItemId && newQty > 0) {
        const item = db.prepare('SELECT * FROM inventory_items WHERE id = ? AND tenant_id = ? AND active = 1').get(newItemId, tenantId) as ClinicalInventoryItem | undefined;
        if (!item) {
          throw new ClinicalInventoryError('Produto ou insumo não encontrado ou inativo no estoque.', 404, 'productId');
        }
        if (Number(item.quantity) < newQty) {
          throw new ClinicalInventoryError(
            `Estoque insuficiente para troca de produto. Saldo disponível: ${item.quantity} ${item.unit}.`,
            400,
            'quantity'
          );
        }
        const prevQty = Number(item.quantity);
        const nextQty = prevQty - newQty;

        db.prepare("UPDATE inventory_items SET quantity = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?")
          .run(nextQty, item.id, tenantId);

        const movementId = 'mov-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO inventory_movements (
            id, tenant_id, item_id, movement_type, quantity, previous_quantity, new_quantity,
            reason, document_reference, user_id, professional_id, patient_id, appointment_id,
            module_type, source_type, source_id, batch, created_at
          ) VALUES (?, ?, ?, 'out', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          movementId,
          tenantId,
          item.id,
          newQty,
          prevQty,
          nextQty,
          reason || `Ajuste clínico: troca de produto (nova baixa de ${newQty} ${item.unit})`,
          sourceId || null,
          userId || null,
          professionalId,
          patientId || null,
          appointmentId || null,
          moduleType,
          sourceType,
          sourceId,
          batch || item.batch_number || null
        );

        return { success: true, movementId, previousQuantity: prevQty, newQuantity: nextQty };
      }
      return { success: true };
    }

    // Mesmo produto: verifica a diferença de quantidade
    if (newQty === oldQty) {
      return { success: true };
    }

    if (newQty > oldQty) {
      // Precisa baixar mais
      const diff = newQty - oldQty;
      const item = db.prepare('SELECT * FROM inventory_items WHERE id = ? AND tenant_id = ? AND active = 1').get(newItemId, tenantId) as ClinicalInventoryItem | undefined;
      if (!item) {
        throw new ClinicalInventoryError('Produto ou insumo não encontrado ou inativo no estoque.', 404, 'productId');
      }
      if (Number(item.quantity) < diff) {
        throw new ClinicalInventoryError(
          `Estoque insuficiente para o aumento de quantidade. Saldo adicional necessário: ${diff} ${item.unit}, saldo disponível: ${item.quantity} ${item.unit}.`,
          400,
          'quantity'
        );
      }
      const prevQty = Number(item.quantity);
      const nextQty = prevQty - diff;

      db.prepare("UPDATE inventory_items SET quantity = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?")
        .run(nextQty, item.id, tenantId);

      const movementId = 'mov-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO inventory_movements (
          id, tenant_id, item_id, movement_type, quantity, previous_quantity, new_quantity,
          reason, document_reference, user_id, professional_id, patient_id, appointment_id,
          module_type, source_type, source_id, batch, created_at
        ) VALUES (?, ?, ?, 'out', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        movementId,
        tenantId,
        item.id,
        diff,
        prevQty,
        nextQty,
        reason || `Ajuste clínico de quantidade (+${diff} ${item.unit})`,
        sourceId || null,
        userId || null,
        professionalId,
        patientId || null,
        appointmentId || null,
        moduleType,
        sourceType,
        sourceId,
        batch || item.batch_number || null
      );

      return { success: true, movementId, previousQuantity: prevQty, newQuantity: nextQty };
    } else {
      // newQty < oldQty -> devolve a diferença
      const diff = oldQty - newQty;
      const item = db.prepare('SELECT * FROM inventory_items WHERE id = ? AND tenant_id = ?').get(newItemId, tenantId) as ClinicalInventoryItem | undefined;
      if (!item) {
        throw new ClinicalInventoryError('Item de estoque não encontrado nesta clínica.', 404, 'productId');
      }
      const prevQty = Number(item.quantity);
      const nextQty = prevQty + diff;

      db.prepare("UPDATE inventory_items SET quantity = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?")
        .run(nextQty, item.id, tenantId);

      const movementId = 'mov-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO inventory_movements (
          id, tenant_id, item_id, movement_type, quantity, previous_quantity, new_quantity,
          reason, document_reference, user_id, professional_id, patient_id, appointment_id,
          module_type, source_type, source_id, batch, created_at
        ) VALUES (?, ?, ?, 'in', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        movementId,
        tenantId,
        item.id,
        diff,
        prevQty,
        nextQty,
        reason || `Ajuste clínico de quantidade (devolução -${diff} ${item.unit})`,
        sourceId || null,
        userId || null,
        professionalId,
        patientId || null,
        appointmentId || null,
        moduleType,
        sourceType,
        sourceId,
        batch || item.batch_number || null
      );

      return { success: true, movementId, previousQuantity: prevQty, newQuantity: nextQty };
    }
  }

  /**
   * Consulta movimentações associadas a um atendimento, paciente ou procedimento.
   */
  static getMovements(tenantId: string, filter: { appointmentId?: string; patientId?: string; sourceId?: string }) {
    let query = `
      SELECT m.*, i.name as item_name, i.unit as item_unit, i.brand as item_brand
      FROM inventory_movements m
      LEFT JOIN inventory_items i ON i.id = m.item_id AND i.tenant_id = m.tenant_id
      WHERE m.tenant_id = ?
    `;
    const params: any[] = [tenantId];

    if (filter.appointmentId) {
      query += ' AND m.appointment_id = ?';
      params.push(filter.appointmentId);
    }
    if (filter.patientId) {
      query += ' AND m.patient_id = ?';
      params.push(filter.patientId);
    }
    if (filter.sourceId) {
      query += ' AND m.source_id = ?';
      params.push(filter.sourceId);
    }

    query += ' ORDER BY m.created_at DESC';
    return db.prepare(query).all(...params) as any[];
  }
}
