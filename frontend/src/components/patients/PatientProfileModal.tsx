import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import {
  X,
  Clock,
  AlertTriangle,
  Pill,
  FileText,
  Activity,
  ShieldCheck,
  Download,
  Plus,
  Trash2,
  CheckCircle2,
  Search,
  FileUp,
  Copy,
  CreditCard,
  Baby,
  Calendar,
  Phone,
  Mail,
  User,
  ExternalLink,
  Printer,
  Edit3,
  Smile,
  Apple,
  Hand,
  Mic
} from 'lucide-react';
import { PrintableDocumentModal } from '../clinical/PrintableDocumentModal';
import { EditPatientModal } from './EditPatientModal';
import { ClinicalSnapshot } from '../clinical/ClinicalSnapshot';

interface PatientProfileModalProps {
  patientId: string;
  onClose: () => void;
  onUpdated?: () => void;
}

export const PatientProfileModal: React.FC<PatientProfileModalProps> = ({
  patientId,
  onClose,
  onUpdated
}) => {
  const {
    currentUser,
    isPhysiotherapist,
    isDentist,
    isZemdaOdonto,
    isNutritionist,
    isZemdaNutri,
    isOccupationalTherapist,
    isZemdaTO,
    isSpeechTherapist,
    isZemdaFono
  } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<
    'overview' | 'timeline' | 'allergies_meds' | 'records' | 'physiotherapy' | 'dentistry' | 'nutrition' | 'occupational_therapy' | 'speech_therapy' | 'anamnesis' | 'exams' | 'insurances' | 'consents'
  >('overview');

  const [loading, setLoading] = useState<boolean>(true);
  const [patientData, setPatientData] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);

  // Timeline state
  const [timeline, setTimeline] = useState<any[]>([]);
  const [timelineFilter, setTimelineFilter] = useState<string>('all');
  const [timelineSearch, setTimelineSearch] = useState<string>('');
  const [loadingTimeline, setLoadingTimeline] = useState<boolean>(false);
  const [printDoc, setPrintDoc] = useState<{ type: 'certificate' | 'prescription' | 'exam_request'; id: string } | null>(null);

  // Allergies & Meds state
  const [allergiesStatus, setAllergiesStatus] = useState<string>('not_informed');
  const [allergies, setAllergies] = useState<any[]>([]);
  const [medications, setMedications] = useState<any[]>([]);
  const [showAddAllergy, setShowAddAllergy] = useState<boolean>(false);
  const [newAllergy, setNewAllergy] = useState({ substance: '', reactionType: '', severity: 'moderate', notes: '' });
  const [showAddMed, setShowAddMed] = useState<boolean>(false);
  const [newMed, setNewMed] = useState({ medicationName: '', dosage: '', frequency: '', route: 'oral', status: 'active', prescriberName: '' });

  // Records state
  const [records, setRecords] = useState<any[]>([]);
  const [showNewRecord, setShowNewRecord] = useState<boolean>(false);
  const [newRecordData, setNewRecordData] = useState({ title: 'Evolução Clínica', clinicalEvolution: '', technicalNotes: '', isSealed: false });

  // Anamnesis state
  const [anamnesisList, setAnamnesisList] = useState<any[]>([]);
  const [showNewAnamnesis, setShowNewAnamnesis] = useState<boolean>(false);
  const [anamnesisForm, setAnamnesisForm] = useState({
    title: 'Anamnese Geral',
    chiefComplaint: '',
    historyOfPresentIllness: '',
    pastMedicalHistory: '',
    familyHistory: '',
    lifestyle: ''
  });

  // Exams state
  const [exams, setExams] = useState<any[]>([]);
  const [showUploadExam, setShowUploadExam] = useState<boolean>(false);
  const [examForm, setExamForm] = useState({ title: '', examType: 'Laboratorial', fileName: '', fileUrl: '', rawText: '' });
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [examReviewText, setExamReviewText] = useState<string>('');

  // Insurances state
  const [patientInsurances, setPatientInsurances] = useState<any[]>([]);
  const [clinicInsurances, setClinicInsurances] = useState<any[]>([]);
  const [showAddInsurance, setShowAddInsurance] = useState<boolean>(false);
  const [newInsurance, setNewInsurance] = useState({ insuranceId: '', cardNumber: '', planName: '', isPrimary: true });

  // Physiotherapy state (ZemdaFisio)
  const [physioAssessments, setPhysioAssessments] = useState<any[]>([]);
  const [physioEvolutions, setPhysioEvolutions] = useState<any[]>([]);
  const [loadingPhysio, setLoadingPhysio] = useState<boolean>(false);

  const loadPhysiotherapyData = async () => {
    try {
      setLoadingPhysio(true);
      const [assessRes, evolRes] = await Promise.all([
        ApiClient.get<any[]>(`/v1/physiotherapy/assessments/patient/${patientId}`),
        ApiClient.get<any[]>(`/v1/physiotherapy/evolutions/patient/${patientId}`)
      ]);
      setPhysioAssessments(assessRes || []);
      setPhysioEvolutions(evolRes || []);
    } catch (err) {
      console.warn('Fisioterapia não disponível para este usuário ou sem registros:', err);
    } finally {
      setLoadingPhysio(false);
    }
  };

  // Dentistry state (ZemdaOdonto)
  const [dentistryData, setDentistryData] = useState<any>(null);
  const [loadingDentistry, setLoadingDentistry] = useState<boolean>(false);
  const loadDentistryData = async () => {
    try {
      setLoadingDentistry(true);
      const res = await ApiClient.get<any>(`/v1/dentistry/odontograms/${patientId}`);
      setDentistryData(res);
    } catch (e) {
      console.warn('ZemdaOdonto: Não disponível ou sem dados:', e);
    } finally {
      setLoadingDentistry(false);
    }
  };

  // Nutrition state (ZemdaNutri)
  const [nutritionAssessments, setNutritionAssessments] = useState<any[]>([]);
  const [loadingNutri, setLoadingNutri] = useState<boolean>(false);
  const loadNutritionData = async () => {
    try {
      setLoadingNutri(true);
      const res = await ApiClient.get<any[]>(`/v1/nutrition/assessments/patient/${patientId}`);
      setNutritionAssessments(res || []);
    } catch (e) {
      console.warn('ZemdaNutri: Não disponível ou sem dados:', e);
    } finally {
      setLoadingNutri(false);
    }
  };

  // Occupational Therapy state (ZemdaTO)
  const [otAssessments, setOtAssessments] = useState<any[]>([]);
  const [loadingOT, setLoadingOT] = useState<boolean>(false);
  const loadOTData = async () => {
    try {
      setLoadingOT(true);
      const res = await ApiClient.get<any[]>(`/v1/occupational-therapy/assessments/patient/${patientId}`);
      setOtAssessments(res || []);
    } catch (e) {
      console.warn('ZemdaTO: Não disponível ou sem dados:', e);
    } finally {
      setLoadingOT(false);
    }
  };

  // Speech Therapy state (ZemdaFono)
  const [stAssessments, setStAssessments] = useState<any[]>([]);
  const [loadingST, setLoadingST] = useState<boolean>(false);
  const loadSTData = async () => {
    try {
      setLoadingST(true);
      const res = await ApiClient.get<any[]>(`/v1/speech-therapy/assessments/patient/${patientId}`);
      setStAssessments(res || []);
    } catch (e) {
      console.warn('ZemdaFono: Não disponível ou sem dados:', e);
    } finally {
      setLoadingST(false);
    }
  };

  const [consents, setConsents] = useState<any[]>([]);
  const [showNewConsent, setShowNewConsent] = useState<boolean>(false);
  const [consentForm, setConsentForm] = useState({
    title: 'Termo de Consentimento para Teleatendimento e Tratamento de Dados',
    consentType: 'telemedicine',
    content: 'Autorizo a realização de consultas e o tratamento dos meus dados de saúde estritamente para finalidades médicas e de cuidado continuado, conforme previsto na LGPD.'
  });

  const loadPatientBase = async () => {
    try {
      setLoading(true);
      const data = await ApiClient.get<any>(`/v1/patients/${patientId}`);
      setPatientData(data);
      setAllergiesStatus(data.patient?.allergies_status || 'not_informed');
    } catch (err: any) {
      showToast('Erro ao carregar perfil do paciente', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadTimeline = async () => {
    try {
      setLoadingTimeline(true);
      let url = `/v1/patients/${patientId}/timeline?`;
      if (timelineFilter !== 'all') url += `type=${timelineFilter}&`;
      if (timelineSearch) url += `search=${encodeURIComponent(timelineSearch)}`;
      const data = await ApiClient.get<any[]>(url);
      setTimeline(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingTimeline(false);
    }
  };

  const loadAllergiesAndMeds = async () => {
    try {
      const [algRes, medRes] = await Promise.all([
        ApiClient.get<any>(`/v1/patients/${patientId}/allergies`),
        ApiClient.get<any[]>(`/v1/patients/${patientId}/medications`)
      ]);
      setAllergies(algRes.allergies || []);
      setAllergiesStatus(algRes.allergiesStatus || 'not_informed');
      setMedications(medRes || []);
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadRecords = async () => {
    try {
      const data = await ApiClient.get<any[]>(`/v1/clinical-records/patient/${patientId}`);
      setRecords(data || []);
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadAnamnesis = async () => {
    try {
      const data = await ApiClient.get<any[]>(`/v1/patients/${patientId}/anamnesis`);
      setAnamnesisList(data || []);
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadExams = async () => {
    try {
      const data = await ApiClient.get<any[]>(`/v1/patients/${patientId}/exams`);
      setExams(data || []);
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadInsurances = async () => {
    try {
      const [pIns, cIns] = await Promise.all([
        ApiClient.get<any[]>(`/v1/patients/${patientId}/insurances`),
        ApiClient.get<any[]>('/v1/insurances/clinic')
      ]);
      setPatientInsurances(pIns || []);
      setClinicInsurances(cIns || []);
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadConsents = async () => {
    try {
      const data = await ApiClient.get<any[]>(`/v1/patients/${patientId}/consents`);
      setConsents(data || []);
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadPatientBase();
    loadAllergiesAndMeds();
  }, [patientId]);

  useEffect(() => {
    if (activeTab === 'timeline') loadTimeline();
    if (activeTab === 'allergies_meds') loadAllergiesAndMeds();
    if (activeTab === 'records') loadRecords();
    if (activeTab === 'physiotherapy') loadPhysiotherapyData();
    if (activeTab === 'dentistry') loadDentistryData();
    if (activeTab === 'nutrition') loadNutritionData();
    if (activeTab === 'occupational_therapy') loadOTData();
    if (activeTab === 'speech_therapy') loadSTData();
    if (activeTab === 'anamnesis') loadAnamnesis();
    if (activeTab === 'exams') loadExams();
    if (activeTab === 'insurances') loadInsurances();
    if (activeTab === 'consents') loadConsents();
  }, [activeTab, timelineFilter, timelineSearch]);

  // Alergias Handlers
  const handleUpdateAllergyStatus = async (status: string) => {
    try {
      await ApiClient.put(`/v1/patients/${patientId}/allergies-status`, { status });
      setAllergiesStatus(status);
      showToast('Status de alergia atualizado', 'success');
      loadAllergiesAndMeds();
    } catch (err: any) {
      showToast('Erro ao atualizar status', 'error');
    }
  };

  const handleAddAllergy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAllergy.substance) return;
    try {
      await ApiClient.post(`/v1/patients/${patientId}/allergies`, newAllergy);
      showToast('Alergia registrada!', 'success');
      setNewAllergy({ substance: '', reactionType: '', severity: 'moderate', notes: '' });
      setShowAddAllergy(false);
      loadAllergiesAndMeds();
    } catch (err: any) {
      showToast(err.message || 'Erro ao registrar alergia', 'error');
    }
  };

  const handleDeleteAllergy = async (id: string) => {
    if (!confirm('Deseja remover este registro de alergia?')) return;
    try {
      await ApiClient.delete(`/v1/patients/${patientId}/allergies/${id}`);
      showToast('Alergia removida', 'info');
      loadAllergiesAndMeds();
    } catch (err: any) {
      showToast('Erro ao remover alergia', 'error');
    }
  };

  // Meds Handlers
  const handleAddMedication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMed.medicationName) return;
    try {
      await ApiClient.post(`/v1/patients/${patientId}/medications`, newMed);
      showToast('Medicamento adicionado!', 'success');
      setNewMed({ medicationName: '', dosage: '', frequency: '', route: 'oral', status: 'active', prescriberName: '' });
      setShowAddMed(false);
      loadAllergiesAndMeds();
    } catch (err: any) {
      showToast('Erro ao adicionar medicamento', 'error');
    }
  };

  const handleToggleMedStatus = async (med: any) => {
    const nextStatus = med.status === 'active' ? 'suspended' : 'active';
    try {
      await ApiClient.put(`/v1/patients/${patientId}/medications/${med.id}`, { status: nextStatus });
      showToast(`Medicamento marcado como ${nextStatus === 'active' ? 'ativo' : 'suspenso'}`, 'info');
      loadAllergiesAndMeds();
    } catch (err: any) {
      showToast('Erro ao atualizar status do medicamento', 'error');
    }
  };

  // Records Handlers
  const handleCreateRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRecordData.clinicalEvolution) return;
    try {
      await ApiClient.post('/v1/clinical-records', {
        patientId,
        sessionDate: new Date().toISOString().split('T')[0],
        title: newRecordData.title,
        clinicalEvolution: newRecordData.clinicalEvolution,
        technicalNotes: newRecordData.technicalNotes,
        isSealed: newRecordData.isSealed
      });
      showToast('Evolução gravada com sucesso!', 'success');
      setNewRecordData({ title: 'Evolução Clínica', clinicalEvolution: '', technicalNotes: '', isSealed: false });
      setShowNewRecord(false);
      loadRecords();
    } catch (err: any) {
      showToast(err.message || 'Erro ao registrar evolução', 'error');
    }
  };

  // Anamnesis Handlers
  const handleSaveAnamnesis = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ApiClient.post(`/v1/patients/${patientId}/anamnesis`, {
        title: anamnesisForm.title,
        questionnaireAnswersJson: anamnesisForm
      });
      showToast('Nova versão de Anamnese salva com sucesso!', 'success');
      setShowNewAnamnesis(false);
      loadAnamnesis();
    } catch (err: any) {
      showToast('Erro ao salvar anamnese', 'error');
    }
  };

  const handleDuplicateAnamnesis = (item: any) => {
    try {
      const parsed = typeof item.questionnaire_answers_json === 'string'
        ? JSON.parse(item.questionnaire_answers_json)
        : item.questionnaire_answers_json;
      setAnamnesisForm({
        title: `Cópia da v${item.version} - ${item.title}`,
        chiefComplaint: parsed.chiefComplaint || '',
        historyOfPresentIllness: parsed.historyOfPresentIllness || '',
        pastMedicalHistory: parsed.pastMedicalHistory || '',
        familyHistory: parsed.familyHistory || '',
        lifestyle: parsed.lifestyle || ''
      });
      setShowNewAnamnesis(true);
      showToast(`Dados da versão ${item.version} clonados para novo rascunho`, 'info');
    } catch (e) {
      showToast('Erro ao clonar anamnese', 'error');
    }
  };

  // Exams Handlers
  const handleUploadExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examForm.title) return;
    try {
      await ApiClient.post(`/v1/patients/${patientId}/exams`, {
        ...examForm,
        fileUrl: examForm.fileUrl || 'data:text/plain;base64,ZXhhbWU='
      });
      showToast('Exame anexado com sucesso!', 'success');
      setExamForm({ title: '', examType: 'Laboratorial', fileName: '', fileUrl: '', rawText: '' });
      setShowUploadExam(false);
      loadExams();
    } catch (err: any) {
      showToast('Erro ao anexar exame', 'error');
    }
  };

  const handleReviewExam = async (examId: string) => {
    try {
      await ApiClient.put(`/v1/patients/${patientId}/exams/${examId}/review`, {
        aiExtractedText: examReviewText
      });
      showToast('Laudo revisado e confirmado pelo profissional!', 'success');
      setEditingExamId(null);
      loadExams();
    } catch (err: any) {
      showToast('Erro ao confirmar revisão', 'error');
    }
  };

  // Insurance Handlers
  const handleAddPatientInsurance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInsurance.insuranceId || !newInsurance.cardNumber) return;
    try {
      await ApiClient.post(`/v1/patients/${patientId}/insurances`, newInsurance);
      showToast('Convênio vinculado com sucesso!', 'success');
      setShowAddInsurance(false);
      setNewInsurance({ insuranceId: '', cardNumber: '', planName: '', isPrimary: true });
      loadInsurances();
    } catch (err: any) {
      showToast('Erro ao vincular convênio', 'error');
    }
  };

  // Consent Handlers
  const handleCreateConsent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ApiClient.post(`/v1/patients/${patientId}/consents`, {
        ...consentForm,
        signedByName: patientData?.patient?.full_name || 'Paciente'
      });
      showToast('Termo de consentimento registrado!', 'success');
      setShowNewConsent(false);
      loadConsents();
    } catch (err: any) {
      showToast('Erro ao registrar consentimento', 'error');
    }
  };

  // Export DOCX
  const handleExportDocx = () => {
    const token = localStorage.getItem('token');
    const tenantId = localStorage.getItem('tenantId');
    const url = `/api/v1/reports/export-docx?type=patient_records&patientId=${patientId}`;
    
    // Download via link com autenticação
    const a = document.createElement('a');
    a.href = url;
    a.download = `Prontuario_${patientData?.patient?.full_name || 'Paciente'}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Download do documento Word (.docx) iniciado!', 'success');
  };

  if (loading || !patientData) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl flex items-center gap-3 text-slate-700">
          <div className="w-6 h-6 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span className="font-semibold text-sm">Carregando prontuário 360°...</span>
        </div>
      </div>
    );
  }

  const { patient, guardians, recentAppointments } = patientData;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl border border-slate-200 flex flex-col max-h-[95vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Top Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 to-teal-400 flex items-center justify-center text-white font-black text-2xl shadow-md">
              {patient.full_name?.charAt(0) || 'P'}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-2xl font-bold tracking-tight text-white">{patient.full_name}</h2>
                {patient.is_child === 1 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30">
                    <Baby className="w-3.5 h-3.5" /> Pediátrico
                  </span>
                )}
                {/* Visual Alert for Allergies */}
                {allergiesStatus === 'has_allergies' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 animate-pulse">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> ALERGIAS DECLARADAS ({allergies.length})
                  </span>
                )}
                {allergiesStatus === 'none_known' && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Nenhuma alergia conhecida
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-300 mt-1 flex-wrap">
                <span>CPF: {patient.cpf || 'Não informado'}</span>
                <span>Nascimento: {patient.birth_date || '—'}</span>
                <span>Tel: {patient.phone}</span>
                {patient.email && <span>Email: {patient.email}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditModalOpen(true)}
              title="Editar Cadastro do Paciente"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-all shadow-xs cursor-pointer"
            >
              <Edit3 className="w-4 h-4 text-white" />
              Editar Paciente
            </button>
            <button
              onClick={handleExportDocx}
              title="Exportar Prontuário em Word (.docx)"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-all shadow-xs"
            >
              <Download className="w-4 h-4 text-teal-300" />
              Exportar DOCX
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 flex items-center gap-2 overflow-x-auto text-xs font-semibold text-slate-600">
          {[
            { id: 'overview', label: 'Visão Geral', icon: User },
            { id: 'timeline', label: 'Linha do Tempo 360°', icon: Clock },
            { id: 'allergies_meds', label: 'Alergias & Remédios', icon: AlertTriangle },
            { id: 'records', label: 'Prontuário & Evolução', icon: FileText },
            ...(isPhysiotherapist
              ? [{ id: 'physiotherapy', label: 'ZemdaFisio', icon: Activity }]
              : []),
            ...(isDentist || isZemdaOdonto
              ? [{ id: 'dentistry', label: 'ZemdaOdonto', icon: Smile }]
              : []),
            ...(isNutritionist || isZemdaNutri
              ? [{ id: 'nutrition', label: 'ZemdaNutri', icon: Apple }]
              : []),
            ...(isOccupationalTherapist || isZemdaTO
              ? [{ id: 'occupational_therapy', label: 'ZemdaTO', icon: Hand }]
              : []),
            ...(isSpeechTherapist || isZemdaFono
              ? [{ id: 'speech_therapy', label: 'ZemdaFono', icon: Mic }]
              : []),
            { id: 'anamnesis', label: 'Anamneses', icon: Activity },
            { id: 'exams', label: 'Exames & Laudos IA', icon: FileUp },
            { id: 'insurances', label: 'Convênios', icon: CreditCard },
            { id: 'consents', label: 'Consentimentos', icon: ShieldCheck }
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-3.5 px-3 border-b-2 font-bold transition-all whitespace-nowrap ${
                  active
                    ? 'border-indigo-600 text-indigo-600 bg-white shadow-2xs rounded-t-xl'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-indigo-600' : 'text-slate-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content Container */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {/* TAB 1: VISÃO GERAL */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Alerta de Segurança se houver alergias */}
              {allergiesStatus === 'has_allergies' && allergies.length > 0 && (
                <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 flex items-start gap-3 text-red-900 shadow-xs">
                  <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                  <div className="text-xs">
                    <strong className="text-sm font-bold text-red-800">Alerta Clínico de Segurança: Paciente com Alergias Registradas</strong>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {allergies.map(a => (
                        <span key={a.id} className="bg-white border border-red-300 px-2.5 py-1 rounded-lg text-xs font-bold text-red-700">
                          {a.substance} ({a.severity}) {a.reaction_type && `• ${a.reaction_type}`}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Informações Pessoais */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <User className="w-4 h-4 text-indigo-600" /> Cadastro & Contatos
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 font-medium">Nome Social / Preferencial:</span>
                    <p className="font-semibold text-slate-800 mt-0.5">{patient.social_name || '—'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">CPF:</span>
                    <p className="font-semibold text-slate-800 mt-0.5">{patient.cpf || 'Não informado'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Data de Nascimento:</span>
                    <p className="font-semibold text-slate-800 mt-0.5">{patient.birth_date || '—'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Telefone / WhatsApp:</span>
                    <p className="font-semibold text-slate-800 mt-0.5 flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-teal-600" /> {patient.phone}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">E-mail:</span>
                    <p className="font-semibold text-slate-800 mt-0.5 flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-indigo-600" /> {patient.email || 'Não informado'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Endereço:</span>
                    <p className="font-semibold text-slate-800 mt-0.5">
                      {patient.address ? `${patient.address} - ${patient.city || ''}/${patient.state || ''}` : 'Não informado'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Contato de Emergência:</span>
                    <p className="font-semibold text-slate-800 mt-0.5">
                      {patient.emergency_contact || '—'} {patient.emergency_phone && `(${patient.emergency_phone})`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Responsáveis Legais se Menor */}
              {patient.is_child === 1 && (
                <div className="bg-pink-50/50 p-5 rounded-2xl border border-pink-200">
                  <h3 className="text-sm font-bold text-pink-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Baby className="w-4 h-4 text-pink-600" /> Responsáveis Legais
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(guardians || []).map((g: any) => (
                      <div key={g.id} className="bg-white p-3.5 rounded-xl border border-pink-200 text-xs">
                        <div className="font-bold text-slate-900">{g.full_name} ({g.relationship})</div>
                        <div className="text-slate-500 mt-1">Telefone: {g.phone} • CPF: {g.cpf || '—'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Histórico Recente de Atendimentos */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600" /> Últimos Atendimentos
                </h3>
                {(!recentAppointments || recentAppointments.length === 0) ? (
                  <p className="text-xs text-slate-400 italic">Nenhum atendimento anterior registrado.</p>
                ) : (
                  <div className="space-y-2">
                    {recentAppointments.map((a: any) => (
                      <div key={a.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold text-slate-900">{a.service_name}</div>
                          <div className="text-slate-400 text-[11px]">{a.professional_name} • {a.start_time}</div>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          a.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                          a.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-indigo-100 text-indigo-700'
                        }`}>
                          {a.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: LINHA DO TEMPO 360° */}
          {activeTab === 'timeline' && (
            <div className="space-y-4">
              {/* Filtros e Busca */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 text-xs">
                  {[
                    { id: 'all', label: 'Todos' },
                    { id: 'appointment', label: 'Consultas' },
                    { id: 'medical_record', label: 'Prontuários' },
                    { id: 'anamnesis', label: 'Anamneses' },
                    { id: 'certificate', label: 'Atestados' },
                    { id: 'prescription', label: 'Receitas' },
                    { id: 'exam_request', label: 'Pedidos Exames' },
                    { id: 'exam_file', label: 'Laudos/Arquivos' },
                    { id: 'consent', label: 'Consentimentos' }
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setTimelineFilter(f.id)}
                      className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all ${
                        timelineFilter === f.id
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-56">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={timelineSearch}
                    onChange={e => setTimelineSearch(e.target.value)}
                    placeholder="Buscar no histórico..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Linha do Tempo */}
              {loadingTimeline ? (
                <div className="py-12 text-center text-slate-400 text-xs">Carregando histórico unificado...</div>
              ) : timeline.length === 0 ? (
                <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-slate-400 text-xs">
                  Nenhum evento clínico encontrado com os filtros selecionados.
                </div>
              ) : (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
                  {timeline.map((item, idx) => {
                    const badgeColor =
                      item.type === 'medical_record' ? 'bg-teal-500' :
                      item.type === 'appointment' ? 'bg-indigo-500' :
                      item.type === 'prescription' ? 'bg-emerald-500' :
                      item.type === 'certificate' ? 'bg-amber-500' :
                      item.type === 'exam_file' ? 'bg-blue-500' : 'bg-purple-500';

                    return (
                      <div key={idx} className="relative group">
                        <div className={`absolute -left-6 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white ring-2 ring-slate-200 ${badgeColor}`} />
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-indigo-200 transition-all">
                          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                            <span className="text-xs font-bold text-slate-900">{item.title}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-slate-400">
                                {item.date ? new Date(item.date).toLocaleDateString('pt-BR') : 'Data não informada'}
                              </span>
                              {(item.type === 'certificate' || item.type === 'prescription' || item.type === 'exam_request') && (
                                <button
                                  type="button"
                                  onClick={() => setPrintDoc({ type: item.type, id: item.id })}
                                  className="flex items-center gap-1 text-[11px] font-bold text-teal-600 hover:text-teal-700 bg-teal-50 hover:bg-teal-100 px-2 py-0.5 rounded-lg border border-teal-200 transition-all cursor-pointer"
                                  title="Visualizar, imprimir ou salvar PDF"
                                >
                                  <Printer className="w-3 h-3" />
                                  Imprimir / PDF
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>
                          <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-3">
                            <span>Profissional: <strong>{item.professionalName}</strong></span>
                            {item.details?.status && <span>Status: {item.details.status}</span>}
                            {item.details?.cancellationReason && (
                              <span className="text-red-500 font-semibold">Motivo: {item.details.cancellationReason}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ALERGIAS & MEDICAMENTOS */}
          {activeTab === 'allergies_meds' && (
            <div className="space-y-6">
              {/* Seção Alergias */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" /> Registro de Alergias
                    </h3>
                    <p className="text-xs text-slate-400">Distinção obrigatória de segurança clínica do paciente.</p>
                  </div>

                  {/* Seletor rápido de Status Geral */}
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      onClick={() => handleUpdateAllergyStatus('not_informed')}
                      className={`px-3 py-1 rounded-xl font-medium transition-all ${
                        allergiesStatus === 'not_informed'
                          ? 'bg-slate-700 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Não Informado
                    </button>
                    <button
                      onClick={() => handleUpdateAllergyStatus('none_known')}
                      className={`px-3 py-1 rounded-xl font-medium transition-all ${
                        allergiesStatus === 'none_known'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Nenhuma Alergia Conhecida
                    </button>
                    <button
                      onClick={() => {
                        handleUpdateAllergyStatus('has_allergies');
                        setShowAddAllergy(true);
                      }}
                      className={`px-3 py-1 rounded-xl font-medium transition-all ${
                        allergiesStatus === 'has_allergies'
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Possui Alergias
                    </button>
                  </div>
                </div>

                {showAddAllergy && (
                  <form onSubmit={handleAddAllergy} className="bg-red-50/50 p-4 rounded-xl border border-red-200 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Substância / Alergeno *</label>
                        <input
                          type="text"
                          required
                          value={newAllergy.substance}
                          onChange={e => setNewAllergy({ ...newAllergy, substance: e.target.value })}
                          placeholder="Ex: Penicilina, Dipirona, Látex"
                          className="w-full px-3 py-2 border rounded-xl bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Tipo de Reação</label>
                        <input
                          type="text"
                          value={newAllergy.reactionType}
                          onChange={e => setNewAllergy({ ...newAllergy, reactionType: e.target.value })}
                          placeholder="Ex: Edema de glote, Erupção cutânea"
                          className="w-full px-3 py-2 border rounded-xl bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Gravidade</label>
                        <select
                          value={newAllergy.severity}
                          onChange={e => setNewAllergy({ ...newAllergy, severity: e.target.value })}
                          className="w-full px-3 py-2 border rounded-xl bg-white font-medium"
                        >
                          <option value="mild">Leve</option>
                          <option value="moderate">Moderada</option>
                          <option value="severe">Grave / Choque Anafilático</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setShowAddAllergy(false)}
                        className="px-3 py-1.5 rounded-lg border text-slate-600 hover:bg-slate-100"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 shadow-xs"
                      >
                        Salvar Alergia
                      </button>
                    </div>
                  </form>
                )}

                {/* Lista de Alergias */}
                {allergies.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">
                    {allergiesStatus === 'none_known'
                      ? 'Nenhuma alergia relatada pelo paciente.'
                      : 'Nenhuma alergia individual cadastrada no momento.'}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {allergies.map(a => (
                      <div key={a.id} className="p-3 bg-red-50/40 border border-red-200 rounded-xl flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold text-red-900 text-sm">{a.substance}</div>
                          <div className="text-red-700 mt-0.5">
                            Reação: {a.reaction_type || 'Geral'} • Gravidade: <strong className="uppercase">{a.severity}</strong>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteAllergy(a.id)}
                          className="p-1 text-red-400 hover:text-red-700 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Seção Medicamentos em Uso */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <Pill className="w-4 h-4 text-emerald-600" /> Medicamentos em Uso & Histórico
                    </h3>
                    <p className="text-xs text-slate-400">Controle contínuo de prescrições ativas e suspensas.</p>
                  </div>
                  <button
                    onClick={() => setShowAddMed(true)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar Medicamento
                  </button>
                </div>

                {showAddMed && (
                  <form onSubmit={handleAddMedication} className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-200 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Medicamento *</label>
                        <input
                          type="text"
                          required
                          value={newMed.medicationName}
                          onChange={e => setNewMed({ ...newMed, medicationName: e.target.value })}
                          placeholder="Ex: Losartana Potássica"
                          className="w-full px-3 py-2 border rounded-xl bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Dosagem</label>
                        <input
                          type="text"
                          value={newMed.dosage}
                          onChange={e => setNewMed({ ...newMed, dosage: e.target.value })}
                          placeholder="Ex: 50mg"
                          className="w-full px-3 py-2 border rounded-xl bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Frequência</label>
                        <input
                          type="text"
                          value={newMed.frequency}
                          onChange={e => setNewMed({ ...newMed, frequency: e.target.value })}
                          placeholder="Ex: 1x ao dia pela manhã"
                          className="w-full px-3 py-2 border rounded-xl bg-white"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setShowAddMed(false)}
                        className="px-3 py-1.5 rounded-lg border text-slate-600 hover:bg-slate-100"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 shadow-xs"
                      >
                        Gravar Medicamento
                      </button>
                    </div>
                  </form>
                )}

                {medications.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Nenhum medicamento registrado para este paciente.</p>
                ) : (
                  <div className="space-y-2">
                    {medications.map(m => (
                      <div
                        key={m.id}
                        className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
                          m.status === 'active' ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200/60 opacity-60'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-slate-900 text-sm">{m.medication_name} {m.dosage && `(${m.dosage})`}</div>
                          <div className="text-slate-500 mt-0.5">
                            {m.frequency || 'Uso contínuo'} • Via: {m.route || 'Oral'} {m.prescriber_name && `• Prescritor: ${m.prescriber_name}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            m.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                          }`}>
                            {m.status === 'active' ? 'Ativo' : 'Suspenso'}
                          </span>
                          <button
                            onClick={() => handleToggleMedStatus(m)}
                            className="px-2.5 py-1 text-xs border rounded-lg text-slate-600 hover:bg-slate-100 font-medium"
                          >
                            {m.status === 'active' ? 'Suspender' : 'Reativar'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: PRONTUÁRIO & EVOLUÇÕES */}
          {activeTab === 'records' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Evoluções Médicas & Sessões</h3>
                  <p className="text-xs text-slate-400">Histórico de anotações clínicas com controle de lacre e integridade legal.</p>
                </div>
                <button
                  onClick={() => setShowNewRecord(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> Nova Evolução
                </button>
              </div>

              {showNewRecord && (
                <form onSubmit={handleCreateRecord} className="bg-white p-5 rounded-2xl border border-indigo-200 shadow-sm space-y-4 text-xs">
                  <h4 className="font-bold text-slate-900 text-sm">Registrar Nova Evolução Clínica</h4>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Título da Sessão</label>
                    <input
                      type="text"
                      required
                      value={newRecordData.title}
                      onChange={e => setNewRecordData({ ...newRecordData, title: e.target.value })}
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Evolução Clínica do Paciente *</label>
                    <textarea
                      required
                      rows={5}
                      value={newRecordData.clinicalEvolution}
                      onChange={e => setNewRecordData({ ...newRecordData, clinicalEvolution: e.target.value })}
                      placeholder="Descreva o quadro do paciente, condutas, hipóteses diagnósticas e resposta terapêutica..."
                      className="w-full px-3 py-2 border rounded-xl font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Notas Técnicas / Internas (Opcional)</label>
                    <input
                      type="text"
                      value={newRecordData.technicalNotes}
                      onChange={e => setNewRecordData({ ...newRecordData, technicalNotes: e.target.value })}
                      placeholder="Orientações e apontamentos privativos da equipe"
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="sealRecord"
                      checked={newRecordData.isSealed}
                      onChange={e => setNewRecordData({ ...newRecordData, isSealed: e.target.checked })}
                      className="rounded text-indigo-600"
                    />
                    <label htmlFor="sealRecord" className="text-slate-700 font-medium">
                      Lacrar prontuário (Impede edição posterior para garantia de conformidade legal)
                    </label>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowNewRecord(false)}
                      className="px-3 py-1.5 rounded-lg border text-slate-600 hover:bg-slate-100"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-xs"
                    >
                      Salvar Evolução
                    </button>
                  </div>
                </form>
              )}

              {records.length === 0 ? (
                <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-slate-400 text-xs">
                  Nenhum prontuário registrado até o momento.
                </div>
              ) : (
                <div className="space-y-3">
                  {records.map(r => (
                    <div key={r.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2 text-xs">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <div>
                          <span className="font-bold text-slate-900 text-sm">{r.title}</span>
                          <span className="text-slate-400 ml-2">({r.session_date})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {r.is_sealed === 1 && (
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              Lacrado
                            </span>
                          )}
                          <span className="text-slate-500 font-medium">
                            {r.professional_name} ({r.registration_type || 'CRM'} {r.registration_number || ''})
                          </span>
                        </div>
                      </div>
                      <div className="text-slate-700 whitespace-pre-wrap leading-relaxed py-1">
                        {r.clinical_evolution || 'Sem anotações de evolução.'}
                      </div>
                      {r.technical_notes && (
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-slate-500 italic">
                          Notas Técnicas: {r.technical_notes}
                        </div>
                      )}
                      <div className="pt-2 border-t border-slate-100">
                        <ClinicalSnapshot record={r} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: ANAMNESES */}
          {activeTab === 'anamnesis' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Questionários de Anamnese</h3>
                  <p className="text-xs text-slate-400">Histórico de versões preenchidas com controle cronológico e reutilização.</p>
                </div>
                <button
                  onClick={() => setShowNewAnamnesis(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> Nova Versão
                </button>
              </div>

              {showNewAnamnesis && (
                <form onSubmit={handleSaveAnamnesis} className="bg-white p-5 rounded-2xl border border-indigo-200 shadow-sm space-y-3 text-xs">
                  <h4 className="font-bold text-slate-900 text-sm">Preencher Nova Versão de Anamnese</h4>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Título do Questionário</label>
                    <input
                      type="text"
                      required
                      value={anamnesisForm.title}
                      onChange={e => setAnamnesisForm({ ...anamnesisForm, title: e.target.value })}
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Queixa Principal</label>
                    <textarea
                      rows={2}
                      value={anamnesisForm.chiefComplaint}
                      onChange={e => setAnamnesisForm({ ...anamnesisForm, chiefComplaint: e.target.value })}
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">História da Moléstia Atual (HMA)</label>
                    <textarea
                      rows={3}
                      value={anamnesisForm.historyOfPresentIllness}
                      onChange={e => setAnamnesisForm({ ...anamnesisForm, historyOfPresentIllness: e.target.value })}
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Histórico Patológico Pregresso</label>
                      <textarea
                        rows={2}
                        value={anamnesisForm.pastMedicalHistory}
                        onChange={e => setAnamnesisForm({ ...anamnesisForm, pastMedicalHistory: e.target.value })}
                        className="w-full px-3 py-2 border rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Histórico Familiar & Hábitos</label>
                      <textarea
                        rows={2}
                        value={anamnesisForm.lifestyle}
                        onChange={e => setAnamnesisForm({ ...anamnesisForm, lifestyle: e.target.value })}
                        className="w-full px-3 py-2 border rounded-xl"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowNewAnamnesis(false)}
                      className="px-3 py-1.5 rounded-lg border text-slate-600 hover:bg-slate-100"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-xs"
                    >
                      Salvar Versão
                    </button>
                  </div>
                </form>
              )}

              {anamnesisList.length === 0 ? (
                <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-slate-400 text-xs">
                  Nenhuma anamnese arquivada para este paciente.
                </div>
              ) : (
                <div className="space-y-3">
                  {anamnesisList.map(item => {
                    const parsed = typeof item.questionnaire_answers_json === 'string'
                      ? JSON.parse(item.questionnaire_answers_json)
                      : item.questionnaire_answers_json;

                    return (
                      <div key={item.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3 text-xs">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-md text-[11px]">
                              Versão {item.version}
                            </span>
                            <strong className="text-slate-900 text-sm">{item.title}</strong>
                            <span className="text-slate-400">({item.created_at?.split('T')[0]})</span>
                          </div>
                          <button
                            onClick={() => handleDuplicateAnamnesis(item)}
                            className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold text-xs"
                          >
                            <Copy className="w-3.5 h-3.5" /> Usar como base para nova versão
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-700">
                          {parsed.chiefComplaint && (
                            <div>
                              <span className="text-slate-400 font-bold">Queixa Principal:</span>
                              <p className="mt-0.5 font-medium">{parsed.chiefComplaint}</p>
                            </div>
                          )}
                          {parsed.historyOfPresentIllness && (
                            <div>
                              <span className="text-slate-400 font-bold">HMA:</span>
                              <p className="mt-0.5 font-medium">{parsed.historyOfPresentIllness}</p>
                            </div>
                          )}
                          {parsed.pastMedicalHistory && (
                            <div>
                              <span className="text-slate-400 font-bold">Histórico Pregresso:</span>
                              <p className="mt-0.5 font-medium">{parsed.pastMedicalHistory}</p>
                            </div>
                          )}
                          {parsed.lifestyle && (
                            <div>
                              <span className="text-slate-400 font-bold">Hábitos e Família:</span>
                              <p className="mt-0.5 font-medium">{parsed.lifestyle}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: EXAMES & LAUDOS COM DRAFT DE IA */}
          {activeTab === 'exams' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Exames e Imagens Anexadas</h3>
                  <p className="text-xs text-slate-400">Análise e extração automática de dados como rascunho para validação do profissional.</p>
                </div>
                <button
                  onClick={() => setShowUploadExam(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs"
                >
                  <FileUp className="w-3.5 h-3.5" /> Anexar Exame
                </button>
              </div>

              {showUploadExam && (
                <form onSubmit={handleUploadExam} className="bg-white p-5 rounded-2xl border border-indigo-200 shadow-sm space-y-3 text-xs">
                  <h4 className="font-bold text-slate-900 text-sm">Upload de Exame / Laudo</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Título do Exame *</label>
                      <input
                        type="text"
                        required
                        value={examForm.title}
                        onChange={e => setExamForm({ ...examForm, title: e.target.value })}
                        placeholder="Ex: Hemograma Completo, Tomografia de Tórax"
                        className="w-full px-3 py-2 border rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Tipo de Exame</label>
                      <select
                        value={examForm.examType}
                        onChange={e => setExamForm({ ...examForm, examType: e.target.value })}
                        className="w-full px-3 py-2 border rounded-xl"
                      >
                        <option value="Laboratorial">Laboratorial</option>
                        <option value="Imagem">Imagem / Raio-X / Ultrassom</option>
                        <option value="Eletrocardiograma">Cardiológico</option>
                        <option value="Outro">Outro</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Nome do Arquivo / Referência</label>
                    <input
                      type="text"
                      value={examForm.fileName}
                      onChange={e => setExamForm({ ...examForm, fileName: e.target.value })}
                      placeholder="Ex: laudo_laboratorio_central.pdf"
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Texto Extraído ou Copiado (Opcional - a IA processará em rascunho)</label>
                    <textarea
                      rows={3}
                      value={examForm.rawText}
                      onChange={e => setExamForm({ ...examForm, rawText: e.target.value })}
                      placeholder="Cole aqui o texto do laudo caso possua para indexação automática..."
                      className="w-full px-3 py-2 border rounded-xl font-mono text-xs"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowUploadExam(false)}
                      className="px-3 py-1.5 rounded-lg border text-slate-600 hover:bg-slate-100"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-xs"
                    >
                      Anexar Exame
                    </button>
                  </div>
                </form>
              )}

              {exams.length === 0 ? (
                <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-slate-400 text-xs">
                  Nenhum exame anexado para este paciente.
                </div>
              ) : (
                <div className="space-y-3">
                  {exams.map(ex => (
                    <div key={ex.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3 text-xs">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <div>
                          <strong className="text-slate-900 text-sm">{ex.title}</strong>
                          <span className="text-slate-400 ml-2">({ex.exam_type}) • {ex.exam_date}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {ex.ai_reviewed === 1 ? (
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Validado pelo Médico
                            </span>
                          ) : (
                            <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              Rascunho IA (Pendente de Validação)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Caixa de Laudo da IA */}
                      {editingExamId === ex.id ? (
                        <div className="space-y-2">
                          <label className="block text-slate-700 font-bold">Editar e Validar Extração de Laudo</label>
                          <textarea
                            rows={4}
                            value={examReviewText}
                            onChange={e => setExamReviewText(e.target.value)}
                            className="w-full px-3 py-2 border rounded-xl font-mono text-xs"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setEditingExamId(null)}
                              className="px-3 py-1 text-slate-600 border rounded-lg hover:bg-slate-100"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => handleReviewExam(ex.id)}
                              className="px-3 py-1 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700"
                            >
                              Confirmar Validação Médica
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-slate-700">
                          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                            Conteúdo / Extração Digital
                          </div>
                          <p className="whitespace-pre-wrap font-mono text-xs">{ex.ai_extracted_text || 'Sem texto extraído.'}</p>
                          {ex.ai_reviewed === 0 && (
                            <button
                              onClick={() => {
                                setEditingExamId(ex.id);
                                setExamReviewText(ex.ai_extracted_text || '');
                              }}
                              className="mt-2 text-indigo-600 hover:text-indigo-800 font-bold text-xs"
                            >
                              Revisar e Validar Rascunho
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 7: CONVÊNIOS */}
          {activeTab === 'insurances' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Convênios do Paciente</h3>
                  <p className="text-xs text-slate-400">Planos de saúde aceitos pela clínica e associados a este paciente.</p>
                </div>
                <button
                  onClick={() => setShowAddInsurance(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> Vincular Convênio
                </button>
              </div>

              {showAddInsurance && (
                <form onSubmit={handleAddPatientInsurance} className="bg-white p-5 rounded-2xl border border-indigo-200 shadow-sm space-y-3 text-xs">
                  <h4 className="font-bold text-slate-900 text-sm">Vincular Carteirinha de Convênio</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Convênio *</label>
                      <select
                        required
                        value={newInsurance.insuranceId}
                        onChange={e => setNewInsurance({ ...newInsurance, insuranceId: e.target.value })}
                        className="w-full px-3 py-2 border rounded-xl"
                      >
                        <option value="">Selecione o Convênio...</option>
                        {clinicInsurances.map(ci => (
                          <option key={ci.id} value={ci.id}>
                            {ci.name} {ci.ans_code && `(ANS: ${ci.ans_code})`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Número da Carteirinha *</label>
                      <input
                        type="text"
                        required
                        value={newInsurance.cardNumber}
                        onChange={e => setNewInsurance({ ...newInsurance, cardNumber: e.target.value })}
                        placeholder="Ex: 002194820194"
                        className="w-full px-3 py-2 border rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Plano / Categoria</label>
                      <input
                        type="text"
                        value={newInsurance.planName}
                        onChange={e => setNewInsurance({ ...newInsurance, planName: e.target.value })}
                        placeholder="Ex: Especial Apartamento"
                        className="w-full px-3 py-2 border rounded-xl"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isPrimaryIns"
                      checked={newInsurance.isPrimary}
                      onChange={e => setNewInsurance({ ...newInsurance, isPrimary: e.target.checked })}
                      className="rounded text-indigo-600"
                    />
                    <label htmlFor="isPrimaryIns" className="text-slate-700 font-medium">
                      Definir como convênio principal
                    </label>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddInsurance(false)}
                      className="px-3 py-1.5 rounded-lg border text-slate-600 hover:bg-slate-100"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-xs"
                    >
                      Vincular
                    </button>
                  </div>
                </form>
              )}

              {patientInsurances.length === 0 ? (
                <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-slate-400 text-xs">
                  Nenhum convênio vinculado. Paciente atendido como Particular.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {patientInsurances.map(pi => (
                    <div key={pi.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <strong className="text-slate-900 text-sm">{pi.insurance_name}</strong>
                        {pi.is_primary === 1 && (
                          <span className="bg-teal-100 text-teal-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            Principal
                          </span>
                        )}
                      </div>
                      <div className="text-slate-600">Carteirinha: <strong className="font-mono">{pi.card_number}</strong></div>
                      {pi.plan_name && <div className="text-slate-400">Plano: {pi.plan_name}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 8: CONSENTIMENTOS */}
          {activeTab === 'consents' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Termos de Consentimento (LGPD)</h3>
                  <p className="text-xs text-slate-400">Autorizações explícitas para telemedicina e tratamento de dados sensíveis.</p>
                </div>
                <button
                  onClick={() => setShowNewConsent(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> Registrar Consentimento
                </button>
              </div>

              {showNewConsent && (
                <form onSubmit={handleCreateConsent} className="bg-white p-5 rounded-2xl border border-indigo-200 shadow-sm space-y-3 text-xs">
                  <h4 className="font-bold text-slate-900 text-sm">Registrar Termo Assinado</h4>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Título do Termo</label>
                    <input
                      type="text"
                      required
                      value={consentForm.title}
                      onChange={e => setConsentForm({ ...consentForm, title: e.target.value })}
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Conteúdo do Consentimento</label>
                    <textarea
                      rows={4}
                      value={consentForm.content}
                      onChange={e => setConsentForm({ ...consentForm, content: e.target.value })}
                      className="w-full px-3 py-2 border rounded-xl font-mono text-xs"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowNewConsent(false)}
                      className="px-3 py-1.5 rounded-lg border text-slate-600 hover:bg-slate-100"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-xs"
                    >
                      Registrar
                    </button>
                  </div>
                </form>
              )}

              {consents.length === 0 ? (
                <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-slate-400 text-xs">
                  Nenhum termo de consentimento registrado até o momento.
                </div>
              ) : (
                <div className="space-y-3">
                  {consents.map(cs => (
                    <div key={cs.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2 text-xs">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <strong className="text-slate-900 text-sm">{cs.title}</strong>
                        <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md">
                          Assinado em {cs.signed_at ? new Date(cs.signed_at).toLocaleDateString('pt-BR') : '—'}
                        </span>
                      </div>
                      <p className="text-slate-600 font-mono text-xs">{cs.content}</p>
                      <div className="text-[11px] text-slate-400">Assinante: {cs.signed_by_name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: ZEMDAFISIO (FISIOTERAPIA) */}
          {activeTab === 'physiotherapy' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-teal-500/10 via-emerald-500/5 to-transparent p-5 rounded-2xl border border-teal-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-teal-950">ZemdaFisio — Prontuário de Fisioterapia</h3>
                      <span className="bg-teal-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Especializado
                      </span>
                    </div>
                    <p className="text-xs text-teal-700 mt-1">
                      Avaliações funcionais, escalas de dor (EVA), goniometria, testes musculares e evoluções de sessão deste paciente.
                    </p>
                  </div>
                  <button
                    onClick={loadPhysiotherapyData}
                    className="self-start sm:self-auto px-3 py-1.5 text-xs font-semibold text-teal-700 bg-white hover:bg-teal-50 border border-teal-200 rounded-xl transition-all shadow-xs cursor-pointer"
                  >
                    Atualizar Dados
                  </button>
                </div>
              </div>

              {/* Avaliações Funcionais */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Activity className="w-4 h-4 text-teal-600" />
                    Avaliações Fisioterapêuticas ({physioAssessments.length})
                  </h4>
                </div>

                {loadingPhysio ? (
                  <div className="bg-white p-8 text-center rounded-2xl border border-slate-200 text-xs text-slate-400">
                    Carregando avaliações de fisioterapia...
                  </div>
                ) : physioAssessments.length === 0 ? (
                  <div className="bg-white p-6 text-center rounded-2xl border border-slate-200 text-xs text-slate-400">
                    Nenhuma avaliação fisioterapêutica registrada para este paciente. As avaliações são criadas no módulo <strong>ZemdaFisio</strong>.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {physioAssessments.map((item: any) => (
                      <div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-200 hover:border-teal-300 shadow-xs transition-all space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-teal-600" />
                            {item.assessment_date ? new Date(item.assessment_date).toLocaleDateString('pt-BR') : 'Data n/d'}
                          </span>
                          {item.pain_eva_score !== null && item.pain_eva_score !== undefined && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              Dor EVA: {item.pain_eva_score}/10
                            </span>
                          )}
                        </div>

                        {item.clinical_diagnosis && (
                          <p className="text-slate-700">
                            <strong>Diagnóstico Clínico:</strong> {item.clinical_diagnosis}
                          </p>
                        )}
                        {item.physiotherapy_diagnosis && (
                          <p className="text-teal-900 bg-teal-50/70 p-2 rounded-lg border border-teal-100">
                            <strong>Diagnóstico Fisioterapêutico:</strong> {item.physiotherapy_diagnosis}
                          </p>
                        )}
                        {item.chief_complaint && (
                          <p className="text-slate-500 line-clamp-2">
                            <strong>Queixa Principal:</strong> {item.chief_complaint}
                          </p>
                        )}

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                          <span>Profissional: <strong>{item.professional_name || 'Fisioterapeuta'}</strong></span>
                          <span>CREFITO: {item.crefito_number || '—'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Evoluções de Sessão */}
              <div className="space-y-3 pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    Evoluções de Sessão ({physioEvolutions.length})
                  </h4>
                </div>

                {loadingPhysio ? (
                  <div className="bg-white p-8 text-center rounded-2xl border border-slate-200 text-xs text-slate-400">
                    Carregando evoluções de sessão...
                  </div>
                ) : physioEvolutions.length === 0 ? (
                  <div className="bg-white p-6 text-center rounded-2xl border border-slate-200 text-xs text-slate-400">
                    Nenhuma evolução de sessão registrada para este paciente.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {physioEvolutions.map((ev: any) => (
                      <div key={ev.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2 text-xs">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">
                              {ev.session_number ? `Sessão #${ev.session_number}` : 'Sessão de Fisioterapia'}
                            </span>
                            <span className="text-slate-400 text-[11px]">
                              {ev.session_date ? new Date(ev.session_date).toLocaleDateString('pt-BR') : '—'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {ev.pain_eva_pre !== null && ev.pain_eva_pre !== undefined && (
                              <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold border border-red-200">
                                Pré: {ev.pain_eva_pre}/10
                              </span>
                            )}
                            {ev.pain_eva_post !== null && ev.pain_eva_post !== undefined && (
                              <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-200">
                                Pós: {ev.pain_eva_post}/10
                              </span>
                            )}
                          </div>
                        </div>

                        {ev.subjective_evolution && (
                          <div className="text-slate-700">
                            <span className="font-semibold text-slate-900">Relato do Paciente:</span> {ev.subjective_evolution}
                          </div>
                        )}
                        {ev.objective_conduct && (
                          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-slate-700">
                            <span className="font-semibold text-slate-900">Conduta Aplicada:</span> {ev.objective_conduct}
                          </div>
                        )}
                        {ev.patient_response && (
                          <div className="text-slate-500">
                            <span className="font-semibold text-slate-700">Resposta / Tolerância:</span> {ev.patient_response}
                          </div>
                        )}

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                          <span>Fisioterapeuta: <strong>{ev.professional_name || 'Profissional'}</strong></span>
                          {ev.specialty_name && <span>Especialidade: {ev.specialty_name}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: ZEMDAODONTO (ODONTOLOGIA) */}
          {activeTab === 'dentistry' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-cyan-500/10 via-sky-500/5 to-transparent p-5 rounded-2xl border border-cyan-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-cyan-950">ZemdaOdonto — Prontuário Odontológico</h3>
                      <span className="bg-cyan-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Especializado
                      </span>
                    </div>
                    <p className="text-xs text-cyan-700 mt-1">
                      Odontograma anatômico FDI permanente, status por dente, histórico de cáries, restaurações e snapshots.
                    </p>
                  </div>
                  <button
                    onClick={loadDentistryData}
                    className="self-start sm:self-auto px-3 py-1.5 text-xs font-semibold text-cyan-700 bg-white hover:bg-cyan-50 border border-cyan-200 rounded-xl transition-all shadow-xs cursor-pointer"
                  >
                    Atualizar Odontograma
                  </button>
                </div>
              </div>

              {loadingDentistry ? (
                <div className="bg-white p-8 text-center rounded-2xl border border-slate-200 text-xs text-slate-400">
                  Carregando dados odontológicos...
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <Smile className="w-4 h-4 text-cyan-600" />
                      Status do Odontograma Permanente
                    </h4>
                    {dentistryData?.current?.status_data ? (
                      <div className="space-y-2 text-xs">
                        <p className="text-slate-600">
                          Odontograma ativo atualizado em {dentistryData.current.updated_at ? new Date(dentistryData.current.updated_at).toLocaleString('pt-BR') : 'recente'}.
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                          <div className="p-3 bg-cyan-50 rounded-xl border border-cyan-100 text-cyan-950 text-center">
                            <span className="text-[10px] uppercase font-bold block text-cyan-600">Dentes Mapeados</span>
                            <span className="text-lg font-black">{Object.keys(dentistryData.current.status_data).length}</span>
                          </div>
                          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-900 text-center">
                            <span className="text-[10px] uppercase font-bold block text-slate-500">Snapshots Históricos</span>
                            <span className="text-lg font-black">{dentistryData.snapshots?.length || 0}</span>
                          </div>
                          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 text-emerald-950 text-center">
                            <span className="text-[10px] uppercase font-bold block text-emerald-600">Procedimentos</span>
                            <span className="text-lg font-black">{dentistryData.procedures?.length || 0}</span>
                          </div>
                          <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 text-amber-950 text-center">
                            <span className="text-[10px] uppercase font-bold block text-amber-600">Histórico de Dentes</span>
                            <span className="text-lg font-black">{dentistryData.toothHistory?.length || 0}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">
                        Nenhum odontograma registrado ainda. Realize uma consulta no módulo <strong>ZemdaOdonto</strong> para registrar.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: ZEMDANUTRI (NUTRIÇÃO) */}
          {activeTab === 'nutrition' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-lime-500/10 via-emerald-500/5 to-transparent p-5 rounded-2xl border border-lime-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-lime-950">ZemdaNutri — Prontuário Nutricional</h3>
                      <span className="bg-lime-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Especializado
                      </span>
                    </div>
                    <p className="text-xs text-lime-700 mt-1">
                      Avaliações antropométricas, bioimpedância, evolução de IMC, recordatórios e planos alimentares.
                    </p>
                  </div>
                  <button
                    onClick={loadNutritionData}
                    className="self-start sm:self-auto px-3 py-1.5 text-xs font-semibold text-lime-700 bg-white hover:bg-lime-50 border border-lime-200 rounded-xl transition-all shadow-xs cursor-pointer"
                  >
                    Atualizar Dados
                  </button>
                </div>
              </div>

              {loadingNutri ? (
                <div className="bg-white p-8 text-center rounded-2xl border border-slate-200 text-xs text-slate-400">
                  Carregando avaliações nutricionais...
                </div>
              ) : nutritionAssessments.length === 0 ? (
                <div className="bg-white p-6 text-center rounded-2xl border border-slate-200 text-xs text-slate-400">
                  Nenhuma avaliação nutricional registrada. Registre consultas no módulo <strong>ZemdaNutri</strong>.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {nutritionAssessments.map((item: any) => (
                    <div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-200 hover:border-lime-300 shadow-xs transition-all space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-lime-600" />
                          {item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : 'Data n/d'}
                        </span>
                        {item.bmi && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-lime-50 text-lime-800 border border-lime-200">
                            IMC: {item.bmi} kg/m²
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-1 text-slate-700">
                        {item.weight && <div><strong>Peso:</strong> {item.weight} kg</div>}
                        {item.height && <div><strong>Altura:</strong> {item.height} cm</div>}
                        {item.waist_circ && <div><strong>Cintura:</strong> {item.waist_circ} cm</div>}
                        {item.hip_circ && <div><strong>Quadril:</strong> {item.hip_circ} cm</div>}
                        {item.body_fat_pct && <div><strong>% Gordura:</strong> {item.body_fat_pct}%</div>}
                      </div>

                      {item.notes && (
                        <p className="text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100 line-clamp-2">
                          {item.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: ZEMDATO (TERAPIA OCUPACIONAL) */}
          {activeTab === 'occupational_therapy' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent p-5 rounded-2xl border border-amber-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-amber-950">ZemdaTO — Prontuário de Terapia Ocupacional</h3>
                      <span className="bg-amber-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Especializado
                      </span>
                    </div>
                    <p className="text-xs text-amber-700 mt-1">
                      Escala funcional de 6 níveis de independência, perfil sensorial, treino de AVDs e Plano Terapêutico Singular.
                    </p>
                  </div>
                  <button
                    onClick={loadOTData}
                    className="self-start sm:self-auto px-3 py-1.5 text-xs font-semibold text-amber-700 bg-white hover:bg-amber-50 border border-amber-200 rounded-xl transition-all shadow-xs cursor-pointer"
                  >
                    Atualizar Dados
                  </button>
                </div>
              </div>

              {loadingOT ? (
                <div className="bg-white p-8 text-center rounded-2xl border border-slate-200 text-xs text-slate-400">
                  Carregando avaliações de Terapia Ocupacional...
                </div>
              ) : otAssessments.length === 0 ? (
                <div className="bg-white p-6 text-center rounded-2xl border border-slate-200 text-xs text-slate-400">
                  Nenhuma avaliação de TO registrada para este paciente. Registre sessões no módulo <strong>ZemdaTO</strong>.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {otAssessments.map((item: any) => (
                    <div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-200 hover:border-amber-300 shadow-xs transition-all space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-amber-600" />
                          {item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : 'Data n/d'}
                        </span>
                        {item.total_score && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            Pontuação: {item.total_score}
                          </span>
                        )}
                      </div>
                      {item.scale_type && (
                        <p className="text-slate-800 font-semibold">
                          Escala: {item.scale_type}
                        </p>
                      )}
                      {item.summary && (
                        <p className="text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                          {item.summary}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: ZEMDAFONO (FONOAUDIOLOGIA) */}
          {activeTab === 'speech_therapy' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-purple-500/10 via-violet-500/5 to-transparent p-5 rounded-2xl border border-purple-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-purple-950">ZemdaFono — Prontuário de Fonoaudiologia</h3>
                      <span className="bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Especializado
                      </span>
                    </div>
                    <p className="text-xs text-purple-700 mt-1">
                      Avaliações fonêmicas, análise vocal RASATI, motricidade orofacial, fluência e plano fonoaudiológico.
                    </p>
                  </div>
                  <button
                    onClick={loadSTData}
                    className="self-start sm:self-auto px-3 py-1.5 text-xs font-semibold text-purple-700 bg-white hover:bg-purple-50 border border-purple-200 rounded-xl transition-all shadow-xs cursor-pointer"
                  >
                    Atualizar Dados
                  </button>
                </div>
              </div>

              {loadingST ? (
                <div className="bg-white p-8 text-center rounded-2xl border border-slate-200 text-xs text-slate-400">
                  Carregando avaliações fonoaudiológicas...
                </div>
              ) : stAssessments.length === 0 ? (
                <div className="bg-white p-6 text-center rounded-2xl border border-slate-200 text-xs text-slate-400">
                  Nenhuma avaliação fonoaudiológica registrada para este paciente. Registre sessões no módulo <strong>ZemdaFono</strong>.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {stAssessments.map((item: any) => (
                    <div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-200 hover:border-purple-300 shadow-xs transition-all space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-purple-600" />
                          {item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : 'Data n/d'}
                        </span>
                        {item.assessment_type && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
                            {item.assessment_type}
                          </span>
                        )}
                      </div>
                      {item.findings && (
                        <p className="text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-100">
                          <strong>Achados:</strong> {item.findings}
                        </p>
                      )}
                      {item.conduct && (
                        <p className="text-purple-900 bg-purple-50/50 p-2 rounded-lg border border-purple-100">
                          <strong>Conduta:</strong> {item.conduct}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Documento A4 (Visualizar / Imprimir / Baixar PDF) */}
      {printDoc && (
        <PrintableDocumentModal
          documentType={printDoc.type}
          documentId={printDoc.id}
          onClose={() => setPrintDoc(null)}
        />
      )}

      {/* Modal de Edição do Cadastro do Paciente */}
      {isEditModalOpen && (
        <EditPatientModal
          isOpen={isEditModalOpen}
          patientId={patientId}
          initialData={patientData?.patient}
          onClose={() => setIsEditModalOpen(false)}
          onSuccess={() => {
            loadPatientBase();
            if (onUpdated) onUpdated();
          }}
        />
      )}
    </div>
  );
};
