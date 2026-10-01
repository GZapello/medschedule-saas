import { ClinicalBooleanSelect } from '../clinical/ClinicalBooleanSelect';
import { ClinicalScales } from '../clinical/ClinicalScales';
import React, { useState, useEffect } from 'react';
import {
  X,
  AlertCircle,
  Activity,
  Dumbbell,
  Award,
  Sparkles,
  Save,
  Plus,
  Trash2,
  Calendar,
  User,
  HeartPulse,
  Info
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  PhysioRegionalEvaluation,
  PhysioPainAssessment,
  PhysioAdmItem,
  PhysioStrengthItem,
  PhysioSpecialTestItem,
  PhysioPalpationAssessment,
  PhysioEdemaAssessment,
  PhysioFunctionalScaleItem,
  PhysioPlanLink,
  getJointConfigForRegion,
  detectSideFromRegionId,
  formatLaterality
} from './regionalData';

interface RegionalPhysioAssessmentModalProps {
  lockSide?: boolean;
  clinicalDetails?: boolean;
  allowedTabs?: Array<'pain' | 'adm' | 'strength' | 'tests' | 'palpation' | 'plan'>;
  title?: string;
  onDraftChange?: (payload: Record<string, any>) => void;
  onSavePayload?: (payload: Record<string, any>) => Promise<any>;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (evaluation: PhysioRegionalEvaluation) => void;
  patientId: string;
  patientName: string;
  appointmentId?: string;
  regionId: string;
  regionLabel: string;
  side?: 'right' | 'left' | 'midline';
  initialData?: PhysioRegionalEvaluation | null;
}

export const RegionalPhysioAssessmentModal: React.FC<RegionalPhysioAssessmentModalProps> = ({
  lockSide = false, clinicalDetails = false, allowedTabs, title = 'Avaliação Fisioterapêutica da Região', onDraftChange, onSavePayload,
  isOpen,
  onClose,
  onSaved,
  patientId,
  patientName,
  appointmentId,
  regionId,
  regionLabel,
  side: initialSide,
  initialData
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'pain' | 'adm' | 'strength' | 'tests' | 'palpation' | 'plan'>(allowedTabs?.[0] || 'pain');
  const [saving, setSaving] = useState(false);

  // Metadados básicos
  const effectiveSide = initialSide || detectSideFromRegionId(regionId);
  const [side, setSide] = useState<'right' | 'left' | 'midline'>(effectiveSide);
  const [evaluationDate, setEvaluationDate] = useState<string>(
    initialData?.evaluation_date || new Date().toISOString().split('T')[0]
  );

  // Helpers seguros de parsing
  const parseJsonObjSafe = <T,>(val: any, fallback: T): T => {
    if (!val) return fallback;
    try {
      const parsed = typeof val === 'string' ? JSON.parse(val) : val;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as T) : fallback;
    } catch {
      return fallback;
    }
  };

  const parseJsonArrSafe = <T,>(val: any, fallback: T[]): T[] => {
    if (!val) return fallback;
    try {
      const parsed = typeof val === 'string' ? JSON.parse(val) : val;
      return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as T[] : fallback;
    } catch {
      return fallback;
    }
  };

  // 1. Dor
  const initialPain: PhysioPainAssessment = parseJsonObjSafe<PhysioPainAssessment>(
    initialData?.pain_json,
    {}
  );

  const [pain, setPain] = useState<PhysioPainAssessment>(initialPain);

  // 2. ADM / Goniometria
  const jointConfig = getJointConfigForRegion(regionId);
  const defaultAdmItems: PhysioAdmItem[] = jointConfig.defaultMovements.map(m => ({
    movement: m.movement,
    normalRange: m.normalRange,
    activeRom: '',
    passiveRom: '',
    painPresent: undefined,
    notes: ''
  }));

  const initialAdm: PhysioAdmItem[] = parseJsonArrSafe<PhysioAdmItem>(initialData?.adm_json, defaultAdmItems);

  const [admList, setAdmList] = useState<PhysioAdmItem[]>(initialAdm);

  // 3. Força Muscular
  const defaultStrengthItems: PhysioStrengthItem[] = jointConfig.defaultMovements.map(m => ({
    movementOrMuscle: m.movement,
    grade: '',
    notes: ''
  }));

  const initialStrength: PhysioStrengthItem[] = parseJsonArrSafe<PhysioStrengthItem>(initialData?.strength_json, defaultStrengthItems);

  const [strengthList, setStrengthList] = useState<PhysioStrengthItem[]>(initialStrength);

  // 4. Testes Especiais
  const defaultTests: PhysioSpecialTestItem[] = jointConfig.specialTests.map(t => ({
    testName: t.name,
    targetStructure: t.target,
    result: 'not_tested',
    notes: ''
  }));

  const initialTests: PhysioSpecialTestItem[] = parseJsonArrSafe<PhysioSpecialTestItem>(initialData?.tests_json, defaultTests);

  const [specialTests, setSpecialTests] = useState<PhysioSpecialTestItem[]>(initialTests);

  // 5. Palpação & Edema
  const initialPalpation: PhysioPalpationAssessment = parseJsonObjSafe<PhysioPalpationAssessment>(
    initialData?.palpation_json,
    {}
  );

  const [palpation, setPalpation] = useState<PhysioPalpationAssessment>(initialPalpation);

  const initialEdema: PhysioEdemaAssessment = parseJsonObjSafe<PhysioEdemaAssessment>(
    initialData?.edema_json,
    {}
  );

  const [edema, setEdema] = useState<PhysioEdemaAssessment>(initialEdema);

  // 6. Escalas Funcionais & Metas / Home Exercises
  const initialScales: PhysioFunctionalScaleItem[] = parseJsonArrSafe<PhysioFunctionalScaleItem>(
    initialData?.functional_scales_json,
    [{ scaleName: jointConfig.suggestedScales[0] || 'Escala EVA', score: '', interpretation: '' }]
  );

  const [scales, setScales] = useState<PhysioFunctionalScaleItem[]>(initialScales);

  const initialPlan: PhysioPlanLink = parseJsonObjSafe<PhysioPlanLink>(
    initialData?.plan_link_json,
    { goal: '', homeExercises: '', reassessmentDate: '' }
  );

  const [plan, setPlan] = useState<PhysioPlanLink>(initialPlan);
  const [inspection, setInspection] = useState<string>((initialData as any)?.inspection || '');
  const [stability, setStability] = useState<string>((initialData as any)?.stability || '');
  const [generalNotes, setGeneralNotes] = useState<string>(initialData?.notes || '');

  const draftChangeRef = React.useRef(onDraftChange);
  draftChangeRef.current = onDraftChange;
  useEffect(() => {
    draftChangeRef.current?.({ patient_id: patientId, appointment_id: appointmentId || null, region_id: regionId, region_label: regionLabel, side, evaluation_date: evaluationDate, pain_json: pain, adm_json: admList, strength_json: strengthList, tests_json: specialTests, palpation_json: palpation, edema_json: edema, functional_scales_json: scales, plan_link_json: plan, notes: generalNotes, ...(clinicalDetails ? { inspection, stability } : {}) });
  }, [patientId, appointmentId, regionId, regionLabel, side, evaluationDate, pain, admList, strengthList, specialTests, palpation, edema, scales, plan, generalNotes, inspection, stability, clinicalDetails]);
  if (!isOpen) return null;

  const handleSave = async () => {
    try {
      setSaving(true);

      const payload = {
        patient_id: patientId,
        appointment_id: appointmentId || null,
        region_id: regionId,
        region_label: regionLabel,
        side,
        evaluation_date: evaluationDate,
        pain_json: pain,
        adm_json: admList,
        strength_json: strengthList,
        tests_json: specialTests,
        palpation_json: palpation,
        edema_json: edema,
        functional_scales_json: scales,
        plan_link_json: plan,
        notes: generalNotes,
        ...(clinicalDetails ? { inspection, stability } : {})
      };

      const res = onSavePayload ? await onSavePayload(payload) : await ApiClient.post<any>('/v1/physiotherapy/regional-evaluations', payload);
      const saved = res.data || res;
      showToast(`Avaliação regional de "${regionLabel}" salva com sucesso!`, 'success');
      onSaved(saved);
      onClose();
    } catch (err: any) {
      console.error('Erro ao salvar avaliação regional:', err);
      showToast(err.message || 'Erro ao registrar avaliação regional', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
        
        {/* Cabeçalho do Modal */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-teal-100 text-teal-700">
                <HeartPulse className="w-5 h-5" />
              </span>
              <h2 className="text-base font-extrabold text-slate-800">
                {title}
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200">
                {regionLabel}
              </span>
              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-200/70 text-slate-700">
                {formatLaterality(side)}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-3">
              <span className="flex items-center gap-1 font-medium text-slate-700">
                <User className="w-3.5 h-3.5 text-slate-400" /> Paciente: {patientName}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" /> Data: {evaluationDate}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              disabled={lockSide}
              value={side}
              onChange={e => setSide(e.target.value as any)}
              className="text-xs font-semibold px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
            ><option value="">Selecione / não avaliado</option>
              <option value="right">Lado Direito</option>
              <option value="left">Lado Esquerdo</option>
              <option value="midline">Linha Média / Central</option>
            </select>
            <input
              type="date"
              value={evaluationDate}
              onChange={e => setEvaluationDate(e.target.value)}
              className="text-xs px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
            />
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Abas Internas da Avaliação Regional */}
        <div className="flex border-b border-slate-200 px-6 bg-slate-50/40 gap-1 overflow-x-auto text-xs font-bold">
          <button
            hidden={!!allowedTabs && !allowedTabs.includes('pain')}
            onClick={() => setActiveTab('pain')}
            className={`py-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'pain'
                ? 'border-rose-600 text-rose-700 bg-rose-50/50'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <AlertCircle className="w-4 h-4 text-rose-500" /> Dor (EVA: {pain.score === undefined ? 'Não avaliado' : pain.score + '/10'})
          </button>

          <button
            hidden={!!allowedTabs && !allowedTabs.includes('adm')}
            onClick={() => setActiveTab('adm')}
            className={`py-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'adm'
                ? 'border-teal-600 text-teal-700 bg-teal-50/50'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="w-4 h-4 text-teal-500" /> ADM / Goniometria
          </button>

          <button
            hidden={!!allowedTabs && !allowedTabs.includes('strength')}
            onClick={() => setActiveTab('strength')}
            className={`py-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'strength'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Dumbbell className="w-4 h-4 text-indigo-500" /> Força (MRC/Oxford)
          </button>

          <button
            hidden={!!allowedTabs && !allowedTabs.includes('tests')}
            onClick={() => setActiveTab('tests')}
            className={`py-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'tests'
                ? 'border-amber-600 text-amber-700 bg-amber-50/50'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Award className="w-4 h-4 text-amber-500" /> Testes Clínicos ({specialTests.filter(t => t.result !== 'not_tested').length})
          </button>

          <button
            hidden={!!allowedTabs && !allowedTabs.includes('palpation')}
            onClick={() => setActiveTab('palpation')}
            className={`py-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'palpation'
                ? 'border-cyan-600 text-cyan-700 bg-cyan-50/50'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-4 h-4 text-cyan-500" /> Palpação & Edema
          </button>

          <button
            hidden={!!allowedTabs && !allowedTabs.includes('plan')}
            onClick={() => setActiveTab('plan')}
            className={`py-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'plan'
                ? 'border-purple-600 text-purple-700 bg-purple-50/50'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-4 h-4 text-purple-500" /> Escalas, Metas & Exercícios
          </button>
        </div>

        {/* Conteúdo da Aba */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-slate-800">
          
          {/* TAB 1: DOR (EVA) */}
          {activeTab === 'pain' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="p-4 bg-rose-50/60 border border-rose-100 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-600" /> Escala Visual Analógica (EVA Geral):
                  </span>
                  <span className="text-lg font-black text-rose-700">{pain.score === undefined ? 'Não avaliado' : pain.score + ' / 10'}</span>
                </div>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={pain.score ?? ''}
                  onChange={e => setPain({ ...pain, score: e.target.value === '' ? undefined : Number(e.target.value) })}
                  className="w-full p-2 border border-slate-200 rounded-lg"
                />
                <div className="flex justify-between text-[11px] text-slate-500 font-semibold">
                  <span>0: Sem dor</span>
                  <span>3: Leve</span>
                  <span>5: Moderada</span>
                  <span>8: Intensa</span>
                  <span>10: Insuportável</span>
                </div>
              </div>

              {/* Sub-escores: Repouso, Movimento e Palpação */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                    <span>Em Repouso:</span>
                    <span className="text-rose-600 font-black">{pain.restScore === undefined ? 'Não avaliado' : pain.restScore + ' / 10'}</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={pain.restScore ?? ''}
                    onChange={e => setPain({ ...pain, restScore: e.target.value === '' ? undefined : Number(e.target.value) })}
                    className="w-full accent-rose-500 cursor-pointer"
                  />
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                    <span>Ao Movimento:</span>
                    <span className="text-rose-600 font-black">{pain.movementScore === undefined ? 'Não avaliado' : pain.movementScore + ' / 10'}</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={pain.movementScore ?? ''}
                    onChange={e => setPain({ ...pain, movementScore: e.target.value === '' ? undefined : Number(e.target.value) })}
                    className="w-full accent-rose-500 cursor-pointer"
                  />
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                    <span>À Palpação:</span>
                    <span className="text-rose-600 font-black">{pain.palpationScore === undefined ? 'Não avaliado' : pain.palpationScore + ' / 10'}</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={pain.palpationScore ?? ''}
                    onChange={e => setPain({ ...pain, palpationScore: e.target.value === '' ? undefined : Number(e.target.value) })}
                    className="w-full accent-rose-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Características e Duração */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Características da Dor</label>
                  <input
                    type="text"
                    value={pain.characteristics || ''}
                    onChange={e => setPain({ ...pain, characteristics: e.target.value })}
                    placeholder="Ex: Pontada, queimação, peso, latejante, irradiada..."
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500"
                  />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {['Pontada', 'Queimação', 'Latejante', 'Peso', 'Choque', 'Difusa'].map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          const curr = pain.characteristics || '';
                          const next = curr ? `${curr}, ${tag}` : tag;
                          setPain({ ...pain, characteristics: next });
                        }}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Duração / Fase Clínica</label>
                  <select
                    value={pain.duration || ''}
                    onChange={e => setPain({ ...pain, duration: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
                  ><option value="">Não avaliado</option>
                    <option value="Aguda (< 3 semanas)">Aguda (&lt; 3 semanas)</option>
                    <option value="Subaguda (3-12 semanas)">Subaguda (3 a 12 semanas)</option>
                    <option value="Crônica (> 3 meses)">Crônica (&gt; 3 meses)</option>
                    <option value="Recorrente / Agudizada">Recorrente / Agudizada</option>
                  </select>
                </div>
              </div>

              {/* Fatores de Piora e Melhora */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Fatores de Piora</label>
                  <input
                    type="text"
                    value={pain.aggravatingFactors || ''}
                    onChange={e => setPain({ ...pain, aggravatingFactors: e.target.value })}
                    placeholder="Ex: Elevação do membro, ortostatismo prolongado, carga..."
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Fatores de Melhora</label>
                  <input
                    type="text"
                    value={pain.relievingFactors || ''}
                    onChange={e => setPain({ ...pain, relievingFactors: e.target.value })}
                    placeholder="Ex: Repouso, crioterapia, compressas mornas, medicação..."
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Notas Clínicas da Dor</label>
                <textarea
                  rows={2}
                  value={pain.notes || ''}
                  onChange={e => setPain({ ...pain, notes: e.target.value })}
                  placeholder="Observações complementares sobre o comportamento da dor nesta região..."
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                />
              </div>
            </div>
          )}

          {/* TAB 2: ADM / GONIOMETRIA */}
          {activeTab === 'adm' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-800">Goniometria Regional ({jointConfig.jointName})</h3>
                  <p className="text-[11px] text-slate-500">
                    Aferição estruturada em graus (°) da amplitude ativa e passiva com registro de dor articular.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAdmList([
                      ...admList,
                      { movement: 'Novo Movimento', normalRange: '—', activeRom: '', passiveRom: '', painPresent: undefined }
                    ]);
                  }}
                  className="flex items-center gap-1 text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-1.5 rounded-lg border border-teal-200 hover:bg-teal-100"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar Movimento
                </button>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Movimento</th>
                      <th className="py-2.5 px-3">Valor de Ref.</th>
                      <th className="py-2.5 px-3 w-28">ADM Ativa (°)</th>
                      <th className="py-2.5 px-3 w-28">ADM Passiva (°)</th>
                      <th className="py-2.5 px-3 w-24">Dor?</th>
                      <th className="py-2.5 px-3">Observações / Déficit</th>
                      <th className="py-2.5 px-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {admList.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-semibold text-slate-800">
                          <input
                            type="text"
                            value={item.movement}
                            onChange={e => {
                              const updated = [...admList];
                              updated[idx].movement = e.target.value;
                              setAdmList(updated);
                            }}
                            className="w-full bg-transparent font-semibold border-b border-transparent focus:border-teal-500 outline-none"
                          />
                        </td>
                        <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">
                          {item.normalRange}
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            value={item.activeRom ?? ''}
                            onChange={e => {
                              const updated = [...admList];
                              updated[idx].activeRom = e.target.value === '' ? '' : parseFloat(e.target.value);
                              setAdmList(updated);
                            }}
                            placeholder="Ex: 140"
                            className="w-full px-2 py-1 rounded border border-slate-200 font-mono text-center focus:border-teal-500"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            value={item.passiveRom ?? ''}
                            onChange={e => {
                              const updated = [...admList];
                              updated[idx].passiveRom = e.target.value === '' ? '' : parseFloat(e.target.value);
                              setAdmList(updated);
                            }}
                            placeholder="Ex: 155"
                            className="w-full px-2 py-1 rounded border border-slate-200 font-mono text-center focus:border-teal-500"
                          />
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              const updated = [...admList];
                              updated[idx].painPresent = !updated[idx].painPresent;
                              setAdmList(updated);
                            }}
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              item.painPresent
                                ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {item.painPresent ? 'Sim (Dor)' : 'Não'}
                          </button>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={item.notes || ''}
                            onChange={e => {
                              const updated = [...admList];
                              updated[idx].notes = e.target.value;
                              setAdmList(updated);
                            }}
                            placeholder="Ex: Sensação final firme, crepitação..."
                            className="w-full px-2 py-1 rounded border border-slate-200 text-xs"
                          />
                        </td>
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => setAdmList(admList.filter((_, i) => i !== idx))}
                            className="text-slate-300 hover:text-rose-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: FORÇA MUSCULAR (MRC / OXFORD) */}
          {activeTab === 'strength' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl text-xs space-y-1">
                <span className="font-bold text-indigo-900 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-indigo-600" /> Escala de Força Muscular MRC / Oxford:
                </span>
                <p className="text-[11px] text-indigo-700">
                  <strong>0:</strong> Nenhuma contração | <strong>1:</strong> Esboço visível/palpável | <strong>2:</strong> Movimento sem gravidade | <strong>3:</strong> Vence a gravidade | <strong>4:</strong> Vence gravidade + resistência moderada | <strong>5:</strong> Força normal.
                </p>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Grupo Muscular / Ação</th>
                      <th className="py-2.5 px-3 w-44">Grau de Força (MRC)</th>
                      <th className="py-2.5 px-3">Observações Clínicas</th>
                      <th className="py-2.5 px-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {strengthList.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-semibold text-slate-800">
                          <input
                            type="text"
                            value={item.movementOrMuscle}
                            onChange={e => {
                              const updated = [...strengthList];
                              updated[idx].movementOrMuscle = e.target.value;
                              setStrengthList(updated);
                            }}
                            className="w-full bg-transparent font-semibold border-b border-transparent focus:border-indigo-500 outline-none"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <select
                            value={item.grade}
                            onChange={e => {
                              const updated = [...strengthList];
                              updated[idx].grade = e.target.value;
                              setStrengthList(updated);
                            }}
                            className="w-full px-2 py-1 rounded border border-slate-200 font-bold bg-white focus:border-indigo-500"
                          ><option value="">Não avaliado</option>
                            <option value="5">Grau 5 (Normal - 100%)</option>
                            <option value="4+">Grau 4+ (Resistência quase total)</option>
                            <option value="4">Grau 4 (Resistência moderada)</option>
                            <option value="4-">Grau 4- (Resistência mínima)</option>
                            <option value="3">Grau 3 (Vence gravidade)</option>
                            <option value="2">Grau 2 (Elimina gravidade)</option>
                            <option value="1">Grau 1 (Vestígio contrátil)</option>
                            <option value="0">Grau 0 (Nenhuma contração)</option>
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={item.notes || ''}
                            onChange={e => {
                              const updated = [...strengthList];
                              updated[idx].notes = e.target.value;
                              setStrengthList(updated);
                            }}
                            placeholder="Ex: Fadiga precoce, inibição dolorosa reflexa..."
                            className="w-full px-2 py-1 rounded border border-slate-200 text-xs"
                          />
                        </td>
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => setStrengthList(strengthList.filter((_, i) => i !== idx))}
                            className="text-slate-300 hover:text-rose-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={() => {
                  setStrengthList([
                    ...strengthList,
                    { movementOrMuscle: 'Novo Grupo Muscular', grade: '', notes: '' }
                  ]);
                }}
                className="flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-200 hover:bg-indigo-100"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar Grupo Muscular
              </button>
            </div>
          )}

          {/* TAB 4: TESTES ESPECIAIS / ORTOPÉDICOS */}
          {activeTab === 'tests' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-800">Testes Especiais & Ortopédicos Recomendados</h3>
                  <p className="text-[11px] text-slate-500">
                    Manobras de provocação e testes específicos para estruturas da região de {jointConfig.jointName}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSpecialTests([
                      ...specialTests,
                      { testName: 'Novo Teste Especial', targetStructure: 'Estrutura avaliada', result: 'not_tested' }
                    ]);
                  }}
                  className="flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200 hover:bg-amber-100"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar Teste Especial
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {specialTests.map((t, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-xl border transition-all ${
                      t.result === 'positive'
                        ? 'bg-rose-50/50 border-rose-200'
                        : t.result === 'negative'
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className="text-xs font-bold text-slate-800">{t.testName}</span>
                        {t.targetStructure && (
                          <p className="text-[10px] text-slate-400 font-medium">Alvo: {t.targetStructure}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSpecialTests(specialTests.filter((_, i) => i !== idx))}
                        className="text-slate-300 hover:text-rose-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Botões de resultado */}
                    <div className="grid grid-cols-4 gap-1 mb-2">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...specialTests];
                          updated[idx].result = 'positive';
                          setSpecialTests(updated);
                        }}
                        className={`py-1 text-[11px] font-extrabold rounded-md transition-all ${
                          t.result === 'positive'
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-rose-100'
                        }`}
                      >
                        Positivo (+)
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...specialTests];
                          updated[idx].result = 'negative';
                          setSpecialTests(updated);
                        }}
                        className={`py-1 text-[11px] font-extrabold rounded-md transition-all ${
                          t.result === 'negative'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-emerald-100'
                        }`}
                      >
                        Negativo (-)
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...specialTests];
                          updated[idx].result = 'inconclusive';
                          setSpecialTests(updated);
                        }}
                        className={`py-1 text-[11px] font-bold rounded-md transition-all ${
                          t.result === 'inconclusive'
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-amber-100'
                        }`}
                      >
                        Dúvida (?)
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...specialTests];
                          updated[idx].result = 'not_tested';
                          setSpecialTests(updated);
                        }}
                        className={`py-1 text-[11px] font-medium rounded-md transition-all ${
                          t.result === 'not_tested'
                            ? 'bg-slate-300 text-slate-800'
                            : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                        }`}
                      >
                        N/A
                      </button>
                    </div>

                    <input
                      type="text"
                      value={t.notes || ''}
                      onChange={e => {
                        const updated = [...specialTests];
                        updated[idx].notes = e.target.value;
                        setSpecialTests(updated);
                      }}
                      placeholder="Achados clínicos específicos..."
                      className="w-full px-2 py-1 text-[11px] rounded border border-slate-200 bg-white"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: PALPAÇÃO & EDEMA */}
          {activeTab === 'palpation' && (
            <div className="space-y-5 animate-in fade-in">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Tônus Muscular */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <h4 className="text-xs font-bold text-slate-800">Tônus Muscular & Espasmo</h4>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Estado de Tensão:</label>
                    <select
                      value={palpation.muscleTone || ''}
                      onChange={e => setPalpation({ ...palpation, muscleTone: e.target.value as any })}
                      className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white font-semibold"
                    ><option value="">Não avaliado</option>
                      <option value="normal">Normotonia (Normal)</option>
                      <option value="hypertonic">Hipertonia / Tensão aumentada</option>
                      <option value="spasm">Espasmo muscular ativo</option>
                      <option value="hypotonic">Hipotonia</option>
                    </select>
                  </div>

                  <div className="pt-2 border-t border-slate-200">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                      <ClinicalBooleanSelect value={palpation.triggerPoints} onChange={value => setPalpation({ ...palpation, triggerPoints: value })} />
                      Presença de Pontos-Gatilho (Trigger Points)
                    </label>
                    {palpation.triggerPoints && (
                      <input
                        type="text"
                        value={palpation.triggerPointLocations || ''}
                        onChange={e => setPalpation({ ...palpation, triggerPointLocations: e.target.value })}
                        placeholder="Descreva as bandas tensas / nós (ex: ventre do trapézio)"
                        className="w-full text-xs p-2 mt-2 rounded-lg border border-slate-200"
                      />
                    )}
                  </div>
                </div>

                {/* Sensibilidade e Temperatura */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <h4 className="text-xs font-bold text-slate-800">Sensibilidade & Temperatura</h4>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Sensibilidade à Palpação:</label>
                    <select
                      value={palpation.tenderness || ''}
                      onChange={e => setPalpation({ ...palpation, tenderness: e.target.value as any })}
                      className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white"
                    ><option value="">Não avaliado</option>
                      <option value="none">Ausente (Indolor)</option>
                      <option value="mild">Leve</option>
                      <option value="moderate">Moderada</option>
                      <option value="severe">Severa / Sinal do Pulo</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Temperatura Local:</label>
                    <select
                      value={palpation.localTemperature || ''}
                      onChange={e => setPalpation({ ...palpation, localTemperature: e.target.value as any })}
                      className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white"
                    ><option value="">Não avaliado</option>
                      <option value="normal">Normal / Isotérmico</option>
                      <option value="increased">Aumentada (Sinal flogístico / Calor local)</option>
                      <option value="decreased">Diminuída (Hipotermia local)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Edema & Perimetria */}
              <div className="p-4 bg-cyan-50/50 rounded-xl border border-cyan-100 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-cyan-900 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-cyan-600" /> Edema & Perimetria Articular
                  </h4>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                    <ClinicalBooleanSelect value={edema.present} onChange={value => setEdema({ ...edema, present: value })} />
                    Presença de Edema / Derrame Articular
                  </label>
                </div>

                {edema.present && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-cyan-200/60">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Sinal de Godet / Cacifo:
                      </label>
                      <select
                        value={edema.godetScale || ''}
                        onChange={e => setEdema({ ...edema, godetScale: e.target.value as any })}
                        className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white"
                      ><option value="">Não avaliado</option>
                        <option value="0">0 (Sem cacifo persistente)</option>
                        <option value="1+">1+ (Depressão leve ~2mm com retorno imediato)</option>
                        <option value="2+">2+ (Depressão ~4mm com retorno em 15s)</option>
                        <option value="3+">3+ (Depressão ~6mm com retorno em 1 min)</option>
                        <option value="4+">4+ (Depressão severa &gt;8mm com retorno &gt;2 min)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Perimetria Articular / Medida em cm:
                      </label>
                      <input
                        type="text"
                        value={edema.perimetryCm || ''}
                        onChange={e => setEdema({ ...edema, perimetryCm: e.target.value })}
                        placeholder="Ex: 38.5 cm (comparar com contralateral)"
                        className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: ESCALAS, METAS & EXERCÍCIOS EM CASA */}
          {activeTab === 'plan' && (
            <div className="space-y-5 animate-in fade-in">
              {/* Escalas Funcionais */}
              <ClinicalScales scales={scales} setScales={setScales} />

              {/* Vínculo com Metas e Exercícios em Casa */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Meta Terapêutica Específica desta Região
                  </label>
                  <textarea
                    rows={3}
                    value={plan.goal || ''}
                    onChange={e => setPlan({ ...plan, goal: e.target.value })}
                    placeholder="Ex: Reduzir dor EVA para <= 3 em repouso e alcançar 150° de abdução ativa sem compensação em 4 semanas..."
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Prescrição de Exercícios Domiciliares (Home Exercises)
                  </label>
                  <textarea
                    rows={3}
                    value={plan.homeExercises || ''}
                    onChange={e => setPlan({ ...plan, homeExercises: e.target.value })}
                    placeholder="Ex: Pêndulo de Codman 2x/dia, alongamento em rotação externa com bastão 3x30s, gelo pós-exercício 15 min..."
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Próxima Reavaliação Prevista
                  </label>
                  <input
                    type="date"
                    value={plan.reassessmentDate || ''}
                    onChange={e => setPlan({ ...plan, reassessmentDate: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Observações Gerais da Região
                  </label>
                  <input
                    type="text"
                    value={generalNotes}
                    onChange={e => setGeneralNotes(e.target.value)}
                    placeholder="Notas complementares de conduta..."
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                  />
                </div>
              </div>
            </div>
          )}

        </div>

        {clinicalDetails && <div className="px-6 py-3 grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-slate-100">
          <label className="text-xs font-bold">Inspeção<textarea className="w-full p-2 text-xs border rounded-xl" value={inspection} onChange={e => setInspection(e.target.value)} /></label>
          <label className="text-xs font-bold">Estabilidade<textarea className="w-full p-2 text-xs border rounded-xl" value={stability} onChange={e => setStability(e.target.value)} /></label>
          <label className="text-xs font-bold">Observações<textarea className="w-full p-2 text-xs border rounded-xl" value={generalNotes} onChange={e => setGeneralNotes(e.target.value)} /></label>
        </div>}
        {/* Rodapé com Ações */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Região selecionada: <strong className="text-slate-700">{regionLabel} ({formatLaterality(side)})</strong>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-all"
            >
              {onDraftChange ? 'Fechar' : 'Cancelar'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2 text-xs font-extrabold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Gravando...' : 'Salvar Avaliação Regional'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
