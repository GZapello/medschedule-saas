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
  ExternalLink
} from 'lucide-react';

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
  const { currentUser } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<
    'overview' | 'timeline' | 'allergies_meds' | 'records' | 'anamnesis' | 'exams' | 'insurances' | 'consents'
  >('overview');

  const [loading, setLoading] = useState<boolean>(true);
  const [patientData, setPatientData] = useState<any>(null);

  // Timeline state
  const [timeline, setTimeline] = useState<any[]>([]);
  const [timelineFilter, setTimelineFilter] = useState<string>('all');
  const [timelineSearch, setTimelineSearch] = useState<string>('');
  const [loadingTimeline, setLoadingTimeline] = useState<boolean>(false);

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

  // Consents state
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
              onClick={handleExportDocx}
              title="Exportar Prontuário em Word (.docx)"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-all shadow-xs"
            >
              <Download className="w-4 h-4 text-teal-300" />
              Exportar DOCX
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-white/5 hover:bg-white/10 transition-all"
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
                            <span className="text-[11px] text-slate-400">
                              {item.date ? new Date(item.date).toLocaleDateString('pt-BR') : 'Data não informada'}
                            </span>
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
        </div>
      </div>
    </div>
  );
};
