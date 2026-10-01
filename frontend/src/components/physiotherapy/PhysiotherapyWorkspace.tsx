import { useClinicalFormReset } from '../../hooks/useClinicalFormReset';
import { PostureGait } from '../clinical/PostureGait';
import React, { useState, useEffect, lazy, Suspense } from 'react';
import {
  Activity,
  User,
  Search,
  FileText,
  CheckCircle2,
  Calendar,
  Clock,
  Plus,
  Trash2,
  ShieldCheck,
  AlertCircle,
  Save,
  Printer,
  ChevronRight,
  Target,
  Dumbbell,
  Sliders,
  ChevronDown,
  ChevronUp,
  Award,
  Sparkles,
  Camera,
  GitCompare,
  Eye,
  ArrowRight
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useConsultationCompletion } from '../clinical/useConsultationCompletion';
import { BodyPainMapCanvas } from './BodyPainMapCanvas';
import { PatientPreviousRecordsModal } from '../clinical/PatientPreviousRecordsModal';
import { ExternalTestsManager } from '../common/ExternalTestsManager';
import { MeasurableGoalsManager } from '../common/MeasurableGoalsManager';
import { PatientFollowUpDocumentModal } from '../clinical/PatientFollowUpDocumentModal';
import { useClinicalAutosave } from '../../hooks/useClinicalAutosave';
import { useHorizontalTabScroll } from '../../hooks/useHorizontalTabScroll';
import { ClinicalQuickHeaderActions, ClinicalQuickToolItem } from '../clinical/ClinicalQuickHeaderActions';
import { ClinicalDraftRecoveryModal } from '../clinical/ClinicalDraftRecoveryModal';
import { PatientSearchSelect } from '../common/PatientSearchSelect';
import { ProfessionalModuleHeader } from '../common/ProfessionalModuleHeader';
import { ZemdaBodyCanvas } from '../zemda-body/ZemdaBodyCanvas';
import { getRegionLabel } from '../zemda-body/bodyRegionsData';
import { RegionalPhysioAssessmentModal } from './RegionalPhysioAssessmentModal';
import { RegionalLongitudinalComparisonModal } from './RegionalLongitudinalComparisonModal';
import { RegionalEvaluationsListModal } from './RegionalEvaluationsListModal';
import {
  RegionalSummaryItem,
  PhysioRegionalEvaluation,
  detectSideFromRegionId,
  formatLaterality,
  normalizeRegionalSummary
} from './regionalData';
import { dateLabel } from '../personal/posture';

const PersonalAssessmentModal = lazy(() =>
  import('../personal/PersonalAssessmentModal').then(m => ({ default: m.PersonalAssessmentModal }))
);
const PersonalAssessmentComparisonModal = lazy(() =>
  import('../personal/PersonalAssessmentComparisonModal').then(m => ({ default: m.PersonalAssessmentComparisonModal }))
);

interface PhysiotherapyWorkspaceProps {
  initialPatientId?: string;
  initialAppointmentId?: string;
  onFinishConsultation?: () => void;
}

export interface GoniometryRow {
  joint: string;
  movement: string;
  normalRange: string;
  right: string;
  left: string;
  notes?: string;
}

export interface FunctionalTestItem {
  id: string;
  name: string;
  region: string;
  targetStructure: string;
  result: 'negative' | 'positive' | 'doubtful' | 'not_tested';
  notes?: string;
}

export interface HomeExerciseItem {
  name: string;
  series: string;
  repetitions: string;
  frequency: string;
  instructions: string;
}

const DEFAULT_GONIOMETRY: GoniometryRow[] = [
  { joint: 'Ombro', movement: 'Flexão', normalRange: '0 - 180°', right: '', left: '' },
  { joint: 'Ombro', movement: 'Extensão', normalRange: '0 - 45°', right: '', left: '' },
  { joint: 'Ombro', movement: 'Abdução', normalRange: '0 - 180°', right: '', left: '' },
  { joint: 'Ombro', movement: 'Rotação Externa', normalRange: '0 - 90°', right: '', left: '' },
  { joint: 'Ombro', movement: 'Rotação Interna', normalRange: '0 - 90°', right: '', left: '' },
  { joint: 'Cotovelo', movement: 'Flexão', normalRange: '0 - 145°', right: '', left: '' },
  { joint: 'Cotovelo', movement: 'Extensão', normalRange: '0°', right: '', left: '' },
  { joint: 'Punho', movement: 'Flexão', normalRange: '0 - 80°', right: '', left: '' },
  { joint: 'Punho', movement: 'Extensão', normalRange: '0 - 70°', right: '', left: '' },
  { joint: 'Quadril', movement: 'Flexão', normalRange: '0 - 120°', right: '', left: '' },
  { joint: 'Quadril', movement: 'Extensão', normalRange: '0 - 30°', right: '', left: '' },
  { joint: 'Quadril', movement: 'Abdução', normalRange: '0 - 45°', right: '', left: '' },
  { joint: 'Joelho', movement: 'Flexão', normalRange: '0 - 135°', right: '', left: '' },
  { joint: 'Joelho', movement: 'Extensão', normalRange: '0°', right: '', left: '' },
  { joint: 'Tornozelo', movement: 'Dorsiflexão', normalRange: '0 - 20°', right: '', left: '' },
  { joint: 'Tornozelo', movement: 'Flexão Plantar', normalRange: '0 - 45°', right: '', left: '' }
];

const DEFAULT_FUNCTIONAL_TESTS: FunctionalTestItem[] = [
  { id: 'neer', name: 'Teste de Neer', region: 'Ombro', targetStructure: 'Impacto subacromial', result: 'not_tested' },
  { id: 'hawkins', name: 'Teste de Hawkins-Kennedy', region: 'Ombro', targetStructure: 'Impacto subacromial', result: 'not_tested' },
  { id: 'jobe', name: 'Teste de Jobe (Empty Can)', region: 'Ombro', targetStructure: 'Músculo supraespinhal', result: 'not_tested' },
  { id: 'speed', name: 'Teste de Speed', region: 'Ombro', targetStructure: 'Tendão bicipital', result: 'not_tested' },
  { id: 'phalen', name: 'Teste de Phalen', region: 'Punho/Mão', targetStructure: 'Túnel do Carpo / Nervo mediano', result: 'not_tested' },
  { id: 'tinel_punho', name: 'Sinal de Tinel (Punho)', region: 'Punho/Mão', targetStructure: 'Nervo mediano', result: 'not_tested' },
  { id: 'lachman', name: 'Teste de Lachman', region: 'Joelho', targetStructure: 'Ligamento Cruzado Anterior (LCA)', result: 'not_tested' },
  { id: 'gaveta_ant', name: 'Gaveta Anterior', region: 'Joelho', targetStructure: 'Ligamento Cruzado Anterior (LCA)', result: 'not_tested' },
  { id: 'gaveta_post', name: 'Gaveta Posterior', region: 'Joelho', targetStructure: 'Ligamento Cruzado Posterior (LCP)', result: 'not_tested' },
  { id: 'mcmurray', name: 'Teste de McMurray', region: 'Joelho', targetStructure: 'Meniscos medial e lateral', result: 'not_tested' },
  { id: 'lasegue', name: 'Teste de Lasègue (SLR)', region: 'Coluna Lombar', targetStructure: 'Raiz nervosa ciática', result: 'not_tested' },
  { id: 'thomas', name: 'Teste de Thomas', region: 'Quadril', targetStructure: 'Encurtamento do Ilipsoas', result: 'not_tested' },
  { id: 'gaveta_tornozelo', name: 'Gaveta Anterior do Tornozelo', region: 'Tornozelo', targetStructure: 'Ligamento Talofibular Anterior', result: 'not_tested' }
];

export const PhysiotherapyWorkspace: React.FC<PhysiotherapyWorkspaceProps> = ({
  initialPatientId,
  initialAppointmentId,
  onFinishConsultation
}) => {
  const { showToast } = useToast();
  const completion = useConsultationCompletion(onFinishConsultation);

  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId || '');
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [showPreviousRecordsModal, setShowPreviousRecordsModal] = useState<boolean>(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState<boolean>(false);

  // 14 Abas Ordenadas
  const [activeTab, setActiveTab] = useState<
    | 'evolution'
    | 'anamnesis'
    | 'kinetic_functional'
    | 'pain_zemdabody'
    | 'adm_goniometry'
    | 'muscle_strength'
    | 'posture_gait'
    | 'functional_tests'
    | 'cbdf'
    | 'treatment_plan'
    | 'goals'
    | 'external_tests'
    | 'home_exercises'
    | 'finish'
  >('evolution');

  // Hook para usabilidade e rolagem suave das abas de Fisioterapia
  const { tabScrollProps } = useHorizontalTabScroll(activeTab);

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // 1. Evolução Clínica
  const [consultationTitle, setConsultationTitle] = useState<string>('Atendimento Fisioterapêutico');
  const [clinicalEvolution, setClinicalEvolution] = useState<string>('');
  const [conducts, setConducts] = useState<string>('');
  const [treatmentResponse, setTreatmentResponse] = useState<string>('');

  // 2. Anamnese
  const [chiefComplaint, setChiefComplaint] = useState<string>('');
  const [hpi, setHpi] = useState<string>('');
  const [pastMedicalHistory, setPastMedicalHistory] = useState<string>('');
  const [medicalDiagnosis, setMedicalDiagnosis] = useState<string>('');
  const [medicationsInUse, setMedicationsInUse] = useState<string>('');

  // 3. Cinético-Funcional
  const [physioDiagnosis, setPhysioDiagnosis] = useState<string>('');
  const [inspectionPalpation, setInspectionPalpation] = useState<string>('');
  const [functionalLimitations, setFunctionalLimitations] = useState<string>('');

  // 4. Dor & Zemda360 (Avaliações Regionais Integradas)
  const [painScore, setPainScore] = useState<number | ''>('');
  const [painLocation, setPainLocation] = useState<string>('');
  const [painCharacteristics, setPainCharacteristics] = useState<string>('');
  const [painBehavior, setPainBehavior] = useState<string>('');
  const [bodyMapJson, setBodyMapJson] = useState<string>('');
  const [bodyMapImage, setBodyMapImage] = useState<string>('');
  const [regionalSummary, setRegionalSummary] = useState<RegionalSummaryItem[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [showRegionalAssessmentModal, setShowRegionalAssessmentModal] = useState<boolean>(false);
  const [showComparisonModal, setShowComparisonModal] = useState<boolean>(false);
  const [showRegionalListModal, setShowRegionalListModal] = useState<boolean>(false);
  const [editingRegionalEval, setEditingRegionalEval] = useState<PhysioRegionalEvaluation | null>(null);
  const [bodyCanvasViewMode, setBodyCanvasViewMode] = useState<'all' | 'front' | 'back'>('all');
  const [bodyModel, setBodyModel] = useState<'male' | 'female'>('male');

  // 5. ADM / Goniometria Estruturada
  const [goniometryList, setGoniometryList] = useState<GoniometryRow[]>(DEFAULT_GONIOMETRY);

  // 6. Força Muscular (Oxford 0-5)
  const [muscleStrengthList, setMuscleStrengthList] = useState<{
    group: string;
    rightGrade: number | '';
    leftGrade: number | '';
  }[]>([
    { group: 'Flexores de Quadril (Psoas)', rightGrade: '', leftGrade: '' },
    { group: 'Extensores de Joelho (Quadríceps)', rightGrade: '', leftGrade: '' },
    { group: 'Flexores de Joelho (Isquiotibiais)', rightGrade: '', leftGrade: '' },
    { group: 'Dorsiflexores (Tibial Anterior)', rightGrade: '', leftGrade: '' },
    { group: 'Flexores Plantares (Tríceps Sural)', rightGrade: '', leftGrade: '' },
    { group: 'Abdutores de Ombro (Deltoide)', rightGrade: '', leftGrade: '' },
    { group: 'Flexores de Cotovelo (Bíceps)', rightGrade: '', leftGrade: '' },
    { group: 'Extensores de Cotovelo (Tríceps)', rightGrade: '', leftGrade: '' }
  ]);

  // 7. Postura & Marcha (Avaliação Postural Compartilhada + Marcha)
  const [posturalAssessments, setPosturalAssessments] = useState<any[]>([]);
  const [loadingPosturalAssessments, setLoadingPosturalAssessments] = useState<boolean>(false);
  const [isPostureModalOpen, setIsPostureModalOpen] = useState<boolean>(false);
  const [isPostureComparisonOpen, setIsPostureComparisonOpen] = useState<boolean>(false);
  const [editingPostureAssessment, setEditingPostureAssessment] = useState<any | null>(null);
  const [postureAnterior, setPostureAnterior] = useState<string>('');
  const [postureLateral, setPostureLateral] = useState<string>('');
  const [posturePosterior, setPosturePosterior] = useState<string>('');
  const [gaitAnalysis, setGaitAnalysis] = useState<string>('');

  // 8. Testes Funcionais Estruturados
  const [functionalTests, setFunctionalTests] = useState<FunctionalTestItem[]>(DEFAULT_FUNCTIONAL_TESTS);

  // 9. CBDF (COFFITO 610/2025)
  const [cbdfBodyFunction, setCbdfBodyFunction] = useState<string>('');
  const [cbdfBodyStructure, setCbdfBodyStructure] = useState<string>('');
  const [cbdfActivityParticipation, setCbdfActivityParticipation] = useState<string>('');
  const [cbdfContextualFactors, setCbdfContextualFactors] = useState<string>('');
  const [cbdfDiagnosticSummary, setCbdfDiagnosticSummary] = useState<string>('');

  // 10. Plano Terapêutico (RBPF 618/2025)
  const [treatmentResources, setTreatmentResources] = useState<string>('');
  const [sessionFrequency, setSessionFrequency] = useState<string>('');
  const [estimatedSessions, setEstimatedSessions] = useState<number | ''>('');
  const [reassessmentDate, setReassessmentDate] = useState<string>('');

  // 13. Exercícios Domiciliares
  const [homeExercises, setHomeExercises] = useState<HomeExerciseItem[]>([]);

  const isCurrentClinicalContext = useClinicalFormReset(selectedPatientId + ':' + (initialAppointmentId || ''), [
    [clinicalEvolution, setClinicalEvolution],
    [conducts, setConducts],
    [treatmentResponse, setTreatmentResponse],
    [chiefComplaint, setChiefComplaint],
    [hpi, setHpi],
    [pastMedicalHistory, setPastMedicalHistory],
    [medicalDiagnosis, setMedicalDiagnosis],
    [medicationsInUse, setMedicationsInUse],
    [physioDiagnosis, setPhysioDiagnosis],
    [inspectionPalpation, setInspectionPalpation],
    [functionalLimitations, setFunctionalLimitations],
    [painScore, setPainScore],
    [painLocation, setPainLocation],
    [painCharacteristics, setPainCharacteristics],
    [painBehavior, setPainBehavior],
    [bodyMapJson, setBodyMapJson],
    [bodyMapImage, setBodyMapImage],
    [goniometryList, setGoniometryList],
    [muscleStrengthList, setMuscleStrengthList],
    [postureAnterior, setPostureAnterior],
    [postureLateral, setPostureLateral],
    [posturePosterior, setPosturePosterior],
    [gaitAnalysis, setGaitAnalysis],
    [functionalTests, setFunctionalTests],
    [cbdfBodyFunction, setCbdfBodyFunction],
    [cbdfBodyStructure, setCbdfBodyStructure],
    [cbdfActivityParticipation, setCbdfActivityParticipation],
    [cbdfContextualFactors, setCbdfContextualFactors],
    [cbdfDiagnosticSummary, setCbdfDiagnosticSummary],
    [treatmentResources, setTreatmentResources],
    [sessionFrequency, setSessionFrequency],
    [estimatedSessions, setEstimatedSessions],
    [reassessmentDate, setReassessmentDate],
    [homeExercises, setHomeExercises],
  ]);


  // Payload do Autosave Universal Clínico (ZemdaFisio)
  const autosavePayload = React.useMemo(() => ({
    consultationTitle,
    clinicalEvolution,
    conducts,
    treatmentResponse,
    chiefComplaint,
    hpi,
    pastMedicalHistory,
    medicalDiagnosis,
    medicationsInUse,
    physioDiagnosis,
    inspectionPalpation,
    functionalLimitations,
    painScore,
    painLocation,
    painCharacteristics,
    painBehavior,
    bodyMapJson,
    goniometryList,
    muscleStrengthList,
    postureAnterior,
    postureLateral,
    posturePosterior,
    gaitAnalysis,
    functionalTests,
    cbdfBodyFunction,
    cbdfBodyStructure,
    cbdfActivityParticipation,
    cbdfContextualFactors,
    cbdfDiagnosticSummary,
    treatmentResources,
    sessionFrequency,
    estimatedSessions,
    reassessmentDate,
    homeExercises
  }), [
    consultationTitle,
    clinicalEvolution,
    conducts,
    treatmentResponse,
    chiefComplaint,
    hpi,
    pastMedicalHistory,
    medicalDiagnosis,
    medicationsInUse,
    physioDiagnosis,
    inspectionPalpation,
    functionalLimitations,
    painScore,
    painLocation,
    painCharacteristics,
    painBehavior,
    bodyMapJson,
    goniometryList,
    muscleStrengthList,
    postureAnterior,
    postureLateral,
    posturePosterior,
    gaitAnalysis,
    functionalTests,
    cbdfBodyFunction,
    cbdfBodyStructure,
    cbdfActivityParticipation,
    cbdfContextualFactors,
    cbdfDiagnosticSummary,
    treatmentResources,
    sessionFrequency,
    estimatedSessions,
    reassessmentDate,
    homeExercises
  ]);

  const handleRestoreDraft = (data: any) => {
    if (!data) return;
    if (data.consultationTitle !== undefined) setConsultationTitle(data.consultationTitle);
    if (data.clinicalEvolution !== undefined) setClinicalEvolution(data.clinicalEvolution);
    if (data.conducts !== undefined) setConducts(data.conducts);
    if (data.treatmentResponse !== undefined) setTreatmentResponse(data.treatmentResponse);
    if (data.chiefComplaint !== undefined) setChiefComplaint(data.chiefComplaint);
    if (data.hpi !== undefined) setHpi(data.hpi);
    if (data.pastMedicalHistory !== undefined) setPastMedicalHistory(data.pastMedicalHistory);
    if (data.medicalDiagnosis !== undefined) setMedicalDiagnosis(data.medicalDiagnosis);
    if (data.medicationsInUse !== undefined) setMedicationsInUse(data.medicationsInUse);
    if (data.physioDiagnosis !== undefined) setPhysioDiagnosis(data.physioDiagnosis);
    if (data.inspectionPalpation !== undefined) setInspectionPalpation(data.inspectionPalpation);
    if (data.functionalLimitations !== undefined) setFunctionalLimitations(data.functionalLimitations);
    if (data.painScore !== undefined) setPainScore(data.painScore);
    if (data.painLocation !== undefined) setPainLocation(data.painLocation);
    if (data.painCharacteristics !== undefined) setPainCharacteristics(data.painCharacteristics);
    if (data.painBehavior !== undefined) setPainBehavior(data.painBehavior);
    if (data.bodyMapJson !== undefined) setBodyMapJson(data.bodyMapJson);
    if (Array.isArray(data.goniometryList)) setGoniometryList(data.goniometryList);
    if (Array.isArray(data.muscleStrengthList)) setMuscleStrengthList(data.muscleStrengthList);
    if (data.postureAnterior !== undefined) setPostureAnterior(data.postureAnterior);
    if (data.postureLateral !== undefined) setPostureLateral(data.postureLateral);
    if (data.posturePosterior !== undefined) setPosturePosterior(data.posturePosterior);
    if (data.gaitAnalysis !== undefined) setGaitAnalysis(data.gaitAnalysis);
    if (Array.isArray(data.functionalTests)) setFunctionalTests(data.functionalTests);
    if (data.cbdfBodyFunction !== undefined) setCbdfBodyFunction(data.cbdfBodyFunction);
    if (data.cbdfBodyStructure !== undefined) setCbdfBodyStructure(data.cbdfBodyStructure);
    if (data.cbdfActivityParticipation !== undefined) setCbdfActivityParticipation(data.cbdfActivityParticipation);
    if (data.cbdfContextualFactors !== undefined) setCbdfContextualFactors(data.cbdfContextualFactors);
    if (data.cbdfDiagnosticSummary !== undefined) setCbdfDiagnosticSummary(data.cbdfDiagnosticSummary);
    if (data.treatmentResources !== undefined) setTreatmentResources(data.treatmentResources);
    if (data.sessionFrequency !== undefined) setSessionFrequency(data.sessionFrequency);
    if (data.estimatedSessions !== undefined) setEstimatedSessions(data.estimatedSessions);
    if (data.reassessmentDate !== undefined) setReassessmentDate(data.reassessmentDate);
    if (Array.isArray(data.homeExercises)) setHomeExercises(data.homeExercises);
  };

  const autosave = useClinicalAutosave({
    moduleType: 'ZemdaFisio',
    patientId: selectedPatientId,
    appointmentId: initialAppointmentId,
    payload: autosavePayload,
    onRestoreDraft: handleRestoreDraft
  });

  // Seleciona paciente e carrega dados
  useEffect(() => {
    if (!selectedPatientId) {
      setSelectedPatient(null);
      return;
    }
    ApiClient.get<any>(`/v1/patients/${selectedPatientId}`).then(p => {
      if (!isCurrentClinicalContext()) return;
      const patData = p?.patient || p;
      setSelectedPatient(patData);
      loadPatientData(selectedPatientId);
    }).catch(err => {
      console.warn('Erro ao carregar paciente fisioterapêutico:', err);
      loadPatientData(selectedPatientId);
    });
  }, [selectedPatientId]);

  const loadPatientData = async (patId: string) => {
    try {
      setLoading(true);
      const [assessRes, evolRes] = await Promise.allSettled([
        ApiClient.get<any[]>(`/v1/physiotherapy/assessments/patient/${patId}`),
        ApiClient.get<any[]>(`/v1/physiotherapy/evolutions/patient/${patId}`)
      ]);
      if (!isCurrentClinicalContext()) return;

      if (assessRes.status === 'fulfilled' && Array.isArray(assessRes.value) && assessRes.value.length > 0) {
        const latest = assessRes.value[0];
        if (latest.chief_complaint) setChiefComplaint(latest.chief_complaint);
        if (latest.hpi) setHpi(latest.hpi);
        if (latest.past_medical_history) setPastMedicalHistory(latest.past_medical_history);
        if (latest.medical_diagnosis) setMedicalDiagnosis(latest.medical_diagnosis);
        if (latest.physio_diagnosis) setPhysioDiagnosis(latest.physio_diagnosis);
        if (latest.pain_score !== undefined) setPainScore(latest.pain_score);
        if (latest.pain_location) setPainLocation(latest.pain_location);
        if (latest.pain_characteristics) setPainCharacteristics(latest.pain_characteristics);
        if (latest.body_map_json) setBodyMapJson(latest.body_map_json);
        if (latest.body_map_image) setBodyMapImage(latest.body_map_image);
      }
      await Promise.allSettled([
        loadRegionalSummary(patId),
        loadPosturalAssessments(patId)
      ]);
    } catch (err) {
      console.warn('Erro ao carregar dados fisioterapêuticos do paciente:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPosturalAssessments = async (patId: string) => {
    if (!patId) {
      setPosturalAssessments([]);
      return;
    }
    try {
      setLoadingPosturalAssessments(true);
      const res = await ApiClient.get<{ assessments: any[] }>(`/v1/personal/students/${patId}/assessments`);
      if (!isCurrentClinicalContext()) return;
      setPosturalAssessments(Array.isArray(res?.assessments) ? res.assessments : []);
    } catch (err) {
      console.warn('[PhysiotherapyWorkspace] Erro ao carregar avaliações posturais:', err);
      setPosturalAssessments([]);
    } finally {
      setLoadingPosturalAssessments(false);
    }
  };

  const handleOpenPostureAssessment = async (assessmentId: string) => {
    try {
      const data = await ApiClient.get<any>(`/v1/personal/assessments/${assessmentId}`);
      setEditingPostureAssessment({ ...data.assessment, photos: data.photos });
      setIsPostureModalOpen(true);
    } catch (err) {
      showToast('Não foi possível carregar a avaliação postural.', 'error');
    }
  };

  const loadRegionalSummary = async (patId: string) => {
    try {
      const res = await ApiClient.get<any>(`/v1/physiotherapy/regional-evaluations/summary/${patId}`);
      if (!isCurrentClinicalContext()) return;
      setRegionalSummary(normalizeRegionalSummary(res));
    } catch (err) {
      console.warn('Erro ao carregar sumário regional:', err);
      setRegionalSummary([]);
    }
  };

  // 14. Finalização Canônica do Atendimento Fisioterapêutico
  const handleFinishConsultation = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente para finalizar o atendimento', 'info');
      return;
    }
    if (!clinicalEvolution.trim()) {
      showToast('Por favor, preencha a evolução clínica do atendimento antes de finalizar', 'error');
      setActiveTab('evolution');
      return;
    }

    try {
      setSaving(true);
      await completion.save('/v1/physiotherapy/consultations/finish', {
        patientId: selectedPatientId,
        patientName: selectedPatient?.full_name,
        appointmentId: initialAppointmentId || null,
        moduleType: 'ZemdaFisio',
        title: consultationTitle,
        clinicalEvolution,
        conducts,
        assessmentData: {
          chiefComplaint,
          hpi,
          pastMedicalHistory,
          medicalDiagnosis,
          physioDiagnosis,
          painScore,
          painLocation,
          painCharacteristics,
          bodyMapJson,
          bodyMapImage
        },
        goniometryData: goniometryList,
        muscleStrengthData: muscleStrengthList,
        postureData: { postureAnterior, postureLateral, posturePosterior, gaitAnalysis },
        testsData: functionalTests,
        cbdfData: {
          cbdfBodyFunction,
          cbdfBodyStructure,
          cbdfActivityParticipation,
          cbdfContextualFactors,
          cbdfDiagnosticSummary
        },
        treatmentPlanData: {
          treatmentResources,
          sessionFrequency,
          estimatedSessions,
          reassessmentDate
        },
        homeExercisesData: homeExercises
      });
      await autosave.clearDraft();
      showToast('Atendimento de fisioterapia finalizado com sucesso no prontuário!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao finalizar atendimento de fisioterapia', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Converte exercícios domiciliares em texto para o documento do paciente
  const homeExercisesText = React.useMemo(() => {
    return homeExercises.map((ex, idx) => {
      return `${idx + 1}. ${ex.name}\n   Dose: ${ex.series} de ${ex.repetitions} (${ex.frequency})\n   Instruções: ${ex.instructions}`;
    }).join('\n\n');
  }, [homeExercises]);

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800">
      {completion.dialog}

      {/* CABEÇALHO DO MÓDULO ZEMDAFISIO */}
      <ProfessionalModuleHeader
        icon={Activity}
        iconGradient="from-teal-500 to-indigo-600"
        iconShadow="shadow-teal-500/20"
        title="ZemdaFisio"
        badgeLabel="Fisioterapia Especializada"
        badgeVariant="bg-teal-100 text-teal-800 border-teal-200"
        description="Evolução, ADM/Goniometria, Escala Oxford, CBDF COFFITO 610/2025 e RBPF 618/2025."
      >
        <PatientSearchSelect
          compact
          value={selectedPatientId}
          selectedPatient={selectedPatient}
          disabled={!!initialAppointmentId}
          onChange={(id, pat) => {
            setSelectedPatientId(id);
            if (pat) setSelectedPatient(pat);
            else if (!id) setSelectedPatient(null);
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
                id: 'postural_assessment',
                label: 'Avaliação Postural',
                icon: Camera,
                onClick: () => {
                  setEditingPostureAssessment(null);
                  setIsPostureModalOpen(true);
                }
              },
              {
                id: 'exercise_guide',
                label: 'Guia de Exercícios',
                icon: Printer,
                onClick: () => setShowFollowUpModal(true)
              }
            ]}
            toolsVariant="teal"
            toolsLabel="Ferramentas"
          />
        )}
      </ProfessionalModuleHeader>

      {/* 14 ABAS DE NAVEGAÇÃO ESTRUTURADAS (Trilha Limpa com Rolagem Livre) */}
      <div className="bg-white border-b border-slate-200 px-6 shrink-0">
        <div {...tabScrollProps} className={`${tabScrollProps.className} flex items-center gap-1 py-1`}>
          {[
            { id: 'evolution', label: '1. Evolução', icon: Activity },
            { id: 'anamnesis', label: '2. Anamnese', icon: FileText },
            { id: 'kinetic_functional', label: '3. Cinético-Funcional', icon: Sliders },
            { id: 'pain_zemdabody', label: '4. Dor & Zemda360', icon: AlertCircle },
            { id: 'adm_goniometry', label: '5. ADM / Goniometria', icon: Activity },
            { id: 'muscle_strength', label: '6. Força Oxford', icon: Dumbbell },
            { id: 'posture_gait', label: '7. Postura & Marcha', icon: User },
            { id: 'functional_tests', label: '8. Testes Funcionais', icon: Award },
            { id: 'cbdf', label: '9. CBDF COFFITO', icon: ShieldCheck },
            { id: 'treatment_plan', label: '10. Plano RBPF', icon: Calendar },
            { id: 'goals', label: '11. Metas', icon: Target },
            { id: 'external_tests', label: '12. Testes Externos', icon: FileText },
            { id: 'home_exercises', label: '13. Exercícios em Casa', icon: Dumbbell },
            { id: 'finish', label: '14. Finalização', icon: CheckCircle2 }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                data-tour={`tab-${tab.id}`}
                data-active={isActive}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                  isActive
                    ? 'border-teal-600 text-teal-700 bg-teal-50/50'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-teal-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* CONTEÚDO PRINCIPAL */}
      <div className="flex-1 p-6 overflow-y-auto">
        {!selectedPatientId ? (
          <div className="flex flex-col items-center justify-center h-64 text-center bg-white rounded-2xl border border-slate-200 p-8">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mb-3">
              <Activity className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Selecione um Paciente</h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              Escolha um paciente no menu superior para iniciar a avaliação cinético-funcional, goniometria e plano terapêutico.
            </p>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-6">

            {/* ABA 1: EVOLUÇÃO CLÍNICA */}
            {activeTab === 'evolution' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-teal-600" />
                      Evolução Clínica da Sessão
                    </h3>
                    <p className="text-xs text-slate-500">
                      Registro longitudinal do atendimento, estado do paciente e procedimentos executados.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('finish')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Ir para Finalização
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Título da Sessão</label>
                    <input
                      type="text"
                      value={consultationTitle}
                      onChange={e => setConsultationTitle(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Resposta Terapêutica Imediata</label>
                    <input
                      type="text"
                      value={treatmentResponse}
                      onChange={e => setTreatmentResponse(e.target.value)}
                      placeholder="Ex: Alívio de 2 pontos na EVA, ganho de 10° em flexão..."
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Evolução Fisioterapêutica da Sessão *
                  </label>
                  <textarea
                    rows={6}
                    value={clinicalEvolution}
                    onChange={e => setClinicalEvolution(e.target.value)}
                    placeholder="Descreva detalhadamente o estado atual do paciente, intervenções aplicadas (cinesioterapia, mobilização articular, eletroterapia), resposta durante os exercícios e raciocínio clínico..."
                    className="w-full p-3 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Conduta & Prescrições para Próximas Sessões
                  </label>
                  <textarea
                    rows={3}
                    value={conducts}
                    onChange={e => setConducts(e.target.value)}
                    placeholder="Progressão de carga, novos exercícios domiciliares, agendamento de reavaliação..."
                    className="w-full p-3 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* ABA 2: ANAMNESE */}
            {activeTab === 'anamnesis' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b pb-3">
                  <FileText className="w-4 h-4 text-teal-600" /> Anamnese Fisioterapêutica
                </h3>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Queixa Principal (QP)</label>
                  <textarea
                    rows={2}
                    value={chiefComplaint}
                    onChange={e => setChiefComplaint(e.target.value)}
                    placeholder="Relato da queixa nas palavras do paciente..."
                    className="w-full p-3 text-xs rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">História da Moléstia Atual (HMA)</label>
                  <textarea
                    rows={3}
                    value={hpi}
                    onChange={e => setHpi(e.target.value)}
                    placeholder="Início dos sintomas, trauma prévio, mecanismo de lesão, fatores de melhora e piora..."
                    className="w-full p-3 text-xs rounded-xl border border-slate-200"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Antecedentes Pessoais e Cirúrgicos</label>
                    <textarea
                      rows={2}
                      value={pastMedicalHistory}
                      onChange={e => setPastMedicalHistory(e.target.value)}
                      placeholder="Cirurgias prévias, fraturas, comorbidades (HAS, DM)..."
                      className="w-full p-3 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Diagnóstico Clínico / Médico</label>
                    <textarea
                      rows={2}
                      value={medicalDiagnosis}
                      onChange={e => setMedicalDiagnosis(e.target.value)}
                      placeholder="Ex: Tendinopatia do supraespinhal (M75.1), Hérnia discal L5-S1..."
                      className="w-full p-3 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ABA 3: CINÉTICO-FUNCIONAL */}
            {activeTab === 'kinetic_functional' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b pb-3">
                  <Sliders className="w-4 h-4 text-teal-600" /> Exame Cinético-Funcional
                </h3>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Inspeção e Palpação</label>
                  <textarea
                    rows={3}
                    value={inspectionPalpation}
                    onChange={e => setInspectionPalpation(e.target.value)}
                    placeholder="Edema, calor, rubor, deformidades, pontos gatilho miofasciais, tônus muscular..."
                    className="w-full p-3 text-xs rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Limitações Funcionais e AVDs</label>
                  <textarea
                    rows={3}
                    value={functionalLimitations}
                    onChange={e => setFunctionalLimitations(e.target.value)}
                    placeholder="Dificuldades no trabalho, atividades de vida diária, esporte ou locomoção..."
                    className="w-full p-3 text-xs rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Diagnóstico Fisioterapêutico</label>
                  <textarea
                    rows={2}
                    value={physioDiagnosis}
                    onChange={e => setPhysioDiagnosis(e.target.value)}
                    placeholder="Disfunção do movimento, restrição de mobilidade ou déficit cinético..."
                    className="w-full p-3 text-xs rounded-xl border border-slate-200 font-semibold"
                  />
                </div>
              </div>
            )}

            {/* ABA 4: DOR & ZEMDABODY */}
            {activeTab === 'pain_zemdabody' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b pb-3">
                  <AlertCircle className="w-4 h-4 text-rose-600" /> Avaliação da Dor & Mapa Corporal
                </h3>

                {/* Escala EVA */}
                <div className="p-4 bg-rose-50/50 border border-rose-100 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Escala Visual Analógica (EVA):</span>
                    <span className="text-base font-extrabold text-rose-700">{painScore === '' ? 'Não avaliado' : `${painScore} / 10`}</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={painScore}
                    onChange={e => setPainScore(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full accent-rose-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-bold">
                    <span>0: Sem dor</span>
                    <span>3: Leve</span>
                    <span>7: Forte</span>
                    <span>10: Insuportável</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Localização e Irradiação</label>
                    <input
                      type="text"
                      value={painLocation}
                      onChange={e => setPainLocation(e.target.value)}
                      placeholder="Ex: Face anterior do ombro D irradiando para o braço"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Características da Dor</label>
                    <input
                      type="text"
                      value={painCharacteristics}
                      onChange={e => setPainCharacteristics(e.target.value)}
                      placeholder="Ex: Pontada, queimação, peso, latejante"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                </div>

                {/* Mapa Anatômico Interativo Zemda360 */}
                <div className="space-y-4 pt-2">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <label className="block text-xs font-extrabold text-slate-800">
                        Mapa Corporal Anatômico Zemda360
                      </label>
                      <p className="text-[11px] text-slate-500">
                        Selecione qualquer articulação ou região anatômica para realizar a avaliação fisioterapêutica regional e acompanhar a evolução longitudinal.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Seletor de Modelo Anatômico */}
                      <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={() => setBodyModel('male')}
                          className={`px-2.5 py-1 rounded-lg transition-all ${
                            bodyModel === 'male' ? 'bg-white shadow-xs text-teal-800' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Masculino
                        </button>
                        <button
                          type="button"
                          onClick={() => setBodyModel('female')}
                          className={`px-2.5 py-1 rounded-lg transition-all ${
                            bodyModel === 'female' ? 'bg-white shadow-xs text-teal-800' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Feminino
                        </button>
                      </div>

                      {/* Seletor de Vista */}
                      <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={() => setBodyCanvasViewMode('all')}
                          className={`px-2.5 py-1 rounded-lg transition-all ${
                            bodyCanvasViewMode === 'all' ? 'bg-white shadow-xs text-teal-800' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Frente + Verso
                        </button>
                        <button
                          type="button"
                          onClick={() => setBodyCanvasViewMode('front')}
                          className={`px-2.5 py-1 rounded-lg transition-all ${
                            bodyCanvasViewMode === 'front' ? 'bg-white shadow-xs text-teal-800' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Frente
                        </button>
                        <button
                          type="button"
                          onClick={() => setBodyCanvasViewMode('back')}
                          className={`px-2.5 py-1 rounded-lg transition-all ${
                            bodyCanvasViewMode === 'back' ? 'bg-white shadow-xs text-teal-800' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Costas
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Badges Discretos de Regiões com Histórico */}
                  {Array.isArray(regionalSummary) && regionalSummary.length > 0 && (
                    <div className="p-3 bg-teal-50/50 border border-teal-100 rounded-xl space-y-1.5">
                      <span className="text-[11px] font-bold text-teal-900 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-teal-600" /> Regiões com Histórico de Avaliação:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {regionalSummary.map(reg => {
                          const isSelected = selectedRegionId === reg.region_id;
                          return (
                            <button
                              key={reg.region_id}
                              type="button"
                              onClick={() => setSelectedRegionId(reg.region_id)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                                isSelected
                                  ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                                  : 'bg-white text-slate-700 border-teal-200 hover:bg-teal-100/60'
                              }`}
                            >
                              <span>{reg.region_label}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-teal-800/10 font-bold">
                                {reg.evaluation_count} aval.
                              </span>
                              {reg.latest_pain_score !== null && (
                                <span className={`text-[10px] font-black ${isSelected ? 'text-white' : 'text-rose-600'}`}>
                                  Dor {reg.latest_pain_score}/10
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Container do Canvas Anatômico Zemda360 */}
                  <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/30 overflow-hidden">
                    <ZemdaBodyCanvas
                      bodyModel={bodyModel}
                      initialViewMode={bodyCanvasViewMode}
                      controlledView={bodyCanvasViewMode}
                      selectedRegions={
                        Array.isArray(regionalSummary)
                          ? (selectedRegionId
                              ? [selectedRegionId, ...regionalSummary.map(r => r.region_id)]
                              : regionalSummary.map(r => r.region_id))
                          : (selectedRegionId ? [selectedRegionId] : [])
                      }
                      onToggleRegion={(regId: string) => {
                        setSelectedRegionId(regId);
                      }}
                      tool="select"
                      readOnly={false}
                    />
                  </div>

                  {/* PAINEL DE AÇÃO REGIONAL INTERATIVO */}
                  {selectedRegionId ? (
                    (() => {
                      const summaryItem = Array.isArray(regionalSummary)
                        ? regionalSummary.find(r => r.region_id === selectedRegionId)
                        : undefined;
                      const regLabel = summaryItem?.region_label || getRegionLabel(selectedRegionId, bodyModel);
                      const regSide = summaryItem?.side || detectSideFromRegionId(selectedRegionId);
                      const evalCount = summaryItem?.evaluation_count || 0;
                      const latestPain = summaryItem?.latest_pain_score;

                      return (
                        <div className="p-4 bg-white border-2 border-teal-500 rounded-2xl shadow-sm space-y-3 animate-in fade-in">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                            <div className="flex items-center gap-2">
                              <span className="p-1.5 rounded-lg bg-teal-100 text-teal-700">
                                <Activity className="w-4 h-4" />
                              </span>
                              <div>
                                <h4 className="text-sm font-extrabold text-slate-800">
                                  {regLabel}
                                </h4>
                                <span className="text-[11px] text-slate-500">
                                  Lateralidade: <strong className="text-slate-700">{formatLaterality(regSide)}</strong>
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {evalCount > 0 ? (
                                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200">
                                  {evalCount} avaliação(ões) registrada(s) {latestPain !== null && `• Dor: ${latestPain}/10`}
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                                  Nenhuma avaliação para esta região
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Botões de Ação da Região */}
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRegionalEval(null);
                                setShowRegionalAssessmentModal(true);
                              }}
                              className="flex items-center gap-1.5 px-4 py-2 text-xs font-extrabold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs transition-all"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>+ Nova Avaliação da Região</span>
                            </button>

                            {evalCount >= 1 && (
                              <button
                                type="button"
                                onClick={() => setShowComparisonModal(true)}
                                className="flex items-center gap-1.5 px-4 py-2 text-xs font-extrabold text-teal-900 bg-teal-100 hover:bg-teal-200 rounded-xl border border-teal-200 transition-all"
                              >
                                <Activity className="w-3.5 h-3.5 text-teal-700" />
                                <span>Comparar Linha do Tempo (Baseline × Atual)</span>
                              </button>
                            )}

                            {evalCount >= 1 && (
                              <button
                                type="button"
                                onClick={() => setShowRegionalListModal(true)}
                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
                              >
                                <span>Ver Histórico ({evalCount})</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500 font-medium">
                      👉 Clique em qualquer região ou articulação no mapa acima (ex: Ombro, Joelho, Coluna Lombar) para abrir a avaliação regional, goniometria, testes e evolução longitudinal.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ABA 5: ADM / GONIOMETRIA ESTRUTURADA */}
            {activeTab === 'adm_goniometry' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-teal-600" /> ADM / Goniometria Estruturada
                    </h3>
                    <p className="text-xs text-slate-500">
                      Tabela padronizada com amplitude normal de referência e valores aferidos bilateralmente.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold">
                      <tr>
                        <th className="py-2.5 px-3">Articulação</th>
                        <th className="py-2.5 px-3">Movimento</th>
                        <th className="py-2.5 px-3">ADM Normal</th>
                        <th className="py-2.5 px-3">Direito (°)</th>
                        <th className="py-2.5 px-3">Esquerdo (°)</th>
                        <th className="py-2.5 px-3">Déficit / Notas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {goniometryList.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-2 px-3 font-bold text-slate-800">{row.joint}</td>
                          <td className="py-2 px-3 text-slate-700">{row.movement}</td>
                          <td className="py-2 px-3 text-slate-400 font-mono">{row.normalRange}</td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={row.right}
                              placeholder="Ex: 160°"
                              onChange={e => {
                                const updated = [...goniometryList];
                                updated[idx].right = e.target.value;
                                setGoniometryList(updated);
                              }}
                              className="w-20 px-2 py-1 border rounded-lg text-xs font-semibold"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={row.left}
                              placeholder="Ex: 175°"
                              onChange={e => {
                                const updated = [...goniometryList];
                                updated[idx].left = e.target.value;
                                setGoniometryList(updated);
                              }}
                              className="w-20 px-2 py-1 border rounded-lg text-xs font-semibold"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={row.notes || ''}
                              placeholder="Ex: Dor no fim do arco"
                              onChange={e => {
                                const updated = [...goniometryList];
                                updated[idx].notes = e.target.value;
                                setGoniometryList(updated);
                              }}
                              className="w-full px-2 py-1 border rounded-lg text-xs"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ABA 6: FORÇA MUSCULAR (OXFORD 0-5) */}
            {activeTab === 'muscle_strength' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="border-b pb-3">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Dumbbell className="w-4 h-4 text-teal-600" /> Força Muscular — Escala Medical Research Council (Oxford 0 a 5)
                  </h3>
                  <p className="text-xs text-slate-500">
                    0: Ausência de contração | 1: Esboço de contração | 2: Movimento sem gravidade | 3: Vence gravidade | 4: Vence resistência moderada | 5: Normal
                  </p>
                </div>

                <div className="space-y-3">
                  {muscleStrengthList.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                      <span className="font-bold text-slate-800 w-1/2">{item.group}</span>
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-600">Direito:</span>
                          <select
                            value={item.rightGrade}
                            onChange={e => {
                              const updated = [...muscleStrengthList];
                              updated[idx].rightGrade = e.target.value === '' ? '' : Number(e.target.value);
                              setMuscleStrengthList(updated);
                            }}
                            className="px-2.5 py-1 border rounded-lg font-bold text-teal-800 bg-white"
                          ><option value="">Não avaliado</option>
                            {[0, 1, 2, 3, 4, 5].map(v => (
                              <option key={v} value={v}>{v}/5</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-600">Esquerdo:</span>
                          <select
                            value={item.leftGrade}
                            onChange={e => {
                              const updated = [...muscleStrengthList];
                              updated[idx].leftGrade = e.target.value === '' ? '' : Number(e.target.value);
                              setMuscleStrengthList(updated);
                            }}
                            className="px-2.5 py-1 border rounded-lg font-bold text-teal-800 bg-white"
                          ><option value="">Não avaliado</option>
                            {[0, 1, 2, 3, 4, 5].map(v => (
                              <option key={v} value={v}>{v}/5</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ABA 7: POSTURA & MARCHA */}
            {activeTab === 'posture_gait' && (
              <div className="space-y-6">
                {/* 1. SEÇÃO DE AVALIAÇÃO POSTURAL (FOTOGRAMETRIA E IA COMPARTILHADA) */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
                          <Camera className="w-4 h-4" />
                        </span>
                        <div>
                          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                            Avaliação Postural Compartilhada
                            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                              ZemdaFisio ↔ ZemdaPersonal
                            </span>
                          </h3>
                          <p className="text-xs text-slate-500">
                            Fotogrametria em 4 vistas, caneta anatômica, linhas de referência, IA postural e histórico comparativo.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPostureAssessment(null);
                          setIsPostureModalOpen(true);
                        }}
                        className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Nova Avaliação Postural
                      </button>

                      <button
                        type="button"
                        disabled={posturalAssessments.filter(a => a.has_posture).length === 0}
                        onClick={() => setIsPostureComparisonOpen(true)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition cursor-pointer ${
                          posturalAssessments.filter(a => a.has_posture).length === 0
                            ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                            : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50 shadow-xs'
                        }`}
                      >
                        <GitCompare className="w-3.5 h-3.5" />
                        Comparar Posturas
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab('pain_zemdabody')}
                        className="px-3 py-1.5 bg-slate-50 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-slate-200 transition cursor-pointer"
                        title="Correlacionar postura com dor e mapeamento 3D corporal"
                      >
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                        Mapeamento Zemda360
                      </button>
                    </div>
                  </div>

                  {/* Lista de Avaliações Posturais */}
                  {loadingPosturalAssessments ? (
                    <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                      Carregando avaliações posturais...
                    </div>
                  ) : posturalAssessments.filter(a => a.has_posture).length === 0 ? (
                    <div className="p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center space-y-3">
                      <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto shadow-xs">
                        <Camera className="w-5 h-5" />
                      </div>
                      <div className="max-w-md mx-auto">
                        <h4 className="text-xs font-bold text-slate-700">Nenhuma avaliação postural registrada</h4>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Capture fotos nas vistas anterior, posterior e laterais para desenhar eixos anatômicos, identificar desvios e obter apoio assistido por IA.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPostureAssessment(null);
                          setIsPostureModalOpen(true);
                        }}
                        className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Registrar Primeira Avaliação Postural
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {posturalAssessments
                        .filter(a => a.has_posture)
                        .map(item => (
                          <div
                            key={item.id}
                            className="p-4 bg-slate-50/80 hover:bg-slate-50 border border-slate-200 rounded-2xl transition space-y-3 flex flex-col justify-between"
                          >
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-800">
                                  {dateLabel(item.assessment_date)}
                                </span>
                                <span
                                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                                    item.source_module === 'ZemdaFisio'
                                      ? 'bg-teal-50 text-teal-700 border-teal-200'
                                      : 'bg-purple-50 text-purple-700 border-purple-200'
                                  }`}
                                >
                                  {item.source_module || 'ZemdaFisio'}
                                </span>
                              </div>

                              <p className="text-[11px] text-slate-500">
                                Avaliador: <strong className="text-slate-700">{item.professional_name || 'Profissional da Clínica'}</strong>
                              </p>

                              <div className="flex items-center gap-2 flex-wrap pt-1">
                                <span className="text-[11px] px-2 py-0.5 bg-white border border-slate-200 rounded-lg text-slate-600 font-medium">
                                  📷 {item.photos_count || 0} fotos
                                </span>
                                {item.posture_summary?.regions && item.posture_summary.regions.length > 0 && (
                                  <span className="text-[11px] px-2 py-0.5 bg-white border border-slate-200 rounded-lg text-slate-600 font-medium">
                                    📍 {item.posture_summary.regions.length} regiões
                                  </span>
                                )}
                                {item.posture_summary?.count !== undefined && (
                                  <span className="text-[11px] px-2 py-0.5 bg-white border border-slate-200 rounded-lg text-slate-600 font-medium">
                                    📝 {item.posture_summary.count} apontamentos
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenPostureAssessment(item.id)}
                                className="px-2.5 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-100/60 rounded-lg transition flex items-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Abrir Postura
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setIsPostureComparisonOpen(true);
                                }}
                                className="px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100/60 rounded-lg transition flex items-center gap-1 cursor-pointer"
                              >
                                <GitCompare className="w-3.5 h-3.5" />
                                Comparar
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* 2. ANOTAÇÕES CLÍNICAS E ANÁLISE DE MARCHA */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b pb-3">
                    <User className="w-4 h-4 text-teal-600" /> Anotações Descritivas & Análise de Marcha
                  </h3>
                  <PostureGait postureAnterior={postureAnterior} setPostureAnterior={setPostureAnterior} postureLateral={postureLateral} setPostureLateral={setPostureLateral} posturePosterior={posturePosterior} setPosturePosterior={setPosturePosterior} gaitAnalysis={gaitAnalysis} setGaitAnalysis={setGaitAnalysis} />
                </div>
              </div>
            )}

            {/* ABA 8: TESTES FUNCIONAIS ESPECÍFICOS */}
            {activeTab === 'functional_tests' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="border-b pb-3">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Award className="w-4 h-4 text-teal-600" /> Biblioteca Estruturada de Testes Especiais
                  </h3>
                  <p className="text-xs text-slate-500">
                    Registro de sensibilidade e acurácia clínica dos principais testes ortopédicos e neurológicos.
                  </p>
                </div>

                <div className="space-y-3">
                  {functionalTests.map((test, idx) => (
                    <div key={test.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className="font-bold text-slate-900 block">{test.name}</span>
                        <span className="text-[11px] text-slate-500">
                          Região: <strong>{test.region}</strong> | Alvo: {test.targetStructure}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={test.result}
                          onChange={e => {
                            const updated = [...functionalTests];
                            updated[idx].result = e.target.value as any;
                            setFunctionalTests(updated);
                          }}
                          className={`px-3 py-1.5 rounded-lg border font-bold text-xs ${
                            test.result === 'positive'
                              ? 'bg-rose-100 text-rose-800 border-rose-300'
                              : test.result === 'negative'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        ><option value="">Selecione / não avaliado</option>
                          <option value="not_tested">Não Testado</option>
                          <option value="negative">Negativo (-)</option>
                          <option value="positive">Positivo (+)</option>
                          <option value="doubtful">Duvidoso (±)</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ABA 9: CBDF (COFFITO 610/2025) */}
            {activeTab === 'cbdf' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
                <div className="border-b pb-3">
                  <span className="text-[10px] uppercase font-bold text-teal-800">Normativa Vigente COFFITO</span>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-teal-600" />
                    Classificação Brasileira de Diagnósticos Fisioterapêuticos (CBDF — COFFITO nº 610/2025)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Codificação e enquadramento nos eixos de Funções do Corpo, Estruturas, Atividades e Fatores Contextuais.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Eixo 1: Funções do Corpo (b)</label>
                    <input
                      type="text"
                      value={cbdfBodyFunction}
                      onChange={e => setCbdfBodyFunction(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Eixo 2: Estruturas do Corpo (s)</label>
                    <input
                      type="text"
                      value={cbdfBodyStructure}
                      onChange={e => setCbdfBodyStructure(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Eixo 3: Atividades e Participação (d)</label>
                    <input
                      type="text"
                      value={cbdfActivityParticipation}
                      onChange={e => setCbdfActivityParticipation(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Eixo 4: Fatores Contextuais (e)</label>
                    <input
                      type="text"
                      value={cbdfContextualFactors}
                      onChange={e => setCbdfContextualFactors(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Síntese Diagnóstica CBDF</label>
                  <textarea
                    rows={2}
                    value={cbdfDiagnosticSummary}
                    onChange={e => setCbdfDiagnosticSummary(e.target.value)}
                    placeholder="Descrição formal da disfunção cinético-funcional conforme parâmetros da CBDF..."
                    className="w-full p-3 text-xs rounded-xl border border-slate-200"
                  />
                </div>
              </div>
            )}

            {/* ABA 10: PLANO TERAPÊUTICO (RBPF 618/2025) */}
            {activeTab === 'treatment_plan' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
                <div className="border-b pb-3">
                  <span className="text-[10px] uppercase font-bold text-teal-800">Normativa Vigente COFFITO</span>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-teal-600" />
                    Registro Brasileiro de Práticas Fisioterapêuticas (RBPF — COFFITO nº 618/2025)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Prescrição das modalidades, frequência semanal e estimativa de sessões com metas de reavaliação.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Recursos e Modalidades Fisioterapêuticas</label>
                  <textarea
                    rows={3}
                    value={treatmentResources}
                    onChange={e => setTreatmentResources(e.target.value)}
                    placeholder="Ex: Cinesioterapia motora, eletroanalgesia TENS, fortalecimento excêntrico..."
                    className="w-full p-3 text-xs rounded-xl border border-slate-200"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Frequência Semanal</label>
                    <input
                      type="text"
                      value={sessionFrequency}
                      onChange={e => setSessionFrequency(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Estimativa de Sessões</label>
                    <input
                      type="number"
                      min={1}
                      value={estimatedSessions}
                      onChange={e => setEstimatedSessions(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Previsão de Reavaliação</label>
                    <input
                      type="date"
                      value={reassessmentDate}
                      onChange={e => setReassessmentDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ABA 11: METAS & REAVALIAÇÃO */}
            {activeTab === 'goals' && (
              <MeasurableGoalsManager
                patientId={selectedPatientId}
                specialty="fisio"
                moduleType="fisio"
              />
            )}

            {/* ABA 12: TESTES EXTERNOS */}
            {activeTab === 'external_tests' && (
              <ExternalTestsManager
                patientId={selectedPatientId}
                moduleType="fisio"
              />
            )}

            {/* ABA 13: EXERCÍCIOS DOMICILIARES */}
            {activeTab === 'home_exercises' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Dumbbell className="w-4 h-4 text-teal-600" /> Prescrição de Exercícios Domiciliares
                    </h3>
                    <p className="text-xs text-slate-500">
                      Montagem de rotina de exercícios com instruções claras para o paciente realizar em casa.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFollowUpModal(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-teal-600" /> Gerar PDF do Paciente
                  </button>
                </div>

                <div className="space-y-4">
                  {homeExercises.map((ex, idx) => (
                    <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <input
                          type="text"
                          value={ex.name}
                          onChange={e => {
                            const updated = [...homeExercises];
                            updated[idx].name = e.target.value;
                            setHomeExercises(updated);
                          }}
                          className="font-bold text-xs px-2 py-1 bg-white border border-slate-200 rounded-lg w-2/3"
                        />
                        <button
                          type="button"
                          onClick={() => setHomeExercises(homeExercises.filter((_, i) => i !== idx))}
                          className="text-slate-400 hover:text-rose-600 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input
                          type="text"
                          value={ex.series}
                          placeholder="Séries (ex: 3 séries)"
                          onChange={e => {
                            const updated = [...homeExercises];
                            updated[idx].series = e.target.value;
                            setHomeExercises(updated);
                          }}
                          className="px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg"
                        />
                        <input
                          type="text"
                          value={ex.repetitions}
                          placeholder="Repetições (ex: 12 repetições)"
                          onChange={e => {
                            const updated = [...homeExercises];
                            updated[idx].repetitions = e.target.value;
                            setHomeExercises(updated);
                          }}
                          className="px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg"
                        />
                        <input
                          type="text"
                          value={ex.frequency}
                          placeholder="Frequência (ex: 1x ao dia)"
                          onChange={e => {
                            const updated = [...homeExercises];
                            updated[idx].frequency = e.target.value;
                            setHomeExercises(updated);
                          }}
                          className="px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg"
                        />
                      </div>

                      <textarea
                        rows={2}
                        value={ex.instructions}
                        placeholder="Instruções e cuidados na execução..."
                        onChange={e => {
                          const updated = [...homeExercises];
                          updated[idx].instructions = e.target.value;
                          setHomeExercises(updated);
                        }}
                        className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-xl"
                      />
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => setHomeExercises([...homeExercises, { name: '', series: '', repetitions: '', frequency: '', instructions: '' }])}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> + Adicionar Exercício à Rotina
                  </button>
                </div>
              </div>
            )}

            {/* ABA 14: FINALIZAÇÃO CANÔNICA */}
            {activeTab === 'finish' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="border-b pb-3">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-600" /> Finalização do Atendimento Fisioterapêutico
                  </h3>
                  <p className="text-xs text-slate-500">
                    Gravação com lacre legal no prontuário eletrônico do paciente e opção de emitir acompanhamento.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 bg-teal-50/50 border border-teal-200 rounded-xl text-xs">
                    <span className="font-bold text-teal-900 block mb-1">Dor & EVA</span>
                    <p className="text-teal-700">EVA {painScore}/10 ({painLocation || 'Sem localização'})</p>
                  </div>
                  <div className="p-3.5 bg-teal-50/50 border border-teal-200 rounded-xl text-xs">
                    <span className="font-bold text-teal-900 block mb-1">Plano RBPF</span>
                    <p className="text-teal-700">{sessionFrequency} ({estimatedSessions} sessões)</p>
                  </div>
                  <div className="p-3.5 bg-teal-50/50 border border-teal-200 rounded-xl text-xs">
                    <span className="font-bold text-teal-900 block mb-1">Exercícios Domiciliares</span>
                    <p className="text-teal-700">{homeExercises.length} exercícios prescritos</p>
                  </div>
                </div>

                {Array.isArray(regionalSummary) && regionalSummary.length > 0 && (
                  <div className="p-4 bg-teal-50/40 border border-teal-100 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-teal-600" /> Avaliações Regionais Integradas (Zemda360):
                      </span>
                      <span className="text-[11px] text-teal-700 font-semibold">
                        {regionalSummary.length} região(ões) avaliada(s)
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {regionalSummary.map(reg => (
                        <div
                          key={reg.region_id}
                          className="px-3 py-1.5 bg-white border border-teal-200 rounded-lg text-xs flex items-center gap-2"
                        >
                          <span className="font-bold text-slate-800">{reg.region_label}</span>
                          <span className="text-[10px] text-slate-500">({reg.evaluation_count} aval.)</span>
                          {reg.latest_pain_score !== null && (
                            <span className="text-[10px] font-black text-rose-600">
                              Dor {reg.latest_pain_score}/10
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRegionId(reg.region_id);
                              setShowComparisonModal(true);
                            }}
                            className="text-[10px] font-bold text-teal-700 hover:underline ml-1"
                          >
                            Comparar
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Evolução Clínica e Conduta *</label>
                  <textarea
                    rows={5}
                    value={clinicalEvolution}
                    onChange={e => setClinicalEvolution(e.target.value)}
                    placeholder="Descreva detalhadamente a evolução fisioterapêutica da sessão..."
                    className="w-full p-3 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowFollowUpModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-indigo-700" />
                    <span>Gerar Acompanhamento para o Paciente</span>
                  </button>

                  <button
                    type="button"
                    disabled={saving || !clinicalEvolution.trim()}
                    onClick={handleFinishConsultation}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-teal-600 to-indigo-700 hover:from-teal-700 hover:to-indigo-800 text-white rounded-xl text-xs font-bold shadow-md shadow-teal-500/20 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{saving ? 'Gravando no Prontuário...' : 'Finalizar Atendimento'}</span>
                  </button>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* Modal de Prontuários Anteriores */}
      {showPreviousRecordsModal && selectedPatientId && (
        <PatientPreviousRecordsModal
          patientId={selectedPatientId}
          patientName={selectedPatient?.full_name}
          onClose={() => setShowPreviousRecordsModal(false)}
        />
      )}

      {/* Modal Guia de Exercícios para o Paciente (PDF) */}
      {showFollowUpModal && selectedPatientId && (
        <PatientFollowUpDocumentModal
          isOpen={showFollowUpModal}
          onClose={() => setShowFollowUpModal(false)}
          patientId={selectedPatientId}
          patientName={selectedPatient?.full_name || 'Paciente'}
          moduleType="ZemdaFisio"
          initialGuidelines={conducts || 'Seguir a rotina de exercícios com os cuidados orientados em sessão.'}
          homeExercisesText={homeExercisesText}
        />
      )}

      {/* Modais de Avaliação Regional Zemda360 */}
      {showRegionalAssessmentModal && selectedPatientId && selectedRegionId && (
        <RegionalPhysioAssessmentModal
          isOpen={showRegionalAssessmentModal}
          onClose={() => setShowRegionalAssessmentModal(false)}
          onSaved={(saved) => {
            loadRegionalSummary(selectedPatientId);
            if (saved.pain_json) {
              const p = typeof saved.pain_json === 'string' ? JSON.parse(saved.pain_json) : saved.pain_json;
              if (p?.score !== undefined) setPainScore(p.score);
            }
          }}
          patientId={selectedPatientId}
          patientName={selectedPatient?.full_name || 'Paciente'}
          appointmentId={initialAppointmentId}
          regionId={selectedRegionId}
          regionLabel={
            (Array.isArray(regionalSummary) && regionalSummary.find(r => r.region_id === selectedRegionId)?.region_label) ||
            getRegionLabel(selectedRegionId, bodyModel)
          }
          side={
            (Array.isArray(regionalSummary) && (regionalSummary.find(r => r.region_id === selectedRegionId)?.side as any)) ||
            detectSideFromRegionId(selectedRegionId)
          }
          initialData={editingRegionalEval}
        />
      )}

      {showComparisonModal && selectedPatientId && selectedRegionId && (
        <RegionalLongitudinalComparisonModal
          isOpen={showComparisonModal}
          onClose={() => setShowComparisonModal(false)}
          patientId={selectedPatientId}
          patientName={selectedPatient?.full_name || 'Paciente'}
          regionId={selectedRegionId}
          regionLabel={
            (Array.isArray(regionalSummary) && regionalSummary.find(r => r.region_id === selectedRegionId)?.region_label) ||
            getRegionLabel(selectedRegionId, bodyModel)
          }
          side={
            (Array.isArray(regionalSummary) && regionalSummary.find(r => r.region_id === selectedRegionId)?.side) ||
            detectSideFromRegionId(selectedRegionId)
          }
          onNewAssessmentRequested={() => {
            setEditingRegionalEval(null);
            setShowRegionalAssessmentModal(true);
          }}
        />
      )}

      {showRegionalListModal && selectedPatientId && selectedRegionId && (
        <RegionalEvaluationsListModal
          isOpen={showRegionalListModal}
          onClose={() => setShowRegionalListModal(false)}
          patientId={selectedPatientId}
          patientName={selectedPatient?.full_name || 'Paciente'}
          regionId={selectedRegionId}
          regionLabel={
            (Array.isArray(regionalSummary) && regionalSummary.find(r => r.region_id === selectedRegionId)?.region_label) ||
            getRegionLabel(selectedRegionId, bodyModel)
          }
          side={
            (Array.isArray(regionalSummary) && regionalSummary.find(r => r.region_id === selectedRegionId)?.side) ||
            detectSideFromRegionId(selectedRegionId)
          }
          onSelectForEdit={(ev) => {
            setShowRegionalListModal(false);
            setEditingRegionalEval(ev);
            setShowRegionalAssessmentModal(true);
          }}
          onNewAssessmentRequested={() => {
            setShowRegionalListModal(false);
            setEditingRegionalEval(null);
            setShowRegionalAssessmentModal(true);
          }}
          onCompareRequested={() => {
            setShowRegionalListModal(false);
            setShowComparisonModal(true);
          }}
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

      {isPostureModalOpen && selectedPatientId && (
        <Suspense fallback={null}>
          <PersonalAssessmentModal
            isOpen={isPostureModalOpen}
            onClose={() => {
              setIsPostureModalOpen(false);
              setEditingPostureAssessment(null);
            }}
            onSaved={() => {
              loadPosturalAssessments(selectedPatientId);
            }}
            student={{
              id: selectedPatientId,
              name: selectedPatient?.full_name || selectedPatient?.name || 'Paciente',
              birth_date: selectedPatient?.birth_date,
              gender: selectedPatient?.gender
            } as any}
            assessmentToEdit={editingPostureAssessment}
            postureOnly={true}
            sourceModule="ZemdaFisio"
            clientTermLabel="Paciente"
          />
        </Suspense>
      )}

      {isPostureComparisonOpen && selectedPatientId && (
        <Suspense fallback={null}>
          <PersonalAssessmentComparisonModal
            isOpen={isPostureComparisonOpen}
            onClose={() => setIsPostureComparisonOpen(false)}
            student={{
              id: selectedPatientId,
              name: selectedPatient?.full_name || selectedPatient?.name || 'Paciente'
            } as any}
            assessmentsList={posturalAssessments.filter(a => a.has_posture)}
            postureOnly={true}
          />
        </Suspense>
      )}
    </div>
  );
};
