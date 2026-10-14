const assert = require('assert');
const path = require('path');
const { db } = require('../dist/config/database');
const { ClinicalRecordService } = require('../dist/services/clinical-record.service');

console.log('=== TESTE 1: ClinicalRecordService - sessionTime normal e import safeguard (sem horário artificial) ===');

// Setup tenant e paciente para teste
const testTenantId = 'tenant-viver-bem';
const testPatientId = 'pat-mariana';
const testProfId = 'pro-camila';

// Teste 1A: Criação manual sem informar sessionTime -> deve preencher horário atual
const recManual = ClinicalRecordService.recordClinicalEvent({
  tenantId: testTenantId,
  patientId: testPatientId,
  professionalId: testProfId,
  moduleType: 'general',
  sourceId: 'src-manual-1',
  sourceType: 'manual',
  title: 'Evolução Manual Padrão',
  clinicalEvolution: 'Paciente estável.'
});

const rowManual = db.prepare('SELECT session_date, session_time FROM records WHERE id = ?').get(recManual.id);
assert.ok(rowManual.session_time, 'Registro manual deve possuir session_time preenchido');
assert.strictEqual(rowManual.session_time.length, 5, 'Horário deve estar no formato HH:mm');
console.log('✔ 1A: Registro manual preenche session_time automaticamente:', rowManual.session_time);

// Teste 1B: Criação via Importação com sessionTime: null -> NUNCA deve inventar 00:00 ou 09:00 ou horário atual
const recImport = ClinicalRecordService.recordClinicalEvent({
  tenantId: testTenantId,
  patientId: testPatientId,
  professionalId: testProfId,
  moduleType: 'general',
  sourceId: 'src-import-1',
  sourceType: 'import',
  title: 'Evolução Importada Antiga',
  clinicalEvolution: 'Registro importado de prontuário físico.',
  sessionTime: null // Regra absoluta de importação
});

const rowImport = db.prepare('SELECT session_date, session_time FROM records WHERE id = ?').get(recImport.id);
assert.strictEqual(rowImport.session_time, null, 'Registro importado com sessionTime null DEVE permanecer NULL');
console.log('✔ 1B: Registro importado com sessionTime null preservado como NULL (sem horário artificial)');

// Teste 1C: Criação via Importação com sessionTime: '' (string vazia) -> deve ser NULL
const recImportEmpty = ClinicalRecordService.recordClinicalEvent({
  tenantId: testTenantId,
  patientId: testPatientId,
  professionalId: testProfId,
  moduleType: 'general',
  sourceId: 'src-import-2',
  sourceType: 'import',
  title: 'Evolução Importada Sem Hora',
  clinicalEvolution: 'Registro sem hora.',
  sessionTime: ''
});

const rowImportEmpty = db.prepare('SELECT session_date, session_time FROM records WHERE id = ?').get(recImportEmpty.id);
assert.strictEqual(rowImportEmpty.session_time, null, 'Registro importado com sessionTime vazio DEVE ser NULL');
console.log('✔ 1C: Registro com sessionTime vazio salvo como NULL');

console.log('\n=== TESTE 2: Edição de Data e Horário com Trilha de Auditoria ===');

// Atualiza data e horário do registro manual
const previousDate = rowManual.session_date;
const previousTime = rowManual.session_time;
const newDate = '2026-10-10';
const newTime = '14:25';

let history = [];
history.push({
  edited_by: 'Dra. Teste',
  edited_at: new Date().toISOString(),
  previous_title: 'Evolução Manual Padrão',
  previous_evolution: 'Paciente estável.',
  previous_session_date: previousDate,
  previous_session_time: previousTime,
  new_session_date: newDate,
  new_session_time: newTime
});

db.prepare(`
  UPDATE records SET
    session_date = ?,
    session_time = ?,
    edit_history_json = ?,
    updated_at = datetime('now')
  WHERE id = ?
`).run(newDate, newTime, JSON.stringify(history), recManual.id);

const rowUpdated = db.prepare('SELECT session_date, session_time, edit_history_json FROM records WHERE id = ?').get(recManual.id);
assert.strictEqual(rowUpdated.session_date, '2026-10-10');
assert.strictEqual(rowUpdated.session_time, '14:25');

const parsedHistory = JSON.parse(rowUpdated.edit_history_json);
assert.strictEqual(parsedHistory.length, 1);
assert.strictEqual(parsedHistory[0].previous_session_date, previousDate);
assert.strictEqual(parsedHistory[0].previous_session_time, previousTime);
assert.strictEqual(parsedHistory[0].new_session_date, '2026-10-10');
assert.strictEqual(parsedHistory[0].new_session_time, '14:25');
console.log('✔ 2: Data e Horário editados com sucesso e trilha de auditoria gravada:', parsedHistory[0]);

console.log('\n=== TESTE 3: Ordenação de Registros no mesmo dia com Horário e NULLs ===');

// Cria 3 registros no mesmo dia: um às 16:00, um às 10:00 e um sem horário (NULL)
const sameDay = '2026-10-14';

const r1 = ClinicalRecordService.recordClinicalEvent({
  tenantId: testTenantId,
  patientId: testPatientId,
  professionalId: testProfId,
  moduleType: 'general',
  sourceId: 'src-order-1',
  sourceType: 'manual',
  sessionDate: sameDay,
  sessionTime: '10:00',
  title: 'Atendimento Manhã',
  clinicalEvolution: 'Manhã'
});

const r2 = ClinicalRecordService.recordClinicalEvent({
  tenantId: testTenantId,
  patientId: testPatientId,
  professionalId: testProfId,
  moduleType: 'general',
  sourceId: 'src-order-2',
  sourceType: 'manual',
  sessionDate: sameDay,
  sessionTime: '16:00',
  title: 'Atendimento Tarde',
  clinicalEvolution: 'Tarde'
});

const r3 = ClinicalRecordService.recordClinicalEvent({
  tenantId: testTenantId,
  patientId: testPatientId,
  professionalId: testProfId,
  moduleType: 'general',
  sourceId: 'src-order-3',
  sourceType: 'import',
  sessionDate: sameDay,
  sessionTime: null,
  title: 'Atendimento Sem Hora',
  clinicalEvolution: 'Sem hora'
});

const queriedRecords = db.prepare(`
  SELECT id, title, session_date, session_time, created_at FROM records
  WHERE tenant_id = ? AND patient_id = ? AND session_date = ?
  ORDER BY session_date DESC, session_time DESC, created_at DESC
`).all(testTenantId, testPatientId, sameDay);

// Simula a ordenação JS do controller
queriedRecords.sort((a, b) => {
  const dateDiff = String(b.session_date || '').localeCompare(String(a.session_date || ''));
  if (dateDiff !== 0) return dateDiff;
  const timeA = a.session_time || '';
  const timeB = b.session_time || '';
  if (timeA && timeB) {
    const timeDiff = timeB.localeCompare(timeA);
    if (timeDiff !== 0) return timeDiff;
  } else if (timeA && !timeB) {
    return -1;
  } else if (!timeA && timeB) {
    return 1;
  }
  return String(b.created_at || '').localeCompare(String(a.created_at || ''));
});

assert.strictEqual(queriedRecords[0].session_time, '16:00', '16:00 deve vir no topo (mais recente do dia)');
assert.strictEqual(queriedRecords[1].session_time, '10:00', '10:00 deve vir depois');
assert.strictEqual(queriedRecords[2].session_time, null, 'Registro com session_time NULL deve vir por último ordenado');
console.log('✔ 3: Registros no mesmo dia ordenados cronologicamente de forma limpa:', queriedRecords.map(r => `${r.title} (${r.session_time || 'Sem Horário'})`));

console.log('\n=== TESTE 4: Limpeza de JSON técnico e transformação Zemda360 ===');

const zemda360Sample = JSON.stringify({
  schemaVersion: 2,
  mapType: 'BODY',
  activeLayerKey: 'front',
  sexVariant: 'female',
  layers: {
    front: {
      view: 'front',
      mapType: 'BODY',
      selectedRegions: ['cervical', 'knee_right'],
      marks: [
        { id: 'm1', x: 100, y: 200, note: 'Dor ao palpar' }
      ],
      drawings: [
        { strokeId: 'st-1', points: [10, 20, 30, 40] }
      ],
      clinicalNotes: 'Paciente com tensão na coluna cervical.'
    }
  }
});

// Testa parser técnico (função formatPdfTechnicalNotes extraída do controller)
function formatPdfTechnicalNotesTest(raw) {
  if (!raw || !raw.trim()) return '';
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        const isZemda = parsed.schemaVersion === 2 || parsed.layers || parsed.mapType || parsed.selectedRegions || parsed.drawings;
        if (isZemda) {
          const lines = [];
          const mapType = parsed.mapType || (parsed.layers && Object.values(parsed.layers)[0])?.mapType;
          lines.push(mapType === 'FACE' ? 'Mapeamento Facial 360' : 'Mapeamento Corporal 360');
          const sex = parsed.sexVariant || parsed.body_model || (parsed.layers && Object.values(parsed.layers)[0])?.sexVariant;
          lines.push(`Modelo: ${sex === 'male' ? 'Masculino' : 'Feminino'}`);

          const regions = [];
          const notes = [];
          let marks = 0;
          let drawings = 0;

          if (parsed.layers && typeof parsed.layers === 'object') {
            for (const l of Object.values(parsed.layers)) {
              if (Array.isArray(l.selectedRegions)) regions.push(...l.selectedRegions);
              if (Array.isArray(l.marks)) marks += l.marks.length;
              if (Array.isArray(l.drawings)) drawings += l.drawings.length;
              if (l.clinicalNotes && typeof l.clinicalNotes === 'string' && l.clinicalNotes.trim()) {
                notes.push(l.clinicalNotes.trim());
              }
            }
          }
          if (Array.isArray(parsed.selectedRegions)) regions.push(...parsed.selectedRegions);
          if (parsed.clinicalNotes && typeof parsed.clinicalNotes === 'string') notes.push(parsed.clinicalNotes.trim());

          if (regions.length > 0) {
            lines.push(`Regiões avaliadas: ${Array.from(new Set(regions)).join(', ')}`);
          }
          if (marks > 0) {
            lines.push(`Marcações: ${marks} marcação(ões) registrada(s)`);
          }
          if (drawings > 0) {
            lines.push(`Desenhos registrados: Sim (${drawings} traço(s))`);
          }
          if (notes.length > 0) {
            lines.push(`Observações clínicas: ${Array.from(new Set(notes)).join(' • ')}`);
          }
          return lines.join('\n');
        }
      }
    } catch (_) {}
  }
  return trimmed;
}

const formatted = formatPdfTechnicalNotesTest(zemda360Sample);
assert.ok(!formatted.includes('schemaVersion'), 'Nunca deve conter schemaVersion');
assert.ok(!formatted.includes('activeLayerKey'), 'Nunca deve conter activeLayerKey');
assert.ok(!formatted.includes('strokeId'), 'Nunca deve conter strokeId');
assert.ok(!formatted.includes('{'), 'Nunca deve conter JSON bruto com chaves');
assert.ok(formatted.includes('Mapeamento Corporal 360'), 'Deve conter título amigável');
assert.ok(formatted.includes('Modelo: Feminino'), 'Deve conter modelo');
assert.ok(formatted.includes('Paciente com tensão na coluna cervical.'), 'Deve conter as notas clínicas');

console.log('✔ 4: JSON do Zemda360 convertido para texto clínico legível sem campos técnicos:');
console.log('--------------------------------------------------');
console.log(formatted);
console.log('--------------------------------------------------');

// Limpeza dos dados de teste
db.prepare("DELETE FROM records WHERE source_id IN ('src-manual-1', 'src-import-1', 'src-import-2', 'src-order-1', 'src-order-2', 'src-order-3')").run();

console.log('\n TODOS OS TESTES PASSARAM COM SUCESSO!');
