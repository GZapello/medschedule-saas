import React, { useState, useEffect } from 'react';
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

export const ZemdaPersonalView: React.FC = () => {
  const { showToast } = useToast();

  // Abas principais
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'students' | 'exercises' | 'templates' | 'calendar'>('dashboard');

  // Aluno atualmente selecionado para ver perfil detalhado
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

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
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentPhone, setNewStudentPhone] = useState('');
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [newStudentGoal, setNewStudentGoal] = useState('Hipertrofia');
  const [savingStudent, setSavingStudent] = useState(false);

  useEffect(() => {
    loadDashboard();
    loadStudents();
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
        goal: newStudentGoal,
        experience_level: 'iniciante',
        weekly_frequency: 3
      });

      showToast('Aluno cadastrado com sucesso no ZemdaPersonal!', 'success');
      setIsNewStudentModalOpen(false);
      setNewStudentName('');
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
      setSelectedStudentId(studentId);
    } catch (err) {
      showToast('Erro ao aplicar modelo', 'error');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Principal */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-700 text-white flex items-center justify-center shadow-lg shadow-emerald-600/20">
            <Dumbbell className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-800">ZemdaPersonal</h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-200">
                Treinamento & Prescrição
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Gestão de alunos, dobras cutâneas (Pollock), periodização e mapa 3D de sobrecarga muscular.
            </p>
          </div>
        </div>

        {/* Barra de Busca Rápida Global */}
        <div className="relative flex-1 max-w-xs md:max-w-sm">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar aluno, exercício ou treino..."
            value={searchQuery}
            onChange={(e) => handleGlobalSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none transition-all"
          />

          {/* Dropdown de Resultados da Busca */}
          {searchResults && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 p-3 z-50 max-h-80 overflow-y-auto space-y-3 animate-slideDown">
              {searchResults.students?.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block px-2 mb-1">Alunos</span>
                  {searchResults.students.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => {
                        setSelectedStudentId(s.id);
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
                        setSelectedStudentId(w.patient_id);
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
      </div>

      {/* Se o perfil do aluno estiver ativo, renderiza o perfil detalhado */}
      {selectedStudentId ? (
        <PersonalStudentProfile
          studentId={selectedStudentId}
          onBack={() => {
            setSelectedStudentId(null);
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
        /* Caso contrário, renderiza a navegação principal (Dashboard, Alunos, Exercícios, Modelos) */
        <div className="space-y-6">
          {/* Navegação por Abas Principais */}
          <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1">
            <button
              onClick={() => setCurrentTab('dashboard')}
              className={`px-4 py-2.5 text-xs font-bold rounded-xl flex items-center gap-2 transition-all whitespace-nowrap ${
                currentTab === 'dashboard'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Painel de Treinamento
            </button>

            <button
              onClick={() => setCurrentTab('students')}
              className={`px-4 py-2.5 text-xs font-bold rounded-xl flex items-center gap-2 transition-all whitespace-nowrap ${
                currentTab === 'students'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Users className="w-4 h-4" />
              Alunos & Prescrições ({students.length})
            </button>

            <button
              onClick={() => setIsExerciseLibraryOpen(true)}
              className="px-4 py-2.5 text-xs font-bold rounded-xl flex items-center gap-2 transition-all whitespace-nowrap text-slate-600 hover:bg-slate-100"
            >
              <Dumbbell className="w-4 h-4" />
              Biblioteca de Exercícios
            </button>

            <button
              onClick={() => setCurrentTab('templates')}
              className={`px-4 py-2.5 text-xs font-bold rounded-xl flex items-center gap-2 transition-all whitespace-nowrap ${
                currentTab === 'templates'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Layers className="w-4 h-4" />
              Modelos de Treino (Templates)
            </button>
          </div>

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
                      onClick={() => setSelectedStudentId(s.id)}
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
                        <select
                          onChange={(e) => {
                            if (e.target.value) handleApplyTemplate(tpl.id, e.target.value);
                          }}
                          className="px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg outline-none font-semibold text-slate-700"
                        >
                          <option value="">Aplicar a um aluno...</option>
                          {students.map((st) => (
                            <option key={st.id} value={st.id}>
                              {st.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
