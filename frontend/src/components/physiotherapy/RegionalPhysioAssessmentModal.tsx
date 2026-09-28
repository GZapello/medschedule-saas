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
  const [activeTab, setActiveTab] = useState<'pain' | 'adm' | 'strength' | 'tests' | 'palpation' | 'plan'>('pain');
  const [saving, setSaving] = useState(false);

  // Metadados básicos
  const effectiveSide = initialSide || detectSideFromRegionId(regionId);
  const [side, setSide] = useState<'right' | 'left' | 'midline'>(effectiveSide);
  const [evaluationDate, setEvaluationDate] = useState<string>(
    initialData?.evaluation_date || new Date().toISOString().split('T')[0]
  );

  // 1. Dor
  const initialPain: PhysioPainAssessment = initialData?.pain_json
    ? (typeof initialData.pain_json === 'string' ? JSON.parse(initialData.pain_json) : initialData.pain_json)
    : { score: 5, restScore: 2, movementScore: 6, palpationScore: 4, duration: 'Subaguda (3-12 sem)' };

  const [pain, setPain] = useState<PhysioPainAssessment>(initialPain);

  // 2. ADM / Goniometria
  const jointConfig = getJointConfigForRegion(regionId);
  const defaultAdmItems: PhysioAdmItem[] = jointConfig.defaultMovements.map(m => ({
    movement: m.movement,
    normalRange: m.normalRange,
    activeRom: '',
    passiveRom: '',
    painPresent: false,
    notes: ''
  }));

  const initialAdm: PhysioAdmItem[] = initialData?.adm_json
    ? (typeof initialData.adm_json === 'string' ? JSON.parse(initialData.adm_json) : initialData.adm_json)
    : defaultAdmItems;

  const [admList, setAdmList] = useState<PhysioAdmItem[]>(initialAdm);

  // 3. Força Muscular
  const defaultStrengthItems: PhysioStrengthItem[] = jointConfig.defaultMovements.map(m => ({
    movementOrMuscle: m.movement,
    grade: '5',
    notes: ''
  }));

  const initialStrength: PhysioStrengthItem[] = initialData?.strength_json
    ? (typeof initialData.strength_json === 'string' ? JSON.parse(initialData.strength_json) : initialData.strength_json)
    : defaultStrengthItems;

  const [strengthList, setStrengthList] = useState<PhysioStrengthItem[]>(initialStrength);

  // 4. Testes Especiais
  const defaultTests: PhysioSpecialTestItem[] = jointConfig.specialTests.map(t => ({
    testName: t.name,
    targetStructure: t.target,
    result: 'not_tested',
    notes: ''
  }));

  const initialTests: PhysioSpecialTestItem[] = initialData?.tests_json
    ? (typeof initialData.tests_json === 'string' ? JSON.parse(initialData.tests_json) : initialData.tests_json)
    : defaultTests;

  const [specialTests, setSpecialTests] = useState<PhysioSpecialTestItem[]>(initialTests);

  // 5. Palpação & Edema
  const initialPalpation: PhysioPalpationAssessment = initialData?.palpation_json
    ? (typeof initialData.palpation_json === 'string' ? JSON.parse(initialData.palpation_json) : initialData.palpation_json)
    : { muscleTone: 'normal', triggerPoints: false, tenderness: 'mild', localTemperature: 'normal' };

  const [palpation, setPalpation] = useState<PhysioPalpationAssessment>(initialPalpation);

  const initialEdema: PhysioEdemaAssessment = initialData?.edema_json
    ? (typeof initialData.edema_json === 'string' ? JSON.parse(initialData.edema_json) : initialData.edema_json)
    : { present: false, godetScale: '0', perimetryCm: '' };

  const [edema, setEdema] = useState<PhysioEdemaAssessment>(initialEdema);

  // 6. Escalas Funcionais & Metas / Home Exercises
  const initialScales: PhysioFunctionalScaleItem[] = initialData?.functional_scales_json
    ? (typeof initialData.functional_scales_json === 'string' ? JSON.parse(initialData.functional_scales_json) : initialData.functional_scales_json)
    : [{ scaleName: jointConfig.suggestedScales[0] || 'Escala EVA', score: '', interpretation: '' }];

  const [scales, setScales] = useState<PhysioFunctionalScaleItem[]>(initialScales);

  const initialPlan: PhysioPlanLink = initialData?.plan_link_json
    ? (typeof initialData.plan_link_json === 'string' ? JSON.parse(initialData.plan_link_json) : initialData.plan_link_json)
    : { goal: '', homeExercises: '', reassessmentDate: '' };

  const [plan, setPlan] = useState<PhysioPlanLink>(initialPlan);
  const [generalNotes, setGeneralNotes] = useState<string>(initialData?.notes || '');

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
        notes: generalNotes
      };

      const res = await ApiClient.post<any>('/v1/physiotherapy/regional-evaluations', payload);
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
                Avaliação Fisioterapêutica da Região
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
              value={side}
              onChange={e => setSide(e.target.value as any)}
              className="text-xs font-semibold px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
            >
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
            onClick={() => setActiveTab('pain')}
            className={`py-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'pain'
                ? 'border-rose-600 text-rose-700 bg-rose-50/50'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <AlertCircle className="w-4 h-4 text-rose-500" /> Dor (EVA: {pain.score}/10)
          </button>

          <button
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
                  <span className="text-lg font-black text-rose-700">{pain.score} / 10</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={pain.score}
                  onChange={e => setPain({ ...pain, score: parseInt(e.target.value) })}
                  className="w-full accent-rose-600 cursor-pointer h-2 bg-rose-200 rounded-lg"
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
                    <span className="text-rose-600 font-black">{pain.restScore ?? 0} / 10</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    value={pain.restScore ?? 0}
                    onChange={e => setPain({ ...pain, restScore: parseInt(e.target.value) })}
                    className="w-full accent-rose-500 cursor-pointer"
                  />
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                    <span>Ao Movimento:</span>
                    <span className="text-rose-600 font-black">{pain.movementScore ?? 0} / 10</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    value={pain.movementScore ?? 0}
                    onChange={e => setPain({ ...pain, movementScore: parseInt(e.target.value) })}
                    className="w-full accent-rose-500 cursor-pointer"
                  />
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                    <span>À Palpação:</span>
                    <span className="text-rose-600 font-black">{pain.palpationScore ?? 0} / 10</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    value={pain.palpationScore ?? 0}
                    onChange={e => setPain({ ...pain, palpationScore: parseInt(e.target.value) })}
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
                    value={pain.duration || 'Subaguda (3-12 sem)'}
                    onChange={e => setPain({ ...pain, duration: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
                  >
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
                      { movement: 'Novo Movimento', normalRange: '—', activeRom: '', passiveRom: '', painPresent: false }
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
                          >
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
                    { movementOrMuscle: 'Novo Grupo Muscular', grade: '5', notes: '' }
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
                      value={palpation.muscleTone || 'normal'}
                      onChange={e => setPalpation({ ...palpation, muscleTone: e.target.value as any })}
                      className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white font-semibold"
                    >
                      <option value="normal">Normotonia (Normal)</option>
                      <option value="hypertonic">Hipertonia / Tensão aumentada</option>
                      <option value="spasm">Espasmo muscular ativo</option>
                      <option value="hypotonic">Hipotonia</option>
                    </select>
                  </div>

                  <div className="pt-2 border-t border-slate-200">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={palpation.triggerPoints || false}
                        onChange={e => setPalpation({ ...palpation, triggerPoints: e.target.checked })}
                        className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
                      />
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
                      value={palpation.tenderness || 'mild'}
                      onChange={e => setPalpation({ ...palpation, tenderness: e.target.value as any })}
                      className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white"
                    >
                      <option value="none">Ausente (Indolor)</option>
                      <option value="mild">Leve</option>
                      <option value="moderate">Moderada</option>
                      <option value="severe">Severa / Sinal do Pulo</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Temperatura Local:</label>
                    <select
                      value={palpation.localTemperature || 'normal'}
                      onChange={e => setPalpation({ ...palpation, localTemperature: e.target.value as any })}
                      className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white"
                    >
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
                    <input
                      type="checkbox"
                      checked={edema.present || false}
                      onChange={e => setEdema({ ...edema, present: e.target.checked })}
                      className="rounded text-cyan-600 focus:ring-cyan-500 w-4 h-4"
                    />
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
                        value={edema.godetScale || '0'}
                        onChange={e => setEdema({ ...edema, godetScale: e.target.value as any })}
                        className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white"
                      >
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
              <div className="p-4 bg-purple-50/40 rounded-xl border border-purple-100 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-purple-900">Escalas Funcionais Aplicadas</h4>
                  <button
                    type="button"
                    onClick={() => setScales([...scales, { scaleName: '', score: '', interpretation: '' }])}
                    className="flex items-center gap-1 text-[11px] font-bold text-purple-700 hover:text-purple-900"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar Escala
                  </button>
                </div>

                <div className="space-y-2">
                  {scales.map((s, idx) => (
                    <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-2 bg-white p-2.5 rounded-lg border border-purple-100">
                      <div>
                        <label className="block text-[10px] text-slate-400 font-semibold mb-0.5">Nome da Escala:</label>
                        <input
                          type="text"
                          value={s.scaleName}
                          onChange={e => {
                            const updated = [...scales];
                            updated[idx].scaleName = e.target.value;
                            setScales(updated);
                          }}
                          placeholder="Ex: SPADI, DASH, LEFS, Roland-Morris..."
                          className="w-full text-xs px-2 py-1 rounded border border-slate-200"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 font-semibold mb-0.5">Score / Pontuação:</label>
                        <input
                          type="text"
                          value={s.score || ''}
                          onChange={e => {
                            const updated = [...scales];
                            updated[idx].score = e.target.value;
                            setScales(updated);
                          }}
                          placeholder="Ex: 48 / 100 (48%)"
                          className="w-full text-xs px-2 py-1 rounded border border-slate-200"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 font-semibold mb-0.5">Interpretação:</label>
                        <input
                          type="text"
                          value={s.interpretation || ''}
                          onChange={e => {
                            const updated = [...scales];
                            updated[idx].interpretation = e.target.value;
                            setScales(updated);
                          }}
                          placeholder="Ex: Incapacidade funcional moderada"
                          className="w-full text-xs px-2 py-1 rounded border border-slate-200"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

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
              Cancelar
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
