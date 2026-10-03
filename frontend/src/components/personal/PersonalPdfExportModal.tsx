import { PersonalAssessmentReport } from './PersonalAssessmentReport';
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
  latestAssessment: initialAssessment,
  assessmentsList,
  workoutLogs
}) => {
  const { currentTenant, currentUser } = useAuth();
  const { clinic, loading: clinicLoading, error: clinicError, canIssue: canIssueClinic } = useClinicDocumentData();
  const [exportType, setExportType] = useState<'full_workout' | 'compact_workout' | 'assessment_report' | 'evolution_report' | 'student_full_profile'>('full_workout');

  const [selectedAssessmentId,setSelectedAssessmentId]=useState(initialAssessment?.id || '');
  const [reportData,setReportData]=useState<any>(null);
  const [reportError,setReportError]=useState('');
  const [evolutionMode,setEvolutionMode]=useState('all');
  const latestAssessment:Assessment | null=reportData?.assessment || initialAssessment || null;
  useEffect(()=>{if(isOpen) {setSelectedAssessmentId(initialAssessment?.id || [...(assessmentsList || [])].sort((a,b)=>b.assessment_date.localeCompare(a.assessment_date))[0]?.id || '');}},[isOpen,student.id,initialAssessment?.id]);
  useEffect(()=>{
    setReportData(null);setReportError('');
    if(!isOpen || !selectedAssessmentId)return;
    let active=true;
    ApiClient.get<any>(`/v1/personal/assessments/${selectedAssessmentId}/report-data`).then(r=>{if(active)setReportData(r)}).catch(()=>{if(active)setReportError('Não foi possível carregar a avaliação completa. Tente novamente.');});
    return()=>{active=false};
  },[isOpen,selectedAssessmentId]);

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
    if (!canIssueClinic || printing || (['assessment_report','evolution_report','student_full_profile'].includes(exportType) && (!reportData || reportError))) return;
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
      const parsed = JSON.parse(latestAssessment.strength_tests_json);
      strengthList = Array.isArray(parsed) ? parsed : [];
    } catch (e) {}
  }

  let enduranceList: EnduranceTestItem[] = [];
  if (latestAssessment?.muscular_endurance_tests_json) {
    try {
      const parsed = JSON.parse(latestAssessment.muscular_endurance_tests_json);
      enduranceList = Array.isArray(parsed) ? parsed : [];
    } catch (e) {}
  }

  // Idade do aluno
  const age=reportData?.assessment?.age_at_assessment ?? null;

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
              disabled={!canIssueClinic || printing || (['assessment_report','evolution_report','student_full_profile'].includes(exportType) && !reportData)}
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

        {['assessment_report','evolution_report','student_full_profile'].includes(exportType) && <div className="px-5 py-3 border-b border-slate-100 print:hidden space-y-2">
          <label className="text-xs font-semibold text-slate-700">Avaliação a imprimir</label>
          <select value={selectedAssessmentId} onChange={e=>setSelectedAssessmentId(e.target.value)} className="ml-3 border border-slate-200 rounded-xl px-3 py-2 text-xs">{(assessmentsList || (initialAssessment?[initialAssessment]:[])).map(a=><option key={a.id} value={a.id}>{a.assessment_date}</option>)}</select>
          <button type="button" onClick={()=>setExportType('evolution_report')} className="ml-2 px-3 py-2 bg-teal-50 text-teal-700 rounded-xl text-xs font-semibold">Relatório de evolução</button>
          {exportType==='evolution_report' && <select aria-label="Comparação de evolução" value={evolutionMode} onChange={e=>setEvolutionMode(e.target.value)} className="ml-3 border border-slate-200 rounded-xl px-3 py-2 text-xs"><option value="all">Todas as avaliações</option><option value="first">Primeira × Atual</option><option value="previous">Anterior × Atual</option></select>}
          {reportError && <p className="text-xs text-red-600">{reportError}</p>}
        </div>}
        {/* Checkboxes de Seleção Modular (oculto na impressão, apenas se assessment_report) */}

        {/* Folha de Pré-visualização / Impressão */}
        <div ref={printRef} className="personal-print-document p-8 overflow-y-auto flex-1 bg-slate-100/50 print:p-0 print:bg-white">
          <div className="max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-slate-200 print:border-none print:shadow-none print:p-0 print:max-w-full space-y-6">
            {['full_workout','compact_workout'].includes(exportType) && <>
            {/* Cabeçalho Institucional da Clínica */}
            <ClinicDocumentHeader
              clinic={clinic || currentTenant}
              loading={clinicLoading}
              error={clinicError}
              documentTitle={
                exportType === 'student_full_profile'
                  ? 'PERFIL COMPLETO DO ALUNO'
                  : ['assessment_report','evolution_report'].includes(exportType)
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
                  {age ?? 'Não informado'} {age!==null?'anos':''} • {student.anthropometric_sex==='male'?'Homem':student.anthropometric_sex==='female'?'Mulher':'Referência não informada'}
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

            </>}
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
            {['assessment_report','evolution_report'].includes(exportType) && <PersonalAssessmentReport data={reportData} clinic={clinic} evolution={exportType==='evolution_report'} mode={evolutionMode}/>}

            {/* CONTEÚDO: PERFIL COMPLETO DO ALUNO (Item 12) */}
            {exportType === 'student_full_profile' && reportData && <PersonalAssessmentReport data={reportData} clinic={clinic}/>}
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
