const assert = require('node:assert/strict');
if (process.env.NODE_ENV !== 'test' || !process.env.DATABASE_PATH) throw new Error('Execute com run-tests.cjs; banco isolado obrigatório.');
const { db, initializeDatabase } = require('./dist/config/database'); initializeDatabase();
const { AppointmentController } = require('./dist/controllers/appointment.controller');
const { SlotController } = require('./dist/controllers/slot.controller');
const { NotificationService } = require('./dist/services/notification.service');
NotificationService.scheduleAppointmentReminder = () => {};
const express = require('express'); const app = express(); app.use(express.json());
app.use((req, res, next) => { req.tenantId='reliable'; req.user={userId:'reliable-user',role:'clinic_admin',name:'Teste'}; next(); });
app.get('/v1/slots/available', SlotController.getAvailableSlots);
app.post('/v1/appointments', AppointmentController.create);
app.get('/v1/appointments', AppointmentController.list);
app.post('/v1/appointments/:id/reschedule', AppointmentController.reschedule);
app.put('/v1/appointments/:id', AppointmentController.update);
app.patch('/v1/appointments/:id/status', AppointmentController.updateStatus);
db.prepare("INSERT INTO tenants(id,name,slug,email,status) VALUES('reliable','Teste','reliable','test@example.test','active')").run();
db.prepare("INSERT INTO users(id,tenant_id,name,email,password_hash,role) VALUES('reliable-user','reliable','Teste','user@example.test','test','clinic_admin')").run();
db.prepare("INSERT INTO professionals(id,user_id,tenant_id,name,active) VALUES('reliable-pro','reliable-user','reliable','Teste',1)").run();
db.prepare("INSERT INTO services(id,tenant_id,name,duration_minutes,buffer_minutes,price,min_lead_time_hours) VALUES('reliable-service','reliable','Consulta',30,0,100,0)").run();
db.prepare("INSERT INTO patients(id,tenant_id,full_name,phone) VALUES('reliable-patient','reliable','Paciente sem telefone',NULL)").run();
for(let day=0;day<7;day++) db.prepare("INSERT INTO schedules(id,tenant_id,professional_id,day_of_week,start_time,end_time,is_active) VALUES(?,'reliable','reliable-pro',?,'08:00','18:00',1)").run('reliable-'+day,day);
const date=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
const server=app.listen(0,'127.0.0.1',async()=>{
 const base=`http://127.0.0.1:${server.address().port}`;
 const call=async(method,url,body)=>{const response=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:response.status,body:await response.json()};};
 try {
  const slotsUrl=`/v1/slots/available?professionalId=reliable-pro&serviceId=reliable-service&date=${date}`;
  const available=await call('GET',slotsUrl); assert.equal(available.status,200);
  const slot=available.body.slots[0]; assert.ok(slot);
  const payload={patientId:'reliable-patient',professionalId:'reliable-pro',serviceId:'reliable-service',startTime:slot.startTime,endTime:slot.endTime,appointmentPrice:100,roomId:null,insuranceId:null,modality:'presential'};
  const result=await call('POST','/v1/appointments',payload);
  const saved=db.prepare("SELECT COUNT(*) AS n FROM appointments WHERE tenant_id='reliable'").get().n;
  console.log('Available slot -> POST:',result.status,JSON.stringify(result.body),'persisted:',saved);
  assert.equal(result.status,201,'A valid booking without patient phone must succeed, not fail after committing');
  assert.equal(saved,1);
  assert.equal((await call('POST','/v1/appointments',payload)).status,409);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM appointments WHERE tenant_id='reliable'").get().n,1);
  assert.ok(!(await call('GET',slotsUrl)).body.slots.some(s=>s.startTime===slot.startTime));
  console.log('PASS available slot, HTTP creation, persistence, repeat prevention and refreshed availability');
  const id=result.body.id;
  const listed=await call('GET',`/v1/appointments?date=${date}`); assert.equal(listed.status,200);
  assert.ok(JSON.stringify(listed.body).includes(id));
  for(const patch of [{startTime:''},{endTime:payload.startTime},{startTime:'2030-02-30T08:00:00'},{professionalId:'foreign'},{patientId:null},{roomId:'foreign'},{insuranceId:'foreign'},{modality:'invalid'}]) {
    const invalid=await call('POST','/v1/appointments',{...payload,...patch});
    assert.ok([400,403].includes(invalid.status),JSON.stringify(invalid));
  }
  assert.equal((await call('PUT',`/v1/appointments/${id}`,{startTime:`${date}T10:00:00`,endTime:`${date}T10:30:00`})).status,200);
  assert.equal((await call('POST',`/v1/appointments/${id}/reschedule`,{startTime:`${date}T11:00:00`,endTime:`${date}T11:30:00`})).status,200);
  assert.equal((await call('PATCH',`/v1/appointments/${id}/status`,{status:'cancelled',reason:'Teste'})).status,200);
  assert.ok((await call('GET',slotsUrl)).body.slots.some(s=>s.startTime===slot.startTime));
  const custom=await call('POST','/v1/appointments',{...payload,isCustomTime:true,startTime:`${date}T19:00:00`,endTime:`${date}T19:30:00`,modality:'online',meeting_url:'https://meet.google.com/abc-defg-hij'});
  assert.equal(custom.status,201,JSON.stringify(custom));
  assert.equal(db.prepare('SELECT meeting_url FROM appointments WHERE id=?').get(custom.body.id).meeting_url,'https://meet.google.com/abc-defg-hij');
  db.prepare("INSERT INTO rooms(id,tenant_id,name,active) VALUES('reliable-room','reliable','Sala',1)").run();
  db.prepare("INSERT INTO clinic_insurances(id,tenant_id,name) VALUES('reliable-insurance','reliable','Convênio')").run();
  const insured=await call('POST','/v1/appointments',{...payload,roomId:'reliable-room',insuranceId:'reliable-insurance'});
  assert.equal(insured.status,201,JSON.stringify(insured));
  assert.equal(db.prepare('SELECT insurance_id FROM appointments WHERE id=?').get(insured.body.id).insurance_id,'reliable-insurance');
  console.log('PASS list, invalid fields, edit, reschedule, cancel, custom/online, optional room and insurance');
  // Persistence failure must roll back the appointment, history and payment together.
  db.exec("CREATE TEMP TRIGGER reject_booking_payment BEFORE INSERT ON payments BEGIN SELECT RAISE(ABORT,'test storage failure'); END");
  const before=db.prepare("SELECT count(*) n FROM appointments WHERE tenant_id='reliable'").get().n;
  const failed=await call('POST','/v1/appointments',{...payload,startTime:`${date}T12:00:00`,endTime:`${date}T12:30:00`});
  assert.equal(failed.status,500); assert.equal(failed.body.code,'BOOKING_INTERNAL_ERROR');
  assert.ok(!JSON.stringify(failed.body).includes('storage failure'));
  assert.equal(db.prepare("SELECT count(*) n FROM appointments WHERE tenant_id='reliable'").get().n,before);
  db.exec('DROP TRIGGER reject_booking_payment');
  db.prepare("UPDATE patients SET phone='11999999999' WHERE id='reliable-patient'").run();
  db.exec("CREATE TEMP TRIGGER reject_booking_notification BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT,'test notification failure'); END");
  const notificationFailure=await call('POST','/v1/appointments',{...payload,startTime:`${date}T12:00:00`,endTime:`${date}T12:30:00`});
  assert.equal(notificationFailure.status,201,JSON.stringify(notificationFailure));
  db.exec('DROP TRIGGER reject_booking_notification');
  console.log('PASS atomic rollback on database failure and notification failure does not falsify booking result');
  // Same endpoint and storage for every primary clinical module.
  const modules=require('./dist/utils/clinical-module').PRIMARY_CLINICAL_MODULES;
  let dayOffset=4;
  for(const module of modules) {
    const moduleDate=new Date(Date.now()+dayOffset++*86400000).toISOString().slice(0,10);
    db.prepare("UPDATE services SET clinical_module=? WHERE id='reliable-service'").run(module);
    const booked=await call('POST','/v1/appointments',{...payload,startTime:`${moduleDate}T09:00:00`,endTime:`${moduleDate}T09:30:00`});
    assert.equal(booked.status,201,`${module}: ${JSON.stringify(booked)}`);
    assert.equal(booked.body.clinical_module,module);
  }
  // Explicit UTC offset maps to the same clinic-local slot.
  const offsetDate=new Date(Date.now()+20*86400000).toISOString().slice(0,10);
  const offsetBooking=await call('POST','/v1/appointments',{...payload,startTime:`${offsetDate}T12:00:00Z`,endTime:`${offsetDate}T12:30:00Z`});
  assert.equal(offsetBooking.status,201,JSON.stringify(offsetBooking)); assert.equal(offsetBooking.body.startTime,`${offsetDate}T09:00:00`);
  console.log('PASS shared creation across all primary modules and timezone normalization');
  const concurrentDate=new Date(Date.now()+21*86400000).toISOString().slice(0,10);
  const concurrent={...payload,startTime:`${concurrentDate}T09:00:00`,endTime:`${concurrentDate}T09:30:00`};
  const parallel=await Promise.all([call('POST','/v1/appointments',concurrent),call('POST','/v1/appointments',concurrent)]);
  assert.deepEqual(parallel.map(r=>r.status).sort(),[201,409]);
  assert.equal(db.prepare('SELECT count(*) n FROM appointments WHERE tenant_id=? AND start_time=?').get('reliable',concurrent.startTime).n,1);
  db.prepare("INSERT INTO professionals(id,tenant_id,name,active) VALUES('reliable-other','reliable','Outro',1)").run();
  for(let day=0;day<7;day++) db.prepare("INSERT INTO schedules(id,tenant_id,professional_id,day_of_week,start_time,end_time,is_active) VALUES(?,'reliable','reliable-other',?,'08:00','18:00',1)").run('reliable-other-'+day,day);
  const otherSlots=await call('GET',`/v1/slots/available?professionalId=reliable-other&serviceId=reliable-service&date=${concurrentDate}&patientId=reliable-patient`);
  assert.equal(otherSlots.status,200); assert.ok(!otherSlots.body.slots.some(s=>s.startTime===concurrent.startTime),'patient conflicts excluded from displayed availability');
  db.prepare("INSERT INTO professional_services(id,professional_id,service_id,custom_duration) VALUES('reliable-duration','reliable-other','reliable-service',45)").run();
  const customSlots=await call('GET',`/v1/slots/available?professionalId=reliable-other&serviceId=reliable-service&date=${concurrentDate}`);
  assert.equal(customSlots.body.slots[0].durationMinutes,45);
  const customSlot=customSlots.body.slots.find(s=>s.time==='14:00') || customSlots.body.slots.at(-1);
  const durationBooked=await call('POST','/v1/appointments',{...payload,professionalId:'reliable-other',startTime:customSlot.startTime,endTime:customSlot.endTime});
  assert.equal(durationBooked.status,201,JSON.stringify(durationBooked));
  db.prepare("UPDATE services SET min_lead_time_hours=100 WHERE id='reliable-service'").run();
  const nearDate=new Date(Date.now()+86400000).toISOString().slice(0,10);
  assert.equal((await call('GET',`/v1/slots/available?professionalId=reliable-pro&serviceId=reliable-service&date=${nearDate}`)).body.slots.length,0);
  console.log('PASS concurrent requests, patient-aware slots, professional-specific duration and minimum lead time');


 } catch(error){console.error(error);process.exitCode=1;} finally{server.close();}
});
