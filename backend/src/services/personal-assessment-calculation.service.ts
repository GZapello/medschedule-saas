/** Central source of truth. Pure functions: no database writes, including legacy reads. */
export const CALCULATION_VERSION = 'personal-calc-2026.1';
export const REFERENCES = {
  jpMale: 'Jackson & Pollock 1978; PMID 718832; DOI 10.1079/BJN19780152',
  jpFemale: 'Jackson, Pollock & Ward 1980; PMID 7402053',
  fat: 'Gallagher 2000 / Omron HBF-511 adult table; PMID 10966886; version 2026.1',
  whr: 'WHO 2011; ISBN 9789241501491; adult screening',
  whtr: 'Browning 2010; PMID 20819243; adult screening boundary 0.50',
  vai: 'Amato 2010; DOI 10.2337/dc09-1825',
  bmr: 'Mifflin-St Jeor 1990; PMID 2305711',
  somatotype: 'Heath-Carter anthropometric somatotype; Carter instruction manual 2002',
  omron: 'https://www.omron-healthcare.com/storage/5322544-0g_web_im-hbf-511b-e-en-07-06-2021.pdf',
  tanita: 'https://support.tanita.eu/support/solutions/articles/60000677375-how-is-visceral-fat-measured-by-tanita-',
  inbody: 'https://research.inbody.com/result-sheet-interpretation-parameter-keynote/'
};
export const FOLDS = ['triceps','subscapular','biceps','chest','axillary','suprailiac','iliac_crest','supraspinale','abdominal','thigh','calf'];
export function numberOrNull(value: any, zeroAllowed = false): number | null {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) && (zeroAllowed ? n >= 0 : n > 0) ? n : null;
}
export function referenceSex(patient: any) {
  const legacy = patient.anthropometric_sex == null;
  const value = String(legacy ? patient.gender || '' : patient.anthropometric_sex).trim().toLowerCase();
  const sex = ['male','m','masculino','homem'].includes(value) ? 'male' : ['female','f','feminino','mulher'].includes(value) ? 'female' : 'not_informed';
  return { sex, source: legacy && sex !== 'not_informed' ? 'legacy_gender' : 'anthropometric_sex' };
}
export function ageAtDate(birth: any, date: any): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(birth || '') || !/^\d{4}-\d{2}-\d{2}/.test(date || '')) return null;
  const b = new Date(String(birth).slice(0,10) + 'T00:00:00Z'), d = new Date(String(date).slice(0,10) + 'T00:00:00Z');
  if (!Number.isFinite(+b) || !Number.isFinite(+d) || b.toISOString().slice(0,10) !== String(birth).slice(0,10) || b > d) return null;
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) age--;
  return age <= 120 ? age : null;
}
function parsed(v: any): any { try { return typeof v === 'string' ? JSON.parse(v) : v || {}; } catch { return {}; } }
export function repeatedFold(raw: any[]) {
  const measurements = raw.slice(0,3).map(v => numberOrNull(v));
  const valid = measurements.filter((v): v is number => v !== null);
  const differencePct = valid.length >= 2 ? Math.abs(valid[0]-valid[1]) / ((valid[0]+valid[1])/2) * 100 : null;
  return { measurements, final: valid.length >= 3 ? [...valid].sort((a,b)=>a-b)[1] : valid.length === 2 ? (valid[0]+valid[1])/2 : null,
    needsThird: differencePct !== null && differencePct > 5 && valid.length < 3, differencePct, method: valid.length >= 3 ? 'median' : 'mean' };
}
export function classifyTav(a: any) {
  const value = numberOrNull(a.tav_value, true), eq = String(a.tav_equipment || '').toLowerCase();
  const area = ['cm²','cm2'].includes(a.tav_unit);
  let classification: string | null = null, reference: string | null = null;
  if (value !== null && eq.includes('omron') && !area) {
    reference = REFERENCES.omron;
    if (Number.isInteger(value) && value >= 1 && value <= 30) classification = value <= 9 ? 'Faixa de referência' : value <= 14 ? 'Alto' : 'Muito alto';
  } else if (value !== null && eq.includes('tanita') && !area) {
    reference = REFERENCES.tanita;
    if (Number.isInteger(value) && value >= 1 && value <= 59) classification = value <= 12 ? 'Faixa saudável' : 'Excesso';
  } else if (value !== null && eq.includes('inbody')) {
    reference = REFERENCES.inbody;
    classification = value <= (area ? 100 : 10) ? 'Dentro da referência selecionada' : 'Acima da referência selecionada';
  }
  return { value, classification: classification || 'Sem classificação para esta referência', reference, unit: a.tav_unit || 'nível', equipment: a.tav_equipment || null,
    sourceType: a.tav_source_type || 'equipment', isEstimate: Boolean(a.tav_is_estimate) };
}
export function calculateAssessment(input: any, patient: any = {}) {
  const a = { ...input }, sexInfo = referenceSex(patient);
  const sex = a.anthropometric_sex_at_assessment ?? sexInfo.sex;
  const age = a.calculation_version || a.age_at_assessment != null ? numberOrNull(a.age_at_assessment, true) : ageAtDate(patient.birth_date, a.assessment_date);
  const unavailable: any[] = [], metrics: Record<string, any> = {}, values: Record<string, any> = {};
  const round = (n: number) => Math.round(n*10000)/10000;
  const metric = (key: string, value: number | null, formula: string, reference: string, inputs: any, reason?: string, source = 'calculated') => {
    const safe = value !== null && Number.isFinite(value) ? round(value) : null;
    values[key] = safe; metrics[key] = { value: safe, formula, reference, inputs, source, version: CALCULATION_VERSION, reason: safe === null ? reason || 'Dados insuficientes' : null };
    if (safe === null) unavailable.push({ metric: key, reason: metrics[key].reason });
    return safe;
  };
  const raw = parsed(a.skinfold_measurements_json), quality: any = {};
  for (const fold of FOLDS) {
    const key = 'fold_'+fold;
    if (Array.isArray(raw[key]) && raw[key].some((v: any)=>numberOrNull(v) !== null)) {
      quality[key] = repeatedFold(raw[key]); a[key] = quality[key].final;
    }
    values[key] = numberOrNull(a[key]);
  }
  // Iliac crest is separate from supraspinale; legacy suprailiac remains supported.
  if (values.fold_suprailiac === null) values.fold_suprailiac = values.fold_iliac_crest;
  const weight = numberOrNull(a.weight), height = numberOrNull(a.height), waist = numberOrNull(a.waist_cm), hip = numberOrNull(a.hip_cm);
  const bmi = metric('bmi', weight && height ? weight/(height/100)**2 : null, 'kg / (cm / 100)^2', 'WHO adult BMI', {weight,height});
  const whr = metric('whr', waist && hip ? waist/hip : null, 'waist / hip', REFERENCES.whr, {waist,hip});
  const whtr = metric('whtr', waist && height ? waist/height : null, 'waist / height', REFERENCES.whtr, {waist,height});
  const adult = age !== null && age >= 18;
  values.bmi_classification = adult && bmi !== null ? bmi < 18.5 ? 'Abaixo do peso' : bmi < 25 ? 'Faixa de referência' : bmi < 30 ? 'Sobrepeso' : bmi < 35 ? 'Obesidade grau I' : bmi < 40 ? 'Obesidade grau II' : 'Obesidade grau III' : 'Sem classificação para esta referência';
  values.whr_classification = adult && whr !== null && ['male','female'].includes(sex) ? `${whr > (sex === 'male' ? .90 : .85) ? 'Acima' : 'Abaixo ou igual'} ao ponto de corte WHO` : 'Sem classificação para esta referência';
  values.whtr_classification = adult && whtr !== null ? `${whtr >= .50 ? 'Acima ou igual' : 'Abaixo'} do limite de triagem 0,50 (Browning 2010)` : 'Sem classificação para esta referência';
  const sum = (folds: string[]) => { const ns = folds.map(f=>values['fold_'+f]).filter((n: any)=>n !== null); return ns.length ? ns.reduce((s: number,n: number)=>s+n,0) : null; };
  const totalFolds = FOLDS.filter(f=>f !== 'iliac_crest' || values.fold_suprailiac === null);
  metric('skinfold_sum',sum(totalFolds),'sum of available sites; partial when incomplete','ISAK sites',{sites:Object.fromEntries(totalFolds.map(f=>[f,values['fold_'+f]])),partial:totalFolds.some(f=>values['fold_'+f]===null)});
  metric('skinfold_central_sum',sum(['subscapular','chest','axillary','suprailiac','supraspinale','abdominal']),'sum of available central sites','ISAK sites',Object.fromEntries(['subscapular','chest','axillary','suprailiac','supraspinale','abdominal'].map(f=>[f,values['fold_'+f]])));
  metric('skinfold_peripheral_sum',sum(['triceps','biceps','thigh','calf']),'sum of available peripheral sites','ISAK sites',Object.fromEntries(['triceps','biceps','thigh','calf'].map(f=>[f,values['fold_'+f]])));
  const protocol = a.skinfolds_protocol || a.protocol || 'pollock_7';
  const jp7 = ['chest','axillary','triceps','subscapular','abdominal','suprailiac','thigh'];
  const required = protocol === 'pollock_3' ? sex === 'male' ? ['chest','abdominal','thigh'] : ['triceps','suprailiac','thigh'] : jp7;
  const missing = required.filter(f=>values['fold_'+f] === null);
  const manual = ['bioimpedancia','bioimpedância','bioimpedance','dxa','outro','other','manual'].includes(String(a.composition_method).toLowerCase());
  let fat = manual ? numberOrNull(a.body_fat_percentage, true) : null, formula = manual ? 'Documented manual/equipment value' : protocol+' density + Siri: 495/BD-450';
  let reason = sex === 'not_informed' ? 'Referência por sexo não informada' : age === null ? 'Data de nascimento não informada' : missing.length ? 'Dobras ausentes: '+missing.join(', ') : 'Protocolo não suportado';
  if (!manual && ['male','female'].includes(sex) && age !== null && !missing.length && ['pollock_3','pollock_7'].includes(protocol)) {
    const s = required.reduce((s,f)=>s+values['fold_'+f],0);
    const c = protocol === 'pollock_7' ? sex === 'male' ? [1.112,.00043499,.00000055,.00028826] : [1.097,.00046971,.00000056,.00012828] : sex === 'male' ? [1.10938,.0008267,.0000016,.0002574] : [1.0994921,.0009929,.0000023,.0001392];
    const density = c[0]-c[1]*s+c[2]*s*s-c[3]*age;
    fat = density > 0 ? 495/density-450 : null;
    formula = `BD=${c[0]}-${c[1]}*sum+${c[2]}*sum^2-${c[3]}*age; Siri: 495/BD-450`;
    reason = 'Resultado fora do domínio da equação';
  }
  if (fat !== null && (fat < 0 || fat > 100)) fat = null;
  fat = metric('body_fat_percentage',fat,formula,manual ? a.composition_method : sex === 'female' ? REFERENCES.jpFemale : sex==='male' ? REFERENCES.jpMale : 'Jackson-Pollock exige referência por sexo',{protocol,sex,age,folds:required.map(f=>({site:f,value:values['fold_'+f]}))},reason,manual ? 'manual/equipment' : 'estimated');
  const fatMass = metric('fat_mass_kg',weight !== null && fat !== null ? weight*fat/100 : null,'weight * fat% / 100','Body mass partition',{weight,fat});
  metric('lean_mass_kg',weight !== null && fatMass !== null ? weight-fatMass : null,'weight - fat mass','Body mass partition',{weight,fatMass});
  metric('muscle_mass_kg',a.muscle_mass_method === 'lee_2000' ? null : numberOrNull(a.muscle_mass_kg),'Documented manual/equipment value',a.muscle_mass_method || 'manual',{value:a.muscle_mass_kg},'Massa muscular não informada; Lee 2000 não habilitado sem inputs validados','manual/equipment');
  values.muscle_mass_method=values.muscle_mass_kg !== null ? a.muscle_mass_method || 'manual' : null;
  const ranges = sex === 'male' ? age !== null && age < 40 ? [8,20,25] : age !== null && age < 60 ? [11,22,28] : [13,25,30] : age !== null && age < 40 ? [21,33,39] : age !== null && age < 60 ? [23,34,40] : [24,36,42];
  values.body_fat_reference = REFERENCES.fat;
  values.body_fat_classification = fat !== null && age !== null && age >= 20 && age <= 79 && ['male','female'].includes(sex) ? fat < ranges[0] ? 'Baixo' : fat < ranges[1] ? 'Faixa de referência' : fat < ranges[2] ? 'Alto' : 'Muito alto' : 'Sem classificação para esta referência';
  const tg = numberOrNull(a.triglycerides_mg_dl), hdl = numberOrNull(a.hdl_mg_dl);
  const vai = waist && bmi && tg && hdl && ['male','female'].includes(sex) ? waist/(sex === 'male' ? 39.68+1.88*bmi : 36.58+1.89*bmi) * (tg/88.57)/(sex === 'male' ? 1.03 : .81) * (sex === 'male' ? 1.31 : 1.52)/(hdl/38.67) : null;
  metric('vai_value',vai,sex==='male' ? 'WC/(39.68+1.88*BMI) * (TG mmol/L / 1.03) * (1.31 / HDL mmol/L)' : sex==='female' ? 'WC/(36.58+1.89*BMI) * (TG mmol/L / 0.81) * (1.52 / HDL mmol/L)' : 'VAI requer referência por sexo',REFERENCES.vai,{waist,bmi,sex,tg_mg_dl:tg,hdl_mg_dl:hdl,tg_mmol_l:tg ? tg/88.57 : null,hdl_mmol_l:hdl ? hdl/38.67 : null,conversion:{tg:88.57,hdl:38.67}},sex === 'not_informed' ? 'Referência por sexo não informada' : 'Necessários cintura, IMC, triglicerídeos e HDL');
  const measuredBmr = numberOrNull(a.bmr_kcal);
  metric('bmr_kcal',measuredBmr ?? (weight && height && age !== null && ['male','female'].includes(sex) ? 10*weight+6.25*height-5*age+(sex === 'male' ? 5 : -161) : null),'10*kg+6.25*cm-5*age+sex_constant',measuredBmr ? 'Valor informado pelo profissional/equipamento' : REFERENCES.bmr,{weight,height,age,sex},age === null ? 'Data de nascimento não informada' : 'Referência por sexo não informada',measuredBmr ? 'manual/equipment' : 'estimated');
  values.bmr_method = measuredBmr ? a.bmr_method || 'manual/equipment' : 'mifflin_st_jeor';
  const somatoInputs = {height,weight,triceps:values.fold_triceps,subscapular:values.fold_subscapular,supraspinale:values.fold_supraspinale,humerus:numberOrNull(a.humerus_breadth_cm),femur:numberOrNull(a.femur_breadth_cm),arm:numberOrNull(a.arm_right_flexed) ?? numberOrNull(a.arm_left_flexed),calf:numberOrNull(a.calf_right) ?? numberOrNull(a.calf_left),calfFold:values.fold_calf};
  const missingSomato = Object.entries(somatoInputs).filter(([,v])=>v === null).map(([k])=>k);
  let endo: number | null=null,meso: number | null=null,ecto: number | null=null;
  if (!missingSomato.length) {
    const s = somatoInputs as Record<string,number>, x=(s.triceps+s.subscapular+s.supraspinale)*170.18/s.height;
    endo=Math.max(.1,-.7182+.1451*x-.00068*x*x+.0000014*x*x*x);
    meso=Math.max(.1,.858*s.humerus+.601*s.femur+.188*(s.arm-s.triceps/10)+.161*(s.calf-s.calfFold/10)-.131*s.height+4.5);
    const hwr=s.height/Math.cbrt(s.weight); ecto=hwr >= 40.75 ? .732*hwr-28.58 : hwr > 38.25 ? .463*hwr-17.63 : .1;
  }
  for (const [key,v,formula] of [['somatotype_endomorphy',endo,'X=(triceps+subscapular+supraspinale)*170.18/height; -0.7182+0.1451*X-0.00068*X^2+0.0000014*X^3'],['somatotype_mesomorphy',meso,'0.858*HB+0.601*FB+0.188*corrected_arm+0.161*corrected_calf-0.131*height+4.5'],['somatotype_ectomorphy',ecto,'HWR=height/cbrt(weight); HWR>=40.75:0.732*HWR-28.58; HWR>38.25:0.463*HWR-17.63; otherwise:0.1'],['somatochart_x',endo !== null && ecto !== null ? ecto-endo : null,'ecto-endo'],['somatochart_y',endo !== null && meso !== null && ecto !== null ? 2*meso-endo-ecto : null,'2*meso-endo-ecto']] as const) metric(key,v,formula,REFERENCES.somatotype,somatoInputs,'Campos ausentes: '+missingSomato.join(', '));
  const tav = classifyTav(a);
  values.tav_classification = tav.value !== null ? tav.classification : null;
  values.tav_reference_source = tav.reference; values.tav_source_type = tav.sourceType; values.tav_is_estimate = tav.isEstimate ? 1 : 0;
  values.anthropometric_sex_at_assessment=sex; values.age_at_assessment=age; values.calculation_version=CALCULATION_VERSION;
  values.vai_reference=REFERENCES.vai; values.skinfold_measurements_json=JSON.stringify(raw); values.measurement_quality_json=JSON.stringify(quality);
  const metadata = {version:CALCULATION_VERSION,demographics:{sex,age,source:a.anthropometric_sex_at_assessment ? 'assessment_snapshot' : sexInfo.source},metrics,visceralAdiposity:{tav,vai:metrics.vai_value},quality,unavailable,references:REFERENCES};
  values.calculation_metadata_json=JSON.stringify(metadata);
  return { values, ...metadata };
}
export function normalizeLegacyAssessmentForReport(a: any, patient: any) {
  const persisted={...a};
  if(!a.calculation_version) {
    // Old controllers stored zero for absent positive measurements. This changes display only.
    const positiveFields=['weight','height','bmi','whr','whtr','lean_mass_kg','muscle_mass_kg','bmr_kcal','neck_cm','shoulder_cm','chest_cm','waist_cm','abdomen_cm','hip_cm','resting_heart_rate_bpm','blood_pressure_systolic','blood_pressure_diastolic'];
    for(const key of [...positiveFields,...Object.keys(a).filter(k=>k.startsWith('fold_') || k.startsWith('arm_') || k.startsWith('forearm_') || k.startsWith('wrist_') || k.startsWith('thigh_') || k.startsWith('calf_'))]) if(persisted[key]===0) persisted[key]=null;
    if(a.body_fat_percentage===0 && !['manual','bioimpedancia','bioimpedance','dxa','outro'].includes(a.composition_method)) {
      persisted.body_fat_percentage=null;persisted.fat_mass_kg=null;
      // Do not replace a historical placeholder with a freshly estimated JP result.
      persisted.composition_method='manual';
    }
  }
  const result=calculateAssessment(persisted.body_fat_percentage != null && !a.calculation_version ? {...persisted,composition_method:'manual'} : persisted,patient);
  if(!a.calculation_version) {for(const k of ['body_fat_percentage','muscle_mass_kg','bmr_kcal']) if(a[k]!=null && result.metrics[k]) {result.metrics[k].source='legacy_persisted';result.metrics[k].reference=a.protocol || a.composition_method || 'Método legado não documentado';} }
  // A read-only merge always gives precedence to historical persisted values.
  const assessment={...result.values,...Object.fromEntries(Object.entries(persisted).filter(([,v])=>v !== null && v !== undefined))};
  if(a.composition_method !== undefined) assessment.composition_method=a.composition_method;
  else delete assessment.composition_method;
  return { assessment, derived:result, legacy:!a.calculation_version };
}
