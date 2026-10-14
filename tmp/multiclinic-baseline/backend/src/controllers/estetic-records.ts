import { Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../config/database';
import { ClinicalRecordService } from '../services/clinical-record.service';
import { ClinicalInventoryService } from '../services/clinical-inventory.service';

type Access = (req: Request, area?: string) => { allowed: boolean; reason?: string; allowedAreas: string[] };
type Kind = 'assessments' | 'plans' | 'procedures' | 'evolutions' | 'returns' | 'photos';
const columns: Record<Kind, Record<string, string>> = {
  assessments: { assessmentDate: 'assessment_date', chiefComplaint: 'chief_complaint', objectives: 'objectives', clinicalHistory: 'clinical_history', specificData: 'specific_data_json', observations: 'observations' },
  plans: { title: 'title', objectives: 'objectives', items: 'items_json', notes: 'notes', status: 'status' },
  procedures: { planId: 'plan_id', planItemId: 'plan_item_id', region: 'region', procedureId: 'procedure_id', procedureName: 'procedure_name', productId: 'product_id', productName: 'product_name', manufacturer: 'manufacturer', batchLot: 'batch_lot', expiryDate: 'expiry_date', quantity: 'quantity', unit: 'unit', observation: 'observation', techniqueNotes: 'technique_notes', adverseEvents: 'adverse_events', returnDate: 'return_date', anatomicalMapId: 'anatomical_map_id', datePerformed: 'date_performed', postInstructions: 'post_instructions' },
  evolutions: { procedureId: 'procedure_id', evolutionText: 'evolution_text', observedResponse: 'observed_response', adverseEvents: 'adverse_events', conduct: 'conduct', returnDate: 'return_date', evolutionDate: 'evolution_date' },
  returns: { procedureRecordId: 'procedure_record_id', returnAssessment: 'return_assessment', adverseEvents: 'adverse_events', conduct: 'conduct', nextReturnDate: 'next_return_date', scheduledDate: 'scheduled_date', actualDate: 'actual_date', status: 'status', touchupRequired: 'touchup_required', touchupDescription: 'touchup_description' },
  photos: { procedureId: 'procedure_id', viewType: 'view_type', fileUrl: 'file_url', fileKey: 'file_key', observation: 'observation', photoDate: 'photo_date', photoType: 'photo_type' }
};
class InputError extends Error { constructor(message: string, public status = 400, public field?: string) { super(message); } }
const fail = (message: string, field?: string): never => { throw new InputError(message, 400, field); };
function patient(req: Request, id: string) {
  if (!id) fail('Selecione um paciente.', 'patientId');
  if (!db.prepare('SELECT id FROM patients WHERE id = ? AND tenant_id = ?').get(id, req.tenantId)) throw new InputError('Paciente não encontrado nesta clínica.', 404, 'patientId');
}
function date(value: any, field: string) {
  if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T12:00:00Z')) || new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) !== value)) fail('Informe uma data válida.', field);
}
function rowAccess(req: Request, access: Access, row: any) {
  if (!row) throw new InputError('Registro não encontrado.', 404);
  const auth = access(req, row.area);
  if (!auth.allowed) throw new InputError(auth.reason || 'Acesso negado.', 403);
  patient(req, row.patient_id);
}
function links(req: Request, row: any) {
  patient(req, row.patient_id);
  if (row.appointment_id && !db.prepare('SELECT id FROM appointments WHERE id = ? AND tenant_id = ? AND patient_id = ? AND professional_id = ?').get(row.appointment_id, req.tenantId, row.patient_id, row.professional_id)) fail('Atendimento não corresponde ao paciente e profissional.', 'appointmentId');
  for (const [column, table] of [['procedure_id', 'estetic_procedures'], ['procedure_record_id', 'estetic_procedures'], ['plan_id', 'estetic_plans'], ['anatomical_map_id', 'body_assessments']] as const) {
    if (!row[column] || (column === 'procedure_id' && row.procedure_name)) continue; // Identificador de catálogo no procedimento.
    const linked = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND tenant_id = ? AND patient_id = ?`).get(row[column], req.tenantId, row.patient_id) as any;
    if (!linked || (linked.area && linked.area !== row.area)) fail('Vínculo pertence a outro paciente ou área.', column);
    if (column === 'anatomical_map_id' && String(linked.module).startsWith('estetic:') && linked.module !== `estetic:${row.area}`) fail('O mapa pertence a outra área estética.', column);
  }
  if (row.plan_item_id) {
    const plan = row.plan_id && db.prepare('SELECT items_json FROM estetic_plans WHERE id = ? AND tenant_id = ?').get(row.plan_id, req.tenantId) as any;
    if (!plan || !JSON.parse(plan.items_json).some((item: any) => item.id === row.plan_item_id)) fail('Selecione um item válido do planejamento.', 'planItemId');
  }
}
function validate(kind: Kind, row: any) {
  for (const key of Object.keys(row)) if (key.endsWith('_date') || ['assessment_date', 'date_performed', 'evolution_date'].includes(key)) date(row[key], key);
  const required: Partial<Record<Kind, string[]>> = { procedures: ['procedure_name', 'region', 'date_performed'], evolutions: ['evolution_text', 'evolution_date'], photos: ['file_url', 'photo_date', 'view_type'] };
  const labels: Record<string, string> = { procedure_name: 'procedimento', region: 'região anatômica', date_performed: 'data de realização', evolution_text: 'texto da evolução', evolution_date: 'data da evolução', file_url: 'fotografia', photo_date: 'data da fotografia', view_type: 'ângulo da fotografia' };
  for (const key of required[kind] || []) if (!String(row[key] ?? '').trim()) fail(`Preencha ${labels[key]}.`, key);
  if (kind === 'procedures') {
    if (row.quantity != null && (!Number.isFinite(Number(row.quantity)) || Number(row.quantity) < 0)) fail('Quantidade deve ser um número positivo.', 'quantity');
    if (row.quantity != null) row.quantity = Number(row.quantity);
  }
  if (kind === 'plans') {
    if (!['PLANEJADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO'].includes(row.status)) fail('Status de planejamento inválido.', 'status');
    let items: any[];
    try { items = JSON.parse(row.items_json); } catch { fail('Itens inválidos.', 'items'); }
    if (!Array.isArray(items!)) fail('Itens inválidos.', 'items');
    row.items_json = JSON.stringify(items!.map((item: any) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) fail('Item de planejamento inválido.', 'items');
      if (!String(item.procedure_name || item.procedureName || '').trim()) fail('Informe o procedimento do item.', 'items');
      for (const field of ['sessions_planned', 'recommended_interval_days']) if (item[field] !== '' && item[field] != null && (!Number.isFinite(Number(item[field])) || Number(item[field]) < 0)) fail('Quantidade de sessões e intervalo devem ser positivos.', field);
      return { ...item, id: item.id || uuid(), status: item.status || 'PLANEJADO' };
    }));
  }
  if (kind === 'assessments') {
    let data: any;
    try { data = JSON.parse(row.specific_data_json); } catch { fail('Dados da avaliação inválidos.', 'specificData'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('Dados da avaliação inválidos.', 'specificData');
  }
  if (kind === 'returns') {
    if (!['AGENDADO', 'COMPARECEU', 'RETOQUE_REALIZADO', 'ALTA_CICLO', 'CANCELADO'].includes(row.status)) fail('Status de retorno inválido.', 'status');
    if (row.status === 'AGENDADO' && !row.scheduled_date) fail('Informe a data do retorno.', 'scheduled_date');
    row.return_assessment ??= '';
    if (row.touchup_required != null && ![true, false, 0, 1].includes(row.touchup_required)) fail('Informe se é necessário retoque.', 'touchup_required');
    if (row.touchup_required != null) row.touchup_required = Number(row.touchup_required);
  }
  if (kind === 'photos') {
    if (!['ANTES', 'DEPOIS', 'ACOMPANHAMENTO', 'RETORNO'].includes(row.photo_type)) fail('Tipo de foto inválido.', 'photo_type');
    if (!/^https?:\/\//i.test(row.file_url) && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(row.file_url)) fail('Use uma imagem PNG, JPEG ou WebP, ou URL HTTP válida.', 'file_url');
    if (row.file_url.length > 7 * 1024 * 1024) fail('A fotografia deve ter no máximo 5 MB.', 'file_url');
  }
}
function movement(req: Request, row: any, delta: number) {
  if (!delta) return;
  const isRefund = delta > 0;
  if (isRefund) {
    try {
      ClinicalInventoryService.refundStock(req.tenantId!, {
        itemId: row.product_id,
        quantity: delta,
        professionalId: row.professional_id,
        patientId: row.patient_id,
        appointmentId: row.appointment_id || null,
        moduleType: 'ZemdaEstetic',
        sourceType: 'estetic_procedure',
        sourceId: row.id,
        reason: 'Procedimento estético (estorno): ' + (row.procedure_name || ''),
        batch: row.batch_lot,
        userId: req.user?.userId
      });
    } catch (err: any) {
      fail(err.message, err.field || 'productId');
    }
  } else {
    try {
      ClinicalInventoryService.deductStock(req.tenantId!, {
        itemId: row.product_id,
        quantity: Math.abs(delta),
        professionalId: row.professional_id,
        patientId: row.patient_id,
        appointmentId: row.appointment_id || null,
        moduleType: 'ZemdaEstetic',
        sourceType: 'estetic_procedure',
        sourceId: row.id,
        reason: 'Procedimento estético: ' + (row.procedure_name || ''),
        unit: row.unit,
        batch: row.batch_lot,
        userId: req.user?.userId
      });
    } catch (err: any) {
      fail(err.message, err.field || 'quantity');
    }
  }
}
function updatePlanProgress(req: Request, row: any) {
  if (!row?.plan_id || !row.plan_item_id) return;
  const plan = db.prepare('SELECT * FROM estetic_plans WHERE id = ? AND tenant_id = ?').get(row.plan_id, req.tenantId) as any;
  if (!plan) return;
  const count = (db.prepare('SELECT COUNT(*) AS total FROM estetic_procedures WHERE plan_id = ? AND plan_item_id = ? AND tenant_id = ?').get(row.plan_id, row.plan_item_id, req.tenantId) as any).total;
  const items = JSON.parse(plan.items_json).map((item: any) => item.id !== row.plan_item_id ? item : { ...item, sessions_completed: count, status: count >= Number(item.sessions_planned || 1) ? 'REALIZADO' : count ? 'EM_ANDAMENTO' : 'PLANEJADO' });
  const status = plan.status === 'CANCELADO' ? plan.status : items.length && items.every((item: any) => item.status === 'REALIZADO') ? 'CONCLUIDO' : items.some((item: any) => Number(item.sessions_completed) > 0) ? 'EM_ANDAMENTO' : 'PLANEJADO';
  db.prepare("UPDATE estetic_plans SET items_json = ?, status = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").run(JSON.stringify(items), status, row.plan_id, req.tenantId);
}
function sync(req: Request, kind: Kind, row: any) {
  if (kind === 'photos' || kind === 'plans') return;
  const title = { assessments: 'Avaliação estética', procedures: 'Procedimento estético', evolutions: 'Evolução estética', returns: 'Retorno estético' }[kind];
  const text = [row.chief_complaint, row.objectives, row.clinical_history, row.procedure_name,
    row.region && `Região: ${row.region}`, row.product_name && `Produto: ${row.product_name}`,
    row.batch_lot && `Lote: ${row.batch_lot}`, row.expiry_date && `Validade: ${row.expiry_date}`,
    row.quantity != null && `Quantidade: ${row.quantity} ${row.unit || ''}`,
    row.post_instructions && `Orientações: ${row.post_instructions}`, row.adverse_events && `Intercorrências: ${row.adverse_events}`,
    row.evolution_text, row.observed_response, row.return_assessment, row.conduct, row.observations, row.technique_notes].filter(Boolean).join('\n');
  const record = ClinicalRecordService.recordClinicalEvent({ tenantId: req.tenantId!, patientId: row.patient_id, professionalId: row.professional_id, appointmentId: row.appointment_id || null, moduleType: 'ZemdaEstetic', sourceId: row.id, sourceType: `estetic_${kind === 'assessments' ? 'assessment' : kind === 'procedures' ? 'procedure' : kind === 'evolutions' ? 'evolution' : 'return'}`, title: `${title}: ${row.area}`, procedureName: row.procedure_name || title, sessionDate: row.assessment_date || row.date_performed || row.evolution_date || row.actual_date || row.scheduled_date || row.created_at?.slice(0, 10), clinicalEvolution: text || title, moduleData: { ...row, specificData: row.specific_data_json ? JSON.parse(row.specific_data_json) : undefined }, createdBy: req.user?.name || 'Profissional' });
  db.prepare('UPDATE records SET appointment_id = COALESCE(?, appointment_id), session_date = COALESCE(?, session_date) WHERE id = ? AND tenant_id = ? AND is_sealed = 0').run(row.appointment_id || null, row.assessment_date || row.date_performed || row.evolution_date || row.actual_date || row.scheduled_date || null, record.id, req.tenantId);
}
export function esteticRecords(req: Request, res: Response, access: Access, kind: Kind, operation: 'list' | 'create' | 'update' | 'delete' | 'item'): void {
  try {
    const table = `estetic_${kind}`;
    const old = ['update', 'delete', 'item'].includes(operation) ? db.prepare(`SELECT * FROM ${table} WHERE id = ? AND tenant_id = ?`).get(req.params.id, req.tenantId) as any : null;
    if (old) rowAccess(req, access, old);
    else if (['update', 'delete', 'item'].includes(operation)) throw new InputError('Registro não encontrado.', 404);
    const auth = access(req, req.body?.area || req.query?.area as string);
    if (!auth.allowed) throw new InputError(auth.reason || 'Acesso negado.', 403);
    if (operation === 'list') {
      const id = req.query.patientId as string;
      patient(req, id);
      const area = String(req.query?.area || '').toUpperCase();
      const rows = db.prepare(`SELECT a.*, p.name AS professional_name FROM ${table} a LEFT JOIN professionals p ON p.id = a.professional_id AND p.tenant_id = a.tenant_id WHERE a.tenant_id = ? AND a.patient_id = ? ORDER BY a.created_at DESC, a.rowid DESC`).all(req.tenantId, id).filter((row: any) => auth.allowedAreas.includes(row.area) && (!area || area === 'TODOS' || row.area === area));
      res.json(rows); return;
    }
    const write = () => {
      if (operation === 'delete') {
        if (kind === 'plans' && db.prepare('SELECT id FROM estetic_procedures WHERE plan_id = ? AND tenant_id = ? LIMIT 1').get(old.id, req.tenantId)) fail('Este plano tem procedimentos realizados. Cancele o planejamento para preservar a rastreabilidade.');
        if (kind === 'procedures' && old.inventory_deducted) movement(req, old, Number(old.deducted_quantity));
        if (kind === 'procedures') {
          for (const [related, column] of [['evolutions', 'procedure_id'], ['returns', 'procedure_record_id'], ['photos', 'procedure_id']]) {
            db.prepare(`UPDATE estetic_${related} SET ${column} = NULL WHERE ${column} = ? AND tenant_id = ? AND patient_id = ?`).run(old.id, req.tenantId, old.patient_id);
          }
        }
        db.prepare(`DELETE FROM ${table} WHERE id = ? AND tenant_id = ?`).run(old.id, req.tenantId);
        if (kind === 'procedures') updatePlanProgress(req, old);
        // O prontuário mantém a trilha clínica do registro excluído.
        if (kind !== 'photos' && kind !== 'plans') sync(req, kind, { ...old, observations: 'Registro excluído pelo profissional. ' + (old.observations || '') });
        return { success: true, id: old.id };
      }
      if (operation === 'item') {
        const items = JSON.parse(old.items_json);
        const item = items.find((entry: any) => entry.id === (req.body.itemId || req.body.item_id));
        if (!item) throw new InputError('Item não encontrado.', 404);
        if (!['PLANEJADO', 'EM_ANDAMENTO', 'REALIZADO', 'CANCELADO'].includes(req.body.status)) fail('Status inválido.', 'status');
        item.status = req.body.status;
        const planStatus = old.status === 'CANCELADO' ? 'CANCELADO' : items.every((entry: any) => entry.status === 'REALIZADO') ? 'CONCLUIDO' : items.some((entry: any) => ['REALIZADO', 'EM_ANDAMENTO'].includes(entry.status)) ? 'EM_ANDAMENTO' : 'PLANEJADO';
        db.prepare("UPDATE estetic_plans SET items_json = ?, status = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").run(JSON.stringify(items), planStatus, old.id, req.tenantId);
        return { success: true, id: old.id };
      }
      const body = req.body;
      if (!old && body.clientRequestId) {
        const duplicate = db.prepare(`SELECT * FROM ${table} WHERE tenant_id = ? AND client_request_id = ?`).get(req.tenantId, body.clientRequestId) as any;
        if (duplicate) { rowAccess(req, access, duplicate); if (duplicate.patient_id !== body.patientId || duplicate.area !== body.area) fail('Identificador de envio pertence a outro contexto.'); return { success: true, id: duplicate.id }; }
      }
      const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ? AND active = 1').get(req.user!.userId, req.tenantId) as any;
      if (!prof) throw new InputError('Vincule um profissional ativo para registrar dados clínicos.', 403);
      const today = new Date().toISOString().slice(0, 10);
      const defaults: Record<Kind, any> = { assessments: { assessment_date: today, specific_data_json: '{}' }, plans: { title: 'Planejamento estético', items_json: '[]', status: 'PLANEJADO' }, procedures: { date_performed: today, unit: 'ml', inventory_deducted: 0, deducted_quantity: 0 }, evolutions: { evolution_date: today }, returns: { status: body.scheduledDate ? 'AGENDADO' : 'COMPARECEU', return_assessment: '' }, photos: { photo_date: today, photo_type: 'ACOMPANHAMENTO', view_type: 'FRONTAL' } };
      const row: any = old ? { ...old } : { id: uuid(), tenant_id: req.tenantId, patient_id: body.patientId, professional_id: prof.id, area: String(body.area || 'FACIAL').toUpperCase(), ...defaults[kind], client_request_id: body.clientRequestId || null };
      if (old && body.patientId && body.patientId !== old.patient_id) fail('Não é permitido mover registros entre pacientes.', 'patientId');
      if (body.area) row.area = String(body.area).toUpperCase();
      if (kind !== 'returns' || body.appointmentId !== undefined || !old) row.appointment_id = body.appointmentId === undefined ? (old?.appointment_id || null) : (body.appointmentId || null);
      for (const [field, column] of Object.entries(columns[kind])) {
        if (body[field] !== undefined) row[column] = field === 'items' || field === 'specificData' ? JSON.stringify(body[field]) : (typeof body[field] === 'string' ? body[field].trim() || null : body[field]);
      }
      if (kind === 'returns' && !['AGENDADO', 'CANCELADO'].includes(row.status) && !row.actual_date) row.actual_date = new Date().toISOString().slice(0, 10);
      validate(kind, row); links(req, row);
      if (kind === 'plans' && old) {
        const retainedIds = new Set(JSON.parse(row.items_json).map((item: any) => item.id));
        const referenced = db.prepare('SELECT DISTINCT plan_item_id FROM estetic_procedures WHERE plan_id = ? AND tenant_id = ? AND plan_item_id IS NOT NULL').all(row.id, req.tenantId);
        if (referenced.some((entry: any) => !retainedIds.has(entry.plan_item_id))) fail('Preserve os itens que já possuem procedimentos realizados.', 'items');
      }
      if (kind === 'photos' && !old) {
        const duplicate = db.prepare('SELECT id FROM estetic_photos WHERE tenant_id = ? AND patient_id = ? AND area = ? AND photo_type = ? AND view_type = ? AND photo_date = ? AND file_url = ?').get(req.tenantId, row.patient_id, row.area, row.photo_type, row.view_type, row.photo_date, row.file_url) as any;
        if (duplicate) return { success: true, id: duplicate.id };
      }
      if (kind === 'procedures') {
        const withoutProduct = body.withoutProduct === true || body.noProduct === true || body.without_product === true || body.no_product === true;
        let deduct = false;

        if (withoutProduct || !row.product_id) {
          row.product_id = null;
          row.product_name = row.product_name || null;
          row.batch_lot = row.batch_lot || null;
          row.expiry_date = row.expiry_date || null;
          row.quantity = row.quantity != null ? Number(row.quantity) : null;
          row.unit = row.unit || null;
          deduct = false;
        } else {
          // Produto informado: baixa automática no estoque
          if (!(Number(row.quantity) > 0)) {
            fail('Informe a quantidade utilizada do produto.', 'quantity');
          }
          deduct = true;

          const item = db.prepare('SELECT * FROM inventory_items WHERE id = ? AND tenant_id = ? AND active = 1').get(row.product_id, req.tenantId) as any;
          if (!item) fail('Selecione um produto ativo do estoque desta clínica.', 'productId');
          if (item.unit && row.unit && item.unit !== row.unit) fail(`Utilize a unidade do estoque: ${item.unit}.`, 'unit');
          row.unit = item.unit;
          if (item.batch_number && row.batch_lot && item.batch_number !== row.batch_lot) fail('O lote informado não corresponde ao produto selecionado.', 'batch_lot');
          if (item.expiration_date && row.expiry_date && item.expiration_date.slice(0, 10) !== row.expiry_date) fail('A validade não corresponde ao produto selecionado.', 'expiry_date');
          row.product_name ||= item.name;
          row.batch_lot ||= item.batch_number;
          row.expiry_date ||= item.expiration_date?.slice(0, 10);
        }

        if (old) {
          const oldQty = old.inventory_deducted ? Number(old.deducted_quantity != null ? old.deducted_quantity : old.quantity || 0) : 0;
          const newQty = deduct ? Number(row.quantity || 0) : 0;
          try {
            ClinicalInventoryService.adjustStock(req.tenantId!, {
              oldItemId: old.inventory_deducted ? old.product_id : null,
              newItemId: deduct ? row.product_id : null,
              oldQuantity: oldQty,
              newQuantity: newQty,
              professionalId: row.professional_id,
              patientId: row.patient_id,
              appointmentId: row.appointment_id || null,
              moduleType: 'ZemdaEstetic',
              sourceType: 'estetic_procedure',
              sourceId: row.id,
              reason: 'Ajuste de procedimento estético: ' + (row.procedure_name || ''),
              unit: row.unit,
              batch: row.batch_lot,
              userId: req.user?.userId
            });
          } catch (err: any) {
            fail(err.message, err.field || 'quantity');
          }
          row.inventory_deducted = deduct ? 1 : 0;
          row.deducted_quantity = deduct ? Number(row.quantity) : 0;
        } else {
          if (deduct) {
            movement(req, row, -Number(row.quantity));
          }
          row.inventory_deducted = deduct ? 1 : 0;
          row.deducted_quantity = deduct ? Number(row.quantity) : 0;
        }
      }
      // Apenas colunas declaradas; nomes SQL nunca vêm do cliente.
      const keys = ['patient_id', 'professional_id', 'area', 'appointment_id', ...Object.values(columns[kind]), ...(kind === 'procedures' ? ['inventory_deducted', 'deducted_quantity'] : [])];
      if (old) db.prepare(`UPDATE ${table} SET ${keys.map(key => `${key} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`).run(...keys.map(key => row[key] ?? null), row.id, req.tenantId);
      else { const insertKeys = ['id', 'tenant_id', 'client_request_id', ...keys]; db.prepare(`INSERT INTO ${table} (${insertKeys.join(', ')}) VALUES (${insertKeys.map(() => '?').join(', ')})`).run(...insertKeys.map(key => row[key] ?? null)); }
      if (kind === 'procedures') { updatePlanProgress(req, old); updatePlanProgress(req, row); }
      sync(req, kind, row);
      return { success: true, id: row.id };
    };
    db.exec('SAVEPOINT estetic_record_write');
    let result;
    try { result = write(); db.exec('RELEASE estetic_record_write'); }
    catch (error) { db.exec('ROLLBACK TO estetic_record_write'); db.exec('RELEASE estetic_record_write'); throw error; }
    res.status(operation === 'create' ? 201 : 200).json(result);
  } catch (error: any) {
    if (!(error instanceof InputError)) console.error('[ZemdaEstetic]', error);
    res.status(error instanceof InputError ? error.status : 500).json({ error: error instanceof InputError ? error.message : 'Não foi possível salvar os dados do ZemdaEstetic.', field: error.field });
  }
}

export function esteticOverview(req: Request, res: Response, access: Access): void {
  try {
    const auth = access(req, req.query?.area as string);
    if (!auth.allowed) throw new InputError(auth.reason || 'Acesso negado.', 403);
    const id = String(req.params.patientId);
    patient(req, id);
    const area = String(req.query?.area || '').toUpperCase();
    const list = (kind: Kind) => db.prepare(`SELECT * FROM estetic_${kind} WHERE tenant_id = ? AND patient_id = ? ORDER BY created_at DESC, rowid DESC`).all(req.tenantId, id).filter((row: any) => auth.allowedAreas.includes(row.area) && (!area || area === 'TODOS' || row.area === area)) as any[];
    const assessments = list('assessments').sort((a, b) => b.assessment_date.localeCompare(a.assessment_date));
    const procedures = list('procedures').sort((a, b) => (b.date_performed || b.created_at).localeCompare(a.date_performed || a.created_at));
    const returns = list('returns').filter(row => row.status === 'AGENDADO' && row.scheduled_date).sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
    const plans = list('plans');
    res.json({ patient: db.prepare('SELECT id, full_name, gender, birth_date, phone FROM patients WHERE id = ? AND tenant_id = ?').get(id, req.tenantId), lastAssessment: assessments[0] || null, lastProcedure: procedures[0] || null, pendingPlans: plans.filter(row => ['PLANEJADO', 'EM_ANDAMENTO'].includes(row.status)), nextReturn: returns[0] || null, upcomingReturns: returns, recentPhotos: list('photos').slice(0, 8), usedAreas: [...new Set([...assessments, ...procedures, ...plans].map(row => row.area))] });
  } catch (error: any) {
    if (!(error instanceof InputError)) console.error('[ZemdaEstetic.overview]', error);
    res.status(error instanceof InputError ? error.status : 500).json({ error: error instanceof InputError ? error.message : 'Erro ao carregar visão geral.' });
  }
}

/** Runs inside the consultation transaction, only after the final confirmation. */
export function persistEsteticCompletion(req: Request, access: Access, snapshot: any, appointment: any): void {
  const areas = snapshot.areas || { [snapshot.activeArea || 'FACIAL']: snapshot };
  for (const [area, forms] of Object.entries(areas) as [string, any][]) {
    const a = forms.assessmentForm || {}, p = forms.procedureForm || {}, e = forms.evolutionForm || {}, r = forms.returnForm || {}, ph = forms.photoForm || {}, pl = forms.planForm || {};
    const meaningful = (value: any): boolean => value != null && value !== '' && (Array.isArray(value) ? value.some(meaningful) : typeof value === 'object' ? Object.values(value).some(meaningful) : true);
    const bodies: Partial<Record<Kind, any>> = {};
    if (meaningful(Object.fromEntries(Object.entries(a).filter(([key]) => key !== 'assessmentDate')))) bodies.assessments = { assessmentDate: a.assessmentDate, chiefComplaint: a.complaint, objectives: a.expectations, clinicalHistory: [a.previousTreatments, a.contraindications, a.allergies, a.currentMedications].filter(Boolean).join('\n'), specificData: a, observations: a.observations };
    if (p.procedure_name || p.target_region || p.product_applied || p.inventory_item_id || p.product_id) bodies.procedures = { procedureName: p.procedure_name, region: p.target_region, datePerformed: p.date_performed, productName: p.product_applied || p.product_name, productId: p.inventory_item_id || p.product_id || null, batchLot: p.lot_number || p.batch_lot, expiryDate: p.expiry_date, quantity: p.quantity === '' ? null : Number(p.quantity), unit: p.unit, techniqueNotes: p.technique_notes, adverseEvents: p.adverse_reactions, postInstructions: p.post_instructions, withoutProduct: p.without_product || p.no_product || p.withoutProduct || p.noProduct, planId: p.plan_id || null, planItemId: p.plan_item_id || null };
    if (e.biological_response || e.patient_feedback || e.conduct) bodies.evolutions = { evolutionText: e.biological_response, observedResponse: e.patient_feedback, conduct: e.conduct, evolutionDate: e.evolution_date, procedureId: e.procedure_id || null };
    if (r.evaluation_notes || r.procedure_id || r.actual_date || r.touchup_description) bodies.returns = { scheduledDate: r.scheduled_date, actualDate: r.actual_date, status: r.status, returnAssessment: r.evaluation_notes, procedureRecordId: r.procedure_id || null, touchupRequired: r.touchup_required, touchupDescription: r.touchup_description };
    if (ph.photo_url) bodies.photos = { fileUrl: ph.photo_url, photoDate: ph.taken_at, photoType: ph.photo_type, viewType: ph.view_angle, observation: ph.notes };
    if (pl.title || pl.objectives || pl.notes || pl.items?.some((item: any) => item.procedure_name)) bodies.plans = { title: pl.title, objectives: pl.objectives, notes: pl.notes, items: pl.items?.filter((item: any) => item.procedure_name) || [] };
    for (const [kind, body] of Object.entries(bodies) as [Kind, any][]) {
      const existingId = snapshot.recordIds?.[area]?.[kind];
      const request = { ...req, params: { id: existingId }, query: {}, body: { ...body, patientId: appointment.patient_id, appointmentId: appointment.id, area, clientRequestId: `completion:${appointment.id}:${area}:${kind}` } } as unknown as Request;
      let status = 200, response: any;
      const result = { status(code: number) { status = code; return this; }, json(value: any) { response = value; } } as unknown as Response;
      esteticRecords(request, result, access, kind, existingId ? 'update' : 'create');
      if (status >= 400) throw new InputError(response.error, status, response.field);
    }
    // Link records explicitly saved in this session, including previous procedures.
    for (const [kind, ids] of Object.entries(snapshot.sessionRecordIds?.[area] || {}) as [Kind, string[]][]) {
      if (!Object.hasOwn(columns, kind) || !Array.isArray(ids)) continue;
      for (const id of ids) {
        const row = db.prepare(`SELECT * FROM estetic_${kind} WHERE id = ? AND tenant_id = ? AND patient_id = ? AND area = ?`).get(id, req.tenantId, appointment.patient_id, area) as any;
        if (!row) continue;
        rowAccess(req, access, row);
        if (row.professional_id !== appointment.professional_id || row.appointment_id) continue;
        row.appointment_id = appointment.id;
        db.prepare(`UPDATE estetic_${kind} SET appointment_id = ? WHERE id = ? AND tenant_id = ?`).run(appointment.id, id, req.tenantId);
        sync(req, kind, row);
      }
    }
  }
}
