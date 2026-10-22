const assert = require('assert');

// Test suite for clinical module resolver logic matching frontend/src/components/clinical/clinicalModuleResolver.ts
console.log('--- TEST: CLINICAL MODULE RESOLVER ---');

const ALL_CLINICAL_MODULES = {
  ZemdaMed: { name: 'ZemdaMed' },
  ZemdaFisio: { name: 'ZemdaFisio' },
  ZemdaFono: { name: 'ZemdaFono' },
  ZemdaOdonto: { name: 'ZemdaOdonto' },
  ZemdaNutri: { name: 'ZemdaNutri' },
  ZemdaTO: { name: 'ZemdaTO' },
  ZemdaPsico: { name: 'ZemdaPsico' },
  ZemdaPP: { name: 'ZemdaPP' },
  ZemdaPersonal: { name: 'ZemdaPersonal' },
  ZemdaEstetic: { name: 'ZemdaEstetic' },
  general: { name: 'Atendimento Geral' },
};

function resolveClinicalModuleId(ctx) {
  const explicit = ctx.moduleType || ctx.clinicalModule;
  if (
    explicit &&
    explicit !== 'general' &&
    explicit !== 'ZemdaBody' &&
    explicit !== 'Zemda360' &&
    ALL_CLINICAL_MODULES[explicit]
  ) {
    return explicit;
  }

  const userComm = ctx.currentUser?.commercialModule || ctx.auth?.currentUser?.commercialModule;
  if (userComm && userComm !== 'general' && ALL_CLINICAL_MODULES[userComm]) {
    return userComm;
  }

  const a = ctx.auth || {};
  if (a.isPersonalTrainer || a.isZemdaPersonal) return 'ZemdaPersonal';
  if (a.isPsychologist || a.isZemdaPsico) return 'ZemdaPsico';
  if (a.isSpeechTherapist || a.isZemdaFono) return 'ZemdaFono';
  if (a.isPhysiotherapist || a.isZemdaFisio) return 'ZemdaFisio';
  if (a.isDentist || a.isZemdaOdonto) return 'ZemdaOdonto';
  if (a.isNutritionist || a.isZemdaNutri) return 'ZemdaNutri';
  if (a.isOccupationalTherapist || a.isZemdaTO) return 'ZemdaTO';
  if (a.isDoctor || a.isZemdaMed) return 'ZemdaMed';
  if (a.isPsychopedagogue || a.isZemdaPP) return 'ZemdaPP';
  if (a.isEsthetician || a.isZemdaEstetic) return 'ZemdaEstetic';

  const text = [
    ctx.currentUser?.professionName,
    ctx.currentUser?.professionSlug,
    ctx.currentUser?.canonicalProfessionName,
    ctx.currentUser?.professionId,
    ctx.auth?.currentUser?.professionName,
    ctx.auth?.currentUser?.professionSlug,
    ctx.auth?.currentUser?.canonicalProfessionName,
    ctx.auth?.currentUser?.professionId,
    ctx.serviceName
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    text.includes('personal') ||
    text.includes('educa') ||
    text.includes('cref') ||
    text.includes('treino') ||
    text.includes('muscula')
  ) {
    return 'ZemdaPersonal';
  }
  if (text.includes('psicopedag') || text.includes('abpp')) {
    return 'ZemdaPP';
  }
  if (text.includes('psicolog') || text.includes('psicólog') || text.includes('crp')) {
    return 'ZemdaPsico';
  }
  if (text.includes('fono') || text.includes('crfa')) {
    return 'ZemdaFono';
  }
  if (text.includes('odonto') || text.includes('dentis') || text.includes('cro')) {
    return 'ZemdaOdonto';
  }
  if (text.includes('ocupacional') || text.includes('avd')) {
    return 'ZemdaTO';
  }
  if (text.includes('nutri') || text.includes('crn')) {
    return 'ZemdaNutri';
  }
  if (text.includes('estet') || text.includes('estét')) {
    return 'ZemdaEstetic';
  }
  if (text.includes('médic') || text.includes('medic') || text.includes('crm')) {
    return 'ZemdaMed';
  }
  if (text.includes('fisio') || text.includes('crefito') || text.includes('fisioterap')) {
    return 'ZemdaFisio';
  }

  return 'general';
}

const testCases = [
  // Auth flags
  { name: 'Personal Trainer / Educação Física', ctx: { auth: { isPersonalTrainer: true } }, expected: 'ZemdaPersonal' },
  { name: 'Psicologia', ctx: { auth: { isPsychologist: true } }, expected: 'ZemdaPsico' },
  { name: 'Fonoaudiologia', ctx: { auth: { isSpeechTherapist: true } }, expected: 'ZemdaFono' },
  { name: 'Fisioterapia', ctx: { auth: { isPhysiotherapist: true } }, expected: 'ZemdaFisio' },
  { name: 'Odontologia', ctx: { auth: { isDentist: true } }, expected: 'ZemdaOdonto' },
  { name: 'Nutrição', ctx: { auth: { isNutritionist: true } }, expected: 'ZemdaNutri' },
  { name: 'Terapia Ocupacional', ctx: { auth: { isOccupationalTherapist: true } }, expected: 'ZemdaTO' },
  { name: 'Medicina', ctx: { auth: { isDoctor: true } }, expected: 'ZemdaMed' },
  { name: 'Psicopedagogia', ctx: { auth: { isPsychopedagogue: true } }, expected: 'ZemdaPP' },
  { name: 'Estética', ctx: { auth: { isEsthetician: true } }, expected: 'ZemdaEstetic' },

  // By profession string
  { name: 'Profissão string Personal', ctx: { currentUser: { professionName: 'Personal Trainer CREF' } }, expected: 'ZemdaPersonal' },
  { name: 'Profissão string Psicólogo', ctx: { currentUser: { professionName: 'Psicóloga Clínica' } }, expected: 'ZemdaPsico' },
  { name: 'Profissão string Fonoaudiologia', ctx: { currentUser: { professionName: 'Fonoaudiólogo' } }, expected: 'ZemdaFono' },
  { name: 'Profissão string Fisioterapia', ctx: { currentUser: { professionName: 'Fisioterapia Neuro' } }, expected: 'ZemdaFisio' },
  { name: 'Profissão string Dentista', ctx: { currentUser: { professionName: 'Cirurgião Dentista' } }, expected: 'ZemdaOdonto' },
  { name: 'Profissão string Nutrição', ctx: { currentUser: { professionName: 'Nutricionista Esportiva' } }, expected: 'ZemdaNutri' },
  { name: 'Profissão string TO', ctx: { currentUser: { professionName: 'Terapeuta Ocupacional' } }, expected: 'ZemdaTO' },
  { name: 'Profissão string Médico', ctx: { currentUser: { professionName: 'Médico Clínico' } }, expected: 'ZemdaMed' },
  { name: 'Profissão string Psicopedagoga', ctx: { currentUser: { professionName: 'Psicopedagoga' } }, expected: 'ZemdaPP' },
  { name: 'Profissão string Esteticista', ctx: { currentUser: { professionName: 'Esteticista e Cosmetóloga' } }, expected: 'ZemdaEstetic' },

  // By appointment clinical_module
  { name: 'Appointment clinical_module ZemdaPersonal', ctx: { clinicalModule: 'ZemdaPersonal' }, expected: 'ZemdaPersonal' },
  { name: 'Appointment clinical_module ZemdaPsico', ctx: { clinicalModule: 'ZemdaPsico' }, expected: 'ZemdaPsico' },
  { name: 'Appointment clinical_module ZemdaMed', ctx: { clinicalModule: 'ZemdaMed' }, expected: 'ZemdaMed' },
  { name: 'Appointment clinical_module ZemdaFisio', ctx: { clinicalModule: 'ZemdaFisio' }, expected: 'ZemdaFisio' },
  { name: 'Appointment clinical_module ZemdaOdonto', ctx: { clinicalModule: 'ZemdaOdonto' }, expected: 'ZemdaOdonto' },
  { name: 'Appointment clinical_module ZemdaNutri', ctx: { clinicalModule: 'ZemdaNutri' }, expected: 'ZemdaNutri' },
  { name: 'Appointment clinical_module ZemdaTO', ctx: { clinicalModule: 'ZemdaTO' }, expected: 'ZemdaTO' },
  { name: 'Appointment clinical_module ZemdaPP', ctx: { clinicalModule: 'ZemdaPP' }, expected: 'ZemdaPP' },
  { name: 'Appointment clinical_module ZemdaFono', ctx: { clinicalModule: 'ZemdaFono' }, expected: 'ZemdaFono' },
  { name: 'Appointment clinical_module ZemdaEstetic', ctx: { clinicalModule: 'ZemdaEstetic' }, expected: 'ZemdaEstetic' },
];

testCases.forEach((tc) => {
  const result = resolveClinicalModuleId(tc.ctx);
  assert.strictEqual(result, tc.expected, `Falha em ${tc.name}: esperado ${tc.expected}, obteve ${result}`);
  console.log(`  ✅ ${tc.name} -> ${result}`);
});

console.log(`\nTODOS OS ${testCases.length} TESTES DE RESOLUÇÃO DO MÓDULO PASSARAM COM SUCESSO!`);
