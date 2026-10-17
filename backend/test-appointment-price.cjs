const assert=require('node:assert/strict');
const {db,initializeDatabase}=require('./dist/config/database');initializeDatabase();
const {AppointmentController}=require('./dist/controllers/appointment.controller');
require('./dist/services/notification.service').NotificationService.scheduleAppointmentReminder=()=>{};
db.prepare("INSERT INTO tenants(id,name,slug,email,status) VALUES('price-clinic','Test','price-clinic','price@test.local','active')").run();
db.prepare("INSERT INTO users(id,tenant_id,name,email,password_hash,role) VALUES('price-user','price-clinic','Test','user@price.local','test','clinic_admin')").run();
db.prepare("INSERT INTO professionals(id,user_id,tenant_id,name,active) VALUES('price-pro','price-user','price-clinic','Test',1)").run();
db.prepare("INSERT INTO patients(id,tenant_id,full_name,phone) VALUES('price-patient','price-clinic','Patient','11999999999')").run();
db.prepare("INSERT INTO services(id,tenant_id,name,duration_minutes,price) VALUES('price-service','price-clinic','Consulta',30,150)").run();
for(let day=0;day<7;day++) db.prepare("INSERT INTO schedules(id,tenant_id,professional_id,day_of_week,start_time,end_time,is_active) VALUES(?,'price-clinic','price-pro',?,'08:00','18:00',1)").run('price-shift-'+day,day);
let hour=8;
function create(extra={}) {
 const time=String(hour++).padStart(2,'0');let status=200,body;
 AppointmentController.create({path:'/v1/appointments',tenantId:'price-clinic',headers:{},user:{userId:'price-user',role:'clinic_admin',name:'Test'},body:{patientId:'price-patient',professionalId:'price-pro',serviceId:'price-service',startTime:`2026-11-10T${time}:00:00`,endTime:`2026-11-10T${time}:30:00`,isCustomTime:true,...extra}}, {status(n){status=n;return this},json(value){body=value;return this}});
 return {status,body};
}
const saved=[];
for(const [input,amount,status] of [[{},150,'pending'],[{appointmentPrice:120},120,'pending'],[{appointmentPrice:150.5},150.5,'pending'],[{appointmentPrice:0},0,'exempt'],[{},150,'pending']]) {
 const result=create(input);assert.equal(result.status,201,JSON.stringify(result));saved.push(result.body.id);
 const payment=db.prepare('SELECT amount,status FROM payments WHERE appointment_id=?').get(result.body.id);
 assert.equal(payment.amount,amount);assert.equal(payment.status,status);
 assert.equal(db.prepare("SELECT price FROM services WHERE id='price-service'").get().price,150);
}
const count=db.prepare('SELECT count(*) n FROM appointments').get().n;
for(const value of [-1,NaN,Infinity,null,'120',{},1.234,Number.MAX_VALUE]) assert.equal(create({appointmentPrice:value}).status,400,String(value));
assert.equal(create({serviceId:'foreign-service',appointmentPrice:120}).status,400);
assert.equal(db.prepare('SELECT count(*) n FROM appointments').get().n,count,'invalid prices do not create appointments');
db.prepare("UPDATE services SET price=200 WHERE id='price-service'").run();
assert.equal(db.prepare('SELECT amount FROM payments WHERE appointment_id=?').get(saved[1]).amount,120);
assert.equal(db.prepare('SELECT amount,status FROM payments WHERE appointment_id=?').get(saved[3]).status,'exempt');
assert.equal(db.prepare("SELECT count(*) n FROM payments WHERE amount=0 AND status='pending'").get().n,0);
console.log('PASS default, custom, decimal, zero exemption, legacy fallback, tenant validation, invalid values and immutable price snapshot');
