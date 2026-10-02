const assert = require('node:assert/strict');
const { PSYCHOLOGY_FIELDS, parseTranscriptToDiarizedSegments, validatePsychologyExtraction, extractPsychologySectionsLocalFallback, DIARIZATION_PROVIDERS } = require('./dist/services/speech-diarization.service');
const one = parseTranscriptToDiarizedSegments('Olá\nComo passou?');
assert(one.every(s => s.speakerId === 'speaker_1' && s.startTime === undefined));
const turns = parseTranscriptToDiarizedSegments('[00:10] Falante 1: Combinamos registrar o sono.\n[00:16] Falante 2: Concordo em registrar o sono.\n[00:25] Familiar: Estou disponível para ajudar.');
assert.deepEqual(turns.map(s => [s.speakerId,s.startTime]), [['speaker_1',10],['speaker_2',16],['speaker_3',25]]);
const speakers = {speaker_1:'professional',speaker_2:'patient',speaker_3:'family'};
const ev = turns.map(s => ({speaker:s.speakerId,text:s.text,startTime:s.startTime}));
const raw = {goals:[{title:'Registrar sono',agreedExplicitly:true,evidence:ev}],screenings:{scoreRaw:{value:'99',evidence:ev},classification:{value:'Alto',evidence:ev},clinicalNotes:{value:'Sono discutido',evidence:ev}},riskAssessment:{suicidalIdeation:{value:'Relato',evidence:ev}},mentalState:{orientation:{value:'Preservada',evidence:[{speaker:'speaker_2',text:'Estou orientado'}]}}};
for(const [section, fields] of Object.entries(PSYCHOLOGY_FIELDS)) if(section!=='goals') { raw[section] ||= {}; for(const key of Object.keys(fields)) if(!raw[section][key]) raw[section][key]={value:'Trecho revisável',evidence:ev}; }
raw.mentalState.orientation={value:'Preservada',evidence:[{speaker:'speaker_2',text:'Estou orientado'}]};
const clean=validatePsychologyExtraction(raw,turns,speakers);
assert.equal(clean.mentalState.orientation,null);assert.equal(clean.screenings.scoreRaw,undefined);assert.equal(clean.screenings.classification,undefined);assert.equal(clean.goals.length,1);assert.equal(clean.goals[0].indicator,null);assert.equal(clean.riskAssessment.suicidalIdeation.requiresProfessionalReview,true);
assert.equal(validatePsychologyExtraction({goals:[{title:'Inventada',agreedExplicitly:true,evidence:[ev[0]]}]},turns,speakers).goals.length,0);
assert.equal(validatePsychologyExtraction({anamnesis:{sleepPatterns:{value:'Relato',evidence:[{...ev[1],startTime:99}]}}},turns,speakers).anamnesis.sleepPatterns,null);
const swapped=validatePsychologyExtraction(raw,turns,{...speakers,speaker_1:'patient',speaker_2:'professional'});assert.equal(swapped.riskAssessment.suicidalIdeation.evidence[0].role,'patient');
const fallback=extractPsychologySectionsLocalFallback(turns,speakers);for(const [section,fields] of Object.entries(fallback)) if(section!=='goals') assert(Object.values(fields).every(v=>v===null));
assert.equal(DIARIZATION_PROVIDERS.filter(p=>p.status==='active').length,1);assert.equal(DIARIZATION_PROVIDERS[0].supportsRecordedDiarization,false);
console.log('PASS: 7 sections; single/multiple/third speaker; swapped roles; exact evidence; absent fields; no scores; agreed goals; safe fallback/provider.');
