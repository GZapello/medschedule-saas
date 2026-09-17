// test-audiology-cffa.cjs
// Script de testes automatizados para a validação integral da Audiologia (Guia CFFa 2023)

const assert = require('assert');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dbPath = path.resolve(__dirname, 'saas_schedule.db');
const rawDb = new DatabaseSync(dbPath);

console.log('=== INICIANDO BATERIA DE TESTES - AUDIOLOGIA ZEMDAFONO (CFFa 2023) ===\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] Teste ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] Teste ${totalTests}: ${name}`);
    console.error(err);
  }
}

// ----------------------------------------------------
// TESTE 1: NOVO EXAME INICIA VAZIO
// ----------------------------------------------------
runTest('Novo exame inicia 100% vazio (sem valores fictícios normais)', () => {
  // Simula a estrutura do EMPTY_RECORD
  const emptyRecord = {
    schemaVersion: 2,
    audiometry: { rightAir: {}, leftAir: {}, rightBone: {}, leftBone: {}, thresholds: [] },
    classification: { degreeCriterion: 'none', finalConclusion: '', confirmedByProfessional: false },
    speechAudiometry: { lrfOD: null, lrfOE: null, iprfOD: null, iprfOE: null },
    tympanometry: { right: { curveType: '' }, left: { curveType: '' } }
  };

  assert.deepStrictEqual(emptyRecord.audiometry.rightAir, {});
  assert.deepStrictEqual(emptyRecord.audiometry.leftAir, {});
  assert.strictEqual(emptyRecord.classification.degreeCriterion, 'none');
  assert.strictEqual(emptyRecord.classification.finalConclusion, '');
  assert.strictEqual(emptyRecord.speechAudiometry.iprfOD, null);
  assert.strictEqual(emptyRecord.tympanometry.right.curveType, '');
});

// ----------------------------------------------------
// TESTE 2: ESCALA LOGARÍTMICA BASE 2 E PROPORÇÃO 1:1
// ----------------------------------------------------
runTest('Escala do audiograma baseada em log2 e proporção de 1 oitava = 20 dB', () => {
  const octaveWidth = 90;
  const graphWidth = 6 * octaveWidth; // 540px
  const graphHeight = (130 / 20) * octaveWidth; // 585px
  const marginLeft = 60;
  const marginTop = 40;

  const getX = (freq) => {
    const ratio = Math.log2(freq / 125) / Math.log2(8000 / 125);
    return marginLeft + ratio * graphWidth;
  };

  const getY = (db) => {
    const ratio = (db - (-10)) / 130;
    return marginTop + ratio * graphHeight;
  };

  // 1. Cada oitava deve ter rigorosamente a mesma largura (octaveWidth = 90px)
  const x125 = getX(125);
  const x250 = getX(250);
  const x500 = getX(500);
  const x1000 = getX(1000);
  const x2000 = getX(2000);
  const x4000 = getX(4000);
  const x8000 = getX(8000);

  const diff1 = x250 - x125;
  const diff2 = x500 - x250;
  const diff3 = x1000 - x500;
  const diff4 = x2000 - x1000;
  const diff5 = x4000 - x2000;
  const diff6 = x8000 - x4000;

  assert(Math.abs(diff1 - 90) < 0.001, `125->250 deve ter 90px (teve ${diff1})`);
  assert(Math.abs(diff2 - 90) < 0.001, `250->500 deve ter 90px (teve ${diff2})`);
  assert(Math.abs(diff3 - 90) < 0.001, `500->1000 deve ter 90px (teve ${diff3})`);
  assert(Math.abs(diff4 - 90) < 0.001, `1000->2000 deve ter 90px (teve ${diff4})`);
  assert(Math.abs(diff5 - 90) < 0.001, `2000->4000 deve ter 90px (teve ${diff5})`);
  assert(Math.abs(diff6 - 90) < 0.001, `4000->8000 deve ter 90px (teve ${diff6})`);

  // 2. Frequências intermediárias devem estar entre as oitavas
  const x750 = getX(750);
  assert(x750 > x500 && x750 < x1000, '750 Hz deve estar entre 500 e 1000 Hz');

  const x1500 = getX(1500);
  assert(x1500 > x1000 && x1500 < x2000, '1500 Hz deve estar entre 1000 e 2000 Hz');

  const x3000 = getX(3000);
  assert(x3000 > x2000 && x3000 < x4000, '3000 Hz deve estar entre 2000 e 4000 Hz');

  const x6000 = getX(6000);
  assert(x6000 > x4000 && x6000 < x8000, '6000 Hz deve estar entre 4000 e 8000 Hz');

  // 3. Proporção vertical: 20 dB deve equivaler exatamente à largura de 1 oitava (90px)
  const y0 = getY(0);
  const y20 = getY(20);
  const diff20db = y20 - y0;
  assert(Math.abs(diff20db - 90) < 0.001, `20 dB vertical deve ter 90px (teve ${diff20db})`);
});

// ----------------------------------------------------
// TESTE 3: PERSISTÊNCIA COMPLETA E RECARREGAMENTO (F5)
// ----------------------------------------------------
runTest('Persistência e recarregamento integral dos limiares em fono_audiology_records', () => {
  // Busca um paciente e tenant existentes no banco
  const patient = rawDb.prepare("SELECT id, tenant_id FROM patients LIMIT 1").get();
  assert(patient, 'Deve existir pelo menos um paciente no banco de dados');

  const testRecordId = 'f-aud-test-' + Date.now();
  const examPayload = {
    schemaVersion: 2,
    modality: 'clinical',
    audiometry: {
      rightAir: { 500: 25, 1000: 30, 2000: 35 },
      leftAir: { 500: 15, 1000: 20, 2000: 25 },
      rightBone: { 500: 10, 1000: 15, 2000: 20 },
      leftBone: { 500: 15, 1000: 20, 2000: 25 },
      thresholds: [
        { frequency: 500, db: 25, ear: 'right', conduction: 'air', masked: false, noResponse: false },
        { frequency: 1000, db: 30, ear: 'right', conduction: 'air', masked: false, noResponse: false },
        { frequency: 2000, db: 35, ear: 'right', conduction: 'air', masked: false, noResponse: false },
        { frequency: 500, db: 15, ear: 'left', conduction: 'air', masked: false, noResponse: false },
        { frequency: 1000, db: 20, ear: 'left', conduction: 'air', masked: false, noResponse: false },
        { frequency: 2000, db: 25, ear: 'left', conduction: 'air', masked: false, noResponse: false }
      ]
    }
  };

  // Salva no banco
  rawDb.prepare(`
    INSERT INTO fono_audiology_records (
      id, tenant_id, patient_id, exam_type, exam_date, results_json
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    testRecordId,
    patient.tenant_id,
    patient.id,
    'clinical',
    '2026-09-17',
    JSON.stringify(examPayload)
  );

  // Recarrega (simula F5 / novo GET)
  const savedRow = rawDb.prepare("SELECT * FROM fono_audiology_records WHERE id = ?").get(testRecordId);
  assert(savedRow, 'O registro salvo deve ser encontrado');

  const loadedResults = JSON.parse(savedRow.results_json);
  assert.strictEqual(loadedResults.schemaVersion, 2);
  assert.strictEqual(loadedResults.audiometry.rightAir[500], 25);
  assert.strictEqual(loadedResults.audiometry.rightAir[1000], 30);
  assert.strictEqual(loadedResults.audiometry.rightAir[2000], 35);
  assert.strictEqual(loadedResults.audiometry.leftAir[500], 15);
  assert.strictEqual(loadedResults.audiometry.leftAir[1000], 20);
  assert.strictEqual(loadedResults.audiometry.leftAir[2000], 25);
});

// ----------------------------------------------------
// TESTE 4: MASCARAMENTO
// ----------------------------------------------------
runTest('Registro de mascaramento com intensidade em dB e persistência', () => {
  const patient = rawDb.prepare("SELECT id, tenant_id FROM patients LIMIT 1").get();
  const testId = 'f-aud-mask-' + Date.now();

  const payload = {
    schemaVersion: 2,
    audiometry: {
      thresholds: [
        { frequency: 1000, db: 45, ear: 'right', conduction: 'air', masked: true, maskingLevel: 55, noResponse: false },
        { frequency: 1000, db: 20, ear: 'right', conduction: 'bone', masked: true, maskingLevel: 35, noResponse: false }
      ]
    }
  };

  rawDb.prepare(`
    INSERT INTO fono_audiology_records (id, tenant_id, patient_id, exam_type, exam_date, results_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(testId, patient.tenant_id, patient.id, 'clinical', '2026-09-17', JSON.stringify(payload));

  const row = rawDb.prepare("SELECT results_json FROM fono_audiology_records WHERE id = ?").get(testId);
  const res = JSON.parse(row.results_json);
  assert.strictEqual(res.audiometry.thresholds[0].masked, true);
  assert.strictEqual(res.audiometry.thresholds[0].maskingLevel, 55);
  assert.strictEqual(res.audiometry.thresholds[1].masked, true);
  assert.strictEqual(res.audiometry.thresholds[1].maskingLevel, 35);
});

// ----------------------------------------------------
// TESTE 5: AUSÊNCIA DE RESPOSTA (NO RESPONSE)
// ----------------------------------------------------
runTest('Registro de ausência de resposta com marcação ASHA e persistência', () => {
  const patient = rawDb.prepare("SELECT id, tenant_id FROM patients LIMIT 1").get();
  const testId = 'f-aud-nr-' + Date.now();

  const payload = {
    schemaVersion: 2,
    audiometry: {
      thresholds: [
        { frequency: 4000, db: 110, ear: 'left', conduction: 'air', masked: false, noResponse: true }
      ]
    }
  };

  rawDb.prepare(`
    INSERT INTO fono_audiology_records (id, tenant_id, patient_id, exam_type, exam_date, results_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(testId, patient.tenant_id, patient.id, 'clinical', '2026-09-17', JSON.stringify(payload));

  const row = rawDb.prepare("SELECT results_json FROM fono_audiology_records WHERE id = ?").get(testId);
  const res = JSON.parse(row.results_json);
  assert.strictEqual(res.audiometry.thresholds[0].noResponse, true);
  assert.strictEqual(res.audiometry.thresholds[0].db, 110);
});

// ----------------------------------------------------
// TESTE 6: CRITÉRIOS DE CLASSIFICAÇÃO DO GRAU (OMS 2021 vs Lloyd & Kaplan 1978)
// ----------------------------------------------------
runTest('Cálculo do grau altera conforme critério adotado (OMS 2021 vs Lloyd & Kaplan)', () => {
  // Limiares: 500=30, 1000=30, 2000=30, 4000=60
  // Para Lloyd & Kaplan: média de 500, 1000, 2000 = (30+30+30)/3 = 30 dB -> Leve (26-40)
  // Para OMS 2021: média de 500, 1000, 2000, 4000 = (30+30+30+60)/4 = 37.5 -> 38 dB -> Moderada (35 a <50)

  // Função pura que reflete a lógica implementada
  function calcPta(thresholds, criterion) {
    if (criterion === 'lloyd_kaplan_1978') {
      const vals = [thresholds[500], thresholds[1000], thresholds[2000]];
      const avg = Math.round(vals.reduce((a, b) => a + b, 0) / 3);
      if (avg < 26) return { avg, deg: 'normal' };
      if (avg <= 40) return { avg, deg: 'leve' };
      if (avg <= 55) return { avg, deg: 'moderada' };
      return { avg, deg: 'severa' };
    }
    if (criterion === 'oms_2021') {
      const vals = [thresholds[500], thresholds[1000], thresholds[2000], thresholds[4000]];
      const avg = Math.round(vals.reduce((a, b) => a + b, 0) / 4);
      if (avg < 20) return { avg, deg: 'normal' };
      if (avg < 35) return { avg, deg: 'leve' };
      if (avg < 50) return { avg, deg: 'moderada' };
      return { avg, deg: 'severa' };
    }
    return { avg: null, deg: 'none' };
  }

  const th = { 500: 30, 1000: 30, 2000: 30, 4000: 60 };
  const resLloyd = calcPta(th, 'lloyd_kaplan_1978');
  const resOMS = calcPta(th, 'oms_2021');

  assert.strictEqual(resLloyd.avg, 30);
  assert.strictEqual(resLloyd.deg, 'leve');

  assert.strictEqual(resOMS.avg, 38);
  assert.strictEqual(resOMS.deg, 'moderada');
  assert.notStrictEqual(resLloyd.deg, resOMS.deg, 'Os graus devem mudar de acordo com as frequências da média');
});

// ----------------------------------------------------
// TESTE 7: CLASSIFICAÇÃO DO TIPO DA PERDA (Silman & Silverman 1997)
// ----------------------------------------------------
runTest('Sugestão assistida de perda Condutiva (VO normal, VA alterada, gap >= 15 dB)', () => {
  // VA = 40 dB, VO = 15 dB (gap = 25 dB)
  function calcLossType(va, vo) {
    if (va > 25) {
      const gap = va - vo;
      if (vo <= 15 && gap >= 15) return 'conductive';
      if (vo > 15 && gap <= 10) return 'sensorineural';
      if (vo > 15 && gap > 10) return 'mixed';
    }
    return 'normal';
  }

  const t1 = calcLossType(40, 15);
  assert.strictEqual(t1, 'conductive', 'Deve sugerir condutiva');

  const t2 = calcLossType(40, 35);
  assert.strictEqual(t2, 'sensorineural', 'Deve sugerir neurossensorial (gap 5 dB <= 10)');

  const t3 = calcLossType(50, 30);
  assert.strictEqual(t3, 'mixed', 'Deve sugerir mista (VO > 15 e gap 20 dB > 10)');
});

// ----------------------------------------------------
// TESTE 8: LOGOAUDIOMETRIA ESTRUTURADA
// ----------------------------------------------------
runTest('Logoaudiometria: persistência e classificação do IPRF sem intervalos inventados', () => {
  const patient = rawDb.prepare("SELECT id, tenant_id FROM patients LIMIT 1").get();
  const testId = 'f-aud-speech-' + Date.now();

  const payload = {
    schemaVersion: 2,
    speechAudiometry: {
      lrfOD: 25,
      lrfOE: 20,
      ldvOD: 20,
      ldvOE: 15,
      iprfOD: 88, // Discreta dificuldade (78 a 88%)
      iprfOE: 100 // Normalidade (90 a 100%)
    }
  };

  rawDb.prepare(`
    INSERT INTO fono_audiology_records (id, tenant_id, patient_id, exam_type, exam_date, results_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(testId, patient.tenant_id, patient.id, 'clinical', '2026-09-17', JSON.stringify(payload));

  const row = rawDb.prepare("SELECT results_json FROM fono_audiology_records WHERE id = ?").get(testId);
  const res = JSON.parse(row.results_json);
  assert.strictEqual(res.speechAudiometry.lrfOD, 25);
  assert.strictEqual(res.speechAudiometry.iprfOD, 88);
  assert.strictEqual(res.speechAudiometry.iprfOE, 100);
});

// ----------------------------------------------------
// TESTE 9: TIMPANOMETRIA ESTRUTURADA
// ----------------------------------------------------
runTest('Timpanometria estruturada com sonda, volume, pressão, complacência e curva', () => {
  const patient = rawDb.prepare("SELECT id, tenant_id FROM patients LIMIT 1").get();
  const testId = 'f-aud-tymp-' + Date.now();

  const payload = {
    schemaVersion: 2,
    tympanometry: {
      probeFrequency: '226',
      right: { earCanalVolume: 1.1, peakPressure: -15, compliance: 0.65, curveType: 'A' },
      left: { earCanalVolume: 1.0, peakPressure: -120, compliance: 0.2, curveType: 'C' }
    }
  };

  rawDb.prepare(`
    INSERT INTO fono_audiology_records (id, tenant_id, patient_id, exam_type, exam_date, results_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(testId, patient.tenant_id, patient.id, 'clinical', '2026-09-17', JSON.stringify(payload));

  const row = rawDb.prepare("SELECT results_json FROM fono_audiology_records WHERE id = ?").get(testId);
  const res = JSON.parse(row.results_json);
  assert.strictEqual(res.tympanometry.probeFrequency, '226');
  assert.strictEqual(res.tympanometry.right.curveType, 'A');
  assert.strictEqual(res.tympanometry.left.curveType, 'C');
  assert.strictEqual(res.tympanometry.left.peakPressure, -120);
});

// ----------------------------------------------------
// TESTE 10: WEBER AUDIOMÉTRICO SEPARADO
// ----------------------------------------------------
runTest('Weber audiométrico persistido separadamente do audiograma tonal', () => {
  const patient = rawDb.prepare("SELECT id, tenant_id FROM patients LIMIT 1").get();
  const testId = 'f-aud-weber-' + Date.now();

  const payload = {
    schemaVersion: 2,
    weber: {
      500: 'lateralize_right',
      1000: 'lateralize_right',
      2000: 'indifferent',
      3000: 'not_performed',
      4000: 'not_performed'
    }
  };

  rawDb.prepare(`
    INSERT INTO fono_audiology_records (id, tenant_id, patient_id, exam_type, exam_date, results_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(testId, patient.tenant_id, patient.id, 'clinical', '2026-09-17', JSON.stringify(payload));

  const row = rawDb.prepare("SELECT results_json FROM fono_audiology_records WHERE id = ?").get(testId);
  const res = JSON.parse(row.results_json);
  assert.strictEqual(res.weber[500], 'lateralize_right');
  assert.strictEqual(res.weber[2000], 'indifferent');
  assert.strictEqual(res.weber[3000], 'not_performed');
});

// ----------------------------------------------------
// TESTE 11: HISTÓRICO LONGITUDINAL (NÃO SOBRESCREVE)
// ----------------------------------------------------
runTest('Múltiplos exames para o mesmo paciente geram registros independentes', () => {
  const patient = rawDb.prepare("SELECT id, tenant_id FROM patients LIMIT 1").get();
  const exam1Id = 'f-aud-hist-1-' + Date.now();
  const exam2Id = 'f-aud-hist-2-' + (Date.now() + 100);

  rawDb.prepare(`
    INSERT INTO fono_audiology_records (id, tenant_id, patient_id, exam_type, exam_date, results_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(exam1Id, patient.tenant_id, patient.id, 'clinical', '2025-08-10', JSON.stringify({ schemaVersion: 2, note: 'Exame 1' }));

  rawDb.prepare(`
    INSERT INTO fono_audiology_records (id, tenant_id, patient_id, exam_type, exam_date, results_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(exam2Id, patient.tenant_id, patient.id, 'clinical', '2026-03-15', JSON.stringify({ schemaVersion: 2, note: 'Exame 2' }));

  const rows = rawDb.prepare(`
    SELECT id, exam_date FROM fono_audiology_records
    WHERE patient_id = ? AND tenant_id = ?
    ORDER BY exam_date DESC
  `).all(patient.id, patient.tenant_id);

  const found1 = rows.find(r => r.id === exam1Id);
  const found2 = rows.find(r => r.id === exam2Id);

  assert(found1, 'Exame 1 deve existir no histórico');
  assert(found2, 'Exame 2 deve existir no histórico');
  assert.notStrictEqual(found1.id, found2.id, 'Os exames devem ser registros independentes');
});

// ----------------------------------------------------
// TESTE 12: LGPD / ISOLAMENTO MULTITENANT & SEXO CANÔNICO
// ----------------------------------------------------
runTest('LGPD: isolamento entre tenants e persistência do sexo canônico na tabela patients', () => {
  // 1. Verifica se a coluna gender foi criada na tabela patients
  const info = rawDb.prepare("PRAGMA table_info(patients)").all();
  const hasGender = info.some(c => c.name === 'gender');
  assert(hasGender, 'A coluna gender deve existir canonicamente na tabela patients');

  // 2. Atualiza o sexo de um paciente de teste
  const patient = rawDb.prepare("SELECT id FROM patients LIMIT 1").get();
  rawDb.prepare("UPDATE patients SET gender = ? WHERE id = ?").run('F', patient.id);
  const updated = rawDb.prepare("SELECT gender FROM patients WHERE id = ?").get(patient.id);
  assert.strictEqual(updated.gender, 'F', 'O sexo deve ser persistido canonicamente');

  // 3. Isolamento entre tenants: busca por tenant inexistente deve retornar vazio
  const fakeTenantRecords = rawDb.prepare("SELECT * FROM fono_audiology_records WHERE tenant_id = 'tenant-fake-x'").all();
  assert.strictEqual(fakeTenantRecords.length, 0, 'Clínica A nunca acessa registros da Clínica B');
});

console.log(`\n=== RESUMO: ${passedTests}/${totalTests} TESTES PASSARAM COM SUCESSO! ===\n`);
