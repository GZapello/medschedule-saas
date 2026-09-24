import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useClinicalAutosave } from '../../hooks/useClinicalAutosave';
import { ClinicalAutosaveIndicator } from './ClinicalAutosaveIndicator';
import { FinishConsultationModal } from './FinishConsultationModal';
import { PatientPreviousRecordsModal } from './PatientPreviousRecordsModal';
import { ZemdaBodyModal } from '../zemda-body/ZemdaBodyModal';
import {
  FileText,
  Activity,
  HeartPulse,
  Scale,
  Camera,
  Baby,
  Target,
  History,
  Save,
  CheckCircle2,
  ChevronLeft,
  Calendar,
  User,
  Clock,
  Sparkles,
  Plus,
  Trash2,
  AlertCircle,
  Eye,
  ShieldCheck,
  Stethoscope
} from 'lucide-react';

interface GeneralClinicalWorkspaceProps {
  initialPatientId?: string;
  initialAppointmentId?: string;
  onFinishConsultation?: () => void;
  onClose?: () => void;
}

export interface TherapeuticGoal {
  id: string;
  description: string;
  targetDate?: string;
  status: 'pending' | 'in_progress' | 'achieved';
}

export const GeneralClinicalWorkspace: React.FC<GeneralClinicalWorkspaceProps> = ({
  initialPatientId,
  initialAppointmentId,
  onFinishConsultation,
  onClose
}) => {
  const { currentUser, hasCapability } = useAuth();
  const { showToast } = useToast();

  const [patient, setPatient] = useState<any>(null);
  const [appointment, setAppointment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('evolution');

  // Dados da Evolução Clínica
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [clinicalEvolution, setClinicalEvolution] = useState('');
  const [clinicalConduct, setClinicalConduct] = useState('');
  const [technicalNotes, setTechnicalNotes] = useState('');

  // Sinais Vitais & Biometria
  const [bloodPressureSystolic, setBloodPressureSystolic] = useState('');
  const [bloodPressureDiastolic, setBloodPressureDiastolic] = useState('');
  const [heartRate, setHeartRate] = useState('');
  const [respiratoryRate, setRespiratoryRate] = useState('');
  const [temperature, setTemperature] = useState('');
  const [oxygenSaturation, setOxygenSaturation] = useState('');
  const [capillaryBloodGlucose, setCapillaryBloodGlucose] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [heightCm, setHeightCm] = useState('');

  // Metas Terapêuticas
  const [goals, setGoals] = useState<TherapeuticGoal[]>([]);
  const [newGoalText, setNewGoalText] = useState('');

  // Avaliação de Dor & Queixa Anatômica
  const [painScale, setPainScale] = useState<number>(0);
  const [painLocation, setPainLocation] = useState('');
  const [painCharacteristics, setPainCharacteristics] = useState('');

  // Acompanhamento Fotográfico / Lesões / Feridas
  const [woundDescription, setWoundDescription] = useState('');
  const [woundStage, setWoundStage] = useState('');
  const [photoNotes, setPhotoNotes] = useState('');

  // Acompanhamento Gestacional / Parto
  const [gestationalWeeks, setGestationalWeeks] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [birthPlanNotes, setBirthPlanNotes] = useState('');
  const [lactationNotes, setLactationNotes] = useState('');

  // Modais auxiliares
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showBodyMapModal, setShowBodyMapModal] = useState(false);
  const [savingRecord, setSavingRecord] = useState(false);

  // IMC calculado
  const calculatedBmi = useMemo(() => {
    const w = parseFloat(weightKg.replace(',', '.'));
    const h = parseFloat(heightCm.replace(',', '.')) / 100;
    if (w > 0 && h > 0) {
      const bmi = w / (h * h);
      return bmi.toFixed(1);
    }
    return null;
  }, [weightKg, heightCm]);

  // Carrega dados iniciais do agendamento e paciente
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        if (initialAppointmentId) {
          const apptRes = await ApiClient.get<any>(`/v1/appointments/${initialAppointmentId}`);
          setAppointment(apptRes);
          if (apptRes?.patient_id) {
            const patRes = await ApiClient.get<any>(`/v1/patients/${apptRes.patient_id}`);
            setPatient(patRes);
          }
        } else if (initialPatientId) {
          const patRes = await ApiClient.get<any>(`/v1/patients/${initialPatientId}`);
          setPatient(patRes);
        }
      } catch (err: any) {
        console.error('Erro ao carregar dados do atendimento geral:', err);
        showToast('Não foi possível carregar as informações do agendamento.', 'error');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [initialPatientId, initialAppointmentId]);

  // Autosave setup
  const draftKey = `draft_general_clinical_${initialAppointmentId || initialPatientId || 'new'}`;
  const formData = useMemo(() => ({
    chiefComplaint,
    clinicalEvolution,
    clinicalConduct,
    technicalNotes,
    bloodPressureSystolic,
    bloodPressureDiastolic,
    heartRate,
    respiratoryRate,
    temperature,
    oxygenSaturation,
    capillaryBloodGlucose,
    weightKg,
    heightCm,
    painScale,
    painLocation,
    painCharacteristics,
    woundDescription,
    woundStage,
    photoNotes,
    gestationalWeeks,
    expectedDeliveryDate,
    birthPlanNotes,
    lactationNotes,
    goals
  }), [
    chiefComplaint, clinicalEvolution, clinicalConduct, technicalNotes,
    bloodPressureSystolic, bloodPressureDiastolic, heartRate, respiratoryRate,
    temperature, oxygenSaturation, capillaryBloodGlucose, weightKg, heightCm,
    painScale, painLocation, painCharacteristics,
    woundDescription, woundStage, photoNotes,
    gestationalWeeks, expectedDeliveryDate, birthPlanNotes, lactationNotes,
    goals
  ]);

  const handleRestoreDraft = (saved: any) => {
    if (!saved) return;
    if (saved.chiefComplaint) setChiefComplaint(saved.chiefComplaint);
    if (saved.clinicalEvolution) setClinicalEvolution(saved.clinicalEvolution);
    if (saved.clinicalConduct) setClinicalConduct(saved.clinicalConduct);
    if (saved.technicalNotes) setTechnicalNotes(saved.technicalNotes);
    if (saved.bloodPressureSystolic) setBloodPressureSystolic(saved.bloodPressureSystolic);
    if (saved.bloodPressureDiastolic) setBloodPressureDiastolic(saved.bloodPressureDiastolic);
    if (saved.heartRate) setHeartRate(saved.heartRate);
    if (saved.respiratoryRate) setRespiratoryRate(saved.respiratoryRate);
    if (saved.temperature) setTemperature(saved.temperature);
    if (saved.oxygenSaturation) setOxygenSaturation(saved.oxygenSaturation);
    if (saved.capillaryBloodGlucose) setCapillaryBloodGlucose(saved.capillaryBloodGlucose);
    if (saved.weightKg) setWeightKg(saved.weightKg);
    if (saved.heightCm) setHeightCm(saved.heightCm);
    if (saved.painScale !== undefined) setPainScale(saved.painScale);
    if (saved.painLocation) setPainLocation(saved.painLocation);
    if (saved.painCharacteristics) setPainCharacteristics(saved.painCharacteristics);
    if (saved.woundDescription) setWoundDescription(saved.woundDescription);
    if (saved.woundStage) setWoundStage(saved.woundStage);
    if (saved.photoNotes) setPhotoNotes(saved.photoNotes);
    if (saved.gestationalWeeks) setGestationalWeeks(saved.gestationalWeeks);
    if (saved.expectedDeliveryDate) setExpectedDeliveryDate(saved.expectedDeliveryDate);
    if (saved.birthPlanNotes) setBirthPlanNotes(saved.birthPlanNotes);
    if (saved.lactationNotes) setLactationNotes(saved.lactationNotes);
    if (Array.isArray(saved.goals)) setGoals(saved.goals);
  };

  const { autosaveStatus, lastSavedTime, clearDraft } = useClinicalAutosave({
    moduleType: 'general',
    patientId: patient?.id || initialPatientId || appointment?.patient_id,
    appointmentId: initialAppointmentId || appointment?.id,
    payload: formData,
    onRestoreDraft: handleRestoreDraft,
    enabled: !!(patient?.id || initialPatientId || appointment?.patient_id)
  });

  // Adicionar meta terapêutica
  const handleAddGoal = () => {
    if (!newGoalText.trim()) return;
    const newGoal: TherapeuticGoal = {
      id: 'goal_' + Date.now(),
      description: newGoalText.trim(),
      status: 'in_progress'
    };
    setGoals(prev => [...prev, newGoal]);
    setNewGoalText('');
  };

  const handleToggleGoalStatus = (goalId: string) => {
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g;
      const nextStatus: TherapeuticGoal['status'] =
        g.status === 'in_progress' ? 'achieved' :
        g.status === 'achieved' ? 'pending' : 'in_progress';
      return { ...g, status: nextStatus };
    }));
  };

  const handleRemoveGoal = (goalId: string) => {
    setGoals(prev => prev.filter(g => g.id !== goalId));
  };

  // Salvar registro oficial no prontuário
  const handleSaveRecord = async (isFinish: boolean = false) => {
    if (!clinicalEvolution.trim() && !chiefComplaint.trim()) {
      showToast('Preencha a queixa ou a evolução antes de salvar o prontuário.', 'error');
      return;
    }

    try {
      setSavingRecord(true);
      const sessionDate = appointment?.start_time
        ? appointment.start_time.split('T')[0]
        : new Date().toISOString().split('T')[0];

      const patientId = appointment?.patient_id || initialPatientId || patient?.id;
      const professionalId = appointment?.professional_id || currentUser?.professionalId;

      // Monta anotações estruturadas complementares com base nas capabilities ativas
      const structuredData: Record<string, any> = {};
      if (hasCapability('MEDICAL_VITAL_SIGNS') || bloodPressureSystolic || heartRate) {
        structuredData.vitalSigns = {
          systolic: bloodPressureSystolic,
          diastolic: bloodPressureDiastolic,
          heartRate,
          respiratoryRate,
          temperature,
          oxygenSaturation,
          glucose: capillaryBloodGlucose
        };
      }
      if (hasCapability('ANTHROPOMETRY') || weightKg || heightCm) {
        structuredData.anthropometry = {
          weightKg,
          heightCm,
          bmi: calculatedBmi
        };
      }
      if (hasCapability('THERAPEUTIC_GOALS') && goals.length > 0) {
        structuredData.goals = goals;
      }
      if ((hasCapability('BODY_MAP') || hasCapability('PAIN_ASSESSMENT')) && (painScale > 0 || painLocation)) {
        structuredData.painAssessment = {
          scale: painScale,
          location: painLocation,
          characteristics: painCharacteristics
        };
      }
      if (hasCapability('PHOTO_MONITORING') && (woundDescription || photoNotes)) {
        structuredData.woundMonitoring = {
          description: woundDescription,
          stage: woundStage,
          notes: photoNotes
        };
      }
      if (hasCapability('GESTATIONAL_FOLLOWUP') && (gestationalWeeks || birthPlanNotes)) {
        structuredData.gestationalFollowup = {
          weeks: gestationalWeeks,
          deliveryDate: expectedDeliveryDate,
          birthPlan: birthPlanNotes,
          lactation: lactationNotes
        };
      }

      const notesCombined = [
        clinicalConduct ? `CONDUTA / ORIENTAÇÕES:\n${clinicalConduct}` : '',
        technicalNotes ? `OBSERVAÇÕES TÉCNICAS:\n${technicalNotes}` : '',
        Object.keys(structuredData).length > 0 ? `DADOS CLÍNICOS ESTRUTURADOS:\n${JSON.stringify(structuredData, null, 2)}` : ''
      ].filter(Boolean).join('\n\n');

      const title = chiefComplaint.trim()
        ? `Atendimento: ${chiefComplaint.trim().slice(0, 80)}`
        : `Atendimento Clínico • ${currentUser?.canonicalProfessionName || currentUser?.professionName || 'Saúde'}`;

      await ApiClient.post('/v1/clinical-records', {
        patientId,
        appointmentId: initialAppointmentId || appointment?.id,
        professionalId,
        sessionDate,
        title,
        clinicalEvolution: clinicalEvolution.trim() || 'Atendimento clínico realizado conforme condutas registradas.',
        technicalNotes: notesCombined || null,
        moduleType: 'general'
      });

      showToast('Registro clínico gravado com sucesso no prontuário oficial!', 'success');
      clearDraft();

      if (isFinish) {
        setShowFinishModal(true);
      }
    } catch (err: any) {
      console.error('Erro ao salvar prontuário clínico:', err);
      showToast(err.message || 'Erro ao gravar evolução no prontuário.', 'error');
    } finally {
      setSavingRecord(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[400px]">
        <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-slate-600">Carregando workspace de atendimento...</p>
      </div>
    );
  }

  const professionLabel = currentUser?.canonicalProfessionName || currentUser?.professionName || 'Profissional de Saúde';

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Top Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-xs px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" /> Voltar
              </button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm sm:text-base text-slate-900">
                  {patient?.name || appointment?.patient_name || 'Paciente em Atendimento'}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
                  {professionLabel}
                </span>
              </div>
              <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                {appointment?.start_time && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {new Date(appointment.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                {patient?.birth_date && (
                  <span>• Nasc: {new Date(patient.birth_date).toLocaleDateString('pt-BR')}</span>
                )}
                {appointment?.service_name && (
                  <span>• Procedimento: {appointment.service_name}</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <ClinicalAutosaveIndicator status={autosaveStatus} lastSavedTime={lastSavedTime} />

            <button
              type="button"
              onClick={() => setShowHistoryModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
            >
              <History className="w-4 h-4 text-slate-500" /> Histórico 360°
            </button>

            <button
              type="button"
              disabled={savingRecord}
              onClick={() => handleSaveRecord(false)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-teal-700 bg-teal-50 border border-teal-300 hover:bg-teal-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> Salvar Evolução
            </button>

            <button
              type="button"
              disabled={savingRecord}
              onClick={() => handleSaveRecord(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-all shadow-xs hover:shadow-md cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" /> Finalizar Atendimento
            </button>
          </div>
        </div>
      </header>

      {/* Navegação de Abas Dinâmicas baseadas em Capabilities */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto py-2">
          <button
            type="button"
            onClick={() => setActiveTab('evolution')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'evolution'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FileText className="w-4 h-4" /> Evolução & Conduta
          </button>

          {(hasCapability('MEDICAL_VITAL_SIGNS') || hasCapability('ANTHROPOMETRY')) && (
            <button
              type="button"
              onClick={() => setActiveTab('vitals')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'vitals'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <HeartPulse className="w-4 h-4" /> Sinais Vitais & Biometria
            </button>
          )}

          {hasCapability('THERAPEUTIC_GOALS') && (
            <button
              type="button"
              onClick={() => setActiveTab('goals')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'goals'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Target className="w-4 h-4" /> Metas Terapêuticas
              {goals.length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-white/20 text-white font-extrabold">
                  {goals.length}
                </span>
              )}
            </button>
          )}

          {(hasCapability('BODY_MAP') || hasCapability('PAIN_ASSESSMENT')) && (
            <button
              type="button"
              onClick={() => setActiveTab('bodymap')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'bodymap'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Activity className="w-4 h-4" /> Mapa Corporal & Dor
            </button>
          )}

          {hasCapability('PHOTO_MONITORING') && (
            <button
              type="button"
              onClick={() => setActiveTab('photos')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'photos'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Camera className="w-4 h-4" /> Fotos & Lesões
            </button>
          )}

          {hasCapability('GESTATIONAL_FOLLOWUP') && (
            <button
              type="button"
              onClick={() => setActiveTab('gestational')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'gestational'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Baby className="w-4 h-4" /> Acompanhamento Gestacional
            </button>
          )}
        </div>
      </div>

      {/* Conteúdo Principal do Atendimento */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 space-y-6">
        {/* ABA: EVOLUÇÃO CLÍNICA & CONDUTA */}
        {activeTab === 'evolution' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Card Queixa Principal */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700">
                  Queixa Principal / Motivo do Atendimento
                </label>
                <input
                  type="text"
                  value={chiefComplaint}
                  onChange={e => setChiefComplaint(e.target.value)}
                  placeholder="Ex: Curativo em membro inferior, orientação pós-parto, dor articular, sessão de acupuntura..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-hidden transition-all font-medium text-slate-800"
                />
              </div>

              {/* Card Evolução Clínica Detalhada */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700">
                    Evolução Clínica & Procedimentos Realizados
                  </label>
                  <span className="text-[11px] text-slate-400 font-medium">
                    Prontuário Confidencial do Paciente
                  </span>
                </div>
                <textarea
                  rows={8}
                  value={clinicalEvolution}
                  onChange={e => setClinicalEvolution(e.target.value)}
                  placeholder="Descreva detalhadamente o estado atual do paciente, intervenções executadas, resposta ao tratamento e observações clínicas relevantes..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-hidden transition-all font-normal text-slate-800 resize-y leading-relaxed"
                />
              </div>

              {/* Card Conduta & Orientações */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700">
                  Conduta, Orientações & Encaminhamentos
                </label>
                <textarea
                  rows={4}
                  value={clinicalConduct}
                  onChange={e => setClinicalConduct(e.target.value)}
                  placeholder="Orientações fornecidas ao paciente/família, cuidados domiciliares, agendamento de retorno e recomendações..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-hidden transition-all font-normal text-slate-800 resize-y leading-relaxed"
                />
              </div>
            </div>

            {/* Coluna Lateral de Apoio Rápido */}
            <div className="space-y-6">
              {/* Card de Resumo Rápido de Sinais */}
              {(hasCapability('MEDICAL_VITAL_SIGNS') || hasCapability('ANTHROPOMETRY')) && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <HeartPulse className="w-4 h-4 text-rose-500" /> Sinais Rápidos
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('vitals')}
                      className="text-xs text-teal-600 font-bold hover:underline cursor-pointer"
                    >
                      Ver todos
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 block mb-1">Pressão (PA)</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          placeholder="120"
                          value={bloodPressureSystolic}
                          onChange={e => setBloodPressureSystolic(e.target.value)}
                          className="w-14 px-2 py-1.5 rounded-lg border border-slate-200 text-center font-bold text-slate-800"
                        />
                        <span>/</span>
                        <input
                          type="text"
                          placeholder="80"
                          value={bloodPressureDiastolic}
                          onChange={e => setBloodPressureDiastolic(e.target.value)}
                          className="w-14 px-2 py-1.5 rounded-lg border border-slate-200 text-center font-bold text-slate-800"
                        />
                      </div>
                    </div>

                    <div>
                      <span className="text-slate-500 block mb-1">Freq. Cardíaca</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          placeholder="72"
                          value={heartRate}
                          onChange={e => setHeartRate(e.target.value)}
                          className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 text-center font-bold text-slate-800"
                        />
                        <span className="text-[10px] text-slate-400">bpm</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-slate-500 block mb-1">Glicemia</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          placeholder="95"
                          value={capillaryBloodGlucose}
                          onChange={e => setCapillaryBloodGlucose(e.target.value)}
                          className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 text-center font-bold text-slate-800"
                        />
                        <span className="text-[10px] text-slate-400">mg/dL</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-slate-500 block mb-1">Sat. O₂</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          placeholder="98"
                          value={oxygenSaturation}
                          onChange={e => setOxygenSaturation(e.target.value)}
                          className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 text-center font-bold text-slate-800"
                        />
                        <span className="text-[10px] text-slate-400">%</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Card de Ferramentas Rápidas Complementares */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 block border-b border-slate-100 pb-2">
                  Ferramentas Integradas
                </span>

                {(hasCapability('BODY_MAP') || hasCapability('PAIN_ASSESSMENT')) && (
                  <button
                    type="button"
                    onClick={() => setShowBodyMapModal(true)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-teal-200 bg-teal-50/60 hover:bg-teal-100/70 text-teal-800 text-xs font-bold transition-all cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Activity className="w-4 h-4 text-teal-600" /> Abrir ZemdaBody (Mapa Corporal)
                    </span>
                    <span className="text-teal-600">→</span>
                  </button>
                )}

                <div className="pt-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Observações Administrativas / Internas
                  </label>
                  <textarea
                    rows={3}
                    value={technicalNotes}
                    onChange={e => setTechnicalNotes(e.target.value)}
                    placeholder="Notas visíveis apenas internamente pela equipe..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-hidden font-normal text-slate-800 resize-none"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA: SINAIS VITAIS & BIOMETRIA */}
        {activeTab === 'vitals' && (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <HeartPulse className="w-4 h-4 text-rose-500" /> Registro Completo de Sinais Vitais & Biometria
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Parâmetros fisiológicos medidos durante a consulta.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-1">
                <label className="text-xs font-semibold text-slate-600">Pressão Arterial (PA)</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    placeholder="120"
                    value={bloodPressureSystolic}
                    onChange={e => setBloodPressureSystolic(e.target.value)}
                    className="w-20 px-3 py-2 rounded-lg border border-slate-200 bg-white font-bold text-center text-sm"
                  />
                  <span className="font-bold text-slate-400">/</span>
                  <input
                    type="text"
                    placeholder="80"
                    value={bloodPressureDiastolic}
                    onChange={e => setBloodPressureDiastolic(e.target.value)}
                    className="w-20 px-3 py-2 rounded-lg border border-slate-200 bg-white font-bold text-center text-sm"
                  />
                  <span className="text-xs text-slate-400 font-medium">mmHg</span>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-1">
                <label className="text-xs font-semibold text-slate-600">Frequência Cardíaca</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="75"
                    value={heartRate}
                    onChange={e => setHeartRate(e.target.value)}
                    className="w-24 px-3 py-2 rounded-lg border border-slate-200 bg-white font-bold text-center text-sm"
                  />
                  <span className="text-xs text-slate-400 font-medium">bpm</span>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-1">
                <label className="text-xs font-semibold text-slate-600">Frequência Respiratória</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="16"
                    value={respiratoryRate}
                    onChange={e => setRespiratoryRate(e.target.value)}
                    className="w-24 px-3 py-2 rounded-lg border border-slate-200 bg-white font-bold text-center text-sm"
                  />
                  <span className="text-xs text-slate-400 font-medium">irpm</span>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-1">
                <label className="text-xs font-semibold text-slate-600">Temperatura Corporal</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="36.5"
                    value={temperature}
                    onChange={e => setTemperature(e.target.value)}
                    className="w-24 px-3 py-2 rounded-lg border border-slate-200 bg-white font-bold text-center text-sm"
                  />
                  <span className="text-xs text-slate-400 font-medium">°C</span>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-1">
                <label className="text-xs font-semibold text-slate-600">Saturação de O₂ (SpO₂)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="98"
                    value={oxygenSaturation}
                    onChange={e => setOxygenSaturation(e.target.value)}
                    className="w-24 px-3 py-2 rounded-lg border border-slate-200 bg-white font-bold text-center text-sm"
                  />
                  <span className="text-xs text-slate-400 font-medium">%</span>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-1">
                <label className="text-xs font-semibold text-slate-600">Glicemia Capilar</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="90"
                    value={capillaryBloodGlucose}
                    onChange={e => setCapillaryBloodGlucose(e.target.value)}
                    className="w-24 px-3 py-2 rounded-lg border border-slate-200 bg-white font-bold text-center text-sm"
                  />
                  <span className="text-xs text-slate-400 font-medium">mg/dL</span>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-1">
                <label className="text-xs font-semibold text-slate-600">Peso Corporal</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="70"
                    value={weightKg}
                    onChange={e => setWeightKg(e.target.value)}
                    className="w-24 px-3 py-2 rounded-lg border border-slate-200 bg-white font-bold text-center text-sm"
                  />
                  <span className="text-xs text-slate-400 font-medium">kg</span>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-1">
                <label className="text-xs font-semibold text-slate-600">Altura</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="170"
                    value={heightCm}
                    onChange={e => setHeightCm(e.target.value)}
                    className="w-24 px-3 py-2 rounded-lg border border-slate-200 bg-white font-bold text-center text-sm"
                  />
                  <span className="text-xs text-slate-400 font-medium">cm</span>
                </div>
              </div>
            </div>

            {calculatedBmi && (
              <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-teal-900 block">Índice de Massa Corporal (IMC)</span>
                  <span className="text-xs text-teal-700">Calculado automaticamente a partir de peso e altura informados.</span>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-extrabold text-teal-800">{calculatedBmi}</span>
                  <span className="text-xs text-teal-600 block">kg/m²</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ABA: METAS TERAPÊUTICAS */}
        {activeTab === 'goals' && (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Target className="w-4 h-4 text-indigo-600" /> Definição & Acompanhamento de Metas Terapêuticas
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Estabeleça objetivos terapêuticos de curto e médio prazo acordados com o paciente.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newGoalText}
                onChange={e => setNewGoalText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddGoal(); }}
                placeholder="Descreva uma meta (ex: Reduzir edema em 50%, caminhar 20 minutos sem dor, cicatrização total da lesão)..."
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-hidden"
              />
              <button
                type="button"
                onClick={handleAddGoal}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Adicionar Meta
              </button>
            </div>

            {goals.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl">
                <Target className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-500 font-medium">Nenhuma meta terapêutica cadastrada ainda para este atendimento.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {goals.map(g => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleToggleGoalStatus(g.id)}
                        className={`w-5 h-5 rounded-md flex items-center justify-center border cursor-pointer transition-colors ${
                          g.status === 'achieved'
                            ? 'bg-teal-600 border-teal-600 text-white'
                            : 'border-slate-300 hover:border-slate-400 bg-white'
                        }`}
                      >
                        {g.status === 'achieved' && <CheckCircle2 className="w-3.5 h-3.5" />}
                      </button>
                      <span className={`text-xs font-medium ${g.status === 'achieved' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                        {g.description}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        g.status === 'achieved' ? 'bg-teal-100 text-teal-800' :
                        g.status === 'in_progress' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {g.status === 'achieved' ? 'Atingida' : g.status === 'in_progress' ? 'Em andamento' : 'Pendente'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveGoal(g.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA: MAPA CORPORAL & DOR */}
        {activeTab === 'bodymap' && (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4 text-teal-600" /> Avaliação da Dor & Queixas Anatômicas
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Mapeamento da intensidade pela escala analógica visual (EVA) e localização.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowBodyMapModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <Activity className="w-4 h-4" /> Abrir Caneta Anatômica ZemdaBody
              </button>
            </div>

            {/* Escala EVA */}
            <div className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-200/70">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">
                  Escala Visual Analógica da Dor (EVA: 0 a 10)
                </label>
                <span className={`text-base font-extrabold ${
                  painScale === 0 ? 'text-teal-600' :
                  painScale <= 3 ? 'text-emerald-600' :
                  painScale <= 6 ? 'text-amber-600' : 'text-rose-600'
                }`}>
                  {painScale} / 10 • {
                    painScale === 0 ? 'Sem Dor' :
                    painScale <= 3 ? 'Dor Leve' :
                    painScale <= 6 ? 'Dor Moderada' :
                    painScale <= 8 ? 'Dor Intensa' : 'Dor Insuportável'
                  }
                </span>
              </div>

              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={painScale}
                onChange={e => setPainScale(parseInt(e.target.value, 10))}
                className="w-full accent-teal-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
              />

              <div className="flex justify-between text-[11px] text-slate-400 font-semibold px-1">
                <span>0 (Sem dor)</span>
                <span>3 (Leve)</span>
                <span>5 (Moderada)</span>
                <span>8 (Intensa)</span>
                <span>10 (Máxima)</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Localização Anatômica da Dor / Queixa
                </label>
                <input
                  type="text"
                  value={painLocation}
                  onChange={e => setPainLocation(e.target.value)}
                  placeholder="Ex: Joelho direito compartimento medial, região lombar L4-L5, ombro..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-teal-500 outline-hidden font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Características & Comportamento da Dor
                </label>
                <input
                  type="text"
                  value={painCharacteristics}
                  onChange={e => setPainCharacteristics(e.target.value)}
                  placeholder="Ex: Pontada, queimação, irradiação, piora com carga, melhora em repouso..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-teal-500 outline-hidden font-medium"
                />
              </div>
            </div>
          </div>
        )}

        {/* ABA: FOTOS & LESÕES */}
        {activeTab === 'photos' && (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Camera className="w-4 h-4 text-emerald-600" /> Acompanhamento de Feridas, Podologia ou Estética
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Monitoramento longitudinal evolutivo de tecidos, lesões ou alterações dermatológicas.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Descrição da Lesão / Área Monitorada
                </label>
                <textarea
                  rows={4}
                  value={woundDescription}
                  onChange={e => setWoundDescription(e.target.value)}
                  placeholder="Localização exata, dimensões (comprimento x largura em cm), presença de tecido de granulação, esfacelo, necrose, aspecto do exsudato..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-teal-500 outline-hidden font-normal"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Estágio / Classificação & Conduta Específica
                </label>
                <textarea
                  rows={4}
                  value={woundStage}
                  onChange={e => setWoundStage(e.target.value)}
                  placeholder="Classificação de gravidade (ex: grau de úlcera, pé diabético escala de Wagner/Meggitt), cobertura aplicada e técnica realizada..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-teal-500 outline-hidden font-normal"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Notas do Registro Fotográfico / Comparativo Evolutivo
              </label>
              <input
                type="text"
                value={photoNotes}
                onChange={e => setPhotoNotes(e.target.value)}
                placeholder="Ex: Foto registrada antes da limpeza; melhora de 30% em relação à última semana..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-teal-500 outline-hidden font-medium"
              />
            </div>
          </div>
        )}

        {/* ABA: ACOMPANHAMENTO GESTACIONAL */}
        {activeTab === 'gestational' && (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Baby className="w-4 h-4 text-purple-600" /> Acompanhamento Gestacional & Perinatal (Doula / Enfermagem)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Apoio contínuo à gestante, plano de parto, preparação física e amamentação.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Idade Gestacional Atual (Semanas + Dias)
                </label>
                <input
                  type="text"
                  value={gestationalWeeks}
                  onChange={e => setGestationalWeeks(e.target.value)}
                  placeholder="Ex: 34 semanas e 2 dias"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-teal-500 outline-hidden font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Data Provável do Parto (DPP)
                </label>
                <input
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={e => setExpectedDeliveryDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-teal-500 outline-hidden font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Plano de Parto & Preferências
                </label>
                <textarea
                  rows={4}
                  value={birthPlanNotes}
                  onChange={e => setBirthPlanNotes(e.target.value)}
                  placeholder="Preferências de ambiente, métodos não farmacológicos de alívio da dor, posições e presença do acompanhante..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-teal-500 outline-hidden font-normal"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Consultoria de Lactação & Puerpério
                </label>
                <textarea
                  rows={4}
                  value={lactationNotes}
                  onChange={e => setLactationNotes(e.target.value)}
                  placeholder="Orientações de pega, posição da mamada, cuidados com fissuras, massagem e ordenha..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-teal-500 outline-hidden font-normal"
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modais Integrados */}
      {showHistoryModal && (patient?.id || appointment?.patient_id) && (
        <PatientPreviousRecordsModal
          patientId={patient?.id || appointment?.patient_id}
          onClose={() => setShowHistoryModal(false)}
        />
      )}

      {showBodyMapModal && (patient?.id || appointment?.patient_id) && (
        <ZemdaBodyModal
          isOpen={showBodyMapModal}
          onClose={() => setShowBodyMapModal(false)}
          patientId={patient?.id || appointment?.patient_id}
          patientName={patient?.name || appointment?.patient_name}
        />
      )}

      {showFinishModal && appointment?.id && (
        <FinishConsultationModal
          appointment={{
            id: appointment.id,
            patient_id: appointment.patient_id || patient?.id,
            patient_name: appointment.patient_name || patient?.name,
            professional_id: appointment.professional_id || currentUser?.professionalId || '',
            professional_name: appointment.professional_name || currentUser?.name,
            service_id: appointment.service_id || '',
            service_name: appointment.service_name || 'Atendimento Clínico',
            start_time: appointment.start_time || new Date().toISOString()
          }}
          clinicalData={{
            title: chiefComplaint.trim() || 'Atendimento Clínico',
            clinicalEvolution: clinicalEvolution.trim(),
            technicalNotes: technicalNotes.trim() || undefined,
            moduleType: 'general'
          }}
          onClose={() => {
            setShowFinishModal(false);
            if (onFinishConsultation) onFinishConsultation();
          }}
          onFinished={() => {
            setShowFinishModal(false);
            if (onFinishConsultation) onFinishConsultation();
          }}
        />
      )}
    </div>
  );
};
