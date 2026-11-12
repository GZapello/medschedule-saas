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

  // Consulta recibo emitido vinculado a um agendamento específico
  static getByAppointmentId(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { appointmentId } = req.params;
      if (!tenantId) {
        res.status(400).json({ error: 'Identificação de clínica obrigatória' });
        return;
      }

      const stmt = db.prepare(`
        SELECT 
          r.id, r.tenant_id, r.receipt_number, r.sequence_number, r.payment_id, r.appointment_id, r.patient_id,
          r.emitter_json, r.payer_type, r.payer_name, r.payer_document, r.payer_email, r.payer_phone, r.payer_address,
          r.service_description, r.service_date, r.professional_name, r.professional_specialty, r.professional_registry,
          r.gross_amount, r.discount_amount, r.final_amount, r.payment_method, r.payment_status, r.notes, r.custom_text,
          r.issued_at, r.created_by,
          t.trade_name as clinic_name, t.logo_url as clinic_logo
        FROM receipts r
        JOIN tenants t ON t.id = r.tenant_id
        WHERE r.appointment_id = ? AND r.tenant_id = ?
        ORDER BY r.sequence_number DESC LIMIT 1
      `);
      const receipt = stmt.get(appointmentId, tenantId) as any;

      if (!receipt) {
        res.status(404).json({ error: 'Nenhum recibo emitido para este atendimento' });
        return;
      }

      try {
        receipt.emitter = JSON.parse(receipt.emitter_json);
      } catch {
        receipt.emitter = {};
      }

      res.json(receipt);
    } catch (err: any) {
      console.error('[ReceiptController.getByAppointmentId] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar recibo do atendimento' });
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

      const {
        paymentId, appointmentId, patientId,
        payerType, payerName, payerDocument, payerEmail, payerPhone, payerAddress,
        serviceDescription, serviceDate, professionalName, professionalSpecialty, professionalRegistry,
        grossAmount, discountAmount, finalAmount, paymentMethod, paymentStatus,
        notes
      } = req.body;

      // 0. Idempotência absoluta: se já foi emitido recibo para este atendimento ou pagamento, retorna o existente sem duplicar numeração
      let resolvedPaymentId = paymentId || null;
      if (!resolvedPaymentId && appointmentId) {
        const apptPay = db.prepare("SELECT id FROM payments WHERE appointment_id = ? AND tenant_id = ? AND status NOT IN ('cancelled', 'refunded') ORDER BY created_at ASC LIMIT 1").get(appointmentId, tenantId) as any;
        if (apptPay?.id) resolvedPaymentId = apptPay.id;
      }

      if (appointmentId || resolvedPaymentId) {
        let existingReceipt: any = null;
        if (appointmentId && resolvedPaymentId) {
          existingReceipt = db.prepare('SELECT * FROM receipts WHERE tenant_id = ? AND (appointment_id = ? OR payment_id = ?) ORDER BY sequence_number DESC LIMIT 1').get(tenantId, appointmentId, resolvedPaymentId);
        } else if (appointmentId) {
          existingReceipt = db.prepare('SELECT * FROM receipts WHERE tenant_id = ? AND appointment_id = ? ORDER BY sequence_number DESC LIMIT 1').get(tenantId, appointmentId);
        } else if (resolvedPaymentId) {
          existingReceipt = db.prepare('SELECT * FROM receipts WHERE tenant_id = ? AND payment_id = ? ORDER BY sequence_number DESC LIMIT 1').get(tenantId, resolvedPaymentId);
        }

        if (existingReceipt) {
          try {
            existingReceipt.emitter = JSON.parse(existingReceipt.emitter_json);
          } catch {
            existingReceipt.emitter = {};
          }
          res.json({
            id: existingReceipt.id,
            receiptNumber: existingReceipt.receipt_number,
            sequenceNumber: existingReceipt.sequence_number,
            message: 'Recibo já emitido anteriormente para este atendimento',
            customText: existingReceipt.custom_text,
            receipt: existingReceipt,
            alreadyIssued: true
          });
          return;
        }
      }

      // 1. Valida ou recupera configurações de recibo da clínica
      const settingsStmt = db.prepare('SELECT * FROM receipt_settings WHERE tenant_id = ?');
      let settings = settingsStmt.get(tenantId) as any;

      if (!settings || settings.is_configured === 0) {
        const tenant = db.prepare('SELECT name, trade_name, cnpj_cpf, phone, email, address, city, state, zip_code, logo_url FROM tenants WHERE id = ?').get(tenantId) as any;
        if (tenant && (tenant.name || tenant.trade_name)) {
          const defaultSettingsId = 'rec-set-' + tenantId;
          const defaultName = tenant.name || tenant.trade_name || 'Clínica';
          const defaultTradeName = tenant.trade_name || tenant.name || defaultName;
          const defaultDoc = tenant.cnpj_cpf || 'Não informado';
          const prefix = 'REC-';
          const template = 'Recebemos de [CLIENTE] a importância de R$ [VALOR], referente à prestação do serviço [SERVIÇO], realizado em [DATA], pelo profissional [PROFISSIONAL].';

          db.prepare(`
            INSERT INTO receipt_settings (
              id, tenant_id, emitter_type, emitter_name, emitter_trade_name, emitter_document,
              emitter_municipal_reg, emitter_board_name, emitter_registry_number, emitter_registry_state,
              emitter_street, emitter_number, emitter_complement, emitter_neighborhood,
              emitter_city, emitter_state, emitter_zip_code, emitter_phone, emitter_email,
              receipt_prefix, default_template_text, is_configured, updated_at
            ) VALUES (
              ?, ?, 'pj', ?, ?, ?,
              null, null, null, ?,
              ?, null, null, null,
              ?, ?, ?, ?, ?,
              ?, ?, 1, datetime('now')
            )
            ON CONFLICT(tenant_id) DO UPDATE SET
              emitter_name = COALESCE(NULLIF(receipt_settings.emitter_name, ''), excluded.emitter_name),
              emitter_document = COALESCE(NULLIF(receipt_settings.emitter_document, ''), excluded.emitter_document),
              is_configured = 1
          `).run(
            defaultSettingsId, tenantId, defaultName, defaultTradeName, defaultDoc,
            tenant.state || 'SP', tenant.address || null, tenant.city || null, tenant.state || null,
            tenant.zip_code || null, tenant.phone || null, tenant.email || null,
            prefix, template
          );

          settings = db.prepare('SELECT * FROM receipt_settings WHERE tenant_id = ?').get(tenantId) as any;
        }
      }

      if (!settings || settings.is_configured === 0) {
        res.status(400).json({
          error: 'É obrigatório configurar os "Dados para Emissão de Recibos" antes de emitir recibos pela clínica.'
        });
        return;
      }

      const resolvedPayerDoc = (payerDocument && String(payerDocument).trim()) ? String(payerDocument).trim() : 'Não informado';

      if (!payerName || finalAmount === undefined || !serviceDescription) {
        res.status(400).json({ error: 'Tomador (nome), serviço e valor são obrigatórios' });
        return;
      }

      // 2. Incrementa atomicamente a numeração sequencial desta clínica
      const seqNumber = Number(settings.next_sequence) || 1;
      const prefix = settings.receipt_prefix || 'REC-';
      const receiptNumber = `${prefix}${String(seqNumber).padStart(6, '0')}`;

      db.prepare("UPDATE receipt_settings SET next_sequence = next_sequence + 1, updated_at = datetime('now') WHERE tenant_id = ?").run(tenantId);

      // 3. Monta snapshot dos dados do emitente
      const tenantRow = db.prepare('SELECT logo_url, city, state FROM tenants WHERE id = ?').get(tenantId) as any;
      const emitterSnapshot = {
        name: settings.emitter_name,
        tradeName: settings.emitter_trade_name,
        document: settings.emitter_document,
        municipalRegistration: settings.emitter_municipal_reg,
        boardName: settings.emitter_board_name,
        registryNumber: settings.emitter_registry_number,
        registryState: settings.emitter_registry_state,
        address: `${settings.emitter_street || ''}, ${settings.emitter_number || ''} ${settings.emitter_complement || ''} - ${settings.emitter_neighborhood || ''}, ${settings.emitter_city || tenantRow?.city || ''}/${settings.emitter_state || tenantRow?.state || ''} - CEP ${settings.emitter_zip_code || ''}`,
        city: settings.emitter_city || tenantRow?.city || '',
        state: settings.emitter_registry_state || settings.emitter_state || tenantRow?.state || '',
        phone: settings.emitter_phone,
        email: settings.emitter_email,
        logoUrl: tenantRow?.logo_url || null
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
        resolvedPaymentId || null, appointmentId || null, patientId || null,
        JSON.stringify(emitterSnapshot), payerType || 'pf', payerName, resolvedPayerDoc,
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

      const fullReceipt = {
        id: receiptId,
        tenant_id: tenantId,
        receipt_number: receiptNumber,
        sequence_number: seqNumber,
        payment_id: resolvedPaymentId || null,
        appointment_id: appointmentId || null,
        patient_id: patientId || null,
        emitter: emitterSnapshot,
        payer_type: payerType || 'pf',
        payer_name: payerName,
        payer_document: resolvedPayerDoc,
        payer_email: payerEmail || null,
        payer_phone: payerPhone || null,
        payer_address: payerAddress || null,
        service_description: serviceDescription,
        service_date: formattedDate,
        professional_name: professionalName || settings.emitter_name,
        professional_specialty: professionalSpecialty || null,
        professional_registry: professionalRegistry || settings.emitter_registry_number,
        gross_amount: Number(grossAmount || finalAmount),
        discount_amount: Number(discountAmount || 0),
        final_amount: Number(finalAmount),
        payment_method: paymentMethod || 'pix',
        payment_status: paymentStatus || 'paid',
        notes: notes || null,
        custom_text: customText,
        issued_at: new Date().toISOString(),
        created_by: req.user?.name || 'Sistema',
        clinic_name: settings.emitter_name,
        clinic_logo: tenantRow?.logo_url || null
      };

      res.status(201).json({
        id: receiptId,
        receiptNumber,
        sequenceNumber: seqNumber,
        message: 'Recibo emitido com sucesso',
        customText,
        receipt: fullReceipt
      });
    } catch (err: any) {
      console.error('[ReceiptController.create] Erro:', err);
      res.status(500).json({ error: 'Erro ao emitir recibo' });
    }
  }
}
