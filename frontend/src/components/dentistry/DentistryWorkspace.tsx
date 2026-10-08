import { PeriodontalExamForm } from './forms/PeriodontalExamForm';
import { useClinicalFormReset } from '../../hooks/useClinicalFormReset';
import { ClinicalBooleanSelect } from '../clinical/ClinicalBooleanSelect';
import { useConsultationCompletion } from '../clinical/useConsultationCompletion';
import React, { useState, useEffect } from 'react';
import {
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  Heart,
  History,
  Layers,
  Plus,
  Save,
  Search,
  Settings,
  Share2,
  Shield,
  Smile,
  Sparkles,
  Stethoscope,
  Trash2,
  Upload,
  User,
  AlertTriangle,
  FileCheck,
  DollarSign,
  Package,
  Boxes,
  Edit3,
  Camera,
  Scissors
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { OdontogramCanvas, OdontogramData } from './OdontogramCanvas';
import { ToothDossierDrawer } from './ToothDossierDrawer';
import { DentalAIDictationModal, DentalParsedData } from './DentalAIDictationModal';
import { ProcedureSuggestionModal, ProcedureSuggestionItem } from './ProcedureSuggestionModal';
import { Perio6SitesGrid } from './Perio6SitesGrid';
import { DentalImplantsManager } from './DentalImplantsManager';
import { DentalProstheticsKanban } from './DentalProstheticsKanban';
import { EvolutionPhotoField } from '../common/EvolutionPhotoField';
import { PatientPreviousRecordsModal } from '../clinical/PatientPreviousRecordsModal';
import { ExternalTestsManager } from '../common/ExternalTestsManager';
import { MeasurableGoalsManager } from '../common/MeasurableGoalsManager';
import { useClinicalAutosave } from '../../hooks/useClinicalAutosave';
import { useHorizontalTabScroll, HorizontalTabNav } from '../../hooks/useHorizontalTabScroll';
import { ClinicalQuickHeaderActions, ClinicalQuickToolItem } from '../clinical/ClinicalQuickHeaderActions';
import { ClinicalDraftRecoveryModal } from '../clinical/ClinicalDraftRecoveryModal';
import { PatientSearchSelect } from '../common/PatientSearchSelect';
import { ProfessionalModuleHeader } from '../common/ProfessionalModuleHeader';
import { ClinicalInventorySelector, ClinicalInventorySelection } from '../clinical/ClinicalInventorySelector';
import { ClinicalModuleEmptyState } from '../clinical/ClinicalModuleEmptyState';

export interface DentistryInventoryUsageItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  batchLot?: string;
  expiryDate?: string;
  toothNumber?: string | number;
  region?: string;
  procedureDescription?: string;
  movementId?: string;
  status: 'pending' | 'deducted';
  currentStock?: number;
}

export interface PlanProcedureItem {
  itemType?: 'service';
  tooth?: string;
  face?: string;
  procedure?: string;
  value?: number;
  unitPrice?: number;
  totalPrice?: number;
}

export interface PlanProductItem {
  itemType: 'product';
  productId: string;
  productName: string;
  brand?: string;
  batchLot?: string;
  expiryDate?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
}

export type DentalPlanItem = PlanProcedureItem | PlanProductItem;

interface DentistryWorkspaceProps {
  initialPatientId?: string;
  initialAppointmentId?: string;
  onFinishConsultation?: () => void;
}

export const DentistryWorkspace: React.FC<DentistryWorkspaceProps> = ({
  initialPatientId,
  initialAppointmentId,
  onFinishConsultation
}) => {
  const { currentUser, currentTenant } = useAuth();

  // Pacientes e Seleção

  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId || '');
  const completion = useConsultationCompletion(onFinishConsultation, selectedPatientId + ':' + (initialAppointmentId || ''));
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [showPreviousRecordsModal, setShowPreviousRecordsModal] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<
    'odontogram' | 'perio' | 'endo' | 'anamnesis' | 'treatment_plans' | 'prosthetics' | 'ortho_hof' | 'implants' | 'photos_exams' | 'documents'
  >('odontogram');

  // Hook para usabilidade e scroll suave das abas odontológicas
  const tabScroll = useHorizontalTabScroll(activeTab);
  const { tabScrollProps } = tabScroll;

  // Dossiê do dente
  const [dossierToothNumber, setDossierToothNumber] = useState<number | null>(null);
  const [isDossierOpen, setIsDossierOpen] = useState<boolean>(false);

  // Ditado por IA
  const [isDictationModalOpen, setIsDictationModalOpen] = useState<boolean>(false);

  // Sugestões de atualização de odontograma
  const [procedureSuggestions, setProcedureSuggestions] = useState<ProcedureSuggestionItem[]>([]);
  const [isProcedureSuggestionOpen, setIsProcedureSuggestionOpen] = useState<boolean>(false);

  // Fotos clínicas
  const [clinicalPhotos, setClinicalPhotos] = useState<any[]>([]);

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Dados Clínicos Odontológicos
  const [odontogramData, setOdontogramData] = useState<OdontogramData>({});
  const [initialOdontogramData, setInitialOdontogramData] = useState<OdontogramData>({});
  const [pendingToothChanges, setPendingToothChanges] = useState<any[]>([]);

  // Periodontia
  const [perioRecords, setPerioRecords] = useState<any[]>([]);
  const [perioForm, setPerioForm] = useState({
    toothNumber: '',
    site: '',
    probingDepth: '',
    bleeding: undefined as boolean | undefined,
    suppuration: undefined as boolean | undefined,
    mobility: '',
    furcation: '',
    recession: '',
    notes: ''
  });

  // Endodontia
  const [endoRecords, setEndoRecords] = useState<any[]>([]);
  const [endoForm, setEndoForm] = useState({
    toothNumber: '',
    pulparDiagnosis: '',
    periapicalDiagnosis: '',
    canalsCount: '' as number | '',
    workingLength: '',
    instrumentation: '',
    irrigation: '',
    intracanalMedication: '',
    obturation: '',
    material: '',
    sessionsCount: 1,
    notes: ''
  });

  // Anamnese Odontológica
  const [anamnesis, setAnamnesis] = useState<any>({
    systemicDiseases: [],
    habits: [],
    allergies: [],
    currentMedications: '',
    previousSurgeries: '',
    anesthesiaHistory: '',
    notes: ''
  });

  // Planos de Tratamento e Orçamento
  const [treatmentPlans, setTreatmentPlans] = useState<any[]>([]);
  const [planForm, setPlanForm] = useState({
    title: '',
    items: [] as DentalPlanItem[],
    totalValue: 0,
    discountValue: 0,
    finalValue: 0,
    paymentTerms: '',
    notes: ''
  });
  const [newPlanItem, setNewPlanItem] = useState({
    tooth: '',
    face: '',
    procedure: '',
    value: ''
  });

  // Produtos / Insumos previstos no orçamento
  const [isAddingPlanProduct, setIsAddingPlanProduct] = useState<boolean>(false);
  const [planProductSelection, setPlanProductSelection] = useState<ClinicalInventorySelection>({
    productId: null,
    productName: '',
    quantity: 1,
    unit: 'un',
    withoutProduct: false
  });
  const [planProductUnitPrice, setPlanProductUnitPrice] = useState<number | ''>(0);
  const [planProductError, setPlanProductError] = useState<string | null>(null);

  // Prótese / Laboratório
  const [prosthetics, setProsthetics] = useState<any[]>([]);
  const [prostheticForm, setProstheticForm] = useState({
    labName: '',
    workType: '',
    toothNumber: '',
    shadeColor: '',
    material: '',
    sentDate: new Date().toISOString().split('T')[0],
    expectedDate: '',
    costValue: '' as number | '',
    notes: ''
  });

  // Ortodontia e HOF
  const [orthoData, setOrthoData] = useState<any>(null);
  const [hofRecords, setHofRecords] = useState<any[]>([]);
  const [hofForm, setHofForm] = useState({
    procedureName: '',
    facialRegion: '',
    productBrand: '',
    lotNumber: '',
    unitsQuantity: '',
    expiryDate: '',
    notes: ''
  });
  const [showHofInventoryPicker, setShowHofInventoryPicker] = useState<boolean>(false);
  const [hofInventorySelection, setHofInventorySelection] = useState<ClinicalInventorySelection>({
    productId: null,
    productName: '',
    quantity: 1,
    unit: 'un',
    withoutProduct: false
  });

  // Finalização Rápida de Atendimento Odontológico
  const [consultationEvolution, setConsultationEvolution] = useState<string>('');
  const [consultationProcedures, setConsultationProcedures] = useState<string>('');

  // Insumos Clínicos Utilizados nesta Consulta (ZemdaOdonto + Estoque Central)
  const [inventoryUsages, setInventoryUsages] = useState<DentistryInventoryUsageItem[]>([]);
  const [isAddingUsage, setIsAddingUsage] = useState<boolean>(false);
  const [editingUsageId, setEditingUsageId] = useState<string | null>(null);
  const [usageTooth, setUsageTooth] = useState<string>('');
  const [usageProcedure, setUsageProcedure] = useState<string>('');
  const [usageSelection, setUsageSelection] = useState<ClinicalInventorySelection>({
    productId: null,
    productName: '',
    quantity: 1,
    unit: 'un',
    withoutProduct: false
  });
  const [usageError, setUsageError] = useState<string | null>(null);
  const [refundingUsageId, setRefundingUsageId] = useState<string | null>(null);

  const isCurrentClinicalContext = useClinicalFormReset(selectedPatientId + ':' + (initialAppointmentId || ''), [
    [odontogramData, setOdontogramData],
    [initialOdontogramData, setInitialOdontogramData],
    [pendingToothChanges, setPendingToothChanges],
    [perioForm, setPerioForm],
    [endoForm, setEndoForm],
    [anamnesis, setAnamnesis],
    [planForm, setPlanForm],
    [newPlanItem, setNewPlanItem],
    [prostheticForm, setProstheticForm],
    [hofForm, setHofForm],
    [consultationEvolution, setConsultationEvolution],
    [consultationProcedures, setConsultationProcedures],
    [inventoryUsages, setInventoryUsages],
  ]);


  // Payload do Autosave Universal Clínico (ZemdaOdonto)
  const autosavePayload = React.useMemo(() => ({
    consultationEvolution,
    consultationProcedures,
    anamnesis,
    perioForm,
    endoForm,
    planForm,
    prostheticForm,
    hofForm,
    odontogramData,
    pendingToothChanges,
    inventoryUsages
  }), [
    consultationEvolution,
    consultationProcedures,
    anamnesis,
    perioForm,
    endoForm,
    planForm,
    prostheticForm,
    hofForm,
    odontogramData,
    pendingToothChanges,
    inventoryUsages
  ]);

  const handleRestoreDraft = (data: any) => {
    if (!data) return;
    if (data.consultationEvolution !== undefined) setConsultationEvolution(data.consultationEvolution);
    if (data.consultationProcedures !== undefined) setConsultationProcedures(data.consultationProcedures);
    if (data.anamnesis) setAnamnesis((prev: any) => ({ ...prev, ...data.anamnesis }));
    if (data.perioForm) setPerioForm((prev: any) => ({ ...prev, ...data.perioForm }));
    if (data.endoForm) setEndoForm((prev: any) => ({ ...prev, ...data.endoForm }));
    if (data.planForm) setPlanForm((prev: any) => ({ ...prev, ...data.planForm }));
    if (data.prostheticForm) setProstheticForm((prev: any) => ({ ...prev, ...data.prostheticForm }));
    if (data.hofForm) setHofForm((prev: any) => ({ ...prev, ...data.hofForm }));
    if (data.odontogramData && Object.keys(data.odontogramData).length > 0) setOdontogramData(data.odontogramData);
    if (Array.isArray(data.pendingToothChanges)) setPendingToothChanges(data.pendingToothChanges);
    if (Array.isArray(data.inventoryUsages)) setInventoryUsages(data.inventoryUsages);
  };

  const autosave = useClinicalAutosave({
    moduleType: 'ZemdaOdonto',
    patientId: selectedPatientId,
    appointmentId: initialAppointmentId,
    payload: autosavePayload,
    onRestoreDraft: handleRestoreDraft
  });

  // Funções de Gestão de Insumos Clínicos
  const handleOpenAddUsage = () => {
    setEditingUsageId(null);
    setUsageTooth('');
    setUsageProcedure('');
    setUsageSelection({
      productId: null,
      productName: '',
      quantity: 1,
      unit: 'un',
      withoutProduct: false
    });
    setUsageError(null);
    setIsAddingUsage(true);
  };

  const handleEditUsage = (item: DentistryInventoryUsageItem) => {
    setEditingUsageId(item.id);
    setUsageTooth(item.toothNumber ? String(item.toothNumber) : '');
    setUsageProcedure(item.procedureDescription || '');
    setUsageSelection({
      productId: item.productId,
      productName: item.productName,
      batchLot: item.batchLot,
      expiryDate: item.expiryDate,
      quantity: item.quantity,
      unit: item.unit,
      withoutProduct: false
    });
    setUsageError(null);
    setIsAddingUsage(true);
  };

  const handleSaveUsageItem = () => {
    if (!usageSelection.productId || !usageSelection.productName) {
      setUsageError('Selecione um insumo/produto do estoque da clínica.');
      return;
    }
    const qty = Number(usageSelection.quantity);
    if (!qty || qty <= 0) {
      setUsageError('Informe uma quantidade válida maior que zero.');
      return;
    }

    if (editingUsageId) {
      setInventoryUsages(prev => prev.map(u => {
        if (u.id === editingUsageId) {
          return {
            ...u,
            productId: usageSelection.productId!,
            productName: usageSelection.productName,
            quantity: qty,
            unit: usageSelection.unit || 'un',
            batchLot: usageSelection.batchLot,
            expiryDate: usageSelection.expiryDate,
            toothNumber: usageTooth.trim() || undefined,
            procedureDescription: usageProcedure.trim() || undefined,
          };
        }
        return u;
      }));
    } else {
      const newItem: DentistryInventoryUsageItem = {
        id: 'usage-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        productId: usageSelection.productId,
        productName: usageSelection.productName,
        quantity: qty,
        unit: usageSelection.unit || 'un',
        batchLot: usageSelection.batchLot,
        expiryDate: usageSelection.expiryDate,
        toothNumber: usageTooth.trim() || undefined,
        procedureDescription: usageProcedure.trim() || undefined,
        status: 'pending'
      };
      setInventoryUsages(prev => [...prev, newItem]);
    }

    setIsAddingUsage(false);
    setEditingUsageId(null);
    setUsageError(null);
  };

  const handleRemoveUsage = async (item: DentistryInventoryUsageItem) => {
    if (item.status === 'deducted' && item.movementId) {
      if (!window.confirm(`Deseja estornar a baixa de ${item.quantity} ${item.unit} de "${item.productName}" ao estoque central da clínica?`)) {
        return;
      }
      try {
        setRefundingUsageId(item.id);
        await ApiClient.post('/v1/clinical-inventory/usage/refund', {
          movementId: item.movementId,
          reason: 'Remoção de insumo da consulta odontológica'
        });
        window.dispatchEvent(new CustomEvent('zemda-inventory-updated'));
        setInventoryUsages(prev => prev.filter(u => u.id !== item.id));
        setSuccessMsg(`Estorno de "${item.productName}" realizado com sucesso!`);
        setTimeout(() => setSuccessMsg(null), 3000);
      } catch (err: any) {
        setErrorMsg(err.message || 'Erro ao estornar insumo');
        setTimeout(() => setErrorMsg(null), 4000);
      } finally {
        setRefundingUsageId(null);
      }
    } else {
      setInventoryUsages(prev => prev.filter(u => u.id !== item.id));
    }
  };

  // Ao selecionar paciente, carrega os dados do paciente e dados odontológicos
  useEffect(() => {
    if (!selectedPatientId) {
      setSelectedPatient(null);
      return;
    }

    ApiClient.get<any>(`/v1/patients/${selectedPatientId}`).then(p => {
      if (!isCurrentClinicalContext()) return;
      const patData = p?.patient || p;
      setSelectedPatient(patData);
      loadPatientDentalData(selectedPatientId);
    }).catch(err => {
      console.warn('Erro ao carregar paciente odontológico:', err);
      loadPatientDentalData(selectedPatientId);
    });
  }, [selectedPatientId]);

  const loadPatientDentalData = async (patientId: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Odontogramas
      try {
        const odontoRes = await ApiClient.get<any>(`/v1/dentistry/odontograms/${patientId}`);
      if (!isCurrentClinicalContext()) return;
        if (odontoRes) {
          if (odontoRes.current?.status_data) {
            setOdontogramData(odontoRes.current.status_data);
          } else {
            setOdontogramData({});
          }
          if (odontoRes.initial?.status_data) {
            setInitialOdontogramData(odontoRes.initial.status_data);
          } else {
            setInitialOdontogramData(odontoRes.current?.status_data || {});
          }
        }
      } catch (err) {
        console.warn('Odontograma novo ou vazio:', err);
      }

      // 2. Anamnese
      try {
        const anaRes = await ApiClient.get<any>(`/v1/dentistry/anamnesis/${patientId}`);
      if (!isCurrentClinicalContext()) return;
        if (anaRes) {
          setAnamnesis({
            systemicDiseases: anaRes.systemic_diseases || [],
            habits: anaRes.habits || [],
            allergies: anaRes.allergies || [],
            currentMedications: anaRes.current_medications || '',
            previousSurgeries: anaRes.previous_surgeries || '',
            anesthesiaHistory: anaRes.anesthesia_history || '',
            notes: anaRes.notes || ''
          });
        }
      } catch (err) {
        console.warn('Sem anamnese prévia:', err);
      }

      // 3. Planos de Tratamento
      try {
        const plansRes = await ApiClient.get<any[]>(`/v1/dentistry/treatment-plans/${patientId}`);
      if (!isCurrentClinicalContext()) return;
        setTreatmentPlans(plansRes || []);
      } catch {}

      // 4. Perio
      try {
        const perioRes = await ApiClient.get<any[]>(`/v1/dentistry/perio/${patientId}`);
      if (!isCurrentClinicalContext()) return;
        setPerioRecords(perioRes || []);
      } catch {}

      // 5. Endo
      try {
        const endoRes = await ApiClient.get<any[]>(`/v1/dentistry/endo/${patientId}`);
      if (!isCurrentClinicalContext()) return;
        setEndoRecords(endoRes || []);
      } catch {}

      // 6. Prótese
      try {
        const prosthRes = await ApiClient.get<any[]>(`/v1/dentistry/prosthetics/${patientId}`);
      if (!isCurrentClinicalContext()) return;
        setProsthetics(prosthRes || []);
      } catch {}

      // 7. Orto e HOF
      try {
        const orthoRes = await ApiClient.get<any>(`/v1/dentistry/orthodontics/${patientId}`);
      if (!isCurrentClinicalContext()) return;
        setOrthoData(orthoRes);
        const hofRes = await ApiClient.get<any[]>(`/v1/dentistry/hof/${patientId}`);
      if (!isCurrentClinicalContext()) return;
        setHofRecords(hofRes || []);
      } catch {}

    } catch (err: any) {
      console.error('Erro ao carregar prontuário odontológico:', err);
      setErrorMsg('Não foi possível carregar alguns dados clínicos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedPatientId) return;
    const reloadProsthetics = async () => {
      try {
        const prosthRes = await ApiClient.get<any[]>(`/v1/dentistry/prosthetics/${selectedPatientId}`);
        setProsthetics(prosthRes || []);
      } catch {}
    };
    window.addEventListener('zemda-prosthetics-updated', reloadProsthetics);
    return () => {
      window.removeEventListener('zemda-prosthetics-updated', reloadProsthetics);
    };
  }, [selectedPatientId]);

  // Salvar Odontograma
  const handleSaveOdontogram = async () => {
    if (!selectedPatientId) return;
    setSaving(true);
    try {
      await ApiClient.post('/v1/dentistry/odontograms', {
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId,
        type: 'current',
        statusData: odontogramData,
        toothChanges: pendingToothChanges
      });
      setPendingToothChanges([]);
      setSuccessMsg('Odontograma salvo com sucesso!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar odontograma');
    } finally {
      setSaving(false);
    }
  };

  // Salvar Anamnese
  const handleSaveAnamnesis = async () => {
    if (!selectedPatientId) return;
    setSaving(true);
    try {
      await ApiClient.post('/v1/dentistry/anamnesis', {
        patientId: selectedPatientId,
        ...anamnesis
      });
      setSuccessMsg('Anamnese odontológica atualizada com sucesso!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar anamnese');
    } finally {
      setSaving(false);
    }
  };

  // Salvar Registro Endodôntico
  const handleSaveEndo = async () => {
    if (!selectedPatientId) return;
    setSaving(true);
    try {
      await ApiClient.post('/v1/dentistry/endo', {
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId,
        ...endoForm
      });
      setSuccessMsg('Tratamento de canal / endodontia registrado!');
      const endoRes = await ApiClient.get<any[]>(`/v1/dentistry/endo/${selectedPatientId}`);
      setEndoRecords(endoRes || []);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar endodontia');
    } finally {
      setSaving(false);
    }
  };

  // Salvar Trabalho de Prótese
  const handleSaveProsthetic = async () => {
    if (!selectedPatientId) {
      setErrorMsg('Selecione um paciente antes de registrar a prótese.');
      setTimeout(() => setErrorMsg(null), 3500);
      return;
    }
    if (!prostheticForm.labName.trim()) {
      setErrorMsg('Informe o nome do laboratório.');
      setTimeout(() => setErrorMsg(null), 3500);
      return;
    }
    if (!prostheticForm.workType.trim()) {
      setErrorMsg('Informe o tipo de trabalho protético.');
      setTimeout(() => setErrorMsg(null), 3500);
      return;
    }

    setSaving(true);
    try {
      await ApiClient.post('/v1/dentistry/prosthetics', {
        patientId: selectedPatientId,
        ...prostheticForm
      });
      setSuccessMsg('Trabalho protético enviado ao laboratório cadastrado!');
      const res = await ApiClient.get<any[]>(`/v1/dentistry/prosthetics/${selectedPatientId}`);
      setProsthetics(res || []);
      setProstheticForm({
        labName: '',
        workType: '',
        toothNumber: '',
        shadeColor: '',
        material: '',
        sentDate: new Date().toISOString().split('T')[0],
        expectedDate: '',
        costValue: '' as number | '',
        notes: ''
      });
      window.dispatchEvent(new CustomEvent('zemda-prosthetics-updated'));
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      const realMsg = err?.response?.data?.error || err?.message || 'Erro ao salvar prótese';
      setErrorMsg(realMsg);
      setTimeout(() => setErrorMsg(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  const handleHofInventoryChange = (sel: ClinicalInventorySelection) => {
    setHofInventorySelection(sel);
    if (sel.productId && sel.productName) {
      setHofForm(prev => ({
        ...prev,
        productBrand: sel.productName + (sel.brand ? ` (${sel.brand})` : ''),
        lotNumber: sel.batchLot || '',
        unitsQuantity: sel.quantity ? String(sel.quantity) : '1',
        expiryDate: sel.expiryDate || prev.expiryDate || ''
      }));
    }
  };

  // Salvar Procedimento HOF
  const handleSaveHof = async () => {
    if (!selectedPatientId) return;
    setSaving(true);
    try {
      await ApiClient.post('/v1/dentistry/hof', {
        patientId: selectedPatientId,
        ...hofForm
      });

      // Se utilizou produto do estoque central, vincula automaticamente aos insumos da consulta
      if (hofInventorySelection.productId && Number(hofInventorySelection.quantity) > 0) {
        setInventoryUsages(prev => {
          const exists = prev.some(u => u.productId === hofInventorySelection.productId && u.procedureDescription?.includes(hofForm.procedureName));
          if (exists) return prev;
          return [
            ...prev,
            {
              id: 'usage-hof-' + Date.now(),
              productId: hofInventorySelection.productId!,
              productName: hofInventorySelection.productName,
              quantity: Number(hofInventorySelection.quantity),
              unit: hofInventorySelection.unit || 'un',
              batchLot: hofInventorySelection.batchLot,
              expiryDate: hofInventorySelection.expiryDate,
              region: hofForm.facialRegion || undefined,
              procedureDescription: `HOF: ${hofForm.procedureName || 'Procedimento Facial'}`,
              status: 'pending'
            }
          ];
        });
      }

      setSuccessMsg('Procedimento de Harmonização Orofacial registrado!');
      const res = await ApiClient.get<any[]>(`/v1/dentistry/hof/${selectedPatientId}`);
      setHofRecords(res || []);
      setHofForm({
        procedureName: '',
        facialRegion: '',
        productBrand: '',
        lotNumber: '',
        unitsQuantity: '',
        expiryDate: '',
        notes: ''
      });
      setHofInventorySelection({
        productId: null,
        productName: '',
        quantity: 1,
        unit: 'un',
        withoutProduct: false
      });
      setShowHofInventoryPicker(false);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar HOF');
    } finally {
      setSaving(false);
    }
  };

  // Helper para recalcular totais do orçamento
  const calculatePlanTotals = (items: DentalPlanItem[], discount: number) => {
    const total = items.reduce((acc, curr) => {
      if ((curr as PlanProductItem).itemType === 'product') {
        return acc + Number((curr as PlanProductItem).totalPrice || 0);
      }
      return acc + Number((curr as PlanProcedureItem).value || 0);
    }, 0);
    const finalVal = Math.max(0, total - discount);
    return { total, finalVal };
  };

  // Adicionar Procedimento ao Orçamento em Elaboração
  const handleAddPlanItem = () => {
    const procedure = newPlanItem.procedure.trim();
    if (!procedure) {
      setErrorMsg('Informe o nome ou descrição do procedimento para adicionar.');
      setTimeout(() => setErrorMsg(null), 3000);
      return;
    }

    const rawVal = parseFloat(newPlanItem.value.toString().replace(',', '.'));
    const val = isNaN(rawVal) || rawVal < 0 ? 0 : rawVal;

    const itemToAdd: PlanProcedureItem = {
      itemType: 'service',
      tooth: newPlanItem.tooth.trim() || 'Geral',
      face: newPlanItem.face.trim() || 'Geral',
      procedure,
      value: val
    };

    const updatedItems = [...planForm.items, itemToAdd];
    const { total, finalVal } = calculatePlanTotals(updatedItems, planForm.discountValue);

    setPlanForm({
      ...planForm,
      items: updatedItems,
      totalValue: total,
      finalValue: finalVal
    });

    setNewPlanItem({
      tooth: '',
      face: '',
      procedure: '',
      value: ''
    });
  };

  // Adicionar Produto/Insumo do Estoque ao Orçamento em Elaboração
  const handleAddPlanProduct = () => {
    setPlanProductError(null);
    if (!planProductSelection.productId || !planProductSelection.productName) {
      setPlanProductError('Selecione um produto/insumo do estoque.');
      return;
    }

    const qty = typeof planProductSelection.quantity === 'number'
      ? planProductSelection.quantity
      : (Number(planProductSelection.quantity) || 1);

    if (qty <= 0) {
      setPlanProductError('Informe uma quantidade prevista válida maior que zero.');
      return;
    }

    const rawPrice = parseFloat(planProductUnitPrice.toString().replace(',', '.'));
    const unitPrice = isNaN(rawPrice) || rawPrice < 0 ? 0 : rawPrice;
    const totalPrice = Math.round(qty * unitPrice * 100) / 100;

    const itemToAdd: PlanProductItem = {
      itemType: 'product',
      productId: planProductSelection.productId,
      productName: planProductSelection.productName,
      brand: planProductSelection.brand,
      batchLot: planProductSelection.batchLot,
      expiryDate: planProductSelection.expiryDate,
      quantity: qty,
      unit: planProductSelection.unit || 'un',
      unitPrice,
      totalPrice
    };

    const updatedItems = [...planForm.items, itemToAdd];
    const { total, finalVal } = calculatePlanTotals(updatedItems, planForm.discountValue);

    setPlanForm({
      ...planForm,
      items: updatedItems,
      totalValue: total,
      finalValue: finalVal
    });

    setPlanProductSelection({
      productId: null,
      productName: '',
      quantity: 1,
      unit: 'un',
      withoutProduct: false
    });
    setPlanProductUnitPrice(0);
    setIsAddingPlanProduct(false);
  };

  // Remover Item (Procedimento ou Insumo) do Orçamento
  const handleRemovePlanItem = (index: number) => {
    const updatedItems = planForm.items.filter((_, i) => i !== index);
    const { total, finalVal } = calculatePlanTotals(updatedItems, planForm.discountValue);
    setPlanForm({
      ...planForm,
      items: updatedItems,
      totalValue: total,
      finalValue: finalVal
    });
  };

  // Salvar Novo Plano de Tratamento e Orçamento
  const handleSavePlan = async () => {
    if (!selectedPatientId) {
      setErrorMsg('Selecione um paciente para registrar o orçamento.');
      setTimeout(() => setErrorMsg(null), 3000);
      return;
    }
    if (!planForm.title.trim()) {
      setErrorMsg('Informe o título do plano de tratamento/orçamento.');
      setTimeout(() => setErrorMsg(null), 3000);
      return;
    }
    if (planForm.items.length === 0) {
      setErrorMsg('Adicione pelo menos um procedimento ou produto/insumo ao orçamento.');
      setTimeout(() => setErrorMsg(null), 3000);
      return;
    }

    setSaving(true);
    try {
      await ApiClient.post('/v1/dentistry/treatment-plans', {
        patientId: selectedPatientId,
        ...planForm
      });
      setSuccessMsg('Plano de tratamento e orçamento gerados com sucesso!');
      const res = await ApiClient.get<any[]>(`/v1/dentistry/treatment-plans/${selectedPatientId}`);
      setTreatmentPlans(res || []);
      setPlanForm({
        title: '',
        items: [],
        totalValue: 0,
        discountValue: 0,
        finalValue: 0,
        paymentTerms: '',
        notes: ''
      });
      setNewPlanItem({ tooth: '', face: '', procedure: '', value: '' });
      window.dispatchEvent(new CustomEvent('zemda-budget-updated'));
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      const realMsg = err?.response?.data?.error || err?.message || 'Erro ao salvar orçamento';
      setErrorMsg(realMsg);
      setTimeout(() => setErrorMsg(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  // Finalizar Atendimento Odontológico
  const handleFinishConsultation = async () => {
    if (!selectedPatientId) { alert('Selecione um paciente para finalizar o atendimento.'); return; }
    if (!consultationEvolution.trim()) {
      alert('Informe o resumo da evolução clínica realizada nesta consulta.');
      return;
    }

    setSaving(true);
    try {
      if (!await completion.save('/v1/dentistry/consultations/finish', {
        patientId: selectedPatientId,
        patientName: selectedPatient?.full_name || selectedPatient?.name,
        professionalName: currentUser?.name,
        moduleType: 'ZemdaOdonto',
        appointmentId: initialAppointmentId,
        clinicalEvolution: consultationEvolution,
        proceduresPerformed: consultationProcedures,
        anamnesisData: anamnesis, periodontalData: perioForm, endodonticData: endoForm,
        treatmentPlanData: planForm, prostheticData: prostheticForm, orthodonticData: orthoData, facialData: hofForm,
        odontogramData: odontogramData,
        toothChanges: pendingToothChanges,
        inventoryUsages: inventoryUsages.map(u => ({
          id: u.id,
          productId: u.productId,
          productName: u.productName,
          quantity: u.quantity,
          unit: u.unit,
          batchLot: u.batchLot,
          expiryDate: u.expiryDate,
          toothNumber: u.toothNumber,
          region: u.region,
          procedureDescription: u.procedureDescription,
          movementId: u.movementId,
          status: u.status
        })),
        isSealed: true
      })) return;
      await autosave.clearDraft();

      // Detecção de procedimentos para sugestão de atualização no odontograma
      const textCombined = `${consultationEvolution} ${consultationProcedures}`;
      const matches = Array.from(textCombined.matchAll(/\b(?:dente|el\.|elemento)?\s*([1-4][1-8]|[5-8][1-5])\b/gi));
      const suggestions: ProcedureSuggestionItem[] = [];
      for (const m of matches) {
        const toothNum = parseInt(m[1]);
        if (toothNum && !suggestions.some(s => s.toothNumber === toothNum)) {
          let cond = 'restoration_resin';
          const lower = textCombined.toLowerCase();
          if (lower.includes('canal') || lower.includes('endo')) cond = 'endodontics';
          else if (lower.includes('extra') || lower.includes('exodontia')) cond = 'missing';
          else if (lower.includes('implante')) cond = 'implant';
          else if (lower.includes('coroa') || lower.includes('bloco')) cond = 'crown_prosthesis';

          suggestions.push({
            toothNumber: toothNum,
            suggestedCondition: cond,
            procedureText: `Intervenção relatada no elemento ${toothNum}`
          });
        }
      }

      if (suggestions.length > 0) {
        setProcedureSuggestions(suggestions);
        setIsProcedureSuggestionOpen(true);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao finalizar consulta');
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800">
      {completion.dialog}

      {/* CABEÇALHO DO MÓDULO ZEMDAODONTO */}
      <ProfessionalModuleHeader
        icon={Smile}
        iconGradient="from-cyan-600 to-teal-700"
        iconShadow="shadow-cyan-600/20"
        title="ZemdaOdonto"
        badgeLabel="Odontologia Especializada"
        badgeVariant="bg-cyan-100 text-cyan-800 border-cyan-200"
        description="Odontograma FDI interativo, periodontia, endodontia, planos de tratamento e orçamentos, prótese e HOF."
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
            onLoadSavedClinicalData={() => void loadPatientDentalData(selectedPatientId)}
            onViewPreviousRecords={() => setShowPreviousRecordsModal(true)}
            onViewReports={() => setActiveTab('treatment_plans')}
            reportsLabel="Planos & Orçamento"
            onFinishConsultation={handleFinishConsultation}
            finishLabel="Finalizar Atendimento"
            showFinish={!completion.isCompleted}
            isSubmitting={saving}
            tools={[
              {
                id: 'dictation',
                label: 'Ditado Clínico IA',
                icon: Sparkles,
                highlight: true,
                onClick: () => setIsDictationModalOpen(true)
              }
            ]}
            toolsVariant="cyan"
            toolsLabel="Ferramentas"
          />
        )}
      </ProfessionalModuleHeader>

      {/* NAVEGAÇÃO POR ABAS PADRONIZADA (Trilha Horizontal com Scroll Suave) */}
      <div className="bg-white border-b border-slate-200 shrink-0">
        <HorizontalTabNav scroll={tabScroll}>
          <div {...tabScrollProps} className={`${tabScrollProps.className} flex items-center gap-1 py-1`}>
            {[
              { id: 'odontogram', label: 'Odontograma 2D', icon: Smile },
              { id: 'treatment_plans', label: 'Planos & Orçamento', icon: DollarSign },
              { id: 'perio', label: 'Periodontia (PERIO)', icon: Activity },
              { id: 'endo', label: 'Endodontia (ENDO)', icon: Scissors },
              { id: 'prosthetics', label: 'Prótese & Laboratório', icon: Package },
              { id: 'ortho_hof', label: 'Ortodontia & HOF', icon: Sparkles },
              { id: 'anamnesis', label: 'Anamnese Odonto', icon: Shield },
              { id: 'implants', label: 'Implantes & Cirurgia', icon: CheckCircle2 },
              { id: 'photos_exams', label: 'Fotos & Exames', icon: Camera }
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
                  className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                    isActive
                      ? 'border-cyan-600 text-cyan-700 bg-cyan-50/50'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-600' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </HorizontalTabNav>
      </div>

      {/* CONTEÚDO PRINCIPAL */}
      <div className="flex-1 p-6 overflow-y-auto">
        {/* Alertas de Notificação */}
        {successMsg && (
          <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-2xl flex items-center gap-2 animate-fadeIn max-w-6xl mx-auto">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="mb-4 p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-2xl flex items-center gap-2 animate-fadeIn max-w-6xl mx-auto">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {!selectedPatientId ? (
          <ClinicalModuleEmptyState
            icon={Smile}
            colorVariant="cyan"
            description="Escolha um paciente no menu superior para visualizar o odontograma anatômico, periodontia, endodontia e condutas odontológicas."
          />
        ) : (
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Informações do Paciente Selecionado */}
            {selectedPatient && (
              <div className="p-4 bg-white border border-cyan-200 rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-800 flex items-center justify-center font-black text-sm border border-cyan-200">
                    {(selectedPatient.full_name || selectedPatient.name || 'P').charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      {selectedPatient.full_name || selectedPatient.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      CPF: {selectedPatient.cpf || '-'} • Nasc: {selectedPatient.birth_date || '-'} • Telefone: {selectedPatient.phone || '-'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!initialPatientId && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPatientId('');
                        setSelectedPatient(null);
                      }}
                      className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer mr-1"
                    >
                      Trocar Paciente
                    </button>
                  )}
                  <span className="px-3 py-1 bg-cyan-50 text-cyan-800 border border-cyan-200 rounded-full text-xs font-bold">
                    Prontuário Ativo
                  </span>
                </div>
              </div>
            )}

          {/* ========================================================================= */}
          {/* ABA 1: ODONTOGRAMA INTERATIVO */}
          {/* ========================================================================= */}
          {activeTab === 'odontogram' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Odontograma Anatômico Interativo (FDI)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Selecione as condições clínicas e clique diretamente nas faces (V, L/P, M, D, O) ou marque o dente por inteiro.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsDictationModalOpen(true)}
                    className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-indigo-600 text-white rounded-2xl text-xs font-bold hover:from-cyan-700 hover:to-indigo-700 shadow-sm flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    Ditado por IA
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveOdontogram}
                    className="px-4 py-2 bg-cyan-600 text-white rounded-2xl text-xs font-bold hover:bg-cyan-700 shadow-sm flex items-center gap-2 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Salvando...' : 'Salvar Odontograma'}
                  </button>
                </div>
              </div>

              <OdontogramCanvas
                initialData={initialOdontogramData}
                currentData={odontogramData}
                onOpenToothDossier={(toothNum) => {
                  setDossierToothNumber(toothNum);
                  setIsDossierOpen(true);
                }}
                onChange={(updated, changes) => {
                  setOdontogramData(updated);
                  setPendingToothChanges(prev => [...prev, ...changes]);
                }}
              />

              {/* Box de Finalização Rápida de Atendimento / Consulta */}
              <div className="p-6 bg-cyan-50/60 border border-cyan-200 rounded-3xl space-y-4">
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-5 h-5 text-cyan-700" />
                  <h4 className="text-sm font-black text-cyan-950">
                    Finalizar Atendimento Odontológico da Sessão
                  </h4>
                </div>
                <p className="text-xs text-cyan-800">
                  Ao finalizar, as evoluções e intervenções nos dentes são lacradas no prontuário oficial e o status do agendamento é concluído.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Evolução Clínica do Atendimento *
                    </label>
                    <textarea
                      rows={3}
                      value={consultationEvolution}
                      onChange={e => setConsultationEvolution(e.target.value)}
                      placeholder="Ex: Realizada profilaxia ultrassônica e restauração em resina composta no dente 16 (oclusal). Paciente orientado quanto à higiene interdental."
                      className="w-full p-3 bg-white border border-cyan-200 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Procedimentos Realizados e Insumos
                    </label>
                    <textarea
                      rows={3}
                      value={consultationProcedures}
                      onChange={e => setConsultationProcedures(e.target.value)}
                      placeholder="Ex: Anestesia infiltrativa com Lidocaína 2% 1:100.000 (1 tubete), isolamento relativo, resina Filtek Z350 cor A2, ajuste oclusal com carbono."
                      className="w-full p-3 bg-white border border-cyan-200 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>

                {/* CARD: INSUMOS UTILIZADOS NESTA CONSULTA */}
                <div className="p-4 bg-white border border-cyan-200 rounded-2xl space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Boxes className="w-4 h-4 text-cyan-700" />
                      <span className="text-xs font-black uppercase tracking-wider text-cyan-950">
                        Insumos Utilizados Nesta Consulta
                      </span>
                      {inventoryUsages.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-100 text-cyan-800">
                          {inventoryUsages.length}
                        </span>
                      )}
                    </div>
                    {!isAddingUsage && (
                      <button
                        type="button"
                        onClick={handleOpenAddUsage}
                        className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Adicionar Insumo
                      </button>
                    )}
                  </div>

                  {/* Formulário de Adicionar/Editar Insumo */}
                  {isAddingUsage && (
                    <div className="p-4 bg-cyan-50/50 border border-cyan-200 rounded-xl space-y-3 animate-in fade-in-50 duration-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-cyan-900">
                          {editingUsageId ? 'Editar Insumo Utilizado' : 'Novo Insumo do Estoque'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsAddingUsage(false);
                            setEditingUsageId(null);
                            setUsageError(null);
                          }}
                          className="text-slate-400 hover:text-slate-600 text-xs font-semibold cursor-pointer"
                        >
                          ✕ Fechar
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Dente / Elemento (opcional)
                          </label>
                          <input
                            type="text"
                            value={usageTooth}
                            onChange={e => setUsageTooth(e.target.value)}
                            placeholder="Ex: 16, 21, 36 ou Geral"
                            className="w-full p-2 bg-white border border-cyan-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-cyan-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Procedimento Relacionado (opcional)
                          </label>
                          <input
                            type="text"
                            value={usageProcedure}
                            onChange={e => setUsageProcedure(e.target.value)}
                            placeholder="Ex: Restauração Resina, Anestesia Infiltrativa"
                            className="w-full p-2 bg-white border border-cyan-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-cyan-500 outline-none"
                          />
                        </div>
                      </div>

                      {/* ClinicalInventorySelector do estoque central da clínica */}
                      <div>
                        <ClinicalInventorySelector
                          value={usageSelection}
                          onChange={setUsageSelection}
                          allowWithoutProduct={false}
                          defaultCategory="Odontologia"
                        />
                      </div>

                      {usageError && (
                        <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          {usageError}
                        </div>
                      )}

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setIsAddingUsage(false);
                            setEditingUsageId(null);
                            setUsageError(null);
                          }}
                          className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveUsageItem}
                          className="px-4 py-1.5 bg-cyan-700 hover:bg-cyan-800 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                        >
                          {editingUsageId ? 'Atualizar Insumo' : 'Confirmar Insumo'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Lista de Insumos Registrados */}
                  {inventoryUsages.length === 0 && !isAddingUsage ? (
                    <p className="text-xs text-slate-500 italic py-1">
                      Nenhum insumo registrado nesta consulta.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {inventoryUsages.map(usage => (
                        <div
                          key={usage.id}
                          className="p-3 bg-white border border-slate-200 hover:border-cyan-300 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-all shadow-xs"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">{usage.productName}</span>
                              {usage.status === 'deducted' && (
                                <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[10px] font-bold">
                                  Baixado
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2">
                              <span>Lote: <strong>{usage.batchLot || 'S/L'}</strong></span>
                              <span>•</span>
                              <span>Validade: <strong>{usage.expiryDate ? new Date(usage.expiryDate + 'T00:00:00').toLocaleDateString('pt-BR') : 'Sem data'}</strong></span>
                              <span>•</span>
                              <span>Utilizado: <strong className="text-cyan-800">{usage.quantity} {usage.unit}</strong></span>
                              {usage.toothNumber && (
                                <>
                                  <span>•</span>
                                  <span className="bg-cyan-50 text-cyan-800 px-1.5 py-0.2 rounded font-semibold text-[10px]">
                                    Dente {usage.toothNumber}
                                  </span>
                                </>
                              )}
                              {usage.procedureDescription && (
                                <>
                                  <span>•</span>
                                  <span className="text-slate-600 italic">{usage.procedureDescription}</span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                            {usage.status !== 'deducted' && (
                              <button
                                type="button"
                                onClick={() => handleEditUsage(usage)}
                                className="px-2.5 py-1 text-slate-600 hover:text-cyan-700 hover:bg-cyan-50 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                Editar
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={refundingUsageId === usage.id}
                              onClick={() => handleRemoveUsage(usage)}
                              className="px-2.5 py-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              {refundingUsageId === usage.id ? 'Estornando...' : 'Remover'}
                            </button>
                          </div>
                        </div>
                      ))}

                      {!isAddingUsage && (
                        <button
                          type="button"
                          onClick={handleOpenAddUsage}
                          className="w-full py-2 border-2 border-dashed border-cyan-200 hover:border-cyan-400 hover:bg-cyan-50/50 rounded-xl text-xs font-bold text-cyan-800 flex items-center justify-center gap-1.5 transition-all cursor-pointer mt-2"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Adicionar outro insumo
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-2">
                  {selectedPatientId && !completion.isCompleted && (<button
                    type="button"
                    disabled={saving}
                    onClick={handleFinishConsultation}
                    className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white rounded-2xl text-xs font-black shadow-md flex items-center gap-2 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {saving ? 'Registrando...' : 'Finalizar e Lacrar Atendimento Odontológico'}
                  </button>)}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA 2: PLANOS DE TRATAMENTO E ORÇAMENTO */}
          {/* ========================================================================= */}
          {activeTab === 'treatment_plans' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Planos de Tratamento e Orçamento Integrado
                  </h3>
                  <p className="text-xs text-slate-500">
                    Crie orçamentos detalhados por dente/face, com geração para impressão e faturamento financeiro.
                  </p>
                </div>
              </div>

              {/* Formulário de Novo Plano */}
              <div className="p-6 bg-white border border-slate-200 rounded-3xl space-y-4 shadow-sm">
                <span className="text-xs font-black uppercase text-slate-700">
                  Cadastrar Novo Orçamento / Plano
                </span>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Título do Plano / Orçamento *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Plano Restaurador e Reabilitador"
                      value={planForm.title}
                      onChange={e => setPlanForm({ ...planForm, title: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-cyan-500 focus:bg-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Condições de Pagamento
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Entrada de 50% + 2x no cartão de crédito"
                      value={planForm.paymentTerms}
                      onChange={e => setPlanForm({ ...planForm, paymentTerms: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-cyan-500 focus:bg-white outline-none"
                    />
                  </div>
                </div>

                {/* Formulário de Adicionar Procedimento */}
                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                      <Plus className="w-4 h-4 text-cyan-600" />
                      Adicionar Procedimento ao Orçamento:
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      Elemento, face e valor do procedimento
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Dente / Elemento
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 11, 16, Geral"
                        value={newPlanItem.tooth}
                        onChange={e => setNewPlanItem({ ...newPlanItem, tooth: e.target.value })}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-cyan-500 outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Face
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: O, V, M, MOD"
                        value={newPlanItem.face}
                        onChange={e => setNewPlanItem({ ...newPlanItem, face: e.target.value })}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-cyan-500 outline-none"
                      />
                    </div>

                    <div className="sm:col-span-4">
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Procedimento *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Restauração Resina, Profilaxia..."
                        value={newPlanItem.procedure}
                        onChange={e => setNewPlanItem({ ...newPlanItem, procedure: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddPlanItem();
                          }
                        }}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-cyan-500 outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Valor (R$) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0,00"
                        value={newPlanItem.value}
                        onChange={e => setNewPlanItem({ ...newPlanItem, value: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddPlanItem();
                          }
                        }}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-cyan-500 outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={handleAddPlanItem}
                        className="w-full py-2.5 px-3 bg-cyan-600 hover:bg-cyan-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Adicionar</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Botão e Formulário de Adicionar Produto/Insumo do Estoque */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingPlanProduct(!isAddingPlanProduct);
                        setPlanProductError(null);
                      }}
                      className="inline-flex items-center gap-2 px-3.5 py-2 bg-sky-50 hover:bg-sky-100/80 border border-sky-200 text-sky-900 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer w-fit"
                    >
                      <Package className="w-4 h-4 text-sky-600" />
                      <span>{isAddingPlanProduct ? 'Fechar Insumos do Estoque' : '+ Adicionar Produto / Insumo do Estoque'}</span>
                    </button>
                    <span className="text-[11px] text-slate-500">
                      Inclua produtos e insumos previstos sem debitar estoque imediatamente
                    </span>
                  </div>

                  {isAddingPlanProduct && (
                    <div className="p-4 bg-sky-50/50 border border-sky-200 rounded-2xl space-y-3 animate-in fade-in-50 duration-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-sky-950 flex items-center gap-1.5">
                          <Package className="w-4 h-4 text-sky-600" />
                          Previsão de Produto / Insumo do Estoque da Clínica
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsAddingPlanProduct(false);
                            setPlanProductError(null);
                          }}
                          className="text-slate-400 hover:text-slate-600 text-xs font-semibold cursor-pointer"
                        >
                          ✕ Fechar
                        </button>
                      </div>

                      <ClinicalInventorySelector
                        value={planProductSelection}
                        onChange={setPlanProductSelection}
                        mode="budget"
                        defaultCategory="Odontologia"
                        allowWithoutProduct={false}
                      />

                      {planProductSelection.productId && (
                        <div className="bg-white border border-sky-200 rounded-xl p-3 shadow-xs space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                            <div className="sm:col-span-3">
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Quantidade Prevista
                              </label>
                              <div className="relative">
                                <input
                                  type="number"
                                  step="any"
                                  min="0.001"
                                  value={planProductSelection.quantity}
                                  onChange={e =>
                                    setPlanProductSelection({
                                      ...planProductSelection,
                                      quantity: e.target.value === '' ? '' : Number(e.target.value)
                                    })
                                  }
                                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500"
                                />
                                <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">
                                  {planProductSelection.unit || 'un'}
                                </span>
                              </div>
                            </div>

                            <div className="sm:col-span-5">
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Valor Unitário para o Orçamento (R$)
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0,00"
                                value={planProductUnitPrice}
                                onChange={e => setPlanProductUnitPrice(e.target.value === '' ? '' : Number(e.target.value))}
                                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500"
                              />
                              <span className="block text-[10px] text-slate-400 mt-0.5">
                                Preço ao paciente (custo interno não é repassado)
                              </span>
                            </div>

                            <div className="sm:col-span-4 flex flex-col justify-end">
                              <div className="text-[11px] text-slate-500 mb-1">
                                Subtotal previsto:{' '}
                                <strong className="text-sky-900 text-xs">
                                  R${' '}
                                  {(
                                    (Number(planProductSelection.quantity) || 0) *
                                    (typeof planProductUnitPrice === 'number'
                                      ? planProductUnitPrice
                                      : Number(planProductUnitPrice) || 0)
                                  ).toFixed(2)}
                                </strong>
                              </div>
                              <button
                                type="button"
                                onClick={handleAddPlanProduct}
                                className="w-full py-2 px-3 bg-sky-600 hover:bg-sky-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <Plus className="w-4 h-4" />
                                <span>Adicionar ao Orçamento</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {planProductError && (
                        <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          {planProductError}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Composição do Orçamento (Procedimentos + Produtos) */}
                {(() => {
                  const procedureItems = planForm.items
                    .map((it, idx) => ({ it, idx }))
                    .filter(({ it }) => (it as any).itemType !== 'product');

                  const productItems = planForm.items
                    .map((it, idx) => ({ it, idx }))
                    .filter(({ it }) => (it as any).itemType === 'product');

                  return (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-slate-700">
                          Composição do Orçamento ({planForm.items.length} itens)
                        </label>
                        {planForm.items.length > 0 && (
                          <span className="text-[11px] text-slate-500">
                            {procedureItems.length} procedimento(s) • {productItems.length} insumo(s)
                          </span>
                        )}
                      </div>

                      {planForm.items.length === 0 ? (
                        <div className="p-6 bg-slate-50/70 border border-dashed border-slate-200 rounded-2xl text-center text-xs text-slate-400 italic">
                          Nenhum procedimento ou produto/insumo adicionado ao orçamento ainda. Utilize os formulários acima para compor a proposta.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* Bloco 1: PROCEDIMENTOS */}
                          <div className="space-y-1.5">
                            <span className="text-[11px] font-extrabold uppercase text-slate-600 tracking-wider flex items-center gap-1.5">
                              <Smile className="w-3.5 h-3.5 text-cyan-600" />
                              Procedimentos ({procedureItems.length})
                            </span>
                            {procedureItems.length === 0 ? (
                              <p className="text-xs text-slate-400 italic pl-2">Nenhum procedimento odontológico adicionado.</p>
                            ) : (
                              <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden bg-white shadow-xs">
                                {procedureItems.map(({ it, idx }) => {
                                  const proc = it as PlanProcedureItem;
                                  return (
                                    <div key={idx} className="p-3.5 flex items-center justify-between text-xs hover:bg-slate-50/60 transition-colors">
                                      <div className="font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                                        <span className="px-2 py-0.5 rounded bg-cyan-50 text-cyan-800 border border-cyan-200/80 font-bold text-[11px]">
                                          Dente {proc.tooth || 'Geral'} {proc.face && proc.face !== 'Geral' ? `(${proc.face})` : ''}
                                        </span>
                                        <span>{proc.procedure}</span>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <span className="font-extrabold text-cyan-900 text-sm">
                                          R$ {Number(proc.value || proc.unitPrice || 0).toFixed(2)}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleRemovePlanItem(idx)}
                                          className="text-rose-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                                          title="Remover procedimento"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Bloco 2: PRODUTOS / INSUMOS */}
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[11px] font-extrabold uppercase text-slate-600 tracking-wider flex items-center gap-1.5">
                              <Package className="w-3.5 h-3.5 text-sky-600" />
                              Produtos / Insumos Previstos ({productItems.length})
                            </span>
                            {productItems.length === 0 ? (
                              <p className="text-xs text-slate-400 italic pl-2">Nenhum produto ou insumo de estoque previsto neste orçamento.</p>
                            ) : (
                              <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden bg-white shadow-xs">
                                {productItems.map(({ it, idx }) => {
                                  const prod = it as PlanProductItem;
                                  return (
                                    <div key={idx} className="p-3.5 flex items-center justify-between text-xs hover:bg-slate-50/60 transition-colors">
                                      <div className="space-y-0.5">
                                        <div className="font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                                          <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200/80 font-bold text-[11px]">
                                            Estoque
                                          </span>
                                          <span>{prod.productName}</span>
                                          {prod.brand && (
                                            <span className="text-[11px] text-slate-400 font-normal">({prod.brand})</span>
                                          )}
                                        </div>
                                        <div className="text-[11px] text-slate-500 flex items-center gap-2">
                                          <span>Quantidade: <strong>{prod.quantity} {prod.unit}</strong></span>
                                          <span>•</span>
                                          <span>Unitário: <strong>R$ {Number(prod.unitPrice).toFixed(2)}</strong></span>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <span className="font-extrabold text-sky-900 text-sm">
                                          R$ {Number(prod.totalPrice).toFixed(2)}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleRemovePlanItem(idx)}
                                          className="text-rose-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                                          title="Remover produto do orçamento"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Observações / Notas do Orçamento */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Observações e Termos do Orçamento
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Orçamento válido por 30 dias. Valores sujeitos a alteração após o prazo."
                    value={planForm.notes}
                    onChange={e => setPlanForm({ ...planForm, notes: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-cyan-500 focus:bg-white outline-none"
                  />
                </div>

                {/* Valores */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Total Bruto (R$)</label>
                    <input
                      type="number"
                      value={planForm.totalValue}
                      onChange={e => {
                        const tot = Number(e.target.value);
                        setPlanForm({ ...planForm, totalValue: tot, finalValue: Math.max(0, tot - planForm.discountValue) });
                      }}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Desconto (R$)</label>
                    <input
                      type="number"
                      value={planForm.discountValue}
                      onChange={e => {
                        const desc = Number(e.target.value);
                        setPlanForm({ ...planForm, discountValue: desc, finalValue: Math.max(0, planForm.totalValue - desc) });
                      }}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Valor Final Líquido</label>
                    <div className="p-2.5 bg-cyan-50 border border-cyan-200 rounded-xl text-xs font-black text-cyan-900">
                      R$ {planForm.finalValue.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={saving || !selectedPatientId}
                    onClick={handleSavePlan}
                    className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white rounded-2xl text-xs font-bold shadow-md flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Salvando Orçamento...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Gerar Orçamento / Salvar
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Lista de Planos do Paciente */}
              <div className="space-y-3">
                <span className="text-xs font-extrabold uppercase text-slate-700">
                  Planos e Orçamentos Anteriores
                </span>

                {treatmentPlans.length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-3xl text-center text-xs text-slate-500 font-medium">
                    Nenhum orçamento cadastrado para este paciente.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {treatmentPlans.map(plan => (
                      <div key={plan.id} className="p-5 bg-white border border-slate-200 rounded-3xl space-y-3 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-slate-900">{plan.title}</span>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                            plan.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {plan.status === 'approved' ? 'Aprovado' : 'Aguardando Aprovação'}
                          </span>
                        </div>

                        <div className="text-xs text-slate-600 space-y-1">
                          <p><strong>Total:</strong> R$ {Number(plan.final_value).toFixed(2)}</p>
                          <p><strong>Condições:</strong> {plan.payment_terms || '-'}</p>
                          {Array.isArray(plan.items) && plan.items.length > 0 && (
                            <div className="pt-2 text-[11px] text-slate-500 border-t border-slate-100 space-y-1">
                              <span className="font-bold text-slate-700 block">Itens do Orçamento:</span>
                              <div className="space-y-0.5 max-h-28 overflow-y-auto pr-1">
                                {plan.items.map((pi: any, pIdx: number) => {
                                  const isProd = (pi.itemType || pi.item_type) === 'product' || Boolean(pi.productId);
                                  const itemPrice = Number(isProd ? (pi.totalPrice ?? (Number(pi.quantity || 1) * Number(pi.unitPrice || 0))) : (pi.value || pi.unitPrice || 0));
                                  return (
                                    <div key={pIdx} className="flex items-center justify-between text-[11px]">
                                      <span className="truncate max-w-[210px] flex items-center gap-1">
                                        <span className={`px-1 py-0.2 rounded text-[9px] font-bold ${isProd ? 'bg-sky-100 text-sky-800' : 'bg-cyan-100 text-cyan-800'}`}>
                                          {isProd ? 'Insumo' : 'Proc.'}
                                        </span>
                                        <span>{isProd ? (pi.productName || pi.description) : (pi.procedure || pi.description)}</span>
                                      </span>
                                      <span className="font-semibold text-slate-700 shrink-0">
                                        R$ {itemPrice.toFixed(2)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>

                        {plan.status !== 'approved' && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await ApiClient.put(`/v1/dentistry/treatment-plans/${plan.id}/status`, {
                                  status: 'approved',
                                  generateFinancialRecord: true
                                });
                                setSuccessMsg('Plano aprovado e integrado ao contas a receber!');
                                const res = await ApiClient.get<any[]>(`/v1/dentistry/treatment-plans/${selectedPatientId}`);
                                setTreatmentPlans(res || []);
                              } catch (err: any) {
                                setErrorMsg('Erro ao aprovar plano');
                              }
                            }}
                            className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Aprovar e Enviar para o Financeiro
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {selectedPatientId && (
                  <div className="pt-4 border-t border-slate-100">
                    <MeasurableGoalsManager
                      patientId={selectedPatientId}
                      domain="dentistry"
                      title="Metas Clínicas Odontológicas & Progresso"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA 3: PERIODONTIA (PERIO) */}
          {/* ========================================================================= */}
          {activeTab === 'perio' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Ficha Periodontal e Periodontograma
                  </h3>
                  <p className="text-xs text-slate-500">
                    Sondagem periodontal de 6 sítios (MV, V, DV, ML, L, DL), sangramento, supuração e mobilidade.
                  </p>
                </div>
              </div>

              {/* Grade de 6 Sítios com Indicadores Automatizados */}
              <Perio6SitesGrid
                onSave={async (recs) => {
                  try {
                    await ApiClient.post('/v1/dentistry/perio', {
                      patientId: selectedPatientId,
                      records: recs
                    });
                    setSuccessMsg('Periodontograma de 6 sítios salvo com sucesso!');
                  } catch (err) {
                    setErrorMsg('Erro ao salvar periodontograma');
                  }
                }}
              />

              {/* Registro Rápido de Sítio Periodontal */}
              <PeriodontalExamForm perioForm={perioForm} setPerioForm={setPerioForm} saving={saving} onSave={async () => {
                      try {
                        setSaving(true);
                        await ApiClient.post('/v1/dentistry/perio', {
                          patientId: selectedPatientId,
                          appointmentId: initialAppointmentId,
                          periodontogram: perioForm,
                          notes: perioForm.notes
                        });
                        setSuccessMsg('Registro periodontal salvo com sucesso!');
                        const res = await ApiClient.get<any[]>(`/v1/dentistry/perio/${selectedPatientId}`);
                        setPerioRecords(res || []);
                      } catch (err: any) {
                        setErrorMsg('Erro ao salvar registro periodontal');
                      } finally {
                        setSaving(false);
                      }
                    }} />

              {/* Histórico Periodontal */}
              <div className="space-y-3">
                <span className="text-xs font-extrabold uppercase text-slate-700">
                  Exames Periodontais Realizados ({perioRecords.length})
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {perioRecords.map(r => (
                    <div key={r.id} className="p-4 bg-white border border-slate-200 rounded-3xl text-xs space-y-1.5 shadow-sm">
                      <div className="flex items-center justify-between font-bold text-slate-800">
                        <span>Dente {r.periodontogram?.toothNumber || 'Geral'}</span>
                        <span className="text-[11px] text-slate-500">{new Date(r.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-slate-600">
                        Profundidade: <strong>{r.periodontogram?.probingDepth}mm</strong> | Mobilidade: {r.periodontogram?.mobility}
                      </p>
                      {r.periodontogram?.bleeding && (
                        <span className="inline-block px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-bold">
                          Sangramento Ativo
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA 4: ENDODONTIA (ENDO) */}
          {/* ========================================================================= */}
          {activeTab === 'endo' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Ficha Clínica de Endodontia (Canal)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Diagnóstico pulpar, odontometria (CAD/CRD), instrumentação, irrigação química e obturação.
                  </p>
                </div>
              </div>

              {/* Formulário Endodôntico */}
              <div className="p-6 bg-white border border-slate-200 rounded-3xl space-y-4 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Número do Dente *</label>
                    <input
                      type="number"
                      value={endoForm.toothNumber}
                      onChange={e => setEndoForm({ ...endoForm, toothNumber: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Diagnóstico Pulpar</label>
                    <select
                      value={endoForm.pulparDiagnosis}
                      onChange={e => setEndoForm({ ...endoForm, pulparDiagnosis: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold"
                    ><option value="">Não avaliado</option>
                      <option value="Polpa Normal">Polpa Normal</option>
                      <option value="Pulpite Reversível">Pulpite Reversível</option>
                      <option value="Pulpite Irreversível Sintomática">Pulpite Irreversível Sintomática</option>
                      <option value="Pulpite Irreversível Assintomática">Pulpite Irreversível Assintomática</option>
                      <option value="Necrose Pulpar">Necrose Pulpar</option>
                      <option value="Tratamento Previamente Iniciado">Tratamento Previamente Iniciado</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Diagnóstico Periapical</label>
                    <select
                      value={endoForm.periapicalDiagnosis}
                      onChange={e => setEndoForm({ ...endoForm, periapicalDiagnosis: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold"
                    ><option value="">Não avaliado</option>
                      <option value="Tecidos Periapicais Normais">Tecidos Periapicais Normais</option>
                      <option value="Periodontite Apical Sintomática">Periodontite Apical Sintomática</option>
                      <option value="Periodontite Apical Assintomática">Periodontite Apical Assintomática</option>
                      <option value="Abscesso Apical Agudo">Abscesso Apical Agudo</option>
                      <option value="Abscesso Apical Crônico">Abscesso Apical Crônico</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Comprimento de Trabalho (CRD)</label>
                    <input
                      type="text"
                      value={endoForm.workingLength}
                      onChange={e => setEndoForm({ ...endoForm, workingLength: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Instrumentação e Sistema</label>
                    <input
                      type="text"
                      value={endoForm.instrumentation}
                      onChange={e => setEndoForm({ ...endoForm, instrumentation: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Solução Irrigadora</label>
                    <input
                      type="text"
                      value={endoForm.irrigation}
                      onChange={e => setEndoForm({ ...endoForm, irrigation: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Técnica e Material de Obturação</label>
                    <input
                      type="text"
                      value={endoForm.obturation}
                      onChange={e => setEndoForm({ ...endoForm, obturation: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Medicação Intracanal (se aplicável)</label>
                    <input
                      type="text"
                      value={endoForm.intracanalMedication}
                      onChange={e => setEndoForm({ ...endoForm, intracanalMedication: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveEndo}
                    className="px-4 py-2 bg-cyan-600 text-white rounded-2xl text-xs font-bold hover:bg-cyan-700 shadow-sm flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Salvar Registro Endodôntico
                  </button>
                </div>
              </div>

              {/* Lista de Registros Endodônticos */}
              <div className="space-y-3">
                <span className="text-xs font-extrabold uppercase text-slate-700">
                  Canais Tratados ({endoRecords.length})
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {endoRecords.map(rec => (
                    <div key={rec.id} className="p-4 bg-white border border-slate-200 rounded-3xl text-xs space-y-1.5 shadow-sm">
                      <div className="flex items-center justify-between font-black text-slate-900">
                        <span>Dente {rec.tooth_number} — {rec.pulpar_diagnosis}</span>
                        <span className="text-[11px] text-slate-500">{new Date(rec.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-slate-600"><strong>CRD:</strong> {rec.working_length || '-'}</p>
                      <p className="text-slate-600"><strong>Obturação:</strong> {rec.obturation || '-'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA 5: PRÓTESE & LABORATÓRIO */}
          {/* ========================================================================= */}
          {activeTab === 'prosthetics' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Controle de Próteses e Laboratório Protético
                  </h3>
                  <p className="text-xs text-slate-500">
                    Acompanhe datas de envio, prova de cor, entrega, escala VITA e valores laboratoriais.
                  </p>
                </div>
              </div>

              {/* Painel Kanban do Laboratório Protético */}
              <DentalProstheticsKanban patientId={selectedPatientId} />

              {/* Formulário de Envio ao Laboratório */}
              <div className="p-6 bg-white border border-slate-200 rounded-3xl space-y-4 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Laboratório *</label>
                    <input
                      type="text"
                      value={prostheticForm.labName}
                      onChange={e => setProstheticForm({ ...prostheticForm, labName: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Trabalho *</label>
                    <input
                      type="text"
                      value={prostheticForm.workType}
                      onChange={e => setProstheticForm({ ...prostheticForm, workType: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Dente / Região</label>
                    <input
                      type="text"
                      value={prostheticForm.toothNumber}
                      onChange={e => setProstheticForm({ ...prostheticForm, toothNumber: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Cor da Escala (VITA)</label>
                    <input
                      type="text"
                      value={prostheticForm.shadeColor}
                      onChange={e => setProstheticForm({ ...prostheticForm, shadeColor: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Material</label>
                    <input
                      type="text"
                      value={prostheticForm.material}
                      onChange={e => setProstheticForm({ ...prostheticForm, material: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Custo Laboratório (R$)</label>
                    <input
                      type="number"
                      value={prostheticForm.costValue}
                      onChange={e => setProstheticForm({ ...prostheticForm, costValue: Number(e.target.value) })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Data de Envio</label>
                    <input
                      type="date"
                      value={prostheticForm.sentDate}
                      onChange={e => setProstheticForm({ ...prostheticForm, sentDate: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Previsão de Entrega</label>
                    <input
                      type="date"
                      value={prostheticForm.expectedDate}
                      onChange={e => setProstheticForm({ ...prostheticForm, expectedDate: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Observações e Instruções para o Laboratório</label>
                  <textarea
                    rows={2}
                    value={prostheticForm.notes}
                    onChange={e => setProstheticForm({ ...prostheticForm, notes: e.target.value })}
                    placeholder="Instruções para o protético, moldagem, término cervical, etc."
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={saving || !selectedPatientId}
                    onClick={handleSaveProsthetic}
                    className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white rounded-2xl text-xs font-bold shadow-md flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Registrando...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Registrar Envio ao Laboratório
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Lista de Próteses */}
              <div className="space-y-3">
                <span className="text-xs font-extrabold uppercase text-slate-700">
                  Trabalhos Protéticos ({prosthetics.length})
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {prosthetics.map(p => (
                    <div key={p.id} className="p-4 bg-white border border-slate-200 rounded-3xl text-xs space-y-2 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-slate-900">{p.work_type}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800">
                          {p.status}
                        </span>
                      </div>
                      <p className="text-slate-600">Lab: {p.lab_name} • Dente: {p.tooth_number || '-'}</p>
                      <p className="text-slate-600">Cor: {p.shade_color || '-'} • Custo: R$ {Number(p.cost_value || 0).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA 6: ORTODONTIA & HOF */}
          {/* ========================================================================= */}
          {activeTab === 'ortho_hof' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Ortodontia & Harmonização Orofacial (HOF)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Acompanhamento ortodôntico contínuo e registros de aplicação de toxina botulínica e preenchimento facial.
                  </p>
                </div>
              </div>

              {/* Registro HOF */}
              <div className="p-6 bg-white border border-slate-200 rounded-3xl space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-slate-700">
                    Registrar Aplicação de Harmonização Orofacial
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowHofInventoryPicker(!showHofInventoryPicker)}
                    className="text-xs font-bold text-cyan-700 hover:text-cyan-800 flex items-center gap-1.5 cursor-pointer bg-cyan-50 hover:bg-cyan-100 px-3 py-1.5 rounded-xl border border-cyan-200 transition-all"
                  >
                    <Package className="w-3.5 h-3.5" />
                    {showHofInventoryPicker ? 'Ocultar Seleção do Estoque' : 'Puxar do Estoque Central da Clínica'}
                  </button>
                </div>

                {showHofInventoryPicker && (
                  <div className="p-4 bg-cyan-50/50 border border-cyan-200 rounded-2xl space-y-2 animate-in fade-in-50 duration-200">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-cyan-900 flex items-center gap-1.5">
                        <Boxes className="w-4 h-4 text-cyan-700" />
                        Selecione o Insumo/Produto no Estoque da Clínica
                      </span>
                      <span className="text-[11px] text-cyan-700">Preenche marca, lote e quantidade automaticamente</span>
                    </div>
                    <ClinicalInventorySelector
                      value={hofInventorySelection}
                      onChange={handleHofInventoryChange}
                      allowWithoutProduct={false}
                      defaultCategory="Geral"
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Procedimento Realizado</label>
                    <input
                      type="text"
                      value={hofForm.procedureName}
                      onChange={e => setHofForm({ ...hofForm, procedureName: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Região Facial</label>
                    <input
                      type="text"
                      value={hofForm.facialRegion}
                      onChange={e => setHofForm({ ...hofForm, facialRegion: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Marca do Produto</label>
                    <input
                      type="text"
                      value={hofForm.productBrand}
                      onChange={e => setHofForm({ ...hofForm, productBrand: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Número do Lote</label>
                    <input
                      type="text"
                      value={hofForm.lotNumber}
                      onChange={e => setHofForm({ ...hofForm, lotNumber: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Unidades / Volume</label>
                    <input
                      type="text"
                      value={hofForm.unitsQuantity}
                      onChange={e => setHofForm({ ...hofForm, unitsQuantity: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveHof}
                    className="px-4 py-2 bg-cyan-600 text-white rounded-2xl text-xs font-bold hover:bg-cyan-700 shadow-sm flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Salvar Aplicação HOF
                  </button>
                </div>
              </div>

              {/* Lista HOF */}
              <div className="space-y-3">
                <span className="text-xs font-extrabold uppercase text-slate-700">
                  Histórico de Procedimentos HOF ({hofRecords.length})
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {hofRecords.map(h => (
                    <div key={h.id} className="p-4 bg-white border border-slate-200 rounded-3xl text-xs space-y-1 shadow-sm">
                      <div className="flex items-center justify-between font-black text-slate-900">
                        <span>{h.procedure_name}</span>
                        <span className="text-[11px] text-slate-500">{new Date(h.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-slate-600"><strong>Região:</strong> {h.facial_region}</p>
                      <p className="text-slate-600"><strong>Produto:</strong> {h.product_brand} (Lote: {h.lot_number || '-'}) - {h.units_quantity}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA 7: ANAMNESE ODONTOLÓGICA */}
          {/* ========================================================================= */}
          {activeTab === 'anamnesis' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Anamnese Odontológica Especializada
                  </h3>
                  <p className="text-xs text-slate-500">
                    Avaliação médica geral, risco cirúrgico, uso de bifosfonatos, alergias anestésicas e hábitos parafuncionais.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveAnamnesis}
                  className="px-4 py-2 bg-cyan-600 text-white rounded-2xl text-xs font-bold hover:bg-cyan-700 shadow-sm flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Salvar Anamnese
                </button>
              </div>

              <div className="p-6 bg-white border border-slate-200 rounded-3xl space-y-4 shadow-sm">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700">
                    Histórico de Reações a Anestésicos Locais
                  </label>
                  <textarea
                    rows={2}
                    value={anamnesis.anesthesiaHistory}
                    onChange={e => setAnamnesis({ ...anamnesis, anesthesiaHistory: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700">
                    Medicamentos em Uso Contínuo (ex: anticoagulantes, anti-hipertensivos, bifosfonatos)
                  </label>
                  <textarea
                    rows={2}
                    value={anamnesis.currentMedications}
                    onChange={e => setAnamnesis({ ...anamnesis, currentMedications: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700">
                    Cirurgias Prévias e Condições Sistêmicas
                  </label>
                  <textarea
                    rows={2}
                    value={anamnesis.previousSurgeries}
                    onChange={e => setAnamnesis({ ...anamnesis, previousSurgeries: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA 8: IMPLANTES & CIRURGIA */}
          {/* ========================================================================= */}
          {activeTab === 'implants' && (
            <DentalImplantsManager patientId={selectedPatientId} appointmentId={initialAppointmentId} />
          )}

          {/* ========================================================================= */}
          {/* ABA 9: FOTOS & EXAMES */}
          {/* ========================================================================= */}
          {activeTab === 'photos_exams' && (
            <div className="space-y-6">
              <EvolutionPhotoField
                label="Documentação Fotográfica Odontológica"
                category="dental_photos"
                patientId={selectedPatientId}
                appointmentId={initialAppointmentId}
                photos={clinicalPhotos}
                onChangePhotos={setClinicalPhotos}
              />

              {selectedPatientId && (
                <ExternalTestsManager
                  patientId={selectedPatientId}
                  moduleType="ZemdaOdonto"
                  appointmentId={initialAppointmentId}
                  accentColor="sky"
                  title="Testes, Laudos e Documentos Externos (ZemdaOdonto)"
                />
              )}
            </div>
          )}
        </div>
      )}
      </div>

      {/* Dossiê do Dente Drawer */}
      <ToothDossierDrawer
        isOpen={isDossierOpen}
        onClose={() => setIsDossierOpen(false)}
        patientId={selectedPatientId}
        toothNumber={dossierToothNumber}
      />

      {/* Ditado Odontológico por IA (GERAR -> REVISAR -> CONFIRMAR -> SALVAR) */}
      <DentalAIDictationModal
        isOpen={isDictationModalOpen}
        onClose={() => setIsDictationModalOpen(false)}
        onApply={({ parsed, target }) => {
          if (target === 'both' || target === 'evolution') {
            setConsultationEvolution(prev => prev ? `${prev}\n\n${parsed.freeEvolution}` : parsed.freeEvolution);
          }
          if (target === 'both' || target === 'structured') {
            if (parsed.procedure) {
              const detail = `${parsed.procedure}${parsed.tooth ? ` dente ${parsed.tooth}` : ''}${parsed.surfaces.length ? ` (${parsed.surfaces.join(', ')})` : ''}`;
              setConsultationProcedures(prev => prev ? `${prev}; ${detail}` : detail);
            }
            if (parsed.tooth) {
              const toothNum = parseInt(parsed.tooth);
              if (toothNum) {
                setOdontogramData(prev => ({
                  ...prev,
                  [toothNum]: {
                    ...prev[toothNum],
                    whole: parsed.procedure.toLowerCase().includes('canal') ? 'endodontics' : 'restoration_resin'
                  }
                }));
              }
            }
          }
          setSuccessMsg('Ditado estruturado aplicado com sucesso!');
        }}
      />

      {/* Sugestão de Atualização de Odontograma */}
      <ProcedureSuggestionModal
        isOpen={isProcedureSuggestionOpen}
        onClose={() => setIsProcedureSuggestionOpen(false)}
        suggestions={procedureSuggestions}
        onConfirm={(accepted) => {
          accepted.forEach(item => {
            setOdontogramData(prev => ({
              ...prev,
              [item.toothNumber]: {
                ...prev[item.toothNumber],
                whole: item.suggestedCondition
              }
            }));
          });
          setSuccessMsg(`${accepted.length} elemento(s) atualizado(s) no Odontograma!`);
        }}
      />
      {showPreviousRecordsModal && selectedPatientId && (
        <PatientPreviousRecordsModal
          isOpen={showPreviousRecordsModal}
          onClose={() => setShowPreviousRecordsModal(false)}
          patientId={selectedPatientId}
          patientName={selectedPatient?.full_name || selectedPatient?.name}
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
    </div>
  );
};
