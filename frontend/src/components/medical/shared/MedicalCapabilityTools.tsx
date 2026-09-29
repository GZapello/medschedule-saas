import React, { lazy, Suspense, useState, useMemo } from 'react';
import { PostureGait } from '../../clinical/PostureGait';
import { mergeMedicalRegional } from './medicalRegional';
import { ClinicalScales } from '../../clinical/ClinicalScales';
import { ADLAssessment, emptyAdlItems } from '../../clinical/ADLAssessment';
import {
  Sparkles,
  Scale,
  Headphones,
  Mic,
  FileText,
  CheckSquare,
  Activity,
  HeartPulse,
  Flame,
  Zap,
  Compass,
  Stethoscope,
  X,
  ChevronRight,
  CheckCircle2
} from 'lucide-react';

const Zemda360 = lazy(() => import('../../zemda-body/ZemdaBodyModal').then(m => ({ default: m.ZemdaBodyModal })));
const MedicalBodyMap: React.FC<{
  value: any;
  onSaved: (id: string) => void;
  patientId: string;
  patientName?: string;
  appointmentId?: string;
  onClose: () => void;
}> = ({ value, onSaved, ...props }) => {
  const [assessmentId] = useState<string | undefined>(value?.assessmentId);
  return <Zemda360 {...props} isOpen module="medical" assessmentId={assessmentId} onAssessmentSaved={onSaved} />;
};

const Anthropometry = lazy(() =>
  import('../../zemda-body/AnthropometricAssessmentView').then(m => ({ default: m.AnthropometricAssessmentView }))
);
const Audiology = lazy(() =>
  import('../../speech-therapy/audiology/AudiologyWorkspaceSection').then(m => ({
    default: m.AudiologyWorkspaceSection
  }))
);
const Voice = lazy(() =>
  import('../../speech-therapy/Idv10AssessmentSection').then(m => ({ default: m.Idv10AssessmentSection }))
);
const Regional = lazy(() =>
  import('../../physiotherapy/RegionalPhysioAssessmentModal').then(m => ({ default: m.RegionalPhysioAssessmentModal }))
);

const regions = [
  'Coluna',
  'Ombro',
  'Braço',
  'Cotovelo',
  'Antebraço',
  'Punho',
  'Mão',
  'Quadril',
  'Joelho',
  'Perna',
  'Tornozelo',
  'Pé'
];
const regionalIds = [
  'spine',
  'shoulder',
  'arm',
  'elbow',
  'forearm',
  'wrist',
  'hand',
  'hip',
  'knee',
  'leg',
  'ankle',
  'foot'
];

interface Props {
  capabilities: string[];
  patientId: string;
  patient: any;
  appointmentId?: string;
  value: Record<string, any>;
  onChange: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  saveDraft: () => Promise<boolean>;
}

export const MedicalCapabilityTools: React.FC<Props> = ({
  capabilities,
  patientId,
  patient,
  appointmentId,
  value,
  onChange,
  saveDraft
}) => {
  const [activeTool, setActiveTool] = useState<string>('');
  const [side, setSide] = useState<'right' | 'left' | 'midline'>('right');
  const [region, setRegion] = useState(0);

  const has = (cap: string) => capabilities.includes(cap);
  const update = (key: string, next: any) => onChange(previous => ({ ...previous, [key]: next }));

  const regionalTabs: Array<'pain' | 'adm' | 'strength' | 'tests' | 'palpation'> = useMemo(() => {
    const tabs: Array<'pain' | 'adm' | 'strength' | 'tests' | 'palpation'> = [];
    if (has('PAIN_ASSESSMENT')) tabs.push('pain');
    if (has('MOBILITY_ASSESSMENT')) tabs.push('adm');
    if (has('MUSCLE_STRENGTH')) tabs.push('strength');
    if (has('FUNCTIONAL_TESTS') || has('FUNCTIONAL_ASSESSMENT')) tabs.push('tests');
    if (tabs.length) tabs.push('palpation');
    return tabs;
  }, [capabilities]);

  const regionalKey = regionalIds[region] + '_' + side;

  const updateRegional = (payload: any) => {
    onChange(previous => ({
      ...previous,
      regional: {
        ...previous.regional,
        [regionalKey]: mergeMedicalRegional(previous.regional?.[regionalKey], payload, capabilities)
      }
    }));
  };

  // Definição das ferramentas clínicas suportadas
  interface ToolCardDef {
    id: string;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    isAvailable: boolean;
    isRecorded: boolean;
    recordedBadge?: string;
  }

  const toolCards: ToolCardDef[] = [
    {
      id: 'body',
      label: 'Zemda360',
      description: 'Mapeamento anatômico tridimensional',
      icon: Sparkles,
      color: 'teal',
      isAvailable: has('BODY_MAP'),
      isRecorded: !!value.zemda360?.assessmentId,
      recordedBadge: value.zemda360?.assessmentId ? 'Mapeado' : undefined
    },
    {
      id: 'scales',
      label: 'Escalas Clínicas',
      description: 'Escores padronizados e validados',
      icon: FileText,
      color: 'indigo',
      isAvailable: has('CLINICAL_SCALES'),
      isRecorded: Array.isArray(value.scales) && value.scales.length > 0,
      recordedBadge: Array.isArray(value.scales) && value.scales.length > 0 ? `${value.scales.length} escalas` : undefined
    },
    {
      id: 'pain',
      label: 'Avaliação de Dor',
      description: 'Mapa de dor, EVA e comportamento',
      icon: HeartPulse,
      color: 'rose',
      isAvailable: has('PAIN_ASSESSMENT'),
      isRecorded: !!value.regional && Object.keys(value.regional).some(k => value.regional[k]?.pain_json?.score !== undefined),
      recordedBadge: 'Regional'
    },
    {
      id: 'adm',
      label: 'Mobilidade / ADM',
      description: 'Goniometria e amplitude articular',
      icon: Activity,
      color: 'sky',
      isAvailable: has('MOBILITY_ASSESSMENT'),
      isRecorded: !!value.regional && Object.keys(value.regional).some(k => value.regional[k]?.adm_json?.length > 0),
      recordedBadge: 'Regional'
    },
    {
      id: 'strength',
      label: 'Força Muscular',
      description: 'Graduação Oxford (0 a 5)',
      icon: Zap,
      color: 'amber',
      isAvailable: has('MUSCLE_STRENGTH'),
      isRecorded: !!value.regional && Object.keys(value.regional).some(k => value.regional[k]?.strength_json?.length > 0),
      recordedBadge: 'Regional'
    },
    {
      id: 'tests',
      label: 'Testes Funcionais',
      description: 'Manobras ortopédicas e funcionais',
      icon: Stethoscope,
      color: 'emerald',
      isAvailable: has('FUNCTIONAL_TESTS') || has('FUNCTIONAL_ASSESSMENT'),
      isRecorded: !!value.regional && Object.keys(value.regional).some(k => value.regional[k]?.tests_json?.length > 0),
      recordedBadge: 'Regional'
    },
    {
      id: 'gait',
      label: 'Marcha & Postura',
      description: 'Análise postural estática e dinâmica',
      icon: Compass,
      color: 'purple',
      isAvailable: has('POSTURE_GAIT'),
      isRecorded: !!value.gait?.gaitAnalysis || !!value.gait?.postureAnterior,
      recordedBadge: value.gait?.gaitAnalysis ? 'Registrado' : undefined
    },
    {
      id: 'adl',
      label: 'AVD / AIVD',
      description: 'Atividades da vida diária (Katz / Lawton)',
      icon: CheckSquare,
      color: 'cyan',
      isAvailable: has('ADL_ASSESSMENT'),
      isRecorded: Array.isArray(value.adl) && value.adl.length > 0,
      recordedBadge: Array.isArray(value.adl) && value.adl.length > 0 ? 'Avaliado' : undefined
    },
    {
      id: 'anthro',
      label: 'Antropometria',
      description: 'Medidas corporais e perímetros',
      icon: Scale,
      color: 'teal',
      isAvailable: has('ANTHROPOMETRY') && !has('BODY_COMPOSITION'),
      isRecorded: !!value.anthropometry?.weight || !!value.anthropometry?.height,
      recordedBadge: value.anthropometry?.weight ? 'Registrado' : undefined
    },
    {
      id: 'anthro_comp',
      label: 'Composição Corporal',
      description: 'Antropometria, dobras e bioimpedância',
      icon: Flame,
      color: 'amber',
      isAvailable: has('BODY_COMPOSITION'),
      isRecorded: !!value.anthropometry?.bodyFat || !!value.anthropometry?.weight,
      recordedBadge: value.anthropometry?.bodyFat ? 'Registrado' : undefined
    },
    {
      id: 'audio',
      label: 'Audiologia Clínica',
      description: 'Audiometria e triagem auditiva',
      icon: Headphones,
      color: 'indigo',
      isAvailable: has('AUDIOLOGY'),
      isRecorded: !!value.audiology,
      recordedBadge: value.audiology ? 'Registrado' : undefined
    },
    {
      id: 'voice',
      label: 'Comunicação — IDV-10',
      description: 'Índice de desvantagem vocal',
      icon: Mic,
      color: 'rose',
      isAvailable: has('COMMUNICATION_ASSESSMENT'),
      isRecorded: !!value.voice,
      recordedBadge: value.voice ? 'Registrado' : undefined
    }
  ];

  const availableCards = toolCards.filter(c => c.isAvailable);

  if (availableCards.length === 0) {
    return null;
  }

  const isRegionalTool = (toolId: string) => ['pain', 'adm', 'strength', 'tests', 'regional'].includes(toolId);

  const getToolAllowedTabs = (toolId: string): Array<'pain' | 'adm' | 'strength' | 'tests' | 'palpation'> => {
    if (toolId === 'pain') return ['pain', 'palpation'];
    if (toolId === 'adm') return ['adm'];
    if (toolId === 'strength') return ['strength'];
    if (toolId === 'tests') return ['tests'];
    return regionalTabs;
  };

  return (
    <div className="space-y-4">
      {/* Grid de Cards Pequenos das Ferramentas Complementares */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {availableCards.map(tool => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id || (tool.id === 'anthro_comp' && activeTool === 'anthro');

          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => {
                const targetId = tool.id === 'anthro_comp' ? 'anthro' : tool.id;
                setActiveTool(activeTool === targetId ? '' : targetId);
              }}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 relative ${
                isActive
                  ? 'border-teal-500 bg-teal-50/70 ring-2 ring-teal-500/20 shadow-xs'
                  : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/50 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                    isActive ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </div>

                {tool.recordedBadge && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-teal-100/80 text-teal-800 border border-teal-200">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    <span>{tool.recordedBadge}</span>
                  </span>
                )}
              </div>

              <div>
                <h4 className="text-xs font-black text-slate-800 leading-tight">{tool.label}</h4>
                <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">{tool.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Barra de Seleção Rápida para Ferramentas Regionais */}
      {isRegionalTool(activeTool) && regionalTabs.length > 0 && (
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-150">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Região:</span>
              <select
                value={region}
                onChange={e => setRegion(Number(e.target.value))}
                className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 bg-white outline-none focus:border-teal-500"
              >
                {regions.map((label, i) => (
                  <option key={label} value={i}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Lado:</span>
              <select
                value={side}
                onChange={e => setSide(e.target.value as typeof side)}
                className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 bg-white outline-none focus:border-teal-500"
              >
                <option value="right">Direito</option>
                <option value="left">Esquerdo</option>
                <option value="midline">Linha Média</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTool('regional-open')}
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-teal-600 hover:bg-teal-700 text-white shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>Abrir Avaliação de {regions[region]} ({side === 'right' ? 'Dir.' : side === 'left' ? 'Esq.' : 'Central'})</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTool('')}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition-colors"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Área de Visualização da Ferramenta Ativa */}
      {activeTool && !isRegionalTool(activeTool) && activeTool !== 'regional-open' && (
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                {toolCards.find(c => c.id === activeTool || (activeTool === 'anthro' && c.id === 'anthro_comp'))?.label || 'Ferramenta Complementar'}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setActiveTool('')}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Fechar</span>
            </button>
          </div>

          <Suspense
            fallback={
              <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                <span>Carregando ferramenta clínica...</span>
              </div>
            }
          >
            {activeTool === 'body' && has('BODY_MAP') && (
              <MedicalBodyMap
                value={value.zemda360}
                onSaved={assessmentId => update('zemda360', { assessmentId })}
                onClose={() => setActiveTool('')}
                patientId={patientId}
                patientName={patient?.name}
                appointmentId={appointmentId}
              />
            )}

            {activeTool === 'anthro' && (has('ANTHROPOMETRY') || has('BODY_COMPOSITION')) && (
              <Anthropometry
                showBodyComposition={has('BODY_COMPOSITION')}
                initialDraft={value.anthropometry}
                onDraftChange={next => update('anthropometry', next)}
                measurementsOnly
                patientId={patientId}
                appointmentId={appointmentId}
              />
            )}

            {activeTool === 'audio' && has('AUDIOLOGY') && (
              <Audiology
                initialDraft={value.audiology}
                onDraftChange={next => update('audiology', next)}
                patientId={patientId}
                patient={patient}
              />
            )}

            {activeTool === 'voice' && has('COMMUNICATION_ASSESSMENT') && (
              <Voice
                initialDraft={value.voice}
                onDraftChange={next => update('voice', next)}
                patientId={patientId}
                appointmentId={appointmentId}
              />
            )}

            {activeTool === 'gait' && has('POSTURE_GAIT') && (
              <PostureGait
                postureAnterior={value.gait?.postureAnterior || ''}
                setPostureAnterior={next => update('gait', { ...value.gait, postureAnterior: next })}
                postureLateral={value.gait?.postureLateral || ''}
                setPostureLateral={next => update('gait', { ...value.gait, postureLateral: next })}
                posturePosterior={value.gait?.posturePosterior || ''}
                setPosturePosterior={next => update('gait', { ...value.gait, posturePosterior: next })}
                gaitAnalysis={value.gait?.gaitAnalysis || ''}
                setGaitAnalysis={next => update('gait', { ...value.gait, gaitAnalysis: next })}
              />
            )}

            {activeTool === 'scales' && has('CLINICAL_SCALES') && (
              <ClinicalScales
                scales={Array.isArray(value.scales) ? value.scales.filter((item: any) => item && typeof item === 'object') : []}
                setScales={next => update('scales', next)}
              />
            )}

            {activeTool === 'adl' && has('ADL_ASSESSMENT') && (
              <ADLAssessment
                adlItems={Array.isArray(value.adl) ? value.adl.filter((item: any) => item && typeof item === 'object') : emptyAdlItems()}
                setAdlItems={next => update('adl', next)}
              />
            )}
          </Suspense>
        </div>
      )}

      {/* Modal da Avaliação Regional Aberto */}
      {activeTool === 'regional-open' && regionalTabs.length > 0 && (
        <Suspense fallback={null}>
          <Regional
            key={regionalKey}
            title="Avaliação Clínica Regional"
            isOpen
            clinicalDetails
            lockSide
            side={side}
            allowedTabs={getToolAllowedTabs(activeTool)}
            onClose={() => setActiveTool('')}
            patientId={patientId}
            patientName={patient?.name || ''}
            appointmentId={appointmentId}
            regionId={regionalKey}
            regionLabel={regions[region]}
            initialData={
              value.regional?.[regionalKey] || {
                pain_json: {},
                adm_json: [],
                strength_json: [],
                tests_json: [],
                palpation_json: {},
                edema_json: {},
                functional_scales_json: [],
                plan_link_json: {}
              }
            }
            onDraftChange={updateRegional}
            onSavePayload={async payload => {
              if (!(await saveDraft())) {
                throw new Error('Não foi possível salvar o rascunho. Tente novamente.');
              }
              return payload;
            }}
            onSaved={() => {}}
          />
        </Suspense>
      )}
    </div>
  );
};
