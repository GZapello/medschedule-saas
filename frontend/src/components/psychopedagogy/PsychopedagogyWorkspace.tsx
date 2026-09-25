import React, { useState, useEffect, useMemo } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PatientPreviousRecordsModal } from '../clinical/PatientPreviousRecordsModal';
import { ExternalTestsManager } from '../common/ExternalTestsManager';
import { MeasurableGoalsManager } from '../common/MeasurableGoalsManager';
import { PsychopedagogyDocumentModal, PsychopedagogyDocType } from './PsychopedagogyDocumentModal';
import { useClinicalAutosave } from '../../hooks/useClinicalAutosave';
import { useHorizontalTabScroll } from '../../hooks/useHorizontalTabScroll';
import { ClinicalQuickHeaderActions, ClinicalQuickToolItem } from '../clinical/ClinicalQuickHeaderActions';
import { ClinicalDraftRecoveryModal } from '../clinical/ClinicalDraftRecoveryModal';
import { PatientSearchSelect } from '../common/PatientSearchSelect';
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
  ChevronDown,
  Calendar,
  Sparkles,
  Pencil,
  Calculator,
  Clock,
  Printer,
  X,
  Share2,
  Trash2,
  Building,
  Target,
  History,
  Activity,
  Award,
  Layers,
  Brain,
  Eye,
  ShieldCheck
} from 'lucide-react';

interface PsychopedagogyWorkspaceProps {
  initialPatientId?: string;
  initialAppointmentId?: string;
  onFinishConsultation?: () => void;
}

type TabKey =
  | 'evolution'
  | 'profile_anamnese'
  | 'assessment'
  | 'learning'
  | 'plans_goals'
  | 'family_school'
  | 'tests_attachments'
  | 'finish';

type LearningSubTab = 'reading' | 'writing' | 'math' | 'cognition' | 'notebooks';

export const PsychopedagogyWorkspace: React.FC<PsychopedagogyWorkspaceProps> = ({
  initialPatientId,
  initialAppointmentId,
  onFinishConsultation
}) => {
  const { currentUser, isClinicAdmin, clientTermLabel } = useAuth();
  const { showToast } = useToast();

  // Pacientes e Seleção
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId || '');
  const [patientData, setPatientData] = useState<any>(null);
  const [showPreviousRecordsModal, setShowPreviousRecordsModal] = useState<boolean>(false);

  // Navegação horizontal moderna das 8 abas
  const [activeTab, setActiveTab] = useState<TabKey>('evolution');

  // Hook para usabilidade e rolagem horizontal suave das abas de Psicopedagogia
  const { tabScrollProps } = useHorizontalTabScroll(activeTab);

  // Subaba da área de Aprendizagem
  const [learningSubTab, setLearningSubTab] = useState<LearningSubTab>('reading');

  // Modo de atuação na aba Família & Escola: Clínico vs Institucional
  const [contactMode, setContactMode] = useState<'clinical' | 'institutional'>('clinical');

  // Controle de expansão de sanfonas na aba Perfil & Anamnese
  const [expandedSections, setExpandedSections] = useState({
    school: true,
    development: true,
    adaptation: false,
    interventions: false
  });

  // Estados de dados
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // 1. Sessão Atual e Histórico de Sessões
  const [sessions, setSessions] = useState<any[]>([]);
  const [currentSession, setCurrentSession] = useState({
    session_number: 1,
    session_date: new Date().toISOString().split('T')[0],
    objectives: '',
    activities_developed: '',
    interventions_performed: '',
    learner_reactions: '',
    results_observations: '',
    guidance_notes: '',
    next_steps: ''
  });

  // 2. Perfil & Anamnese
  const [profile, setProfile] = useState<any>({
    school_name: '',
    grade_level: '',
    shift: 'Matutino',
    school_type: 'Privada',
    teacher_name: '',
    coordinator_name: '',
    main_complaint: '',
    pregnancy_history: '',
    motor_development: '',
    speech_development: '',
    sleep_routine: '',
    food_routine: '',
    school_adaptation: '',
    relationship_with_peers: '',
    family_dynamics: '',
    emotional_factors: '',
    previous_interventions: '',
    strengths: '',
    difficulties: ''
  });

  // 3. Avaliação Psicopedagógica (Termos normatizados e sem conclusões auto-geradas)
  const [assessment, setAssessment] = useState<any>({
    demand_investigated: '',
    observations: '',
    strengths_observed: '',
    areas_of_difficulty: '',
    strategies_used: '',
    results_evaluated: '',
    psychopedagogical_synthesis: '',
    pedagogical_hypothesis: '',
    recommendations: '',
    is_sealed: 0
  });

  // 4. Domínios de Aprendizagem (Leitura, Escrita, Matemática, Funções Executivas, Cadernos)
  const [domains, setDomains] = useState<any[]>([]);
  const [learningForm, setLearningForm] = useState({
    // Leitura
    reading_decoding: '',
    reading_fluency: '',
    reading_comprehension: '',
    reading_phonological_awareness: '',
    reading_notes: '',
    // Escrita
    writing_orthography: '',
    writing_text_production: '',
    writing_graphomotor: '',
    writing_spatial_organization: '',
    writing_notes: '',
    // Matemática
    math_number_concept: '',
    math_calculation: '',
    math_problem_solving: '',
    math_logical_reasoning: '',
    math_notes: '',
    // Funções Executivas
    exec_attention: '',
    exec_working_memory: '',
    exec_planning_organization: '',
    exec_inhibitory_control: '',
    exec_cognitive_flexibility: '',
    exec_notes: '',
    // Cadernos & Produções
    notebooks_spatial_layout: '',
    notebooks_handwriting_legibility: '',
    notebooks_error_patterns: '',
    notebooks_cadence_pace: '',
    notebooks_erasures_frequency: '',
    notebooks_general_notes: ''
  });

  // 5. Plano de Intervenção Psicopedagógica (PIP)
  const [plans, setPlans] = useState<any[]>([]);
  const [currentPlan, setCurrentPlan] = useState<any>({
    title: 'Plano de Estimulação e Intervenção Psicopedagógica',
    objectives: '',
    methodology: '',
    frequency: '1x por semana (50 minutos)',
    start_date: new Date().toISOString().split('T')[0],
    review_date: '',
    status: 'active'
  });

  // 6. Família, Escola & Institucional
  const [schoolContacts, setSchoolContacts] = useState<any[]>([]);
  const [newContact, setNewContact] = useState({
    contact_date: new Date().toISOString().split('T')[0],
    target_type: 'school', // 'school' | 'family' | 'institution'
    interlocutor_name: '',
    role_relationship: 'Professora Regente',
    subject: '',
    guidance_given: '',
    agreements: '',
    next_contact_date: ''
  });

  const [institutionalCases, setInstitutionalCases] = useState<any[]>([]);
  const [institutionalCase, setInstitutionalCase] = useState<any>({
    institution_name: '',
    demand_type: 'Mediação Pedagógica & Clima Escolar',
    grade_involved: '',
    teachers_involved: '',
    observations: '',
    action_plan: '',
    status: 'open'
  });

  // 7. Instrumentos Psicopedagógicos Clínicos
  const [instruments, setInstruments] = useState<any[]>([]);
  const [newInstrument, setNewInstrument] = useState({
    instrument_name: '',
    instrument_category: 'Provas Operatórias Piagetianas',
    application_date: new Date().toISOString().split('T')[0],
    results_summary: '',
    normative_reference: 'Visca / Piaget / Paín'
  });
  const [blockedAlert, setBlockedAlert] = useState<string | null>(null);

  // 8. Finalização do Atendimento
  const [finishForm, setFinishForm] = useState({
    consultation_title: 'Sessão de Intervenção Psicopedagógica',
    evolution_text: '',
    next_steps: '',
    guidance_summary: '',
    signature_mode: 'sha256' as 'sha256' | 'pades'
  });

  // Payload do Autosave Universal Clínico (ZemdaPP)
  const autosavePayload = useMemo(() => ({
    finishForm,
    currentSession,
    learningForm,
    assessment,
    profile,
    currentPlan
  }), [
    finishForm,
    currentSession,
    learningForm,
    assessment,
    profile,
    currentPlan
  ]);

  const handleRestoreDraft = (data: any) => {
    if (!data) return;
    if (data.finishForm) setFinishForm((prev: any) => ({ ...prev, ...data.finishForm }));
    if (data.currentSession) setCurrentSession((prev: any) => ({ ...prev, ...data.currentSession }));
    if (data.learningForm) setLearningForm((prev: any) => ({ ...prev, ...data.learningForm }));
    if (data.assessment) setAssessment((prev: any) => ({ ...prev, ...data.assessment }));
    if (data.profile) setProfile((prev: any) => ({ ...prev, ...data.profile }));
    if (data.currentPlan) setCurrentPlan((prev: any) => ({ ...prev, ...data.currentPlan }));
  };

  const autosave = useClinicalAutosave({
    moduleType: 'ZemdaPP',
    patientId: selectedPatientId,
    appointmentId: initialAppointmentId,
    payload: autosavePayload,
    onRestoreDraft: handleRestoreDraft
  });

  // Modal Pós-Atendimento e Modal de Documentos
  const [showPostConsultationModal, setShowPostConsultationModal] = useState<boolean>(false);
  const [postConsultationReceipt, setPostConsultationReceipt] = useState<any>(null);

  const [showDocumentModal, setShowDocumentModal] = useState<boolean>(false);
  const [selectedDocType, setSelectedDocType] = useState<PsychopedagogyDocType>('relatorio');

  // IA Psicopedagógica
  const [showAiModal, setShowAiModal] = useState<boolean>(false);
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [aiResult, setAiResult] = useState<string>('');
  const [generatingAi, setGeneratingAi] = useState<boolean>(false);

  // Ao selecionar um aprendente, carrega dados completos do paciente
  useEffect(() => {
    if (!selectedPatientId) {
      setPatientData(null);
      return;
    }

    async function loadPatientDetails() {
      try {
        setLoading(true);
        const [pat, profRes, assessRes, sessRes, domsRes, instsRes, plansRes, contactsRes, instCasesRes] = await Promise.all([
          ApiClient.get<any>(`/v1/patients/${selectedPatientId}`),
          ApiClient.get<any>(`/v1/psychopedagogy/profile/${selectedPatientId}`).catch(() => null),
          ApiClient.get<any>(`/v1/psychopedagogy/assessments/${selectedPatientId}`).catch(() => null),
          ApiClient.get<any[]>(`/v1/psychopedagogy/sessions/${selectedPatientId}`).catch(() => []),
          ApiClient.get<any[]>(`/v1/psychopedagogy/domains/${selectedPatientId}`).catch(() => []),
          ApiClient.get<any[]>(`/v1/psychopedagogy/instruments/${selectedPatientId}`).catch(() => []),
          ApiClient.get<any[]>(`/v1/psychopedagogy/plans/${selectedPatientId}`).catch(() => []),
          ApiClient.get<any[]>(`/v1/psychopedagogy/school-contacts/${selectedPatientId}`).catch(() => []),
          ApiClient.get<any[]>(`/v1/psychopedagogy/institutional-cases`).catch(() => [])
        ]);

        setPatientData(pat);
        if (profRes) {
          setProfile((prev: any) => ({ ...prev, ...profRes }));
        }
        if (assessRes) {
          const loadedAssess = Array.isArray(assessRes) ? (assessRes[0] || {}) : assessRes;
          setAssessment((prev: any) => ({ ...prev, ...loadedAssess }));
        }
        setSessions(sessRes || []);
        if (sessRes && sessRes.length > 0) {
          setCurrentSession((prev: any) => ({
            ...prev,
            session_number: sessRes.length + 1
          }));
        }

        setDomains(domsRes || []);
        setInstruments(instsRes || []);
        setPlans(plansRes || []);
        if (plansRes && plansRes.length > 0) {
          setCurrentPlan((prev: any) => ({ ...prev, ...plansRes[0] }));
        }

        setSchoolContacts(contactsRes || []);
        setInstitutionalCases(instCasesRes || []);

        // Mapeia domínios carregados para o formulário de aprendizagem
        if (domsRes && Array.isArray(domsRes)) {
          const newForm: any = { ...learningForm };
          domsRes.forEach((d: any) => {
            if (d.domain_type === 'reading') {
              newForm.reading_notes = d.observations || '';
            } else if (d.domain_type === 'writing') {
              newForm.writing_notes = d.observations || '';
            } else if (d.domain_type === 'math') {
              newForm.math_notes = d.observations || '';
            } else if (d.domain_type === 'cognition') {
              newForm.exec_notes = d.observations || '';
            } else if (d.domain_type === 'materials') {
              newForm.notebooks_general_notes = d.observations || '';
            }
          });
          setLearningForm(prev => ({ ...prev, ...newForm }));
        }
      } catch (err: any) {
        showToast(err.message || 'Erro ao carregar prontuário psicopedagógico.', 'error');
      } finally {
        setLoading(false);
      }
    }

    loadPatientDetails();
  }, [selectedPatientId]);

  // Sincroniza a evolução da sessão atual com a aba de finalização
  useEffect(() => {
    if (!finishForm.evolution_text && (currentSession.results_observations || currentSession.activities_developed || currentSession.objectives)) {
      const parts = [
        currentSession.objectives ? `Objetivos da Sessão:\n${currentSession.objectives}` : '',
        currentSession.activities_developed ? `Atividades e Jogos Realizados:\n${currentSession.activities_developed}` : '',
        currentSession.interventions_performed ? `Intervenções e Mediação Psicopedagógica:\n${currentSession.interventions_performed}` : '',
        currentSession.learner_reactions ? `Resposta e Engajamento do Aprendente:\n${currentSession.learner_reactions}` : '',
        currentSession.results_observations ? `Resultados e Observações Clínicas:\n${currentSession.results_observations}` : ''
      ].filter(Boolean).join('\n\n');

      setFinishForm(prev => ({
        ...prev,
        evolution_text: parts,
        next_steps: currentSession.next_steps || prev.next_steps,
        guidance_summary: currentSession.guidance_notes || prev.guidance_summary
      }));
    }
  }, [currentSession, finishForm.evolution_text]);

  // Ações de Salvamento de cada Aba

  // 1. Salvar Sessão
  const handleSaveSession = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente para registrar a sessão.', 'info');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/psychopedagogy/sessions', {
        ...currentSession,
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId,
        sessionDate: currentSession.session_date,
        sessionNumber: currentSession.session_number,
        activitiesPerformed: currentSession.activities_developed,
        studentEngagement: currentSession.learner_reactions,
        observations: currentSession.results_observations,
        nextSessionPlan: currentSession.next_steps
      });
      showToast('Sessão psicopedagógica registrada com sucesso!', 'success');
      const updated = await ApiClient.get<any[]>(`/v1/psychopedagogy/sessions/${selectedPatientId}`);
      setSessions(updated || []);
      setCurrentSession({
        session_number: (updated?.length || 0) + 1,
        session_date: new Date().toISOString().split('T')[0],
        objectives: '',
        activities_developed: '',
        interventions_performed: '',
        learner_reactions: '',
        results_observations: '',
        guidance_notes: '',
        next_steps: ''
      });
    } catch (err: any) {
      showToast(err.message || 'Erro ao registrar sessão psicopedagógica.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 2. Salvar Perfil & Anamnese
  const handleSaveProfileAndAnamnese = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente antes de salvar.', 'info');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/psychopedagogy/profile', {
        patientId: selectedPatientId,
        schoolName: profile.school_name,
        schoolGrade: profile.grade_level,
        schoolShift: profile.shift,
        schoolType: profile.school_type,
        teacherName: profile.teacher_name,
        coordinatorName: profile.coordinator_name,
        pedagogicalComplaint: profile.main_complaint,
        pregnancyHistory: profile.pregnancy_history,
        motorDevelopment: profile.motor_development,
        speechDevelopment: profile.speech_development,
        sleepRoutine: profile.sleep_routine,
        foodRoutine: profile.food_routine,
        schoolAdaptation: profile.school_adaptation,
        relationshipWithPeers: profile.relationship_with_peers,
        familyDynamics: profile.family_dynamics,
        emotionalFactors: profile.emotional_factors,
        previousInterventions: profile.previous_interventions,
        strengths: profile.strengths,
        difficulties: profile.difficulties,
        ...profile
      });
      showToast('Perfil e anamnese psicopedagógica salvos com sucesso!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar perfil e anamnese.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 3. Salvar Avaliação Psicopedagógica
  const handleSaveAssessment = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente antes de salvar.', 'info');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/psychopedagogy/assessments', {
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId,
        demandInvestigated: assessment.demand_investigated,
        observations: assessment.observations,
        strengthsObserved: assessment.strengths_observed,
        areasOfDifficulty: assessment.areas_of_difficulty,
        strategiesUsed: assessment.strategies_used,
        resultsEvaluated: assessment.results_evaluated,
        conclusions: assessment.psychopedagogical_synthesis,
        pedagogicalHypothesis: assessment.pedagogical_hypothesis,
        recommendations: assessment.recommendations,
        ...assessment
      });
      showToast('Avaliação psicopedagógica salva com sucesso!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar avaliação psicopedagógica.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 4. Salvar Análise de Aprendizagem
  const handleSaveLearning = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente antes de salvar.', 'info');
      return;
    }
    try {
      setSaving(true);
      const subdomainsList = [
        { domain_type: 'reading', subdomain: 'Leitura', observations: JSON.stringify({
          decoding: learningForm.reading_decoding,
          fluency: learningForm.reading_fluency,
          comprehension: learningForm.reading_comprehension,
          phonological: learningForm.reading_phonological_awareness,
          notes: learningForm.reading_notes
        }) },
        { domain_type: 'writing', subdomain: 'Escrita', observations: JSON.stringify({
          orthography: learningForm.writing_orthography,
          production: learningForm.writing_text_production,
          graphomotor: learningForm.writing_graphomotor,
          spatial: learningForm.writing_spatial_organization,
          notes: learningForm.writing_notes
        }) },
        { domain_type: 'math', subdomain: 'Matemática', observations: JSON.stringify({
          number_concept: learningForm.math_number_concept,
          calculation: learningForm.math_calculation,
          problem_solving: learningForm.math_problem_solving,
          logic: learningForm.math_logical_reasoning,
          notes: learningForm.math_notes
        }) },
        { domain_type: 'cognition', subdomain: 'Funções Executivas', observations: JSON.stringify({
          attention: learningForm.exec_attention,
          working_memory: learningForm.exec_working_memory,
          planning: learningForm.exec_planning_organization,
          inhibitory: learningForm.exec_inhibitory_control,
          flexibility: learningForm.exec_cognitive_flexibility,
          notes: learningForm.exec_notes
        }) },
        { domain_type: 'materials', subdomain: 'Cadernos & Produções', observations: JSON.stringify({
          spatial: learningForm.notebooks_spatial_layout,
          handwriting: learningForm.notebooks_handwriting_legibility,
          errors: learningForm.notebooks_error_patterns,
          cadence: learningForm.notebooks_cadence_pace,
          erasures: learningForm.notebooks_erasures_frequency,
          notes: learningForm.notebooks_general_notes
        }) }
      ];

      for (const item of subdomainsList) {
        await ApiClient.post('/v1/psychopedagogy/domains', {
          patientId: selectedPatientId,
          ...item
        });
      }

      showToast('Análise de domínios de aprendizagem salva com sucesso!', 'success');
      const updated = await ApiClient.get<any[]>(`/v1/psychopedagogy/domains/${selectedPatientId}`);
      setDomains(updated || []);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar análise de aprendizagem.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 5. Salvar Plano de Intervenção (PIP)
  const handleSavePlan = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente antes de salvar o plano.', 'info');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/psychopedagogy/plans', {
        patientId: selectedPatientId,
        title: currentPlan.title,
        objectives: currentPlan.objectives,
        methodology: currentPlan.methodology,
        frequency: currentPlan.frequency,
        startDate: currentPlan.start_date,
        reviewDate: currentPlan.review_date,
        status: currentPlan.status
      });
      showToast('Plano de Intervenção Psicopedagógica salvo!', 'success');
      const updated = await ApiClient.get<any[]>(`/v1/psychopedagogy/plans/${selectedPatientId}`);
      setPlans(updated || []);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar plano de intervenção.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 6. Registrar Contato Família/Escola
  const handleAddSchoolContact = async () => {
    if (!selectedPatientId || !newContact.interlocutor_name) {
      showToast('Preencha o nome do interlocutor.', 'info');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/psychopedagogy/school-contacts', {
        patientId: selectedPatientId,
        contactDate: newContact.contact_date,
        targetType: newContact.target_type,
        interlocutorName: newContact.interlocutor_name,
        roleRelationship: newContact.role_relationship,
        subject: newContact.subject,
        guidanceGiven: newContact.guidance_given,
        agreements: newContact.agreements,
        nextContactDate: newContact.next_contact_date
      });
      showToast('Contato registrado na linha do tempo!', 'success');
      const updated = await ApiClient.get<any[]>(`/v1/psychopedagogy/school-contacts/${selectedPatientId}`);
      setSchoolContacts(updated || []);
      setNewContact({
        contact_date: new Date().toISOString().split('T')[0],
        target_type: 'school',
        interlocutor_name: '',
        role_relationship: 'Professora Regente',
        subject: '',
        guidance_given: '',
        agreements: '',
        next_contact_date: ''
      });
    } catch (err: any) {
      showToast(err.message || 'Erro ao registrar contato escolar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 7. Salvar Caso Institucional
  const handleSaveInstitutionalCase = async () => {
    if (!institutionalCase.institution_name) {
      showToast('Informe o nome da instituição.', 'info');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/psychopedagogy/institutional-cases', {
        institutionName: institutionalCase.institution_name,
        demandType: institutionalCase.demand_type,
        gradeInvolved: institutionalCase.grade_involved,
        teachersInvolved: institutionalCase.teachers_involved,
        observations: institutionalCase.observations,
        actionPlan: institutionalCase.action_plan,
        status: institutionalCase.status
      });
      showToast('Projeto institucional salvo com sucesso!', 'success');
      const updated = await ApiClient.get<any[]>('/v1/psychopedagogy/institutional-cases');
      setInstitutionalCases(updated || []);
      setInstitutionalCase({
        institution_name: '',
        demand_type: 'Mediação Pedagógica & Clima Escolar',
        grade_involved: '',
        teachers_involved: '',
        observations: '',
        action_plan: '',
        status: 'open'
      });
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar caso institucional.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 8. Adicionar Instrumento Psicopedagógico com Bloqueio SATEPSI/CFP
  const handleAddInstrument = async () => {
    if (!selectedPatientId || !newInstrument.instrument_name.trim()) {
      showToast('Informe o nome do instrumento.', 'info');
      return;
    }

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
        normative_reference: 'Visca / Piaget / Paín'
      });
      setBlockedAlert(null);
    } catch (err: any) {
      if (err.message && (err.message.includes('CFP') || err.message.includes('SATEPSI') || err.message.includes('Psicologia'))) {
        setBlockedAlert(err.message);
      } else {
        showToast(err.message || 'Erro ao salvar instrumento.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  // 9. Finalizar Atendimento Oficial (Grava evolução, sela e abre opções pós-consulta)
  const handleFinishConsultation = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um aprendente para finalizar.', 'info');
      return;
    }
    if (!finishForm.evolution_text.trim()) {
      showToast('Preencha a evolução psicopedagógica da sessão antes de finalizar.', 'error');
      return;
    }

    try {
      setSaving(true);
      let effectiveAppointmentId = initialAppointmentId;

      // Se não houver appointmentId, inicia transparente via endpoint canônico
      if (!effectiveAppointmentId) {
        try {
          const startRes = await ApiClient.post<any>('/v1/clinical/consultations/start', {
            patientId: selectedPatientId,
            professionalId: currentUser?.id,
            serviceName: 'Atendimento Psicopedagógico (ZemdaPP)',
            moduleType: 'ZemdaPP'
          });
          effectiveAppointmentId = startRes.appointmentId;
        } catch (_) {}
      }

      const res = await ApiClient.post<any>('/v1/psychopedagogy/sessions/finish', {
        patientId: selectedPatientId,
        professionalId: currentUser?.id,
        appointmentId: effectiveAppointmentId || null,
        sessionDate: new Date().toISOString().split('T')[0],
        title: finishForm.consultation_title || 'Atendimento Psicopedagógico (ZemdaPP)',
        clinicalEvolution: finishForm.evolution_text,
        technicalNotes: finishForm.next_steps || '',
        isSealed: true,
        useDigitalSignature: false,
        sessionData: {
          session_date: new Date().toISOString().split('T')[0],
          objectives: currentSession.objectives || 'Atendimento psicopedagógico finalizado.',
          activities_developed: currentSession.activities_developed,
          interventions_performed: currentSession.interventions_performed,
          results_observations: currentSession.results_observations,
          guidance_notes: finishForm.guidance_summary
        }
      });

      await autosave.clearDraft();
      showToast('Atendimento psicopedagógico finalizado e selado com sucesso!', 'success');
      setPostConsultationReceipt(res);
      setShowPostConsultationModal(true);
      if (onFinishConsultation) onFinishConsultation();
    } catch (err: any) {
      showToast(err.message || 'Erro ao finalizar atendimento psicopedagógico.', 'error');
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

      setAiResult(`${res.organizedText}\n\n${res.disclaimer || 'Aviso Ético: Hipótese psicopedagógica e estratégias pedagógicas de apoio. Não substitui avaliação clínica presencial nem emite diagnósticos privativos.'}`);
    } catch (err: any) {
      showToast(err.message || 'Erro ao consultar IA Psicopedagógica.', 'error');
    } finally {
      setGeneratingAi(false);
    }
  };

  const selectedPatient = patientData;

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800">
      
      {/* 10. NOVO CABEÇALHO DO MÓDULO ZEMDAPP */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-700 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">ZemdaPP</h1>
              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                Psicopedagogia
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                <Lock className="w-2.5 h-2.5 text-slate-400" />
                Prontuário com acesso restrito
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Avaliação da aprendizagem, intervenção psicopedagógica e acompanhamento longitudinal.
            </p>
          </div>
        </div>

        {/* CONTROLES À DIREITA: SELETOR DE APRENDENTE E AÇÕES RÁPIDAS */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <PatientSearchSelect
            compact
            value={selectedPatientId}
            selectedPatient={selectedPatient}
            clientTermLabel="Aprendente"
            disabled={!!initialAppointmentId}
            onChange={(id, pat) => {
              setSelectedPatientId(id);
              if (pat) setPatientData(pat);
              else if (!id) setPatientData(null);
            }}
          />

          {selectedPatientId && (
            <ClinicalQuickHeaderActions
              autosaveStatus={autosave.autosaveStatus}
              lastSavedTime={autosave.lastSavedTime}
              onViewPreviousRecords={() => setShowPreviousRecordsModal(true)}
              onFinishConsultation={() => setActiveTab('finish')}
              finishLabel="Finalizar Atendimento"
              isSubmitting={saving}
              tools={[
                {
                  id: 'documents',
                  label: 'Documentos & Pareceres',
                  icon: Printer,
                  onClick: () => {
                    setSelectedDocType('relatorio');
                    setShowDocumentModal(true);
                  }
                },
                {
                  id: 'ai_support',
                  label: 'IA Apoio Pedagógico',
                  icon: Sparkles,
                  highlight: true,
                  onClick: () => setShowAiModal(true)
                }
              ]}
              toolsVariant="indigo"
              toolsLabel="Ferramentas"
            />
          )}
        </div>
      </div>

      {/* 1. NAVEGAÇÃO HORIZONTAL NAS 8 ABAS (PADRÃO MODERNO ZEMDA COM SCROLL FLUIDO) */}
      <div className="bg-white border-b border-slate-200 px-6 shrink-0">
        <div {...tabScrollProps} className={`${tabScrollProps.className} flex items-center gap-1 py-1`}>
          {[
            { id: 'evolution', label: '1. Evolução', icon: Clock },
            { id: 'profile_anamnese', label: '2. Perfil & Anamnese', icon: BookOpen },
            { id: 'assessment', label: '3. Avaliação Psicopedagógica', icon: Brain },
            { id: 'learning', label: '4. Aprendizagem', icon: Pencil },
            { id: 'plans_goals', label: '5. Plano & Metas', icon: Target },
            { id: 'family_school', label: '6. Família & Escola', icon: School },
            { id: 'tests_attachments', label: '7. Testes & Anexos', icon: Layers },
            { id: 'finish', label: '8. Finalização', icon: CheckCircle2 }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                data-tour={`tab-${tab.id}`}
                data-active={isActive}
                type="button"
                onClick={() => setActiveTab(tab.id as TabKey)}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                  isActive
                    ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ÁREA DE CONTEÚDO PRINCIPAL DAS 8 ABAS */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {!selectedPatientId ? (
          <div className="bg-white rounded-3xl p-12 border border-slate-200 shadow-xs text-center max-w-xl mx-auto my-12 space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
              <GraduationCap className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Selecione um Aprendente para Iniciar</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Escolha um aprendente no seletor acima para abrir a evolução clínica, anamnese pedagógica, testes e plano de intervenção.
            </p>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-6">

            {/* ========================================================================= */}
            {/* ABA 1: EVOLUÇÃO (Tela Principal do Atendimento) */}
            {/* ========================================================================= */}
            {activeTab === 'evolution' && (
              <div className="space-y-6">
                {/* Card de Nova Sessão */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-indigo-600" />
                        Registro da Sessão Atual
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                          Sessão nº {currentSession.session_number}
                        </span>
                      </h3>
                      <p className="text-xs text-slate-500">
                        Atividades realizadas, mediação psicopedagógica, resposta do aprendente e orientações.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={currentSession.session_date}
                        onChange={e => setCurrentSession({ ...currentSession, session_date: e.target.value })}
                        className="text-xs p-2 rounded-xl border border-slate-300 bg-white font-semibold"
                      />
                      <button
                        type="button"
                        onClick={handleSaveSession}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Salvar Sessão</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Objetivo da Sessão</label>
                      <textarea
                        rows={3}
                        value={currentSession.objectives}
                        onChange={e => setCurrentSession({ ...currentSession, objectives: e.target.value })}
                        placeholder="Ex: Desenvolver estratégias de decodificação leitora e tolerância ao erro através de jogos de rima..."
                        className="w-full p-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Atividades & Jogos Realizados</label>
                      <textarea
                        rows={3}
                        value={currentSession.activities_developed}
                        onChange={e => setCurrentSession({ ...currentSession, activities_developed: e.target.value })}
                        placeholder="Ex: Jogo da memória fonológica, leitura compartilhada de fábula e ditado interativo com massinha..."
                        className="w-full p-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Intervenções & Mediação Psicopedagógica</label>
                      <textarea
                        rows={3}
                        value={currentSession.interventions_performed}
                        onChange={e => setCurrentSession({ ...currentSession, interventions_performed: e.target.value })}
                        placeholder="Ex: Intervenção com pistas visuais e segmentação fonêmica após hesitações nos grafemas semelhantes..."
                        className="w-full p-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Resposta do Aprendente</label>
                      <textarea
                        rows={3}
                        value={currentSession.learner_reactions}
                        onChange={e => setCurrentSession({ ...currentSession, learner_reactions: e.target.value })}
                        placeholder="Ex: Mostrou-se participativo e com boa tolerância inicial; solicitou auxílio nas palavras com dígrafos..."
                        className="w-full p-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Resultados & Observações Clínicas</label>
                      <textarea
                        rows={3}
                        value={currentSession.results_observations}
                        onChange={e => setCurrentSession({ ...currentSession, results_observations: e.target.value })}
                        placeholder="Ex: Consolidação da correspondência som-grafia nas vogais e início do avanço em sílabas complexas..."
                        className="w-full p-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Orientações (Família / Escola) & Próximos Passos</label>
                      <textarea
                        rows={3}
                        value={currentSession.next_steps}
                        onChange={e => setCurrentSession({ ...currentSession, next_steps: e.target.value })}
                        placeholder="Ex: Manter 10 minutos de leitura recreativa diária em família. Próxima sessão: raciocínio matemático..."
                        className="w-full p-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Histórico Cronológico de Sessões Anteriores */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 text-indigo-600" />
                      <h4 className="font-bold text-slate-900 text-sm">
                        Histórico de Sessões Realizadas ({sessions.length})
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPreviousRecordsModal(true)}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-bold cursor-pointer"
                    >
                      Ver Prontuário Geral Completo →
                    </button>
                  </div>

                  {sessions.length === 0 ? (
                    <p className="text-xs text-slate-400 italic text-center py-6">
                      Nenhuma sessão anterior registrada para este aprendente.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {sessions.map((s, idx) => (
                        <div key={s.id || idx} className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800 flex items-center gap-2">
                              <span>Sessão nº {s.session_number || idx + 1}</span>
                              <span className="text-[11px] font-normal text-slate-500">
                                • {new Date(s.session_date).toLocaleDateString('pt-BR')}
                              </span>
                            </span>
                            {s.is_sealed === 1 && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                <ShieldCheck className="w-3 h-3" /> Selado
                              </span>
                            )}
                          </div>
                          {s.objectives && (
                            <p className="text-slate-700"><strong>Objetivo:</strong> {s.objectives}</p>
                          )}
                          {s.activities_performed && (
                            <p className="text-slate-600"><strong>Atividades:</strong> {s.activities_performed}</p>
                          )}
                          {s.observations && (
                            <p className="text-slate-600"><strong>Observações:</strong> {s.observations}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* ABA 2: PERFIL & ANAMNESE (Organizado em Cards/Sanfonas) */}
            {/* ========================================================================= */}
            {activeTab === 'profile_anamnese' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Perfil do Aprendente & Anamnese</h3>
                    <p className="text-xs text-slate-500">
                      Dados escolares, histórico de desenvolvimento, adaptação social e potencialidades.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveProfileAndAnamnese}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar Perfil & Anamnese</span>
                  </button>
                </div>

                {/* Card 1: Dados Escolares & Queixa Principal */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                  <div
                    onClick={() => setExpandedSections(p => ({ ...p, school: !p.school }))}
                    className="p-4 bg-slate-50/80 hover:bg-slate-100/80 cursor-pointer flex items-center justify-between border-b border-slate-200 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <School className="w-4 h-4 text-indigo-600" />
                      <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                        1. Dados Escolares & Queixa Principal
                      </h4>
                    </div>
                    {expandedSections.school ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </div>

                  {expandedSections.school && (
                    <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Instituição Escolar</label>
                        <input
                          type="text"
                          value={profile.school_name || ''}
                          onChange={e => setProfile({ ...profile, school_name: e.target.value })}
                          placeholder="Nome do colégio / escola"
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Ano / Série Escolar</label>
                        <input
                          type="text"
                          value={profile.grade_level || ''}
                          onChange={e => setProfile({ ...profile, grade_level: e.target.value })}
                          placeholder="Ex: 3º Ano do Ensino Fundamental"
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Turno</label>
                        <select
                          value={profile.shift || 'Matutino'}
                          onChange={e => setProfile({ ...profile, shift: e.target.value })}
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        >
                          <option value="Matutino">Matutino</option>
                          <option value="Vespertino">Vespertino</option>
                          <option value="Integral">Integral</option>
                        </select>
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Professor(a) Regente</label>
                        <input
                          type="text"
                          value={profile.teacher_name || ''}
                          onChange={e => setProfile({ ...profile, teacher_name: e.target.value })}
                          placeholder="Nome do professor titular"
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Coordenação / Orientação</label>
                        <input
                          type="text"
                          value={profile.coordinator_name || ''}
                          onChange={e => setProfile({ ...profile, coordinator_name: e.target.value })}
                          placeholder="Nome do coordenador pedagógico"
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Tipo de Escola</label>
                        <select
                          value={profile.school_type || 'Privada'}
                          onChange={e => setProfile({ ...profile, school_type: e.target.value })}
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        >
                          <option value="Privada">Privada</option>
                          <option value="Pública Municipal">Pública Municipal</option>
                          <option value="Pública Estadual">Pública Estadual</option>
                          <option value="Outra">Outra</option>
                        </select>
                      </div>

                      <div className="sm:col-span-2 lg:col-span-3">
                        <label className="font-bold text-slate-700 block mb-1">Queixa Principal / Demanda da Família ou Escola</label>
                        <textarea
                          rows={3}
                          value={profile.main_complaint || ''}
                          onChange={e => setProfile({ ...profile, main_complaint: e.target.value })}
                          placeholder="Descreva o motivo da busca pelo acompanhamento psicopedagógico..."
                          className="w-full p-3 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Card 2: História do Desenvolvimento & Rotinas */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                  <div
                    onClick={() => setExpandedSections(p => ({ ...p, development: !p.development }))}
                    className="p-4 bg-slate-50/80 hover:bg-slate-100/80 cursor-pointer flex items-center justify-between border-b border-slate-200 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-indigo-600" />
                      <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                        2. História de Desenvolvimento, Sono & Alimentação
                      </h4>
                    </div>
                    {expandedSections.development ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </div>

                  {expandedSections.development && (
                    <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Gestação e Nascimento</label>
                        <textarea
                          rows={2}
                          value={profile.pregnancy_history || ''}
                          onChange={e => setProfile({ ...profile, pregnancy_history: e.target.value })}
                          placeholder="Intercorrências no parto, marcos neonatais..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Desenvolvimento Motor</label>
                        <textarea
                          rows={2}
                          value={profile.motor_development || ''}
                          onChange={e => setProfile({ ...profile, motor_development: e.target.value })}
                          placeholder="Idade que sentou, engatinhou, andou, coordenação motora ampla e fina..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Desenvolvimento da Linguagem</label>
                        <textarea
                          rows={2}
                          value={profile.speech_development || ''}
                          onChange={e => setProfile({ ...profile, speech_development: e.target.value })}
                          placeholder="Primeiras palavras, compreensão verbal, trocas fonológicas..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Rotina de Sono & Alimentação</label>
                        <textarea
                          rows={2}
                          value={profile.sleep_routine || ''}
                          onChange={e => setProfile({ ...profile, sleep_routine: e.target.value })}
                          placeholder="Qualidade do sono, horários, seletividade alimentar..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Card 3: Adaptação Escolar & Relações */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                  <div
                    onClick={() => setExpandedSections(p => ({ ...p, adaptation: !p.adaptation }))}
                    className="p-4 bg-slate-50/80 hover:bg-slate-100/80 cursor-pointer flex items-center justify-between border-b border-slate-200 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-indigo-600" />
                      <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                        3. Adaptação Escolar, Relacionamento com Pares & Família
                      </h4>
                    </div>
                    {expandedSections.adaptation ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </div>

                  {expandedSections.adaptation && (
                    <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Adaptação Escolar e Histórico de Mudanças</label>
                        <textarea
                          rows={2}
                          value={profile.school_adaptation || ''}
                          onChange={e => setProfile({ ...profile, school_adaptation: e.target.value })}
                          placeholder="Como lida com a entrada na escola, regras da sala, lição de casa..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Relacionamento com Pares & Educadores</label>
                        <textarea
                          rows={2}
                          value={profile.relationship_with_peers || ''}
                          onChange={e => setProfile({ ...profile, relationship_with_peers: e.target.value })}
                          placeholder="Interação nos recreios, trabalho em equipe, figuras de autoridade..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Contexto e Dinâmica Familiar</label>
                        <textarea
                          rows={2}
                          value={profile.family_dynamics || ''}
                          onChange={e => setProfile({ ...profile, family_dynamics: e.target.value })}
                          placeholder="Composição do lar, irmãos, mediação dos estudos em casa..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Fatores Emocionais & Comportamentais</label>
                        <textarea
                          rows={2}
                          value={profile.emotional_factors || ''}
                          onChange={e => setProfile({ ...profile, emotional_factors: e.target.value })}
                          placeholder="Tolerância à frustração, ansiedade em provas, motivação para aprender..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Card 4: Intervenções, Potencialidades & Dificuldades */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                  <div
                    onClick={() => setExpandedSections(p => ({ ...p, interventions: !p.interventions }))}
                    className="p-4 bg-slate-50/80 hover:bg-slate-100/80 cursor-pointer flex items-center justify-between border-b border-slate-200 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 text-indigo-600" />
                      <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                        4. Histórico de Intervenções, Potencialidades & Dificuldades
                      </h4>
                    </div>
                    {expandedSections.interventions ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </div>

                  {expandedSections.interventions && (
                    <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Intervenções Prévias Realizadas</label>
                        <textarea
                          rows={3}
                          value={profile.previous_interventions || ''}
                          onChange={e => setProfile({ ...profile, previous_interventions: e.target.value })}
                          placeholder="Fonoaudiologia, Terapia Ocupacional, Neuropediatria, Reforço escolar..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Potencialidades do Aprendente</label>
                        <textarea
                          rows={3}
                          value={profile.strengths || ''}
                          onChange={e => setProfile({ ...profile, strengths: e.target.value })}
                          placeholder="Interesses especiais, criatividade, raciocínio visual, memória..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Dificuldades Observadas</label>
                        <textarea
                          rows={3}
                          value={profile.difficulties || ''}
                          onChange={e => setProfile({ ...profile, difficulties: e.target.value })}
                          placeholder="Áreas de maior resistência ou lacunas conceituais identificadas..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* ABA 3: AVALIAÇÃO PSICOPEDAGÓGICA (Terminologia Normatizada) */}
            {/* ========================================================================= */}
            {activeTab === 'assessment' && (
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Brain className="w-4 h-4 text-indigo-600" />
                      Avaliação Psicopedagógica & Perfil de Aprendizagem
                    </h3>
                    <p className="text-xs text-slate-500">
                      Mapeamento das modalidades de aprendizagem, potencialidades e formulação da síntese psicopedagógica.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveAssessment}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar Avaliação Psicopedagógica</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Demanda Investigada</label>
                    <textarea
                      rows={3}
                      value={assessment.demand_investigated || ''}
                      onChange={e => setAssessment({ ...assessment, demand_investigated: e.target.value })}
                      placeholder="Descreva a demanda de aprendizagem analisada..."
                      className="w-full p-3 rounded-xl border border-slate-300 bg-white"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Observações Clínicas & Lúdicas</label>
                    <textarea
                      rows={3}
                      value={assessment.observations || ''}
                      onChange={e => setAssessment({ ...assessment, observations: e.target.value })}
                      placeholder="Comportamento diante de desafios lúdicos, postura corporal, tolerância ao erro..."
                      className="w-full p-3 rounded-xl border border-slate-300 bg-white"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Potencialidades Observadas</label>
                    <textarea
                      rows={3}
                      value={assessment.strengths_observed || ''}
                      onChange={e => setAssessment({ ...assessment, strengths_observed: e.target.value })}
                      placeholder="Recursos cognitivos, interesse por temas específicos, facilidade com mediação visual..."
                      className="w-full p-3 rounded-xl border border-slate-300 bg-white"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Dificuldades Específicas</label>
                    <textarea
                      rows={3}
                      value={assessment.areas_of_difficulty || ''}
                      onChange={e => setAssessment({ ...assessment, areas_of_difficulty: e.target.value })}
                      placeholder="Dificuldades na retenção auditiva, discriminação fonológica, cálculo..."
                      className="w-full p-3 rounded-xl border border-slate-300 bg-white"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Estratégias Pedagógicas Utilizadas</label>
                    <textarea
                      rows={3}
                      value={assessment.strategies_used || ''}
                      onChange={e => setAssessment({ ...assessment, strategies_used: e.target.value })}
                      placeholder="Técnicas de mediação, pistas multisensoriais e jogos avaliativos..."
                      className="w-full p-3 rounded-xl border border-slate-300 bg-white"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Resultados das Provas & Instrumentos</label>
                    <textarea
                      rows={3}
                      value={assessment.results_evaluated || ''}
                      onChange={e => setAssessment({ ...assessment, results_evaluated: e.target.value })}
                      placeholder="Desempenho qualitativo nas provas operatórias, EOCA e escrita..."
                      className="w-full p-3 rounded-xl border border-slate-300 bg-white"
                    />
                  </div>

                  <div className="md:col-span-2 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 space-y-4">
                    <div>
                      <label className="font-bold text-indigo-950 block mb-1">
                        Síntese Psicopedagógica
                      </label>
                      <textarea
                        rows={3}
                        value={assessment.psychopedagogical_synthesis || assessment.conclusions || ''}
                        onChange={e => setAssessment({ ...assessment, psychopedagogical_synthesis: e.target.value, conclusions: e.target.value })}
                        placeholder="Redija a síntese do perfil de aprendizagem observado com base nas evidências pedagógicas..."
                        className="w-full p-3 rounded-xl border border-indigo-200 bg-white focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-indigo-950 block mb-1">
                        Hipótese Psicopedagógica (Não preenchida automaticamente)
                      </label>
                      <textarea
                        rows={2}
                        value={assessment.pedagogical_hypothesis || ''}
                        onChange={e => setAssessment({ ...assessment, pedagogical_hypothesis: e.target.value })}
                        placeholder="Formulação da hipótese pedagógica para direcionar o plano de intervenção..."
                        className="w-full p-3 rounded-xl border border-indigo-200 bg-white focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-indigo-950 block mb-1">
                        Recomendações Escolares e Domiciliares
                      </label>
                      <textarea
                        rows={2}
                        value={assessment.recommendations || ''}
                        onChange={e => setAssessment({ ...assessment, recommendations: e.target.value })}
                        placeholder="Orientações e adaptações propostas para os educadores e para a família..."
                        className="w-full p-3 rounded-xl border border-indigo-200 bg-white focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* ABA 4: APRENDIZAGEM (Subabas: Leitura, Escrita, Matemática, Executivas, Cadernos) */}
            {/* ========================================================================= */}
            {activeTab === 'learning' && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Pencil className="w-4 h-4 text-indigo-600" />
                        Domínios da Aprendizagem & Produções
                      </h3>
                      <p className="text-xs text-slate-500">
                        Análise longitudinal de leitura, escrita, matemática, funções executivas e análise de cadernos.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveLearning}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Salvar Análise de Aprendizagem</span>
                    </button>
                  </div>

                  {/* Subabas de Navegação */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {[
                      { id: 'reading', label: 'Leitura', icon: BookOpen },
                      { id: 'writing', label: 'Escrita', icon: Pencil },
                      { id: 'math', label: 'Matemática', icon: Calculator },
                      { id: 'cognition', label: 'Funções Executivas', icon: Brain },
                      { id: 'notebooks', label: 'Cadernos & Produções', icon: Layers }
                    ].map(sub => {
                      const Icon = sub.icon;
                      const isSubActive = learningSubTab === sub.id;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => setLearningSubTab(sub.id as LearningSubTab)}
                          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                            isSubActive
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span>{sub.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Subaba 1: Leitura */}
                  {learningSubTab === 'reading' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Decodificação (Grafema-Fonema)</label>
                        <textarea
                          rows={2}
                          value={learningForm.reading_decoding}
                          onChange={e => setLearningForm({ ...learningForm, reading_decoding: e.target.value })}
                          placeholder="Precisão na conversão grafema-fonema, lentidão, hesitações..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Fluência Leitora</label>
                        <textarea
                          rows={2}
                          value={learningForm.reading_fluency}
                          onChange={e => setLearningForm({ ...learningForm, reading_fluency: e.target.value })}
                          placeholder="Velocidade, ritmo, respeito à pontuação e entonação..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Compreensão Leitora</label>
                        <textarea
                          rows={2}
                          value={learningForm.reading_comprehension}
                          onChange={e => setLearningForm({ ...learningForm, reading_comprehension: e.target.value })}
                          placeholder="Identificação de ideias explícitas e inferências no texto..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Consciência Fonológica</label>
                        <textarea
                          rows={2}
                          value={learningForm.reading_phonological_awareness}
                          onChange={e => setLearningForm({ ...learningForm, reading_phonological_awareness: e.target.value })}
                          placeholder="Rima, aliteração, manipulação silábica e fonêmica..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="font-bold text-slate-700 block mb-1">Observações & Padrões em Leitura</label>
                        <textarea
                          rows={2}
                          value={learningForm.reading_notes}
                          onChange={e => setLearningForm({ ...learningForm, reading_notes: e.target.value })}
                          placeholder="Estratégias compensatórias observadas..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>
                    </div>
                  )}

                  {/* Subaba 2: Escrita */}
                  {learningSubTab === 'writing' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Ortografia & Regras Contextuais</label>
                        <textarea
                          rows={2}
                          value={learningForm.writing_orthography}
                          onChange={e => setLearningForm({ ...learningForm, writing_orthography: e.target.value })}
                          placeholder="Trocas fonológicas (p/b, t/d), omissões, acentuação..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Produção Textual & Coerência</label>
                        <textarea
                          rows={2}
                          value={learningForm.writing_text_production}
                          onChange={e => setLearningForm({ ...learningForm, writing_text_production: e.target.value })}
                          placeholder="Estruturação em frases, parágrafos, vocabulário e coesão..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Grafomotricidade & Preensão</label>
                        <textarea
                          rows={2}
                          value={learningForm.writing_graphomotor}
                          onChange={e => setLearningForm({ ...learningForm, writing_graphomotor: e.target.value })}
                          placeholder="Preensão do lápis, tônus, fadiga ao escrever, traçado..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Organização Espacial no Papel</label>
                        <textarea
                          rows={2}
                          value={learningForm.writing_spatial_organization}
                          onChange={e => setLearningForm({ ...learningForm, writing_spatial_organization: e.target.value })}
                          placeholder="Respeito às linhas e margens, espaçamento entre palavras..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="font-bold text-slate-700 block mb-1">Observações Gerais de Escrita</label>
                        <textarea
                          rows={2}
                          value={learningForm.writing_notes}
                          onChange={e => setLearningForm({ ...learningForm, writing_notes: e.target.value })}
                          placeholder="Observações qualitativas sobre a expressão escrita..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>
                    </div>
                  )}

                  {/* Subaba 3: Matemática */}
                  {learningSubTab === 'math' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Conceito Numérico & Quantidade</label>
                        <textarea
                          rows={2}
                          value={learningForm.math_number_concept}
                          onChange={e => setLearningForm({ ...learningForm, math_number_concept: e.target.value })}
                          placeholder="Noção de magnitude, contagem, valor posicional..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Cálculo Mental & Algoritmos</label>
                        <textarea
                          rows={2}
                          value={learningForm.math_calculation}
                          onChange={e => setLearningForm({ ...learningForm, math_calculation: e.target.value })}
                          placeholder="Adição, subtração, tabuada, estratégias de cálculo..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Resolução de Problemas</label>
                        <textarea
                          rows={2}
                          value={learningForm.math_problem_solving}
                          onChange={e => setLearningForm({ ...learningForm, math_problem_solving: e.target.value })}
                          placeholder="Compreensão do enunciado, escolha da operação correta..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Raciocínio Lógico-Matemático</label>
                        <textarea
                          rows={2}
                          value={learningForm.math_logical_reasoning}
                          onChange={e => setLearningForm({ ...learningForm, math_logical_reasoning: e.target.value })}
                          placeholder="Padrões geométricos, sequências, classificação e ordenação..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="font-bold text-slate-700 block mb-1">Observações em Matemática</label>
                        <textarea
                          rows={2}
                          value={learningForm.math_notes}
                          onChange={e => setLearningForm({ ...learningForm, math_notes: e.target.value })}
                          placeholder="Necessidade de material concreto, blocos lógicos..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>
                    </div>
                  )}

                  {/* Subaba 4: Funções Executivas */}
                  {learningSubTab === 'cognition' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs pt-2">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Atenção (Sustentada / Seletiva)</label>
                        <textarea
                          rows={2}
                          value={learningForm.exec_attention}
                          onChange={e => setLearningForm({ ...learningForm, exec_attention: e.target.value })}
                          placeholder="Manutenção do foco, suscetibilidade a distratores..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Memória de Trabalho</label>
                        <textarea
                          rows={2}
                          value={learningForm.exec_working_memory}
                          onChange={e => setLearningForm({ ...learningForm, exec_working_memory: e.target.value })}
                          placeholder="Retenção de comandos múltiplos, operações sequenciais..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Planejamento & Organização</label>
                        <textarea
                          rows={2}
                          value={learningForm.exec_planning_organization}
                          onChange={e => setLearningForm({ ...learningForm, exec_planning_organization: e.target.value })}
                          placeholder="Antecipação de etapas, gestão de tempo da tarefa..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Controle Inibitório</label>
                        <textarea
                          rows={2}
                          value={learningForm.exec_inhibitory_control}
                          onChange={e => setLearningForm({ ...learningForm, exec_inhibitory_control: e.target.value })}
                          placeholder="Impulsividade nas respostas, paciência para ler até o fim..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Flexibilidade Cognitiva</label>
                        <textarea
                          rows={2}
                          value={learningForm.exec_cognitive_flexibility}
                          onChange={e => setLearningForm({ ...learningForm, exec_cognitive_flexibility: e.target.value })}
                          placeholder="Mudança de estratégia diante do erro, adaptação a regras..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Observações Gerais</label>
                        <textarea
                          rows={2}
                          value={learningForm.exec_notes}
                          onChange={e => setLearningForm({ ...learningForm, exec_notes: e.target.value })}
                          placeholder="Reflexos no desempenho escolar diário..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>
                    </div>
                  )}

                  {/* Subaba 5: Cadernos & Produções */}
                  {learningSubTab === 'notebooks' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs pt-2">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Organização Espacial no Caderno</label>
                        <textarea
                          rows={2}
                          value={learningForm.notebooks_spatial_layout}
                          onChange={e => setLearningForm({ ...learningForm, notebooks_spatial_layout: e.target.value })}
                          placeholder="Uso de cabeçalho, margens, divisão entre matérias..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Grafia & Legibilidade</label>
                        <textarea
                          rows={2}
                          value={learningForm.notebooks_handwriting_legibility}
                          onChange={e => setLearningForm({ ...learningForm, notebooks_handwriting_legibility: e.target.value })}
                          placeholder="Tamanho das letras, uniformidade, legibilidade..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Padrão de Erros Recorrentes</label>
                        <textarea
                          rows={2}
                          value={learningForm.notebooks_error_patterns}
                          onChange={e => setLearningForm({ ...learningForm, notebooks_error_patterns: e.target.value })}
                          placeholder="Cópia incompleta da lousa, omissão de letras finais..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Ritmo & Cadência</label>
                        <textarea
                          rows={2}
                          value={learningForm.notebooks_cadence_pace}
                          onChange={e => setLearningForm({ ...learningForm, notebooks_cadence_pace: e.target.value })}
                          placeholder="Velocidade de registro em comparação com a turma..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Frequência de Rasuras</label>
                        <textarea
                          rows={2}
                          value={learningForm.notebooks_erasures_frequency}
                          onChange={e => setLearningForm({ ...learningForm, notebooks_erasures_frequency: e.target.value })}
                          placeholder="Borrões frequentes, uso de corretivo, folhas rasgadas..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Observações da Produção</label>
                        <textarea
                          rows={2}
                          value={learningForm.notebooks_general_notes}
                          onChange={e => setLearningForm({ ...learningForm, notebooks_general_notes: e.target.value })}
                          placeholder="Síntese da análise material do caderno..."
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* ABA 5: PLANO & METAS (PIP + MeasurableGoalsManager) */}
            {/* ========================================================================= */}
            {activeTab === 'plans_goals' && (
              <div className="space-y-6">
                {/* Seção 1: Plano de Intervenção Psicopedagógica (PIP) */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Target className="w-4 h-4 text-indigo-600" />
                        Plano de Intervenção Psicopedagógica (PIP)
                      </h3>
                      <p className="text-xs text-slate-500">
                        Estruturação das intervenções periódicas, metodologia e objetivos gerais.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleSavePlan}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Salvar Plano PIP</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                    <div className="sm:col-span-2">
                      <label className="font-bold text-slate-700 block mb-1">Título do Plano</label>
                      <input
                        type="text"
                        value={currentPlan.title || ''}
                        onChange={e => setCurrentPlan({ ...currentPlan, title: e.target.value })}
                        placeholder="Ex: Estimulação da Leitura e Autorregulação Atencional"
                        className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Frequência das Sessões</label>
                      <input
                        type="text"
                        value={currentPlan.frequency || ''}
                        onChange={e => setCurrentPlan({ ...currentPlan, frequency: e.target.value })}
                        placeholder="Ex: 1x por semana (50 min)"
                        className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Data de Início</label>
                      <input
                        type="date"
                        value={currentPlan.start_date || ''}
                        onChange={e => setCurrentPlan({ ...currentPlan, start_date: e.target.value })}
                        className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Previsão de Revisão</label>
                      <input
                        type="date"
                        value={currentPlan.review_date || ''}
                        onChange={e => setCurrentPlan({ ...currentPlan, review_date: e.target.value })}
                        className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Status do Plano</label>
                      <select
                        value={currentPlan.status || 'active'}
                        onChange={e => setCurrentPlan({ ...currentPlan, status: e.target.value })}
                        className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                      >
                        <option value="active">Ativo (Em Andamento)</option>
                        <option value="review">Em Revisão</option>
                        <option value="completed">Concluído</option>
                        <option value="paused">Suspenso</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2 lg:col-span-3">
                      <label className="font-bold text-slate-700 block mb-1">Objetivos Gerais & Específicos</label>
                      <textarea
                        rows={3}
                        value={currentPlan.objectives || ''}
                        onChange={e => setCurrentPlan({ ...currentPlan, objectives: e.target.value })}
                        placeholder="Quais competências e habilidades serão mediadas ao longo do plano..."
                        className="w-full p-3 rounded-xl border border-slate-300 bg-white"
                      />
                    </div>

                    <div className="sm:col-span-2 lg:col-span-3">
                      <label className="font-bold text-slate-700 block mb-1">Estratégias & Metodologia Psicopedagógica</label>
                      <textarea
                        rows={3}
                        value={currentPlan.methodology || ''}
                        onChange={e => setCurrentPlan({ ...currentPlan, methodology: e.target.value })}
                        placeholder="Jogos de regras, atividades estruturadas, pistas visuais, mediação da leitura..."
                        className="w-full p-3 rounded-xl border border-slate-300 bg-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Seção 2: Metas Psicopedagógicas Mensuráveis */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
                  <MeasurableGoalsManager
                    patientId={selectedPatientId}
                    specialty="pp"
                    moduleType="ZemdaPP"
                    title="Metas Psicopedagógicas Mensuráveis"
                  />
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* ABA 6: FAMÍLIA & ESCOLA (Alinhamento & Institucional) */}
            {/* ========================================================================= */}
            {activeTab === 'family_school' && (
              <div className="space-y-6">
                {/* Seletor de Modo: Clínico vs Institucional */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Alinhamento Família, Escola & Institucional</h3>
                    <p className="text-xs text-slate-500">
                      Registre contatos com pais e educadores ou gerencie projetos institucionais de assessoria escolar.
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                    <button
                      type="button"
                      onClick={() => setContactMode('clinical')}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                        contactMode === 'clinical'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Clínico (Aprendente)
                    </button>
                    <button
                      type="button"
                      onClick={() => setContactMode('institutional')}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                        contactMode === 'institutional'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Institucional (Assessoria Escolar)
                    </button>
                  </div>
                </div>

                {contactMode === 'clinical' ? (
                  <div className="space-y-6">
                    {/* Formulário de Novo Contato */}
                    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <h4 className="font-bold text-xs uppercase text-slate-800 tracking-wider flex items-center gap-1.5">
                          <School className="w-4 h-4 text-indigo-600" />
                          Registrar Contato / Devolutiva
                        </h4>
                        <button
                          type="button"
                          onClick={handleAddSchoolContact}
                          disabled={saving}
                          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                        >
                          Salvar Contato
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">Data do Contato</label>
                          <input
                            type="date"
                            value={newContact.contact_date}
                            onChange={e => setNewContact({ ...newContact, contact_date: e.target.value })}
                            className="w-full p-2 rounded-xl border border-slate-300 bg-white"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-slate-700 block mb-1">Tipo de Interlocutor</label>
                          <select
                            value={newContact.target_type}
                            onChange={e => setNewContact({ ...newContact, target_type: e.target.value as any })}
                            className="w-full p-2 rounded-xl border border-slate-300 bg-white"
                          >
                            <option value="school">Escola / Educadores</option>
                            <option value="family">Família / Responsáveis</option>
                            <option value="institution">Outros Profissionais / Terapeutas</option>
                          </select>
                        </div>

                        <div>
                          <label className="font-bold text-slate-700 block mb-1">Nome do Interlocutor</label>
                          <input
                            type="text"
                            value={newContact.interlocutor_name}
                            onChange={e => setNewContact({ ...newContact, interlocutor_name: e.target.value })}
                            placeholder="Ex: Profª Ana Paula / Dr. Marcelo"
                            className="w-full p-2 rounded-xl border border-slate-300 bg-white"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-slate-700 block mb-1">Função / Relação</label>
                          <input
                            type="text"
                            value={newContact.role_relationship}
                            onChange={e => setNewContact({ ...newContact, role_relationship: e.target.value })}
                            placeholder="Ex: Professora Regente / Mãe"
                            className="w-full p-2 rounded-xl border border-slate-300 bg-white"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="font-bold text-slate-700 block mb-1">Assunto Abordado</label>
                          <input
                            type="text"
                            value={newContact.subject}
                            onChange={e => setNewContact({ ...newContact, subject: e.target.value })}
                            placeholder="Ex: Alinhamento de provas adaptadas e tempo estendido"
                            className="w-full p-2 rounded-xl border border-slate-300 bg-white"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-slate-700 block mb-1">Previsão Próximo Contato</label>
                          <input
                            type="date"
                            value={newContact.next_contact_date}
                            onChange={e => setNewContact({ ...newContact, next_contact_date: e.target.value })}
                            className="w-full p-2 rounded-xl border border-slate-300 bg-white"
                          />
                        </div>

                        <div className="sm:col-span-2 lg:col-span-4">
                          <label className="font-bold text-slate-700 block mb-1">Orientações & Acordos Estabelecidos</label>
                          <textarea
                            rows={2}
                            value={newContact.guidance_given}
                            onChange={e => setNewContact({ ...newContact, guidance_given: e.target.value })}
                            placeholder="Descreva o que foi orientado ou acordado..."
                            className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Linha do Tempo de Contatos */}
                    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
                      <h4 className="font-bold text-xs uppercase text-slate-800 tracking-wider flex items-center gap-1.5">
                        <History className="w-4 h-4 text-indigo-600" />
                        Linha do Tempo de Contatos & Devolutivas ({schoolContacts.length})
                      </h4>

                      {schoolContacts.length === 0 ? (
                        <p className="text-xs text-slate-400 italic text-center py-6">
                          Nenhum contato com escola ou família registrado até o momento.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {schoolContacts.map((c, i) => (
                            <div key={c.id || i} className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-900 flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    c.target_type === 'school' ? 'bg-emerald-100 text-emerald-800' :
                                    c.target_type === 'family' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                                  }`}>
                                    {c.target_type === 'school' ? 'Escola' : c.target_type === 'family' ? 'Família' : 'Terapeutas'}
                                  </span>
                                  <strong>{c.interlocutor_name}</strong> ({c.role_relationship || 'Interlocutor'})
                                </span>
                                <span className="text-[11px] text-slate-400 font-mono">
                                  {new Date(c.contact_date).toLocaleDateString('pt-BR')}
                                </span>
                              </div>
                              {c.subject && <p className="text-slate-700"><strong>Assunto:</strong> {c.subject}</p>}
                              {c.guidance_given && <p className="text-slate-600"><strong>Orientações:</strong> {c.guidance_given}</p>}
                              {c.next_contact_date && (
                                <span className="text-[10px] text-indigo-700 font-bold block">
                                  Próximo retorno previsto: {new Date(c.next_contact_date).toLocaleDateString('pt-BR')}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Modo Institucional: Assessoria Escolar & Projetos */
                  <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div>
                        <h4 className="font-bold text-xs uppercase text-slate-800 tracking-wider flex items-center gap-1.5">
                          <Building className="w-4 h-4 text-indigo-600" />
                          Projetos & Intervenções Psicopedagógicas Institucionais
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Intervenções coletivas em ambiente escolar sem vínculo a prontuários clínicos individuais.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleSaveInstitutionalCase}
                        disabled={saving}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                      >
                        Salvar Projeto Institucional
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Nome da Instituição Escolar</label>
                        <input
                          type="text"
                          value={institutionalCase.institution_name}
                          onChange={e => setInstitutionalCase({ ...institutionalCase, institution_name: e.target.value })}
                          placeholder="Ex: Escola Municipal Monteiro Lobato"
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Demanda Institucional</label>
                        <input
                          type="text"
                          value={institutionalCase.demand_type}
                          onChange={e => setInstitutionalCase({ ...institutionalCase, demand_type: e.target.value })}
                          placeholder="Ex: Dificuldades de Alfabetização no 2º Ano / Clima de Sala"
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Turmas / Séries Envolvidas</label>
                        <input
                          type="text"
                          value={institutionalCase.grade_involved}
                          onChange={e => setInstitutionalCase({ ...institutionalCase, grade_involved: e.target.value })}
                          placeholder="Ex: 2º Ano A e B"
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Educadores Participantes</label>
                        <input
                          type="text"
                          value={institutionalCase.teachers_involved}
                          onChange={e => setInstitutionalCase({ ...institutionalCase, teachers_involved: e.target.value })}
                          placeholder="Ex: Equipe de alfabetizadores e coordenação"
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="font-bold text-slate-700 block mb-1">Diagnóstico Institucional & Observações</label>
                        <textarea
                          rows={2}
                          value={institutionalCase.observations}
                          onChange={e => setInstitutionalCase({ ...institutionalCase, observations: e.target.value })}
                          placeholder="Descreva a dinâmica institucional e as necessidades observadas..."
                          className="w-full p-3 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="font-bold text-slate-700 block mb-1">Plano de Ação Institucional</label>
                        <textarea
                          rows={3}
                          value={institutionalCase.action_plan}
                          onChange={e => setInstitutionalCase({ ...institutionalCase, action_plan: e.target.value })}
                          placeholder="Workshops, adaptações curriculares coletivas, formação continuada..."
                          className="w-full p-3 rounded-xl border border-slate-300 bg-white"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ========================================================================= */}
            {/* ABA 7: TESTES & ANEXOS (Instrumentos + ExternalTestsManager) */}
            {/* ========================================================================= */}
            {activeTab === 'tests_attachments' && (
              <div className="space-y-6">
                {/* Bloqueio Ético SATEPSI / CFP */}
                {blockedAlert && (
                  <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 text-rose-900 text-xs flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-bold">Bloqueio Ético & Legal Regulatório</strong>
                      <p className="mt-1 leading-relaxed">{blockedAlert}</p>
                      <span className="block mt-1 text-[11px] text-rose-700 font-semibold">
                        A utilização de instrumentos psicológicos privativos é vedada a profissionais não habilitados em Psicologia (Lei nº 4.119/62 e Resoluções CFP/SATEPSI).
                      </span>
                    </div>
                  </div>
                )}

                {/* Seção 1: Instrumentos Psicopedagógicos Clínicos */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Brain className="w-4 h-4 text-indigo-600" />
                        Instrumentos Psicopedagógicos Clínicos
                      </h3>
                      <p className="text-xs text-slate-500">
                        Provas Operatórias de Piaget, EOCA, TDE-II e protocolos psicopedagógicos de aprendizagem.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddInstrument}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar Instrumento</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Nome do Instrumento</label>
                      <input
                        type="text"
                        value={newInstrument.instrument_name}
                        onChange={e => setNewInstrument({ ...newInstrument, instrument_name: e.target.value })}
                        placeholder="Ex: Prova de Conservação de Quantidade / EOCA"
                        className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Categoria do Instrumento</label>
                      <select
                        value={newInstrument.instrument_category}
                        onChange={e => setNewInstrument({ ...newInstrument, instrument_category: e.target.value })}
                        className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                      >
                        <option value="Provas Operatórias Piagetianas">Provas Operatórias Piagetianas</option>
                        <option value="EOCA (Entrevista Operativa)">EOCA (Entrevista Operativa)</option>
                        <option value="Provas de Leitura e Escrita">Provas de Leitura e Escrita (Prolec/TDE)</option>
                        <option value="Análise de Produção Escolar">Análise de Produção Escolar</option>
                        <option value="Outro Protocolo Psicopedagógico">Outro Protocolo Psicopedagógico</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Data da Aplicação</label>
                      <input
                        type="date"
                        value={newInstrument.application_date}
                        onChange={e => setNewInstrument({ ...newInstrument, application_date: e.target.value })}
                        className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="font-bold text-slate-700 block mb-1">Síntese dos Resultados Qualitativos</label>
                      <textarea
                        rows={2}
                        value={newInstrument.results_summary}
                        onChange={e => setNewInstrument({ ...newInstrument, results_summary: e.target.value })}
                        placeholder="Observações qualitativas obtidas na aplicação do instrumento..."
                        className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                      />
                    </div>
                  </div>

                  {/* Lista de Instrumentos */}
                  <div className="pt-3">
                    <h4 className="font-bold text-xs uppercase text-slate-700 mb-2">
                      Instrumentos Registrados ({instruments.length})
                    </h4>
                    {instruments.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-2">Nenhum instrumento psicopedagógico registrado.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {instruments.map((inst, idx) => (
                          <div key={inst.id || idx} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                            <div className="flex items-center justify-between">
                              <strong className="text-slate-900 font-bold">{inst.instrument_name}</strong>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {new Date(inst.application_date).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                            <span className="text-[10px] text-indigo-700 font-semibold block">{inst.instrument_category}</span>
                            {inst.results_summary && <p className="text-slate-600">{inst.results_summary}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Seção 2: Testes Externos & Anexos (ExternalTestsManager) */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
                  <ExternalTestsManager
                    patientId={selectedPatientId}
                    moduleType="ZemdaPP"
                    appointmentId={initialAppointmentId}
                    accentColor="indigo"
                    title="Anexos, Cadernos Digitalizados & Testes Externos (ZemdaPP)"
                  />
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* ABA 8: FINALIZAÇÃO (Padrão Canônico Zemda) */}
            {/* ========================================================================= */}
            {activeTab === 'finish' && (
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-6">
                <div className="pb-4 border-b border-slate-100">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                    Finalização do Atendimento Psicopedagógico
                  </h3>
                  <p className="text-xs text-slate-500">
                    Revise as informações, confirme a evolução e sele o atendimento no prontuário do aprendente.
                  </p>
                </div>

                {/* Resumo do Aprendente */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Aprendente</span>
                    <strong className="text-slate-900 text-sm block">{selectedPatient?.full_name || selectedPatient?.name}</strong>
                    {selectedPatient?.birth_date && (
                      <span className="text-slate-500 text-[11px]">
                        Nasc: {new Date(selectedPatient.birth_date).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Escola / Série</span>
                    <strong className="text-slate-900 block">
                      {profile.school_name || 'Não informada'}
                    </strong>
                    <span className="text-slate-500 text-[11px]">
                      {profile.grade_level || 'Série a definir'}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Profissional Responsável</span>
                    <strong className="text-slate-900 block">{currentUser?.name}</strong>
                    <span className="text-slate-500 text-[11px]">Psicopedagogia Clínica</span>
                  </div>
                </div>

                {/* Formulário de Finalização */}
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="font-bold text-slate-800 block mb-1">Título do Atendimento</label>
                    <input
                      type="text"
                      value={finishForm.consultation_title}
                      onChange={e => setFinishForm({ ...finishForm, consultation_title: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-semibold"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-800 block mb-1 flex items-center justify-between">
                      <span>Evolução Psicopedagógica * (Obrigatória no Prontuário)</span>
                      <span className="text-[10px] text-slate-400 font-normal">Sincronizada automaticamente com a aba Evolução</span>
                    </label>
                    <textarea
                      rows={6}
                      value={finishForm.evolution_text}
                      onChange={e => setFinishForm({ ...finishForm, evolution_text: e.target.value })}
                      placeholder="Descreva a evolução psicopedagógica completa observada durante a sessão..."
                      className="w-full p-3.5 rounded-xl border border-slate-300 bg-white leading-relaxed font-sans focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="font-bold text-slate-800 block mb-1">Condutas & Próximos Passos</label>
                      <textarea
                        rows={3}
                        value={finishForm.next_steps}
                        onChange={e => setFinishForm({ ...finishForm, next_steps: e.target.value })}
                        placeholder="Orientações para o próximo encontro, planejamento das intervenções..."
                        className="w-full p-3 rounded-xl border border-slate-300 bg-white"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-800 block mb-1">Orientações à Família & Escola</label>
                      <textarea
                        rows={3}
                        value={finishForm.guidance_summary}
                        onChange={e => setFinishForm({ ...finishForm, guidance_summary: e.target.value })}
                        placeholder="Recomendações pontuais repassadas aos pais ou educadores..."
                        className="w-full p-3 rounded-xl border border-slate-300 bg-white"
                      />
                    </div>
                  </div>

                  {/* Selamento de Integridade do Prontuário */}
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                    <label className="font-bold text-slate-800 block">Selamento & Integridade do Prontuário:</label>
                    <div className="p-3 bg-white rounded-xl border border-indigo-100 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5">
                        <Lock className="w-4 h-4" />
                      </div>
                      <div className="space-y-1">
                        <strong className="text-slate-900 font-bold block text-xs">Selo Interno de Integridade Zemda (SHA-256)</strong>
                        <p className="text-slate-500 text-[11px] leading-relaxed">
                          Ao finalizar, o atendimento será selado de forma imutável com carimbo de tempo, autoria autenticada e hash criptográfico SHA-256 no prontuário do aprendente.
                        </p>
                        <p className="text-slate-400 text-[10.5px]">
                          Para emissão de relatórios, laudos e pareceres, utilize as opções pós-atendimento para impressão com assinatura manual física.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Botão de Finalização Principal */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={handleFinishConsultation}
                    disabled={saving}
                    className="flex items-center gap-2 px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <span>{saving ? 'Finalizando e Selando...' : 'Finalizar Atendimento Psicopedagógico'}</span>
                  </button>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 9. MODAL PÓS-ATENDIMENTO COM OPÇÕES DE DOCUMENTOS */}
      {/* ========================================================================= */}
      {showPostConsultationModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden p-6 text-center space-y-5 animate-in zoom-in-95">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900">Atendimento Finalizado com Sucesso!</h2>
              <p className="text-xs text-slate-500 mt-1">
                Evolução psicopedagógica selada e arquivada com integridade no prontuário do aprendente.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedDocType('relatorio');
                  setShowDocumentModal(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>Gerar Relatório Psicopedagógico</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedDocType('parecer');
                  setShowDocumentModal(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                <FileText className="w-4 h-4 text-indigo-600" />
                <span>Gerar Parecer Psicopedagógico</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedDocType('encaminhamento');
                  setShowDocumentModal(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                <Share2 className="w-4 h-4 text-indigo-600" />
                <span>Gerar Encaminhamento</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedDocType('orientacoes');
                  setShowDocumentModal(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                <School className="w-4 h-4 text-indigo-600" />
                <span>Gerar Orientações para Família/Escola</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPreviousRecordsModal(true)}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 text-indigo-600 hover:bg-indigo-50 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                <History className="w-4 h-4" />
                <span>Ver Prontuário</span>
              </button>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowPostConsultationModal(false);
                  if (onFinishConsultation) onFinishConsultation();
                }}
                className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IA PSICOPEDAGÓGICA */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
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
              <strong>Escopo Estrito de Apoio Pedagógico:</strong> A IA do ZemdaPP atua exclusivamente na sugestão de estratégias de mediação e formulação de hipóteses pedagógicas escolares. Não emite diagnósticos médicos ou psicológicos privativos.
            </div>

            <div className="space-y-2 text-xs">
              <label className="font-bold text-slate-700 block">Descreva o caso ou queixa pedagógica:</label>
              <textarea
                rows={4}
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                placeholder="Ex: Aprendente do 3º ano com queixa de lentidão na decodificação de leitura, trocas fonológicas na escrita e boa compreensão auditiva..."
                className="w-full p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {aiResult && (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2 max-h-60 overflow-y-auto">
                <strong className="text-slate-800 block">Sugestões Psicopedagógicas:</strong>
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
                {generatingAi ? 'Organizando ideias...' : 'Consultar IA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE HISTÓRICO / PRONTUÁRIOS ANTERIORES */}
      {showPreviousRecordsModal && selectedPatientId && (
        <PatientPreviousRecordsModal
          patientId={selectedPatientId}
          patientName={selectedPatient?.full_name || selectedPatient?.name}
          onClose={() => setShowPreviousRecordsModal(false)}
        />
      )}

      {/* MODAL DE DOCUMENTOS PSICOPEDAGÓGICOS (A4) */}
      {showDocumentModal && selectedPatient && (
        <PsychopedagogyDocumentModal
          isOpen={showDocumentModal}
          onClose={() => setShowDocumentModal(false)}
          patient={selectedPatient}
          initialDocType={selectedDocType}
          profileData={profile}
          assessmentData={assessment}
          sessionData={currentSession}
          domainsData={domains}
          instrumentsData={instruments}
          planData={currentPlan}
        />
      )}

      <ClinicalDraftRecoveryModal
        isOpen={autosave.conflictModalOpen}
        onClose={() => autosave.resolveConflict('local')}
        serverDraftTime={autosave.serverDraftData?.updated_at || autosave.serverDraftData?.client_updated_at}
        localDraftTime={autosave.localDraftData?.clientUpdatedAt}
        onRecoverServer={() => autosave.resolveConflict('server')}
        onKeepCurrent={() => autosave.resolveConflict('local')}
      />
    </div>
  );
};

export default PsychopedagogyWorkspace;
