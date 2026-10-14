const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.DATABASE_PATH=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'shared-clinical-')),'test.db');
process.env.R2_MOCK_STORAGE='true';
const {db,initializeDatabase}=require('./dist/config/database');initializeDatabase();
const {PersonalController:p}=require('./dist/controllers/personal.controller');
const {CapabilityService}=require('./dist/services/capability.service');
const {migratePersonalAssessment}=require('./dist/config/personal-assessment.migration');
const {DatabaseSync}=require('node:sqlite');
let checks=0;function check(value,label){assert.ok(value,label);checks++;console.log('PASS',label);}
async function call(user,method,body={},params={},tenant='shared-test'){
 let status=200,data;
 const req={method:['createAssessment','previewAssessment'].includes(method)?'POST':method==='updateAssessment'?'PUT':method==='deleteAssessment'?'DELETE':'GET',body,params,query:{},tenantId:tenant,user:{userId:user,role:user==='reception'?'receptionist':'professional'},headers:{},ip:'127.0.0.1',get:()=>undefined};
 const res={status(n){status=n;return this;},json(v){data=v;return this;}};
 await p[method](req,res);return {status,data};
}
(async()=>{
 for(const tenant of ['shared-test','other-clinic'])db.prepare("INSERT INTO tenants(id,name,slug,email,status) VALUES(?,?,?,?, 'active')").run(tenant,tenant,tenant,tenant+'@test.local');
 for(const [user,profession] of [['personal','prof-personal-trainer'],['nutri','prof-nutricionista'],['fisio','prof-fisioterapeuta'],['estetic','prof-esteticista'],['pilates','prof-instrutor-pilates']]){
  db.prepare("INSERT INTO users(id,tenant_id,email,password_hash,role,status,name,profession_id,profession_name) VALUES(?,'shared-test',?,'test','professional','active',?,?,?)").run(user,user+'@test.local',user,profession,profession);
  db.prepare("INSERT INTO clinic_users(id,user_id,tenant_id,role,status,profession_id,profession_name) VALUES(?,?,'shared-test','professional','active',?,?)").run('cu-'+user,user,profession,profession);
  db.prepare("INSERT INTO professionals(id,user_id,tenant_id,name,profession_id,profession_name,active,slug) VALUES(?,?,'shared-test',?,?,?,1,?)").run('pro-'+user,user,user,profession,profession,user);
 }
 db.prepare("INSERT INTO patients(id,tenant_id,full_name,phone,birth_date,gender,anthropometric_sex) VALUES('patient','shared-test','Paciente','11999990000','1990-01-01','female','female')").run();
 db.prepare("INSERT INTO patients(id,tenant_id,full_name,phone) VALUES('unrelated','shared-test','Outro','11999990001')").run();
 db.prepare("INSERT INTO services(id,tenant_id,name,duration_minutes,price) VALUES('service','shared-test','Consulta',60,10000)").run();
 for(const user of ['personal','nutri','fisio','estetic','pilates'])db.prepare("INSERT INTO appointments(id,tenant_id,appointment_number,patient_id,professional_id,service_id,start_time,end_time) VALUES(?,'shared-test',?,'patient',?,'service','2026-10-06T12:00:00','2026-10-06T13:00:00')").run('appt-'+user,'appt-'+user,'pro-'+user);
 const initial=await call('personal','createAssessment',{patient_id:'patient',assessment_date:'2026-01-01',weight:80,height:170,waist_cm:90,hip_cm:100,body_fat_percentage:25,composition_method:'bioimpedancia',strength_tests:[{exercise_name:'Supino',weight_kg:20,reps:5}],notes:'Primeira avaliação'});
 check(initial.status===201,'Personal retains complete assessment engine');const id=initial.data.id;
 const second=await call('nutri','createAssessment',{patient_id:'patient',appointment_id:'appt-nutri',assessment_date:'2026-10-06',weight:75,height:170,waist_cm:85,hip_cm:100,body_fat_percentage:23,composition_method:'bioimpedancia'});
 check(second.status===201,'Nutrition saves in the existing assessment table');const next=second.data.id;
 const saved=db.prepare('SELECT * FROM personal_assessments WHERE id=?').get(next);
 check(saved.appointment_id==='appt-nutri' && saved.profession_id==='prof-nutricionista' && saved.source_module==='ZemdaNutri','Authenticated clinical context persisted');
 const history=await call('nutri','listAssessments',{}, {studentId:'patient'});
 check(history.data.assessments.length===2 && history.data.assessments.every(a=>!('strength_tests_json' in a)&&!('posture_json' in a)),'One patient history with field capability projection');
 const denied=await call('nutri','updateAssessment',{strength_tests:[{exercise_name:'Forbidden'}]}, {id});check(denied.status===403,'Nutrition cannot write strength through legacy endpoints');
 check([403,404].includes((await call('nutri','getAssessment',{}, {id},'other-clinic')).status),'Cross-clinic access denied');
 check((await call('nutri','createAssessment',{patient_id:'unrelated',weight:70})).status===403,'Patient without care relationship denied');
 check((await call('reception','getAssessment',{}, {id})).status===403,'Reception cannot access clinical assessment endpoints');
 check((await call('nutri','createAssessment',{patient_id:'patient',appointment_id:'appt-fisio',weight:70})).status===400,'Appointment cannot impersonate another professional');
 const comparison=await call('nutri','compareAssessments',{}, {id:next,compareId:id});
 check(comparison.status===200 && comparison.data.metrics.find(m=>m.field==='weight').pct_variation===-6.25,'Existing comparison and percentage calculation reused');
 check(!comparison.data.metrics.some(m=>m.field==='vo2_max') && !('posture_history' in comparison.data),'Comparisons expose only authorized resources');
 const report=await call('nutri','assessmentReportData',{}, {id});
 check(report.status===200 && !('strength_tests_json' in report.data.original) && report.data.evolution_history.length===2,'Report original and historical snapshots are capability filtered');
 const physio=await call('fisio','createAssessment',{patient_id:'patient',appointment_id:'appt-fisio',mobility_json:JSON.stringify({notes:'Flexão limitada'}),pain_json:JSON.stringify({notes:'Dor ao movimento'})});
 check(physio.status===201 && physio.data.assessment.mobility_json,'Functional clinical data share assessment identity and date');
 const before=JSON.stringify(db.prepare('SELECT * FROM personal_assessments WHERE id=?').get(id));
 check((await call('fisio','updateAssessment',{body_fat_percentage:30},{id})).status===403,'Physio requires enabled body composition capability');
 check(JSON.stringify(db.prepare('SELECT * FROM personal_assessments WHERE id=?').get(id))===before,'Denied update preserves complete legacy assessment');
 check((await call('fisio','deleteAssessment',{}, {id})).status===403,'Limited capability cannot delete a mixed assessment');
 check((await call('nutri','createAssessment',{patient_id:'patient',photos:[{file_id:'missing',photo_type:'front'}]})).status===403,'Photo monitoring remains optional for nutrition');
 check((await call('fisio','createAssessment',{patient_id:'patient',pain_json:'[]'})).status===400,'Functional data schema rejects malformed objects');
 db.prepare("INSERT INTO file_attachments(id,clinic_id,patient_id,uploaded_by,object_key,original_filename,mime_type,file_size,category) VALUES('foreign-photo','shared-test','unrelated','fisio','fixture/foreign.webp','foreign.webp','image/webp',100,'clinical')").run();
 check((await call('fisio','createAssessment',{patient_id:'patient',photos:[{file_id:'foreign-photo',photo_type:'front'}]})).status===400,'Photo capability cannot attach another patient photo');
 db.prepare("UPDATE clinic_users SET status='inactive' WHERE user_id='fisio'").run();
 check((await call('fisio','getAssessment',{}, {id})).status===403,'Inactive clinical membership denies access');
 db.prepare("UPDATE clinic_users SET status='active' WHERE user_id='fisio'").run();
 const pilates=CapabilityService.computeUserCapabilities('pilates','shared-test');
 check(pilates.activeCapabilities.includes('POSTURE_GAIT')&&pilates.activeCapabilities.includes('FUNCTIONAL_TESTS')&&pilates.activeCapabilities.includes('PHOTO_MONITORING'),'Pilates receives shared posture, tests and photos without a new module');
 const pilatesAssessment=await call('pilates','createAssessment',{patient_id:'patient',appointment_id:'appt-pilates',functional_json:JSON.stringify({notes:'Teste funcional no atendimento de Pilates'})});
 check(pilatesAssessment.status===201 && pilatesAssessment.data.assessment.source_module==='general','Pilates uses the existing general care workspace');
 const estetic=CapabilityService.computeUserCapabilities('estetic','shared-test');
 check(estetic.activeCapabilities.includes('ANTHROPOMETRY')&&estetic.activeCapabilities.includes('PHOTO_MONITORING'),'Esthetic default body measurements and photos');
 const raw=new DatabaseSync(':memory:');raw.exec("CREATE TABLE patients(id TEXT PRIMARY KEY); CREATE TABLE personal_assessments(id TEXT PRIMARY KEY,weight REAL); INSERT INTO personal_assessments VALUES('legacy',70);");
 migratePersonalAssessment(raw);migratePersonalAssessment(raw);check(raw.prepare('SELECT id,weight FROM personal_assessments').get().weight===70,'Additive migration is idempotent and preserves old assessments');raw.close();
 console.log(JSON.stringify({checks}));
})().catch(error=>{console.error(error);process.exit(1);});
