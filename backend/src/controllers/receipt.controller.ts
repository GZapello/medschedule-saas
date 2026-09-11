import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';

export class ReceiptController {
  // Retorna configurações de recibo da clínica atual
  static getSettings(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Identificação de clínica obrigatória' });
        return;
      }

      const stmt = db.prepare('SELECT * FROM receipt_settings WHERE tenant_id = ?');
      let settings = stmt.get(tenantId) as any;

      if (!settings) {
        // Se ainda não existir, busca dados básicos do tenant para pré-preencher
        const tenant = db.prepare('SELECT name, trade_name, cnpj_cpf, phone, email, address, city, state, zip_code FROM tenants WHERE id = ?').get(tenantId) as any;
        settings = {
          tenant_id: tenantId,
          emitter_type: 'pj',
          emitter_name: tenant?.name || '',
          emitter_trade_name: tenant?.trade_name || tenant?.name || '',
          emitter_document: tenant?.cnpj_cpf || '',
          emitter_municipal_reg: '',
          emitter_board_name: 'CRM',
          emitter_registry_number: '',
          emitter_registry_state: tenant?.state || 'SP',
          emitter_street: tenant?.address || '',
          emitter_number: '',
          emitter_complement: '',
          emitter_neighborhood: '',
          emitter_city: tenant?.city || '',
          emitter_state: tenant?.state || '',
          emitter_zip_code: tenant?.zip_code || '',
          emitter_phone: tenant?.phone || '',
          emitter_email: tenant?.email || '',
          receipt_prefix: 'REC-',
          next_sequence: 1,
          default_template_text: 'Recebemos de [CLIENTE] a importância de R$ [VALOR], referente à prestação do serviço [SERVIÇO], realizado em [DATA], pelo profissional [PROFISSIONAL].',
          is_configured: 0
        };
      }

      res.json(settings);
    } catch (err: any) {
      console.error('[ReceiptController.getSettings] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar configurações de recibo' });
    }
  }

  // Atualiza ou define as configurações de emissão de recibo
  static updateSettings(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Identificação de clínica obrigatória' });
        return;
      }

      const {
        emitterType, emitterName, emitterTradeName, emitterDocument, emitterMunicipalReg,
        emitterBoardName, emitterRegistryNumber, emitterRegistryState,
        emitterStreet, emitterNumber, emitterComplement, emitterNeighborhood,
        emitterCity, emitterState, emitterZipCode, emitterPhone, emitterEmail,
        receiptPrefix, defaultTemplateText
      } = req.body;

      if (!emitterName || !emitterDocument) {
        res.status(400).json({ error: 'Nome do emitente e CPF/CNPJ são obrigatórios' });
        return;
      }

      const id = 'rec-set-' + tenantId;
      const prefix = receiptPrefix ? String(receiptPrefix).toUpperCase() : 'REC-';
      const templateText = defaultTemplateText || 'Recebemos de [CLIENTE] a importância de R$ [VALOR], referente à prestação do serviço [SERVIÇO], realizado em [DATA], pelo profissional [PROFISSIONAL].';

      const upsertStmt = db.prepare(`
        INSERT INTO receipt_settings (
          id, tenant_id, emitter_type, emitter_name, emitter_trade_name, emitter_document,
          emitter_municipal_reg, emitter_board_name, emitter_registry_number, emitter_registry_state,
          emitter_street, emitter_number, emitter_complement, emitter_neighborhood,
          emitter_city, emitter_state, emitter_zip_code, emitter_phone, emitter_email,
          receipt_prefix, default_template_text, is_configured, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, 1, datetime('now')
        )
        ON CONFLICT(tenant_id) DO UPDATE SET
          emitter_type = excluded.emitter_type,
          emitter_name = excluded.emitter_name,
          emitter_trade_name = excluded.emitter_trade_name,
          emitter_document = excluded.emitter_document,
          emitter_municipal_reg = excluded.emitter_municipal_reg,
          emitter_board_name = excluded.emitter_board_name,
          emitter_registry_number = excluded.emitter_registry_number,
          emitter_registry_state = excluded.emitter_registry_state,
          emitter_street = excluded.emitter_street,
          emitter_number = excluded.emitter_number,
          emitter_complement = excluded.emitter_complement,
          emitter_neighborhood = excluded.emitter_neighborhood,
          emitter_city = excluded.emitter_city,
          emitter_state = excluded.emitter_state,
          emitter_zip_code = excluded.emitter_zip_code,
          emitter_phone = excluded.emitter_phone,
          emitter_email = excluded.emitter_email,
          receipt_prefix = excluded.receipt_prefix,
          default_template_text = excluded.default_template_text,
          is_configured = 1,
          updated_at = datetime('now')
      `);

      upsertStmt.run(
        id, tenantId, emitterType || 'pj', emitterName, emitterTradeName || null, emitterDocument,
        emitterMunicipalReg || null, emitterBoardName || null, emitterRegistryNumber || null, emitterRegistryState || null,
        emitterStreet || null, emitterNumber || null, emitterComplement || null, emitterNeighborhood || null,
        emitterCity || null, emitterState || null, emitterZipCode || null, emitterPhone || null, emitterEmail || null,
        prefix, templateText
      );

      logAudit(req, 'UPDATE_RECEIPT_SETTINGS', 'receipt_settings', id, { emitterName, emitterDocument });
      res.json({ message: 'Configurações de recibo salvas com sucesso', isConfigured: true });
    } catch (err: any) {
      console.error('[ReceiptController.updateSettings] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar configurações de recibo' });
    }
  }

  // Lista todos os recibos emitidos pela clínica
  static list(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Identificação de clínica obrigatória' });
        return;
      }

      const { search, startDate, endDate } = req.query;
      let query = `
        SELECT 
          r.id, r.tenant_id, r.receipt_number, r.sequence_number, r.payer_name, r.payer_document,
          r.payer_type, r.service_description, r.service_date, r.professional_name,
          r.professional_specialty, r.gross_amount, r.discount_amount, r.final_amount,
          r.payment_method, r.payment_status, r.issued_at, r.notes, r.created_by,
          t.trade_name as clinic_name, t.logo_url as clinic_logo
        FROM receipts r
        JOIN tenants t ON t.id = r.tenant_id
        WHERE r.tenant_id = ?
      `;
      const params: any[] = [tenantId];

      if (search) {
        query += ' AND (r.payer_name LIKE ? OR r.receipt_number LIKE ? OR r.professional_name LIKE ?)';
        const term = `%${search}%`;
        params.push(term, term, term);
      }

      if (startDate) {
        query += ' AND r.issued_at >= ?';
        params.push(startDate);
      }

      if (endDate) {
        query += ' AND r.issued_at <= ?';
        params.push(endDate);
      }

      query += ' ORDER BY r.sequence_number DESC';

      const stmt = db.prepare(query);
      const receipts = stmt.all(...params);

      res.json(receipts);
    } catch (err: any) {
      console.error('[ReceiptController.list] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar recibos' });
    }
  }

  // Detalhes completos de um recibo com blindagem IDOR
  static getById(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;

      const stmt = db.prepare('SELECT * FROM receipts WHERE id = ?');
      const receipt = stmt.get(id) as any;

      if (!receipt) {
        res.status(404).json({ error: 'Recibo não encontrado' });
        return;
      }

      // Proteção IDOR absoluta: clínica A nunca acessa recibo da clínica B
      if (receipt.tenant_id !== tenantId && req.user?.role !== 'superadmin') {
        res.status(403).json({ error: 'Acesso negado: este recibo pertence a outra clínica' });
        return;
      }

      // Deserializa os dados do emitente gravados no momento da emissão
      try {
        receipt.emitter = JSON.parse(receipt.emitter_json);
      } catch {
        receipt.emitter = {};
      }

      res.json(receipt);
    } catch (err: any) {
      console.error('[ReceiptController.getById] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar recibo' });
    }
  }

  // Emite um novo recibo com geração sequencial atômica e proteção de dados
  static create(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Identificação de clínica obrigatória' });
        return;
      }

      // 1. Valida se a clínica já configurou os dados obrigatórios para emissão de recibos
      const settingsStmt = db.prepare('SELECT * FROM receipt_settings WHERE tenant_id = ?');
      const settings = settingsStmt.get(tenantId) as any;

      if (!settings || settings.is_configured === 0) {
        res.status(400).json({
          error: 'É obrigatório configurar os "Dados para Emissão de Recibos" antes de emitir recibos pela clínica.'
        });
        return;
      }

      const {
        paymentId, appointmentId, patientId,
        payerType, payerName, payerDocument, payerEmail, payerPhone, payerAddress,
        serviceDescription, serviceDate, professionalName, professionalSpecialty, professionalRegistry,
        grossAmount, discountAmount, finalAmount, paymentMethod, paymentStatus,
        notes
      } = req.body;

      if (!payerName || !payerDocument || finalAmount === undefined || !serviceDescription) {
        res.status(400).json({ error: 'Tomador (nome e documento), serviço e valor são obrigatórios' });
        return;
      }

      // 2. Incrementa atomicamente a numeração sequencial desta clínica
      const seqNumber = Number(settings.next_sequence) || 1;
      const prefix = settings.receipt_prefix || 'REC-';
      const receiptNumber = `${prefix}${String(seqNumber).padStart(6, '0')}`;

      db.prepare("UPDATE receipt_settings SET next_sequence = next_sequence + 1, updated_at = datetime('now') WHERE tenant_id = ?").run(tenantId);

      // 3. Monta snapshot dos dados do emitente
      const emitterSnapshot = {
        name: settings.emitter_name,
        tradeName: settings.emitter_trade_name,
        document: settings.emitter_document,
        municipalRegistration: settings.emitter_municipal_reg,
        boardName: settings.emitter_board_name,
        registryNumber: settings.emitter_registry_number,
        registryState: settings.emitter_registry_state,
        address: `${settings.emitter_street || ''}, ${settings.emitter_number || ''} ${settings.emitter_complement || ''} - ${settings.emitter_neighborhood || ''}, ${settings.emitter_city || ''}/${settings.emitter_state || ''} - CEP ${settings.emitter_zip_code || ''}`,
        phone: settings.emitter_phone,
        email: settings.emitter_email
      };

      // 4. Monta texto padrão interpolado
      const formattedAmount = Number(finalAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const formattedDate = serviceDate || new Date().toLocaleDateString('pt-BR');
      const customText = settings.default_template_text
        .replace(/\[CLIENTE\]/g, payerName)
        .replace(/\[VALOR\]/g, formattedAmount)
        .replace(/\[SERVIÇO\]/g, serviceDescription)
        .replace(/\[DATA\]/g, formattedDate)
        .replace(/\[PROFISSIONAL\]/g, professionalName || 'Profissional Responsável');

      const receiptId = 'rec-' + uuidv4().slice(0, 8);

      const insertStmt = db.prepare(`
        INSERT INTO receipts (
          id, tenant_id, receipt_number, sequence_number, payment_id, appointment_id, patient_id,
          emitter_json, payer_type, payer_name, payer_document, payer_email, payer_phone, payer_address,
          service_description, service_date, professional_name, professional_specialty, professional_registry,
          gross_amount, discount_amount, final_amount, payment_method, payment_status, notes, custom_text,
          created_by
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?,
          ?
        )
      `);

      insertStmt.run(
        receiptId, tenantId, receiptNumber, seqNumber,
        paymentId || null, appointmentId || null, patientId || null,
        JSON.stringify(emitterSnapshot), payerType || 'pf', payerName, payerDocument,
        payerEmail || null, payerPhone || null, payerAddress || null,
        serviceDescription, formattedDate, professionalName || settings.emitter_name,
        professionalSpecialty || null, professionalRegistry || settings.emitter_registry_number,
        Number(grossAmount || finalAmount), Number(discountAmount || 0), Number(finalAmount),
        paymentMethod || 'pix', paymentStatus || 'paid', notes || null, customText,
        req.user?.name || 'Sistema'
      );

      logAudit(req, 'ISSUE_RECEIPT', 'receipts', receiptId, {
        receiptNumber,
        payerName,
        finalAmount
      });

      res.status(201).json({
        id: receiptId,
        receiptNumber,
        sequenceNumber: seqNumber,
        message: 'Recibo emitido com sucesso',
        customText
      });
    } catch (err: any) {
      console.error('[ReceiptController.create] Erro:', err);
      res.status(500).json({ error: 'Erro ao emitir recibo' });
    }
  }
}
