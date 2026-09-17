import React, { useState, useEffect } from 'react';
import {
  X,
  GitCompare,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Calendar,
  Flame,
  Scale,
  Ruler,
  Layers,
  Heart,
  Camera,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Assessment, AssessmentComparison, AssessmentPhoto, Student } from './types';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';

interface PersonalAssessmentComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  assessmentsList: Assessment[];
  initialCurrentId?: string;
  initialPreviousId?: string;
}

export const PersonalAssessmentComparisonModal: React.FC<PersonalAssessmentComparisonModalProps> = ({
  isOpen,
  onClose,
  student,
  assessmentsList,
  initialCurrentId,
  initialPreviousId
}) => {
  const { showToast } = useToast();

  const [currentId, setCurrentId] = useState(initialCurrentId || '');
  const [previousId, setPreviousId] = useState(initialPreviousId || '');
  const [comparison, setComparison] = useState<AssessmentComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<'all' | 'composition' | 'perimeters' | 'skinfolds' | 'cardio' | 'photos'>('all');

  useEffect(() => {
    if (isOpen && assessmentsList.length >= 2) {
      const sorted = [...assessmentsList].sort(
        (a, b) => new Date(b.assessment_date).getTime() - new Date(a.assessment_date).getTime()
      );
      const cur = initialCurrentId || sorted[0].id;
      const prev = initialPreviousId || (sorted[1] ? sorted[1].id : sorted[0].id);
      setCurrentId(cur);
      setPreviousId(prev);
    }
  }, [isOpen, assessmentsList, initialCurrentId, initialPreviousId]);

  useEffect(() => {
    if (currentId && previousId && currentId !== previousId) {
      loadComparison(currentId, previousId);
    } else if (currentId && previousId && currentId === previousId) {
      setComparison(null);
    }
  }, [currentId, previousId]);

  const loadComparison = async (curId: string, prevId: string) => {
    try {
      setLoading(true);
      const data = await ApiClient.get<AssessmentComparison>(
        `/v1/personal/assessments/${curId}/compare/${prevId}`
      );
      setComparison(data);
    } catch (err) {
      console.error('Erro ao carregar comparativo:', err);
      showToast('Erro ao carregar comparação de avaliações', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Determinar se o delta é positivo/desejado
  const getBadgeStyle = (field: string, diff: number | null) => {
    if (diff === null || diff === 0) {
      return {
        bg: 'bg-slate-100 text-slate-600',
        icon: <Minus className="w-3 h-3" />
      };
    }

    // Campos onde REDUÇÃO é geralmente positiva
    const lowerIsBetter = [
      'body_fat_percentage',
      'fat_mass_kg',
      'tav_value',
      'waist_cm',
      'abdomen_cm',
      'resting_heart_rate_bpm',
      'fold_subscapular',
      'fold_triceps',
      'fold_biceps',
      'fold_chest',
      'fold_axillary',
      'fold_suprailiac',
      'fold_abdominal',
      'fold_thigh',
      'fold_calf'
    ];

    const isLowerBetter = lowerIsBetter.includes(field);

    if (diff > 0) {
      if (isLowerBetter) {
        return {
          bg: 'bg-rose-50 text-rose-700 border border-rose-200',
          icon: <ArrowUpRight className="w-3 h-3" />
        };
      }
      return {
        bg: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
        icon: <ArrowUpRight className="w-3 h-3" />
      };
    } else {
      if (isLowerBetter) {
        return {
          bg: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
          icon: <ArrowDownRight className="w-3 h-3" />
        };
      }
      return {
        bg: 'bg-rose-50 text-rose-700 border border-rose-200',
        icon: <ArrowDownRight className="w-3 h-3" />
      };
    }
  };

  const curAssess = comparison?.current_assessment;
  const prevAssess = comparison?.previous_assessment;

  // Filtro de métricas por categoria
  const filteredMetrics = (comparison?.metrics || []).filter((m) => {
    if (activeCategory === 'all') return true;
    if (activeCategory === 'composition') {
      return [
        'weight',
        'bmi',
        'whr',
        'whtr',
        'body_fat_percentage',
        'fat_mass_kg',
        'lean_mass_kg',
        'muscle_mass_kg',
        'body_water_liters',
        'bmr_kcal',
        'tav_value'
      ].includes(m.field);
    }
    if (activeCategory === 'perimeters') {
      return m.field.endsWith('_cm') || m.field.startsWith('arm_') || m.field.startsWith('forearm_') || m.field.startsWith('wrist_') || m.field.startsWith('thigh_') || m.field.startsWith('calf_');
    }
    if (activeCategory === 'skinfolds') {
      return m.field.startsWith('fold_');
    }
    if (activeCategory === 'cardio') {
      return [
        'resting_heart_rate_bpm',
        'blood_pressure_systolic',
        'blood_pressure_diastolic',
        'vo2_max',
        'flexibility_wells_cm'
      ].includes(m.field);
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[94vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
              <GitCompare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Comparativo de Avaliações Físicas (Anterior × Atual)
              </h3>
              <p className="text-xs text-slate-500">
                Aluno: <strong className="text-slate-700">{student.name}</strong> • Variações absolutas e percentuais.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Seletores de Avaliação Lado a Lado */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-3 rounded-2xl border border-slate-200">
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              Avaliação Anterior (Base de Comparação)
            </label>
            <select
              value={previousId}
              onChange={(e) => setPreviousId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none font-semibold text-slate-800"
            >
              {assessmentsList.map((a) => (
                <option key={a.id} value={a.id}>
                  {new Date(a.assessment_date).toLocaleDateString('pt-BR')} — {a.weight} kg, {a.body_fat_percentage}% fat ({a.protocol || 'Pollock'})
                </option>
              ))}
            </select>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-indigo-200">
            <label className="block text-[10px] font-bold uppercase text-indigo-500 mb-1">
              Avaliação Atual / Mais Recente
            </label>
            <select
              value={currentId}
              onChange={(e) => setCurrentId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-indigo-50/50 border border-indigo-200 rounded-xl outline-none font-bold text-indigo-900"
            >
              {assessmentsList.map((a) => (
                <option key={a.id} value={a.id}>
                  {new Date(a.assessment_date).toLocaleDateString('pt-BR')} — {a.weight} kg, {a.body_fat_percentage}% fat ({a.protocol || 'Pollock'})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Sub-abas de Categoria */}
        <div className="px-6 py-2 border-b border-slate-200 bg-white flex items-center gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors whitespace-nowrap ${
              activeCategory === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Todas as Métricas
          </button>
          <button
            onClick={() => setActiveCategory('composition')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors whitespace-nowrap ${
              activeCategory === 'composition' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Composição & TAV
          </button>
          <button
            onClick={() => setActiveCategory('perimeters')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors whitespace-nowrap ${
              activeCategory === 'perimeters' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Perímetros (cm)
          </button>
          <button
            onClick={() => setActiveCategory('skinfolds')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors whitespace-nowrap ${
              activeCategory === 'skinfolds' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Dobras Cutâneas (mm)
          </button>
          <button
            onClick={() => setActiveCategory('cardio')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors whitespace-nowrap ${
              activeCategory === 'cardio' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Cardio & Funcional
          </button>
          <button
            onClick={() => setActiveCategory('photos')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors whitespace-nowrap ${
              activeCategory === 'photos' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Fotos Comparativas
          </button>
        </div>

        {/* Corpo Principal */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {loading ? (
            <div className="py-24 text-center text-slate-400 text-xs flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              Calculando deltas e comparativo...
            </div>
          ) : !comparison ? (
            <div className="py-16 text-center text-slate-400 text-xs">
              Selecione duas avaliações diferentes para visualizar o comparativo detalhado.
            </div>
          ) : (
            <>
              {/* CARD DEDICADO DE COMPARAÇÃO DO TAV */}
              {(comparison.tav_comparison?.previous?.value !== null ||
                comparison.tav_comparison?.current?.value !== null) && (
                <div className="p-5 bg-gradient-to-r from-purple-900 to-indigo-950 rounded-3xl text-white shadow-md space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                        <Flame className="w-4 h-4 text-cyan-300" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">Evolução do Tecido Adiposo Visceral (TAV)</h4>
                        <span className="text-[11px] text-purple-200">
                          Equipamento: {comparison.tav_comparison.current.equipment || comparison.tav_comparison.previous.equipment || 'Bioimpedância'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                    <div className="bg-white/10 rounded-2xl p-3 backdrop-blur-sm text-center">
                      <span className="text-[10px] uppercase font-bold text-purple-200 block">Anterior</span>
                      <div className="text-xl font-black mt-0.5">
                        {comparison.tav_comparison.previous.value !== null && comparison.tav_comparison.previous.value !== undefined
                          ? `${comparison.tav_comparison.previous.value} ${comparison.tav_comparison.previous.unit || 'nível'}`
                          : '—'}
                      </div>
                      <div className="text-[11px] text-purple-300 mt-1">
                        {comparison.tav_comparison.previous.classification || 'Sem classificação'}
                      </div>
                    </div>

                    <div className="bg-white/10 rounded-2xl p-3 backdrop-blur-sm text-center">
                      <span className="text-[10px] uppercase font-bold text-purple-200 block">Atual</span>
                      <div className="text-xl font-black text-amber-300 mt-0.5">
                        {comparison.tav_comparison.current.value !== null && comparison.tav_comparison.current.value !== undefined
                          ? `${comparison.tav_comparison.current.value} ${comparison.tav_comparison.current.unit || 'nível'}`
                          : '—'}
                      </div>
                      <div className="text-[11px] text-emerald-300 font-bold mt-1">
                        {comparison.tav_comparison.current.classification || 'Sem classificação'}
                      </div>
                    </div>

                    <div className="bg-white/10 rounded-2xl p-3 backdrop-blur-sm text-center">
                      <span className="text-[10px] uppercase font-bold text-purple-200 block">Variação Real</span>
                      {comparison.tav_comparison.previous.value !== null &&
                      comparison.tav_comparison.current.value !== null &&
                      comparison.tav_comparison.previous.value !== undefined &&
                      comparison.tav_comparison.current.value !== undefined ? (
                        <>
                          <div className="text-xl font-black mt-0.5 text-cyan-300">
                            {comparison.tav_comparison.current.value - comparison.tav_comparison.previous.value > 0
                              ? `+${(comparison.tav_comparison.current.value - comparison.tav_comparison.previous.value).toFixed(1)}`
                              : (comparison.tav_comparison.current.value - comparison.tav_comparison.previous.value).toFixed(1)}{' '}
                            {comparison.tav_comparison.current.unit || 'nível'}
                          </div>
                          <div className="text-[11px] text-purple-200 mt-1">
                            {comparison.tav_comparison.current.value < comparison.tav_comparison.previous.value
                              ? 'Melhora clínica do risco metabólico'
                              : comparison.tav_comparison.current.value > comparison.tav_comparison.previous.value
                              ? 'Atenção: aumento no nível de gordura visceral'
                              : 'Estável'}
                          </div>
                        </>
                      ) : (
                        <div className="text-sm mt-2 text-purple-300">Dados insuficientes</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TABELA DE MÉTRICAS COMPARATIVAS */}
              {activeCategory !== 'photos' && (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">Tabela de Medidas e Variações</span>
                    <span className="text-slate-400">
                      {prevAssess?.assessment_date ? new Date(prevAssess.assessment_date).toLocaleDateString('pt-BR') : '—'} ×{' '}
                      {curAssess?.assessment_date ? new Date(curAssess.assessment_date).toLocaleDateString('pt-BR') : '—'}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase text-[10px] bg-slate-50/50">
                          <th className="py-2.5 px-4">Métrica / Parâmetro</th>
                          <th className="py-2.5 px-3 text-center">Anterior</th>
                          <th className="py-2.5 px-3 text-center">Atual</th>
                          <th className="py-2.5 px-3 text-center">Diferença (+/-)</th>
                          <th className="py-2.5 px-3 text-center">% Variação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredMetrics.map((m) => {
                          const badge = getBadgeStyle(m.field, m.diff);
                          return (
                            <tr key={m.field} className="hover:bg-slate-50 transition-colors">
                              <td className="py-2.5 px-4 font-semibold text-slate-800">
                                {m.label}
                                {m.unit && <span className="text-[10px] text-slate-400 ml-1 font-normal">({m.unit})</span>}
                              </td>
                              <td className="py-2.5 px-3 text-center text-slate-600 font-medium">
                                {m.previous !== null ? `${m.previous} ${m.unit}` : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-center text-slate-900 font-bold">
                                {m.current !== null ? `${m.current} ${m.unit}` : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {m.diff !== null ? (
                                  <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-bold ${badge.bg}`}>
                                    {badge.icon}
                                    {m.diff > 0 ? `+${m.diff}` : m.diff} {m.unit}
                                  </span>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {m.pct_variation !== null ? (
                                  <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-bold ${badge.bg}`}>
                                    {m.pct_variation > 0 ? `+${m.pct_variation}%` : `${m.pct_variation}%`}
                                  </span>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* FOTOS LADO A LADO */}
              {(activeCategory === 'photos' || activeCategory === 'all') && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Camera className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Comparativo de Fotos Corporais
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    {['front', 'back', 'right', 'left'].map((type) => {
                      const prevPhoto = (comparison.previous_photos || []).find((p) => p.photo_type === type);
                      const curPhoto = (comparison.current_photos || []).find((p) => p.photo_type === type);
                      const labelMap: Record<string, string> = {
                        front: 'Frontal',
                        back: 'Posterior (Costas)',
                        right: 'Lateral Direita',
                        left: 'Lateral Esquerda'
                      };

                      return (
                        <div key={type} className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                          <span className="text-xs font-bold text-slate-700 block text-center">
                            {labelMap[type]}
                          </span>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-[10px] text-slate-400 font-semibold block text-center mb-1">
                                Anterior
                              </span>
                              <div className="w-full h-36 bg-slate-200 rounded-xl overflow-hidden flex items-center justify-center">
                                {prevPhoto ? (
                                  <img src={prevPhoto.photo_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-[10px] text-slate-400">Sem foto</span>
                                )}
                              </div>
                            </div>

                            <div>
                              <span className="text-[10px] text-indigo-600 font-bold block text-center mb-1">
                                Atual
                              </span>
                              <div className="w-full h-36 bg-indigo-50 border border-indigo-200 rounded-xl overflow-hidden flex items-center justify-center">
                                {curPhoto ? (
                                  <img src={curPhoto.photo_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-[10px] text-slate-400">Sem foto</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-end bg-slate-50">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
          >
            Fechar Comparativo
          </button>
        </div>
      </div>
    </div>
  );
};
