import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Patient, PhysiotherapyAssessment, PhysiotherapyEvolution, Specialty } from '../../types';
import {
  Activity,
  Plus,
  Calendar,
  Lock,
  ChevronDown,
  ChevronUp,
  FileText,
  User,
  Clock,
  ShieldCheck,
  CheckCircle2,
  X,
  AlertCircle,
  HelpCircle,
  Eye,
  Sliders,
  Target,
  Sparkles,
  ClipboardCheck
} from 'lucide-react';
import { BodyPainMapCanvas } from './BodyPainMapCanvas';
import { PatientPreviousRecordsModal } from '../clinical/PatientPreviousRecordsModal';

export const PhysiotherapyRecordsView: React.FC = () => {
  const { clientTermLabel, currentTenant, currentUser } = useAuth();
  const { showToast } = useToast();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [specialties, setSpecialties] = useState<Specialty[]>([]);

  // Aba ativa: Avaliação Funcional ou Evoluções de Sessão
  const [activeTab, setActiveTab] = useState<'assessments' | 'evolutions'>('assessments');

  // Estados de dados
  const [assessments, setAssessments] = useState<PhysiotherapyAssessment[]>([]);
  const [evolutions, setEvolutions] = useState<PhysiotherapyEvolution[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Modais
  const [showAssessmentModal, setShowAssessmentModal] = useState<boolean>(false);
  const [showEvolutionModal, setShowEvolutionModal] = useState<boolean>(false);
  const [viewingAssessment, setViewingAssessment] = useState<PhysiotherapyAssessment | null>(null);
  const [showPreviousRecordsModal, setShowPreviousRecordsModal] = useState<boolean>(false);

  // Accordion open/close no formulário de avaliação
  const [openSection, setOpenSection] = useState<{ [key: string]: boolean }>({
    anamnese: true,
    dor: true,
    mobilidade: false,
    funcional: false,
    testes: false,
    objetivos: false
  });

  const toggleSection = (sec: string) => {
    setOpenSection(prev => ({ ...prev, [sec]: !prev[sec] }));
  };

  // Formulário de Avaliação Funcional
  const [assessmentForm, setAssessmentForm] = useState({
    specialtyId: '',
    chiefComplaint: '',
    hpi: '',
    pastMedicalHistory: '',
    medicalDiagnosis: '',
    physioDiagnosis: '',
    painScore: 0,
    painLocation: '',
    painCharacteristics: '',
    inspectionPalpation: '',
    rangeOfMotion: '',
    muscleStrength: '',
    postureBalance: '',
    gaitMobility: '',
    functionalLimitations: '',
    specificTests: '',
    shortTermGoals: '',
    longTermGoals: '',
    treatmentPlan: '',
    conductsExercises: '',
    guidelines: '',
    bodyMapJson: '',
    bodyMapImage: '',
    isSealed: false
  });

  // Formulário de Evolução de Sessão
  const [evolutionForm, setEvolutionForm] = useState({
    specialtyId: '',
    sessionDate: new Date().toISOString().split('T')[0],
    sessionTime: new Date().toTimeString().slice(0, 5),
    patientCondition: '',
    proceduresPerformed: '',
    exercisesPerformed: '',
    techniquesUsed: '',
    clinicalEvolution: '',
    treatmentResponse: '',
    complications: '',
    guidelines: '',
    nextSessionPlan: '',
    notes: '',
    isSealed: false
  });

  // Carrega pacientes e especialidades de fisioterapia
  useEffect(() => {
    async function init() {
      try {
        const [patientsData, specsData] = await Promise.all([
          ApiClient.get<Patient[]>('/v1/patients'),
          ApiClient.get<Specialty[]>('/v1/taxonomy/specialties')
        ]);
        setPatients(patientsData || []);
        if (patientsData && patientsData.length > 0) {
          setSelectedPatientId(patientsData[0].id);
        }

        // Filtra especialidades de fisioterapia
        const physioSpecs = (specsData || []).filter(s =>
          (s.slug && s.slug.includes('fisio')) ||
          (s.profession_name && s.profession_name.toLowerCase().includes('fisio')) ||
          (s.name && s.name.toLowerCase().includes('fisioterapia'))
        );
        setSpecialties(physioSpecs.length > 0 ? physioSpecs : specsData || []);
      } catch (err) {
        showToast('Erro ao carregar dados iniciais', 'error');
      }
    }
    init();
  }, []);

  // Carrega histórico do paciente selecionado
  const loadPatientPhysioData = async (patientId: string) => {
    if (!patientId) return;
    try {
      setLoading(true);
      const [assessRes, evolRes] = await Promise.all([
        ApiClient.get<PhysiotherapyAssessment[]>(`/v1/physiotherapy/assessments/patient/${patientId}`),
        ApiClient.get<PhysiotherapyEvolution[]>(`/v1/physiotherapy/evolutions/patient/${patientId}`)
      ]);
      setAssessments(assessRes || []);
      setEvolutions(evolRes || []);
    } catch (err: any) {
      showToast(err.message || 'Erro ao carregar prontuário fisioterapêutico', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedPatientId) {
      loadPatientPhysioData(selectedPatientId);
    }
  }, [selectedPatientId]);

  // Salvar Avaliação Funcional
  const handleSaveAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assessmentForm.chiefComplaint.trim()) {
      showToast('Por favor, informe a Queixa Principal do paciente', 'error');
      return;
    }

    try {
      await ApiClient.post('/v1/physiotherapy/assessments', {
        patientId: selectedPatientId,
        ...assessmentForm,
        painScore: Number(assessmentForm.painScore)
      });

      showToast('Avaliação fisioterapêutica registrada com sucesso no ZemdaFisio!', 'success');
      setShowAssessmentModal(false);
      setAssessmentForm({
        specialtyId: '',
        chiefComplaint: '',
        hpi: '',
        pastMedicalHistory: '',
        medicalDiagnosis: '',
        physioDiagnosis: '',
        painScore: 0,
        painLocation: '',
        painCharacteristics: '',
        inspectionPalpation: '',
        rangeOfMotion: '',
        muscleStrength: '',
        postureBalance: '',
        gaitMobility: '',
        functionalLimitations: '',
        specificTests: '',
        shortTermGoals: '',
        longTermGoals: '',
        treatmentPlan: '',
        conductsExercises: '',
        guidelines: '',
        bodyMapJson: '',
        bodyMapImage: '',
        isSealed: false
      });
      loadPatientPhysioData(selectedPatientId);
    } catch (err: any) {
      showToast(err.message || 'Erro ao gravar avaliação fisioterapêutica', 'error');
    }
  };

  // Salvar Evolução de Sessão
  const handleSaveEvolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evolutionForm.clinicalEvolution.trim()) {
      showToast('Por favor, descreva a Evolução Clínica da sessão', 'error');
      return;
    }

    try {
      await ApiClient.post('/v1/physiotherapy/evolutions', {
        patientId: selectedPatientId,
        ...evolutionForm
      });

      showToast('Evolução de sessão registrada com sucesso!', 'success');
      setShowEvolutionModal(false);
      setEvolutionForm({
        specialtyId: '',
        sessionDate: new Date().toISOString().split('T')[0],
        sessionTime: new Date().toTimeString().slice(0, 5),
        patientCondition: '',
        proceduresPerformed: '',
        exercisesPerformed: '',
        techniquesUsed: '',
        clinicalEvolution: '',
        treatmentResponse: '',
        complications: '',
        guidelines: '',
        nextSessionPlan: '',
        notes: '',
        isSealed: false
      });
      loadPatientPhysioData(selectedPatientId);
    } catch (err: any) {
      showToast(err.message || 'Erro ao gravar evolução fisioterapêutica', 'error');
    }
  };

  const currentPatient = patients.find(p => p.id === selectedPatientId);

  return (
    <div className="space-y-6">
      {/* Banner de Identidade ZemdaFisio */}
      <div className="bg-gradient-to-r from-teal-900 via-slate-900 to-teal-950 text-white p-6 rounded-3xl border border-teal-800/40 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300 shadow-inner">
            <Activity className="w-6 h-6 text-teal-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black tracking-tight text-white">ZemdaFisio</span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-400/30">
                Fisioterapia Integrada
              </span>
            </div>
            <p className="text-xs text-teal-200/80 mt-1">
              Prontuário especializado: Avaliação funcional, cinético-funcional e evolução cronológica por sessão.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selectedPatientId && (
            <button
              onClick={() => setShowPreviousRecordsModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-teal-100 bg-teal-800/80 hover:bg-teal-700 border border-teal-600/50 rounded-xl transition-all shadow-sm cursor-pointer whitespace-nowrap"
              title="Visualizar histórico de prontuários anteriores deste paciente"
            >
              <FileText className="w-4 h-4 text-teal-300" />
              <span>Ver Prontuários Anteriores</span>
            </button>
          )}
          <button
            onClick={() => setShowAssessmentModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-teal-950 bg-teal-400 hover:bg-teal-300 rounded-xl transition-all shadow-sm cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Nova Avaliação
          </button>
          <button
            onClick={() => setShowEvolutionModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-all cursor-pointer whitespace-nowrap"
          >
            <Clock className="w-4 h-4 text-teal-400" /> Evolução de Sessão
          </button>
        </div>
      </div>

      {/* Seleção do Paciente */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
            {clientTermLabel} em Atendimento:
          </label>
          <select
            value={selectedPatientId}
            onChange={e => setSelectedPatientId(e.target.value)}
            className="w-full sm:w-80 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
          >
            {patients.map(p => (
              <option key={p.id} value={p.id}>
                {p.full_name} {p.cpf ? `(CPF: ${p.cpf})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Abas de Navegação */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('assessments')}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'assessments'
                ? 'bg-white text-teal-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Avaliações Funcionais ({assessments.length})
          </button>
          <button
            onClick={() => setActiveTab('evolutions')}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'evolutions'
                ? 'bg-white text-teal-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Evoluções de Sessão ({evolutions.length})
          </button>
        </div>
      </div>

      {/* Conteúdo da Aba */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400">
          <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          Carregando prontuário fisioterapêutico...
        </div>
      ) : activeTab === 'assessments' ? (
        <div className="space-y-4">
          {assessments.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-dashed border-slate-200 text-center text-slate-400 space-y-3">
              <Activity className="w-10 h-10 mx-auto text-teal-600/40" />
              <p className="font-semibold text-sm text-slate-700">Nenhuma avaliação fisioterapêutica cadastrada.</p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Registre a primeira avaliação funcional do paciente para traçar diagnóstico cinesiológico, força muscular, ADM e plano terapêutico.
              </p>
              <button
                onClick={() => setShowAssessmentModal(true)}
                className="px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-all shadow-xs"
              >
                Criar Avaliação Inicial
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {assessments.map(a => (
                <div key={a.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4 hover:border-slate-300 transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-sm">{a.chief_complaint}</span>
                        {a.specialty_name && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                            {a.specialty_name}
                          </span>
                        )}
                        {a.is_sealed === 1 && (
                          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                            <Lock className="w-3 h-3" /> Lacrado
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Avaliador: <span className="font-semibold text-slate-700">{a.professional_name}</span> ({a.registration_type || 'CREFITO'}: {a.registration_number || 'S/N'})
                      </p>
                    </div>

                    <span className="text-xs font-semibold text-slate-500 bg-slate-50 px-3 py-1 rounded-lg">
                      {new Date(a.created_at).toLocaleDateString('pt-BR')} às {new Date(a.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Resumo da Avaliação */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block mb-1">
                        Diagnóstico Cinesiológico-Funcional
                      </span>
                      <p className="text-slate-800">{a.physio_diagnosis || 'Não informado'}</p>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block mb-1">
                        Escala de Dor (EVA)
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-extrabold text-teal-700">{a.pain_score} / 10</span>
                        <span className="text-slate-500 text-[11px] truncate">({a.pain_location || 'Geral'})</span>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block mb-1">
                        Objetivos Terapêuticos
                      </span>
                      <p className="text-slate-800 truncate">{a.short_term_goals || a.long_term_goals || 'Definidos na conduta'}</p>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-end">
                    <button
                      onClick={() => setViewingAssessment(a)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 hover:text-teal-800 hover:bg-teal-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" /> Ver Avaliação Completa
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Aba de Evoluções */
        <div className="space-y-4">
          {evolutions.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-dashed border-slate-200 text-center text-slate-400 space-y-3">
              <Clock className="w-10 h-10 mx-auto text-teal-600/40" />
              <p className="font-semibold text-sm text-slate-700">Nenhuma evolução de sessão registrada.</p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Registre as sessões diárias com procedimentos, resposta do paciente, condutas e plano para o próximo atendimento.
              </p>
              <button
                onClick={() => setShowEvolutionModal(true)}
                className="px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-all shadow-xs"
              >
                Nova Evolução de Sessão
              </button>
            </div>
          ) : (
            <div className="relative border-l-2 border-teal-200 ml-4 pl-6 space-y-6">
              {evolutions.map(e => (
                <div key={e.id} className="relative bg-white p-6 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
                  <div className="absolute -left-[31px] top-6 w-4 h-4 rounded-full bg-teal-600 border-4 border-white shadow-xs" />

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-3">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                        Sessão de Fisioterapia
                        {e.specialty_name && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                            {e.specialty_name}
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Atendido por <span className="font-semibold text-slate-700">{e.professional_name}</span> ({e.registration_type || 'CREFITO'}: {e.registration_number || 'S/N'})
                      </p>
                    </div>

                    <span className="text-xs font-bold text-teal-700 bg-teal-50 px-3 py-1 rounded-lg">
                      {new Date(e.session_date + 'T12:00:00').toLocaleDateString('pt-BR')} {e.session_time ? `às ${e.session_time}` : ''}
                    </span>
                  </div>

                  <div className="space-y-3 text-xs text-slate-700">
                    <div>
                      <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px] block mb-1">
                        Evolução Clínica & Resposta ao Tratamento
                      </span>
                      <p className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 whitespace-pre-wrap font-sans text-slate-800">
                        {e.clinical_evolution}
                      </p>
                    </div>

                    {(e.procedures_performed || e.exercises_performed || e.techniques_used) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {e.procedures_performed && (
                          <div className="bg-teal-50/40 p-3 rounded-xl border border-teal-100">
                            <span className="font-bold text-teal-950 uppercase tracking-wider text-[10px] block mb-1">
                              Procedimentos Realizados
                            </span>
                            <p className="text-slate-800">{e.procedures_performed}</p>
                          </div>
                        )}
                        {e.exercises_performed && (
                          <div className="bg-teal-50/40 p-3 rounded-xl border border-teal-100">
                            <span className="font-bold text-teal-950 uppercase tracking-wider text-[10px] block mb-1">
                              Exercícios Terapêuticos
                            </span>
                            <p className="text-slate-800">{e.exercises_performed}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {e.next_session_plan && (
                      <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-200/60 text-amber-950">
                        <span className="font-bold uppercase tracking-wider text-[10px] block mb-0.5">
                          Plano para Próxima Sessão
                        </span>
                        <p>{e.next_session_plan}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: NOVA AVALIAÇÃO FISIOTERAPÊUTICA (ACCORDION EXPANSÍVEL)              */}
      {/* ========================================================================= */}
      {showAssessmentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-teal-100 text-teal-800 rounded-xl">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Nova Avaliação Fisioterapêutica</h3>
                  <p className="text-xs text-slate-500">Paciente: {currentPatient?.full_name}</p>
                </div>
              </div>
              <button
                onClick={() => setShowAssessmentModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAssessment} className="space-y-4 text-xs">
              {/* Especialidade de Fisioterapia */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Especialidade / Foco do Atendimento</label>
                <select
                  value={assessmentForm.specialtyId}
                  onChange={e => setAssessmentForm({ ...assessmentForm, specialtyId: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium"
                >
                  <option value="">Fisioterapia Geral</option>
                  {specialties.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* SEÇÃO 1: ANAMNESE & QUEIXA PRINCIPAL */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('anamnese')}
                  className="w-full bg-slate-50 p-3.5 flex items-center justify-between font-bold text-slate-800 hover:bg-slate-100 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-teal-600" />
                    1. Anamnese & Queixa Principal
                  </span>
                  {openSection.anamnese ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {openSection.anamnese && (
                  <div className="p-4 space-y-3 bg-white">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Queixa Principal (QP) *</label>
                      <input
                        type="text"
                        value={assessmentForm.chiefComplaint}
                        onChange={e => setAssessmentForm({ ...assessmentForm, chiefComplaint: e.target.value })}
                        placeholder="Ex: Dor lombar intensa irradiando para MID há 2 semanas"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">História da Doença Atual (HDA)</label>
                      <textarea
                        rows={2}
                        value={assessmentForm.hpi}
                        onChange={e => setAssessmentForm({ ...assessmentForm, hpi: e.target.value })}
                        placeholder="Início dos sintomas, mecanismo de lesão, fatores de melhora e piora..."
                        className="w-full border border-slate-200 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Diagnóstico Médico (se houver)</label>
                        <input
                          type="text"
                          value={assessmentForm.medicalDiagnosis}
                          onChange={e => setAssessmentForm({ ...assessmentForm, medicalDiagnosis: e.target.value })}
                          placeholder="Ex: Hérnia discal L5-S1 (M51.1)"
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Diagnóstico Cinesiológico-Funcional</label>
                        <input
                          type="text"
                          value={assessmentForm.physioDiagnosis}
                          onChange={e => setAssessmentForm({ ...assessmentForm, physioDiagnosis: e.target.value })}
                          placeholder="Ex: Síndrome dolorosa miofascial lombar com limitação de flexão"
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SEÇÃO 2: AVALIAÇÃO DA DOR (ESCALA EVA) */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('dor')}
                  className="w-full bg-slate-50 p-3.5 flex items-center justify-between font-bold text-slate-800 hover:bg-slate-100 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-teal-600" />
                    2. Avaliação da Dor & Escala EVA
                  </span>
                  {openSection.dor ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {openSection.dor && (
                  <div className="p-4 space-y-3 bg-white">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-semibold text-slate-700">Intensidade da Dor (Escala Visual Analógica - 0 a 10)</label>
                        <span className="font-extrabold text-sm text-teal-700">{assessmentForm.painScore} / 10</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={10}
                        step={1}
                        value={assessmentForm.painScore}
                        onChange={e => setAssessmentForm({ ...assessmentForm, painScore: Number(e.target.value) })}
                        className="w-full accent-teal-600 cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                        <span>0: Sem dor</span>
                        <span>5: Dor moderada</span>
                        <span>10: Dor insuportável</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Localização da Dor</label>
                        <input
                          type="text"
                          value={assessmentForm.painLocation}
                          onChange={e => setAssessmentForm({ ...assessmentForm, painLocation: e.target.value })}
                          placeholder="Ex: Região lombar baixa e glúteo direito"
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Características da Dor</label>
                        <input
                          type="text"
                          value={assessmentForm.painCharacteristics}
                          onChange={e => setAssessmentForm({ ...assessmentForm, painCharacteristics: e.target.value })}
                          placeholder="Ex: Queimação, pontada, peso, contínua"
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                        />
                      </div>
                    </div>

                    {/* MAPA CORPORAL DE DOR COM CANETA AMARELA */}
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block border border-amber-500" />
                          Mapa Corporal Anatômico de Dor (Marcação Visual)
                        </label>
                        <span className="text-[11px] text-teal-700 font-semibold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                          Caneta Amarela / Círculos
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Clique ou arraste com a caneta amarela sobre a anatomia muscular para registrar os pontos e zonas de dor relatados pelo paciente.
                      </p>
                      <BodyPainMapCanvas
                        initialDataJson={assessmentForm.bodyMapJson}
                        initialImageDataUrl={assessmentForm.bodyMapImage}
                        onSave={(dataJson, dataUrl) => {
                          setAssessmentForm(prev => ({
                            ...prev,
                            bodyMapJson: dataJson,
                            bodyMapImage: dataUrl
                          }));
                        }}
                        height={460}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* SEÇÃO 3: MOBILIDADE, ADM & FORÇA MUSCULAR */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('mobilidade')}
                  className="w-full bg-slate-50 p-3.5 flex items-center justify-between font-bold text-slate-800 hover:bg-slate-100 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-teal-600" />
                    3. Mobilidade, ADM & Força Muscular
                  </span>
                  {openSection.mobilidade ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {openSection.mobilidade && (
                  <div className="p-4 space-y-3 bg-white">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Inspeção & Palpação</label>
                      <textarea
                        rows={2}
                        value={assessmentForm.inspectionPalpation}
                        onChange={e => setAssessmentForm({ ...assessmentForm, inspectionPalpation: e.target.value })}
                        placeholder="Edema, calor, tônus muscular, pontos gatilho miofasciais..."
                        className="w-full border border-slate-200 rounded-xl p-2.5 text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Amplitude de Movimento (ADM / Goniometria)</label>
                        <textarea
                          rows={2}
                          value={assessmentForm.rangeOfMotion}
                          onChange={e => setAssessmentForm({ ...assessmentForm, rangeOfMotion: e.target.value })}
                          placeholder="Graus ou limites funcionais (Ex: Flexão lombar limitada a 40° com dor)..."
                          className="w-full border border-slate-200 rounded-xl p-2.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Força Muscular (Escala de Oxford 0-5)</label>
                        <textarea
                          rows={2}
                          value={assessmentForm.muscleStrength}
                          onChange={e => setAssessmentForm({ ...assessmentForm, muscleStrength: e.target.value })}
                          placeholder="Ex: Quadríceps G4, Isquiotibiais G4, Glúteo médio G3+..."
                          className="w-full border border-slate-200 rounded-xl p-2.5 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SEÇÃO 4: FUNCIONALIDADE, POSTURA & MARCHA */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('funcional')}
                  className="w-full bg-slate-50 p-3.5 flex items-center justify-between font-bold text-slate-800 hover:bg-slate-100 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <User className="w-4 h-4 text-teal-600" />
                    4. Avaliação Funcional, Postura & Marcha
                  </span>
                  {openSection.funcional ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {openSection.funcional && (
                  <div className="p-4 space-y-3 bg-white">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Postura & Equilíbrio</label>
                        <textarea
                          rows={2}
                          value={assessmentForm.postureBalance}
                          onChange={e => setAssessmentForm({ ...assessmentForm, postureBalance: e.target.value })}
                          placeholder="Desvios posturais, teste de Romberg, apoio unipodal..."
                          className="w-full border border-slate-200 rounded-xl p-2.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Marcha & Mobilidade</label>
                        <textarea
                          rows={2}
                          value={assessmentForm.gaitMobility}
                          onChange={e => setAssessmentForm({ ...assessmentForm, gaitMobility: e.target.value })}
                          placeholder="Padrão de marcha, claudicação, velocidade, uso de órtese..."
                          className="w-full border border-slate-200 rounded-xl p-2.5 text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Limitações Funcionais nas AVDs</label>
                      <input
                        type="text"
                        value={assessmentForm.functionalLimitations}
                        onChange={e => setAssessmentForm({ ...assessmentForm, functionalLimitations: e.target.value })}
                        placeholder="Ex: Dificuldade para sentar/levantar, calçar sapatos, dirigir por mais de 20 min"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* SEÇÃO 5: TESTES ESPECÍFICOS */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('testes')}
                  className="w-full bg-slate-50 p-3.5 flex items-center justify-between font-bold text-slate-800 hover:bg-slate-100 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <ClipboardCheck className="w-4 h-4 text-teal-600" />
                    5. Testes Específicos & Ortopédicos
                  </span>
                  {openSection.testes ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {openSection.testes && (
                  <div className="p-4 space-y-3 bg-white">
                    <label className="block font-semibold text-slate-700 mb-1">Testes Realizados e Resultados</label>
                    <textarea
                      rows={2}
                      value={assessmentForm.specificTests}
                      onChange={e => setAssessmentForm({ ...assessmentForm, specificTests: e.target.value })}
                      placeholder="Ex: Lasègue (+) a 45° à direita, Slump (+), Thomas (-), Hawkins-Kennedy (-)..."
                      className="w-full border border-slate-200 rounded-xl p-2.5 text-xs"
                    />
                  </div>
                )}
              </div>

              {/* SEÇÃO 6: OBJETIVOS & PLANO TERAPÊUTICO */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('objetivos')}
                  className="w-full bg-slate-50 p-3.5 flex items-center justify-between font-bold text-slate-800 hover:bg-slate-100 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-teal-600" />
                    6. Objetivos & Plano Terapêutico
                  </span>
                  {openSection.objetivos ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {openSection.objetivos && (
                  <div className="p-4 space-y-3 bg-white">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Objetivos a Curto Prazo</label>
                        <textarea
                          rows={2}
                          value={assessmentForm.shortTermGoals}
                          onChange={e => setAssessmentForm({ ...assessmentForm, shortTermGoals: e.target.value })}
                          placeholder="Ex: Alívio da dor (EVA <= 3), ganho de 20° de ADM em 2 semanas..."
                          className="w-full border border-slate-200 rounded-xl p-2.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Objetivos a Longo Prazo</label>
                        <textarea
                          rows={2}
                          value={assessmentForm.longTermGoals}
                          onChange={e => setAssessmentForm({ ...assessmentForm, longTermGoals: e.target.value })}
                          placeholder="Ex: Retorno às atividades esportivas, fortalecimento global..."
                          className="w-full border border-slate-200 rounded-xl p-2.5 text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Condutas Propostas & Exercícios</label>
                      <textarea
                        rows={2}
                        value={assessmentForm.conductsExercises}
                        onChange={e => setAssessmentForm({ ...assessmentForm, conductsExercises: e.target.value })}
                        placeholder="Terapia manual, cinesioterapia, eletroterapia, orientações domiciliares..."
                        className="w-full border border-slate-200 rounded-xl p-2.5 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Opção de Lacrar Prontuário */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="sealAssessment"
                  checked={assessmentForm.isSealed}
                  onChange={e => setAssessmentForm({ ...assessmentForm, isSealed: e.target.checked })}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                <label htmlFor="sealAssessment" className="text-xs text-slate-700 font-medium cursor-pointer">
                  Lacrar avaliação após salvar (impede edições futuras garantindo conformidade jurídica)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAssessmentModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs"
                >
                  Salvar Avaliação Fisioterapêutica
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: NOVA EVOLUÇÃO DE SESSÃO                                             */}
      {/* ========================================================================= */}
      {showEvolutionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-teal-100 text-teal-800 rounded-xl">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Registrar Evolução de Sessão</h3>
                  <p className="text-xs text-slate-500">Paciente: {currentPatient?.full_name}</p>
                </div>
              </div>
              <button
                onClick={() => setShowEvolutionModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEvolution} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Data da Sessão *</label>
                  <input
                    type="date"
                    value={evolutionForm.sessionDate}
                    onChange={e => setEvolutionForm({ ...evolutionForm, sessionDate: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Horário</label>
                  <input
                    type="time"
                    value={evolutionForm.sessionTime}
                    onChange={e => setEvolutionForm({ ...evolutionForm, sessionTime: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Condição do Paciente na Chegada</label>
                <input
                  type="text"
                  value={evolutionForm.patientCondition}
                  onChange={e => setEvolutionForm({ ...evolutionForm, patientCondition: e.target.value })}
                  placeholder="Ex: Chegou referindo alívio de 50% na dor lombar, sem claudicação hoje"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Procedimentos e Técnicas Utilizadas</label>
                <input
                  type="text"
                  value={evolutionForm.proceduresPerformed}
                  onChange={e => setEvolutionForm({ ...evolutionForm, proceduresPerformed: e.target.value })}
                  placeholder="Ex: Liberação miofascial tóraco-lombar, TENS 15min, mobilização articular grau III"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Exercícios Terapêuticos Realizados</label>
                <textarea
                  rows={2}
                  value={evolutionForm.exercisesPerformed}
                  onChange={e => setEvolutionForm({ ...evolutionForm, exercisesPerformed: e.target.value })}
                  placeholder="Ex: Ponte bipodal 3x12, prancha adaptada 3x20s, alongamento de isquiotibiais 3x30s..."
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Evolução Clínica e Resposta do Paciente *</label>
                <textarea
                  rows={3}
                  value={evolutionForm.clinicalEvolution}
                  onChange={e => setEvolutionForm({ ...evolutionForm, clinicalEvolution: e.target.value })}
                  placeholder="Descrição completa da resposta ao tratamento, fadiga, alívio e intercorrências..."
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-teal-500"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Plano para a Próxima Sessão / Orientações Domiciliares</label>
                <input
                  type="text"
                  value={evolutionForm.nextSessionPlan}
                  onChange={e => setEvolutionForm({ ...evolutionForm, nextSessionPlan: e.target.value })}
                  placeholder="Ex: Progredir carga no fortalecimento de core e manter compressa fria pós-treino"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEvolutionModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs"
                >
                  Gravar Evolução
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: VISUALIZAR AVALIAÇÃO COMPLETA                                       */}
      {/* ========================================================================= */}
      {viewingAssessment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-teal-600" />
                <h3 className="text-base font-bold text-slate-900">Avaliação Fisioterapêutica Completa</h3>
              </div>
              <button onClick={() => setViewingAssessment(null)} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1">
                <div className="font-bold text-slate-900 text-sm">{viewingAssessment.chief_complaint}</div>
                <div className="text-slate-500">
                  Avaliador: {viewingAssessment.professional_name} | {viewingAssessment.registration_type || 'CREFITO'}: {viewingAssessment.registration_number || 'S/N'}
                </div>
              </div>

              {viewingAssessment.hpi && (
                <div>
                  <h5 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-1">História da Doença Atual (HDA)</h5>
                  <p className="bg-slate-50 p-3 rounded-xl border border-slate-100">{viewingAssessment.hpi}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {viewingAssessment.medical_diagnosis && (
                  <div>
                    <h5 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-1">Diagnóstico Médico</h5>
                    <p className="bg-slate-50 p-3 rounded-xl border border-slate-100">{viewingAssessment.medical_diagnosis}</p>
                  </div>
                )}
                {viewingAssessment.physio_diagnosis && (
                  <div>
                    <h5 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-1">Diagnóstico Fisioterapêutico</h5>
                    <p className="bg-teal-50/50 text-teal-900 p-3 rounded-xl border border-teal-100">{viewingAssessment.physio_diagnosis}</p>
                  </div>
                )}
              </div>

              <div>
                <h5 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-1">Avaliação da Dor (EVA: {viewingAssessment.pain_score}/10)</h5>
                <p className="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-2">
                  Localização: {viewingAssessment.pain_location || 'Não especificada'} | Características: {viewingAssessment.pain_characteristics || 'Não especificadas'}
                </p>

                {/* Exibição do Mapa Corporal de Dor Gravado */}
                {(viewingAssessment.body_map_json || viewingAssessment.body_map_image) && (
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-amber-500 inline-block" />
                        Mapa Corporal Anatômico de Dor Gravado
                      </span>
                      <span className="text-[10px] font-semibold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md">
                        Registro Clínico Permanente
                      </span>
                    </div>
                    <BodyPainMapCanvas
                      initialDataJson={viewingAssessment.body_map_json}
                      initialImageDataUrl={viewingAssessment.body_map_image}
                      readOnly={true}
                      height={400}
                    />
                  </div>
                )}
              </div>

              {viewingAssessment.range_of_motion && (
                <div>
                  <h5 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-1">Amplitude de Movimento (ADM)</h5>
                  <p className="bg-slate-50 p-3 rounded-xl border border-slate-100">{viewingAssessment.range_of_motion}</p>
                </div>
              )}

              {viewingAssessment.muscle_strength && (
                <div>
                  <h5 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-1">Força Muscular (Oxford)</h5>
                  <p className="bg-slate-50 p-3 rounded-xl border border-slate-100">{viewingAssessment.muscle_strength}</p>
                </div>
              )}

              {viewingAssessment.specific_tests && (
                <div>
                  <h5 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-1">Testes Específicos Realizados</h5>
                  <p className="bg-slate-50 p-3 rounded-xl border border-slate-100">{viewingAssessment.specific_tests}</p>
                </div>
              )}

              {(viewingAssessment.short_term_goals || viewingAssessment.long_term_goals) && (
                <div className="grid grid-cols-2 gap-3">
                  {viewingAssessment.short_term_goals && (
                    <div>
                      <h5 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-1">Metas a Curto Prazo</h5>
                      <p className="bg-slate-50 p-3 rounded-xl border border-slate-100">{viewingAssessment.short_term_goals}</p>
                    </div>
                  )}
                  {viewingAssessment.long_term_goals && (
                    <div>
                      <h5 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-1">Metas a Longo Prazo</h5>
                      <p className="bg-slate-50 p-3 rounded-xl border border-slate-100">{viewingAssessment.long_term_goals}</p>
                    </div>
                  )}
                </div>
              )}

              {viewingAssessment.conducts_exercises && (
                <div>
                  <h5 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-1">Condutas & Exercícios Propostos</h5>
                  <p className="bg-teal-50/40 p-3 rounded-xl border border-teal-100">{viewingAssessment.conducts_exercises}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setViewingAssessment(null)}
                className="px-5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      {showPreviousRecordsModal && selectedPatientId && (
        <PatientPreviousRecordsModal
          isOpen={showPreviousRecordsModal}
          onClose={() => setShowPreviousRecordsModal(false)}
          patientId={selectedPatientId}
          patientName={currentPatient?.full_name}
        />
      )}
    </div>
  );
};
