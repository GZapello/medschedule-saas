import React from 'react';

const labels: Record<string, string> = {
  clinicalHistory: 'Histórico clínico', bowelHabits: 'Hábitos intestinais', routineWakeUp: 'Horário de despertar',
  routineSleep: 'Horário de sono', physicalActivity: 'Atividade física', bmi: 'IMC', bmr: 'Taxa metabólica basal',
  totalEnergy: 'Gasto energético total', carbG: 'Carboidratos (g)', protG: 'Proteínas (g)', protGPerKg: 'Proteínas (g/kg)', fatG: 'Gorduras (g)',
  calorieTarget: 'Meta calórica', waterTargetMl: 'Meta de água (ml)', generalGuidelines: 'Orientações gerais', meals: 'Refeições',
  mealName: 'Refeição', mealTime: 'Horário', items: 'Itens', food: 'Alimento', portion: 'Porção', calories: 'Calorias',
  carb: 'Carboidratos', protein: 'Proteínas', fat: 'Gorduras', recallDate: 'Data do recordatório', isWeekend: 'Fim de semana',
  waterIntakeMl: 'Ingestão de água (ml)', name: 'Nome', time: 'Horário', goalForm: 'Meta em elaboração',
  description: 'Descrição', category: 'Categoria', targetValue: 'Objetivo', calcFormula: 'Fórmula', activityFactor: 'Fator de atividade',
  injuryFactor: 'Fator de lesão', carbPercent: 'Carboidratos (%)', proteinPercent: 'Proteínas (%)', fatPercent: 'Gorduras (%)',
  occupationalHistory: 'Histórico ocupacional', dailyRoutine: 'Rotina diária', interests: 'Interesses', environment: 'Ambiente',

  anamnesisData: 'Anamnese', anamnesis: 'Anamnese', assessment: 'Avaliação', assessmentData: 'Avaliação',
  profileData: 'Perfil ocupacional', adlData: 'Atividades de vida diária', sensoryData: 'Avaliação sensorial',
  motorCognitiveData: 'Avaliação motora e cognitiva', treatmentPlanData: 'Plano terapêutico', assistiveTechnologyData: 'Tecnologia assistiva',
  phonemesData: 'Fonemas', languageData: 'Linguagem', orofacialData: 'Motricidade orofacial', voiceData: 'Voz',
  fluencyData: 'Fluência', dysphagiaData: 'Disfagia', audiologyData: 'Audiologia', audioData: 'Amostra de voz',
  bioimpedanceData: 'Bioimpedância', recallData: 'Recordatório alimentar', mealPlanData: 'Plano alimentar', goalsData: 'Metas',
  anthropometryForm: 'Antropometria', calculationInputs: 'Parâmetros dos cálculos', calculationsData: 'Cálculos nutricionais',
  periodontalData: 'Periodontia', endodonticData: 'Endodontia', prostheticData: 'Prótese', orthodonticData: 'Ortodontia', facialData: 'Harmonização facial',
  odontogramData: 'Odontograma', toothChanges: 'Alterações dentárias', proceduresPerformed: 'Procedimentos',
  painScore: 'Escala de dor', painLocation: 'Local da dor', painCharacteristics: 'Características da dor', conductsExercises: 'Condutas e exercícios',
  bodyMapJson: 'Mapa de dor', bodyMapImage: 'Imagem do mapa de dor', notes: 'Observações', weight: 'Peso', height: 'Altura',
  waistCirc: 'Cintura', abdominalCirc: 'Circunferência abdominal', hipCirc: 'Quadril', clinicalEvolution: 'Evolução clínica', conducts: 'Condutas',
};
const metadata = new Set(['patientId', 'appointmentId', 'professionalId', 'saveOnly', 'payment', 'moduleType', 'title', 'isSealed', 'clinicalEvolution', 'technicalNotes', 'conducts', 'moduleData', 'attachmentIds']);
function Value({ value }: { value: any }): React.ReactElement | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && value.startsWith('data:audio/')) return <audio controls src={value} className="max-w-full" />;
  if (typeof value === 'string' && /^data:image\/(png|jpeg|webp);/.test(value)) return <img src={value} alt="Imagem clínica salva" className="max-w-full max-h-96" />;
  if (typeof value === 'string' && /^[\[{]/.test(value)) {
    try { return <Value value={JSON.parse(value)} />; } catch { /* Texto livre */ }
  }
  if (typeof value === 'object') return <dl className="space-y-2 border-l pl-3">{Object.entries(value).filter(([key, val]) => !metadata.has(key) && val !== null && val !== '').map(([key, val]) =>
    <div key={key}><dt className="font-semibold">{labels[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')}</dt><dd className="whitespace-pre-wrap break-words"><Value value={val} /></dd></div>)}</dl>;
  return <span>{typeof value === 'boolean' ? value ? 'Sim' : 'Não' : String(value)}</span>;
}
export function ClinicalSnapshot({ record }: { record: any }) {
  return <section className="space-y-3 text-xs text-slate-800">
    {record.procedure_name && <p><strong>Procedimentos:</strong> {record.procedure_name}</p>}
    {record.conducts && <p className="whitespace-pre-wrap"><strong>Condutas:</strong> {record.conducts}</p>}
    {record.module_data_json && <div><h4 className="font-bold mb-2">Dados do atendimento — {record.module_type || 'Clínico'}</h4><Value value={record.module_data_json} /></div>}
    {record.clinical_data_json && record.clinical_data_json !== record.module_data_json && <div><h4 className="font-bold">Dados clínicos</h4><Value value={record.clinical_data_json} /></div>}
    {record.attachments?.length > 0 && <div><h4 className="font-bold">Anexos</h4>{record.attachments.map((a: any) => <p key={a.id}><a className="text-teal-700 underline" href={a.file_url} target="_blank" rel="noreferrer">{a.title || a.name || 'Abrir anexo'}</a></p>)}</div>}
  </section>;
}
