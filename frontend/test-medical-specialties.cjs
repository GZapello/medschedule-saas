const { buildSync } = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-medical-ui-'));
const outfile = path.join(dir, 'render.cjs');
buildSync({
  stdin: { resolveDir: __dirname, loader: 'tsx', contents: `
    import assert from 'node:assert/strict';
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { specialtySections, specialtyNoteKeys } from './src/components/medical/specialties/specialtySections';
    import { SpecialtySectionRenderer } from './src/components/medical/specialties/SpecialtySectionRenderer';
    import { ClinicalTrendChart } from './src/components/clinical/ClinicalTrendChart';
    import { ADLAssessment, emptyAdlItems } from './src/components/clinical/ADLAssessment';
    import { ClinicalScales } from './src/components/clinical/ClinicalScales';
    import { mergeMedicalRegional } from './src/components/medical/shared/medicalRegional';
    import { medicalComparisonValues } from './src/components/medical/shared/medicalComparisonValues';
    const oldRegional = { strength_json: [{ score: 4 }], pain_json: { score: 7 }, functional_scales_json: [{ score: 12 }] };
    const patched = mergeMedicalRegional(oldRegional, { strength_json: [], pain_json: { score: 0 }, functional_scales_json: [] }, ['PAIN_ASSESSMENT']);
    assert.deepEqual(patched.strength_json, oldRegional.strength_json);
    assert.deepEqual(patched.functional_scales_json, oldRegional.functional_scales_json);
    assert.equal(patched.pain_json.score, 0);
    assert.equal(oldRegional.pain_json.score, 7);
    const comparison = medicalComparisonValues({ lesions: [{ id: 'stable', size: 0, photos: ['private-url'] }], regional: { knee: { pain: 0 } } });
    assert.equal(comparison['lesions / stable / size'], '0');
    assert.equal(comparison['regional / knee / pain'], '0');
    assert.ok(!JSON.stringify(comparison).includes('private-url'));
    const specialties = Object.keys(specialtySections).filter(key => key !== 'ginecologia');
    assert.equal(specialties.length, 15);
    for (const specialty of specialties) {
      assert.ok(specialtyNoteKeys[specialty]);
      const keys = specialtySections[specialty].flatMap(section => section.fields.map(([key]) => key));
      assert.equal(new Set(keys).size, keys.length, specialty + ': duplicate fields');
      for (const value of [null, undefined, {}, [], { oldFinding: 'Legacy note' }]) {
        const html = renderToStaticMarkup(<SpecialtySectionRenderer specialty={specialty} value={value} patientId="test" readOnly />);
        assert.ok(!html.includes('ZemdaBody'));
        if (value?.oldFinding) assert.ok(html.includes('Legacy note'));
      }
    }
    const eye = renderToStaticMarkup(<SpecialtySectionRenderer specialty="oftalmologia" value={{ iopOD: '15', iopOE: '19' }} patientId="test" readOnly />);
    assert.match(eye, /olho direito/i); assert.match(eye, /olho esquerdo/i); assert.match(eye, /(?:>15<|value="15")/); assert.match(eye, /(?:>19<|value="19")/);
    const lesions = renderToStaticMarkup(<SpecialtySectionRenderer specialty="dermatologia" value={{ lesions: [null, { id: 'lesion', identification: 'Lesão antiga', photos: [] }] }} patientId="test" readOnly />);
    assert.match(lesions, /Lesão antiga/);
    const chart = renderToStaticMarkup(<ClinicalTrendChart history={[{ assessment_date: '2026-01-01', value: 0 }, { assessment_date: '2026-02-01', value: -1 }, { assessment_date: 'invalid', value: 999 }]} metric="value" />);
    assert.match(chart, /<svg/); assert.ok(!chart.includes('NaN')); assert.ok(!chart.includes('999')); assert.match(chart, />0 /);
    assert.ok(emptyAdlItems().every(item => item.score === null));
    assert.match(renderToStaticMarkup(<ADLAssessment adlItems={emptyAdlItems()} setAdlItems={() => {}} />), /Gestão de Medicamentos/);
    assert.match(renderToStaticMarkup(<ClinicalScales scales={[{ scaleName: 'Escala', score: '0', interpretation: '' }]} setScales={() => {}} />), /value="0"/);
    console.log('PASS: 15 specialty renderers, legacy/null inputs, OD/OE, lesions, shared ADL/scales, zero/negative chart values.');
  ` },
  bundle: true, platform: 'node', format: 'cjs', outfile, define: { 'import.meta.env': '{}' }, logLevel: 'silent'
});
require(outfile);
