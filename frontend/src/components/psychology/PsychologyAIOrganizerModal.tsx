import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Users,
  Brain,
  Sparkles,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  ArrowRight,
  RefreshCw,
  Info,
  Check,
  Split,
  MessageSquare
} from 'lucide-react';
import {
  DiarizedSegment,
  StructuredExtractionResult,
  StructuredFieldSuggestion,
  formatTimestamp,
  parseRawTranscriptToSegments,
  requestPsychologyTranscriptStructure,
  fetchDiarizationStatus
} from '../../services/transcriptionProvider';

interface CurrentRecordData {
  session: Record<string, any>;
  anamnese: Record<string, any>;
  mentalState: Record<string, any>;
  riskAssessment: Record<string, any>;
  newAssessment?: Record<string, any>;
  goalsList?: any[];
}

interface PsychologyAIOrganizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId?: string;
  patientName?: string;
  appointmentId?: string;
  currentData: CurrentRecordData;
  onApplyField: (
    section: 'session' | 'anamnese' | 'mentalState' | 'riskAssessment' | 'assessment' | 'goals',
    fieldKey: string,
    value: string,
    action: 'replace' | 'append'
  ) => void;
  onApplyGoal?: (goal: any) => void;
}

export const PsychologyAIOrganizerModal: React.FC<PsychologyAIOrganizerModalProps> = ({
  isOpen,
  onClose,
  patientId,
  patientName,
  appointmentId,
  currentData,
  onApplyField,
  onApplyGoal
}) => {
  const [activeTab, setActiveTab] = useState<'transcript' | 'suggestions'>('transcript');

  // Transcrição Diarizada
  const [segments, setSegments] = useState<DiarizedSegment[]>([
    {
      id: 'seg_1',
      speakerId: 'speaker_1',
      text: 'Olá! Como você passou desde o nosso último encontro?',
      startTime: 10,
      endTime: 14
    },
    {
      id: 'seg_2',
      speakerId: 'speaker_2',
      text: 'Essa semana eu tive muita dificuldade para dormir, cerca de quatro horas por noite, com bastante ansiedade por causa da sobrecarga de trabalho.',
      startTime: 16,
      endTime: 28
    },
    {
      id: 'seg_3',
      speakerId: 'speaker_1',
      text: 'Compreendo. Você percebeu pensamentos específicos ou momentos do dia em que essa angústia se intensificou?',
      startTime: 30,
      endTime: 38
    },
    {
      id: 'seg_4',
      speakerId: 'speaker_2',
      text: 'Principalmente à noite ao deitar. Fico ruminando problemas com meu chefe e me cobrando. Minha mãe tentou me acalmar, mas me sinto sem energia.',
      startTime: 40,
      endTime: 55
    }
  ]);

  const [rawPastedText, setRawPastedText] = useState('');
  const [showPasteArea, setShowPasteArea] = useState(false);

  // Mapeamento de Falantes
  const [speakersMap, setSpeakersMap] = useState<Record<string, 'professional' | 'patient' | 'family' | 'other'>>({
    speaker_1: 'professional',
    speaker_2: 'patient',
    speaker_3: 'family'
  });
  const [rolesConfirmed, setRolesConfirmed] = useState(true);

  // Status dos provedores
  const [providerInfo, setProviderInfo] = useState<any>(null);

  // Análise Estruturada por IA
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<StructuredExtractionResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Filtros de Sugestões
  type SectionFilter = 'all' | 'session' | 'anamnesis' | 'mentalState' | 'riskAssessment' | 'goals';
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<SectionFilter>('all');

  // Seleção em lote de sugestões
  const [selectedSuggestions, setSelectedSuggestions] = useState<Record<string, boolean>>({});

  // Conflitos de aplicação individual (campo com conteúdo prévio)
  const [conflictTarget, setConflictTarget] = useState<{
    section: 'session' | 'anamnese' | 'mentalState' | 'riskAssessment' | 'assessment' | 'goals';
    fieldKey: string;
    label: string;
    currentValue: string;
    suggestedValue: string;
  } | null>(null);

  // Carrega status de provedores
  useEffect(() => {
    if (isOpen) {
      fetchDiarizationStatus()
        .then(data => setProviderInfo(data))
        .catch(() => {});
    }
  }, [isOpen]);

  // Lista única de falantes presentes nos segmentos
  const uniqueSpeakers = useMemo(() => {
    const set = new Set<string>();
    segments.forEach(s => set.add(s.speakerId));
    return Array.from(set);
  }, [segments]);

  // Handler para importar texto colado
  const handleImportPastedText = () => {
    if (!rawPastedText.trim()) return;
    const parsed = parseRawTranscriptToSegments(rawPastedText);
    if (parsed.length > 0) {
      setSegments(parsed);
      setRawPastedText('');
      setShowPasteArea(false);
    }
  };

  // Handler para adicionar novo segmento manual
  const handleAddSegment = () => {
    const last = segments[segments.length - 1];
    const nextStart = last ? (last.endTime || last.startTime || 0) + 2 : 0;
    const nextSpeaker = last?.speakerId === 'speaker_1' ? 'speaker_2' : 'speaker_1';
    setSegments(prev => [
      ...prev,
      {
        id: `seg_${Date.now()}`,
        speakerId: nextSpeaker,
        text: '',
        startTime: nextStart,
        endTime: nextStart + 5
      }
    ]);
  };

  // Handler para atualizar texto do segmento
  const handleUpdateSegmentText = (id: string, text: string) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, text } : s));
  };

  // Handler para trocar falante do segmento
  const handleUpdateSegmentSpeaker = (id: string, speakerId: string) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, speakerId } : s));
  };

  // Handler para remover segmento
  const handleRemoveSegment = (id: string) => {
    setSegments(prev => prev.filter(s => s.id !== id));
  };

  // Handler de análise com IA ("Organizar Atendimento com IA")
  const handleRunAnalysis = async () => {
    if (segments.length === 0) return;
    setLoadingAnalysis(true);
    setAnalysisError(null);
    try {
      const result = await requestPsychologyTranscriptStructure({
        patientId,
        appointmentId,
        transcript: segments,
        speakers: speakersMap
      });
      setAnalysisResult(result);
      setActiveTab('suggestions');

      // Seleciona todas as sugestões por padrão
      const initialSelection: Record<string, boolean> = {};
      if (result.sections.session) {
        Object.entries(result.sections.session).forEach(([k, v]) => {
          if (v) initialSelection[`session.${k}`] = true;
        });
      }
      if (result.sections.anamnesis) {
        Object.entries(result.sections.anamnesis).forEach(([k, v]) => {
          if (v) initialSelection[`anamnese.${k}`] = true;
        });
      }
      if (result.sections.mentalState) {
        Object.entries(result.sections.mentalState).forEach(([k, v]) => {
          if (v) initialSelection[`mentalState.${k}`] = true;
        });
      }
      if (result.sections.riskAssessment) {
        Object.entries(result.sections.riskAssessment).forEach(([k, v]) => {
          if (v) initialSelection[`riskAssessment.${k}`] = true;
        });
      }
      setSelectedSuggestions(initialSelection);
    } catch (err: any) {
      setAnalysisError(err.message || 'Falha ao analisar transcrição.');
    } finally {
      setLoadingAnalysis(false);
    }
  };

  // Verifica se um campo tem conteúdo existente no prontuário
  const getExistingFieldValue = (section: string, fieldKey: string): string => {
    const sKey = section === 'anamnesis' ? 'anamnese' : section;
    const secObj = (currentData as any)[sKey];
    if (secObj && secObj[fieldKey] !== undefined) {
      return String(secObj[fieldKey] || '').trim();
    }
    return '';
  };

  // Aplicação individual com checagem de conflito
  const handleInitiateApplyField = (
    section: 'session' | 'anamnese' | 'mentalState' | 'riskAssessment' | 'assessment' | 'goals',
    fieldKey: string,
    label: string,
    suggestedValue: string
  ) => {
    const existing = getExistingFieldValue(section, fieldKey);
    if (existing) {
      // Tem conflito: abre tela de resolução
      setConflictTarget({
        section,
        fieldKey,
        label,
        currentValue: existing,
        suggestedValue
      });
    } else {
      // Não tem conflito: aplica direto
      onApplyField(section, fieldKey, suggestedValue, 'replace');
    }
  };

  // Confirmação de resolução de conflito
  const handleResolveConflict = (action: 'keep' | 'append' | 'replace') => {
    if (!conflictTarget) return;
    if (action === 'append') {
      onApplyField(conflictTarget.section, conflictTarget.fieldKey, conflictTarget.suggestedValue, 'append');
    } else if (action === 'replace') {
      onApplyField(conflictTarget.section, conflictTarget.fieldKey, conflictTarget.suggestedValue, 'replace');
    }
    setConflictTarget(null);
  };

  // Aplicação de toda uma seção
  const handleApplySection = (sectionKey: 'session' | 'anamnesis' | 'mentalState' | 'riskAssessment') => {
    if (!analysisResult) return;
    const secObj = (analysisResult.sections as any)[sectionKey];
    if (!secObj) return;

    const targetSection = sectionKey === 'anamnesis' ? 'anamnese' : sectionKey;

    Object.entries(secObj).forEach(([fieldKey, item]: [string, any]) => {
      if (item && item.value) {
        const existing = getExistingFieldValue(targetSection, fieldKey);
        if (existing) {
          // Concatena se já houver texto
          onApplyField(targetSection as any, fieldKey, item.value, 'append');
        } else {
          onApplyField(targetSection as any, fieldKey, item.value, 'replace');
        }
      }
    });
  };

  // Aplicação das selecionadas
  const handleApplySelected = () => {
    if (!analysisResult) return;

    const sections = analysisResult.sections;
    Object.entries(selectedSuggestions).forEach(([fullKey, isChecked]) => {
      if (!isChecked) return;
      const [secName, fieldKey] = fullKey.split('.');
      const sourceSec = secName === 'anamnese' ? 'anamnesis' : secName;
      const secObj = (sections as any)[sourceSec];
      const item = secObj ? secObj[fieldKey] : null;

      if (item && item.value) {
        const existing = getExistingFieldValue(secName, fieldKey);
        if (existing) {
          onApplyField(secName as any, fieldKey, item.value, 'append');
        } else {
          onApplyField(secName as any, fieldKey, item.value, 'replace');
        }
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">

        {/* ================================================================= */}
        {/* CABEÇALHO DO MODAL */}
        {/* ================================================================= */}
        <div className="px-6 py-4 border-b border-slate-200 bg-linear-to-r from-teal-50/70 via-slate-50 to-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-md shadow-teal-600/20">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-slate-900">
                  Diarização de Falantes & Organização Clínica com IA
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
                  ZemdaPsico CFP
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {patientName ? `Paciente: ${patientName}` : 'Atendimento Psicológico'} • Separação de vozes, papéis e estruturação clínica
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ================================================================= */}
        {/* AVISO ÉTICO CFP */}
        {/* ================================================================= */}
        <div className="bg-amber-50/70 border-b border-amber-200/60 px-6 py-2 flex items-center justify-between text-xs text-amber-900 gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              <strong>Diretrizes CFP:</strong> A IA apoia a documentação como rascunho de apoio confidencial. Não atribui diagnósticos, nem escores preditivos de risco. Decisão clínica exclusiva do psicólogo.
            </span>
          </div>
          <span className="text-[11px] font-semibold text-amber-800 shrink-0">Privacidade LGPD Ativa</span>
        </div>

        {/* ================================================================= */}
        {/* ABAS DO MODAL */}
        {/* ================================================================= */}
        <div className="px-6 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('transcript')}
              className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'transcript'
                  ? 'border-teal-600 text-teal-800 bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              1. Transcrição & Diarização ({segments.length} turnos)
            </button>
            <button
              onClick={() => setActiveTab('suggestions')}
              className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'suggestions'
                  ? 'border-teal-600 text-teal-800 bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Sparkles className="w-4 h-4 text-teal-600" />
              2. Sugestões Clínicas Estruturadas
              {analysisResult && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-teal-100 text-teal-800 font-extrabold">
                  Pronto
                </span>
              )}
            </button>
          </div>

          {activeTab === 'transcript' && (
            <button
              onClick={handleRunAnalysis}
              disabled={loadingAnalysis || segments.length === 0}
              className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 rounded-lg shadow-sm transition-all shadow-teal-600/20"
            >
              {loadingAnalysis ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Organizando com IA...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Organizar Atendimento com IA
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          )}

          {activeTab === 'suggestions' && (
            <div className="flex items-center gap-2 py-2">
              <button
                onClick={handleApplySelected}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors"
                title="Aplica as sugestões selecionadas com caixas de checagem"
              >
                <Check className="w-3.5 h-3.5 text-teal-600" />
                Aplicar Sugestões Selecionadas
              </button>
            </div>
          )}
        </div>

        {/* ================================================================= */}
        {/* CORPO DO MODAL */}
        {/* ================================================================= */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* ------------------------------------------------------------- */}
          {/* ABA 1: TRANSCRIÇÃO & DIARIZAÇÃO */}
          {/* ------------------------------------------------------------- */}
          {activeTab === 'transcript' && (
            <div className="space-y-6">
              {/* Informações do Provedor de Transcrição */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs">
                <div className="flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-800">
                      Provedor Atual: {providerInfo?.providers?.[0]?.name || 'Web Speech API (Navegador)'}
                    </span>
                    <p className="text-slate-600 mt-0.5 leading-relaxed">
                      O reconhecimento do navegador é monocanal e não realiza diarização acústica por biometria. Os turnos de fala abaixo são separados por marcadores de segmento e timestamps. Você pode identificar e atribuir os papéis dos falantes abaixo.
                    </p>
                  </div>
                </div>
              </div>

              {/* Painel de Identificação de Papéis dos Falantes */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-teal-600" />
                    <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                      Identificação dos Papéis dos Falantes (Sem Inferência Automática por Voz)
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    O profissional confirma a correspondência entre falante e papel
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {uniqueSpeakers.map((spkId) => {
                    const currentRole = speakersMap[spkId] || (spkId === 'speaker_1' ? 'professional' : 'patient');
                    return (
                      <div key={spkId} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-700 text-xs">
                            {spkId === 'speaker_1' ? 'Falante 1' : spkId === 'speaker_2' ? 'Falante 2' : spkId === 'speaker_3' ? 'Falante 3' : spkId}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            currentRole === 'professional' ? 'bg-teal-100 text-teal-800' :
                            currentRole === 'patient' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {currentRole === 'professional' ? 'Profissional' : currentRole === 'patient' ? 'Paciente' : 'Familiar / Outro'}
                          </span>
                        </div>
                        <select
                          value={currentRole}
                          onChange={(e) => {
                            const newRole = e.target.value as any;
                            setSpeakersMap(p => ({ ...p, [spkId]: newRole }));
                            setRolesConfirmed(true);
                          }}
                          className="w-full text-xs bg-white border border-slate-300 rounded-md px-2 py-1.5 text-slate-800 focus:ring-1 focus:ring-teal-500"
                        >
                          <option value="professional">Profissional (Psicólogo)</option>
                          <option value="patient">Paciente</option>
                          <option value="family">Familiar / Responsável</option>
                          <option value="other">Outro Participante</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Botões de Ação da Transcrição */}
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  Diálogo da Sessão com Timestamps
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowPasteArea(!showPasteArea)}
                    className="text-xs text-slate-600 hover:text-teal-700 font-semibold px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
                  >
                    {showPasteArea ? 'Ocultar Área de Importação' : 'Colar / Importar Texto'}
                  </button>
                  <button
                    onClick={handleAddSegment}
                    className="inline-flex items-center gap-1 text-xs text-teal-700 hover:text-teal-800 font-semibold px-2 py-1 rounded border border-teal-200 bg-teal-50 hover:bg-teal-100"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar Turno
                  </button>
                </div>
              </div>

              {/* Área Opcional de Colar Transcrição */}
              {showPasteArea && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                  <label className="font-bold text-xs text-slate-700 block">
                    Cole o diálogo da sessão com marcadores de falante ou timestamps:
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Formatos aceitos: <code>[00:01:12] Falante 1: Olá</code> ou <code>Falante 2: Relato...</code>
                  </p>
                  <textarea
                    value={rawPastedText}
                    onChange={e => setRawPastedText(e.target.value)}
                    placeholder="[00:01:12] Profissional: Como foi sua semana?&#10;[00:01:17] Paciente: Tive muita dificuldade para dormir..."
                    rows={4}
                    className="w-full text-xs font-mono p-2.5 bg-white border border-slate-300 rounded-lg"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowPasteArea(false)}
                      className="px-3 py-1 text-xs text-slate-500 hover:text-slate-700"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleImportPastedText}
                      className="px-3 py-1 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-2xs"
                    >
                      Processar e Separar Turnos
                    </button>
                  </div>
                </div>
              )}

              {/* Lista Visual de Turnos de Fala */}
              <div className="space-y-3">
                {segments.map((seg, idx) => {
                  const role = speakersMap[seg.speakerId] || (seg.speakerId === 'speaker_1' ? 'professional' : 'patient');
                  const isProfessional = role === 'professional';
                  const isPatient = role === 'patient';

                  return (
                    <div
                      key={seg.id}
                      className={`rounded-xl border p-3.5 transition-all text-xs ${
                        isProfessional
                          ? 'bg-teal-50/40 border-teal-200/80 shadow-2xs'
                          : isPatient
                          ? 'bg-blue-50/40 border-blue-200/80 shadow-2xs'
                          : 'bg-amber-50/40 border-amber-200/80 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md font-extrabold text-[11px] uppercase tracking-wider ${
                            isProfessional ? 'bg-teal-600 text-white' :
                            isPatient ? 'bg-blue-600 text-white' : 'bg-amber-600 text-white'
                          }`}>
                            {isProfessional ? 'Profissional' : isPatient ? 'Paciente' : 'Familiar / Outro'}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500 font-semibold flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            [{formatTimestamp(seg.startTime)}]
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            value={seg.speakerId}
                            onChange={(e) => handleUpdateSegmentSpeaker(seg.id, e.target.value)}
                            className="text-[11px] bg-white border border-slate-300 rounded px-2 py-0.5 text-slate-700"
                          >
                            <option value="speaker_1">Falante 1 ({speakersMap.speaker_1 === 'professional' ? 'Profissional' : 'Paciente'})</option>
                            <option value="speaker_2">Falante 2 ({speakersMap.speaker_2 === 'patient' ? 'Paciente' : 'Profissional'})</option>
                            <option value="speaker_3">Falante 3 (Outro / Familiar)</option>
                          </select>
                          <button
                            onClick={() => handleRemoveSegment(seg.id)}
                            className="text-slate-400 hover:text-rose-600 p-1"
                            title="Remover turno"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <textarea
                        value={seg.text}
                        onChange={(e) => handleUpdateSegmentText(seg.id, e.target.value)}
                        placeholder="Fala do interlocutor..."
                        rows={2}
                        className="w-full bg-white/90 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 leading-relaxed focus:ring-1 focus:ring-teal-500"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* ABA 2: SUGESTÕES CLÍNICAS ESTRUTURADAS */}
          {/* ------------------------------------------------------------- */}
          {activeTab === 'suggestions' && (
            <div className="space-y-6">
              {analysisError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{analysisError}</span>
                </div>
              )}

              {/* Filtros de Seção */}
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
                <span className="text-xs font-bold text-slate-700 mr-2">Filtrar Seção:</span>
                {[
                  { key: 'all', label: 'Todas as Sugestões' },
                  { key: 'session', label: 'Sessão & Evolução' },
                  { key: 'anamnesis', label: 'Anamnese' },
                  { key: 'mentalState', label: 'Exame Estado Mental (EEM)' },
                  { key: 'riskAssessment', label: 'Avaliação de Risco' },
                  { key: 'goals', label: 'Metas' }
                ].map(filter => (
                  <button
                    key={filter.key}
                    onClick={() => setSelectedSectionFilter(filter.key as any)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                      selectedSectionFilter === filter.key
                        ? 'bg-teal-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              {/* Card de Resumo da Sessão */}
              {analysisResult?.summary && (
                <div className="bg-teal-50/60 border border-teal-200/80 rounded-xl p-4 text-xs text-teal-950 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-teal-900">
                    <Brain className="w-4 h-4 text-teal-700" />
                    Síntese Clínica da Sessão
                  </div>
                  <p className="leading-relaxed text-slate-700">{analysisResult.summary}</p>
                </div>
              )}

              {/* ========================================================= */}
              {/* SEÇÃO 1: SESSÃO & EVOLUÇÃO */}
              {/* ========================================================= */}
              {(selectedSectionFilter === 'all' || selectedSectionFilter === 'session') && analysisResult?.sections?.session && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-teal-600" />
                      Sessão & Evolução
                    </h3>
                    <button
                      onClick={() => handleApplySection('session')}
                      className="text-xs font-bold text-teal-700 hover:text-teal-800 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200"
                    >
                      Aplicar Seção Sessão & Evolução
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {Object.entries(analysisResult.sections.session).map(([fieldKey, item]) => {
                      if (!item || !item.value) return null;
                      const isSelected = selectedSuggestions[`session.${fieldKey}`] || false;
                      const hasExisting = Boolean(getExistingFieldValue('session', fieldKey));

                      return (
                        <div key={fieldKey} className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <label className="flex items-center gap-2 font-bold text-slate-800 text-xs">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => setSelectedSuggestions(p => ({ ...p, [`session.${fieldKey}`]: e.target.checked }))}
                                className="rounded text-teal-600 focus:ring-teal-500"
                              />
                              {item.label || fieldKey}
                              {hasExisting && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 border border-slate-300">
                                  Já possui conteúdo
                                </span>
                              )}
                            </label>

                            <button
                              onClick={() => handleInitiateApplyField('session', fieldKey, item.label || fieldKey, item.value)}
                              className="px-3 py-1 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors"
                            >
                              Aplicar
                            </button>
                          </div>

                          <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100 whitespace-pre-line">
                            {item.value}
                          </p>

                          {/* Evidência Rastreável */}
                          {item.evidence && item.evidence.length > 0 && (
                            <div className="text-[11px] text-slate-500 bg-slate-100/70 p-2 rounded border border-slate-200/60 space-y-1">
                              <span className="font-semibold text-slate-700">Evidência na Transcrição:</span>
                              {item.evidence.map((ev, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                  <span className="font-mono text-slate-600">[{formatTimestamp(ev.startTime)}]</span>
                                  <span className="font-medium text-slate-800">{ev.role || ev.speaker}:</span>
                                  <span className="italic text-slate-600 truncate max-w-xl">"{ev.text}"</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ========================================================= */}
              {/* SEÇÃO 2: ANAMNESE PSICOLÓGICA */}
              {/* ========================================================= */}
              {(selectedSectionFilter === 'all' || selectedSectionFilter === 'anamnesis') && analysisResult?.sections?.anamnesis && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-teal-600" />
                      Anamnese Psicológica (Apenas Fatos Realmente Mencionados)
                    </h3>
                    <button
                      onClick={() => handleApplySection('anamnesis')}
                      className="text-xs font-bold text-teal-700 hover:text-teal-800 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200"
                    >
                      Aplicar Seção Anamnese
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {Object.entries(analysisResult.sections.anamnesis).map(([fieldKey, item]) => {
                      if (!item || !item.value) return null;
                      const isSelected = selectedSuggestions[`anamnese.${fieldKey}`] || false;
                      const hasExisting = Boolean(getExistingFieldValue('anamnese', fieldKey));

                      return (
                        <div key={fieldKey} className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <label className="flex items-center gap-2 font-bold text-slate-800 text-xs">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => setSelectedSuggestions(p => ({ ...p, [`anamnese.${fieldKey}`]: e.target.checked }))}
                                className="rounded text-teal-600 focus:ring-teal-500"
                              />
                              {item.label || fieldKey}
                              {hasExisting && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 border border-slate-300">
                                  Já possui conteúdo
                                </span>
                              )}
                            </label>

                            <button
                              onClick={() => handleInitiateApplyField('anamnese', fieldKey, item.label || fieldKey, item.value)}
                              className="px-3 py-1 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors"
                            >
                              Aplicar
                            </button>
                          </div>

                          <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100 whitespace-pre-line">
                            {item.value}
                          </p>

                          {item.evidence && item.evidence.length > 0 && (
                            <div className="text-[11px] text-slate-500 bg-slate-100/70 p-2 rounded border border-slate-200/60 space-y-1">
                              <span className="font-semibold text-slate-700">Evidência na Transcrição:</span>
                              {item.evidence.map((ev, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                  <span className="font-mono text-slate-600">[{formatTimestamp(ev.startTime)}]</span>
                                  <span className="font-medium text-slate-800">{ev.role || ev.speaker}:</span>
                                  <span className="italic text-slate-600 truncate max-w-xl">"{ev.text}"</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ========================================================= */}
              {/* SEÇÃO 3: EXAME DO ESTADO MENTAL (EEM) */}
              {/* ========================================================= */}
              {(selectedSectionFilter === 'all' || selectedSectionFilter === 'mentalState') && analysisResult?.sections?.mentalState && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <div>
                      <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                        <Brain className="w-4 h-4 text-teal-600" />
                        Exame do Estado Mental (EEM)
                      </h3>
                      <p className="text-[11px] text-slate-500">Sem suposição de normalidade automática quando não verbalizado.</p>
                    </div>
                    <button
                      onClick={() => handleApplySection('mentalState')}
                      className="text-xs font-bold text-teal-700 hover:text-teal-800 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200"
                    >
                      Aplicar Seção EEM
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {Object.entries(analysisResult.sections.mentalState).map(([fieldKey, item]) => {
                      if (!item || !item.value) return null;
                      const isSelected = selectedSuggestions[`mentalState.${fieldKey}`] || false;
                      const hasExisting = Boolean(getExistingFieldValue('mentalState', fieldKey));

                      return (
                        <div key={fieldKey} className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <label className="flex items-center gap-2 font-bold text-slate-800 text-xs">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => setSelectedSuggestions(p => ({ ...p, [`mentalState.${fieldKey}`]: e.target.checked }))}
                                className="rounded text-teal-600 focus:ring-teal-500"
                              />
                              {item.label || fieldKey}
                              {hasExisting && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 border border-slate-300">
                                  Já possui conteúdo
                                </span>
                              )}
                            </label>

                            <button
                              onClick={() => handleInitiateApplyField('mentalState', fieldKey, item.label || fieldKey, item.value)}
                              className="px-3 py-1 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors"
                            >
                              Aplicar
                            </button>
                          </div>

                          <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100 whitespace-pre-line">
                            {item.value}
                          </p>

                          {item.evidence && item.evidence.length > 0 && (
                            <div className="text-[11px] text-slate-500 bg-slate-100/70 p-2 rounded border border-slate-200/60 space-y-1">
                              <span className="font-semibold text-slate-700">Evidência na Transcrição:</span>
                              {item.evidence.map((ev, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                  <span className="font-mono text-slate-600">[{formatTimestamp(ev.startTime)}]</span>
                                  <span className="font-medium text-slate-800">{ev.role || ev.speaker}:</span>
                                  <span className="italic text-slate-600 truncate max-w-xl">"{ev.text}"</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ========================================================= */}
              {/* SEÇÃO 4: AVALIAÇÃO DE RISCO ESTRUTURADA */}
              {/* ========================================================= */}
              {(selectedSectionFilter === 'all' || selectedSectionFilter === 'riskAssessment') && analysisResult?.sections?.riskAssessment && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-amber-200 pb-2">
                    <div>
                      <h3 className="font-extrabold text-sm text-amber-950 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        Avaliação de Risco Estruturada (Relato Literal)
                      </h3>
                      <p className="text-[11px] text-amber-800 font-semibold">
                        ⚠️ Revisão profissional obrigatória — A IA não calcula escores, níveis ou predições.
                      </p>
                    </div>
                    <button
                      onClick={() => handleApplySection('riskAssessment')}
                      className="text-xs font-bold text-amber-800 hover:text-amber-900 bg-amber-100/80 px-2.5 py-1 rounded-md border border-amber-200"
                    >
                      Aplicar Risco
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {Object.entries(analysisResult.sections.riskAssessment).map(([fieldKey, item]) => {
                      if (!item || !item.value) return null;
                      const isSelected = selectedSuggestions[`riskAssessment.${fieldKey}`] || false;
                      const hasExisting = Boolean(getExistingFieldValue('riskAssessment', fieldKey));

                      return (
                        <div key={fieldKey} className="bg-amber-50/50 border border-amber-200 rounded-xl p-4 shadow-2xs space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <label className="flex items-center gap-2 font-bold text-amber-950 text-xs">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => setSelectedSuggestions(p => ({ ...p, [`riskAssessment.${fieldKey}`]: e.target.checked }))}
                                className="rounded text-amber-600 focus:ring-amber-500"
                              />
                              {item.label || fieldKey}
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-200/80 text-amber-900 font-bold border border-amber-300">
                                Revisão Obrigatória
                              </span>
                              {hasExisting && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-white text-slate-600 border border-slate-300">
                                  Já possui conteúdo
                                </span>
                              )}
                            </label>

                            <button
                              onClick={() => handleInitiateApplyField('riskAssessment', fieldKey, item.label || fieldKey, item.value)}
                              className="px-3 py-1 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg transition-colors"
                            >
                              Aplicar
                            </button>
                          </div>

                          <p className="text-xs text-amber-950 leading-relaxed bg-white p-2.5 rounded-lg border border-amber-200 whitespace-pre-line">
                            {item.value}
                          </p>

                          {item.evidence && item.evidence.length > 0 && (
                            <div className="text-[11px] text-amber-900/80 bg-amber-100/60 p-2 rounded border border-amber-200/80 space-y-1">
                              <span className="font-semibold text-amber-950">Evidência Literal na Transcrição:</span>
                              {item.evidence.map((ev, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                  <span className="font-mono text-amber-800">[{formatTimestamp(ev.startTime)}]</span>
                                  <span className="font-medium text-amber-950">{ev.role || ev.speaker}:</span>
                                  <span className="italic text-amber-900 truncate max-w-xl">"{ev.text}"</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ========================================================= */}
              {/* SEÇÃO 5: METAS TERAPÊUTICAS PACTUADAS */}
              {/* ========================================================= */}
              {(selectedSectionFilter === 'all' || selectedSectionFilter === 'goals') && analysisResult?.sections?.goals && analysisResult.sections.goals.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-teal-600" />
                      Metas Terapêuticas Pactuadas na Sessão
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {analysisResult.sections.goals.map((g, idx) => (
                      <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="font-bold text-slate-800 text-xs block">{g.title}</span>
                            <span className="text-[11px] text-slate-500">Período pactuado: {g.targetPeriod || 'Próxima sessão'}</span>
                          </div>
                          {onApplyGoal && (
                            <button
                              onClick={() => onApplyGoal(g)}
                              className="px-3 py-1 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors"
                            >
                              Adicionar às Metas
                            </button>
                          )}
                        </div>
                        <div className="text-xs text-slate-600 space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          {g.indicator && <div><strong>Indicador:</strong> {g.indicator}</div>}
                          {g.strategy && <div><strong>Estratégia:</strong> {g.strategy}</div>}
                          {g.notes && <div><strong>Observações:</strong> {g.notes}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ================================================================= */}
        {/* MODAL DE RESOLUÇÃO DE CONFLITO (CAMPO JÁ PREENCHIDO) */}
        {/* ================================================================= */}
        {conflictTarget && (
          <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-2xl p-5 shadow-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Split className="w-4 h-4 text-teal-600" />
                  Campo já preenchido: {conflictTarget.label}
                </h4>
                <button
                  onClick={() => setConflictTarget(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="font-semibold text-slate-500 block mb-1">Conteúdo Atual no Prontuário:</span>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 max-h-28 overflow-y-auto whitespace-pre-line">
                    {conflictTarget.currentValue}
                  </div>
                </div>

                <div>
                  <span className="font-semibold text-teal-700 block mb-1">Sugestão da IA (Transcrição):</span>
                  <div className="p-2.5 bg-teal-50/60 border border-teal-200 rounded-lg text-slate-800 max-h-28 overflow-y-auto whitespace-pre-line">
                    {conflictTarget.suggestedValue}
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2 text-xs">
                <button
                  onClick={() => handleResolveConflict('keep')}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                >
                  Manter Atual
                </button>
                <button
                  onClick={() => handleResolveConflict('append')}
                  className="px-3 py-1.5 text-teal-800 bg-teal-100 hover:bg-teal-200 rounded-lg font-bold"
                >
                  Adicionar ao Final
                </button>
                <button
                  onClick={() => handleResolveConflict('replace')}
                  className="px-3 py-1.5 text-white bg-teal-600 hover:bg-teal-700 rounded-lg font-bold shadow-2xs"
                >
                  Substituir
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* RODAPÉ DO MODAL */}
        {/* ================================================================= */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Isolamento seguro de tenant & conformidade de prontuário</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-100 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
