import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useConsultationCompletion } from '../clinical/useConsultationCompletion';
import { PatientPreviousRecordsModal } from '../clinical/PatientPreviousRecordsModal';
import {
  Brain,
  FileText,
  User,
  Search,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Save,
  Trash2,
  Printer,
  History,
  Target,
  Sparkles,
  Shield,
  BookOpen,
  ChevronRight,
  Smile,
  HeartPulse,
  Activity,
  Award
} from 'lucide-react';

interface PsychologyWorkspaceProps {
  initialPatientId?: string;
  initialAppointmentId?: string;
  onFinishConsultation?: () => void;
}

export const PsychologyWorkspace: React.FC<PsychologyWorkspaceProps> = ({
  initialPatientId,
  initialAppointmentId,
  onFinishConsultation
}) => {
  const { currentUser, isClinicAdmin, clientTermLabel } = useAuth();
  const { showToast } = useToast();
  const completion = useConsultationCompletion(onFinishConsultation);

  // Pacientes e Seleção
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId || '');
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [searchPatient, setSearchPatient] = useState<string>('');
  const [showPreviousRecordsModal, setShowPreviousRecordsModal] = useState<boolean>(false);

  type TabKey = 'anamnese' | 'mental_state' | 'sessions' | 'goals' | 'documents';
  const [activeTab, setActiveTab] = useState<TabKey>('anamnese');

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // 1. Anamnese Psicológica
  const [anamnese, setAnamnese] = useState({
    mainComplaint: '',
    symptomHistory: '',
    personalFamilyHistory: '',
    medicalPsychiatricHistory: '',
    currentMedications: '',
    theoreticalApproach: 'Terapia Cognitivo-Comportamental (TCC)',
    diagnosticHypothesis: '',
    supportNetwork: '',
    lifeGoals: ''
  });

  // 2. Exame do Estado Mental (EEM)
  const [mentalState, setMentalState] = useState({
    appearanceBehavior: 'Adequado, colaborativo e com boa higiene pessoal.',
    consciousnessOrientation: 'Vigil, lúcido e orientado auto e alopsiquicamente (tempo e espaço).',
    attentionMemory: 'Atenção sustentada preservada; memória imediata, recente e remota íntegras.',
    moodAffect: 'Eutímico', // Eutímico, Ansioso, Deprimido, Disfórico, Irritável, Lábil
    thoughtProcess: 'Curso normal, forma lógica e conteúdo sem delírios ou ideações obsessivas.',
    sensoryPerception: 'Sem alterações perceptivas (ausência de alucinações ou ilusões).',
    insightJudgement: 'Juízo crítico da realidade preservado, bom insight sobre sua condição.',
    riskAssessment: 'Sem risco identificado', // Sem risco, Ideação passiva, Risco moderado, Alto risco
    riskNotes: ''
  });

  // 3. Sessões e Evoluções
  const [sessions, setSessions] = useState<any[]>([]);
  const [currentSession, setCurrentSession] = useState({
    sessionNumber: 1,
    sessionDate: new Date().toISOString().split('T')[0],
    modality: 'Individual (Presencial)',
    contentThemes: '',
    interventionsUsed: '',
    homeworkTasks: '',
    patientResponse: '',
    nextSessionPlan: ''
  });

  // 4. Metas Terapêuticas & Plano de Ação
  const [goals, setGoals] = useState<any[]>([
    {
      id: 'g-1',
      title: 'Identificação e Reestruturação de Pensamentos Disfuncionais',
      targetPeriod: 'Curto Prazo (4 semanas)',
      status: 'em_andamento',
      interventions: 'Registro de pensamentos disfuncionais (RPD), questionamento socrático.'
    }
  ]);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalPeriod, setNewGoalPeriod] = useState('Curto Prazo');
  const [newGoalInterventions, setNewGoalInterventions] = useState('');

  // 5. Documentos Oficiais CFP (Resolução CFP nº 06/2019)
  const [documentType, setDocumentType] = useState<
    'declaracao' | 'atestado' | 'relatorio' | 'laudo' | 'parecer'
  >('declaracao');
  const [documentContent, setDocumentContent] = useState<string>('');

  // Carrega lista de pacientes
  useEffect(() => {
    async function loadPatients() {
      try {
        const list = await ApiClient.get<any[]>('/v1/patients');
        setPatients(list || []);
      } catch (err: any) {
        console.error('Erro ao carregar pacientes:', err);
      }
    }
    loadPatients();
  }, []);

  // Sincroniza dados locais do paciente selecionado
  useEffect(() => {
    if (!selectedPatientId) {
      setSelectedPatient(null);
      return;
    }

    const pat = patients.find(p => p.id === selectedPatientId);
    setSelectedPatient(pat || null);

    // Carrega dados salvos no localStorage para persistência de rascunho de psicologia
    const storageKey = `zemda_psico_data_${selectedPatientId}`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.anamnese) setAnamnese(parsed.anamnese);
        if (parsed.mentalState) setMentalState(parsed.mentalState);
        if (parsed.sessions) setSessions(parsed.sessions);
        if (parsed.goals) setGoals(parsed.goals);
        if (parsed.currentSession) setCurrentSession(parsed.currentSession);
      } catch (e) {
        console.warn('Erro ao restaurar rascunho de psicologia:', e);
      }
    }
  }, [selectedPatientId, patients]);

  // Salvar rascunho local
  const saveToLocalStorage = () => {
    if (!selectedPatientId) return;
    const storageKey = `zemda_psico_data_${selectedPatientId}`;
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        anamnese,
        mentalState,
        sessions,
        goals,
        currentSession,
        updatedAt: new Date().toISOString()
      })
    );
  };

  const handleSaveAnamnese = () => {
    saveToLocalStorage();
    showToast('Anamnese psicológica salva com sucesso!', 'success');
  };

  const handleSaveMentalState = () => {
    saveToLocalStorage();
    showToast('Exame do Estado Mental atualizado!', 'success');
  };

  const handleAddSession = () => {
    if (!currentSession.contentThemes.trim()) {
      showToast('Preencha os conteúdos e intervenções da sessão antes de registrar', 'error');
      return;
    }

    const updated = [
      {
        id: `sess-${Date.now()}`,
        ...currentSession,
        registeredAt: new Date().toISOString()
      },
      ...sessions
    ];

    setSessions(updated);
    setCurrentSession({
      sessionNumber: updated.length + 1,
      sessionDate: new Date().toISOString().split('T')[0],
      modality: 'Individual (Presencial)',
      contentThemes: '',
      interventionsUsed: '',
      homeworkTasks: '',
      patientResponse: '',
      nextSessionPlan: ''
    });

    const storageKey = `zemda_psico_data_${selectedPatientId}`;
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        anamnese,
        mentalState,
        sessions: updated,
        goals,
        updatedAt: new Date().toISOString()
      })
    );

    showToast('Evolução da sessão registrada com sucesso!', 'success');
  };

  const handleAddGoal = () => {
    if (!newGoalTitle.trim()) return;
    const item = {
      id: `g-${Date.now()}`,
      title: newGoalTitle.trim(),
      targetPeriod: newGoalPeriod,
      status: 'em_andamento',
      interventions: newGoalInterventions.trim()
    };
    const updated = [...goals, item];
    setGoals(updated);
    setNewGoalTitle('');
    setNewGoalInterventions('');
    saveToLocalStorage();
    showToast('Meta terapêutica adicionada!', 'success');
  };

  const handleToggleGoalStatus = (goalId: string) => {
    const updated = goals.map(g => {
      if (g.id === goalId) {
        const nextStatus =
          g.status === 'a_iniciar'
            ? 'em_andamento'
            : g.status === 'em_andamento'
            ? 'alcancado'
            : 'a_iniciar';
        return { ...g, status: nextStatus };
      }
      return g;
    });
    setGoals(updated);
    saveToLocalStorage();
  };

  const handleDeleteGoal = (goalId: string) => {
    const updated = goals.filter(g => g.id !== goalId);
    setGoals(updated);
    saveToLocalStorage();
  };

  // Modelos de Documentos CFP (Resolução CFP nº 06/2019)
  const handleGenerateDocTemplate = (type: typeof documentType) => {
    setDocumentType(type);
    const pName = selectedPatient?.name || '__________________________';
    const profName = currentUser?.name || 'Psicólogo(a) Responsável';
    const crpNumber = (currentUser as any)?.registrationNumber || 'CRP XX/XXXX';
    const today = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

    let template = '';

    if (type === 'declaracao') {
      template = `DECLARAÇÃO PSICOLÓGICA\n\nDeclaro, para os devidos fins, que o(a) Sr.(a) ${pName} realiza acompanhamento psicoterapêutico nesta clínica sob meus cuidados profissionais, com frequência semanal, às ${today}.\n\nFinalidade: Comprovação de comparecimento / acompanhamento psicológico regular.\n\nPor ser verdade, firmo o presente.\n\n${today}.\n\n___________________________________\n${profName}\nPsicólogo(a) - ${crpNumber}`;
    } else if (type === 'atestado') {
      template = `ATESTADO PSICOLÓGICO\n\nEm conformidade com a Resolução CFP nº 06/2019, atesto que o(a) paciente ${pName} encontra-se em processo de avaliação e intervenção psicológica clínica. Foi constatada a necessidade de repouso/afastamento de suas atividades rotineiras pelo período de ____ dias a contar desta data, em virtude de sintomatologia psicológica observada em avaliação clínica.\n\nCID-11 / Hipótese: (A pedido expresso do paciente ou justificativa técnica relevante)\n\nLocal e data: ${today}.\n\n___________________________________\n${profName}\nPsicólogo(a) - ${crpNumber}`;
    } else if (type === 'relatorio') {
      template = `RELATÓRIO PSICOLÓGICO\n\n1. IDENTIFICAÇÃO\nPaciente: ${pName}\nPsicólogo(a) Responsável: ${profName} - ${crpNumber}\nInteressado: O(A) Próprio(a) / Solicitação Médica\nAssunto: Relatório de Acompanhamento Psicoterapêutico\n\n2. DESCRIÇÃO DA DEMANDA\n${anamnese.mainComplaint || 'Acompanhamento psicológico para manejo de sintomas e desenvolvimento pessoal.'}\n\n3. PROCEDIMENTO\nForam realizadas sessões semanais de psicoterapia com base na abordagem ${anamnese.theoreticalApproach}, além de anamnese e exame do estado mental.\n\n4. ANÁLISE E EVOLUÇÃO\nDurante o processo, o(a) paciente demonstrou engajamento nas intervenções propostas, apresentando evolução favorável na autorregulação emocional e enfrentamento das queixas iniciais.\n\n5. CONCLUSÃO\nRecomenda-se a continuidade do processo psicoterapêutico para consolidação dos ganhos clínicos obtidos.\n\n${today}.\n\n___________________________________\n${profName}\nPsicólogo(a) - ${crpNumber}`;
    } else if (type === 'laudo') {
      template = `LAUDO PSICOLÓGICO\n\n1. IDENTIFICAÇÃO\nPaciente: ${pName}\nResponsável Técnico: ${profName} - ${crpNumber}\nFinalidade: Avaliação Psicológica Pericial / Diagnóstica\n\n2. DESCRIÇÃO DA DEMANDA\nEncaminhamento para avaliação de funções cognitivas, afetivas e comportamentais.\n\n3. PROCEDIMENTO\nEntrevistas clínicas, anamnese detalhada, exame do estado mental e instrumentos psicométricos privativos de psicólogos favoráveis pelo SATEPSI.\n\n4. ANÁLISE\nAnálise integrada dos dados quantitativos e qualitativos observados.\n\n5. CONCLUSÃO\nSíntese compreensiva do funcionamento psicológico e recomendações terapêuticas.\n\n${today}.\n\n___________________________________\n${profName}\nPsicólogo(a) - ${crpNumber}`;
    } else if (type === 'parecer') {
      template = `PARECER PSICOLÓGICO\n\n1. IDENTIFICAÇÃO\nSolicitante: ___________________________\nEspecialista: ${profName} - ${crpNumber}\n\n2. EMENTA\nParecer técnico fundamentado sobre questão psicológica submetida à apreciação.\n\n3. EXPOSIÇÃO DE MOTIVOS\nAnálise dos quesitos formulados à luz da literatura científica e ética psicológica.\n\n4. CONCLUSÃO\nManifestação conclusiva fundamentada.\n\n${today}.\n\n___________________________________\n${profName}\nPsicólogo(a) - ${crpNumber}`;
    }

    setDocumentContent(template);
  };

  // Finalizar Atendimento Psicológico
  const handleFinishConsultation = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente para concluir o atendimento', 'error');
      return;
    }

    const sessionNotes = currentSession.contentThemes.trim() ||
      (sessions.length > 0 ? sessions[0].contentThemes : 'Atendimento psicoterapêutico concluído.');

    try {
      setSaving(true);
      await completion.save('/v1/clinical-records', {
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId || undefined,
        title: `Sessão de Psicoterapia (${anamnese.theoreticalApproach})`,
        clinicalEvolution: sessionNotes,
        conductPlan: currentSession.nextSessionPlan || 'Manter acompanhamento psicoterapêutico semanal.',
        specialtyOrModule: 'ZemdaPsico',
        mentalStateSummary: `Humor: ${mentalState.moodAffect}. Risco: ${mentalState.riskAssessment}.`,
        goalsSummary: goals.map(g => `• [${g.status}] ${g.title}`).join('\n')
      });

      saveToLocalStorage();
      showToast('Atendimento de Psicologia registrado e selado com sucesso!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao finalizar atendimento', 'error');
    } finally {
      setSaving(false);
    }
  };

  const filteredPatients = patients.filter(p =>
    p.name.toLowerCase().includes(searchPatient.toLowerCase()) ||
    (p.cpf && p.cpf.includes(searchPatient))
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Principal do Módulo */}
      <div className="bg-gradient-to-r from-teal-900 via-emerald-800 to-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 border border-teal-700/30">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner">
            <Brain className="w-8 h-8 text-teal-300 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-teal-400/20 text-teal-200 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border border-teal-400/30 tracking-wider">
                Conselho Federal de Psicologia • CFP
              </span>
              <span className="text-xs text-slate-300 font-semibold">• Prontuário Eletrônico</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white mt-1">
              ZemdaPsico • Psicologia Clínica
            </h1>
            <p className="text-xs text-teal-100/80 mt-0.5">
              Anamnese compreensiva, exame do estado mental, registro confidencial de sessões e emissão conforme Resolução CFP 06/2019.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {selectedPatientId && (
            <button
              type="button"
              onClick={() => setShowPreviousRecordsModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all border border-white/20 cursor-pointer"
            >
              <History className="w-4 h-4 text-teal-300" />
              <span>Ver Histórico Multidisciplinar</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleFinishConsultation}
            disabled={saving || !selectedPatientId}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-md hover:shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-4 h-4 text-slate-950" />
            <span>{saving ? 'Registrando...' : 'Concluir Atendimento'}</span>
          </button>
        </div>
      </div>

      {/* Barra de Seleção de Paciente */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 shrink-0">
            <User className="w-5 h-5" />
          </div>
          <div className="flex-1 max-w-md">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              {clientTermLabel} Selecionado(a)
            </label>
            <select
              value={selectedPatientId}
              onChange={e => setSelectedPatientId(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 transition-all"
            >
              <option value="">Selecione um(a) {clientTermLabel.toLowerCase()}...</option>
              {filteredPatients.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.cpf ? `(${p.cpf})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedPatient && (
          <div className="flex items-center gap-4 bg-teal-50/60 border border-teal-100 rounded-xl px-3.5 py-2 text-xs text-slate-600">
            <div>
              <span className="text-[10px] text-teal-800 font-bold block">Abordagem Ativa:</span>
              <span className="font-semibold text-slate-800">{anamnese.theoreticalApproach}</span>
            </div>
            <div className="border-l border-teal-200 pl-4">
              <span className="text-[10px] text-teal-800 font-bold block">Status do Risco:</span>
              <span className={`font-semibold ${
                mentalState.riskAssessment === 'Sem risco identificado'
                  ? 'text-emerald-700'
                  : 'text-rose-600 font-bold'
              }`}>
                {mentalState.riskAssessment}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Navegação por Abas do ZemdaPsico */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto pb-1">
        {[
          { key: 'anamnese', label: '1. Anamnese Psicológica', icon: BookOpen },
          { key: 'mental_state', label: '2. Exame do Estado Mental', icon: HeartPulse },
          { key: 'sessions', label: '3. Sessões & Evoluções', icon: Clock },
          { key: 'goals', label: '4. Metas Terapêuticas', icon: Target },
          { key: 'documents', label: '5. Documentos CFP (Res. 06/19)', icon: FileText }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as TabKey)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Conteúdo das Abas */}
      {activeTab === 'anamnese' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Anamnese Psicológica e Levantamento Clínico</h2>
              <p className="text-xs text-slate-500">Histórico detalhado da queixa, rede de apoio e linha teórica de intervenção.</p>
            </div>
            <button
              type="button"
              onClick={handleSaveAnamnese}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" /> Salvar Anamnese
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Abordagem Teórica Primária</label>
              <select
                value={anamnese.theoreticalApproach}
                onChange={e => setAnamnese({ ...anamnese, theoreticalApproach: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-semibold text-slate-800"
              >
                <option value="Terapia Cognitivo-Comportamental (TCC)">Terapia Cognitivo-Comportamental (TCC)</option>
                <option value="Psicanálise Freudiana / Lacaniana / Winnicottiana">Psicanálise</option>
                <option value="Fenomenológico-Existencial / Humanista">Fenomenológico-Existencial / Humanista</option>
                <option value="Terapia de Aceitação e Compromisso (ACT)">Terapia de Aceitação e Compromisso (ACT)</option>
                <option value="Análise do Comportamento Aplicada (ABA)">Análise do Comportamento Aplicada (ABA)</option>
                <option value="Terapia Sistêmica Familiar">Terapia Sistêmica Familiar</option>
                <option value="Gestalt-Terapia">Gestalt-Terapia</option>
                <option value="Neuropsicologia Clínica">Neuropsicologia Clínica</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Hipóteses Diagnósticas (CID-11 / DSM-5)</label>
              <input
                type="text"
                value={anamnese.diagnosticHypothesis}
                onChange={e => setAnamnese({ ...anamnese, diagnosticHypothesis: e.target.value })}
                placeholder="Ex: F41.1 Transtorno de Ansiedade Generalizada / F32.1 Episódio Depressivo..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-semibold"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Queixa Principal e Demanda Espontânea *</label>
              <textarea
                rows={3}
                value={anamnese.mainComplaint}
                onChange={e => setAnamnese({ ...anamnese, mainComplaint: e.target.value })}
                placeholder="Relato trazido pelo paciente em suas próprias palavras sobre o motivo da busca por atendimento..."
                className="w-full border border-slate-200 rounded-xl p-3 text-xs focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Histórico do Sintoma e Desencadeantes</label>
              <textarea
                rows={4}
                value={anamnese.symptomHistory}
                onChange={e => setAnamnese({ ...anamnese, symptomHistory: e.target.value })}
                placeholder="Início dos sintomas, frequência, intensidade, prejuízos funcionais nas rotinas..."
                className="w-full border border-slate-200 rounded-xl p-3 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Histórico Pessoal, Familiar e Dinâmica Relacional</label>
              <textarea
                rows={4}
                value={anamnese.personalFamilyHistory}
                onChange={e => setAnamnese({ ...anamnese, personalFamilyHistory: e.target.value })}
                placeholder="Infância, histórico de vínculos afetivos, conflitos familiares, perdas significativas..."
                className="w-full border border-slate-200 rounded-xl p-3 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Histórico Médico, Psiquiátrico e Medicamentoso</label>
              <textarea
                rows={3}
                value={anamnese.medicalPsychiatricHistory}
                onChange={e => setAnamnese({ ...anamnese, medicalPsychiatricHistory: e.target.value })}
                placeholder="Tratamentos prévios, psiquiatra assistente, internações, uso de substâncias..."
                className="w-full border border-slate-200 rounded-xl p-3 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Rede de Apoio e Recursos de Enfrentamento</label>
              <textarea
                rows={3}
                value={anamnese.supportNetwork}
                onChange={e => setAnamnese({ ...anamnese, supportNetwork: e.target.value })}
                placeholder="Amigos, familiares, hobbies, religiosidade/espiritualidade, fatores de proteção..."
                className="w-full border border-slate-200 rounded-xl p-3 text-xs"
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'mental_state' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Exame do Estado Mental (EEM)</h2>
              <p className="text-xs text-slate-500">Avaliação semiótica estruturada das funções psíquicas e psicopatologia.</p>
            </div>
            <button
              type="button"
              onClick={handleSaveMentalState}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" /> Salvar Exame Mental
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Humor e Afeto *</label>
              <select
                value={mentalState.moodAffect}
                onChange={e => setMentalState({ ...mentalState, moodAffect: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-semibold"
              >
                <option value="Eutímico (Normal/Estável)">Eutímico (Normal / Estável)</option>
                <option value="Ansioso / Angustiado">Ansioso / Angustiado</option>
                <option value="Deprimido / Triste">Deprimido / Triste</option>
                <option value="Disfórico / Irritável">Disfórico / Irritável</option>
                <option value="Lábil / Instável">Lábil / Instável</option>
                <option value="Embotado / Aplanado">Embotado / Aplanado</option>
                <option value="Euforico / Expansivo">Eufórico / Expansivo</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Avaliação de Risco (Suicídio / Autoagressão) *</label>
              <select
                value={mentalState.riskAssessment}
                onChange={e => setMentalState({ ...mentalState, riskAssessment: e.target.value })}
                className={`w-full border rounded-xl px-3 py-2 font-bold ${
                  mentalState.riskAssessment === 'Sem risco identificado'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-rose-400 bg-rose-50 text-rose-800 ring-2 ring-rose-400'
                }`}
              >
                <option value="Sem risco identificado">Sem risco identificado</option>
                <option value="Ideação passiva sem planejamento">Ideação passiva sem planejamento</option>
                <option value="Risco moderado (com histórico ou fatores)">Risco moderado (com histórico ou fatores)</option>
                <option value="Alto risco (planejamento ativo - intervir)">Alto risco (planejamento ativo - intervir)</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Aparência, Postura e Atitude</label>
              <textarea
                rows={2}
                value={mentalState.appearanceBehavior}
                onChange={e => setMentalState({ ...mentalState, appearanceBehavior: e.target.value })}
                className="w-full border border-slate-200 rounded-xl p-2.5"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Consciência e Orientação</label>
              <textarea
                rows={2}
                value={mentalState.consciousnessOrientation}
                onChange={e => setMentalState({ ...mentalState, consciousnessOrientation: e.target.value })}
                className="w-full border border-slate-200 rounded-xl p-2.5"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Pensamento (Curso, Forma e Conteúdo)</label>
              <textarea
                rows={2}
                value={mentalState.thoughtProcess}
                onChange={e => setMentalState({ ...mentalState, thoughtProcess: e.target.value })}
                className="w-full border border-slate-200 rounded-xl p-2.5"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Sensopercepção e Juízo Crítico (Insight)</label>
              <textarea
                rows={2}
                value={mentalState.insightJudgement}
                onChange={e => setMentalState({ ...mentalState, insightJudgement: e.target.value })}
                className="w-full border border-slate-200 rounded-xl p-2.5"
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'sessions' && (
        <div className="space-y-6">
          {/* Formulário de Registro de Nova Sessão */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Evolução da Sessão Atual</h2>
                <p className="text-xs text-slate-500">Registro confidencial do processo psicoterapêutico.</p>
              </div>
              <button
                type="button"
                onClick={handleAddSession}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Registrar Sessão no Histórico
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Número da Sessão</label>
                <input
                  type="number"
                  value={currentSession.sessionNumber}
                  onChange={e => setCurrentSession({ ...currentSession, sessionNumber: Number(e.target.value) })}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Data da Sessão</label>
                <input
                  type="date"
                  value={currentSession.sessionDate}
                  onChange={e => setCurrentSession({ ...currentSession, sessionDate: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Modalidade do Atendimento</label>
                <select
                  value={currentSession.modality}
                  onChange={e => setCurrentSession({ ...currentSession, modality: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-semibold"
                >
                  <option value="Individual (Presencial)">Individual (Presencial)</option>
                  <option value="Individual (Online)">Individual (Online)</option>
                  <option value="Casal / Familiar">Casal / Familiar</option>
                  <option value="Grupo Terapêutico">Grupo Terapêutico</option>
                  <option value="Orientação de Pais / Cuidadores">Orientação de Pais / Cuidadores</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="block font-bold text-slate-700 mb-1">Conteúdos Abordados e Temas da Sessão *</label>
                <textarea
                  rows={3}
                  value={currentSession.contentThemes}
                  onChange={e => setCurrentSession({ ...currentSession, contentThemes: e.target.value })}
                  placeholder="Relato dos tópicos trazidos, narrativa do paciente, gatilhos identificados..."
                  className="w-full border border-slate-200 rounded-xl p-3 text-xs"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Intervenções e Técnicas Empregadas</label>
                <input
                  type="text"
                  value={currentSession.interventionsUsed}
                  onChange={e => setCurrentSession({ ...currentSession, interventionsUsed: e.target.value })}
                  placeholder="Ex: Psicoeducação, Registro de Pensamentos, Role-playing, Dessensibilização..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Plano para Próxima Sessão</label>
                <input
                  type="text"
                  value={currentSession.nextSessionPlan}
                  onChange={e => setCurrentSession({ ...currentSession, nextSessionPlan: e.target.value })}
                  placeholder="Ex: Retomar crença intermediária de desvalor..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Lista de Sessões Anteriores */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <History className="w-4 h-4 text-teal-600" />
              <span>Histórico de Sessões Registradas ({sessions.length})</span>
            </h3>

            {sessions.length === 0 ? (
              <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-6 text-center text-xs text-slate-500">
                Nenhuma sessão anterior gravada ainda neste dispositivo para este paciente.
              </div>
            ) : (
              sessions.map(sess => (
                <div key={sess.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-xs">Sessão #{sess.sessionNumber}</span>
                      <span className="text-[11px] text-slate-400">• {new Date(sess.sessionDate).toLocaleDateString('pt-BR')}</span>
                      <span className="text-[10px] bg-teal-50 text-teal-700 font-semibold px-2 py-0.5 rounded-full border border-teal-200">
                        {sess.modality}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">{sess.contentThemes}</p>
                  {sess.interventionsUsed && (
                    <p className="text-[11px] text-teal-700 font-medium">
                      <strong>Técnicas:</strong> {sess.interventionsUsed}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'goals' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-xs">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900">Metas Terapêuticas e Indicadores de Progresso</h2>
            <p className="text-xs text-slate-500">Objetivos acordados com o paciente e acompanhamento longitudinal.</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={newGoalTitle}
              onChange={e => setNewGoalTitle(e.target.value)}
              placeholder="Descreva uma meta terapêutica clara e mensurável..."
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs"
            />
            <select
              value={newGoalPeriod}
              onChange={e => setNewGoalPeriod(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-semibold"
            >
              <option value="Curto Prazo (1 a 4 semanas)">Curto Prazo (1 a 4 semanas)</option>
              <option value="Médio Prazo (1 a 3 meses)">Médio Prazo (1 a 3 meses)</option>
              <option value="Longo Prazo (6+ meses)">Longo Prazo (6+ meses)</option>
            </select>
            <button
              type="button"
              onClick={handleAddGoal}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar Meta
            </button>
          </div>

          <div className="space-y-2.5">
            {goals.map(goal => (
              <div
                key={goal.id}
                className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 hover:border-teal-200 bg-slate-50/50 transition-all text-xs"
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleToggleGoalStatus(goal.id)}
                    className="cursor-pointer"
                    title="Alternar status da meta"
                  >
                    {goal.status === 'alcancado' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        goal.status === 'em_andamento' ? 'border-amber-500 bg-amber-50' : 'border-slate-300'
                      }`}>
                        {goal.status === 'em_andamento' && <div className="w-2 h-2 rounded-full bg-amber-500" />}
                      </div>
                    )}
                  </button>
                  <div>
                    <span className={`font-semibold text-slate-800 ${goal.status === 'alcancado' ? 'line-through text-slate-400' : ''}`}>
                      {goal.title}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                      <span>{goal.targetPeriod}</span>
                      <span>•</span>
                      <span className={`font-bold ${
                        goal.status === 'alcancado'
                          ? 'text-emerald-600'
                          : goal.status === 'em_andamento'
                          ? 'text-amber-600'
                          : 'text-slate-500'
                      }`}>
                        {goal.status === 'alcancado' ? 'Alcançada' : goal.status === 'em_andamento' ? 'Em andamento' : 'A iniciar'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteGoal(goal.id)}
                  className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                  title="Excluir meta"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Emissão de Documentos Psicológicos</h2>
              <p className="text-xs text-slate-500">Padrão rigoroso em conformidade com a Resolução CFP nº 06/2019.</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimir Documento
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { type: 'declaracao', label: 'Declaração' },
              { type: 'atestado', label: 'Atestado Psicológico' },
              { type: 'relatorio', label: 'Relatório Psicológico' },
              { type: 'laudo', label: 'Laudo Psicológico' },
              { type: 'parecer', label: 'Parecer Psicológico' }
            ].map(d => (
              <button
                key={d.type}
                type="button"
                onClick={() => handleGenerateDocTemplate(d.type as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  documentType === d.type
                    ? 'bg-teal-700 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Gerar {d.label}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Corpo do Documento (Editável)
            </label>
            <textarea
              rows={14}
              value={documentContent}
              onChange={e => setDocumentContent(e.target.value)}
              placeholder="Clique em um dos tipos de documento acima para gerar o modelo oficial com os dados do paciente..."
              className="w-full border border-slate-200 rounded-xl p-4 text-xs font-mono leading-relaxed bg-slate-50/40 focus:bg-white focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>
      )}

      {/* Modal Histórico Anterior Multidisciplinar */}
      {showPreviousRecordsModal && selectedPatient && (
        <PatientPreviousRecordsModal
          isOpen={showPreviousRecordsModal}
          onClose={() => setShowPreviousRecordsModal(false)}
          patientId={selectedPatient.id}
          patientName={selectedPatient.name}
        />
      )}

      {/* Diálogo de Pagamento / Conclusão de Consulta do Hook */}
      {completion.dialog}
    </div>
  );
};
