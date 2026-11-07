import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';
import { InvoiceParserService } from '../services/invoice-parser.service';

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
      if (!db.prepare('SELECT id FROM inventory_items WHERE id=? AND tenant_id=?').get(id, tenantId)) {
        res.status(404).json({ error: 'Item de estoque não encontrado' }); return;
      }
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

      const qty = Number(quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        res.status(400).json({ error: 'Informe uma quantidade válida maior que zero' }); return;
      }
      const result = db.transaction(() => {
        const item = db.prepare('SELECT id, quantity, name FROM inventory_items WHERE id = ? AND tenant_id = ?').get(itemId, tenantId) as any;
        if (!item) {
          return { status: 404, data: { error: 'Item de estoque não encontrado' } };
        }

        const prevQty = Number(item.quantity) || 0;
        let newQty = prevQty;

        if (movementType === 'in') {
          newQty = prevQty + qty;
        } else if (movementType === 'out') {
          if (qty > prevQty) return { status: 409, data: { error: 'Estoque insuficiente para esta saída' } };
          newQty = prevQty - qty;
        } else if (movementType === 'adjustment') {
          newQty = qty; // No ajuste, define o novo saldo real apurado
        } else {
          return { status: 400, data: { error: 'Tipo de movimentação inválido (deve ser: in, out ou adjustment)' } };
        }

        // Atualiza saldo do item
        db.prepare('UPDATE inventory_items SET quantity = ?, updated_at = datetime(\'now\') WHERE id = ? AND tenant_id = ?').run(newQty, itemId, tenantId);

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

        return { status: 201, data: {
          id: movementId,
          message: 'Movimentação registrada com sucesso',
          newQuantity: newQty
        } };
      })();
      res.status(result.status).json(result.data);
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
          m.module_type, m.batch, m.professional_id, m.patient_id, m.appointment_id,
          i.name as item_name, i.unit,
          u.name as user_name,
          COALESCE(p.full_name, p.name) as patient_name,
          prof.name as professional_name
        FROM inventory_movements m
        JOIN inventory_items i ON i.id = m.item_id
        LEFT JOIN users u ON u.id = m.user_id
        LEFT JOIN patients p ON p.id = m.patient_id
        LEFT JOIN professionals prof ON prof.id = m.professional_id
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

  // Desativar / Excluir item de estoque
  static deleteItem(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      db.prepare('UPDATE inventory_items SET active = 0, updated_at = datetime(\'now\') WHERE id = ? AND tenant_id = ?').run(id, tenantId);
      logAudit(req, 'DELETE_INVENTORY_ITEM', 'inventory_items', id);
      res.json({ success: true, message: 'Item desativado do estoque com sucesso' });
    } catch (err: any) {
      console.error('[InventoryController.deleteItem] Erro:', err);
      res.status(500).json({ success: false, error: 'Erro ao desativar item de estoque' });
    }
  }

  // Extração inteligente de Nota Fiscal em memória (Zero Retention)
  static async parseInvoice(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const { fileBase64, fileName, mimeType } = req.body;
      if (!fileBase64 || !fileName) {
        res.status(400).json({ error: 'Arquivo da nota fiscal não informado.' });
        return;
      }

      // Limite de segurança de payload (25MB base64 ≈ 18MB binário)
      if (typeof fileBase64 === 'string' && fileBase64.length > 25 * 1024 * 1024) {
        res.status(413).json({ error: 'Arquivo excede o tamanho máximo suportado de 20MB.' });
        return;
      }

      const buffer = Buffer.from(fileBase64, 'base64');
      
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), 45000)
      );

      const extraction = await Promise.race([
        InvoiceParserService.parseInvoice({
          buffer,
          fileName,
          mimeType,
          tenantId
        }),
        timeoutPromise
      ]);

      res.json(extraction);
    } catch (err: any) {
      console.error('[InventoryController.parseInvoice] Erro:', err);
      if (err?.message === 'TIMEOUT_EXCEEDED') {
        res.status(504).json({ error: 'Tempo limite esgotado ao analisar o documento fiscal. Tente novamente ou prefira o arquivo XML da NF-e.' });
        return;
      }
      res.status(500).json({ error: 'Erro ao processar nota fiscal: ' + (err?.message || 'Falha de leitura') });
    }
  }

  // Confirmação e persistência transacional dos itens revisados na conferência integrada ao Financeiro
  static confirmInvoiceImport(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const { invoiceInfo, paymentInfo, items } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: 'Nenhum item selecionado para importação.' });
        return;
      }

      const userId = (req.user as any)?.userId || (req.user as any)?.id || null;
      const userName = req.user?.name || 'Operador';
      const nfNum = invoiceInfo?.invoiceNumber ? String(invoiceInfo.invoiceNumber).trim() : 'S/N';
      const nfSeries = invoiceInfo?.series ? String(invoiceInfo.series).trim() : null;
      const supplierName = (invoiceInfo?.supplier?.name || invoiceInfo?.supplier?.tradeName || 'Fornecedor').trim();
      const supplierTrade = invoiceInfo?.supplier?.tradeName ? String(invoiceInfo.supplier.tradeName).trim() : null;
      const supplierCnpj = invoiceInfo?.supplier?.cnpj ? String(invoiceInfo.supplier.cnpj).trim() : null;
      const accessKey = invoiceInfo?.accessKey ? String(invoiceInfo.accessKey).replace(/\D/g, '') : null;
      const issueDate = invoiceInfo?.issueDate || new Date().toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);

      // 1. Verificação de Prevenção de Duplicidades (Idempotência)
      if (accessKey && accessKey.length >= 44) {
        const dupByKey = db.prepare(`
          SELECT id, invoice_number, supplier_name, created_at
          FROM purchases
          WHERE tenant_id = ? AND invoice_access_key = ?
        `).get(tenantId, accessKey) as any;

        if (dupByKey) {
          const formattedDate = new Date(dupByKey.created_at).toLocaleDateString('pt-BR');
          res.status(409).json({
            error: 'DUPLICATE_INVOICE',
            message: `Esta nota fiscal (chave ${accessKey.slice(0, 6)}...${accessKey.slice(-4)}) já foi importada anteriormente em ${formattedDate} (ID: ${dupByKey.id}). Para evitar duplicidades no estoque e no financeiro, a operação foi bloqueada.`
          });
          return;
        }
      }

      if (nfNum && nfNum !== 'S/N') {
        const cnpjClean = supplierCnpj ? supplierCnpj.replace(/\D/g, '') : '';
        let dupByNumber: any = null;

        if (cnpjClean) {
          dupByNumber = db.prepare(`
            SELECT id, invoice_number, supplier_name, created_at
            FROM purchases
            WHERE tenant_id = ? AND invoice_number = ? AND replace(replace(replace(supplier_cnpj, '.', ''), '/', ''), '-', '') = ?
          `).get(tenantId, nfNum, cnpjClean);
        } else if (supplierName) {
          dupByNumber = db.prepare(`
            SELECT id, invoice_number, supplier_name, created_at
            FROM purchases
            WHERE tenant_id = ? AND invoice_number = ? AND LOWER(supplier_name) = LOWER(?)
          `).get(tenantId, nfNum, supplierName);
        }

        if (dupByNumber) {
          const formattedDate = new Date(dupByNumber.created_at).toLocaleDateString('pt-BR');
          res.status(409).json({
            error: 'DUPLICATE_INVOICE',
            message: `A Nota Fiscal nº ${nfNum} do fornecedor "${supplierName}" já foi importada anteriormente em ${formattedDate} (ID: ${dupByNumber.id}). Para evitar duplicidades no estoque e no financeiro, a operação foi bloqueada.`
          });
          return;
        }
      }

      // 2. Cálculos Financeiros e Discriminação de Valores
      const activeItems = items.filter(it => it.action !== 'ignore');
      const calculatedItemsTotal = activeItems.reduce((sum, it) => {
        const q = Number(it.quantity) || 0;
        const c = Number(it.unitCost) || 0;
        return sum + (Number(it.totalCost) > 0 ? Number(it.totalCost) : q * c);
      }, 0);

      const productsAmount = Number(invoiceInfo?.productsAmount) > 0
        ? Number(invoiceInfo.productsAmount)
        : calculatedItemsTotal;
      const freightAmount = Number(invoiceInfo?.freightAmount) || 0;
      const discountAmount = Number(invoiceInfo?.discountAmount) || 0;
      const otherExpensesAmount = Number(invoiceInfo?.otherExpensesAmount) || 0;
      const totalAmount = Number(invoiceInfo?.totalAmount) > 0
        ? Number(invoiceInfo.totalAmount)
        : Math.max(0, productsAmount + freightAmount + otherExpensesAmount - discountAmount);

      // Condições e formas de pagamento
      const paymentCondition: 'paid' | 'pending' | 'partial' | 'installment' | 'unspecified' =
        paymentInfo?.paymentCondition || 'unspecified';
      const paymentMethod = (paymentInfo?.paymentMethod || 'pix').toLowerCase();
      const paymentNotes = paymentInfo?.notes ? String(paymentInfo.notes).trim() : null;

      let amountPaid = 0;
      if (paymentCondition === 'paid') {
        amountPaid = totalAmount;
      } else if (paymentCondition === 'partial') {
        amountPaid = Number(paymentInfo?.amountPaid) || 0;
      } else if (paymentCondition === 'installment') {
        const paidInsts = (paymentInfo?.installments || []).filter((i: any) => i.isPaid);
        amountPaid = paidInsts.reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0);
      }
      amountPaid = Math.min(amountPaid, totalAmount);
      const amountPending = Math.max(0, totalAmount - amountPaid);

      // 3. Regra de Integração com Gaveta Física de Caixa
      // APENAS dinheiro físico com sessão de caixa aberta gera DESPESA em cash_register_movements
      const openReg = db.prepare(`
        SELECT id FROM cash_registers
        WHERE tenant_id = ? AND status = 'open'
        ORDER BY opened_at DESC LIMIT 1
      `).get(tenantId) as any;
      const activeCashRegisterId: string | null = openReg ? openReg.id : null;

      let cashPaidNow = 0;
      if (paymentMethod === 'cash' || paymentMethod === 'dinheiro') {
        cashPaidNow = amountPaid;
      } else if (paymentMethod === 'mixed' && Array.isArray(paymentInfo?.paymentSplits)) {
        for (const sp of paymentInfo.paymentSplits) {
          const spMethod = (sp.paymentMethod || '').toLowerCase();
          if ((spMethod === 'cash' || spMethod === 'dinheiro') && sp.isPaid !== false) {
            cashPaidNow += Number(sp.amount) || 0;
          }
        }
      } else if (paymentCondition === 'installment' && Array.isArray(paymentInfo?.installments)) {
        for (const inst of paymentInfo.installments) {
          const instMethod = (inst.paymentMethod || paymentMethod).toLowerCase();
          if ((instMethod === 'cash' || instMethod === 'dinheiro') && inst.isPaid) {
            cashPaidNow += Number(inst.amount) || 0;
          }
        }
      }

      const isDrawerCashDeductionApplied = cashPaidNow > 0 && Boolean(activeCashRegisterId);

      // 4. Execução Transacional Atômica (SQLite WAL)
      const purchaseId = 'pur-' + uuidv4().slice(0, 8);
      let createdCount = 0;
      let updatedCount = 0;
      let ignoredCount = 0;

      const runImportTransaction = db.transaction(() => {
        // A) Inserção da Compra (purchases)
        db.prepare(`
          INSERT INTO purchases (
            id, tenant_id, supplier_name, supplier_trade_name, supplier_cnpj,
            invoice_number, invoice_series, invoice_access_key, issue_date,
            products_amount, freight_amount, discount_amount, other_expenses_amount, total_amount,
            payment_status, payment_method, amount_paid, amount_pending,
            cash_register_id, notes, created_by, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
          purchaseId,
          tenantId,
          supplierName,
          supplierTrade,
          supplierCnpj,
          nfNum,
          nfSeries,
          accessKey,
          issueDate,
          productsAmount,
          freightAmount,
          discountAmount,
          otherExpensesAmount,
          totalAmount,
          paymentCondition,
          paymentMethod,
          amountPaid,
          amountPending,
          isDrawerCashDeductionApplied ? activeCashRegisterId : null,
          paymentNotes,
          userId
        );

        // B) Geração de Contas a Pagar / Obrigações Financeiras (accounts_payable)
        if (paymentCondition === 'paid') {
          db.prepare(`
            INSERT INTO accounts_payable (
              id, tenant_id, purchase_id, description, category, supplier_name, supplier_cnpj,
              amount, installment_number, total_installments, due_date, payment_date, payment_method,
              status, amount_paid, cash_register_id, invoice_number, created_by, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, 'Insumos / Produtos', ?, ?, ?, 1, 1, ?, ?, ?, 'paid', ?, ?, ?, ?, datetime('now'), datetime('now'))
          `).run(
            'pay-' + uuidv4().slice(0, 8),
            tenantId,
            purchaseId,
            `Compra NF nº ${nfNum} - ${supplierName}`,
            supplierName,
            supplierCnpj,
            totalAmount,
            issueDate,
            today,
            paymentMethod,
            totalAmount,
            (paymentMethod === 'cash' || paymentMethod === 'dinheiro') && activeCashRegisterId ? activeCashRegisterId : null,
            nfNum,
            userId
          );
        } else if (paymentCondition === 'pending') {
          const singleDueDate = paymentInfo?.dueDate || issueDate || today;
          db.prepare(`
            INSERT INTO accounts_payable (
              id, tenant_id, purchase_id, description, category, supplier_name, supplier_cnpj,
              amount, installment_number, total_installments, due_date, payment_method,
              status, amount_paid, invoice_number, created_by, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, 'Insumos / Produtos', ?, ?, ?, 1, 1, ?, ?, 'pending', 0, ?, ?, datetime('now'), datetime('now'))
          `).run(
            'pay-' + uuidv4().slice(0, 8),
            tenantId,
            purchaseId,
            `Compra NF nº ${nfNum} - ${supplierName}`,
            supplierName,
            supplierCnpj,
            totalAmount,
            singleDueDate,
            paymentMethod,
            nfNum,
            userId
          );
        } else if (paymentCondition === 'partial') {
          // Parcela paga à vista
          if (amountPaid > 0) {
            db.prepare(`
              INSERT INTO accounts_payable (
                id, tenant_id, purchase_id, description, category, supplier_name, supplier_cnpj,
                amount, installment_number, total_installments, due_date, payment_date, payment_method,
                status, amount_paid, cash_register_id, invoice_number, created_by, created_at, updated_at
              )
              VALUES (?, ?, ?, ?, 'Insumos / Produtos', ?, ?, ?, 1, 2, ?, ?, ?, 'paid', ?, ?, ?, ?, datetime('now'), datetime('now'))
            `).run(
              'pay-' + uuidv4().slice(0, 8),
              tenantId,
              purchaseId,
              `Compra NF nº ${nfNum} (Entrada quitada) - ${supplierName}`,
              supplierName,
              supplierCnpj,
              amountPaid,
              issueDate,
              today,
              paymentMethod,
              amountPaid,
              (paymentMethod === 'cash' || paymentMethod === 'dinheiro') && activeCashRegisterId ? activeCashRegisterId : null,
              nfNum,
              userId
            );
          }
          // Saldo restante pendente
          if (amountPending > 0) {
            const partDueDate = paymentInfo?.dueDate || today;
            db.prepare(`
              INSERT INTO accounts_payable (
                id, tenant_id, purchase_id, description, category, supplier_name, supplier_cnpj,
                amount, installment_number, total_installments, due_date, payment_method,
                status, amount_paid, invoice_number, created_by, created_at, updated_at
              )
              VALUES (?, ?, ?, ?, 'Insumos / Produtos', ?, ?, ?, 2, 2, ?, ?, 'pending', 0, ?, ?, datetime('now'), datetime('now'))
            `).run(
              'pay-' + uuidv4().slice(0, 8),
              tenantId,
              purchaseId,
              `Compra NF nº ${nfNum} (Saldo restante) - ${supplierName}`,
              supplierName,
              supplierCnpj,
              amountPending,
              partDueDate,
              paymentMethod,
              nfNum,
              userId
            );
          }
        } else if (paymentCondition === 'installment') {
          const rawInstallments = Array.isArray(paymentInfo?.installments) && paymentInfo.installments.length > 0
            ? paymentInfo.installments
            : [{ number: 1, dueDate: today, amount: totalAmount }];
          const totalInstCount = rawInstallments.length;

          rawInstallments.forEach((inst: any, idx: number) => {
            const instNum = Number(inst.number) || idx + 1;
            const instAmt = Number(inst.amount) || 0;
            const instDue = inst.dueDate || today;
            const instMethod = inst.paymentMethod || paymentMethod;
            const isInstPaid = Boolean(inst.isPaid);
            const isInstCash = (instMethod === 'cash' || instMethod === 'dinheiro');

            db.prepare(`
              INSERT INTO accounts_payable (
                id, tenant_id, purchase_id, description, category, supplier_name, supplier_cnpj,
                amount, installment_number, total_installments, due_date, payment_date, payment_method,
                status, amount_paid, cash_register_id, invoice_number, created_by, created_at, updated_at
              )
              VALUES (?, ?, ?, ?, 'Insumos / Produtos', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `).run(
              'pay-' + uuidv4().slice(0, 8),
              tenantId,
              purchaseId,
              `Compra NF nº ${nfNum} (Parcela ${instNum}/${totalInstCount}) - ${supplierName}`,
              supplierName,
              supplierCnpj,
              instAmt,
              instNum,
              totalInstCount,
              instDue,
              isInstPaid ? today : null,
              instMethod,
              isInstPaid ? 'paid' : 'pending',
              isInstPaid ? instAmt : 0,
              isInstPaid && isInstCash && activeCashRegisterId ? activeCashRegisterId : null,
              nfNum,
              userId
            );
          });
        } else {
          // Unspecified / Sem informação
          db.prepare(`
            INSERT INTO accounts_payable (
              id, tenant_id, purchase_id, description, category, supplier_name, supplier_cnpj,
              amount, installment_number, total_installments, due_date, payment_method,
              status, amount_paid, invoice_number, created_by, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, 'Insumos / Produtos', ?, ?, ?, 1, 1, ?, ?, 'pending', 0, ?, ?, datetime('now'), datetime('now'))
          `).run(
            'pay-' + uuidv4().slice(0, 8),
            tenantId,
            purchaseId,
            `Compra NF nº ${nfNum} - ${supplierName}`,
            supplierName,
            supplierCnpj,
            totalAmount,
            today,
            paymentMethod,
            nfNum,
            userId
          );
        }

        // C) Inserção de Divisões de Pagamento (payment_splits)
        if (Array.isArray(paymentInfo?.paymentSplits) && paymentInfo.paymentSplits.length > 0) {
          for (const sp of paymentInfo.paymentSplits) {
            const spAmt = Number(sp.amount) || 0;
            if (spAmt <= 0) continue;
            const spMethod = (sp.paymentMethod || 'pix').toLowerCase();
            const isSpPaid = sp.isPaid !== false;
            const isSpCash = spMethod === 'cash' || spMethod === 'dinheiro';

            db.prepare(`
              INSERT INTO payment_splits (
                id, tenant_id, purchase_id, payment_method, amount, due_date, paid_at, status, cash_register_id, created_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `).run(
              'ps-' + uuidv4().slice(0, 8),
              tenantId,
              purchaseId,
              spMethod,
              spAmt,
              sp.dueDate || today,
              isSpPaid ? today : null,
              isSpPaid ? 'paid' : 'pending',
              isSpPaid && isSpCash && activeCashRegisterId ? activeCashRegisterId : null
            );
          }
        }

        // D) Débito na Gaveta Física de Caixa (se aplicável)
        if (isDrawerCashDeductionApplied) {
          const movId = 'mov-cash-' + uuidv4().slice(0, 8);
          db.prepare(`
            INSERT INTO cash_register_movements (
              id, tenant_id, cash_register_id, user_id, user_name,
              type, amount, description, created_at
            )
            VALUES (?, ?, ?, ?, ?, 'DESPESA', ?, ?, datetime('now'))
          `).run(
            movId,
            tenantId,
            activeCashRegisterId,
            userId || 'system',
            userName,
            cashPaidNow,
            `Compra NF nº ${nfNum} - ${supplierName}`
          );
        }

        // E) Atualização e Criação de Itens no Estoque (inventory_items & inventory_movements)
        for (const item of items) {
          const action = item.action || 'create';
          if (action === 'ignore') {
            ignoredCount++;
            continue;
          }

          const qty = Number(item.quantity) || 0;
          if (qty <= 0) continue;

          const unitCost = Number(item.unitCost) || 0;
          const cleanName = (item.cleanName || item.name || 'Insumo').trim();

          if (action === 'update' && item.matchedItemId) {
            const existing = db.prepare(`
              SELECT id, quantity, unit_cost, batch_number, expiration_date
              FROM inventory_items
              WHERE id = ? AND tenant_id = ?
            `).get(item.matchedItemId, tenantId) as any;

            if (existing) {
              const previousQty = Number(existing.quantity) || 0;
              const newQty = previousQty + qty;

              db.prepare(`
                UPDATE inventory_items SET
                  quantity = ?,
                  unit_cost = CASE WHEN ? > 0 THEN ? ELSE unit_cost END,
                  batch_number = COALESCE(?, batch_number),
                  expiration_date = COALESCE(?, expiration_date),
                  brand = COALESCE(?, brand),
                  supplier = COALESCE(?, supplier),
                  ean = COALESCE(?, ean),
                  ncm = COALESCE(?, ncm),
                  updated_at = datetime('now')
                WHERE id = ? AND tenant_id = ?
              `).run(
                newQty,
                unitCost,
                unitCost,
                item.batchNumber || null,
                item.expirationDate || null,
                item.brand || null,
                supplierName || null,
                item.ean || null,
                item.ncm || null,
                existing.id,
                tenantId
              );

              // Registra movimentação de entrada vinculada à compra
              db.prepare(`
                INSERT INTO inventory_movements (
                  id, tenant_id, item_id, movement_type, quantity, previous_quantity, new_quantity,
                  reason, user_id, invoice_number, unit_cost, batch_number, expiration_date, purchase_id, created_at
                )
                VALUES (?, ?, ?, 'in', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
              `).run(
                'mov-' + uuidv4().slice(0, 8),
                tenantId,
                existing.id,
                qty,
                previousQty,
                newQty,
                `Entrada via NF nº ${nfNum}${supplierName ? ` (${supplierName})` : ''}`,
                userId,
                nfNum,
                unitCost,
                item.batchNumber || null,
                item.expirationDate || null,
                purchaseId
              );

              updatedCount++;
              continue;
            }
          }

          // Criação de novo item de estoque
          const newItemId = 'inv-' + uuidv4().slice(0, 8);
          db.prepare(`
            INSERT INTO inventory_items (
              id, tenant_id, name, category, product_type, brand, presentation, volume_ml,
              quantity, unit, batch_number, expiration_date, unit_cost, supplier, min_stock,
              notes, active, ean, ncm, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, datetime('now'), datetime('now'))
          `).run(
            newItemId,
            tenantId,
            cleanName,
            item.category || 'Geral',
            item.productType || 'insumo',
            item.brand || null,
            item.presentation || 'unidade',
            item.volumeMl ? Number(item.volumeMl) : null,
            qty,
            (item.unit || 'UN').toUpperCase(),
            item.batchNumber || null,
            item.expirationDate || null,
            unitCost,
            supplierName || null,
            item.minStock !== undefined ? Number(item.minStock) : 5,
            item.notes || (nfNum !== 'S/N' ? `Importado via NF nº ${nfNum}` : null),
            item.ean || null,
            item.ncm || null
          );

          // Registra movimentação inicial com purchase_id
          db.prepare(`
            INSERT INTO inventory_movements (
              id, tenant_id, item_id, movement_type, quantity, previous_quantity, new_quantity,
              reason, user_id, invoice_number, unit_cost, batch_number, expiration_date, purchase_id, created_at
            )
            VALUES (?, ?, ?, 'in', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `).run(
            'mov-' + uuidv4().slice(0, 8),
            tenantId,
            newItemId,
            qty,
            qty,
            `Entrada inicial via NF nº ${nfNum}${supplierName ? ` (${supplierName})` : ''}`,
            userId,
            nfNum,
            unitCost,
            item.batchNumber || null,
            item.expirationDate || null,
            purchaseId
          );

          createdCount++;
        }
      });

      runImportTransaction();

      logAudit(req, 'IMPORT_INVOICE_WITH_FINANCE', 'purchases', purchaseId, {
        purchaseId,
        invoiceNumber: nfNum,
        supplierName,
        totalAmount,
        amountPaid,
        amountPending,
        paymentCondition,
        paymentMethod,
        isDrawerCashDeductionApplied,
        cashPaidNow,
        createdCount,
        updatedCount,
        ignoredCount
      });

      res.status(201).json({
        success: true,
        message: 'Nota Fiscal importada com sucesso no Estoque e no Financeiro!',
        purchaseId,
        invoiceNumber: nfNum,
        supplierName,
        totalAmount,
        amountPaid,
        amountPending,
        paymentStatus: paymentCondition,
        createdCount,
        updatedCount,
        ignoredCount,
        totalProcessed: createdCount + updatedCount,
        drawerDeductionApplied: isDrawerCashDeductionApplied,
        cashAmountDeducted: isDrawerCashDeductionApplied ? cashPaidNow : 0
      });
    } catch (err: any) {
      console.error('[InventoryController.confirmInvoiceImport] Erro:', err);
      res.status(500).json({ error: 'Erro ao confirmar importação da nota fiscal: ' + (err?.message || 'Falha de banco de dados') });
    }
  }
}
