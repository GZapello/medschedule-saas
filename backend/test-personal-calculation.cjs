const {test}=require('node:test'),assert=require('node:assert/strict');
const {calculateAssessment:calc,normalizeLegacyAssessmentForReport:legacy,repeatedFold,ageAtDate}=require('./dist/services/personal-assessment-calculation.service');
const {migratePersonalAssessment}=require('./dist/config/personal-assessment.migration');
const {DatabaseSync}=require('node:sqlite');
const patient={birth_date:'1996-03-01',anthropometric_sex:'male'};
const full={assessment_date:'2026-03-01',weight:80,height:180,waist_cm:90,hip_cm:100,protocol:'pollock_7',fold_chest:12,fold_axillary:14,fold_triceps:16,fold_subscapular:18,fold_abdominal:20,fold_suprailiac:22,fold_thigh:24,fold_calf:12,fold_supraspinale:15,humerus_breadth_cm:7,femur_breadth_cm:9,arm_right_flexed:35,calf_right:38,triglycerides_mg_dl:150,hdl_mg_dl:50};
const near=(actual,expected,tol=.0002)=>assert.ok(Math.abs(actual-expected)<=tol,`${actual} expected ${expected} ±${tol}`);
for(const [sex,protocol,expected] of [['male','pollock_7',18.184605],['female','pollock_7',24.656826],['male','pollock_3',16.813608],['female','pollock_3',24.775740]]) test(`JP ${protocol} ${sex}`,()=>{
 const v=calc({...full,protocol},{...patient,anthropometric_sex:sex}).values.body_fat_percentage;
 // Reference fixture independently evaluated from original coefficients, tolerance 0.001 percentage point.
 near(v,expected,.001);
});
test('Missing sex blocks JP, VAI, TMB and sex-specific classification',()=>{const r=calc(full,{...patient,anthropometric_sex:'not_informed'});for(const k of ['body_fat_percentage','vai_value','bmr_kcal'])assert.equal(r.values[k],null);near(r.values.whr,.9);assert.match(r.values.whr_classification,/Sem classificação/);});
test('Missing age never defaults; assessment date exact birthday',()=>{const r=calc(full,{anthropometric_sex:'male'});assert.equal(r.values.age_at_assessment,null);assert.equal(r.values.body_fat_percentage,null);assert.equal(r.values.bmr_kcal,null);assert.equal(ageAtDate('1996-03-02','2026-03-01'),29);assert.equal(ageAtDate('1996-02-30','2026-03-01'),null);});
test('BMI, RCQ, RCE',()=>{const r=calc(full,patient).values;near(r.bmi,24.691358);near(r.whr,.9);near(r.whtr,.5);assert.match(r.whr_classification,/Abaixo/);assert.match(calc(full,{...patient,anthropometric_sex:'female'}).values.whr_classification,/Acima/);});
test('Body mass partition and no arbitrary muscle',()=>{const r=calc({...full,composition_method:'manual',body_fat_percentage:25},patient).values;near(r.fat_mass_kg,20);near(r.lean_mass_kg,60);assert.equal(r.muscle_mass_kg,null);near(calc({...full,muscle_mass_kg:30,muscle_mass_method:'bioimpedance'},patient).values.muscle_mass_kg,30);});
test('VAI male and female, conversions in metadata',()=>{const m=calc(full,patient),f=calc(full,{...patient,anthropometric_sex:'female'});near(m.values.vai_value,1.7419,.001);near(f.values.vai_value,2.657315,.001);near(m.metrics.vai_value.inputs.tg_mmol_l,1.69358,.001);assert.equal(m.values.tav_value,undefined);});
for(const key of ['triglycerides_mg_dl','hdl_mg_dl'])test(`VAI missing ${key}`,()=>assert.equal(calc({...full,[key]:null},patient).values.vai_value,null));
for(const [equipment,value,unit,label] of [['Omron',9,'nível','Faixa'],['Omron',10,'nível','Alto'],['Omron',15,'nível','Muito alto'],['Tanita',12,'nível','saudável'],['Tanita',13,'nível','Excesso'],['InBody',10,'nível','Dentro'],['InBody',100,'cm²','Dentro'],['InBody',101,'cm²','Acima'],['DXA',80,'cm²','Sem classificação'],['Unknown',5,'nível','Sem classificação']])test(`TAV ${equipment} ${value} ${unit}`,()=>assert.match(calc({...full,tav_equipment:equipment,tav_value:value,tav_unit:unit},patient).values.tav_classification,new RegExp(label)));
test('Repeated folds mean, median, quality threshold',()=>{near(repeatedFold([10,12]).final,11);assert.equal(repeatedFold([10,12]).needsThird,true);near(repeatedFold([10,12,11]).final,11);assert.equal(repeatedFold([10,12,11]).needsThird,false);assert.equal(repeatedFold([10,null]).final,null);});
test('Zero, null, invalid inputs never produce nonfinite numbers',()=>{const r=calc({weight:0,height:0,hip_cm:0,waist_cm:0,fold_triceps:Infinity,triglycerides_mg_dl:0,hdl_mg_dl:0},{});for(const v of Object.values(r.values))if(typeof v==='number')assert.ok(Number.isFinite(v));assert.equal(r.values.bmi,null);assert.equal(r.values.whr,null);assert.equal(r.values.vai_value,null);});
test('Complete somatotype and missing input',()=>{const r=calc(full,patient).values;near(r.somatotype_endomorphy,4.683615,.002);near(r.somatotype_mesomorphy,4.5390,.001);near(r.somatotype_ectomorphy,1.998,.002);assert.equal(calc({...full,fold_supraspinale:null},patient).values.somatochart_x,null);near(r.somatochart_x,r.somatotype_ectomorphy-r.somatotype_endomorphy,.0002);});
test('TMB male female',()=>{near(calc(full,patient).values.bmr_kcal,1780);near(calc(full,{...patient,anthropometric_sex:'female'}).values.bmr_kcal,1614);});
test('Legacy values preserved, patient changes cannot change snapshot',()=>{const original={...full,body_fat_percentage:33,fat_mass_kg:26.4,lean_mass_kg:53.6};const before=JSON.stringify(original);const r=legacy(original,patient);assert.equal(r.assessment.body_fat_percentage,33);assert.equal(r.legacy,true);assert.equal(JSON.stringify(original),before);const snap=calc({...full,anthropometric_sex_at_assessment:'male',age_at_assessment:30},{anthropometric_sex:'female'});assert.equal(snap.demographics.sex,'male');assert.equal(snap.demographics.age,30);});
test('Explicit not informed beats legacy gender; no prefix inference',()=>{for(const gender of ['','unknown','mystery'])assert.equal(calc(full,{gender}).demographics.sex,'not_informed');assert.equal(calc(full,{gender:'m',anthropometric_sex:'not_informed'}).demographics.sex,'not_informed');assert.equal(calc(full,{gender:'m'}).demographics.source,'legacy_gender');});
test('Gallagher/Omron scope excludes minors and >79',()=>{for(const age of [15,80])assert.match(calc({...full,age_at_assessment:age,body_fat_percentage:25,composition_method:'manual'},patient).values.body_fat_classification,/Sem classificação/);});
test('Legacy zero placeholders are absent in reports without changing originals',()=>{
 const original={weight:0,height:0,bmi:0,whr:0,whtr:0,muscle_mass_kg:0,body_fat_percentage:0,fat_mass_kg:0};
 const r=legacy(original,{}).assessment;
 for(const key of ['bmi','whr','whtr','muscle_mass_kg','body_fat_percentage','fat_mass_kg'])assert.equal(r[key],null);
 assert.equal(original.body_fat_percentage,0);assert.equal(original.weight,0);
});
test('Additive migration twice preserves Evilyn, Gabriel, dates, values, IDs and counts',()=>{
 const d=new DatabaseSync(':memory:');d.exec('CREATE TABLE patients(id TEXT PRIMARY KEY,full_name TEXT); CREATE TABLE personal_assessments(id TEXT PRIMARY KEY,patient_id TEXT,professional_id TEXT,assessment_date TEXT,weight REAL,body_fat_percentage REAL); CREATE TABLE tenants(id TEXT,name TEXT); CREATE TABLE users(id TEXT,name TEXT);');
 d.prepare('INSERT INTO tenants VALUES(?,?)').run('clinic','Teste Clínica Completa');d.prepare('INSERT INTO users VALUES(?,?)').run('pedro','Pedro Michielin');
 for(const [id,name,weight] of [['evil','Évilyn Piva Lobo',67.9],['gab','Gabriel Kuiawinski Zapello',80]]){d.prepare('INSERT INTO patients VALUES(?,?)').run(id,name);d.prepare('INSERT INTO personal_assessments VALUES(?,?,?,?,?,?)').run('assessment-'+id,id,'pedro','2026-03-11',weight,25);}
 const query='SELECT id,patient_id,professional_id,assessment_date,weight,body_fat_percentage FROM personal_assessments ORDER BY id',before=d.prepare(query).all();
 migratePersonalAssessment(d);migratePersonalAssessment(d);assert.deepEqual(d.prepare(query).all(),before);assert.equal(d.prepare('SELECT count(*) n FROM personal_assessments').get().n,2);d.close();
});
