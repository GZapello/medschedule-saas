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
 await call('updateAssessment',{weight:82,waist_cm:88}, {id:ids[0]});const updated=(await call('assessmentReportData',{}, {id:ids[0]})).data.assessment;check(Math.abs(updated.bmi-82/1.8**2)<.001,'explicit modern edit recalculates derived metrics');
 check(updated.anthropometric_sex_at_assessment==='female','explicit edit retains historical sex');
 console.log(JSON.stringify({checks,database:'isolated fixture only'}));process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
