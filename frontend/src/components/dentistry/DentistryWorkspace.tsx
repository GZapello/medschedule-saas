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
  const completion = useConsultationCompletion(onFinishConsultation);
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId || '');
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [patientSearch, setPatientSearch] = useState<string>('');
  const [showPreviousRecordsModal, setShowPreviousRecordsModal] = useState<boolean>(false);

  // Abas do Módulo
  const [activeTab, setActiveTab] = useState<
    'odontogram' | 'perio' | 'endo' | 'anamnesis' | 'treatment_plans' | 'prosthetics' | 'ortho_hof' | 'implants' | 'photos_exams' | 'documents'
  >('odontogram');

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
    toothNumber: '11',
    site: 'vestibular',
    probingDepth: '3',
    bleeding: false,
    suppuration: false,
    mobility: '0',
    furcation: '0',
    recession: '0',
    notes: ''
  });

  // Endodontia
  const [endoRecords, setEndoRecords] = useState<any[]>([]);
  const [endoForm, setEndoForm] = useState({
    toothNumber: '11',
    pulparDiagnosis: 'Pulpite Irreversível Sintomática',
    periapicalDiagnosis: 'Periodontite Apical Sintomática',
    canalsCount: 1,
    workingLength: '21mm',
    instrumentation: 'Mecânica Rotatória / WaveOne Gold',
    irrigation: 'Hipoclorito de Sódio 2.5% + EDTA 17%',
    intracanalMedication: 'Hidróxido de Cálcio P.A. (Calen)',
    obturation: 'Onda Contínua / Cone Único com AH Plus',
    material: 'Guta-percha + Cimento Resinoso',
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
    anesthesiaHistory: 'Sem histórico de reações adversas a anestésicos locais',
    notes: ''
  });

  // Planos de Tratamento e Orçamento
  const [treatmentPlans, setTreatmentPlans] = useState<any[]>([]);
  const [planForm, setPlanForm] = useState({
    title: 'Plano de Tratamento Reabilitador',
    items: [
      { tooth: '16', face: 'Oclusal', procedure: 'Restauração Resina Composta Fotopolimerizável', value: 250 },
      { tooth: '21', face: 'Vestibular', procedure: 'Faceta em Resina Direta', value: 450 }
    ],
    totalValue: 700,
    discountValue: 50,
    finalValue: 650,
    paymentTerms: 'Entrada de 50% + 2x no cartão de crédito',
    notes: 'Garantia de 12 meses nos procedimentos restauradores.'
  });

  // Prótese / Laboratório
  const [prosthetics, setProsthetics] = useState<any[]>([]);
  const [prostheticForm, setProstheticForm] = useState({
    labName: 'Laboratório Dental Prime',
    workType: 'Coroa Total em Zircônia Fresada',
    toothNumber: '21',
    shadeColor: 'VITA 3D Master 1M1',
    material: 'Zircônia Multilayer',
    sentDate: new Date().toISOString().split('T')[0],
    expectedDate: '',
    costValue: 380,
    notes: 'Enviar modelo digital escaneado e cor da escala com foto anexa.'
  });

  // Ortodontia e HOF
  const [orthoData, setOrthoData] = useState<any>(null);
  const [hofRecords, setHofRecords] = useState<any[]>([]);
  const [hofForm, setHofForm] = useState({
    procedureName: 'Aplicação de Toxina Botulínica (Bruxismo / Estético)',
    facialRegion: 'Terço Superior (Frontal, Glabela, Periocular) e Masseter',
    productBrand: 'Botox 100U',
    lotNumber: 'BX2026-99',
    unitsQuantity: '50 UI',
    expiryDate: '2027-12-31',
    notes: 'Relaxamento muscular terapêutico para alívio de DTM e linhas hipercinéticas.'
  });

  // Finalização Rápida de Atendimento Odontológico
  const [consultationEvolution, setConsultationEvolution] = useState<string>('');
  const [consultationProcedures, setConsultationProcedures] = useState<string>('');

  // Carrega lista de pacientes da clínica
  useEffect(() => {
    async function loadPatients() {
      try {
        const res = await ApiClient.get<any[]>('/v1/patients');
        setPatients(res || []);
      } catch (err) {
        console.error('Erro ao carregar pacientes:', err);
      }
    }
    loadPatients();
  }, []);

  // Ao selecionar paciente, carrega todos os dados odontológicos
  useEffect(() => {
    if (!selectedPatientId) return;

    const pat = patients.find(p => p.id === selectedPatientId);
    setSelectedPatient(pat || null);

    loadPatientDentalData(selectedPatientId);
  }, [selectedPatientId, patients]);

  const loadPatientDentalData = async (patientId: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Odontogramas
      try {
        const odontoRes = await ApiClient.get<any>(`/v1/dentistry/odontograms/${patientId}`);
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
        setTreatmentPlans(plansRes || []);
      } catch {}

      // 4. Perio
      try {
        const perioRes = await ApiClient.get<any[]>(`/v1/dentistry/perio/${patientId}`);
        setPerioRecords(perioRes || []);
      } catch {}

      // 5. Endo
      try {
        const endoRes = await ApiClient.get<any[]>(`/v1/dentistry/endo/${patientId}`);
        setEndoRecords(endoRes || []);
      } catch {}

      // 6. Prótese
      try {
        const prosthRes = await ApiClient.get<any[]>(`/v1/dentistry/prosthetics/${patientId}`);
        setProsthetics(prosthRes || []);
      } catch {}

      // 7. Orto e HOF
      try {
        const orthoRes = await ApiClient.get<any>(`/v1/dentistry/orthodontics/${patientId}`);
        setOrthoData(orthoRes);
        const hofRes = await ApiClient.get<any[]>(`/v1/dentistry/hof/${patientId}`);
        setHofRecords(hofRes || []);
      } catch {}

    } catch (err: any) {
      console.error('Erro ao carregar prontuário odontológico:', err);
      setErrorMsg('Não foi possível carregar alguns dados clínicos.');
    } finally {
      setLoading(false);
    }
  };

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
    if (!selectedPatientId) return;
    setSaving(true);
    try {
      await ApiClient.post('/v1/dentistry/prosthetics', {
        patientId: selectedPatientId,
        ...prostheticForm
      });
      setSuccessMsg('Trabalho protético enviado ao laboratório cadastrado!');
      const res = await ApiClient.get<any[]>(`/v1/dentistry/prosthetics/${selectedPatientId}`);
      setProsthetics(res || []);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar prótese');
    } finally {
      setSaving(false);
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
      setSuccessMsg('Procedimento de Harmonização Orofacial registrado!');
      const res = await ApiClient.get<any[]>(`/v1/dentistry/hof/${selectedPatientId}`);
      setHofRecords(res || []);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar HOF');
    } finally {
      setSaving(false);
    }
  };

  // Salvar Novo Plano de Tratamento e Orçamento
  const handleSavePlan = async () => {
    if (!selectedPatientId) return;
    setSaving(true);
    try {
      await ApiClient.post('/v1/dentistry/treatment-plans', {
        patientId: selectedPatientId,
        ...planForm
      });
      setSuccessMsg('Plano de tratamento e orçamento gerados com sucesso!');
      const res = await ApiClient.get<any[]>(`/v1/dentistry/treatment-plans/${selectedPatientId}`);
      setTreatmentPlans(res || []);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar orçamento');
    } finally {
      setSaving(false);
    }
  };

  // Finalizar Atendimento Odontológico
  const handleFinishConsultation = async () => {
    if (!selectedPatientId) return;
    if (!consultationEvolution.trim()) {
      alert('Informe o resumo da evolução clínica realizada nesta consulta.');
      return;
    }

    setSaving(true);
    try {
      await completion.save('/v1/dentistry/consultations/finish', {
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId,
        clinicalEvolution: consultationEvolution,
        proceduresPerformed: consultationProcedures,
        anamnesisData: anamnesis, periodontalData: perioForm, endodonticData: endoForm,
        treatmentPlanData: planForm, prostheticData: prostheticForm, orthodonticData: orthoData, facialData: hofForm,
        odontogramData: odontogramData,
        toothChanges: pendingToothChanges,
        isSealed: true
      });

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

  const filteredPatients = patients.filter(p =>
    (p.full_name || p.name || '').toLowerCase().includes(patientSearch.toLowerCase()) ||
    (p.cpf || '').includes(patientSearch)
  );

  return (
    <div className="space-y-6">
      {completion.dialog}
      {/* Top Header do Módulo com Identidade Oficial ZemdaOdonto */}
      <div className="bg-gradient-to-r from-cyan-900 via-cyan-800 to-sky-900 text-white rounded-3xl p-6 shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/30 backdrop-blur border border-cyan-400/40 flex items-center justify-center text-white shadow-inner">
              <Smile className="w-7 h-7 text-cyan-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight text-white">
                  Zemda<span className="text-cyan-300">Odonto</span>
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-400/20 text-cyan-200 text-[11px] font-bold border border-cyan-400/30">
                  Prontuário Odontológico Digital
                </span>
              </div>
              <p className="text-xs text-cyan-200/80 font-medium">
                Odontograma FDI Interativo • Periodontia • Endodontia • Orçamentos • Prótese & HOF
              </p>
            </div>
          </div>

          {/* Dados do Dentista Ativo */}
          <div className="flex items-center gap-3 bg-white/10 backdrop-blur px-4 py-2 rounded-2xl border border-white/15 text-right">
            <div>
              <div className="text-xs font-bold text-white">{currentUser?.name}</div>
              <div className="text-[11px] text-cyan-200 font-medium">
                {currentUser?.registrationType || 'CRO'}: {currentUser?.registrationNumber || 'Cirurgião-Dentista'}
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-cyan-500/40 flex items-center justify-center text-cyan-100 font-bold text-xs border border-cyan-300/30">
              CD
            </div>
          </div>
        </div>
      </div>

      {/* Alertas de Notificação */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-2xl flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-2xl flex items-center gap-2 animate-fadeIn">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Seletor de Paciente (quando não fixado via initialPatientId) */}
      {!initialPatientId && (
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-700 flex items-center gap-2">
              <User className="w-4 h-4 text-cyan-600" />
              Selecione o Paciente para o Prontuário Odontológico:
            </span>
            <span className="text-xs text-slate-500 font-medium">
              {patients.length} paciente(s) cadastrados
            </span>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nome ou CPF do paciente..."
              value={patientSearch}
              onChange={e => setPatientSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-cyan-500 focus:bg-white transition-all"
            />
          </div>

          {patientSearch && (
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-2xl divide-y divide-slate-100 bg-white shadow-lg">
              {filteredPatients.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelectedPatientId(p.id);
                    setPatientSearch('');
                  }}
                  className="w-full text-left p-3 hover:bg-cyan-50 flex items-center justify-between transition-colors"
                >
                  <div>
                    <div className="text-xs font-bold text-slate-800">{p.full_name || p.name}</div>
                    <div className="text-[11px] text-slate-500">CPF: {p.cpf || 'Não informado'} | Tel: {p.phone || '-'}</div>
                  </div>
                  <span className="text-xs font-bold text-cyan-600">Abrir Ficha Odontológica →</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Informações do Paciente Selecionado */}
      {selectedPatient && (
        <div className="p-4 bg-white border border-cyan-200 rounded-3xl shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-cyan-100 text-cyan-800 flex items-center justify-center font-black text-base border border-cyan-200">
              {(selectedPatient.full_name || selectedPatient.name || 'P').charAt(0)}
            </div>
            <div>
              <div className="text-sm font-black text-slate-900">
                {selectedPatient.full_name || selectedPatient.name}
              </div>
              <div className="text-xs text-slate-500">
                CPF: {selectedPatient.cpf || '-'} • Nasc: {selectedPatient.birth_date || '-'} • Telefone: {selectedPatient.phone || '-'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPreviousRecordsModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 shadow-xs transition-colors cursor-pointer"
              title="Visualizar histórico de prontuários anteriores deste paciente"
            >
              <FileText className="w-3.5 h-3.5 text-cyan-600" />
              <span>Ver Prontuários Anteriores</span>
            </button>
            <span className="px-3 py-1 bg-cyan-50 text-cyan-800 border border-cyan-200 rounded-full text-xs font-bold">
              Prontuário Ativo
            </span>
          </div>
        </div>
      )}

      {/* Navegação por Abas do ZemdaOdonto */}
      {selectedPatientId && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
            <button
              type="button"
              onClick={() => setActiveTab('odontogram')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all ${
                activeTab === 'odontogram'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Smile className="w-4 h-4" />
              Odontograma 2D
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('treatment_plans')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all ${
                activeTab === 'treatment_plans'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <DollarSign className="w-4 h-4" />
              Planos & Orçamento
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('perio')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all ${
                activeTab === 'perio'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Activity className="w-4 h-4" />
              Periodontia (PERIO)
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('endo')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all ${
                activeTab === 'endo'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Scissors className="w-4 h-4" />
              Endodontia (ENDO)
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('prosthetics')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all ${
                activeTab === 'prosthetics'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Package className="w-4 h-4" />
              Prótese & Laboratório
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ortho_hof')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all ${
                activeTab === 'ortho_hof'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Ortodontia & HOF
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('anamnesis')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all ${
                activeTab === 'anamnesis'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Shield className="w-4 h-4" />
              Anamnese Odonto
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('implants')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all ${
                activeTab === 'implants'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              Implantes & Cirurgia
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('photos_exams')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all ${
                activeTab === 'photos_exams'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Camera className="w-4 h-4" />
              Fotos & Exames
            </button>
          </div>

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

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleFinishConsultation}
                    className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white rounded-2xl text-xs font-black shadow-md flex items-center gap-2 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {saving ? 'Registrando...' : 'Finalizar e Lacrar Atendimento Odontológico'}
                  </button>
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
                      Título do Plano
                    </label>
                    <input
                      type="text"
                      value={planForm.title}
                      onChange={e => setPlanForm({ ...planForm, title: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Condições de Pagamento
                    </label>
                    <input
                      type="text"
                      value={planForm.paymentTerms}
                      onChange={e => setPlanForm({ ...planForm, paymentTerms: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
                    />
                  </div>
                </div>

                {/* Itens do Plano */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700">
                    Procedimentos Inclusos no Plano:
                  </label>
                  <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
                    {planForm.items.map((it, idx) => (
                      <div key={idx} className="p-3 flex items-center justify-between text-xs bg-slate-50/50">
                        <div className="font-bold text-slate-800">
                          Dente {it.tooth} ({it.face}): {it.procedure}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-extrabold text-cyan-800">
                            R$ {it.value.toFixed(2)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = planForm.items.filter((_, i) => i !== idx);
                              const total = updated.reduce((acc, curr) => acc + curr.value, 0);
                              setPlanForm({
                                ...planForm,
                                items: updated,
                                totalValue: total,
                                finalValue: total - planForm.discountValue
                              });
                            }}
                            className="text-rose-500 hover:text-rose-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Valores */}
                <div className="grid grid-cols-3 gap-4 pt-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Total Bruto (R$)</label>
                    <input
                      type="number"
                      value={planForm.totalValue}
                      onChange={e => {
                        const tot = Number(e.target.value);
                        setPlanForm({ ...planForm, totalValue: tot, finalValue: tot - planForm.discountValue });
                      }}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Desconto (R$)</label>
                    <input
                      type="number"
                      value={planForm.discountValue}
                      onChange={e => {
                        const desc = Number(e.target.value);
                        setPlanForm({ ...planForm, discountValue: desc, finalValue: planForm.totalValue - desc });
                      }}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Valor Final Líquido</label>
                    <div className="p-2 bg-cyan-50 border border-cyan-200 rounded-xl text-xs font-black text-cyan-900">
                      R$ {planForm.finalValue.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSavePlan}
                    className="px-4 py-2 bg-cyan-600 text-white rounded-2xl text-xs font-bold hover:bg-cyan-700 shadow-sm flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Gerar Orçamento / Salvar
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
              <div className="p-6 bg-white border border-slate-200 rounded-3xl space-y-4 shadow-sm">
                <span className="text-xs font-black uppercase text-slate-700">
                  Lançamento de Exame Periodontal
                </span>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Dente</label>
                    <input
                      type="text"
                      value={perioForm.toothNumber}
                      onChange={e => setPerioForm({ ...perioForm, toothNumber: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Profundidade (mm)</label>
                    <input
                      type="number"
                      value={perioForm.probingDepth}
                      onChange={e => setPerioForm({ ...perioForm, probingDepth: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Mobilidade Dental</label>
                    <select
                      value={perioForm.mobility}
                      onChange={e => setPerioForm({ ...perioForm, mobility: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold"
                    >
                      <option value="0">Grau 0 (Fisiológica)</option>
                      <option value="1">Grau I (Horizontal &lt; 1mm)</option>
                      <option value="2">Grau II (Horizontal &gt; 1mm)</option>
                      <option value="3">Grau III (Vertical e Horizontal)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Lesão de Furca</label>
                    <select
                      value={perioForm.furcation}
                      onChange={e => setPerioForm({ ...perioForm, furcation: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold"
                    >
                      <option value="0">Ausente</option>
                      <option value="1">Grau I</option>
                      <option value="2">Grau II</option>
                      <option value="3">Grau III (Passagem Total)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-6 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={perioForm.bleeding}
                      onChange={e => setPerioForm({ ...perioForm, bleeding: e.target.checked })}
                      className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                    />
                    Sangramento à Sondagem (SS)
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={perioForm.suppuration}
                      onChange={e => setPerioForm({ ...perioForm, suppuration: e.target.checked })}
                      className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                    />
                    Supuração Presente
                  </label>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={async () => {
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
                    }}
                    className="px-4 py-2 bg-cyan-600 text-white rounded-2xl text-xs font-bold hover:bg-cyan-700 shadow-sm flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Salvar Sondagem
                  </button>
                </div>
              </div>

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
                    >
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
                    >
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

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveProsthetic}
                    className="px-4 py-2 bg-cyan-600 text-white rounded-2xl text-xs font-bold hover:bg-cyan-700 shadow-sm flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Registrar Envio ao Laboratório
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
                <span className="text-xs font-black uppercase text-slate-700">
                  Registrar Aplicação de Harmonização Orofacial
                </span>

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
            <DentalImplantsManager patientId={selectedPatientId} />
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
    </div>
  );
};
