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
  Layers
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

import { InteractiveAudiogram, AudiogramData } from './InteractiveAudiogram';
import { FluencyCounterModal } from './FluencyCounterModal';
import { LanguageSampleModal } from './LanguageSampleModal';
import { DysphagiaMatrixModal } from './DysphagiaMatrixModal';
import { AACManagerModal } from './AACManagerModal';
import { FonoEvolutionReportModal } from './FonoEvolutionReportModal';
import { MeasurableGoalsManager } from '../common/MeasurableGoalsManager';
import { HomeSchoolProgramManager } from '../common/HomeSchoolProgramManager';
import { EvolutionComparisonModal } from '../common/EvolutionComparisonModal';

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

  // Dados do Audiograma Interativo
  const [audiogramData, setAudiogramData] = useState<AudiogramData>({
    rightAir: { 250: 15, 500: 15, 1000: 10, 2000: 15, 4000: 20, 8000: 15 },
    leftAir: { 250: 15, 500: 10, 1000: 15, 2000: 15, 4000: 15, 8000: 20 },
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

  // 8. Audiologia
  const [audiologyData, setAudiologyData] = useState<any>({
    pureToneAudiometryRight: 'Limiares dentro dos padrões de normalidade (<= 20 dB)',
    pureToneAudiometryLeft: 'Limiares dentro dos padrões de normalidade (<= 20 dB)',
    speechAudiometry: 'LRF e IPRF 100% bilateral',
    tympanometry: 'Curva tipo A bilateral (complacência e pressão normais)',
    acousticReflexes: 'Presentes bilateralmente',
    otoacousticEmissions: 'Presentes bilateralmente',
    auditoryProcessingNotes: 'Triagem de PAC sem queixas ou déficits evidentes'
  });
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
      const [anaRes, langRes, phonRes, oroRes, voiRes, fluRes, dysRes, audRes, planRes] = await Promise.allSettled([
        ApiClient.get<any>(`/v1/speech-therapy/anamnesis/${patId}`),
        ApiClient.get<any>(`/v1/speech-therapy/language/${patId}`),
        ApiClient.get<any>(`/v1/speech-therapy/phonemes/${patId}`),
        ApiClient.get<any>(`/v1/speech-therapy/orofacial/${patId}`),
        ApiClient.get<any>(`/v1/speech-therapy/voice/${patId}`),
        ApiClient.get<any>(`/v1/speech-therapy/fluency/${patId}`),
        ApiClient.get<any>(`/v1/speech-therapy/dysphagia/${patId}`),
        ApiClient.get<any[]>(`/v1/speech-therapy/audiology/${patId}`),
        ApiClient.get<any[]>(`/v1/speech-therapy/treatment-plans/${patId}`)
      ]);

      if (anaRes.status === 'fulfilled' && anaRes.value && anaRes.value.data) setAnamnesisData(anaRes.value.data);
      if (langRes.status === 'fulfilled' && langRes.value && langRes.value.data) setLanguageData(langRes.value.data);
      if (phonRes.status === 'fulfilled' && phonRes.value && Array.isArray(phonRes.value.phonemes)) {
        setPhonemesList(phonRes.value.phonemes);
      }
      if (oroRes.status === 'fulfilled' && oroRes.value && oroRes.value.data) setOrofacialData(oroRes.value.data);
      if (voiRes.status === 'fulfilled' && voiRes.value && voiRes.value.data) setVoiceData(voiRes.value.data);
      if (fluRes.status === 'fulfilled' && fluRes.value && fluRes.value.data) setFluencyData(fluRes.value.data);
      if (dysRes.status === 'fulfilled' && dysRes.value && dysRes.value.data) setDysphagiaData(dysRes.value.data);
      if (audRes.status === 'fulfilled' && Array.isArray(audRes.value)) setAudiologyList(audRes.value);
      if (planRes.status === 'fulfilled' && Array.isArray(planRes.value)) setTreatmentPlans(planRes.value);
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
        phonemes: phonemesList
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
        anamnesisData,
        languageData,
        phonemesData: { phonemes: phonemesList },
        orofacialData,
        voiceData,
        fluencyData,
        treatmentPlanData: planForm, dysphagiaData, audiologyData, audioData: audioBlobUrl
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
            { id: 'treatment_plans', label: 'Plano Singular', icon: FileText },
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

            {/* ABA 7: AUDIOLOGIA COM AUDIOGRAMA INTERATIVO SVG */}
            {activeTab === 'audiology' && (
              <div className="space-y-6">
                <InteractiveAudiogram
                  data={audiogramData}
                  onChange={setAudiogramData}
                />

                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Exames Complementares de Audiologia e PAC
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Logoaudiometria (LRF e IPRF)</label>
                      <input
                        type="text"
                        value={audiologyData.speechAudiometry}
                        onChange={e => setAudiologyData({ ...audiologyData, speechAudiometry: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Imitanciometria / Timpanometria</label>
                      <input
                        type="text"
                        value={audiologyData.tympanometry}
                        onChange={e => setAudiologyData({ ...audiologyData, tympanometry: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                      />
                    </div>
                  </div>
                </div>
              </div>
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

            {/* ABA 8: PLANO TERAPÊUTICO */}
            {activeTab === 'treatment_plans' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Target className="w-4 h-4 text-sky-600" />
                      Plano Terapêutico Fonoaudiológico
                    </h3>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Metas Terapêuticas</label>
                    <textarea
                      rows={3}
                      value={planForm.goals}
                      onChange={e => setPlanForm({ ...planForm, goals: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Orientações para Casa e Escola</label>
                    <textarea
                      rows={2}
                      value={planForm.homeSchoolGuidance}
                      onChange={e => setPlanForm({ ...planForm, homeSchoolGuidance: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                </div>
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
        </>
      )}
    </div>
  );
};
