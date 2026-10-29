import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { extractDatePart, extractTimePart, getClinicLocalNowIso } from './document-context.service';

export interface ClinicalRecordInput {
  tenantId: string;
  patientId: string;
  professionalId?: string | null;
  appointmentId?: string | null;
  moduleType: string;
  sourceId: string;
  sourceType: string;
  title: string;
  sessionDate?: string | null;
  sessionTime?: string | null;
  sessionEndTime?: string | null;
  procedureName?: string | null;
  clinicalEvolution: string;
  technicalNotes?: string | null;
  conducts?: string | null;
  moduleData?: any;
  clinicalData?: any;
  isSealed?: boolean | number;
  createdBy?: string | null;
}

export class ClinicalRecordService {
  /**
   * Grava ou atualiza um prontuário clínico universal com garantia de idempotência.
   * Evita duplicidade usando tenant_id, patient_id e source_id como chave de unicidade.
   */
  static recordClinicalEvent(input: ClinicalRecordInput): { id: string; action: 'created' | 'updated' } {
    const {
      tenantId,
      patientId,
      professionalId = null,
      appointmentId = null,
      moduleType,
      sourceId,
      sourceType,
      title,
      procedureName = null,
      clinicalEvolution,
      technicalNotes = null,
      conducts = null,
      moduleData = null,
      clinicalData = null,
      isSealed = false,
      createdBy = null
    } = input;

    const now = new Date();
    const localNowIso = getClinicLocalNowIso(now);

    const existing = db.prepare(`
      SELECT id, is_sealed, session_date, session_time, session_end_time, edit_history_json FROM records
      WHERE tenant_id = ? AND patient_id = ? AND source_id = ?
      LIMIT 1
    `).get(tenantId, patientId, sourceId) as any;

    const apptRow = appointmentId
      ? (db.prepare('SELECT start_time, attendance_start_at, attendance_end_at FROM appointments WHERE id = ? AND tenant_id = ?').get(appointmentId, tenantId) as any)
      : null;

    const sessionDate =
      extractDatePart(input.sessionDate) ||
      extractDatePart(apptRow?.attendance_start_at) ||
      extractDatePart(existing?.session_date) ||
      extractDatePart(apptRow?.start_time) ||
      extractDatePart(localNowIso) ||
      now.toISOString().split('T')[0];

    let sessionTime: string | null;
    if (input.sessionTime === null) {
      sessionTime = null;
    } else if (input.sessionTime !== undefined && String(input.sessionTime).trim() !== '') {
      sessionTime = extractTimePart(input.sessionTime) || String(input.sessionTime).trim();
    } else {
      sessionTime =
        extractTimePart(apptRow?.attendance_start_at) ||
        extractTimePart(existing?.session_time) ||
        extractTimePart(apptRow?.start_time) ||
        extractTimePart(localNowIso);
    }

    let sessionEndTime: string | null = null;
    if (input.sessionEndTime === null) {
      sessionEndTime = null;
    } else if (input.sessionEndTime !== undefined && String(input.sessionEndTime).trim() !== '') {
      sessionEndTime = extractTimePart(input.sessionEndTime) || String(input.sessionEndTime).trim();
    } else {
      sessionEndTime =
        extractTimePart(apptRow?.attendance_end_at) ||
        extractTimePart(existing?.session_end_time) ||
        null;
    }

    // Garante que professional_id nunca viole constraint NOT NULL da tabela records
    let effectiveProfId = professionalId || null;
    if (!effectiveProfId) {
      const fallbackProf = db.prepare('SELECT id FROM professionals WHERE tenant_id = ? AND active = 1 ORDER BY created_at ASC LIMIT 1').get(tenantId) as any;
      if (fallbackProf) {
        effectiveProfId = fallbackProf.id;
      } else {
        const anyProf = db.prepare('SELECT id FROM professionals WHERE tenant_id = ? LIMIT 1').get(tenantId) as any;
        if (anyProf) {
          effectiveProfId = anyProf.id;
        } else {
          effectiveProfId = 'prof-tech-' + (tenantId.length > 8 ? tenantId.slice(0, 8) : tenantId);
          db.prepare(`
            INSERT OR IGNORE INTO professionals (id, tenant_id, name, registration_type, registration_number, active)
            VALUES (?, ?, 'Responsável Técnico', 'REG', '00000', 1)
          `).run(effectiveProfId, tenantId);
        }
      }
    }

    const moduleDataJson = moduleData ? (typeof moduleData === 'string' ? moduleData : JSON.stringify(moduleData)) : null;
    const clinicalDataJson = clinicalData ? (typeof clinicalData === 'string' ? clinicalData : JSON.stringify(clinicalData)) : null;

    if (existing) {
      if (existing.is_sealed === 1) {
        // Prontuário lacrado não pode ser modificado (validade jurídica)
        return { id: existing.id, action: 'updated' };
      }

      // Adiciona ao histórico de auditoria do prontuário
      let history: any[] = [];
      try {
        if (existing.edit_history_json) {
          history = JSON.parse(existing.edit_history_json);
        }
      } catch (_) {}

      const timeAudit: Record<string, any> = {};
      if (
        existing.session_date !== sessionDate ||
        (existing.session_time || null) !== (sessionTime || null) ||
        (existing.session_end_time || null) !== (sessionEndTime || null)
      ) {
        timeAudit.previous_session_date = existing.session_date || null;
        timeAudit.previous_session_time = existing.session_time || null;
        timeAudit.previous_session_end_time = existing.session_end_time || null;
        timeAudit.new_session_date = sessionDate;
        timeAudit.new_session_time = sessionTime;
        timeAudit.new_session_end_time = sessionEndTime;
        timeAudit.edited_by = createdBy || 'Sistema';
        timeAudit.edited_at = now.toISOString();
      }

      history.push({
        updated_at: now.toISOString(),
        updated_by: createdBy || 'Sistema',
        reason: `Atualização clínica sincronizada via módulo ${moduleType}`,
        ...timeAudit
      });

      db.prepare(`
        UPDATE records SET
          session_date = ?,
          session_time = ?,
          session_end_time = COALESCE(?, session_end_time),
          title = ?,
          procedure_name = COALESCE(?, procedure_name),
          clinical_evolution = ?,
          technical_notes = COALESCE(?, technical_notes),
          conducts = COALESCE(?, conducts),
          module_type = ?,
          source_type = ?,
          module_data_json = COALESCE(?, module_data_json),
          clinical_data_json = COALESCE(?, clinical_data_json),
          edit_history_json = ?,
          updated_by = ?,
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(
        sessionDate,
        sessionTime,
        sessionEndTime,
        title,
        procedureName,
        clinicalEvolution,
        technicalNotes,
        conducts,
        moduleType,
        sourceType,
        moduleDataJson,
        clinicalDataJson,
        JSON.stringify(history),
        createdBy || 'Sistema',
        existing.id,
        tenantId
      );

      return { id: existing.id, action: 'updated' };
    }

    // 2. Cria novo prontuário universal
    const recordId = 'rec-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO records (
        id, tenant_id, patient_id, appointment_id, professional_id,
        session_date, session_time, session_end_time, procedure_name, title, clinical_evolution,
        technical_notes, conducts, clinical_data_json, module_type, module_data_json,
        source_id, source_type, is_sealed, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      recordId,
      tenantId,
      patientId,
      appointmentId,
      effectiveProfId,
      sessionDate,
      sessionTime,
      sessionEndTime,
      procedureName,
      title,
      clinicalEvolution,
      technicalNotes,
      conducts,
      clinicalDataJson,
      moduleType,
      moduleDataJson,
      sourceId,
      sourceType,
      isSealed ? 1 : 0,
      createdBy || 'Sistema',
      createdBy || 'Sistema'
    );

    return { id: recordId, action: 'created' };
  }

  /**
   * Helper para formatar evolução de plano de tratamento odontológico em português claro
   */
  static formatDentalTreatmentPlanEvolution(
    title: string,
    items: any[],
    totalValue: number,
    discountValue: number,
    finalValue: number,
    paymentTerms?: string
  ): string {
    const procedureItems = items.filter(
      i => (i.itemType || i.item_type || 'service') !== 'product' && !i.productId
    );
    const productItems = items.filter(
      i => (i.itemType || i.item_type) === 'product' || Boolean(i.productId)
    );

    let text = `Plano de Tratamento Odontológico: ${title}\n\n`;

    if (procedureItems.length > 0) {
      const formattedProcedures = procedureItems.map((i, idx) => {
        const toothStr = i.tooth && i.tooth !== 'Geral' ? ` [Dente ${i.tooth}${i.face && i.face !== 'Geral' ? ` - Face ${i.face}` : ''}]` : '';
        const val = i.value !== undefined ? i.value : (i.unitPrice !== undefined ? i.unitPrice : i.unit_price);
        const valStr = val !== undefined ? ` - R$ ${Number(val).toFixed(2)}` : '';
        return `${idx + 1}. ${i.procedure || i.description || 'Procedimento'}${toothStr}${valStr}`;
      }).join('\n');
      text += `Procedimentos Propostos:\n${formattedProcedures}\n\n`;
    }

    if (productItems.length > 0) {
      const formattedProducts = productItems.map((i, idx) => {
        const qty = Number(i.quantity) || 1;
        const unit = i.unit ? ` ${i.unit}` : ' un';
        const unitPrice = Number(i.unitPrice !== undefined ? i.unitPrice : (i.unit_price !== undefined ? i.unit_price : (i.value || 0)));
        const lineTotal = Number(i.totalPrice !== undefined ? i.totalPrice : (i.total_price !== undefined ? i.total_price : (qty * unitPrice)));
        return `${idx + 1}. ${i.productName || i.description || 'Produto'} — ${qty}${unit} — R$ ${lineTotal.toFixed(2)}`;
      }).join('\n');
      text += `Produtos / Insumos Previstos:\n${formattedProducts}\n\n`;
    }

    if (procedureItems.length === 0 && productItems.length === 0 && items.length > 0) {
      const formattedItems = items.map((i, idx) => `${idx + 1}. ${i.procedure || i.description || 'Item'}`).join('\n');
      text += `Itens Propostos:\n${formattedItems}\n\n`;
    }

    text += `Valor Bruto: R$ ${Number(totalValue || 0).toFixed(2)}\n`;
    if (Number(discountValue || 0) > 0) {
      text += `Desconto Concedido: R$ ${Number(discountValue).toFixed(2)}\n`;
    }
    text += `Valor Final Líquido: R$ ${Number(finalValue || 0).toFixed(2)}`;
    if (paymentTerms) {
      text += `\nCondições de Pagamento: ${paymentTerms}`;
    }
    return text;
  }

  /**
   * Helper para formatar evolução de prótese odontológica em português claro
   */
  static formatDentalProstheticEvolution(
    workType: string,
    labName: string,
    toothNumber?: string,
    shadeColor?: string,
    material?: string,
    expectedDate?: string,
    costValue?: number,
    status: string = 'sent_to_lab'
  ): string {
    const statusLabels: Record<string, string> = {
      sent_to_lab: 'Enviado ao Laboratório',
      in_production: 'Em Confecção',
      delivered_to_clinic: 'Entregue na Clínica',
      tested_adjusted: 'Provado e Ajustado',
      installed: 'Instalado em Boca',
      canceled: 'Cancelado'
    };
    const statusPt = statusLabels[status] || status;

    let text = `Trabalho Protético: ${workType}\n`;
    text += `Laboratório: ${labName}\n`;
    text += `Status Atual: ${statusPt}\n`;
    if (toothNumber) text += `Dente/Região: ${toothNumber}\n`;
    if (shadeColor) text += `Cor (Escala VITA): ${shadeColor}\n`;
    if (material) text += `Material: ${material}\n`;
    if (expectedDate) {
      try {
        const [y, m, d] = expectedDate.split('-');
        text += `Previsão de Entrega: ${d}/${m}/${y}\n`;
      } catch (_) {
        text += `Previsão de Entrega: ${expectedDate}\n`;
      }
    }
    if (costValue && Number(costValue) > 0) {
      text += `Custo Laboratorial: R$ ${Number(costValue).toFixed(2)}\n`;
    }
    return text.trim();
  }
}
