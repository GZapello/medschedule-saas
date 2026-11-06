import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';

export class CashRegisterController {
  // Caixa aberto atual do usuário ou clínica
  static getCurrent(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      // Busca caixa aberto mais recente da clínica
      const openRegister = db.prepare(`
        SELECT * FROM cash_registers
        WHERE tenant_id = ? AND status = 'open'
        ORDER BY opened_at DESC
        LIMIT 1
      `).get(tenantId) as any;

      if (!openRegister) {
        res.json({ openRegister: null });
        return;
      }

      // Busca pagamentos vinculados ao caixa (ou criados após a abertura se não vinculados)
      const payments = db.prepare(`
        SELECT 
          p.id, p.amount, p.payment_method, p.status, p.created_at, p.notes,
          p.amount_tendered, p.change_amount,
          pat.full_name as patient_name
        FROM payments p
        LEFT JOIN patients pat ON pat.id = p.patient_id
        WHERE p.tenant_id = ?
          AND (p.cash_register_id = ? OR (p.cash_register_id IS NULL AND p.created_at >= ?))
        ORDER BY p.created_at DESC
      `).all(tenantId, openRegister.id, openRegister.opened_at) as any[];

      // Busca movimentações em gaveta (suprimentos, sangrias, despesas)
      let cashMovements: any[] = [];
      try {
        cashMovements = db.prepare(`
          SELECT * FROM cash_register_movements
          WHERE tenant_id = ? AND cash_register_id = ?
          ORDER BY created_at DESC
        `).all(tenantId, openRegister.id) as any[];
      } catch (e) {
        cashMovements = [];
      }

      // Agrupa totais por método de pagamento (considera status 'paid', 'completed', 'confirmed')
      const totalsByMethod: Record<string, number> = {
        cash: 0,
        pix: 0,
        credit_card: 0,
        debit_card: 0,
        bank_transfer: 0,
        insurance: 0,
        total: 0
      };

      for (const pay of payments) {
        const isPaid = pay.status === 'paid' || pay.status === 'completed' || pay.status === 'confirmed';
        if (isPaid) {
          const method = pay.payment_method || 'cash';
          const amt = Number(pay.amount) || 0;
          totalsByMethod[method] = (totalsByMethod[method] || 0) + amt;
          totalsByMethod.total += amt;
        }
      }

      // Totaliza movimentações avulsas da gaveta
      let suprimentos = 0;
      let sangrias = 0;
      let despesas = 0;
      let estornos = 0;

      for (const m of cashMovements) {
        const mAmount = Number(m.amount) || 0;
        if (m.type === 'SUPRIMENTO') {
          suprimentos += mAmount;
        } else if (m.type === 'SANGRIA') {
          sangrias += mAmount;
        } else if (m.type === 'DESPESA') {
          despesas += mAmount;
        } else if (m.type === 'ESTORNO') {
          estornos += mAmount;
        }
      }

      const initialBalance = Number(openRegister.initial_balance) || 0;
      const cashIn = totalsByMethod.cash || 0;
      const expectedCash = initialBalance + cashIn + suprimentos - (sangrias + despesas + estornos);

      const drawerSummary = {
        initialBalance,
        cashIn,
        suprimentos,
        sangrias,
        despesas,
        estornos,
        expectedCash
      };

      res.json({
        openRegister,
        movements: payments,
        cashMovements,
        totalsByMethod,
        drawerSummary
      });
    } catch (err: any) {
      console.error('[CashRegisterController.getCurrent] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar status do caixa' });
    }
  }

  // Abertura de Caixa
  static openRegister(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const userId = (req.user as any)?.userId || (req.user as any)?.id || 'system';
      const userName = req.user?.name || 'Operador';
      const { initialBalance, notes } = req.body;

      // Validação do fundo inicial (permite R$ 0,00 ou positivo)
      const initial = Number(initialBalance);
      if (isNaN(initial) || initial < 0) {
        res.status(400).json({ error: 'O fundo de troco inicial deve ser um valor numérico maior ou igual a zero.' });
        return;
      }

      // Verifica se já existe caixa aberto para o tenant
      const existing = db.prepare(`
        SELECT id, operator_name, opened_at FROM cash_registers
        WHERE tenant_id = ? AND status = 'open'
        ORDER BY opened_at DESC
        LIMIT 1
      `).get(tenantId) as any;

      if (existing) {
        res.status(400).json({
          error: `Já existe um caixa aberto nesta clínica (Aberto por ${existing.operator_name || 'Operador'} em ${new Date(existing.opened_at).toLocaleString('pt-BR')}). Feche a sessão anterior antes de abrir outra.`
        });
        return;
      }

      const id = 'csh-' + uuidv4().slice(0, 8);
      const noteText = notes ? String(notes).trim() : null;

      db.prepare(`
        INSERT INTO cash_registers (
          id, tenant_id, user_id, operator_user_id, operator_name,
          opened_at, initial_balance, status, notes_open, notes
        )
        VALUES (?, ?, ?, ?, ?, datetime('now'), ?, 'open', ?, ?)
      `).run(id, tenantId, userId, userId, userName, initial, noteText, noteText);

      logAudit(req, 'OPEN_CASH_REGISTER', 'cash_registers', id, { initialBalance: initial, operatorName: userName });
      res.status(201).json({ id, message: 'Caixa aberto com sucesso!' });
    } catch (err: any) {
      console.error('[CashRegisterController.openRegister] Erro:', err);
      res.status(500).json({ error: 'Erro ao abrir caixa: ' + (err?.message || 'Falha de banco de dados') });
    }
  }

  // Registro de Movimentação em Gaveta (Suprimento, Sangria, Despesa)
  static recordMovement(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const { type, amount, description } = req.body;

      const validTypes = ['SUPRIMENTO', 'SANGRIA', 'DESPESA', 'ESTORNO'];
      if (!type || !validTypes.includes(type)) {
        res.status(400).json({ error: `Tipo de movimentação inválido. Valores aceitos: ${validTypes.join(', ')}` });
        return;
      }

      const val = Number(amount);
      if (isNaN(val) || val <= 0) {
        res.status(400).json({ error: 'O valor da movimentação deve ser maior que zero (R$ 0,01).' });
        return;
      }

      if (!description || !String(description).trim()) {
        res.status(400).json({ error: 'A justificativa/descrição da movimentação é obrigatória.' });
        return;
      }

      const register = db.prepare(`
        SELECT * FROM cash_registers WHERE id = ? AND tenant_id = ?
      `).get(id, tenantId) as any;

      if (!register) {
        res.status(404).json({ error: 'Sessão de caixa não encontrada.' });
        return;
      }

      if (register.status !== 'open') {
        res.status(400).json({ error: 'Não é possível lançar movimentações em um caixa já fechado.' });
        return;
      }

      const movementId = 'cmov-' + uuidv4().slice(0, 8);
      const userId = (req.user as any)?.userId || (req.user as any)?.id || 'system';
      const userName = req.user?.name || 'Operador';

      db.prepare(`
        INSERT INTO cash_register_movements (
          id, tenant_id, cash_register_id, user_id, user_name,
          type, amount, description, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(movementId, tenantId, id, userId, userName, type, val, String(description).trim());

      logAudit(req, 'RECORD_CASH_MOVEMENT', 'cash_register_movements', movementId, {
        cashRegisterId: id,
        type,
        amount: val,
        description
      });

      res.status(201).json({
        id: movementId,
        message: `${type === 'SUPRIMENTO' ? 'Suprimento' : type === 'SANGRIA' ? 'Sangria' : 'Despesa'} registrado com sucesso!`
      });
    } catch (err: any) {
      console.error('[CashRegisterController.recordMovement] Erro:', err);
      res.status(500).json({ error: 'Erro ao registrar movimentação de caixa' });
    }
  }

  // Fechamento de Caixa com conferência cega/assistida
  static closeRegister(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const { countedCash, countedValuesByMethod, differenceJustification, notes } = req.body;

      const register = db.prepare(`
        SELECT * FROM cash_registers WHERE id = ? AND tenant_id = ?
      `).get(id, tenantId) as any;

      if (!register) {
        res.status(404).json({ error: 'Caixa não encontrado' });
        return;
      }

      if (register.status === 'closed') {
        res.status(400).json({ error: 'Este caixa já foi fechado anteriormente' });
        return;
      }

      // 1. Atualiza os pagamentos gerados na vigência para estarem vinculados formalmente ao caixa
      db.prepare(`
        UPDATE payments SET cash_register_id = ?
        WHERE tenant_id = ?
          AND (cash_register_id IS NULL OR cash_register_id = ?)
          AND created_at >= ?
      `).run(id, tenantId, id, register.opened_at);

      // 2. Busca movimentações de pagamento
      const payments = db.prepare(`
        SELECT 
          p.id, p.amount, p.payment_method, p.status, p.created_at, p.notes,
          p.amount_tendered, p.change_amount
        FROM payments p
        WHERE p.tenant_id = ? AND p.cash_register_id = ?
      `).all(tenantId, id) as any[];

      // 3. Totais por método eletrônico e físico
      const systemTotals: Record<string, number> = {
        cash: 0,
        pix: 0,
        credit_card: 0,
        debit_card: 0,
        bank_transfer: 0,
        insurance: 0,
        total: 0
      };

      for (const p of payments) {
        const isPaid = p.status === 'paid' || p.status === 'completed' || p.status === 'confirmed';
        if (isPaid) {
          const m = p.payment_method || 'cash';
          const amt = Number(p.amount) || 0;
          systemTotals[m] = (systemTotals[m] || 0) + amt;
          systemTotals.total += amt;
        }
      }

      // 4. Busca movimentações em dinheiro na gaveta
      let cashMovements: any[] = [];
      try {
        cashMovements = db.prepare(`
          SELECT * FROM cash_register_movements
          WHERE tenant_id = ? AND cash_register_id = ?
          ORDER BY created_at ASC
        `).all(tenantId, id) as any[];
      } catch (e) {
        cashMovements = [];
      }

      let suprimentos = 0;
      let sangrias = 0;
      let despesas = 0;
      let estornos = 0;

      for (const m of cashMovements) {
        const amt = Number(m.amount) || 0;
        if (m.type === 'SUPRIMENTO') suprimentos += amt;
        else if (m.type === 'SANGRIA') sangrias += amt;
        else if (m.type === 'DESPESA') despesas += amt;
        else if (m.type === 'ESTORNO') estornos += amt;
      }

      // Dinheiro Físico Esperado na Gaveta:
      // = Fundo Inicial + Entradas em Dinheiro + Suprimentos - Sangrias - Despesas - Estornos
      const initialBalance = Number(register.initial_balance) || 0;
      const cashIn = systemTotals.cash || 0;
      const expectedCashInDrawer = initialBalance + cashIn + suprimentos - (sangrias + despesas + estornos);

      const actualCashInDrawer = Number(countedCash);
      if (isNaN(actualCashInDrawer) || actualCashInDrawer < 0) {
        res.status(400).json({ error: 'O valor contado em dinheiro na gaveta deve ser um número válido.' });
        return;
      }

      const cashDifference = Math.round((actualCashInDrawer - expectedCashInDrawer) * 100) / 100;

      // Se houver diferença (sobra ou falta > R$ 0,01) exige justificativa
      if (Math.abs(cashDifference) >= 0.01 && (!differenceJustification || !String(differenceJustification).trim())) {
        res.status(400).json({
          error: `Foi identificada uma diferença de ${cashDifference > 0 ? '+' : ''}R$ ${cashDifference.toFixed(2).replace('.', ',')} (${cashDifference > 0 ? 'Sobra' : 'Falta'}). A justificativa é obrigatória para encerrar a sessão.`
        });
        return;
      }

      const summary = {
        initialBalance,
        cashIn,
        suprimentos,
        sangrias,
        despesas,
        estornos,
        expectedCashInDrawer,
        actualCashInDrawer,
        cashDifference,
        systemTotals,
        countedValuesByMethod: countedValuesByMethod || {},
        differenceJustification: differenceJustification ? String(differenceJustification).trim() : null,
        closedByUserId: (req.user as any)?.userId || (req.user as any)?.id || 'system',
        closedByUserName: req.user?.name || 'Operador',
        closedAt: new Date().toISOString()
      };

      const finalNotes = differenceJustification
        ? (notes ? `${notes} | Justificativa: ${differenceJustification}` : `Justificativa: ${differenceJustification}`)
        : (notes || null);

      db.prepare(`
        UPDATE cash_registers SET
          status = 'closed',
          closed_at = datetime('now'),
          closing_balance_expected = ?,
          closing_balance_actual = ?,
          final_balance = ?,
          difference = ?,
          notes_close = ?,
          notes = ?,
          summary_json = ?
        WHERE id = ? AND tenant_id = ?
      `).run(
        expectedCashInDrawer,
        actualCashInDrawer,
        actualCashInDrawer,
        cashDifference,
        finalNotes,
        finalNotes,
        JSON.stringify(summary),
        id,
        tenantId
      );

      logAudit(req, 'CLOSE_CASH_REGISTER', 'cash_registers', id, { summary });

      res.json({
        message: 'Caixa encerrado com sucesso!',
        summary
      });
    } catch (err: any) {
      console.error('[CashRegisterController.closeRegister] Erro:', err);
      res.status(500).json({ error: 'Erro ao fechar caixa: ' + (err?.message || 'Falha de banco de dados') });
    }
  }

  // Histórico de Caixas
  static listHistory(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const { startDate, endDate } = req.query;

      let query = `
        SELECT * FROM cash_registers
        WHERE tenant_id = ?
      `;
      const params: any[] = [tenantId];

      if (startDate) {
        query += ' AND opened_at >= ?';
        params.push(startDate);
      }
      if (endDate) {
        query += ' AND opened_at <= ?';
        params.push(endDate);
      }

      query += ' ORDER BY opened_at DESC LIMIT 100';

      const registers = db.prepare(query).all(...params) as any[];

      // Enriquecer com contagem de movimentações e pagamentos
      const enriched = registers.map(reg => {
        let parsedSummary = null;
        if (reg.summary_json) {
          try {
            parsedSummary = JSON.parse(reg.summary_json);
          } catch {
            parsedSummary = null;
          }
        }
        return {
          ...reg,
          parsedSummary
        };
      });

      res.json(enriched);
    } catch (err: any) {
      console.error('[CashRegisterController.listHistory] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar histórico de caixas' });
    }
  }

  // Detalhe de um caixa para relatório / conferência / impressão
  static getById(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const register = db.prepare('SELECT * FROM cash_registers WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!register) {
        res.status(404).json({ error: 'Caixa não encontrado' });
        return;
      }

      const payments = db.prepare(`
        SELECT 
          p.*,
          pat.full_name as patient_name
        FROM payments p
        LEFT JOIN patients pat ON pat.id = p.patient_id
        WHERE p.tenant_id = ? AND p.cash_register_id = ?
        ORDER BY p.created_at ASC
      `).all(tenantId, id);

      let cashMovements: any[] = [];
      try {
        cashMovements = db.prepare(`
          SELECT * FROM cash_register_movements
          WHERE tenant_id = ? AND cash_register_id = ?
          ORDER BY created_at ASC
        `).all(tenantId, id);
      } catch (e) {
        cashMovements = [];
      }

      let parsedSummary = null;
      if (register.summary_json) {
        try {
          parsedSummary = JSON.parse(register.summary_json);
        } catch {
          parsedSummary = null;
        }
      }

      res.json({
        register,
        payments,
        cashMovements,
        summary: parsedSummary
      });
    } catch (err: any) {
      console.error('[CashRegisterController.getById] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar detalhes do caixa' });
    }
  }

  // Exportação CSV do Caixa
  static exportCsv(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const register = db.prepare('SELECT * FROM cash_registers WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!register) {
        res.status(404).json({ error: 'Caixa não encontrado' });
        return;
      }

      const payments = db.prepare(`
        SELECT 
          p.id, p.amount, p.payment_method, p.status, p.created_at, p.notes,
          pat.full_name as patient_name
        FROM payments p
        LEFT JOIN patients pat ON pat.id = p.patient_id
        WHERE p.tenant_id = ? AND p.cash_register_id = ?
        ORDER BY p.created_at ASC
      `).all(tenantId, id) as any[];

      const movements = db.prepare(`
        SELECT * FROM cash_register_movements
        WHERE tenant_id = ? AND cash_register_id = ?
        ORDER BY created_at ASC
      `).all(tenantId, id) as any[];

      let csv = 'RELATÓRIO DE SESSÃO DE CAIXA\r\n';
      csv += `Identificador;${register.id}\r\n`;
      csv += `Operador;${register.operator_name || 'Operador'}\r\n`;
      csv += `Abertura;${register.opened_at}\r\n`;
      csv += `Fechamento;${register.closed_at || 'Em Aberto'}\r\n`;
      csv += `Fundo Inicial (R$);${Number(register.initial_balance || 0).toFixed(2)}\r\n`;
      csv += `Saldo Físico Informado (R$);${register.final_balance !== null ? Number(register.final_balance).toFixed(2) : 'N/A'}\r\n`;
      csv += `Diferença (R$);${register.difference !== null ? Number(register.difference).toFixed(2) : 'N/A'}\r\n\r\n`;

      csv += 'PAGAMENTOS E RECEBIMENTOS\r\n';
      csv += 'ID;Data/Hora;Cliente/Paciente;Forma;Valor (R$);Status;Notas\r\n';
      for (const p of payments) {
        csv += `"${p.id}";"${p.created_at}";"${(p.patient_name || '').replace(/"/g, '""')}";"${p.payment_method}";${Number(p.amount || 0).toFixed(2)};"${p.status}";"${(p.notes || '').replace(/"/g, '""')}"\r\n`;
      }

      csv += '\r\nMOVIMENTAÇÕES EM GAVETA (SUPRIMENTOS / SANGRIAS / DESPESAS)\r\n';
      csv += 'ID;Data/Hora;Tipo;Valor (R$);Operador;Justificativa/Descrição\r\n';
      for (const m of movements) {
        csv += `"${m.id}";"${m.created_at}";"${m.type}";${Number(m.amount || 0).toFixed(2)};"${(m.user_name || '').replace(/"/g, '""')}";"${(m.description || '').replace(/"/g, '""')}"\r\n`;
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="caixa_${register.id}.csv"`);
      res.send('\uFEFF' + csv);
    } catch (err: any) {
      console.error('[CashRegisterController.exportCsv] Erro:', err);
      res.status(500).json({ error: 'Erro ao exportar CSV do caixa' });
    }
  }
}
