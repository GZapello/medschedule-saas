import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PatientPreviousRecordsModal } from '../clinical/PatientPreviousRecordsModal';
import { ExternalTestsManager } from '../common/ExternalTestsManager';
import {
  GraduationCap,
  BookOpen,
  User,
  School,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Plus,
  Save,
  Search,
  ChevronRight,
  Shield,
  ShieldCheck,
  Calendar,
  Sparkles,
  Bot,
  Brain,
  Pencil,
  Calculator,
  Layout,
  Clock,
  Printer,
  X,
  Share2,
  Trash2,
  FolderKanban,
  FileSpreadsheet,
  Building,
  Target,
  History
} from 'lucide-react';

interface PsychopedagogyWorkspaceProps {
  initialPatientId?: string;
  initialAppointmentId?: string;
  onFinishConsultation?: () => void;
}

export const PsychopedagogyWorkspace: React.FC<PsychopedagogyWorkspaceProps> = ({
  initialPatientId,
  initialAppointmentId,
  onFinishConsultation
}) => {
  const { currentUser, isClinicAdmin, clientTermLabel } = useAuth();
  const { showToast } = useToast();

  // Pacientes e Seleção
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId || '');
  const [patientData, setPatientData] = useState<any>(null);
  const [searchPatient, setSearchPatient] = useState<string>('');
  const [showPreviousRecordsModal, setShowPreviousRecordsModal] = useState<boolean>(false);

  // Modo: Clínico vs Institucional
  const [assessmentMode, setAssessmentMode] = useState<'clinical' | 'institutional'>('clinical');

  // Aba ativa dos 15 domínios
  type TabKey =
    | 'profile'
    | 'anamnese'
    | 'assessment'
    | 'reading'
    | 'writing'
    | 'math'
    | 'cognition'
    | 'materials'
    | 'institutional'
    | 'pip'
    | 'sessions'
    | 'family_school'
    | 'instruments'
    | 'documents'
    | 'history';

  const [activeTab, setActiveTab] = useState<TabKey>('profile');

  // Estados de dados
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // 1. Perfil do Aprendente
  const [profile, setProfile] = useState<any>({
    school_name: '',
    grade_level: '',
    shift: 'Matutino',
    teacher_name: '',
    coordinator_name: '',
    main_complaint: '',
    family_dynamics: '',
    development_history: '',
    strengths: '',
    difficulties: ''
  });

  // 2. Anamnese
  const [anamnese, setAnamnese] = useState<any>({
    pregnancy_history: '',
    motor_development: '',
    speech_development: '',
    sleep_routine: '',
    food_routine: '',
    school_adaptation: '',
    relationship_with_peers: '',
    emotional_factors: '',
    previous_interventions: ''
  });

  // 3. Avaliação & Hipóteses
  const [assessment, setAssessment] = useState<any>({
    pedagogical_hypothesis: '',
    strengths_observed: '',
    areas_of_difficulty: '',
    conclusions: '',
    recommendations: '',
    is_sealed: 0
  });

  // 4, 5, 6, 7. Domínios de Aprendizagem
  const [domains, setDomains] = useState<any[]>([]);
  const [newDomain, setNewDomain] = useState({
    domain_type: 'reading',
    subdomain: 'Fluência & Decodificação',
    status: 'desenvolvimento',
    qualitative_score: 3,
    observations: '',
    interventions: ''
  });

  // 8. Cadernos e Materiais
  const [notebookAnalysis, setNotebookAnalysis] = useState<any>({
    spatial_orientation: 'Adequada à folha e margem',
    erasure_frequency: 'Moderada',
    motor_cadence: 'Ritmo regular',
    error_patterns: 'Troca de grafemas foneticamente semelhantes',
    general_notes: ''
  });

  // 9. Institucional
  const [institutionalCase, setInstitutionalCase] = useState<any>({
    institution_name: '',
    demand_type: 'Clima Escolar e Aprendizagem',
    grade_involved: '',
    teachers_involved: '',
    observations: '',
    action_plan: '',
    status: 'open'
  });

  // 10. PIP (Plano de Intervenção)
  const [plans, setPlans] = useState<any[]>([]);
  const [currentPlan, setCurrentPlan] = useState<any>({
    title: 'Plano de Estimulação Psicopedagógica',
    objectives: '',
    methodology: '',
    frequency: '1x por semana (50 min)',
    status: 'active',
    goals: []
  });
  const [newGoal, setNewGoal] = useState({ description: '', target_date: '', target_domain: 'reading' });

  // 11. Sessões
  const [sessions, setSessions] = useState<any[]>([]);
  const [newSession, setNewSession] = useState({
    session_number: 1,
    session_date: new Date().toISOString().split('T')[0],
    objectives: '',
    activities_developed: '',
    learner_reactions: '',
    interventions_performed: '',
    results_observations: '',
    next_steps: ''
  });

  // 12. Família & Escola
  const [schoolContacts, setSchoolContacts] = useState<any[]>([]);
  const [newContact, setNewContact] = useState({
    contact_date: new Date().toISOString().split('T')[0],
    target_type: 'school', // 'school' | 'family'
    interlocutor_name: '',
    role_relationship: 'Professora Regente',
    subject: '',
    guidance_given: ''
  });

  // 13. Testes e Instrumentos (COM BLOQUEIO ÉTICO SATEPSI/CFP)
  const [instruments, setInstruments] = useState<any[]>([]);
  const [newInstrument, setNewInstrument] = useState({
    instrument_name: '',
    instrument_category: 'Provas Operatórias Piagetianas',
    application_date: new Date().toISOString().split('T')[0],
    results_summary: '',
    normative_reference: 'Visca / Piaget'
  });
  const [blockedAlert, setBlockedAlert] = useState<string | null>(null);

  // 14. Documentos
  const [docType, setDocType] = useState<'relatorio' | 'parecer' | 'encaminhamento'>('relatorio');
  const [docContent, setDocContent] = useState<string>('');

  // 15. Auditoria & Compartilhamento
  const [shares, setShares] = useState<any[]>([]);

  // Modal de Finalizar Atendimento
  const [showFinishModal, setShowFinishModal] = useState<boolean>(false);
  const [signatureMode, setSignatureMode] = useState<'sha256' | 'pades'>('sha256');

  // IA Psicopedagógica
  const [showAiModal, setShowAiModal] = useState<boolean>(false);
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [aiResult, setAiResult] = useState<string>('');
  const [generatingAi, setGeneratingAi] = useState<boolean>(false);

  // Carrega lista de aprendentes/pacientes
  useEffect(() => {
    async function loadPatients() {
      try {
        const res = await ApiClient.get<any[]>('/v1/patients');
        setPatients(res || []);
      } catch (err) {
        console.error('Erro ao carregar lista de pacientes:', err);
      }
    }
    loadPatients();
  }, []);

  // Ao selecionar um aprendente, carrega os dados psicopedagógicos
  useEffect(() => {
    if (!selectedPatientId) return;

    async function loadPatientDetails() {
      try {
        setLoading(true);
        const [pat, profRes, assessRes, sessRes, domsRes, instsRes, plansRes, contactsRes, sharesRes] = await Promise.all([
          ApiClient.get<any>(`/v1/patients/${selectedPatientId}`),
          ApiClient.get<any>(`/v1/psychopedagogy/profile/${selectedPatientId}`).catch(() => null),
          ApiClient.get<any>(`/v1/psychopedagogy/assessments/${selectedPatientId}`).catch(() => null),
          ApiClient.get<any[]>(`/v1/psychopedagogy/sessions/${selectedPatientId}`).catch(() => []),
          ApiClient.get<any[]>(`/v1/psychopedagogy/domains/${selectedPatientId}`).catch(() => []),
          ApiClient.get<any[]>(`/v1/psychopedagogy/instruments/${selectedPatientId}`).catch(() => []),
          ApiClient.get<any[]>(`/v1/psychopedagogy/plans/${selectedPatientId}`).catch(() => []),
          ApiClient.get<any[]>(`/v1/psychopedagogy/school-contacts/${selectedPatientId}`).catch(() => []),
          ApiClient.get<any[]>(`/v1/psychopedagogy/shares/${selectedPatientId}`).catch(() => [])
        ]);

        setPatientData(pat);
        if (profRes) setProfile(profRes);
        if (assessRes) setAssessment(Array.isArray(assessRes) ? (assessRes[0] || {}) : assessRes);
        setSessions(sessRes || []);
        setDomains(domsRes || []);
        setInstruments(instsRes || []);
        setPlans(plansRes || []);
        setSchoolContacts(contactsRes || []);
        setShares(sharesRes || []);
      } catch (err: any) {
        showToast(err.message || 'Erro ao carregar prontuário psicopedagógico.', 'error');
      } finally {
        setLoading(false);
      }
    }

    loadPatientDetails();
  }, [selectedPatientId]);

  // Salvar Perfil
  const handleSaveProfile = async () => {
    if (!selectedPatientId) return;
    try {
      setSaving(true);
      await ApiClient.post('/v1/psychopedagogy/profile', {
        patientId: selectedPatientId,
        schoolName: profile.school_name || profile.schoolName,
        schoolGrade: profile.grade_level || profile.school_grade || profile.schoolGrade,
        schoolShift: profile.shift || profile.school_shift || profile.schoolShift,
        schoolType: profile.school_type || profile.schoolType,
        teacherName: profile.teacher_name || profile.teacherName,
        coordinatorName: profile.coordinator_name || profile.coordinatorName,
        pedagogicalComplaint: profile.main_complaint || profile.pedagogical_complaint || profile.pedagogicalComplaint,
        referralSource: profile.referral_source || profile.referralSource,
        specialNeedsNotes: profile.special_needs_notes || profile.specialNeedsNotes,
        ...profile
      });
      showToast('Perfil do aprendente salvo com sucesso!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar perfil.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Salvar Avaliação
  const handleSaveAssessment = async () => {
    if (!selectedPatientId) return;
    try {
      setSaving(true);
      await ApiClient.post('/v1/psychopedagogy/assessments', {
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId,
        mode: assessmentMode,
        ...assessment
      });
      showToast('Avaliação e hipóteses diagnósticas salvas!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar avaliação.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Salvar Nova Sessão
  const handleSaveSession = async () => {
    if (!selectedPatientId) return;
    try {
      setSaving(true);
      await ApiClient.post('/v1/psychopedagogy/sessions', {
        ...newSession,
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId,
        sessionDate: newSession.session_date,
        sessionNumber: newSession.session_number,
        activitiesPerformed: newSession.activities_developed,
        studentEngagement: newSession.learner_reactions,
        observations: newSession.results_observations,
        nextSessionPlan: newSession.next_steps
      });
      showToast('Sessão psicopedagógica registrada!', 'success');
      const updated = await ApiClient.get<any[]>(`/v1/psychopedagogy/sessions/${selectedPatientId}`);
      setSessions(updated || []);
      setNewSession({
        session_number: (updated?.length || 0) + 1,
        session_date: new Date().toISOString().split('T')[0],
        objectives: '',
        activities_developed: '',
        learner_reactions: '',
        interventions_performed: '',
        results_observations: '',
        next_steps: ''
      });
    } catch (err: any) {
      showToast(err.message || 'Erro ao registrar sessão.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Adicionar Instrumento com Bloqueio Ético
  const handleAddInstrument = async () => {
    if (!selectedPatientId || !newInstrument.instrument_name) return;

    try {
      setSaving(true);
      await ApiClient.post('/v1/psychopedagogy/instruments', {
        patientId: selectedPatientId,
        instrumentName: newInstrument.instrument_name,
        instrumentCategory: newInstrument.instrument_category,
        applicationDate: newInstrument.application_date,
        percentileOrResult: newInstrument.results_summary,
        observations: newInstrument.normative_reference,
        ...newInstrument
      });
      showToast('Instrumento psicopedagógico registrado!', 'success');
      const updated = await ApiClient.get<any[]>(`/v1/psychopedagogy/instruments/${selectedPatientId}`);
      setInstruments(updated || []);
      setNewInstrument({
        instrument_name: '',
        instrument_category: 'Provas Operatórias Piagetianas',
        application_date: new Date().toISOString().split('T')[0],
        results_summary: '',
        normative_reference: 'Visca / Piaget'
      });
      setBlockedAlert(null);
    } catch (err: any) {
      // Se for bloqueio ético do SATEPSI/CFP
      if (err.message && (err.message.includes('CFP') || err.message.includes('SATEPSI') || err.message.includes('Psicologia'))) {
        setBlockedAlert(err.message);
      } else {
        showToast(err.message || 'Erro ao salvar instrumento.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  // Finalizar Atendimento e Selar Sessão
  const handleFinishConsultation = async () => {
    if (!selectedPatientId) return;

    try {
      setSaving(true);
      const res = await ApiClient.post<any>('/v1/psychopedagogy/sessions/finish', {
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId,
        sessionDate: new Date().toISOString().split('T')[0],
        title: 'Atendimento Psicopedagógico (ZemdaPP)',
        clinicalEvolution: newSession.results_observations || newSession.activities_developed || newSession.objectives || 'Atendimento psicopedagógico finalizado.',
        technicalNotes: newSession.next_steps || '',
        isSealed: true,
        useDigitalSignature: signatureMode === 'pades',
        sessionData: {
          session_date: new Date().toISOString().split('T')[0],
          objectives: newSession.objectives || 'Atendimento psicopedagógico finalizado.',
          activities_developed: newSession.activities_developed,
          interventions_performed: newSession.interventions_performed,
          results_observations: newSession.results_observations
        }
      });

      showToast('Atendimento psicopedagógico selado e assinado com sucesso!', 'success');
      setShowFinishModal(false);
      if (onFinishConsultation) onFinishConsultation();
    } catch (err: any) {
      showToast(err.message || 'Erro ao finalizar atendimento.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // IA Psicopedagógica Assistiva
  const handleRunAi = async () => {
    if (!aiPrompt.trim()) return;

    try {
      setGeneratingAi(true);
      const res = await ApiClient.post<{
        organizedText: string;
        disclaimer?: string;
      }>('/v1/ai/organize-evolution', {
        transcript: aiPrompt,
        mode: 'psychopedagogy',
        patientId: selectedPatientId
      });

      setAiResult(`${res.organizedText}\n\n${res.disclaimer || 'Aviso Ético: Hipótese pedagógica de apoio. Não constitui diagnóstico psicológico ou médico.'}`);
    } catch (err: any) {
      showToast(err.message || 'Erro ao consultar IA Psicopedagógica.', 'error');
    } finally {
      setGeneratingAi(false);
    }
  };

  const tabs: { key: TabKey; label: string; icon: any }[] = [
    { key: 'profile', label: '1. Perfil Aprendente', icon: GraduationCap },
    { key: 'anamnese', label: '2. Anamnese', icon: FileText },
    { key: 'assessment', label: '3. Avaliação & Hipóteses', icon: Brain },
    { key: 'reading', label: '4. Leitura', icon: BookOpen },
    { key: 'writing', label: '5. Escrita', icon: Pencil },
    { key: 'math', label: '6. Matemática', icon: Calculator },
    { key: 'cognition', label: '7. Funções Executivas', icon: Brain },
    { key: 'materials', label: '8. Cadernos & Materiais', icon: FolderKanban },
    { key: 'institutional', label: '9. Institucional', icon: Building },
    { key: 'pip', label: '10. PIP (Intervenção)', icon: Target },
    { key: 'sessions', label: '11. Sessões & Evolução', icon: Clock },
    { key: 'family_school', label: '12. Família & Escola', icon: School },
    { key: 'instruments', label: '13. Testes & Instrumentos', icon: ShieldCheck },
    { key: 'documents', label: '14. Documentos & Relatórios', icon: Printer },
    { key: 'history', label: '15. Sigilo & Auditoria', icon: History }
  ];

  return (
    <div className="flex flex-col h-full min-h-[85vh] bg-slate-50 text-slate-800 rounded-3xl overflow-hidden border border-slate-200 shadow-sm">
      {/* HEADER PRINCIPAL */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-20">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20 shrink-0">
            <GraduationCap className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-slate-900 tracking-tight">
                ZemdaPP — Psicopedagogia
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                CBO 2394-25
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Sigilo Absoluto
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Prontuário especializado em dificuldades de aprendizagem, funções executivas e intervenção pedagógica.
            </p>
          </div>
        </div>

        {/* Seleção do Aprendente + Modo Clínico/Institucional + Botão Finalizar */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Seletor de Modo */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              onClick={() => setAssessmentMode('clinical')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                assessmentMode === 'clinical' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Clínico
            </button>
            <button
              onClick={() => setAssessmentMode('institutional')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                assessmentMode === 'institutional' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Institucional
            </button>
          </div>

          {/* Seletor de Aprendente */}
          <div className="relative min-w-[200px]">
            <select
              value={selectedPatientId}
              onChange={e => setSelectedPatientId(e.target.value)}
              className="w-full pl-3 pr-8 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Selecione o Aprendente...</option>
              {patients.map(p => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Botão Ver Prontuários Anteriores */}
          {selectedPatientId && (
            <button
              type="button"
              onClick={() => setShowPreviousRecordsModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition-colors cursor-pointer shadow-xs"
              title="Visualizar histórico completo de prontuários e evoluções anteriores"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Ver Prontuários Anteriores</span>
            </button>
          )}

          {/* Botão de Assistente IA Psicopedagógica */}
          <button
            onClick={() => setShowAiModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold transition-colors cursor-pointer"
            title="Estratégias de aprendizagem e hipóteses pedagógicas com IA"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>IA Psicopedagógica</span>
          </button>

          {/* Botão Finalizar Atendimento */}
          <button
            onClick={() => setShowFinishModal(true)}
            disabled={!selectedPatientId}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Finalizar Atendimento</span>
          </button>
        </div>
      </div>

      {/* SE NENHUM APRENDENTE ESTIVER SELECIONADO */}
      {!selectedPatientId ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-16 h-16 rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
            <GraduationCap className="w-8 h-8" />
          </div>
          <h2 className="text-base font-bold text-slate-800 mb-1">Selecione um Aprendente</h2>
          <p className="text-xs text-slate-500 max-w-sm">
            Escolha um paciente/aprendente acima para abrir as 15 abas estruturadas de avaliação psicopedagógica, PIP e sessões.
          </p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* NAVEGAÇÃO VERTICAL DAS 15 ABAS */}
          <div className="w-full md:w-64 bg-white border-r border-slate-200 overflow-y-auto shrink-0 p-3 space-y-1">
            <div className="px-3 py-2 text-[10px] font-black uppercase text-slate-400 tracking-wider">
              Módulos ZemdaPP
            </div>
            {tabs.map(t => {
              const Icon = t.icon;
              const isActive = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* ÁREA DE CONTEÚDO DA ABA ATIVA */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* ALERTA DE BLOQUEIO ÉTICO (SE ACIONADO) */}
            {blockedAlert && (
              <div className="bg-rose-50 border-2 border-rose-300 p-5 rounded-2xl flex items-start gap-4 animate-in fade-in duration-200">
                <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                  <Shield className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-black text-rose-900">Bloqueio Ético & Legal Ativo</h4>
                  <p className="text-xs text-rose-800 leading-relaxed font-medium">
                    {blockedAlert}
                  </p>
                  <p className="text-[11px] text-rose-700">
                    Em conformidade com a Resolução CFP nº 009/2018 e o SATEPSI, este teste é privativo de psicólogos regularmente inscritos no CRP. O ZemdaPP preserva as boas práticas interdisciplinares.
                  </p>
                </div>
                <button
                  onClick={() => setBlockedAlert(null)}
                  className="text-rose-500 hover:text-rose-700 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* ABA 1: PERFIL DO APRENDENTE */}
            {activeTab === 'profile' && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">1. Perfil Escolar e Familiar do Aprendente</h3>
                    <p className="text-xs text-slate-500">Identificação institucional, queixa primária e histórico de suporte</p>
                  </div>
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{saving ? 'Salvando...' : 'Salvar Perfil'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Instituição de Ensino / Escola</label>
                    <input
                      type="text"
                      value={profile.school_name || ''}
                      onChange={e => setProfile({ ...profile, school_name: e.target.value })}
                      placeholder="Ex: Escola Estadual Machado de Assis"
                      className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Ano / Série Escolar</label>
                    <input
                      type="text"
                      value={profile.grade_level || ''}
                      onChange={e => setProfile({ ...profile, grade_level: e.target.value })}
                      placeholder="Ex: 4º ano do Ensino Fundamental"
                      className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Turno</label>
                    <select
                      value={profile.shift || 'Matutino'}
                      onChange={e => setProfile({ ...profile, shift: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 bg-white"
                    >
                      <option value="Matutino">Matutino</option>
                      <option value="Vespertino">Vespertino</option>
                      <option value="Integral">Integral</option>
                      <option value="Noturno">Noturno</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Professor(a) Regente</label>
                    <input
                      type="text"
                      value={profile.teacher_name || ''}
                      onChange={e => setProfile({ ...profile, teacher_name: e.target.value })}
                      placeholder="Nome do professor principal"
                      className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Coordenação / Orientação</label>
                    <input
                      type="text"
                      value={profile.coordinator_name || ''}
                      onChange={e => setProfile({ ...profile, coordinator_name: e.target.value })}
                      placeholder="Coordenador pedagógico"
                      className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Dinâmica Familiar</label>
                    <input
                      type="text"
                      value={profile.family_dynamics || ''}
                      onChange={e => setProfile({ ...profile, family_dynamics: e.target.value })}
                      placeholder="Ex: Pais casados, mora com a avó..."
                      className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Queixa Principal (Escola / Família)</label>
                    <textarea
                      rows={3}
                      value={profile.main_complaint || ''}
                      onChange={e => setProfile({ ...profile, main_complaint: e.target.value })}
                      placeholder="Descreva a queixa que motivou a busca pelo atendimento psicopedagógico..."
                      className="w-full p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 leading-relaxed"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Potencialidades & Interesses (Pontos Fortes)</label>
                      <textarea
                        rows={3}
                        value={profile.strengths || ''}
                        onChange={e => setProfile({ ...profile, strengths: e.target.value })}
                        placeholder="Áreas de facilidade, motivação e engajamento..."
                        className="w-full p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Dificuldades Observadas</label>
                      <textarea
                        rows={3}
                        value={profile.difficulties || ''}
                        onChange={e => setProfile({ ...profile, difficulties: e.target.value })}
                        placeholder="Obstáculos na assimilação, acomodação ou expressão do conteúdo..."
                        className="w-full p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ABA 2: ANAMNESE */}
            {activeTab === 'anamnese' && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">2. Anamnese Psicopedagógica</h3>
                    <p className="text-xs text-slate-500">Histórico de desenvolvimento, marcos e rotinas</p>
                  </div>
                  <button
                    onClick={handleSaveProfile}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                  >
                    Salvar Anamnese
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Histórico Gestacional e Parto</label>
                    <textarea
                      rows={2}
                      value={anamnese.pregnancy_history || ''}
                      onChange={e => setAnamnese({ ...anamnese, pregnancy_history: e.target.value })}
                      placeholder="Intercorrências, pré-natal, tempo de gestação..."
                      className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Marcos Motores</label>
                    <textarea
                      rows={2}
                      value={anamnese.motor_development || ''}
                      onChange={e => setAnamnese({ ...anamnese, motor_development: e.target.value })}
                      placeholder="Sustentação da cabeça, sentar, engatinhar, andar..."
                      className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Desenvolvimento da Linguagem</label>
                    <textarea
                      rows={2}
                      value={anamnese.speech_development || ''}
                      onChange={e => setAnamnese({ ...anamnese, speech_development: e.target.value })}
                      placeholder="Primeiras palavras, balbucio, frases completas..."
                      className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Rotina de Sono e Alimentação</label>
                    <textarea
                      rows={2}
                      value={anamnese.sleep_routine || ''}
                      onChange={e => setAnamnese({ ...anamnese, sleep_routine: e.target.value })}
                      placeholder="Qualidade do sono, horários, seletividade alimentar..."
                      className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ABA 3: AVALIAÇÃO & HIPÓTESES */}
            {activeTab === 'assessment' && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">3. Avaliação Inicial & Hipóteses Pedagógicas</h3>
                    <p className="text-xs text-slate-500">Síntese diagnóstica do processo de aprendizagem</p>
                  </div>
                  <button
                    onClick={handleSaveAssessment}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                  >
                    Salvar Avaliação
                  </button>
                </div>
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Hipótese Diagnóstica Psicopedagógica</label>
                    <textarea
                      rows={4}
                      value={assessment.pedagogical_hypothesis || ''}
                      onChange={e => setAssessment({ ...assessment, pedagogical_hypothesis: e.target.value })}
                      placeholder="Hipótese baseada nas observações clínicas e pedagógicas (Ex: Dificuldade específica em decodificação fonológica sugestiva de dislexia de desenvolvimento)..."
                      className="w-full p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 leading-relaxed font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Conclusões Pedagógicas</label>
                      <textarea
                        rows={3}
                        value={assessment.conclusions || ''}
                        onChange={e => setAssessment({ ...assessment, conclusions: e.target.value })}
                        placeholder="Conclusão síntese..."
                        className="w-full p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Recomendações para Escola e Família</label>
                      <textarea
                        rows={3}
                        value={assessment.recommendations || ''}
                        onChange={e => setAssessment({ ...assessment, recommendations: e.target.value })}
                        placeholder="Recomendações e adaptações curriculares..."
                        className="w-full p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ABA 4: LEITURA */}
            {activeTab === 'reading' && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
                <h3 className="text-base font-bold text-slate-900">4. Avaliação do Domínio de Leitura</h3>
                <p className="text-xs text-slate-500">Decodificação grafema-fonema, fluência e compreensão textual</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                    <strong className="text-slate-800 block">Decodificação Fonológica</strong>
                    <p className="text-slate-500 text-[11px]">Conversão grafofonêmica e leitura de pseudopalavras</p>
                    <select className="w-full p-2 rounded-xl border border-slate-300 bg-white">
                      <option>Adequada para o ano escolar</option>
                      <option>Hesitante / Silabada</option>
                      <option>Com trocas fonéticas frequentes</option>
                      <option>Não consolidada</option>
                    </select>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                    <strong className="text-slate-800 block">Fluência e Prosódia</strong>
                    <p className="text-slate-500 text-[11px]">Velocidade, pontuação e ritmo de leitura</p>
                    <select className="w-full p-2 rounded-xl border border-slate-300 bg-white">
                      <option>Fluente e expressiva</option>
                      <option>Leitura lenta com esforço</option>
                      <option>Sem respeito à pontuação</option>
                    </select>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                    <strong className="text-slate-800 block">Compreensão Textual</strong>
                    <p className="text-slate-500 text-[11px]">Capacidade de extrair sentido e inferências</p>
                    <select className="w-full p-2 rounded-xl border border-slate-300 bg-white">
                      <option>Compreensão literal e inferencial</option>
                      <option>Apenas compreensão literal</option>
                      <option>Dificuldade expressiva na retenção</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ABA 5: ESCRITA */}
            {activeTab === 'writing' && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
                <h3 className="text-base font-bold text-slate-900">5. Avaliação da Escrita & Grafomotricidade</h3>
                <p className="text-xs text-slate-500">Ortografia, estruturação textual e motricidade fina</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                    <strong className="text-slate-800 block">Grafomotricidade & Pegada</strong>
                    <textarea rows={3} placeholder="Tipo de preensão do lápis, tônus muscular, pressão no papel..." className="w-full p-2.5 rounded-xl border border-slate-300 bg-white" />
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                    <strong className="text-slate-800 block">Padrões de Erros Ortográficos</strong>
                    <textarea rows={3} placeholder="Troca de surdas/sonoras (p/b, t/d), omissões de letras, aglutinações..." className="w-full p-2.5 rounded-xl border border-slate-300 bg-white" />
                  </div>
                </div>
              </div>
            )}

            {/* ABA 6: MATEMÁTICA */}
            {activeTab === 'math' && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
                <h3 className="text-base font-bold text-slate-900">6. Raciocínio Lógico & Habilidades Matemáticas</h3>
                <p className="text-xs text-slate-500">Senso numérico, operações básicas e resolução de problemas</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                    <strong className="text-slate-800 block">Subitizing & Senso Numérico</strong>
                    <p className="text-slate-500 text-[11px]">Reconhecimento visual imediato de quantidades</p>
                    <select className="w-full p-2 rounded-xl border border-slate-300 bg-white">
                      <option>Preservado</option>
                      <option>Comprometido / Dependente de contagem</option>
                    </select>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                    <strong className="text-slate-800 block">Operações e Algoritmos</strong>
                    <p className="text-slate-500 text-[11px]">Adição, subtração, multiplicação e divisão</p>
                    <select className="w-full p-2 rounded-xl border border-slate-300 bg-white">
                      <option>Consolidadas para a faixa etária</option>
                      <option>Compreende o conceito, erra o cálculo mecânico</option>
                      <option>Dificuldade no conceito posicional (unidade/dezena)</option>
                    </select>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                    <strong className="text-slate-800 block">Interpretação de Problemas</strong>
                    <p className="text-slate-500 text-[11px]">Tradução do enunciado verbal em cálculo</p>
                    <select className="w-full p-2 rounded-xl border border-slate-300 bg-white">
                      <option>Interpreta com autonomia</option>
                      <option>Dificuldade na interpretação do texto</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ABA 7: FUNÇÕES EXECUTIVAS */}
            {activeTab === 'cognition' && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
                <h3 className="text-base font-bold text-slate-900">7. Funções Executivas & Atenção</h3>
                <p className="text-xs text-slate-500">Controle inibitório, flexibilidade mental e memória de trabalho</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                    <strong className="text-slate-800 block">Atenção Sustentada</strong>
                    <p className="text-slate-500 text-[11px]">Tempo de foco contínuo na atividade</p>
                    <select className="w-full p-2 rounded-xl border border-slate-300 bg-white">
                      <option>Compatível com a idade</option>
                      <option>Facilmente dispersável por estímulos externos</option>
                      <option>Fatiga precoce em tarefas intelectuais</option>
                    </select>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                    <strong className="text-slate-800 block">Memória de Trabalho</strong>
                    <p className="text-slate-500 text-[11px]">Retenção de comandos de múltiplas etapas</p>
                    <select className="w-full p-2 rounded-xl border border-slate-300 bg-white">
                      <option>Retém 3 ou mais instruções seguidas</option>
                      <option>Perde etapas intermediárias</option>
                    </select>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                    <strong className="text-slate-800 block">Controle Inibitório</strong>
                    <p className="text-slate-500 text-[11px]">Capacidade de inibir impulsos de resposta imediata</p>
                    <select className="w-full p-2 rounded-xl border border-slate-300 bg-white">
                      <option>Bom autocontrole</option>
                      <option>Responde impulsivamente sem ler tudo</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ABA 8: CADERNOS E MATERIAIS */}
            {activeTab === 'materials' && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
                <h3 className="text-base font-bold text-slate-900">8. Análise de Material Escolar & Cadernos</h3>
                <p className="text-xs text-slate-500">Organização espacial, rasuras, ritmo e sequência</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Orientação Espacial na Folha</label>
                    <input
                      type="text"
                      value={notebookAnalysis.spatial_orientation}
                      onChange={e => setNotebookAnalysis({ ...notebookAnalysis, spatial_orientation: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Frequência de Rasuras e Apagamentos</label>
                    <input
                      type="text"
                      value={notebookAnalysis.erasure_frequency}
                      onChange={e => setNotebookAnalysis({ ...notebookAnalysis, erasure_frequency: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-slate-300"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ABA 9: INSTITUCIONAL */}
            {activeTab === 'institutional' && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
                <h3 className="text-base font-bold text-slate-900">9. Avaliação Psicopedagógica Institucional</h3>
                <p className="text-xs text-slate-500">Clima escolar, relação professor-aluno e inclusão pedagógica</p>
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Nome da Instituição Escolar</label>
                    <input
                      type="text"
                      value={institutionalCase.institution_name}
                      onChange={e => setInstitutionalCase({ ...institutionalCase, institution_name: e.target.value })}
                      placeholder="Nome da escola ou faculdade"
                      className="w-full p-2.5 rounded-xl border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Diagnóstico Institucional & Plano de Ação</label>
                    <textarea
                      rows={4}
                      value={institutionalCase.action_plan}
                      onChange={e => setInstitutionalCase({ ...institutionalCase, action_plan: e.target.value })}
                      placeholder="Medidas pedagógicas institucionais, formação de professores, oficinas de mediação..."
                      className="w-full p-3 rounded-xl border border-slate-300"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ABA 10: PIP (PLANO DE INTERVENÇÃO PSICOPEDAGÓGICA) */}
            {activeTab === 'pip' && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">10. PIP — Plano de Intervenção Psicopedagógica</h3>
                    <p className="text-xs text-slate-500">Metas SMART, estratégias e cronograma de estimulação</p>
                  </div>
                  <button className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold">
                    Novo Plano (PIP)
                  </button>
                </div>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Título do Plano</label>
                    <input
                      type="text"
                      value={currentPlan.title}
                      onChange={e => setCurrentPlan({ ...currentPlan, title: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Objetivos Gerais e Estratégias</label>
                    <textarea
                      rows={3}
                      value={currentPlan.objectives}
                      onChange={e => setCurrentPlan({ ...currentPlan, objectives: e.target.value })}
                      placeholder="Ex: Estimular a consciência fonológica mediante jogos de rimas e aliterações..."
                      className="w-full p-3 rounded-xl border border-slate-300"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ABA 11: SESSÕES DE ATENDIMENTO COM SELAMENTO */}
            {activeTab === 'sessions' && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">11. Sessões de Atendimento & Evoluções</h3>
                    <p className="text-xs text-slate-500">Registro oficial de cada atendimento psicopedagógico</p>
                  </div>
                </div>

                {/* Formulário de Nova Sessão */}
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">Registrar Sessão Atual</span>
                    <span className="font-mono text-slate-500">Data: {newSession.session_date}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Objetivos da Sessão</label>
                      <input
                        type="text"
                        value={newSession.objectives}
                        onChange={e => setNewSession({ ...newSession, objectives: e.target.value })}
                        placeholder="Ex: Treino de rota fonológica e mediação piagetiana"
                        className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Atividades e Jogos Desenvolvidos</label>
                      <input
                        type="text"
                        value={newSession.activities_developed}
                        onChange={e => setNewSession({ ...newSession, activities_developed: e.target.value })}
                        placeholder="Ex: Jogo Lince Fonológico, Torre de Hanói..."
                        className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Reações do Aprendente & Mediações Realizadas</label>
                    <textarea
                      rows={3}
                      value={newSession.interventions_performed}
                      onChange={e => setNewSession({ ...newSession, interventions_performed: e.target.value })}
                      placeholder="Descreva o comportamento frente ao erro, tolerância à frustração e mediações..."
                      className="w-full p-3 rounded-xl border border-slate-300 bg-white leading-relaxed"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveSession}
                      disabled={saving}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer transition-colors"
                    >
                      {saving ? 'Gravando...' : 'Salvar Sessão'}
                    </button>
                  </div>
                </div>

                {/* Histórico de Sessões Registradas */}
                <div className="space-y-3">
                  <h4 className="font-bold text-slate-800 text-sm">Histórico de Sessões ({sessions.length})</h4>
                  {sessions.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Nenhuma sessão registrada anteriormente.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {sessions.map(s => (
                        <div key={s.id} className="py-3.5 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-900">
                              Sessão #{s.session_number || 1} — {new Date(s.session_date).toLocaleDateString('pt-BR')}
                            </span>
                            {s.is_sealed === 1 ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                <ShieldCheck className="w-3 h-3" />
                                Selada & Assinada
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">Em aberto</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600">{s.objectives}</p>
                          {s.signature_hash && (
                            <div className="text-[10px] font-mono text-slate-400 break-all">
                              Hash: {s.signature_hash}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ABA 12: FAMÍLIA & ESCOLA */}
            {activeTab === 'family_school' && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
                <h3 className="text-base font-bold text-slate-900">12. Articulação com a Escola & Família</h3>
                <p className="text-xs text-slate-500">Reuniões pedagógicas, orientações e devolutivas</p>
                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Destinatário</label>
                      <select
                        value={newContact.target_type}
                        onChange={e => setNewContact({ ...newContact, target_type: e.target.value })}
                        className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                      >
                        <option value="school">Escola (Professores / Coordenação)</option>
                        <option value="family">Família (Responsáveis)</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Interlocutor</label>
                      <input
                        type="text"
                        value={newContact.interlocutor_name}
                        onChange={e => setNewContact({ ...newContact, interlocutor_name: e.target.value })}
                        placeholder="Nome da pessoa atendida"
                        className="w-full p-2.5 rounded-xl border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Assunto / Pauta</label>
                      <input
                        type="text"
                        value={newContact.subject}
                        onChange={e => setNewContact({ ...newContact, subject: e.target.value })}
                        placeholder="Ex: Adaptação das avaliações bimestrais"
                        className="w-full p-2.5 rounded-xl border border-slate-300"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Orientações Transmitidas</label>
                    <textarea
                      rows={3}
                      value={newContact.guidance_given}
                      onChange={e => setNewContact({ ...newContact, guidance_given: e.target.value })}
                      placeholder="Orientações de posicionamento em sala, tempo estendido, recursos multissensoriais..."
                      className="w-full p-3 rounded-xl border border-slate-300"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ABA 13: TESTES E INSTRUMENTOS COM BLOQUEIO ÉTICO */}
            {activeTab === 'instruments' && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">13. Testes e Instrumentos Avaliativos</h3>
                    <p className="text-xs text-slate-500">
                      Instrumentos psicopedagógicos e provas operatórias (com bloqueio ético de testes privativos da Psicologia)
                    </p>
                  </div>
                </div>

                <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-900 space-y-1">
                    <strong className="block font-bold">Resguardo Interdisciplinar Ético (CFP / SATEPSI)</strong>
                    <p className="leading-relaxed">
                      O ZemdaPP atua estritamente no campo de competência psicopedagógica (Provas Piagetianas, EOCA, TDE, Prolec, etc.). Testes psicológicos privativos (como WISC, WASI, BPA, HTP, Raven, Columbia) são automaticamente bloqueados para não-psicólogos.
                    </p>
                  </div>
                </div>

                {/* Formulário de Adição */}
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3 text-xs">
                  <span className="font-bold text-slate-900 block">Registrar Aplicação de Teste / Instrumento</span>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Nome do Instrumento</label>
                      <input
                        type="text"
                        value={newInstrument.instrument_name}
                        onChange={e => setNewInstrument({ ...newInstrument, instrument_name: e.target.value })}
                        placeholder="Ex: EOCA, Provas Operatórias Piagetianas, TDE..."
                        className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Categoria</label>
                      <select
                        value={newInstrument.instrument_category}
                        onChange={e => setNewInstrument({ ...newInstrument, instrument_category: e.target.value })}
                        className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                      >
                        <option value="Provas Operatórias Piagetianas">Provas Operatórias Piagetianas</option>
                        <option value="EOCA">EOCA (Entrevista Operativa Centrada na Aprendizagem)</option>
                        <option value="Provas Pedagógicas">Provas Pedagógicas (TDE, PROLEC)</option>
                        <option value="Técnicas Projetivas Pedagógicas">Técnicas Projetivas Pedagógicas</option>
                        <option value="Outro">Outro Instrumento Psicopedagógico</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Referência / Autor</label>
                      <input
                        type="text"
                        value={newInstrument.normative_reference}
                        onChange={e => setNewInstrument({ ...newInstrument, normative_reference: e.target.value })}
                        placeholder="Ex: Sara Paín, Jorge Visca, Piaget"
                        className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Síntese dos Resultados e Observações</label>
                    <textarea
                      rows={3}
                      value={newInstrument.results_summary}
                      onChange={e => setNewInstrument({ ...newInstrument, results_summary: e.target.value })}
                      placeholder="Resultados qualitativos da aplicação..."
                      className="w-full p-3 rounded-xl border border-slate-300 bg-white"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={handleAddInstrument}
                      disabled={saving}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer transition-colors"
                    >
                      {saving ? 'Validando...' : 'Adicionar Instrumento'}
                    </button>
                  </div>
                </div>

                {/* Lista de Instrumentos */}
                <div className="space-y-3">
                  <h4 className="font-bold text-slate-800 text-sm">Instrumentos Aplicados ({instruments.length})</h4>
                  {instruments.map(i => (
                    <div key={i.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <strong className="text-slate-900 font-bold">{i.instrument_name}</strong>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(i.application_date).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                      <p className="text-slate-600">{i.results_summary}</p>
                    </div>
                  ))}
                </div>

                {/* Testes e Anexos Externos Universais */}
                {selectedPatientId && (
                  <div className="pt-6 border-t border-slate-100">
                    <ExternalTestsManager
                      patientId={selectedPatientId}
                      moduleType="ZemdaPP"
                      appointmentId={initialAppointmentId}
                      accentColor="indigo"
                      title="Testes, Protocolos & Documentos Externos (ZemdaPP)"
                    />
                  </div>
                )}
              </div>
            )}

            {/* ABA 14: DOCUMENTOS E RELATÓRIOS */}
            {activeTab === 'documents' && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">14. Emissão de Documentos Psicopedagógicos</h3>
                    <p className="text-xs text-slate-500">Relatórios de avaliação, pareceres e encaminhamentos</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={docType}
                      onChange={e => setDocType(e.target.value as any)}
                      className="p-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                    >
                      <option value="relatorio">Relatório Psicopedagógico</option>
                      <option value="parecer">Parecer Pedagógico</option>
                      <option value="encaminhamento">Encaminhamento Multiprofissional</option>
                    </select>
                    <button className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer">
                      Gerar Documento
                    </button>
                  </div>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1 text-xs">Texto do Documento</label>
                  <textarea
                    rows={12}
                    value={docContent}
                    onChange={e => setDocContent(e.target.value)}
                    placeholder="Redija o relatório psicopedagógico oficial ou utilize os dados consolidados da avaliação..."
                    className="w-full p-4 rounded-2xl border border-slate-300 text-xs font-mono leading-relaxed"
                  />
                </div>
              </div>
            )}

            {/* ABA 15: SIGILO E AUDITORIA */}
            {activeTab === 'history' && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
                <h3 className="text-base font-bold text-slate-900">15. Sigilo Profissional & Auditoria LGPD</h3>
                <p className="text-xs text-slate-500">
                  Rastreabilidade e compartilhamento com consentimento expresso
                </p>
                <div className="bg-teal-50 p-4 rounded-2xl border border-teal-200 flex items-start gap-3 text-xs text-teal-900">
                  <Lock className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                  <div>
                    <strong>Proteção de Sigilo Psicopedagógico Ativa</strong>
                    <p className="mt-1 leading-relaxed">
                      Recepção, financeiro e outros profissionais sem autorização expressa não possuem acesso ao prontuário deste aprendente.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE FINALIZAR ATENDIMENTO (SELAMENTO E ASSINATURA ELETRÔNICA / DIGITAL) */}
      {showFinishModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-base">Finalizar e Selar Atendimento</h3>
              </div>
              <button
                onClick={() => setShowFinishModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-3">
              <p>
                Ao finalizar oficialmente, este atendimento psicopedagógico será <strong>selado e bloqueado contra alterações retroativas</strong>, gerando autoria incontestável e registro criptográfico.
              </p>

              {/* Opção de Assinatura */}
              <div className="space-y-2">
                <label className="font-bold text-slate-800 block">Tipo de Assinatura Desejada:</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSignatureMode('sha256')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      signatureMode === 'sha256'
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-950 ring-2 ring-indigo-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <strong className="block text-xs font-bold text-indigo-900">Eletrônica Zemda</strong>
                    <span className="text-[11px] text-slate-500">Hash SHA-256 imediato</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSignatureMode('pades')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      signatureMode === 'pades'
                        ? 'border-teal-600 bg-teal-50/50 text-teal-950 ring-2 ring-teal-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <strong className="block text-xs font-bold text-teal-900">PAdES ICP-Brasil</strong>
                    <span className="text-[11px] text-slate-500">Carimbo e QR Code</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowFinishModal(false)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
              >
                Voltar à edição
              </button>
              <button
                type="button"
                onClick={handleFinishConsultation}
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-sm cursor-pointer disabled:opacity-50"
              >
                {saving ? 'Selando...' : 'Confirmar e Selar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IA PSICOPEDAGÓGICA */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-slate-900 text-base">Assistente IA Psicopedagógica</h3>
              </div>
              <button
                onClick={() => setShowAiModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-purple-50 p-3.5 rounded-2xl border border-purple-200 text-purple-900 text-xs leading-relaxed">
              <strong>Escopo Estrito de Atuação:</strong> A IA do ZemdaPP é configurada exclusivamente para hipóteses pedagógicas e estratégias de intervenção escolar. Jamais emite diagnósticos médicos ou psicológicos privativos.
            </div>

            <div className="space-y-2 text-xs">
              <label className="font-bold text-slate-700 block">Descreva o caso ou a queixa pedagógica:</label>
              <textarea
                rows={4}
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                placeholder="Ex: Aprendente do 3º ano com confusão persistente entre letras b e d, dificuldade de concentração em tarefas de leitura e boa retenção auditiva..."
                className="w-full p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {aiResult && (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2 max-h-60 overflow-y-auto">
                <strong className="text-slate-800 block">Sugestões de Intervenção Pedagógica:</strong>
                <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{aiResult}</p>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowAiModal(false)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-bold cursor-pointer"
              >
                Fechar
              </button>
              <button
                onClick={handleRunAi}
                disabled={generatingAi || !aiPrompt.trim()}
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {generatingAi ? 'Gerando estratégias...' : 'Consultar IA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPreviousRecordsModal && selectedPatientId && (
        <PatientPreviousRecordsModal
          patientId={selectedPatientId}
          patientName={patientData?.full_name || patientData?.name}
          onClose={() => setShowPreviousRecordsModal(false)}
        />
      )}
    </div>
  );
};
