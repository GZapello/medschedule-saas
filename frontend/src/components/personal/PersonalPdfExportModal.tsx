import React, { useState } from 'react';
import {
  X,
  Printer,
  FileText,
  Download,
  Dumbbell,
  Activity,
  Check,
  Flame,
  Heart,
  Ruler,
  Layers,
  Scale
} from 'lucide-react';
import { Student, Workout, Assessment, StrengthTestItem, EnduranceTestItem } from './types';
import { useAuth } from '../../context/AuthContext';
import { SecureFileImage } from '../common/SecureFileImage';

interface PersonalPdfExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  workouts: Workout[];
  latestAssessment?: Assessment | null;
}

export const PersonalPdfExportModal: React.FC<PersonalPdfExportModalProps> = ({
  isOpen,
  onClose,
  student,
  workouts,
  latestAssessment
}) => {
  const { currentTenant, currentUser } = useAuth();
  const [exportType, setExportType] = useState<'full_workout' | 'compact_workout' | 'assessment_report'>('full_workout');

  // Seleção Modular de Seções para o Relatório de Avaliação Física
  const [sections, setSections] = useState({
    anthropometry: true,
    composition: true,
    tav: true,
    skinfolds: true,
    riskIndices: true,
    cardio: true,
    vo2: true,
    strength: true,
    endurance: true,
    flexibility: true,
    notes: true
  });

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const toggleSection = (key: keyof typeof sections) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Parsing de testes de força e resistência se salvos em JSON
  let strengthList: StrengthTestItem[] = [];
  if (latestAssessment?.strength_tests_json) {
    try {
      strengthList = JSON.parse(latestAssessment.strength_tests_json);
    } catch (e) {}
  }

  let enduranceList: EnduranceTestItem[] = [];
  if (latestAssessment?.muscular_endurance_tests_json) {
    try {
      enduranceList = JSON.parse(latestAssessment.muscular_endurance_tests_json);
    } catch (e) {}
  }

  // Idade do aluno
  let age = 28;
  if (student.birth_date) {
    const diff = Date.now() - new Date(student.birth_date).getTime();
    age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[94vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header no Modal (oculto na impressão) */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Exportação & Impressão PDF</h3>
              <p className="text-xs text-slate-500">
                Gere fichas de treino diagramadas ou laudos completos de avaliação física.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
            >
              <Printer className="w-4 h-4" />
              Imprimir / Salvar em PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Seletor de Modelo (oculto na impressão) */}
        <div className="px-6 py-3 border-b border-slate-100 bg-white flex items-center justify-between flex-wrap gap-2 print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Documento:</span>
            <button
              onClick={() => setExportType('full_workout')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors ${
                exportType === 'full_workout' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'
              }`}
            >
              Ficha de Treino Completa
            </button>
            <button
              onClick={() => setExportType('compact_workout')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors ${
                exportType === 'compact_workout' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'
              }`}
            >
              Ficha Compacta
            </button>
            <button
              onClick={() => setExportType('assessment_report')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors ${
                exportType === 'assessment_report' ? 'bg-purple-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'
              }`}
            >
              Relatório de Avaliação Física
            </button>
          </div>
        </div>

        {/* Checkboxes de Seleção Modular (oculto na impressão, apenas se assessment_report) */}
        {exportType === 'assessment_report' && (
          <div className="px-6 py-2.5 bg-purple-50/70 border-b border-purple-100 text-xs print:hidden space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-purple-900 block">
              Selecione as seções a serem incluídas no laudo impresso:
            </span>
            <div className="flex flex-wrap items-center gap-3">
              {[
                { key: 'anthropometry', label: 'Antropometria' },
                { key: 'composition', label: 'Composição Corporal' },
                { key: 'tav', label: 'TAV (Visceral)' },
                { key: 'skinfolds', label: 'Dobras Cutâneas' },
                { key: 'riskIndices', label: 'Índices (IMC/RCQ/RCE)' },
                { key: 'cardio', label: 'Cardiovascular (FC/PA)' },
                { key: 'vo2', label: 'VO₂ Máx' },
                { key: 'strength', label: 'Testes de Força 1RM' },
                { key: 'endurance', label: 'Resistência Muscular' },
                { key: 'flexibility', label: 'Flexibilidade (Wells)' },
                { key: 'notes', label: 'Parecer do Treinador' }
              ].map((s) => (
                <label key={s.key} className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={sections[s.key as keyof typeof sections]}
                    onChange={() => toggleSection(s.key as keyof typeof sections)}
                    className="w-3.5 h-3.5 text-purple-600 rounded"
                  />
                  <span className="text-[11px] font-semibold text-slate-700">{s.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Folha de Pré-visualização / Impressão */}
        <div className="p-8 overflow-y-auto flex-1 bg-slate-100/50 print:p-0 print:bg-white">
          <div className="max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-slate-200 print:border-none print:shadow-none print:p-0 print:max-w-full space-y-6">
            {/* Cabeçalho Oficial */}
            <div className="flex items-center justify-between pb-4 border-b-2 border-slate-800">
              <div>
                <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                  {currentTenant?.name || 'Zemda Saúde & Treinamento'}
                </h1>
                <p className="text-xs text-slate-600">
                  Módulo ZemdaPersonal • Prescrição Técnica & Avaliação Física Especializada
                </p>
                {currentTenant?.city && (
                  <p className="text-[10px] text-slate-400">
                    {currentTenant.city} - {currentTenant.state || 'Brasil'}
                  </p>
                )}
              </div>
              <div className="text-right text-xs text-slate-500">
                <div>Data: {new Date().toLocaleDateString('pt-BR')}</div>
                <div>Treinador: <strong>{currentUser?.name || 'Personal Trainer'}</strong></div>
                <div className="text-[10px] text-slate-400">CREF / Registro: {currentUser?.registrationNumber || (currentUser as any)?.registration_number || 'CREF Ativo'}</div>
              </div>
            </div>

            {/* Ficha do Aluno */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Aluno</span>
                <strong className="text-slate-800">{student.name}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Idade / Gênero</span>
                <strong className="text-slate-800">
                  {age} anos • {student.gender === 'm' ? 'Masculino' : 'Feminino'}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Objetivo</span>
                <strong className="text-slate-800">{student.goal || 'Hipertrofia / Saúde'}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Peso / Estatura</span>
                <strong className="text-slate-800">
                  {student.current_weight ? `${student.current_weight} kg` : '—'} /{' '}
                  {student.height ? `${student.height} cm` : '—'}
                </strong>
              </div>
            </div>

            {/* CONTEÚDO: FICHA DE TREINO */}
            {(exportType === 'full_workout' || exportType === 'compact_workout') && (
              <div className="space-y-6">
                {workouts.map((w) => (
                  <div key={w.id} className="space-y-3">
                    <div className="flex items-center justify-between bg-slate-900 text-white px-4 py-2 rounded-xl">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm bg-emerald-500 px-2 py-0.5 rounded-lg text-slate-950">
                          {w.division}
                        </span>
                        <h4 className="font-bold text-sm">{w.title}</h4>
                      </div>
                      <span className="text-xs text-slate-300">{w.structure_type || 'Rotina Personal'}</span>
                    </div>

                    {w.notes && (
                      <p className="text-xs text-slate-600 italic bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        {w.notes}
                      </p>
                    )}

                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b-2 border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                          <th className="py-2 px-2">#</th>
                          {exportType === 'full_workout' && <th className="py-2 px-2">Foto</th>}
                          <th className="py-2 px-2">Exercício</th>
                          <th className="py-2 px-2 text-center">Séries</th>
                          <th className="py-2 px-2 text-center">Reps</th>
                          <th className="py-2 px-2 text-center">Carga</th>
                          <th className="py-2 px-2 text-center">Descanso</th>
                          <th className="py-2 px-2 text-center">Cadência</th>
                          <th className="py-2 px-2">Método</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {w.exercises?.map((ex, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-2 px-2 font-bold text-slate-400">{idx + 1}</td>
                            {exportType === 'full_workout' && (
                              <td className="py-1 px-2">
                                <div className="w-8 h-8 rounded-lg bg-slate-100 overflow-hidden border border-slate-200 flex items-center justify-center">
                                  {ex.exercise_file_id || ex.photo_url ? (
                                    <SecureFileImage
                                      fileId={ex.exercise_file_id}
                                      fallbackUrl={ex.photo_url}
                                      alt=""
                                      className="w-full h-full object-cover"
                                      placeholderText=""
                                    />
                                  ) : (
                                    <Dumbbell className="w-3.5 h-3.5 text-slate-300" />
                                  )}
                                </div>
                              </td>
                            )}
                            <td className="py-2 px-2 font-bold text-slate-800">
                              {ex.name}
                              {ex.notes && <span className="block text-[10px] font-normal text-slate-500">{ex.notes}</span>}
                            </td>
                            <td className="py-2 px-2 text-center font-bold text-slate-800">{ex.sets}</td>
                            <td className="py-2 px-2 text-center text-slate-700">{ex.reps}</td>
                            <td className="py-2 px-2 text-center font-bold text-emerald-700">{ex.load_kg ? `${ex.load_kg}kg` : '—'}</td>
                            <td className="py-2 px-2 text-center text-slate-600">{ex.rest_seconds}s</td>
                            <td className="py-2 px-2 text-center text-slate-600">{ex.cadence || '—'}</td>
                            <td className="py-2 px-2 font-semibold text-slate-700">{ex.technique || 'Direta'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}

            {/* CONTEÚDO: RELATÓRIO DE AVALIAÇÃO FÍSICA */}
            {exportType === 'assessment_report' && latestAssessment && (
              <div className="space-y-6">
                <div className="bg-purple-900 text-white p-4 rounded-xl flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm">
                      Laudo de Avaliação Física • {new Date(latestAssessment.assessment_date).toLocaleDateString('pt-BR')}
                    </h4>
                    <span className="text-xs text-purple-200">
                      Método: {latestAssessment.composition_method || 'Dobras Cutâneas'} • Protocolo: {latestAssessment.protocol || 'Pollock 7'}
                    </span>
                  </div>
                  {latestAssessment.professional_name && (
                    <span className="text-xs text-purple-200">Avaliador: {latestAssessment.professional_name}</span>
                  )}
                </div>

                {/* Seção: Composição Corporal */}
                {sections.composition && (
                  <div className="space-y-2">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-1">
                      Composição Corporal
                    </h5>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                        <span className="text-[10px] text-slate-500 uppercase font-bold block">Peso Total</span>
                        <strong className="text-lg text-slate-800">{latestAssessment.weight} kg</strong>
                      </div>
                      <div className="bg-amber-50 p-3 rounded-xl border border-amber-200">
                        <span className="text-[10px] text-amber-700 uppercase font-bold block">% Gordura</span>
                        <strong className="text-lg text-amber-800">{latestAssessment.body_fat_percentage}%</strong>
                      </div>
                      <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                        <span className="text-[10px] text-emerald-700 uppercase font-bold block">Massa Magra</span>
                        <strong className="text-lg text-emerald-800">{latestAssessment.lean_mass_kg} kg</strong>
                      </div>
                      <div className="bg-cyan-50 p-3 rounded-xl border border-cyan-200">
                        <span className="text-[10px] text-cyan-700 uppercase font-bold block">Massa Muscular</span>
                        <strong className="text-lg text-cyan-800">{latestAssessment.muscle_mass_kg || '—'} kg</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* Seção: TAV (Tecido Adiposo Visceral) */}
                {sections.tav && latestAssessment.tav_value !== null && latestAssessment.tav_value !== undefined && (
                  <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                        <Flame className="w-4 h-4 text-indigo-600" />
                        <span>Tecido Adiposo Visceral (TAV)</span>
                      </h5>
                      <span className="text-xs font-bold text-indigo-700">
                        Equipamento: {latestAssessment.tav_equipment || 'Bioimpedância'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                      <div className="bg-white p-2.5 rounded-lg border border-indigo-100">
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Valor do TAV</span>
                        <strong className="text-base text-indigo-900 font-black">
                          {latestAssessment.tav_value} {latestAssessment.tav_unit || 'nível'}
                        </strong>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-indigo-100">
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Classificação Clínica</span>
                        <strong className="text-sm text-indigo-900 font-bold">
                          {latestAssessment.tav_classification || 'Sem classificação'}
                        </strong>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-indigo-100">
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Método</span>
                        <strong className="text-xs text-slate-700 font-semibold">
                          {latestAssessment.tav_method || 'Bioimpedância'}
                        </strong>
                      </div>
                    </div>

                    {latestAssessment.tav_notes && (
                      <p className="text-[11px] text-indigo-800 italic bg-white/60 p-2 rounded-lg border border-indigo-100">
                        {latestAssessment.tav_notes}
                      </p>
                    )}
                  </div>
                )}

                {/* Seção: Índices de Risco (IMC, RCQ, RCE) */}
                {sections.riskIndices && (
                  <div className="space-y-2">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-1">
                      Índices e Estimativas de Risco Metabólico
                    </h5>
                    <div className="grid grid-cols-3 gap-3 text-xs text-center">
                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">IMC</span>
                        <strong className="text-sm text-slate-800 font-bold">{latestAssessment.bmi || '—'} kg/m²</strong>
                      </div>
                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">RCQ (Cintura/Quadril)</span>
                        <strong className="text-sm text-slate-800 font-bold">{latestAssessment.whr || '—'}</strong>
                      </div>
                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">RCE (Cintura/Estatura)</span>
                        <strong className="text-sm text-slate-800 font-bold">{latestAssessment.whtr || '—'}</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* Seção: Antropometria & Perímetros */}
                {sections.anthropometry && (
                  <div className="space-y-2">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-1">
                      Perímetros & Circunferências com Lateralidade Completa (cm)
                    </h5>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="p-2 bg-slate-50 rounded-lg">Pescoço: <strong>{latestAssessment.neck_cm || '—'} cm</strong></div>
                      <div className="p-2 bg-slate-50 rounded-lg">Ombros: <strong>{latestAssessment.shoulder_cm || '—'} cm</strong></div>
                      <div className="p-2 bg-slate-50 rounded-lg">Tórax: <strong>{latestAssessment.chest_cm || '—'} cm</strong></div>
                      <div className="p-2 bg-slate-50 rounded-lg">Cintura: <strong>{latestAssessment.waist_cm || '—'} cm</strong></div>
                      <div className="p-2 bg-slate-50 rounded-lg">Abdômen: <strong>{latestAssessment.abdomen_cm || '—'} cm</strong></div>
                      <div className="p-2 bg-slate-50 rounded-lg">Quadril: <strong>{latestAssessment.hip_cm || '—'} cm</strong></div>
                      <div className="p-2 bg-slate-50 rounded-lg">Braço Relax. (D / E): <strong>{latestAssessment.arm_right_relaxed || '—'} / {latestAssessment.arm_left_relaxed || '—'} cm</strong></div>
                      <div className="p-2 bg-slate-50 rounded-lg">Braço Cont. (D / E): <strong>{latestAssessment.arm_right_flexed || '—'} / {latestAssessment.arm_left_flexed || '—'} cm</strong></div>
                      <div className="p-2 bg-slate-50 rounded-lg">Antebraço (D / E): <strong>{latestAssessment.forearm_right || '—'} / {latestAssessment.forearm_left || '—'} cm</strong></div>
                      <div className="p-2 bg-slate-50 rounded-lg">Punho (D / E): <strong>{latestAssessment.wrist_right || '—'} / {latestAssessment.wrist_left || '—'} cm</strong></div>
                      <div className="p-2 bg-slate-50 rounded-lg">Coxa Proximal (D / E): <strong>{latestAssessment.thigh_right_prox || '—'} / {latestAssessment.thigh_left_prox || '—'} cm</strong></div>
                      <div className="p-2 bg-slate-50 rounded-lg">Coxa Medial (D / E): <strong>{latestAssessment.thigh_right_med || '—'} / {latestAssessment.thigh_left_med || '—'} cm</strong></div>
                      <div className="p-2 bg-slate-50 rounded-lg">Coxa Distal (D / E): <strong>{latestAssessment.thigh_right_dist || '—'} / {latestAssessment.thigh_left_dist || '—'} cm</strong></div>
                      <div className="p-2 bg-slate-50 rounded-lg">Panturrilha (D / E): <strong>{latestAssessment.calf_right || '—'} / {latestAssessment.calf_left || '—'} cm</strong></div>
                    </div>
                  </div>
                )}

                {/* Seção: Dobras Cutâneas */}
                {sections.skinfolds && (
                  <div className="space-y-2">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-1">
                      Dobras Cutâneas (milímetros - mm)
                    </h5>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-xs">
                      <div className="p-2 bg-slate-50 rounded-lg">Tríceps: <strong>{latestAssessment.fold_triceps || '—'} mm</strong></div>
                      <div className="p-2 bg-slate-50 rounded-lg">Subescapular: <strong>{latestAssessment.fold_subscapular || '—'} mm</strong></div>
                      <div className="p-2 bg-slate-50 rounded-lg">Bíceps: <strong>{latestAssessment.fold_biceps || '—'} mm</strong></div>
                      <div className="p-2 bg-slate-50 rounded-lg">Peitoral: <strong>{latestAssessment.fold_chest || '—'} mm</strong></div>
                      <div className="p-2 bg-slate-50 rounded-lg">Axilar Média: <strong>{latestAssessment.fold_axillary || '—'} mm</strong></div>
                      <div className="p-2 bg-slate-50 rounded-lg">Suprailíaca: <strong>{latestAssessment.fold_suprailiac || '—'} mm</strong></div>
                      <div className="p-2 bg-slate-50 rounded-lg">Abdominal: <strong>{latestAssessment.fold_abdominal || '—'} mm</strong></div>
                      <div className="p-2 bg-slate-50 rounded-lg">Coxa: <strong>{latestAssessment.fold_thigh || '—'} mm</strong></div>
                      <div className="p-2 bg-slate-50 rounded-lg">Panturrilha: <strong>{latestAssessment.fold_calf || '—'} mm</strong></div>
                    </div>
                  </div>
                )}

                {/* Seção: Cardiovascular & VO2 */}
                {(sections.cardio || sections.vo2) && (
                  <div className="space-y-2">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-1">
                      Avaliação Cardiovascular & Cardiorrespiratória
                    </h5>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      {sections.cardio && (
                        <>
                          <div className="p-2 bg-slate-50 rounded-lg">FC Repouso: <strong>{latestAssessment.resting_heart_rate_bpm ? `${latestAssessment.resting_heart_rate_bpm} bpm` : '—'}</strong></div>
                          <div className="p-2 bg-slate-50 rounded-lg">Pressão Arterial: <strong>{latestAssessment.blood_pressure_systolic && latestAssessment.blood_pressure_diastolic ? `${latestAssessment.blood_pressure_systolic}x${latestAssessment.blood_pressure_diastolic} mmHg` : '—'}</strong></div>
                        </>
                      )}
                      {sections.vo2 && (
                        <div className="p-2 bg-slate-50 rounded-lg sm:col-span-2">
                          VO₂ Máx: <strong>{latestAssessment.vo2_max ? `${latestAssessment.vo2_max} ml/kg/min` : '—'}</strong>
                          {latestAssessment.vo2_protocol && <span className="text-[10px] text-slate-500 ml-1">({latestAssessment.vo2_protocol})</span>}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Seção: Força 1RM */}
                {sections.strength && strengthList.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-1">
                      Testes de Força Dinâmica (1RM Estimada - Epley)
                    </h5>
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b text-[10px] text-slate-400 font-bold uppercase">
                          <th className="py-1 px-2">Exercício</th>
                          <th className="py-1 px-2 text-center">Carga (kg)</th>
                          <th className="py-1 px-2 text-center">Reps Realizadas</th>
                          <th className="py-1 px-2 text-center">1RM Estimada</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {strengthList.map((st, i) => (
                          <tr key={i}>
                            <td className="py-1 px-2 font-semibold text-slate-800">{st.exercise_name}</td>
                            <td className="py-1 px-2 text-center">{st.load_kg} kg</td>
                            <td className="py-1 px-2 text-center">{st.reps}</td>
                            <td className="py-1 px-2 text-center font-bold text-indigo-700">{st.one_rm_kg} kg</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Seção: Resistência & Flexibilidade */}
                {(sections.endurance || sections.flexibility) && (
                  <div className="space-y-2">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-1">
                      Resistência Muscular & Flexibilidade
                    </h5>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      {sections.flexibility && (
                        <div className="p-2 bg-slate-50 rounded-lg">
                          Banco de Wells: <strong>{latestAssessment.flexibility_wells_cm !== null && latestAssessment.flexibility_wells_cm !== undefined ? `${latestAssessment.flexibility_wells_cm} cm` : '—'}</strong>
                        </div>
                      )}
                      {sections.endurance && enduranceList.map((en, i) => (
                        <div key={i} className="p-2 bg-slate-50 rounded-lg">
                          {en.test_name}: <strong>{en.result_value} {en.unit}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Seção: Parecer Técnico do Treinador */}
                {sections.notes && latestAssessment.notes && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <strong className="block text-[10px] uppercase text-slate-500 mb-1">Parecer Técnico & Orientações do Treinador</strong>
                    <p className="text-slate-700 italic">{latestAssessment.notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Rodapé de Assinatura */}
            <div className="pt-12 flex items-center justify-between text-xs text-slate-500 border-t border-slate-200">
              <div className="text-center w-64 border-t border-slate-400 pt-1">
                <strong>{currentUser?.name || 'Personal Trainer'}</strong>
                <div className="text-[10px]">CREF / Responsável Técnico</div>
              </div>
              <div className="text-center w-64 border-t border-slate-400 pt-1">
                <strong>{student.name}</strong>
                <div className="text-[10px]">Assinatura do Aluno(a)</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
