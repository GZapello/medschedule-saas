import React, { useState, useEffect } from 'react';
import {
  User,
  Dumbbell,
  ClipboardCheck,
  TrendingUp,
  Camera,
  Layers,
  Calendar,
  Clock,
  Sparkles,
  Printer,
  Play,
  Plus,
  Edit2,
  Trash2,
  Trophy,
  AlertCircle,
  CheckCircle2,
  Flame,
  ArrowLeft,
  Copy,
  GitCompare,
  X,
  FileText
} from 'lucide-react';
import { Student, Workout, Assessment, WorkoutLog, PersonalRecord, AttendanceStats } from './types';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { PatientPreviousRecordsModal } from '../clinical/PatientPreviousRecordsModal';
import { PersonalEvolutionCharts } from './PersonalEvolutionCharts';
import { PersonalBeforeAfterModal } from './PersonalBeforeAfterModal';
import { SecureFileImage } from '../common/SecureFileImage';
import { PersonalBodyMapIntegration } from './PersonalBodyMapIntegration';
import { PersonalWorkoutExecutionModal } from './PersonalWorkoutExecutionModal';
import { PersonalPdfExportModal } from './PersonalPdfExportModal';
import { PersonalAssessmentComparisonModal } from './PersonalAssessmentComparisonModal';
import { ExternalTestsManager } from '../common/ExternalTestsManager';
import { MeasurableGoalsManager } from '../common/MeasurableGoalsManager';

interface PersonalStudentProfileProps {
  studentId: string;
  onBack: () => void;
  onOpenNewWorkout: () => void;
  onEditWorkout: (workout: Workout) => void;
  onOpenNewAssessment: () => void;
  onOpenAIAssistant: () => void;
}

export const PersonalStudentProfile: React.FC<PersonalStudentProfileProps> = ({
  studentId,
  onBack,
  onOpenNewWorkout,
  onEditWorkout,
  onOpenNewAssessment,
  onOpenAIAssistant
}) => {
  const { showToast } = useToast();

  const [student, setStudent] = useState<Student | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [evolutionHistory, setEvolutionHistory] = useState<any[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Active Tab
  const [activeTab, setActiveTab] = useState<
    'workouts' | 'assessments' | 'evolution' | 'photos' | 'bodymap' | 'logs' | 'attendance'
  >('workouts');

  // Modais Internos
  const [selectedWorkoutForExecution, setSelectedWorkoutForExecution] = useState<Workout | null>(null);
  const [isBeforeAfterOpen, setIsBeforeAfterOpen] = useState(false);
  const [isPdfExportOpen, setIsPdfExportOpen] = useState(false);
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);
  const [compareCurrentId, setCompareCurrentId] = useState<string | undefined>(undefined);
  const [comparePreviousId, setComparePreviousId] = useState<string | undefined>(undefined);
  const [showPreviousRecordsModal, setShowPreviousRecordsModal] = useState<boolean>(false);

  // Modal de Edição de Aluno
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editStatus, setEditStatus] = useState('active');
  const [editGoal, setEditGoal] = useState('');
  const [editLevel, setEditLevel] = useState('iniciante');
  const [editFrequency, setEditFrequency] = useState<number>(3);
  const [editWeight, setEditWeight] = useState<number | ''>('');
  const [editHeight, setEditHeight] = useState<number | ''>('');
  const [editRestrictions, setEditRestrictions] = useState('');
  const [savingStudent, setSavingStudent] = useState(false);

  const handleOpenEditStudent = () => {
    if (!student) return;
    setEditName(student.name || '');
    setEditPhone(student.phone || '');
    setEditEmail(student.email || '');
    setEditStatus(student.status || 'active');
    setEditGoal(student.goal || '');
    setEditLevel(student.experience_level || 'iniciante');
    setEditFrequency(student.weekly_frequency || 3);
    setEditWeight(student.current_weight || '');
    setEditHeight(student.height || '');
    setEditRestrictions(student.restrictions || '');
    setIsEditModalOpen(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) {
      showToast('Nome do aluno é obrigatório', 'error');
      return;
    }

    try {
      setSavingStudent(true);
      await ApiClient.put(`/v1/personal/students/${studentId}`, {
        name: editName.trim(),
        phone: editPhone.trim() || undefined,
        email: editEmail.trim() || undefined,
        status: editStatus,
        goal: editGoal,
        experience_level: editLevel,
        weekly_frequency: Number(editFrequency) || 3,
        current_weight: editWeight !== '' ? Number(editWeight) : null,
        height: editHeight !== '' ? Number(editHeight) : null,
        restrictions: editRestrictions
      });

      showToast('Dados do aluno atualizados com sucesso!', 'success');
      setIsEditModalOpen(false);
      loadAllStudentData();
    } catch (err: any) {
      console.error('Erro ao atualizar dados do aluno:', err);
      showToast(err.message || 'Erro ao atualizar dados do aluno', 'error');
    } finally {
      setSavingStudent(false);
    }
  };

  useEffect(() => {
    loadAllStudentData();
  }, [studentId]);

  const loadAllStudentData = async () => {
    try {
      setLoading(true);
      const [
        studentRes,
        assessRes,
        evolutionRes,
        photosRes,
        logsRes,
        recordsRes,
        attendanceRes
      ] = await Promise.all([
        ApiClient.get<{ student: Student; workouts: Workout[] }>(`/v1/personal/students/${studentId}`),
        ApiClient.get<{ assessments: Assessment[] }>(`/v1/personal/students/${studentId}/assessments`),
        ApiClient.get<{ history: any[] }>(`/v1/personal/students/${studentId}/evolution`),
        ApiClient.get<{ photos: any[] }>(`/v1/personal/students/${studentId}/photos`),
        ApiClient.get<{ logs: WorkoutLog[] }>(`/v1/personal/logs?studentId=${studentId}`),
        ApiClient.get<{ records: PersonalRecord[] }>(`/v1/personal/students/${studentId}/records`),
        ApiClient.get<AttendanceStats>(`/v1/personal/students/${studentId}/attendance`)
      ]);

      setStudent(studentRes.student);
      setWorkouts(studentRes.workouts || []);
      setAssessments(assessRes.assessments || []);
      setEvolutionHistory(evolutionRes.history || []);
      setPhotos(photosRes.photos || []);
      setLogs(logsRes.logs || []);
      setRecords(recordsRes.records || []);
      setAttendance(attendanceRes);
    } catch (err) {
      console.error('Erro ao carregar dados completos do aluno:', err);
      showToast('Erro ao carregar dados do aluno', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteWorkout = async (workoutId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta divisão de treino?')) return;
    try {
      await ApiClient.delete(`/v1/personal/workouts/${workoutId}`);
      showToast('Treino excluído com sucesso!', 'success');
      loadAllStudentData();
    } catch (err) {
      showToast('Erro ao excluir treino', 'error');
    }
  };

  const handleDuplicateWorkout = async (workoutId: string) => {
    try {
      await ApiClient.post(`/v1/personal/workouts/${workoutId}/duplicate`, {
        target_patient_id: studentId,
        new_title: 'Cópia de Treino'
      });
      showToast('Treino duplicado com sucesso!', 'success');
      loadAllStudentData();
    } catch (err) {
      showToast('Erro ao duplicar treino', 'error');
    }
  };

  const handleDeleteAssessment = async (assessmentId: string) => {
    if (!window.confirm('Excluir esta avaliação física e suas fotos?')) return;
    try {
      await ApiClient.delete(`/v1/personal/assessments/${assessmentId}`);
      showToast('Avaliação física removida com sucesso!', 'success');
      loadAllStudentData();
    } catch (err) {
      showToast('Erro ao remover avaliação física', 'error');
    }
  };

  if (loading || !student) {
    return (
      <div className="py-24 text-center text-slate-400 text-xs flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        Carregando prontuário e dados de treinamento do aluno...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Botão de Retorno e Ações Superiores */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button
          onClick={onBack}
          className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-sm transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Voltar para Lista de Alunos
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenNewWorkout}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Dumbbell className="w-3.5 h-3.5" />
            Prescrever Treino
          </button>
          <button
            onClick={onOpenNewAssessment}
            className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            Nova Avaliação
          </button>
          <button
            onClick={() => setIsPdfExportOpen(true)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            Ficha / PDF
          </button>
          <button
            type="button"
            onClick={() => setShowPreviousRecordsModal(true)}
            className="px-3.5 py-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            title="Visualizar histórico de prontuários clínicos e evoluções anteriores"
          >
            <FileText className="w-3.5 h-3.5" />
            Ver Prontuários Anteriores
          </button>
          <button
            onClick={onOpenAIAssistant}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            Assistente IA
          </button>
        </div>
      </div>

      {/* Cartão de Perfil do Aluno */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 border-2 border-indigo-200 text-indigo-700 flex items-center justify-center font-black text-xl uppercase overflow-hidden shadow-inner">
            {student.avatar_url ? (
              <img src={student.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              student.name.slice(0, 2)
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-800">{student.name}</h2>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  student.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {student.status === 'active' ? 'Ativo' : 'Inativo'}
              </span>
              <button
                onClick={handleOpenEditStudent}
                title="Editar dados e perfil do aluno"
                className="px-2.5 py-1 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 border border-indigo-200 rounded-lg flex items-center gap-1 transition-colors ml-1"
              >
                <Edit2 className="w-3 h-3" />
                <span>Editar Aluno</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-500">
              <span>Objetivo: <strong className="text-slate-700">{student.goal || 'Não informado'}</strong></span>
              <span>•</span>
              <span>Nível: <strong className="text-slate-700 capitalize">{student.experience_level || 'Geral'}</strong></span>
              <span>•</span>
              <span>Frequência: <strong className="text-slate-700">{student.weekly_frequency || 3}x/semana</strong></span>
              <span>•</span>
              <span>Peso / Altura: <strong className="text-slate-700">{student.current_weight || '—'} kg / {student.height || '—'} cm</strong></span>
            </div>

            {student.restrictions && (
              <div className="mt-2 text-[11px] text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5 font-medium border border-rose-100">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Restrições / Lesões: {student.restrictions}</span>
              </div>
            )}
          </div>
        </div>

        {/* Mini KPI no Perfil */}
        <div className="flex items-center gap-3 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6 w-full md:w-auto justify-around">
          <div className="text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">% Gordura</span>
            <strong className="text-lg font-black text-amber-600">
              {student.last_fat_pct ? `${student.last_fat_pct}%` : '—'}
            </strong>
          </div>
          <div className="w-px h-8 bg-slate-100" />
          <div className="text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Treinos Feitos</span>
            <strong className="text-lg font-black text-emerald-600">
              {attendance?.totalWorkoutsCompleted || 0}
            </strong>
          </div>
          <div className="w-px h-8 bg-slate-100" />
          <div className="text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Assiduidade</span>
            <strong className="text-lg font-black text-indigo-600">
              {attendance?.adherencePercentage || 0}%
            </strong>
          </div>
        </div>
      </div>

      {/* Navegação por Sub-Abas */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('workouts')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'workouts'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Dumbbell className="w-4 h-4" />
          Treinos Prescritos ({workouts.length})
        </button>

        <button
          onClick={() => setActiveTab('assessments')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'assessments'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          Avaliação Física & Dobras ({assessments.length})
        </button>

        <button
          onClick={() => setActiveTab('evolution')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'evolution'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Gráficos de Evolução
        </button>

        <button
          onClick={() => setActiveTab('photos')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'photos'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Camera className="w-4 h-4" />
          Fotos Antes × Depois ({photos.length})
        </button>

        <button
          onClick={() => setActiveTab('bodymap')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'bodymap'
              ? 'bg-amber-500 text-slate-950 shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Flame className="w-4 h-4" />
          Mapa Muscular 3D & Volume
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'logs'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Trophy className="w-4 h-4" />
          Execuções & Recordes (PRs)
        </button>

        <button
          onClick={() => setActiveTab('attendance')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'attendance'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Frequência & Aulas
        </button>
      </div>

      {/* Conteúdo da Aba Ativa */}
      <div className="space-y-6">
        {/* ABA: TREINOS PRESCRITOS */}
        {activeTab === 'workouts' && (
          <div className="space-y-4">
            {workouts.length === 0 ? (
              <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <Dumbbell className="w-10 h-10 text-slate-300" />
                <span>Nenhuma rotina ou divisão de treino prescrita para este aluno ainda.</span>
                <button
                  onClick={onOpenNewWorkout}
                  className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-sm"
                >
                  Criar Primeiro Treino
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {workouts.map((w) => (
                  <div
                    key={w.id}
                    className="bg-white rounded-3xl border border-slate-200 hover:border-emerald-300 p-5 shadow-sm transition-all flex flex-col justify-between space-y-4"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="w-9 h-9 rounded-2xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center shadow-sm">
                            {w.division}
                          </span>
                          <div>
                            <h4 className="font-bold text-slate-800 text-sm">{w.title}</h4>
                            <span className="text-[11px] text-slate-400">
                              {w.structure_type || 'Rotina Personal'} • {w.exercises_count || 0} exercícios
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onEditWorkout(w)}
                            title="Editar treino"
                            className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-50 transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDuplicateWorkout(w.id)}
                            title="Duplicar treino"
                            className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-slate-50 transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteWorkout(w.id)}
                            title="Excluir treino"
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {w.notes && (
                        <p className="mt-3 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 line-clamp-2">
                          {w.notes}
                        </p>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">
                        Criado em {new Date(w.created_at).toLocaleDateString('pt-BR')}
                      </span>

                      <button
                        onClick={async () => {
                          const full = await ApiClient.get<{ workout: Workout; exercises: any[] }>(`/v1/personal/workouts/${w.id}`);
                          setSelectedWorkoutForExecution({ ...w, exercises: full.exercises });
                        }}
                        className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
                      >
                        <Play className="w-3.5 h-3.5 fill-emerald-700" />
                        Iniciar Execução
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA: AVALIAÇÃO FÍSICA & DOBRAS */}
        {activeTab === 'assessments' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-purple-600" />
                <span>Histórico de Avaliações Físicas & Protocolo Pollock</span>
              </h4>
              <div className="flex items-center gap-2">
                {assessments.length >= 2 && (
                  <button
                    onClick={() => {
                      setCompareCurrentId(assessments[0].id);
                      setComparePreviousId(assessments[1].id);
                      setIsComparisonOpen(true);
                    }}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl flex items-center gap-1 shadow-sm transition-colors"
                  >
                    <GitCompare className="w-3.5 h-3.5" />
                    Comparar Avaliações
                  </button>
                )}
                <button
                  onClick={onOpenNewAssessment}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nova Avaliação
                </button>
              </div>
            </div>

            {assessments.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                Nenhuma avaliação física registrada ainda para este aluno.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {assessments.map((a, idx) => (
                  <div key={a.id} className="py-4 flex items-center justify-between hover:bg-slate-50 px-3 rounded-2xl transition-colors">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-slate-800">
                          {new Date(a.assessment_date).toLocaleDateString('pt-BR')}
                        </span>
                        <span className="text-[10px] uppercase font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
                          {a.protocol || 'Pollock 7'}
                        </span>
                        {a.tav_value !== null && a.tav_value !== undefined && (
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <Flame className="w-3 h-3 text-indigo-600" />
                            TAV: {a.tav_value} {a.tav_unit || 'nível'}
                            {a.tav_classification && ` (${a.tav_classification})`}
                          </span>
                        )}
                        {a.vo2_max && (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                            VO₂: {a.vo2_max} ml/kg/min
                          </span>
                        )}
                        {a.resting_heart_rate_bpm && (
                          <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
                            FC: {a.resting_heart_rate_bpm} bpm
                          </span>
                        )}
                        {a.photos_count && a.photos_count > 0 ? (
                          <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                            📷 {a.photos_count} fotos
                          </span>
                        ) : null}
                      </div>

                      <div className="text-xs text-slate-500 flex flex-wrap items-center gap-3">
                        <span>Peso: <strong className="text-slate-700">{a.weight} kg</strong></span>
                        <span>IMC: <strong className="text-slate-700">{a.bmi}</strong></span>
                        <span>% Gordura: <strong className="text-amber-600 font-bold">{a.body_fat_percentage}%</strong></span>
                        <span>Massa Magra: <strong className="text-emerald-600">{a.lean_mass_kg} kg</strong></span>
                        <span>Massa Muscular: <strong className="text-cyan-700">{a.muscle_mass_kg} kg</strong></span>
                        {a.waist_cm && <span>Cintura: <strong className="text-slate-700">{a.waist_cm} cm</strong></span>}
                        {a.hip_cm && <span>Quadril: <strong className="text-slate-700">{a.hip_cm} cm</strong></span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {assessments.length >= 2 && (
                        <button
                          onClick={() => {
                            const prev = assessments[idx + 1] || assessments[idx - 1] || assessments[0];
                            setCompareCurrentId(a.id);
                            setComparePreviousId(prev.id);
                            setIsComparisonOpen(true);
                          }}
                          className="px-2.5 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 transition-colors"
                          title="Comparar com outra avaliação"
                        >
                          <GitCompare className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Comparar</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteAssessment(a.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                        title="Excluir avaliação"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Testes, Protocolos & Avaliações Externas Universais */}
            {studentId && (
              <div className="pt-6 border-t border-slate-100">
                <ExternalTestsManager
                  patientId={studentId}
                  moduleType="ZemdaPersonal"
                  accentColor="purple"
                  title="Testes, Protocolos & Avaliações Externas (ZemdaPersonal)"
                />
              </div>
            )}
          </div>
        )}

        {/* ABA: GRÁFICOS DE EVOLUÇÃO */}
        {activeTab === 'evolution' && (
          <div className="space-y-6">
            <PersonalEvolutionCharts history={evolutionHistory} />
            {studentId && (
              <MeasurableGoalsManager
                patientId={studentId}
                domain="personal_trainer"
                title="Metas de Condicionamento, Carga & Composição Corporal"
              />
            )}
          </div>
        )}

        {/* ABA: FOTOS ANTES × DEPOIS */}
        {activeTab === 'photos' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <Camera className="w-4 h-4 text-indigo-600" />
                  <span>Galeria de Fotos Corporais ({photos.length})</span>
                </h4>
                <p className="text-xs text-slate-500">Registros em 4 ângulos: Frontal, Costas, Lat. Direita e Lat. Esquerda.</p>
              </div>

              <button
                onClick={() => setIsBeforeAfterOpen(true)}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                Comparativo Lado a Lado
              </button>
            </div>

            {photos.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                Nenhuma foto registrada para este aluno nas avaliações.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {photos.map((p) => (
                  <div key={p.id} className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden p-2 space-y-2">
                    <div className="w-full h-44 rounded-xl overflow-hidden bg-slate-200 flex items-center justify-center">
                      <SecureFileImage
                        fileId={p.file_id || p.fileId}
                        fallbackUrl={p.photo_url}
                        alt=""
                        className="w-full h-full object-cover"
                        placeholderText="Foto"
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] px-1">
                      <span className="font-bold uppercase text-indigo-700">
                        {p.photo_type === 'front'
                          ? 'Frente'
                          : p.photo_type === 'back'
                          ? 'Costas'
                          : p.photo_type === 'right'
                          ? 'Lat. Dir.'
                          : 'Lat. Esq.'}
                      </span>
                      <span className="text-slate-500">{new Date(p.photo_date).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA: MAPA MUSCULAR 3D & VOLUME */}
        {activeTab === 'bodymap' && (
          <PersonalBodyMapIntegration workouts={workouts} studentName={student.name} />
        )}

        {/* ABA: EXECUÇÕES & RECORDES (PRS) */}
        {activeTab === 'logs' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recordes Pessoais (PRs) */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm lg:col-span-1 space-y-4">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                <span>Quadro de Recordes (PRs)</span>
              </h4>

              {records.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  Nenhum recorde registrado ainda. Ao concluir treinos com cargas, os recordes serão computados automaticamente.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {records.map((r, idx) => (
                    <div key={idx} className="p-3 bg-amber-50/60 rounded-2xl border border-amber-100 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-xs text-slate-800 block">{r.exercise_name}</span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(r.date).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-base font-black text-amber-800">{r.max_load} kg</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Histórico de Execuções */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm lg:col-span-2 space-y-4">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span>Diário de Execuções Concluídas ({logs.length})</span>
              </h4>

              {logs.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  Nenhuma sessão de treino executada e registrada ainda.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <div key={log.id} className="py-3 flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-800">
                            {new Date(log.completed_at).toLocaleString('pt-BR')}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md">
                            Treino {log.division || 'Geral'} {log.workout_title ? `— ${log.workout_title}` : ''}
                          </span>
                        </div>

                        <div className="text-xs text-slate-500">
                          Duração: <strong>{log.duration_minutes || '—'} min</strong> • RPE:{' '}
                          <strong className="text-purple-700">{log.rpe || '—'}/10</strong>
                        </div>

                        {log.feedback_notes && (
                          <div className="text-xs text-slate-600 italic">"{log.feedback_notes}"</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ABA: FREQUÊNCIA & AULAS */}
        {activeTab === 'attendance' && attendance && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <span>Assiduidade & Frequência nos Treinos</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total de Sessões</span>
                <strong className="text-2xl font-black text-slate-800">{attendance.totalWorkoutsCompleted}</strong>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Últimos 28 Dias</span>
                <strong className="text-2xl font-black text-emerald-600">{attendance.lastMonthWorkouts} sessões</strong>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Média Semanal Real</span>
                <strong className="text-2xl font-black text-indigo-600">
                  {attendance.currentWeeklyAvg}x / semana
                </strong>
                <span className="text-[10px] text-slate-400 block mt-0.5">Meta: {attendance.targetWeeklyFrequency}x</span>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Índice de Aderência</span>
                <strong className="text-2xl font-black text-purple-600">{attendance.adherencePercentage}%</strong>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL DE EXECUÇÃO DE TREINO */}
      {selectedWorkoutForExecution && (
        <PersonalWorkoutExecutionModal
          isOpen={!!selectedWorkoutForExecution}
          onClose={() => setSelectedWorkoutForExecution(null)}
          onFinished={() => {
            setSelectedWorkoutForExecution(null);
            loadAllStudentData();
          }}
          workout={selectedWorkoutForExecution}
          studentName={student.name}
        />
      )}

      {/* MODAL DE ANTES × DEPOIS */}
      <PersonalBeforeAfterModal
        isOpen={isBeforeAfterOpen}
        onClose={() => setIsBeforeAfterOpen(false)}
        photos={photos}
        studentName={student.name}
      />

      {/* MODAL DE EXPORTAÇÃO PDF */}
      <PersonalPdfExportModal
        isOpen={isPdfExportOpen}
        onClose={() => setIsPdfExportOpen(false)}
        student={student}
        workouts={workouts}
        latestAssessment={assessments[0] || null}
      />

      {/* MODAL DE COMPARAÇÃO DE AVALIAÇÕES */}
      {isComparisonOpen && (
        <PersonalAssessmentComparisonModal
          isOpen={isComparisonOpen}
          onClose={() => setIsComparisonOpen(false)}
          student={student}
          assessmentsList={assessments}
          initialCurrentId={compareCurrentId}
          initialPreviousId={comparePreviousId}
        />
      )}

      {/* MODAL DE EDIÇÃO DE ALUNO */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Edit2 className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-800">Editar Dados do Aluno</h3>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                  >
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Objetivo Principal</label>
                  <input
                    type="text"
                    value={editGoal}
                    onChange={(e) => setEditGoal(e.target.value)}
                    placeholder="Ex: Hipertrofia"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nível de Treinamento</label>
                  <select
                    value={editLevel}
                    onChange={(e) => setEditLevel(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 capitalize"
                  >
                    <option value="iniciante">Iniciante</option>
                    <option value="intermediario">Intermediário</option>
                    <option value="avancado">Avançado</option>
                    <option value="atleta">Atleta</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Frequência Semanal</label>
                  <select
                    value={editFrequency}
                    onChange={(e) => setEditFrequency(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map((f) => (
                      <option key={f} value={f}>
                        {f}x por semana
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Peso Atual (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Ex: 75.5"
                    value={editWeight}
                    onChange={(e) => setEditWeight(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Altura (cm)</label>
                  <input
                    type="number"
                    step="1"
                    placeholder="Ex: 178"
                    value={editHeight}
                    onChange={(e) => setEditHeight(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Restrições / Lesões / Observações</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Condromalácia patelar grau II no joelho esquerdo; evitar agachamento profundo..."
                  value={editRestrictions}
                  onChange={(e) => setEditRestrictions(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingStudent}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-sm transition-colors"
                >
                  {savingStudent ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPreviousRecordsModal && (
        <PatientPreviousRecordsModal
          patientId={studentId}
          patientName={student.name}
          onClose={() => setShowPreviousRecordsModal(false)}
        />
      )}
    </div>
  );
};
