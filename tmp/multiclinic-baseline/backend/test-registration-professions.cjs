const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'zemda-professions-'));
process.env.DATABASE_PATH=path.join(temp,'test.sqlite');process.env.JWT_SECRET='test-only-professions-session-key';
global.fetch=()=>{throw Error('External network forbidden in registration test');};
const {db,initializeDatabase}=require('./dist/config/database');initializeDatabase();
const {REGISTRATION_PROFESSIONS:options,REGISTRATION_PROFESSION_ALIASES:aliases}=require('./dist/types/registration-professions');
const {resolveProfessionModule}=require('./dist/utils/profession-module');
const {EmailService}=require('./dist/services/email.service');
EmailService.verifyVerificationToken=token=>({valid:true,payload:{verificationId:token}});
require('./dist/services/trial-notification.service').TrialNotificationService.notifyTrialStarted=async()=>{};
const {TenantController}=require('./dist/controllers/tenant.controller');
const before=db.prepare('SELECT id,role,profession_id,profession_name FROM users ORDER BY id').all();
const expected={'prof-administrador':null,'prof-fonoaudiologo':'ZemdaFono','prof-fisioterapeuta':'ZemdaFisio','prof-psicologo':'ZemdaPsico','prof-enfermeiro':null,'prof-medico':'ZemdaMed','prof-outro-saude':null};
(async()=>{
 assert.equal(new Set(options.map(x=>x.id)).size,options.length);assert.equal(new Set(options.map(x=>x.label)).size,options.length);
 for(const row of db.prepare('SELECT id FROM professions WHERE tenant_id IS NULL AND active=1').all())assert.ok(options.some(x=>x.id===(aliases[row.id]||row.id)),row.id+' missing');
 const registrations=[...options,{...options.find(x=>x.id==='prof-dentista'),inputId:'prof-cirurgiao-dentista'},{...options.find(x=>x.id==='prof-outro-saude'),inputId:'other_health'}];
 for(let i=0;i<registrations.length;i++){
  const option=registrations[i],name=option.id==='prof-outro-saude'?'Profissional de Saúde QA':option.canonicalName,email=`profession-${i}@example.invalid`,verification='verification-'+i;
  db.prepare("INSERT INTO email_verifications(id,email,purpose,code_hash,status,expires_at) VALUES(?,?,?,'test','verified',datetime('now','+1 hour'))").run(verification,email,'clinic_registration');
  const req={body:{responsibleName:'Pessoa QA '+i,email,password:'SyntheticTest123',phone:'11999999999',profession:name,professionId:option.inputId||option.id,professionName:name,registrationType:option.boardLabel,termsAccepted:true,privacyAccepted:true,emailVerificationToken:verification,startTrial:true,planCode:'SOLO'},headers:{},ip:'127.0.0.1'};
  let status=200,payload;const res={status(n){status=n;return this;},json(p){payload=p;return this;}};
  await TenantController.registerPublic(req,res);assert.equal(status,201,option.id+' '+JSON.stringify(payload));
  const user=db.prepare('SELECT * FROM users WHERE id=?').get(payload.user.id);assert.equal(user.profession_id,option.id);assert.equal(user.profession_name,name);assert.ok(!user.profession_name.includes(' — '));assert.equal(user.role,'clinic_admin');
  const module=resolveProfessionModule({id:user.profession_id,name:user.profession_name,slug:option.slug,registrationType:user.registration_type});
  assert.equal(module.module,option.module||null,option.id);
  if(Object.hasOwn(expected,option.id))assert.equal(module.module,expected[option.id]);
  for(const [flag,value]of Object.entries(module.flags))assert.equal(user[flag],value,option.id+' '+flag);
  assert.equal(payload.isTrial,true);assert.equal(payload.user.zemdaBodyEnabled,false,'Preserve default flag; Body comes from existing administrative access');
  const membership=db.prepare('SELECT * FROM clinic_users WHERE user_id=?').get(user.id);assert.equal(membership.zemda_body_enabled,0);assert.equal(membership.role,'clinic_admin');assert.equal(membership.is_manager,1);
  if(option.administrative)assert.equal(db.prepare('SELECT COUNT(*) AS n FROM professionals WHERE user_id=?').get(user.id).n,0,'No clinical profile for '+option.id);
 }
 for(const row of before)assert.deepEqual(db.prepare('SELECT id,role,profession_id,profession_name FROM users WHERE id=?').get(row.id),row);
 console.log(`PASS: ${registrations.length} real controller registrations in temporary SQLite; canonical persistence, module flags, administrative profiles, trial, Body default and old users preserved.`);
})().catch(e=>{console.error(e);process.exit(1)});

