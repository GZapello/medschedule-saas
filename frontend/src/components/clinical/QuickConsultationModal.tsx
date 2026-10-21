import { takeReviewedEvolution } from '../../utils/teleconsultation';
import { generateWhatsAppUrl } from '../../utils/phone.utils';
import { ClinicalPainScale } from './ClinicalPainScale';
import { useClinicalFormReset } from '../../hooks/useClinicalFormReset';
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Plus,
  Edit2,
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
  Brain,
  Heart,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link2,
  Undo2,
  Redo2,
  LayoutTemplate,
  Video,
  MapPin
} from 'lucide-react';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { ReferralModal } from './ReferralModal';
import { PatientPreviousRecordsModal } from './PatientPreviousRecordsModal';
import { PatientFollowUpDocumentModal } from './PatientFollowUpDocumentModal';
import { FinishConsultationModal } from './FinishConsultationModal';
import { BodyPainMapCanvas } from '../physiotherapy/BodyPainMapCanvas';
import { OdontogramCanvas, OdontogramData } from '../dentistry/OdontogramCanvas';
import { OnlineConsultationTools } from './OnlineConsultationTools';
import { ZemdaBodyModal } from '../zemda-body/ZemdaBodyModal';
import { ConsentPendingAlert } from '../consents/ConsentPendingAlert';
import { PatientConsentsDialog } from '../consents/PatientConsentsPanel';

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
    meeting_url?: string | null;
    google_drive_url?: string | null;
    status?: string;
    clinical_module?: string;
    display_amount?: number;
    payment_amount?: number;
    service_price?: number;
    duration_minutes?: number;
    attendance_start_at?: string | null;
    attendance_expected_end_at?: string | null;
    attendance_end_at?: string | null;
  };
  onMeetingUrlSaved?: (url: string | null) => void;
  onDriveUrlSaved?: (url: string | null) => void;
  moduleType?: string;
  onClose: () => void;
  onFinished: () => void;
  onOpenZemdaBody?: () => void;
  onOpenSpecializedModule?: () => void;
  specializedModuleName?: string;
  initialWorkspaceTab?: 'resumo' | 'evolucao' | 'modulo' | 'documentos' | 'finalizacao';
}

export const QuickConsultationModal: React.FC<QuickConsultationModalProps> = ({
  appointment,
  onMeetingUrlSaved,
  onDriveUrlSaved,
  moduleType,
  onClose,
  onFinished,
  onOpenZemdaBody,
  onOpenSpecializedModule,
  specializedModuleName,
  initialWorkspaceTab
}) => {
  const {
    currentTenant,
    clientTermLabel,
    isPhysiotherapist,
    isDentist,
    isNutritionist,
    isOccupationalTherapist,
    isSpeechTherapist,
    isPsychopedagogue,
    isZemdaPP,
    isZemdaBody,
    canAccessConsents,
    currentUser,
    hasCapability
  } = useAuth();
  const { showToast } = useToast();
  const [showConsentsDialog, setShowConsentsDialog] = useState<boolean>(false);
  const [realStartAt, setRealStartAt] = useState<string | null>(appointment.attendance_start_at || null);
  const [expectedEndAt, setExpectedEndAt] = useState<string | null>(appointment.attendance_expected_end_at || null);
  const [realEndAt, setRealEndAt] = useState<string | null>(appointment.attendance_end_at || null);
  const [editingRealTime, setEditingRealTime] = useState<boolean>(false);
  const [savingRealTime, setSavingRealTime] = useState<boolean>(false);
  const [editRealDate, setEditRealDate] = useState<string>('');
  const [editRealStartTime, setEditRealStartTime] = useState<string>('');
  const [editExpectedEndTime, setEditExpectedEndTime] = useState<string>('');
  const [expectedEndManuallyEdited, setExpectedEndManuallyEdited] = useState<boolean>(false);

  useEffect(() => {
    setRealStartAt(appointment.attendance_start_at || null);
    setExpectedEndAt(appointment.attendance_expected_end_at || null);
    setRealEndAt(appointment.attendance_end_at || null);
    setEditingRealTime(false);
  }, [appointment.id, appointment.attendance_start_at, appointment.attendance_expected_end_at, appointment.attendance_end_at]);

  const computeExpectedEndHHMM = (startHHMM: string): string => {
    const m = startHHMM.match(/^(\d{2}):(\d{2})/);
    if (!m) return '';
    let duration = Number(appointment.duration_minutes) || 0;
    if (duration <= 0 && appointment.start_time && appointment.end_time) {
      const diff = Math.round((new Date(appointment.end_time).getTime() - new Date(appointment.start_time).getTime()) / 60000);
      if (diff > 0 && diff <= 720) duration = diff;
    }
    if (duration <= 0) duration = 50;
    const totalMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + duration;
    const endH = String(Math.floor((totalMin / 60) % 24)).padStart(2, '0');
    const endMin = String(totalMin % 60).padStart(2, '0');
    return `${endH}:${endMin}`;
  };

  const openEditRealTime = () => {
    const baseStartIso = realStartAt || appointment.start_time || '';
    const baseDate = baseStartIso ? baseStartIso.replace(' ', 'T').split('T')[0] : new Date().toISOString().split('T')[0];
    const baseStartHHMM = baseStartIso ? (baseStartIso.replace(' ', 'T').split('T')[1]?.slice(0, 5) || '08:00') : '08:00';
    const baseExpectedIso = expectedEndAt || appointment.end_time || '';
    const baseExpectedHHMM = expectedEndAt
      ? (expectedEndAt.replace(' ', 'T').split('T')[1]?.slice(0, 5) || computeExpectedEndHHMM(baseStartHHMM))
      : (computeExpectedEndHHMM(baseStartHHMM) || (baseExpectedIso ? baseExpectedIso.replace(' ', 'T').split('T')[1]?.slice(0, 5) : '08:50'));
    setEditRealDate(baseDate);
    setEditRealStartTime(baseStartHHMM);
    setEditExpectedEndTime(baseExpectedHHMM);
    setExpectedEndManuallyEdited(false);
    setEditingRealTime(true);
  };

  const handleSaveRealAttendanceTime = async () => {
    if (!editRealDate || !editRealStartTime) {
      showToast('Informe a data e o horário real de início.', 'error');
      return;
    }
    if (editExpectedEndTime && editExpectedEndTime <= editRealStartTime) {
      showToast('A previsão de término não pode ser anterior ou igual ao horário de início.', 'error');
      return;
    }
    try {
      setSavingRealTime(true);
      const res = await ApiClient.put<any>(`/v1/appointments/${appointment.id}/attendance-time`, {
        attendanceDate: editRealDate,
        attendanceStartTime: editRealStartTime,
        attendanceExpectedEndTime: editExpectedEndTime || undefined
      });
      if (res?.appointment) {
        setRealStartAt(res.appointment.attendance_start_at || null);
        setExpectedEndAt(res.appointment.attendance_expected_end_at || null);
        setRealEndAt(res.appointment.attendance_end_at || null);
      } else {
        setRealStartAt(`${editRealDate}T${editRealStartTime}:00`);
        if (editExpectedEndTime) setExpectedEndAt(`${editRealDate}T${editExpectedEndTime}:00`);
      }
      setEditingRealTime(false);
      showToast('Horário real do atendimento atualizado!', 'success');
      window.dispatchEvent(new CustomEvent('zemda-appointment-updated'));
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar horário real do atendimento.', 'error');
    } finally {
      setSavingRealTime(false);
    }
  };

  const effectiveModule = (moduleType && moduleType !== 'general' ? moduleType : undefined) ||
    (appointment.clinical_module && appointment.clinical_module !== 'general' && appointment.clinical_module !== 'ZemdaBody' ? appointment.clinical_module : undefined);

  const isAppointmentPP =
    effectiveModule === 'ZemdaPP' ||
    isPsychopedagogue ||
    isZemdaPP ||
    Boolean(appointment.clinical_module === 'ZemdaPP') ||
    (appointment.service_name || '').toLowerCase().includes('psicopedag') ||
    (currentUser?.professionName || '').toLowerCase().includes('psicopedag') ||
    (currentUser?.professionSlug || '').toLowerCase().includes('psicopedag');

  const [loadingPatient, setLoadingPatient] = useState<boolean>(true);
  const [patientData, setPatientData] = useState<any>(null);
  const [allergiesList, setAllergiesList] = useState<any[]>([]);
  const [medicationsList, setMedicationsList] = useState<any[]>([]);

  // Estados dos Modais Rápidos de Alertas Clínicos (Alergias, Medicamentos, Observações)
  const [showAllergiesModal, setShowAllergiesModal] = useState<boolean>(false);
  const [showMedicationsModal, setShowMedicationsModal] = useState<boolean>(false);
  const [showAlertsModal, setShowAlertsModal] = useState<boolean>(false);
  const [editingAllergyId, setEditingAllergyId] = useState<string | null>(null);
  const [allergyForm, setAllergyForm] = useState({ substance: '', reactionType: '', severity: '', notes: '' });
  const [editingMedicationId, setEditingMedicationId] = useState<string | null>(null);
  const [medicationForm, setMedicationForm] = useState({ medicationName: '', dosage: '', frequency: '', route: 'oral', status: 'active', notes: '' });
  const [alertsForm, setAlertsForm] = useState({ importantAlert: '', clinicalNotes: '', notesAdmin: '' });

  // ZemdaFisio - Mapa de Dor & Avaliação Fisioterapêutica
  const [isAppointmentPhysio, setIsAppointmentPhysio] = useState<boolean>(() => effectiveModule ? effectiveModule === 'ZemdaFisio' : !!isPhysiotherapist);
  const [zemdaFisioExpanded, setZemdaFisioExpanded] = useState<boolean>(true);
  const [bodyMapJson, setBodyMapJson] = useState<string>('');
  const [bodyMapImage, setBodyMapImage] = useState<string>('');
  const [painScore, setPainScore] = useState<number | ''>('');
  const [painLocation, setPainLocation] = useState<string>('');
  const [painCharacteristics, setPainCharacteristics] = useState<string>('');
  const [conductsExercises, setConductsExercises] = useState<string>('');
  const [physioAssessments, setPhysioAssessments] = useState<any[]>([]);
  const [viewingHistoricalId, setViewingHistoricalId] = useState<string | null>(null);
  const [savingPhysio, setSavingPhysio] = useState<boolean>(false);

  // ZemdaOdonto - Odontograma & Procedimentos Odontológicos
  const [isAppointmentDentist, setIsAppointmentDentist] = useState<boolean>(() => effectiveModule ? effectiveModule === 'ZemdaOdonto' : !!isDentist);
  const [zemdaOdontoExpanded, setZemdaOdontoExpanded] = useState<boolean>(true);
  const [odontogramData, setOdontogramData] = useState<OdontogramData>({});
  const [pendingToothChanges, setPendingToothChanges] = useState<any[]>([]);

  // ZemdaNutri - Nutrição & Antropometria Rápida
  const [isAppointmentNutri, setIsAppointmentNutri] = useState<boolean>(() => effectiveModule ? effectiveModule === 'ZemdaNutri' : !!isNutritionist);
  const [zemdaNutriExpanded, setZemdaNutriExpanded] = useState<boolean>(true);
  const [nutriWeight, setNutriWeight] = useState<string>('');
  const [nutriHeight, setNutriHeight] = useState<string>('');
  const [nutriWaistCirc, setNutriWaistCirc] = useState<string>('');
  const [nutriAbdominalCirc, setNutriAbdominalCirc] = useState<string>('');
  const [nutriHipCirc, setNutriHipCirc] = useState<string>('');
  const [nutriNotes, setNutriNotes] = useState<string>('');

  // ZemdaTO - Terapia Ocupacional
  const [isAppointmentTO, setIsAppointmentTO] = useState<boolean>(() => effectiveModule ? effectiveModule === 'ZemdaTO' : !!isOccupationalTherapist);
  const [zemdaTOExpanded, setZemdaTOExpanded] = useState<boolean>(true);
  const [toIndependenceLevel, setToIndependenceLevel] = useState<number | ''>('');
  const [toMainOccupation, setToMainOccupation] = useState<string>('');
  const [toSensoryStatus, setToSensoryStatus] = useState<string>('');
  const [toNotes, setToNotes] = useState<string>('');

  // ZemdaFono - Fonoaudiologia
  const [isAppointmentFono, setIsAppointmentFono] = useState<boolean>(() => effectiveModule ? effectiveModule === 'ZemdaFono' : !!isSpeechTherapist);
  const [zemdaFonoExpanded, setZemdaFonoExpanded] = useState<boolean>(true);
  const [fonoPhonemeAltered, setFonoPhonemeAltered] = useState<string>('');
  const [fonoVoiceQuality, setFonoVoiceQuality] = useState<string>('');
  const [fonoOrofacialHabit, setFonoOrofacialHabit] = useState<string>('');
  const [fonoNotes, setFonoNotes] = useState<string>('');

  const activeModuleType = effectiveModule || (
    isAppointmentDentist ? 'ZemdaOdonto' :
    isAppointmentNutri ? 'ZemdaNutri' :
    isAppointmentTO ? 'ZemdaTO' :
    isAppointmentFono ? 'ZemdaFono' :
    isAppointmentPhysio ? 'ZemdaFisio' :
    isAppointmentPP ? 'ZemdaPP' :
    'general'
  );

  const resolvedSpecializedName = specializedModuleName || (
    isAppointmentPP ? 'ZemdaPP' :
    isSpeechTherapist || effectiveModule === 'ZemdaFono' ? 'ZemdaFono' :
    isDentist || effectiveModule === 'ZemdaOdonto' ? 'ZemdaOdonto' :
    isOccupationalTherapist || effectiveModule === 'ZemdaTO' ? 'ZemdaTO' :
    isNutritionist || effectiveModule === 'ZemdaNutri' ? 'ZemdaNutri' :
    isPhysiotherapist || effectiveModule === 'ZemdaFisio' ? 'ZemdaFisio' :
    undefined
  );

  const [showZemdaBodyModal, setShowZemdaBodyModal] = useState<boolean>(false);
  const [showPreviousRecordsModal, setShowPreviousRecordsModal] = useState<boolean>(false);

  // Campos clínicos
  const [title, setTitle] = useState<string>(
    `Consulta de ${appointment.service_name || 'Rotina'}`
  );
  const [clinicalEvolution, setClinicalEvolution] = useState<string>('');
  const [technicalNotes, setTechnicalNotes] = useState<string>('');
  useClinicalFormReset(appointment.id, [
    [bodyMapJson, setBodyMapJson],
    [bodyMapImage, setBodyMapImage],
    [painScore, setPainScore],
    [painLocation, setPainLocation],
    [painCharacteristics, setPainCharacteristics],
    [conductsExercises, setConductsExercises],
    [odontogramData, setOdontogramData],
    [pendingToothChanges, setPendingToothChanges],
    [nutriWeight, setNutriWeight],
    [nutriHeight, setNutriHeight],
    [nutriWaistCirc, setNutriWaistCirc],
    [nutriAbdominalCirc, setNutriAbdominalCirc],
    [nutriHipCirc, setNutriHipCirc],
    [nutriNotes, setNutriNotes],
    [toIndependenceLevel, setToIndependenceLevel],
    [toMainOccupation, setToMainOccupation],
    [toSensoryStatus, setToSensoryStatus],
    [toNotes, setToNotes],
    [fonoPhonemeAltered, setFonoPhonemeAltered],
    [fonoVoiceQuality, setFonoVoiceQuality],
    [fonoOrofacialHabit, setFonoOrofacialHabit],
    [fonoNotes, setFonoNotes],
    [clinicalEvolution, setClinicalEvolution],
    [technicalNotes, setTechnicalNotes],
  ]);

  const [isSealed, setIsSealed] = useState<boolean>(false);

  // Status de autosave
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Sub-modais
  const [showReferralModal, setShowReferralModal] = useState<boolean>(false);
  const [showFinishModal, setShowFinishModal] = useState<boolean>(false);
  const [showFollowUpDocModal, setShowFollowUpDocModal] = useState<boolean>(false);
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


  const loadPatientDetails = useCallback(async () => {
    if (!appointment.patient_id) return;
    try {
      setLoadingPatient(true);
      const [patRes, allergiesRes, medsRes] = await Promise.allSettled([
        ApiClient.get<any>(`/v1/patients/${appointment.patient_id}`),
        ApiClient.get<any[]>(`/v1/patients/${appointment.patient_id}/allergies`),
        ApiClient.get<any[]>(`/v1/patients/${appointment.patient_id}/medications`)
      ]);

      if (patRes.status === 'fulfilled') {
        setPatientData(patRes.value);
        setAlertsForm({
          importantAlert: patRes.value?.important_alert || '',
          clinicalNotes: patRes.value?.clinical_notes || '',
          notesAdmin: patRes.value?.notes_admin || patRes.value?.notes || ''
        });
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
  }, [appointment.patient_id]);

  useEffect(() => {
    loadPatientDetails();
  }, [loadPatientDetails]);

  // Handlers para Alergias
  const handleSaveAllergy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allergyForm.substance.trim()) {
      showToast('Informe o nome da substância ou alérgeno.', 'error');
      return;
    }
    try {
      if (editingAllergyId) {
        await ApiClient.put(`/v1/patients/${appointment.patient_id}/allergies/${editingAllergyId}`, allergyForm);
        showToast('Alergia atualizada com sucesso!', 'success');
      } else {
        await ApiClient.post(`/v1/patients/${appointment.patient_id}/allergies`, allergyForm);
        showToast('Alergia cadastrada com sucesso!', 'success');
      }
      setAllergyForm({ substance: '', reactionType: '', severity: '', notes: '' });
      setEditingAllergyId(null);
      setShowAllergiesModal(false);
      await loadPatientDetails();
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar alergia', 'error');
    }
  };

  const handleDeleteAllergy = async (allergyId: string) => {
    if (!confirm('Deseja excluir esta alergia?')) return;
    try {
      await ApiClient.delete(`/v1/patients/${appointment.patient_id}/allergies/${allergyId}`);
      showToast('Alergia removida.', 'info');
      await loadPatientDetails();
    } catch (err: any) {
      showToast(err.message || 'Erro ao remover alergia', 'error');
    }
  };

  // Handlers para Medicamentos
  const handleSaveMedication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!medicationForm.medicationName.trim()) {
      showToast('Informe o nome do medicamento.', 'error');
      return;
    }
    try {
      if (editingMedicationId) {
        await ApiClient.put(`/v1/patients/${appointment.patient_id}/medications/${editingMedicationId}`, medicationForm);
        showToast('Medicamento atualizado com sucesso!', 'success');
      } else {
        await ApiClient.post(`/v1/patients/${appointment.patient_id}/medications`, medicationForm);
        showToast('Medicamento cadastrado com sucesso!', 'success');
      }
      setMedicationForm({ medicationName: '', dosage: '', frequency: '', route: 'oral', status: 'active', notes: '' });
      setEditingMedicationId(null);
      setShowMedicationsModal(false);
      await loadPatientDetails();
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar medicamento', 'error');
    }
  };

  const handleDeleteMedication = async (medId: string) => {
    if (!confirm('Deseja excluir este medicamento?')) return;
    try {
      await ApiClient.delete(`/v1/patients/${appointment.patient_id}/medications/${medId}`);
      showToast('Medicamento removido.', 'info');
      await loadPatientDetails();
    } catch (err: any) {
      showToast(err.message || 'Erro ao remover medicamento', 'error');
    }
  };

  // Handler para Alertas e Observações
  const handleSaveAlerts = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ApiClient.put(`/v1/patients/${appointment.patient_id}`, {
        important_alert: alertsForm.importantAlert,
        importantAlert: alertsForm.importantAlert,
        clinical_notes: alertsForm.clinicalNotes,
        clinicalNotes: alertsForm.clinicalNotes,
        notes: alertsForm.notesAdmin,
        notes_admin: alertsForm.notesAdmin
      });
      showToast('Alertas e observações do paciente atualizados!', 'success');
      setShowAlertsModal(false);
      await loadPatientDetails();
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar alertas do paciente', 'error');
    }
  };

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

  // Restore existing content before appending an explicitly reviewed teleconsultation draft.
  useEffect(() => {
    let parsed: { title?: string; clinicalEvolution?: string; technicalNotes?: string; savedAt?: string } = {};
    try {
      const savedDraft = localStorage.getItem(DRAFT_KEY);
      if (savedDraft) {
        parsed = JSON.parse(savedDraft) || {};
        if (parsed.title) setTitle(parsed.title);
        if (parsed.clinicalEvolution) setClinicalEvolution(parsed.clinicalEvolution);
        if (parsed.technicalNotes) setTechnicalNotes(parsed.technicalNotes);
        setAutosaveStatus('saved');
        setLastSavedAt(new Date(parsed.savedAt || Date.now()));
      }
    } catch (e) {
      console.warn('Erro ao restaurar rascunho:', e);
    }
    if (appointment.modality === 'online') {
      const reviewed = takeReviewedEvolution(appointment.id);
      if (reviewed) {
        const appended = [parsed.clinicalEvolution, reviewed].filter(Boolean).join('\n\n');
        setClinicalEvolution(appended);
        triggerAutosave(parsed.title || '', appended, parsed.technicalNotes || '');
      }
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

  // Estados de interface do Workspace Clínico (exclusivamente visuais/frontend)
  const [workspaceTab, setWorkspaceTab] = useState<'resumo' | 'evolucao' | 'modulo' | 'documentos' | 'finalizacao'>(initialWorkspaceTab || 'evolucao');

  useEffect(() => {
    if (initialWorkspaceTab) {
      setWorkspaceTab(initialWorkspaceTab);
    }
  }, [initialWorkspaceTab]);
  const [showTemplateMenu, setShowTemplateMenu] = useState<boolean>(false);
  const [editorAlign, setEditorAlign] = useState<'left' | 'center' | 'right'>('left');
  const [paragraphStyle, setParagraphStyle] = useState<string>('paragraph');
  const evolutionTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);

  // Trava o scroll da página de fundo enquanto o modal de atendimento estiver aberto
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const handleEvolutionChange = (val: string, recordUndo = true) => {
    if (recordUndo && val !== clinicalEvolution) {
      undoStackRef.current = [...undoStackRef.current.slice(-49), clinicalEvolution];
      redoStackRef.current = [];
    }
    setClinicalEvolution(val);
    triggerAutosave(title, val, technicalNotes);
  };

  const handleUndoEvolution = () => {
    if (undoStackRef.current.length === 0) return;
    const previous = undoStackRef.current[undoStackRef.current.length - 1];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, clinicalEvolution];
    handleEvolutionChange(previous, false);
    evolutionTextareaRef.current?.focus();
  };

  const handleRedoEvolution = () => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current[redoStackRef.current.length - 1];
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current, clinicalEvolution];
    handleEvolutionChange(next, false);
    evolutionTextareaRef.current?.focus();
  };

  const handleEditorToolbarAction = (action: 'bold' | 'italic' | 'underline' | 'bullet' | 'numbered' | 'link' | 'heading' | 'subheading') => {
    const el = evolutionTextareaRef.current;
    const current = clinicalEvolution;
    const start = el ? el.selectionStart : current.length;
    const end = el ? el.selectionEnd : current.length;
    const selected = current.slice(start, end);

    let replacement = '';
    let cursorOffset = 0;

    if (action === 'bold') {
      replacement = selected ? `**${selected}**` : '**texto em destaque**';
      cursorOffset = replacement.length;
    } else if (action === 'italic') {
      replacement = selected ? `_${selected}_` : '_texto em itálico_';
      cursorOffset = replacement.length;
    } else if (action === 'underline') {
      replacement = selected ? `[${selected}]` : '[texto sublinhado]';
      cursorOffset = replacement.length;
    } else if (action === 'bullet') {
      const prefix = start > 0 && current[start - 1] !== '\n' ? '\n' : '';
      replacement = selected
        ? prefix + selected.split('\n').map(line => (line.trim().startsWith('• ') ? line : `• ${line}`)).join('\n')
        : `${prefix}• `;
      cursorOffset = replacement.length;
    } else if (action === 'numbered') {
      const prefix = start > 0 && current[start - 1] !== '\n' ? '\n' : '';
      replacement = selected
        ? prefix + selected.split('\n').map((line, i) => `${i + 1}. ${line.replace(/^\d+\.\s*/, '')}`).join('\n')
        : `${prefix}1. `;
      cursorOffset = replacement.length;
    } else if (action === 'link') {
      replacement = selected ? `${selected} (https://)` : 'Referência clínica (https://)';
      cursorOffset = replacement.length;
    } else if (action === 'heading') {
      const prefix = start > 0 && current[start - 1] !== '\n' ? '\n\n' : '';
      replacement = selected ? `${prefix}${selected.toUpperCase()}\n` : `${prefix}SEÇÃO CLÍNICA:\n`;
      cursorOffset = replacement.length;
    } else if (action === 'subheading') {
      const prefix = start > 0 && current[start - 1] !== '\n' ? '\n' : '';
      replacement = selected ? `${prefix}— ${selected}:\n` : `${prefix}— Tópico clínico:\n`;
      cursorOffset = replacement.length;
    }

    const updated = current.slice(0, start) + replacement + current.slice(end);
    handleEvolutionChange(updated);
    setTimeout(() => {
      if (evolutionTextareaRef.current) {
        evolutionTextareaRef.current.focus();
        const newPos = start + cursorOffset;
        evolutionTextareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const handleApplyClinicalTemplate = (templateType: 'soap' | 'session' | 'initial' | 'followup') => {
    const templates: Record<'soap' | 'session' | 'initial' | 'followup', string> = {
      soap: [
        'SUBJETIVO (Queixa / Relato do paciente):',
        '• ',
        '',
        'OBJETIVO (Exame clínico / Observações da sessão):',
        '• ',
        '',
        'AVALIAÇÃO / EVOLUÇÃO CLÍNICA:',
        '• ',
        '',
        'PLANO / CONDUTA TERAPÊUTICA:',
        '• '
      ].join('\n'),
      session: [
        'OBJETIVOS DA SESSÃO:',
        '• ',
        '',
        'INTERVENÇÕES E CONDUTAS REALIZADAS:',
        '• ',
        '',
        'RESPOSTA E DESEMPENHO DO PACIENTE:',
        '• ',
        '',
        'ORIENTAÇÕES E PRÓXIMOS PASSOS:',
        '• '
      ].join('\n'),
      initial: [
        'QUEIXA PRINCIPAL E HISTÓRICO ATUAL:',
        '• ',
        '',
        'AVALIAÇÃO FUNCIONAL / EXAME CLÍNICO:',
        '• ',
        '',
        'IMPRESSÃO DIAGNÓSTICA / FUNCIONAL:',
        '• ',
        '',
        'PLANO TERAPÊUTICO INICIAL:',
        '• '
      ].join('\n'),
      followup: [
        'EVOLUÇÃO DESDE O ÚLTIMO ATENDIMENTO:',
        '• ',
        '',
        'REAVALIAÇÃO CLÍNICA ATUAL:',
        '• ',
        '',
        'AJUSTES DE CONDUTA E RECOMENDAÇÕES:',
        '• '
      ].join('\n')
    };

    const content = templates[templateType];
    const nextText = clinicalEvolution.trim()
      ? `${clinicalEvolution.trim()}\n\n${content}`
      : content;
    handleEvolutionChange(nextText);
    setShowTemplateMenu(false);
    setTimeout(() => {
      evolutionTextareaRef.current?.focus();
    }, 0);
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
      const effectiveStartIso = realStartAt || appointment.attendance_start_at || appointment.start_time || '';
      const normalizedStart = effectiveStartIso.replace(' ', 'T');
      const nowLocal = new Date();
      const fallbackDate = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;
      const fallbackTime = `${String(nowLocal.getHours()).padStart(2, '0')}:${String(nowLocal.getMinutes()).padStart(2, '0')}`;
      const sessionDate = normalizedStart ? normalizedStart.split('T')[0] : fallbackDate;
      const sessionTime = normalizedStart && normalizedStart.includes('T') ? normalizedStart.split('T')[1]?.slice(0, 5) : fallbackTime;
      const effectiveEndIso = realEndAt || appointment.attendance_end_at || '';
      const sessionEndTime = effectiveEndIso && effectiveEndIso.replace(' ', 'T').includes('T')
        ? effectiveEndIso.replace(' ', 'T').split('T')[1]?.slice(0, 5)
        : undefined;

      await ApiClient.post('/v1/clinical-records', {
        patientId: appointment.patient_id,
        appointmentId: appointment.id,
        professionalId: appointment.professional_id,
        sessionDate,
        sessionTime,
        sessionEndTime,
        title: title.trim() || `Consulta de ${appointment.service_name || 'Rotina'}`,
        clinicalEvolution: clinicalEvolution.trim(),
        technicalNotes: technicalNotes.trim() || null,
        isSealed,
        moduleType: activeModuleType
      });

      // Sincroniza dados do ZemdaFisio caso preenchidos
      if (isAppointmentPhysio && (bodyMapJson || painScore !== '' || conductsExercises.trim() || painLocation.trim())) {
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

  const effectiveStartIsoForHeader = realStartAt || appointment.attendance_start_at || appointment.start_time || '';
  const effectiveExpectedEndIsoForHeader = expectedEndAt || appointment.attendance_expected_end_at || appointment.end_time || '';
  const effectiveRealEndIsoForHeader = realEndAt || appointment.attendance_end_at || '';
  const appointmentDate = effectiveStartIsoForHeader ? effectiveStartIsoForHeader.replace(' ', 'T').split('T')[0] : '';
  const appointmentTime = effectiveStartIsoForHeader ? effectiveStartIsoForHeader.replace(' ', 'T').split('T')[1]?.slice(0, 5) : '';
  const expectedEndTimeStr = effectiveExpectedEndIsoForHeader ? effectiveExpectedEndIsoForHeader.replace(' ', 'T').split('T')[1]?.slice(0, 5) : '';
  const realEndTimeStr = effectiveRealEndIsoForHeader ? effectiveRealEndIsoForHeader.replace(' ', 'T').split('T')[1]?.slice(0, 5) : '';


  // Alertas de alergias
  const hasAllergies = (allergiesList && allergiesList.length > 0) || (patientData?.allergies && patientData.allergies.trim().length > 0);
  const allergiesText = allergiesList.length > 0
    ? allergiesList.map(a => a.allergen || a.name).join(', ')
    : patientData?.allergies || '';

  const procedureAmount =
    appointment.display_amount !== null && appointment.display_amount !== undefined
      ? appointment.display_amount
      : appointment.payment_amount !== null && appointment.payment_amount !== undefined
        ? appointment.payment_amount
        : appointment.service_price !== null && appointment.service_price !== undefined
          ? appointment.service_price
          : null;

  const formattedProcedurePrice =
    procedureAmount !== null && procedureAmount !== undefined
      ? Number(procedureAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : null;

  const headerModuleSubtitle = isAppointmentDentist
    ? 'ZemdaOdonto — Odontologia'
    : isAppointmentPhysio
      ? 'ZemdaFisio — Fisioterapia'
      : isAppointmentNutri
        ? 'ZemdaNutri — Nutrição Clínica'
        : isAppointmentTO
          ? 'ZemdaTO — Terapia Ocupacional'
          : isAppointmentFono
            ? 'ZemdaFono — Fonoaudiologia'
            : isAppointmentPP
              ? 'ZemdaPP — Psicopedagogia'
              : effectiveModule === 'ZemdaPsico'
                ? 'ZemdaPsico — Psicologia'
                : effectiveModule === 'ZemdaMed'
                  ? 'ZemdaMed — Medicina'
                  : effectiveModule === 'ZemdaEstetic'
                    ? 'ZemdaEstetic — Estética Avançada'
                    : effectiveModule === 'ZemdaPersonal'
                      ? 'ZemdaPersonal — Educação Física'
                      : `${resolvedSpecializedName || currentUser?.canonicalProfessionName || currentUser?.professionName || 'Prontuário Clínico'}`;

  const professionDisplayLabel =
    currentUser?.canonicalProfessionName ||
    currentUser?.professionName ||
    (isAppointmentTO
      ? 'Terapia Ocupacional'
      : isAppointmentPhysio
        ? 'Fisioterapia'
        : isAppointmentDentist
          ? 'Odontologia'
          : isAppointmentNutri
            ? 'Nutrição'
            : isAppointmentFono
              ? 'Fonoaudiologia'
              : isAppointmentPP
                ? 'Psicopedagogia'
                : effectiveModule === 'ZemdaPsico'
                  ? 'Psicologia'
                  : effectiveModule === 'ZemdaMed'
                    ? 'Medicina'
                    : effectiveModule === 'ZemdaEstetic'
                      ? 'Estética'
                      : 'Profissional de Saúde');

  const renderClinicalSideCards = () => (
    <div className="space-y-3 min-w-0">
      {/* Card 1: Alergias (Verde claro se sem alergias, ou alerta caso existam) */}
      <div
        className={`p-4 rounded-2xl border transition-all ${
          hasAllergies
            ? 'bg-rose-50/85 border-rose-200 text-rose-950 shadow-2xs'
            : 'bg-emerald-50/70 border-emerald-200/90 text-emerald-950'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            {hasAllergies ? (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span className="font-bold text-xs uppercase tracking-wider truncate">
              {hasAllergies ? 'Alergias Relatadas' : 'Alergias'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingAllergyId(null);
              setAllergyForm({ substance: '', reactionType: '', severity: '', notes: '' });
              setShowAllergiesModal(true);
            }}
            className="w-7 h-7 !min-h-[28px] !min-w-[28px] inline-flex items-center justify-center rounded-lg bg-white/70 hover:bg-white border border-emerald-300/70 text-emerald-900 hover:text-slate-950 transition-colors cursor-pointer shrink-0"
            title="Gerenciar Alergias (+)"
            aria-label="Adicionar ou editar alergias"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-xs leading-relaxed font-medium text-slate-700">
          {hasAllergies ? allergiesText : 'Nenhuma alergia conhecida relatada.'}
        </p>
      </div>

      {/* Card 2: Medicamentos Contínuos (Azul claro) */}
      <div className="p-4 rounded-2xl border bg-blue-50/70 border-blue-200/90 text-blue-950 transition-all">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <Pill className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="font-bold text-xs uppercase tracking-wider truncate">
              Medicamentos Contínuos
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingMedicationId(null);
              setMedicationForm({ medicationName: '', dosage: '', frequency: '', route: 'oral', status: 'active', notes: '' });
              setShowMedicationsModal(true);
            }}
            className="w-7 h-7 !min-h-[28px] !min-w-[28px] inline-flex items-center justify-center rounded-lg bg-white/70 hover:bg-white border border-blue-300/70 text-blue-900 hover:text-blue-950 transition-colors cursor-pointer shrink-0"
            title="Gerenciar Medicamentos (+)"
            aria-label="Adicionar ou editar medicamentos contínuos"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-xs leading-relaxed font-medium text-slate-700">
          {medicationsList.length > 0
            ? medicationsList.map(m => `${m.medication_name || m.name} ${m.dosage || ''}`).join(', ')
            : patientData?.continuous_medications || 'Nenhum medicamento contínuo registrado.'}
        </p>
      </div>

      {/* Card 3: Observações e Alertas (Âmbar claro) */}
      <div className="p-4 rounded-2xl border bg-amber-50/70 border-amber-200/90 text-amber-950 transition-all">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-bold text-xs uppercase tracking-wider truncate">
              Observações e Alertas
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setAlertsForm({
                importantAlert: patientData?.important_alert || '',
                clinicalNotes: patientData?.clinical_notes || '',
                notesAdmin: patientData?.notes_admin || patientData?.notes || ''
              });
              setShowAlertsModal(true);
            }}
            className="w-7 h-7 !min-h-[28px] !min-w-[28px] inline-flex items-center justify-center rounded-lg bg-white/70 hover:bg-white border border-amber-300/70 text-amber-900 hover:text-amber-950 transition-colors cursor-pointer shrink-0"
            title="Editar Observações e Alertas (+)"
            aria-label="Adicionar ou editar observações e alertas"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="text-xs leading-relaxed font-medium text-slate-700 space-y-1">
          {patientData?.important_alert && (
            <p className="font-bold text-rose-700">⚠️ ALERTA: {patientData.important_alert}</p>
          )}
          {patientData?.clinical_notes && (
            <p className="text-slate-800">Clínica: {patientData.clinical_notes}</p>
          )}
          <p>
            {patientData?.notes_admin ||
              patientData?.notes ||
              (!patientData?.important_alert && !patientData?.clinical_notes
                ? 'Sem observações administrativas ou clínicas adicionais.'
                : '')}
          </p>
        </div>
      </div>

      {/* Card 4: Termos de Consentimento (Opcional — nunca bloqueia o atendimento) */}
      {canAccessConsents && appointment.patient_id && (
        <ConsentPendingAlert
          variant="optional-card"
          patientId={appointment.patient_id}
          serviceId={appointment.service_id}
          onOpen={() => setShowConsentsDialog(true)}
        />
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center !p-0 sm:!p-2 lg:!p-3 overflow-hidden mobile-modal">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Iniciar atendimento"
        className="bg-white w-screen h-[100dvh] sm:w-[96vw] sm:h-[94vh] lg:w-[min(94vw,1500px)] lg:h-[92vh] max-w-full !max-h-none rounded-none sm:rounded-2xl lg:rounded-3xl shadow-2xl border-0 sm:border border-slate-200/90 flex flex-col !overflow-hidden min-w-0 animate-in zoom-in-95 duration-150"
      >
        {/* 1. HEADER FIXO (Claro, limpo, identidade Zemda, X sempre visível no canto superior direito) */}
        <header className="shrink-0 sticky top-0 z-30 bg-white text-slate-900 px-3.5 sm:px-6 py-2.5 min-h-[60px] max-h-[72px] flex items-center justify-between gap-3 border-b border-slate-200">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border shadow-2xs ${
                isAppointmentDentist
                  ? 'bg-cyan-50 border-cyan-200 text-cyan-700'
                  : isAppointmentPhysio
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : isAppointmentNutri
                      ? 'bg-lime-50 border-lime-200 text-lime-700'
                      : isAppointmentTO
                        ? 'bg-amber-50 border-amber-200 text-amber-700'
                        : isAppointmentFono
                          ? 'bg-purple-50 border-purple-200 text-purple-700'
                          : 'bg-teal-50 border-teal-200 text-teal-700'
              }`}
            >
              {isAppointmentDentist ? (
                <Smile className="w-5 h-5" />
              ) : isAppointmentPhysio ? (
                <Activity className="w-5 h-5" />
              ) : isAppointmentNutri ? (
                <Apple className="w-5 h-5" />
              ) : isAppointmentTO ? (
                <Hand className="w-5 h-5" />
              ) : isAppointmentFono ? (
                <Mic className="w-5 h-5" />
              ) : (
                <Stethoscope className="w-5 h-5" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 leading-tight truncate">
                  Atendimento clínico
                </h2>
                <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                  <Building2 className="w-3 h-3 text-slate-400" />
                  <span>{currentTenant?.trade_name || currentTenant?.name || 'Clínica'}</span>
                </span>
              </div>
              <p className="text-xs font-semibold text-teal-700 truncate mt-0.5">
                {headerModuleSubtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Botão de Acesso Rápido ao ZemdaBody (quando autorizado) */}
            {isZemdaBody && (
              <button
                type="button"
                onClick={() => {
                  if (onOpenZemdaBody) {
                    onOpenZemdaBody();
                  } else {
                    setShowZemdaBodyModal(true);
                  }
                }}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 shadow-2xs transition-colors cursor-pointer shrink-0"
                title="Abrir mapeamento anatômico Zemda360"
              >
                <Activity className="w-3.5 h-3.5 text-teal-600" />
                <span>Zemda360</span>
              </button>
            )}

            {/* Botão X SEMPRE visível no canto superior direito */}
            <button
              type="button"
              aria-label="Fechar atendimento"
              onClick={onClose}
              className="close-modal relative z-40 shrink-0 inline-flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 !min-h-[36px] !min-w-[36px] rounded-xl text-slate-500 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
              title="Fechar atendimento (seu rascunho está seguro)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* 2. FAIXA HORIZONTAL DE INFORMAÇÕES DO PACIENTE E ATENDIMENTO */}
        <div className="shrink-0 bg-white border-b border-slate-200 px-3.5 sm:px-6 py-2 sm:py-2.5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-0 lg:divide-x lg:divide-slate-200/80 items-center min-w-0">
            {/* PACIENTE */}
            <div className="lg:col-span-4 lg:pr-4 flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-teal-500 text-white flex items-center justify-center font-bold text-xs sm:text-sm shadow-2xs shrink-0">
                {patientName.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Paciente
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                    {clientTermLabel}
                  </span>
                  {patientData?.is_child === 1 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                      Pediátrico
                    </span>
                  )}
                  {patientAge && (
                    <span className="text-[11px] font-semibold text-slate-500">
                      • {patientAge}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-tight truncate max-w-full">
                    {patientName}
                  </h3>

                  {patientPhone && (
                    <div className="inline-flex items-center gap-1.5 text-xs text-slate-600 flex-wrap">
                      <span className="inline-flex items-center gap-1 font-medium">
                        <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{patientPhone}</span>
                      </span>
                      {cleanPhone.length >= 10 && (
                        <a
                          href={generateWhatsAppUrl(patientPhone, '')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 text-[11px] font-bold transition-colors"
                          title="Abrir no WhatsApp"
                        >
                          <MessageCircle className="w-3 h-3 shrink-0" />
                          <span>WhatsApp</span>
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {/* Resumo compacto em linha para mobile (<640px) */}
                <div className="sm:hidden flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-slate-600 mt-1 pt-1 border-t border-slate-100" title="Horário real do atendimento.">
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                    <Calendar className="w-3 h-3 text-indigo-500 shrink-0" />
                    {appointmentDate ? new Date(appointmentDate + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                    {appointmentTime ? ` • Início: ${appointmentTime}` : ''}
                    {realEndTimeStr ? ` • Término: ${realEndTimeStr}` : expectedEndTimeStr ? ` • Previsão: ${expectedEndTimeStr}` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={openEditRealTime}
                    className="text-[10px] font-bold text-teal-600 hover:text-teal-800 hover:underline cursor-pointer"
                  >
                    [ editar ]
                  </button>
                  <span className="text-slate-300">•</span>
                  <span className="inline-flex items-center gap-1 font-medium text-slate-600 truncate max-w-[150px]">
                    <User className="w-3 h-3 text-teal-600 shrink-0" />
                    {appointment.professional_name || currentUser?.name || 'Profissional'}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-teal-700">
                    {appointment.modality === 'online' ? 'Online' : 'Presencial'}
                  </span>
                </div>
              </div>
            </div>

            {/* METADADOS DA SESSÃO: DATA E HORÁRIO | PROFISSIONAL | PROCEDIMENTO | MODALIDADE */}
            <div className="hidden sm:grid lg:col-span-8 sm:grid-cols-4 gap-2 lg:gap-0 lg:divide-x lg:divide-slate-200/80 pt-1.5 lg:pt-0 border-t lg:border-t-0 border-slate-100 min-w-0">
              {/* DATA E HORÁRIO (Horário real do atendimento) */}
              <div className="lg:px-4 min-w-0 relative" title="Horário real do atendimento.">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-indigo-500 shrink-0" />
                    <span>Data e Horário</span>
                  </span>
                  <button
                    type="button"
                    onClick={openEditRealTime}
                    className="text-[10px] font-bold text-teal-600 hover:text-teal-800 hover:underline cursor-pointer shrink-0"
                    title="Horário real do atendimento."
                  >
                    [ editar ]
                  </button>
                </div>
                <p className="text-xs font-bold text-slate-800 truncate mt-0.5">
                  {appointmentDate ? new Date(appointmentDate + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                </p>
                <p className="text-[11px] font-semibold text-indigo-600 truncate">
                  {appointmentTime ? `Início: ${appointmentTime}` : 'Horário livre'}
                </p>
                {realEndTimeStr ? (
                  <p className="text-[10px] font-medium text-emerald-700 truncate">
                    Término: {realEndTimeStr}
                  </p>
                ) : expectedEndTimeStr ? (
                  <p className="text-[10px] font-medium text-slate-500 truncate">
                    Previsão de término: {expectedEndTimeStr}
                  </p>
                ) : null}

                {editingRealTime && (
                  <div className="mt-2 p-2.5 rounded-xl bg-slate-50 border border-teal-200 shadow-md space-y-2 z-30">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Data do atendimento</label>
                      <input
                        type="date"
                        value={editRealDate}
                        onChange={e => setEditRealDate(e.target.value)}
                        className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Horário de início</label>
                        <input
                          type="time"
                          value={editRealStartTime}
                          onChange={e => {
                            const val = e.target.value;
                            setEditRealStartTime(val);
                            if (!expectedEndManuallyEdited && val) {
                              setEditExpectedEndTime(computeExpectedEndHHMM(val));
                            }
                          }}
                          className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Previsão de término</label>
                        <input
                          type="time"
                          value={editExpectedEndTime}
                          onChange={e => {
                            setExpectedEndManuallyEdited(true);
                            setEditExpectedEndTime(e.target.value);
                          }}
                          className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        disabled={savingRealTime}
                        onClick={() => setEditingRealTime(false)}
                        className="px-2 py-1 rounded-lg text-[10px] font-semibold text-slate-600 hover:bg-slate-200/70 transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={savingRealTime}
                        onClick={handleSaveRealAttendanceTime}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-white bg-teal-600 hover:bg-teal-700 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {savingRealTime ? 'Salvando...' : 'Salvar horário'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* PROFISSIONAL */}
              <div className="lg:px-4 min-w-0">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1">
                  <User className="w-3 h-3 text-teal-600 shrink-0" />
                  <span>Profissional</span>
                </span>
                <p className="text-xs font-bold text-slate-800 truncate mt-0.5">
                  {appointment.professional_name || currentUser?.name || 'Profissional'}
                </p>
                <p className="text-[11px] text-slate-500 truncate">
                  {professionDisplayLabel}
                </p>
              </div>

              {/* PROCEDIMENTO */}
              <div className="lg:px-4 min-w-0">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1">
                  <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                  <span>Procedimento</span>
                </span>
                <p className="text-xs font-bold text-slate-800 truncate mt-0.5">
                  {appointment.service_name || 'Atendimento Geral'}
                </p>
                <p className="text-[11px] font-semibold text-emerald-700 truncate">
                  {formattedProcedurePrice || 'Sessão clínica'}
                </p>
              </div>

              {/* MODALIDADE */}
              <div className="lg:pl-4 min-w-0">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1">
                  {appointment.modality === 'online' ? (
                    <Video className="w-3 h-3 text-indigo-500 shrink-0" />
                  ) : (
                    <MapPin className="w-3 h-3 text-teal-600 shrink-0" />
                  )}
                  <span>Modalidade</span>
                </span>
                <p className="text-xs font-bold text-slate-800 truncate mt-0.5">
                  {appointment.modality === 'online' ? 'Online' : 'Presencial'}
                </p>
                <p className="text-[11px] text-slate-500 truncate">
                  {appointment.modality === 'online' ? 'Teleconsulta' : 'Consultório'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 3. BARRA DE NAVEGAÇÃO POR ABAS */}
        <div className="shrink-0 bg-slate-100/80 border-b border-slate-200 px-3 sm:px-6 py-1 sm:py-1.5 flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 min-w-0">
          <nav aria-label="Navegação do atendimento" className="flex flex-wrap items-center gap-1 min-w-0">
            {[
              { id: 'resumo', label: 'Resumo' },
              { id: 'evolucao', label: 'Evolução' },
              { id: 'modulo', label: 'Módulo especializado' },
              { id: 'documentos', label: 'Documentos' },
              { id: 'finalizacao', label: 'Finalização' }
            ].map(tab => {
              const isActive = workspaceTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    if (tab.id === 'modulo' && onOpenSpecializedModule) {
                      onOpenSpecializedModule();
                      return;
                    }
                    setWorkspaceTab(tab.id as any);
                  }}
                  className={`px-2.5 sm:px-3.5 py-1 sm:py-1.5 !min-h-[30px] sm:!min-h-[34px] rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white text-teal-700 shadow-2xs border border-slate-200/90'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* 4. ÁREA DE CONTEÚDO CENTRAL SCROLLÁVEL (Único scroll principal do modal) */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-slate-50/60 p-3 sm:p-5 lg:p-6">
          {/* Ferramentas de Atendimento Online (exibidas apenas quando modalidade === 'online') */}
          {appointment.modality === 'online' && (
            <div className="mb-4">
              <OnlineConsultationTools
                appointment={{ ...appointment, clinical_module: effectiveModule }}
                onMeetingUrlSaved={onMeetingUrlSaved}
                onDriveUrlSaved={onDriveUrlSaved}
                onInsert={text => handleEvolutionChange(clinicalEvolution ? `${clinicalEvolution}\n\n${text}` : text)}
              />
            </div>
          )}

          {/* ABA: RESUMO */}
          {workspaceTab === 'resumo' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start max-w-full min-w-0">
              <div className="lg:col-span-8 space-y-4 min-w-0">
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 flex-wrap">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Resumo Clínico do Atendimento</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Visão geral do paciente, dados da sessão e histórico de prontuários.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPreviousRecordsModal(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Ver prontuários anteriores</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">Paciente</span>
                      <p className="text-sm font-bold text-slate-800 mt-0.5">{patientName}</p>
                      <p className="text-slate-500 mt-0.5">
                        {patientAge ? `${patientAge}` : 'Idade não informada'}
                        {patientBirth ? ` (${new Date(patientBirth + 'T12:00:00').toLocaleDateString('pt-BR')})` : ''}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">Sessão Atual</span>
                      <p className="text-sm font-bold text-slate-800 mt-0.5">{title || appointment.service_name || 'Consulta'}</p>
                      <p className="text-slate-500 mt-0.5">
                        {appointmentDate ? new Date(appointmentDate + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                        {appointmentTime ? ` às ${appointmentTime}` : ''} • {appointment.modality === 'online' ? 'Online' : 'Presencial'}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setWorkspaceTab('evolucao')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Ir para Evolução Clínica</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-4 min-w-0">
                {renderClinicalSideCards()}
              </div>
            </div>
          )}

          {/* ABA: MÓDULO ESPECIALIZADO (Fallback claro quando aberto fora do AppointmentConsultation) */}
          {workspaceTab === 'modulo' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start max-w-full min-w-0">
              <div className="lg:col-span-8 space-y-4 min-w-0">
                <div className="bg-white text-slate-900 rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
                        <Stethoscope className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-base font-bold text-slate-900">
                            {resolvedSpecializedName ? `Módulo Especializado: ${resolvedSpecializedName}` : 'Módulo Clínico Especializado'}
                          </h4>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                            Sincronizado ao atendimento
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                          Acesse avaliações estruturadas, escalas clínicas, testes específicos da especialidade e planejamento terapêutico mantendo o atendimento sincronizado.
                        </p>
                      </div>
                    </div>

                    {onOpenSpecializedModule && resolvedSpecializedName && (
                      <button
                        type="button"
                        onClick={onOpenSpecializedModule}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-xs transition-all cursor-pointer shrink-0"
                      >
                        <Stethoscope className="w-4 h-4" />
                        <span>Abrir {resolvedSpecializedName}</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {isZemdaBody && (
                    <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-slate-600">
                        <strong className="text-teal-700">Zemda360 (Mapeamento Anatômico):</strong> registre marcações corporais e faciais vinculadas a esta sessão.
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (onOpenZemdaBody) {
                            onOpenZemdaBody();
                          } else {
                            setShowZemdaBodyModal(true);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 transition-colors cursor-pointer"
                      >
                        <Activity className="w-3.5 h-3.5 text-teal-600" />
                        <span>Abrir Zemda360</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Ferramentas rápidas embutidas quando aplicável (Odontologia / Fisioterapia) */}
                {isAppointmentDentist && (
                  <div className="bg-white border border-cyan-200 rounded-2xl p-4 sm:p-5 shadow-2xs">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-cyan-800 mb-3">
                      Odontograma Interativo (ZemdaOdonto)
                    </h5>
                    <OdontogramCanvas
                      currentData={odontogramData}
                      onChange={(updated, changes) => {
                        setOdontogramData(updated);
                        setPendingToothChanges(prev => [...prev, ...changes]);
                      }}
                    />
                  </div>
                )}

                {isAppointmentPhysio && (
                  <div className="bg-white border border-teal-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-teal-800">
                      Mapa de Dor & Escala EVA (ZemdaFisio)
                    </h5>
                    <ClinicalPainScale value={painScore} onChange={value => setPainScore(value ?? '')} />
                    <BodyPainMapCanvas
                      initialDataJson={bodyMapJson}
                      onSave={(dataJson: string, dataImage: string) => {
                        setBodyMapJson(dataJson);
                        setBodyMapImage(dataImage);
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="lg:col-span-4 min-w-0">
                {renderClinicalSideCards()}
              </div>
            </div>
          )}

          {/* ABA: DOCUMENTOS */}
          {workspaceTab === 'documentos' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start max-w-full min-w-0">
              <div className="lg:col-span-8 space-y-4 min-w-0">
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Documentos Clínicos, Atestados e Encaminhamentos</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Emita documentos oficiais vinculados a este atendimento sem sair da área clínica.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-4 rounded-2xl border border-teal-200 bg-teal-50/40 flex flex-col justify-between gap-3">
                      <div>
                        <h5 className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                          <Heart className="w-4 h-4 text-teal-600" />
                          <span>Acompanhamento ao Paciente</span>
                        </h5>
                        <p className="text-xs text-slate-600 mt-1">
                          Gere orientações pós-consulta e relatório de acompanhamento em PDF A4 para o paciente.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowFollowUpDocModal(true)}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-teal-800 bg-white hover:bg-teal-100 border border-teal-300 transition-colors cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Abrir Acompanhamento</span>
                      </button>
                    </div>

                    <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between gap-3">
                      <div>
                        <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-indigo-600" />
                          <span>Documentos / Atestado / Receituário</span>
                        </h5>
                        <p className="text-xs text-slate-600 mt-1">
                          Emita atestados, declarações de comparecimento, prescrições e recibos do atendimento.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowFinishModal(true)}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-indigo-700 bg-white hover:bg-indigo-50 border border-indigo-200 transition-colors cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Emitir Documentos / Atestado</span>
                      </button>
                    </div>

                    <div className="p-4 rounded-2xl border border-indigo-200/80 bg-indigo-50/30 flex flex-col justify-between gap-3">
                      <div>
                        <h5 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                          <Share2 className="w-4 h-4 text-indigo-600" />
                          <span>Encaminhamento Interprofissional</span>
                        </h5>
                        <p className="text-xs text-slate-600 mt-1">
                          Encaminhe o paciente para avaliação complementar com outro profissional da equipe.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowReferralModal(true)}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-indigo-700 bg-white hover:bg-indigo-100 border border-indigo-200 transition-colors cursor-pointer"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>Encaminhar Paciente</span>
                      </button>
                    </div>

                    <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between gap-3">
                      <div>
                        <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <History className="w-4 h-4 text-slate-600" />
                          <span>Prontuários Anteriores</span>
                        </h5>
                        <p className="text-xs text-slate-600 mt-1">
                          Consulte todo o histórico de evoluções e registros anteriores deste paciente.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPreviousRecordsModal(true)}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 transition-colors cursor-pointer"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span>Ver Prontuários Anteriores</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-4 min-w-0">
                {renderClinicalSideCards()}
              </div>
            </div>
          )}

          {/* ABA: FINALIZAÇÃO */}
          {workspaceTab === 'finalizacao' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start max-w-full min-w-0">
              <div className="lg:col-span-8 space-y-4 min-w-0">
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
                  <div className="border-b border-slate-100 pb-3">
                    <h4 className="text-sm font-bold text-slate-900">Revisão e Finalização do Atendimento</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Confira os dados registrados nesta sessão antes de concluir o atendimento.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">Título da Sessão</span>
                      <p className="text-xs font-bold text-slate-800 mt-0.5">{title || 'Sem título informado'}</p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold uppercase text-slate-400">Evolução Clínica Registrada</span>
                        <button
                          type="button"
                          onClick={() => setWorkspaceTab('evolucao')}
                          className="text-xs font-bold text-teal-700 hover:underline cursor-pointer"
                        >
                          Editar evolução
                        </button>
                      </div>
                      <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                        {clinicalEvolution.trim() || 'Nenhuma evolução clínica digitada até o momento.'}
                      </p>
                    </div>

                    <div className="bg-amber-50/60 p-3.5 rounded-xl border border-amber-200/80 flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="sealRecordTab"
                        checked={isSealed}
                        onChange={e => setIsSealed(e.target.checked)}
                        className="w-4 h-4 text-teal-600 rounded-sm cursor-pointer"
                      />
                      <label htmlFor="sealRecordTab" className="text-xs font-medium text-amber-950 cursor-pointer">
                        <span className="font-bold">Lacrar prontuário eletrônico:</span> impede edições futuras neste registro clínico para total conformidade jurídica.
                      </label>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-wrap items-center justify-end gap-2.5">
                    <button
                      type="button"
                      disabled={savingRecord}
                      onClick={handleSaveEvolution}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4 text-teal-600" />
                      <span>{savingRecord ? 'Gravando...' : 'Salvar Evolução'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={savingRecord}
                      onClick={handleFinalizeAttendance}
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 shadow-md transition-all cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{savingRecord ? 'Finalizando...' : 'Finalizar Atendimento'}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-4 min-w-0">
                {renderClinicalSideCards()}
              </div>
            </div>
          )}

          {/* ABA PRINCIPAL (PADRÃO): EVOLUÇÃO */}
          {workspaceTab === 'evolucao' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start max-w-full min-w-0">
              {/* COLUNA PRINCIPAL ESQUERDA (~67% no desktop): Título + Editor Grande + Ações da Sessão */}
              <div className="lg:col-span-8 space-y-4 min-w-0">
                <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs space-y-4 min-w-0">
                  {/* Título da Consulta / Sessão */}
                  <div>
                    <label className="block text-[11px] uppercase font-bold tracking-wider text-slate-500 mb-1">
                      Título da Consulta / Sessão
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={e => handleTitleChange(e.target.value)}
                      placeholder="Ex: Consulta Inicial, Sessão 3 de Fisioterapia, Retorno Clínico..."
                      className="w-full text-sm sm:text-base font-bold text-slate-800 border border-slate-200 rounded-xl px-3.5 py-2 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  {/* Cabeçalho do Editor: Evolução Clínica & Conduta Terapêutica + [ Usar modelo ] */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label htmlFor="clinical-evolution-editor" className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-teal-600 shrink-0" />
                        <span>Evolução Clínica & Conduta Terapêutica *</span>
                      </label>

                      <div className="flex items-center gap-2 relative">
                        <button
                          type="button"
                          onClick={() => setShowTemplateMenu(prev => !prev)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 !min-h-[32px] rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 transition-colors cursor-pointer"
                          title="Inserir modelo estruturado de evolução clínica"
                        >
                          <LayoutTemplate className="w-3.5 h-3.5 text-teal-600" />
                          <span>Usar modelo</span>
                          <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                        </button>

                        {showTemplateMenu && (
                          <div className="absolute right-0 top-full mt-1.5 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 p-1.5 z-30 space-y-1">
                            <button
                              type="button"
                              onClick={() => handleApplyClinicalTemplate('soap')}
                              className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-teal-50 hover:text-teal-800 transition-colors cursor-pointer"
                            >
                              📋 Evolução Padrão (SOAP)
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApplyClinicalTemplate('session')}
                              className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-teal-50 hover:text-teal-800 transition-colors cursor-pointer"
                            >
                              🩺 Sessão Terapêutica & Conduta
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApplyClinicalTemplate('initial')}
                              className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-teal-50 hover:text-teal-800 transition-colors cursor-pointer"
                            >
                              ✨ Primeira Consulta / Avaliação
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApplyClinicalTemplate('followup')}
                              className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-teal-50 hover:text-teal-800 transition-colors cursor-pointer"
                            >
                              🔄 Retorno / Reavaliação
                            </button>
                          </div>
                        )}

                        <span className="text-[11px] text-slate-400 font-medium">
                          {clinicalEvolution.length} caracteres
                        </span>
                      </div>
                    </div>

                    {/* Container do Editor com Toolbar Completa */}
                    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white focus-within:ring-2 focus-within:ring-teal-500 focus-within:border-teal-500 transition-all shadow-2xs">
                      {/* Toolbar: Parágrafo | B I U | listas | alinhamento | link | desfazer | refazer */}
                      <div className="bg-slate-50 border-b border-slate-200 px-2.5 py-1.5 flex flex-wrap items-center gap-1 text-slate-600">
                        <select
                          aria-label="Estilo de parágrafo"
                          value={paragraphStyle}
                          onChange={e => {
                            const val = e.target.value;
                            setParagraphStyle(val);
                            if (val === 'heading') handleEditorToolbarAction('heading');
                            else if (val === 'subheading') handleEditorToolbarAction('subheading');
                            setParagraphStyle('paragraph');
                          }}
                          className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1 !min-h-[30px] focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
                        >
                          <option value="paragraph">Parágrafo</option>
                          <option value="heading">Título de Seção</option>
                          <option value="subheading">Subtítulo / Tópico</option>
                        </select>

                        <span className="h-4 w-px bg-slate-200 mx-0.5 hidden sm:inline-block" />

                        <button
                          type="button"
                          onClick={() => handleEditorToolbarAction('bold')}
                          className="p-1.5 !min-h-[30px] !min-w-[30px] rounded-lg hover:bg-slate-200/70 text-slate-700 transition-colors cursor-pointer"
                          title="Negrito (B)"
                          aria-label="Negrito"
                        >
                          <Bold className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEditorToolbarAction('italic')}
                          className="p-1.5 !min-h-[30px] !min-w-[30px] rounded-lg hover:bg-slate-200/70 text-slate-700 transition-colors cursor-pointer"
                          title="Itálico (I)"
                          aria-label="Itálico"
                        >
                          <Italic className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEditorToolbarAction('underline')}
                          className="p-1.5 !min-h-[30px] !min-w-[30px] rounded-lg hover:bg-slate-200/70 text-slate-700 transition-colors cursor-pointer"
                          title="Sublinhado (U)"
                          aria-label="Sublinhado"
                        >
                          <Underline className="w-3.5 h-3.5" />
                        </button>

                        <span className="h-4 w-px bg-slate-200 mx-0.5 hidden sm:inline-block" />

                        <button
                          type="button"
                          onClick={() => handleEditorToolbarAction('bullet')}
                          className="p-1.5 !min-h-[30px] !min-w-[30px] rounded-lg hover:bg-slate-200/70 text-slate-700 transition-colors cursor-pointer"
                          title="Lista com marcadores"
                          aria-label="Lista com marcadores"
                        >
                          <List className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEditorToolbarAction('numbered')}
                          className="p-1.5 !min-h-[30px] !min-w-[30px] rounded-lg hover:bg-slate-200/70 text-slate-700 transition-colors cursor-pointer"
                          title="Lista numerada"
                          aria-label="Lista numerada"
                        >
                          <ListOrdered className="w-3.5 h-3.5" />
                        </button>

                        <span className="h-4 w-px bg-slate-200 mx-0.5 hidden sm:inline-block" />

                        <button
                          type="button"
                          onClick={() => setEditorAlign('left')}
                          className={`p-1.5 !min-h-[30px] !min-w-[30px] rounded-lg transition-colors cursor-pointer ${
                            editorAlign === 'left' ? 'bg-slate-200 text-slate-900' : 'hover:bg-slate-200/70 text-slate-700'
                          }`}
                          title="Alinhar à esquerda"
                          aria-label="Alinhar à esquerda"
                        >
                          <AlignLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditorAlign('center')}
                          className={`p-1.5 !min-h-[30px] !min-w-[30px] rounded-lg transition-colors cursor-pointer ${
                            editorAlign === 'center' ? 'bg-slate-200 text-slate-900' : 'hover:bg-slate-200/70 text-slate-700'
                          }`}
                          title="Centralizar"
                          aria-label="Centralizar"
                        >
                          <AlignCenter className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditorAlign('right')}
                          className={`p-1.5 !min-h-[30px] !min-w-[30px] rounded-lg transition-colors cursor-pointer ${
                            editorAlign === 'right' ? 'bg-slate-200 text-slate-900' : 'hover:bg-slate-200/70 text-slate-700'
                          }`}
                          title="Alinhar à direita"
                          aria-label="Alinhar à direita"
                        >
                          <AlignRight className="w-3.5 h-3.5" />
                        </button>

                        <span className="h-4 w-px bg-slate-200 mx-0.5 hidden sm:inline-block" />

                        <button
                          type="button"
                          onClick={() => handleEditorToolbarAction('link')}
                          className="p-1.5 !min-h-[30px] !min-w-[30px] rounded-lg hover:bg-slate-200/70 text-slate-700 transition-colors cursor-pointer"
                          title="Inserir referência ou link"
                          aria-label="Inserir link"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                        </button>

                        <span className="h-4 w-px bg-slate-200 mx-0.5 hidden sm:inline-block" />

                        <button
                          type="button"
                          onClick={handleUndoEvolution}
                          className="p-1.5 !min-h-[30px] !min-w-[30px] rounded-lg hover:bg-slate-200/70 text-slate-700 transition-colors cursor-pointer"
                          title="Desfazer"
                          aria-label="Desfazer"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={handleRedoEvolution}
                          className="p-1.5 !min-h-[30px] !min-w-[30px] rounded-lg hover:bg-slate-200/70 text-slate-700 transition-colors cursor-pointer"
                          title="Refazer"
                          aria-label="Refazer"
                        >
                          <Redo2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Área de Edição Grande */}
                      <textarea
                        id="clinical-evolution-editor"
                        ref={evolutionTextareaRef}
                        rows={9}
                        value={clinicalEvolution}
                        onChange={e => handleEvolutionChange(e.target.value)}
                        placeholder="Digite a evolução clínica aqui... Descreva a queixa principal, anamnese, exame clínico, procedimentos realizados, evolução do paciente e conduta adotada nesta sessão..."
                        className={`w-full min-h-[190px] sm:min-h-[210px] xl:min-h-[250px] 2xl:min-h-[320px] text-sm leading-relaxed p-4 border-0 focus:outline-none focus:ring-0 bg-white resize-y font-sans text-slate-800 ${
                          editorAlign === 'center' ? 'text-center' : editorAlign === 'right' ? 'text-right' : 'text-left'
                        }`}
                      />
                    </div>

                    {/* Barra Compacta Abaixo do Editor: Rascunho Automático + Ações da Sessão (Microfone / Encaminhar / Salvar Evolução) */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
                      {/* Indicador Discreto de Rascunho Automático */}
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        {autosaveStatus === 'saving' ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0" />
                            <span className="text-amber-700 font-medium">Salvando rascunho automaticamente...</span>
                          </>
                        ) : autosaveStatus === 'error' ? (
                          <>
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                            <span className="text-rose-600 font-medium">Erro ao salvar rascunho localmente</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span className="font-medium text-slate-600">
                              Rascunho salvo automaticamente
                              {lastSavedAt ? ` às ${lastSavedAt.toLocaleTimeString().slice(0, 5)}` : ''}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Ações Compactas da Sessão: Iniciar microfone + Encaminhar + Salvar evolução */}
                      <div className="flex flex-wrap items-center gap-2">
                        {appointment.modality !== 'online' && (
                          <>
                            {speech.status === 'idle' || speech.status === 'completed' ? (
                              <button
                                type="button"
                                onClick={handleStartMic}
                                disabled={isGeneratingAi}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 !min-h-[34px] rounded-xl text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-colors cursor-pointer disabled:opacity-50"
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
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 !min-h-[34px] rounded-xl text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 transition-colors cursor-pointer"
                                  title="Pausar captura de fala"
                                >
                                  <Pause className="w-3.5 h-3.5 text-amber-600" />
                                  <span>Pausar</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={handleStopAndOrganize}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 !min-h-[34px] rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors animate-pulse cursor-pointer shadow-2xs"
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
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 !min-h-[34px] rounded-xl text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 transition-colors cursor-pointer"
                                  title="Continuar captura de fala"
                                >
                                  <Play className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Continuar</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={handleStopAndOrganize}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 !min-h-[34px] rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors cursor-pointer shadow-2xs"
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
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 !min-h-[34px] rounded-xl text-xs font-bold text-teal-700 bg-white hover:bg-teal-50 border border-teal-300 transition-colors cursor-pointer"
                                title="Reabrir rascunho de IA gerado a partir da fala"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                                <span>Ver Rascunho IA</span>
                              </button>
                            )}
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => setShowReferralModal(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 !min-h-[34px] rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors cursor-pointer"
                          title="Encaminhar paciente para outro colega profissional da clínica"
                        >
                          <Share2 className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Encaminhar</span>
                        </button>

                        <button
                          type="button"
                          disabled={savingRecord}
                          onClick={handleSaveEvolution}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 !min-h-[34px] rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors cursor-pointer disabled:opacity-50"
                          title="Gravar evolução clínica no prontuário agora"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                          <span>{savingRecord ? 'Gravando...' : 'Salvar Evolução'}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Painel de Voz em Tempo Real (quando ativo) */}
                  {(speech.status === 'listening' || speech.status === 'paused' || isGeneratingAi || speech.status === 'completed') && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
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
                        </div>

                        <div className="flex items-center gap-2">
                          {speech.status === 'listening' && (
                            <button
                              type="button"
                              onClick={handlePauseMic}
                              className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
                            >
                              Pausar
                            </button>
                          )}
                          {speech.status === 'paused' && (
                            <button
                              type="button"
                              onClick={handleResumeMic}
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-lg text-xs font-semibold cursor-pointer"
                            >
                              Continuar
                            </button>
                          )}
                          {(speech.status === 'listening' || speech.status === 'paused') && (
                            <button
                              type="button"
                              onClick={handleStopAndOrganize}
                              className="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold cursor-pointer"
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

                      <div className="text-xs text-slate-800 bg-white p-3 rounded-xl border border-slate-200 max-h-28 overflow-y-auto leading-relaxed">
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

                  {isGeneratingAi && (
                    <div className="bg-teal-50 border border-teal-200 rounded-2xl p-3.5 flex items-center gap-3 text-teal-900 animate-pulse">
                      <Sparkles className="w-5 h-5 text-teal-600 animate-spin shrink-0" />
                      <div>
                        <h5 className="text-xs font-bold">Zemda IA organizando a evolução clínica...</h5>
                        <p className="text-[11px] text-teal-700">
                          Convertendo a fala em redação técnica clara e conduta, sem inventar informações.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Orientações Complementares & Lacração em linha limpa */}
                  <div className="pt-2 border-t border-slate-100 space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Orientações Complementares / Tarefas para Casa
                      </label>
                      <textarea
                        rows={2}
                        value={technicalNotes}
                        onChange={e => handleNotesChange(e.target.value)}
                        placeholder="Orientações de cuidados, observações para a equipe ou metas para o próximo retorno..."
                        className="w-full text-xs p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50/50 resize-y"
                      />
                    </div>

                    <div className="bg-amber-50/50 px-3.5 py-2.5 rounded-xl border border-amber-200/70 flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        id="sealRecord"
                        checked={isSealed}
                        onChange={e => setIsSealed(e.target.checked)}
                        className="w-4 h-4 text-teal-600 rounded-sm cursor-pointer shrink-0"
                      />
                      <label htmlFor="sealRecord" className="text-xs font-medium text-amber-950 cursor-pointer">
                        <span className="font-bold">Lacrar prontuário eletrônico:</span> impede edições futuras neste registro clínico para total conformidade jurídica.
                      </label>
                    </div>
                  </div>
                </div>

                {/* ZEMDAODONTO: MÓDULO EXCLUSIVO DE ODONTOLOGIA & ODONTOGRAMA */}
                {isAppointmentDentist && (
                  <div className="bg-gradient-to-br from-cyan-50/80 via-sky-50/40 to-slate-50 border border-cyan-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs transition-all">
                    <div className="flex items-center justify-between pb-3 border-b border-cyan-100">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-cyan-600 text-white flex items-center justify-center shadow-2xs">
                          <Smile className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
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

                {/* ZEMDAFISIO: MÓDULO EXCLUSIVO DE FISIOTERAPIA & MAPA DE DOR */}
                {isAppointmentPhysio && (
                  <div className="bg-gradient-to-br from-teal-50/70 via-emerald-50/40 to-slate-50 border border-teal-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs transition-all">
                    <div className="flex items-center justify-between pb-3 border-b border-teal-100 flex-wrap gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-2xs">
                          <Activity className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
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
                          <select
                            value={viewingHistoricalId || ''}
                            onChange={e => {
                              const val = e.target.value;
                              setViewingHistoricalId(val || null);
                              if (val) {
                                const found = physioAssessments.find(a => a.id === val);
                                if (found) {
                                  setPainScore(found.pain_score ?? '');
                                  setPainLocation(found.pain_location || '');
                                  setPainCharacteristics(found.pain_characteristics || '');
                                  setConductsExercises(found.conducts_exercises || '');
                                  if (found.body_map_json) setBodyMapJson(found.body_map_json);
                                  if (found.body_map_image) setBodyMapImage(found.body_map_image);
                                  showToast(`Carregada sessão anterior de ${found.created_at ? new Date(found.created_at).toLocaleDateString('pt-BR') : ''}`, 'info');
                                }
                              }
                            }}
                            className="text-xs py-1.5 px-2.5 rounded-xl border border-teal-200 bg-white text-teal-900 font-medium cursor-pointer"
                          >
                            <option value="">Consultar Sessão Anterior ({physioAssessments.length})</option>
                            {physioAssessments.map((pa, idx) => (
                              <option key={pa.id} value={pa.id}>
                                Sessão {physioAssessments.length - idx}: {pa.created_at ? new Date(pa.created_at).toLocaleDateString('pt-BR') : ''} {pa.pain_score ? `(EVA ${pa.pain_score})` : ''}
                              </option>
                            ))}
                          </select>
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
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="md:col-span-1 bg-white p-3 rounded-xl border border-teal-100">
                            <ClinicalPainScale value={painScore} onChange={value => setPainScore(value ?? '')} />
                          </div>

                          <div className="md:col-span-2 bg-white p-3 rounded-xl border border-teal-100">
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

                        <div className="bg-white p-4 rounded-2xl border border-teal-100">
                          <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
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

                        <div className="flex items-center justify-between pt-2 border-t border-teal-100/80 flex-wrap gap-2">
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
              </div>

              {/* COLUNA DIREITA (~33% no desktop, passa para baixo do editor no mobile): Alergias, Medicamentos, Observações */}
              <div className="lg:col-span-4 min-w-0">
                {renderClinicalSideCards()}
              </div>
            </div>
          )}
        </div>

        {/* 5. FOOTER FIXO (Compacto, sempre visível na parte inferior do modal) */}
        <footer className="shrink-0 bg-white border-t border-slate-200 px-3 sm:px-6 py-2 sm:py-2.5 min-h-[56px] sm:min-h-[64px] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 z-20">
          {/* Lado Esquerdo: Salvar rascunho + Ver prontuários anteriores */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={handleManualSaveDraft}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 !min-h-[32px] sm:!min-h-[40px] rounded-xl text-[11px] sm:text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5 text-slate-600 shrink-0" />
              <span>Salvar rascunho</span>
            </button>

            <button
              type="button"
              onClick={() => setShowPreviousRecordsModal(true)}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 !min-h-[32px] sm:!min-h-[40px] rounded-xl text-[11px] sm:text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
              title="Visualizar prontuários e evoluções anteriores deste paciente"
            >
              <History className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>Ver prontuários anteriores</span>
            </button>
          </div>

          {/* Centro / Direita: Fechar + Acompanhamento + Documentos / Atestado + Finalizar atendimento */}
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 !min-h-[32px] sm:!min-h-[40px] text-[11px] sm:text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Fechar
            </button>

            <button
              type="button"
              onClick={() => setShowFollowUpDocModal(true)}
              className="inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 !min-h-[32px] sm:!min-h-[40px] text-[11px] sm:text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition-colors cursor-pointer"
              title="Gerar documento de acompanhamento e orientações para o paciente"
            >
              <Heart className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span>Acompanhamento</span>
            </button>

            <button
              type="button"
              onClick={() => setShowFinishModal(true)}
              className="inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 !min-h-[32px] sm:!min-h-[40px] text-[11px] sm:text-xs font-semibold text-teal-700 bg-white hover:bg-teal-50 border border-teal-200 rounded-xl transition-colors cursor-pointer"
              title="Emitir atestados, prescrições ou encaminhamentos"
            >
              <FileText className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span>Documentos / Atestado</span>
            </button>

            <button
              type="button"
              disabled={savingRecord}
              onClick={handleFinalizeAttendance}
              className="inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 sm:px-6 py-1.5 sm:py-2.5 !min-h-[34px] sm:!min-h-[42px] rounded-xl text-[11px] sm:text-xs font-bold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 shadow-md shadow-teal-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>{savingRecord ? 'Finalizando...' : 'Finalizar atendimento'}</span>
            </button>
          </div>
        </footer>
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

      {/* MODAL DE ACOMPANHAMENTO DO PACIENTE (EMISSÃO DIRETA E INDEPENDENTE) */}
      {showFollowUpDocModal && (
        <PatientFollowUpDocumentModal
          isOpen={showFollowUpDocModal}
          onClose={() => setShowFollowUpDocModal(false)}
          patientId={appointment.patient_id}
          patientName={patientName}
          appointmentId={appointment.id}
          professionalName={appointment.professional_name || currentUser?.name}
          professionalCouncil={currentUser?.registrationType ? `${currentUser.registrationType}: ${currentUser.registrationNumber || ''}` : undefined}
          serviceName={appointment.service_name}
          moduleType={effectiveModule}
          professionId={currentUser?.canonicalProfessionId || currentUser?.professionId}
          practiceAreaIds={currentUser?.practiceAreaIds}
          capabilities={currentUser?.capabilities}
          moduleData={
            isAppointmentPhysio ? { conducts: conductsExercises, painScore, painLocation } :
            undefined
          }
        />
      )}

      {/* MODAL DE PÓS-ATENDIMENTO / DOCUMENTOS / RETORNO */}
      {showFinishModal && (
        <FinishConsultationModal
          appointment={{
            ...appointment,
            patient_name: patientName,
            attendance_start_at: realStartAt || appointment.attendance_start_at || null,
            attendance_expected_end_at: expectedEndAt || appointment.attendance_expected_end_at || null,
            attendance_end_at: realEndAt || appointment.attendance_end_at || null
          }}
          clinicalData={{
            title,
            clinicalEvolution,
            technicalNotes,
            isSealed,
            odontogramData: isAppointmentDentist ? odontogramData : undefined,
            toothChanges: isAppointmentDentist ? pendingToothChanges : undefined,
            moduleType: activeModuleType,
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 mobile-modal">
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
            <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1.5 border-b border-slate-100 mobile-wrap">
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

      {/* Modal do ZemdaBody */}
      {showZemdaBodyModal && (
        <ZemdaBodyModal
          isOpen={showZemdaBodyModal}
          onClose={() => setShowZemdaBodyModal(false)}
          patientId={appointment.patient_id}
          patientName={patientName}
          appointmentId={appointment.id}
          professionalId={appointment.professional_id}
          professionalName={appointment.professional_name}
          module={effectiveModule}
        />
      )}

      {/* Modal de Gerenciamento Rápido de Alergias */}
      {showAllergiesModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 mobile-modal">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-rose-50/50">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <h3 className="font-bold text-slate-800 text-base">Gerenciar Alergias do Paciente</h3>
              </div>
              <button aria-label="Fechar"
                type="button"
                onClick={() => setShowAllergiesModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Lista atual */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Alergias Cadastradas ({allergiesList.length})
                </h4>
                {allergiesList.length === 0 ? (
                  <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl">
                    Nenhuma alergia individual cadastrada.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {allergiesList.map((alg: any) => (
                      <div
                        key={alg.id}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-rose-100 bg-rose-50/30 text-xs text-rose-950"
                      >
                        <div className="flex-1 min-w-0 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold truncate">{alg.substance}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-700">
                              {alg.severity === 'severe' ? 'Grave' : alg.severity === 'moderate' ? 'Moderada' : 'Leve'}
                            </span>
                            {alg.reaction_type && (
                              <span className="text-[10px] text-slate-500">{alg.reaction_type}</span>
                            )}
                          </div>
                          {alg.notes && <p className="text-[11px] text-slate-600 truncate mt-0.5">{alg.notes}</p>}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAllergyId(alg.id);
                              setAllergyForm({
                                substance: alg.substance,
                                reactionType: alg.reaction_type || '',
                                severity: alg.severity || '',
                                notes: alg.notes || ''
                              });
                            }}
                            className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-rose-100 transition-colors"
                            title="Editar"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAllergy(alg.id)}
                            className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-100 transition-colors"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Formulário */}
              <form onSubmit={handleSaveAllergy} className="pt-3 border-t border-slate-100 space-y-3">
                <h4 className="text-xs font-bold text-slate-700">
                  {editingAllergyId ? 'Editar Alergia' : 'Adicionar Nova Alergia'}
                </h4>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Substância / Alérgeno *</label>
                  <input
                    type="text"
                    required
                    value={allergyForm.substance}
                    onChange={e => setAllergyForm({ ...allergyForm, substance: e.target.value })}
                    placeholder="Ex: Dipirona, Penicilina, Amendoim, Látex"
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de Reação</label>
                    <select
                      value={allergyForm.reactionType}
                      onChange={e => setAllergyForm({ ...allergyForm, reactionType: e.target.value })}
                      className="w-full text-xs px-2.5 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none bg-white"
                    ><option value="">Selecione / não avaliado</option>
                      <option value="Cutânea">Cutânea (Urticária, Rash)</option>
                      <option value="Respiratória">Respiratória (Edema de glote, Broncoespasmo)</option>
                      <option value="Anafilática">Anafilática (Choque anafilático)</option>
                      <option value="Gastrointestinal">Gastrointestinal</option>
                      <option value="Outra">Outra</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Gravidade</label>
                    <select
                      value={allergyForm.severity}
                      onChange={e => setAllergyForm({ ...allergyForm, severity: e.target.value })}
                      className="w-full text-xs px-2.5 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none bg-white"
                    ><option value="">Selecione / não avaliado</option>
                      <option value="mild">Leve</option>
                      <option value="moderate">Moderada</option>
                      <option value="severe">Grave</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Observações adicionais</label>
                  <input
                    type="text"
                    value={allergyForm.notes}
                    onChange={e => setAllergyForm({ ...allergyForm, notes: e.target.value })}
                    placeholder="Detalhes sobre a manifestação clínica..."
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  {editingAllergyId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAllergyId(null);
                        setAllergyForm({ substance: '', reactionType: '', severity: '', notes: '' });
                      }}
                      className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl transition-colors font-medium"
                    >
                      Cancelar Edição
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    {editingAllergyId ? 'Atualizar Alergia' : 'Salvar Alergia'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Gerenciamento Rápido de Medicamentos */}
      {showMedicationsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 mobile-modal">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-blue-50/50">
              <div className="flex items-center gap-2">
                <Pill className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-800 text-base">Medicamentos de Uso Contínuo</h3>
              </div>
              <button aria-label="Fechar"
                type="button"
                onClick={() => setShowMedicationsModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Lista atual */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Medicamentos Registrados ({medicationsList.length})
                </h4>
                {medicationsList.length === 0 ? (
                  <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl">
                    Nenhum medicamento de uso contínuo registrado.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {medicationsList.map((m: any) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-blue-100 bg-blue-50/30 text-xs text-blue-950"
                      >
                        <div className="flex-1 min-w-0 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold truncate">{m.medication_name || m.name}</span>
                            {m.dosage && <span className="text-[11px] text-blue-700">{m.dosage}</span>}
                            {m.frequency && <span className="text-[10px] text-slate-500">({m.frequency})</span>}
                          </div>
                          {m.notes && <p className="text-[11px] text-slate-600 truncate mt-0.5">{m.notes}</p>}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMedicationId(m.id);
                              setMedicationForm({
                                medicationName: m.medication_name || m.name || '',
                                dosage: m.dosage || '',
                                frequency: m.frequency || '',
                                route: m.route || 'oral',
                                status: m.status || 'active',
                                notes: m.notes || ''
                              });
                            }}
                            className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-blue-100 transition-colors"
                            title="Editar"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteMedication(m.id)}
                            className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-blue-100 transition-colors"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Formulário */}
              <form onSubmit={handleSaveMedication} className="pt-3 border-t border-slate-100 space-y-3">
                <h4 className="text-xs font-bold text-slate-700">
                  {editingMedicationId ? 'Editar Medicamento' : 'Adicionar Novo Medicamento'}
                </h4>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nome do Medicamento *</label>
                  <input
                    type="text"
                    required
                    value={medicationForm.medicationName}
                    onChange={e => setMedicationForm({ ...medicationForm, medicationName: e.target.value })}
                    placeholder="Ex: Losartana Potássica, Metformina, Levotiroxina"
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Dosagem</label>
                    <input
                      type="text"
                      value={medicationForm.dosage}
                      onChange={e => setMedicationForm({ ...medicationForm, dosage: e.target.value })}
                      placeholder="Ex: 50mg, 5ml, 1 gota"
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Frequência / Horário</label>
                    <input
                      type="text"
                      value={medicationForm.frequency}
                      onChange={e => setMedicationForm({ ...medicationForm, frequency: e.target.value })}
                      placeholder="Ex: 1x ao dia pela manhã, de 8/8h"
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Via de Administração</label>
                    <select
                      value={medicationForm.route}
                      onChange={e => setMedicationForm({ ...medicationForm, route: e.target.value })}
                      className="w-full text-xs px-2.5 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                    ><option value="">Selecione / não avaliado</option>
                      <option value="oral">Oral</option>
                      <option value="sublingual">Sublingual</option>
                      <option value="tópica">Tópica</option>
                      <option value="inalatória">Inalatória</option>
                      <option value="injetável">Injetável</option>
                      <option value="ocular">Ocular</option>
                      <option value="outra">Outra</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Status</label>
                    <select
                      value={medicationForm.status}
                      onChange={e => setMedicationForm({ ...medicationForm, status: e.target.value })}
                      className="w-full text-xs px-2.5 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                    ><option value="">Selecione / não avaliado</option>
                      <option value="active">Uso Ativo / Contínuo</option>
                      <option value="suspended">Suspenso Temporariamente</option>
                      <option value="completed">Concluído</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Orientações / Observações</label>
                  <input
                    type="text"
                    value={medicationForm.notes}
                    onChange={e => setMedicationForm({ ...medicationForm, notes: e.target.value })}
                    placeholder="Ex: Em jejum, com alimentos, etc."
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  {editingMedicationId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMedicationId(null);
                        setMedicationForm({ medicationName: '', dosage: '', frequency: '', route: 'oral', status: 'active', notes: '' });
                      }}
                      className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl transition-colors font-medium"
                    >
                      Cancelar Edição
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    {editingMedicationId ? 'Atualizar Medicamento' : 'Salvar Medicamento'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Gerenciamento Rápido de Observações e Alertas */}
      {showAlertsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 mobile-modal">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-amber-50/50">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-slate-800 text-base">Observações & Alertas do Paciente</h3>
              </div>
              <button aria-label="Fechar"
                type="button"
                onClick={() => setShowAlertsModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAlerts} className="p-5 overflow-y-auto space-y-4 flex-1">
              <div>
                <label className="block text-xs font-bold text-amber-800 mb-1">
                  Alerta Importante (Destaque imediato em consultas)
                </label>
                <input
                  type="text"
                  value={alertsForm.importantAlert}
                  onChange={e => setAlertsForm({ ...alertsForm, importantAlert: e.target.value })}
                  placeholder="Ex: Risco de queda, fobia de agulha, cardiopata grave, gestante"
                  className="w-full text-xs px-3 py-2 border border-amber-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none bg-amber-50/20 text-slate-800 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Notas Clínicas Gerais
                </label>
                <textarea
                  rows={3}
                  value={alertsForm.clinicalNotes}
                  onChange={e => setAlertsForm({ ...alertsForm, clinicalNotes: e.target.value })}
                  placeholder="Particularidades clínicas, histórico relevante ou condutas permanentes..."
                  className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Observações Gerais / Administrativas
                </label>
                <textarea
                  rows={2}
                  value={alertsForm.notesAdmin}
                  onChange={e => setAlertsForm({ ...alertsForm, notesAdmin: e.target.value })}
                  placeholder="Preferências de horário, contato de emergência, etc..."
                  className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAlertsModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Salvar Observações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Prontuários Anteriores */}
      {showPreviousRecordsModal && (
        <PatientPreviousRecordsModal
          isOpen={showPreviousRecordsModal}
          onClose={() => setShowPreviousRecordsModal(false)}
          patientId={appointment.patient_id}
          patientName={patientName}
        />
      )}

      {/* Modal de Termos de Consentimento (Opcional) */}
      {showConsentsDialog && appointment.patient_id && (
        <PatientConsentsDialog
          patientId={appointment.patient_id}
          onClose={() => setShowConsentsDialog(false)}
        />
      )}

    </div>
  );
};
