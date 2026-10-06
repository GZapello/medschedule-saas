import { ClinicalFinishButton } from '../clinical/ClinicalFinishButton';
import { resolveConsultationAppointment } from '../clinical/resolveConsultationAppointment';
import { FinishConsultationModal } from '../clinical/FinishConsultationModal';
import { AnthropometricSexField } from './PersonalTechnicalFields';
import React, { useState, useEffect, useRef } from 'react';
import { useHorizontalTabScroll, HorizontalTabNav } from '../../hooks/useHorizontalTabScroll';
import {
  Dumbbell,
  Users,
  LayoutDashboard,
  Layers,
  Calendar,
  Sparkles,
  Search,
  Plus,
  ClipboardCheck,
  ChevronRight,
  TrendingUp,
  Activity,
  CheckCircle2,
  FileText,
  X
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Student, Workout } from './types';
import { PersonalDashboard } from './PersonalDashboard';
import { PersonalStudentProfile } from './PersonalStudentProfile';
import { PersonalExerciseLibraryModal } from './PersonalExerciseLibraryModal';
import { PersonalWorkoutBuilder } from './PersonalWorkoutBuilder';
import { PersonalAssessmentModal } from './PersonalAssessmentModal';
import { PersonalAIAssistantModal } from './PersonalAIAssistantModal';
import { PatientSearchSelect } from '../common/PatientSearchSelect';
import { ProfessionalModuleHeader } from '../common/ProfessionalModuleHeader';

interface ZemdaPersonalViewProps {
  initialStudentId?: string | null;
  initialAppointmentId?: string;
  onFinishConsultation?: () => void;
  onSelectStudent?: (studentId: string | null) => void;
  lockStudentContext?: boolean;
}

export const ZemdaPersonalView: React.FC<ZemdaPersonalViewProps> = ({
  initialStudentId,
  initialAppointmentId,
  onFinishConsultation,
  onSelectStudent,
  lockStudentContext = false
}) => {
  const { showToast } = useToast();
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(initialStudentId || null);
  const currentStudent = useRef(selectedStudentId);
  currentStudent.current = selectedStudentId;
  const [finishAppointment, setFinishAppointment] = useState<any>(null);
  const [openingFinish, setOpeningFinish] = useState(false);
  const [appointmentCompleted, setAppointmentCompleted] = useState(false);
  useEffect(() => { setFinishAppointment(null); setAppointmentCompleted(false); }, [initialAppointmentId, selectedStudentId]);
  const requestFinish = async () => {
    if (openingFinish || appointmentCompleted) return;
    if (!selectedStudentId) { showToast('Selecione um aluno para finalizar o atendimento.', 'info'); return; }
    setOpeningFinish(true);
    try {
      const id = await resolveConsultationAppointment({ patientId: selectedStudentId, appointmentId: initialAppointmentId, moduleType: 'ZemdaPersonal' });
      const { appointment } = await ApiClient.get<any>('/v1/appointments/' + id);
      if (currentStudent.current !== selectedStudentId) return;
      if (appointment.patient_id !== selectedStudentId) throw new Error('O agendamento pertence a outro aluno.');
      if (appointment.status === 'completed') { setAppointmentCompleted(true); showToast('Este atendimento já foi finalizado.', 'info'); return; }
      setFinishAppointment(appointment);
    } catch (error: any) { showToast(error.message || 'Não foi possível abrir a finalização.', 'error'); }
    finally { setOpeningFinish(false); }
  };

  // Abas principais
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'students' | 'exercises' | 'templates' | 'calendar'>('dashboard');

  const tabScroll = useHorizontalTabScroll(currentTab);
  const { tabScrollProps } = tabScroll;

  useEffect(() => {
    if (initialStudentId !== undefined) {
      setSelectedStudentId(initialStudentId);
    }
  }, [initialStudentId]);

  const handleSelectStudent = (id: string | null) => {
    if ((lockStudentContext || initialAppointmentId) && id !== initialStudentId) {
      showToast('O contexto está fixado no aluno deste atendimento.', 'info');
      return;
    }
    setSelectedStudentId(id);
    if (onSelectStudent) {
      onSelectStudent(id);
    }
  };

  // Dados do Dashboard
  const [dashboardData, setDashboardData] = useState<{
    metrics: any;
    pendingAssessments: any[];
    todayAppointments: any[];
    recentLogs: any[];
    volumeSummary: any[];
  }>({
    metrics: {
      totalStudents: 0,
      activeStudents: 0,
      activeWorkouts: 0,
      monthAssessments: 0,
      monthLogs: 0
    },
    pendingAssessments: [],
    todayAppointments: [],
    recentLogs: [],
    volumeSummary: []
  });

  // Lista de alunos
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsSearch, setStudentsSearch] = useState('');
  const [loadingStudents, setLoadingStudents] = useState(false);

  // Modelos de Treino (Templates)
  const [templates, setTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Busca Rápida Global (Smart Search)
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ students: any[]; exercises: any[]; workouts: any[] } | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Modais
  const [isExerciseLibraryOpen, setIsExerciseLibraryOpen] = useState(false);
  const [isWorkoutBuilderOpen, setIsWorkoutBuilderOpen] = useState(false);
  const [workoutToEdit, setWorkoutToEdit] = useState<Workout | null>(null);
  const [isAssessmentModalOpen, setIsAssessmentModalOpen] = useState(false);
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);
  const [isNewStudentModalOpen, setIsNewStudentModalOpen] = useState(false);

  // Form Novo Aluno Rápido
  const [newStudentBirth,setNewStudentBirth]=useState('');
  const [newStudentSex,setNewStudentSex]=useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentPhone, setNewStudentPhone] = useState('');
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [newStudentGoal, setNewStudentGoal] = useState('Hipertrofia');
  const [savingStudent, setSavingStudent] = useState(false);

  useEffect(() => {
    loadDashboard();
    loadStudents();

    const handlePhotoUpdated = (e: any) => {
      const { studentId, avatarUrl } = e.detail || {};
      if (studentId) {
        setStudents(prev => prev.map(s => s.id === studentId ? { ...s, avatar_url: avatarUrl } : s));
      }
    };
    window.addEventListener('zemda-student-photo-updated', handlePhotoUpdated);
    return () => window.removeEventListener('zemda-student-photo-updated', handlePhotoUpdated);
  }, []);

  useEffect(() => {
    if (currentTab === 'templates') {
      loadTemplates();
    }
  }, [currentTab]);

  const loadDashboard = async () => {
    try {
      const res = await ApiClient.get<any>('/v1/personal/dashboard');
      setDashboardData({
        metrics: res.metrics || {
          totalStudents: 0,
          activeStudents: 0,
          activeWorkouts: 0,
          monthAssessments: 0,
          monthLogs: 0
        },
        pendingAssessments: res.pendingAssessments || [],
        todayAppointments: res.todayAppointments || [],
        recentLogs: res.recentLogs || [],
        volumeSummary: res.volumeSummary || []
      });
    } catch (err) {
      console.error('Erro ao carregar dashboard ZemdaPersonal:', err);
    }
  };

  const loadStudents = async (q?: string) => {
    try {
      setLoadingStudents(true);
      const endpoint = q ? `/v1/personal/students?q=${encodeURIComponent(q)}` : '/v1/personal/students';
      const res = await ApiClient.get<{ students: Student[] }>(endpoint);
      setStudents(res.students || []);
    } catch (err) {
      console.error('Erro ao carregar alunos:', err);
      showToast('Erro ao carregar lista de alunos', 'error');
    } finally {
      setLoadingStudents(false);
    }
  };

  const loadTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const res = await ApiClient.get<{ templates: any[] }>('/v1/personal/templates');
      setTemplates(res.templates || []);
    } catch (err) {
      console.error('Erro ao carregar modelos:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleGlobalSearch = async (val: string) => {
    setSearchQuery(val);
    if (!val || val.length < 2) {
      setSearchResults(null);
      return;
    }

    try {
      setIsSearching(true);
      const res = await ApiClient.get<any>(`/v1/personal/search?q=${encodeURIComponent(val)}`);
      setSearchResults(res);
    } catch (err) {
      console.error('Erro na busca rápida:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleCreateQuickStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim()) {
      showToast('Nome do aluno é obrigatório', 'error');
      return;
    }

    try {
      setSavingStudent(true);
      // Cria o aluno de forma atômica no ZemdaPersonal
      const res = await ApiClient.post<{ success: boolean; student: Student }>('/v1/personal/students', {
        name: newStudentName.trim(),
        phone: newStudentPhone.trim(),
        email: newStudentEmail.trim(),
        birth_date:newStudentBirth || null,
        anthropometric_sex:newStudentSex || null,
        goal: newStudentGoal,
        experience_level: 'iniciante',
        weekly_frequency: 3
      });

      showToast('Aluno cadastrado com sucesso no ZemdaPersonal!', 'success');
      setIsNewStudentModalOpen(false);
      setNewStudentName('');
      setNewStudentBirth('');
      setNewStudentSex('');
      setNewStudentPhone('');
      setNewStudentEmail('');
      loadStudents();
      loadDashboard();
      if (res.student?.id) setSelectedStudentId(res.student.id);
    } catch (err: any) {
      console.error('Erro ao criar aluno:', err);
      showToast(err.message || 'Erro ao cadastrar aluno', 'error');
    } finally {
      setSavingStudent(false);
    }
  };

  const handleApplyTemplate = async (templateId: string, studentId: string) => {
    try {
      await ApiClient.post(`/v1/personal/templates/${templateId}/apply`, {
        patient_id: studentId
      });
      showToast('Modelo de treino aplicado ao aluno com sucesso!', 'success');
      handleSelectStudent(studentId);
    } catch (err) {
      showToast('Erro ao aplicar modelo', 'error');
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800">
      {/* CABEÇALHO DO MÓDULO ZEMDAPERSONAL */}
      {finishAppointment && <FinishConsultationModal appointment={finishAppointment}
        clinicalData={{ moduleType: 'ZemdaPersonal', moduleData: { studentId: selectedStudentId } }}
        onClose={() => setFinishAppointment(null)}
        onCompleted={() => { setAppointmentCompleted(true); }}
        onFinished={() => { setFinishAppointment(null); onFinishConsultation?.(); }} />}
      <ProfessionalModuleHeader
        icon={Dumbbell}
        iconGradient="from-emerald-600 to-teal-700"
        iconShadow="shadow-emerald-600/20"
        title="ZemdaPersonal"
        badgeLabel="Treinamento & Prescrição"
        badgeVariant="bg-emerald-100 text-emerald-800 border-emerald-200"
        description="Gestão de alunos, dobras cutâneas (Pollock), periodização e mapa 3D de sobrecarga muscular."
      >
      {!appointmentCompleted && <ClinicalFinishButton onClick={requestFinish} disabled={openingFinish} />}
        {/* Barra de Busca Rápida Global */}
        <div className="relative flex-1 min-w-[220px] max-w-xs md:max-w-sm">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar aluno, exercício ou treino..."
            value={searchQuery}
            onChange={(e) => handleGlobalSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none transition-all"
          />

          {/* Dropdown de Resultados da Busca */}
          {searchResults && (
            <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 p-3 z-50 max-h-80 overflow-y-auto space-y-3 animate-slideDown">
              {searchResults.students?.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block px-2 mb-1">Alunos</span>
                  {searchResults.students.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => {
                        handleSelectStudent(s.id);
                        setSearchResults(null);
                        setSearchQuery('');
                      }}
                      className="p-2 hover:bg-slate-50 rounded-xl cursor-pointer text-xs flex items-center justify-between"
                    >
                      <strong className="text-slate-800">{s.name}</strong>
                      <span className="text-[11px] text-slate-400">{s.phone || ''}</span>
                    </div>
                  ))}
                </div>
              )}

              {searchResults.exercises?.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block px-2 mb-1">Exercícios</span>
                  {searchResults.exercises.map((e) => (
                    <div
                      key={e.id}
                      onClick={() => {
                        setIsExerciseLibraryOpen(true);
                        setSearchResults(null);
                        setSearchQuery('');
                      }}
                      className="p-2 hover:bg-slate-50 rounded-xl cursor-pointer text-xs flex items-center justify-between"
                    >
                      <span className="text-slate-800">{e.name}</span>
                      <span className="text-[10px] uppercase text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">
                        {e.muscle_group}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {searchResults.workouts?.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block px-2 mb-1">Treinos</span>
                  {searchResults.workouts.map((w) => (
                    <div
                      key={w.id}
                      onClick={() => {
                        handleSelectStudent(w.patient_id);
                        setSearchResults(null);
                        setSearchQuery('');
                      }}
                      className="p-2 hover:bg-slate-50 rounded-xl cursor-pointer text-xs flex items-center justify-between"
                    >
                      <span className="text-slate-800">
                        {w.division ? `[${w.division}] ` : ''}{w.title}
                      </span>
                      <span className="text-[11px] text-slate-400">{w.patient_name}</span>
                    </div>
                  ))}
                </div>
              )}

              {(!searchResults.students?.length && !searchResults.exercises?.length && !searchResults.workouts?.length) && (
                <div className="text-center py-4 text-xs text-slate-400">
                  Nenhum resultado encontrado.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Ferramentas Rápidas no Cabeçalho */}
        <div className="shrink-0 flex items-center gap-2">
          <button
            type="button"
            data-tour="personal-exercises-tab"
            onClick={() => setIsExerciseLibraryOpen(true)}
            className="px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-xs flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer"
            title="Abrir acervo completo e biblioteca de exercícios"
          >
            <Dumbbell className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">Biblioteca de Exercícios</span>
          </button>
          <button
            type="button"
            data-tour="personal-ai-btn"
            onClick={() => setIsAIAssistantOpen(true)}
            className="px-3.5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-xs flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer"
            title="Assistente IA ZemdaPersonal"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Assistente IA</span>
          </button>
        </div>
      </ProfessionalModuleHeader>

      {/* NAVEGAÇÃO POR ABAS PADRONIZADA (Trilha Horizontal com Scroll Suave) */}
      <div className="bg-white border-b border-slate-200 shrink-0">
        <HorizontalTabNav scroll={tabScroll}>
          <div {...tabScrollProps} className={`${tabScrollProps.className} flex items-center gap-1 py-1`}>
            {[
              { id: 'dashboard', label: 'Painel de Treinamento', icon: LayoutDashboard },
              { id: 'students', label: `Alunos & Prescrições (${students.length})`, icon: Users },
              { id: 'templates', label: 'Modelos de Treino (Templates)', icon: Layers },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = currentTab === tab.id && !selectedStudentId;
              return (
                <button
                  key={tab.id}
                  data-tour={`personal-${tab.id}-tab`}
                  data-active={isActive ? 'true' : 'false'}
                  type="button"
                  onClick={() => {
                    if (selectedStudentId) {
                      handleSelectStudent(null);
                    }
                    setCurrentTab(tab.id as any);
                  }}
                  className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                    isActive
                      ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </HorizontalTabNav>
      </div>

      {/* CONTEÚDO PRINCIPAL */}
      <div className="flex-1 p-3 sm:p-6 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Se o perfil do aluno estiver ativo, renderiza o perfil detalhado */}
          {selectedStudentId ? (
            <PersonalStudentProfile
              studentId={selectedStudentId}
              onBack={lockStudentContext ? undefined : () => {
                handleSelectStudent(null);
                loadDashboard();
                loadStudents();
              }}
              onOpenNewWorkout={() => {
                setWorkoutToEdit(null);
                setIsWorkoutBuilderOpen(true);
              }}
              onEditWorkout={(w) => {
                setWorkoutToEdit(w);
                setIsWorkoutBuilderOpen(true);
              }}
              onOpenNewAssessment={() => setIsAssessmentModalOpen(true)}
              onOpenAIAssistant={() => setIsAIAssistantOpen(true)}
            />
          ) : (
            <>

          {/* CONTEÚDO: DASHBOARD */}
          {currentTab === 'dashboard' && (
            <PersonalDashboard
              metrics={dashboardData.metrics}
              pendingAssessments={dashboardData.pendingAssessments}
              todayAppointments={dashboardData.todayAppointments}
              recentLogs={dashboardData.recentLogs}
              volumeSummary={dashboardData.volumeSummary}
              onSelectStudent={(id) => setSelectedStudentId(id)}
              onOpenNewStudent={() => setIsNewStudentModalOpen(true)}
              onOpenNewWorkout={() => {
                setWorkoutToEdit(null);
                setIsWorkoutBuilderOpen(true);
              }}
              onOpenNewAssessment={() => setIsAssessmentModalOpen(true)}
              onOpenAIAssistant={() => setIsAIAssistantOpen(true)}
            />
          )}

          {/* CONTEÚDO: LISTA DE ALUNOS */}
          {currentTab === 'students' && (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-[240px]">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filtrar por nome, CPF ou telefone..."
                      value={studentsSearch}
                      onChange={(e) => {
                        setStudentsSearch(e.target.value);
                        loadStudents(e.target.value);
                      }}
                      className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <button
                  onClick={() => setIsNewStudentModalOpen(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Novo Aluno
                </button>
              </div>

              {loadingStudents ? (
                <div className="py-16 text-center text-slate-400 text-xs">Carregando lista de alunos...</div>
              ) : students.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-xs">
                  Nenhum aluno encontrado.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {students.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => handleSelectStudent(s.id)}
                      className="py-3.5 px-3 flex items-center justify-between hover:bg-slate-50 rounded-2xl cursor-pointer transition-colors group"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold text-xs flex items-center justify-center uppercase overflow-hidden">
                          {s.avatar_url ? (
                            <img src={s.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            s.name.slice(0, 2)
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-xs text-slate-800 group-hover:text-emerald-700 transition-colors">
                              {s.name}
                            </h4>
                            <span className="text-[10px] text-slate-400">
                              {s.gender === 'm' ? 'Masc' : s.gender === 'f' ? 'Fem' : ''}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                            <span>Objetivo: <strong>{s.goal || 'Geral'}</strong></span>
                            <span>•</span>
                            <span>{s.active_workouts_count || 0} treinos ativos</span>
                            {s.last_fat_pct && (
                              <>
                                <span>•</span>
                                <span className="text-amber-600 font-bold">{s.last_fat_pct}% gordura</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-emerald-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                          Abrir Perfil Completo
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CONTEÚDO: MODELOS DE TREINO (TEMPLATES) */}
          {currentTab === 'templates' && (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    <span>Modelos de Treino Padronizados (Templates)</span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Estruturas prontas (ABC, ABCD, Upper/Lower) que você pode aplicar em 1 clique a qualquer aluno.
                  </p>
                </div>
              </div>

              {loadingTemplates ? (
                <div className="py-16 text-center text-slate-400 text-xs">Carregando modelos...</div>
              ) : templates.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                  <Layers className="w-10 h-10 text-slate-300" />
                  <span>Nenhum modelo customizado salvo ainda.</span>
                  <span className="text-slate-500 text-[11px]">
                    Ao prescrever treinos, você pode salvá-los como modelos reutilizáveis.
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {templates.map((tpl) => (
                    <div key={tpl.id} className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <h5 className="font-bold text-slate-800 text-xs">{tpl.title}</h5>
                        <span className="text-[10px] uppercase font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                          {tpl.structure_type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">{tpl.description || 'Sem descrição'}</p>
                      <div className="text-[11px] text-slate-400">
                        {tpl.workouts?.length || 0} divisões de treino inclusas
                      </div>

                      <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                        <div className="w-full sm:w-64">
                          <PatientSearchSelect
                            isStudent
                            clientTermLabel="Aluno"
                            compact
                            value=""
                            onChange={(studentId) => {
                              if (studentId) handleApplyTemplate(tpl.id, studentId);
                            }}
                            placeholder="Aplicar a um aluno..."
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
            </>
          )}
        </div>
      </div>

      {/* MODAL: BIBLIOTECA DE EXERCÍCIOS */}
      <PersonalExerciseLibraryModal
        isOpen={isExerciseLibraryOpen}
        onClose={() => setIsExerciseLibraryOpen(false)}
      />

      {/* MODAL: CONSTRUTOR DE TREINO */}
      <PersonalWorkoutBuilder
        isOpen={isWorkoutBuilderOpen}
        onClose={() => {
          setIsWorkoutBuilderOpen(false);
          setWorkoutToEdit(null);
        }}
        onSaved={() => {
          loadDashboard();
          loadStudents();
          window.dispatchEvent(new CustomEvent('zemda-personal-refresh', { detail: { studentId: selectedStudentId } }));
        }}
        studentsList={students}
        student={students.find((s) => s.id === selectedStudentId) || null}
        workoutToEdit={workoutToEdit}
      />

      {/* MODAL: NOVA AVALIAÇÃO FÍSICA */}
      <PersonalAssessmentModal
        isOpen={isAssessmentModalOpen}
        onClose={() => setIsAssessmentModalOpen(false)}
        onSaved={() => {
          loadDashboard();
          loadStudents();
          window.dispatchEvent(new CustomEvent('zemda-personal-refresh', { detail: { studentId: selectedStudentId } }));
        }}
        studentsList={students}
        student={students.find((s) => s.id === selectedStudentId) || null}
      />

      {/* MODAL: ASSISTENTE IA */}
      <PersonalAIAssistantModal
        isOpen={isAIAssistantOpen}
        onClose={() => setIsAIAssistantOpen(false)}
        studentsList={students}
        student={students.find((s) => s.id === selectedStudentId) || null}
      />

      {/* MODAL: NOVO ALUNO RÁPIDO */}
      {isNewStudentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-sm">Cadastrar Novo Aluno</h3>
              <button onClick={() => setIsNewStudentModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateQuickStudent} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Lucas Gabriel Silveira"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Telefone / WhatsApp</label>
                <input
                  type="text"
                  placeholder="(11) 99999-9999"
                  value={newStudentPhone}
                  onChange={(e) => setNewStudentPhone(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail</label>
                <input
                  type="email"
                  placeholder="aluno@email.com"
                  value={newStudentEmail}
                  onChange={(e) => setNewStudentEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div><label className="block text-xs font-semibold text-slate-700 mb-1">Data de nascimento</label><input type="date" value={newStudentBirth} onChange={e=>setNewStudentBirth(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"/></div>
              <AnthropometricSexField value={newStudentSex} onChange={setNewStudentSex}/>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Objetivo Principal</label>
                <select
                  value={newStudentGoal}
                  onChange={(e) => setNewStudentGoal(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Hipertrofia">Hipertrofia Muscular</option>
                  <option value="Emagrecimento">Emagrecimento & Definição</option>
                  <option value="Força & Performance">Força & Performance Atlética</option>
                  <option value="Saúde & Longevidade">Saúde, Postura & Qualidade de Vida</option>
                  <option value="Condicionamento">Condicionamento Cardiorrespiratório</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewStudentModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingStudent}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-sm"
                >
                  {savingStudent ? 'Salvando...' : 'Cadastrar Aluno'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
