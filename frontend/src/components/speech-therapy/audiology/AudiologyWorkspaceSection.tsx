import React, { useState, useEffect, useMemo } from 'react';
import {
  Ear,
  Shield,
  FileText,
  Clock,
  Printer,
  Save,
  Plus,
  History,
  GitCompare,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  Layers,
  Sparkles,
  HelpCircle,
  Activity,
  Award
} from 'lucide-react';
import { ApiClient } from '../../../api/client';
import { useToast } from '../../../context/ToastContext';
import { useAuth } from '../../../context/AuthContext';
import { InteractiveAudiogram } from '../InteractiveAudiogram';
import { PrintableAudiologyModal } from './PrintableAudiologyModal';
import {
  AudiologyRecordPayload,
  AudiologyModality,
  DegreeCriterion,
  InfantCriterion,
  AudiogramData,
  LossType,
  AudiogramConfiguration,
  TympanometryCurveType,
  InspectionStatus,
  WeberResult,
  AcousticReflexStatus
} from './audiology.types';
import {
  calculateHearingDegree,
  calculateLossType,
  calculateAudiogramConfiguration,
  classifyIPRF,
  analyzeContralateralReflex,
  CONVENTIONAL_FREQUENCIES,
  HIGH_FREQUENCIES
} from './audiology-calculations';

export interface AudiologyWorkspaceSectionProps {
  patientId: string;
  patient: any;
  onRecordSaved?: (recordId: string) => void;
}

const EMPTY_RECORD: AudiologyRecordPayload = {
  schemaVersion: 2,
  modality: 'clinical',
  inspection: {
    odStatus: 'not_evaluated',
    odNotes: '',
    oeStatus: 'not_evaluated',
    oeNotes: ''
  },
  equipment: {
    brand: '',
    model: '',
    calibrationDate: '',
    serialNumber: '',
    transducer: 'supra_aural'
  },
  audiometry: {
    thresholds: [],
    rightAir: {},
    leftAir: {},
    rightBone: {},
    leftBone: {},
    transducer: 'supra_aural'
  },
  classification: {
    degreeCriterion: 'none',
    typeCriterion: 'Silman & Silverman (1997)',
    configurationCriterion: 'Carhart (1945) / Silman & Silverman (1997)',
    suggestedResultOD: '',
    suggestedResultOE: '',
    confirmedResultOD: '',
    confirmedResultOE: '',
    laterality: 'none',
    symmetry: 'none',
    isolatedFrequencies: '',
    finalConclusion: '',
    referenceUsed: '',
    confirmedByProfessional: false,
    confirmedAt: '',
    professionalName: '',
    crfa: ''
  },
  weber: {
    500: 'not_performed',
    1000: 'not_performed',
    2000: 'not_performed',
    3000: 'not_performed',
    4000: 'not_performed'
  },
  speechAudiometry: {
    lrfOD: null,
    lrfOE: null,
    ldvOD: null,
    ldvOE: null,
    iprfOD: null,
    iprfOE: null,
    presentationIntensityOD: null,
    presentationIntensityOE: null,
    maskingOD: null,
    maskingOE: null,
    wordList: 'Monossílabos e Dissílabos foneticamente balanceados',
    notes: '',
    notPerformed: false
  },
  tympanometry: {
    probeFrequency: '226',
    probeFrequencyOther: '',
    right: {
      earCanalVolume: null,
      peakPressure: null,
      compliance: null,
      curveType: '',
      notes: ''
    },
    left: {
      earCanalVolume: null,
      peakPressure: null,
      compliance: null,
      curveType: '',
      notes: ''
    }
  },
  acousticReflexes: {
    ipsiOD: {
      500: { status: 'not_tested', db: null },
      1000: { status: 'not_tested', db: null },
      2000: { status: 'not_tested', db: null },
      4000: { status: 'not_tested', db: null }
    },
    ipsiOE: {
      500: { status: 'not_tested', db: null },
      1000: { status: 'not_tested', db: null },
      2000: { status: 'not_tested', db: null },
      4000: { status: 'not_tested', db: null }
    },
    contraOD: {
      500: { status: 'not_tested', db: null },
      1000: { status: 'not_tested', db: null },
      2000: { status: 'not_tested', db: null },
      4000: { status: 'not_tested', db: null }
    },
    contraOE: {
      500: { status: 'not_tested', db: null },
      1000: { status: 'not_tested', db: null },
      2000: { status: 'not_tested', db: null },
      4000: { status: 'not_tested', db: null }
    }
  },
  pediatric: {
    behavioralObservation: '',
    instrumentalSounds: '',
    speechSounds: '',
    vra: '',
    cpa: '',
    imitanciometry: '',
    eoa: '',
    bera: '',
    numberOfSessions: 1,
    interaction: '',
    speechComprehension: '',
    quantitativeResults: '',
    qualitativeResults: '',
    guidance: '',
    criterion: 'none'
  },
  highFrequency: {
    right: {},
    left: {},
    equipment: '',
    transducer: 'Fone HDA 200 / HDA 300',
    stimulus: 'Tom puro pulsátil',
    criterion: 'Rodríguez-Valiente et al. (2014)',
    notes: ''
  },
  occupational: {
    jobRole: '',
    complementNR7: '',
    notes: ''
  },
  notes: ''
};

export const AudiologyWorkspaceSection: React.FC<AudiologyWorkspaceSectionProps> = ({
  patientId,
  patient,
  onRecordSaved
}) => {
  const { showToast } = useToast();
  const { currentUser, currentTenant } = useAuth();

  // Estado do exame em edição
  const [recordId, setRecordId] = useState<string | null>(null);
  const [examDate, setExamDate] = useState<string>(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  );
  const [record, setRecord] = useState<AudiologyRecordPayload>(() => JSON.parse(JSON.stringify(EMPTY_RECORD)));

  // Sexo canônico do paciente (editável e sincronizável com o cadastro central)
  const [patientGender, setPatientGender] = useState<string>(patient?.gender || 'not_informed');

  // Histórico de exames anteriores salvos
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [comparisonExam, setComparisonExam] = useState<any | null>(null);

  // Estado dos painéis recolhíveis (Accordion UX)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    identification: true,
    inspection: true,
    audiometry: true,
    classification: true,
    weber: false,
    speech: false,
    tympanometry: false,
    reflexes: false,
    pediatric: true,
    highFrequency: true,
    occupational: true,
    result: true
  });

  const toggleSection = (sec: string) => {
    setOpenSections(prev => ({ ...prev, [sec]: !prev[sec] }));
  };

  // Modal de Impressão A4
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // Carrega histórico de exames ao montar ou ao trocar paciente
  const loadHistory = async () => {
    if (!patientId) return;
    try {
      setLoadingHistory(true);
      const res = await ApiClient.get<any[]>(`/v1/speech-therapy/audiology/${patientId}`);
      if (Array.isArray(res)) {
        setHistoryList(res);
      }
    } catch (err) {
      console.warn('Erro ao carregar exames audiológicos:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
    if (patient?.gender) {
      setPatientGender(patient.gender);
    }
  }, [patientId, patient]);

  // Idade calculada do paciente para alerta de lactente (<= 6 meses)
  const patientAgeInMonths = useMemo(() => {
    if (!patient?.birth_date) return null;
    const birth = new Date(patient.birth_date);
    const now = new Date();
    const diffMonths = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
    return diffMonths;
  }, [patient?.birth_date]);

  // Dados do Audiograma para componente InteractiveAudiogram
  const audiogramData: AudiogramData = useMemo(() => ({
    rightAir: record.audiometry.rightAir || {},
    leftAir: record.audiometry.leftAir || {},
    rightBone: record.audiometry.rightBone || {},
    leftBone: record.audiometry.leftBone || {},
    detailedThresholds: record.audiometry.thresholds || []
  }), [record.audiometry]);

  const handleAudiogramChange = (newData: AudiogramData) => {
    setRecord(prev => ({
      ...prev,
      audiometry: {
        ...prev.audiometry,
        rightAir: newData.rightAir,
        leftAir: newData.leftAir,
        rightBone: newData.rightBone,
        leftBone: newData.leftBone,
        thresholds: newData.detailedThresholds || []
      }
    }));
  };

  // Cálculos Clínicos Assistidos baseados nos limiares preenchidos
  const ptaOD = useMemo(
    () => calculateHearingDegree(record.audiometry.rightAir || {}, record.classification.degreeCriterion),
    [record.audiometry.rightAir, record.classification.degreeCriterion]
  );

  const ptaOE = useMemo(
    () => calculateHearingDegree(record.audiometry.leftAir || {}, record.classification.degreeCriterion),
    [record.audiometry.leftAir, record.classification.degreeCriterion]
  );

  const typeOD = useMemo(
    () => calculateLossType(record.audiometry.rightAir || {}, record.audiometry.rightBone || {}),
    [record.audiometry.rightAir, record.audiometry.rightBone]
  );

  const typeOE = useMemo(
    () => calculateLossType(record.audiometry.leftAir || {}, record.audiometry.leftBone || {}),
    [record.audiometry.leftAir, record.audiometry.leftBone]
  );

  const configOD = useMemo(
    () => calculateAudiogramConfiguration(record.audiometry.rightAir || {}),
    [record.audiometry.rightAir]
  );

  const configOE = useMemo(
    () => calculateAudiogramConfiguration(record.audiometry.leftAir || {}),
    [record.audiometry.leftAir]
  );

  // Sugestão textual do resultado (Sem o termo "rebaixamento auditivo", com citação da referência)
  const suggestedConclusion = useMemo(() => {
    const crit = record.classification.degreeCriterion;
    if (crit === 'none') {
      return 'Critério de classificação do grau não selecionado. Selecione uma referência (Lloyd & Kaplan, OMS 2021, BIAP, Davis, etc.) para cálculo assistido.';
    }

    const hasAnyThreshold =
      Object.keys(record.audiometry.rightAir || {}).length > 0 ||
      Object.keys(record.audiometry.leftAir || {}).length > 0;

    if (!hasAnyThreshold) {
      return '';
    }

    // Normalidade bilateral
    const isNormalOD = ptaOD.average !== null && ptaOD.degree.includes('normal') && ptaOD.isolatedAlterations.length === 0;
    const isNormalOE = ptaOE.average !== null && ptaOE.degree.includes('normal') && ptaOE.isolatedAlterations.length === 0;

    if (isNormalOD && isNormalOE) {
      return `Limiares auditivos dentro do padrão de normalidade bilateralmente (${ptaOD.reference}).`;
    }

    const parts: string[] = [];

    // Orelha Direita
    if (ptaOD.average !== null) {
      if (ptaOD.degree.includes('normal') && ptaOD.isolatedAlterations.length === 0) {
        parts.push(`Orelha Direita: ${ptaOD.degree}`);
      } else if (ptaOD.degree.includes('normal') && ptaOD.isolatedAlterations.length > 0) {
        parts.push(`Orelha Direita: Média tonal dentro dos limites da normalidade, com perda auditiva nas frequências isoladas: ${ptaOD.isolatedAlterations.join(', ')} Hz`);
      } else {
        parts.push(`Orelha Direita: ${ptaOD.degree}, ${typeOD.description}, ${configOD.label}`);
      }
    }

    // Orelha Esquerda
    if (ptaOE.average !== null) {
      if (ptaOE.degree.includes('normal') && ptaOE.isolatedAlterations.length === 0) {
        parts.push(`Orelha Esquerda: ${ptaOE.degree}`);
      } else if (ptaOE.degree.includes('normal') && ptaOE.isolatedAlterations.length > 0) {
        parts.push(`Orelha Esquerda: Média tonal dentro dos limites da normalidade, com perda auditiva nas frequências isoladas: ${ptaOE.isolatedAlterations.join(', ')} Hz`);
      } else {
        parts.push(`Orelha Esquerda: ${ptaOE.degree}, ${typeOE.description}, ${configOE.label}`);
      }
    }

    if (parts.length === 0) {
      return 'Limiares parciais para cálculo assistido de grau.';
    }

    return `${parts.join('; ')}. (${ptaOD.reference}, Silman & Silverman 1997).`;
  }, [ptaOD, ptaOE, typeOD, typeOE, configOD, configOE, record.classification.degreeCriterion, record.audiometry]);

  // Aplica sugestão ao resultado final caso o profissional queira
  const handleApplySuggestion = () => {
    setRecord(prev => ({
      ...prev,
      classification: {
        ...prev.classification,
        finalConclusion: suggestedConclusion,
        referenceUsed: ptaOD.reference || 'CFFa (2023)'
      }
    }));
    showToast('Sugestão aplicada no campo de resultado!', 'info');
  };

  // Botão NOVO EXAME (Item 1 e 46) - Abre totalmente VAZIO
  const handleNewExam = () => {
    if (window.confirm('Deseja iniciar uma nova avaliação audiológica? Todos os campos começarão totalmente limpos.')) {
      setRecord(JSON.parse(JSON.stringify(EMPTY_RECORD)));
      setRecordId(null);
      setComparisonExam(null);
      setExamDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()));
      showToast('Nova avaliação audiológica iniciada (vazia)', 'info');
    }
  };

  // Abre exame anterior do histórico (Item 30 e 32)
  const handleOpenHistoricalExam = (item: any) => {
    if (!item.results) {
      showToast('Este exame legado não possui resultados estruturados', 'info');
      return;
    }

    setRecordId(item.id);
    setExamDate(item.exam_date || examDate);

    // Compatibilidade com schemaVersion 1 ou legados
    const res = item.results;
    if (res.schemaVersion === 2) {
      setRecord({
        ...res,
        referredBy: item.referred_by || item.referredBy || res.referredBy || ''
      });
    } else {
      // Reconstrói a partir do modelo legado
      setRecord({
        ...EMPTY_RECORD,
        referredBy: item.referred_by || item.referredBy || '',
        audiometry: {
          ...EMPTY_RECORD.audiometry,
          rightAir: res.audiometry?.rightAir || res.rightAir || {},
          leftAir: res.audiometry?.leftAir || res.leftAir || {},
          rightBone: res.audiometry?.rightBone || res.rightBone || {},
          leftBone: res.audiometry?.leftBone || res.leftBone || {},
          thresholds: res.audiometry?.thresholds || []
        },
        notes: item.notes || ''
      });
    }

    showToast(`Exame de ${item.exam_date} carregado com sucesso`, 'success');
  };

  // Botão USAR EXAME ANTERIOR COMO REFERÊNCIA (Item 30) - Explícito
  const handleCopyFromPrevious = (item: any) => {
    if (!item.results) return;
    if (window.confirm(`Deseja carregar os limiares do exame de ${item.exam_date} como base para a nova avaliação?`)) {
      const res = item.results;
      setRecord(prev => ({
        ...prev,
        audiometry: {
          ...prev.audiometry,
          rightAir: { ...(res.audiometry?.rightAir || res.rightAir || {}) },
          leftAir: { ...(res.audiometry?.leftAir || res.leftAir || {}) },
          rightBone: { ...(res.audiometry?.rightBone || res.rightBone || {}) },
          leftBone: { ...(res.audiometry?.leftBone || res.leftBone || {}) },
          thresholds: [ ...(res.audiometry?.thresholds || []) ]
        }
      }));
      showToast('Limiares anteriores carregados para edição', 'info');
    }
  };

  // Salvar Avaliação Audiológica (Item 31)
  const handleSaveExam = async () => {
    if (!patientId) {
      showToast('Paciente não selecionado', 'error');
      return;
    }

    // Validação da revisão humana obrigatória caso haja conclusão preenchida
    if (record.classification.finalConclusion && !record.classification.confirmedByProfessional) {
      showToast('Por favor, marque a caixa de confirmação da revisão técnica antes de salvar como laudo/resultado oficial.', 'info');
      return;
    }

    try {
      setSaving(true);

      // Sincroniza o sexo no cadastro canônico do paciente se tiver sido alterado (Item 9)
      if (patientGender && patientGender !== patient?.gender) {
        try {
          await ApiClient.put(`/v1/patients/${patientId}`, { gender: patientGender });
        } catch (_) {}
      }

      const payload = {
        id: recordId || undefined,
        patientId,
        examType: record.modality,
        examDate,
        referredBy: record.referredBy || null,
        results: {
          ...record,
          schemaVersion: 2,
          classification: {
            ...record.classification,
            confirmedAt: record.classification.confirmedByProfessional
              ? (record.classification.confirmedAt || new Date().toISOString())
              : '',
            professionalName: record.classification.confirmedByProfessional
              ? (record.classification.professionalName || currentUser?.name || 'Fonoaudiólogo')
              : '',
            crfa: record.classification.confirmedByProfessional
              ? (record.classification.crfa ||
                  (currentUser?.registrationNumber
                    ? `${currentUser.registrationType || 'CRFa'} ${currentUser.registrationNumber}`
                    : ''))
              : '',
            referenceUsed: ptaOD.reference || record.classification.referenceUsed || 'CFFa (2023)'
          }
        },
        notes: record.notes
      };

      const res = await ApiClient.post<any>('/v1/speech-therapy/audiology', payload);
      if (res && res.id) {
        setRecordId(res.id);
        if (onRecordSaved) onRecordSaved(res.id);
      }

      await loadHistory();
      showToast('Avaliação audiológica salva com sucesso!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar avaliação audiológica', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Barra de Ações Rápidas do Módulo de Audiologia */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100 shadow-xs">
            <Ear className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-800">Avaliação Audiológica Especializada</h2>
              <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
                Padrão CFFa 2023
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Audiometria tonal liminar, logoaudiometria e imitanciometria estruturada com histórico longitudinal.
            </p>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleNewExam}
            className="px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-slate-600" />
            <span>Novo Exame</span>
          </button>

          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className={`px-3 py-2 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer ${
              showHistory
                ? 'bg-sky-600 text-white'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Histórico ({historyList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setIsPrintModalOpen(true)}
            className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            <span>Visualizar Ficha / Imprimir</span>
          </button>

          <button
            type="button"
            onClick={handleSaveExam}
            disabled={saving}
            className="px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Salvando...' : 'Salvar Avaliação'}</span>
          </button>
        </div>
      </div>

      {/* HISTÓRICO DE EXAMES (Item 30) */}
      {showHistory && (
        <div className="bg-white rounded-3xl border border-sky-100 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <History className="w-4 h-4 text-sky-600" />
              Exames Audiológicos Anteriores do Paciente
            </h4>
            <span className="text-xs text-slate-400">Total: {historyList.length} registro(s)</span>
          </div>

          {loadingHistory ? (
            <p className="text-xs text-slate-500 py-3">Carregando exames...</p>
          ) : historyList.length === 0 ? (
            <p className="text-xs text-slate-400 py-3">Nenhum exame audiológico registrado para este paciente.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {historyList.map(item => (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-2xl border transition-all text-xs space-y-2 ${
                    recordId === item.id
                      ? 'border-sky-500 bg-sky-50/50 ring-1 ring-sky-500'
                      : 'border-slate-200 bg-slate-50/40 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {new Date(item.exam_date).toLocaleDateString('pt-BR')}
                    </span>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                      {item.exam_type || 'Clínica'}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-600">
                    {item.professional_name ? `Fonoaudiólogo: ${item.professional_name}` : 'Profissional da clínica'}
                  </p>

                  <div className="flex items-center gap-1.5 pt-2 border-t border-slate-200/60">
                    <button
                      type="button"
                      onClick={() => handleOpenHistoricalExam(item)}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      Abrir
                    </button>
                    <button
                      type="button"
                      onClick={() => setComparisonExam(item)}
                      className="px-2.5 py-1 bg-sky-50 text-sky-700 border border-sky-200 rounded-lg text-[11px] font-bold hover:bg-sky-100 cursor-pointer"
                    >
                      Comparar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopyFromPrevious(item)}
                      className="px-2 py-1 text-slate-500 hover:text-slate-800 rounded-lg text-[11px] cursor-pointer"
                      title="Copiar limiares como ponto de partida"
                    >
                      Usar base
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SELETOR DE MODALIDADE (Item 34) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center gap-4">
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Tipo / Modalidade:</span>
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'clinical', label: 'Audiologia Clínica' },
            { id: 'pediatric', label: 'Audiologia Infantil' },
            { id: 'occupational', label: 'Audiologia Ocupacional' },
            { id: 'high_frequency', label: 'Altas Frequências' }
          ].map(mod => (
            <button
              key={mod.id}
              type="button"
              onClick={() => setRecord(prev => ({ ...prev, modality: mod.id as AudiologyModality }))}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                record.modality === mod.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {mod.label}
            </button>
          ))}
        </div>
      </div>

      {/* SEÇÃO 1: FICHA AUDIOLÓGICA & IDENTIFICAÇÃO (Item 9 e 10) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('identification')}
          className="w-full px-6 py-4 flex items-center justify-between bg-slate-50/70 hover:bg-slate-50 border-b border-slate-100 cursor-pointer text-left"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center">
              1
            </span>
            <h3 className="text-sm font-bold text-slate-800">Ficha Audiológica & Equipamento</h3>
          </div>
          {openSections.identification ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {openSections.identification && (
          <div className="p-6 space-y-5">
            {/* Dados Canônicos Buscados Automaticamente do Zemda */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
              <div className="space-y-1">
                <span className="font-bold text-slate-700 block uppercase text-[10px] tracking-wider">Clínica / Estabelecimento</span>
                <p className="font-semibold text-slate-900">{currentTenant?.name || currentTenant?.trade_name || 'Clínica Principal'}</p>
                <p className="text-slate-500">{currentTenant?.address || 'Endereço não cadastrado'}</p>
                <p className="text-slate-500">Telefone: {currentTenant?.phone || currentTenant?.whatsapp || '---'}</p>
              </div>

              <div className="space-y-1">
                <span className="font-bold text-slate-700 block uppercase text-[10px] tracking-wider">Fonoaudiólogo(a) Responsável</span>
                <p className="font-semibold text-slate-900">{currentUser?.name || 'Profissional logado'}</p>
                <p className="text-slate-600 font-medium">
                  {currentUser?.registrationNumber
                    ? `${currentUser.registrationType || 'CRFa'} ${currentUser.registrationNumber}`
                    : 'CRFa em preenchimento'}
                </p>
                <p className="text-slate-500">Email: {currentUser?.email}</p>
              </div>

              <div className="space-y-1">
                <span className="font-bold text-slate-700 block uppercase text-[10px] tracking-wider">Paciente & Exame</span>
                <p className="font-semibold text-slate-900">{patient?.full_name || '---'}</p>
                <p className="text-slate-600">Nascimento: {patient?.birth_date || '---'} | CPF: {patient?.cpf || '---'}</p>
                <div className="flex items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-slate-600">Sexo:</span>
                  <select
                    value={patientGender}
                    onChange={e => setPatientGender(e.target.value)}
                    className="px-2 py-0.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white"
                  >
                    <option value="not_informed">Não informado</option>
                    <option value="F">Feminino</option>
                    <option value="M">Masculino</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
                <div className="pt-2 border-t border-slate-200/60">
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">Encaminhado por (opcional):</label>
                  <input
                    type="text"
                    placeholder="Ex: Dr. Silva (Otorrino), Escola..."
                    value={record.referredBy || ''}
                    onChange={e => setRecord(prev => ({ ...prev, referredBy: e.target.value }))}
                    className="w-full px-2 py-1 rounded-lg border border-slate-300 text-xs bg-white focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Equipamento Utilizado (Item 10) */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Dados Obrigatórios do Equipamento Audiológico
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Marca *</label>
                  <input
                    type="text"
                    value={record.equipment.brand}
                    onChange={e => setRecord({
                      ...record,
                      equipment: { ...record.equipment, brand: e.target.value }
                    })}
                    placeholder="Ex: Interacoustics, Otometrics, Amplivox"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Modelo *</label>
                  <input
                    type="text"
                    value={record.equipment.model}
                    onChange={e => setRecord({
                      ...record,
                      equipment: { ...record.equipment, model: e.target.value }
                    })}
                    placeholder="Ex: AD629, AC40, Madsen Itera"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Data da Calibração *</label>
                  <input
                    type="date"
                    value={record.equipment.calibrationDate}
                    onChange={e => setRecord({
                      ...record,
                      equipment: { ...record.equipment, calibrationDate: e.target.value }
                    })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nº de Série</label>
                  <input
                    type="text"
                    value={record.equipment.serialNumber || ''}
                    onChange={e => setRecord({
                      ...record,
                      equipment: { ...record.equipment, serialNumber: e.target.value }
                    })}
                    placeholder="Opcional"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SEÇÃO 2: INSPEÇÃO DO MEATO ACÚSTICO EXTERNO (Item 11) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('inspection')}
          className="w-full px-6 py-4 flex items-center justify-between bg-slate-50/70 hover:bg-slate-50 border-b border-slate-100 cursor-pointer text-left"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center">
              2
            </span>
            <h3 className="text-sm font-bold text-slate-800">Inspeção do Meato Acústico Externo (Meatoscopia)</h3>
          </div>
          {openSections.inspection ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {openSections.inspection && (
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Orelha Direita (OD) */}
            <div className="p-4 rounded-2xl bg-red-50/40 border border-red-200 space-y-3">
              <span className="font-bold text-xs text-red-900 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" />
                Orelha Direita (OD)
              </span>

              <div className="space-y-1.5 text-xs text-slate-700">
                {[
                  { val: 'no_impediment', label: 'Sem impedimento' },
                  { val: 'alteration', label: 'Alteração' },
                  { val: 'impediment', label: 'Impedimento para realização' },
                  { val: 'not_evaluated', label: 'Não avaliada' }
                ].map(opt => (
                  <label key={opt.val} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="inspection_od"
                      value={opt.val}
                      checked={record.inspection.odStatus === opt.val}
                      onChange={() => setRecord({
                        ...record,
                        inspection: { ...record.inspection, odStatus: opt.val as InspectionStatus }
                      })}
                      className="text-red-600 focus:ring-red-500"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Observações OD</label>
                <input
                  type="text"
                  value={record.inspection.odNotes}
                  onChange={e => setRecord({
                    ...record,
                    inspection: { ...record.inspection, odNotes: e.target.value }
                  })}
                  placeholder="Ex: Cerume parcial sem oclusão, MT íntegra"
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-red-200 bg-white"
                />
              </div>
            </div>

            {/* Orelha Esquerda (OE) */}
            <div className="p-4 rounded-2xl bg-blue-50/40 border border-blue-200 space-y-3">
              <span className="font-bold text-xs text-blue-900 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
                Orelha Esquerda (OE)
              </span>

              <div className="space-y-1.5 text-xs text-slate-700">
                {[
                  { val: 'no_impediment', label: 'Sem impedimento' },
                  { val: 'alteration', label: 'Alteração' },
                  { val: 'impediment', label: 'Impedimento para realização' },
                  { val: 'not_evaluated', label: 'Não avaliada' }
                ].map(opt => (
                  <label key={opt.val} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="inspection_oe"
                      value={opt.val}
                      checked={record.inspection.oeStatus === opt.val}
                      onChange={() => setRecord({
                        ...record,
                        inspection: { ...record.inspection, oeStatus: opt.val as InspectionStatus }
                      })}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Observações OE</label>
                <input
                  type="text"
                  value={record.inspection.oeNotes}
                  onChange={e => setRecord({
                    ...record,
                    inspection: { ...record.inspection, oeNotes: e.target.value }
                  })}
                  placeholder="Ex: MT opaca, sem secreções aparentes"
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-blue-200 bg-white"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SEÇÃO 3: AUDIOMETRIA TONAL LIMINAR (Item 2 a 8) */}
      <div className="space-y-2">
        <InteractiveAudiogram
          data={audiogramData}
          onChange={handleAudiogramChange}
          comparisonData={comparisonExam?.results?.audiometry || null}
          comparisonLabel={comparisonExam ? `Exame de ${new Date(comparisonExam.exam_date).toLocaleDateString('pt-BR')}` : undefined}
        />
      </div>

      {/* SEÇÃO 4: CLASSIFICAÇÃO AUDIOLÓGICA ASSISTIDA (Item 12 a 21) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('classification')}
          className="w-full px-6 py-4 flex items-center justify-between bg-slate-50/70 hover:bg-slate-50 border-b border-slate-100 cursor-pointer text-left"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center">
              4
            </span>
            <h3 className="text-sm font-bold text-slate-800">Classificação Audiológica (Grau, Tipo, Configuração e Simetria)</h3>
          </div>
          {openSections.classification ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {openSections.classification && (
          <div className="p-6 space-y-6">
            {/* Seletor do Critério de Grau (Item 12) - Nenhum selecionado por padrão */}
            <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-2">
              <label className="block text-xs font-bold text-amber-950 uppercase tracking-wider">
                Critério para Classificação do Grau (Obrigatório selecionar)
              </label>
              <select
                value={record.classification.degreeCriterion}
                onChange={e => setRecord({
                  ...record,
                  classification: { ...record.classification, degreeCriterion: e.target.value as DegreeCriterion }
                })}
                className="w-full md:w-80 px-3 py-2 text-xs rounded-xl border border-amber-300 bg-white text-slate-800 font-semibold"
              >
                <option value="none">○ Não selecionado</option>
                <option value="lloyd_kaplan_1978">Lloyd & Kaplan (1978) - Média 500, 1k, 2k Hz</option>
                <option value="oms_2021">OMS (2021) - Média 500, 1k, 2k, 4k Hz</option>
                <option value="biap_1996">BIAP (1996) - Média 500, 1k, 2k, 4k Hz</option>
                <option value="kaplan_gladstone_lloyd_1993">Kaplan, Gladstone & Lloyd (1993) - Média 500, 1k, 2k Hz</option>
                <option value="davis_1970">Davis (1970) - Média 500, 1k, 2k Hz</option>
                <option value="other">Outro critério validado</option>
              </select>
              <p className="text-[11px] text-amber-800">
                O Guia CFFa orienta que a escolha do critério de grau deve ser explícita pelo profissional e que nunca se determina grau de perda por frequência isolada.
              </p>
            </div>

            {/* Painel de Resultados Assistidos por Orelha */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Orelha Direita (OD) */}
              <div className="p-4 rounded-2xl border border-red-200 bg-red-50/30 space-y-3">
                <span className="font-bold text-xs text-red-900 flex items-center justify-between">
                  <span>OD - Média Tritonal / Quadritonal</span>
                  <span className="text-sm font-black">{ptaOD.average !== null ? `${ptaOD.average} dB NA` : '---'}</span>
                </span>
                <p className="text-xs font-semibold text-slate-800">Grau: {ptaOD.degree}</p>
                {ptaOD.isolatedAlterations.length > 0 && (
                  <p className="text-[11px] text-red-700 bg-red-100/60 p-2 rounded-xl">
                    Perda em frequências isoladas fora da média: {ptaOD.isolatedAlterations.join(', ')} Hz.
                  </p>
                )}
                <div className="text-xs text-slate-700 space-y-1 pt-2 border-t border-red-100">
                  <div><b>Tipo sugerido:</b> {typeOD.description}</div>
                  <div><b>Configuração sugerida:</b> {configOD.label}</div>
                </div>
              </div>

              {/* Orelha Esquerda (OE) */}
              <div className="p-4 rounded-2xl border border-blue-200 bg-blue-50/30 space-y-3">
                <span className="font-bold text-xs text-blue-900 flex items-center justify-between">
                  <span>OE - Média Tritonal / Quadritonal</span>
                  <span className="text-sm font-black">{ptaOE.average !== null ? `${ptaOE.average} dB NA` : '---'}</span>
                </span>
                <p className="text-xs font-semibold text-slate-800">Grau: {ptaOE.degree}</p>
                {ptaOE.isolatedAlterations.length > 0 && (
                  <p className="text-[11px] text-blue-700 bg-blue-100/60 p-2 rounded-xl">
                    Perda em frequências isoladas fora da média: {ptaOE.isolatedAlterations.join(', ')} Hz.
                  </p>
                )}
                <div className="text-xs text-slate-700 space-y-1 pt-2 border-t border-blue-100">
                  <div><b>Tipo sugerido:</b> {typeOE.description}</div>
                  <div><b>Configuração sugerida:</b> {configOE.label}</div>
                </div>
              </div>
            </div>

            {/* Lateralidade e Simetria (Item 21) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Lateralidade</label>
                <select
                  value={record.classification.laterality}
                  onChange={e => setRecord({
                    ...record,
                    classification: { ...record.classification, laterality: e.target.value as any }
                  })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="none">Não classificado</option>
                  <option value="unilateral">Unilateral</option>
                  <option value="bilateral">Bilateral</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Simetria</label>
                <select
                  value={record.classification.symmetry}
                  onChange={e => setRecord({
                    ...record,
                    classification: { ...record.classification, symmetry: e.target.value as any }
                  })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="none">Não classificado</option>
                  <option value="symmetric">Simétrica</option>
                  <option value="asymmetric">Assimétrica</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SEÇÃO 5: WEBER AUDIOMÉTRICO (Item 22) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('weber')}
          className="w-full px-6 py-4 flex items-center justify-between bg-slate-50/70 hover:bg-slate-50 border-b border-slate-100 cursor-pointer text-left"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center">
              5
            </span>
            <h3 className="text-sm font-bold text-slate-800">Weber Audiométrico (Persistido Separadamente)</h3>
          </div>
          {openSections.weber ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {openSections.weber && (
          <div className="p-6 space-y-4">
            <p className="text-xs text-slate-500">
              Teste por via óssea na linha média (fronte/vértice) nas frequências de 500 a 4000 Hz.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              {[500, 1000, 2000, 3000, 4000].map(f => (
                <div key={`weber-${f}`} className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="font-bold text-xs text-slate-800 block text-center border-b pb-1">
                    {f} Hz
                  </span>
                  <div className="space-y-1 text-[11px]">
                    {[
                      { val: 'lateralize_right', label: 'Lat. OD' },
                      { val: 'lateralize_left', label: 'Lat. OE' },
                      { val: 'indifferent', label: 'Indiferente' },
                      { val: 'not_performed', label: 'Não realizado' }
                    ].map(opt => (
                      <label key={opt.val} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name={`weber_${f}`}
                          value={opt.val}
                          checked={(record.weber as any)?.[f] === opt.val}
                          onChange={() => setRecord({
                            ...record,
                            weber: { ...record.weber, [f]: opt.val as WeberResult }
                          })}
                          className="text-sky-600 focus:ring-sky-500"
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SEÇÃO 6: LOGOAUDIOMETRIA ESTRUTURADA (Item 23 e 24) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('speech')}
          className="w-full px-6 py-4 flex items-center justify-between bg-slate-50/70 hover:bg-slate-50 border-b border-slate-100 cursor-pointer text-left"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center">
              6
            </span>
            <h3 className="text-sm font-bold text-slate-800">Logoaudiometria Estruturada (LRF, LDV e IPRF)</h3>
          </div>
          {openSections.speech ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {openSections.speech && (
          <div className="p-6 space-y-5">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2 font-bold uppercase">Teste Vocal</th>
                    <th className="py-2 font-bold text-red-600">Orelha Direita (OD)</th>
                    <th className="py-2 font-bold text-blue-600">Orelha Esquerda (OE)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-2.5 font-semibold text-slate-700">LRF (Limiar de Reconhecimento)</td>
                    <td className="py-2.5">
                      <input
                        type="number"
                        placeholder="dB NA"
                        value={record.speechAudiometry.lrfOD ?? ''}
                        onChange={e => setRecord({
                          ...record,
                          speechAudiometry: {
                            ...record.speechAudiometry,
                            lrfOD: e.target.value === '' ? null : Number(e.target.value)
                          }
                        })}
                        className="w-24 px-2 py-1 border rounded-lg border-red-200"
                      />
                    </td>
                    <td className="py-2.5">
                      <input
                        type="number"
                        placeholder="dB NA"
                        value={record.speechAudiometry.lrfOE ?? ''}
                        onChange={e => setRecord({
                          ...record,
                          speechAudiometry: {
                            ...record.speechAudiometry,
                            lrfOE: e.target.value === '' ? null : Number(e.target.value)
                          }
                        })}
                        className="w-24 px-2 py-1 border rounded-lg border-blue-200"
                      />
                    </td>
                  </tr>

                  <tr>
                    <td className="py-2.5 font-semibold text-slate-700">LDV (Detecção de Voz)</td>
                    <td className="py-2.5">
                      <input
                        type="number"
                        placeholder="dB NA"
                        value={record.speechAudiometry.ldvOD ?? ''}
                        onChange={e => setRecord({
                          ...record,
                          speechAudiometry: {
                            ...record.speechAudiometry,
                            ldvOD: e.target.value === '' ? null : Number(e.target.value)
                          }
                        })}
                        className="w-24 px-2 py-1 border rounded-lg border-red-200"
                      />
                    </td>
                    <td className="py-2.5">
                      <input
                        type="number"
                        placeholder="dB NA"
                        value={record.speechAudiometry.ldvOE ?? ''}
                        onChange={e => setRecord({
                          ...record,
                          speechAudiometry: {
                            ...record.speechAudiometry,
                            ldvOE: e.target.value === '' ? null : Number(e.target.value)
                          }
                        })}
                        className="w-24 px-2 py-1 border rounded-lg border-blue-200"
                      />
                    </td>
                  </tr>

                  <tr>
                    <td className="py-2.5 font-semibold text-slate-700">IPRF / IRF (%)</td>
                    <td className="py-2.5">
                      <div className="space-y-1">
                        <input
                          type="number"
                          placeholder="0 a 100%"
                          min="0"
                          max="100"
                          value={record.speechAudiometry.iprfOD ?? ''}
                          onChange={e => setRecord({
                            ...record,
                            speechAudiometry: {
                              ...record.speechAudiometry,
                              iprfOD: e.target.value === '' ? null : Number(e.target.value)
                            }
                          })}
                          className="w-24 px-2 py-1 border rounded-lg border-red-200 font-bold"
                        />
                        <p className="text-[10px] text-slate-500">{classifyIPRF(record.speechAudiometry.iprfOD)}</p>
                      </div>
                    </td>
                    <td className="py-2.5">
                      <div className="space-y-1">
                        <input
                          type="number"
                          placeholder="0 a 100%"
                          min="0"
                          max="100"
                          value={record.speechAudiometry.iprfOE ?? ''}
                          onChange={e => setRecord({
                            ...record,
                            speechAudiometry: {
                              ...record.speechAudiometry,
                              iprfOE: e.target.value === '' ? null : Number(e.target.value)
                            }
                          })}
                          className="w-24 px-2 py-1 border rounded-lg border-blue-200 font-bold"
                        />
                        <p className="text-[10px] text-slate-500">{classifyIPRF(record.speechAudiometry.iprfOE)}</p>
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td className="py-2.5 font-semibold text-slate-700">Intensidade de Apresentação / Mascaramento</td>
                    <td className="py-2.5 flex items-center gap-2">
                      <input
                        type="number"
                        placeholder="Apres. dB"
                        value={record.speechAudiometry.presentationIntensityOD ?? ''}
                        onChange={e => setRecord({
                          ...record,
                          speechAudiometry: {
                            ...record.speechAudiometry,
                            presentationIntensityOD: e.target.value === '' ? null : Number(e.target.value)
                          }
                        })}
                        className="w-20 px-2 py-1 border rounded-lg"
                      />
                      <input
                        type="number"
                        placeholder="Masc. dB"
                        value={record.speechAudiometry.maskingOD ?? ''}
                        onChange={e => setRecord({
                          ...record,
                          speechAudiometry: {
                            ...record.speechAudiometry,
                            maskingOD: e.target.value === '' ? null : Number(e.target.value)
                          }
                        })}
                        className="w-20 px-2 py-1 border rounded-lg"
                      />
                    </td>
                    <td className="py-2.5 flex items-center gap-2">
                      <input
                        type="number"
                        placeholder="Apres. dB"
                        value={record.speechAudiometry.presentationIntensityOE ?? ''}
                        onChange={e => setRecord({
                          ...record,
                          speechAudiometry: {
                            ...record.speechAudiometry,
                            presentationIntensityOE: e.target.value === '' ? null : Number(e.target.value)
                          }
                        })}
                        className="w-20 px-2 py-1 border rounded-lg"
                      />
                      <input
                        type="number"
                        placeholder="Masc. dB"
                        value={record.speechAudiometry.maskingOE ?? ''}
                        onChange={e => setRecord({
                          ...record,
                          speechAudiometry: {
                            ...record.speechAudiometry,
                            maskingOE: e.target.value === '' ? null : Number(e.target.value)
                          }
                        })}
                        className="w-20 px-2 py-1 border rounded-lg"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Material / Lista Utilizada</label>
                <input
                  type="text"
                  value={record.speechAudiometry.wordList || ''}
                  onChange={e => setRecord({
                    ...record,
                    speechAudiometry: { ...record.speechAudiometry, wordList: e.target.value }
                  })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Observações da Logoaudiometria</label>
                <input
                  type="text"
                  value={record.speechAudiometry.notes || ''}
                  onChange={e => setRecord({
                    ...record,
                    speechAudiometry: { ...record.speechAudiometry, notes: e.target.value }
                  })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SEÇÃO 7: IMITANCIOMETRIA / TIMPANOMETRIA (Item 25 e 26) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('tympanometry')}
          className="w-full px-6 py-4 flex items-center justify-between bg-slate-50/70 hover:bg-slate-50 border-b border-slate-100 cursor-pointer text-left"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center">
              7
            </span>
            <h3 className="text-sm font-bold text-slate-800">Imitanciometria / Timpanometria</h3>
          </div>
          {openSections.tympanometry ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {openSections.tympanometry && (
          <div className="p-6 space-y-5">
            {/* Alerta para lactentes <= 6 meses (Item 26) */}
            {patientAgeInMonths !== null && patientAgeInMonths <= 6 && (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <b>Alerta do Guia CFFa (2023):</b> Para lactentes até seis meses, o Guia orienta a utilização de tom de sonda de frequência mais alta, como 1000 Hz.
                </span>
              </div>
            )}

            {/* Frequência da Sonda */}
            <div className="flex items-center gap-4">
              <span className="text-xs font-bold text-slate-700">Frequência da Sonda:</span>
              <div className="flex items-center gap-3 text-xs">
                {['226', '1000', 'other'].map(f => (
                  <label key={f} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="probe_freq"
                      value={f}
                      checked={record.tympanometry.probeFrequency === f}
                      onChange={() => setRecord({
                        ...record,
                        tympanometry: { ...record.tympanometry, probeFrequency: f as any }
                      })}
                      className="text-sky-600 focus:ring-sky-500"
                    />
                    <span>{f === 'other' ? 'Outro' : `${f} Hz`}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Timpanometria OD e OE */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* OD */}
              <div className="p-4 rounded-2xl bg-red-50/40 border border-red-200 space-y-3">
                <span className="font-bold text-xs text-red-900">OD - Orelha Direita</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Volume MAE (ml)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={record.tympanometry.right.earCanalVolume ?? ''}
                      onChange={e => setRecord({
                        ...record,
                        tympanometry: {
                          ...record.tympanometry,
                          right: { ...record.tympanometry.right, earCanalVolume: e.target.value === '' ? null : Number(e.target.value) }
                        }
                      })}
                      className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-red-200 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Pressão do Pico (daPa)</label>
                    <input
                      type="number"
                      value={record.tympanometry.right.peakPressure ?? ''}
                      onChange={e => setRecord({
                        ...record,
                        tympanometry: {
                          ...record.tympanometry,
                          right: { ...record.tympanometry.right, peakPressure: e.target.value === '' ? null : Number(e.target.value) }
                        }
                      })}
                      className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-red-200 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Complacência (ml)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={record.tympanometry.right.compliance ?? ''}
                      onChange={e => setRecord({
                        ...record,
                        tympanometry: {
                          ...record.tympanometry,
                          right: { ...record.tympanometry.right, compliance: e.target.value === '' ? null : Number(e.target.value) }
                        }
                      })}
                      className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-red-200 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Tipo de Curva</label>
                    <select
                      value={record.tympanometry.right.curveType || ''}
                      onChange={e => setRecord({
                        ...record,
                        tympanometry: {
                          ...record.tympanometry,
                          right: { ...record.tympanometry.right, curveType: e.target.value as TympanometryCurveType }
                        }
                      })}
                      className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-red-200 bg-white font-bold"
                    >
                      <option value="">Selecione...</option>
                      <option value="A">Tipo A</option>
                      <option value="As">Tipo As / Ar</option>
                      <option value="Ad">Tipo Ad</option>
                      <option value="B">Tipo B</option>
                      <option value="C">Tipo C</option>
                      <option value="D">Tipo D</option>
                      <option value="P">Tipo P</option>
                      <option value="other">Outro</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* OE */}
              <div className="p-4 rounded-2xl bg-blue-50/40 border border-blue-200 space-y-3">
                <span className="font-bold text-xs text-blue-900">OE - Orelha Esquerda</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Volume MAE (ml)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={record.tympanometry.left.earCanalVolume ?? ''}
                      onChange={e => setRecord({
                        ...record,
                        tympanometry: {
                          ...record.tympanometry,
                          left: { ...record.tympanometry.left, earCanalVolume: e.target.value === '' ? null : Number(e.target.value) }
                        }
                      })}
                      className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-blue-200 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Pressão do Pico (daPa)</label>
                    <input
                      type="number"
                      value={record.tympanometry.left.peakPressure ?? ''}
                      onChange={e => setRecord({
                        ...record,
                        tympanometry: {
                          ...record.tympanometry,
                          left: { ...record.tympanometry.left, peakPressure: e.target.value === '' ? null : Number(e.target.value) }
                        }
                      })}
                      className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-blue-200 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Complacência (ml)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={record.tympanometry.left.compliance ?? ''}
                      onChange={e => setRecord({
                        ...record,
                        tympanometry: {
                          ...record.tympanometry,
                          left: { ...record.tympanometry.left, compliance: e.target.value === '' ? null : Number(e.target.value) }
                        }
                      })}
                      className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-blue-200 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Tipo de Curva</label>
                    <select
                      value={record.tympanometry.left.curveType || ''}
                      onChange={e => setRecord({
                        ...record,
                        tympanometry: {
                          ...record.tympanometry,
                          left: { ...record.tympanometry.left, curveType: e.target.value as TympanometryCurveType }
                        }
                      })}
                      className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-blue-200 bg-white font-bold"
                    >
                      <option value="">Selecione...</option>
                      <option value="A">Tipo A</option>
                      <option value="As">Tipo As / Ar</option>
                      <option value="Ad">Tipo Ad</option>
                      <option value="B">Tipo B</option>
                      <option value="C">Tipo C</option>
                      <option value="D">Tipo D</option>
                      <option value="P">Tipo P</option>
                      <option value="other">Outro</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SEÇÃO 8: REFLEXOS ACÚSTICOS (Item 27) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('reflexes')}
          className="w-full px-6 py-4 flex items-center justify-between bg-slate-50/70 hover:bg-slate-50 border-b border-slate-100 cursor-pointer text-left"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center">
              8
            </span>
            <h3 className="text-sm font-bold text-slate-800">Reflexos Acústicos (Ipsilaterais e Contralaterais)</h3>
          </div>
          {openSections.reflexes ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {openSections.reflexes && (
          <div className="p-6 space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2">Modo</th>
                    {[500, 1000, 2000, 4000].map(f => (
                      <th key={f} className="py-2 text-center">{f} Hz</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* OD Ipsi */}
                  <tr>
                    <td className="py-2 font-bold text-red-600">OD Ipsilateral</td>
                    {[500, 1000, 2000, 4000].map(f => (
                      <td key={`od-ipsi-${f}`} className="py-2 text-center">
                        <input
                          type="number"
                          placeholder="dB"
                          value={record.acousticReflexes.ipsiOD[f]?.db ?? ''}
                          onChange={e => {
                            const val = e.target.value === '' ? null : Number(e.target.value);
                            setRecord({
                              ...record,
                              acousticReflexes: {
                                ...record.acousticReflexes,
                                ipsiOD: {
                                  ...record.acousticReflexes.ipsiOD,
                                  [f]: { status: val !== null ? 'present' : 'not_tested', db: val }
                                }
                              }
                            });
                          }}
                          className="w-16 px-1.5 py-1 text-center border rounded-lg"
                        />
                      </td>
                    ))}
                  </tr>

                  {/* OE Ipsi */}
                  <tr>
                    <td className="py-2 font-bold text-blue-600">OE Ipsilateral</td>
                    {[500, 1000, 2000, 4000].map(f => (
                      <td key={`oe-ipsi-${f}`} className="py-2 text-center">
                        <input
                          type="number"
                          placeholder="dB"
                          value={record.acousticReflexes.ipsiOE[f]?.db ?? ''}
                          onChange={e => {
                            const val = e.target.value === '' ? null : Number(e.target.value);
                            setRecord({
                              ...record,
                              acousticReflexes: {
                                ...record.acousticReflexes,
                                ipsiOE: {
                                  ...record.acousticReflexes.ipsiOE,
                                  [f]: { status: val !== null ? 'present' : 'not_tested', db: val }
                                }
                              }
                            });
                          }}
                          className="w-16 px-1.5 py-1 text-center border rounded-lg"
                        />
                      </td>
                    ))}
                  </tr>

                  {/* OD Contra */}
                  <tr>
                    <td className="py-2 font-bold text-red-700">OD Contralateral</td>
                    {[500, 1000, 2000, 4000].map(f => (
                      <td key={`od-contra-${f}`} className="py-2 text-center">
                        <input
                          type="number"
                          placeholder="dB"
                          value={record.acousticReflexes.contraOD[f]?.db ?? ''}
                          onChange={e => {
                            const val = e.target.value === '' ? null : Number(e.target.value);
                            setRecord({
                              ...record,
                              acousticReflexes: {
                                ...record.acousticReflexes,
                                contraOD: {
                                  ...record.acousticReflexes.contraOD,
                                  [f]: { status: val !== null ? 'present' : 'not_tested', db: val }
                                }
                              }
                            });
                          }}
                          className="w-16 px-1.5 py-1 text-center border rounded-lg"
                        />
                      </td>
                    ))}
                  </tr>

                  {/* OE Contra */}
                  <tr>
                    <td className="py-2 font-bold text-blue-700">OE Contralateral</td>
                    {[500, 1000, 2000, 4000].map(f => (
                      <td key={`oe-contra-${f}`} className="py-2 text-center">
                        <input
                          type="number"
                          placeholder="dB"
                          value={record.acousticReflexes.contraOE[f]?.db ?? ''}
                          onChange={e => {
                            const val = e.target.value === '' ? null : Number(e.target.value);
                            setRecord({
                              ...record,
                              acousticReflexes: {
                                ...record.acousticReflexes,
                                contraOE: {
                                  ...record.acousticReflexes.contraOE,
                                  [f]: { status: val !== null ? 'present' : 'not_tested', db: val }
                                }
                              }
                            });
                          }}
                          className="w-16 px-1.5 py-1 text-center border rounded-lg"
                        />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* SEÇÕES CONDICIONAIS DE MODALIDADE (Item 35, 37, 38) */}
      {/* 9A. Audiologia Infantil / Cross-Check */}
      {record.modality === 'pediatric' && (
        <div className="bg-white rounded-3xl border border-purple-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-purple-100 pb-3">
            <Layers className="w-5 h-5 text-purple-600" />
            <h3 className="text-sm font-bold text-purple-950">
              Avaliação Audiológica Infantil & Princípio de Cross-Check
            </h3>
          </div>

          <div className="p-3 bg-purple-50/50 rounded-2xl border border-purple-100 text-xs text-purple-900">
            A avaliação audiológica infantil deve conjugar múltiplos procedimentos comportamentais, imitanciométricos e eletrofisiológicos (princípio de cross-check).
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Critério Infantil</label>
              <select
                value={record.pediatric?.criterion || 'none'}
                onChange={e => setRecord({
                  ...record,
                  pediatric: { ...record.pediatric, criterion: e.target.value as InfantCriterion }
                })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
              >
                <option value="none">○ Não selecionado</option>
                <option value="northern_downs_2005">Northern & Downs (2005)</option>
                <option value="oms_2020">OMS (2020) Pediátrico</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Nº de Sessões</label>
              <input
                type="number"
                min="1"
                value={record.pediatric?.numberOfSessions || 1}
                onChange={e => setRecord({
                  ...record,
                  pediatric: { ...record.pediatric, numberOfSessions: Number(e.target.value) }
                })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Observação Comportamental & Instrumentais</label>
              <textarea
                rows={2}
                value={record.pediatric?.behavioralObservation || ''}
                onChange={e => setRecord({
                  ...record,
                  pediatric: { ...record.pediatric, behavioralObservation: e.target.value }
                })}
                placeholder="Reação a sons instrumentais (chocalho, sino, agogô)..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Procedimentos Eletrofisiológicos / Triagem (EOA / PEATE)</label>
              <textarea
                rows={2}
                value={record.pediatric?.eoa || ''}
                onChange={e => setRecord({
                  ...record,
                  pediatric: { ...record.pediatric, eoa: e.target.value }
                })}
                placeholder="Registro de emissões otoacústicas evocadas e potenciais auditivos..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>
          </div>
        </div>
      )}

      {/* 9B. Altas Frequências */}
      {record.modality === 'high_frequency' && (
        <div className="bg-white rounded-3xl border border-indigo-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-indigo-100 pb-3">
            <Activity className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-indigo-950">
              Audiometria de Altas Frequências (9 kHz a 20 kHz)
            </h3>
          </div>

          <p className="text-xs text-slate-500">
            Frequências ultrassensíveis para monitoramento de ototoxicidade e zumbido. Sem padronização universal fixa; utilize referência de literatura validada.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Referência Adotada</label>
              <select
                value={record.highFrequency?.criterion || 'Rodríguez-Valiente et al. (2014)'}
                onChange={e => setRecord({
                  ...record,
                  highFrequency: { ...record.highFrequency, criterion: e.target.value }
                })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
              >
                <option value="Rodríguez-Valiente et al. (2014)">Rodríguez-Valiente et al. (2014)</option>
                <option value="outro">Outro critério validado</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Transdutor Específico</label>
              <input
                type="text"
                value={record.highFrequency?.transducer || 'Sennheiser HDA 200 / HDA 300'}
                onChange={e => setRecord({
                  ...record,
                  highFrequency: { ...record.highFrequency, transducer: e.target.value }
                })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="py-2">Orelha</th>
                  {HIGH_FREQUENCIES.map(f => (
                    <th key={f} className="py-2 text-center">{f / 1000}k</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-2 font-bold text-red-600">OD (dB NA)</td>
                  {HIGH_FREQUENCIES.map(f => (
                    <td key={`hf-od-${f}`} className="py-2 text-center">
                      <input
                        type="number"
                        value={record.highFrequency?.right?.[f] ?? ''}
                        onChange={e => setRecord({
                          ...record,
                          highFrequency: {
                            ...record.highFrequency,
                            right: {
                              ...record.highFrequency?.right,
                              [f]: e.target.value === '' ? null : Number(e.target.value)
                            }
                          }
                        })}
                        className="w-14 px-1 py-1 text-center border rounded-lg border-red-200"
                      />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2 font-bold text-blue-600">OE (dB NA)</td>
                  {HIGH_FREQUENCIES.map(f => (
                    <td key={`hf-oe-${f}`} className="py-2 text-center">
                      <input
                        type="number"
                        value={record.highFrequency?.left?.[f] ?? ''}
                        onChange={e => setRecord({
                          ...record,
                          highFrequency: {
                            ...record.highFrequency,
                            left: {
                              ...record.highFrequency?.left,
                              [f]: e.target.value === '' ? null : Number(e.target.value)
                            }
                          }
                        })}
                        className="w-14 px-1 py-1 text-center border rounded-lg border-blue-200"
                      />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 9C. Audiologia Ocupacional */}
      {record.modality === 'occupational' && (
        <div className="bg-white rounded-3xl border border-emerald-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-emerald-100 pb-3">
            <Shield className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-bold text-emerald-950">
              Audiologia Ocupacional (Informações Complementares)
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Função do Trabalhador / Cargo</label>
              <input
                type="text"
                value={record.occupational?.jobRole || ''}
                onChange={e => setRecord({
                  ...record,
                  occupational: { ...record.occupational, jobRole: e.target.value }
                })}
                placeholder="Ex: Operador de Máquinas, Motorista"
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Informações complementares conforme NR-7</label>
              <input
                type="text"
                value={record.occupational?.complementNR7 || ''}
                onChange={e => setRecord({
                  ...record,
                  occupational: { ...record.occupational, complementNR7: e.target.value }
                })}
                placeholder="Tempo de repouso auditivo, tipo de EPI utilizado..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>
          </div>
        </div>
      )}

      {/* SEÇÃO 10: RESULTADO AUDIOLÓGICO & REVISÃO HUMANA OBRIGATÓRIA (Item 28 e 29) */}
      <div className="bg-white rounded-3xl border-2 border-sky-200 p-6 shadow-md space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-sky-600" />
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              Resultado Audiológico & Revisão Humana Obrigatória
            </h3>
          </div>
          {suggestedConclusion && (
            <button
              type="button"
              onClick={handleApplySuggestion}
              className="px-3 py-1.5 text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1"
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-600" />
              <span>Copiar Sugestão Assistida</span>
            </button>
          )}
        </div>

        {/* Sugestão Estruturada do Sistema */}
        {suggestedConclusion && (
          <div className="p-3.5 rounded-2xl bg-sky-50/60 border border-sky-100 text-xs space-y-1">
            <span className="font-bold text-sky-900 block flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-sky-600" />
              Sugestão estruturada pelo Zemda com base nos dados e no critério adotado:
            </span>
            <p className="text-sky-800 italic">{suggestedConclusion}</p>
          </div>
        )}

        {/* Parecer / Conclusão Editável pelo Profissional */}
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Parecer Audiológico Oficial (Editável pelo Fonoaudiólogo) *
          </label>
          <textarea
            rows={4}
            value={record.classification.finalConclusion}
            onChange={e => setRecord({
              ...record,
              classification: { ...record.classification, finalConclusion: e.target.value }
            })}
            placeholder="Descreva aqui o resultado e as considerações audiológicas do exame..."
            className="w-full px-4 py-3 text-xs rounded-2xl border border-slate-200 focus:border-sky-500 font-medium leading-relaxed"
          />
        </div>

        {/* Checkbox Mandatório de Revisão Humana (Item 29) */}
        <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={record.classification.confirmedByProfessional}
              onChange={e => setRecord({
                ...record,
                classification: {
                  ...record.classification,
                  confirmedByProfessional: e.target.checked,
                  confirmedAt: e.target.checked ? new Date().toISOString() : '',
                  professionalName: currentUser?.name || 'Fonoaudiólogo',
                  crfa: currentUser?.registrationNumber
                    ? `${currentUser.registrationType || 'CRFa'} ${currentUser.registrationNumber}`
                    : 'CRFa em preenchimento'
                }
              })}
              className="mt-0.5 w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
            />
            <div className="text-xs text-emerald-950">
              <span className="font-bold block">
                Revisei os dados e confirmo o resultado audiológico como fonoaudiólogo(a) responsável.
              </span>
              <p className="text-[11px] text-emerald-800 mt-0.5">
                Em conformidade com a legislação do Conselho Federal de Fonoaudiologia (CFFa), a emissão do laudo exige validação e responsabilidade profissional humana exclusiva.
              </p>
            </div>
          </label>

          {record.classification.confirmedByProfessional && (
            <div className="pt-2 text-[11px] text-emerald-700 flex flex-wrap items-center gap-4 border-t border-emerald-200/60 font-medium">
              <span>Profissional: <b>{currentUser?.name}</b></span>
              <span>CRFa: <b>{currentUser?.registrationNumber || 'Em cadastro'}</b></span>
              <span>Referência adotada: <b>{ptaOD.reference || 'CFFa 2023'}</b></span>
            </div>
          )}
        </div>
      </div>

      {/* MODAL DE IMPRESSÃO A4 (Item 39) */}
      <PrintableAudiologyModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        record={record}
        patient={{
          full_name: patient?.full_name || 'Paciente',
          birth_date: patient?.birth_date,
          cpf: patient?.cpf,
          gender: patientGender
        }}
        clinic={currentTenant}
        professional={currentUser ? {
          name: currentUser.name,
          registration_type: currentUser.registrationType || 'CRFa',
          registration_number: currentUser.registrationNumber
        } : null}
      />
    </div>
  );
};
