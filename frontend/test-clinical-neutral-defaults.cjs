const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function initial(module, state, scope = {}) {
  const file = path.join(__dirname, 'src/components', module + '.tsx');
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name)
      && node.name.elements[0].getText(ast) === state) expression = node.initializer.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(expression, `${module}: ${state}`);
  const js = ts.transpile(`globalThis.result = (${expression});`);
  const context = { ...scope };
  vm.runInNewContext(js, context);
  return context.result;
}
function blank(value) {
  if (value && typeof value === 'object') return Object.values(value).every(blank);
  return value === '' || value === null || value === undefined;
}
for (const [module, states] of [
  ['medical/ZemdaMedWorkspace', ['physicalExam', 'neurologicalExam']],
  ['nutrition/NutritionWorkspace', ['anamnesisData', 'digestiveSymptoms']],
  ['speech-therapy/SpeechTherapyWorkspace', ['languageData', 'orofacialData', 'voiceData', 'fluencyData', 'dysphagiaData', 'structuredGoals']],
  ['occupational-therapy/OccupationalTherapyWorkspace', ['motorCognitiveData', 'assistiveForm']],
  ['estetic/ZemdaEsteticWorkspace', ['assessmentForm']],
  ['personal/PersonalAssessmentModal', ['strengthTests']],
  ['physiotherapy/PhysiotherapyWorkspace', ['homeExercises', 'painScore', 'estimatedSessions', 'treatmentResponse', 'postureAnterior', 'postureLateral', 'posturePosterior', 'gaitAnalysis']],
  ['clinical/QuickConsultationModal', ['toIndependenceLevel', 'toSensoryStatus', 'fonoVoiceQuality', 'fonoOrofacialHabit', 'painScore']]
]) for (const state of states) assert.ok(blank(initial(module, state)), `${module}.${state} must be clinically neutral`);
const perio = initial('dentistry/DentistryWorkspace', 'perioForm');
assert.ok(blank(perio));
const endo = initial('dentistry/DentistryWorkspace', 'endoForm');
delete endo.sessionsCount;
assert.ok(blank(endo));
const plan = initial('nutrition/NutritionWorkspace', 'planForm');
assert.equal(plan.calorieTarget, ''); assert.equal(plan.waterTargetMl, '');
assert.ok(plan.meals.every(meal => !meal.items.length));
const adl = initial('occupational-therapy/OccupationalTherapyWorkspace', 'adlItems');
assert.ok(adl.every(item => blank(item.score)));
const strength = initial('physiotherapy/PhysiotherapyWorkspace', 'muscleStrengthList');
assert.ok(strength.every(item => blank(item.rightGrade) && blank(item.leftGrade)));
const idv = initial('speech-therapy/Idv10AssessmentSection', 'answers', { initialDraft: undefined });
assert.ok(idv.every(item => item === null));
const existing = Array(10).fill(2);
assert.equal(initial('speech-therapy/Idv10AssessmentSection', 'answers', { initialDraft: { answers: existing } }), existing);

// Exercise the reset hook across patients and encounters without modifying recovered data.
let refs = [], cursor = 0, effects = [];
const react = {
  useRef: value => refs[cursor++] ||= { current: value },
  useLayoutEffect: callback => effects.push(callback)
};
const hookSource = fs.readFileSync(path.join(__dirname, 'src/hooks/useClinicalFormReset.ts'), 'utf8');
const compiled = ts.transpileModule(hookSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {}, require: () => react, structuredClone };
vm.runInNewContext(compiled, context);
let form = { finding: '', nested: { score: null } };
const render = key => {
  cursor = 0; effects = [];
  context.exports.useClinicalFormReset(key, [[form, value => { form = value; }]]);
  effects.forEach(effect => effect());
};
render('patient-a:visit-1');
form = { finding: 'Recorded finding', nested: { score: 5 } };
render('patient-a:visit-1');
assert.equal(form.finding, 'Recorded finding');
render('patient-b:visit-2');
assert.equal(form.finding, ''); assert.equal(form.nested.score, null);
form.nested.score = 3;
render('patient-b:visit-3');
assert.equal(form.nested.score, null);
console.log('PASS: neutral clinical defaults, empty prescriptions, unassessed scores, preserved drafts, patient/encounter reset isolation.');
