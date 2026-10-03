const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.DATABASE_PATH=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'personal-report-')),'test.db');process.env.R2_MOCK_STORAGE='true';
const {db,initializeDatabase}=require('./dist/config/database');initializeDatabase();
const {PersonalController:p}=require('./dist/controllers/personal.controller');
let checks=0;const check=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS',label)};
async function call(method,body={},params={},tenant='personal-report-test') {
 let status=200,data;const req={body,params,query:{},tenantId:tenant,user:{userId:'personal-report-user',role:'clinic_admin'},headers:{},ip:'127.0.0.1',get:()=>undefined};const res={status(n){status=n;return this},json(v){data=v;return this}};
 await p[method](req,res);return {status,data};
}
(async()=>{
 db.prepare("INSERT INTO tenants(id,name,slug,email,status) VALUES('personal-report-test','Teste Clínica Completa','personal-report-test','fixture@test.local','active')").run();
 db.prepare("INSERT INTO users(id,tenant_id,email,password_hash,role,status,name,registration_type,registration_number) VALUES('personal-report-user','personal-report-test','fixture@test.local','test','clinic_admin','active','Pedro Michielin','CREF','123')").run();
 const ids=[];
 for(const [name,sex] of [['Évilyn Piva Lobo','female'],['Gabriel Kuiawinski Zapello','male'],['Aluno sem referência','not_informed']]) {
  const created=await call('createStudent',{name,birth_date:'1996-03-01',anthropometric_sex:sex});assert.equal(created.status,201);const patient_id=created.data.id;
  for(let i=1;i<=5;i++){
   const created=await call('createAssessment',{patient_id,assessment_date:`2026-03-0${i}`,weight:80-i,height:180,waist_cm:90-i,hip_cm:100,triglycerides_mg_dl:150,hdl_mg_dl:50,fold_triceps:16,fold_subscapular:18,fold_chest:12,fold_axillary:14,fold_suprailiac:22,fold_abdominal:20,fold_thigh:24,tav_value:12,tav_equipment:'Omron',tav_unit:'nível',notes:'Observação da fixture'});
   assert.equal(created.status,201);const id=created.data.id;ids.push(id);
   const report=await call('assessmentReportData',{}, {id});assert.equal(report.status,200);check(report.data.professional.name==='Pedro Michielin','professional resolved from professional ID');
   check(report.data.evolution_history.length===i,'ordered evolution history');check(report.data.assessment.anthropometric_sex_at_assessment===sex,'demographic snapshot');
   check(!/NaN|Infinity|#DIV\/0!/.test(JSON.stringify(report.data)),'finite report payload');
   if(sex==='not_informed')check(report.data.assessment.body_fat_percentage===null&&report.data.assessment.vai_value===null&&report.data.assessment.bmr_kcal===null,'no sex-specific fallback');
   else check(report.data.assessment.vai_value>0&&report.data.assessment.tav_value===12,'VAI distinct from TAV');
   check(report.data.assessment.tav_classification==='Alto','automatic Omron interpretation');
  }
  // Profile edits must not reinterpret assessment snapshots or write report reads.
  const before=db.prepare('SELECT * FROM personal_assessments WHERE patient_id=? ORDER BY id').all(patient_id);
  await call('updateStudent',{anthropometric_sex:'not_informed',birth_date:'2000-01-01'},{id:patient_id});
  const report=await call('assessmentReportData',{}, {id:ids[ids.length-1]});check(report.data.assessment.anthropometric_sex_at_assessment===sex,'profile changes preserve historic snapshot');
  assert.deepEqual(db.prepare('SELECT * FROM personal_assessments WHERE patient_id=? ORDER BY id').all(patient_id),before);
 }
 check((await call('assessmentReportData',{}, {id:ids[0]},'foreign')).status===404,'report tenant isolation');
 check((await call('previewAssessment',{patient_id:'foreign'}, {},'foreign')).status===404,'preview tenant isolation');
 const before=db.prepare('SELECT * FROM personal_assessments ORDER BY id').all();initializeDatabase();assert.deepEqual(db.prepare('SELECT * FROM personal_assessments ORDER BY id').all(),before);check(true,'full initialization twice preserves fixture assessments');
 const r=await call('assessmentReportData',{}, {id:ids[0]});const s=await call('previewAssessment',{patient_id:r.data.student.id,weight:90,height:180,waist_cm:90,hip_cm:100});check(s.status===200,'central preview');
 for(const [equipment,protocol,unit,value,label] of [['InBody','tav-proto-inbody','nível',6,'Dentro'],['Omron','tav-proto-omron','nível',15,'Muito alto'],['Tanita','tav-proto-tanita','nível',18,'Excesso']]) {
  const preview=await call('previewAssessment',{patient_id:r.data.student.id,tav_equipment:equipment,tav_protocol_id:protocol,tav_unit:unit,tav_value:value});
  check(preview.data.classifications.tav.classification.includes(label),'preview selected '+equipment+' protocol');
  check(preview.data.classifications.tav.protocolId===protocol,'preview protocol metadata');
  const mismatch=await call('previewAssessment',{patient_id:r.data.student.id,tav_equipment:equipment,tav_protocol_id:protocol,tav_unit:'kg',tav_value:value});
  check(mismatch.data.classifications.tav.status==='unclassified','unit mismatch cannot borrow '+equipment+' table');
 }
 await call('updateAssessment',{weight:82,waist_cm:88}, {id:ids[0]});const updated=(await call('assessmentReportData',{}, {id:ids[0]})).data.assessment;check(Math.abs(updated.bmi-82/1.8**2)<.001,'explicit modern edit recalculates derived metrics');
 check(updated.anthropometric_sex_at_assessment==='female','explicit edit retains historical sex');
 const patient_id=r.data.student.id;
 await call('updateStudent',{anthropometric_sex:'female'}, {id:patient_id});
 const createdAlias=await call('createAssessment',{patient_id,assessment_date:'2026-03-12',weight:70,height:165,waist_cm:80,hip_cm:100,neck_cm:34,triglycerides_mg_dl:110,hdl_mg_dl:55,tav_measured_value:8,tav_measured_unit:'nível',tav_measured_method:'Bioimpedância',tav_measured_equipment:'Omron',hba1c_pct:5.4,uric_acid_mg_dl:4.5,glucose_mg_dl:90,glucose_is_fasting:false,tav_estimated_value:999});
 check(createdAlias.status===201,'create measured aliases');const aliasId=createdAlias.data.id;
 let alias=db.prepare('SELECT * FROM personal_assessments WHERE id=?').get(aliasId);
 check(alias.tav_value===8 && alias.tav_measured_value===8,'both aliases persisted');check(alias.glucose_is_fasting===0,'explicit nonfasting flag preserved');check(alias.hba1c_pct===5.4 && alias.uric_acid_mg_dl===4.5,'optional biochemical columns');check(alias.age_at_assessment===26 && alias.tav_estimated_value===20.82,'client cannot spoof Bonora prediction');
 const metadata=JSON.parse(alias.calculation_metadata_json);check(metadata.visceralAdiposity.predictedTav.value===20.82 && metadata.visceralAdiposity.measuredTav.value===8 && metadata.visceralAdiposity.vai.value>0,'three separate metadata results');
 await call('updateAssessment',{tav_measured_value:10,tav_estimated_value:888},{id:aliasId});alias=db.prepare('SELECT * FROM personal_assessments WHERE id=?').get(aliasId);check(alias.tav_value===10 && alias.tav_measured_value===10 && alias.tav_estimated_value===20.82,'alias update cannot spoof estimate');
 // Synthetic historical prediction in the isolated DB only, to verify preservation.
 const savedMeta=JSON.parse(alias.calculation_metadata_json);const fixturePrediction={value:42,unit:'fixture-unit',protocol:'fixture-protocol',equation:'fixture-only',reference:'fixture-only',classification:'Valor histórico de teste'};savedMeta.visceralAdiposity.predictedTav=fixturePrediction;savedMeta.classifications.predictedTav=fixturePrediction;
 db.prepare('UPDATE personal_assessments SET tav_estimated_value=42,tav_estimated_unit=?,tav_estimation_protocol=?,tav_estimation_reference=?,tav_estimation_classification=?,calculation_metadata_json=? WHERE id=?').run('fixture-unit','fixture-protocol','fixture-only','Valor histórico de teste',JSON.stringify(savedMeta),aliasId);
 await call('updateAssessment',{tav_measured_value:12},{id:aliasId});alias=db.prepare('SELECT * FROM personal_assessments WHERE id=?').get(aliasId);check(alias.tav_value===12 && alias.tav_estimated_value===42 && alias.tav_estimated_unit==='fixture-unit','manual edit preserves existing prediction');check(JSON.parse(alias.calculation_metadata_json).visceralAdiposity.predictedTav.value===42,'manual edit preserves prediction metadata');
 const snapshot=JSON.stringify(alias);const projected=await call('assessmentReportData',{}, {id:aliasId});check(projected.data.assessment.tav_estimated_value===42 && projected.data.assessment.tav_measured_value===12,'report separates existing prediction and measured value');check(JSON.stringify(db.prepare('SELECT * FROM personal_assessments WHERE id=?').get(aliasId))===snapshot,'report reads never rewrite stored values');
 const beforeClearComparison=await call('compareAssessments',{}, {id:aliasId,compareId:ids[0]});check(beforeClearComparison.data.metrics.find(m=>m.field==='tav_value').diff===null && beforeClearComparison.data.tav_comparison.comparable===false,'different measured methods cannot generate deltas');
 const other=await call('createAssessment',{patient_id,assessment_date:'2026-03-13',tav_measured_value:14,tav_measured_unit:'nível',tav_measured_method:'Bioimpedância',tav_measured_equipment:'Omron'});const compatible=await call('compareAssessments',{}, {id:other.data.id,compareId:aliasId});check(compatible.data.metrics.find(m=>m.field==='tav_value').diff===2,'matching measured method and units compare');
 await call('updateAssessment',{tav_measured_unit:'kg'},{id:other.data.id});const incompatible=await call('compareAssessments',{}, {id:other.data.id,compareId:aliasId});check(incompatible.data.metrics.find(m=>m.field==='tav_value').diff===null && incompatible.data.tav_comparison.comparable===false,'different measured units cannot generate deltas');
 await call('updateAssessment',{tav_measured_value:null},{id:aliasId});alias=db.prepare('SELECT * FROM personal_assessments WHERE id=?').get(aliasId);check(alias.tav_value===null && alias.tav_measured_value===null && alias.tav_estimated_value===42,'clear manual value leaves prediction intact');
 const comparison=await call('compareAssessments',{}, {id:aliasId,compareId:ids[0]});check(comparison.status===200,'comparison endpoint');check(comparison.data.metrics.find(m=>m.field==='tav_estimated_value').diff===null,'incompatible prediction protocols cannot create comparison');
 const previewBefore=db.prepare('SELECT * FROM personal_assessments ORDER BY id').all();const simple=await call('previewAssessment',{patient_id,assessment_date:'2026-03-12',waist_cm:90});check(simple.data.values.tav_estimated_value===61.22,'female live preview needs only existing waist and patient demographics');const changed=await call('previewAssessment',{patient_id,assessment_date:'2026-03-12',waist_cm:100});check(changed.data.values.tav_estimated_value===101.62,'live preview changes with waist');assert.deepEqual(db.prepare('SELECT * FROM personal_assessments ORDER BY id').all(),previewBefore);check(true,'preview never writes saved assessments');
 db.prepare('UPDATE personal_assessments SET calculation_version=?,tav_estimated_value=NULL,tav_estimated_unit=NULL,tav_estimation_protocol=?,calculation_metadata_json=NULL WHERE id=?').run('personal-calc-2026.3','cavalcanti-rbone-14-91-pending-v1',other.data.id);
 const oldBefore=JSON.stringify(db.prepare('SELECT * FROM personal_assessments WHERE id=?').get(other.data.id));const oldReport=await call('assessmentReportData',{}, {id:other.data.id});check(oldReport.data.assessment.tav_estimated_value===null,'old absent prediction not calculated by report');check(JSON.stringify(db.prepare('SELECT * FROM personal_assessments WHERE id=?').get(other.data.id))===oldBefore,'old report remains read only');
 await call('updateAssessment',{waist_cm:100},{id:other.data.id});const oldAfter=db.prepare('SELECT * FROM personal_assessments WHERE id=?').get(other.data.id);check(oldAfter.tav_estimated_value===null && oldAfter.tav_estimation_protocol==='cavalcanti-rbone-14-91-pending-v1','explicit historical measure edit cannot switch prediction protocol');
 console.log(JSON.stringify({checks,database:'isolated fixture only'}));process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
