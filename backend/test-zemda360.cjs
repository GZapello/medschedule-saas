const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.DATABASE_PATH=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'zemda360-')),'test.db');
process.env.ZEMDA_FILES_SIGNING_SECRET='zemda360-local-test-secret';
const {db,initializeDatabase}=require('./dist/config/database');initializeDatabase();
const {BodyAssessmentController:C}=require('./dist/controllers/body-assessment.controller');
const {parseAnatomicalDocument,validateAnatomicalDocument}=require('./dist/services/anatomical-document');
for(const id of ['a','b']){
  db.prepare("INSERT INTO tenants (id,name,slug,email,status) VALUES (?,?,?,?,'active')").run(id,`Clinic ${id}`,`clinic-${id}`,`${id}@example.test`);
  db.prepare("INSERT INTO users (id,tenant_id,name,email,password_hash,role,status) VALUES (?,?,?,?,?,'professional','active')").run(`user-${id}`,id,`User ${id}`,`user-${id}@example.test`,'test');
  db.prepare("INSERT INTO clinic_users (id,tenant_id,user_id,role,status) VALUES (?,?,?,'professional','active')").run(`cu-${id}`,id,`user-${id}`);
  db.prepare("INSERT INTO professionals (id,tenant_id,user_id,name,active) VALUES (?,?,?,?,1)").run(`prof-${id}`,id,`user-${id}`,`Professional ${id}`);
  db.prepare("INSERT INTO patients (id,tenant_id,full_name,phone) VALUES (?,?,?,'11999999999')").run(`patient-${id}`,id,`Paciente ${id.toUpperCase()}`);
}
const user={userId:'user-a',role:'professional'};
function call(method,body={},params={},actor=user,tenantId='a'){
  let status=200,result;
  C[method]({body,params,user:actor,tenantId,headers:{},ip:'127.0.0.1',method:'TEST',originalUrl:'/body-assessments'}, {status(s){status=s;return this;},json(v){result=v;return this;}});
  return {status,data:result};
}
const layer=(mapType,sexVariant,view)=>({mapType,sexVariant,view,selectedRegions:[],selectionViews:{},drawings:[],clinicalNotes:'',marks:[]});
const body=layer('BODY','female','all');body.selectedRegions=['joelho_direito'];
body.drawings=[{strokeId:'legacy-stroke',toolType:'pen',color:'#dc2626',strokeWidth:4,opacity:1,points:[{x:.12,y:.5},{x:.14,y:.52}]}];
const oldNotes=JSON.stringify({selectedRegions:body.selectedRegions,drawings:body.drawings,clinicalNotes:'Registro antigo preservado'});
const legacy=call('upsertAssessment',{patientId:'patient-a',notes:oldNotes});assert.equal(legacy.status,200);
const legacyId=legacy.data.assessmentId;
const face=layer('FACE','male','3q_right');face.selectedRegions=['face_malar_right','joint_tmj_right'];face.clinicalNotes='Face independente';
face.marks=[{id:'mark1',regionId:'joint_tmj_right',view:'3q_right',note:'Observação de teste',type:'observation',createdAt:'forged',createdBy:'someone-else'}];
face.drawings=[{...body.drawings[0],strokeId:'face-stroke',points:[{x:.65,y:.4},{x:.7,y:.42}]}];
const document={schemaVersion:2,mapType:'FACE',activeLayerKey:'FACE:male:3q_right',layers:{'BODY:female:all':body,'FACE:male:3q_right':face},selectedRegions:body.selectedRegions,drawings:body.drawings,clinicalNotes:'Registro antigo preservado'};
assert.equal(validateAnatomicalDocument(document),null);
const saved=call('upsertAssessment',{id:legacyId,patientId:'patient-a',notes:JSON.stringify(document)});assert.equal(saved.status,200);
const fetched=call('getById',{}, {id:legacyId});assert.equal(fetched.status,200);
const decoded=parseAnatomicalDocument(fetched.data.assessment.notes);
assert.deepEqual(decoded.layers['BODY:female:all'].drawings,body.drawings);
assert.deepEqual(decoded.layers['FACE:male:3q_right'].drawings,face.drawings);
assert.equal(decoded.layers['FACE:male:3q_right'].marks[0].createdBy,'user-a');
assert.match(decoded.layers['FACE:male:3q_right'].marks[0].createdAt,/^20\d\d-/);
assert.equal(fetched.data.assessment.patient_id,'patient-a');assert.equal(fetched.data.assessment.professional_id,'prof-a');
assert(fetched.data.markers.every(m=>!m.body_region.startsWith('face_')&&!m.body_region.startsWith('joint_tmj')));
assert.equal(call('listByPatient',{}, {patientId:'patient-a'}).data.length,1);
assert.equal(call('upsertAssessment',{id:legacyId,patientId:'patient-a',notes:oldNotes}).status,409,'Old client cannot erase newer layers');
const invalid=structuredClone(document);invalid.layers['FACE:male:3q_right'].drawings[0].points[0].x=2;
assert.equal(call('upsertAssessment',{id:legacyId,patientId:'patient-a',notes:JSON.stringify(invalid)}).status,400);
for(const role of ['superadmin','receptionist'])assert.equal(call('getById',{}, {id:legacyId},{userId:'unlinked',role}).status,403);
assert.equal(call('getById',{}, {id:legacyId},{userId:'user-b',role:'professional'},'b').status,404);
assert.equal(call('upsertAssessment',{id:legacyId,patientId:'patient-b',notes:JSON.stringify(document)}, {},{userId:'user-b',role:'professional'},'b').status,404);
assert.equal(call('upsertAssessment',{patientId:'patient-b',notes:JSON.stringify(document)}).status,404);
db.prepare("UPDATE clinic_users SET status='inactive' WHERE id='cu-a'").run();
assert.equal(call('getById',{}, {id:legacyId}).status,403);
db.prepare("UPDATE clinic_users SET status='active' WHERE id='cu-a'").run();
assert.equal(call('getById',{}, {id:legacyId},{userId:'user-a',role:'clinic_admin'}).status,200);
// Deleting a selection/mark stays deleted after save/reopen; no marker fallback resurrection.
const cleared=structuredClone(decoded);cleared.layers['BODY:female:all'].selectedRegions=[];cleared.selectedRegions=[];cleared.layers['FACE:male:3q_right'].marks=[];
assert.equal(call('upsertAssessment',{id:legacyId,patientId:'patient-a',notes:JSON.stringify(cleared)}).status,200);
assert.equal(call('getById',{}, {id:legacyId}).data.markers.length,0);
const untouched=call('upsertAssessment',{patientId:'patient-a',notes:'Texto antigo simples'}).data.assessmentId;
assert.equal(call('getById',{}, {id:untouched}).data.assessment.notes,'Texto antigo simples');
console.log('PASS Zemda360: legacy/v2 persistence, independent layers/strokes, authoritative author, historical notes, invalid geometry, role/tenant/patient isolation, deletion and old-client protection');
if(process.argv.includes('--serve')){
  const express=require('express'),app=express();app.use(express.json({limit:'10mb'}));
  app.use((req,res,next)=>{req.user=user;req.tenantId='a';next();});
  app.get('/v1/body-assessments/patient/:patientId',C.listByPatient);
  app.get('/v1/body-assessments/:id',C.getById);
  app.post('/v1/body-assessments',C.upsertAssessment);
  app.listen(3126,'127.0.0.1',()=>console.log(`READY 3126 ${untouched}`));
}else db.close?.();
