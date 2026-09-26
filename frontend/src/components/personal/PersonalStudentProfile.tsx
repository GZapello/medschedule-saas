import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
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
  FileText,
  Link2
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
import { PersonalStudentLinkModal } from './PersonalStudentLinkModal';

const AssessmentEditor = lazy(() => import('./PersonalAssessmentModal').then(module => ({default:module.PersonalAssessmentModal})));

interface PersonalStudentProfileProps {
  studentId: string;
  onBack?: () => void;
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
  const [editingAssessment,setEditingAssessment] = useState<any>(null);
  const [loadingAssessment,setLoadingAssessment] = useState(false);
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);
  const [compareCurrentId, setCompareCurrentId] = useState<string | undefined>(undefined);
  const [comparePreviousId, setComparePreviousId] = useState<string | undefined>(undefined);
  const [showPreviousRecordsModal, setShowPreviousRecordsModal] = useState<boolean>(false);
  const [isStudentLinkOpen, setIsStudentLinkOpen] = useState(false);

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

  // Foto do Aluno e Lightbox
  const [showPhotoLightbox, setShowPhotoLightbox] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Por favor, selecione um arquivo de imagem válido', 'error');
      return;
    }

    try {
      setUploadingPhoto(true);
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = async () => {
          const maxDim = 800;
          let width = img.width;
          let height = img.height;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const base64 = canvas.toDataURL('image/jpeg', 0.85);
            try {
              await ApiClient.put(`/v1/personal/students/${studentId}`, {
                avatar_url: base64
              });
              setStudent(prev => prev ? { ...prev, avatar_url: base64 } : prev);
              window.dispatchEvent(new CustomEvent('zemda-student-photo-updated', { detail: { studentId, avatarUrl: base64 } }));
              showToast('Foto do aluno atualizada com sucesso!', 'success');
              loadAllStudentData();
            } catch (err: any) {
              showToast(err.message || 'Erro ao salvar foto', 'error');
            }
          }
          setUploadingPhoto(false);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Erro ao processar imagem:', err);
      showToast('Erro ao processar imagem', 'error');
      setUploadingPhoto(false);
    } finally {
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Deseja realmente remover a foto do aluno?')) return;
    try {
      setUploadingPhoto(true);
      await ApiClient.put(`/v1/personal/students/${studentId}`, {
        avatar_url: null,
        photo_url: null
      });
      setStudent(prev => prev ? { ...prev, avatar_url: null } : prev);
      setShowPhotoLightbox(false);
      window.dispatchEvent(new CustomEvent('zemda-student-photo-updated', { detail: { studentId, avatarUrl: null } }));
      showToast('Foto do aluno removida com sucesso!', 'success');
      loadAllStudentData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao remover foto', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

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
    const handlePersonalRefresh = (e: any) => {
      if (!e.detail?.studentId || e.detail.studentId === studentId) {
        loadAllStudentData();
      }
    };
    window.addEventListener('zemda-personal-refresh', handlePersonalRefresh);
    return () => window.removeEventListener('zemda-personal-refresh', handlePersonalRefresh);
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
      setWorkouts(prev => prev.filter(w => w.id !== workoutId));
      await ApiClient.delete(`/v1/personal/workouts/${workoutId}`);
      showToast('Treino excluído com sucesso!', 'success');
      loadAllStudentData();
    } catch (err) {
      showToast('Erro ao excluir treino', 'error');
      loadAllStudentData();
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
      setAssessments(prev => prev.filter(a => a.id !== assessmentId));
      await ApiClient.delete(`/v1/personal/assessments/${assessmentId}`);
      showToast('Avaliação física removida com sucesso!', 'success');
      loadAllStudentData();
    } catch (err) {
      showToast('Erro ao remover avaliação física', 'error');
      loadAllStudentData();
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-slate-400 text-xs flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        Carregando prontuário e dados de treinamento do aluno...
      </div>
    );
  }

  if (!student) {
    return (
      <div className="py-16 text-center text-slate-500 text-xs flex flex-col items-center gap-3 bg-white rounded-3xl border border-slate-200 p-8 shadow-sm max-w-md mx-auto my-8">
        <AlertCircle className="w-10 h-10 text-amber-500" />
        <h3 className="font-bold text-slate-800 text-sm">Aluno não encontrado</h3>
        <p className="text-slate-500 text-xs">O aluno selecionado não foi localizado ou o identificador é inválido.</p>
        {onBack && (
          <button
            onClick={onBack}
            className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Voltar para Lista de Alunos
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Botão de Retorno e Ações Superiores */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {onBack ? (
          <button
            onClick={onBack}
            className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar para Lista de Alunos
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-orange-100 text-orange-800 text-[11px] font-bold rounded-xl flex items-center gap-1.5">
              <Dumbbell className="w-3.5 h-3.5" />
              Atendimento em Andamento
            </span>
          </div>
        )}

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
            onClick={() => setIsStudentLinkOpen(true)}
            className="px-3.5 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            title="Gerenciar link exclusivo do aluno para execução dos treinos prescritos"
          >
            <Link2 className="w-3.5 h-3.5" />
            Link do Aluno
          </button>
          <button
            type="button"
            data-tour="clinical-previous-records"
            onClick={() => setShowPreviousRecordsModal(true)}
            className="px-3.5 py-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            title="Visualizar histórico de prontuários clínicos e evoluções anteriores"
          >
            <FileText className="w-3.5 h-3.5" />
            Ver Prontuários Anteriores
          </button>
          <button
            data-tour="personal-ai-btn"
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
          <div className="relative group shrink-0">
            <input
              type="file"
              ref={photoInputRef}
              onChange={handlePhotoSelect}
              accept="image/*"
              className="hidden"
            />
            <div
              onClick={() => {
                if (student.avatar_url) setShowPhotoLightbox(true);
                else photoInputRef.current?.click();
              }}
              title={student.avatar_url ? "Clique para ampliar a foto" : "Clique para enviar uma foto"}
              className={`w-20 h-20 rounded-2xl bg-indigo-50 border-2 border-indigo-200 text-indigo-700 flex items-center justify-center font-black text-2xl uppercase overflow-hidden shadow-inner cursor-pointer hover:border-indigo-400 transition-all ${uploadingPhoto ? 'opacity-50 pointer-events-none' : ''}`}
            >
              {uploadingPhoto ? (
                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              ) : student.avatar_url ? (
                <img src={student.avatar_url} alt={student.name} className="w-full h-full object-cover" />
              ) : (
                student.name.slice(0, 2)
              )}
            </div>

            {/* Quick action buttons beneath/on avatar */}
            <div className="absolute -bottom-1 -right-1 flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  photoInputRef.current?.click();
                }}
                title="Trocar / Enviar Foto"
                className="w-6 h-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center shadow-md transition-colors"
              >
                <Camera className="w-3 h-3" />
              </button>
              {student.avatar_url && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  title="Remover Foto"
                  className="w-6 h-6 bg-rose-600 hover:bg-rose-700 text-white rounded-full flex items-center justify-center shadow-md transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
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

            {/* Ações de Foto do Aluno */}
            <div className="flex items-center gap-2 mt-2">
              {student.avatar_url ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowPhotoLightbox(true)}
                    className="px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Camera className="w-3 h-3 text-indigo-600" /> Visualizar foto
                  </button>
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    Trocar foto
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto()}
                    className="px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3 text-rose-500" /> Remover foto
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Camera className="w-3 h-3 text-indigo-600" /> Adicionar foto do aluno
                </button>
              )}
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
                {assessments.length >= 1 && (
                  <button
                    onClick={() => {
                      setCompareCurrentId(assessments[0].id);
                      setComparePreviousId((assessments[1] || assessments[0]).id);
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
                      {assessments.length >= 1 && (
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
                      <button type="button" disabled={loadingAssessment} className="text-xs text-indigo-700 px-2 py-1 rounded-lg hover:bg-indigo-50" onClick={async()=>{setLoadingAssessment(true);try{const data=await ApiClient.get<any>(`/v1/personal/assessments/${a.id}`);setEditingAssessment({...data.assessment,photos:data.photos});}catch{showToast('Não foi possível abrir a avaliação.','error');}finally{setLoadingAssessment(false);}}}>Avaliação postural</button>
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
        assessmentsList={assessments}
        workoutLogs={logs}
      />

      {/* MODAL DE COMPARAÇÃO DE AVALIAÇÕES */}
      {editingAssessment && <Suspense fallback={<p>Carregando avaliação…</p>}><AssessmentEditor isOpen postureOnly student={student} assessmentToEdit={editingAssessment} onClose={()=>setEditingAssessment(null)} onSaved={()=>{setEditingAssessment(null);loadAllStudentData();}} /></Suspense>}
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

      {/* LIGHTBOX DE FOTO DO ALUNO */}
      {showPhotoLightbox && student.avatar_url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowPhotoLightbox(false)}
        >
          <div className="relative max-w-2xl max-h-[90vh] flex flex-col items-center bg-slate-900/95 p-4 rounded-3xl border border-slate-700 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="w-full flex items-center justify-between pb-3 mb-2 border-b border-slate-800">
              <span className="text-white text-sm font-bold truncate">{student.name}</span>
              <button
                type="button"
                onClick={() => setShowPhotoLightbox(false)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* FOTO DO ALUNO */}
            <div className="flex items-center justify-center max-h-[65vh] overflow-hidden my-2">
              <img
                src={student.avatar_url}
                alt={student.name}
                className="max-h-[65vh] w-auto max-w-full rounded-2xl shadow-lg object-contain"
              />
            </div>

            {/* BOTÕES ABAIXO DA IMAGEM */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-3 mt-2 border-t border-slate-800 w-full">
              <button
                type="button"
                onClick={() => {
                  setShowPhotoLightbox(false);
                  photoInputRef.current?.click();
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md cursor-pointer transition-colors"
              >
                <Camera className="w-4 h-4" />
                <span>Trocar Foto</span>
              </button>
              <button
                type="button"
                onClick={() => handleRemovePhoto()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md cursor-pointer transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>Remover Foto</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Gerenciamento do Link do Aluno */}
      <PersonalStudentLinkModal
        isOpen={isStudentLinkOpen}
        onClose={() => setIsStudentLinkOpen(false)}
        studentId={studentId}
        studentName={student.name}
      />
    </div>
  );
};
