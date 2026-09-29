import { PostureGait } from '../../clinical/PostureGait';
import React, { lazy, Suspense, useState } from 'react';
import { ClinicalScales } from '../../clinical/ClinicalScales';
import { ADLAssessment, emptyAdlItems } from '../../clinical/ADLAssessment';
const Zemda360 = lazy(() => import('../../zemda-body/ZemdaBodyModal').then(m => ({ default: m.ZemdaBodyModal })));
const MedicalBodyMap: React.FC<{ value: any; onSaved: (id: string) => void; patientId: string; patientName?: string; appointmentId?: string; onClose: () => void }> = ({ value, onSaved, ...props }) => {
  const [assessmentId] = useState<string | undefined>(value?.assessmentId);
  return <Zemda360 {...props} isOpen module="medical" assessmentId={assessmentId} onAssessmentSaved={onSaved} />;
};
const Anthropometry = lazy(() => import('../../zemda-body/AnthropometricAssessmentView').then(m => ({ default: m.AnthropometricAssessmentView })));
const Audiology = lazy(() => import('../../speech-therapy/audiology/AudiologyWorkspaceSection').then(m => ({ default: m.AudiologyWorkspaceSection })));
const Voice = lazy(() => import('../../speech-therapy/Idv10AssessmentSection').then(m => ({ default: m.Idv10AssessmentSection })));
const Regional = lazy(() => import('../../physiotherapy/RegionalPhysioAssessmentModal').then(m => ({ default: m.RegionalPhysioAssessmentModal })));
const regions = ['Coluna', 'Ombro', 'Braço', 'Cotovelo', 'Antebraço', 'Punho', 'Mão', 'Quadril', 'Joelho', 'Perna', 'Tornozelo', 'Pé'];
const regionalIds = ['spine', 'shoulder', 'arm', 'elbow', 'forearm', 'wrist', 'hand', 'hip', 'knee', 'leg', 'ankle', 'foot'];
interface Props {
  capabilities: string[]; patientId: string; patient: any; appointmentId?: string;
  value: Record<string, any>; onChange: (value: Record<string, any>) => void;
  saveDraft: () => Promise<boolean>;
}
export const MedicalCapabilityTools: React.FC<Props> = ({ capabilities, patientId, patient, appointmentId, value, onChange, saveDraft }) => {
  const [tool, setTool] = useState('');
  const [side, setSide] = useState<'right' | 'left' | 'midline'>('right');
  const [region, setRegion] = useState(0);
  const has = (cap: string) => capabilities.includes(cap);
  const update = (key: string, next: any) => onChange({ ...value, [key]: next });
  const tabs: Array<'pain' | 'adm' | 'strength' | 'tests' | 'palpation'> = [];
  if (has('PAIN_ASSESSMENT')) tabs.push('pain');
  if (has('MOBILITY_ASSESSMENT')) tabs.push('adm');
  if (has('MUSCLE_STRENGTH')) tabs.push('strength');
  if (has('FUNCTIONAL_TESTS') || has('FUNCTIONAL_ASSESSMENT')) tabs.push('tests');
  if (tabs.length) tabs.push('palpation');
  const regionalKey = regionalIds[region] + '_' + side;
  const updateRegional = (payload: any) => {
    const filtered = { ...payload };
    for (const [cap, field] of [['PAIN_ASSESSMENT', 'pain_json'], ['MOBILITY_ASSESSMENT', 'adm_json'], ['MUSCLE_STRENGTH', 'strength_json']]) if (!has(cap)) delete filtered[field];
    if (!has('FUNCTIONAL_TESTS') && !has('FUNCTIONAL_ASSESSMENT')) delete filtered.tests_json;
    delete filtered.functional_scales_json; delete filtered.plan_link_json;
    update('regional', { ...value.regional, [regionalKey]: filtered });
  };
  const button = (id: string, label: string) => <button key={id} type="button" onClick={() => setTool(tool === id ? '' : id)} className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 text-teal-700 bg-slate-50">{label}</button>;
  return <div className="space-y-4 border-t border-slate-100 pt-4">
    <div className="flex flex-wrap gap-2">
      {has('BODY_MAP') && button('body', 'Zemda360')}
      {(has('ANTHROPOMETRY') || has('BODY_COMPOSITION')) && button('anthro', has('BODY_COMPOSITION') ? 'Antropometria e composição corporal' : 'Antropometria')}
      {has('AUDIOLOGY') && button('audio', 'Audiologia')}
      {has('COMMUNICATION_ASSESSMENT') && button('voice', 'Comunicação e voz — IDV-10')}
      {has('CLINICAL_SCALES') && button('scales', 'Escalas clínicas')}
      {has('ADL_ASSESSMENT') && button('adl', 'AVD / AIVD')}
      {has('POSTURE_GAIT') && button('gait', 'Postura e marcha')}
      {!!tabs.length && button('regional', 'Avaliação regional')}
    </div>
    <Suspense fallback={<p className="text-xs text-slate-500">Carregando ferramenta...</p>}>
      {tool === 'body' && has('BODY_MAP') && <MedicalBodyMap value={value.zemda360} onSaved={assessmentId => update('zemda360', { assessmentId })} onClose={() => setTool('')} patientId={patientId} patientName={patient?.name} appointmentId={appointmentId} />}
      {tool === 'anthro' && (has('ANTHROPOMETRY') || has('BODY_COMPOSITION')) && <Anthropometry showBodyComposition={has('BODY_COMPOSITION')} initialDraft={value.anthropometry} onDraftChange={next => update('anthropometry', next)} measurementsOnly patientId={patientId} appointmentId={appointmentId} />}
      {tool === 'audio' && has('AUDIOLOGY') && <Audiology initialDraft={value.audiology} onDraftChange={next => update('audiology', next)} patientId={patientId} patient={patient} />}
      {tool === 'voice' && has('COMMUNICATION_ASSESSMENT') && <Voice initialDraft={value.voice} onDraftChange={next => update('voice', next)} patientId={patientId} appointmentId={appointmentId} />}
      {tool === 'gait' && has('POSTURE_GAIT') && <PostureGait postureAnterior={value.gait?.postureAnterior || ''} setPostureAnterior={next => update('gait', { ...value.gait, postureAnterior: next })} postureLateral={value.gait?.postureLateral || ''} setPostureLateral={next => update('gait', { ...value.gait, postureLateral: next })} posturePosterior={value.gait?.posturePosterior || ''} setPosturePosterior={next => update('gait', { ...value.gait, posturePosterior: next })} gaitAnalysis={value.gait?.gaitAnalysis || ''} setGaitAnalysis={next => update('gait', { ...value.gait, gaitAnalysis: next })} />}
      {tool === 'scales' && has('CLINICAL_SCALES') && <ClinicalScales scales={Array.isArray(value.scales) ? value.scales.filter((item: any) => item && typeof item === 'object') : []} setScales={next => update('scales', next)} />}
      {tool === 'adl' && has('ADL_ASSESSMENT') && <ADLAssessment adlItems={Array.isArray(value.adl) ? value.adl.filter((item: any) => item && typeof item === 'object') : emptyAdlItems()} setAdlItems={next => update('adl', next)} />}
      {tool === 'regional' && !!tabs.length && <div className="flex gap-3 items-center">
        <label className="text-xs font-bold">Região <select value={region} onChange={e => setRegion(Number(e.target.value))} className="p-2 rounded-xl border border-slate-200">{regions.map((label, i) => <option key={label} value={i}>{label}</option>)}</select></label>
        <label className="text-xs font-bold">Lado <select value={side} onChange={e => setSide(e.target.value as typeof side)} className="p-2 rounded-xl border border-slate-200"><option value="right">Direito</option><option value="left">Esquerdo</option><option value="midline">Linha média</option></select></label>
        {button('regional-open', 'Abrir avaliação')}
      </div>}
      {tool === 'regional-open' && !!tabs.length && <Regional key={regionalKey} title="Avaliação clínica regional" isOpen clinicalDetails lockSide side={side} allowedTabs={tabs} onClose={() => setTool('regional')} patientId={patientId} patientName={patient?.name || ''} appointmentId={appointmentId} regionId={regionalKey} regionLabel={regions[region]}
        initialData={value.regional?.[regionalKey] || { pain_json: {}, adm_json: [], strength_json: [], tests_json: [], palpation_json: {}, edema_json: {}, functional_scales_json: [], plan_link_json: {} }}
        onDraftChange={updateRegional} onSavePayload={async payload => { if (!await saveDraft()) throw new Error('Não foi possível salvar o rascunho. Tente novamente.'); return payload; }} onSaved={() => {}} />}
    </Suspense>
  </div>;
};
