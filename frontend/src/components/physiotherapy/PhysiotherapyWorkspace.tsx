import React, { useState, useEffect } from 'react';
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
  Sparkles
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

  const [patients, setPatients] = useState<any[]>([]);
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

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // 1. Evolução Clínica
  const [consultationTitle, setConsultationTitle] = useState<string>('Atendimento Fisioterapêutico');
  const [clinicalEvolution, setClinicalEvolution] = useState<string>('');
  const [conducts, setConducts] = useState<string>('');
  const [treatmentResponse, setTreatmentResponse] = useState<string>('Boa tolerância às intervenções propostas');

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

  // 4. Dor & ZemdaBody
  const [painScore, setPainScore] = useState<number>(0);
  const [painLocation, setPainLocation] = useState<string>('');
  const [painCharacteristics, setPainCharacteristics] = useState<string>('');
  const [painBehavior, setPainBehavior] = useState<string>('Piora com movimento, melhora com repouso');
  const [bodyMapJson, setBodyMapJson] = useState<string>('');
  const [bodyMapImage, setBodyMapImage] = useState<string>('');

  // 5. ADM / Goniometria Estruturada
  const [goniometryList, setGoniometryList] = useState<GoniometryRow[]>(DEFAULT_GONIOMETRY);

  // 6. Força Muscular (Oxford 0-5)
  const [muscleStrengthList, setMuscleStrengthList] = useState<{
    group: string;
    rightGrade: number;
    leftGrade: number;
  }[]>([
    { group: 'Flexores de Quadril (Psoas)', rightGrade: 5, leftGrade: 5 },
    { group: 'Extensores de Joelho (Quadríceps)', rightGrade: 5, leftGrade: 5 },
    { group: 'Flexores de Joelho (Isquiotibiais)', rightGrade: 5, leftGrade: 5 },
    { group: 'Dorsiflexores (Tibial Anterior)', rightGrade: 5, leftGrade: 5 },
    { group: 'Flexores Plantares (Tríceps Sural)', rightGrade: 5, leftGrade: 5 },
    { group: 'Abdutores de Ombro (Deltoide)', rightGrade: 5, leftGrade: 5 },
    { group: 'Flexores de Cotovelo (Bíceps)', rightGrade: 5, leftGrade: 5 },
    { group: 'Extensores de Cotovelo (Tríceps)', rightGrade: 5, leftGrade: 5 }
  ]);

  // 7. Postura & Marcha
  const [postureAnterior, setPostureAnterior] = useState<string>('Alinhamento simétrico das cristas ilíacas e ombros');
  const [postureLateral, setPostureLateral] = useState<string>('Curvaturas fisiológicas preservadas');
  const [posturePosterior, setPosturePosterior] = useState<string>('Espinhas e escápulas alinhadas');
  const [gaitAnalysis, setGaitAnalysis] = useState<string>('Marcha independente sem claudicação ou uso de dispositivos');

  // 8. Testes Funcionais Estruturados
  const [functionalTests, setFunctionalTests] = useState<FunctionalTestItem[]>(DEFAULT_FUNCTIONAL_TESTS);

  // 9. CBDF (COFFITO 610/2025)
  const [cbdfBodyFunction, setCbdfBodyFunction] = useState<string>('b710 Funções de mobilidade articular');
  const [cbdfBodyStructure, setCbdfBodyStructure] = useState<string>('s750 Estrutura do membro inferior');
  const [cbdfActivityParticipation, setCbdfActivityParticipation] = useState<string>('d450 Andar e d455 Deslocar-se');
  const [cbdfContextualFactors, setCbdfContextualFactors] = useState<string>('e110 Produtos e substâncias para consumo pessoal');
  const [cbdfDiagnosticSummary, setCbdfDiagnosticSummary] = useState<string>('');

  // 10. Plano Terapêutico (RBPF 618/2025)
  const [treatmentResources, setTreatmentResources] = useState<string>('Cinesioterapia, terapia manual, eletroterapia analgésica');
  const [sessionFrequency, setSessionFrequency] = useState<string>('2x por semana');
  const [estimatedSessions, setEstimatedSessions] = useState<number>(10);
  const [reassessmentDate, setReassessmentDate] = useState<string>('');

  // 13. Exercícios Domiciliares
  const [homeExercises, setHomeExercises] = useState<HomeExerciseItem[]>([
    {
      name: 'Alongamento de Isquiotibiais em decúbito dorsal',
      series: '3 séries',
      repetitions: '30 segundos cada lado',
      frequency: '2 vezes ao dia',
      instructions: 'Manter joelho estendido utilizando uma toalha ou faixa, sem prender a respiração.'
    },
    {
      name: 'Ponte bipodal para fortalecimento glúteo',
      series: '3 séries',
      repetitions: '12 repetições',
      frequency: '1 vez ao dia',
      instructions: 'Contrair glúteos e abdômen, subindo o quadril até alinhar coxa e tronco.'
    }
  ]);

  // Carrega pacientes
  useEffect(() => {
    async function loadPatients() {
      try {
        const res = await ApiClient.get<any[]>('/v1/patients');
        if (Array.isArray(res)) {
          setPatients(res);
        }
      } catch (err) {
        console.warn('Erro ao carregar lista de pacientes:', err);
      }
    }
    loadPatients();
  }, []);

  // Seleciona paciente
  useEffect(() => {
    if (!selectedPatientId) {
      setSelectedPatient(null);
      return;
    }
    const found = patients.find(p => p.id === selectedPatientId);
    if (found) {
      setSelectedPatient(found);
      loadPatientData(selectedPatientId);
    } else {
      ApiClient.get<any>(`/v1/patients/${selectedPatientId}`).then(p => {
        setSelectedPatient(p);
        loadPatientData(selectedPatientId);
      }).catch(err => console.warn(err));
    }
  }, [selectedPatientId, patients]);

  const loadPatientData = async (patId: string) => {
    try {
      setLoading(true);
      const [assessRes, evolRes] = await Promise.allSettled([
        ApiClient.get<any[]>(`/v1/physiotherapy/assessments/patient/${patId}`),
        ApiClient.get<any[]>(`/v1/physiotherapy/evolutions/patient/${patId}`)
      ]);

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
    } catch (err) {
      console.warn('Erro ao carregar dados fisioterapêuticos do paciente:', err);
    } finally {
      setLoading(false);
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
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-500 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-teal-500/20">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-800">ZemdaFisio</h1>
              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
                Fisioterapia Especializada
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Evolução, ADM/Goniometria, Escala Oxford, CBDF COFFITO 610/2025 e RBPF 618/2025.
            </p>
          </div>
        </div>

        {/* SELETOR DE PACIENTE */}
        <div className="flex items-center gap-3">
          <div className="relative min-w-[260px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedPatientId}
              disabled={!!initialAppointmentId}
              onChange={e => setSelectedPatientId(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-teal-500 focus:outline-none transition-colors"
            >
              <option value="">Selecione um Paciente...</option>
              {patients.map(p => (
                <option key={p.id} value={p.id}>
                  {p.full_name} {p.cpf ? `(${p.cpf})` : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedPatient && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-teal-50 border border-teal-200 rounded-xl text-xs font-semibold text-teal-900">
              <User className="w-3.5 h-3.5 text-teal-600" />
              <span>{selectedPatient.full_name}</span>
            </div>
          )}

          {selectedPatientId && (
            <>
              <button
                type="button"
                onClick={() => setShowPreviousRecordsModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition-all shadow-xs cursor-pointer whitespace-nowrap"
                title="Visualizar histórico completo de prontuários anteriores"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Prontuários Anteriores</span>
              </button>

              <button
                type="button"
                onClick={() => setShowFollowUpModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all shadow-xs cursor-pointer whitespace-nowrap"
                title="Imprimir prescrição de exercícios domiciliares para o paciente"
              >
                <Printer className="w-3.5 h-3.5 text-indigo-600" />
                <span>Guia de Exercícios</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 14 ABAS DE NAVEGAÇÃO ESTRUTURADAS (Item 10) */}
      <div className="bg-white border-b border-slate-200 px-6 flex items-center gap-1 overflow-x-auto no-scrollbar">
        {[
          { id: 'evolution', label: '1. Evolução', icon: Activity },
          { id: 'anamnesis', label: '2. Anamnese', icon: FileText },
          { id: 'kinetic_functional', label: '3. Cinético-Funcional', icon: Sliders },
          { id: 'pain_zemdabody', label: '4. Dor & ZemdaBody', icon: AlertCircle },
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
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3 py-3 text-xs font-bold border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
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
                    <span className="text-base font-extrabold text-rose-700">{painScore} / 10</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    value={painScore}
                    onChange={e => setPainScore(parseInt(e.target.value))}
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

                {/* Canvas Mapa de Dor */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700">Mapa Corporal de Dor Interativo</label>
                  <BodyPainMapCanvas
                    initialDataJson={bodyMapJson}
                    initialImageDataUrl={bodyMapImage}
                    onSave={(dataJson: string, imageDataUrl: string) => {
                      setBodyMapJson(dataJson);
                      setBodyMapImage(imageDataUrl);
                    }}
                  />
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
                              updated[idx].rightGrade = parseInt(e.target.value);
                              setMuscleStrengthList(updated);
                            }}
                            className="px-2.5 py-1 border rounded-lg font-bold text-teal-800 bg-white"
                          >
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
                              updated[idx].leftGrade = parseInt(e.target.value);
                              setMuscleStrengthList(updated);
                            }}
                            className="px-2.5 py-1 border rounded-lg font-bold text-teal-800 bg-white"
                          >
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
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b pb-3">
                  <User className="w-4 h-4 text-teal-600" /> Avaliação Postural & Análise de Marcha
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Vista Anterior</label>
                    <textarea
                      rows={3}
                      value={postureAnterior}
                      onChange={e => setPostureAnterior(e.target.value)}
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Vista Lateral</label>
                    <textarea
                      rows={3}
                      value={postureLateral}
                      onChange={e => setPostureLateral(e.target.value)}
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Vista Posterior</label>
                    <textarea
                      rows={3}
                      value={posturePosterior}
                      onChange={e => setPosturePosterior(e.target.value)}
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Análise de Marcha</label>
                  <textarea
                    rows={3}
                    value={gaitAnalysis}
                    onChange={e => setGaitAnalysis(e.target.value)}
                    placeholder="Contato inicial, resposta à carga, apoio médio, balanço e claudicação..."
                    className="w-full p-3 text-xs rounded-xl border border-slate-200"
                  />
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
                        >
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
                      onChange={e => setEstimatedSessions(parseInt(e.target.value) || 10)}
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
                    onClick={() => setHomeExercises([...homeExercises, { name: 'Novo Exercício', series: '3 séries', repetitions: '10 reps', frequency: 'Diário', instructions: '' }])}
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
    </div>
  );
};
