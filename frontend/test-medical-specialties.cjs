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
    assert.match(eye, /olho direito/); assert.match(eye, /olho esquerdo/); assert.match(eye, />15</); assert.match(eye, />19</);
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
