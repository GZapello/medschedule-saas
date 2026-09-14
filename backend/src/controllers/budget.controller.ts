import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';

export class BudgetController {
  // Lista orçamentos por tipo ('patient' ou 'supplier')
  static list(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const { budgetType, status, search } = req.query;

      let query = `
        SELECT 
          b.id, b.tenant_id, b.budget_type, b.budget_number, b.patient_id,
          b.supplier_name, b.supplier_contact, b.discount, b.total_amount,
          b.validity_date, b.delivery_deadline, b.status, b.notes,
          b.converted_to_inventory, b.created_at, b.updated_at,
          p.full_name as patient_name, p.phone as patient_phone, p.cpf as patient_cpf
        FROM budgets b
        LEFT JOIN patients p ON p.id = b.patient_id
        WHERE b.tenant_id = ?
      `;
      const params: any[] = [tenantId];

      if (budgetType) {
        query += ' AND b.budget_type = ?';
        params.push(budgetType);
      }
      if (status) {
        query += ' AND b.status = ?';
        params.push(status);
      }
      if (search) {
        query += ' AND (b.budget_number LIKE ? OR b.supplier_name LIKE ? OR p.full_name LIKE ?)';
        const pattern = `%${search}%`;
        params.push(pattern, pattern, pattern);
      }

      query += ' ORDER BY b.created_at DESC';

      const budgets = db.prepare(query).all(...params);
      res.json(budgets);
    } catch (err: any) {
      console.error('[BudgetController.list] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar orçamentos' });
    }
  }

  // Detalhes do orçamento com seus itens e dados da clínica para impressão/PDF
  static getById(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      const budget = db.prepare(`
        SELECT 
          b.id, b.tenant_id, b.budget_type, b.budget_number, b.patient_id,
          b.supplier_name, b.supplier_contact, b.discount, b.total_amount,
          b.validity_date, b.delivery_deadline, b.status, b.notes,
          b.converted_to_inventory, b.created_at, b.updated_at,
          p.full_name as patient_name, p.phone as patient_phone, p.email as patient_email, p.cpf as patient_cpf
        FROM budgets b
        LEFT JOIN patients p ON p.id = b.patient_id
        WHERE b.id = ? AND b.tenant_id = ?
      `).get(id, tenantId) as any;

      if (!budget) {
        res.status(404).json({ error: 'Orçamento não encontrado' });
        return;
      }

      const items = db.prepare(`
        SELECT id, budget_id, item_type, reference_id, description, quantity, unit_price, total_price
        FROM budget_items
        WHERE budget_id = ?
        ORDER BY id ASC
      `).all(id);

      // Dados cadastrais da clínica para cabeçalho de impressão
      const tenant = db.prepare(`
        SELECT id, name, trade_name, corporate_name, cnpj_cpf, phone, email, logo_url,
               address, street, number, neighborhood, city, state, zip_code
        FROM tenants WHERE id = ?
      `).get(tenantId);

      res.json({ budget, items, tenant });
    } catch (err: any) {
      console.error('[BudgetController.getById] Erro:', err);
      res.status(500).json({ error: 'Erro ao obter orçamento' });
    }
  }

  // Criar orçamento (Paciente ou Insumo)
  static create(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const {
        budgetType, patientId, supplierName, supplierContact, discount,
        validityDate, deliveryDeadline, notes, items
      } = req.body;

      if (!budgetType || !['patient', 'supplier'].includes(budgetType)) {
        res.status(400).json({ error: 'Tipo de orçamento inválido (patient ou supplier)' });
        return;
      }

      if (budgetType === 'patient' && !patientId) {
        res.status(400).json({ error: 'Paciente é obrigatório para orçamento de paciente' });
        return;
      }

      if (budgetType === 'supplier' && !supplierName) {
        res.status(400).json({ error: 'Fornecedor é obrigatório para orçamento de insumos' });
        return;
      }

      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: 'O orçamento deve conter pelo menos um item' });
        return;
      }

      // Calcula totais
      let subtotal = 0;
      for (const item of items) {
        const qty = Number(item.quantity) || 1;
        const price = Number(item.unitPrice) || 0;
        subtotal += qty * price;
      }
      const disc = Math.max(0, Number(discount) || 0);
      const totalAmount = Math.max(0, subtotal - disc);

      const budgetId = 'bdg-' + uuidv4().slice(0, 8);
      const year = new Date().getFullYear();
      const countRow = db.prepare("SELECT count(*) as count FROM budgets WHERE tenant_id = ?").get(tenantId) as { count: number };
      const budgetNumber = `ORC-${year}-${String(countRow.count + 1).padStart(4, '0')}`;

      db.prepare(`
        INSERT INTO budgets (
          id, tenant_id, budget_type, budget_number, patient_id,
          supplier_name, supplier_contact, discount, total_amount,
          validity_date, delivery_deadline, status, notes,
          converted_to_inventory, created_by, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, 0, ?, datetime('now'), datetime('now'))
      `).run(
        budgetId,
        tenantId,
        budgetType,
        budgetNumber,
        patientId || null,
        supplierName ? supplierName.trim() : null,
        supplierContact ? supplierContact.trim() : null,
        disc,
        totalAmount,
        validityDate || null,
        deliveryDeadline || null,
        notes || null,
        req.user?.userId || null
      );

      const insertItemStmt = db.prepare(`
        INSERT INTO budget_items (
          id, tenant_id, budget_id, item_type, reference_id, description, quantity, unit_price, total_price
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of items) {
        const qty = Number(item.quantity) || 1;
        const price = Number(item.unitPrice) || 0;
        const itemTotal = qty * price;
        insertItemStmt.run(
          'bdi-' + uuidv4().slice(0, 8),
          tenantId,
          budgetId,
          item.itemType || 'service',
          item.referenceId || null,
          item.description || 'Procedimento',
          qty,
          price,
          itemTotal
        );
      }

      logAudit(req, 'CREATE_BUDGET', 'budgets', budgetId, { budgetNumber, totalAmount, budgetType });

      res.status(201).json({
        id: budgetId,
        budgetNumber,
        totalAmount,
        message: 'Orçamento gerado com sucesso'
      });
    } catch (err: any) {
      console.error('[BudgetController.create] Erro:', err);
      res.status(500).json({ error: 'Erro ao criar orçamento' });
    }
  }

  // Atualizar status do orçamento (draft, sent, approved, rejected, expired)
  static updateStatus(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const { status } = req.body;

      const allowed = ['draft', 'sent', 'approved', 'rejected', 'expired'];
      if (!allowed.includes(status)) {
        res.status(400).json({ error: `Status inválido. Permitidos: ${allowed.join(', ')}` });
        return;
      }

      db.prepare(`
        UPDATE budgets SET status = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?
      `).run(status, id, tenantId);

      logAudit(req, 'UPDATE_BUDGET_STATUS', 'budgets', id, { status });
      res.json({ message: 'Status do orçamento atualizado com sucesso', status });
    } catch (err: any) {
      console.error('[BudgetController.updateStatus] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar status do orçamento' });
    }
  }

  // Transformar orçamento aprovado de insumos em entrada de estoque (1-clique sem digitação duplicada)
  static convertToInventory(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      const budget = db.prepare(`
        SELECT id, budget_type, budget_number, status, converted_to_inventory, supplier_name
        FROM budgets WHERE id = ? AND tenant_id = ?
      `).get(id, tenantId) as any;

      if (!budget) {
        res.status(404).json({ error: 'Orçamento não encontrado' });
        return;
      }

      if (budget.budget_type !== 'supplier') {
        res.status(400).json({ error: 'Apenas orçamentos de insumos/fornecedores podem ser convertidos em entrada de estoque' });
        return;
      }

      if (budget.converted_to_inventory) {
        res.status(400).json({ error: 'Este orçamento já foi convertido em entrada de estoque anteriormente' });
        return;
      }

      const items = db.prepare(`
        SELECT id, reference_id, description, quantity, unit_price
        FROM budget_items
        WHERE budget_id = ?
      `).all(id) as any[];

      let convertedCount = 0;

      for (const it of items) {
        let targetItemId = it.reference_id;
        // Se não tiver reference_id direto, tenta encontrar item por nome exato no estoque
        if (!targetItemId) {
          const match = db.prepare('SELECT id FROM inventory_items WHERE name = ? AND tenant_id = ? AND active = 1').get(it.description, tenantId) as { id: string } | undefined;
          if (match) targetItemId = match.id;
        }

        // Se ainda não existir no estoque, cria automaticamente
        if (!targetItemId) {
          targetItemId = 'inv-' + uuidv4().slice(0, 8);
          db.prepare(`
            INSERT INTO inventory_items (
              id, tenant_id, name, quantity, unit_cost, supplier, active, created_at, updated_at
            )
            VALUES (?, ?, ?, 0, ?, ?, 1, datetime('now'), datetime('now'))
          `).run(targetItemId, tenantId, it.description, it.unit_price || 0, budget.supplier_name || null);
        }

        // Atualiza saldo
        const curItem = db.prepare('SELECT quantity FROM inventory_items WHERE id = ?').get(targetItemId) as { quantity: number };
        const prevQty = curItem ? curItem.quantity : 0;
        const addQty = Number(it.quantity) || 1;
        const newQty = prevQty + addQty;

        db.prepare('UPDATE inventory_items SET quantity = ?, unit_cost = COALESCE(?, unit_cost), updated_at = datetime(\'now\') WHERE id = ?').run(
          newQty,
          it.unit_price || null,
          targetItemId
        );

        // Registra movimentação de entrada vinculada ao orçamento
        db.prepare(`
          INSERT INTO inventory_movements (
            id, tenant_id, item_id, movement_type, quantity, previous_quantity, new_quantity,
            reason, document_reference, user_id, created_at
          )
          VALUES (?, ?, ?, 'in', ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          'mov-' + uuidv4().slice(0, 8),
          tenantId,
          targetItemId,
          addQty,
          prevQty,
          newQty,
          `Entrada automática via ${budget.budget_number}`,
          budget.budget_number,
          req.user?.userId || null
        );

        convertedCount++;
      }

      // Marca orçamento como convertido e aprovado
      db.prepare(`
        UPDATE budgets SET converted_to_inventory = 1, status = 'approved', updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(id, tenantId);

      logAudit(req, 'CONVERT_BUDGET_TO_INVENTORY', 'budgets', id, { itemsCount: convertedCount });

      res.json({
        message: `Orçamento convertido com sucesso! ${convertedCount} item(ns) deram entrada no estoque.`,
        convertedItems: convertedCount
      });
    } catch (err: any) {
      console.error('[BudgetController.convertToInventory] Erro:', err);
      res.status(500).json({ error: 'Erro ao converter orçamento em estoque' });
    }
  }
}
