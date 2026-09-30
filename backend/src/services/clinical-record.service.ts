import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

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
    const sessionDate = input.sessionDate || now.toISOString().split('T')[0];
    const sessionTime = input.sessionTime || now.toTimeString().slice(0, 5);

    const moduleDataJson = moduleData ? (typeof moduleData === 'string' ? moduleData : JSON.stringify(moduleData)) : null;
    const clinicalDataJson = clinicalData ? (typeof clinicalData === 'string' ? clinicalData : JSON.stringify(clinicalData)) : null;

    // 1. Verifica se já existe registro com este source_id para este paciente no tenant
    const existing = db.prepare(`
      SELECT id, is_sealed, edit_history_json FROM records
      WHERE tenant_id = ? AND patient_id = ? AND source_id = ?
      LIMIT 1
    `).get(tenantId, patientId, sourceId) as any;

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

      history.push({
        updated_at: now.toISOString(),
        updated_by: createdBy || 'Sistema',
        reason: `Atualização clínica sincronizada via módulo ${moduleType}`
      });

      db.prepare(`
        UPDATE records SET
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
        session_date, session_time, procedure_name, title, clinical_evolution,
        technical_notes, conducts, clinical_data_json, module_type, module_data_json,
        source_id, source_type, is_sealed, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      recordId,
      tenantId,
      patientId,
      appointmentId,
      professionalId,
      sessionDate,
      sessionTime,
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
    items: Array<{ tooth?: string; face?: string; procedure: string; value?: number }>,
    totalValue: number,
    discountValue: number,
    finalValue: number,
    paymentTerms?: string
  ): string {
    const formattedItems = items.map((i, idx) => {
      const toothStr = i.tooth ? ` [Dente ${i.tooth}${i.face ? ` - Face ${i.face}` : ''}]` : '';
      const valStr = i.value !== undefined ? ` - R$ ${Number(i.value).toFixed(2)}` : '';
      return `${idx + 1}. ${i.procedure}${toothStr}${valStr}`;
    }).join('\n');

    let text = `Plano de Tratamento Odontológico: ${title}\n\nProcedimentos Propostos:\n${formattedItems}\n\n`;
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
