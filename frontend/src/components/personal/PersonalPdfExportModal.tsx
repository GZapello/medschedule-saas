import React, { useState, useRef, useEffect } from 'react';
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
  Scale,
  User,
  ClipboardCheck
} from 'lucide-react';
import { Student, Workout, Assessment, StrengthTestItem, EnduranceTestItem } from './types';
import { useAuth } from '../../context/AuthContext';
import { ApiClient } from '../../api/client';
import { SecureFileImage } from '../common/SecureFileImage';
import { isStretch } from './exercisePresentation';
import { ExerciseImageCredit } from './ExerciseImageCredit';
import {
  useClinicDocumentData,
  ClinicDocumentHeader,
  ClinicDocumentFooter
} from '../common/ClinicDocumentHeader';

interface PersonalPdfExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  workouts: Workout[];
  latestAssessment?: Assessment | null;
  assessmentsList?: Assessment[];
  workoutLogs?: any[];
}

export const PersonalPdfExportModal: React.FC<PersonalPdfExportModalProps> = ({
  isOpen,
  onClose,
  student,
  workouts,
  latestAssessment,
  assessmentsList,
  workoutLogs
}) => {
  const { currentTenant, currentUser } = useAuth();
  const { clinic, loading: clinicLoading, error: clinicError, canIssue: canIssueClinic } = useClinicDocumentData();
  const [exportType, setExportType] = useState<'full_workout' | 'compact_workout' | 'assessment_report' | 'student_full_profile'>('full_workout');

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

  // Seleção Modular para a Impressão do Perfil Completo do Aluno (Item 12)
  const [profileSections, setProfileSections] = useState({
    studentData: true,
    physicalAssessment: true,
    measurements: true,
    composition: true,
    workouts: true,
    workoutHistory: true
  });

  // Carregamento resiliente dos treinos com exercícios detalhados
  const [loadedWorkouts, setLoadedWorkouts] = useState<Workout[]>(workouts);

  useEffect(() => {
    setLoadedWorkouts(workouts);
    const hasMissing = workouts.some(w => !w.exercises || w.exercises.length === 0);
    if (hasMissing && isOpen) {
      Promise.all(
        workouts.map(async (w) => {
          if (w.exercises && w.exercises.length > 0) return w;
          try {
            const res = await ApiClient.get<{ workout: Workout; exercises: any[] }>(`/v1/personal/workouts/${w.id}`);
            return { ...w, exercises: res.exercises || [] };
          } catch {
            return w;
          }
        })
      ).then(updated => setLoadedWorkouts(updated));
    }
  }, [workouts, isOpen]);

  const printRef = useRef<HTMLDivElement>(null);
  const [printing, setPrinting] = useState(false);
  if (!isOpen) return null;

  const handlePrint = async () => {
    if (!canIssueClinic || printing) return;
    setPrinting(true);
    try {
      // Secure images report pending resolution/loading; errors settle to a placeholder.
      const deadline = Date.now() + 15000;
      while (printRef.current?.querySelector('[data-image-pending="true"]') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
      await document.fonts.ready;
      window.print();
    } finally { setPrinting(false); }
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
    <div className="personal-print-root fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
      <style>{`@media print {
        body * { visibility: hidden; }
        .personal-print-root, .personal-print-root * { visibility: visible; }
        .personal-print-root { position: absolute !important; inset: 0 auto auto 0 !important; width: 100%; height: auto; display: block; background: white; padding: 0; }
        .personal-print-modal { max-height: none !important; max-width: none !important; overflow: visible !important; display: block !important; border: 0; box-shadow: none; }
        .personal-print-document { overflow: visible !important; }
        .personal-print-root tr { break-inside: avoid; }
        .personal-print-root thead { display: table-header-group; }
        .personal-print-root [data-image-pending="true"] { visibility: hidden; }
      }`}</style>
      <div className="personal-print-modal bg-white rounded-3xl max-w-4xl w-full max-h-[94vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
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
              disabled={!canIssueClinic || printing}
              className={`px-4 py-2 text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm transition-colors ${
                canIssueClinic
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
              }`}
              title={!canIssueClinic ? 'Não foi possível carregar os dados da clínica emissora' : 'Imprimir / Salvar em PDF'}
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
              PDF com imagens
            </button>
            <button
              onClick={() => setExportType('compact_workout')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors ${
                exportType === 'compact_workout' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'
              }`}
            >
              PDF compacto sem imagens
            </button>
            <button
              onClick={() => setExportType('assessment_report')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors ${
                exportType === 'assessment_report' ? 'bg-purple-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'
              }`}
            >
              Relatório de Avaliação Física
            </button>
            <button
              onClick={() => setExportType('student_full_profile')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors ${
                exportType === 'student_full_profile' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'
              }`}
            >
              Perfil Completo do Aluno
            </button>
          </div>
        </div>

        {/* Checkboxes de Seleção Modular para Perfil Completo do Aluno (Item 12) */}
        {exportType === 'student_full_profile' && (
          <div className="px-6 py-2.5 bg-emerald-50/70 border-b border-emerald-100 text-xs print:hidden space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-emerald-900 block">
              Selecione o que imprimir no perfil completo do aluno:
            </span>
            <div className="flex flex-wrap items-center gap-3">
              {[
                { key: 'studentData', label: 'Dados do aluno' },
                { key: 'physicalAssessment', label: 'Avaliação física' },
                { key: 'measurements', label: 'Medidas' },
                { key: 'composition', label: 'Composição corporal' },
                { key: 'workouts', label: 'Treinos' },
                { key: 'workoutHistory', label: 'Histórico de treinos' }
              ].map((s) => (
                <label key={s.key} className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={profileSections[s.key as keyof typeof profileSections]}
                    onChange={() =>
                      setProfileSections((prev) => ({
                        ...prev,
                        [s.key]: !prev[s.key as keyof typeof profileSections]
                      }))
                    }
                    className="w-3.5 h-3.5 text-emerald-600 rounded"
                  />
                  <span className="text-[11px] font-semibold text-slate-700">{s.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

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
        <div ref={printRef} className="personal-print-document p-8 overflow-y-auto flex-1 bg-slate-100/50 print:p-0 print:bg-white">
          <div className="max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-slate-200 print:border-none print:shadow-none print:p-0 print:max-w-full space-y-6">
            {/* Cabeçalho Institucional da Clínica */}
            <ClinicDocumentHeader
              clinic={clinic || currentTenant}
              loading={clinicLoading}
              error={clinicError}
              documentTitle={
                exportType === 'student_full_profile'
                  ? 'PERFIL COMPLETO DO ALUNO'
                  : exportType === 'assessment_report'
                  ? 'AVALIAÇÃO FÍSICA'
                  : 'FICHA DE TREINO'
              }
              documentSubtitle="Prescrição Técnica & Avaliação Especializada"
            />

            {/* Ficha do Aluno e Treinador */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              <div className="col-span-2">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Aluno</span>
                <strong className="text-slate-800 text-sm block">{student.name}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Idade / Gênero</span>
                <strong className="text-slate-800 block">
                  {age} anos • {student.gender === 'm' ? 'Masculino' : 'Feminino'}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Objetivo</span>
                <strong className="text-slate-800 block">{student.goal || 'Saúde e Treinamento'}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Treinador(a)</span>
                <strong className={`block ${currentUser?.name ? 'text-slate-800' : 'text-rose-600 italic font-semibold'}`}>
                  {currentUser?.name || 'Profissional não identificado'}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">CREF / Registro</span>
                <span className="text-slate-600 font-mono text-[11px] block">
                  {currentUser?.registrationNumber || (currentUser as any)?.registration_number || 'Não informado'}
                </span>
              </div>
            </div>

            {/* CONTEÚDO: FICHA DE TREINO */}
            {(exportType === 'full_workout' || exportType === 'compact_workout') && (
              <div className="space-y-6">
                {loadedWorkouts.map((w) => (
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
                          <th className="py-2 px-2 text-center">Reps / Tempo</th>
                          <th className="py-2 px-2 text-center">Carga</th>
                          <th className="py-2 px-2 text-center">Descanso</th>
                          <th className="py-2 px-2 text-center">Cadência</th>
                          <th className="py-2 px-2">Método</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {w.exercises?.map((ex, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 break-inside-avoid">
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
                              {exportType === 'full_workout' && <ExerciseImageCredit value={ex.image_attribution_json} />}
                              {ex.notes && <span className="block text-[10px] font-normal text-slate-500">{ex.notes}</span>}
                            </td>
                            <td className="py-2 px-2 text-center font-bold text-slate-800">{ex.sets}</td>
                            <td className="py-2 px-2 text-center text-slate-700">{ex.duration_seconds != null ? `${ex.duration_seconds}s` : ex.reps}{ex.side ? ` • ${ex.side}` : ''}</td>
                            <td className="py-2 px-2 text-center font-bold text-emerald-700">{!isStretch(ex) && ex.load_kg ? `${ex.load_kg}kg` : '—'}</td>
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

            {/* CONTEÚDO: PERFIL COMPLETO DO ALUNO (Item 12) */}
            {exportType === 'student_full_profile' && (
              <div className="space-y-6">
                {/* 1. Dados do aluno */}
                {profileSections.studentData && (
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Dados Cadastrais e Metas do Aluno</span>
                    </h5>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Telefone</span>
                        <strong className="text-slate-800 block">{student.phone || '—'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">E-mail</span>
                        <strong className="text-slate-800 block truncate">{student.email || '—'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">CPF</span>
                        <strong className="text-slate-800 block">{student.cpf || '—'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Nível / Frequência</span>
                        <strong className="text-slate-800 block capitalize">{student.experience_level || 'Geral'} • {student.weekly_frequency || 3}x/sem</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Peso Inicial / Atual</span>
                        <strong className="text-slate-800 block">{student.current_weight ? `${student.current_weight} kg` : '—'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Estatura</span>
                        <strong className="text-slate-800 block">{student.height ? `${student.height} cm` : '—'}</strong>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Restrições / Observações Clínicas</span>
                        <span className="text-slate-700 block">{student.restrictions || 'Nenhuma restrição registrada'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Avaliação física */}
                {profileSections.physicalAssessment && latestAssessment && (
                  <div className="p-4 bg-purple-50/60 rounded-2xl border border-purple-200 space-y-3">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-purple-900 border-b border-purple-200 pb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <ClipboardCheck className="w-3.5 h-3.5 text-purple-600" />
                        <span>Avaliação Física Recente</span>
                      </span>
                      <span className="text-[11px] font-semibold text-purple-700">
                        {new Date(latestAssessment.assessment_date).toLocaleDateString('pt-BR')} • {latestAssessment.protocol || 'Pollock 7'}
                      </span>
                    </h5>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="p-2 bg-white rounded-lg border border-purple-100">
                        FC Repouso: <strong>{latestAssessment.resting_heart_rate_bpm ? `${latestAssessment.resting_heart_rate_bpm} bpm` : '—'}</strong>
                      </div>
                      <div className="p-2 bg-white rounded-lg border border-purple-100">
                        Pressão: <strong>{latestAssessment.blood_pressure_systolic && latestAssessment.blood_pressure_diastolic ? `${latestAssessment.blood_pressure_systolic}x${latestAssessment.blood_pressure_diastolic} mmHg` : '—'}</strong>
                      </div>
                      <div className="p-2 bg-white rounded-lg border border-purple-100">
                        Flexibilidade: <strong>{latestAssessment.flexibility_wells_cm != null ? `${latestAssessment.flexibility_wells_cm} cm` : '—'}</strong>
                      </div>
                      <div className="p-2 bg-white rounded-lg border border-purple-100">
                        VO₂ Máx: <strong>{latestAssessment.vo2_max ? `${latestAssessment.vo2_max} ml/kg/min` : '—'}</strong>
                      </div>
                    </div>
                    {latestAssessment.notes && (
                      <div className="p-2.5 bg-white/80 rounded-xl border border-purple-100 text-xs italic text-slate-700">
                        "{latestAssessment.notes}"
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Medidas */}
                {profileSections.measurements && latestAssessment && (
                  <div className="space-y-2">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-1 flex items-center gap-1.5">
                      <Ruler className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Perímetros e Circunferências (cm)</span>
                    </h5>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs text-center">
                      <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-400 block">Tórax</span>
                        <strong>{latestAssessment.chest_cm || '—'}</strong>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-400 block">Cintura</span>
                        <strong>{latestAssessment.waist_cm || '—'}</strong>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-400 block">Abdômen</span>
                        <strong>{latestAssessment.abdomen_cm || '—'}</strong>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-400 block">Quadril</span>
                        <strong>{latestAssessment.hip_cm || '—'}</strong>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-400 block">Braço Dir.</span>
                        <strong>{latestAssessment.arm_right_relaxed || '—'}</strong>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-400 block">Coxa Dir.</span>
                        <strong>{latestAssessment.thigh_right_med || latestAssessment.thigh_right_prox || '—'}</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. Composição corporal */}
                {profileSections.composition && latestAssessment && (
                  <div className="space-y-2">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-1 flex items-center gap-1.5">
                      <Scale className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Composição Corporal & TAV</span>
                    </h5>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200">
                        <span className="text-[10px] text-amber-700 font-bold block uppercase">% Gordura</span>
                        <strong className="text-base text-amber-900 font-black">{latestAssessment.body_fat_percentage || '—'}%</strong>
                      </div>
                      <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                        <span className="text-[10px] text-emerald-700 font-bold block uppercase">Massa Magra</span>
                        <strong className="text-base text-emerald-900 font-black">{latestAssessment.lean_mass_kg || '—'} kg</strong>
                      </div>
                      <div className="p-2.5 bg-cyan-50 rounded-xl border border-cyan-200">
                        <span className="text-[10px] text-cyan-700 font-bold block uppercase">Massa Muscular</span>
                        <strong className="text-base text-cyan-900 font-black">{latestAssessment.muscle_mass_kg || '—'} kg</strong>
                      </div>
                      <div className="p-2.5 bg-indigo-50 rounded-xl border border-indigo-200">
                        <span className="text-[10px] text-indigo-700 font-bold block uppercase">TAV Visceral</span>
                        <strong className="text-base text-indigo-900 font-black">{latestAssessment.tav_value != null ? `${latestAssessment.tav_value} (${latestAssessment.tav_classification || 'Nível'})` : '—'}</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. Treinos */}
                {profileSections.workouts && loadedWorkouts.length > 0 && (
                  <div className="space-y-4">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-1 flex items-center gap-1.5">
                      <Dumbbell className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Rotinas de Treinos Cadastradas ({loadedWorkouts.length})</span>
                    </h5>
                    {loadedWorkouts.map((w) => (
                      <div key={w.id} className="space-y-2 border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs bg-emerald-500 text-slate-950 px-2 py-0.5 rounded-md">
                              {w.division}
                            </span>
                            <span className="font-bold text-slate-800 text-xs">{w.title}</span>
                          </div>
                          <span className="text-[11px] text-slate-500">{w.structure_type || 'Personal'}</span>
                        </div>
                        {w.notes && <p className="text-[11px] text-slate-600 italic">{w.notes}</p>}
                        <table className="w-full text-left text-xs border-collapse bg-white rounded-lg overflow-hidden border border-slate-200">
                          <thead>
                            <tr className="border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500 bg-slate-100/70">
                              <th className="py-1 px-2">#</th>
                              <th className="py-1 px-2">Exercício</th>
                              <th className="py-1 px-2 text-center">Séries</th>
                              <th className="py-1 px-2 text-center">Reps</th>
                              <th className="py-1 px-2 text-center">Carga</th>
                              <th className="py-1 px-2 text-center">Descanso</th>
                              <th className="py-1 px-2">Método</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {w.exercises?.map((ex, idx) => (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="py-1 px-2 font-bold text-slate-400">{idx + 1}</td>
                                <td className="py-1 px-2 font-semibold text-slate-800">
                                  {ex.name}
                                  {ex.notes && <span className="block text-[10px] font-normal text-slate-500">{ex.notes}</span>}
                                </td>
                                <td className="py-1 px-2 text-center font-bold text-slate-800">{ex.sets}</td>
                                <td className="py-1 px-2 text-center text-slate-700">{ex.duration_seconds != null ? `${ex.duration_seconds}s` : ex.reps}</td>
                                <td className="py-1 px-2 text-center font-bold text-emerald-700">{ex.load_kg ? `${ex.load_kg}kg` : '—'}</td>
                                <td className="py-1 px-2 text-center text-slate-600">{ex.rest_seconds}s</td>
                                <td className="py-1 px-2 text-slate-700">{ex.technique || 'Direta'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )}

                {/* 6. Histórico de treinos */}
                {profileSections.workoutHistory && workoutLogs && workoutLogs.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-1 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Histórico Recente de Execução de Treinos</span>
                    </h5>
                    <table className="w-full text-xs text-left border-collapse border border-slate-200 rounded-xl overflow-hidden">
                      <thead>
                        <tr className="border-b text-[10px] text-slate-500 font-bold uppercase bg-slate-50">
                          <th className="py-1.5 px-2">Data</th>
                          <th className="py-1.5 px-2">Divisão / Treino</th>
                          <th className="py-1.5 px-2 text-center">Duração</th>
                          <th className="py-1.5 px-2">Observações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {workoutLogs.slice(0, 10).map((log: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="py-1.5 px-2 font-medium text-slate-700">
                              {log.completed_at ? new Date(log.completed_at).toLocaleDateString('pt-BR') : '—'}
                            </td>
                            <td className="py-1.5 px-2 font-bold text-slate-800">
                              {log.workout_title || log.workout_name || 'Treino'} {log.division ? `(${log.division})` : ''}
                            </td>
                            <td className="py-1.5 px-2 text-center text-slate-600">
                              {log.duration_minutes ? `${log.duration_minutes} min` : '—'}
                            </td>
                            <td className="py-1.5 px-2 text-slate-500 italic">
                              {log.notes || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Rodapé de Assinatura */}
            <div className="pt-12 flex items-center justify-between text-xs text-slate-500 border-t border-slate-200">
              <div className="text-center w-64 border-t border-slate-400 pt-1">
                <strong>{currentUser?.name || 'Profissional Responsável'}</strong>
                <div className="text-[10px]">CREF / Responsável Técnico</div>
              </div>
              <div className="text-center w-64 border-t border-slate-400 pt-1">
                <strong>{student.name}</strong>
                <div className="text-[10px]">Assinatura do Aluno(a)</div>
              </div>
            </div>

            {/* Rodapé Institucional com Atribuição Tecnológica */}
            <ClinicDocumentFooter />
          </div>
        </div>
      </div>
    </div>
  );
};
