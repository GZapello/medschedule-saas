import React, { useState, useEffect, useRef } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  X,
  Clock,
  Calendar,
  User,
  ShieldCheck,
  AlertTriangle,
  HeartPulse,
  Pill,
  Save,
  CheckCircle2,
  Share2,
  FileText,
  Phone,
  MessageCircle,
  Building2,
  Stethoscope,
  ChevronRight,
  Mic,
  MicOff,
  Sparkles,
  Edit3,
  Trash2,
  Pause,
  Play,
  RotateCcw,
  Copy,
  Check,
  Eye,
  Activity,
  ChevronDown,
  ChevronUp,
  History,
  Smile,
  Apple,
  Scale,
  Hand,
  Brain
} from 'lucide-react';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { ReferralModal } from './ReferralModal';
import { FinishConsultationModal } from './FinishConsultationModal';
import { BodyPainMapCanvas } from '../physiotherapy/BodyPainMapCanvas';
import { OdontogramCanvas, OdontogramData } from '../dentistry/OdontogramCanvas';

interface QuickConsultationModalProps {
  appointment: {
    id: string;
    patient_id: string;
    patient_name?: string;
    patient_phone?: string;
    patient_birth_date?: string;
    professional_id: string;
    professional_name?: string;
    service_id: string;
    service_name?: string;
    start_time: string;
    end_time?: string;
    modality?: string;
    status?: string;
  };
  onClose: () => void;
  onFinished: () => void;
}

export const QuickConsultationModal: React.FC<QuickConsultationModalProps> = ({
  appointment,
  onClose,
  onFinished
}) => {
  const {
    currentTenant,
    clientTermLabel,
    isPhysiotherapist,
    isDentist,
    isNutritionist,
    isOccupationalTherapist,
    isSpeechTherapist,
    currentUser
  } = useAuth();
  const { showToast } = useToast();

  const [loadingPatient, setLoadingPatient] = useState<boolean>(true);
  const [patientData, setPatientData] = useState<any>(null);
  const [allergiesList, setAllergiesList] = useState<any[]>([]);
  const [medicationsList, setMedicationsList] = useState<any[]>([]);

  // ZemdaFisio - Mapa de Dor & Avaliação Fisioterapêutica (Regras 3, 4, 5, 6, 7)
  const [isAppointmentPhysio, setIsAppointmentPhysio] = useState<boolean>(() => !!isPhysiotherapist);
  const [zemdaFisioExpanded, setZemdaFisioExpanded] = useState<boolean>(true);
  const [bodyMapJson, setBodyMapJson] = useState<string>('');
  const [bodyMapImage, setBodyMapImage] = useState<string>('');
  const [painScore, setPainScore] = useState<number>(0);
  const [painLocation, setPainLocation] = useState<string>('');
  const [painCharacteristics, setPainCharacteristics] = useState<string>('');
  const [conductsExercises, setConductsExercises] = useState<string>('');
  const [physioAssessments, setPhysioAssessments] = useState<any[]>([]);
  const [viewingHistoricalId, setViewingHistoricalId] = useState<string | null>(null);
  const [savingPhysio, setSavingPhysio] = useState<boolean>(false);

  // ZemdaOdonto - Odontograma & Procedimentos Odontológicos
  const [isAppointmentDentist, setIsAppointmentDentist] = useState<boolean>(() => !!isDentist);
  const [zemdaOdontoExpanded, setZemdaOdontoExpanded] = useState<boolean>(true);
  const [odontogramData, setOdontogramData] = useState<OdontogramData>({});
  const [pendingToothChanges, setPendingToothChanges] = useState<any[]>([]);

  // ZemdaNutri - Nutrição & Antropometria Rápida
  const [isAppointmentNutri, setIsAppointmentNutri] = useState<boolean>(() => !!isNutritionist);
  const [zemdaNutriExpanded, setZemdaNutriExpanded] = useState<boolean>(true);
  const [nutriWeight, setNutriWeight] = useState<string>('');
  const [nutriHeight, setNutriHeight] = useState<string>('');
  const [nutriWaistCirc, setNutriWaistCirc] = useState<string>('');
  const [nutriAbdominalCirc, setNutriAbdominalCirc] = useState<string>('');
  const [nutriHipCirc, setNutriHipCirc] = useState<string>('');
  const [nutriNotes, setNutriNotes] = useState<string>('');

  // ZemdaTO - Terapia Ocupacional
  const [isAppointmentTO, setIsAppointmentTO] = useState<boolean>(() => !!isOccupationalTherapist);
  const [zemdaTOExpanded, setZemdaTOExpanded] = useState<boolean>(true);
  const [toIndependenceLevel, setToIndependenceLevel] = useState<number>(5);
  const [toMainOccupation, setToMainOccupation] = useState<string>('Autocuidado e rotina diária');
  const [toSensoryStatus, setToSensoryStatus] = useState<string>('Típico / Sem desvios evidentes');
  const [toNotes, setToNotes] = useState<string>('');

  // ZemdaFono - Fonoaudiologia
  const [isAppointmentFono, setIsAppointmentFono] = useState<boolean>(() => !!isSpeechTherapist);
  const [zemdaFonoExpanded, setZemdaFonoExpanded] = useState<boolean>(true);
  const [fonoPhonemeAltered, setFonoPhonemeAltered] = useState<string>('');
  const [fonoVoiceQuality, setFonoVoiceQuality] = useState<string>('Adequada');
  const [fonoOrofacialHabit, setFonoOrofacialHabit] = useState<string>('Nenhum');
  const [fonoNotes, setFonoNotes] = useState<string>('');

  // Campos clínicos
  const [title, setTitle] = useState<string>(
    `Consulta de ${appointment.service_name || 'Rotina'}`
  );
  const [clinicalEvolution, setClinicalEvolution] = useState<string>('');
  const [technicalNotes, setTechnicalNotes] = useState<string>('');
  const [isSealed, setIsSealed] = useState<boolean>(false);

  // Status de autosave
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Sub-modais
  const [showReferralModal, setShowReferralModal] = useState<boolean>(false);
  const [showFinishModal, setShowFinishModal] = useState<boolean>(false);
  const [savingRecord, setSavingRecord] = useState<boolean>(false);

  const DRAFT_KEY = `zemda_quick_consult_${appointment.id}`;
  const debounceTimerRef = useRef<any>(null);

  // Estados para Gravação de Áudio com IA (Evolução Clínica)
  const speech = useSpeechRecognition();
  const [showAiEvolutionModal, setShowAiEvolutionModal] = useState<boolean>(false);
  const [originalSpeechText, setOriginalSpeechText] = useState<string>('');
  const [organizedDraft, setOrganizedDraft] = useState<string>('');
  const [editedDraftText, setEditedDraftText] = useState<string>('');
  const [isEditingDraft, setIsEditingDraft] = useState<boolean>(false);
  const [currentAiMode, setCurrentAiMode] = useState<string>('organize');
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [comparisonTab, setComparisonTab] = useState<'split' | 'organized' | 'original'>('split');
  const [aiProvider, setAiProvider] = useState<string>('Google Gemini');

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const getModeLabel = (key: string): string => {
    switch (key) {
      case 'organize': return 'Organizar evolução';
      case 'summarize': return 'Resumir';
      case 'technical': return 'Tornar mais técnico';
      case 'objective': return 'Tornar mais objetivo';
      case 'separate': return 'Separar evolução e conduta';
      case 'grammar': return 'Corrigir gramática';
      default: return 'Organizar';
    }
  };

  // Iniciar microfone
  const handleStartMic = () => {
    if (!speech.isSupported) {
      showToast('Navegador sem suporte à captura nativa de fala. Recomendamos Google Chrome ou Microsoft Edge.', 'info');
      return;
    }
    speech.startListening();
    showToast('Microfone ativado! Fale a evolução da consulta.', 'info');
  };

  // Pausar
  const handlePauseMic = () => {
    speech.pauseListening();
    showToast('Microfone pausado.', 'info');
  };

  // Continuar
  const handleResumeMic = () => {
    speech.resumeListening();
    showToast('Microfone retomado! Pode continuar falando.', 'info');
  };

  // Finalizar gravação e organizar com IA
  const handleStopAndOrganize = async () => {
    speech.stopListening();
    const transcriptText = speech.transcript.trim();

    if (!transcriptText) {
      showToast('Nenhum áudio detectado pelo microfone.', 'info');
      return;
    }

    setOriginalSpeechText(transcriptText);
    setAiError(null);
    setIsGeneratingAi(true);
    setCurrentAiMode('organize');
    setIsEditingDraft(false);
    setShowAiEvolutionModal(true);

    try {
      const res = await ApiClient.post<{
        originalTranscript: string;
        organizedText: string;
        mode: string;
        provider?: string;
        disclaimer?: string;
      }>('/v1/ai/organize-evolution', {
        transcript: transcriptText,
        mode: 'organize',
        patientId: appointment.patient_id
      });

      if (res && res.organizedText) {
        setOrganizedDraft(res.organizedText);
        setEditedDraftText(res.organizedText);
        if (res.provider) setAiProvider(res.provider);
        showToast('Rascunho clínico organizado pela IA! Revise antes de confirmar.', 'success');
      } else {
        throw new Error('Não foi possível organizar o texto com a IA');
      }
    } catch (err: any) {
      setAiError(err?.message || 'Falha na comunicação com a IA. Sua fala foi 100% preservada!');
      setOrganizedDraft(transcriptText);
      setEditedDraftText(transcriptText);
      showToast('Aviso: Sua fala foi preservada. Você pode tentar novamente ou editar diretamente.', 'info');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Executar transformação rápida (Opções Rápidas)
  const handleTransformMode = async (modeKey: string) => {
    if (!originalSpeechText.trim()) return;

    setIsGeneratingAi(true);
    setCurrentAiMode(modeKey);
    setAiError(null);

    try {
      const res = await ApiClient.post<{
        originalTranscript: string;
        organizedText: string;
        mode: string;
        provider?: string;
      }>('/v1/ai/organize-evolution', {
        transcript: originalSpeechText,
        mode: modeKey,
        patientId: appointment.patient_id
      });

      if (res && res.organizedText) {
        setOrganizedDraft(res.organizedText);
        setEditedDraftText(res.organizedText);
        setIsEditingDraft(false);
        if (res.provider) setAiProvider(res.provider);
        showToast(`Evolução atualizada (${getModeLabel(modeKey)})!`, 'success');
      }
    } catch (err: any) {
      setAiError('Erro ao aplicar transformação pela IA. Versão anterior mantida.');
      showToast('Erro ao processar nova transformação pela IA.', 'error');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Aplicar rascunho no campo "Evolução Clínica & Conduta Terapêutica *"
  const handleApplyDraft = (action: 'replace' | 'append') => {
    const textToInsert = isEditingDraft ? editedDraftText.trim() : organizedDraft.trim();
    if (!textToInsert) return;

    if (action === 'replace' || !clinicalEvolution.trim()) {
      handleEvolutionChange(textToInsert);
    } else {
      handleEvolutionChange(clinicalEvolution + '\n\n' + textToInsert);
    }

    setShowAiEvolutionModal(false);
    speech.resetTranscript();
    showToast('Texto aplicado com sucesso no campo de Evolução Clínica! Revise e salve quando desejar.', 'success');
  };

  // Descartar rascunho
  const handleDiscardDraft = () => {
    setShowAiEvolutionModal(false);
    showToast('Rascunho descartado. Nenhuma alteração foi feita no prontuário.', 'info');
  };


  useEffect(() => {
    async function loadPatientDetails() {
      try {
        setLoadingPatient(true);
        const [patRes, allergiesRes, medsRes] = await Promise.allSettled([
          ApiClient.get<any>(`/v1/patients/${appointment.patient_id}`),
          ApiClient.get<any[]>(`/v1/patients/${appointment.patient_id}/allergies`),
          ApiClient.get<any[]>(`/v1/patients/${appointment.patient_id}/medications`)
        ]);

        if (patRes.status === 'fulfilled') {
          setPatientData(patRes.value);
        }
        if (allergiesRes.status === 'fulfilled' && Array.isArray(allergiesRes.value)) {
          setAllergiesList(allergiesRes.value);
        }
        if (medsRes.status === 'fulfilled' && Array.isArray(medsRes.value)) {
          setMedicationsList(medsRes.value);
        }
      } catch (err: any) {
        console.warn('Erro ao carregar dados do paciente:', err);
      } finally {
        setLoadingPatient(false);
      }
    }

    loadPatientDetails();
  }, [appointment.patient_id]);

  // Verifica autorização estrita da área de atuação para exibir ZemdaFisio (Regras 1, 3, 4, 5 e 6)
  useEffect(() => {
    // Se o usuário conectado for fisioterapeuta autorizado, abre DIRETAMENTE o ZemdaFisio
    if (!isPhysiotherapist) {
      setIsAppointmentPhysio(false);
      return;
    }
    setIsAppointmentPhysio(true);
  }, [isPhysiotherapist]);

  // Verifica autorização estrita da área de atuação para exibir ZemdaOdonto
  useEffect(() => {
    if (!isDentist) {
      setIsAppointmentDentist(false);
      return;
    }
    setIsAppointmentDentist(true);
  }, [isDentist]);

  // Verifica autorização estrita para exibir ZemdaNutri
  useEffect(() => {
    if (!isNutritionist) {
      setIsAppointmentNutri(false);
      return;
    }
    setIsAppointmentNutri(true);
  }, [isNutritionist]);

  // Verifica autorização estrita para exibir ZemdaTO
  useEffect(() => {
    if (!isOccupationalTherapist) {
      setIsAppointmentTO(false);
      return;
    }
    setIsAppointmentTO(true);
  }, [isOccupationalTherapist]);

  // Verifica autorização estrita para exibir ZemdaFono
  useEffect(() => {
    if (!isSpeechTherapist) {
      setIsAppointmentFono(false);
      return;
    }
    setIsAppointmentFono(true);
  }, [isSpeechTherapist]);

  // Carrega odontograma do paciente
  useEffect(() => {
    async function loadOdontogram() {
      if (!isAppointmentDentist || !appointment.patient_id) return;
      try {
        const res = await ApiClient.get<any>(`/v1/dentistry/odontograms/${appointment.patient_id}`);
        if (res?.current?.status_data) {
          setOdontogramData(res.current.status_data);
        }
      } catch (err) {
        console.warn('Odontograma não carregado:', err);
      }
    }
    loadOdontogram();
  }, [isAppointmentDentist, appointment.patient_id]);

  // Carrega histórico de avaliações e mapas de dor do paciente (Regra 7)
  useEffect(() => {
    async function loadPhysioAssessments() {
      if (!isAppointmentPhysio || !appointment.patient_id) return;
      try {
        const list = await ApiClient.get<any[]>(`/v1/physiotherapy/assessments/patient/${appointment.patient_id}`);
        if (Array.isArray(list)) {
          setPhysioAssessments(list);

          // Se já existe avaliação gravada para este agendamento específico, restaura seus dados
          const currentAssessment = list.find(a => a.appointment_id === appointment.id);
          if (currentAssessment) {
            if (currentAssessment.pain_score !== undefined) setPainScore(currentAssessment.pain_score);
            if (currentAssessment.pain_location) setPainLocation(currentAssessment.pain_location);
            if (currentAssessment.pain_characteristics) setPainCharacteristics(currentAssessment.pain_characteristics);
            if (currentAssessment.conducts_exercises) setConductsExercises(currentAssessment.conducts_exercises);
            if (currentAssessment.body_map_json) setBodyMapJson(currentAssessment.body_map_json);
            if (currentAssessment.body_map_image) setBodyMapImage(currentAssessment.body_map_image);
          } else if (list.length > 0) {
            // Se for um novo atendimento, podemos carregar a queixa da última sessão como referência sem sobrescrever
            const latest = list[0];
            if (latest.pain_location && !painLocation) setPainLocation(latest.pain_location);
          }
        }
      } catch (err) {
        console.warn('ZemdaFisio: Erro ao carregar avaliações do paciente:', err);
      }
    }

    loadPhysioAssessments();
  }, [isAppointmentPhysio, appointment.patient_id, appointment.id]);

  // 2. Restaura rascunho salvo anteriormente do LocalStorage
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem(DRAFT_KEY);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed.title) setTitle(parsed.title);
        if (parsed.clinicalEvolution) setClinicalEvolution(parsed.clinicalEvolution);
        if (parsed.technicalNotes) setTechnicalNotes(parsed.technicalNotes);
        setAutosaveStatus('saved');
        setLastSavedAt(new Date(parsed.savedAt || Date.now()));
      }
    } catch (e) {
      console.warn('Erro ao restaurar rascunho:', e);
    }
  }, [DRAFT_KEY]);

  // 3. Mecanismo de Autosave com Debounce (garantia absoluta de não perder texto)
  const triggerAutosave = (newTitle: string, newEvol: string, newNotes: string) => {
    setAutosaveStatus('saving');
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      try {
        const draftObj = {
          title: newTitle,
          clinicalEvolution: newEvol,
          technicalNotes: newNotes,
          savedAt: new Date().toISOString()
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draftObj));
        setAutosaveStatus('saved');
        setLastSavedAt(new Date());
      } catch (err) {
        console.error('Erro no autosave:', err);
        setAutosaveStatus('error');
      }
    }, 600);
  };

  const handleTitleChange = (val: string) => {
    setTitle(val);
    triggerAutosave(val, clinicalEvolution, technicalNotes);
  };

  const handleEvolutionChange = (val: string) => {
    setClinicalEvolution(val);
    triggerAutosave(title, val, technicalNotes);
  };

  const handleNotesChange = (val: string) => {
    setTechnicalNotes(val);
    triggerAutosave(title, clinicalEvolution, val);
  };

  // 4. Salvar Rascunho Manualmente
  const handleManualSaveDraft = () => {
    try {
      const draftObj = {
        title,
        clinicalEvolution,
        technicalNotes,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draftObj));
      setAutosaveStatus('saved');
      setLastSavedAt(new Date());
      showToast('Rascunho salvo com segurança no dispositivo!', 'success');
    } catch (e: any) {
      showToast('Erro ao salvar rascunho localmente', 'error');
    }
  };

  // Salvar Avaliação e Mapa de Dor ZemdaFisio (Regras 6 e 7)
  const handleSavePhysioData = async () => {
    try {
      setSavingPhysio(true);
      const existingForAppt = physioAssessments.find(a => a.appointment_id === appointment.id);

      const payload = {
        patientId: appointment.patient_id,
        appointmentId: appointment.id,
        professionalId: appointment.professional_id,
        chiefComplaint: title || `Atendimento de Fisioterapia - ${appointment.service_name || 'Rotina'}`,
        painScore,
        painLocation: painLocation.trim() || undefined,
        painCharacteristics: painCharacteristics.trim() || undefined,
        conductsExercises: conductsExercises.trim() || undefined,
        bodyMapJson: bodyMapJson || undefined,
        bodyMapImage: bodyMapImage || undefined
      };

      if (existingForAppt) {
        await ApiClient.put(`/v1/physiotherapy/assessments/${existingForAppt.id}`, payload);
        showToast('Mapa de dor e condutas ZemdaFisio atualizados com sucesso!', 'success');
      } else {
        await ApiClient.post('/v1/physiotherapy/assessments', payload);
        showToast('Mapa de dor e condutas ZemdaFisio gravados no prontuário!', 'success');
      }

      const list = await ApiClient.get<any[]>(`/v1/physiotherapy/assessments/patient/${appointment.patient_id}`);
      setPhysioAssessments(list || []);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar dados do ZemdaFisio', 'error');
    } finally {
      setSavingPhysio(false);
    }
  };

  // 5. Salvar Evolução Direto no Prontuário Eletrônico
  const handleSaveEvolution = async () => {
    if (!clinicalEvolution.trim()) {
      showToast('Digite a evolução clínica do atendimento antes de salvar', 'error');
      return;
    }

    try {
      setSavingRecord(true);
      const sessionDate = appointment.start_time ? appointment.start_time.split('T')[0] : new Date().toISOString().split('T')[0];

      await ApiClient.post('/v1/clinical-records', {
        patientId: appointment.patient_id,
        appointmentId: appointment.id,
        professionalId: appointment.professional_id,
        sessionDate,
        title: title.trim() || `Consulta de ${appointment.service_name || 'Rotina'}`,
        clinicalEvolution: clinicalEvolution.trim(),
        technicalNotes: technicalNotes.trim() || null,
        isSealed
      });

      // Sincroniza dados do ZemdaFisio caso preenchidos
      if (isAppointmentPhysio && (bodyMapJson || painScore > 0 || conductsExercises.trim() || painLocation.trim())) {
        try {
          const existingForAppt = physioAssessments.find(a => a.appointment_id === appointment.id);
          const physioPayload = {
            patientId: appointment.patient_id,
            appointmentId: appointment.id,
            professionalId: appointment.professional_id,
            chiefComplaint: title || `Atendimento de Fisioterapia`,
            painScore,
            painLocation: painLocation.trim() || undefined,
            painCharacteristics: painCharacteristics.trim() || undefined,
            conductsExercises: conductsExercises.trim() || undefined,
            bodyMapJson: bodyMapJson || undefined,
            bodyMapImage: bodyMapImage || undefined
          };
          if (existingForAppt) {
            await ApiClient.put(`/v1/physiotherapy/assessments/${existingForAppt.id}`, physioPayload);
          } else {
            await ApiClient.post('/v1/physiotherapy/assessments', physioPayload);
          }
        } catch (e) {
          console.warn('Erro ao sincronizar avaliação ZemdaFisio:', e);
        }
      }

      showToast('Evolução clínica gravada com sucesso no prontuário oficial!', 'success');
      // Atualiza status do agendamento para in_progress se ainda estiver scheduled
      if (appointment.status === 'scheduled' || appointment.status === 'confirmed') {
        try {
          await ApiClient.put(`/v1/appointments/${appointment.id}/status`, {
            status: 'in_progress'
          });
        } catch (e) {
          // Ignora
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao gravar evolução no prontuário', 'error');
    } finally {
      setSavingRecord(false);
    }
  };

  // 6. Finalizar Atendimento diretamente com persistência garantida em cada módulo especializado
  const handleFinalizeAttendance = () => setShowFinishModal(true);
  // Calcula idade a partir da data de nascimento
  const calculateAge = (birthDateString?: string) => {
    if (!birthDateString) return null;
    const today = new Date();
    const birth = new Date(birthDateString);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age >= 0 ? `${age} anos` : null;
  };

  const patientName = patientData?.full_name || appointment.patient_name || 'Paciente';
  const patientPhone = patientData?.phone || patientData?.mobile || appointment.patient_phone || '';
  const patientBirth = patientData?.birth_date || appointment.patient_birth_date || '';
  const patientAge = calculateAge(patientBirth);
  const cleanPhone = patientPhone.replace(/\D/g, '');

  const appointmentDate = appointment.start_time ? appointment.start_time.split('T')[0] : '';
  const appointmentTime = appointment.start_time ? appointment.start_time.split('T')[1]?.slice(0, 5) : '';

  // Alertas de alergias
  const hasAllergies = (allergiesList && allergiesList.length > 0) || (patientData?.allergies && patientData.allergies.trim().length > 0);
  const allergiesText = allergiesList.length > 0
    ? allergiesList.map(a => a.allergen || a.name).join(', ')
    : patientData?.allergies || '';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl border border-slate-200 flex flex-col max-h-[96vh] overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* TOP BAR: Identidade Zemda & Fechar */}
        <div className="bg-slate-900 text-white px-6 py-3.5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                isAppointmentPhysio ? 'bg-emerald-400' :
                isAppointmentDentist ? 'bg-cyan-400' :
                isAppointmentNutri ? 'bg-lime-400' :
                isAppointmentTO ? 'bg-amber-400' :
                isAppointmentFono ? 'bg-purple-400' : 'bg-teal-400'
              }`} />
              <span className={`text-xs font-black tracking-wider uppercase flex items-center gap-1.5 ${
                isAppointmentPhysio ? 'text-emerald-400' :
                isAppointmentDentist ? 'text-cyan-400' :
                isAppointmentNutri ? 'text-lime-400' :
                isAppointmentTO ? 'text-amber-400' :
                isAppointmentFono ? 'text-purple-400' : 'text-teal-400'
              }`}>
                {isAppointmentDentist ? (
                  <>
                    <Smile className="w-4 h-4 text-cyan-400" />
                    <span>ZemdaOdonto — Atendimento Odontológico</span>
                  </>
                ) : isAppointmentPhysio ? (
                  <>
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <span>ZemdaFisio — Atendimento Fisioterapêutico</span>
                  </>
                ) : isAppointmentNutri ? (
                  <>
                    <Apple className="w-4 h-4 text-lime-400" />
                    <span>ZemdaNutri — Atendimento Nutricional</span>
                  </>
                ) : isAppointmentTO ? (
                  <>
                    <Hand className="w-4 h-4 text-amber-400" />
                    <span>ZemdaTO — Terapia Ocupacional</span>
                  </>
                ) : isAppointmentFono ? (
                  <>
                    <Mic className="w-4 h-4 text-purple-400" />
                    <span>ZemdaFono — Fonoaudiologia</span>
                  </>
                ) : (
                  <span>Atendimento Rápido</span>
                )}
              </span>
            </div>
            <span className="text-slate-500">•</span>
            <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>{currentTenant?.trade_name || currentTenant?.name || 'Clínica'}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Indicador de Autosave */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-[11px]">
              {autosaveStatus === 'saving' && (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  <span className="text-amber-300">Salvando rascunho...</span>
                </>
              )}
              {autosaveStatus === 'saved' && (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-emerald-300">
                    Salvo localmente {lastSavedAt ? `às ${lastSavedAt.toLocaleTimeString().slice(0, 5)}` : ''}
                  </span>
                </>
              )}
              {autosaveStatus === 'error' && (
                <>
                  <span className="w-2 h-2 rounded-full bg-rose-400" />
                  <span className="text-rose-300">Erro ao salvar localmente</span>
                </>
              )}
              {autosaveStatus === 'idle' && (
                <>
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <span className="text-slate-400">Rascunho protegido</span>
                </>
              )}
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
              title="Fechar (seu rascunho está seguro)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* CORPO PRINCIPAL COM SCROLL */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50/50">
          
          {/* BANNER 1: DADOS ESSENCIAIS DO PACIENTE */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              
              {/* Identificação do Paciente */}
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-teal-500 text-white flex items-center justify-center font-bold text-lg shadow-sm flex-shrink-0">
                  {patientName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-bold text-slate-900 leading-tight">
                      {patientName}
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {clientTermLabel}
                    </span>
                    {patientData?.is_child === 1 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        Pediátrico
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 flex-wrap">
                    {patientAge && (
                      <span className="font-semibold text-slate-700">
                        {patientAge} {patientBirth ? `(${new Date(patientBirth + 'T12:00:00').toLocaleDateString('pt-BR')})` : ''}
                      </span>
                    )}
                    {patientPhone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        {patientPhone}
                        {cleanPhone.length >= 10 && (
                          <a
                            href={`https://wa.me/55${cleanPhone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-emerald-600 hover:text-emerald-700 font-bold ml-1"
                            title="Abrir WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </a>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Informações da Consulta Atual */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100 lg:w-auto w-full">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Data & Horário</span>
                  <p className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                    {appointmentDate ? new Date(appointmentDate + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                    {appointmentTime && <span className="text-indigo-600 ml-0.5">às {appointmentTime}</span>}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Profissional</span>
                  <p className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                    <Stethoscope className="w-3.5 h-3.5 text-teal-500" />
                    {appointment.professional_name || 'Profissional'}
                  </p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Procedimento</span>
                  <p className="font-bold text-slate-800 truncate mt-0.5">
                    {appointment.service_name || 'Atendimento Geral'}
                  </p>
                </div>
              </div>

            </div>
          </div>

          {/* BANNER 2: ALERTAS CLÍNICOS VISÍVEIS (Alergias, Medicamentos, Observações) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            
            {/* Alergias: Vermelho se houver, ou indicação segura */}
            <div
              className={`p-3.5 rounded-2xl border transition-all ${
                hasAllergies
                  ? 'bg-rose-50/80 border-rose-200 text-rose-900 shadow-xs'
                  : 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                {hasAllergies ? (
                  <AlertTriangle className="w-4 h-4 text-rose-600 animate-bounce" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                )}
                <span className="font-bold text-xs uppercase tracking-wider">
                  {hasAllergies ? 'Alergias Relatadas' : 'Alergias'}
                </span>
              </div>
              <p className="text-xs leading-relaxed font-medium">
                {hasAllergies ? allergiesText : 'Nenhuma alergia conhecida relatada.'}
              </p>
            </div>

            {/* Medicamentos de uso contínuo */}
            <div className="p-3.5 rounded-2xl border bg-blue-50/50 border-blue-200 text-blue-950">
              <div className="flex items-center gap-2 mb-1">
                <Pill className="w-4 h-4 text-blue-600" />
                <span className="font-bold text-xs uppercase tracking-wider">
                  Medicamentos Contínuos
                </span>
              </div>
              <p className="text-xs leading-relaxed font-medium">
                {medicationsList.length > 0
                  ? medicationsList.map(m => `${m.name} ${m.dosage || ''}`).join(', ')
                  : patientData?.continuous_medications || 'Nenhum medicamento contínuo registrado.'}
              </p>
            </div>

            {/* Observações importantes */}
            <div className="p-3.5 rounded-2xl border bg-amber-50/50 border-amber-200 text-amber-950">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="w-4 h-4 text-amber-600" />
                <span className="font-bold text-xs uppercase tracking-wider">
                  Observações & Alertas
                </span>
              </div>
              <p className="text-xs leading-relaxed font-medium line-clamp-2">
                {patientData?.notes || 'Sem observações administrativas ou clínicas adicionais.'}
              </p>
            </div>

          </div>

          {/* ÁREA CENTRAL: EVOLUÇÃO CLÍNICA COM AUTOSAVE INTEGRADO */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex-1">
                <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1">
                  Título da Consulta / Sessão
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => handleTitleChange(e.target.value)}
                  placeholder="Ex: Consulta Inicial, Sessão 3 de Fisioterapia, Retorno Clínico..."
                  className="w-full text-base font-bold text-slate-800 border border-slate-200 rounded-xl px-3.5 py-2 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              
              <div className="flex items-center gap-2">
                {speech.status === 'idle' || speech.status === 'completed' ? (
                  <button
                    type="button"
                    onClick={handleStartMic}
                    disabled={isGeneratingAi}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                    title="Iniciar captura de áudio da evolução clínica"
                  >
                    <Mic className="w-3.5 h-3.5 text-teal-600" />
                    <span>Iniciar microfone</span>
                  </button>
                ) : speech.status === 'listening' ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handlePauseMic}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 transition-colors cursor-pointer"
                      title="Pausar captura de fala"
                    >
                      <Pause className="w-3.5 h-3.5 text-amber-600" />
                      <span>Pausar</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleStopAndOrganize}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors animate-pulse cursor-pointer shadow-xs"
                      title="Finalizar gravação e estruturar com IA"
                    >
                      <MicOff className="w-3.5 h-3.5" />
                      <span>Finalizar gravação</span>
                    </button>
                  </div>
                ) : speech.status === 'paused' ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleResumeMic}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 transition-colors cursor-pointer"
                      title="Continuar captura de fala"
                    >
                      <Play className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Continuar</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleStopAndOrganize}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors cursor-pointer shadow-xs"
                      title="Finalizar gravação e estruturar com IA"
                    >
                      <MicOff className="w-3.5 h-3.5" />
                      <span>Finalizar gravação</span>
                    </button>
                  </div>
                ) : null}

                {originalSpeechText && !showAiEvolutionModal && (
                  <button
                    type="button"
                    onClick={() => setShowAiEvolutionModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-teal-700 bg-white hover:bg-teal-50 border border-teal-300 transition-colors cursor-pointer"
                    title="Reabrir rascunho de IA gerado a partir da fala"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                    <span>Ver Rascunho IA</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowReferralModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors cursor-pointer"
                  title="Encaminhar paciente para outro colega profissional da clínica"
                >
                  <Share2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Encaminhar</span>
                </button>
              </div>
            </div>

            {/* Painel de Voz: Estados Claros e Transcrição Sem Duplicação */}
            {(speech.status === 'listening' || speech.status === 'paused' || isGeneratingAi || speech.status === 'completed') && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 animate-in fade-in space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    {speech.status === 'listening' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-100 border border-rose-200 text-rose-800 rounded-full font-bold text-xs">
                        <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping inline-block" />
                        Microfone ativo • {formatTimer(speech.recordingSeconds)}
                      </span>
                    )}
                    {speech.status === 'paused' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 border border-amber-200 text-amber-800 rounded-full font-bold text-xs">
                        <Pause className="w-3 h-3 text-amber-700" />
                        Pausado • {formatTimer(speech.recordingSeconds)}
                      </span>
                    )}
                    {isGeneratingAi && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-teal-100 border border-teal-200 text-teal-800 rounded-full font-bold text-xs animate-pulse">
                        <Sparkles className="w-3.5 h-3.5 text-teal-600 animate-spin" />
                        Processando…
                      </span>
                    )}
                    {speech.status === 'completed' && !isGeneratingAi && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-full font-bold text-xs">
                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                        Concluído
                      </span>
                    )}
                    <span className="text-[11px] text-slate-500 hidden sm:inline">
                      MICROFONE + IA focado em: <strong>Evolução Clínica & Conduta Terapêutica</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {speech.status === 'listening' && (
                      <button
                        type="button"
                        onClick={handlePauseMic}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer shadow-2xs"
                      >
                        Pausar
                      </button>
                    )}
                    {speech.status === 'paused' && (
                      <button
                        type="button"
                        onClick={handleResumeMic}
                        className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-lg text-xs font-semibold cursor-pointer shadow-2xs"
                      >
                        Continuar
                      </button>
                    )}
                    {(speech.status === 'listening' || speech.status === 'paused') && (
                      <button
                        type="button"
                        onClick={handleStopAndOrganize}
                        className="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                      >
                        Finalizar gravação
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => speech.resetTranscript()}
                      className="px-2 py-1 text-slate-400 hover:text-rose-600 text-xs cursor-pointer"
                      title="Cancelar e limpar fala"
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                {/* Transcrição limpa sem repetições */}
                <div className="text-xs text-slate-800 bg-white p-3 rounded-xl border border-slate-200 max-h-28 overflow-y-auto leading-relaxed shadow-inner">
                  {speech.finalTranscript ? (
                    <span>
                      {speech.finalTranscript}{' '}
                      {speech.interimTranscript && (
                        <span className="italic text-teal-700/80 bg-teal-50 px-1 rounded">
                          {speech.interimTranscript}
                        </span>
                      )}
                    </span>
                  ) : speech.interimTranscript ? (
                    <span className="italic text-teal-700/80 bg-teal-50 px-1 rounded">
                      {speech.interimTranscript}
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">
                      Escutando fala do atendimento em tempo real... Fale normalmente próximo ao microfone.
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Banner de Processamento IA */}
            {isGeneratingAi && (
              <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 flex items-center gap-3 text-teal-900 animate-pulse">
                <Sparkles className="w-5 h-5 text-teal-600 animate-spin" />
                <div>
                  <h5 className="text-xs font-bold">Zemda IA organizando a evolução clínica...</h5>
                  <p className="text-[11px] text-teal-700">Convertendo a fala em redação técnica clara e conduta, sem inventar informações.</p>
                </div>
              </div>
            )}

            {/* ZEMDAODONTO: MÓDULO EXCLUSIVO DE ODONTOLOGIA & ODONTOGRAMA */}
            {isAppointmentDentist && (
              <div className="bg-gradient-to-br from-cyan-50/80 via-sky-50/40 to-slate-50 border-2 border-cyan-200/90 rounded-2xl p-5 shadow-xs transition-all">
                <div className="flex items-center justify-between pb-3 border-b border-cyan-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-cyan-600 text-white flex items-center justify-center shadow-xs">
                      <Smile className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-800">ZemdaOdonto: Odontograma & Procedimentos</h4>
                        <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800 border border-cyan-200">
                          Exclusivo Odontologia
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Odontograma FDI interativo com marcação de faces (V, L/P, M, D, O), cáries, restaurações e tratamentos.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setZemdaOdontoExpanded(!zemdaOdontoExpanded)}
                    className="p-1.5 rounded-xl text-cyan-700 hover:bg-cyan-100 transition-colors cursor-pointer"
                    title={zemdaOdontoExpanded ? 'Recolher módulo' : 'Expandir módulo'}
                  >
                    {zemdaOdontoExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                </div>

                {zemdaOdontoExpanded && (
                  <div className="pt-4 space-y-4">
                    <OdontogramCanvas
                      currentData={odontogramData}
                      onChange={(updated, changes) => {
                        setOdontogramData(updated);
                        setPendingToothChanges(prev => [...prev, ...changes]);
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* ZEMDAFISIO: MÓDULO EXCLUSIVO DE FISIOTERAPIA & MAPA DE DOR (Regras 3, 4, 5, 6, 7) */}
            {isAppointmentPhysio && (
              <div className="bg-gradient-to-br from-teal-50/70 via-emerald-50/40 to-slate-50 border-2 border-teal-200/80 rounded-2xl p-5 shadow-xs transition-all">
                <div className="flex items-center justify-between pb-3 border-b border-teal-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs">
                      <Activity className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-800">ZemdaFisio: Avaliação & Mapa de Dor</h4>
                        <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
                          Exclusivo Fisioterapia
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Mapa anatômico interativo para marcação de queixas álgicas, escala EVA e condutas motoras.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {physioAssessments.length > 0 && (
                      <div className="flex items-center gap-1">
                        <select
                          value={viewingHistoricalId || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setViewingHistoricalId(val || null);
                            if (val) {
                              const found = physioAssessments.find(a => a.id === val);
                              if (found) {
                                setPainScore(found.pain_score || 0);
                                setPainLocation(found.pain_location || '');
                                setPainCharacteristics(found.pain_characteristics || '');
                                setConductsExercises(found.conducts_exercises || '');
                                if (found.body_map_json) setBodyMapJson(found.body_map_json);
                                if (found.body_map_image) setBodyMapImage(found.body_map_image);
                                showToast(`Carregada sessão anterior de ${found.created_at ? new Date(found.created_at).toLocaleDateString('pt-BR') : ''}`, 'info');
                              }
                            }
                          }}
                          className="text-xs py-1.5 px-2.5 rounded-xl border border-teal-200 bg-white text-teal-900 font-medium cursor-pointer shadow-2xs"
                        >
                          <option value="">Consultar Sessão Anterior ({physioAssessments.length})</option>
                          {physioAssessments.map((pa, idx) => (
                            <option key={pa.id} value={pa.id}>
                              Sessão {physioAssessments.length - idx}: {pa.created_at ? new Date(pa.created_at).toLocaleDateString('pt-BR') : ''} {pa.pain_score ? `(EVA ${pa.pain_score})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setZemdaFisioExpanded(!zemdaFisioExpanded)}
                      className="p-1.5 rounded-xl text-teal-700 hover:bg-teal-100 transition-colors cursor-pointer"
                      title={zemdaFisioExpanded ? 'Recolher módulo' : 'Expandir módulo'}
                    >
                      {zemdaFisioExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {zemdaFisioExpanded && (
                  <div className="pt-4 space-y-4">
                    {/* Escala EVA & Local da Dor */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-1 bg-white p-3 rounded-xl border border-teal-100 shadow-2xs">
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-bold text-slate-700">Intensidade da Dor (EVA)</label>
                          <span className={`text-xs font-black px-2 py-0.5 rounded-md ${
                            painScore === 0 ? 'bg-slate-100 text-slate-600' :
                            painScore <= 3 ? 'bg-emerald-100 text-emerald-800' :
                            painScore <= 7 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {painScore} / 10
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="10"
                          value={painScore}
                          onChange={e => setPainScore(Number(e.target.value))}
                          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
                        />
                        <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-medium">
                          <span>0 Sem dor</span>
                          <span>5 Moderada</span>
                          <span>10 Insuportável</span>
                        </div>
                      </div>

                      <div className="md:col-span-2 bg-white p-3 rounded-xl border border-teal-100 shadow-2xs">
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Localização Principal da Queixa / Região
                        </label>
                        <input
                          type="text"
                          value={painLocation}
                          onChange={e => setPainLocation(e.target.value)}
                          placeholder="Ex: Joelho direito compartimento medial, Lombar L4-L5, Trapézio bilateral..."
                          className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                    </div>

                    {/* Canvas do Mapa de Dor Corporal */}
                    <div className="bg-white p-4 rounded-2xl border border-teal-100 shadow-2xs">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-800">Mapa Anatômico de Dor Corporal</span>
                          <span className="text-[11px] text-slate-500">(Anterior, Posterior e Lateral)</span>
                        </div>
                        {viewingHistoricalId && (
                          <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                            Exibindo sessão histórica
                          </span>
                        )}
                      </div>

                      <BodyPainMapCanvas
                        initialDataJson={bodyMapJson}
                        onSave={(dataJson: string, dataImage: string) => {
                          setBodyMapJson(dataJson);
                          setBodyMapImage(dataImage);
                        }}
                      />
                    </div>

                    {/* Características e Exercícios / Condutas Prescritas */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Características da Dor & Fatores Agravantes
                        </label>
                        <textarea
                          rows={2}
                          value={painCharacteristics}
                          onChange={e => setPainCharacteristics(e.target.value)}
                          placeholder="Ex: Queimação contínua, piora ao agachar ou descer escadas, melhora com repouso..."
                          className="w-full p-2.5 text-xs border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-teal-500 resize-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Condutas Motoras, Exercícios & Recursos Fisioterapêuticos
                        </label>
                        <textarea
                          rows={2}
                          value={conductsExercises}
                          onChange={e => setConductsExercises(e.target.value)}
                          placeholder="Ex: Cinesioterapia ativa-assistida, mobilização Maitland grau II, TENS 100Hz 20min..."
                          className="w-full p-2.5 text-xs border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-teal-500 resize-none"
                        />
                      </div>
                    </div>

                    {/* Botão de Salvar Avaliação Fisioterapêutica */}
                    <div className="flex items-center justify-between pt-2 border-t border-teal-100/80">
                      <p className="text-[11px] text-slate-400 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                        Marcações anatômicas salvas permanentemente no histórico deste paciente.
                      </p>

                      <button
                        type="button"
                        disabled={savingPhysio}
                        onClick={handleSavePhysioData}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-teal-900 bg-teal-100 hover:bg-teal-200 border border-teal-300 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-700" />
                        <span>{savingPhysio ? 'Salvando...' : 'Salvar Mapa e Avaliação ZemdaFisio'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ZEMDANUTRI: MÓDULO EXCLUSIVO DE NUTRIÇÃO & ANTROPOMETRIA */}
            {isAppointmentNutri && (
              <div className="bg-gradient-to-br from-lime-50/80 via-emerald-50/30 to-slate-50 border-2 border-lime-200/90 rounded-2xl p-5 shadow-xs transition-all">
                <div className="flex items-center justify-between pb-3 border-b border-lime-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-lime-600 text-white flex items-center justify-center shadow-xs">
                      <Apple className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-800">ZemdaNutri: Antropometria & Metas Rápidas</h4>
                        <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-lime-100 text-lime-800 border border-lime-200">
                          Exclusivo Nutrição
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Cálculo automático de IMC, RCQ e registro de circunferências corporais.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setZemdaNutriExpanded(!zemdaNutriExpanded)}
                    className="p-1.5 rounded-xl text-lime-700 hover:bg-lime-100 transition-colors cursor-pointer"
                    title={zemdaNutriExpanded ? 'Recolher módulo' : 'Expandir módulo'}
                  >
                    {zemdaNutriExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                </div>

                {zemdaNutriExpanded && (
                  <div className="pt-4 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-white p-3 rounded-xl border border-lime-100 shadow-2xs">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Peso Atual (kg) *</label>
                        <input
                          type="text"
                          value={nutriWeight}
                          onChange={e => setNutriWeight(e.target.value)}
                          placeholder="Ex: 72.5"
                          className="w-full px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg focus:ring-2 focus:ring-lime-500"
                        />
                      </div>
                      <div className="bg-white p-3 rounded-xl border border-lime-100 shadow-2xs">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Altura (cm ou m) *</label>
                        <input
                          type="text"
                          value={nutriHeight}
                          onChange={e => setNutriHeight(e.target.value)}
                          placeholder="Ex: 175 ou 1.75"
                          className="w-full px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg focus:ring-2 focus:ring-lime-500"
                        />
                      </div>
                      <div className="bg-white p-3 rounded-xl border border-lime-100 shadow-2xs">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Cintura (cm)</label>
                        <input
                          type="text"
                          value={nutriWaistCirc}
                          onChange={e => setNutriWaistCirc(e.target.value)}
                          placeholder="Ex: 82"
                          className="w-full px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg focus:ring-2 focus:ring-lime-500"
                        />
                      </div>
                      <div className="bg-white p-3 rounded-xl border border-lime-100 shadow-2xs">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Quadril (cm)</label>
                        <input
                          type="text"
                          value={nutriHipCirc}
                          onChange={e => setNutriHipCirc(e.target.value)}
                          placeholder="Ex: 98"
                          className="w-full px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg focus:ring-2 focus:ring-lime-500"
                        />
                      </div>
                    </div>

                    {/* Resumo Antropométrico Calculado Dinamicamente */}
                    {(() => {
                      const w = parseFloat(nutriWeight.replace(',', '.'));
                      const rawH = parseFloat(nutriHeight.replace(',', '.'));
                      const h = rawH > 3 ? rawH / 100 : rawH;
                      const imc = (w > 0 && h > 0) ? (w / (h * h)).toFixed(1) : null;
                      const wc = parseFloat(nutriWaistCirc.replace(',', '.'));
                      const hc = parseFloat(nutriHipCirc.replace(',', '.'));
                      const rcq = (wc > 0 && hc > 0) ? (wc / hc).toFixed(2) : null;

                      let imcClass = '';
                      let imcColor = 'bg-slate-100 text-slate-700';
                      if (imc) {
                        const imcNum = parseFloat(imc);
                        if (imcNum < 18.5) { imcClass = 'Abaixo do peso'; imcColor = 'bg-amber-100 text-amber-800'; }
                        else if (imcNum < 25) { imcClass = 'Eutrofia (Peso normal)'; imcColor = 'bg-emerald-100 text-emerald-800'; }
                        else if (imcNum < 30) { imcClass = 'Sobrepeso (Pré-obesidade)'; imcColor = 'bg-amber-100 text-amber-800'; }
                        else if (imcNum < 35) { imcClass = 'Obesidade Grau I'; imcColor = 'bg-orange-100 text-orange-800'; }
                        else { imcClass = 'Obesidade Grau II / III'; imcColor = 'bg-rose-100 text-rose-800'; }
                      }

                      return (
                        <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-xl border border-lime-100 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-700">IMC Calculado:</span>
                            {imc ? (
                              <span className={`px-2 py-0.5 rounded-md font-bold text-xs ${imcColor}`}>
                                {imc} kg/m² — {imcClass}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Informe peso e altura</span>
                            )}
                          </div>
                          {rcq && (
                            <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                              <span className="font-bold text-slate-700">Relação Cintura-Quadril (RCQ):</span>
                              <span className="px-2 py-0.5 rounded-md bg-lime-100 text-lime-900 font-bold text-xs">
                                {rcq}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Conduta Nutricional & Prescrições Rápidas
                      </label>
                      <input
                        type="text"
                        value={nutriNotes}
                        onChange={e => setNutriNotes(e.target.value)}
                        placeholder="Ex: Ajuste de macronutrientes, aumento de ingestão hídrica, plano hiperproteico..."
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-lime-500 bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ZEMDATO: MÓDULO EXCLUSIVO DE TERAPIA OCUPACIONAL & FUNCIONALIDADE */}
            {isAppointmentTO && (
              <div className="bg-gradient-to-br from-amber-50/80 via-orange-50/30 to-slate-50 border-2 border-amber-200/90 rounded-2xl p-5 shadow-xs transition-all">
                <div className="flex items-center justify-between pb-3 border-b border-amber-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs">
                      <Hand className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-800">ZemdaTO: Nível de Independência & Perfil Funcional</h4>
                        <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                          Exclusivo Terapia Ocupacional
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Escala funcional de 6 níveis de independência e foco de treino de AVDs.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setZemdaTOExpanded(!zemdaTOExpanded)}
                    className="p-1.5 rounded-xl text-amber-700 hover:bg-amber-100 transition-colors cursor-pointer"
                    title={zemdaTOExpanded ? 'Recolher módulo' : 'Expandir módulo'}
                  >
                    {zemdaTOExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                </div>

                {zemdaTOExpanded && (
                  <div className="pt-4 space-y-4">
                    {/* Escala de 6 Níveis de Independência Funcional */}
                    <div className="bg-white p-3 rounded-xl border border-amber-100 shadow-2xs">
                      <label className="block text-xs font-bold text-slate-700 mb-2">
                        Escala de Independência Funcional para AVDs / AIVDs:
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        {[
                          { level: 1, label: 'Nível 1', desc: 'Dep. Total (0-24%)' },
                          { level: 2, label: 'Nível 2', desc: 'Dep. Máxima (25-49%)' },
                          { level: 3, label: 'Nível 3', desc: 'Dep. Moderada (50-74%)' },
                          { level: 4, label: 'Nível 4', desc: 'Dep. Mínima (75-99%)' },
                          { level: 5, label: 'Nível 5', desc: 'Supervisão / Preparo' },
                          { level: 6, label: 'Nível 6', desc: 'Independência Completa' },
                        ].map(item => (
                          <button
                            key={item.level}
                            type="button"
                            onClick={() => setToIndependenceLevel(item.level)}
                            className={`p-2.5 rounded-xl text-center border transition-all cursor-pointer ${
                              toIndependenceLevel === item.level
                                ? 'bg-amber-500 text-white border-amber-600 shadow-xs font-bold'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-amber-50'
                            }`}
                          >
                            <div className="text-xs font-black">{item.label}</div>
                            <div className={`text-[10px] leading-tight mt-0.5 ${toIndependenceLevel === item.level ? 'text-amber-100' : 'text-slate-500'}`}>
                              {item.desc}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-white p-3 rounded-xl border border-amber-100 shadow-2xs">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Ocupação Principal / Foco de Intervenção
                        </label>
                        <input
                          type="text"
                          value={toMainOccupation}
                          onChange={e => setToMainOccupation(e.target.value)}
                          placeholder="Ex: Alimentação autônoma, vestuário, escrita, integração sensorial..."
                          className="w-full px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                      <div className="bg-white p-3 rounded-xl border border-amber-100 shadow-2xs">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Status do Processamento Sensorial
                        </label>
                        <select
                          value={toSensoryStatus}
                          onChange={e => setToSensoryStatus(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white"
                        >
                          <option value="Típico / Sem desvios evidentes">Típico / Sem desvios evidentes</option>
                          <option value="Hiperresponsivo (Hipersensibilidade tátil/auditiva)">Hiperresponsivo (Hipersensibilidade)</option>
                          <option value="Hiporesponsivo (Sub-registro sensorial)">Hiporesponsivo (Sub-registro sensorial)</option>
                          <option value="Busca Sensorial / Desregulação motora">Busca Sensorial / Desregulação motora</option>
                          <option value="Transtorno do Processamento Sensorial (TPS) em investigação">TPS em investigação</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Conduta de TO, Adaptações & Tecnologia Assistiva
                      </label>
                      <input
                        type="text"
                        value={toNotes}
                        onChange={e => setToNotes(e.target.value)}
                        placeholder="Ex: Prescrição de engrossador de talheres, treino motor fino, plano terapêutico singular..."
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ZEMDAFONO: MÓDULO EXCLUSIVO DE FONOAUDIOLOGIA */}
            {isAppointmentFono && (
              <div className="bg-gradient-to-br from-purple-50/80 via-violet-50/30 to-slate-50 border-2 border-purple-200/90 rounded-2xl p-5 shadow-xs transition-all">
                <div className="flex items-center justify-between pb-3 border-b border-purple-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
                      <Mic className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-800">ZemdaFono: Triagem Fonêmica, Voz & Motricidade</h4>
                        <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                          Exclusivo Fonoaudiologia
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Marcação de fonemas alterados, parâmetros de voz (RASATI) e hábitos miofuncionais.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setZemdaFonoExpanded(!zemdaFonoExpanded)}
                    className="p-1.5 rounded-xl text-purple-700 hover:bg-purple-100 transition-colors cursor-pointer"
                    title={zemdaFonoExpanded ? 'Recolher módulo' : 'Expandir módulo'}
                  >
                    {zemdaFonoExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                </div>

                {zemdaFonoExpanded && (
                  <div className="pt-4 space-y-4">
                    {/* Fonemas Alterados com Seleção Rápida */}
                    <div className="bg-white p-3 rounded-xl border border-purple-100 shadow-2xs">
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Fonemas Alterados / Trocas Fonêmicas na Fala:
                      </label>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {['/r/', '/s/', '/l/', '/ʃ/ (ch)', '/ʒ/ (j)', '/k/', '/g/', '/t/', '/d/', '/p/', '/b/'].map(ph => {
                          const isSelected = fonoPhonemeAltered.includes(ph);
                          return (
                            <button
                              key={ph}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setFonoPhonemeAltered(prev => prev.replace(ph, '').replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '').trim());
                                } else {
                                  setFonoPhonemeAltered(prev => prev ? `${prev}, ${ph}` : ph);
                                }
                              }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-purple-600 text-white shadow-xs'
                                  : 'bg-purple-50 text-purple-800 hover:bg-purple-100 border border-purple-200'
                              }`}
                            >
                              {ph}
                            </button>
                          );
                        })}
                      </div>
                      <input
                        type="text"
                        value={fonoPhonemeAltered}
                        onChange={e => setFonoPhonemeAltered(e.target.value)}
                        placeholder="Ex: /r/ brando (ceceio ou substituição por /l/), /s/ anteriorizado..."
                        className="w-full px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-white p-3 rounded-xl border border-purple-100 shadow-2xs">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Qualidade Vocal (Escala RASATI / Auditiva)
                        </label>
                        <select
                          value={fonoVoiceQuality}
                          onChange={e => setFonoVoiceQuality(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white"
                        >
                          <option value="Adequada">Adequada / Neutra</option>
                          <option value="Rouca (Grau leve/moderado)">Rouca (Grau leve/moderado)</option>
                          <option value="Soprosa (Incompetência glótica)">Soprosa (Incompetência glótica)</option>
                          <option value="Áspera / Tensa (Hiperfunção vocal)">Áspera / Tensa (Hiperfunção)</option>
                          <option value="Astenia vocal (Voz fraca/fadiga)">Astenia vocal (Voz fraca)</option>
                          <option value="Instável (Tremor ou quebras)">Instável (Tremor vocal)</option>
                        </select>
                      </div>
                      <div className="bg-white p-3 rounded-xl border border-purple-100 shadow-2xs">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Hábitos Miofuncionais Orofaciais
                        </label>
                        <select
                          value={fonoOrofacialHabit}
                          onChange={e => setFonoOrofacialHabit(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white"
                        >
                          <option value="Nenhum">Nenhum / Padrão típico</option>
                          <option value="Respiração Oral">Respiração Oral</option>
                          <option value="Deglutição Atípica com interposição lingual">Deglutição Atípica</option>
                          <option value="Bruxismo / Apertamento dental">Bruxismo / Apertamento</option>
                          <option value="Sucção digital / Chupeta prolongada">Sucção de Polegar / Chupeta</option>
                          <option value="Mastigação unilateral viciosa">Mastigação unilateral</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Conduta Fonoaudiológica & Exercícios Miofuncionais
                      </label>
                      <input
                        type="text"
                        value={fonoNotes}
                        onChange={e => setFonoNotes(e.target.value)}
                        placeholder="Ex: Exercício de vibração de língua e lábios, treino de ponto articulatório, higiene vocal..."
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Campo Principal de Evolução */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Evolução Clínica & Conduta Terapêutica *
                </label>
                <span className="text-[11px] text-slate-400">
                  {clinicalEvolution.length} caracteres
                </span>
              </div>
              <textarea
                rows={10}
                value={clinicalEvolution}
                onChange={e => handleEvolutionChange(e.target.value)}
                placeholder="Descreva a queixa principal, anamnese, exame clínico, procedimentos realizados, evolução do paciente e conduta adotada nesta sessão..."
                className="w-full text-sm leading-relaxed p-4 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white shadow-inner resize-y font-sans text-slate-800"
              />
              <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                Texto salvo continuamente contra perdas acidentais no navegador e recuperável a qualquer momento.
              </p>
            </div>

            {/* Anotações Técnicas / Orientações */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Orientações Complementares / Tarefas para Casa
              </label>
              <textarea
                rows={3}
                value={technicalNotes}
                onChange={e => handleNotesChange(e.target.value)}
                placeholder="Orientações de cuidados, observações para a equipe ou metas para o próximo retorno..."
                className="w-full text-xs p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50/50"
              />
            </div>

            {/* Checkbox de Lacração */}
            <div className="bg-amber-50/60 p-3.5 rounded-xl border border-amber-200/80 flex items-center gap-3">
              <input
                type="checkbox"
                id="sealRecord"
                checked={isSealed}
                onChange={e => setIsSealed(e.target.checked)}
                className="w-4 h-4 text-teal-600 rounded-sm cursor-pointer"
              />
              <label htmlFor="sealRecord" className="text-xs font-medium text-amber-950 cursor-pointer">
                <span className="font-bold">Lacrar prontuário eletrônico:</span> impede edições futuras neste registro clínico para total conformidade jurídica.
              </label>
            </div>

          </div>

        </div>

        {/* BARRA DE AÇÕES INFERIOR */}
        <div className="bg-white border-t border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleManualSaveDraft}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Salvar Rascunho</span>
            </button>

            <button
              type="button"
              disabled={savingRecord}
              onClick={handleSaveEvolution}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-slate-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
              <span>{savingRecord ? 'Gravando...' : 'Salvar Evolução'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Fechar
            </button>

            {(isAppointmentPhysio || isAppointmentDentist || isAppointmentNutri || isAppointmentTO || isAppointmentFono) ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowFinishModal(true)}
                  className="px-3.5 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-50 border border-teal-200 rounded-xl transition-colors cursor-pointer"
                  title="Emitir atestados, prescrições ou encaminhamentos"
                >
                  Documentos / Atestado
                </button>
                <button
                  type="button"
                  disabled={savingRecord}
                  onClick={handleFinalizeAttendance}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 shadow-md shadow-teal-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{savingRecord ? 'Finalizando...' : 'Finalizar Atendimento'}</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowFinishModal(true)}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 shadow-md shadow-teal-500/20 transition-all cursor-pointer"
              >
                <span>Finalizar Atendimento</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

      </div>

      {/* MODAL DE ENCAMINHAMENTO INTERPROFISSIONAL */}
      {showReferralModal && (
        <ReferralModal
          isOpen={true}
          patientId={appointment.patient_id}
          patientName={patientName}
          originAppointmentId={appointment.id}
          onClose={() => setShowReferralModal(false)}
          onSuccess={() => {
            setShowReferralModal(false);
            showToast('Encaminhamento interprofissional registrado com sucesso!', 'success');
          }}
        />
      )}

      {/* MODAL DE PÓS-ATENDIMENTO / DOCUMENTOS / RETORNO */}
      {showFinishModal && (
        <FinishConsultationModal
          appointment={{
            id: appointment.id,
            patient_id: appointment.patient_id,
            patient_name: patientName,
            professional_id: appointment.professional_id,
            professional_name: appointment.professional_name,
            service_id: appointment.service_id,
            service_name: appointment.service_name,
            start_time: appointment.start_time
          }}
          clinicalData={{
            title,
            clinicalEvolution,
            technicalNotes,
            isSealed,
            odontogramData: isAppointmentDentist ? odontogramData : undefined,
            toothChanges: isAppointmentDentist ? pendingToothChanges : undefined,
            moduleType: isAppointmentDentist ? 'ZemdaOdonto' : isAppointmentNutri ? 'ZemdaNutri' : isAppointmentTO ? 'ZemdaTO' : isAppointmentFono ? 'ZemdaFono' : isAppointmentPhysio ? 'ZemdaFisio' : undefined,
            moduleData: isAppointmentTO ? { independenceLevel: toIndependenceLevel, mainOccupation: toMainOccupation, sensoryStatus: toSensoryStatus, notes: toNotes }
              : isAppointmentFono ? { phonemeAltered: fonoPhonemeAltered, voiceQuality: fonoVoiceQuality, orofacialHabit: fonoOrofacialHabit, notes: fonoNotes }
              : isAppointmentPhysio ? { painScore, painLocation, painCharacteristics, conductsExercises, bodyMapJson, bodyMapImage }
              : undefined,
            assessmentData: isAppointmentNutri && nutriWeight ? {
              weight: parseFloat(nutriWeight.replace(',', '.')),
              height: nutriHeight ? parseFloat(nutriHeight.replace(',', '.')) : null,
              waistCirc: nutriWaistCirc ? parseFloat(nutriWaistCirc.replace(',', '.')) : null,
              abdominalCirc: nutriAbdominalCirc ? parseFloat(nutriAbdominalCirc.replace(',', '.')) : null,
              hipCirc: nutriHipCirc ? parseFloat(nutriHipCirc.replace(',', '.')) : null,
              notes: nutriNotes || null
            } : undefined
          }}
          onClose={() => setShowFinishModal(false)}
          onFinished={() => {
            setShowFinishModal(false);
            onFinished();
            onClose();
          }}
        />
      )}

      {/* MODAL DE RASCUNHO GERADO POR IA (Evolução Clínica) */}
      {showAiEvolutionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200 text-xs">
            
            {/* Cabeçalho */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-teal-50 border border-teal-200 rounded-xl">
                  <Sparkles className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">Evolução Clínica & Conduta com IA</h3>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {aiProvider}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Fala do atendimento transformada em texto clínico estruturado para conferência prévia.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                title="Fechar rascunho"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Aviso Obrigatório de Rascunho (Item 7) */}
            <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-2 text-amber-900">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-xs font-semibold">
                  ⚠️ <strong>Rascunho gerado por IA — revise antes de salvar.</strong>
                </span>
              </div>
              <span className="text-[10px] font-medium text-amber-700 hidden sm:inline">
                Nenhum dado é salvo no prontuário sem sua confirmação explícita.
              </span>
            </div>

            {/* Alerta em caso de erro na IA (Item 10) */}
            {aiError && (
              <div className="mt-2.5 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between gap-2 text-rose-900">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span className="text-xs">{aiError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleTransformMode(currentAiMode)}
                  disabled={isGeneratingAi}
                  className="px-2.5 py-1 bg-white hover:bg-rose-100 border border-rose-300 text-rose-800 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {/* Opções Rápidas de Transformação (Item 8) */}
            <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1.5 border-b border-slate-100">
              <span className="text-[10px] uppercase font-bold text-slate-400 shrink-0 mr-1">
                Opções Rápidas:
              </span>
              {[
                { key: 'organize', label: '✨ Organizar evolução' },
                { key: 'summarize', label: '📋 Resumir' },
                { key: 'technical', label: '🩺 Tornar mais técnico' },
                { key: 'objective', label: '🎯 Tornar mais objetivo' },
                { key: 'separate', label: '⚖️ Separar evolução e conduta' },
                { key: 'grammar', label: '✍️ Corrigir gramática' }
              ].map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => handleTransformMode(opt.key)}
                  disabled={isGeneratingAi}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer shrink-0 disabled:opacity-50 ${
                    currentAiMode === opt.key
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>

            {/* Abas de Visualização e Comparação (Item 9) */}
            <div className="mt-2.5 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setComparisonTab('split')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    comparisonTab === 'split'
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  📑 Comparar Lado a Lado
                </button>
                <button
                  type="button"
                  onClick={() => setComparisonTab('organized')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    comparisonTab === 'organized'
                      ? 'bg-teal-50 text-teal-700 border border-teal-200'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  📄 Versão Organizada
                </button>
                <button
                  type="button"
                  onClick={() => setComparisonTab('original')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    comparisonTab === 'original'
                      ? 'bg-slate-200 text-slate-800 border border-slate-300'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  🎙️ Transcrição Original
                </button>
              </div>

              <div className="flex items-center gap-2">
                {!isEditingDraft ? (
                  <button
                    type="button"
                    onClick={() => setIsEditingDraft(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-700 hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                    <span>Editar rascunho</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setOrganizedDraft(editedDraftText);
                      setIsEditingDraft(false);
                      showToast('Edição do rascunho salva temporariamente!', 'info');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer shadow-xs"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Concluir edição</span>
                  </button>
                )}
              </div>
            </div>

            {/* Corpo com Comparação de Conteúdo */}
            <div className="flex-1 overflow-y-auto py-3 space-y-3">
              {comparisonTab === 'split' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 h-full min-h-[260px]">
                  {/* Coluna 1: Transcrição Original (Preservada) */}
                  <div className="flex flex-col bg-slate-50 border border-slate-200 rounded-2xl p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-700 flex items-center gap-1.5">
                        <Mic className="w-3.5 h-3.5 text-slate-500" />
                        TRANSCRIÇÃO ORIGINAL (Fala falada)
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {originalSpeechText.length} caracteres
                      </span>
                    </div>
                    <div className="flex-1 bg-white p-3 rounded-xl border border-slate-200 text-xs text-slate-700 leading-relaxed overflow-y-auto font-mono whitespace-pre-wrap select-text shadow-inner">
                      {originalSpeechText || 'Nenhuma fala transcrita.'}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">
                      Texto verbatim capturado pelo microfone, preservado na íntegra.
                    </p>
                  </div>

                  {/* Coluna 2: Versão Organizada pela IA */}
                  <div className="flex flex-col bg-teal-50/50 border border-teal-200 rounded-2xl p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-teal-900 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                        VERSÃO ORGANIZADA PELA IA
                      </span>
                      <span className="text-[10px] text-teal-700 font-semibold">
                        {getModeLabel(currentAiMode)}
                      </span>
                    </div>
                    {isEditingDraft ? (
                      <textarea
                        rows={10}
                        value={editedDraftText}
                        onChange={e => setEditedDraftText(e.target.value)}
                        className="flex-1 w-full bg-white p-3 rounded-xl border border-teal-300 text-xs text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal-500 font-sans resize-none shadow-inner"
                        placeholder="Edite o rascunho organizado..."
                      />
                    ) : (
                      <div className="flex-1 bg-white p-3 rounded-xl border border-teal-200 text-xs text-slate-800 leading-relaxed overflow-y-auto whitespace-pre-wrap shadow-inner">
                        {isGeneratingAi ? (
                          <div className="flex items-center justify-center h-full text-slate-400 animate-pulse gap-2">
                            <Sparkles className="w-4 h-4 animate-spin text-teal-600" />
                            <span>Organizando texto com IA...</span>
                          </div>
                        ) : (
                          organizedDraft || 'Nenhum rascunho gerado.'
                        )}
                      </div>
                    )}
                    <p className="text-[10px] text-teal-700 mt-2">
                      Sem adições de diagnósticos ou medicamentos não falados.
                    </p>
                  </div>
                </div>
              ) : comparisonTab === 'organized' ? (
                <div className="bg-teal-50/50 border border-teal-200 rounded-2xl p-4 flex flex-col min-h-[260px]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-teal-900 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                      VERSÃO ORGANIZADA PELA IA
                    </span>
                    <span className="text-[10px] text-teal-700 font-semibold">
                      {getModeLabel(currentAiMode)}
                    </span>
                  </div>
                  {isEditingDraft ? (
                    <textarea
                      rows={12}
                      value={editedDraftText}
                      onChange={e => setEditedDraftText(e.target.value)}
                      className="w-full bg-white p-3.5 rounded-xl border border-teal-300 text-xs text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal-500 font-sans shadow-inner"
                      placeholder="Edite o rascunho organizado..."
                    />
                  ) : (
                    <div className="bg-white p-3.5 rounded-xl border border-teal-200 text-xs text-slate-800 leading-relaxed whitespace-pre-wrap shadow-inner min-h-[200px]">
                      {isGeneratingAi ? (
                        <div className="flex items-center justify-center py-10 text-slate-400 animate-pulse gap-2">
                          <Sparkles className="w-4 h-4 animate-spin text-teal-600" />
                          <span>Organizando texto com IA...</span>
                        </div>
                      ) : (
                        organizedDraft || 'Nenhum rascunho gerado.'
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col min-h-[260px]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-700 flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5 text-slate-500" />
                      TRANSCRIÇÃO ORIGINAL (Áudio verbatim)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(originalSpeechText);
                        showToast('Transcrição original copiada!', 'info');
                      }}
                      className="flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copiar original
                    </button>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-mono shadow-inner min-h-[200px]">
                    {originalSpeechText || 'Nenhuma fala transcrita.'}
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé de Ações (Item 7) */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="flex items-center gap-1 px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Descartar rascunho</span>
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleTransformMode(currentAiMode)}
                  disabled={isGeneratingAi}
                  className="inline-flex items-center gap-1 px-3 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                  title="Gerar novamente com o mesmo modo"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Gerar novamente</span>
                </button>

                {clinicalEvolution.trim() && (
                  <button
                    type="button"
                    onClick={() => handleApplyDraft('append')}
                    disabled={isGeneratingAi}
                    className="px-3.5 py-2 border border-teal-600 text-teal-700 hover:bg-teal-50 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                    title="Adicionar o rascunho ao final do texto já existente na evolução"
                  >
                    Adicionar ao final
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleApplyDraft('replace')}
                  disabled={isGeneratingAi}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-teal-500/20 cursor-pointer disabled:opacity-50"
                  title="Substituir campo de evolução pelo rascunho revisado"
                >
                  <Check className="w-4 h-4" />
                  <span>Usar texto na Evolução</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
