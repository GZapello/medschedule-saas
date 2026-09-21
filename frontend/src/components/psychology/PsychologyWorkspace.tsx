import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Brain,
  FileText,
  User,
  Search,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Save,
  Trash2,
  History,
  Target,
  Sparkles,
  Shield,
  BookOpen,
  Lock,
  ExternalLink,
  ShieldCheck,
  Globe,
  AlertCircle,
  FileCheck,
  Send,
  Printer,
  Award,
  Info,
  X
} from 'lucide-react';
import { PsychologyDocumentModal } from './PsychologyDocumentModal';
import { PsychologyHistoryModal } from './PsychologyHistoryModal';
import { useHorizontalTabScroll } from '../../hooks/useHorizontalTabScroll';
import { ExternalTestsManager } from '../common/ExternalTestsManager';
import { MeasurableGoalsManager } from '../common/MeasurableGoalsManager';

interface PsychologyWorkspaceProps {
  initialPatientId?: string;
  initialAppointmentId?: string;
  onFinishConsultation?: () => void;
}

export const PsychologyWorkspace: React.FC<PsychologyWorkspaceProps> = ({
  initialPatientId,
  initialAppointmentId,
  onFinishConsultation
}) => {
  const { currentUser, clientTermLabel } = useAuth();
  const { showToast } = useToast();

  // Pacientes e Seleção
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId || '');
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [searchPatient, setSearchPatient] = useState<string>('');

  type TabKey = 'anamnese' | 'eem' | 'risk' | 'assessments' | 'screenings' | 'sessions' | 'goals' | 'external_tests';
  const [activeTab, setActiveTab] = useState<TabKey>('sessions');

  // Hook para usabilidade e scroll suave das abas de Psicologia
  const { tabScrollProps } = useHorizontalTabScroll(activeTab);

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // Modais
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [completionSuccessData, setCompletionSuccessData] = useState<any | null>(null);

  // Autosave & Finalização Rápida
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'offline'>('idle');
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [showFinishConfirmModal, setShowFinishConfirmModal] = useState<boolean>(false);

  const initialLoadedRef = useRef<boolean>(false);
  const debounceTimerRef = useRef<any>(null);

  // Assistente de IA Ético
  const [showAiDrawer, setShowAiDrawer] = useState(false);
  const [aiInputText, setAiInputText] = useState('');
  const [aiMode, setAiMode] = useState<'structure_topics' | 'clarity' | 'synthesis'>('structure_topics');
  const [aiResultText, setAiResultText] = useState('');
  const [loadingAi, setLoadingAi] = useState(false);

  // 1. Anamnese Psicológica (Estado Neutro Inicial)
  const [anamnese, setAnamnese] = useState({
    mainComplaint: '',
    demandHistory: '',
    psychPsychiatricHistory: '',
    medicalHistory: '',
    currentMedications: '',
    sleepPatterns: '',
    eatingHabits: '',
    physicalActivity: '',
    substanceUse: '',
    familyContext: '',
    developmentalHistory: '',
    maritalRelationshipContext: '',
    academicEducationalContext: '',
    professionalWorkContext: '',
    socialContext: '',
    supportNetwork: '',
    protectiveFactors: '',
    vulnerabilityFactors: '',
    significantLifeEvents: '',
    previousTreatments: '',
    treatmentGoals: '',
    theoreticalApproach: '',
    clinicalObservations: ''
  });

  // 2. Exame do Estado Mental (EEM) (Semiologia e Estado Neutro Inicial)
  const [mentalState, setMentalState] = useState({
    appearance: '',
    attitudeBehavior: '',
    consciousnessLevel: '',
    orientation: '',
    attention: '',
    memory: '',
    languageSpeech: '',
    psychomotor: '',
    mood: '',
    affect: '',
    thoughtProcess: '',
    sensoryPerception: '',
    cognitiveFunctions: '',
    criticalJudgment: '',
    insight: '',
    impulseControl: '',
    currentRisk: '',
    observations: ''
  });

  // 3. Avaliação de Risco Estruturada (Sem auto-diagnóstico)
  const [riskAssessment, setRiskAssessment] = useState({
    suicidalIdeation: '',
    selfHarm: '',
    planning: '',
    intentLevel: '',
    meansAccess: '',
    historyPreviousAttempts: '',
    precipitatingFactors: '',
    protectiveFactors: '',
    supportNetworkActionable: '',
    conductAdopted: '',
    referralDestination: '',
    safetyPlan: '',
    reassessmentSchedule: '',
    clinicianSummary: ''
  });

  // 4. Avaliação Psicológica Formal & Instrumentos SATEPSI
  const [assessmentsList, setAssessmentsList] = useState<any[]>([]);
  const [newAssessment, setNewAssessment] = useState({
    assessmentTitle: '',
    purpose: '',
    demandDescription: '',
    fundamentalSources: '',
    complementarySources: '',
    clinicalIntegrationAnalysis: '',
    conclusionSynthesis: ''
  });

  const [instrumentsList, setInstrumentsList] = useState<any[]>([]);
  const [newInstrument, setNewInstrument] = useState({
    instrumentName: '',
    version: '',
    publisher: '',
    purpose: '',
    modality: 'presencial',
    satepsiStatus: 'favoravel',
    professionalSynthesis: ''
  });

  // 5. Triagens & Escalas Complementares
  const [screeningsList, setScreeningsList] = useState<any[]>([]);
  const [newScreening, setNewScreening] = useState({
    screeningName: '',
    version: '',
    bibliographicReference: '',
    purpose: '',
    scoreRaw: '',
    classification: '',
    clinicalNotes: ''
  });

  // 6. Sessão Atual & Evoluções
  const [sessionsList, setSessionsList] = useState<any[]>([]);
  const [currentSession, setCurrentSession] = useState({
    sessionNumber: 1,
    sessionDate: new Date().toISOString().split('T')[0],
    modality: 'presencial', // 'presencial' | 'online'
    tdicInfo: {
      platform: 'Telemedicina Zemda',
      securityAcknowledged: true,
      technicalConditions: 'Estáveis e adequadas',
      emergencyContact: ''
    },
    currentDemand: '',
    relevantThemes: '',
    interventionsUsed: '',
    patientResponse: '',
    clinicalEvolution: '',
    conductPlan: '',
    referrals: '',
    nextSessionPlan: '',
    sessionRiskNotes: ''
  });

  // 7. Metas Terapêuticas
  const [goalsList, setGoalsList] = useState<any[]>([]);
  const [newGoal, setNewGoal] = useState({
    title: '',
    indicator: '',
    targetPeriod: '',
    strategy: '',
    notes: ''
  });

  // Documentos emitidos do paciente
  const [documentsList, setDocumentsList] = useState<any[]>([]);

  // Carrega lista de pacientes da clínica
  useEffect(() => {
    ApiClient.get('/v1/patients')
      .then((res: any) => {
        const list = Array.isArray(res) ? res : res?.patients || [];
        setPatients(list);
        if (!selectedPatientId && list.length > 0 && !initialPatientId) {
          setSelectedPatientId(list[0].id);
        }
      })
      .catch(err => console.warn('[PsychologyWorkspace] Erro ao carregar pacientes:', err));
  }, [initialPatientId]);

  // Persistência de Rascunho (Autosave Backend + Fallback Local)
  const performSaveDraft = useCallback(async () => {
    if (!selectedPatientId) return;

    const now = new Date();
    const clientUpdatedAt = now.toISOString();
    const payload = {
      currentSession,
      anamnese,
      mentalState,
      riskAssessment,
      activeTab
    };

    const localDraftKey = `zemda_psico_draft_${selectedPatientId}_${initialAppointmentId || 'none'}`;

    // 1. Fallback local imediato
    try {
      localStorage.setItem(localDraftKey, JSON.stringify({
        draftData: payload,
        clientUpdatedAt
      }));
    } catch (err) {
      console.warn('[PsychologyWorkspace] Falha ao gravar no localStorage:', err);
    }

    // 2. Persistência real no backend
    try {
      setAutosaveStatus('saving');
      if (!navigator.onLine) {
        setAutosaveStatus('offline');
        return;
      }

      await ApiClient.post('/v1/psychology/draft', {
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId,
        draftData: payload,
        clientUpdatedAt
      });

      const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setLastSavedTime(timeStr);
      setAutosaveStatus('saved');
      setIsDirty(false);
    } catch (err: any) {
      console.warn('[PsychologyWorkspace] Erro no autosave do backend:', err);
      if (!navigator.onLine || err?.message?.includes('conectar') || err?.message?.includes('Failed to fetch')) {
        setAutosaveStatus('offline');
      } else {
        setAutosaveStatus('error');
      }
    }
  }, [selectedPatientId, initialAppointmentId, currentSession, anamnese, mentalState, riskAssessment, activeTab]);

  // Carrega prontuário completo ao alterar paciente selecionado
  const loadPatientProfile = async (id: string) => {
    if (!id) return;
    try {
      initialLoadedRef.current = false;
      setIsDirty(false);
      setAutosaveStatus('idle');
      setLoading(true);
      const data: any = await ApiClient.get(`/v1/psychology/profile/${id}`);

      setSelectedPatient(data.patient || null);

      // Anamnese
      if (data.anamnesis) {
        setAnamnese({
          mainComplaint: data.anamnesis.main_complaint || '',
          demandHistory: data.anamnesis.demand_history || '',
          psychPsychiatricHistory: data.anamnesis.psych_psychiatric_history || '',
          medicalHistory: data.anamnesis.medical_history || '',
          currentMedications: data.anamnesis.current_medications || '',
          sleepPatterns: data.anamnesis.sleep_patterns || '',
          eatingHabits: data.anamnesis.eating_habits || '',
          physicalActivity: data.anamnesis.physical_activity || '',
          substanceUse: data.anamnesis.substance_use || '',
          familyContext: data.anamnesis.family_context || '',
          developmentalHistory: data.anamnesis.developmental_history || '',
          maritalRelationshipContext: data.anamnesis.marital_relationship_context || '',
          academicEducationalContext: data.anamnesis.academic_educational_context || '',
          professionalWorkContext: data.anamnesis.professional_work_context || '',
          socialContext: data.anamnesis.social_context || '',
          supportNetwork: data.anamnesis.support_network || '',
          protectiveFactors: data.anamnesis.protective_factors || '',
          vulnerabilityFactors: data.anamnesis.vulnerability_factors || '',
          significantLifeEvents: data.anamnesis.significant_life_events || '',
          previousTreatments: data.anamnesis.previous_treatments || '',
          treatmentGoals: data.anamnesis.treatment_goals || '',
          theoreticalApproach: data.anamnesis.theoretical_approach || '',
          clinicalObservations: data.anamnesis.clinical_observations || ''
        });
      } else {
        // Reset neutro
        setAnamnese({
          mainComplaint: '', demandHistory: '', psychPsychiatricHistory: '', medicalHistory: '',
          currentMedications: '', sleepPatterns: '', eatingHabits: '', physicalActivity: '', substanceUse: '',
          familyContext: '', developmentalHistory: '', maritalRelationshipContext: '', academicEducationalContext: '',
          professionalWorkContext: '', socialContext: '', supportNetwork: '', protectiveFactors: '',
          vulnerabilityFactors: '', significantLifeEvents: '', previousTreatments: '', treatmentGoals: '',
          theoreticalApproach: '', clinicalObservations: ''
        });
      }

      // EEM
      if (data.mentalState) {
        setMentalState({
          appearance: data.mentalState.appearance || '',
          attitudeBehavior: data.mentalState.attitude_behavior || '',
          consciousnessLevel: data.mentalState.consciousness_level || '',
          orientation: data.mentalState.orientation || '',
          attention: data.mentalState.attention || '',
          memory: data.mentalState.memory || '',
          languageSpeech: data.mentalState.language_speech || '',
          psychomotor: data.mentalState.psychomotor || '',
          mood: data.mentalState.mood || '',
          affect: data.mentalState.affect || '',
          thoughtProcess: data.mentalState.thought_process || '',
          sensoryPerception: data.mentalState.sensory_perception || '',
          cognitiveFunctions: data.mentalState.cognitive_functions || '',
          criticalJudgment: data.mentalState.critical_judgment || '',
          insight: data.mentalState.insight || '',
          impulseControl: data.mentalState.impulse_control || '',
          currentRisk: data.mentalState.current_risk || '',
          observations: data.mentalState.observations || ''
        });
      } else {
        setMentalState({
          appearance: '', attitudeBehavior: '', consciousnessLevel: '', orientation: '', attention: '',
          memory: '', languageSpeech: '', psychomotor: '', mood: '', affect: '', thoughtProcess: '',
          sensoryPerception: '', cognitiveFunctions: '', criticalJudgment: '', insight: '', impulseControl: '',
          currentRisk: '', observations: ''
        });
      }

      // Avaliação de Risco
      if (data.latestRisk) {
        setRiskAssessment({
          suicidalIdeation: data.latestRisk.suicidal_ideation || '',
          selfHarm: data.latestRisk.self_harm || '',
          planning: data.latestRisk.planning || '',
          intentLevel: data.latestRisk.intent_level || '',
          meansAccess: data.latestRisk.means_access || '',
          historyPreviousAttempts: data.latestRisk.history_previous_attempts || '',
          precipitatingFactors: data.latestRisk.precipitating_factors || '',
          protectiveFactors: data.latestRisk.protective_factors || '',
          supportNetworkActionable: data.latestRisk.support_network_actionable || '',
          conductAdopted: data.latestRisk.conduct_adopted || '',
          referralDestination: data.latestRisk.referral_destination || '',
          safetyPlan: data.latestRisk.safety_plan || '',
          reassessmentSchedule: data.latestRisk.reassessment_schedule || '',
          clinicianSummary: data.latestRisk.clinician_summary || ''
        });
      }

      // Sessões
      setSessionsList(data.sessions || []);
      const nextNum = (data.sessions?.length || 0) + 1;
      setCurrentSession(prev => ({
        ...prev,
        sessionNumber: nextNum,
        sessionDate: new Date().toISOString().split('T')[0]
      }));

      // Metas, Avaliações, Instrumentos, Triagens, Documentos
      setGoalsList(data.goals || []);
      setAssessmentsList(data.assessments || []);
      setInstrumentsList(data.instruments || []);
      setScreeningsList(data.screenings || []);
      setDocumentsList(data.documents || []);

      // Recuperação do Rascunho Persistido (Backend + LocalStorage)
      try {
        const draftRes: any = await ApiClient.get(`/v1/psychology/draft/${id}${initialAppointmentId ? `?appointment_id=${initialAppointmentId}` : ''}`);
        const localDraftRaw = localStorage.getItem(`zemda_psico_draft_${id}_${initialAppointmentId || 'none'}`);
        let localDraft: any = null;
        if (localDraftRaw) {
          try { localDraft = JSON.parse(localDraftRaw); } catch {}
        }

        const backendDraft = draftRes?.draft;
        let effectiveDraft: any = null;

        if (backendDraft && localDraft) {
          const backendTime = new Date(backendDraft.client_updated_at || backendDraft.updated_at).getTime();
          const localTime = new Date(localDraft.clientUpdatedAt).getTime();
          effectiveDraft = localTime > backendTime ? localDraft.draftData : backendDraft.draft_data;
        } else if (backendDraft) {
          effectiveDraft = backendDraft.draft_data;
        } else if (localDraft) {
          effectiveDraft = localDraft.draftData;
        }

        if (effectiveDraft) {
          if (effectiveDraft.currentSession) {
            setCurrentSession(prev => ({
              ...prev,
              ...effectiveDraft.currentSession,
              sessionNumber: prev.sessionNumber
            }));
          }
          if (effectiveDraft.anamnese) {
            setAnamnese(prev => ({ ...prev, ...effectiveDraft.anamnese }));
          }
          if (effectiveDraft.mentalState) {
            setMentalState(prev => ({ ...prev, ...effectiveDraft.mentalState }));
          }
          if (effectiveDraft.riskAssessment) {
            setRiskAssessment(prev => ({ ...prev, ...effectiveDraft.riskAssessment }));
          }
          if (effectiveDraft.activeTab) {
            setActiveTab(effectiveDraft.activeTab);
          }
          setAutosaveStatus('saved');
          const savedDate = backendDraft?.updated_at ? new Date(backendDraft.updated_at) : new Date();
          setLastSavedTime(savedDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
        }
      } catch (draftErr) {
        console.warn('[PsychologyWorkspace] Falha ao recuperar rascunho:', draftErr);
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao carregar prontuário.', 'error');
    } finally {
      setLoading(false);
      setTimeout(() => {
        initialLoadedRef.current = true;
      }, 600);
    }
  };

  useEffect(() => {
    if (selectedPatientId) {
      loadPatientProfile(selectedPatientId);
    }
  }, [selectedPatientId]);

  // Debounce do Autosave (1200ms após parar de digitar)
  useEffect(() => {
    if (!initialLoadedRef.current || !selectedPatientId) return;

    setIsDirty(true);
    setAutosaveStatus('saving');

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      performSaveDraft();
    }, 1200);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [
    currentSession,
    anamnese,
    mentalState,
    riskAssessment,
    activeTab,
    selectedPatientId,
    performSaveDraft
  ]);

  // Prevenção de perda de dados e monitoramento de conexão online
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty || autosaveStatus === 'saving') {
        e.preventDefault();
        e.returnValue = 'Existem alterações não salvas no atendimento psicológico. Deseja realmente sair?';
        return e.returnValue;
      }
    };

    const handleOnline = () => {
      if (autosaveStatus === 'offline' && isDirty) {
        performSaveDraft();
      }
    };

    const handleOffline = () => {
      setAutosaveStatus('offline');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isDirty, autosaveStatus, performSaveDraft]);

  // Handlers para Gravação das Abas
  const handleSaveAnamnese = async () => {
    if (!selectedPatientId) return;
    try {
      setSaving(true);
      await ApiClient.post('/v1/psychology/anamnesis', {
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId,
        ...anamnese
      });
      showToast('Anamnese psicológica salva com sucesso no prontuário!', 'success');
      loadPatientProfile(selectedPatientId);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar anamnese.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMentalState = async () => {
    if (!selectedPatientId) return;
    try {
      setSaving(true);
      await ApiClient.post('/v1/psychology/mental-state', {
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId,
        ...mentalState
      });
      showToast('Exame do Estado Mental (EEM) salvo com sucesso!', 'success');
      loadPatientProfile(selectedPatientId);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar EEM.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRiskAssessment = async () => {
    if (!selectedPatientId) return;
    try {
      setSaving(true);
      await ApiClient.post('/v1/psychology/risk-assessment', {
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId,
        ...riskAssessment
      });
      showToast('Avaliação de risco estruturada salva com sucesso!', 'success');
      loadPatientProfile(selectedPatientId);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar avaliação de risco.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId || !newAssessment.assessmentTitle || !newAssessment.purpose) {
      showToast('Título e finalidade da avaliação são obrigatórios.', 'error');
      return;
    }
    try {
      setSaving(true);
      const fundamentalSourcesJson = newAssessment.fundamentalSources
        ? newAssessment.fundamentalSources.split('\n').filter(s => s.trim().length > 0)
        : [];
      const complementarySourcesJson = newAssessment.complementarySources
        ? newAssessment.complementarySources.split('\n').filter(s => s.trim().length > 0)
        : [];

      await ApiClient.post('/v1/psychology/assessments', {
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId,
        assessmentTitle: newAssessment.assessmentTitle,
        purpose: newAssessment.purpose,
        demandDescription: newAssessment.demandDescription,
        fundamentalSourcesJson,
        complementarySourcesJson,
        clinicalIntegrationAnalysis: newAssessment.clinicalIntegrationAnalysis,
        conclusionSynthesis: newAssessment.conclusionSynthesis
      });

      showToast('Processo de Avaliação Psicológica registrado com sucesso!', 'success');
      setNewAssessment({
        assessmentTitle: '',
        purpose: '',
        demandDescription: '',
        fundamentalSources: '',
        complementarySources: '',
        clinicalIntegrationAnalysis: '',
        conclusionSynthesis: ''
      });
      loadPatientProfile(selectedPatientId);
    } catch (err: any) {
      showToast(err.message || 'Erro ao registrar avaliação.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateInstrument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId || !newInstrument.instrumentName) {
      showToast('Informe o nome do instrumento/teste.', 'error');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/psychology/instruments', {
        patientId: selectedPatientId,
        ...newInstrument
      });
      showToast('Instrumento psicológico registrado no prontuário!', 'success');
      setNewInstrument({
        instrumentName: '',
        version: '',
        publisher: '',
        purpose: '',
        modality: 'presencial',
        satepsiStatus: 'favoravel',
        professionalSynthesis: ''
      });
      loadPatientProfile(selectedPatientId);
    } catch (err: any) {
      showToast(err.message || 'Erro ao registrar instrumento.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateScreening = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId || !newScreening.screeningName) {
      showToast('Informe o nome do instrumento de triagem.', 'error');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/psychology/screenings', {
        patientId: selectedPatientId,
        ...newScreening
      });
      showToast('Instrumento de triagem/escala registrado com sucesso!', 'success');
      setNewScreening({
        screeningName: '',
        version: '',
        bibliographicReference: '',
        purpose: '',
        scoreRaw: '',
        classification: '',
        clinicalNotes: ''
      });
      loadPatientProfile(selectedPatientId);
    } catch (err: any) {
      showToast(err.message || 'Erro ao registrar triagem.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId || !newGoal.title) {
      showToast('Informe o objetivo da meta terapêutica.', 'error');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/psychology/goals', {
        patientId: selectedPatientId,
        ...newGoal
      });
      showToast('Meta terapêutica criada com sucesso!', 'success');
      setNewGoal({ title: '', indicator: '', targetPeriod: '', strategy: '', notes: '' });
      loadPatientProfile(selectedPatientId);
    } catch (err: any) {
      showToast(err.message || 'Erro ao criar meta.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // FLUXO OBRIGATÓRIO: CONCLUIR E SELAR ATENDIMENTO (Selamento Criptográfico SHA-256)
  const handleQuickFinishClick = async () => {
    if (!selectedPatientId) return;
    if (isDirty) {
      await performSaveDraft();
    }
    setShowFinishConfirmModal(true);
  };

  const confirmAndFinishConsultation = async () => {
    if (!selectedPatientId) return;

    if (!currentSession.clinicalEvolution || !currentSession.clinicalEvolution.trim()) {
      showToast('O relato da evolução clínica é indispensável para selar o atendimento (CFP 01/2009).', 'error');
      setShowFinishConfirmModal(false);
      setActiveTab('sessions');
      return;
    }

    try {
      setSaving(true);
      // Salva rascunho mais recente antes de finalizar
      await performSaveDraft();

      const res: any = await ApiClient.post('/v1/psychology/consultations/finish', {
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId,
        sessionNumber: currentSession.sessionNumber,
        sessionDate: currentSession.sessionDate,
        modality: currentSession.modality,
        tdicInfo: currentSession.modality === 'online' ? currentSession.tdicInfo : undefined,
        currentDemand: currentSession.currentDemand,
        relevantThemes: currentSession.relevantThemes,
        interventionsUsed: currentSession.interventionsUsed,
        patientResponse: currentSession.patientResponse,
        clinicalEvolution: currentSession.clinicalEvolution,
        conductPlan: currentSession.conductPlan,
        referrals: currentSession.referrals,
        nextSessionPlan: currentSession.nextSessionPlan,
        sessionRiskNotes: currentSession.sessionRiskNotes
      });

      setShowFinishConfirmModal(false);
      setIsDirty(false);
      setAutosaveStatus('saved');
      setCompletionSuccessData(res);
      showToast('Atendimento de Psicologia finalizado e selado com SHA-256!', 'success');
      loadPatientProfile(selectedPatientId);
    } catch (err: any) {
      showToast(err.message || 'Erro ao concluir atendimento.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleFinishConsultation = async (e: React.FormEvent) => {
    e.preventDefault();
    await confirmAndFinishConsultation();
  };

  // Assistente de IA com Guardrails do CFP
  const handleRunAiAssist = async () => {
    if (!aiInputText.trim()) {
      showToast('Digite ou cole as anotações brutas para estruturação.', 'error');
      return;
    }

    try {
      setLoadingAi(true);
      const res: any = await ApiClient.post('/v1/psychology/ai-assist', {
        patientId: selectedPatientId,
        mode: aiMode,
        text: aiInputText
      });

      setAiResultText(res.result || '');
      showToast('Rascunho estruturado com sucesso pela IA!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Falha ao processar com IA.', 'error');
    } finally {
      setLoadingAi(false);
    }
  };

  const handleApplyAiText = () => {
    if (!aiResultText) return;
    setCurrentSession(prev => ({
      ...prev,
      clinicalEvolution: (prev.clinicalEvolution ? prev.clinicalEvolution + '\n\n' : '') + aiResultText
    }));
    setShowAiDrawer(false);
    showToast('Texto inserido na Evolução Clínica da sessão.', 'info');
  };

  const hasAssessmentBasis = assessmentsList.length > 0 || !!mentalState.criticalJudgment;

  return (
    <div className="bg-slate-100 min-h-screen flex flex-col">
      {/* Top Bar / Header do Módulo ZemdaPsico */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 sm:px-6 py-3 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-700 to-slate-900 flex items-center justify-center text-white shadow-xs">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold text-slate-900 tracking-tight">ZEMDAPsico</h1>
                <span className="px-2 py-0.5 bg-teal-50 text-teal-800 text-[11px] font-bold rounded-md border border-teal-200">
                  CFP 2025
                </span>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[11px] font-medium rounded-md">
                  Prontuário Psicológico Confidencial
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Resoluções CFP nº 01/2009, 05/2010, 06/2019, 31/2022, 09/2024 e Código de Ética
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Indicador Discreto de Autosave */}
            {selectedPatientId && (
              <div data-tour="clinical-autosave" className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 shadow-2xs">
                {autosaveStatus === 'saving' && (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-amber-700 text-[11px] font-medium">Salvando...</span>
                  </>
                )}
                {autosaveStatus === 'saved' && (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-emerald-700 text-[11px] font-medium">
                      Salvo {lastSavedTime ? `às ${lastSavedTime}` : ''}
                    </span>
                  </>
                )}
                {autosaveStatus === 'offline' && (
                  <>
                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                    <span className="text-orange-700 text-[11px] font-medium">Aguardando conexão (cópia local salva)</span>
                  </>
                )}
                {autosaveStatus === 'error' && (
                  <>
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    <span className="text-rose-700 text-[11px] font-medium">Erro ao salvar na nuvem</span>
                  </>
                )}
                {autosaveStatus === 'idle' && (
                  <>
                    <span className="w-2 h-2 rounded-full bg-slate-300" />
                    <span className="text-slate-500 text-[11px]">Autosave ativo</span>
                  </>
                )}
              </div>
            )}

            {/* Botão Assistente IA Ético */}
            <button
              type="button"
              data-tour="psico-ai-btn"
              onClick={() => setShowAiDrawer(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-900 font-bold rounded-xl text-xs border border-purple-200 transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-purple-600" />
              Assistente IA (CFP)
            </button>

            {/* Botão Histórico Confidencial */}
            <button
              type="button"
              data-tour="clinical-previous-records"
              onClick={() => setShowHistoryModal(true)}
              disabled={!selectedPatientId}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <History className="w-4 h-4 text-slate-500" />
              Histórico ({sessionsList.length})
            </button>

            {/* Botão Documentos Emitidos */}
            <button
              type="button"
              onClick={() => setShowDocumentModal(true)}
              disabled={!selectedPatientId}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-900 font-bold rounded-xl text-xs border border-teal-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              <FileText className="w-4 h-4 text-teal-600" />
              Emitir Documento CFP
            </button>

            {/* Botão Rápido: Finalizar Atendimento */}
            <button
              type="button"
              data-tour="clinical-finish"
              onClick={handleQuickFinishClick}
              disabled={!selectedPatientId || saving}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              title="Finalizar atendimento, selar evolução com SHA-256 e emitir documentos"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-200" />
              Finalizar Atendimento
            </button>
          </div>
        </div>

        {/* Seleção do Paciente */}
        {!initialPatientId && (
          <div className="max-w-7xl mx-auto mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <User className="w-4 h-4 text-slate-400" />
              <select
                value={selectedPatientId}
                onChange={e => setSelectedPatientId(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Selecione o paciente...</option>
                {patients.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.name} {p.cpf ? `(${p.cpf})` : ''}
                  </option>
                ))}
              </select>
            </div>
            {selectedPatient && (
              <div className="text-xs text-slate-600 flex items-center gap-3">
                <span>Nascimento: <strong>{selectedPatient.birth_date ? new Date(selectedPatient.birth_date).toLocaleDateString('pt-BR') : 'Não informado'}</strong></span>
                <span>CPF: <strong>{selectedPatient.cpf || 'Não informado'}</strong></span>
                <span>Telefone: <strong>{selectedPatient.phone || 'Não informado'}</strong></span>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Barra de Navegação de Abas Estruturadas (Trilha Suave com Scroll Livre) */}
      <div className="bg-white border-b border-slate-200 shadow-2xs shrink-0">
        <div {...tabScrollProps} className={`${tabScrollProps.className} max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-2 py-2`}>
          {[
            { id: 'sessions', label: '1. Sessões & Evolução', icon: Clock },
            { id: 'anamnese', label: '2. Anamnese Psicológica', icon: User },
            { id: 'eem', label: '3. Exame do Estado Mental', icon: Brain },
            { id: 'risk', label: '4. Avaliação de Risco', icon: AlertTriangle },
            { id: 'assessments', label: '5. Avaliação & SATEPSI', icon: Award },
            { id: 'screenings', label: '6. Triagens & Escalas', icon: BookOpen },
            { id: 'goals', label: '7. Metas Terapêuticas', icon: Target },
            { id: 'external_tests', label: '8. Testes Externos & Laudos', icon: FileCheck }
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
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-teal-700 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conteúdo Principal */}
      <main className="max-w-7xl mx-auto w-full flex-1 p-4 sm:p-6 space-y-6">
        {loading ? (
          <div className="bg-white rounded-2xl p-12 text-center text-slate-500 text-xs border border-slate-200">
            Carregando prontuário psicológico com integridade e sigilo...
          </div>
        ) : (
          <>
            {/* ========================================================================= */}
            {/* ABA 1: SESSÕES & EVOLUÇÃO (Com Selamento SHA-256 e Conclusão de Atendimento) */}
            {/* ========================================================================= */}
            {activeTab === 'sessions' && (
              <div className="space-y-6">
                <form onSubmit={handleFinishConsultation} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                        <Clock className="w-4 h-4 text-teal-600" />
                        Registro de Atendimento e Evolução Clínica
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Resolução CFP nº 01/2009 e 09/2024 • Conclusão com selamento criptográfico imutável
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold">
                        <button
                          type="button"
                          onClick={() => setCurrentSession(p => ({ ...p, modality: 'presencial' }))}
                          className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                            currentSession.modality === 'presencial'
                              ? 'bg-white text-slate-900 shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Presencial
                        </button>
                        <button
                          type="button"
                          onClick={() => setCurrentSession(p => ({ ...p, modality: 'online' }))}
                          className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                            currentSession.modality === 'online'
                              ? 'bg-teal-700 text-white shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <Globe className="w-3.5 h-3.5" /> Online (TDIC)
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Sessão Online TDIC - CFP 09/2024 */}
                  {currentSession.modality === 'online' && (
                    <div className="bg-teal-50/70 border border-teal-200 rounded-2xl p-4 text-xs text-teal-950 space-y-3">
                      <div className="flex items-center gap-2 font-bold text-teal-900">
                        <ShieldCheck className="w-4 h-4 text-teal-600" />
                        Atendimento Psicológico Mediado por TDICs (Resolução CFP nº 09/2024)
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="font-bold block mb-1">Plataforma / Meio Utilizado</label>
                          <input
                            type="text"
                            value={currentSession.tdicInfo.platform}
                            onChange={e => setCurrentSession(p => ({
                              ...p,
                              tdicInfo: { ...p.tdicInfo, platform: e.target.value }
                            }))}
                            className="w-full px-3 py-1.5 bg-white border border-teal-300 rounded-lg text-xs"
                          />
                        </div>
                        <div>
                          <label className="font-bold block mb-1">Condições Técnicas e de Sigilo</label>
                          <input
                            type="text"
                            value={currentSession.tdicInfo.technicalConditions}
                            onChange={e => setCurrentSession(p => ({
                              ...p,
                              tdicInfo: { ...p.tdicInfo, technicalConditions: e.target.value }
                            }))}
                            className="w-full px-3 py-1.5 bg-white border border-teal-300 rounded-lg text-xs"
                          />
                        </div>
                        <div>
                          <label className="font-bold block mb-1">Contato de Emergência Informado</label>
                          <input
                            type="text"
                            value={currentSession.tdicInfo.emergencyContact}
                            placeholder="Nome e telefone de terceiro em caso de crise"
                            onChange={e => setCurrentSession(p => ({
                              ...p,
                              tdicInfo: { ...p.tdicInfo, emergencyContact: e.target.value }
                            }))}
                            className="w-full px-3 py-1.5 bg-white border border-teal-300 rounded-lg text-xs"
                          />
                        </div>
                      </div>
                      <p className="text-[11px] text-teal-800">
                        Aviso ético: É vedada a gravação de sessões sem consentimento formal prévio do paciente e garantia de armazenamento sigiloso (Art. 6º, CFP 09/2024).
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Número da Sessão</label>
                      <input
                        type="number"
                        min={1}
                        value={currentSession.sessionNumber}
                        onChange={e => setCurrentSession(p => ({ ...p, sessionNumber: parseInt(e.target.value) || 1 }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Data do Atendimento</label>
                      <input
                        type="date"
                        value={currentSession.sessionDate}
                        onChange={e => setCurrentSession(p => ({ ...p, sessionDate: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Demanda Atual / Foco da Sessão</label>
                      <input
                        type="text"
                        value={currentSession.currentDemand}
                        placeholder="Ex: Manejo de ansiedade antecipatória e transição de cargo..."
                        onChange={e => setCurrentSession(p => ({ ...p, currentDemand: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-4 text-xs">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-extrabold text-slate-800">
                          Relato da Evolução Clínica e Intervenções Utilizadas <span className="text-rose-500">*</span>
                        </label>
                        <span className="text-[11px] text-slate-500">Obrigatório para conclusão e selamento</span>
                      </div>
                      <textarea
                        value={currentSession.clinicalEvolution}
                        onChange={e => setCurrentSession(p => ({ ...p, clinicalEvolution: e.target.value }))}
                        placeholder="Descreva a escuta psicológica, intervenções técnicas realizadas, resposta do paciente e observações clínicas relevantes..."
                        rows={7}
                        required
                        className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs leading-relaxed focus:ring-2 focus:ring-teal-500 font-sans"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Conduta e Encaminhamentos</label>
                        <textarea
                          value={currentSession.conductPlan}
                          onChange={e => setCurrentSession(p => ({ ...p, conductPlan: e.target.value }))}
                          placeholder="Ex: Manutenção da frequência semanal, encaminhamento para avaliação médica..."
                          rows={3}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Planejamento para a Próxima Sessão</label>
                        <textarea
                          value={currentSession.nextSessionPlan}
                          onChange={e => setCurrentSession(p => ({ ...p, nextSessionPlan: e.target.value }))}
                          placeholder="Ex: Retomar monitoramento de humor e explorar dinâmica relacional..."
                          rows={3}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Lock className="w-4 h-4 text-teal-600" />
                      <span>Ao concluir, a evolução será selada com SHA-256 e protegida contra alterações.</span>
                    </div>

                    <button
                      type="submit"
                      disabled={saving || !currentSession.clinicalEvolution.trim()}
                      className="px-6 py-3 bg-gradient-to-r from-teal-700 to-slate-900 hover:from-teal-800 hover:to-black text-white font-extrabold rounded-xl text-xs shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {saving ? 'Concluindo e Selando...' : 'Concluir Atendimento'}
                    </button>
                  </div>
                </form>

                {/* Lista de Sessões Anteriores Seladas */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <History className="w-4 h-4 text-slate-600" />
                    Evoluções Anteriores do Paciente ({sessionsList.length})
                  </h4>

                  {sessionsList.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      Nenhuma sessão anterior selada.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {sessionsList.slice(0, 3).map((s: any) => (
                        <div key={s.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                          <div className="flex justify-between items-center font-bold text-slate-800">
                            <span>Sessão #{s.session_number} • {new Date(s.session_date).toLocaleDateString('pt-BR')}</span>
                            <span className="text-[11px] text-teal-800 font-mono">Selada</span>
                          </div>
                          <p className="text-slate-700 line-clamp-2">{s.clinical_evolution}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* ABA 2: ANAMNESE PSICOLÓGICA (Estruturada e Neutra) */}
            {/* ========================================================================= */}
            {activeTab === 'anamnese' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                      <User className="w-4 h-4 text-teal-600" />
                      Anamnese Psicológica Compreensiva
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Campos opcionais com neutralidade teórica e preenchimento livre (Resolução CFP nº 01/2009)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveAnamnese}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-xl text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Salvando...' : 'Salvar Anamnese'}
                  </button>
                </div>

                <div className="space-y-5 text-xs">
                  {/* Demanda & Abordagem */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Queixa Principal / Motivo da Consulta</label>
                      <textarea
                        value={anamnese.mainComplaint}
                        onChange={e => setAnamnese(p => ({ ...p, mainComplaint: e.target.value }))}
                        placeholder="Descreva a demanda expressa pelo paciente em suas próprias palavras..."
                        rows={3}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Abordagem Teórico-Metodológica</label>
                      <input
                        type="text"
                        value={anamnese.theoreticalApproach}
                        onChange={e => setAnamnese(p => ({ ...p, theoreticalApproach: e.target.value }))}
                        placeholder="Ex: Psicanálise, Fenomenologia-Existencial, TCC, Histórico-Cultural..."
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs mb-2"
                      />
                      <label className="font-bold text-slate-700 block mb-1">Histórico da Demanda / Início dos Sintomas</label>
                      <input
                        type="text"
                        value={anamnese.demandHistory}
                        onChange={e => setAnamnese(p => ({ ...p, demandHistory: e.target.value }))}
                        placeholder="Tempo de evolução, eventos desencadeantes..."
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  {/* Saúde Física e Psiquiátrica */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Histórico Médico Geral</label>
                      <textarea
                        value={anamnese.medicalHistory}
                        onChange={e => setAnamnese(p => ({ ...p, medicalHistory: e.target.value }))}
                        placeholder="Doenças crônicas, cirurgias, exames recentes..."
                        rows={2}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Histórico Psiquiátrico e Psicológico Prévio</label>
                      <textarea
                        value={anamnese.psychPsychiatricHistory}
                        onChange={e => setAnamnese(p => ({ ...p, psychPsychiatricHistory: e.target.value }))}
                        placeholder="Tratamentos anteriores, internações, psicoterapia prévia..."
                        rows={2}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Medicações em Uso Atual</label>
                      <textarea
                        value={anamnese.currentMedications}
                        onChange={e => setAnamnese(p => ({ ...p, currentMedications: e.target.value }))}
                        placeholder="Psicofármacos, dosagens e acompanhamento médico..."
                        rows={2}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  {/* Hábitos e Rotina */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Padrões de Sono</label>
                      <input
                        type="text"
                        value={anamnese.sleepPatterns}
                        onChange={e => setAnamnese(p => ({ ...p, sleepPatterns: e.target.value }))}
                        placeholder="Ex: Insônia inicial, sono reparador..."
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Hábitos Alimentares</label>
                      <input
                        type="text"
                        value={anamnese.eatingHabits}
                        onChange={e => setAnamnese(p => ({ ...p, eatingHabits: e.target.value }))}
                        placeholder="Ex: Apetite regular, oscilações..."
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Atividade Física</label>
                      <input
                        type="text"
                        value={anamnese.physicalActivity}
                        onChange={e => setAnamnese(p => ({ ...p, physicalActivity: e.target.value }))}
                        placeholder="Ex: Caminhada 3x semana..."
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Uso de Substâncias</label>
                      <input
                        type="text"
                        value={anamnese.substanceUse}
                        onChange={e => setAnamnese(p => ({ ...p, substanceUse: e.target.value }))}
                        placeholder="Álcool, tabaco, substâncias..."
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  {/* Contextos de Vida */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Contexto Familiar e Desenvolvimento</label>
                      <textarea
                        value={anamnese.familyContext}
                        onChange={e => setAnamnese(p => ({ ...p, familyContext: e.target.value }))}
                        placeholder="Composição familiar, vínculos significativos, infância..."
                        rows={3}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Contexto Ocupacional e Acadêmico</label>
                      <textarea
                        value={anamnese.professionalWorkContext}
                        onChange={e => setAnamnese(p => ({ ...p, professionalWorkContext: e.target.value }))}
                        placeholder="Profissão, satisfação laboral, estressores no trabalho..."
                        rows={3}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Contexto Social e Rede de Apoio</label>
                      <textarea
                        value={anamnese.supportNetwork}
                        onChange={e => setAnamnese(p => ({ ...p, supportNetwork: e.target.value }))}
                        placeholder="Amizades, comunidade, fatores protetivos acionáveis..."
                        rows={3}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  {/* Fatores Protetivos e Vulnerabilidade */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Fatores Protetivos do Paciente</label>
                      <textarea
                        value={anamnese.protectiveFactors}
                        onChange={e => setAnamnese(p => ({ ...p, protectiveFactors: e.target.value }))}
                        placeholder="Recursos psicológicos, hobbies, capacidade reflexiva, espiritualidade..."
                        rows={2}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Fatores de Vulnerabilidade e Risco</label>
                      <textarea
                        value={anamnese.vulnerabilityFactors}
                        onChange={e => setAnamnese(p => ({ ...p, vulnerabilityFactors: e.target.value }))}
                        placeholder="Isolamento, histórico de perdas, estressores crônicos..."
                        rows={2}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* ABA 3: EXAME DO ESTADO MENTAL (EEM) (Semiologia Neutra) */}
            {/* ========================================================================= */}
            {activeTab === 'eem' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                      <Brain className="w-4 h-4 text-teal-600" />
                      Exame do Estado Mental (EEM)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Semiologia psicológica com preenchimento neutro (sem valores pré-marcados como 'normal')
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveMentalState}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-xl text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Salvando...' : 'Salvar EEM'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Aparência e Higiene</label>
                    <input
                      type="text"
                      value={mentalState.appearance}
                      placeholder="Ex: Cuidado pessoal preservado, postura..."
                      onChange={e => setMentalState(p => ({ ...p, appearance: e.target.value }))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Atitude e Comportamento</label>
                    <input
                      type="text"
                      value={mentalState.attitudeBehavior}
                      placeholder="Ex: Colaborativa, esquiva, desconfiada..."
                      onChange={e => setMentalState(p => ({ ...p, attitudeBehavior: e.target.value }))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Nível de Consciência</label>
                    <input
                      type="text"
                      value={mentalState.consciousnessLevel}
                      placeholder="Ex: Vigil, sonolenta, obnubilada..."
                      onChange={e => setMentalState(p => ({ ...p, consciousnessLevel: e.target.value }))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Orientação (Tempo, Espaço e Si)</label>
                    <input
                      type="text"
                      value={mentalState.orientation}
                      placeholder="Ex: Orientada auto e alopsiquicamente..."
                      onChange={e => setMentalState(p => ({ ...p, orientation: e.target.value }))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Atenção e Concentração</label>
                    <input
                      type="text"
                      value={mentalState.attention}
                      placeholder="Ex: Normoprosexia, hipoprosexia, dispersão..."
                      onChange={e => setMentalState(p => ({ ...p, attention: e.target.value }))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Memória (Imediata, Recente e Remota)</label>
                    <input
                      type="text"
                      value={mentalState.memory}
                      placeholder="Ex: Preservada, amnésia lacunar..."
                      onChange={e => setMentalState(p => ({ ...p, memory: e.target.value }))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Linguagem e Fala</label>
                    <input
                      type="text"
                      value={mentalState.languageSpeech}
                      placeholder="Ex: Fluente, taquilálica, lentificada..."
                      onChange={e => setMentalState(p => ({ ...p, languageSpeech: e.target.value }))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Psicomotricidade</label>
                    <input
                      type="text"
                      value={mentalState.psychomotor}
                      placeholder="Ex: Agitação, lentificação, inquietação..."
                      onChange={e => setMentalState(p => ({ ...p, psychomotor: e.target.value }))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Humor</label>
                    <input
                      type="text"
                      value={mentalState.mood}
                      placeholder="Ex: Eutímico, disfórico, hipotímico, ansioso..."
                      onChange={e => setMentalState(p => ({ ...p, mood: e.target.value }))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Afeto (Modulação e Congruência)</label>
                    <input
                      type="text"
                      value={mentalState.affect}
                      placeholder="Ex: Congruente, lábil, embotado, restrito..."
                      onChange={e => setMentalState(p => ({ ...p, affect: e.target.value }))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Processo e Conteúdo do Pensamento</label>
                    <input
                      type="text"
                      value={mentalState.thoughtProcess}
                      placeholder="Ex: Curso lógico, ideação sobrevalorizada..."
                      onChange={e => setMentalState(p => ({ ...p, thoughtProcess: e.target.value }))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Sensopercepção</label>
                    <input
                      type="text"
                      value={mentalState.sensoryPerception}
                      placeholder="Ex: Sem alterações alucinatórias ou ilusórias..."
                      onChange={e => setMentalState(p => ({ ...p, sensoryPerception: e.target.value }))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Juízo Crítico da Realidade</label>
                    <input
                      type="text"
                      value={mentalState.criticalJudgment}
                      placeholder="Ex: Preservado, prejudicado..."
                      onChange={e => setMentalState(p => ({ ...p, criticalJudgment: e.target.value }))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Insight / Consciência da Situação</label>
                    <input
                      type="text"
                      value={mentalState.insight}
                      placeholder="Ex: Bom reconhecimento do sofrimento psíquico..."
                      onChange={e => setMentalState(p => ({ ...p, insight: e.target.value }))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Controle de Impulsos</label>
                    <input
                      type="text"
                      value={mentalState.impulseControl}
                      placeholder="Ex: Preservado, impulsividade episódica..."
                      onChange={e => setMentalState(p => ({ ...p, impulseControl: e.target.value }))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* ABA 4: AVALIAÇÃO DE RISCO ESTRUTURADA (Sem Auto-Diagnóstico) */}
            {/* ========================================================================= */}
            {activeTab === 'risk' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      Avaliação Estruturada de Risco (CFP)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Mapeamento clínico sem escores preditivos automatizados ou diagnósticos robotizados
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveRiskAssessment}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-xl text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Salvando...' : 'Salvar Avaliação de Risco'}
                  </button>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Ideação Suicida</label>
                      <input
                        type="text"
                        value={riskAssessment.suicidalIdeation}
                        placeholder="Ausente, passiva, ativa, frequência..."
                        onChange={e => setRiskAssessment(p => ({ ...p, suicidalIdeation: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Comportamento Autolesivo</label>
                      <input
                        type="text"
                        value={riskAssessment.selfHarm}
                        placeholder="Histórico, frequência, métodos..."
                        onChange={e => setRiskAssessment(p => ({ ...p, selfHarm: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Planejamento e Meios de Acesso</label>
                      <input
                        type="text"
                        value={riskAssessment.meansAccess}
                        placeholder="Acesso a medicações, armas, letalidade..."
                        onChange={e => setRiskAssessment(p => ({ ...p, meansAccess: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Fatores Precipitantes e Estressores Imediatos</label>
                      <textarea
                        value={riskAssessment.precipitatingFactors}
                        onChange={e => setRiskAssessment(p => ({ ...p, precipitatingFactors: e.target.value }))}
                        placeholder="Rupturas relacionais, lutos, perdas financeiras, conflitos..."
                        rows={3}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Fatores Protetivos e Rede de Apoio Acionável</label>
                      <textarea
                        value={riskAssessment.protectiveFactors}
                        onChange={e => setRiskAssessment(p => ({ ...p, protectiveFactors: e.target.value }))}
                        placeholder="Familiares contatáveis, suporte institucional, planos de futuro..."
                        rows={3}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Plano de Segurança Acordado com o Paciente</label>
                      <textarea
                        value={riskAssessment.safetyPlan}
                        onChange={e => setRiskAssessment(p => ({ ...p, safetyPlan: e.target.value }))}
                        placeholder="Estratégias pactuadas em crise, números de emergência (CVV 188, CAPS, SAMU 192)..."
                        rows={3}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Conduta Adotada e Encaminhamentos</label>
                      <textarea
                        value={riskAssessment.conductAdopted}
                        onChange={e => setRiskAssessment(p => ({ ...p, conductAdopted: e.target.value }))}
                        placeholder="Acionamento de familiar de referência com ciência do paciente, encaminhamento psiquiátrico..."
                        rows={3}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Síntese Clínica do Profissional Responsável</label>
                    <textarea
                      value={riskAssessment.clinicianSummary}
                      onChange={e => setRiskAssessment(p => ({ ...p, clinicianSummary: e.target.value }))}
                      placeholder="Conclusão técnica fundamentada do psicólogo para registro em prontuário..."
                      rows={3}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* ABA 5: AVALIAÇÃO PSICOLÓGICA & INSTRUMENTOS SATEPSI (CFP 31/2022) */}
            {/* ========================================================================= */}
            {activeTab === 'assessments' && (
              <div className="space-y-6">
                {/* Banner Oficial SATEPSI */}
                <div className="bg-slate-900 border border-teal-900/80 rounded-2xl p-5 text-white shadow-md flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1.5 max-w-2xl">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-teal-400" />
                      <h3 className="font-extrabold text-sm text-white">Sistema de Avaliação de Testes Psicológicos (SATEPSI)</h3>
                    </div>
                    <p className="text-xs text-teal-100/90 leading-relaxed">
                      Conforme a Resolução CFP nº 31/2022, o psicólogo deve utilizar exclusivamente testes psicológicos com parecer FAVORÁVEL do CFP. É expressamente vedada a reprodução integral ou de itens/estímulos de instrumentos privativos.
                    </p>
                  </div>
                  <a
                    href="https://satepsi.cfp.org.br"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-400 hover:bg-teal-300 text-slate-950 font-black rounded-xl text-xs transition-colors shadow-md cursor-pointer"
                  >
                    <ExternalLink className="w-4 h-4 text-slate-950" /> Consultar SATEPSI Oficial
                  </a>
                </div>

                {/* Formulário: Registrar Processo de Avaliação Formal */}
                <form onSubmit={handleCreateAssessment} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
                    <Award className="w-4 h-4 text-teal-600" />
                    Registrar Processo de Avaliação Psicológica Formal (Base para emissão de Laudo)
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Título da Avaliação <span className="text-rose-500">*</span></label>
                      <input
                        type="text"
                        value={newAssessment.assessmentTitle}
                        placeholder="Ex: Avaliação Psicológica do Funcionamento Afetivo e Cognitivo..."
                        onChange={e => setNewAssessment(p => ({ ...p, assessmentTitle: e.target.value }))}
                        required
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Finalidade Estrita <span className="text-rose-500">*</span></label>
                      <input
                        type="text"
                        value={newAssessment.purpose}
                        placeholder="Ex: Esclarecimento diagnóstico funcional para acompanhamento clínico..."
                        onChange={e => setNewAssessment(p => ({ ...p, purpose: e.target.value }))}
                        required
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Fontes Fundamentais Utilizadas (um por linha)</label>
                      <textarea
                        value={newAssessment.fundamentalSources}
                        placeholder="Entrevistas clínicas semiestruturadas&#10;Bateria Fatorial de Personalidade (BFP)&#10;Observação clínica direta"
                        onChange={e => setNewAssessment(p => ({ ...p, fundamentalSources: e.target.value }))}
                        rows={3}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Fontes Complementares Utilizadas (um por linha)</label>
                      <textarea
                        value={newAssessment.complementarySources}
                        placeholder="Relatório pedagógico institucional&#10;Exames neurológicos complementares"
                        onChange={e => setNewAssessment(p => ({ ...p, complementarySources: e.target.value }))}
                        rows={3}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Análise de Integração Clínica</label>
                      <textarea
                        value={newAssessment.clinicalIntegrationAnalysis}
                        placeholder="Articulação fundamentada entre as fontes fundamentais e complementares..."
                        rows={3}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Síntese Conclusiva / Encaminhamentos</label>
                      <textarea
                        value={newAssessment.conclusionSynthesis}
                        placeholder="Conclusão objetiva do processo avaliativo..."
                        rows={2}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-xs"
                    >
                      {saving ? 'Registrando...' : 'Registrar Avaliação'}
                    </button>
                  </div>
                </form>

                {/* Formulário: Registrar Aplicação de Instrumento Privativo */}
                <form onSubmit={handleCreateInstrument} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
                    <FileCheck className="w-4 h-4 text-teal-600" />
                    Registro de Instrumento Psicológico Aplicado (Resolução CFP 31/2022)
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
                    <div className="sm:col-span-2">
                      <label className="font-bold text-slate-700 block mb-1">Nome do Teste / Instrumento <span className="text-rose-500">*</span></label>
                      <input
                        type="text"
                        value={newInstrument.instrumentName}
                        placeholder="Ex: Bateria Fatorial de Personalidade (BFP)"
                        onChange={e => setNewInstrument(p => ({ ...p, instrumentName: e.target.value }))}
                        required
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Editora / Versão</label>
                      <input
                        type="text"
                        value={newInstrument.publisher}
                        placeholder="Ex: Casa do Psicólogo / 2ª Ed."
                        onChange={e => setNewInstrument(p => ({ ...p, publisher: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Status no SATEPSI</label>
                      <select
                        value={newInstrument.satepsiStatus}
                        onChange={e => setNewInstrument(p => ({ ...p, satepsiStatus: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      >
                        <option value="favoravel">Favorável (Aprovado)</option>
                        <option value="desfavoravel">Desfavorável (Uso Vedado)</option>
                        <option value="pendente">Pendente de verificação</option>
                      </select>
                    </div>
                  </div>

                  <div className="text-xs">
                    <label className="font-bold text-slate-700 block mb-1">Síntese Profissional dos Resultados (Sem cópia de protocolos protegidos)</label>
                    <textarea
                      value={newInstrument.professionalSynthesis}
                      placeholder="Descreva a interpretação técnica e qualitativa obtida, em consonância com a tabela normativa..."
                      rows={3}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      {saving ? 'Registrando...' : 'Registrar Instrumento'}
                    </button>
                  </div>
                </form>

                {/* Lista de Instrumentos Registrados */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-3">
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-slate-500">
                    Instrumentos Registrados no Prontuário ({instrumentsList.length})
                  </h4>
                  {instrumentsList.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-xs">
                      Nenhum instrumento psicológico registrado para este paciente.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {instrumentsList.map((inst: any) => (
                        <div key={inst.id} className="py-3 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-900">{inst.instrument_name}</span>
                            <span className="text-slate-500 ml-2">({inst.publisher || 'Editora'}) • {new Date(inst.application_date).toLocaleDateString('pt-BR')}</span>
                            {inst.professional_synthesis && (
                              <p className="text-slate-600 mt-1 line-clamp-1">{inst.professional_synthesis}</p>
                            )}
                          </div>
                          <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                            inst.satepsi_status === 'favoravel'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-50 text-rose-800 border border-rose-200'
                          }`}>
                            SATEPSI: {inst.satepsi_status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* ABA 6: TRIAGENS & ESCALAS (Separadas de Testes Privativos) */}
            {/* ========================================================================= */}
            {activeTab === 'screenings' && (
              <div className="space-y-6">
                <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-amber-900 text-xs flex items-start gap-3">
                  <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold">Distinção Metodológica Obrigatória (CFP 31/2022):</strong>
                    <p className="mt-0.5">
                      Escalas e inventários de rastreio/triagem são ferramentas de triagem clínica complementar e <strong>não constituem nem substituem testes psicológicos privativos</strong>. Seus resultados devem ser compreendidos contextualmente.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleCreateScreening} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
                    <BookOpen className="w-4 h-4 text-teal-600" />
                    Registrar Instrumento de Triagem / Escala Complementar
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Nome da Escala / Triagem <span className="text-rose-500">*</span></label>
                      <input
                        type="text"
                        value={newScreening.screeningName}
                        placeholder="Ex: Escala de Ansiedade de Hamilton, PHQ-9, GAD-7..."
                        onChange={e => setNewScreening(p => ({ ...p, screeningName: e.target.value }))}
                        required
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Referência Bibliográfica / Versão</label>
                      <input
                        type="text"
                        value={newScreening.bibliographicReference}
                        placeholder="Ex: Kroenke et al., 2001 (Versão validada BR)"
                        onChange={e => setNewScreening(p => ({ ...p, bibliographicReference: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Escore Bruto e Classificação</label>
                      <input
                        type="text"
                        value={newScreening.scoreRaw}
                        placeholder="Ex: Escore 12/27 (Sintomas leves)"
                        onChange={e => setNewScreening(p => ({ ...p, scoreRaw: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <div className="text-xs">
                    <label className="font-bold text-slate-700 block mb-1">Notas Clínicas e Interpretação</label>
                    <textarea
                      value={newScreening.clinicalNotes}
                      onChange={e => setNewScreening(p => ({ ...p, clinicalNotes: e.target.value }))}
                      placeholder="Descreva a contextualização clínica do achado na história do paciente..."
                      rows={3}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-xs"
                    >
                      {saving ? 'Registrando...' : 'Registrar Triagem'}
                    </button>
                  </div>
                </form>

                {/* Lista de Triagens */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-3">
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-slate-500">
                    Triagens Realizadas ({screeningsList.length})
                  </h4>
                  {screeningsList.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-xs">
                      Nenhuma triagem registrada para este paciente.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {screeningsList.map((sc: any) => (
                        <div key={sc.id} className="py-3 text-xs space-y-1">
                          <div className="flex justify-between items-center font-bold text-slate-800">
                            <span>{sc.screening_name}</span>
                            <span className="text-teal-800">{sc.score_raw || 'Escore não informado'}</span>
                          </div>
                          {sc.bibliographic_reference && (
                            <div className="text-[11px] text-slate-500">Ref: {sc.bibliographic_reference}</div>
                          )}
                          {sc.clinical_notes && (
                            <p className="text-slate-700 bg-slate-50 p-2 rounded-lg">{sc.clinical_notes}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* ABA 7: METAS TERAPÊUTICAS */}
            {/* ========================================================================= */}
            {activeTab === 'goals' && (
              <div className="space-y-6">
                <form onSubmit={handleCreateGoal} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
                    <Target className="w-4 h-4 text-teal-600" />
                    Adicionar Meta / Objetivo Terapêutico (Plano de Trabalho)
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div className="sm:col-span-2">
                      <label className="font-bold text-slate-700 block mb-1">Descrição do Objetivo Terapêutico <span className="text-rose-500">*</span></label>
                      <input
                        type="text"
                        value={newGoal.title}
                        placeholder="Ex: Desenvolvimento de repertório para tolerância ao mal-estar afetivo..."
                        onChange={e => setNewGoal(p => ({ ...p, title: e.target.value }))}
                        required
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Período Previsto / Revisão</label>
                      <input
                        type="text"
                        value={newGoal.targetPeriod}
                        placeholder="Ex: 8 a 12 sessões"
                        onChange={e => setNewGoal(p => ({ ...p, targetPeriod: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Indicador Qualitativo / Evidência de Progresso</label>
                      <input
                        type="text"
                        value={newGoal.indicator}
                        placeholder="Ex: Redução de ruminações autorrelatadas em diário de bordo..."
                        onChange={e => setNewGoal(p => ({ ...p, indicator: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Estratégias / Intervenções Planejadas</label>
                      <input
                        type="text"
                        value={newGoal.strategy}
                        placeholder="Ex: Psicoeducação, registros emocionais, experimentos comportamentais..."
                        onChange={e => setNewGoal(p => ({ ...p, strategy: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-xs"
                    >
                      {saving ? 'Adicionando...' : 'Adicionar Meta'}
                    </button>
                  </div>
                </form>

                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-3">
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-slate-500">
                    Metas em Acompanhamento ({goalsList.length})
                  </h4>
                  {goalsList.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-xs">
                      Nenhuma meta terapêutica cadastrada.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {goalsList.map((g: any) => (
                        <div key={g.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-center justify-between">
                          <div>
                            <span className="font-bold text-slate-900">{g.title}</span>
                            {g.indicator && <p className="text-slate-500 text-[11px] mt-0.5">Indicador: {g.indicator}</p>}
                          </div>
                          <span className="px-2.5 py-1 bg-teal-50 text-teal-800 font-bold rounded-lg border border-teal-200 text-[11px]">
                            {g.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selectedPatientId && (
                  <div className="pt-2">
                    <MeasurableGoalsManager
                      patientId={selectedPatientId}
                      domain="psychology"
                      title="Metas Clínicas & Acompanhamento de Progresso — ZemdaPsico"
                    />
                  </div>
                )}
              </div>
            )}

            {/* ========================================================================= */}
            {/* ABA 8: TESTES EXTERNOS, LAUDOS E ANEXOS */}
            {/* ========================================================================= */}
            {activeTab === 'external_tests' && (
              <div className="space-y-6">
                {selectedPatientId ? (
                  <ExternalTestsManager
                    patientId={selectedPatientId}
                    appointmentId={initialAppointmentId}
                    moduleType="ZemdaPsico"
                    accentColor="teal"
                    title="Testes Externos, Protocolos & Laudos Anexados (ZemdaPsico)"
                    subtitle="Anexe testes escaneados, laudos neuropsicológicos, protocolos e relatórios de suporte."
                  />
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 text-xs">
                    Selecione um paciente para gerenciar testes externos e laudos.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* ========================================================================= */}
      {/* MODAL DE CONFIRMAÇÃO DE FINALIZAÇÃO RÁPIDA (ZemdaPsico) */}
      {/* ========================================================================= */}
      {showFinishConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Finalizar Atendimento Psicológico?</h3>
                <p className="text-xs text-slate-500">
                  Esta ação salvará e selará a evolução com assinatura digital e hash SHA-256.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-2">
              <div className="flex justify-between text-slate-700">
                <span>Paciente:</span>
                <strong>{selectedPatient?.full_name || selectedPatient?.name || 'Paciente'}</strong>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>Modalidade:</span>
                <strong>{currentSession.modality === 'online' ? 'Online (TDIC)' : 'Presencial'}</strong>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>Evolução clínica:</span>
                <span className={currentSession.clinicalEvolution && currentSession.clinicalEvolution.trim() ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>
                  {currentSession.clinicalEvolution && currentSession.clinicalEvolution.trim() ? 'Preenchida' : 'Pendente (Obrigatória)'}
                </span>
              </div>
            </div>

            {(!currentSession.clinicalEvolution || !currentSession.clinicalEvolution.trim()) && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>O relato da evolução clínica é indispensável para concluir o atendimento (CFP 01/2009). Preencha-o na aba de Sessões.</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowFinishConfirmModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Voltar e Revisar
              </button>
              <button
                type="button"
                disabled={saving || !currentSession.clinicalEvolution || !currentSession.clinicalEvolution.trim()}
                onClick={confirmAndFinishConsultation}
                className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-xs flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Concluindo e Selando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Confirmar e Concluir
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL OBRIGATÓRIO DE CONCLUSÃO DE ATENDIMENTO (CFP 06/2019) */}
      {/* ========================================================================= */}
      {completionSuccessData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 text-center space-y-4">
            <div className="w-14 h-14 bg-teal-100 text-teal-800 rounded-full flex items-center justify-center mx-auto shadow-xs">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-extrabold text-slate-900">Atendimento Finalizado com Sucesso</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                A evolução clínica foi salva, assinada digitalmente por <strong>{completionSuccessData.signerName}</strong> ({completionSuccessData.signerRegistration}) e selada com hash criptográfico SHA-256.
              </p>
            </div>

            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-[11px] font-mono text-slate-600 break-all">
              Hash: {completionSuccessData.signatureHash}
            </div>

            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setCompletionSuccessData(null);
                  setShowDocumentModal(true);
                }}
                className="w-full py-2.5 bg-teal-700 hover:bg-teal-800 text-white font-extrabold rounded-xl text-xs transition-colors cursor-pointer shadow-xs flex items-center justify-center gap-2"
              >
                <FileText className="w-4 h-4" /> Emitir Documento Psicológico (CFP 06/2019)
              </button>
              <button
                type="button"
                onClick={() => {
                  setCompletionSuccessData(null);
                  if (onFinishConsultation) onFinishConsultation();
                }}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Finalizar sem Documento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE DOCUMENTOS PSICOLÓGICOS */}
      <PsychologyDocumentModal
        isOpen={showDocumentModal}
        onClose={() => setShowDocumentModal(false)}
        patientId={selectedPatientId}
        appointmentId={initialAppointmentId}
        patientName={selectedPatient?.full_name || selectedPatient?.name || 'Paciente'}
        hasAssessmentBasis={hasAssessmentBasis}
        onDocumentIssued={() => {
          loadPatientProfile(selectedPatientId);
        }}
      />

      {/* MODAL DE HISTÓRICO LONGITUDINAL */}
      <PsychologyHistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        patientId={selectedPatientId}
        patientName={selectedPatient?.full_name || selectedPatient?.name || 'Paciente'}
      />

      {/* DRAWER DO ASSISTENTE DE IA ÉTICO */}
      {showAiDrawer && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-2xs flex justify-end" role="dialog" aria-modal="true">
          <div className="bg-white w-full max-w-md h-full shadow-2xl p-6 flex flex-col space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-purple-900 font-extrabold text-sm">
                <Sparkles className="w-4 h-4 text-purple-600" />
                Assistente de IA Ético (CFP)
              </div>
              <button
                onClick={() => setShowAiDrawer(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-purple-950 text-xs leading-relaxed space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-purple-900">
                <Shield className="w-3.5 h-3.5" /> Diretrizes Éticas do CFP sobre IA:
              </div>
              <p className="text-[11px] text-purple-900">
                A IA atua exclusivamente no suporte à formatação e estruturação textual. <strong>É vedado à IA diagnosticar, inferir risco ou tomar decisões clínicas autônomas.</strong> Todo texto gerado possui badge de rascunho e exige validação e responsabilidade ética do psicólogo.
              </p>
            </div>

            <div className="space-y-3 text-xs flex-1">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Modo de Assistência</label>
                <select
                  value={aiMode}
                  onChange={e => setAiMode(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                >
                  <option value="structure_topics">Estruturar em Tópicos Clínicos</option>
                  <option value="clarity">Revisão Gramatical e Clareza Textual</option>
                  <option value="synthesis">Síntese Neutra dos Pontos Abordados</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Anotações Brutas da Sessão</label>
                <textarea
                  value={aiInputText}
                  onChange={e => setAiInputText(e.target.value)}
                  placeholder="Cole aqui anotações rápidas feitas durante o atendimento para formatação..."
                  rows={4}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <button
                type="button"
                onClick={handleRunAiAssist}
                disabled={loadingAi || !aiInputText.trim()}
                className="w-full py-2 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              >
                {loadingAi ? 'Processando estruturação...' : 'Estruturar Rascunho com IA'}
              </button>

              {aiResultText && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <label className="font-bold text-slate-800 block">Rascunho Gerado pela IA:</label>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs whitespace-pre-wrap max-h-48 overflow-y-auto font-mono text-[11px] text-slate-800">
                    {aiResultText}
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyAiText}
                    className="w-full py-2 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-xs"
                  >
                    Inserir na Evolução Clínica da Sessão
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
