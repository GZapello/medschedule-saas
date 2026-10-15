// Disposable database and actual API routes. No real patients, signatures or external services.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.DATABASE_PATH=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'zemda-documents-')),'test.sqlite');
process.env.JWT_SECRET='document-tests-only-secret-123456789012345';
process.env.RESEND_API_KEY='';process.env.GEMINI_API_KEY='';
const {db,initializeDatabase}=require('./dist/config/database');initializeDatabase();initializeDatabase();
const {generateToken}=require('./dist/utils/jwt');
const express=require('express'),app=express();app.use(express.json());app.use('/api',require('./dist/routes').default);
for(const id of ['A','B']) {
 db.prepare("INSERT INTO tenants(id,slug,name,email,status,manager_profession,logo_url) VALUES(?,?,?,'clinic@example.test','active','Fonoaudiologia',?)").run(id,'qa-'+id,'Clínica '+id,'/brand/'+id+'.png');
 db.prepare("INSERT INTO patients(id,tenant_id,full_name,phone,birth_date) VALUES(?,?,?,'11999999999','1990-01-15')").run('patient-'+id,id,'Paciente '+id);
 db.prepare("INSERT INTO services(id,tenant_id,name,duration_minutes,price) VALUES(?,?,'Consulta',50,0)").run('service-'+id,id);
}
for(const [id,tenant,role] of [['owner','A','clinic_admin'],['reception','A','receptionist'],['other','B','professional'],['patient-user','A','patient'],['root','A','superadmin']]) {
 db.prepare("INSERT INTO users(id,tenant_id,name,email,password_hash,role,status,email_verified) VALUES(?,?,?,?,?,?, 'active',1)").run(id,tenant,id,id+'@example.test','x',role);
 db.prepare("INSERT INTO clinic_users(id,tenant_id,user_id,role,status,is_manager) VALUES(?,?,?,?,'active',?)").run('cu-'+id,tenant,id,role,role==='clinic_admin'?1:0);
}
for(const [id,tenant,user] of [['prof-A','A','owner'],['prof-B','B','owner'],['other-B','B','other']])
 db.prepare("INSERT INTO professionals(id,tenant_id,user_id,name,registration_type,registration_number,active) VALUES(?,?,?,?,'CRFa','12345',1)").run(id,tenant,user,'Profissional '+tenant);
db.prepare("INSERT INTO clinic_users(id,tenant_id,user_id,role,status,is_manager) VALUES('cu-owner-B','B','owner','clinic_admin','active',1)").run();
for(const [id,time] of [['timed','2026-10-14T09:00:00'],['imported','2026-10-14 09:00:00'],['space','2026-10-14 15:40:00'],['finish','2026-10-14 16:20:00']])
 db.prepare("INSERT INTO appointments(id,tenant_id,appointment_number,patient_id,professional_id,service_id,start_time,end_time,status,modality) VALUES(?,'A',?,'patient-A','prof-A','service-A',?,?,'in_progress','presential')").run(id,id,time,time);
for(const [id,appt,time] of [['record-timed','timed','14:25'],['record-imported','imported',null]])
 db.prepare("INSERT INTO records(id,tenant_id,patient_id,professional_id,appointment_id,session_date,session_time,module_type,title,clinical_evolution) VALUES(?,'A','patient-A','prof-A',?,'2026-10-13',?,'general','Registro QA','Evolução QA')").run(id,appt,time);
const token=(user='owner',role='clinic_admin')=>generateToken({userId:user,tenantId:'A',role,name:user,email:user+'@example.test'});
let server,checks=0;const check=(a,b,msg)=>{assert.deepEqual(a,b,msg);checks++;};
(async()=>{
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api/v1`;
 const call=async(url,body,auth=token(),tenant='A')=>{
  const r=await fetch(base+url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json','X-Tenant-ID':tenant},body:body?JSON.stringify(body):undefined});
  return {status:r.status,data:await r.json()};
 };
 const appointment=await call('/appointments/timed');check(appointment.status,200);check(appointment.data.appointment.attendance_date,'2026-10-13');check(appointment.data.appointment.attendance_time,'14:25');check(appointment.data.appointment.registration_type,'CRFa');
 check((await call('/appointments/imported')).data.appointment.attendance_time,null);
 const types=[['certificates',{certificateType:'attendance',daysOff:5}],['prescriptions',{prescriptionType:'simple',content:'Conteúdo de teste'}],['exam-requests',{examsList:'Exame de teste'}]];
 for(const [type,fields] of types) {
  const issued=await call('/clinical/'+type,{patientId:'patient-A',appointmentId:'timed',...fields});check(issued.status,201,JSON.stringify(issued));
  const got=await call('/clinical/'+type+'/'+issued.data.id);check(got.status,200);
  const doc=got.data.document;check(doc.professional_id,'prof-A');check(doc.patient_name,'Paciente A');check(doc.clinic_name,'Clínica A');check(doc.logo_url,'/brand/A.png');
  check(doc.attendance_date,'2026-10-13');check(doc.attendance_time,'14:25');check(doc.source_record_id,'record-timed');
  if(type==='certificates')check(doc.days_off,0);
  db.prepare("UPDATE records SET session_time='18:55' WHERE id='record-timed'").run();
  check((await call('/clinical/'+type+'/'+issued.data.id)).data.document.attendance_time,'14:25');
  db.prepare("UPDATE records SET session_time='14:25' WHERE id='record-timed'").run();
  const imported=await call('/clinical/'+type,{patientId:'patient-A',appointmentId:'imported',...fields});check(imported.status,201,JSON.stringify(imported));
  check((await call('/clinical/'+type+'/'+imported.data.id)).data.document.attendance_time,null);
  const outside=await call('/clinical/'+type,{patientId:'patient-A',...fields});check(outside.status,201);
  check((await call('/clinical/'+type+'/'+outside.data.id)).data.document.attendance_date,null);
  const fromRecord=await call('/clinical/'+type,{patientId:'patient-A',recordId:'record-timed',...fields});check(fromRecord.status,201);
  check((await call('/clinical/'+type+'/'+fromRecord.data.id)).data.document.attendance_time,'14:25');
  const space=await call('/clinical/'+type,{patientId:'patient-A',appointmentId:'space',...fields});check(space.status,201);
  check((await call('/clinical/'+type+'/'+space.data.id)).data.document.attendance_time,'15:40');
  check((await call('/clinical/'+type,{patientId:'patient-B',...fields})).status,404);
  check((await call('/clinical/'+type,{patientId:'patient-A',professionalId:'prof-B',...fields})).status,400);
  check((await call('/clinical/'+type,{patientId:'patient-A',appointmentId:'timed',recordId:'record-imported',...fields})).status,400);
  check((await call('/clinical/'+type,{patientId:'patient-A',...fields},token('reception','receptionist'))).status,403);
  check((await call('/clinical/'+type+'/'+issued.data.id,null,token('reception','receptionist'))).status,200);
  check((await call('/clinical/'+type+'/'+issued.data.id,null,token(),'B')).status,404);
  check((await call('/clinical/'+type+'/'+issued.data.id,null,token('patient-user','patient'))).status,403);
  check((await call('/clinical/'+type+'/'+issued.data.id,null,token('root','superadmin'))).status,403);
 }
 // Same user in two clinics must resolve the professional from the active membership/clinic.
 const b=await call('/clinical/certificates',{patientId:'patient-B',certificateType:'rest',daysOff:2},token(),'B');check(b.status,201,JSON.stringify(b));
 check((await call('/clinical/certificates/'+b.data.id,null,token(),'B')).data.document.professional_id,'prof-B');
 const finish=await call('/appointments/finish/finish',{certificate:{certificateType:'attendance'},prescription:{content:'Texto QA'},examRequest:{examsList:'Exame QA'},saveOnly:true});
 check(finish.status,200,JSON.stringify(finish));
 for(const [field,table] of [['certificateId','clinical_certificates'],['prescriptionId','clinical_prescriptions'],['examRequestId','clinical_exam_requests']]) {
  const doc=db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(finish.data.generatedDocs[field]);check(doc.attendance_time,'16:20');check(doc.attendance_date,'2026-10-14');
 }
 for(const [id,expected] of [['timed','14:25'],['imported',null]]) {
  const saved=await call('/appointments/'+id+'/finish',{evolution:{clinicalEvolution:'Evolução complementar QA'},certificate:{certificateType:'attendance'},saveOnly:true});check(saved.status,200,JSON.stringify(saved));
  const snapshot=db.prepare('SELECT attendance_date,attendance_time FROM clinical_certificates WHERE id=?').get(saved.data.generatedDocs.certificateId);check(snapshot.attendance_date,'2026-10-13');check(snapshot.attendance_time,expected);
 }
 check((await call('/referrals',{patientId:'patient-A',toProfessionalId:'prof-B',reason:'QA'})).status,400);
 check((await call('/referrals',{patientId:'patient-B',toProfessionalId:'prof-A',reason:'QA'})).status,404);
 check((await call('/referrals',{patientId:'patient-A',toProfessionalId:'prof-A',reason:'QA',originAppointmentId:'timed'})).status,201);
 db.prepare("UPDATE professionals SET zemda_psico_enabled=1 WHERE id='prof-A'").run();
 const psychology=await call('/psychology/documents',{patientId:'patient-A',appointmentId:'timed',documentType:'declaracao',purpose:'Comprovação',requesterName:'Paciente',renderedText:'Comparecimento. <b>Texto literal</b>'});
 check(psychology.status,200,JSON.stringify(psychology));
 const psychoPrint=await fetch(base+'/psychology/documents/'+psychology.data.documentId+'/print',{headers:{Authorization:'Bearer '+token(),'X-Tenant-ID':'A'}});
 check(psychoPrint.status,200);const html=await psychoPrint.text();
 check(html.includes('14:25'),true);check(html.includes('13/10/2026'),true);check(html.includes('&lt;b&gt;Texto literal&lt;/b&gt;'),true);
 check(html.includes('/brand/A.png'),true);check(html.includes('/verificar-documento?hash='),false);
 const psychologyBad=await call('/psychology/documents',{patientId:'patient-A',appointmentId:'not-an-appointment',documentType:'declaracao',purpose:'Comprovação',requesterName:'Paciente',renderedText:'Comparecimento.'});
 check(psychologyBad.status,400);
 const pending=await call('/pending-exams',{patientId:'patient-A',professionalId:'prof-A',examName:'Exame QA',requestDate:'2026-10-13'});
 check(pending.status,201,JSON.stringify(pending));
 const pendingDocument=await call('/pending-exams/'+pending.data.id+'/document');check(pendingDocument.status,200);
 check(pendingDocument.data.document.patient_name,'Paciente A');check(pendingDocument.data.document.attendance_time,undefined);
 check((await call('/pending-exams',{patientId:'patient-A',professionalId:'prof-B',examName:'Exame QA'})).status,400);
 check(db.prepare('PRAGMA foreign_key_check').all(),[]);
 console.log(`PASS: ${checks} document API assertions (time snapshots, imported/missing time, date, professional, tenant, roles, standalone issuance and consultation completion).`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server?.close());
