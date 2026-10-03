import { DatabaseSync } from 'node:sqlite';
import { REFERENCES } from '../services/personal-assessment-calculation.service';
export const ASSESSMENT_COLUMNS: Record<string,string> = {
  bmi_classification:'TEXT',skinfold_sum:'REAL',skinfold_central_sum:'REAL',skinfold_peripheral_sum:'REAL',
  anthropometric_sex_at_assessment:'TEXT', age_at_assessment:'INTEGER', calculation_version:'TEXT', calculation_metadata_json:'TEXT',
  body_fat_classification:'TEXT',body_fat_reference:'TEXT',whr_classification:'TEXT',whtr_classification:'TEXT',bmr_method:'TEXT',
  vai_value:'REAL',vai_reference:'TEXT',humerus_breadth_cm:'REAL',femur_breadth_cm:'REAL',fold_iliac_crest:'REAL',fold_supraspinale:'REAL',
  skinfold_measurements_json:'TEXT',measurement_quality_json:'TEXT',glucose_mg_dl:'REAL',triglycerides_mg_dl:'REAL',ldl_mg_dl:'REAL',hdl_mg_dl:'REAL',
  somatotype_endomorphy:'REAL',somatotype_mesomorphy:'REAL',somatotype_ectomorphy:'REAL',somatochart_x:'REAL',somatochart_y:'REAL',
  tav_source_type:'TEXT',tav_reference_source:'TEXT',tav_is_estimate:'INTEGER DEFAULT 0',muscle_mass_method:'TEXT',muscle_mass_notes:'TEXT',
  biochemical_source:'TEXT',biochemical_exam_date:'TEXT'
};
/** Additive, idempotent. Never rewrites any assessment, patient or photo. */
export function migratePersonalAssessment(db: DatabaseSync) {
  for (const [table,columns] of Object.entries({patients:{anthropometric_sex:'TEXT'},personal_assessments:ASSESSMENT_COLUMNS})) {
    const existing=new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c:any)=>c.name));
    for(const [name,type] of Object.entries(columns)) if(!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
}
/** Only known global seed IDs; tenant-defined protocols and historical assessments are untouched. */
export function seedPersonalTav(db: DatabaseSync) {
  const protocols = [
    ['tav-proto-omron','Omron','Omron HBF-511 · 2026.1','nível',REFERENCES.omron,[[1,9,'Faixa de referência'],[10,14,'Alto'],[15,30,'Muito alto']]],
    ['tav-proto-tanita','Tanita','Tanita Visceral Fat Rating · 2026.1','nível',REFERENCES.tanita,[[1,12,'Faixa saudável'],[13,59,'Excesso']]],
    ['tav-proto-inbody','InBody','InBody Visceral Fat Level · 2026.1','nível',REFERENCES.inbody,[[1,10,'Dentro da referência selecionada'],[10.000001,100,'Acima da referência selecionada']]],
    ['tav-proto-inbody-area','InBody','InBody Visceral Fat Area · 2026.1','cm²',REFERENCES.inbody,[[0,100,'Dentro da referência selecionada'],[100.000001,10000,'Acima da referência selecionada']]]
  ] as const;
  for(const [id,equipment,name,unit,source,ranges] of protocols) {
    db.prepare(`INSERT INTO personal_tav_protocols (id,tenant_id,method,equipment,protocol_name,unit,source_reference,is_active,created_at,updated_at)
      VALUES (?,'global','Bioimpedância',?,?,?,?,1,datetime('now'),datetime('now'))
      ON CONFLICT(id) DO UPDATE SET protocol_name=excluded.protocol_name,unit=excluded.unit,source_reference=excluded.source_reference,is_active=1 WHERE personal_tav_protocols.tenant_id='global'`).run(id,equipment,name,unit,source);
    // Global ranges are configuration, never assessment data.
    db.prepare("DELETE FROM personal_tav_ranges WHERE protocol_id=? AND tenant_id='global'").run(id);
    ranges.forEach(([min,max,label],i)=>db.prepare(`INSERT INTO personal_tav_ranges (id,tenant_id,protocol_id,gender,min_value,max_value,classification,color_code,created_at)
      VALUES (?,'global',?,'all',?,?,?, ?,datetime('now'))`).run(id+'-2026-'+i,id,min,max,label,i ? '#F59E0B' : '#10B981'));
  }
  db.prepare("UPDATE personal_tav_protocols SET is_active=0,source_reference='Sem referência universal; configurar protocolo específico' WHERE id='tav-proto-dxa' AND tenant_id='global'").run();
}
