import { useClinicalFormReset } from '../../hooks/useClinicalFormReset';
import { useClinicalAutosave } from '../../hooks/useClinicalAutosave';
import { ClinicalAutosaveIndicator } from '../clinical/ClinicalAutosaveIndicator';
import { ClinicalDraftRecoveryModal } from '../clinical/ClinicalDraftRecoveryModal';
import { FinishConsultationModal } from '../clinical/FinishConsultationModal';
import { ClinicalBooleanSelect } from '../clinical/ClinicalBooleanSelect';
import { useHorizontalTabScroll } from '../../hooks/useHorizontalTabScroll';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Sparkles,
  Activity,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  Layers,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
  User,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  Check,
  RotateCcw,
  ArrowRight,
  ArrowLeftRight,
  Sliders,
  Scissors,
  Package,
  Maximize2,
  X,
  RefreshCw,
  Filter,
  ExternalLink,
  Lock,
  ChevronUp,
  Image as ImageIcon
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PatientSearchSelect, PatientSearchResult } from '../common/PatientSearchSelect';
import { ProfessionalModuleHeader } from '../common/ProfessionalModuleHeader';
import { ZemdaBodyModal } from '../zemda-body/ZemdaBodyModal';
import { ZemdaBodyWorkspace } from '../zemda-body/ZemdaBodyWorkspace';

export type EsteticArea = 'FACIAL' | 'CORPORAL' | 'CAPILAR';

interface ZemdaEsteticWorkspaceProps {
  initialPatientId?: string;
  initialAppointmentId?: string;
  onSelectPatient?: (patientId: string) => void;
  onFinishConsultation?: () => void;
}

export const ZemdaEsteticWorkspace: React.FC<ZemdaEsteticWorkspaceProps> = ({
  initialPatientId,
  initialAppointmentId,
  onSelectPatient,
  onFinishConsultation
}) => {
  const { currentUser, isClinicAdmin, isSuperAdmin, isDentist, practiceAreaIds } = useAuth();
  const { showToast } = useToast();

  // Configuração e permissões do módulo
  const [allowedAreas, setAllowedAreas] = useState<EsteticArea[]>(['FACIAL']);
  const [activeArea, setActiveArea] = useState<EsteticArea>('FACIAL');
  const [isAreaDropdownOpen, setIsAreaDropdownOpen] = useState(false);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);

  // Paciente selecionado
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId || '');
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchResult | null>(null);

  // Navegação por abas
  const [activeTab, setActiveTab] = useState<
    | 'overview'
    | 'assessment'
    | 'photos'
    | 'planning'
    | 'procedures'
    | 'zemda360'
    | 'evolutions'
    | 'returns'
    | 'before_after'
    | 'history'
  >('overview');

  const { tabScrollProps } = useHorizontalTabScroll(activeTab);

  // Estados de dados do paciente
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [overviewData, setOverviewData] = useState<any>(null);

  const [assessments, setAssessments] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [procedures, setProcedures] = useState<any[]>([]);
  const [evolutions, setEvolutions] = useState<any[]>([]);
  const [returnsList, setReturnsList] = useState<any[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [beforeAfterPairs, setBeforeAfterPairs] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);

  // Modais de ações rápidas
  const [isNewPlanModalOpen, setIsNewPlanModalOpen] = useState(false);
  const [isNewProcedureModalOpen, setIsNewProcedureModalOpen] = useState(false);
  const [isNewPhotoModalOpen, setIsNewPhotoModalOpen] = useState(false);
  const [isNewEvolutionModalOpen, setIsNewEvolutionModalOpen] = useState(false);
  const [isNewReturnModalOpen, setIsNewReturnModalOpen] = useState(false);
  const [isZemda360ModalOpen, setIsZemda360ModalOpen] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<any | null>(null);

  // Formulário de Nova Avaliação
  const [assessmentForm, setAssessmentForm] = useState({
    complaint: '',
    expectations: '',
    // Facial
    fitzpatrick: '',
    glogau: '',
    dynamicLines: [] as string[],
    staticLines: [] as string[],
    flaccidityRegions: [] as string[],
    volumeLossRegions: [] as string[],
    // Corporal
    targetRegions: [] as string[],
    bodyAlterationType: '',
    celluliteGrade: '',
    stretchMarks: '',
    circumferences: { cintura: '', abdomen: '', quadril: '', coxaDir: '', coxaEsq: '', bracoDir: '', bracoEsq: '' },
    habits: { physicalActivity: '', waterIntake: '', smoking: '' },
    // Capilar
    hairLossPattern: '',
    hairLossScale: '',
    scalpCondition: { oiliness: '', flaking: '', erythema: '', sensitivity: '' },
    pullTest: '',
    fiberDensity: '',
    familyHistory: '',
    // Geral
    previousTreatments: '',
    contraindications: '',
    allergies: '',
    currentMedications: '',
    clinicalConduct: '',
    observations: ''
  });
  const [isSavingAssessment, setIsSavingAssessment] = useState(false);
  const [selectedAssessmentDetail, setSelectedAssessmentDetail] = useState<any | null>(null);

  // Formulário de Novo Plano
  const [planForm, setPlanForm] = useState({
    title: '',
    area: 'FACIAL' as EsteticArea,
    objectives: '',
    notes: '',
    items: [
      {
        procedure_name: '',
        target_region: '',
        sessions_planned: '' as number | '',
        recommended_interval_days: '' as number | '',
        priority: ''
      }
    ]
  });

  // Formulário de Novo Procedimento
  const [procedureForm, setProcedureForm] = useState({
    procedure_name: '',
    area: 'FACIAL' as EsteticArea,
    target_region: '',
    date_performed: new Date().toISOString().slice(0, 10),
    product_applied: '',
    lot_number: '',
    expiry_date: '',
    quantity: '',
    unit: 'ml',
    technique_notes: '',
    adverse_reactions: '',
    post_instructions: '',
    deduct_inventory: false,
    inventory_item_id: '',
    plan_item_id: ''
  });

  // Formulário de Nova Foto
  const [photoForm, setPhotoForm] = useState({
    photo_url: '',
    photo_type: 'ANTES' as 'ANTES' | 'DEPOIS' | 'ACOMPANHAMENTO' | 'RETORNO',
    view_angle: 'FRONTAL',
    area: 'FACIAL' as EsteticArea,
    taken_at: new Date().toISOString().slice(0, 10),
    notes: ''
  });

  // Formulário de Nova Evolução
  const [evolutionForm, setEvolutionForm] = useState({
    evolution_date: new Date().toISOString().slice(0, 10),
    area: 'FACIAL' as EsteticArea,
    biological_response: '',
    patient_feedback: '',
    conduct: '',
    procedure_id: ''
  });

  // Formulário de Novo Retorno
  const [returnForm, setReturnForm] = useState({
    scheduled_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    actual_date: '',
    area: 'FACIAL' as EsteticArea,
    procedure_id: '',
    status: 'AGENDADO' as 'AGENDADO' | 'COMPARECEU' | 'RETOQUE_REALIZADO' | 'ALTA_CICLO',
    evaluation_notes: '',
    touchup_required: undefined as boolean | undefined,
    touchup_description: ''
  });

  const isCurrentClinicalContext = useClinicalFormReset(selectedPatientId + ':' + (initialAppointmentId || ''), [
    [assessmentForm, setAssessmentForm],
    [planForm, setPlanForm],
    [procedureForm, setProcedureForm],
    [evolutionForm, setEvolutionForm],
    [returnForm, setReturnForm],
  ]);

  const [finishAppointment, setFinishAppointment] = useState<any>(null);
  const clinicalPayload = { assessmentForm, planForm, procedureForm, evolutionForm, returnForm };
  const autosave = useClinicalAutosave({
    moduleType: 'ZemdaEstetic', patientId: selectedPatientId, appointmentId: initialAppointmentId,
    payload: clinicalPayload,
    onRestoreDraft: draft => {
      if (draft.assessmentForm) setAssessmentForm(previous => ({ ...previous, ...draft.assessmentForm }));
      if (draft.planForm) setPlanForm(previous => ({ ...previous, ...draft.planForm }));
      if (draft.procedureForm) setProcedureForm(previous => ({ ...previous, ...draft.procedureForm }));
      if (draft.evolutionForm) setEvolutionForm(previous => ({ ...previous, ...draft.evolutionForm }));
      if (draft.returnForm) setReturnForm(previous => ({ ...previous, ...draft.returnForm }));
    }
  });
  useEffect(() => { setFinishAppointment(null); }, [selectedPatientId, initialAppointmentId]);
  const requestFinish = async () => {
    try {
      const { appointment } = await ApiClient.get<any>(`/v1/appointments/${initialAppointmentId}`);
      if (isCurrentClinicalContext() && appointment.patient_id === selectedPatientId) setFinishAppointment(appointment);
    } catch (error: any) { showToast(error.message || 'Erro ao abrir finalização.', 'error'); }
  };

  // Carrega configurações do ZemdaEstetic
  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await ApiClient.get<any>('/v1/estetic/config');
        if (res.allowedAreas && res.allowedAreas.length > 0) {
          setAllowedAreas(res.allowedAreas);
          if (!res.allowedAreas.includes(activeArea)) {
            setActiveArea(res.allowedAreas[0]);
          }
        }
        if (res.catalog) setCatalog(res.catalog);
        if (res.inventoryItems) setInventoryItems(res.inventoryItems);
      } catch (err: any) {
        console.error('Erro ao carregar configurações do ZemdaEstetic:', err);
      }
    }
    loadConfig();
  }, []);

  // Sincroniza área nos formulários quando a área ativa mudar
  useEffect(() => {
    setPlanForm(prev => ({ ...prev, area: activeArea }));
    setProcedureForm(prev => ({ ...prev, area: activeArea }));
    setPhotoForm(prev => ({ ...prev, area: activeArea }));
    setEvolutionForm(prev => ({ ...prev, area: activeArea }));
    setReturnForm(prev => ({ ...prev, area: activeArea }));
  }, [activeArea]);

  // Carrega dados completos do paciente quando mudar paciente ou área
  const loadPatientData = async (patientId: string, area: EsteticArea) => {
    if (!patientId) return;
    setLoadingOverview(true);
    try {
      const [ov, assRes, plRes, prRes, evRes, retRes, phRes, baRes, hisRes] = await Promise.all([
        ApiClient.get<any>(`/v1/estetic/patient-overview/${patientId}?area=${area}`).catch(() => null),
        ApiClient.get<any>(`/v1/estetic/assessments/patient/${patientId}?area=${area}`).catch(() => ({ assessments: [] })),
        ApiClient.get<any>(`/v1/estetic/plans/patient/${patientId}?area=${area}`).catch(() => ({ plans: [] })),
        ApiClient.get<any>(`/v1/estetic/procedures/patient/${patientId}?area=${area}`).catch(() => ({ procedures: [] })),
        ApiClient.get<any>(`/v1/estetic/evolutions/patient/${patientId}?area=${area}`).catch(() => ({ evolutions: [] })),
        ApiClient.get<any>(`/v1/estetic/returns/patient/${patientId}?area=${area}`).catch(() => ({ returns: [] })),
        ApiClient.get<any>(`/v1/estetic/photos/patient/${patientId}?area=${area}`).catch(() => ({ photos: [] })),
        ApiClient.get<any>(`/v1/estetic/before-after/patient/${patientId}?area=${area}`).catch(() => ({ pairs: [] })),
        ApiClient.get<any>(`/v1/estetic/history/patient/${patientId}?area=${area}`).catch(() => ({ timeline: [] }))
      ]);
      if (!isCurrentClinicalContext()) return;

      setOverviewData(ov);
      setAssessments(assRes?.assessments || []);
      setPlans(plRes?.plans || []);
      setProcedures(prRes?.procedures || []);
      setEvolutions(evRes?.evolutions || []);
      setReturnsList(retRes?.returns || []);
      setPhotos(phRes?.photos || []);
      setBeforeAfterPairs(baRes?.pairs || []);
      setTimeline(hisRes?.timeline || []);
    } catch (err) {
      console.error('Erro ao buscar registros estéticos do paciente:', err);
    } finally {
      setLoadingOverview(false);
    }
  };

  useEffect(() => {
    if (selectedPatientId) {
      loadPatientData(selectedPatientId, activeArea);
    }
  }, [selectedPatientId, activeArea]);

  const handleSelectPatient = (patientId: string, patient?: PatientSearchResult | null) => {
    setSelectedPatientId(patientId);
    setSelectedPatient(patient || null);
    if (onSelectPatient) onSelectPatient(patientId);
  };

  // Salvar Avaliação
  const handleSaveAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) {
      showToast('Selecione um paciente para registrar a avaliação.', 'info');
      return;
    }
    setIsSavingAssessment(true);
    try {
      const areaData = activeArea === 'FACIAL' ? {
        fitzpatrick: assessmentForm.fitzpatrick,
        glogau: assessmentForm.glogau,
        dynamicLines: assessmentForm.dynamicLines,
        staticLines: assessmentForm.staticLines,
        flaccidityRegions: assessmentForm.flaccidityRegions,
        volumeLossRegions: assessmentForm.volumeLossRegions
      } : activeArea === 'CORPORAL' ? {
        targetRegions: assessmentForm.targetRegions,
        bodyAlterationType: assessmentForm.bodyAlterationType,
        celluliteGrade: assessmentForm.celluliteGrade,
        stretchMarks: assessmentForm.stretchMarks,
        circumferences: assessmentForm.circumferences,
        habits: assessmentForm.habits
      } : {
        hairLossPattern: assessmentForm.hairLossPattern,
        hairLossScale: assessmentForm.hairLossScale,
        scalpCondition: assessmentForm.scalpCondition,
        pullTest: assessmentForm.pullTest,
        fiberDensity: assessmentForm.fiberDensity,
        familyHistory: assessmentForm.familyHistory
      };

      await ApiClient.post('/v1/estetic/assessments', {
        patient_id: selectedPatientId,
        area: activeArea,
        complaint: assessmentForm.complaint,
        expectations: assessmentForm.expectations,
        phototype: assessmentForm.fitzpatrick,
        skin_type: activeArea === 'FACIAL' ? `Fototipo ${assessmentForm.fitzpatrick} • Glogau ${assessmentForm.glogau}` : undefined,
        area_specific_data_json: areaData,
        previous_treatments: assessmentForm.previousTreatments,
        contraindications: assessmentForm.contraindications,
        allergies: assessmentForm.allergies,
        current_medications: assessmentForm.currentMedications,
        clinical_conduct: assessmentForm.clinicalConduct,
        observations: assessmentForm.observations
      });

      showToast(`Avaliação estética (${activeArea}) salva com sucesso!`, 'success');
      loadPatientData(selectedPatientId, activeArea);
      // Limpa ou preserva campos conforme conveniência
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar avaliação estética.', 'error');
    } finally {
      setIsSavingAssessment(false);
    }
  };

  // Salvar Plano
  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) return;
    try {
      await ApiClient.post('/v1/estetic/plans', {
        patient_id: selectedPatientId,
        area: planForm.area,
        title: planForm.title || `Planejamento ${planForm.area} - ${new Date().toLocaleDateString('pt-BR')}`,
        objectives: planForm.objectives,
        notes: planForm.notes,
        items: planForm.items.filter(i => i.procedure_name.trim().length > 0)
      });
      showToast('Plano de tratamento cadastrado com sucesso!', 'success');
      setIsNewPlanModalOpen(false);
      setPlanForm({
        title: '',
        area: activeArea,
        objectives: '',
        notes: '',
        items: [{ procedure_name: '', target_region: '', sessions_planned: '' as number | '', recommended_interval_days: '' as number | '', priority: '' }]
      });
      loadPatientData(selectedPatientId, activeArea);
    } catch (err: any) {
      showToast(err.message || 'Erro ao criar plano.', 'error');
    }
  };

  // Atualizar Status do Item de Plano
  const handleUpdatePlanItemStatus = async (planId: string, itemId: string, status: string) => {
    try {
      await ApiClient.patch(`/v1/estetic/plans/${planId}/item-status`, { item_id: itemId, status });
      showToast('Status do item atualizado.', 'success');
      loadPatientData(selectedPatientId, activeArea);
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar item do plano.', 'error');
    }
  };

  // Salvar Procedimento
  const handleSaveProcedure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) return;
    try {
      await ApiClient.post('/v1/estetic/procedures', {
        patient_id: selectedPatientId,
        procedure_name: procedureForm.procedure_name,
        area: procedureForm.area,
        target_region: procedureForm.target_region,
        date_performed: procedureForm.date_performed,
        product_applied: procedureForm.product_applied,
        lot_number: procedureForm.lot_number,
        expiry_date: procedureForm.expiry_date,
        quantity: procedureForm.quantity === '' ? undefined : Number(procedureForm.quantity),
        unit: procedureForm.unit,
        technique_notes: procedureForm.technique_notes,
        adverse_reactions: procedureForm.adverse_reactions,
        post_instructions: procedureForm.post_instructions,
        deduct_inventory: procedureForm.deduct_inventory,
        inventory_item_id: procedureForm.inventory_item_id || undefined,
        plan_item_id: procedureForm.plan_item_id || undefined
      });

      showToast('Procedimento estético registrado com sucesso!', 'success');
      setIsNewProcedureModalOpen(false);
      setProcedureForm({
        procedure_name: '',
        area: activeArea,
        target_region: '',
        date_performed: new Date().toISOString().slice(0, 10),
        product_applied: '',
        lot_number: '',
        expiry_date: '',
        quantity: '',
        unit: 'ml',
        technique_notes: '',
        adverse_reactions: '',
        post_instructions: '',
        deduct_inventory: false,
        inventory_item_id: '',
        plan_item_id: ''
      });
      loadPatientData(selectedPatientId, activeArea);
    } catch (err: any) {
      showToast(err.message || 'Erro ao registrar procedimento.', 'error');
    }
  };

  // Salvar Foto
  const handleSavePhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId || !photoForm.photo_url) {
      showToast('Informe a foto (URL ou arquivo).', 'info');
      return;
    }
    try {
      await ApiClient.post('/v1/estetic/photos', {
        patient_id: selectedPatientId,
        photo_url: photoForm.photo_url,
        photo_type: photoForm.photo_type,
        view_angle: photoForm.view_angle,
        area: photoForm.area,
        taken_at: photoForm.taken_at,
        notes: photoForm.notes
      });
      showToast('Fotografia clínica anexada com sucesso!', 'success');
      setIsNewPhotoModalOpen(false);
      setPhotoForm({
        photo_url: '',
        photo_type: 'ANTES',
        view_angle: 'FRONTAL',
        area: activeArea,
        taken_at: new Date().toISOString().slice(0, 10),
        notes: ''
      });
      loadPatientData(selectedPatientId, activeArea);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar fotografia.', 'error');
    }
  };

  // Upload local de imagem simulado/base64
  const handlePhotoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setPhotoForm(prev => ({ ...prev, photo_url: event.target!.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  // Salvar Evolução
  const handleSaveEvolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) return;
    try {
      await ApiClient.post('/v1/estetic/evolutions', {
        patient_id: selectedPatientId,
        area: evolutionForm.area,
        evolution_date: evolutionForm.evolution_date,
        biological_response: evolutionForm.biological_response,
        patient_feedback: evolutionForm.patient_feedback,
        conduct: evolutionForm.conduct,
        procedure_id: evolutionForm.procedure_id || undefined
      });
      showToast('Evolução clínica registrada!', 'success');
      setIsNewEvolutionModalOpen(false);
      setEvolutionForm({
        evolution_date: new Date().toISOString().slice(0, 10),
        area: activeArea,
        biological_response: '',
        patient_feedback: '',
        conduct: '',
        procedure_id: ''
      });
      loadPatientData(selectedPatientId, activeArea);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar evolução.', 'error');
    }
  };

  // Salvar Retorno
  const handleSaveReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) return;
    try {
      await ApiClient.post('/v1/estetic/returns', {
        patient_id: selectedPatientId,
        area: returnForm.area,
        procedure_id: returnForm.procedure_id || undefined,
        scheduled_date: returnForm.scheduled_date,
        actual_date: returnForm.actual_date || undefined,
        status: returnForm.status,
        evaluation_notes: returnForm.evaluation_notes,
        touchup_required: returnForm.touchup_required === undefined ? undefined : returnForm.touchup_required ? 1 : 0,
        touchup_description: returnForm.touchup_description
      });
      showToast('Retorno estético agendado/registrado!', 'success');
      setIsNewReturnModalOpen(false);
      setReturnForm({
        scheduled_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
        actual_date: '',
        area: activeArea,
        procedure_id: '',
        status: 'AGENDADO',
        evaluation_notes: '',
        touchup_required: undefined,
        touchup_description: ''
      });
      loadPatientData(selectedPatientId, activeArea);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar retorno.', 'error');
    }
  };

  // Alternar checkbox nos campos de avaliação
  const toggleArrayItem = (field: 'dynamicLines' | 'staticLines' | 'flaccidityRegions' | 'volumeLossRegions' | 'targetRegions', item: string) => {
    setAssessmentForm(prev => {
      const current = prev[field];
      const next = current.includes(item) ? current.filter(x => x !== item) : [...current, item];
      return { ...prev, [field]: next };
    });
  };

  // Procedimentos filtrados do catálogo para a área ativa
  const catalogForActiveArea = useMemo(() => {
    return catalog.filter(c => {
      if (!c.applicable_areas_json) return true;
      try {
        const areas = JSON.parse(c.applicable_areas_json);
        return Array.isArray(areas) ? areas.includes(activeArea) : true;
      } catch {
        return true;
      }
    });
  }, [catalog, activeArea]);

  // Cores do tema por área ativa
  const areaTheme = {
    FACIAL: {
      badge: 'bg-rose-100 text-rose-800 border-rose-200',
      activeTab: 'bg-rose-600 text-white shadow-sm',
      accentText: 'text-rose-600',
      gradient: 'from-rose-500 to-pink-600',
      shadow: 'shadow-rose-500/20',
      title: 'Estética Facial',
      mapType: 'FACE' as const
    },
    CORPORAL: {
      badge: 'bg-teal-100 text-teal-800 border-teal-200',
      activeTab: 'bg-teal-600 text-white shadow-sm',
      accentText: 'text-teal-600',
      gradient: 'from-teal-500 to-emerald-600',
      shadow: 'shadow-teal-500/20',
      title: 'Estética Corporal',
      mapType: 'BODY' as const
    },
    CAPILAR: {
      badge: 'bg-amber-100 text-amber-800 border-amber-200',
      activeTab: 'bg-amber-600 text-white shadow-sm',
      accentText: 'text-amber-600',
      gradient: 'from-amber-500 to-orange-600',
      shadow: 'shadow-amber-500/20',
      title: 'Estética Capilar',
      mapType: 'FACE' as const
    }
  }[activeArea];

  return (
    <div className="flex flex-col min-h-screen bg-slate-50" data-testid="zemda-estetic-workspace">
      <ClinicalDraftRecoveryModal isOpen={autosave.conflictModalOpen} moduleName="ZemdaEstetic"
        onClose={() => autosave.resolveConflict('local')} onSelectVersion={autosave.resolveConflict} />
      {finishAppointment && <FinishConsultationModal appointment={finishAppointment}
        clinicalData={{ moduleType: 'ZemdaEstetic', moduleData: clinicalPayload,
          clinicalEvolution: evolutionForm.biological_response, technicalNotes: assessmentForm.observations }}
        onClose={() => setFinishAppointment(null)}
        onFinished={() => { void autosave.clearDraft(); setFinishAppointment(null); onFinishConsultation?.(); }} />}
      {/* 1. CABEÇALHO PROFISSIONAL COM SELETOR DE ÁREA E AÇÕES RÁPIDAS */}
      <ProfessionalModuleHeader
        icon={Sparkles}
        iconGradient={areaTheme.gradient}
        iconShadow={areaTheme.shadow}
        title="ZemdaEstetic"
        badgeLabel={areaTheme.title}
        badgeVariant={areaTheme.badge}
        secondaryBadge={
          isDentist ? (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> HOF Integrado
            </span>
          ) : undefined
        }
        description="Avaliação estruturada por área, rastreabilidade de produtos, fotos clínicas e motor anatômico Zemda360."
      >
        <div className="flex items-center gap-2 flex-wrap">
          {selectedPatientId && <ClinicalAutosaveIndicator status={autosave.autosaveStatus} lastSavedTime={autosave.lastSavedTime} />}
          {onFinishConsultation && initialAppointmentId && (
            <button
              type="button"
              data-tour="clinical-finish"
              onClick={requestFinish}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Finalizar Atendimento</span>
            </button>
          )}
          {/* SELETOR DE ÁREA DE ATUAÇÃO (FACIAL, CORPORAL, CAPILAR) */}
          <div className="relative">
            <button
              type="button"
              data-tour="estetic-area-selector"
              onClick={() => setIsAreaDropdownOpen(!isAreaDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <span>Área: <strong>{areaTheme.title}</strong></span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </button>

            {isAreaDropdownOpen && (
              <div className="absolute right-0 mt-1 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-30 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Áreas Clínicas Disponíveis
                </div>
                {(['FACIAL', 'CORPORAL', 'CAPILAR'] as EsteticArea[]).map((area) => {
                  const isAllowed = allowedAreas.includes(area) || isSuperAdmin;
                  const label = area === 'FACIAL' ? 'Estética Facial' : area === 'CORPORAL' ? 'Estética Corporal' : 'Estética Capilar';
                  return (
                    <button
                      key={area}
                      type="button"
                      disabled={!isAllowed}
                      onClick={() => {
                        if (isAllowed) {
                          setActiveArea(area);
                          setIsAreaDropdownOpen(false);
                        }
                      }}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors ${
                        activeArea === area
                          ? 'bg-slate-100 font-extrabold text-slate-900'
                          : isAllowed
                          ? 'text-slate-700 hover:bg-slate-50 cursor-pointer'
                          : 'text-slate-300 bg-slate-50/50 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${
                          area === 'FACIAL' ? 'bg-rose-500' : area === 'CORPORAL' ? 'bg-teal-500' : 'bg-amber-500'
                        }`} />
                        <span>{label}</span>
                      </div>
                      {!isAllowed && (
                        <span className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                          <Lock className="w-3 h-3" /> Bloqueado
                        </span>
                      )}
                      {activeArea === area && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* BOTÕES DE AÇÕES RÁPIDAS */}
          {selectedPatientId && (
            <>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('assessment');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-rose-600" />
                <span>Nova Avaliação</span>
              </button>

              <button
                type="button"
                onClick={() => setIsNewPhotoModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold shadow-xs cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5 text-sky-600" />
                <span>Fotografias</span>
              </button>

              <button
                type="button"
                onClick={() => setIsNewProcedureModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer transition-colors"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>Procedimento</span>
              </button>

              <button
                type="button"
                onClick={() => setIsZemda360ModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs cursor-pointer transition-colors"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Zemda360</span>
              </button>
            </>
          )}
        </div>
      </ProfessionalModuleHeader>

      {/* 2. BARRA DE SELEÇÃO DO PACIENTE */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="w-full md:w-96" data-tour="estetic-patient-select">
            <PatientSearchSelect
              value={selectedPatientId}
              onChange={handleSelectPatient}
              placeholder="Buscar paciente para atendimento estético..."
              compact
            />
          </div>

          {selectedPatientId && overviewData?.patient && (
            <div className="flex items-center gap-2 sm:gap-4 text-xs text-slate-600 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-slate-800">{overviewData.patient.full_name}</span>
                {overviewData.patient.gender && (
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                    {overviewData.patient.gender}
                  </span>
                )}
                {overviewData.patient.birth_date && (
                  <span className="text-slate-500">
                    Nasc: {new Date(overviewData.patient.birth_date).toLocaleDateString('pt-BR')}
                  </span>
                )}
                {overviewData.patient.phone && (
                  <span className="text-slate-500 font-mono">
                    Tel: {overviewData.patient.phone}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. MENU HORIZONTAL DE ABAS CLÍNICAS */}
      {selectedPatientId ? (
        <div className="bg-white border-b border-slate-200 px-3 sm:px-6 shrink-0">
          <div {...tabScrollProps} className={`${tabScrollProps.className} max-w-7xl mx-auto flex items-center gap-1 py-2`}>
            {[
              { id: 'overview', label: 'Visão Geral', icon: Layers },
              { id: 'assessment', label: 'Avaliação Estética', icon: FileText },
              { id: 'photos', label: `Fotos (${photos.length})`, icon: Camera },
              { id: 'planning', label: `Planejamento (${plans.length})`, icon: Calendar },
              { id: 'procedures', label: `Procedimentos (${procedures.length})`, icon: Scissors },
              { id: 'zemda360', label: 'Zemda360', icon: Activity },
              { id: 'evolutions', label: `Evoluções (${evolutions.length})`, icon: CheckCircle2 },
              { id: 'returns', label: `Retornos (${returnsList.length})`, icon: Clock },
              { id: 'before_after', label: 'Antes × Depois', icon: ArrowLeftRight },
              { id: 'history', label: 'Histórico Completo', icon: RefreshCw }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-active={isActive ? 'true' : 'false'}
                  data-tour={`tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                    isActive
                      ? areaTheme.activeTab
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* 4. CONTEÚDO PRINCIPAL DO WORKSPACE */}
      <div className="flex-1 p-4 md:p-6 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          {!selectedPatientId ? (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8 bg-white rounded-3xl border border-slate-200 shadow-xs">
              <div className="w-16 h-16 rounded-3xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
                <Sparkles className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Módulo Clínico ZemdaEstetic</h2>
              <p className="text-sm text-slate-500 max-w-md mb-6">
                Selecione ou busque um paciente acima para iniciar a avaliação, planejar tratamentos, registrar procedimentos com rastreabilidade de lote e acessar o Zemda360.
              </p>
              <div className="w-full max-w-sm">
                <PatientSearchSelect
                  value={selectedPatientId}
                  onChange={handleSelectPatient}
                  placeholder="Selecione o paciente..."
                />
              </div>
            </div>
          ) : (
            <>
              {/* ABA 1: VISÃO GERAL (OVERVIEW) */}
              {activeTab === 'overview' && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  {/* Cards de Métricas */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                      <div className="text-xs font-semibold text-slate-500 mb-1">Avaliações ({activeArea})</div>
                      <div className="text-2xl font-black text-slate-800">{overviewData?.metrics?.totalAssessments || 0}</div>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                      <div className="text-xs font-semibold text-slate-500 mb-1">Planos Ativos</div>
                      <div className="text-2xl font-black text-sky-600">{overviewData?.metrics?.activePlans || 0}</div>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                      <div className="text-xs font-semibold text-slate-500 mb-1">Procedimentos Realizados</div>
                      <div className="text-2xl font-black text-emerald-600">{overviewData?.metrics?.totalProcedures || 0}</div>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                      <div className="text-xs font-semibold text-slate-500 mb-1">Fotos Documentadas</div>
                      <div className="text-2xl font-black text-rose-600">{overviewData?.metrics?.totalPhotos || 0}</div>
                    </div>
                  </div>

                  {/* 2 Colunas de Destaques Clínicos */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Coluna 1 & 2: Última Avaliação & Último Procedimento */}
                    <div className="lg:col-span-2 space-y-6">
                      {/* Última Avaliação */}
                      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-rose-600" />
                            <h3 className="text-base font-bold text-slate-800">Última Avaliação Estética</h3>
                          </div>
                          {overviewData?.lastAssessment && (
                            <span className="text-xs text-slate-500">
                              {new Date(overviewData.lastAssessment.created_at).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>

                        {overviewData?.lastAssessment ? (
                          <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                            <div>
                              <span className="text-xs font-bold text-slate-500 uppercase">Queixa Principal:</span>
                              <p className="text-sm text-slate-800 font-medium mt-0.5">
                                {overviewData.lastAssessment.complaint || 'Não especificada.'}
                              </p>
                            </div>
                            {overviewData.lastAssessment.expectations && (
                              <div>
                                <span className="text-xs font-bold text-slate-500 uppercase">Expectativa do Paciente:</span>
                                <p className="text-sm text-slate-700 mt-0.5">{overviewData.lastAssessment.expectations}</p>
                              </div>
                            )}
                            <div className="flex items-center gap-2 pt-2">
                              {overviewData.lastAssessment.phototype && (
                                <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700">
                                  Fototipo: {overviewData.lastAssessment.phototype}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => setActiveTab('assessment')}
                                className="text-xs font-bold text-rose-600 hover:text-rose-700 ml-auto cursor-pointer"
                              >
                                Ver Detalhes Completos →
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-8 text-slate-500 text-sm">
                            Nenhuma avaliação registrada ainda para este paciente nesta área.
                            <div className="mt-3">
                              <button
                                type="button"
                                onClick={() => setActiveTab('assessment')}
                                className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 transition-colors cursor-pointer"
                              >
                                Iniciar Avaliação Estética
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Último Procedimento Realizado */}
                      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <Scissors className="w-5 h-5 text-emerald-600" />
                            <h3 className="text-base font-bold text-slate-800">Último Procedimento Realizado</h3>
                          </div>
                          {overviewData?.lastProcedure && (
                            <span className="text-xs text-slate-500">
                              {new Date(overviewData.lastProcedure.date_performed).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>

                        {overviewData?.lastProcedure ? (
                          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2">
                            <div className="flex items-center justify-between">
                              <h4 className="font-bold text-slate-900 text-sm">{overviewData.lastProcedure.procedure_name}</h4>
                              <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                {overviewData.lastProcedure.quantity} {overviewData.lastProcedure.unit}
                              </span>
                            </div>
                            <div className="text-xs text-slate-600">
                              <strong>Região:</strong> {overviewData.lastProcedure.target_region || 'Geral'}
                              {overviewData.lastProcedure.product_applied && (
                                <span className="ml-3"><strong>Produto:</strong> {overviewData.lastProcedure.product_applied}</span>
                              )}
                            </div>
                            {overviewData.lastProcedure.lot_number && (
                              <div className="text-xs text-slate-500 font-mono">
                                <strong>Lote:</strong> {overviewData.lastProcedure.lot_number}
                                {overviewData.lastProcedure.expiry_date && ` • Val: ${overviewData.lastProcedure.expiry_date}`}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-6 text-slate-500 text-sm">
                            Nenhum procedimento registrado ainda.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Coluna 3: Próximo Retorno & Fotografias Recentes */}
                    <div className="space-y-6">
                      {/* Próximo Retorno */}
                      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
                        <div className="flex items-center gap-2 mb-3">
                          <Clock className="w-5 h-5 text-amber-600" />
                          <h3 className="text-base font-bold text-slate-800">Próximo Retorno</h3>
                        </div>

                        {overviewData?.nextReturn ? (
                          <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200/80 space-y-2">
                            <div className="text-xs font-bold text-amber-900">
                              Data prevista: {new Date(overviewData.nextReturn.scheduled_date).toLocaleDateString('pt-BR')}
                            </div>
                            <div className="text-xs text-slate-600">
                              Status: <span className="font-bold uppercase">{overviewData.nextReturn.status}</span>
                            </div>
                            {overviewData.nextReturn.touchup_required === 1 && (
                              <div className="text-xs text-rose-700 font-bold bg-rose-50 p-2 rounded-lg border border-rose-200">
                                Retoque previsto
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500 py-3">
                            Nenhum retorno agendado no momento.
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={() => setIsNewReturnModalOpen(true)}
                                className="text-xs font-bold text-teal-600 hover:text-teal-700 cursor-pointer"
                              >
                                + Agendar Retorno Clínico
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Fotos Recentes */}
                      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Camera className="w-5 h-5 text-sky-600" />
                            <h3 className="text-base font-bold text-slate-800">Fotos Recentes</h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveTab('photos')}
                            className="text-xs font-bold text-sky-600 hover:text-sky-700 cursor-pointer"
                          >
                            Ver Todas
                          </button>
                        </div>

                        {overviewData?.recentPhotos && overviewData.recentPhotos.length > 0 ? (
                          <div className="grid grid-cols-3 gap-2">
                            {overviewData.recentPhotos.slice(0, 6).map((ph: any) => (
                              <div
                                key={ph.id}
                                onClick={() => setLightboxPhoto(ph)}
                                className="aspect-square bg-slate-100 rounded-xl overflow-hidden relative cursor-pointer group border border-slate-200"
                              >
                                <img src={ph.photo_url} alt="Foto Clínica" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                <span className="absolute bottom-1 right-1 text-[9px] font-bold px-1 rounded bg-black/60 text-white">
                                  {ph.photo_type}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-6 text-slate-500 text-xs">
                            Nenhuma fotografia anexada.
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={() => setIsNewPhotoModalOpen(true)}
                                className="text-xs font-bold text-sky-600 hover:text-sky-700 cursor-pointer"
                              >
                                + Anexar Foto
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ABA 2: AVALIAÇÃO ESTÉTICA (ADAPTÁVEL À ÁREA ATIVA) */}
              {activeTab === 'assessment' && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs">
                    <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                          <FileText className={`w-5 h-5 ${areaTheme.accentText}`} />
                          Avaliação Clínica Estruturada • {areaTheme.title}
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">
                          Documentação profissional minuciosa adaptada para {areaTheme.title.toLowerCase()}.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {assessments.length > 0 && (
                          <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                            {assessments.length} avaliações anteriores
                          </span>
                        )}
                      </div>
                    </div>

                    <form onSubmit={handleSaveAssessment} className="space-y-6">
                      {/* Queixa Principal e Expectativa */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">
                            Queixa Principal do Paciente *
                          </label>
                          <textarea
                            rows={3}
                            value={assessmentForm.complaint}
                            onChange={e => setAssessmentForm({ ...assessmentForm, complaint: e.target.value })}
                            placeholder="Descreva detalhadamente a queixa estética apresentada pelo paciente..."
                            className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">
                            Expectativas &amp; Objetivos Almejados
                          </label>
                          <textarea
                            rows={3}
                            value={assessmentForm.expectations}
                            onChange={e => setAssessmentForm({ ...assessmentForm, expectations: e.target.value })}
                            placeholder="O que o paciente espera alcançar com os tratamentos propostos..."
                            className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* CAMPOS ESPECÍFICOS POR ÁREA */}
                      {activeArea === 'FACIAL' && (
                        <div className="space-y-6 bg-rose-50/40 p-6 rounded-2xl border border-rose-100">
                          <h3 className="text-sm font-extrabold text-rose-900 uppercase tracking-wider">
                            Parâmetros Clínicos Faciais
                          </h3>

                          {/* Fototipo e Escala de Glogau */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Fototipo de Fitzpatrick</label>
                              <select
                                value={assessmentForm.fitzpatrick}
                                onChange={e => setAssessmentForm({ ...assessmentForm, fitzpatrick: e.target.value })}
                                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
                              ><option value="">Não avaliado</option>
                                <option value="I">Fototipo I - Pele muito clara, queima sempre, nunca bronzeia</option>
                                <option value="II">Fototipo II - Pele clara, queima facilmente, bronzeia pouco</option>
                                <option value="III">Fototipo III - Pele média clara, queima moderadamente, bronzeia gradual</option>
                                <option value="IV">Fototipo IV - Pele moderadamente escura, queima pouco, bronzeia bem</option>
                                <option value="V">Fototipo V - Pele escura, raramente queima, bronzeia intensamente</option>
                                <option value="VI">Fototipo VI - Pele negra, nunca queima, totalmente pigmentada</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Grau de Fotoenvelhecimento (Glogau)</label>
                              <select
                                value={assessmentForm.glogau}
                                onChange={e => setAssessmentForm({ ...assessmentForm, glogau: e.target.value })}
                                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
                              ><option value="">Não avaliado</option>
                                <option value="I">Grau I (Leve) - Sem rugas estáticas, alterações pigmentares mínimas</option>
                                <option value="II">Grau II (Moderado) - Rugas em movimento, lentigos senis precoces</option>
                                <option value="III">Grau III (Avançado) - Rugas estáticas presentes em repouso, discromias</option>
                                <option value="IV">Grau IV (Grave) - Rugas em toda a face, atrofia cutânea generalizada</option>
                              </select>
                            </div>
                          </div>

                          {/* Rugas Dinâmicas */}
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-2">
                              Linhas Dinâmicas &amp; Expressão
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {[
                                'Fronte (Testa)',
                                'Glabela (Bravo)',
                                'Periorbicular (Pés de galinha)',
                                'Perioral (Código de barras)',
                                'Bunny Lines (Nariz)',
                                'Mentoniano (Casca de laranja)'
                              ].map(item => (
                                <label key={item} className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 text-xs font-medium cursor-pointer hover:bg-slate-50">
                                  <input
                                    type="checkbox"
                                    checked={assessmentForm.dynamicLines.includes(item)}
                                    onChange={() => toggleArrayItem('dynamicLines', item)}
                                    className="rounded text-rose-600 focus:ring-rose-500"
                                  />
                                  <span>{item}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          {/* Rugas Estáticas e Sulcos */}
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-2">
                              Linhas Estáticas, Sulcos &amp; Perda de Volume
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {[
                                'Sulco Nasogeniano (Bigode chinês)',
                                'Linhas de Marionete',
                                'Sulco Nasojugal (Olheiras)',
                                'Perda de Volume Malar',
                                'Contorno Mandibular Indefinido',
                                'Retrognatismo / Mento retraído',
                                'Ptose Labial / Perda de contorno'
                              ].map(item => (
                                <label key={item} className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 text-xs font-medium cursor-pointer hover:bg-slate-50">
                                  <input
                                    type="checkbox"
                                    checked={assessmentForm.staticLines.includes(item)}
                                    onChange={() => toggleArrayItem('staticLines', item)}
                                    className="rounded text-rose-600 focus:ring-rose-500"
                                  />
                                  <span>{item}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {activeArea === 'CORPORAL' && (
                        <div className="space-y-6 bg-teal-50/40 p-6 rounded-2xl border border-teal-100">
                          <h3 className="text-sm font-extrabold text-teal-900 uppercase tracking-wider">
                            Parâmetros Clínicos Corporais
                          </h3>

                          {/* Regiões Alvo */}
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-2">
                              Regiões Anatômicas Alvo
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {['Abdômen Superior', 'Abdômen Inferior', 'Flancos', 'Glúteos', 'Culotes', 'Coxas Face Interna', 'Coxas Face Posterior', 'Braços / Tríceps', 'Costas / Subescapular'].map(reg => (
                                <label key={reg} className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 text-xs font-medium cursor-pointer hover:bg-slate-50">
                                  <input
                                    type="checkbox"
                                    checked={assessmentForm.targetRegions.includes(reg)}
                                    onChange={() => toggleArrayItem('targetRegions', reg)}
                                    className="rounded text-teal-600 focus:ring-teal-500"
                                  />
                                  <span>{reg}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          {/* Tipo de Alteração e Celulite */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Alteração Predominante</label>
                              <select
                                value={assessmentForm.bodyAlterationType}
                                onChange={e => setAssessmentForm({ ...assessmentForm, bodyAlterationType: e.target.value })}
                                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
                              ><option value="">Não avaliado</option>
                                <option value="GORDURA_LOCALIZADA">Gordura Localizada</option>
                                <option value="FLACIDEZ_TISSULAR">Flacidez Tissular (Cutânea)</option>
                                <option value="FLACIDEZ_MUSCULAR">Flacidez Muscular</option>
                                <option value="GORDURA_E_FLACIDEZ">Gordura Localizada + Flacidez</option>
                                <option value="FIBROEDEMA_GELOIDE">Celulite / FEG Predominante</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Grau de Celulite (FEG)</label>
                              <select
                                value={assessmentForm.celluliteGrade}
                                onChange={e => setAssessmentForm({ ...assessmentForm, celluliteGrade: e.target.value })}
                                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
                              ><option value="">Não avaliado</option>
                                <option value="GRAU_0">Grau 0 - Ausente</option>
                                <option value="GRAU_I">Grau I - Visível apenas à compressão</option>
                                <option value="GRAU_II">Grau II - Visível em pé, sem palpação</option>
                                <option value="GRAU_III">Grau III - Pele tipo casca de laranja constante</option>
                                <option value="GRAU_IV">Grau IV - Nódulos fibróticos dolorosos e depressões</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Estrias</label>
                              <select
                                value={assessmentForm.stretchMarks}
                                onChange={e => setAssessmentForm({ ...assessmentForm, stretchMarks: e.target.value })}
                                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
                              ><option value="">Não avaliado</option>
                                <option value="NENHUMA">Ausentes</option>
                                <option value="RUBRAS">Rubras (Recentes / Inflamatórias)</option>
                                <option value="ALBAS">Albas (Antigas / Atróficas)</option>
                                <option value="MISTAS">Mistas (Rubras e Albas)</option>
                              </select>
                            </div>
                          </div>

                          {/* Medidas e Circunferências (cm) */}
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-2">
                              Medidas e Circunferências Básicas (cm)
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-slate-200">
                              <div>
                                <span className="text-[11px] text-slate-500 font-bold block mb-1">Cintura</span>
                                <input
                                  type="text"
                                  placeholder="cm"
                                  value={assessmentForm.circumferences.cintura}
                                  onChange={e => setAssessmentForm({
                                    ...assessmentForm,
                                    circumferences: { ...assessmentForm.circumferences, cintura: e.target.value }
                                  })}
                                  className="w-full text-xs p-2 rounded-lg border border-slate-200"
                                />
                              </div>
                              <div>
                                <span className="text-[11px] text-slate-500 font-bold block mb-1">Abdômen</span>
                                <input
                                  type="text"
                                  placeholder="cm"
                                  value={assessmentForm.circumferences.abdomen}
                                  onChange={e => setAssessmentForm({
                                    ...assessmentForm,
                                    circumferences: { ...assessmentForm.circumferences, abdomen: e.target.value }
                                  })}
                                  className="w-full text-xs p-2 rounded-lg border border-slate-200"
                                />
                              </div>
                              <div>
                                <span className="text-[11px] text-slate-500 font-bold block mb-1">Quadril</span>
                                <input
                                  type="text"
                                  placeholder="cm"
                                  value={assessmentForm.circumferences.quadril}
                                  onChange={e => setAssessmentForm({
                                    ...assessmentForm,
                                    circumferences: { ...assessmentForm.circumferences, quadril: e.target.value }
                                  })}
                                  className="w-full text-xs p-2 rounded-lg border border-slate-200"
                                />
                              </div>
                              <div>
                                <span className="text-[11px] text-slate-500 font-bold block mb-1">Coxa Dir / Esq</span>
                                <div className="flex gap-1">
                                  <input
                                    type="text"
                                    placeholder="D"
                                    value={assessmentForm.circumferences.coxaDir}
                                    onChange={e => setAssessmentForm({
                                      ...assessmentForm,
                                      circumferences: { ...assessmentForm.circumferences, coxaDir: e.target.value }
                                    })}
                                    className="w-1/2 text-xs p-2 rounded-lg border border-slate-200"
                                  />
                                  <input
                                    type="text"
                                    placeholder="E"
                                    value={assessmentForm.circumferences.coxaEsq}
                                    onChange={e => setAssessmentForm({
                                      ...assessmentForm,
                                      circumferences: { ...assessmentForm.circumferences, coxaEsq: e.target.value }
                                    })}
                                    className="w-1/2 text-xs p-2 rounded-lg border border-slate-200"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {activeArea === 'CAPILAR' && (
                        <div className="space-y-6 bg-amber-50/40 p-6 rounded-2xl border border-amber-100">
                          <h3 className="text-sm font-extrabold text-amber-900 uppercase tracking-wider">
                            Parâmetros Clínicos Capilares
                          </h3>

                          {/* Padrão e Classificação */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Padrão de Queda</label>
                              <select
                                value={assessmentForm.hairLossPattern}
                                onChange={e => setAssessmentForm({ ...assessmentForm, hairLossPattern: e.target.value })}
                                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
                              ><option value="">Não avaliado</option>
                                <option value="DIFUSA">Difusa (Eflúvio Telógeno)</option>
                                <option value="ANDROGENETICA_MASCULINA">Androgenética Masculina (Frontal/Vértex)</option>
                                <option value="ANDROGENETICA_FEMININA">Androgenética Feminina (Linha Média)</option>
                                <option value="AREATA">Em Placas (Alopecia Areata)</option>
                                <option value="CICATRICIAL">Cicatricial / Inflamatória</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Escala Norwood / Ludwig</label>
                              <select
                                value={assessmentForm.hairLossScale}
                                onChange={e => setAssessmentForm({ ...assessmentForm, hairLossScale: e.target.value })}
                                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
                              ><option value="">Não avaliado</option>
                                <option value="NORWOOD_I">Norwood I - Linha anterior preservada</option>
                                <option value="NORWOOD_II">Norwood II - Recesso frontotemporal leve</option>
                                <option value="NORWOOD_III">Norwood III - Entradas profundas e/ou vértex</option>
                                <option value="NORWOOD_IV">Norwood IV - Rarefação acentuada frontal e vértex</option>
                                <option value="LUDWIG_I">Ludwig I (Feminino) - Rarefação leve na coroa</option>
                                <option value="LUDWIG_II">Ludwig II (Feminino) - Rarefação moderada</option>
                                <option value="LUDWIG_III">Ludwig III (Feminino) - Rarefação severa</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Teste de Tração (Pull Test)</label>
                              <select
                                value={assessmentForm.pullTest}
                                onChange={e => setAssessmentForm({ ...assessmentForm, pullTest: e.target.value })}
                                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
                              ><option value="">Não avaliado</option>
                                <option value="NEGATIVO">Negativo (Fisiológico &lt; 3 fios)</option>
                                <option value="POSITIVO_LEVE">Positivo Leve (3 a 5 fios)</option>
                                <option value="POSITIVO_ACENTUADO">Positivo Acentuado (&gt; 5 fios anágenos/telógenos)</option>
                              </select>
                            </div>
                          </div>

                          {/* Couro Cabeludo e Fibras */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-slate-200">
                            <div>
                              <span className="text-[11px] text-slate-500 font-bold block mb-1">Oleosidade</span>
                              <select
                                value={assessmentForm.scalpCondition.oiliness}
                                onChange={e => setAssessmentForm({
                                  ...assessmentForm,
                                  scalpCondition: { ...assessmentForm.scalpCondition, oiliness: e.target.value }
                                })}
                                className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white"
                              ><option value="">Não avaliado</option>
                                <option value="NORMAL">Normal</option>
                                <option value="AUMENTADA">Seborréia Leve/Mod</option>
                                <option value="EXCESSIVA">Seborréia Intensa</option>
                                <option value="REDUZIDA">Couro Seco</option>
                              </select>
                            </div>
                            <div>
                              <span className="text-[11px] text-slate-500 font-bold block mb-1">Descamação / Caspa</span>
                              <select
                                value={assessmentForm.scalpCondition.flaking}
                                onChange={e => setAssessmentForm({
                                  ...assessmentForm,
                                  scalpCondition: { ...assessmentForm.scalpCondition, flaking: e.target.value }
                                })}
                                className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white"
                              ><option value="">Não avaliado</option>
                                <option value="AUSENTE">Ausente</option>
                                <option value="FINA_SECA">Pitiríase Seca</option>
                                <option value="ADERENTE">Dermatite Seborreica</option>
                              </select>
                            </div>
                            <div>
                              <span className="text-[11px] text-slate-500 font-bold block mb-1">Miniaturização</span>
                              <select
                                value={assessmentForm.fiberDensity}
                                onChange={e => setAssessmentForm({ ...assessmentForm, fiberDensity: e.target.value })}
                                className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white"
                              ><option value="">Não avaliado</option>
                                <option value="AUSENTE">Fios com calibre uniforme</option>
                                <option value="MODERADA">Miniaturização moderada (&gt;20%)</option>
                                <option value="SEVERA">Miniaturização acentuada (&gt;50%)</option>
                              </select>
                            </div>
                            <div>
                              <span className="text-[11px] text-slate-500 font-bold block mb-1">Histórico Familiar</span>
                              <input
                                type="text"
                                placeholder="Pai, Mãe, Avós..."
                                value={assessmentForm.familyHistory}
                                onChange={e => setAssessmentForm({ ...assessmentForm, familyHistory: e.target.value })}
                                className="w-full text-xs p-2 rounded-lg border border-slate-200"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Histórico, Alergias e Conduta */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">
                            Histórico Estético &amp; Procedimentos Prévios
                          </label>
                          <textarea
                            rows={3}
                            value={assessmentForm.previousTreatments}
                            onChange={e => setAssessmentForm({ ...assessmentForm, previousTreatments: e.target.value })}
                            placeholder="Toxina, preenchimentos, bioestimuladores, fios, cirurgias prévias ou reações anteriores..."
                            className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">
                            Alergias, Medicações &amp; Contraindicações
                          </label>
                          <textarea
                            rows={3}
                            value={assessmentForm.allergies}
                            onChange={e => setAssessmentForm({ ...assessmentForm, allergies: e.target.value })}
                            placeholder="Alergia a anestésicos, colágeno, anticoagulantes, gestação, lactação, doenças autoimunes..."
                            className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">
                          Conduta Profissional &amp; Recomendações
                        </label>
                        <textarea
                          rows={3}
                          value={assessmentForm.clinicalConduct}
                          onChange={e => setAssessmentForm({ ...assessmentForm, clinicalConduct: e.target.value })}
                          placeholder="Conduta clínica planejada, protocolo de preparo prévio, orientações domiciliares..."
                          className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                        />
                      </div>

                      {/* Botão de Salvar Avaliação */}
                      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                        <div className="text-xs text-slate-500 flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-emerald-600" />
                          <span>Registro clínico de responsabilidade profissional estrita.</span>
                        </div>
                        <button
                          type="submit"
                          disabled={isSavingAssessment}
                          className={`px-6 py-2.5 rounded-xl text-white text-xs font-bold shadow-md cursor-pointer transition-colors flex items-center gap-2 ${
                            activeArea === 'FACIAL'
                              ? 'bg-rose-600 hover:bg-rose-700'
                              : activeArea === 'CORPORAL'
                              ? 'bg-teal-600 hover:bg-teal-700'
                              : 'bg-amber-600 hover:bg-amber-700'
                          }`}
                        >
                          <Save className="w-4 h-4" />
                          <span>{isSavingAssessment ? 'Salvando...' : 'Salvar Avaliação'}</span>
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Lista de Avaliações Anteriores */}
                  {assessments.length > 0 && (
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
                      <h3 className="text-sm font-bold text-slate-900 mb-4">
                        Histórico de Avaliações do Paciente ({activeArea})
                      </h3>
                      <div className="space-y-3">
                        {assessments.map(ass => (
                          <div
                            key={ass.id}
                            className="p-4 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-between"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-800">
                                  {new Date(ass.created_at).toLocaleDateString('pt-BR')}
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${areaTheme.badge}`}>
                                  {ass.area}
                                </span>
                                {ass.phototype && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600">
                                    Fototipo {ass.phototype}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-600 mt-1 line-clamp-1">
                                <strong>Queixa:</strong> {ass.complaint}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedAssessmentDetail(ass)}
                              className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 cursor-pointer"
                            >
                              Ver Ficha
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ABA 3: FOTOGRAFIAS CLÍNICAS */}
              {activeTab === 'photos' && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                          <Camera className="w-5 h-5 text-sky-600" />
                          Documentação Fotográfica Clínica
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">
                          Galeria padronizada por paciente, área e ângulo anatômico para acompanhamento visual.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveTab('before_after')}
                          className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                          <span>Antes × Depois</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsNewPhotoModalOpen(true)}
                          className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 text-white hover:bg-sky-700 shadow-md transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Anexar Nova Foto</span>
                        </button>
                      </div>
                    </div>

                    {photos.length === 0 ? (
                      <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <Camera className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-slate-600">Nenhuma fotografia anexada ainda.</p>
                        <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                          Adicione fotos em ângulos padronizados (Frontal, Perfil D/E, 45°) para documentar a evolução estética.
                        </p>
                        <button
                          type="button"
                          onClick={() => setIsNewPhotoModalOpen(true)}
                          className="mt-4 px-4 py-2 bg-sky-600 text-white text-xs font-bold rounded-xl hover:bg-sky-700 cursor-pointer"
                        >
                          + Anexar Primeira Foto
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {photos.map(ph => (
                          <div
                            key={ph.id}
                            className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden flex flex-col group hover:shadow-md transition-all"
                          >
                            <div
                              onClick={() => setLightboxPhoto(ph)}
                              className="aspect-square bg-slate-200 relative cursor-pointer overflow-hidden"
                            >
                              <img
                                src={ph.photo_url}
                                alt={ph.view_angle}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              />
                              <span className={`absolute top-2 left-2 text-[10px] font-extrabold px-2 py-0.5 rounded-md shadow-xs ${
                                ph.photo_type === 'ANTES'
                                  ? 'bg-amber-500 text-white'
                                  : ph.photo_type === 'DEPOIS'
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-sky-600 text-white'
                              }`}>
                                {ph.photo_type}
                              </span>
                              <span className="absolute bottom-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/70 text-white">
                                {ph.view_angle}
                              </span>
                            </div>
                            <div className="p-3 text-xs flex-1 flex flex-col justify-between">
                              <div>
                                <div className="text-[11px] text-slate-400 font-mono">
                                  {new Date(ph.taken_at).toLocaleDateString('pt-BR')}
                                </div>
                                {ph.notes && <p className="text-slate-600 text-xs mt-1 line-clamp-2">{ph.notes}</p>}
                              </div>
                              <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase text-slate-500">{ph.area}</span>
                                <button
                                  type="button"
                                  onClick={() => setLightboxPhoto(ph)}
                                  className="text-[11px] font-bold text-sky-600 hover:text-sky-700 cursor-pointer"
                                >
                                  Ampliar
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ABA 4: PLANEJAMENTO (TREATMENT PLANNING) */}
              {activeTab === 'planning' && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                          <Calendar className="w-5 h-5 text-sky-600" />
                          Planos de Tratamento Estético
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">
                          Cronograma de procedimentos, sessões estimadas e intervalos recomendados.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsNewPlanModalOpen(true)}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 text-white hover:bg-sky-700 shadow-md transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Criar Novo Plano</span>
                      </button>
                    </div>

                    {plans.length === 0 ? (
                      <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <Calendar className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-slate-600">Nenhum plano de tratamento cadastrado.</p>
                        <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                          Organize os procedimentos recomendados, sessões e intervalos em um planejamento estruturado.
                        </p>
                        <button
                          type="button"
                          onClick={() => setIsNewPlanModalOpen(true)}
                          className="mt-4 px-4 py-2 bg-sky-600 text-white text-xs font-bold rounded-xl hover:bg-sky-700 cursor-pointer"
                        >
                          + Criar Primeiro Plano
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {plans.map(plan => {
                          const items = plan.items || [];
                          const completedCount = items.filter((i: any) => i.status === 'REALIZADO').length;
                          const progress = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

                          return (
                            <div key={plan.id} className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-slate-900 text-base">{plan.title}</h3>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${areaTheme.badge}`}>
                                      {plan.area}
                                    </span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                      plan.status === 'CONCLUIDO'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-sky-100 text-sky-800'
                                    }`}>
                                      {plan.status}
                                    </span>
                                  </div>
                                  {plan.objectives && (
                                    <p className="text-xs text-slate-600 mt-1">{plan.objectives}</p>
                                  )}
                                </div>
                                <div className="text-xs font-bold text-slate-600 flex items-center gap-2">
                                  <span>Progresso: {completedCount}/{items.length} ({progress}%)</span>
                                </div>
                              </div>

                              {/* Barra de Progresso */}
                              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mb-4">
                                <div
                                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>

                              {/* Tabela de Itens do Plano */}
                              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                <div className="divide-y divide-slate-100">
                                  {items.map((item: any) => (
                                    <div key={item.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <span className="font-bold text-slate-800">{item.procedure_name}</span>
                                          {item.target_region && (
                                            <span className="text-slate-500 font-medium">({item.target_region})</span>
                                          )}
                                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                            item.priority === 'ALTA'
                                              ? 'bg-rose-100 text-rose-700'
                                              : 'bg-slate-100 text-slate-600'
                                          }`}>
                                            Prioridade {item.priority}
                                          </span>
                                        </div>
                                        <div className="text-[11px] text-slate-500 mt-0.5">
                                          Sessões: <strong>{item.sessions_completed || 0}/{item.sessions_planned}</strong>
                                          {item.recommended_interval_days && ` • Intervalo: ${item.recommended_interval_days} dias`}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        {/* Status seletor rápido */}
                                        <select
                                          value={item.status}
                                          onChange={e => handleUpdatePlanItemStatus(plan.id, item.id, e.target.value)}
                                          className={`text-xs font-bold px-2.5 py-1 rounded-lg border cursor-pointer ${
                                            item.status === 'REALIZADO'
                                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                              : item.status === 'EM_ANDAMENTO'
                                              ? 'bg-sky-50 text-sky-700 border-sky-200'
                                              : 'bg-amber-50 text-amber-700 border-amber-200'
                                          }`}
                                        ><option value="">Selecione / não avaliado</option>
                                          <option value="PLANEJADO">Planejado</option>
                                          <option value="EM_ANDAMENTO">Em Andamento</option>
                                          <option value="REALIZADO">Realizado</option>
                                          <option value="CANCELADO">Cancelado</option>
                                        </select>

                                        {item.status !== 'REALIZADO' && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setProcedureForm(prev => ({
                                                ...prev,
                                                procedure_name: item.procedure_name,
                                                target_region: item.target_region || '',
                                                area: plan.area,
                                                plan_item_id: item.id
                                              }));
                                              setIsNewProcedureModalOpen(true);
                                            }}
                                            className="px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                                          >
                                            Registrar Execução
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ABA 5: PROCEDIMENTOS CLÍNICOS REALIZADOS */}
              {activeTab === 'procedures' && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                          <Scissors className="w-5 h-5 text-emerald-600" />
                          Procedimentos Clínicos Realizados
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">
                          Registro rastreável com lote, validade, substância aplicada e baixa de estoque.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsNewProcedureModalOpen(true)}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-md transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Registrar Novo Procedimento</span>
                      </button>
                    </div>

                    {procedures.length === 0 ? (
                      <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <Scissors className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-slate-600">Nenhum procedimento registrado ainda.</p>
                        <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                          Registre aplicações de toxina, preenchedores, bioestimuladores, peelings ou mesoterapia com controle de lote.
                        </p>
                        <button
                          type="button"
                          onClick={() => setIsNewProcedureModalOpen(true)}
                          className="mt-4 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 cursor-pointer"
                        >
                          + Registrar Procedimento
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {procedures.map(proc => (
                          <div
                            key={proc.id}
                            className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-extrabold text-slate-900 text-sm">{proc.procedure_name}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${areaTheme.badge}`}>
                                  {proc.area}
                                </span>
                                {proc.target_region && (
                                  <span className="text-xs font-semibold text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                                    {proc.target_region}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-600 flex items-center gap-3 flex-wrap">
                                <span>Data: <strong>{new Date(proc.date_performed).toLocaleDateString('pt-BR')}</strong></span>
                                {proc.product_applied && (
                                  <span>Produto: <strong>{proc.product_applied}</strong></span>
                                )}
                                <span>Dose: <strong>{proc.quantity} {proc.unit}</strong></span>
                              </div>
                              {(proc.lot_number || proc.expiry_date) && (
                                <div className="text-xs text-slate-500 font-mono flex items-center gap-3">
                                  {proc.lot_number && <span>Lote: <strong>{proc.lot_number}</strong></span>}
                                  {proc.expiry_date && <span>Validade: <strong>{proc.expiry_date}</strong></span>}
                                </div>
                              )}
                              {proc.post_instructions && (
                                <p className="text-[11px] text-slate-500 mt-1 italic">
                                  Orientações: {proc.post_instructions}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setReturnForm(prev => ({
                                    ...prev,
                                    procedure_id: proc.id,
                                    area: proc.area
                                  }));
                                  setIsNewReturnModalOpen(true);
                                }}
                                className="px-3 py-1.5 text-xs font-bold text-teal-700 bg-white hover:bg-teal-50 border border-slate-200 rounded-xl transition-colors cursor-pointer"
                              >
                                Agendar Retorno
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ABA 6: ZEMDA360 (MAPEAMENTO ANATÔMICO INTEGRADO) */}
              {activeTab === 'zemda360' && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                          <Activity className="w-5 h-5 text-teal-600" />
                          Zemda360 • Mapeamento Anatômico ({areaTheme.title})
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">
                          Motor anatômico integrado: marcações de pontos, desenho em camadas e registro vetorial direto.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsZemda360ModalOpen(true)}
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Maximize2 className="w-4 h-4" />
                        <span>Abrir em Tela Cheia</span>
                      </button>
                    </div>

                    {/* Canvas do Zemda360 embutido */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                      <ZemdaBodyWorkspace
                        key={`${selectedPatientId}:${activeArea}`}
                        patientId={selectedPatientId}
                        initialMapType={areaTheme.mapType}
                        module="estetic"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ABA 7: EVOLUÇÕES CLÍNICAS */}
              {activeTab === 'evolutions' && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-sky-600" />
                          Evoluções Clínicas do Tratamento
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">
                          Registro de resposta tecidual, acomodação de produtos, queixas e orientações adotadas.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsNewEvolutionModalOpen(true)}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 text-white hover:bg-sky-700 shadow-md transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Nova Evolução</span>
                      </button>
                    </div>

                    {evolutions.length === 0 ? (
                      <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <CheckCircle2 className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-slate-600">Nenhuma evolução registrada.</p>
                        <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                          Documente a resposta biológica, resolução de edema e satisfação do paciente entre as sessões.
                        </p>
                        <button
                          type="button"
                          onClick={() => setIsNewEvolutionModalOpen(true)}
                          className="mt-4 px-4 py-2 bg-sky-600 text-white text-xs font-bold rounded-xl hover:bg-sky-700 cursor-pointer"
                        >
                          + Registrar Primeira Evolução
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {evolutions.map(ev => (
                          <div key={ev.id} className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 text-sm">
                                  {new Date(ev.evolution_date).toLocaleDateString('pt-BR')}
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${areaTheme.badge}`}>
                                  {ev.area}
                                </span>
                              </div>
                              <span className="text-xs text-slate-500 font-medium">
                                Profissional: {ev.professional_name || 'Profissional da Clínica'}
                              </span>
                            </div>

                            {ev.biological_response && (
                              <div>
                                <span className="text-xs font-bold text-slate-500 uppercase">Resposta Biológica / Tecidual:</span>
                                <p className="text-xs text-slate-800 mt-0.5 font-medium">{ev.biological_response}</p>
                              </div>
                            )}

                            {ev.patient_feedback && (
                              <div>
                                <span className="text-xs font-bold text-slate-500 uppercase">Relato do Paciente:</span>
                                <p className="text-xs text-slate-700 mt-0.5">{ev.patient_feedback}</p>
                              </div>
                            )}

                            {ev.conduct && (
                              <div>
                                <span className="text-xs font-bold text-slate-500 uppercase">Conduta Profissional Adotada:</span>
                                <p className="text-xs text-slate-700 mt-0.5">{ev.conduct}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ABA 8: RETORNOS CLÍNICOS */}
              {activeTab === 'returns' && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                          <Clock className="w-5 h-5 text-amber-600" />
                          Acompanhamento de Retornos &amp; Retoques
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">
                          Controle de retornos pós-procedimento (15, 30 ou 60 dias) e necessidade de retoques.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsNewReturnModalOpen(true)}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 shadow-md transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Agendar Retorno</span>
                      </button>
                    </div>

                    {returnsList.length === 0 ? (
                      <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <Clock className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-slate-600">Nenhum retorno agendado ou registrado.</p>
                        <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                          Agende o retorno de 15 dias para reavaliação de toxina ou acompanhamento pós-bioestimulador.
                        </p>
                        <button
                          type="button"
                          onClick={() => setIsNewReturnModalOpen(true)}
                          className="mt-4 px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-xl hover:bg-amber-700 cursor-pointer"
                        >
                          + Agendar Retorno
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {returnsList.map(ret => (
                          <div
                            key={ret.id}
                            className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900">
                                  Previsto: {new Date(ret.scheduled_date).toLocaleDateString('pt-BR')}
                                </span>
                                {ret.actual_date && (
                                  <span className="text-slate-500">
                                    (Realizado: {new Date(ret.actual_date).toLocaleDateString('pt-BR')})
                                  </span>
                                )}
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${areaTheme.badge}`}>
                                  {ret.area}
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  ret.status === 'COMPARECEU'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : ret.status === 'RETOQUE_REALIZADO'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {ret.status}
                                </span>
                              </div>
                              {ret.evaluation_notes && (
                                <p className="text-slate-700 mt-1">{ret.evaluation_notes}</p>
                              )}
                              {ret.touchup_required === 1 && (
                                <div className="text-rose-700 font-bold bg-rose-50 p-2 rounded-lg border border-rose-200 mt-1">
                                  Retoque realizado / necessário: {ret.touchup_description || 'Detalhes do retoque'}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {ret.status === 'AGENDADO' && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await ApiClient.patch(`/v1/estetic/returns/${ret.id}`, {
                                        status: 'COMPARECEU',
                                        actual_date: new Date().toISOString().slice(0, 10)
                                      });
                                      showToast('Presença confirmada!', 'success');
                                      loadPatientData(selectedPatientId, activeArea);
                                    } catch (err: any) {
                                      showToast(err.message, 'error');
                                    }
                                  }}
                                  className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl cursor-pointer"
                                >
                                  Confirmar Comparecimento
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ABA 9: ANTES × DEPOIS (COMPARADOR VISUAL) */}
              {activeTab === 'before_after' && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                          <ArrowLeftRight className="w-5 h-5 text-indigo-600" />
                          Comparador Visual • Antes × Depois
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">
                          Comparação lado a lado com pareamento automático pelo mesmo ângulo de vista e área.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsNewPhotoModalOpen(true)}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-md transition-colors cursor-pointer"
                      >
                        + Anexar Fotos
                      </button>
                    </div>

                    {beforeAfterPairs.length === 0 ? (
                      <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <ArrowLeftRight className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-slate-600">Nenhum par Antes × Depois identificado.</p>
                        <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                          Anexe pelo menos uma foto com tipo <strong>ANTES</strong> e outra com tipo <strong>DEPOIS</strong> sob o mesmo ângulo de vista (ex: Frontal) para visualizar a comparação.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-8">
                        {beforeAfterPairs.map((pair, idx) => (
                          <div key={idx} className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-slate-900 text-sm">
                                  Ângulo: {pair.view_angle}
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${areaTheme.badge}`}>
                                  {pair.area}
                                </span>
                              </div>
                              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                                Pareamento Clínico
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {/* Foto ANTES */}
                              <div className="bg-white p-3 rounded-2xl border border-slate-200 space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-extrabold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200 uppercase">
                                    Antes
                                  </span>
                                  <span className="text-slate-400 font-mono text-[11px]">
                                    {new Date(pair.before.taken_at).toLocaleDateString('pt-BR')}
                                  </span>
                                </div>
                                <div
                                  onClick={() => setLightboxPhoto(pair.before)}
                                  className="aspect-square bg-slate-100 rounded-xl overflow-hidden cursor-pointer"
                                >
                                  <img
                                    src={pair.before.photo_url}
                                    alt="Foto Antes"
                                    className="w-full h-full object-cover hover:scale-105 transition-transform"
                                  />
                                </div>
                                {pair.before.notes && (
                                  <p className="text-[11px] text-slate-500 italic line-clamp-1">{pair.before.notes}</p>
                                )}
                              </div>

                              {/* Foto DEPOIS */}
                              <div className="bg-white p-3 rounded-2xl border border-slate-200 space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200 uppercase">
                                    Depois
                                  </span>
                                  <span className="text-slate-400 font-mono text-[11px]">
                                    {new Date(pair.after.taken_at).toLocaleDateString('pt-BR')}
                                  </span>
                                </div>
                                <div
                                  onClick={() => setLightboxPhoto(pair.after)}
                                  className="aspect-square bg-slate-100 rounded-xl overflow-hidden cursor-pointer"
                                >
                                  <img
                                    src={pair.after.photo_url}
                                    alt="Foto Depois"
                                    className="w-full h-full object-cover hover:scale-105 transition-transform"
                                  />
                                </div>
                                {pair.after.notes && (
                                  <p className="text-[11px] text-slate-500 italic line-clamp-1">{pair.after.notes}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ABA 10: HISTÓRICO LONGITUDINAL (TIMELINE) */}
              {activeTab === 'history' && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                          <RefreshCw className="w-5 h-5 text-slate-700" />
                          Linha do Tempo Longitudinal
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">
                          Histórico consolidado cronológico de todos os atos clínicos estéticos.
                        </p>
                      </div>
                    </div>

                    {timeline.length === 0 ? (
                      <div className="text-center py-12 text-slate-500 text-sm">
                        Nenhum registro encontrado no histórico.
                      </div>
                    ) : (
                      <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                        {timeline.map((event, idx) => (
                          <div key={idx} className="relative flex items-start gap-4">
                            <div className="absolute -left-6 top-1.5 w-5 h-5 rounded-full bg-white border-2 border-slate-400 flex items-center justify-center">
                              <span className="w-2 h-2 rounded-full bg-slate-600" />
                            </div>
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 w-full space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-extrabold uppercase text-slate-700">
                                  {event.event_type.replace('_', ' ')}
                                </span>
                                <span className="text-slate-400 font-mono">
                                  {new Date(event.event_date).toLocaleDateString('pt-BR')}
                                </span>
                              </div>
                              <h4 className="text-sm font-bold text-slate-900">{event.title}</h4>
                              {event.description && (
                                <p className="text-xs text-slate-600">{event.description}</p>
                              )}
                              {event.badge && (
                                <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 mt-1">
                                  {event.badge}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 5. MODAIS DE AÇÕES */}

      {/* Modal: Novo Plano de Tratamento */}
      {isNewPlanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-base">Novo Plano de Tratamento Estético</h3>
              <button onClick={() => setIsNewPlanModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Título do Planejamento *</label>
                <input
                  type="text"
                  value={planForm.title}
                  onChange={e => setPlanForm({ ...planForm, title: e.target.value })}
                  placeholder="Ex: Protocolo de Harmonização Facial 2026"
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Objetivos Clínicos</label>
                <textarea
                  rows={2}
                  value={planForm.objectives}
                  onChange={e => setPlanForm({ ...planForm, objectives: e.target.value })}
                  placeholder="Defina os objetivos principais deste tratamento..."
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
              </div>

              {/* Itens do Plano */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700">Procedimentos Recomendados</label>
                  <button
                    type="button"
                    onClick={() => setPlanForm({
                      ...planForm,
                      items: [...planForm.items, { procedure_name: '', target_region: '', sessions_planned: '' as number | '', recommended_interval_days: '' as number | '', priority: '' }]
                    })}
                    className="text-sky-600 font-bold hover:text-sky-700"
                  >
                    + Adicionar Procedimento
                  </button>
                </div>

                {planForm.items.map((it, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="font-semibold text-slate-600 block mb-1">Procedimento</span>
                        <input
                          type="text"
                          value={it.procedure_name}
                          onChange={e => {
                            const next = [...planForm.items];
                            next[idx].procedure_name = e.target.value;
                            setPlanForm({ ...planForm, items: next });
                          }}
                          placeholder="Ex: Toxina Botulínica"
                          className="w-full p-2 rounded-lg border border-slate-200 bg-white"
                          required
                        />
                      </div>
                      <div>
                        <span className="font-semibold text-slate-600 block mb-1">Região Anatômica</span>
                        <input
                          type="text"
                          value={it.target_region}
                          onChange={e => {
                            const next = [...planForm.items];
                            next[idx].target_region = e.target.value;
                            setPlanForm({ ...planForm, items: next });
                          }}
                          placeholder="Ex: Terço Superior"
                          className="w-full p-2 rounded-lg border border-slate-200 bg-white"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold block mb-1">Sessões</span>
                        <input
                          type="number"
                          min="1"
                          value={it.sessions_planned}
                          onChange={e => {
                            const next = [...planForm.items];
                            next[idx].sessions_planned = e.target.value === '' ? '' : Number(e.target.value);
                            setPlanForm({ ...planForm, items: next });
                          }}
                          className="w-full p-2 rounded-lg border border-slate-200 bg-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold block mb-1">Intervalo (dias)</span>
                        <input
                          type="number"
                          min="1"
                          value={it.recommended_interval_days}
                          onChange={e => {
                            const next = [...planForm.items];
                            next[idx].recommended_interval_days = e.target.value === '' ? '' : Number(e.target.value);
                            setPlanForm({ ...planForm, items: next });
                          }}
                          className="w-full p-2 rounded-lg border border-slate-200 bg-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold block mb-1">Prioridade</span>
                        <select
                          value={it.priority}
                          onChange={e => {
                            const next = [...planForm.items];
                            next[idx].priority = e.target.value;
                            setPlanForm({ ...planForm, items: next });
                          }}
                          className="w-full p-2 rounded-lg border border-slate-200 bg-white"
                        ><option value="">Não avaliado</option>
                          <option value="ALTA">Alta</option>
                          <option value="MEDIA">Média</option>
                          <option value="BAIXA">Baixa</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsNewPlanModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 bg-slate-100 hover:bg-slate-200 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-sky-600 text-white font-bold hover:bg-sky-700 shadow-md"
                >
                  Salvar Planejamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Registrar Procedimento Realizado */}
      {isNewProcedureModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-base">Registrar Procedimento Estético Realizado</h3>
              <button onClick={() => setIsNewProcedureModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProcedure} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Procedimento *</label>
                  <input
                    type="text"
                    value={procedureForm.procedure_name}
                    onChange={e => setProcedureForm({ ...procedureForm, procedure_name: e.target.value })}
                    placeholder="Ex: Toxina Botulínica, Preenchimento Malar..."
                    className="w-full p-2.5 rounded-xl border border-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Região Anatômica *</label>
                  <input
                    type="text"
                    value={procedureForm.target_region}
                    onChange={e => setProcedureForm({ ...procedureForm, target_region: e.target.value })}
                    placeholder="Ex: Fronte e Glabela, Malar D/E..."
                    className="w-full p-2.5 rounded-xl border border-slate-200"
                    required
                  />
                </div>
              </div>

              {/* Rastreabilidade de Produto e Lote */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                  Rastreabilidade &amp; Controle de Insumos
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">Produto / Substância</label>
                    <input
                      type="text"
                      value={procedureForm.product_applied}
                      onChange={e => setProcedureForm({ ...procedureForm, product_applied: e.target.value })}
                      placeholder="Ex: Botox 100U, Juvederm Voluma 1ml..."
                      className="w-full p-2 rounded-lg border border-slate-200 bg-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-medium text-slate-600 mb-1">Lote</label>
                      <input
                        type="text"
                        value={procedureForm.lot_number}
                        onChange={e => setProcedureForm({ ...procedureForm, lot_number: e.target.value })}
                        placeholder="Ex: L123456"
                        className="w-full p-2 rounded-lg border border-slate-200 bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-600 mb-1">Validade</label>
                      <input
                        type="date"
                        value={procedureForm.expiry_date}
                        onChange={e => setProcedureForm({ ...procedureForm, expiry_date: e.target.value })}
                        className="w-full p-2 rounded-lg border border-slate-200 bg-white font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">Quantidade Aplicada</label>
                    <input
                      type="text"
                      value={procedureForm.quantity}
                      onChange={e => setProcedureForm({ ...procedureForm, quantity: e.target.value })}
                      className="w-full p-2 rounded-lg border border-slate-200 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">Unidade</label>
                    <select
                      value={procedureForm.unit}
                      onChange={e => setProcedureForm({ ...procedureForm, unit: e.target.value })}
                      className="w-full p-2 rounded-lg border border-slate-200 bg-white"
                    ><option value="">Não avaliado</option>
                      <option value="ml">ml</option>
                      <option value="U">Unidades (U)</option>
                      <option value="frasco">Frasco(s)</option>
                      <option value="fios">Fio(s)</option>
                      <option value="sessao">Sessão</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">Data Realização</label>
                    <input
                      type="date"
                      value={procedureForm.date_performed}
                      onChange={e => setProcedureForm({ ...procedureForm, date_performed: e.target.value })}
                      className="w-full p-2 rounded-lg border border-slate-200 bg-white font-mono"
                    />
                  </div>
                </div>

                {/* Baixa no Estoque */}
                {inventoryItems.length > 0 && (
                  <div className="pt-2 border-t border-slate-200/60">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={procedureForm.deduct_inventory}
                        onChange={e => setProcedureForm({ ...procedureForm, deduct_inventory: e.target.checked })}
                        className="rounded text-emerald-600"
                      />
                      <span>Baixar automaticamente do estoque da clínica</span>
                    </label>

                    {procedureForm.deduct_inventory && (
                      <div className="mt-2">
                        <select
                          value={procedureForm.inventory_item_id}
                          onChange={e => setProcedureForm({ ...procedureForm, inventory_item_id: e.target.value })}
                          className="w-full p-2 rounded-lg border border-slate-200 bg-white text-xs"
                        >
                          <option value="">Selecione o insumo do estoque...</option>
                          {inventoryItems.map(inv => (
                            <option key={inv.id} value={inv.id}>
                              {inv.name} (Saldo atual: {inv.current_stock || 0} {inv.unit || 'un'})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Orientações Pós-Procedimento Fornecidas</label>
                <textarea
                  rows={2}
                  value={procedureForm.post_instructions}
                  onChange={e => setProcedureForm({ ...procedureForm, post_instructions: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsNewProcedureModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 bg-slate-100 hover:bg-slate-200 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 shadow-md"
                >
                  Registrar Procedimento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Anexar Foto Clínica */}
      {isNewPhotoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-base">Anexar Fotografia Clínica</h3>
              <button onClick={() => setIsNewPhotoModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePhoto} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Selecione o Arquivo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoFileUpload}
                  className="w-full p-2 rounded-xl border border-slate-200 text-slate-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Ou Cole a URL da Imagem</label>
                <input
                  type="url"
                  value={photoForm.photo_url}
                  onChange={e => setPhotoForm({ ...photoForm, photo_url: e.target.value })}
                  placeholder="https://exemplo.com/foto.jpg"
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
              </div>

              {photoForm.photo_url && (
                <div className="aspect-video bg-slate-100 rounded-xl overflow-hidden border border-slate-200">
                  <img src={photoForm.photo_url} alt="Pré-visualização" className="w-full h-full object-cover" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tipo de Foto</label>
                  <select
                    value={photoForm.photo_type}
                    onChange={e => setPhotoForm({ ...photoForm, photo_type: e.target.value as any })}
                    className="w-full p-2 rounded-lg border border-slate-200 bg-white"
                  >
                    <option value="ANTES">Antes</option>
                    <option value="DEPOIS">Depois</option>
                    <option value="ACOMPANHAMENTO">Acompanhamento</option>
                    <option value="RETORNO">Retorno</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ângulo / Vista</label>
                  <select
                    value={photoForm.view_angle}
                    onChange={e => setPhotoForm({ ...photoForm, view_angle: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-200 bg-white"
                  >
                    <option value="FRONTAL">Frontal</option>
                    <option value="PERFIL_D">Perfil Direito</option>
                    <option value="PERFIL_E">Perfil Esquerdo</option>
                    <option value="OBLIQUO_45_D">Oblíquo 45° Direito</option>
                    <option value="OBLIQUO_45_E">Oblíquo 45° Esquerdo</option>
                    <option value="VERTICE">Vértice / Topo</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Observações da Foto</label>
                <input
                  type="text"
                  value={photoForm.notes}
                  onChange={e => setPhotoForm({ ...photoForm, notes: e.target.value })}
                  placeholder="Ex: Foto 15 dias pós-toxina..."
                  className="w-full p-2 rounded-lg border border-slate-200"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsNewPhotoModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 bg-slate-100 hover:bg-slate-200 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-sky-600 text-white font-bold hover:bg-sky-700 shadow-md"
                >
                  Salvar Foto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Nova Evolução */}
      {isNewEvolutionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-base">Registrar Evolução Clínica</h3>
              <button onClick={() => setIsNewEvolutionModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEvolution} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Data da Evolução</label>
                <input
                  type="date"
                  value={evolutionForm.evolution_date}
                  onChange={e => setEvolutionForm({ ...evolutionForm, evolution_date: e.target.value })}
                  className="w-full p-2 rounded-lg border border-slate-200 bg-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Resposta Biológica / Tecidual *</label>
                <textarea
                  rows={2}
                  value={evolutionForm.biological_response}
                  onChange={e => setEvolutionForm({ ...evolutionForm, biological_response: e.target.value })}
                  placeholder="Acomodação do produto, redução de edema, cicatrização..."
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Relato / Feedback do Paciente</label>
                <textarea
                  rows={2}
                  value={evolutionForm.patient_feedback}
                  onChange={e => setEvolutionForm({ ...evolutionForm, patient_feedback: e.target.value })}
                  placeholder="Sensações relatadas, nível de satisfação, queixas..."
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Conduta Profissional Adotada</label>
                <textarea
                  rows={2}
                  value={evolutionForm.conduct}
                  onChange={e => setEvolutionForm({ ...evolutionForm, conduct: e.target.value })}
                  placeholder="Orientações prestadas, prescrição tópica ou conduta clínica..."
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsNewEvolutionModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 bg-slate-100 hover:bg-slate-200 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-sky-600 text-white font-bold hover:bg-sky-700 shadow-md"
                >
                  Salvar Evolução
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Agendar / Registrar Retorno */}
      {isNewReturnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-base">Agendar / Registrar Retorno Clínico</h3>
              <button onClick={() => setIsNewReturnModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveReturn} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Data Prevista *</label>
                  <input
                    type="date"
                    value={returnForm.scheduled_date}
                    onChange={e => setReturnForm({ ...returnForm, scheduled_date: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-200 bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Status</label>
                  <select
                    value={returnForm.status}
                    onChange={e => setReturnForm({ ...returnForm, status: e.target.value as any })}
                    className="w-full p-2 rounded-lg border border-slate-200 bg-white"
                  ><option value="">Não avaliado</option>
                    <option value="AGENDADO">Agendado</option>
                    <option value="COMPARECEU">Compareceu</option>
                    <option value="RETOQUE_REALIZADO">Retoque Realizado</option>
                    <option value="ALTA_CICLO">Alta do Ciclo</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Avaliação do Resultado no Retorno</label>
                <textarea
                  rows={2}
                  value={returnForm.evaluation_notes}
                  onChange={e => setReturnForm({ ...returnForm, evaluation_notes: e.target.value })}
                  placeholder="Avaliação da simetria, acomodação e resposta estética..."
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                  <ClinicalBooleanSelect value={returnForm.touchup_required}
                    onChange={value => setReturnForm({ ...returnForm, touchup_required: value })} />
                  <span>Retoque necessário ou realizado?</span>
                </label>

                {returnForm.touchup_required && (
                  <input
                    type="text"
                    value={returnForm.touchup_description}
                    onChange={e => setReturnForm({ ...returnForm, touchup_description: e.target.value })}
                    placeholder="Descreva o retoque (ex: 2U fronte esquerda)..."
                    className="w-full p-2 rounded-lg border border-slate-200 bg-white text-xs"
                  />
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsNewReturnModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 bg-slate-100 hover:bg-slate-200 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-700 shadow-md"
                >
                  Salvar Retorno
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Zemda360 em Tela Cheia */}
      <ZemdaBodyModal
        isOpen={isZemda360ModalOpen}
        onClose={() => setIsZemda360ModalOpen(false)}
        patientId={selectedPatientId}
        patientName={overviewData?.patient?.full_name}
        module="estetic"
        initialMapType={areaTheme.mapType}
      />

      {/* Lightbox de Foto */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="bg-white rounded-3xl overflow-hidden max-w-3xl w-full p-4 space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 text-sm">
                  {lightboxPhoto.view_angle} • {lightboxPhoto.photo_type}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {new Date(lightboxPhoto.taken_at).toLocaleDateString('pt-BR')}
                </span>
              </div>
              <button onClick={() => setLightboxPhoto(null)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[70vh] flex items-center justify-center bg-black/5 rounded-2xl overflow-hidden">
              <img src={lightboxPhoto.photo_url} alt="Foto Ampliada" className="max-h-[68vh] object-contain" />
            </div>
            {lightboxPhoto.notes && (
              <p className="text-xs text-slate-600">{lightboxPhoto.notes}</p>
            )}
          </div>
        </div>
      )}

      {/* Modal: Detalhes da Avaliação Anterior */}
      {selectedAssessmentDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[85vh] overflow-y-auto p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Ficha de Avaliação Estética</h3>
                <span className="text-xs text-slate-400 font-mono">
                  {new Date(selectedAssessmentDetail.created_at).toLocaleDateString('pt-BR')} • {selectedAssessmentDetail.area}
                </span>
              </div>
              <button onClick={() => setSelectedAssessmentDetail(null)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="font-bold text-slate-500 uppercase">Queixa Principal:</span>
                <p className="text-slate-900 font-medium mt-0.5">{selectedAssessmentDetail.complaint}</p>
              </div>

              {selectedAssessmentDetail.expectations && (
                <div>
                  <span className="font-bold text-slate-500 uppercase">Expectativas:</span>
                  <p className="text-slate-800 mt-0.5">{selectedAssessmentDetail.expectations}</p>
                </div>
              )}

              {selectedAssessmentDetail.phototype && (
                <div>
                  <span className="font-bold text-slate-500 uppercase">Fototipo:</span>
                  <p className="text-slate-800 mt-0.5">Fototipo {selectedAssessmentDetail.phototype}</p>
                </div>
              )}

              {selectedAssessmentDetail.previous_treatments && (
                <div>
                  <span className="font-bold text-slate-500 uppercase">Tratamentos Anteriores:</span>
                  <p className="text-slate-800 mt-0.5">{selectedAssessmentDetail.previous_treatments}</p>
                </div>
              )}

              {selectedAssessmentDetail.clinical_conduct && (
                <div>
                  <span className="font-bold text-slate-500 uppercase">Conduta Registrada:</span>
                  <p className="text-slate-800 mt-0.5">{selectedAssessmentDetail.clinical_conduct}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t">
              <button
                type="button"
                onClick={() => setSelectedAssessmentDetail(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
