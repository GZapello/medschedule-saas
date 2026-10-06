const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');
const source = esbuild.buildSync({ stdin: { contents: "export * from './src/components/estetic/estetic-api'; export { ApiClient } from './src/api/client';", resolveDir: path.resolve(__dirname, '..') }, bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
const compiled = new Module(__filename); compiled.filename = __filename; compiled.paths = module.paths; compiled._compile(source, __filename);
const { esteticPayload, esteticRecord, loadEsteticPatient, ApiClient } = compiled.exports;
assert.deepEqual(esteticPayload('procedures', { patient_id: 'A', target_region: 'Fronte', procedure_name: 'Procedimento', date_performed: '2026-10-01', post_instructions: 'Orientar', inventory_item_id: 'stock', deduct_inventory: true }), { patientId: 'A', region: 'Fronte', procedureName: 'Procedimento', datePerformed: '2026-10-01', postInstructions: 'Orientar', productId: 'stock', deductInventory: true });
assert.equal(esteticPayload('returns', { procedure_id: 'proc' }).procedureRecordId, 'proc');
assert.equal(esteticPayload('evolutions', { biological_response: 'Evolução' }).evolutionText, 'Evolução');
assert.equal(esteticRecord('assessments', { chief_complaint: 'Queixa', specific_data_json: '{"fitzpatrick":"III"}' }).phototype, 'III');
assert.deepEqual(esteticRecord('plans', { items_json: '[{"id":"item"}]' }).items, [{ id: 'item' }]);
(async () => {
  const calls = [];
  ApiClient.get = async url => {
    calls.push(url);
    if (url.includes('/overview')) return { patient: { id: 'A' }, recentPhotos: [] };
    if (url.includes('/photos?')) return [
      { id: 'before', area: 'FACIAL', photo_type: 'ANTES', view_type: 'FRONTAL', photo_date: '2026-10-01', file_url: 'before' },
      { id: 'after', area: 'FACIAL', photo_type: 'DEPOIS', view_type: 'FRONTAL', photo_date: '2026-10-02', file_url: 'after' },
      { id: 'wrong-angle', area: 'FACIAL', photo_type: 'DEPOIS', view_type: 'PERFIL', photo_date: '2026-10-02', file_url: 'other' }
    ];
    return [];
  };
  const data = await loadEsteticPatient('A', 'FACIAL');
  assert.equal(data.pairs.length, 1); assert.equal(data.pairs[0].after.id, 'after');
  assert.equal(calls.length, 8); assert(calls.every(url => url.includes('/patient/A/') || url.includes('patientId=A&area=FACIAL')));
  ApiClient.get = async () => { throw new Error('synthetic API failure'); };
  await assert.rejects(loadEsteticPatient('B', 'CORPORAL'), /synthetic API failure/);
  console.log('PASS Estetic API: payloads, canonical URLs, normalized records, photographic pairing and explicit load failures');
})().catch(error => { console.error(error); process.exitCode = 1; });
