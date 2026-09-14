import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';

export class InventoryController {
  // Lista itens de estoque com status de alertas (baixo, zerado, validade próxima)
  static list(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const { category, search, filterAlert } = req.query;

      let query = `
        SELECT 
          id, tenant_id, name, category, product_type, brand, presentation, volume_ml,
          quantity, unit, batch_number, expiration_date, unit_cost, supplier, min_stock,
          notes, active, created_at, updated_at
        FROM inventory_items
        WHERE tenant_id = ? AND active = 1
      `;
      const params: any[] = [tenantId];

      if (category) {
        query += ' AND category = ?';
        params.push(category);
      }
      if (search) {
        query += ' AND (name LIKE ? OR brand LIKE ? OR supplier LIKE ? OR batch_number LIKE ?)';
        const pattern = `%${search}%`;
        params.push(pattern, pattern, pattern, pattern);
      }

      query += ' ORDER BY name ASC';

      const items = db.prepare(query).all(...params) as any[];

      const now = new Date();
      const in30Days = new Date();
      in30Days.setDate(in30Days.getDate() + 30);
      const in30DaysStr = in30Days.toISOString().split('T')[0];
      const todayStr = now.toISOString().split('T')[0];

      let lowStockCount = 0;
      let zeroStockCount = 0;
      let expiringSoonCount = 0;

      const processedItems = items.map(item => {
        const isZero = item.quantity <= 0;
        const isLow = !isZero && item.quantity <= (item.min_stock || 5);
        const isExpiring = item.expiration_date && item.expiration_date <= in30DaysStr && item.expiration_date >= todayStr;
        const isExpired = item.expiration_date && item.expiration_date < todayStr;

        if (isZero) zeroStockCount++;
        if (isLow) lowStockCount++;
        if (isExpiring || isExpired) expiringSoonCount++;

        return {
          ...item,
          is_zero_stock: isZero,
          is_low_stock: isLow,
          is_expiring_soon: Boolean(isExpiring),
          is_expired: Boolean(isExpired)
        };
      });

      // Filtro específico por alerta
      let filtered = processedItems;
      if (filterAlert === 'low') {
        filtered = processedItems.filter(i => i.is_low_stock);
      } else if (filterAlert === 'zero') {
        filtered = processedItems.filter(i => i.is_zero_stock);
      } else if (filterAlert === 'expiring') {
        filtered = processedItems.filter(i => i.is_expiring_soon || i.is_expired);
      }

      res.json({
        totalItems: items.length,
        metrics: {
          total: items.length,
          lowStock: lowStockCount,
          zeroStock: zeroStockCount,
          expiringSoon: expiringSoonCount
        },
        items: filtered
      });
    } catch (err: any) {
      console.error('[InventoryController.list] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar estoque' });
    }
  }

  // Criação de item
  static createItem(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const {
        name, category, productType, brand, presentation, volumeMl,
        quantity, unit, batchNumber, expirationDate, unitCost, supplier, minStock, notes
      } = req.body;

      if (!name) {
        res.status(400).json({ error: 'Nome do item/produto é obrigatório' });
        return;
      }

      const itemId = 'inv-' + uuidv4().slice(0, 8);
      const initialQty = Number(quantity) || 0;

      db.prepare(`
        INSERT INTO inventory_items (
          id, tenant_id, name, category, product_type, brand, presentation, volume_ml,
          quantity, unit, batch_number, expiration_date, unit_cost, supplier, min_stock,
          notes, active, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
      `).run(
        itemId,
        tenantId,
        name.trim(),
        category || null,
        productType || null,
        brand || null,
        presentation || 'unidade',
        volumeMl !== undefined ? Number(volumeMl) : null,
        initialQty,
        unit || 'un',
        batchNumber || null,
        expirationDate || null,
        unitCost !== undefined ? Number(unitCost) : 0,
        supplier || null,
        minStock !== undefined ? Number(minStock) : 5,
        notes || null
      );

      // Se cadastrou com quantidade inicial maior que zero, registra movimentação inicial
      if (initialQty > 0) {
        db.prepare(`
          INSERT INTO inventory_movements (
            id, tenant_id, item_id, movement_type, quantity, previous_quantity, new_quantity,
            reason, user_id, created_at
          )
          VALUES (?, ?, ?, 'in', ?, 0, ?, 'Saldo inicial no cadastro', ?, datetime('now'))
        `).run('mov-' + uuidv4().slice(0, 8), tenantId, itemId, initialQty, initialQty, req.user?.userId || null);
      }

      logAudit(req, 'CREATE_INVENTORY_ITEM', 'inventory_items', itemId, { name, initialQty });
      res.status(201).json({ id: itemId, message: 'Item cadastrado no estoque com sucesso' });
    } catch (err: any) {
      console.error('[InventoryController.createItem] Erro:', err);
      res.status(500).json({ error: 'Erro ao cadastrar item de estoque' });
    }
  }

  // Atualização cadastral do item
  static updateItem(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const {
        name, category, productType, brand, presentation, volumeMl,
        unit, batchNumber, expirationDate, unitCost, supplier, minStock, notes
      } = req.body;

      db.prepare(`
        UPDATE inventory_items SET
          name = COALESCE(?, name),
          category = COALESCE(?, category),
          product_type = COALESCE(?, product_type),
          brand = COALESCE(?, brand),
          presentation = COALESCE(?, presentation),
          volume_ml = COALESCE(?, volume_ml),
          unit = COALESCE(?, unit),
          batch_number = COALESCE(?, batch_number),
          expiration_date = COALESCE(?, expiration_date),
          unit_cost = COALESCE(?, unit_cost),
          supplier = COALESCE(?, supplier),
          min_stock = COALESCE(?, min_stock),
          notes = COALESCE(?, notes),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(
        name || null,
        category || null,
        productType || null,
        brand || null,
        presentation || null,
        volumeMl !== undefined ? Number(volumeMl) : null,
        unit || null,
        batchNumber || null,
        expirationDate || null,
        unitCost !== undefined ? Number(unitCost) : null,
        supplier || null,
        minStock !== undefined ? Number(minStock) : null,
        notes !== undefined ? notes : null,
        id,
        tenantId
      );

      logAudit(req, 'UPDATE_INVENTORY_ITEM', 'inventory_items', id);
      res.json({ message: 'Item atualizado com sucesso' });
    } catch (err: any) {
      console.error('[InventoryController.updateItem] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar item de estoque' });
    }
  }

  // Lançar movimentação de estoque (entrada, saída ou ajuste)
  static recordMovement(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { itemId, movementType, quantity, reason, documentReference } = req.body;

      if (!itemId || !movementType || !quantity) {
        res.status(400).json({ error: 'Item, tipo de movimentação e quantidade são obrigatórios' });
        return;
      }

      const item = db.prepare('SELECT id, quantity, name FROM inventory_items WHERE id = ? AND tenant_id = ?').get(itemId, tenantId) as any;
      if (!item) {
        res.status(404).json({ error: 'Item de estoque não encontrado' });
        return;
      }

      const qty = Math.abs(Number(quantity));
      const prevQty = Number(item.quantity) || 0;
      let newQty = prevQty;

      if (movementType === 'in') {
        newQty = prevQty + qty;
      } else if (movementType === 'out') {
        newQty = Math.max(0, prevQty - qty);
      } else if (movementType === 'adjustment') {
        newQty = qty; // No ajuste, define o novo saldo real apurado
      } else {
        res.status(400).json({ error: 'Tipo de movimentação inválido (deve ser: in, out ou adjustment)' });
        return;
      }

      // Atualiza saldo do item
      db.prepare('UPDATE inventory_items SET quantity = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newQty, itemId);

      // Registra no histórico de movimentações
      const movementId = 'mov-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO inventory_movements (
          id, tenant_id, item_id, movement_type, quantity, previous_quantity, new_quantity,
          reason, document_reference, user_id, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        movementId,
        tenantId,
        itemId,
        movementType,
        qty,
        prevQty,
        newQty,
        reason || null,
        documentReference || null,
        req.user?.userId || null
      );

      logAudit(req, 'INVENTORY_MOVEMENT', 'inventory_movements', movementId, {
        itemName: item.name,
        movementType,
        qty,
        newQty
      });

      res.status(201).json({
        id: movementId,
        message: 'Movimentação registrada com sucesso',
        newQuantity: newQty
      });
    } catch (err: any) {
      console.error('[InventoryController.recordMovement] Erro:', err);
      res.status(500).json({ error: 'Erro ao registrar movimentação de estoque' });
    }
  }

  // Histórico de movimentações
  static listMovements(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { itemId } = req.query;

      let query = `
        SELECT 
          m.id, m.tenant_id, m.item_id, m.movement_type, m.quantity, m.previous_quantity,
          m.new_quantity, m.reason, m.document_reference, m.created_at,
          i.name as item_name, i.unit,
          u.name as user_name
        FROM inventory_movements m
        JOIN inventory_items i ON i.id = m.item_id
        LEFT JOIN users u ON u.id = m.user_id
        WHERE m.tenant_id = ?
      `;
      const params: any[] = [tenantId];

      if (itemId) {
        query += ' AND m.item_id = ?';
        params.push(itemId);
      }

      query += ' ORDER BY m.created_at DESC LIMIT 150';

      const movements = db.prepare(query).all(...params);
      res.json(movements);
    } catch (err: any) {
      console.error('[InventoryController.listMovements] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar movimentações' });
    }
  }
}
