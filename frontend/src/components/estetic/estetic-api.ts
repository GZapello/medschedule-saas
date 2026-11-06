import { ApiClient } from '../../api/client';

const parse = (value: any, fallback: any) => { try { return typeof value === 'string' ? JSON.parse(value) : value || fallback; } catch { return fallback; } };
export function esteticRecord(kind: string, row: any): any {
  if (!row) return row;
  const specific = parse(row.specific_data_json, {});
  switch (kind) {
    case 'assessments': return { ...row, ...specific, specificData: specific, complaint: row.chief_complaint, expectations: row.objectives, phototype: specific.fitzpatrick, previous_treatments: specific.previousTreatments, clinical_conduct: specific.clinicalConduct };
    case 'plans': return { ...row, items: parse(row.items_json, []) };
    case 'procedures': return { ...row, target_region: row.region, product_applied: row.product_name, lot_number: row.batch_lot, date_performed: row.date_performed || row.created_at?.slice(0, 10), inventory_item_id: row.product_id || '', deduct_inventory: Boolean(row.inventory_deducted), adverse_reactions: row.adverse_events, anatomical_map_id: row.anatomical_map_id || row.anatomicalMapId || '' };
    case 'evolutions': return { ...row, evolution_date: row.evolution_date || row.created_at?.slice(0, 10), biological_response: row.evolution_text, patient_feedback: row.observed_response };
    case 'returns': return { ...row, procedure_id: row.procedure_record_id, scheduled_date: row.scheduled_date || row.next_return_date || row.created_at?.slice(0, 10), evaluation_notes: row.return_assessment };
    case 'photos': return { ...row, photo_url: row.file_url, view_angle: row.view_type, taken_at: row.photo_date, notes: row.observation };
    default: return row;
  }
}
export function esteticPayload(kind: string, body: any): any {
  const aliases: Record<string, string> = { patient_id: 'patientId', procedure_name: 'procedureName', target_region: 'region', date_performed: 'datePerformed', product_applied: 'productName', lot_number: 'batchLot', expiry_date: 'expiryDate', technique_notes: 'techniqueNotes', adverse_reactions: 'adverseEvents', post_instructions: 'postInstructions', deduct_inventory: 'deductInventory', inventory_item_id: 'productId', plan_id: 'planId', plan_item_id: 'planItemId', anatomical_map_id: 'anatomicalMapId', anatomicalMapId: 'anatomicalMapId', photo_url: 'fileUrl', photo_type: 'photoType', view_angle: 'viewType', taken_at: 'photoDate', evolution_date: 'evolutionDate', biological_response: 'evolutionText', patient_feedback: 'observedResponse', procedure_id: kind === 'returns' ? 'procedureRecordId' : 'procedureId', scheduled_date: 'scheduledDate', actual_date: 'actualDate', evaluation_notes: 'returnAssessment', touchup_required: 'touchupRequired', touchup_description: 'touchupDescription' };
  const payload = Object.fromEntries(Object.entries(body).map(([key, value]) => [aliases[key] || key, value]));
  if (kind === 'photos') { payload.observation = body.notes; delete payload.notes; }
  if (kind === 'assessments') {
    payload.chiefComplaint = body.complaint; payload.objectives = body.expectations;
    payload.specificData = body.specificData;
    payload.clinicalHistory = [body.previous_treatments, body.contraindications, body.allergies, body.current_medications].filter(Boolean).join('\n');
  }
  return payload;
}
export async function loadEsteticPatient(patientId: string, area: string) {
  const query = `?patientId=${encodeURIComponent(patientId)}&area=${encodeURIComponent(area)}`;
  const kinds = ['assessments', 'plans', 'procedures', 'evolutions', 'returns', 'photos'];
  const [overview, ...responses] = await Promise.all([ApiClient.get<any>(`/v1/estetic/patient/${encodeURIComponent(patientId)}/overview?area=${area}`), ...kinds.map(kind => ApiClient.get<any[]>(`/v1/estetic/${kind}${query}`)), ApiClient.get<any[]>(`/v1/estetic/history${query}`)]);
  const data: any = {};
  kinds.forEach((kind, index) => { data[kind] = responses[index].map(row => esteticRecord(kind, row)); });
  data.overview = { ...overview, lastAssessment: esteticRecord('assessments', overview.lastAssessment), lastProcedure: esteticRecord('procedures', overview.lastProcedure), nextReturn: esteticRecord('returns', overview.nextReturn), recentPhotos: (overview.recentPhotos || []).map((row: any) => esteticRecord('photos', row)) };
  data.timeline = responses[6].map(row => ({ ...row, event_type: row.type.toLowerCase(), event_date: row.date, description: [row.subtitle, row.details].filter(Boolean).join(' • ') }));
  data.pairs = buildBeforeAfterPairs(data.photos);
  return data;
}

export function buildBeforeAfterPairs(photos: any[] = []): any[] {
  const candidates = (photos || []).filter((p: any) => p && (p.photo_type === 'ANTES' || p.photo_type === 'DEPOIS'));

  const groups: Record<string, { before: any[]; after: any[] }> = {};
  for (const ph of candidates) {
    const area = ph.area || 'FACIAL';
    const viewAngle = ph.view_angle || ph.view_type || 'FRONTAL';
    const key = `${area}::${viewAngle}`;
    if (!groups[key]) groups[key] = { before: [], after: [] };
    if (ph.photo_type === 'ANTES') {
      groups[key].before.push(ph);
    } else {
      groups[key].after.push(ph);
    }
  }

  const pairs: any[] = [];
  for (const key of Object.keys(groups)) {
    const group = groups[key];
    group.before.sort((a, b) => (a.taken_at || a.photo_date || '').localeCompare(b.taken_at || b.photo_date || '') || (a.created_at || '').localeCompare(b.created_at || ''));
    group.after.sort((a, b) => (a.taken_at || a.photo_date || '').localeCompare(b.taken_at || b.photo_date || '') || (a.created_at || '').localeCompare(b.created_at || ''));

    const usedAfterIds = new Set<string>();
    for (const before of group.before) {
      const bDate = before.taken_at || before.photo_date || '';
      const matchAfter = group.after.find(a => !usedAfterIds.has(a.id) && (a.taken_at || a.photo_date || '') >= bDate)
        || group.after.find(a => !usedAfterIds.has(a.id));
      if (matchAfter) {
        usedAfterIds.add(matchAfter.id);
        pairs.push({
          id: `${before.id}:${matchAfter.id}`,
          area: before.area,
          view_angle: before.view_angle || before.view_type || 'FRONTAL',
          before,
          after: matchAfter
        });
      } else {
        pairs.push({
          id: `${before.id}:waiting-after`,
          area: before.area,
          view_angle: before.view_angle || before.view_type || 'FRONTAL',
          before,
          after: null
        });
      }
    }

    for (const after of group.after) {
      if (!usedAfterIds.has(after.id)) {
        pairs.push({
          id: `waiting-before:${after.id}`,
          area: after.area,
          view_angle: after.view_angle || after.view_type || 'FRONTAL',
          before: null,
          after
        });
      }
    }
  }

  pairs.sort((a, b) => {
    const dateA = a.after?.taken_at || a.after?.photo_date || a.before?.taken_at || a.before?.photo_date || '';
    const dateB = b.after?.taken_at || b.after?.photo_date || b.before?.taken_at || b.before?.photo_date || '';
    return dateB.localeCompare(dateA);
  });

  return pairs;
}
