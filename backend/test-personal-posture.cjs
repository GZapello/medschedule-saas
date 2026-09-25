const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.DATABASE_PATH=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'posture-')),'test.db');process.env.R2_MOCK_STORAGE='true';
const {db,initializeDatabase}=require('./dist/config/database');initializeDatabase();
const {PersonalController:p}=require('./dist/controllers/personal.controller');
const {PersonalPostureAIController:ai}=require('./dist/controllers/personal-posture-ai.controller');
const {validatePosture,postureSummary}=require('./dist/services/personal-posture.service');
let checks=0;function check(value,label){assert.ok(value,label);checks++;console.log('PASS',label);}
async function call(method,body={},params={},query={},tenant='posture-test',controller=p){let status=200,data;const req={body,params,query,tenantId:tenant,user:{userId:'posture-user',role:'clinic_admin'},headers:{},ip:'127.0.0.1',get:()=>undefined};const res={status(n){status=n;return this},json(d){data=d;return this}};await controller[method](req,res);return {status,data};}
const posture={version:1,views:{front:{fileId:'',guides:true,strokes:[{tool:'pen',points:[[.1,.2],[.3,.4]]}]}},observations:[{id:'note-1',view:'front',region:'shoulders',text:'Assimetria visual a revisar',source:'manual',reviewed:true,evolution:'stable'}]};
(async()=>{
 db.prepare("INSERT INTO tenants(id,name,slug,email,status) VALUES('posture-test','Teste','posture-test','posture@test.local','active')").run();
 db.prepare("INSERT INTO users(id,tenant_id,email,password_hash,role,status,name) VALUES('posture-user','posture-test','posture@test.local','test','clinic_admin','active','Teste')").run();
 const student=await call('createStudent',{name:'Aluno postural',phone:'11999991111'});const patient=student.data.id;
 check(Boolean(patient),'Patient fixture created');
 const make=async(date,posture)=>call('createAssessment',{patient_id:patient,assessment_date:date,posture});
 const legacy=await make('2024-01-01',undefined),baseline=await make('2025-01-01',posture),current=await make('2026-01-01',{...posture,observations:[...posture.observations,{...posture.observations[0],id:'ai-1',source:'ai',reviewed:false,evolution:'improved'}]});
 check(baseline.status===201&&current.status===201,'Create assessments with posture');
 const loaded=await call('getAssessment',{}, {id:baseline.data.id});assert.deepEqual(JSON.parse(loaded.data.assessment.posture_json),posture);check(true,'Vectors and region notes round-trip');
 const comparison=await call('compareAssessments',{}, {id:current.data.id,compareId:legacy.data.id},{posture_baseline:'1'});
 check(comparison.data.previous_assessment.id===baseline.data.id,'First postural assessment is baseline, not first physical assessment');
 check(comparison.data.posture_history.length===2,'Complete postural history excludes legacy assessments without posture');
 check(comparison.data.posture_history[1].count===1&&comparison.data.posture_history[1].pending===1&&comparison.data.posture_history[1].evolution.improved===0,'Unreviewed AI excluded from evolution');
 const same=await call('compareAssessments',{}, {id:baseline.data.id,compareId:baseline.data.id},{posture_baseline:'1'});check(same.status===200,'Initial assessment can be compared with itself');
 await call('updateAssessment',{notes:'New general note'}, {id:baseline.data.id});
 check((await call('getAssessment',{}, {id:baseline.data.id})).data.assessment.posture_json===loaded.data.assessment.posture_json,'Legacy edit without posture preserves data');
 const invalid=await call('updateAssessment',{notes:'Should not save',posture:{...posture,version:9}}, {id:baseline.data.id});check(invalid.status===400,'Invalid schema rejected before mutation');
 check((await call('getAssessment',{}, {id:baseline.data.id})).data.assessment.notes==='New general note','Rejected update is non-destructive');
 for(const bad of [{...posture,observations:[{...posture.observations[0],region:'invalid'}]},{...posture,views:{front:{fileId:'',guides:true,strokes:[{tool:'pen',points:[[5,0],[0,0]]}]}}},{...posture,observations:Array(181).fill(posture.observations[0])}]){assert.throws(()=>validatePosture(bad));checks++;}
 check((await call('getAssessment',{}, {id:baseline.data.id},{},'foreign')).status===404,'Foreign tenant cannot read posture');
 check((await call('updateAssessment',{posture}, {id:baseline.data.id},{},'foreign')).status===404,'Foreign tenant cannot edit posture');
 const other=await call('createStudent',{name:'Outro',phone:'11999992222'});const otherAssessment=await call('createAssessment',{patient_id:other.data.id,assessment_date:'2026-01-02'});
 check((await call('compareAssessments',{}, {id:current.data.id,compareId:otherAssessment.data.id})).status===400,'Cross-patient comparison rejected');
 const list=await call('listAssessments',{}, {studentId:patient});const row=list.data.assessments.find(a=>a.id===baseline.data.id);check(row.has_posture&&!('posture_json' in row),'List stays lightweight without vectors');
 const before=db.prepare('SELECT posture_json FROM personal_assessments WHERE id=?').get(baseline.data.id);initializeDatabase();assert.deepEqual(db.prepare('SELECT posture_json FROM personal_assessments WHERE id=?').get(baseline.data.id),before);check(true,'Idempotent migration preserves posture');
 check((await call('status',{}, {},{},'posture-test',ai)).data.available===false,'AI unavailable without configured real storage/model');
 check((await call('analyze',{patient_id:patient,photos:[]},{},{},'posture-test',ai)).status===503,'Unconfigured AI never fabricates suggestions');


 db.prepare('UPDATE personal_assessments SET weight=77,body_fat_percentage=19 WHERE id=?').run(baseline.data.id);
 await call('updateAssessment',{posture,assessment_date:'2025-02-01'},{id:baseline.data.id});
 const kept=db.prepare('SELECT weight,body_fat_percentage,assessment_date FROM personal_assessments WHERE id=?').get(baseline.data.id);check(kept.weight===77&&kept.body_fat_percentage===19&&kept.assessment_date==='2025-02-01','Postural edit preserves physical metrics and persists date');
 const badPhoto=await call('updateAssessment',{posture:{...posture,views:{front:{...posture.views.front,fileId:'foreign-image'}}}},{id:baseline.data.id});check(badPhoto.status===400,'Postural image references require patient ownership');
 const {r2StorageService:storage}=require('./dist/services/r2-storage.service');
 Object.defineProperty(storage,'isConfiguredClient',{value:true});process.env.R2_MOCK_STORAGE='false';process.env.GEMINI_API_KEY='test-only';process.env.PERSONAL_POSTURE_AI_MODEL='test-model';
 check((await call('analyze',{patient_id:patient,photos:[{view:'front',file_id:'missing'}]},{},{},'posture-test',ai)).status===400,'AI rejects missing or foreign attachment before fetching');
 check((await call('analyze',{patient_id:patient,photos:[null]},{},{},'posture-test',ai)).status===400,'Malformed AI photo body rejected without exception');
 check((await call('analyze',{patient_id:patient,photos:Array(5).fill({view:'front',file_id:'photo'})},{},{},'posture-test',ai)).status===400,'AI caps image count');
 db.prepare("INSERT INTO file_attachments(id,clinic_id,patient_id,uploaded_by,storage_provider,object_key,original_filename,mime_type,file_size,category) VALUES('posture-photo','posture-test',?,'posture-user','cloudflare_r2','private/test.webp','photo.webp','image/webp',100,'personal_assessment_front')").run(patient);

 const linked={...posture,views:{front:{...posture.views.front,fileId:'posture-photo'}}};
 const linkedSave=await call('updateAssessment',{posture:linked,photos:[{photo_type:'front',file_id:'posture-photo'}]},{id:current.data.id});
 const linkedRead=await call('getAssessment',{}, {id:current.data.id});
 check(linkedSave.status===200&&linkedRead.data.photos[0].file_id==='posture-photo'&&JSON.parse(linkedRead.data.assessment.posture_json).views.front.fileId==='posture-photo','Photo table and postural vectors share the same durable attachment after reload');
 const realFetch=global.fetch, originalUrl=storage.createDownloadUrl;
 storage.createDownloadUrl=async()=> 'https://storage.invalid/test';
 const photo=fs.readFileSync(path.join(__dirname,'../frontend/public/exercise-photos/ex-prancha-isometrica-123b6d7c2f36.webp'));
 global.fetch=async()=>new Response(photo,{status:200});
 const {GoogleGenerativeAI}=require('@google/generative-ai');const originalModel=GoogleGenerativeAI.prototype.getGenerativeModel;
 let modelCalls=0;GoogleGenerativeAI.prototype.getGenerativeModel=function(){return {generateContent:async request=>{modelCalls++;check(request.contents[0].parts.filter(p=>p.inlineData).length===1,'AI receives only selected photo');return {response:{text:()=>JSON.stringify({suggestions:[{view:'front',region:'shoulders',text:'Possível assimetria visual.'},{view:'back',region:'head',text:'Discard unselected view'}]})}}}}};
 try{
  const analyzed=await call('analyze',{patient_id:patient,photos:[{view:'front',file_id:'posture-photo'}]},{},{},'posture-test',ai);
  check(analyzed.status===200&&analyzed.data.suggestions.length===1,'Validated AI response filtered to supplied views');
  check(analyzed.data.suggestions[0].reviewed===false&&analyzed.data.suggestions[0].evolution==='unrated','AI can never auto-confirm review or evolution');
  check((await call('analyze',{patient_id:patient,photos:[{view:'front',file_id:'posture-photo'}]},{},{},'posture-test',ai)).status===429&&modelCalls===1,'Repeated AI request throttled without another model call');
 }finally{global.fetch=realFetch;storage.createDownloadUrl=originalUrl;GoogleGenerativeAI.prototype.getGenerativeModel=originalModel;}
 console.log(JSON.stringify({checks,ai:'No external AI requests made'}));
})().catch(e=>{console.error(e);process.exitCode=1});
