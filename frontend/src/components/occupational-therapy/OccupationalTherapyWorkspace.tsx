import { useConsultationCompletion } from '../clinical/useConsultationCompletion';
import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Activity,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Heart,
  History,
  Plus,
  Save,
  Search,
  Settings,
  Trash2,
  User,
  AlertTriangle,
  ChevronRight,
  Eye,
  Hand,
  Brain,
  Layers,
  Wrench,
  BookOpen,
  Target,
  Smile,
  LayoutDashboard,
  Calendar,
  Columns
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

import { TODashboardView } from './TODashboardView';
import { TaskAnalysisModal } from './TaskAnalysisModal';
import { RoutineMapModal } from './RoutineMapModal';
import { OccupationalParticipationModal } from './OccupationalParticipationModal';
import { TOEvolutionReportModal } from './TOEvolutionReportModal';
import { MeasurableGoalsManager } from '../common/MeasurableGoalsManager';
import { HomeSchoolProgramManager } from '../common/HomeSchoolProgramManager';
import { EvolutionComparisonModal } from '../common/EvolutionComparisonModal';
import { EvolutionPhotoField } from '../common/EvolutionPhotoField';

interface OccupationalTherapyWorkspaceProps {
  initialPatientId?: string;
  initialAppointmentId?: string;
  onFinishConsultation?: () => void;
}

export const OccupationalTherapyWorkspace: React.FC<OccupationalTherapyWorkspaceProps> = ({
  initialPatientId,
  initialAppointmentId,
  onFinishConsultation
}) => {
  const { currentUser, currentTenant } = useAuth();
  const { showToast } = useToast();

  // Pacientes e Seleção
  const completion = useConsultationCompletion(onFinishConsultation);
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId || '');
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);

  // Switcher de Área de Atuação da TO
  const [practiceArea, setPracticeArea] = useState<
    'pediatria' | 'neurologia' | 'saude_mental' | 'gerontologia' | 'reabilitacao_fisica' | 'hospitalar'
  >('pediatria');

  // Modais especializados de TO
  const [isTaskAnalysisOpen, setIsTaskAnalysisOpen] = useState(false);
  const [isRoutineMapOpen, setIsRoutineMapOpen] = useState(false);
  const [isParticipationOpen, setIsParticipationOpen] = useState(false);
  const [isAIReportOpen, setIsAIReportOpen] = useState(false);
  const [isComparisonModalOpen, setIsComparisonModalOpen] = useState(false);
  const [comparisonItems, setComparisonItems] = useState<any[]>([]);
  const [comparisonTitle, setComparisonTitle] = useState('Comparativo de Reavaliação Longitudinal');

  // Fotos de evolução (Tecnologia Assistiva / Órteses / Postura)
  const [assistivePhotos, setAssistivePhotos] = useState<any[]>([]);

  // Abas do Módulo ZemdaTO
  const [activeTab, setActiveTab] = useState<
    | 'dashboard'
    | 'profile'
    | 'adl'
    | 'sensory'
    | 'motor_cognitive'
    | 'goals'
    | 'treatment_plans'
    | 'home_program'
    | 'assistive_tech'
    | 'finish'
  >('dashboard');

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // 1. Perfil Ocupacional
  const [profileData, setProfileData] = useState<any>({
    occupationalHistory: '',
    dailyRoutine: '',
    interestsAndValues: '',
    contextualFacilitators: '',
    contextualBarriers: '',
    performanceAreas: {
      adl: true,
      iadl: true,
      restSleep: false,
      education: false,
      work: false,
      play: false,
      leisure: false,
      socialParticipation: true
    },
    goalsReportedByPatient: ''
  });

  // 2. Avaliação de AVD e AIVD (6 níveis de independência funcional)
  // 1: Totalmente Dependente (<25%)
  // 2: Máxima Assistência (25-49%)
  // 3: Moderada Assistência (50-74%)
  // 4: Mínima Assistência (75-99%)
  // 5: Supervisão / Preparo
  // 6: Independência Completa / Modificada (100%)
  const [adlItems, setAdlItems] = useState<any[]>([
    { key: 'feeding', label: 'Alimentação (uso de talheres, copo)', score: 6, notes: '' },
    { key: 'grooming', label: 'Higiene Pessoal (dentes, face, pentear)', score: 6, notes: '' },
    { key: 'bathing', label: 'Banho (lavar corpo, secar-se)', score: 6, notes: '' },
    { key: 'upper_dressing', label: 'Vestuário Superior (camisa, casaco)', score: 6, notes: '' },
    { key: 'lower_dressing', label: 'Vestuário Inferior (calça, meia, tênis)', score: 6, notes: '' },
    { key: 'toileting', label: 'Uso do Sanitário (higiene, manejo de roupas)', score: 6, notes: '' },
    { key: 'functional_mobility', label: 'Mobilidade Funcional (transferências)', score: 6, notes: '' },
    { key: 'medication_management', label: 'Gestão de Medicamentos (AIVD)', score: 6, notes: '' },
    { key: 'home_maintenance', label: 'Cuidados com a Casa / Limpeza (AIVD)', score: 6, notes: '' },
    { key: 'tech_use', label: 'Uso do Celular / Computador (AIVD)', score: 6, notes: '' },
    { key: 'financial_management', label: 'Gestão Financeira e Compras (AIVD)', score: 6, notes: '' }
  ]);
  const [adlList, setAdlList] = useState<any[]>([]);

  // 3. Processamento Sensorial (8 Sistemas)
  const [sensorySystems, setSensorySystems] = useState<any>({
    visual: { pattern: 'typical', notes: '' },
    auditory: { pattern: 'typical', notes: '' },
    tactile: { pattern: 'typical', notes: '' },
    vestibular: { pattern: 'typical', notes: '' },
    proprioceptive: { pattern: 'typical', notes: '' },
    olfactory: { pattern: 'typical', notes: '' },
    gustatory: { pattern: 'typical', notes: '' },
    interoceptive: { pattern: 'typical', notes: '' }
  });
  const [sensoryNotes, setSensoryNotes] = useState<string>('');

  // 4. Avaliação Motora e Cognitiva
  const [motorCognitiveData, setMotorCognitiveData] = useState<any>({
    fineMotorCoordination: 'Típica / Adequada para a faixa etária',
    grossMotorCoordination: 'Sem déficits significativos observados',
    palmarGrasp: 'Cilíndrica e esférica preservadas',
    digitalPinches: 'Pinça trípode madura e eficiente',
    motorPlanningPraxis: 'Ideatória e ideomotora sem alterações',
    muscleTone: 'Normotonia',
    jointRom: 'Amplitude articular completa nos quatro membros',
    attentionConcentration: 'Sustentada e direcionada durante as atividades',
    executiveFunctions: 'Iniciação e planejamento organizados',
    notes: ''
  });

  // 5. Plano Terapêutico Ocupacional
  const [treatmentPlans, setTreatmentPlans] = useState<any[]>([]);
  const [planForm, setPlanForm] = useState({
    title: 'Plano Terapêutico Ocupacional Singular',
    shortTermGoals: 'Aumentar independência na alimentação e no vestuário superior para nível 5 (supervisão).',
    mediumTermGoals: 'Atingir independência completa na rotina de higiene e autocuidado.',
    longTermGoals: 'Autonomia nas AIVDs comunitárias e participação social plena.',
    interventions: 'Integração Sensorial de Ayres, treino funcional de AVD com adaptação de preensão, adaptação ambiental.',
    familyGuidelines: 'Estimular oportunidade de fazer sozinho em casa, reduzindo assistência física prévia.',
    frequencySessions: '2 vezes por semana, duração de 50 minutos'
  });

  // 6. Tecnologia Assistiva e Órteses
  const [assistiveList, setAssistiveList] = useState<any[]>([]);
  const [assistiveForm, setAssistiveForm] = useState({
    resourceType: 'Engrossador de talher / caneta',
    objective: 'Facilitar preensão palmar e diminuir fadiga durante a refeição e escrita',
    materialsUsed: 'Espuma termoplástica de alta densidade (EVA)',
    customFittingNotes: 'Molde adaptado para talher comum com diâmetro de 30mm',
    maintenanceFollowup: 'Revisão do desgaste em 60 dias'
  });

  // 7. Finalização da Consulta
  const [consultationTitle, setConsultationTitle] = useState<string>('Atendimento de Terapia Ocupacional');
  const [consultationEvolution, setConsultationEvolution] = useState<string>('');
  const [consultationConducts, setConsultationConducts] = useState<string>('');

  // Carrega pacientes
  useEffect(() => {
    async function loadPatients() {
      try {
        const res = await ApiClient.get<any[]>('/v1/patients');
        if (Array.isArray(res)) setPatients(res);
      } catch (err) {
        console.warn('Erro ao carregar pacientes:', err);
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

  // Carrega dados de TO do paciente
  const loadPatientData = async (patId: string) => {
    try {
      setLoading(true);
      const [profRes, adlRes, sensRes, motRes, planRes, astRes] = await Promise.allSettled([
        ApiClient.get<any>(`/v1/occupational-therapy/profile/${patId}`),
        ApiClient.get<any[]>(`/v1/occupational-therapy/avd/${patId}`),
        ApiClient.get<any>(`/v1/occupational-therapy/sensory/${patId}`),
        ApiClient.get<any>(`/v1/occupational-therapy/motor-cognitive/${patId}`),
        ApiClient.get<any[]>(`/v1/occupational-therapy/treatment-plans/${patId}`),
        ApiClient.get<any[]>(`/v1/occupational-therapy/assistive-tech/${patId}`)
      ]);

      if (profRes.status === 'fulfilled' && profRes.value && profRes.value.profile) {
        setProfileData(profRes.value.profile);
      }
      if (adlRes.status === 'fulfilled' && Array.isArray(adlRes.value)) {
        setAdlList(adlRes.value);
        if (adlRes.value.length > 0 && adlRes.value[0].items) {
          setAdlItems(adlRes.value[0].items);
        }
      }
      if (sensRes.status === 'fulfilled' && sensRes.value) {
        if (sensRes.value.systems) setSensorySystems(sensRes.value.systems);
        if (sensRes.value.notes) setSensoryNotes(sensRes.value.notes);
      }
      if (motRes.status === 'fulfilled' && motRes.value && motRes.value.data) {
        setMotorCognitiveData(motRes.value.data);
      }
      if (planRes.status === 'fulfilled' && Array.isArray(planRes.value)) {
        setTreatmentPlans(planRes.value);
      }
      if (astRes.status === 'fulfilled' && Array.isArray(astRes.value)) {
        setAssistiveList(astRes.value);
      }
    } catch (err) {
      console.warn('Erro ao carregar dados de TO:', err);
    } finally {
      setLoading(false);
    }
  };

  // Salva Perfil Ocupacional
  const handleSaveProfile = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente', 'info');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/occupational-therapy/profile', {
        patientId: selectedPatientId,
        profile: profileData
      });
      showToast('Perfil Ocupacional salvo com sucesso!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar perfil ocupacional', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Salva Avaliação de AVD
  const handleSaveAdl = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente', 'info');
      return;
    }
    try {
      setSaving(true);
      const totalScore = adlItems.reduce((acc, curr) => acc + (curr.score || 0), 0);
      const maxScore = adlItems.length * 6;
      const independenceRate = Math.round((totalScore / maxScore) * 100);

      await ApiClient.post('/v1/occupational-therapy/avd', {
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId || null,
        items: adlItems,
        totalScore,
        independenceRate
      });
      showToast('Avaliação de AVD/AIVD salva com sucesso!', 'success');
      loadPatientData(selectedPatientId);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar avaliação de AVD', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Salva Processamento Sensorial
  const handleSaveSensory = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente', 'info');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/occupational-therapy/sensory', {
        patientId: selectedPatientId,
        systems: sensorySystems,
        notes: sensoryNotes
      });
      showToast('Perfil de Processamento Sensorial salvo com sucesso!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar perfil sensorial', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Salva Avaliação Motora e Cognitiva
  const handleSaveMotorCognitive = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente', 'info');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/occupational-therapy/motor-cognitive', {
        patientId: selectedPatientId,
        data: motorCognitiveData
      });
      showToast('Avaliação Motora e Cognitiva salva com sucesso!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar avaliação motora/cognitiva', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Salva Plano Terapêutico
  const handleSaveTreatmentPlan = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente', 'info');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/occupational-therapy/treatment-plans', {
        patientId: selectedPatientId,
        ...planForm
      });
      showToast('Plano Terapêutico Ocupacional salvo com sucesso!', 'success');
      loadPatientData(selectedPatientId);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar plano terapêutico', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Salva Tecnologia Assistiva
  const handleSaveAssistiveTech = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente', 'info');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/occupational-therapy/assistive-tech', {
        patientId: selectedPatientId,
        ...assistiveForm
      });
      showToast('Registro de Tecnologia Assistiva cadastrado!', 'success');
      loadPatientData(selectedPatientId);
      setAssistiveForm({
        resourceType: '',
        objective: '',
        materialsUsed: '',
        customFittingNotes: '',
        maintenanceFollowup: ''
      });
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar tecnologia assistiva', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Finalizar Atendimento de TO de Forma Atômica
  const handleFinishConsultation = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente para finalizar o atendimento', 'info');
      return;
    }
    if (!consultationEvolution.trim()) {
      showToast('Por favor, informe a evolução clínica e conduta terapêutica', 'info');
      return;
    }

    try {
      setSaving(true);
      await completion.save('/v1/occupational-therapy/consultations/finish', {
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId || null,
        title: consultationTitle,
        clinicalEvolution: consultationEvolution,
        conducts: consultationConducts || undefined,
        profileData,
        adlData: { items: adlItems },
        sensoryData: { systems: sensorySystems, notes: sensoryNotes },
        motorCognitiveData,
        treatmentPlanData: planForm, assistiveTechnologyData: assistiveForm
      });


    } catch (err: any) {
      showToast(err.message || 'Erro ao finalizar atendimento de TO', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Helper para abrir modal comparativo longitudinal de AVDs
  const handleOpenAdlComparison = () => {
    if (!adlList || adlList.length === 0) {
      showToast('Não há avaliações anteriores registradas para comparação', 'info');
      return;
    }
    const current = adlItems;
    const previous = adlList.length > 1 ? adlList[1].items : adlList[0].items;
    const initial = adlList[adlList.length - 1].items || [];

    const items: any[] = current.map(c => {
      const p = previous?.find((x: any) => x.key === c.key);
      const init = initial?.find((x: any) => x.key === c.key);
      const currScore = c.score || 0;
      const prevScore = p?.score ?? currScore;
      const initScore = init?.score ?? prevScore;

      let status: 'improved' | 'maintained' | 'worsened' | 'not_evaluated' = 'maintained';
      if (currScore > prevScore) status = 'improved';
      else if (currScore < prevScore) status = 'worsened';

      return {
        id: c.key,
        name: c.label,
        category: 'AVD / AIVD',
        initialValue: `Nível ${initScore} / 6`,
        previousValue: `Nível ${prevScore} / 6`,
        currentValue: `Nível ${currScore} / 6`,
        status,
        notes: c.notes
      };
    });

    setComparisonTitle('Comparativo Longitudinal de AVDs e AIVDs (6 Níveis)');
    setComparisonItems(items);
    setIsComparisonModalOpen(true);
  };

  // Calcula taxa média de independência de AVD
  const adlSummary = React.useMemo(() => {
    const total = adlItems.reduce((acc, curr) => acc + (curr.score || 0), 0);
    const max = adlItems.length * 6;
    const pct = Math.round((total / max) * 100);
    return { total, max, pct };
  }, [adlItems]);

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800">
      {completion.dialog}
      {/* CABEÇALHO DO MÓDULO ZEMDATO */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center">
            <Hand className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-800">ZemdaTO</h1>
              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                Terapia Ocupacional
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Perfil ocupacional, AVDs padronizadas em 6 níveis, perfil sensorial, tecnologia assistiva e prontuário integrado.
            </p>
          </div>
        </div>

        {/* CONTROLES DO CABEÇALHO: ÁREA DE ATUAÇÃO E SELETOR DE PACIENTE */}
        <div className="flex flex-wrap items-center gap-3">
          {/* SWITCHER DE ÁREA DE ATUAÇÃO */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[10px] font-extrabold uppercase text-slate-400">Área:</span>
            <select
              value={practiceArea}
              onChange={e => setPracticeArea(e.target.value as any)}
              className="text-xs font-bold text-teal-900 bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="pediatria">Pediatria e Desenvolvimento Infantil</option>
              <option value="neurologia">Neurologia Adulto / Infantil</option>
              <option value="saude_mental">Saúde Mental e Psicossocial</option>
              <option value="gerontologia">Gerontologia / Saúde do Idoso</option>
              <option value="reabilitacao_fisica">Reabilitação Física / Membro Superior</option>
              <option value="hospitalar">Contextos Hospitalares / Leito</option>
            </select>
          </div>

          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedPatientId}
              disabled={!!initialAppointmentId}
              onChange={e => setSelectedPatientId(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-teal-500 focus:outline-none transition-colors cursor-pointer"
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
        </div>
      </div>

      {/* ABAS DE NAVEGAÇÃO E AÇÕES RÁPIDAS */}
      <div className="bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
          {[
            { id: 'dashboard', label: 'Painel Funcional', icon: LayoutDashboard },
            { id: 'profile', label: 'Perfil Ocupacional', icon: User },
            { id: 'adl', label: 'AVDs & AIVDs (6 Níveis)', icon: Activity },
            { id: 'sensory', label: 'Perfil Sensorial (8 Sistemas)', icon: Eye },
            { id: 'motor_cognitive', label: 'Motor & Cognitivo', icon: Brain },
            { id: 'goals', label: 'Metas Mensuráveis', icon: Target },
            { id: 'home_program', label: 'Casa & Escola', icon: BookOpen },
            { id: 'treatment_plans', label: 'Plano Singular', icon: Layers },
            { id: 'assistive_tech', label: 'Tecnologia Assistiva', icon: Wrench },
            { id: 'finish', label: 'Finalizar Atendimento', icon: CheckCircle2 }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
                  isActive
                    ? 'border-teal-600 text-teal-700 bg-teal-50/50'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-teal-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* BOTÕES DE FERRAMENTAS AVANÇADAS DE TO */}
        {selectedPatientId && (
          <div className="hidden xl:flex items-center gap-1.5 shrink-0 pl-3">
            <button
              type="button"
              onClick={() => setIsTaskAnalysisOpen(true)}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-200 hover:border-teal-300 text-slate-700 bg-slate-50 hover:bg-white transition-colors cursor-pointer"
            >
              Análise de Tarefas
            </button>
            <button
              type="button"
              onClick={() => setIsRoutineMapOpen(true)}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-200 hover:border-teal-300 text-slate-700 bg-slate-50 hover:bg-white transition-colors cursor-pointer"
            >
              Mapa da Rotina
            </button>
            <button
              type="button"
              onClick={() => setIsParticipationOpen(true)}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-200 hover:border-teal-300 text-slate-700 bg-slate-50 hover:bg-white transition-colors cursor-pointer"
            >
              Participação (MOHO)
            </button>
            <button
              type="button"
              onClick={() => setIsAIReportOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3 h-3 text-teal-600" />
              Relatório IA
            </button>
          </div>
        )}
      </div>

      {/* CONTEÚDO PRINCIPAL */}
      <div className="flex-1 p-6 overflow-y-auto">
        {!selectedPatientId ? (
          <div className="flex flex-col items-center justify-center h-64 text-center bg-white rounded-2xl border border-slate-200 p-8">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center mb-3">
              <Hand className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Selecione um Paciente</h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              Escolha um paciente no menu superior para acessar o perfil ocupacional, escala de AVDs e plano de terapia ocupacional.
            </p>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-6">

            {/* ABA 0: PAINEL FUNCIONAL LONGITUDINAL */}
            {activeTab === 'dashboard' && (
              <TODashboardView patientId={selectedPatientId} />
            )}

            {/* ABA 1: PERFIL OCUPACIONAL */}
            {activeTab === 'profile' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <User className="w-4 h-4 text-teal-600" />
                      Perfil Ocupacional do Indivíduo
                    </h3>
                    <p className="text-xs text-slate-500">
                      Histórico ocupacional, rotina de vida diária, interesses significativos e barreiras contextuais.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Histórico Ocupacional e Papéis Desempenhados</label>
                    <textarea
                      rows={3}
                      placeholder="Papéis ocupacionais atuais e anteriores (estudante, trabalhador, cuidador, aposentado)..."
                      value={profileData.occupationalHistory}
                      onChange={e => setProfileData({ ...profileData, occupationalHistory: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Rotina Diária Típica</label>
                    <textarea
                      rows={3}
                      placeholder="Descreva a sequência de atividades ao acordar, refeições, ocupações produtivas e sono..."
                      value={profileData.dailyRoutine}
                      onChange={e => setProfileData({ ...profileData, dailyRoutine: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Interesses, Valores e Motivações</label>
                    <textarea
                      rows={3}
                      placeholder="O que é verdadeiramente importante para o paciente? Hobbies, espiritualidade, convívio..."
                      value={profileData.interestsAndValues}
                      onChange={e => setProfileData({ ...profileData, interestsAndValues: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Facilitadores e Barreiras no Ambiente</label>
                    <textarea
                      rows={3}
                      placeholder="Acessibilidade física, apoio familiar, barreiras arquitetônicas ou atitudinais..."
                      value={profileData.contextualBarriers}
                      onChange={e => setProfileData({ ...profileData, contextualBarriers: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveProfile}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {saving ? 'Salvando...' : 'Salvar Perfil Ocupacional'}
                  </button>
                </div>
              </div>
            )}

            {/* ABA 2: AVALIAÇÃO DE AVDS E AIVDS (6 NÍVEIS) */}
            {activeTab === 'adl' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-teal-600" />
                      Avaliação de Atividades de Vida Diária (AVDs e AIVDs)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Escala padronizada com 6 níveis funcionais de dependência e assistência física.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleOpenAdlComparison}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-xl border border-teal-200 transition-colors cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5 text-teal-600" />
                      <span>Comparar Evolução</span>
                    </button>

                    <div className="flex items-center gap-3 px-4 py-2 bg-teal-50 border border-teal-200 rounded-xl">
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-teal-800">Taxa de Independência</span>
                        <p className="text-lg font-extrabold text-teal-700">{adlSummary.pct}%</p>
                      </div>
                      <div className="h-8 w-px bg-teal-200" />
                      <div className="text-xs text-teal-900 font-semibold">
                        {adlSummary.total} de {adlSummary.max} pontos
                      </div>
                    </div>
                  </div>
                </div>

                {/* LEGENDA DA ESCALA DE 6 NÍVEIS */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-[11px] p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="p-2 rounded-lg bg-red-50 text-red-800 border border-red-200 font-medium text-center">
                    <strong>1. Dependente</strong><br/>Ajuda &gt;75%
                  </div>
                  <div className="p-2 rounded-lg bg-orange-50 text-orange-800 border border-orange-200 font-medium text-center">
                    <strong>2. Máxima</strong><br/>Ajuda 50-74%
                  </div>
                  <div className="p-2 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 font-medium text-center">
                    <strong>3. Moderada</strong><br/>Ajuda 25-49%
                  </div>
                  <div className="p-2 rounded-lg bg-yellow-50 text-yellow-800 border border-yellow-200 font-medium text-center">
                    <strong>4. Mínima</strong><br/>Ajuda &lt;25%
                  </div>
                  <div className="p-2 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 font-medium text-center">
                    <strong>5. Supervisão</strong><br/>Preparo / estímulo
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium text-center">
                    <strong>6. Independente</strong><br/>Sem assistência
                  </div>
                </div>

                {/* TABELA DE ITENS DE AVD */}
                <div className="space-y-3">
                  {adlItems.map((item, idx) => (
                    <div key={item.key} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex-1">
                        <span className="text-xs font-bold text-slate-800">{item.label}</span>
                        <input
                          type="text"
                          placeholder="Observações específicas para esta atividade..."
                          value={item.notes || ''}
                          onChange={e => {
                            const updated = [...adlItems];
                            updated[idx].notes = e.target.value;
                            setAdlItems(updated);
                          }}
                          className="mt-1 w-full px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none"
                        />
                      </div>

                      <div className="flex items-center gap-1">
                        {[
                          { val: 1, label: '1 - Total' },
                          { val: 2, label: '2 - Máx' },
                          { val: 3, label: '3 - Mod' },
                          { val: 4, label: '4 - Mín' },
                          { val: 5, label: '5 - Sup' },
                          { val: 6, label: '6 - Indep' }
                        ].map(lvl => (
                          <button
                            key={lvl.val}
                            type="button"
                            onClick={() => {
                              const updated = [...adlItems];
                              updated[idx].score = lvl.val;
                              setAdlItems(updated);
                            }}
                            className={`px-2 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                              item.score === lvl.val
                                ? lvl.val === 6
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : lvl.val >= 4
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'bg-amber-600 text-white shadow-xs'
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {lvl.val}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveAdl}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {saving ? 'Salvando...' : 'Salvar Avaliação de AVDs'}
                  </button>
                </div>
              </div>
            )}

            {/* ABA 3: PERFIL SENSORIAL (8 SISTEMAS) */}
            {activeTab === 'sensory' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Eye className="w-4 h-4 text-teal-600" />
                      Avaliação do Processamento Sensorial (8 Sistemas)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Mapeamento de padrões sensoriais (hiper-reatividade, hipo-reatividade, busca sensorial e sensibilidade típica).
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { key: 'visual', name: 'Sistema Visual', desc: 'Respostas a luzes, padrões, movimento visual e busca por estímulos visuais' },
                    { key: 'auditory', name: 'Sistema Auditivo', desc: 'Reação a sons altos, ruídos de fundo, intolerância ou busca por sons' },
                    { key: 'tactile', name: 'Sistema Tátil', desc: 'Defensividade tátil (texturas, etiquetas, toques inesperados) ou busca por toque' },
                    { key: 'vestibular', name: 'Sistema Vestibular', desc: 'Insegurança gravitacional, tolerância a movimento, balanços e equilíbrio' },
                    { key: 'proprioceptive', name: 'Sistema Proprioceptivo', desc: 'Noção do corpo no espaço, força aplicada, coordenação e busca por pressão profunda' },
                    { key: 'olfactory', name: 'Sistema Olfativo', desc: 'Sensibilidade a cheiros, recusa ou fixação em odores específicos' },
                    { key: 'gustatory', name: 'Sistema Gustativo', desc: 'Seletividade alimentar sensorial (texturas, temperaturas, sabores intensos)' },
                    { key: 'interoceptive', name: 'Sistema Interoceptivo', desc: 'Percepção de fome, sede, dor, temperatura interna e controle esfincteriano' }
                  ].map(sys => {
                    const currentSys = sensorySystems[sys.key] || { pattern: 'typical', notes: '' };
                    return (
                      <div key={sys.key} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800">{sys.name}</span>
                          <select
                            value={currentSys.pattern}
                            onChange={e => {
                              setSensorySystems({
                                ...sensorySystems,
                                [sys.key]: { ...currentSys, pattern: e.target.value }
                              });
                            }}
                            className="text-xs px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-semibold cursor-pointer outline-none focus:border-teal-500"
                          >
                            <option value="typical">Sensibilidade Típica</option>
                            <option value="hyperreactive">Hiper-reativo (Evitação / Desconforto)</option>
                            <option value="hyporeactive">Hipo-reativo (Baixo Registro)</option>
                            <option value="seeker">Busca Sensorial Intensa</option>
                          </select>
                        </div>
                        <p className="text-[11px] text-slate-500">{sys.desc}</p>
                        <input
                          type="text"
                          placeholder="Ex: Reclama do barulho do liquidificador e tampa os ouvidos..."
                          value={currentSys.notes || ''}
                          onChange={e => {
                            setSensorySystems({
                              ...sensorySystems,
                              [sys.key]: { ...currentSys, notes: e.target.value }
                            });
                          }}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                        />
                      </div>
                    );
                  })}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Síntese e Recomendações de Dieta Sensorial</label>
                  <textarea
                    rows={3}
                    placeholder="Estratégias sensoriais calmantes, alerta e adaptações para sala de aula ou lar..."
                    value={sensoryNotes}
                    onChange={e => setSensoryNotes(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveSensory}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {saving ? 'Salvando...' : 'Salvar Perfil Sensorial'}
                  </button>
                </div>
              </div>
            )}

            {/* ABA 4: MOTOR & COGNITIVO */}
            {activeTab === 'motor_cognitive' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Brain className="w-4 h-4 text-teal-600" />
                      Avaliação Motora Fina, Grossa e Cognitiva
                    </h3>
                    <p className="text-xs text-slate-500">
                      Padrões de preensão, pinças, planejamento motor, funções executivas e tônus.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Coordenação Motora Fina</label>
                    <input
                      type="text"
                      value={motorCognitiveData.fineMotorCoordination}
                      onChange={e => setMotorCognitiveData({ ...motorCognitiveData, fineMotorCoordination: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Padrão de Preensão e Pinças</label>
                    <input
                      type="text"
                      value={motorCognitiveData.digitalPinches}
                      onChange={e => setMotorCognitiveData({ ...motorCognitiveData, digitalPinches: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Planejamento Motor e Praxia</label>
                    <input
                      type="text"
                      value={motorCognitiveData.motorPlanningPraxis}
                      onChange={e => setMotorCognitiveData({ ...motorCognitiveData, motorPlanningPraxis: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Atenção e Funções Executivas</label>
                    <input
                      type="text"
                      value={motorCognitiveData.attentionConcentration}
                      onChange={e => setMotorCognitiveData({ ...motorCognitiveData, attentionConcentration: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveMotorCognitive}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {saving ? 'Salvando...' : 'Salvar Avaliação Motora / Cognitiva'}
                  </button>
                </div>
              </div>
            )}

            {/* ABA 5: PLANO TERAPÊUTICO SINGULAR */}
            {activeTab === 'treatment_plans' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Target className="w-4 h-4 text-teal-600" />
                      Plano Terapêutico Singular (PTS)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Objetivos terapêuticos de curto, médio e longo prazo, frequência e orientações.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Título do Plano</label>
                    <input
                      type="text"
                      value={planForm.title}
                      onChange={e => setPlanForm({ ...planForm, title: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 font-semibold focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Metas de Curto Prazo (1 a 3 meses)</label>
                      <textarea
                        rows={3}
                        value={planForm.shortTermGoals}
                        onChange={e => setPlanForm({ ...planForm, shortTermGoals: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Metas de Médio Prazo (3 a 6 meses)</label>
                      <textarea
                        rows={3}
                        value={planForm.mediumTermGoals}
                        onChange={e => setPlanForm({ ...planForm, mediumTermGoals: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Metas de Longo Prazo (6 a 12 meses)</label>
                      <textarea
                        rows={3}
                        value={planForm.longTermGoals}
                        onChange={e => setPlanForm({ ...planForm, longTermGoals: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Abordagens e Intervenções Planejadas</label>
                      <textarea
                        rows={2}
                        value={planForm.interventions}
                        onChange={e => setPlanForm({ ...planForm, interventions: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Orientações Familiares e Escolares</label>
                      <textarea
                        rows={2}
                        value={planForm.familyGuidelines}
                        onChange={e => setPlanForm({ ...planForm, familyGuidelines: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveTreatmentPlan}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {saving ? 'Salvando...' : 'Salvar Plano Terapêutico'}
                  </button>
                </div>
              </div>
            )}

            {/* ABA: METAS TERAPÊUTICAS MENSURÁVEIS (LONGITUDINAIS) */}
            {activeTab === 'goals' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                <MeasurableGoalsManager
                  patientId={selectedPatientId}
                  specialty="to"
                />
              </div>
            )}

            {/* ABA: PROGRAMAS DOMICILIARES E ESCOLARES */}
            {activeTab === 'home_program' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                <HomeSchoolProgramManager
                  patientId={selectedPatientId}
                  specialty="to"
                />
              </div>
            )}

            {/* ABA 6: TECNOLOGIA ASSISTIVA & ÓRTESES */}
            {activeTab === 'assistive_tech' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-teal-600" />
                      Tecnologia Assistiva, Adaptações e Órteses
                    </h3>
                    <p className="text-xs text-slate-500">
                      Prescrição, confecção de recursos de acessibilidade e acompanhamento de adaptações.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Recurso / Órtese</label>
                    <input
                      type="text"
                      placeholder="Ex: Órtese de punho termoplástica, engrossador de talher, prancha CAA..."
                      value={assistiveForm.resourceType}
                      onChange={e => setAssistiveForm({ ...assistiveForm, resourceType: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Objetivo Funcional</label>
                    <input
                      type="text"
                      placeholder="Ex: Estabilizar punho para escrita sem dor..."
                      value={assistiveForm.objective}
                      onChange={e => setAssistiveForm({ ...assistiveForm, objective: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Materiais Utilizados</label>
                    <input
                      type="text"
                      placeholder="Ex: Termoplástico de baixa temperatura 3.2mm, velcro, neoprene..."
                      value={assistiveForm.materialsUsed}
                      onChange={e => setAssistiveForm({ ...assistiveForm, materialsUsed: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Acompanhamento e Revisão</label>
                    <input
                      type="text"
                      placeholder="Ex: Avaliar pontos de pressão em 15 dias..."
                      value={assistiveForm.maintenanceFollowup}
                      onChange={e => setAssistiveForm({ ...assistiveForm, maintenanceFollowup: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveAssistiveTech}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    Adicionar Recurso
                  </button>
                </div>

                {/* REGISTRO FOTOGRÁFICO EVOLUTIVO DE RECURSO / ÓRTESE */}
                <div className="border-t border-slate-100 pt-4">
                  <EvolutionPhotoField
                    label="Registro Fotográfico Evolutivo da Órtese / Adaptação (Antes & Depois)"
                    patientId={selectedPatientId}
                    category="assistive_tech"
                    photos={assistivePhotos}
                    onChangePhotos={setAssistivePhotos}
                  />
                </div>

                {/* LISTA DE RECURSOS CADASTRADOS */}
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <h4 className="text-xs font-bold text-slate-800">Recursos Registrados</h4>
                  {assistiveList.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-2">Nenhum recurso cadastrado ainda.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {assistiveList.map(a => (
                        <div key={a.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                          <span className="text-xs font-bold text-teal-900">{a.resource_type}</span>
                          <p className="text-xs text-slate-600">{a.objective}</p>
                          <span className="text-[10px] text-slate-400 block">Materiais: {a.materials_used || 'Não especificado'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ABA 7: FINALIZAR ATENDIMENTO */}
            {activeTab === 'finish' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-teal-600" />
                      Finalizar Atendimento (Gravação Longitudinal no Prontuário)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Grava no prontuário do paciente com módulo ZemdaTO de forma atômica e segura.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsAIReportOpen(true)}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition-all cursor-pointer shadow-xs"
                  >
                    <Sparkles className="w-4 h-4 text-teal-600" />
                    <span>Gerar Relatório com IA</span>
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Título do Atendimento</label>
                  <input
                    type="text"
                    value={consultationTitle}
                    onChange={e => setConsultationTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 font-semibold focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Evolução Clínica e Ocupacional *</label>
                  <textarea
                    rows={4}
                    placeholder="Descreva as atividades realizadas na sessão, desempenho do paciente, respostas sensoriais e nível de engajamento..."
                    value={consultationEvolution}
                    onChange={e => setConsultationEvolution(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Condutas Terapêuticas e Orientações</label>
                  <textarea
                    rows={3}
                    placeholder="Orientações de rotina para os cuidadores, treinos para casa, encaminhamentos e próxima sessão..."
                    value={consultationConducts}
                    onChange={e => setConsultationConducts(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleFinishConsultation}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{saving ? 'Finalizando...' : 'Finalizar Atendimento e Gravar Prontuário'}</span>
                  </button>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* MODAIS AVANÇADOS DE TERAPIA OCUPACIONAL */}
      {selectedPatientId && (
        <>
          <TaskAnalysisModal
            isOpen={isTaskAnalysisOpen}
            onClose={() => setIsTaskAnalysisOpen(false)}
            patientId={selectedPatientId}
            patientName={selectedPatient?.full_name}
          />
          <RoutineMapModal
            isOpen={isRoutineMapOpen}
            onClose={() => setIsRoutineMapOpen(false)}
            patientId={selectedPatientId}
            patientName={selectedPatient?.full_name}
          />
          <OccupationalParticipationModal
            isOpen={isParticipationOpen}
            onClose={() => setIsParticipationOpen(false)}
            patientId={selectedPatientId}
            patientName={selectedPatient?.full_name}
          />
          <TOEvolutionReportModal
            isOpen={isAIReportOpen}
            onClose={() => setIsAIReportOpen(false)}
            patientId={selectedPatientId}
            patientName={selectedPatient?.full_name}
            onInsertIntoConsultation={reportText => {
              setConsultationEvolution(prev => (prev ? `${prev}\n\n${reportText}` : reportText));
              setActiveTab('finish');
            }}
          />
          <EvolutionComparisonModal
            isOpen={isComparisonModalOpen}
            onClose={() => setIsComparisonModalOpen(false)}
            title={comparisonTitle}
            items={comparisonItems}
          />
        </>
      )}
    </div>
  );
};
