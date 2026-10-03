const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const esbuild=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {calculateAssessment,normalizeLegacyAssessmentForReport}=require('../../backend/dist/services/personal-assessment-calculation.service');
const out=path.resolve(__dirname,'../../tmp/personal-report-tests');fs.mkdirSync(out,{recursive:true});
esbuild.buildSync({entryPoints:[path.resolve(__dirname,'../src/components/personal/PersonalAssessmentReport.tsx')],bundle:true,platform:'node',format:'cjs',outfile:path.join(out,'report.cjs'),external:['react','react-dom'],define:{'import.meta.env':'{}'},jsx:'automatic'});
process.env.NODE_PATH=path.resolve(__dirname,'../node_modules');require('node:module').Module._initPaths();
const {PersonalAssessmentReport}=require(path.join(out,'report.cjs'));
let checks=0;
const clinic={name:'Teste Clínica Completa'},professional={name:'Pedro Michielin',registration_type:'CREF',registration_number:'123'};
for(const sex of ['male','female','not_informed'])for(const count of [1,2,5])for(const partial of [false,true])for(const device of ['Omron','Tanita','InBody','VAI','none']) {
 const student={full_name:'Aluno de teste',birth_date:'1996-03-01',anthropometric_sex:sex};
 const history=Array.from({length:count},(_,i)=>{
  const inputs={id:'a'+i,assessment_date:`2026-03-0${i+1}`,weight:80-i,height:180,waist_cm:90-i,hip_cm:100,fold_triceps:16,fold_subscapular:18,fold_chest:12,fold_axillary:14,fold_suprailiac:22,fold_abdominal:20,fold_thigh:24,...(partial?{}:{fold_supraspinale:15,fold_calf:12,humerus_breadth_cm:7,femur_breadth_cm:9,arm_right_flexed:35,calf_right:38}),...(device==='VAI'?{triglycerides_mg_dl:150,hdl_mg_dl:50}:device==='none'?{}:{tav_value:12,tav_equipment:device,tav_unit:'nível'})};
  return {...inputs,...calculateAssessment(inputs,student).values};
 });
 const data={assessment:history.at(-1),student,professional,previous_assessment:history.at(-2),evolution_history:history};
 for(const evolution of [false,true]) {
  const html=renderToStaticMarkup(React.createElement(PersonalAssessmentReport,{data,clinic,evolution}));
  assert.ok(!/NaN|Infinity|#DIV\/0!/.test(html));assert.match(html,/size:A4/);assert.match(html,/break-after:page/);assert.match(html,/Teste Clínica Completa/);assert.match(html,/Pedro Michielin/);assert.ok(html.includes('<svg'));
  if(!evolution && sex==='not_informed')assert.match(html,/métricas dependentes de sexo não calculadas/);
  if(!evolution && device==='VAI' && sex!=='not_informed')assert.match(html,/indicador indireto/);
  checks++;
  if(sex==='female'&&count===5&&!partial&&device==='VAI'&&!evolution)fs.writeFileSync(path.join(out,'report.html'),html);
 }
}
const original={id:'old',assessment_date:'2020-01-01',weight:70,height:170,body_fat_percentage:26,protocol:'legacy'};
const normalized=normalizeLegacyAssessmentForReport(original,{gender:'f'});
const html=renderToStaticMarkup(React.createElement(PersonalAssessmentReport,{data:{...normalized,student:{full_name:'Legado'},professional,evolution_history:[normalized.assessment]},clinic}));assert.match(html,/valores históricos preservados/);assert.match(html,/26/);assert.ok(!/NaN|Infinity|#DIV\/0!/.test(html));checks++;
console.log(JSON.stringify({checks,output:'tmp/personal-report-tests/report.html'}));
