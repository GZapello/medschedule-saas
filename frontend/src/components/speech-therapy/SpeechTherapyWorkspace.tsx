import { useConsultationCompletion } from '../clinical/useConsultationCompletion';
import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Volume2,
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
  Sparkles,
  Play,
  Square,
  Ear,
  Smile,
  Target,
  BookOpen,
  MessageSquare,
  Wind,
  Layers,
  Paperclip,
  ExternalLink
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

import { InteractiveAudiogram, AudiogramData } from './InteractiveAudiogram';
import { AudiologyWorkspaceSection } from './audiology/AudiologyWorkspaceSection';
import { FluencyCounterModal } from './FluencyCounterModal';
import { LanguageSampleModal } from './LanguageSampleModal';
import { DysphagiaMatrixModal } from './DysphagiaMatrixModal';
import { AACManagerModal } from './AACManagerModal';
import { FonoEvolutionReportModal } from './FonoEvolutionReportModal';
import { MeasurableGoalsManager } from '../common/MeasurableGoalsManager';
import { HomeSchoolProgramManager } from '../common/HomeSchoolProgramManager';
import { EvolutionComparisonModal } from '../common/EvolutionComparisonModal';
import { FileImageUploader, FileUploadedInfo } from '../common/FileImageUploader';
import { SecureFileImage } from '../common/SecureFileImage';
import { PatientPreviousRecordsModal } from '../clinical/PatientPreviousRecordsModal';

export interface StructuredGoalItem {
  id: string;
  goal: string;
  interventions: string;
  targetPeriod: string;
  status: 'a_iniciar' | 'em_andamento' | 'alcancado';
}

interface SpeechTherapyWorkspaceProps {
  initialPatientId?: string;
  initialAppointmentId?: string;
  onFinishConsultation?: () => void;
}

export const SpeechTherapyWorkspace: React.FC<SpeechTherapyWorkspaceProps> = ({
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

  // Switcher de Área da Fonoaudiologia
  const [practiceArea, setPracticeArea] = useState<
    'fala_fonologia' | 'linguagem' | 'audiologia' | 'motricidade_orofacial' | 'voz' | 'disfagia' | 'fluencia' | 'educacional'
  >('fala_fonologia');

  // Modais Especializados de ZemdaFono
  const [isFluencyModalOpen, setIsFluencyModalOpen] = useState(false);
  const [isLanguageSampleModalOpen, setIsLanguageSampleModalOpen] = useState(false);
  const [isDysphagiaModalOpen, setIsDysphagiaModalOpen] = useState(false);
  const [isAACModalOpen, setIsAACModalOpen] = useState(false);
  const [isAIReportOpen, setIsAIReportOpen] = useState(false);
  const [isComparisonModalOpen, setIsComparisonModalOpen] = useState(false);
  const [comparisonItems, setComparisonItems] = useState<any[]>([]);
  const [comparisonTitle, setComparisonTitle] = useState('Comparativo de Reavaliação Fonoaudiológica');
  const [showPreviousRecordsModal, setShowPreviousRecordsModal] = useState(false);

  // Dados do Audiograma Interativo (inicializado totalmente vazio conforme Guia CFFa 2023)
  const [audiogramData, setAudiogramData] = useState<AudiogramData>({
    rightAir: {},
    leftAir: {},
    rightBone: {},
    leftBone: {}
  });

  // Abas do Módulo ZemdaFono
  const [activeTab, setActiveTab] = useState<
    | 'phonemes'
    | 'language'
    | 'audiology'
    | 'fluency'
    | 'dysphagia'
    | 'orofacial'
    | 'voice'
    | 'aac'
    | 'goals'
    | 'home_program'
    | 'treatment_plans'
    | 'complementary'
    | 'finish'
  >('phonemes');

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // 1. Anamnese Fonoaudiológica
  const [anamnesisData, setAnamnesisData] = useState<any>({
    speechDevelopmentMilestones: '',
    parafunctionalHabits: '',
    feedingHistory: '',
    hearingComplaints: '',
    schoolPerformance: '',
    communicationComplaint: '',
    notes: ''
  });

  // 2. Avaliação de Linguagem
  const [languageData, setLanguageData] = useState<any>({
    comprehensiveLanguage: 'Adequada para a faixa etária',
    expressiveLanguage: 'Vocabulário e estruturação frasal adequados',
    pragmatics: 'Contato visual e turnos comunicativos preservados',
    semantics: 'Compreensão de conceitos espaciais, temporais e categorias semânticas',
    morphosyntax: 'Concordância nominal e verbal estruturada',
    narrativeDiscourse: 'Sequência lógica com início, meio e desfecho',
    readingWriting: '',
    notes: ''
  });

  // 3. Painel Fonêmico Interativo
  // Fonemas do Português: /p/, /b/, /t/, /d/, /k/, /g/, /f/, /v/, /s/, /z/, /ʃ/, /ʒ/, /m/, /n/, /ɲ/, /l/, /ʎ/, /r/, /ɾ/, encontros (/pl/, /pr/, /tr/ etc.)
  const DEFAULT_PHONEMES = [
    { phoneme: '/p/', example: 'Pato / Sopa', initial: 'correct', medial: 'correct', final: 'not_applicable', target: '' },
    { phoneme: '/b/', example: 'Bola / Cabelo', initial: 'correct', medial: 'correct', final: 'not_applicable', target: '' },
    { phoneme: '/t/', example: 'Tatu / Bota', initial: 'correct', medial: 'correct', final: 'not_applicable', target: '' },
    { phoneme: '/d/', example: 'Dado / Roda', initial: 'correct', medial: 'correct', final: 'not_applicable', target: '' },
    { phoneme: '/k/', example: 'Casa / Boca', initial: 'correct', medial: 'correct', final: 'not_applicable', target: '' },
    { phoneme: '/g/', example: 'Gato / Fogo', initial: 'correct', medial: 'correct', final: 'not_applicable', target: '' },
    { phoneme: '/f/', example: 'Faca / Café', initial: 'correct', medial: 'correct', final: 'not_applicable', target: '' },
    { phoneme: '/v/', example: 'Vaca / Uva', initial: 'correct', medial: 'correct', final: 'not_applicable', target: '' },
    { phoneme: '/s/', example: 'Sapo / Passarinho / Lápis', initial: 'correct', medial: 'correct', final: 'correct', target: '' },
    { phoneme: '/z/', example: 'Zebra / Mesa / Nariz', initial: 'correct', medial: 'correct', final: 'correct', target: '' },
    { phoneme: '/ʃ/ (ch/x)', example: 'Chave / Peixe', initial: 'correct', medial: 'correct', final: 'not_applicable', target: '' },
    { phoneme: '/ʒ/ (j/g)', example: 'Jacaré / Coruja', initial: 'correct', medial: 'correct', final: 'not_applicable', target: '' },
    { phoneme: '/m/', example: 'Mala / Cama', initial: 'correct', medial: 'correct', final: 'not_applicable', target: '' },
    { phoneme: '/n/', example: 'Navio / Caneta', initial: 'correct', medial: 'correct', final: 'not_applicable', target: '' },
    { phoneme: '/ɲ/ (nh)', example: 'Galinha', initial: 'not_applicable', medial: 'correct', final: 'not_applicable', target: '' },
    { phoneme: '/l/', example: 'Lata / Bola / Sol', initial: 'correct', medial: 'correct', final: 'correct', target: '' },
    { phoneme: '/ʎ/ (lh)', example: 'Palhaço', initial: 'not_applicable', medial: 'correct', final: 'not_applicable', target: '' },
    { phoneme: '/ɾ/ (r brando)', example: 'Arara / Porta', initial: 'not_applicable', medial: 'correct', final: 'correct', target: '' },
    { phoneme: '/r/ (r forte)', example: 'Rato / Carro', initial: 'correct', medial: 'correct', final: 'not_applicable', target: '' },
    { phoneme: 'Encontros com L (pl, cl, bl)', example: 'Placa, Flor, Blusa', initial: 'correct', medial: 'correct', final: 'not_applicable', target: '' },
    { phoneme: 'Encontros com R (pr, tr, br)', example: 'Prato, Trem, Braço', initial: 'correct', medial: 'correct', final: 'not_applicable', target: '' }
  ];
  const [phonemesList, setPhonemesList] = useState<any[]>(DEFAULT_PHONEMES);

  // 4. Motricidade Orofacial
  const [orofacialData, setOrofacialData] = useState<any>({
    lips: 'Adequados em repouso e vedamento labial competente',
    tongue: 'Posicionamento em papila palatina, frênulo lingual normal',
    cheeks: 'Tônus simétrico e sem acúmulo de alimento',
    hardSoftPalate: 'Palato duro e úvula sem fissuras ou alterações',
    mandibleOcclusion: 'Normoclusão (Classe I de Angle)',
    breathingMode: 'nasal', // nasal, mouth, mixed
    chewingPattern: 'bilateral_alternated', // bilateral_alternated, unilateral_right, unilateral_left
    swallowingPattern: 'typical', // typical, atypical, adapted
    notes: ''
  });

  // 5. Avaliação da Voz & Gravador de Áudio
  const [voiceData, setVoiceData] = useState<any>({
    degreeOfDeviation: '0', // 0 a 3
    roughness: '0',
    breathiness: '0',
    asthenia: '0',
    strain: '0',
    instability: '0',
    pitch: 'adequado', // adequado, agudo, grave
    loudness: 'adequada', // adequada, baixa, excessiva
    tmfSSeconds: '16',
    tmfZSeconds: '16',
    audioUrl: '',
    notes: ''
  });
  const [isRecordingAudio, setIsRecordingAudio] = useState<boolean>(false);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // 6. Fluência da Fala
  const [fluencyData, setFluencyData] = useState<any>({
    wordsPerMinute: '120',
    typicalDisfluencies: 'Hesitações e interjeições ocasionais',
    atypicalDisfluencies: 'Ausência de bloqueios ou prolongamentos patológicos',
    physicalTension: 'Nenhuma tensão facial ou esforço associado observado',
    diagnosisFluency: 'Fluência típica para a idade',
    notes: ''
  });

  // 7. Disfagia e Alimentação Funcional
  const [dysphagiaData, setDysphagiaData] = useState<any>({
    testedConsistencies: {
      thinLiquid: true,
      nectar: true,
      honey: false,
      pudding: true,
      solid: true
    },
    penetrationAspirationSigns: {
      cough: false,
      choking: false,
      throatClearing: false,
      wetVoice: false,
      cyanosis: false
    },
    compensatoryManeuvers: 'Nenhuma necessária no momento',
    dietaryConsistencyPrescribed: 'Livre / Geral',
    notes: ''
  });

  // 8. Audiologia (campos clínicos iniciados vazios conforme Guia CFFa 2023)
  const [audiologyData, setAudiologyData] = useState<any>({
    pureToneAudiometryRight: '',
    pureToneAudiometryLeft: '',
    speechAudiometry: '',
    tympanometry: '',
    acousticReflexes: '',
    otoacousticEmissions: '',
    auditoryProcessingNotes: ''
  });
  const [currentAudiologyRecordId, setCurrentAudiologyRecordId] = useState<string | null>(null);
  const [audiologyList, setAudiologyList] = useState<any[]>([]);

  // 9. Plano Terapêutico Fonoaudiológico
  const [treatmentPlans, setTreatmentPlans] = useState<any[]>([]);
  const [planForm, setPlanForm] = useState({
    title: 'Plano Terapêutico Fonoaudiológico Individualizado',
    goals: 'Instalação e automatização do fonema /r/ brando em fala espontânea e treino miofuncional de vedamento labial.',
    strategies: 'Bombardeio auditivo, pistas proprioceptivas táteis e espelho, jogos de pareamento fonológico.',
    homeSchoolGuidance: 'Não interromper a fala da criança; valorizar a comunicação espontânea e repetir com o modelo correto sem cobrar perfeição imediata.',
    frequencySessions: '1 a 2 vezes por semana, duração de 45 minutos'
  });
  const [planReferredBy, setPlanReferredBy] = useState<string>('');
  const [structuredGoals, setStructuredGoals] = useState<StructuredGoalItem[]>([
    {
      id: 'g-1',
      goal: 'Instalação e automatização do fonema /r/ brando em fala espontânea',
      interventions: 'Bombardeio auditivo com fones, discriminação com pares mínimos e modelagem proprioceptiva.',
      targetPeriod: '12 sessões',
      status: 'em_andamento'
    },
    {
      id: 'g-2',
      goal: 'Adequação de vedamento labial e tônus orbicular em repouso',
      interventions: 'Exercícios miofuncionais com botão, contra-resistência de espátula e treino mastigatório bilateral.',
      targetPeriod: '8 sessões',
      status: 'em_andamento'
    }
  ]);

  // Testes Complementares & Anexos
  const [complementaryTests, setComplementaryTests] = useState<any[]>([]);
  const [loadingCompTests, setLoadingCompTests] = useState<boolean>(false);
  const [showNewCompTestModal, setShowNewCompTestModal] = useState<boolean>(false);
  const [compForm, setCompForm] = useState({
    testName: '',
    testDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
    referredBy: '',
    resultScore: '',
    notes: '',
    attachmentUrl: '',
    attachmentName: ''
  });

  // Campos específicos de Fala & Fonologia
  const [speechReferredBy, setSpeechReferredBy] = useState<string>('');
  const [coarticulationBreakdown, setCoarticulationBreakdown] = useState<string>('Ausente (coarticulação fluida)');

  // 10. Finalização da Consulta
  const [consultationTitle, setConsultationTitle] = useState<string>('Consulta Fonoaudiológica');
  const [consultationEvolution, setConsultationEvolution] = useState<string>('');
  const [consultationConducts, setConsultationConducts] = useState<string>('');

  // Relação s/z calculada
  const calculatedSzRatio = React.useMemo(() => {
    const s = parseFloat(voiceData.tmfSSeconds);
    const z = parseFloat(voiceData.tmfZSeconds);
    if (!s || !z || z <= 0) return null;
    return Math.round((s / z) * 100) / 100;
  }, [voiceData.tmfSSeconds, voiceData.tmfZSeconds]);

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

  // Carrega dados fonoaudiológicos
  const loadPatientData = async (patId: string) => {
    try {
      setLoading(true);
      const [anaRes, langRes, phonRes, oroRes, voiRes, fluRes, dysRes, audRes, planRes, compRes] = await Promise.allSettled([
        ApiClient.get<any>(`/v1/speech-therapy/anamnesis/${patId}`),
        ApiClient.get<any>(`/v1/speech-therapy/language/${patId}`),
        ApiClient.get<any>(`/v1/speech-therapy/phonemes/${patId}`),
        ApiClient.get<any>(`/v1/speech-therapy/orofacial/${patId}`),
        ApiClient.get<any>(`/v1/speech-therapy/voice/${patId}`),
        ApiClient.get<any>(`/v1/speech-therapy/fluency/${patId}`),
        ApiClient.get<any>(`/v1/speech-therapy/dysphagia/${patId}`),
        ApiClient.get<any[]>(`/v1/speech-therapy/audiology/${patId}`),
        ApiClient.get<any[]>(`/v1/speech-therapy/treatment-plans/${patId}`),
        ApiClient.get<any[]>(`/v1/speech-therapy/complementary-tests/${patId}`)
      ]);

      if (anaRes.status === 'fulfilled' && anaRes.value && anaRes.value.data) setAnamnesisData(anaRes.value.data);
      if (langRes.status === 'fulfilled' && langRes.value && langRes.value.data) setLanguageData(langRes.value.data);
      if (phonRes.status === 'fulfilled' && phonRes.value) {
        if (Array.isArray(phonRes.value.phonemes)) setPhonemesList(phonRes.value.phonemes);
        if (phonRes.value.referredBy) setSpeechReferredBy(phonRes.value.referredBy);
        if (phonRes.value.coarticulationBreakdown) setCoarticulationBreakdown(phonRes.value.coarticulationBreakdown);
      }
      if (oroRes.status === 'fulfilled' && oroRes.value && oroRes.value.data) setOrofacialData(oroRes.value.data);
      if (voiRes.status === 'fulfilled' && voiRes.value && voiRes.value.data) setVoiceData(voiRes.value.data);
      if (fluRes.status === 'fulfilled' && fluRes.value && fluRes.value.data) setFluencyData(fluRes.value.data);
      if (dysRes.status === 'fulfilled' && dysRes.value && dysRes.value.data) setDysphagiaData(dysRes.value.data);
      if (audRes.status === 'fulfilled' && Array.isArray(audRes.value)) setAudiologyList(audRes.value);
      if (planRes.status === 'fulfilled' && Array.isArray(planRes.value)) {
        setTreatmentPlans(planRes.value);
        const latestPlan = planRes.value[0];
        if (latestPlan) {
          if (latestPlan.referredBy) setPlanReferredBy(latestPlan.referredBy);
          if (Array.isArray(latestPlan.goalsStructured) && latestPlan.goalsStructured.length > 0) {
            setStructuredGoals(latestPlan.goalsStructured);
          }
        }
      }
      if (compRes.status === 'fulfilled' && Array.isArray(compRes.value)) {
        setComplementaryTests(compRes.value);
      }
    } catch (err) {
      console.warn('Erro ao carregar dados fonoaudiológicos:', err);
    } finally {
      setLoading(false);
    }
  };

  // Funções de Gravação de Áudio Vocal
  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => setAudioBlobUrl(String(reader.result));
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
        showToast('Amostra de voz gravada com sucesso!', 'success');
      };

      mediaRecorder.start();
      setIsRecordingAudio(true);
    } catch (err) {
      showToast('Permissão de microfone negada ou indisponível', 'error');
    }
  };

  const stopAudioRecording = () => {
    if (mediaRecorderRef.current && isRecordingAudio) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      setIsRecordingAudio(false);
    }
  };

  // Salva Painel de Fonemas
  const handleSavePhonemes = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente', 'info');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/speech-therapy/phonemes', {
        patientId: selectedPatientId,
        phonemes: phonemesList,
        referredBy: speechReferredBy || null,
        coarticulationBreakdown: coarticulationBreakdown || null
      });
      showToast('Mapeamento fonêmico salvo com sucesso!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar fonemas', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Salva Avaliação da Voz
  const handleSaveVoice = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente', 'info');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/speech-therapy/voice', {
        patientId: selectedPatientId,
        data: voiceData
      });
      showToast('Avaliação vocal salva com sucesso!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar avaliação vocal', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Salva Motricidade Orofacial
  const handleSaveOrofacial = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente', 'info');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/speech-therapy/orofacial', {
        patientId: selectedPatientId,
        data: orofacialData
      });
      showToast('Avaliação miofuncional orofacial salva com sucesso!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar avaliação orofacial', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Salva Plano Terapêutico Fonoaudiológico com Múltiplos Objetivos e Intervenções
  const handleSaveTreatmentPlan = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente', 'info');
      return;
    }
    try {
      setSaving(true);
      const goalsSummary = structuredGoals.map(g => `${g.goal} (${g.status})`).join('; ');
      const strategiesSummary = structuredGoals.map(g => g.interventions).filter(Boolean).join(' | ');

      await ApiClient.post('/v1/speech-therapy/treatment-plans', {
        patientId: selectedPatientId,
        title: planForm.title,
        goals: goalsSummary || planForm.goals,
        strategies: strategiesSummary || planForm.strategies,
        homeSchoolGuidance: planForm.homeSchoolGuidance,
        frequencySessions: planForm.frequencySessions,
        referredBy: planReferredBy || null,
        goalsStructured: structuredGoals
      });

      showToast('Plano Terapêutico Fonoaudiológico salvo com sucesso!', 'success');
      const refreshedPlans = await ApiClient.get<any[]>(`/v1/speech-therapy/treatment-plans/${selectedPatientId}`);
      if (Array.isArray(refreshedPlans)) setTreatmentPlans(refreshedPlans);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar plano terapêutico', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Salvar Teste Complementar Fonoaudiológico
  const handleSaveComplementaryTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) {
      showToast('Selecione um paciente', 'info');
      return;
    }
    if (!compForm.testName.trim()) {
      showToast('Informe o nome do teste complementar', 'info');
      return;
    }

    try {
      setSaving(true);
      await ApiClient.post('/v1/speech-therapy/complementary-tests', {
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId || null,
        testName: compForm.testName,
        testDate: compForm.testDate,
        referredBy: compForm.referredBy || null,
        resultScore: compForm.resultScore || null,
        notes: compForm.notes || null,
        attachmentUrl: compForm.attachmentUrl || null,
        attachmentName: compForm.attachmentName || null
      });

      showToast('Teste complementar registrado com sucesso!', 'success');
      setCompForm({
        testName: '',
        testDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
        referredBy: '',
        resultScore: '',
        notes: '',
        attachmentUrl: '',
        attachmentName: ''
      });
      setShowNewCompTestModal(false);

      const refreshed = await ApiClient.get<any[]>(`/v1/speech-therapy/complementary-tests/${selectedPatientId}`);
      if (Array.isArray(refreshed)) setComplementaryTests(refreshed);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar teste complementar', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Remover Teste Complementar
  const handleDeleteComplementaryTest = async (id: string) => {
    if (!window.confirm('Deseja remover este teste complementar?')) return;
    try {
      await ApiClient.delete(`/v1/speech-therapy/complementary-tests/${id}`);
      setComplementaryTests(prev => prev.filter(t => t.id !== id));
      showToast('Teste complementar removido', 'info');
    } catch (err: any) {
      showToast('Erro ao remover teste complementar', 'error');
    }
  };

  // Finalizar Consulta de Fono de Forma Atômica
  const handleFinishConsultation = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente para finalizar o atendimento', 'info');
      return;
    }
    if (!consultationEvolution.trim()) {
      showToast('Por favor, informe a evolução clínica e conduta fonoaudiológica', 'info');
      return;
    }

    try {
      setSaving(true);
      await completion.save('/v1/speech-therapy/consultations/finish', {
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId || null,
        title: consultationTitle,
        clinicalEvolution: consultationEvolution,
        conducts: consultationConducts || undefined,
        isSealed: true,
        anamnesisData,
        languageData,
        phonemesData: {
          phonemes: phonemesList,
          referredBy: speechReferredBy || undefined,
          coarticulationBreakdown: coarticulationBreakdown || undefined
        },
        orofacialData,
        voiceData,
        fluencyData,
        treatmentPlanData: {
          ...planForm,
          referredBy: planReferredBy || undefined,
          goalsStructured: structuredGoals
        },
        dysphagiaData,
        audiologyData,
        audiologyRecordId: currentAudiologyRecordId || undefined,
        audioData: audioBlobUrl
      });
    } catch (err: any) {
      showToast(err.message || 'Erro ao finalizar atendimento de Fono', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800">
      {completion.dialog}
      {/* CABEÇALHO DO MÓDULO ZEMDAFONO */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 text-white flex items-center justify-center shadow-md shadow-sky-500/20">
            <Mic className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-800">ZemdaFono</h1>
              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
                Fonoaudiologia Especializada
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Painel fonêmico interativo, avaliação vocal com áudio, motricidade orofacial, audiologia e prontuário integrado.
            </p>
          </div>
        </div>

        {/* CONTROLES DO CABEÇALHO: ÁREA DE ATUAÇÃO E SELETOR DE PACIENTE */}
        <div className="flex flex-wrap items-center gap-3">
          {/* SWITCHER DE ÁREA DA FONOAUDIOLOGIA */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[10px] font-extrabold uppercase text-slate-400">Área:</span>
            <select
              value={practiceArea}
              onChange={e => setPracticeArea(e.target.value as any)}
              className="text-xs font-bold text-sky-900 bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="fala_fonologia">Fala e Fonologia Clínica</option>
              <option value="linguagem">Linguagem Infantil / Adulto / TEA</option>
              <option value="audiologia">Audiologia Clínica e PAC</option>
              <option value="motricidade_orofacial">Motricidade Orofacial</option>
              <option value="voz">Voz Clínica e Canto</option>
              <option value="disfagia">Disfagia Orofaríngea e IDDSI</option>
              <option value="fluencia">Fluência e Gagueira</option>
              <option value="educacional">Fonoaudiologia Educacional / Escrita</option>
            </select>
          </div>

          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedPatientId}
              disabled={!!initialAppointmentId}
              onChange={e => setSelectedPatientId(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-sky-500 focus:outline-none transition-colors cursor-pointer"
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
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-sky-50 border border-sky-200 rounded-xl text-xs font-semibold text-sky-900">
              <User className="w-3.5 h-3.5 text-sky-600" />
              <span>{selectedPatient.full_name}</span>
            </div>
          )}

          {selectedPatientId && (
            <>
              <button
                type="button"
                onClick={() => setShowPreviousRecordsModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 shadow-xs transition-all cursor-pointer whitespace-nowrap"
                title="Visualizar histórico de prontuários anteriores deste paciente"
              >
                <FileText className="w-3.5 h-3.5 text-sky-600" />
                <span>Ver Prontuários Anteriores</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('finish')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-md shadow-emerald-500/25 transition-all cursor-pointer whitespace-nowrap"
              >
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span>Finalizar Atendimento</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ABAS DE NAVEGAÇÃO E AÇÕES RÁPIDAS */}
      <div className="bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
          {[
            { id: 'phonemes', label: 'Painel Fonêmico', icon: MessageSquare },
            { id: 'language', label: 'Linguagem', icon: BookOpen },
            { id: 'audiology', label: 'Audiologia & Audiograma', icon: Ear },
            { id: 'fluency', label: 'Fluência da Fala', icon: Wind },
            { id: 'dysphagia', label: 'Disfagia & IDDSI', icon: Activity },
            { id: 'orofacial', label: 'Motricidade Orofacial', icon: Smile },
            { id: 'voice', label: 'Voz & Áudio', icon: Volume2 },
            { id: 'aac', label: 'Comunicação CAA', icon: Layers },
            { id: 'goals', label: 'Metas Mensuráveis', icon: Target },
            { id: 'home_program', label: 'Casa & Escola', icon: BookOpen },
            { id: 'treatment_plans', label: 'Plano Terapêutico', icon: Target },
            { id: 'complementary', label: 'Testes Complementares', icon: FileText },
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
                    ? 'border-sky-600 text-sky-700 bg-sky-50/50'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-sky-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* FERRAMENTAS CLÍNICAS RÁPIDAS DE FONOAUDIOLOGIA */}
        {selectedPatientId && (
          <div className="hidden xl:flex items-center gap-1.5 shrink-0 pl-3">
            <button
              type="button"
              onClick={() => setIsFluencyModalOpen(true)}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-200 hover:border-sky-300 text-slate-700 bg-slate-50 hover:bg-white transition-colors cursor-pointer"
            >
              Contador de Fluência
            </button>
            <button
              type="button"
              onClick={() => setIsLanguageSampleModalOpen(true)}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-200 hover:border-sky-300 text-slate-700 bg-slate-50 hover:bg-white transition-colors cursor-pointer"
            >
              Amostra Linguagem
            </button>
            <button
              type="button"
              onClick={() => setIsDysphagiaModalOpen(true)}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-200 hover:border-sky-300 text-slate-700 bg-slate-50 hover:bg-white transition-colors cursor-pointer"
            >
              Matriz Disfagia
            </button>
            <button
              type="button"
              onClick={() => setIsAACModalOpen(true)}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-200 hover:border-sky-300 text-slate-700 bg-slate-50 hover:bg-white transition-colors cursor-pointer"
            >
              Gestor CAA
            </button>
            <button
              type="button"
              onClick={() => setIsAIReportOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3 h-3 text-sky-600" />
              Relatório IA
            </button>
          </div>
        )}
      </div>

      {/* CONTEÚDO PRINCIPAL */}
      <div className="flex-1 p-6 overflow-y-auto">
        {!selectedPatientId ? (
          <div className="flex flex-col items-center justify-center h-64 text-center bg-white rounded-2xl border border-slate-200 p-8">
            <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mb-3">
              <Mic className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Selecione um Paciente</h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              Escolha um paciente no menu superior para visualizar o painel fonêmico, avaliações vocais e condutas fonoaudiológicas.
            </p>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-6">

            {/* ABA 1: PAINEL FONÊMICO INTERATIVO */}
            {activeTab === 'phonemes' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-sky-600" />
                      Mapeamento Fonético-Fonológico Interativo
                    </h3>
                    <p className="text-xs text-slate-500">
                      Avaliação de produção fonêmica nas posições de Onset Inicial, Medial e Coda Final.
                    </p>
                  </div>
                </div>

                {/* LEGENDA DE STATUS FONÊMICO */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                    Correto (Produção Típica)
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-red-100 text-red-800 font-bold border border-red-200">
                    Omissão (Não Produz)
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 font-bold border border-amber-200">
                    Substituição (Troca de Fonema)
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-purple-100 text-purple-800 font-bold border border-purple-200">
                    Distorção (Ceceio / Interdentalização)
                  </span>
                </div>

                {/* ENCAMINHADO POR E QUEBRA DE COARTICULAÇÃO */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Encaminhado por (opcional):</label>
                    <input
                      type="text"
                      placeholder="Ex: Pediatra Dr. Carlos, Neurologista, Escola..."
                      value={speechReferredBy}
                      onChange={e => setSpeechReferredBy(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:border-sky-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Quebra de Coarticulação:</label>
                    <select
                      value={coarticulationBreakdown}
                      onChange={e => setCoarticulationBreakdown(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 focus:border-sky-500 focus:outline-none"
                    >
                      <option value="Ausente (coarticulação fluida)">Ausente (coarticulação fluida entre sílabas e palavras)</option>
                      <option value="Leve em encontros consonantais">Leve (quebras pontuais em encontros consonantais / clusters)</option>
                      <option value="Moderada em polissílabos">Moderada (dificuldade em transições silábicas e polissílabos)</option>
                      <option value="Severa na fala encadeada">Severa (produção silábica isolada / quebra sistemática na fala encadeada)</option>
                      <option value="Presente com esforço articulatório">Presente com esforço articulatório / tateio fonético</option>
                    </select>
                  </div>
                </div>

                {/* TABELA DE FONEMAS */}
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Fonema</th>
                        <th className="py-2.5 px-3">Exemplo Palavra</th>
                        <th className="py-2.5 px-3">Posição Inicial</th>
                        <th className="py-2.5 px-3">Posição Medial</th>
                        <th className="py-2.5 px-3">Posição Final</th>
                        <th className="py-2.5 px-3">Fone Produzido / Observação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {phonemesList.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-3 font-extrabold text-sky-800 text-sm">{item.phoneme}</td>
                          <td className="py-2.5 px-3 text-slate-500">{item.example}</td>

                          {/* INICIAL */}
                          <td className="py-2 px-3">
                            {item.initial === 'not_applicable' ? (
                              <span className="text-slate-300">-</span>
                            ) : (
                              <select
                                value={item.initial}
                                onChange={e => {
                                  const updated = [...phonemesList];
                                  updated[idx].initial = e.target.value;
                                  setPhonemesList(updated);
                                }}
                                className={`px-2 py-1 rounded-lg text-xs font-bold border ${
                                  item.initial === 'correct'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : item.initial === 'omission'
                                    ? 'bg-red-50 text-red-800 border-red-200'
                                    : item.initial === 'substitution'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-purple-50 text-purple-800 border-purple-200'
                                }`}
                              >
                                <option value="correct">Correto</option>
                                <option value="omission">Omissão</option>
                                <option value="substitution">Substituição</option>
                                <option value="distortion">Distorção</option>
                              </select>
                            )}
                          </td>

                          {/* MEDIAL */}
                          <td className="py-2 px-3">
                            {item.medial === 'not_applicable' ? (
                              <span className="text-slate-300">-</span>
                            ) : (
                              <select
                                value={item.medial}
                                onChange={e => {
                                  const updated = [...phonemesList];
                                  updated[idx].medial = e.target.value;
                                  setPhonemesList(updated);
                                }}
                                className={`px-2 py-1 rounded-lg text-xs font-bold border ${
                                  item.medial === 'correct'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : item.medial === 'omission'
                                    ? 'bg-red-50 text-red-800 border-red-200'
                                    : item.medial === 'substitution'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-purple-50 text-purple-800 border-purple-200'
                                }`}
                              >
                                <option value="correct">Correto</option>
                                <option value="omission">Omissão</option>
                                <option value="substitution">Substituição</option>
                                <option value="distortion">Distorção</option>
                              </select>
                            )}
                          </td>

                          {/* FINAL */}
                          <td className="py-2 px-3">
                            {item.final === 'not_applicable' ? (
                              <span className="text-slate-300">-</span>
                            ) : (
                              <select
                                value={item.final}
                                onChange={e => {
                                  const updated = [...phonemesList];
                                  updated[idx].final = e.target.value;
                                  setPhonemesList(updated);
                                }}
                                className={`px-2 py-1 rounded-lg text-xs font-bold border ${
                                  item.final === 'correct'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : item.final === 'omission'
                                    ? 'bg-red-50 text-red-800 border-red-200'
                                    : item.final === 'substitution'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-purple-50 text-purple-800 border-purple-200'
                                }`}
                              >
                                <option value="correct">Correto</option>
                                <option value="omission">Omissão</option>
                                <option value="substitution">Substituição</option>
                                <option value="distortion">Distorção</option>
                              </select>
                            )}
                          </td>

                          {/* ANOTAÇÃO / FONE SUBSTITUTO */}
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              placeholder="Ex: substitui por [t]..."
                              value={item.target || ''}
                              onChange={e => {
                                const updated = [...phonemesList];
                                updated[idx].target = e.target.value;
                                setPhonemesList(updated);
                              }}
                              className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSavePhonemes}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {saving ? 'Salvando...' : 'Salvar Mapeamento Fonêmico'}
                  </button>
                </div>
              </div>
            )}

            {/* ABA 2: VOZ & AMOSTRA DE ÁUDIO */}
            {activeTab === 'voice' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-sky-600" />
                      Avaliação Perceptivo-Auditiva da Voz & Gravador Integrado
                    </h3>
                    <p className="text-xs text-slate-500">
                      Escala GRBASI / RASATI, tempo máximo de fonação (relação s/z) e gravação de áudio para comparação.
                    </p>
                  </div>
                </div>

                {/* GRAVADOR DE AMOSTRA DE VOZ */}
                <div className="p-4 bg-gradient-to-r from-sky-50 to-blue-50/50 border border-sky-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-bold text-sky-900 flex items-center gap-2">
                      <Mic className="w-4 h-4 text-sky-600" />
                      Amostra Vocal do Paciente (Vogal sustentada /a/ ou fala espontânea)
                    </span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Grave a emissão do paciente para documentar no prontuário e comparar a evolução vocal.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {!isRecordingAudio ? (
                      <button
                        type="button"
                        onClick={startAudioRecording}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-sm cursor-pointer"
                      >
                        <Mic className="w-3.5 h-3.5" />
                        Gravar Amostra
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={stopAudioRecording}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-black shadow-sm cursor-pointer animate-pulse"
                      >
                        <Square className="w-3.5 h-3.5 text-red-400" />
                        Parar Gravação
                      </button>
                    )}

                    {audioBlobUrl && (
                      <audio controls src={audioBlobUrl} className="h-8 max-w-[220px]" />
                    )}
                  </div>
                </div>

                {/* ESCALA RASATI */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { key: 'degreeOfDeviation', label: 'Grau Global (G)' },
                    { key: 'roughness', label: 'Rugosidade (R)' },
                    { key: 'breathiness', label: 'Soprosidade (S)' },
                    { key: 'asthenia', label: 'Astenia (A)' },
                    { key: 'strain', label: 'Tensão (T)' },
                    { key: 'instability', label: 'Instabilidade (I)' }
                  ].map(param => (
                    <div key={param.key} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-center">
                      <span className="text-xs font-bold text-slate-700">{param.label}</span>
                      <select
                        value={voiceData[param.key]}
                        onChange={e => setVoiceData({ ...voiceData, [param.key]: e.target.value })}
                        className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg text-center font-bold"
                      >
                        <option value="0">0 - Neutro / Sem desvio</option>
                        <option value="1">1 - Leve</option>
                        <option value="2">2 - Moderado</option>
                        <option value="3">3 - Severo / Extremo</option>
                      </select>
                    </div>
                  ))}
                </div>

                {/* TEMPO MÁXIMO DE FONAÇÃO (TMF) E RELAÇÃO S/Z */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">TMF /s/ (segundos)</label>
                    <input
                      type="number"
                      value={voiceData.tmfSSeconds}
                      onChange={e => setVoiceData({ ...voiceData, tmfSSeconds: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">TMF /z/ (segundos)</label>
                    <input
                      type="number"
                      value={voiceData.tmfZSeconds}
                      onChange={e => setVoiceData({ ...voiceData, tmfZSeconds: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Relação s/z Calculada</label>
                    <div className="px-3 py-2 text-xs rounded-xl border border-sky-200 bg-sky-50 font-extrabold text-sky-800 flex items-center justify-between">
                      <span>{calculatedSzRatio || '-'}</span>
                      <span className="text-[10px] font-normal text-slate-500">
                        {calculatedSzRatio && calculatedSzRatio > 1.2 ? 'Sugere fenda glótica' : 'Padrão normal (0.8 - 1.2)'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveVoice}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {saving ? 'Salvando...' : 'Salvar Avaliação Vocal'}
                  </button>
                </div>
              </div>
            )}

            {/* ABA 3: MOTRICIDADE OROFACIAL */}
            {activeTab === 'orofacial' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Smile className="w-4 h-4 text-sky-600" />
                      Avaliação Miofuncional Orofacial (MBGR Simplificado)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Postura, morfologia e tônus das estruturas orofaciais e funções estomatognáticas.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Lábios (Morfologia, Vedamento e Tônus)</label>
                    <input
                      type="text"
                      value={orofacialData.lips}
                      onChange={e => setOrofacialData({ ...orofacialData, lips: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Língua (Postura em repouso e frênulo)</label>
                    <input
                      type="text"
                      value={orofacialData.tongue}
                      onChange={e => setOrofacialData({ ...orofacialData, tongue: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Modo Respiratório</label>
                    <select
                      value={orofacialData.breathingMode}
                      onChange={e => setOrofacialData({ ...orofacialData, breathingMode: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    >
                      <option value="nasal">Nasal competente</option>
                      <option value="mouth">Oral crônico (respiração bucal)</option>
                      <option value="mixed">Oronasal / Misto</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Padrão de Deglutição</label>
                    <select
                      value={orofacialData.swallowingPattern}
                      onChange={e => setOrofacialData({ ...orofacialData, swallowingPattern: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    >
                      <option value="typical">Deglutição Típica</option>
                      <option value="atypical">Deglutição Atípica (com interposição de língua)</option>
                      <option value="adapted">Deglutição Adaptada (por má oclusão dental)</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveOrofacial}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {saving ? 'Salvando...' : 'Salvar Avaliação Orofacial'}
                  </button>
                </div>
              </div>
            )}

            {/* ABA 4: AVALIAÇÃO DE LINGUAGEM */}
            {activeTab === 'language' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-sky-600" />
                      Avaliação Completa de Linguagem
                    </h3>
                    <p className="text-xs text-slate-500">
                      Níveis compreensivo, expressivo, pragmático e discurso narrativo.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsLanguageSampleModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-xl border border-sky-200 transition-colors cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-sky-600" />
                    <span>Analisar Amostra (TTR & MLU)</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Linguagem Compreensiva</label>
                    <textarea
                      rows={2}
                      value={languageData.comprehensiveLanguage}
                      onChange={e => setLanguageData({ ...languageData, comprehensiveLanguage: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Linguagem Expressiva</label>
                    <textarea
                      rows={2}
                      value={languageData.expressiveLanguage}
                      onChange={e => setLanguageData({ ...languageData, expressiveLanguage: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Pragmática (Uso Social da Comunicação)</label>
                    <textarea
                      rows={2}
                      value={languageData.pragmatics}
                      onChange={e => setLanguageData({ ...languageData, pragmatics: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Discurso Narrativo</label>
                    <textarea
                      rows={2}
                      value={languageData.narrativeDiscourse}
                      onChange={e => setLanguageData({ ...languageData, narrativeDiscourse: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ABA 5: FLUÊNCIA */}
            {activeTab === 'fluency' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Wind className="w-4 h-4 text-sky-600" />
                      Avaliação da Fluência da Fala (Disfluências Comuns vs Gagueira)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Taxa de elocução, disfluências típicas e rupturas gagas (SLD).
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsFluencyModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-xl border border-teal-200 transition-colors cursor-pointer"
                  >
                    <Wind className="w-3.5 h-3.5 text-teal-600" />
                    <span>Abrir Contador com Cronômetro</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Taxa de Elocução (Palavras por Minuto)</label>
                    <input
                      type="number"
                      value={fluencyData.wordsPerMinute}
                      onChange={e => setFluencyData({ ...fluencyData, wordsPerMinute: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Disfluências Gagas (Bloqueios / Prolongamentos)</label>
                    <input
                      type="text"
                      value={fluencyData.atypicalDisfluencies}
                      onChange={e => setFluencyData({ ...fluencyData, atypicalDisfluencies: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ABA 6: DISFAGIA */}
            {activeTab === 'dysphagia' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-sky-600" />
                      Disfagia e Deglutição Funcional
                    </h3>
                    <p className="text-xs text-slate-500">
                      Rastreio de risco de broncoaspiração, sinais clínicos e matriz IDDSI.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsDysphagiaModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-xl border border-amber-200 transition-colors cursor-pointer"
                  >
                    <Activity className="w-3.5 h-3.5 text-amber-600" />
                    <span>Matriz de Consistências IDDSI</span>
                  </button>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <span className="text-xs font-bold text-slate-700">Sinais Clínicos de Penetração / Aspiração Laringotraqueal:</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    {Object.entries(dysphagiaData.penetrationAspirationSigns).map(([key, val]) => (
                      <label key={key} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200">
                        <input
                          type="checkbox"
                          checked={val as boolean}
                          onChange={e => {
                            setDysphagiaData({
                              ...dysphagiaData,
                              penetrationAspirationSigns: {
                                ...dysphagiaData.penetrationAspirationSigns,
                                [key]: e.target.checked
                              }
                            });
                          }}
                        />
                        <span className="capitalize">{key === 'cough' ? 'Tosse' : key === 'choking' ? 'Engasgo' : key === 'throatClearing' ? 'Pigarro' : key === 'wetVoice' ? 'Voz Molhada' : 'Cianose'}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ABA 7: AUDIOLOGIA COM AUDIOGRAMA INTERATIVO SVG E GUIA CFFA 2023 */}
            {activeTab === 'audiology' && (
              <AudiologyWorkspaceSection
                patientId={selectedPatientId}
                patient={selectedPatient}
                onRecordSaved={(savedId) => {
                  setCurrentAudiologyRecordId(savedId);
                }}
              />
            )}

            {/* ABA: COMUNICAÇÃO AUMENTATIVA E ALTERNATIVA (CAA / AAC) */}
            {activeTab === 'aac' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-purple-600" />
                      Comunicação Aumentativa e Alternativa (CAA)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Gestão de recursos de baixa e alta tecnologia, repertório de símbolos e parceiros comunicativos.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsAACModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl border border-purple-200 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-purple-600" />
                    <span>Gerenciar Pranchas & Recursos CAA</span>
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-purple-50/40 border border-purple-100 text-xs text-purple-900 space-y-1">
                  <span className="font-bold block">Abordagem de Comunicação Inclusiva:</span>
                  <p className="text-purple-800">
                    O módulo CAA permite acompanhar o nível de comunicador (emergente, dependente do contexto ou independente), símbolos utilizados e rotinas de modelagem em casa e na escola.
                  </p>
                </div>
              </div>
            )}

            {/* ABA: METAS TERAPÊUTICAS MENSURÁVEIS (LONGITUDINAIS) */}
            {activeTab === 'goals' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                <MeasurableGoalsManager
                  patientId={selectedPatientId}
                  specialty="fono"
                />
              </div>
            )}

            {/* ABA: PROGRAMAS DOMICILIARES E ESCOLARES */}
            {activeTab === 'home_program' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                <HomeSchoolProgramManager
                  patientId={selectedPatientId}
                  specialty="fono"
                />
              </div>
            )}

            {/* ABA 8: PLANO TERAPÊUTICO FONOAUDIOLÓGICO */}
            {activeTab === 'treatment_plans' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Target className="w-4 h-4 text-sky-600" />
                      Plano Terapêutico Fonoaudiológico (Metas & Intervenções)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Definição de múltiplos objetivos terapêuticos, intervenções específicas, prazos e orientações.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveTreatmentPlan}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{saving ? 'Salvando...' : 'Salvar Plano Terapêutico'}</span>
                  </button>
                </div>

                {/* DADOS GERAIS DO PLANO */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Título do Plano</label>
                    <input
                      type="text"
                      value={planForm.title}
                      onChange={e => setPlanForm({ ...planForm, title: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Encaminhado por (opcional):</label>
                    <input
                      type="text"
                      placeholder="Ex: Neuropediatra, Escola, Otorrino..."
                      value={planReferredBy}
                      onChange={e => setPlanReferredBy(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Frequência das Sessões</label>
                    <input
                      type="text"
                      placeholder="Ex: 1 a 2 vezes por semana, 45 min"
                      value={planForm.frequencySessions}
                      onChange={e => setPlanForm({ ...planForm, frequencySessions: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                    />
                  </div>
                </div>

                {/* OBJETIVOS ESTRUTURADOS & INTERVENÇÕES */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-sky-600" />
                      Objetivos Terapêuticos & Intervenções ({structuredGoals.length})
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        const newId = 'g-' + Date.now();
                        setStructuredGoals(prev => [
                          ...prev,
                          {
                            id: newId,
                            goal: '',
                            interventions: '',
                            targetPeriod: '12 sessões',
                            status: 'em_andamento'
                          }
                        ]);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar Objetivo</span>
                    </button>
                  </div>

                  {structuredGoals.length === 0 ? (
                    <div className="p-6 text-center rounded-2xl border border-dashed border-slate-300 text-xs text-slate-400">
                      Nenhum objetivo adicionado ainda. Clique em "+ Adicionar Objetivo" para definir metas e intervenções.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {structuredGoals.map((item, idx) => (
                        <div key={item.id} className="p-4 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <span className="font-bold text-xs text-slate-700">Objetivo #{idx + 1}</span>
                            <div className="flex items-center gap-2">
                              <select
                                value={item.status}
                                onChange={e => {
                                  const updated = [...structuredGoals];
                                  updated[idx].status = e.target.value as any;
                                  setStructuredGoals(updated);
                                }}
                                className={`px-2 py-1 rounded-lg text-xs font-bold border ${
                                  item.status === 'alcancado'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : item.status === 'em_andamento'
                                    ? 'bg-sky-50 text-sky-800 border-sky-200'
                                    : 'bg-slate-50 text-slate-700 border-slate-200'
                                }`}
                              >
                                <option value="a_iniciar">A Iniciar</option>
                                <option value="em_andamento">Em Andamento</option>
                                <option value="alcancado">Alcançado</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => {
                                  setStructuredGoals(prev => prev.filter((_, i) => i !== idx));
                                }}
                                className="p-1 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                                title="Remover objetivo"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Objetivo Terapêutico Fonoaudiológico</label>
                              <textarea
                                rows={2}
                                placeholder="Ex: Adequação da produção do fonema /s/ em posição medial..."
                                value={item.goal}
                                onChange={e => {
                                  const updated = [...structuredGoals];
                                  updated[idx].goal = e.target.value;
                                  setStructuredGoals(updated);
                                }}
                                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-sky-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Intervenções / Estratégias & Recursos</label>
                              <textarea
                                rows={2}
                                placeholder="Ex: Treino proprioceptivo tátil, pistas visuais em espelho, bombardeio auditivo..."
                                value={item.interventions}
                                onChange={e => {
                                  const updated = [...structuredGoals];
                                  updated[idx].interventions = e.target.value;
                                  setStructuredGoals(updated);
                                }}
                                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-sky-500 focus:outline-none"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-0.5">Prazo Estimado / Número de Sessões</label>
                            <input
                              type="text"
                              placeholder="Ex: 8 a 12 sessões, reavaliação em 3 meses"
                              value={item.targetPeriod}
                              onChange={e => {
                                const updated = [...structuredGoals];
                                updated[idx].targetPeriod = e.target.value;
                                setStructuredGoals(updated);
                              }}
                              className="w-full max-w-sm px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-sky-500 focus:outline-none"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ORIENTAÇÕES CASA E ESCOLA */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Orientações Gerais para Casa e Escola</label>
                  <textarea
                    rows={3}
                    placeholder="Instruções para família e educadores: modelo correto sem punição, valorização da fala funcional, rotinas comunicativas..."
                    value={planForm.homeSchoolGuidance}
                    onChange={e => setPlanForm({ ...planForm, homeSchoolGuidance: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                  />
                </div>

                {/* HISTÓRICO DE PLANOS ANTERIORES */}
                {treatmentPlans.length > 0 && (
                  <div className="pt-4 border-t border-slate-200 space-y-3">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-slate-400" />
                      Planos Fonoaudiológicos Anteriores ({treatmentPlans.length})
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {treatmentPlans.map(tp => (
                        <div key={tp.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800">{tp.title || 'Plano Terapêutico'}</span>
                            <span className="text-[10px] text-slate-500">{tp.created_at ? new Date(tp.created_at).toLocaleDateString('pt-BR') : ''}</span>
                          </div>
                          {tp.referredBy && <p className="text-[11px] text-slate-500"><strong>Encaminhado por:</strong> {tp.referredBy}</p>}
                          {tp.goals && <p className="text-slate-600 line-clamp-2"><strong>Metas:</strong> {tp.goals}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ABA: TESTES COMPLEMENTARES & ANEXOS */}
            {activeTab === 'complementary' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-sky-600" />
                      Testes Complementares & Anexos Fonoaudiológicos
                    </h3>
                    <p className="text-xs text-slate-500">
                      Cadastre testes específicos, protocolos externos, avaliações padronizadas e anexos de arquivos/fotos sem substituir os exames existentes.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowNewCompTestModal(prev => !prev)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{showNewCompTestModal ? 'Fechar Formulário' : 'Novo Teste Complementar'}</span>
                  </button>
                </div>

                {/* FORMULÁRIO DE NOVO TESTE COMPLEMENTAR */}
                {showNewCompTestModal && (
                  <form onSubmit={handleSaveComplementaryTest} className="p-5 rounded-2xl bg-sky-50/40 border border-sky-200 space-y-4 text-xs">
                    <div className="flex items-center justify-between pb-2 border-b border-sky-100">
                      <h4 className="font-bold text-sky-900 text-sm">Registrar Teste Complementar / Avaliação</h4>
                      <span className="text-[11px] text-sky-700 font-semibold">* Campos principais</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Nome do Teste / Protocolo *</label>
                        <input
                          type="text"
                          required
                          placeholder="Ex: TDF, ABFW Vocabulário, PAC Simplificado..."
                          value={compForm.testName}
                          onChange={e => setCompForm({ ...compForm, testName: e.target.value })}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:border-sky-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Data da Aplicação *</label>
                        <input
                          type="date"
                          required
                          value={compForm.testDate}
                          onChange={e => setCompForm({ ...compForm, testDate: e.target.value })}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:border-sky-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Encaminhado por (opcional):</label>
                        <input
                          type="text"
                          placeholder="Ex: Neuropediatra, Otorrino, Escola..."
                          value={compForm.referredBy}
                          onChange={e => setCompForm({ ...compForm, referredBy: e.target.value })}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:border-sky-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Resultado / Escore / Pontuação</label>
                        <input
                          type="text"
                          placeholder="Ex: Percentil 65, Escore Z -1.2, Adequado..."
                          value={compForm.resultScore}
                          onChange={e => setCompForm({ ...compForm, resultScore: e.target.value })}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:border-sky-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Parecer / Observações Clínicas</label>
                        <input
                          type="text"
                          placeholder="Síntese dos achados fonoaudiológicos observados..."
                          value={compForm.notes}
                          onChange={e => setCompForm({ ...compForm, notes: e.target.value })}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:border-sky-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* UPLOAD DE ANEXO OU FOTO DO PROTOCOLO */}
                    <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                      <span className="block text-xs font-bold text-slate-700">Anexo do Teste (Documento / Foto do Protocolo):</span>
                      <FileImageUploader
                        patientId={selectedPatientId}
                        appointmentId={initialAppointmentId}
                        category="fono_complementary"
                        label="Anexar Foto ou Arquivo do Teste"
                        buttonText="Selecionar Arquivo / Foto"
                        onUploaded={(info: FileUploadedInfo) => {
                          setCompForm(prev => ({
                            ...prev,
                            attachmentUrl: info.url || info.objectKey,
                            attachmentName: info.originalFilename || info.filename || 'Anexo do Teste'
                          }));
                          showToast('Arquivo anexado com sucesso!', 'success');
                        }}
                        onRemoved={() => {
                          setCompForm(prev => ({ ...prev, attachmentUrl: '', attachmentName: '' }));
                        }}
                      />
                      {compForm.attachmentName && (
                        <p className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Anexo selecionado: {compForm.attachmentName}
                        </p>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowNewCompTestModal(false)}
                        className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-5 py-2 text-xs font-bold rounded-xl text-white bg-sky-600 hover:bg-sky-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                      >
                        {saving ? 'Salvando...' : 'Salvar Teste Complementar'}
                      </button>
                    </div>
                  </form>
                )}

                {/* LISTA DE TESTES COMPLEMENTARES CADASTRADOS */}
                {complementaryTests.length === 0 ? (
                  <div className="bg-slate-50/50 p-8 text-center rounded-2xl border border-slate-200 text-xs text-slate-400 space-y-2">
                    <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                    <p>Nenhum teste complementar ou protocolo registrado para este paciente.</p>
                    <p className="text-[11px] text-slate-400">Clique em "+ Novo Teste Complementar" para registrar avaliações padronizadas ou anexar documentos externos.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {complementaryTests.map(test => (
                      <div key={test.id} className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-sky-300 transition-all shadow-xs space-y-3 text-xs">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-slate-900">{test.testName}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200">
                              {test.testDate ? new Date(test.testDate).toLocaleDateString('pt-BR') : 'Data n/d'}
                            </span>
                            {test.referredBy && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                                Encaminhado por: {test.referredBy}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {test.resultScore && (
                              <span className="font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs">
                                Resultado: {test.resultScore}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteComplementaryTest(test.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                              title="Remover teste"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {test.notes && (
                          <p className="text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                            <strong>Parecer Clínico:</strong> {test.notes}
                          </p>
                        )}

                        {test.attachmentUrl && (
                          <div className="flex items-center gap-2 pt-1">
                            <Paperclip className="w-3.5 h-3.5 text-sky-600" />
                            <a
                              href={test.attachmentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sky-700 font-bold hover:underline inline-flex items-center gap-1"
                            >
                              <span>{test.attachmentName || 'Visualizar Anexo do Teste'}</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        )}

                        {test.professionalName && (
                          <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-100">
                            Registrado por: <strong>{test.professionalName}</strong>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ABA 9: FINALIZAR ATENDIMENTO */}
            {activeTab === 'finish' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-sky-600" />
                      Finalizar Consulta Fonoaudiológica (Gravação Longitudinal no Prontuário)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Gera o registro oficial com todas as avaliações fonêmicas, vocais e plano fonoaudiológico vinculado de forma definitiva.
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">Título da Consulta</label>
                  <input
                    type="text"
                    value={consultationTitle}
                    onChange={e => setConsultationTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 font-semibold"
                  />
                </div>

                {/* RESUMO DOS DADOS DA SESSÃO */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-500 block">Encaminhado por:</span>
                    <span className="font-semibold text-slate-800">{speechReferredBy || planReferredBy || 'Demanda espontânea'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-500 block">Quebra de Coarticulação:</span>
                    <span className="font-semibold text-slate-800">{coarticulationBreakdown || 'Ausente'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-500 block">Metas no Plano:</span>
                    <span className="font-semibold text-slate-800">{structuredGoals.length} objetivo(s) estruturado(s)</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Evolução Clínica Fonoaudiológica *</label>
                  <textarea
                    rows={4}
                    placeholder="Descreva as atividades fonoterápicas realizadas, resposta aos estímulos, produção fonêmica e evolução vocal..."
                    value={consultationEvolution}
                    onChange={e => setConsultationEvolution(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Condutas Terapêuticas & Exercícios</label>
                  <textarea
                    rows={3}
                    placeholder="Orientações e exercícios fonoaudiológicos para treino diário em casa, encaminhamentos e data do próximo retorno..."
                    value={consultationConducts}
                    onChange={e => setConsultationConducts(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleFinishConsultation}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 shadow-md shadow-sky-500/20 transition-all cursor-pointer disabled:opacity-50"
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

      {/* MODAIS AVANÇADOS DE FONOAUDIOLOGIA */}
      {selectedPatientId && (
        <>
          <FluencyCounterModal
            isOpen={isFluencyModalOpen}
            onClose={() => setIsFluencyModalOpen(false)}
            patientId={selectedPatientId}
            patientName={selectedPatient?.full_name}
          />
          <LanguageSampleModal
            isOpen={isLanguageSampleModalOpen}
            onClose={() => setIsLanguageSampleModalOpen(false)}
            patientId={selectedPatientId}
            patientName={selectedPatient?.full_name}
            onInsertAnalysis={text => {
              setLanguageData((prev: any) => ({
                ...prev,
                notes: prev.notes ? `${prev.notes}\n\n${text}` : text
              }));
              setActiveTab('language');
            }}
          />
          <DysphagiaMatrixModal
            isOpen={isDysphagiaModalOpen}
            onClose={() => setIsDysphagiaModalOpen(false)}
            patientId={selectedPatientId}
            patientName={selectedPatient?.full_name}
            onInsertPrescription={text => {
              setConsultationConducts(prev => (prev ? `${prev}\n\n${text}` : text));
              setActiveTab('finish');
            }}
          />
          <AACManagerModal
            isOpen={isAACModalOpen}
            onClose={() => setIsAACModalOpen(false)}
            patientId={selectedPatientId}
            patientName={selectedPatient?.full_name}
          />
          <FonoEvolutionReportModal
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
          {showPreviousRecordsModal && selectedPatientId && (
            <PatientPreviousRecordsModal
              isOpen={showPreviousRecordsModal}
              onClose={() => setShowPreviousRecordsModal(false)}
              patientId={selectedPatientId}
              patientName={selectedPatient?.full_name}
            />
          )}
        </>
      )}
    </div>
  );
};
