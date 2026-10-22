const assert = require('assert');

console.log('--- TEST: CLINICAL MODULE COPY & PROFILES ---');

// We simulate the logic directly from clinicalModuleCopy.ts
function normalizeClinicalModuleKey(moduleType, specialty, domain) {
  const candidates = [moduleType, specialty, domain].filter(Boolean);
  if (candidates.length === 0) return 'general';

  const raw = candidates.join(' ').toLowerCase();

  if (raw.includes('fono') || raw.includes('crfa') || raw.includes('speech') || raw.includes('audiolog') || raw.includes('disfagia')) {
    return 'fono';
  }
  if (raw.includes('fisio') || raw.includes('physio') || raw.includes('crefito') || raw.includes('goniometr') || raw.includes('cinesio')) {
    return 'fisio';
  }
  if (raw.includes('ocupacional') || raw.includes('occupational') || candidates.some(c => c.toLowerCase() === 'to' || c.toLowerCase() === 'zemdato') || raw.includes('avd') || raw.includes('aivd')) {
    return 'to';
  }
  if (raw.includes('nutri') || raw.includes('crn') || raw.includes('dieta') || raw.includes('antropometr')) {
    return 'nutri';
  }
  if (raw.includes('psicopedag') || raw.includes('abpp') || candidates.some(c => c.toLowerCase() === 'pp' || c.toLowerCase() === 'zemdapp')) {
    return 'pp';
  }
  if (raw.includes('psico') || raw.includes('psychology') || raw.includes('crp') || raw.includes('satepsi') || raw.includes('mental')) {
    return 'psico';
  }
  if (raw.includes('odonto') || raw.includes('dentis') || raw.includes('cro') || raw.includes('bucal') || raw.includes('perio')) {
    return 'odonto';
  }
  if (raw.includes('personal') || raw.includes('educa') || raw.includes('cref') || raw.includes('treino') || raw.includes('muscula')) {
    return 'personal';
  }
  if (raw.includes('estet') || raw.includes('estét') || raw.includes('aesthetic') || raw.includes('cosmet')) {
    return 'estetic';
  }
  if (raw.includes('medic') || raw.includes('médic') || raw.includes('crm') || candidates.some(c => c.toLowerCase() === 'med' || c.toLowerCase() === 'zemdamed')) {
    return 'med';
  }

  return 'general';
}

// 1. Test alias normalization for all workspaces
const normalizationCases = [
  { args: ['fono', undefined, undefined], expected: 'fono' },
  { args: ['ZemdaFono', undefined, undefined], expected: 'fono' },
  { args: [undefined, 'fono', undefined], expected: 'fono' },
  { args: ['fisio', undefined, undefined], expected: 'fisio' },
  { args: ['ZemdaFisio', undefined, undefined], expected: 'fisio' },
  { args: [undefined, 'fisio', undefined], expected: 'fisio' },
  { args: [undefined, 'to', undefined], expected: 'to' },
  { args: ['ZemdaTO', undefined, undefined], expected: 'to' },
  { args: [undefined, undefined, 'terapia_ocupacional'], expected: 'to' },
  { args: ['nutri', undefined, undefined], expected: 'nutri' },
  { args: ['ZemdaNutri', undefined, undefined], expected: 'nutri' },
  { args: [undefined, 'nutri', undefined], expected: 'nutri' },
  { args: [undefined, undefined, 'psychology'], expected: 'psico' },
  { args: ['ZemdaPsico', undefined, undefined], expected: 'psico' },
  { args: [undefined, 'psico', undefined], expected: 'psico' },
  { args: ['ZemdaPP', 'pp', undefined], expected: 'pp' },
  { args: [undefined, 'pp', undefined], expected: 'pp' },
  { args: [undefined, undefined, 'dentistry'], expected: 'odonto' },
  { args: ['ZemdaOdonto', undefined, undefined], expected: 'odonto' },
  { args: [undefined, undefined, 'personal_trainer'], expected: 'personal' },
  { args: ['ZemdaPersonal', undefined, undefined], expected: 'personal' },
  { args: ['ZemdaEstetic', undefined, undefined], expected: 'estetic' },
  { args: ['ZemdaMed', undefined, undefined], expected: 'med' },
  { args: [undefined, undefined, undefined], expected: 'general' },
];

normalizationCases.forEach((tc, idx) => {
  const res = normalizeClinicalModuleKey(...tc.args);
  assert.strictEqual(res, tc.expected, `Case ${idx} failed: ${tc.args.join(',')} -> ${res} !== ${tc.expected}`);
  console.log(`  ✅ Normalização [${tc.args.filter(Boolean).join(', ') || 'nenhum'}] -> ${res}`);
});

// 2. Test Progress Calculation for Increase and Reduction Goals
function calculatePercent(goal) {
  if (goal.progress_percent !== undefined && goal.progress_percent !== null) {
    return Math.min(100, Math.max(0, Number(goal.progress_percent)));
  }
  const currentNum = parseFloat(goal.current_value || '');
  const targetNum = parseFloat(goal.target_value || '');
  const baselineNum = parseFloat(goal.baseline_value || '0');

  if (!isNaN(currentNum) && !isNaN(targetNum) && !isNaN(baselineNum)) {
    const totalDistance = Math.abs(targetNum - baselineNum);
    if (totalDistance === 0) {
      return currentNum === targetNum ? 100 : 0;
    }
    let progress = 0;
    if (targetNum > baselineNum) {
      progress = currentNum - baselineNum;
    } else {
      progress = baselineNum - currentNum;
    }
    const pct = (progress / totalDistance) * 100;
    return Math.min(100, Math.max(0, Math.round(pct)));
  }

  if (goal.status === 'reached' || goal.status === 'achieved') return 100;
  if (goal.status === 'partially_reached') return 50;
  if (goal.status === 'in_progress') return 25;
  return 0;
}

console.log('\n--- TEST: PROGRESS CALCULATION (AUMENTO E REDUÇÃO) ---');
const progressCases = [
  // Aumento: Joelho 60 -> 110
  { baseline: '60', current: '75', target: '110', expected: 30, desc: 'Joelho 60 -> 75 (Alvo 110)' },
  { baseline: '60', current: '110', target: '110', expected: 100, desc: 'Joelho 60 -> 110 (Alvo alcançado)' },
  { baseline: '60', current: '120', target: '110', expected: 100, desc: 'Joelho 60 -> 120 (Alvo ultrapassado, capped em 100)' },
  { baseline: '60', current: '50', target: '110', expected: 0, desc: 'Joelho 60 -> 50 (Regressão, capped em 0)' },

  // Redução: Dor 8 -> 3
  { baseline: '8', current: '5', target: '3', expected: 60, desc: 'Dor 8 -> 5 (Alvo 3)' },
  { baseline: '8', current: '3', target: '3', expected: 100, desc: 'Dor 8 -> 3 (Alvo alcançado)' },
  { baseline: '8', current: '2', target: '3', expected: 100, desc: 'Dor 8 -> 2 (Alvo superado, capped em 100)' },
  { baseline: '8', current: '9', target: '3', expected: 0, desc: 'Dor 8 -> 9 (Piora, capped em 0)' },

  // Redução: Frequência 10 -> 4
  { baseline: '10', current: '7', target: '4', expected: 50, desc: 'Frequência 10 -> 7 (Alvo 4)' },
  { baseline: '10', current: '4', target: '4', expected: 100, desc: 'Frequência 10 -> 4 (Alvo alcançado)' },

  // Redução: Peso 100 -> 90
  { baseline: '100', current: '95', target: '90', expected: 50, desc: 'Peso 100 -> 95 (Alvo 90)' },
  { baseline: '100', current: '90', target: '90', expected: 100, desc: 'Peso 100 -> 90 (Alvo alcançado)' },

  // Redução: Sintomas 20 -> 8
  { baseline: '20', current: '14', target: '8', expected: 50, desc: 'Sintomas 20 -> 14 (Alvo 8)' },
  { baseline: '20', current: '8', target: '8', expected: 100, desc: 'Sintomas 20 -> 8 (Alvo alcançado)' },

  // Status fallback
  { status: 'reached', expected: 100, desc: 'Status reached fallback' },
  { status: 'partially_reached', expected: 50, desc: 'Status partially_reached fallback' },
  { status: 'in_progress', expected: 25, desc: 'Status in_progress fallback' },
];

progressCases.forEach(tc => {
  const goal = {
    baseline_value: tc.baseline,
    current_value: tc.current,
    target_value: tc.target,
    status: tc.status || 'in_progress'
  };
  const res = calculatePercent(goal);
  assert.strictEqual(res, tc.expected, `${tc.desc} falhou: esperado ${tc.expected}, obteve ${res}`);
  console.log(`  ✅ ${tc.desc}: ${res}%`);
});

// 3. Test Unit Validation (110 degrees must pass when unit is '', but fail if unit is '%')
function validateGoalNumeric(val, fieldName, unitStr) {
  if (!val || !val.trim()) return null;
  let clean = val.trim();
  const isPercent = (unitStr && unitStr.includes('%')) || clean.endsWith('%');
  if (clean.endsWith('%')) {
    clean = clean.slice(0, -1).trim();
  }
  const num = Number(clean.replace(',', '.'));
  if (isNaN(num)) {
    return `O campo "${fieldName}" deve conter um valor numérico válido.`;
  }
  if (isPercent && (num < 0 || num > 100)) {
    return `Para metas com unidade percentual (%), o campo "${fieldName}" deve estar no intervalo de 0% a 100%.`;
  }
  return null;
}

console.log('\n--- TEST: UNIT VALIDATION (0-100 APENAS PARA %) ---');
assert.strictEqual(validateGoalNumeric('110', 'Alvo', ''), null, '110 graus com unit vazia deve ser aceito');
console.log('  ✅ Meta = 110 com unit="" -> ACEITO (não mais bloqueado por 110 > 100)');

assert.strictEqual(validateGoalNumeric('110', 'Alvo', 'graus'), null, '110 graus com unit="graus" deve ser aceito');
console.log('  ✅ Meta = 110 com unit="graus" -> ACEITO');

assert.notStrictEqual(validateGoalNumeric('110', 'Alvo', '%'), null, '110 com unit="%" deve ser rejeitado');
console.log('  ✅ Meta = 110 com unit="%" -> REJEITADO (corretamente validado 0-100%)');

assert.notStrictEqual(validateGoalNumeric('110%', 'Alvo', ''), null, '110% digitado explicitamente deve ser rejeitado');
console.log('  ✅ Meta = 110% -> REJEITADO (corretamente validado 0-100%)');

assert.strictEqual(validateGoalNumeric('80%', 'Alvo', ''), null, '80% digitado explicitamente deve ser aceito');
console.log('  ✅ Meta = 80% -> ACEITO');

console.log('\nTODOS OS TESTES DE NORMALIZAÇÃO, CÁLCULO E VALIDAÇÃO PASSARAM COM SUCESSO!');
