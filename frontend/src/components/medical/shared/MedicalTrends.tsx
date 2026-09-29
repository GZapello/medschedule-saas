import React, { useState } from 'react';
import { ClinicalTrendChart } from '../../clinical/ClinicalTrendChart';
import { MedicalConsultation } from '../../../types/capabilities';
const metrics = [
  ['PA sistólica', 'mmHg', 'vitalSigns.bloodPressureSystolic'], ['PA diastólica', 'mmHg', 'vitalSigns.bloodPressureDiastolic'],
  ['Frequência cardíaca', 'bpm', 'vitalSigns.heartRate'], ['Peso', 'kg', 'vitalSigns.weight'],
  ['Estatura', 'cm', 'vitalSigns.height'], ['IMC', 'kg/m²', 'vitalSigns.bmi'],
  ['HbA1c', '%', 'specialtyNotes.endocrinoNotes.hba1c'], ['Glicemia de jejum', 'mg/dL', 'specialtyNotes.endocrinoNotes.fastingGlucose'],
  ['PIO OD', 'mmHg', 'specialtyNotes.ophtalmoNotes.iopOD'], ['PIO OE', 'mmHg', 'specialtyNotes.ophtalmoNotes.iopOE'],
  ['Peso — antropometria', 'kg', 'specialtyNotes.sharedAssessments.anthropometry.weight'],
  ['Estatura — antropometria', 'cm', 'specialtyNotes.sharedAssessments.anthropometry.height'],
  ['Perímetro cefálico', 'cm', 'specialtyNotes.sharedAssessments.anthropometry.measures.Perímetro cefálico.cm']
];
export const MedicalTrends: React.FC<{ history: MedicalConsultation[] }> = ({ history }) => {
  const [metric, setMetric] = useState(0);
  const [label, unit, path] = metrics[metric];
  const rows = history.map(item => {
    const raw = path.split('.').reduce<any>((value, key) => value?.[key], item);
    return { assessment_date: item.created_at, value: typeof raw === 'string' ? raw.trim().replace(',', '.') : raw };
  });
  return <details className="rounded-xl border border-slate-200 p-3"><summary className="text-xs font-bold cursor-pointer">Tendências clínicas</summary>
    <label className="text-xs">Métrica <select value={metric} onChange={e => setMetric(Number(e.target.value))} className="m-3 p-2 border border-slate-200 rounded-xl">{metrics.map(([name], i) => <option key={name} value={i}>{name}</option>)}</select></label>
    <ClinicalTrendChart history={rows} metric="value" title={label} unit={unit} />
  </details>;
};
